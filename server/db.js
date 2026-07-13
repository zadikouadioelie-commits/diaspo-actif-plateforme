/* ===========================================================
   DIASPO'ACTIF — Couche base de données
   En production (DATABASE_URL définie) : PostgreSQL via Neon
   En développement local : SQLite via node:sqlite
   =========================================================== */
if (process.env.DATABASE_URL) {
  const pg = require('./db-pg');
  module.exports = pg;
  module.exports.backfillOfficialFollow = () => {};
  module.exports.generateDaId = () => Math.random().toString(36).slice(2,10).toUpperCase();
  module.exports.generateDsId = () => 'DS-' + Math.random().toString(36).slice(2,8).toUpperCase();
  return;
}

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
    profil_json         TEXT DEFAULT '{}',
    privacy_json        TEXT DEFAULT '{}',
    bio                 TEXT,
    photo_url           TEXT,
    banner_url          TEXT,
    titre_pro           TEXT,
    competences         TEXT DEFAULT '[]',
    experiences         TEXT DEFAULT '[]',
    theme_couleur       TEXT DEFAULT 'ocean',
    is_verified         INTEGER DEFAULT 0,
    is_official         INTEGER DEFAULT 0,
    is_deal_master      INTEGER DEFAULT 0,
    deal_master_edition_id INTEGER,
    nb_connexions       INTEGER DEFAULT 0,
    temoignage_statut   TEXT DEFAULT 'non_demande' CHECK(temoignage_statut IN ('non_demande','en_attente','fourni','refuse')),
    temoignage_derniere_demande TEXT,
    demo_vue                INTEGER DEFAULT 0,
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

  /* ===== ABONNEMENTS AUX PROFILS PUBLICS COLLECTIVITÉ ===== */
  CREATE TABLE IF NOT EXISTS abonnements_collectivite (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    collectivite_id INTEGER NOT NULL,
    prefs TEXT DEFAULT 'toutes',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, collectivite_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(collectivite_id) REFERENCES users(id)
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

  CREATE TABLE IF NOT EXISTS fil_vitrine_clics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL,
    type_carte TEXT NOT NULL,
    user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id)
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

  /* Réactions/commentaires par photo de galerie (comptes utilisateur ou initiative) */
  CREATE TABLE IF NOT EXISTS galerie_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_type TEXT NOT NULL,   -- 'user' | 'initiative'
    owner_id INTEGER NOT NULL,
    photo_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'jaime',
    UNIQUE(owner_type, owner_id, photo_id, user_id, type)
  );

  CREATE TABLE IF NOT EXISTS galerie_commentaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_type TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    photo_id TEXT NOT NULL,
    auteur_id INTEGER,
    auteur_nom TEXT NOT NULL,
    contenu TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
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

  -- Atelier audiovisuel : médias importés et rendus produits par ffmpeg
  CREATE TABLE IF NOT EXISTS av_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    folder TEXT DEFAULT 'videos',
    nom TEXT NOT NULL,
    type TEXT,
    chemin TEXT NOT NULL,
    duree REAL,
    source TEXT DEFAULT 'upload',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS counters (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );

  /* ===== TRACKING ACTIVITÉ & ENGAGEMENT PLATEFORME ===== */

  CREATE TABLE IF NOT EXISTS user_activity (
    user_id INTEGER NOT NULL,
    date    TEXT    NOT NULL,
    PRIMARY KEY(user_id, date),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    user_id   INTEGER NOT NULL,
    date      TEXT    NOT NULL,
    duree_sec INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id, date),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  /* ===== PLANS D'ABONNEMENT, TRANSACTIONS, PROMOS, PARAMÈTRES ===== */

  CREATE TABLE IF NOT EXISTS plans_abonnement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    description TEXT,
    prix_mensuel REAL DEFAULT 0,
    prix_annuel REAL DEFAULT 0,
    cible TEXT DEFAULT 'tous',
    avantages TEXT DEFAULT '{}',
    actif INTEGER DEFAULT 1,
    ordre INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    plan_id INTEGER,
    montant REAL NOT NULL,
    type TEXT DEFAULT 'abonnement',
    statut TEXT DEFAULT 'reussi',
    reference TEXT,
    code_promo_id INTEGER,
    date_transaction TEXT DEFAULT (datetime('now')),
    periode_debut TEXT,
    periode_fin TEXT,
    notes TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS codes_promo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'pourcentage',
    valeur REAL NOT NULL DEFAULT 0,
    date_debut TEXT,
    date_fin TEXT,
    nb_max_utilisations INTEGER,
    nb_utilisations INTEGER DEFAULT 0,
    cible TEXT DEFAULT 'tous',
    cible_pays TEXT DEFAULT '[]',
    actif INTEGER DEFAULT 1,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS parametres_plateforme (
    cle TEXT PRIMARY KEY,
    valeur TEXT NOT NULL DEFAULT '',
    type TEXT DEFAULT 'booleen',
    description TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by INTEGER
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
    photos_json TEXT DEFAULT '[]',
    video_b64 TEXT DEFAULT NULL,
    audio_b64 TEXT DEFAULT NULL,
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

  /* ===== ABONNÉS ACTUALITÉS — site institutionnel Diaspo'Actif ===== */
  CREATE TABLE IF NOT EXISTS vitrine_actualites_abonnes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  /* ===== COMPTE ADMINISTRATEUR DU SITE INSTITUTIONNEL — distinct des comptes de la plateforme ===== */
  CREATE TABLE IF NOT EXISTS vitrine_site_admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    last_login_at TEXT,
    reset_token TEXT,
    reset_expires INTEGER,
    twofa_code TEXT,
    twofa_expires INTEGER
  );

  /* ===== RAPPORTS DIASPO IMPACT — bibliothèque publique protégée par code d'accès ===== */
  CREATE TABLE IF NOT EXISTS vitrine_rapports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    sous_titre TEXT,
    categorie TEXT NOT NULL DEFAULT 'Autres',
    type TEXT NOT NULL DEFAULT 'Rapport PDF',
    pays TEXT,
    date_publication TEXT,
    resume TEXT,
    lien TEXT,
    cover_image TEXT,
    statut TEXT NOT NULL DEFAULT 'brouillon',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  /* ===== ACTUALITÉS DU SITE INSTITUTIONNEL ===== */
  CREATE TABLE IF NOT EXISTS vitrine_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    resume TEXT,
    contenu TEXT,
    categorie TEXT,
    cover_image TEXT,
    statut TEXT NOT NULL DEFAULT 'brouillon',
    date_publication TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  /* ===== MODULE AMBASSADE / COLLECTIVITÉ ===== */

  CREATE TABLE IF NOT EXISTS ambassade_profil (
    user_id INTEGER PRIMARY KEY,
    nom_officiel TEXT,
    pays_represente TEXT,
    ambassadeur TEXT,
    adresse TEXT,
    telephone TEXT,
    email_officiel TEXT,
    site_web TEXT,
    horaires TEXT DEFAULT '{"lun_ven":"09:00-17:00"}',
    zone_pays TEXT DEFAULT '[]',
    zone_regions TEXT DEFAULT '[]',
    zone_villes TEXT DEFAULT '[]',
    consulats TEXT DEFAULT '[]',
    logo_url TEXT,
    photo_couverture TEXT,
    description TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ambassade_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nom TEXT NOT NULL,
    type TEXT DEFAULT 'document',
    icone TEXT DEFAULT '📄',
    description TEXT,
    conditions TEXT,
    documents_requis TEXT DEFAULT '[]',
    delai TEXT,
    tarif TEXT,
    procedure TEXT,
    actif INTEGER DEFAULT 1,
    ordre INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ambassade_agenda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    type TEXT DEFAULT 'evenement',
    description TEXT,
    date_debut TEXT NOT NULL,
    date_fin TEXT,
    lieu TEXT,
    lien TEXT,
    public INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ambassade_partenariats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nom TEXT NOT NULL,
    type TEXT DEFAULT 'institutionnel',
    description TEXT,
    logo_url TEXT,
    site_web TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ambassade_opportunites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    type TEXT DEFAULT 'appel_offres',
    description TEXT,
    date_limite TEXT,
    lien TEXT,
    budget TEXT,
    actif INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
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

  /* ===== OPPORTUNITÉS STRATÉGIQUES (pont entre Observatoire Mondial et action) ===== */
  CREATE TABLE IF NOT EXISTS opportunites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collectivite_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    description TEXT,
    pays TEXT,
    ville TEXT,
    origine TEXT,
    secteur TEXT,
    priorite TEXT DEFAULT 'moyenne' CHECK(priorite IN ('basse','moyenne','haute','critique')),
    responsable TEXT,
    echeance TEXT,
    etat TEXT DEFAULT 'detectee' CHECK(etat IN ('detectee','en_analyse','planifiee','en_action','realisee','abandonnee')),
    notes TEXT,
    pieces_json TEXT DEFAULT '[]',
    source_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(collectivite_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS opportunite_historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunite_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    action_type TEXT,
    action_ref_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(opportunite_id) REFERENCES opportunites(id)
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

/* ── MODULE PROJETS / INITIATIVES (cycle de vie) ── */
db.exec(`
  CREATE TABLE IF NOT EXISTS projets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'projet',
    statut TEXT DEFAULT 'brouillon',
    createur_id INTEGER NOT NULL,
    categorie TEXT DEFAULT 'Général',
    pays TEXT,
    region TEXT,
    ville TEXT,
    budget_estime REAL,
    date_debut TEXT,
    date_fin TEXT,
    pieces_jointes TEXT DEFAULT '[]',
    tags TEXT DEFAULT '[]',
    note_evaluation INTEGER,
    score_reputation INTEGER DEFAULT 0,
    validateur_id INTEGER,
    date_validation TEXT,
    motif_rejet TEXT,
    nb_vues INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(createur_id) REFERENCES users(id),
    FOREIGN KEY(validateur_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS projets_commentaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id INTEGER NOT NULL,
    auteur_id INTEGER NOT NULL,
    contenu TEXT NOT NULL,
    type TEXT DEFAULT 'commentaire',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(projet_id) REFERENCES projets(id) ON DELETE CASCADE,
    FOREIGN KEY(auteur_id) REFERENCES users(id)
  );
`);

/* ══ MODULE BILLETTERIE / ÉVÉNEMENTS ══ */
db.exec(`
  /* ── ÉVÉNEMENTS (modifiable) ── */
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    description TEXT,
    organisateur_id INTEGER NOT NULL,       -- user.id (role initiative)
    pays TEXT,
    ville TEXT,
    adresse TEXT,
    date_debut TEXT NOT NULL,
    date_fin TEXT,
    capacite INTEGER DEFAULT 0,
    image_b64 TEXT,
    categorie TEXT DEFAULT 'Général',
    statut TEXT DEFAULT 'brouillon',        -- brouillon|publie|archive|ferme
    commission_pct REAL DEFAULT 5.0,        -- % plateforme
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(organisateur_id) REFERENCES users(id)
  );

  /* ── TYPES DE BILLETS (modifiable si 0 ventes) ── */
  CREATE TABLE IF NOT EXISTS ticket_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    nom TEXT NOT NULL,
    description TEXT,
    prix REAL NOT NULL DEFAULT 0,
    quantite_totale INTEGER NOT NULL DEFAULT 100,
    quantite_vendue INTEGER DEFAULT 0,
    type TEXT DEFAULT 'standard',           -- standard|vip|early|sponsor
    actif INTEGER DEFAULT 1,
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  /* ── BILLETS ACHETÉS (IMMUABLE — pas de DELETE ni UPDATE statut sauf used/cancelled) ── */
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    ticket_type_id INTEGER NOT NULL,
    prix_paye REAL NOT NULL,
    commission REAL NOT NULL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending',  -- pending|paid|failed|refunded
    statut TEXT DEFAULT 'valid',            -- valid|used|cancelled
    qr_token TEXT NOT NULL UNIQUE,          -- HMAC signé
    transaction_ref TEXT,                   -- ref transaction paiement
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(event_id) REFERENCES events(id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(ticket_type_id) REFERENCES ticket_types(id)
  );

  /* ── CHECK-IN LOGS (IMMUABLE — INSERT ONLY) ── */
  CREATE TABLE IF NOT EXISTS event_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    scanner_id INTEGER NOT NULL,            -- user.id du scanneur
    resultat TEXT NOT NULL,                 -- accepted|rejected
    motif_rejet TEXT,                       -- raison si rejected
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(ticket_id) REFERENCES tickets(id),
    FOREIGN KEY(event_id) REFERENCES events(id),
    FOREIGN KEY(scanner_id) REFERENCES users(id)
  );

  /* ── PARTICIPANTS (IMMUABLE — anonymisation seulement) ── */
  CREATE TABLE IF NOT EXISTS event_attendees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL UNIQUE,
    event_id INTEGER NOT NULL,
    user_id INTEGER,                        -- NULL si anonymisé
    nom_display TEXT,
    pays TEXT,
    anonymise INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(ticket_id) REFERENCES tickets(id),
    FOREIGN KEY(event_id) REFERENCES events(id)
  );

  /* ── CONFIGURATION BILLETTERIE (1 ligne par événement) ── */
  CREATE TABLE IF NOT EXISTS event_billetterie_config (
    event_id INTEGER PRIMARY KEY,
    billetterie_active INTEGER DEFAULT 0,
    vente_ouverture TEXT,
    vente_fermeture TEXT,
    places_totales INTEGER,
    max_billets_par_commande INTEGER DEFAULT 10,
    vente_en_ligne INTEGER DEFAULT 1,
    billets_nominatifs INTEGER DEFAULT 0,
    billets_remboursables INTEGER DEFAULT 1,
    validation_commande TEXT DEFAULT 'auto',    -- 'auto' | 'manuelle' (billets gratuits uniquement)
    autoriser_partage_billet INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  /* ── CODES PROMO BILLETTERIE (par événement, distinct de la table codes_promo générique plateforme) ── */
  CREATE TABLE IF NOT EXISTS event_codes_promo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    nom TEXT,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'pourcentage',   -- pourcentage|montant_fixe
    valeur REAL NOT NULL DEFAULT 0,
    date_debut TEXT,
    date_fin TEXT,
    nb_max_utilisations INTEGER,
    nb_utilisations INTEGER DEFAULT 0,
    nb_max_par_utilisateur INTEGER DEFAULT 1,
    ticket_type_ids TEXT DEFAULT '[]',          -- JSON array, vide = tous les types de l'événement
    actif INTEGER DEFAULT 1,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
    UNIQUE(event_id, code)
  );

  /* ── UTILISATIONS DE CODES PROMO (IMMUABLE — INSERT ONLY, pour respecter nb_max_par_utilisateur) ── */
  CREATE TABLE IF NOT EXISTS event_codes_promo_usages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    ticket_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(code_id) REFERENCES event_codes_promo(id) ON DELETE CASCADE
  );
`);

/* ══ LISTES DE DIFFUSION ══ */
db.exec(`
  CREATE TABLE IF NOT EXISTS listes_diffusion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proprietaire_id INTEGER NOT NULL,
    nom TEXT NOT NULL,
    description TEXT,
    couleur TEXT DEFAULT '#1B3A6B',
    icone TEXT DEFAULT '📋',
    notes TEXT,
    ordre INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(proprietaire_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS listes_diffusion_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    liste_id INTEGER NOT NULL,
    user_id INTEGER,
    email TEXT,
    nom TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(liste_id) REFERENCES listes_diffusion(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
  );
`);
// Migrations listes_diffusion v2
const _ldCols = db.prepare("PRAGMA table_info(listes_diffusion)").all().map(c=>c.name);
[["couleur TEXT DEFAULT '#1B3A6B'","couleur"],["icone TEXT DEFAULT '📋'","icone"],["notes TEXT","notes"],["ordre INTEGER DEFAULT 0","ordre"],
 ["visibilite TEXT DEFAULT 'privee'","visibilite"],["mode TEXT DEFAULT 'figee'","mode"],["filtres_json TEXT","filtres_json"],["archived INTEGER DEFAULT 0","archived"]]
  .forEach(([def,col])=>{ if(!_ldCols.includes(col)) try{db.prepare(`ALTER TABLE listes_diffusion ADD COLUMN ${def}`).run();}catch(e){} });
const _ldcCols = db.prepare("PRAGMA table_info(listes_diffusion_contacts)").all().map(c=>c.name);
if(!_ldcCols.includes('user_id')) try{db.prepare("ALTER TABLE listes_diffusion_contacts ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL").run();}catch(e){}
if(!_ldcCols.includes('email') && _ldcCols.includes('email')) {} // email already exists
const _vsaCols = db.prepare("PRAGMA table_info(vitrine_site_admins)").all().map(c=>c.name);
[["reset_token TEXT","reset_token"],["reset_expires INTEGER","reset_expires"],["twofa_code TEXT","twofa_code"],["twofa_expires INTEGER","twofa_expires"]]
  .forEach(([def,col])=>{ if(!_vsaCols.includes(col)) try{db.prepare(`ALTER TABLE vitrine_site_admins ADD COLUMN ${def}`).run();}catch(e){} });

/* ── Table "publicites" ré-utilisée depuis l'ancien module ad-hoc : ajoute les colonnes du nouveau module régie publicitaire ── */
const _pubCols = db.prepare("PRAGMA table_info(publicites)").all().map(c=>c.name);
[["user_id INTEGER","user_id"],["media_type TEXT DEFAULT 'image'","media_type"],["media_url TEXT","media_url"],
 ["thumbnail_url TEXT","thumbnail_url"],["cta TEXT DEFAULT 'En savoir plus'","cta"],["duree_jours INTEGER DEFAULT 7","duree_jours"],
 ["cible_langue TEXT DEFAULT '[]'","cible_langue"],["cible_interet TEXT DEFAULT '[]'","cible_interet"],
 ["motif_rejet TEXT","motif_rejet"],["nb_video_views INTEGER DEFAULT 0","nb_video_views"],["nb_full_video_views INTEGER DEFAULT 0","nb_full_video_views"]]
  .forEach(([def,col])=>{ if(!_pubCols.includes(col)) try{db.prepare(`ALTER TABLE publicites ADD COLUMN ${def}`).run();}catch(e){} });

/* ══ WALLET SYSTÈME ══ */
db.exec(`
  /* ── WALLET LEDGER (IMMUABLE — INSERT ONLY) ── */
  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER,                        -- billet source
    event_id INTEGER,
    type TEXT NOT NULL,                       -- 'platform_fee' | 'organizer_credit'
    beneficiaire_id INTEGER,                  -- NULL = plateforme, sinon user.id initiative
    montant REAL NOT NULL,                    -- toujours positif
    commission_rate REAL DEFAULT 0.05,
    prix_billet REAL NOT NULL,
    platform_fee REAL NOT NULL,               -- 5% du prix billet
    organizer_amount REAL NOT NULL,           -- 95% du prix billet
    timestamp TEXT DEFAULT (datetime('now'))
    -- PAS de FOREIGN KEY sur ticket_id pour préserver l'immuabilité même si ticket est modifié
  );

  /* ── PLATFORM WALLET SUMMARY ── */
  CREATE TABLE IF NOT EXISTS platform_wallet (
    id INTEGER PRIMARY KEY CHECK (id = 1),    -- ligne unique
    total_commissions REAL DEFAULT 0,
    total_transactions INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO platform_wallet (id, total_commissions, total_transactions) VALUES (1, 0, 0);
`);

/* -- Migration douce : ajoute les colonnes si elles n'existent pas encore -- */
const MIGRATIONS = [
  // Billetterie V1 — early-bird + attributs enrichis par type de billet
  ["ticket_types", "avantages TEXT"],
  ["ticket_types", "devise TEXT DEFAULT 'EUR'"],
  ["ticket_types", "max_par_acheteur INTEGER"],
  ["ticket_types", "date_vente_debut TEXT"],
  ["ticket_types", "date_vente_fin TEXT"],
  ["ticket_types", "couleur TEXT DEFAULT '#2563EB'"],
  ["ticket_types", "prix_early_bird REAL"],
  ["ticket_types", "early_bird_fin TEXT"],
  // Billetterie V1 — commandes multi-billets, nominatif, code promo appliqué, validation manuelle
  ["tickets", "commande_id TEXT"],
  ["tickets", "titulaire_nom TEXT"],
  ["tickets", "titulaire_prenom TEXT"],
  ["tickets", "code_promo_id INTEGER"],
  ["tickets", "montant_reduction REAL DEFAULT 0"],
  ["tickets", "validation_manuelle_statut TEXT"],
  // Billetterie V1 — lignes de compensation remboursement (sens='debit'), historique existant reste 'credit'
  ["wallet_transactions", "sens TEXT DEFAULT 'credit'"],
  ["conversations", "sujet TEXT"],
  ["conversations", "archive_u1 INTEGER DEFAULT 0"],
  ["conversations", "archive_u2 INTEGER DEFAULT 0"],
  ["conversations", "deleted_u1 INTEGER DEFAULT 0"],
  ["conversations", "deleted_u2 INTEGER DEFAULT 0"],
  ["messages", "type TEXT DEFAULT 'text'"],
  ["messages", "fichier_json TEXT"],
  ["messages", "lu INTEGER DEFAULT 0"],
  // Wallet initiative
  ["users", "wallet_balance REAL DEFAULT 0"],
  // Champs étendus utilisateurs
  ["users", "prenom TEXT"],
  ["users", "date_naissance TEXT"],
  ["users", "nationalite1 TEXT"],
  ["users", "nationalite2 TEXT"],
  ["users", "nationalite3 TEXT"],
  ["users", "origine1 TEXT"],
  ["users", "origine2 TEXT"],
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
  ["users", "privacy_json TEXT DEFAULT '{}'"],
  // Événements enrichis
  ["evenements", "description TEXT"],
  ["evenements", "places_max INTEGER"],
  ["evenements", "image_url TEXT"],
  ["evenements", "domaine TEXT"],
  ["evenements", "type_evt TEXT DEFAULT 'evenement'"],
  ["evenements", "pays TEXT"],
  ["evenements", "ville TEXT"],
  ["evenements", "origine TEXT"],
  // Formulaire d'inscription à un événement
  ["evenements_participants", "nom_complet TEXT"],
  ["evenements_participants", "email TEXT"],
  ["evenements_participants", "telephone TEXT"],
  ["evenements_participants", "nb_personnes INTEGER DEFAULT 1"],
  ["evenements_participants", "message TEXT"],
  ["evenements", "inscription_ouverte INTEGER DEFAULT 1"],
  ["evenements", "lien_inscription TEXT"],
  // Événements v2 — champs complémentaires
  ["evenements", "heure_debut TEXT"],
  ["evenements", "heure_fin TEXT"],
  ["evenements", "date_fin TEXT"],
  ["evenements", "lien_visio TEXT"],
  ["evenements", "visibilite TEXT DEFAULT 'public'"],
  // Événements v3 — multimédia
  ["evenements", "image_couverture TEXT"],
  ["evenements", "galerie_photos TEXT DEFAULT '[]'"],
  ["evenements", "video1_url TEXT"],
  ["evenements", "video1_titre TEXT"],
  ["evenements", "video2_url TEXT"],
  ["evenements", "video2_titre TEXT"],
  ["evenements", "pdf_url TEXT"],
  ["evenements", "pdf_nom TEXT"],
  ["evenements", "pdf_acces TEXT DEFAULT 'public'"],
  // Billetterie events v2 — multimédia
  ["events", "image_couverture TEXT"],
  ["events", "galerie_photos TEXT DEFAULT '[]'"],
  ["events", "video1_url TEXT"],
  ["events", "video1_titre TEXT"],
  ["events", "video2_url TEXT"],
  ["events", "video2_titre TEXT"],
  ["events", "pdf_url TEXT"],
  ["events", "pdf_nom TEXT"],
  ["events", "pdf_acces TEXT DEFAULT 'public'"],
  // Billetterie events v3 — cible
  ["events", "cible_type TEXT DEFAULT 'tous'"],
  ["events", "cible_liste_ids TEXT DEFAULT '[]'"],
  // Billetterie events v4 — fiche conceptuelle
  ["events", "fc_resume TEXT"],
  ["events", "fc_objectifs TEXT"],
  ["events", "fc_public TEXT"],
  ["events", "fc_programme TEXT"],
  ["events", "fc_partenaires TEXT"],
  ["events", "fc_contact TEXT"],
  ["events", "fc_notes TEXT"],
  // Billetterie events v5 — partenaires structurés, vidéos fichiers, planification
  ["events", "fc_partenaires_ids TEXT DEFAULT '[]'"],
  ["events", "video1_thumb TEXT"],
  ["events", "video2_thumb TEXT"],
  ["events", "programmed_at TEXT"],
  ["events", "timezone TEXT DEFAULT 'Europe/Paris'"],
  // Billetterie events v6 — gestion inscriptions sécurisées
  ["events", "inscription_mode TEXT DEFAULT 'libre'"],
  ["events", "nb_places INTEGER"],
  ["events", "liste_attente INTEGER DEFAULT 0"],
  // Billetterie events v7 — rayon de publication + métriques + exposition
  ["events", "rayon_publication TEXT DEFAULT 'international'"],
  ["events", "vues_total INTEGER DEFAULT 0"],
  ["events", "vues_uniques INTEGER DEFAULT 0"],
  ["events", "nb_partages INTEGER DEFAULT 0"],
  ["events", "nb_sauvegardes INTEGER DEFAULT 0"],
  ["events", "publie_at TEXT"],
  ["events", "duree_exposition_jours INTEGER DEFAULT 20"],
  // Dossier QR Code Participants — cycle de vie
  ["events", "qr_folder_notified_at TEXT"],
  ["events", "qr_folder_purged_at TEXT"],
  // Agenda events — lien source
  ["agenda_events", "source_type TEXT DEFAULT 'manuel'"],
  ["agenda_events", "source_id INTEGER"],
  ["agenda_events", "event_id INTEGER"],
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
  // Tracking date sur les réactions (pour tendances engagement)
  ["fil_reactions", "created_at TEXT DEFAULT (datetime('now'))"],
  // Vues initiatives
  ["initiatives", "nb_vues INTEGER DEFAULT 0"],
  // CV & Lettres de motivation
  ["offres_candidatures", "cv_profile_id INTEGER"],
  ["offres_candidatures", "lettre_id INTEGER"],
  ["offres_candidatures", "statut_detail TEXT DEFAULT 'envoyee'"],
  ["offres_candidatures", "vu_recruteur INTEGER DEFAULT 0"],
  ["offres_candidatures", "notes_recruteur TEXT"],
  ["offres_candidatures", "evaluation_json TEXT DEFAULT '{}'"],
  ["offres_candidatures", "date_entretien TEXT"],
  ["offres_candidatures", "lieu_entretien TEXT"],
  ["offres_candidatures", "type_entretien TEXT DEFAULT 'presentiel'"],
  ["offres_candidatures", "type_candidature TEXT DEFAULT 'offre'"],
  // CV versions history
  ["cv_profiles", "versions_json TEXT DEFAULT '[]'"],
  // ── Module Réseau Professionnel ──
  ["initiatives", "numero_immatriculation TEXT"],
  ["initiatives", "pays_immatriculation TEXT"],
  ["initiatives", "taille_structure TEXT"],
  ["initiatives", "annee_creation INTEGER"],
  ["initiatives", "services TEXT DEFAULT '[]'"],
  ["initiatives", "langues TEXT DEFAULT '[]'"],
  ["initiatives", "reseau_visible INTEGER DEFAULT 1"],
  ["initiatives", "accepte_messages INTEGER DEFAULT 1"],
  // Scanner billets — info appareil et localisation
  ["event_checkins", "device_info TEXT"],
  ["event_checkins", "latitude REAL"],
  ["event_checkins", "longitude REAL"],
  // ── Trust & Réactivité ──
  ["users", "identite_verifiee INTEGER DEFAULT 0"],
  ["users", "documents_verifies INTEGER DEFAULT 0"],
  ["users", "diplomes_verifies INTEGER DEFAULT 0"],
  ["users", "entreprise_verifiee INTEGER DEFAULT 0"],
  ["users", "trust_score REAL DEFAULT 0"],
  ["users", "trust_computed_at TEXT"],
  ["users", "reactivity_stars INTEGER DEFAULT 0"],
  ["users", "avg_response_hours REAL"],
  ["users", "response_rate REAL"],
  ["users", "last_active TEXT DEFAULT (datetime('now'))"],
  ["users", "signalements_confirmes INTEGER DEFAULT 0"],
  ["users", "is_verified INTEGER DEFAULT 0"],
  ["users", "is_official INTEGER DEFAULT 0"],
  ["users", "is_deal_master INTEGER DEFAULT 0"],
  ["users", "deal_master_edition_id INTEGER"],
  ["users", "nb_connexions INTEGER DEFAULT 0"],
  ["users", "temoignage_statut TEXT DEFAULT 'non_demande'"],
  ["users", "temoignage_derniere_demande TEXT"],
  ["users", "demo_vue INTEGER DEFAULT 0"],
  // ── Vérification d'identité (Stripe Identity) — 🔐 "Vérifier mon identité" ──
  ["users", "stripe_identity_session_id TEXT"],
  ["users", "identite_verifiee_le TEXT"],
  ["users", "identite_expire_le TEXT"],
  ["users", "identite_renouvellement_notifie INTEGER DEFAULT 0"],
  // ── Cohérence origine/nationalité déclarée vs document Stripe Identity ──
  ["users", "identite_pays_document TEXT"],
  ["users", "identite_mismatch INTEGER DEFAULT 0"],
  // ── Galerie photo personnelle (miroir de initiatives.galerie_json) ──
  ["users", "galerie_json TEXT"],
  // ── Vérification d'organisation (initiatives) — 🏢 "Organisation vérifiée" ──
  ["initiatives", "organisation_verifiee INTEGER DEFAULT 0"],
  ["initiatives", "organisation_verifiee_le TEXT"],
  ["initiatives", "organisation_expire_le TEXT"],
  ["initiatives", "stripe_identity_session_id TEXT"],
  ["initiatives", "signalements_confirmes INTEGER DEFAULT 0"],
  ["initiatives", "commune TEXT"],
  ["initiatives", "departement TEXT"],
  ["initiatives", "comment_entendu TEXT"],
  ["initiatives", "attentes TEXT"],
  ["initiatives", "autorisation_temoignage INTEGER DEFAULT 0"],
  ["initiatives", "nb_salaries INTEGER DEFAULT 0"],
  ["initiatives", "linkedin TEXT"],
  ["initiatives", "twitter TEXT"],
  ["initiatives", "youtube TEXT"],
  ["initiatives", "forme_autre TEXT"],
  ["initiatives", "pays_origine TEXT"],
  // Partenaires Officiels — champs de configuration visibilité
  ["partenaires_officiels", "priorite INTEGER DEFAULT 0"],
  ["partenaires_officiels", "mise_en_avant INTEGER DEFAULT 0"],
  ["partenaires_officiels", "periode_debut TEXT"],
  ["partenaires_officiels", "periode_fin TEXT"],
  ["partenaires_officiels", "slogan TEXT"],
  ["partenaires_officiels", "cles_matching TEXT DEFAULT '[]'"],
  // ── Comptes Étatiques ──
  ["users", "type_organisme TEXT"],
  ["users", "sigle_institution TEXT"],
  ["users", "description_institution TEXT"],
  ["users", "tel_secondaire TEXT"],
  ["users", "email_officiel TEXT"],
  ["users", "email_secondaire TEXT"],
  ["users", "site_officiel TEXT"],
  ["users", "facebook_officiel TEXT"],
  ["users", "twitter_officiel TEXT"],
  ["users", "linkedin_officiel TEXT"],
  ["users", "youtube_officiel TEXT"],
  ["users", "instagram_officiel TEXT"],
  ["users", "tiktok_officiel TEXT"],
  ["users", "whatsapp_officiel TEXT"],
  ["users", "telegram_officiel TEXT"],
  ["users", "nom_responsable_etatique TEXT"],
  ["users", "prenom_responsable_etatique TEXT"],
  ["users", "fonction_responsable_etatique TEXT"],
  ["users", "service_direction_responsable TEXT"],
  ["users", "adresse_pro_responsable TEXT"],
  ["users", "date_prise_fonction TEXT"],
  ["users", "date_fin_mandat TEXT"],
  ["users", "photo_responsable TEXT"],
  ["users", "email_responsable_etatique TEXT"],
  ["users", "tel_responsable_etatique TEXT"],
  ["users", "declaration_officielle INTEGER DEFAULT 0"],
  ["users", "statut_etatique TEXT DEFAULT 'declare'"],
  ["users", "domaine_utilisateur TEXT"],
  // ── Comptes Étatiques v2 : 4 sections ──
  // Section 1 – Institution
  ["users", "date_creation_institution TEXT"],
  ["users", "devise_institution TEXT"],
  ["users", "logo_url TEXT"],
  // Section 2 – Pays d'origine / autorité de rattachement
  ["users", "pays_origine_institution TEXT"],
  ["users", "ministere_tutelle TEXT"],
  ["users", "administration_rattachement TEXT"],
  ["users", "region_origine TEXT"],
  // Section 3 – Pays d'exercice
  ["users", "pays_exercice TEXT"],
  ["users", "region_exercice TEXT"],
  ["users", "departement_exercice TEXT"],
  ["users", "ville_exercice TEXT"],
  ["users", "adresse_exercice TEXT"],
  ["users", "code_postal_exercice TEXT"],
  ["users", "coordonnees_gps TEXT"],
  ["users", "horaires_ouverture TEXT"],
  ["users", "site_local TEXT"],
  // Profil public Collectivité
  ["users", "reseaux_sociaux_officiels TEXT"],
  ["users", "documents_publics_json TEXT DEFAULT '[]'"],
  ["users", "presentation_gouvernance TEXT"],
  ["users", "projets_en_cours_json TEXT DEFAULT '[]'"],
  // Section 4 – Responsable
  ["users", "signature_responsable TEXT"],
  // Hiérarchie institutionnelle
  ["users", "parent_institution_id INTEGER"],
  // ── Badge disponibilité emploi ──
  ["users", "disponible_pour_travailler INTEGER DEFAULT 0"],
  // ── Recrutement campagnes enrichies ──
  ["recrutement_campagnes", "titre_poste TEXT"],
  ["recrutement_campagnes", "secteur_activite TEXT"],
  ["recrutement_campagnes", "region TEXT"],
  ["recrutement_campagnes", "departement TEXT"],
  ["recrutement_campagnes", "teletravail TEXT DEFAULT 'non'"],
  ["recrutement_campagnes", "niveau_etudes TEXT"],
  ["recrutement_campagnes", "experience_annees TEXT"],
  ["recrutement_campagnes", "competences TEXT DEFAULT '[]'"],
  ["recrutement_campagnes", "langues TEXT DEFAULT '[]'"],
  ["recrutement_campagnes", "certifications TEXT DEFAULT '[]'"],
  ["recrutement_campagnes", "qualites TEXT DEFAULT '[]'"],
  ["recrutement_campagnes", "date_debut TEXT"],
  ["recrutement_campagnes", "duree_mission TEXT"],
  ["recrutement_campagnes", "remuneration TEXT"],
  ["recrutement_campagnes", "devise TEXT DEFAULT 'EUR'"],
  ["recrutement_campagnes", "nb_postes INTEGER DEFAULT 1"],
  ["recrutement_campagnes", "photos_json TEXT DEFAULT '[]'"],
  ["recrutement_campagnes", "pdf_b64 TEXT"],
  ["recrutement_campagnes", "pdf_nom TEXT"],
  ["recrutement_campagnes", "date_limite_candidature TEXT"],
  ["recrutement_campagnes", "nb_commentaires INTEGER DEFAULT 0"],
  ["recrutement_campagnes", "nb_favoris INTEGER DEFAULT 0"],
  ["recrutement_campagnes", "nb_republications INTEGER DEFAULT 0"],
  ["recrutement_campagnes", "fil_post_id INTEGER"],
  // ── Recrutement candidatures enrichies ──
  ["recrutement_candidatures", "cv_snapshot TEXT"],
  ["recrutement_candidatures", "lettre_snapshot TEXT"],
  ["recrutement_candidatures", "documents_json TEXT DEFAULT '[]'"],
  // ── Sondages enrichis ──
  ["sondages", "rayon_publication TEXT DEFAULT 'national'"],
  ["sondages", "nb_vues INTEGER DEFAULT 0"],
  ["sondages", "nb_reactions INTEGER DEFAULT 0"],
  ["sondages", "nb_commentaires INTEGER DEFAULT 0"],
  ["sondages", "nb_republications INTEGER DEFAULT 0"],
  ["sondages", "nb_favoris INTEGER DEFAULT 0"],
  ["sondages", "photos_json TEXT DEFAULT '[]'"],
  ["sondages", "pdf_b64 TEXT"],
  ["sondages", "pdf_nom TEXT"],
  ["sondages", "video_url TEXT"],
  ["sondages", "objectif TEXT"],
  ["sondages", "categorie TEXT DEFAULT 'autre'"],
  ["sondages", "ville TEXT"],
  ["sondages", "pays TEXT"],
  ["sondages", "region TEXT"],
  ["sondages", "departement TEXT"],
  ["sondages", "confidentialite TEXT DEFAULT 'anonyme'"],
  ["sondages", "resultats_visibles TEXT DEFAULT 'apres_cloture'"],
  ["sondages", "date_debut TEXT"],
  ["sondages", "une_reponse_par_compte INTEGER DEFAULT 1"],
  ["sondages", "modification_autorisee INTEGER DEFAULT 0"],
  ["sondages", "fil_post_id INTEGER"],
  // ── Questions sondage enrichies ──
  ["sondage_questions", "description TEXT"],
  ["sondage_questions", "min_label TEXT"],
  ["sondage_questions", "max_label TEXT"],
  ["sondage_questions", "min_val INTEGER DEFAULT 1"],
  ["sondage_questions", "max_val INTEGER DEFAULT 5"],
];

/* ===== COMPTES ÉTATIQUES : tables spécifiques ===== */
db.exec(`
  CREATE TABLE IF NOT EXISTS partenaires_institutionnels (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    institution_id   INTEGER NOT NULL,
    partenaire_id    INTEGER NOT NULL,
    statut           TEXT NOT NULL DEFAULT 'en_attente' CHECK(statut IN ('en_attente','accepte','refuse')),
    comment_connu    TEXT,
    invited_by       INTEGER,
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now')),
    UNIQUE(institution_id, partenaire_id),
    FOREIGN KEY(institution_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(partenaire_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(invited_by)     REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS historique_responsables (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    nom          TEXT NOT NULL,
    prenom       TEXT,
    fonction     TEXT,
    date_debut   TEXT,
    date_fin     TEXT,
    created_at   TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS representations_institutionnelles (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    institution_id      INTEGER NOT NULL,
    nom                 TEXT NOT NULL,
    pays_exercice       TEXT NOT NULL,
    region              TEXT,
    departement         TEXT,
    ville               TEXT,
    adresse             TEXT,
    code_postal         TEXT,
    coordonnees_gps     TEXT,
    telephone           TEXT,
    tel_secondaire      TEXT,
    email_officiel      TEXT,
    site_local          TEXT,
    horaires_ouverture  TEXT,
    facebook_officiel   TEXT,
    twitter_officiel    TEXT,
    linkedin_officiel   TEXT,
    youtube_officiel    TEXT,
    instagram_officiel  TEXT,
    nom_responsable     TEXT,
    prenom_responsable  TEXT,
    fonction_responsable TEXT,
    email_responsable   TEXT,
    tel_responsable     TEXT,
    date_prise_fonction TEXT,
    date_fin_mandat     TEXT,
    statut              TEXT DEFAULT 'active' CHECK(statut IN ('active','inactive','fermee')),
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(institution_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

/* ===== SYSTÈME D'ACCRÉDITATIONS DIASPO'ACTIF ===== */
db.exec(`
  CREATE TABLE IF NOT EXISTS compte_accreditations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('mobilisation_active','createur_opportunites')),
    statut TEXT NOT NULL DEFAULT 'active' CHECK(statut IN ('active','suspendue','retiree')),
    date_attribution TEXT DEFAULT (datetime('now')),
    date_expiration TEXT,
    frais_acces REAL DEFAULT 0,
    admin_id INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, type),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(admin_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS accreditations_da_historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    action TEXT NOT NULL,
    admin_id INTEGER,
    admin_nom TEXT,
    motif TEXT,
    frais_acces REAL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS demandes_accreditation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('mobilisation_active','createur_opportunites')),
    message TEXT,
    statut TEXT DEFAULT 'en_attente' CHECK(statut IN ('en_attente','approuvee','refusee')),
    motif_refus TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sondages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    createur_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'sondage' CHECK(type IN ('sondage','consultation_citoyenne','consultation_diaspora','consultation_associative','consultation_sectorielle','appel_projets','mobilisation')),
    sous_type TEXT,
    statut TEXT DEFAULT 'ouvert' CHECK(statut IN ('brouillon','ouvert','cloture','archive')),
    anonyme INTEGER DEFAULT 0,
    cible_roles TEXT DEFAULT '[]',
    cible_pays TEXT DEFAULT '[]',
    date_cloture TEXT,
    nb_reponses INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(createur_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sondage_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sondage_id INTEGER NOT NULL,
    texte TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'choix_unique' CHECK(type IN ('choix_unique','choix_multiple','texte_libre','echelle','classement')),
    options_json TEXT DEFAULT '[]',
    obligatoire INTEGER DEFAULT 1,
    ordre INTEGER DEFAULT 0,
    FOREIGN KEY(sondage_id) REFERENCES sondages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sondage_reponses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sondage_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    user_id INTEGER,
    reponse TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(sondage_id) REFERENCES sondages(id),
    FOREIGN KEY(question_id) REFERENCES sondage_questions(id)
  );

  CREATE TABLE IF NOT EXISTS offres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    createur_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'emploi' CHECK(type IN ('emploi','stage','mission','contrat','partenariat','investissement','distribution','fournisseur','representant','incubation','acceleration','mentorat','coaching','forum_emploi','rencontre_b2b','networking','salon')),
    description TEXT,
    competences_requises TEXT DEFAULT '[]',
    localisation TEXT,
    pays TEXT,
    remuneration TEXT,
    date_limite TEXT,
    nb_postes INTEGER DEFAULT 1,
    statut TEXT DEFAULT 'publiee' CHECK(statut IN ('brouillon','publiee','cloturee','archivee')),
    nb_candidatures INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(createur_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS offres_candidatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    offre_id INTEGER NOT NULL,
    candidat_id INTEGER NOT NULL,
    message TEXT,
    cv_url TEXT,
    lettre_url TEXT,
    statut TEXT DEFAULT 'recu' CHECK(statut IN ('recu','en_etude','entretien','accepte','refuse')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(offre_id, candidat_id),
    FOREIGN KEY(offre_id) REFERENCES offres(id),
    FOREIGN KEY(candidat_id) REFERENCES users(id)
  );
`);

/* Table uploads (créée séparément car hors liste MIGRATIONS) */
db.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    nom TEXT,
    mime TEXT NOT NULL DEFAULT 'image/jpeg',
    taille INTEGER DEFAULT 0,
    data BLOB NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS chatbot_memoire (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    contenu TEXT NOT NULL,
    categorie TEXT DEFAULT 'Général',
    mots_cles TEXT DEFAULT '[]',
    priorite INTEGER DEFAULT 5,
    liens_json TEXT DEFAULT '[]',
    source TEXT DEFAULT 'admin',
    actif INTEGER DEFAULT 1,
    nb_consultations INTEGER DEFAULT 0,
    ordre INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS chatbot_memoire_historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memoire_id INTEGER NOT NULL,
    auteur_id INTEGER,
    auteur_nom TEXT,
    ancien_titre TEXT,
    nouveau_titre TEXT,
    ancien_contenu TEXT,
    nouveau_contenu TEXT,
    ancien_categorie TEXT,
    nouveau_categorie TEXT,
    commentaire TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(memoire_id) REFERENCES chatbot_memoire(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chatbot_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    question_norm TEXT NOT NULL,
    nb_fois INTEGER DEFAULT 1,
    langue TEXT DEFAULT 'fr',
    categorie_estimee TEXT,
    utilisateur_id INTEGER,
    contexte TEXT,
    statut TEXT DEFAULT 'ouvert',
    memoire_id INTEGER,
    reponse_admin TEXT,
    first_asked_at TEXT DEFAULT (datetime('now')),
    last_asked_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(utilisateur_id) REFERENCES users(id),
    FOREIGN KEY(memoire_id) REFERENCES chatbot_memoire(id)
  );

  CREATE TABLE IF NOT EXISTS cv_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    numero INTEGER NOT NULL DEFAULT 1 CHECK(numero IN (1,2)),
    titre TEXT DEFAULT 'Mon CV',
    theme TEXT DEFAULT 'bleu',
    data_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, numero),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS lettres_motivation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    numero INTEGER NOT NULL DEFAULT 1 CHECK(numero IN (1,2)),
    titre TEXT DEFAULT 'Ma lettre',
    data_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, numero),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS candidature_historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidature_id INTEGER NOT NULL,
    statut TEXT NOT NULL,
    note TEXT,
    auteur_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(candidature_id) REFERENCES offres_candidatures(id),
    FOREIGN KEY(auteur_id) REFERENCES users(id)
  );

  /* ===== AGENDA PERSONNEL ===== */
  CREATE TABLE IF NOT EXISTS agenda_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    description TEXT,
    date_debut TEXT NOT NULL,
    date_fin TEXT NOT NULL,
    lieu TEXT,
    lieu_type TEXT DEFAULT 'physique',
    couleur TEXT DEFAULT '#4a90d9',
    participants_json TEXT DEFAULT '[]',
    notes_privees TEXT,
    rdv_id INTEGER,
    meeting_id INTEGER,
    all_day INTEGER DEFAULT 0,
    recurrence TEXT DEFAULT 'none',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  /* ===== RENDEZ-VOUS (PROPOSITIONS) ===== */
  CREATE TABLE IF NOT EXISTS rdv_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposeur_id INTEGER NOT NULL,
    destinataire_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    description TEXT,
    date_proposee TEXT NOT NULL,
    heure_debut TEXT NOT NULL,
    heure_fin TEXT NOT NULL,
    duree_minutes INTEGER DEFAULT 30,
    lieu TEXT,
    lieu_type TEXT DEFAULT 'virtuel',
    statut TEXT DEFAULT 'en_attente' CHECK(statut IN ('en_attente','accepte','refuse','contre_proposition','annule','expire')),
    contre_date TEXT,
    contre_heure_debut TEXT,
    contre_heure_fin TEXT,
    message_reponse TEXT,
    document_url TEXT,
    meeting_id INTEGER,
    event_proposeur_id INTEGER,
    event_destinataire_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(proposeur_id) REFERENCES users(id),
    FOREIGN KEY(destinataire_id) REFERENCES users(id)
  );

  /* ===== DEMANDES DE MISE EN RELATION (comptes Collectivité → membres) =====
     Principe 3 : le premier contact appartient au membre. Une collectivité ne peut
     pas créer directement une conversation avec un particulier/une organisation ;
     elle envoie une demande, que le destinataire accepte, refuse ou ignore. */
  CREATE TABLE IF NOT EXISTS demandes_relation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collectivite_id INTEGER NOT NULL,
    membre_id INTEGER NOT NULL,
    message TEXT,
    statut TEXT DEFAULT 'en_attente' CHECK(statut IN ('en_attente','acceptee','refusee')),
    conversation_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(collectivite_id) REFERENCES users(id),
    FOREIGN KEY(membre_id) REFERENCES users(id)
  );

  /* ===== SALLES DE RÉUNION VIRTUELLE ===== */
  CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT UNIQUE NOT NULL,
    token_host TEXT NOT NULL,
    token_guest TEXT NOT NULL,
    titre TEXT,
    host_id INTEGER NOT NULL,
    rdv_id INTEGER,
    statut TEXT DEFAULT 'en_attente' CHECK(statut IN ('en_attente','actif','termine','expire')),
    duree_max_minutes INTEGER DEFAULT 40,
    started_at TEXT,
    ended_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(host_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS meeting_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'guest',
    rejoint_at TEXT,
    quitte_at TEXT,
    UNIQUE(meeting_id, user_id),
    FOREIGN KEY(meeting_id) REFERENCES meetings(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  /* Signaux WebRTC (offres, réponses, ICE candidates) via polling */
  CREATE TABLE IF NOT EXISTS meeting_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    from_peer TEXT NOT NULL,
    to_peer TEXT,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    consumed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  /* Historique des réunions */
  CREATE TABLE IF NOT EXISTS meeting_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    duree_effective_minutes INTEGER DEFAULT 0,
    statut TEXT DEFAULT 'termine',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(meeting_id) REFERENCES meetings(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  /* Rappels programmés */
  CREATE TABLE IF NOT EXISTS agenda_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    remind_at TEXT NOT NULL,
    type TEXT DEFAULT '1h',
    sent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(event_id) REFERENCES agenda_events(id)
  );

  /* ============================================================
     MODULE RÉSEAU PROFESSIONNEL — Annuaires des Initiatives
  ============================================================ */

  CREATE TABLE IF NOT EXISTS reseau_affiliations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demandeur_id INTEGER NOT NULL,    -- initiative qui demande
    destinataire_id INTEGER NOT NULL, -- initiative qui reçoit / tient l'annuaire
    statut TEXT DEFAULT 'en_attente' CHECK(statut IN ('en_attente','accepte','refuse','suspendu','info_demandee')),
    message TEXT,
    mise_en_avant INTEGER DEFAULT 0,
    reponse TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(demandeur_id, destinataire_id),
    FOREIGN KEY(demandeur_id) REFERENCES initiatives(id),
    FOREIGN KEY(destinataire_id) REFERENCES initiatives(id)
  );

  CREATE TABLE IF NOT EXISTS reseau_recommandations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL,        -- initiative recommandée
    auteur_initiative_id INTEGER NOT NULL,  -- initiative qui recommande
    contenu TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(initiative_id, auteur_initiative_id),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id),
    FOREIGN KEY(auteur_initiative_id) REFERENCES initiatives(id)
  );

  /* ============================================================
     MODULE RÉUNIONS COLLABORATIVES
  ============================================================ */

  CREATE TABLE IF NOT EXISTS reunions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    description TEXT,
    organisateur_id INTEGER NOT NULL,
    type TEXT DEFAULT 'reunion' CHECK(type IN ('reunion','rdv','conference','webinaire')),
    acces TEXT DEFAULT 'prive' CHECK(acces IN ('prive','public')),
    statut TEXT DEFAULT 'planifiee' CHECK(statut IN ('planifiee','en_cours','terminee','annulee')),
    date_debut TEXT NOT NULL,
    date_fin TEXT,
    duree_minutes INTEGER,
    jitsi_room TEXT UNIQUE,
    enregistrement_active INTEGER DEFAULT 0,
    ordre_du_jour TEXT,
    started_at TEXT,
    ended_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(organisateur_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_reunions_organisateur ON reunions(organisateur_id);

  CREATE TABLE IF NOT EXISTS reunion_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reunion_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'participant' CHECK(role IN ('participant','moderateur','coorganisateur')),
    statut TEXT DEFAULT 'en_attente' CHECK(statut IN ('en_attente','accepte','refuse')),
    rejoint_at TEXT,
    quitte_at TEXT,
    duree_presence_minutes INTEGER,
    invited_at TEXT DEFAULT (datetime('now')),
    UNIQUE(reunion_id, user_id),
    FOREIGN KEY(reunion_id) REFERENCES reunions(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_reunion_invites_user ON reunion_invites(user_id);

  CREATE TABLE IF NOT EXISTS reunion_resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reunion_id INTEGER NOT NULL UNIQUE,
    redacteur_id INTEGER,
    sujets TEXT DEFAULT '[]',
    decisions TEXT DEFAULT '[]',
    actions TEXT DEFAULT '[]',
    notes TEXT,
    statut TEXT DEFAULT 'brouillon' CHECK(statut IN ('brouillon','valide','archive')),
    valide_at TEXT,
    valide_par INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(reunion_id) REFERENCES reunions(id)
  );

  CREATE TABLE IF NOT EXISTS reunion_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reunion_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    description TEXT,
    responsable_id INTEGER,
    type_suivi TEXT DEFAULT 'action' CHECK(type_suivi IN ('action','tache','projet','rappel','initiative')),
    echeance TEXT,
    statut TEXT DEFAULT 'ouvert' CHECK(statut IN ('ouvert','en_cours','termine')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(reunion_id) REFERENCES reunions(id),
    FOREIGN KEY(responsable_id) REFERENCES users(id)
  );
`);
for (const [table, col] of MIGRATIONS) {
  const colName = col.split(" ")[0];
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === colName);
  if (!exists) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`); } catch (e) { /* déjà présent */ }
  }
}

/* =====================================================================
   TRUST SCORE · RÉACTIVITÉ · ABSENCE · SIGNALEMENTS
   ===================================================================== */
db.exec(`

  /* ── Mode absence utilisateur ── */
  CREATE TABLE IF NOT EXISTS user_absence (
    user_id   INTEGER PRIMARY KEY,
    mode      TEXT NOT NULL CHECK(mode IN ('vacances','deplacement','indisponible','mission','conge','autre')),
    debut     TEXT DEFAULT (date('now')),
    fin       TEXT,
    message   TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  /* ── Signalements compte inactif ── */
  CREATE TABLE IF NOT EXISTS account_reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL,
    reported_id INTEGER NOT NULL,
    conv_id     INTEGER,                              -- preuve : conversation concernée
    statut      TEXT DEFAULT 'en_attente'
                  CHECK(statut IN ('en_attente','classe','rappel_envoye','masque','resolu')),
    admin_id    INTEGER,
    admin_note  TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(reporter_id, reported_id),                 -- un seul signalement par paire
    FOREIGN KEY(reporter_id) REFERENCES users(id),
    FOREIGN KEY(reported_id) REFERENCES users(id)
  );

  /* ── Signalements d'initiative ── */
  CREATE TABLE IF NOT EXISTS initiative_reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id   INTEGER NOT NULL,
    initiative_id INTEGER NOT NULL,
    motif         TEXT NOT NULL,
    description   TEXT,
    preuves       TEXT DEFAULT '[]',                  -- JSON [{type,url,nom}]
    statut        TEXT DEFAULT 'en_attente'
                    CHECK(statut IN ('en_attente','en_cours','classe','suspendu','masque','transmis')),
    admin_id      INTEGER,
    admin_note    TEXT,
    admin_action  TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(reporter_id) REFERENCES users(id),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id)
  );

  /* ── Historique des actions de modération (immuable) ── */
  CREATE TABLE IF NOT EXISTS report_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    report_type TEXT NOT NULL CHECK(report_type IN ('account','initiative')),
    report_id   INTEGER NOT NULL,
    admin_id    INTEGER,
    admin_nom   TEXT,
    action      TEXT NOT NULL,
    note        TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  /* ── Demandes de suppression définitive de compte (RGPD, workflow admin) ── */
  CREATE TABLE IF NOT EXISTS deletion_requests (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL,
    type_compte       TEXT NOT NULL,
    initiative_id     INTEGER,
    motif             TEXT,
    statut            TEXT NOT NULL DEFAULT 'demande_recue'
                        CHECK(statut IN ('demande_recue','en_discussion','en_cours_analyse','validee','refusee','compte_supprime')),
    admin_id          INTEGER,
    admin_justification TEXT,
    documents_json    TEXT DEFAULT '[]',
    numero_dossier    TEXT,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now')),
    deleted_at        TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(admin_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS deletion_request_messages (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    deletion_request_id  INTEGER NOT NULL,
    sender_id             INTEGER NOT NULL,
    contenu               TEXT NOT NULL,
    fichier_json          TEXT,
    lu                    INTEGER DEFAULT 0,
    created_at            TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(deletion_request_id) REFERENCES deletion_requests(id),
    FOREIGN KEY(sender_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS deletion_request_history (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    deletion_request_id  INTEGER NOT NULL,
    admin_id              INTEGER,
    admin_nom             TEXT,
    action                TEXT NOT NULL,
    note                  TEXT,
    created_at            TEXT DEFAULT (datetime('now'))
  );

  /* ── Cache du score de confiance ── */
  CREATE TABLE IF NOT EXISTS trust_cache (
    user_id     INTEGER PRIMARY KEY,
    score       REAL NOT NULL DEFAULT 0,
    detail_json TEXT DEFAULT '[]',
    label       TEXT DEFAULT 'Faible',
    computed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  /* ── Journal d'erreurs serveur (monitoring maison, sans service externe) ── */
  CREATE TABLE IF NOT EXISTS error_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message    TEXT,
    stack      TEXT,
    context    TEXT,
    url        TEXT,
    method     TEXT,
    user_id    INTEGER,
    resolu     INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

`);

/* ── Package Diaspo'Actif ── */
db.exec(`
  CREATE TABLE IF NOT EXISTS da_packages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    icon        TEXT NOT NULL,
    url         TEXT NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    show_on     TEXT NOT NULL DEFAULT '["home","footer","profil"]',
    category    TEXT NOT NULL DEFAULT 'social',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );
`);

// Seed via prepared statements pour éviter les problèmes d'encodage emoji dans db.exec()
;(function seedPackages() {
  const existing = db.prepare('SELECT COUNT(*) as n FROM da_packages').get();
  if (existing.n > 0) return;
  const ins = db.prepare(
    'INSERT OR IGNORE INTO da_packages (slug,name,icon,url,enabled,sort_order,show_on,category) VALUES (?,?,?,?,?,?,?,?)'
  );
  const H = JSON.stringify; // shorthand
  [
    ['site-officiel', "Site Diaspo'Actif", '\u{1F310}', 'https://www.diaspoactif.com',             1,  0, '["home","footer","profil","menu"]', 'officiel'],
    ['blog',          "Blog Diaspo'Actif", '\u{1F4DD}', 'https://blog.diaspoactif.com',             1,  1, '["home","footer"]',                 'officiel'],
    ['centre-aide',   "Centre d'aide",     '\u{1F4A1}', 'https://aide.diaspoactif.com',             1,  2, '["home","footer","menu"]',          'officiel'],
    ['documentation', 'Documentation',     '\u{1F4DA}', 'https://docs.diaspoactif.com',             0,  3, '["footer"]',                        'officiel'],
    ['newsletter',    'Newsletter',        '\u{1F4E7}', 'https://newsletter.diaspoactif.com',       1,  4, '["home","footer"]',                 'officiel'],
    ['espace-presse', 'Espace presse',     '\u{1F4F0}', 'https://presse.diaspoactif.com',           0,  5, '["footer"]',                        'officiel'],
    ['youtube',       'YouTube',           '\u{25B6}️', 'https://youtube.com/@diaspoactif',    1, 10, '["home","footer","profil"]',        'social'],
    ['linkedin',      'LinkedIn',          '\u{1F4BC}', 'https://linkedin.com/company/diaspoactif', 1, 11, '["home","footer","profil"]',        'social'],
    ['instagram',     'Instagram',         '\u{1F4F8}', 'https://instagram.com/diaspoactif',        1, 12, '["home","footer","profil"]',        'social'],
    ['facebook',      'Facebook',          '\u{1F465}', 'https://facebook.com/diaspoactif',         1, 13, '["home","footer"]',                 'social'],
    ['twitter-x',     'X (Twitter)',       'X',         'https://x.com/diaspoactif',                1, 14, '["home","footer"]',                 'social'],
    ['tiktok',        'TikTok',            '\u{1F3B5}', 'https://tiktok.com/@diaspoactif',          0, 15, '["home"]',                          'social'],
    ['whatsapp',      'WhatsApp',          '\u{1F4AC}', '',                                         0, 20, '["home"]',                          'messagerie'],
    ['telegram',      'Telegram',          '✉',    '',                                         0, 21, '["home"]',                          'messagerie'],
    ['discord',       'Discord',           '\u{1F3AE}', '',                                         0, 22, '["home"]',                          'messagerie'],
  ].forEach(([slug, name, icon, url, enabled, sort_order, show_on, cat]) => {
    ins.run(slug, name, icon, url, enabled, sort_order, show_on, cat);
  });
})();

/* ══════════════════════════════════════════════════════
   MODULE GÉRER UN DEAL
══════════════════════════════════════════════════════ */
db.exec(`
  /* Accréditation "Gérer un Deal" par initiative */
  CREATE TABLE IF NOT EXISTS deal_accreditations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL UNIQUE,
    statut        TEXT NOT NULL DEFAULT 'active' CHECK(statut IN ('active','suspendue','retiree')),
    admin_id      INTEGER,
    admin_nom     TEXT,
    motif         TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id)
  );

  /* Deals (espaces de collaboration privés) */
  CREATE TABLE IF NOT EXISTS deals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    titre           TEXT NOT NULL,
    description     TEXT,
    objectif        TEXT,
    categorie       TEXT DEFAULT 'partenariat',
    confidentialite TEXT DEFAULT 'prive' CHECK(confidentialite IN ('prive','confidentiel','ultra_confidentiel')),
    statut          TEXT DEFAULT 'brouillon' CHECK(statut IN ('brouillon','en_attente','actif','cloture','archive')),
    createur_id     INTEGER NOT NULL,
    date_debut      TEXT,
    date_fin_prev   TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(createur_id) REFERENCES initiatives(id)
  );

  /* Participants au deal */
  CREATE TABLE IF NOT EXISTS deal_participants (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id       INTEGER NOT NULL,
    initiative_id INTEGER NOT NULL,
    role          TEXT DEFAULT 'participant' CHECK(role IN ('createur','participant','observateur')),
    statut        TEXT DEFAULT 'invite' CHECK(statut IN ('invite','accepte','refuse','retire')),
    message_inv   TEXT,
    repondu_at    TEXT,
    joined_at     TEXT DEFAULT (datetime('now')),
    UNIQUE(deal_id, initiative_id),
    FOREIGN KEY(deal_id) REFERENCES deals(id),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id)
  );

  /* Tâches du deal */
  CREATE TABLE IF NOT EXISTS deal_tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id       INTEGER NOT NULL,
    titre         TEXT NOT NULL,
    description   TEXT,
    assignee_id   INTEGER,
    priorite      TEXT DEFAULT 'normale' CHECK(priorite IN ('basse','normale','haute','urgente')),
    statut        TEXT DEFAULT 'a_faire' CHECK(statut IN ('a_faire','en_cours','bloquee','terminee','annulee')),
    date_echeance TEXT,
    created_by    INTEGER,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(deal_id) REFERENCES deals(id)
  );

  /* Documents du deal */
  CREATE TABLE IF NOT EXISTS deal_documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id     INTEGER NOT NULL,
    dossier     TEXT DEFAULT '/',
    nom         TEXT NOT NULL,
    type_mime   TEXT,
    taille      INTEGER DEFAULT 0,
    contenu_b64 TEXT,
    version     INTEGER DEFAULT 1,
    uploaded_by INTEGER,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(deal_id) REFERENCES deals(id)
  );

  /* Messages internes du deal */
  CREATE TABLE IF NOT EXISTS deal_messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id       INTEGER NOT NULL,
    auteur_id     INTEGER NOT NULL,
    auteur_nom    TEXT,
    contenu       TEXT NOT NULL,
    type          TEXT DEFAULT 'message' CHECK(type IN ('message','annonce','decision')),
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(deal_id) REFERENCES deals(id)
  );

  /* Notes collaboratives du deal */
  CREATE TABLE IF NOT EXISTS deal_notes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id       INTEGER NOT NULL,
    titre         TEXT NOT NULL,
    contenu       TEXT,
    type          TEXT DEFAULT 'note' CHECK(type IN ('note','compte_rendu','proposition','contrat','autre')),
    auteur_id     INTEGER,
    auteur_nom    TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(deal_id) REFERENCES deals(id)
  );

  /* Événements calendrier du deal */
  CREATE TABLE IF NOT EXISTS deal_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id     INTEGER NOT NULL,
    titre       TEXT NOT NULL,
    description TEXT,
    type        TEXT DEFAULT 'reunion' CHECK(type IN ('reunion','echeance','rappel','appel','autre')),
    date_debut  TEXT NOT NULL,
    date_fin    TEXT,
    created_by  INTEGER,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(deal_id) REFERENCES deals(id)
  );

  /* Journal d'activité du deal (immuable) */
  CREATE TABLE IF NOT EXISTS deal_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id    INTEGER NOT NULL,
    acteur_id  INTEGER,
    acteur_nom TEXT,
    action     TEXT NOT NULL,
    detail     TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(deal_id) REFERENCES deals(id)
  );
  CREATE TABLE IF NOT EXISTS deal_objectifs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id         INTEGER NOT NULL,
    titre           TEXT NOT NULL,
    responsable_nom TEXT,
    date_limite     TEXT,
    progression     INTEGER DEFAULT 0 CHECK(progression BETWEEN 0 AND 100),
    statut          TEXT DEFAULT 'en_cours' CHECK(statut IN ('en_cours','atteint','abandonne')),
    ordre           INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(deal_id) REFERENCES deals(id)
  );
  CREATE TABLE IF NOT EXISTS deal_jalons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id     INTEGER NOT NULL,
    titre       TEXT NOT NULL,
    description TEXT,
    date_prevue TEXT,
    date_reelle TEXT,
    statut      TEXT DEFAULT 'prevu' CHECK(statut IN ('prevu','en_cours','valide','reporte')),
    ordre       INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(deal_id) REFERENCES deals(id)
  );

  /* ═══════════════════════════════════════════════════════════════
     MODULE ÉVALUATION DE PROJET — envoi peer-to-peer d'un projet à un
     ou plusieurs destinataires, évaluation totalement indépendante entre
     destinataires (aucun ne voit le dossier des autres). Système PARALLÈLE
     à la table "projets" existante (modération admin à validateur unique,
     différent) — préfixe proj_eval_* pour éviter toute collision.
     ═══════════════════════════════════════════════════════════════ */
  CREATE TABLE IF NOT EXISTS proj_eval_projets (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    createur_id            INTEGER NOT NULL,
    nom_projet             TEXT NOT NULL,
    categorie              TEXT,
    secteur                TEXT,
    pays                   TEXT,
    resume                 TEXT,
    description            TEXT,
    objectifs              TEXT,
    budget_estime          REAL,
    avancement             TEXT,
    date_souhaitee         TEXT,
    business_plan_id       INTEGER,
    lettre_accompagnement  TEXT,
    statut_global          TEXT DEFAULT 'brouillon' CHECK(statut_global IN ('brouillon','envoye','archive')),
    created_at             TEXT DEFAULT (datetime('now')),
    updated_at             TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(createur_id) REFERENCES users(id),
    FOREIGN KEY(business_plan_id) REFERENCES business_plans(id)
  );
  /* Cœur du modèle : 1 ligne par destinataire = dossier indépendant (à la deal_participants) */
  CREATE TABLE IF NOT EXISTS proj_eval_destinataires (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id          INTEGER NOT NULL,
    destinataire_id    INTEGER NOT NULL,
    type_destinataire  TEXT DEFAULT 'membre',
    statut             TEXT DEFAULT 'recu' CHECK(statut IN ('recu','en_analyse','documents_demandes','entretien_propose','accepte','refuse','amelioration_demandee')),
    note_qualite       INTEGER CHECK(note_qualite BETWEEN 1 AND 5),
    note_faisabilite   INTEGER CHECK(note_faisabilite BETWEEN 1 AND 5),
    note_impact        INTEGER CHECK(note_impact BETWEEN 1 AND 5),
    commentaire_eval   TEXT,
    motif_decision     TEXT,
    pris_en_charge_at  TEXT,
    decision_at        TEXT,
    created_at         TEXT DEFAULT (datetime('now')),
    updated_at         TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(projet_id) REFERENCES proj_eval_projets(id) ON DELETE CASCADE,
    FOREIGN KEY(destinataire_id) REFERENCES users(id),
    UNIQUE(projet_id, destinataire_id)
  );
  CREATE TABLE IF NOT EXISTS proj_eval_documents (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    projet_id        INTEGER NOT NULL,
    destinataire_id  INTEGER,
    nom              TEXT,
    type_mime        TEXT,
    categorie        TEXT DEFAULT 'autre' CHECK(categorie IN ('business_plan','devis','contrat','plan','audio','video','image','autre')),
    taille           INTEGER,
    url_bunny        TEXT,
    contenu_b64      TEXT,
    duree_secondes   INTEGER,
    uploaded_by      INTEGER,
    created_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(projet_id) REFERENCES proj_eval_projets(id) ON DELETE CASCADE,
    FOREIGN KEY(destinataire_id) REFERENCES proj_eval_destinataires(id) ON DELETE CASCADE
  );
  /* Checklist de documents complémentaires demandés, par dossier */
  CREATE TABLE IF NOT EXISTS proj_eval_demandes_documents (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    destinataire_id  INTEGER NOT NULL,
    items_json       TEXT DEFAULT '[]',
    message          TEXT,
    statut           TEXT DEFAULT 'en_attente' CHECK(statut IN ('en_attente','repondu')),
    created_at       TEXT DEFAULT (datetime('now')),
    repondu_at       TEXT,
    FOREIGN KEY(destinataire_id) REFERENCES proj_eval_destinataires(id) ON DELETE CASCADE
  );
  /* Audit log immuable par dossier (pattern deal_history) */
  CREATE TABLE IF NOT EXISTS proj_eval_historique (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    destinataire_id  INTEGER NOT NULL,
    acteur_id        INTEGER,
    acteur_nom       TEXT,
    action           TEXT NOT NULL,
    detail           TEXT,
    created_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(destinataire_id) REFERENCES proj_eval_destinataires(id) ON DELETE CASCADE
  );
  /* Messages liés à UN dossier précis — pas la messagerie 1-1 générique
     (conversations/messages a une contrainte UNIQUE(user1_id,user2_id) qui empêcherait
     plusieurs fils indépendants entre les deux mêmes comptes pour plusieurs projets/dossiers) */
  CREATE TABLE IF NOT EXISTS proj_eval_messages (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    destinataire_id  INTEGER NOT NULL,
    auteur_id        INTEGER NOT NULL,
    contenu          TEXT,
    fichier_json     TEXT,
    created_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(destinataire_id) REFERENCES proj_eval_destinataires(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS proj_eval_rendezvous (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    destinataire_id  INTEGER NOT NULL,
    propose_par      INTEGER NOT NULL,
    date_heure       TEXT NOT NULL,
    lieu_ou_lien     TEXT,
    note             TEXT,
    statut           TEXT DEFAULT 'propose' CHECK(statut IN ('propose','accepte','refuse')),
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(destinataire_id) REFERENCES proj_eval_destinataires(id) ON DELETE CASCADE
  );

  /* ───── Partenaires Officiels Diaspo'Actif ───── */
  CREATE TABLE IF NOT EXISTS partenaires_officiels (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id              INTEGER NOT NULL UNIQUE,
    statut               TEXT NOT NULL DEFAULT 'active' CHECK(statut IN ('active','suspendue','retiree')),
    domaines_expertise   TEXT DEFAULT '[]',
    pays_intervention    TEXT DEFAULT '[]',
    services             TEXT DEFAULT '[]',
    description_complete TEXT,
    site_web             TEXT,
    liens_utiles         TEXT DEFAULT '[]',
    categorie            TEXT DEFAULT 'general',
    niveau_visibilite    TEXT DEFAULT 'public' CHECK(niveau_visibilite IN ('public','membres')),
    nbr_recommandations  INTEGER DEFAULT 0,
    admin_id             INTEGER,
    admin_notes          TEXT,
    date_attribution     TEXT DEFAULT (datetime('now')),
    date_expiration      TEXT,
    priorite             INTEGER DEFAULT 0,
    mise_en_avant        INTEGER DEFAULT 0,
    periode_debut        TEXT,
    periode_fin          TEXT,
    slogan               TEXT,
    cles_matching        TEXT DEFAULT '[]',
    created_at           TEXT DEFAULT (datetime('now')),
    updated_at           TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id)  REFERENCES users(id),
    FOREIGN KEY(admin_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS partenaires_officiels_historique (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    action     TEXT NOT NULL,
    admin_id   INTEGER,
    admin_nom  TEXT,
    motif      TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS partenaires_impressions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    partenaire_id  INTEGER NOT NULL,
    user_id        INTEGER,
    event_type     TEXT NOT NULL DEFAULT 'view' CHECK(event_type IN ('view','click','contact','profile_visit')),
    source         TEXT DEFAULT 'homepage',
    created_at     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(partenaire_id) REFERENCES partenaires_officiels(id)
  );

  CREATE TABLE IF NOT EXISTS partenaires_config (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    cle           TEXT NOT NULL UNIQUE,
    valeur        TEXT NOT NULL,
    description   TEXT,
    updated_at    TEXT DEFAULT (datetime('now'))
  );

  /* ═══════════════════════════════════════════════
     DEAL MASTER — Distinction d'excellence semestrielle
     ═══════════════════════════════════════════════ */

  /* Éditions semestrielles */
  CREATE TABLE IF NOT EXISTS deal_master_editions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    label           TEXT NOT NULL,            -- ex: "Semestre 1 – 2026"
    periode_debut   TEXT NOT NULL,            -- date ISO début
    periode_fin     TEXT NOT NULL,            -- date ISO fin
    statut          TEXT NOT NULL DEFAULT 'en_cours'
                    CHECK(statut IN ('planifiee','en_cours','calculee','publiee','archivee')),
    top_pct         REAL  DEFAULT 10.0,       -- % de lauréats (ex: 10.0)
    nb_laureats     INTEGER DEFAULT 0,
    calcule_at      TEXT,
    publie_at       TEXT,
    criteres_json   TEXT DEFAULT '{}',        -- snapshot des critères utilisés
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  /* Critères configurables (poids) */
  CREATE TABLE IF NOT EXISTS deal_master_criteres (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cle         TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL,
    description TEXT,
    poids       REAL NOT NULL DEFAULT 1.0,
    actif       INTEGER DEFAULT 1,
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  /* Lauréats par édition */
  CREATE TABLE IF NOT EXISTS deal_master_laureats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_id  INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    score       REAL NOT NULL DEFAULT 0,
    rang        INTEGER NOT NULL,
    score_detail TEXT DEFAULT '{}',          -- JSON détail par critère
    date_attribution TEXT DEFAULT (datetime('now')),
    date_expiration  TEXT NOT NULL,
    actif       INTEGER DEFAULT 1,
    UNIQUE(edition_id, user_id),
    FOREIGN KEY(edition_id) REFERENCES deal_master_editions(id),
    FOREIGN KEY(user_id)    REFERENCES users(id)
  );

  /* Scores courants par utilisateur (pour affichage personnel) */
  CREATE TABLE IF NOT EXISTS deal_master_scores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL UNIQUE,
    score       REAL DEFAULT 0,
    score_detail TEXT DEFAULT '{}',
    rang        INTEGER,
    rang_total  INTEGER,
    computed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  /* Témoignages Deal Master */
  CREATE TABLE IF NOT EXISTS deal_master_temoignages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    edition_id INTEGER,
    contenu    TEXT NOT NULL,
    visible    INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id)    REFERENCES users(id),
    FOREIGN KEY(edition_id) REFERENCES deal_master_editions(id)
  );

  /* ── Ils ont rejoint Diaspo'Actif — Témoignages utilisateurs ── */
  CREATE TABLE IF NOT EXISTS temoignages (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                 INTEGER NOT NULL UNIQUE,
    note                    INTEGER CHECK(note BETWEEN 1 AND 5),
    description             TEXT NOT NULL,
    fonctionnalites         TEXT DEFAULT '[]',
    points_positifs         TEXT,
    suggestions             TEXT,
    type_usage              TEXT DEFAULT 'personnel' CHECK(type_usage IN ('personnel','professionnel','organisation','collectivite')),
    consentement_affichage  INTEGER DEFAULT 0,
    nom_affichage           TEXT,
    pays_utilisateur        TEXT,
    role_utilisateur        TEXT,
    statut                  TEXT DEFAULT 'en_attente' CHECK(statut IN ('en_attente','approuve','rejete','signale')),
    score_pertinence        REAL DEFAULT 0,
    admin_id                INTEGER,
    admin_note              TEXT,
    created_at              TEXT DEFAULT (datetime('now')),
    updated_at              TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id)  REFERENCES users(id),
    FOREIGN KEY(admin_id) REFERENCES users(id)
  );
