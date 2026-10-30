/* ===========================================================
   tests/formation-prive.test.js — Formation Diaspora, lot F : fichiers privés des cours (2026-10-30)
   ===========================================================
   Envoi d'un document de cours dans un stockage PRIVÉ (faux stockage Bunny local), lecture par la visionneuse seulement, adresses jamais livrées
   aux apprenants (plan de la formation, aperçu gratuit, Studio), propriétaire inchangé, bibliothèque de médias, références refusées si invalides.
   Lancer : node --test tests/formation-prive.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const H = require('./_formation-harness');
const F = require('./_documents-fabrique');
const Prive = require('../server/formation-prive');

/* Faux stockage privé : garde les fichiers en mémoire, exige la clé d'accès. */
const fichiers = new Map(); const journal = [];
const faux = http.createServer((req, res) => {
  const morceaux = []; req.on('data', c => morceaux.push(c)); req.on('end', () => {
    journal.push({ methode: req.method, url: req.url, cle: req.headers.accesskey });
    if (req.headers.accesskey !== 'cle-secrete-test') { res.writeHead(401); return res.end(); }
    if (req.method === 'PUT') { fichiers.set(req.url, Buffer.concat(morceaux)); res.writeHead(201); return res.end('{}'); }
    const f = fichiers.get(req.url);
    if (!f) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Length': f.length }); res.end(f);
  });
});

let env;
test.before(async () => {
  await new Promise(r => faux.listen(0, '127.0.0.1', r));
  process.env.BUNNY_PRIVATE_URL = 'http://127.0.0.1:' + faux.address().port;
  process.env.BUNNY_PRIVATE_ZONE = 'zone-privee';
  process.env.BUNNY_PRIVATE_KEY = 'cle-secrete-test';
  env = await H.demarrer('prive');
});
test.after(() => { if (env) env.stop(); faux.close(); });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
const brut = async (jar, urlPath, entetes) => { const h = { ...(entetes || {}) }; jar.apply(h); const r = await fetch(env.base + urlPath, { headers: h }); return { status: r.status, entetes: r.headers, buf: Buffer.from(await r.arrayBuffer()) }; };
async function envoyer(jar, nom, buf, type) {
  const fd = new FormData(); fd.append('document', new Blob([buf], { type: type || 'application/octet-stream' }), nom);
  const h = {}; if (jar) jar.apply(h);
  const r = await fetch(env.base + '/api/formateur/document-cours', { method: 'POST', headers: h, body: fd });
  let data = null; try { data = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, data };
}

