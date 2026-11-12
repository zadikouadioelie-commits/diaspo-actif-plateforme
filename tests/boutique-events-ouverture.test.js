/* ===========================================================
   tests/boutique-events-ouverture.test.js — Lot E5 (2026-11-12) : mise en service du type « Créateur d'événements »
   ===========================================================
   Vérifie le parcours complet d'une VRAIE boutique (compte non administrateur) une fois l'interrupteur des 6 types allumé :
   le type est proposé avec sa présentation dédiée, se choisit, reçoit son rôle, se publie, et le visiteur est envoyé vers la bonne page.
   Rien n'est ouvert par ce test ni par ce lot : l'interrupteur « boutique_types_v2_actif » reste une décision de l'administrateur.
   Lancer : node --test tests/boutique-events-ouverture.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./_formation-harness');
const EV = require('../server/boutique-events');

const RACINE = path.join(__dirname, '..');
const lireFichier = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let env, jarAdmin, jarProprio, idInit, bd;

test.before(async () => {
  env = await H.demarrer('boutique-events-ouverture');
  bd = new H.DatabaseSync(env.dbPath);
  bd.exec('PRAGMA busy_timeout = 5000');
  const rnd = Math.random().toString(36).slice(2, 8);
  jarAdmin = H.cookieJar(); jarProprio = H.cookieJar();
  await H.creerFormateur(env, jarAdmin, rnd, 'AdminOuv');
  const p = await H.creerApprenant(env, jarProprio, rnd, 'ProprioOuv');
  const uid = bd.prepare('SELECT id FROM users WHERE email=?').get(p.email).id;
  idInit = Number(bd.prepare("INSERT INTO initiatives (nom, boutique_nom, owner_user_id, vitrine_type) VALUES ('Interne', 'Festival Diaspora', ?, 'commercial')").run(uid).lastInsertRowid);
});
test.after(() => { try { bd && bd.close(); } catch (e) {} env && env.stop(); });

test('E5 tant que l\'interrupteur est éteint, une vraie boutique ne voit ni le type ni le rôle', async () => {
  const reg = await env.call(jarProprio, 'GET', '/api/vitrine-modules-registry');
  assert.equal(reg.data.types_v2.actif, false);
  assert.equal(reg.data.templates.events, undefined);
  const r = await env.call(jarProprio, 'POST', `/api/initiatives/${idInit}/vitrine/changer-type`, { type: 'events', mode: 'adapter', confirme: true });
  assert.notEqual(r.status, 200, 'le type ne se choisit pas avant la mise en service');
  assert.equal(bd.prepare('SELECT vitrine_type AS t FROM initiatives WHERE id=?').get(idInit).t, 'commercial');
});

test('E5 après la mise en service : le type est proposé avec sa présentation dédiée et ses trois rôles', async () => {
  assert.equal((await env.call(jarAdmin, 'PUT', '/api/admin/boutique-types-v2', { actif: true })).status, 200);
  const reg = await env.call(jarProprio, 'GET', '/api/vitrine-modules-registry');
  const t = reg.data.types_v2.types.find((x) => x.cle === 'events');
  assert.equal(t.selectionnable, true);
  assert.equal(t.page_dediee, true, 'la page publique dédiée existe : pas de mention « présentation à venir »');
  assert.deepEqual(reg.data.types_v2.profils_evenements.map((p) => p.cle), ['organisateur', 'prestataire', 'les_deux']);
});

test('E5 parcours d\'une vraie boutique : choisir le type, choisir le rôle, publier', async () => {
  const c = await env.call(jarProprio, 'POST', `/api/initiatives/${idInit}/vitrine/changer-type`, { type: 'events', mode: 'adapter', confirme: true });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const role = await env.call(jarProprio, 'PUT', `/api/initiatives/${idInit}/vitrine-draft`, { profil_evenements: 'prestataire' });
  assert.equal(role.status, 200, JSON.stringify(role.data));
  assert.equal(EV.profilDe(role.data.draft.modules), 'prestataire');
  const pub = await env.call(jarProprio, 'POST', `/api/initiatives/${idInit}/vitrine-publish`);
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  const vue = await env.call(null, 'GET', `/api/initiatives/${idInit}`);
  assert.equal(vue.status, 200);
  assert.equal(vue.data.initiative.vitrine_type, 'events');
  assert.equal(EV.profilDe(vue.data.initiative.vitrine_modules_state), 'prestataire');
});

test('E5 impact et finance restent réservés à l\'administration', async () => {
  for (const type of ['impact', 'finance']) {
    const r = await env.call(jarProprio, 'POST', `/api/initiatives/${idInit}/vitrine/changer-type`, { type, mode: 'adapter', confirme: true });
    assert.equal(r.status, 400, `${type} doit rester refusé`);
  }
});

test('E5 le visiteur d\'une boutique « events » est envoyé vers la page dédiée, qui existe et charge ses fichiers', () => {
  const profil = lireFichier('profil-app.html');
  assert.match(profil, /vitrine_type === 'events'[^\n]*boutique-evenements\.html\?id=/);
  const page = lireFichier('boutique-evenements.html');
  const fichiers = [...page.matchAll(/(?:src|href)="\/(assets\/[^"?]+)/g)].map((m) => m[1]);
  assert.ok(fichiers.includes('assets/boutique-evenements.js') && fichiers.includes('assets/boutique-evenements.css'));
  for (const f of fichiers) assert.ok(fs.existsSync(path.join(RACINE, f)), `${f} est chargé par la page mais n'existe pas`);
});

test('E5 l\'éditeur propose le rôle et l\'espace organisateur seulement pour ce type', () => {
  const dash = lireFichier('dashboard-initiative.html');
  assert.ok(dash.includes('assets/boutique-events-espace.js'));
  assert.ok(fs.existsSync(path.join(RACINE, 'assets/boutique-events-espace.js')));
  assert.match(dash, /canonique\(v2, courant\) === 'events'/);
});
