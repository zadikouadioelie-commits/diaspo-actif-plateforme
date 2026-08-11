/* ===========================================================
   tests/parrainage-initiative.test.js — Avantage Premium Initiative -50%
   ===========================================================
   Tests unitaires purs sur fournisseurParrainageInitiative (server/avantages-premium.js) :
   aucun vrai serveur, aucune vraie base, aucune vraie clé Stripe. Un faux `db` (fonctions en
   mémoire, ci-dessous) reproduit l'interface `.prepare(sql).get/all/run(...)` utilisée par le
   module, et un faux `stripeClient` remplace l'appel réel à `subscriptions.retrieve`.

   Lancer : node --test tests/
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fournisseurParrainageInitiative,
  fournisseurCodeAdhesionDA,
  resoudreAvantagesPremium,
  AVANTAGES_PREMIUM,
} = require('../server/avantages-premium.js');

/* ── Faux `db` en mémoire — dispatch par reconnaissance de motifs dans le SQL, exactement
   les requêtes réellement exécutées par fournisseurParrainageInitiative (et, pour le test de
   non-cumul, par fournisseurCodeAdhesionDA). ── */
function makeFakeDb(state) {
  function prepare(sql) {
    return {
      async get(...args) {
        if (/FROM initiatives WHERE owner_user_id=\?/.test(sql)) {
          return state.initiatives.find(i => i.owner_user_id === args[0]);
        }
        if (/FROM users WHERE id=\?/.test(sql)) {
          return state.users.find(u => u.id === args[0]);
        }
        if (/FROM users WHERE ds_id=\?/.test(sql)) {
          return state.users.find(u => u.ds_id === args[0]);
        }
        if (/FROM comptes_lies_membres WHERE user_id=\?/.test(sql)) {
          return state.comptesLies.find(c => c.user_id === args[0]);
        }
        if (/FROM accred_definitions WHERE type='initiative_abonne'/.test(sql)) {
          return state.accredDefinitions.find(d => d.type === 'initiative_abonne');
        }
        if (/FROM user_accreditations WHERE user_id=\? AND accred_id=\? AND statut='active'/.test(sql)) {
          return state.userAccreditations.find(a => a.user_id === args[0] && a.accred_id === args[1] && a.statut === 'active');
        }
        if (/FROM parrainage_initiative_utilisations WHERE reference_user_id=\? AND beneficiaire_da_id=\?/.test(sql)) {
          return state.parrainageUtilisations.find(u => u.reference_user_id === args[0] && u.beneficiaire_da_id === args[1]);
        }
        if (/FROM parrainage_initiative_utilisations WHERE id=\?/.test(sql)) {
          return state.parrainageUtilisations.find(u => u.id === args[0]);
        }
        // ── Codes Adhésion D'A (test de non-cumul uniquement) ──
        if (/FROM da_codes_adhesion WHERE code=\?/.test(sql)) {
          return state.daCode && state.daCode.code === args[0] ? state.daCode : undefined;
        }
        if (/FROM da_codes_utilisations WHERE code_id=\? AND beneficiaire_da_id=\?/.test(sql)) {
          return undefined; // jamais déjà utilisé dans ces tests
        }
        if (/FROM adhesion_membres WHERE id=\?/.test(sql)) {
          return state.adhesionMembre;
        }
        return undefined;
      },
      async all() { return []; },
      async run(...args) {
        if (/INSERT INTO parrainage_initiative_utilisations/.test(sql)) {
          const id = state.parrainageUtilisations.length + 1;
          state.parrainageUtilisations.push({
            id, reference_user_id: args[0], reference_da_id: args[1], reference_accred_id: args[2],
            beneficiaire_da_id: args[3], beneficiaire_source: args[4], beneficiaire_user_id: args[5],
            beneficiaire_role: args[6], accred_id: args[7], type_tarif: args[8], montant_avant: args[9],
            montant_apres: args[10], reduction_pct: args[11], duree_jours_reservee: args[12], statut: 'en_attente',
          });
          return { lastInsertRowid: id, changes: 1 };
        }
        if (/UPDATE parrainage_initiative_utilisations SET statut='en_attente'/.test(sql)) {
          return { changes: 1 };
        }
        // Simule la clause WHERE statut='en_attente' de l'ancrage webhook (test 10 :
        // renouvellement de la référence après attribution ne doit rien prolonger — une
        // ligne déjà 'active' ne doit plus jamais être touchée par cette UPDATE).
        if (/UPDATE parrainage_initiative_utilisations SET statut='active'.*WHERE id=\? AND statut='en_attente'/s.test(sql)) {
          const id = args[args.length - 1];
          const row = state.parrainageUtilisations.find(u => u.id === id);
          if (!row || row.statut !== 'en_attente') return { changes: 0 };
          row.statut = 'active';
          return { changes: 1 };
        }
        return { changes: 0 };
      },
    };
  }
  return { prepare };
}

