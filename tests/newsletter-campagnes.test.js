/* ===========================================================
   tests/newsletter-campagnes.test.js — Newsletter des initiatives, étape N2 (2026-11-11)
   ===========================================================
   Campagnes, aperçu, envoi par lots, quota, statistiques agrégées, clics par lien, signalement.
   Partie 1 : vrai serveur sur une COPIE de la base de dev (sans clé d'envoi → envoi « à blanc », aucun e-mail réel).
   Partie 2 : le module est lancé dans le test avec un faux expéditeur pour vérifier le chemin d'envoi RÉEL sans rien envoyer.
   Lancer : node --test tests/newsletter-campagnes.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const H = require('./_formation-harness');
const NLC = require('../server/newsletter-campagnes.js');

let env, jarA, jarB, idA, idB, uidA, uidB, rnd, bd, prodA1, prodA2, prodB, evA, evBrouillon;

const run = (req, ...args) => bd.prepare(req).run(...args);
const lire = (req, ...args) => bd.prepare(req).get(...args);
const tous = (req, ...args) => bd.prepare(req).all(...args);
const jeton = () => crypto.randomBytes(24).toString('base64url');
let seq = 0;
function abonne(initId, statut, nom) {
  seq++;
  const email = `ab${seq}-${rnd}@example.com`;
  const j = jeton();
  run(`INSERT INTO nl_abonnes (initiative_id, email, nom, source, statut, jeton, consentement_le, confirme_le, derniere_confirmation_le) VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))`, initId, email, nom || null, 'formulaire', statut, j);
  return { email, jeton: j, id: lire('SELECT id FROM nl_abonnes WHERE jeton=?', j).id };
}
const base = (id) => `/api/initiatives/${id}/newsletter`;
const corps = (extra) => ({ sujet: 'Nouveautés du mois', texte: 'Bonjour,\n\nVoici nos nouveautés.', modele: 'libre', elements: [], ...extra });
async function creer(jar, id, extra) { const r = await env.call(jar, 'POST', `${base(id)}/campagnes`, corps(extra)); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data.campagne; }

test.before(async () => {
  env = await H.demarrer('newsletter-campagnes');
  bd = new H.DatabaseSync(env.dbPath);
  rnd = Math.random().toString(36).slice(2, 8);
  jarA = H.cookieJar(); jarB = H.cookieJar();
  const a = await H.creerApprenant(env, jarA, rnd, 'ProprioA');
  const b = await H.creerApprenant(env, jarB, rnd, 'ProprioB');
  uidA = lire('SELECT id FROM users WHERE email=?', a.email).id;
  uidB = lire('SELECT id FROM users WHERE email=?', b.email).id;
  idA = Number(run("INSERT INTO initiatives (nom, owner_user_id) VALUES ('Boutique <Alpha>', ?)", uidA).lastInsertRowid);
  idB = Number(run("INSERT INTO initiatives (nom, owner_user_id) VALUES ('Boutique Beta', ?)", uidB).lastInsertRowid);
  prodA1 = Number(run("INSERT INTO produits_vitrine (initiative_id, nom, description, prix, devise) VALUES (?, 'Pagne wax', 'Tissu <b>coloré</b>', 25, 'EUR')", idA).lastInsertRowid);
  prodA2 = Number(run("INSERT INTO produits_vitrine (initiative_id, nom, prix, prix_promo, devise) VALUES (?, 'Sac en cuir', 80, 60, 'EUR')", idA).lastInsertRowid);
  prodB = Number(run("INSERT INTO produits_vitrine (initiative_id, nom, prix) VALUES (?, 'Produit de B', 10)", idB).lastInsertRowid);
  evA = Number(run("INSERT INTO events (titre, organisateur_id, date_debut, statut, ville) VALUES ('Soirée culturelle', ?, '2099-05-01', 'publie', 'Lyon')", uidA).lastInsertRowid);
  evBrouillon = Number(run("INSERT INTO events (titre, organisateur_id, date_debut, statut) VALUES ('Brouillon', ?, '2099-06-01', 'brouillon')", uidA).lastInsertRowid);
  run("UPDATE initiatives SET vitrine_offre_flash_titre='-20 % ce week-end', vitrine_offre_flash_fin='2099-01-31', vitrine_services_categories_json=? WHERE id=?",
    JSON.stringify([{ titre: 'Couture sur mesure', description: 'Retouches et créations' }, 'Livraison express']), idA);
});
test.after(() => { try { bd && bd.close(); } catch (e) {} env && env.stop(); });

test('N2 contenus insérables : réservés au propriétaire, avec modèles et quota', async () => {
  assert.equal((await env.call(null, 'GET', `${base(idA)}/contenus`)).status, 401);
  assert.equal((await env.call(jarB, 'GET', `${base(idA)}/contenus`)).status, 403);
  const r = await env.call(jarA, 'GET', `${base(idA)}/contenus`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.produits.map((p) => p.nom).sort(), ['Pagne wax', 'Sac en cuir']);
  assert.ok(r.data.produits.find((p) => p.nom === 'Sac en cuir').prix.includes('au lieu de'), 'le prix promotionnel est montré');
  assert.deepEqual(r.data.evenements.map((e) => e.titre), ['Soirée culturelle'], 'seuls les événements publiés apparaissent');
  assert.deepEqual(r.data.services.map((s) => s.titre), ['Couture sur mesure', 'Livraison express']);
  assert.equal(r.data.offre_flash.titre, '-20 % ce week-end');
  assert.ok(r.data.modeles.find((m) => m.cle === 'promotion').sujet.includes('Boutique <Alpha>'), 'le nom de la boutique remplace {boutique}');
  assert.equal(r.data.quota.limite, 500);
  assert.equal(r.data.quota.mode, 'a_blanc', "sans NEWSLETTER_EMAIL=1 l'envoi est à blanc");
  const b = await env.call(jarB, 'GET', `${base(idB)}/contenus`);
  assert.equal(b.data.offre_flash, null);
  assert.deepEqual(b.data.produits.map((p) => p.nom), ['Produit de B'], 'jamais les produits d\'une autre boutique');
});

test('N2 une campagne refuse : sujet ou texte vides, trop longs, trop d\'éléments, éléments étrangers, dépôt de projet détourné', async () => {
  const poster = (extra) => env.call(jarA, 'POST', `${base(idA)}/campagnes`, corps(extra));
  assert.equal((await poster({ sujet: 'ab' })).status, 400);
  assert.equal((await poster({ texte: '   ' })).status, 400);
  assert.equal((await poster({ sujet: 'x'.repeat(151) })).status, 400);
  assert.equal((await poster({ texte: 'x'.repeat(5001) })).status, 400);
  const sept = Array.from({ length: 7 }, (_, i) => ({ type: 'produit', id: prodA1 + 1000 + i }));
  assert.equal((await poster({ elements: sept })).status, 400);
  assert.equal((await poster({ elements: [{ type: 'produit', id: prodB }] })).status, 400, 'produit d\'une autre boutique');
  assert.equal((await poster({ elements: [{ type: 'evenement', id: evBrouillon }] })).status, 400, 'événement non publié');
  assert.equal((await poster({ elements: [{ type: 'service', titre: 'Service inventé' }] })).status, 400);
  assert.equal((await poster({ elements: [{ type: 'bizarre' }] })).status, 400);
  const sansFlash = await env.call(jarB, 'POST', `${base(idB)}/campagnes`, corps({ elements: [{ type: 'offre_flash' }] }));
  assert.equal(sansFlash.status, 400, "pas d'offre flash en cours");
  const depot = await poster({ texte: 'Envoyez votre projet directement à notre boutique.' });
  assert.equal(depot.status, 400);
  assert.match(depot.data.error, /Soumettre à Diaspo'Actif/);
  assert.equal(lire('SELECT COUNT(*) AS n FROM nl_campagnes WHERE initiative_id=?', idA).n, 0, 'aucun refus ne crée de ligne');
});

test('N2 créer, relire, modifier et supprimer un brouillon ; un autre propriétaire n\'y touche pas', async () => {
  const c = await creer(jarA, idA, { modele: 'produit', elements: [{ type: 'produit', id: prodA1 }, { type: 'evenement', id: evA }, { type: 'offre_flash' }, { type: 'service', titre: 'Couture sur mesure' }] });
  assert.equal(c.statut, 'brouillon');
  assert.equal(c.elements.length, 4);
  assert.equal((await env.call(null, 'GET', `${base(idA)}/campagnes/${c.id}`)).status, 401);
  assert.equal((await env.call(jarB, 'GET', `${base(idA)}/campagnes/${c.id}`)).status, 403);
  assert.equal((await env.call(jarB, 'PUT', `${base(idA)}/campagnes/${c.id}`, corps())).status, 403);
  assert.equal((await env.call(jarB, 'DELETE', `${base(idA)}/campagnes/${c.id}`)).status, 403);
  /* Une campagne d'une boutique ne se lit pas sous l'identifiant d'une autre. */
  assert.equal((await env.call(jarB, 'GET', `${base(idB)}/campagnes/${c.id}`)).status, 404);
  const maj = await env.call(jarA, 'PUT', `${base(idA)}/campagnes/${c.id}`, corps({ sujet: 'Sujet modifié', elements: [{ type: 'produit', id: prodA2 }] }));
  assert.equal(maj.status, 200);
  assert.equal(maj.data.campagne.sujet, 'Sujet modifié');
  assert.equal(maj.data.campagne.elements.length, 1);
  const liste = await env.call(jarA, 'GET', `${base(idA)}/campagnes`);
  assert.ok(liste.data.campagnes.some((x) => x.id === c.id && x.stats && x.stats.destinataires === 0));
  assert.equal((await env.call(jarA, 'DELETE', `${base(idA)}/campagnes/${c.id}`)).status, 200);
  assert.equal(lire('SELECT id FROM nl_campagnes WHERE id=?', c.id), undefined);
});

