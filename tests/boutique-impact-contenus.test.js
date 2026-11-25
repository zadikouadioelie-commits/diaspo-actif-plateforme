/* ===========================================================
   tests/boutique-impact-contenus.test.js — « Mon impact » dans Paramètres Boutique (2026-11-25, étape 2)
   Le propriétaire d'une boutique « Projet à impact » gère ses chiffres clés, ses réalisations et son équipe dans les Paramètres, plus dans l'ancienne vue du profil.
   Lancer : node --test tests/boutique-impact-contenus.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const dash = lire('dashboard-initiative.html');
const mod = lire('assets/boutique-impact-contenus.js');
const barre = lire('assets/boutique-barre-proprio.js');
const css = lire('assets/boutique-produits.css');
const page = lire('assets/boutique-impact.js');
const serveur = lire('server/index.js');

test('IM1 le tableau de bord porte la carte « Mon impact », son script et le montage', () => {
  assert.match(dash, /id="pv-impact"/);
  assert.match(dash, /id="pv-impact-mount"/);
  assert.match(dash, /<h3[^>]*>Mon impact<\/h3>/);
  assert.match(dash, /<script src="assets\/boutique-impact-contenus\.js\?v=1"><\/script>/);
  assert.match(dash, /if \(window\.PvImpact\) PvImpact\.monter\(init\);/);
});

test('IM2 la carte ne s\'affiche que pour le type « Projet à impact » (impact ou projet)', () => {
  assert.match(mod, /\(type !== 'impact' && type !== 'projet'\)\) \{ carte\.style\.display = 'none'; return; \}/);
  assert.match(mod, /\/\[#&\]impact\(&\|\$\)\/\.test\(location\.hash\)/);
});

test('IM3 trois rubriques, mêmes champs de données que la page boutique-impact.html', () => {
  assert.match(mod, /champ: 'vitrine_resultats_impact_json'/);
  assert.match(mod, /champ: 'realisations_json'/);
  assert.match(mod, /champ: 'vitrine_equipe_json'/);
  ['vitrine_resultats_impact_json', 'realisations_json', 'vitrine_equipe_json'].forEach((c) => assert.ok(page.includes(c) || page.includes(c.replace('_json', '')), 'la page publique ne lit pas ' + c));
  assert.match(page, /r\.valeur/);
  assert.match(page, /m\.nom/);
});

test('IM4 aucune route nouvelle : seulement PUT /initiatives/:id/vitrine, qui existe déjà et accepte ces trois champs', () => {
  const appels = (mod.match(/api\('[A-Z]+', '[^']*'/g) || []);
  assert.deepEqual([...new Set(appels)], ["api('PUT', '/initiatives/'"]);
  assert.match(serveur, /route\("PUT", "\/api\/initiatives\/:id\/vitrine"/);
  const m = serveur.match(/const VITRINE_CHAMPS_BROUILLON = \[[\s\S]*?\];/)[0];
  ['vitrine_resultats_impact_json', 'vitrine_equipe_json', 'realisations_json'].forEach((c) => assert.ok(m.includes('"' + c + '"'), c + ' absent de la liste des champs de vitrine'));
});

test('IM5 la liste entière est réécrite, comme l\'ancien éditeur ; rien d\'autre n\'est écrit', () => {
  assert.match(mod, /corps\[s\.champ\] = tableau;/);
  assert.match(mod, /api\('PUT', '\/initiatives\/' \+ S\.initId \+ '\/vitrine', corps\)/);
  assert.ok(!/api\('(POST|DELETE|PATCH)'/.test(mod), 'écriture hors liste interdite');
});

test('IM6 le chiffre exige une valeur, la réalisation un titre, le membre un nom ; un lien doit commencer par http(s)', () => {
  assert.match(mod, /La valeur du chiffre est obligatoire/);
  assert.match(mod, /Le titre du projet est obligatoire/);
  assert.match(mod, /Le nom du membre est obligatoire/);
  assert.match(mod, /function lienOk\(u\) \{ return \/\^https\?:\\\/\\\/\\S\+\$\/i\.test\(u\); \}/);
  assert.match(mod, /doit commencer par http:\/\/ ou https:\/\//);
});

test('IM7 la photo d\'un membre est rangée dans « photo », l\'image d\'une réalisation dans « image » (comme la page publique)', () => {
  assert.match(mod, /imageCle: 'photo'/);
  assert.match(mod, /o\[s\.imageCle \|\| 'image'\] = S\.image \|\| '';/);
  assert.match(page, /x\.photo/);
  assert.match(page, /r\.image/);
});

test('IM8 les champs inconnus d\'une fiche déjà enregistrée sont conservés à la modification (rattache_a, etc.)', () => {
  assert.match(mod, /tab\[S\.index\] = Object\.assign\(\{\}, tab\[S\.index\], lu\.valeur\);/);
});

test('IM9 les projets à soutenir restent dans « Cagnottes et dons » : un bouton y mène', () => {
  assert.match(mod, /data-a="cagnottes"/);
  assert.match(mod, /window\.initShowSection\('cagnottes'\)/);
  assert.match(dash, /data-section="cagnottes"/);
});

test('IM10 un contenu est échappé partout et une image n\'est acceptée que si elle commence par http(s) ou /', () => {
  assert.match(mod, /function esc\(s\)/);
  assert.match(mod, /function imageSure\(u\) \{[^}]*\^\(https\?:\\\/\\\/\|\\\/\)/);
  assert.ok(!/innerHTML\s*=\s*[^;]*\+\s*it\.(titre|nom|valeur)\b/.test(mod), 'contenu injecté sans échappement');
  assert.match(mod, /esc\(nom\)/);
});

test('IM11 une rubrique éteinte est signalée au propriétaire, sans rien supprimer', () => {
  assert.match(mod, /window\.BoutiqueRubriques\.active\(S\.etat, s\.rubrique\)/);
  assert.match(mod, /est éteinte dans votre boutique/);
  ['resultats_impact', 'realisations', 'equipe'].forEach((r) => assert.ok(mod.includes("rubrique: '" + r + "'")));
  assert.match(page, /rubrique\('resultats_impact'\)/);
  assert.match(page, /rubrique\('equipe'\)/);
});

test('IM12 la suppression demande confirmation ; l\'ordre se change par flèches', () => {
  assert.match(mod, /window\.confirm\('Supprimer « '/);
  assert.match(mod, /data-a="haut"/);
  assert.match(mod, /data-a="bas"/);
  assert.match(mod, /function deplacer\(i, sens\)/);
});

test('IM13 limites : 12 chiffres, 100 réalisations, 50 membres ; le bouton Ajouter se bloque à la limite', () => {
  assert.match(mod, /cle: 'resultats'[^\n]*max: 12/);
  assert.match(mod, /cle: 'realisations'[^\n]*max: 100/);
  assert.match(mod, /cle: 'equipe'[^\n]*max: 50/);
  assert.match(mod, /n >= s\.max \|\| S\.occupe \? ' disabled' : ''/);
});

test('IM14 la barre du propriétaire mène à « Mon impact » ; les types sans rubrique gardent leur lien en attendant', () => {
  assert.match(barre, /page === 'boutique-impact\.html' \? 'Mon impact'/);
  assert.match(barre, /page === 'boutique-impact\.html' \? 'dashboard-initiative\.html#parametres-vitrine&impact'/);
  assert.match(barre, /vitrine=1&edition=1/, 'les types sans rubrique gardent leur lien en attendant');
});

test('IM15 la carte partage le style de « Mes produits » sans le casser', () => {
  assert.match(css, /:is\(#pv-produits,#pv-portfolio,#pv-evenements,#pv-impact(,#pv-finance)?\) \.pvp-ligne/);
  assert.ok(!/^#pv-produits /m.test(css), 'sélecteur restant propre à « Mes produits » seulement');
  assert.match(mod, /document\.querySelector\('#pv-impact \.pvp-photo'\)/);
});

test('IM16 « Rattaché(e) à » propose les noms des autres membres ; les catégories sont réutilisées d\'une réalisation à l\'autre', () => {
  assert.match(mod, /listeDe: 'nom'/);
  assert.match(mod, /listeDe: 'categorie'/);
  assert.match(mod, /!\(s\.cle === 'equipe' && S\.index === i\)/);
});
