/* ===========================================================
   tests/formation-quiz-apercu-proprietaire.test.js — essai à blanc des QCM par le propriétaire (2026-10-31)
   Le propriétaire (ou un administrateur) passe un quiz d'une formation EN BROUILLON sans inscription : correction par le serveur,
   corrigé donné à lui seul, RIEN d'enregistré (ni tentative, ni progression). Un autre compte reçoit 404 ; l'apprenant inscrit garde le
   parcours habituel (corrigé caché tant que le quiz n'est pas réussi).
   Lancer : node --test tests/formation-quiz-apercu-proprietaire.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness.js');

test('essai à blanc du propriétaire : questions sans corrigé, correction serveur, rien d\'enregistré, accès fermé aux autres', async () => {
  const env = await H.demarrer('quiz-apercu');
  try {
    const rnd = Math.random().toString(36).slice(2, 7), jO = H.cookieJar(), jA = H.cookieJar();
    await H.creerFormateur(env, jO, rnd, 'Formateur'); await H.creerApprenant(env, jA, rnd, 'Autre');
    const call = (j, m, u, b) => env.call(j, m, u, b);
    const fid = (await call(jO, 'POST', '/api/formations', { titre: 'Brouillon quiz ' + rnd, description: 'x', organisme: 'Org' })).data.id;
    const mod = (await call(jO, 'POST', `/api/formations/${fid}/modules`, { titre: 'M1' })).data.id;
    const ch = (await call(jO, 'POST', `/api/formations/${fid}/modules/${mod}/chapitres`, { titre: 'C1' })).data.id;
    const lid = (await call(jO, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Quiz', type: 'quiz', contenu_texte: '<p>c</p>' })).data.id;
    const quizId = (await call(jO, 'POST', `/api/formations/${fid}/quiz`, { titre: 'Mini-QCM', type: 'exercice', note_minimale: 70, lecon_id: lid })).data.id;
    const q1 = (await call(jO, 'POST', `/api/formations/${fid}/quiz/${quizId}/questions`, { question: 'Capitale du Sénégal ?', type: 'qcm', options: ['Paris', 'Dakar'], reponse_correcte: 'Dakar', explication: 'Dakar.' })).data.id;

    /* le formation est en brouillon, le propriétaire n'est pas inscrit */
    let r = await call(jO, 'GET', `/api/formations/${fid}/quiz/${quizId}/apercu`);
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.essai, true);
    assert.equal(r.data.questions.length, 1);
    assert.ok(!JSON.stringify(r.data).includes('reponse_correcte'), 'aucun corrigé avant la correction');
    r = await call(jO, 'POST', `/api/formations/${fid}/quiz/${quizId}/apercu-corriger`, { reponses: { [q1]: 'Paris' } });
    assert.equal(r.status, 200); assert.equal(r.data.reussi, false); assert.equal(r.data.note_pct, 0);
    assert.equal(r.data.detail[0].bonne_reponse, 'Dakar');
    r = await call(jO, 'POST', `/api/formations/${fid}/quiz/${quizId}/apercu-corriger`, { reponses: { [q1]: 'Dakar' } });
    assert.equal(r.data.reussi, true); assert.equal(r.data.note_pct, 100);

    /* rien d'enregistré */
    const sq = new H.DatabaseSync(env.dbPath);
    const nt = sq.prepare('SELECT COUNT(*) n FROM formation_quiz_tentatives WHERE quiz_id=?').get(quizId).n;
    const np = sq.prepare('SELECT COUNT(*) n FROM formation_lecons_progression WHERE lecon_id=?').get(lid).n;
    sq.close();
    assert.equal(nt, 0, 'aucune tentative enregistrée'); assert.equal(np, 0, 'aucune progression enregistrée');

    /* un autre compte : fermé ; anonyme : 401 ; l'ancienne route apprenant exige toujours l'inscription */
    assert.equal((await call(jA, 'GET', `/api/formations/${fid}/quiz/${quizId}/apercu`)).status, 404);
    assert.equal((await call(jA, 'POST', `/api/formations/${fid}/quiz/${quizId}/apercu-corriger`, { reponses: {} })).status, 404);
    assert.equal((await call(null, 'GET', `/api/formations/${fid}/quiz/${quizId}/apercu`)).status, 401);
    assert.equal((await call(jO, 'GET', `/api/formations/${fid}/quiz/${quizId}/passer`)).status, 403);
  } finally { env.stop(); }
});