test('N2 l\'aperçu échappe le texte, montre les éléments et ne rend jamais cliquable un lien tapé à la main', async () => {
  const c = await creer(jarA, idA, { texte: 'Bonjour <script>alert(1)</script>\n\nVisitez http://pirate.example/faux', elements: [{ type: 'produit', id: prodA1 }, { type: 'evenement', id: evA }, { type: 'offre_flash' }, { type: 'service', titre: 'Livraison express' }] });
  const r = await env.call(jarA, 'GET', `${base(idA)}/campagnes/${c.id}/apercu`);
  assert.equal(r.status, 200);
  assert.ok(!r.data.html.includes('<script>'), 'balises du texte échappées');
  assert.match(r.data.html, /&lt;script&gt;/);
  assert.ok(!/href="http:\/\/pirate\.example/.test(r.data.html), 'un lien tapé dans le texte reste du texte');
  for (const t of ['Boutique &lt;Alpha&gt;', 'Pagne wax', 'Soirée culturelle', '-20 % ce week-end', 'Livraison express', 'Visiter la boutique']) assert.ok(r.data.html.includes(t), t);
  assert.ok(r.data.html.includes(`/profil-app.html?id=${uidA}`), 'lien de la boutique');
  assert.ok(r.data.html.includes(`/evenement-billetterie.html?id=${evA}`), "lien de l'événement");
  assert.equal((await env.call(jarB, 'GET', `${base(idA)}/campagnes/${c.id}/apercu`)).status, 403);
  /* Le message de test est « à blanc » tant que l'envoi réel n'est pas activé. */
  const t = await env.call(jarA, 'POST', `${base(idA)}/campagnes/${c.id}/test`);
  assert.equal(t.status, 200);
  assert.equal(t.data.a_blanc, true);
});

test('N2 lancer une campagne : refus sans abonné actif, puis envoi à blanc aux seuls abonnés actifs', async () => {
  const c = await creer(jarA, idA, {});
  const vide = await env.call(jarA, 'POST', `${base(idA)}/campagnes/${c.id}/envoyer`);
  assert.equal(vide.status, 400, 'personne ne recevrait le message');
  assert.equal(lire('SELECT statut FROM nl_campagnes WHERE id=?', c.id).statut, 'brouillon');

  const a1 = abonne(idA, 'actif', 'Awa'), a2 = abonne(idA, 'actif'), a3 = abonne(idA, 'actif');
  const attente = abonne(idA, 'en_attente'), parti = abonne(idA, 'desabonne'), autre = abonne(idB, 'actif');
  assert.equal((await env.call(jarB, 'POST', `${base(idA)}/campagnes/${c.id}/envoyer`)).status, 403);
  const r = await env.call(jarA, 'POST', `${base(idA)}/campagnes/${c.id}/envoyer`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.campagne.statut, 'envoyee');
  assert.equal(r.data.campagne.mode_envoi, 'a_blanc');
  assert.equal(r.data.stats.destinataires, 3);
  assert.equal(r.data.stats.a_blanc, 3);
  assert.equal(r.data.stats.envoyes, 0, "rien n'est réellement envoyé à blanc");
  assert.equal(r.data.stats.restants, 0);
  const ids = tous('SELECT abonne_id FROM nl_envois WHERE campagne_id=?', c.id).map((x) => x.abonne_id).sort();
  assert.deepEqual(ids, [a1.id, a2.id, a3.id].sort(), 'ni les abonnés en attente ou désabonnés, ni ceux d\'une autre boutique');
  assert.ok(![attente.id, parti.id, autre.id].some((x) => ids.includes(x)));
  /* Une campagne lancée ne se relance, ne se modifie et ne se supprime plus. */
  assert.equal((await env.call(jarA, 'POST', `${base(idA)}/campagnes/${c.id}/envoyer`)).status, 409);
  assert.equal((await env.call(jarA, 'PUT', `${base(idA)}/campagnes/${c.id}`, corps())).status, 409);
  assert.equal((await env.call(jarA, 'DELETE', `${base(idA)}/campagnes/${c.id}`)).status, 409);
  /* Un lien suivi existe pour la boutique. */
  assert.ok(lire('SELECT id FROM nl_liens WHERE campagne_id=?', c.id));
  /* Le quota du mois compte l'envoi à blanc séparément. */
  const q = await env.call(jarA, 'GET', `${base(idA)}/contenus`);
  assert.equal(q.data.quota.utilise, 3);
  assert.equal(q.data.quota.restant, 497);
  assert.equal(q.data.abonnes_actifs, 3);
});

test('N2 statistiques agrégées : clics comptés par lien, désabonnés et signalements, jamais d\'adresse', async () => {
  const c = tous("SELECT id FROM nl_campagnes WHERE initiative_id=? AND statut='envoyee' ORDER BY id DESC", idA)[0];
  const lien = lire('SELECT id, chemin FROM nl_liens WHERE campagne_id=?', c.id);
  const suivre = (id) => fetch(`${env.base}/api/newsletter/lien/${id}`, { redirect: 'manual' });
  const r1 = await suivre(lien.id); await suivre(lien.id);
  assert.equal(r1.status, 302);
  assert.equal(r1.headers.get('location'), lien.chemin, 'redirige vers le chemin figé de la boutique');
  assert.equal((await suivre(999999)).status, 404);
  /* Même un chemin enregistré vers un autre site est refusé. */
  const piege = Number(run("INSERT INTO nl_liens (campagne_id, chemin, libelle) VALUES (?, '//pirate.example/x', 'piege')", c.id).lastInsertRowid);
  assert.equal((await suivre(piege)).status, 404);
  assert.equal(lire('SELECT clics FROM nl_liens WHERE id=?', piege).clics, 0);

  const destinataire = tous('SELECT a.jeton, a.id FROM nl_envois e JOIN nl_abonnes a ON a.id=e.abonne_id WHERE e.campagne_id=? ORDER BY a.id', c.id)[0];
  const sig = await fetch(`${env.base}/api/newsletter/signaler?t=${encodeURIComponent(destinataire.jeton)}&c=${c.id}`);
  assert.equal(sig.status, 200);
  await fetch(`${env.base}/api/newsletter/signaler?t=${encodeURIComponent(destinataire.jeton)}&c=${c.id}`);
  assert.equal(lire('SELECT COUNT(*) AS n FROM nl_signalements WHERE campagne_id=?', c.id).n, 1, 'un signalement par personne');
  /* Un signalement ne vaut que pour une personne qui a reçu la campagne. */
  const etranger = abonne(idB, 'actif');
  assert.equal((await fetch(`${env.base}/api/newsletter/signaler?t=${encodeURIComponent(etranger.jeton)}&c=${c.id}`)).status, 400);
  assert.equal((await fetch(`${env.base}/api/newsletter/signaler?t=invente&c=${c.id}`)).status, 400);

  /* Désabonnement « en un clic » par les boîtes mail (POST) et par le lien (GET). */
  const un = await fetch(`${env.base}/api/newsletter/desabonner?t=${encodeURIComponent(destinataire.jeton)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  assert.equal(un.status, 200);
  assert.equal(lire('SELECT statut FROM nl_abonnes WHERE id=?', destinataire.id).statut, 'desabonne');

  const r = await env.call(jarA, 'GET', `${base(idA)}/campagnes/${c.id}`);
  assert.equal(r.status, 200);
  const s = r.data.stats;
  assert.equal(s.clics, 2);
  assert.equal(s.desabonnes, 1);
  assert.equal(s.signalements, 1);
  assert.ok(s.liens.every((l) => 'libelle' in l && 'clics' in l));
  const texte = JSON.stringify(r.data);
  assert.ok(!/@example\.com/.test(texte) && !texte.includes(destinataire.jeton), "aucune adresse ni aucun jeton dans les statistiques");
});

test('N2 quota mensuel : une liste plus grande que le reste du mois est refusée sans rien envoyer', async () => {
  const idC = Number(run("INSERT INTO initiatives (nom, owner_user_id) VALUES ('Boutique Quota', ?)", uidB).lastInsertRowid);
  bd.exec('BEGIN');
  for (let i = 0; i < 501; i++) run(`INSERT INTO nl_abonnes (initiative_id, email, source, statut, jeton) VALUES (?,?,?,?,?)`, idC, `q${i}-${rnd}@example.com`, 'formulaire', 'actif', jeton());
  bd.exec('COMMIT');
  const c = await creer(jarB, idC, {});
  const r = await env.call(jarB, 'POST', `${base(idC)}/campagnes/${c.id}/envoyer`);
  assert.equal(r.status, 403);
  assert.match(r.data.error, /Quota mensuel/);
  assert.equal(lire('SELECT statut FROM nl_campagnes WHERE id=?', c.id).statut, 'brouillon');
  assert.equal(lire('SELECT COUNT(*) AS n FROM nl_envois WHERE campagne_id=?', c.id).n, 0);
});

test('N2 au plus 5 newsletters par 24 heures et par boutique', async () => {
  const idD = Number(run("INSERT INTO initiatives (nom, owner_user_id) VALUES ('Boutique Rythme', ?)", uidB).lastInsertRowid);
  abonne(idD, 'actif');
  for (let i = 0; i < 5; i++) {
    const c = await creer(jarB, idD, { sujet: `Message ${i + 1}` });
    assert.equal((await env.call(jarB, 'POST', `${base(idD)}/campagnes/${c.id}/envoyer`)).status, 200);
  }
  const sixieme = await creer(jarB, idD, { sujet: 'Message 6' });
  const r = await env.call(jarB, 'POST', `${base(idD)}/campagnes/${sixieme.id}/envoyer`);
  assert.equal(r.status, 429);
  assert.equal(lire('SELECT statut FROM nl_campagnes WHERE id=?', sixieme.id).statut, 'brouillon');
});

/* ── Partie 2 : chemin d'envoi RÉEL, avec un faux expéditeur (aucun e-mail ne part) ── */
function lancerModule({ envoyer, reel = true }) {
  const routes = {};
  const SEC = { rateLimit: () => ({ allowed: true }), isValidEmail: (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e), normalizeEmail: (e) => String(e || '').trim().toLowerCase(), clientIp: () => '127.0.0.1', logSecurity() {} };
  let courant = null;
  NLC.enregistrerCampagnes({
    route: (m, p, h) => { routes[`${m} ${p}`] = h; },
    db: bd, getCurrentUser: async () => courant, SEC, getOrigin: () => 'https://exemple.test',
    sendJSON: (res, status, data) => { res.status = status; res.data = data; },
    envoyerEmail: envoyer, envoiReel: reel,
    utils: {
      repondrePage: (res, status) => { res.status = status; },
      proprietaire: async (req, res, id) => { const init = lire('SELECT id, nom, owner_user_id FROM initiatives WHERE id=?', Number(id)); courant = { id: init.owner_user_id, email: lire('SELECT email FROM users WHERE id=?', init.owner_user_id).email }; return { user: courant, init }; },
    },
  });
  return (m, p, params, body) => { const res = {}; return Promise.resolve(routes[`${m} ${p}`]({}, res, params || {}, body || {}, {})).then(() => res); };
}

test('N2 envoi réel : par lots de 40, en-têtes de désabonnement, expéditeur « via Diaspo\'Actif », liens suivis', async () => {
  const idE = Number(run("INSERT INTO initiatives (nom, boutique_nom, owner_user_id, vitrine_email_pro) VALUES ('Nom interne', 'Chez Mariam', ?, 'contact-mariam@example.com')", uidA).lastInsertRowid);
  const prod = Number(run("INSERT INTO produits_vitrine (initiative_id, nom, prix) VALUES (?, 'Beurre de karité', 12)", idE).lastInsertRowid);
  const abos = Array.from({ length: 45 }, (_, i) => abonne(idE, 'actif', i === 0 ? 'Awa' : null));
  const envois = [];
  const appeler = lancerModule({ envoyer: async (m) => { envois.push(m); return m.to === abos[7].email ? { ok: false, reason: 'refuse' } : { ok: true }; } });

  const cree = await appeler('POST', '/api/initiatives/:id/newsletter/campagnes', { id: idE }, corps({ sujet: 'Arrivage', elements: [{ type: 'produit', id: prod }] }));
  assert.equal(cree.status, 201, JSON.stringify(cree.data));
  const cid = cree.data.campagne.id;
  const lance = await appeler('POST', '/api/initiatives/:id/newsletter/campagnes/:cid/envoyer', { id: idE, cid });
  assert.equal(lance.status, 200, JSON.stringify(lance.data));
  assert.equal(lance.data.campagne.mode_envoi, 'reel');
  assert.equal(lance.data.campagne.statut, 'en_cours', 'premier lot seulement');
  assert.equal(envois.length, 40);
  assert.equal(lance.data.stats.restants, 5);

  const suite = await appeler('POST', '/api/initiatives/:id/newsletter/campagnes/:cid/continuer', { id: idE, cid });
  assert.equal(suite.status, 200);
  assert.equal(suite.data.campagne.statut, 'envoyee');
  assert.equal(envois.length, 45);
  assert.equal(suite.data.stats.envoyes, 44);
  assert.equal(suite.data.stats.echecs, 1, "l'adresse refusée par le service d'envoi est comptée en échec");
  assert.equal(new Set(envois.map((m) => m.to)).size, 45, 'chaque abonné reçoit un seul message');

  const m = envois[0];
  assert.equal(m.fromName, 'Chez Mariam');
  assert.equal(m.replyTo, 'contact-mariam@example.com');
  assert.equal(m.subject, 'Arrivage');
  const ab = abos.find((x) => x.email === m.to);
  assert.equal(m.headers['List-Unsubscribe'], `<https://exemple.test/api/newsletter/desabonner?t=${encodeURIComponent(ab.jeton)}>`);
  assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.ok(m.html.includes(`/api/newsletter/desabonner?t=${encodeURIComponent(ab.jeton)}`), 'lien de désabonnement personnel dans le pied');
  assert.ok(m.html.includes('/api/newsletter/signaler?t='), 'lien de signalement');
  assert.match(m.html, /\/api\/newsletter\/lien\/\d+/, 'les liens passent par le suivi par lien');
  assert.ok(!m.html.includes('<img'), "pas de pixel d'ouverture");
  /* Le lot rappelé après la fin ne renvoie rien. */
  await appeler('POST', '/api/initiatives/:id/newsletter/campagnes/:cid/continuer', { id: idE, cid });
  assert.equal(envois.length, 45);
  /* Le quota réel est consommé par les messages partis (44), pas par l'échec ; l'envoi à blanc n'est pas touché. */
  const q = await appeler('GET', '/api/initiatives/:id/newsletter/contenus', { id: idE });
  assert.equal(q.data.quota.utilise, 44);
  assert.equal(q.data.quota.mode, 'reel');
});

test('N2 envoi réel : quelqu\'un qui se désabonne pendant l\'envoi ne reçoit rien', async () => {
  const idF = Number(run("INSERT INTO initiatives (nom, owner_user_id) VALUES ('Boutique Départ', ?)", uidB).lastInsertRowid);
  const abos = [abonne(idF, 'actif'), abonne(idF, 'actif'), abonne(idF, 'actif')];
  const recus = [];
  const appeler = lancerModule({
    envoyer: async (m) => { recus.push(m.to); if (recus.length === 1) run("UPDATE nl_abonnes SET statut='desabonne', desabonne_le=datetime('now') WHERE id=?", abos[2].id); return { ok: true }; },
  });
  const cree = await appeler('POST', '/api/initiatives/:id/newsletter/campagnes', { id: idF }, corps());
  const lance = await appeler('POST', '/api/initiatives/:id/newsletter/campagnes/:cid/envoyer', { id: idF, cid: cree.data.campagne.id });
  assert.equal(lance.status, 200);
  assert.equal(lance.data.stats.envoyes, 2);
  assert.equal(lance.data.stats.ignores, 1);
  assert.ok(!recus.includes(abos[2].email));
});

test('N2 le message n\'est jamais pris pour du code : nom de boutique et texte sont échappés', () => {
  const html = NLC.htmlCampagne({ nomBoutique: '<i>Boutique</i>', texte: '<img src=x onerror=alert(1)>\n\nDeuxième "paragraphe"', blocs: [{ etiquette: 'Produit', titre: '<b>x</b>', detail: '', lien: 'https://exemple.test/a?b=1&c="2"' }], lienBoutique: 'https://exemple.test/', lienDesabo: 'https://exemple.test/d', lienSignaler: 'https://exemple.test/s' });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<i>Boutique</i>'));
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.includes('href="https://exemple.test/a?b=1&amp;c=&quot;2&quot;"'), "l'adresse d'un lien est échappée");
});