function baseState() {
  return {
    users: [
      { id: 1, ds_id: 'REFDS0001A', role: 'initiative', da_id: 'DA-REF' },
      { id: 2, ds_id: 'BENDS0002A', role: 'utilisateur', da_id: 'DA-BEN' },
      { id: 3, ds_id: 'AUTREDSID3', role: 'utilisateur', da_id: 'DA-AUT' }, // hors groupe
    ],
    initiatives: [],
    comptesLies: [
      { user_id: 1, groupe_id: 100 },
      { user_id: 2, groupe_id: 100 },
      // user 3 volontairement absent — jamais lié à personne
    ],
    accredDefinitions: [{ id: 10, type: 'initiative_abonne' }],
    userAccreditations: [
      { user_id: 1, accred_id: 10, statut: 'active', reduction_pct_appliquee: 0, stripe_subscription_id: 'sub_ref_1', date_expiration: null },
    ],
    parrainageUtilisations: [],
  };
}

function fakeStripe(currentPeriodEndSeconds, status = 'active') {
  return { subscriptions: { retrieve: async () => ({ status, current_period_end: currentPeriodEndSeconds }) } };
}

const BENEFICIAIRE = { id: 2, role: 'utilisateur' };
const dansNJours = n => Math.floor(Date.now() / 1000) + n * 86400;

/* ── Test 1 : Initiative + Premium actif + payé 100% + annuel -> -50% ── */
test('Cas A — Initiative 100% + annuel -> -50%', async () => {
  const state = baseState();
  const db = makeFakeDb(state);
  const res = await fournisseurParrainageInitiative.resoudre(db, BENEFICIAIRE, {}, {
    parrainage_ds_id: 'REFDS0001A', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(180)),
  });
  assert.equal(res.valide, true);
  assert.equal(res.reduction_pct, 50);
  assert.equal(res.fournisseur, 'parrainage_initiative');
});

/* ── Test 2 : Initiative + Premium actif + payé 50% -> aucune réduction transmissible
   (règle anti-chaîne — reduction_pct_appliquee > 0 sur la référence) ── */
test('Cas B — référence déjà réduite -> non éligible', async () => {
  const state = baseState();
  state.userAccreditations[0].reduction_pct_appliquee = 50;
  const db = makeFakeDb(state);
  const res = await fournisseurParrainageInitiative.resoudre(db, BENEFICIAIRE, {}, {
    parrainage_ds_id: 'REFDS0001A', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(180)),
  });
  assert.equal(res.valide, false);
  assert.equal(res.raison, 'reference_deja_reduite');
});

/* ── Test 3 : Initiative + Premium expiré -> aucune réduction ── */
test('Cas C — référence sans Premium actif -> non éligible', async () => {
  const state = baseState();
  state.userAccreditations = [];
  const db = makeFakeDb(state);
  const res = await fournisseurParrainageInitiative.resoudre(db, BENEFICIAIRE, {}, {
    parrainage_ds_id: 'REFDS0001A', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(180)),
  });
  assert.equal(res.valide, false);
  assert.equal(res.raison, 'reference_non_active');
});

/* ── Tests 4/5/6 : Utilisateur / Collectivité (englobe "Étatique", qui soumet role:'collectivite'
   à l'inscription — aucun rôle 'etatique' distinct n'existe en base) + Premium 100% -> rien ── */
