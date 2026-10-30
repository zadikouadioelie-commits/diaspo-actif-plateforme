/* ===========================================================
   tests/formation-certificat-pdf.test.js — Formation Diaspora, lot E : certificat en PDF (2026-10-30)
   ===========================================================
   - QR code : matrices figées, identiques à celles de qrcodejs (comparées dans un vrai navigateur le 2026-10-30) pour les versions 5, 8 et 10 ;
     structure (repères, synchronisation, module sombre) et capacité.
   - PDF : en-tête, table des références cohérente (chaque décalage pointe sur « N 0 obj »), accents, texte pivoté, transparence.
   - Route HTTP /api/attestations/mon/:code/pdf : accès réservé au titulaire (ou à l'administrateur), type et en-têtes, trois modèles, document révoqué.
   Lancer : node --test tests/formation-certificat-pdf.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const H = require('./_formation-harness');
const { encoder } = require('../server/qr-code');
const { Pdf, largeurTexte, decouper } = require('../server/pdf-simple');
const { certificatPdf, dateFr } = require('../server/formation-certificat-pdf');

const empreinte = m => crypto.createHash('sha1').update(m.modules.map(l => l.map(b => (b ? '1' : '0')).join('')).join('/')).digest('hex');
const URL_COURTE = 'https://diaspoactif.com/verifier-attestation.html?code=DA-7K2M-9QXP';

/* Lit un PDF produit par pdf-simple : renvoie ses objets et le texte décompressé des pages. */
function lirePdf(buf) {
  const s = buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'), 'en-tête PDF');
  assert.ok(s.trimEnd().endsWith('%%EOF'), 'fin de fichier');
  const debutXref = Number(s.match(/startxref\n(\d+)\n%%EOF/)[1]);
  assert.equal(s.slice(debutXref, debutXref + 4), 'xref', 'startxref pointe sur la table des références');
  const lignes = s.slice(debutXref).split('\n');
  const n = Number(lignes[1].split(' ')[1]);
  for (let i = 1; i < n; i++) {
    const decalage = Number(lignes[2 + i].slice(0, 10));
    assert.ok(s.slice(decalage).startsWith(`${i} 0 obj`), `objet ${i} au décalage indiqué`);
  }
  const flux = [...buf.toString('latin1').matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m => zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'));
  return { s, n, flux };
}

test('QR code : matrices identiques à qrcodejs', () => {
  const a = encoder(URL_COURTE, { masque: 2 });
  assert.equal(a.version, 5); assert.equal(a.taille, 37); assert.equal(empreinte(a), 'b61b9651ef5b38048b9395d09c5e695f79964aff');
  const b = encoder(URL_COURTE + '&origine=certificat-de-reussite-formation-diaspora-numerique', { masque: 2 });
  assert.equal(b.version, 8); assert.equal(empreinte(b), 'ee71665e836227074e72c5ea685f61a99ebed311');
  const c = encoder('z'.repeat(200), { masque: 5 });
  assert.equal(c.version, 10); assert.equal(c.taille, 57); assert.equal(empreinte(c), '89f4e434be12ffaee4e7f3ca5afe84b103ce5388');
});

test('QR code : structure fixe et choix du masque', () => {
  const q = encoder(URL_COURTE);
  const m = q.modules, n = q.taille;
  /* trois repères 7×7 : anneau extérieur sombre, anneau intérieur clair, cœur sombre */
  for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let i = 0; i < 7; i++) { assert.ok(m[y0][x0 + i] && m[y0 + 6][x0 + i] && m[y0 + i][x0] && m[y0 + i][x0 + 6], 'anneau extérieur'); }
    assert.ok(!m[y0 + 1][x0 + 1] && !m[y0 + 5][x0 + 5], 'anneau clair'); assert.ok(m[y0 + 3][x0 + 3], 'cœur');
  }
  for (let i = 8; i < n - 8; i++) { assert.equal(m[6][i], i % 2 === 0, 'synchronisation horizontale'); assert.equal(m[i][6], i % 2 === 0, 'synchronisation verticale'); }
  assert.ok(m[n - 8][8], 'module sombre fixe');
  assert.ok(q.masque >= 0 && q.masque <= 7);
  assert.deepEqual(encoder(URL_COURTE).modules, encoder(URL_COURTE).modules, 'déterministe');
  assert.equal(encoder('a').version, 1); assert.equal(encoder('a'.repeat(213)).version, 10);
  assert.throws(() => encoder('a'.repeat(214)), /trop long/);
});

