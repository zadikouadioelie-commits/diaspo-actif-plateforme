/* Lot E4 — « Votre rôle » et « Mon espace organisateur » (assets/boutique-events-espace.js). Lancer : node --test tests/boutique-events-espace.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Espace = require('../assets/boutique-events-espace.js');
const Events = require('../server/boutique-events.js');

const PROFILS = Events.PROFILS_POUR_INTERFACE;
const actifs = (...cles) => Object.fromEntries(cles.map((k) => [k, { actif: true }]));

test('E4 — le profil déduit côté navigateur est le même que côté serveur', () => {
  for (const modules of [actifs(), actifs('evenements'), actifs('services'), actifs('evenements', 'services'), actifs('a_propos')]) {
    assert.strictEqual(Espace.profilDe(modules), Events.profilDe(modules));
  }
});

test('E4 — trois rôles affichés avec les libellés du serveur, le rôle courant est coché', () => {
  const h = Espace.html({ profils: PROFILS, modules: actifs('evenements') });
  for (const p of PROFILS) assert.ok(h.includes(p.label), p.label);
  assert.strictEqual((h.match(/data-profil="/g) || []).length, 3);
  assert.match(h, /data-profil="organisateur"/);
  assert.strictEqual((h.match(/aria-checked="true"/g) || []).length, 1);
  assert.match(h, /aria-checked="true"[^>]*data-profil="organisateur"/);
});

test('E4 — « les deux » est coché quand événements et prestations sont affichés', () => {
  const h = Espace.html({ profils: PROFILS, modules: actifs('evenements', 'services') });
  assert.match(h, /aria-checked="true"[^>]*data-profil="les_deux"/);
});

test('E4 — aucun rôle actif : rien n\'est coché et un message l\'explique', () => {
  const h = Espace.html({ profils: PROFILS, modules: actifs('a_propos') });
  assert.strictEqual((h.match(/aria-checked="true"/g) || []).length, 0);
  assert.match(h, /Aucun rôle n'est actif/);
});

test('E4 — les raccourcis renvoient vers des sections qui existent déjà dans l\'espace initiative', () => {
  const dash = fs.readFileSync(path.join(__dirname, '..', 'dashboard-initiative.html'), 'utf8');
  assert.strictEqual(Espace.RACCOURCIS.length, 3);
  for (const r of Espace.RACCOURCIS) {
    assert.match(dash, new RegExp("data-section=\"" + r.section + "\""), r.section);
    assert.ok(dash.includes("'" + r.section + "'"), 'section déclarée : ' + r.section);
  }
});

test('E4 — le texte venant du serveur est échappé', () => {
  const h = Espace.html({ profils: [{ cle: 'x"><b', label: '<script>alert(1)</script>', desc: '"&' }], modules: {} });
  assert.ok(!h.includes('<script>'));
  assert.ok(!h.includes('x"><b'));
});

test('E4 — l\'éditeur charge le module et ne montre l\'espace que pour le type « events »', () => {
  const dash = fs.readFileSync(path.join(__dirname, '..', 'dashboard-initiative.html'), 'utf8');
  assert.ok(dash.includes('assets/boutique-events-espace.js'));
  assert.ok(dash.includes('id="pv-events-espace"'));
  assert.match(dash, /canonique\(v2, courant\) === 'events'/);
  assert.match(dash, /pvDraftPatch\(\{ profil_evenements: cle \}\)/);
});
