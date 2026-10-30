/* ===========================================================
   tests/formation-paiement-simule.test.js — mode TEST « paiement simulé » (2026-10-30)
   ===========================================================
   FORMATION_PAIEMENT_SIMULE=1 : « Obtenir… » et « Finaliser mon paiement » ouvrent l'accès aussitôt, sans Stripe, pour pouvoir tester la formation.
   Le consentement « aucun remboursement » reste exigé ; la commande est enregistrée comme payée ; le mode est ignoré sur Vercel (production).
   Lancer : node --test tests/formation-paiement-simule.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

const sql = (env, req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).all(...args); } finally { db.close(); } };
const run = (env, req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).run(...args); } finally { db.close(); } };

async function formationPayante(env, jarF, rnd, titre) {
  const id = (await env.call(jarF, 'POST', '/api/formations', { titre: titre + ' ' + rnd, description: 'x' })).data.id;
  run(env, "UPDATE formations SET mode_acces='payant', prix=40, gratuit=0 WHERE id=?", id);
  H.publier(env, id);
  return id;
}

test('paiement simulé actif : achat, module, reprise « Finaliser mon paiement », consentement toujours exigé', async () => {
  process.env.FORMATION_PAIEMENT_SIMULE = '1'; delete process.env.VERCEL;
  const env = await H.demarrer('paiementsimule');
  try {
    const rnd = Math.random().toString(36).slice(2, 9);
    const jarF = H.cookieJar(), jarA = H.cookieJar(), call = env.call;
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    await H.creerApprenant(env, jarA, rnd, 'Alpha');
    const f = await formationPayante(env, jarF, rnd, 'Payante');

    /* Le consentement reste exigé : le test passe par le même parcours que le vrai. */
    let r = await call(jarA, 'POST', `/api/formations/${f}/acquerir`, { accepte_non_remboursable: false });
    assert.equal(r.status, 409); assert.equal(r.data.code, 'consentement_requis');

    /* Achat : accès immédiat, aucune redirection vers Stripe. */
    r = await call(jarA, 'POST', `/api/formations/${f}/acquerir`, {});
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.paiement_simule, true);
    assert.equal(r.data.checkout_url, undefined);
    const cmd = sql(env, 'SELECT * FROM formation_commandes WHERE formation_id=?', f);
    assert.equal(cmd.length, 1); assert.equal(cmd[0].statut, 'payee');
    assert.match(String(cmd[0].consentement_le), /paiement simulé/);
    const acces = sql(env, 'SELECT * FROM formation_acces WHERE formation_id=?', f);
    assert.equal(acces.length, 1); assert.equal(acces[0].statut, 'actif'); assert.equal(acces[0].module_cle, 0);
    const insc = sql(env, 'SELECT * FROM formation_inscriptions WHERE formation_id=?', f);
    assert.equal(insc[0].statut, 'active'); assert.equal(insc[0].paiement_statut, 'paye');

    /* Racheter une formation déjà obtenue reste refusé. */
    r = await call(jarA, 'POST', `/api/formations/${f}/acquerir`, {});
    assert.equal(r.status, 409);

    /* « Finaliser mon paiement » : une commande restée en attente est considérée comme payée. */
    const jarB = H.cookieJar();
    await H.creerApprenant(env, jarB, rnd, 'Beta');
    const g = await formationPayante(env, jarF, rnd, 'Reprise');
    const uid = sql(env, "SELECT id FROM users WHERE email LIKE ?", `test-utilisateur-${rnd}-beta@%`)[0].id;
    const i = run(env, "INSERT INTO formation_inscriptions (formation_id,user_id,montant_paye,acces_gratuit_membre,paiement_statut,portee) VALUES (?,?,0,0,'en_attente','formation')", g, uid);
    const c = run(env, "INSERT INTO formation_commandes (user_id,formation_id,montant,statut) VALUES (?,?,40,'en_attente')", uid, g);
    run(env, "INSERT INTO formation_acces (user_id,formation_id,module_cle,type_acces,statut,montant_paye,commande_id,inscription_id) VALUES (?,?,0,'paye','en_attente',0,?,?)", uid, g, c.lastInsertRowid, i.lastInsertRowid);
    r = await call(jarB, 'POST', `/api/formations/${g}/acquerir`, {});
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.paiement_simule, true);
    assert.equal(sql(env, 'SELECT statut FROM formation_commandes WHERE id=?', c.lastInsertRowid)[0].statut, 'payee');
    assert.equal(sql(env, 'SELECT statut FROM formation_acces WHERE commande_id=?', c.lastInsertRowid)[0].statut, 'actif');
    assert.equal(sql(env, 'SELECT paiement_statut FROM formation_inscriptions WHERE id=?', i.lastInsertRowid)[0].paiement_statut, 'paye');
  } finally { env.stop(); }
});

test('paiement simulé ignoré sur Vercel (production) : aucun accès sans vrai paiement', async () => {
  process.env.FORMATION_PAIEMENT_SIMULE = '1'; process.env.VERCEL = '1';
  const env = await H.demarrer('paiementsimuleprod');
  try {
    const rnd = Math.random().toString(36).slice(2, 9);
    const jarF = H.cookieJar(), jarA = H.cookieJar();
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    await H.creerApprenant(env, jarA, rnd, 'Alpha');
    const f = await formationPayante(env, jarF, rnd, 'Payante');
    const r = await env.call(jarA, 'POST', `/api/formations/${f}/acquerir`, {});
    assert.notEqual(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.paiement_simule, undefined);
    assert.equal(sql(env, "SELECT COUNT(*) n FROM formation_acces WHERE formation_id=? AND statut='actif'", f)[0].n, 0);
  } finally { env.stop(); delete process.env.VERCEL; delete process.env.FORMATION_PAIEMENT_SIMULE; }
});
