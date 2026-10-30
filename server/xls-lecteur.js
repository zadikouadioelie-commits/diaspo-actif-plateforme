/* ═════════════════════════════════════════════════
   server/xls-lecteur.js — lecteur des anciens classeurs Excel (.xls, BIFF8 : Excel 97 à 2003) en LECTURE SEULE, sans bibliothèque tierce (lot G, 2026-10-30).

   Produit exactement le même objet que server/xlsx-lecteur.js (feuilles, lignes, cellules, styles, fusions, largeurs) : la visionneuse n'y voit aucune différence.
   Ce qu'il lit : le conteneur OLE2 (secteurs, tables d'allocation, petit flux), les feuilles visibles, les chaînes partagées (avec leurs suites), les nombres (dont les
   formats RK), les booléens et erreurs, les résultats enregistrés des formules, les cellules fusionnées, les largeurs de colonnes, les lignes masquées, les formats de nombres
   et de dates, le gras, l'italique, l'alignement et le retour à la ligne.
   Ce qu'il ne fait pas : les formules ne sont pas recalculées (la dernière valeur enregistrée est montrée ; leur texte est relu par server/xls-formules.js quand elles sont courantes) ; couleurs de fond et de texte, bordures, graphiques, images
   et tableaux croisés ne sont pas repris ; aucune macro n'est lue ni exécutée (un classeur qui en contient est refusé) ; les classeurs protégés par mot de passe et le format
   d'avant Excel 97 (BIFF5) sont refusés avec un message clair.
   Défenses : taille du fichier, nombre et boucle de secteurs, nombre de cellules et de colonnes.
   ═════════════════════════════════════════════════ */
"use strict";
const FM = require("./xls-formules");
const XL = require("./xlsx-lecteur");
const { ErreurClasseur, formaterNombre } = XL;

const MAX_FICHIER = 40 * 1024 * 1024;
const MAX_SECTEURS = 1200000;
const FIN = 0xfffffffe, LIBRE = 0xffffffff;

/* ── Conteneur OLE2 ── */
function lireOle(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 1024 || buf.length > MAX_FICHIER || buf.readUInt32BE(0) !== 0xd0cf11e0) throw new ErreurClasseur("pas_xls", "Ce fichier n'est pas un classeur Excel (.xls) valide.");
  const tailleSecteur = 1 << buf.readUInt16LE(0x1e), tailleMini = 1 << buf.readUInt16LE(0x20);
  if (![512, 4096].includes(tailleSecteur) || tailleMini !== 64) throw new ErreurClasseur("pas_xls", "Ce fichier n'est pas un classeur Excel (.xls) valide.");
  const nbSecteurs = Math.floor((buf.length - 512) / tailleSecteur);
  if (nbSecteurs > MAX_SECTEURS) throw new ErreurClasseur("trop_gros", "Ce classeur est trop volumineux pour s'afficher dans la page.");
  const secteur = id => { const d = (id + 1) * tailleSecteur; if (id < 0 || d + tailleSecteur > buf.length) throw new ErreurClasseur("pas_xls", "Classeur .xls endommagé."); return buf.subarray(d, d + tailleSecteur); };
  /* table d'allocation (FAT) : 109 premières entrées dans l'en-tête, puis chaîne de secteurs de DIFAT */
  const idsFat = [];
  for (let i = 0; i < 109; i++) { const v = buf.readUInt32LE(0x4c + i * 4); if (v !== LIBRE && v !== FIN) idsFat.push(v); }
  let difat = buf.readUInt32LE(0x44), garde = 0;
  while (difat !== FIN && difat !== LIBRE && garde++ < 2000) {
    const s = secteur(difat); const n = tailleSecteur / 4 - 1;
    for (let i = 0; i < n; i++) { const v = s.readUInt32LE(i * 4); if (v !== LIBRE && v !== FIN) idsFat.push(v); }
    difat = s.readUInt32LE(n * 4);
  }
  const fat = [];
  for (const id of idsFat) { const s = secteur(id); for (let i = 0; i < tailleSecteur; i += 4) fat.push(s.readUInt32LE(i)); }
  const chaine = (debut, table) => {
    const ids = []; const vus = new Set(); let id = debut;
    while (id !== FIN && id !== LIBRE && id < table.length) { if (vus.has(id)) throw new ErreurClasseur("pas_xls", "Classeur .xls endommagé."); vus.add(id); ids.push(id); if (ids.length > nbSecteurs + 8) throw new ErreurClasseur("pas_xls", "Classeur .xls endommagé."); id = table[id]; }
    return ids;
  };
  const lireChaine = (debut, taille) => { const ids = chaine(debut, fat); const o = Buffer.concat(ids.map(secteur)); return o.subarray(0, Math.min(taille, o.length)); };
  /* répertoire */
  const dir = lireChaine(buf.readUInt32LE(0x30), nbSecteurs * tailleSecteur);
  const entrees = [];
  for (let p = 0; p + 128 <= dir.length; p += 128) {
    const lg = dir.readUInt16LE(p + 0x40); if (!lg || lg > 64) continue;
    entrees.push({ nom: dir.toString("utf16le", p, p + lg - 2), type: dir[p + 0x42], debut: dir.readUInt32LE(p + 0x74), taille: dir.readUInt32LE(p + 0x78) });
  }
  const racine = entrees.find(e => e.type === 5);
  /* petit flux : flux de moins de 4096 octets rangés dans le « conteneur » de la racine */
  let mini = null, miniFat = null;
  const lireFlux = e => {
    if (e.taille < 4096 && racine) {
      if (!mini) {
        mini = lireChaine(racine.debut, racine.taille);
        miniFat = [];
        const mf = lireChaine(buf.readUInt32LE(0x3c), buf.readUInt32LE(0x40) * tailleSecteur);
        for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mf.readUInt32LE(i));
      }
      const ids = chaine(e.debut, miniFat);
      return Buffer.concat(ids.map(id => mini.subarray(id * 64, id * 64 + 64))).subarray(0, e.taille);
    }
    return lireChaine(e.debut, e.taille);
  };
  return { entrees, lireFlux };
}

