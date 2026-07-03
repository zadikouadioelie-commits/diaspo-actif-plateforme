/* ===========================================================
   DIASPO'ACTIF — Initialisation schéma PostgreSQL (Neon)
   Lit les blocs db.exec() depuis db.js et les exécute via pg.
   Appelé au cold start Vercel quand DATABASE_URL est définie.
   =========================================================== */
const fs   = require('fs');
const path = require('path');
const pg   = require('./db-pg');

let _initialized = false;

/* Exécute tous les blocs db.exec(`CREATE TABLE...`) trouvés dans db.js (hors ALTER).
   Idempotent grâce à `CREATE TABLE IF NOT EXISTS` — donc appelable SANS RISQUE
   même sur une base déjà initialisée : les tables existantes sont ignorées,
   seules les NOUVELLES tables (ajoutées après le premier déploiement) sont créées.
   Corrige le bug racine : avant, une base déjà initialisée ne recevait jamais
   les nouvelles tables ajoutées ultérieurement dans db.js (ex: error_logs). */
async function createMissingTables(pool) {
  const dbSrc = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
  const sqlRegex = /db\.exec\(`([\s\S]*?)`\)/g;
  let match;
  while ((match = sqlRegex.exec(dbSrc)) !== null) {
    const sql = match[1];
    // Ignore les blocs de migration ALTER TABLE (gérés séparément par migratePg)
    if (/^\s*ALTER TABLE/im.test(sql)) continue;
    // Ne garder que les instructions CREATE TABLE / CREATE INDEX (idempotentes grâce à IF NOT EXISTS).
    // Certains blocs mélangent CREATE TABLE + INSERT OR IGNORE de seed — ces INSERT ne sont
    // pas rejouables sans risque ici (rôle de seedPg()), donc on les exclut explicitement.
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    // On ignore les commentaires SQL (-- ...) en tête de bloc avant de tester le préfixe CREATE,
    // sinon un commentaire juste avant CREATE TABLE fait échouer le filtre (table jamais créée sur Postgres).
    const createOnly = statements.filter(s => /^CREATE (TABLE|INDEX|UNIQUE INDEX)/i.test(s.replace(/^(\s*--[^\n]*\n)+/g, '').trim()));
    if (!createOnly.length) continue;
    for (const stmt of createOnly) {
      try {
        await pg.exec(stmt + ';');
      } catch (e) {
        console.error('[pg-init] createMissingTables — erreur sur une instruction:', e.message);
      }
    }
  }
}

/* Verrou consultatif Postgres — évite que plusieurs cold starts Vercel concurrents
   (plusieurs instances serverless démarrant en même temps juste après un déploiement)
   ne lancent leurs CREATE TABLE / ALTER TABLE en parallèle sur la même base Neon.
   Cause identifiée des erreurs 500 transitoires observées juste après déploiement
   (ex: 2026-07-02 sur /api/evenements, /api/users/:id/trust-score — stables au réessai). */
const PG_INIT_LOCK_KEY = 84210001;

