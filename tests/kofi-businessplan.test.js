/* ===========================================================
   tests/kofi-businessplan.test.js — KOFFI JOUE L'INVESTISSEUR / LE BANQUIER / LE CLIENT DANS LE BUSINESS PLAN (2026-11-01)
   ===========================================================
   Règles vérifiées : seul le PROPRIÉTAIRE du plan peut lancer l'exercice (404 sinon) ; consentement explicite par plan AVANT toute lecture (aucun appel IA sans lui) ;
   le résumé envoyé au prestataire ne contient ni e-mail, ni téléphone, ni lien, ni nom du porteur, ni le nom / l'e-mail du compte ; une question à la fois, réaction,
   conseil, bilan (rubriques validées côté serveur) ; bilan automatique après le nombre de questions prévu ; séance terminée = plus de réponse ; plan trop vide refusé sans
   décompte ; questions offertes (sans Premium) rendues en cas d'échec ; crédit débité au coût réel ; « Que sais-tu faire ? » toujours gratuit ; administrateur illimité.
   Lancer : node --test tests/kofi-businessplan.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const B = require('../server/kofi-businessplan');

let env;
const journalIA = path.join(os.tmpdir(), 'faux-ia-businessplan-' + process.pid + '.log');
test.before(async () => {
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.KOFI_FAUX_LOG = journalIA;
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofi-businessplan');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalIA); } catch (e) { /* absent */ } });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

const SECTIONS_RICHES = {
  infos_generales: { nom_projet: 'AgriPlus', secteur: 'Agriculture', stade: 'Lancement', ville: 'Abidjan', email: 'secret@exemple.com', telephone: '+225 07 08 09 10 11', site_web: 'https://agriplus.example', responsable: 'Amadou Secretnom', logo_url: '/uploads/logo.png' },
  resume_executif: { probleme: 'Les petits producteurs perdent 30 % de leur récolte faute de stockage.', solution: 'Des chambres froides solaires louées à la journée.', marche: 'Environ 2 millions de producteurs en Afrique de l\'Ouest.' },
  marche: { cible: 'Coopératives maraîchères', concurrents: [{ nom: 'FroidAfrik', commentaire: 'Cher et loin' }, { nom: 'Stock&Co' }] },
  plan_financier: { ca_1: '150 000 000 FCFA', seuil_rentabilite: 'Mois 14', note: 'Contact : 06 12 34 56 78 ou jean@exemple.org' },
  financement: { montant: '200 000 000 FCFA', utilisation: 'Achat de 20 chambres froides' },
  annexes: { piece: 'ne doit pas sortir' },
  test_bp: { notes: { a: 'ne doit pas sortir non plus' } },
};

