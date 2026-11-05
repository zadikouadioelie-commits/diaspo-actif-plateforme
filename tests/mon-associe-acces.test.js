/* ===========================================================
   tests/mon-associe-acces.test.js — Mon Associé : qui peut écrire (règle du titulaire, 2026-11-05)
   ===========================================================
   Tous les comptes SAUF les comptes Utilisateur peuvent publier leurs recherches de collaborateurs et candidater, sans Premium
   et sans connexion séparée par code de sécurité : être connecté à son compte suffit. Le compte Utilisateur reste en lecture seule.
   Consulter est libre, même sans compte. Intégration HTTP réelle, base SQLite isolée (tests/_formation-harness.js).
   Lancer : node --test tests/mon-associe-acces.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('mon-associe'); });
test.after(() => { if (env) env.stop(); });

/* Crée un compte (inscription Utilisateur) puis fixe son rôle dans la base isolée, sans aucun abonnement Premium. */
async function compteAvecRole(rnd, nom, role) {
  const jar = H.cookieJar();
  const c = H.compte(rnd, nom, 'utilisateur');
  const r = await env.call(jar, 'POST', '/api/auth/signup', c);
  assert.equal(r.status, 201, 'inscription ' + nom + ' : ' + JSON.stringify(r.data));
  const sq = new H.DatabaseSync(env.dbPath);
  try {
    const u = sq.prepare('SELECT id FROM users WHERE email=?').get(c.email);
    sq.prepare('UPDATE users SET role=? WHERE id=?').run(role, u.id);
    sq.prepare('DELETE FROM user_accreditations WHERE user_id=?').run(u.id);
    return { jar, id: u.id };
  } finally { sq.close(); }
}

test('Mon Associé : tous les comptes sauf Utilisateur écrivent, sans Premium ni code de sécurité', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const util = await compteAvecRole(rnd, 'MaUtil', 'utilisateur');
  const ini = await compteAvecRole(rnd, 'MaIni', 'initiative');
  const col = await compteAvecRole(rnd, 'MaCol', 'collectivite');
  const annonce = { type_recherche: 'associe', titre: 'Cherche associé technique', description: 'Startup agritech.', pays: "Côte d'Ivoire" };

  await t.test('un visiteur consulte librement, mais ne peut pas publier', async () => {
    const l = await env.call(null, 'GET', '/api/mon-associe/annonces');
    assert.equal(l.status, 200);
    assert.ok(Array.isArray(l.data.annonces));
    assert.equal((await env.call(null, 'POST', '/api/mon-associe/annonces', annonce)).status, 401);
    assert.equal((await env.call(null, 'GET', '/api/mon-associe/mon-acces')).status, 401);
  });

  await t.test('Utilisateur : lecture seule (ni publication ni candidature)', async () => {
    const acc = await env.call(util.jar, 'GET', '/api/mon-associe/mon-acces');
    assert.equal(acc.status, 200);
    assert.equal(acc.data.peut_publier, false);
    assert.equal(acc.data.lecture_seule, true);
    const pub = await env.call(util.jar, 'POST', '/api/mon-associe/annonces', annonce);
    assert.equal(pub.status, 403);
    assert.doesNotMatch(pub.data.error, /Premium/i, 'le refus ne parle plus de Premium');
  });

  let idIni;
  await t.test('Initiative sans Premium : accès automatique et publication', async () => {
    const acc = await env.call(ini.jar, 'GET', '/api/mon-associe/mon-acces');
    assert.equal(acc.data.peut_publier, true);
    assert.notEqual(acc.data.premium_requis, true);
    const pub = await env.call(ini.jar, 'POST', '/api/mon-associe/annonces', annonce);
    assert.equal(pub.status, 201, JSON.stringify(pub.data));
    idIni = pub.data.id;
  });

  await t.test("l'annonce d'une Initiative sans Premium est visible de tous (plus de masquage)", async () => {
    const l = await env.call(null, 'GET', '/api/mon-associe/annonces');
    assert.ok(l.data.annonces.some(a => a.id === idIni), 'visible pour un visiteur');
    const mes = await env.call(ini.jar, 'GET', '/api/mon-associe/mes-annonces');
    const a = mes.data.annonces.find(x => x.id === idIni);
    assert.ok(a);
    assert.equal(a.masquee_non_premium, false);
  });

  await t.test('Collectivité sans Premium : publie et candidate', async () => {
    const acc = await env.call(col.jar, 'GET', '/api/mon-associe/mon-acces');
    assert.equal(acc.data.peut_publier, true);
    const pub = await env.call(col.jar, 'POST', '/api/mon-associe/annonces', { ...annonce, titre: 'Partenaire de distribution', type_recherche: 'partenaire' });
    assert.equal(pub.status, 201);
    const cand = await env.call(col.jar, 'POST', `/api/mon-associe/annonces/${idIni}/candidater`, { message: 'Intéressé' });
    assert.equal(cand.status, 201, JSON.stringify(cand.data));
  });

  await t.test('Utilisateur ne peut pas candidater', async () => {
    const cand = await env.call(util.jar, 'POST', `/api/mon-associe/annonces/${idIni}/candidater`, { message: 'Moi aussi' });
    assert.equal(cand.status, 403);
  });
});
