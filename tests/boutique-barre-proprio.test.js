/* ===========================================================
   tests/boutique-barre-proprio.test.js — Le propriétaire voit la NOUVELLE boutique (2026-11-14)
   1. profil.html?id=…#vitrine et ?vitrine=1 mènent à la page dédiée, propriétaire compris ; brouillon et paiement gardent l'ancienne vue (?edition=1 retiré le 2026-11-25).
   2. Le serveur dit « est_proprietaire » au seul propriétaire ; la maintenance le laisse passer, pas un visiteur.
   3. Une barre (Paramètres / ancienne vue / profil) s'affiche pour lui seul, jamais dans l'aperçu de l'assistant.
   Lancer : node --test tests/boutique-barre-proprio.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const PAGES = [['boutique.html', 'commerce'], ['portfolio.html', 'portfolio'], ['boutique-video.html', 'video'], ['boutique-evenements.html', 'evenements'],
  ['boutique-impact.html', 'impact'], ['boutique-finance.html', 'finance']];

test('B1 la redirection vers la page dédiée vaut pour le propriétaire et pour le lien #vitrine, sauf demande de l\'ancienne vue', () => {
  const s = lire('profil-app.html');
  /* Depuis le 2026-11-14 la décision est dans versPageBoutiqueDediee(), appelée à l'ouverture (#vitrine) et au clic sur l'onglet (voir profil-clic-boutique.test.js). */
  assert.match(s, /startsWith\('#vitrine'\)\) && \(await versPageBoutiqueDediee\(\)\) === true\) return;/);
  assert.match(s, /if \(q\.get\('paiement'\) \|\| q\.get\('preview'\) \|\| !profil \|\| !profil\.initiative_id\) return false;/);
  assert.ok(!/if \(!isOwn && profil\.initiative_id/.test(s), 'le propriétaire ne doit plus être exclu');
  ['boutique.html', 'portfolio.html', 'boutique-video.html', 'boutique-evenements.html', 'boutique-impact.html', 'boutique-finance.html'].forEach((p) => assert.ok(s.includes("'" + p), p));
});

test('B2 le serveur marque le seul propriétaire connecté', () => {
  const serveur = lire('server/index.js');
  const i = serveur.indexOf('row.est_proprietaire = false;');
  assert.ok(i > 0, 'drapeau est_proprietaire absent');
  assert.match(serveur.slice(i, i + 400), /Number\(_moiProp\.id\) === Number\(row\.owner_user_id\)/);
});

test('B3 la maintenance laisse passer le propriétaire confirmé par le serveur, jamais un visiteur', async () => {
  const js = lire('assets/boutique-maintenance.js');
  const faux = (reponses) => (url) => { const r = reponses.find((x) => url.indexOf(x.contient) >= 0); if (!r) return Promise.reject(new Error('non simulé')); return Promise.resolve({ ok: true, json: () => Promise.resolve(r.corps) }); };
  const ctx = (reponses, recherche) => {
    const f = { location: { search: recherche }, URLSearchParams, encodeURIComponent, Promise, fetch: faux(reponses), document: { getElementById: () => null } };
    f.window = f; vm.runInContext(js, vm.createContext(f)); return f;
  };
  const maintenance = { contient: 'boutiques-maintenance', corps: { en_maintenance: true } };
  const el = { innerHTML: '' };
  let bloque = await ctx([maintenance, { contient: '/api/initiatives/', corps: { initiative: { est_proprietaire: true } } }], '?id=14').DA_verifierMaintenanceBoutique(el);
  assert.equal(bloque, false); assert.equal(el.innerHTML, '');
  bloque = await ctx([maintenance, { contient: '/api/initiatives/', corps: { initiative: { est_proprietaire: false, apercu_brouillon: false } } }], '?id=14').DA_verifierMaintenanceBoutique(el);
  assert.equal(bloque, true); assert.match(el.innerHTML, /réorganisation/);
});

test('B4 la barre du propriétaire existe, ne s\'affiche pas dans l\'aperçu et vise les bons liens', () => {
  const js = lire('assets/boutique-barre-proprio.js');
  assert.match(js, /window\.top !== window\.self \|\| q\.get\('preview'\)/);
  assert.match(js, /Number\(moi\.id\) === Number\(ini\.owner_user_id\)/);
  assert.match(js, /dashboard-initiative\.html#parametres-vitrine/);
  assert.ok(!/edition=1/.test(js.replace(/\/\*[\s\S]*?\*\//g, '')), 'plus aucun lien vers ?edition=1');
  assert.match(js, /min-height:44px/);
});

test('B5 les 6 pages boutique chargent la barre après leur script', () => {
  PAGES.forEach(([html, nom]) => {
    const h = lire(html);
    const p = h.indexOf('/assets/boutique-' + nom + '.js'), b = h.indexOf('/assets/boutique-barre-proprio.js');
    assert.ok(p > 0 && b > p, html);
  });
});

test('B7 la barre ne parle plus d\'« ancienne vue » et tient sur une rangée au téléphone ; les cartes ne débordent plus', () => {
  const js = lire('assets/boutique-barre-proprio.js');
  assert.ok(!/Ancienne vue d.édition<\/a>/.test(js), 'le libellé « Ancienne vue d\'édition » ne doit plus être proposé');
  assert.match(js, /Mes produits/);
  assert.match(js, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  const css = lire('assets/boutique-commerce.css');
  const bloc = css.slice(css.lastIndexOf('Téléphone (2026-11-19)'));
  assert.match(bloc, /\.bq-actions\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(bloc, /\.bq-actions \.plein\{order:-1\}/);
});

test('B6 « Gérer mes vidéos » mène à la rubrique « Mes vidéos » des Paramètres (plus à l’ancienne vue d’édition)', () => {
  const s = lire('assets/boutique-video.js');
  assert.ok(s.includes('dashboard-initiative.html#parametres-vitrine&videos">Gérer mes vidéos'));
  assert.ok(!s.includes('profil.html?vitrine=1&edition=1">Gérer mes vidéos'));
});