test('Koffi business plan — résumé du plan, sortie du modèle (fonctions pures)', () => {
  const r = B.resumePlan({ sections_json: JSON.stringify(SECTIONS_RICHES) }, 9000);
  for (const interdit of ['secret@exemple.com', '+225 07', 'https://agriplus', 'Secretnom', 'logo.png', '06 12 34', 'jean@exemple', 'ne doit pas sortir']) assert.ok(!r.texte.includes(interdit), interdit + ' ne doit pas être transmis');
  for (const attendu of ['Abidjan', '30 % de leur récolte', 'chambres froides solaires', 'FroidAfrik', '150 000 000 FCFA', 'Mois 14', '200 000 000 FCFA']) assert.ok(r.texte.includes(attendu), attendu + ' doit être transmis');
  assert.match(r.texte, /## Résumé exécutif/); assert.match(r.texte, /## Plan financier/);
  assert.ok(r.rubriques.find(x => x.cle === 'resume_executif').rempli && !r.rubriques.find(x => x.cle === 'swot').rempli);
  assert.ok(r.remplies >= 4);
  assert.ok(B.resumePlan({ sections_json: JSON.stringify(SECTIONS_RICHES) }, 400).caracteres <= 400, 'plafond respecté');
  assert.equal(B.resumePlan({ sections_json: '{}' }, 9000).caracteres, 0); assert.equal(B.resumePlan({ sections_json: 'pas du json' }, 9000).caracteres, 0); assert.equal(B.resumePlan(null, 9000).caracteres, 0);
  assert.equal(B.estSocial({ type_initiative: 'association' }), true); assert.equal(B.estSocial({ type_initiative: 'startup' }), false);

  assert.equal(B.lireSortie('texte libre'), null);
  assert.equal(B.lireSortie('{"type":"autre","message":"x"}'), null);
  assert.equal(B.lireSortie('{"type":"question","message":""}'), null);
  const q = B.lireSortie('```json\n{"type":"question","reaction":"Bien","message":"Quel marché ?"}\n```');
  assert.deepEqual(q, { type: 'question', reaction: 'Bien', message: 'Quel marché ?' });
  const b = B.lireSortie(JSON.stringify({ type: 'bilan', message: 'ok', forces: ['a', '', 'b'], faiblesses: [{ texte: 'f1', rubrique: 'swot' }, { texte: 'f2', rubrique: 'inventee' }, 'f3', { texte: '' }], pistes: ['p'] }));
  assert.deepEqual(b.forces, ['a', 'b']); assert.deepEqual(b.faiblesses, [{ texte: 'f1', rubrique: 'swot' }, { texte: 'f2', rubrique: '' }, { texte: 'f3', rubrique: '' }]); assert.deepEqual(b.pistes, ['p']);
  assert.match(B.systemePour({ role: 'banquier', social: false, nom: 'X', plan: 'PLAN', nbQuestions: 8 }), /BANQUIER/);
  assert.match(B.systemePour({ role: 'client', social: true, nom: 'X', plan: 'PLAN', nbQuestions: 8 }), /BÉNÉFICIAIRE/);
});

test('Koffi business plan — parcours complet', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 7);
  const call = env.call;
  const NOMS = ['Prop', 'Libre', 'Long', 'Aux', 'Autre', 'Adm'];
  const jar = {}; for (const n of NOMS) jar[n] = H.cookieJar();
  const anon = H.cookieJar();
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const plan = {};
  const etat = (j, id) => call(j, 'GET', `/api/kofi/business-plan/${id}/etat`);
  const msg = (j, id, body) => call(j, 'POST', `/api/kofi/business-plan/${id}/messages`, body);
  const consentir = (j, id) => call(j, 'POST', `/api/kofi/business-plan/${id}/consentement`, { accepte: true });
  const solde = async (nom, id) => { const w = (await etat(jar[nom], id)).data.portefeuille; return Math.round((w.solde_eur + w.mensuel_restant_eur + w.achete_restant_eur) * 1e6) / 1e6 + ':' + (w.offertes ? w.offertes.restantes : '-'); };
  const usage = nom => sql('select categorie from kofi_usage where user_id=? order by id desc limit 1', uid(nom))[0];
  const nbIA = () => { try { return fs.readFileSync(journalIA, 'utf8').trim().split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  const dernierAppel = () => { const l = fs.readFileSync(journalIA, 'utf8').trim().split('\n').filter(Boolean); return JSON.parse(l[l.length - 1]); };
  const creerPlan = (nom, sections, extra) => sql('INSERT INTO business_plans (user_id, nom_projet, type_initiative, secteur, sections_json) VALUES (?,?,?,?,?)', uid(nom), (extra && extra.nom) || 'AgriPlus', (extra && extra.type) || 'startup', 'Agriculture', JSON.stringify(sections)).lastInsertRowid;

  await t.test('setup — comptes, plans, réserve IA', async () => {
    await H.creerFormateur(env, jar.Adm, rnd, 'Adm');
    for (const n of ['Prop', 'Libre', 'Long', 'Aux', 'Autre']) await H.creerApprenant(env, jar[n], rnd, n);
    for (const n of ['Prop', 'Libre', 'Long', 'Aux', 'Autre']) { sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", uid(n)); sql('DELETE FROM user_accreditations WHERE user_id=?', uid(n)); }
    assert.equal((await call(jar.Adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
    H.ordinariser(env, rnd, 'Prop'); H.ordinariser(env, rnd, 'Long'); H.ordinariser(env, rnd, 'Aux');
    for (const n of ['Prop', 'Libre', 'Long', 'Aux', 'Autre']) assert.equal((await call(jar[n], 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
    plan.prop = creerPlan('Prop', SECTIONS_RICHES); plan.vide = creerPlan('Prop', { infos_generales: { nom_projet: 'Vide' } }, { nom: 'Vide' });
    plan.libre = creerPlan('Libre', SECTIONS_RICHES, { type: 'association' }); plan.long = creerPlan('Long', SECTIONS_RICHES); plan.aux = creerPlan('Aux', SECTIONS_RICHES); plan.auxvide = creerPlan('Aux', { infos_generales: { nom_projet: 'Vide' } }, { nom: 'Vide' }); plan.adm = creerPlan('Adm', SECTIONS_RICHES);
    assert.equal((await call(jar.Adm, 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
  });

  await t.test('accès : visiteur 401 ; seul le propriétaire (404 pour les autres, même lecture de l\'état) ; plan inexistant 404', async () => {
    assert.equal((await etat(anon, plan.prop)).status, 401);
    assert.equal((await msg(anon, plan.prop, { action: 'commencer', role: 'investisseur' })).status, 401);
    assert.equal((await etat(jar.Autre, plan.prop)).status, 404);
    assert.equal((await msg(jar.Autre, plan.prop, { action: 'commencer', role: 'investisseur' })).status, 404);
    assert.equal((await consentir(jar.Autre, plan.prop)).status, 404);
    assert.equal((await etat(jar.Prop, 999999)).status, 404);
    assert.equal((await etat(jar.Prop, 'abc')).status, 404);
    const e = await etat(jar.Prop, plan.prop);
    assert.equal(e.status, 200); assert.equal(e.data.etat, 'utilisable', JSON.stringify(e.data));
    assert.deepEqual(e.data.roles.map(r => r.cle), ['investisseur', 'banquier', 'client']);
    assert.equal(e.data.consentement.accorde, false); assert.ok(e.data.consentement.texte.includes('Anthropic'));
    assert.equal(e.data.plan.assez_rempli, true); assert.equal(e.data.plan.social, false); assert.ok(e.data.plan.rubriques.length >= 15);
    assert.equal((await etat(jar.Libre, plan.libre)).data.plan.social, true);
    assert.equal(nbIA(), 0);
  });

  await t.test('consentement : indispensable AVANT toute lecture ; rôle obligatoire', async () => {
    let r = await msg(jar.Prop, plan.prop, { action: 'commencer', role: 'investisseur' });
    assert.equal(r.status, 403); assert.equal(r.data.code, 'consentement_requis'); assert.ok(r.data.consentement.texte);
    assert.equal(nbIA(), 0, 'aucun appel au fournisseur sans consentement');
    assert.equal((await call(jar.Prop, 'POST', `/api/kofi/business-plan/${plan.prop}/consentement`, { accepte: false })).status, 400);
    assert.equal((await call(jar.Prop, 'POST', `/api/kofi/business-plan/${plan.prop}/consentement`, {})).status, 400);
    assert.equal(sql('select count(*) n from kofi_bp_consentements where user_id=?', uid('Prop'))[0].n, 0);
    assert.equal((await consentir(jar.Prop, plan.prop)).status, 200);
    assert.equal(sql('select count(*) n from kofi_bp_consentements where user_id=? and bp_id=?', uid('Prop'), plan.prop)[0].n, 1);
    assert.equal((await consentir(jar.Prop, plan.prop)).status, 200); assert.equal(sql('select count(*) n from kofi_bp_consentements where user_id=? and bp_id=?', uid('Prop'), plan.prop)[0].n, 1, 'une seule ligne par plan');
    assert.equal((await etat(jar.Prop, plan.prop)).data.consentement.accorde, true);
    assert.equal((await etat(jar.Prop, plan.vide)).data.consentement.accorde, false, 'le consentement est propre à chaque plan');
    r = await msg(jar.Prop, plan.prop, { action: 'commencer' }); assert.equal(r.status, 400); assert.equal(r.data.code, 'role_requis');
    r = await msg(jar.Prop, plan.prop, { action: 'commencer', role: 'pirate' }); assert.equal(r.status, 400);
    assert.equal(nbIA(), 0);
  });

  let seance;
  await t.test('séance : première question, ce qui part chez le prestataire, réponse → réaction + question suivante, conseil, bilan', async () => {
    const avant = await solde('Prop', plan.prop);
    let r = await msg(jar.Prop, plan.prop, { action: 'commencer', role: 'investisseur' });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.message.type, 'question'); assert.equal(r.data.role, 'investisseur'); assert.equal(r.data.nb_questions, 1); assert.equal(r.data.terminee, false);
    assert.match(r.data.message.contenu, /Question 1/);
    seance = r.data.conversation_id; assert.ok(seance);
    const appel = dernierAppel(), tout = appel.systeme + JSON.stringify(appel.messages);
    assert.match(appel.systeme, /ASSISTANT_BUSINESSPLAN/); assert.match(appel.systeme, /<plan>/); assert.ok(appel.systeme.includes('chambres froides solaires') && appel.systeme.includes('AgriPlus'));
    for (const interdit of ['secret@exemple.com', '+225 07', 'agriplus.example', 'Secretnom', 'ne doit pas sortir', H.compte(rnd, 'Prop', 'utilisateur').email, 'Aminata']) assert.ok(!tout.includes(interdit), interdit + ' ne doit pas être transmis au prestataire');
    assert.notEqual(await solde('Prop', plan.prop), avant, 'crédit débité'); assert.equal(usage('Prop').categorie, 'businessplan_mensuel');

    r = await msg(jar.Prop, plan.prop, { action: 'repondre', conversation_id: seance, texte: 'Nous visons 2 millions de producteurs.' });
    assert.equal(r.status, 200); assert.equal(r.data.message.type, 'question'); assert.match(r.data.message.reaction, /Nous visons 2 millions/); assert.match(r.data.message.question, /Question 2/); assert.equal(r.data.nb_questions, 2);
    assert.equal(r.data.message.contenu, r.data.message.reaction + '\n\n' + r.data.message.question);
    assert.equal(dernierAppel().messages[0].content, '<action>commencer</action>', 'la séance reprend avec l\'ouverture');

    r = await msg(jar.Prop, plan.prop, { action: 'conseil', conversation_id: seance });
    assert.equal(r.status, 200); assert.equal(r.data.message.type, 'conseil'); assert.equal(r.data.nb_questions, 2, 'un conseil ne pose pas de nouvelle question');

    r = await msg(jar.Prop, plan.prop, { action: 'repondre', conversation_id: seance, texte: 'Notre prix est de 5 000 FCFA par jour.' });
    assert.equal(r.status, 200); assert.match(r.data.message.question, /Question 3/);

    r = await msg(jar.Prop, plan.prop, { action: 'bilan', conversation_id: seance });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.message.type, 'bilan'); assert.equal(r.data.terminee, true);
    assert.deepEqual(r.data.message.bilan.forces, ['Problème clair']);
    assert.deepEqual(r.data.message.bilan.faiblesses.map(f => f.rubrique), ['plan_financier', ''], 'rubrique inventée écartée');
    assert.equal(r.data.message.bilan.faiblesses[0].rubrique_label, 'Plan financier'); assert.deepEqual(r.data.message.bilan.pistes, ['Documenter les hypothèses de ventes']);
    assert.equal(sql('select statut from kofi_conversations where id=?', seance)[0].statut, 'terminee');
    r = await msg(jar.Prop, plan.prop, { action: 'repondre', conversation_id: seance, texte: 'encore' }); assert.equal(r.status, 409); assert.equal(r.data.code, 'seance_terminee');
    r = await msg(jar.Prop, plan.prop, { action: 'repondre', conversation_id: 999999, texte: 'x' }); assert.equal(r.status, 404);
    r = await msg(jar.Prop, plan.prop, { action: 'repondre', conversation_id: seance, texte: '   ' }); assert.equal(r.status, 400);
  });

  await t.test('autres rôles ; bilan impossible sans réponse ; conseil impossible sans question ; plan trop vide refusé sans décompte', async () => {
    await consentir(jar.Aux, plan.aux);
    let r = await msg(jar.Aux, plan.aux, { action: 'commencer', role: 'client' });
    assert.equal(r.status, 200); assert.ok(dernierAppel().systeme.includes('Tu joues un CLIENT')); const c = r.data.conversation_id;
    r = await msg(jar.Aux, plan.aux, { action: 'bilan', conversation_id: c }); assert.equal(r.status, 400); assert.equal(r.data.code, 'pas_de_reponse');
    assert.equal((await msg(jar.Aux, plan.aux, { action: 'repondre', conversation_id: c, texte: 'Notre offre est simple.' })).status, 200);
    r = await msg(jar.Aux, plan.aux, { action: 'commencer', role: 'banquier' }); assert.equal(r.status, 200); assert.ok(dernierAppel().systeme.includes('Tu joues un BANQUIER'));
    await consentir(jar.Aux, plan.auxvide);
    const ia = nbIA(), avant = await solde('Aux', plan.auxvide);
    r = await msg(jar.Aux, plan.auxvide, { action: 'commencer', role: 'investisseur' });
    assert.equal(r.status, 409); assert.equal(r.data.code, 'plan_vide'); assert.equal(nbIA(), ia); assert.equal(await solde('Aux', plan.auxvide), avant);
    assert.equal((await etat(jar.Aux, plan.auxvide)).data.plan.assez_rempli, false);
    assert.equal((await msg(jar.Aux, plan.aux, { action: 'repondre', conversation_id: c, texte: 'a'.repeat(1600) })).data.code, 'trop_long');
  });

  await t.test('bilan automatique après le nombre de questions prévu (8)', async () => {
    await consentir(jar.Long, plan.long);
    let r = await msg(jar.Long, plan.long, { action: 'commencer', role: 'investisseur' });
    assert.equal(r.status, 200); const c = r.data.conversation_id; let dernier = r;
    for (let i = 1; i <= 7; i++) { dernier = await msg(jar.Long, plan.long, { action: 'repondre', conversation_id: c, texte: 'Réponse ' + i }); assert.equal(dernier.status, 200, JSON.stringify(dernier.data)); assert.equal(dernier.data.message.type, 'question'); }
    assert.equal(dernier.data.nb_questions, 8);
    dernier = await msg(jar.Long, plan.long, { action: 'repondre', conversation_id: c, texte: 'Réponse 8' });
    assert.equal(dernier.status, 200); assert.equal(dernier.data.message.type, 'bilan', 'la 8e réponse déclenche le bilan'); assert.equal(dernier.data.terminee, true);
    assert.match(dernierAppel().messages.slice(-1)[0].content, /<action>bilan<\/action>/);
  });

  await t.test('compte SANS Premium : questions offertes décomptées, rendues en cas d\'échec ; échecs ne coûtent rien', async () => {
    await consentir(jar.Libre, plan.libre);
    const offertes = async () => (await etat(jar.Libre, plan.libre)).data.portefeuille.offertes.restantes;
    const avant = await offertes();
    let r = await msg(jar.Libre, plan.libre, { action: 'commencer', role: 'investisseur' });
    assert.equal(r.status, 200); const c = r.data.conversation_id; assert.equal(await offertes(), avant - 1); assert.equal(usage('Libre').categorie, 'businessplan_offert');
    assert.ok(dernierAppel().systeme.includes('structure à but non lucratif'), 'plan d\'association : vocabulaire adapté');
    const b = await offertes();
    r = await msg(jar.Libre, plan.libre, { action: 'repondre', conversation_id: c, texte: 'PANNEFAUSSE' }); assert.equal(r.status, 503); assert.equal(await offertes(), b);
    r = await msg(jar.Libre, plan.libre, { action: 'repondre', conversation_id: c, texte: 'LIMITEFAUSSE' }); assert.equal(r.status, 429); assert.equal(await offertes(), b);
    r = await msg(jar.Libre, plan.libre, { action: 'repondre', conversation_id: c, texte: 'REFUSFAUX' }); assert.equal(r.status, 200); assert.equal(r.data.message.type, null); assert.match(r.data.message.contenu, /ne peux pas poursuivre/); assert.equal(await offertes(), b); assert.equal(usage('Libre').categorie, 'businessplan_refus');
    r = await msg(jar.Libre, plan.libre, { action: 'repondre', conversation_id: c, texte: 'JSONFAUX' }); assert.equal(r.status, 200); assert.match(r.data.message.contenu, /pas réussi/); assert.equal(await offertes(), b); assert.equal(usage('Libre').categorie, 'businessplan_illisible');
    /* panne dès l'ouverture (le texte libre accompagne la demande) : aucune séance créée, aucune question perdue */
    const nbConv = () => sql('select count(*) n from kofi_conversations where user_id=?', uid('Libre'))[0].n, n0 = nbConv();
    r = await msg(jar.Libre, plan.libre, { action: 'commencer', role: 'banquier', texte: 'PANNEFAUSSE' }); assert.equal(r.status, 503); assert.equal(await offertes(), b); assert.equal(nbConv(), n0);
    r = await msg(jar.Libre, plan.libre, { action: 'commencer', role: 'banquier', texte: 'JSONFAUX' }); assert.equal(r.status, 200); assert.equal(r.data.conversation_id, null, 'réponse illisible à l\'ouverture : pas de séance'); assert.equal(await offertes(), b); assert.equal(nbConv(), n0);
    r = await msg(jar.Libre, plan.libre, { action: 'commencer', role: 'banquier', texte: 'REFUSFAUX' }); assert.equal(r.status, 200); assert.equal(r.data.conversation_id, null); assert.equal(await offertes(), b);
  });

  await t.test('« Que sais-tu faire ? » : réponse fixe sans IA, sans consentement, toujours gratuite', async () => {
    const ia = nbIA();
    const r = await msg(jar.Aux, plan.aux, { action: 'repondre', texte: 'Que sais-tu faire ?' });
    assert.equal(r.status, 200); assert.equal(r.data.message.gratuit, true); assert.match(r.data.message.contenu, /investisseur/); assert.equal(nbIA(), ia, 'aucun appel au fournisseur');
    /* même pour un plan sans consentement */
    const r2 = await msg(jar.Libre, plan.libre, { action: 'repondre', texte: 'Que sais-tu faire ?' }); assert.equal(r2.status, 200); assert.equal(nbIA(), ia);
    const sans = await msg(jar.Long, plan.long, { action: 'repondre', texte: 'Que sais-tu faire ?' }); assert.equal(sans.status, 200);
  });

  await t.test('séances : reprise par /etat, suppression par le propriétaire seulement', async () => {
    const e = await etat(jar.Prop, plan.prop); assert.ok(e.data.seance && e.data.seance.messages.length >= 1);
    const idc = e.data.seance.id; assert.ok(['investisseur', 'banquier', 'client'].includes(e.data.seance.role));
    assert.equal((await call(jar.Autre, 'DELETE', `/api/kofi/business-plan/conversations/${idc}`)).status, 404);
    assert.equal((await call(jar.Prop, 'DELETE', `/api/kofi/business-plan/conversations/${idc}`)).status, 200);
    assert.equal(sql('select count(*) n from kofi_messages where conversation_id=?', idc)[0].n, 0);
  });

  await t.test('administrateur : illimité — aucun solde, rien décompté', async () => {
    await consentir(jar.Adm, plan.adm);
    const e = await etat(jar.Adm, plan.adm); assert.equal(e.data.portefeuille.illimite, true);
    const r = await msg(jar.Adm, plan.adm, { action: 'commencer', role: 'banquier' }); assert.equal(r.status, 200);
    assert.equal(usage('Adm').categorie, 'businessplan_illimite');
    assert.equal(sql('select count(*) n from kofi_solde where user_id=?', uid('Adm'))[0].n, 0);
  });
});
