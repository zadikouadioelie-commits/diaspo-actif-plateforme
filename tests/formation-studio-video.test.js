/* ===========================================================
   tests/formation-studio-video.test.js — Studio : recadrage d'image et suivi de visionnage des vidéos (2026-10-30)
   ===========================================================
   Recadrage nettoyé côté serveur ; vidéo « à regarder » : l'apprenant enregistre ce qu'il a regardé (fusion des morceaux), la lecture le lui rend,
   et la validation de la leçon (à l'unité comme en lot) est refusée tant que 90 % ne sont pas vus. Intégration HTTP réelle, base SQLite isolée.
   Lancer : node --test tests/formation-studio-video.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');
const Studio = require('../server/formation-studio');

let env;
test.before(async () => { env = await H.demarrer('studiovideo'); });
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('studio : recadrage (nettoyage) et visionnage de vidéo (suivi, validation de la leçon)', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid, lid, base, rev = 0;
  const MP4 = 'https://vz-test.b-cdn.net/aaaaaaaa-0000-4000-8000-000000000001/play_720p.mp4';
  const el = (id, type, props, extra) => ({ id, type, x: 100, y: 40, w: 600, h: 340, z: 1, props, ...extra });
  const sauver = async (pages) => { const r = await call(jarF, 'PUT', base, { mode: 'libre', pages, rev }); if (r.ok) rev = r.data.rev; return r; };

  await t.test('setup — formation publiée, une leçon studio, un apprenant inscrit', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    await H.creerApprenant(env, jarA, rnd, 'Apprenant');
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Visionnage ' + rnd, description: 'x' })).data.id;
    const mid = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'M' })).data.id;
    const ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${mid}/chapitres`, { titre: 'C' })).data.id;
    lid = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon vidéo', type: 'texte' })).data.id;
    H.publier(env, fid);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
    base = `/api/formations/${fid}/lecons/${lid}/studio`;
    const g = await call(jarF, 'GET', base); rev = g.data.rev;
  });

  await t.test('recadrage : une zone cohérente est conservée, une zone absurde ou « image entière » disparaît', () => {
    assert.deepEqual(Studio.lireCrop({ x: 10, y: 20.123, w: 50, h: 40, ratio: 1.5 }), { x: 10, y: 20.12, w: 50, h: 40, ratio: 1.5 });
    assert.equal(Studio.lireCrop({ x: 60, y: 0, w: 50, h: 40, ratio: 1 }), null, 'déborde de l\'image');
    assert.equal(Studio.lireCrop({ x: 0, y: 0, w: 2, h: 40, ratio: 1 }), null, 'trop étroite');
    assert.equal(Studio.lireCrop({ x: 0, y: 0, w: 100, h: 100, ratio: 1.78 }), null, 'image entière : pas de recadrage');
    assert.equal(Studio.lireCrop({ x: 0, y: 0, w: 50, h: 50, ratio: 50 }), null, 'rapport absurde');
    assert.equal(Studio.lireCrop({ x: 'a', y: 0, w: 50, h: 50, ratio: 1 }), null);
    assert.equal(Studio.lireCrop(null), null); assert.equal(Studio.lireCrop('x'), null);
  });

  await t.test('enregistrer : le recadrage et l\'exigence de visionnage passent par le nettoyage du serveur', async () => {
    const r = await sauver([{ id: 'p1', titre: 'P', elements: [
      el('img1', 'image', { url: 'https://cdn.exemple.test/a.jpg', crop: { x: 10, y: 10, w: 50, h: 50, ratio: 1.6 } }),
      el('img2', 'image', { url: 'https://cdn.exemple.test/b.jpg', crop: { x: 90, y: 0, w: 50, h: 50, ratio: 1 } }),
      el('vid1', 'video', { url: MP4, titre: 'Cours', exiger: true }),
      el('vid2', 'video', { url: 'https://www.youtube.com/watch?v=abcdefghijk', exiger: true }),
      el('vid3', 'video', { url: MP4 + '?b=1', exiger: false }),
    ] }]);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const e = Object.fromEntries(r.data.doc.pages[0].elements.map(x => [x.id, x.props]));
    assert.deepEqual(e.img1.crop, { x: 10, y: 10, w: 50, h: 50, ratio: 1.6 });
    assert.equal(e.img2.crop, null, 'recadrage qui déborde : retiré');
    assert.equal(e.vid1.exiger, true);
    assert.equal(e.vid2.exiger, false, 'YouTube : impossible à suivre, donc jamais exigé');
    assert.equal(e.vid3.exiger, false);
  });

  await t.test('publier, puis la lecture rend au seul apprenant l\'état de ses vidéos', async () => {
    assert.equal((await call(jarF, 'POST', base + '/publier', {})).status, 200);
    const lecture = await call(jarA, 'GET', base + '/lecture');
    assert.equal(lecture.status, 200); assert.deepEqual(lecture.data.videos, {}); assert.equal(lecture.data.seuil_visionnage, 90);
    assert.equal(lecture.data.doc.pages[0].elements.find(x => x.id === 'vid1').props.exiger, true);
  });

  await t.test('validation d\'une leçon : refusée tant que la vidéo à regarder n\'est pas vue', async () => {
    const r = await call(jarA, 'POST', `/api/formations/${fid}/lecons/${lid}/progression`, { termine: true });
    assert.equal(r.status, 409); assert.equal(r.data.code, 'video_requise'); assert.match(r.data.error, /Cours/); assert.equal(r.data.videos[0].element_id, 'vid1'); assert.equal(r.data.videos[0].pct, 0);
    const lot = await call(jarA, 'POST', `/api/formations/${fid}/progression-lot`, { lecons: [{ id: lid, termine: true }] });
    assert.deepEqual(lot.data.refusees, [lid], 'le mode manuel ne contourne pas la règle'); assert.equal(lot.data.appliquees, 0);
  });

  await t.test('enregistrer le visionnage : droits, validations, fusion des morceaux', async () => {
    const url = `${base}/video/vid1`;
    assert.equal((await call(anon, 'PUT', url, { segments: '1111' })).status, 401);
    assert.equal((await call(jarF, 'PUT', url, { segments: '1111' })).status, 403, 'le formateur n\'est pas un apprenant inscrit');
    assert.equal((await call(jarA, 'PUT', url, { segments: '12ab' })).status, 400);
    assert.equal((await call(jarA, 'PUT', url, { segments: '' })).status, 400);
    assert.equal((await call(jarA, 'PUT', url, { segments: '1'.repeat(1001) })).status, 400);
    assert.equal((await call(jarA, 'PUT', `${base}/video/vid2`, { segments: '1111' })).status, 404, 'YouTube : pas de suivi');
    assert.equal((await call(jarA, 'PUT', `${base}/video/inconnue`, { segments: '1111' })).status, 404);
    let r = await call(jarA, 'PUT', url, { segments: '1100000000', position: 12, duree: 50 });
    assert.equal(r.status, 200); assert.equal(r.data.pct, 20);
    r = await call(jarA, 'PUT', url, { segments: '0011000000', position: 22, duree: 50 });
    assert.equal(r.data.pct, 40, 'les morceaux déjà vus ne se perdent pas'); assert.equal(r.data.segments, '1111000000');
    r = await call(jarA, 'PUT', url, { segments: '0000000000', position: 0, duree: 50 });
    assert.equal(r.data.pct, 40, 'un envoi « vide » n\'efface rien');
    const lecture = await call(jarA, 'GET', base + '/lecture');
    assert.equal(lecture.data.videos.vid1.pct, 40); assert.equal(lecture.data.videos.vid1.segments, '1111000000');
    assert.equal(sql('select count(*) n from formation_studio_video')[0].n, 1);
    const prop = await call(jarF, 'GET', base + '/lecture');
    assert.deepEqual(prop.data.videos, {}, 'le formateur ne reçoit pas le suivi des élèves');
  });

  await t.test('toujours refusée à 40 % ; acceptée dès 90 %', async () => {
    let r = await call(jarA, 'POST', `/api/formations/${fid}/lecons/${lid}/progression`, { termine: true });
    assert.equal(r.status, 409); assert.equal(r.data.videos[0].pct, 40); assert.match(r.data.error, /40 %/);
    r = await call(jarA, 'PUT', `${base}/video/vid1`, { segments: '0000111110', position: 45, duree: 50 });
    assert.equal(r.data.pct, 90);
    r = await call(jarA, 'POST', `/api/formations/${fid}/lecons/${lid}/progression`, { termine: true });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    /* retirer la coche reste toujours possible */
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/lecons/${lid}/progression`, { termine: false })).status, 200);
    const lot = await call(jarA, 'POST', `/api/formations/${fid}/progression-lot`, { lecons: [{ id: lid, termine: true }] });
    assert.equal(lot.data.appliquees, 1); assert.deepEqual(lot.data.refusees, []);
  });

  await t.test('republier sans l\'exigence : la leçon se valide sans regarder (le suivi suit la version publiée)', async () => {
    const r = await sauver([{ id: 'p1', titre: 'P', elements: [el('vid1', 'video', { url: MP4, titre: 'Cours', exiger: false })] }]);
    assert.equal(r.status, 200);
    assert.equal((await call(jarF, 'POST', base + '/publier', {})).status, 200);
    sql("delete from formation_studio_video"); sql("update formation_lecons_progression set termine=0");
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/lecons/${lid}/progression`, { termine: true })).status, 200);
  });
});
