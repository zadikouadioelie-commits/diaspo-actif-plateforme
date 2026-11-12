/* Tests — nuancier de la boutique : palettes, textures, dégradés et diagrammes (2026-11-12).
   Lancer : node --test tests/boutique-nuancier.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..');
const C = require('../assets/boutique-couleurs.js');
const Registre = require('../assets/boutique-types.js');

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{FE0F}]/u;

test('N1 le registre propose beaucoup de textures, rangées par famille, dont des dégradés', () => {
  const t = Registre.TEXTURES;
  assert.ok(t.length >= 30, 'au moins 30 textures au total');
  assert.equal(new Set(t.map((x) => x.id)).size, t.length, 'identifiants uniques');
  t.forEach((x) => assert.ok(x.groupe && x.label, 'famille et nom pour ' + x.id));
  const familles = new Set(t.map((x) => x.groupe));
  ['Dégradés', 'Métal et brillance', 'Motifs', 'Matières'].forEach((f) => assert.ok(familles.has(f), 'famille ' + f));
  assert.ok(t.filter((x) => x.groupe === 'Dégradés').length >= 8, 'au moins 8 dégradés');
  assert.deepEqual(t.slice(0, 6).map((x) => x.id), ['uni', 'dore', 'brillant', 'scintillant', 'luisant', 'satine'], 'les six textures d\'origine gardent leur place');
});

test('N1 chaque texture est une superposition translucide : elle laisse voir la couleur', () => {
  Registre.TEXTURES.filter((x) => x.bg).forEach((x) => {
    assert.ok(/rgba\(|transparent/.test(x.bg), x.id + ' doit être translucide');
    assert.ok(!/#[0-9a-f]{3,6}\b/i.test(x.bg.replace(/#fff\b|#ffe9a6\b/gi, '')), x.id + ' ne doit pas masquer la couleur par un aplat opaque');
  });
});

test('N1 les textures sont écrites sans émoticône et les sens de dégradés sont des mots-clés', () => {
  Registre.TEXTURES.forEach((x) => {
    assert.ok(!EMOJI.test(x.label), x.id);
    if (x.sens) assert.match(x.sens, /^[a-z-]+$/, x.id);
  });
});

test('N1 chaque texture est acceptée par la validation du style', () => {
  Registre.TEXTURES.forEach((x) => {
    const r = C.fusionnerStyle({}, { couleurs: ['#83172f', '#111c38'], textures: [x.id, 'uni'] });
    assert.equal(r.erreur, undefined, x.id);
    assert.equal(r.style.textures[0], x.id);
  });
  assert.ok(C.fusionnerStyle({}, { couleurs: ['#83172f'], textures: ['inconnue'] }).erreur, 'une texture inconnue est refusée');
});

test('N2 les palettes : 29, en 6 familles, les six d\'origine en tête, couleurs principales lisibles sous du texte blanc', () => {
  assert.equal(C.PALETTES.length, 29);
  assert.deepEqual(C.PALETTES.slice(0, 6).map((p) => p.nom), ['Bordeaux & Or', 'Émeraude', 'Prestige violet', 'Océan', 'Terre & Sable', 'Noir & Or']);
  assert.deepEqual(C.GROUPES_PALETTES, ['Élégance', 'Nature', 'Chaudes', 'Fraîches', 'Vives', 'Douces']);
  C.PALETTES.forEach((p) => {
    assert.ok(C.GROUPES_PALETTES.includes(p.groupe), p.nom);
    assert.equal(p.c.length, 3, p.nom);
    p.c.forEach((h) => assert.ok(C.hexValide(h), p.nom + ' ' + h));
    assert.ok(C.contraste('#ffffff', p.c[0]) >= 4.5, 'couleur principale de « ' + p.nom + ' » trop claire pour du texte blanc');
    assert.ok(!EMOJI.test(p.nom), p.nom);
  });
  assert.equal(new Set(C.PALETTES.map((p) => p.nom)).size, 29, 'noms uniques');
  C.PALETTES.forEach((p) => assert.equal(C.fusionnerStyle({}, { couleurs: p.c }).erreur, undefined, p.nom));
});

/* ── Les diagrammes (module navigateur, chargé dans un contexte sans page) ── */
function chargerDiagrammes() {
  const ctx = vm.createContext({});
  ctx.self = ctx;
  ['assets/boutique-types.js', 'assets/boutique-couleurs.js', 'assets/boutique-diagrammes.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(RACINE, f), 'utf8'), ctx, { filename: f });
  });
  return ctx.BOUTIQUE_DIAGRAMMES;
}

