/* ===========================================================
   tests/profil-clic-boutique.test.js — le clic sur l'onglet « Boutique » du profil mène à la nouvelle page (2026-11-14)
   Avant : seule l'ouverture directe de profil.html?id=…#vitrine redirigeait ; le clic basculait sur place vers l'ancienne vue.
   Lancer : node --test tests/profil-clic-boutique.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'profil-app.html'), 'utf8');

test('P1 une seule fonction décide de la page dédiée, avec les 6 types et les exclusions', () => {
  assert.match(html, /async function versPageBoutiqueDediee\(\)/);
  const f = html.slice(html.indexOf('async function versPageBoutiqueDediee'), html.indexOf('function initVitrineSwitch'));
  ['boutique.html', 'portfolio.html', 'boutique-video.html', 'boutique-evenements.html', 'boutique-impact.html', 'boutique-finance.html']
    .forEach((p) => assert.ok(f.includes(p), p + ' absent'));
  ['edition', 'paiement', 'preview'].forEach((x) => assert.ok(f.includes("q.get('" + x + "')"), 'exclusion manquante : ' + x));
});

test('P2 l\'ouverture par #vitrine ET le clic sur l\'onglet appellent cette fonction', () => {
  assert.match(html, /location\.hash === '#vitrine'\) && await versPageBoutiqueDediee\(\)\) return;/);
  const sw = html.slice(html.indexOf('function switchProfileView'), html.indexOf('COLONNES LATÉRALES ADAPTÉES'));
  assert.match(sw, /versPageBoutiqueDediee\(\)/, 'le clic sur l\'onglet ne vérifie pas la page dédiée');
});
