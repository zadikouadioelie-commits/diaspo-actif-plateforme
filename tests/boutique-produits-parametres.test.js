/* ===========================================================
   tests/boutique-produits-parametres.test.js — « Mes produits » dans Paramètres Boutique (2026-11-21, étape 2)
   Le propriétaire d'une boutique de vente gère ses produits dans les Paramètres, plus dans l'ancienne vue du profil.
   Lancer : node --test tests/boutique-produits-parametres.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const dash = lire('dashboard-initiative.html');
const mod = lire('assets/boutique-produits.js');
const barre = lire('assets/boutique-barre-proprio.js');

test('PP1 le tableau de bord porte la carte « Mes produits », le script, la feuille de style et le montage', () => {
  assert.match(dash, /id="pv-produits"/);
  assert.match(dash, /id="pv-produits-mount"/);
  assert.match(dash, /assets\/boutique-produits\.js/);
  assert.match(dash, /assets\/boutique-produits\.css/);
  assert.match(dash, /if \(window\.PvProduits\) PvProduits\.monter\(init\);/);
});

test('PP2 le lien #parametres-vitrine&produits ouvre bien la section (le hash est coupé au « & »)', () => {
  assert.match(dash, /\.replace\('#',''\)\.split\('&'\)\[0\]/);
  assert.match(mod, /\[#&\]\(produits\|videos\)\(&\|\$\)/);
});

test('PP3 « Mes produits » de la boutique de vente mène aux Paramètres ; les autres types gardent leur lien', () => {
  assert.match(barre, /page === 'boutique\.html' \? 'dashboard-initiative\.html#parametres-vitrine&produits'/);
  assert.match(barre, /vitrine=1&edition=1/, 'les autres types (vidéos, contenus) gardent leur lien en attendant leur rubrique');
});

test('PP4 le module réutilise les routes existantes, sans route ni donnée nouvelle', () => {
  ['/produits', '/catalogues', "'/produits/' + id + '/mise-en-avant'", '/produits/reorder', "api('DELETE', '/produits/'", "api('PUT', '/produits/'"]
    .forEach((x) => assert.ok(mod.includes(x), 'appel absent : ' + x));
});

test('PP5 les limites du serveur sont reprises (100 produits, 10 par catalogue, 4 photos, 3 vedettes)', () => {
  assert.match(mod, /MAX_PRODUITS = 100/);
  assert.match(mod, /MAX_PAR_CATALOGUE = 10/);
  assert.match(mod, /\[null, null, null, null\]/);
  assert.match(mod, /3 produits « mis en avant » au maximum/);
});

test('PP6 seules les boutiques de vente et vidéo voient la rubrique ; un autre type la masque', () => {
  assert.match(mod, /TYPES_VENTE = \['ecom', 'commercial', ''\]/);
  assert.match(mod, /TYPES_VIDEO = \['video'\]/);
  assert.match(mod, /\(!vente && !video\)\) \{ carte\.style\.display = 'none'/);
});

test('PP7 les champs du formulaire actuel sont tous là', () => {
  ['pvp-nom', 'pvp-desc', 'pvp-cat', 'pvp-categorie', 'pvp-ref', 'pvp-prix', 'pvp-promo', 'pvp-statut', 'pvp-retour', 'pvp-retrait', 'pvp-exp', 'pvp-frais', 'pvp-devis']
    .forEach((id) => assert.ok(mod.includes('id="' + id + '"'), 'champ absent : ' + id));
  ['catalogue_id', 'photos', 'devis_active', 'date_retour', 'prix_promo']
    .forEach((k) => assert.ok(mod.includes(k + ':'), 'donnée non envoyée : ' + k));
  ['livraison_retrait', 'livraison_expedition', 'frais_expedition']
    .forEach((k) => assert.ok(mod.includes('d.' + k + ' ='), 'donnée non envoyée : ' + k));
});

test('PP8 le nom est obligatoire, le prix promo doit être inférieur au prix, la suppression demande confirmation', () => {
  assert.match(mod, /Le nom du produit est obligatoire/);
  assert.match(mod, /supprConfirm: function \(n\) \{ return 'Supprimer « ' \+ n/);
  assert.match(mod, /confirm\(W\(\)\.supprConfirm\(p\.nom\)\)/);
  assert.match(mod, /Le prix promo doit être inférieur au prix normal/);
});

test('PP9 aucun paiement réel : le module ne touche ni commande ni paiement', () => {
  assert.ok(!/\/commander|\/paiement|stripe|checkout/i.test(mod.replace(/Les paiements restent en simulation[^']*/g, '')), 'le module ne doit appeler aucun paiement');
  assert.match(mod, /paiements restent en simulation/);
});

