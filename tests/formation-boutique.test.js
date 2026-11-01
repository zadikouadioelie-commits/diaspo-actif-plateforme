/* ===========================================================
   tests/formation-boutique.test.js — « Vendre cette formation sur ma boutique » (2026-11-01)
   ===========================================================
   Interrupteur désactivé par défaut ; seul le propriétaire (ou l'administration) l'active ; la formation doit être publiée et ouverte à tous ;
   la bande « Formations créées par <initiative> » lit les formations en direct (prix, titre) et masque ce qui n'est plus publié.
   Lancer : node --test tests/formation-boutique.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('boutique'); });
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).all(...args); } finally { db.close(); } };
const run = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).run(...args); } finally { db.close(); } };

function creerInitiative(uid, nom, vitrineActive = 1) {
  const cols = sql("PRAGMA table_info(initiatives)").filter(x => x.notnull && x.dflt_value == null && !x.pk).map(x => x.name);
  const valeurs = { owner_user_id: uid, nom, type: 'association', description: 'x', pays: 'France', ville: 'Paris', categorie: 'Éducation', secteur: 'Éducation' };
  const noms = [...new Set(['owner_user_id', 'nom', ...cols])];
  run(`INSERT INTO initiatives (${noms.join(',')}) VALUES (${noms.map(() => '?').join(',')})`, ...noms.map(n => valeurs[n] != null ? valeurs[n] : 'x'));
  const id = sql('SELECT id FROM initiatives WHERE owner_user_id=?', uid)[0].id;
  run('UPDATE initiatives SET vitrine_active=? WHERE id=?', vitrineActive, id);
  return id;
}

test('interrupteur : désactivé par défaut, propriétaire seul, formation publiée et ouverte à tous', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), call = env.call;
  const c = await H.creerFormateur(env, jarF, rnd, 'Zadi');
  await H.creerApprenant(env, jarA, rnd + 'a', 'Autre');
  const uid = sql('SELECT id FROM users WHERE email=?', c.email)[0].id;
  const initId = creerInitiative(uid, 'Initiative Baobab ' + rnd);

  let r = await call(jarF, 'POST', '/api/formations', { titre: 'Formation boutique ' + rnd, description: 'x' });
  const id = r.data.id;
  assert.equal(Number(sql('SELECT en_boutique FROM formations WHERE id=?', id)[0].en_boutique) || 0, 0, 'désactivé par défaut');

  /* Brouillon : refusé. */
  r = await call(jarF, 'PUT', `/api/formations/${id}/boutique`, { actif: true });
  assert.equal(r.status, 400, 'brouillon refusé : ' + JSON.stringify(r.data));
  assert.match(r.data.error, /Publiez/);

  H.publier(env, id);

  /* Un autre compte ne peut pas toucher à l'interrupteur. */
  r = await call(jarA, 'PUT', `/api/formations/${id}/boutique`, { actif: true });
  assert.equal(r.status, 403, 'non propriétaire refusé');
  r = await call(null, 'PUT', `/api/formations/${id}/boutique`, { actif: true });
  assert.equal(r.status, 401, 'visiteur refusé');

  /* Formation réservée à une liste : refusée. */
  run("UPDATE formations SET acces_type='liste' WHERE id=?", id);
  r = await call(jarF, 'PUT', `/api/formations/${id}/boutique`, { actif: true });
  assert.equal(r.status, 400, 'réservée à une liste : ' + JSON.stringify(r.data));
  run("UPDATE formations SET acces_type='public' WHERE id=?", id);

  /* Propriétaire, publiée, publique : accepté. */
  r = await call(jarF, 'PUT', `/api/formations/${id}/boutique`, { actif: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.en_boutique, 1);
  assert.equal(r.data.boutique_visible, true);
  assert.equal(Number(sql('SELECT en_boutique FROM formations WHERE id=?', id)[0].en_boutique), 1);

  /* Le titre porte le nom de l'initiative, même si le compte propriétaire est un compte d'administration. */
  const bande = await call(null, 'GET', `/api/initiatives/${initId}/formations-boutique`);
  assert.equal(bande.data.titre, 'Formations créées par Initiative Baobab ' + rnd);

  /* Désactiver reste toujours possible. */
  r = await call(jarF, 'PUT', `/api/formations/${id}/boutique`, { actif: false });
  assert.equal(r.status, 200);
  assert.equal(Number(sql('SELECT en_boutique FROM formations WHERE id=?', id)[0].en_boutique), 0);
  assert.ok(initId);
});

test('un compte sans boutique (pas d\'initiative) ne peut pas proposer une formation en boutique', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), call = env.call;
  await H.creerFormateur(env, jarF, rnd, 'Sans');
  const r0 = await call(jarF, 'POST', '/api/formations', { titre: 'Sans boutique ' + rnd, description: 'x' });
  H.publier(env, r0.data.id);
  const r = await call(jarF, 'PUT', `/api/formations/${r0.data.id}/boutique`, { actif: true });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Initiative/);
});

