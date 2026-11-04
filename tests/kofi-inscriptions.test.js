/* ===========================================================
   tests/kofi-inscriptions.test.js — KOFFI, GUIDE DES FICHES D'INSCRIPTION (2026-11-04)
   ===========================================================
   Règles vérifiées : le modèle ne voit AUCUNE fiche ni inscrit ; le brouillon est revalidé par le serveur (libellés réservés, prix, options, dates) ; l'aperçu est écrit par le
   serveur ; RIEN n'est créé sans accord (bouton ou « oui » sur l'aperçu complet VU) ; création par les routes habituelles du module, en brouillon, avec trace dans l'historique ;
   double clic = une seule fiche ; comptes sans droit (Utilisateur) = explications seulement ; crédit : questions offertes décomptées, rien en cas de panne / refus / réponse
   illisible, « Que sais-tu faire ? » toujours gratuit, administrateur illimité ; secrets masqués.
   Lancer : node --test tests/kofi-inscriptions.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const I = require('../server/kofi-inscriptions');

let env;
const journalIA = path.join(os.tmpdir(), 'faux-ia-inscriptions-' + process.pid + '.log');
test.before(async () => {
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.KOFI_FAUX_LOG = journalIA;
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofi-inscriptions');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalIA); } catch (e) { /* absent */ } });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

