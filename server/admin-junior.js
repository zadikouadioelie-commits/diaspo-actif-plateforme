/* ═══════════════════════════════════════════════════════════════
   server/admin-junior.js — Administrateurs Junior (délégation de modules)
   ═══════════════════════════════════════════════════════════════
   Un administrateur junior est une ligne users normale (role='administrateur_junior'),
   réutilise donc tout le reste de la pile d'authentification (hachage, sessions,
   getCurrentUser, route de connexion) sans aucune mécanique parallèle. Tout ce qui lui
   est propre (verrouillage, mot de passe courant en clair pour copie manuelle,
   permissions, journal) vit dans 3 tables satellites (server/db.js) — jamais de
   colonne ajoutée à users lui-même.

   CATALOGUE_ADMIN_JUNIOR est le registre central, défini ici en code (pas éditable
   depuis l'interface en phase 1) : chaque entrée a un id stable (stocké tel quel dans
   admin_junior_permissions.catalogue_id — c'est cette clé qu'on copie d'un junior à
   l'autre pour « attribuer l'action X du junior 2 au junior 3 ») et une capability
   (chaîne utilisée côté route via hasAdminPermission). Même principe de tableau
   indexé + résolution que server/avantages-premium.js.

   Un futur module délégable se câble en 3 étapes : ajouter ses entrées ici, remplacer
   le contrôle `role !== 'administrateur'` de ses routes par
   `!(await AdminJunior.hasAdminPermission(user, 'capacite', db))`, ajouter un appel
   `journaliserActionSiJunior(...)` avant chaque réponse de succès. */

const crypto = require('node:crypto');
const { hashPassword } = require('./auth');

/* 8 caractères, alphabet excluant I/O/0/1 (confusion visuelle) — même principe que
   DA_CODE_ALPHABET_LETTRES (server/index.js:3033), étendu aux chiffres restants
   puisqu'il sert aussi de mot de passe (besoin d'un espace bien plus large qu'un
   simple code lettre+3 chiffres à 24 000 combinaisons). 32 caractères ^ 8 ≈ 1,1×10¹²
   combinaisons : pas de secours par balayage exhaustif nécessaire, contrairement à
   genererCodeUniqueDA (espace bien plus restreint).*/
const JUNIOR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const JUNIOR_LONGUEUR = 8;
const JUNIOR_LOCKOUT_SEUIL = 3;
const DOMAINE_JUNIOR = '@diaspoactif.admin';

function genererChaineJunior(longueur = JUNIOR_LONGUEUR) {
  let out = '';
  for (let i = 0; i < longueur; i++) out += JUNIOR_ALPHABET[crypto.randomInt(JUNIOR_ALPHABET.length)];
  return out;
}

async function genererEmailJuniorUnique(db) {
  for (let tentative = 0; tentative < 50; tentative++) {
    const email = genererChaineJunior() + DOMAINE_JUNIOR;
    const existe = await db.prepare('SELECT id FROM users WHERE LOWER(email)=?').get(email.toLowerCase());
    if (!existe) return email;
  }
  return null; // espace de ~1,1×10¹² pratiquement inépuisable — n'arrive jamais en réalité
}

function genererMotDePasseJunior() {
  return genererChaineJunior();
}

