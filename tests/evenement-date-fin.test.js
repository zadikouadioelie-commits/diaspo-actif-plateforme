/* ===========================================================
   tests/evenement-date-fin.test.js — Modifier un événement met aussi à jour sa date de fin (2026-10-30)
   ===========================================================
   Constaté en production : un organisateur déplaçait son événement du 7 au 21 novembre ; PUT /api/evenements/:id n'écrivait jamais date_fin,
   l'ancienne fin (7 novembre) restait et la fiche affichait « samedi 21 novembre → 7 novembre ».
   Lancer : node --test tests/evenement-date-fin.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env, jarO, jarA;
test.before(async () => {
  env = await H.demarrer('evtdatefin');
  jarO = H.cookieJar(); jarA = H.cookieJar();
  await H.creerFormateur(env, jarO, 'edf', 'Organisateur'); // administrateur : peut modifier tout événement
  await H.creerApprenant(env, jarA, 'edf', 'Autre');
});
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
const ownerId = () => sql('select id from users where email=?', H.compte('edf', 'Organisateur', 'utilisateur').email)[0].id;
const creer = (dateEvt, dateFin) => Number(sql("INSERT INTO evenements (titre, date_evt, date_fin, statut, owner_user_id, heure_debut, heure_fin) VALUES ('Journée test', ?, ?, 'ouvert', ?, '10:00', '19:30')", dateEvt, dateFin || null, ownerId()).lastInsertRowid);
const lire = id => sql('select date_evt, date_fin from evenements where id=?', id)[0];
const corps = (extra) => ({ titre: 'Journée test', date_evt: '2026-11-21', heure_debut: '10:00', heure_fin: '19:30', statut: 'ouvert', ...extra });
const modifier = (id, extra, jar) => env.call(jar || jarO, 'PUT', `/api/evenements/${id}`, corps(extra));

test('le cas réel : événement déplacé du 7 au 21 novembre sans date de fin envoyée → plus de « 21 → 7 »', async () => {
  const id = creer('2026-11-07', '2026-11-07');
  assert.equal((await modifier(id, { date_evt: '2026-11-21' })).status, 200);
  assert.deepEqual({ ...lire(id) }, { date_evt: '2026-11-21', date_fin: null });
});

test('donnée déjà abîmée (début 21, fin 7) : la prochaine modification nettoie la fin', async () => {
  const id = creer('2026-11-21', '2026-11-07');
  assert.equal((await modifier(id, {})).status, 200);
  assert.equal(lire(id).date_fin, null);
});

test('événement de plusieurs jours déplacé : la durée est conservée', async () => {
  const id = creer('2026-11-07', '2026-11-09');
  assert.equal((await modifier(id, { date_evt: '2026-11-21' })).status, 200);
  assert.deepEqual({ ...lire(id) }, { date_evt: '2026-11-21', date_fin: '2026-11-23' });
  /* Sans changement de date de début, la fin est laissée telle quelle. */
  assert.equal((await modifier(id, { titre: 'Journée test (renommée)' })).status, 200);
  assert.equal(lire(id).date_fin, '2026-11-23');
});

test('date de fin envoyée : appliquée ; vide : journée unique ; invalide : refusée ; fin avant le début : ignorée', async () => {
  const id = creer('2026-11-21');
  assert.equal((await modifier(id, { date_fin: '2026-11-22' })).status, 200);
  assert.equal(lire(id).date_fin, '2026-11-22');
  assert.equal((await modifier(id, { date_fin: '2026-11-22T00:00:00.000Z' })).status, 200, 'un horodatage est réduit au jour');
  assert.equal(lire(id).date_fin, '2026-11-22');
  assert.equal((await modifier(id, { date_fin: 'bientôt' })).status, 400);
  assert.equal(lire(id).date_fin, '2026-11-22', 'refus : rien n\'est écrit');
  assert.equal((await modifier(id, { date_fin: '2026-11-10' })).status, 200);
  assert.equal(lire(id).date_fin, null, 'une fin antérieure au début n\'a aucun sens : supprimée');
  assert.equal((await modifier(id, { date_fin: '2026-11-25' })).status, 200);
  assert.equal((await modifier(id, { date_fin: '' })).status, 200);
  assert.equal(lire(id).date_fin, null);
});

test('un autre compte ne peut toujours pas modifier l\'événement', async () => {
  const id = creer('2026-11-21');
  assert.equal((await modifier(id, { date_fin: '2026-11-30' }, jarA)).status, 403);
  assert.equal(lire(id).date_fin, null);
});
