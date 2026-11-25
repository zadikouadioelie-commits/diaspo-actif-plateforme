/* ===========================================================
   tests/boutique-finance-contenus.test.js — « Mon organisme » dans Paramètres Boutique (2026-11-25, étape 2)
   Le propriétaire d'une boutique « Organisme de financement » gère programmes, projets accompagnés, résultats, rendez-vous, documents,
   témoignages, agréments et équipe dans les Paramètres, plus dans l'ancienne vue du profil.
   Lancer : node --test tests/boutique-finance-contenus.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const dash = lire('dashboard-initiative.html');
const mod = lire('assets/boutique-finance-contenus.js');
const barre = lire('assets/boutique-barre-proprio.js');
const css = lire('assets/boutique-produits.css');
const page = lire('assets/boutique-finance.js');
const serveur = lire('server/index.js');

test('FI1 le tableau de bord porte la carte « Mon organisme », son script et le montage', () => {
  assert.match(dash, /id="pv-finance"/);
  assert.match(dash, /id="pv-finance-mount"/);
  assert.match(dash, /<h3[^>]*>Mon organisme<\/h3>/);
  assert.match(dash, /<script src="assets\/boutique-finance-contenus\.js\?v=1"><\/script>/);
  assert.match(dash, /if \(window\.PvFinance\) PvFinance\.monter\(init\);/);
});

test('FI2 la carte ne s\'affiche que pour le type « Organisme de financement »', () => {
  assert.match(mod, /type !== 'finance'\) \{ carte\.style\.display = 'none'; return; \}/);
  assert.match(mod, /\/\[#&\]finance\(&\|\$\)\/\.test\(location\.hash\)/);
});

test('FI3 huit rubriques, sur les mêmes données que la page boutique-finance.html', () => {
  const champs = { programmes: 'vitrine_services', projets: 'realisations_json', resultats: 'vitrine_resultats_impact_json', rendezvous: 'vitrine_reservation_json',
    documents: 'vitrine_documents_json', temoignages: 'vitrine_temoignages_json', agrements: 'vitrine_certifications_json', equipe: 'vitrine_equipe_json' };
  Object.keys(champs).forEach((cle) => {
    assert.ok(mod.includes("cle: '" + cle + "', champ: '" + champs[cle] + "'"), 'rubrique ' + cle);
    assert.ok(page.includes(champs[cle]) || page.includes(champs[cle].replace(/_json$/, '')), 'la page publique ne lit pas ' + champs[cle]);
  });
});

test('FI4 aucune route nouvelle : seulement PUT /initiatives/:id/vitrine, qui accepte ces champs', () => {
  const appels = (mod.match(/api\('[A-Z]+', '[^']*'/g) || []);
  assert.deepEqual([...new Set(appels)], ["api('PUT', '/initiatives/'"]);
  assert.match(serveur, /route\("PUT", "\/api\/initiatives\/:id\/vitrine"/);
  const m = serveur.match(/const VITRINE_CHAMPS_BROUILLON = \[[\s\S]*?\];/)[0];
  ['vitrine_services', 'realisations_json', 'vitrine_resultats_impact_json', 'vitrine_reservation_json', 'vitrine_documents_json', 'vitrine_temoignages_json', 'vitrine_certifications_json', 'vitrine_equipe_json']
    .forEach((c) => assert.ok(m.includes('"' + c + '"'), c + ' absent de la liste des champs de vitrine'));
  assert.ok(!/api\('(POST|DELETE|PATCH)'/.test(mod), 'écriture hors champs de vitrine interdite');
});

test('FI5 aucun dépôt de projet ici : le bouton « Soumettre » reste celui de la page publique', () => {
  assert.ok(!/data-depot|depot-central|Soumettre/.test(mod.replace(/\/\*[\s\S]*?\*\//, '')), 'le module ne gère pas le dépôt');
  assert.match(page, /data-depot/);
});

test('FI6 les programmes sont lus et écrits comme le fait la page publique : une ligne « Titre : description »', () => {
  assert.match(mod, /var m = \/\^\(\.\{2,80\}\?\)\\s\*:\\s\+\(\.\+\)\$\/\.exec\(l\);/);
  assert.ok(page.includes('/^(.{2,80}?)\\s*:\\s+(.+)$/'), 'même expression que la page publique');
  assert.match(mod, /texte\(p\.titre\) \+ \(texte\(p\.description\) \? ' : ' \+ texte\(p\.description\) : ''\)/);
  assert.match(mod, /\.join\('\\n'\)/);
  assert.match(mod, /corps\[s\.champ\] = s\.ecrire \? s\.ecrire\(tableau\) : tableau;/);
});

test('FI7 un titre de programme ne peut pas contenir « : » (il couperait la ligne) ; la description tient sur une ligne', () => {
  assert.match(mod, /sansDeuxPoints: true/);
  assert.match(mod, /if \(c\.sansDeuxPoints && \/:\/\.test\(v\)\)/);
  assert.match(mod, /uneLigne: true/);
  assert.match(mod, /v\.replace\(\/\\s\*\[\\r\\n\]\+\\s\*\/g, ' '\)/);
});

test('FI8 un document se dépose en fichier (stockage des documents) ou par lien ; l\'envoi en cours bloque l\'enregistrement', () => {
  assert.match(mod, /uploadMedia\(f, 'document'\)/);
  assert.match(mod, /compressIfImage\(fichier, 1600, 1600, 0\.85\)/);
  assert.match(mod, /data-a="fichier-add"/);
  assert.match(mod, /accept="\.pdf,\.doc,\.docx,\.xls,\.xlsx,\.ppt,\.pptx,image\/jpeg,image\/png,image\/webp"/);
  assert.match(mod, /if \(S\.envoi\) return \{ erreur: 'Patientez/);
  assert.match(mod, /function fichierOk\(u\) \{ return \/\^\(https\?:\\\/\\\/\\S\+\|\\\/\\S\+\)\$\/i\.test\(u\); \}/);
  assert.match(page, /fichierSur\(d\.url\)/);
});

test('FI9 les champs obligatoires suivent la page publique (titre, valeur, intitulé, texte, nom)', () => {
  ['Le titre du programme est obligatoire', 'Le titre du projet est obligatoire', 'La valeur du chiffre est obligatoire', 'L\'intitulé du rendez-vous est obligatoire',
    'Le titre du document est obligatoire', 'Le texte du témoignage est obligatoire', 'Le nom de l\'agrément est obligatoire', 'Le nom du membre est obligatoire']
    .forEach((m) => assert.ok(mod.split("\\'").join("'").includes(m), m));
  assert.match(page, /texte\(r\.titre\)/);
  assert.match(page, /texte\(r\.valeur\)/);
  assert.match(page, /texte\(r\.intitule\)/);
  assert.match(page, /texte\(t\.texte\)/);
  assert.match(page, /texte\(c\.nom\)/);
  assert.match(page, /texte\(m\.nom\)/);
});

test('FI10 la photo d\'un membre va dans « photo », l\'image d\'un projet dans « image » ; les champs inconnus sont conservés', () => {
  assert.match(mod, /imageCle: 'photo'/);
  assert.match(mod, /o\[s\.imageCle \|\| 'image'\] = S\.image \|\| '';/);
  assert.match(mod, /tab\[S\.index\] = Object\.assign\(\{\}, tab\[S\.index\], lu\.valeur\);/);
});

test('FI11 un contenu est échappé partout ; une image n\'est acceptée que si elle commence par http(s) ou /', () => {
  assert.match(mod, /function esc\(s\)/);
  assert.match(mod, /function imageSure\(u\) \{[^}]*\^\(https\?:\\\/\\\/\|\\\/\)/);
  assert.match(mod, /esc\(nom\)/);
  assert.ok(!/innerHTML\s*=\s*[^;]*\+\s*it\.(titre|nom|valeur|texte)\b/.test(mod), 'contenu injecté sans échappement');
});

test('FI12 une rubrique éteinte est signalée, sans rien supprimer ; les clés de rubrique sont celles de la page publique', () => {
  assert.match(mod, /window\.BoutiqueRubriques\.active\(S\.etat, s\.rubrique\)/);
  assert.match(mod, /est éteinte dans votre boutique/);
  ['services', 'realisations', 'resultats_impact', 'reservation', 'documents', 'temoignages', 'certifications', 'equipe'].forEach((r) => {
    assert.ok(mod.includes("rubrique: '" + r + "'"), r);
    assert.ok(page.includes("rubrique('" + r + "')"), 'page publique : ' + r);
  });
});

test('FI13 suppression avec confirmation, ordre par flèches, limites par rubrique', () => {
  assert.match(mod, /window\.confirm\('Supprimer « '/);
  assert.match(mod, /data-a="haut"/);
  assert.match(mod, /data-a="bas"/);
  assert.match(mod, /cle: 'programmes'[^\n]*max: 24/);
  assert.match(mod, /cle: 'resultats'[^\n]*max: 12/);
  assert.match(mod, /n >= s\.max \|\| S\.occupe \? ' disabled' : ''/);
});

test('FI14 la barre du propriétaire mène à « Mon organisme » ; seul le repli garde l\'ancien lien', () => {
  assert.match(barre, /page === 'boutique-finance\.html' \? 'Mon organisme'/);
  assert.match(barre, /page === 'boutique-finance\.html' \? 'dashboard-initiative\.html#parametres-vitrine&finance'/);
  assert.ok(!/edition=1/.test(barre.replace(/\/\*[\s\S]*?\*\//g, '')), 'plus de lien de repli vers ?edition=1 (étape 3)');
});

test('FI15 la carte partage le style de « Mes produits » sans le casser', () => {
  assert.match(css, /:is\(#pv-produits,#pv-portfolio,#pv-evenements,#pv-impact,#pv-finance\) \.pvp-ligne/);
  assert.ok(!/^#pv-produits /m.test(css), 'sélecteur restant propre à « Mes produits » seulement');
  assert.match(mod, /document\.querySelector\('#pv-finance \.pvp-photo'\)/);
});

test('FI16 « Rattaché(e) à » propose les noms des autres membres ; les catégories sont réutilisées d\'un projet à l\'autre', () => {
  assert.match(mod, /listeDe: 'nom'/);
  assert.match(mod, /listeDe: 'categorie'/);
  assert.match(mod, /!\(s\.cle === 'equipe' && S\.index === i\)/);
});
