/* ===========================================================
   tests/formation-fiabilite-reductions.test.js — points de fiabilité pour les réductions créées en faveur des membres Diaspo'Actif (2026-10-31)
   ===========================================================
   Tout compte qui crée des réductions pour les membres de l'initiative officielle gagne des points : +2 dès la première, +1 à la 5ᵉ, +2 à la 15ᵉ
   (5 au total). Le total disponible reste EXACTEMENT 100 pour un membre comme pour une structure.
   Lancer : node --test tests/formation-fiabilite-reductions.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

const OFFICIELLE = 900001;
let env;
test.before(async () => { process.env.DA_INITIATIVE_OFFICIELLE_ID = String(OFFICIELLE); env = await H.demarrer('fiabilitereductions'); });
test.after(() => { if (env) env.stop(); delete process.env.DA_INITIATIVE_OFFICIELLE_ID; });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).all(...args); } finally { db.close(); } };
const run = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).run(...args); } finally { db.close(); } };

test('réductions pour les membres Diaspo\'Actif : 1ʳᵉ, 5ᵉ, 15ᵉ ; total toujours 100', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarU = H.cookieJar(), jarV = H.cookieJar(), call = env.call;
  await H.creerApprenant(env, jarU, rnd, 'Alpha'); await H.creerApprenant(env, jarV, rnd, 'Proprio');
  const U = sql('SELECT id FROM users WHERE email LIKE ?', `test-utilisateur-${rnd}-alpha@%`)[0].id;
  const V = sql('SELECT id FROM users WHERE email LIKE ?', `test-utilisateur-${rnd}-proprio@%`)[0].id;
  const cols = sql('PRAGMA table_info(initiatives)').filter(x => x.notnull && x.dflt_value == null && !x.pk).map(x => x.name);
  const initiative = (id, owner, nom) => {
    const v = { id, owner_user_id: owner, nom, type: 'association', description: 'x', pays: 'France', ville: 'Lyon', categorie: 'Éducation', secteur: 'Éducation' };
    const noms = [...new Set(['id', 'owner_user_id', 'nom', 'pays', 'ville', ...cols])];
    run(`INSERT INTO initiatives (${noms.join(',')}) VALUES (${noms.map(() => '?').join(',')})`, ...noms.map(n => v[n] != null ? v[n] : 'x'));
  };
  initiative(OFFICIELLE, V, "Diaspo'Actif Officiel " + rnd);

  const score = async uid => { const r = await call(null, 'GET', `/api/users/${uid}/trust-score`); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
  const critere = d => d.detail.find(c => c.cle === 'reductions_membres');

  /* Membre : aucun point au départ ; le critère existe ; le total disponible est exactement 100 */
  let d = await score(U);
  assert.ok(critere(d), 'le critère existe'); assert.equal(critere(d).pts, 0); assert.equal(critere(d).max, 5);
  assert.equal(d.disponible, 100, 'total disponible d\'un membre');
  assert.match(critere(d).regle, /1/);

  /* 1ʳᵉ réduction (créée par l'API, comme dans l'éditeur) : +2, tout de suite (cache invalidé) */
  let r = await call(jarU, 'POST', '/api/formateur/regles-membres', { officielle: true, mode: 'pourcentage', reduction_pct: 10 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  d = await score(U); assert.equal(critere(d).pts, 2, '1ʳᵉ réduction'); assert.equal(d.disponible, 100);

  /* Une réduction visant une AUTRE initiative ne compte pas */
  initiative(900009, V, 'Autre initiative ' + rnd);
  r = await call(jarU, 'POST', '/api/formateur/regles-membres', { initiative_id: 900009, mode: 'pourcentage', reduction_pct: 10 });
  assert.equal(r.status, 201);
  d = await score(U); assert.equal(critere(d).pts, 2, 'seules les réductions pour Diaspo\'Actif comptent');

  /* 5ᵉ : +1 (3 au total) */
  for (let i = 1; i <= 4; i++) run("INSERT INTO formation_regles_membres (owner_user_id, formation_cle, initiative_id, mode, reduction_pct) VALUES (?,?,?,?,?)", U, 100 + i, OFFICIELLE, 'pourcentage', 10);
  run('DELETE FROM trust_cache WHERE user_id=?', U);
  d = await score(U); assert.equal(critere(d).pts, 3, '5ᵉ réduction');

  /* 15ᵉ : +2 (5 au total, plafond) */
  for (let i = 5; i <= 14; i++) run("INSERT INTO formation_regles_membres (owner_user_id, formation_cle, initiative_id, mode, reduction_pct) VALUES (?,?,?,?,?)", U, 100 + i, OFFICIELLE, 'gratuit', 0);
  run('DELETE FROM trust_cache WHERE user_id=?', U);
  d = await score(U); assert.equal(critere(d).pts, 5, '15ᵉ réduction'); assert.equal(critere(d).max, 5);

  /* Supprimer une règle redescend sous le palier : les points suivent l'état réel */
  const une = sql('SELECT id FROM formation_regles_membres WHERE owner_user_id=? AND initiative_id=? AND formation_cle=0', U, OFFICIELLE)[0].id;
  r = await call(jarU, 'DELETE', `/api/formateur/regles-membres/${une}`);
  assert.equal(r.status, 200);
  d = await score(U); assert.equal(critere(d).pts, 3, '14 réductions : 1ʳᵉ et 5ᵉ seulement');

  /* Une structure (initiative) gagne les mêmes points ; son total disponible reste 100 (le compte de l'initiative officielle, lui, reste à 100 hors règles) */
  initiative(900010, U, 'Structure ' + rnd);
  run("UPDATE users SET role='initiative' WHERE id=?", U); run('DELETE FROM trust_cache WHERE user_id=?', U);
  d = await score(U); assert.equal(d.disponible, 100, 'total disponible d\'une structure'); assert.equal(critere(d).max, 5);
  assert.equal(critere(d).pts, 3, 'mêmes points pour une structure');
});
