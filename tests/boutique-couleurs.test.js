/* Tests — couleurs et textures de la vraie boutique + aperçu instantané (2026-11-12).
   Lancer : node --test tests/boutique-couleurs.test.js
   Partie 1 : module partagé assets/boutique-couleurs.js (validation, nuances lisibles, application).
   Partie 2 : serveur réel sur une COPIE isolée de la base (brouillon -> publication).
   Partie 3 : les pages (boutique publique, centre de création) utilisent bien le module et l'aperçu instantané. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./_formation-harness');
const C = require('../assets/boutique-couleurs.js');
const Registre = require('../assets/boutique-types.js');

const RACINE = path.join(__dirname, '..');
const lireFichier = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

/* ═════════════ 1. Le module partagé ═════════════ */
test('C1 les textures viennent du registre des types, jamais d\'une copie', () => {
  assert.deepEqual(C.TEXTURES.map((t) => t.id), Registre.TEXTURES.map((t) => t.id));
  assert.ok(C.TEXTURES.length >= 2);
});

test('C1 un style valide est accepté et le nombre de textures suit le nombre de couleurs', () => {
  const r = C.fusionnerStyle({}, { couleurs: ['#83172F', '#111c38', '#d8b36a'] });
  assert.equal(r.erreur, undefined);
  assert.deepEqual(r.style.couleurs, ['#83172f', '#111c38', '#d8b36a'], 'les codes sont mis en minuscules');
  assert.deepEqual(r.style.textures, ['uni', 'uni', 'uni']);
  const deux = C.fusionnerStyle(r.style, { couleurs: ['#83172f', '#111c38'] });
  assert.equal(deux.style.textures.length, 2);
});

test('C1 changer de style visuel garde les couleurs, et changer de couleurs garde le style visuel', () => {
  const a = C.fusionnerStyle({ preset: 'elegant' }, { couleurs: ['#1e5e91'] }).style;
  assert.equal(a.preset, 'elegant');
  const b = C.fusionnerStyle(a, { preset: 'minimaliste' }).style;
  assert.deepEqual(b.couleurs, ['#1e5e91']);
  assert.equal(b.preset, 'minimaliste');
});

test('C1 les valeurs invalides sont refusées avec un message clair', () => {
  for (const mauvais of ['rouge', '#fff', '#12345g', 'javascript:alert(1)', '#83172f; color:red', 42, null]) {
    const r = C.fusionnerStyle({}, { couleurs: [mauvais] });
    assert.ok(r.erreur, `« ${mauvais} » doit être refusé`);
  }
  assert.ok(C.fusionnerStyle({}, { couleurs: [] }).erreur);
  assert.ok(C.fusionnerStyle({}, { couleurs: ['#111111', '#222222', '#333333', '#444444'] }).erreur, 'au plus 3 couleurs');
  assert.ok(C.fusionnerStyle({}, { preset: 'flashy' }).erreur);
  assert.ok(C.fusionnerStyle({}, 'texte').erreur);
  assert.ok(C.fusionnerStyle({}, { textures: ['dore'] }).erreur, 'pas de texture sans couleurs');
  const base = C.fusionnerStyle({}, { couleurs: ['#111111', '#222222'] }).style;
  assert.ok(C.fusionnerStyle(base, { textures: ['inconnue'] }).erreur);
  assert.ok(C.fusionnerStyle(base, { textures: ['uni', 'uni', 'uni'] }).erreur, 'trop de textures');
});

test('C1 une texture connue est enregistrée ; null remet la boutique sur son thème', () => {
  const base = C.fusionnerStyle({ preset: 'moderne' }, { couleurs: ['#111111', '#222222'] }).style;
  const t = C.fusionnerStyle(base, { textures: ['dore'] }).style;
  assert.deepEqual(t.textures, ['dore', 'uni']);
  const sans = C.fusionnerStyle(t, { couleurs: null }).style;
  assert.equal(sans.couleurs, undefined);
  assert.equal(sans.textures, undefined);
  assert.equal(sans.preset, 'moderne');
});

