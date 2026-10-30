/* ═════════════════════════════════════════════════
   server/pdf-simple.js — petit constructeur de PDF sans bibliothèque (2026-10-30).
   Pages, rectangles, lignes, texte (6 polices standard, accents français), texte pivoté, transparence, QR code en vecteurs, lien cliquable.
   Les coordonnées s'écrivent en POINTS depuis le COIN HAUT-GAUCHE (comme à l'écran) ; la conversion vers le repère du PDF est faite ici.
   Aucun fichier extérieur : pas de police intégrée (les polices standard sont connues de tout lecteur de PDF), pas d'image.
   ═════════════════════════════════════════════════ */
"use strict";

const zlib = require("zlib");
const METRIQUES = require("./pdf-metrics");

const POLICES = { "Helvetica": "Helvetica", "Helvetica-Bold": "Helvetica-Bold", "Helvetica-Oblique": "Helvetica-Oblique", "Times-Roman": "Times-Roman", "Times-Bold": "Times-Bold", "Times-Italic": "Times-Italic" };
const MM = 72 / 25.4;

/* Unicode → octet cp1252 (WinAnsi) ; ce qui n'existe pas devient « ? ». */
const SPECIAUX = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e,
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
/* caractères invisibles ou séparateurs de ligne, sans valeur dans un PDF (écrits par code : un séparateur de ligne littéral casserait le fichier) */
const INVISIBLES = new RegExp("[" + [0xad, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029].map(c => String.fromCharCode(c)).join("") + "]", "g");
function versOctets(texte) {
  const sortie = [];
  for (const c of String(texte == null ? "" : texte).replace(INVISIBLES, "")) {
    const code = c.codePointAt(0);
    if (c === "\n" || c === "\t") sortie.push(0x20);
    else if (code >= 0x20 && code < 0x7f) sortie.push(code);
    else if (code >= 0xa0 && code <= 0xff) sortie.push(code);
    else if (SPECIAUX[c] !== undefined) sortie.push(SPECIAUX[c]);
    else if (code === 0xa0 || code === 0x202f) sortie.push(0x20);
    else sortie.push(0x3f);
  }
  return sortie;
}
const chaineTexte = octets => "(" + octets.map(o => (o === 0x28 || o === 0x29 || o === 0x5c ? "\\" + String.fromCharCode(o) : (o < 0x20 || o > 0x7e ? "\\" + o.toString(8).padStart(3, "0") : String.fromCharCode(o)))).join("") + ")";
const nombre = n => (Math.round(Number(n) * 1000) / 1000).toString();
const couleurRg = c => {
  const h = String(c || "#000000").replace("#", "");
  const v = h.length === 3 ? h.split("").map(x => x + x).join("") : h.padEnd(6, "0");
  return [0, 2, 4].map(i => nombre(parseInt(v.slice(i, i + 2), 16) / 255)).join(" ");
};

function largeurTexte(texte, police, taille, espacement) {
  const t = METRIQUES[police] || METRIQUES.Helvetica;
  const o = versOctets(texte);
  return o.reduce((s, c) => s + (t[c] || 0), 0) * taille / 1000 + (espacement || 0) * o.length;
}

/* Coupe un texte en lignes qui tiennent dans la largeur donnée (coupe aux espaces ; un mot trop long est coupé de force). */
function decouper(texte, police, taille, largeur) {
  const lignes = [];
  for (const paragraphe of String(texte == null ? "" : texte).split(/\n/)) {
    let courante = "";
    for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
      const essai = courante ? courante + " " + mot : mot;
      if (largeurTexte(essai, police, taille) <= largeur) { courante = essai; continue; }
      if (courante) lignes.push(courante);
      let reste = mot;
      while (largeurTexte(reste, police, taille) > largeur && reste.length > 1) {
        let n = reste.length - 1;
        while (n > 1 && largeurTexte(reste.slice(0, n), police, taille) > largeur) n--;
        lignes.push(reste.slice(0, n)); reste = reste.slice(n);
      }
      courante = reste;
    }
    lignes.push(courante);
  }
  return lignes;
}

