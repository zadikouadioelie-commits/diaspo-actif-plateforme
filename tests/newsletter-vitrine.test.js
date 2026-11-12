/* ===========================================================
   tests/newsletter-vitrine.test.js — Newsletter des initiatives, étape N4 (2026-11-12)
   ===========================================================
   Module « Newsletter » de la vitrine : désactivé par défaut, activé par le propriétaire seul, bloc d'inscription
   public (double confirmation déjà couverte par tests/newsletter.test.js).
   Vrai serveur sur une COPIE de la base de dev ; aucun e-mail réel (pas de clé d'envoi).
   Lancer : node --test tests/newsletter-vitrine.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./_formation-harness');

let env, jarA, jarB, idA, rnd, bd;
const run = (req, ...args) => bd.prepare(req).run(...args);
const lire = (req, ...args) => bd.prepare(req).get(...args);

test.before(async () => {
  env = await H.demarrer('newsletter-vitrine');
  bd = new H.DatabaseSync(env.dbPath);
  rnd = Math.random().toString(36).slice(2, 8);
  jarA = H.cookieJar(); jarB = H.cookieJar();
  const a = await H.creerApprenant(env, jarA, rnd, 'VitrineA');
  await H.creerApprenant(env, jarB, rnd, 'VitrineB');
  const uid = lire('SELECT id FROM users WHERE email=?', a.email).id;
  idA = Number(run("INSERT INTO initiatives (nom, boutique_nom, owner_user_id) VALUES ('Nom interne', 'Chez Vitrine', ?)", uid).lastInsertRowid);
});
test.after(() => { try { bd && bd.close(); } catch (e) {} env && env.stop(); });

test('N4 le registre propose le module « Newsletter » (rubrique Communication)', async () => {
  const r = await env.call(null, 'GET', '/api/vitrine-modules-registry');
  assert.equal(r.status, 200);
  assert.equal(r.data.modules.newsletter.label, 'Newsletter');
  assert.equal(r.data.modules.newsletter.categorie, 'communication');
  assert.equal(r.data.modules.newsletter.implemente, true);
  assert.ok(!r.data.socle.includes('newsletter'), 'jamais dans le socle imposé à toutes les boutiques');
});

test('N4 le module est éteint par défaut, même après le choix d\'un modèle de boutique', async () => {
  const p = await env.call(null, 'GET', `/api/initiatives/${idA}`);
  assert.equal(p.status, 200);
  assert.equal(p.data.initiative.vitrine_modules_state.newsletter.actif, false);
  /* Appliquer un modèle active ses modules recommandés : « newsletter » n'en fait partie d'aucun. */
  const m = await env.call(jarA, 'PUT', `/api/initiatives/${idA}/vitrine-draft`, { type: 'commercial' });
  assert.equal(m.status, 200, JSON.stringify(m.data));
  await env.call(jarA, 'POST', `/api/initiatives/${idA}/vitrine-publish`);
  const p2 = await env.call(null, 'GET', `/api/initiatives/${idA}`);
  assert.equal(p2.data.initiative.vitrine_modules_state.newsletter.actif, false);
});

test('N4 seul le propriétaire active le module, et la boutique publiée le montre', async () => {
  const refus = await env.call(jarB, 'PUT', `/api/initiatives/${idA}/vitrine-draft`, { modules: { newsletter: { actif: true } } });
  assert.equal(refus.status, 403);
  const non = await env.call(null, 'PUT', `/api/initiatives/${idA}/vitrine-draft`, { modules: { newsletter: { actif: true } } });
  assert.equal(non.status, 401);
  const ok = await env.call(jarA, 'PUT', `/api/initiatives/${idA}/vitrine-draft`, { modules: { newsletter: { actif: true } } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  /* Brouillon : pas encore visible du public. */
  const avant = await env.call(null, 'GET', `/api/initiatives/${idA}`);
  assert.equal(avant.data.initiative.vitrine_modules_state.newsletter.actif, false, 'rien de public avant « Publier »');
  const pub = await env.call(jarA, 'POST', `/api/initiatives/${idA}/vitrine-publish`);
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  const apres = await env.call(null, 'GET', `/api/initiatives/${idA}`);
  assert.equal(apres.data.initiative.vitrine_modules_state.newsletter.actif, true);
  /* Les données d'abonnés ne dépendent jamais de l'affichage du module. */
  assert.equal(lire('SELECT COUNT(*) n FROM nl_abonnes WHERE initiative_id=?', idA).n, 0);
});

test('N4 le formulaire de la vitrine déclenche la double confirmation (aucun abonné actif avant le clic)', async () => {
  const email = `visiteur-${rnd}@example.com`;
  const r = await env.call(null, 'POST', `/api/newsletter/${idA}/abonner`, { email, consentement: true, _form_ts: Date.now() - 5000 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const ab = lire('SELECT statut, source FROM nl_abonnes WHERE initiative_id=? AND email=?', idA, email);
  assert.equal(ab.statut, 'en_attente');
  assert.equal(ab.source, 'formulaire');
  /* Sans case cochée : refusé, rien d'enregistré. */
  const sans = await env.call(null, 'POST', `/api/newsletter/${idA}/abonner`, { email: `sans-${rnd}@example.com`, consentement: false, _form_ts: Date.now() - 5000 });
  assert.equal(sans.status, 400);
  assert.equal(lire('SELECT COUNT(*) n FROM nl_abonnes WHERE email=?', `sans-${rnd}@example.com`).n, 0);
});

test('N4 la page de vitrine contient le bloc : champ e-mail, case de consentement, piège anti-robot, appel au bon service', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'profil-app.html'), 'utf8');
  assert.match(src, /id="pv-newsletter"/);
  assert.match(src, /newsletterOn = !!\(_nlEtat && _nlEtat\.actif\)/, 'affiché seulement si le propriétaire a activé le module (état publié, y compris pour un visiteur)');
  assert.match(src, /name="consentement"/);
  assert.match(src, /name="site_perso"/);
  assert.match(src, /'\/newsletter\/' \+ initId \+ '\/abonner'/);
  assert.match(src, /l'inscription n'est valable qu'après un clic/);
});

test('N4 le script de la page reste valide (aucune erreur de syntaxe introduite)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'profil-app.html'), 'utf8');
  const blocs = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(blocs.length > 0);
  for (const b of blocs) assert.doesNotThrow(() => new Function(b));
});
