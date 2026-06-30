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
    /* Schéma déjà en place — mais toujours corriger les comptes démo */
    await seedPg(pool);
    _initialized = true;
    return;
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
  /* Utiliser scrypt — même algo que auth.js */
  function hashPassword(pwd) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
    return { hash, salt };
  }

  const demoUsers = [
    { nom: "Diaspo'Actif Admin", prenom: null,       email: 'admin@diaspoactif.demo',              role: 'administrateur' },
    { nom: 'Jean K.',            prenom: 'Jean',      email: 'jean@diaspoactif.demo',               role: 'utilisateur' },
    { nom: 'Keïta',              prenom: 'Aminata',   email: 'aminata.keita@diaspoactif.demo',      role: 'utilisateur' },
    { nom: 'Diallo',             prenom: 'Ibrahim',   email: 'ibrahim.diallo@diaspoactif.demo',     role: 'utilisateur' },
    { nom: 'Bah',                prenom: 'Fatoumata', email: 'fatoumata.bah@diaspoactif.demo',      role: 'initiative' },
    { nom: 'Coulibaly',          prenom: 'Moussa',    email: 'moussa.coulibaly@diaspoactif.demo',   role: 'collectivite' },
  ];

  /* Vérifier si des utilisateurs existent déjà */
  const { rows: cnt } = await pool.query('SELECT COUNT(*)::int AS cnt FROM users');

  if (cnt[0].cnt === 0) {
    /* Première installation : créer tous les comptes démo */
    for (const u of demoUsers) {
      const { hash, salt } = hashPassword('Demo1234!');
      await pool.query(
        `INSERT INTO users (nom, prenom, email, password_hash, password_salt, role)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING`,
        [u.nom, u.prenom, u.email, hash, salt, u.role]
      );
    }
  } else {
    /* Migration : re-hasher les mots de passe avec scrypt si nécessaire
       (corrige les anciens comptes hashés avec HMAC-SHA256) */
    for (const u of demoUsers) {
      const { hash, salt } = hashPassword('Demo1234!');
      await pool.query(
        `INSERT INTO users (nom, prenom, email, password_hash, password_salt, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET password_hash=$4, password_salt=$5`,
        [u.nom, u.prenom, u.email, hash, salt, u.role]
      );
    }
  }

  // Initialise le compteur de visites
  await pool.query(
    `INSERT INTO counters (key, value) VALUES ('visits', 0) ON CONFLICT (key) DO NOTHING`
  );

  // Données démo — initiative pour fatoumata.bah
  const { rows: [fatou] } = await pool.query(`SELECT id FROM users WHERE email='fatoumata.bah@diaspoactif.demo'`);
  if (fatou) {
    await pool.query(`
      INSERT INTO initiatives (owner_user_id, nom, slug, domaine, description, pays, ville, vues)
      VALUES ($1, 'Diaspora Santé Africa', 'diaspora-sante-africa',
              'Santé', 'Initiative dédiée à l''amélioration de l''accès aux soins pour la diaspora africaine et les communautés locales.',
              'France', 'Paris', 128)
      ON CONFLICT (slug) DO NOTHING
    `, [fatou.id]).catch(() => {});
  }

  // Données démo — profil ambassade pour moussa.coulibaly
  const { rows: [moussa] } = await pool.query(`SELECT id FROM users WHERE email='moussa.coulibaly@diaspoactif.demo'`);
  if (moussa) {
    await pool.query(`
      INSERT INTO ambassade_profil (user_id, nom_officiel, pays_represente, description, site_web)
      VALUES ($1, 'Ambassade de Guinée en France', 'Guinée',
              'Représentation diplomatique officielle de la République de Guinée en France.',
              'https://ambassade-guinee.fr')
      ON CONFLICT (user_id) DO NOTHING
    `, [moussa.id]).catch(() => {});
  }
}

module.exports = pgInit;
