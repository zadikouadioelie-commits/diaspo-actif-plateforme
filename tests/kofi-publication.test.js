/* ===========================================================
   tests/kofi-publication.test.js — KOFFI ÉCRIT ET PUBLIE (OU PROGRAMME) UNE PUBLICATION DU FIL (2026-11-01)
   ===========================================================
   Règles vérifiées : tout compte peut publier sur son fil avec Koffi, jamais plus ; le brouillon est revalidé par le serveur ; Koffi demande le moment (jamais « tout de suite » choisi
   à la place de la personne) ; pour une publication PROGRAMMÉE, l'avertissement « l'heure est approximative » figure dans l'aperçu et dans le message AVANT tout accord, et la
   confirmation n'est prise en compte que sur un aperçu complet que la personne a vu ; la publication passe par la route habituelle POST /api/fil ; une publication programmée est
   invisible de tous jusqu'à son heure, puis mise en ligne (paresseusement ou par la tâche quotidienne), une seule fois ; bouton périmé refusé ; date passée refusée.
   Lancer : node --test tests/kofi-publication.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const P = require('../server/kofi-publication');
const E = require('../server/kofi-evenements');
const FP = require('../server/fil-programmes');

let env;
const journalIA = path.join(os.tmpdir(), 'faux-ia-publication-' + process.pid + '.log');
test.before(async () => {
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.KOFI_FAUX_LOG = journalIA;
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofi-publication');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalIA); } catch (e) { /* absent */ } });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('Koffi publication — fonctions pures (heure de Paris, validation, avertissement)', () => {
  /* Heure de Paris → UTC : hiver (UTC+1) et été (UTC+2). */
  assert.equal(P.parisVersDate('2026-11-20', '09:30').toISOString(), '2026-11-20T08:30:00.000Z');
  assert.equal(P.parisVersDate('2026-07-01', '09:30').toISOString(), '2026-07-01T07:30:00.000Z');
  assert.equal(P.parisVersDate('2027-03-28', '02:30'), null, 'heure inexistante (passage à l\'heure d\'été)');
  const maintenant = Date.parse('2026-11-04T10:00:00Z');
  const v = P.validerBrouillon({ texte: '  Bonjour <b>à tous</b> @[Marie](u:5) ', mode: 'programme', date: '2026-11-05', heure: '9h30', image_choix: 'sans', categorie: 'Nimporte', visibilite: 'secret' }, maintenant);
  assert.equal(v.champs.texte, 'Bonjour à tous Marie', 'balises et mentions retirées');
  assert.equal(v.champs.heure, '09:30'); assert.equal(v.champs.categorie, 'Actualité'); assert.equal(v.champs.visibilite, 'public', 'listes fermées');
  assert.deepEqual(P.manquants(v.champs), []);
  assert.equal(P.corpsPublication(v.champs).statut, 'programme');
  assert.equal(P.corpsPublication(v.champs).programmed_at, '2026-11-05T08:30:00.000Z');
  assert.match(P.vue(v.champs).avertissement, /approximative/); assert.equal(P.vue(v.champs).bouton, 'Programmer');
  assert.match(P.quand(v.champs), /9 h 30 \(heure de Paris\)/);
  /* Tout de suite : pas d'avertissement, route "publie". */
  const m = P.validerBrouillon({ texte: 'Salut', mode: 'maintenant', date: '2026-11-05', heure: '09:30', image_choix: 'sans' }, maintenant).champs;
  assert.equal(m.date, ''); assert.equal(P.corpsPublication(m).statut, 'publie'); assert.equal(P.vue(m).avertissement, ''); assert.equal(P.vue(m).bouton, 'Publier');
  /* Le moment n'est jamais choisi à la place de la personne. */
  assert.deepEqual(P.manquants(P.validerBrouillon({ texte: 'x', image_choix: 'sans' }, maintenant).champs).map(x => x.cle), ['mode']);
  assert.deepEqual(P.manquants(P.validerBrouillon({ texte: 'x', mode: 'programme', image_choix: 'sans' }, maintenant).champs).map(x => x.cle), ['date', 'heure']);
  /* Dates refusées. */
  assert.ok(P.validerBrouillon({ mode: 'programme', date: '2026-11-04', heure: '10:03' }, maintenant).problemes.includes('date_passee'), 'moins de 5 minutes d\'avance');
  assert.ok(P.validerBrouillon({ mode: 'programme', date: '2026-11-01', heure: '10:00' }, maintenant).problemes.includes('date_passee'));
  assert.ok(P.validerBrouillon({ mode: 'programme', date: '2027-06-01', heure: '10:00' }, maintenant).problemes.includes('date_lointaine'));
  assert.equal(P.validerBrouillon({ image_url: 'javascript:alert(1)' }, maintenant).champs.image_url, '');
  assert.ok(P.memeBrouillon(v.champs, { ...v.champs })); assert.ok(!P.memeBrouillon(v.champs, { ...v.champs, texte: 'autre' }));
  assert.ok(E.lireSortie('{"action":"publication","message":"ok","brouillon":{"texte":"A"},"confirme":true}').confirme);
  assert.equal(E.lireSortie('{"action":"publication","message":"ok","brouillon":{},"confirme":"oui"}').confirme, false, 'seul le booléen true confirme');
  const sys = E.systemePour();
  assert.match(sys, /PUBLICATION DU FIL/); assert.match(sys, /HEURE APPROXIMATIVE/); assert.match(sys, /ne choisis jamais « maintenant » à sa place/);
});