`);

/* backfillOfficialFollow est appelé depuis seed.js après création du compte officiel */
function backfillOfficialFollow() {
  try {
    const official = db.prepare("SELECT id FROM users WHERE is_official=1 LIMIT 1").get();
    if (!official) return;
    const oid = official.id;
    const users = db.prepare(
      "SELECT id FROM users WHERE id != ? AND id NOT IN (SELECT follower_id FROM user_follows WHERE followed_id=?)"
    ).all(oid, oid);
    const ins = db.prepare("INSERT OR IGNORE INTO user_follows (follower_id, followed_id) VALUES (?,?)");
    users.forEach(u => ins.run(u.id, oid));
  } catch(e) { /* ignoré */ }
}

/* ═══ DEAL MASTER — Seed critères par défaut ═══ */
;(function seedDealMasterCriteres() {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM deal_master_criteres").get().n;
  if (existing > 0) return;
  const ins = db.prepare(`INSERT INTO deal_master_criteres (cle,label,description,poids,actif)
    VALUES (?,?,?,?,1)`);
  [
    ["deals_finalises",     "Deals finalisés",            "Nombre de Deals clôturés avec succès sur la période",       3.0],
    ["taux_reussite",       "Taux de réussite",           "% de Deals actifs clôturés positivement vs abandonnés",     2.5],
    ["progression_deals",   "Progression des Deals",      "Avancement moyen des Deals actifs (jalons, objectifs)",     1.5],
    ["evaluations_recues",  "Évaluations reçues",         "Note moyenne des évaluations reçues des partenaires",       2.0],
    ["qualite_collaboration","Qualité des collaborations", "Nombre de participants acceptés et actifs dans les Deals",  1.5],
    ["respect_engagements", "Respect des engagements",    "Tâches complétées vs assignées, jalons respectés",          2.0],
    ["diversite_partenaires","Diversité des partenaires", "Nombre de partenaires distincts impliqués dans les Deals",  1.0],
  ].forEach(r => ins.run(...r));
})();

/* ═══ DEAL MASTER — Edition courante ═══ */
;(function seedDealMasterEdition() {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM deal_master_editions").get().n;
  if (existing > 0) return;
  const now = new Date();
  const year = now.getFullYear();
  const sem = now.getMonth() < 6 ? 1 : 2;
  const debutMois = sem === 1 ? `${year}-01-01` : `${year}-07-01`;
  const finMois   = sem === 1 ? `${year}-06-30` : `${year}-12-31`;
  db.prepare(`INSERT INTO deal_master_editions (label,periode_debut,periode_fin,statut,top_pct)
    VALUES (?,?,?,'en_cours',10.0)`)
    .run(`Semestre ${sem} – ${year}`, debutMois, finMois);
})();

/* ═══════════════════════════════════════════════════════════════════
   MODULE GESTION DES ASSOCIATIONS
   Art. 30-33 — Accréditation, abonnement, adhérents, cotisations,
                finances, documents, votes électroniques
   ═══════════════════════════════════════════════════════════════════ */
db.exec(`

  /* ── Accréditation association (vérifiée / accréditée) ── */
  CREATE TABLE IF NOT EXISTS asso_accreditations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL UNIQUE,
    niveau        TEXT NOT NULL DEFAULT 'verifiee'
                  CHECK(niveau IN ('verifiee','accreditee')),
    statut        TEXT NOT NULL DEFAULT 'en_attente'
                  CHECK(statut IN ('en_attente','active','suspendue','retiree','expiree')),
    plan_id       INTEGER,
    periodicite   TEXT DEFAULT 'annuel'
                  CHECK(periodicite IN ('mensuel','trimestriel','annuel')),
    date_debut    TEXT,
    date_fin      TEXT,
    admin_id      INTEGER,
    motif         TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id)  REFERENCES users(id),
    FOREIGN KEY(admin_id) REFERENCES users(id)
  );

  /* ── Demandes d'accréditation ── */
  CREATE TABLE IF NOT EXISTS asso_demandes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    niveau        TEXT NOT NULL DEFAULT 'verifiee'
                  CHECK(niveau IN ('verifiee','accreditee')),
    periodicite   TEXT DEFAULT 'annuel',
    nom_asso      TEXT NOT NULL,
    pays          TEXT,
    ville         TEXT,
    siret         TEXT,
    description   TEXT,
    documents_json TEXT DEFAULT '[]',
    statut        TEXT DEFAULT 'en_attente'
                  CHECK(statut IN ('en_attente','approuvee','refusee','info_demandee')),
    motif_refus   TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  /* ── Historique des accréditations ── */
  CREATE TABLE IF NOT EXISTS asso_accred_historique (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    action        TEXT NOT NULL,
    niveau        TEXT,
    admin_id      INTEGER,
    motif         TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  /* ── Adhérents ── */
  CREATE TABLE IF NOT EXISTS asso_adherents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asso_user_id  INTEGER NOT NULL,
    prenom        TEXT NOT NULL,
    nom           TEXT NOT NULL,
    email         TEXT,
    telephone     TEXT,
    adresse       TEXT,
    pays          TEXT,
    date_naissance TEXT,
    nationalite   TEXT,
    statut        TEXT DEFAULT 'actif'
                  CHECK(statut IN ('actif','inactif','suspendu','radie')),
    type_adhesion TEXT DEFAULT 'standard',
    date_adhesion TEXT DEFAULT (date('now')),
    date_expiration TEXT,
    da_user_id    INTEGER,
    notes         TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(asso_user_id) REFERENCES users(id),
    FOREIGN KEY(da_user_id)   REFERENCES users(id)
  );

  /* ── Cotisations ── */
  CREATE TABLE IF NOT EXISTS asso_cotisations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asso_user_id  INTEGER NOT NULL,
    adherent_id   INTEGER,
    intitule      TEXT NOT NULL,
    montant       REAL NOT NULL,
    devise        TEXT DEFAULT 'EUR',
    periodicite   TEXT DEFAULT 'annuel',
    statut        TEXT DEFAULT 'en_attente'
                  CHECK(statut IN ('en_attente','payee','partielle','en_retard','annulee')),
    date_echeance TEXT,
    date_paiement TEXT,
    mode_paiement TEXT,
    reference     TEXT,
    notes         TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(asso_user_id) REFERENCES users(id),
    FOREIGN KEY(adherent_id)  REFERENCES asso_adherents(id)
  );

  /* ── Finances ── */
  CREATE TABLE IF NOT EXISTS asso_finances (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asso_user_id  INTEGER NOT NULL,
    type          TEXT NOT NULL CHECK(type IN ('recette','depense')),
    categorie     TEXT,
    intitule      TEXT NOT NULL,
    montant       REAL NOT NULL,
    devise        TEXT DEFAULT 'EUR',
    date_op       TEXT DEFAULT (date('now')),
    mode_paiement TEXT,
    piece_justif  TEXT,
    notes         TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(asso_user_id) REFERENCES users(id)
  );

  /* ── Documents (GED) ── */
  CREATE TABLE IF NOT EXISTS asso_documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asso_user_id  INTEGER NOT NULL,
    nom           TEXT NOT NULL,
    type          TEXT DEFAULT 'autre',
    url           TEXT,
    taille        INTEGER,
    acces         TEXT DEFAULT 'bureau'
                  CHECK(acces IN ('public','adherents','bureau','admin')),
    created_by    INTEGER,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(asso_user_id) REFERENCES users(id)
  );

  /* ── Votes électroniques ── */
  CREATE TABLE IF NOT EXISTS asso_votes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asso_user_id  INTEGER NOT NULL,
    titre         TEXT NOT NULL,
    description   TEXT,
    type          TEXT DEFAULT 'resolution'
                  CHECK(type IN ('resolution','election','consultation','budget')),
    statut        TEXT DEFAULT 'brouillon'
                  CHECK(statut IN ('brouillon','ouvert','clos','annule')),
    options_json  TEXT DEFAULT '[]',
    resultat_json TEXT DEFAULT '{}',
    anonyme       INTEGER DEFAULT 1,
    date_debut    TEXT,
    date_fin      TEXT,
    quorum        INTEGER DEFAULT 0,
    created_by    INTEGER,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(asso_user_id) REFERENCES users(id)
  );

  /* ── Réponses aux votes ── */
  CREATE TABLE IF NOT EXISTS asso_votes_reponses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    vote_id       INTEGER NOT NULL,
    adherent_id   INTEGER,
    choix         TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(vote_id, adherent_id),
    FOREIGN KEY(vote_id)     REFERENCES asso_votes(id),
    FOREIGN KEY(adherent_id) REFERENCES asso_adherents(id)
  );

  /* ════════════════════════════════════════════════════════════════════
     DAA-Lang — tables des modules complémentaires
     ════════════════════════════════════════════════════════════════════ */

  /* ── INITIATIVE MEMBRES : affiliations avec validation ── */
  CREATE TABLE IF NOT EXISTS initiative_membres (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id   INTEGER NOT NULL,
    user_id         INTEGER NOT NULL,
    fonction        TEXT,
    statut          TEXT NOT NULL DEFAULT 'en_attente' CHECK(statut IN ('en_attente','accepte','refuse')),
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(initiative_id, user_id),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── DSL MEMBERS.ROLES : rattachement compte plateforme ⇄ rôle asso ── */
  CREATE TABLE IF NOT EXISTS asso_membre_roles (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asso_user_id  INTEGER NOT NULL,
    da_user_id    INTEGER NOT NULL,
    role          TEXT NOT NULL DEFAULT 'MEMBER',
    role_custom   TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(asso_user_id, da_user_id),
    FOREIGN KEY(asso_user_id) REFERENCES users(id),
    FOREIGN KEY(da_user_id)   REFERENCES users(id)
  );

  /* ── DSL CONTRIBUTIONS.BANK_INFO ── */
  CREATE TABLE IF NOT EXISTS asso_bank_info (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    asso_user_id      INTEGER NOT NULL UNIQUE,
    holder_name       TEXT NOT NULL,
    bank_name         TEXT,
    iban              TEXT NOT NULL,
    bic               TEXT,
    devise            TEXT DEFAULT 'EUR',
    reference_modele  TEXT DEFAULT 'COTISATION-{ANNEE}-{PRENOM}-{NOM}',
    display_to_members INTEGER DEFAULT 1,
    instructions      TEXT,
    updated_at        TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(asso_user_id) REFERENCES users(id)
  );

  /* ── DSL NOTIFICATIONS : relances automatiques (log + niveaux) ── */
  CREATE TABLE IF NOT EXISTS asso_relances (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asso_user_id  INTEGER NOT NULL,
    cotisation_id INTEGER,
    adherent_id   INTEGER,
    niveau        TEXT NOT NULL DEFAULT 'INFO'
                  CHECK(niveau IN ('INFO','WARNING','URGENT','FINAL_NOTICE')),
    canal         TEXT NOT NULL DEFAULT 'APP'
                  CHECK(canal IN ('APP','EMAIL','PUSH')),
    jours_retard  INTEGER DEFAULT 0,
    message       TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(asso_user_id)  REFERENCES users(id),
    FOREIGN KEY(cotisation_id) REFERENCES asso_cotisations(id)
  );

  /* ── DSL FINANCE.BUDGETS ── */
  CREATE TABLE IF NOT EXISTS asso_budgets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asso_user_id  INTEGER NOT NULL,
    categorie     TEXT NOT NULL,
    montant_prevu REAL NOT NULL DEFAULT 0,
    devise        TEXT DEFAULT 'EUR',
    annee         INTEGER NOT NULL,
    notes         TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(asso_user_id) REFERENCES users(id)
  );

  /* ── DSL SECURITY.AUDIT_LOGS / FINANCE.AUDIT_TRAIL ── */
  CREATE TABLE IF NOT EXISTS asso_audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asso_user_id  INTEGER NOT NULL,
    acteur_id     INTEGER,
    action        TEXT NOT NULL,
    entite        TEXT,
    entite_id     INTEGER,
    details       TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(asso_user_id) REFERENCES users(id)
  );

  /* ── DSL DOCUMENTS : métadonnées OCR / classification / anti-doublon ── */
  CREATE TABLE IF NOT EXISTS asso_doc_meta (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id   INTEGER NOT NULL UNIQUE,
    type_detecte  TEXT,
    ocr_text      TEXT,
    fournisseur   TEXT,
    montant_ttc   REAL,
    montant_ht    REAL,
    tva           REAL,
    date_facture  TEXT,
    num_facture   TEXT,
    hash_doublon  TEXT,
    classement    TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(document_id) REFERENCES asso_documents(id)
  );

  /* ── DSL GENERAL_ASSEMBLY ── */
  CREATE TABLE IF NOT EXISTS asso_assemblees (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asso_user_id  INTEGER NOT NULL,
    titre         TEXT NOT NULL,
    type          TEXT DEFAULT 'ordinaire'
                  CHECK(type IN ('ordinaire','extraordinaire','constitutive')),
    date_prevue   TEXT,
    lieu          TEXT,
    lien_visio    TEXT,
    ordre_du_jour TEXT,
    convocation   TEXT,
    pv            TEXT,
    quorum_requis INTEGER DEFAULT 0,
    presents      INTEGER DEFAULT 0,
    statut        TEXT DEFAULT 'planifiee'
                  CHECK(statut IN ('planifiee','en_cours','close','archivee')),
    features_json TEXT DEFAULT '[]',
    created_by    INTEGER,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(asso_user_id) REFERENCES users(id)
  );

  /* ── DSL SUBSCRIPTION : état d'abonnement de l'accréditation ── */
  CREATE TABLE IF NOT EXISTS asso_subscription (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asso_user_id  INTEGER NOT NULL UNIQUE,
    billing       TEXT DEFAULT 'YEARLY'
                  CHECK(billing IN ('MONTHLY','YEARLY')),
    etat          TEXT DEFAULT 'TRIAL'
                  CHECK(etat IN ('ACTIVE','TRIAL','UNPAID','CANCELLED')),
    date_debut    TEXT DEFAULT (date('now')),
    date_echeance TEXT,
    montant       REAL DEFAULT 0,
    devise        TEXT DEFAULT 'EUR',
    dernier_paiement TEXT,
    updated_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(asso_user_id) REFERENCES users(id)
  );

