/* ═════════════════════════════════════════════════
   server/xls-formules.js — texte des formules des anciens classeurs .xls (lot J, 2026-10-30)

   Une formule BIFF8 est enregistrée en notation polonaise inversée (« jetons » : opérandes puis opérateurs). On la remet en texte lisible, comme dans la barre de
   formule d'Excel, avec les noms de fonctions ANGLAIS (SUM, IF…) et la virgule comme séparateur — exactement comme le lecteur .xlsx montre le texte stocké.
   Ce qui est lu : nombres, textes, booléens, erreurs, références et plages (absolues, relatives, 3D vers d'autres feuilles), opérateurs, parenthèses, pourcentage,
   fonctions courantes (table ci-dessous), somme automatique, formules partagées (SHRFMLA) et matricielles (ARRAY).
   Ce qui ne l'est pas : noms définis, fonctions complémentaires ou récentes (_xlfn), matrices en ligne {1,2;3,4}, tableaux structurés. Dans ces cas l'appelant n'affiche
   PAS de texte de formule (la valeur enregistrée reste montrée) : jamais un texte approximatif. Toute anomalie → null.
   ═════════════════════════════════════════════════ */
"use strict";

/* Index de fonction BIFF8 → nom (uniquement des index certains : un index inconnu rend la formule illisible plutôt que fausse). */
const NOMS = { 0: "COUNT", 1: "IF", 2: "ISNA", 3: "ISERROR", 4: "SUM", 5: "AVERAGE", 6: "MIN", 7: "MAX", 8: "ROW", 9: "COLUMN", 10: "NA", 11: "NPV", 12: "STDEV", 13: "DOLLAR", 14: "FIXED",
  15: "SIN", 16: "COS", 17: "TAN", 18: "ATAN", 19: "PI", 20: "SQRT", 21: "EXP", 22: "LN", 23: "LOG10", 24: "ABS", 25: "INT", 26: "SIGN", 27: "ROUND", 28: "LOOKUP", 29: "INDEX", 30: "REPT",
  31: "MID", 32: "LEN", 33: "VALUE", 34: "TRUE", 35: "FALSE", 36: "AND", 37: "OR", 38: "NOT", 39: "MOD", 46: "VAR", 48: "TEXT", 56: "PV", 57: "FV", 58: "NPER", 59: "PMT", 60: "RATE", 62: "IRR",
  63: "RAND", 64: "MATCH", 65: "DATE", 66: "TIME", 67: "DAY", 68: "MONTH", 69: "YEAR", 70: "WEEKDAY", 71: "HOUR", 72: "MINUTE", 73: "SECOND", 74: "NOW", 75: "AREAS", 76: "ROWS", 77: "COLUMNS",
  78: "OFFSET", 82: "SEARCH", 83: "TRANSPOSE", 86: "TYPE", 97: "ATAN2", 98: "ASIN", 99: "ACOS", 100: "CHOOSE", 101: "HLOOKUP", 102: "VLOOKUP", 105: "ISREF", 109: "LOG", 111: "CHAR", 112: "LOWER",
  113: "UPPER", 114: "PROPER", 115: "LEFT", 116: "RIGHT", 117: "EXACT", 118: "TRIM", 119: "REPLACE", 120: "SUBSTITUTE", 121: "CODE", 124: "FIND", 125: "CELL", 126: "ISERR", 127: "ISTEXT",
  128: "ISNUMBER", 129: "ISBLANK", 130: "T", 131: "N", 140: "DATEVALUE", 141: "TIMEVALUE", 142: "SLN", 143: "SYD", 144: "DDB", 148: "INDIRECT", 162: "CLEAN", 169: "COUNTA", 183: "PRODUCT",
  184: "FACT", 190: "ISNONTEXT", 193: "STDEVP", 194: "VARP", 197: "TRUNC", 198: "ISLOGICAL", 212: "ROUNDUP", 213: "ROUNDDOWN", 216: "RANK", 219: "ADDRESS", 220: "DAYS360", 221: "TODAY",
  227: "MEDIAN", 228: "SUMPRODUCT", 229: "SINH", 230: "COSH", 231: "TANH", 247: "DB", 252: "FREQUENCY", 269: "AVEDEV", 276: "COMBIN", 279: "EVEN", 285: "FLOOR", 288: "CEILING", 298: "ODD",
  299: "PERMUT", 307: "CORREL", 318: "DEVSQ", 321: "SUMSQ", 325: "LARGE", 326: "SMALL", 327: "QUARTILE", 328: "PERCENTILE", 330: "MODE", 336: "CONCATENATE", 337: "POWER", 342: "RADIANS",
  343: "DEGREES", 344: "SUBTOTAL", 345: "SUMIF", 346: "COUNTIF", 347: "COUNTBLANK" };
