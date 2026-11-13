/* ===========================================================
   tests/boutique-a11y-4d.test.js — Lot 4D (2026-11-13) : accessibilité des pages Commerce, Vidéo, Portfolio, Événements
   1. Les fenêtres gardent Tab à l'intérieur et rendent le focus à l'élément d'ouverture (assets/boutique-a11y.js).
   2. Les cibles tactiles passent à 44 px sur téléphone seulement (assets/boutique-a11y.css).
   3. Le carrousel Commerce/Portfolio s'arrête sous une fenêtre ouverte ou au survol / focus ; « Voir la création » ouvre bien la création.
   Lancer : node --test tests/boutique-a11y-4d.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const PAGES = [['boutique.html', 'boutique-commerce'], ['portfolio.html', 'boutique-portfolio'], ['boutique-video.html', 'boutique-video'], ['boutique-evenements.html', 'boutique-evenements']];

test('A4-1 les 4 pages chargent l\'assistant de focus avant leur script, et la feuille des cibles tactiles', () => {
  PAGES.forEach(([html, js]) => {
    const h = lire(html);
    const a = h.indexOf('/assets/boutique-a11y.js'), p = h.indexOf('/assets/' + js + '.js');
    assert.ok(a > 0 && p > a, html + ' : script a11y absent ou chargé après la page');
    assert.match(h, /<link rel="stylesheet" href="\/assets\/boutique-a11y\.css/, html);
  });
});

test('A4-2 chaque page piège le focus à l\'ouverture et le libère à la fermeture', () => {
  PAGES.forEach(([, js]) => {
    const s = lire('assets/' + js + '.js');
    assert.match(s, /BoutiqueA11y\.piege\(/, js + ' : piège absent');
    assert.match(s, /libere(r)?(Fenetre|Lecteur|Fiche)\(\)/, js + ' : libération absente');
  });
});

test('A4-3 l\'assistant garde Tab dans la fenêtre et rend le focus (simulation sans navigateur)', () => {
  const vm = require('node:vm');
  const ecouteurs = {};
  const fabrique = (nom) => ({ nom, focus() { doc.activeElement = this; }, contains(x) { return x === this || (this.enfants || []).includes(x); } });
  const b1 = fabrique('b1'), b2 = fabrique('b2'), opener = fabrique('opener');
  const zone = Object.assign(fabrique('zone'), { enfants: [b1, b2], setAttribute() {}, querySelectorAll: () => [b1, b2] });
  [b1, b2].forEach((b) => { b.offsetWidth = 10; b.hidden = false; });
  const doc = { activeElement: opener, body: {}, addEventListener(t, f) { ecouteurs[t] = f; }, removeEventListener(t) { delete ecouteurs[t]; }, contains: () => true };
  const w = { document: doc, getComputedStyle: () => ({ visibility: 'visible', display: 'block' }) };
  w.window = w;
  vm.runInContext(lire('assets/boutique-a11y.js'), vm.createContext(w));
  const liberer = w.BoutiqueA11y.piege(zone);
  assert.equal(doc.activeElement, b1, 'le focus entre dans la fenêtre');
  let bloque = false;
  doc.activeElement = b2; ecouteurs.keydown({ key: 'Tab', shiftKey: false, preventDefault() { bloque = true; } });
  assert.ok(bloque && doc.activeElement === b1, 'Tab sur le dernier élément revient au premier');
  bloque = false; doc.activeElement = b1; ecouteurs.keydown({ key: 'Tab', shiftKey: true, preventDefault() { bloque = true; } });
  assert.ok(bloque && doc.activeElement === b2, 'Maj+Tab sur le premier élément va au dernier');
  liberer();
  assert.equal(doc.activeElement, opener, 'le focus revient à l\'élément d\'ouverture');
  assert.equal(ecouteurs.keydown, undefined, 'écouteurs retirés');
});

test('A4-4 les cibles tactiles passent à 44 px sur téléphone seulement', () => {
  const css = lire('assets/boutique-a11y.css');
  assert.match(css, /@media \(pointer: coarse\), \(max-width: 720px\)/);
  assert.ok(css.indexOf('@media') < css.indexOf('::after'), 'les règles sont dans la requête tactile');
  ['.bq-coeur', '.bv-coeur', '.pf-coeur', '.bq-fermer', '.bv-fermer', '.pf-fermer', '.bq-points button', '.pf-points button', '.bq-pied li a'].forEach((c) => assert.ok(css.includes(c), c));
  assert.match(css, /44px/);
});

test('A4-5 le carrousel s\'arrête sous une fenêtre ouverte ou au survol / focus', () => {
  [['boutique-commerce', '.bq-carrousel'], ['boutique-portfolio', '.pf-une']].forEach(([js, classe]) => {
    const s = lire('assets/' + js + '.js');
    assert.ok(s.includes("document.querySelector('" + classe + "')"), js);
    assert.match(s, /!modalEl\.hidden \|\| \(c && \(c\.matches\(':hover'\) \|\| c\.contains\(document\.activeElement\)\)\)/, js);
  });
});

test('A4-6 « Voir la création » du carrousel Portfolio vise la bonne création (plus de -1)', () => {
  const s = lire('assets/boutique-portfolio.js');
  assert.ok(s.includes("data-voir=\"' + k + '\">Voir la création"));
  assert.ok(!s.includes("data-voir=\"' + creations().indexOf(x)"));
});
