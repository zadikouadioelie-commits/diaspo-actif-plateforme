/* ===========================================================
   tests/relance-messages.test.js — relance par e-mail d'un message non lu depuis 3 jours (2026-11-04)
   ===========================================================
   Seuls les messages NON LUS d'une vraie personne ; fenêtre de 3 à 14 jours ; un e-mail par personne et par jour regroupant ses conversations ;
   jamais deux fois pour le même message ; e-mails non essentiels respectés ; texte du message absent de l'e-mail ; exécution « à blanc » sans interrupteur ;
   lien de désabonnement ; route de cron protégée.
   Intégration : vrai serveur + base SQLite isolée ; le moteur est appelé directement avec un faux envoi d'e-mails et une horloge réglable.
   Lancer : node --test tests/relance-messages.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');
const Relance = require('../server/relance-messages');
const { signAuthToken } = require('../server/auth');

let env;
test.before(async () => {
  process.env.CRON_SECRET = 'cron_test_factice';
  env = await H.demarrer('relance-messages');
});
test.after(() => { if (env) env.stop(); });

function base() {
  const sq = new H.DatabaseSync(env.dbPath);
  sq.exec('PRAGMA busy_timeout=5000');
  return { prepare(req) { const s = sq.prepare(req); return { get: async (...a) => s.get(...a), all: async (...a) => s.all(...a), run: async (...a) => s.run(...a) }; }, sq };
}
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
const JOUR = 86400000;
const il_y_a = (j) => new Date(Date.now() - j * JOUR).toISOString().slice(0, 19).replace('T', ' ');

test('relance des messages non lus', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const noms = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
  const ids = {};
  for (const n of noms) { await H.creerApprenant(env, H.cookieJar(), rnd, n); ids[n] = sql('select id from users where email=?', H.compte(rnd, n, 'utilisateur').email)[0].id; }
  const mesIds = new Set(Object.values(ids));
  const emailDe = n => H.compte(rnd, n, 'utilisateur').email;
  const nomAffichage = async (id) => Object.keys(ids).find(n => ids[n] === Number(id)) + '-affiche';
  const conv = (a, b) => Number(sql('insert into conversations (user1_id, user2_id) values (?,?)', a, b).lastInsertRowid);
  const msg = (c, exp, jours, extra = {}) => Number(sql('insert into messages (conversation_id, sender_id, contenu, type, lu, created_at) values (?,?,?,?,?,?)', c, exp, extra.contenu || 'TEXTE-SECRET-DU-MESSAGE', 'text', extra.lu || 0, il_y_a(jours)).lastInsertRowid);
  const mine = m => m.to.includes(`-${rnd}-`);
  const moteur = async (opts = {}) => {
    const db = base(); const envoyes = [];
    const bilan = await Relance.relancerMessagesNonLus({
      db, signAuthToken, nomAffichage, origine: 'https://exemple.test',
      sendEmail: async (m) => { if (mine(m)) envoyes.push(m); return opts.echec && mine(m) ? { ok: false, error: 'panne' } : { ok: true, id: 'x' }; },
      maintenant: opts.maintenant || Date.now(), envoiReel: opts.envoiReel === undefined ? true : opts.envoiReel,
    });
    db.sq.close();
    return { bilan, envoyes };
  };
  const journal = () => sql('select * from messages_relances_email order by id').filter(j => mesIds.has(Number(j.user_id)));

  await t.test('trop récent, trop ancien ou déjà lu : aucun e-mail', async () => {
    const c1 = conv(ids.Alpha, ids.Bravo);
    msg(c1, ids.Bravo, 1);                 // 1 jour : pas encore
    msg(c1, ids.Bravo, 20);                // 20 jours : hors fenêtre
    msg(c1, ids.Bravo, 5, { lu: 1 });      // lu
    msg(c1, ids.Alpha, 5);                 // écrit PAR Alpha : concerne Bravo (légitime), jamais Alpha
    const { envoyes } = await moteur();
    assert.equal(envoyes.filter(m => m.to === emailDe('Alpha')).length, 0, 'Alpha n’a rien à lire : son seul message en attente est celui qu’elle a écrit');
    assert.equal(envoyes.length, 1, 'seule Bravo est prévenue, pour le message d’Alpha');
    assert.equal(envoyes[0].to, emailDe('Bravo'));
  });

  await t.test('un message non lu depuis 4 jours : un e-mail sans le texte du message, lien vers la conversation', async () => {
    const c = conv(ids.Alpha, ids.Charlie);
    msg(c, ids.Charlie, 4);
    const { bilan, envoyes } = await moteur();
    assert.equal(envoyes.length, 1);
    assert.equal(envoyes[0].to, emailDe('Alpha'));
    assert.match(envoyes[0].subject, /Charlie-affiche vous a écrit/);
    assert.ok(!envoyes[0].html.includes('TEXTE-SECRET-DU-MESSAGE'), 'le texte du message ne doit jamais figurer');
    assert.ok(envoyes[0].html.includes(`/messagerie.html?conv=${c}`));
    assert.ok(envoyes[0].html.includes('/api/relances-messages/stop?t='));
    assert.equal(journal().filter(j => Number(j.user_id) === ids.Alpha).length, 1);
  });

  await t.test('jamais deux fois pour le même message, même le lendemain', async () => {
    const { envoyes } = await moteur({ maintenant: Date.now() + JOUR });
    assert.equal(envoyes.length, 0);
    assert.equal(journal().filter(j => Number(j.user_id) === ids.Alpha).length, 1);
  });

  await t.test('un seul e-mail par jour ; la 2e conversation attend le lendemain, puis un nouveau message relance de nouveau', async () => {
    const c = conv(ids.Alpha, ids.Echo);
    msg(c, ids.Echo, 5);
    let r = await moteur();                                   // Alpha vient d'être relancée : on reprend demain
    assert.equal(r.envoyes.length, 0);
    r = await moteur({ maintenant: Date.now() + JOUR });       // le lendemain : seule la conversation d'Echo (Charlie est déjà faite)
    assert.equal(r.envoyes.length, 1);
    assert.match(r.envoyes[0].subject, /Echo-affiche vous a écrit/);
    assert.ok(!r.envoyes[0].html.includes('Charlie-affiche'));
  });

  await t.test('plusieurs conversations en attente : un seul e-mail qui les regroupe', async () => {
    const cA = conv(ids.Delta, ids.Bravo), cB = conv(ids.Delta, ids.Charlie);
    msg(cA, ids.Bravo, 4); msg(cB, ids.Charlie, 6);
    const r = await moteur({ maintenant: Date.now() + 2 * JOUR });
    const pourDelta = r.envoyes.filter(m => m.to === emailDe('Delta'));
    assert.equal(pourDelta.length, 1);
    assert.match(pourDelta[0].subject, /2 messages en attente/);
    assert.ok(pourDelta[0].html.includes('Bravo-affiche') && pourDelta[0].html.includes('Charlie-affiche'));
  });

  await t.test('e-mails non essentiels coupés : rien n’est envoyé, la personne est consignée « ignore » et jamais relancée plus tard', async () => {
    sql("update users set notif_emails_non_essentiels=0 where id=?", ids.Bravo);
    const c = conv(ids.Bravo, ids.Echo);
    msg(c, ids.Echo, 4);
    let r = await moteur({ maintenant: Date.now() + 3 * JOUR });
    assert.equal(r.envoyes.filter(m => m.to === emailDe('Bravo')).length, 0);
    assert.ok(journal().some(j => Number(j.user_id) === ids.Bravo && j.statut === 'ignore'));
    sql("update users set notif_emails_non_essentiels=1 where id=?", ids.Bravo);
    r = await moteur({ maintenant: Date.now() + 4 * JOUR });
    assert.equal(r.envoyes.filter(m => m.to === emailDe('Bravo')).length, 0, 'ce message-là a déjà été traité');
  });

  await t.test('exclusions : message automatique, compte officiel, conversation archivée ou supprimée', async () => {
    const quatre = await Promise.all(['A', 'B', 'C', 'D'].map(async (x) => { await H.creerApprenant(env, H.cookieJar(), rnd, 'Excl' + x); return sql('select id from users where email=?', H.compte(rnd, 'Excl' + x, 'utilisateur').email)[0].id; }));
    const [dest, officiel, autoRep, humain] = quatre;
    sql("update users set is_official=1 where id=?", officiel);
    const cOff = conv(dest, officiel); msg(cOff, officiel, 4);
    const cAuto = conv(dest, autoRep); const mAuto = msg(cAuto, autoRep, 4);
    sql("insert into messages_auto_envois (owner_user_id, user_id, declencheur, message_id) values (?,?,?,?)", autoRep, dest, 'bienvenue', mAuto);
    const cArch = conv(dest, humain); msg(cArch, humain, 4); sql('update conversations set archive_u1=1 where id=?', cArch);
    /* Témoin positif : la même expéditrice « humaine » écrit à une autre personne, non archivée — celle-là DOIT être prévenue. */
    await H.creerApprenant(env, H.cookieJar(), rnd, 'Temoin');
    const temoin = sql('select id from users where email=?', H.compte(rnd, 'Temoin', 'utilisateur').email)[0].id;
    mesIds.add(temoin);
    msg(conv(temoin, humain), humain, 4);
    const r = await moteur({ maintenant: Date.now() + JOUR });
    assert.equal(r.envoyes.filter(m => m.to === H.compte(rnd, 'Temoin', 'utilisateur').email).length, 1, 'le témoin doit être relancé');
    const pourDest = r.envoyes.filter(m => m.to === H.compte(rnd, 'ExclA', 'utilisateur').email);
    assert.equal(pourDest.length, 0, 'e-mail inattendu : ' + JSON.stringify(pourDest.map(m => m.subject)) + ' — messages : ' + JSON.stringify(sql('select m.id, m.sender_id, m.conversation_id, m.created_at from messages m join conversations c on c.id=m.conversation_id where c.user1_id=? or c.user2_id=?', dest, dest)));
  });

  await t.test('sans interrupteur : exécution à blanc — rien envoyé, rien consigné', async () => {
    const c = conv(ids.Charlie, ids.Echo); msg(c, ids.Echo, 4);
    const avant = journal().length;
    const r = await moteur({ envoiReel: false, maintenant: Date.now() + JOUR });
    assert.equal(r.bilan.a_blanc, true); assert.equal(r.envoyes.length, 0);
    assert.ok(r.bilan.personnes >= 1);
    assert.equal(journal().length, avant);
  });

  await t.test('envoi en échec : le verrou est retiré, la relance repart au prochain passage', async () => {
    await H.creerApprenant(env, H.cookieJar(), rnd, 'Panne'); await H.creerApprenant(env, H.cookieJar(), rnd, 'Panne2');
    const p = sql('select id from users where email=?', H.compte(rnd, 'Panne', 'utilisateur').email)[0].id;
    const q = sql('select id from users where email=?', H.compte(rnd, 'Panne2', 'utilisateur').email)[0].id;
    const c = conv(p, q); msg(c, q, 4);
    let r = await moteur({ echec: true });
    assert.equal(r.bilan.echecs, 1);
    assert.equal(journal().filter(j => Number(j.user_id) === p).length, 0);
    r = await moteur();
    assert.equal(r.envoyes.filter(m => m.to === H.compte(rnd, 'Panne', 'utilisateur').email).length, 1);
  });

  await t.test('lien de désabonnement : coupe les e-mails non essentiels ; lien invalide refusé', async () => {
    const lien = Relance.lienDesinscription('http://x', signAuthToken, ids.Alpha);
    const chemin = lien.replace('http://x', '');
    const r = await fetch(env.base + chemin);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /C(&#39;|')est noté/);
    assert.equal(sql('select notif_emails_non_essentiels as n from users where id=?', ids.Alpha)[0].n, 0);
    const mauvais = await fetch(env.base + '/api/relances-messages/stop?t=n-importe-quoi');
    assert.match(await mauvais.text(), /Lien invalide/);
  });

  await t.test('route de cron : refusée sans le secret, à blanc avec', async () => {
    const sans = await fetch(env.base + '/api/cron/messages-relances');
    assert.equal(sans.status, 401);
    const avec = await fetch(env.base + '/api/cron/messages-relances', { headers: { Authorization: 'Bearer cron_test_factice' } });
    assert.equal(avec.status, 200);
    assert.equal((await avec.json()).a_blanc, true);
  });
});
