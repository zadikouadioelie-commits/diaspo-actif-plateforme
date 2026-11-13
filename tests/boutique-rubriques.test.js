/* ===========================================================
   tests/boutique-rubriques.test.js — Rubriques choisies par le propriétaire, suivies par les pages visiteur (lot 4B, 2026-11-13)
   ===========================================================
   1. assets/boutique-rubriques.js : une rubrique n'est cachée que sur une décision explicite (`choisi`) du propriétaire.
   2. Serveur réel : la fiche publique marque les rubriques décidées par le propriétaire, jamais celles qu'il n'a pas touchées ni son brouillon.
   3. Page Portfolio (faux navigateur) : onglets, à propos, réseaux et blocs suivent les rubriques ; sans décision rien ne change.
   4. Page Événements (faux navigateur) : réservation, réseaux, contact et présentation suivent les rubriques.
   Lancer : node --test tests/boutique-rubriques.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const RUB = require('../assets/boutique-rubriques.js');
const H = require('./_formation-harness');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const JS_RUB = lire('assets/boutique-rubriques.js');
const JS_PF = lire('assets/boutique-portfolio.js');
const JS_EV = lire('assets/boutique-evenements.js');

/* ═════════════ 1. Module ═════════════ */
test('R1 sans état, ou sans décision du propriétaire, tout reste affiché', () => {
  assert.equal(RUB.active(undefined, 'avis'), true);
  assert.equal(RUB.active(null, 'avis'), true);
  assert.equal(RUB.active({}, 'avis'), true);
  assert.equal(RUB.active({ avis: { actif: false, ordre: 3 } }, 'avis'), true, "actif:false déduit du contenu, sans décision : on garde le comportement d'avant");
  assert.equal(RUB.active('texte', 'avis'), true);
});

test('R1 une rubrique décidée par le propriétaire est suivie dans les deux sens', () => {
  assert.equal(RUB.active({ avis: { actif: false, choisi: true } }, 'avis'), false);
  assert.equal(RUB.active({ avis: { actif: true, choisi: true } }, 'avis'), true);
  assert.equal(RUB.active({ avis: { actif: false, choisi: true } }, 'contact'), true, 'les autres rubriques ne bougent pas');
  assert.deepEqual(RUB.eteintes({ avis: { actif: false, choisi: true }, contact: { actif: true, choisi: true }, services: { actif: false } }), ['avis']);
});

test("R1 le module n'a aucun emoji et se charge sans erreur dans un navigateur", () => {
  assert.doesNotMatch(JS_RUB, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  const fen = {}; fen.window = fen;
  vm.runInContext(JS_RUB, vm.createContext(fen));
  assert.equal(typeof fen.BoutiqueRubriques.active, 'function');
});

/* ═════════════ 2. Serveur réel ═════════════ */
let env, rnd, proprio, oidNeuve, oidChoisie;
const sql = (req, ...args) => {
  const db = new DatabaseSync(env.dbPath);
  try { db.exec('PRAGMA busy_timeout=5000'); return /^\s*select/i.test(req) ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); }
};
test.before(async () => {
  rnd = Math.random().toString(36).slice(2, 9);
  env = await H.demarrer('rubriques');
  const jar = H.cookieJar();
  await H.creerApprenant(env, jar, rnd, 'ProprioRub');
  proprio = { jar, id: sql('select id from users where email=?', H.compte(rnd, 'ProprioRub', 'utilisateur').email)[0].id };
  oidNeuve = Number(sql('insert into initiatives (nom, owner_user_id, vitrine_type) values (?,?,?)', `Neuve ${rnd}`, proprio.id, 'portfolio').lastInsertRowid);
  oidChoisie = Number(sql('insert into initiatives (nom, owner_user_id, vitrine_type) values (?,?,?)', `Choisie ${rnd}`, proprio.id, 'portfolio').lastInsertRowid);
});
test.after(() => { if (env) env.stop(); });

test("R2 une boutique dont le propriétaire n'a rien décidé ne marque aucune rubrique", async () => {
  const visiteur = H.cookieJar();
  const etat = (await env.call(visiteur, 'GET', `/api/initiatives/${oidNeuve}`)).data.initiative.vitrine_modules_state;
  assert.ok(Object.keys(etat).length > 10);
  assert.deepEqual(RUB.eteintes(etat), [], "rien d'éteint");
  assert.ok(Object.values(etat).every((m) => !m.choisi), 'aucune décision enregistrée');
});

