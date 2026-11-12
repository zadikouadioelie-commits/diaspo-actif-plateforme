/* ===========================================================
   tests/boutique-events.test.js — Lot E1 (2026-11-12) : boutique « Créateur d'événements » — modèle de modules et profil
   ===========================================================
   1. Module seul : le profil « organisateur / prestataire / les deux » est un raccourci sur les modules (rien d'autre n'est enregistré).
   2. Le modèle du type « events » reprend les rubriques retenues ; les anciens types ne changent pas.
   3. Vrai serveur sur une COPIE de la base de dev : le réglage n'existe que pour un compte propriétaire, une boutique « events »
      et l'interrupteur des 6 types allumé ; la publication le rend visible du public.
   Lancer : node --test tests/boutique-events.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');
const EV = require('../server/boutique-events');
const BT = require('../server/boutique-types');

/* ═════════════ 1. Le module seul ═════════════ */
const etat = (liste) => Object.fromEntries(liste.map(([k, a, o]) => [k, { actif: a, ordre: o === undefined ? 1 : o }]));

test('E1 le profil se déduit de l\'état des modules', () => {
  assert.equal(EV.profilDe(etat([['evenements', true], ['services', true]])), 'les_deux');
  assert.equal(EV.profilDe(etat([['evenements', true], ['services', false]])), 'organisateur');
  assert.equal(EV.profilDe(etat([['evenements', false], ['services', true]])), 'prestataire');
  assert.equal(EV.profilDe(etat([['evenements', false], ['services', false]])), null);
  assert.equal(EV.profilDe({}), null);
  assert.equal(EV.profilDe(null), null);
});

test('E1 appliquer un profil ne touche qu\'aux événements, aux prestations et aux demandes de devis', () => {
  const avant = etat([['evenements', true], ['services', true], ['demande_devis', true], ['avis', true, 5], ['galerie_photos', false, 7], ['contact', true, 2]]);
  const copie = JSON.parse(JSON.stringify(avant));
  const r = EV.appliquerProfil(avant, 'organisateur');
  assert.deepEqual(avant, copie, 'l\'état d\'origine n\'est jamais modifié');
  assert.equal(r.modules.evenements.actif, true);
  assert.equal(r.modules.services.actif, false);
  assert.equal(r.modules.demande_devis.actif, false);
  for (const k of ['avis', 'galerie_photos', 'contact']) assert.deepEqual(r.modules[k], avant[k], `${k} doit rester tel quel (y compris son ordre)`);
  assert.equal(EV.profilDe(r.modules), 'organisateur');

  const p = EV.appliquerProfil(r.modules, 'prestataire');
  assert.equal(p.modules.evenements.actif, false);
  assert.equal(p.modules.services.actif, true);
  assert.equal(p.modules.demande_devis.actif, true);
  assert.equal(p.modules.services.ordre, avant.services.ordre, 'l\'ordre d\'un module est conservé');
  assert.equal(EV.profilDe(p.modules), 'prestataire');

  const d = EV.appliquerProfil(p.modules, 'les_deux');
  assert.equal(EV.profilDe(d.modules), 'les_deux');
  assert.equal(d.modules.demande_devis.actif, true);
});

test('E1 un profil inconnu est refusé, sans aucune clé héritée de l\'objet', () => {
  for (const mauvais of ['admin', '', null, undefined, 42, 'constructor', '__proto__', 'toString']) {
    const r = EV.appliquerProfil(etat([['evenements', true]]), mauvais);
    assert.ok(r.erreur, `« ${String(mauvais)} » doit être refusé`);
    assert.equal(r.modules, undefined);
  }
});

test('E1 les trois profils sont décrits pour l\'écran, sans émoticône', () => {
  assert.deepEqual(EV.PROFILS_POUR_INTERFACE.map((p) => p.cle), ['organisateur', 'prestataire', 'les_deux']);
  for (const p of EV.PROFILS_POUR_INTERFACE) {
    assert.ok(p.label && p.desc);
    assert.doesNotMatch(p.label + p.desc, /\p{Extended_Pictographic}/u);
  }
});

