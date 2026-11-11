/* ===========================================================
   tests/boutique-types-v2.test.js — Lot B : les 6 types de boutique sur la vraie plateforme (2026-11-11)
   ===========================================================
   1. Module server/boutique-types.js : correspondance des anciens types, types ouverts, modèles construits depuis le registre.
   2. Interrupteur administrateur (désactivé par défaut) : rien ne change tant qu'il est éteint.
   3. Choix du type : événements / impact / financement réservés à l'administration, anciens types « conservés mais plus proposés ».
   4. Aucune ligne de boutique n'est réécrite par la mise en service (correspondance à la lecture seulement).
   5. profil-app.html redirige toujours les boutiques existantes (commercial, portfolio, video) et accepte « ecom ».
   Vrai serveur sur une COPIE de la base de dev. Aucun paiement.
   Lancer : node --test tests/boutique-types-v2.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./_formation-harness');
const BT = require('../server/boutique-types.js');
const Registre = require('../assets/boutique-types.js');

const RACINE = path.join(__dirname, '..');

/* ═════════════ 1. Le module ═════════════ */
test('B1 les anciennes clés sont ramenées aux 6 types du registre', () => {
  assert.equal(BT.typeCanonique('commercial'), 'ecom');
  assert.equal(BT.typeCanonique('evenement'), 'events');
  assert.equal(BT.typeCanonique('projet'), 'impact');
  assert.equal(BT.typeCanonique('portfolio'), 'portfolio');
  assert.equal(BT.typeCanonique('video'), 'video');
  assert.equal(BT.typeCanonique('finance'), 'finance');
  for (const ancien of BT.ANCIENS_SANS_EQUIVALENT) assert.equal(BT.typeCanonique(ancien), null, `${ancien} n'a pas d'équivalent`);
  /* Toutes les cibles existent dans le registre : une faute de frappe ici casserait une boutique. */
  for (const cible of Object.values(BT.ANCIEN_VERS_NOUVEAU)) assert.ok(Registre.TYPES[cible], `${cible} absent du registre`);
});

test('B1 le nombre de types et le maximum d\'options viennent du registre, jamais d\'un nombre écrit à la main', () => {
  const d = BT.descriptionPourInterface({ actif: true, estAdministrateur: true });
  assert.equal(d.types.length, Object.keys(Registre.TYPES).length);
  assert.equal(d.max_options, Registre.MAX_OPTIONS);
  assert.equal(d.max_options, d.types.length - 1);
  assert.equal(d.max_copies, Registre.MAX_COPIES);
});

test('B1 une vraie boutique choisit ecom, video, portfolio et events ; impact et finance restent à l\'administration', () => {
  assert.deepEqual(BT.typesSelectionnables({}).sort(), ['ecom', 'events', 'portfolio', 'video']);
  assert.deepEqual(BT.typesSelectionnables({ estAdministrateur: true }).sort(), Object.keys(Registre.TYPES).sort());
});

test('B1 les modèles nouveaux sont ajoutés sans toucher aux anciens', () => {
  const registreModules = { a_propos: {}, services: {}, produits: {}, contact: {}, equipe: {}, documents: {} };
  const templates = {
    commercial: { label: 'ancien', actifs: ['a_propos', 'produits', 'inconnu'], optionnels: ['documents'] },
    evenement: { label: 'ancien', actifs: ['a_propos', 'contact'], optionnels: [] },
    projet: { label: 'ancien', actifs: ['a_propos', 'equipe'], optionnels: [] },
    video: { label: 'ancien', actifs: [], optionnels: [] },
    portfolio: { label: 'ancien', actifs: [], optionnels: [] },
  };
  const copie = JSON.parse(JSON.stringify(templates));
  const ajoutes = BT.ajouterTemplatesV2(templates, registreModules);
  assert.deepEqual(ajoutes.sort(), ['ecom', 'events', 'finance', 'impact']);
  for (const cle of ['commercial', 'evenement', 'projet']) assert.deepEqual(templates[cle], copie[cle], `${cle} a été modifié`);
  assert.deepEqual(templates.ecom.actifs, ['a_propos', 'produits'], 'un module inconnu doit être écarté, pas copié');
  assert.equal(templates.ecom.v2, true);
});

