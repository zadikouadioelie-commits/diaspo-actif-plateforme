/* ===========================================================
   tests/formation-relances.test.js — Formation Diaspora, lot C : relances programmables (2026-10-30)
   ===========================================================
   Règles du formateur (validation, droits), aperçu « qui serait relancé », envoi par notification et par e-mail (faux envoi), journal-verrou (jamais deux fois),
   plafond de 2 relances par personne et par jour, répétition, désinscription (lien de l'e-mail et bouton), blocage par l'administration, cron quotidien.
   Intégration : vrai serveur + base SQLite isolée ; le moteur est aussi appelé directement avec un faux envoi d'e-mails et une horloge réglable.
   Lancer : node --test tests/formation-relances.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');
const Relances = require('../server/formation-relances');
const { signAuthToken, verifyAuthToken } = require('../server/auth');

let env;
test.before(async () => {
  process.env.CRON_SECRET = 'cron_test_factice';
  env = await H.demarrer('relances');
});
test.after(() => { if (env) env.stop(); });

/* Base ouverte en direct, avec la même forme que celle du serveur (prepare().get/all/run, asynchrone). */
function base() {
  const sq = new H.DatabaseSync(env.dbPath);
  sq.exec('PRAGMA busy_timeout=5000');
  return {
    prepare(req) { const s = sq.prepare(req); return { get: async (...a) => s.get(...a), all: async (...a) => s.all(...a), run: async (...a) => s.run(...a) }; },
    sq,
  };
}
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
const sqlDate = t => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
const JOUR = 86400000;

