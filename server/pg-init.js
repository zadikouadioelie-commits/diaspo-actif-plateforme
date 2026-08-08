/* ===========================================================
   DIASPO'ACTIF — Initialisation schéma PostgreSQL (Neon)
   Lit les blocs db.exec() depuis db.js et les exécute via pg.
   Appelé au cold start Vercel quand DATABASE_URL est définie.
   =========================================================== */
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const pg     = require('./db-pg');

let _initialized = false;

/* Exécute tous les blocs db.exec(`CREATE TABLE...`) trouvés dans db.js (hors ALTER).
   Idempotent grâce à `CREATE TABLE IF NOT EXISTS` — donc appelable SANS RISQUE
   même sur une base déjà initialisée : les tables existantes sont ignorées,
   seules les NOUVELLES tables (ajoutées après le premier déploiement) sont créées.
   Corrige le bug racine : avant, une base déjà initialisée ne recevait jamais
   les nouvelles tables ajoutées ultérieurement dans db.js (ex: error_logs). */
async function createMissingTables(pool) {
  const echecs = [];
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
    /* Les commentaires sont retirés AVANT le découpage, et non après.

       Cause racine du 2026-07-25 : un commentaire de db.js contenait un point-virgule
       (« ...voir PEUT_INITIER) ; disponible aussi pour tout compte... »). Le découpage le
       coupait en deux, et le morceau suivant commençait par « disponible aussi... » au lieu
       de CREATE TABLE. Le filtre l'écartait, et demandes_contact n'a JAMAIS été soumise à
       PostgreSQL — pendant que ses index, eux, partaient bien et échouaient. Table absente
       en production pendant des semaines, sans le moindre signal.

       Une ponctuation dans une phrase en français ne doit pas pouvoir supprimer une table. */
    const sansCommentaires = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
    const statements = sansCommentaires.split(';').map(s => s.trim()).filter(Boolean);
    // On ignore les commentaires SQL (-- ... et /* ... */) en tête de bloc avant de tester le préfixe
    // CREATE, sinon un commentaire juste avant CREATE TABLE fait échouer le filtre (table jamais créée
    // sur Postgres). Bug réel observé sur abonnements_collectivite (commentaire /* */ non filtré).
    const stripLeadingComments = s => s.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))+/g, '').trim();
    const createOnly = statements.filter(s => /^CREATE (TABLE|INDEX|UNIQUE INDEX)/i.test(stripLeadingComments(s)));
    if (!createOnly.length) continue;
    for (const stmt of createOnly) {
      try {
        /* pool.query et NON pg.exec() : exec() intercepte toute erreur et se contente de
           l'ecrire en console (db-pg.js). Le try/catch ci-dessous ne voyait donc jamais
           rien, et le rapport annoncait « rien a reparer » alors que demandes_contact
           n'avait jamais ete creee. C'est ce silence qui a masque la panne des semaines. */
        await pool.query(pg.toPg(stmt));
      } catch (e) {
        /* Une table qui ne se crée pas est une panne SILENCIEUSE : la route qui l'utilise
           renvoie 500 à chaque appel, sans que rien ne le signale. Cas réel du 2026-07-25 —
           demandes_contact absente en production, découvert par un utilisateur en cliquant
           sur « Écrire ». La console Vercel ne se consulte pas ; le journal d'erreurs si.
           On y écrit donc l'objet fautif ET le message PostgreSQL exact. */
        const objet = (stmt.match(/CREATE (?:TABLE|INDEX|UNIQUE INDEX)(?: IF NOT EXISTS)? ([a-zA-Z0-9_]+)/i) || [])[1] || '(inconnu)';
        echecs.push({ objet, erreur: e.message });
        console.error(`[pg-init] createMissingTables — échec sur ${objet}:`, e.message);
        try {
          /* pool.query et non pg.exec() : exec() n'accepte pas de paramètres et découpe
             sur « ; » — un message PostgreSQL en contenant un casserait l'insertion. */
          await pool.query(
            "INSERT INTO error_logs (message, stack, context, url, method) VALUES ($1,$2,$3,$4,$5)",
            [`Création impossible : ${objet} — ${e.message}`, stmt.slice(0, 2000), 'pg-init/createMissingTables', null, null]
          );
        } catch (_) { /* si error_logs elle-même manque, la console reste le dernier recours */ }
      }
    }
  }
  return echecs;
}

/* Réparation du schéma à la demande, déclenchée depuis le tableau de bord administrateur.

   Pourquoi une route dédiée alors que pgInit() fait déjà ce travail au démarrage :
   pgInit() n'agit que sur l'instance qui décroche le verrou consultatif, et ses échecs
   partent dans une console Vercel que personne ne consulte. Résultat observé le
   2026-07-25 : une table absente pendant des semaines, sa route en 500 permanent,
   aucun signal. Ici l'exécution est immédiate, sur l'instance qui répond, et le
   message PostgreSQL exact revient dans la réponse HTTP — le diagnostic et la
   réparation dans le même geste, plutôt qu'une hypothèse suivie d'un déploiement. */
