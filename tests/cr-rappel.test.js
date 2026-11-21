/* ===========================================================
   tests/cr-rappel.test.js — Cartouche « Faites le compte-rendu de votre événement » (2026-11-21)
   ===========================================================
   Cas réel : le créateur de « Quand le cinéma devient un espace de parole… » avait reçu la notification du lendemain (jamais ouverte) et n'a
   pas écrit de compte-rendu. Une vraie cartouche doit s'afficher à sa connexion, avec Ignorer (navigateur), Me le rappeler plus tard (3 jours)
   et Ne plus afficher (plus aucun rappel pour cet événement, relance automatique comprise).
   Lancer : node --test tests/cr-rappel.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env, jarC, jarA;
test.before(async () => {
  env = await H.demarrer('crrappel');
  jarC = H.cookieJar(); jarA = H.cookieJar();
  await H.creerApprenant(env, jarC, 'crr', 'Createur');
  await H.creerApprenant(env, jarA, 'crr', 'Autre');
});
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
const uid = nom => sql('select id from users where email=?', H.compte('crr', nom, 'utilisateur').email)[0].id;
const evt = (owner, titre, dateEvt, statut = 'ouvert', dateFin = null) => Number(sql("INSERT INTO evenements (titre, date_evt, date_fin, statut, owner_user_id, heure_debut, heure_fin) VALUES (?,?,?,?,?,'10:00','12:00')", titre, dateEvt, dateFin, statut, owner).lastInsertRowid);
const cr = (evenementId, statut) => sql("INSERT INTO evenement_comptes_rendus (evenement_id, auteur_id, titre, resume, statut) VALUES (?, ?, 'CR', 'Texte', ?)", evenementId, uid('Createur'), statut);
const voir = async (jar) => (await env.call(jar || jarC, 'GET', '/api/cr-rappel'));
const titres = async (jar) => (await voir(jar)).data.evenements.map(e => e.titre).sort();
const agir = (action, ids, jar) => env.call(jar || jarC, 'POST', '/api/cr-rappel/action', { action, evenement_ids: ids });

let A, B;
test('visiteur non connecté : refusé', async () => {
  assert.equal((await env.call(H.cookieJar(), 'GET', '/api/cr-rappel')).status, 401);
  assert.equal((await env.call(H.cookieJar(), 'POST', '/api/cr-rappel/action', { action: 'ne_plus_afficher', evenement_ids: [1] })).status, 401);
});

test('seuls les événements TERMINÉS, du créateur, non brouillon/annulé, depuis le lancement, sans compte-rendu publié sont proposés', async () => {
  const moi = uid('Createur'), autre = uid('Autre');
  A = evt(moi, 'Cinéma et résilience', '2026-11-13');
  B = evt(moi, 'Journée santé', '2026-11-12', 'ouvert', '2026-11-14');
  evt(moi, 'Pas encore fini', '2099-01-01');
  evt(moi, 'Avant le lancement', '2026-09-01');
  evt(moi, 'Brouillon de doublon', '2026-11-13', 'brouillon');
  evt(moi, 'Annulé', '2026-11-13', 'annulé');
  evt(autre, "Événement d'un autre", '2026-11-13');
  const publie = evt(moi, 'Déjà raconté', '2026-11-13'); cr(publie, 'publie');
  const r = await voir();
  assert.equal(r.status, 200);
  assert.deepEqual(await titres(), ['Cinéma et résilience', 'Journée santé']);
  assert.equal(r.data.report_jours, 3);
  const e = r.data.evenements.find(x => x.id === A);
  assert.equal(e.lien, `compte-rendu.html?evt=${A}`);
  assert.equal(e.date, '2026-11-13');
  assert.equal(r.data.evenements.find(x => x.id === B).date, '2026-11-14', 'la date affichée est la date de fin');
});

test('un compte-rendu en brouillon n\'éteint pas la cartouche : elle propose de le terminer', async () => {
  const d = evt(uid('Createur'), 'Commencé seulement', '2026-11-13'); cr(d, 'brouillon');
  const e = (await voir()).data.evenements.find(x => x.id === d);
  assert.ok(e && e.brouillon === true);
  sql('delete from evenement_comptes_rendus where evenement_id=?', d); sql('delete from evenements where id=?', d);
});

test('« Me le rappeler plus tard » : disparaît 3 jours, puis revient', async () => {
  const r = await agir('plus_tard', [A]);
  assert.equal(r.status, 200); assert.equal(r.data.traites, 1);
  assert.deepEqual(await titres(), ['Journée santé']);
  const ligne = sql('select etat, report_jusqua from cr_rappels where evenement_id=?', A)[0];
  assert.equal(ligne.etat, 'report');
  const jours = (new Date(ligne.report_jusqua).getTime() - Date.now()) / 86400000;
  assert.ok(jours > 2.9 && jours < 3.1, 'report ≈ 3 jours, obtenu ' + jours);
  assert.equal(sql('select cr_relance_at from evenements where id=?', A)[0].cr_relance_at, null, 'plus tard ne coupe pas la relance');
  sql("update cr_rappels set report_jusqua=? where evenement_id=?", new Date(Date.now() - 1000).toISOString(), A); // le délai est écoulé
  assert.deepEqual(await titres(), ['Cinéma et résilience', 'Journée santé']);
});

test('« Ne plus afficher » : plus jamais pour cet événement, et la relance automatique est coupée aussi', async () => {
  const r = await agir('ne_plus_afficher', [A]);
  assert.equal(r.status, 200); assert.equal(r.data.traites, 1);
  assert.deepEqual(await titres(), ['Journée santé']);
  assert.equal(sql('select etat from cr_rappels where evenement_id=?', A)[0].etat, 'masque');
  assert.ok(sql('select cr_relance_at from evenements where id=?', A)[0].cr_relance_at, 'cr_relance_at renseigné : le cron ne relancera plus');
  /* même après un « plus tard » demandé ensuite par erreur sur un autre appareil : le choix le plus récent gagne, mais ici on vérifie la stabilité */
  assert.deepEqual(await titres(), ['Journée santé']);
});

test('on ne peut agir que sur SES événements ; une action inconnue est refusée', async () => {
  const autre = evt(uid('Autre'), 'À quelqu’un d’autre', '2026-11-13');
  const r = await agir('ne_plus_afficher', [autre]); // jarC n'en est pas le créateur
  assert.equal(r.status, 200); assert.equal(r.data.traites, 0);
  assert.equal(sql('select count(*) as n from cr_rappels where evenement_id=?', autre)[0].n, 0);
  assert.equal(sql('select cr_relance_at from evenements where id=?', autre)[0].cr_relance_at, null);
  assert.equal((await agir('supprimer', [B])).status, 400);
  assert.equal((await agir('plus_tard', 'pas-une-liste')).data.traites, 0);
});

test('publier le compte-rendu éteint la cartouche', async () => {
  cr(B, 'publie');
  assert.deepEqual(await titres(), []);
});

test('un compte démo ne voit jamais la cartouche', async () => {
  const moi = uid('Autre');
  evt(moi, 'Démo finie', '2026-11-13');
  assert.ok((await titres(jarA)).includes('Démo finie'), 'avant : un compte ordinaire la voit');
  sql('update users set is_demo=1 where id=?', moi);
  assert.deepEqual(await titres(jarA), []);
});
