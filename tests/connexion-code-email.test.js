/* ===========================================================
   tests/connexion-code-email.test.js — connexion sans mot de passe par code provisoire à 4 chiffres (2026-11-04)
   ===========================================================
   Règle du titulaire : le mot de passe suffit ; qui n'a pas son mot de passe reçoit, à l'adresse e-mail DU COMPTE saisi, un code à
   4 chiffres (10 minutes, 3 essais) qui l'y connecte. Vrai SQL (SQLite en mémoire), aucun serveur.
   Lancer : node --test tests/connexion-code-email.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
/* confirmation-appareil → connexions → auth → db.js ouvre une base au chargement : une base temporaire évite de verrouiller la vraie. */
process.env.DIASPOACTIF_TEST_DB_PATH = path.join(os.tmpdir(), `da-code-email-${process.pid}.db`);
const { DatabaseSync } = require('node:sqlite');
const CA = require('../server/confirmation-appareil');

/* Base en mémoire + adaptateur async (même forme que le module db du serveur). */
function nouvelleBase() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`
    CREATE TABLE confirmations_appareil (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, appareil_id TEXT NOT NULL, type_appareil TEXT, navigateur TEXT, os TEXT,
      ville TEXT, pays TEXT, ip_masquee TEXT, statut TEXT NOT NULL DEFAULT 'en_attente', essais INTEGER DEFAULT 0, code_email_hash TEXT, code_email_expire TEXT,
      envois_email INTEGER DEFAULT 0, created_at TEXT, expire_at TEXT, resolu_at TEXT);
    CREATE TABLE appareils_reconnus (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, appareil_id TEXT NOT NULL, via TEXT, confirme_at TEXT, expire_at TEXT);
    CREATE TABLE connexions (id TEXT PRIMARY KEY, user_id INTEGER, appareil_id TEXT, type_appareil TEXT, last_seen_at TEXT, expire_at TEXT, revoque_at TEXT);`);
  return {
    raw,
    prepare: (sql) => ({
      get: async (...a) => raw.prepare(sql).get(...a),
      all: async (...a) => raw.prepare(sql).all(...a),
      run: async (...a) => raw.prepare(sql).run(...a),
    }),
  };
}
const APPAREIL = 'a'.repeat(32);
const req = (appareil = APPAREIL) => ({ headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36', cookie: appareil ? `da_dev=${appareil}` : '' }, socket: {} });
const user = (extra = {}) => ({ id: 7, email: 'membre@example.com', role: 'utilisateur', is_demo: 0, ...extra });

test('qui peut recevoir un code : membres oui ; démo, administrateurs, accès invité non', () => {
  assert.equal(CA.codeEmailAutorise(user()), true);
  assert.equal(CA.codeEmailAutorise(user({ role: 'initiative' })), true);
  assert.equal(CA.codeEmailAutorise(user({ role: 'collectivite' })), true);
  assert.equal(CA.codeEmailAutorise(user({ role: 'administrateur' })), false, 'un e-mail piraté ne doit pas ouvrir un compte à privilèges');
  assert.equal(CA.codeEmailAutorise(user({ role: 'administrateur_junior' })), false);
  assert.equal(CA.codeEmailAutorise(user({ email: 'jean@diaspoactif.demo' })), false);
  assert.equal(CA.codeEmailAutorise(user({ is_demo: 1 })), false);
  assert.equal(CA.codeEmailAutorise(user({ relais_invite_fiche_id: 3 })), false);
  assert.equal(CA.codeEmailAutorise(null), false);
});

test('demander puis saisir le bon code : accepté une seule fois', async () => {
  const db = nouvelleBase();
  const p = await CA.demanderCodeConnexion(db, { req: req(), user: user(), ip: '203.0.113.5' });
  assert.match(p.code, /^\d{4}$/);
  assert.equal(p.nouveauCookie, false);
  assert.equal(p.appareilId, APPAREIL);
  const ligne = db.raw.prepare('SELECT * FROM confirmations_appareil').get();
  assert.equal(ligne.statut, 'code_connexion');
  assert.notEqual(ligne.code_email_hash, p.code, 'le code n\'est jamais stocké en clair');
  assert.ok(!JSON.stringify(ligne).includes(`"${p.code}"`));

  const r = await CA.verifierCodeConnexion(db, { req: req(), user: user(), saisie: p.code });
  assert.equal(r.ok, true);
  assert.equal(db.raw.prepare('SELECT statut FROM confirmations_appareil').get().statut, 'code_utilise');
  const rejoue = await CA.verifierCodeConnexion(db, { req: req(), user: user(), saisie: p.code });
  assert.equal(rejoue.ok, false, 'un code déjà utilisé ne rouvre rien');
});

test('un navigateur sans cookie reçoit un identifiant d\'appareil neuf', async () => {
  const db = nouvelleBase();
  const p = await CA.demanderCodeConnexion(db, { req: req(null), user: user(), ip: '203.0.113.5' });
  assert.equal(p.nouveauCookie, true);
  assert.match(p.appareilId, /^[a-f0-9]{32}$/);
});

test('le code ne vaut que depuis le navigateur qui l\'a demandé et pour le compte qui l\'a reçu', async () => {
  const db = nouvelleBase();
  const p = await CA.demanderCodeConnexion(db, { req: req(), user: user(), ip: '203.0.113.5' });
  assert.equal((await CA.verifierCodeConnexion(db, { req: req('b'.repeat(32)), user: user(), saisie: p.code })).ok, false, 'autre navigateur');
  assert.equal((await CA.verifierCodeConnexion(db, { req: req(null), user: user(), saisie: p.code })).ok, false, 'sans cookie');
  assert.equal((await CA.verifierCodeConnexion(db, { req: req(), user: user({ id: 8, email: 'autre@example.com' }), saisie: p.code })).ok, false, 'autre compte');
  assert.equal((await CA.verifierCodeConnexion(db, { req: req(), user: user(), saisie: p.code })).ok, true, 'le bon couple navigateur + compte passe toujours');
});

test('comptes liés : le code d\'une adresse n\'ouvre que le compte de cette adresse', async () => {
  const db = nouvelleBase();
  const initiative = user({ id: 11, email: 'xxx@bat.com', role: 'initiative' }), utilisateur = user({ id: 12, email: 'aaa@mail.com' });
  const p = await CA.demanderCodeConnexion(db, { req: req(), user: initiative, ip: '203.0.113.5' });
  assert.equal((await CA.verifierCodeConnexion(db, { req: req(), user: utilisateur, saisie: p.code })).ok, false, 'le code reçu sur l\'adresse de l\'Initiative n\'ouvre pas le compte Utilisateur');
  assert.equal((await CA.verifierCodeConnexion(db, { req: req(), user: initiative, saisie: p.code })).ok, true);
});

test('trois mauvais codes annulent la demande, même le bon code ne passe plus', async () => {
  const db = nouvelleBase();
  const p = await CA.demanderCodeConnexion(db, { req: req(), user: user(), ip: '203.0.113.5' });
  const faux = p.code === '0000' ? '1111' : '0000';
  const r1 = await CA.verifierCodeConnexion(db, { req: req(), user: user(), saisie: faux });
  assert.deepEqual([r1.ok, r1.restants], [false, 2]);
  const r2 = await CA.verifierCodeConnexion(db, { req: req(), user: user(), saisie: faux });
  assert.deepEqual([r2.ok, r2.restants], [false, 1]);
  const r3 = await CA.verifierCodeConnexion(db, { req: req(), user: user(), saisie: faux });
  assert.equal(r3.ok, false); assert.equal(r3.bloque, true);
  assert.equal(db.raw.prepare('SELECT statut FROM confirmations_appareil').get().statut, 'code_bloque');
  assert.equal((await CA.verifierCodeConnexion(db, { req: req(), user: user(), saisie: p.code })).ok, false);
});

test('des essais lancés en parallèle ne multiplient pas les chances (compteur atomique)', async () => {
  const db = nouvelleBase();
  const p = await CA.demanderCodeConnexion(db, { req: req(), user: user(), ip: '203.0.113.5' });
  /* 40 saisies simultanées de codes différents, dont la bonne : au plus 3 sont réellement comparées. */
  const essais = [];
  for (let n = 0; n < 39; n++) essais.push(String(n).padStart(4, '0'));
  essais.push(p.code);
  const reps = await Promise.all(essais.map(saisie => CA.verifierCodeConnexion(db, { req: req(), user: user(), saisie })));
  const comparees = reps.filter(r => r.ok || typeof r.restants === 'number').length;
  assert.ok(comparees <= CA.MAX_ESSAIS_CODE, 'comparées : ' + comparees);
});

test('un format invalide compte comme un essai raté ; 3 ou 5 chiffres jamais acceptés', async () => {
  const db = nouvelleBase();
  const p = await CA.demanderCodeConnexion(db, { req: req(), user: user(), ip: '203.0.113.5' });
  const r = await CA.verifierCodeConnexion(db, { req: req(), user: user(), saisie: p.code.slice(0, 3) });
  assert.deepEqual([r.ok, r.restants], [false, 2]);
  const r5 = await CA.verifierCodeConnexion(db, { req: req(), user: user(), saisie: p.code + '0' });
  assert.equal(r5.ok, false);
});

test('un code expiré n\'ouvre rien', async () => {
  const db = nouvelleBase();
  const p = await CA.demanderCodeConnexion(db, { req: req(), user: user(), ip: '203.0.113.5' });
  db.raw.prepare("UPDATE confirmations_appareil SET code_email_expire='2000-01-01 00:00:00'").run();
  assert.equal((await CA.verifierCodeConnexion(db, { req: req(), user: user(), saisie: p.code })).ok, false);
  assert.equal(db.raw.prepare('SELECT statut FROM confirmations_appareil').get().statut, 'code_expire');
});

test('une nouvelle demande annule la précédente', async () => {
  const db = nouvelleBase();
  const a = await CA.demanderCodeConnexion(db, { req: req(), user: user(), ip: '203.0.113.5' });
  const b = await CA.demanderCodeConnexion(db, { req: req(), user: user(), ip: '203.0.113.5' });
  const statuts = db.raw.prepare('SELECT statut FROM confirmations_appareil ORDER BY created_at, rowid').all().map(x => x.statut);
  assert.deepEqual(statuts, ['code_remplace', 'code_connexion']);
  if (a.code !== b.code) assert.equal((await CA.verifierCodeConnexion(db, { req: req(), user: user(), saisie: a.code })).ok, false, 'l\'ancien code ne vaut plus');
});

test('plafonds : 5 codes par heure, puis plus aucun après 3 codes bloqués en 24 h', async () => {
  const db = nouvelleBase();
  for (let n = 0; n < CA.MAX_CODES_PAR_HEURE; n++) assert.ok((await CA.demanderCodeConnexion(db, { req: req(), user: user(), ip: '203.0.113.5' })).code);
  assert.equal((await CA.demanderCodeConnexion(db, { req: req(), user: user(), ip: '203.0.113.5' })).limite, true);

  const db2 = nouvelleBase();
  for (let n = 0; n < CA.MAX_CODES_BLOQUES_PAR_JOUR; n++) {
    db2.raw.prepare("INSERT INTO confirmations_appareil (id, user_id, appareil_id, statut, created_at, resolu_at) VALUES (?,?,?,?,?,?)")
      .run(crypto.randomBytes(16).toString('hex'), 7, APPAREIL, 'code_bloque', '2000-01-01 00:00:00', require('../server/connexions').horodatage());
  }
  assert.equal((await CA.demanderCodeConnexion(db2, { req: req(), user: user(), ip: '203.0.113.5' })).verrouille, true);
  assert.equal(await CA.incidents30j(db2, 7), 3, 'les codes bloqués apparaissent dans les incidents de « Mes connexions »');
});

test('appareil reconnu 30 jours après une connexion ; l\'entrée par DS-ID seul le vérifie', async () => {
  const db = nouvelleBase();
  assert.equal(await CA.estReconnu(db, 7, APPAREIL), false);
  await CA.reconnaitre(db, 7, APPAREIL, 'mot_de_passe');
  assert.equal(await CA.estReconnu(db, 7, APPAREIL), true);
  assert.equal(await CA.estReconnu(db, 8, APPAREIL), false, 'reconnu pour ce compte seulement');

  /* compte ouvert ailleurs (autre ordinateur actif) + appareil inconnu => requis ; appareil reconnu => ok */
  const maintenant = require('../server/connexions').horodatage();
  db.raw.prepare("INSERT INTO connexions (id, user_id, appareil_id, type_appareil, last_seen_at, expire_at) VALUES (?,?,?,?,?,?)")
    .run('c'.repeat(32), 9, 'd'.repeat(32), 'ordinateur', maintenant, require('../server/connexions').horodatage(3600 * 1000));
  const inconnu = await CA.evaluer(db, { req: req('e'.repeat(32)), user: user({ id: 9, email: 'neuf@example.com' }), ip: '203.0.113.5' });
  assert.equal(inconnu.requis, true);
  await CA.reconnaitre(db, 9, 'e'.repeat(32), 'code_email');
  assert.equal((await CA.evaluer(db, { req: req('e'.repeat(32)), user: user({ id: 9, email: 'neuf@example.com' }), ip: '203.0.113.5' })).ok, true);
});

test('les anciens codes (3 chiffres, multi-connexion, DS-ID de confirmation) ne sont plus exposés', () => {
  for (const nom of ['codeNotif', 'codeNotifValide', 'aCodeMulti', 'codeMultiValide', 'preparerCodeEmail', 'codeEmailValide', 'valider', 'charger', 'compterEchec'])
    assert.equal(CA[nom], undefined, nom);
  assert.equal(CA.MAX_ESSAIS_CODE, 3);
});
