/* ===========================================================
   tests/newsletter-abonnes.test.js — Newsletter des initiatives, étape N3 (2026-11-11)
   ===========================================================
   Export CSV des abonnés (propriétaire seul) et demande d'accord UNIQUE aux comptes qui suivent la boutique.
   Vrai serveur sur une COPIE de la base de dev ; aucun e-mail réel (pas de clé d'envoi), aucun paiement.
   Lancer : node --test tests/newsletter-abonnes.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const H = require('./_formation-harness');
const NA = require('../server/newsletter-abonnes.js');

let env, jarA, jarB, jarS1, jarS2, jarS3, idA, idB, uidS1, uidS2, uidS3, emailS1, emailS2, emailS3, rnd, bd;

const run = (req, ...args) => bd.prepare(req).run(...args);
const lire = (req, ...args) => bd.prepare(req).get(...args);
const tous = (req, ...args) => bd.prepare(req).all(...args);
const jeton = () => crypto.randomBytes(24).toString('base64url');
const base = (id) => `/api/initiatives/${id}/newsletter`;

test.before(async () => {
  env = await H.demarrer('newsletter-abonnes');
  bd = new H.DatabaseSync(env.dbPath);
  rnd = Math.random().toString(36).slice(2, 8);
  jarA = H.cookieJar(); jarB = H.cookieJar(); jarS1 = H.cookieJar(); jarS2 = H.cookieJar(); jarS3 = H.cookieJar();
  const a = await H.creerApprenant(env, jarA, rnd, 'ProprioA');
  const b = await H.creerApprenant(env, jarB, rnd, 'ProprioB');
  const s1 = await H.creerApprenant(env, jarS1, rnd, 'SuiveurUn');
  const s2 = await H.creerApprenant(env, jarS2, rnd, 'SuiveurDeux');
  const s3 = await H.creerApprenant(env, jarS3, rnd, 'SuiveurTrois');
  const uid = (e) => lire('SELECT id FROM users WHERE email=?', e).id;
  idA = Number(run("INSERT INTO initiatives (nom, boutique_nom, owner_user_id) VALUES ('Nom interne A', 'Chez Alpha', ?)", uid(a.email)).lastInsertRowid);
  idB = Number(run("INSERT INTO initiatives (nom, owner_user_id) VALUES ('Boutique Beta', ?)", uid(b.email)).lastInsertRowid);
  uidS1 = uid(s1.email); uidS2 = uid(s2.email); uidS3 = uid(s3.email);
  emailS1 = s1.email.toLowerCase(); emailS2 = s2.email.toLowerCase(); emailS3 = s3.email.toLowerCase();
  for (const u of [uidS1, uidS2, uidS3]) run('INSERT INTO abonnements (user_id, initiative_id) VALUES (?,?)', u, idA);
  /* Le propriétaire se suit lui-même : il n'est jamais interrogé. */
  run('INSERT INTO abonnements (user_id, initiative_id) VALUES (?,?)', uid(a.email), idA);
});
test.after(() => { try { bd && bd.close(); } catch (e) {} env && env.stop(); });

test('N3 export CSV : réservé au propriétaire, accents lisibles, formules neutralisées', async () => {
  run(`INSERT INTO nl_abonnes (initiative_id, email, nom, source, statut, jeton, consentement_le) VALUES (?,?,?,?,?,?,datetime('now'))`, idA, `piege-${rnd}@example.com`, '=CMD("x")', 'formulaire', 'actif', jeton());
  run(`INSERT INTO nl_abonnes (initiative_id, email, nom, source, statut, jeton, consentement_le) VALUES (?,?,?,?,?,?,datetime('now'))`, idA, `aissatou-${rnd}@example.com`, 'Aïssatou; "Aïcha"', 'formulaire', 'en_attente', jeton());
  run(`INSERT INTO nl_abonnes (initiative_id, email, source, statut, jeton) VALUES (?,?,?,?,?)`, idB, `autre-${rnd}@example.com`, 'formulaire', 'actif', jeton());
  const get = (jar) => { const h = {}; if (jar) jar.apply(h); return fetch(`${env.base}${base(idA)}/abonnes.csv`, { headers: h }); };
  assert.equal((await get(null)).status, 401);
  assert.equal((await get(jarB)).status, 403);
  const r = await get(jarA);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /attachment/);
  const octets = Buffer.from(await r.arrayBuffer());
  assert.deepEqual([...octets.subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'BOM UTF-8 : Excel lit correctement les accents');
  const t = octets.toString('utf8').replace(/^﻿/, '');
  assert.ok(t.startsWith('email;nom;statut;origine'), 'en-têtes');
  assert.ok(t.includes(`aissatou-${rnd}@example.com;"Aïssatou; ""Aïcha"""`), 'nom avec accents, point-virgule et guillemets');
  assert.ok(t.includes(`;'=CMD(""x"")`) || t.includes(`'=CMD(`), 'une formule est neutralisée par une apostrophe');
  assert.ok(!t.includes(`autre-${rnd}@example.com`), "jamais les abonnés d'une autre boutique");
  assert.ok(!/jeton/i.test(t) && !/[A-Za-z0-9_-]{32}/.test(t.replace(/@.*$/gm, '')), 'aucun jeton dans le fichier');
});

