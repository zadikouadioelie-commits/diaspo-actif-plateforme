/* ===========================================================
   tests/formation-questions.test.js — Formation Diaspora : questions privées de l'élève au formateur (2026-10-30)
   ===========================================================
   Interrupteur par module, droits d'accès de l'élève, arrivée dans la messagerie (onglet « Messages de formation »), traitement par le formateur.
   Intégration HTTP réelle, base SQLite isolée (voir tests/_formation-harness.js).
   Lancer : node --test tests/formation-questions.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('questions'); });
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('questions de formation : interrupteur, accès, messagerie, traitement', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarM = H.cookieJar(), jarX = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid, m1, m2, l1, convId, qid;
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const poser = (jar, mod, texte, extra) => call(jar, 'POST', `/api/formations/${fid}/modules/${mod}/question`, { texte, ...extra });

  await t.test('setup — formateur, un élève inscrit (A), un élève limité au module 1 (M), un compte non inscrit (X)', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    await H.creerApprenant(env, jarA, rnd, 'EleveA');
    await H.creerApprenant(env, jarM, rnd, 'EleveM');
    await H.creerApprenant(env, jarX, rnd, 'Externe');
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Entrepreneuriat ' + rnd, description: 'x' })).data.id;
    const mk = async titre => { const m = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre })).data.id; const ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${m}/chapitres`, { titre: 'C' })).data.id; const l = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon ' + titre, type: 'texte' })).data.id; return { m, l }; };
    ({ m: m1, l: l1 } = await mk('Module un')); ({ m: m2 } = await mk('Module deux'));
    H.publier(env, fid);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
    /* M : accès limité au module 1 */
    sql("INSERT INTO formation_inscriptions (formation_id,user_id,montant_paye,paiement_statut,statut,portee) VALUES (?,?,0,'paye','active','modules')", fid, uid('EleveM'));
    sql("INSERT INTO formation_acces (user_id,formation_id,module_cle,type_acces,statut) VALUES (?,?,?,'gratuit','actif')", uid('EleveM'), fid, m1);
  });

  await t.test('par défaut le canal est désactivé : la question est refusée par le serveur', async () => {
    const r = await poser(jarA, m1, 'Une question sur le module un ?');
    assert.equal(r.status, 403); assert.equal(r.data.code, 'questions_desactivees');
  });

  await t.test("l'interrupteur appartient au formateur", async () => {
    assert.equal((await call(jarA, 'PUT', `/api/formations/${fid}/modules/${m1}`, { questions_actives: true })).status, 403);
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fid}/modules/${m1}`, { questions_actives: true })).status, 200);
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fid}/modules/${m2}`, { questions_actives: true })).status, 200);
    assert.equal(sql('select questions_actives q from formation_modules where id=?', m1)[0].q, 1);
    assert.equal(sql('select questions_actives q from formation_modules where id=?', m2)[0].q, 1);
  });

  await t.test('refus : visiteur, compte non inscrit, texte trop court ou trop long, module hors accès, module inconnu', async () => {
    assert.equal((await poser(anon, m1, 'Bonjour, une question ?')).status, 401);
    assert.equal((await poser(jarX, m1, 'Bonjour, une question ?')).status, 403, 'non inscrit');
    assert.equal((await poser(jarA, m1, 'ok')).status, 400);
    assert.equal((await poser(jarA, m1, 'x'.repeat(1001))).status, 400);
    assert.equal((await poser(jarM, m2, 'Puis-je poser une question sur ce module ?')).status, 403, 'élève limité au module 1 : pas de question sur le module 2');
    assert.equal((await poser(jarA, 99999999, 'Question sur un module inconnu ?')).status, 404);
    assert.equal((await poser(jarF, m1, 'Le formateur ne se pose pas de question ?')).status, 400);
  });

  await t.test('une question arrive dans la messagerie du formateur, avec son contexte', async () => {
    const r = await poser(jarA, m1, 'Comment trouver mes premiers clients ?', { lecon_id: l1 });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    convId = r.data.conversation_id; qid = r.data.question_id;
    assert.equal(r.data.formateur_id, uid('Formateur'));
    assert.equal(sql('select contexte c from conversations where id=?', convId)[0].c, 'formation', 'canal ouvert sans demande de contact préalable');
    const msgs = await call(jarF, 'GET', `/api/conversations/${convId}/messages`);
    assert.equal(msgs.status, 200);
    assert.match(msgs.data.messages[0].contenu, /^🎓 Question — Entrepreneuriat .* › Module un › Leçon Module un\n\nComment trouver mes premiers clients \?$/);
    assert.equal(msgs.data.questions_formation.length, 1);
    const q = msgs.data.questions_formation[0];
    assert.equal(q.statut, 'ouverte'); assert.equal(q.module, 'Module un'); assert.equal(q.en_tant_que, 'formateur');
    assert.equal(sql("select count(*) n from notifications where user_id=? and type='message'", uid('Formateur'))[0].n >= 1, true, 'le formateur est notifié');
  });

  await t.test('doublon : la même question envoyée deux fois de suite est refusée', async () => {
    const r = await poser(jarA, m1, 'Comment trouver mes premiers clients ?');
    assert.equal(r.status, 409);
  });

  await t.test('onglet « Messages de formation » : visible pour les deux, la liste classique ne se pollue pas', async () => {
    let r = await call(jarF, 'GET', '/api/conversations?formation=1');
    assert.equal(r.data.formation.actif, true); assert.equal(r.data.formation.a_traiter, 1);
    assert.equal(r.data.conversations.length, 1); assert.equal(r.data.conversations[0].formation_ouvertes, 1);
    r = await call(jarF, 'GET', '/api/conversations');
    assert.ok(!r.data.conversations.some(c => Number(c.id) === Number(convId)), 'absente de la liste classique du formateur (le message de bienvenue du compte, lui, y reste)');
    assert.equal(r.data.formation.actif, true);
    r = await call(jarA, 'GET', '/api/conversations?formation=1');
    assert.equal(r.data.conversations.length, 1); assert.equal(r.data.formation.a_traiter, 0, "l'élève n'a rien « à traiter »");
    assert.equal((await call(jarX, 'GET', '/api/conversations?formation=1')).data.formation.actif, false, "un compte sans question n'a pas l'onglet");
  });

  await t.test("le formateur répond sans demande de contact : la question passe à « traitée », l'élève peut répliquer", async () => {
    let r = await call(jarF, 'POST', `/api/conversations/${convId}/messages`, { contenu: 'Commencez par identifier un besoin réel autour de vous.' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(sql('select statut s from formation_questions where id=?', qid)[0].s, 'traitee');
    assert.equal((await call(jarF, 'GET', '/api/conversations?formation=1')).data.formation.a_traiter, 0);
    r = await call(jarA, 'POST', `/api/conversations/${convId}/messages`, { contenu: 'Merci, c\'est clair !' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(sql('select statut s from formation_questions where id=?', qid)[0].s, 'traitee', "un message de l'élève ne clôt rien");
  });

  await t.test('rouvrir ou clore à la main : seulement par le formateur concerné', async () => {
    assert.equal((await call(jarA, 'PATCH', `/api/formation-questions/${qid}`, { statut: 'traitee' })).status, 404);
    assert.equal((await call(jarF, 'PATCH', `/api/formation-questions/${qid}`, { statut: 'bizarre' })).status, 400);
    assert.equal((await call(jarF, 'PATCH', `/api/formation-questions/${qid}`, { statut: 'ouverte' })).status, 200);
    assert.equal((await call(jarF, 'GET', '/api/conversations?formation=1')).data.formation.a_traiter, 1);
    assert.equal((await call(jarF, 'PATCH', `/api/formation-questions/${qid}`, { statut: 'traitee' })).status, 200);
    assert.equal((await call(jarF, 'GET', '/api/conversations?formation=1')).data.formation.a_traiter, 0);
  });

  await t.test("désactiver le module : plus de nouvelle question, l'échange en cours reste", async () => {
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fid}/modules/${m1}`, { questions_actives: false })).status, 200);
    const r = await poser(jarA, m1, 'Une autre question sur le module un ?');
    assert.equal(r.status, 403); assert.equal(r.data.code, 'questions_desactivees');
    assert.equal((await call(jarA, 'GET', `/api/conversations/${convId}/messages`)).data.messages.length, 3, 'la conversation existante reste lisible');
  });

  await t.test('un élève avec un accès limité peut poser sa question sur SON module', async () => {
    await call(jarF, 'PUT', `/api/formations/${fid}/modules/${m1}`, { questions_actives: true });
    const r = await poser(jarM, m1, 'Question depuis un accès limité au module un ?');
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal((await call(jarF, 'GET', '/api/conversations?formation=1')).data.conversations.length, 2);
  });
});
