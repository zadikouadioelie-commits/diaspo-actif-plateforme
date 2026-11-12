/* ===========================================================
   tests/newsletter-admin.test.js — Newsletter des initiatives, étape N5 (2026-11-12) : journal, signalements, suspension
   ===========================================================
   Vrai serveur sur une COPIE de la base de dev (sans clé d'envoi → envoi « à blanc », aucun e-mail réel).
   Lancer : node --test tests/newsletter-admin.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const H = require('./_formation-harness');

let env, jarAdmin, jarA, jarB, idA, idB, uidA, rnd, bd, campagneEnvoyee, ab1, ab2;
const run = (req, ...args) => bd.prepare(req).run(...args);
const lire = (req, ...args) => bd.prepare(req).get(...args);
let seq = 0;
function abonne(initId) {
  seq++;
  const email = `adm${seq}-${rnd}@example.com`;
  const j = crypto.randomBytes(24).toString('base64url');
  run(`INSERT INTO nl_abonnes (initiative_id, email, source, statut, jeton, consentement_le, confirme_le, derniere_confirmation_le) VALUES (?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))`, initId, email, 'formulaire', 'actif', j);
  return { email, id: lire('SELECT id FROM nl_abonnes WHERE jeton=?', j).id };
}
const base = (id) => `/api/initiatives/${id}/newsletter`;
const corps = (extra) => ({ sujet: 'Nouveautés du mois', texte: 'Bonjour,\n\nVoici nos nouveautés.', modele: 'libre', elements: [], ...extra });
async function creer(jar, id, extra) { const r = await env.call(jar, 'POST', `${base(id)}/campagnes`, corps(extra)); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data.campagne; }

test.before(async () => {
  env = await H.demarrer('newsletter-admin');
  bd = new H.DatabaseSync(env.dbPath);
  bd.exec('PRAGMA busy_timeout = 5000'); /* le serveur de test écrit dans le même fichier : on attend au lieu d'échouer (« database is locked ») */
  rnd = Math.random().toString(36).slice(2, 8);
  jarAdmin = H.cookieJar(); jarA = H.cookieJar(); jarB = H.cookieJar();
  await H.creerFormateur(env, jarAdmin, rnd, 'AdminNl'); /* promu administrateur dans la base isolée */
  const a = await H.creerApprenant(env, jarA, rnd, 'BoutiqueA');
  const b = await H.creerApprenant(env, jarB, rnd, 'BoutiqueB');
  uidA = lire('SELECT id FROM users WHERE email=?', a.email).id;
  const uidB = lire('SELECT id FROM users WHERE email=?', b.email).id;
  idA = Number(run("INSERT INTO initiatives (nom, boutique_nom, owner_user_id) VALUES ('Nom interne A', 'Chez Alpha', ?)", uidA).lastInsertRowid);
  idB = Number(run("INSERT INTO initiatives (nom, owner_user_id) VALUES ('Boutique Beta', ?)", uidB).lastInsertRowid);
  ab1 = abonne(idA); ab2 = abonne(idA);
  abonne(idB);
  /* Une newsletter de A lancée (à blanc) et signalée par un abonné. */
  const c = await creer(jarA, idA, { sujet: 'Offre très spéciale', texte: 'Texte de la newsletter signalée.' });
  const e = await env.call(jarA, 'POST', `${base(idA)}/campagnes/${c.id}/envoyer`);
  assert.equal(e.status, 200, JSON.stringify(e.data));
  campagneEnvoyee = c.id;
  run('INSERT INTO nl_signalements (campagne_id, abonne_id) VALUES (?,?)', campagneEnvoyee, ab1.id);
  run('INSERT INTO nl_signalements (campagne_id, abonne_id) VALUES (?,?)', campagneEnvoyee, ab2.id);
});
test.after(() => { try { bd && bd.close(); } catch (e) {} env && env.stop(); });

test('N5 le journal est réservé à l\'administration', async () => {
  assert.equal((await env.call(null, 'GET', '/api/admin/newsletter/journal')).status, 403);
  assert.equal((await env.call(jarA, 'GET', '/api/admin/newsletter/journal')).status, 403);
  assert.equal((await env.call(jarA, 'POST', '/api/admin/newsletter/suspensions', { initiative_id: idB, motif: 'Test de refus' })).status, 403);
  assert.equal((await env.call(jarA, 'DELETE', `/api/admin/newsletter/suspensions/${idB}`)).status, 403);
  assert.equal((await env.call(jarA, 'GET', `/api/admin/newsletter/campagnes/${campagneEnvoyee}`)).status, 403);
});

