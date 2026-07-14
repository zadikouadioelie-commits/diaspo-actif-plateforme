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
