/* ===========================================================
   tests/formation-quiz-reglages.test.js — Diaspo'Actif Formation, lot 4 (2026-10-18), points 2 et 3
   ===========================================================
   Réglages de quiz appliqués PAR LE SERVEUR : nombre de tentatives limité (+ redonner des tentatives), temps imparti réel (chronomètre côté
   serveur, envoi tardif = « hors délai »), ordre des questions mélangé, devoirs avec dépôt de fichier (fichier de NOTRE stockage et téléversé par
   l'apprenant lui-même, uniquement pour une correction manuelle).

   Lancer : node --test tests/formation-quiz-reglages.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('quizreg'); });
test.after(() => { if (env) env.stop(); });

test('tentatives limitées, temps imparti, mélange, dépôt de fichier', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarO = H.cookieJar(), jarL = H.cookieJar();
  const owner = await H.creerFormateur(env, jarO, rnd, 'Formateur');
  const learner = await H.creerApprenant(env, jarL, rnd, 'Kone');
  const sq = () => new H.DatabaseSync(env.dbPath);
  const learnerId = (() => { const d = sq(); const r = d.prepare('SELECT id FROM users WHERE email=?').get(learner.email); d.close(); return Number(r.id); })();
  const c = (jar, m, u, b) => env.call(jar, m, u, b);
  let fid, quizA, quizT, quizM, quizD, l = {};

  await t.test('construction : 4 leçons-quiz de réglages différents', async () => {
    let r = await c(jarO, 'POST', '/api/formations', { titre: 'Réglages ' + rnd, description: 'x' }); assert.equal(r.status, 201); fid = r.data.id;
    const mod = (await c(jarO, 'POST', `/api/formations/${fid}/modules`, { titre: 'M' })).data.id;
    const ch = (await c(jarO, 'POST', `/api/formations/${fid}/modules/${mod}/chapitres`, { titre: 'C' })).data.id;
    const lecon = async (titre) => (await c(jarO, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre, type: 'quiz' })).data.id;
    for (const k of ['a', 't', 'm', 'd']) l[k] = await lecon('Quiz ' + k);
    const q = async (body) => { r = await c(jarO, 'POST', `/api/formations/${fid}/quiz`, body); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data.id; };
    quizA = await q({ titre: 'Limité', note_minimale: 100, lecon_id: l.a, max_tentatives: 2 });
    quizT = await q({ titre: 'Chrono', note_minimale: 100, lecon_id: l.t, temps_limite_min: 1 });
    quizM = await q({ titre: 'Mélange', note_minimale: 50, lecon_id: l.m, melanger: true });
    quizD = await q({ titre: 'Devoir', note_minimale: 50, lecon_id: l.d, correction_auto: false, depot_fichier: 'obligatoire' });
    const add = (qz, question, bonne) => c(jarO, 'POST', `/api/formations/${fid}/quiz/${qz}/questions`, { question, type: 'qcm', options: ['Oui', 'Non'], reponse_correcte: bonne });
    await add(quizA, 'Question A ?', 'Oui');
    await add(quizT, 'Question T ?', 'Oui');
    for (let i = 1; i <= 8; i++) await add(quizM, 'Question M' + i, 'Oui');
    await c(jarO, 'POST', `/api/formations/${fid}/quiz/${quizD}/questions`, { question: 'Décrivez votre projet', type: 'texte_libre' });
    H.publier(env, fid);
    r = await c(jarL, 'POST', `/api/formations/${fid}/inscrire`, {}); assert.equal(r.status, 201);
  });

  await t.test('réglages invalides refusés (bornes, dépôt de fichier sur un quiz automatique)', async () => {
    let r = await c(jarO, 'PUT', `/api/formations/${fid}/quiz/${quizA}`, { max_tentatives: 0 }); assert.equal(r.status, 400);
    r = await c(jarO, 'PUT', `/api/formations/${fid}/quiz/${quizA}`, { max_tentatives: 99 }); assert.equal(r.status, 400);
    r = await c(jarO, 'PUT', `/api/formations/${fid}/quiz/${quizA}`, { temps_limite_min: 9999 }); assert.equal(r.status, 400);
    r = await c(jarO, 'PUT', `/api/formations/${fid}/quiz/${quizA}`, { depot_fichier: 'obligatoire' });
    assert.equal(r.status, 400, 'un quiz corrigé automatiquement ne reçoit pas de fichier');
    r = await c(jarO, 'PUT', `/api/formations/${fid}/quiz/${quizA}`, { depot_fichier: 'n_importe_quoi' }); assert.equal(r.status, 400);
  });

  await t.test('un quiz d\'une AUTRE formation ne peut pas être modifié par son URL', async () => {
    const f2 = (await c(jarO, 'POST', '/api/formations', { titre: 'Autre ' + rnd })).data.id;
    const r = await c(jarO, 'PUT', `/api/formations/${f2}/quiz/${quizA}`, { titre: 'Détourné' });
    assert.equal(r.status, 404);
  });

  await t.test('tentatives limitées : 2 échecs puis blocage serveur, le formateur voit l\'apprenant et redonne des tentatives', async () => {
    let r = await c(jarL, 'GET', `/api/formations/${fid}/quiz/${quizA}/passer`);
    assert.equal(r.data.quiz.max_tentatives, 2); assert.equal(r.data.tentatives.restantes, 2); assert.equal(r.data.questions.length, 1);
    const qid = r.data.questions[0].id;
    r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizA}/soumettre`, { reponses: { [qid]: 'Non' } });
    assert.equal(r.data.reussi, false); assert.equal(r.data.tentatives_restantes, 1);
    r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizA}/soumettre`, { reponses: { [qid]: 'Non' } });
    assert.equal(r.data.tentatives_restantes, 0);
    r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizA}/soumettre`, { reponses: { [qid]: 'Oui' } });
    assert.equal(r.status, 403); assert.equal(r.data.code, 'tentatives_epuisees', 'même la bonne réponse est refusée une fois les tentatives épuisées');
    r = await c(jarL, 'GET', `/api/formations/${fid}/quiz/${quizA}/passer`);
    assert.equal(r.data.bloque, 'tentatives_epuisees'); assert.equal(r.data.questions.length, 0);
    const suivi = await c(jarO, 'GET', `/api/formations/${fid}/suivi`);
    const eleve = suivi.data.eleves[0];
    assert.equal(eleve.quiz_epuises.length, 1); assert.equal(eleve.quiz_epuises[0].quiz_id, quizA);
    const insc = eleve.inscription_id;
    r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizA}/reinitialiser`, { inscription_id: insc });
    assert.equal(r.status, 403, 'un apprenant ne peut pas se redonner des tentatives');
    r = await c(jarO, 'POST', `/api/formations/${fid}/quiz/${quizA}/reinitialiser`, { inscription_id: insc });
    assert.equal(r.status, 200); assert.equal(r.data.archivees, 2);
    r = await c(jarL, 'GET', `/api/formations/${fid}/quiz/${quizA}/passer`);
    assert.equal(r.data.bloque, null); assert.equal(r.data.tentatives.restantes, 2); assert.equal(r.data.tentatives.nb, 0, 'les tentatives archivées ne comptent plus');
    r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizA}/soumettre`, { reponses: { [qid]: 'Oui' } });
    assert.equal(r.data.reussi, true);
    r = await c(jarO, 'POST', `/api/formations/${fid}/quiz/${quizA}/reinitialiser`, { inscription_id: insc });
    assert.equal(r.status, 409, 'rien à réinitialiser une fois le quiz réussi');
  });

  await t.test('temps imparti : le chrono est lancé et contrôlé par le serveur', async () => {
    let r = await c(jarL, 'GET', `/api/formations/${fid}/quiz/${quizT}/passer`);
    assert.equal(r.data.chrono.minutes, 1); assert.equal(r.data.chrono.demarre, false);
    assert.equal(r.data.questions.length, 0, 'aucune question lisible tant que le chrono n\'est pas lancé');
    const qid = (await c(jarO, 'GET', `/api/formations/${fid}/quiz`)).data.quiz.find(x => x.id === quizT).questions[0].id;
    r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizT}/soumettre`, { reponses: { [qid]: 'Oui' } });
    assert.equal(r.status, 409); assert.equal(r.data.code, 'demarrage_requis');
    r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizT}/demarrer`);
    assert.equal(r.status, 200); assert.equal(r.data.questions.length, 1); assert.ok(r.data.chrono.reste_sec > 0 && r.data.chrono.reste_sec <= 60);
    const r2 = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizT}/demarrer`);
    assert.ok(r2.data.chrono.reste_sec <= r.data.chrono.reste_sec, 'reprendre ne remet pas le compteur à zéro');
    /* On recule l'horloge de la session de 10 minutes : l'envoi est tardif. */
    const d = sq(); d.prepare("UPDATE formation_quiz_sessions SET debut=? WHERE quiz_id=?").run(new Date(Date.now() - 10 * 60000).toISOString(), quizT); d.close();
    r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizT}/soumettre`, { reponses: { [qid]: 'Oui' } });
    assert.equal(r.status, 200); assert.equal(r.data.hors_delai, true); assert.equal(r.data.reussi, false, 'une bonne réponse envoyée trop tard ne valide rien');
    const etat = await c(jarL, 'GET', `/api/formations/${fid}/quiz/${quizT}/passer`);
    assert.equal(etat.data.tentatives.nb, 1, 'la tentative hors délai est comptée');
    assert.equal(etat.data.chrono.demarre, false);
    /* Temps écoulé sans aucun envoi, puis rechargement : la tentative est comptée, le chrono n'est pas remis à neuf. */
    await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizT}/demarrer`);
    const d2 = sq(); d2.prepare("UPDATE formation_quiz_sessions SET debut=? WHERE quiz_id=?").run(new Date(Date.now() - 10 * 60000).toISOString(), quizT); d2.close();
    const apres = await c(jarL, 'GET', `/api/formations/${fid}/quiz/${quizT}/passer`);
    assert.equal(apres.data.chrono.expire_enregistre, true); assert.equal(apres.data.tentatives.nb, 2);
    /* Un quiz sans temps imparti ne se « démarre » pas. */
    r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizM}/demarrer`); assert.equal(r.status, 400);
  });

  await t.test('ordre mélangé (côté serveur) ; stable pendant une session chronométrée', async () => {
    const ordres = new Set();
    for (let i = 0; i < 6; i++) { const r = await c(jarL, 'GET', `/api/formations/${fid}/quiz/${quizM}/passer`); assert.equal(r.data.questions.length, 8); ordres.add(r.data.questions.map(x => x.id).join(',')); }
    assert.ok(ordres.size > 1, 'au moins deux ordres différents sur 6 chargements');
    /* Quiz chronométré ET mélangé : l'ordre tiré au démarrage est conservé. */
    const r = await c(jarO, 'PUT', `/api/formations/${fid}/quiz/${quizM}`, { temps_limite_min: 30 }); assert.equal(r.status, 200);
    await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizM}/demarrer`);
    const a = (await c(jarL, 'GET', `/api/formations/${fid}/quiz/${quizM}/passer`)).data.questions.map(x => x.id).join(',');
    const b = (await c(jarL, 'GET', `/api/formations/${fid}/quiz/${quizM}/passer`)).data.questions.map(x => x.id).join(',');
    assert.equal(a, b, 'ordre stable pendant la session');
    /* Retirer la limite : la clé null efface bien le réglage. */
    const r3 = await c(jarO, 'PUT', `/api/formations/${fid}/quiz/${quizM}`, { temps_limite_min: null }); assert.equal(r3.status, 200);
    const apres = await c(jarL, 'GET', `/api/formations/${fid}/quiz/${quizM}/passer`);
    assert.equal(apres.data.chrono, null);
  });

  await t.test('devoir : fichier obligatoire, provenance contrôlée, visible du formateur', async () => {
    const qid = (await c(jarO, 'GET', `/api/formations/${fid}/quiz`)).data.quiz.find(x => x.id === quizD).questions[0].id;
    const host = 'https://diaspoactif-media.b-cdn.net/documents/';
    let r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizD}/soumettre`, { reponses: { [qid]: 'Mon projet' } });
    assert.equal(r.status, 400); assert.equal(r.data.code, 'fichier_requis');
    for (const mauvais of ['http://diaspoactif-media.b-cdn.net/documents/' + learnerId + '-1.pdf', 'https://evil.example.com/documents/' + learnerId + '-1.pdf', host + (learnerId + 1) + '-1.pdf', host + learnerId + '-1.exe.html', 'javascript:alert(1)']) {
      r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizD}/soumettre`, { reponses: { [qid]: 'Mon projet' }, fichier_url: mauvais, fichier_nom: 'x' });
      assert.equal(r.status, 400, mauvais); assert.equal(r.data.code, 'fichier_invalide', mauvais);
    }
    const bon = host + learnerId + '-1760000000000.pdf';
    r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizD}/soumettre`, { reponses: { [qid]: 'Mon projet' }, fichier_url: bon, fichier_nom: 'Projet.pdf' });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.en_attente_correction, true);
    const ac = await c(jarO, 'GET', `/api/formations/${fid}/a-corriger`);
    assert.equal(ac.data.travaux.length, 1); assert.equal(ac.data.travaux[0].fichier_url, bon); assert.equal(ac.data.travaux[0].fichier_nom, 'Projet.pdf');
    const etat = await c(jarL, 'GET', `/api/formations/${fid}/quiz/${quizD}/passer`);
    assert.equal(etat.data.quiz.depot_fichier, 'obligatoire'); assert.equal(etat.data.bloque, 'en_attente');
    r = await c(jarL, 'POST', `/api/formations/${fid}/quiz/${quizD}/soumettre`, { reponses: { [qid]: 'bis' }, fichier_url: bon });
    assert.equal(r.status, 409, 'un seul envoi en attente de correction');
  });
});