/* Fonctions écrites avec un nombre d'arguments FIXE (jeton « Func ») ; les autres portent leur nombre d'arguments (jeton « FuncVar »). */
const FIXES = { 2: 1, 3: 1, 10: 0, 15: 1, 16: 1, 17: 1, 18: 1, 19: 0, 20: 1, 21: 1, 22: 1, 23: 1, 24: 1, 25: 1, 26: 1, 27: 2, 30: 2, 31: 3, 32: 1, 33: 1, 34: 0, 35: 0, 38: 1, 39: 2, 63: 0, 65: 3, 66: 3,
  67: 1, 68: 1, 69: 1, 71: 1, 72: 1, 73: 1, 74: 0, 97: 2, 98: 1, 99: 1, 111: 1, 112: 1, 113: 1, 114: 1, 117: 2, 118: 1, 119: 4, 121: 1, 126: 1, 127: 1, 128: 1, 129: 1, 130: 1, 131: 1, 140: 1, 141: 1,
  162: 1, 184: 1, 190: 1, 198: 1, 212: 2, 213: 2, 221: 0, 229: 1, 230: 1, 231: 1, 276: 2, 279: 1, 298: 1, 299: 2, 307: 2, 337: 2, 342: 1, 343: 1, 346: 2, 347: 1 };
const ERREURS = { 0: "#NULL!", 7: "#DIV/0!", 15: "#VALUE!", 23: "#REF!", 29: "#NAME?", 36: "#NUM!", 42: "#N/A" };
const BINAIRES = { 0x03: "+", 0x04: "-", 0x05: "*", 0x06: "/", 0x07: "^", 0x08: "&", 0x09: "<", 0x0a: "<=", 0x0b: "=", 0x0c: ">=", 0x0d: ">", 0x0e: "<>", 0x0f: " ", 0x10: ",", 0x11: ":" };
const MAX_JETONS = 2000;

