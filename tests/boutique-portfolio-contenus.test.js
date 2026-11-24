/* ===========================================================
   tests/boutique-portfolio-contenus.test.js — « Mon portfolio » dans Paramètres Boutique (2026-11-24, étape 2)
   Le propriétaire d'une boutique Portfolio gère ses créations, réalisations et vidéos dans les Paramètres, plus dans l'ancienne vue du profil.
   Lancer : node --test tests/boutique-portfolio-contenus.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const dash = lire('dashboard-initiative.html');
const mod = lire('assets/boutique-portfolio-contenus.js');
const barre = lire('assets/boutique-barre-proprio.js');
const css = lire('assets/boutique-produits.css');
const page = lire('assets/boutique-portfolio.js');

test('PF1 le tableau de bord porte la carte « Mon portfolio », ses deux scripts et le montage', () => {
  assert.match(dash, /id="pv-portfolio"/);
  assert.match(dash, /id="pv-portfolio-mount"/);
  assert.match(dash, /<h3[^>]*>Mon portfolio<\/h3>/);
  assert.match(dash, /<script src="assets\/boutique-portfolio-contenus\.js\?v=1"><\/script>/);
  assert.match(dash, /<script src="assets\/boutique-rubriques\.js\?v=1"><\/script>/);
  assert.match(dash, /if \(window\.PvPortfolio\) PvPortfolio\.monter\(init\);/);
});

test('PF2 la carte ne s\'affiche que pour le type portfolio', () => {
  assert.match(mod, /type !== 'portfolio'\)\s*\{\s*carte\.style\.display = 'none'; return;/);
  assert.match(mod, /\/\[#&\]portfolio\(&\|\$\)\/\.test\(location\.hash\)/);
});

test('PF3 les trois rubriques écrivent dans les MÊMES champs que la page portfolio.html (aucune donnée nouvelle)', () => {
  ['vitrine_portfolio_json', 'realisations_json', 'vitrine_videos_json'].forEach((c) => {
    assert.ok(mod.includes("champ: '" + c + "'"), 'champ absent du module : ' + c);
    assert.ok(page.includes('etat.init.' + c), 'la page ne lit pas ' + c);
  });
  assert.match(mod, /api\('PUT', '\/initiatives\/' \+ S\.initId \+ '\/vitrine', corps\)/);
  const serveur = lire('server/index.js');
  ['vitrine_portfolio_json', 'realisations_json', 'vitrine_videos_json'].forEach((c) => assert.ok(serveur.includes(c), 'le serveur ne connaît pas ' + c));
});

test('PF4 aucune route nouvelle : uniquement PUT /vitrine', () => {
  const appels = mod.match(/api\('[A-Z]+', '[^']*'/g) || [];
  assert.deepEqual([...new Set(appels)], ["api('PUT', '/initiatives/'"]);
});

test('PF5 les créations exigent une photo ; les réalisations un titre ; les vidéos un lien http(s)', () => {
  assert.match(mod, /image: 'requise'/);
  assert.match(mod, /Ajoutez une photo\./);
  assert.match(mod, /Le titre du projet est obligatoire\./);
  assert.match(mod, /Le lien de la vidéo est obligatoire\./);
  assert.match(mod, /\/\^https\?:\\\/\\\/\\S\+\$\/i\.test\(u\)/);
  assert.match(mod, /doit commencer par http:\/\/ ou https:\/\//);
});

test('PF6 la catégorie des créations forme les filtres : champ avec suggestions des catégories déjà saisies', () => {
  assert.match(mod, /k: 'categorie', lib: 'Catégorie', max: 40[^}]*liste: true/);
  assert.match(mod, /<datalist id="pvpf-cats">/);
  assert.match(page, /categoriesDe\(/);
});

test('PF7 plusieurs photos d\'un coup : envoi une à une, une seule sauvegarde, les échecs sont nommés', () => {
  assert.match(mod, /id="pvpf-fichiers"[^>]*multiple/);
  assert.match(mod, /Envoi de la photo ' \+ \(k \+ 1\) \+ ' sur '/);
  assert.match(mod, /Non envoyées : /);
  assert.match(mod, /compressImageFile\(fichier, 1600, 1600, 0\.85\)/);
  assert.match(mod, /uploadMedia\(c, 'produit'\)/);
});

test('PF8 une modification garde les clés inconnues de l\'élément et normalise l\'ancienne forme { url }', () => {
  assert.match(mod, /Object\.assign\(orig, lu\.valeur\)/);
  assert.match(mod, /if \(s\.cle === 'creations'\) delete orig\.url;/);
  assert.match(mod, /function imageDe\(it\) \{ return texte\(it\.image \|\| it\.url\); \}/);
});

test('PF9 un contenu est échappé partout (jamais d\'injection par un titre ou un lien)', () => {
  assert.match(mod, /function esc\(s\)/);
  assert.match(mod, /esc\(nom\)/);
  assert.match(mod, /esc\(titreDe\(it, s\)\)/);
  assert.ok(!/innerHTML\s*=\s*[^;]*\+\s*(it|c)\.titre\b/.test(mod), 'titre injecté sans échappement');
});

test('PF10 une rubrique éteinte est signalée au propriétaire, sans rien supprimer', () => {
  assert.match(mod, /window\.BoutiqueRubriques\.active\(S\.etat, s\.rubrique\)/);
  assert.match(mod, /est éteinte dans votre boutique/);
  [['portfolio', 'creations'], ['realisations', 'realisations'], ['galerie_videos', 'videos']].forEach(([rub]) => assert.ok(mod.includes("rubrique: '" + rub + "'")));
});

test('PF11 la barre du propriétaire mène à « Mon portfolio » ; les autres types gardent leur lien', () => {
  assert.match(barre, /page === 'portfolio\.html' \? 'Mon portfolio'/);
  assert.match(barre, /page === 'portfolio\.html' \? 'dashboard-initiative\.html#parametres-vitrine&portfolio'/);
  assert.match(barre, /vitrine=1&edition=1/, 'les types sans rubrique gardent leur lien en attendant');
});

test('PF12 la carte partage le style de « Mes produits » sans le casser', () => {
  assert.match(css, /:is\(#pv-produits,#pv-portfolio\) \.pvp-ligne/);
  assert.match(css, /html body\.nd :is\(#pv-produits,#pv-portfolio\) :is\(input\[type=text\]/);
  assert.ok(!/^#pv-produits /m.test(css), 'sélecteur restant propre à « Mes produits » seulement');
});