/* ── Lecteur de chaînes avec « suites » (CONTINUE) : un texte coupé en deux recommence par un octet qui dit s'il est sur 1 ou 2 octets par lettre ── */
class Flux {
  constructor(morceaux) { this.c = morceaux; this.i = 0; this.p = 0; }
  libre() { return this.c[this.i].length - this.p; }
  suivant() { this.i++; this.p = 0; return this.i < this.c.length; }
  u8() { while (this.libre() === 0) if (!this.suivant()) throw new Error("fin"); return this.c[this.i][this.p++]; }
  u16() { const a = this.u8(); return a | (this.u8() << 8); }
  u32() { const a = this.u16(); return (a | (this.u16() << 16)) >>> 0; }
  ignorer(n) { while (n > 0) { const l = this.libre(); if (l === 0) { if (!this.suivant()) return; continue; } const k = Math.min(l, n); this.p += k; n -= k; } }
  lettres(n, large) {
    let out = "";
    while (n > 0) {
      if (this.libre() === 0) { if (!this.suivant()) break; large = (this.c[this.i][this.p++] & 1) === 1; continue; }
      const u = large ? 2 : 1, k = Math.min(Math.floor(this.libre() / u), n);
      if (k === 0) { this.p++; continue; }
      out += large ? this.c[this.i].toString("utf16le", this.p, this.p + 2 * k) : this.c[this.i].toString("latin1", this.p, this.p + k);
      this.p += k * u; n -= k;
    }
    return out;
  }
}
/* Chaîne « Unicode » d'un seul enregistrement : longueur sur lg octets (1 ou 2), options, lettres. */
function chaineSimple(d, pos, lg) {
  const n = lg === 1 ? d[pos] : d.readUInt16LE(pos); const opt = d[pos + lg]; let p = pos + lg + 1;
  if (opt & 8) p += 2; if (opt & 4) p += 4;
  const large = opt & 1;
  return { texte: large ? d.toString("utf16le", p, p + 2 * n) : d.toString("latin1", p, p + n), fin: p + n * (large ? 2 : 1) };
}

/* ── Nombres RK ── */
function nombreRk(rk) {
  let v;
  if (rk & 2) v = rk >> 2; /* entier signé sur 30 bits */
  else { const b = Buffer.alloc(8); b.writeUInt32LE((rk & 0xfffffffc) >>> 0, 4); v = b.readDoubleLE(0); }
  return rk & 1 ? v / 100 : v;
}

/* Enregistrements d'un flux « Workbook » : { type, data (suites incluses sous forme de liste de morceaux) } */
function* enregistrements(wb, debut) {
  let p = debut || 0;
  while (p + 4 <= wb.length) {
    const type = wb.readUInt16LE(p), lg = wb.readUInt16LE(p + 2); const d = wb.subarray(p + 4, p + 4 + lg); p += 4 + lg;
    const morceaux = [d];
    while (p + 4 <= wb.length && wb.readUInt16LE(p) === 0x003c) { const l2 = wb.readUInt16LE(p + 2); morceaux.push(wb.subarray(p + 4, p + 4 + l2)); p += 4 + l2; }
    yield { type, d, morceaux };
  }
}

