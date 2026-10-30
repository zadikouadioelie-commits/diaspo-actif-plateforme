/* ===========================================================
   tests/formation-studio.test.js — Formation Diaspora, lot D : Studio de création (2026-10-30)
   ===========================================================
   Sauvegarde automatique (révisions + conflits), nettoyage du contenu côté serveur, historique, publication contrôlée, lecture par les apprenants
   (version publiée seulement), droits d'accès. Intégration HTTP réelle, base SQLite isolée (voir tests/_formation-harness.js).
   Lancer : node --test tests/formation-studio.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('studio'); });
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('studio : sauvegarde, versions, publication, lecture', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarX = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid, lid, mid, base, rev;
  const page = (id, elements) => ({ id, titre: 'P', elements });
  const titre = (id, html, extra) => ({ id, type: 'titre', x: 100, y: 40, w: 800, h: 80, z: 1, props: { html, taille: 40 }, ...extra });

  await t.test('setup — formation publiée avec une leçon, formateur, apprenant inscrit, étranger non inscrit', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    await H.creerApprenant(env, jarA, rnd, 'Apprenant');
    await H.creerApprenant(env, jarX, rnd, 'Etranger');
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Studio ' + rnd, description: 'x' })).data.id;
    mid = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'M' })).data.id;
    const ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${mid}/chapitres`, { titre: 'C' })).data.id;
    lid = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon studio', type: 'texte' })).data.id;
    H.publier(env, fid);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
    base = `/api/formations/${fid}/lecons/${lid}/studio`;
  });

  await t.test('droits : ni visiteur ni apprenant ne touchent au studio', async () => {
    assert.equal((await call(anon, 'GET', base)).status, 401);
    assert.equal((await call(jarA, 'GET', base)).status, 403);
    assert.equal((await call(jarA, 'PUT', base, { mode: 'libre', pages: [page('p1', [])] })).status, 403);
  });

  await t.test('un module studio neuf : document vide, non enregistré', async () => {
    const r = await call(jarF, 'GET', base);
    assert.equal(r.status, 200);
    assert.equal(r.data.existe, false); assert.equal(r.data.rev, 0);
    assert.equal(r.data.doc.pages.length, 1);
  });

  await t.test('première sauvegarde : crée le document, marque la leçon, nettoie le contenu dangereux', async () => {
    const r = await call(jarF, 'PUT', base, { mode: 'libre', pages: [page('p1', [
      titre('e1', '<p>Bonjour<script>alert(1)</script> <b onclick="x()">monde</b></p>'),
      { id: 'e2', type: 'image', x: 10, y: 10, w: 400, h: 300, props: { url: 'javascript:alert(1)', alt: 'a' } },
      { id: 'e3', type: 'image', x: 10, y: 10, w: 400, h: 300, props: { url: 'https://diaspoactif-media.b-cdn.net/x.jpg' } },
      { id: 'e4', type: 'bouton', x: 0, y: 0, w: 200, h: 50, props: { libelle: 'Aller', action: 'page', page: 'inexistante' } },
      { id: 'e5', type: 'inconnu', x: 0, y: 0, w: 1, h: 1, props: {} },
    ])] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    rev = r.data.rev; assert.equal(rev, 1);
    assert.equal(sql('select studio s from formation_lecons where id=?', lid)[0].s, 1);
    const els = r.data.doc.pages[0].elements;
    assert.equal(els.length, 4, 'le type inconnu est écarté');
    assert.ok(!/script|onclick/i.test(els[0].props.html), els[0].props.html);
    assert.equal(els[1].props.url, '', 'javascript: refusé');
    assert.equal(els[2].props.url, 'https://diaspoactif-media.b-cdn.net/x.jpg');
    assert.equal(els[3].props.page, '', 'page de destination inexistante');
    assert.equal(els[0].props.taille, 40, 'taille choisie conservée');
    assert.equal(els[0].props.interligne, 0, 'interligne automatique (0) jamais ramené au minimum');
    const rec = await call(jarF, 'GET', base);
    assert.equal(rec.data.existe, true); assert.equal(rec.data.doc.mode, 'libre'); assert.equal(rec.data.rev, 1);
  });

  await t.test('conflit de modification : une révision périmée est refusée, la bonne passe', async () => {
    let r = await call(jarF, 'PUT', base, { mode: 'libre', rev: 99, pages: [page('p1', [titre('e1', '<p>X</p>')])] });
    assert.equal(r.status, 409); assert.equal(r.data.code, 'conflit'); assert.equal(r.data.rev, 1);
    r = await call(jarF, 'PUT', base, { mode: 'libre', rev: 1, pages: [page('p1', [titre('e1', '<p>Version 2</p>'), { id: 'e3', type: 'image', x: 10, y: 10, w: 400, h: 300, props: { url: '' } }])] });
    assert.equal(r.status, 200); assert.equal(r.data.rev, 2); rev = 2;
  });

  await t.test('limites : trop de pages, contenu invalide', async () => {
    assert.equal((await call(jarF, 'PUT', base, { mode: 'libre', rev, pages: Array.from({ length: 61 }, (_, i) => page('p' + i, [])) })).status, 400);
    assert.equal((await call(jarF, 'PUT', base, { mode: 'libre', rev })).status, 400);
  });

  await t.test('publication contrôlée : une image sans fichier bloque, la liste des problèmes est précise', async () => {
    const r = await call(jarF, 'POST', base + '/publier');
    assert.equal(r.status, 400);
    assert.ok(r.data.problemes.some(p => /Page 1 : une image n'a pas de fichier/.test(p)), JSON.stringify(r.data));
    assert.equal((await call(jarA, 'GET', base + '/lecture')).status, 404, 'rien de publié : rien à lire');
  });

  await t.test('publier : la version publiée est lue par l\'apprenant, pas le brouillon', async () => {
    let r = await call(jarF, 'PUT', base, { mode: 'structure', rev, pages: [page('p1', [titre('e1', '<p>Publié</p>')]), page('p2', [titre('e2', '<p>Page deux</p>')])] });
    assert.equal(r.status, 200); rev = r.data.rev;
    r = await call(jarF, 'POST', base + '/publier');
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.version, 1);
    r = await call(jarA, 'GET', base + '/lecture');
    assert.equal(r.status, 200);
    assert.equal(r.data.doc.pages.length, 2); assert.equal(r.data.version, 1);
    r = await call(jarF, 'PUT', base, { mode: 'structure', rev, pages: [page('p1', [titre('e1', '<p>Brouillon modifié</p>')])] });
    assert.equal(r.status, 200); rev = r.data.rev;
    r = await call(jarA, 'GET', base + '/lecture');
    assert.ok(JSON.stringify(r.data.doc).includes('Publié'), 'l\'apprenant lit toujours la version publiée');
    assert.ok(!JSON.stringify(r.data.doc).includes('Brouillon modifié'));
    r = await call(jarF, 'GET', base + '/lecture?brouillon=1');
    assert.ok(JSON.stringify(r.data.doc).includes('Brouillon modifié'), 'le propriétaire prévisualise son brouillon');
    r = await call(jarA, 'GET', base + '/lecture?brouillon=1');
    assert.ok(!JSON.stringify(r.data.doc).includes('Brouillon modifié'), 'un apprenant ne lit jamais le brouillon');
  });

  await t.test('accès à la lecture : un compte non inscrit et un visiteur sont refusés', async () => {
    assert.equal((await call(jarX, 'GET', base + '/lecture')).status, 403);
    assert.equal((await call(anon, 'GET', base + '/lecture')).status, 403);
    sql('UPDATE formation_lecons SET apercu_gratuit=1 WHERE id=?', lid);
    assert.equal((await call(anon, 'GET', base + '/lecture')).status, 200, 'leçon offerte en aperçu gratuit');
    sql('UPDATE formation_lecons SET apercu_gratuit=0 WHERE id=?', lid);
  });

  await t.test('historique : point de restauration, puis restauration (le brouillon actuel est conservé)', async () => {
    let r = await call(jarF, 'POST', base + '/versions', { libelle: 'Avant essai' });
    assert.equal(r.status, 201);
    const liste = (await call(jarF, 'GET', base + '/versions')).data.versions;
    assert.ok(liste.length >= 2);
    assert.ok(liste.some(v => v.publiee && v.en_ligne), 'la version publiée est signalée en ligne');
    r = await call(jarF, 'POST', base + '/restaurer', { version: 1, rev: 1 });
    assert.equal(r.status, 409, 'révision périmée refusée');
    r = await call(jarF, 'POST', base + '/restaurer', { version: 1, rev });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(JSON.stringify(r.data.doc).includes('Page deux'), 'contenu de la version 1 restauré');
    assert.ok((await call(jarF, 'GET', base + '/versions')).data.versions.some(v => /Avant restauration/.test(v.libelle || '')), 'brouillon précédent conservé');
    assert.equal((await call(jarF, 'POST', base + '/restaurer', { version: 999 })).status, 404);
  });

  /* ───── Activité évaluée (quiz / questionnaire / exercice) ───── */
  let lid2, base2, quizId, qid1;
  await t.test('activité : création réservée au formateur, un seul type reconnu, une seule par leçon', async () => {
    const ch = sql('select chapitre_id c from formation_lecons where id=?', lid)[0].c;
    lid2 = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon avec quiz', type: 'texte' })).data.id;
    base2 = `/api/formations/${fid}/lecons/${lid2}/studio`;
    assert.equal((await call(jarA, 'POST', base2 + '/activite', { kind: 'questionnaire' })).status, 403);
    assert.equal((await call(jarF, 'POST', base2 + '/activite', { kind: 'bidon' })).status, 400);
    let r = await call(jarF, 'POST', base2 + '/activite', { kind: 'questionnaire', titre: 'Mon questionnaire' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); quizId = r.data.quiz.id;
    assert.equal(r.data.quiz.kind, 'questionnaire'); assert.equal(r.data.quiz.note_minimale, 50);
    assert.equal(sql('select lecon_id l, type t from formation_quiz where id=?', quizId)[0].l, lid2);
    assert.equal((await call(jarF, 'POST', base2 + '/activite', { kind: 'evaluation' })).status, 409);
  });

  await t.test('réglages : bornes contrôlées côté serveur', async () => {
    assert.equal((await call(jarF, 'PUT', base2 + '/activite', { note_minimale: 150 })).status, 400);
    assert.equal((await call(jarF, 'PUT', base2 + '/activite', { max_tentatives: 99 })).status, 400);
    assert.equal((await call(jarF, 'PUT', base2 + '/activite', { depot_fichier: 'obligatoire' })).status, 400, 'dépôt réservé aux exercices corrigés à la main');
    const r = await call(jarF, 'PUT', base2 + '/activite', { note_minimale: 60, max_tentatives: 3, melanger: true });
    assert.equal(r.status, 200); assert.equal(r.data.quiz.note_minimale, 60); assert.equal(r.data.quiz.max_tentatives, 3); assert.equal(r.data.quiz.melanger, true);
  });

  await t.test('questions : validation (choix, bonnes réponses, vrai/faux) puis ajout, modification, suppression', async () => {
    const q = body => call(jarF, 'POST', base2 + '/activite/questions', body);
    assert.equal((await q({ question: '', type: 'qcm' })).status, 400);
    assert.equal((await q({ question: 'Q ?', type: 'qcm', options: ['A'], bonnes: ['A'] })).status, 400, 'au moins deux choix');
    assert.equal((await q({ question: 'Q ?', type: 'qcm', options: ['A', 'B'], bonnes: [] })).status, 400, 'au moins une bonne réponse');
    assert.equal((await q({ question: 'Q ?', type: 'vrai_faux' })).status, 400);
    let r = await q({ question: 'Capitale de la France ?', type: 'qcm', options: ['Lyon', 'Paris', 'Nice'], bonnes: ['Paris'], points: 2, explication: 'Paris est la capitale.' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); qid1 = r.data.id;
    assert.equal(r.data.quiz.questions[0].reponse_correcte, 'Paris');
    r = await q({ question: 'La Terre est ronde.', type: 'vrai_faux', bonne: 'Vrai' }); assert.equal(r.status, 201);
    r = await call(jarF, 'PUT', base2 + `/activite/questions/${qid1}`, { question: 'Capitale de la France ?', type: 'qcm', options: ['Lyon', 'Paris', 'Nice', 'Lille'], bonnes: ['Paris'], points: 2, explication: 'Paris, bien sûr.' });
    assert.equal(r.status, 200); assert.equal(r.data.quiz.questions[0].options.length, 4); assert.equal(r.data.quiz.questions[0].explication, 'Paris, bien sûr.');
    r = await q({ question: 'À supprimer', type: 'texte_libre' }); const aSup = r.data.id;
    r = await call(jarF, 'DELETE', base2 + `/activite/questions/${aSup}`); assert.equal(r.data.quiz.questions.length, 2);
  });

  await t.test("publication : le quiz doit être placé dans une page, un quiz d'une autre leçon est ignoré", async () => {
    let r = await call(jarF, 'PUT', base2, { mode: 'structure', pages: [page('p1', [titre('e1', '<p>Cours</p>')])] });
    assert.equal(r.status, 200); let rev2 = r.data.rev;
    r = await call(jarF, 'POST', base2 + '/publier');
    assert.equal(r.status, 400); assert.ok(r.data.problemes.some(p => /n'est placée dans aucune page/.test(p)), JSON.stringify(r.data));
    r = await call(jarF, 'PUT', base2, { mode: 'structure', rev: rev2, pages: [page('p1', [titre('e1', '<p>Cours</p>'), { id: 'q1', type: 'quiz', props: { quiz_id: 99999 } }, { id: 'q2', type: 'quiz', props: { quiz_id: quizId } }])] });
    assert.equal(r.status, 200); rev2 = r.data.rev;
    assert.equal(r.data.doc.pages[0].elements.filter(e => e.type === 'quiz').length, 1, 'un seul élément quiz par module');
    assert.equal(r.data.doc.pages[0].elements.find(e => e.type === 'quiz').props.quiz_id, 0, 'quiz_id étranger remis à zéro');
    r = await call(jarF, 'PUT', base2, { mode: 'structure', rev: rev2, pages: [page('p1', [titre('e1', '<p>Cours</p>'), { id: 'q1', type: 'quiz', props: { quiz_id: quizId } }])] });
    assert.equal(r.data.doc.pages[0].elements.find(e => e.type === 'quiz').props.quiz_id, quizId, 'le quiz de la leçon est conservé');
    r = await call(jarF, 'POST', base2 + '/publier'); assert.equal(r.status, 200, JSON.stringify(r.data));
  });

  await t.test("apprenant : passe le quiz de la leçon, le corrigé et l'explication ne viennent qu'après la réussite", async () => {
    const quizUrl = `/api/formations/${fid}/quiz/${quizId}`;
    let r = await call(jarA, 'GET', quizUrl + '/passer'); assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(!JSON.stringify(r.data).includes('Paris, bien sûr'), "jamais l'explication avant la réussite");
    const qs = r.data.questions; const q1 = qs.find(x => /Capitale/.test(x.question)), q2 = qs.find(x => /Terre/.test(x.question));
    r = await call(jarA, 'POST', quizUrl + '/soumettre', { reponses: { [q1.id]: 'Lyon', [q2.id]: 'Faux' } });
    assert.equal(r.status, 200); assert.equal(r.data.reussi, false);
    assert.ok(!JSON.stringify(r.data.detail).includes('explication'), "raté : pas d'explication");
    r = await call(jarA, 'POST', quizUrl + '/soumettre', { reponses: { [q1.id]: 'Paris', [q2.id]: 'Vrai' } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.reussi, true);
    assert.ok(r.data.detail.some(d => d.explication === 'Paris, bien sûr.'), 'explication révélée après réussite');
    assert.equal(sql('select termine t from formation_lecons_progression where lecon_id=?', lid2)[0].t, 1, 'réussir le quiz valide la leçon');
  });

  await t.test("supprimer l'activité : questions et résultats effacés, la leçon redevient libre", async () => {
    assert.equal((await call(jarA, 'DELETE', base2 + '/activite')).status, 403);
    assert.equal((await call(jarF, 'DELETE', base2 + '/activite')).status, 200);
    assert.equal(sql('select count(*) n from formation_quiz where id=?', quizId)[0].n, 0);
    assert.equal(sql('select count(*) n from formation_quiz_questions where quiz_id=?', quizId)[0].n, 0);
    assert.equal((await call(jarF, 'GET', base2 + '/activite')).data.quiz, null);
  });

  await t.test('document : seul un fichier https est conservé, le mode est contrôlé', async () => {
    let r = await call(jarF, 'GET', base2);
    r = await call(jarF, 'PUT', base2, { mode: 'structure', rev: r.data.rev, pages: [page('p1', [{ id: 'd1', type: 'document', props: { url: 'http://exemple.org/x.pdf', nom: 'Guide', mode: 'bizarre' } }, { id: 'd2', type: 'document', props: { url: 'https://diaspoactif-media.b-cdn.net/documents/1-1.pdf', nom: 'Guide', mode: 'telechargement' } }])] });
    assert.equal(r.status, 200);
    const [d1, d2] = r.data.doc.pages[0].elements; assert.equal(d1.props.url, ''); assert.equal(d1.props.mode, 'lecteur'); assert.equal(d2.props.mode, 'telechargement');
    assert.ok((await call(jarF, 'POST', base2 + '/publier')).data.problemes.some(p => /un document n'a pas de fichier/.test(p)));
  });


  /* ───── Bibliothèque de médias du formateur ───── */
  await t.test('médias : un fichier envoyé par le compte entre dans sa bibliothèque, réutilisable, sans doublon', async () => {
    const uF = sql('select id from users where email=?', H.compte(rnd, 'Formateur', 'utilisateur').email)[0].id;
    const cdn = 'https://diaspoactif-media.b-cdn.net';
    assert.equal((await call(anon, 'GET', '/api/formateur/medias')).status, 401);
    let r = await call(jarF, 'POST', '/api/formateur/medias', { type: 'document', url: `${cdn}/documents/${uF}-1700000000000.xlsx`, nom: 'Budget 2026.xlsx', taille: 52000 });
    assert.equal(r.status, 201, JSON.stringify(r.data)); const idDoc = r.data.media.id;
    r = await call(jarF, 'POST', '/api/formateur/medias', { type: 'image', url: `${cdn}/posts/${uF}-1700000000001.jpg`, nom: 'Couverture' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    r = await call(jarF, 'POST', '/api/formateur/medias', { type: 'document', url: `${cdn}/documents/${uF}-1700000000000.xlsx` });
    assert.equal(r.status, 200); assert.equal(r.data.deja, true, 'la même adresse n\'est pas ajoutée deux fois');
    r = await call(jarF, 'GET', '/api/formateur/medias');
    assert.equal(r.data.medias.length, 2);
    assert.equal((await call(jarF, 'GET', '/api/formateur/medias?type=image')).data.medias.length, 1);
    assert.equal((await call(jarF, 'GET', '/api/formateur/medias?q=budget')).data.medias[0].nom, 'Budget 2026.xlsx');
    r = await call(jarF, 'PATCH', `/api/formateur/medias/${idDoc}`, { nom: 'Budget prévisionnel' });
    assert.equal(r.status, 200);
    assert.equal((await call(jarF, 'GET', '/api/formateur/medias?q=prévisionnel')).data.medias.length, 1);
    /* une autre personne ne voit ni ne touche à cette bibliothèque */
    assert.equal((await call(jarA, 'GET', '/api/formateur/medias')).data.medias.length, 0);
    assert.equal((await call(jarA, 'PATCH', `/api/formateur/medias/${idDoc}`, { nom: 'x' })).status, 404);
    assert.equal((await call(jarA, 'DELETE', `/api/formateur/medias/${idDoc}`)).status, 404);
  });

  await t.test('médias : les fichiers des autres, les hôtes étrangers et les adresses non sûres sont refusés', async () => {
    const uF = sql('select id from users where email=?', H.compte(rnd, 'Formateur', 'utilisateur').email)[0].id;
    const cdn = 'https://diaspoactif-media.b-cdn.net';
    const essai = body => call(jarF, 'POST', '/api/formateur/medias', body);
    assert.equal((await essai({ type: 'image', url: `${cdn}/posts/${uF + 999}-1700000000002.jpg` })).status, 400, 'fichier d\'un autre compte');
    assert.equal((await essai({ type: 'document', url: `https://exemple.org/documents/${uF}-1700000000003.pdf` })).status, 400, 'hôte étranger');
    assert.equal((await essai({ type: 'document', url: `${cdn}/autre/${uF}-1700000000004.pdf` })).status, 400, 'dossier inattendu');
    assert.equal((await essai({ type: 'document', url: `http://diaspoactif-media.b-cdn.net/documents/${uF}-1700000000005.pdf` })).status, 400, 'https obligatoire');
    assert.equal((await essai({ type: 'image', url: 'javascript:alert(1)' })).status, 400);
    assert.equal((await essai({ type: 'bidon', url: `${cdn}/posts/${uF}-1.jpg` })).status, 400);
    /* vidéos et audios : adresse https libre (YouTube, fichier hébergé) */
    assert.equal((await essai({ type: 'video', url: 'https://www.youtube.com/watch?v=abcdefghijk', nom: 'Présentation' })).status, 201);
    assert.equal((await essai({ type: 'audio', url: 'https://exemple.org/podcast.mp3', nom: 'Épisode 1' })).status, 201);
  });

  await t.test('médias : suppression de la bibliothèque (le fichier utilisé dans un module reste lisible)', async () => {
    const liste = (await call(jarF, 'GET', '/api/formateur/medias')).data.medias;
    const doc = liste.find(m => /Budget/.test(m.nom));
    assert.equal((await call(jarF, 'DELETE', `/api/formateur/medias/${doc.id}`)).status, 200);
    assert.ok(!(await call(jarF, 'GET', '/api/formateur/medias')).data.medias.some(m => m.id === doc.id));
  });


  await t.test('dépublier : plus rien pour l\'apprenant, le brouillon et l\'historique restent', async () => {
    assert.equal((await call(jarF, 'POST', base + '/depublier')).status, 200);
    assert.equal((await call(jarA, 'GET', base + '/lecture')).status, 404);
    assert.equal((await call(jarF, 'POST', base + '/depublier')).status, 409);
    assert.equal((await call(jarF, 'GET', base)).data.existe, true);
  });
});
