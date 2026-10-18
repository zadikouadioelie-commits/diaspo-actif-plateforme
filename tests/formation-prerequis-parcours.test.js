/* ===========================================================
   tests/formation-prerequis-parcours.test.js — Diaspo'Actif Formation, lot 3 (2026-10-18)
   ===========================================================
   Prérequis entre formations (inscription refusée tant qu'ils ne sont pas terminés, cycles refusés) et parcours de formation (étapes, statuts, prochaine étape).
   Intégration HTTP réelle, base SQLite isolée (voir tests/_formation-harness.js).
   Lancer : node --test tests/formation-prerequis-parcours.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('prerequis'); });
test.after(() => { if (env) env.stop(); });

test('prérequis et parcours de formation', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarB = H.cookieJar();
  const call = env.call;
  let fa, fb, fc, la, lb, pid;

  async function formation(titre) {
    const id = (await call(jarF, 'POST', '/api/formations', { titre: titre + ' ' + rnd, description: 'x' })).data.id;
    const mod = (await call(jarF, 'POST', `/api/formations/${id}/modules`, { titre: 'M' })).data.id;
    const ch = (await call(jarF, 'POST', `/api/formations/${id}/modules/${mod}/chapitres`, { titre: 'C' })).data.id;
    const l = (await call(jarF, 'POST', `/api/formations/${id}/chapitres/${ch}/lecons`, { titre: 'L', type: 'texte', contenu_texte: '<p>x</p>' })).data.id;
    H.publier(env, id);
    return { id, l };
  }

  await t.test('setup — trois formations publiées (A, B, C) et deux apprenants', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    await H.creerApprenant(env, jarA, rnd, 'Apprenant');
    await H.creerApprenant(env, jarB, rnd, 'Autre');
    ({ id: fa, l: la } = await formation('Bases'));
    ({ id: fb, l: lb } = await formation('Avancé'));
    ({ id: fc } = await formation('Expert'));
  });

  await t.test('prérequis : seul le formateur les fixe ; ni soi-même, ni boucle', async () => {
    assert.equal((await call(jarA, 'PUT', `/api/formations/${fb}/prerequis`, { ids: [fa] })).status, 403);
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fb}/prerequis`, { ids: [fb] })).status, 400);
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fb}/prerequis`, { ids: [999999] })).status, 404);
    let r = await call(jarF, 'PUT', `/api/formations/${fb}/prerequis`, { ids: [fa] });
    assert.equal(r.status, 200); assert.equal(r.data.prerequis[0].id, Number(fa));
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fa}/prerequis`, { ids: [fb] })).status, 400, 'A exigerait B qui exige A');
    r = await call(jarF, 'PUT', `/api/formations/${fc}/prerequis`, { ids: [fb] });
    assert.equal(r.status, 200);
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fa}/prerequis`, { ids: [fc] })).status, 400, 'boucle indirecte A→C→B→A');
    const publique = await call(null, 'GET', `/api/formations/${fb}/prerequis`);
    assert.equal(publique.status, 200); assert.equal(publique.data.prerequis.length, 1);
  });

  await t.test('inscription REFUSÉE tant que le prérequis n\'est pas terminé, puis acceptée', async () => {
    let r = await call(jarA, 'POST', `/api/formations/${fb}/inscrire`, {});
    assert.equal(r.status, 403); assert.equal(r.data.code, 'prerequis_manquants'); assert.match(r.data.error, /Bases/);
    assert.equal((await call(jarA, 'GET', `/api/formations/${fb}/prerequis`)).data.manquants.length, 1);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fa}/inscrire`, {})).status, 201);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fb}/inscrire`, {})).status, 403, 'inscrit mais pas terminé');
    await call(jarA, 'POST', `/api/formations/${fa}/lecons/${la}/progression`, { termine: true });
    r = await call(jarA, 'POST', `/api/formations/${fb}/inscrire`, {});
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal((await call(jarA, 'GET', `/api/formations/${fb}/prerequis`)).data.manquants.length, 0);
  });

  await t.test('parcours : validations, brouillon invisible, publication', async () => {
    assert.equal((await call(jarA, 'POST', '/api/parcours-formation', { titre: 'x', formation_ids: [fa, fb] })).status, 403, 'réservé à ceux qui créent des formations');
    assert.equal((await call(jarF, 'POST', '/api/parcours-formation', { titre: '', formation_ids: [fa, fb] })).status, 400);
    assert.equal((await call(jarF, 'POST', '/api/parcours-formation', { titre: 'Un seul', formation_ids: [fa] })).status, 400);
    const r = await call(jarF, 'POST', '/api/parcours-formation', { titre: 'Devenir <b>entrepreneur</b>', description: 'Du projet à la vente.', objectif: 'Lancer son activité', formation_ids: [fa, fb, fc] });
    assert.equal(r.status, 201); pid = r.data.id;
    assert.equal((await call(jarA, 'GET', `/api/parcours-formation/${pid}`)).status, 404, 'un brouillon n\'est visible que de son auteur');
    assert.equal((await call(jarA, 'GET', '/api/parcours-formation')).data.parcours.length, 0);
    const d = await call(jarF, 'GET', `/api/parcours-formation/${pid}`);
    assert.equal(d.status, 200); assert.equal(d.data.modifiable, true); assert.equal(d.data.parcours.titre, 'Devenir entrepreneur');
    assert.equal((await call(jarA, 'PUT', `/api/parcours-formation/${pid}`, { titre: 'x', formation_ids: [fa, fb], statut: 'publie' })).status, 403);
    const sq = new H.DatabaseSync(env.dbPath);
    sq.prepare("UPDATE formations SET statut='brouillon' WHERE id=?").run(fc); sq.close();
    assert.equal((await call(jarF, 'PUT', `/api/parcours-formation/${pid}`, { titre: 'Devenir entrepreneur', formation_ids: [fa, fb, fc], statut: 'publie' })).status, 400, 'publier exige des formations publiées');
    H.publier(env, fc);
    assert.equal((await call(jarF, 'PUT', `/api/parcours-formation/${pid}`, { titre: 'Devenir entrepreneur', description: 'Du projet à la vente.', formation_ids: [fa, fb, fc], statut: 'publie' })).status, 200);
  });

  await t.test('parcours publié : statuts par étape selon l\'apprenant, prochaine étape, verrouillage', async () => {
    const liste = await call(jarA, 'GET', '/api/parcours-formation');
    assert.equal(liste.data.parcours.length, 1); assert.equal(liste.data.parcours[0].nb_etapes, 3);
    let d = (await call(jarA, 'GET', `/api/parcours-formation/${pid}`)).data;
    assert.deepEqual(d.etapes.map(e => e.statut), ['termine', 'en_cours', 'verrouille'], 'A terminée, B en cours, C verrouillée (exige B)');
    assert.equal(d.etapes[2].prerequis_manquants[0].id, Number(fb));
    assert.equal(d.prochaine_formation_id, Number(fb)); assert.equal(d.nb_termine, 1); assert.equal(d.termine, false);
    const autre = (await call(jarB, 'GET', `/api/parcours-formation/${pid}`)).data;
    assert.deepEqual(autre.etapes.map(e => e.statut), ['disponible', 'verrouille', 'verrouille']);
    assert.equal(autre.prochaine_formation_id, Number(fa));
    const anonyme = await call(null, 'GET', `/api/parcours-formation/${pid}`);
    assert.equal(anonyme.status, 200); assert.deepEqual(anonyme.data.etapes.map(e => e.statut), ['disponible', 'verrouille', 'verrouille']);
    await call(jarA, 'POST', `/api/formations/${fb}/lecons/${lb}/progression`, { termine: true });
    d = (await call(jarA, 'GET', `/api/parcours-formation/${pid}`)).data;
    assert.deepEqual(d.etapes.map(e => e.statut), ['termine', 'termine', 'disponible']);
    assert.equal(d.prochaine_formation_id, Number(fc));
    assert.equal((await call(jarA, 'POST', `/api/formations/${fc}/inscrire`, {})).status, 201);
  });

  await t.test('suppression d\'un parcours : réservée à son auteur', async () => {
    assert.equal((await call(jarA, 'DELETE', `/api/parcours-formation/${pid}`)).status, 403);
    assert.equal((await call(jarF, 'DELETE', `/api/parcours-formation/${pid}`)).status, 200);
    assert.equal((await call(jarA, 'GET', `/api/parcours-formation/${pid}`)).status, 404);
  });
});
