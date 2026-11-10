/* ===========================================================
   tests/depot-detourne.test.js — Lot F (2026-11-10) : aucun dépôt de projet détourné dans les textes de boutique
   ===========================================================
   Un seul module de dépôt : « Soumettre à Diaspo'Actif ». Une boutique ne doit pas inviter à déposer un projet
   ou un dossier de financement chez elle ; renvoyer vers le module central reste autorisé.
   Lancer : node --test tests/depot-detourne.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { detecterDepotDetourne, controlerTextes, MESSAGE_REFUS } = require('../server/depot-detourne');

const refuses = [
  "Déposez votre projet ici, nous revenons vers vous sous 48 h.",
  "Envoyez-nous votre dossier de financement par message.",
  "Pour obtenir un prêt, soumettez votre business plan directement à notre équipe.",
  "DEPOSER VOTRE PROJET : formulaire ci-dessous",
  "Dépôt de projet ouvert toute l'année",
  "Vous pouvez nous transmettre une demande de financement par e-mail.",
  "<p>Postulez avec <b>votre projet</b> avant le 30 novembre</p>",
  "Formulaire de dépôt disponible en agence.",
];
const acceptes = [
  "Nous accompagnons vos projets de la première idée à la mise en marché.",
  "Notre atelier réalise des vêtements sur mesure et des accessoires en wax.",
  "Pour soumettre un projet, utilisez Soumettre à Diaspo'Actif : c'est le seul point de dépôt officiel.",
  "Déposer à Diaspo'Actif est le seul moyen de présenter un projet.",
  "Nous déposons chaque matin le pain frais chez nos partenaires.",
  "Livraison offerte dès 50 € d'achat, retours sous 14 jours.",
  "",
];

test('les formulations de dépôt détourné sont repérées', () => {
  for (const t of refuses) assert.equal(detecterDepotDetourne(t), true, 'devrait être refusé : ' + t);
});

test('les textes normaux et le renvoi vers le module central passent', () => {
  for (const t of acceptes) assert.equal(detecterDepotDetourne(t), false, 'ne devrait pas être refusé : ' + t);
});

test('controlerTextes parcourt chaînes, tableaux, objets et JSON sérialisé', () => {
  assert.equal(controlerTextes({ description: "Boutique de wax", mission: "Habiller la diaspora" }), null);
  assert.equal(controlerTextes({ description: "ok", services: ["Couture", "Déposez votre projet chez nous"] }), MESSAGE_REFUS);
  assert.equal(controlerTextes({ vitrine_temoignages_json: JSON.stringify([{ texte: "Envoyez votre dossier de candidature à la boutique" }]) }), MESSAGE_REFUS);
  assert.equal(controlerTextes(null), null);
  assert.equal(controlerTextes(undefined), null);
});

test('le message de refus nomme le module central et précise que rien n\'est enregistré', () => {
  assert.match(MESSAGE_REFUS, /Soumettre à Diaspo'Actif/);
  assert.match(MESSAGE_REFUS, /Rien n'a été enregistré/);
});

test('le contrôle est branché sur les routes de textes de boutique (vitrine, brouillon, publication)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
  const appels = src.match(/DepotDetourne\.controlerTextes\(/g) || [];
  assert.ok(appels.length >= 4, 'attendu : PUT vitrine, vitrine-draft, vitrine-draft-complet, vitrine-publish');
  assert.match(src, /require\("\.\/depot-detourne"\)/);
});