test('PP10 accessibilité : flèches de tri nommées, étoile « pressée », erreurs annoncées', () => {
  assert.match(mod, /aria-label="Monter « '/);
  assert.match(mod, /aria-label="Descendre « '/);
  assert.match(mod, /aria-pressed="' \+ \(vedette/);
  assert.match(mod, /role="alert"/);
  assert.match(mod, /role="status"/);
});

test('PP11 tout texte venant des données passe par esc() (pas de HTML injecté)', () => {
  assert.match(mod, /function esc\(s\)/);
  assert.ok(!/innerHTML = [^;]*p\.nom(?!\))/.test(mod.replace(/esc\(p\.nom\)/g, '')), 'p.nom injecté sans esc()');
});

/* ===== « Mes vidéos » (boutique vidéo) — 2026-11-24 ===== */
test('PV1 la boutique vidéo a sa rubrique : titre « Mes vidéos », lien direct #parametres-vitrine&videos', () => {
  assert.match(mod, /var vente = TYPES_VENTE\.indexOf\(type\) >= 0, video = TYPES_VIDEO\.indexOf\(type\) >= 0;/);
  assert.match(mod, /t\.textContent = video \? 'Mes vidéos' : 'Mes produits'/);
  assert.match(dash, /id="pv-produits-titre"/);
  assert.match(dash, /id="pv-produits-intro"/);
  assert.match(barre, /page === 'boutique-video\.html' \? 'dashboard-initiative\.html#parametres-vitrine&videos'/);
  assert.match(barre, /vitrine=1&edition=1/, 'les autres types gardent leur lien en attendant leur rubrique');
});

test('PV2 une vidéo est un produit : mêmes routes, avec video_url, video_duree (1 à 57 s) et video_type', () => {
  ['video_url', 'video_duree', 'video_type'].forEach((k) => assert.ok(mod.includes('d.' + k + ' ='), 'donnée non envoyée : ' + k));
  assert.match(mod, /var DUREE_MAX = 57;/);
  ['pvp-vurl', 'pvp-vduree', 'pvp-vtype'].forEach((id) => assert.ok(mod.includes('id="' + id + '"'), 'champ absent : ' + id));
  const serveur = lire('server/index.js');
  assert.match(serveur, /const DUREE_VIDEO_BOUTIQUE_MAX_S = 57;/, 'la limite du module doit suivre celle du serveur');
  assert.ok(!/api\('(GET|POST|PUT|DELETE|PATCH)', '\/videos/.test(mod), 'aucune route vidéo nouvelle');
});

test('PV3 l\'adresse (http/https) et la durée entière de 1 à 57 s sont obligatoires pour une vidéo', () => {
  assert.ok(mod.includes('^https?:') && mod.includes('.test(d.video_url)'), 'adresse http(s) exigée');
  assert.match(mod, /d\.video_duree >= 1 && d\.video_duree <= DUREE_MAX/);
  assert.match(mod, /Le titre de la vidéo est obligatoire/);
});

test('PV4 une vidéo ne se livre pas : pas de champs de livraison, réglages existants conservés ; sans prix = 0', () => {
  assert.match(mod, /\(enVideo\(\) \? '' :\r?\n/);
  assert.match(mod, /if \(d\.prix == null\) d\.prix = 0;/);
  assert.match(mod, /Demande de devis/);
});

test('PV5 les mots suivent le genre : « une vidéo », « masquée », « supprimée », « mises en avant »', () => {
  assert.match(mod, /＋ Ajouter une vidéo/);
  assert.match(mod, /est masquée : les visiteurs ne la voient plus/);
  assert.match(mod, /Vidéo supprimée\./);
  assert.match(mod, /3 vidéos « mises en avant » au maximum/);
  assert.match(mod, /Aucune vidéo ne correspond/);
});

test('PV6 la liste montre la durée et le type de chaque vidéo ; une vidéo sans prix est « Gratuite »', () => {
  assert.match(mod, /pvp-pastille pvp-duree/);
  assert.match(mod, /'Gratuite'/);
  const css = lire('assets/boutique-produits.css');
  assert.match(css, /:is\(#pv-produits,#pv-portfolio(,#pv-evenements)?\) \.pvp-duree/);
});

test('PV7 la boutique de vente garde exactement ses textes et ses champs de livraison', () => {
  assert.match(mod, /＋ Ajouter un produit/);
  assert.match(mod, /Votre boutique n\\'a pas encore de produit/);
  assert.match(mod, /id="pvp-retrait"/);
  assert.match(mod, /id="pvp-frais"/);
});
