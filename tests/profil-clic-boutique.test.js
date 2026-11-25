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
  assert.match(html, /function versPageBoutiqueDediee\(\)/);
  const f = html.slice(html.indexOf('let _vitrineDedieePromesse'), html.indexOf('function initVitrineSwitch'));
  ['boutique.html', 'portfolio.html', 'boutique-video.html', 'boutique-evenements.html', 'boutique-impact.html', 'boutique-finance.html']
    .forEach((p) => assert.ok(f.includes(p), p + ' absent'));
  ['paiement', 'preview'].forEach((x) => assert.ok(f.includes("q.get('" + x + "')"), 'exclusion manquante : ' + x));
  assert.ok(!f.includes("q.get('edition')"), "?edition=1 ne doit plus ramener à l'ancienne vue");
});

test('P2 l\'ouverture par #vitrine ET le clic sur l\'onglet appellent cette fonction', () => {
  assert.match(html, /startsWith\('#vitrine'\)\) && \(await versPageBoutiqueDediee\(\)\) === true\) return;/);
  const sw = html.slice(html.indexOf('function switchProfileView'), html.indexOf('COLONNES LATÉRALES ADAPTÉES'));
  assert.match(sw, /versPageBoutiqueDediee\(\)/, 'le clic sur l\'onglet ne vérifie pas la page dédiée');
});

test('P3 (2026-11-15) tout lien #vitrine… (ex. #vitrine&pub=12) mène à la nouvelle page, et un type vide vaut « boutique de vente »', () => {
  assert.ok(!/location\.hash === '#vitrine'/.test(html), 'comparaison stricte au hash restante : #vitrine&pub=… échapperait à la redirection');
  const f = html.slice(html.indexOf('async function _verifierPageBoutiqueDediee'), html.indexOf('function initVitrineSwitch'));
  assert.match(f, /ib\.vitrine_active \? 'ecom' : ''/, 'une boutique ouverte sans type doit mener à boutique.html, une boutique pas encore ouverte garde sa mise en route');
  assert.match(f, /essai < 2/, 'une panne passagère doit être retentée avant le repli');
});

test('P4 (2026-11-15) la vieille vue n est dessinée qu après la vérification : jamais visible quand la nouvelle page existe', () => {
  const sw = html.slice(html.indexOf('function switchProfileView'), html.indexOf('COLONNES LATÉRALES ADAPTÉES'));
  assert.match(sw, /versPageBoutiqueDediee\(\)\.then\(\(parti\) => \{\s*if \(parti === true\) return;/);
  assert.ok(sw.indexOf('versPageBoutiqueDediee()') < sw.indexOf('renderVitrine();'), 'renderVitrine() est appelé avant la vérification');
});

test('P5 (2026-11-15) les anciens types « evenement » et « projet » mènent aussi aux nouvelles pages', () => {
  const f = html.slice(html.indexOf('async function _verifierPageBoutiqueDediee'), html.indexOf('function initVitrineSwitch'));
  assert.match(f, /evenement: 'boutique-evenements\.html'/);
  assert.match(f, /projet: 'boutique-impact\.html'/);
});

test("P6 (2026-11-21) une vérification en panne affiche un message avec « Réessayer », jamais l'ancienne vue", () => {
  const f = html.slice(html.indexOf('async function _verifierPageBoutiqueDediee'), html.indexOf('function initVitrineSwitch'));
  assert.match(f, /return 'erreur';/, 'après deux échecs la fonction doit renvoyer « erreur », pas false');
  assert.match(f, /function afficherErreurBoutique\(zone\)/);
  assert.match(f, /Réessayer/);
  assert.match(f, /_vitrineDedieePromesse = null;/, 'le bouton doit relancer la vérification');
  const sw = html.slice(html.indexOf('function switchProfileView'), html.indexOf('COLONNES LATÉRALES ADAPTÉES'));
  assert.match(sw, /parti === 'erreur'\) \{ afficherErreurBoutique\(vitrine\); return; \}/);
  assert.ok(sw.indexOf("parti === 'erreur'") < sw.indexOf('renderVitrine();'), "renderVitrine() ne doit pas passer avant le message d'erreur");
});
