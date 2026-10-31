/* ===========================================================
   tests/reduction-comptes-lies.test.js — Réduction automatique « comptes liés » (2026-10-31)
   ===========================================================
   Base isolée (copie de la base de dev) + FAUX client Stripe en mémoire : aucun réseau, aucun vrai abonnement.
   On vérifie les RÈGLES de server/reduction-comptes-lies.js :
   - 2 abonnements Premium payants liés : le moins cher -20 %, le plus cher plein tarif ;
   - 3 abonnements : -20 % / -10 % / plein tarif ; le plafond de 20 % n'est jamais dépassé (code ET base) ;
   - l'annuel est comparé en équivalent mensuel ;
   - jamais de cumul : un coupon étranger (code D'A, parrainage) écarte le compte et n'est jamais touché ;
   - gratuité, premier paiement trop récent, résiliation programmée : non éligibles ;
   - idempotence ; simulation sans écriture ; réduction retirée quand le compte est délié ;
   - vue d'administration et nombre de comptes d'une personne.
   Lancer : node --test tests/reduction-comptes-lies.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');
const R = require('../server/reduction-comptes-lies');

let env, sq, db;
const rnd = Date.now().toString(36);

/* Enveloppe asynchrone minimale sur node:sqlite, même interface que db.prepare(...).get/all/run du serveur. */
function envelopper(sqlite) {
  return { prepare(sql) {
    const st = sqlite.prepare(sql);
    return { async get(...a) { return st.get(...a); }, async all(...a) { return st.all(...a); },
      async run(...a) { const r = st.run(...a); return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }; } };
  } };
}

/* Faux Stripe : abonnements et coupons en mémoire. */
function fauxStripe() {
  const subs = {}, coupons = {};
  return {
    subs, couponsCrees: coupons,
    ajouter(id, { montant, interval = 'month', status = 'active', cancel = false, coupon = null }) {
      subs[id] = { id, status, cancel_at_period_end: cancel, items: { data: [{ price: { unit_amount: Math.round(montant * 100), recurring: { interval, interval_count: 1 } } }] }, discount: coupon ? { coupon: { id: coupon } } : null };
    },
    subscriptions: {
      async retrieve(id) { if (!subs[id]) throw new Error('No such subscription'); return JSON.parse(JSON.stringify(subs[id])); },
      async update(id, o) { subs[id].discount = o.discounts && o.discounts[0] ? { coupon: { id: o.discounts[0].coupon } } : null; return subs[id]; },
      async deleteDiscount(id) { subs[id].discount = null; return { deleted: true }; },
    },
    coupons: {
      async retrieve(id) { if (!coupons[id]) throw new Error('No such coupon'); return coupons[id]; },
      async create(o) { coupons[o.id] = o; return o; },
    },
  };
}
const pctSur = (st, id) => { const d = st.subs[id].discount; return d ? R.pctDepuisCoupon(d.coupon.id) : 0; };

const comptes = {};
async function creerCompte(nom, role = 'utilisateur') {
  const c = H.compte(rnd, nom, role);
  const r = await env.call(null, 'POST', '/api/auth/signup', c);
  assert.equal(r.status, 201, 'inscription ' + nom + ' : ' + JSON.stringify(r.data));
  const u = sq.prepare('SELECT id FROM users WHERE email=?').get(c.email);
  comptes[nom] = u.id;
  return u.id;
}
function donnerPremiumPayant(userId, subId, { jours = 10, montant = 5, type = 'utilisateur_abonne' } = {}) {
  const def = sq.prepare('SELECT id FROM accred_definitions WHERE type=?').get(type);
  sq.prepare('DELETE FROM user_accreditations WHERE user_id=?').run(userId);
  sq.prepare(`INSERT INTO user_accreditations (user_id, accred_id, statut, type_tarif, montant_paye, stripe_subscription_id, premier_paiement_le)
    VALUES (?,?, 'active', 'mensuel', ?, ?, datetime('now', ?))`).run(userId, def.id, montant, subId, `-${jours} days`);
}
function lier(...ids) {
  const g = Number(sq.prepare('INSERT INTO comptes_lies_groupes DEFAULT VALUES').run().lastInsertRowid);
  for (const id of ids) sq.prepare('INSERT INTO comptes_lies_membres (groupe_id, user_id) VALUES (?,?)').run(g, id);
  return g;
}
const notifs = [];
const creerNotif = (userId, type, titre) => { notifs.push({ userId, type, titre }); };