test('N3 diagramme des nuances : 11 tons cliquables, courbe de clarté, un ton repéré', () => {
  const D = chargerDiagrammes();
  const h = D.nuances('#83172f', 1);
  assert.equal((h.match(/data-ton="1:#[0-9a-f]{6}"/g) || []).length, 11);
  assert.match(h, /<svg[^>]*class="bdg-courbe"/);
  assert.equal((h.match(/class="bdg-ton on"/g) || []).length, 1, 'un seul ton courant');
  assert.ok(!EMOJI.test(h));
  const tons = D.echelle('#83172f');
  assert.ok(tons[0].l > tons[10].l, 'du plus clair au plus foncé');
});

test('N3 diagramme des harmonies : roue, quatre accords, tons et jeux complets cliquables', () => {
  const D = chargerDiagrammes();
  const h = D.harmonies('#1f6b55', 0);
  assert.equal(D.HARMONIES.length, 4);
  assert.equal((h.match(/class="bdg-carte"/g) || []).length, 4);
  assert.equal((h.match(/data-harm-jeu="/g) || []).length, 4);
  assert.ok((h.match(/data-harm="0:#[0-9a-f]{6}"/g) || []).length >= 6);
  assert.match(h, /<svg viewBox="0 0 80 80"/);
  /* le complémentaire est bien à l'opposé de la teinte */
  const hsl = C.hexToHsl('#1f6b55'), compl = C.hexToHsl(h.match(/data-harm="0:(#[0-9a-f]{6})"/)[1]);
  const ecart = (((compl[0] - hsl[0]) % 360) + 360) % 360;
  assert.ok(Math.abs(ecart - 180) < 4, 'complémentaire à 180° (écart mesuré : ' + Math.round(ecart) + '°)');
  assert.ok(!EMOJI.test(h));
});

test('N3 textures et dégradés : une pastille par texture, rangées par famille, texture courante marquée', () => {
  const D = chargerDiagrammes();
  const h = D.textures('#83172f', 2, 'deg-aube');
  assert.equal((h.match(/class="bdg-pastille( on)?"/g) || []).length, Registre.TEXTURES.length);
  assert.equal((h.match(/class="bdg-pastille on"/g) || []).length, 1);
  assert.match(h, /data-texbtn="2:deg-aube"/);
  ['Dégradés', 'Métal et brillance', 'Motifs', 'Matières'].forEach((f) => assert.ok(h.includes(f), f));
  assert.ok(h.indexOf('Dégradés') < h.indexOf('Motifs'), 'les dégradés viennent avant les motifs');
  assert.ok(!EMOJI.test(h));
});

test('N4 la page de simulation utilise les modules partagés et ne recopie plus ni palettes ni textures', () => {
  const page = fs.readFileSync(path.join(RACINE, 'exemples-boutiques', 'parametres-vitrine.html'), 'utf8');
  assert.match(page, /boutique-couleurs\.js/);
  assert.match(page, /boutique-diagrammes\.js/);
  assert.match(page, /COUL\.PALETTES/);
  assert.ok(!/name: "Bordeaux & Or"/.test(page), 'plus de liste de palettes recopiée dans la page');
  assert.match(page, /data-ton|data-harm/);
});
