/* ===========================================================
   tests/sondage-portefeuilles.test.js — PORTEFEUILLES DE SONDAGES (2026-11-10)
   ===========================================================
   Règles vérifiées : création réservée aux comptes qui créent des sondages ; un portefeuille ne contient que les sondages de son créateur ; ajout, retrait, ordre ;
   brouillon invisible des autres comptes, publié visible de tous mais SANS les brouillons de sondage ; publier exige un sondage et un lieu ; lien aux seuls événements du
   créateur ; apparition dans l'onglet / le profil / l'événement (/api/sondages-en-cours) ; un portefeuille publié compte comme lieu d'affichage d'un sondage, et on ne peut
   pas le dépublier / le supprimer / en retirer un sondage en cours qui n'aurait plus de lieu ; annonce dans le fil.
   Lancer : node --test tests/sondage-portefeuilles.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z'; env = await H.demarrer('sondage-portefeuilles'); }); /* sans période Premium offerte : un simple utilisateur n'a pas accès */
test.after(() => { if (env) env.stop(); });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('portefeuilles de sondages', async () => {
  const rnd = Math.random().toString(36).slice(2, 7), call = env.call;
  const jar = { Adm: H.cookieJar(), Adm2: H.cookieJar(), Libre: H.cookieJar(), Anon: H.cookieJar() };
  const A = await H.creerFormateur(env, jar.Adm, rnd, 'Adm'); await H.creerFormateur(env, jar.Adm2, rnd, 'Adm2'); await H.creerApprenant(env, jar.Libre, rnd, 'Libre');
  const uid = c => sql('select id from users where email=?', c.email)[0].id, admId = uid(A);
  const libreId = uid(H.compte(rnd, 'Libre', 'utilisateur'));
  sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", libreId); sql('DELETE FROM user_accreditations WHERE user_id=?', libreId);
  const sond = async (titre, statut, diffusion, jarU) => { const r = await call(jarU || jar.Adm, 'POST', '/api/sondages', { titre, statut, diffusion: diffusion || {}, questions: [{ texte: 'Q', type: 'oui_non' }] }); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data.id; };
  const s1 = await sond('Sondage un', 'brouillon'), s2 = await sond('Sondage deux', 'brouillon'), s3 = await sond('Sondage trois', 'brouillon');
  const sAutre = await sond('Sondage de l\'autre', 'brouillon', {}, jar.Adm2);
  const evt = Number(sql("INSERT INTO evenements (titre, date_evt, owner_user_id, visibilite, statut, ville) VALUES ('Brunch test', '2027-01-10', ?, 'public', 'ouvert', 'Paris')", admId).lastInsertRowid);
  const evtAutre = Number(sql("INSERT INTO evenements (titre, date_evt, owner_user_id, visibilite, statut, ville) VALUES ('Événement d''un autre', '2027-01-11', ?, 'public', 'ouvert', 'Lyon')", uid(await { email: H.compte(rnd, 'Adm2', 'utilisateur').email })).lastInsertRowid);

  /* ── Création : réservée ; titre requis ; sondages du créateur seulement ── */
  assert.equal((await call(jar.Libre, 'POST', '/api/sondage-portefeuilles', { titre: 'Non' })).status, 403, 'un simple utilisateur ne crée pas de portefeuille');
  assert.equal((await call(jar.Anon, 'POST', '/api/sondage-portefeuilles', { titre: 'Non' })).status, 401);
  assert.equal((await call(jar.Adm, 'POST', '/api/sondage-portefeuilles', { titre: '  ' })).status, 400);
  assert.equal((await call(jar.Adm, 'POST', '/api/sondage-portefeuilles', { titre: 'Piège', sondage_ids: [sAutre] })).status, 400, 'pas le sondage d\'un autre');
  const c = await call(jar.Adm, 'POST', '/api/sondage-portefeuilles', { titre: 'Consultation santé', description: 'Trois sondages', couverture: '/api/uploads/12', sondage_ids: [s1, s2] });
  assert.equal(c.status, 201, JSON.stringify(c.data)); const pid = c.data.id;
  assert.equal((await call(jar.Adm, 'POST', '/api/sondage-portefeuilles', { titre: 'Mauvaise couverture', couverture: 'http://x' })).status, 201, 'une couverture invalide est ignorée, pas bloquante');
  const mes = (await call(jar.Adm, 'GET', '/api/sondage-portefeuilles/mes')).data.portefeuilles.find(p => p.id === pid);
  assert.equal(mes.titre, 'Consultation santé'); assert.equal(mes.couverture, '/api/uploads/12'); assert.equal(mes.statut, 'brouillon'); assert.deepEqual(mes.sondages.map(s => s.id), [s1, s2]);

  /* ── Ajout, ordre, retrait ── */
  assert.equal((await call(jar.Adm, 'POST', `/api/sondage-portefeuilles/${pid}/sondages`, { sondage_id: s3 })).status, 200);
  assert.equal((await call(jar.Adm, 'POST', `/api/sondage-portefeuilles/${pid}/sondages`, { sondage_id: s3 })).status, 200, 'ajout répété : sans doublon');
  assert.equal((await call(jar.Adm, 'POST', `/api/sondage-portefeuilles/${pid}/sondages`, { sondage_id: sAutre })).status, 400);
  sql("UPDATE users SET role='initiative' WHERE id=?", libreId);   /* un autre créateur (non administrateur) */
  assert.equal((await call(jar.Libre, 'POST', `/api/sondage-portefeuilles/${pid}/sondages`, { sondage_id: sAutre })).status, 403, 'un autre créateur ne touche pas à mon portefeuille');
  assert.equal((await call(jar.Adm, 'PUT', `/api/sondage-portefeuilles/${pid}/sondages`, { sondage_ids: [s3, s1, s2] })).status, 200);
  const ordre = async () => (await call(jar.Adm, 'GET', `/api/sondage-portefeuilles/${pid}`)).data.portefeuille.sondages.map(s => s.id);
  assert.deepEqual(await ordre(), [s3, s1, s2], 'l\'ordre saisi est conservé');
  assert.equal((await call(jar.Adm, 'DELETE', `/api/sondage-portefeuilles/${pid}/sondages/${s3}`)).status, 200); assert.deepEqual(await ordre(), [s1, s2]);

  /* ── Brouillon : invisible des autres comptes ── */
  assert.equal((await call(jar.Libre, 'GET', `/api/sondage-portefeuilles/${pid}`)).status, 404);
  assert.equal((await call(jar.Anon, 'GET', `/api/sondage-portefeuilles/${pid}`)).status, 404);

  /* ── Publier : exige des sondages et un lieu ── */
  const vide = (await call(jar.Adm, 'POST', '/api/sondage-portefeuilles', { titre: 'Vide' })).data.id;
  assert.equal((await call(jar.Adm, 'POST', `/api/sondage-portefeuilles/${vide}/publier`)).status, 400, 'sans sondage');
  const sansLieu = await call(jar.Adm, 'POST', `/api/sondage-portefeuilles/${pid}/publier`); assert.equal(sansLieu.status, 400); assert.equal(sansLieu.data.code, 'aucun_lieu');
  assert.equal((await call(jar.Adm, 'PUT', `/api/sondage-portefeuilles/${pid}/diffusion`, { evenement_ids: [evtAutre] })).status, 400, 'pas l\'événement d\'un autre');
  const d = await call(jar.Adm, 'PUT', `/api/sondage-portefeuilles/${pid}/diffusion`, { onglet: true, profil: true, fil: true, evenement_ids: [evt] }); assert.equal(d.status, 200, JSON.stringify(d.data));
  const pub = await call(jar.Adm, 'POST', `/api/sondage-portefeuilles/${pid}/publier`); assert.equal(pub.status, 200, JSON.stringify(pub.data)); assert.equal(pub.data.brouillons, 2, 'les 2 sondages sont encore des brouillons');
  assert.ok(pub.data.fil_post_id, 'annonce dans le fil');
  assert.match(sql('select contenu from fil_posts where id=?', pub.data.fil_post_id)[0].contenu, /Portefeuille de sondages : « Consultation santé »/);
  assert.equal(sql('select statut from sondages where id=?', s1)[0].statut, 'brouillon', 'publier le portefeuille ne publie pas ses sondages');

  /* ── Visiteur : voit le portefeuille mais aucun brouillon de sondage ── */
  const pubVisiteur = (await call(jar.Anon, 'GET', `/api/sondage-portefeuilles/${pid}`)).data;
  assert.equal(pubVisiteur.portefeuille.titre, 'Consultation santé'); assert.equal(pubVisiteur.proprietaire, false); assert.equal(pubVisiteur.portefeuille.nb_sondages, 0, 'aucun brouillon exposé');
  assert.ok(!('createur_id' in pubVisiteur.portefeuille) && !('diffusion' in pubVisiteur.portefeuille), 'le visiteur ne reçoit pas les réglages');
  assert.equal((await call(jar.Anon, 'GET', '/api/sondage-portefeuilles?onglet=1')).data.portefeuilles.length, 0, 'sans sondage visible : absent de l\'onglet');

  /* ── Un portefeuille publié compte comme lieu : le sondage peut être publié sans autre lieu ── */
  const pubSond = await call(jar.Adm, 'POST', `/api/sondages/${s1}/republier`, { duree_jours: 5 }); assert.equal(pubSond.status, 200, JSON.stringify(pubSond.data));
  const voit = (await call(jar.Anon, 'GET', `/api/sondage-portefeuilles/${pid}`)).data.portefeuille; assert.deepEqual(voit.sondages.map(s => s.id), [s1]); assert.equal(voit.nb_en_cours, 1);
  assert.equal((await call(jar.Anon, 'GET', '/api/sondage-portefeuilles?onglet=1')).data.portefeuilles[0].id, pid, 'présent dans l\'onglet Sondages');
  const enCoursEvt = (await call(jar.Anon, 'GET', `/api/sondages-en-cours?evenement=${evt}`)).data; assert.equal(enCoursEvt.portefeuilles[0].id, pid, 'bloc « en cours » de la page de l\'événement');
  assert.equal((await call(jar.Anon, 'GET', `/api/sondages-en-cours?profil=${admId}`)).data.portefeuilles[0].id, pid, 'profil public');
  assert.equal((await call(jar.Anon, 'GET', `/api/sondages-en-cours?boutique=${admId}`)).data.portefeuilles.length, 0, 'pas de lieu « boutique » choisi');

  /* ── Garde-fous : jamais un sondage en cours sans lieu ── */
  const refus = [
    await call(jar.Adm, 'POST', `/api/sondage-portefeuilles/${pid}/depublier`),
    await call(jar.Adm, 'DELETE', `/api/sondage-portefeuilles/${pid}`),
    await call(jar.Adm, 'DELETE', `/api/sondage-portefeuilles/${pid}/sondages/${s1}`),
    await call(jar.Adm, 'PUT', `/api/sondage-portefeuilles/${pid}/sondages`, { sondage_ids: [s2] }),
  ];
  refus.forEach((r, i) => { assert.equal(r.status, 400, 'refus ' + i + ' : ' + JSON.stringify(r.data)); });
  assert.equal(refus[0].data.code, 'sondage_sans_lieu');
  assert.equal((await call(jar.Adm, 'PUT', `/api/sondage-portefeuilles/${pid}/diffusion`, { onglet: false, profil: false, fil: false, evenement_ids: [] })).status, 400, 'un portefeuille publié garde un lieu');
  /* Le sondage reçoit un lieu à lui : le portefeuille se dépublie sans problème. */
  assert.equal((await call(jar.Adm, 'PUT', `/api/sondages/${s1}/diffusion`, { onglet: true })).status, 200);
  assert.equal((await call(jar.Adm, 'POST', `/api/sondage-portefeuilles/${pid}/depublier`)).status, 200);
  assert.equal((await call(jar.Anon, 'GET', `/api/sondage-portefeuilles/${pid}`)).status, 404, 'dépublié : redevenu privé');

  /* ── Suppression : les sondages sont conservés ── */
  assert.equal((await call(jar.Libre, 'DELETE', `/api/sondage-portefeuilles/${pid}`)).status, 403, 'un autre créateur ne supprime pas mon portefeuille');
  assert.equal((await call(jar.Adm, 'DELETE', `/api/sondage-portefeuilles/${pid}`)).status, 200);
  assert.equal(sql('select count(*) n from sondages where id in (?,?)', s1, s2)[0].n, 2);
  assert.equal(sql('select count(*) n from sondage_portefeuille_items where portefeuille_id=?', pid)[0].n, 0);
  assert.equal(sql('select count(*) n from sondage_portefeuille_evenements where portefeuille_id=?', pid)[0].n, 0);
});
