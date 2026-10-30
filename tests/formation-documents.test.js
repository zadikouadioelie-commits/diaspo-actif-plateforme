/* ===========================================================
   tests/formation-documents.test.js — documents PDF et Excel affichés dans la page du cours (2026-10-30)
   ===========================================================
   Contrôle d'accès (visiteur, non inscrit, inscrit, propriétaire, aperçu gratuit), vrai type du fichier, lecture du PDF par morceaux, classeur Excel par fenêtres,
   téléchargement seulement si autorisé, hôtes non autorisés, formats refusés (.xls, macros), éléments du Studio, réglages de leçon.
   Lancer : node --test tests/formation-documents.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./_formation-harness');
const F = require('./_documents-fabrique');
const Docs = require('../server/formation-documents');
const { xls } = require('./_xls-fabrique');

let env; const DOSSIER = path.join(__dirname, '..', 'server', 'uploads'); const crees = [];
const ecrire = (nom, buf) => { fs.mkdirSync(DOSSIER, { recursive: true }); fs.writeFileSync(path.join(DOSSIER, nom), buf); crees.push(nom); return '/uploads/' + nom; };
test.before(async () => { env = await H.demarrer('documents'); });
test.after(() => { if (env) env.stop(); crees.forEach(n => { try { fs.unlinkSync(path.join(DOSSIER, n)); } catch (_) { /* déjà supprimé */ } }); });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
const brut = async (jar, urlPath, entetes) => { const h = { ...(entetes || {}) }; jar.apply(h); const r = await fetch(env.base + urlPath, { headers: h }); return { status: r.status, entetes: r.headers, buf: Buffer.from(await r.arrayBuffer()) }; };

