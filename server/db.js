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
    region TEXT,
    departement TEXT,
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
    origine1 TEXT,
    origine2 TEXT,
    rayonnement TEXT DEFAULT 'locale',
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

  CREATE TABLE IF NOT EXISTS user_follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    followed_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(follower_id, followed_id),
    FOREIGN KEY(follower_id) REFERENCES users(id),
    FOREIGN KEY(followed_id) REFERENCES users(id)
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

  CREATE TABLE IF NOT EXISTS fil_commentaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    auteur_id INTEGER,
    auteur_nom TEXT NOT NULL,
    contenu TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
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
    titre TEXT,
    description TEXT,
    type_collab TEXT DEFAULT 'benevolat',
    competences TEXT DEFAULT '[]',
    deadline TEXT,
    initiative_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS candidatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collaboration_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT,
    statut TEXT DEFAULT 'en_attente',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(collaboration_id, user_id),
    FOREIGN KEY(collaboration_id) REFERENCES collaborations(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    titre TEXT,
    contenu TEXT,
    lue INTEGER DEFAULT 0,
    data_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS evenements_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evenement_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(evenement_id, user_id),
    FOREIGN KEY(evenement_id) REFERENCES evenements(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS counters (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );

  /* ===== MODULE PUBLICITÉS ===== */

  CREATE TABLE IF NOT EXISTS publicites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Contenu
    titre TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    lien_url TEXT,
    lien_texte TEXT DEFAULT 'En savoir plus',
    annonceur TEXT NOT NULL,
    -- Format : banniere | native | profil | annuaire
    format TEXT NOT NULL DEFAULT 'banniere' CHECK(format IN ('banniere','native','profil','annuaire')),
    -- Statut
    statut TEXT NOT NULL DEFAULT 'active' CHECK(statut IN ('brouillon','active','pausee','expiree','refusee')),
    -- Période
    date_debut TEXT,
    date_fin TEXT,
    -- Priorité 1=faible 2=normal 3=prioritaire
    priorite INTEGER DEFAULT 2,
    -- Ciblage (JSON arrays, vide = tous)
    cible_pays TEXT DEFAULT '[]',
    cible_regions TEXT DEFAULT '[]',
    cible_villes TEXT DEFAULT '[]',
    cible_roles TEXT DEFAULT '[]',
    cible_nationalites TEXT DEFAULT '[]',
    cible_origines TEXT DEFAULT '[]',
    -- Compteurs cumulés
    nb_impressions INTEGER DEFAULT 0,
    nb_clics INTEGER DEFAULT 0,
    -- Admin
    created_by INTEGER,
    notes_admin TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS publicite_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publicite_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('impression','clic')),
    user_id INTEGER,
    user_pays TEXT,
    user_ville TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(publicite_id) REFERENCES publicites(id)
  );

  /* ===== MODULE INSTITUTIONS & OBSERVATOIRE DIASPORA ===== */

  /* Accréditations Observatoire délivrées par Diaspo'Actif */
  CREATE TABLE IF NOT EXISTS accreditations_observatoire (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institution_id INTEGER NOT NULL,
    statut TEXT NOT NULL DEFAULT 'actif' CHECK(statut IN ('actif','suspendu','retire')),
    date_debut TEXT DEFAULT (date('now')),
    date_fin TEXT,
    nationalites_autorisees TEXT DEFAULT '[]',
    territoires_autorises TEXT DEFAULT '[]',
    droits TEXT DEFAULT '{}',
    notes_admin TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(institution_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS accreditations_historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accreditation_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    admin_id INTEGER,
    admin_nom TEXT,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  /* Communications institutionnelles ciblées */
  CREATE TABLE IF NOT EXISTS communications_institutionnelles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emetteur_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    contenu TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK(type IN ('info','invitation','consultation','appel_projets','alerte','financement','forum')),
    cible_json TEXT DEFAULT '{}',
    nb_destinataires INTEGER DEFAULT 0,
    statut TEXT DEFAULT 'envoyee',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(emetteur_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comm_desabonnements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    institution_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, institution_id)
  );

  /* Consultations et sondages officiels */
  CREATE TABLE IF NOT EXISTS consultations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emetteur_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'sondage' CHECK(type IN ('sondage','enquete','consultation_citoyenne','consultation_diaspora')),
    statut TEXT DEFAULT 'ouverte' CHECK(statut IN ('brouillon','ouverte','cloturee')),
    date_cloture TEXT,
    cible_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(emetteur_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS consultation_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER NOT NULL,
    texte TEXT NOT NULL,
    type TEXT DEFAULT 'texte_libre' CHECK(type IN ('texte_libre','choix_unique','choix_multiple','echelle')),
    options_json TEXT DEFAULT '[]',
    ordre INTEGER DEFAULT 0,
    FOREIGN KEY(consultation_id) REFERENCES consultations(id)
  );

  CREATE TABLE IF NOT EXISTS consultation_reponses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    user_id INTEGER,
    reponse TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(consultation_id) REFERENCES consultations(id),
    FOREIGN KEY(question_id) REFERENCES consultation_questions(id)
  );

  /* ===== SYSTÈME DE CERTIFICATION ===== */

  /* Certification active d'une initiative */
  CREATE TABLE IF NOT EXISTS certifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL UNIQUE,
    niveau TEXT NOT NULL DEFAULT 'verifie',
    statut TEXT NOT NULL DEFAULT 'actif' CHECK(statut IN ('actif','suspendu','retire')),
    date_attribution TEXT DEFAULT (datetime('now')),
    admin_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id),
    FOREIGN KEY(admin_id) REFERENCES users(id)
  );

  /* Historique de toutes les décisions (attribution, suspension, retrait, note, rapport) */
  CREATE TABLE IF NOT EXISTS certification_historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    admin_id INTEGER NOT NULL,
    admin_nom TEXT,
    motif TEXT,
    contenu TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id)
  );

  /* Fiche d'évaluation interne par initiative */
  CREATE TABLE IF NOT EXISTS certification_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL UNIQUE,
    -- Activité sur la plateforme
    anciennete_score INTEGER DEFAULT 0,
    publications_regularite INTEGER DEFAULT 0,
    profil_completude INTEGER DEFAULT 0,
    participation_communaute INTEGER DEFAULT 0,
    -- Réactivité
    taux_reponse INTEGER DEFAULT 0,
    delai_reponse TEXT DEFAULT '',
    qualite_echanges INTEGER DEFAULT 0,
    -- Réalisations
    projets_realises TEXT DEFAULT '',
    actions_concretes TEXT DEFAULT '',
    partenariats TEXT DEFAULT '',
    emplois_crees INTEGER DEFAULT 0,
    investissements TEXT DEFAULT '',
    impacts TEXT DEFAULT '',
    -- Témoignages
    avis_utilisateurs TEXT DEFAULT '',
    recommandations TEXT DEFAULT '',
    retours_experience TEXT DEFAULT '',
    -- Vérifications administratives
    documents_officiels INTEGER DEFAULT 0,
    existence_legale INTEGER DEFAULT 0,
    coordonnees_verifiees INTEGER DEFAULT 0,
    infos_administratives TEXT DEFAULT '',
    -- Vérifications complémentaires
    entretien_realise INTEGER DEFAULT 0,
    visioconference INTEGER DEFAULT 0,
    rencontre_physique INTEGER DEFAULT 0,
    visite_site INTEGER DEFAULT 0,
    verification_partenaires INTEGER DEFAULT 0,
    verification_beneficiaires INTEGER DEFAULT 0,
    verification_institutions INTEGER DEFAULT 0,
    -- Notes et rapport
    notes_internes TEXT DEFAULT '',
    rapport_verification TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id)
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
  // Profil utilisateur enrichi (LinkedIn-style)
  ["users", "photo_url TEXT"],
  ["users", "bio TEXT"],
  ["users", "banner_url TEXT"],
  ["users", "titre_pro TEXT"],
  ["users", "competences TEXT DEFAULT '[]'"],
  ["users", "experiences TEXT DEFAULT '[]'"],
  ["users", "theme_couleur TEXT DEFAULT 'ocean'"],
  // Événements enrichis
  ["evenements", "description TEXT"],
  ["evenements", "places_max INTEGER"],
  ["evenements", "image_url TEXT"],
  ["evenements", "domaine TEXT"],
  ["evenements", "type_evt TEXT DEFAULT 'evenement'"],
  ["evenements", "pays TEXT"],
  ["evenements", "ville TEXT"],
  ["evenements", "inscription_ouverte INTEGER DEFAULT 1"],
  ["evenements", "lien_inscription TEXT"],
  // Collaborations enrichies
  ["collaborations", "titre TEXT"],
  ["collaborations", "description TEXT"],
  ["collaborations", "type_collab TEXT DEFAULT 'benevolat'"],
  ["collaborations", "competences TEXT DEFAULT '[]'"],
  ["collaborations", "deadline TEXT"],
  ["collaborations", "initiative_id INTEGER"],
  // Publications enrichies (système de publication)
  ["fil_posts", "media_url TEXT"],
  ["fil_posts", "media_type TEXT"],
  ["fil_posts", "article_titre TEXT"],
  ["fil_posts", "article_contenu TEXT"],
  ["fil_posts", "video_duree INTEGER"],
  ["fil_posts", "mentions_json TEXT DEFAULT '[]'"],
  // Reposts (style LinkedIn)
  ["fil_posts", "pub_type TEXT"],
  ["fil_posts", "original_post_id INTEGER"],
  ["fil_posts", "repost_commentaire TEXT"],
];
for (const [table, col] of MIGRATIONS) {
  const colName = col.split(" ")[0];
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === colName);
  if (!exists) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`); } catch (e) { /* déjà présent */ }
  }
}

module.exports = db;
