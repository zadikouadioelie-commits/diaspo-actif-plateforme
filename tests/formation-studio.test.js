/* ===========================================================
   tests/formation-studio.test.js — Formation Diaspora, lot D : Studio de création (2026-10-30)
   ===========================================================
   Sauvegarde automatique (révisions + conflits), nettoyage du contenu côté serveur, historique, publication contrôlée, lecture par les apprenants
   (version publiée seulement), droits d'accès. Intégration HTTP réelle, base SQLite isolée (voir tests/_formation-harness.js).
   Lancer : node --test tests/formation-studio.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('studio'); });
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('studio : sauvegarde, versions, publication, lecture', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarX = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid, lid, mid, base, rev;
  const page = (id, elements) => ({ id, titre: 'P', elements });
  const titre = (id, html, extra) => ({ id, type: 'titre', x: 100, y: 40, w: 800, h: 80, z: 1, props: { html, taille: 40 }, ...extra });

  await t.test('setup — formation publiée avec une leçon, formateur, apprenant inscrit, étranger non inscrit', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    await H.creerApprenant(env, jarA, rnd, 'Apprenant');
    await H.creerApprenant(env, jarX, rnd, 'Etranger');
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Studio ' + rnd, description: 'x' })).data.id;
    mid = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'M' })).data.id;
    const ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${mid}/chapitres`, { titre: 'C' })).data.id;
    lid = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon studio', type: 'texte' })).data.id;
    H.publier(env, fid);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
    base = `/api/formations/${fid}/lecons/${lid}/studio`;
  });

  await t.test('droits : ni visiteur ni apprenant ne touchent au studio', async () => {
    assert.equal((await call(anon, 'GET', base)).status, 401);
    assert.equal((await call(jarA, 'GET', base)).status, 403);
    assert.equal((await call(jarA, 'PUT', base, { mode: 'libre', pages: [page('p1', [])] })).status, 403);
  });

  await t.test('un module studio neuf : document vide, non enregistré', async () => {
    const r = await call(jarF, 'GET', base);
    assert.equal(r.status, 200);
    assert.equal(r.data.existe, false); assert.equal(r.data.rev, 0);
    assert.equal(r.data.doc.pages.length, 1);
  });

  await t.test('première sauvegarde : crée le document, marque la leçon, nettoie le contenu dangereux', async () => {
    const r = await call(jarF, 'PUT', base, { mode: 'libre', pages: [page('p1', [
      titre('e1', '<p>Bonjour<script>alert(1)</script> <b onclick="x()">monde</b></p>'),
      { id: 'e2', type: 'image', x: 10, y: 10, w: 400, h: 300, props: { url: 'javascript:alert(1)', alt: 'a' } },
      { id: 'e3', type: 'image', x: 10, y: 10, w: 400, h: 300, props: { url: 'https://diaspoactif-media.b-cdn.net/x.jpg' } },
      { id: 'e4', type: 'bouton', x: 0, y: 0, w: 200, h: 50, props: { libelle: 'Aller', action: 'page', page: 'inexistante' } },
      { id: 'e5', type: 'inconnu', x: 0, y: 0, w: 1, h: 1, props: {} },
    ])] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    rev = r.data.rev; assert.equal(rev, 1);
    assert.equal(sql('select studio s from formation_lecons where id=?', lid)[0].s, 1);
    const els = r.data.doc.pages[0].elements;
    assert.equal(els.length, 4, 'le type inconnu est écarté');
    assert.ok(!/script|onclick/i.test(els[0].props.html), els[0].props.html);
    assert.equal(els[1].props.url, '', 'javascript: refusé');
    assert.equal(els[2].props.url, 'https://diaspoactif-media.b-cdn.net/x.jpg');
    assert.equal(els[3].props.page, '', 'page de destination inexistante');
    assert.equal(els[0].props.taille, 40, 'taille choisie conservée');
    assert.equal(els[0].props.interligne, 0, 'interligne automatique (0) jamais ramené au minimum');
    const rec = await call(jarF, 'GET', base);
    assert.equal(rec.data.existe, true); assert.equal(rec.data.doc.mode, 'libre'); assert.equal(rec.data.rev, 1);
  });

  await t.test('conflit de modification : une révision périmée est refusée, la bonne passe', async () => {
    let r = await call(jarF, 'PUT', base, { mode: 'libre', rev: 99, pages: [page('p1', [titre('e1', '<p>X</p>')])] });
    assert.equal(r.status, 409); assert.equal(r.data.code, 'conflit'); assert.equal(r.data.rev, 1);
    r = await call(jarF, 'PUT', base, { mode: 'libre', rev: 1, pages: [page('p1', [titre('e1', '<p>Version 2</p>'), { id: 'e3', type: 'image', x: 10, y: 10, w: 400, h: 300, props: { url: '' } }])] });
    assert.equal(r.status, 200); assert.equal(r.data.rev, 2); rev = 2;
  });

  await t.test('limites : trop de pages, contenu invalide', async () => {
    assert.equal((await call(jarF, 'PUT', base, { mode: 'libre', rev, pages: Array.from({ length: 61 }, (_, i) => page('p' + i, [])) })).status, 400);
    assert.equal((await call(jarF, 'PUT', base, { mode: 'libre', rev })).status, 400);
  });

  await t.test('publication contrôlée : une image sans fichier bloque, la liste des problèmes est précise', async () => {
    const r = await call(jarF, 'POST', base + '/publier');
    assert.equal(r.status, 400);
    assert.ok(r.data.problemes.some(p => /Page 1 : une image n'a pas de fichier/.test(p)), JSON.stringify(r.data));
    assert.equal((await call(jarA, 'GET', base + '/lecture')).status, 404, 'rien de publié : rien à lire');
  });

  await t.test('publier : la version publiée est lue par l\'apprenant, pas le brouillon', async () => {
    let r = await call(jarF, 'PUT', base, { mode: 'structure', rev, pages: [page('p1', [titre('e1', '<p>Publié</p>')]), page('p2', [titre('e2', '<p>Page deux</p>')])] });
    assert.equal(r.status, 200); rev = r.data.rev;
    r = await call(jarF, 'POST', base + '/publier');
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.version, 1);
    r = await call(jarA, 'GET', base + '/lecture');
    assert.equal(r.status, 200);
    assert.equal(r.data.doc.pages.length, 2); assert.equal(r.data.version, 1);
    r = await call(jarF, 'PUT', base, { mode: 'structure', rev, pages: [page('p1', [titre('e1', '<p>Brouillon modifié</p>')])] });
    assert.equal(r.status, 200); rev = r.data.rev;
    r = await call(jarA, 'GET', base + '/lecture');
    assert.ok(JSON.stringify(r.data.doc).includes('Publié'), 'l\'apprenant lit toujours la version publiée');
    assert.ok(!JSON.stringify(r.data.doc).includes('Brouillon modifié'));
    r = await call(jarF, 'GET', base + '/lecture?brouillon=1');
    assert.ok(JSON.stringify(r.data.doc).includes('Brouillon modifié'), 'le propriétaire prévisualise son brouillon');
    r = await call(jarA, 'GET', base + '/lecture?brouillon=1');
    assert.ok(!JSON.stringify(r.data.doc).includes('Brouillon modifié'), 'un apprenant ne lit jamais le brouillon');
  });

  await t.test('accès à la lecture : un compte non inscrit et un visiteur sont refusés', async () => {
    assert.equal((await call(jarX, 'GET', base + '/lecture')).status, 403);
    assert.equal((await call(anon, 'GET', base + '/lecture')).status, 403);
    sql('UPDATE formation_lecons SET apercu_gratuit=1 WHERE id=?', lid);
    assert.equal((await call(anon, 'GET', base + '/lecture')).status, 200, 'leçon offerte en aperçu gratuit');
    sql('UPDATE formation_lecons SET apercu_gratuit=0 WHERE id=?', lid);
  });

  await t.test('historique : point de restauration, puis restauration (le brouillon actuel est conservé)', async () => {
    let r = await call(jarF, 'POST', base + '/versions', { libelle: 'Avant essai' });
    assert.equal(r.status, 201);
    const liste = (await call(jarF, 'GET', base + '/versions')).data.versions;
    assert.ok(liste.length >= 2);
    assert.ok(liste.some(v => v.publiee && v.en_ligne), 'la version publiée est signalée en ligne');
    r = await call(jarF, 'POST', base + '/restaurer', { version: 1, rev: 1 });
    assert.equal(r.status, 409, 'révision périmée refusée');
    r = await call(jarF, 'POST', base + '/restaurer', { version: 1, rev });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(JSON.stringify(r.data.doc).includes('Page deux'), 'contenu de la version 1 restauré');
    assert.ok((await call(jarF, 'GET', base + '/versions')).data.versions.some(v => /Avant restauration/.test(v.libelle || '')), 'brouillon précédent conservé');
    assert.equal((await call(jarF, 'POST', base + '/restaurer', { version: 999 })).status, 404);
  });

  await t.test('dépublier : plus rien pour l\'apprenant, le brouillon et l\'historique restent', async () => {
    assert.equal((await call(jarF, 'POST', base + '/depublier')).status, 200);
    assert.equal((await call(jarA, 'GET', base + '/lecture')).status, 404);
    assert.equal((await call(jarF, 'POST', base + '/depublier')).status, 409);
    assert.equal((await call(jarF, 'GET', base)).data.existe, true);
  });
});
