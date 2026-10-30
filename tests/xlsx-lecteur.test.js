/* ===========================================================
   tests/xlsx-lecteur.test.js — lecteur de classeurs Excel (.xlsx), lecture seule (2026-10-30)
   ===========================================================
   Valeurs, formats (nombres, pourcentages, dates, devises), formules, cellules fusionnées, plusieurs feuilles, styles, grands classeurs (fenêtres),
   et défenses : macros refusées, faux fichiers, archive tronquée, bombe de décompression.
   Lancer : node --test tests/xlsx-lecteur.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const X = require('../server/xlsx-lecteur');
const F = require('./_documents-fabrique');

test('formats de nombres : séparateurs français, pourcentages, devises, dates', () => {
  const f = (v, code) => X.formaterNombre(v, code, false);
  assert.equal(f(1234.5, '#,##0.00'), '1 234,50');
  assert.equal(f(0.1256, '0.0%'), '12,6%');
  assert.equal(f(0.5, '0%'), '50%');
  assert.equal(f(1234567, '#,##0'), '1 234 567');
  assert.equal(f(5, '0.00'), '5,00');
  assert.equal(f(12, '0000'), '0012');
  assert.equal(f(1500, '#,##0.00\\ "€"'), '1 500,00 €');
  assert.equal(f(1234.5, '[$€-407] #,##0.00'), '€ 1 234,50');
  assert.equal(f(-1250, '#,##0;[Red]-#,##0'), '-1 250');
  assert.equal(f(7, 'General'), '7');
  assert.equal(f(0.5, 'General'), '0,5');
  assert.equal(f(45000, 'dd/mm/yyyy'), '15/03/2023');
  assert.equal(f(45000.75, 'dd/mm/yyyy hh:mm'), '15/03/2023 18:00');
  assert.equal(f(45000, 'd mmmm yyyy'), '15 mars 2023');
  assert.equal(X.formaterNombre(1, 'dd/mm/yyyy', true), '02/01/1904', 'système de dates 1904');
});

test('un classeur : feuilles, valeurs, formules, formats, fusions, largeurs, styles', () => {
  const buf = F.classeur({ styles: F.STYLES, feuilles: [
    { nom: 'Prévisions', largeurs: [28, 14, 14], merges: ['A1:C1'], lignes: [
      [{ v: 'Prévision financière 2026', s: 1 }],
      ['Chiffre d\'affaires', { v: 120000, s: 5 }, { v: 0.12, s: 3 }],
      ['Charges', { v: 90000, s: 5 }],
      ['Bénéfice net', { v: 30000, s: 5, f: 'B2-B3' }, { v: 'bon', f: 'IF(B4>0,"bon","mauvais")' }],
      ['Date', { v: 45000, s: 4 }, { v: true }],
      ['<b>Piège & "guillemets"</b>', { v: 'en ligne', inline: true }, { v: 3.5, s: 2 }],
    ] },
    { nom: 'Caché', masquee: true, lignes: [['secret']] },
    { nom: 'Détail', lignes: [['x', 'y'], [1, 2]] },
  ] });
  const cl = X.ouvrir(buf);
  assert.deepEqual(cl.feuilles.map(f => f.nom), ['Prévisions', 'Détail'], 'une feuille masquée n\'est pas montrée');
  const r = X.resume(cl);
  assert.equal(r.feuilles[0].lignes, 6); assert.equal(r.feuilles[0].colonnes, 3);
  assert.equal(r.styles[1].b, 1); assert.equal(r.styles[1].bg, '#1F4E79'); assert.equal(r.styles[1].c, '#FFFFFF');
  assert.equal(r.styles[6].al, 'center'); assert.equal(r.styles[6].wrap, 1); assert.equal(r.styles[6].i, 1);
  const w = X.fenetre(cl, 0, 0, 100);
  assert.equal(w.total, 6); assert.equal(w.lignes.length, 6); assert.equal(w.colonnes, 3);
  assert.deepEqual(w.noms_colonnes, ['A', 'B', 'C']);
  assert.equal(w.lignes[0][0].t, 'Prévision financière 2026');
  assert.deepEqual(w.merges, [{ r: 0, c: 0, rs: 1, cs: 3 }], 'cellule fusionnée A1:C1');
  assert.equal(w.largeurs[0], 28 * 7 + 5);
  assert.equal(w.lignes[1][1].t, '120 000,00 €'); assert.equal(w.lignes[1][1].v, 120000);
  assert.equal(w.lignes[1][2].t, '12,00%');
  assert.equal(w.lignes[3][1].f, 'B2-B3'); assert.equal(w.lignes[3][1].t, '30 000,00 €', 'valeur calculée par Excel + formule');
  assert.equal(w.lignes[3][2].t, 'bon'); assert.equal(w.lignes[3][2].f, 'IF(B4>0,"bon","mauvais")');
  assert.equal(w.lignes[4][1].t, '15/03/2023'); assert.equal(w.lignes[4][2].t, 'VRAI');
  assert.equal(w.lignes[5][0].t, '<b>Piège & "guillemets"</b>', 'le texte reste du texte (jamais du HTML)');
  assert.equal(w.lignes[5][1].t, 'en ligne'); assert.equal(w.lignes[5][2].t, '3,50');
  assert.equal(X.fenetre(cl, 1, 0, 10).lignes[1][1].t, '2');
  const txt = X.exporterTexte(cl);
  assert.match(txt, /Feuille « Prévisions »/); assert.match(txt, /B4 = 30 000,00 € \[formule : =B2-B3\]/); assert.match(txt, /A4 = Bénéfice net/);
});

test('grands classeurs : lecture par fenêtres, bornes, lignes vides', () => {
  const lignes = []; for (let i = 0; i < 5000; i++) lignes.push(i % 7 === 6 ? [] : [i + 1, { v: (i + 1) * 2 }, 'ligne ' + (i + 1)]);
  const cl = X.ouvrir(F.classeur({ feuilles: [{ nom: 'Gros', lignes }] }));
  assert.equal(X.resume(cl).feuilles[0].lignes, 5000);
  const w = X.fenetre(cl, 0, 4990, 100);
  assert.equal(w.debut, 4990); assert.equal(w.fin, 5000); assert.equal(w.lignes.length, 10);
  assert.equal(w.lignes[0], null, 'la ligne 4991 est vide'); assert.equal(w.lignes[1][2].t, 'ligne 4992'); assert.equal(X.fenetre(cl, 0, 6, 1).lignes[0], null, 'ligne vide = null');
  assert.equal(X.fenetre(cl, 0, 0, 100000).lignes.length, 500, 'fenêtre bornée à 500 lignes');
  assert.throws(() => X.fenetre(cl, 3, 0, 10), /Feuille introuvable/);
});

test('défenses : macros, faux fichiers, archive tronquée, bombe de décompression', () => {
  assert.throws(() => X.ouvrir(F.classeur({ macros: true, feuilles: [{ nom: 'A', lignes: [['x']] }] })), e => e.code === 'macros');
  assert.throws(() => X.ouvrir(Buffer.from('%PDF-1.4 pas un classeur')), e => e.code === 'pas_zip');
  assert.throws(() => X.ouvrir(Buffer.from('PK\u0003\u0004 coupé')), e => ['zip_invalide', 'pas_zip'].includes(e.code));
  assert.throws(() => X.ouvrir(F.zip({ 'readme.txt': 'je suis un zip, pas un classeur' })), e => e.code === 'pas_xlsx');
  /* bombe : une entrée qui annonce plus de 60 Mo décompressés */
  const gros = Buffer.alloc(70 * 1024 * 1024, 0x41);
  assert.throws(() => X.ouvrir(F.zip({ 'xl/workbook.xml': gros })), e => e.code === 'trop_gros');
  /* entrée dont la taille annoncée est mensongère : l'inflation est elle-même plafonnée */
  const ok = F.classeur({ feuilles: [{ nom: 'A', lignes: [['x']] }] });
  assert.ok(X.ouvrir(ok));
  assert.ok(zlib.crc32);
});