test('B1 le type « financement » ne contient aucun module de dépôt de projet (un seul dépôt : Soumettre à Diaspo\'Actif)', () => {
  const src = fs.readFileSync(path.join(RACINE, 'server', 'boutique-types.js'), 'utf8');
  const bloc = src.slice(src.indexOf('const MODULES_FINANCE'), src.indexOf('const CLE_INTERRUPTEUR'));
  assert.doesNotMatch(bloc, /depot|soumission|candidature|financement_participatif/i);
});

/* ═════════════ 2 à 4. Le serveur ═════════════ */
let env, jarAdmin, jarProprio, idInit, emailAdmin;
const sql = (req, ...args) => {
  const bd = new H.DatabaseSync(env.dbPath);
  try { return bd.prepare(req).run(...args); } finally { bd.close(); }
};
const lire = (req, ...args) => {
  const bd = new H.DatabaseSync(env.dbPath);
  try { return bd.prepare(req).get(...args); } finally { bd.close(); }
};

/* Le type choisi est écrit dans le brouillon (publié plus tard) ; à défaut, c'est celui de la boutique publiée. */
const typeEnregistre = () => {
  const l = lire('SELECT vitrine_type AS t, vitrine_draft_json AS d FROM initiatives WHERE id=?', idInit);
  const brouillon = JSON.parse(l.d || '{}');
  return brouillon.type !== undefined ? brouillon.type : l.t;
};

test.before(async () => {
  env = await H.demarrer('types-v2');
  const rnd = Math.random().toString(36).slice(2, 8);
  jarProprio = H.cookieJar();
  const proprio = await H.creerApprenant(env, jarProprio, rnd, 'Proprio');
  jarAdmin = H.cookieJar();
  const admin = await H.creerFormateur(env, jarAdmin, rnd, 'Admin'); /* promu administrateur dans la base isolée */
  emailAdmin = admin.email;
  const uid = lire('SELECT id FROM users WHERE email=?', proprio.email).id;
  idInit = Number(sql("INSERT INTO initiatives (nom, owner_user_id, vitrine_type) VALUES ('Boutique test types', ?, 'commercial')", uid).lastInsertRowid);
});
test.after(() => env && env.stop());

test('B2 par défaut les 6 types ne sont PAS en service : le registre garde les anciens modèles et refuse les nouveaux', async () => {
  const r = await env.call(null, 'GET', '/api/vitrine-modules-registry');
  assert.equal(r.status, 200);
  assert.equal(r.data.types_v2.actif, false);
  for (const cle of ['ecom', 'events', 'impact', 'finance']) assert.equal(r.data.templates[cle], undefined, `${cle} ne doit pas être visible tant que l'interrupteur est éteint`);
  assert.ok(r.data.templates.commercial, 'les anciens modèles restent');
  const refus = await env.call(jarProprio, 'POST', `/api/initiatives/${idInit}/vitrine/changer-type`, { type: 'ecom', mode: 'adapter' });
  assert.equal(refus.status, 400);
  const ancien = await env.call(jarProprio, 'POST', `/api/initiatives/${idInit}/vitrine/changer-type`, { type: 'portfolio', mode: 'adapter' });
  assert.equal(ancien.status, 200, 'un ancien type reste choisissable tant que rien n\'est activé');
  assert.equal(typeEnregistre(), 'portfolio', 'le type choisi est gardé dans le brouillon, publié ensuite par le propriétaire');
});

test('B2 seul un administrateur peut lire et changer l\'interrupteur', async () => {
  assert.equal((await env.call(jarProprio, 'GET', '/api/admin/boutique-types-v2')).status, 403);
  assert.equal((await env.call(jarProprio, 'PUT', '/api/admin/boutique-types-v2', { actif: true })).status, 403);
  assert.equal((await env.call(null, 'PUT', '/api/admin/boutique-types-v2', { actif: true })).status, 403);
  const etat = await env.call(jarAdmin, 'GET', '/api/admin/boutique-types-v2');
  assert.equal(etat.status, 200);
  assert.equal(etat.data.actif, false);
  assert.equal((await env.call(jarAdmin, 'PUT', '/api/admin/boutique-types-v2', { actif: 'oui' })).status, 400);
});

