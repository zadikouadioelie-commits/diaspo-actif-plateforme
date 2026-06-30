/* ===========================================================
   DIASPO'ACTIF — Initialisation schéma PostgreSQL (Neon)
   Lit les blocs db.exec() depuis db.js et les exécute via pg.
   Appelé au cold start Vercel quand DATABASE_URL est définie.
   =========================================================== */
const fs   = require('fs');
const path = require('path');
const pg   = require('./db-pg');

let _initialized = false;

async function pgInit() {
  if (_initialized) return;

  const { pool } = pg;

  // Vérifie si les tables existent déjà
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public'"
  );
  if (rows[0].cnt > 3) {
    _initialized = true;
    return; // Schéma déjà en place
  }

  console.log('[pg-init] Création du schéma Postgres...');

  // Extrait tous les blocs SQL depuis db.js
  const dbSrc = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
  const sqlRegex = /db\.exec\(`([\s\S]*?)`\)/g;
  let match;
  while ((match = sqlRegex.exec(dbSrc)) !== null) {
    const sql = match[1];
    // Ignore les blocs de migration ALTER TABLE (on crée directement avec toutes colonnes)
    if (/^\s*ALTER TABLE/im.test(sql)) continue;
    await pg.exec(sql);
  }

  console.log('[pg-init] Schéma créé. Seeding données initiales...');
  await seedPg(pool);

  _initialized = true;
  console.log('[pg-init] ✅ Base de données Postgres prête.');
}

async function seedPg(pool) {
  const crypto = require('crypto');
  function hashPassword(pwd) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHmac('sha256', salt).update(pwd).digest('hex');
    return { hash, salt };
  }

  // Vérifie si des utilisateurs existent déjà
  const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM users');
  if (rows[0].cnt > 0) return;

  const users = [
    { nom: "Diaspo'Actif Admin", prenom: null, email: 'admin@diaspoactif.demo', role: 'administrateur' },
    { nom: 'Keïta', prenom: 'Aminata', email: 'aminata.keita@diaspoactif.demo', role: 'utilisateur' },
    { nom: 'Diallo', prenom: 'Ibrahim', email: 'ibrahim.diallo@diaspoactif.demo', role: 'utilisateur' },
    { nom: 'Bah', prenom: 'Fatoumata', email: 'fatoumata.bah@diaspoactif.demo', role: 'initiative' },
    { nom: 'Coulibaly', prenom: 'Moussa', email: 'moussa.coulibaly@diaspoactif.demo', role: 'collectivite' },
  ];

  for (const u of users) {
    const { hash, salt } = hashPassword('Demo1234!');
    await pool.query(
      `INSERT INTO users (nom, prenom, email, password_hash, password_salt, role)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING`,
      [u.nom, u.prenom, u.email, hash, salt, u.role]
    );
  }

  // Initialise le compteur de visites
  await pool.query(
    `INSERT INTO counters (key, value) VALUES ('visits', 0) ON CONFLICT (key) DO NOTHING`
  );
}

module.exports = pgInit;
