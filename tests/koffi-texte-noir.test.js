/* ===========================================================
   tests/koffi-texte-noir.test.js — le texte saisi dans Koffi est toujours NOIR sur fond blanc (2026-11-21)
   ===========================================================
   Sur le téléphone, le thème « Nuit dorée » force une encre claire sur tous les champs ; la zone d'écriture de Koffi est blanche : on n'y voyait plus ce qu'on écrivait.
   Chaque Koffi pose donc une règle qui l'emporte (!important) sur ce thème. Vérifié aussi dans un vrai navigateur avec le thème du téléphone (avant : rgb(232,236,246), après : rgb(0,0,0)).
   Lancer : node --test tests/koffi-texte-noir.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* [fichier, racine, sélecteur de la zone d'écriture] */
const KOFFI = [
  ['koffi-sondages', 'ks-root', 'ks-form textarea'], ['koffi-annuaire', 'ka-root', 'ka-form textarea'], ['koffi-evenements', 'ke-root', 'ke-form textarea'],
  ['koffi-inscriptions', 'ki-root', 'ki-form textarea'], ['koffi-widget', 'kf-root', 'kf-form textarea'], ['koffi-businessplan', 'kb-root', 'kb-form textarea'],
  ['koffi-admin', 'kad-root', 'kad-form textarea'], ['koffi-navigation', 'kn-root', 'kn-form textarea'], ['koffi-createur', null, 'kc-compo textarea'],
];

for (const [fichier, racine, zone] of KOFFI) {
  test(fichier + ' : texte saisi noir sur fond blanc, texte indicatif lisible, même sous le thème sombre du téléphone', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'assets', fichier + '.js'), 'utf8');
    const sel = 'html body ' + (racine ? '.' + racine + ' ' : '') + '.' + zone;
    const i = src.indexOf(sel);
    assert.ok(i > -1, 'règle « ' + sel + ' » présente');
    const regle = src.slice(i, src.indexOf('}', i));
    assert.match(regle, /color:#000!important/, 'texte noir, plus fort que le thème');
    assert.match(regle, /-webkit-text-fill-color:#000!important/, 'remplissage du texte noir (Safari/Chrome mobiles)');
    assert.match(regle, /background:#fff!important/, 'fond blanc');
    assert.match(src, new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '::placeholder\\{color:#64748b!important'), 'texte indicatif gris foncé lisible');
  });
}
