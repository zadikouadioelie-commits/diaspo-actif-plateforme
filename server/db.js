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

  /* ===== MODULE PUBLICITÉS ===== */

  CREATE TABLE IF NOT EXISTS publicites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Identification campagne
    nom_campagne TEXT,
    reference_interne TEXT,
    annonceur TEXT NOT NULL,
    categorie TEXT DEFAULT 'general',
    type_sponsor TEXT DEFAULT 'partenaire',
    sponsor_id INTEGER,
    -- Format & statut
    format TEXT NOT NULL DEFAULT 'banniere',
    statut TEXT NOT NULL DEFAULT 'brouillon',
    priorite INTEGER DEFAULT 2,
    -- Contenu textuel
    titre TEXT NOT NULL,
    sous_titre TEXT,
    description_courte TEXT,
    description_detaillee TEXT,
    description TEXT,
    -- Médias
    logo_annonceur TEXT,
    image_url TEXT,
    galerie_images TEXT DEFAULT '[]',
    video_url TEXT,
    -- CTA
    bouton_action TEXT DEFAULT 'En savoir plus',
    lien_url TEXT,
    lien_texte TEXT DEFAULT 'En savoir plus',
    lien_type TEXT DEFAULT 'externe',
    lien_interne_id INTEGER,
    -- Liens contextuels (site, page DA…)
    lien_site TEXT,
    -- Contacts
    contact_telephone TEXT,
    contact_whatsapp TEXT,
    contact_email TEXT,
    contact_adresse TEXT,
    reseaux_sociaux TEXT DEFAULT '{}',
    moyens_paiement TEXT DEFAULT '[]',
    -- Ciblage géographique
    zone_geo TEXT DEFAULT 'monde',
    cible_continents TEXT DEFAULT '[]',
    cible_pays TEXT DEFAULT '[]',
    cible_regions TEXT DEFAULT '[]',
    cible_villes TEXT DEFAULT '[]',
    cible_pays_residence TEXT DEFAULT '[]',
    -- Ciblage Diaspo'Actif
    cible_roles TEXT DEFAULT '[]',
    cible_nationalites TEXT DEFAULT '[]',
    cible_origines TEXT DEFAULT '[]',
    cible_interets TEXT DEFAULT '[]',
    -- Paramètres d'affichage
    emplacements TEXT DEFAULT '["fil"]',
    max_affichages_user INTEGER DEFAULT 0,
    max_affichages_jour INTEGER DEFAULT 0,
    max_clics INTEGER DEFAULT 0,
    -- Période
    date_debut TEXT,
    date_fin TEXT,
    heure_debut TEXT,
    heure_fin TEXT,
    -- Compteurs
    nb_impressions INTEGER DEFAULT 0,
    nb_clics INTEGER DEFAULT 0,
    nb_portee INTEGER DEFAULT 0,
    nb_partages INTEGER DEFAULT 0,
    nb_enregistrements INTEGER DEFAULT 0,
    nb_contacts INTEGER DEFAULT 0,
    nb_messages INTEGER DEFAULT 0,
    -- Validation
    validated_by INTEGER,
    validated_at TEXT,
    refus_motif TEXT,
    -- Admin
    created_by INTEGER,
    notes_admin TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS publicite_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publicite_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('impression','clic','partage','enregistrement','contact','message')),
    user_id INTEGER,
    user_pays TEXT,
    user_ville TEXT,
    user_nationalite TEXT,
    user_role TEXT,
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
`);

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
  // Tracking date sur les réactions (pour tendances engagement)
  ["fil_reactions", "created_at TEXT DEFAULT (datetime('now'))"],
  // Vues initiatives
  ["initiatives", "nb_vues INTEGER DEFAULT 0"],
  // Publicités — extension module complet
  ["publicites", "nom_campagne TEXT"],
  ["publicites", "reference_interne TEXT"],
  ["publicites", "categorie TEXT DEFAULT 'general'"],
  ["publicites", "type_sponsor TEXT DEFAULT 'partenaire'"],
  ["publicites", "sponsor_id INTEGER"],
  ["publicites", "sous_titre TEXT"],
  ["publicites", "description_courte TEXT"],
  ["publicites", "description_detaillee TEXT"],
  ["publicites", "logo_annonceur TEXT"],
  ["publicites", "galerie_images TEXT DEFAULT '[]'"],
  ["publicites", "video_url TEXT"],
  ["publicites", "bouton_action TEXT DEFAULT 'En savoir plus'"],
  ["publicites", "lien_type TEXT DEFAULT 'externe'"],
  ["publicites", "lien_interne_id INTEGER"],
  ["publicites", "lien_site TEXT"],
  ["publicites", "contact_telephone TEXT"],
  ["publicites", "contact_whatsapp TEXT"],
  ["publicites", "contact_email TEXT"],
  ["publicites", "contact_adresse TEXT"],
  ["publicites", "reseaux_sociaux TEXT DEFAULT '{}'"],
  ["publicites", "moyens_paiement TEXT DEFAULT '[]'"],
  ["publicites", "zone_geo TEXT DEFAULT 'monde'"],
  ["publicites", "cible_continents TEXT DEFAULT '[]'"],
  ["publicites", "cible_pays_residence TEXT DEFAULT '[]'"],
  ["publicites", "cible_interets TEXT DEFAULT '[]'"],
  ["publicites", "emplacements TEXT DEFAULT '[\"fil\"]'"],
  ["publicites", "max_affichages_user INTEGER DEFAULT 0"],
  ["publicites", "max_affichages_jour INTEGER DEFAULT 0"],
  ["publicites", "max_clics INTEGER DEFAULT 0"],
  ["publicites", "heure_debut TEXT"],
  ["publicites", "heure_fin TEXT"],
  ["publicites", "nb_portee INTEGER DEFAULT 0"],
  ["publicites", "nb_partages INTEGER DEFAULT 0"],
  ["publicites", "nb_enregistrements INTEGER DEFAULT 0"],
  ["publicites", "nb_contacts INTEGER DEFAULT 0"],
  ["publicites", "nb_messages INTEGER DEFAULT 0"],
  ["publicites", "validated_by INTEGER"],
  ["publicites", "validated_at TEXT"],
  ["publicites", "refus_motif TEXT"],
  // Publicité events — champs supplémentaires
  ["publicite_events", "user_nationalite TEXT"],
  ["publicite_events", "user_role TEXT"],
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
  ["initiatives", "signalements_confirmes INTEGER DEFAULT 0"],
];

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

  /* ── Cache du score de confiance ── */
  CREATE TABLE IF NOT EXISTS trust_cache (
    user_id     INTEGER PRIMARY KEY,
    score       REAL NOT NULL DEFAULT 0,
    detail_json TEXT DEFAULT '[]',
    label       TEXT DEFAULT 'Faible',
    computed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
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

module.exports = db;
module.exports.backfillOfficialFollow = backfillOfficialFollow;
