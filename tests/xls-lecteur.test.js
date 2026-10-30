/* ===========================================================
   tests/xls-lecteur.test.js — lecteur des anciens classeurs .xls (lot G, 2026-10-30)
   ===========================================================
   Conteneur OLE2, chaînes partagées coupées par des enregistrements de suite, nombres, RK, MULRK, formules à résultat enregistré, booléens, erreurs, dates, formats
   personnalisés, styles, fusions, largeurs, lignes et feuilles masquées ; refus (macros, mot de passe, avant Excel 97, fichier endommagé) ; compatibilité avec la visionneuse.
   Lancer : node --test tests/xls-lecteur.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const XL = require('../server/xlsx-lecteur');
const XLS = require('../server/xls-lecteur');
const { xls, LONGUE } = require('./_xls-fabrique');

const sans = s => String(s).replace(/[\s  ]/g, '');

test('xls : feuilles, valeurs, formats, styles, fusions, largeurs', () => {
  const cl = XLS.ouvrir(xls());
  assert.deepEqual(cl.feuilles.map(f => f.nom), ['Prévisions', 'Détail'], 'la feuille masquée n\'est pas montrée');
  const f = cl.feuilles[0]; const c = (r, k) => f.lignes.get(r) && f.lignes.get(r).get(k);
  assert.equal(c(0, 0).t, 'Prévision financière');
  assert.equal(c(0, 3).t, 'VRAI'); assert.equal(c(0, 3).y, 'b');
  assert.equal(c(1, 0).t, 'Chiffre d’affaires', 'apostrophe typographique, chaîne partagée');
  assert.equal(c(1, 1).v, 120000); assert.equal(sans(c(1, 1).t), '120000,00', 'format #,##0.00 à la française');
  assert.equal(c(1, 2).v, 0.12); assert.match(sans(c(1, 2).t), /^12%$/, 'RK avec division par 100, format pourcentage');
  assert.equal(c(1, 3).t, '#DIV/0!'); assert.equal(c(1, 3).y, 'e');
  assert.equal(c(2, 1).v, 90000, 'MULRK : première colonne'); assert.equal(c(2, 2).v, 55, 'MULRK : deuxième colonne');
  assert.equal(c(3, 1).v, 30000); assert.equal(sans(c(3, 1).t), '30000,00€', 'format personnalisé #,##0.00 "€"');
  assert.equal(c(3, 2).t, 'ok', 'résultat texte d\'une formule');
  assert.match(c(4, 0).t, /^\d{2}\/\d{2}\/\d{4}$/, 'date : ' + c(4, 0).t);
  assert.equal(c(5, 0).t, LONGUE, 'chaîne coupée en plusieurs enregistrements de suite, lue en entier');
  assert.equal(f.lignes.has(7), false, 'ligne masquée non montrée');
  assert.equal(f.nbLignes, 6); assert.equal(f.nbColonnes, 4);
  assert.deepEqual(f.merges, [{ r: 0, c: 0, rs: 1, cs: 3 }]);
  assert.equal(f.largeurs[0], Math.round(28 * 7 + 5)); assert.equal(f.largeurs[1], undefined);
  const d = cl.feuilles[1];
  assert.deepEqual([d.lignes.get(0).get(0).t, d.lignes.get(0).get(1).t, d.lignes.get(1).get(0).t, d.lignes.get(1).get(1).t], ['x', 'y', '1', '2']);
  /* styles : gras, italique (police d'indice 2), police d'indice 5 (l'indice 4 n'existe pas), alignement, retour à la ligne */
  assert.equal(cl.styles[1].b, 1); assert.equal(cl.styles[0].b, undefined);
  assert.equal(cl.styles[5].b, 1, 'la police d\'indice 5 est la 5e enregistrée'); assert.equal(cl.styles[5].al, 'right');
  assert.equal(cl.styles[6].i, 1); assert.equal(cl.styles[6].al, 'center'); assert.equal(cl.styles[6].wrap, 1);
});

test('xls : même interface que les classeurs .xlsx (résumé, fenêtres, texte pour l\'assistant)', () => {
  const cl = XLS.ouvrir(xls());
  const r = XL.resume(cl);
  assert.equal(r.feuilles.length, 2); assert.equal(r.feuilles[0].lignes, 6); assert.ok(r.nb_cellules >= 14); assert.equal(r.styles[1].b, 1);
  const w = XL.fenetre(cl, 0, 0, 3);
  assert.equal(w.fin, 3); assert.equal(w.total, 6); assert.deepEqual(w.noms_colonnes, ['A', 'B', 'C', 'D']); assert.equal(w.lignes[0][0].t, 'Prévision financière'); assert.equal(w.merges.length, 1); assert.equal(w.largeurs[0], 201);
  const texte = XL.exporterTexte(cl, 30000);
  assert.match(texte, /Feuille « Prévisions »/); assert.match(texte, /A2 = Chiffre d’affaires/); assert.match(texte, /C4 = ok/); assert.match(texte, /Feuille « Détail »/);
});

test('xls : refus clairs (macros, mot de passe, avant Excel 97, fichier invalide ou endommagé)', () => {
  const code = (buf) => { try { XLS.ouvrir(buf); return null; } catch (e) { assert.ok(e instanceof XL.ErreurClasseur, 'toujours une erreur de classeur : ' + e); return e.code; } };
  assert.equal(code(xls({ macros: true })), 'macros');
  assert.equal(code(xls({ chiffre: true })), 'chiffre');
  assert.equal(code(xls({ biff5: true })), 'xls_ancien');
  assert.equal(code(Buffer.from('ceci n\'est pas un classeur')), 'pas_xls');
  assert.equal(code(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600)])), 'pas_xls', 'en-tête OLE mais fichier trop court');
  assert.equal(code(null), 'pas_xls');
  const bon = xls();
  assert.equal(code(bon.subarray(0, 3000)), 'pas_xls', 'fichier coupé');
  assert.equal(code(xls({}).subarray(0, 512)), 'pas_xls');
});

test('xls : aucune exception technique ni boucle infinie sur des fichiers abîmés (200 corruptions au hasard)', () => {
  const bon = xls(); let germe = 12345;
  const alea = () => { germe = (germe * 1103515245 + 12345) & 0x7fffffff; return germe; };
  let lus = 0, refuses = 0;
  const debut = Date.now();
  for (let k = 0; k < 200; k++) {
    const b = Buffer.from(bon);
    for (let j = 0; j < 1 + (k % 8); j++) b[alea() % b.length] = alea() & 0xff;
    try { XLS.ouvrir(b); lus++; } catch (e) { assert.ok(e instanceof XL.ErreurClasseur, 'erreur technique inattendue : ' + e.message); refuses++; }
  }
  assert.ok(lus + refuses === 200 && refuses > 0, `${lus} lus, ${refuses} refusés`);
  assert.ok(Date.now() - debut < 20000, 'terminé dans un délai raisonnable');
});
