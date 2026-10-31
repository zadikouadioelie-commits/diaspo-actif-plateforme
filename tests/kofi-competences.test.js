/* ===========================================================
   tests/kofi-competences.test.js — KOFFI : présentation à la première connexion + « Que sais-tu faire ? » gratuit (2026-10-31)
   ===========================================================
   Règles : toute question sur ce que sait faire Koffi reçoit une réponse complète et fixe, SANS IA, et ne décompte JAMAIS rien (ni question d'élève, ni message du
   formateur, ni forfait) — même quand les crédits sont épuisés ; les questions de contenu ne sont jamais prises pour une question de compétences ; la présentation
   de Koffi est signalée une fois par compte et par rôle (élève / formateur), enregistrée par POST /api/kofi/presentation.
   Lancer : node --test tests/kofi-competences.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');
const Comp = require('../server/kofi-competences');

let env;
test.before(async () => {
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofi-competences');
});
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('Koffi compétences — détection (fonction pure)', () => {
  const oui = ['Que sais-tu faire ?', 'que peux-tu faire', 'Qu\'est-ce que tu sais faire ?', 'Tu sais faire quoi', 'À quoi sers-tu ?', 'Quelles sont tes compétences ?', 'Présente-toi', 'Qui es-tu ?',
    'Comment tu fonctionnes ?', 'En quoi peux-tu m\'aider ?', 'Koffi, que sais-tu faire, s\'il te plaît ?', 'Dis-moi ce que tu sais faire', 'Ko-fi que sais tu faire', 'what can you do?', 'Who are you', 'aide'];
  const non = ['Que peux-tu me dire sur le chapitre 3 ?', 'Explique-moi ce chapitre', 'À quoi sert le module 2 ?', 'Que sais-tu de la comptabilité d\'une association ?', 'Peux-tu faire un résumé du chapitre 2 ?',
    'Comment créer un module ?', 'Crée une carte mentale du module 1', 'Bonjour', 'merci', '', 'x'.repeat(500)];
  oui.forEach(q => assert.ok(Comp.estQuestionCompetences(q), 'doit être reconnue : ' + q));
  non.forEach(q => assert.ok(!Comp.estQuestionCompetences(q), 'ne doit PAS être reconnue : ' + q.slice(0, 40)));
  const reg = { gratuit_questions: 15, credit_mensuel_utilisateur_eur: 0.5, recharge_min_eur: 3, recharge_ratio: 3, retention_jours: 60 };
  const e = Comp.reponseEleve('fr', reg);
  assert.match(e, /source/); assert.match(e, /résume ce chapitre/); assert.match(e, /15 questions offertes/); assert.match(e, /0,50 €/); assert.match(e, /3 € payés = 1 € d'utilisation/); assert.match(e, /ne retire rien de votre solde/);
  assert.match(e, /conseiller de l'Annuaire/);
  assert.match(Comp.reponseEleve('en', { gratuit_questions: 1 }), /1 question once, for good/);
  const c = Comp.reponseCreateur(reg);
  ['Infos générales', 'carte mentale', 'sans changer un seul mot', 'Appliquer', 'publier', '0,50 €', 'un seul solde en euros', 'conseiller d\'orientation'].forEach(x => assert.ok(c.includes(x), 'la liste contient : ' + x));
  const an = Comp.reponseAnnuaire(reg);
  ['au moins trois', 'pourcentage', 'ne pas être proposés par Koffi', 'photo de profil', '0,50 €', 'ne retire rien de votre solde'].forEach(x => assert.ok(an.includes(x), 'la liste Annuaire contient : ' + x));
  assert.ok(!/e-mail|téléphone/.test(an.replace(/\(e-mail, téléphone, messages\)/, '')), 'le conseiller ne promet aucune donnée privée');
});

test('Koffi compétences — présentation et questions gratuites', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid;
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const dire = (texte, extra) => call(jarF, 'POST', '/api/kofi/createur/messages', { formation_id: fid, texte, ...extra });
  const etatF = () => call(jarF, 'GET', `/api/kofi/createur/etat?formation_id=${fid}`);
  const etatA = () => call(jarA, 'GET', `/api/kofi/etat?formation_id=${fid}`);

  await t.test('setup — formation, élève Premium inscrit, formateur majeur, réserve IA rechargée', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur'); await H.creerApprenant(env, jarA, rnd, 'Alpha');
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Formation compétences ' + rnd, description: 'x' })).data.id;
    sql("UPDATE formations SET mode_acces='gratuit', prix=0, gratuit=1 WHERE id=?", fid);
    const m = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'Tontines' })).data.id;
    const ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${m}/chapitres`, { titre: 'Ch' })).data.id;
    await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon', type: 'texte', contenu_texte: '<p>La tontine solidaire fonctionne par cotisations mensuelles.</p>' });
    H.publier(env, fid);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
    sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", uid('Alpha')); sql('DELETE FROM user_accreditations WHERE user_id=?', uid('Alpha'));
    sql("INSERT INTO user_accreditations (user_id, accred_id, statut, date_expiration, type_tarif, montant_paye) VALUES (?, (SELECT id FROM accred_definitions WHERE type='utilisateur_abonne'), 'active', datetime('now','+30 day'), 'mensuel', 9)", uid('Alpha'));
    sql("INSERT OR IGNORE INTO kofi_majorite (user_id, confirme_le, version) VALUES (?, datetime('now'), 'test')", uid('Alpha'));
    assert.equal((await call(jarF, 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
    assert.equal((await call(jarF, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
    H.ordinariser(env, rnd, 'Formateur'); /* le formateur du harnais est administrateur (illimité) : on teste ici un compte ordinaire à portefeuille */
  });

  await t.test('présentation : à la première connexion (élève ET formateur), puis plus jamais ; un rôle ne vaut pas pour l\'autre', async () => {
    assert.equal((await etatA()).data.presentation_vue, false); assert.equal((await etatF()).data.presentation_vue, false);
    assert.equal((await call(anon, 'POST', '/api/kofi/presentation', { portee: 'eleve' })).status, 401);
    assert.equal((await call(jarA, 'POST', '/api/kofi/presentation', { portee: 'autre' })).status, 400);
    assert.equal((await call(jarA, 'POST', '/api/kofi/presentation', { portee: 'eleve' })).status, 200);
    assert.equal((await call(jarA, 'POST', '/api/kofi/presentation', { portee: 'eleve' })).status, 200, 'rejouer ne casse rien (une seule ligne)');
    assert.equal((await etatA()).data.presentation_vue, true, 'l\'élève ne la revoit plus');
    assert.equal((await etatF()).data.presentation_vue, false, 'le rôle formateur a sa propre présentation');
    assert.equal((await call(jarF, 'POST', '/api/kofi/presentation', { portee: 'createur' })).status, 200);
    assert.equal((await etatF()).data.presentation_vue, true);
    assert.equal(sql('select count(*) n from kofi_presentations where user_id=?', uid('Alpha'))[0].n, 1);
  });

  await t.test('formateur : « Que sais-tu faire ? » → réponse complète, sans IA, RIEN décompté', async () => {
    const avant = (await etatF()).data.credits.solde_eur; assert.equal(avant, 0.5);
    const r = await dire('Que sais-tu faire ?');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.message.gratuit, true); assert.deepEqual(r.data.message.actions, []);
    assert.match(r.data.message.contenu, /Infos générales/); assert.match(r.data.message.contenu, /Appliquer/); assert.match(r.data.message.contenu, /ne retire rien de votre solde/);
    assert.equal(r.data.credits.solde_eur, avant, 'aucun euro consommé');
    assert.equal(sql("select count(*) n from kofi_usage where categorie like 'createur%'")[0].n, 0, 'aucune ligne d\'usage : aucun appel à l\'IA');
    const conv = r.data.conversation_id; assert.ok(conv);
    const g = await call(jarF, 'GET', `/api/kofi/createur/conversations/${conv}`);
    assert.equal(g.status, 200); assert.equal(g.data.messages.length, 2);
    /* une vraie question d'outil, elle, est décomptée — la détection ne l'a pas confondue */
    const q = await dire('Comment créer un examen final ?', { conversation_id: conv });
    assert.equal(q.status, 200); assert.ok(q.data.credits.solde_eur < avant, 'le portefeuille baisse'); const apres = q.data.credits.solde_eur;
    /* la même question, plusieurs fois : toujours gratuite */
    for (const t2 of ['Qu\'est-ce que tu peux faire ?', 'À quoi sers-tu ?', 'Présente-toi']) { const x = await dire(t2, { conversation_id: conv }); assert.equal(x.status, 200); assert.equal(x.data.message.gratuit, true); assert.equal(x.data.credits.solde_eur, apres); }
  });

  await t.test('formateur : portefeuille épuisé → une question de contenu est refusée (402), « Que sais-tu faire ? » est TOUJOURS servie', async () => {
    sql("UPDATE kofi_solde SET montant_restant=0 WHERE user_id=?", uid('Formateur'));
    const e = await etatF(); assert.equal(e.data.etat, 'recharge');
    const refus = await dire('Comment fixer le prix ?'); assert.equal(refus.status, 402); assert.equal(refus.data.code, 'credits_epuises');
    const ok = await dire('Que sais-tu faire ?'); assert.equal(ok.status, 200, JSON.stringify(ok.data)); assert.equal(ok.data.message.gratuit, true);
  });

  await t.test('élève : « Que sais-tu faire ? » → réponse complète, sans IA, aucune question décomptée ; une vraie question, elle, l\'est', async () => {
    const c = (await call(jarA, 'POST', '/api/kofi/conversations', { formation_id: fid })).data.id; assert.ok(c);
    const q = (texte, langue) => call(jarA, 'POST', `/api/kofi/conversations/${c}/messages`, { texte, langue: langue || 'fr' });
    const avant = (await etatA()).data.portefeuille; assert.equal(avant.solde_eur, 0.5);
    const r = await q('Que sais-tu faire ?');
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.deepEqual(r.data.message.flags, ['competences']); assert.deepEqual(r.data.message.citations, []);
    assert.match(r.data.message.contenu, /source citée/); assert.match(r.data.message.contenu, /résume ce chapitre/); assert.match(r.data.message.contenu, /ne retire rien de votre solde/);
    assert.deepEqual(r.data.portefeuille, avant, 'rien n\'est décompté du portefeuille');
    assert.equal(sql('select count(*) n from kofi_usage where user_id=?', uid('Alpha'))[0].n, 0, 'aucun appel à l\'IA');
    const en = await q('What can you do?', 'en'); assert.equal(en.status, 200); assert.match(en.data.message.contenu, /Here is everything I can do/); assert.deepEqual(en.data.portefeuille, avant);
    const vraie = await q('Comment fonctionne la tontine solidaire ?');
    assert.equal(vraie.status, 200, JSON.stringify(vraie.data)); assert.ok(vraie.data.portefeuille.solde_eur < 0.5 && vraie.data.portefeuille.solde_eur > 0.49, 'une vraie question est débitée au coût réel');
    /* à court de crédit : la question sur Koffi reste servie */
    sql("UPDATE kofi_solde SET montant_restant=0 WHERE user_id=?", uid('Alpha'));
    const epuise = await q('Comment fonctionne la tontine solidaire ?'); assert.equal(epuise.status, 402); assert.equal(epuise.data.code, 'credits_epuises');
    const encore = await q('Que sais-tu faire ?'); assert.equal(encore.status, 200); assert.deepEqual(encore.data.message.flags, ['competences']);
    /* l'historique garde le drapeau (l'écran s'en sert pour dire « gratuit ») */
    const h = await call(jarA, 'GET', `/api/kofi/conversations/${c}`); assert.ok(h.data.messages.some(m => (m.flags || []).includes('competences')));
  });

  await t.test('effacement du compte : la ligne « présentation vue » est supprimée', async () => {
    assert.equal(sql('select count(*) n from kofi_presentations where user_id=?', uid('Alpha'))[0].n, 1);
    const Kofi = require('../server/kofi');
    const db = new H.DatabaseSync(env.dbPath);
    try {
      const base = { prepare: s => { const p = db.prepare(s); return { run: async (...a) => p.run(...a), get: async (...a) => p.get(...a), all: async (...a) => p.all(...a) }; } };
      await Kofi.effacerCompte(base, uid('Alpha'));
    } finally { db.close(); }
    assert.equal(sql('select count(*) n from kofi_presentations where user_id=?', uid('Alpha'))[0].n, 0);
  });
});