test('la bande : titre « Formations créées par <initiative> », données en direct, retrait si non publiée, masquée si la vitrine est inactive', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), call = env.call;
  const c = await H.creerFormateur(env, jarF, rnd, 'Gestionnaire');
  const uid = sql('SELECT id FROM users WHERE email=?', c.email)[0].id;
  const nom = 'Initiative Soleil ' + rnd;
  const initId = creerInitiative(uid, nom);

  const creer = async (titre, extra = {}) => {
    const r = await call(jarF, 'POST', '/api/formations', { titre, description: 'x', ...extra });
    H.publier(env, r.data.id);
    return r.data.id;
  };
  const a = await creer('Formation A ' + rnd);
  const b = await creer('Formation B ' + rnd);
  const cc = await creer('Formation C (non proposée) ' + rnd);
  run("UPDATE formations SET mode_acces='payant', gratuit=0, prix=40, devise='EUR' WHERE id=?", a);
  for (const id of [a, b]) { const r = await call(jarF, 'PUT', `/api/formations/${id}/boutique`, { actif: true }); assert.equal(r.status, 200, JSON.stringify(r.data)); }
  /* Le compte devient une initiative après coup (les formations d'initiative exigent un abonnement : on ne teste ici que l'affichage). */
  run("UPDATE users SET role='initiative', nom_institution=NULL WHERE id=?", uid);

  let r = await call(null, 'GET', `/api/initiatives/${initId}/formations-boutique`);
  assert.equal(r.status, 200);
  assert.equal(r.data.titre, `Formations créées par ${nom}`, 'le nom est celui de l\'initiative, pas du gestionnaire');
  const ids = r.data.formations.map(f => f.id).sort();
  assert.deepEqual(ids, [a, b].sort(), 'seules les formations proposées apparaissent');
  assert.ok(!ids.includes(cc), 'une formation non proposée n\'apparaît pas');
  const carteA = r.data.formations.find(f => f.id === a);
  assert.equal(carteA.prix_final, 40);
  assert.equal(carteA.gratuit, 0);
  assert.equal(r.data.formations.find(f => f.id === b).gratuit, 1, 'formation gratuite signalée');
  assert.ok(!/Gestionnaire/.test(JSON.stringify(r.data)), 'jamais le nom du gestionnaire');

  /* En direct : un nouveau prix se voit tout de suite, sans copie. */
  run('UPDATE formations SET prix=55 WHERE id=?', a);
  r = await call(null, 'GET', `/api/initiatives/${initId}/formations-boutique`);
  assert.equal(r.data.formations.find(f => f.id === a).prix_final, 55);

  /* Plus publiée : elle quitte la bande, l'interrupteur reste mémorisé. */
  run("UPDATE formations SET statut='brouillon' WHERE id=?", b);
  r = await call(null, 'GET', `/api/initiatives/${initId}/formations-boutique`);
  assert.deepEqual(r.data.formations.map(f => f.id), [a]);
  assert.equal(Number(sql('SELECT en_boutique FROM formations WHERE id=?', b)[0].en_boutique), 1, 'interrupteur conservé');
  H.publier(env, b);
  r = await call(null, 'GET', `/api/initiatives/${initId}/formations-boutique`);
  assert.equal(r.data.formations.length, 2, 'elle revient une fois republiée');

  /* Réservée à une liste après coup : elle quitte la bande. */
  run("UPDATE formations SET acces_type='liste' WHERE id=?", b);
  r = await call(null, 'GET', `/api/initiatives/${initId}/formations-boutique`);
  assert.deepEqual(r.data.formations.map(f => f.id), [a]);
  run("UPDATE formations SET acces_type='public' WHERE id=?", b);

  /* Vitrine inactive : le public ne voit rien, le propriétaire voit sa bande. */
  run('UPDATE initiatives SET vitrine_active=0 WHERE id=?', initId);
  r = await call(null, 'GET', `/api/initiatives/${initId}/formations-boutique`);
  assert.deepEqual(r.data.formations, [], 'public : rien');
  r = await call(jarF, 'GET', `/api/initiatives/${initId}/formations-boutique`);
  assert.equal(r.data.formations.length, 2, 'propriétaire : sa bande');

  r = await call(null, 'GET', '/api/initiatives/999999/formations-boutique');
  assert.equal(r.status, 404);
});

test('aucune formation proposée : pas de bande (titre vide)', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), call = env.call;
  const c = await H.creerFormateur(env, jarF, rnd, 'Vide');
  const uid = sql('SELECT id FROM users WHERE email=?', c.email)[0].id;
  const initId = creerInitiative(uid, 'Initiative Vide ' + rnd);
  const r = await call(null, 'GET', `/api/initiatives/${initId}/formations-boutique`);
  assert.equal(r.data.titre, '');
  assert.deepEqual(r.data.formations, []);
});
