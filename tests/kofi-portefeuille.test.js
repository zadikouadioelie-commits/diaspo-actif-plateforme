/* ===========================================================
   tests/kofi-portefeuille.test.js — KOFFI : LE PORTEFEUILLE UNIQUE EN EUROS (2026-10-31)
   ===========================================================
   Règles vérifiées : un crédit mensuel (0,50 €) offert aux comptes Premium, UNE seule fois par mois civil, non reporté ; pas de crédit mensuel quand la réserve d'IA est basse ;
   débit au coût réel × coefficient ; alerte « crédit bas » / « épuisé » ; recharge 3 € → 1 € d'utilisation (ratio et minimum réglables, bornés, administrateur seul) ;
   compte Officiel (désigné par le réglage « compte_officiel_id » ou le marquage is_official) et administrateurs illimités (ni solde, ni plafond quotidien) alors qu'un compte ordinaire est plafonné.
   Les parcours d'achat (Stripe) sont testés dans kofi-forfait.test.js ; les questions offertes (15) dans kofi-socle.test.js.
   Lancer : node --test tests/kofi-portefeuille.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');
const Kofi = require('../server/kofi');
const PF = Kofi.Portefeuille;

let env;
test.before(async () => {
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofi-portefeuille');
});
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('Koffi portefeuille — mois civil, crédits par type de compte, offres de recharge (fonctions pures)', () => {
  /* Mois civil à l'heure de Paris : le soir du 31 octobre (UTC) est déjà le 1er novembre à Paris. */
  assert.equal(PF.moisParis(new Date('2026-10-31T23:30:00Z')), '2026-11');
  assert.equal(PF.moisParis(new Date('2026-10-31T22:30:00Z')), '2026-10', 'avant minuit à Paris (UTC+1)');
  assert.equal(PF.moisParis(new Date('2026-07-31T22:30:00Z')), '2026-08', 'en été (UTC+2), minuit passé');
  assert.equal(PF.moisSuivant(new Date('2026-10-15T12:00:00Z')), '2026-11-01');
  assert.equal(PF.moisSuivant(new Date('2026-12-15T12:00:00Z')), '2027-01-01', 'passage d\'année');
  /* Crédit mensuel : utilisateur, initiative et collectivité ont chacun leur réglage (0,50 € par défaut). */
  const r = { ...Kofi.DEFAUTS };
  for (const role of ['utilisateur', 'initiative', 'collectivite']) assert.equal(PF.creditMensuel(r, role), 0.5, role);
  const perso = { ...r, credit_mensuel_utilisateur_eur: 0.5, credit_mensuel_initiative_eur: 1, credit_mensuel_collectivite_eur: 2 };
  assert.equal(PF.creditMensuel(perso, 'utilisateur'), 0.5); assert.equal(PF.creditMensuel(perso, 'initiative'), 1); assert.equal(PF.creditMensuel(perso, 'collectivite'), 2);
  /* Recharge : 3 € payés = 1 € d'utilisation ; le minimum et le ratio se règlent. */
  assert.deepEqual(PF.offresRecharge(r), [{ paye_eur: 3, credit_eur: 1 }, { paye_eur: 6, credit_eur: 2 }, { paye_eur: 15, credit_eur: 5 }]);
  assert.deepEqual(PF.offresRecharge({ ...r, recharge_min_eur: 4, recharge_ratio: 2 }), [{ paye_eur: 4, credit_eur: 2 }, { paye_eur: 8, credit_eur: 4 }, { paye_eur: 20, credit_eur: 10 }]);
  /* Illimités par le rôle : administrateur seulement (il n'existe pas de rôle « officiel » : ce compte est désigné par réglage ou marquage, voir plus bas). */
  assert.equal(PF.illimite('administrateur'), true);
  for (const role of ['utilisateur', 'initiative', 'collectivite', 'institutionnel', 'officiel', '', undefined, null]) assert.equal(PF.illimite(role), false, String(role));
  assert.equal(r.compte_officiel_id, 0, 'aucun compte officiel désigné par défaut');
  /* Appel possible : solde suffisant, ou illimité. */
  assert.equal(PF.peutAppeler({ solde_eur: 0 }), false); assert.equal(PF.peutAppeler({ solde_eur: 0.0005 }), false); assert.equal(PF.peutAppeler({ solde_eur: 0.01 }), true);
  assert.equal(PF.peutAppeler({ illimite: true, solde_eur: null }), true); assert.equal(PF.peutAppeler(null), false);
});

