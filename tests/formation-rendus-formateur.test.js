/* ===========================================================
   tests/formation-rendus-formateur.test.js — boîte de réception du formateur et « Rendu » (2026-10-31)
   Un devoir à correction manuelle accepte toujours un fichier ; le formateur retrouve tous les dépôts (à corriger / corrigés), répond par une note,
   un avis écrit et/ou un PDF ; l'apprenant en est prévenu (notification + compteur de la cartouche) et lit le rendu, qui se marque « lu ».
   Lancer : node --test tests/formation-rendus-formateur.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness.js');

test('dépôt → boîte de réception → rendu (note / avis / PDF) → cloche → lu', async () => {
  const env = await H.demarrer('rendus');
  try {
    const rnd = Math.random().toString(36).slice(2, 7), jO = H.cookieJar(), jL = H.cookieJar(), jX = H.cookieJar();
    await H.creerFormateur(env, jO, rnd, 'Formateur');
    const cL = await H.creerApprenant(env, jL, rnd, 'Eleve'); await H.creerApprenant(env, jX, rnd, 'Autre');
    const c = (j, m, u, b) => env.call(j, m, u, b);
    const sq = new H.DatabaseSync(env.dbPath);
    const uid = sq.prepare('SELECT id FROM users WHERE email=?').get(cL.email).id, ownerId = sq.prepare("SELECT id FROM users WHERE role='administrateur' ORDER BY id DESC LIMIT 1").get().id;
    sq.close();
    const fid = (await c(jO, 'POST', '/api/formations', { titre: 'Rendus ' + rnd, description: 'x', organisme: 'Org' })).data.id;
    const mod = (await c(jO, 'POST', `/api/formations/${fid}/modules`, { titre: 'M' })).data.id;
    const ch = (await c(jO, 'POST', `/api/formations/${fid}/modules/${mod}/chapitres`, { titre: 'C' })).data.id;
    const lecon = async t => (await c(jO, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: t, type: 'quiz' })).data.id;
    const lD = await lecon('Devoir'), lA = await lecon('Auto');
    /* Devoir à correction manuelle SANS réglage de dépôt (valeur historique « non ») + un quiz automatique. */
    const quizD = (await c(jO, 'POST', `/api/formations/${fid}/quiz`, { titre: 'Mon plan', note_minimale: 50, lecon_id: lD, correction_auto: false })).data.id;
    const quizA = (await c(jO, 'POST', `/api/formations/${fid}/quiz`, { titre: 'Quiz auto', note_minimale: 50, lecon_id: lA })).data.id;
    const qD = (await c(jO, 'POST', `/api/formations/${fid}/quiz/${quizD}/questions`, { question: 'Votre plan', type: 'texte_libre' })).data.id;
    const qA = (await c(jO, 'POST', `/api/formations/${fid}/quiz/${quizA}/questions`, { question: 'Q ?', type: 'qcm', options: ['Oui', 'Non'], reponse_correcte: 'Oui' })).data.id;
    H.publier(env, fid);
    assert.equal((await c(jL, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
    const host = 'https://diaspoactif-media.b-cdn.net/documents/';
    const pdfEleve = host + uid + '-1760000000000.pdf', pdfForm = host + ownerId + '-1760000000001.pdf';

    /* Le dépôt de fichier est proposé même sans réglage (facultatif), jamais sur un quiz automatique. */
    assert.equal((await c(jL, 'GET', `/api/formations/${fid}/quiz/${quizD}/passer`)).data.quiz.depot_fichier, 'optionnel');
    assert.equal((await c(jL, 'GET', `/api/formations/${fid}/quiz/${quizA}/passer`)).data.quiz.depot_fichier, 'non');
    let r = await c(jL, 'POST', `/api/formations/${fid}/quiz/${quizD}/soumettre`, { reponses: { [qD]: 'Mon plan v1' }, fichier_url: pdfEleve, fichier_nom: 'Plan.pdf' });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.en_attente_correction, true);

    /* Boîte de réception : réservée au formateur, le dépôt y figure avec son fichier. */
    assert.equal((await c(jL, 'GET', `/api/formations/${fid}/depots`)).status, 403);
    assert.equal((await c(null, 'GET', `/api/formations/${fid}/depots`)).status, 401);
    let bo = await c(jO, 'GET', `/api/formations/${fid}/depots`);
    assert.equal(bo.status, 200); assert.equal(bo.data.a_corriger, 1); assert.equal(bo.data.corriges, 0);
    const dep = bo.data.depots[0]; assert.equal(dep.fichier_url, pdfEleve); assert.equal(dep.reponses[0].reponse, 'Mon plan v1'); assert.equal(dep.rendu, null);

    /* Rendu invalide : vide, ou PDF téléversé par un autre compte. */
    r = await c(jO, 'POST', `/api/formations/${fid}/tentatives/${dep.id}/corriger`, {});
    assert.equal(r.status, 400); assert.equal(r.data.code, 'rendu_vide');
    r = await c(jO, 'POST', `/api/formations/${fid}/tentatives/${dep.id}/corriger`, { commentaire: 'ok', fichier_url: pdfEleve, fichier_nom: 'x.pdf' });
    assert.equal(r.status, 400); assert.equal(r.data.code, 'fichier_invalide');
    assert.equal((await c(jL, 'POST', `/api/formations/${fid}/tentatives/${dep.id}/corriger`, { note_pct: 100 })).status, 403, 'un apprenant ne peut pas se répondre');

    /* 1er rendu : AVIS seul + PDF, sans note → ne valide rien, l'apprenant pourra redéposer. */
    r = await c(jO, 'POST', `/api/formations/${fid}/tentatives/${dep.id}/corriger`, { commentaire: 'Précisez vos dates.', fichier_url: pdfForm, fichier_nom: 'Consignes.pdf' });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.reussi, false);
    let etat = await c(jL, 'GET', `/api/formations/${fid}/quiz/${quizD}/passer`);
    assert.equal(etat.data.bloque, null, 'après un avis sans note, l\'apprenant peut redéposer');
    const rendu = etat.data.tentatives.derniere.rendu;
    assert.ok(rendu && rendu.id === dep.id && rendu.fichier_url === pdfForm && rendu.lu === false);
    assert.equal(etat.data.tentatives.derniere.note_pct, null);

    /* Notification + cloche de la cartouche : 1 rendu non lu. */
    const sq2 = new H.DatabaseSync(env.dbPath);
    const notif = sq2.prepare("SELECT titre, data_json FROM notifications WHERE user_id=? AND type='formation' ORDER BY id DESC LIMIT 1").get(uid); sq2.close();
    assert.ok(notif && /réponse du formateur/i.test(notif.titre), notif && notif.titre); assert.equal(JSON.parse(notif.data_json).formation_id, fid);
    assert.equal(JSON.parse(notif.data_json).lien, `suivre-formation.html?id=${fid}`, 'le clic sur la notification mène à la formation');
    let cl = await c(jL, 'GET', '/api/mes-rendus');
    assert.equal(cl.data.total, 1); assert.equal(cl.data.formations[String(fid)], 1);
    assert.equal((await c(jX, 'GET', '/api/mes-rendus')).data.total, 0, 'la cloche d\'un autre compte reste vide');
    assert.equal((await c(jX, 'GET', `/api/formations/${fid}/rendus`)).status, 403);

    /* Le formateur peut encore corriger son rendu tant qu'il n'est pas ouvert. */
    r = await c(jO, 'PUT', `/api/formations/${fid}/tentatives/${dep.id}/rendu`, { commentaire: 'Précisez vos dates et vos contacts.' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await c(jL, 'PUT', `/api/formations/${fid}/tentatives/${dep.id}/rendu`, { commentaire: 'triche' })).status, 403);

    /* L'apprenant ouvre : liste complète, puis marquage « lu » (propre à lui), cloche à 0. */
    const liste = await c(jL, 'GET', `/api/formations/${fid}/rendus`);
    assert.equal(liste.data.rendus.length, 1); assert.equal(liste.data.rendus[0].commentaire, 'Précisez vos dates et vos contacts.'); assert.equal(liste.data.non_lus, 1);
    assert.equal((await c(jX, 'POST', `/api/formations/${fid}/rendus/${dep.id}/lu`, {})).status, 403);
    r = await c(jL, 'POST', `/api/formations/${fid}/rendus/${dep.id}/lu`, {}); assert.equal(r.status, 200); assert.equal(r.data.non_lus, 0);
    assert.equal((await c(jL, 'GET', '/api/mes-rendus')).data.total, 0);
    r = await c(jO, 'PUT', `/api/formations/${fid}/tentatives/${dep.id}/rendu`, { commentaire: 'trop tard' });
    assert.equal(r.status, 409); assert.equal(r.data.code, 'rendu_lu');
    bo = await c(jO, 'GET', `/api/formations/${fid}/depots?statut=corriges`);
    assert.equal(bo.data.depots.length, 1); assert.ok(bo.data.depots[0].rendu.lu_le, 'le formateur voit que le rendu a été lu');

    /* 2e dépôt, corrigé avec une NOTE au-dessus du seuil + commentaire : activité validée, nouveau rendu non lu. */
    r = await c(jL, 'POST', `/api/formations/${fid}/quiz/${quizD}/soumettre`, { reponses: { [qD]: 'Mon plan v2' } });
    assert.equal(r.status, 200);
    const dep2 = (await c(jO, 'GET', `/api/formations/${fid}/depots?statut=a_corriger`)).data.depots[0];
    assert.equal(dep2.fichier_url, null);
    r = await c(jO, 'POST', `/api/formations/${fid}/tentatives/${dep2.id}/corriger`, { note_pct: 80, commentaire: 'Très bien.' });
    assert.equal(r.status, 200); assert.equal(r.data.reussi, true);
    assert.equal((await c(jL, 'GET', '/api/mes-rendus')).data.total, 1);
    assert.equal((await c(jO, 'GET', `/api/formations/${fid}/depots`)).data.corriges, 2);

    /* Un quiz corrigé automatiquement ne produit jamais de « rendu ». */
    r = await c(jL, 'POST', `/api/formations/${fid}/quiz/${quizA}/soumettre`, { reponses: { [qA]: 'Oui' } }); assert.equal(r.status, 200);
    assert.equal((await c(jL, 'GET', `/api/formations/${fid}/rendus`)).data.rendus.length, 2);
    assert.equal((await c(jL, 'GET', `/api/formations/${fid}/quiz/${quizA}/passer`)).data.tentatives.derniere.rendu, null);
  } finally { env.stop(); }
});