/* Colonnes déclarées dans les CREATE TABLE de db.js, table par table.

   Angle mort majeur : `CREATE TABLE IF NOT EXISTS` ne modifie JAMAIS une table existante.
   Une colonne ajoutée à un CREATE TABLE après le premier déploiement n'atteint donc
   jamais la production, et rien ne le signale — la table existe, schema-check la voit,
   le bouton Réparer n'a rien à créer, et pourtant chaque requête qui touche la nouvelle
   colonne renvoie 500. C'est le cas de demandes_contact, constaté le 2026-07-25 :
   demandes_contact_config (même bloc) répondait 200 pendant que demandes_contact
   échouait systématiquement.

   COLONNES_MIGRATION couvrait ce besoin, mais uniquement pour les colonnes qu'on pense
   à y recopier à la main. Ici on lit la source de vérité : la définition elle-même. */
function colonnesDeclareesParTable() {
  /* Commentaires retirés d'abord : sans cela l'expression débordait de la table et avalait
     du code JavaScript, produisant des « colonnes » fantômes (event_codes_promo.vide,
     wallet_transactions.sinon — « vide » et « sinon » venant de phrases en français).
     Elles échouaient ensuite bruyamment dans le rapport de réparation. */
  const dbSrc = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
  const parTable = {};
  const reTable = /CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\n\s*\)\s*;/g;
  let m;
  while ((m = reTable.exec(dbSrc)) !== null) {
    const table = m[1];
    const corps = m[2];
    const colonnes = [];
    let profondeur = 0, courante = '';
    for (const c of corps) {
      if (c === '(') profondeur++;
      else if (c === ')') profondeur--;
      if (c === ',' && profondeur === 0) { colonnes.push(courante); courante = ''; }
      else courante += c;
    }
    colonnes.push(courante);
    parTable[table] = colonnes
      .map(l => l.replace(/--[^\n]*/g, '').trim())
      .filter(Boolean)
      // On ignore les contraintes de table : ce ne sont pas des colonnes.
      .filter(l => !/^(PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK|CONSTRAINT)\b/i.test(l))
      .map(l => {
        const nom = (l.match(/^([a-zA-Z0-9_]+)/) || [])[1];
        return nom ? { nom, definition: l.slice(nom.length).trim() } : null;
      })
      .filter(Boolean);
  }
  return parTable;
}

