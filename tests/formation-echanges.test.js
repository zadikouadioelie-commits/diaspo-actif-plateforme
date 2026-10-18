/* ===========================================================
   tests/formation-echanges.test.js — Diaspo'Actif Formation, lot 4 (2026-10-18), point 1 : espace d'échange
   ===========================================================
   Questions sous une leçon, réponses du formateur et des apprenants, accès réservé aux inscrits, signalement (une fois par compte, masquage automatique
   à 3), modération, résolution, suppression, notifications utiles.

   Lancer : node --test tests/formation-echanges.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('echanges'); });
test.after(() => { if (env) env.stop(); });

test('espace d\'échange : accès, questions, réponses, signalement, modération', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarO = H.cookieJar(), jarA = H.cookieJar(), jarB = H.cookieJar(), jarC = H.cookieJar(), jarX = H.cookieJar();
  await H.creerFormateur(env, jarO, rnd, 'Formateur');
  const apA = await H.creerApprenant(env, jarA, rnd, 'Aka');
  await H.creerApprenant(env, jarB, rnd, 'Bamba');
  await H.creerApprenant(env, jarC, rnd, 'Coulibaly');
  await H.creerApprenant(env, jarX, rnd, 'Externe');
  const c = (jar, m, u, b) => env.call(jar, m, u, b);
  const notifs = (email) => { const d = new H.DatabaseSync(env.dbPath); const u = d.prepare('SELECT id FROM users WHERE email=?').get(email); const n = d.prepare("SELECT titre FROM notifications WHERE user_id=? ORDER BY id").all(u.id); d.close(); return n.map(x => x.titre); };
  const emailFormateur = () => { const d = new H.DatabaseSync(env.dbPath); const u = d.prepare("SELECT email FROM users WHERE role='administrateur' AND email LIKE ?").get(`%${rnd}%`); d.close(); return u.email; };
  let fid, lecon, qid, rep1;

  await t.test('construction : une formation publiée, 3 apprenants inscrits, un externe non inscrit', async () => {
    fid = (await c(jarO, 'POST', '/api/formations', { titre: 'Échanges ' + rnd, description: 'x' })).data.id;
    const mod = (await c(jarO, 'POST', `/api/formations/${fid}/modules`, { titre: 'M' })).data.id;
    const ch = (await c(jarO, 'POST', `/api/formations/${fid}/modules/${mod}/chapitres`, { titre: 'C' })).data.id;
    lecon = (await c(jarO, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon 1', type: 'texte', contenu_texte: '<p>x</p>' })).data.id;
    H.publier(env, fid);
    for (const jar of [jarA, jarB, jarC]) assert.equal((await c(jar, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
  });

  await t.test('accès : non connecté 401, non inscrit 403, message trop court ou trop long refusé', async () => {
    assert.equal((await c(null, 'GET', `/api/formations/${fid}/discussions`)).status, 401);
    assert.equal((await c(jarX, 'GET', `/api/formations/${fid}/discussions`)).status, 403);
    assert.equal((await c(jarX, 'POST', `/api/formations/${fid}/discussions`, { contenu: 'Bonjour' })).status, 403);
    assert.equal((await c(jarA, 'POST', `/api/formations/${fid}/discussions`, { contenu: 'a' })).status, 400);
    assert.equal((await c(jarA, 'POST', `/api/formations/${fid}/discussions`, { contenu: 'x'.repeat(2001) })).status, 400);
    assert.equal((await c(jarA, 'POST', `/api/formations/${fid}/discussions`, { contenu: 'Bonjour', lecon_id: 999999 })).status, 404, 'leçon étrangère à la formation');
  });

  await t.test('un apprenant pose une question sous une leçon : le formateur est prévenu', async () => {
    const r = await c(jarA, 'POST', `/api/formations/${fid}/discussions`, { contenu: 'Comment calculer la marge ?', lecon_id: lecon });
    assert.equal(r.status, 201); qid = r.data.id;
    const fil = await c(jarB, 'GET', `/api/formations/${fid}/discussions?lecon_id=${lecon}`);
    assert.equal(fil.data.fils.length, 1); assert.equal(fil.data.fils[0].auteur, 'Aminata A.', 'prénom + initiale, jamais le nom complet');
    assert.equal(fil.data.fils[0].role, 'apprenant'); assert.equal(fil.data.moderateur, false); assert.equal(fil.data.resume, undefined);
    assert.ok(notifs(emailFormateur()).some(x => /Nouvelle question/.test(x)), 'le formateur est prévenu de la nouvelle question');
    const g = await c(jarB, 'GET', `/api/formations/${fid}/discussions?lecon_id=general`);
    assert.equal(g.data.fils.length, 0, 'la question est rattachée à la leçon, pas à la formation entière');
    const resume = await c(jarO, 'GET', `/api/formations/${fid}/discussions-resume`);
    assert.equal(resume.data.a_repondre, 1);
    assert.equal((await c(jarA, 'GET', `/api/formations/${fid}/discussions-resume`)).status, 403);
  });

  await t.test('réponses : le formateur (badge) et un autre apprenant ; l\'auteur est prévenu', async () => {
    let r = await c(jarO, 'POST', `/api/formations/${fid}/discussions`, { contenu: 'Marge = prix de vente - coût.', parent_id: qid });
    assert.equal(r.status, 201); rep1 = r.data.id;
    r = await c(jarB, 'POST', `/api/formations/${fid}/discussions`, { contenu: 'Pareil pour moi, merci.', parent_id: qid });
    assert.equal(r.status, 201);
    const fil = await c(jarA, 'GET', `/api/formations/${fid}/discussions?lecon_id=${lecon}`);
    assert.equal(fil.data.fils[0].reponses.length, 2);
    assert.equal(fil.data.fils[0].reponses[0].role, 'formateur');
    assert.equal(fil.data.fils[0].reponses[1].role, 'apprenant');
    const mesNotifs = notifs(apA.email);
    assert.ok(mesNotifs.some(x => /répondu/.test(x)), 'l\'auteur de la question est prévenu : ' + mesNotifs.join(' | '));
    assert.equal((await c(jarO, 'GET', `/api/formations/${fid}/discussions-resume`)).data.a_repondre, 0, 'question avec réponse du formateur : plus à traiter');
    assert.equal((await c(jarA, 'POST', `/api/formations/${fid}/discussions`, { contenu: 'Réponse sur réponse', parent_id: rep1 })).status, 404, 'pas de fil dans le fil');
  });

  await t.test('signalement : une fois par compte, pas son propre message, masquage automatique à 3', async () => {
    const m = (await c(jarA, 'POST', `/api/formations/${fid}/discussions`, { contenu: 'Message litigieux à signaler.', lecon_id: lecon })).data.id;
    assert.equal((await c(jarA, 'POST', `/api/formations/${fid}/discussions/${m}/signaler`, {})).status, 400, 'pas son propre message');
    assert.equal((await c(jarX, 'POST', `/api/formations/${fid}/discussions/${m}/signaler`, {})).status, 403);
    let r = await c(jarB, 'POST', `/api/formations/${fid}/discussions/${m}/signaler`, { motif: 'Hors sujet' }); assert.equal(r.status, 200); assert.equal(r.data.masque, false);
    assert.equal((await c(jarB, 'POST', `/api/formations/${fid}/discussions/${m}/signaler`, {})).status, 409, 'un seul signalement par compte');
    r = await c(jarC, 'POST', `/api/formations/${fid}/discussions/${m}/signaler`, {}); assert.equal(r.data.masque, false);
    r = await c(jarO, 'POST', `/api/formations/${fid}/discussions/${m}/signaler`, {}); assert.equal(r.data.masque, true, 'troisième signalement distinct : masqué');
    const vuApprenant = (await c(jarB, 'GET', `/api/formations/${fid}/discussions?lecon_id=${lecon}`)).data.fils.find(x => x.id === m);
    assert.equal(vuApprenant.masque, true); assert.match(vuApprenant.contenu, /masqué par la modération/); assert.doesNotMatch(vuApprenant.contenu, /litigieux/);
    const vuFormateur = (await c(jarO, 'GET', `/api/formations/${fid}/discussions?lecon_id=${lecon}`)).data.fils.find(x => x.id === m);
    assert.match(vuFormateur.contenu, /litigieux/, 'le formateur lit le message masqué pour décider'); assert.equal(vuFormateur.nb_signalements, 3);
    assert.ok(notifs(emailFormateur()).some(x => /signalé/.test(x)), 'le formateur est prévenu du signalement');
    assert.equal((await c(jarB, 'POST', `/api/formations/${fid}/discussions`, { contenu: 'Réponse à un message masqué', parent_id: m })).status, 403);
    /* Modération : seul le formateur ; réafficher remet les compteurs à zéro. */
    assert.equal((await c(jarB, 'POST', `/api/formations/${fid}/discussions/${m}/moderer`, { action: 'afficher' })).status, 403);
    assert.equal((await c(jarO, 'POST', `/api/formations/${fid}/discussions/${m}/moderer`, { action: 'inconnue' })).status, 400);
    assert.equal((await c(jarO, 'POST', `/api/formations/${fid}/discussions/${m}/moderer`, { action: 'afficher' })).status, 200);
    const apres = (await c(jarB, 'GET', `/api/formations/${fid}/discussions?lecon_id=${lecon}`)).data.fils.find(x => x.id === m);
    assert.equal(apres.masque, false); assert.match(apres.contenu, /litigieux/);
    assert.equal((await c(jarO, 'POST', `/api/formations/${fid}/discussions/${m}/moderer`, { action: 'masquer' })).status, 200);
    assert.equal((await c(jarO, 'POST', `/api/formations/${fid}/discussions/${m}/moderer`, { action: 'supprimer' })).status, 200);
    assert.equal((await c(jarB, 'GET', `/api/formations/${fid}/discussions?lecon_id=${lecon}`)).data.fils.some(x => x.id === m), false);
  });

  await t.test('résolue : l\'auteur ou le formateur, jamais un autre apprenant ; retrait de son propre message', async () => {
    assert.equal((await c(jarB, 'POST', `/api/formations/${fid}/discussions/${qid}/resolue`, {})).status, 403);
    assert.equal((await c(jarA, 'POST', `/api/formations/${fid}/discussions/${qid}/resolue`, {})).status, 200);
    assert.equal((await c(jarA, 'POST', `/api/formations/${fid}/discussions/${rep1}/resolue`, {})).status, 400, 'seule une question peut être résolue');
    assert.equal((await c(jarB, 'GET', `/api/formations/${fid}/discussions?lecon_id=${lecon}`)).data.fils.find(x => x.id === qid).resolue, true);
    assert.equal((await c(jarC, 'DELETE', `/api/formations/${fid}/discussions/${qid}`)).status, 403, 'un autre apprenant ne supprime pas');
    assert.equal((await c(jarA, 'DELETE', `/api/formations/${fid}/discussions/${qid}`)).status, 200, 'l\'auteur retire sa question (et ses réponses)');
    const d = new H.DatabaseSync(env.dbPath);
    assert.equal(d.prepare('SELECT COUNT(*) AS n FROM formation_discussions WHERE parent_id=?').get(qid).n, 0);
    d.close();
  });

  await t.test('suppression de la formation : ses discussions disparaissent', async () => {
    await c(jarA, 'POST', `/api/formations/${fid}/discussions`, { contenu: 'Dernier message avant suppression.' });
    const d = new H.DatabaseSync(env.dbPath);
    d.prepare("UPDATE formations SET statut='brouillon' WHERE id=?").run(fid); d.close();
    const r = await c(jarO, 'DELETE', `/api/formations/${fid}`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const d2 = new H.DatabaseSync(env.dbPath);
    assert.equal(d2.prepare('SELECT COUNT(*) AS n FROM formation_discussions WHERE formation_id=?').get(fid).n, 0);
    d2.close();
  });
});
