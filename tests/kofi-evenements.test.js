/* ===========================================================
   tests/kofi-evenements.test.js — KOFFI, GUIDE DES ÉVÉNEMENTS (2026-11-01)
   ===========================================================
   Règles vérifiées : ouvert à tout compte majeur (pas de Premium) ; le modèle ne voit AUCUN événement et ne reçoit NI la ville NI le pays du profil (« @moi » remplacé par le
   serveur) ; les dates sont calculées par le serveur (heure de Paris) à partir d'une période ; seuls les événements PUBLICS à venir sortent (ni brouillon, boutique, privé,
   abonnés, annulé, passé) ; gratuit / payant / en ligne ; honnêteté quand il n'y a rien ; plafond de 8 cartes ; crédit débité au coût réel, rien en cas de panne / refus /
   réponse illisible ; « Que sais-tu faire ? » toujours gratuit ; administrateur illimité.
   Lancer : node --test tests/kofi-evenements.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const E = require('../server/kofi-evenements');

let env;
const journalIA = path.join(os.tmpdir(), 'faux-ia-evenements-' + process.pid + '.log');
test.before(async () => {
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.KOFI_FAUX_LOG = journalIA;
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofi-evenements');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalIA); } catch (e) { /* absent */ } });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

/* ── Fonctions pures : périodes (heure de Paris), critères, lecture de la sortie du modèle, sélection ── */
test('Koffi événements — périodes, critères, sortie du modèle, sélection (fonctions pures)', () => {
  /* 2026-11-04 est un mercredi ; 2026-11-01 un dimanche. */
  assert.deepEqual(E.bornesPeriode('aujourdhui', '2026-11-04'), ['2026-11-04', '2026-11-04']);
  assert.deepEqual(E.bornesPeriode('demain', '2026-11-04'), ['2026-11-05', '2026-11-05']);
  assert.deepEqual(E.bornesPeriode('cette_semaine', '2026-11-04'), ['2026-11-04', '2026-11-08'], 'd\'aujourd\'hui à dimanche');
  assert.deepEqual(E.bornesPeriode('cette_semaine', '2026-11-01'), ['2026-11-01', '2026-11-07'], 'un dimanche : les 7 jours qui viennent (sinon il ne resterait que le jour même)');
  assert.deepEqual(E.bornesPeriode('semaine_prochaine', '2026-11-04'), ['2026-11-09', '2026-11-15']);
  assert.deepEqual(E.bornesPeriode('semaine_prochaine', '2026-11-01'), ['2026-11-02', '2026-11-08']);
  assert.deepEqual(E.bornesPeriode('ce_week_end', '2026-11-04'), ['2026-11-07', '2026-11-08']);
  assert.deepEqual(E.bornesPeriode('ce_week_end', '2026-11-07'), ['2026-11-07', '2026-11-08']);
  assert.deepEqual(E.bornesPeriode('ce_week_end', '2026-11-08'), ['2026-11-08', '2026-11-08']);
  assert.deepEqual(E.bornesPeriode('ce_mois', '2026-11-04'), ['2026-11-04', '2026-11-30']);
  assert.deepEqual(E.bornesPeriode('mois_prochain', '2026-11-04'), ['2026-12-01', '2026-12-31']);
  assert.deepEqual(E.bornesPeriode('mois_prochain', '2026-12-20'), ['2027-01-01', '2027-01-31'], 'passage d\'année');
  assert.deepEqual(E.bornesPeriode('a_venir', '2026-11-04'), ['2026-11-04', '2027-11-04']);
  assert.match(E.aujourdhuiParis(Date.UTC(2026, 10, 3, 23, 30)), /^2026-11-04$/, 'minuit passé à Paris (UTC+1)');

  const v = E.validerCriteres({ concepts: [['conférence', 'x'], 'forum', [], ['a']], ville: '@moi', pays: ' France ', periode: 'cette_semaine', gratuit: 'gratuit', mode: 'en_ligne' });
  assert.deepEqual(v.concepts, [['conférence'], ['forum']], 'mots trop courts écartés');
  assert.equal(v.ville, '@moi'); assert.equal(v.pays, 'France'); assert.equal(v.periode, 'cette_semaine'); assert.equal(v.gratuit, 'gratuit'); assert.equal(v.mode, 'en_ligne');
  const w = E.validerCriteres({ periode: 'bientot', du: '2026-13-45', au: 'demain', gratuit: 'peut-etre', mode: 'hybride' });
  assert.deepEqual([w.periode, w.du, w.au, w.gratuit, w.mode], ['', '', '', '', '']);
  const inv = E.validerCriteres({ du: '2026-12-10', au: '2026-12-01' }); assert.deepEqual([inv.du, inv.au], ['2026-12-01', '2026-12-10'], 'intervalle inversé remis dans l\'ordre');
  assert.deepEqual(E.validerCriteres(null).concepts, []);

  assert.equal(E.lireSortie('bonjour'), null);
  assert.equal(E.lireSortie('{"action":"autre"}'), null);
  assert.equal(E.lireSortie('{"action":"question","message":""}'), null);
  assert.deepEqual(E.lireSortie('{"action":"question","message":"Quelle ville ?"}'), { action: 'question', message: 'Quelle ville ?' });
  const s = E.lireSortie('```json\n{"action":"chercher","message":"ok","criteres":{"periode":"demain"}}\n```');
  assert.equal(s.action, 'chercher'); assert.equal(s.criteres.periode, 'demain');
  assert.equal(E.lireSortie('{"action":"chercher","message":"x"}').action, 'chercher', 'sans critère : le serveur montrera les événements à venir');
  const sys = E.systemePour(); assert.match(sys, /ASSISTANT_EVENEMENTS/); assert.match(sys, /@moi/); assert.match(sys, /AUCUN événement/);

  const ev = (id, o) => ({ id, titre: 'Événement ' + id, date_evt: '2026-11-10', ville: 'Lyon', pays: 'France', type_participation: 'gratuit', prix_min: 0, ...o });
  const rows = [ev(1, { date_evt: '2026-11-12' }), ev(2, { date_evt: '2026-11-10', prix_min: 15 }), ev(3, { ville: 'Paris', lieu: 'Salle X' }), ev(4, { date_evt: '2026-11-09', date_fin: '2026-11-11', domaine: 'Entrepreneuriat' }),
    ev(5, { lien_visio: 'https://x.test/v', ville: '', pays: '' }), ev(6, { date_evt: '2026-10-01' }), ev(7, { date_evt: null }), ev(8, { type_participation: 'partiellement_payant' })];
  const tous = E.selectionner(rows, E.validerCriteres({}), '2026-11-04');
  assert.deepEqual(tous.items.map(x => x.e.id), [4, 2, 3, 5, 8, 1], 'passé et sans date écartés ; triés par date puis identifiant ; un événement en cours (4) compte');
  assert.deepEqual(E.selectionner(rows, E.validerCriteres({ ville: 'lyon' }), '2026-11-04').items.map(x => x.e.id), [4, 2, 8, 1]);
  assert.deepEqual(E.selectionner(rows, E.validerCriteres({ ville: 'Paris' }), '2026-11-04').items.map(x => x.e.id), [3]);
  assert.deepEqual(E.selectionner(rows, E.validerCriteres({ pays: 'France' }), '2026-11-04').items.map(x => x.e.id), [4, 2, 3, 8, 1]);
  assert.deepEqual(E.selectionner(rows, E.validerCriteres({ gratuit: 'payant' }), '2026-11-04').items.map(x => x.e.id), [2, 8], 'partiellement payant = payant');
  assert.deepEqual(E.selectionner(rows, E.validerCriteres({ gratuit: 'gratuit' }), '2026-11-04').items.map(x => x.e.id), [4, 3, 5, 1]);
  assert.deepEqual(E.selectionner(rows, E.validerCriteres({ mode: 'en_ligne' }), '2026-11-04').items.map(x => x.e.id), [5]);
  assert.deepEqual(E.selectionner(rows, E.validerCriteres({ concepts: [['entrepreneuriat']] }), '2026-11-04').items.map(x => x.e.id), [4]);
  assert.deepEqual(E.selectionner(rows, E.validerCriteres({ periode: 'demain' }), '2026-11-09').items.map(x => x.e.id), [4, 2, 3, 5, 8], 'demain (le 10) : l\'événement 4, en cours du 9 au 11, compte aussi');
  assert.deepEqual(E.selectionner(rows, E.validerCriteres({ du: '2026-11-11', au: '2026-11-12' }), '2026-11-04').items.map(x => x.e.id), [4, 1]);
  assert.equal(E.selectionner(rows, E.validerCriteres({ du: '2026-01-01', au: '2026-11-05' }), '2026-11-04').items.length, 0, 'jamais d\'événement passé : la borne de début est remontée à aujourd\'hui');
});

