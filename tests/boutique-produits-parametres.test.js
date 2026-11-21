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
  assert.match(mod, /\[#&\]produits/);
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

test('PP6 seule la boutique de vente voit la rubrique ; un autre type la masque', () => {
  assert.match(mod, /TYPES_VENTE = \['ecom', 'commercial', ''\]/);
  assert.match(mod, /TYPES_VENTE\.indexOf\(type\) < 0\) \{ carte\.style\.display = 'none'/);
});

test('PP7 les champs du formulaire actuel sont tous là', () => {
  ['pvp-nom', 'pvp-desc', 'pvp-cat', 'pvp-categorie', 'pvp-ref', 'pvp-prix', 'pvp-promo', 'pvp-statut', 'pvp-retour', 'pvp-retrait', 'pvp-exp', 'pvp-frais', 'pvp-devis']
    .forEach((id) => assert.ok(mod.includes('id="' + id + '"'), 'champ absent : ' + id));
  ['catalogue_id', 'photos', 'devis_active', 'livraison_retrait', 'livraison_expedition', 'frais_expedition', 'date_retour', 'prix_promo']
    .forEach((k) => assert.ok(mod.includes(k + ':'), 'donnée non envoyée : ' + k));
});

test('PP8 le nom est obligatoire, le prix promo doit être inférieur au prix, la suppression demande confirmation', () => {
  assert.match(mod, /Le nom du produit est obligatoire/);
  assert.match(mod, /Le prix promo doit être inférieur au prix normal/);
  assert.match(mod, /confirm\('Supprimer « '/);
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
