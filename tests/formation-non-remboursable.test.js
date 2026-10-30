/* ===========================================================
   tests/formation-non-remboursable.test.js — « aucun remboursement » (décision du 2026-10-30, à préciser partout)
   ===========================================================
   Une formation achetée appartient à l'élève, suivie ou non. Le serveur exige le consentement exprès (demande d'accès immédiat + renonciation à la
   rétractation) AVANT toute commande payante : une interface qui l'oublierait ne contourne rien. Preuve conservée sur la commande ; rappel posé sur la
   page de paiement Stripe. Un achat gratuit n'a pas besoin de ce consentement.
   Lancer : node --test tests/formation-non-remboursable.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const Droits = require('../server/formation-droits');

let env;
const journalStripe = path.join(os.tmpdir(), 'faux-stripe-nr-' + process.pid + '.log');
test.before(async () => {
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(path.join(__dirname, '_faux-stripe-preload.js')).replace(/\\\\/g, '/');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_factice';
  process.env.CRON_SECRET = 'cron_test_factice';
  process.env.FAUX_STRIPE_LOG = journalStripe;
  env = await H.demarrer('nonrembours');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalStripe); } catch (e) { /* absent */ } });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).all(...args); } finally { db.close(); } };

test('achat payant : refusé sans consentement, accepté avec ; preuve et rappel Stripe ; gratuit sans consentement', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), call = env.call;
  await H.creerFormateur(env, jarF, rnd, 'Formateur');
  await H.creerApprenant(env, jarA, rnd, 'Alpha');

  const creer = async titre => (await call(jarF, 'POST', '/api/formations', { titre, description: 'x' })).data.id;
  const payante = await creer('Formation payante ' + rnd);
  const gratuite = await creer('Formation gratuite ' + rnd);
  const sq = new H.DatabaseSync(env.dbPath);
  sq.prepare("UPDATE formations SET mode_acces='payant', prix=40, gratuit=0 WHERE id=?").run(payante);
  sq.prepare("UPDATE formations SET mode_acces='gratuit', prix=0, gratuit=1 WHERE id=?").run(gratuite);
  sq.close();
  H.publier(env, payante); H.publier(env, gratuite);

  /* 1. Sans consentement : refus net, texte renvoyé, AUCUNE trace (ni commande, ni droit, ni inscription). */
  let r = await call(jarA, 'POST', `/api/formations/${payante}/acquerir`, { accepte_non_remboursable: false });
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.equal(r.data.code, 'consentement_requis');
  assert.equal(r.data.texte, Droits.TEXTE_NON_REMBOURSABLE);
  assert.equal(r.data.retractation, Droits.TEXTE_RETRACTATION);
  assert.equal(r.data.montant, 40);
  assert.equal(sql('SELECT COUNT(*) n FROM formation_commandes WHERE formation_id=?', payante)[0].n, 0, 'aucune commande sans consentement');
  assert.equal(sql('SELECT COUNT(*) n FROM formation_acces WHERE formation_id=?', payante)[0].n, 0);
  assert.equal(sql('SELECT COUNT(*) n FROM formation_inscriptions WHERE formation_id=?', payante)[0].n, 0);
  /* Une valeur autre que « true » ne vaut pas consentement (chaîne, 1, objet…). */
  for (const faux of ['true', 1, 'oui', {}]) {
    r = await call(jarA, 'POST', `/api/formations/${payante}/inscrire`, { accepte_non_remboursable: faux });
    assert.equal(r.status, 409, 'valeur ' + JSON.stringify(faux));
  }

  /* 2. Avec consentement : la commande est créée, la preuve est datée et versionnée, le rappel est posé sur la page Stripe. */
  r = await call(jarA, 'POST', `/api/formations/${payante}/acquerir`, { accepte_non_remboursable: true });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.checkout_url, 'redirection vers le paiement');
  const cmd = sql('SELECT * FROM formation_commandes WHERE formation_id=?', payante);
  assert.equal(cmd.length, 1);
  assert.match(String(cmd[0].consentement_le), /^\d{4}-\d{2}-\d{2}T.* v2026-10-30$/, 'date + version du texte');
  const sessions = fs.readFileSync(journalStripe, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const s = sessions.find(x => x.metadata && x.metadata.diaspoactif_formation_commande_id === String(cmd[0].id));
  assert.ok(s, 'session Stripe créée');
  assert.equal(s.custom_text.submit.message, Droits.TEXTE_NON_REMBOURSABLE, 'rappel juste au-dessus du bouton Payer');
  assert.equal(s.metadata.consentement_non_remboursable, '2026-10-30');
  assert.equal(sql("SELECT COUNT(*) n FROM formation_acces WHERE formation_id=? AND statut='actif'", payante)[0].n, 0, 'rien n\'est accordé avant le paiement confirmé');

  /* 3. Gratuit : aucun consentement demandé. */
  r = await call(jarA, 'POST', `/api/formations/${gratuite}/inscrire`, { accepte_non_remboursable: false });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.ok, true);

  /* 4. Le texte est sans ambiguïté sur le fond. */
  assert.match(Droits.TEXTE_NON_REMBOURSABLE, /aucun remboursement/i);
  assert.match(Droits.TEXTE_NON_REMBOURSABLE, /que vous la suiviez ou non/i);
  assert.match(Droits.TEXTE_RETRACTATION, /droit de rétractation/i);
});