test('N3 cellule et exportCsv : fonctions pures', () => {
  assert.equal(NA.cellule('=1+1'), "'=1+1");
  assert.equal(NA.cellule('+33 6'), "'+33 6");
  assert.equal(NA.cellule('simple'), 'simple');
  assert.equal(NA.cellule('a;b'), '"a;b"');
  assert.equal(NA.cellule(null), '');
  assert.equal(NA.cellule('ligne1\nligne2'), 'ligne1 ligne2');
});

test('N3 comptage des comptes qui suivent : seuls les propriétaires y accèdent', async () => {
  assert.equal((await env.call(null, 'GET', `${base(idA)}/suiveurs`)).status, 401);
  assert.equal((await env.call(jarB, 'GET', `${base(idA)}/suiveurs`)).status, 403);
  const r = await env.call(jarA, 'GET', `${base(idA)}/suiveurs`);
  assert.equal(r.status, 200);
  assert.equal(r.data.suiveurs, 4);
  assert.equal(r.data.a_interroger, 3, 'le propriétaire lui-même est exclu');
  assert.equal(r.data.deja_interroges, 0);
});

test('N3 un compte déjà dans la liste ou déjà désabonné n\'est pas interrogé', async () => {
  run(`INSERT INTO nl_abonnes (initiative_id, email, source, statut, jeton, desabonne_le) VALUES (?,?,?,?,?,datetime('now'))`, idA, emailS3, 'formulaire', 'desabonne', jeton());
  const r = await env.call(jarA, 'GET', `${base(idA)}/suiveurs`);
  assert.equal(r.data.a_interroger, 2, 'quelqu\'un qui s\'est désabonné n\'est jamais relancé');
  assert.equal(r.data.deja_dans_la_liste, 1);
});

test('N3 la demande d\'accord part une seule fois par compte et crée une notification avec le lien', async () => {
  assert.equal((await env.call(null, 'POST', `${base(idA)}/demander-accord`)).status, 401);
  assert.equal((await env.call(jarB, 'POST', `${base(idA)}/demander-accord`)).status, 403);
  const r = await env.call(jarA, 'POST', `${base(idA)}/demander-accord`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.envoyees, 2);
  assert.equal(tous('SELECT id FROM nl_demandes WHERE initiative_id=?', idA).length, 2);
  const n = lire("SELECT * FROM notifications WHERE user_id=? AND type='newsletter_accord'", uidS1);
  assert.ok(n, 'notification créée');
  assert.match(n.titre, /Chez Alpha/);
  assert.match(JSON.parse(n.data_json).lien, /^newsletter-accord\.html\?d=\d+$/);
  assert.equal(lire("SELECT COUNT(*) AS n FROM notifications WHERE type='newsletter_accord' AND user_id=?", uidS3).n, 0, 'le désabonné ne reçoit rien');
  /* Un second clic n'envoie plus rien à personne. */
  const encore = await env.call(jarA, 'POST', `${base(idA)}/demander-accord`);
  assert.equal(encore.status, 200);
  assert.equal(encore.data.envoyees, 0);
  assert.equal(lire("SELECT COUNT(*) AS n FROM notifications WHERE type='newsletter_accord' AND user_id=?", uidS1).n, 1);
  /* Aucune personne n'est abonnée tant qu'elle n'a pas répondu. */
  assert.equal(lire('SELECT id FROM nl_abonnes WHERE initiative_id=? AND email=?', idA, emailS1), undefined);
});

