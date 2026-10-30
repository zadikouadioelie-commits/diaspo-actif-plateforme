/* Fabrique de classeurs .xls (BIFF8 dans un conteneur OLE2) pour les tests du lecteur server/xls-lecteur.js — aucun fichier tiers, tout est écrit ici.
   xls({ macros, chiffre, biff5, petit }) → Buffer.  Le classeur de référence contient : une feuille « Prévisions » (texte, nombres, RK, MULRK, formules à résultat enregistré,
   booléen, erreur, date, cellules fusionnées, largeur de colonne, ligne masquée), une feuille « Détail » et une feuille masquée ; la table des chaînes dépasse 8 224 octets
   (enregistrements de suite, coupure au milieu d'une chaîne). */
'use strict';

const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const f64 = n => { const b = Buffer.alloc(8); b.writeDoubleLE(n); return b; };
const rec = (type, ...corps) => { const d = Buffer.concat(corps); return Buffer.concat([u16(type), u16(d.length), d]); };
const LONGUE = 'Un très long commentaire ' + 'à répéter pour dépasser la taille d’un enregistrement ; '.repeat(130); /* ≈ 8 000 caractères, large (accents) */

/* Table des chaînes partagées avec coupure en enregistrements de suite. Renvoie les octets (SST + CONTINUE). */
function sst(chaines) {
  const MAX = 8224; const morceaux = [[]]; let util = 0;
  const nouveau = () => { morceaux.push([]); util = 0; };
  const poser = b => { morceaux[morceaux.length - 1].push(b); util += b.length; };
  poser(u32(chaines.length)); poser(u32(chaines.length));
  for (const s of chaines) {
    const large = /[^\x00-\xff]/.test(s) || s === LONGUE;
    if (util + 3 > MAX) nouveau();
    poser(u16(s.length)); poser(Buffer.from([large ? 1 : 0]));
    const octets = large ? Buffer.from(s, 'utf16le') : Buffer.from(s, 'latin1'); const u = large ? 2 : 1;
    let p = 0;
    while (p < octets.length) {
      let place = Math.floor((MAX - util) / u) * u;
      if (place <= 0) { nouveau(); poser(Buffer.from([large ? 1 : 0])); place = Math.floor((MAX - util) / u) * u; } /* suite : l'octet d'options revient avant les lettres */
      const k = Math.min(place, octets.length - p); poser(octets.subarray(p, p + k)); p += k;
      if (p < octets.length) { nouveau(); poser(Buffer.from([large ? 1 : 0])); }
    }
  }
  return Buffer.concat(morceaux.map((m, i) => rec(i === 0 ? 0x00fc : 0x003c, ...m)));
}

function police(gras, italique) { return rec(0x0031, u16(200), u16(italique ? 2 : 0), u16(0x7fff), u16(gras ? 700 : 400), u16(0), Buffer.from([0, 0, 0, 0]), Buffer.from([5, 0]), Buffer.from('Arial', 'latin1')); }
function xf(font, fmt, al, wrap) { return rec(0x00e0, u16(font), u16(fmt), u16(0), Buffer.from([(al || 0) | (wrap ? 8 : 0), 0, 0, 0]), Buffer.alloc(12)); }
const bof = type => rec(0x0809, u16(0x0600), u16(type), u16(0x0dbb), u16(0x07cc), u32(0), u32(6));
const eof = () => rec(0x000a);
const labelsst = (r, c, xfi, i) => rec(0x00fd, u16(r), u16(c), u16(xfi), u32(i));
const nombre = (r, c, xfi, v) => rec(0x0203, u16(r), u16(c), u16(xfi), f64(v));
const rk = (r, c, xfi, v) => rec(0x027e, u16(r), u16(c), u16(xfi), u32(v));
const boolerr = (r, c, xfi, v, err) => rec(0x0205, u16(r), u16(c), u16(xfi), Buffer.from([v, err ? 1 : 0]));
const formuleNombre = (r, c, xfi, v) => rec(0x0006, u16(r), u16(c), u16(xfi), f64(v), u16(0), u32(0), u16(0));
const formuleTexte = (r, c, xfi, texte) => Buffer.concat([rec(0x0006, u16(r), u16(c), u16(xfi), Buffer.from([0, 0, 0, 0, 0, 0, 0xff, 0xff]), u16(0), u32(0), u16(0)), rec(0x0207, u16(texte.length), Buffer.from([0]), Buffer.from(texte, 'latin1'))]);
const ligneMasquee = r => rec(0x0208, u16(r), u16(0), u16(1), u16(255), u16(0), u16(0), u16(0x20), u16(0));

