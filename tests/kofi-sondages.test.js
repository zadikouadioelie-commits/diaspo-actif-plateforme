/* ===========================================================
   tests/kofi-sondages.test.js — KOFFI DES SONDAGES : PDF / PHOTO → SONDAGE (2026-11-10)
   ===========================================================
   Règles vérifiées : le fichier joint arrive à l'IA comme un vrai bloc « document » (les octets sont lus), jamais renvoyé aux messages suivants ; formats reconnus par le contenu
   (pas par le nom) ; limites (nombre, poids, protégé) ; titre, description, questions et TYPES de réponses (oui/non, choix multiple + choix) déduits du document ; Koffi demande
   la couverture puis la reçoit (rattachée par le serveur) ; il propose les lieux d'affichage ; lien à un événement DU COMPTE seulement ; rien n'est créé avant l'accord ;
   création par les mêmes contrôles que le formulaire ; UN SONDAGE = UN CRÉDIT (pas un par message) ; échec = aucun crédit ; phrase officielle + remontée quand Koffi n'a pas l'information.
   Lancer : node --test tests/kofi-sondages.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const S = require('../server/kofi-sondages');
const Fichiers = require('../server/kofi-fichiers');

let env;
const journalIA = path.join(os.tmpdir(), 'faux-ia-sondages-' + process.pid + '.log');
test.before(async () => {
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.KOFI_FAUX_LOG = journalIA;
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofi-sondages');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalIA); } catch (e) { /* absent */ } });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

/* Un « PDF » minimal : l'en-tête + des lignes lisibles que la fausse IA relit dans les octets reçus. */
const pdf = (lignes, extra) => 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n' + lignes.join('\n') + '\n' + (extra || '') + '\n%%EOF', 'latin1').toString('base64');
const DOC = ['TITRE: Consultation sur la vie associative', 'DESC: Votre avis sur les services de la diaspora.', 'Q: Êtes-vous membre d\'une association ? | oui_non', 'Q: Quels services souhaitez-vous ? | choix_multiple | Santé;Éducation;Emploi', 'Q: Notez notre accueil | echelle_5', 'Q: Un commentaire ? | texte_long'];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('Koffi sondages — fichiers et brouillon (fonctions pures)', () => {
  /* Types reconnus par le CONTENU, pas par le nom ni le type annoncé. */
  const ok = Fichiers.analyser([{ nom: 'faux.txt', data: pdf(['x']) }, { nom: 'photo.pdf', data: PNG }]);
  assert.equal(ok.ok, true); assert.deepEqual(ok.liste.map(x => x.type), ['pdf', 'png']);
  assert.deepEqual(ok.blocs.map(b => b.type), ['document', 'image']);
  assert.equal(ok.blocs[0].source.media_type, 'application/pdf'); assert.equal(ok.blocs[1].source.media_type, 'image/png');
  const mauvais = Fichiers.analyser([{ nom: 'a.pdf', data: 'data:application/pdf;base64,' + Buffer.from('<html>pas un pdf du tout</html>').toString('base64') }]);
  assert.equal(mauvais.ok, false); assert.equal(mauvais.code, 'format');
  assert.equal(Fichiers.analyser([1, 2, 3, 4].map(i => ({ nom: i + '.png', data: PNG }))).code, 'trop_de_fichiers');
  assert.equal(Fichiers.analyser([{ nom: 'gros.pdf', data: pdf([], 'x'.repeat(3.2e6)) }]).code, 'trop_gros');
  assert.equal(Fichiers.analyser([{ nom: 'secret.pdf', data: pdf(['/Encrypt 5 0 R']) }]).code, 'pdf_protege');
  assert.equal(Fichiers.analyser([{ nom: 'long.pdf', data: pdf(Array.from({ length: 25 }, () => '<< /Type /Page >>')) }]).code, 'trop_de_pages');
  assert.equal(Fichiers.analyser([]).blocs.length, 0);
  /* Brouillon : types, choix, lieux, événements du compte, durée. */
  const auj = '2026-11-10', cv = { permis: new Set([12]), auj };
  const v = S.validerBrouillon({
    titre: 'T', questions: [{ texte: 'A ?', type: 'choix_multiple', options: ['x', 'y', 'x'] }, { texte: 'B ?', type: 'inconnu' }, { texte: 'A ?', type: 'oui_non' }, { texte: '' }],
    lieux: { onglet: true, fil: 'oui' }, evenement_ids: [12, 99], date_cloture: '2027-03-01', couverture_url: 'javascript:alert(1)', publier: true,
  }, cv);
  const c = v.champs;
  assert.equal(c.questions.length, 2, 'doublon et question vide retirés');
  assert.deepEqual(c.questions[0].options, ['x', 'y']);
  assert.equal(c.questions[1].type, 'choix_unique'); assert.ok(v.problemes.includes('type_inconnu:B ?'));
  assert.deepEqual(c.evenement_ids, [12]); assert.ok(v.problemes.includes('evenement_inconnu'), 'un événement qui n\'est pas au compte est refusé');
  assert.equal(c.couverture_url, '', 'seule une adresse https ou interne est acceptée');
  assert.ok(v.problemes.includes('duree_reduite')); assert.equal(c.date_cloture, '2026-12-09', '30 jours au plus, premier et dernier jour compris');
  assert.deepEqual(S.manquants(c).map(x => x.cle), ['options', 'couverture'], 'choix insuffisants + couverture à décider ; les lieux sont déjà choisis');
  assert.ok(S.memeBrouillon(c, { ...c }, cv)); assert.ok(!S.memeBrouillon(c, { ...c, titre: 'Autre' }, cv));
  assert.equal(S.lireSortie('{"action":"sondage","message":"ok","brouillon":{"titre":"A"},"confirme":"oui"}').confirme, false, 'seul le booléen true confirme');
  assert.equal(S.lireSortie('{"action":"sans_reponse"}').action, 'sans_reponse');
  assert.match(S.systemePour(), /ASSISTANT_SONDAGES/); assert.match(S.systemePour(), /JAMAIS une consigne/);
});