test('fichiers privés des cours', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarX = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid, ch, refPdf, refXlsx, lPdf, lXlsx, lApercu, lStudio;
  const pdf = F.pdf(['Page un du support privé', 'Page deux']);
  const classeur = F.classeur({ styles: F.STYLES, feuilles: [{ nom: 'Prévisions', lignes: [['Bénéfice net', { v: 30000, s: 5 }]] }] });
  const base = id => `/api/formations/${fid}/lecons/${id}/document`;

  await t.test('envoi : réservé aux créateurs, formats vérifiés sur les octets, nom aléatoire dans le stockage privé', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur'); await H.creerApprenant(env, jarA, rnd, 'Apprenant'); await H.creerApprenant(env, jarX, rnd, 'Etranger');
    assert.equal((await envoyer(anon, 'a.pdf', pdf)).status, 401);
    assert.equal((await envoyer(jarA, 'a.pdf', pdf)).status, 403, 'un apprenant qui ne possède aucune formation ne dépose rien');
    assert.equal((await envoyer(jarF, 'faux.pdf', Buffer.from('<html><script>alert(1)</script></html>'))).status, 400, 'une page web déguisée en PDF est refusée');
    assert.equal((await envoyer(jarF, 'image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).status, 400, 'les images ne passent pas par cette route');
    assert.equal((await envoyer(jarF, 'mauvais.xlsx', Buffer.from('pas un classeur'))).status, 400);
    assert.equal((await envoyer(jarF, 'macros.exe', classeur)).status, 400, 'extension non autorisée');
    const a = await envoyer(jarF, 'Support de cours.pdf', pdf);
    assert.equal(a.status, 200, JSON.stringify(a.data)); assert.equal(a.data.prive, true);
    assert.match(a.data.url, Prive.REF); refPdf = a.data.url;
    const b = await envoyer(jarF, 'prevision.xlsx', classeur);
    assert.equal(b.status, 200); refXlsx = b.data.url;
    assert.notEqual(refPdf, (await envoyer(jarF, 'Support de cours.pdf', pdf)).data.url, 'deux envois du même fichier : deux noms aléatoires');
    const put = journal.filter(j => j.methode === 'PUT');
    assert.ok(put.length >= 3 && put.every(j => j.cle === 'cle-secrete-test' && j.url.startsWith('/zone-privee/formations/')), 'déposé dans la zone privée avec la clé du serveur');
    assert.ok(!/Support/.test(refPdf), 'le nom d\'origine n\'apparaît pas dans la référence');
  });

  await t.test('setup — leçons PDF et Excel sur référence privée, aperçu gratuit, apprenant inscrit', async () => {
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Privé ' + rnd, description: 'x' })).data.id;
    const mid = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'M' })).data.id;
    ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${mid}/chapitres`, { titre: 'C' })).data.id;
    const lecon = async extra => { const r = await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'L', ...extra }); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data.id; };
    lPdf = await lecon({ type: 'pdf', contenu_url: refPdf, telechargement_autorise: true });
    lXlsx = await lecon({ type: 'telechargement', contenu_url: refXlsx, doc_integre: true, telechargement_autorise: false });
    lApercu = await lecon({ type: 'pdf', contenu_url: refPdf, apercu_gratuit: true });
    lStudio = await lecon({ type: 'texte' });
    H.publier(env, fid);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
  });

  await t.test('l\'apprenant lit le PDF et le classeur par la visionneuse ; un tiers n\'y a pas accès', async () => {
    const infos = await call(jarA, 'GET', base(lPdf) + '/infos');
    assert.equal(infos.status, 200); assert.equal(infos.data.famille, 'pdf');
    const f = await brut(jarA, base(lPdf) + '/fichier');
    assert.equal(f.status, 200); assert.equal(f.entetes.get('content-type'), 'application/pdf'); assert.ok(f.buf.equals(pdf), 'octets identiques à ceux déposés');
    const morceau = await brut(jarA, base(lPdf) + '/fichier', { Range: 'bytes=0-9' });
    assert.equal(morceau.status, 206); assert.equal(morceau.buf.length, 10);
    const cl = await call(jarA, 'GET', base(lXlsx) + '/classeur');
    assert.equal(cl.status, 200); assert.equal(cl.data.feuilles[0].nom, 'Prévisions');
    const dl = await brut(jarA, base(lPdf) + '/telecharger');
    assert.equal(dl.status, 200); assert.ok(dl.buf.equals(pdf));
    assert.equal((await brut(jarA, base(lXlsx) + '/telecharger')).status, 403, 'téléchargement non autorisé par le formateur');
    assert.equal((await brut(jarX, base(lPdf) + '/fichier')).status, 403);
    assert.equal((await brut(anon, base(lPdf) + '/fichier')).status, 401);
    assert.ok(journal.filter(j => j.methode === 'GET').every(j => j.cle === 'cle-secrete-test'), 'le stockage n\'est lu qu\'avec la clé du serveur');
  });

  await t.test('l\'adresse n\'est livrée ni au plan de la formation, ni à l\'aperçu gratuit ; le propriétaire la garde', async () => {
    const plan = await call(jarA, 'GET', `/api/formations/${fid}/suivre`);
    assert.equal(plan.status, 200);
    assert.ok(!JSON.stringify(plan.data).includes('prive:'), 'aucune référence privée dans la réponse faite à l\'apprenant');
    const lecons = plan.data.modules.flatMap(m => m.chapitres.flatMap(c => c.lecons));
    const l = lecons.find(x => x.id === lPdf);
    assert.equal(l.contenu_url, null); assert.equal(l.a_document, 1);
    const prop = await call(jarF, 'GET', `/api/formations/${fid}/suivre`);
    assert.equal(prop.data.modules.flatMap(m => m.chapitres.flatMap(c => c.lecons)).find(x => x.id === lPdf).contenu_url, refPdf, 'le propriétaire garde la vraie référence');
    const ap = await call(anon, 'GET', `/api/formations/${fid}/decouverte`);
    assert.equal(ap.status, 200);
    assert.ok(!JSON.stringify(ap.data).includes('prive:'));
    const la = ap.data.modules.flatMap(m => m.chapitres.flatMap(c => c.lecons)).find(x => x.id === lApercu);
    assert.equal(la.contenu_url, null); assert.equal(la.a_document, 1);
    assert.equal((await brut(anon, base(lApercu) + '/fichier')).status, 200, 'la leçon offerte reste lisible par la visionneuse');
  });

  await t.test('Studio : l\'élément « Document » est masqué pour l\'apprenant, intact pour le propriétaire ; lu par la visionneuse', async () => {
    const g = await call(jarF, 'GET', `/api/formations/${fid}/lecons/${lStudio}/studio`);
    const r = await call(jarF, 'PUT', `/api/formations/${fid}/lecons/${lStudio}/studio`, { mode: 'structure', rev: g.data.rev, pages: [{ id: 'p1', titre: '', elements: [
      { id: 'doc1', type: 'document', x: 0, y: 0, w: 700, h: 500, z: 1, props: { url: refPdf, nom: 'Support', integre: true, telechargeable: true } },
      { id: 'doc2', type: 'document', x: 0, y: 0, w: 700, h: 500, z: 1, props: { url: 'prive:formations/1/../../secret.pdf', nom: 'Piège' } },
      { id: 'doc3', type: 'document', x: 0, y: 0, w: 700, h: 500, z: 1, props: { url: 'https://diaspoactif-media.b-cdn.net/documents/1-2.pdf', nom: 'Public' } }] }] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const el = Object.fromEntries(r.data.doc.pages[0].elements.map(e => [e.id, e.props.url]));
    assert.equal(el.doc1, refPdf, 'référence privée conservée par l\'enregistrement'); assert.equal(el.doc2, '', 'référence piégée refusée'); assert.ok(el.doc3.startsWith('https://'));
    /* le document au lien piégé empêche la publication (« un document n'a pas de fichier ») : on le retire, puis on publie */
    const sans = await call(jarF, 'PUT', `/api/formations/${fid}/lecons/${lStudio}/studio`, { mode: 'structure', rev: r.data.rev, pages: [{ id: 'p1', titre: '', elements: r.data.doc.pages[0].elements.filter(e => e.id !== 'doc2') }] });
    assert.equal(sans.status, 200, JSON.stringify(sans.data));
    const pub = await call(jarF, 'POST', `/api/formations/${fid}/lecons/${lStudio}/studio/publier`, {}); assert.equal(pub.status, 200, JSON.stringify(pub.data));
    const lecture = await call(jarA, 'GET', `/api/formations/${fid}/lecons/${lStudio}/studio/lecture`);
    assert.equal(lecture.status, 200);
    assert.ok(!JSON.stringify(lecture.data).includes('prive:'), 'rien de privé dans la lecture de l\'apprenant');
    const urls = Object.fromEntries(lecture.data.doc.pages[0].elements.map(e => [e.id, e.props.url]));
    assert.equal(urls.doc1, 'document:doc1.pdf', 'adresse factice : seule l\'extension reste');
    const proprio = await call(jarF, 'GET', `/api/formations/${fid}/lecons/${lStudio}/studio/lecture?brouillon=1`);
    assert.equal(proprio.data.doc.pages[0].elements[0].props.url, refPdf, 'l\'aperçu du propriétaire garde la vraie référence');
    const f = await brut(jarA, base(lStudio) + '/fichier?element=doc1');
    assert.equal(f.status, 200); assert.ok(f.buf.equals(pdf), 'le PDF du Studio est lu depuis le stockage privé');
    assert.equal((await brut(jarX, base(lStudio) + '/fichier?element=doc1')).status, 403);
  });

  await t.test('lot I — « Fichier à télécharger » privé : masqué, servi par la plateforme avec le bon type (Word, PowerPoint), contrôle des octets et de la propriété', async () => {
    const zip = n => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('contenu office ' + n + ' '.repeat(40))]);
    const docx = zip('word'), pptx = zip('powerpoint');
    const rd = await envoyer(jarF, 'Consignes.docx', docx), rp = await envoyer(jarF, 'Cours.pptx', pptx);
    assert.equal(rd.status, 200, JSON.stringify(rd.data)); assert.equal(rd.data.prive, true); assert.equal(rp.status, 200);
    const l = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Fichiers', type: 'texte' })).data.id;
    const g = await call(jarF, 'GET', `/api/formations/${fid}/lecons/${l}/studio`);
    const faussaire = 'prive:formations/99999/' + 'a'.repeat(32) + '.docx';
    const elements = [
      { id: 'f1', type: 'fichier', x: 0, y: 0, w: 440, h: 72, z: 1, props: { url: rd.data.url, nom: 'Consignes' } },
      { id: 'f2', type: 'fichier', x: 0, y: 0, w: 440, h: 72, z: 1, props: { url: rp.data.url, nom: 'Cours' } },
      { id: 'f3', type: 'fichier', x: 0, y: 0, w: 440, h: 72, z: 1, props: { url: faussaire, nom: 'Volé' } },
      { id: 'f4', type: 'fichier', x: 0, y: 0, w: 440, h: 72, z: 1, props: { url: 'https://exemple.org/public.pdf', nom: 'Public' } },
      { id: 'd1', type: 'document', x: 0, y: 0, w: 700, h: 500, z: 1, props: { url: rd.data.url, nom: 'Consignes en pièce jointe', integre: false, telechargeable: true } }];
    const r = await call(jarF, 'PUT', `/api/formations/${fid}/lecons/${l}/studio`, { mode: 'structure', rev: g.data.rev, pages: [{ id: 'p1', titre: '', elements }] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const urls = Object.fromEntries(r.data.doc.pages[0].elements.map(e => [e.id, e.props.url]));
    assert.equal(urls.f1, rd.data.url, 'référence privée conservée'); assert.equal(urls.f3, '', 'la référence privée d\'un autre compte est refusée'); assert.equal(urls.f4, 'https://exemple.org/public.pdf', 'une adresse https extérieure reste un lien direct');
    const sans = await call(jarF, 'PUT', `/api/formations/${fid}/lecons/${l}/studio`, { mode: 'structure', rev: r.data.rev, pages: [{ id: 'p1', titre: '', elements: r.data.doc.pages[0].elements.filter(e => e.id !== 'f3') }] });
    assert.equal(sans.status, 200, JSON.stringify(sans.data));
    assert.equal((await call(jarF, 'POST', `/api/formations/${fid}/lecons/${l}/studio/publier`, {})).status, 200);
    const lecture = await call(jarA, 'GET', `/api/formations/${fid}/lecons/${l}/studio/lecture`);
    assert.equal(lecture.status, 200); assert.ok(!JSON.stringify(lecture.data).includes('prive:'), 'rien de privé dans la lecture de l\'apprenant');
    const vu = Object.fromEntries(lecture.data.doc.pages[0].elements.map(e => [e.id, e.props.url]));
    assert.equal(vu.f1, 'document:f1.docx'); assert.equal(vu.f2, 'document:f2.pptx'); assert.equal(vu.f4, 'https://exemple.org/public.pdf', 'le lien public n\'est pas masqué');
    const proprio = await call(jarF, 'GET', `/api/formations/${fid}/lecons/${l}/studio/lecture?brouillon=1`);
    assert.equal(proprio.data.doc.pages[0].elements[0].props.url, rd.data.url, 'le propriétaire garde la vraie référence');
    /* téléchargement : bon type MIME et bonne extension, octets identiques */
    const w = await brut(jarA, base(l) + '/telecharger?element=f1');
    assert.equal(w.status, 200); assert.equal(w.entetes.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.match(w.entetes.get('content-disposition'), /Consignes\.docx"/); assert.ok(w.buf.equals(docx));
    const p = await brut(jarA, base(l) + '/telecharger?element=f2');
    assert.equal(p.status, 200); assert.equal(p.entetes.get('content-type'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation'); assert.match(p.entetes.get('content-disposition'), /Cours\.pptx"/);
    const d = await brut(jarA, base(l) + '/telecharger?element=d1');
    assert.equal(d.status, 200, 'un élément « Document » Word est lui aussi servi avec le bon type'); assert.match(d.entetes.get('content-disposition'), /\.docx"/);
    assert.equal((await brut(jarX, base(l) + '/telecharger?element=f1')).status, 403, 'un non-inscrit ne télécharge rien');
    assert.equal((await brut(anon, base(l) + '/telecharger?element=f1')).status, 401);
    assert.equal((await brut(jarA, base(l) + '/fichier?element=f1')).status, 415, 'une pièce jointe Word ne se lit pas comme un PDF');
    const inf = await call(jarA, 'GET', base(l) + '/infos?element=f1'); assert.equal(inf.status, 200); assert.equal(inf.data.peut_telecharger, true); assert.equal(inf.data.integre, false);
    /* le contenu doit correspondre à l'extension : un PDF déguisé en .docx n'est pas servi */
    const cle = [...fichiers.keys()].find(k => k.includes(rd.data.url.split('/').pop())); assert.ok(cle, 'fichier retrouvé dans le faux stockage');
    fichiers.set(cle, pdf);
    /* le cache d'octets du serveur garde un fichier 5 minutes : on teste donc la fraude sur un second fichier, jamais lu avant */
    const rx = await envoyer(jarF, 'Autre.docx', zip('autre')); fichiers.set([...fichiers.keys()].find(k => k.includes(rx.data.url.split('/').pop())), pdf);
    const g2 = await call(jarF, 'GET', `/api/formations/${fid}/lecons/${l}/studio`);
    const m = await call(jarF, 'PUT', `/api/formations/${fid}/lecons/${l}/studio`, { mode: 'structure', rev: g2.data.rev, pages: [{ id: 'p1', titre: '', elements: [...g2.data.doc.pages[0].elements, { id: 'f5', type: 'fichier', x: 0, y: 0, w: 440, h: 72, z: 1, props: { url: rx.data.url, nom: 'Faux' } }] }] });
    assert.equal(m.status, 200, JSON.stringify(m.data));
    assert.equal((await call(jarF, 'POST', `/api/formations/${fid}/lecons/${l}/studio/publier`, {})).status, 200);
    const faux2 = await brut(jarA, base(l) + '/telecharger?element=f5');
    assert.equal(faux2.status, 415, 'contenu PDF sous une extension .docx : refusé');
  });

  await t.test('bibliothèque de médias : une référence privée n\'entre que dans la bibliothèque de son déposant', async () => {
    const ok = await call(jarF, 'POST', '/api/formateur/medias', { type: 'document', url: refPdf, nom: 'Support privé', taille: pdf.length });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    const autre = await call(jarF, 'POST', '/api/formateur/medias', { type: 'document', url: 'prive:formations/99999/' + 'a'.repeat(32) + '.pdf', nom: 'Volé' });
    assert.equal(autre.status, 400, 'le fichier privé d\'un autre compte est refusé');
    const piege = await call(jarF, 'POST', '/api/formateur/medias', { type: 'image', url: refPdf, nom: 'x' });
    assert.equal(piege.status, 400, 'une référence privée n\'est pas une image');
  });

  await t.test('références invalides et stockage injoignable : messages clairs, aucune fuite', async () => {
    const l = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Piège', type: 'pdf', contenu_url: 'prive:formations/1/../../etc.pdf' })).data.id;
    const r = await brut(jarF, base(l) + '/fichier');
    assert.equal(r.status, 400, 'référence invalide refusée à la lecture');
    const inconnu = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Absent', type: 'pdf', contenu_url: 'prive:formations/1/' + 'b'.repeat(32) + '.pdf' })).data.id;
    const absent = await brut(jarF, base(inconnu) + '/fichier');
    assert.equal(absent.status, 404);
    assert.equal(Prive.estRef('prive:x'), true); assert.equal(Prive.estRef('https://x'), false);
    assert.deepEqual(Prive.masquerLecons([{ chapitres: [{ lecons: [{ type: 'pdf', contenu_url: 'a.pdf' }, { type: 'video', contenu_url: 'v.mp4' }] }] }])[0].chapitres[0].lecons.map(x => [x.contenu_url, x.a_document || 0]), [[null, 1], ['v.mp4', 0]], 'seuls les documents sont masqués');
    assert.equal(Prive.masquerStudio({ pages: [{ elements: [{ id: 'z', type: 'document', props: { url: 'https://x.b-cdn.net/A.XLSX?x=1' } }, { id: 'y', type: 'image', props: { url: 'https://x/i.png' } }] }] }).pages[0].elements.map(e => e.props.url).join('|'), 'document:z.xlsx|https://x/i.png');
  });
});

test('migration : repérage et réécriture des documents (fonctions pures du script)', () => {
  const M = require('../server/migrer-documents-prives');
  assert.equal(M.migrable('https://diaspoactif-media.b-cdn.net/documents/1-2.pdf'), true);
  assert.equal(M.migrable('https://diaspoactif-media.b-cdn.net/documents/1-2.XLSX?x=1'), true);
  assert.equal(M.migrable('https://diaspoactif-media.b-cdn.net/posts/1-2.png'), false, 'une image n\'est pas un document de cours');
  assert.equal(M.migrable('https://exemple.org/a.pdf'), false, 'hôte extérieur');
  assert.equal(M.migrable('prive:formations/1/' + 'a'.repeat(32) + '.pdf'), false, 'déjà migré');
  const json = JSON.stringify({ pages: [{ elements: [
    { id: 'a', type: 'document', props: { url: 'https://x.b-cdn.net/documents/1-1.pdf', nom: 'A' } },
    { id: 'b', type: 'document', props: { url: 'https://x.b-cdn.net/documents/1-2.xlsx' } },
    { id: 'c', type: 'image', props: { url: 'https://x.b-cdn.net/posts/1-3.png' } },
    { id: 'd', type: 'fichier', props: { url: 'https://x.b-cdn.net/documents/1-4.pdf' } }] }] });
  assert.deepEqual(M.urlsDuStudio(json), ['https://x.b-cdn.net/documents/1-1.pdf', 'https://x.b-cdn.net/documents/1-2.xlsx', 'https://x.b-cdn.net/documents/1-4.pdf'], 'éléments « Document » et « Fichier à télécharger », jamais les images');
  const ref = 'prive:formations/1/' + 'c'.repeat(32) + '.pdf';
  const neuf = JSON.parse(M.reecrireStudio(json, { 'https://x.b-cdn.net/documents/1-1.pdf': ref }));
  const e = Object.fromEntries(neuf.pages[0].elements.map(x => [x.id, x.props.url]));
  assert.equal(e.a, ref); assert.equal(e.b, 'https://x.b-cdn.net/documents/1-2.xlsx', 'adresse non copiée : laissée telle quelle');
  assert.equal(e.c, 'https://x.b-cdn.net/posts/1-3.png'); assert.equal(e.d, 'https://x.b-cdn.net/documents/1-4.pdf', 'adresse non copiée : laissée telle quelle');
  assert.equal(M.reecrireStudio(json, {}), null, 'rien à changer : pas de réécriture');
  assert.equal(M.reecrireStudio('pas du json', { a: 'b' }), null);
  assert.match(Prive.creerRef(42, 'PDF'), Prive.REF); assert.notEqual(Prive.creerRef(42, 'pdf'), Prive.creerRef(42, 'pdf'));
});

test('audio de cours : type vérifié sur les octets, réservé aux créateurs', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), anon = H.cookieJar();
  await H.creerFormateur(env, jarF, rnd, 'FormateurAudio'); await H.creerApprenant(env, jarA, rnd, 'ApprenantAudio');
  const audio = async (jar, nom, buf) => {
    const fd = new FormData(); fd.append('audio', new Blob([buf]), nom);
    const h = {}; jar.apply(h);
    const r = await fetch(env.base + '/api/formateur/audio-cours', { method: 'POST', headers: h, body: fd });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(40)]);
  assert.equal(Prive.typeAudio(mp3), 'mp3');
  assert.equal(Prive.typeAudio(Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(40)])), 'mp3', 'MP3 sans étiquette ID3');
  assert.equal(Prive.typeAudio(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(20)])), 'm4a');
  assert.equal(Prive.typeAudio(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(40)])), 'ogg');
  assert.equal(Prive.typeAudio(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(20)])), 'wav');
  assert.equal(Prive.typeAudio(Buffer.from('<html><script>alert(1)</script></html>')), '', 'une page web n\'est pas un audio');
  assert.equal(Prive.typeAudio(Buffer.from('%PDF-1.4 ................')), '');
  assert.equal((await audio(anon, 'a.mp3', mp3)).status, 401);
  assert.equal((await audio(jarA, 'a.mp3', mp3)).status, 403, 'un apprenant sans formation ne dépose rien');
  assert.equal((await audio(jarF, 'a.mp3', Buffer.from('<html>pas un audio, même renommé en mp3</html>'))).status, 400);
  assert.equal((await audio(jarF, 'gros.mp3', Buffer.concat([mp3, Buffer.alloc(4.5 * 1024 * 1024)]))).status, 413, 'au-delà de 4 Mo');
  const bon = await audio(jarF, 'cours.mp3', mp3);
  assert.equal(bon.status, 500, 'type accepté : l\'envoi vers le CDN est tenté (échoue ici faute de clé Bunny dans le banc d\'essai) — jamais un refus 400');
});