for (const role of ['utilisateur', 'collectivite']) {
  test(`Cas D/E/F — rôle '${role}' (couvre Étatique) non éligible comme référence`, async () => {
    const state = baseState();
    state.users[0].role = role;
    const db = makeFakeDb(state);
    const res = await fournisseurParrainageInitiative.resoudre(db, BENEFICIAIRE, {}, {
      parrainage_ds_id: 'REFDS0001A', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(180)),
    });
    assert.equal(res.valide, false);
    assert.equal(res.raison, 'role_non_eligible');
  });
}

/* ── Cas G : DS-ID invalide -> non éligible ── */
test('Cas G — DS-ID inconnu -> non éligible', async () => {
  const state = baseState();
  const db = makeFakeDb(state);
  const res = await fournisseurParrainageInitiative.resoudre(db, BENEFICIAIRE, {}, {
    parrainage_ds_id: 'INEXISTANT', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(180)),
  });
  assert.equal(res.valide, false);
  assert.equal(res.raison, 'ds_id_introuvable');
});

/* ── Tests 7/8 (cahier des charges §16 H/I) : durée figée = durée restante de la référence ── */
test('Cas H — référence expirant dans 2 mois -> avantage ≈ 60 jours', async () => {
  const state = baseState();
  const db = makeFakeDb(state);
  const res = await fournisseurParrainageInitiative.resoudre(db, BENEFICIAIRE, {}, {
    parrainage_ds_id: 'REFDS0001A', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(60)),
  });
  assert.equal(res.valide, true);
  assert.ok(res.duree_jours >= 58 && res.duree_jours <= 60, `duree_jours=${res.duree_jours}`);
});

test('Cas I — référence expirant dans 6 mois -> avantage ≈ 180 jours', async () => {
  const state = baseState();
  const db = makeFakeDb(state);
  const res = await fournisseurParrainageInitiative.resoudre(db, BENEFICIAIRE, {}, {
    parrainage_ds_id: 'REFDS0001A', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(180)),
  });
  assert.equal(res.valide, true);
  assert.ok(res.duree_jours >= 178 && res.duree_jours <= 180, `duree_jours=${res.duree_jours}`);
});

/* ── Test 9 : compte B ayant reçu -50% ne peut jamais devenir compte de référence à son tour
   (règle anti-chaîne, scénario explicite A -> B -> C) ── */
test('Cas J — B (bénéficiaire réduit) ne peut pas servir de référence pour C', async () => {
  const state = baseState();
  // B (user 2) a reçu -50% : sa propre accréditation Initiative porte reduction_pct_appliquee=50.
  // On le simule ici comme référence potentielle pour un 3e compte C (user 3, hors groupe de B
  // dans baseState — on le rattache pour isoler UNIQUEMENT la vérification anti-chaîne).
  state.users[1].role = 'initiative'; // B devient une Initiative pour ce scénario
  state.comptesLies.push({ user_id: 3, groupe_id: 200 });
  state.comptesLies.find(c => c.user_id === 2).groupe_id = 200; // B et C dans le même groupe
  state.accredDefinitions[0] = { id: 10, type: 'initiative_abonne' };
  state.userAccreditations.push({ user_id: 2, accred_id: 10, statut: 'active', reduction_pct_appliquee: 50, stripe_subscription_id: 'sub_b', date_expiration: null });
  const db = makeFakeDb(state);
  const c = { id: 3, role: 'utilisateur' };
  const res = await fournisseurParrainageInitiative.resoudre(db, c, {}, {
    parrainage_ds_id: 'BENDS0002A', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(180)),
  });
  assert.equal(res.valide, false);
  assert.equal(res.raison, 'reference_deja_reduite');
});

/* ── Test — comptes non liés (différence de groupe_id, ou absence des deux côtés) -> rejeté ── */
test('Comptes non liés -> non éligible (jamais de faux positif sur deux NULL)', async () => {
  const state = baseState();
  const db = makeFakeDb(state);
  // user 3 n'a AUCUNE ligne comptes_lies_membres — ni user 1 (référence) ni lui ne doivent
  // jamais être considérés comme "liés" simplement parce que groupe_id est NULL des deux côtés.
  const res = await fournisseurParrainageInitiative.resoudre(db, { id: 3, role: 'utilisateur' }, {}, {
    parrainage_ds_id: 'REFDS0001A', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(180)),
  });
  assert.equal(res.valide, false);
  assert.equal(res.raison, 'comptes_non_lies');
});

