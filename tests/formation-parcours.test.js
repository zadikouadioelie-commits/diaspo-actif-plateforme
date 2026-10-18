/* ===========================================================
   tests/formation-parcours.test.js — Diaspo'Actif Formation, lot 1 (2026-10-18)
   ===========================================================
   Intégration HTTP réelle (même principe que tests/cagnotte-acces.test.js) : un vrai processus serveur contre une COPIE isolée de la base
   de dev (jamais le fichier partagé), sans clé Resend.

   Couvre : activités obligatoires/facultatives, jauge par chapitre, statut et « prochaine activité », quiz corrigés côté serveur
   (le corrigé n'est jamais envoyé avant la réussite, la leçon-quiz ne se valide pas à la main), délivrance AUTOMATIQUE du certificat de
   réussite uniquement quand toutes les conditions sont remplies, vérification publique sans donnée personnelle superflue, révocation.

   Lancer : node --test tests/formation-parcours.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const { DatabaseSync } = require('node:sqlite');

function portLibre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}
const REPO_ROOT = path.join(__dirname, '..');
const TEST_DB_PATH = path.join(os.tmpdir(), `diaspoactif-formation-${process.pid}-${Date.now()}.db`);
const SOURCE_DB_PATH = path.join(REPO_ROOT, 'server', 'diaspoactif.db');
let serverProcess, BASE;

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
async function call(jar, method, urlPath, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (jar) jar.apply(headers);
  const res = await fetch(BASE + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (jar) jar.capture(res);
  let data = null; try { data = await res.json(); } catch (e) {}
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
    serverProcess.stdout.on('data', c => { out += c.toString(); const m = out.match(/serveur démarré sur http:\/\/localhost:(\d+)/); if (m && !demarre) { demarre = true; BASE = `http://localhost:${m[1]}`; resolve(); } });
    serverProcess.stderr.on('data', d => { out += d.toString(); });
    serverProcess.on('error', reject);
    serverProcess.once('exit', code => { if (!demarre) reject(new Error('Serveur arrêté avant démarrage (code ' + code + ') :\n' + out)); });
    setTimeout(() => { if (!demarre) reject(new Error('Timeout démarrage serveur de test :\n' + out)); }, 20000);
  });
});
test.after(() => { if (serverProcess) serverProcess.kill(); try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {} });

test('parcours complet : obligatoire/facultatif, chapitres, quiz serveur, certificat de réussite, vérification publique', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarOwner = cookieJar(), jarLearner = cookieJar(), jarOther = cookieJar();
  const mk = (nom, role) => ({ nom, prenom: 'Aminata', email: `test-${role}-${rnd}-${nom.toLowerCase()}@example.com`, password: 'TestPass123!', role, origine1: "Côte d'Ivoire", pays: 'France', telephone: '+33600000000', domaine_principal: 'formation', bio: 'Compte de test pour la formation.', acceptations: ['cgu', 'confidentialite', 'charte'], _form_ts: Date.now() - 5000 });
  let fid, mod, ch1, ch2, l1, l2, l3, l4, quizId, q = {}, code;

  await t.test('setup — formateur (Initiative), apprenant et un compte non inscrit', async () => {
    /* Le formateur s'inscrit comme simple Utilisateur puis est promu Administrateur dans la base ISOLÉE : l'inscription Initiative exige un long formulaire sans rapport ici. */
    const mkOwner = mk('Formateur', 'utilisateur');
    const r0 = await call(jarOwner, 'POST', '/api/auth/signup', mkOwner); assert.equal(r0.status, 201, JSON.stringify(r0.data));
    const sqlite0 = new DatabaseSync(TEST_DB_PATH);
    sqlite0.prepare("UPDATE users SET role='administrateur' WHERE email=?").run(mkOwner.email);
    sqlite0.close();
    assert.equal((await call(jarLearner, 'POST', '/api/auth/signup', mk('Kone', 'utilisateur'))).status, 201);
    assert.equal((await call(jarOther, 'POST', '/api/auth/signup', mk('Autre', 'utilisateur'))).status, 201);
  });

  await t.test('construction : 2 chapitres, 4 leçons (1 facultative, 1 quiz), 4 questions', async () => {
    let r = await call(jarOwner, 'POST', '/api/formations', { titre: 'Formation test ' + rnd, description: 'Une formation de test.', organisme: 'Organisme Test' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); fid = r.data.id;
    r = await call(jarOwner, 'POST', `/api/formations/${fid}/modules`, { titre: 'Module 1' }); assert.equal(r.status, 201, JSON.stringify(r.data)); mod = r.data.id;
    r = await call(jarOwner, 'POST', `/api/formations/${fid}/modules/${mod}/chapitres`, { titre: 'Chapitre 1' }); ch1 = r.data.id;
    r = await call(jarOwner, 'POST', `/api/formations/${fid}/modules/${mod}/chapitres`, { titre: 'Chapitre 2' }); ch2 = r.data.id;
    const lecon = async (ch, titre, type, extra) => (await call(jarOwner, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre, type, contenu_texte: '<p>contenu</p>', ...(extra || {}) })).data.id;
    l1 = await lecon(ch1, 'Introduction', 'texte');
    l2 = await lecon(ch1, 'Lecture complémentaire', 'texte', { obligatoire: false });
    l3 = await lecon(ch2, 'Quiz du chapitre 2', 'quiz');
    l4 = await lecon(ch2, 'Conclusion', 'texte');
    assert.ok(l1 && l2 && l3 && l4);
    r = await call(jarOwner, 'POST', `/api/formations/${fid}/quiz`, { titre: 'Quiz ch.2', type: 'exercice', note_minimale: 60, lecon_id: l3 }); quizId = r.data.id;
    const add = async (k, body) => { const x = await call(jarOwner, 'POST', `/api/formations/${fid}/quiz/${quizId}/questions`, body); assert.equal(x.status, 201, JSON.stringify(x.data)); q[k] = x.data.id; };
    await add('qcm', { question: 'Capitale du Sénégal ?', type: 'qcm', options: ['Paris', 'Dakar', 'Lyon'], reponse_correcte: 'Dakar' });
    await add('vf', { question: 'Le manioc est un tubercule.', type: 'vrai_faux', reponse_correcte: 'Vrai' });
    await add('texte', { question: 'Pays dont Yamoussoukro est la capitale ?', type: 'texte_libre', reponse_correcte: "Côte d'Ivoire|Cote d Ivoire" });
    await add('libre', { question: 'Votre avis ?', type: 'texte_libre' });
  });

  await t.test('certificat de RÉUSSITE refusé tant qu\'il n\'existe aucune évaluation ; type inconnu refusé', async () => {
    const f2 = (await call(jarOwner, 'POST', '/api/formations', { titre: 'Sans quiz ' + rnd })).data.id;
    let r = await call(jarOwner, 'PUT', `/api/formations/${f2}/certificat`, { certificat_actif: true, certificat_type: 'reussite' });
    assert.equal(r.status, 400);
    r = await call(jarOwner, 'PUT', `/api/formations/${f2}/certificat`, { certificat_actif: true, certificat_type: 'diplome_officiel' });
    assert.equal(r.status, 400);
    r = await call(jarOwner, 'PUT', `/api/formations/${f2}/certificat`, { certificat_actif: true, certificat_type: 'suivi' });
    assert.equal(r.status, 200);
  });

  await t.test('activation du certificat de réussite + publication + inscription', async () => {
    let r = await call(jarOwner, 'PUT', `/api/formations/${fid}/certificat`, { certificat_actif: true, certificat_type: 'reussite' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const sqlite = new DatabaseSync(TEST_DB_PATH);
    sqlite.prepare("UPDATE formations SET statut='publiee' WHERE id=?").run(fid);
    sqlite.close();
    r = await call(jarLearner, 'POST', `/api/formations/${fid}/inscrire`, {});
    assert.equal(r.status, 201, JSON.stringify(r.data));
  });

  await t.test('état initial : non commencé, 3 activités obligatoires, prochaine = introduction', async () => {
    const r = await call(jarLearner, 'GET', `/api/formations/${fid}/suivre`);
    assert.equal(r.status, 200);
    assert.equal(r.data.parcours.statut, 'non_commence');
    assert.equal(r.data.parcours.nb_total, 3);
    assert.equal(r.data.avancement_pct, 0);
    assert.equal(r.data.parcours.prochaine_lecon_id, l1);
    const chap = r.data.modules[0].chapitres;
    assert.equal(chap[0].stats.total, 1, 'ch.1 : une seule activité obligatoire');
    assert.equal(chap[1].stats.total, 2);
    assert.equal(r.data.attestation.type, 'reussite');
    assert.equal(r.data.attestation.delivree, null);
    assert.equal(r.data.attestation.conditions.length, 2);
  });

  await t.test('une activité FACULTATIVE ne fait pas avancer la jauge', async () => {
    const r = await call(jarLearner, 'POST', `/api/formations/${fid}/lecons/${l2}/progression`, { termine: true });
    assert.equal(r.status, 200); assert.equal(r.data.avancement_pct, 0);
    const s = await call(jarLearner, 'GET', `/api/formations/${fid}/suivre`);
    assert.equal(s.data.parcours.statut, 'en_cours', 'commencé');
  });

  await t.test('une leçon-quiz ne se valide PAS d\'un simple clic', async () => {
    const r = await call(jarLearner, 'POST', `/api/formations/${fid}/lecons/${l3}/progression`, { termine: true });
    assert.equal(r.status, 409); assert.equal(r.data.code, 'quiz_requis');
  });

  await t.test('introduction terminée : jauge globale 33 %, chapitre 1 à 100 %', async () => {
    const r = await call(jarLearner, 'POST', `/api/formations/${fid}/lecons/${l1}/progression`, { termine: true });
    assert.equal(r.data.avancement_pct, 33);
    const s = await call(jarLearner, 'GET', `/api/formations/${fid}/suivre`);
    assert.equal(s.data.modules[0].chapitres[0].stats.pct, 100);
    assert.equal(s.data.modules[0].chapitres[1].stats.pct, 0);
    assert.equal(s.data.parcours.prochaine_lecon_id, l3);
  });

  await t.test('non inscrit : ni passage du quiz ni lecture du corrigé', async () => {
    assert.equal((await call(jarOther, 'GET', `/api/formations/${fid}/quiz/${quizId}/passer`)).status, 403);
    assert.equal((await call(jarOther, 'POST', `/api/formations/${fid}/quiz/${quizId}/soumettre`, { reponses: {} })).status, 403);
    assert.equal((await call(jarLearner, 'GET', `/api/formations/${fid}/quiz`)).status, 403, 'le corrigé reste réservé au formateur');
  });

  await t.test('questions envoyées SANS les bonnes réponses', async () => {
    const r = await call(jarLearner, 'GET', `/api/formations/${fid}/quiz/${quizId}/passer`);
    assert.equal(r.status, 200);
    assert.equal(r.data.questions.length, 4);
    assert.ok(!JSON.stringify(r.data).includes('reponse_correcte'));
    assert.ok(!JSON.stringify(r.data).includes('Dakar') || r.data.questions[0].options.includes('Dakar'), 'Dakar n\'apparaît que comme choix');
    assert.deepEqual(r.data.questions.find(x => x.id === q.vf).options, ['Vrai', 'Faux']);
    assert.equal(r.data.quiz.note_minimale, 60);
  });

  await t.test('tentative RATÉE (1 bonne sur 3 notées = 33 % < 60 %) : leçon non validée, aucun corrigé révélé', async () => {
    const r = await call(jarLearner, 'POST', `/api/formations/${fid}/quiz/${quizId}/soumettre`, { reponses: { [q.qcm]: 'Paris', [q.vf]: 'Vrai', [q.texte]: 'Mali', [q.libre]: 'Super' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.reussi, false);
    assert.equal(r.data.nb_non_notees, 1, 'la question sans réponse de référence n\'est pas notée');
    assert.ok(r.data.note_pct > 30 && r.data.note_pct < 34);
    assert.ok(r.data.detail.every(d => !d.bonne_reponse), 'pas de corrigé tant que le quiz n\'est pas réussi');
    assert.equal(r.data.avancement_pct, 33);
    assert.equal(r.data.attestation, null);
  });

  await t.test('tentative RÉUSSIE (accents/casse tolérés) : leçon validée, jauge 67 %, corrigé révélé', async () => {
    const r = await call(jarLearner, 'POST', `/api/formations/${fid}/quiz/${quizId}/soumettre`, { reponses: { [q.qcm]: 'Dakar', [q.vf]: 'vrai', [q.texte]: "  côte d'ivoire. ", [q.libre]: '' } });
    assert.equal(r.data.reussi, true); assert.equal(r.data.note_pct, 100);
    assert.equal(r.data.avancement_pct, 67);
    assert.equal(r.data.attestation, null, 'pas encore : il reste la conclusion');
    assert.ok(r.data.detail.find(d => d.question_id === q.qcm).bonne_reponse);
    const s = await call(jarLearner, 'GET', `/api/formations/${fid}/suivre`);
    const lq = s.data.modules[0].chapitres[1].lecons.find(x => x.id === l3);
    assert.equal(lq.termine, true); assert.equal(lq.quiz.reussi, true); assert.equal(lq.quiz.nb_tentatives, 2); assert.equal(lq.quiz.meilleure_note, 100);
  });

  await t.test('dernière activité terminée → 100 % et CERTIFICAT DE RÉUSSITE délivré automatiquement', async () => {
    const r = await call(jarLearner, 'POST', `/api/formations/${fid}/lecons/${l4}/progression`, { termine: true });
    assert.equal(r.data.avancement_pct, 100); assert.equal(r.data.statut, 'termine');
    assert.ok(r.data.attestation, 'attestation délivrée');
    assert.equal(r.data.attestation.type, 'reussite');
    assert.equal(r.data.attestation.resultat_pct, 100);
    assert.match(r.data.attestation.code, /^DA-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    code = r.data.attestation.code;
    /* idempotent : rejouer ne crée pas un 2e document */
    const again = await call(jarLearner, 'POST', `/api/formations/${fid}/lecons/${l4}/progression`, { termine: true });
    assert.equal(again.data.attestation.code, code);
    const mes = await call(jarLearner, 'GET', '/api/mes-attestations');
    assert.equal(mes.data.attestations.length, 1);
  });

  await t.test('document complet : réservé à son titulaire', async () => {
    assert.equal((await call(jarLearner, 'GET', `/api/attestations/mon/${code}`)).status, 200);
    assert.equal((await call(jarOther, 'GET', `/api/attestations/mon/${code}`)).status, 404);
    assert.equal((await call(null, 'GET', `/api/attestations/mon/${code}`)).status, 401);
  });

  await t.test('vérification PUBLIQUE : authentique, identité réduite (prénom + initiale), aucune donnée interne', async () => {
    const r = await call(null, 'GET', `/api/attestations/verifier/${code.toLowerCase()}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.trouve, true); assert.equal(r.data.valide, true);
    assert.equal(r.data.type_label, 'Certificat de réussite');
    assert.equal(r.data.beneficiaire, 'Aminata K.');
    assert.equal(r.data.organisme.length > 0, true);
    const brut = JSON.stringify(r.data);
    assert.ok(!/example\.com|user_id|inscription_id|"email"/i.test(brut), 'aucune donnée personnelle superflue');
    assert.ok(r.data.avertissement.includes("ni un diplôme reconnu par l'État"));
    assert.equal((await call(null, 'GET', '/api/attestations/verifier/DA-FAUX-FAUX-FAUX')).status, 404);
  });

  await t.test('révocation : refusée à un tiers, acceptée au formateur, le code reste vérifiable mais « révoqué »', async () => {
    assert.equal((await call(jarLearner, 'POST', `/api/attestations/${code}/revoquer`, { motif: 'x' })).status, 403);
    assert.equal((await call(jarOwner, 'POST', `/api/attestations/${code}/revoquer`, {})).status, 400);
    assert.equal((await call(jarOwner, 'POST', `/api/attestations/${code}/revoquer`, { motif: 'Erreur d\'émission' })).status, 200);
    const r = await call(null, 'GET', `/api/attestations/verifier/${code}`);
    assert.equal(r.data.valide, false); assert.equal(r.data.statut, 'revoque');
  });
});
