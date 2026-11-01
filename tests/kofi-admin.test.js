/* ===========================================================
   tests/kofi-admin.test.js — KOFFI, ASSISTANT DE L'ADMINISTRATEUR (2026-11-01)
   ===========================================================
   Règles vérifiées : réservé au rôle administrateur ; illimité (aucun décompte) ; chiffres issus d'un instantané calculé par le serveur (aucune donnée personnelle dans le prompt) ;
   « ouvrir » limité à la liste fermée de sections ; Koffi PROPOSE, rien ne part sans choix : « Je valide » (exécution au clic, ou à l'heure dite puis au clic) ou « Autonomie » (explicite dans la
   phrase, ou choisie sur la carte) ; programmation à l'heure de Paris, exécutée par la tâche planifiée ; une seule exécution possible ; revalidation à l'exécution (administrateur rétrogradé = échec) ;
   un autre administrateur ne voit ni ne décide des tâches d'un autre ; « Que sais-tu faire ? » gratuit ; panne / refus / réponse illisible sans effet.
   Lancer : node --test tests/kofi-admin.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const A = require('../server/kofi-admin');

let env;
const journalIA = path.join(os.tmpdir(), 'faux-ia-admin-' + process.pid + '.log');
test.before(async () => {
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.KOFI_FAUX_LOG = journalIA;
  process.env.CRON_SECRET = 'cron_test_factice';
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofi-admin');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalIA); } catch (e) { /* absent */ } });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

/* ── Fonctions pures : heure de Paris, lecture de la sortie du modèle ── */
test('Koffi admin — heure de Paris et sortie du modèle (fonctions pures)', () => {
  assert.equal(A.parisVersDate('2026-11-02 08:00').toISOString(), '2026-11-02T07:00:00.000Z', 'hiver : UTC+1');
  assert.equal(A.parisVersDate('2026-07-01 10:00').toISOString(), '2026-07-01T08:00:00.000Z', 'été : UTC+2');
  assert.equal(A.parisVersDate('2026-02-31 10:00'), null, 'jour inexistant');
  assert.equal(A.parisVersDate('2026-03-29 02:30'), null, 'heure inexistante (passage à l\'heure d\'été)');
  assert.equal(A.parisVersDate('demain 8h'), null);
  assert.equal(A.parisVersDate(''), null);
  const s = A.lireSortie('```json\n' + JSON.stringify({ action: 'proposer', message: 'ok', ouvrir: 'finances', taches: [
    { type: 'rappel', libelle: 'x', params: { texte: 'a' }, autonomie: true, quand: '2026-11-02 08:00' },
    { type: 'supprimer_compte', params: {} }, { type: 'rappel', params: {}, autonomie: 'oui' }, null] }) + '\n```');
  assert.equal(s.ouvrir, 'finances'); assert.equal(s.taches.length, 2, 'action inconnue écartée');
  assert.equal(s.taches[0].autonomie, true); assert.equal(s.taches[1].autonomie, null, 'autonomie : seulement true / false / null');
  assert.equal(A.lireSortie('{"action":"repondre","message":"x","ouvrir":"inventee"}').ouvrir, null, 'section hors liste');
  assert.equal(A.lireSortie('{"action":"repondre","message":"x","taches":[{"type":"rappel","params":{"texte":"a"}}]}').taches.length, 0, 'tâches ignorées sans action « proposer »');
  for (const mauvais of ['', 'bonjour', '{"action":"repondre"}', '{pas du json}', null]) assert.equal(A.lireSortie(mauvais), null, String(mauvais));
  const sys = A.systemePour(); assert.match(sys, /ASSISTANT_ADMIN/); assert.match(sys, /NE FAIS RIEN/); assert.match(sys, /DONNÉES/);
  assert.ok(A.SECTIONS.length > 40 && A.SECTION_IDS.has('kofi-budget') && A.SECTION_IDS.has('notifications-admin'));
});

