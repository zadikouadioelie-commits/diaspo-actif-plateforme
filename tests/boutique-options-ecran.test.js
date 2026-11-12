/* ===========================================================
   tests/boutique-options-ecran.test.js — Lot B4 : écran des options d'une boutique (2026-11-12)
   ===========================================================
   1. Serveur : les options du brouillon sont lues par le propriétaire (mon-initiative?preview=draft), PUBLIÉES avec la boutique
      (colonne vitrine_options_json) et ne fuient pas vers un visiteur ; passer à un type qui était une option la retire à la publication.
   2. Écran (faux navigateur, sans réseau) : maximum et exemplaires viennent du registre, ajout / retrait / exemplaires, plafond atteint,
      type non ouvert, erreur du serveur affichée, aucun libellé écrit à la main, aucune émoticône.
   Aucun paiement, aucune boutique existante modifiée : serveur réel sur une COPIE de la base de dev.
   Lancer : node --test tests/boutique-options-ecran.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const H = require('./_formation-harness');
const BT = require('../server/boutique-types.js');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

/* ═════════════ 1. Serveur ═════════════ */
let env, rnd, jarAdmin, proprio, visiteur, oid;
const sql = (req, ...args) => {
  const db = new DatabaseSync(env.dbPath);
  try { db.exec('PRAGMA busy_timeout=5000'); return /^\s*select/i.test(req) ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); }
};
async function compte(nom) {
  const jar = H.cookieJar();
  await H.creerApprenant(env, jar, rnd, nom);
  return { jar, id: sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id };
}
const mon = (jar, brouillon = true) => env.call(jar, 'GET', '/api/mon-initiative' + (brouillon ? '?preview=draft' : ''));
const put = (options) => env.call(proprio.jar, 'PUT', `/api/initiatives/${oid}/vitrine-draft`, { options });

test.before(async () => {
  rnd = Math.random().toString(36).slice(2, 9);
  env = await H.demarrer('options-ecran');
  jarAdmin = H.cookieJar();
  await H.creerFormateur(env, jarAdmin, rnd, 'AdminOpt');
  proprio = await compte('ProprioOpt');
  visiteur = await compte('VisiteurOpt');
  oid = Number(sql('insert into initiatives (nom, owner_user_id, vitrine_type) values (?,?,?)', `Studio Options ${rnd}`, proprio.id, 'video').lastInsertRowid);
  assert.equal((await env.call(jarAdmin, 'PUT', '/api/admin/boutique-types-v2', { actif: true })).status, 200);
});
test.after(() => { if (env) env.stop(); });

test('B4 une boutique neuve n\'a aucune option, au brouillon comme en public', async () => {
  const b = (await mon(proprio.jar)).data.initiative;
  assert.deepEqual(b.vitrine_options, []);
  assert.deepEqual((await mon(proprio.jar, false)).data.initiative.vitrine_options, []);
});

test('B4 les options enregistrées sont relues au brouillon, pas encore publiées', async () => {
  assert.equal((await put([{ type: 'portfolio', copies: 2 }, { type: 'ecom' }])).status, 200);
  assert.deepEqual((await mon(proprio.jar)).data.initiative.vitrine_options, [{ type: 'portfolio', copies: 2 }, { type: 'ecom', copies: 1 }]);
  assert.deepEqual((await mon(proprio.jar, false)).data.initiative.vitrine_options, [], 'rien n\'est publié avant « Publier »');
  assert.equal(sql('select vitrine_options_json as o from initiatives where id=?', oid)[0].o, '[]');
});

test('B4 « Publier » enregistre les options avec la boutique et vide le brouillon', async () => {
  const pub = await env.call(proprio.jar, 'POST', `/api/initiatives/${oid}/vitrine-publish`);
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  assert.deepEqual(JSON.parse(sql('select vitrine_options_json as o from initiatives where id=?', oid)[0].o), [{ type: 'portfolio', copies: 2 }, { type: 'ecom', copies: 1 }]);
  assert.deepEqual((await mon(proprio.jar, false)).data.initiative.vitrine_options, [{ type: 'portfolio', copies: 2 }, { type: 'ecom', copies: 1 }]);
  assert.equal(sql('select vitrine_draft_json as d from initiatives where id=?', oid)[0].d, '{}');
});

test('B4 une publication sans changement d\'options conserve les options déjà publiées', async () => {
  assert.equal((await env.call(proprio.jar, 'PUT', `/api/initiatives/${oid}/vitrine-draft`, { theme: 'bordeaux' })).status, 200);
  assert.equal((await env.call(proprio.jar, 'POST', `/api/initiatives/${oid}/vitrine-publish`)).status, 200);
  assert.equal(JSON.parse(sql('select vitrine_options_json as o from initiatives where id=?', oid)[0].o).length, 2);
});