test.before(async () => {
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(require('node:path').join(__dirname, '_faux-stripe-preload.js')).replace(/\\/g, '/');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_factice'; process.env.CRON_SECRET = 'cron_test_factice';
  process.env.DESACTIVER_MULTI_CONNEXION = '1'; process.env.DESACTIVER_CONFIRMATION_APPAREIL = '1';
  env = await H.demarrer('reduc');
  sq = new H.DatabaseSync(env.dbPath);
  db = envelopper(sq);
  for (const n of ['Alpha', 'Beta', 'Gamma', 'Delta']) await creerCompte(n);
});
test.afterEach(() => { sq.prepare('DELETE FROM comptes_lies_membres').run(); sq.prepare('DELETE FROM comptes_lies_groupes').run(); });
test.after(() => { try { sq.close(); } catch (e) { /* déjà fermée */ } if (env) env.stop(); });

test('règle pure : -20 / -10 / plein tarif, plafond 20 %', () => {
  assert.deepEqual([0].map(i => R.pctPourRang(i, 1)), [0]);
  assert.deepEqual([0, 1].map(i => R.pctPourRang(i, 2)), [20, 0]);
  assert.deepEqual([0, 1, 2].map(i => R.pctPourRang(i, 3)), [20, 10, 0]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => R.pctPourRang(i, 6)), [20, 10, 0, 0, 0, 0]);
  for (let n = 1; n <= 12; n++) for (let i = 0; i < n; i++) assert.ok(R.pctPourRang(i, n) <= 20);
  assert.equal(R.PLAFOND_PCT, 20);
});

test('la base refuse toute réduction au-dessus de 20 %', () => {
  assert.throws(() => sq.prepare("INSERT INTO reductions_comptes_lies (user_id, pct) VALUES (?, 30)").run(comptes.Alpha));
});

test('deux comptes payants liés : le moins cher à -20 %, le plus cher au plein tarif (exemple 10 € / 5 €)', async () => {
  const st = fauxStripe();
  donnerPremiumPayant(comptes.Alpha, 'sub_A'); st.ajouter('sub_A', { montant: 10 });
  donnerPremiumPayant(comptes.Beta, 'sub_B'); st.ajouter('sub_B', { montant: 5 });
  const g = lier(comptes.Alpha, comptes.Beta);
  const ctx = { db, stripe: st, creerNotif };
  const r = await R.evaluerGroupe(ctx, g);
  assert.equal(r.erreurs.length, 0);
  assert.equal(pctSur(st, 'sub_B'), 20);
  assert.equal(pctSur(st, 'sub_A'), 0);
  const rec = sq.prepare("SELECT * FROM reductions_comptes_lies WHERE user_id=? AND statut='active'").all(comptes.Beta);
  assert.equal(rec.length, 1); assert.equal(rec[0].pct, 20); assert.equal(rec[0].coupon_id, 'liaison_20_forever');
  assert.equal(sq.prepare('SELECT reduction_pct_appliquee AS p FROM user_accreditations WHERE user_id=?').get(comptes.Beta).p, 20);
  assert.ok(notifs.some(n => n.userId === comptes.Beta && n.type === 'reduction_comptes_lies'));
  /* idempotence */
  const r2 = await R.evaluerGroupe(ctx, g);
  assert.equal(r2.actions.length, 0);
  assert.equal(sq.prepare("SELECT COUNT(*) AS n FROM reductions_comptes_lies WHERE user_id=?").get(comptes.Beta).n, 1);
  sq.prepare('DELETE FROM comptes_lies_membres').run(); sq.prepare('DELETE FROM comptes_lies_groupes').run();
});