test('PDF : structure, accents, texte pivoté, transparence, lien', () => {
  assert.ok(largeurTexte('Hello', 'Helvetica', 10) > 0);
  assert.ok(largeurTexte('é', 'Helvetica', 1000) === 556 && largeurTexte('A', 'Times-Roman', 1000) === 722, 'métriques AFM');
  assert.deepEqual(decouper('un deux trois quatre', 'Helvetica', 10, largeurTexte('un deux', 'Helvetica', 10) + 1), ['un deux', 'trois', 'quatre']);
  assert.ok(decouper('x'.repeat(200), 'Helvetica', 10, 50).length > 1, 'un mot trop long est coupé');
  const pdf = new Pdf({ Title: 'Titre éé', Author: "Diaspo'Actif" });
  const p = pdf.page(300, 200);
  p.rect(10, 10, 100, 50, { fond: '#ff0000', contour: '#000000' });
  p.texte('Café (à l’heure) — 12 € « ok » \\', 20, 30, { police: 'Times-Bold', taille: 12 });
  p.texte('Pivoté', 150, 100, { angle: 90, align: 'center' });
  p.texte('Fantôme', 60, 150, { alpha: 0.28 });
  p.lien(10, 10, 50, 20, 'https://exemple.org/a?b=(1)');
  const { s, flux } = lirePdf(pdf.build());
  assert.ok(s.includes('/BaseFont /Times-Bold'), 'polices standard déclarées');
  assert.ok(s.includes('/ExtGState') && s.includes('/G28 '), 'transparence déclarée');
  assert.ok(s.includes('/Subtype /Link'), 'lien');
  const c = flux[0];
  assert.ok(c.includes('(Caf\\351 \\(\\340 l\\222heure\\) \\227 12 \\200 \\253 ok \\273 \\\\) Tj'), 'accents et ponctuation en cp1252, parenthèses et antislash échappés : ' + c);
  assert.ok(/0 1 -1 0 150 /.test(c), 'matrice de rotation à 90°');
  assert.ok(c.includes('/G28 gs'));
});

test('PDF : lettres hors WinAnsi remplacées par la lettre proche (noms africains, Europe centrale), « ? » seulement pour les autres alphabets', () => {
  const t = s => Buffer.from(require('../server/pdf-simple').versOctets(s)).toString('latin1');
  assert.equal(t('Ɛwɛ Ɔkɔ Ŋkrumah Ɓaba Ɗiallo'), 'Ewe Oko Nkrumah Baba Diallo', 'alphabets africains');
  assert.equal(t('Kɔ́ffi'), 'Koffi', 'accent combinant sur une lettre africaine : ignoré');
  assert.equal(t('Łukasz Dvořák Ćirić Ångström'), 'Lukasz Dvor\xe1k Ciric \xc5ngstr\xf6m', 'lettres d’Europe centrale ramenées à la lettre de base ; á ö Å conservés');
  assert.equal(t('élie'), '\xe9lie', 'accent écrit en deux caractères recomposé');
  assert.equal(t('a‑b − c'), 'a-b - c', 'trait d’union insécable et signe moins');
  assert.equal(t('Мария Щербаков Їжак'), 'Mariya Shcherbakov Yizhak', 'cyrillique : translittération usuelle, la lettre accentuée Ї n’est pas perdue');
  assert.equal(t('Γιώργος Παπαδόπουλος ΟΥΡΑΝΟΣ'), 'Giorgos Papadopoulos OURANOS', 'grec : accents ignorés, « ου » = « ou »');
  assert.equal(t('محمد 张伟'), '???? ??', 'arabe, chinois… : un « ? » par lettre (limite connue : il faudrait intégrer une police)');
});

test('PDF : dates en français', () => {
  assert.equal(dateFr('2026-10-30 09:15:00'), '30 octobre 2026');
  assert.equal(dateFr('2026-01-01T23:30:00Z'), '2 janvier 2026', 'heure de Paris');
});

