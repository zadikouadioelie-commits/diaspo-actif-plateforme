/* ===========================================================
   tests/kofi-forfait.test.js — KOFFI : achat du forfait de questions (Stripe), 2026-10-30
   ===========================================================
   Règles : consentement exprès exigé CÔTÉ SERVEUR (aucun remboursement) ; rien n'est crédité avant la confirmation signée de Stripe (webhook) ;
   le montant payé doit couvrir le prix ; rejouer l'événement ne crédite pas deux fois ; Premium uniquement ; pas de vente si Koffi ne peut pas répondre ;
   double clic = même paiement repris ; session expirée = commande close, aucun crédit.
   Lancer : node --test tests/kofi-forfait.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const Kofi = require('../server/kofi');

let env;
const journalStripe = path.join(os.tmpdir(), 'faux-stripe-kofi-forfait-' + process.pid + '.log');
test.before(async () => {
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(path.join(__dirname, '_faux-stripe-preload.js')).replace(/\\\\/g, '/');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_factice';
  process.env.CRON_SECRET = 'cron_test_factice';
  process.env.FAUX_STRIPE_LOG = journalStripe;
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofiforfait');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalStripe); } catch (e) { /* absent */ } });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
async function webhook(type, objet) {
  const res = await fetch(env.base + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 'x' }, body: JSON.stringify({ type, data: { object: objet } }) });
  return res.status;
}
const sessionsStripe = () => { try { return fs.readFileSync(journalStripe, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };

test('Koffi — forfait de questions', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarC = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid;
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const acheter = (jar, extra) => call(jar, 'POST', '/api/kofi/forfait/acheter', { formation_id: fid, ...extra });
  const stock = id => sql("select COALESCE(SUM(questions_restantes),0) n from kofi_credits where user_id=?", id)[0].n;

  await t.test('setup — formation gratuite, A (Premium payant), C (Premium terminé), réserve IA rechargée', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    for (const [j, n] of [[jarA, 'Alpha'], [jarC, 'Gamma']]) await H.creerApprenant(env, j, rnd, n);
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Finances solidaires ' + rnd, description: 'x' })).data.id;
    sql("UPDATE formations SET mode_acces='gratuit', prix=0, gratuit=1 WHERE id=?", fid);
    const m = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'Tontines' })).data.id;
    const ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${m}/chapitres`, { titre: 'Ch' })).data.id;
    await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon', type: 'texte', contenu_texte: '<p>La tontine solidaire fonctionne par cotisations mensuelles.</p>' });
    H.publier(env, fid);
    for (const [j, n] of [[jarA, 'Alpha'], [jarC, 'Gamma']]) {
      assert.equal((await call(j, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
      sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", uid(n)); sql('DELETE FROM user_accreditations WHERE user_id=?', uid(n));
    }
    sql("INSERT INTO user_accreditations (user_id, accred_id, statut, date_expiration, type_tarif, montant_paye) VALUES (?, (SELECT id FROM accred_definitions WHERE type='utilisateur_abonne'), 'active', datetime('now','+30 day'), 'mensuel', 9)", uid('Alpha'));
    assert.equal((await call(jarF, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
  });

  await t.test('l\'état annonce le forfait, ses textes de non-remboursement et s\'il est achetable', async () => {
    const r = await call(jarA, 'GET', `/api/kofi/etat?formation_id=${fid}`);
    assert.equal(r.data.forfait.questions, 1000); assert.equal(r.data.forfait.prix_eur, 2.5); assert.equal(r.data.forfait.achetable, true);
    assert.equal(r.data.forfait.texte, Kofi.TEXTE_FORFAIT_NON_REMBOURSABLE); assert.equal(r.data.forfait.retractation, Kofi.TEXTE_FORFAIT_RETRACTATION);
    assert.equal((await call(jarC, 'GET', `/api/kofi/etat?formation_id=${fid}`)).data.forfait.achetable, false, 'Premium terminé : pas d\'achat');
    assert.equal((await call(jarF, 'GET', `/api/kofi/etat?formation_id=${fid}`)).data.forfait.achetable, false, 'aperçu formateur : rien à acheter');
  });

  await t.test('refus : visiteur, Premium terminé, aperçu formateur', async () => {
    assert.equal((await acheter(anon, { accepte_non_remboursable: true })).status, 401);
    let r = await acheter(jarC, { accepte_non_remboursable: true });
    assert.equal(r.status, 402); assert.equal(r.data.code, 'premium_requis');
    assert.equal((await acheter(jarF, { accepte_non_remboursable: true })).status, 400);
    assert.equal(sql('select count(*) n from kofi_commandes')[0].n, 0, 'aucune commande créée');
    assert.equal(sessionsStripe().length, 0);
  });

  await t.test('SANS consentement : refus net (409), textes renvoyés, AUCUNE commande ni session Stripe', async () => {
    let r = await acheter(jarA, { accepte_non_remboursable: false });
    assert.equal(r.status, 409, JSON.stringify(r.data)); assert.equal(r.data.code, 'consentement_requis');
    assert.equal(r.data.texte, Kofi.TEXTE_FORFAIT_NON_REMBOURSABLE); assert.equal(r.data.retractation, Kofi.TEXTE_FORFAIT_RETRACTATION); assert.equal(r.data.montant, 2.5);
    for (const faux of ['true', 1, 'oui', {}, undefined]) {
      r = await acheter(jarA, { accepte_non_remboursable: faux });
      assert.equal(r.status, 409, 'valeur ' + JSON.stringify(faux));
    }
    assert.equal(sql('select count(*) n from kofi_commandes')[0].n, 0);
    assert.equal(sessionsStripe().length, 0);
    assert.equal((await call(jarA, 'GET', `/api/kofi/etat?formation_id=${fid}`)).data.achat, null, 'aucun achat en cours');
  });

  let cmd1, session1;
  await t.test('avec consentement : session Stripe 2,50 €, rappel « non remboursable » sur la page de paiement, preuve datée ; RIEN n\'est crédité', async () => {
    const a = uid('Alpha');
    const avant = stock(a);
    const r = await acheter(jarA, { accepte_non_remboursable: true });
    assert.equal(r.status, 201, JSON.stringify(r.data)); assert.ok(r.data.checkout_url);
    cmd1 = r.data.commande_id;
    const c = sql('select * from kofi_commandes where id=?', cmd1)[0];
    assert.equal(c.statut, 'en_attente'); assert.equal(c.questions, 1000); assert.equal(c.montant, 2.5); assert.equal(c.user_id, a);
    assert.match(String(c.consentement_le), /^\d{4}-\d{2}-\d{2}T.* v2026-10-30$/);
    session1 = sessionsStripe().find(s => s.metadata && s.metadata.diaspoactif_kofi_commande_id === String(cmd1));
    assert.ok(session1, 'session Stripe créée'); assert.equal(session1.montant, 250);
    assert.equal(session1.custom_text.submit.message, Kofi.TEXTE_FORFAIT_NON_REMBOURSABLE);
    assert.equal(stock(a), avant, 'aucune question créditée avant le paiement');
    assert.deepEqual((await call(jarA, 'GET', `/api/kofi/etat?formation_id=${fid}`)).data.achat, { statut: 'en_attente' }, 'l\'écran de retour attend le webhook');
  });

  await t.test('double clic : le paiement en cours est repris, aucun doublon', async () => {
    const r = await acheter(jarA, { accepte_non_remboursable: true });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.repris, true);
    assert.equal(sql('select count(*) n from kofi_commandes')[0].n, 1);
  });

  await t.test('paiement partiel ou événement sans commande : rien n\'est crédité', async () => {
    const a = uid('Alpha');
    assert.equal(await webhook('checkout.session.completed', { id: session1.id, amount_total: 100, metadata: { diaspoactif_kofi_commande_id: String(cmd1) } }), 200);
    assert.equal(stock(a), 0); assert.equal(sql('select statut from kofi_commandes where id=?', cmd1)[0].statut, 'en_attente');
    assert.equal(await webhook('checkout.session.completed', { id: 'cs_x', amount_total: 250, metadata: { diaspoactif_kofi_commande_id: '99999' } }), 200);
    assert.equal(stock(a), 0);
  });

  await t.test('paiement confirmé : 1 000 questions créditées pour 12 mois ; rejouer l\'événement ne crédite pas deux fois', async () => {
    const a = uid('Alpha');
    assert.equal(await webhook('checkout.session.completed', { id: session1.id, amount_total: 250, metadata: { diaspoactif_kofi_commande_id: String(cmd1) } }), 200);
    assert.equal(stock(a), 1000);
    const lot = sql("select * from kofi_credits where user_id=? and origine='achat'", a);
    assert.equal(lot.length, 1); assert.equal(lot[0].questions_total, 1000);
    const mois = (new Date(String(lot[0].expire_le).replace(' ', 'T') + 'Z') - Date.now()) / 86400000;
    assert.ok(mois > 360 && mois < 370, 'valable ~12 mois : ' + mois);
    const c = sql('select * from kofi_commandes where id=?', cmd1)[0];
    assert.equal(c.statut, 'payee'); assert.equal(c.credit_id, lot[0].id); assert.ok(c.paye_le);
    for (let i = 0; i < 3; i++) assert.equal(await webhook('checkout.session.completed', { id: session1.id, amount_total: 250, metadata: { diaspoactif_kofi_commande_id: String(cmd1) } }), 200);
    assert.equal(stock(a), 1000, 'idempotent');
    assert.equal(sql("select count(*) n from kofi_credits where user_id=? and origine='achat'", a)[0].n, 1);
    const e = await call(jarA, 'GET', `/api/kofi/etat?formation_id=${fid}`);
    assert.equal(e.data.credits.restants, 1000);
    assert.deepEqual(e.data.achat, { statut: 'payee' });
    const n = sql("select count(*) n from notifications where user_id=? and titre like 'Koffi%'", a)[0];
    assert.equal(n.n, 1, 'une seule notification');
  });

  await t.test('les questions achetées servent ensuite (gratuites d\'abord, puis forfait) et un nouvel achat est possible', async () => {
    const o = await call(jarA, 'POST', '/api/kofi/conversations', { formation_id: fid });
    const r = await call(jarA, 'POST', `/api/kofi/conversations/${o.data.id}/messages`, { texte: 'Comment fonctionne la tontine solidaire ?' });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.credits.restants, 1004, '4 gratuites + 1000 − 0 : la gratuite part d\'abord (5 → 4)');
    const r2 = await acheter(jarA, { accepte_non_remboursable: true });
    assert.equal(r2.status, 201, JSON.stringify(r2.data));
    /* session expirée (abandon du paiement) : commande close, aucun crédit */
    const cmd2 = r2.data.commande_id; const s2 = sessionsStripe().find(s => s.metadata && s.metadata.diaspoactif_kofi_commande_id === String(cmd2));
    assert.equal(await webhook('checkout.session.expired', { id: s2.id, metadata: { diaspoactif_kofi_commande_id: String(cmd2) } }), 200);
    assert.equal(sql('select statut from kofi_commandes where id=?', cmd2)[0].statut, 'expiree');
    assert.equal(stock(uid('Alpha')), 1004);
    /* une commande expirée ne peut plus être créditée */
    assert.equal(await webhook('checkout.session.completed', { id: s2.id, amount_total: 250, metadata: { diaspoactif_kofi_commande_id: String(cmd2) } }), 200);
    assert.equal(stock(uid('Alpha')), 1004);
  });

  await t.test('réserve d\'IA épuisée : la vente est suspendue (on ne vend pas ce qui ne peut pas répondre)', async () => {
    assert.equal((await call(jarF, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: -50, type: 'ajustement' })).status, 201);
    const r = await acheter(jarA, { accepte_non_remboursable: true });
    assert.equal(r.status, 503, JSON.stringify(r.data)); assert.equal(r.data.code, 'indisponible');
    assert.equal((await call(jarA, 'GET', `/api/kofi/etat?formation_id=${fid}`)).data.forfait.achetable, false);
  });
});