function lire(buf) {
  const ole = lireOle(buf);
  if (ole.entrees.some(e => /^(_VBA_PROJECT_CUR|VBA|_VBA_PROJECT)$/i.test(e.nom) || /^Macros$/i.test(e.nom))) throw new ErreurClasseur("macros", "Ce classeur contient des macros : elles ne sont jamais exécutées et le classeur n'est pas affiché.");
  const flux = ole.entrees.find(e => e.type === 2 && /^(Workbook|Book)$/i.test(e.nom));
  if (!flux) throw new ErreurClasseur("pas_xls", "Ce fichier n'est pas un classeur Excel (.xls) valide.");
  const wb = ole.lireFlux(flux);
  if (wb.length < 8 || wb.readUInt16LE(0) !== 0x0809) throw new ErreurClasseur("pas_xls", "Ce fichier n'est pas un classeur Excel (.xls) valide.");
  if (wb.readUInt16LE(4) < 0x0600) throw new ErreurClasseur("xls_ancien", "Ce classeur date d'avant Excel 97 : ce très ancien format ne s'affiche pas. Enregistrez-le au format .xlsx puis importez-le de nouveau.");

  /* ── Partie « globale » : feuilles, chaînes partagées, formats, polices, styles ── */
  const cl = { date1904: false, styles: [], partages: [], feuilles: [], nbCellules: 0 };
  const defs = [], formats = {}, polices = []; const xfs = [];
  const supInternes = [], xti = []; /* « liens » de feuilles utilisés par les formules (Feuille2!A1) */
  for (const r of enregistrements(wb, 0)) {
    if (r.type === 0x002f) throw new ErreurClasseur("chiffre", "Ce classeur est protégé par un mot de passe : il ne peut pas s'afficher dans la page.");
    if (r.type === 0x0022) cl.date1904 = r.d.readUInt16LE(0) === 1;
    else if (r.type === 0x0085 && r.d.length > 8) { const t = chaineSimple(r.d, 6, 1); defs.push({ offset: r.d.readUInt32LE(0), etat: r.d[4], genre: r.d[5], nom: t.texte }); }
    else if (r.type === 0x041e) formats[r.d.readUInt16LE(0)] = chaineSimple(r.d, 2, 2).texte;
    else if (r.type === 0x0031) polices.push({ b: r.d.readUInt16LE(6) >= 700, i: !!(r.d.readUInt16LE(2) & 2) });
    else if (r.type === 0x00e0) xfs.push({ font: r.d.readUInt16LE(0), fmt: r.d.readUInt16LE(2), al: r.d[6] & 7, wrap: !!(r.d[6] & 8) });
    else if (r.type === 0x00fc) {
      /* table des chaînes partagées */
      try {
        const f = new Flux(r.morceaux); f.u32(); const n = f.u32();
        for (let k = 0; k < n; k++) {
          const lg = f.u16(), opt = f.u8(); const runs = opt & 8 ? f.u16() : 0, ext = opt & 4 ? f.u32() : 0;
          cl.partages.push(f.lettres(lg, !!(opt & 1))); f.ignorer(runs * 4 + ext);
        }
      } catch (_) { /* table tronquée : on garde ce qui a été lu */ }
    }
    else if (r.type === 0x01ae && r.d.length >= 4) supInternes.push(r.d.readUInt16LE(2) === 0x0401); /* 0x0401 = ce classeur lui-même */
    else if (r.type === 0x0017 && r.d.length >= 2) {
      const n = Math.min(r.d.readUInt16LE(0), Math.floor((r.d.length - 2) / 6));
      for (let k = 0; k < n; k++) { const p = 2 + k * 6; xti.push(supInternes[r.d.readUInt16LE(p)] ? [r.d.readUInt16LE(p + 2), r.d.readUInt16LE(p + 4)] : null); }
    }
    else if (r.type === 0x000a) break; /* fin de la partie globale */
  }
  if (!defs.length) throw new ErreurClasseur("pas_xls", "Ce classeur ne contient aucune feuille.");
  const fontDe = i => (i >= 5 ? polices[i - 1] : polices[i]) || {};
  const ALIGN = { 1: "left", 2: "center", 3: "right" };
  cl.styles = xfs.map(x => { const o = { fmt: formats[x.fmt] || XL.FORMATS_INTEGRES[x.fmt] || "General" }; const f = fontDe(x.font); if (f.b) o.b = 1; if (f.i) o.i = 1; if (ALIGN[x.al]) o.al = ALIGN[x.al]; if (x.wrap) o.wrap = 1; return o; });
  if (!cl.styles.length) cl.styles.push({ fmt: "General" });

  /* ── Feuilles ── */
  for (const def of defs) {
    if (def.etat !== 0 || def.genre !== 0) continue; /* masquées ou feuilles de graphique : non montrées */
    const f = { nom: def.nom || "Feuille", lignes: new Map(), nbLignes: 0, nbColonnes: 0, merges: [], largeurs: {} };
    const masquees = new Set(); let nbC = 0, derniere = null, debut = true;
    const partagees = new Map(), attente = []; /* formules partagées / matricielles : le texte est dans un enregistrement à part, résolu en fin de feuille */
    const poser = (r, c, cell) => {
      if (c >= XL.MAX_COLONNES || !cell) return null;
      let m = f.lignes.get(r); if (!m) { m = new Map(); f.lignes.set(r, m); }
      m.set(c, cell); nbC++;
      if (nbC > XL.MAX_CELLULES) throw new ErreurClasseur("trop_gros", `Cette feuille contient plus de ${XL.MAX_CELLULES.toLocaleString("fr-FR")} cellules : elle est trop volumineuse pour s'afficher dans la page.`);
      if (c + 1 > f.nbColonnes) f.nbColonnes = c + 1; if (r + 1 > f.nbLignes) f.nbLignes = r + 1;
      return cell;
    };
    const contexteF = { feuilles: defs.map(x => x.nom), xti, partagees: (r, c) => partagees.get(r + "," + c) };
    /* Texte de formule posé sur la cellule : tout de suite, ou en fin de feuille pour une formule partagée (jeton « Exp »). */
    const formule = (cell, rgce, lig, c) => {
      if (!cell || !rgce || !rgce.length) return;
      if (rgce[0] === 0x01) attente.push({ cell, rgce, ou: { r: lig, c } });
      else { const t = FM.decompiler(rgce, { r: lig, c }, contexteF); if (t) cell.f = t; }
    };
    const nombre = (xf, v) => { const st = cl.styles[xf] || cl.styles[0]; return { t: formaterNombre(v, st.fmt, cl.date1904), v, ...(xf ? { s: xf } : {}) }; };
    const texte = (xf, t) => (t === "" ? null : { t, ...(xf ? { s: xf } : {}) });
    for (const r of enregistrements(wb, def.offset)) {
      const d = r.d;
      if (debut) { debut = false; continue; } /* BOF de la feuille */
      if (r.type === 0x000a) break;
      if (r.type === 0x00fd) poser(d.readUInt16LE(0), d.readUInt16LE(2), texte(d.readUInt16LE(4), cl.partages[d.readUInt32LE(6)] || ""));
      else if (r.type === 0x0203) poser(d.readUInt16LE(0), d.readUInt16LE(2), nombre(d.readUInt16LE(4), d.readDoubleLE(6)));
      else if (r.type === 0x027e) poser(d.readUInt16LE(0), d.readUInt16LE(2), nombre(d.readUInt16LE(4), nombreRk(d.readUInt32LE(6))));
      else if (r.type === 0x00bd) {
        const lig = d.readUInt16LE(0), c0 = d.readUInt16LE(2), n = (d.length - 6) / 6;
        for (let k = 0; k < n; k++) poser(lig, c0 + k, nombre(d.readUInt16LE(4 + k * 6), nombreRk(d.readUInt32LE(6 + k * 6))));
      }
      else if (r.type === 0x0204) { const t = chaineSimple(d, 6, 2); poser(d.readUInt16LE(0), d.readUInt16LE(2), texte(d.readUInt16LE(4), t.texte)); }
      else if (r.type === 0x0205) {
        const lig = d.readUInt16LE(0), c = d.readUInt16LE(2), xf = d.readUInt16LE(4), v = d[6];
        const ERR = { 0: "#NUL!", 7: "#DIV/0!", 15: "#VALEUR!", 23: "#REF!", 29: "#NOM?", 36: "#NOMBRE!", 42: "#N/A" };
        poser(lig, c, d[7] ? { t: ERR[v] || "#ERREUR", y: "e", ...(xf ? { s: xf } : {}) } : { t: v ? "VRAI" : "FAUX", y: "b", ...(xf ? { s: xf } : {}) });
      }
      else if (r.type === 0x0006) {
        /* formule : seule la dernière valeur enregistrée est montrée */
        const lig = d.readUInt16LE(0), c = d.readUInt16LE(2), xf = d.readUInt16LE(4);
        const cce = d.length >= 22 ? d.readUInt16LE(20) : 0, rgce = cce && d.length >= 22 + cce ? d.subarray(22, 22 + cce) : null;
        if (d.readUInt16LE(12) === 0xffff) {
          const g = d[6];
          if (g === 0) derniere = { lig, c, xf, rgce }; /* le texte suit dans un enregistrement STRING */
          else if (g === 1) formule(poser(lig, c, { t: d[8] ? "VRAI" : "FAUX", y: "b", ...(xf ? { s: xf } : {}) }), rgce, lig, c);
          else if (g === 2) formule(poser(lig, c, { t: "#ERREUR", y: "e", ...(xf ? { s: xf } : {}) }), rgce, lig, c);
        } else formule(poser(lig, c, nombre(xf, d.readDoubleLE(6))), rgce, lig, c);
      }
      else if (r.type === 0x0207 && derniere) { const t = chaineSimple(d, 0, 2); formule(poser(derniere.lig, derniere.c, texte(derniere.xf, t.texte)), derniere.rgce, derniere.lig, derniere.c); derniere = null; }
      else if (r.type === 0x04bc && d.length >= 10) { const cce = d.readUInt16LE(8); if (d.length >= 10 + cce) partagees.set(d.readUInt16LE(0) + "," + d[4], d.subarray(10, 10 + cce)); } /* formule partagée : ancre = première cellule de la plage */
      else if (r.type === 0x0221 && d.length >= 14) { const cce = d.readUInt16LE(12); if (d.length >= 14 + cce) partagees.set(d.readUInt16LE(0) + "," + d[4], d.subarray(14, 14 + cce)); } /* formule matricielle */
      else if (r.type === 0x00e5) {
        const n = d.readUInt16LE(0);
        for (let k = 0; k < n && 2 + k * 8 + 8 <= d.length; k++) {
          const p = 2 + k * 8, r1 = d.readUInt16LE(p), r2 = d.readUInt16LE(p + 2), c1 = d.readUInt16LE(p + 4), c2 = d.readUInt16LE(p + 6);
          if (r2 > r1 || c2 > c1) f.merges.push({ r: r1, c: c1, rs: r2 - r1 + 1, cs: c2 - c1 + 1 });
        }
      }
      else if (r.type === 0x007d && d.length >= 12) {
        const c1 = d.readUInt16LE(0), c2 = Math.min(d.readUInt16LE(2), XL.MAX_COLONNES - 1), w = d.readUInt16LE(4);
        if (!(d.readUInt16LE(8) & 1)) for (let c = c1; c <= c2; c++) f.largeurs[c] = Math.round(w / 256 * 7 + 5);
      }
      else if (r.type === 0x0208 && d.length >= 14) { if (d.readUInt16LE(12) & 0x20) masquees.add(d.readUInt16LE(0)); }
    }
    for (const a of attente) { const t = FM.decompiler(a.rgce, a.ou, contexteF); if (t) a.cell.f = t; }
    masquees.forEach(r => f.lignes.delete(r));
    f.nbLignes = 0; f.lignes.forEach((_, r) => { if (r + 1 > f.nbLignes) f.nbLignes = r + 1; });
    for (const m of f.merges) { if (m.r + m.rs > f.nbLignes) f.nbLignes = m.r + m.rs; if (Math.min(m.c + m.cs, XL.MAX_COLONNES) > f.nbColonnes) f.nbColonnes = Math.min(m.c + m.cs, XL.MAX_COLONNES); }
    cl.nbCellules += nbC; cl.feuilles.push(f);
  }
  if (!cl.feuilles.length) throw new ErreurClasseur("pas_xls", "Ce classeur ne contient aucune feuille visible.");
  return cl;
}

/* Toute lecture d'un fichier endommagé ou piégé aboutit à une erreur claire (jamais à une exception technique). */
function ouvrir(buf) {
  try { return lire(buf); }
  catch (e) { if (e instanceof ErreurClasseur) throw e; throw new ErreurClasseur("pas_xls", "Classeur .xls endommagé ou illisible."); }
}

module.exports = { ouvrir };
