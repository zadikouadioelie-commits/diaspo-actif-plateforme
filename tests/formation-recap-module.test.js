/* ===========================================================
   tests/formation-recap-module.test.js — fin de module : carte mentale et récapitulatif PDF automatiques (2026-10-31)
   ===========================================================
   Deux options de formation, cochables par tout créateur. Le contenu vient des titres, des blocs « À retenir » et « Exercice » (leçon texte ou Studio).
   Débloqué à la fin des activités obligatoires du module ; le formateur voit toujours (aperçu) ; un non-inscrit n'a rien.
   Lancer : node --test tests/formation-recap-module.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');
const R = require('../server/formation-recap-module');

test('extraction : « À retenir » et « Exercice » (même ligne, lignes suivantes, listes)', () => {
  const l = R.lignesDeHtml('<p>Intro</p><h3>À retenir</h3><ul><li>Premier point</li><li>Second point</li></ul><p><strong>Exercice :</strong> écrivez une phrase.</p>');
  assert.deepEqual(l, ['Intro', 'À retenir', 'Premier point', 'Second point', 'Exercice : écrivez une phrase.']);
  let x = R.extraire(l);
  assert.deepEqual(x.retenir, ['Premier point', 'Second point']);
  assert.deepEqual(x.exercice, ['écrivez une phrase.']);
  x = R.extraire(['À retenir : une impression d\'illégitimité n\'est pas une preuve d\'incompétence.', 'Exercice', 'Décrivez une réussite.']);
  assert.deepEqual(x.retenir, ['une impression d\'illégitimité n\'est pas une preuve d\'incompétence.']);
  assert.deepEqual(x.exercice, ['Décrivez une réussite.']);
  x = R.extraire(['Un texte sans bloc repéré.']);
  assert.deepEqual(x, { retenir: [], exercice: [] });
});

let env;
test.before(async () => { env = await H.demarrer('recapmodule'); });
test.after(() => { if (env) env.stop(); });

const sql = (req, ...a) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).all(...a); } finally { db.close(); } };

test('options, déblocage à la fin du module, PDF, carte, copie, aperçu formateur', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarB = H.cookieJar(), call = env.call;
  await H.creerFormateur(env, jarF, rnd, 'Formateur'); await H.creerApprenant(env, jarA, rnd, 'Alpha'); await H.creerApprenant(env, jarB, rnd, 'Beta');

  const f = (await call(jarF, 'POST', '/api/formations', { titre: 'Recap ' + rnd, description: 'x' })).data.id;
  const m1 = (await call(jarF, 'POST', `/api/formations/${f}/modules`, { titre: 'Module un', description: 'Objectif du module un.' })).data.id;
  const m2 = (await call(jarF, 'POST', `/api/formations/${f}/modules`, { titre: 'Module deux' })).data.id;
  const c1 = (await call(jarF, 'POST', `/api/formations/${f}/modules/${m1}/chapitres`, { titre: 'Chapitre un' })).data.id;
  const c2 = (await call(jarF, 'POST', `/api/formations/${f}/modules/${m2}/chapitres`, { titre: 'Chapitre deux' })).data.id;
  /* Leçon texte avec « À retenir » + « Exercice » ; leçon Studio avec les mêmes blocs ; leçon d'un autre module */
  const l1 = (await call(jarF, 'POST', `/api/formations/${f}/chapitres/${c1}/lecons`, { titre: 'Lecon texte', type: 'texte', duree_minutes: 5, contenu_texte: '<p>Du contenu.</p><p>A retenir : Idee cle numero un.</p><p><strong>Exercice :</strong> Faites le point sur votre journee.</p>' })).data.id;
  const l2 = (await call(jarF, 'POST', `/api/formations/${f}/chapitres/${c1}/lecons`, { titre: 'Lecon Studio', type: 'texte', duree_minutes: 5 })).data.id;
  const doc = { mode: 'structure', pages: [{ id: 'p1', titre: '', fond: '#ffffff', elements: [
    { id: 'a1', type: 'titre', x: 0, y: 0, w: 860, h: 60, z: 1, locked: false, props: { html: 'Lecon Studio' } },
    { id: 'a2', type: 'soustitre', x: 0, y: 0, w: 860, h: 40, z: 1, locked: false, props: { html: 'À retenir' } },
    { id: 'a3', type: 'encadre', x: 0, y: 0, w: 860, h: 80, z: 1, locked: false, props: { html: '<p>Idee cle numero deux.</p>', fond: '#F3EEFF' } },
    { id: 'a4', type: 'soustitre', x: 0, y: 0, w: 860, h: 40, z: 1, locked: false, props: { html: 'Exercice personnel' } },
    { id: 'a5', type: 'encadre', x: 0, y: 0, w: 860, h: 80, z: 1, locked: false, props: { html: '<p>Ecrivez trois lignes.</p>', fond: '#EAF8EF' } }] }] };
  assert.equal((await call(jarF, 'PUT', `/api/formations/${f}/lecons/${l2}/studio`, doc)).status, 200);
  assert.equal((await call(jarF, 'POST', `/api/formations/${f}/lecons/${l2}/studio/publier`, {})).status, 200);
  const l3 = (await call(jarF, 'POST', `/api/formations/${f}/chapitres/${c2}/lecons`, { titre: 'Lecon du module deux', type: 'texte', contenu_texte: '<p>x</p>' })).data.id;
  const sq = new H.DatabaseSync(env.dbPath);
  sq.prepare("UPDATE formations SET mode_acces='gratuit', gratuit=1, prix=0 WHERE id=?").run(f); sq.close();
  H.publier(env, f);
  assert.equal((await call(jarA, 'POST', `/api/formations/${f}/inscrire`, {})).status, 201);

  /* 1. Options éteintes : rien */
  let r = await call(jarA, 'GET', `/api/formations/${f}/fin-de-module`);
  assert.equal(r.status, 200); assert.equal(r.data.carte, false); assert.equal(r.data.recap, false); assert.deepEqual(r.data.modules, []);
  assert.equal((await call(jarF, 'GET', `/api/formations/${f}/modules/${m1}/recapitulatif.pdf`)).status, 404, 'option éteinte : 404');

  /* 2. Réglage : le propriétaire seulement */
  assert.equal((await call(jarA, 'PUT', `/api/formations/${f}/reglages`, { carte_module: true })).status, 403);
  r = await call(jarF, 'PUT', `/api/formations/${f}/reglages`, { carte_module: true, recap_module: true });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.carte_module, 1); assert.equal(r.data.recap_module, 1);
  r = await call(null, 'GET', `/api/formations/${f}`);
  assert.equal(Number(r.data.formation.carte_module), 1); assert.equal(Number(r.data.formation.recap_module), 1);
  /* modifiable aussi une fois la formation publiée, et l'autre réglage reste intact */
  assert.equal((await call(jarF, 'PUT', `/api/formations/${f}/reglages`, { carte_module: false })).data.recap_module, 1);
  await call(jarF, 'PUT', `/api/formations/${f}/reglages`, { carte_module: true });

  /* 3. L'apprenant n'a pas encore fini le module : verrouillé */
  r = await call(jarA, 'GET', `/api/formations/${f}/fin-de-module`);
  assert.equal(r.data.modules.length, 2); const e1 = r.data.modules.find(m => m.id === m1);
  assert.equal(e1.termine, false); assert.equal(e1.disponible, false);
  r = await call(jarA, 'GET', `/api/formations/${f}/modules/${m1}/recapitulatif.pdf`);
  assert.equal(r.status, 403); assert.equal(r.data.code, 'module_non_termine');
  assert.equal((await call(jarA, 'POST', `/api/formations/${f}/modules/${m1}/carte`, {})).status, 403);
  assert.equal((await call(jarB, 'GET', `/api/formations/${f}/fin-de-module`)).status, 403, 'non inscrit : rien');

  /* 4. Il termine le module (toutes les activités obligatoires) : débloqué ; le module deux ne l'est pas */
  for (const l of [l1, l2]) assert.equal((await call(jarA, 'POST', `/api/formations/${f}/lecons/${l}/progression`, { termine: true })).status, 200);
  r = await call(jarA, 'GET', `/api/formations/${f}/fin-de-module`);
  assert.equal(r.data.modules.find(m => m.id === m1).disponible, true); assert.equal(r.data.modules.find(m => m.id === m2).disponible, false);

  /* 5. PDF : vrai PDF, avec le contenu du créateur (texte et Studio) */
  const pdfRes = await rawGet(jarA, `/api/formations/${f}/modules/${m1}/recapitulatif.pdf`);
  assert.equal(pdfRes.status, 200); assert.match(pdfRes.type, /application\/pdf/); assert.match(pdfRes.disposition, /recapitulatif-Module-un\.pdf/);
  assert.ok(pdfRes.buf.toString('latin1').startsWith('%PDF-1.4'));
  const txt = texteDuPdf(pdfRes.buf);
  for (const mot of ['Module un', 'Chapitre un', 'Lecon texte', 'Lecon Studio', 'Idee cle numero un', 'Idee cle numero deux', 'Faites le point sur votre journee', 'Ecrivez trois lignes', 'Objectif du module un']) assert.ok(txt.includes(mot), 'PDF contient : ' + mot);
  assert.ok(!txt.includes('Lecon du module deux'), 'rien d\'un autre module');
  assert.equal((await call(jarA, 'GET', `/api/formations/${f}/modules/${m2}/recapitulatif.pdf`)).status, 403, 'module deux pas terminé');

  /* 6. Carte mentale : créée, lisible par l'apprenant, mise à jour sans doublon, copiable */
  r = await call(jarA, 'POST', `/api/formations/${f}/modules/${m1}/carte`, {});
  assert.equal(r.status, 200, JSON.stringify(r.data)); const idCarte = r.data.id;
  const lue = await call(jarA, 'GET', `/api/cartes-mentales/${idCarte}`);
  assert.equal(lue.status, 200); assert.equal(lue.data.edition, false, 'lecture seule');
  const racine = lue.data.carte.data.racine;
  assert.equal(racine.texte, 'Module un'); assert.equal(racine.enfants[0].texte, 'Chapitre un');
  const noeudsLecons = racine.enfants[0].enfants.map(n => n.texte); assert.deepEqual(noeudsLecons, ['Lecon texte', 'Lecon Studio']);
  assert.equal(racine.enfants[0].enfants[0].enfants[0].texte, 'Idee cle numero un.');
  assert.match(racine.enfants[0].enfants[1].note, /Ecrivez trois lignes/);
  assert.deepEqual(racine.enfants[0].enfants[0].lien.type, 'lecon');
  r = await call(jarA, 'POST', `/api/formations/${f}/modules/${m1}/carte`, {}); assert.equal(r.data.id, idCarte, 'même carte, mise à jour');
  assert.equal(sql('SELECT COUNT(*) n FROM cartes_mentales WHERE formation_id=? AND module_id=?', f, m1)[0].n, 1);
  r = await call(jarA, 'POST', `/api/cartes-mentales/${idCarte}/copier`, {});
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const copie = await call(jarA, 'GET', `/api/cartes-mentales/${r.data.id}`);
  assert.equal(copie.data.edition, true, 'la copie est modifiable'); assert.equal(copie.data.carte.formation_id, null);
  assert.equal((await call(jarB, 'POST', `/api/cartes-mentales/${idCarte}/copier`, {})).status, 404, 'un non-inscrit ne copie pas');

  /* 7. Le formateur voit tout en aperçu, sans rien avoir terminé */
  r = await call(jarF, 'GET', `/api/formations/${f}/fin-de-module`);
  assert.ok(r.data.modules.every(m => m.disponible && m.apercu));
  assert.equal((await rawGet(jarF, `/api/formations/${f}/modules/${m2}/recapitulatif.pdf`)).status, 200);
  assert.equal((await call(jarF, 'POST', `/api/formations/${f}/modules/${m2}/carte`, {})).status, 200);
});

/* Texte lisible d'un PDF : on décompresse chaque flux et on garde le contenu (les chaînes sont en clair entre parenthèses). */
function texteDuPdf(buf) {
  const zlib = require('node:zlib'); const brut = buf.toString('latin1'); let out = brut;
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g; let m;
  while ((m = re.exec(brut))) { try { out += '\n' + zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch (_) { /* image ou flux non compressé */ } }
  return out;
}

/* GET binaire avec les cookies du bocal */
async function rawGet(jar, chemin) {
  const headers = {}; jar.apply(headers);
  const r = await fetch(env.base + chemin, { headers });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, type: r.headers.get('content-type') || '', disposition: r.headers.get('content-disposition') || '', buf };
}