`);

/* ═══════════════════════════════════════════════════════════════════
   MOTEUR D'ACCRÉDITATIONS DYNAMIQUE
   Remplace le tableau statique ACCREDITATIONS_DA de data.js
   ═══════════════════════════════════════════════════════════════════ */
db.exec(`
  /* Catalogue des accréditations */
  CREATE TABLE IF NOT EXISTS accred_definitions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    type           TEXT NOT NULL UNIQUE,
    label          TEXT NOT NULL,
    emoji          TEXT DEFAULT '',
    description    TEXT,
    droits         TEXT DEFAULT '[]',
    couleur        TEXT DEFAULT '#6366f1',
    couleur_bg     TEXT DEFAULT '#f5f3ff',
    couleur_border TEXT DEFAULT '#6366f1',
    couleur_text   TEXT DEFAULT '#3730a3',
    module         TEXT,
    fonctionnalite TEXT,
    actif          INTEGER DEFAULT 1,
    ordre          INTEGER DEFAULT 0,
    created_by     INTEGER,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
  );

  /* Règles d'accès par type de compte */
  CREATE TABLE IF NOT EXISTS accred_regles (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    accred_id INTEGER NOT NULL,
    role      TEXT NOT NULL CHECK(role IN ('utilisateur','initiative','collectivite')),
    mode      TEXT NOT NULL DEFAULT 'non_concerne'
              CHECK(mode IN ('automatique','sur_demande','non_concerne')),
    UNIQUE(accred_id, role),
    FOREIGN KEY(accred_id) REFERENCES accred_definitions(id) ON DELETE CASCADE
  );

  /* Tarification par type de compte */
  CREATE TABLE IF NOT EXISTS accred_tarifs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    accred_id           INTEGER NOT NULL,
    role                TEXT NOT NULL CHECK(role IN ('utilisateur','initiative','collectivite')),
    type_tarif          TEXT NOT NULL DEFAULT 'gratuit'
                        CHECK(type_tarif IN ('gratuit','paiement_unique','mensuel','annuel')),
    montant             REAL DEFAULT 0,
    devise              TEXT DEFAULT 'EUR',
    renouvellement_auto INTEGER DEFAULT 0,
    periode_grace_jours INTEGER DEFAULT 7,
    validation_admin    INTEGER DEFAULT 1,
    UNIQUE(accred_id, role),
    FOREIGN KEY(accred_id) REFERENCES accred_definitions(id) ON DELETE CASCADE
  );

  /* Accréditations attribuées (nouveau système dynamique) */
  CREATE TABLE IF NOT EXISTS user_accreditations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    accred_id        INTEGER NOT NULL,
    statut           TEXT NOT NULL DEFAULT 'active'
                     CHECK(statut IN ('active','suspendue','retiree','expiree')),
    date_attribution TEXT DEFAULT (datetime('now')),
    date_expiration  TEXT,
    type_tarif       TEXT DEFAULT 'gratuit',
    montant_paye     REAL DEFAULT 0,
    admin_id         INTEGER,
    notes            TEXT,
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, accred_id),
    FOREIGN KEY(user_id)   REFERENCES users(id),
    FOREIGN KEY(accred_id) REFERENCES accred_definitions(id)
  );

  /* Demandes d'accréditation (nouveau système dynamique) */
  CREATE TABLE IF NOT EXISTS accred_demandes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    accred_id   INTEGER NOT NULL,
    message     TEXT,
    statut      TEXT DEFAULT 'en_attente'
                CHECK(statut IN ('en_attente','approuvee','refusee')),
    motif_refus TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, accred_id),
    FOREIGN KEY(user_id)   REFERENCES users(id),
    FOREIGN KEY(accred_id) REFERENCES accred_definitions(id)
  );

  /* Historique du moteur dynamique */
  CREATE TABLE IF NOT EXISTS accred_historique_v2 (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    accred_id  INTEGER,
    action     TEXT NOT NULL,
    admin_id   INTEGER,
    admin_nom  TEXT,
    motif      TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

/* Seed des accréditations existantes dans le nouveau système */
;(function seedAccredDefinitions() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM accred_definitions").get().n;
  if (count > 0) return;

  const insD = db.prepare(`INSERT OR IGNORE INTO accred_definitions
    (type,label,emoji,description,droits,couleur,couleur_bg,couleur_border,couleur_text,module,ordre)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const insR = db.prepare(`INSERT OR IGNORE INTO accred_regles (accred_id,role,mode) VALUES (?,?,?)`);
  const insT = db.prepare(`INSERT OR IGNORE INTO accred_tarifs
    (accred_id,role,type_tarif,montant,devise,validation_admin) VALUES (?,?,?,?,?,?)`);
  const getD = db.prepare("SELECT id FROM accred_definitions WHERE type=?");

  const SEED = [
    {
      type:'mobilisation_active', label:'Mobilisation Active', emoji:'📢',
      description:"Autorisation d'exercer des fonctions de mobilisation au sein de Diaspo'Actif.",
      droits:JSON.stringify(['Participer à des missions rémunérées','Répondre à des appels de mobilisation','Réaliser des enquêtes de terrain','Participer à des campagnes de sensibilisation']),
      couleur:'#f59e0b',bg:'#fffbeb',border:'#f59e0b',text:'#92400e', module:null, ordre:1,
      regles:[{role:'utilisateur',mode:'sur_demande'},{role:'initiative',mode:'sur_demande'}],
      tarifs:[{role:'utilisateur',type:'paiement_unique',montant:19},{role:'initiative',type:'paiement_unique',montant:29}]
    },
    {
      type:'createur_opportunites', label:"Créateur d'Opportunités", emoji:'💼',
      description:"Autorisation de publier des offres et de créer des opportunités professionnelles.",
      droits:JSON.stringify(['Publier des offres (emplois, stages, marchés)','Mettre en relation des acteurs','Participer à des programmes de recrutement']),
      couleur:'#3b82f6',bg:'#eff6ff',border:'#3b82f6',text:'#1e40af', module:null, ordre:2,
      regles:[{role:'initiative',mode:'sur_demande'},{role:'collectivite',mode:'sur_demande'}],
      tarifs:[{role:'initiative',type:'paiement_unique',montant:39},{role:'collectivite',type:'gratuit',montant:0}]
    },
    {
      type:'observatoire_diaspora', label:'Observatoire Diaspora', emoji:'📊',
      description:"Autorisation d'accéder aux données statistiques et outils d'analyse de la plateforme.",
      droits:JSON.stringify(['Accéder aux statistiques autorisées','Consulter les tableaux de bord','Réaliser des consultations publiques','Obtenir des rapports périodiques']),
      couleur:'#059669',bg:'#f0fdf4',border:'#059669',text:'#065f46', module:null, ordre:3,
      regles:[{role:'collectivite',mode:'sur_demande'}],
      tarifs:[{role:'collectivite',type:'gratuit',montant:0}]
    },
    {
      type:'institutionnelle', label:'Institutionnelle', emoji:'🏛️',
      description:"Autorisation d'exercer des fonctions institutionnelles sur la plateforme.",
      droits:JSON.stringify(['Diffuser des communications officielles','Organiser des consultations publiques','Interagir avec un territoire donné','Publier des avis et informations officiels']),
      couleur:'#7c3aed',bg:'#f5f3ff',border:'#7c3aed',text:'#4c1d95', module:null, ordre:4,
      regles:[{role:'collectivite',mode:'sur_demande'}],
      tarifs:[{role:'collectivite',type:'gratuit',montant:0}]
    },
    {
      type:'gestion_associations', label:'Gestion des Associations', emoji:'🏅',
      description:"Accréditation premium pour gérer entièrement votre association : adhérents, cotisations, trésorerie, comptabilité intelligente, assemblées générales et votes électroniques.",
      droits:JSON.stringify(['Gérer les adhérents et cartes de membre (QR Code)','Encaisser les cotisations et relances automatiques','Tenir la trésorerie et la comptabilité (OCR des factures)','Organiser des assemblées générales et des votes électroniques','Consulter les statistiques avancées','Assistant IA : analyses financières, prédictions, rapports']),
      couleur:'#7c3aed',bg:'#f5f3ff',border:'#7c3aed',text:'#4c1d95', module:'asso', ordre:6,
      regles:[{role:'initiative',mode:'sur_demande'}],
      tarifs:[{role:'initiative',type:'annuel',montant:0,validation_admin:1}]
    }
  ];

  for (const d of SEED) {
    insD.run(d.type, d.label, d.emoji, d.description, d.droits,
             d.couleur, d.bg, d.border, d.text, d.module||null, d.ordre);
    const { id } = getD.get(d.type);
    for (const r of d.regles) insR.run(id, r.role, r.mode);
    for (const t of d.tarifs) insT.run(id, t.role, t.type||'gratuit', t.montant||0, 'EUR', t.validation_admin===0?0:1);
  }
})();

/* ===== MODULE DIASPO FORMATION ===== */

/* Extension de la table formations (colonnes optionnelles ajoutées si absentes) */
;['statut TEXT DEFAULT \'brouillon\'','mode_acces TEXT DEFAULT \'gratuit\'','commission_pct REAL DEFAULT 0',
  'telecharge_autorise INTEGER DEFAULT 0','image_url TEXT','duree_heures REAL',
  'prerequis TEXT','objectifs TEXT','video_intro TEXT','categorie TEXT',
  'motif_refus TEXT','validateur_id INTEGER','valide_at TEXT',
  'nb_inscrits INTEGER DEFAULT 0','revenu_total REAL DEFAULT 0'
].forEach(col => {
  try { db.exec(`ALTER TABLE formations ADD COLUMN ${col}`); } catch(_) {}
});

db.exec(`
  CREATE TABLE IF NOT EXISTS formation_inscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    formation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    statut TEXT DEFAULT 'active' CHECK(statut IN ('active','annulee','expiree')),
    code_acces TEXT,
    montant_paye REAL DEFAULT 0,
    acces_gratuit_membre INTEGER DEFAULT 0,
    avancement_pct INTEGER DEFAULT 0,
    date_inscription TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(formation_id, user_id),
    FOREIGN KEY(formation_id) REFERENCES formations(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS formation_avis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    formation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    note INTEGER NOT NULL CHECK(note BETWEEN 1 AND 5),
    commentaire TEXT,
    reponse_createur TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(formation_id, user_id),
    FOREIGN KEY(formation_id) REFERENCES formations(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS formation_codes_acces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    actif INTEGER DEFAULT 1,
    nb_utilisations INTEGER DEFAULT 0,
    limite_utilisations INTEGER,
    date_expiration TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(created_by) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS formation_historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    formation_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    admin_id INTEGER,
    admin_nom TEXT,
    motif TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

/* Ajouter l'accréditation createur_formations si elle n'existe pas encore */
;(function seedCreateurFormations() {
  const exists = db.prepare("SELECT id FROM accred_definitions WHERE type='createur_formations'").get();
  if (exists) return;
  const insD = db.prepare(`INSERT OR IGNORE INTO accred_definitions
    (type,label,emoji,description,droits,couleur,couleur_bg,couleur_border,couleur_text,module,ordre)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const insR = db.prepare(`INSERT OR IGNORE INTO accred_regles (accred_id,role,mode) VALUES (?,?,?)`);
  const insT = db.prepare(`INSERT OR IGNORE INTO accred_tarifs
    (accred_id,role,type_tarif,montant,devise,validation_admin) VALUES (?,?,?,?,?,?)`);
  insD.run('createur_formations','Créateur de formations','🎓',
    "Autorisation de proposer des formations dans l'espace Diaspo Formation. Permet de créer, publier et gérer des formations avec suivi des inscriptions et des revenus.",
    JSON.stringify(['Créer et publier des formations','Suivre les inscriptions et les revenus','Choisir le mode d\'accès (gratuit, payant, payant sauf membres)','Consulter les avis des apprenants','Émettre des attestations de formation']),
    '#f59e0b','#fffbeb','#f59e0b','#92400e','diaspo_formation', 7);
  const { id } = db.prepare("SELECT id FROM accred_definitions WHERE type='createur_formations'").get();
  insR.run(id,'initiative','sur_demande');
  insR.run(id,'collectivite','sur_demande');
  insT.run(id,'initiative','gratuit',0,'EUR',1);
  insT.run(id,'collectivite','gratuit',0,'EUR',1);
})();

/* ===== MOTEUR ACCRÉDITATIONS v2 : audit + champs étendus + packs ===== */

/* Extension de accred_definitions */
;[
  "duree_validite_jours INTEGER",
  "conditions_obtention TEXT",
  "documents_requis TEXT DEFAULT '[]'",
  "renouvellement_auto INTEGER DEFAULT 0",
  "double_validation INTEGER DEFAULT 0",
  "controle_documentaire INTEGER DEFAULT 0",
  "date_application TEXT"
].forEach(col => { try { db.exec(`ALTER TABLE accred_definitions ADD COLUMN ${col}`); } catch(_) {} });

db.exec(`
  /* Journal d'audit des modifications d'accréditations */
  CREATE TABLE IF NOT EXISTS accred_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accred_id INTEGER NOT NULL,
    admin_id INTEGER NOT NULL,
    admin_nom TEXT,
    champ TEXT NOT NULL,
    ancienne_valeur TEXT,
    nouvelle_valeur TEXT,
    motif TEXT,
    mode_application TEXT DEFAULT 'nouvelles_demandes',
    date_application TEXT,
    nb_comptes_impactes INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(accred_id) REFERENCES accred_definitions(id)
  );

  /* Packs d'accréditations */
  CREATE TABLE IF NOT EXISTS accred_packs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '📦',
    couleur TEXT DEFAULT '#6366f1',
    couleur_bg TEXT DEFAULT '#f5f3ff',
    actif INTEGER DEFAULT 1,
    date_debut TEXT,
    date_fin TEXT,
    ordre INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS accred_pack_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id INTEGER NOT NULL,
    accred_id INTEGER NOT NULL,
    UNIQUE(pack_id, accred_id),
    FOREIGN KEY(pack_id) REFERENCES accred_packs(id) ON DELETE CASCADE,
    FOREIGN KEY(accred_id) REFERENCES accred_definitions(id)
  );

  CREATE TABLE IF NOT EXISTS accred_pack_regles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('utilisateur','initiative','collectivite')),
    mode TEXT NOT NULL DEFAULT 'non_concerne'
          CHECK(mode IN ('automatique','sur_demande','non_concerne')),
    UNIQUE(pack_id, role),
    FOREIGN KEY(pack_id) REFERENCES accred_packs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS accred_pack_tarifs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('utilisateur','initiative','collectivite')),
    type_tarif TEXT NOT NULL DEFAULT 'gratuit'
                CHECK(type_tarif IN ('gratuit','paiement_unique','mensuel','annuel')),
    montant REAL DEFAULT 0,
    devise TEXT DEFAULT 'EUR',
    validation_admin INTEGER DEFAULT 1,
    UNIQUE(pack_id, role),
    FOREIGN KEY(pack_id) REFERENCES accred_packs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_packs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    pack_id INTEGER NOT NULL,
    statut TEXT NOT NULL DEFAULT 'active'
             CHECK(statut IN ('active','suspendue','expiree')),
    date_attribution TEXT DEFAULT (datetime('now')),
    date_expiration TEXT,
    admin_id INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, pack_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(pack_id) REFERENCES accred_packs(id)
  );

  CREATE TABLE IF NOT EXISTS accred_pack_demandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    pack_id INTEGER NOT NULL,
    message TEXT,
    statut TEXT DEFAULT 'en_attente'
            CHECK(statut IN ('en_attente','approuvee','refusee')),
    motif_refus TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, pack_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(pack_id) REFERENCES accred_packs(id)
  );
`);

/* ===== FEATURE ENGINE — OS applicatif Diaspo'Actif ===== */

db.exec(`
  /* A. Feature Registry — catalogue de toutes les fonctionnalités */
  CREATE TABLE IF NOT EXISTS features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    description TEXT,
    categorie TEXT DEFAULT 'general'
              CHECK(categorie IN ('communication','formation','evenements','collaboration',
                                  'publication','observatoire','administration','general')),
    statut TEXT DEFAULT 'active' CHECK(statut IN ('active','beta','deprecated','disabled')),
    visibilite_defaut TEXT DEFAULT 'hidden'
                      CHECK(visibilite_defaut IN ('visible','hidden','locked')),
    require_accreditation INTEGER DEFAULT 0,
    accred_type TEXT,           -- slug de l'accréditation requise (si require_accreditation=1)
    require_pack INTEGER DEFAULT 0,
    roles_acces TEXT DEFAULT '[]', -- JSON ["initiative","collectivite"] = accès par défaut sans accred
    emoji TEXT DEFAULT '⚙️',
    couleur TEXT DEFAULT '#6366f1',
    ordre INTEGER DEFAULT 0,
    actif INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  /* B. User Feature State — état de chaque fonction pour chaque utilisateur */
  CREATE TABLE IF NOT EXISTS user_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    feature_id INTEGER NOT NULL,
    statut TEXT NOT NULL DEFAULT 'locked'
             CHECK(statut IN ('active','frozen','locked','pending_accreditation')),
    source TEXT DEFAULT 'manuel'
             CHECK(source IN ('automatique','accreditation','pack','manuel','demande')),
    frozen_at TEXT,
    activated_at TEXT DEFAULT (datetime('now')),
    notes TEXT,
    UNIQUE(user_id, feature_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(feature_id) REFERENCES features(id)
  );

  /* C. Usage Tracker — journal d'utilisation par fonction */
  CREATE TABLE IF NOT EXISTS feature_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    feature_id INTEGER NOT NULL,
    nb_utilisations INTEGER DEFAULT 0,
    derniere_utilisation TEXT,
    premiere_utilisation TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, feature_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(feature_id) REFERENCES features(id)
  );

  /* D. Freeze Suggestions — candidats au gel (inactivité > N jours) */
  CREATE TABLE IF NOT EXISTS freeze_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    feature_id INTEGER NOT NULL,
    inactive_days INTEGER DEFAULT 0,
    niveau TEXT DEFAULT 'low' CHECK(niveau IN ('low','medium','high')),
    dismissed INTEGER DEFAULT 0,
    dismissed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, feature_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(feature_id) REFERENCES features(id)
  );

  /* E. Feature Recommendations */
  CREATE TABLE IF NOT EXISTS feature_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    feature_id INTEGER NOT NULL,
    raison TEXT,
    action TEXT DEFAULT 'unlock' CHECK(action IN ('unlock','activate','upgrade','explore')),
    score REAL DEFAULT 0,
    vu INTEGER DEFAULT 0,
    dismissed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(feature_id) REFERENCES features(id)
  );

  /* F. Notification Logs — 1 message / semaine / fonction max */
  CREATE TABLE IF NOT EXISTS feature_notification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    feature_id INTEGER NOT NULL,
    type TEXT DEFAULT 'freeze_suggestion'
          CHECK(type IN ('freeze_suggestion','recommendation','inactivity','reactivation')),
    message TEXT,
    semaine_iso TEXT, -- ex: "2026-W26" pour dédoublonnage
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(feature_id) REFERENCES features(id)
  );