class Page {
  constructor(pdf, largeur, hauteur) { this.pdf = pdf; this.l = largeur; this.h = hauteur; this.ops = []; this.polices = new Set(); this.etats = new Set(); this.liens = []; }
  y(v) { return this.h - v; }
  _op(s) { this.ops.push(s); return this; }
  /* rectangle plein et/ou contour */
  rect(x, y, w, h, o) {
    o = o || {};
    const rempli = o.fond != null, trace = o.contour != null;
    if (!rempli && !trace) return this;
    this._op("q");
    if (o.alpha != null) this._op(this._etat(o.alpha));
    if (rempli) this._op(couleurRg(o.fond) + " rg");
    if (trace) this._op(couleurRg(o.contour) + " RG " + nombre(o.epaisseur || 1) + " w");
    this._op(`${nombre(x)} ${nombre(this.y(y + h))} ${nombre(w)} ${nombre(h)} re ${rempli && trace ? "B" : rempli ? "f" : "S"}`);
    return this._op("Q");
  }
  ligne(x1, y1, x2, y2, o) {
    o = o || {};
    return this._op(`q ${couleurRg(o.couleur || "#000")} RG ${nombre(o.epaisseur || 1)} w ${nombre(x1)} ${nombre(this.y(y1))} m ${nombre(x2)} ${nombre(this.y(y2))} l S Q`);
  }
  _etat(alpha) { const nom = "G" + String(Math.round(alpha * 100)); this.etats.add(Math.round(alpha * 100)); return "/" + nom + " gs"; }
  /* Texte. align : left | center | right (par rapport à x). angle : en degrés (90 = lu de bas en haut). espacement : pas entre lettres, en points. */
  texte(txt, x, y, o) {
    o = o || {};
    const police = POLICES[o.police] || "Helvetica", taille = o.taille || 12, esp = o.espacement || 0;
    const w = largeurTexte(txt, police, taille, esp);
    let dx = 0;
    if (o.align === "center") dx = -w / 2; else if (o.align === "right") dx = -w;
    this.polices.add(police);
    const octets = versOctets(txt);
    if (!octets.length) return this;
    const nomPolice = "/F" + Object.keys(POLICES).indexOf(police);
    /* angle en degrés, sens inverse des aiguilles d'une montre (90 = le texte monte) ; l'alignement se fait le long de la direction du texte */
    const rad = (o.angle || 0) * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    const tm = `${nombre(c)} ${nombre(s)} ${nombre(-s)} ${nombre(c)} ${nombre(x + dx * c)} ${nombre(this.y(y) + dx * s)} Tm`;
    this._op("q");
    if (o.alpha != null) this._op(this._etat(o.alpha));
    this._op(`BT ${couleurRg(o.couleur || "#000")} rg ${nomPolice} ${nombre(taille)} Tf ${esp ? nombre(esp) + " Tc " : ""}${tm} ${chaineTexte(octets)} Tj ET`);
    return this._op("Q");
  }
  /* Texte sur plusieurs lignes dans une largeur donnée ; renvoie le y suivant. */
  paragraphe(txt, x, y, largeur, o) {
    o = o || {};
    const taille = o.taille || 12, interligne = o.interligne || taille * 1.35;
    const lignes = decouper(txt, POLICES[o.police] || "Helvetica", taille, largeur);
    lignes.forEach((l, i) => this.texte(l, o.align === "center" ? x + largeur / 2 : o.align === "right" ? x + largeur : x, y + i * interligne, o));
    return y + lignes.length * interligne;
  }
  /* QR code en vecteurs : une série horizontale de modules sombres = un seul rectangle. */
  qr(matrice, x, y, cote, o) {
    o = o || {};
    const marge = o.marge == null ? 4 : o.marge, n = matrice.taille, pas = cote / (n + 2 * marge);
    if (o.fond) this.rect(x, y, cote, cote, { fond: o.fond });
    this._op(`q ${couleurRg(o.couleur || "#000")} rg`);
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!matrice.modules[r][c]) { c++; continue; }
        let f = c; while (f < n && matrice.modules[r][f]) f++;
        this._op(`${nombre(x + (marge + c) * pas)} ${nombre(this.y(y + (marge + r + 1) * pas))} ${nombre((f - c) * pas)} ${nombre(pas)} re`);
        c = f;
      }
    }
    return this._op("f Q");
  }
  lien(x, y, w, h, url) { this.liens.push({ x, y, w, h, url }); return this; }
}