test('certificat : les trois modèles se génèrent, avec ou sans QR code, révoqué ou non', () => {
  const base = { code: 'DA-TEST-0001', type: 'reussite', type_label: 'Certificat de réussite', formation_titre: 'Formation d’essai « longue » — ' + 'mot '.repeat(40), organisme: "Diaspo'Actif",
    date_emission: '2026-10-30 09:15:00', resultat_pct: 87.5, avertissement: 'Document délivré par Diaspo\'Actif. '.repeat(6), statut: 'valide', apprenant_nom: 'Aminata Traoré-Ouédraogo'.repeat(3) };
  for (const modele of ['classique', 'moderne', 'premium']) {
    const buf = certificatPdf({ ...base, modele }, { urlVerif: 'https://diaspoactif.com/verifier-attestation.html?code=DA-TEST-0001', qr: true });
    const { flux, s } = lirePdf(buf);
    assert.equal(flux.length, 1, 'une page');
    assert.ok(s.includes('/MediaBox [0 0 841.89 595.276]') || s.includes('/MediaBox [0 0 841.89'), 'A4 paysage');
    assert.ok(s.includes('/Subtype /Link') && s.includes('verifier-attestation.html'), 'le QR code est cliquable');
    assert.ok(flux[0].includes('(87,5 %) Tj'), 'décimale à la française');
    assert.ok(!flux[0].includes('R\\311VOQU'), 'non révoqué : pas de filigrane');
  }
  const sansQr = lirePdf(certificatPdf({ ...base, modele: 'classique' }, { urlVerif: 'https://x.test/v', qr: false }));
  assert.ok(!sansQr.s.includes('/Subtype /Link'), 'QR retiré : pas de lien');
  assert.ok(sansQr.flux[0].includes('Vérification en ligne'.replace('é', '\\351')), 'repli : code imprimé');
  const revoque = lirePdf(certificatPdf({ ...base, modele: 'premium', statut: 'revoque', resultat_pct: null, type: 'suivi' }, { urlVerif: 'https://x.test/v', qr: true }));
  assert.ok(revoque.flux[0].includes('(R\\311VOQU\\311) Tj'), 'filigrane RÉVOQUÉ');
  assert.ok(revoque.s.includes('/ca 0.28'), 'filigrane translucide');
  assert.ok(!revoque.flux[0].includes('Résultat obtenu'), 'pas de résultat sans note');
});

let env;
test.before(async () => { env = await H.demarrer('certpdf'); });
test.after(() => { if (env) env.stop(); });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
async function telecharger(jar, code) {
  const headers = {}; if (jar) jar.apply(headers);
  const res = await fetch(env.base + '/api/attestations/mon/' + code + '/pdf', { headers });
  return { status: res.status, type: res.headers.get('content-type'), disposition: res.headers.get('content-disposition'), buf: Buffer.from(await res.arrayBuffer()) };
}

