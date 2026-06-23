/* ===========================================================
   DIASPO'ACTIF — Couche base de données (node:sqlite natif Node 22+)
   Rôles : utilisateur | initiative | administrateur | collectivite
   En production (Vercel) : DB en /tmp (éphémère, re-seedée au cold start)
   =========================================================== */
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

const IS_PROD = process.env.VERCEL || process.env.NODE_ENV === "production";
const DB_PATH = IS_PROD ? "/tmp/diaspoactif.db" : path.join(__dirname, "diaspoactif.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenom TEXT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('utilisateur','initiative','administrateur','collectivite')),
    ville TEXT,
    pays TEXT,
    adresse TEXT,
    code_postal TEXT,
    telephone TEXT,
    date_naissance TEXT,
    nationalite1 TEXT,
    nationalite2 TEXT,
    nationalite3 TEXT,
    centres_interet TEXT DEFAULT '[]',
    situation_pro TEXT,
    type_institution TEXT,
    statut_verification TEXT DEFAULT 'auto',
    profil_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS initiatives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE,
    nom TEXT NOT NULL,
    sigle TEXT,
    pays TEXT,
    region TEXT,
    ville TEXT,
    zone TEXT,
    nationalite1 TEXT,
    nationalite2 TEXT,
    nationalites_concernees TEXT DEFAULT '[]',
    nationalite_unique INTEGER DEFAULT 0,
    domaine TEXT,
    type TEXT,
    membres INTEGER DEFAULT 0,
    vues INTEGER DEFAULT 0,
    abonnes INTEGER DEFAULT 0,
    description TEXT,
    mission TEXT,
    historique TEXT,
    site_web TEXT,
    reseaux_sociaux TEXT DEFAULT '{}',
    galerie_json TEXT DEFAULT '[]',
    lat REAL,
    lon REAL,
    adresse TEXT,
    code_postal TEXT,
    objectifs TEXT,
    pays_intervention TEXT DEFAULT '[]',
    logo_url TEXT,
    nom_responsable TEXT,
    prenom_responsable TEXT,
    fonction_responsable TEXT,
    email_responsable TEXT,
    tel_responsable TEXT,
    owner_user_id INTEGER,
    abonnement_actif INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(owner_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS abonnements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    initiative_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, initiative_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id)
  );

  CREATE TABLE IF NOT EXISTS formations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    type_formation TEXT,
    organisme TEXT,
    domaine TEXT,
    nationalite TEXT,
    langue TEXT DEFAULT 'Français',
    niveau TEXT,
    description TEXT,
    prix REAL DEFAULT 0,
    gratuit INTEGER DEFAULT 1,
    duree TEXT,
    places INTEGER,
    initiative_id INTEGER,
    owner_user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id),
    FOREIGN KEY(owner_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS actualites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    source TEXT,
    date_pub TEXT,
    resume TEXT,
    owner_user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS evenements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    organisateur TEXT,
    date_evt TEXT,
    lieu TEXT,
    statut TEXT,
    owner_user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER NOT NULL,
    user2_id INTEGER NOT NULL,
    sujet TEXT,
    archive_u1 INTEGER DEFAULT 0,
    archive_u2 INTEGER DEFAULT 0,
    deleted_u1 INTEGER DEFAULT 0,
    deleted_u2 INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user1_id, user2_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    contenu TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    fichier_json TEXT,
    lu INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(conversation_id) REFERENCES conversations(id)
  );

  CREATE TABLE IF NOT EXISTS fil_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auteur_id INTEGER,
    auteur_nom TEXT,
    type TEXT,
    categorie TEXT,
    contenu TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fil_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    UNIQUE(post_id, user_id, type),
    FOREIGN KEY(post_id) REFERENCES fil_posts(id)
  );

  CREATE TABLE IF NOT EXISTS financements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    projet TEXT NOT NULL,
    montant TEXT NOT NULL,
    date_don TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS collaborations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    partenaire TEXT NOT NULL,
    statut TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

/* -- Migration douce : ajoute les colonnes si elles n'existent pas encore -- */
const MIGRATIONS = [
  ["conversations", "sujet TEXT"],
  ["conversations", "archive_u1 INTEGER DEFAULT 0"],
  ["conversations", "archive_u2 INTEGER DEFAULT 0"],
  ["conversations", "deleted_u1 INTEGER DEFAULT 0"],
  ["conversations", "deleted_u2 INTEGER DEFAULT 0"],
  ["messages", "type TEXT DEFAULT 'text'"],
  ["messages", "fichier_json TEXT"],
  ["messages", "lu INTEGER DEFAULT 0"],
  // Champs étendus utilisateurs
  ["users", "prenom TEXT"],
  ["users", "date_naissance TEXT"],
  ["users", "nationalite1 TEXT"],
  ["users", "nationalite2 TEXT"],
  ["users", "nationalite3 TEXT"],
  ["users", "adresse TEXT"],
  ["users", "code_postal TEXT"],
  ["users", "telephone TEXT"],
  ["users", "centres_interet TEXT DEFAULT '[]'"],
  ["users", "situation_pro TEXT"],
  ["users", "type_institution TEXT"],
  ["users", "statut_verification TEXT DEFAULT 'auto'"],
  // Champs de base initiatives (peuvent manquer sur DB ancienne)
  ["initiatives", "site_web TEXT"],
  ["initiatives", "reseaux_sociaux TEXT DEFAULT '{}'"],
  ["initiatives", "galerie_json TEXT DEFAULT '[]'"],
  ["initiatives", "mission TEXT"],
  ["initiatives", "historique TEXT"],
  ["initiatives", "abonnement_actif INTEGER DEFAULT 0"],
  // Champs étendus initiatives
  ["initiatives", "adresse TEXT"],
  ["initiatives", "code_postal TEXT"],
  ["initiatives", "objectifs TEXT"],
  ["initiatives", "pays_intervention TEXT DEFAULT '[]'"],
  ["initiatives", "logo_url TEXT"],
  ["initiatives", "nom_responsable TEXT"],
  ["initiatives", "prenom_responsable TEXT"],
  ["initiatives", "fonction_responsable TEXT"],
  ["initiatives", "email_responsable TEXT"],
  ["initiatives", "tel_responsable TEXT"],
];
for (const [table, col] of MIGRATIONS) {
  const colName = col.split(" ")[0];
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === colName);
  if (!exists) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`); } catch (e) { /* déjà présent */ }
  }
}

module.exports = db;