`);

/* Extension user_accreditations : lier à la feature si accred donne accès à une feature */
try { db.exec("ALTER TABLE user_accreditations ADD COLUMN feature_slug TEXT"); } catch(_) {}

/* Seed initial du Feature Registry */
;(function seedFeatureRegistry() {
  const exists = db.prepare("SELECT id FROM features WHERE slug='messagerie'").get();
  if (exists) return;

  const ins = db.prepare(`INSERT OR IGNORE INTO features
    (slug,nom,description,categorie,visibilite_defaut,require_accreditation,accred_type,
     roles_acces,emoji,couleur,ordre,actif)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`);

  const FEATURES = [
    /* Communication */
    ['messagerie','Messagerie','Envoi et réception de messages privés','communication','visible',0,null,
     '["utilisateur","initiative","collectivite"]','💬','#3b82f6',10],
    ['appels_video','Appels vidéo','Appels vidéo en temps réel','communication','hidden',1,'appels_video',
     '[]','📹','#8b5cf6',11],
    ['agenda_partage','Agenda partagé','Agenda collaboratif et planification','communication','hidden',1,null,
     '["initiative","collectivite"]','📅','#06b6d4',12],
    ['reunions','Réunions en ligne','Organisation et tenue de réunions virtuelles','communication','hidden',1,null,
     '["initiative","collectivite"]','🤝','#10b981',13],
    ['signature_electronique','Signature électronique','Signature de documents en ligne','communication','hidden',1,null,
     '["collectivite"]','✍️','#f59e0b',14],

    /* Formation */
    ['createur_formations','Créateur de formations','Créer et publier des formations Diaspo Formation',
     'formation','hidden',1,'createur_formations','[]','🎓','#f59e0b',20],
    ['catalogue_formations','Catalogue formations','Accéder au catalogue de formations',
     'formation','visible',0,null,'["utilisateur","initiative","collectivite"]','📚','#f59e0b',21],

    /* Événements */
    ['evenements','Événements','Créer et gérer des événements','evenements','visible',0,null,
     '["utilisateur","initiative","collectivite"]','🗓️','#ec4899',30],
    ['billetterie','Billetterie','Vente de billets pour événements payants','evenements','hidden',1,null,
     '["initiative","collectivite"]','🎟️','#ec4899',31],

    /* Collaboration */
    ['collaborations','Collaborations','Appels à contributions et candidatures','collaboration','visible',0,null,
     '["utilisateur","initiative","collectivite"]','🤲','#10b981',40],
    ['offres_emploi','Offres & opportunités','Publier des offres d\'emploi et missions',
     'collaboration','hidden',1,'createur_opportunites','["initiative","collectivite"]','💼','#10b981',41],
    ['sondages','Sondages & consultations','Créer des sondages et mobiliser la communauté',
     'collaboration','hidden',1,'mobilisation_active','[]','📊','#6366f1',42],
    ['gestion_documentaire','Gestion documentaire','Bibliothèque de documents partagée',
     'collaboration','hidden',1,null,'["initiative","collectivite"]','📁','#6366f1',43],

    /* Publication */
    ['fil_actualite','Fil d\'actualité','Publication sur le fil de la communauté',
     'publication','visible',0,null,'["utilisateur","initiative","collectivite"]','📰','#f97316',50],
    ['cv_builder','CV Builder','Création et partage de CV professionnel',
     'publication','hidden',1,null,'["utilisateur"]','📄','#64748b',52],

    /* Observatoire */
    ['observatoire','Observatoire Diaspora','Données statistiques agrégées de la diaspora',
     'observatoire','hidden',1,'observatoire_diaspora','["collectivite"]','🔭','#0284c7',60],
  ];

  for (const f of FEATURES) ins.run(...f);
})();

/* Note : l'initiative virtuelle diaspoactif-platform est créée par seed.js après les users */

/* ===== EXTENSION SYSTÈME DE POSTS (2026-06-29) ===== */

/* Nouvelles colonnes fil_posts */
const postsAlters = [
  "ALTER TABLE fil_posts ADD COLUMN pub_type TEXT",
  "ALTER TABLE fil_posts ADD COLUMN media_url TEXT",
  "ALTER TABLE fil_posts ADD COLUMN media_type TEXT",
  "ALTER TABLE fil_posts ADD COLUMN article_titre TEXT",
  "ALTER TABLE fil_posts ADD COLUMN article_contenu TEXT",
  "ALTER TABLE fil_posts ADD COLUMN video_duree INTEGER",
  "ALTER TABLE fil_posts ADD COLUMN original_post_id INTEGER",
  "ALTER TABLE fil_posts ADD COLUMN repost_commentaire TEXT",
  "ALTER TABLE fil_posts ADD COLUMN visibilite TEXT DEFAULT 'public'",
  "ALTER TABLE fil_posts ADD COLUMN medias TEXT DEFAULT '[]'",
  "ALTER TABLE fil_posts ADD COLUMN hashtags TEXT DEFAULT '[]'",
  "ALTER TABLE fil_posts ADD COLUMN statut TEXT DEFAULT 'publie'",
  "ALTER TABLE fil_posts ADD COLUMN programmed_at TEXT",
  "ALTER TABLE fil_posts ADD COLUMN localisation_pays TEXT",
  "ALTER TABLE fil_posts ADD COLUMN localisation_ville TEXT",
  "ALTER TABLE fil_posts ADD COLUMN vues INTEGER DEFAULT 0",
  "ALTER TABLE fil_posts ADD COLUMN source_import TEXT",
];
for (const sql of postsAlters) { try { db.prepare(sql).run(); } catch(e) { /* colonne déjà existante */ } }

/* Nouvelles tables Posts system */
db.exec(`
  CREATE TABLE IF NOT EXISTS fil_bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, post_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(post_id) REFERENCES fil_posts(id)
  );

  CREATE TABLE IF NOT EXISTS fil_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_nom TEXT,
    user_email TEXT,
    type_contribution TEXT NOT NULL,
    message TEXT,
    statut TEXT DEFAULT 'en_attente',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(post_id) REFERENCES fil_posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS fil_post_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
  );