/* ═════════════ 2. Le modèle du type « events » ═════════════ */
test('E1 le modèle « events » reprend les rubriques retenues ; les anciens types ne changent pas', () => {
  const tousLesModules = Object.fromEntries([...EV.MODULES_EVENTS.actifs, ...EV.MODULES_EVENTS.optionnels].map((k) => [k, {}]));
  const templates = {
    commercial: { label: 'ancien', actifs: ['a_propos'], optionnels: [] },
    evenement: { label: 'ancien', actifs: ['a_propos', 'contact'], optionnels: ['produits'] },
    projet: { label: 'ancien', actifs: ['a_propos'], optionnels: [] },
    video: { label: 'ancien', actifs: [], optionnels: [] },
    portfolio: { label: 'ancien', actifs: [], optionnels: [] },
  };
  const copie = JSON.parse(JSON.stringify(templates));
  BT.ajouterTemplatesV2(templates, tousLesModules);
  for (const k of ['commercial', 'evenement', 'projet']) assert.deepEqual(templates[k], copie[k], `${k} a été modifié`);
  /* Vidéo et Portfolio gardent leurs modules : le registre ne leur ajoute que le libellé du nouvel écran. */
  for (const k of ['video', 'portfolio']) { assert.deepEqual(templates[k].actifs, copie[k].actifs); assert.deepEqual(templates[k].optionnels, copie[k].optionnels); }
  const e = templates.events;
  assert.equal(e.v2, true);
  for (const k of ['evenements', 'services', 'realisations', 'avis', 'demande_devis', 'demande_partenariat', 'contact']) assert.ok(e.actifs.includes(k), `${k} fait partie des rubriques de l'accueil`);
  assert.ok(!e.actifs.includes('newsletter'), 'la newsletter reste éteinte par défaut : le propriétaire l\'active lui-même');
  assert.ok(e.optionnels.includes('newsletter'));
  assert.ok(!e.actifs.some((k) => /depot|soumission|financement_participatif/.test(k)), 'aucun module de dépôt de projet (lot F)');
  /* Un module absent du registre est écarté plutôt que de casser la boutique. */
  const t2 = { evenement: { actifs: [], optionnels: [] } };
  BT.ajouterTemplatesV2(t2, { evenements: {}, services: {} });
  assert.deepEqual(t2.events.actifs.sort(), ['evenements', 'services']);
});

test('E1 tous les modules du modèle existent dans le registre réel de la vitrine', async () => {
  const env = await H.demarrer('boutique-events-registre');
  try {
    const r = await env.call(null, 'GET', '/api/vitrine-modules-registry');
    assert.equal(r.status, 200);
    for (const k of [...EV.MODULES_EVENTS.actifs, ...EV.MODULES_EVENTS.optionnels]) assert.ok(r.data.modules[k], `le module « ${k} » est inconnu du registre`);
    assert.ok(!r.data.socle.includes('newsletter'));
  } finally { env.stop(); }
});

/* ═════════════ 3. Le serveur ═════════════ */
let env, jarAdmin, jarA, jarB, idA, idCommercial, bd;
const run = (req, ...a) => bd.prepare(req).run(...a);
const lire = (req, ...a) => bd.prepare(req).get(...a);
const draft = (id, jar, corps) => env.call(jar, 'PUT', `/api/initiatives/${id}/vitrine-draft`, corps);

test.before(async () => {
  env = await H.demarrer('boutique-events');
  bd = new H.DatabaseSync(env.dbPath);
  bd.exec('PRAGMA busy_timeout = 5000');
  const rnd = Math.random().toString(36).slice(2, 8);
  jarAdmin = H.cookieJar(); jarA = H.cookieJar(); jarB = H.cookieJar();
  await H.creerFormateur(env, jarAdmin, rnd, 'AdminEv');
  const a = await H.creerApprenant(env, jarA, rnd, 'OrgaA');
  await H.creerApprenant(env, jarB, rnd, 'OrgaB');
  const uidA = lire('SELECT id FROM users WHERE email=?', a.email).id;
  idA = Number(run("INSERT INTO initiatives (nom, boutique_nom, owner_user_id, vitrine_type) VALUES ('Interne', 'Festival Diaspora', ?, 'commercial')", uidA).lastInsertRowid);
  idCommercial = Number(run("INSERT INTO initiatives (nom, owner_user_id, vitrine_type) VALUES ('Autre boutique', ?, 'commercial')", uidA).lastInsertRowid);
});
test.after(() => { try { bd && bd.close(); } catch (e) {} env && env.stop(); });