test('documents : accès, PDF, Excel, téléchargement', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarX = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid, mid, ch; const L = {}; const ids = {};
  const base = id => `/api/formations/${fid}/lecons/${id}/document`;
  const lecon = async (cle, extra) => { const r = await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon ' + cle, type: 'telechargement', ...extra }); assert.equal(r.status, 201, JSON.stringify(r.data)); L[cle] = r.data.id; return r.data.id; };
  const pdf = F.pdf(['Premier chapitre', 'Deuxième chapitre', 'Troisième chapitre']);
  const classeur = F.classeur({ styles: F.STYLES, feuilles: [
    { nom: 'Prévisions', largeurs: [28, 16, 12], merges: ['A1:C1'], lignes: [[{ v: 'Prévision financière', s: 1 }], ['Chiffre d\'affaires', { v: 120000, s: 5 }], ['Charges', { v: 90000, s: 5 }], ['Bénéfice net', { v: 30000, s: 5, f: 'B2-B3' }]] },
    { nom: 'Détail', lignes: [['x', 'y'], [1, 2]] }] });

  await t.test('setup — formation, chapitre, leçons « document » (PDF, Excel, formats refusés), apprenant inscrit', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur'); await H.creerApprenant(env, jarA, rnd, 'Apprenant'); await H.creerApprenant(env, jarX, rnd, 'Etranger');
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Documents ' + rnd, description: 'x' })).data.id;
    mid = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'M' })).data.id;
    ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${mid}/chapitres`, { titre: 'C' })).data.id;
    const sfx = '-' + rnd;
    await lecon('pdf', { type: 'pdf', contenu_url: ecrire('doc' + sfx + '.pdf', pdf) });
    await lecon('xlsx', { contenu_url: ecrire('classeur' + sfx + '.xlsx', classeur), doc_integre: true, doc_hauteur: 500, telechargement_autorise: false });
    await lecon('xlsx_pj', { contenu_url: ecrire('classeur2' + sfx + '.xlsx', classeur), doc_integre: false, telechargement_autorise: true });
    await lecon('xls', { contenu_url: ecrire('ancien' + sfx + '.xls', xls()), doc_integre: true });
    await lecon('macros', { contenu_url: ecrire('macros' + sfx + '.xlsm', F.classeur({ macros: true, feuilles: [{ nom: 'A', lignes: [['x']] }] })), doc_integre: true });
    await lecon('faux', { type: 'pdf', contenu_url: ecrire('faux' + sfx + '.pdf', Buffer.from('<html><script>alert(1)</script></html>')) });
    await lecon('macros_deguises', { contenu_url: ecrire('deguise' + sfx + '.xlsx', F.classeur({ macros: true, feuilles: [{ nom: 'A', lignes: [['x']] }] })), doc_integre: true });
    await lecon('externe', { type: 'pdf', contenu_url: 'https://evil.example.com/a.pdf' });
    await lecon('http', { type: 'pdf', contenu_url: 'http://x.b-cdn.net/a.pdf' });
    await lecon('gratuit', { type: 'pdf', contenu_url: ecrire('gratuit' + sfx + '.pdf', pdf), apercu_gratuit: true });
    await lecon('absent', { type: 'pdf', contenu_url: '/uploads/n-existe-pas-' + rnd + '.pdf' });
    H.publier(env, fid);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
  });

  await t.test('réglages de leçon : intégré / téléchargeable / hauteur enregistrés et bornés', async () => {
    const l = sql('select doc_integre i, doc_hauteur h, telechargement_autorise t from formation_lecons where id=?', L.xlsx)[0];
    assert.equal(l.i, 1); assert.equal(l.h, 500); assert.equal(l.t, 0);
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fid}/lecons/${L.xlsx}`, { doc_hauteur: 99999 })).status, 200);
    assert.equal(sql('select doc_hauteur h from formation_lecons where id=?', L.xlsx)[0].h, 1600, 'hauteur plafonnée à 1600');
    assert.equal((await call(jarF, 'PUT', `/api/formations/${fid}/lecons/${L.xlsx}`, { doc_hauteur: 5 })).status, 200);
    assert.equal(sql('select doc_hauteur h from formation_lecons where id=?', L.xlsx)[0].h, 200, 'hauteur plancher à 200');
    await call(jarF, 'PUT', `/api/formations/${fid}/lecons/${L.xlsx}`, { doc_hauteur: 500 });
    assert.equal((await call(jarA, 'PUT', `/api/formations/${fid}/lecons/${L.xlsx}`, { doc_integre: false })).status, 403, 'un apprenant ne règle rien');
  });

  await t.test('accès : visiteur refusé, compte non inscrit refusé, apprenant inscrit et propriétaire servis', async () => {
    assert.equal((await call(anon, 'GET', base(L.pdf) + '/infos')).status, 401);
    assert.equal((await call(jarX, 'GET', base(L.pdf) + '/infos')).status, 403);
    assert.equal((await brut(anon, base(L.pdf) + '/fichier')).status, 401);
    assert.equal((await brut(jarX, base(L.pdf) + '/fichier')).status, 403);
    assert.equal((await call(jarA, 'GET', base(L.pdf) + '/infos')).status, 200);
    assert.equal((await call(jarF, 'GET', base(L.pdf) + '/infos')).status, 200);
    assert.equal((await call(jarA, 'GET', `/api/formations/${fid}/lecons/99999999/document/infos`)).status, 404);
    assert.equal((await call(jarA, 'GET', `/api/formations/99999999/lecons/${L.pdf}/document/infos`)).status, 404);
    assert.equal((await call(anon, 'GET', base(L.gratuit) + '/infos')).status, 200, 'une leçon offerte en aperçu est lisible sans compte');
  });

  await t.test('infos : par défaut un PDF s\'affiche et un fichier de téléchargement non ; hauteur et téléchargement repris du cours', async () => {
    let r = (await call(jarA, 'GET', base(L.pdf) + '/infos')).data;
    assert.equal(r.famille, 'pdf'); assert.equal(r.integre, true); assert.equal(r.telechargeable, true); assert.equal(r.hauteur, 640); assert.equal(r.peut_telecharger, true);
    r = (await call(jarA, 'GET', base(L.xlsx) + '/infos')).data;
    assert.equal(r.famille, 'excel'); assert.equal(r.integre, true); assert.equal(r.telechargeable, false); assert.equal(r.hauteur, 500); assert.equal(r.peut_telecharger, false);
    r = (await call(jarA, 'GET', base(L.xlsx_pj) + '/infos')).data;
    assert.equal(r.integre, false); assert.equal(r.peut_telecharger, true); assert.equal(r.erreur, undefined);
    assert.equal((await call(jarF, 'GET', base(L.xlsx) + '/infos')).data.peut_telecharger, true, 'le propriétaire récupère toujours son fichier');
    r = (await call(jarA, 'GET', base(L.xls) + '/infos')).data; assert.equal(r.famille, 'excel', 'un ancien classeur se montre dans la visionneuse Excel'); assert.equal(r.format, 'xls'); assert.equal(r.erreur, undefined);
    r = (await call(jarA, 'GET', base(L.macros) + '/infos')).data; assert.equal(r.erreur.code, 'macros');
  });

  await t.test('PDF : servi en entier ou par morceaux, type contrôlé sur les octets', async () => {
    const r = await brut(jarA, base(L.pdf) + '/fichier');
    assert.equal(r.status, 200); assert.equal(r.entetes.get('content-type'), 'application/pdf'); assert.equal(r.entetes.get('accept-ranges'), 'bytes');
    assert.equal(r.entetes.get('x-content-type-options'), 'nosniff'); assert.match(r.entetes.get('cache-control'), /private/); assert.ok(r.buf.equals(pdf));
    const m = await brut(jarA, base(L.pdf) + '/fichier', { Range: 'bytes=0-9' });
    assert.equal(m.status, 206); assert.equal(m.buf.length, 10); assert.equal(m.entetes.get('content-range'), `bytes 0-9/${pdf.length}`); assert.equal(m.buf.toString(), pdf.slice(0, 10).toString());
    const fin = await brut(jarA, base(L.pdf) + '/fichier', { Range: 'bytes=-20' }); assert.equal(fin.status, 206); assert.ok(fin.buf.equals(pdf.slice(-20)));
    assert.equal((await brut(jarA, base(L.pdf) + '/fichier', { Range: 'bytes=99999999-' })).status, 416);
    assert.equal((await brut(jarA, base(L.faux) + '/fichier')).status, 415, 'un faux PDF (page HTML nommée .pdf) est refusé');
    assert.equal((await brut(jarA, base(L.xlsx) + '/fichier')).status, 415, 'le point d\'accès PDF ne sert pas un classeur');
    assert.equal((await brut(jarA, base(L.absent) + '/fichier')).status, 404);
  });

  await t.test('hôtes : seul l\'hébergeur de la plateforme est appelé (pas d\'adresse choisie à la volée)', async () => {
    let r = await call(jarA, 'GET', base(L.externe) + '/infos'); assert.equal(r.status, 200);
    r = await brut(jarA, base(L.externe) + '/fichier'); assert.equal(r.status, 400); assert.match(r.buf.toString(), /hote_non_autorise/);
    r = await brut(jarA, base(L.http) + '/fichier'); assert.equal(r.status, 400);
  });

  await t.test('Excel : feuilles, fenêtres de lignes, formules, fusions ; macros et faux classeurs refusés', async () => {
    const m = (await call(jarA, 'GET', base(L.xlsx) + '/classeur')).data;
    assert.deepEqual(m.feuilles.map(f => f.nom), ['Prévisions', 'Détail']); assert.equal(m.feuilles[0].lignes, 4); assert.ok(m.limites.length >= 3); assert.equal(m.styles[1].bg, '#1F4E79');
    const w = (await call(jarA, 'GET', base(L.xlsx) + '/feuille?feuille=0&debut=0&n=100')).data;
    assert.equal(w.total, 4); assert.deepEqual(w.merges, [{ r: 0, c: 0, rs: 1, cs: 3 }]);
    assert.equal(w.lignes[3][1].f, 'B2-B3'); assert.equal(w.lignes[3][1].t, '30 000,00 €'); assert.equal(w.lignes[1][0].t, 'Chiffre d\'affaires');
    const w2 = (await call(jarA, 'GET', base(L.xlsx) + '/feuille?feuille=1&debut=1&n=1')).data; assert.equal(w2.lignes[0][1].t, '2');
    assert.equal((await call(jarA, 'GET', base(L.xlsx) + '/feuille?feuille=7')).status, 404);
    assert.equal((await call(jarX, 'GET', base(L.xlsx) + '/classeur')).status, 403);
    assert.equal((await call(anon, 'GET', base(L.xlsx) + '/feuille')).status, 401);
    let r = await call(jarA, 'GET', base(L.xls) + '/classeur'); assert.equal(r.status, 200); assert.deepEqual(r.data.feuilles.map(f => f.nom), ['Prévisions', 'Détail']);
    const wx = (await call(jarA, 'GET', base(L.xls) + '/feuille?feuille=0&debut=0&n=100')).data; assert.equal(wx.lignes[0][0].t, 'Prévision financière'); assert.equal(wx.merges.length, 1);
    r = await call(jarA, 'GET', base(L.macros) + '/classeur'); assert.equal(r.status, 415); assert.equal(r.data.code, 'macros');
    r = await call(jarA, 'GET', base(L.macros_deguises) + '/classeur'); assert.equal(r.status, 413, 'un classeur à macros renommé en .xlsx est refusé sur son contenu'); assert.equal(r.data.code, 'macros');
    r = await call(jarA, 'GET', base(L.pdf) + '/classeur'); assert.equal(r.status, 415);
    r = await call(jarA, 'GET', base(L.xlsx_pj) + '/classeur'); assert.equal(r.status, 403); assert.equal(r.data.code, 'non_integre', 'pas d\'affichage intégré : le classeur n\'est pas lu dans la page');
    assert.equal((await call(jarF, 'GET', base(L.xlsx_pj) + '/classeur')).status, 200, 'le propriétaire prévisualise toujours');
  });

  await t.test('téléchargement : seulement si le formateur l\'autorise', async () => {
    assert.equal((await brut(jarA, base(L.xlsx) + '/telecharger')).status, 403, 'Excel intégré mais non téléchargeable');
    assert.equal((await brut(jarX, base(L.pdf) + '/telecharger')).status, 403, 'ni accès ni téléchargement');
    const r = await brut(jarA, base(L.pdf) + '/telecharger');
    assert.equal(r.status, 200); assert.match(r.entetes.get('content-disposition'), /^attachment; filename=".*\.pdf"$/); assert.ok(r.buf.equals(pdf));
    const x = await brut(jarA, base(L.xlsx_pj) + '/telecharger'); assert.equal(x.status, 200); assert.match(x.entetes.get('content-disposition'), /\.xlsx"$/); assert.ok(x.buf.equals(classeur));
    assert.equal((await brut(jarF, base(L.xlsx) + '/telecharger')).status, 200, 'le propriétaire récupère toujours son fichier');
    assert.equal((await brut(jarA, base(L.pdf) + '/fichier')).status, 200);
    /* intégré coupé : le PDF ne passe plus par le lecteur (téléchargement seul) */
    await call(jarF, 'PUT', `/api/formations/${fid}/lecons/${L.pdf}`, { doc_integre: false });
    assert.equal((await brut(jarA, base(L.pdf) + '/fichier')).status, 403);
    assert.equal((await brut(jarF, base(L.pdf) + '/fichier')).status, 200, 'aperçu du propriétaire');
    assert.equal((await brut(jarA, base(L.pdf) + '/telecharger')).status, 200);
    await call(jarF, 'PUT', `/api/formations/${fid}/lecons/${L.pdf}`, { doc_integre: true });
  });

  await t.test('Studio : élément « Document » intégré et téléchargeable, version publiée seulement pour l\'apprenant', async () => {
    const lid = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon studio', type: 'texte' })).data.id;
    const urlX = ecrire('studio-' + rnd + '.xlsx', classeur), urlP = ecrire('studio2-' + rnd + '.pdf', pdf);
    const doc = el => JSON.stringify({ mode: 'libre', pages: [{ id: 'p1', titre: '', fond: '', elements: el }] });
    const e = (id, props) => ({ id, type: 'document', x: 0, y: 0, w: 700, h: 500, z: 1, props });
    const brouillon = doc([e('d1', { url: urlX, nom: 'Prévisions', integre: true, telechargeable: true, hauteur: 700 }), e('d2', { url: urlP, nom: 'Notice', mode: 'telechargement' }), e('d3', { url: urlP, nom: 'Ancien lecteur', mode: 'lecteur' }), e('d4', { url: urlP, nom: 'Brouillon seul', integre: true })]);
    const publie = doc([e('d1', { url: urlX, nom: 'Prévisions', integre: true, telechargeable: true, hauteur: 700 }), e('d2', { url: urlP, nom: 'Notice', mode: 'telechargement' }), e('d3', { url: urlP, nom: 'Ancien lecteur', mode: 'lecteur' })]);
    const d = sql("insert into formation_studio_docs (lecon_id, formation_id, mode, contenu_json, rev, updated_by) values (?,?,'libre',?,1,1)", lid, fid, brouillon);
    sql("insert into formation_studio_versions (doc_id, version, mode, contenu_json, publiee) values (?,1,'libre',?,1)", Number(d.lastInsertRowid), publie);
    sql("update formation_studio_docs set publiee_version=1 where id=?", Number(d.lastInsertRowid)); sql('update formation_lecons set studio=1 where id=?', lid);
    const b = base(lid);
    let r = (await call(jarA, 'GET', b + '/infos?element=d1')).data; assert.equal(r.famille, 'excel'); assert.equal(r.integre, true); assert.equal(r.telechargeable, true); assert.equal(r.hauteur, 700);
    r = (await call(jarA, 'GET', b + '/infos?element=d2')).data; assert.equal(r.integre, false, 'ancien mode « telechargement »'); assert.equal(r.telechargeable, true);
    r = (await call(jarA, 'GET', b + '/infos?element=d3')).data; assert.equal(r.integre, true, 'ancien mode « lecteur »'); assert.equal(r.telechargeable, false);
    assert.equal((await call(jarA, 'GET', b + '/infos?element=d4')).status, 404, 'l\'apprenant ne voit pas un élément seulement présent dans le brouillon');
    assert.equal((await call(jarA, 'GET', b + '/infos?element=d4&brouillon=1')).status, 404, 'le paramètre « brouillon » ne s\'applique qu\'au propriétaire');
    assert.equal((await call(jarF, 'GET', b + '/infos?element=d4&brouillon=1')).status, 200);
    assert.equal((await call(jarA, 'GET', b + '/infos')).status, 404, 'élément obligatoire pour une leçon du Studio');
    assert.equal((await call(jarA, 'GET', b + '/infos?element=inconnu')).status, 404);
    const w = await call(jarA, 'GET', b + '/feuille?element=d1&feuille=0'); assert.equal(w.status, 200); assert.equal(w.data.lignes[3][1].f, 'B2-B3');
    assert.equal((await brut(jarA, b + '/fichier?element=d3')).status, 200);
    assert.equal((await brut(jarA, b + '/fichier?element=d2')).status, 403, 'document seulement téléchargeable : pas de lecture intégrée');
    assert.equal((await brut(jarA, b + '/telecharger?element=d2')).status, 200);
    assert.equal((await brut(jarA, b + '/telecharger?element=d3')).status, 403);
    assert.equal((await call(jarX, 'GET', b + '/infos?element=d1')).status, 403);
  });

  await t.test('le Studio enregistre « intégré », « téléchargeable » et la hauteur (anciens documents : repli sur le mode)', async () => {
    const lid = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon studio 2', type: 'texte' })).data.id;
    const g = await call(jarF, 'GET', `/api/formations/${fid}/lecons/${lid}/studio`);
    const el = (id, props) => ({ id, type: 'document', x: 0, y: 0, w: 700, h: 500, z: 1, props });
    const r = await call(jarF, 'PUT', `/api/formations/${fid}/lecons/${lid}/studio`, { mode: 'libre', rev: g.data.rev, pages: [{ id: 'p1', titre: '', elements: [
      el('a', { url: 'https://x.b-cdn.net/a.pdf', integre: true, telechargeable: true, hauteur: 99999 }), el('b', { url: 'https://x.b-cdn.net/b.pdf', mode: 'telechargement' }),
      el('c', { url: 'https://x.b-cdn.net/c.pdf', mode: 'lecteur' }), el('d', { url: 'https://x.b-cdn.net/d.pdf', integre: false, telechargeable: false, hauteur: 3 })] }] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const p = Object.fromEntries(r.data.doc.pages[0].elements.map(x => [x.id, x.props]));
    assert.deepEqual([p.a.integre, p.a.telechargeable, p.a.hauteur, p.a.mode], [true, true, 1600, 'lecteur']);
    assert.deepEqual([p.b.integre, p.b.telechargeable, p.b.mode], [false, true, 'telechargement']);
    assert.deepEqual([p.c.integre, p.c.telechargeable, p.c.hauteur], [true, false, 640]);
    assert.deepEqual([p.d.integre, p.d.telechargeable, p.d.hauteur], [false, true, 200], 'ni l\'un ni l\'autre : le document reste accessible en téléchargement');
  });

  await t.test('utilitaires : famille de fichier d\'après l\'adresse, description d\'une leçon', () => {
    assert.equal(Docs.famille('https://x.b-cdn.net/a/B.PDF?x=1'), 'pdf'); assert.equal(Docs.famille('/uploads/t.xlsx'), 'excel'); assert.equal(Docs.famille('t.xls'), 'xls'); assert.equal(Docs.famille('t.xlsm'), 'xlsm'); assert.equal(Docs.famille('t.docx'), 'autre'); assert.equal(Docs.famille(''), 'autre');
    assert.equal(Docs.typeReel(Buffer.from('%PDF-1.4')), 'pdf'); assert.equal(Docs.typeReel(Buffer.from([0x50, 0x4b, 3, 4])), 'zip'); assert.equal(Docs.typeReel(Buffer.from('hello world')), 'autre');
    assert.equal(Docs.decrire({ studio: 0, type: 'texte', contenu_url: 'x.pdf' }), null, 'une leçon de texte n\'a pas de document');
  });
});
