/* ═════════════════════════════════════════════════
   server/xlsx-lecteur.js — lecteur de classeurs Excel (.xlsx) en LECTURE SEULE, sans bibliothèque tierce (2026-10-30)

   Utilisé par la visionneuse Excel des formations (server/formation-documents.js). Ce que ce lecteur fait : ouvrir l'archive ZIP (zlib de Node),
   lire les feuilles, les chaînes partagées, les formules (texte) avec leur dernière valeur calculée, les cellules fusionnées, les largeurs de colonnes,
   les formats de nombres et de dates, et quelques styles (gras, italique, couleur du texte, couleur de fond, alignement, retour à la ligne).

   Ce qu'il ne fait PAS (limites à connaître) : aucune macro n'est lue ni exécutée (un classeur .xlsm est refusé) ; les formules ne sont pas recalculées (on montre la
   dernière valeur enregistrée par Excel, et le texte de la formule) ; graphiques, images, formes, tableaux croisés dynamiques, mises en forme conditionnelles, bordures
   et couleurs de thème ne sont pas dessinés (les valeurs des tableaux croisés sont lues comme de simples cellules) ; l'ancien format .xls est lu par server/xls-lecteur.js.

   Défenses : taille de l'archive, nombre d'entrées, taille décompressée par entrée et au total (bombe de décompression), nombre de cellules.
   ═════════════════════════════════════════════════ */
"use strict";
const zlib = require("node:zlib");

const MAX_ENTREES = 3000;
const MAX_ENTREE = 60 * 1024 * 1024;       /* une feuille décompressée : 60 Mo au plus */
const MAX_TOTAL = 200 * 1024 * 1024;       /* tout le classeur décompressé : 200 Mo au plus */
const MAX_CELLULES = 600000;               /* au-delà, le classeur est refusé plutôt que de saturer la mémoire */
const MAX_COLONNES = 200;                  /* colonnes montrées (A…GR) */

class ErreurClasseur extends Error { constructor(code, message) { super(message); this.code = code; } }