test("R2 la décision du propriétaire est publiée avec « Publier », jamais avant ni dans le brouillon d'un visiteur", async () => {
  const visiteur = H.cookieJar();
  assert.equal((await env.call(proprio.jar, 'PUT', `/api/initiatives/${oidChoisie}/vitrine-draft`, { modules: { avis: { actif: false }, contact: { actif: true } } })).status, 200);
  const avant = (await env.call(visiteur, 'GET', `/api/initiatives/${oidChoisie}`)).data.initiative.vitrine_modules_state;
  assert.ok(!avant.avis.choisi, 'rien de public avant « Publier »');
  const brouillonVisiteur = (await env.call(visiteur, 'GET', `/api/initiatives/${oidChoisie}?preview=draft`)).data.initiative.vitrine_modules_state;
  assert.ok(!brouillonVisiteur.avis.choisi, 'un visiteur ne voit jamais le brouillon');
  const brouillonProprio = (await env.call(proprio.jar, 'GET', `/api/initiatives/${oidChoisie}?preview=draft`)).data.initiative.vitrine_modules_state;
  assert.equal(RUB.active(brouillonProprio, 'avis'), false, "le propriétaire voit son choix dans l'aperçu");
  assert.equal((await env.call(proprio.jar, 'POST', `/api/initiatives/${oidChoisie}/vitrine-publish`)).status, 200);
  const apres = (await env.call(visiteur, 'GET', `/api/initiatives/${oidChoisie}`)).data.initiative.vitrine_modules_state;
  assert.equal(RUB.active(apres, 'avis'), false);
  assert.equal(RUB.active(apres, 'contact'), true);
  assert.equal(RUB.active(apres, 'services'), true, 'une rubrique non touchée reste affichée');
});

/* ═════════════ 3. Page Portfolio ═════════════ */
const INIT_PF = {
  id: 3, nom: 'Atelier Soleil', owner_user_id: 7, vitrine_type: 'portfolio', description: 'Un atelier de créations africaines contemporaines.',
  vitrine_portfolio_json: JSON.stringify([{ image: '/img/a.jpg', titre: 'Masque doré', categorie: 'Sculpture' }]),
  galerie_json: JSON.stringify([{ url: '/img/g.jpg', titre: 'Photo atelier' }]),
  vitrine_videos_json: JSON.stringify([{ url: 'https://youtu.be/abcdefghij', titre: 'Making of' }]),
  realisations_json: JSON.stringify([{ titre: 'Fresque du marché', image: '/img/r.jpg' }]),
  vitrine_temoignages_json: JSON.stringify([{ texte: 'Un travail magnifique', nom: 'Awa' }]),
  vitrine_services: 'Création sur mesure',
  vitrine_services_categories_json: JSON.stringify([{ titre: 'Commande personnalisée' }]),
  vitrine_partenaires_json: JSON.stringify([{ nom: 'Fondation Horizon' }]),
  reseaux_sociaux: JSON.stringify({ instagram: 'https://instagram.com/atelier' }),
};
async function lancerPortfolio(init = {}) {
  const app = { innerHTML: '', addEventListener() {}, querySelector: () => null };
  const elements = { 'pf-app': app, 'pf-toast': { innerHTML: '', className: '' }, 'pf-modal': { hidden: true, innerHTML: '' } };
  const document = {
    getElementById: (id) => elements[id] || null, querySelector: () => null, querySelectorAll: () => [], title: '', contains: () => false,
    body: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {} }, addEventListener() {},
  };
  const reponses = {
    '/initiatives/3': { initiative: Object.assign({}, INIT_PF, init) },
    '/initiatives/3/produits': { produits: [] },
    '/initiatives/3/avis': { total: 0, moyenne: 0, avis: [] },
    '/auth/me': { user: null },
    '/evenements': { evenements: [] },
    '/formations': { formations: [] },
  };
  const fetch = async (u) => {
    const chemin = String(u).replace(/^\/api/, '');
    const rep = reponses[chemin];
    return { ok: !!rep, status: rep ? 200 : 404, json: async () => rep || { error: 'Introuvable.' } };
  };
  const fenetre = { document, fetch, location: { search: '?id=3', origin: 'http://x', href: '' }, navigator: {}, matchMedia: () => ({ matches: true }), addEventListener() {}, parent: null, localStorage: { getItem: () => null, setItem() {} } };
  fenetre.parent = fenetre;
  fenetre.DA_verifierMaintenanceBoutique = async () => false;
  const ctx = vm.createContext(Object.assign(fenetre, { window: fenetre, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval, localStorage: fenetre.localStorage, console }));
  vm.runInContext(JS_RUB, ctx);
  vm.runInContext(JS_PF, ctx);
  await new Promise((r) => setTimeout(r, 40));
  return app.innerHTML;
}
const onglets = (html) => (html.match(/data-onglet="([a-z]+)"/g) || []).map((x) => x.slice(13, -1));
const eteint = (...cles) => { const o = {}; cles.forEach((k) => { o[k] = { actif: false, ordre: 1, choisi: true }; }); return o; };