/* ── Catalogue d'attribution — phase 1 : Modération (11) + Demandes de suppression (3) ── */
const CATALOGUE_ADMIN_JUNIOR = [
  // ── Module: moderation ──
  { id: 'moderation.comptes.consulter',      module: 'moderation', numero: 1,  description: 'Consulter les comptes en attente de validation',                   capability: 'moderation.comptes.consulter' },
  { id: 'moderation.comptes.valider',        module: 'moderation', numero: 2,  description: 'Valider un compte en attente',                                      capability: 'moderation.comptes.valider' },
  { id: 'moderation.comptes.rejeter',        module: 'moderation', numero: 3,  description: 'Rejeter un compte en attente',                                      capability: 'moderation.comptes.rejeter' },
  { id: 'moderation.contenus.consulter',     module: 'moderation', numero: 4,  description: 'Consulter les contenus récents (posts, formations, événements)',   capability: 'moderation.contenus.consulter' },
  { id: 'moderation.contenus.supprimer',     module: 'moderation', numero: 5,  description: 'Supprimer un contenu (post, formation, événement)',                capability: 'moderation.contenus.supprimer' },
  { id: 'moderation.signalements.consulter', module: 'moderation', numero: 6,  description: 'Consulter les dossiers de signalement (liste + fiche détaillée)', capability: 'moderation.signalements.consulter' },
  { id: 'moderation.signalements.instruire', module: 'moderation', numero: 7,  description: 'Instruire un dossier (passer en analyse, fixer la gravité)',       capability: 'moderation.signalements.instruire' },
  { id: 'moderation.signalements.litige',    module: 'moderation', numero: 8,  description: 'Ouvrir un litige sur un dossier de signalement',                   capability: 'moderation.signalements.litige' },
  { id: 'moderation.signalements.decision',  module: 'moderation', numero: 9,  description: 'Rendre une décision (classer, archiver, suspendre)',               capability: 'moderation.signalements.decision' },
  { id: 'moderation.signalements.repondre',  module: 'moderation', numero: 10, description: "Répondre dans l'espace de discussion d'un dossier de signalement", capability: 'moderation.signalements.repondre' },
  { id: 'moderation.signalements.migrer',    module: 'moderation', numero: 11, description: 'Importer les anciens signalements (migration ponctuelle)',         capability: 'moderation.signalements.migrer' },

  // ── Module: suppression_comptes ──
  { id: 'suppression_comptes.consulter', module: 'suppression_comptes', numero: 1, description: 'Consulter les demandes de suppression de compte',                  capability: 'suppression_comptes.consulter' },
  { id: 'suppression_comptes.traiter',   module: 'suppression_comptes', numero: 2, description: "Changer le statut d'une demande (discussion, validation, refus)",  capability: 'suppression_comptes.traiter' },
  { id: 'suppression_comptes.repondre',  module: 'suppression_comptes', numero: 3, description: "Répondre dans l'espace de discussion d'une demande de suppression", capability: 'suppression_comptes.repondre' },
];

function catalogueIdsPourCapacite(capabiliteKey) {
  return CATALOGUE_ADMIN_JUNIOR.filter(e => e.capability === capabiliteKey).map(e => e.id);
}

function entreeCatalogue(catalogueId) {
  return CATALOGUE_ADMIN_JUNIOR.find(e => e.id === catalogueId) || null;
}

/* Contrôle de permission — appelé sur chaque route déléguée. Un vrai administrateur
   passe toujours ; un administrateur junior est vérifié contre la PHOTO figée à sa dernière
   connexion (permissions_snapshot_json), jamais contre admin_junior_permissions en direct —
   voir le commentaire sur cette colonne (server/db.js) : c'est ce qui garantit qu'une
   révocation ne prend effet qu'à la prochaine connexion, pas immédiatement en cours de
   session (décision actée avec l'utilisateur, vérifiée en conditions réelles : sans cette
   photo, hasAdminPermission() interrogeait la table en direct et coupait l'accès instantanément
   dès la révocation — comportement inverse de ce qui était demandé). Une capability inconnue
   du catalogue refuse par défaut (fail-closed), jamais l'inverse. */
async function hasAdminPermission(user, capabiliteKey, db) {
  if (!user) return false;
  if (user.role === 'administrateur') return true;
  if (user.role !== 'administrateur_junior') return false;
  const ids = catalogueIdsPourCapacite(capabiliteKey);
  if (!ids.length) return false;
  const meta = await db.prepare('SELECT permissions_snapshot_json FROM admin_junior_meta WHERE user_id=?').get(user.id);
  if (!meta) return false;
  let accordees = [];
  try { accordees = JSON.parse(meta.permissions_snapshot_json || '[]'); } catch (_) { accordees = []; }
  return ids.some(id => accordees.includes(id));
}

/* Appelée uniquement à la connexion réussie d'un junior (server/index.js, route de connexion) —
   fige dans permissions_snapshot_json l'état ACTUEL de ses droits pour toute la durée de sa
   session à venir. Toute modification faite par l'administrateur principal après cet instant
   (accord ou révocation) n'a d'effet qu'à la connexion SUIVANTE. */