/* ── ZIP ── */
function listerZip(buf) {
  if (buf.length < 22 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new ErreurClasseur("pas_zip", "Ce fichier n'est pas un classeur Excel (.xlsx).");
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new ErreurClasseur("zip_invalide", "Archive illisible.");
  const n = buf.readUInt16LE(eocd + 10), off = buf.readUInt32LE(eocd + 16);
  if (n > MAX_ENTREES) throw new ErreurClasseur("trop_gros", "Ce classeur contient trop de fichiers internes.");
  const entrees = new Map(); let p = off, total = 0;
  for (let k = 0; k < n; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ErreurClasseur("zip_invalide", "Archive illisible.");
    const methode = buf.readUInt16LE(p + 10), tComp = buf.readUInt32LE(p + 20), tReel = buf.readUInt32LE(p + 24);
    const ln = buf.readUInt16LE(p + 28), le = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const nom = buf.slice(p + 46, p + 46 + ln).toString("utf8");
    total += tReel;
    if (tReel > MAX_ENTREE || total > MAX_TOTAL) throw new ErreurClasseur("trop_gros", "Ce classeur est trop volumineux une fois décompressé.");
    if (!nom.includes("..")) entrees.set(nom, { methode, tComp, tReel, local });
    p += 46 + ln + le + lc;
  }
  return entrees;
}
function lireEntree(buf, entrees, nom) {
  const e = entrees.get(nom); if (!e) return null;
  const p = e.local; if (p + 30 > buf.length || buf.readUInt32LE(p) !== 0x04034b50) throw new ErreurClasseur("zip_invalide", "Archive illisible.");
  const debut = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const donnees = buf.slice(debut, debut + e.tComp);
  if (e.methode === 0) return donnees.toString("utf8");
  if (e.methode !== 8) throw new ErreurClasseur("zip_invalide", "Méthode de compression non prise en charge.");
  try { return zlib.inflateRawSync(donnees, { maxOutputLength: MAX_ENTREE }).toString("utf8"); }
  catch (_) { throw new ErreurClasseur("trop_gros", "Contenu du classeur illisible ou trop volumineux."); }
}

/* ── XML minimal ── */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const deXml = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  if (e[0] === "#") { const c = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(c) && c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; }
  return ENT[e.toLowerCase()] || m;
}).replace(/_x([0-9a-fA-F]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
function attrs(s) { const o = {}; String(s || "").replace(/([\w:.-]+)\s*=\s*"([^"]*)"/g, (m, k, v) => { o[k] = deXml(v); return ""; }); return o; }
/* Texte des balises <t>…</t> d'un fragment (chaînes partagées, chaînes en ligne), sans les aperçus phonétiques <rPh>. */
function texteT(frag) {
  const sans = String(frag).replace(/<rPh[\s\S]*?<\/rPh>/g, "");
  let t = ""; sans.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g, (m, x) => { t += deXml(x || ""); return ""; });
  return t;
}

/* ── Références de cellules ── */
const colNom = i => { let s = ""; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
const colIndex = L => { let n = 0; for (const ch of L) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
function refVers(ref) { const m = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/.exec(String(ref || "").trim().toUpperCase()); return m ? { c: colIndex(m[1]), r: Number(m[2]) - 1 } : null; }

/* ── Formats de nombres ── */
const FORMATS_INTEGRES = { 0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 11: "0.00E+00", 12: "# ?/?", 13: "# ??/??", 14: "dd/mm/yyyy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy",
  18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "dd/mm/yyyy h:mm", 37: "#,##0;(#,##0)", 38: "#,##0;[Red](#,##0)", 39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss", 46: "[h]:mm:ss", 47: "mm:ss.0", 48: "##0.0E+0", 49: "@" };
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const SEP_MILLIERS = " ";

function sectionDe(code, v) {
  const sec = []; let cur = "", q = false, esc = false, cr = false;
  for (const ch of code) {
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === "\\") { cur += ch; esc = true; continue; }
    if (ch === '"') q = !q; else if (ch === "[" && !q) cr = true; else if (ch === "]" && !q) cr = false;
    if (ch === ";" && !q && !cr) { sec.push(cur); cur = ""; } else cur += ch;
  }
  sec.push(cur);
  if (sec.length === 1) return { code: sec[0], neg: false };
  if (v < 0 && sec.length >= 2) return { code: sec[1], neg: true };
  if (v === 0 && sec.length >= 3) return { code: sec[2], neg: false };
  return { code: sec[0], neg: false };
}
const estFormatDate = code => { const nu = String(code).replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[(?!h|m|s)[^\]]*\]/gi, ""); return /[ymdhs]/i.test(nu) && !/^General$/i.test(nu.trim()); };
function dateDeSerie(n, date1904) {
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = Math.round(n * 86400000); const d = new Date(base + ms);
  return Number.isNaN(d.getTime()) ? null : d;
}
function formaterDate(n, code, date1904) {
  const d = dateDeSerie(n, date1904); if (!d) return null;
  const ap = /AM\/PM|A\/P/i.test(code);
  const pad = (x, l) => String(x).padStart(l, "0");
  let out = "", i = 0, apres_h = false; const s = code;
  while (i < s.length) {
    const ch = s[i], reste = s.slice(i);
    if (ch === '"') { const j = s.indexOf('"', i + 1); out += s.slice(i + 1, j < 0 ? s.length : j); i = j < 0 ? s.length : j + 1; continue; }
    if (ch === "\\") { out += s[i + 1] || ""; i += 2; continue; }
    if (ch === "[") { const j = s.indexOf("]", i); const inner = s.slice(i + 1, j < 0 ? s.length : j); if (/^\$/.test(inner)) out += inner.replace(/^\$([^-]*).*$/, "$1"); i = j < 0 ? s.length : j + 1; continue; }
    if (ch === "_" || ch === "*") { i += 2; continue; }
    let m;
    if ((m = /^(AM\/PM|A\/P)/i.exec(reste))) { out += d.getUTCHours() < 12 ? "AM" : "PM"; i += m[0].length; continue; }
    if ((m = /^y{3,4}/i.exec(reste))) { out += d.getUTCFullYear(); i += m[0].length; continue; }
    if ((m = /^yy?/i.exec(reste))) { out += pad(d.getUTCFullYear() % 100, 2); i += m[0].length; continue; }
    if ((m = /^m{5}/i.exec(reste))) { out += MOIS[d.getUTCMonth()][0].toUpperCase(); i += 5; continue; }
    if ((m = /^m{4}/i.exec(reste))) { out += MOIS[d.getUTCMonth()]; i += 4; continue; }
    if ((m = /^m{3}/i.exec(reste))) { out += MOIS_COURTS[d.getUTCMonth()]; i += 3; continue; }
    if ((m = /^m{1,2}/i.exec(reste))) {
      /* « m » après une heure ou avant des secondes = minutes, sinon mois */
      const avantS = /^m{1,2}[^a-z]*s/i.test(reste.replace(/"[^"]*"/g, ""));
      if (apres_h || avantS) { out += m[0].length === 2 ? pad(d.getUTCMinutes(), 2) : d.getUTCMinutes(); } else out += m[0].length === 2 ? pad(d.getUTCMonth() + 1, 2) : d.getUTCMonth() + 1;
      i += m[0].length; apres_h = false; continue;
    }
    if ((m = /^d{4}/i.exec(reste))) { out += JOURS[d.getUTCDay()]; i += 4; continue; }
    if ((m = /^d{3}/i.exec(reste))) { out += JOURS[d.getUTCDay()].slice(0, 3) + "."; i += 3; continue; }
    if ((m = /^d{1,2}/i.exec(reste))) { out += m[0].length === 2 ? pad(d.getUTCDate(), 2) : d.getUTCDate(); i += m[0].length; continue; }
    if ((m = /^h{1,2}/i.exec(reste))) { let h = d.getUTCHours(); if (ap) h = h % 12 || 12; out += m[0].length === 2 ? pad(h, 2) : h; i += m[0].length; apres_h = true; continue; }
    if ((m = /^s{1,2}/i.exec(reste))) { out += m[0].length === 2 ? pad(d.getUTCSeconds(), 2) : d.getUTCSeconds(); i += m[0].length; continue; }
    out += ch; i++;
  }
  return out;
}
function arrondir(x, dec) { const f = Math.pow(10, dec); return Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9) / f; }
function formaterGeneral(v) {
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v) && Math.abs(v) < 1e11) return String(v);
  let s = String(Number(v.toPrecision(11)));
  if (/e/i.test(s)) s = Number(v.toPrecision(6)).toExponential().replace("e+", "E+").replace("e-", "E-");
  return s.replace(".", ",");
}
function formaterNombre(v, codeBrut, date1904) {
  if (!Number.isFinite(v)) return String(v);
  const code = String(codeBrut == null || codeBrut === "" ? "General" : codeBrut);
  if (/^General$/i.test(code.trim())) return formaterGeneral(v);
  const { code: sec, neg } = sectionDe(code, v);
  if (estFormatDate(sec)) { const t = formaterDate(v, sec, date1904); return t == null ? formaterGeneral(v) : t; }
  /* numérique : on isole le motif (0 # ? , . % et la partie exposant) ; les littéraux avant / après sont conservés */
  let pre = "", motif = "", post = "", etat = 0, q = false, esc = false;
  const estMotif = ch => "0#?,.%".includes(ch);
  for (let i = 0; i < sec.length; i++) {
    const ch = sec[i];
    const cible = lit => { if (etat === 0) pre += lit; else { etat = 2; post += lit; } };
    if (esc) { cible(ch); esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { q = !q; continue; }
    if (q) { cible(ch); continue; }
    if (ch === "[") { const j = sec.indexOf("]", i); const inner = sec.slice(i + 1, j < 0 ? sec.length : j); cible(/^\$/.test(inner) ? inner.replace(/^\$([^-]*).*$/, "$1") : ""); i = j < 0 ? sec.length : j; continue; }
    if (ch === "_") { cible(" "); i++; continue; }
    if (ch === "*") { i++; continue; }
    if (etat < 2 && /E/i.test(ch) && /[+-]/.test(sec[i + 1] || "") && etat === 1) { motif += ch + sec[i + 1]; i++; continue; }
    if (etat < 2 && estMotif(ch)) { etat = 1; motif += ch; continue; }
    cible(ch);
  }
  if (!motif) return (pre + post).replace(/@/g, formaterGeneral(v)) || formaterGeneral(v);
  let x = neg ? Math.abs(v) : v; const pct = (motif.match(/%/g) || []).length;
  if (pct) x *= Math.pow(100, pct);
  const mantisse = motif.replace(/%/g, "");
  const m10 = /^(.*?)E[+-](0+)$/i.exec(mantisse);
  let corps;
  if (m10) {
    const dec = ((m10[1].split(".")[1]) || "").length; const exp = x === 0 ? 0 : Math.floor(Math.log10(Math.abs(x)));
    const mant = x / Math.pow(10, exp); corps = arrondir(mant, dec).toFixed(dec).replace(".", ",") + "E" + (exp < 0 ? "-" : "+") + String(Math.abs(exp)).padStart(m10[2].length, "0");
  } else {
    const [ent0, dec0 = ""] = mantisse.split(".");
    const trailing = (ent0.match(/,+$/) || [""])[0].length; if (trailing) x /= Math.pow(1000, trailing);
    const entMotif = ent0.replace(/,+$/, ""); const milliers = entMotif.includes(",");
    const nDec = dec0.replace(/,/g, "").length, minEnt = (entMotif.replace(/,/g, "").match(/0/g) || []).length;
    let s = arrondir(Math.abs(x), nDec).toFixed(nDec); let [ei, di = ""] = s.split(".");
    const optionnelles = dec0.replace(/,/g, "").replace(/0/g, "").length; /* # ou ? en fin de partie décimale : zéros non obligatoires */
    if (optionnelles && di) { const obl = nDec - optionnelles; while (di.length > obl && di.endsWith("0")) di = di.slice(0, -1); }
    if (ei.length < minEnt) ei = ei.padStart(minEnt, "0"); else if (minEnt === 0 && ei === "0" && (di || nDec > 0)) ei = "";
    if (milliers) ei = ei.replace(/\B(?=(\d{3})+(?!\d))/g, SEP_MILLIERS);
    corps = ei + (di ? "," + di : "");
    if (!corps) corps = "0";
    if (x < 0 && Number(s) !== 0) corps = "-" + corps;
  }
  const signe = neg ? "" : "";
  return signe + pre + corps + (pct ? "%".repeat(pct) : "") + post;
}

/* ── Lecture du classeur ── */
function lireStyles(xml, formatsPerso) {
  const styles = [{ fmt: "General" }];
  if (!xml) return styles;
  const polices = [], remplissages = [];
  (/<fonts[\s\S]*?<\/fonts>/.exec(xml) || [""])[0].replace(/<font(?:\s[^>]*)?>([\s\S]*?)<\/font>|<font(?:\s[^>]*)?\/>/g, (m, x) => {
    const f = {}; x = x || "";
    if (/<b(?:\s[^>]*)?\/?>/.test(x) && !/<b\s+val="(0|false)"/i.test(x)) f.b = 1;
    if (/<i(?:\s[^>]*)?\/?>/.test(x) && !/<i\s+val="(0|false)"/i.test(x)) f.i = 1;
    const c = /<color\s+([^>]*?)\/?>/.exec(x); if (c) { const a = attrs(c[1]); if (a.rgb && /^[0-9a-f]{8}$/i.test(a.rgb)) f.c = "#" + a.rgb.slice(2); }
    polices.push(f); return "";
  });
  (/<fills[\s\S]*?<\/fills>/.exec(xml) || [""])[0].replace(/<fill>([\s\S]*?)<\/fill>/g, (m, x) => {
    const pf = /<patternFill\s*([^>]*?)\/?>([\s\S]*?)(?:<\/patternFill>|$)/.exec(x); const o = {};
    if (pf && /solid/.test(pf[1])) { const c = /<fgColor\s+([^>]*?)\/?>/.exec(pf[2] || ""); if (c) { const a = attrs(c[1]); if (a.rgb && /^[0-9a-f]{8}$/i.test(a.rgb)) o.bg = "#" + a.rgb.slice(2); } }
    remplissages.push(o); return "";
  });
  const xfs = (/<cellXfs[\s\S]*?<\/cellXfs>/.exec(xml) || [""])[0];
  styles.length = 0;
  xfs.replace(/<xf\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g, (m, a, inner) => {
    const at = attrs(a); const id = Number(at.numFmtId) || 0; const st = { fmt: formatsPerso[id] || FORMATS_INTEGRES[id] || "General" };
    const f = polices[Number(at.fontId)]; if (f) { if (f.b) st.b = 1; if (f.i) st.i = 1; if (f.c) st.c = f.c; }
    const r = remplissages[Number(at.fillId)]; if (r && r.bg) st.bg = r.bg;
    const al = /<alignment\s+([^>]*?)\/?>/.exec(inner || ""); if (al) { const aa = attrs(al[1]); if (["left", "center", "right"].includes(aa.horizontal)) st.al = aa.horizontal; if (aa.wrapText === "1" || aa.wrapText === "true") st.wrap = 1; }
    styles.push(st); return "";
  });
  if (!styles.length) styles.push({ fmt: "General" });
  return styles;
}

function ouvrir(buf) {
  if (!Buffer.isBuffer(buf)) throw new ErreurClasseur("pas_zip", "Fichier illisible.");
  const entrees = listerZip(buf);
  if ([...entrees.keys()].some(n => /vbaProject\.bin$/i.test(n))) throw new ErreurClasseur("macros", "Ce classeur contient des macros : elles ne sont jamais exécutées et le classeur n'est pas affiché.");
  const wbXml = lireEntree(buf, entrees, "xl/workbook.xml");
  if (!wbXml) throw new ErreurClasseur("pas_xlsx", "Ce fichier n'est pas un classeur Excel (.xlsx).");
  const date1904 = /<workbookPr[^>]*date1904="(1|true)"/i.test(wbXml);
  const rels = {}; (lireEntree(buf, entrees, "xl/_rels/workbook.xml.rels") || "").replace(/<Relationship\s+([^>]*?)\/?>/g, (m, a) => { const at = attrs(a); if (at.Id) rels[at.Id] = at.Target; return ""; });
  const feuillesDef = [];
  wbXml.replace(/<sheet\s+([^>]*?)\/?>/g, (m, a) => { const at = attrs(a); const cible = rels[at["r:id"]]; if (cible) feuillesDef.push({ nom: at.name || "Feuille", etat: at.state || "visible", chemin: cible.startsWith("/") ? cible.slice(1) : "xl/" + cible.replace(/^\.\//, "") }); return ""; });
  if (!feuillesDef.length) throw new ErreurClasseur("pas_xlsx", "Ce classeur ne contient aucune feuille.");
  const partages = []; (lireEntree(buf, entrees, "xl/sharedStrings.xml") || "").replace(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g, (m, x) => { partages.push(texteT(x || "")); return ""; });
  const stylesXml = lireEntree(buf, entrees, "xl/styles.xml") || "";
  const formatsPerso = {}; stylesXml.replace(/<numFmt\s+([^>]*?)\/?>/g, (m, a) => { const at = attrs(a); if (at.numFmtId) formatsPerso[Number(at.numFmtId)] = at.formatCode; return ""; });
  const styles = lireStyles(stylesXml, formatsPerso);
  const cl = { date1904, styles, partages, feuilles: [], nbCellules: 0 };
  for (const def of feuillesDef) {
    if (def.etat === "hidden" || def.etat === "veryHidden") continue; /* feuilles masquées : non montrées */
    const xml = lireEntree(buf, entrees, def.chemin); if (!xml) continue;
    cl.feuilles.push(lireFeuille(xml, def.nom, cl));
  }
  if (!cl.feuilles.length) throw new ErreurClasseur("pas_xlsx", "Ce classeur ne contient aucune feuille visible.");
  return cl;
}

function lireFeuille(xml, nom, cl) {
  const f = { nom, lignes: new Map(), nbLignes: 0, nbColonnes: 0, merges: [], largeurs: {} };
  (/<cols>([\s\S]*?)<\/cols>/.exec(xml) || ["", ""])[1].replace(/<col\s+([^>]*?)\/?>/g, (m, a) => {
    const at = attrs(a); const mn = Number(at.min) - 1, mx = Math.min(Number(at.max) - 1, MAX_COLONNES - 1), w = Number(at.width);
    if (Number.isFinite(mn) && Number.isFinite(w) && at.hidden !== "1") for (let c = mn; c <= mx; c++) f.largeurs[c] = Math.round(w * 7 + 5);
    return "";
  });
  (/<mergeCells[\s\S]*?<\/mergeCells>/.exec(xml) || [""])[0].replace(/<mergeCell\s+ref="([^"]+)"/g, (m, ref) => {
    const [a, b] = ref.split(":"); const p = refVers(a), q = refVers(b || a);
    if (p && q && (q.r > p.r || q.c > p.c)) f.merges.push({ r: p.r, c: p.c, rs: q.r - p.r + 1, cs: q.c - p.c + 1 });
    return "";
  });
  let nbC = 0;
  const reLigne = /<row\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g; let ml, auto = 0;
  while ((ml = reLigne.exec(xml))) {
    const at = attrs(ml[1]); const r = at.r ? Number(at.r) - 1 : auto; auto = r + 1;
    if (at.hidden === "1" || !ml[2]) continue;
    const cellules = new Map(); let autoC = 0;
    ml[2].replace(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (mc, a, inner) => {
      const ac = attrs(a); const p = refVers(ac.r); const c = p ? p.c : autoC; autoC = c + 1;
      if (c >= MAX_COLONNES) return "";
      const cell = lireCellule(ac, inner || "", cl);
      if (cell) { cellules.set(c, cell); nbC++; if (c + 1 > f.nbColonnes) f.nbColonnes = c + 1; }
      return "";
    });
    if (nbC > MAX_CELLULES) throw new ErreurClasseur("trop_gros", `Cette feuille contient plus de ${MAX_CELLULES.toLocaleString("fr-FR")} cellules : elle est trop volumineuse pour s'afficher dans la page.`);
    if (cellules.size) { f.lignes.set(r, cellules); if (r + 1 > f.nbLignes) f.nbLignes = r + 1; }
  }
  for (const m of f.merges) { if (m.r + m.rs > f.nbLignes) f.nbLignes = m.r + m.rs; if (Math.min(m.c + m.cs, MAX_COLONNES) > f.nbColonnes) f.nbColonnes = Math.min(m.c + m.cs, MAX_COLONNES); }
  cl.nbCellules += nbC;
  return f;
}

function lireCellule(ac, inner, cl) {
  const t = ac.t || "n"; const s = Number(ac.s) || 0; const st = cl.styles[s] || cl.styles[0] || { fmt: "General" };
  const fm = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(inner); const formule = fm ? deXml(fm[1]).trim() : (/<f\s[^>]*t="shared"[^>]*\/>/.test(inner) ? "(formule partagée)" : "");
  const vm = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner); const brut = vm ? deXml(vm[1]) : null;
  let texte = "", num = null, type = "s";
  if (t === "s") { texte = cl.partages[Number(brut)] != null ? cl.partages[Number(brut)] : ""; }
  else if (t === "inlineStr") texte = texteT((/<is>([\s\S]*?)<\/is>/.exec(inner) || ["", ""])[1]);
  else if (t === "str") texte = brut == null ? "" : brut;
  else if (t === "b") { texte = brut === "1" ? "VRAI" : "FAUX"; type = "b"; }
  else if (t === "e") { texte = brut || "#ERREUR"; type = "e"; }
  else if (t === "d") { texte = brut || ""; type = "d"; }
  else if (brut != null && brut !== "") { const v = Number(brut); if (Number.isFinite(v)) { num = v; type = "n"; texte = formaterNombre(v, st.fmt, cl.date1904); } else texte = brut; }
  if (texte === "" && !formule && num == null) {
    if (!(st.bg)) return null; /* cellule vide mais colorée : on la garde pour que les fonds s'affichent */
  }
  const cell = { t: texte };
  if (num != null) cell.v = num;
  if (type !== "s") cell.y = type;
  if (formule) cell.f = formule.slice(0, 400);
  if (s) { cell.s = s; }
  return cell;
}

/* ── Fenêtre de lecture ── */
function resume(cl) {
  return { feuilles: cl.feuilles.map((f, i) => ({ i, nom: f.nom, lignes: f.nbLignes, colonnes: f.nbColonnes })), nb_cellules: cl.nbCellules,
    styles: cl.styles.map(s => ({ b: s.b || undefined, i: s.i || undefined, c: s.c || undefined, bg: s.bg || undefined, al: s.al || undefined, wrap: s.wrap || undefined })) };
}
function fenetre(cl, i, debut, n) {
  const f = cl.feuilles[i]; if (!f) throw new ErreurClasseur("feuille_inconnue", "Feuille introuvable.");
  debut = Math.max(0, Math.floor(Number(debut) || 0)); n = Math.min(500, Math.max(1, Math.floor(Number(n) || 100)));
  const fin = Math.min(f.nbLignes, debut + n); const cols = f.nbColonnes; const lignes = [];
  for (let r = debut; r < fin; r++) {
    const m = f.lignes.get(r); if (!m) { lignes.push(null); continue; }
    const row = new Array(cols).fill(null); m.forEach((c, k) => { if (k < cols) row[k] = c; }); lignes.push(row);
  }
  const merges = f.merges.filter(m => m.r < fin && m.r + m.rs > debut);
  const largeurs = []; for (let c = 0; c < cols; c++) largeurs.push(f.largeurs[c] || null);
  return { feuille: i, nom: f.nom, debut, fin, total: f.nbLignes, colonnes: cols, noms_colonnes: Array.from({ length: cols }, (_, c) => colNom(c)), lignes, merges, largeurs };
}

/* Texte d'un classeur pour l'assistant pédagogique : « Feuille / B12 = valeur (formule : …) », borné en taille. */
function exporterTexte(cl, maxCar) {
  maxCar = maxCar || 60000; const out = []; let n = 0; let tronque = false;
  for (const f of cl.feuilles) {
    const tete = `Feuille « ${f.nom} » (${f.nbLignes} lignes × ${f.nbColonnes} colonnes)`; out.push(tete); n += tete.length;
    const rangs = [...f.lignes.keys()].sort((a, b) => a - b);
    for (const r of rangs) {
      const parts = [];
      f.lignes.get(r).forEach((c, k) => { if (c.t === "" && !c.f) return; parts.push(`${colNom(k)}${r + 1} = ${c.t === "" ? "(vide)" : c.t}${c.f ? ` [formule : =${c.f.replace(/^=/, "")}]` : ""}`); });
      if (!parts.length) continue; const l = parts.join(" ; ");
      if (n + l.length > maxCar) { tronque = true; break; } out.push(l); n += l.length + 1;
    }
    if (tronque) { out.push("(… contenu tronqué : classeur trop long)"); break; }
  }
  return out.join("\n");
}

module.exports = { ouvrir, resume, fenetre, exporterTexte, formaterNombre, colNom, refVers, ErreurClasseur, MAX_COLONNES, MAX_CELLULES, FORMATS_INTEGRES };
