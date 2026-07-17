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
    // On ignore les commentaires SQL (-- ... et /* ... */) en tête de bloc avant de tester le préfixe
    // CREATE, sinon un commentaire juste avant CREATE TABLE fait échouer le filtre (table jamais créée
    // sur Postgres). Bug réel observé sur abonnements_collectivite (commentaire /* */ non filtré).
    const stripLeadingComments = s => s.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))+/g, '').trim();
    const createOnly = statements.filter(s => /^CREATE (TABLE|INDEX|UNIQUE INDEX)/i.test(stripLeadingComments(s)));
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
   (ex: 2026-07-02 sur /api/evenements, /api/users/:id/trust-score — stables au réessai).

   IMPORTANT — verrou NON BLOQUANT (pg_try_advisory_lock, pas pg_advisory_lock) :
   incident du 2026-07-03 — une instance Vercel figée en plein milieu de sa migration
   (sans jamais libérer le verrou bloquant) a mis TOUT le site hors service pendant
   plusieurs minutes : chaque nouvelle requête/instance attendait ce verrou indéfiniment.
   Avec un verrou non bloquant, une seule instance fait la migration ; toutes les
   autres démarrent immédiatement sans jamais attendre (le schéma est quasi toujours
   déjà à jour — ce n'est qu'à la toute première seconde après un déploiement modifiant
   le schéma que ça a un intérêt, et même alors une requête concurrente sert simplement
   avec l'ancien schéma le temps que l'instance qui a le verrou termine, au lieu de
   bloquer). Le statement_timeout ajouté dans db-pg.js reste un filet de sécurité
   supplémentaire si jamais la migration elle-même se grippe. */
const PG_INIT_LOCK_KEY = 84210001;

async function pgInit() {
  if (_initialized) return;

  const { pool } = pg;
  const client = await pool.connect();
  try {
    const { rows: lockRows } = await client.query('SELECT pg_try_advisory_lock($1) AS got', [PG_INIT_LOCK_KEY]);
    if (!lockRows[0].got) {
      // Une autre instance migre déjà — ne jamais attendre, servir la requête tout de suite.
      // _initialized reste false : cette instance retentera au prochain cold start éventuel,
      // mais initPromise (api/index.js) est déjà résolue donc cette requête n'est pas bloquée.
      console.log('[pg-init] Verrou déjà pris par une autre instance — migration ignorée pour ce démarrage.');
      return;
    }
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
    _initialized = true;
  } finally {
    client.release();
  }
}

/* Migrations de colonnes ajoutées via ALTER TABLE dans db.js
   (jamais exécutées en Postgres car pg-init ignore les ALTER).
   Idempotent grâce à ADD COLUMN IF NOT EXISTS. */
