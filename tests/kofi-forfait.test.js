/* ===========================================================
   tests/kofi-forfait.test.js — KOFFI : recharge du portefeuille (Stripe), 2026-10-31 (remplace l'ancien forfait de 1 000 questions)
   ===========================================================
   Règles : montants imposés (3 € → 1 €, 6 € → 2 €, 15 € → 5 € d'utilisation) ; consentement exprès exigé CÔTÉ SERVEUR (aucun remboursement) ;
   rien n'est crédité avant la confirmation signée de Stripe (webhook) ; le montant payé doit couvrir le prix ; rejouer l'événement ne crédite pas deux fois ;
   ouvert à tout compte majeur (Premium ou non) ; pas de vente si Koffi ne peut pas répondre ; double clic = même paiement repris ; session expirée = commande close, aucun crédit.
   Lancer : node --test tests/kofi-forfait.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const Kofi = require('../server/kofi');
const PF = Kofi.Portefeuille;

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

test('Koffi — recharge du portefeuille', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarC = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid;
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const acheter = (jar, extra) => call(jar, 'POST', '/api/kofi/portefeuille/recharger', { formation_id: fid, montant_eur: 3, ...extra });
  /* Le crédit ACHETÉ (hors crédit mensuel offert) d'un compte, en euros d'utilisation. */
  const stock = id => sql("select COALESCE(SUM(montant_restant),0) n from kofi_solde where user_id=? and origine='achat'", id)[0].n;
  const etatDe = jar => call(jar, 'GET', `/api/kofi/etat?formation_id=${fid}`);

  await t.test('setup — formation gratuite, A (Premium payant), C (sans Premium), réserve IA rechargée', async () => {
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
    sql("INSERT OR IGNORE INTO kofi_majorite (user_id, confirme_le, version) VALUES (?, datetime('now'), 'test')", uid('Alpha')); /* Koffi est réservé aux majeurs : A a déjà confirmé */
    assert.equal((await call(jarF, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
  });

  await t.test('l\'état annonce la recharge, ses textes de non-remboursement et si elle est possible', async () => {
    const r = await etatDe(jarA);
    assert.equal(r.data.recharge.achetable, true);
    assert.equal(r.data.recharge.texte, PF.TEXTE_RECHARGE_NON_REMBOURSABLE); assert.equal(r.data.recharge.retractation, PF.TEXTE_RECHARGE_RETRACTATION);
    assert.deepEqual(r.data.portefeuille.recharge.offres.map(o => [o.paye_eur, o.credit_eur]), [[3, 1], [6, 2], [15, 5]]);
    assert.equal(r.data.portefeuille.recharge.min_eur, 3); assert.equal(r.data.portefeuille.recharge.ratio, 3);
    assert.equal((await etatDe(jarC)).data.recharge.achetable, false, 'majorité non confirmée : pas de paiement');
    assert.equal((await etatDe(jarF)).data.recharge.achetable, false, 'aperçu formateur : rien à acheter');
  });

  await t.test('refus : visiteur, majorité non confirmée, montants hors offre', async () => {
    assert.equal((await acheter(anon, { accepte_non_remboursable: true })).status, 401);
    let r = await acheter(jarC, { accepte_non_remboursable: true });
    assert.equal(r.status, 403); assert.equal(r.data.code, 'majorite_requise');
    for (const faux of [2, 2.99, 4, 5, 0, -3, 'abc', null, undefined, 1000]) {
      r = await acheter(jarA, { montant_eur: faux, accepte_non_remboursable: true });
      assert.equal(r.status, 400, 'montant ' + JSON.stringify(faux)); assert.equal(r.data.code, 'montant_invalide'); assert.deepEqual(r.data.offres.map(o => o.paye_eur), [3, 6, 15]);
    }
    assert.equal(sql('select count(*) n from kofi_commandes')[0].n, 0, 'aucune commande créée');
    assert.equal(sessionsStripe().length, 0);
  });

  await t.test('SANS consentement : refus net (409), textes renvoyés, AUCUNE commande ni session Stripe', async () => {
    let r = await acheter(jarA, { accepte_non_remboursable: false });
    assert.equal(r.status, 409, JSON.stringify(r.data)); assert.equal(r.data.code, 'consentement_requis');
    assert.equal(r.data.texte, PF.TEXTE_RECHARGE_NON_REMBOURSABLE); assert.equal(r.data.retractation, PF.TEXTE_RECHARGE_RETRACTATION);
    assert.deepEqual([r.data.offre.paye_eur, r.data.offre.credit_eur], [3, 1]);
    for (const faux of ['true', 1, 'oui', {}, undefined]) {
      r = await acheter(jarA, { accepte_non_remboursable: faux });
      assert.equal(r.status, 409, 'valeur ' + JSON.stringify(faux));
    }
    assert.equal(sql('select count(*) n from kofi_commandes')[0].n, 0);
    assert.equal(sessionsStripe().length, 0);
    assert.equal((await etatDe(jarA)).data.achat, null, 'aucun achat en cours');
  });

  let cmd1, session1;
  await t.test('avec consentement : session Stripe 3,00 €, rappel « non remboursable » sur la page de paiement, preuve datée ; RIEN n\'est crédité', async () => {
    const a = uid('Alpha');
    const avant = stock(a);
    const r = await acheter(jarA, { accepte_non_remboursable: true });
    assert.equal(r.status, 201, JSON.stringify(r.data)); assert.ok(r.data.checkout_url);
    cmd1 = r.data.commande_id;
    const c = sql('select * from kofi_commandes where id=?', cmd1)[0];
    assert.equal(c.statut, 'en_attente'); assert.equal(c.portee, 'portefeuille'); assert.equal(c.questions, 100, 'crédit d\'utilisation en centimes'); assert.equal(c.montant, 3); assert.equal(c.user_id, a);
    assert.match(String(c.consentement_le), new RegExp('^\\d{4}-\\d{2}-\\d{2}T.* v' + PF.VERSION_CONSENTEMENT_RECHARGE + '$'));
    session1 = sessionsStripe().find(s => s.metadata && s.metadata.diaspoactif_kofi_commande_id === String(cmd1));
    assert.ok(session1, 'session Stripe créée'); assert.equal(session1.montant, 300);
    assert.equal(session1.custom_text.submit.message, PF.TEXTE_RECHARGE_NON_REMBOURSABLE);
    assert.ok(session1.success_url.endsWith('/suivre-formation.html?id=' + fid + '&kofi=succes'), 'site : retour sur la page de suivi');
    assert.equal(stock(a), avant, 'rien n\'est crédité avant le paiement');
    assert.deepEqual((await etatDe(jarA)).data.achat, { statut: 'en_attente' }, 'l\'écran de retour attend le webhook');
  });

  await t.test('double clic : le paiement en cours est repris, aucun doublon ; un autre montant remplace la demande', async () => {
    let r = await acheter(jarA, { accepte_non_remboursable: true });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.repris, true);
    assert.equal(sql('select count(*) n from kofi_commandes')[0].n, 1);
    r = await acheter(jarA, { montant_eur: 6, accepte_non_remboursable: true });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(sql('select statut from kofi_commandes where id=?', cmd1)[0].statut, 'expiree', 'la demande de 3 € est close');
    const c = sql('select * from kofi_commandes where id=?', r.data.commande_id)[0]; assert.equal(c.montant, 6); assert.equal(c.questions, 200);
    await webhook('checkout.session.expired', { id: 'x', metadata: { diaspoactif_kofi_commande_id: String(r.data.commande_id) } });
    /* Une demande 3 € neuve pour la suite. */
    r = await acheter(jarA, { accepte_non_remboursable: true });
    assert.equal(r.status, 201, JSON.stringify(r.data)); cmd1 = r.data.commande_id;
    session1 = sessionsStripe().find(s => s.metadata && s.metadata.diaspoactif_kofi_commande_id === String(cmd1));
  });

  await t.test('paiement partiel ou événement sans commande : rien n\'est crédité', async () => {
    const a = uid('Alpha');
    assert.equal(await webhook('checkout.session.completed', { id: session1.id, amount_total: 100, metadata: { diaspoactif_kofi_commande_id: String(cmd1) } }), 200);
    assert.equal(stock(a), 0); assert.equal(sql('select statut from kofi_commandes where id=?', cmd1)[0].statut, 'en_attente');
    assert.equal(await webhook('checkout.session.completed', { id: 'cs_x', amount_total: 300, metadata: { diaspoactif_kofi_commande_id: '99999' } }), 200);
    assert.equal(stock(a), 0);
  });

  await t.test('paiement confirmé : 1 € d\'utilisation crédité pour 12 mois (3 € payés) ; rejouer l\'événement ne crédite pas deux fois', async () => {
    const a = uid('Alpha');
    assert.equal(await webhook('checkout.session.completed', { id: session1.id, amount_total: 300, metadata: { diaspoactif_kofi_commande_id: String(cmd1) } }), 200);
    assert.ok(Math.abs(stock(a) - 1) < 1e-9, '3 € payés = 1 € d\'utilisation : ' + stock(a));
    const lot = sql("select * from kofi_solde where user_id=? and origine='achat'", a);
    assert.equal(lot.length, 1); assert.equal(lot[0].montant_total, 1);
    const mois = (new Date(String(lot[0].expire_le).replace(' ', 'T') + 'Z') - Date.now()) / 86400000;
    assert.ok(mois > 360 && mois < 370, 'valable ~12 mois : ' + mois);
    const c = sql('select * from kofi_commandes where id=?', cmd1)[0];
    assert.equal(c.statut, 'payee'); assert.equal(c.credit_id, lot[0].id); assert.ok(c.paye_le);
    for (let i = 0; i < 3; i++) assert.equal(await webhook('checkout.session.completed', { id: session1.id, amount_total: 300, metadata: { diaspoactif_kofi_commande_id: String(cmd1) } }), 200);
    assert.ok(Math.abs(stock(a) - 1) < 1e-9, 'idempotent');
    assert.equal(sql("select count(*) n from kofi_solde where user_id=? and origine='achat'", a)[0].n, 1);
    const e = await etatDe(jarA);
    assert.ok(Math.abs(e.data.portefeuille.achete_restant_eur - 1) < 1e-9); assert.ok(e.data.portefeuille.solde_eur > 1.4, 'crédit mensuel 0,50 € + 1 € acheté');
    assert.deepEqual(e.data.achat, { statut: 'payee' });
    const n = sql("select count(*) n from notifications where user_id=? and titre like 'Koffi%'", a)[0];
    assert.equal(n.n, 1, 'une seule notification');
  });

  await t.test('le crédit offert du mois sert d\'abord, le crédit acheté ensuite ; les retours téléphone / Annuaire sont des destinations connues', async () => {
    const a = uid('Alpha');
    const o = await call(jarA, 'POST', '/api/kofi/conversations', { formation_id: fid });
    const q = () => call(jarA, 'POST', `/api/kofi/conversations/${o.data.id}/messages`, { texte: 'Comment fonctionne la tontine solidaire ?' });
    let r = await q();
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(sql("select categorie from kofi_usage where user_id=? order by id desc limit 1", a)[0].categorie, 'eleve_mensuel');
    assert.ok(Math.abs(stock(a) - 1) < 1e-9, 'le crédit acheté est intact tant que le crédit du mois couvre');
    sql("UPDATE kofi_solde SET montant_restant=0 WHERE user_id=? AND origine='mensuel'", a);
    r = await q();
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(sql("select categorie from kofi_usage where user_id=? order by id desc limit 1", a)[0].categorie, 'eleve_achat');
    assert.ok(stock(a) < 1 && stock(a) > 0.99);
    /* session expirée (abandon du paiement) : commande close, aucun crédit */
    const r2 = await acheter(jarA, { accepte_non_remboursable: true });
    assert.equal(r2.status, 201, JSON.stringify(r2.data));
    const cmd2 = r2.data.commande_id; const s2 = sessionsStripe().find(s => s.metadata && s.metadata.diaspoactif_kofi_commande_id === String(cmd2));
    const avant = stock(a);
    assert.equal(await webhook('checkout.session.expired', { id: s2.id, metadata: { diaspoactif_kofi_commande_id: String(cmd2) } }), 200);
    assert.equal(sql('select statut from kofi_commandes where id=?', cmd2)[0].statut, 'expiree');
    assert.equal(stock(a), avant);
    /* Achat depuis l'appli téléphone ou l'Annuaire : Stripe ramène sur la bonne page. Seul un drapeau est accepté, jamais une adresse fournie par le client. */
    for (const [page, attendu] of [['telephone', '/m.html?kofi='], ['annuaire', '/annuaire.html?kofi='], ['createur', '/formations.html?kofi=']]) {
      const r3 = await acheter(jarA, { page, accepte_non_remboursable: true });
      assert.equal(r3.status, 201, JSON.stringify(r3.data));
      const s3 = sessionsStripe().find(x => x.metadata && x.metadata.diaspoactif_kofi_commande_id === String(r3.data.commande_id));
      assert.ok(s3.success_url.endsWith(attendu + 'succes'), s3.success_url); assert.ok(s3.cancel_url.endsWith(attendu + 'annule'), s3.cancel_url);
      assert.equal(await webhook('checkout.session.expired', { id: s3.id, metadata: { diaspoactif_kofi_commande_id: String(r3.data.commande_id) } }), 200);
    }
    const r4 = await acheter(jarA, { page: 'https://pirate.example/vol', accepte_non_remboursable: true });
    assert.equal(r4.status, 201, JSON.stringify(r4.data));
    const s4 = sessionsStripe().find(x => x.metadata && x.metadata.diaspoactif_kofi_commande_id === String(r4.data.commande_id));
    assert.ok(!/pirate/.test(s4.success_url + s4.cancel_url), 'une adresse envoyée par le client est ignorée'); assert.ok(s4.success_url.includes('/suivre-formation.html?id=' + fid), s4.success_url);
    assert.equal(await webhook('checkout.session.expired', { id: s4.id, metadata: { diaspoactif_kofi_commande_id: String(r4.data.commande_id) } }), 200);
    /* une commande expirée ne peut plus être créditée */
    assert.equal(await webhook('checkout.session.completed', { id: s2.id, amount_total: 300, metadata: { diaspoactif_kofi_commande_id: String(cmd2) } }), 200);
    assert.equal(stock(a), avant);
  });

  await t.test('un compte SANS Premium peut aussi recharger : ses 15 questions offertes restent, le crédit acheté s\'ajoute', async () => {
    const g = uid('Gamma');
    sql("INSERT OR IGNORE INTO kofi_majorite (user_id, confirme_le, version) VALUES (?, datetime('now'), 'test')", g);
    const e = await etatDe(jarC);
    assert.equal(e.data.etat, 'utilisable'); assert.equal(e.data.recharge.achetable, true); assert.equal(e.data.portefeuille.premium, false);
    const r = await acheter(jarC, { montant_eur: 15, accepte_non_remboursable: true });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const s = sessionsStripe().find(x => x.metadata && x.metadata.diaspoactif_kofi_commande_id === String(r.data.commande_id));
    assert.equal(s.montant, 1500);
    assert.equal(await webhook('checkout.session.completed', { id: s.id, amount_total: 1500, metadata: { diaspoactif_kofi_commande_id: String(r.data.commande_id) } }), 200);
    assert.ok(Math.abs(stock(g) - 5) < 1e-9, '15 € payés = 5 € d\'utilisation');
    const p = (await etatDe(jarC)).data.portefeuille;
    assert.equal(p.offertes.restantes, 15); assert.equal(p.mensuel_restant_eur, 0); assert.equal(p.achete_restant_eur, 5);
  });

  await t.test('réserve d\'IA épuisée : la vente est suspendue (on ne vend pas ce qui ne peut pas répondre)', async () => {
    assert.equal((await call(jarF, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: -50, type: 'ajustement' })).status, 201);
    const r = await acheter(jarA, { accepte_non_remboursable: true });
    assert.equal(r.status, 503, JSON.stringify(r.data)); assert.equal(r.data.code, 'indisponible');
    assert.equal((await etatDe(jarA)).data.recharge.achetable, false);
  });
});