test('P1 sans décision du propriétaire, la page Portfolio montre toutes ses rubriques comme avant', async () => {
  const html = await lancerPortfolio();
  assert.deepEqual(onglets(html), ['portfolio', 'creations', 'services', 'collab', 'avis', 'contact']);
  assert.match(html, /pf-apropos/);
  assert.match(html, /Liens &amp; réseaux/);
  const html2 = await lancerPortfolio({ vitrine_modules_state: { avis: { actif: false, ordre: 4 }, services: { actif: false, ordre: 2 } } });
  assert.deepEqual(onglets(html2), onglets(html), 'un « actif:false » déduit du contenu, sans décision, ne cache rien');
});

test('P1 chaque rubrique éteinte disparaît de la page Portfolio, et seulement elle', async () => {
  const sans = async (...cles) => lancerPortfolio({ vitrine_modules_state: eteint(...cles) });
  assert.ok(!onglets(await sans('services')).includes('services'));
  assert.ok(onglets(await sans('services')).includes('creations'), 'les autres onglets restent');
  assert.ok(!onglets(await sans('avis', 'temoignages')).includes('avis'));
  assert.ok(!onglets(await sans('contact')).includes('contact'));
  assert.ok(!onglets(await sans('partenaires')).includes('collab'));
  assert.ok(!onglets(await sans('galerie_photos', 'galerie_videos', 'realisations')).includes('creations'));
  assert.ok(onglets(await sans('galerie_photos')).includes('creations'), "les réalisations et vidéos gardent l'onglet");
  assert.doesNotMatch(await sans('a_propos'), /pf-apropos/);
  assert.doesNotMatch(await sans('reseaux_sociaux'), /Liens &amp; réseaux/);
});

test("P1 sans la rubrique Portfolio, la page s'ouvre sur la première rubrique restante", async () => {
  const html = await lancerPortfolio({ vitrine_modules_state: eteint('portfolio') });
  const o = onglets(html);
  assert.ok(!o.includes('portfolio'));
  assert.equal(o[0], 'creations');
  assert.match(html, /Fresque du marché/, 'la première rubrique restante est affichée, pas une page vide');
  assert.doesNotMatch(html, /Masque doré/, 'les créations du portfolio éteint ne sont pas montrées');
});

test('P1 toutes les rubriques éteintes : la page garde au moins le Contact', async () => {
  const html = await lancerPortfolio({ vitrine_modules_state: eteint('portfolio', 'realisations', 'galerie_photos', 'galerie_videos', 'temoignages', 'services', 'partenaires', 'evenements', 'avis', 'contact', 'a_propos', 'reseaux_sociaux') });
  assert.deepEqual(onglets(html), ['contact']);
});