test('Fil programmé — mise en ligne atomique, une seule fois, avec les notifications', async () => {
  const db = new H.DatabaseSync(':memory:');
  db.exec(`CREATE TABLE fil_posts (id INTEGER PRIMARY KEY, auteur_id INTEGER, contenu TEXT, article_titre TEXT, article_contenu TEXT, visibilite TEXT, statut TEXT, programmed_at TEXT, created_at TEXT DEFAULT '2020-01-01 00:00:00');
    CREATE TABLE users (id INTEGER PRIMARY KEY, nom TEXT, premiere_publication_le TEXT); CREATE TABLE user_follows (follower_id INTEGER, followed_id INTEGER); CREATE TABLE initiatives (id INTEGER PRIMARY KEY, owner_user_id INTEGER);`);
  db.exec(`INSERT INTO users (id, nom) VALUES (1,'Aïcha'),(2,'Paul'),(3,'Compte supprimé'); INSERT INTO user_follows VALUES (2,1);
    INSERT INTO fil_posts (id, auteur_id, contenu, visibilite, statut, programmed_at) VALUES
    (10,1,'Dans le futur','public','programme','2026-12-01T10:00:00.000Z'), (11,1,'Due @[Paul](u:2)','public','programme','2026-11-04T09:00:00.000Z'),
    (12,3,'Compte supprimé','public','programme','2026-11-04T09:00:00.000Z'), (13,1,'Date cassée','public','programme','pas une date'), (14,1,'Brouillon ordinaire','public','brouillon',NULL);`);
  /* Enveloppe minimale façon base de la plateforme : prepare().get/all/run. */
  const base = { prepare: sqlTxt => { const s = db.prepare(sqlTxt.replace(/datetime\('now'\)/g, "'2026-11-04 10:00:00'")); return { get: (...a) => s.get(...a), all: (...a) => s.all(...a), run: (...a) => { const r = s.run(...a); return { changes: Number(r.changes) }; } }; } };
  const notifs = [];
  let ms = Date.parse('2026-11-04T10:00:00Z');
  const fp = FP.creer({ db: base, creerNotif: (...a) => notifs.push(a), nomCompteAffichage: async id => (id === 1 ? 'Aïcha' : 'X'), maintenant: () => ms });
  assert.equal(await fp.verifier(), 1, 'seule la publication due est mise en ligne');
  const statut = id => db.prepare('SELECT statut FROM fil_posts WHERE id=?').get(id).statut;
  assert.equal(statut(10), 'programme', 'pas encore l\'heure'); assert.equal(statut(11), 'publie');
  assert.equal(statut(12), 'archive', 'un compte supprimé ne publie plus'); assert.equal(statut(13), 'brouillon', 'date illisible : jamais publiée au hasard'); assert.equal(statut(14), 'brouillon');
  assert.equal(db.prepare('SELECT created_at c FROM fil_posts WHERE id=11').get().c, '2026-11-04 10:00:00', 'la date de publication est le moment de la mise en ligne');
  assert.ok(db.prepare('SELECT premiere_publication_le p FROM users WHERE id=1').get().p);
  const types = notifs.map(n => n[1]).sort(); assert.deepEqual(types, ['mention', 'nouvelle_publication']);
  assert.equal(await fp.verifier(), 0, 'au plus une vérification toutes les 20 secondes');
  ms += 21000;
  assert.equal(await fp.verifier(), 0, 'déjà publiée : jamais deux fois'); assert.equal(notifs.length, 2);
  ms = Date.parse('2026-12-01T10:00:01Z'); assert.equal(await fp.verifier(true), 1); assert.equal(statut(10), 'publie');
});

