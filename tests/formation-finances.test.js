/* ===========================================================
   tests/formation-finances.test.js — Formation Diaspora, lot B : l'argent (2026-10-30)
   ===========================================================
   Promotion appliquée au paiement, coupons (pourcentage, montant fixe, dates, limites totale et par personne, coupons globaux),
   commission par formateur écrite à chaque vente, vues « Ventes et revenus » (formateur) et financière (administration).
   Intégration HTTP réelle, base SQLite isolée, faux Stripe — voir tests/_formation-harness.js et tests/_faux-stripe-preload.js.
   Lancer : node --test tests/formation-finances.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./_formation-harness');

let env;
test.before(async () => {
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(path.join(__dirname, '_faux-stripe-preload.js')).replace(/\\\\/g, '/');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_factice';
  env = await H.demarrer('finances');
});
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
async function webhook(type, objet) {
  const res = await fetch(env.base + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 'x' }, body: JSON.stringify({ type, data: { object: objet } }) });
  return res.status;
}
const paye = (commandeId, montant) => webhook('checkout.session.completed', { id: 'cs_x', amount_total: Math.round(montant * 100), metadata: { diaspoactif_formation_commande_id: String(commandeId) } });
const jour = (decalage) => new Date(Date.now() + decalage * 86400000).toISOString().slice(0, 10);

test('argent : promotion, coupons, commission, ventes', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarB = H.cookieJar(), jarC = H.cookieJar(), jarD = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid, m1, formateurId;
  const coupon = async (extra) => call(jarF, 'POST', `/api/formations/${fid}/coupons`, extra);
  const verifier = (jar, code, mod) => call(jar, 'POST', `/api/formations/${fid}/coupon/verifier`, { code, module_id: mod });
  const commandeDe = (nom) => sql('select c.* from formation_commandes c join users u on u.id=c.user_id where c.formation_id=? and u.nom=? order by c.id desc', fid, nom)[0];

  await t.test('setup — formation payante 100 €, un module vendu seul 20 €, quatre apprenants', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    for (const [jar, nom] of [[jarA, 'Alpha'], [jarB, 'Bravo'], [jarC, 'Charlie'], [jarD, 'Delta']]) await H.creerApprenant(env, jar, rnd, nom);
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Finances ' + rnd, description: 'x' })).data.id;
    sql("UPDATE formations SET mode_acces='payant', prix=100, gratuit=0 WHERE id=?", fid);
    formateurId = sql('select owner_user_id o from formations where id=?', fid)[0].o;
    const m = await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'Module un', vendable_seul: 1, prix: 20 });
    assert.equal(m.status, 201, JSON.stringify(m.data));
    m1 = m.data.id;
    H.publier(env, fid);
  });

  await t.test('la promotion de la formation est enfin appliquée : fiche et paiement', async () => {
    sql("UPDATE formations SET promo_active=1, promo_reduction_pct=10, promo_date_fin=? WHERE id=?", jour(5), fid);
    let r = await call(anon, 'GET', `/api/formations/${fid}/offre`);
    assert.equal(r.data.formation.prix, 90); assert.equal(r.data.formation.prix_catalogue, 100); assert.equal(r.data.formation.promo_pct, 10);
    assert.equal(r.data.modules[0].prix, 20, 'un module vendu seul garde son prix');
    sql("UPDATE formations SET promo_date_fin=? WHERE id=?", jour(-1), fid);
    r = await call(anon, 'GET', `/api/formations/${fid}/offre`);
    assert.equal(r.data.formation.prix, 100, 'promotion terminée : plein tarif'); assert.equal(r.data.formation.promo_pct, null);
    sql("UPDATE formations SET promo_date_fin=? WHERE id=?", jour(0), fid);
    r = await call(anon, 'GET', `/api/formations/${fid}/offre`);
    assert.equal(r.data.formation.prix, 90, 'le dernier jour de la promotion est inclus');
  });

  await t.test('créer un coupon : validations', async () => {
    assert.equal((await coupon({ code: 'ab', reduction_pct: 10 })).status, 400, 'code trop court');
    assert.equal((await coupon({ code: 'OK10', reduction_pct: 0 })).status, 400);
    assert.equal((await coupon({ code: 'OK10', reduction_pct: 101 })).status, 400);
    assert.equal((await coupon({ code: 'OK10', type_reduction: 'montant', montant_fixe: 0 })).status, 400);
    assert.equal((await coupon({ code: 'OK10', reduction_pct: 10, date_debut: jour(3), date_fin: jour(1) })).status, 400, 'fin avant début');
    assert.equal((await coupon({ code: 'OK10', reduction_pct: 10, max_utilisations: -3 })).status, 400);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/coupons`, { code: 'PIRATE', reduction_pct: 90 })).status, 403, 'un apprenant ne crée pas de coupon');
    const ok = await coupon({ code: ' promo20 ', reduction_pct: 20, max_utilisations: 2 });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal((await coupon({ code: 'PROMO20', reduction_pct: 5 })).status, 400, 'code déjà pris');
    const liste = await call(jarF, 'GET', `/api/formations/${fid}/coupons`);
    const c = liste.data.coupons.find(x => x.code === 'PROMO20');
    assert.equal(c.reduction_pct, 20); assert.equal(c.nb_utilises, 0); assert.equal(c.type_reduction, 'pourcentage'); assert.equal(c.max_par_utilisateur, 1);
  });

  await t.test('vérifier un code : prix recalculé par le serveur (promotion puis coupon), refus expliqués', async () => {
    let r = await verifier(jarA, 'promo20');
    assert.equal(r.status, 200); assert.equal(r.data.valide, true);
    assert.equal(r.data.prix_avant, 90); assert.equal(r.data.remise, 18); assert.equal(r.data.prix_final, 72);
    r = await verifier(jarA, 'INCONNU'); assert.equal(r.data.valide, false);
    r = await verifier(jarA, ''); assert.equal(r.data.valide, false);
    assert.equal((await verifier(anon, 'PROMO20')).status, 401, 'connexion requise');
    assert.equal((await coupon({ code: 'FUTUR', reduction_pct: 50, date_debut: jour(4) })).status, 201);
    r = await verifier(jarA, 'FUTUR'); assert.equal(r.data.valide, false); assert.match(r.data.erreur, /à partir du/);
    assert.equal((await coupon({ code: 'PERIME', reduction_pct: 50, date_fin: jour(-1) })).status, 201);
    r = await verifier(jarA, 'PERIME'); assert.equal(r.data.valide, false); assert.match(r.data.erreur, /expiré/);
    const id = (await call(jarF, 'GET', `/api/formations/${fid}/coupons`)).data.coupons.find(x => x.code === 'FUTUR').id;
    assert.equal((await call(jarF, 'PATCH', `/api/formations/${fid}/coupons/${id}`, { actif: false })).status, 200);
    r = await verifier(jarA, 'FUTUR'); assert.equal(r.data.valide, false);
    /* montant fixe : jamais plus que le prix, et pas sous le minimum de paiement de 0,50 € */
    assert.equal((await coupon({ code: 'MOINS15', type_reduction: 'montant', montant_fixe: 15 })).status, 201);
    r = await verifier(jarA, 'MOINS15'); assert.equal(r.data.remise, 15); assert.equal(r.data.prix_final, 75);
    assert.equal((await coupon({ code: 'PRESQUE', type_reduction: 'montant', montant_fixe: 89.8 })).status, 201);
    r = await verifier(jarA, 'PRESQUE'); assert.equal(r.data.valide, false); assert.match(r.data.erreur, /minimum/);
    assert.equal((await coupon({ code: 'TOUT', type_reduction: 'montant', montant_fixe: 500 })).status, 201);
    r = await verifier(jarA, 'TOUT'); assert.equal(r.data.valide, true); assert.equal(r.data.prix_final, 0, 'un coupon ne rend pas le prix négatif');
    /* sur un module : calculé sur le prix du module */
    r = await verifier(jarA, 'PROMO20', m1); assert.equal(r.data.prix_avant, 20); assert.equal(r.data.prix_final, 16);
  });

  await t.test('achat avec coupon : le serveur recalcule, la commande garde le détail, le paiement n\'est validé que par le webhook', async () => {
    const r = await call(jarA, 'POST', `/api/formations/${fid}/inscrire`, { coupon: 'promo20' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.ok(r.data.checkout_url);
    const c = commandeDe('Alpha');
    assert.equal(c.statut, 'en_attente'); assert.equal(c.montant, 72); assert.equal(c.prix_initial, 100); assert.equal(c.promo_pct, 10);
    assert.equal(c.remise, 18); assert.equal(c.coupon_code, 'PROMO20'); assert.equal(c.coupon_source, 'formation');
    assert.equal(sql('select count(*) n from formation_acces where user_id=(select id from users where nom=?) and statut=?', 'Alpha', 'actif')[0].n, 0, 'aucun accès avant le paiement');
    const avant = sql('select wallet_balance w from users where id=?', formateurId)[0].w || 0;
    assert.equal(await paye(c.id, 72), 200);
    assert.equal(await paye(c.id, 72), 200, 'deuxième envoi du même événement : sans effet');
    const apres = commandeDe('Alpha');
    assert.equal(apres.statut, 'payee'); assert.equal(apres.commission_pct, 3); assert.equal(apres.commission, 2.16); assert.equal(apres.net_formateur, 69.84);
    const w = sql('select wallet_balance w from users where id=?', formateurId)[0].w;
    assert.equal(Math.round((w - avant) * 100) / 100, 69.84, 'le formateur est crédité du net, une seule fois');
  });

  await t.test('limites : une fois par personne, limite totale (les paiements en cours comptent)', async () => {
    let r = await verifier(jarA, 'PROMO20', m1);
    assert.equal(r.data.valide, false); assert.match(r.data.erreur, /déjà utilisé/);
    r = await call(jarD, 'POST', `/api/formations/${fid}/acquerir`, { module_id: m1, coupon: 'INCONNU' });
    assert.equal(r.status, 400); assert.equal(r.data.code, 'coupon_refuse');
    assert.equal(sql("select count(*) n from formation_commandes c join users u on u.id=c.user_id where u.nom='Delta'")[0].n, 0, 'un code refusé ne laisse aucune commande');
    /* Bravo a un paiement en cours avec le code : c'est la 2e utilisation sur 2 */
    r = await call(jarB, 'POST', `/api/formations/${fid}/inscrire`, { coupon: 'PROMO20' });
    assert.equal(r.status, 201);
    r = await verifier(jarC, 'PROMO20'); assert.equal(r.data.valide, false); assert.match(r.data.erreur, /limite/);
    r = await call(jarC, 'POST', `/api/formations/${fid}/inscrire`, { coupon: 'PROMO20' });
    assert.equal(r.status, 400);
    /* Bravo reprend son paiement : son propre paiement en cours ne le bloque pas */
    r = await call(jarB, 'POST', `/api/formations/${fid}/inscrire`, { coupon: 'PROMO20' });
    assert.ok([200, 201].includes(r.status), JSON.stringify(r.data));
  });

  await t.test('un coupon qui couvre tout le prix ouvre l\'accès sans paiement, sans passer dans les ventes', async () => {
    const r = await call(jarD, 'POST', `/api/formations/${fid}/inscrire`, { coupon: 'TOUT' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); assert.ok(!r.data.checkout_url);
    const c = commandeDe('Delta');
    assert.equal(c.statut, 'payee'); assert.equal(c.montant, 0); assert.equal(c.coupon_code, 'TOUT');
    assert.equal(sql("select type_acces t from formation_acces where user_id=(select id from users where nom='Delta') and formation_id=? and module_cle=0", fid)[0].t, 'code');
  });

  await t.test('coupon global : valable sur toutes les formations du formateur, géré par lui seul', async () => {
    assert.equal((await call(jarF, 'POST', '/api/formateur/coupons-globaux', { code: 'PROMO20', reduction_pct: 10 })).status, 400, 'même code qu\'un coupon de formation');
    const g = await call(jarF, 'POST', '/api/formateur/coupons-globaux', { code: 'rentree', type_reduction: 'montant', montant_fixe: 10, max_par_utilisateur: 1 });
    assert.equal(g.status, 201, JSON.stringify(g.data));
    assert.equal((await coupon({ code: 'RENTREE', reduction_pct: 5 })).status, 400, 'et dans l\'autre sens');
    let r = await verifier(jarC, 'RENTREE');
    assert.equal(r.data.valide, true); assert.equal(r.data.prix_final, 80);
    assert.equal((await call(jarC, 'GET', '/api/formateur/coupons-globaux')).data.coupons.length, 0, 'un autre compte ne voit pas ces coupons');
    assert.equal((await call(jarC, 'DELETE', `/api/formateur/coupons-globaux/${g.data.id}`)).status, 200);
    r = await verifier(jarC, 'RENTREE'); assert.equal(r.data.valide, true, 'un autre compte ne peut pas le supprimer');
    /* une autre formation du même formateur */
    const f2 = (await call(jarF, 'POST', '/api/formations', { titre: 'Deuxième ' + rnd, description: 'x' })).data.id;
    sql("UPDATE formations SET mode_acces='payant', prix=50, gratuit=0 WHERE id=?", f2); H.publier(env, f2);
    r = await call(jarC, 'POST', `/api/formations/${f2}/coupon/verifier`, { code: 'RENTREE' });
    assert.equal(r.data.valide, true); assert.equal(r.data.prix_final, 40);
    /* la formation d'un AUTRE formateur ne l'accepte pas */
    sql("UPDATE users SET role='administrateur' WHERE nom='Delta'"); const jarG = jarD; /* Delta devient le formateur d'une autre formation (la limite de 5 inscriptions par heure interdit d'en créer un sixième compte) */
    const f3 = (await call(jarG, 'POST', '/api/formations', { titre: 'Autre ' + rnd, description: 'x' })).data.id;
    sql("UPDATE formations SET mode_acces='payant', prix=50, gratuit=0 WHERE id=?", f3); H.publier(env, f3);
    r = await call(jarC, 'POST', `/api/formations/${f3}/coupon/verifier`, { code: 'RENTREE' });
    assert.equal(r.data.valide, false);
    /* achat avec le coupon global puis désactivation */
    r = await call(jarC, 'POST', `/api/formations/${f2}/inscrire`, { coupon: 'RENTREE' });
    assert.equal(r.status, 201);
    const c = sql('select * from formation_commandes where formation_id=? order by id desc', f2)[0];
    assert.equal(c.coupon_source, 'global'); assert.equal(c.montant, 40);
    assert.equal((await call(jarF, 'PATCH', `/api/formateur/coupons-globaux/${g.data.id}`, { actif: false })).status, 200);
    r = await call(jarD, 'POST', `/api/formations/${f2}/coupon/verifier`, { code: 'RENTREE' });
    assert.equal(r.data.valide, false);
  });

  await t.test('commission : 3 % par défaut, taux propre à un formateur fixé par l\'administration, sans toucher aux ventes passées', async () => {
    assert.equal((await call(jarA, 'GET', '/api/admin/formations/commissions')).status, 403);
    assert.equal((await call(jarA, 'PUT', `/api/admin/formations/commissions/${formateurId}`, { pct: 0 })).status, 403, 'un apprenant ne fixe pas sa commission');
    assert.equal((await call(jarF, 'PUT', `/api/admin/formations/commissions/${formateurId}`, { pct: 45 })).status, 400, 'plafond');
    assert.equal((await call(jarF, 'PUT', `/api/admin/formations/commissions/${formateurId}`, { pct: -1 })).status, 400);
    assert.equal((await call(jarF, 'PUT', '/api/admin/formations/commissions/99999999', { pct: 5 })).status, 404);
    assert.equal((await call(jarF, 'PUT', `/api/admin/formations/commissions/${formateurId}`, { pct: 10, note: 'Partenaire historique' })).status, 200);
    /* Bravo paie maintenant : 72 € à 10 % */
    const cB = commandeDe('Bravo');
    assert.equal(await paye(cB.id, 72), 200);
    const b = commandeDe('Bravo');
    assert.equal(b.commission_pct, 10); assert.equal(b.commission, 7.2); assert.equal(b.net_formateur, 64.8);
    assert.equal(commandeDe('Alpha').commission_pct, 3, 'la vente d\'avant garde son taux de 3 %');
    const liste = await call(jarF, 'GET', '/api/admin/formations/commissions');
    assert.equal(liste.data.defaut, 3); assert.equal(liste.data.commissions.length, 1); assert.equal(liste.data.commissions[0].pct, 10);
    /* retour au taux par défaut */
    assert.equal((await call(jarF, 'DELETE', `/api/admin/formations/commissions/${formateurId}`)).status, 200);
    assert.equal((await call(jarF, 'GET', '/api/admin/formations/commissions')).data.commissions.length, 0);
  });

  await t.test('« Ventes et revenus » du formateur : totaux, par formation, par code, filtres, export', async () => {
    const r = await call(jarF, 'GET', '/api/formateur/ventes');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    /* Alpha 72 (3 %) + Bravo 72 (10 %) ; le coupon à 100 % n'est pas une vente ; la commande en attente de Charlie non plus */
    assert.equal(r.data.totaux.nb, 2); assert.equal(r.data.totaux.brut, 144); assert.equal(r.data.totaux.remises, 36);
    assert.equal(r.data.totaux.commission, 9.36); assert.equal(r.data.totaux.net, 134.64);
    assert.equal(r.data.par_formation.length, 1); assert.equal(r.data.par_formation[0].brut, 144);
    assert.equal(r.data.par_coupon[0].code, 'PROMO20'); assert.equal(r.data.par_coupon[0].nb, 2);
    assert.equal(r.data.commission_pct, 3);
    assert.equal(r.data.ventes[0].libelle.includes('Finances'), true);
    const filtre = await call(jarF, 'GET', `/api/formateur/ventes?du=${jour(1)}`);
    assert.equal(filtre.data.totaux.nb, 0, 'aucune vente après demain');
    assert.equal((await call(jarF, 'GET', '/api/formateur/ventes?du=hier')).status, 400);
    assert.equal((await call(anon, 'GET', '/api/formateur/ventes')).status, 401);
    const autre = await call(jarA, 'GET', '/api/formateur/ventes');
    assert.equal(autre.data.totaux.nb, 0, 'un autre compte ne voit jamais ces ventes');
    const csv = await fetch(env.base + '/api/formateur/ventes?format=csv', { headers: { Cookie: (() => { const h = {}; jarF.apply(h); return h.Cookie; })() } });
    assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/);
    const texte = await csv.text();
    assert.match(texte, /Net formateur/); assert.match(texte, /PROMO20/); assert.equal(texte.trim().split('\r\n').length, 3);
  });

  await t.test('vue financière de l\'administration : réservée aux administrateurs, par formateur', async () => {
    assert.equal((await call(jarA, 'GET', '/api/admin/formations/finances')).status, 403);
    assert.equal((await call(anon, 'GET', '/api/admin/formations/finances')).status, 403);
    const r = await call(jarF, 'GET', '/api/admin/formations/finances');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.totaux.nb >= 2); assert.ok(r.data.totaux.commission >= 9.36);
    const moi = r.data.par_formateur.find(x => x.formateur_id === Number(formateurId));
    assert.ok(moi && moi.brut >= 144); assert.equal(moi.personnalisee, false);
    assert.ok(Array.isArray(r.data.par_mois) && r.data.par_mois.length >= 1);
    const csv = await fetch(env.base + '/api/admin/formations/finances?format=csv', { headers: { Cookie: (() => { const h = {}; jarF.apply(h); return h.Cookie; })() } });
    assert.match(await csv.text(), /Formateur/);
  });

  await t.test('anciennes inscriptions payantes (avant les commandes) : comptées avec le taux de l\'époque, 3 %', async () => {
    const uid = sql("select id from users where nom='Alpha'")[0].id;
    const f2 = sql("select id from formations where titre like 'Deuxième%'")[0].id;
    sql("INSERT INTO formation_inscriptions (formation_id,user_id,montant_paye,paiement_statut,statut) VALUES (?,?,50,'paye','active')", f2, uid);
    const r = await call(jarF, 'GET', '/api/formateur/ventes');
    assert.equal(r.data.totaux.nb, 3); assert.equal(r.data.totaux.brut, 194);
    assert.equal(r.data.ventes.find(v => v.source === 'inscription').commission, 1.5);
  });

  await t.test('supprimer un coupon', async () => {
    const id = (await call(jarF, 'GET', `/api/formations/${fid}/coupons`)).data.coupons.find(x => x.code === 'PERIME').id;
    assert.equal((await call(jarA, 'DELETE', `/api/formations/${fid}/coupons/${id}`)).status, 403);
    assert.equal((await call(jarF, 'DELETE', `/api/formations/${fid}/coupons/${id}`)).status, 200);
    assert.equal((await call(jarF, 'GET', `/api/formations/${fid}/coupons`)).data.coupons.some(x => x.code === 'PERIME'), false);
  });
});