test('B3 mise en service : registre des 6 types, types réservés à l\'administration, anciens types non proposés, aucune ligne réécrite', async () => {
  /* Aucune boutique ne doit être modifiée par l'activation. */
  const avant = lire('SELECT COUNT(*) AS n, group_concat(coalesce(vitrine_type,\'\')) AS t FROM initiatives');
  const on = await env.call(jarAdmin, 'PUT', '/api/admin/boutique-types-v2', { actif: true });
  assert.equal(on.status, 200);
  assert.equal(on.data.actif, true);
  const apres = lire('SELECT COUNT(*) AS n, group_concat(coalesce(vitrine_type,\'\')) AS t FROM initiatives');
  assert.deepEqual(apres, avant, 'l\'activation ne doit réécrire aucun type de boutique');

  const reg = await env.call(jarProprio, 'GET', '/api/vitrine-modules-registry');
  assert.equal(reg.data.types_v2.actif, true);
  assert.equal(reg.data.types_v2.types.length, 6);
  const sel = Object.fromEntries(reg.data.types_v2.types.map(t => [t.cle, t.selectionnable]));
  assert.deepEqual(sel, { ecom: true, video: true, portfolio: true, events: true, impact: false, finance: false });
  const regAdmin = await env.call(jarAdmin, 'GET', '/api/vitrine-modules-registry');
  assert.ok(regAdmin.data.types_v2.types.every(t => t.selectionnable), 'l\'administration peut choisir les 6');
  assert.ok(reg.data.templates.ecom && reg.data.templates.finance, 'les modèles nouveaux sont servis');

  const choisir = (type) => env.call(jarProprio, 'POST', `/api/initiatives/${idInit}/vitrine/changer-type`, { type, mode: 'adapter' });
  for (const type of ['impact', 'finance']) assert.equal((await choisir(type)).status, 400, `${type} doit être refusé à une vraie boutique`);
  assert.equal((await choisir('events')).status, 200, 'Créateur d\'événements se choisit comme les autres types');
  assert.equal(typeEnregistre(), 'events');
  for (const ancien of ['blog', 'createur', 'formation']) assert.equal((await choisir(ancien)).status, 400, `${ancien} ne doit plus être proposé`);
  assert.equal((await choisir('inconnu')).status, 400);

  /* « commercial » (ancien nom) est enregistré sous la clé du registre. */
  assert.equal((await choisir('commercial')).status, 200);
  assert.equal(typeEnregistre(), 'ecom');
  assert.equal((await choisir('video')).status, 200);
});

test('B3 le brouillon applique le même contrôle que « changer de type »', async () => {
  const mettre = (type) => env.call(jarProprio, 'PUT', `/api/initiatives/${idInit}/vitrine-draft`, { type });
  assert.equal((await mettre('finance')).status, 400);
  assert.equal((await mettre('blog')).status, 400);
  assert.equal((await mettre('portfolio')).status, 200);
});

test('B3 une boutique qui a déjà un ancien type le garde et peut l\'enregistrer sans erreur', async () => {
  sql("UPDATE initiatives SET vitrine_type='blog', vitrine_draft_json='{}' WHERE id=?", idInit);
  const r = await env.call(jarProprio, 'PUT', `/api/initiatives/${idInit}/vitrine-draft`, { type: 'blog' });
  assert.equal(r.status, 200, 'garder son type actuel ne doit jamais être refusé');
});

test('B3 l\'administrateur peut éteindre l\'interrupteur : on retrouve exactement le comportement d\'avant', async () => {
  assert.equal((await env.call(jarAdmin, 'PUT', '/api/admin/boutique-types-v2', { actif: false })).status, 200);
  const r = await env.call(null, 'GET', '/api/vitrine-modules-registry');
  assert.equal(r.data.types_v2.actif, false);
  assert.equal(r.data.templates.ecom, undefined);
});