test('E1 le réglage est refusé tant que l\'interrupteur des 6 types est éteint', async () => {
  const r = await draft(idA, jarA, { profil_evenements: 'organisateur' });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.equal((await env.call(jarAdmin, 'PUT', '/api/admin/boutique-types-v2', { actif: true })).status, 200);
});

test('E1 le registre annonce les trois profils', async () => {
  const r = await env.call(jarA, 'GET', '/api/vitrine-modules-registry');
  assert.deepEqual(r.data.types_v2.profils_evenements.map((p) => p.cle), ['organisateur', 'prestataire', 'les_deux']);
});

test('E1 le réglage ne concerne qu\'une boutique « Créateur d\'événements »', async () => {
  const r = await draft(idCommercial, jarA, { profil_evenements: 'organisateur' });
  assert.equal(r.status, 400, 'une boutique de vente n\'a pas ce réglage');
  assert.match(r.data.error, /Créateur d'événements/);
});

test('E1 choisir « Créateur d\'événements » active les rubriques du modèle, sans la newsletter', async () => {
  const r = await draft(idA, jarA, { type: 'events' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const m = r.data.draft.modules;
  for (const k of ['evenements', 'services', 'realisations', 'avis', 'demande_devis', 'contact']) assert.equal(m[k].actif, true, `${k} doit être actif`);
  assert.equal(m.newsletter.actif, false);
  assert.equal(EV.profilDe(m), 'les_deux', 'par défaut : organisateur ET prestataire');
});

test('E1 organisateur / prestataire / les deux : seules les rubriques concernées changent', async () => {
  const avant = (await draft(idA, jarA, {})).data.draft.modules;
  const org = await draft(idA, jarA, { profil_evenements: 'organisateur' });
  assert.equal(org.status, 200, JSON.stringify(org.data));
  assert.equal(org.data.draft.modules.evenements.actif, true);
  assert.equal(org.data.draft.modules.services.actif, false);
  assert.equal(org.data.draft.modules.demande_devis.actif, false);
  for (const k of Object.keys(avant)) {
    if (['evenements', 'services', 'demande_devis'].includes(k)) continue;
    assert.deepEqual(org.data.draft.modules[k], avant[k], `${k} ne doit pas bouger`);
  }
  const pre = await draft(idA, jarA, { profil_evenements: 'prestataire' });
  assert.equal(pre.data.draft.modules.evenements.actif, false);
  assert.equal(pre.data.draft.modules.services.actif, true);
  const deux = await draft(idA, jarA, { profil_evenements: 'les_deux' });
  assert.equal(EV.profilDe(deux.data.draft.modules), 'les_deux');
});

test('E1 un profil inconnu est refusé et le brouillon reste intact', async () => {
  const avant = (await draft(idA, jarA, {})).data.draft.modules;
  for (const mauvais of ['admin', '', 'constructor', 42]) {
    const r = await draft(idA, jarA, { profil_evenements: mauvais });
    assert.equal(r.status, 400, `« ${mauvais} » doit être refusé`);
  }
  assert.deepEqual((await draft(idA, jarA, {})).data.draft.modules, avant);
});

test('E1 seul le propriétaire règle le profil', async () => {
  assert.equal((await draft(idA, jarB, { profil_evenements: 'prestataire' })).status, 403);
  assert.equal((await draft(idA, null, { profil_evenements: 'prestataire' })).status, 401);
});

test('E1 le profil n\'est visible du public qu\'après « Publier »', async () => {
  await draft(idA, jarA, { profil_evenements: 'organisateur' });
  const avant = await env.call(null, 'GET', `/api/initiatives/${idA}`);
  assert.notEqual(EV.profilDe(avant.data.initiative.vitrine_modules_state), 'organisateur', 'rien de public avant « Publier »');
  const pub = await env.call(jarA, 'POST', `/api/initiatives/${idA}/vitrine-publish`);
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  const apres = await env.call(null, 'GET', `/api/initiatives/${idA}`);
  assert.equal(EV.profilDe(apres.data.initiative.vitrine_modules_state), 'organisateur');
  assert.equal(lire('SELECT vitrine_type AS t FROM initiatives WHERE id=?', idA).t, 'events');
});
