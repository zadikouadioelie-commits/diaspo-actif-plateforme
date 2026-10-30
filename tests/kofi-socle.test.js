/* ===========================================================
   tests/kofi-socle.test.js — KOFFI, tuteur IA des formations : le socle (2026-10-30)
   ===========================================================
   Fournisseur d'IA REMPLACÉ par le faux (KOFI_IA_FAUSSE=1) : aucun réseau, aucune clé, aucun coût. On vérifie les RÈGLES, côté serveur :
   - Premium uniquement ; les autres voient Koffi mais ne peuvent pas l'utiliser (402, aucune ligne créée) ;
   - le budget (réserve IA) conditionne l'ouverture ; les 5 questions gratuites ne sont accordées qu'une fois ;
   - la portée suit l'accès : module non acheté = porte fermée (aucun extrait lu, rien envoyé au modèle, aucune question décomptée) ;
   - pas d'extrait pertinent = réponse fixe sans IA ; références inventées retirées ; panne ou refus = question rendue ;
   - aperçu du formateur sans décompte ; coupure pendant une évaluation et par formation ; plafond de questions épuisées ;
   - conversations privées, purge à 60 jours.
   Lancer : node --test tests/kofi-socle.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');

let env;
const journalStripe = path.join(os.tmpdir(), 'faux-stripe-kofi-' + process.pid + '.log');
const journalIA = path.join(os.tmpdir(), 'faux-ia-kofi-' + process.pid + '.log');
test.before(async () => {
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(path.join(__dirname, '_faux-stripe-preload.js')).replace(/\\\\/g, '/');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_factice';
  process.env.CRON_SECRET = 'cron_test_factice';
  process.env.FAUX_STRIPE_LOG = journalStripe;
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';   /* sinon tous les comptes existants sont en découverte Premium jusqu'au 3 janvier 2027 */
  process.env.KOFI_FAUX_LOG = journalIA;
  env = await H.demarrer('kofi');
});
test.after(() => { if (env) env.stop(); for (const f of [journalStripe, journalIA]) { try { fs.unlinkSync(f); } catch (e) { /* absent */ } } });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
async function webhook(type, objet) {
  const res = await fetch(env.base + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 'x' }, body: JSON.stringify({ type, data: { object: objet } }) });
  return res.status;
}
const paye = (commandeId, montant) => webhook('checkout.session.completed', { id: 'cs_k', amount_total: Math.round(montant * 100), metadata: { diaspoactif_formation_commande_id: String(commandeId) } });
const promptsEnvoyes = () => { try { return fs.readFileSync(journalIA, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };
const nbAppelsIA = () => promptsEnvoyes().length;

test('Koffi — règles du socle', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarE = H.cookieJar(), jarF = H.cookieJar(), jarA = H.cookieJar(), jarB = H.cookieJar(), jarC = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid, m1, m2, m3, l1, l2, l3, convA, convB;
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;

  const ajouterModule = async (titre, texte, extra) => {
    const m = await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre, ...extra });
    assert.equal(m.status, 201, JSON.stringify(m.data));
    const ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${m.data.id}/chapitres`, { titre: 'Chapitre ' + titre })).data.id;
    const l = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon ' + titre, type: 'texte', contenu_texte: '<p>' + texte + '</p>' })).data.id;
    return { m: m.data.id, l };
  };
  /* Tout nouveau compte reçoit 3 mois de découverte Premium : pour tester la différence, les comptes sont « vieillis » (découverte écoulée), puis seuls A, B et E reçoivent un abonnement payant. */
  const vieillir = userId => { sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", userId); sql('DELETE FROM user_accreditations WHERE user_id=?', userId); };
  const premium = (userId) => sql("INSERT INTO user_accreditations (user_id, accred_id, statut, date_expiration, type_tarif, montant_paye) VALUES (?, (SELECT id FROM accred_definitions WHERE type='utilisateur_abonne'), 'active', datetime('now','+30 day'), 'mensuel', 9)", userId);
  const ouvrir = async (jar, extra) => (await call(jar, 'POST', '/api/kofi/conversations', { formation_id: fid, ...extra }));
  const poser = (jar, conv, texte, extra) => call(jar, 'POST', `/api/kofi/conversations/${conv}/messages`, { texte, ...extra });
  const etat = (jar) => call(jar, 'GET', `/api/kofi/etat?formation_id=${fid}`);
  const credits = id => sql('select COALESCE(SUM(questions_restantes),0) n from kofi_credits where user_id=?', id)[0].n;

  await t.test('setup — formation payante, 3 modules au contenu distinct, A (module 1 seul), B (formation entière), C (non Premium)', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    for (const [j, n] of [[jarA, 'Alpha'], [jarB, 'Beta'], [jarC, 'Gamma'], [jarE, 'Epsilon']]) { await H.creerApprenant(env, j, rnd, n); vieillir(uid(n)); }
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Finances solidaires ' + rnd, description: 'x' })).data.id;
    sql("UPDATE formations SET mode_acces='payant', prix=30, gratuit=0 WHERE id=?", fid);
    ({ m: m1, l: l1 } = await ajouterModule('Tontines', 'La tontine solidaire fonctionne par cotisations mensuelles versées à tour de rôle entre les membres du groupe.', { vendable_seul: 1, prix: 10 }));
    ({ m: m2, l: l2 } = await ajouterModule('Microcrédit', 'Le microcrédit rural finance les coopératives agricoles avec des prêts remboursés après la récolte.', { vendable_seul: 1, prix: 12 }));
    ({ m: m3, l: l3 } = await ajouterModule('Incubation', 'Lincubateur numérique accompagne les startups pendant six mois avec un mentor dédié.', { vendable_seul: 1, prix: 8 }));
    H.publier(env, fid);
    /* A achète le module 1 seul ; B achète la formation entière ; C aussi (mais sans Premium). */
    let r = await call(jarA, 'POST', `/api/formations/${fid}/acquerir`, { module_id: m1 });
    assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(await paye(r.data.commande_id, 10), 200);
    r = await call(jarB, 'POST', `/api/formations/${fid}/acquerir`, {});
    assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(await paye(r.data.commande_id, 30), 200);
    r = await call(jarC, 'POST', `/api/formations/${fid}/acquerir`, {});
    assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(await paye(r.data.commande_id, 30), 200);
    premium(uid('Alpha')); premium(uid('Beta'));
    assert.equal(sql('select statut from formation_inscriptions where user_id=? and formation_id=?', uid('Alpha'), fid)[0].statut, 'active');
  });

  await t.test('visiteur anonyme : connexion requise ; apprenant sans inscription : refusé', async () => {
    assert.equal((await etat(anon)).status, 401);
    const r = await etat(jarE);
    assert.equal(r.status, 403, JSON.stringify(r.data));
  });

  await t.test('vitrine : un compte non Premium voit Koffi mais ne peut rien faire (402, aucune ligne créée, zéro appel IA)', async () => {
    const r = await etat(jarC);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.etat, 'vitrine'); assert.equal(r.data.nom, 'Koffi');
    assert.equal(r.data.forfait.questions, 1000); assert.equal(r.data.forfait.prix_eur, 2.5); assert.equal(r.data.retention_jours, 60);
    const o = await ouvrir(jarC);
    assert.equal(o.status, 402); assert.equal(o.data.code, 'premium_requis');
    assert.equal(sql('select count(*) n from kofi_conversations where user_id=?', uid('Gamma'))[0].n, 0);
    assert.equal(nbAppelsIA(), 0);
  });

  await t.test('sans réserve IA : Koffi indisponible, même pour un compte Premium ; l\'administration recharge la réserve', async () => {
    let r = await etat(jarA);
    assert.equal(r.data.etat, 'indisponible', JSON.stringify(r.data));
    /* Seule l'administration peut ouvrir ou lire le budget. */
    assert.equal((await call(jarA, 'GET', '/api/admin/kofi/budget')).status, 403);
    assert.equal((await call(jarA, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 403);
    assert.equal((await call(jarF, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 0 })).status, 400);
    r = await call(jarF, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10, reference: 'Facture Anthropic test' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(r.data.reserve_eur, 10);
    assert.equal((await etat(jarA)).data.etat, 'utilisable');
  });

  await t.test('A ouvre une conversation et pose une question sur SON module : réponse citée, une question gratuite décomptée', async () => {
    const o = await ouvrir(jarA); assert.equal(o.status, 201, JSON.stringify(o.data)); convA = o.data.id;
    const r = await poser(jarA, convA, 'Comment fonctionne la tontine solidaire ?');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.message.contenu, /tontine/i);
    assert.match(r.data.message.contenu, /\[1\]/, 'la citation est numérotée pour l\'élève');
    assert.equal(r.data.message.citations.length, 1);
    assert.equal(r.data.message.citations[0].lecon_id, l1);
    assert.match(r.data.message.citations[0].chemin, /Tontines/);
    assert.equal(r.data.message.flags.length, 0);
    assert.equal(r.data.credits.restants, 4, '5 gratuites − 1');
    assert.equal(sql("select count(*) n from kofi_credits where user_id=? and origine='gratuit'", uid('Alpha'))[0].n, 1);
    const u = sql('select * from kofi_usage where user_id=?', uid('Alpha'));
    assert.equal(u.length, 1); assert.equal(u[0].categorie, 'gratuit'); assert.ok(u[0].cout_eur > 0);
  });

  await t.test('PORTE FERMÉE : A (module 1 seul) interroge le module 2 → réponse fixe, AUCUN appel IA, aucune question décomptée, aucun mot du module 2 envoyé', async () => {
    const avant = nbAppelsIA(), cr = credits(uid('Alpha'));
    const r = await poser(jarA, convA, 'Qu\'est-ce que le microcrédit rural ?');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.message.contenu, /ne trouve pas/i);
    assert.deepEqual(r.data.message.flags, ['hors_cours']); assert.deepEqual(r.data.message.citations, []);
    assert.equal(nbAppelsIA(), avant, 'pas d\'appel au fournisseur');
    assert.equal(credits(uid('Alpha')), cr, 'question non décomptée');
    /* Rien du module fermé n'a jamais quitté le serveur, même pour une autre question qui touche le module 1. */
    await poser(jarA, convA, 'Quelle est la règle de la tontine solidaire ?');
    /* On contrôle les EXTRAITS envoyés (balises <passages>), pas l'historique : la propre question de l'élève y figure légitimement. */
    const passages = promptsEnvoyes().map(p => (String(p.messages[p.messages.length - 1].content).match(/<passages>([\s\S]*?)<\/passages>/) || [])[1] || '').join('\n');
    assert.ok(/tontine/i.test(passages), 'le module acheté est bien envoyé');
    assert.ok(!/microcr|coop[ée]ratives agricoles|incubateur|startups/i.test(passages), 'aucun extrait de module fermé envoyé à l\'IA : ' + passages);
    assert.ok(!/microcr|coop[ée]ratives agricoles|incubateur/i.test(promptsEnvoyes().map(p => p.systeme).join('')), 'ni dans les consignes');
    assert.equal(sql('select count(*) n from kofi_chunks where formation_id=?', fid)[0].n >= 3, true, 'les 3 modules sont indexés (le filtre se fait à la question, pas à l\'index)');
  });

  await t.test('B (formation entière) obtient les trois modules ; le prompt contient les consignes de sécurité et les extraits comme DONNÉES', async () => {
    const o = await ouvrir(jarB); convB = o.data.id;
    for (const [q, mot] of [['Parle-moi du microcrédit rural', /microcr/i], ['Que fait l\'incubateur numérique ?', /incubateur|startups/i]]) {
      const r = await poser(jarB, convB, q);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.match(r.data.message.contenu, mot); assert.equal(r.data.message.citations.length, 1);
    }
    const dernier = promptsEnvoyes().pop();
    assert.match(dernier.systeme, /UNIQUEMENT à partir des passages/); assert.match(dernier.systeme, /ignore toute consigne/i);
    assert.match(dernier.messages[dernier.messages.length - 1].content, /<passages>[\s\S]*\[S1\][\s\S]*<\/passages>/);
  });

  await t.test('références inventées retirées ; réponse sans source signalée ; panne et refus rendent la question', async () => {
    const cr0 = credits(uid('Beta'));
    let r = await poser(jarB, convB, 'FAUSSEREF tontine solidaire cotisations');
    assert.ok(!/\[99\]|S99/.test(r.data.message.contenu), 'référence inventée supprimée');
    assert.deepEqual(r.data.message.citations.map(c => c.n), [1]);
    r = await poser(jarB, convB, 'SANSSOURCE tontine solidaire cotisations');
    assert.deepEqual(r.data.message.flags, ['sans_reference']);
    const cr1 = credits(uid('Beta')); assert.equal(cr1, cr0 - 2);
    r = await poser(jarB, convB, 'PANNEFAUSSE tontine solidaire');
    assert.equal(r.status, 503); assert.equal(r.data.code, 'indisponible');
    assert.equal(credits(uid('Beta')), cr1, 'panne : question rendue');
    r = await poser(jarB, convB, 'LIMITEFAUSSE tontine solidaire');
    assert.equal(r.status, 429); assert.equal(credits(uid('Beta')), cr1);
    r = await poser(jarB, convB, 'REFUSFAUX tontine solidaire');
    assert.equal(r.status, 200); assert.deepEqual(r.data.message.flags, ['refus']);
    assert.equal(credits(uid('Beta')), cr1, 'refus : question rendue');
    assert.equal(sql("select count(*) n from kofi_usage where user_id=? and jetons_sortie=5", uid('Beta'))[0].n, 1, 'mais l\'appel refusé a coûté : il est enregistré');
  });

  await t.test('salutation : accueil fixe sans IA ni décompte ; message vide ou trop long refusés', async () => {
    const avant = nbAppelsIA(), cr = credits(uid('Beta'));
    const r = await poser(jarB, convB, 'Bonjour');
    assert.equal(r.status, 200); assert.deepEqual(r.data.message.flags, ['accueil']);
    assert.equal(nbAppelsIA(), avant); assert.equal(credits(uid('Beta')), cr);
    assert.equal((await poser(jarB, convB, '   ')).status, 400);
    assert.equal((await poser(jarB, convB, 'a'.repeat(1600))).status, 400);
  });

  await t.test('conversations privées : un autre compte ne peut ni les lire, ni les supprimer, ni noter leurs messages', async () => {
    assert.equal((await call(jarB, 'GET', `/api/kofi/conversations/${convA}`)).status, 404);
    assert.equal((await call(jarB, 'DELETE', `/api/kofi/conversations/${convA}`)).status, 404);
    assert.equal((await poser(jarB, convA, 'tontine solidaire')).status, 404);
    const idMsgA = sql("select id from kofi_messages where conversation_id=? and role='assistant' order by id limit 1", convA)[0].id;
    assert.equal((await call(jarB, 'POST', '/api/kofi/feedback', { message_id: idMsgA, note: 1 })).status, 404);
    assert.equal((await call(jarA, 'POST', '/api/kofi/feedback', { message_id: idMsgA, note: 1 })).status, 200);
    assert.equal((await call(jarA, 'POST', '/api/kofi/feedback', { message_id: idMsgA, note: -1, commentaire: 'faux' })).status, 200, 'un seul avis par message, modifiable');
    assert.equal(sql('select count(*) n from kofi_feedback where message_id=?', idMsgA)[0].n, 1);
    const lu = await call(jarA, 'GET', `/api/kofi/conversations/${convA}`);
    assert.equal(lu.status, 200); assert.ok(lu.data.messages.length >= 4);
  });

  await t.test('aperçu du formateur : répond sur toute la formation SANS décompter de question d\'élève', async () => {
    const e = await etat(jarF); assert.equal(e.data.apercu, true); assert.equal(e.data.etat, 'utilisable');
    const o = await ouvrir(jarF); assert.equal(o.status, 201);
    const r = await poser(jarF, o.data.id, 'Parle-moi du microcrédit rural');
    assert.equal(r.status, 200); assert.match(r.data.message.contenu, /microcr/i);
    assert.equal(sql("select count(*) n from kofi_credits where user_id=?", sql('select owner_user_id o from formations where id=?', fid)[0].o)[0].n, 0);
    assert.equal(sql("select categorie from kofi_usage order by id desc limit 1")[0].categorie, 'apercu');
  });

  await t.test('coupure pendant une évaluation (réglable) et coupure par le formateur', async () => {
    const insc = sql('select id from formation_inscriptions where user_id=? and formation_id=?', uid('Alpha'), fid)[0].id;
    const quiz = (await call(jarF, 'POST', `/api/formations/${fid}/quiz`, { titre: 'Examen', type: 'exercice', note_minimale: 50, lecon_id: l1 })).data.id;
    sql("INSERT INTO formation_quiz_sessions (inscription_id, quiz_id, debut) VALUES (?, ?, datetime('now'))", insc, quiz);
    let r = await etat(jarA); assert.equal(r.data.etat, 'evaluation');
    r = await poser(jarA, convA, 'tontine solidaire'); assert.equal(r.status, 409); assert.equal(r.data.code, 'evaluation');
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fid}/kofi-reglages`, { desactive_evaluation: false })).status, 200);
    assert.equal((await etat(jarA)).data.etat, 'utilisable', 'le formateur a autorisé Koffi pendant l\'évaluation');
    sql('DELETE FROM formation_quiz_sessions WHERE inscription_id=?', insc);
    assert.equal((await call(jarA, 'GET', `/api/formations/${fid}/kofi-reglages`)).status, 403, 'réglages réservés au formateur');
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fid}/kofi-reglages`, { actif: false })).status, 200);
    assert.equal((await etat(jarA)).data.etat, 'desactive');
    assert.equal((await poser(jarA, convA, 'tontine solidaire')).status, 403);
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fid}/kofi-reglages`, { actif: true })).status, 200);
  });

  await t.test('questions épuisées : le serveur refuse (402) et propose le forfait ; un forfait acheté est débité après les gratuites', async () => {
    const a = uid('Alpha');
    sql("UPDATE kofi_credits SET questions_restantes=0 WHERE user_id=? AND origine='gratuit'", a);
    let r = await etat(jarA); assert.equal(r.data.etat, 'recharge');
    r = await poser(jarA, convA, 'Quelle est la règle de la tontine solidaire ?');
    assert.equal(r.status, 402); assert.equal(r.data.code, 'credits_epuises'); assert.equal(r.data.forfait.questions, 1000);
    /* Le forfait (achat Stripe : branché plus tard) est ici simulé par une ligne : débit après les gratuites, valable 12 mois. */
    sql("INSERT INTO kofi_credits (user_id, origine, questions_total, questions_restantes, expire_le) VALUES (?, 'achat', 1000, 1000, datetime('now','+12 month'))", a);
    r = await poser(jarA, convA, 'Quelle est la règle de la tontine solidaire ?');
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.credits.restants, 999);
    assert.equal(sql("select categorie from kofi_usage where user_id=? order by id desc limit 1", a)[0].categorie, 'forfait');
    /* Un forfait expiré ne sert plus. */
    sql("UPDATE kofi_credits SET expire_le=datetime('now','-1 day') WHERE user_id=? AND origine='achat'", a);
    assert.equal((await poser(jarA, convA, 'Quelle est la règle de la tontine solidaire ?')).status, 402);
  });

  await t.test('Premium terminé : Koffi inutilisable, mais le stock de questions est conservé', async () => {
    const a = uid('Alpha');
    sql("UPDATE kofi_credits SET expire_le=datetime('now','+10 month') WHERE user_id=? AND origine='achat'", a);
    sql("UPDATE user_accreditations SET statut='expiree', date_expiration=datetime('now','-1 day') WHERE user_id=?", a);
    const r = await etat(jarA);
    assert.equal(r.data.etat, 'vitrine'); assert.equal(r.data.credits.restants, 999, 'le stock est intact');
    assert.equal((await poser(jarA, convA, 'tontine solidaire')).status, 402);
    assert.equal(credits(a), 999);
  });

  await t.test('budget : sous le seuil les essais gratuits s\'arrêtent ; réserve épuisée, tout s\'arrête ; le registre détaille les coûts', async () => {
    let r = await call(jarE, 'POST', `/api/formations/${fid}/acquerir`, {}); assert.equal(await paye(r.data.commande_id, 30), 200);
    premium(uid('Epsilon'));
    const b = await call(jarF, 'GET', '/api/admin/kofi/budget');
    assert.equal(b.status, 200); assert.ok(b.data.reserve_eur < 10 && b.data.reserve_eur > 9.9, 'le coût réel (≈ centimes) est déduit : ' + b.data.reserve_eur);
    assert.ok(b.data.par_categorie.find(c => c.categorie === 'gratuit') && b.data.par_categorie.find(c => c.categorie === 'apercu'));
    /* Réserve ramenée sous le seuil de 2 € : pas de NOUVEL essai gratuit. */
    await call(jarF, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: -8.5, type: 'ajustement', note: 'test' });
    const o = await ouvrir(jarE); assert.equal(o.status, 201);
    r = await poser(jarE, o.data.id, 'tontine solidaire cotisations');
    assert.equal(r.status, 402, JSON.stringify(r.data)); assert.equal(r.data.code, 'credits_epuises');
    assert.equal(sql("select count(*) n from kofi_credits where user_id=?", uid('Epsilon'))[0].n, 0, 'aucun essai gratuit accordé');
    assert.equal((await etat(jarE)).data.etat, 'recharge');
    /* Épuisée : tout s'arrête. */
    await call(jarF, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: -5, type: 'ajustement' });
    assert.equal((await etat(jarB)).data.etat, 'indisponible');
    assert.equal((await poser(jarB, convB, 'tontine solidaire')).status, 503);
    /* Les réglages se modifient (borné) ; un modèle hors liste est refusé. */
    assert.equal((await call(jarF, 'PUT', '/api/admin/kofi/reglages', { modele: 'gpt-4' })).status, 400);
    assert.equal((await call(jarF, 'PUT', '/api/admin/kofi/reglages', { modele: 'claude-haiku-5-5', gratuit_questions: 5 })).status, 200);
    assert.equal((await call(jarB, 'PUT', '/api/admin/kofi/reglages', { gratuit_questions: 500 })).status, 403);
    /* Bornes : conservation plafonnée à la durée annoncée aux élèves (60 j), prix ≥ minimum Stripe, rien de négatif ni de non numérique. */
    for (const [cle, val] of [['retention_jours', 61], ['retention_jours', 0], ['forfait_prix_eur', 0.1], ['forfait_questions', 0], ['gratuit_questions', -1], ['taux_usd_eur', 50], ['nb_extraits', 'beaucoup'], ['inconnu', 1]]) {
      const x = await call(jarF, 'PUT', '/api/admin/kofi/reglages', { [cle]: val });
      assert.equal(x.status, 400, `${cle}=${val} doit être refusé : ${JSON.stringify(x.data)}`);
    }
    const bon = await call(jarF, 'PUT', '/api/admin/kofi/reglages', { retention_jours: 30, forfait_prix_eur: 0.5 });
    assert.equal(bon.status, 200); assert.equal(bon.data.reglages.retention_jours, 30); assert.equal(bon.data.reglages.forfait_prix_eur, 0.5);
    assert.equal((await call(jarF, 'PUT', '/api/admin/kofi/reglages', { retention_jours: 60, forfait_prix_eur: 2.5 })).status, 200);
    /* Ce que la page « Budget IA » affiche : défauts, bornes, état du fournisseur, forfaits vendus. */
    const g = await call(jarF, 'GET', '/api/admin/kofi/reglages');
    assert.equal(g.data.defauts.forfait_questions, 1000); assert.deepEqual(g.data.bornes.retention_jours, [1, 60]); assert.equal(typeof g.data.fournisseur_configure, 'boolean');
    const bb = await call(jarF, 'GET', '/api/admin/kofi/budget');
    assert.equal(typeof bb.data.fournisseur_configure, 'boolean'); assert.ok(bb.data.forfaits_vendus && bb.data.forfaits_vendus.commandes === 0 && bb.data.forfaits_vendus.encaisse_eur === 0);
  });

  await t.test('conservation 60 jours : un message ancien disparaît de l\'écran, la purge (cron protégé) le supprime sans toucher aux récents', async () => {
    await call(jarF, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 20 });
    const sans = await fetch(env.base + '/api/cron/kofi-purge');
    assert.equal(sans.status, 401);
    const faux = await fetch(env.base + '/api/cron/kofi-purge', { headers: { Authorization: 'Bearer mauvais' } });
    assert.equal(faux.status, 401);
    const vieux = sql("select id from kofi_messages where conversation_id=? order by id limit 2", convB).map(x => x.id);
    sql(`UPDATE kofi_messages SET created_at=datetime('now','-61 day') WHERE id IN (${vieux.join(',')})`);
    const restant = sql('select count(*) n from kofi_messages where conversation_id=?', convB)[0].n - 2;
    const lu = await call(jarB, 'GET', `/api/kofi/conversations/${convB}`);
    assert.equal(lu.data.messages.length, restant, 'masqué dès le 61e jour, avant même la purge');
    const ok = await fetch(env.base + '/api/cron/kofi-purge', { headers: { Authorization: 'Bearer cron_test_factice' } });
    assert.equal(ok.status, 200); const j = await ok.json();
    assert.ok(j.messages >= 2, JSON.stringify(j));
    assert.equal(sql('select count(*) n from kofi_messages where conversation_id=?', convB)[0].n, restant);
  });

  await t.test('indexation : états par leçon pour le formateur (leçon vide = non exploitable), réindexation réservée au formateur', async () => {
    const vide = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${sql('select chapitre_id c from formation_lecons where id=?', l1)[0].c}/lecons`, { titre: 'Vidéo sans texte', type: 'video', contenu_url: 'https://example.com/v.mp4' })).data.id;
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/kofi/reindexer`)).status, 403);
    const r = await call(jarF, 'POST', `/api/formations/${fid}/kofi/reindexer`);
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.ok(r.data.non_exploitables >= 1);
    const idx = await call(jarF, 'GET', `/api/formations/${fid}/kofi/index`);
    const ligne = idx.data.lecons.find(x => x.id === vide);
    assert.equal(ligne.statut, 'non_exploitable'); assert.equal(ligne.raison, 'video_sans_transcription'); assert.equal(ligne.extraits, 0);
    assert.ok(idx.data.lecons.find(x => x.id === l1).extraits >= 1);
  });
});