test('B4 retirer toutes les options puis publier les efface', async () => {
  assert.equal((await put([])).status, 200);
  assert.deepEqual((await mon(proprio.jar)).data.initiative.vitrine_options, []);
  assert.equal((await env.call(proprio.jar, 'POST', `/api/initiatives/${oid}/vitrine-publish`)).status, 200);
  assert.equal(sql('select vitrine_options_json as o from initiatives where id=?', oid)[0].o, '[]');
});

test('B4 changer le type principal vers une option publiée retire cette option (un type n\'est jamais principal ET option)', async () => {
  assert.equal((await put([{ type: 'portfolio' }, { type: 'ecom' }])).status, 200);
  assert.equal((await env.call(proprio.jar, 'POST', `/api/initiatives/${oid}/vitrine-publish`)).status, 200);
  const migre = await env.call(proprio.jar, 'POST', `/api/initiatives/${oid}/vitrine/changer-type`, { type: 'portfolio', mode: 'adapter', confirme: true });
  assert.equal(migre.status, 200, JSON.stringify(migre.data));
  assert.deepEqual((await mon(proprio.jar)).data.initiative.vitrine_options.map((o) => o.type), ['ecom']);
  assert.equal((await env.call(proprio.jar, 'POST', `/api/initiatives/${oid}/vitrine-publish`)).status, 200);
  assert.deepEqual(JSON.parse(sql('select vitrine_options_json as o from initiatives where id=?', oid)[0].o).map((o) => o.type), ['ecom']);
});

test('B4 un autre compte ne peut ni lire le brouillon de cette boutique ni changer ses options', async () => {
  assert.equal((await env.call(visiteur.jar, 'PUT', `/api/initiatives/${oid}/vitrine-draft`, { options: [{ type: 'video' }] })).status, 403);
  assert.ok(!(await mon(visiteur.jar)).data.initiative || (await mon(visiteur.jar)).data.initiative.id !== oid, 'l\'espace d\'un autre compte ne montre pas cette boutique');
});

test('B4 une valeur illisible dans la colonne ne casse pas la page : liste vide', async () => {
  sql('update initiatives set vitrine_options_json=? where id=?', '{pas du json', oid);
  const r = await mon(proprio.jar, false);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.initiative.vitrine_options, []);
});

/* ═════════════ 2. L'écran, dans un faux navigateur ═════════════ */
const JS = lire('assets/boutique-options-ui.js');
const DESC = {
  actif: true, max_options: 5, max_copies: 3,
  types: BT.descriptionPourInterface({ actif: true, estAdministrateur: false }).types,
};

function ecran({ principal = 'ecom', options = [], desc = DESC, onChanger = async () => {} } = {}) {
  const ecouteurs = {};
  const zone = { innerHTML: '', addEventListener: (t, f) => { ecouteurs[t] = f; }, querySelector: () => erreur };
  const erreur = { textContent: '', hidden: true };
  const document = { getElementById: () => ({}), head: { appendChild() {} }, createElement: () => ({}) };
  const fenetre = { document, BoutiqueTypesUI: { icones: { ecom: '<path d="M0 0"/>' } } };
  fenetre.window = fenetre;
  vm.runInContext(JS, vm.createContext(Object.assign(fenetre, { console, Promise })));
  const appels = [];
  const rendre = (o) => fenetre.BoutiqueOptionsUI.rendre(zone, { desc, principal, options, onChanger: async (l) => { appels.push(JSON.parse(JSON.stringify(l))); return onChanger(l); }, ...o });
  rendre();
  /* Clic simulé sur un bouton défini par ses attributs data-*. */
  const cliquer = async (attr, valeur, pas) => {
    const attributs = { [attr]: valeur, 'data-btop-pas': pas };
    const b = { disabled: false, getAttribute: (a) => (attributs[a] === undefined ? null : attributs[a]) };
    b.closest = () => b;
    ecouteurs.click({ target: b });
    await new Promise((r) => setTimeout(r, 10));
  };
  return { zone, erreur, appels, cliquer, rendre, ecouteurs };
}