test('Koffi portefeuille — parcours complet', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 7);
  const call = env.call;
  const noms = ['Adm', 'A', 'B', 'C', 'D', 'Off', 'Off2', 'E'];
  const jar = {}; for (const n of noms) jar[n] = H.cookieJar();
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const etat = nom => call(jar[nom], 'GET', '/api/kofi/annuaire/etat');
  const pfGeneral = nom => call(jar[nom], 'GET', '/api/kofi/portefeuille');   /* ouvert à tout compte, Premium ou non */
  const dire = (nom, texte) => call(jar[nom], 'POST', '/api/kofi/annuaire/messages', { texte: texte || 'KW:zorbium' + rnd });
  const lots = nom => sql('select * from kofi_solde where user_id=? order by id', uid(nom));
  const solde = nom => sql('select COALESCE(SUM(montant_restant),0) n from kofi_solde where user_id=?', uid(nom))[0].n;
  const reglage = async (cle, valeur) => call(jar.Adm, 'PUT', '/api/admin/kofi/reglages', { [cle]: valeur });
  const moisCourant = PF.moisParis();

  await t.test('setup — comptes Premium, réserve IA', async () => {
    await H.creerFormateur(env, jar.Adm, rnd, 'Adm');
    for (const n of noms) if (n !== 'Adm') await H.creerApprenant(env, jar[n], rnd, n);
    assert.equal((await call(jar.Adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
    for (const n of ['A', 'B', 'C', 'D']) H.ordinariser(env, rnd, n);
    /* Off : compte Officiel marqué is_official (illimité), sans abonnement ; Off2 : désigné plus tard par le réglage ; majorité confirmée. E : Premium, pour le plafond quotidien. */
    for (const n of ['Off', 'Off2']) { sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", uid(n)); sql('DELETE FROM user_accreditations WHERE user_id=?', uid(n)); sql("INSERT OR IGNORE INTO kofi_majorite (user_id, confirme_le, version) VALUES (?, datetime('now'), 'test')", uid(n)); }
    sql("UPDATE users SET is_official=1 WHERE id=?", uid('Off'));
    H.ordinariser(env, rnd, 'E');
    assert.equal((await call(jar.Adm, 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
  });

  await t.test('crédit mensuel : créé à la première visite, 0,50 €, UNE seule fois par mois civil, quel que soit le nombre de visites', async () => {
    assert.equal(lots('A').length, 0, 'rien tant que le compte n\'a pas ouvert Koffi');
    const e = await etat('A');
    assert.equal(e.data.portefeuille.type, 'euros'); assert.equal(e.data.portefeuille.premium, true); assert.equal(e.data.portefeuille.solde_eur, 0.5); assert.equal(e.data.portefeuille.mensuel_eur, 0.5);
    assert.equal(e.data.portefeuille.renouvelle_le, PF.moisSuivant()); assert.equal(e.data.portefeuille.offertes, null);
    await Promise.all([etat('A'), etat('A'), etat('A'), etat('A')]);   /* visites simultanées : l'index unique protège */
    const l = lots('A'); assert.equal(l.length, 1, 'un seul lot'); assert.equal(l[0].origine, 'mensuel'); assert.equal(l[0].mois, moisCourant); assert.equal(l[0].montant_total, 0.5);
    assert.deepEqual(Object.keys(e.data.portefeuille.equivalent).sort(), ['annuaire', 'createur', 'eleve']);
    assert.ok(e.data.portefeuille.equivalent.annuaire > 100, 'quelques centaines d\'échanges pour 0,50 €');
  });

  await t.test('pas de report : un reste du mois passé ne sert plus et n\'ajoute rien ; le nouveau mois donne un crédit neuf', async () => {
    const l0 = lots('A')[0];
    sql("UPDATE kofi_solde SET mois='2026-01', montant_restant=0.3 WHERE id=?", l0.id);     /* le mois dernier, il restait 0,30 € */
    const e = await etat('A');
    assert.equal(e.data.portefeuille.solde_eur, 0.5, 'crédit neuf de 0,50 €, sans les 0,30 € d\'avant');
    const l = lots('A'); assert.equal(l.length, 2); assert.equal(l.filter(x => x.mois === moisCourant).length, 1);
    assert.equal(l.find(x => x.id === l0.id).montant_restant, 0.3, 'l\'ancien lot reste en base (historique) mais ne sert plus');
  });

  await t.test('un compte sans Premium ne reçoit aucun crédit mensuel ; il en reçoit un s\'il le devient', async () => {
    sql("UPDATE user_accreditations SET statut='expiree', date_expiration=datetime('now','-1 day') WHERE user_id=?", uid('D'));
    const e = await pfGeneral('D');
    assert.equal(e.status, 200, JSON.stringify(e.data));
    assert.equal(e.data.portefeuille.premium, false); assert.equal(e.data.portefeuille.mensuel_eur, 0); assert.equal(e.data.portefeuille.solde_eur, 0);
    assert.equal(lots('D').length, 0);
    assert.equal((await etat('D')).data.etat, 'premium_requis', 'le conseiller de l\'Annuaire reste fermé');
    sql("UPDATE user_accreditations SET statut='active', date_expiration=datetime('now','+30 day') WHERE user_id=?", uid('D'));
    assert.equal((await pfGeneral('D')).data.portefeuille.solde_eur, 0.5);
  });

  await t.test('réserve d\'IA basse (< 2 €) : aucun NOUVEAU crédit mensuel offert ; dès que la réserve remonte, il est accordé', async () => {
    assert.equal((await call(jar.Adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: -8.5, type: 'ajustement', note: 'test' })).status, 201);
    const e = await etat('B');
    assert.equal(e.data.portefeuille.reserve_basse, true); assert.equal(e.data.portefeuille.solde_eur, 0); assert.equal(lots('B').length, 0);
    assert.equal(e.data.etat, 'recharge');
    assert.equal((await call(jar.Adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 8.5, type: 'ajustement', note: 'test' })).status, 201);
    assert.equal((await etat('B')).data.portefeuille.solde_eur, 0.5);
  });

  await t.test('débit au coût réel × coefficient ; alerte « crédit bas » puis « épuisé » ; un solde épuisé refuse (402) sans toucher à l\'IA', async () => {
    const avant = solde('B');
    let r = await dire('B'); assert.equal(r.status, 200, JSON.stringify(r.data));
    const u = sql('select * from kofi_usage where user_id=? order by id desc limit 1', uid('B'))[0];
    assert.equal(u.categorie, 'annuaire_mensuel'); assert.ok(u.cout_eur > 0);
    assert.ok(Math.abs((avant - solde('B')) - u.cout_eur) < 1e-6, 'coefficient 1 : débit = coût réel');
    /* Coefficient 10 (l'administration peut majorer pour couvrir ses frais) : débit = 10 × le coût réel. */
    assert.equal((await reglage('coefficient_cout', 10)).status, 200);
    const avant2 = solde('B'); r = await dire('B'); assert.equal(r.status, 200);
    const u2 = sql('select * from kofi_usage where user_id=? order by id desc limit 1', uid('B'))[0];
    assert.ok(Math.abs((avant2 - solde('B')) - 10 * u2.cout_eur) < 1e-6, 'coefficient 10 : débit = 10 × coût réel');
    assert.equal((await reglage('coefficient_cout', 1)).status, 200);
    /* Alerte : bas ≤ 20 % du crédit mensuel (0,10 €), épuisé en dessous du seuil d'appel. */
    sql("UPDATE kofi_solde SET montant_restant=0.08 WHERE user_id=?", uid('B'));
    let p = (await etat('B')).data.portefeuille; assert.equal(p.bas, true); assert.equal(p.epuise, false);
    sql("UPDATE kofi_solde SET montant_restant=0.3 WHERE user_id=?", uid('B'));
    p = (await etat('B')).data.portefeuille; assert.equal(p.bas, false);
    sql("UPDATE kofi_solde SET montant_restant=0.0004 WHERE user_id=?", uid('B'));
    const e = await etat('B'); assert.equal(e.data.portefeuille.epuise, true); assert.equal(e.data.etat, 'recharge');
    const nbUsage = sql('select count(*) n from kofi_usage where user_id=?', uid('B'))[0].n;
    r = await dire('B'); assert.equal(r.status, 402); assert.equal(r.data.code, 'credits_epuises');
    assert.equal(sql('select count(*) n from kofi_usage where user_id=?', uid('B'))[0].n, nbUsage, 'aucun appel, aucune ligne d\'usage');
  });

  await t.test('réglages : crédit mensuel modifiable (nouveaux comptes), minimum et ratio de recharge bornés, administrateur seul', async () => {
    assert.equal((await call(jar.A, 'PUT', '/api/admin/kofi/reglages', { credit_mensuel_utilisateur_eur: 5 })).status, 403, 'un compte ordinaire ne touche pas aux réglages');
    for (const [cle, val] of [['credit_mensuel_utilisateur_eur', -1], ['credit_mensuel_initiative_eur', 101], ['recharge_min_eur', 0.1], ['recharge_ratio', 0], ['recharge_ratio', 101], ['coefficient_cout', 0], ['alerte_solde_pct', 0], ['credit_mensuel_collectivite_eur', 'beaucoup']]) {
      const x = await reglage(cle, val); assert.equal(x.status, 400, `${cle}=${val} : ${JSON.stringify(x.data)}`);
    }
    assert.equal((await reglage('credit_mensuel_utilisateur_eur', 1)).status, 200);
    assert.equal((await etat('C')).data.portefeuille.solde_eur, 1, 'un compte qui ouvre Koffi ce mois-ci reçoit le nouveau montant');
    assert.equal((await etat('A')).data.portefeuille.mensuel_eur, 1, 'le montant annoncé suit le réglage');
    assert.equal((await reglage('credit_mensuel_utilisateur_eur', 0.5)).status, 200);
    /* Recharge : l'offre suit le minimum et le ratio ; un montant de l'ancienne offre est refusé. */
    assert.equal((await reglage('recharge_min_eur', 4)).status, 200); assert.equal((await reglage('recharge_ratio', 2)).status, 200);
    const p = (await etat('A')).data.portefeuille;
    assert.deepEqual(p.recharge.offres.map(o => [o.paye_eur, o.credit_eur]), [[4, 2], [8, 4], [20, 10]]); assert.equal(p.recharge.min_eur, 4);
    const r = await call(jar.A, 'POST', '/api/kofi/portefeuille/recharger', { montant_eur: 3, accepte_non_remboursable: true });
    assert.equal(r.status, 400); assert.equal(r.data.code, 'montant_invalide');
    assert.equal((await reglage('recharge_min_eur', 3)).status, 200); assert.equal((await reglage('recharge_ratio', 3)).status, 200);
    /* Le point d'entrée commun du portefeuille (tous les écrans Koffi) renvoie la même chose. */
    const g = await call(jar.A, 'GET', '/api/kofi/portefeuille');
    assert.equal(g.status, 200, JSON.stringify(g.data)); assert.equal(g.data.portefeuille.type, 'euros'); assert.deepEqual(g.data.portefeuille.recharge.offres.map(o => o.paye_eur), [3, 6, 15]);
    assert.equal((await call(H.cookieJar(), 'GET', '/api/kofi/portefeuille')).status, 401);
  });

  await t.test('Officiel (marqué) et administrateur : illimités — aucun lot, aucun débit ; un compte ordinaire est, lui, plafonné chaque jour', async () => {
    for (const nom of ['Off', 'Adm']) {
      const e = await etat(nom);
      assert.equal(e.data.etat, 'utilisable', nom); assert.equal(e.data.portefeuille.type, 'illimite'); assert.equal(e.data.portefeuille.illimite, true); assert.equal(e.data.portefeuille.solde_eur, null);
      assert.equal(e.data.portefeuille.epuise, false);
    }
    /* Plafond quotidien (anti-abus) : 60 échanges ; le compte Officiel passe outre, le compte ordinaire non. */
    for (let i = 0; i < 61; i++) {
      sql("INSERT INTO kofi_usage (user_id, formation_id, categorie, jetons_entree, jetons_sortie, cout_eur, modele) VALUES (?,?,?,?,?,?,?)", uid('Off'), 0, 'annuaire_illimite', 1, 1, 0, 'x');
      sql("INSERT INTO kofi_usage (user_id, formation_id, categorie, jetons_entree, jetons_sortie, cout_eur, modele) VALUES (?,?,?,?,?,?,?)", uid('E'), 0, 'annuaire_mensuel', 1, 1, 0, 'x');
    }
    let r = await dire('Off'); assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(sql('select categorie from kofi_usage where user_id=? order by id desc limit 1', uid('Off'))[0].categorie, 'annuaire_illimite');
    r = await dire('Adm'); assert.equal(r.status, 200, JSON.stringify(r.data));
    r = await dire('E'); assert.equal(r.status, 429); assert.equal(r.data.code, 'plafond_jour');
    assert.equal(sql('select count(*) n from kofi_solde where user_id in (?,?)', uid('Off'), uid('Adm'))[0].n, 0, 'aucun lot de crédit pour les comptes illimités');
    /* Le portefeuille général (tuteur, assistant, tous les écrans) dit la même chose. */
    assert.equal((await pfGeneral('Off')).data.portefeuille.illimite, true);
    /* Un compte ordinaire n'est PAS illimité : même sans rôle spécial, aucune confusion avec le compte officiel. */
    assert.notEqual((await pfGeneral('A')).data.portefeuille.type, 'illimite');
  });

  await t.test('compte officiel désigné par le RÉGLAGE « compte_officiel_id » (en production aucun compte n\'est marqué) : illimité tant que le réglage le désigne', async () => {
    assert.notEqual((await pfGeneral('Off2')).data.portefeuille.type, 'illimite', 'avant désignation : compte ordinaire sans Premium');
    assert.equal((await reglage('compte_officiel_id', uid('Off2'))).status, 200);
    let p = (await pfGeneral('Off2')).data.portefeuille; assert.equal(p.type, 'illimite'); assert.equal(p.illimite, true);
    const r = await dire('Off2'); assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(sql('select categorie from kofi_usage where user_id=? order by id desc limit 1', uid('Off2'))[0].categorie, 'annuaire_illimite');
    assert.equal(lots('Off2').length, 0);
    /* Le réglage est borné (entier positif) et réservé à l'administration ; 0 = personne. */
    assert.equal((await reglage('compte_officiel_id', -5)).status, 400);
    assert.equal((await call(jar.A, 'PUT', '/api/admin/kofi/reglages', { compte_officiel_id: uid('A') })).status, 403, 'un compte ordinaire ne peut pas se désigner lui-même');
    assert.equal((await reglage('compte_officiel_id', 0)).status, 200);
    assert.notEqual((await pfGeneral('Off2')).data.portefeuille.type, 'illimite');
    assert.equal((await pfGeneral('Off')).data.portefeuille.illimite, true, 'le marquage is_official continue de compter');
  });

  await t.test('« Que sais-tu faire ? » ne passe jamais par le portefeuille, même vide, même sans Premium', async () => {
    sql("UPDATE kofi_solde SET montant_restant=0 WHERE user_id=?", uid('C'));
    const nb = sql('select count(*) n from kofi_usage where user_id=?', uid('C'))[0].n;
    const r = await dire('C', 'Que sais-tu faire ?');
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.message.gratuit, true);
    assert.equal(sql('select count(*) n from kofi_usage where user_id=?', uid('C'))[0].n, nb); assert.equal(solde('C'), 0);
    assert.match(r.data.message.contenu, /0,50 €/); assert.match(r.data.message.contenu, /3 € payés = 1 € d'utilisation/);
  });
});
