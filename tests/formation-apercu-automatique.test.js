/* ===========================================================
   tests/formation-apercu-automatique.test.js — aperçu gratuit automatique (2026-10-31)
   ===========================================================
   Règle : les 3 premières leçons d'une formation sont offertes en aperçu par défaut ; un choix explicite est respecté ; un quiz n'est jamais offert.
   Lancer : node --test tests/formation-apercu-automatique.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('apercu-auto'); });
test.after(() => { if (env) env.stop(); });

test('les 3 premières leçons sont offertes, les suivantes non, le choix explicite prime', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jar = H.cookieJar(), call = env.call;
  await H.creerFormateur(env, jar, rnd, 'Formateur');
  const f = (await call(jar, 'POST', '/api/formations', { titre: 'Aperçu ' + rnd, description: 'x' })).data.id;
  const m = (await call(jar, 'POST', `/api/formations/${f}/modules`, { titre: 'M' })).data.id;
  const c = (await call(jar, 'POST', `/api/formations/${f}/modules/${m}/chapitres`, { titre: 'C' })).data.id;
  const lec = async (titre, extra = {}) => (await call(jar, 'POST', `/api/formations/${f}/chapitres/${c}/lecons`, { titre, type: 'texte', ...extra })).data.id;
  const ids = [await lec('1'), await lec('2'), await lec('3'), await lec('4'), await lec('5')];
  const lues = async () => { const mm = (await call(jar, 'GET', `/api/formations/${f}/modules`)).data.modules[0]; return mm.chapitres[0].lecons.map(l => Number(l.apercu_gratuit)); };
  assert.deepEqual(await lues(), [1, 1, 1, 0, 0], 'les trois premières seulement');

  /* Une nouvelle formation : choix explicite « non » respecté, quiz jamais offert */
  const g = (await call(jar, 'POST', '/api/formations', { titre: 'Aperçu B ' + rnd, description: 'x' })).data.id;
  const m2 = (await call(jar, 'POST', `/api/formations/${g}/modules`, { titre: 'M' })).data.id;
  const c2 = (await call(jar, 'POST', `/api/formations/${g}/modules/${m2}/chapitres`, { titre: 'C' })).data.id;
  await call(jar, 'POST', `/api/formations/${g}/chapitres/${c2}/lecons`, { titre: 'refusée', type: 'texte', apercu_gratuit: false });
  await call(jar, 'POST', `/api/formations/${g}/chapitres/${c2}/lecons`, { titre: 'un quiz', type: 'quiz' });
  await call(jar, 'POST', `/api/formations/${g}/chapitres/${c2}/lecons`, { titre: 'libre', type: 'texte' });
  const lg = (await call(jar, 'GET', `/api/formations/${g}/modules`)).data.modules[0].chapitres[0].lecons.map(l => Number(l.apercu_gratuit));
  assert.deepEqual(lg, [0, 0, 1], 'refus explicite respecté, quiz jamais offert, leçon libre offerte (moins de 3 leçons déjà présentes)');
  assert.ok(ids.length === 5);
});