/* ═════════════ 5. Non-régression de la page publique ═════════════ */
test('B2 profil-app.html redirige toujours commercial, portfolio, video et accepte ecom', () => {
  const src = fs.readFileSync(path.join(RACINE, 'profil-app.html'), 'utf8');
  assert.match(src, /vitrine_type === 'commercial' \|\| _ib\.vitrine_type === 'ecom'[\s\S]{0,120}boutique\.html/);
  assert.match(src, /vitrine_type === 'portfolio'\) \{ location\.replace\('portfolio\.html/);
  assert.match(src, /vitrine_type === 'video'\) \{ location\.replace\('boutique-video\.html/);
});

/* ═════════════ B3 — l'écran de choix ═════════════ */
test('B3 le tableau de bord Initiative charge le registre, le bouton « Voir l\'exemple » et l\'écran des types', () => {
  const src = fs.readFileSync(path.join(RACINE, 'dashboard-initiative.html'), 'utf8');
  for (const f of ['assets/boutique-types.js', 'assets/boutique-exemple-bouton.js', 'assets/boutique-types-ui.js']) assert.ok(src.includes(`<script src="${f}?v=2"></script>`), `${f} non chargé (avec son numéro de version, pour que les navigateurs n'en gardent pas une ancienne copie)`);
  assert.match(src, /types_v2 && __pvRegistry\.types_v2\.actif && window\.BoutiqueTypesUI/);
  assert.match(src, /BoutiqueTypesUI\.canonique\(v2, courant\) === type/, 'choisir le type déjà en place sous une autre clé ne doit rien proposer');
});

test('B3 l\'écran des types n\'écrit aucun libellé à la main et ne contient aucune émoticône', () => {
  const src = fs.readFileSync(path.join(RACINE, 'assets', 'boutique-types-ui.js'), 'utf8');
  for (const t of Object.values(Registre.TYPES)) assert.ok(!src.includes(t.label), `libellé « ${t.label} » écrit à la main`);
  assert.doesNotMatch(src, /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
});

/* Contrôle visuel du 2026-11-11 : une apostrophe non protégée à la ligne 71 rendait le script invalide ; la page gardait alors l'ancien écran sans rien signaler. */
test("B3 les trois scripts de l'écran des types sont du JavaScript valide et s'exécutent dans une page", () => {
  const vm = require('node:vm');
  for (const f of ['boutique-types.js', 'boutique-exemple-bouton.js', 'boutique-types-ui.js']) {
    const code = fs.readFileSync(path.join(RACINE, 'assets', f), 'utf8');
    assert.doesNotThrow(() => new vm.Script(code, { filename: f }), `${f} : erreur de syntaxe`);
  }
  /* Exécution dans un faux navigateur minimal : l'écran doit s'exposer et dessiner les 6 cartes du registre. */
  const noeud = () => ({ style: {}, innerHTML: '', classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null });
  const zone = noeud();
  const win = { };
  const doc = { getElementById: () => null, createElement: noeud, head: noeud(), body: noeud(), addEventListener() {} };
  const ctx = vm.createContext({ window: win, document: doc, console, setTimeout, Registre: null });
  win.window = win; win.document = doc;
  for (const f of ['boutique-types.js', 'boutique-types-ui.js']) vm.runInContext(fs.readFileSync(path.join(RACINE, 'assets', f), 'utf8'), ctx, { filename: f });
  assert.equal(typeof win.BoutiqueTypesUI, 'object', 'BoutiqueTypesUI doit être exposé sur window');
  const desc = BT.descriptionPourInterface({ actif: true, estAdministrateur: false });
  win.BoutiqueTypesUI.rendre(zone, { desc, courant: 'ecom', onChoisir() {} });
  const nb = (zone.innerHTML.match(/class="btui-carte/g) || []).length;
  assert.equal(nb, desc.types.length, 'une carte par type du registre');
});