function classeurBiff({ chiffre, biff5 }) {
  const chaines = ['Prévision financière', 'Chiffre d’affaires', 'Charges', 'Bénéfice net', 'Texte masqué', LONGUE, 'x', 'y', 'Fin'];
  const iLongue = 5;
  const globals = [Buffer.concat([rec(0x0809, u16(biff5 ? 0x0500 : 0x0600), u16(5), u16(0x0dbb), u16(0x07cc), u32(0), u32(6)), rec(0x0022, u16(0))])];
  if (chiffre) globals.push(rec(0x002f, u16(1), u16(1), u16(1), Buffer.alloc(48)));
  /* polices d'indices 0, 1 (gras), 2 (italique), 3, puis 5 (gras) : l'indice 4 n'existe pas dans Excel */
  globals.push(police(false), police(true), police(false, true), police(false), police(true));
  globals.push(rec(0x041e, u16(164), u16('#,##0.00 "€"'.length), Buffer.from([1]), Buffer.from('#,##0.00 "€"', 'utf16le')));
  /* styles : 0 normal · 1 gras · 2 #,##0.00 · 3 pourcentage · 4 date · 5 gras (police 5) + format 164 aligné à droite · 6 italique centré à la ligne */
  globals.push(xf(0, 0), xf(1, 0), xf(0, 4), xf(0, 9), xf(0, 14), xf(5, 164, 3), xf(2, 0, 2, true));
  const feuillesNoms = [['Prévisions', 0], ['Détail', 0], ['Cachée', 1]];
  const entetesBS = feuillesNoms.map(([nom, etat]) => rec(0x0085, u32(0), Buffer.from([etat, 0]), Buffer.from([nom.length, 0]), Buffer.from(nom, 'latin1')));
  const tailleBS = entetesBS.reduce((s, b) => s + b.length, 0);
  const partageEnc = sst(chaines);
  const avantFeuilles = Buffer.concat([...globals, ...entetesBS, partageEnc, eof()]);
  const f1 = Buffer.concat([bof(0x0010),
    labelsst(0, 0, 1, 0), boolerr(0, 3, 0, 1, false),
    labelsst(1, 0, 0, 1), nombre(1, 1, 2, 120000), rk(1, 2, 3, (12 << 2) | 3), boolerr(1, 3, 0, 7, true),
    labelsst(2, 0, 0, 2), rec(0x00bd, u16(2), u16(1), u16(0), u32((90000 << 2) | 2), u16(0), u32((55 << 2) | 2), u16(2)),
    labelsst(3, 0, 0, 3), formuleNombre(3, 1, 5, 30000), formuleTexte(3, 2, 0, 'ok'),
    nombre(4, 0, 4, 46000), labelsst(5, 0, 6, iLongue),
    ligneMasquee(7), labelsst(7, 0, 0, 4),
    rec(0x00e5, u16(1), u16(0), u16(0), u16(0), u16(2)), rec(0x007d, u16(0), u16(0), u16(28 * 256), u16(0), u16(0), u16(0)),
    eof()]);
  const f2 = Buffer.concat([bof(0x0010), labelsst(0, 0, 0, 6), labelsst(0, 1, 0, 7), nombre(1, 0, 0, 1), nombre(1, 1, 0, 2), eof()]);
  const f3 = Buffer.concat([bof(0x0010), labelsst(0, 0, 0, 8), eof()]);
  const base = avantFeuilles.length;
  const offsets = [base, base + f1.length, base + f1.length + f2.length];
  /* les décalages des feuilles sont écrits dans les enregistrements BOUNDSHEET */
  let p = 0; const bs = entetesBS.map((b, i) => { const c = Buffer.from(b); c.writeUInt32LE(offsets[i], 4); return c; });
  const dedans = Buffer.concat([...globals, ...bs, partageEnc, eof()]);
  void tailleBS; void p;
  return Buffer.concat([dedans, f1, f2, f3]);
}