/* ── Fonctions pures : brouillon, manquants, lecture de la sortie du modèle ── */
test('Koffi inscriptions — brouillon revalidé, manquants, sortie du modèle (fonctions pures)', () => {
  const v = I.validerBrouillon({
    nom: '  Gala <b>2026</b> ', visibilite: 'secret', ouverture: '2026-12-10', fermeture: '2026-12-01',
    types: [{ label: 'Adulte', prix: '15,5' }, { label: 'adulte', prix: 3 }, { label: 'Enfant', gratuit: true, places_max: '40', liste_attente: true }, { label: 'VIP', gratuit: false, prix: 0.1 }, { label: '' }],
    formulaire: [{ libelle: 'E-mail', type_champ: 'email' }, { libelle: 'Nom', type_champ: 'texte_court' }, { libelle: 'Téléphone', type_champ: 'telephone' }, { libelle: 'Régime', type_champ: 'choix_unique', options: ['Végé', 'végé', 'Sans porc'] }, { libelle: 'Nom de l\'accompagnant', type_champ: 'bizarre' }, { libelle: 'Régime' }],
  });
  const c = v.champs;
  assert.equal(c.visibilite, 'public', 'visibilité inconnue → publique par défaut (rien n\'est publié de toute façon : brouillon)');
  assert.deepEqual([c.ouverture, c.fermeture], ['2026-12-01', '2026-12-10'], 'dates inversées remises dans l\'ordre');
  assert.ok(v.problemes.includes('dates_inversees'));
  assert.deepEqual(c.types.map(t => t.label), ['Adulte', 'Enfant', 'VIP'], 'doublon (même libellé) et libellé vide écartés');
  assert.deepEqual([c.types[0].gratuit, c.types[0].prix], [false, 15.5]);
  assert.deepEqual([c.types[1].gratuit, c.types[1].places_max, c.types[1].liste_attente_active], [true, 40, true]);
  assert.equal(c.types[2].prix, null); assert.ok(v.problemes.includes('prix_trop_bas'), 'un prix payant sous 0,50 € est refusé');
  assert.deepEqual(c.formulaire.map(x => x.libelle), ['Régime', 'Nom de l\'accompagnant'], 'nom, e-mail, téléphone sont déjà demandés d\'office : écartés ; doublon écarté');
  assert.deepEqual(c.formulaire[0].options, ['Végé', 'Sans porc'], 'options dédoublonnées');
  assert.equal(c.formulaire[1].type_champ, 'texte_court', 'type inconnu → texte court'); assert.ok(v.problemes.includes('type_champ_inconnu:Nom de l\'accompagnant'));
  assert.ok(v.problemes.some(p => p.startsWith('libelle_reserve:')));

  assert.equal(I.validerBrouillon(null).champs.types[0].label, 'Participant', 'sans type : « Participant » gratuit par défaut');
  const m = I.manquants(c).map(x => x.cle);
  assert.ok(m.includes('prix'), 'type payant sans prix valide'); assert.ok(!m.includes('options'));
  assert.ok(I.manquants({ nom: '', types: [], formulaire: [] }).some(x => x.cle === 'nom'));
  assert.equal(I.manquants(I.validerBrouillon({ nom: 'Soirée', formulaire: [{ libelle: 'Choix', type_champ: 'liste_deroulante', options: ['seul'] }] }).champs).some(x => x.cle === 'options'), true, 'une liste exige au moins 2 choix');
  assert.equal(I.manquants(I.validerBrouillon({ nom: 'Soirée' }).champs).length, 0);

  assert.equal(I.memeBrouillon({ nom: 'A', types: [{ label: 'X' }] }, { nom: ' A ', types: [{ label: 'X', gratuit: true }] }), true);
  assert.equal(I.memeBrouillon({ nom: 'A' }, { nom: 'B' }), false);
  assert.equal(I.libelleReserve('  E-mail '), true); assert.equal(I.libelleReserve('Numéro de téléphone'), true); assert.equal(I.libelleReserve('Nom de l\'accompagnant'), false);

  assert.equal(I.lireSortie('bonjour'), null);
  assert.equal(I.lireSortie('{"action":"autre"}'), null);
  assert.equal(I.lireSortie('{"action":"question","message":""}'), null);
  assert.deepEqual(I.lireSortie('{"action":"question","message":"Quel nom ?"}'), { action: 'question', message: 'Quel nom ?' });
  const f = I.lireSortie('```json\n{"action":"fiche","message":"ok","brouillon":{"nom":"Gala"},"confirme":true}\n```');
  assert.equal(f.action, 'fiche'); assert.equal(f.confirme, true); assert.equal(f.brouillon.nom, 'Gala');
  assert.equal(I.lireSortie('{"action":"fiche","brouillon":[1],"confirme":"oui"}').confirme, false, 'seul true (booléen) vaut accord');
  assert.equal(I.lireSortie('{"action":"abandonner"}').action, 'abandonner');

  assert.match(I.quand({ ouverture: '2026-12-01', fermeture: '2026-12-10' }), /^Inscriptions du .*décembre 2026 au .*décembre 2026 inclus$/);
  assert.equal(I.quand({}), '');
  const corps = I.corpsFiche(I.validerBrouillon({ nom: 'Gala', description: 'Ligne <script>', ouverture: '2026-12-01', fermeture: '2026-12-10' }).champs);
  assert.equal(corps.date_ouverture_inscriptions, '2026-12-01T00:00'); assert.equal(corps.date_fermeture_inscriptions, '2026-12-10T23:59', 'la fermeture court jusqu\'à la fin du jour choisi');
  assert.ok(!/<script>/.test(corps.description), 'description échappée');
  assert.match(I.systemePour(), /ASSISTANT_INSCRIPTIONS/); assert.ok(!/Accompagnant\(e\)\W*\(oui/.test(I.systemePour()), 'la question toute faite « Accompagnant(e) » n\'existe plus');
});

test('Koffi inscriptions — parcours complet', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 7);
  const call = env.call;
  const jar = {}; for (const n of ['Adm', 'Init', 'Libre', 'User', 'Echecs']) jar[n] = H.cookieJar();
  const anon = H.cookieJar();
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const etat = j => call(j, 'GET', '/api/kofi/inscriptions/etat');
  const dire = (j, texte, extra) => call(j, 'POST', '/api/kofi/inscriptions/messages', { texte, ...extra });
  const solde = async nom => { const w = (await etat(jar[nom])).data.portefeuille; return Math.round((w.solde_eur + w.mensuel_restant_eur + w.achete_restant_eur) * 1e6) / 1e6 + ':' + (w.offertes ? w.offertes.restantes : '-'); };
  const usage = nom => sql('select categorie from kofi_usage where user_id=? order by id desc limit 1', uid(nom))[0];
  const nbIA = () => { try { return fs.readFileSync(journalIA, 'utf8').trim().split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  const nbFiches = () => sql('select count(*) n from insc_fiches')[0].n;
  const NOM = 'Gala ' + rnd;
  const BROUILLON = { nom: NOM, description: 'Une soirée.', organisateur: 'Association ' + rnd, visibilite: 'public', ouverture: '2026-12-01', fermeture: '2026-12-10',
    types: [{ label: 'Adulte', gratuit: false, prix: 15 }, { label: 'Enfant', gratuit: true, places_max: 30 }],
    formulaire: [{ libelle: 'Régime alimentaire', type_champ: 'choix_unique', options: ['Aucun', 'Végétarien'], obligatoire: true }, { libelle: 'Nom de l\'accompagnant', type_champ: 'texte_court' }] };
  const fj = (o) => 'FICHEJSON:' + JSON.stringify(o);

  await t.test('setup — comptes (administrateur, initiative Premium, initiative sans Premium, utilisateur), réserve IA', async () => {
    await H.creerFormateur(env, jar.Adm, rnd, 'Adm');
    for (const n of ['Init', 'Libre', 'User', 'Echecs']) await H.creerApprenant(env, jar[n], rnd, n);
    assert.equal((await call(jar.Adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
    H.ordinariser(env, rnd, 'Init');                                         /* Premium */
    for (const n of ['Libre', 'User', 'Echecs']) { sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", uid(n)); sql('DELETE FROM user_accreditations WHERE user_id=?', uid(n)); }
    sql("UPDATE users SET role='initiative' WHERE id IN (?,?,?)", uid('Init'), uid('Libre'), uid('Echecs'));
    for (const n of ['Adm', 'Libre', 'User', 'Echecs']) assert.equal((await call(jar[n], 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
  });

  await t.test('accès : visiteur 401 ; majorité à confirmer ; zéro appel IA avant la première vraie demande ; droit de création annoncé', async () => {
    assert.equal((await etat(anon)).status, 401);
    assert.equal((await dire(anon, 'bonjour')).status, 401);
    sql('DELETE FROM kofi_majorite WHERE user_id=?', uid('Init'));
    assert.equal((await etat(jar.Init)).data.etat, 'majorite');
    assert.equal((await dire(jar.Init, 'bonjour')).data.code, 'majorite_requise');
    assert.equal((await call(jar.Init, 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
    const e = await etat(jar.Init); assert.equal(e.data.etat, 'utilisable'); assert.equal(e.data.creation.disponible, true);
    assert.equal((await etat(jar.User)).data.creation.disponible, false, 'un simple Utilisateur ne peut pas créer de fiche');
    assert.equal(nbIA(), 0);
  });

  await t.test('explication : réponse du modèle, questions offertes décomptées (compte sans Premium), le modèle ne reçoit aucune fiche ni inscrit', async () => {
    const e0 = await etat(jar.Libre); assert.ok(e0.data.portefeuille.offertes, 'compte sans Premium : questions offertes');
    const avant = await solde('Libre');
    const r = await dire(jar.Libre, 'À quoi sert la liste d\'attente ?');
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.match(r.data.message.contenu, /explication sur la fiche/);
    assert.ok((await solde('Libre')) !== avant, 'une question offerte est décomptée'); assert.equal(usage('Libre').categorie, 'inscriptions_offert');
    const log = fs.readFileSync(journalIA, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const dernier = log[log.length - 1];
    assert.match(dernier.systeme, /ASSISTANT_INSCRIPTIONS/); assert.match(dernier.systeme, /Il n'existe PAS de question toute faite/);
    assert.match(JSON.stringify(dernier.messages), /creer_fiche: oui/);
    assert.ok(!/insc_fiches|inscrit\(s\) :/.test(JSON.stringify(dernier)), 'aucune donnée de fiche transmise');
  });

  await t.test('« Que sais-tu faire ? » : réponse fixe sans IA, toujours gratuite, mentionne le sens de l\'accompagnant sans inventer', async () => {
    const ia = nbIA(), avant = await solde('Libre');
    const r = await dire(jar.Libre, 'Que sais-tu faire ?');
    assert.equal(r.status, 200); assert.equal(r.data.message.gratuit, true); assert.match(r.data.message.contenu, /fiches d'inscription/i);
    assert.equal(nbIA(), ia, 'aucun appel au fournisseur'); assert.equal(await solde('Libre'), avant);
  });

  await t.test('un Utilisateur ne peut rien créer : le brouillon est refusé avec une explication, aucune fiche', async () => {
    const n0 = nbFiches();
    const r = await dire(jar.User, fj(BROUILLON));
    assert.equal(r.status, 200); assert.match(r.data.message.contenu, /Seuls les comptes Initiative, Collectivité et Administrateur/); assert.ok(!r.data.message.brouillon);
    assert.match(fs.readFileSync(journalIA, 'utf8').trim().split('\n').pop(), /creer_fiche: non/);
    assert.equal(nbFiches(), n0);
    const c = await call(jar.User, 'POST', '/api/kofi/inscriptions/fiche/creer', { message_id: r.data.message.id });
    assert.ok([403, 404, 409].includes(c.status)); assert.equal(nbFiches(), n0);
  });

  let apercu, convId;
  await t.test('brouillon : aperçu écrit par le serveur, revalidé, RIEN créé', async () => {
    const n0 = nbFiches();
    const brut = { ...BROUILLON, formulaire: [...BROUILLON.formulaire, { libelle: 'E-mail', type_champ: 'email' }] };
    const r = await dire(jar.Init, fj(brut));
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const b = r.data.message.brouillon; apercu = r.data.message; convId = r.data.conversation_id;
    assert.ok(b, 'aperçu présent'); assert.equal(b.nom, NOM); assert.equal(b.pret, true); assert.deepEqual(b.manquants, []);
    assert.equal(b.types.length, 2); assert.match(b.types[0], /Adulte — 15 €/); assert.match(b.types[1], /Enfant — gratuit · 30 places/);
    assert.equal(b.formulaire.length, 2, 'l\'e-mail (déjà demandé d\'office) est écarté'); assert.match(b.formulaire[0], /Régime alimentaire \(choix unique : Aucun, Végétarien, obligatoire\)/);
    assert.match(b.quand, /Inscriptions du .*décembre 2026 au .*décembre 2026 inclus/);
    assert.match(r.data.message.contenu, /déjà demandé à chaque inscrit/); assert.match(r.data.message.contenu, /Créer la fiche/);
    assert.match(usage('Init').categorie, /^inscriptions_(mensuel|achat|offert)$/, 'le message est décompté du portefeuille unique');
    assert.equal(nbFiches(), n0, 'rien n\'est créé avant l\'accord');
  });

  await t.test('« oui » sans aperçu vu / avec un autre brouillon : rien n\'est créé', async () => {
    const n0 = nbFiches();
    /* Nouvelle conversation : le modèle répond « oui » sans brouillon précédent → aucun accord possible. */
    const seul = await dire(jar.Init, 'OUIFICHE');
    assert.equal(seul.status, 200); assert.equal(nbFiches(), n0); assert.ok(!seul.data.message.cree);
    /* Brouillon incomplet (type payant sans prix) puis « oui » : toujours rien. */
    const inc = await dire(jar.Init, fj({ nom: 'Incomplet ' + rnd, types: [{ label: 'Payant', gratuit: false }] }));
    assert.equal(inc.data.message.brouillon.pret, false); assert.match(inc.data.message.brouillon.manquants[0], /prix de « Payant »/);
    const oui = await dire(jar.Init, 'OUIFICHE', { conversation_id: inc.data.conversation_id });
    assert.equal(nbFiches(), n0); assert.ok(!oui.data.message.cree);
    /* Les boutons refusent un aperçu incomplet. */
    const c = await call(jar.Init, 'POST', '/api/kofi/inscriptions/fiche/creer', { message_id: oui.data.message.id });
    assert.ok([409].includes(c.status), JSON.stringify(c.data)); assert.equal(nbFiches(), n0);
  });

  await t.test('bouton « Créer la fiche » : brouillon créé avec types et champs, trace dans l\'historique ; double clic = une seule fiche', async () => {
    const n0 = nbFiches();
    const [a, b] = await Promise.all([1, 2].map(() => call(jar.Init, 'POST', '/api/kofi/inscriptions/fiche/creer', { message_id: apercu.id })));
    const statuts = [a.status, b.status].sort();
    assert.deepEqual(statuts, [201, 409], 'un seul des deux clics crée : ' + JSON.stringify([a.data, b.data]));
    const ok = a.status === 201 ? a : b;
    assert.equal(nbFiches(), n0 + 1);
    const fid = ok.data.fiche_id; assert.ok(fid);
    assert.match(ok.data.message.contenu, /créée en brouillon/); assert.equal(ok.data.message.lien.url, 'inscriptions-admin.html?fiche=' + fid); assert.equal(ok.data.message.lien.tel, '#/inscriptions/' + fid);
    const f = sql('select * from insc_fiches where id=?', fid)[0];
    assert.equal(f.nom, NOM); assert.equal(f.statut, 'brouillon', 'jamais publiée par Koffi'); assert.equal(Number(f.user_id || f.owner_user_id || f.createur_id || uid('Init')), uid('Init'));
    const types = sql('select * from insc_types where fiche_id=? order by id', fid);
    assert.deepEqual(types.map(x => x.label), ['Adulte', 'Enfant']); assert.equal(Number(types[0].prix), 15); assert.equal(Number(types[1].places_max), 30);
    for (const ty of types) assert.deepEqual(sql('select libelle from insc_champs where type_id=? order by id', ty.id).map(x => x.libelle), ['Régime alimentaire', 'Nom de l\'accompagnant'], 'les questions sont ajoutées à chaque type');
    const h = sql("select * from insc_historique where fiche_id=? and action='creation_koffi'", fid);
    assert.equal(h.length, 1); assert.match(h[0].details, /2 type\(s\) d'inscription, 2 question\(s\)/); assert.equal(Number(h[0].acteur_id), uid('Init'));
    /* L'ancien aperçu n'est plus utilisable. */
    const encore = await call(jar.Init, 'POST', '/api/kofi/inscriptions/fiche/creer', { message_id: apercu.id });
    assert.equal(encore.status, 409); assert.equal(nbFiches(), n0 + 1);
  });

  await t.test('« oui » écrit : crée seulement si l\'aperçu complet a été vu et reste identique', async () => {
    const n0 = nbFiches();
    const p = await dire(jar.Init, fj({ ...BROUILLON, nom: 'Soirée oui ' + rnd }));
    assert.equal(p.data.message.brouillon.pret, true); assert.equal(nbFiches(), n0);
    const oui = await dire(jar.Init, 'OUIFICHE', { conversation_id: p.data.conversation_id });
    assert.equal(oui.status, 200, JSON.stringify(oui.data)); assert.equal(oui.data.message.cree, true); assert.equal(nbFiches(), n0 + 1);
    assert.equal(sql("select statut from insc_fiches where nom=?", 'Soirée oui ' + rnd)[0].statut, 'brouillon');
    /* Brouillon modifié entre l'aperçu et le « oui » : le « oui » ne vaut pas pour la nouvelle version. */
    const p2 = await dire(jar.Init, fj({ ...BROUILLON, nom: 'Version A ' + rnd }));
    const modif = await dire(jar.Init, fj({ nom: 'Version B ' + rnd }), { conversation_id: p2.data.conversation_id });
    assert.equal(modif.data.message.brouillon.nom, 'Version B ' + rnd); assert.equal(nbFiches(), n0 + 1);
  });

  await t.test('abandon : par le bouton et par la parole, sans créer', async () => {
    const n0 = nbFiches();
    const p = await dire(jar.Init, fj({ ...BROUILLON, nom: 'À jeter ' + rnd }));
    const ab = await call(jar.Init, 'POST', '/api/kofi/inscriptions/fiche/abandonner', { message_id: p.data.message.id });
    assert.equal(ab.status, 200); assert.match(ab.data.message.contenu, /j'abandonne/);
    assert.equal((await call(jar.Init, 'POST', '/api/kofi/inscriptions/fiche/creer', { message_id: p.data.message.id })).status, 409, 'l\'aperçu abandonné n\'est plus créable');
    const p2 = await dire(jar.Init, fj({ ...BROUILLON, nom: 'À jeter 2 ' + rnd }));
    const ab2 = await dire(jar.Init, 'ABANDON', { conversation_id: p2.data.conversation_id });
    assert.match(ab2.data.message.contenu, /abandonne/); assert.equal(nbFiches(), n0);
    /* Le brouillon d'un autre compte reste introuvable. */
    assert.equal((await call(jar.Libre, 'POST', '/api/kofi/inscriptions/fiche/abandonner', { message_id: p2.data.message.id })).status, 404);
  });

  await t.test('secrets : un mot de passe ou un code collé dans le message n\'arrive jamais au modèle', async () => {
    await dire(jar.Libre, 'Mon mot de passe est Tr0ub4dor&3xyz et mon code secret 123456, à quoi sert le QR ?');
    const dernier = fs.readFileSync(journalIA, 'utf8').trim().split('\n').pop();
    assert.ok(!/Tr0ub4dor/.test(dernier), 'mot de passe masqué');
  });

  await t.test('échecs : panne / limite → rien décompté ; refus → suivi ; réponse illisible → rien ; message vide / trop long', async () => {
    const avant = await solde('Echecs');
    let r = await dire(jar.Echecs, 'PANNEFAUSSE'); assert.equal(r.status, 503); assert.equal(await solde('Echecs'), avant);
    r = await dire(jar.Echecs, 'LIMITEFAUSSE'); assert.equal(r.status, 429); assert.equal(await solde('Echecs'), avant);
    r = await dire(jar.Echecs, 'REFUSFAUX'); assert.equal(r.status, 200); assert.match(r.data.message.contenu, /Je ne peux pas répondre/); assert.equal(await solde('Echecs'), avant); assert.equal(usage('Echecs').categorie, 'inscriptions_refus');
    r = await dire(jar.Echecs, 'JSONFAUX'); assert.equal(r.status, 200); assert.match(r.data.message.contenu, /pas bien compris/); assert.equal(await solde('Echecs'), avant); assert.equal(usage('Echecs').categorie, 'inscriptions_illisible');
    assert.equal((await dire(jar.Echecs, '   ')).status, 400);
    assert.equal((await dire(jar.Echecs, 'a'.repeat(900))).data.code, 'trop_long');
  });

  await t.test('crédit épuisé : question refusée (402) mais « Que sais-tu faire ? » reste gratuit ; le même portefeuille sert à tout Koffi', async () => {
    sql('DELETE FROM kofi_credits WHERE user_id=?', uid('User'));
    sql("INSERT INTO kofi_credits (user_id, origine, questions_total, questions_restantes) VALUES (?,'gratuit',15,0)", uid('User'));
    const e = await etat(jar.User); assert.equal(e.data.etat, 'recharge', JSON.stringify(e.data.portefeuille));
    const r = await dire(jar.User, 'à quoi sert un type d\'inscription ?'); assert.equal(r.status, 402); assert.equal(r.data.code, 'credits_epuises');
    const g = await dire(jar.User, 'Que sais-tu faire ?'); assert.equal(g.status, 200); assert.equal(g.data.message.gratuit, true);
    /* Même portefeuille que les autres Koffi : le solde vu ici est celui de l'état Événements. */
    const pf1 = (await etat(jar.Init)).data.portefeuille, pf2 = (await call(jar.Init, 'GET', '/api/kofi/evenements/etat')).data.portefeuille;
    assert.equal(JSON.stringify(pf1), JSON.stringify(pf2), 'un seul portefeuille pour tous les Koffi');
  });

  await t.test('conversations : reprise par /etat, suppression par le propriétaire seulement', async () => {
    const e = await etat(jar.Init); assert.ok(e.data.conversation && e.data.conversation.messages.length >= 2);
    const idc = e.data.conversation.id;
    assert.equal((await call(jar.Libre, 'DELETE', `/api/kofi/inscriptions/conversations/${idc}`)).status, 404);
    assert.equal((await call(jar.Init, 'DELETE', `/api/kofi/inscriptions/conversations/${idc}`)).status, 200);
    assert.equal(sql('select count(*) n from kofi_messages where conversation_id=?', idc)[0].n, 0);
  });

  await t.test('administrateur : illimité — aucun solde, rien décompté, peut créer', async () => {
    const e = await etat(jar.Adm); assert.equal(e.data.portefeuille.illimite, true); assert.equal(e.data.creation.disponible, true);
    const n0 = nbFiches();
    const p = await dire(jar.Adm, fj({ nom: 'Fiche admin ' + rnd }));
    assert.equal(p.status, 200); assert.equal(usage('Adm').categorie, 'inscriptions_illimite');
    const c = await call(jar.Adm, 'POST', '/api/kofi/inscriptions/fiche/creer', { message_id: p.data.message.id });
    assert.equal(c.status, 201, JSON.stringify(c.data)); assert.equal(nbFiches(), n0 + 1);
    assert.equal(sql('select count(*) n from kofi_solde where user_id=?', uid('Adm'))[0].n, 0);
  });
});