test('trois comptes (dont un annuel comparé en équivalent mensuel) : -20 / -10 / plein ; jamais plus de 20 %', async () => {
  const st = fauxStripe();
  donnerPremiumPayant(comptes.Alpha, 'sub_A'); st.ajouter('sub_A', { montant: 10 });
  donnerPremiumPayant(comptes.Beta, 'sub_B'); st.ajouter('sub_B', { montant: 5 });
  donnerPremiumPayant(comptes.Gamma, 'sub_C'); st.ajouter('sub_C', { montant: 96, interval: 'year' });   /* 8 €/mois */
  const g = lier(comptes.Alpha, comptes.Beta, comptes.Gamma);
  const r = await R.evaluerGroupe({ db, stripe: st, creerNotif }, g);
  assert.equal(r.erreurs.length, 0);
  assert.equal(pctSur(st, 'sub_B'), 20);
  assert.equal(pctSur(st, 'sub_C'), 10);
  assert.equal(pctSur(st, 'sub_A'), 0);
  for (const id of Object.keys(st.couponsCrees)) assert.ok(st.couponsCrees[id].percent_off <= 20);
  assert.deepEqual(Object.keys(st.couponsCrees).sort(), ['liaison_10_forever', 'liaison_20_forever']);
  /* un quatrième compte plus cher que tous : tous les rangs se recalculent, le plus cher reste plein tarif */
  donnerPremiumPayant(comptes.Delta, 'sub_D'); st.ajouter('sub_D', { montant: 20 });
  sq.prepare('INSERT INTO comptes_lies_membres (groupe_id, user_id) VALUES (?,?)').run(g, comptes.Delta);
  await R.evaluerGroupe({ db, stripe: st, creerNotif }, g);
  assert.deepEqual(['sub_B', 'sub_C', 'sub_A', 'sub_D'].map(i => pctSur(st, i)), [20, 10, 0, 0]);
  assert.equal(sq.prepare("SELECT COUNT(*) AS n FROM reductions_comptes_lies WHERE statut='active'").get().n, 2);
  sq.prepare('DELETE FROM comptes_lies_membres').run(); sq.prepare('DELETE FROM comptes_lies_groupes').run();
});

test('réduction retirée quand un compte est délié (reste un seul compte payant)', async () => {
  const st = fauxStripe();
  donnerPremiumPayant(comptes.Alpha, 'sub_A'); st.ajouter('sub_A', { montant: 10 });
  donnerPremiumPayant(comptes.Beta, 'sub_B'); st.ajouter('sub_B', { montant: 5 });
  const g = lier(comptes.Alpha, comptes.Beta);
  const ctx = { db, stripe: st, creerNotif };
  await R.evaluerGroupe(ctx, g);
  assert.equal(pctSur(st, 'sub_B'), 20);
  sq.prepare('DELETE FROM comptes_lies_membres WHERE user_id=?').run(comptes.Beta);   /* Beta délié */
  const o = await R.retirerOrphelins(ctx);
  assert.equal(pctSur(st, 'sub_B'), 0);
  assert.equal(o.actions.length, 1);
  assert.equal(sq.prepare("SELECT COUNT(*) AS n FROM reductions_comptes_lies WHERE user_id=? AND statut='active'").get(comptes.Beta).n, 0);
  assert.equal(sq.prepare('SELECT reduction_pct_appliquee AS p FROM user_accreditations WHERE user_id=?').get(comptes.Beta).p, 0);
  assert.ok(notifs.some(n => n.userId === comptes.Beta && n.type === 'reduction_comptes_lies_fin'));
  sq.prepare('DELETE FROM comptes_lies_membres').run(); sq.prepare('DELETE FROM comptes_lies_groupes').run();
});

