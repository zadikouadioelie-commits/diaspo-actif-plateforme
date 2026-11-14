/* ===========================================================
   tests/insc-jamais-fermee.test.js — une fiche d'inscription ne se ferme jamais toute seule (2026-11-14)
   ===========================================================
   Demande explicite (cas du Trophée Ngovu) : « ne ferme jamais les fiches, même si la date est passée, tant que la personne
   n'a pas supprimé son événement ; fais seulement passer l'événement en terminé ».
   Ni la date de fermeture saisie, ni la fin de l'événement lié ne ferment plus la fiche. Seule la fermeture MANUELLE du
   propriétaire (statut « fermee ») la ferme encore.

   Lancer : node --test tests/insc-jamais-fermee.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

const SLUG = 'test-gala-diaspora-2026';

let env;
test.before(async () => { env = await H.demarrer('insc-jamais-fermee'); });
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout = 8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
let n = 0;
const appel = async (method, url, body) => {
  const res = await fetch(env.base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.8.${Math.floor(++n / 200)}.${n % 200}` }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
};
const lire = () => appel('GET', `/api/insc/public/${SLUG}`);

test('date de fermeture dépassée : la fiche reste ouverte', async () => {
  sql("UPDATE insc_fiches SET statut='publiee', date_fermeture_inscriptions='2020-01-01T23:59', prolongee_jusquau=NULL WHERE slug=?", SLUG);
  const r = await lire();
  assert.equal(r.status, 200);
  assert.ok(!r.data.fermee, 'une date passée ne ferme plus la fiche');
  assert.ok(Array.isArray(r.data.types), 'le formulaire est servi');
});

test('événement lié terminé : la fiche reste ouverte', async () => {
  const f = sql('SELECT id FROM insc_fiches WHERE slug=?', SLUG)[0];
  sql("INSERT INTO evenements (owner_user_id, titre, date_evt, date_fin, statut) SELECT id, 'Événement passé (test)', '2020-01-01', '2020-01-02', 'publie' FROM users LIMIT 1");
  const e = sql("SELECT id FROM evenements WHERE titre='Événement passé (test)' ORDER BY id DESC LIMIT 1")[0];
  assert.ok(e, 'événement de test créé');
  sql('DELETE FROM insc_fiches_evenements WHERE fiche_id=?', f.id);
  sql('INSERT INTO insc_fiches_evenements (fiche_id, evenement_id) VALUES (?, ?)', f.id, e.id);
  const r = await lire();
  assert.ok(!r.data.fermee, "la fin de l'événement ne ferme plus la fiche");
  assert.ok(Array.isArray(r.data.types));
  sql('DELETE FROM insc_fiches_evenements WHERE fiche_id=?', f.id);
  sql('DELETE FROM evenements WHERE id=?', e.id);
});

test('fermeture manuelle du propriétaire : la fiche reste fermée', async () => {
  sql("UPDATE insc_fiches SET statut='fermee' WHERE slug=?", SLUG);
  const r = await lire();
  assert.equal(r.data.fermee, true);
  sql("UPDATE insc_fiches SET statut='publiee' WHERE slug=?", SLUG);
});