test('C1 les nuances restent lisibles : du texte blanc passe toujours (4,5 : 1) sur les fonds de la boutique', () => {
  const jeux = [['#ffee00'], ['#ffffff', '#f5f5f5', '#fafafa'], ['#83172f', '#111c38', '#d8b36a'], ['#222222', '#b38b3a', '#f1e2bd'], ['#00ffff', '#ffff00']];
  for (const j of jeux) {
    const v = C.variables(j);
    for (const n of ['--v1', '--v2', '--v3', '--v4']) {
      assert.ok(C.contraste('#ffffff', v[n]) >= 4.5, `${n} (${v[n]}) doit porter du texte blanc pour ${j.join(',')}`);
    }
    assert.match(v['--vsoft'], /^#[0-9a-f]{6}$/);
    assert.match(v['--vsoftbd'], /^rgba\(\d+,\d+,\d+,\.14\)$/);
  }
  assert.equal(C.variables([]), null);
  assert.equal(C.variables(undefined), null);
  assert.equal(C.variables(['pas-une-couleur']), null);
});

test('C1 une couleur déjà foncée n\'est pas modifiée', () => {
  assert.equal(C.variables(['#83172f'])['--v1'], '#83172f');
});

test('C1 appliquer pose les variables et les textures sur la boutique, et les retire quand il n\'y a plus de couleurs', () => {
  const pose = {};
  const el = { style: { setProperty: (n, v) => { pose[n] = v; }, removeProperty: (n) => { delete pose[n]; } } };
  C.appliquer(el, { couleurs: ['#83172f', '#111c38', '#d8b36a'], textures: ['dore', 'uni', 'brillant'] });
  assert.equal(pose['--v1'], '#83172f');
  assert.ok(pose['--v3'] && pose['--v4']);
  assert.equal(pose['--vtex1'], C.textureCss('dore'));
  assert.equal(pose['--vtex2'], 'none');
  assert.equal(pose['--vtex3'], C.textureCss('brillant'));
  C.appliquer(el, { preset: 'elegant' });
  assert.deepEqual(Object.keys(pose), [], 'sans couleurs, le thème de la boutique reprend la main');
  C.appliquer(null, {});
});

/* ═════════════ 2. Le serveur ═════════════ */
let env, jarProprio, jarAutre, idInit;
const sql = (req, ...args) => { const bd = new H.DatabaseSync(env.dbPath); try { return bd.prepare(req).run(...args); } finally { bd.close(); } };
const lire = (req, ...args) => { const bd = new H.DatabaseSync(env.dbPath); try { return bd.prepare(req).get(...args); } finally { bd.close(); } };
const brouillon = () => JSON.parse(lire('SELECT vitrine_draft_json AS d FROM initiatives WHERE id=?', idInit).d || '{}');
const patch = (corps, jar) => env.call(jar || jarProprio, 'PUT', `/api/initiatives/${idInit}/vitrine-draft`, corps);

test.before(async () => {
  env = await H.demarrer('couleurs');
  const rnd = Math.random().toString(36).slice(2, 8);
  jarProprio = H.cookieJar();
  const proprio = await H.creerApprenant(env, jarProprio, rnd, 'Proprio');
  jarAutre = H.cookieJar();
  await H.creerApprenant(env, jarAutre, rnd, 'Autre');
  const uid = lire('SELECT id FROM users WHERE email=?', proprio.email).id;
  idInit = Number(sql("INSERT INTO initiatives (nom, owner_user_id, vitrine_type) VALUES ('Boutique couleurs', ?, 'commercial')", uid).lastInsertRowid);
});
test.after(() => env && env.stop());

test('C2 les couleurs et textures vont dans le brouillon, pas dans la boutique publiée', async () => {
  const r = await patch({ style: { couleurs: ['#83172f', '#111c38', '#d8b36a'], textures: ['dore', 'uni', 'uni'] } });
  assert.equal(r.status, 200);
  assert.deepEqual(brouillon().style.couleurs, ['#83172f', '#111c38', '#d8b36a']);
  assert.deepEqual(brouillon().style.textures, ['dore', 'uni', 'uni']);
  const pub = lire('SELECT vitrine_style_json AS s FROM initiatives WHERE id=?', idInit).s;
  assert.ok(!pub || !JSON.parse(pub).couleurs, 'rien n\'est publié avant « Publier »');
});

test('C2 choisir un style visuel ne fait plus disparaître les couleurs', async () => {
  const r = await patch({ style: { preset: 'elegant' } });
  assert.equal(r.status, 200);
  assert.equal(brouillon().style.preset, 'elegant');
  assert.deepEqual(brouillon().style.couleurs, ['#83172f', '#111c38', '#d8b36a']);
  assert.deepEqual(brouillon().style.textures, ['dore', 'uni', 'uni']);
});

test('C2 une couleur ou une texture invalide est refusée et le brouillon reste intact', async () => {
  const avant = JSON.stringify(brouillon());
  for (const style of [{ couleurs: ['rouge'] }, { couleurs: ['#12345'] }, { preset: 'flashy' }, { textures: ['inconnue', 'uni', 'uni'] }, { couleurs: ['#111111', '#222222', '#333333', '#444444'] }]) {
    const r = await patch({ style });
    assert.equal(r.status, 400, JSON.stringify(style));
    assert.ok(r.data.error);
  }
  assert.equal(JSON.stringify(brouillon()), avant);
});

test('C2 seul le propriétaire peut modifier les couleurs', async () => {
  assert.equal((await patch({ style: { couleurs: ['#000000'] } }, jarAutre)).status, 403);
  assert.equal((await patch({ style: { couleurs: ['#000000'] } }, H.cookieJar())).status, 401);
  assert.deepEqual(brouillon().style.couleurs, ['#83172f', '#111c38', '#d8b36a']);
});

test('C2 l\'aperçu (?preview=draft) renvoie les couleurs du brouillon, la boutique publique ne les voit pas encore', async () => {
  const apercu = await env.call(jarProprio, 'GET', '/api/mon-initiative?preview=draft');
  assert.equal(apercu.status, 200);
  assert.deepEqual(JSON.parse(apercu.data.initiative.vitrine_style_json).couleurs, ['#83172f', '#111c38', '#d8b36a']);
  const publique = await env.call(null, 'GET', `/api/initiatives/${idInit}`);
  const s = (publique.data.initiative || publique.data).vitrine_style_json;
  assert.ok(!s || !JSON.parse(s).couleurs);
});

test('C2 « Publier » copie couleurs et textures dans la boutique', async () => {
  const r = await env.call(jarProprio, 'POST', `/api/initiatives/${idInit}/vitrine-publish`, {});
  assert.equal(r.status, 200);
  const s = JSON.parse(lire('SELECT vitrine_style_json AS s FROM initiatives WHERE id=?', idInit).s);
  assert.deepEqual(s.couleurs, ['#83172f', '#111c38', '#d8b36a']);
  assert.deepEqual(s.textures, ['dore', 'uni', 'uni']);
  assert.equal(s.preset, 'elegant');
  const publique = await env.call(null, 'GET', `/api/initiatives/${idInit}`);
  assert.deepEqual(JSON.parse((publique.data.initiative || publique.data).vitrine_style_json).couleurs, ['#83172f', '#111c38', '#d8b36a']);
});

test('C2 remettre « couleurs: null » rend à la boutique son thème', async () => {
  assert.equal((await patch({ style: { couleurs: null } })).status, 200);
  assert.equal(brouillon().style.couleurs, undefined);
  assert.equal(brouillon().style.preset, 'elegant');
});
