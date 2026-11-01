/* ===========================================================
   tests/message-securise.test.js — Message sécurisé (2026-11-01)
   ===========================================================
   Un vrai serveur contre une COPIE isolée de la base. Vérifie les promesses faites à l'utilisateur :
   • le texte n'est JAMAIS en clair dans la base (ni avant, ni après l'ouverture) ;
   • seul le destinataire, avec SON DS-ID, peut lire ; 3 erreurs → blocage 5 minutes (par compte) ;
   • lisible 2 minutes (la fin est fixée à la première remise, jamais prolongée), puis détruit pour de bon ;
   • jamais ouvert → détruit après 30 jours ; supprimé par l'expéditeur → détruit ; modification interdite ;
   • le texte chiffré est lié à son message (copié ailleurs, il ne se déchiffre plus).

   Lancer : node --test tests/message-securise.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const H = require('./_formation-harness');
const MS = require('../server/message-securise');

let env;
test.before(async () => { env = await H.demarrer('msgsecur'); });
test.after(() => { if (env) env.stop(); });

const SECRET = 'SECRET-ZEBRE-8841';
const DS_ID = 'ABCDE12345';

/* Le texte est-il quelque part dans la base ou son journal (WAL) ? */
function dansLaBase(motif) {
  for (const f of [env.dbPath, env.dbPath + '-wal']) {
    if (fs.existsSync(f) && fs.readFileSync(f).includes(Buffer.from(motif, 'utf8'))) return true;
  }
  return false;
}
const sql = (fn) => { const d = new H.DatabaseSync(env.dbPath); try { return fn(d); } finally { d.close(); } };

