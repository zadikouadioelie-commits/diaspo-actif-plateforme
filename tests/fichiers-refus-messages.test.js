/* ===========================================================
   tests/fichiers-refus-messages.test.js — un fichier refusé doit TOUJOURS être signalé (2026-11-20)
   ===========================================================
   Demande du titulaire : quand un fichier joint est de mauvais format, trop gros ou illisible, la personne doit le savoir, avec le nom du fichier et ce qu'il faut faire.
   Avant : un envoi trop volumineux restait sans réponse (504 après 30 s) ; un document refusé par l'IA donnait un faux « Koffi indisponible ».
   Lancer : node --test tests/fichiers-refus-messages.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const H = require('./_formation-harness');

let env;
test.before(async () => { process.env.KOFI_IA_FAUSSE = '1'; process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z'; env = await H.demarrer('fichiers-refus'); });
test.after(() => { if (env) env.stop(); });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
const gros = (mo) => JSON.stringify({ texte: 'essai', fichiers: [{ nom: 'a.pdf', data: 'data:application/pdf;base64,' + 'A'.repeat(Math.round(mo * 1e6)) }] });
const poster = (chemin, body) => fetch(env.base + chemin, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(15000) });

test('Serveur : un envoi trop volumineux reçoit une réponse claire (413), pas une connexion coupée', async () => {
  /* Route ordinaire (1 Mo), avec la query que Vercel ajoute. */
  let t0 = Date.now();
  let r = await poster('/api/auth/login?path=auth%2Flogin', gros(1.5));
  assert.equal(r.status, 413); const d = await r.json();
  assert.equal(d.code, 'trop_volumineux'); assert.match(d.error, /trop volumineux/i); assert.ok(Date.now() - t0 < 5000, 'réponse immédiate');
  /* Route de Koffi des sondages (5 Mo) : le message parle des fichiers joints et de la limite de 3 Mo. */
  t0 = Date.now();
  r = await poster('/api/kofi/sondages/messages?path=kofi%2Fsondages%2Fmessages', gros(6));
  assert.equal(r.status, 413); const k = await r.json();
  assert.equal(k.code, 'trop_volumineux'); assert.match(k.error, /fichiers joints sont trop lourds/i); assert.match(k.error, /3 Mo/); assert.ok(Date.now() - t0 < 5000);
  /* Le serveur reste en vie après ces refus. */
  assert.equal((await fetch(env.base + '/api/visits')).status, 200);
});

test('Koffi sondages : format refusé, poids refusé, document refusé par l\'IA — chaque fois un message qui nomme le fichier ou dit quoi faire, et aucun crédit pris', async () => {
  const rnd = Math.random().toString(36).slice(2, 7);
  const jar = H.cookieJar(), adm = H.cookieJar();
  await H.creerFormateur(env, adm, rnd, 'Adm');
  assert.equal((await env.call(adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
  assert.equal((await env.call(adm, 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
  const dire = (texte, extra) => env.call(adm, 'POST', '/api/kofi/sondages/messages', { texte, ...extra });
  const uid = sql('select id from users where email=?', H.compte(rnd, 'Adm', 'utilisateur').email)[0].id;
  const nbUsage = () => sql("select count(*) n from kofi_usage where user_id=? and categorie like 'sondages_%'", uid)[0].n;

  /* 1. Mauvais format : le message nomme le fichier. */
  let r = await dire('Lis ça', { fichiers: [{ nom: 'budget.xlsx', data: 'data:application/vnd.ms-excel;base64,' + Buffer.from('PK pas un pdf du tout, juste du texte long enough').toString('base64') }] });
  assert.equal(r.status, 400); assert.equal(r.data.code, 'format'); assert.match(r.data.error, /budget\.xlsx/); assert.match(r.data.error, /PDF/);

  /* 2. Trop lourd (entre 3 et 4,5 Mo) : le serveur dit « trop lourds » et ce qu'il faut faire. */
  const lourd = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n' + 'x'.repeat(3.2e6)).toString('base64');
  r = await dire('Lis ça', { fichiers: [{ nom: 'gros.pdf', data: lourd }] });
  assert.equal(r.status, 400); assert.equal(r.data.code, 'trop_gros'); assert.match(r.data.error, /trop lourds/); assert.match(r.data.error, /3 Mo/);

  /* 3. Document refusé par le fournisseur d'IA : vrai message (pas « indisponible »), crédit non pris. */
  const ok = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\nTITRE: Essai\n%%EOF').toString('base64');
  r = await dire('REQUETEFAUSSE lis ce document', { fichiers: [{ nom: 'abime.pdf', data: ok }] });
  assert.equal(r.status, 422, JSON.stringify(r.data)); assert.equal(r.data.code, 'fichier_illisible');
  assert.match(r.data.error, /pas pu lire ce document/); assert.match(r.data.error, /crédit n'a pas été décompté/);
  assert.equal(nbUsage(), 0, 'aucun crédit ni usage enregistré pour un fichier refusé');

  /* 4. Sans fichier, la même demande refusée garde le message habituel (pas de faux message « document »). */
  r = await dire('REQUETEFAUSSE bonjour');
  assert.notEqual(r.data.code, 'fichier_illisible');
});

test('Écran : les refus de fichier nomment le fichier et son poids ; les erreurs 413 et délai ont leur message', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'koffi-sondages.js'), 'utf8');
  const f = src.match(/function msgF\(modele, file, poids\) \{[\s\S]*?\n  \}/);
  assert.ok(f, 'msgF existe');
  const msgF = vm.runInNewContext('(' + f[0].replace(/^function msgF/, 'function') + ')');
  const T = {};
  for (const k of ['fichierFormat', 'fichierLecture', 'fichierTrop', 'fichierLourdNom']) { const m = src.match(new RegExp(k + ": '((?:[^'\\\\]|\\\\.)*)'")); assert.ok(m, k + ' défini'); T[k] = m[1].replace(/\\'/g, "'"); }
  assert.match(msgF(T.fichierFormat, { name: 'budget.xlsx', size: 5000 }), /« budget\.xlsx » n'est pas pris en compte/);
  assert.equal(msgF(T.fichierLourdNom, { name: 'dossier.pdf', size: 4.2e6 }), '« dossier.pdf » (4,2 Mo) est trop lourd : les fichiers joints ne peuvent pas dépasser 3 Mo au total. Réduisez le PDF (moins de pages, meilleure compression) ou choisissez une photo plus légère.');
  assert.match(msgF(T.fichierTrop, { name: 'd.png', size: 10 }), /« d\.png » n'a pas été ajouté/);
  assert.match(msgF(T.fichierLecture, { name: 'x.jpg', size: 10 }), /Impossible de lire « x\.jpg »/);
  assert.ok(!/\{nom\}|\{taille\}/.test(msgF(T.fichierLourdNom, { name: 'a.pdf' })), 'aucun repère laissé sans valeur');
  /* Les réponses 413 (trop gros) et 502/504 (délai) ont leur texte, y compris quand le serveur ne renvoie pas de JSON. */
  assert.match(src, /r\.status === 413 \? T\.envoiTropGros/); assert.match(src, /r\.status === 504 \|\| r\.status === 502\) \? T\.envoiDelai/);
});
