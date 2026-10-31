/* ===========================================================
   tests/formation-reordonner.test.js — réordonner modules et chapitres dans le constructeur (2026-10-31)
   ===========================================================
   Défaut corrigé : « reorder » était lu comme un identifiant par les routes « modifier un module / un chapitre », déclarées avant lui :
   le glisser-déposer répondait « introuvable » et l'ordre ne changeait jamais.
   Lancer : node --test tests/formation-reordonner.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('reordonner'); });
test.after(() => { if (env) env.stop(); });

test('réordonner les modules, les chapitres et les leçons', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jar = H.cookieJar(), call = env.call;
  await H.creerFormateur(env, jar, rnd, 'Formateur');
  const f = (await call(jar, 'POST', '/api/formations', { titre: 'Ordre ' + rnd, description: 'x' })).data.id;
  const mod = async titre => (await call(jar, 'POST', `/api/formations/${f}/modules`, { titre })).data.id;
  const [m1, m2, m3] = [await mod('A'), await mod('B'), await mod('C')];
  const ordreModules = async () => (await call(jar, 'GET', `/api/formations/${f}/modules`)).data.modules.map(m => m.id);
  assert.deepEqual(await ordreModules(), [m1, m2, m3]);

  /* Modules */
  let r = await call(jar, 'PUT', `/api/formations/${f}/modules/reorder`, { ordre: [m3, m1, m2] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(await ordreModules(), [m3, m1, m2], 'le dernier module passe en premier');

  /* Chapitres */
  const chap = async titre => (await call(jar, 'POST', `/api/formations/${f}/modules/${m1}/chapitres`, { titre })).data.id;
  const [c1, c2, c3] = [await chap('1'), await chap('2'), await chap('3')];
  r = await call(jar, 'PUT', `/api/formations/${f}/modules/${m1}/chapitres/reorder`, { ordre: [c3, c2, c1] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const lu = (await call(jar, 'GET', `/api/formations/${f}/modules`)).data.modules.find(m => m.id === m1);
  assert.deepEqual(lu.chapitres.map(c => c.id), [c3, c2, c1], 'chapitres réordonnés');

  /* Leçons (déjà fonctionnel : on vérifie qu'il le reste) */
  const lec = async titre => (await call(jar, 'POST', `/api/formations/${f}/chapitres/${c3}/lecons`, { titre, type: 'texte' })).data.id;
  const [l1, l2] = [await lec('x'), await lec('y')];
  r = await call(jar, 'PUT', `/api/formations/${f}/chapitres/${c3}/lecons/reorder`, { ordre: [l2, l1] });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  /* Les routes « modifier » continuent de fonctionner */
  r = await call(jar, 'PUT', `/api/formations/${f}/modules/${m2}`, { titre: 'B renommé' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call(jar, 'PUT', `/api/formations/${f}/modules/${m1}/chapitres/${c1}`, { titre: '1 renommé' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
});
