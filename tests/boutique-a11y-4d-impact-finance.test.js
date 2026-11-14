/* ===========================================================
   tests/boutique-a11y-4d-impact-finance.test.js — Accessibilité des pages Impact et Finance (lot 4D, 2026-11-14)
   ===========================================================
   Ces deux pages n'ont aucune fenêtre modale (le dépôt « Soumettre à Diaspo'Actif » change de page, les réglages
   utilisent un <dialog> natif qui garde le focus) : le piège de tabulation n'y est donc pas nécessaire. Corrigés ici :
   1. un lien « Aller au contenu » en tête de page, qui mène au contenu principal ;
   2. des cibles tactiles de 44 px sur téléphone et écran tactile (boutons « petit », logo, liens du pied, catégories) ;
   3. une barre de rubriques qui reste utilisable sur mobile (défilante, pas masquée) ;
   4. des pages qui chargent bien le CSS et le JS à jour (adresses versionnées).
   Lancer : node --test tests/boutique-a11y-4d-impact-finance.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const IMP_JS = lire('assets/boutique-impact.js');
const FIN_JS = lire('assets/boutique-finance.js');
const IMP_CSS = lire('assets/boutique-impact.css');
const IMP_HTML = lire('boutique-impact.html');
const FIN_HTML = lire('boutique-finance.html');

/* Le CSS qui suit le marqueur du lot 4D (tout le reste du fichier est antérieur). */
const BLOC_4D = IMP_CSS.slice(IMP_CSS.indexOf('Accessibilité (lot 4D)'));

test('A1 les deux pages commencent par un lien « Aller au contenu » qui mène au contenu principal', () => {
  [IMP_JS, FIN_JS].forEach((js) => {
    assert.match(js, /<a class="saut" href="#contenu">Aller au contenu<\/a>' \+ entete\(\)/, "le lien précède l'en-tête");
    assert.match(js, /<main class="wrap" id="contenu" tabindex="-1">/, 'la cible existe et peut recevoir le focus');
  });
});

test("A1 le lien d'évitement est caché hors focus, visible au clavier, sans cadre parasite sur la cible", () => {
  assert.match(BLOC_4D, /\.imp \.saut \{[^}]*top: -64px/);
  assert.match(BLOC_4D, /\.imp \.saut:focus \{ top: 8px; \}/);
  assert.match(BLOC_4D, /\.imp main:focus \{ outline: none; \}/);
});

test('A2 sur téléphone et écran tactile : 44 px de haut pour les boutons « petit », le logo, les liens du pied et les catégories', () => {
  const m = /@media \(pointer: coarse\), \(max-width: 720px\) \{([\s\S]*?)\n\}/.exec(BLOC_4D);
  assert.ok(m, 'bloc tactile présent');
  ['\\.imp \\.btn\\.petit \\{ min-height: 44px', '\\.imp \\.logo \\{ min-height: 44px', '\\.imp \\.pied a \\{[^}]*min-height: 44px', '\\.imp \\.cat \\{ min-height: 44px']
    .forEach((motif) => assert.match(m[1], new RegExp(motif)));
});

test('A2 sur ordinateur, le rendu de la maquette ne change pas : les règles de 44 px sont réservées au tactile', () => {
  assert.doesNotMatch(IMP_CSS.slice(0, IMP_CSS.indexOf('Accessibilité (lot 4D)')), /\.imp \.pied a \{[^}]*min-height: 44px/);
  assert.match(IMP_CSS, /\.imp \.btn\.petit \{ min-height: 38px;/, 'le bouton « petit » garde sa hauteur sur ordinateur');
});

test("A3 la barre de rubriques n'est plus masquée sur mobile : elle défile sur une ligne dédiée", () => {
  assert.match(IMP_CSS, /@media \(max-width: 1000px\) \{\s*\/\* Rubriques : une ligne défilante[\s\S]*?\.imp \.nav \{ display: flex; flex-wrap: nowrap; order: 3; flex: 1 0 100%; overflow-x: auto;/);
  assert.match(IMP_CSS, /\.imp \.nav a \{[^}]*min-height: 44px/, 'chaque rubrique fait déjà 44 px');
});

test('A4 le focus clavier reste visible et le défilement lissé respecte « réduire les animations »', () => {
  assert.match(IMP_CSS, /\.imp :focus-visible \{ outline: 3px solid var\(--acc\)/);
  assert.match(IMP_CSS, /@media \(prefers-reduced-motion: reduce\) \{\s*\.imp \{ scroll-behavior: auto; \}/);
});

test('A5 les pages chargent le CSS et le JS à jour (adresses versionnées)', () => {
  assert.match(IMP_HTML, /boutique-impact\.css\?v=3/);
  assert.match(IMP_HTML, /boutique-impact\.js\?v=4/);
  assert.match(FIN_HTML, /boutique-impact\.css\?v=3/, 'Finance partage le CSS Impact');
  assert.match(FIN_HTML, /boutique-finance\.js\?v=3/);
});

test("A6 aucune de ces deux pages n'ouvre de fenêtre modale maison (rien à piéger au clavier)", () => {
  [IMP_JS, FIN_JS].forEach((js) => {
    assert.doesNotMatch(js, /aria-modal|role="dialog"|\.showModal\(/);
  });
});