async function actualiserSnapshotPermissions(db, juniorUserId) {
  const rows = await db.prepare('SELECT catalogue_id FROM admin_junior_permissions WHERE junior_user_id=?').all(juniorUserId);
  const ids = rows.map(r => r.catalogue_id);
  await db.prepare('UPDATE admin_junior_meta SET permissions_snapshot_json=? WHERE user_id=?').run(JSON.stringify(ids), juniorUserId);
  return ids;
}

async function journaliserJunior(db, { juniorUserId, acteurId, acteurNom, action, catalogueId, details }) {
  try {
    await db.prepare(`
      INSERT INTO admin_junior_journal (junior_user_id, acteur_id, acteur_nom, action, catalogue_id, details)
      VALUES (?,?,?,?,?,?)
    `).run(juniorUserId, acteurId || null, acteurNom || null, action, catalogueId || null, details || null);
  } catch (e) { console.error('[admin-junior-journal]', e.message); }
}

/* No-op instantané si le compte n'est pas un junior — ajoutable sans risque avant
   n'importe quel sendJSON de succès, présent ou futur, sur n'importe quelle route. */
async function journaliserActionSiJunior(db, user, capabiliteKey, details) {
  if (!user || user.role !== 'administrateur_junior') return;
  const ids = catalogueIdsPourCapacite(capabiliteKey);
  const catalogueId = ids[0] || null;
  const nom = `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email;
  await journaliserJunior(db, {
    juniorUserId: user.id, acteurId: user.id, acteurNom: nom,
    action: 'action_executee', catalogueId, details,
  });
}

/* La base SQLite locale déjà créée porte l'ancienne contrainte CHECK sur users.role
   (elle ne se met à jour qu'à la toute première création de la table — voir le
   commentaire dans server/db.js). Contrairement à la production (Postgres), où
   server/pg-init.js élargit réellement la contrainte via ALTER TABLE (checkFixes),
   SQLite ne permet pas de modifier un CHECK sans reconstruire la table. Vérifié par
   test direct : sans ce contournement, l'INSERT échoue en local avec
   "CHECK constraint failed: role IN (...)". PRAGMA ignore_check_constraints désactive
   temporairement l'évaluation du CHECK pour cette seule connexion — jamais utilisé en
   production (process.env.DATABASE_URL), où le vrai fix (ALTER TABLE) s'applique. */
async function withLocalCheckConstraintBypass(db, fn) {
  const isLocalSqlite = !process.env.DATABASE_URL;
  if (isLocalSqlite) { try { db.exec('PRAGMA ignore_check_constraints = ON;'); } catch (_) {} }
  try {
    return await fn();
  } finally {
    if (isLocalSqlite) { try { db.exec('PRAGMA ignore_check_constraints = OFF;'); } catch (_) {} }
  }
}

async function creerAdminJunior(db, { principalAdminId, catalogueIds }) {
  const email = await genererEmailJuniorUnique(db);
  if (!email) throw new Error('Génération d\'email junior impossible (espace épuisé — ne devrait jamais arriver).');
  const passwordPlain = genererMotDePasseJunior();
  const { hash, salt } = hashPassword(passwordPlain);

  /* Alias en minuscules (maxseq, pas maxSeq) : Postgres replie automatiquement tout alias non
     protégé par des guillemets en minuscules — "AS maxSeq" est renvoyé sous la clé "maxseq" en
     production, jamais "maxSeq". Avec l'alias camelCase, seqRow.maxSeq valait toujours undefined
     en production (fonctionnait par coïncidence en local sur SQLite, qui préserve la casse) :
     sequenceNumber recalculait donc systématiquement 1, provoquant une violation de la contrainte
     UNIQUE(created_by_admin_id, sequence_number) dès le 2e administrateur junior créé par un même
     admin — confirmé en production par l'utilisateur ("Création impossible : Création impossible."
     sur la 2e création). */
  const seqRow = await db.prepare(
    'SELECT COALESCE(MAX(sequence_number), 0) AS maxseq FROM admin_junior_meta WHERE created_by_admin_id=?'
  ).get(principalAdminId);
  const sequenceNumber = Number(seqRow?.maxseq || 0) + 1;

  const userId = Number((await withLocalCheckConstraintBypass(db, () => db.prepare(`
    INSERT INTO users (nom, email, password_hash, password_salt, role)
    VALUES (?,?,?,?,'administrateur_junior')
  `).run(`Administrateur junior n°${sequenceNumber}`, email, hash, salt))).lastInsertRowid);

  await db.prepare(`
    INSERT INTO admin_junior_meta (user_id, created_by_admin_id, sequence_number, password_plain_courant)
    VALUES (?,?,?,?)
  `).run(userId, principalAdminId, sequenceNumber, passwordPlain);

  const idsValides = (catalogueIds || []).filter(id => entreeCatalogue(id));
  for (const catalogueId of idsValides) {
    const entree = entreeCatalogue(catalogueId);
    await db.prepare(`
      INSERT INTO admin_junior_permissions (junior_user_id, catalogue_id, module_key, granted_by_admin_id)
      VALUES (?,?,?,?)
    `).run(userId, catalogueId, entree.module, principalAdminId);
    await journaliserJunior(db, {
      juniorUserId: userId, acteurId: principalAdminId, action: 'permission_accordee', catalogueId,
      details: `Droit accordé à la création : ${entree.description}`,
    });
  }
  /* Photo initiale = droits accordés à la création (pas d'attente d'une première connexion
     pour que hasAdminPermission() ait quelque chose de cohérent à lire — sera de toute façon
     réactualisée à la vraie première connexion du junior). */
  await actualiserSnapshotPermissions(db, userId);

  return { id: userId, email, password: passwordPlain, sequenceNumber };
}

async function regenererIdentifiantsJunior(db, { juniorUserId, acteurAdminId, motif }) {
  const email = await genererEmailJuniorUnique(db);
  if (!email) throw new Error('Génération d\'email junior impossible (espace épuisé — ne devrait jamais arriver).');
  const passwordPlain = genererMotDePasseJunior();
  const { hash, salt } = hashPassword(passwordPlain);

  await db.prepare('UPDATE users SET email=?, password_hash=?, password_salt=? WHERE id=?')
    .run(email, hash, salt, juniorUserId);
  await db.prepare(`
    UPDATE admin_junior_meta SET password_plain_courant=?, echecs_connexion=0, derniere_rotation_at=datetime('now')
    WHERE user_id=?
  `).run(passwordPlain, juniorUserId);

  await journaliserJunior(db, {
    juniorUserId, acteurId: acteurAdminId || null,
    action: motif === 'cron_mensuel' ? 'identifiants_regeneres_cron' : 'identifiants_regeneres_manuel',
    details: motif === 'cron_mensuel' ? 'Renouvellement mensuel automatique.' : 'Rafraîchissement manuel par l\'administrateur principal.',
  });

  return { email, password: passwordPlain };
}

async function enregistrerEchecConnexionJunior(db, juniorUserId) {
  await db.prepare('UPDATE admin_junior_meta SET echecs_connexion = echecs_connexion + 1 WHERE user_id=?').run(juniorUserId);
  const row = await db.prepare('SELECT echecs_connexion FROM admin_junior_meta WHERE user_id=?').get(juniorUserId);
  const compteur = Number(row?.echecs_connexion || 0);
  await journaliserJunior(db, { juniorUserId, action: 'connexion_echouee', details: `Échec n°${compteur}` });
  if (compteur === JUNIOR_LOCKOUT_SEUIL) {
    await journaliserJunior(db, { juniorUserId, action: 'compte_verrouille', details: `Verrouillé après ${JUNIOR_LOCKOUT_SEUIL} échecs.` });
  }
  return compteur;
}

async function estVerrouille(db, juniorUserId) {
  const row = await db.prepare('SELECT echecs_connexion FROM admin_junior_meta WHERE user_id=?').get(juniorUserId);
  return Number(row?.echecs_connexion || 0) >= JUNIOR_LOCKOUT_SEUIL;
}

/* Suspension manuelle, réversible — distincte du verrouillage automatique à 3 échecs (au-dessus) :
   celui-ci se lève par un rafraîchissement des identifiants, la suspension par reactiverAdminJunior()
   uniquement. Les deux peuvent être actifs en même temps ; estVerrouille() et estSuspendu() sont
   vérifiés séparément à la connexion (server/index.js), avec un message distinct pour chacun. */
async function estSuspendu(db, juniorUserId) {
  const row = await db.prepare('SELECT suspendu FROM admin_junior_meta WHERE user_id=?').get(juniorUserId);
  return !!Number(row?.suspendu || 0);
}

async function suspendreAdminJunior(db, { juniorUserId, acteurAdminId }) {
  await db.prepare('UPDATE admin_junior_meta SET suspendu=1 WHERE user_id=?').run(juniorUserId);
  await journaliserJunior(db, { juniorUserId, acteurId: acteurAdminId || null, action: 'compte_suspendu', details: 'Suspendu par l\'administrateur principal.' });
}

async function reactiverAdminJunior(db, { juniorUserId, acteurAdminId }) {
  await db.prepare('UPDATE admin_junior_meta SET suspendu=0 WHERE user_id=?').run(juniorUserId);
  await journaliserJunior(db, { juniorUserId, acteurId: acteurAdminId || null, action: 'compte_reactive', details: 'Réactivé par l\'administrateur principal.' });
}

/* Suppression définitive et irréversible — synthétique (compte factice, aucune donnée personnelle
   réelle à protéger façon RGPD, contrairement aux comptes utilisateurs), donc suppression directe
   plutôt que le circuit délai-de-grâce des "Demandes de suppression". Nettoie explicitement chaque
   table satellite AVANT la ligne users (contraintes FK) — mêmes tables que celles rencontrées lors
   des tests manuels de ce module : permissions, journal, meta, sessions, activité. Trace la
   suppression dans le journal d'audit GÉNÉRAL (audit_log) puisque admin_junior_journal disparaît
   avec le reste — sinon aucune trace ne survivrait à l'action elle-même. */
async function supprimerAdminJunior(db, { juniorUserId, acteurAdminId, acteurNom }) {
  const user = await db.prepare('SELECT nom, email FROM users WHERE id=? AND role=\'administrateur_junior\'').get(juniorUserId);
  if (!user) return false;
  await db.prepare('DELETE FROM admin_junior_permissions WHERE junior_user_id=?').run(juniorUserId);
  await db.prepare('DELETE FROM admin_junior_journal WHERE junior_user_id=?').run(juniorUserId);
  await db.prepare('DELETE FROM admin_junior_meta WHERE user_id=?').run(juniorUserId);
  try { await db.prepare('DELETE FROM sessions WHERE user_id=?').run(juniorUserId); } catch (_) {}
  try { await db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(juniorUserId); } catch (_) {}
  try { await db.prepare('DELETE FROM user_activity WHERE user_id=?').run(juniorUserId); } catch (_) {}
  await db.prepare('DELETE FROM users WHERE id=?').run(juniorUserId);
  try {
    await db.prepare('INSERT INTO audit_log (admin_id, action, cible_type, cible_id, detail) VALUES (?,?,?,?,?)')
      .run(acteurAdminId, 'admin_junior_supprime', 'administrateur_junior', juniorUserId,
        JSON.stringify({ email: user.email, nom: user.nom, acteur: acteurNom || null }));
  } catch (e) { console.error('[admin-junior-audit-log]', e.message); }
  return true;
}

module.exports = {
  JUNIOR_ALPHABET, JUNIOR_LONGUEUR, JUNIOR_LOCKOUT_SEUIL, DOMAINE_JUNIOR,
  CATALOGUE_ADMIN_JUNIOR, catalogueIdsPourCapacite, entreeCatalogue,
  hasAdminPermission, actualiserSnapshotPermissions, journaliserJunior, journaliserActionSiJunior,
  creerAdminJunior, regenererIdentifiantsJunior,
  enregistrerEchecConnexionJunior, estVerrouille,
  estSuspendu, suspendreAdminJunior, reactiverAdminJunior, supprimerAdminJunior,
  genererEmailJuniorUnique, genererMotDePasseJunior, genererChaineJunior,
};