test('Koffi événements — parcours complet', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 7);
  const VILLE = 'Villex' + rnd, AUTRE_VILLE = 'Autreville' + rnd, THEME = 'zorbium' + rnd;
  const call = env.call;
  const jar = {}; for (const n of ['Req', 'Libre', 'Sans', 'Adm']) jar[n] = H.cookieJar();
  const anon = H.cookieJar();
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const etat = j => call(j, 'GET', '/api/kofi/evenements/etat');
  const dire = (j, texte, extra) => call(j, 'POST', '/api/kofi/evenements/messages', { texte, ...extra });
  const solde = async nom => { const w = (await etat(jar[nom])).data.portefeuille; return Math.round((w.solde_eur + w.mensuel_restant_eur + w.achete_restant_eur) * 1e6) / 1e6 + ':' + (w.offertes ? w.offertes.restantes : '-'); };
  const usage = nom => sql('select categorie from kofi_usage where user_id=? order by id desc limit 1', uid(nom))[0];
  const nbIA = () => { try { return fs.readFileSync(journalIA, 'utf8').trim().split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  const auj = E.aujourdhuiParis(), j = n => E.addJours(auj, n);
  let proprio;
  const evt = (o) => sql(`INSERT INTO evenements (titre, description, date_evt, date_fin, heure_debut, lieu, ville, pays, domaine, type_evt, type_participation, prix_min, lien_visio, visibilite, statut, owner_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    o.titre, o.description || '', o.date, o.fin || null, o.heure || '18:00', o.lieu || '', 'ville' in o ? o.ville : VILLE, 'pays' in o ? o.pays : 'France', o.domaine || '', o.type || 'evenement', o.participation || 'gratuit', o.prix || 0, o.visio || null, o.visibilite || 'public', o.statut || 'ouvert', proprio).lastInsertRowid;
  let id = {};

  await t.test('setup — comptes, profil avec ville, événements de toutes sortes, réserve IA', async () => {
    await H.creerFormateur(env, jar.Adm, rnd, 'Adm');
    for (const n of ['Req', 'Libre', 'Sans']) await H.creerApprenant(env, jar[n], rnd, n);
    for (const n of ['Req', 'Libre', 'Sans']) { sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", uid(n)); sql('DELETE FROM user_accreditations WHERE user_id=?', uid(n)); }
    assert.equal((await call(jar.Adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
    H.ordinariser(env, rnd, 'Req');                                           /* Premium ; Libre, Sans : pas de Premium */
    sql('UPDATE users SET ville=?, pays=? WHERE id=?', VILLE, 'France', uid('Req'));
    sql('UPDATE users SET ville=?, pays=? WHERE id=?', VILLE, 'France', uid('Libre'));
    sql("UPDATE users SET ville='', pays='' WHERE id=?", uid('Sans'));
    for (const n of ['Req', 'Libre', 'Sans']) assert.equal((await call(jar[n], 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
    proprio = uid('Adm');
    id.auj = evt({ titre: 'Rencontre du jour ' + THEME, date: auj, domaine: THEME });
    id.demain = evt({ titre: 'Atelier de demain', date: j(1), participation: 'payant', prix: 12, domaine: THEME });
    id.lointain = evt({ titre: 'Forum lointain', date: j(40), domaine: THEME });
    id.autre = evt({ titre: 'Soirée ailleurs', date: j(1), ville: AUTRE_VILLE });
    id.visio = evt({ titre: 'Webinaire en ligne', date: j(2), ville: '', pays: '', visio: 'https://meet.test/x', domaine: THEME });
    id.passe = evt({ titre: 'Événement passé', date: j(-3) });
    id.brouillon = evt({ titre: 'Brouillon', date: j(1), statut: 'brouillon' });
    id.boutique = evt({ titre: 'Boutique seulement', date: j(1), visibilite: 'boutique' });
    id.prive = evt({ titre: 'Privé', date: j(1), visibilite: 'prive' });
    id.abonnes = evt({ titre: 'Abonnés', date: j(1), visibilite: 'abonnes' });
    id.annule = evt({ titre: 'Annulé', date: j(1), statut: 'annule' });
    id.encours = evt({ titre: 'Festival en cours', date: j(-2), fin: j(3), domaine: THEME });
  });

  await t.test('accès : visiteur 401 ; un compte SANS Premium peut l\'utiliser ; majorité à confirmer ; zéro appel IA avant la première vraie demande', async () => {
    assert.equal((await etat(anon)).status, 401);
    assert.equal((await dire(anon, 'PERIODE:demain')).status, 401);
    const e = await etat(jar.Libre);
    assert.equal(e.status, 200); assert.equal(e.data.etat, 'utilisable', JSON.stringify(e.data)); assert.ok(e.data.portefeuille);
    sql('DELETE FROM kofi_majorite WHERE user_id=?', uid('Req'));
    assert.equal((await etat(jar.Req)).data.etat, 'majorite');
    assert.equal((await dire(jar.Req, 'PERIODE:demain')).data.code, 'majorite_requise');
    assert.equal((await call(jar.Req, 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
    assert.equal((await etat(jar.Req)).data.etat, 'utilisable');
    assert.equal(nbIA(), 0);
  });

  await t.test('« ma ville » : le serveur lit la ville du profil, le modèle ne la reçoit pas ; seuls les événements publics à venir de cette ville', async () => {
    const avant = await solde('Req');
    const r = await dire(jar.Req, 'Les événements de ma ville VILLE:@moi PERIODE:a_venir');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const titres = r.data.message.evenements.map(x => x.titre);
    const ids = r.data.message.evenements.map(x => x.id).sort((a, b) => a - b);
    assert.deepEqual(ids, [id.auj, id.demain, id.lointain, id.encours].map(Number).sort((a, b) => a - b), JSON.stringify(titres));
    for (const exclu of ['autre', 'visio', 'passe', 'brouillon', 'boutique', 'prive', 'abonnes', 'annule']) assert.ok(!ids.includes(Number(id[exclu])), exclu + ' ne doit pas sortir');
    assert.equal(r.data.message.evenements[0].id, Number(id.encours), 'le plus proche dans le temps d\'abord (en cours depuis avant-hier)');
    const dem = r.data.message.evenements.find(x => x.id === Number(id.demain)); assert.equal(dem.participation, 'payant'); assert.equal(dem.url, 'evenements.html?evt=' + id.demain);
    assert.match(r.data.message.contenu, /4 événements/);
    const log = fs.readFileSync(journalIA, 'utf8'); assert.ok(!log.includes(VILLE), 'la ville du profil n\'est jamais transmise au modèle');
    assert.ok((await solde('Req')) !== avant, 'crédit débité'); assert.equal(usage('Req').categorie, 'evenements_mensuel');
    assert.ok(!/telephone|password|email|date_naissance/i.test(JSON.stringify(r.data.message.evenements)), 'aucun champ privé');
  });

  await t.test('périodes : aujourd\'hui / demain / cette semaine, calculées par le serveur', async () => {
    const aujourdhui = await dire(jar.Req, 'KW:' + THEME + ' VILLE:@moi PERIODE:aujourdhui');
    assert.deepEqual(aujourdhui.data.message.evenements.map(x => x.id).sort((a, b) => a - b), [id.auj, id.encours].map(Number).sort((a, b) => a - b));
    const demain = await dire(jar.Req, 'VILLE:@moi PERIODE:demain');
    assert.deepEqual(demain.data.message.evenements.map(x => x.id), [Number(id.encours), Number(id.demain)], 'ville du profil, demain : le festival en cours puis l\'atelier');
    const sem = await dire(jar.Req, 'VILLE:@moi PERIODE:cette_semaine');
    assert.ok(sem.data.message.evenements.some(x => x.id === Number(id.auj)) && !sem.data.message.evenements.some(x => x.id === Number(id.lointain)), 'le forum à 40 jours n\'est pas « cette semaine »');
  });

  await t.test('thème, gratuit / payant, en ligne, pays ; ville nommée et affinage dans la conversation', async () => {
    const th = await dire(jar.Libre, 'KW:' + THEME);
    assert.equal(th.status, 200);
    assert.deepEqual(th.data.message.evenements.map(x => x.id).sort((a, b) => a - b), [id.auj, id.demain, id.lointain, id.visio, id.encours].map(Number).sort((a, b) => a - b), 'tous les événements du thème, en ligne compris');
    const g = await dire(jar.Libre, 'KW:' + THEME + ' GRATUIT:payant');
    assert.deepEqual(g.data.message.evenements.map(x => x.id), [Number(id.demain)]);
    const ol = await dire(jar.Libre, 'MODE:en_ligne');
    assert.deepEqual(ol.data.message.evenements.map(x => x.id), [Number(id.visio)]); assert.equal(ol.data.message.evenements[0].en_ligne, true);
    const v = await dire(jar.Libre, 'VILLE:' + AUTRE_VILLE);
    assert.deepEqual(v.data.message.evenements.map(x => x.id), [Number(id.autre)]);
    /* affiner : « plutôt gratuit » reprend les critères précédents dans la même conversation */
    const a1 = await dire(jar.Libre, 'KW:' + THEME + ' VILLE:' + VILLE);
    const a2 = await dire(jar.Libre, 'GRATUIT:gratuit', { conversation_id: a1.data.conversation_id });
    assert.ok(a2.data.message.evenements.length >= 1 && a2.data.message.evenements.every(x => x.participation === 'gratuit'));
    assert.ok(!a2.data.message.evenements.some(x => x.id === Number(id.demain)), 'l\'atelier payant disparaît');
  });

  await t.test('rien trouvé : dit honnêtement ; profil sans ville : demande la ville au lieu de chercher ; plafond de 8 cartes', async () => {
    const rien = await dire(jar.Libre, 'KW:inexistant' + rnd);
    assert.equal(rien.data.message.evenements.length, 0); assert.match(rien.data.message.contenu, /aucun événement public/);
    const sans = await dire(jar.Sans, 'VILLE:@moi PERIODE:cette_semaine');
    assert.equal(sans.status, 200); assert.equal(sans.data.message.evenements.length, 0); assert.match(sans.data.message.contenu, /ne mentionne pas votre ville|n'indique pas votre ville/);
    for (let i = 0; i < 10; i++) evt({ titre: 'Série ' + i, date: j(5 + i), ville: 'Seriecity' + rnd });
    const s = await dire(jar.Libre, 'VILLE:Seriecity' + rnd);
    assert.equal(s.data.message.evenements.length, E.MAX_EVENEMENTS); assert.match(s.data.message.contenu, /sur 10 trouvés/);
    assert.equal(s.data.message.evenements[0].titre, 'Série 0', 'les plus proches dans le temps');
  });

  await t.test('échecs : panne / limite → rien décompté ; refus → suivi ; réponse illisible → rien ; message vide / trop long', async () => {
    const avant = await solde('Sans');
    let r = await dire(jar.Sans, 'PANNEFAUSSE'); assert.equal(r.status, 503); assert.equal(await solde('Sans'), avant);
    r = await dire(jar.Sans, 'LIMITEFAUSSE'); assert.equal(r.status, 429); assert.equal(await solde('Sans'), avant);
    r = await dire(jar.Sans, 'REFUSFAUX'); assert.equal(r.status, 200); assert.match(r.data.message.contenu, /Je ne peux pas répondre/); assert.equal(await solde('Sans'), avant); assert.equal(usage('Sans').categorie, 'evenements_refus');
    r = await dire(jar.Sans, 'JSONFAUX'); assert.equal(r.status, 200); assert.match(r.data.message.contenu, /pas bien compris/); assert.equal(await solde('Sans'), avant); assert.equal(usage('Sans').categorie, 'evenements_illisible');
    assert.equal((await dire(jar.Sans, '   ')).status, 400);
    assert.equal((await dire(jar.Sans, 'a'.repeat(900))).data.code, 'trop_long');
  });

  await t.test('« Que sais-tu faire ? » : réponse fixe sans IA, toujours gratuite', async () => {
    const ia = nbIA(), avant = await solde('Req');
    const r = await dire(jar.Req, 'Que sais-tu faire ?');
    assert.equal(r.status, 200); assert.equal(r.data.message.gratuit, true); assert.match(r.data.message.contenu, /guide des événements/);
    assert.equal(nbIA(), ia, 'aucun appel au fournisseur'); assert.equal(await solde('Req'), avant);
  });

  await t.test('conversations : reprise par /etat, suppression par le propriétaire seulement', async () => {
    const e = await etat(jar.Req); assert.ok(e.data.conversation && e.data.conversation.messages.length >= 2);
    const idc = e.data.conversation.id;
    assert.equal((await call(jar.Libre, 'DELETE', `/api/kofi/evenements/conversations/${idc}`)).status, 404);
    assert.equal((await call(jar.Req, 'DELETE', `/api/kofi/evenements/conversations/${idc}`)).status, 200);
    assert.equal(sql('select count(*) n from kofi_messages where conversation_id=?', idc)[0].n, 0);
  });

  await t.test('administrateur : illimité — aucun solde, rien décompté', async () => {
    assert.equal((await call(jar.Adm, 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
    const e = await etat(jar.Adm); assert.equal(e.data.portefeuille.illimite, true);
    const r = await dire(jar.Adm, 'PERIODE:a_venir'); assert.equal(r.status, 200); assert.ok(r.data.message.evenements.length >= 1);
    assert.equal(usage('Adm').categorie, 'evenements_illimite');
    assert.equal(sql('select count(*) n from kofi_solde where user_id=?', uid('Adm'))[0].n, 0);
  });
});
