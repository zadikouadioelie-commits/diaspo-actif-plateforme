/* ===========================================================
   tests/formation-analyse.test.js — Diaspo'Actif Formation, lot 2 (2026-10-18)
   ===========================================================
   Correction MANUELLE d'un quiz par le formateur (travaux à corriger, note, commentaire, validation de l'activité, délivrance du certificat),
   analyse pédagogique d'une formation (chapitres, quiz, abandons apparents, documents délivrés) et statistiques d'administration.
   Intégration HTTP réelle, base SQLite isolée (voir tests/_formation-harness.js).
   Lancer : node --test tests/formation-analyse.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('analyse'); });
test.after(() => { if (env) env.stop(); });

test('correction manuelle, analyse du formateur, statistiques d\'administration', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarB = H.cookieJar();
  const call = env.call;
  let fid, l1, l2, quizId, q1, q2, code, travail1, travail2;

  await t.test('setup — formation à 2 chapitres dont un devoir à correction MANUELLE, 2 apprenants inscrits', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    await H.creerApprenant(env, jarA, rnd, 'Apprenant');
    const b = await H.creerApprenant(env, jarB, rnd, 'Inactif');
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Formation analyse ' + rnd, description: 'Test', organisme: 'Organisme Test' })).data.id;
    const mod = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'Module 1' })).data.id;
    const ch1 = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${mod}/chapitres`, { titre: 'Chapitre 1' })).data.id;
    const ch2 = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${mod}/chapitres`, { titre: 'Chapitre 2' })).data.id;
    const lecon = async (ch, titre, type) => (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre, type, contenu_texte: '<p>x</p>' })).data.id;
    l1 = await lecon(ch1, 'Cours', 'texte');
    l2 = await lecon(ch2, 'Devoir', 'quiz');
    let r = await call(jarF, 'POST', `/api/formations/${fid}/quiz`, { titre: 'Devoir rédigé', type: 'travail_pratique', note_minimale: 50, lecon_id: l2, correction_auto: false });
    assert.equal(r.status, 201); quizId = r.data.id;
    q1 = (await call(jarF, 'POST', `/api/formations/${fid}/quiz/${quizId}/questions`, { question: 'Décrivez votre projet.', type: 'texte_libre', points: 3 })).data.id;
    q2 = (await call(jarF, 'POST', `/api/formations/${fid}/quiz/${quizId}/questions`, { question: 'Quel budget ?', type: 'texte_libre', points: 1 })).data.id;
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fid}/certificat`, { certificat_actif: true, certificat_type: 'reussite' })).status, 200);
    H.publier(env, fid);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
    assert.equal((await call(jarB, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
    assert.ok(b.email);
  });

  await t.test('rendre un devoir à correction manuelle : en attente, jamais validé tout seul', async () => {
    await call(jarA, 'POST', `/api/formations/${fid}/lecons/${l1}/progression`, { termine: true });
    const r = await call(jarA, 'POST', `/api/formations/${fid}/quiz/${quizId}/soumettre`, { reponses: { [q1]: 'Un projet de culture de manioc.', [q2]: '5000 euros' } });
    assert.equal(r.status, 200); assert.equal(r.data.en_attente_correction, true);
    assert.equal(r.data.statut, 'en_attente_evaluation', 'plus rien à faire côté apprenant : il attend la note');
    assert.equal(r.data.attestation, null);
    const s = await call(jarA, 'GET', `/api/formations/${fid}/suivre`);
    assert.equal(s.data.modules[0].chapitres[1].lecons[0].termine, false);
    assert.equal(s.data.modules[0].chapitres[1].lecons[0].quiz.en_attente, true);
    const p = await call(jarA, 'GET', `/api/formations/${fid}/quiz/${quizId}/passer`);
    assert.equal(p.data.tentatives.en_attente, true); assert.equal(p.data.quiz.correction_manuelle, true);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/quiz/${quizId}/soumettre`, { reponses: { [q1]: 'bis' } })).status, 409, 'une seule tentative en attente');
  });

  await t.test('travaux à corriger : visibles du formateur seulement, réponses en regard des questions', async () => {
    assert.equal((await call(jarA, 'GET', `/api/formations/${fid}/a-corriger`)).status, 403);
    assert.equal((await call(null, 'GET', `/api/formations/${fid}/a-corriger`)).status, 401);
    const r = await call(jarF, 'GET', `/api/formations/${fid}/a-corriger`);
    assert.equal(r.status, 200); assert.equal(r.data.travaux.length, 1);
    travail1 = r.data.travaux[0];
    assert.equal(travail1.apprenant, 'Aminata Apprenant');
    assert.equal(travail1.reponses[0].reponse, 'Un projet de culture de manioc.');
    assert.equal(travail1.reponses[0].points, 3);
    const dash = await call(jarF, 'GET', '/api/mes-formations/dashboard');
    assert.equal(dash.data.stats.nb_a_corriger, 1);
  });

  await t.test('correction : un apprenant ne peut pas se noter ; note invalide refusée ; note sous le seuil = non validé + commentaire', async () => {
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/tentatives/${travail1.id}/corriger`, { note_pct: 100 })).status, 403);
    assert.equal((await call(jarF, 'POST', `/api/formations/${fid}/tentatives/${travail1.id}/corriger`, { note_pct: 150 })).status, 400);
    const r = await call(jarF, 'POST', `/api/formations/${fid}/tentatives/${travail1.id}/corriger`, { note_pct: 30, commentaire: 'Trop succinct, précisez le calendrier.' });
    assert.equal(r.status, 200); assert.equal(r.data.reussi, false);
    assert.equal((await call(jarF, 'POST', `/api/formations/${fid}/tentatives/${travail1.id}/corriger`, { note_pct: 80 })).status, 409, 'déjà corrigé');
    const p = await call(jarA, 'GET', `/api/formations/${fid}/quiz/${quizId}/passer`);
    assert.equal(p.data.tentatives.en_attente, false);
    assert.equal(p.data.tentatives.derniere.commentaire, 'Trop succinct, précisez le calendrier.');
    assert.equal(p.data.tentatives.derniere.reussi, false);
    const notifs = await call(jarA, 'GET', '/api/notifications');
    assert.ok(notifs.ok);
  });

  await t.test('2e tentative corrigée au-dessus du seuil : activité validée, 100 %, certificat de réussite délivré', async () => {
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/quiz/${quizId}/soumettre`, { reponses: { [q1]: 'Projet détaillé avec calendrier.', [q2]: '5000' } })).data.en_attente_correction, true);
    travail2 = (await call(jarF, 'GET', `/api/formations/${fid}/a-corriger`)).data.travaux[0];
    const r = await call(jarF, 'POST', `/api/formations/${fid}/tentatives/${travail2.id}/corriger`, { note_pct: 85, commentaire: 'Bien.' });
    assert.equal(r.data.reussi, true); assert.equal(r.data.avancement_pct, 100);
    assert.ok(r.data.attestation); assert.equal(r.data.attestation.type, 'reussite'); assert.equal(r.data.attestation.resultat_pct, 85);
    code = r.data.attestation.code;
    const s = await call(jarA, 'GET', `/api/formations/${fid}/suivre`);
    assert.equal(s.data.parcours.statut, 'termine');
    assert.equal((await call(jarF, 'GET', `/api/formations/${fid}/a-corriger`)).data.travaux.length, 0);
  });

  await t.test('analyse du formateur : chapitres, quiz, documents, abandon apparent d\'un inscrit inactif', async () => {
    const sq = new H.DatabaseSync(env.dbPath);
    const vieux = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    sq.prepare("UPDATE formation_inscriptions SET date_inscription=?, created_at=?, derniere_activite_le=NULL WHERE formation_id=? AND user_id=(SELECT id FROM users WHERE email=?)")
      .run(vieux, vieux, fid, `test-utilisateur-${rnd}-inactif@example.com`);
    sq.close();
    const r = await call(jarF, 'GET', `/api/formations/${fid}/suivi`);
    assert.equal(r.status, 200);
    const a = r.data.analyse;
    assert.equal(a.nb_inscrits, 2);
    assert.equal(a.chapitres.length, 2);
    assert.equal(a.chapitres[0].pct_completion, 50, 'chapitre 1 : 1 apprenant sur 2');
    assert.equal(a.chapitres[1].pct_completion, 50);
    assert.equal(a.quiz[0].nb_tentatives, 2); assert.equal(a.quiz[0].correction_manuelle, true);
    assert.equal(a.quiz[0].taux_reussite, 100); assert.equal(a.quiz[0].note_moyenne, 85); assert.equal(a.quiz[0].a_corriger, 0);
    assert.equal(a.attestations.total, 1); assert.equal(a.attestations.par_type.reussite, 1);
    assert.equal(a.abandons, 1);
    const inactif = r.data.eleves.find(e => /Inactif/.test(e.nom));
    assert.equal(inactif.abandon_apparent, true); assert.ok(inactif.inactif_jours >= 39);
    const actif = r.data.eleves.find(e => /Apprenant/.test(e.nom));
    assert.equal(actif.abandon_apparent, false); assert.equal(actif.attestation, 'reussite');
    assert.ok(!('eleves' in a), 'pas de doublon de la liste des élèves');
    const dash = await call(jarF, 'GET', '/api/mes-formations/dashboard');
    assert.equal(dash.data.stats.nb_certificats, 1); assert.equal(dash.data.stats.nb_abandons, 1); assert.equal(dash.data.stats.nb_a_corriger, 0);
    const liste = await call(jarF, 'GET', '/api/mes-formations');
    assert.equal(liste.data.formations.find(f => String(f.id) === String(fid)).nb_a_corriger, 0);
  });

  await t.test('statistiques d\'administration : réservées aux administrateurs, chiffres cohérents', async () => {
    assert.equal((await call(null, 'GET', '/api/admin/formation-stats')).status, 401);
    assert.equal((await call(jarA, 'GET', '/api/admin/formation-stats')).status, 403);
    const r = await call(jarF, 'GET', '/api/admin/formation-stats');
    assert.equal(r.status, 200);
    assert.ok(r.data.formations.publiees >= 1);
    assert.ok(r.data.inscriptions.total >= 2);
    assert.ok(r.data.documents.par_type.reussite >= 1);
    assert.ok(r.data.evaluations.tentatives >= 2);
    const nous = r.data.top_formations.find(f => String(f.id) === String(fid));
    assert.ok(nous); assert.equal(nous.nb_inscrits, 2); assert.equal(nous.taux_completion, 50);
    const doc = r.data.documents_recents.find(d => d.code === code);
    assert.ok(doc); assert.equal(doc.beneficiaire, 'Aminata A.');
    assert.ok(!JSON.stringify(r.data).includes('example.com'), 'aucune adresse e-mail dans les statistiques');
    assert.equal((await call(jarF, 'POST', `/api/attestations/${code}/revoquer`, { motif: 'Test' })).status, 200);
    assert.equal((await call(jarF, 'GET', '/api/admin/formation-stats')).data.documents.revoques >= 1, true);
  });
});
