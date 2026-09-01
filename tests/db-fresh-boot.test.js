/* ===========================================================
   tests/db-fresh-boot.test.js — Démarrage à froid sur une base SQLite vide (2026-09-01)
   ===========================================================
   Garde-fou contre la régression du bug trouvé en construisant le module "Demander l'accès"
   (cagnotte privée) : plusieurs migrations ad-hoc de server/db.js (tableau MIGRATIONS +
   quelques ALTER TABLE isolés) tournaient AVANT la création de la table qu'elles modifient —
   invisible sur une base qui existe déjà depuis longtemps, mais faisait planter tout démarrage
   contre une base neuve (nouveau clone, restauration, CI). Un bug distinct (seed FAQ) faisait
   aussi échouer silencieusement une contrainte FOREIGN KEY au premier démarrage — corrigé au
   même moment (getCat() jamais attendu).

   Ce test démarre RÉELLEMENT server/index.js contre un fichier SQLite qui n'existe pas encore
   (DIASPOACTIF_TEST_DB_PATH) et vérifie qu'il atteint bien "serveur démarré" sans exception
   fatale, avec un stderr limité aux avertissements Node connus (jamais une vraie erreur SQLite).

   Lancer : npm test  (ou : node --test tests/db-fresh-boot.test.js)
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');

const REPO_ROOT = path.join(__dirname, '..');
const TEST_DB_PATH = path.join(os.tmpdir(), `diaspoactif-freshboot-${process.pid}-${Date.now()}.db`);

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

test('server/index.js démarre sans erreur contre une base SQLite entièrement neuve', async () => {
  assert.ok(!fs.existsSync(TEST_DB_PATH), 'le fichier de test ne doit pas déjà exister avant ce test');
  const port = await portLibre();
  let serverProcess;
  let stderrOut = '';

  try {
    await new Promise((resolve, reject) => {
      serverProcess = spawn(process.execPath, ['server/index.js'], {
        cwd: REPO_ROOT,
        env: { ...process.env, PORT: String(port), DIASPOACTIF_TEST_DB_PATH: TEST_DB_PATH, RESEND_API_KEY: '', RESEND_KEY_PROD: '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let demarre = false;
      let out = '';
      serverProcess.stdout.on('data', chunk => {
        out += chunk.toString();
        if (!demarre && /serveur démarré sur http:\/\/localhost:(\d+)/.test(out)) { demarre = true; resolve(); }
      });
      serverProcess.stderr.on('data', d => { stderrOut += d.toString(); });
      serverProcess.on('error', reject);
      serverProcess.once('exit', code => { if (!demarre) reject(new Error(`Le serveur s'est arrêté avant "serveur démarré" (code ${code}) :\n${out}\n${stderrOut}`)); });
      setTimeout(() => { if (!demarre) reject(new Error(`Timeout démarrage :\n${out}\n${stderrOut}`)); }, 20000);
    });

    // Laisse le temps aux erreurs non bloquantes (seeds best-effort, catch silencieux) de
    // s'imprimer avant de vérifier stderr — le crash initial, lui, aurait déjà rejeté ci-dessus.
    await new Promise(r => setTimeout(r, 1500));

    /* stderr ne doit contenir QUE l'avertissement Node connu (url.parse deprecation) — toute
       autre ligne est un signal d'un problème de démarrage à froid non traité. */
    const lignesInattendues = stderrOut.split(/\r?\n/).filter(l => l.trim() && !/DEP0169|trace-deprecation/.test(l));
    assert.deepEqual(lignesInattendues, [], `stderr contient des lignes inattendues au démarrage à froid :\n${lignesInattendues.join('\n')}`);
  } finally {
    if (serverProcess) serverProcess.kill();
    try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
  }
});