test('non éligibles : gratuité, premier paiement trop récent, résiliation programmée, abonnement non actif', async () => {
  const st = fauxStripe();
  donnerPremiumPayant(comptes.Alpha, 'sub_A'); st.ajouter('sub_A', { montant: 10 });
  donnerPremiumPayant(comptes.Beta, 'sub_B', { jours: 0 }); st.ajouter('sub_B', { montant: 5 });                 /* payé à l'instant : trop récent */
  donnerPremiumPayant(comptes.Gamma, 'sub_C'); st.ajouter('sub_C', { montant: 4, cancel: true });                 /* résiliation programmée */
  donnerPremiumPayant(comptes.Delta, 'sub_D'); st.ajouter('sub_D', { montant: 3, status: 'past_due' });           /* impayé */
  const g = lier(comptes.Alpha, comptes.Beta, comptes.Gamma, comptes.Delta);
  const r = await R.evaluerGroupe({ db, stripe: st, creerNotif }, g);
  assert.equal(r.nb_eligibles, 1);
  assert.equal(r.actions.length, 0);
  assert.deepEqual(r.comptes.map(c => c.raison).sort(), [null, 'abonnement_non_actif', 'premier_paiement_trop_recent', 'resiliation_programmee'].sort());
  /* gratuité : montant_paye = 0 */
  sq.prepare('UPDATE user_accreditations SET montant_paye=0 WHERE user_id=?').run(comptes.Alpha);
  const r2 = await R.evaluerGroupe({ db, stripe: st, creerNotif }, g);
  assert.equal(r2.comptes.find(c => c.user_id === comptes.Alpha).raison, 'pas_de_premium_payant');
  sq.prepare('DELETE FROM comptes_lies_membres').run(); sq.prepare('DELETE FROM comptes_lies_groupes').run();
});

test('jamais de cumul : un coupon étranger écarte le compte et n\'est jamais touché', async () => {
  const st = fauxStripe();
  donnerPremiumPayant(comptes.Alpha, 'sub_A'); st.ajouter('sub_A', { montant: 10 });
  donnerPremiumPayant(comptes.Beta, 'sub_B'); st.ajouter('sub_B', { montant: 5, coupon: 'parrainage_50_300j' });   /* déjà -50 % par parrainage */
  donnerPremiumPayant(comptes.Gamma, 'sub_C'); st.ajouter('sub_C', { montant: 8 });
  const g = lier(comptes.Alpha, comptes.Beta, comptes.Gamma);
  await R.evaluerGroupe({ db, stripe: st, creerNotif }, g);
  assert.equal(st.subs.sub_B.discount.coupon.id, 'parrainage_50_300j');   /* intact */
  assert.equal(pctSur(st, 'sub_C'), 20);                                  /* le moins cher des deux comptes éligibles restants */
  assert.equal(pctSur(st, 'sub_A'), 0);
  sq.prepare('DELETE FROM comptes_lies_membres').run(); sq.prepare('DELETE FROM comptes_lies_groupes').run();
});

test('simulation : rien n\'est écrit, ni chez Stripe ni en base', async () => {
  const st = fauxStripe();
  donnerPremiumPayant(comptes.Alpha, 'sub_A'); st.ajouter('sub_A', { montant: 10 });
  donnerPremiumPayant(comptes.Beta, 'sub_B'); st.ajouter('sub_B', { montant: 5 });
  const g = lier(comptes.Alpha, comptes.Beta);
  const avant = sq.prepare('SELECT COUNT(*) AS n FROM reductions_comptes_lies').get().n;
  const r = await R.evaluerGroupe({ db, stripe: st, creerNotif }, g, { simuler: true });
  assert.equal(r.actions.length, 1); assert.equal(r.actions[0].vers, 20); assert.equal(r.actions[0].fait, false);
  assert.equal(pctSur(st, 'sub_B'), 0);
  assert.equal(sq.prepare('SELECT COUNT(*) AS n FROM reductions_comptes_lies').get().n, avant);
  const vue = await R.listerGroupesAdmin(db);
  assert.equal(vue.length, 1); assert.equal(vue[0].nb_comptes, 2); assert.equal(vue[0].nb_premium_payants, 2);
  const p = await R.nombreComptesDePersonne(db, comptes.Alpha);
  assert.equal(p.nb_comptes, 2);
  assert.equal((await R.nombreComptesDePersonne(db, comptes.Delta)).nb_comptes, 1);
});

