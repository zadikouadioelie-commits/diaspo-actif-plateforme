/* ===========================================================
   tests/formation-codes-generes.test.js — codes de promotion générés en un clic (2026-10-31)
   ===========================================================
   POST /api/formations/:id/coupons/generer : code INDIVIDUEL (une seule utilisation) ou COLLECTIF (N personnes, ou illimité), enregistré dès sa création.
   Une personne ne peut utiliser un même code qu'une fois. Un code généré ne se cumule pas avec la promotion : la meilleure des deux offres s'applique.
   Lancer : node --test tests/formation-codes-generes.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const H = require('./_formation-harness');

let env;
const journalStripe = path.join(os.tmpdir(), 'faux-stripe-codes-' + process.pid + '.log');
test.before(async () => {
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(path.join(__dirname, '_faux-stripe-preload.js')).replace(/\\\\/g, '/');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_factice';
  process.env.CRON_SECRET = 'cron_test_factice';
  process.env.FAUX_STRIPE_LOG = journalStripe;
  env = await H.demarrer('codesgeneres');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalStripe); } catch (e) { /* absent */ } });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).all(...args); } finally { db.close(); } };
const run = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).run(...args); } finally { db.close(); } };

test('génération, individuel / collectif, limites, meilleure offre', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarB = H.cookieJar(), jarC = H.cookieJar(), jarD = H.cookieJar(), call = env.call;
  await H.creerFormateur(env, jarF, rnd, 'Formateur');
  for (const [jar, nom] of [[jarA, 'Alpha'], [jarB, 'Beta'], [jarC, 'Gamma'], [jarD, 'Delta']]) await H.creerApprenant(env, jar, rnd, nom);

  const f = (await call(jarF, 'POST', '/api/formations', { titre: 'Imposteur ' + rnd, description: 'x' })).data.id;
  run("UPDATE formations SET mode_acces='payant', prix=40, gratuit=0 WHERE id=?", f);
  H.publier(env, f);
  const gen = (jar, corps) => call(jar, 'POST', `/api/formations/${f}/coupons/generer`, corps);

  /* 1. Droits et validations */
  assert.equal((await gen(jarA, { type: 'individuel', type_reduction: 'pourcentage', reduction_pct: 100 })).status, 403, 'un apprenant ne génère rien');
  assert.equal((await gen(null, { type: 'individuel', reduction_pct: 100 })).status, 401);
  assert.equal((await gen(jarF, { type: 'autre', reduction_pct: 100 })).status, 400, 'type obligatoire');
  assert.equal((await gen(jarF, { type: 'individuel', type_reduction: 'pourcentage', reduction_pct: 0 })).status, 400, '0 % refusé');
  assert.equal((await gen(jarF, { type: 'individuel', type_reduction: 'pourcentage', reduction_pct: 101 })).status, 400);
  assert.equal((await gen(jarF, { type: 'individuel', type_reduction: 'pourcentage', reduction_pct: 10, quantite: 51 })).status, 400, '50 codes au plus');
  assert.equal((await gen(jarF, { type: 'collectif', type_reduction: 'pourcentage', reduction_pct: 10, max_personnes: 1 })).status, 400, 'collectif : au moins 2 personnes');
  assert.equal((await gen(jarF, { type: 'individuel', type_reduction: 'montant', montant_fixe: -5 })).status, 400);
  assert.equal(sql('SELECT COUNT(*) n FROM formation_coupons WHERE formation_id=?', f)[0].n, 0, 'rien n\'est enregistré en cas de refus');

  /* 2. Code individuel : lot de 3, enregistrés aussitôt, lisibles, tous différents */
  let r = await gen(jarF, { type: 'individuel', type_reduction: 'pourcentage', reduction_pct: 100, quantite: 3 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const indiv = r.data.codes.map(c => c.code);
  assert.equal(indiv.length, 3); assert.equal(new Set(indiv).size, 3);
  for (const c of indiv) assert.match(c, /^[A-Z]{3,5}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/, 'sans I, L, O, 0, 1');
  const lignes = sql("SELECT * FROM formation_coupons WHERE formation_id=? AND type_code='individuel'", f);
  assert.equal(lignes.length, 3);
  for (const l of lignes) { assert.equal(l.max_utilisations, 1); assert.equal(l.max_par_utilisateur, 1); assert.equal(l.actif, 1); assert.equal(l.nb_utilises ?? 0, 0); }

  /* 3. Le formateur retrouve ses codes avec leur état */
  r = await call(jarF, 'GET', `/api/formations/${f}/coupons`);
  assert.equal(r.data.coupons.filter(c => c.type_code === 'individuel').length, 3);

  /* 4. Un code individuel ne sert qu'UNE fois, à une seule personne */
  r = await call(jarA, 'POST', `/api/formations/${f}/acquerir`, { coupon: indiv[0] });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(sql("SELECT statut FROM formation_acces WHERE formation_id=? AND user_id=(SELECT id FROM users WHERE email LIKE ?)", f, `test-utilisateur-${rnd}-alpha@%`)[0].statut, 'actif', '100 % : accès ouvert');
  r = await call(jarB, 'POST', `/api/formations/${f}/coupon/verifier`, { code: indiv[0] });
  assert.equal(r.data.valide, false); assert.match(r.data.erreur, /limite/i, 'code individuel déjà utilisé');
  r = await call(jarB, 'POST', `/api/formations/${f}/coupon/verifier`, { code: indiv[1] });
  assert.equal(r.data.valide, true, 'un autre code individuel du lot reste valable'); assert.equal(r.data.prix_final, 0);
  const usages = await call(jarF, 'GET', `/api/formations/${f}/coupons`);
  const c0 = usages.data.coupons.find(c => c.code === indiv[0]);
  assert.equal(c0.nb_utilises, 1);

  /* 5. Code collectif limité à 2 personnes */
  r = await gen(jarF, { type: 'collectif', type_reduction: 'pourcentage', reduction_pct: 100, max_personnes: 2 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const coll = r.data.codes[0].code;
  assert.equal(r.data.codes.length, 1);
  assert.equal(sql('SELECT max_utilisations, type_code FROM formation_coupons WHERE code=?', coll)[0].max_utilisations, 2);
  assert.equal((await call(jarB, 'POST', `/api/formations/${f}/acquerir`, { coupon: coll })).status, 201);
  assert.equal((await call(jarC, 'POST', `/api/formations/${f}/acquerir`, { coupon: coll })).status, 201);
  r = await call(jarD, 'POST', `/api/formations/${f}/acquerir`, { coupon: coll });
  assert.equal(r.status, 400); assert.equal(r.data.code, 'coupon_refuse'); assert.match(r.data.error, /limite/i, 'la 3e personne est refusée');
  assert.equal(sql('SELECT COUNT(*) n FROM formation_acces WHERE formation_id=? AND statut=?', f, 'actif')[0].n, 3, 'A, B, C seulement');

  /* 6. Code collectif illimité (max_utilisations vide) */
  r = await gen(jarF, { type: 'collectif', type_reduction: 'pourcentage', reduction_pct: 25, illimite: true });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const illim = r.data.codes[0];
  assert.equal(illim.max_utilisations, null);
  assert.equal(sql('SELECT max_utilisations FROM formation_coupons WHERE code=?', illim.code)[0].max_utilisations, null);
  r = await call(jarD, 'POST', `/api/formations/${f}/coupon/verifier`, { code: illim.code });
  assert.equal(r.data.valide, true); assert.equal(r.data.prix_final, 30, '25 % de 40 €');

  /* 7. Un code désactivé ne marche plus ; il peut être réactivé */
  const idIllim = illim.id;
  await call(jarF, 'PATCH', `/api/formations/${f}/coupons/${idIllim}`, { actif: false });
  assert.equal((await call(jarD, 'POST', `/api/formations/${f}/coupon/verifier`, { code: illim.code })).data.valide, false);
  await call(jarF, 'PATCH', `/api/formations/${f}/coupons/${idIllim}`, { actif: true });
  assert.equal((await call(jarD, 'POST', `/api/formations/${f}/coupon/verifier`, { code: illim.code })).data.valide, true);

  /* 8. Montant fixe */
  r = await gen(jarF, { type: 'collectif', type_reduction: 'montant', montant_fixe: 15, illimite: true });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal((await call(jarD, 'POST', `/api/formations/${f}/coupon/verifier`, { code: r.data.codes[0].code })).data.prix_final, 25, '40 € − 15 €');

  /* 9. Avec une promotion en cours (−50 % : 20 €), la meilleure des deux offres s'applique */
  run("UPDATE formations SET promo_active=1, promo_reduction_pct=50 WHERE id=?", f);
  const faible = (await gen(jarF, { type: 'collectif', type_reduction: 'pourcentage', reduction_pct: 30, illimite: true })).data.codes[0].code; /* 28 € > 20 € */
  const fort = (await gen(jarF, { type: 'collectif', type_reduction: 'pourcentage', reduction_pct: 75, illimite: true })).data.codes[0].code; /* 10 € < 20 € */
  r = await call(jarD, 'POST', `/api/formations/${f}/coupon/verifier`, { code: faible });
  assert.equal(r.data.valide, false); assert.match(r.data.erreur, /promotion en cours/i);
  r = await call(jarD, 'POST', `/api/formations/${f}/coupon/verifier`, { code: fort });
  assert.equal(r.data.valide, true); assert.equal(r.data.prix_avant, 20); assert.equal(r.data.prix_final, 10); assert.equal(r.data.remise, 10);
  /* À l'achat : 10 € à payer (séance Stripe créée), jamais 5 € (cumul) */
  r = await call(jarD, 'POST', `/api/formations/${f}/acquerir`, { coupon: fort });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.checkout_url, 'paiement du solde');
  const cmd = sql("SELECT montant, remise, coupon_code, prix_initial FROM formation_commandes WHERE formation_id=? AND coupon_code=?", f, fort)[0];
  assert.equal(cmd.montant, 10); assert.equal(cmd.prix_initial, 40);
});