/* Ajoute les colonnes déclarées mais absentes des tables déjà existantes. */
async function ajouterColonnesManquantes(pool) {
  const ajoutees = [], echecs = [];
  const declarees = colonnesDeclareesParTable();
  const { rows: tablesReelles } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
  );
  const existe = new Set(tablesReelles.map(r => r.table_name));

  for (const [table, colonnes] of Object.entries(declarees)) {
    if (!existe.has(table)) continue;   // absente : c'est createMissingTables qui s'en charge
    const { rows } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table]
    );
    const presentes = new Set(rows.map(r => r.column_name.toLowerCase()));
    for (const c of colonnes) {
      if (presentes.has(c.nom.toLowerCase())) continue;
      /* La définition passe par le même traducteur SQLite→Postgres que le reste du schéma,
         sinon des types comme INTEGER PRIMARY KEY AUTOINCREMENT arriveraient tels quels. */
      const def = pg.toPg(`X ${c.definition}`).replace(/^X\s*/, '').replace(/\bREFERENCES\b[\s\S]*$/i, '').trim();
      try {
        /* pool.query et non pg.exec(), pour la meme raison : exec() avale les erreurs. */
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${c.nom} ${def}`);
        ajoutees.push(`${table}.${c.nom}`);
      } catch (e) {
        echecs.push({ objet: `${table}.${c.nom}`, erreur: e.message });
      }
    }
  }
  return { ajoutees, echecs };
}

async function listerTables(pool) {
  const { rows } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  return rows.map(r => r.table_name);
}

async function reparerSchema() {
  const { pool } = pg;
  const avant  = await listerTables(pool);
  const echecs = await createMissingTables(pool);
  let migration = 'ok';
  try { await migratePg(pool); } catch (e) { migration = e.message; }
  /* Après les tables, les colonnes : une table créée avant l'ajout d'une colonne à sa
     définition ne l'obtient jamais autrement (CREATE TABLE IF NOT EXISTS ne modifie rien). */
  let colonnes = { ajoutees: [], echecs: [] };
  try { colonnes = await ajouterColonnesManquantes(pool); }
  catch (e) { colonnes.echecs.push({ objet: '(analyse des colonnes)', erreur: e.message }); }
  const apres = await listerTables(pool);

  /* Contrôle de lecture réelle. Compter les tables ne suffit pas : le 2026-07-25, le rapport
     annonçait « 294 sur 294, rien à réparer » pendant que toute requête sur demandes_contact
     renvoyait 500. Une table peut exister et rester illisible (colonne absente, type
     incompatible). On interroge donc chacune pour de bon, et on remonte le message PostgreSQL
     tel quel — c'est lui qu'on cherche depuis le début, et rien ne le remplace. */
  const declarees = Object.keys(colonnesDeclareesParTable());
  const presentes = new Set(apres);
  const tables_absentes = declarees.filter(t => !presentes.has(t));
  const tables_illisibles = [];
  for (const t of declarees) {
    if (!presentes.has(t)) continue;
    try { await pool.query(`SELECT * FROM ${t} LIMIT 1`); }
    catch (e) { tables_illisibles.push({ table: t, erreur: e.message }); }
  }

  return {
    tables_avant: avant.length,
    tables_apres: apres.length,
    tables_creees: apres.filter(t => !avant.includes(t)),
    colonnes_ajoutees: colonnes.ajoutees,
    tables_absentes,
    tables_illisibles,
    echecs: [...echecs, ...colonnes.echecs],
    migration,
  };
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

/* Empreinte du schéma attendu — pour ne pas rejouer 877 requêtes à chaque réveil du site.

   Mesuré le 2026-07-25 : 290 CREATE TABLE/INDEX + 587 ALTER TABLE ADD COLUMN étaient
   soumis à CHAQUE démarrage à froid, sur un pool de 5 connexions. Vercel éteint le site
   quand personne ne l'utilise et le rallume au premier visiteur, donc des dizaines de fois
   par jour. D'où les « timeout exceeded when trying to connect » et « Query read timeout »
   qui subsistaient après la correction du bloc Chatbot.

   Or le schéma ne change qu'aux déploiements qui le modifient. On enregistre donc une
   empreinte de sa définition : tant qu'elle est identique, il n'y a rien à rejouer. Un
   déploiement touchant db.js ou la liste des colonnes change l'empreinte et relance les
   migrations une fois — puis plus rien jusqu'au suivant. */
function empreinteSchema() {
  const dbSrc = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
  return crypto.createHash('sha1')
    .update(dbSrc)
    .update(JSON.stringify(COLONNES_MIGRATION))
    .digest('hex');
}

const CLE_EMPREINTE = 'schema_empreinte';

async function empreinteEnregistree(client) {
  try {
    const { rows } = await client.query('SELECT valeur FROM parametres_plateforme WHERE cle=$1', [CLE_EMPREINTE]);
    return rows[0] ? rows[0].valeur : null;
  } catch (e) { return null; }   // table pas encore créée : premier démarrage
}

async function enregistrerEmpreinte(client, empreinte) {
  try {
    await client.query(
      `INSERT INTO parametres_plateforme (cle, valeur, type, description) VALUES ($1,$2,'texte',$3)
       ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`,
      [CLE_EMPREINTE, empreinte, "Empreinte du schéma appliqué — évite de rejouer les migrations à chaque démarrage à froid"]
    );
  } catch (e) { console.error('[pg-init] empreinte non enregistrée :', e.message); }
}

/* Migration ponctuelle : remplacer l'ANCIENNE table demandes_contact par la nouvelle.

   L'ancienne portait motif/urgence/expires_at, dont motif NOT NULL — le module « Établir
   contact » n'en enregistre aucun, ses insertions échoueraient donc. Or CREATE TABLE
   IF NOT EXISTS ne modifie jamais une table existante : sans cette étape, la nouvelle
   définition ne serait jamais appliquée et la panne serait silencieuse.

   On reconnaît l'ancienne forme à sa colonne « motif », absente de la nouvelle. La
   suppression du contenu a été explicitement demandée le 2026-07-25 ; ces demandes
   n'avaient de toute façon plus de module pour les traiter. */
async function remplacerAncienneTableDemandesContact(client) {
  try {
    const { rows } = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='demandes_contact' AND column_name='motif'"
    );
    if (!rows.length) return;                       // absente, ou déjà à la nouvelle forme
    await client.query('DROP TABLE IF EXISTS demandes_contact CASCADE');
    console.log('[pg-init] ancienne table demandes_contact remplacée (module Établir contact).');
  } catch (e) {
    console.error('[pg-init] remplacement de demandes_contact impossible :', e.message);
  }
}

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
      /* Schéma inchangé depuis le dernier passage réussi : rien à rejouer. Une lecture
         au lieu de 877 écritures — c'est ce qui saturait le pool à chaque réveil du site. */
      const empreinte = empreinteSchema();
      if (await empreinteEnregistree(client) === empreinte) {
        _initialized = true;
        return;
      }

      await remplacerAncienneTableDemandesContact(client);

      // Vérifie si les tables existent déjà
      const { rows } = await client.query(
        "SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public'"
      );
      let echecs;
      if (rows[0].cnt > 3) {
        /* Schéma déjà en place — créer les tables manquantes (nouvelles depuis le dernier
           déploiement) + migrations de colonnes + corriger les comptes démo */
        echecs = await createMissingTables(pool);
        await migratePg(pool);
        await seedPg(pool);
      } else {
        console.log('[pg-init] Création du schéma Postgres...');
        echecs = await createMissingTables(pool);

        console.log('[pg-init] Schéma créé. Migrations + seeding...');
        await migratePg(pool);
        await seedPg(pool);
        console.log('[pg-init] ✅ Base de données Postgres prête.');
      }

      /* Empreinte enregistrée UNIQUEMENT si tout est passé. Sinon on rejoue au prochain
         démarrage : une création ratée ne doit jamais être figée comme « déjà faite »,
         c'est exactement ce qui a rendu demandes_contact absente pendant des semaines. */
      if (!echecs || echecs.length === 0) await enregistrerEmpreinte(client, empreinte);
      else console.error(`[pg-init] ${echecs.length} échec(s) — empreinte non enregistrée, migrations rejouées au prochain démarrage.`);
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
/* Liste unique des colonnes attendues — partagee entre la migration et le controle
   post-deploiement, pour qu'elles ne puissent jamais diverger. */
const COLONNES_MIGRATION = [
    /* Module d'affiliation Initiative → Utilisateur (2026-07-27) — miroir de l'ALTER db.js. */
    ['initiative_membres', 'message', 'TEXT'],
    /* Rencontres Diaspo'Actif — miroir de l'ALTER ajouté dans db.js. Sans cette ligne,
       la colonne n'existerait qu'en local et toute non-validation ferait échouer la
       route en production. */
    ['rencontres_diaspoactif', 'date_reouverture', 'TEXT'],
    ['rencontres_diaspoactif', 'pieces_json', "TEXT DEFAULT '[]'"],

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
    ['initiatives', 'vitrine_tel_visible', 'INTEGER DEFAULT 0'],
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
    ['publicites', 'charte_acceptee_le', 'TEXT'],
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
    // Module "Paramètres Vitrine" v2 : type de vitrine (modèle) + registre des modules actif/masqué/ordre
    ['initiatives', 'vitrine_type', 'TEXT'],
    ['initiatives', 'vitrine_modules_json', "TEXT DEFAULT '{}'"],
    ['initiatives', 'vitrine_temoignages_json', 'TEXT'],
    ['initiatives', 'vitrine_vision_objectifs', 'TEXT'],
    ['initiatives', 'vitrine_resultats_impact_json', 'TEXT'],
    ['initiatives', 'vitrine_expertise_json', 'TEXT'],
    ['initiatives', 'vitrine_certifications_json', 'TEXT'],
    ['initiatives', 'vitrine_devis_active', 'INTEGER DEFAULT 0'],
    ['initiatives', 'vitrine_partenariat_active', 'INTEGER DEFAULT 0'],
    ['initiatives', 'vitrine_style_json', "TEXT DEFAULT '{}'"],
    ['initiatives', 'slogan', 'TEXT'],
    ['initiatives', 'vitrine_draft_json', "TEXT DEFAULT '{}'"],
    // Modules "Galerie vidéos", "Portfolio", "Réservation" — miroir de server/db.js
    ['initiatives', 'vitrine_videos_json', 'TEXT'],
    ['initiatives', 'vitrine_portfolio_json', 'TEXT'],
    ['initiatives', 'vitrine_reservation_json', 'TEXT'],
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
    /* Colonnes retirées le 2026-07-25 avec la table demandes_contact. */
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
    // Relances de progression (Lot 1 — notifications plateforme)
    ['formation_inscriptions', 'derniere_activite_le', 'TEXT'],
    ['formation_inscriptions', 'relance_25_le', 'TEXT'],
    ['formation_inscriptions', 'relance_50_le', 'TEXT'],
    ['formation_inscriptions', 'relance_75_le', 'TEXT'],
    ['formation_inscriptions', 'relance_inactivite_le', 'TEXT'],
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
    ['offres', 'recruteur_contact', 'TEXT'],
    // Module Gestion des candidatures
    ['offres_candidatures', 'tags', "TEXT DEFAULT '[]'"],
    ['offres_candidatures', 'documents_demande_le', 'TEXT'],
    ['offres_candidatures', 'documents_demande_message', 'TEXT'],
    ['offres_candidatures', 'documents_recus_json', "TEXT DEFAULT '[]'"],
    ['offres_candidatures', 'embauche_le', 'TEXT'],
    ['offres_candidatures', 'source', "TEXT DEFAULT 'plateforme'"],
    ['offres', 'relance_bientot_expiree_le', 'TEXT'],
    ['offres', 'relance_expiree_le', 'TEXT'],
    // 🥇 Découverte Premium — flags de relance (évite les doublons)
    ['user_accreditations', 'relance_10j_le', 'TEXT'],
    ['user_accreditations', 'relance_5j_le', 'TEXT'],
    ['user_accreditations', 'relance_3j_le', 'TEXT'],
    ['user_accreditations', 'relance_24h_le', 'TEXT'],
    ['user_accreditations', 'relance_expire_le', 'TEXT'],
    // Paliers J-60 à J-7 (fin d'abonnement Premium) — miroir de server/db.js
    ['user_accreditations', 'relance_60j_le', 'TEXT'],
    ['user_accreditations', 'relance_30j_le', 'TEXT'],
    ['user_accreditations', 'relance_15j_le', 'TEXT'],
    ['user_accreditations', 'relance_7j_le', 'TEXT'],
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
    ['formations', 'logo_url', 'TEXT'],
    // Module Signalement de compte & Gestion des litiges — suspension effective
    ['users', 'suspendu_jusqu_au', 'TEXT'],
    ['users', 'suspendu_definitif', 'INTEGER DEFAULT 0'],
    ['signalements', 'origine_migration', 'TEXT'],
    ['users', 'penalite_disciplinaire', 'INTEGER DEFAULT 0'],
    // Module Premium — délai de grâce après échec de prélèvement (même pattern que pub_abonnements)
    ['user_accreditations', 'grace_until', 'TEXT'],
    // Rubrique Vitrines — date de dernière modification publique de la vitrine
    ['initiatives', 'updated_at', 'TEXT'],
    // Module Adhésions — ouverture/fermeture globale (miroir de l'ALTER db.js)
    ['initiatives', 'adhesions_ouvertes', 'INTEGER DEFAULT 1'],
    // Module Adhésions — délais de relance personnalisables (miroir de l'ALTER db.js)
    ['initiatives', 'adhesion_relances_jours', "TEXT DEFAULT '[30,7,0,-1]'"],
    // Module Adhésions — modèles de texte personnalisables (miroir de l'ALTER db.js)
    ['initiatives', 'adhesion_modele_relance', 'TEXT'],
    ['initiatives', 'adhesion_modele_recu', 'TEXT'],
    // Module Adhésions — mode de validité individuel/collectif (miroir de l'ALTER db.js)
    ['adhesion_formules', 'mode_validite', "TEXT DEFAULT 'individuel'"],
    ['adhesion_formules', 'periode_collective_debut', 'TEXT'],
    ['adhesion_formules', 'periode_collective_fin', 'TEXT'],
    // Module Adhésions — incrément 1 (2026-08-07) : durée personnalisée, renouvellement auto
    // de campagne, places limitées (miroir des ALTER db.js)
    ['adhesion_formules', 'duree_valeur', 'INTEGER'],
    ['adhesion_formules', 'duree_unite', "TEXT DEFAULT 'mois'"],
    ['adhesion_formules', 'duree_illimitee', 'INTEGER DEFAULT 0'],
    ['adhesion_formules', 'renouvellement_auto_collectif', 'INTEGER DEFAULT 0'],
    ['adhesion_formules', 'max_adherents', 'INTEGER'],
    // Module Adhésions — incrément 2 (2026-08-07) : formulaire personnalisable (miroir des ALTER db.js)
    ['adhesion_formules', 'texte_intro', 'TEXT'],
    ['adhesion_formules', 'conditions_adhesion', 'TEXT'],
    ['adhesion_formules', 'reglement_pdf_url', 'TEXT'],
    ['adhesion_formules', 'statuts_pdf_url', 'TEXT'],
    ['adhesion_formules', 'champs_config_json', "TEXT DEFAULT '{}'"],
    ['adhesion_formules', 'champs_custom_json', "TEXT DEFAULT '[]'"],
    ['adhesion_membres', 'reponses_json', "TEXT DEFAULT '{}'"],
    // Module Adhésions — incrément 6 (2026-08-07) : sync avec le module Affiliations (miroir des ALTER db.js)
    ['initiative_membres', 'formule_id', 'INTEGER'],
    ['initiative_membres', 'mode_adhesion', 'TEXT'],
    ['initiative_membres', 'date_debut', 'TEXT'],
    ['initiative_membres', 'date_fin', 'TEXT'],
    ['initiative_membres', 'visible_publiquement', 'INTEGER DEFAULT 1'],
    ['initiatives', 'affichage_membres', "TEXT DEFAULT 'tous'"],
    // Liste générale "Tous les membres" (2026-08-08) : miroir de l'ALTER db.js
    ['initiatives', 'liste_membres_generale_id', 'INTEGER'],
];

async function migratePg(pool) {
  const cols = COLONNES_MIGRATION;
  for (const [table, col, type] of cols) {
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    } catch (e) {
      console.error(`[pg-init migration] ${table}.${col}:`, e.message);
    }
  }
  // Rubrique Vitrines — initialise updated_at pour les initiatives déjà existantes (jamais
  // modifiées depuis), sinon elles resteraient NULL et disparaîtraient toujours en dernier
  // du tri "Dernière mise à jour" au lieu de refléter leur date de création.
  try { await pool.query(`UPDATE initiatives SET updated_at=created_at WHERE updated_at IS NULL`); } catch(_) {}
  // Index unique da_id (comme en SQLite)
  try { await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_da_id ON users(da_id) WHERE da_id IS NOT NULL`); } catch(_) {}
  try { await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_initiatives_da_id ON initiatives(da_id) WHERE da_id IS NOT NULL`); } catch(_) {}

  /* ── Accréditation "Créateur de formations" retirée ──
     La création de formations est désormais réservée aux comptes Premium
     (accréditation utilisateur_abonne / initiative_abonne), plus besoin de demande séparée.
     Nettoyage idempotent des définitions résiduelles si l'accréditation avait déjà été seedée. */
  try {
    const { rows: defRows } = await pool.query("SELECT id FROM accred_definitions WHERE type='createur_formations'");
    if (defRows[0]) {
      const defId = defRows[0].id;
      await pool.query("DELETE FROM accred_regles WHERE accred_id=$1", [defId]);
      await pool.query("DELETE FROM accred_tarifs WHERE accred_id=$1", [defId]);
      await pool.query("DELETE FROM accred_demandes WHERE accred_id=$1", [defId]);
      await pool.query("DELETE FROM user_accreditations WHERE accred_id=$1", [defId]);
      await pool.query("DELETE FROM accred_definitions WHERE id=$1", [defId]);
      console.log('[pg-init] Accréditation "createur_formations" retirée (id=' + defId + ').');
    }
    await pool.query("DELETE FROM compte_accreditations WHERE type='createur_formations'");
  } catch (e) { console.error('[pg-init migration] retrait createur_formations:', e.message); }

  /* ── Accréditations mobilisation_active / createur_opportunites / observatoire_diaspora /
     institutionnelle / gestion_associations — même bug racine que createur_formations : jamais
     seedées en Postgres (existent seulement si un admin les a recréées manuellement via l'UI).
     On les seed ici (idempotent, ON CONFLICT DO NOTHING) ET on retire le flux « demande à
     valider par un admin » : validation_admin=0 pour toutes, qu'elles viennent d'être seedées
     ou qu'elles existaient déjà (créées manuellement avec validation_admin=1). */
  try {
    const SEED = [
      { type:'mobilisation_active', label:'Mobilisation Active', emoji:'📢',
        description:"Autorisation d'exercer des fonctions de mobilisation au sein de Diaspo'Actif.",
        droits:['Participer à des missions rémunérées','Répondre à des appels de mobilisation','Réaliser des enquêtes de terrain','Participer à des campagnes de sensibilisation'],
        couleur:'#f59e0b',bg:'#fffbeb',border:'#f59e0b',text:'#92400e', module:null, ordre:1,
        regles:[['utilisateur','sur_demande'],['initiative','sur_demande']],
        tarifs:[['utilisateur','paiement_unique',19],['initiative','paiement_unique',29]] },
      { type:'createur_opportunites', label:"Créateur d'Opportunités", emoji:'💼',
        description:"Autorisation de publier des offres et de créer des opportunités professionnelles.",
        droits:['Publier des offres (emplois, stages, marchés)','Mettre en relation des acteurs','Participer à des programmes de recrutement'],
        couleur:'#3b82f6',bg:'#eff6ff',border:'#3b82f6',text:'#1e40af', module:null, ordre:2,
        regles:[['initiative','sur_demande'],['collectivite','sur_demande']],
        tarifs:[['initiative','paiement_unique',39],['collectivite','gratuit',0]] },
      { type:'observatoire_diaspora', label:'Observatoire Diaspora', emoji:'📊',
        description:"Autorisation d'accéder aux données statistiques et outils d'analyse de la plateforme.",
        droits:['Accéder aux statistiques autorisées','Consulter les tableaux de bord','Réaliser des consultations publiques','Obtenir des rapports périodiques'],
        couleur:'#059669',bg:'#f0fdf4',border:'#059669',text:'#065f46', module:null, ordre:3,
        regles:[['collectivite','sur_demande']], tarifs:[['collectivite','gratuit',0]] },
      { type:'institutionnelle', label:'Institutionnelle', emoji:'🏛️',
        description:"Autorisation d'exercer des fonctions institutionnelles sur la plateforme.",
        droits:['Diffuser des communications officielles','Organiser des consultations publiques','Interagir avec un territoire donné','Publier des avis et informations officiels'],
        couleur:'#7c3aed',bg:'#f5f3ff',border:'#7c3aed',text:'#4c1d95', module:null, ordre:4,
        regles:[['collectivite','sur_demande']], tarifs:[['collectivite','gratuit',0]] },
      { type:'gestion_associations', label:'Gestion des Associations', emoji:'🏅',
        description:"Accréditation premium pour gérer entièrement votre association : adhérents, cotisations, trésorerie, comptabilité intelligente, assemblées générales et votes électroniques.",
        droits:['Gérer les adhérents et cartes de membre (QR Code)','Encaisser les cotisations et relances automatiques','Tenir la trésorerie et la comptabilité (OCR des factures)','Organiser des assemblées générales et des votes électroniques','Consulter les statistiques avancées','Assistant IA : analyses financières, prédictions, rapports'],
        couleur:'#7c3aed',bg:'#f5f3ff',border:'#7c3aed',text:'#4c1d95', module:'asso', ordre:6,
        regles:[['initiative','sur_demande']], tarifs:[['initiative','annuel',0]] },
    ];
    for (const d of SEED) {
      const { rows } = await pool.query(
        `INSERT INTO accred_definitions
          (type,label,emoji,description,droits,couleur,couleur_bg,couleur_border,couleur_text,module,ordre)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (type) DO NOTHING RETURNING id`,
        [d.type, d.label, d.emoji, d.description, JSON.stringify(d.droits), d.couleur, d.bg, d.border, d.text, d.module, d.ordre]
      );
      if (rows[0]) {
        const defId = rows[0].id;
        for (const [role, mode] of d.regles) await pool.query("INSERT INTO accred_regles (accred_id,role,mode) VALUES ($1,$2,$3)", [defId, role, mode]);
        for (const [role, type_tarif, montant] of d.tarifs) await pool.query("INSERT INTO accred_tarifs (accred_id,role,type_tarif,montant,devise,validation_admin) VALUES ($1,$2,$3,$4,'EUR',0)", [defId, role, type_tarif, montant]);
        console.log('[pg-init] Accréditation "' + d.type + '" seedée (id=' + defId + ').');
      }
    }
    await pool.query(
      `UPDATE accred_tarifs SET validation_admin=0
       WHERE accred_id IN (SELECT id FROM accred_definitions WHERE type = ANY($1))`,
      [SEED.map(d => d.type)]
    );
  } catch (e) { console.error('[pg-init migration] seed/maj accréditations sans validation admin:', e.message); }

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

  /* ── Accréditation "Initiative Abonnée" — même bug : jamais seedée côté Postgres,
     alors que tout le Premium-gating de dashboard-initiative.html/initiative.html en dépend
     via hasAccreditation(userId,'initiative_abonne'). Idempotent via ON CONFLICT (type). */
  try {
    const { rows: insRowsInit } = await pool.query(
      `INSERT INTO accred_definitions
        (type,label,emoji,description,droits,couleur,couleur_bg,couleur_border,couleur_text,module,ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (type) DO NOTHING RETURNING id`,
      [
        'initiative_abonne', 'Initiative Abonnée', '⭐',
        "Abonnement qui débloque le module paiement, la publicité, les événements, les business plans, les cotisations & adhésions, les votes sécurisés et la visibilité publique de la vitrine.",
        JSON.stringify(['Module paiement (Stripe Connect)','Publicités','Événements','Business Plans','Cotisations & Adhésions','Votes sécurisés','Vitrine visible au public']),
        '#c8960c', '#fffbeb', '#f2c94c', '#8a6400', 'compte_initiative', 1,
      ]
    );
    if (insRowsInit[0]) {
      const defId = insRowsInit[0].id;
      await pool.query("INSERT INTO accred_regles (accred_id,role,mode) VALUES ($1,'initiative','automatique')", [defId]);
      await pool.query("INSERT INTO accred_tarifs (accred_id,role,type_tarif,montant,devise,validation_admin,reduction_annuelle_pct) VALUES ($1,'initiative','mensuel',12.99,'EUR',0,15)", [defId]);
      console.log('[pg-init] Accréditation "initiative_abonne" seedée (id=' + defId + ').');
    }
  } catch (e) { console.error('[pg-init migration] seed initiative_abonne:', e.message); }

  /* ── Accréditation "Mon Associé" — même bug racine que les autres : le seed dans db.js
     (seedMonAssocie) ne s'exécute que via better-sqlite3, jamais contre Postgres.
     Sur demande, validée par un admin (validation_admin=1), gratuite. Idempotent via
     ON CONFLICT (type). */
  try {
    const { rows: insRowsAssocie } = await pool.query(
      `INSERT INTO accred_definitions
        (type,label,emoji,description,droits,couleur,couleur_bg,couleur_border,couleur_text,module,ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (type) DO NOTHING RETURNING id`,
      [
        'mon_associe', 'Mon Associé', '💎',
        "Accès au module Mon Associé : publier des annonces de recherche de collaborations (associés, partenaires, bénévoles, investisseurs...) et candidater aux annonces publiées.",
        JSON.stringify(['Publier des annonces','Candidater aux annonces','Messagerie et coffre de documents dédiés']),
        '#2E74E0', '#EEF4FF', '#2E74E0', '#0F2A50', 'mon_associe', 1,
      ]
    );
    if (insRowsAssocie[0]) {
      const defId = insRowsAssocie[0].id;
      await pool.query("INSERT INTO accred_regles (accred_id,role,mode) VALUES ($1,'utilisateur','sur_demande')", [defId]);
      await pool.query("INSERT INTO accred_regles (accred_id,role,mode) VALUES ($1,'initiative','sur_demande')", [defId]);
      await pool.query("INSERT INTO accred_tarifs (accred_id,role,type_tarif,montant,devise,validation_admin) VALUES ($1,'utilisateur','gratuit',0,'EUR',1)", [defId]);
      await pool.query("INSERT INTO accred_tarifs (accred_id,role,type_tarif,montant,devise,validation_admin) VALUES ($1,'initiative','gratuit',0,'EUR',1)", [defId]);
      console.log('[pg-init] Accréditation "mon_associe" seedée (id=' + defId + ').');
    }
  } catch (e) { console.error('[pg-init migration] seed mon_associe:', e.message); }

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

  /* ── Module Premium : tarification par catégorie/taille — miroir des seeds db.js
     (accred_tarifs_categorie / accred_tarifs_paliers), les tables elles-mêmes sont créées
     automatiquement par createMissingTables() (parsing générique des CREATE TABLE de db.js). */
  try {
    const { rows: initAbo } = await pool.query("SELECT id FROM accred_definitions WHERE type='initiative_abonne'");
    if (initAbo[0]) {
      const initAboId = initAbo[0].id;
      const { rows: catAsso } = await pool.query(
        "SELECT id FROM accred_tarifs_categorie WHERE accred_id=$1 AND role='initiative' AND categorie='association'", [initAboId]);
      if (!catAsso[0]) {
        await pool.query(
          "INSERT INTO accred_tarifs_categorie (accred_id,role,categorie,montant,devise,reduction_annuelle_pct) VALUES ($1,'initiative','association',9.99,'EUR',15)",
          [initAboId]);
        console.log('[pg-init] Tarif catégorie "association" seedé pour initiative_abonne.');
      }
      const { rows: paliers } = await pool.query("SELECT id FROM accred_tarifs_paliers WHERE accred_id=$1", [initAboId]);
      if (!paliers.length) {
        const PALIERS_ASSOCIATION = [
          ['Petite association', 0, 49], ['Association moyenne', 50, 500],
          ['Grande association', 501, 4999], ['Fédération', 5000, 49999],
          ['Organisation internationale', 50000, null],
        ];
        const PALIERS_ENTREPRISE = [
          ['Micro-entreprise', 1, 9], ['PME', 10, 49], ['Entreprise moyenne', 50, 249],
          ['Grande entreprise', 250, 999], ['Grand groupe', 1000, null],
        ];
        for (const [categorie, liste] of [['association', PALIERS_ASSOCIATION], ['entreprise', PALIERS_ENTREPRISE]]) {
          for (let i = 0; i < liste.length; i++) {
            const [label, min, max] = liste[i];
            await pool.query(
              `INSERT INTO accred_tarifs_paliers (accred_id,role,categorie,label,seuil_min,seuil_max,coefficient,ordre)
               VALUES ($1,'initiative',$2,$3,$4,$5,1,$6)`,
              [initAboId, categorie, label, min, max, i]);
          }
        }
        console.log('[pg-init] Paliers de taille seedés pour initiative_abonne.');
      }
    }
    const { rows: utilAbo } = await pool.query("SELECT id FROM accred_definitions WHERE type='utilisateur_abonne'");
    if (utilAbo[0]) {
      await pool.query("UPDATE accred_tarifs SET montant=3.99 WHERE accred_id=$1 AND role='utilisateur' AND montant=4.99", [utilAbo[0].id]);
    }
  } catch (e) { console.error('[pg-init migration] tarification Premium (catégorie/paliers):', e.message); }

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
    { table: 'offres', constraint: 'offres_statut_check',
      addBack: "CHECK (statut IN ('brouillon','publiee','suspendue','cloturee','archivee'))" },
    /* Module Adhésions — délais de relance personnalisables (tâche #71) : niveau était
       limité à 4 valeurs fixes, désormais libre ("j14", "j-3"...). */
    { table: 'adhesion_relances', constraint: 'adhesion_relances_niveau_check', addBack: null },
    /* Module Adhésions — incrément 3 (2026-08-07) : statut "radié", fin définitive distincte
       de "suspendu" (réversible). */
    { table: 'adhesion_membres', constraint: 'adhesion_membres_statut_check',
      addBack: "CHECK (statut IN ('en_attente','a_jour','non_a_jour','suspendu','radie'))" },
    /* Module Adhésions — incrément 6 (2026-08-07) : sync Affiliations, 3 statuts en plus du
       workflow de demande simple (en_attente/accepte/refuse). */
    { table: 'initiative_membres', constraint: 'initiative_membres_statut_check',
      addBack: "CHECK (statut IN ('en_attente','accepte','refuse','suspendu','radie','expire'))" },
  ];
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

  /* ── Module "Avancement de mon initiative" — catalogue de critères ──
     Le seed de db.js (seedAvancementCriteres) ne s'exécute que via node:sqlite, jamais contre
     Postgres (même piège que les accréditations plus haut). Idempotent via ON CONFLICT (cle). */
  try {
    const DEFAUTS_AVANCEMENT = [
      ['production_offre', 'Production / Offre', "Le produit, service ou activité proposé est défini et prêt à être présenté."],
      ['immatriculation', 'Immatriculation de la structure', "Les démarches administratives de création officielle de la structure."],
      ['implantation_geo', 'Implantation géographique', "Le ou les lieux d'implantation de l'initiative sont identifiés."],
      ['business_plan', 'Business plan', "Le plan d'affaires (marché, stratégie, prévisionnel) est rédigé."],
      ['financement', 'Financement', "Le financement du projet est identifié et/ou sécurisé."],
      ['equipe', 'Équipe', "L'équipe fondatrice ou opérationnelle est constituée."],
      ['partenariats', 'Partenariats', "Des partenariats utiles au projet sont noués ou en discussion."],
      ['juridique_administratif', 'Aspects juridiques et administratifs', "Statuts, autorisations, assurances et obligations légales."],
      ['communication_visibilite', 'Communication et visibilité', "Présence en ligne, supports de communication, notoriété naissante."],
      ['premiers_clients', 'Premiers clients ou bénéficiaires', "Les premiers retours concrets du terrain (clients, usagers, bénéficiaires)."],
    ];
    for (let i = 0; i < DEFAUTS_AVANCEMENT.length; i++) {
      const [cle, titre, description] = DEFAUTS_AVANCEMENT[i];
      await pool.query(
        `INSERT INTO avancement_criteres (cle, titre, description, ordre) VALUES ($1,$2,$3,$4)
         ON CONFLICT (cle) DO NOTHING`,
        [cle, titre, description, i]
      );
    }
  } catch (e) { console.error('[pg-init migration] seed avancement_criteres:', e.message); }
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
  // Comptes de démonstration (connexion "Comptes test" + comptes créés par seed-comptes-test.js) :
  // jamais dans l'annuaire, les recherches ni les compteurs de membres — voir les clauses "is_demo"
  // du code. Ciblage précis par liste d'emails exacte (PAS un LIKE '%@diaspoactif.demo' large : ce
  // domaine est aussi partagé par d'autres comptes légitimes comme des mairies/préfectures ou de
  // vraies initiatives, qu'un LIKE trop large masquait par erreur — initiatives vidées de l'annuaire).
  // Reset complet puis réapplication à chaque cold start : état déterministe, jamais dépendant de
  // ce qu'un autre script a pu positionner avant.
  const emailsComptesTest = [
    ...demoUsers.map(u => u.email),
    // 'admin@diaspoactif.com' est l'email prévu par seed-comptes-test.js, mais n'existe pas en
    // production : le compte administrateur réel (id=4) a été créé avec contact@diaspoactif.com
    // (voir vitrine-admin-connexion.html) — sans cette entrée, l'UPDATE ci-dessous ne matchait
    // aucune ligne (silencieusement, via le .catch(()=>{}) plus bas) et la carte "Administrateur"
    // restait visible dans /api/annuaire/recherche malgré un seedPg() qui s'exécutait correctement.
    'admin@diaspoactif.com', 'contact@diaspoactif.com', 'test-utilisateur@diaspoactif.com',
    'test-initiative@diaspoactif.com', 'test-collectivite@diaspoactif.com',
  ];
  await pool.query(`UPDATE users SET is_demo=FALSE WHERE is_demo IS DISTINCT FROM FALSE`).catch(()=>{});
  await pool.query(
    `UPDATE users SET is_demo=TRUE WHERE email = ANY($1::text[])`,
    [emailsComptesTest]
  ).catch(()=>{});

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
module.exports.reparerSchema = reparerSchema;

/* Colonnes attendues par le schema, exposees pour le controle post-deploiement.
   migratePg() les applique au demarrage, mais uniquement lors d'un demarrage a froid ET si
   le verrou consultatif est libre : une instance qui ne l'obtient pas sert les requetes avec
   l'ancien schema. Une migration non jouee etait donc INVISIBLE — elle ne se manifestait que
   par une erreur 500 au premier enregistrement touchant une colonne manquante.
   /api/admin/schema-check compare cette liste au schema reel pour rendre l'ecart verifiable
   immediatement apres un deploiement. */
module.exports.colonnesAttendues = function colonnesAttendues() {
  return COLONNES_MIGRATION;
};