async function migratePg(pool) {
  const cols = [
    // Billetterie V1 — early-bird + attributs enrichis par type de billet
    ['ticket_types', 'avantages', 'TEXT'],
    ['ticket_types', 'devise', "TEXT DEFAULT 'EUR'"],
    ['ticket_types', 'max_par_acheteur', 'INTEGER'],
    ['ticket_types', 'date_vente_debut', 'TEXT'],
    ['ticket_types', 'date_vente_fin', 'TEXT'],
    ['ticket_types', 'couleur', "TEXT DEFAULT '#2563EB'"],
    ['ticket_types', 'prix_early_bird', 'REAL'],
    ['ticket_types', 'early_bird_fin', 'TEXT'],
    // Billetterie V1 — commandes multi-billets, nominatif, code promo appliqué, validation manuelle
    ['tickets', 'commande_id', 'TEXT'],
    ['tickets', 'titulaire_nom', 'TEXT'],
    ['tickets', 'titulaire_prenom', 'TEXT'],
    ['tickets', 'code_promo_id', 'INTEGER'],
    ['tickets', 'montant_reduction', 'REAL DEFAULT 0'],
    ['tickets', 'validation_manuelle_statut', 'TEXT'],
    // Billetterie V1 — lignes de compensation remboursement (sens='debit'), historique existant reste 'credit'
    ['wallet_transactions', 'sens', "TEXT DEFAULT 'credit'"],
    // users
    ['users', 'da_id', 'TEXT'],
    ['users', 'ds_id', 'TEXT'],
    ['users', 'disponibilites', 'TEXT'],
    ['users', 'reseaux_sociaux', 'TEXT'],
    ['users', 'email_verifie', 'INTEGER DEFAULT 0'],
    ['users', 'email_verif_token', 'TEXT'],
    ['users', 'email_verif_expires', 'BIGINT'],
    ['users', 'stripe_customer_id', 'TEXT'],
    ['users', 'programmation_json', "TEXT DEFAULT '{}'"],
    // events (billetterie) — colonnes ajoutées en prévision, non utilisées par le moteur de priorité (voir evenements ci-dessous)
    ['events', 'langue', "TEXT DEFAULT 'francais'"],
    ['events', 'mode_participation', "TEXT DEFAULT 'presentiel'"],
    ['events', 'region', 'TEXT'],
    ['events', 'departement', 'TEXT'],
    ['events', 'communaute', 'TEXT'],
    // evenements (module Programmation — moteur de priorité, table réellement utilisée par evenements.html)
    ['evenements', 'langue', "TEXT DEFAULT 'francais'"],
    ['evenements', 'mode_participation', "TEXT DEFAULT 'presentiel'"],
    ['evenements', 'region', 'TEXT'],
    ['evenements', 'departement', 'TEXT'],
    // Mon Agenda — intégration Google Calendar
    ['users', 'google_calendar_access_token', 'TEXT'],
    ['users', 'google_calendar_refresh_token', 'TEXT'],
    ['users', 'google_calendar_token_expiry', 'TEXT'],
    ['users', 'google_calendar_sync_mode', "TEXT DEFAULT 'desactive'"],
    ['users', 'google_calendar_connected_email', 'TEXT'],
    ['users', 'google_calendar_last_sync', 'TEXT'],
    ['agenda_events', 'google_event_id', 'TEXT'],
    // Ciblage d'audience des publicités (zone géographique + listes Réseau Pro)
    ['publicites', 'cible_zones', "TEXT DEFAULT '[]'"],
    ['publicites', 'cible_ville', 'TEXT'],
    ['publicites', 'cible_departement', 'TEXT'],
    ['publicites', 'cible_region', 'TEXT'],
    ['publicites', 'cible_listes', "TEXT DEFAULT '[]'"],
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
    ['messages', 'edited', 'INTEGER DEFAULT 0'],
    ['messages', 'edited_at', 'TEXT'],
    ['messages', 'deleted', 'INTEGER DEFAULT 0'],
    ['messages', 'deleted_at', 'TEXT'],
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
    ['users', 'identite_pays_document', 'TEXT'],
    ['users', 'identite_mismatch', 'INTEGER DEFAULT 0'],
    ['users', 'galerie_json', 'TEXT'],
    ['users', 'origine1', 'TEXT'],
    ['users', 'origine2', 'TEXT'],
    ['initiatives', 'organisation_verifiee', 'INTEGER DEFAULT 0'],
    ['initiatives', 'organisation_verifiee_le', 'TEXT'],
    ['initiatives', 'organisation_expire_le', 'TEXT'],
    ['initiatives', 'stripe_identity_session_id', 'TEXT'],
    // Refonte visuelle profil/vitrine : thème couleur de la boutique
    ['initiatives', 'vitrine_theme', "TEXT DEFAULT 'bordeaux'"],
    // Rubriques Vitrine complémentaires : téléchargements, partenaires, objectif, offre flash
    ['initiatives', 'vitrine_documents_json', 'TEXT'],
    ['initiatives', 'vitrine_partenaires_json', 'TEXT'],
    ['initiatives', 'vitrine_objectif_cible', 'INTEGER'],
    ['initiatives', 'vitrine_objectif_libelle', 'TEXT'],
    ['initiatives', 'vitrine_offre_flash_titre', 'TEXT'],
    ['initiatives', 'vitrine_offre_flash_fin', 'TEXT'],
    ['initiatives', 'vitrine_pourquoi_choisir', 'TEXT'],
    ['produits_vitrine', 'prix_promo', 'REAL'],
    // Vitrine "fiche professionnelle complète" : avis étendus, coordonnées, services, RDV
    ['vitrine_avis', 'titre', 'TEXT'],
    ['vitrine_avis', 'reponse_texte', 'TEXT'],
    ['vitrine_avis', 'reponse_date', 'TEXT'],
    ['initiatives', 'vitrine_services_categories_json', 'TEXT'],
    ['initiatives', 'vitrine_ville', 'TEXT'],
    ['initiatives', 'vitrine_region', 'TEXT'],
    ['initiatives', 'vitrine_pays', 'TEXT'],
    ['initiatives', 'vitrine_whatsapp', 'TEXT'],
    ['initiatives', 'vitrine_tel_pro', 'TEXT'],
    ['initiatives', 'vitrine_email_pro', 'TEXT'],
    ['initiatives', 'vitrine_google_maps_url', 'TEXT'],
    ['initiatives', 'vitrine_rdv_active', 'INTEGER DEFAULT 0'],
    ['users', 'compte_masque', 'INTEGER DEFAULT 0'],
    ['produits_vitrine', 'catalogue_id', 'INTEGER'],
    // Sécurité renforcée du compte administrateur du site institutionnel
    ['vitrine_site_admins', 'reset_token', 'TEXT'],
    ['vitrine_site_admins', 'reset_expires', 'BIGINT'],
    ['vitrine_site_admins', 'twofa_code', 'TEXT'],
    ['vitrine_site_admins', 'twofa_expires', 'BIGINT'],
    // Régie publicitaire (nouveau module) — table "publicites" réutilisée depuis l'ancien module
    ['publicites', 'user_id', 'INTEGER'],
    ['publicites', 'media_type', "TEXT DEFAULT 'image'"],
    ['publicites', 'media_url', 'TEXT'],
    ['publicites', 'thumbnail_url', 'TEXT'],
    ['publicites', 'cta', "TEXT DEFAULT 'En savoir plus'"],
    ['publicites', 'duree_jours', 'INTEGER DEFAULT 7'],
    ['publicites', 'cible_langue', "TEXT DEFAULT '[]'"],
    ['publicites', 'cible_interet', "TEXT DEFAULT '[]'"],
    ['publicites', 'motif_rejet', 'TEXT'],
    ['publicites', 'nb_video_views', 'INTEGER DEFAULT 0'],
    ['publicites', 'nb_full_video_views', 'INTEGER DEFAULT 0'],
    // Synchronisation des réseaux sociaux — badge "Importé depuis X" sur les posts du fil
    ['fil_posts', 'source_import', 'TEXT'],
    // ─── Rattrapage massif : colonnes présentes dans db.js (SQLite) mais jamais migrées vers Postgres ───
    // Découvert le 2026-07-07 en investiguant une panne FUNCTION_INVOCATION_FAILED sur GET /api/events
    // (colonne events.publie_at absente en production). Ce tableau ne couvrait qu'une fraction des
    // colonnes ajoutées au fil du temps directement dans les CREATE TABLE de db.js (sans entrée ALTER
    // correspondante ici) — createMissingTables() ignore les CREATE TABLE si la table existe déjà.
    ['conversations', 'sujet', "TEXT"],
    ['messages', 'type', "TEXT DEFAULT 'text'"],
    ['messages', 'fichier_json', "TEXT"],
    ['messages', 'lu', "INTEGER DEFAULT 0"],
    ['users', 'wallet_balance', "REAL DEFAULT 0"],
    ['users', 'prenom', "TEXT"],
    ['users', 'date_naissance', "TEXT"],
    ['users', 'adresse', "TEXT"],
    ['users', 'code_postal', "TEXT"],
    ['users', 'telephone', "TEXT"],
    ['users', 'centres_interet', "TEXT DEFAULT '[]'"],
    ['users', 'situation_pro', "TEXT"],
    ['users', 'type_institution', "TEXT"],
    ['users', 'statut_verification', "TEXT DEFAULT 'auto'"],
    ['initiatives', 'site_web', "TEXT"],
    ['initiatives', 'reseaux_sociaux', "TEXT DEFAULT '{}'"],
    ['initiatives', 'galerie_json', "TEXT DEFAULT '[]'"],
    ['initiatives', 'mission', "TEXT"],
    ['initiatives', 'historique', "TEXT"],
    ['initiatives', 'abonnement_actif', "INTEGER DEFAULT 0"],
    ['initiatives', 'adresse', "TEXT"],
    ['initiatives', 'code_postal', "TEXT"],
    ['initiatives', 'objectifs', "TEXT"],
    ['initiatives', 'pays_intervention', "TEXT DEFAULT '[]'"],
    ['initiatives', 'logo_url', "TEXT"],
    ['initiatives', 'nom_responsable', "TEXT"],
    ['initiatives', 'prenom_responsable', "TEXT"],
    ['initiatives', 'fonction_responsable', "TEXT"],
    ['initiatives', 'email_responsable', "TEXT"],
    ['initiatives', 'tel_responsable', "TEXT"],
    ['users', 'photo_url', "TEXT"],
    ['users', 'bio', "TEXT"],
    ['users', 'banner_url', "TEXT"],
    ['users', 'titre_pro', "TEXT"],
    ['users', 'competences', "TEXT DEFAULT '[]'"],
    ['users', 'experiences', "TEXT DEFAULT '[]'"],
    ['users', 'theme_couleur', "TEXT DEFAULT 'ocean'"],
    ['users', 'privacy_json', "TEXT DEFAULT '{}'"],
    ['evenements', 'description', "TEXT"],
    ['evenements', 'places_max', "INTEGER"],
    ['evenements', 'image_url', "TEXT"],
    ['evenements', 'domaine', "TEXT"],
    ['evenements', 'type_evt', "TEXT DEFAULT 'evenement'"],
    ['evenements', 'pays', "TEXT"],
    ['evenements', 'ville', "TEXT"],
    ['evenements', 'origine', "TEXT"],
    ['evenements_participants', 'nom_complet', "TEXT"],
    ['evenements_participants', 'email', "TEXT"],
    ['evenements_participants', 'telephone', "TEXT"],
    ['evenements_participants', 'nb_personnes', "INTEGER DEFAULT 1"],
    ['evenements_participants', 'message', "TEXT"],
    ['evenements', 'inscription_ouverte', "INTEGER DEFAULT 1"],
    ['evenements', 'lien_inscription', "TEXT"],
    ['evenements', 'heure_debut', "TEXT"],
    ['evenements', 'heure_fin', "TEXT"],
    ['evenements', 'date_fin', "TEXT"],
    ['evenements', 'lien_visio', "TEXT"],
    ['evenements', 'visibilite', "TEXT DEFAULT 'public'"],
    ['evenements', 'image_couverture', "TEXT"],
    ['evenements', 'galerie_photos', "TEXT DEFAULT '[]'"],
    ['evenements', 'pdf_url', "TEXT"],
    ['evenements', 'pdf_nom', "TEXT"],
    ['evenements', 'pdf_acces', "TEXT DEFAULT 'public'"],
    ['events', 'image_couverture', "TEXT"],
    ['events', 'galerie_photos', "TEXT DEFAULT '[]'"],
    ['events', 'pdf_url', "TEXT"],
    ['events', 'pdf_nom', "TEXT"],
    ['events', 'pdf_acces', "TEXT DEFAULT 'public'"],
    ['events', 'cible_type', "TEXT DEFAULT 'tous'"],
    ['events', 'cible_liste_ids', "TEXT DEFAULT '[]'"],
    ['events', 'fc_resume', "TEXT"],
    ['events', 'fc_objectifs', "TEXT"],
    ['events', 'fc_public', "TEXT"],
    ['events', 'fc_programme', "TEXT"],
    ['events', 'fc_partenaires', "TEXT"],
    ['events', 'fc_contact', "TEXT"],
    ['events', 'fc_notes', "TEXT"],
    ['events', 'fc_partenaires_ids', "TEXT DEFAULT '[]'"],
    ['events', 'programmed_at', "TEXT"],
    ['events', 'timezone', "TEXT DEFAULT 'Europe/Paris'"],
    ['events', 'inscription_mode', "TEXT DEFAULT 'libre'"],
    ['events', 'nb_places', "INTEGER"],
    ['events', 'liste_attente', "INTEGER DEFAULT 0"],
    ['events', 'rayon_publication', "TEXT DEFAULT 'international'"],
    ['events', 'vues_total', "INTEGER DEFAULT 0"],
    ['events', 'vues_uniques', "INTEGER DEFAULT 0"],
    ['events', 'nb_partages', "INTEGER DEFAULT 0"],
    ['events', 'nb_sauvegardes', "INTEGER DEFAULT 0"],
    ['events', 'publie_at', "TEXT"],
    ['events', 'duree_exposition_jours', "INTEGER DEFAULT 20"],
    ['events', 'qr_folder_notified_at', "TEXT"],
    ['events', 'qr_folder_purged_at', "TEXT"],
    ['agenda_events', 'source_type', "TEXT DEFAULT 'manuel'"],
    ['agenda_events', 'source_id', "INTEGER"],
    ['agenda_events', 'event_id', "INTEGER"],
    ['collaborations', 'titre', "TEXT"],
    ['collaborations', 'description', "TEXT"],
    ['collaborations', 'type_collab', "TEXT DEFAULT 'benevolat'"],
    ['collaborations', 'competences', "TEXT DEFAULT '[]'"],
    ['collaborations', 'deadline', "TEXT"],
    ['collaborations', 'initiative_id', "INTEGER"],
    ['fil_posts', 'mentions_json', "TEXT DEFAULT '[]'"],
    ['fil_posts', 'pub_type', "TEXT"],
    ['fil_posts', 'original_post_id', "INTEGER"],
    ['fil_reactions', 'created_at', "TEXT DEFAULT to_char(NOW(),'YYYY-MM-DD HH24:MI:SS')"],
    ['initiatives', 'nb_vues', "INTEGER DEFAULT 0"],
    ['offres_candidatures', 'cv_profile_id', "INTEGER"],
    ['offres_candidatures', 'lettre_id', "INTEGER"],
    ['offres_candidatures', 'statut_detail', "TEXT DEFAULT 'envoyee'"],
    ['offres_candidatures', 'vu_recruteur', "INTEGER DEFAULT 0"],
    ['offres_candidatures', 'notes_recruteur', "TEXT"],
    ['offres_candidatures', 'evaluation_json', "TEXT DEFAULT '{}'"],
    ['offres_candidatures', 'date_entretien', "TEXT"],
    ['offres_candidatures', 'lieu_entretien', "TEXT"],
    ['offres_candidatures', 'type_entretien', "TEXT DEFAULT 'presentiel'"],
    ['offres_candidatures', 'type_candidature', "TEXT DEFAULT 'offre'"],
    ['cv_profiles', 'versions_json', "TEXT DEFAULT '[]'"],
    ['initiatives', 'numero_immatriculation', "TEXT"],
    ['initiatives', 'pays_immatriculation', "TEXT"],
    ['initiatives', 'taille_structure', "TEXT"],
    ['initiatives', 'annee_creation', "INTEGER"],
    ['initiatives', 'services', "TEXT DEFAULT '[]'"],
    ['initiatives', 'langues', "TEXT DEFAULT '[]'"],
    ['initiatives', 'reseau_visible', "INTEGER DEFAULT 1"],
    ['initiatives', 'accepte_messages', "INTEGER DEFAULT 1"],
    ['event_checkins', 'device_info', "TEXT"],
    ['event_checkins', 'latitude', "REAL"],
    ['event_checkins', 'longitude', "REAL"],
    ['initiatives', 'signalements_confirmes', "INTEGER DEFAULT 0"],
    ['initiatives', 'commune', "TEXT"],
    ['initiatives', 'departement', "TEXT"],
    ['initiatives', 'comment_entendu', "TEXT"],
    ['initiatives', 'attentes', "TEXT"],
    ['initiatives', 'autorisation_temoignage', "INTEGER DEFAULT 0"],
    ['initiatives', 'nb_salaries', "INTEGER DEFAULT 0"],
    ['initiatives', 'linkedin', "TEXT"],
    ['initiatives', 'twitter', "TEXT"],
    ['initiatives', 'youtube', "TEXT"],
    ['initiatives', 'forme_autre', "TEXT"],
    ['initiatives', 'pays_origine', "TEXT"],
    ['partenaires_officiels', 'priorite', "INTEGER DEFAULT 0"],
    ['partenaires_officiels', 'mise_en_avant', "INTEGER DEFAULT 0"],
    ['partenaires_officiels', 'periode_debut', "TEXT"],
    ['partenaires_officiels', 'periode_fin', "TEXT"],
    ['partenaires_officiels', 'slogan', "TEXT"],
    ['partenaires_officiels', 'cles_matching', "TEXT DEFAULT '[]'"],
    ['users', 'type_organisme', "TEXT"],
    ['users', 'sigle_institution', "TEXT"],
    ['users', 'description_institution', "TEXT"],
    ['users', 'tel_secondaire', "TEXT"],
    ['users', 'email_officiel', "TEXT"],
    ['users', 'email_secondaire', "TEXT"],
    ['users', 'site_officiel', "TEXT"],
    ['users', 'facebook_officiel', "TEXT"],
    ['users', 'twitter_officiel', "TEXT"],
    ['users', 'linkedin_officiel', "TEXT"],
    ['users', 'youtube_officiel', "TEXT"],
    ['users', 'instagram_officiel', "TEXT"],
    ['users', 'tiktok_officiel', "TEXT"],
    ['users', 'whatsapp_officiel', "TEXT"],
    ['users', 'telegram_officiel', "TEXT"],
    ['users', 'nom_responsable_etatique', "TEXT"],
    ['users', 'prenom_responsable_etatique', "TEXT"],
    ['users', 'fonction_responsable_etatique', "TEXT"],
    ['users', 'date_prise_fonction', "TEXT"],
    ['users', 'date_fin_mandat', "TEXT"],
    ['users', 'photo_responsable', "TEXT"],
    ['users', 'email_responsable_etatique', "TEXT"],
    ['users', 'tel_responsable_etatique', "TEXT"],
    ['users', 'declaration_officielle', "INTEGER DEFAULT 0"],
    ['users', 'statut_etatique', "TEXT DEFAULT 'declare'"],
    ['users', 'domaine_utilisateur', "TEXT"],
    ['users', 'date_creation_institution', "TEXT"],
    ['users', 'devise_institution', "TEXT"],
    ['users', 'logo_url', "TEXT"],
    ['users', 'pays_origine_institution', "TEXT"],
    ['users', 'ministere_tutelle', "TEXT"],
    ['users', 'administration_rattachement', "TEXT"],
    ['users', 'region_origine', "TEXT"],
    ['users', 'pays_exercice', "TEXT"],
    ['users', 'region_exercice', "TEXT"],
    ['users', 'departement_exercice', "TEXT"],
    ['users', 'ville_exercice', "TEXT"],
    ['users', 'adresse_exercice', "TEXT"],
    ['users', 'code_postal_exercice', "TEXT"],
    ['users', 'coordonnees_gps', "TEXT"],
    ['users', 'horaires_ouverture', "TEXT"],
    ['users', 'site_local', "TEXT"],
    ['users', 'signature_responsable', "TEXT"],
    ['users', 'parent_institution_id', "INTEGER"],
    ['users', 'disponible_pour_travailler', "INTEGER DEFAULT 0"],
    ['recrutement_campagnes', 'titre_poste', "TEXT"],
    ['recrutement_campagnes', 'secteur_activite', "TEXT"],
    ['recrutement_campagnes', 'region', "TEXT"],
    ['recrutement_campagnes', 'departement', "TEXT"],
    ['recrutement_campagnes', 'teletravail', "TEXT DEFAULT 'non'"],
    ['recrutement_campagnes', 'niveau_etudes', "TEXT"],
    ['recrutement_campagnes', 'experience_annees', "TEXT"],
    ['recrutement_campagnes', 'competences', "TEXT DEFAULT '[]'"],
    ['recrutement_campagnes', 'langues', "TEXT DEFAULT '[]'"],
    ['recrutement_campagnes', 'certifications', "TEXT DEFAULT '[]'"],
    ['recrutement_campagnes', 'qualites', "TEXT DEFAULT '[]'"],
    ['recrutement_campagnes', 'date_debut', "TEXT"],
    ['recrutement_campagnes', 'duree_mission', "TEXT"],
    ['recrutement_campagnes', 'remuneration', "TEXT"],
    ['recrutement_campagnes', 'devise', "TEXT DEFAULT 'EUR'"],
    ['recrutement_campagnes', 'nb_postes', "INTEGER DEFAULT 1"],
    ['recrutement_campagnes', 'photos_json', "TEXT DEFAULT '[]'"],
    ['recrutement_campagnes', 'pdf_nom', "TEXT"],
    ['recrutement_campagnes', 'date_limite_candidature', "TEXT"],
    ['recrutement_campagnes', 'nb_commentaires', "INTEGER DEFAULT 0"],
    ['recrutement_campagnes', 'nb_favoris', "INTEGER DEFAULT 0"],
    ['recrutement_campagnes', 'nb_republications', "INTEGER DEFAULT 0"],
    ['recrutement_campagnes', 'fil_post_id', "INTEGER"],
    ['recrutement_candidatures', 'cv_snapshot', "TEXT"],
    ['recrutement_candidatures', 'lettre_snapshot', "TEXT"],
    ['recrutement_candidatures', 'documents_json', "TEXT DEFAULT '[]'"],
    ['sondages', 'rayon_publication', "TEXT DEFAULT 'national'"],
    ['sondages', 'nb_vues', "INTEGER DEFAULT 0"],
    ['sondages', 'nb_reactions', "INTEGER DEFAULT 0"],
    ['sondages', 'nb_commentaires', "INTEGER DEFAULT 0"],
    ['sondages', 'nb_republications', "INTEGER DEFAULT 0"],
    ['sondages', 'nb_favoris', "INTEGER DEFAULT 0"],
    ['sondages', 'photos_json', "TEXT DEFAULT '[]'"],
    ['sondages', 'pdf_nom', "TEXT"],
    ['sondages', 'video_url', "TEXT"],
    ['sondages', 'objectif', "TEXT"],
    ['sondages', 'categorie', "TEXT DEFAULT 'autre'"],
    ['sondages', 'ville', "TEXT"],
    ['sondages', 'pays', "TEXT"],
    ['sondages', 'region', "TEXT"],
    ['sondages', 'departement', "TEXT"],
    ['sondages', 'confidentialite', "TEXT DEFAULT 'anonyme'"],
    ['sondages', 'resultats_visibles', "TEXT DEFAULT 'apres_cloture'"],
    ['sondages', 'date_debut', "TEXT"],
    ['sondages', 'une_reponse_par_compte', "INTEGER DEFAULT 1"],
    ['sondages', 'modification_autorisee', "INTEGER DEFAULT 0"],
    ['sondages', 'fil_post_id', "INTEGER"],
    ['sondage_questions', 'description', "TEXT"],
    ['sondage_questions', 'min_label', "TEXT"],
    ['sondage_questions', 'max_label', "TEXT"],
    ['sondage_questions', 'min_val', "INTEGER DEFAULT 1"],
    ['sondage_questions', 'max_val', "INTEGER DEFAULT 5"],
    ['initiatives', 'reseau_visibilite', "TEXT DEFAULT 'prive'"],
    ['listes_diffusion', 'visibilite', "TEXT DEFAULT 'privee'"],
    ['listes_diffusion', 'mode', "TEXT DEFAULT 'figee'"],
    ['listes_diffusion', 'filtres_json', "TEXT"],
    ['listes_diffusion', 'archived', "INTEGER DEFAULT 0"],
    // Paiement réel Boutique (Stripe Checkout, même modèle que la Billetterie)
    ['commandes_vitrine', 'paiement_statut', "TEXT DEFAULT 'aucun'"],
    ['commandes_vitrine', 'montant_total', 'REAL'],
    ['commandes_vitrine', 'stripe_session_id', 'TEXT'],
    ['wallet_transactions', 'commande_vitrine_id', 'INTEGER'],
    // Module Cotisations & Adhésions
    ['wallet_transactions', 'adhesion_paiement_id', 'INTEGER'],
    ['adhesion_formules', 'media_type', 'TEXT'],
    ['adhesion_formules', 'media_url', 'TEXT'],
    ['adhesion_formules', 'media_duree_secondes', 'INTEGER'],
    // Module Votes sécurisés
    ['vote_scrutins', 'archived', 'INTEGER DEFAULT 0'],
    // Liste de stockage des participants (Cotisations & Adhésions ↔ Réseau professionnel)
    ['adhesion_formules', 'liste_stockage_id', 'INTEGER'],
    // Profil public enrichi des initiatives
    ['initiatives', 'publics_json', 'TEXT'],
    ['initiatives', 'besoins_json', 'TEXT'],
    ['initiatives', 'realisations_json', 'TEXT'],
    ['initiatives', 'stats_perso_json', 'TEXT'],
    ['initiatives', 'annee_creation', 'INTEGER'],
    ['initiatives', 'assistant_actif', 'INTEGER DEFAULT 1'],
    // Profil public enrichi des comptes personnels (miroir)
    ['users', 'publics_json', 'TEXT'],
    ['users', 'besoins_json', 'TEXT'],
    ['users', 'realisations_json', 'TEXT'],
    ['users', 'stats_perso_json', 'TEXT'],
    ['users', 'services_perso', 'TEXT'],
    ['users', 'zones_json', 'TEXT'],
    ['users', 'reseaux_json', 'TEXT'],
    ['users', 'annee_debut', 'INTEGER'],
    ['users', 'assistant_actif', 'INTEGER DEFAULT 1'],
    // Mise en relation : objet + image d'illustration
    ['demandes_contact', 'objet', 'TEXT'],
    ['demandes_contact', 'image_url', 'TEXT'],
    // Module Accréditations — file d'attente enrichie (commentaire interne, assignation, deadline)
    ['accred_demandes', 'commentaire_interne', 'TEXT'],
    ['accred_demandes', 'assignee_id', 'INTEGER'],
    ['accred_demandes', 'date_limite', 'TEXT'],
    ['accred_demandes', 'documents_json', 'TEXT'],
    ['accred_demandes', 'lettre_motivation', 'TEXT'],
    ['accred_demandes', 'video_url', 'TEXT'],
    ['accred_demandes', 'champs_specifiques_json', 'TEXT'],
    // Paiement Stripe réel pour l'inscription à une formation payante
    ['formation_inscriptions', 'paiement_statut', "TEXT DEFAULT 'paye'"],
    ['formation_inscriptions', 'stripe_session_id', 'TEXT'],
    // Module Diaspo Formation — extension de la table formations (jamais migrée en Postgres jusqu'ici)
    ['formations', 'statut', "TEXT DEFAULT 'brouillon'"],
    ['formations', 'mode_acces', "TEXT DEFAULT 'gratuit'"],
    ['formations', 'commission_pct', 'REAL DEFAULT 0'],
    ['formations', 'telecharge_autorise', 'INTEGER DEFAULT 0'],
    ['formations', 'image_url', 'TEXT'],
    ['formations', 'duree_heures', 'REAL'],
    ['formations', 'prerequis', 'TEXT'],
    ['formations', 'objectifs', 'TEXT'],
    ['formations', 'video_intro', 'TEXT'],
    ['formations', 'categorie', 'TEXT'],
    ['formations', 'motif_refus', 'TEXT'],
    ['formations', 'validateur_id', 'INTEGER'],
    ['formations', 'valide_at', 'TEXT'],
    ['formations', 'nb_inscrits', 'INTEGER DEFAULT 0'],
    ['formations', 'revenu_total', 'REAL DEFAULT 0'],
    // Assistant de création — Étape 1 : informations générales
    ['formations', 'sous_titre', 'TEXT'],
    ['formations', 'description_courte', 'TEXT'],
    ['formations', 'competences_acquises', 'TEXT'],
    ['formations', 'public_concerne', 'TEXT'],
    ['formations', 'nombre_modules_prevu', 'INTEGER'],
    ['formations', 'nombre_lecons_approx', 'INTEGER'],
    // Étape 2 : catégorie
    ['formations', 'sous_categorie', 'TEXT'],
    ['formations', 'mots_cles', 'TEXT'],
    ['formations', 'pays_concerne', 'TEXT'],
    ['formations', 'secteur_activite', 'TEXT'],
    // Étape 4 : tarification
    ['formations', 'devise', "TEXT DEFAULT 'EUR'"],
    ['formations', 'promo_active', 'INTEGER DEFAULT 0'],
    ['formations', 'promo_reduction_pct', 'REAL'],
    ['formations', 'promo_date_fin', 'TEXT'],
    // Étape 9 : accès
    ['formations', 'acces_type', "TEXT DEFAULT 'public'"],
    ['formations', 'acces_liste_id', 'INTEGER'],
    ['formations', 'banniere_url', 'TEXT'],
    // Étape 8 : certificat / Étape 11 : soumission
    ['formations', 'certificat_actif', 'INTEGER DEFAULT 0'],
    ['formations', 'certificat_modele', 'TEXT'],
    ['formations', 'certificat_conditions', 'TEXT'],
    ['formations', 'certificat_qr', 'INTEGER DEFAULT 1'],
    ['formations', 'date_soumission', 'TEXT'],
    // Moteur Accréditations v2 — champs étendus (jamais migrés en Postgres jusqu'ici,
    // ce qui empêchait aussi le seed du catalogue de s'appliquer correctement en prod)
    ['accred_definitions', 'duree_validite_jours', 'INTEGER'],
    ['accred_definitions', 'conditions_obtention', 'TEXT'],
    ['accred_definitions', 'documents_requis', "TEXT DEFAULT '[]'"],
    ['accred_definitions', 'renouvellement_auto', 'INTEGER DEFAULT 0'],
    ['accred_definitions', 'double_validation', 'INTEGER DEFAULT 0'],
    ['accred_definitions', 'controle_documentaire', 'INTEGER DEFAULT 0'],
    ['accred_definitions', 'date_application', 'TEXT'],
    ['accred_tarifs', 'reduction_annuelle_pct', 'REAL DEFAULT 0'],
    // Abonnement Utilisateur Premium — suivi Stripe
    ['user_accreditations', 'feature_slug', 'TEXT'],
    ['user_accreditations', 'stripe_subscription_id', 'TEXT'],
    ['user_accreditations', 'stripe_customer_id', 'TEXT'],
    // Module Recherche d'emploi & Stage
    ['offres', 'initiative_id', 'INTEGER'],
    ['offres', 'contrat', 'TEXT'],
    ['offres', 'duree_alternance', 'TEXT'],
    ['offres', 'region', 'TEXT'],
    ['offres', 'departement', 'TEXT'],
    ['offres', 'ville', 'TEXT'],
    ['offres', 'commune', 'TEXT'],
    ['offres', 'domaine', 'TEXT'],
    ['offres', 'niveau_experience', 'TEXT'],
    ['offres', 'niveau_etudes', 'TEXT'],
    ['offres', 'teletravail', 'INTEGER DEFAULT 0'],
    ['offres', 'temps', "TEXT DEFAULT 'plein'"],
    ['offres', 'salaire_min', 'REAL'],
    ['offres', 'salaire_max', 'REAL'],
    ['offres', 'salaire_communique', 'INTEGER DEFAULT 1'],
    ['offres', 'avantages', "TEXT DEFAULT '[]'"],
    ['offres', 'horaires', 'TEXT'],
    ['offres', 'debut_mission', 'TEXT'],
    ['offres', 'missions', "TEXT DEFAULT '[]'"],
    ['offres', 'diplome_requis', 'TEXT'],
    ['offres', 'langues_requises', "TEXT DEFAULT '[]'"],
    ['offres', 'permis_requis', 'TEXT'],
    ['offres', 'certifications_requises', "TEXT DEFAULT '[]'"],
    ['offres', 'pieces_demandees', 'TEXT DEFAULT \'["cv","lettre"]\''],
    ['offres', 'nb_vues', 'INTEGER DEFAULT 0'],
    ['formation_lecons', 'chapitre_id', 'INTEGER'],
    ['formation_lecons', 'telechargement_autorise', 'INTEGER DEFAULT 1'],
    ['formation_lecons', 'nb_pages', 'INTEGER'],
    ['formations', 'galerie_json', 'TEXT'],
    ['formations', 'resultats_attendus', 'TEXT'],
    ['formations', 'metier_concerne', 'TEXT'],
    ['formations', 'date_ouverture', 'TEXT'],
    ['formations', 'date_fermeture_inscriptions', 'TEXT'],
    ['formations', 'date_debut', 'TEXT'],
    ['formations', 'date_fin', 'TEXT'],
    ['formations', 'accessible_ordinateur', 'INTEGER DEFAULT 1'],
    ['formations', 'accessible_tablette', 'INTEGER DEFAULT 1'],
    ['formations', 'accessible_mobile', 'INTEGER DEFAULT 1'],
    ['formations', 'accessible_hors_ligne', 'INTEGER DEFAULT 0'],
    ['formations', 'temps_conseille', 'TEXT'],
    ['formations', 'badge', 'TEXT'],
    ['formations', 'langues_disponibles_json', 'TEXT'],
    ['formations', 'sous_titres', 'INTEGER DEFAULT 0'],
    ['formations', 'transcription', 'INTEGER DEFAULT 0'],
    ['formations', 'lecteur_ecran', 'INTEGER DEFAULT 0'],
    ['formations', 'police_dyslexie', 'INTEGER DEFAULT 0'],
    ['formations', 'formateur_bio', 'TEXT'],
    ['formations', 'formateur_fonction', 'TEXT'],
    ['formations', 'formateur_organisation', 'TEXT'],
    ['formations', 'formateur_annees_exp', 'INTEGER'],
    ['formations', 'formateur_site', 'TEXT'],
    ['formations', 'formateur_reseaux', 'TEXT'],
    ['formations', 'formateur_photo_url', 'TEXT'],
    ['formations', 'formateur_nom', 'TEXT'],
    ['formations', 'date_suppression_prevue', 'TEXT'],
    ['formations', 'suppression_alerte_envoyee', 'INTEGER DEFAULT 0'],
    ['formations', 'suppression_alerte_7j', 'INTEGER DEFAULT 0'],
    ['formations', 'suppression_alerte_3j', 'INTEGER DEFAULT 0'],
    ['formations', 'suppression_alerte_24h', 'INTEGER DEFAULT 0'],
    ['formations', 'date_archivage', 'TEXT'],
    ['formations', 'date_suppression_definitive', 'TEXT'],
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

  /* ── Accréditation "Créateur de formations" — jamais seedée en Postgres ──
     Bug racine identifié le 2026-07-15 : le seed dans db.js (seedCreateurFormations)
     s'exécute uniquement via l'API synchrone better-sqlite3 (db.prepare(...).run(...))
     au chargement du module — il ne s'exécute donc jamais contre la base Postgres de
     production, qui passe par pg-init.js. Contrairement aux 5 autres accréditations
     visibles en prod (créées manuellement par l'admin via l'UI), celle-ci n'existait
     nulle part côté Postgres, empêchant toute demande d'accréditation "Créateur de
     formations" côté utilisateurs. Idempotent via ON CONFLICT (type) DO NOTHING —
     n'écrase rien si l'admin l'a entre-temps recréée manuellement. */
  try {
    const { rows: insRows } = await pool.query(
      `INSERT INTO accred_definitions
        (type,label,emoji,description,droits,couleur,couleur_bg,couleur_border,couleur_text,module,ordre,conditions_obtention,documents_requis)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (type) DO NOTHING RETURNING id`,
      [
        'createur_formations', 'Créateur de formations', '🎓',
        "Autorisation de proposer des formations dans l'espace Diaspo Formation. Permet de créer, publier et gérer des formations avec suivi des inscriptions et des revenus.",
        JSON.stringify(['Créer et publier des formations','Suivre les inscriptions et les revenus',"Choisir le mode d'accès (gratuit, payant, payant sauf membres)",'Consulter les avis des apprenants','Émettre des attestations de formation']),
        '#f59e0b', '#fffbeb', '#f59e0b', '#92400e', 'diaspo_formation', 7,
        "Disposer d'une expertise démontrable dans le domaine de formation visé (diplôme, certification professionnelle ou expérience équivalente) et s'engager à respecter la charte qualité des formateurs Diaspo'Actif.",
        JSON.stringify(["Pièce d'identité", "Justificatif de diplôme ou certification (si applicable)", "CV ou portfolio détaillant l'expérience professionnelle"]),
      ]
    );
    if (insRows[0]) {
      const defId = insRows[0].id;
      for (const role of ['initiative', 'collectivite', 'utilisateur']) {
        await pool.query("INSERT INTO accred_regles (accred_id,role,mode) VALUES ($1,$2,'sur_demande')", [defId, role]);
        await pool.query("INSERT INTO accred_tarifs (accred_id,role,type_tarif,montant,devise,validation_admin) VALUES ($1,$2,'gratuit',0,'EUR',1)", [defId, role]);
      }
      console.log('[pg-init] Accréditation "createur_formations" seedée (id=' + defId + ').');
    }
  } catch (e) { console.error('[pg-init migration] seed createur_formations:', e.message); }

  /* ── Accréditation "Utilisateur Abonné" — même bug racine que createur_formations :
     le seed dans db.js (seedUtilisateurAbonne) ne s'exécute que via better-sqlite3, jamais
     contre Postgres. Idempotent via ON CONFLICT (type) DO NOTHING. */
  try {
    const { rows: insRows } = await pool.query(
      `INSERT INTO accred_definitions
        (type,label,emoji,description,droits,couleur,couleur_bg,couleur_border,couleur_text,module,ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (type) DO NOTHING RETURNING id`,
      [
        'utilisateur_abonne', 'Utilisateur Abonné', '⭐',
        "Abonnement individuel qui débloque le Réseau Pro, les Business Plans et Mes projets.",
        JSON.stringify(['Accès au Réseau Pro','Création de Business Plans','Création de projets']),
        '#7c3aed', '#f5f3ff', '#7c3aed', '#4c1d95', 'compte_utilisateur', 1,
      ]
    );
    if (insRows[0]) {
      const defId = insRows[0].id;
      // Une seule ligne accred_tarifs par rôle (UNIQUE(accred_id,role)) : prix mensuel +
      // réduction annuelle en %, le prix annuel se calcule à la volée (50€ = -16.5% vs 12×4.99€).
      await pool.query("INSERT INTO accred_regles (accred_id,role,mode) VALUES ($1,'utilisateur','automatique')", [defId]);
      await pool.query("INSERT INTO accred_tarifs (accred_id,role,type_tarif,montant,devise,validation_admin,reduction_annuelle_pct) VALUES ($1,'utilisateur','mensuel',4.99,'EUR',0,16.5)", [defId]);
      console.log('[pg-init] Accréditation "utilisateur_abonne" seedée (id=' + defId + ').');
    }
  } catch (e) { console.error('[pg-init migration] seed utilisateur_abonne:', e.message); }

  /* Fix-up idempotent (Postgres) : même correction que db.js si le premier déploiement
     avait tourné avec le bug mode='payant' / double INSERT accred_tarifs. */
  try {
    const { rows: uaRows } = await pool.query("SELECT id FROM accred_definitions WHERE type='utilisateur_abonne'");
    if (uaRows[0]) {
      const uaId = uaRows[0].id;
      const { rows: uaRegle } = await pool.query("SELECT id FROM accred_regles WHERE accred_id=$1 AND role='utilisateur'", [uaId]);
      if (!uaRegle[0]) await pool.query("INSERT INTO accred_regles (accred_id,role,mode) VALUES ($1,'utilisateur','automatique')", [uaId]);
      await pool.query("UPDATE accred_tarifs SET reduction_annuelle_pct=16.5 WHERE accred_id=$1 AND role='utilisateur' AND (reduction_annuelle_pct IS NULL OR reduction_annuelle_pct=0)", [uaId]);
    }
  } catch (e) { console.error('[pg-init migration] fixup utilisateur_abonne:', e.message); }

  /* ── Module Accréditations : élargissement des CHECK constraints ──
     Bug réel : compte_accreditations.type / demandes_accreditation.type limitaient les
     valeurs à 2 types alors que le code en insère 4 (observatoire_diaspora, institutionnelle).
     Postgres nomme ses contraintes CHECK "<table>_<colonne>_check" par défaut. On les
     supprime (si présentes, best-effort) avant de les recréer plus larges / de les retirer. */
  const checkFixes = [
    { table: 'compte_accreditations', constraint: 'compte_accreditations_type_check', addBack: null },
    { table: 'demandes_accreditation', constraint: 'demandes_accreditation_type_check', addBack: null },
    { table: 'user_accreditations', constraint: 'user_accreditations_statut_check',
      addBack: "CHECK (statut IN ('active','suspendue','gelee','retiree','expiree'))" },
    { table: 'accred_demandes', constraint: 'accred_demandes_statut_check',
      addBack: "CHECK (statut IN ('brouillon','en_attente','deposee','en_cours_analyse','info_complementaire_demandee','approuvee','refusee'))" },
  ];
  try {
    const { rows: cfRows } = await pool.query("SELECT id FROM accred_definitions WHERE type='createur_formations'");
    if (cfRows[0]) {
      const cfId = cfRows[0].id;
      const { rows: regleRows } = await pool.query("SELECT id FROM accred_regles WHERE accred_id=$1 AND role='utilisateur'", [cfId]);
      if (!regleRows[0]) {
        await pool.query("INSERT INTO accred_regles (accred_id,role,mode) VALUES ($1,'utilisateur','sur_demande')", [cfId]);
        await pool.query("INSERT INTO accred_tarifs (accred_id,role,type_tarif,montant,devise,validation_admin) VALUES ($1,'utilisateur','gratuit',0,'EUR',1)", [cfId]);
      }
    }
  } catch (e) { console.error('[pg-init migration] ouvrir createur_formations aux utilisateurs:', e.message); }

  try {
    await pool.query(
      `UPDATE accred_definitions SET conditions_obtention=$1, documents_requis=$2
       WHERE type='createur_formations' AND (conditions_obtention IS NULL OR conditions_obtention='')`,
      [
        "Disposer d'une expertise démontrable dans le domaine de formation visé (diplôme, certification professionnelle ou expérience équivalente) et s'engager à respecter la charte qualité des formateurs Diaspo'Actif.",
        JSON.stringify(["Pièce d'identité", "Justificatif de diplôme ou certification (si applicable)", "CV ou portfolio détaillant l'expérience professionnelle"]),
      ]
    );
  } catch (e) { console.error('[pg-init migration] conditions_obtention createur_formations:', e.message); }

  for (const { table, constraint, addBack } of checkFixes) {
    try { await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`); } catch (e) {
      console.error(`[pg-init migration] drop constraint ${constraint}:`, e.message);
    }
    if (addBack) {
      try { await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} ${addBack}`); } catch (e) {
        console.error(`[pg-init migration] add constraint ${constraint}:`, e.message);
      }
    }
  }
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