`);

/* =====================================================================
   INSCRIPTIONS SÉCURISÉES (ID DA + DS-ID)
   ===================================================================== */
db.exec(`
  /* Inscriptions sécurisées aux événements */
  CREATE TABLE IF NOT EXISTS event_inscriptions_securisees (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id         INTEGER NOT NULL,
    user_id          INTEGER,
    da_id_utilise    TEXT,
    nom              TEXT NOT NULL,
    prenom           TEXT,
    type_compte      TEXT,
    organisation     TEXT,
    ds_id_signe      INTEGER DEFAULT 0,
    ds_id_signe_at   TEXT,
    statut           TEXT DEFAULT 'identifie' CHECK(statut IN ('identifie','signe','paiement_attente','confirme','annule','liste_attente')),
    billet_qr        TEXT,
    agenda_event_id  INTEGER,
    ip               TEXT,
    user_agent       TEXT,
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(event_id) REFERENCES events(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  /* Journal d'audit DS-ID — toutes les signatures numériques */
  CREATE TABLE IF NOT EXISTS ds_id_validations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    action_type  TEXT NOT NULL,
    action_ref   TEXT,
    action_id    INTEGER,
    da_id        TEXT,
    succes       INTEGER DEFAULT 1,
    ip           TEXT,
    user_agent   TEXT,
    created_at   TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  /* ── Module Recrutement ── */
  CREATE TABLE IF NOT EXISTS recrutement_campagnes (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    recruteur_id         INTEGER NOT NULL,
    nom                  TEXT NOT NULL,
    description          TEXT,
    type_recrutement     TEXT DEFAULT 'emploi',
    organisme            TEXT,
    pays                 TEXT,
    ville                TEXT,
    adresse              TEXT,
    rayon_publication    TEXT DEFAULT 'national',
    statut               TEXT DEFAULT 'brouillon' CHECK(statut IN ('brouillon','active','expiree','archivee')),
    publie_at            TEXT,
    promotion_fin        TEXT,
    expire_at            TEXT,
    vues_total           INTEGER DEFAULT 0,
    nb_partages          INTEGER DEFAULT 0,
    nb_reactions         INTEGER DEFAULT 0,
    notif_promo_7j       INTEGER DEFAULT 0,
    notif_promo_fin      INTEGER DEFAULT 0,
    notif_expir_7j       INTEGER DEFAULT 0,
    notif_cloture        INTEGER DEFAULT 0,
    image_b64            TEXT,
    created_at           TEXT DEFAULT (datetime('now')),
    updated_at           TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(recruteur_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS recrutement_candidatures (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    campagne_id  INTEGER NOT NULL,
    candidat_id  INTEGER NOT NULL,
    message      TEXT,
    cv_b64       TEXT,
    statut       TEXT DEFAULT 'en_attente' CHECK(statut IN ('en_attente','vue','acceptee','refusee','archivee')),
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(campagne_id) REFERENCES recrutement_campagnes(id),
    FOREIGN KEY(candidat_id) REFERENCES users(id),
    UNIQUE(campagne_id, candidat_id)
  );

  /* ── Interactions recrutement ── */
  CREATE TABLE IF NOT EXISTS recrutement_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campagne_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT DEFAULT 'jaime' CHECK(type IN ('jaime','interesse','bravo','soutien','informatif')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(campagne_id, user_id),
    FOREIGN KEY(campagne_id) REFERENCES recrutement_campagnes(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS recrutement_commentaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campagne_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    contenu TEXT NOT NULL,
    parent_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(campagne_id) REFERENCES recrutement_campagnes(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS recrutement_favoris (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campagne_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(campagne_id, user_id),
    FOREIGN KEY(campagne_id) REFERENCES recrutement_campagnes(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  /* ── Profil Emploi / Espace Candidat ── */
  CREATE TABLE IF NOT EXISTS profil_emploi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    situation TEXT DEFAULT 'en_recherche',
    types_opportunites TEXT DEFAULT '[]',
    secteurs TEXT DEFAULT '[]',
    metier TEXT,
    competences TEXT DEFAULT '[]',
    experience TEXT DEFAULT 'debutant',
    niveau_etudes TEXT,
    langues TEXT DEFAULT '[]',
    mobilite TEXT DEFAULT 'national',
    teletravail TEXT DEFAULT 'non',
    salaire_min REAL,
    salaire_max REAL,
    devise TEXT DEFAULT 'EUR',
    date_disponibilite TEXT,
    cv_pdf TEXT,
    lettre_pdf TEXT,
    portfolio_pdf TEXT,
    disponible_pour_travailler INTEGER DEFAULT 0,
    suspendre_offres INTEGER DEFAULT 0,
    lettre_contenu TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS profil_emploi_experiences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    poste TEXT NOT NULL,
    entreprise TEXT,
    ville TEXT,
    pays TEXT,
    date_debut TEXT,
    date_fin TEXT,
    en_cours INTEGER DEFAULT 0,
    description TEXT,
    realisations TEXT,
    ordre INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS profil_emploi_formations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    diplome TEXT NOT NULL,
    etablissement TEXT,
    ville TEXT,
    pays TEXT,
    date_obtention TEXT,
    description TEXT,
    ordre INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Interactions sondages ── */
  CREATE TABLE IF NOT EXISTS sondage_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sondage_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT DEFAULT 'jaime',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(sondage_id, user_id),
    FOREIGN KEY(sondage_id) REFERENCES sondages(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sondage_commentaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sondage_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    contenu TEXT NOT NULL,
    parent_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(sondage_id) REFERENCES sondages(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sondage_favoris (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sondage_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(sondage_id, user_id),
    FOREIGN KEY(sondage_id) REFERENCES sondages(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

/* =====================================================================
   IDENTIFIANT UNIQUE DIASPO'ACTIF (DA-XXXXXXXX)
   ===================================================================== */
db.exec(`
  CREATE TABLE IF NOT EXISTS da_id_counter (
    id         INTEGER PRIMARY KEY CHECK(id=1),
    last_value INTEGER DEFAULT 0
  );
  INSERT OR IGNORE INTO da_id_counter VALUES (1, 0);
`);

// Ajouter la colonne da_id sur users et initiatives (sans UNIQUE inline — SQLite interdit ça en ALTER)
{
  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('da_id')) {
    db.exec('ALTER TABLE users ADD COLUMN da_id TEXT');
    try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_da_id ON users(da_id) WHERE da_id IS NOT NULL'); } catch(_) {}
  }
  const initCols = db.prepare('PRAGMA table_info(initiatives)').all().map(c => c.name);
  if (!initCols.includes('da_id')) {
    db.exec('ALTER TABLE initiatives ADD COLUMN da_id TEXT');
    try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_initiatives_da_id ON initiatives(da_id) WHERE da_id IS NOT NULL'); } catch(_) {}
  }
}

// Génère un DA-ID atomique
function generateDaId() {
  db.prepare('UPDATE da_id_counter SET last_value = last_value + 1 WHERE id = 1').run();
  const { last_value } = db.prepare('SELECT last_value FROM da_id_counter WHERE id=1').get();
  return 'DA-' + String(last_value).padStart(8, '0');
}

// Migration : attribuer un DA-ID aux comptes existants qui n'en ont pas
;(function backfillDaIds() {
  const usersWithout = db.prepare('SELECT id FROM users WHERE da_id IS NULL ORDER BY id').all();
  const initsWithout = db.prepare('SELECT id FROM initiatives WHERE da_id IS NULL ORDER BY id').all();
  const setUser = db.prepare('UPDATE users SET da_id=? WHERE id=?');
  const setInit = db.prepare('UPDATE initiatives SET da_id=? WHERE id=?');
  for (const u of usersWithout) {
    try { setUser.run(generateDaId(), u.id); } catch (_) {}
  }
  for (const i of initsWithout) {
    try { setInit.run(generateDaId(), i.id); } catch (_) {}
  }
})();

/* =====================================================================
   CODE DE SÉCURITÉ DIASPO'ACTIF (DS-ID)
   Format : DAS-XXXX-XXXX-XXXX (alphanumérique uppercase sans ambiguïtés)
   Stocké en clair (seul le propriétaire peut le révéler après auth)
   Jamais transmis via API publique
   ===================================================================== */
db.exec(`
  CREATE TABLE IF NOT EXISTS ds_id_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    action     TEXT NOT NULL CHECK(action IN ('creation','consultation','copie','regeneration','signature','echec_validation')),
    ip         TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

{
  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('ds_id')) {
    db.exec('ALTER TABLE users ADD COLUMN ds_id TEXT');
  }
}

function generateDsId() {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0OI1 pour lisibilité
  const seg = () => Array.from({length:4}, () => CHARS[Math.floor(Math.random()*CHARS.length)]).join('');
  return `DAS-${seg()}-${seg()}-${seg()}`;
}

// Backfill DS-ID pour les comptes existants sans DS-ID
;(function backfillDsIds() {
  const without = db.prepare('SELECT id FROM users WHERE ds_id IS NULL ORDER BY id').all();
  const set = db.prepare('UPDATE users SET ds_id=? WHERE id=?');
  for (const u of without) {
    try { set.run(generateDsId(), u.id); } catch(_) {}
  }
})();

/* =====================================================================
   MODULE OBSERVATIONS — Tables de suivi
   ===================================================================== */
db.exec(`
  CREATE TABLE IF NOT EXISTS profil_visites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profil_user_id INTEGER NOT NULL,
    visiteur_id INTEGER,
    visiteur_pays TEXT,
    visiteur_ville TEXT,
    visiteur_role TEXT,
    visiteur_secteur TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(profil_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(visiteur_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    cible_type TEXT,
    cible_id INTEGER,
    detail TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(admin_id) REFERENCES users(id)
  );
`);

/* =====================================================================
   NOUVEAUX MODULES v2 — Messagerie enrichie, Profil, Formations, OZ
   ===================================================================== */
db.exec(`
  /* ── Réactions aux messages ── */
  CREATE TABLE IF NOT EXISTS message_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    emoji TEXT NOT NULL DEFAULT '👍',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(message_id, user_id, emoji),
    FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Messages favoris ── */
  CREATE TABLE IF NOT EXISTS message_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(message_id, user_id),
    FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Messages épinglés ── */
  CREATE TABLE IF NOT EXISTS message_epingles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    epingle_par INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(conversation_id, message_id),
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
  );

  /* ── Membres groupes ── */
  CREATE TABLE IF NOT EXISTS conversation_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'membre' CHECK(role IN ('admin','membre')),
    joined_at TEXT DEFAULT (datetime('now')),
    left_at TEXT,
    UNIQUE(conversation_id, user_id),
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Portfolio utilisateur ── */
  CREATE TABLE IF NOT EXISTS user_portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    description TEXT,
    images_json TEXT DEFAULT '[]',
    fichiers_json TEXT DEFAULT '[]',
    annee INTEGER,
    lien TEXT,
    partenaires TEXT,
    resultats TEXT,
    type TEXT DEFAULT 'projet' CHECK(type IN ('projet','publication','realisation','autre')),
    ordre INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Langues utilisateur ── */
  CREATE TABLE IF NOT EXISTS user_langues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    langue TEXT NOT NULL,
    niveau TEXT DEFAULT 'intermediaire' CHECK(niveau IN ('debutant','intermediaire','avance','bilingue','maternelle')),
    is_maternelle INTEGER DEFAULT 0,
    certification TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, langue),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Recommandations entre utilisateurs ── */
  CREATE TABLE IF NOT EXISTS user_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    texte TEXT NOT NULL,
    relation TEXT,
    note INTEGER DEFAULT 5 CHECK(note BETWEEN 1 AND 5),
    statut TEXT DEFAULT 'en_attente' CHECK(statut IN ('en_attente','approuve','masque','refuse')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(from_user_id, to_user_id),
    FOREIGN KEY(from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(to_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Suivi formations utilisateur ── */
  CREATE TABLE IF NOT EXISTS user_formations_suivi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    formation_id INTEGER,
    titre TEXT NOT NULL,
    organisme TEXT,
    statut TEXT DEFAULT 'en_cours' CHECK(statut IN ('en_cours','termine','abandonne','certifie')),
    progression INTEGER DEFAULT 0 CHECK(progression BETWEEN 0 AND 100),
    date_debut TEXT DEFAULT (date('now')),
    date_fin TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(formation_id) REFERENCES formations(id) ON DELETE SET NULL
  );

  /* ── Certifications numériques utilisateur ── */
  CREATE TABLE IF NOT EXISTS user_certifications_obtenues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    organisme TEXT,
    formation_id INTEGER,
    date_obtention TEXT DEFAULT (date('now')),
    date_expiration TEXT,
    code_verification TEXT UNIQUE,
    qr_data TEXT,
    partage_public INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(formation_id) REFERENCES formations(id) ON DELETE SET NULL
  );

  /* ── Conversations OZ (historique chat IA) ── */
  CREATE TABLE IF NOT EXISTS oz_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    messages_json TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

/* ── Migrations douces v2 ── */
{
  const msgCols = db.prepare('PRAGMA table_info(messages)').all().map(c=>c.name);
  if (!msgCols.includes('parent_message_id')) db.exec('ALTER TABLE messages ADD COLUMN parent_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL');
  if (!msgCols.includes('est_epingle')) db.exec('ALTER TABLE messages ADD COLUMN est_epingle INTEGER DEFAULT 0');

  const convCols = db.prepare('PRAGMA table_info(conversations)').all().map(c=>c.name);
  if (!convCols.includes('type')) db.exec("ALTER TABLE conversations ADD COLUMN type TEXT DEFAULT 'prive' CHECK(type IN ('prive','groupe'))");
  if (!convCols.includes('nom')) db.exec('ALTER TABLE conversations ADD COLUMN nom TEXT');
  if (!convCols.includes('avatar')) db.exec('ALTER TABLE conversations ADD COLUMN avatar TEXT');
  if (!convCols.includes('created_by')) db.exec('ALTER TABLE conversations ADD COLUMN created_by INTEGER REFERENCES users(id)');

  const userCols2 = db.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
  if (!userCols2.includes('reseaux_sociaux')) db.exec("ALTER TABLE users ADD COLUMN reseaux_sociaux TEXT DEFAULT '{}'");
  if (!userCols2.includes('disponibilites')) db.exec("ALTER TABLE users ADD COLUMN disponibilites TEXT DEFAULT '{}'");
  if (!userCols2.includes('reset_token')) db.exec("ALTER TABLE users ADD COLUMN reset_token TEXT");
  if (!userCols2.includes('reset_expires')) db.exec("ALTER TABLE users ADD COLUMN reset_expires INTEGER");
  if (!userCols2.includes('email_verifie')) db.exec("ALTER TABLE users ADD COLUMN email_verifie INTEGER DEFAULT 0");
  if (!userCols2.includes('email_verif_token')) db.exec("ALTER TABLE users ADD COLUMN email_verif_token TEXT");
  if (!userCols2.includes('email_verif_expires')) db.exec("ALTER TABLE users ADD COLUMN email_verif_expires INTEGER");
  // Comptes démo (adresses fictives) : considérés comme déjà vérifiés
  try { db.exec("UPDATE users SET email_verifie=1 WHERE email LIKE '%@diaspoactif.demo' OR email LIKE '%@demo.fr' OR email LIKE '%@admin.fr'"); } catch(_) {}

  // ── Vitrine commerciale (comptes Initiative) ──
  const initCols2 = db.prepare('PRAGMA table_info(initiatives)').all().map(c=>c.name);
  if (!initCols2.includes('vitrine_active')) db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_active INTEGER DEFAULT 0");
  if (!initCols2.includes('vitrine_banniere_url')) db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_banniere_url TEXT");
  if (!initCols2.includes('vitrine_horaires')) db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_horaires TEXT");
  if (!initCols2.includes('vitrine_services')) db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_services TEXT");

  // ── Vitrine v2 : statuts d'indisponibilité + messagerie contextuelle ──
  const prodCols = db.prepare('PRAGMA table_info(produits_vitrine)').all().map(c=>c.name);
  if (prodCols.length) {
    if (!prodCols.includes('statut')) db.exec("ALTER TABLE produits_vitrine ADD COLUMN statut TEXT DEFAULT 'disponible'");
    if (!prodCols.includes('date_retour')) db.exec("ALTER TABLE produits_vitrine ADD COLUMN date_retour TEXT");
    if (!prodCols.includes('reference')) db.exec("ALTER TABLE produits_vitrine ADD COLUMN reference TEXT");
  }
  const msgCols3 = db.prepare('PRAGMA table_info(messages)').all().map(c=>c.name);
  if (!msgCols3.includes('produit_id')) db.exec("ALTER TABLE messages ADD COLUMN produit_id INTEGER");
  if (!msgCols3.includes('edited')) db.exec("ALTER TABLE messages ADD COLUMN edited INTEGER DEFAULT 0");
  if (!msgCols3.includes('edited_at')) db.exec("ALTER TABLE messages ADD COLUMN edited_at TEXT");
  if (!msgCols3.includes('deleted')) db.exec("ALTER TABLE messages ADD COLUMN deleted INTEGER DEFAULT 0");
  if (!msgCols3.includes('deleted_at')) db.exec("ALTER TABLE messages ADD COLUMN deleted_at TEXT");
  const convCols3 = db.prepare('PRAGMA table_info(conversations)').all().map(c=>c.name);
  if (!convCols3.includes('contexte')) db.exec("ALTER TABLE conversations ADD COLUMN contexte TEXT");

  // ── Vitrine v3 : publications promotionnelles ──
  const initCols3 = db.prepare('PRAGMA table_info(initiatives)').all().map(c=>c.name);
  if (!initCols3.includes('vitrine_pub_onglet')) db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_pub_onglet TEXT DEFAULT 'À la une'");
  const cmdCols = db.prepare('PRAGMA table_info(commandes_vitrine)').all().map(c=>c.name);
  if (cmdCols.length && !cmdCols.includes('publication_id')) db.exec("ALTER TABLE commandes_vitrine ADD COLUMN publication_id INTEGER");
  const pubCols = db.prepare('PRAGMA table_info(vitrine_publications)').all().map(c=>c.name);
  if (pubCols.length && !pubCols.includes('media_bg')) db.exec("ALTER TABLE vitrine_publications ADD COLUMN media_bg TEXT");

  // ── Refonte visuelle profil/vitrine : thème couleur de la boutique ──
  const initCols4 = db.prepare('PRAGMA table_info(initiatives)').all().map(c=>c.name);
  if (!initCols4.includes('vitrine_theme')) db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_theme TEXT DEFAULT 'bordeaux'");
  if (!initCols4.includes('reseau_visibilite')) db.exec("ALTER TABLE initiatives ADD COLUMN reseau_visibilite TEXT DEFAULT 'prive'");

  // ── Rubriques Vitrine complémentaires : téléchargements, partenaires, objectif, offre flash ──
  const initCols5 = db.prepare('PRAGMA table_info(initiatives)').all().map(c=>c.name);
  if (!initCols5.includes('vitrine_documents_json'))    db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_documents_json TEXT");
  if (!initCols5.includes('vitrine_partenaires_json'))  db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_partenaires_json TEXT");
  if (!initCols5.includes('vitrine_objectif_cible'))    db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_objectif_cible INTEGER");
  if (!initCols5.includes('vitrine_objectif_libelle'))  db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_objectif_libelle TEXT");
  if (!initCols5.includes('vitrine_offre_flash_titre')) db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_offre_flash_titre TEXT");
  if (!initCols5.includes('vitrine_offre_flash_fin'))   db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_offre_flash_fin TEXT");
  if (!initCols5.includes('vitrine_pourquoi_choisir'))  db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_pourquoi_choisir TEXT");

  // ── Promotions produit (prix barré) ──
  const prodCols2 = db.prepare('PRAGMA table_info(produits_vitrine)').all().map(c=>c.name);
  if (prodCols2.length && !prodCols2.includes('prix_promo')) db.exec("ALTER TABLE produits_vitrine ADD COLUMN prix_promo REAL");

  // ── Vitrine "fiche professionnelle complète" : avis étendus, coordonnées, services par catégories, RDV ──
  const avisCols = db.prepare('PRAGMA table_info(vitrine_avis)').all().map(c=>c.name);
  if (avisCols.length) {
    if (!avisCols.includes('titre'))          db.exec("ALTER TABLE vitrine_avis ADD COLUMN titre TEXT");
    if (!avisCols.includes('reponse_texte'))  db.exec("ALTER TABLE vitrine_avis ADD COLUMN reponse_texte TEXT");
    if (!avisCols.includes('reponse_date'))   db.exec("ALTER TABLE vitrine_avis ADD COLUMN reponse_date TEXT");
  }
  const initCols6 = db.prepare('PRAGMA table_info(initiatives)').all().map(c=>c.name);
  if (!initCols6.includes('vitrine_services_categories_json')) db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_services_categories_json TEXT");
  if (!initCols6.includes('vitrine_ville'))            db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_ville TEXT");
  if (!initCols6.includes('vitrine_region'))           db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_region TEXT");
  if (!initCols6.includes('vitrine_pays'))             db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_pays TEXT");
  if (!initCols6.includes('vitrine_whatsapp'))         db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_whatsapp TEXT");
  if (!initCols6.includes('vitrine_tel_pro'))          db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_tel_pro TEXT");
  if (!initCols6.includes('vitrine_email_pro'))        db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_email_pro TEXT");
  if (!initCols6.includes('vitrine_google_maps_url'))  db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_google_maps_url TEXT");
  if (!initCols6.includes('vitrine_rdv_active'))       db.exec("ALTER TABLE initiatives ADD COLUMN vitrine_rdv_active INTEGER DEFAULT 0");

  // ── Profil public enrichi (colonnes gauche/droite d'initiative.html) ──
  if (!initCols6.includes('publics_json'))      db.exec("ALTER TABLE initiatives ADD COLUMN publics_json TEXT");
  if (!initCols6.includes('besoins_json'))      db.exec("ALTER TABLE initiatives ADD COLUMN besoins_json TEXT");
  if (!initCols6.includes('realisations_json')) db.exec("ALTER TABLE initiatives ADD COLUMN realisations_json TEXT");
  if (!initCols6.includes('stats_perso_json'))  db.exec("ALTER TABLE initiatives ADD COLUMN stats_perso_json TEXT");
  if (!initCols6.includes('annee_creation'))    db.exec("ALTER TABLE initiatives ADD COLUMN annee_creation INTEGER");
  if (!initCols6.includes('assistant_actif'))   db.exec("ALTER TABLE initiatives ADD COLUMN assistant_actif INTEGER DEFAULT 1");

  // ── Module "Liste des partenaires" — table dédiée (remplace vitrine_partenaires_json, jamais réellement exploité) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS initiative_partenaires (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_id     INTEGER NOT NULL,
      type              TEXT DEFAULT 'externe' CHECK(type IN ('compte','externe')),
      linked_user_id    INTEGER,
      nom               TEXT NOT NULL,
      logo_url          TEXT,
      description       TEXT,
      type_partenaire   TEXT,
      site_web          TEXT,
      email             TEXT,
      telephone         TEXT,
      pays              TEXT,
      afficher_contact  INTEGER DEFAULT 0,
      mis_en_avant      INTEGER DEFAULT 0,
      actif             INTEGER DEFAULT 1,
      ordre             INTEGER DEFAULT 0,
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE,
      FOREIGN KEY(linked_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  /* ── Module Cotisations & Adhésions (indépendant du système asso_* premium existant,
     ouvert à toute Initiative — même logique d'ouverture que la Boutique) ── */
  db.exec(`
    CREATE TABLE IF NOT EXISTS adhesion_formules (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_id       INTEGER NOT NULL,
      nom                 TEXT NOT NULL,
      description         TEXT,
      couleur             TEXT DEFAULT '#f97316',
      icone               TEXT DEFAULT '🎫',
      type_contribution    TEXT NOT NULL DEFAULT 'cotisation_annuelle'
                          CHECK(type_contribution IN ('don_libre','don_ponctuel','cotisation_mensuelle',
                            'cotisation_trimestrielle','cotisation_semestrielle','cotisation_annuelle',
                            'adhesion_unique','participation_projet','contribution_exceptionnelle','autre')),
      montant_type        TEXT NOT NULL DEFAULT 'fixe' CHECK(montant_type IN ('fixe','libre','minimum')),
      montant_fixe        REAL,
      montant_min         REAL,
      montant_max         REAL,
      devise              TEXT DEFAULT 'EUR',
      modes_paiement_json TEXT DEFAULT '["carte"]',
      actif               INTEGER DEFAULT 1,
      ordre               INTEGER DEFAULT 0,
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS adhesion_membres (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      formule_id          INTEGER NOT NULL,
      initiative_id       INTEGER NOT NULL,
      linked_user_id      INTEGER,
      nom                 TEXT NOT NULL,
      prenom              TEXT,
      email               TEXT,
      telephone           TEXT,
      photo_url           TEXT,
      statut              TEXT NOT NULL DEFAULT 'en_attente'
                          CHECK(statut IN ('en_attente','a_jour','non_a_jour','suspendu')),
      date_adhesion       TEXT,
      date_expiration     TEXT,
      montant_paye        REAL,
      mode_paiement       TEXT,
      numero_recu         TEXT,
      stripe_customer_id  TEXT,
      stripe_subscription_id TEXT,
      badges_json         TEXT DEFAULT '[]',
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(formule_id) REFERENCES adhesion_formules(id) ON DELETE CASCADE,
      FOREIGN KEY(initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE,
      FOREIGN KEY(linked_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS adhesion_paiements (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      membre_id           INTEGER NOT NULL,
      formule_id          INTEGER,
      initiative_id       INTEGER,
      montant             REAL NOT NULL,
      devise              TEXT DEFAULT 'EUR',
      mode_paiement       TEXT,
      statut              TEXT NOT NULL DEFAULT 'en_attente'
                          CHECK(statut IN ('en_attente','paye','echoue','rembourse')),
      stripe_session_id   TEXT,
      stripe_subscription_id TEXT,
      numero_recu         TEXT,
      date_paiement       TEXT,
      created_at          TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(membre_id) REFERENCES adhesion_membres(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS adhesion_relances (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      membre_id           INTEGER NOT NULL,
      niveau              TEXT NOT NULL CHECK(niveau IN ('avant_30j','avant_7j','jour_j','apres_expiration')),
      canal               TEXT NOT NULL DEFAULT 'app' CHECK(canal IN ('app','email')),
      message             TEXT,
      created_at          TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(membre_id) REFERENCES adhesion_membres(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS adhesion_campagnes (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_id       INTEGER NOT NULL,
      nom                 TEXT NOT NULL,
      objectif_membres    INTEGER DEFAULT 0,
      date_debut          TEXT,
      date_fin            TEXT,
      statut              TEXT NOT NULL DEFAULT 'active' CHECK(statut IN ('active','terminee','archivee')),
      created_at          TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE
    );
  `);

  /* ── Module Votes sécurisés (indépendant du système asso_votes premium existant,
     ouvert à toute Initiative — même logique d'ouverture que Cotisations & Adhésions).
     Anonymisation par séparation structurelle : vote_bulletins n'a AUCUNE colonne
     d'identité ni FK vers vote_electeurs — garantie technique, pas juste applicative. ── */
  db.exec(`
    CREATE TABLE IF NOT EXISTS vote_scrutins (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_id     INTEGER NOT NULL,
      nom               TEXT NOT NULL,
      type_scrutin      TEXT NOT NULL DEFAULT 'ag_ordinaire'
                        CHECK(type_scrutin IN ('ag_ordinaire','ag_extraordinaire','consultation','election')),
      description       TEXT,
      responsable_id    INTEGER,
      date_ouverture    TEXT,
      date_fermeture    TEXT,
      fermeture_mode    TEXT DEFAULT 'auto' CHECK(fermeture_mode IN ('auto','manuelle')),
      vote_secret       INTEGER DEFAULT 1,
      vote_nominatif    INTEGER DEFAULT 0,
      resultats_direct  INTEGER DEFAULT 0,
      pv_auto           INTEGER DEFAULT 1,
      statut            TEXT NOT NULL DEFAULT 'brouillon' CHECK(statut IN ('brouillon','ouvert','clos','annule')),
      quorum_requis     INTEGER DEFAULT 0,
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE,
      FOREIGN KEY(responsable_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS vote_resolutions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      scrutin_id        INTEGER NOT NULL,
      ordre             INTEGER DEFAULT 0,
      titre             TEXT NOT NULL,
      description       TEXT,
      type_reponse      TEXT NOT NULL DEFAULT 'oui_non_abstention'
                        CHECK(type_reponse IN ('oui_non_abstention','choix_multiple','classement','election_personnes')),
      options_json      TEXT DEFAULT '[]',
      created_at        TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(scrutin_id) REFERENCES vote_scrutins(id) ON DELETE CASCADE
    );

    /* Base identité : qui a le droit de vote + a-t-il voté — JAMAIS le choix */
    CREATE TABLE IF NOT EXISTS vote_electeurs (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      scrutin_id        INTEGER NOT NULL,
      user_id           INTEGER NOT NULL,
      source            TEXT NOT NULL DEFAULT 'liste_perso'
                        CHECK(source IN ('tous_actifs','abonnes','adhesion','cotisation','liste_perso','reseau_pro')),
      code_acces        TEXT NOT NULL,
      a_vote            INTEGER DEFAULT 0,
      notif_envoyee_at  TEXT,
      notif_ouverte_at  TEXT,
      vote_le           TEXT,
      created_at        TEXT DEFAULT (datetime('now')),
      UNIQUE(scrutin_id, user_id),
      FOREIGN KEY(scrutin_id) REFERENCES vote_scrutins(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    /* Base bulletin : ANONYME — aucune colonne d'identité, aucune FK vers vote_electeurs */
    CREATE TABLE IF NOT EXISTS vote_bulletins (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      scrutin_id        INTEGER NOT NULL,
      resolution_id     INTEGER NOT NULL,
      choix             TEXT NOT NULL,
      created_at        TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vote_tentatives (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      scrutin_id        INTEGER,
      ip                TEXT,
      raison            TEXT CHECK(raison IN ('code_invalide','deja_vote','non_autorise')),
      created_at        TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vote_documents (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      scrutin_id        INTEGER NOT NULL,
      type              TEXT NOT NULL CHECK(type IN ('pv','resultats','resolutions_adoptees','certificat')),
      contenu_html      TEXT,
      hash_integrite    TEXT,
      created_at        TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(scrutin_id) REFERENCES vote_scrutins(id) ON DELETE CASCADE
    );
  `);

  // ── Archivage des scrutins (préserve électeurs/bulletins/documents, masque juste de la liste active) ──
  const voteScrutinsCols = db.prepare('PRAGMA table_info(vote_scrutins)').all().map(c=>c.name);
  if (voteScrutinsCols.length && !voteScrutinsCols.includes('archived')) {
    db.exec("ALTER TABLE vote_scrutins ADD COLUMN archived INTEGER DEFAULT 0");
  }

  // ── Masquage de compte (remplace la suppression : profil public caché, données conservées) ──
  const userCols3 = db.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
  if (!userCols3.includes('compte_masque')) db.exec("ALTER TABLE users ADD COLUMN compte_masque INTEGER DEFAULT 0");

  // ── Profil public enrichi (colonnes gauche/droite du profil personnel — miroir des initiatives) ──
  if (!userCols3.includes('publics_json'))      db.exec("ALTER TABLE users ADD COLUMN publics_json TEXT");
  if (!userCols3.includes('besoins_json'))      db.exec("ALTER TABLE users ADD COLUMN besoins_json TEXT");
  if (!userCols3.includes('realisations_json')) db.exec("ALTER TABLE users ADD COLUMN realisations_json TEXT");
  if (!userCols3.includes('stats_perso_json'))  db.exec("ALTER TABLE users ADD COLUMN stats_perso_json TEXT");
  if (!userCols3.includes('services_perso'))    db.exec("ALTER TABLE users ADD COLUMN services_perso TEXT");
  if (!userCols3.includes('zones_json'))        db.exec("ALTER TABLE users ADD COLUMN zones_json TEXT");
  if (!userCols3.includes('reseaux_json'))      db.exec("ALTER TABLE users ADD COLUMN reseaux_json TEXT");
  if (!userCols3.includes('annee_debut'))       db.exec("ALTER TABLE users ADD COLUMN annee_debut INTEGER");
  if (!userCols3.includes('assistant_actif'))   db.exec("ALTER TABLE users ADD COLUMN assistant_actif INTEGER DEFAULT 1");

  // ── Registre unique des collectivités : identité territoriale ──
  if (!userCols3.includes('identifiant_territorial')) db.exec("ALTER TABLE users ADD COLUMN identifiant_territorial TEXT");
  db.exec(`CREATE TABLE IF NOT EXISTS collectivite_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collectivite_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(collectivite_id) REFERENCES users(id)
  )`);

  // ── Catalogues (regroupement des articles de la Vitrine) ──
  const prodCols3 = db.prepare('PRAGMA table_info(produits_vitrine)').all().map(c=>c.name);
  if (prodCols3.length && !prodCols3.includes('catalogue_id')) db.exec("ALTER TABLE produits_vitrine ADD COLUMN catalogue_id INTEGER");

  // ── Paiement réel Boutique (Stripe Checkout, même modèle que la Billetterie) ──
  // Colonne séparée `paiement_statut` (sans CHECK) plutôt que d'élargir le CHECK de `statut`,
  // pour ne jamais avoir à recréer la table (SQLite ne supporte pas ALTER d'un CHECK existant).
  const cmdCols2 = db.prepare('PRAGMA table_info(commandes_vitrine)').all().map(c=>c.name);
  if (cmdCols2.length) {
    if (!cmdCols2.includes('paiement_statut'))  db.exec("ALTER TABLE commandes_vitrine ADD COLUMN paiement_statut TEXT DEFAULT 'aucun'");
    if (!cmdCols2.includes('montant_total'))    db.exec("ALTER TABLE commandes_vitrine ADD COLUMN montant_total REAL");
    if (!cmdCols2.includes('stripe_session_id')) db.exec("ALTER TABLE commandes_vitrine ADD COLUMN stripe_session_id TEXT");
  }
  const wtCols = db.prepare('PRAGMA table_info(wallet_transactions)').all().map(c=>c.name);
  if (wtCols.length && !wtCols.includes('commande_vitrine_id')) db.exec("ALTER TABLE wallet_transactions ADD COLUMN commande_vitrine_id INTEGER");
  if (wtCols.length && !wtCols.includes('adhesion_paiement_id')) db.exec("ALTER TABLE wallet_transactions ADD COLUMN adhesion_paiement_id INTEGER");

  // ── Média de présentation (photo ou courte vidéo ≤60s) pour une formule d'adhésion ──
  const adhFCols = db.prepare('PRAGMA table_info(adhesion_formules)').all().map(c=>c.name);
  if (adhFCols.length) {
    if (!adhFCols.includes('media_type'))            db.exec("ALTER TABLE adhesion_formules ADD COLUMN media_type TEXT");
    if (!adhFCols.includes('media_url'))             db.exec("ALTER TABLE adhesion_formules ADD COLUMN media_url TEXT");
    if (!adhFCols.includes('media_duree_secondes'))  db.exec("ALTER TABLE adhesion_formules ADD COLUMN media_duree_secondes INTEGER");
    /* Liste de stockage des participants (module Réseau professionnel) : à chaque adhésion/cotisation
       validée, le participant est automatiquement ajouté à cette liste (registre officiel réutilisable). */
    if (!adhFCols.includes('liste_stockage_id'))     db.exec("ALTER TABLE adhesion_formules ADD COLUMN liste_stockage_id INTEGER REFERENCES listes_diffusion(id) ON DELETE SET NULL");
  }
}

/* ── Boutique de la Vitrine (produits/services, max 20 par initiative) ── */
db.exec(`
  CREATE TABLE IF NOT EXISTS produits_vitrine (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL,
    nom TEXT NOT NULL,
    description TEXT,
    prix REAL,
    devise TEXT DEFAULT 'EUR',
    disponible INTEGER DEFAULT 1,
    statut TEXT DEFAULT 'disponible',
    date_retour TEXT,
    reference TEXT,
    categorie TEXT,
    photos_json TEXT DEFAULT '[]',
    ordre INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id)
  );

  CREATE TABLE IF NOT EXISTS catalogues_vitrine (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL,
    nom TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    categorie TEXT,
    statut TEXT DEFAULT 'visible' CHECK(statut IN ('visible','masque')),
    ordre INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id)
  );

  CREATE TABLE IF NOT EXISTS produit_alertes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produit_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    notifie INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(produit_id, user_id),
    FOREIGN KEY(produit_id) REFERENCES produits_vitrine(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS commandes_vitrine (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produit_id INTEGER NOT NULL,
    initiative_id INTEGER NOT NULL,
    acheteur_id INTEGER NOT NULL,
    publication_id INTEGER,
    message TEXT,
    quantite INTEGER DEFAULT 1,
    statut TEXT DEFAULT 'en_attente' CHECK(statut IN ('en_attente','traitee','annulee')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(produit_id) REFERENCES produits_vitrine(id),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id),
    FOREIGN KEY(acheteur_id) REFERENCES users(id)
  );

  -- Avis clients sur une vitrine (un avis par utilisateur et par initiative)
  CREATE TABLE IF NOT EXISTS vitrine_avis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    note INTEGER NOT NULL CHECK(note BETWEEN 1 AND 5),
    commentaire TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(initiative_id, user_id),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- Signalement d'un avis client (motif + notification à l'admin, comme pour les publications)
  CREATE TABLE IF NOT EXISTS vitrine_avis_signalements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    avis_id INTEGER NOT NULL,
    reporter_id INTEGER NOT NULL,
    motif TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(avis_id) REFERENCES vitrine_avis(id),
    FOREIGN KEY(reporter_id) REFERENCES users(id)
  );

  -- Arguments "Pourquoi nous choisir" (icône + titre + description, réordonnables)
  CREATE TABLE IF NOT EXISTS vitrine_arguments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL,
    icone TEXT DEFAULT '✔️',
    titre TEXT NOT NULL,
    description TEXT,
    ordre INTEGER DEFAULT 0,
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id)
  );

  -- Promotions du mois (jusqu'à 3 actives simultanément, expiration automatique par date)
  CREATE TABLE IF NOT EXISTS vitrine_promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL,
    produit_id INTEGER,
    titre TEXT NOT NULL,
    description TEXT,
    photo_url TEXT,
    prix_initial REAL,
    prix_promo REAL NOT NULL,
    date_debut TEXT,
    date_fin TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id),
    FOREIGN KEY(produit_id) REFERENCES produits_vitrine(id)
  );

  CREATE TABLE IF NOT EXISTS vitrine_publications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL,
    produit_id INTEGER,
    titre TEXT NOT NULL,
    description TEXT,
    prix REAL,
    promo TEXT,
    medias_json TEXT DEFAULT '[]',
    media_bg TEXT,
    cta_type TEXT DEFAULT 'aucun',
    statut TEXT DEFAULT 'publie',
    vues INTEGER DEFAULT 0,
    partages INTEGER DEFAULT 0,
    clics_fiche INTEGER DEFAULT 0,
    ordre INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id),
    FOREIGN KEY(produit_id) REFERENCES produits_vitrine(id)
  );

  CREATE TABLE IF NOT EXISTS vitrine_pub_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publication_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(publication_id, user_id),
    FOREIGN KEY(publication_id) REFERENCES vitrine_publications(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS vitrine_pub_commentaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publication_id INTEGER NOT NULL,
    auteur_id INTEGER,
    auteur_nom TEXT NOT NULL,
    contenu TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(publication_id) REFERENCES vitrine_publications(id)
  );

  -- Comptes Stripe Connect des initiatives (paiements marketplace, commission plateforme)
  CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL UNIQUE,
    stripe_account_id TEXT NOT NULL UNIQUE,
    statut TEXT DEFAULT 'pending' CHECK(statut IN ('pending','active','restricted','rejected')),
    charges_enabled INTEGER DEFAULT 0,
    payouts_enabled INTEGER DEFAULT 0,
    details_submitted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id)
  );

  -- Journal d'audit des vérifications d'identité (aucun document stocké — uniquement le statut/dates)
  CREATE TABLE IF NOT EXISTS identity_verifications_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    initiative_id INTEGER,
    stripe_session_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('personne','organisation')),
    statut TEXT NOT NULL CHECK(statut IN ('requires_input','processing','verified','canceled')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(initiative_id) REFERENCES initiatives(id)
  );

  -- Centre Financier : demandes de retrait (Stripe Transfer réel vers le compte Connect de l'utilisateur)
  CREATE TABLE IF NOT EXISTS retraits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    montant REAL NOT NULL,
    devise TEXT DEFAULT 'EUR',
    statut TEXT DEFAULT 'demande' CHECK(statut IN ('demande','traite','echoue')),
    stripe_transfer_id TEXT,
    erreur_msg TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    traite_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- Centre Financier : préférences de l'utilisateur
  CREATE TABLE IF NOT EXISTS wallet_settings (
    user_id INTEGER PRIMARY KEY,
    devise_preferee TEXT DEFAULT 'EUR',
    frequence_auto TEXT DEFAULT 'manuel' CHECK(frequence_auto IN ('manuel','hebdomadaire','mensuel')),
    seuil_auto REAL DEFAULT 0,
    notifications INTEGER DEFAULT 1,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- Centre Financier : ledger générique multi-modules (boutique, cotisations, dons, services...)
  -- Distinct de wallet_transactions (billetterie, historique déjà en production) pour ne jamais y toucher.
  CREATE TABLE IF NOT EXISTS wallet_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    module TEXT NOT NULL,
    source_id INTEGER,
    source_label TEXT,
    payeur_nom TEXT,
    montant_brut REAL NOT NULL,
    commission REAL DEFAULT 0,
    frais_prestataire REAL DEFAULT 0,
    montant_net REAL NOT NULL,
    devise TEXT DEFAULT 'EUR',
    statut TEXT DEFAULT 'valide' CHECK(statut IN ('en_attente','valide','rembourse','annule')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

/* ═══════════════════════════════════════════════
   MODULE PUBLICITÉ (régie publicitaire) — Tables
   ═══════════════════════════════════════════════ */
db.exec(`
  CREATE TABLE IF NOT EXISTS publicites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'image',
    media_url TEXT,
    thumbnail_url TEXT,
    titre TEXT NOT NULL,
    description TEXT,
    cta TEXT DEFAULT 'En savoir plus',
    lien_url TEXT,
    duree_jours INTEGER DEFAULT 7,
    cible_pays TEXT DEFAULT '[]',
    cible_langue TEXT DEFAULT '[]',
    cible_interet TEXT DEFAULT '[]',
    emplacements TEXT DEFAULT '["homepage_feed"]',
    statut TEXT NOT NULL DEFAULT 'pending_admin',
    motif_rejet TEXT,
    nb_impressions INTEGER DEFAULT 0,
    nb_clics INTEGER DEFAULT 0,
    nb_video_views INTEGER DEFAULT 0,
    nb_full_video_views INTEGER DEFAULT 0,
    date_debut TEXT,
    date_fin TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS pub_abonnements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    plan TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'en_attente_paiement',
    payment_mode TEXT DEFAULT 'annuel',
    credits_restants INTEGER DEFAULT 0,
    credits_reset_le TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    grace_until TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

/* ═══════════════════════════════════════════════
   MODULE BUSINESS PLAN — Tables
   ═══════════════════════════════════════════════ */
db.exec(`
  /* ── Business Plans ── */
  CREATE TABLE IF NOT EXISTS business_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nom_projet TEXT DEFAULT 'Sans titre',
    slogan TEXT,
    logo_url TEXT,
    type_initiative TEXT DEFAULT 'startup',
    secteur TEXT,
    statut TEXT DEFAULT 'brouillon',
    template TEXT DEFAULT 'startup',
    sections_json TEXT DEFAULT '{}',
    version INTEGER DEFAULT 1,
    progression INTEGER DEFAULT 0,
    is_public INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Versions / historique ── */
  CREATE TABLE IF NOT EXISTS bp_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bp_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    saved_by INTEGER,
    label TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(bp_id) REFERENCES business_plans(id) ON DELETE CASCADE,
    FOREIGN KEY(saved_by) REFERENCES users(id) ON DELETE SET NULL
  );

  /* ── Collaborateurs ── */
  CREATE TABLE IF NOT EXISTS bp_collaborateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bp_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'lecteur',
    invite_par INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(bp_id, user_id),
    FOREIGN KEY(bp_id) REFERENCES business_plans(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Commentaires par section ── */
  CREATE TABLE IF NOT EXISTS bp_commentaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bp_id INTEGER NOT NULL,
    section_key TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    texte TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(bp_id) REFERENCES business_plans(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Assistant BP — historique des conversations ── */
  CREATE TABLE IF NOT EXISTS bp_assistant_conv (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bp_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    messages_json TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(bp_id) REFERENCES business_plans(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Assistant BP — historique des modifications de champs (mémoire IA) ── */
  CREATE TABLE IF NOT EXISTS bp_field_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bp_id INTEGER NOT NULL,
    user_id INTEGER,
    section_key TEXT NOT NULL,
    field_key TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(bp_id) REFERENCES business_plans(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Synchronisation des réseaux sociaux — config globale (admin) ── */
  CREATE TABLE IF NOT EXISTS social_reseaux_config (
    reseau TEXT PRIMARY KEY,
    actif INTEGER DEFAULT 1,
    limite_freq_min INTEGER DEFAULT 60
  );

  /* ── Synchronisation des réseaux sociaux — comptes connectés par utilisateur ── */
  CREATE TABLE IF NOT EXISTS social_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    reseau TEXT NOT NULL,
    connecte INTEGER DEFAULT 1,
    permissions_json TEXT DEFAULT '[]',
    derniere_sync TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, reseau),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Synchronisation des réseaux sociaux — publications détectées ── */
  CREATE TABLE IF NOT EXISTS social_posts_detectes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    connection_id INTEGER,
    reseau TEXT NOT NULL,
    contenu_brut TEXT,
    medias_json TEXT DEFAULT '[]',
    categorie_suggeree TEXT,
    hashtags_suggeres TEXT DEFAULT '[]',
    statut TEXT DEFAULT 'detecte',
    diaspo_post_id INTEGER,
    programmed_at TEXT,
    erreur_msg TEXT,
    detected_at TEXT DEFAULT (datetime('now')),
    imported_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(connection_id) REFERENCES social_connections(id) ON DELETE SET NULL
  );

  /* ── Synchronisation des réseaux sociaux — préférences utilisateur ── */
  CREATE TABLE IF NOT EXISTS social_sync_settings (
    user_id INTEGER PRIMARY KEY,
    reseaux_surveilles_json TEXT DEFAULT '[]',
    frequence TEXT DEFAULT 'quotidienne',
    notifications INTEGER DEFAULT 1,
    ia_suggestions INTEGER DEFAULT 1,
    programmation_auto INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* ── Simulations de présentation ── */
  CREATE TABLE IF NOT EXISTS bp_simulations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bp_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    scenario TEXT NOT NULL,
    difficulte TEXT DEFAULT 'intermediaire',
    duree_seconds INTEGER DEFAULT 0,
    statut TEXT DEFAULT 'en_cours',
    messages_json TEXT DEFAULT '[]',
    rapport_json TEXT,
    score INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    finished_at TEXT,
    FOREIGN KEY(bp_id) REFERENCES business_plans(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

/* ═══════════════════════════════════════════════════════════
   MODULE AUDIOVISUEL
   ═══════════════════════════════════════════════════════════ */
db.exec(`
  -- Lives / diffusions
  CREATE TABLE IF NOT EXISTS av_lives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'conference',
    statut TEXT DEFAULT 'programme',   -- programme | en_cours | termine | annule
    acces TEXT DEFAULT 'public',       -- public | prive | membres | payant
    prix REAL DEFAULT 0,
    code_acces TEXT,
    url_stream TEXT,                   -- URL YouTube Live / Zoom / Meet fournie par l'organisateur
    url_replay TEXT,
    vignette_url TEXT,
    date_debut TEXT,
    date_fin TEXT,
    nb_vues INTEGER DEFAULT 0,
    pic_audience INTEGER DEFAULT 0,
    duree_secondes INTEGER DEFAULT 0,
    enregistrement_url TEXT,
    transcription TEXT,
    resume_ia TEXT,
    moments_cles TEXT DEFAULT '[]',
    decisions TEXT DEFAULT '[]',
    actions TEXT DEFAULT '[]',
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Chat live
  CREATE TABLE IF NOT EXISTS av_live_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    live_id INTEGER NOT NULL,
    user_id INTEGER,
    pseudo TEXT,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'chat',          -- chat | question | modere
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(live_id) REFERENCES av_lives(id) ON DELETE CASCADE
  );

  -- Sondages live
  CREATE TABLE IF NOT EXISTS av_sondages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    live_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    options_json TEXT DEFAULT '[]',
    actif INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(live_id) REFERENCES av_lives(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS av_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sondage_id INTEGER NOT NULL,
    user_id INTEGER,
    option_index INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(sondage_id) REFERENCES av_sondages(id) ON DELETE CASCADE
  );

  -- Réactions live
  CREATE TABLE IF NOT EXISTS av_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    live_id INTEGER NOT NULL,
    user_id INTEGER,
    emoji TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Podcasts / séries
  CREATE TABLE IF NOT EXISTS av_series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    description TEXT,
    categorie TEXT DEFAULT 'general',
    image_url TEXT,
    nb_abonnes INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Épisodes podcast
  CREATE TABLE IF NOT EXISTS av_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serie_id INTEGER,
    initiative_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    url_audio TEXT NOT NULL,           -- URL SoundCloud / Spotify / hébergement audio
    duree_secondes INTEGER DEFAULT 0,
    intervenants TEXT DEFAULT '[]',
    categorie TEXT DEFAULT 'general',
    nb_ecoutes INTEGER DEFAULT 0,
    taux_completion REAL DEFAULT 0,
    note REAL DEFAULT 0,
    nb_notes INTEGER DEFAULT 0,
    transcription TEXT,
    resume_ia TEXT,
    chapitres TEXT DEFAULT '[]',       -- [{time, titre}]
    mots_cles TEXT DEFAULT '[]',
    is_public INTEGER DEFAULT 1,
    published_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(serie_id) REFERENCES av_series(id) ON DELETE SET NULL,
    FOREIGN KEY(initiative_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Commentaires podcasts
  CREATE TABLE IF NOT EXISTS av_commentaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    contenu TEXT NOT NULL,
    note INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(episode_id) REFERENCES av_episodes(id) ON DELETE CASCADE
  );

  -- Participants live (pour accès privé/payant)
  CREATE TABLE IF NOT EXISTS av_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    live_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    statut TEXT DEFAULT 'invite',      -- invite | confirme | bloque
    token TEXT,
    joined_at TEXT,
    UNIQUE(live_id, user_id),
    FOREIGN KEY(live_id) REFERENCES av_lives(id) ON DELETE CASCADE
  );

  -- Playlists
  CREATE TABLE IF NOT EXISTS av_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id INTEGER NOT NULL,
    titre TEXT NOT NULL,
    description TEXT,
    items_json TEXT DEFAULT '[]',      -- [{type:'live'|'episode', id}]
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(initiative_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

module.exports = db;
module.exports.backfillOfficialFollow = backfillOfficialFollow;
module.exports.generateDaId = generateDaId;
module.exports.generateDsId = generateDsId;