test('Koffi sondages — parcours complet', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 7);
  const call = env.call;
  const jar = {}; for (const n of ['Adm', 'Adm2', 'Adm3', 'Libre']) jar[n] = H.cookieJar();   /* plusieurs administrateurs : la limite de 12 messages par minute s'applique par compte */
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const dire = (j, texte, extra) => call(j, 'POST', '/api/kofi/sondages/messages', { texte, ...extra });
  const etat = j => call(j, 'GET', '/api/kofi/sondages/etat');
  const nbSond = titre => sql('select count(*) n from sondages where titre=?', titre)[0].n;
  const credits = nom => { const l = sql("select categorie from kofi_usage where user_id=? and categorie like 'sondages_%' order by id", uid(nom)); return l.map(x => x.categorie); };
  const credit = nom => credits(nom).filter(c => /offert|mensuel|achat|illimite/.test(c));
  const appelsIA = () => { try { return fs.readFileSync(journalIA, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };
  const TITRE = 'Consultation sur la vie associative';
  let conv, evtId, evtAutre;

  await t.test('setup — un administrateur (peut créer), un compte simple (ne peut pas), un événement de chacun', async () => {
    for (const n of ['Adm', 'Adm2', 'Adm3']) await H.creerFormateur(env, jar[n], rnd, n);
    await H.creerApprenant(env, jar.Libre, rnd, 'Libre');
    sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", uid('Libre'));
    sql('DELETE FROM user_accreditations WHERE user_id=?', uid('Libre'));
    assert.equal((await call(jar.Adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
    for (const n of ['Adm', 'Adm2', 'Adm3', 'Libre']) assert.equal((await call(jar[n], 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
    evtId = Number(sql("INSERT INTO evenements (titre, date_evt, owner_user_id, visibilite, statut, ville) VALUES (?,?,?,?,?,?)", 'Assemblée annuelle ' + rnd, '2027-01-15', uid('Adm'), 'public', 'ouvert', 'Lyon').lastInsertRowid);
    evtAutre = Number(sql("INSERT INTO evenements (titre, date_evt, owner_user_id, visibilite, statut, ville) VALUES (?,?,?,?,?,?)", 'Événement d\'un autre ' + rnd, '2027-01-16', uid('Libre'), 'public', 'ouvert', 'Paris').lastInsertRowid);
  });

  await t.test('/etat : la création n\'est annoncée qu\'aux comptes autorisés ; le prix du sondage et les limites de fichiers sont annoncés', async () => {
    const a = await etat(jar.Adm); assert.equal(a.status, 200);
    assert.equal(a.data.creation.disponible, true); assert.equal((await etat(jar.Libre)).data.creation.disponible, false);
    assert.match(a.data.credit.action, /un crédit/i); assert.ok(a.data.credit.prix_eur > 0);
    assert.equal(a.data.fichiers.max, 3); assert.equal((await etat(H.cookieJar())).status, 401);
  });

  await t.test('compte sans droit : joindre un fichier ne déclenche AUCUN appel IA, rien n\'est créé, aucun crédit', async () => {
    const avant = appelsIA().length;
    const r = await dire(jar.Libre, 'Fais-en un sondage', { fichiers: [{ nom: 'q.pdf', data: pdf(['TITRE: ' + TITRE + ' sans droit']) }] });
    assert.equal(r.status, 200); assert.match(r.data.message.contenu, /Seuls les comptes/);
    assert.equal(appelsIA().length, avant); assert.equal(credits('Libre').length, 0);
  });

  await t.test('fichier illisible ou mal formé : refusé avant tout appel IA et tout crédit', async () => {
    const avant = appelsIA().length;
    let r = await dire(jar.Adm, 'Lis ça', { fichiers: [{ nom: 'a.pdf', data: 'data:application/pdf;base64,' + Buffer.from('<script>alert(1)</script> pas un pdf').toString('base64') }] });
    assert.equal(r.status, 400); assert.equal(r.data.code, 'format');
    r = await dire(jar.Adm, 'Lis ça', { fichiers: [1, 2, 3, 4].map(i => ({ nom: i + '.png', data: PNG })) });
    assert.equal(r.status, 400); assert.equal(r.data.code, 'trop_de_fichiers');
    assert.equal(appelsIA().length, avant); assert.equal(credits('Adm').length, 0);
  });

  await t.test('PDF → sondage : titre, description, questions ET types de réponses lus dans le document ; le fichier part à l\'IA ; UN crédit pris', async () => {
    const avant = appelsIA().length;
    const r = await dire(jar.Adm, 'Utilise ce document pour créer un sondage', { fichiers: [{ nom: 'consultation.pdf', data: pdf(DOC) }] });
    assert.equal(r.status, 200, JSON.stringify(r.data)); conv = r.data.conversation_id;
    const b = r.data.message.brouillon;
    assert.ok(b, 'un aperçu est montré'); assert.equal(b.titre, TITRE); assert.match(b.description, /services de la diaspora/);
    assert.equal(b.questions.length, 4);
    assert.match(b.questions[0], /oui \/ non/i);
    assert.match(b.questions[1], /choix multiple : Santé, Éducation, Emploi/i);
    assert.match(b.questions[2], /échelle de 1 à 5/i); assert.match(b.questions[3], /longue/i);
    assert.equal(b.pret, false); assert.ok(b.manquants.some(m => /couverture/.test(m))); assert.ok(b.manquants.some(m => /où afficher/.test(m)));
    assert.equal(nbSond(TITRE), 0, 'rien n\'est créé avant l\'accord');
    /* L'IA a reçu le fichier comme un vrai bloc « document », et le nom du fichier est gardé dans la conversation. */
    const appels = appelsIA().slice(avant); assert.equal(appels.length, 1);
    const dernier = appels[0].messages[appels[0].messages.length - 1];
    assert.ok(Array.isArray(dernier.content) && dernier.content.some(x => x.type === 'document' && x.source.media_type === 'application/pdf'));
    assert.match(sql('select contenu from kofi_messages where conversation_id=? and role=? order by id limit 1', conv, 'user')[0].contenu, /consultation\.pdf/);
    /* UN crédit pour tout le sondage : pris maintenant. */
    assert.equal(credit('Adm').length, 1);
  });

  await t.test('Koffi demande la couverture ; l\'image est reçue par le serveur (jamais envoyée à l\'IA) et rattachée au brouillon', async () => {
    const avant = appelsIA().length;
    const r = await dire(jar.Adm, 'Voici la couverture', { conversation_id: conv, fichiers: [{ nom: 'couv.png', data: PNG, role: 'couverture' }] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    /* Le texte ne contient aucun marqueur : la fausse IA répond « explication » ; l'image reste rattachée au brouillon précédent par le serveur. */
    const dernierMsg = appelsIA().slice(avant)[0].messages.slice(-1)[0];
    assert.equal(typeof dernierMsg.content, 'string', 'aucun bloc image envoyé à l\'IA pour une couverture');
    assert.match(dernierMsg.content, /<image_recue>oui<\/image_recue>/);
    const sansDoc = JSON.stringify(appelsIA().slice(avant)[0].messages);
    assert.ok(!/"type":"document"/.test(sansDoc), 'le PDF n\'est pas renvoyé aux messages suivants');
    const r2 = await dire(jar.Adm, 'Je ne veux aucun lieu pour le moment AUCUNLIEU', { conversation_id: conv });
    const b = r2.data.message.brouillon;
    assert.match(b.couverture_texte, /reçue/i); assert.match(b.couverture, /^https:\/\/cdn\.test\//);
    assert.deepEqual(b.manquants, [], 'couverture et lieux réglés : le sondage est prêt');
    assert.match(b.statut, /brouillon/i);
    assert.equal(credit('Adm').length, 1, 'toujours UN seul crédit pour ce sondage');
  });

  await t.test('lieux : l\'événement d\'un AUTRE compte est refusé ; l\'événement du compte est lié ; le modèle ne voit que les titres de SES événements', async () => {
    const avant = appelsIA().length;
    let r = await dire(jar.Adm, `LIEUX:onglet,fil EVT:${evtAutre}`, { conversation_id: conv });
    assert.equal(r.status, 200);
    assert.match(r.data.message.contenu, /pas retrouvé l'un des événements/i);
    assert.ok(!r.data.message.brouillon.lieux.some(l => /autre/i.test(l)));
    const prompt = JSON.stringify(appelsIA().slice(avant)[0].messages);
    assert.ok(prompt.includes('Assemblée annuelle ' + rnd), 'les événements du compte sont listés'); assert.ok(!prompt.includes('Événement d\'un autre'), 'jamais ceux des autres');
    r = await dire(jar.Adm, `LIEUX:onglet,fil EVT:${evtId} PUBLIER`, { conversation_id: conv });
    const b = r.data.message.brouillon;
    assert.deepEqual(b.lieux, ['Onglet Sondages', 'Fil d\'actualité', 'Événement : Assemblée annuelle ' + rnd]);
    assert.match(b.statut, /publié tout de suite/i); assert.equal(b.pret, true);
    assert.equal(nbSond(TITRE), 0);
  });

  await t.test('un « oui » du modèle sur un brouillon que la personne n\'a pas vu ne crée rien ; « oui » après l\'aperçu publie le sondage, avec questions, couverture, lieux, événement et annonce dans le fil', async () => {
    /* Le brouillon change (nouveau titre) ET le modèle demande de confirmer : refusé, l'aperçu doit être revu. */
    let r = await dire(jar.Adm, 'SONDAGEJSON:{"titre":"Autre titre"} OUISONDAGE', { conversation_id: conv });
    assert.equal(nbSond(TITRE), 0); assert.equal(nbSond('Autre titre'), 0);
    r = await dire(jar.Adm, 'SONDAGEJSON:{"titre":"' + TITRE + '"}', { conversation_id: conv });
    assert.equal(r.data.message.brouillon.titre, TITRE);
    r = await dire(jar.Adm, 'OUISONDAGE', { conversation_id: conv });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.message.cree, true); assert.match(r.data.message.contenu, /publié/i); assert.match(r.data.message.lien.url, /sondage\.html\?id=\d+/);
    const s = sql('select * from sondages where titre=?', TITRE); assert.equal(s.length, 1);
    assert.equal(s[0].statut, 'ouvert'); assert.equal(s[0].createur_id, uid('Adm')); assert.deepEqual(JSON.parse(s[0].photos_json).length, 1);
    const q = sql('select texte, type, options_json from sondage_questions where sondage_id=? order by ordre', s[0].id);
    assert.deepEqual(q.map(x => x.type), ['oui_non', 'choix_multiple', 'echelle_5', 'texte_long']);
    assert.deepEqual(JSON.parse(q[1].options_json), ['Santé', 'Éducation', 'Emploi']);
    assert.deepEqual(sql('select evenement_id from sondage_evenements where sondage_id=?', s[0].id).map(x => x.evenement_id), [evtId]);
    assert.deepEqual(JSON.parse(s[0].diffusion_json), { fil: true, profil: false, onglet: true, boutique: false });
    assert.equal(sql("select count(*) n from fil_posts where contenu like ?", '%' + TITRE + '%')[0].n, 1, 'annonce dans le fil');
    /* Tout le sondage, de la lecture du PDF à la publication, n'a coûté QU'UN crédit. */
    assert.equal(credit('Adm').length, 1, JSON.stringify(credits('Adm')));
    assert.ok(credits('Adm').filter(c => c === 'sondages_inclus').length >= 3, 'les autres échanges sont enregistrés (coût réel) mais compris');
  });

  await t.test('boutons : « Créer le sondage » crée une seule fois (double clic refusé), l\'aperçu périmé est refusé ; un nouveau sondage = un nouveau crédit', async () => {
    const T2 = 'Sondage bouton ' + rnd;
    let r = await dire(jar.Adm, `SONDAGEJSON:{"titre":"${T2}","questions":[{"texte":"Satisfait ?","type":"oui_non"}],"couverture_choix":"sans","lieux":{"onglet":true},"lieux_choisis":true,"publier":true}`, { conversation_id: conv });
    assert.equal(r.status, 200); const b = r.data.message.brouillon; assert.equal(b.pret, true); const msgId = r.data.message.id;
    assert.equal(credit('Adm').length, 2, 'le sondage précédent est terminé : celui-ci prend son propre crédit');
    const avant = credit('Adm').length;
    /* aperçu périmé : un message plus récent existe */
    const r1 = await dire(jar.Adm, 'SONDAGEJSON:{"description":"plus récent"}', { conversation_id: conv });
    assert.equal((await call(jar.Adm, 'POST', '/api/kofi/sondages/sondage/creer', { message_id: msgId })).status, 409);
    const [c1, c2] = await Promise.all([1, 2].map(() => call(jar.Adm, 'POST', '/api/kofi/sondages/sondage/creer', { message_id: r1.data.message.id })));
    assert.deepEqual([c1.status, c2.status].sort(), [201, 409], 'une seule création, même en double clic');
    assert.equal(nbSond(T2), 1);
    assert.equal(credit('Adm').length, avant, 'les boutons sont compris dans le crédit du sondage');
    const faux = await call(jar.Libre, 'POST', '/api/kofi/sondages/sondage/creer', { message_id: r1.data.message.id });
    assert.equal(faux.status, 404, 'la conversation d\'un autre compte reste inaccessible');
  });

  await t.test('pas de lieu choisi : le sondage est enregistré en BROUILLON (même règle que le formulaire)', async () => {
    const T3 = 'Sondage brouillon ' + rnd;
    let r = await dire(jar.Adm2, `SONDAGEJSON:{"titre":"${T3}","questions":[{"texte":"Q ?","type":"texte_libre"}],"couverture_choix":"sans","lieux_choisis":true,"publier":true}`);
    const conv3 = r.data.conversation_id;
    assert.equal(r.data.message.brouillon.pret, true); assert.match(r.data.message.brouillon.statut, /brouillon/i);
    r = await dire(jar.Adm2, 'OUISONDAGE', { conversation_id: conv3 });
    assert.equal(r.data.message.cree, true); assert.match(r.data.message.contenu, /brouillon/i);
    assert.equal(sql('select statut from sondages where titre=?', T3)[0].statut, 'brouillon');
  });

  await t.test('échec = aucun crédit : panne, refus et réponse illisible ne coûtent rien et n\'ouvrent pas le sondage', async () => {
    const avant = credit('Adm2').length;
    let r = await dire(jar.Adm2, 'Un nouveau sondage PANNEFAUSSE'); assert.equal(r.status, 503); assert.equal(r.data.code, 'indisponible');
    r = await dire(jar.Adm2, 'Un nouveau sondage REFUSFAUX'); assert.equal(r.status, 200);
    r = await dire(jar.Adm2, 'Un nouveau sondage JSONFAUX'); assert.equal(r.status, 200); assert.match(r.data.message.contenu, /pas bien compris/);
    assert.equal(credit('Adm2').length, avant);
  });

  await t.test('PHOTO de document (PNG) lue comme un bloc image ; le sondage abandonné ne rend pas le crédit mais le suivant ne le redemande pas tant que le même n\'est pas terminé', async () => {
    const avant = appelsIA().length;
    const r = await dire(jar.Adm3, 'Lis cette photo SONDAGEJSON:{"titre":"Depuis photo ' + rnd + '"}', { fichiers: [{ nom: 'photo.png', data: PNG }] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const dernier = appelsIA().slice(avant)[0].messages.slice(-1)[0];
    assert.ok(Array.isArray(dernier.content) && dernier.content.some(x => x.type === 'image' && x.source.media_type === 'image/png'));
    const c = r.data.conversation_id;
    const apres = credit('Adm3').length;
    await dire(jar.Adm3, 'ABANDON', { conversation_id: c });
    await dire(jar.Adm3, 'Encore une question sur les sondages', { conversation_id: c });
    assert.equal(credit('Adm3').length, apres + 1, 'après abandon, un nouveau sondage prend un nouveau crédit');
  });

  await t.test('« Que sais-tu faire ? » : réponse fixe, sans IA, sans crédit, qui annonce « un sondage = un crédit »', async () => {
    const avant = appelsIA().length, cr = credit('Adm3').length;
    const r = await dire(jar.Adm3, 'Que sais-tu faire ?');
    assert.equal(r.status, 200); assert.match(r.data.message.contenu, /PDF|photo/i); assert.match(r.data.message.contenu, /UN crédit/);
    assert.equal(appelsIA().length, avant); assert.equal(credit('Adm3').length, cr);
  });

  await t.test('sans information : phrase officielle mot pour mot + demande remontée (anonyme), sans crédit en plus d\'un échange réussi', async () => {
    const PHRASE = "Pour le moment, je ne peux pas répondre à votre demande. Cependant, je remonte l'information pour que nous puissions y travailler. Merci pour votre compréhension.";
    const r = await dire(jar.Adm3, 'Comment fonctionne le rôle des ambassadeurs de sondage ' + rnd + ' ? SANSREPONSEFAUX');
    assert.equal(r.status, 200); assert.equal(r.data.message.contenu, PHRASE);
    const l = sql("select * from faq_sans_reponse where source='koffi_sondages' and question like ?", '%ambassadeurs de sondage ' + rnd + '%');
    assert.equal(l.length, 1); assert.equal(l[0].user_id, null);
  });

  await t.test('compte sans Premium : un sondage entier = UNE question offerte (pas une par message) ; sondage commencé = terminé même à zéro ; épuisé = 402 avant tout appel IA', async () => {
    sql("UPDATE users SET role='initiative' WHERE id=?", uid('Libre'));   /* une Initiative peut créer un sondage, sans Premium */
    const offertes = () => { const l = sql("select questions_restantes q from kofi_credits where user_id=? and origine='gratuit'", uid('Libre')); return l.length ? Number(l[0].q) : null; };
    const base = Number(((await etat(jar.Libre)).data.portefeuille.offertes || {}).restantes);
    assert.ok(base >= 3, 'questions offertes disponibles : ' + base);
    let r = await dire(jar.Libre, 'SONDAGEJSON:{"titre":"Offert ' + rnd + '","questions":[{"texte":"Q ?","type":"oui_non"}]}');
    assert.equal(r.status, 200, JSON.stringify(r.data)); const c = r.data.conversation_id;
    assert.equal(offertes(), base - 1);
    for (const m of ['COUVERTURE SANSIMAGE', 'AUCUNLIEU', 'SONDAGEJSON:{"description":"d"}']) { r = await dire(jar.Libre, m, { conversation_id: c }); assert.equal(r.status, 200); }
    assert.equal(offertes(), base - 1, 'quatre échanges, une seule question offerte');
    assert.equal(credit('Libre').length, 1); assert.equal(credit('Libre')[0], 'sondages_offert');
    /* À zéro, le sondage déjà commencé peut se terminer ; un NOUVEAU sondage est refusé avant tout appel IA. */
    sql("UPDATE kofi_credits SET questions_restantes=0 WHERE user_id=?", uid('Libre'));
    r = await dire(jar.Libre, 'OUISONDAGE', { conversation_id: c });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.message.cree, true);
    const avant = appelsIA().length;
    r = await dire(jar.Libre, 'Je voudrais un autre sondage', { conversation_id: c });
    assert.equal(r.status, 402); assert.equal(r.data.code, 'credits_epuises'); assert.equal(appelsIA().length, avant);
  });

  await t.test('brouillon modifiable en entier : titre, questions (ajout, retrait, ordre, type, choix), obligatoire/facultatif ; refusé aux autres comptes et une fois publié', async () => {
    const cree = await call(jar.Adm, 'POST', '/api/sondages', { titre: 'À modifier', statut: 'brouillon', diffusion: {}, questions: [
      { texte: 'Q1', type: 'oui_non', obligatoire: true }, { texte: 'Q2', type: 'texte_libre', obligatoire: false }, { texte: 'Q3', type: 'choix_unique', options: ['a', 'b'] }] });
    assert.equal(cree.status, 201, JSON.stringify(cree.data)); const id = cree.data.id;
    const lire = () => sql('select texte, type, obligatoire, ordre, options_json from sondage_questions where sondage_id=? order by ordre', id);
    assert.deepEqual(lire().map(q => q.obligatoire), [1, 0, 1], 'une question facultative le reste (avant, le serveur forçait « obligatoire »)');
    assert.equal((await call(jar.Libre, 'PUT', `/api/sondages/${id}/contenu`, { titre: 'piraté' })).status, 403, 'un autre compte ne modifie pas le brouillon');
    const sans = await call(jar.Adm, 'PUT', `/api/sondages/${id}/contenu`, { questions: [{ texte: 'x', type: 'choix_unique', options: ['seul'] }] });
    assert.equal(sans.status, 400, 'une question à choix a besoin de 2 choix');
    const ok = await call(jar.Adm, 'PUT', `/api/sondages/${id}/contenu`, { titre: 'Titre changé', description: 'Nouvelle description', categorie: 'sante', questions: [
      { texte: 'Q3', type: 'choix_multiple', options: ['a', 'b', 'c'], obligatoire: false }, { texte: 'Q1', type: 'oui_non', obligatoire: true }, { texte: 'Q4', type: 'echelle_5', min_label: 'bas', max_label: 'haut' }] });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const l = lire();
    assert.deepEqual(l.map(q => q.texte), ['Q3', 'Q1', 'Q4'], 'Q2 retirée, Q4 ajoutée, ordre changé');
    assert.deepEqual(l.map(q => q.obligatoire), [0, 1, 1]); assert.equal(l[0].type, 'choix_multiple'); assert.deepEqual(JSON.parse(l[0].options_json), ['a', 'b', 'c']);
    assert.equal(sql('select titre from sondages where id=?', id)[0].titre, 'Titre changé');
    /* Publié : les questions sont figées. */
    const pub = await call(jar.Adm, 'PUT', `/api/sondages/${id}/diffusion`, { onglet: true });
    assert.equal(pub.status, 200, JSON.stringify(pub.data));
    assert.equal((await call(jar.Adm, 'POST', `/api/sondages/${id}/republier`, { duree_jours: 5 })).status, 200);
    const fige = await call(jar.Adm, 'PUT', `/api/sondages/${id}/contenu`, { titre: 'trop tard' });
    assert.equal(fige.status, 400); assert.equal(fige.data.code, 'pas_brouillon');
    assert.equal(sql('select titre from sondages where id=?', id)[0].titre, 'Titre changé');
  });

  await t.test('suppression d\'une conversation : privée, supprimable', async () => {
    assert.equal((await call(jar.Libre, 'DELETE', `/api/kofi/sondages/conversations/${conv}`)).status, 404);
    assert.equal((await call(jar.Adm, 'DELETE', `/api/kofi/sondages/conversations/${conv}`)).status, 200);
    assert.equal(sql('select count(*) n from kofi_messages where conversation_id=?', conv)[0].n, 0);
  });
});