/* Conteneur OLE2 (secteurs de 512 octets), flux « Workbook » complété à 4 096 octets au moins (pas de petit flux). */
function ole(flux, { macros }) {
  const TAILLE = 512, FIN = 0xfffffffe, LIBRE = 0xffffffff, FAT = 0xfffffffd;
  let contenu = flux; if (contenu.length < 4096) contenu = Buffer.concat([contenu, Buffer.alloc(4096 - contenu.length)]);
  const n = Math.ceil(contenu.length / TAILLE);
  const nbFat = Math.ceil((n + 1 + 1) / 128);
  const total = n + 1 + nbFat;
  const fat = Buffer.alloc(nbFat * TAILLE, 0xff);
  for (let i = 0; i < n; i++) fat.writeUInt32LE(i < n - 1 ? i + 1 : FIN, i * 4);
  fat.writeUInt32LE(FIN, n * 4);
  for (let k = 0; k < nbFat; k++) fat.writeUInt32LE(FAT, (n + 1 + k) * 4);
  const entree = (nom, type, debut, taille, enfant) => {
    const b = Buffer.alloc(128); b.fill(0); Buffer.from(nom, 'utf16le').copy(b, 0); b.writeUInt16LE(nom ? (nom.length + 1) * 2 : 0, 64); b[66] = type; b[67] = 1;
    b.writeUInt32LE(LIBRE, 68); b.writeUInt32LE(LIBRE, 72); b.writeUInt32LE(enfant == null ? LIBRE : enfant, 76); b.writeUInt32LE(debut, 116); b.writeUInt32LE(taille, 120); return b;
  };
  const vide = () => { const b = Buffer.alloc(128); b.writeUInt32LE(LIBRE, 68); b.writeUInt32LE(LIBRE, 72); b.writeUInt32LE(LIBRE, 76); return b; };
  const dir = Buffer.concat([entree('Root Entry', 5, FIN, 0, 1), entree('Workbook', 2, 0, contenu.length), macros ? entree('_VBA_PROJECT_CUR', 1, FIN, 0) : vide(), vide()]);
  const entete = Buffer.alloc(512);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(entete, 0);
  entete.writeUInt16LE(0x003e, 24); entete.writeUInt16LE(3, 26); entete.writeUInt16LE(0xfffe, 28); entete.writeUInt16LE(9, 30); entete.writeUInt16LE(6, 32);
  entete.writeUInt32LE(nbFat, 44); entete.writeUInt32LE(n, 48); entete.writeUInt32LE(4096, 56); entete.writeUInt32LE(FIN, 60); entete.writeUInt32LE(0, 64); entete.writeUInt32LE(FIN, 68); entete.writeUInt32LE(0, 72);
  for (let i = 0; i < 109; i++) entete.writeUInt32LE(i < nbFat ? n + 1 + i : LIBRE, 76 + i * 4);
  const pad = Buffer.alloc(n * TAILLE); contenu.copy(pad);
  void total;
  return Buffer.concat([entete, pad, dir, fat]);
}

function xls(opts) { opts = opts || {}; return ole(classeurBiff(opts), opts); }

module.exports = { xls, LONGUE };