test('Koffi publication — parcours complet', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 7);
  const call = env.call;
  const jar = {}; for (const n of ['Adm', 'Adm2', 'Libre', 'Autre']) jar[n] = H.cookieJar();
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const etat = j => call(j, 'GET', '/api/kofi/evenements/etat');
  const dire = (j, texte, extra) => call(j, 'POST', '/api/kofi/evenements/messages', { texte, ...extra });
  const posts = texte => sql('select * from fil_posts where contenu=?', texte);
  const T1 = 'Grande annonce ' + rnd, T2 = 'Annonce immédiate ' + rnd, T3 = 'Annonce par bouton ' + rnd, T4 = 'Annonce citoyenne ' + rnd;
  const enc = s => s.replace(/ /g, '_');
  const PROG = `PUBLICATIONFAUX P_TEXTE:${enc(T1)} P_MODE:programme P_DATE:+1 P_HEURE:09:30 P_SANSIMAGE`;
  let conv, midAperçu;

  await t.test('setup', async () => {
    await H.creerFormateur(env, jar.Adm, rnd, 'Adm');
    await H.creerFormateur(env, jar.Adm2, rnd, 'Adm2');
    await H.creerApprenant(env, jar.Libre, rnd, 'Libre');
    await H.creerApprenant(env, jar.Autre, rnd, 'Autre');
    for (const n of ['Libre', 'Autre']) sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", uid(n));
    assert.equal((await call(jar.Adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
    for (const n of ['Adm', 'Adm2', 'Libre', 'Autre']) assert.equal((await call(jar[n], 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
  });

  await t.test('/etat : la publication est annoncée à tout compte (un compte simple ne peut pas créer d\'événement, mais peut publier)', async () => {
    const e = (await etat(jar.Libre)).data;
    assert.equal(e.publication.disponible, true); assert.equal(e.flash.disponible, false);
  });

  await t.test('sans moment précis, Koffi le demande : il ne publie jamais « tout de suite » à la place de la personne', async () => {
    const r = await dire(jar.Libre, `PUBLICATIONFAUX P_TEXTE:${enc(T4)} P_SANSIMAGE CONFIRMEFAUX`);
    assert.equal(r.status, 200);
    const b = r.data.message.brouillon;
    assert.equal(b.type, 'publication'); assert.equal(b.pret, false); assert.ok(b.manquants.some(x => /moment/.test(x)));
    assert.equal(posts(T4).length, 0);
  });

  await t.test('compte simple : aperçu d\'une publication immédiate puis accord → publiée par la route habituelle, visible dans le fil', async () => {
    let r = await dire(jar.Libre, `PUBLICATIONFAUX P_TEXTE:${enc(T4)} P_MODE:maintenant P_SANSIMAGE`);
    assert.equal(r.data.message.brouillon.pret, true); assert.equal(r.data.message.brouillon.bouton, 'Publier'); assert.equal(r.data.message.brouillon.avertissement, '');
    assert.doesNotMatch(r.data.message.contenu, /approximative/);
    assert.equal(posts(T4).length, 0, 'rien n\'est publié avant l\'accord');
    r = await dire(jar.Libre, 'PUBLICATIONFAUX CONFIRMEFAUX', { conversation_id: r.data.conversation_id });
    assert.match(r.data.message.contenu, /C'est publié/);
    const p = posts(T4); assert.equal(p.length, 1); assert.equal(p[0].statut, 'publie'); assert.equal(p[0].auteur_id, uid('Libre'));
    assert.ok(r.data.message.lien && /post=/.test(r.data.message.lien.url));
    const fil = await call(jar.Autre, 'GET', '/api/fil');
    assert.ok(JSON.stringify(fil.data).includes(T4), 'visible dans le fil des autres');
  });

  await t.test('publication programmée : l\'avertissement « heure approximative » est dans l\'aperçu ET dans le message, avant tout accord', async () => {
    let r = await dire(jar.Adm, `PUBLICATIONFAUX P_TEXTE:${enc(T1)} P_MODE:programme P_DATE:+1 P_SANSIMAGE`);   /* heure encore manquante */
    conv = r.data.conversation_id;
    assert.ok(r.data.message.brouillon.manquants.some(x => /heure/.test(x))); assert.match(r.data.message.contenu, /approximative/);
    r = await dire(jar.Adm, 'PUBLICATIONFAUX P_HEURE:09:30 CONFIRMEFAUX', { conversation_id: conv });
    const b = r.data.message.brouillon;
    assert.equal(b.pret, true); assert.equal(b.bouton, 'Programmer'); assert.match(b.avertissement, /approximative/); assert.match(b.quand, /9 h 30 \(heure de Paris\)/);
    assert.match(r.data.message.contenu, /l'heure sera approximative/); assert.match(r.data.message.contenu, /jamais avant/);
    assert.equal(posts(T1).length, 0, 'brouillon incomplet au message précédent : ce « oui » ne programme rien');
    midAperçu = r.data.message.id;
  });

  await t.test('accord sur l\'aperçu vu → programmée (statut programme, UTC), invisible de tous jusqu\'à son heure', async () => {
    const r = await dire(jar.Adm, 'PUBLICATIONFAUX CONFIRMEFAUX', { conversation_id: conv });
    assert.match(r.data.message.contenu, /C'est programmé/); assert.match(r.data.message.contenu, /approximative/);
    const p = posts(T1); assert.equal(p.length, 1); assert.equal(p[0].statut, 'programme');
    const t = Date.parse(p[0].programmed_at); assert.ok(t > Date.now() && t < Date.now() + 3 * 86400000);
    assert.equal(new Date(t).toISOString(), p[0].programmed_at, 'stockée en ISO UTC');
    assert.equal(r.data.message.lien, undefined, 'pas de lien : elle n\'est pas encore en ligne');
    for (const n of ['Autre', 'Adm2']) assert.ok(!JSON.stringify((await call(jar[n], 'GET', '/api/fil')).data).includes(T1), 'invisible du fil');
    assert.equal((await call(jar.Autre, 'GET', `/api/fil/${p[0].id}`)).status, 404, 'invisible en lecture directe pour un tiers');
    assert.equal((await call(jar.Adm, 'GET', `/api/fil/${p[0].id}`)).status, 200, "l'auteur la voit");
  });

  await t.test('l\'heure venue, elle est mise en ligne (tâche quotidienne), une seule fois', async () => {
    const id = posts(T1)[0].id;
    let r = await call(jar.Autre, 'GET', '/api/cron/fil-programmes');
    assert.equal(r.status, 200); assert.equal(r.data.publiees, 0, 'pas encore l\'heure');
    sql("UPDATE fil_posts SET programmed_at=? WHERE id=?", new Date(Date.now() - 60000).toISOString(), id);
    r = await call(jar.Autre, 'GET', '/api/cron/fil-programmes');
    assert.equal(r.data.publiees, 1); assert.equal(posts(T1)[0].statut, 'publie');
    assert.ok(JSON.stringify((await call(jar.Autre, 'GET', '/api/fil')).data).includes(T1), 'visible dans le fil');
    r = await call(jar.Autre, 'GET', '/api/cron/fil-programmes'); assert.equal(r.data.publiees, 0);
  });

  await t.test('bouton Programmer : aperçu complet puis clic ; un second clic, ou le bouton d\'un autre compte, est refusé', async () => {
    const r = await dire(jar.Adm2, `PUBLICATIONFAUX P_TEXTE:${enc(T3)} P_MODE:programme P_DATE:+2 P_HEURE:18:00 P_SANSIMAGE`);
    assert.equal(r.data.message.brouillon.pret, true); assert.equal(posts(T3).length, 0);
    const mid = r.data.message.id;
    assert.equal((await call(jar.Adm, 'POST', '/api/kofi/evenements/flash/publier', { message_id: mid })).status, 404, 'le brouillon d\'une autre personne');
    const p = await call(jar.Adm2, 'POST', '/api/kofi/evenements/flash/publier', { message_id: mid });
    assert.equal(p.status, 201, JSON.stringify(p.data)); assert.equal(p.data.programme, true); assert.match(p.data.message.contenu, /C'est programmé/);
    assert.equal(posts(T3).length, 1); assert.equal(posts(T3)[0].statut, 'programme');
    assert.equal((await call(jar.Adm2, 'POST', '/api/kofi/evenements/flash/publier', { message_id: mid })).status, 409, 'plus le dernier brouillon');
    assert.equal(posts(T3).length, 1);
  });

  await t.test('date passée refusée ; l\'accord du message d\'avant ne vaut pas pour un aperçu modifié', async () => {
    let r = await dire(jar.Adm2, `PUBLICATIONFAUX P_TEXTE:${enc(T2)} P_MODE:programme P_DATE:2020-01-01 P_HEURE:09:00 P_SANSIMAGE`);
    assert.match(r.data.message.contenu, /déjà passés/); assert.ok(r.data.message.brouillon.manquants.length >= 2);
    r = await dire(jar.Adm2, `PUBLICATIONFAUX P_TEXTE:${enc(T2)} P_MODE:maintenant P_SANSIMAGE`, { conversation_id: r.data.conversation_id });
    assert.equal(r.data.message.brouillon.pret, true);
    /* La personne modifie le texte ET le modèle « confirme » dans la foulée : l'aperçu a changé, rien n'est publié. */
    r = await dire(jar.Adm2, `PUBLICATIONFAUX P_TEXTE:${enc(T2 + ' modifié')} CONFIRMEFAUX`, { conversation_id: r.data.conversation_id });
    assert.equal(posts(T2).length, 0); assert.equal(posts(T2 + ' modifié').length, 0);
    assert.equal(r.data.message.brouillon.pret, true);
  });

  await t.test('image jointe : jamais transmise à l\'IA', async () => {
    try { fs.unlinkSync(journalIA); } catch (e) { /* absent */ }
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const r = await dire(jar.Adm2, `PUBLICATIONFAUX P_TEXTE:Avec_image P_MODE:maintenant P_AVECIMAGE`, { image: png });
    assert.equal(r.status, 200);
    const journal = fs.existsSync(journalIA) ? fs.readFileSync(journalIA, 'utf8') : '';
    assert.ok(journal.length > 0); assert.ok(!journal.includes('iVBORw0KGgo'), 'l\'image ne part jamais au fournisseur d\'IA');
  });
});

test('Fil programmé — publication depuis la fenêtre « Publier » du site (même route)', async () => {
  const rnd = Math.random().toString(36).slice(2, 7);
  const call = env.call;
  const j = H.cookieJar(), k = H.cookieJar();
  await H.creerApprenant(env, j, rnd, 'Site'); await H.creerApprenant(env, k, rnd, 'Lecteur');
  const base = { contenu: 'Depuis le site ' + rnd, categorie: 'Actualité', visibilite: 'public', medias: '[]' };
  assert.equal((await call(j, 'POST', '/api/fil', { ...base, statut: 'programme' })).status, 400, 'date absente');
  assert.equal((await call(j, 'POST', '/api/fil', { ...base, statut: 'programme', programmed_at: 'pas une date' })).status, 400, 'date illisible');
  assert.equal((await call(j, 'POST', '/api/fil', { ...base, statut: 'programme', programmed_at: new Date(Date.now() - 3600000).toISOString() })).status, 400, 'date passée');
  const ok = await call(j, 'POST', '/api/fil', { ...base, statut: 'programme', programmed_at: new Date(Date.now() + 3600000).toISOString() });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.ok(!JSON.stringify((await call(k, 'GET', '/api/fil')).data).includes(base.contenu), 'programmée = invisible');
  assert.equal((await call(k, 'GET', `/api/fil/${ok.data.id}`)).status, 404);
  assert.equal((await call(j, 'GET', `/api/fil/${ok.data.id}`)).status, 200, 'l\'auteur la voit');
});