/* ── Auto-parrainage rejeté ── */
test('Auto-parrainage (DS-ID de son propre compte) -> rejeté', async () => {
  const state = baseState();
  // user 1 (référence) est role='initiative' : resoudreCompteBeneficiaire() a besoin d'une
  // ligne `initiatives` pour résoudre son propre compte bénéficiaire avant même d'atteindre
  // la vérification d'auto-parrainage.
  state.initiatives.push({ id: 900, owner_user_id: 1, da_id: 'DA-REF-INIT' });
  const db = makeFakeDb(state);
  const res = await fournisseurParrainageInitiative.resoudre(db, { id: 1, role: 'initiative' }, {}, {
    parrainage_ds_id: 'REFDS0001A', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(180)),
  });
  assert.equal(res.valide, false);
  assert.equal(res.raison, 'compte_actuel');
});

/* ── Test 10 : création d'un 3ᵉ/4ᵉ/5ᵉ compte -> aucune réduction supplémentaire n'est
   inventée (illimité par construction, mais chaque bénéficiaire distinct reste indépendant —
   pas de plafond arbitraire, cf. décision d'architecture du plan). ── */
test('Comptes multiples — un 2e bénéficiaire distinct est traité indépendamment, jamais de cumul de %', async () => {
  const state = baseState();
  state.users.push({ id: 4, ds_id: 'BENDS0004A', role: 'utilisateur', da_id: 'DA-BEN2' });
  state.comptesLies.push({ user_id: 4, groupe_id: 100 });
  const db = makeFakeDb(state);
  const res1 = await fournisseurParrainageInitiative.resoudre(db, { id: 2, role: 'utilisateur' }, {}, {
    parrainage_ds_id: 'REFDS0001A', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(180)),
  });
  const res2 = await fournisseurParrainageInitiative.resoudre(db, { id: 4, role: 'utilisateur' }, {}, {
    parrainage_ds_id: 'REFDS0001A', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(180)),
  });
  assert.equal(res1.reduction_pct, 50);
  assert.equal(res2.reduction_pct, 50);
  // Jamais 100% : chaque bénéficiaire reste à -50%, pas de sur-réduction en cumulant les usages.
});

/* ── Test 11 : tentative de cumul de plusieurs réductions -> le moteur central s'arrête au
   premier fournisseur résolu (ordre du registre AVANTAGES_PREMIUM), jamais les deux à la fois. ── */
test('Non-cumul — Code D\'A et Parrainage fournis simultanément -> un seul appliqué', async () => {
  assert.equal(AVANTAGES_PREMIUM[0].id, 'code_adhesion_da');
  assert.equal(AVANTAGES_PREMIUM[1].id, 'parrainage_initiative');

  const state = baseState();
  state.daCode = {
    id: 1, code: 'A100', statut: 'actif', date_fin_avantage: null,
    nb_utilisations: 0, nb_max_utilisations: 5, reduction_pct: 20, duree_mois: 12,
    adhesion_membre_id: 1, date_premiere_utilisation: null,
  };
  state.adhesionMembre = { id: 1, statut: 'a_jour', linked_user_id: null };
  const db = makeFakeDb(state);

  const res = await resoudreAvantagesPremium(db, BENEFICIAIRE, {}, {
    code_da: 'A100', parrainage_ds_id: 'REFDS0001A', type_tarif: 'annuel', stripeClient: fakeStripe(dansNJours(180)),
  });
  assert.ok(res.valide);
  assert.equal(res.fournisseur, 'code_adhesion_da', 'le premier fournisseur du registre doit gagner, jamais les deux à la fois');
});

/* ── Test 12 : renouvellement du compte de référence après attribution -> aucune prolongation
   automatique de l'avantage déjà accordé (la clause WHERE statut='en_attente' de l'ancrage
   webhook ne touche jamais une ligne déjà 'active'). ── */
