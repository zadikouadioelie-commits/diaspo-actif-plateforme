/* Harnais commun aux tests d'intégration « Diaspo'Actif Formation » : un vrai serveur contre une COPIE isolée de la base de dev, sans clé Resend.
   (Fichier sans suffixe .test.js : le lanceur de tests ne l'exécute pas lui-même.) */
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const { DatabaseSync } = require('node:sqlite');

const REPO_ROOT = path.join(__dirname, '..');
const SOURCE_DB_PATH = path.join(REPO_ROOT, 'server', 'diaspoactif.db');

function portLibre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}
function cookieJar() {
  const jar = {};
  return {
    apply(headers) { const c = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '); if (c) headers['Cookie'] = c; },
    capture(res) {
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      for (const line of raw) { const [pair] = line.split(';'); const i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
    },
  };
}

/* Démarre le serveur ; retourne { call, dbPath, stop }. */
async function demarrer(tag) {
  const dbPath = path.join(os.tmpdir(), `diaspoactif-${tag}-${process.pid}-${Date.now()}.db`);
  fs.copyFileSync(SOURCE_DB_PATH, dbPath);
  const port = await portLibre();
  let base, demarre = false, proc;
  await new Promise((resolve, reject) => {
    proc = spawn(process.execPath, ['server/index.js'], {
      cwd: REPO_ROOT,
      env: { ...process.env, PORT: String(port), DIASPOACTIF_TEST_DB_PATH: dbPath, RESEND_API_KEY: '', RESEND_KEY_PROD: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    proc.stdout.on('data', c => { out += c.toString(); const m = out.match(/serveur démarré sur http:\/\/localhost:(\d+)/); if (m && !demarre) { demarre = true; base = `http://localhost:${m[1]}`; resolve(); } });
    proc.stderr.on('data', d => { out += d.toString(); });
    proc.on('error', reject);
    proc.once('exit', code => { if (!demarre) reject(new Error('Serveur arrêté avant démarrage (code ' + code + ') :\n' + out)); });
    setTimeout(() => { if (!demarre) reject(new Error('Timeout démarrage serveur de test :\n' + out)); }, 20000);
  });
  async function call(jar, method, urlPath, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (jar) jar.apply(headers);
    const res = await fetch(base + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (jar) jar.capture(res);
    let data = null; try { data = await res.json(); } catch (e) {}
    return { status: res.status, ok: res.ok, data };
  }
  return { call, dbPath, base, stop() { try { proc.kill(); } catch (e) {} try { fs.unlinkSync(dbPath); } catch (e) {} } };
}

/* Corps d'inscription valide (les champs obligatoires évoluent : tout est centralisé ici). */
function compte(rnd, nom, role) {
  return { nom, prenom: 'Aminata', email: `test-${role}-${rnd}-${nom.toLowerCase()}@example.com`, password: 'TestPass123!', role, origine1: "Côte d'Ivoire", pays: 'France', telephone: '+33600000000', domaine_principal: 'formation', bio: 'Compte de test pour la formation.', acceptations: ['cgu', 'confidentialite', 'charte'], _form_ts: Date.now() - 5000 };
}

/* Formateur = simple Utilisateur promu Administrateur dans la base ISOLÉE (l'inscription Initiative exige un long formulaire sans rapport ici). */
async function creerFormateur(env, jar, rnd, nom) {
  const c = compte(rnd, nom, 'utilisateur');
  const r = await env.call(jar, 'POST', '/api/auth/signup', c);
  if (r.status !== 201) throw new Error('signup formateur : ' + JSON.stringify(r.data));
  const sq = new DatabaseSync(env.dbPath);
  sq.prepare("UPDATE users SET role='administrateur' WHERE email=?").run(c.email);
  sq.close();
  return c;
}
async function creerApprenant(env, jar, rnd, nom) {
  const c = compte(rnd, nom, 'utilisateur');
  const r = await env.call(jar, 'POST', '/api/auth/signup', c);
  if (r.status !== 201) throw new Error('signup apprenant : ' + JSON.stringify(r.data));
  return c;
}
function publier(env, formationId) {
  const sq = new DatabaseSync(env.dbPath);
  sq.prepare("UPDATE formations SET statut='publiee' WHERE id=?").run(formationId);
  sq.close();
}

module.exports = { demarrer, cookieJar, compte, creerFormateur, creerApprenant, publier, DatabaseSync };