test('N3 le compte voit sa demande, peut accepter, et devient abonné actif avec sa propre adresse', async () => {
  assert.equal((await env.call(null, 'GET', '/api/newsletter/mes-demandes')).status, 401);
  const liste = await env.call(jarS1, 'GET', '/api/newsletter/mes-demandes');
  assert.equal(liste.status, 200);
  assert.equal(liste.data.demandes.length, 1);
  assert.equal(liste.data.demandes[0].boutique, 'Chez Alpha');
  const id = liste.data.demandes[0].id;
  /* Une demande ne se traite qu'avec le compte concerné. */
  assert.equal((await env.call(jarS2, 'POST', `/api/newsletter/demandes/${id}/repondre`, { accepte: true })).status, 404);
  assert.equal((await env.call(jarS1, 'POST', `/api/newsletter/demandes/${id}/repondre`, {})).status, 400, 'oui ou non obligatoire');
  const ok = await env.call(jarS1, 'POST', `/api/newsletter/demandes/${id}/repondre`, { accepte: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const ab = lire('SELECT * FROM nl_abonnes WHERE initiative_id=? AND email=?', idA, emailS1);
  assert.equal(ab.statut, 'actif');
  assert.equal(ab.source, 'suivi');
  assert.ok(ab.consentement_le && ab.confirme_le);
  assert.equal((await env.call(jarS1, 'POST', `/api/newsletter/demandes/${id}/repondre`, { accepte: true })).status, 409, 'on ne répond qu\'une fois');
  assert.equal((await env.call(jarS1, 'GET', '/api/newsletter/mes-demandes')).data.demandes.length, 0);
});

test('N3 refuser la demande n\'ajoute personne et ne permet aucune nouvelle demande', async () => {
  const id = (await env.call(jarS2, 'GET', '/api/newsletter/mes-demandes')).data.demandes[0].id;
  const r = await env.call(jarS2, 'POST', `/api/newsletter/demandes/${id}/repondre`, { accepte: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.accepte, false);
  assert.equal(lire('SELECT id FROM nl_abonnes WHERE initiative_id=? AND email=?', idA, emailS2), undefined);
  const c = await env.call(jarA, 'GET', `${base(idA)}/suiveurs`);
  assert.deepEqual(c.data.reponses, { en_attente: 0, acceptees: 1, refusees: 1 });
  assert.equal(c.data.a_interroger, 0);
  const encore = await env.call(jarA, 'POST', `${base(idA)}/demander-accord`);
  assert.equal(encore.data.envoyees, 0, 'un refus n\'est jamais relancé');
});

test('N3 le tableau de bord Initiative contient la section Newsletter, branchée comme les autres modules', () => {
  const fs = require('node:fs'), path = require('node:path');
  const racine = path.join(__dirname, '..');
  const d = fs.readFileSync(path.join(racine, 'dashboard-initiative.html'), 'utf8');
  assert.match(d, /<a href="#newsletter-init" data-section="newsletter-init">/, 'lien du menu');
  assert.match(d, /id="newsletter-init"/, 'conteneur de la section');
  assert.match(d, /'newsletter-init'/, 'section déclarée dans INIT_SECTIONS');
  assert.match(d, /name === 'newsletter-init' && window\.NewsletterInit/, "chargement à l'ouverture");
  assert.match(d, /assets\/newsletter-init\.js/);
  assert.match(d, /assets\/newsletter-init\.css/);
  const js = fs.readFileSync(path.join(racine, 'assets', 'newsletter-init.js'), 'utf8');
  assert.match(js, /window\.NewsletterInit = \{ monter: monter \}/);
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(js), "aucun émoticône dans l'écran");
  assert.match(js, /sandbox=""/, "l'aperçu est isolé dans un cadre sans aucun droit");
  const p = fs.readFileSync(path.join(racine, 'newsletter-accord.html'), 'utf8');
  assert.match(p, /\/newsletter\/demandes\//);
});

test('N3 un abonné qui accepte apparaît dans l\'export avec l\'origine « suivi »', async () => {
  const h = {}; jarA.apply(h);
  const t = await (await fetch(`${env.base}${base(idA)}/abonnes.csv`, { headers: h })).text();
  assert.ok(t.includes(`${emailS1};`) && /;actif;suivi;/.test(t));
});