test('Koffi admin — parcours complet', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 7);
  const call = env.call;
  const jar = {}; for (const n of ['Adm', 'Adm2', 'Usr', 'Dest']) jar[n] = H.cookieJar();
  const anon = H.cookieJar();
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const etat = j => call(j, 'GET', '/api/kofi/admin/etat');
  const dire = (j, texte, extra) => call(j, 'POST', '/api/kofi/admin/messages', { texte, ...extra });
  const decider = (j, id, body) => call(j, 'POST', `/api/kofi/admin/taches/${id}/decider`, body || {});
  const nbIA = () => { try { return fs.readFileSync(journalIA, 'utf8').trim().split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  const derniereTache = () => sql('select * from kofi_admin_taches order by id desc limit 1')[0];
  const cron = () => fetch(env.base + '/api/cron/kofi-admin-taches', { headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET } }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));
  const demain8h = () => { const d = new Date(Date.now() + 2 * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}_08:00`; };
  const notifsDe = (nom, type) => sql('select titre, contenu from notifications where user_id=? and type=?', uid(nom), type);

  await t.test('setup — administrateurs, destinataire, réserve IA', async () => {
    await H.creerFormateur(env, jar.Adm, rnd, 'Adm');
    await H.creerFormateur(env, jar.Adm2, rnd, 'Adm2');
    await H.creerApprenant(env, jar.Usr, rnd, 'Usr');
    await H.creerApprenant(env, jar.Dest, rnd, 'Dest');
    assert.equal((await call(jar.Adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
    sql("INSERT OR IGNORE INTO kofi_majorite (user_id, confirme_le, version) VALUES (?, datetime('now'), 'test')", uid('Adm'));
    sql("INSERT OR IGNORE INTO kofi_majorite (user_id, confirme_le, version) VALUES (?, datetime('now'), 'test')", uid('Adm2'));
    sql("INSERT OR IGNORE INTO kofi_majorite (user_id, confirme_le, version) VALUES (?, datetime('now'), 'test')", uid('Usr'));
  });

  await t.test('accès : visiteur 401, compte ordinaire 403, zéro appel IA ; l\'administrateur voit son état, illimité', async () => {
    assert.equal((await etat(anon)).status, 401);
    assert.equal((await dire(anon, 'STATS')).status, 401);
    const u = await etat(jar.Usr); assert.equal(u.status, 403); assert.equal(u.data.code, 'admin_requis');
    assert.equal((await dire(jar.Usr, 'STATS')).status, 403);
    assert.equal((await call(jar.Usr, 'POST', '/api/kofi/admin/taches/1/decider', {})).status, 403);
    assert.equal((await cron()).status, 200);
    assert.equal((await fetch(env.base + '/api/cron/kofi-admin-taches')).status, 401, 'la tâche planifiée exige le secret');
    assert.equal(nbIA(), 0);
    const e = await etat(jar.Adm);
    assert.equal(e.status, 200); assert.equal(e.data.etat, 'utilisable'); assert.equal(e.data.portefeuille.illimite, true);
    assert.ok(e.data.sections.length > 40); assert.equal(e.data.a_valider, 0); assert.deepEqual(e.data.taches, []);
  });

  await t.test('chiffres : réponse d\'après l\'instantané du serveur ; aucune donnée personnelle dans le prompt ; illimité', async () => {
    const reels = sql("select count(*) n from users where COALESCE(compte_masque,0)=0 and (is_demo is null or is_demo=0) and nom != 'Compte supprimé' and role != 'administrateur'")[0].n;
    const r = await dire(jar.Adm, 'Combien de comptes ? STATS');
    assert.equal(r.status, 200);
    assert.match(r.data.message.contenu, new RegExp('Il y a ' + reels + ' comptes'), 'le chiffre vient de la base : ' + r.data.message.contenu);
    assert.equal(r.data.portefeuille.illimite, true);
    assert.equal(sql('select categorie from kofi_usage where user_id=? order by id desc limit 1', uid('Adm'))[0].categorie, 'admin_illimite');
    const journal = fs.readFileSync(journalIA, 'utf8');
    assert.match(journal, /comptes_total/); assert.match(journal, /ASSISTANT_ADMIN/);
    assert.ok(!/@example\.com/.test(journal), 'aucune adresse e-mail transmise au modèle');
    assert.ok(!new RegExp(H.compte(rnd, 'Usr', 'utilisateur').email).test(journal));
  });

  await t.test('ouvrir un module : liste fermée', async () => {
    const r = await dire(jar.Adm, 'Ouvre OUVRIR:finances');
    assert.deepEqual(r.data.message.ouvrir, { section: 'finances', libelle: 'Finances' });
    const r2 = await dire(jar.Adm, 'OUVRIR:module_inventé');
    assert.equal(r2.data.message.ouvrir, null);
  });

  await t.test('notification : Koffi propose, RIEN ne part avant la validation ; « Je valide » exécute une seule fois', async () => {
    const avant = sql('select count(*) n from notifications_admin')[0].n;
    const id = uid('Dest');
    const r = await dire(jar.Adm, `NOTIF:Rencontre_ce_samedi CORPS:Venez_nombreux USER:${id}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.message.taches.length, 1);
    const carte = r.data.message.taches[0];
    assert.equal(carte.statut, 'proposee'); assert.equal(carte.type, 'envoyer_notification'); assert.equal(carte.destinataires, 1); assert.equal(carte.autonomie_possible, true);
    assert.match(carte.detail, /1 compte précis/);
    assert.equal(sql('select count(*) n from notifications_admin')[0].n, avant, 'aucun envoi sans validation');
    const ok = await decider(jar.Adm, carte.id, { mode: 'a_valider' });
    assert.equal(ok.status, 200); assert.equal(ok.data.tache.statut, 'executee'); assert.equal(ok.data.tache.resultat.envoyes, 1);
    assert.equal(sql('select count(*) n from notifications_admin')[0].n, avant + 1);
    assert.equal(sql('select count(*) n from notifications where user_id=? and titre like ?', id, '%Rencontre%')[0].n, 1, 'le destinataire a reçu la notification');
    assert.equal((await decider(jar.Adm, carte.id, {})).status, 409, 'une seule exécution possible');
    /* L'historique de la conversation montre l'état à jour de la tâche. */
    assert.equal((await etat(jar.Adm)).data.taches.find(x => x.id === carte.id).statut, 'executee');
  });

  await t.test('cible invalide ou texte manquant : aucune tâche, note claire ; aperçu de masse sans envoi', async () => {
    const n0 = sql('select count(*) n from kofi_admin_taches')[0].n;
    const r = await dire(jar.Adm, 'NOTIF:Titre_seul CORPS:Message');   /* aucune cible */
    assert.match(r.data.message.contenu, /à qui écrire/);
    assert.equal(sql('select count(*) n from kofi_admin_taches')[0].n, n0);
    const m = await dire(jar.Adm, 'NOTIF:Annonce CORPS:Bonjour_a_tous ROLES:utilisateur,initiative,collectivite');
    const carte = m.data.message.taches[0];
    assert.ok(carte.destinataires > 1, 'aperçu : plusieurs comptes concernés (' + carte.destinataires + ')');
    assert.equal(carte.statut, 'proposee');
    assert.equal((await call(jar.Adm, 'POST', `/api/kofi/admin/taches/${carte.id}/annuler`)).status, 200);
    assert.equal((await decider(jar.Adm, carte.id, {})).status, 409, 'annulée : plus de décision possible');
    assert.equal(sql('select count(*) n from notifications_admin where titre=?', 'Annonce')[0].n, 0, 'jamais envoyée');
  });

  await t.test('autonomie explicite dans la phrase : exécutée tout de suite, sans autre clic ; programmée si une heure est donnée', async () => {
    const r = await dire(jar.Adm, 'RAPPEL:Appeler_le_notaire AUTO:oui');
    assert.equal(r.data.message.taches[0].statut, 'executee');
    assert.ok(notifsDe('Adm', 'kofi_admin').some(n => /notaire/.test(n.contenu)), 'le rappel est dans la cloche');
    const p = await dire(jar.Adm, 'RAPPEL:Relire_le_budget AUTO:oui QUAND:' + demain8h());
    const carte = p.data.message.taches[0];
    assert.equal(carte.statut, 'planifiee'); assert.equal(carte.mode, 'autonome'); assert.match(carte.quand_paris, /08/);
    assert.equal(new Date(carte.quand_utc).getUTCHours() === 7 || new Date(carte.quand_utc).getUTCHours() === 6, true, 'heure de Paris convertie en UTC');
    assert.ok(!notifsDe('Adm', 'kofi_admin').some(n => /budget/.test(n.contenu)), 'pas avant l\'heure');
    assert.equal((await cron()).data.executees, 0, 'l\'heure n\'est pas venue');
    /* L'heure vient : la tâche planifiée l'exécute seule. */
    sql('update kofi_admin_taches set planifiee_le=? where id=?', new Date(Date.now() - 60000).toISOString().slice(0, 19).replace('T', ' '), carte.id);
    const c = await cron(); assert.equal(c.status, 200); assert.equal(c.data.executees, 1);
    assert.equal(sql('select statut from kofi_admin_taches where id=?', carte.id)[0].statut, 'executee');
    assert.ok(notifsDe('Adm', 'kofi_admin').some(n => /budget/.test(n.contenu)));
    assert.equal((await cron()).data.executees, 0, 'jamais deux fois');
  });

  await t.test('« Je valide » avec une heure : prévenu à l\'heure dite, rien ne part sans le clic', async () => {
    const dest = uid('Dest');
    const p = await dire(jar.Adm, `NOTIF:Reunion CORPS:Demain_a_8h USER:${dest} AUTO:non QUAND:${demain8h()}`);
    const carte = p.data.message.taches[0];
    assert.equal(carte.statut, 'proposee', 'prêt mais pas programmé : l\'administrateur choisit');
    assert.equal((await decider(jar.Adm, carte.id, { mode: 'a_valider', quand: demain8h().replace('_', ' ') })).data.tache.statut, 'planifiee_validation');
    sql('update kofi_admin_taches set planifiee_le=? where id=?', new Date(Date.now() - 60000).toISOString().slice(0, 19).replace('T', ' '), carte.id);
    const c = await cron(); assert.equal(c.data.a_valider, 1); assert.equal(c.data.executees, 0);
    assert.equal(sql('select count(*) n from notifications where user_id=? and titre like ?', dest, '%Reunion%')[0].n, 0, 'rien envoyé sans validation');
    assert.ok(notifsDe('Adm', 'kofi_admin').some(n => /attend votre validation/.test(n.titre)));
    const e = await etat(jar.Adm); assert.equal(e.data.a_valider, 1);
    const ok = await decider(jar.Adm, carte.id, {});
    assert.equal(ok.data.tache.statut, 'executee');
    assert.equal(sql('select count(*) n from notifications where user_id=? and titre like ?', dest, '%Reunion%')[0].n, 1);
  });

  await t.test('carte « Autonomie ou pas » : choix sur la carte, heure passée refusée, heure lointaine refusée', async () => {
    const p = await dire(jar.Adm, 'RAPPEL:Verifier_les_comptes');   /* ni autonomie ni heure : le serveur présente les deux boutons */
    const carte = p.data.message.taches[0];
    assert.equal(carte.statut, 'proposee'); assert.equal(carte.quand_utc, null);
    const passe = await decider(jar.Adm, carte.id, { mode: 'autonome', quand: '2020-01-01 08:00' });
    assert.equal(passe.status, 400); assert.equal(passe.data.code, 'heure_passee');
    assert.equal((await decider(jar.Adm, carte.id, { mode: 'autonome', quand: '2099-01-01 08:00' })).status, 400, 'au-delà de 90 jours');
    assert.equal((await decider(jar.Adm, carte.id, { mode: 'autonome', quand: 'n importe quoi' })).status, 400);
    const ok = await decider(jar.Adm, carte.id, { mode: 'autonome', quand: demain8h().replace('_', ' ') });
    assert.equal(ok.status, 200); assert.equal(ok.data.tache.statut, 'planifiee'); assert.equal(ok.data.tache.mode, 'autonome');
    assert.equal((await call(jar.Adm, 'POST', `/api/kofi/admin/taches/${carte.id}/annuler`)).status, 200, 'une tâche programmée peut être annulée');
    sql('update kofi_admin_taches set planifiee_le=? where id=?', '2020-01-01 00:00:00', carte.id);
    assert.equal((await cron()).data.executees, 0, 'annulée : jamais exécutée');
    /* Heure passée dans la phrase + autonomie : jamais exécutée, note claire. */
    const n = await dire(jar.Adm, 'RAPPEL:Trop_tard AUTO:oui QUAND:2020-01-01_08:00');
    assert.match(n.data.message.contenu, /déjà passée|pas valable/); assert.equal(n.data.message.taches[0].statut, 'proposee');
  });

  await t.test('un autre administrateur ne voit ni ne décide ; un administrateur rétrogradé fait échouer la tâche programmée', async () => {
    const p = await dire(jar.Adm, 'RAPPEL:Confidentiel AUTO:oui QUAND:' + demain8h());
    const carte = p.data.message.taches[0];
    assert.equal((await decider(jar.Adm2, carte.id, {})).status, 404);
    assert.equal((await call(jar.Adm2, 'POST', `/api/kofi/admin/taches/${carte.id}/annuler`)).status, 409);
    assert.ok(!(await etat(jar.Adm2)).data.taches.some(x => x.id === carte.id));
    sql("update users set role='utilisateur' where id=?", uid('Adm'));
    sql('update kofi_admin_taches set planifiee_le=? where id=?', new Date(Date.now() - 60000).toISOString().slice(0, 19).replace('T', ' '), carte.id);
    await cron();
    const t2 = sql('select statut, erreur from kofi_admin_taches where id=?', carte.id)[0];
    assert.equal(t2.statut, 'echec'); assert.match(t2.erreur, /plus administrateur/);
    sql("update users set role='administrateur' where id=?", uid('Adm'));
  });

  await t.test('« Que sais-tu faire ? » gratuit ; panne, refus, réponse illisible : aucun effet ; conversation supprimable', async () => {
    const avantIA = nbIA();
    const c = await dire(jar.Adm2, 'Que sais-tu faire ?');
    assert.equal(c.status, 200); assert.match(c.data.message.contenu, /assistant d'administrateur/); assert.equal(nbIA(), avantIA, 'aucun appel IA');
    const n0 = sql('select count(*) n from kofi_admin_taches')[0].n;
    assert.equal((await dire(jar.Adm2, 'PANNEFAUSSE')).status, 503);
    assert.equal((await dire(jar.Adm2, 'LIMITEFAUSSE')).status, 429);
    const refus = await dire(jar.Adm2, 'REFUSFAUX'); assert.equal(refus.status, 200); assert.match(refus.data.message.contenu, /ne peux pas/);
    const ill = await dire(jar.Adm2, 'JSONFAUX'); assert.match(ill.data.message.contenu, /pas bien compris/);
    assert.equal(sql('select count(*) n from kofi_admin_taches')[0].n, n0);
    assert.equal((await dire(jar.Adm2, 'x'.repeat(5000))).data.code, 'trop_long');
    const e = await etat(jar.Adm2); assert.ok(e.data.conversation && e.data.conversation.messages.length >= 2);
    assert.equal((await call(jar.Adm, 'DELETE', `/api/kofi/admin/conversations/${e.data.conversation.id}`)).status, 404, 'pas la conversation d\'un autre');
    assert.equal((await call(jar.Adm2, 'DELETE', `/api/kofi/admin/conversations/${e.data.conversation.id}`)).status, 200);
    const apres = (await etat(jar.Adm2)).data.conversation; assert.ok(!apres || apres.id !== e.data.conversation.id, 'la conversation supprimée a disparu');
  });

  await t.test('échéances « en passant » : la cloche de n\'importe quel compte déclenche une tâche arrivée à échéance, une seule fois, sans tâche planifiée à la minute', async () => {
    const ancien = sql("select count(*) n from notifications where user_id=? and type='kofi_admin'", uid('Adm'))[0].n;
    const echu = new Date(Date.now() - 60000).toISOString().slice(0, 19).replace('T', ' ');
    sql("insert into kofi_admin_taches (admin_id, type, libelle, params_json, mode, statut, planifiee_le) values (?,?,?,?,?,?,?)", uid('Adm'), 'rappel', 'Rappel', JSON.stringify({ texte: 'Vérifier les paiements' }), 'autonome', 'planifiee', echu);
    const id = derniereTache().id;
    assert.equal((await call(jar.Usr, 'GET', '/api/notifications')).status, 200);
    const apres = sql('select statut from kofi_admin_taches where id=?', id)[0];
    assert.equal(apres.statut, 'executee', 'exécutée par le passage de la cloche d\'un simple membre');
    assert.equal(sql("select count(*) n from notifications where user_id=? and type='kofi_admin'", uid('Adm'))[0].n, ancien + 1);
    assert.equal((await call(jar.Usr, 'GET', '/api/notifications')).status, 200);
    assert.equal(sql("select count(*) n from notifications where user_id=? and type='kofi_admin'", uid('Adm'))[0].n, ancien + 1, 'jamais deux fois');
  });
});