test('message sécurisé : chiffrement, DS-ID, fenêtre de 2 minutes, destruction', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarA = H.cookieJar(), jarB = H.cookieJar(), jarC = H.cookieJar();
  const a = await H.creerApprenant(env, jarA, rnd, 'Expediteur');
  const b = await H.creerApprenant(env, jarB, rnd, 'Destinataire');
  await H.creerApprenant(env, jarC, rnd, 'Tiers');
  const c = (jar, m, u, body) => env.call(jar, m, u, body);
  const idDe = (email) => sql(d => d.prepare('SELECT id FROM users WHERE email=?').get(email).id);
  const idA = idDe(a.email), idB = idDe(b.email);
  sql(d => d.prepare('UPDATE users SET ds_id=? WHERE id=?').run(DS_ID, idB));
  /* conversation « vitrine » : ouverte sans demande de contact préalable (la règle de contact n'est pas l'objet de ce test) */
  const conv = sql(d => Number(d.prepare("INSERT INTO conversations (user1_id, user2_id, contexte) VALUES (?, ?, 'vitrine')").run(idA, idB).lastInsertRowid));
  let mid;

  await t.test('envoi : le marqueur seul est dans messages, le texte est introuvable en clair dans la base', async () => {
    const r = await c(jarA, 'POST', `/api/conversations/${conv}/messages-securises`, { contenu: SECRET });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    mid = r.data.message.id;
    assert.equal(r.data.message.type, 'securise');
    assert.equal(r.data.message.contenu, MS.MARQUEUR);
    assert.ok(!JSON.stringify(r.data).includes(SECRET), 'la réponse d\'envoi ne contient pas le texte');
    const ligne = sql(d => d.prepare('SELECT * FROM messages_securises WHERE message_id=?').get(mid));
    assert.ok(ligne.chiffre && ligne.iv && ligne.tag);
    assert.equal(ligne.destinataire_id, idB);
    assert.equal(dansLaBase(MS.MARQUEUR), true, 'témoin : la recherche dans la base trouve bien ce qui y est');
    assert.equal(dansLaBase(SECRET), false, 'jamais en clair dans la base');
    assert.equal(dansLaBase(Buffer.from(SECRET).toString('base64')), false);
  });

  await t.test('validations : vide, trop long, conversation étrangère', async () => {
    assert.equal((await c(jarA, 'POST', `/api/conversations/${conv}/messages-securises`, { contenu: '   ' })).status, 400);
    assert.equal((await c(jarA, 'POST', `/api/conversations/${conv}/messages-securises`, { contenu: 'x'.repeat(4001) })).status, 400);
    assert.equal((await c(jarC, 'POST', `/api/conversations/${conv}/messages-securises`, { contenu: 'intrus' })).status, 403);
    assert.equal((await c(null, 'POST', `/api/conversations/${conv}/messages-securises`, { contenu: 'x' })).status, 401);
  });

  await t.test('la liste de la conversation ne montre que l\'état, jamais le texte', async () => {
    const rb = await c(jarB, 'GET', `/api/conversations/${conv}/messages`);
    const mb = rb.data.messages.find(m => m.id === mid);
    assert.equal(mb.securise.statut, 'ferme');
    assert.equal(mb.securise.est_destinataire, true);
    assert.ok(!JSON.stringify(rb.data).includes(SECRET));
    const ra = await c(jarA, 'GET', `/api/conversations/${conv}/messages`);
    assert.equal(ra.data.messages.find(m => m.id === mid).securise.est_destinataire, false);
    assert.ok(!JSON.stringify(ra.data).includes('iv') || !/"chiffre"/.test(JSON.stringify(ra.data)), 'aucun matériel chiffré exposé');
  });

  await t.test('seul le destinataire ouvre : l\'expéditeur et un tiers reçoivent « introuvable »', async () => {
    assert.equal((await c(jarA, 'POST', `/api/messages-securises/${mid}/ouvrir`, { ds_id: DS_ID })).status, 404);
    assert.equal((await c(jarC, 'POST', `/api/messages-securises/${mid}/ouvrir`, { ds_id: DS_ID })).status, 404);
    assert.equal((await c(null, 'POST', `/api/messages-securises/${mid}/ouvrir`, { ds_id: DS_ID })).status, 401);
    assert.equal((await c(jarC, 'GET', `/api/messages-securises/${mid}/etat`)).status, 404);
  });

  await t.test('mauvais DS-ID : 2 essais restants, puis 1, puis blocage 5 minutes (même avec le bon code)', async () => {
    const r1 = await c(jarB, 'POST', `/api/messages-securises/${mid}/ouvrir`, { ds_id: 'FAUX' });
    assert.equal(r1.status, 403); assert.equal(r1.data.essais_restants, 2);
    const r2 = await c(jarB, 'POST', `/api/messages-securises/${mid}/ouvrir`, { ds_id: 'ENCORE-FAUX' });
    assert.equal(r2.status, 403); assert.equal(r2.data.essais_restants, 1);
    assert.equal((await c(jarB, 'POST', `/api/messages-securises/${mid}/ouvrir`, { ds_id: '' })).status, 429, 'troisième erreur : verrouillé');
    assert.equal((await c(jarB, 'POST', `/api/messages-securises/${mid}/ouvrir`, { ds_id: DS_ID })).status, 429, 'verrouillé même avec le bon code');
    assert.equal(sql(d => d.prepare('SELECT ouvert_le FROM messages_securises WHERE message_id=?').get(mid).ouvert_le), null, 'rien n\'a été ouvert');
    sql(d => d.prepare('UPDATE messages_securises_verrous SET verrou_jusqua=NULL, essais=0 WHERE user_id=?').run(idB));   // simule les 5 minutes écoulées
  });

  await t.test('bon DS-ID (saisi avec espaces, tirets et minuscules) : texte remis, 2 minutes, filigrane, expéditeur prévenu', async () => {
    const r = await c(jarB, 'POST', `/api/messages-securises/${mid}/ouvrir`, { ds_id: ' abcde-12345 ' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.contenu, SECRET);
    assert.ok(r.data.secondes_restantes <= 120 && r.data.secondes_restantes >= 117, 'fenêtre de 2 minutes : ' + r.data.secondes_restantes);
    assert.match(r.data.filigrane, new RegExp(`n°${mid}$`));
    assert.match(r.data.filigrane, /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    assert.equal(dansLaBase(SECRET), false, 'toujours pas en clair dans la base après la remise');
    const notifs = sql(d => d.prepare("SELECT titre FROM notifications WHERE user_id=? ORDER BY id").all(idA)).map(n => n.titre);
    assert.ok(notifs.includes('Message sécurisé ouvert'));
    const etatA = await c(jarA, 'GET', `/api/messages-securises/${mid}/etat`);
    assert.equal(etatA.data.statut, 'ouvert'); assert.equal(etatA.data.est_destinataire, false);
  });

  await t.test('la page rechargée ne prolonge rien : la fin reste celle de la première remise', async () => {
    const avant = sql(d => d.prepare('SELECT expire_le FROM messages_securises WHERE message_id=?').get(mid).expire_le);
    const r = await c(jarB, 'POST', `/api/messages-securises/${mid}/ouvrir`, { ds_id: DS_ID });
    assert.equal(r.status, 200); assert.equal(r.data.contenu, SECRET);
    assert.equal(sql(d => d.prepare('SELECT expire_le FROM messages_securises WHERE message_id=?').get(mid).expire_le), avant);
  });

  await t.test('passé les 2 minutes : 410, texte chiffré effacé, état « détruit », plus rien à lire', async () => {
    sql(d => d.prepare("UPDATE messages_securises SET expire_le=? WHERE message_id=?").run(new Date(Date.now() - 1000).toISOString(), mid));
    const r = await c(jarB, 'POST', `/api/messages-securises/${mid}/ouvrir`, { ds_id: DS_ID });
    assert.equal(r.status, 410); assert.equal(r.data.detruit, true);
    const l = sql(d => d.prepare('SELECT * FROM messages_securises WHERE message_id=?').get(mid));
    assert.equal(l.chiffre, null); assert.equal(l.iv, null); assert.equal(l.tag, null);
    assert.equal(l.detruit_motif, 'expire_lecture');
    const rb = await c(jarB, 'GET', `/api/conversations/${conv}/messages`);
    assert.equal(rb.data.messages.find(m => m.id === mid).securise.statut, 'detruit');
    assert.equal((await c(jarB, 'POST', `/api/messages-securises/${mid}/ouvrir`, { ds_id: DS_ID })).status, 410);
  });

  await t.test('destruction paresseuse : fin de lecture dépassée sans personne dans la conversation → effacé au premier passage', async () => {
    const r = await c(jarA, 'POST', `/api/conversations/${conv}/messages-securises`, { contenu: SECRET + '-2' });
    const id2 = r.data.message.id;
    assert.equal((await c(jarB, 'POST', `/api/messages-securises/${id2}/ouvrir`, { ds_id: DS_ID })).status, 200);
    sql(d => d.prepare("UPDATE messages_securises SET expire_le=? WHERE message_id=?").run(new Date(Date.now() - 1000).toISOString(), id2));
    const cron = await c(null, 'GET', '/api/cron/messages-securises');
    assert.equal(cron.status, 200, JSON.stringify(cron.data));
    assert.equal(sql(d => d.prepare('SELECT chiffre FROM messages_securises WHERE message_id=?').get(id2).chiffre), null, 'purge physique par la tâche planifiée');
  });

  await t.test('jamais ouvert : détruit après 30 jours', async () => {
    const id3 = (await c(jarA, 'POST', `/api/conversations/${conv}/messages-securises`, { contenu: 'jamais lu' })).data.message.id;
    sql(d => d.prepare("UPDATE messages_securises SET cree_le=? WHERE message_id=?").run(new Date(Date.now() - 31 * 86400000).toISOString(), id3));
    const rb = await c(jarB, 'GET', `/api/conversations/${conv}/messages`);
    assert.equal(rb.data.messages.find(m => m.id === id3).securise.statut, 'detruit');
    const l = sql(d => d.prepare('SELECT chiffre, detruit_motif FROM messages_securises WHERE message_id=?').get(id3));
    assert.equal(l.chiffre, null); assert.equal(l.detruit_motif, 'non_ouvert');
  });

  await t.test('supprimé par l\'expéditeur : le texte chiffré est détruit, le destinataire ne peut plus l\'ouvrir', async () => {
    const id4 = (await c(jarA, 'POST', `/api/conversations/${conv}/messages-securises`, { contenu: 'retiré' })).data.message.id;
    assert.equal((await c(jarA, 'DELETE', `/api/messages/${id4}`)).status, 200);
    const r = await c(jarB, 'POST', `/api/messages-securises/${id4}/ouvrir`, { ds_id: DS_ID });
    assert.equal(r.status, 410);
    assert.equal(sql(d => d.prepare('SELECT chiffre FROM messages_securises WHERE message_id=?').get(id4).chiffre), null);
  });

  await t.test('un message sécurisé ne se modifie pas', async () => {
    const id5 = (await c(jarA, 'POST', `/api/conversations/${conv}/messages-securises`, { contenu: 'figé' })).data.message.id;
    const r = await c(jarA, 'PATCH', `/api/messages/${id5}`, { contenu: 'remplacé en clair' });
    assert.equal(r.status, 403);
    assert.equal(sql(d => d.prepare('SELECT contenu FROM messages WHERE id=?').get(id5).contenu), MS.MARQUEUR);
  });

  await t.test('le destinataire peut le détruire sans le lire', async () => {
    const id6 = (await c(jarA, 'POST', `/api/conversations/${conv}/messages-securises`, { contenu: 'refusé' })).data.message.id;
    assert.equal((await c(jarC, 'POST', `/api/messages-securises/${id6}/detruire`)).status, 404, 'un tiers ne peut pas détruire');
    assert.equal((await c(jarB, 'POST', `/api/messages-securises/${id6}/detruire`)).status, 200);
    assert.equal(sql(d => d.prepare('SELECT chiffre FROM messages_securises WHERE message_id=?').get(id6).chiffre), null);
    assert.equal((await c(jarB, 'POST', `/api/messages-securises/${id6}/ouvrir`, { ds_id: DS_ID })).status, 410);
  });

  await t.test('destinataire sans DS-ID : 409 avec consigne, rien ne s\'ouvre', async () => {
    const id7 = (await c(jarA, 'POST', `/api/conversations/${conv}/messages-securises`, { contenu: 'attente' })).data.message.id;
    sql(d => d.prepare('UPDATE users SET ds_id=NULL WHERE id=?').run(idB));
    const r = await c(jarB, 'POST', `/api/messages-securises/${id7}/ouvrir`, { ds_id: 'N-IMPORTE-QUOI' });
    assert.equal(r.status, 409); assert.equal(r.data.ds_id_absent, true);
    sql(d => d.prepare('UPDATE users SET ds_id=? WHERE id=?').run(DS_ID, idB));
  });

  await t.test('une fois toutes les étapes passées, le texte n\'a jamais été en clair dans la base', () => {
    assert.equal(dansLaBase(SECRET), false);
  });
});

test('chiffrement : lié à son message et à son destinataire', () => {
  const c = MS._chiffrer('confidentiel', Buffer.from('ms:10:20'));
  assert.equal(MS._dechiffrer(c, Buffer.from('ms:10:20')), 'confidentiel');
  assert.throws(() => MS._dechiffrer(c, Buffer.from('ms:11:20')), 'copié sur un autre message : illisible');
  assert.throws(() => MS._dechiffrer(c, Buffer.from('ms:10:21')), 'autre destinataire : illisible');
  assert.notEqual(MS._chiffrer('confidentiel', Buffer.from('ms:10:20')).chiffre, c.chiffre, 'IV aléatoire : deux chiffrements du même texte diffèrent');
  const altere = { ...c, chiffre: Buffer.from('xxxxxxxxxxxx').toString('base64') };
  assert.throws(() => MS._dechiffrer(altere, Buffer.from('ms:10:20')), 'données altérées : rejetées');
});
