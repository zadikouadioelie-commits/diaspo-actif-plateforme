/* ===========================================================
   tests/boutique-bande-membre.test.js — bande « Devenez membre » d'après la maquette (2026-11-14)
   1. Les deux illustrations nettes (personnes, carte) existent et sont référencées par le CSS de la boutique.
   2. Les trois largeurs (bureau, intermédiaire, téléphone) sont prévues et l'image reste réaffichée en largeur réduite
      (des règles plus anciennes la masquent : display:block doit la rétablir).
   3. Le CSS de la boutique n'a pas été amputé et la page charge la version à jour.
   Lancer : node --test tests/boutique-bande-membre.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(RACINE, 'assets/boutique-commerce.css'), 'utf8');

test('M1 les illustrations nettes existent et le CSS les utilise', () => {
  ['boutique-membre-personnes.webp', 'boutique-membre-carte.webp'].forEach((f) => {
    const p = path.join(RACINE, 'assets', f);
    assert.ok(fs.existsSync(p), f + ' manquant');
    assert.ok(fs.statSync(p).size > 5000, f + ' trop léger : image dégradée ?');
    assert.ok(css.includes('/assets/' + f), f + ' non référencé');
  });
});

test('M2 les trois largeurs sont prévues et l\'image reste visible en largeur réduite', () => {
  assert.match(css, /body\.bq \.bq-membre::before\{display:block;/);
  assert.match(css, /@media \(max-width:1320px\)\{[\s\S]*?body\.bq \.bq-membre::after\{display:none\}/);
  assert.match(css, /@media \(max-width:760px\)\{[\s\S]*?body\.bq \.bq-membre \.bq-bouton\{width:100%/);
  assert.match(css, /min-width:0;max-width:100%/, 'la bande ne doit pas élargir la page');
});

test('M3 le CSS de la boutique est complet et la page charge sa dernière version', () => {
  assert.ok(css.split('\n').length > 480, 'CSS amputé (lignes : ' + css.split('\n').length + ')');
  ['.bq-hero', '.bq-cats-in', '.bq-membre ul{', 'bq-photo'].forEach((m) => assert.ok(css.includes(m), 'règle absente : ' + m));
  const html = fs.readFileSync(path.join(RACINE, 'boutique.html'), 'utf8');
  const v = html.match(/boutique-commerce\.css\?v=(\d+)/);
  assert.ok(v && Number(v[1]) >= 11, 'version du CSS non incrémentée');
});
