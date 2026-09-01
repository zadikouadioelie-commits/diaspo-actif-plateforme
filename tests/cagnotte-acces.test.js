/* ===========================================================
   tests/cagnotte-acces.test.js — "Demander l'accès" à une cagnotte privée (2026-09-01)
   ===========================================================
   Contrairement aux autres suites de ce dossier (fake db / SQLite en mémoire contre un
   module isolé), la logique de ce module vit entièrement dans les handlers de route de
   server/index.js (comme le reste du module Cagnotte, jamais extrait). On teste donc ici
   par intégration HTTP réelle : un vrai processus serveur, contre un fichier SQLite ISOLÉ
   (DIASPOACTIF_TEST_DB_PATH, temp file jeté à la fin) — jamais la base de dev partagée —
   et sans RESEND_API_KEY dans l'environnement du process enfant (le mailer se contente
   alors de logger "email non envoyé", aucun appel réseau réel).

   Couvre les 10 scénarios du cahier des charges "Demander l'accès" (§30) + la règle de
   sécurité §12 (une adresse e-mail approuvée n'authentifie jamais un autre compte connecté).

   Lancer : npm test  (ou : node --test tests/cagnotte-acces.test.js)
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');

/* Le serveur logge http://localhost:${PORT} en reprenant tel quel la variable d'env PORT
   (jamais le port réellement lié par l'OS) — PORT=0 afficherait donc "localhost:0", inutile
   pour ce test. On réserve nous-mêmes un port libre AVANT de démarrer le process enfant. */
function portLibre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

const REPO_ROOT = path.join(__dirname, '..');
const TEST_DB_PATH = path.join(os.tmpdir(), `diaspoactif-test-${process.pid}-${Date.now()}.db`);
/* Copie du fichier SQLite de dev existant plutôt qu'une base neuve : server/db.js a un bug
   d'ordre pré-existant (sans rapport avec ce module) où certaines migrations ad-hoc tournent
   avant la CREATE TABLE de la table qu'elles visent — invisible sur une base qui existe déjà
   depuis longtemps (constaté ici : la table se crée, la colonne n'est ajoutée nulle part, et
   un rebuild de migration plus loin plante). Une base neuve isolée expose ce bug au premier
   démarrage ; une COPIE isolée de la base de dev réelle a le bon historique de schéma et reste
   totalement isolée (aucune écriture ne touche le fichier partagé). */
const SOURCE_DB_PATH = path.join(REPO_ROOT, 'server', 'diaspoactif.db');

let serverProcess;
let BASE;

function cookieJar() {
  const jar = {};
  return {
    apply(headers) {
      const c = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
      if (c) headers['Cookie'] = c;
    },
    capture(res) {
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
      for (const line of raw) {
        const [pair] = line.split(';');
        const [k, v] = pair.split('=');
        jar[k] = v;
      }
    },
  };
}

async function call(jar, method, urlPath, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (jar) jar.apply(headers);
  const res = await fetch(BASE + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (jar) jar.capture(res);
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, ok: res.ok, data };
}