test('relances : règles, envois, journal, plafond, désinscription', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarB = H.cookieJar(), jarC = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid, fid2, formateurId, idA, idB, idC, inscA, inscB, inscC;
  const notifs = (uid) => sql("select * from notifications where user_id=? and type='formation_relance' order by id", uid);
  const regle = (extra) => call(jarF, 'POST', '/api/formateur/relances', { nom: 'Rappel', evenement: 'inactivite', valeur: 7, canal_notif: true, message: 'Bonjour {prenom}, reprenez {formation}.', ...extra });
  const moteur = async (opts) => {
    const db = base();
    const envoyes = [];
    const bilan = await Relances.executer({
      db, creerNotif: async (uid, type, titre, contenu, data) => { db.sq.prepare("INSERT INTO notifications (user_id,type,titre,contenu,data_json) VALUES (?,?,?,?,?)").run(uid, type, titre, contenu, JSON.stringify(data || {})); },
      sendEmail: opts && opts.sendEmail ? async (m) => { envoyes.push(m); return opts.sendEmail(m); } : async (m) => { envoyes.push(m); return { ok: true, id: 'x' }; },
      signAuthToken, origine: 'https://exemple.test', maintenant: (opts && opts.maintenant) || Date.now(), regleId: opts && opts.regleId,
    });
    db.sq.close();
    return { bilan, envoyes };
  };
  const journal = (extra) => sql('select * from formation_relances_journal ' + (extra || '') + ' order by id');

  await t.test('setup — une formation gratuite publiée, trois apprenants inscrits', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    await H.creerApprenant(env, jarA, rnd, 'Alpha');
    await H.creerApprenant(env, jarB, rnd, 'Bravo');
    await H.creerApprenant(env, jarC, rnd, 'Charlie');
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Relances ' + rnd, description: 'x' })).data.id;
    fid2 = (await call(jarF, 'POST', '/api/formations', { titre: 'Seconde ' + rnd, description: 'x' })).data.id;
    for (const id of [fid, fid2]) { sql("UPDATE formations SET mode_acces='gratuit', gratuit=1 WHERE id=?", id); H.publier(env, id); }
    formateurId = sql('select owner_user_id o from formations where id=?', fid)[0].o;
    for (const jar of [jarA, jarB, jarC]) assert.equal((await call(jar, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
    [idA, idB, idC] = ['Alpha', 'Bravo', 'Charlie'].map(n => sql('select id from users where nom=?', n)[0].id);
    [inscA, inscB, inscC] = [idA, idB, idC].map(u => sql('select id from formation_inscriptions where user_id=? and formation_id=?', u, fid)[0].id);
    /* Alpha : inactive depuis 10 jours ; Bravo : active hier ; Charlie : inactive depuis 20 jours */
    sql('update formation_inscriptions set derniere_activite_le=? where id=?', sqlDate(Date.now() - 10 * JOUR), inscA);
    sql('update formation_inscriptions set derniere_activite_le=? where id=?', sqlDate(Date.now() - 1 * JOUR), inscB);
    sql('update formation_inscriptions set derniere_activite_le=? where id=?', sqlDate(Date.now() - 20 * JOUR), inscC);
    sql("update formation_inscriptions set date_inscription=? where formation_id=?", sqlDate(Date.now() - 30 * JOUR), fid);
  });

  await t.test('écrire une règle : validations et droits', async () => {
    assert.equal((await regle({ nom: '' })).status, 400);
    assert.equal((await regle({ evenement: 'inconnu' })).status, 400);
    assert.equal((await regle({ valeur: 0 })).status, 400, 'au moins 1 jour');
    assert.equal((await regle({ evenement: 'palier', valeur: 100 })).status, 400, 'palier de 1 à 99 %');
    assert.equal((await regle({ canal_notif: false, canal_email: false })).status, 400, 'un canal au moins');
    assert.equal((await regle({ message: 'ok' })).status, 400, 'message trop court');
    const inc = await regle({ message: 'Bonjour {prenon}, reprenez {formation}.' });
    assert.equal(inc.status, 400); assert.match(inc.data.error, /prenon/, 'une faute de frappe dans une variable est signalée');
    assert.equal((await regle({ canal_email: true, canal_notif: false, objet: '' })).status, 400, 'un e-mail a besoin d\'un objet');
    assert.equal((await regle({ repetition_jours: 400 })).status, 400);
    assert.equal((await regle({ formation_id: 999999 })).status, 400, 'formation qui n\'est pas la mienne');
    assert.equal((await call(jarA, 'POST', '/api/formateur/relances', { nom: 'x', evenement: 'inactivite', valeur: 3, canal_notif: true, message: 'Bonjour {prenom}' })).status, 403, 'un apprenant ne crée pas de relance');
    assert.equal((await call(anon, 'GET', '/api/formateur/relances')).status, 401);
    const ok = await regle({ nom: 'Inactifs 7 jours', formation_id: fid });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    const liste = await call(jarF, 'GET', '/api/formateur/relances');
    assert.equal(liste.data.regles.length, 1); assert.equal(liste.data.regles[0].nom, 'Inactifs 7 jours');
    assert.ok(liste.data.evenements.palier && liste.data.variables.includes('prenom'));
    assert.equal(liste.data.formations.length, 2); assert.equal(liste.data.formations[0].relances_defaut, true);
  });

  await t.test('qui serait relancé maintenant : seulement les inactifs depuis 7 jours ou plus', async () => {
    const r = (await call(jarF, 'GET', '/api/formateur/relances')).data.regles[0];
    const c = await call(jarF, 'GET', `/api/formateur/relances/${r.id}/concernes`);
    assert.equal(c.status, 200); assert.equal(c.data.nb, 2);
    assert.deepEqual(c.data.apercu.map(x => x.nom.split(' ').pop()).sort(), ['Alpha', 'Charlie']);
    assert.equal((await call(jarA, 'GET', `/api/formateur/relances/${r.id}/concernes`)).status, 403);
  });

  await t.test('aperçu du texte avec des valeurs d\'exemple', async () => {
    const r = await call(jarF, 'POST', '/api/formateur/relances/apercu', { objet: 'Salut {prenom}', message: 'Vous en êtes à {progression} % de {formation}. {lien}' });
    assert.equal(r.status, 200); assert.equal(r.data.objet, 'Salut Aminata'); assert.match(r.data.message, /40 % de Entrepreneuriat international\. http/);
    const inc = await call(jarF, 'POST', '/api/formateur/relances/apercu', { message: '{faute}' });
    assert.deepEqual(inc.data.variables_inconnues, ['faute']);
  });

  await t.test('envoi par notification : message personnalisé, journal, jamais deux fois', async () => {
    const { bilan } = await moteur();
    assert.equal(bilan.notifs, 2); assert.equal(bilan.concernes, 2);
    const na = notifs(idA);
    assert.equal(na.length, 1); assert.match(na[0].contenu, /Bonjour Aminata, reprenez Relances/);
    assert.equal(notifs(idB).length, 0, 'Bravo est actif : pas relancé');
    assert.equal(journal().length, 2); assert.equal(journal()[0].statut, 'envoye'); assert.equal(journal()[0].canal, 'notif'); assert.equal(journal()[0].libelle, 'Inactifs 7 jours');
    const encore = await moteur();
    assert.equal(encore.bilan.notifs, 0, 'une seconde exécution ne relance personne');
    assert.equal(notifs(idA).length, 1);
    /* la formation d'un autre formateur n'est jamais concernée par ma règle « toutes mes formations » */
  });

  await t.test('un nouvel épisode d\'inactivité peut relancer à nouveau (après une reprise)', async () => {
    sql('update formation_inscriptions set derniere_activite_le=? where id=?', sqlDate(Date.now() - 8 * JOUR + 3 * 3600000), inscA); /* Alpha a repris il y a ~8 jours : plus récent que l'envoi ? non, l'envoi date d'aujourd'hui */
    assert.equal((await moteur()).bilan.notifs, 0, 'l\'envoi d\'aujourd\'hui est plus récent que la dernière activité : même épisode');
    /* simulation : 9 jours plus tard, Alpha avait repris puis s'est arrêté à nouveau */
    sql('update formation_inscriptions set derniere_activite_le=? where id=?', sqlDate(Date.now() + 1 * JOUR), inscA);
    const r = await moteur({ maintenant: Date.now() + 9 * JOUR });
    assert.ok(r.bilan.notifs >= 1, 'nouvel épisode : relancée de nouveau');
    assert.equal(notifs(idA).length, 2);
    assert.equal(journal("where inscription_id=" + inscA).map(l => l.rang).join(','), '1,2');
  });

  await t.test('plafond : jamais plus de 2 relances par personne et par jour', async () => {
    sql("delete from formation_relances_journal"); sql("delete from notifications where type='formation_relance'");
    sql('update formation_inscriptions set derniere_activite_le=? where id=?', sqlDate(Date.now() - 10 * JOUR), inscA);
    for (const [nom, v] of [['Deux', 8], ['Trois', 9]]) assert.equal((await regle({ nom, valeur: v, formation_id: fid })).status, 201);
    const { bilan } = await moteur();
    assert.equal(notifs(idA).length, 2, 'Alpha reçoit au plus 2 relances ce jour');
    assert.ok(bilan.plafonnes >= 1, JSON.stringify(bilan));
    assert.equal(notifs(idC).length, 2);
    const le3 = sql("select r.id from formation_relances_regles r where nom='Trois'")[0].id;
    const demain = await moteur({ maintenant: Date.now() + 1 * JOUR + 3600000 });
    assert.ok(notifs(idA).length >= 3, 'le lendemain la troisième règle peut partir : ' + notifs(idA).length);
    assert.ok(le3);
    sql("delete from formation_relances_regles where nom in ('Deux','Trois')");
  });

  await t.test('e-mail : texte échappé, lien de désinscription, réglage du compte respecté, échec consigné', async () => {
    sql("delete from formation_relances_journal"); sql("delete from notifications where type='formation_relance'"); sql("delete from formation_relances_regles");
    const r = await regle({ nom: 'Mail', canal_notif: false, canal_email: true, objet: 'On vous attend, {prenom}', message: 'Bonjour {prenom}\n\n<script>alert(1)</script> {formation}', formation_id: fid });
    assert.equal(r.status, 201);
    sql("update users set notif_emails_non_essentiels=0 where id=?", idC); /* Charlie a coupé les e-mails non essentiels */
    const { bilan, envoyes } = await moteur();
    assert.equal(bilan.emails, 1); assert.equal(bilan.ignores, 1);
    assert.equal(envoyes.length, 1); assert.match(envoyes[0].to, /alpha/);
    assert.equal(envoyes[0].subject, 'On vous attend, Aminata');
    assert.doesNotMatch(envoyes[0].html, /<script>/); assert.match(envoyes[0].html, /&lt;script&gt;/);
    assert.match(envoyes[0].html, /Reprendre ma formation/); assert.match(envoyes[0].html, new RegExp(`suivre-formation\\.html\\?id=${fid}`));
    const ig = journal("where user_id=" + idC);
    assert.equal(ig[0].statut, 'ignore'); assert.match(ig[0].erreur, /e-mails non essentiels/);
    assert.equal(notifs(idA).length, 0, 'canal e-mail seul : pas de notification');
    /* échec d'envoi : consigné, jamais renvoyé le lendemain */
    sql("delete from formation_relances_journal");
    const ko = await moteur({ sendEmail: async () => ({ ok: false, reason: 'no_key' }) });
    assert.equal(ko.bilan.echecs, 1);
    assert.equal(journal("where user_id=" + idA)[0].statut, 'echec');
    assert.equal((await moteur({ maintenant: Date.now() + 2 * JOUR })).bilan.emails, 0);
  });

  await t.test('désinscription : le lien de l\'e-mail et le bouton coupent les rappels de cette formation', async () => {
    sql("delete from formation_relances_journal");
    const { envoyes } = await moteur();
    const lien = envoyes[0].html.match(/href="([^"]*relances-formation\/stop[^"]*)"/)[1].replace(/&amp;/g, '&');
    const url = new URL(lien);
    const p = verifyAuthToken(url.searchParams.get('t'));
    assert.equal(p.k, 'relances_off'); assert.equal(p.i, inscA); assert.equal(p.u, idA); assert.equal(p.uid, undefined, 'ce jeton ne peut jamais servir de connexion');
    const mauvais = await fetch(env.base + '/api/relances-formation/stop?t=' + encodeURIComponent(url.searchParams.get('t') + 'x'));
    assert.match(await mauvais.text(), /Lien invalide/);
    const bon = await fetch(env.base + '/api/relances-formation/stop?t=' + encodeURIComponent(url.searchParams.get('t')));
    assert.equal(bon.status, 200); assert.match(await bon.text(), /C'est noté/);
    assert.equal(sql('select relances_off o from formation_inscriptions where id=?', inscA)[0].o, 1);
    sql("delete from formation_relances_journal");
    const apres = await moteur({ maintenant: Date.now() + 5 * JOUR });
    assert.ok(!apres.envoyes.some(m => /alpha/.test(m.to)), 'Alpha ne reçoit plus rien');
    /* le bouton du lecteur : couper puis rétablir */
    assert.equal((await call(jarB, 'GET', `/api/formations/${fid}/relances/etat`)).data.off, false);
    assert.equal((await call(jarB, 'POST', `/api/formations/${fid}/relances/silence`, { off: true })).data.off, true);
    assert.equal(sql('select relances_off o from formation_inscriptions where id=?', inscB)[0].o, 1);
    assert.equal((await call(jarB, 'POST', `/api/formations/${fid}/relances/silence`, { off: false })).data.off, false);
    assert.equal((await call(jarB, 'POST', `/api/formations/${fid2}/relances/silence`, { off: true })).status, 404, 'pas inscrit');
    assert.equal((await call(anon, 'POST', `/api/formations/${fid}/relances/silence`, { off: true })).status, 401);
    sql('update formation_inscriptions set relances_off=0 where id=?', inscA);
  });

  await t.test('autres événements : jamais commencé, palier, accès qui expire, non terminée ; répétition limitée', async () => {
    sql("delete from formation_relances_journal"); sql("delete from formation_relances_regles"); sql("delete from notifications where type='formation_relance'");
    sql('update formation_inscriptions set avancement_pct=60, derniere_activite_le=? where id=?', sqlDate(Date.now()), inscB);
    sql('update formation_inscriptions set avancement_pct=0 where id in (?,?)', inscA, inscC);
    const mk = async (extra) => (await regle({ formation_id: fid, ...extra })).data.id;
    const rJamais = await mk({ nom: 'Jamais', evenement: 'jamais_commence', valeur: 3 });
    const rPalier = await mk({ nom: 'Palier', evenement: 'palier', valeur: 50, message: 'Bravo {prenom} : {progression} %' });
    const rExp = await mk({ nom: 'Expire', evenement: 'avant_expiration', valeur: 7, message: 'Plus que {jours} jours ({expiration})' });
    const rNon = await mk({ nom: 'Non terminée', evenement: 'non_terminee', valeur: 20, repetition_jours: 5, max_envois: 2 });
    sql("update formation_acces set statut='actif', date_expiration=? where user_id=? and formation_id=? and module_cle=0", sqlDate(Date.now() + 4 * JOUR), idB, fid);
    const conc = async id => (await call(jarF, 'GET', `/api/formateur/relances/${id}/concernes`)).data;
    assert.equal((await conc(rJamais)).nb, 2, 'Alpha et Charlie n\'ont rien commencé');
    assert.equal((await conc(rPalier)).nb, 1); assert.equal((await conc(rExp)).nb, 1); assert.equal((await conc(rNon)).nb, 3);
    sql("update users set notif_emails_non_essentiels=1");
    const { bilan } = await moteur();
    const nb = notifs(idB).map(n => n.contenu);
    assert.ok(nb.some(x => /Bravo Aminata : 60 %/.test(x)), nb.join('|'));
    assert.ok(nb.some(x => /Plus que [3-5] jours \(\d\d\/\d\d\/\d{4}\)/.test(x)), nb.join('|'));
    assert.ok(bilan.plafonnes >= 1, 'Bravo avait 3 règles ce jour : plafond de 2');
    /* répétition : toutes les 5 jours, deux fois au plus */
    sql("delete from formation_relances_journal"); sql("delete from notifications where type='formation_relance'");
    const compte = () => journal("where regle_id=" + rNon + " and user_id=" + idA).length;
    await moteur({ regleId: rNon });
    assert.equal(compte(), 1, 'premier envoi');
    await moteur({ regleId: rNon, maintenant: Date.now() + 3 * JOUR });
    assert.equal(compte(), 1, 'trop tôt : moins de 5 jours');
    await moteur({ regleId: rNon, maintenant: Date.now() + 6 * JOUR });
    assert.equal(compte(), 2, 'deuxième envoi après 5 jours');
    await moteur({ regleId: rNon, maintenant: Date.now() + 20 * JOUR });
    assert.equal(compte(), 2, 'jamais plus de 2 envois');
  });

  await t.test('essai : le formateur s\'envoie la relance à lui seul, sans toucher au journal', async () => {
    const r = (await call(jarF, 'GET', '/api/formateur/relances')).data.regles[0];
    const avant = journal().length;
    const e = await call(jarF, 'POST', `/api/formateur/relances/${r.id}/test`, {});
    assert.equal(e.status, 200, JSON.stringify(e.data)); assert.deepEqual(e.data.envoye, ['notification']);
    const mienne = notifs(formateurId).pop();
    assert.match(mienne.titre + mienne.contenu, /Essai/);
    assert.equal(journal().length, avant);
    assert.equal((await call(jarA, 'POST', `/api/formateur/relances/${r.id}/test`, {})).status, 403);
  });

  await t.test('journal du formateur : filtres, et rien des autres', async () => {
    sql("delete from formation_relances_journal");
    sql("insert into formation_relances_journal (regle_id, libelle, formation_id, inscription_id, user_id, canal, statut, erreur, rang) values (0,'Dernière leçon (relance de base)',?,?,?,'notif','envoye',NULL,1)", fid, inscA, idA);
    sql("insert into formation_relances_journal (regle_id, libelle, formation_id, inscription_id, user_id, canal, statut, erreur, rang) values (5,'Mail',?,?,?,'email','echec','no_key',1)", fid, inscB, idB);
    sql("insert into formation_relances_journal (regle_id, libelle, formation_id, inscription_id, user_id, canal, statut, erreur, rang) values (5,'Mail',?,?,?,'email','ignore','pref',1)", fid, inscC, idC);
    const j = await call(jarF, 'GET', '/api/formateur/relances/journal');
    assert.equal(j.status, 200); assert.equal(j.data.total, 3); assert.ok(j.data.lignes[0].apprenant && j.data.lignes[0].regle && j.data.lignes[0].formation);
    const f = await call(jarF, 'GET', '/api/formateur/relances/journal?statut=echec');
    assert.ok(f.data.lignes.length === 1 && f.data.lignes.every(l => l.statut === 'echec'));
    assert.equal((await call(jarF, 'GET', `/api/formateur/relances/journal?formation_id=${fid2}`)).data.total, 0);
    assert.equal((await call(jarA, 'GET', '/api/formateur/relances/journal')).status, 403);
  });

  await t.test('modifier, suspendre, supprimer une règle ; l\'administration peut bloquer une règle abusive', async () => {
    const [a, b] = (await call(jarF, 'GET', '/api/formateur/relances')).data.regles;
    assert.equal((await call(jarF, 'PUT', `/api/formateur/relances/${a.id}`, { nom: 'Renommée', evenement: a.evenement, valeur: a.valeur, canal_notif: true, message: 'Texte modifié {prenom}' })).status, 200);
    assert.equal((await call(jarF, 'PATCH', `/api/formateur/relances/${a.id}`, { actif: false })).data.actif, false);
    sql("delete from formation_relances_journal"); sql("delete from notifications where type='formation_relance'");
    sql('update formation_inscriptions set derniere_activite_le=? where formation_id=?', sqlDate(Date.now() - 40 * JOUR), fid);
    const sans = await moteur({ regleId: a.id });
    assert.equal(sans.bilan.regles, 0, 'une règle suspendue ne part pas');
    /* l'administration (ici le compte formateur est administrateur) bloque ; un apprenant ne le peut pas */
    assert.equal((await call(jarA, 'GET', '/api/admin/formations/relances')).status, 403);
    assert.equal((await call(jarA, 'PATCH', `/api/admin/formations/relances/${b.id}`, { bloque: true })).status, 403);
    sql("insert into formation_relances_journal (regle_id, libelle, formation_id, inscription_id, user_id, canal, statut, rang) values (?,'Essai',?,?,?,'notif','envoye',9)", b.id, fid, inscA, idA);
    const vue = await call(jarF, 'GET', '/api/admin/formations/relances');
    assert.equal(vue.status, 200); assert.ok(vue.data.regles.length >= 2); assert.ok(vue.data.par_statut.length >= 1);
    assert.equal((await call(jarF, 'PATCH', `/api/admin/formations/relances/${b.id}`, { bloque: true, motif: 'Trop insistant' })).status, 200);
    assert.equal((await call(jarF, 'PUT', `/api/formateur/relances/${b.id}`, { nom: 'x', evenement: b.evenement, valeur: b.valeur, canal_notif: true, message: 'Texte {prenom}' })).status, 403, 'bloquée : le formateur ne peut plus la modifier');
    assert.equal((await moteur({ regleId: b.id })).bilan.regles, 0, 'une règle bloquée ne part pas');
    assert.equal((await call(jarF, 'PATCH', `/api/admin/formations/relances/${b.id}`, { bloque: false })).status, 200);
    assert.equal((await call(jarF, 'DELETE', `/api/formateur/relances/${a.id}`)).status, 200);
    assert.equal((await call(jarF, 'DELETE', `/api/formateur/relances/${a.id}`)).status, 404);
    assert.ok(journal().length === 0 || journal().every(l => l.libelle), 'le journal garde le nom des règles supprimées');
  });

  await t.test('limite de 20 règles par formateur', async () => {
    sql("delete from formation_relances_regles");
    for (let i = 0; i < 20; i++) assert.equal((await regle({ nom: 'R' + i, valeur: 10 + i })).status, 201);
    const trop = await regle({ nom: 'R21' });
    assert.equal(trop.status, 400); assert.match(trop.data.error, /limite/);
    sql("delete from formation_relances_regles");
  });

  await t.test('cron quotidien : relances de base (coupables par formation, journalisées, drapeau « dernière leçon » distinct du palier 75 %)', async () => {
    sql("delete from formation_relances_journal"); sql("delete from notifications where type='formation_relance'");
    const ajouter = async (titre) => {
      const m = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre })).data.id;
      const ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${m}/chapitres`, { titre: 'Ch ' + titre })).data.id;
      return (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'L ' + titre, type: 'texte', contenu_texte: '<p>x</p>' })).data.id;
    };
    const l1 = await ajouter('Un'), l2 = await ajouter('Deux');
    sql("update formation_inscriptions set avancement_pct=0, derniere_activite_le=?, relance_25_le=NULL, relance_50_le=NULL, relance_75_le=NULL, relance_derniere_le=NULL, relance_inactivite_le=NULL, relances_off=0 where formation_id=?", sqlDate(Date.now()), fid);
    /* Alpha a atteint 75 % (palier déjà notifié) ET n'a plus qu'une leçon : la « dernière ligne droite » doit partir malgré tout */
    sql("update formation_inscriptions set avancement_pct=75, relance_25_le=datetime('now'), relance_50_le=datetime('now'), relance_75_le=datetime('now') where id=?", inscA);
    sql("insert into formation_lecons_progression (inscription_id, lecon_id, termine) values (?,?,1)", inscA, l1);
    const cron = () => fetch(env.base + '/api/cron/formation-relances', { headers: { Authorization: 'Bearer cron_test_factice' } }).then(r => r.json());
    assert.equal((await fetch(env.base + '/api/cron/formation-relances')).status, 401);
    const r1 = await cron();
    assert.ok(r1.ok); assert.ok(r1.regles && !r1.regles.erreur, JSON.stringify(r1));
    assert.ok(notifs(idA).some(n => /Il ne vous reste qu'une leçon/.test(n.contenu)), notifs(idA).map(n => n.contenu).join('|'));
    assert.ok(journal("where regle_id=0 and user_id=" + idA).some(l => /Dernière leçon/.test(l.libelle)));
    assert.equal((await cron()).relancesEnvoyees, 0, 'une seconde exécution ne renvoie rien');
    /* la formation coupe ses relances de base ; l'apprenant qui a coupé les siennes n'en reçoit plus */
    assert.equal((await call(jarF, 'PATCH', `/api/formations/${fid}/relances-defaut`, { actif: false })).data.relances_defaut, false);
    assert.equal((await call(jarA, 'PATCH', `/api/formations/${fid}/relances-defaut`, { actif: true })).status, 403);
    sql("update formation_inscriptions set avancement_pct=55, relance_25_le=datetime('now'), relance_50_le=NULL where id=?", inscC);
    sql("delete from notifications where type='formation_relance'");
    assert.equal((await cron()).relancesEnvoyees, 0, 'relances de base coupées pour cette formation');
    await call(jarF, 'PATCH', `/api/formations/${fid}/relances-defaut`, { actif: true });
    await call(jarC, 'POST', `/api/formations/${fid}/relances/silence`, { off: true });
    assert.equal((await cron()).relancesEnvoyees, 0, 'Charlie a coupé ses rappels');
    await call(jarC, 'POST', `/api/formations/${fid}/relances/silence`, { off: false });
    assert.equal((await cron()).relancesEnvoyees, 1, 'rétabli : le palier de 50 % part');
    assert.ok(l2);
  });
});