test('route /api/attestations/mon/:code/pdf', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarA = H.cookieJar(), jarB = H.cookieJar(), jarAdmin = H.cookieJar(), anon = H.cookieJar();
  let idA;
  await t.test('setup — deux apprenants, un administrateur, trois documents', async () => {
    await H.creerApprenant(env, jarA, rnd, 'Alpha'); await H.creerApprenant(env, jarB, rnd, 'Bravo'); await H.creerFormateur(env, jarAdmin, rnd, 'Admin');
    idA = sql('select id from users where email like ?', `test-utilisateur-${rnd}-alpha%`)[0].id;
    const fid = sql("select id from formations order by id limit 1")[0]?.id || 1;
    [['PDFROUTE-1', 'reussite', 'classique', 'valide', 91.2], ['PDFROUTE-2', 'suivi', 'moderne', 'valide', null], ['PDFROUTE-3', 'participation', 'premium', 'revoque', null]].forEach(([code, type, modele, statut, pct], i) =>
      sql("INSERT INTO formation_attestations (code, inscription_id, formation_id, user_id, type, formation_titre, organisme, apprenant_nom, resultat_pct, statut, modele) VALUES (?,?,?,?,?,?,?,?,?,?,?)", code, 880000 + i, fid, idA, type, 'Formation <b>essai</b> & co', 'Orga', 'Alpha Aminata', pct, statut, modele));
  });
  await t.test('le titulaire télécharge son PDF (trois modèles)', async () => {
    for (const code of ['PDFROUTE-1', 'PDFROUTE-2', 'PDFROUTE-3']) {
      const r = await telecharger(jarA, code);
      assert.equal(r.status, 200, code); assert.equal(r.type, 'application/pdf');
      assert.equal(r.disposition, `attachment; filename="attestation-${code}.pdf"`);
      lirePdf(r.buf);
    }
    const minuscule = await telecharger(jarA, 'pdfroute-1');
    assert.equal(minuscule.status, 200, 'le code est insensible à la casse');
    const flux = lirePdf((await telecharger(jarA, 'PDFROUTE-1')).buf).flux.at(-1);
    assert.ok(flux.includes('(91,2 %) Tj'));
    assert.ok(lirePdf((await telecharger(jarA, 'PDFROUTE-1')).buf).s.includes('/Subtype /Image'), 'le logo est dans le PDF téléchargé');
    assert.ok(lirePdf((await telecharger(jarA, 'PDFROUTE-3')).buf).s.includes('/ca 0.28'), 'document révoqué : filigrane');
  });
  await t.test('accès refusé aux autres, accepté à l’administrateur', async () => {
    assert.equal((await telecharger(anon, 'PDFROUTE-1')).status, 401);
    assert.equal((await telecharger(jarB, 'PDFROUTE-1')).status, 404, 'le document d’un autre est introuvable (pas d’indice)');
    assert.equal((await telecharger(jarA, 'INCONNU')).status, 404);
    assert.equal((await telecharger(jarAdmin, 'PDFROUTE-1')).status, 200);
  });
  await t.test('le formateur peut retirer le QR code du document', async () => {
    const fid = sql("select formation_id f from formation_attestations where code='PDFROUTE-1'")[0].f;
    const avec = lirePdf((await telecharger(jarA, 'PDFROUTE-1')).buf).s;
    assert.ok(avec.includes('/Subtype /Link'));
    sql("UPDATE formations SET certificat_qr=0 WHERE id=?", fid);
    const sans = lirePdf((await telecharger(jarA, 'PDFROUTE-1')).buf).s;
    assert.ok(!sans.includes('/Subtype /Link'));
  });
});

test('certificat : logo de la plateforme intégré (image RVB + transparence)', async () => {
  const { chargerLogo } = require('../server/formation-certificat-pdf');
  const logo = await chargerLogo();
  assert.ok(logo && logo.w > 0 && logo.w <= 240 && logo.rgb.length === logo.w * logo.h * 3 && logo.alpha.length === logo.w * logo.h, 'logo chargé et réduit');
  assert.equal(await chargerLogo(), logo, 'chargé une seule fois');
  const a = { code: 'DA-LOGO', type: 'suivi', type_label: 'Attestation de suivi', formation_titre: 'F', organisme: 'O', date_emission: '2026-10-30 09:00:00', avertissement: 'x', statut: 'valide', apprenant_nom: 'N' };
  for (const modele of ['classique', 'premium']) {
    const { s, flux } = lirePdf(certificatPdf({ ...a, modele }, { logo, urlVerif: 'https://x.test/v', qr: true }));
    assert.ok(s.includes('/Subtype /Image') && s.includes('/SMask') && s.includes('/XObject'), modele + ' : image et masque déclarés');
    assert.ok(/\/Im0 Do/.test(flux.at(-1)), modele + ' : logo dessiné');
  }
  const moderne = lirePdf(certificatPdf({ ...a, modele: 'moderne' }, { logo, urlVerif: 'https://x.test/v', qr: true }));
  assert.ok(!/\/Im0 Do/.test(moderne.flux.at(-1)), 'le modèle moderne n\'affiche pas le logo (comme la page imprimable)');
  const sans = lirePdf(certificatPdf({ ...a, modele: 'classique' }, { urlVerif: 'https://x.test/v', qr: true }));
  assert.ok(!sans.s.includes('/Subtype /Image'), 'sans logo : aucune image');
  /* petite image synthétique : 2×2 pixels */
  const pdf = new Pdf({ Title: 't' }); const p = pdf.page(100, 100);
  const id = pdf.ajouterImage({ w: 2, h: 2, rgb: Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]), alpha: Buffer.from([255, 128, 64, 0]) });
  p.image(id, 10, 10, 40, 40);
  const lu = lirePdf(pdf.build());
  assert.ok(/\/Width 2 \/Height 2/.test(lu.s) && /\/ColorSpace \/DeviceGray/.test(lu.s) && /\/ColorSpace \/DeviceRGB/.test(lu.s));
});