function colNom(c) { let s = ""; c = c + 1; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - m) / 26); } return s; }
const nomFeuille = n => (/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) ? n : "'" + n.replace(/'/g, "''") + "'");
const fin = () => { throw new Error("formule illisible"); };

/* Cellule : ligne (16 bits) + colonne (14 bits + 2 indicateurs). Les jetons « N » (formules partagées) portent des DÉCALAGES relatifs à la cellule qui contient la formule. */
function cellule(lig, colMasque, relatifN, ou) {
  const colRel = !!(colMasque & 0x4000), ligRel = !!(colMasque & 0x8000);
  let c = colMasque & 0x3fff;
  if (relatifN) {
    if (ligRel) lig = (ou.r + (lig > 0x7fff ? lig - 0x10000 : lig)) & 0xffff;
    if (colRel) { const o = c & 0xff; c = (ou.c + (o > 0x7f ? o - 0x100 : o)) & 0xff; }
  }
  return (colRel ? "" : "$") + colNom(c) + (ligRel ? "" : "$") + (lig + 1);
}

/* rgce : octets des jetons ; ou : { r, c } cellule qui porte la formule ; ctx : { feuilles: [noms de toutes les feuilles], xti: [[premiere, derniere]], partagees(r, c) → octets }. */
function texteDeFormule(rgce, ou, ctx) {
  ctx = ctx || {};
  const pile = []; let p = 0, n = 0;
  const depile = () => { if (!pile.length) fin(); return pile.pop(); };
  const u8 = () => { if (p + 1 > rgce.length) fin(); return rgce[p++]; };
  const u16 = () => { if (p + 2 > rgce.length) fin(); const v = rgce.readUInt16LE(p); p += 2; return v; };
  const u32 = () => { if (p + 4 > rgce.length) fin(); const v = rgce.readUInt32LE(p); p += 4; return v; };
  const prefixe = ixti => {
    const x = (ctx.xti || [])[ixti]; if (!x) fin();
    const fe = ctx.feuilles || []; if (x[0] >= fe.length || x[1] >= fe.length || x[0] > x[1]) fin();
    return (x[0] === x[1] ? nomFeuille(fe[x[0]]) : nomFeuille(fe[x[0]]) + ":" + nomFeuille(fe[x[1]])) + "!";
  };
  while (p < rgce.length) {
    if (++n > MAX_JETONS) fin();
    const ptg = u8(); const base = ptg >= 0x20 ? (ptg & 0x1f) | 0x20 : ptg;
    if (BINAIRES[ptg]) { const b = depile(), a = depile(); pile.push(a + BINAIRES[ptg] + b); continue; }
    switch (base) {
      case 0x01: { /* ptgExp : formule partagée ou matricielle — le texte est dans un autre enregistrement */
        const r = u16(), c = u16(); if (!ctx.partagees) fin();
        const autre = ctx.partagees(r, c, ou); if (!autre || ctx.profondeur) fin();
        return texteDeFormule(autre, ou, { ...ctx, profondeur: 1 });
      }
      case 0x12: pile.push("+" + depile()); break;
      case 0x13: pile.push("-" + depile()); break;
      case 0x14: pile.push(depile() + "%"); break;
      case 0x15: pile.push("(" + depile() + ")"); break;
      case 0x16: pile.push(""); break; /* argument omis : IF(A1,,2) */
      case 0x17: { const cch = u8(), opt = u8(); const larg = opt & 1 ? 2 : 1; if (p + cch * larg > rgce.length) fin(); const t = rgce.toString(larg === 2 ? "utf16le" : "latin1", p, p + cch * larg); p += cch * larg; pile.push('"' + t.replace(/"/g, '""') + '"'); break; }
      case 0x19: { /* jetons « attribut » : sauts de IF/CHOOSE (ignorés), espaces, somme automatique */
        const t = u8();
        if (t & 0x04) { const nb = u16(); p += (nb + 1) * 2; if (p > rgce.length) fin(); }
        else if (t & 0x10) { u16(); pile.push("SUM(" + depile() + ")"); }
        else { u16(); }
        break;
      }
      case 0x1c: pile.push(ERREURS[u8()] || "#VALUE!"); break;
      case 0x1d: pile.push(u8() ? "TRUE" : "FALSE"); break;
      case 0x1e: pile.push(String(u16())); break;
      case 0x1f: { if (p + 8 > rgce.length) fin(); const v = rgce.readDoubleLE(p); p += 8; pile.push(Number.isFinite(v) ? String(v) : fin()); break; }
      case 0x21: case 0x22: { /* fonction */
        const var_ = base === 0x22; let nb, idx;
        if (var_) { nb = u8() & 0x7f; idx = u16() & 0x7fff; } else { idx = u16(); nb = FIXES[idx]; if (nb === undefined) fin(); }
        const nom = NOMS[idx]; if (!nom || pile.length < nb) fin();
        const args = nb ? pile.splice(pile.length - nb, nb) : [];
        pile.push(nom + "(" + args.join(",") + ")");
        break;
      }
      case 0x24: case 0x2c: { const r = u16(), c = u16(); pile.push(cellule(r, c, base === 0x2c, ou)); break; }
      case 0x25: case 0x2d: {
        const r1 = u16(), r2 = u16(), c1 = u16(), c2 = u16(); const rel = base === 0x2d;
        pile.push(cellule(r1, c1, rel, ou) + ":" + cellule(r2, c2, rel, ou)); break;
      }
      case 0x26: case 0x27: case 0x28: case 0x29: fin(); break; /* jetons de mémoire (sous-expressions en cache) : lecture non garantie, donc aucun texte */
      case 0x2a: u16(); u16(); pile.push("#REF!"); break;
      case 0x2b: p += 8; if (p > rgce.length) fin(); pile.push("#REF!"); break;
      case 0x3a: { const x = u16(), r = u16(), c = u16(); pile.push(prefixe(x) + cellule(r, c, false, ou)); break; }
      case 0x3b: { const x = u16(), r1 = u16(), r2 = u16(), c1 = u16(), c2 = u16(); pile.push(prefixe(x) + cellule(r1, c1, false, ou) + ":" + cellule(r2, c2, false, ou)); break; }
      default: fin(); /* noms définis (0x23, 0x39), matrices en ligne (0x20), tableaux, jetons inconnus */
    }
  }
  if (pile.length !== 1) fin();
  return pile[0].length > 400 ? fin() : pile[0];
}

/* Sans exception : null si la formule n'est pas lisible. */
function decompiler(rgce, ou, ctx) { try { return texteDeFormule(rgce, ou, ctx); } catch (_) { return null; } }

module.exports = { decompiler, colNom };