test('N5 le journal montre les newsletters et les signalements en nombres, jamais une adresse', async () => {
  const r = await env.call(jarAdmin, 'GET', '/api/admin/newsletter/journal');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const c = r.data.campagnes.find((x) => x.id === campagneEnvoyee);
  assert.ok(c, 'la newsletter lancée apparaît');
  assert.equal(c.boutique, 'Chez Alpha', 'le nom de la boutique est celui de la vitrine');
  assert.equal(c.destinataires, 2);
  assert.equal(c.signalements, 2);
  assert.equal(c.mode_envoi, 'a_blanc');
  assert.deepEqual(r.data.signalees.map((x) => x.id), [campagneEnvoyee]);
  const brut = JSON.stringify(r.data);
  assert.ok(!brut.includes(ab1.email) && !brut.includes(ab2.email), 'aucune adresse d\'abonné dans le journal');
  assert.ok(!r.data.campagnes.some((x) => x.statut === 'brouillon'), 'les brouillons ne sont pas listés');
  assert.deepEqual(r.data.suspensions, []);
});

test('N5 l\'administration peut lire le texte de la newsletter signalée', async () => {
  const r = await env.call(jarAdmin, 'GET', `/api/admin/newsletter/campagnes/${campagneEnvoyee}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.campagne.sujet, 'Offre très spéciale');
  assert.equal(r.data.campagne.texte, 'Texte de la newsletter signalée.');
  assert.equal(r.data.campagne.signalements, 2);
  assert.equal((await env.call(jarAdmin, 'GET', '/api/admin/newsletter/campagnes/999999')).status, 404);
});

test('N5 suspendre exige une boutique existante et un motif', async () => {
  assert.equal((await env.call(jarAdmin, 'POST', '/api/admin/newsletter/suspensions', { motif: 'Sans boutique indiquée' })).status, 400);
  assert.equal((await env.call(jarAdmin, 'POST', '/api/admin/newsletter/suspensions', { initiative_id: idA })).status, 400, 'motif obligatoire');
  assert.equal((await env.call(jarAdmin, 'POST', '/api/admin/newsletter/suspensions', { initiative_id: idA, motif: 'abc' })).status, 400, 'motif trop court');
  assert.equal((await env.call(jarAdmin, 'POST', '/api/admin/newsletter/suspensions', { initiative_id: idA, motif: 'x'.repeat(301) })).status, 400, 'motif trop long');
  assert.equal((await env.call(jarAdmin, 'POST', '/api/admin/newsletter/suspensions', { initiative_id: 999999, motif: 'Boutique inconnue' })).status, 404);
  assert.equal(lire('SELECT COUNT(*) n FROM nl_suspensions').n, 0, 'rien n\'est enregistré en cas de refus');
});

test('N5 une boutique suspendue ne peut ni tester ni envoyer, mais garde brouillons, abonnés et statistiques', async () => {
  const brouillon = await creer(jarA, idA, { sujet: 'Brouillon à envoyer', texte: 'Texte du brouillon.' });
  const s = await env.call(jarAdmin, 'POST', '/api/admin/newsletter/suspensions', { initiative_id: idA, motif: 'Contenu trompeur signalé par des abonnés' });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal(s.data.suspension.motif, 'Contenu trompeur signalé par des abonnés');

  const envoi = await env.call(jarA, 'POST', `${base(idA)}/campagnes/${brouillon.id}/envoyer`);
  assert.equal(envoi.status, 403);
  assert.equal(envoi.data.suspendue, true);
  assert.ok(envoi.data.error.includes('Contenu trompeur'), 'le motif est montré à la boutique');
  assert.equal(lire('SELECT statut FROM nl_campagnes WHERE id=?', brouillon.id).statut, 'brouillon', 'la campagne n\'a pas été lancée');
  assert.equal(lire('SELECT COUNT(*) n FROM nl_envois WHERE campagne_id=?', brouillon.id).n, 0);

  assert.equal((await env.call(jarA, 'POST', `${base(idA)}/campagnes/${brouillon.id}/test`)).status, 403, 'pas de test non plus');

  /* Tout le reste continue de fonctionner. */
  const liste = await env.call(jarA, 'GET', `${base(idA)}/campagnes`);
  assert.equal(liste.status, 200);
  assert.ok(liste.data.campagnes.length >= 2, 'brouillons et statistiques conservés');
  assert.equal((await env.call(jarA, 'GET', `${base(idA)}/abonnes`)).data.compteurs.actifs, 2, 'abonnés conservés');
  assert.equal((await env.call(jarA, 'PUT', `${base(idA)}/campagnes/${brouillon.id}`, corps({ sujet: 'Brouillon corrigé' }))).status, 200, 'le brouillon reste modifiable');
  const contenus = await env.call(jarA, 'GET', `${base(idA)}/contenus`);
  assert.equal(contenus.data.suspension.motif, 'Contenu trompeur signalé par des abonnés', 'l\'écran peut afficher le bandeau');
});

test('N5 la suspension d\'une boutique ne touche pas les autres', async () => {
  const c = await creer(jarB, idB);
  const e = await env.call(jarB, 'POST', `${base(idB)}/campagnes/${c.id}/envoyer`);
  assert.equal(e.status, 200, JSON.stringify(e.data));
  assert.equal((await env.call(jarB, 'GET', `${base(idB)}/contenus`)).data.suspension, null);
});

test('N5 le journal liste la suspension, la boutique est avertie, puis le rétablissement est immédiat', async () => {
  const j = await env.call(jarAdmin, 'GET', '/api/admin/newsletter/journal');
  assert.equal(j.data.suspensions.length, 1);
  assert.equal(j.data.suspensions[0].boutique, 'Chez Alpha');
  assert.ok(j.data.campagnes.find((x) => x.id === campagneEnvoyee).boutique_suspendue);
  const notif = lire("SELECT titre, contenu FROM notifications WHERE user_id=? AND type='newsletter_suspendue'", uidA);
  assert.ok(notif && notif.contenu.includes('Contenu trompeur'), 'le propriétaire est averti avec le motif');

  /* Suspendre à nouveau met le motif à jour sans doubler la ligne ni la notification. */
  const maj = await env.call(jarAdmin, 'POST', '/api/admin/newsletter/suspensions', { initiative_id: idA, motif: 'Motif mis à jour par l\'équipe' });
  assert.equal(maj.status, 200);
  assert.equal(lire('SELECT COUNT(*) n FROM nl_suspensions WHERE initiative_id=?', idA).n, 1);
  assert.equal(lire("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND type='newsletter_suspendue'", uidA).n, 1);

  const levee = await env.call(jarAdmin, 'DELETE', `/api/admin/newsletter/suspensions/${idA}`);
  assert.equal(levee.status, 200);
  assert.equal((await env.call(jarAdmin, 'DELETE', `/api/admin/newsletter/suspensions/${idA}`)).status, 404, 'déjà rétablie');
  assert.ok(lire("SELECT id FROM notifications WHERE user_id=? AND type='newsletter_retablie'", uidA), 'le propriétaire est averti du rétablissement');

  const c = await creer(jarA, idA, { sujet: 'Après rétablissement' });
  const e = await env.call(jarA, 'POST', `${base(idA)}/campagnes/${c.id}/envoyer`);
  assert.equal(e.status, 200, 'l\'envoi est de nouveau possible : ' + JSON.stringify(e.data));
});

test('N5 la page d\'administration et le bandeau de la boutique existent et leurs scripts sont valides', () => {
  const racine = path.join(__dirname, '..');
  const page = fs.readFileSync(path.join(racine, 'newsletter-admin.html'), 'utf8');
  assert.match(page, /\/admin\/newsletter\/journal/);
  assert.match(page, /\/admin\/newsletter\/suspensions/);
  assert.match(page, /moi\.role !== 'administrateur'/);
  for (const m of page.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]));
  const ecran = fs.readFileSync(path.join(racine, 'assets', 'newsletter-init.js'), 'utf8');
  assert.match(ecran, /Envoi suspendu/);
  assert.doesNotThrow(() => new Function(ecran));
});