class Pdf {
  constructor(infos) { this.pages = []; this.infos = infos || {}; }
  page(largeur, hauteur) { const p = new Page(this, largeur, hauteur); this.pages.push(p); return p; }
  build() {
    const objets = [null]; /* 1..n, l'index 0 est inutilisé */
    const ajouter = contenu => { objets.push(contenu); return objets.length - 1; };
    const racine = ajouter(null), arbre = ajouter(null);
    const polices = {};
    Object.keys(POLICES).forEach((nom, i) => { polices[i] = ajouter(Buffer.from(`<< /Type /Font /Subtype /Type1 /BaseFont /${nom} /Encoding /WinAnsiEncoding >>`)); });
    const etatsTous = new Set();
    this.pages.forEach(p => p.etats.forEach(a => etatsTous.add(a)));
    const etats = {};
    [...etatsTous].forEach(a => { etats[a] = ajouter(Buffer.from(`<< /Type /ExtGState /ca ${nombre(a / 100)} /CA ${nombre(a / 100)} >>`)); });
    const ressources = `<< /Font << ${Object.keys(polices).map(i => `/F${i} ${polices[i]} 0 R`).join(" ")} >>${Object.keys(etats).length ? ` /ExtGState << ${Object.keys(etats).map(a => `/G${a} ${etats[a]} 0 R`).join(" ")} >>` : ""} >>`;
    const refsPages = [];
    for (const p of this.pages) {
      const flux = zlib.deflateSync(Buffer.from(p.ops.join("\n"), "latin1"));
      const contenu = ajouter(Buffer.concat([Buffer.from(`<< /Length ${flux.length} /Filter /FlateDecode >>\nstream\n`), flux, Buffer.from("\nendstream")]));
      const annots = p.liens.map(l => ajouter(Buffer.from(`<< /Type /Annot /Subtype /Link /Rect [${nombre(l.x)} ${nombre(p.y(l.y + l.h))} ${nombre(l.x + l.w)} ${nombre(p.y(l.y))}] /Border [0 0 0] /A << /S /URI /URI ${chaineTexte(versOctets(l.url))} >> >>`)));
      const ref = ajouter(Buffer.from(`<< /Type /Page /Parent ${arbre} 0 R /MediaBox [0 0 ${nombre(p.l)} ${nombre(p.h)}] /Resources ${ressources} /Contents ${contenu} 0 R${annots.length ? ` /Annots [${annots.map(a => a + " 0 R").join(" ")}]` : ""} >>`));
      refsPages.push(ref);
    }
    objets[arbre] = Buffer.from(`<< /Type /Pages /Kids [${refsPages.map(r => r + " 0 R").join(" ")}] /Count ${refsPages.length} >>`);
    objets[racine] = Buffer.from(`<< /Type /Catalog /Pages ${arbre} 0 R >>`);
    const info = ajouter(Buffer.from(`<< ${["Title", "Author", "Subject", "Producer"].filter(k => this.infos[k]).map(k => `/${k} ${chaineTexte(versOctets(this.infos[k]))}`).join(" ")} /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z) >>`));

    const morceaux = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    const decalages = [0];
    let position = morceaux[0].length;
    for (let i = 1; i < objets.length; i++) {
      decalages.push(position);
      const m = Buffer.concat([Buffer.from(`${i} 0 obj\n`), objets[i], Buffer.from("\nendobj\n")]);
      morceaux.push(m); position += m.length;
    }
    const xref = ["xref", `0 ${objets.length}`, "0000000000 65535 f "];
    for (let i = 1; i < objets.length; i++) xref.push(String(decalages[i]).padStart(10, "0") + " 00000 n ");
    morceaux.push(Buffer.from(xref.join("\n") + `\ntrailer\n<< /Size ${objets.length} /Root ${racine} 0 R /Info ${info} 0 R >>\nstartxref\n${position}\n%%EOF\n`));
    return Buffer.concat(morceaux);
  }
}

module.exports = { Pdf, MM, largeurTexte, decouper, versOctets };
