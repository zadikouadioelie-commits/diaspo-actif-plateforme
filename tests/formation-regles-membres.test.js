/* ===========================================================
   tests/formation-regles-membres.test.js — tarifs réservés aux membres d'une initiative (2026-10-31)
   ===========================================================
   Règle = « les personnes affiliées à l'initiative X ont −N % (ou la gratuité) ». Automatique (aucun code), vérifiée côté serveur
   (affiliation ACCEPTÉE et non échue), jamais cumulée : la meilleure offre s'applique. Une règle propre à une formation l'emporte
   sur la règle « toutes mes formations ». Chaque commande garde la règle (suivi : personnes, remises, encaissé, accès gratuits).
   Lancer : node --test tests/formation-regles-membres.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const H = require('./_formation-harness');

const OFFICIELLE = 900001, SEGOM = 900002;
let env;
const journalStripe = path.join(os.tmpdir(), 'faux-stripe-regles-' + process.pid + '.log');
test.before(async () => {
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(path.join(__dirname, '_faux-stripe-preload.js')).replace(/\\\\/g, '/');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_factice';
  process.env.CRON_SECRET = 'cron_test_factice';
  process.env.FAUX_STRIPE_LOG = journalStripe;
  process.env.DA_INITIATIVE_OFFICIELLE_ID = String(OFFICIELLE);
  env = await H.demarrer('reglesmembres');
});
test.after(() => { if (env) env.stop(); delete process.env.DA_INITIATIVE_OFFICIELLE_ID; try { fs.unlinkSync(journalStripe); } catch (e) { /* absent */ } });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).all(...args); } finally { db.close(); } };
const run = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).run(...args); } finally { db.close(); } };
const uid = (rnd, nom) => sql('SELECT id FROM users WHERE email LIKE ?', `test-utilisateur-${rnd}-${nom.toLowerCase()}@%`)[0].id;