/* ═════════════ 4. Page Événements ═════════════ */
const AUJ = new Date();
const jour = (n) => new Date(AUJ.getTime() + n * 86400000).toISOString().slice(0, 10);
const EVT = { id: 1, titre: 'Atelier cuisine', owner_user_id: 7, statut: 'publie', statut_temporel: 'a_venir', date_evt: jour(5), heure_debut: '18:30', lieu: 'Salle', ville: 'Toulouse', type_evt: 'atelier', type_participation: 'gratuit', mode_participation: 'presentiel', inscription_ouverte: 1 };
async function lancerEvenements(init = {}) {
  const app = { innerHTML: '', addEventListener() {} };
  const elements = { 'evb-app': app, 'evb-toast': { classList: { add() {}, remove() {} } } };
  const document = { getElementById: (id) => elements[id] || null, querySelector: () => null, querySelectorAll: () => [], title: '', contains: () => false, body: { style: { setProperty() {} } }, addEventListener() {} };
  const reponses = {
    '/initiatives/3': { initiative: Object.assign({ id: 3, nom: 'Maison des Rencontres', owner_user_id: 7, vitrine_type: 'events', description: 'La maison des rencontres de la communauté.', site_web: 'https://maison.example.org', reseaux_sociaux: JSON.stringify({ facebook: 'https://facebook.com/maison' }) }, init) },
    '/evenements?owner=7&boutique=1': { evenements: [EVT] },
    '/auth/me': { user: null },
    '/agenda/evenements-ajoutes': { ids: [] },
  };
  const fetch = async (u) => { const rep = reponses[String(u).replace(/^\/api/, '')]; return { ok: !!rep, status: rep ? 200 : 404, json: async () => rep || { error: 'Introuvable.' } }; };
  const fenetre = { document, fetch, location: { search: '?id=3', origin: 'http://x', href: '' }, navigator: {}, matchMedia: () => ({ matches: false }), addEventListener() {}, parent: null };
  fenetre.parent = fenetre;
  fenetre.DA_verifierMaintenanceBoutique = async () => false;
  const ctx = vm.createContext(Object.assign(fenetre, { window: fenetre, URLSearchParams, setTimeout, clearTimeout, console }));
  vm.runInContext(JS_RUB, ctx);
  vm.runInContext(JS_EV, ctx);
  await new Promise((r) => setTimeout(r, 40));
  return app.innerHTML;
}

test('E1 sans décision du propriétaire, la page Événements montre inscription, réseaux, contact et présentation comme avant', async () => {
  const html = await lancerEvenements();
  assert.match(html, /S’inscrire/);
  assert.match(html, /pied-contact/);
  assert.match(html, /aria-label="Facebook"/);
  assert.match(html, /La maison des rencontres de la communauté/);
});

test("E1 la rubrique Réservation éteinte : les événements restent visibles mais sans bouton d'inscription", async () => {
  const html = await lancerEvenements({ vitrine_modules_state: eteint('reservation') });
  assert.match(html, /Atelier cuisine/);
  assert.doesNotMatch(html, /S’inscrire/);
  assert.match(html, /Événement informatif/);
});

test('E1 contact, réseaux et présentation éteints : disparus du bas de page, le reste est intact', async () => {
  const sans = (...c) => lancerEvenements({ vitrine_modules_state: eteint(...c) });
  const c = await sans('contact');
  assert.doesNotMatch(c, /pied-contact/);
  assert.match(c, /Explorer/, 'le reste du bas de page est intact');
  assert.match(c, /pied-bas/);
  const r = await sans('reseaux_sociaux');
  assert.doesNotMatch(r, /aria-label="Facebook"/);
  assert.doesNotMatch(r, /aria-label="Site web"/);
  const a = await sans('a_propos');
  assert.doesNotMatch(a, /logo-pied">[^<]*<\/div><p>La maison des rencontres/);
  assert.match(a, /L’agenda en ligne de la communauté/, 'texte par défaut à la place de la présentation');
});

/* ═════════════ 5. Branchement ═════════════ */
test("W1 les pages chargent le module avant leur script et ne l'utilisent que s'il est présent", () => {
  for (const [html, js] of [['portfolio.html', 'boutique-portfolio.js'], ['boutique-evenements.html', 'boutique-evenements.js']]) {
    const src = lire(html);
    const a = src.indexOf('boutique-rubriques.js'), b = src.lastIndexOf(js);
    assert.ok(a > 0 && b > a, `${html} : le module doit précéder ${js}`);
  }
  assert.match(JS_PF, /!window\.BoutiqueRubriques \|\|/);
  assert.match(JS_EV, /!window\.BoutiqueRubriques \|\|/);
});

test("W1 le serveur marque seulement les décisions du propriétaire", () => {
  const src = lire('server/index.js');
  assert.match(src, /if \(stored\[key\]\.choisi === true\) state\[key\]\.choisi = true;/);
  assert.match(src, /val\.actif !== undefined \|\| currentModules\[key\]\.choisi \? \{ choisi: true \}/);
});