test.before(async () => {
  fs.copyFileSync(SOURCE_DB_PATH, TEST_DB_PATH);
  const port = await portLibre();
  let demarre = false;
  await new Promise((resolve, reject) => {
    serverProcess = spawn(process.execPath, ['server/index.js'], {
      cwd: REPO_ROOT,
      env: { ...process.env, PORT: String(port), DIASPOACTIF_TEST_DB_PATH: TEST_DB_PATH, RESEND_API_KEY: '', RESEND_KEY_PROD: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (chunk) => {
      out += chunk.toString();
      const m = out.match(/serveur démarré sur http:\/\/localhost:(\d+)/);
      if (m && !demarre) {
        demarre = true;
        BASE = `http://localhost:${m[1]}`;
        resolve();
      }
    };
    serverProcess.stdout.on('data', onData);
    serverProcess.stderr.on('data', d => { out += d.toString(); });
    serverProcess.on('error', reject);
    serverProcess.once('exit', code => { if (!demarre) reject(new Error('Le serveur de test s\'est arrêté avant démarrage (code ' + code + ') :\n' + out)); });
    setTimeout(() => { if (!demarre) reject(new Error('Timeout démarrage serveur de test :\n' + out)); }, 15000);
  });
});

test.after(() => {
  if (serverProcess) serverProcess.kill();
  try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
});

test('parcours complet "Demander l\'accès" à une cagnotte privée', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarOwner = cookieJar();
  const jarReq = cookieJar();
  const emailOwner = `test-owner-${rnd}@example.com`;
  const emailReq = `test-requester-${rnd}@example.com`;

  await t.test('setup — comptes et cagnotte privée', async () => {
    let r = await call(jarOwner, 'POST', '/api/auth/signup', {
      nom: 'Test Owner', email: emailOwner, password: 'TestPass123!', role: 'initiative',
      origine1: "Côte d'Ivoire", pays: 'France', telephone: '+33600000000', _form_ts: Date.now() - 5000,
    });
    assert.equal(r.status, 201, 'signup owner');

    r = await call(jarReq, 'POST', '/api/auth/signup', {
      nom: 'Test Requester', email: emailReq, password: 'TestPass123!', role: 'utilisateur',
      origine1: "Côte d'Ivoire", pays: 'France', _form_ts: Date.now() - 5000,
    });
    assert.equal(r.status, 201, 'signup requester');
  });

  let cagnotteId, slug;
  await t.test('création + publication de la cagnotte privée', async () => {
    let r = await call(jarOwner, 'POST', '/api/cagnottes', {
      titre: 'Cagnotte de test — accès ' + rnd, categorie: 'autre', visibilite: 'privee',
      objectif_montant: 100, devise: 'EUR',
    });
    assert.equal(r.status, 201);
    cagnotteId = r.data.cagnotte.id;
    slug = r.data.cagnotte.slug;

    r = await call(jarOwner, 'PATCH', `/api/cagnottes/${cagnotteId}/statut`, { action: 'publier' });
    assert.ok(r.ok);
  });

  await t.test('visiteur anonyme : mur privé enrichi (prive:true)', async () => {
    const r = await call(null, 'GET', '/api/cagnottes/public/' + slug);
    assert.equal(r.status, 403);
    assert.equal(r.data.prive, true);
    assert.ok(r.data.titre);
  });

  const emailSansCompte = `test-sanscompte-${rnd}@example.com`;
  await t.test('Test 2 — demande d\'accès SANS compte Diaspo\'Actif', async () => {
    const r = await call(null, 'POST', `/api/cagnottes/public/${slug}/demander-acces`, { email: emailSansCompte, nom: 'Sans Compte' });
    assert.equal(r.status, 201);
    assert.equal(r.data.compte_existant, false);
  });

  await t.test('Test 8 — anti-doublon : une 2e demande identique est refusée', async () => {
    const r = await call(null, 'POST', `/api/cagnottes/public/${slug}/demander-acces`, { email: emailSansCompte, nom: 'Sans Compte' });
    assert.equal(r.status, 400);
  });

  await t.test('statut-acces public reflète "pending"', async () => {
    const r = await call(null, 'GET', `/api/cagnottes/public/${slug}/statut-acces?email=${encodeURIComponent(emailSansCompte)}`);
    assert.equal(r.data.statut, 'pending');
  });

  await t.test('Test 1 — demande d\'accès AVEC compte connecté', async () => {
    const r = await call(jarReq, 'POST', `/api/cagnottes/public/${slug}/demander-acces`, {});
    assert.equal(r.status, 201);
    assert.equal(r.data.compte_existant, true);
    const acces = await call(jarReq, 'GET', '/api/cagnottes/public/' + slug);
    assert.equal(acces.status, 403, 'toujours refusé tant que non approuvé');
  });

  let demandeSansCompteId, demandeReqId;
  await t.test('Test 3 — le gestionnaire approuve une demande', async () => {
    const liste = await call(jarOwner, 'GET', `/api/cagnottes/${cagnotteId}/participants`);
    const dSansCompte = liste.data.participants.find(p => p.email === emailSansCompte);
    const dReq = liste.data.participants.find(p => p.email === emailReq);
    assert.equal(dSansCompte.statut, 'pending');
    assert.equal(dReq.statut, 'pending');
    demandeSansCompteId = dSansCompte.id;
    demandeReqId = dReq.id;

    const r = await call(jarOwner, 'POST', `/api/cagnottes/${cagnotteId}/participants/${demandeSansCompteId}/approuver`);
    assert.ok(r.ok);
  });

  await t.test('Test 7 (§12) — un e-mail approuvé n\'authentifie jamais un AUTRE compte connecté', async () => {
    // jarReq est connecté sous emailReq, dont la demande n'est PAS encore approuvée — même si
    // l'adresse emailSansCompte vient d'être approuvée, jarReq ne doit jamais y accéder :
    // l'accès dépend de la session (user_id), jamais d'un e-mail tiers.
    const r = await call(jarReq, 'GET', '/api/cagnottes/public/' + slug);
    assert.equal(r.status, 403);
  });

  await t.test('Test 4 — le gestionnaire refuse une demande', async () => {
    const r = await call(jarOwner, 'POST', `/api/cagnottes/${cagnotteId}/participants/${demandeReqId}/refuser`);
    assert.ok(r.ok);
    const acces = await call(jarReq, 'GET', '/api/cagnottes/public/' + slug);
    assert.equal(acces.status, 403);
    const statut = await call(jarReq, 'GET', `/api/cagnottes/public/${slug}/statut-acces?email=${encodeURIComponent(emailReq)}`);
    assert.equal(statut.data.statut, 'rejected');
  });

  await t.test('Parcours 5 — re-demande après refus : une seule ligne, pas de doublon', async () => {
    let r = await call(jarReq, 'POST', `/api/cagnottes/public/${slug}/demander-acces`, {});
    assert.equal(r.status, 201);
    const liste = await call(jarOwner, 'GET', `/api/cagnottes/${cagnotteId}/participants`);
    const lignes = liste.data.participants.filter(p => p.email === emailReq);
    assert.equal(lignes.length, 1, 'une seule ligne par (cagnotte, email)');
    assert.equal(lignes[0].statut, 'pending');
    r = await call(jarOwner, 'POST', `/api/cagnottes/${cagnotteId}/participants/${lignes[0].id}/approuver`);
    assert.ok(r.ok);
    demandeReqId = lignes[0].id;
  });

  await t.test('accès réel accordé après approbation', async () => {
    const r = await call(jarReq, 'GET', '/api/cagnottes/public/' + slug);
    assert.ok(r.ok);
    assert.ok(r.data.cagnotte.titre);
  });

  await t.test('Test 5/6 — compte créé APRÈS approbation : association automatique par e-mail', async () => {
    const jarNouveau = cookieJar();
    let r = await call(jarNouveau, 'POST', '/api/auth/signup', {
      nom: 'Sans Compte Devenu Compte', email: emailSansCompte, password: 'TestPass123!', role: 'utilisateur',
      origine1: "Côte d'Ivoire", pays: 'France', _form_ts: Date.now() - 5000,
    });
    assert.equal(r.status, 201);
    r = await call(jarNouveau, 'POST', '/api/auth/login', { email: emailSansCompte, password: 'TestPass123!' });
    assert.ok(r.ok);
    r = await call(jarNouveau, 'GET', '/api/cagnottes/public/' + slug);
    assert.ok(r.ok, 'accès automatique — user_id associé à la ligne approuvée existante');
  });

  await t.test('Test 9 — retrait d\'un accès (revoke, historique conservé)', async () => {
    let r = await call(jarOwner, 'DELETE', `/api/cagnottes/${cagnotteId}/participants/${demandeReqId}`);
    assert.ok(r.ok);
    r = await call(jarReq, 'GET', '/api/cagnottes/public/' + slug);
    assert.equal(r.status, 403);
    const liste = await call(jarOwner, 'GET', `/api/cagnottes/${cagnotteId}/participants`);
    const ligne = liste.data.participants.find(p => p.email === emailReq);
    assert.equal(ligne.statut, 'revoked', 'pas de suppression physique');
  });

  await t.test('Test 10 — normalisation e-mail (majuscules/espaces)', async () => {
    const emailBrut = `  Test-Norm-${rnd}@Example.COM  `;
    let r = await call(null, 'POST', `/api/cagnottes/public/${slug}/demander-acces`, { email: emailBrut, nom: 'Norm' });
    assert.equal(r.status, 201);
    const liste = await call(jarOwner, 'GET', `/api/cagnottes/${cagnotteId}/participants`);
    const ligne = liste.data.participants.find(p => p.email === emailBrut.trim().toLowerCase());
    assert.ok(ligne, 'e-mail normalisé en base');
  });

  await t.test('non-régression — le créateur garde accès à sa propre cagnotte privée', async () => {
    const r = await call(jarOwner, 'GET', '/api/cagnottes/public/' + slug);
    assert.ok(r.ok);
  });
});