test('la liaison par l\'API prévient les comptes (notification + message)', async () => {
  sq.prepare('DELETE FROM comptes_lies_membres').run(); sq.prepare('DELETE FROM comptes_lies_groupes').run();
  const jar = H.cookieJar ? H.cookieJar() : null;
  /* le DS-ID n'est généré qu'au démarrage du serveur pour les comptes créés ensuite : on en pose un de test */
  const dsDelta = 'TSTDS' + rnd.slice(-4).toUpperCase().padStart(4, '0');
  sq.prepare('UPDATE users SET ds_id=? WHERE id=?').run(dsDelta, comptes.Delta);
  const c = H.compte(rnd, 'Alpha', 'utilisateur');
  const lg = await env.call(jar, 'POST', '/api/auth/login', { email: c.email, password: c.password });
  assert.equal(lg.status, 200, JSON.stringify(lg.data));
  const r = await env.call(jar, 'POST', '/api/comptes-lies/lier', { ds_id: dsDelta });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.info_reduction, /20 %/);
  const n = sq.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type='comptes_lies_reduction_info' AND user_id IN (?,?)").get(comptes.Alpha, comptes.Delta).n;
  assert.equal(n, 2);
});

async function webhook(type, objet) {
  const res = await fetch(env.base + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 'x' }, body: JSON.stringify({ type, data: { object: objet } }) });
  return res.status;
}

test('webhook : la date du premier prélèvement RÉEL est retenue (jamais une facture à 0), une seule fois', async () => {
  donnerPremiumPayant(comptes.Alpha, 'sub_W');
  sq.prepare('UPDATE user_accreditations SET premier_paiement_le=NULL WHERE user_id=?').run(comptes.Alpha);
  const lire = () => sq.prepare('SELECT premier_paiement_le AS d FROM user_accreditations WHERE user_id=?').get(comptes.Alpha).d;
  assert.equal(await webhook('invoice.payment_succeeded', { subscription: 'sub_W', amount_paid: 0, billing_reason: 'subscription_create' }), 200);
  assert.equal(lire(), null);                       /* période offerte : facture à 0, rien retenu */
  assert.equal(await webhook('invoice.payment_succeeded', { subscription: 'sub_W', amount_paid: 500, billing_reason: 'subscription_cycle' }), 200);
  const premiere = lire();
  assert.ok(premiere);
  sq.prepare("UPDATE user_accreditations SET premier_paiement_le='2020-01-01 00:00:00' WHERE user_id=?").run(comptes.Alpha);
  await webhook('invoice.payment_succeeded', { subscription: 'sub_W', amount_paid: 500, billing_reason: 'subscription_cycle' });
  assert.equal(lire(), '2020-01-01 00:00:00');      /* jamais écrasée par une facture suivante */
});

test('administration : vue des comptes liés réservée aux administrateurs, tâche automatique protégée', async () => {
  donnerPremiumPayant(comptes.Alpha, 'sub_A'); donnerPremiumPayant(comptes.Beta, 'sub_B', { montant: 5 });
  lier(comptes.Alpha, comptes.Beta);
  const visiteur = await env.call(null, 'GET', '/api/admin/comptes-lies/groupes');
  assert.equal(visiteur.status, 403);
  /* Un administrateur : on promeut un compte de test dans la base isolée */
  const c = H.compte(rnd, 'Gamma', 'utilisateur');
  sq.prepare("UPDATE users SET role='administrateur' WHERE id=?").run(comptes.Gamma);
  const jar = H.cookieJar();
  const lg = await env.call(jar, 'POST', '/api/auth/login', { email: c.email, password: c.password });
  assert.equal(lg.status, 200, JSON.stringify(lg.data));
  const v = await env.call(jar, 'GET', '/api/admin/comptes-lies/groupes');
  assert.equal(v.status, 200, JSON.stringify(v.data));
  assert.equal(v.data.plafond_pct, 20);
  assert.equal(v.data.groupes.length, 1);
  assert.equal(v.data.groupes[0].nb_comptes, 2);
  assert.equal(v.data.groupes[0].nb_premium_payants, 2);
  const p = await env.call(jar, 'GET', '/api/admin/comptes-lies/personne/' + comptes.Alpha);
  assert.equal(p.status, 200); assert.equal(p.data.nb_comptes, 2);
  /* tâche automatique : refusée sans le secret, acceptée avec */
  const sans = await fetch(env.base + '/api/cron/reductions-comptes-lies');
  assert.equal(sans.status, 401);
  const avec = await fetch(env.base + '/api/cron/reductions-comptes-lies', { headers: { Authorization: 'Bearer cron_test_factice' } });
  assert.equal(avec.status, 200);
  sq.prepare("UPDATE users SET role='utilisateur' WHERE id=?").run(comptes.Gamma);
});
