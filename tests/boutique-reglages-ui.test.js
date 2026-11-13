/* ===========================================================
   tests/boutique-reglages-ui.test.js — Étapes 6 à 11 de l'assistant de création (lot 2, 2026-11-13)
   ===========================================================
   1. Formulaires (assets/boutique-reglages-ui.js) : chaque champ existe côté serveur avec les mêmes valeurs permises, recherche de pays, aucun libellé inventé.
   2. Branchement dans dashboard-initiative.html : les 12 étapes, l'enregistrement dans le brouillon, l'état réel des étapes 8, 9 et 11.
   Lancer : node --test tests/boutique-reglages-ui.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../server/boutique-reglages.js');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const SRC = lire('assets/boutique-reglages-ui.js');
const fen = { console };
fen.window = fen;
vm.runInContext(SRC, vm.createContext(fen));
const UI = fen.BoutiqueReglagesUI;
const js = (x) => JSON.parse(JSON.stringify(x)); /* sort du contexte vm pour comparer des tableaux */

test('U1 chaque champ des formulaires existe côté serveur, dans la même section', () => {
  const defauts = R.defauts();
  for (const [section, champs] of Object.entries(UI.CHAMPS)) {
    assert.ok(defauts[section], `section inconnue du serveur : ${section}`);
    for (const c of champs) assert.ok(c.f in defauts[section], `${section}.${c.f} n'existe pas côté serveur`);
  }
  for (const [section, valeurs] of Object.entries(defauts)) {
    for (const f of Object.keys(valeurs)) assert.ok(UI.CHAMPS[section].some((c) => c.f === f), `${section}.${f} n'a pas de champ à l'écran`);
  }
});

test('U1 les choix proposés sont exactement ceux que le serveur accepte', () => {
  const frais = UI.CHAMPS.livraison.find((c) => c.f === 'frais_mode').options.map((o) => o[0]);
  assert.deepEqual(js(frais), R.MODES_FRAIS);
  const statuts = UI.CHAMPS.confiance.find((c) => c.f === 'statut_juridique').options;
  assert.deepEqual(js(statuts), R.STATUTS_JURIDIQUES);
  const docs = UI.CHAMPS.confiance.filter((c) => c.t === 'document').map((c) => c.f);
  assert.deepEqual(js(docs).sort(), [...R.DOCUMENTS].sort());
  for (const c of UI.CHAMPS.commercial.concat(UI.CHAMPS.livraison).filter((c) => c.t === 'nombre')) assert.ok(c.max > c.min, c.f);
});

test('U1 chaque champ dit s\'il est appliqué aux commandes ou seulement enregistré', () => {
  const appliques = [];
  for (const champs of Object.values(UI.CHAMPS)) for (const c of champs) { assert.ok(c.etat, `${c.f} sans mention`); if (/rgl-applique/.test(c.etat)) appliques.push(c.f); }
  assert.deepEqual(appliques.sort(), ['expedition', 'frais_mode', 'frais_montant', 'minimum_commande', 'pays_vente', 'retrait']);
});

test('U1 la liste des pays est complète, sans doublon, et la recherche ignore accents et majuscules', () => {
  assert.ok(UI.PAYS.length >= 190);
  assert.equal(new Set(UI.PAYS).size, UI.PAYS.length);
  for (const p of ['France', 'Sénégal', "Côte d'Ivoire", 'Bénin', 'Cameroun']) assert.ok(UI.PAYS.includes(p), p);
  assert.deepEqual(js(UI.filtrerPays('SENEGAL')), ['Sénégal']);
  assert.ok(UI.filtrerPays('cote d ivoire').includes("Côte d'Ivoire"));
  assert.equal(UI.filtrerPays('').length, UI.PAYS.length);
  assert.deepEqual(js(UI.filtrerPays('zzzz')), []);
});

test('U1 le texte saisi est échappé et l\'enregistrement passe par un seul point (onChanger)', () => {
  assert.match(SRC, /function esc\(s\)/);
  assert.match(SRC, /cfg\.onChanger\(corps\)/);
  assert.match(SRC, /role="alert"/);
  assert.match(SRC, /aria-pressed/);
  assert.match(SRC, /retour\.then\(function \(\) \{ message\("Enregistré dans le brouillon/);
  assert.doesNotThrow(() => new vm.Script(SRC));
  const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  assert.ok(!emo.test(SRC));
});

const HTML = lire('dashboard-initiative.html');

test('U2 le tableau de bord charge les formulaires et déclare les douze étapes dans l\'ordre de la maquette', () => {
  assert.match(HTML, /boutique-reglages-ui\.js/);
  const ordre = ['type', 'identite', 'options', 'apparence', 'rubriques', 'bonus', 'commercial', 'livraison', 'paiements', 'equipe', 'confiance', 'notifications', 'publication'];
  const pos = ordre.map((cle) => HTML.indexOf(`{ cle: '${cle}'`));
  assert.ok(pos.every((p) => p > 0), 'étape manquante : ' + ordre.filter((c, i) => pos[i] < 0));
  assert.deepEqual([...pos].sort((a, b) => a - b), pos, 'ordre des étapes');
  for (const [cle, num] of [['commercial', '6'], ['livraison', '7'], ['paiements', '8'], ['equipe', '9'], ['confiance', '10'], ['notifications', '11'], ['publication', '12']]) {
    assert.match(HTML, new RegExp(`\\{ cle: '${cle}', num: '${num}'`), `${cle} doit porter le numéro ${num}`);
  }
});

test('U2 les trois formulaires s\'enregistrent dans le brouillon, avec relecture après « Annuler »', () => {
  assert.match(HTML, /async function pvChangerReglages\(corps\)[\s\S]{0,200}pvDraftPatch\(\{ reglages: corps \}\)/);
  assert.match(HTML, /\['commercial', 'livraison', 'confiance'\]\.forEach\(section =>/);
  assert.match(HTML, /await pvRechargerReglages\(\);/);
  assert.match(HTML, /__pvReglages = init\.vitrine_reglages \|\| \{\};/);
});

test('U2 les étapes 8, 9 et 11 lisent l\'état réel et ne créent aucun réglage fictif', () => {
  assert.match(HTML, /\/initiatives\/\$\{initId\}\/connect\/status/);
  assert.match(HTML, /\/initiatives\/\$\{initId\}\/membres/);
  assert.match(HTML, /onAfficher: pvAssistantAfficher/);
  assert.match(HTML, /startConnectOnboarding\(\)/);
  assert.match(HTML, /ne peuvent pas être désactivées une par une pour l.{1,2}instant/);
  assert.match(HTML, /droits détaillés par rôle ne sont pas encore proposés/);
  assert.match(HTML, /premiumLockedCardHtml\('paiement_boutique'\)/, 'le verrou Premium des paiements est respecté');
});

test('U2 la pastille « Confiance » et le résumé de publication suivent les réglages réels', () => {
  assert.match(HTML, /case 'confiance': \{ const k = __pvReglages\.confiance \|\| \{\}; return k\.raison_sociale && k\.email \? 'ok' : 'afaire'; \}/);
  assert.match(HTML, /Informations légales : /);
});