async function pgInit() {
  if (_initialized) return;

  const { pool } = pg;
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [PG_INIT_LOCK_KEY]);
    try {
      // Vérifie si les tables existent déjà
      const { rows } = await client.query(
        "SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public'"
      );
      if (rows[0].cnt > 3) {
        /* Schéma déjà en place — créer les tables manquantes (nouvelles depuis le dernier
           déploiement) + migrations de colonnes + corriger les comptes démo */
        await createMissingTables(pool);
        await migratePg(pool);
        await seedPg(pool);
      } else {
        console.log('[pg-init] Création du schéma Postgres...');
        await createMissingTables(pool);

        console.log('[pg-init] Schéma créé. Migrations + seeding...');
        await migratePg(pool);
        await seedPg(pool);
        console.log('[pg-init] ✅ Base de données Postgres prête.');
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [PG_INIT_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
  _initialized = true;
}

/* Migrations de colonnes ajoutées via ALTER TABLE dans db.js
   (jamais exécutées en Postgres car pg-init ignore les ALTER).
   Idempotent grâce à ADD COLUMN IF NOT EXISTS. */
async function migratePg(pool) {
  const cols = [
    // users
    ['users', 'da_id', 'TEXT'],
    ['users', 'ds_id', 'TEXT'],
    ['users', 'disponibilites', 'TEXT'],
    ['users', 'reseaux_sociaux', 'TEXT'],
    ['users', 'email_verifie', 'INTEGER DEFAULT 0'],
    ['users', 'email_verif_token', 'TEXT'],
    ['users', 'email_verif_expires', 'BIGINT'],
    // initiatives
    ['initiatives', 'da_id', 'TEXT'],
    ['initiatives', 'vitrine_active', 'INTEGER DEFAULT 0'],
    ['initiatives', 'vitrine_banniere_url', 'TEXT'],
    ['initiatives', 'vitrine_horaires', 'TEXT'],
    ['initiatives', 'vitrine_services', 'TEXT'],
    // vitrine v2 : statuts + messagerie contextuelle
    ['produits_vitrine', 'statut', "TEXT DEFAULT 'disponible'"],
    ['produits_vitrine', 'date_retour', 'TEXT'],
    ['produits_vitrine', 'reference', 'TEXT'],
    ['messages', 'produit_id', 'INTEGER'],
    ['conversations', 'contexte', 'TEXT'],
    // vitrine v3 : publications promotionnelles
    ['initiatives', 'vitrine_pub_onglet', "TEXT DEFAULT 'À la une'"],
    ['commandes_vitrine', 'publication_id', 'INTEGER'],
    ['vitrine_publications', 'media_bg', 'TEXT'],
    // fil_posts
    ['fil_posts', 'media_url', 'TEXT'],
    ['fil_posts', 'media_type', 'TEXT'],
    ['fil_posts', 'article_titre', 'TEXT'],
    ['fil_posts', 'article_contenu', 'TEXT'],
    ['fil_posts', 'video_duree', 'INTEGER'],
    ['fil_posts', 'repost_commentaire', 'TEXT'],
    ['fil_posts', 'visibilite', "TEXT DEFAULT 'public'"],
    ['fil_posts', 'medias', 'TEXT'],
    ['fil_posts', 'hashtags', 'TEXT'],
    ['fil_posts', 'statut', 'TEXT'],
    ['fil_posts', 'programmed_at', 'TEXT'],
    ['fil_posts', 'localisation_pays', 'TEXT'],
    ['fil_posts', 'localisation_ville', 'TEXT'],
    ['fil_posts', 'vues', 'INTEGER DEFAULT 0'],
    // conversations
    ['conversations', 'type', 'TEXT'],
    ['conversations', 'nom', 'TEXT'],
    ['conversations', 'avatar', 'TEXT'],
    ['conversations', 'created_by', 'INTEGER'],
    // messages
    ['messages', 'parent_message_id', 'INTEGER'],
    ['messages', 'est_epingle', 'INTEGER DEFAULT 0'],
    // user_accreditations
    ['user_accreditations', 'feature_slug', 'TEXT'],
    // Trust & Réactivité (manquait depuis le chantier précédent — révélé par /api/identity/status)
    ['users', 'identite_verifiee', 'INTEGER DEFAULT 0'],
    ['users', 'documents_verifies', 'INTEGER DEFAULT 0'],
    ['users', 'diplomes_verifies', 'INTEGER DEFAULT 0'],
    ['users', 'entreprise_verifiee', 'INTEGER DEFAULT 0'],
    ['users', 'trust_score', 'REAL DEFAULT 0'],
    ['users', 'trust_computed_at', 'TEXT'],
    ['users', 'reactivity_stars', 'INTEGER DEFAULT 0'],
    ['users', 'avg_response_hours', 'REAL'],
    ['users', 'response_rate', 'REAL'],
    ['users', 'last_active', "TEXT DEFAULT to_char(NOW(),'YYYY-MM-DD HH24:MI:SS')"],
    ['users', 'signalements_confirmes', 'INTEGER DEFAULT 0'],
    ['users', 'is_verified', 'INTEGER DEFAULT 0'],
    ['users', 'is_official', 'INTEGER DEFAULT 0'],
    ['users', 'is_deal_master', 'INTEGER DEFAULT 0'],
    ['users', 'deal_master_edition_id', 'INTEGER'],
    ['users', 'nb_connexions', 'INTEGER DEFAULT 0'],
    ['users', 'temoignage_statut', "TEXT DEFAULT 'non_demande'"],
    ['users', 'temoignage_derniere_demande', 'TEXT'],
    ['users', 'demo_vue', 'INTEGER DEFAULT 0'],
    // vérification d'identité (Stripe Identity)
    ['users', 'stripe_identity_session_id', 'TEXT'],
    ['users', 'identite_verifiee_le', 'TEXT'],
    ['users', 'identite_expire_le', 'TEXT'],
    ['users', 'identite_renouvellement_notifie', 'INTEGER DEFAULT 0'],
    ['initiatives', 'organisation_verifiee', 'INTEGER DEFAULT 0'],
    ['initiatives', 'organisation_verifiee_le', 'TEXT'],
    ['initiatives', 'organisation_expire_le', 'TEXT'],
    ['initiatives', 'stripe_identity_session_id', 'TEXT'],
    // Refonte visuelle profil/vitrine : thème couleur de la boutique
    ['initiatives', 'vitrine_theme', "TEXT DEFAULT 'bordeaux'"],
  ];
  for (const [table, col, type] of cols) {
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    } catch (e) {
      console.error(`[pg-init migration] ${table}.${col}:`, e.message);
    }
  }
  // Index unique da_id (comme en SQLite)
  try { await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_da_id ON users(da_id) WHERE da_id IS NOT NULL`); } catch(_) {}
  try { await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_initiatives_da_id ON initiatives(da_id) WHERE da_id IS NOT NULL`); } catch(_) {}
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

  // Comptes de démonstration : pas de vraie adresse email → déjà "vérifiés"
  await pool.query(`UPDATE users SET email_verifie=1 WHERE email LIKE '%@diaspoactif.demo'`).catch(()=>{});

  // Initialise le compteur de visites
  await pool.query(
    `INSERT INTO counters (key, value) VALUES ('visits', 0) ON CONFLICT (key) DO NOTHING`
  );

  // Initialise platform_wallet et da_id_counter (id=1) — idempotent, requis dès la création des tables
  await pool.query(`INSERT INTO platform_wallet (id, total_commissions, total_transactions) VALUES (1, 0, 0) ON CONFLICT (id) DO NOTHING`).catch(()=>{});
  await pool.query(`INSERT INTO da_id_counter (id, last_value) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`).catch(()=>{});

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