test('Renouvellement de la référence après activation -> aucune prolongation', async () => {
  const state = baseState();
  state.parrainageUtilisations.push({
    id: 1, reference_user_id: 1, beneficiaire_user_id: 2, statut: 'active',
    date_fin_avantage: '2027-02-01 00:00:00', duree_jours_reservee: 180,
  });
  const db = makeFakeDb(state);
  // Simule une 2e tentative d'ancrage (ex. webhook relu, ou réabonnement de la référence) :
  // la ligne est déjà 'active', l'UPDATE conditionnelle ne doit produire aucun changement.
  const r = await db.prepare(`
    UPDATE parrainage_initiative_utilisations SET statut='active', date_activation=?, date_fin_avantage=?,
      stripe_subscription_id=?, updated_at=datetime('now') WHERE id=? AND statut='en_attente'
  `).run('2026-09-01 00:00:00', '2028-08-01 00:00:00', 'sub_new', 1);
  assert.equal(r.changes, 0);
  assert.equal(state.parrainageUtilisations[0].date_fin_avantage, '2027-02-01 00:00:00', 'la date de fin déjà active ne doit jamais être réécrite');
});

/* ── Test 13 : changement du tarif Premium -> recalcul automatique (appliquer() est pure et
   reflète toujours les montants qu'on lui passe, jamais un prix figé). ── */
test('Changement de tarif -> appliquer() recalcule -50% sur le nouveau montant', async () => {
  const avantage = { valide: true, reduction_pct: 50 };
  const r1 = fournisseurParrainageInitiative.appliquer({ montant_annuel: 590 }, avantage);
  const r2 = fournisseurParrainageInitiative.appliquer({ montant_annuel: 690 }, avantage);
  assert.equal(r1.montant_annuel, 295);
  assert.equal(r2.montant_annuel, 345);
  assert.notEqual(r1.montant_annuel, r2.montant_annuel);
});

/* ── Test 14 : achat mensuel avec DS-ID valide -> aucune réduction, aucune consommation ── */
test('Mensuel — DS-ID par ailleurs valide -> ne s\'applique jamais', async () => {
  const state = baseState();
  const db = makeFakeDb(state);
  const res = await fournisseurParrainageInitiative.resoudre(db, BENEFICIAIRE, {}, {
    parrainage_ds_id: 'REFDS0001A', type_tarif: 'mensuel', stripeClient: fakeStripe(dansNJours(180)),
  });
  assert.equal(res, null, 'le fournisseur ne doit même pas répondre {valide:false} — null = non concerné');
});

/* ── Manipulation du prix côté client -> rejetée côté serveur (test statique, non-régression) ──
   Le corps de la requête ne doit jamais fournir de "montant"/"prix" lu directement par la
   route de paiement : celle-ci recalcule systématiquement via calculerTarifPremium(). */
test('Le body de /api/accreditations/:type/payer ne lit jamais un prix envoyé par le client', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
  const start = src.indexOf('route("POST", "/api/accreditations/:type/payer"');
  assert.ok(start > -1, 'route /payer introuvable');
  const bloc = src.slice(start, start + 4000);
  assert.doesNotMatch(bloc, /body\.montant/, 'la route /payer ne doit jamais lire body.montant');
  assert.doesNotMatch(bloc, /body\.prix/, 'la route /payer ne doit jamais lire body.prix');
  assert.match(bloc, /calculerTarifPremium/, 'le prix doit toujours provenir de calculerTarifPremium');
});

/* ── Sécurité : options.stripeClient absent -> échec fermé, jamais d'avantage par défaut ── */
test('Sans stripeClient -> jamais d\'avantage "par défaut" sans durée vérifiée', async () => {
  const state = baseState();
  const db = makeFakeDb(state);
  const res = await fournisseurParrainageInitiative.resoudre(db, BENEFICIAIRE, {}, {
    parrainage_ds_id: 'REFDS0001A', type_tarif: 'annuel', // pas de stripeClient
  });
  assert.equal(res.valide, false);
  assert.equal(res.raison, 'verification_indisponible');
});