test('B4 l\'écran affiche le maximum et les exemplaires venus du registre, jamais d\'un nombre écrit à la main', () => {
  const { zone } = ecran({ options: [{ type: 'portfolio', copies: 2 }] });
  assert.match(zone.innerHTML, new RegExp(`Options actives : 1 sur ${BT.REGISTRE.MAX_OPTIONS}`));
  assert.match(zone.innerHTML, new RegExp(`<strong>${BT.REGISTRE.MAX_OPTIONS}</strong> au plus`));
  assert.match(zone.innerHTML, new RegExp(`jusqu'à <strong>${BT.REGISTRE.MAX_COPIES}</strong> exemplaires`));
  assert.ok(!/\b(4|5)\b options?/.test(JS), 'aucun nombre d\'options écrit dans le script');
  const labels = DESC.types.filter((t) => t.cle !== 'ecom').map((t) => t.label);
  for (const l of labels) assert.ok(zone.innerHTML.includes(l.replace(/'/g, '&#39;')), l);
  assert.ok(!zone.innerHTML.includes('data-btop-ajouter="ecom"'), 'le type principal ne se propose pas en option');
});

test('B4 ajouter une option envoie la liste complète à l\'écran parent', async () => {
  const e = ecran({ options: [{ type: 'portfolio', copies: 1 }] });
  await e.cliquer('data-btop-ajouter', 'video');
  assert.deepEqual(e.appels[0], [{ type: 'portfolio', copies: 1 }, { type: 'video', copies: 1 }]);
});

test('B4 retirer une option, et ajouter/retirer un exemplaire dans les bornes du registre', async () => {
  const e = ecran({ options: [{ type: 'portfolio', copies: 2 }, { type: 'video', copies: 1 }] });
  await e.cliquer('data-btop-retirer', 'portfolio');
  assert.deepEqual(e.appels[0], [{ type: 'video', copies: 1 }]);
  await e.cliquer('data-btop-type', 'portfolio', '1');
  assert.deepEqual(e.appels[1].find((o) => o.type === 'portfolio'), { type: 'portfolio', copies: 3 });
  /* au plafond, le bouton « + » est désactivé ; à 1, le bouton « − » l'est aussi */
  const plafond = ecran({ options: [{ type: 'portfolio', copies: BT.REGISTRE.MAX_COPIES }] });
  assert.match(plafond.zone.innerHTML, /data-btop-pas="1"[^>]*disabled/);
  const un = ecran({ options: [{ type: 'portfolio', copies: 1 }] });
  assert.match(un.zone.innerHTML, /data-btop-pas="-1"[^>]*disabled/);
});

test('B4 type non ouvert : « Bientôt disponible », bouton désactivé ; plafond atteint : ajout impossible et expliqué', () => {
  const e = ecran({ options: [] });
  assert.match(e.zone.innerHTML, /Bientôt disponible/, 'impact et finance ne sont pas ouverts aux propriétaires');
  assert.match(e.zone.innerHTML, /data-btop-ajouter="impact"[^>]*disabled/);
  /* un registre où tout est ouvert, avec le maximum d'options déjà pris */
  const tout = { ...DESC, types: DESC.types.map((t) => ({ ...t, selectionnable: true })) };
  const autres = tout.types.filter((t) => t.cle !== 'ecom').map((t) => ({ type: t.cle, copies: 1 }));
  const pleine = ecran({ desc: tout, options: autres });
  assert.match(pleine.zone.innerHTML, new RegExp(`Options actives : ${autres.length} sur ${tout.max_options}`));
  assert.ok(!/data-btop-ajouter/.test(pleine.zone.innerHTML), 'toutes les options sont déjà prises : plus rien à ajouter');
  const presque = ecran({ desc: tout, options: autres.slice(0, -1) });
  assert.match(presque.zone.innerHTML, /data-btop-ajouter=/, 'une place libre : on peut encore ajouter');
});

test('B4 le serveur peut refuser : son message est affiché à l\'écran', async () => {
  const e = ecran({ options: [], onChanger: async () => { throw new Error('Une boutique a au plus 5 options.'); } });
  await e.cliquer('data-btop-ajouter', 'video');
  assert.equal(e.erreur.textContent, 'Une boutique a au plus 5 options.');
  assert.equal(e.erreur.hidden, false);
});

test('B4 sans type principal reconnu, l\'écran demande d\'abord de choisir un type', () => {
  const e = ecran({ principal: null });
  assert.match(e.zone.innerHTML, /Choisissez d'abord/);
  assert.ok(!/data-btop-ajouter/.test(e.zone.innerHTML));
});

test('B4 le texte venu des données est échappé', () => {
  const piege = { ...DESC, types: DESC.types.map((t, i) => (i === 1 ? { ...t, label: '<img src=x onerror=1>' } : t)) };
  const e = ecran({ principal: 'ecom', desc: piege });
  assert.ok(!e.zone.innerHTML.includes('<img src=x'));
});

/* ═════════════ 3. Qualité et branchement ═════════════ */
test('B4 aucune émoticône dans l\'écran et ses ajouts ; le script est valide', () => {
  const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  assert.ok(!emo.test(JS));
  assert.doesNotThrow(() => new vm.Script(JS));
});

test('B4 le tableau de bord charge l\'écran et le branche sur le brouillon (PUT vitrine-draft { options })', () => {
  const html = lire('dashboard-initiative.html');
  assert.match(html, /boutique-options-ui\.js/);
  assert.match(html, /<div id="pv-options"><\/div>/);
  assert.match(html, /pvDraftPatch\(\{ options: liste \}\)/);
  assert.match(html, /init\.vitrine_options/);
  assert.match(html, /BoutiqueOptionsUI\.rendre\(zone/);
});

test('B4 la colonne existe aussi dans le schéma PostgreSQL', () => {
  assert.match(lire('server/pg-init.js'), /\['initiatives', 'vitrine_options_json'/);
  assert.match(lire('server/db.js'), /vitrine_options_json/);
});
