/* ===========================================================
   tests/admin-junior.test.js — Administrateurs Junior (server/admin-junior.js)
   ===========================================================
   Tests unitaires purs, contre une vraie base SQLite en mémoire (node:sqlite,
   :memory:) portant un schéma minimal (users + les 3 tables satellites) — plus
   robuste qu'un faux `db` à dispatch par regex pour un module qui écrit sur
   plusieurs tables (INSERT INTO users à 5 colonnes, meta, permissions, journal) :
   on exécute le vrai SQL du module, on ne le simule pas.

   Lancer : npm test
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const AJ = require('../server/admin-junior.js');

function makeDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('utilisateur','initiative','administrateur','collectivite','administrateur_junior'))
    );
    CREATE TABLE admin_junior_meta (
      user_id                 INTEGER PRIMARY KEY,
      created_by_admin_id     INTEGER NOT NULL,
      sequence_number         INTEGER NOT NULL,
      password_plain_courant  TEXT NOT NULL,
      echecs_connexion        INTEGER NOT NULL DEFAULT 0,
      suspendu                INTEGER NOT NULL DEFAULT 0,
      permissions_snapshot_json TEXT DEFAULT '[]',
      derniere_rotation_at    TEXT DEFAULT (datetime('now')),
      UNIQUE(created_by_admin_id, sequence_number)
    );
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      cible_type TEXT,
      cible_id INTEGER,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE admin_junior_permissions (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      junior_user_id      INTEGER NOT NULL,
      catalogue_id        TEXT NOT NULL,
      module_key          TEXT NOT NULL,
      granted_by_admin_id INTEGER NOT NULL,
      UNIQUE(junior_user_id, catalogue_id)
    );
    CREATE TABLE admin_junior_journal (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      junior_user_id  INTEGER NOT NULL,
      acteur_id       INTEGER,
      acteur_nom      TEXT,
      action          TEXT NOT NULL,
      catalogue_id    TEXT,
      details         TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );
  `);
  // Adapte l'API synchrone de node:sqlite à l'interface async attendue par le module
  // (identique en production sur db-pg.js) : .prepare(sql).get/all/run(...) awaités.
  return {
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        async get(...args) { return stmt.get(...args); },
        async all(...args) { return stmt.all(...args); },
        async run(...args) { return stmt.run(...args); },
      };
    },
    exec(sql) { return raw.exec(sql); },
  };
}

async function creerAdmin(db) {
  return Number((await db.prepare(
    "INSERT INTO users (nom, email, password_hash, password_salt, role) VALUES ('Admin','admin@test.local','h','s','administrateur')"
  ).run()).lastInsertRowid);
}

test('hasAdminPermission — un vrai administrateur passe toujours', async () => {
  const db = makeDb();
  const admin = { id: 1, role: 'administrateur' };
  assert.equal(await AJ.hasAdminPermission(admin, 'moderation.comptes.valider', db), true);
  assert.equal(await AJ.hasAdminPermission(admin, 'capacite.qui.nexiste.pas', db), true);
});

test('hasAdminPermission — junior avec droit accordé', async () => {
  const db = makeDb();
  const adminId = await creerAdmin(db);
  const junior = await AJ.creerAdminJunior(db, { principalAdminId: adminId, catalogueIds: ['moderation.comptes.valider'] });
  assert.equal(await AJ.hasAdminPermission({ id: junior.id, role: 'administrateur_junior' }, 'moderation.comptes.valider', db), true);
});

test('hasAdminPermission — junior sans droit accordé', async () => {
  const db = makeDb();
  const adminId = await creerAdmin(db);
  const junior = await AJ.creerAdminJunior(db, { principalAdminId: adminId, catalogueIds: ['moderation.comptes.valider'] });
  assert.equal(await AJ.hasAdminPermission({ id: junior.id, role: 'administrateur_junior' }, 'suppression_comptes.traiter', db), false);
});

test('hasAdminPermission — capacité inconnue du catalogue refuse par défaut', async () => {
  const db = makeDb();
  const adminId = await creerAdmin(db);
  const junior = await AJ.creerAdminJunior(db, { principalAdminId: adminId, catalogueIds: ['moderation.comptes.valider'] });
  assert.equal(await AJ.hasAdminPermission({ id: junior.id, role: 'administrateur_junior' }, 'capacite.qui.nexiste.pas', db), false);
});

test('hasAdminPermission — autres rôles toujours refusés', async () => {
  const db = makeDb();
  assert.equal(await AJ.hasAdminPermission({ id: 99, role: 'utilisateur' }, 'moderation.comptes.valider', db), false);
  assert.equal(await AJ.hasAdminPermission({ id: 99, role: 'initiative' }, 'moderation.comptes.valider', db), false);
  assert.equal(await AJ.hasAdminPermission(null, 'moderation.comptes.valider', db), false);
});

test('générateur — jamais de caractère ambigu (I/O/0/1), longueur correcte', () => {
  for (let i = 0; i < 2000; i++) {
    const s = AJ.genererChaineJunior();
    assert.equal(s.length, AJ.JUNIOR_LONGUEUR);
    assert.doesNotMatch(s, /[IO01]/, `chaîne ambiguë générée : ${s}`);
  }
});

test('genererEmailJuniorUnique — évite une adresse déjà prise en base', async () => {
  const db = makeDb();
  // Prend la toute première adresse jamais générée, l'occupe en base pour forcer
  // genererEmailJuniorUnique à retenter au moins une fois lors du second appel.
  const premiere = await AJ.genererEmailJuniorUnique(db);
  await db.prepare("INSERT INTO users (nom, email, password_hash, password_salt, role) VALUES ('Occupe',?,'h','s','administrateur_junior')").run(premiere);
  const seconde = await AJ.genererEmailJuniorUnique(db);
  assert.notEqual(seconde, premiere);
  assert.match(seconde, new RegExp(`${AJ.DOMAINE_JUNIOR.replace('.', '\\.')}$`));
});

test('verrouillage — se déclenche exactement au 3e échec, pas avant', async () => {
  const db = makeDb();
  const adminId = await creerAdmin(db);
  const junior = await AJ.creerAdminJunior(db, { principalAdminId: adminId, catalogueIds: [] });
  assert.equal(await AJ.estVerrouille(db, junior.id), false);
  await AJ.enregistrerEchecConnexionJunior(db, junior.id);
  assert.equal(await AJ.estVerrouille(db, junior.id), false);
  await AJ.enregistrerEchecConnexionJunior(db, junior.id);
  assert.equal(await AJ.estVerrouille(db, junior.id), false);
  await AJ.enregistrerEchecConnexionJunior(db, junior.id);
  assert.equal(await AJ.estVerrouille(db, junior.id), true);
  const journal = await db.prepare('SELECT action FROM admin_junior_journal WHERE junior_user_id=?').all(junior.id);
  const actions = journal.map(j => j.action);
  assert.equal(actions.filter(a => a === 'connexion_echouee').length, 3);
  assert.equal(actions.filter(a => a === 'compte_verrouille').length, 1); // une seule fois, pas à chaque échec suivant
});

test('regenererIdentifiantsJunior — reset le compteur, change les identifiants, journalise selon le motif', async () => {
  const db = makeDb();
  const adminId = await creerAdmin(db);
  const junior = await AJ.creerAdminJunior(db, { principalAdminId: adminId, catalogueIds: [] });
  await AJ.enregistrerEchecConnexionJunior(db, junior.id);
  await AJ.enregistrerEchecConnexionJunior(db, junior.id);
  await AJ.enregistrerEchecConnexionJunior(db, junior.id);
  assert.equal(await AJ.estVerrouille(db, junior.id), true);

  const nouveaux = await AJ.regenererIdentifiantsJunior(db, { juniorUserId: junior.id, acteurAdminId: adminId, motif: 'manuel' });
  assert.notEqual(nouveaux.email, junior.email);
  assert.notEqual(nouveaux.password, junior.password);
  assert.equal(await AJ.estVerrouille(db, junior.id), false);

  const userRow = await db.prepare('SELECT email FROM users WHERE id=?').get(junior.id);
  assert.equal(userRow.email, nouveaux.email);
  const metaRow = await db.prepare('SELECT password_plain_courant, echecs_connexion FROM admin_junior_meta WHERE user_id=?').get(junior.id);
  assert.equal(metaRow.password_plain_courant, nouveaux.password);
  assert.equal(metaRow.echecs_connexion, 0);

  const journalManuel = await db.prepare("SELECT COUNT(*) AS n FROM admin_junior_journal WHERE junior_user_id=? AND action='identifiants_regeneres_manuel'").get(junior.id);
  assert.equal(journalManuel.n, 1);

  const cronRes = await AJ.regenererIdentifiantsJunior(db, { juniorUserId: junior.id, acteurAdminId: null, motif: 'cron_mensuel' });
  const journalCron = await db.prepare("SELECT COUNT(*) AS n FROM admin_junior_journal WHERE junior_user_id=? AND action='identifiants_regeneres_cron'").get(junior.id);
  assert.equal(journalCron.n, 1);
  assert.notEqual(cronRes.email, nouveaux.email);
});

test('journaliserActionSiJunior — no-op pour un vrai administrateur, journalise pour un junior', async () => {
  const db = makeDb();
  const adminId = await creerAdmin(db);
  const junior = await AJ.creerAdminJunior(db, { principalAdminId: adminId, catalogueIds: ['moderation.comptes.valider'] });

  await AJ.journaliserActionSiJunior(db, { id: adminId, role: 'administrateur', nom: 'Admin' }, 'moderation.comptes.valider', 'ne doit rien écrire');
  const rienPourAdmin = await db.prepare("SELECT COUNT(*) AS n FROM admin_junior_journal WHERE junior_user_id=? AND action='action_executee'").get(adminId);
  assert.equal(rienPourAdmin.n, 0);

  await AJ.journaliserActionSiJunior(db, { id: junior.id, role: 'administrateur_junior', nom: 'Junior', email: junior.email }, 'moderation.comptes.valider', 'Compte #42 validé');
  const pourJunior = await db.prepare("SELECT COUNT(*) AS n FROM admin_junior_journal WHERE junior_user_id=? AND action='action_executee'").get(junior.id);
  assert.equal(pourJunior.n, 1);
});

test('hasAdminPermission — une révocation après connexion ne prend PAS effet immédiatement (photo figée à la dernière connexion)', async () => {
  const db = makeDb();
  const adminId = await creerAdmin(db);
  const junior = await AJ.creerAdminJunior(db, { principalAdminId: adminId, catalogueIds: ['moderation.comptes.consulter'] });
  const juniorUser = { id: junior.id, role: 'administrateur_junior' };

  // Simule la connexion réussie du junior (server/index.js appelle ceci à chaque login).
  await AJ.actualiserSnapshotPermissions(db, junior.id);
  assert.equal(await AJ.hasAdminPermission(juniorUser, 'moderation.comptes.consulter', db), true);

  // L'administrateur principal révoque PENDANT que la session du junior est toujours active
  // (aucune nouvelle connexion entre-temps) — simule PATCH .../permissions {revoke:[...]}.
  await db.prepare("DELETE FROM admin_junior_permissions WHERE junior_user_id=? AND catalogue_id=?").run(junior.id, 'moderation.comptes.consulter');

  // Toujours vrai : la photo de la session en cours n'a pas bougé.
  assert.equal(await AJ.hasAdminPermission(juniorUser, 'moderation.comptes.consulter', db), true, 'la révocation ne doit pas couper l\'accès en cours de session');

  // À la connexion SUIVANTE, la photo est réactualisée — l'accès est alors bien coupé.
  await AJ.actualiserSnapshotPermissions(db, junior.id);
  assert.equal(await AJ.hasAdminPermission(juniorUser, 'moderation.comptes.consulter', db), false, 'la révocation doit prendre effet à la connexion suivante');
});

test('suspension — suspendre bloque, réactiver débloque, journalisé dans les deux sens', async () => {
  const db = makeDb();
  const adminId = await creerAdmin(db);
  const junior = await AJ.creerAdminJunior(db, { principalAdminId: adminId, catalogueIds: [] });

  assert.equal(await AJ.estSuspendu(db, junior.id), false);
  await AJ.suspendreAdminJunior(db, { juniorUserId: junior.id, acteurAdminId: adminId });
  assert.equal(await AJ.estSuspendu(db, junior.id), true);
  await AJ.reactiverAdminJunior(db, { juniorUserId: junior.id, acteurAdminId: adminId });
  assert.equal(await AJ.estSuspendu(db, junior.id), false);

  const journal = await db.prepare('SELECT action FROM admin_junior_journal WHERE junior_user_id=? ORDER BY id').all(junior.id);
  const actions = journal.map(j => j.action);
  assert.ok(actions.includes('compte_suspendu'));
  assert.ok(actions.includes('compte_reactive'));
});

test('suspension — distincte du verrouillage (les deux peuvent être vrais en même temps)', async () => {
  const db = makeDb();
  const adminId = await creerAdmin(db);
  const junior = await AJ.creerAdminJunior(db, { principalAdminId: adminId, catalogueIds: [] });
  await AJ.enregistrerEchecConnexionJunior(db, junior.id);
  await AJ.enregistrerEchecConnexionJunior(db, junior.id);
  await AJ.enregistrerEchecConnexionJunior(db, junior.id);
  await AJ.suspendreAdminJunior(db, { juniorUserId: junior.id, acteurAdminId: adminId });
  assert.equal(await AJ.estVerrouille(db, junior.id), true);
  assert.equal(await AJ.estSuspendu(db, junior.id), true);
  // Réactiver ne lève pas le verrouillage, et inversement — deux mécanismes indépendants.
  await AJ.reactiverAdminJunior(db, { juniorUserId: junior.id, acteurAdminId: adminId });
  assert.equal(await AJ.estVerrouille(db, junior.id), true, 'réactiver ne doit pas lever le verrouillage');
  assert.equal(await AJ.estSuspendu(db, junior.id), false);
});

test('supprimerAdminJunior — supprime le compte, ses tables satellites, et journalise dans audit_log', async () => {
  const db = makeDb();
  const adminId = await creerAdmin(db);
  const junior = await AJ.creerAdminJunior(db, { principalAdminId: adminId, catalogueIds: ['moderation.comptes.consulter'] });

  const ok = await AJ.supprimerAdminJunior(db, { juniorUserId: junior.id, acteurAdminId: adminId, acteurNom: 'Admin' });
  assert.equal(ok, true);

  const userRow = await db.prepare('SELECT id FROM users WHERE id=?').get(junior.id);
  assert.equal(userRow, undefined, 'la ligne users doit avoir disparu');
  const permsRow = await db.prepare('SELECT id FROM admin_junior_permissions WHERE junior_user_id=?').get(junior.id);
  assert.equal(permsRow, undefined, 'les permissions doivent avoir disparu');
  const metaRow = await db.prepare('SELECT user_id FROM admin_junior_meta WHERE user_id=?').get(junior.id);
  assert.equal(metaRow, undefined, 'la ligne meta doit avoir disparu');

  const audit = await db.prepare("SELECT * FROM audit_log WHERE cible_type='administrateur_junior' AND cible_id=?").get(junior.id);
  assert.ok(audit, 'la suppression doit être tracée dans audit_log (le journal du junior disparaît avec lui)');
  assert.equal(audit.action, 'admin_junior_supprime');
});

test('supprimerAdminJunior — id inexistant renvoie false sans lever d\'erreur', async () => {
  const db = makeDb();
  const ok = await AJ.supprimerAdminJunior(db, { juniorUserId: 999999, acteurAdminId: 1, acteurNom: 'Admin' });
  assert.equal(ok, false);
});

test('catalogue — intégrité (id uniques, (module,numero) uniques, chaque capability résolue)', () => {
  const ids = AJ.CATALOGUE_ADMIN_JUNIOR.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'id de catalogue dupliqué');

  const paires = AJ.CATALOGUE_ADMIN_JUNIOR.map(e => `${e.module}:${e.numero}`);
  assert.equal(new Set(paires).size, paires.length, 'paire (module,numero) dupliquée');

  for (const entree of AJ.CATALOGUE_ADMIN_JUNIOR) {
    assert.ok(AJ.catalogueIdsPourCapacite(entree.capability).includes(entree.id), `capability ${entree.capability} ne se résout pas vers ${entree.id}`);
  }
});

test('creerAdminJunior — numérotation par créateur (n°1, n°2 pour le même admin)', async () => {
  const db = makeDb();
  const adminId = await creerAdmin(db);
  const j1 = await AJ.creerAdminJunior(db, { principalAdminId: adminId, catalogueIds: [] });
  const j2 = await AJ.creerAdminJunior(db, { principalAdminId: adminId, catalogueIds: [] });
  assert.equal(j1.sequenceNumber, 1);
  assert.equal(j2.sequenceNumber, 2);
});