test('règles membres : gratuité, pourcentage, affiliation, meilleure offre, priorité, suivi', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarB = H.cookieJar(), jarC = H.cookieJar(), jarD = H.cookieJar(), call = env.call;
  const cF = await H.creerFormateur(env, jarF, rnd, 'Formateur');
  for (const [jar, nom] of [[jarA, 'Alpha'], [jarB, 'Beta'], [jarC, 'Gamma'], [jarD, 'Delta']]) await H.creerApprenant(env, jar, rnd, nom);
  const fid = sql('SELECT id FROM users WHERE email=?', cF.email)[0].id;
  const [A, B, C, D] = ['Alpha', 'Beta', 'Gamma', 'Delta'].map(n => uid(rnd, n));

  /* Deux initiatives existantes (propriétaire : le formateur ; seul l'affichage public compte ici). */
  const cols = sql('PRAGMA table_info(initiatives)').filter(x => x.notnull && x.dflt_value == null && !x.pk).map(x => x.name);
  const initiative = (id, nom, sigle) => {
    const v = { id, owner_user_id: fid, nom, sigle, type: 'association', description: 'x', pays: 'France', ville: 'Lyon', categorie: 'Éducation', secteur: 'Éducation' };
    const noms = [...new Set(['id', 'owner_user_id', 'nom', 'sigle', 'pays', 'ville', ...cols])];
    run(`INSERT INTO initiatives (${noms.join(',')}) VALUES (${noms.map(() => '?').join(',')})`, ...noms.map(n => v[n] != null ? v[n] : 'x'));
  };
  initiative(OFFICIELLE, "Diaspo'Actif Officiel " + rnd, 'DAO'); initiative(SEGOM, 'Segom ' + rnd, 'SEG');
  const affilier = (init, user, statut = 'accepte', fin = null) => run("INSERT OR REPLACE INTO initiative_membres (initiative_id, user_id, statut, date_fin) VALUES (?,?,?,?)", init, user, statut, fin);
  affilier(OFFICIELLE, A); affilier(SEGOM, B); affilier(OFFICIELLE, D, 'en_attente');

  const f = (await call(jarF, 'POST', '/api/formations', { titre: 'Membres ' + rnd, description: 'x' })).data.id;
  run("UPDATE formations SET mode_acces='payant', prix=40, gratuit=0 WHERE id=?", f);
  H.publier(env, f);
  const regle = (jar, corps) => call(jar, 'POST', `/api/formations/${f}/regles-membres`, corps);

  /* 1. Recherche d'initiatives : quelques lettres suffisent ; réservée aux formateurs */
  let r = await call(jarF, 'GET', `/api/formateur/initiatives-recherche?q=${encodeURIComponent('seg')}`);
  assert.equal(r.status, 200); assert.ok(r.data.initiatives.some(i => i.id === SEGOM && i.ville === 'Lyon'));
  r = await call(jarF, 'GET', '/api/formateur/initiatives-recherche?q=s');
  assert.deepEqual(r.data.initiatives, [], 'moins de 2 lettres : rien');
  r = await call(jarF, 'GET', `/api/formateur/initiatives-recherche?q=${encodeURIComponent("diaspo")}`);
  assert.ok(r.data.initiatives.find(i => i.id === OFFICIELLE).officielle, 'l\'initiative officielle est reconnue');
  assert.notEqual((await call(jarA, 'GET', '/api/formateur/initiatives-recherche?q=seg')).status, 200, 'un apprenant ne cherche pas');
  /* Une initiative masquée de l'annuaire n'est pas proposée */
  run("UPDATE users SET invisible_annuaire_definitif=1 WHERE id=?", fid);
  assert.deepEqual((await call(jarF, 'GET', '/api/formateur/initiatives-recherche?q=seg')).data.initiatives, [], 'initiative masquée : introuvable');
  run("UPDATE users SET invisible_annuaire_definitif=0 WHERE id=?", fid);

  /* 2. Création : droits et validations */
  assert.equal((await regle(jarA, { officielle: true, mode: 'pourcentage', reduction_pct: 20 })).status === 201, false, 'un apprenant ne crée rien');
  assert.equal((await regle(jarF, { officielle: true, mode: 'pourcentage', reduction_pct: 100 })).status, 400, '100 % = gratuité');
  assert.equal((await regle(jarF, { officielle: true, mode: 'pourcentage', reduction_pct: 0 })).status, 400);
  assert.equal((await regle(jarF, { initiative_id: 424242, mode: 'pourcentage', reduction_pct: 10 })).status, 404, 'initiative inconnue');
  r = await regle(jarF, { officielle: true, mode: 'gratuit' });
  assert.equal(r.status, 409); assert.equal(r.data.code, 'confirmation_requise', 'la gratuité demande une confirmation, aussi côté serveur');
  assert.equal(sql('SELECT COUNT(*) n FROM formation_regles_membres').length && sql('SELECT COUNT(*) n FROM formation_regles_membres')[0].n, 0, 'rien d\'enregistré tant que ce n\'est pas valide');

  /* 3. Les deux règles : gratuité pour Diaspo'Actif, −10 % pour Segom */
  r = await regle(jarF, { officielle: true, mode: 'gratuit', confirme: true });
  assert.equal(r.status, 201, JSON.stringify(r.data)); const idOff = r.data.id;
  r = await regle(jarF, { initiative_id: SEGOM, mode: 'pourcentage', reduction_pct: 10 });
  assert.equal(r.status, 201, JSON.stringify(r.data)); const idSeg = r.data.id;
  r = await regle(jarF, { initiative_id: SEGOM, mode: 'pourcentage', reduction_pct: 10 });
  assert.equal(r.status, 200); assert.equal(r.data.mis_a_jour, true, 'même initiative : la règle est mise à jour, pas dupliquée');

  /* 4. Mentions publiques (catalogue + offre) */
  r = await call(null, 'GET', '/api/formations');
  const carte = r.data.formations.find(x => Number(x.id) === Number(f));
  assert.equal(carte.mentions_membres.length, 2);
  assert.ok(carte.mentions_membres.some(m => /^Gratuit pour les membres de Diaspo/.test(m.texte)));
  assert.ok(carte.mentions_membres.some(m => m.texte === `−10 % pour les membres de Segom ${rnd}`));

  /* 5. Une personne non affiliée ne voit pas de tarif membre et paie le prix plein */
  r = await call(jarC, 'GET', `/api/formations/${f}/offre`);
  assert.equal(r.data.tarifs_membres.length, 2); assert.equal(r.data.mon_tarif_membre, null);
  r = await call(jarC, 'POST', `/api/formations/${f}/acquerir`, {});
  assert.equal(r.status, 201, JSON.stringify(r.data)); assert.ok(r.data.checkout_url);
  assert.equal(sql('SELECT montant, coupon_source FROM formation_commandes WHERE user_id=?', C)[0].montant, 40);
  assert.equal(sql('SELECT coupon_source FROM formation_commandes WHERE user_id=?', C)[0].coupon_source, null);

  /* 6. Affiliation seulement « en attente » : aucun avantage ; échue : aucun ; valable : avantage */
  r = await call(jarD, 'GET', `/api/formations/${f}/offre`); assert.equal(r.data.mon_tarif_membre, null, 'en attente');
  affilier(OFFICIELLE, D, 'accepte', '2020-01-01');
  r = await call(jarD, 'GET', `/api/formations/${f}/offre`); assert.equal(r.data.mon_tarif_membre, null, 'échue');
  affilier(OFFICIELLE, D, 'refuse'); r = await call(jarD, 'GET', `/api/formations/${f}/offre`); assert.equal(r.data.mon_tarif_membre, null, 'refusée');
  affilier(OFFICIELLE, D, 'accepte', '2999-01-01');
  r = await call(jarD, 'GET', `/api/formations/${f}/offre`); assert.equal(r.data.mon_tarif_membre.formation.gratuit, true, 'valable');
  affilier(OFFICIELLE, D, 'en_attente'); /* on la remet hors jeu pour la suite */

  /* 7. Affilié Diaspo'Actif : gratuité automatique, sans code, sans Stripe */
  r = await call(jarA, 'GET', `/api/formations/${f}/offre`);
  assert.equal(r.data.mon_tarif_membre.formation.prix, 0); assert.equal(r.data.mon_tarif_membre.formation.gratuit, true);
  r = await call(jarA, 'POST', `/api/formations/${f}/acquerir`, {});
  assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(r.data.checkout_url, undefined);
  assert.equal(sql("SELECT statut FROM formation_acces WHERE user_id=? AND formation_id=?", A, f)[0].statut, 'actif', 'accès ouvert');
  const cA = sql('SELECT * FROM formation_commandes WHERE user_id=? AND formation_id=?', A, f)[0];
  assert.equal(cA.montant, 0); assert.equal(cA.statut, 'payee'); assert.equal(cA.coupon_source, 'membre'); assert.equal(cA.coupon_id, idOff); assert.match(cA.coupon_code, /^Membres Diaspo/);

  /* 8. Affilié Segom : −10 % (36 €), payé via Stripe ; la remise est enregistrée */
  r = await call(jarB, 'GET', `/api/formations/${f}/offre`); assert.equal(r.data.mon_tarif_membre.formation.prix, 36);
  r = await call(jarB, 'POST', `/api/formations/${f}/acquerir`, {});
  assert.equal(r.status, 201, JSON.stringify(r.data)); assert.ok(r.data.checkout_url);
  const cB = sql('SELECT * FROM formation_commandes WHERE user_id=?', B)[0];
  assert.equal(cB.montant, 36); assert.equal(cB.remise, 4); assert.equal(cB.prix_initial, 40); assert.equal(cB.coupon_source, 'membre'); assert.equal(cB.coupon_id, idSeg);

  /* 9. Meilleure offre : un code plus faible que le tarif membre est inutile ; un code plus fort l'emporte (et ne se cumule pas) */
  const faible = (await call(jarF, 'POST', `/api/formations/${f}/coupons/generer`, { type: 'collectif', type_reduction: 'pourcentage', reduction_pct: 5, illimite: true })).data.codes[0].code;
  const fort = (await call(jarF, 'POST', `/api/formations/${f}/coupons/generer`, { type: 'collectif', type_reduction: 'pourcentage', reduction_pct: 50, illimite: true })).data.codes[0].code;
  run("DELETE FROM formation_commandes WHERE user_id=? AND statut='en_attente'", B); run("DELETE FROM formation_acces WHERE user_id=? AND statut='en_attente'", B);
  r = await call(jarB, 'POST', `/api/formations/${f}/coupon/verifier`, { code: faible });
  assert.equal(r.data.valide, false); assert.match(r.data.erreur, /tarif membre/i);
  r = await call(jarB, 'POST', `/api/formations/${f}/coupon/verifier`, { code: fort });
  assert.equal(r.data.valide, true); assert.equal(r.data.prix_final, 20);
  r = await call(jarB, 'POST', `/api/formations/${f}/acquerir`, { coupon: fort });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const cB2 = sql("SELECT * FROM formation_commandes WHERE user_id=? AND statut='en_attente'", B)[0];
  assert.equal(cB2.montant, 20); assert.equal(cB2.coupon_source, 'formation', 'le code est enregistré, pas la règle');
  run("DELETE FROM formation_commandes WHERE id=?", cB2.id); run("DELETE FROM formation_acces WHERE user_id=? AND statut='en_attente'", B);

  /* 10. Une règle propre à la formation l'emporte sur la règle « toutes mes formations » ; désactivée, la règle globale reprend */
  r = await call(jarF, 'POST', '/api/formateur/regles-membres', { initiative_id: SEGOM, mode: 'pourcentage', reduction_pct: 50 });
  assert.equal(r.status, 201, JSON.stringify(r.data)); const idGlobal = r.data.id;
  r = await call(jarB, 'GET', `/api/formations/${f}/offre`); assert.equal(r.data.mon_tarif_membre.formation.prix, 36, 'la règle de la formation (10 %) l\'emporte');
  await call(jarF, 'PATCH', `/api/formations/${f}/regles-membres/${idSeg}`, { actif: false });
  r = await call(jarB, 'GET', `/api/formations/${f}/offre`); assert.equal(r.data.mon_tarif_membre.formation.prix, 20, 'règle globale (50 %)');
  await call(jarF, 'PATCH', `/api/formations/${f}/regles-membres/${idSeg}`, { actif: true });

  /* 11. Suivi : personnes, accès gratuits, remises, encaissé (la commande de B est confirmée par le prestataire) */
  const cmdB = sql("SELECT id FROM formation_commandes WHERE user_id=? AND formation_id=?", B, f);
  if (!cmdB.length) {
    r = await call(jarB, 'POST', `/api/formations/${f}/acquerir`, {});
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  run("UPDATE formation_commandes SET statut='payee', paye_le=datetime('now') WHERE user_id=? AND formation_id=? AND statut='en_attente'", B, f);
  r = await call(jarF, 'GET', `/api/formations/${f}/regles-membres`);
  assert.equal(r.status, 200);
  const off = r.data.regles.find(x => x.id === idOff), seg = r.data.regles.find(x => x.id === idSeg);
  assert.equal(off.stats.personnes, 1); assert.equal(off.stats.gratuits, 1); assert.equal(off.stats.encaisse, 0);
  assert.equal(seg.stats.personnes, 1); assert.equal(seg.stats.gratuits, 0); assert.equal(seg.stats.remises, 4); assert.equal(seg.stats.encaisse, 36);
  assert.equal(seg.stats.par_mois.length, 1); assert.ok(seg.stats.derniere);
  assert.equal(r.data.globales.length, 1); assert.equal(r.data.globales[0].id, idGlobal);
  assert.equal(r.data.officielle_id, OFFICIELLE);

  /* 12. Désactiver ou supprimer retire l'avantage ; les chiffres restent */
  await call(jarF, 'PATCH', `/api/formations/${f}/regles-membres/${idSeg}`, { actif: false });
  await call(jarF, 'DELETE', `/api/formateur/regles-membres/${idGlobal}`);
  r = await call(jarB, 'GET', `/api/formations/${f}/offre`); assert.equal(r.data.mon_tarif_membre, null);
  r = await call(null, 'GET', '/api/formations');
  assert.equal(r.data.formations.find(x => Number(x.id) === Number(f)).mentions_membres.length, 1, 'seule la règle Diaspo\'Actif reste annoncée');
});
