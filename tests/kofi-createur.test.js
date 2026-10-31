/* ===========================================================
   tests/kofi-createur.test.js — KOFFI : assistant du formateur (2026-10-31)
   ===========================================================
   Règles : réservé au formateur de la formation ; majeur ; messages gratuits par jour puis forfait (compteur séparé de celui des élèves) ; Koffi ne modifie RIEN seul —
   chaque mission est une proposition, appliquée une seule fois sur clic ; identifiants inventés rejetés ; texte importé recopié MOT POUR MOT ; HTML nettoyé ; carte mentale
   native + leçon Studio dans le chapitre ; conversations du formateur invisibles du tuteur ; achat du forfait par Stripe (webhook).
   Lancer : node --test tests/kofi-createur.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const Createur = require('../server/kofi-createur');
const Kofi = require('../server/kofi');

let env;
const journalStripe = path.join(os.tmpdir(), 'faux-stripe-kofi-createur-' + process.pid + '.log');
test.before(async () => {
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(path.join(__dirname, '_faux-stripe-preload.js')).replace(/\\\\/g, '/');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_factice';
  process.env.FAUX_STRIPE_LOG = journalStripe;
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.KOFI_UPLOAD_FAUX = '1';
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofi-createur');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalStripe); } catch (e) { /* absent */ } });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
async function webhook(type, objet) {
  const res = await fetch(env.base + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 'x' }, body: JSON.stringify({ type, data: { object: objet } }) });
  return res.status;
}
const sessionsStripe = () => { try { return fs.readFileSync(journalStripe, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };

/* ── Pures : conversion du texte, plan, sortie du modèle ── */
test('Koffi créateur — outils purs', async (t) => {
  await t.test('le dossier d\'une discussion est donné au modèle (et seulement lui)', () => {
    const avec = Createur.systemePour({ titre: 'F' }, { nom: 'Module 3' }), sans = Createur.systemePour({ titre: 'F' }, null);
    assert.match(avec, /dossier « Module 3 »/); assert.ok(!/dossier «/.test(sans));
  });
  await t.test('plan : tranches contiguës, tout le texte couvert, rien perdu ni dupliqué', () => {
    const r = Createur.normaliserPlan([{ chapitre: 'A', lecons: [{ titre: 'L1', de: 3, a: 4 }, { titre: 'L2', de: 1, a: 2 }] }, { chapitre: 'B', lecons: [{ titre: 'L3', de: 99, a: 100 }] }], 10);
    assert.ok(!r.erreur);
    const plat = r.chapitres.flatMap(c => c.lecons);
    assert.deepEqual(plat.map(l => [l.de, l.a]), [[1, 4], [5, 5], [6, 10]], 'tranches contiguës');
    assert.equal(plat[0].de, 1); assert.equal(plat[plat.length - 1].a, 10);
    plat.forEach((l, i) => { if (i) assert.equal(l.de, plat[i - 1].a + 1); });
    assert.ok(Createur.normaliserPlan([], 5).erreur); assert.ok(Createur.normaliserPlan([{ chapitre: 'A', lecons: [] }], 5).erreur);
  });
  await t.test('texte → HTML : mots inchangés, balises autorisées seulement, HTML du formateur échappé', () => {
    const paras = ['Introduction', 'Un paragraphe <b>avec</b> du HTML & des "guillemets".', '- premier point', '- second point', '1. étape un', '2. étape deux', 'Fin du texte.'];
    const html = Createur.texteVersHtml(paras);
    assert.match(html, /<h3>Introduction<\/h3>/); assert.match(html, /<ul><li>premier point<\/li><li>second point<\/li><\/ul>/); assert.match(html, /<ol><li>étape un<\/li><li>étape deux<\/li><\/ol>/);
    assert.ok(!/<b>/.test(html), 'le <b> du formateur est échappé, pas interprété');
    assert.equal(Kofi.texteDeHtml(html).replace(/\s+/g, ' ').includes('Un paragraphe <b>avec</b> du HTML & des "guillemets".'), true, 'texte identique une fois reconverti');
  });
  await t.test('sortie du modèle : bloc <actions> extrait et retiré ; JSON invalide ignoré ; au plus 6', () => {
    const a = Createur.parserSortie('Bonjour. <actions>[{"type":"ajouter_module","titre":"X"}]</actions>');
    assert.equal(a.texte, 'Bonjour.'); assert.equal(a.brutes.length, 1);
    assert.deepEqual(Createur.parserSortie('Rien. <actions>pas du json</actions>').brutes, []);
    assert.equal(Createur.parserSortie('<actions>' + JSON.stringify(Array(10).fill({ type: 'ajouter_module', titre: 'x' })) + '</actions>').brutes.length, 6);
  });
  await t.test('mission : identifiant d\'une AUTRE formation, type inconnu, titre vide → rejetés', () => {
    const ctx = { modulesIds: new Set([1]), chapitres: new Map([[5, 1]]), paras: null };
    assert.ok(Createur.validerMission({ type: 'ajouter_chapitre', module_id: 2, titre: 'x' }, ctx).erreur);
    assert.ok(Createur.validerMission({ type: 'supprimer_tout' }, ctx).erreur);
    assert.ok(Createur.validerMission({ type: 'ajouter_module', titre: '   ' }, ctx).erreur);
    assert.ok(Createur.validerMission({ type: 'importer_texte', nouveau_module: 'M', plan: [{ chapitre: 'a', lecons: [{ titre: 'l', de: 1, a: 1 }] }] }, ctx).erreur, 'pas de texte numéroté : rien à importer');
    assert.ok(!Createur.validerMission({ type: 'ajouter_chapitre', module_id: 1, titre: 'ok' }, ctx).erreur);
    assert.ok(Createur.validerMission({ type: 'renseigner_infos', champs: { inconnu: 'x', niveau: 'Expert absolu' } }, ctx).erreur, 'aucun champ valide : rejeté');
    const v = Createur.validerMission({ type: 'renseigner_infos', champs: { niveau: 'Avancé', duree_heures: 99999, titre: '  Mon titre  ' } }, { ...ctx, f: { titre: 'Ancien' } });
    assert.deepEqual(v.params.champs, { titre: 'Mon titre', niveau: 'Avancé' }, 'durée hors bornes ignorée'); assert.deepEqual(v.params.remplace, ['titre']);
  });
});

test('Koffi créateur — assistant du formateur', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid, mid, cid;
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const dire = (texte, extra) => call(jarF, 'POST', '/api/kofi/createur/messages', { formation_id: fid, texte, ...extra });
  const etat = () => call(jarF, 'GET', `/api/kofi/createur/etat?formation_id=${fid}`);

  await t.test('setup — formation en brouillon (1 module, 1 chapitre), réserve IA rechargée', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur'); await H.creerApprenant(env, jarA, rnd, 'Apprenant');
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Formation créateur ' + rnd, description: 'x' })).data.id;
    mid = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'Module un' })).data.id;
    cid = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${mid}/chapitres`, { titre: 'Chapitre un' })).data.id;
    await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${cid}/lecons`, { titre: 'Leçon existante', type: 'texte', contenu_texte: '<p>Contenu de départ.</p>' });
    assert.equal((await call(jarF, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
  });

  await t.test('accès : visiteur 401 ; un autre compte 403 ; majorité à confirmer avant tout message', async () => {
    assert.equal((await call(anon, 'GET', `/api/kofi/createur/etat?formation_id=${fid}`)).status, 401);
    assert.equal((await call(jarA, 'GET', `/api/kofi/createur/etat?formation_id=${fid}`)).status, 403);
    assert.equal((await call(jarA, 'POST', '/api/kofi/createur/messages', { formation_id: fid, texte: 'bonjour' })).status, 403);
    assert.equal((await call(jarF, 'GET', '/api/kofi/createur/etat?formation_id=999999')).status, 404);
    let r = await etat(); assert.equal(r.data.etat, 'majorite'); assert.ok(r.data.majorite.texte);
    r = await dire('Bonjour'); assert.equal(r.status, 403); assert.equal(r.data.code, 'majorite_requise');
    assert.equal((await call(jarF, 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
    r = await etat(); assert.equal(r.data.etat, 'utilisable'); assert.equal(r.data.credits.gratuits_jour, 20); assert.equal(r.data.credits.gratuits_restants, 20);
    assert.equal(r.data.forfait.messages, 1000); assert.equal(r.data.forfait.prix_eur, 5);
  });

  let conv;
  await t.test('une question d\'outil : réponse, aucune mission, un message gratuit décompté', async () => {
    const r = await dire('Comment créer un examen final ?');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.message.contenu, /Quiz & Évaluations/); assert.deepEqual(r.data.message.actions, []);
    assert.equal(r.data.credits.gratuits_restants, 19); conv = r.data.conversation_id; assert.ok(conv);
    const u = sql("select * from kofi_usage where categorie='createur_gratuit'"); assert.equal(u.length, 1);
    assert.equal(sql('select contexte from kofi_conversations where id=?', conv)[0].contexte, 'createur');
  });

  let actModule;
  await t.test('mission : PROPOSÉE seulement — rien n\'est créé avant « Appliquer » ; ajoutée une seule fois', async () => {
    const avant = sql('select count(*) n from formation_modules where formation_id=?', fid)[0].n;
    const r = await dire('MODULEFAUX crée un module', { conversation_id: conv });
    assert.equal(r.status, 200); assert.equal(r.data.conversation_id, conv);
    assert.equal(r.data.message.actions.length, 1); actModule = r.data.message.actions[0];
    assert.equal(actModule.statut, 'proposee'); assert.match(actModule.titre, /Module test/);
    assert.equal(sql('select count(*) n from formation_modules where formation_id=?', fid)[0].n, avant, 'aucune écriture avant le clic');
    const ap = await call(jarF, 'POST', `/api/kofi/createur/actions/${actModule.id}/appliquer`, {});
    assert.equal(ap.status, 200, JSON.stringify(ap.data)); assert.equal(ap.data.action.statut, 'appliquee'); assert.ok(ap.data.action.resultat.module_id);
    assert.equal(sql('select count(*) n from formation_modules where formation_id=?', fid)[0].n, avant + 1);
    const bis = await call(jarF, 'POST', `/api/kofi/createur/actions/${actModule.id}/appliquer`, {});
    assert.equal(bis.status, 409); assert.equal(sql('select count(*) n from formation_modules where formation_id=?', fid)[0].n, avant + 1, 'pas de doublon');
    assert.equal((await call(jarF, 'POST', `/api/kofi/createur/actions/${actModule.id}/annuler`, {})).status, 409);
  });

  await t.test('mission annulée : rien créé ; la mission d\'un autre compte reste introuvable', async () => {
    const r = await dire('MODULEFAUX encore', { conversation_id: conv });
    const id = r.data.message.actions[0].id; const avant = sql('select count(*) n from formation_modules where formation_id=?', fid)[0].n;
    assert.equal((await call(jarA, 'POST', `/api/kofi/createur/actions/${id}/appliquer`, {})).status, 404);
    assert.equal((await call(jarA, 'POST', `/api/kofi/createur/actions/${id}/annuler`, {})).status, 404);
    assert.equal((await call(jarF, 'POST', `/api/kofi/createur/actions/${id}/annuler`, {})).status, 200);
    assert.equal((await call(jarF, 'POST', `/api/kofi/createur/actions/${id}/appliquer`, {})).status, 409);
    assert.equal(sql('select count(*) n from formation_modules where formation_id=?', fid)[0].n, avant);
  });

  await t.test('identifiant inventé : la mission fautive est rejetée, la mission valide est conservée', async () => {
    const r = await dire('IDFAUX', { conversation_id: conv });
    assert.equal(r.data.message.actions.length, 1); assert.equal(r.data.message.missions_rejetees, 1);
    assert.match(r.data.message.actions[0].titre, /Chapitre réel/);
  });

  await t.test('leçon proposée : HTML nettoyé (script retiré), créée dans le bon chapitre', async () => {
    const r = await dire('LECONFAUSSE', { conversation_id: conv });
    const a = r.data.message.actions[0];
    const ap = await call(jarF, 'POST', `/api/kofi/createur/actions/${a.id}/appliquer`, {}); assert.equal(ap.status, 200, JSON.stringify(ap.data));
    const l = sql('select * from formation_lecons where id=?', ap.data.action.resultat.lecon_id)[0];
    assert.equal(l.chapitre_id, cid); assert.equal(l.type, 'texte'); assert.match(l.contenu_texte, /Un paragraphe/); assert.ok(!/script|alert/i.test(l.contenu_texte));
  });

  await t.test('infos générales : proposées, jamais écrites avant « Appliquer » ; champs inconnus ignorés ; HTML nettoyé ; remplace l\'ancien contenu (annoncé)', async () => {
    const avant = sql('select titre, niveau from formations where id=?', fid)[0];
    const r = await dire('INFOSFAUX', { conversation_id: conv });
    const a = r.data.message.actions[0]; assert.equal(a.type, 'renseigner_infos');
    assert.ok(a.resume.some(x => /^Titre : Formation sur la gestion financière.*remplace le contenu actuel/.test(x)), 'annonce que le titre actuel sera remplacé : ' + JSON.stringify(a.resume));
    assert.ok(a.resume.some(x => /^Niveau : Débutant/.test(x))); assert.ok(!a.resume.some(x => /inconnu/i.test(x)));
    assert.deepEqual(sql('select titre, niveau from formations where id=?', fid)[0], avant, 'rien d\'écrit avant le clic');
    const ap = await call(jarF, 'POST', `/api/kofi/createur/actions/${a.id}/appliquer`, {}); assert.equal(ap.status, 200, JSON.stringify(ap.data));
    const f = sql('select * from formations where id=?', fid)[0];
    assert.equal(f.titre, 'Formation sur la gestion financière'); assert.equal(f.niveau, 'Débutant'); assert.equal(f.duree_heures, 4); assert.equal(f.public_concerne, 'Les entrepreneurs');
    assert.match(f.description, /<strong>pratique<\/strong>/); assert.ok(!/script|alert/i.test(f.description));
    assert.equal((await call(jarF, 'POST', `/api/kofi/createur/actions/${a.id}/appliquer`, {})).status, 409);
  });

  await t.test('carte mentale : carte native + leçon Studio facultative dans le chapitre (image + lien), publiée car la formation est en brouillon', async () => {
    const r = await dire('CARTEFAUSSE pour le module 1', { conversation_id: conv });
    const a = r.data.message.actions[0]; assert.equal(a.type, 'creer_carte_mentale'); assert.ok(a.resume.some(x => /Idée A/.test(x)));
    assert.equal(sql('select count(*) n from cartes_mentales where formation_id=?', fid)[0].n, 0, 'rien avant le clic');
    const ap = await call(jarF, 'POST', `/api/kofi/createur/actions/${a.id}/appliquer`, {}); assert.equal(ap.status, 200, JSON.stringify(ap.data));
    const res = ap.data.action.resultat; assert.ok(res.carte_id); assert.equal(res.image, true); assert.equal(res.studio_publie, true);
    const carte = await call(jarF, 'GET', `/api/cartes-mentales/${res.carte_id}`);
    assert.equal(carte.status, 200); assert.equal(carte.data.edition, true); assert.equal(carte.data.carte.data.racine.texte, 'Module 1'); assert.equal(carte.data.carte.data.racine.enfants.length, 2);
    const l = sql('select * from formation_lecons where id=?', res.lecon_id)[0];
    assert.equal(l.chapitre_id, cid); assert.equal(l.studio, 1); assert.equal(l.obligatoire, 0, 'facultative : ne bloque pas le certificat');
    const d = sql('select * from formation_studio_docs where lecon_id=?', res.lecon_id)[0];
    const doc = JSON.parse(d.contenu_json); const els = doc.pages[0].elements;
    assert.ok(els.some(e => e.type === 'image' && /^https:\/\/diaspoactif-media\.b-cdn\.net\/documents\/test-/.test(e.props.url)), 'image de la carte');
    assert.ok(els.some(e => e.type === 'lien' && e.props.url.endsWith('/carte-mentale.html?id=' + res.carte_id)), 'lien vers la carte interactive');
    assert.equal(d.publiee_version, 1);
  });

  await t.test('texte collé : plan proposé, puis texte recopié MOT POUR MOT dans les leçons (module et chapitre créés)', async () => {
    const paras = ['Introduction au sujet', 'Premier paragraphe : on explique les bases de la méthode.', 'Deuxième paragraphe : « les exemples » & les chiffres (12 %).', '- une puce', '- une autre puce', 'Conclusion du chapitre.'];
    const r = await dire('PLANFAUX voici mon texte :\n' + paras.join('\n'), { conversation_id: conv });
    const a = r.data.message.actions[0]; assert.equal(a.type, 'importer_texte'); assert.ok(a.resume.some(x => /Première leçon/.test(x)));
    const ap = await call(jarF, 'POST', `/api/kofi/createur/actions/${a.id}/appliquer`, {}); assert.equal(ap.status, 200, JSON.stringify(ap.data));
    assert.equal(ap.data.action.resultat.lecons, 2);
    const lecons = sql('select l.titre, l.contenu_texte, l.obligatoire from formation_lecons l where l.module_id=? order by l.ordre', ap.data.action.resultat.module_id);
    assert.deepEqual(lecons.map(l => l.titre), ['Première leçon', 'Seconde leçon']);
    const reconstitue = lecons.map(l => Kofi.texteDeHtml(l.contenu_texte)).join('\n');
    const sansPuces = s => s.replace(/\s+/g, ' ').replace(/[-•]\s*/g, '').trim();
    ['Premier paragraphe : on explique les bases de la méthode.', 'Deuxième paragraphe : « les exemples » & les chiffres (12 %).', 'une puce', 'une autre puce', 'Conclusion du chapitre.'].forEach(p => assert.ok(sansPuces(reconstitue).includes(sansPuces(p)), 'conservé : ' + p));
    assert.ok(lecons.every(l => l.obligatoire === 1));
  });

  await t.test('texte trop long refusé ; message vide refusé', async () => {
    assert.equal((await dire('x'.repeat(30001))).status, 400);
    assert.equal((await dire('   ')).status, 400);
  });

  await t.test('pannes du fournisseur : le message gratuit n\'est PAS décompté', async () => {
    await new Promise(r => setTimeout(r, 61000)); /* limite de rythme : 12 messages par minute et par compte */
    const avant = (await etat()).data.credits.gratuits_restants;
    assert.equal((await dire('PANNEFAUSSE', { conversation_id: conv })).status, 503);
    assert.equal((await dire('LIMITEFAUSSE', { conversation_id: conv })).status, 429);
    assert.equal((await etat()).data.credits.gratuits_restants, avant);
    const r = await dire('REFUSFAUX', { conversation_id: conv }); assert.equal(r.status, 200); assert.match(r.data.message.contenu, /ne peux pas/);
  });

  await t.test('la conversation du formateur est visible dans l\'état, et INVISIBLE du tuteur des élèves', async () => {
    const e = await etat(); assert.equal(e.data.conversation.id, conv); assert.ok(e.data.conversation.messages.length >= 6);
    assert.ok(e.data.conversation.messages.some(m => m.actions.length));
    H.publier(env, fid);
    const t1 = await call(jarF, 'GET', `/api/kofi/conversations?formation_id=${fid}`);
    assert.equal(t1.status, 200); assert.equal(t1.data.conversations.length, 0, 'le tuteur ne liste pas les conversations de création');
    assert.equal((await call(jarF, 'GET', `/api/kofi/conversations/${conv}`)).status, 404);
    assert.equal((await call(jarF, 'POST', `/api/kofi/conversations/${conv}/messages`, { texte: 'test' })).status, 404);
  });

  await t.test('forfait : messages gratuits épuisés → 402 ; les questions d\'ÉLÈVE n\'y servent pas ; un lot « createur » oui', async () => {
    sql("INSERT OR REPLACE INTO kofi_reglages (cle, valeur) VALUES ('createur_gratuit_jour','0')");
    await new Promise(r => setTimeout(r, 11000)); /* le cache des réglages dure 10 s */
    let r = await dire('Bonjour', { conversation_id: conv });
    assert.equal(r.status, 402, JSON.stringify(r.data)); assert.equal(r.data.code, 'credits_epuises'); assert.equal(r.data.forfait.prix_eur, 5);
    assert.equal((await etat()).data.etat, 'recharge');
    const u = uid('Formateur');
    sql("INSERT INTO kofi_credits (user_id, origine, questions_total, questions_restantes, expire_le, reference, portee) VALUES (?, 'achat', 50, 50, datetime('now','+1 year'), 'test-eleve', 'eleve')", u);
    r = await dire('Bonjour', { conversation_id: conv }); assert.equal(r.status, 402, 'un lot d\'élève ne sert pas à l\'assistant');
    sql("INSERT INTO kofi_credits (user_id, origine, questions_total, questions_restantes, expire_le, reference, portee) VALUES (?, 'achat', 5, 5, datetime('now','+1 year'), 'test-createur', 'createur')", u);
    r = await dire('Bonjour', { conversation_id: conv }); assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(sql("select questions_restantes n from kofi_credits where reference='test-createur'")[0].n, 4, 'le message est pris sur le lot du formateur');
    assert.equal(sql("select questions_restantes n from kofi_credits where reference='test-eleve'")[0].n, 50, 'les questions d\'élève sont intactes');
    assert.equal(sql("select count(*) n from kofi_usage where categorie='createur_forfait'")[0].n, 1);
    const e = await etat(); assert.equal(e.data.credits.achetes_restants, 4);
  });

  let cmd, session;
  await t.test('achat du forfait : consentement exigé ; session Stripe 5 € ; rien crédité avant le webhook ; puis 1 000 messages « createur »', async () => {
    let r = await call(jarF, 'POST', '/api/kofi/createur/forfait/acheter', { formation_id: fid, accepte_non_remboursable: false });
    assert.equal(r.status, 409); assert.equal(r.data.code, 'consentement_requis'); assert.equal(r.data.montant, 5);
    assert.equal(sql('select count(*) n from kofi_commandes')[0].n, 0);
    r = await call(jarF, 'POST', '/api/kofi/createur/forfait/acheter', { formation_id: fid, accepte_non_remboursable: true });
    assert.equal(r.status, 201, JSON.stringify(r.data)); cmd = r.data.commande_id;
    const c = sql('select * from kofi_commandes where id=?', cmd)[0]; assert.equal(c.portee, 'createur'); assert.equal(c.questions, 1000); assert.equal(c.montant, 5);
    session = sessionsStripe().find(s => s.metadata && s.metadata.diaspoactif_kofi_commande_id === String(cmd));
    assert.ok(session); assert.equal(session.montant, 500); assert.ok(session.success_url.includes('kofi_createur=succes'));
    const u = uid('Formateur');
    const avantC = sql("select COALESCE(SUM(questions_restantes),0) n from kofi_credits where user_id=? and portee='createur'", u)[0].n;
    assert.equal(await webhook('checkout.session.completed', { id: session.id, amount_total: 500, metadata: { diaspoactif_kofi_commande_id: String(cmd) } }), 200);
    assert.equal(sql("select COALESCE(SUM(questions_restantes),0) n from kofi_credits where user_id=? and portee='createur'", u)[0].n, avantC + 1000);
    assert.equal(sql("select COALESCE(SUM(questions_restantes),0) n from kofi_credits where user_id=? and portee='eleve'", u)[0].n, 50, 'le compteur des élèves n\'a pas bougé');
    assert.equal(await webhook('checkout.session.completed', { id: session.id, amount_total: 500, metadata: { diaspoactif_kofi_commande_id: String(cmd) } }), 200);
    assert.equal(sql("select COALESCE(SUM(questions_restantes),0) n from kofi_credits where user_id=? and portee='createur'", u)[0].n, avantC + 1000, 'rejouer ne crédite pas deux fois');
  });

  await t.test('dossiers : créer, ranger plusieurs discussions étanches, renommer, déplacer ; un autre compte n\'y touche pas', async () => {
    let r = await call(jarF, 'POST', '/api/kofi/createur/dossiers', { formation_id: fid, nom: '   ' }); assert.equal(r.status, 400);
    r = await call(jarF, 'POST', '/api/kofi/createur/dossiers', { formation_id: fid, nom: 'Module 3' }); assert.equal(r.status, 201, JSON.stringify(r.data));
    const d1 = r.data.id;
    assert.equal((await call(jarA, 'POST', '/api/kofi/createur/dossiers', { formation_id: fid, nom: 'Intrus' })).status, 403, 'pas le formateur de cette formation');
    assert.equal((await call(jarA, 'PATCH', `/api/kofi/createur/dossiers/${d1}`, { nom: 'Piraté' })).status, 404);
    assert.equal((await call(jarA, 'DELETE', `/api/kofi/createur/dossiers/${d1}`)).status, 404);
    /* deux discussions DANS le dossier : chacune a son propre fil, sans mélange */
    const m1 = await dire('Première discussion du dossier', { dossier_id: d1 }); assert.equal(m1.status, 200, JSON.stringify(m1.data));
    const m2 = await dire('MODULEFAUX seconde discussion du dossier', { dossier_id: d1 }); assert.equal(m2.status, 200);
    const c1 = m1.data.conversation_id, c2 = m2.data.conversation_id; assert.notEqual(c1, c2);
    const conv = id => sql('select * from kofi_conversations where id=?', id)[0];
    assert.equal(conv(c1).dossier_id, d1); assert.equal(conv(c2).dossier_id, d1);
    assert.equal(conv(c1).titre, 'Première discussion du dossier', 'le premier message donne son titre à la discussion');
    assert.equal(sql('select count(*) n from kofi_messages where conversation_id=?', c1)[0].n, 2); assert.equal(sql('select count(*) n from kofi_messages where conversation_id=?', c2)[0].n, 2);
    /* le suivi d'une discussion ne passe jamais par une autre */
    const g1 = await call(jarF, 'GET', `/api/kofi/createur/conversations/${c1}`); assert.equal(g1.status, 200);
    assert.ok(g1.data.messages.every(m => !/seconde discussion/.test(m.contenu)), 'aucun message de la discussion 2 dans la 1');
    assert.equal((await call(jarA, 'GET', `/api/kofi/createur/conversations/${c1}`)).status, 404);
    const e = (await etat()).data; assert.ok(e.dossiers.some(d => d.id === d1 && d.nom === 'Module 3')); assert.equal(e.discussions.filter(c => c.dossier_id === d1).length, 2);
    /* demander à continuer une discussion dans un dossier d'une autre formation / inexistant */
    assert.equal((await dire('x', { dossier_id: 999999 })).status, 404);
    /* renommer / déplacer */
    assert.equal((await call(jarF, 'PATCH', `/api/kofi/createur/dossiers/${d1}`, { nom: 'Module 3 — plan' })).status, 200);
    assert.equal((await call(jarF, 'PATCH', `/api/kofi/createur/conversations/${c1}`, { titre: 'Plan du chapitre 1' })).status, 200);
    assert.equal((await call(jarF, 'PATCH', `/api/kofi/createur/conversations/${c1}`, { dossier_id: null })).status, 200); assert.equal(conv(c1).dossier_id, null);
    assert.equal((await call(jarF, 'PATCH', `/api/kofi/createur/conversations/${c1}`, { dossier_id: 999999 })).status, 404);
    assert.equal((await call(jarA, 'PATCH', `/api/kofi/createur/conversations/${c1}`, { titre: 'x' })).status, 404);
    assert.equal((await call(jarF, 'PATCH', `/api/kofi/createur/conversations/${c1}`, { dossier_id: d1 })).status, 200);
    /* appliquer une mission de la discussion 2, puis supprimer le dossier : les discussions partent, ce qui a été créé reste */
    const act = m2.data.message.actions[0];
    const ap = await call(jarF, 'POST', `/api/kofi/createur/actions/${act.id}/appliquer`, {}); assert.equal(ap.status, 200);
    const moduleCree = ap.data.action.resultat.module_id;
    const sup = await call(jarF, 'DELETE', `/api/kofi/createur/dossiers/${d1}`); assert.equal(sup.status, 200); assert.equal(sup.data.discussions_supprimees, 2);
    assert.equal(sql('select count(*) n from kofi_conversations where id in (?,?)', c1, c2)[0].n, 0);
    assert.equal(sql('select count(*) n from kofi_messages where conversation_id in (?,?)', c1, c2)[0].n, 0);
    assert.equal(sql('select count(*) n from kofi_actions where conversation_id in (?,?)', c1, c2)[0].n, 0);
    assert.equal(sql('select count(*) n from formation_modules where id=?', moduleCree)[0].n, 1, 'le module créé par la mission reste dans la formation');
  });

  await t.test('suppression de la conversation : messages et missions effacés', async () => {
    assert.equal((await call(jarA, 'DELETE', `/api/kofi/createur/conversations/${conv}`)).status, 404);
    assert.equal((await call(jarF, 'DELETE', `/api/kofi/createur/conversations/${conv}`)).status, 200);
    assert.equal(sql('select count(*) n from kofi_messages where conversation_id=?', conv)[0].n, 0);
    assert.equal(sql('select count(*) n from kofi_actions where conversation_id=?', conv)[0].n, 0);
  });
});
