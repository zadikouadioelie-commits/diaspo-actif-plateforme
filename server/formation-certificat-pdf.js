/* ═════════════════════════════════════════════════
   server/formation-certificat-pdf.js — attestation / certificat de formation en PDF (lot E, 2026-10-30).
   Même contenu et mêmes trois modèles que la page imprimable attestation.html (classique, moderne, premium), dessinés directement en PDF :
   le fichier se télécharge en un clic, sans passer par « Imprimer ». Le QR code (adresse de vérification publique) est dessiné en vecteurs.
   certificatPdf(attestation, { urlVerif, qr }) → Buffer
   ═════════════════════════════════════════════════ */
"use strict";

const { Pdf, MM, largeurTexte } = require("./pdf-simple");
const { encoder } = require("./qr-code");

const NAVY = "#0D2B4E", ORANGE = "#F26422", OR = "#B8893B", ENCRE = "#1e293b", GRIS = "#64748b";
const PX = 0.75; /* la page imprimable est dessinée en pixels CSS : 1 px = 0,75 pt */
const L = 297 * MM, H = 210 * MM; /* A4 paysage */

function dateFr(iso) {
  const brut = String(iso || "");
  const d = new Date(brut.includes("T") || /Z|\+/.test(brut) ? brut : brut.replace(" ", "T") + "Z");
  return isNaN(d) ? brut.slice(0, 10) : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

function certificatPdf(a, options) {
  const o = options || {};
  const modele = ["classique", "moderne", "premium"].includes(a.modele) ? a.modele : "classique";
  const verbe = a.type === "reussite" ? "a réussi la formation" : a.type === "suivi" ? "a suivi la formation" : "a participé à la formation";
  const sombre = modele === "premium";
  const pdf = new Pdf({ Title: `${a.type_label} — ${a.formation_titre}`, Author: "Diaspo'Actif", Subject: "Document vérifiable en ligne", Producer: "Diaspo'Actif" });
  const p = pdf.page(L, H);

  /* couleurs par modèle */
  const c = sombre
    ? { fondPage: "#0b2240", marque: "#f3d58a", titre: "#f3d58a", sous: "#cbd5e1", decerne: "#cbd5e1", nom: "#ffffff", filet: "#f3d58a", corps: "#e2e8f0", fort: "#f3d58a", res: "#e2e8f0", pied: "#cbd5e1", code: "#f3d58a" }
    : { fondPage: "#ffffff", marque: NAVY, titre: NAVY, sous: GRIS, decerne: GRIS, nom: modele === "moderne" ? NAVY : ORANGE, filet: OR, corps: ENCRE, fort: NAVY, res: NAVY, pied: GRIS, code: NAVY };
  p.rect(0, 0, L, H, { fond: c.fondPage });

  const gauche = modele === "moderne";
  const centre = gauche ? null : L / 2;
  /* zone de texte */
  const x0 = gauche ? 40 * MM : 29.8 * MM;
  const x1 = gauche ? L - 18 * MM : L - 29.8 * MM;
  const largeurTexteZone = x1 - x0;
  const alignement = gauche ? "left" : "center";
  const xt = gauche ? x0 : centre;

  /* cadres */
  if (modele === "classique") {
    p.rect(12.1 * MM, 12.1 * MM, L - 24.2 * MM, H - 24.2 * MM, { contour: NAVY, epaisseur: 2.2 * MM });
    p.rect(15.5 * MM, 15.5 * MM, L - 31 * MM, H - 31 * MM, { contour: OR, epaisseur: 0.6 * MM });
  } else if (modele === "premium") {
    p.rect(12.1 * MM, 12.1 * MM, L - 24.2 * MM, H - 24.2 * MM, { contour: "#d9b866", epaisseur: 2.2 * MM });
    p.rect(15.5 * MM, 15.5 * MM, L - 31 * MM, H - 31 * MM, { contour: "#f3d58a", epaisseur: 0.5 * MM, alpha: 0.55 });
  } else {
    p.rect(0, 0, 26 * MM, H, { fond: NAVY });
    p.texte("DIASPO'ACTIF", 12 * MM, H / 2, { police: "Helvetica-Bold", taille: 14 * PX, couleur: "#ffffff", angle: 90, align: "center", espacement: 14 * PX * 0.35 });
  }

  let y = gauche ? 24 * MM : 25.5 * MM;

  /* marque (modèles classique et premium) */
  if (!gauche) {
    p.texte("DIASPO'ACTIF", centre, y + 12 * PX, { police: "Helvetica-Bold", taille: 15 * PX, couleur: c.marque, align: "center", espacement: 15 * PX * 0.06 });
    y += 24 * PX;
  }

  /* titre du document */
  const tailleTitre = (gauche ? 40 : 34) * PX;
  const titre = gauche ? a.type_label : String(a.type_label || "").toUpperCase();
  y += tailleTitre + 8 * PX;
  p.texte(titre, xt, y, { police: gauche ? "Helvetica-Bold" : "Times-Bold", taille: tailleTitre, couleur: c.titre, align: alignement, espacement: gauche ? 0 : tailleTitre * 0.04 });
  if (gauche) { p.rect(x0, y + 13 * PX, 30 * MM, 1.6 * MM, { fond: ORANGE }); y += 13 * PX + 1.6 * MM; }
  y += (gauche ? 18 : 24) * PX;
  p.texte("délivré(e) par Diaspo'Actif au titre d'une formation de la plateforme", xt, y, { police: gauche ? "Helvetica" : "Times-Italic", taille: 14 * PX, couleur: c.sous, align: alignement });

  /* « Décerné à » + nom */
  y += 36 * PX;
  p.texte("Décerné à", xt, y, { police: gauche ? "Helvetica" : "Times-Roman", taille: 15 * PX, couleur: c.decerne, align: alignement });
  const tailleNom = (gauche ? 36 : 34) * PX;
  y += tailleNom + 6 * PX;
  const police = gauche ? "Helvetica-Bold" : "Times-Italic";
  let nom = String(a.apprenant_nom || "").trim();
  while (nom.length > 3 && largeurTexte(nom, police, tailleNom) > largeurTexteZone - 40) nom = nom.slice(0, -2) + "…";
  p.texte(nom, xt, y, { police, taille: tailleNom, couleur: c.nom, align: alignement });
  if (!gauche) {
    const w = largeurTexte(nom, police, tailleNom) + 60 * PX;
    p.ligne(centre - w / 2, y + 7 * PX, centre + w / 2, y + 7 * PX, { couleur: c.filet, epaisseur: 0.4 * MM });
  }

  /* corps */
  y += 38 * PX;
  const tCorps = 16 * PX, fCorps = gauche ? "Helvetica" : "Times-Roman", fFort = gauche ? "Helvetica-Bold" : "Times-Bold";
  p.texte(`qui ${verbe}`, xt, y, { police: fCorps, taille: tCorps, couleur: c.corps, align: alignement });
  y += tCorps * 1.7;
  y = p.paragraphe(`« ${a.formation_titre} »`, x0, y, largeurTexteZone, { police: fFort, taille: tCorps, couleur: c.fort, align: alignement, interligne: tCorps * 1.4 });
  p.texte(`proposée par ${a.organisme || "Diaspo'Actif"}.`, xt, y, { police: fCorps, taille: tCorps, couleur: c.corps, align: alignement });
  y += tCorps * 1.3;
  if (a.resultat_pct != null) {
    y += 8 * PX;
    const t1 = "Résultat obtenu : ", t2 = `${String(a.resultat_pct).replace(".", ",")} %`;
    const tr = 15 * PX, pr = gauche ? "Helvetica" : "Times-Roman", pf = gauche ? "Helvetica-Bold" : "Times-Bold";
    const w1 = largeurTexte(t1, pr, tr), w2 = largeurTexte(t2, pf, tr);
    const xr = gauche ? x0 : centre - (w1 + w2) / 2;
    p.texte(t1, xr, y + tr, { police: pr, taille: tr, couleur: c.res });
    p.texte(t2, xr + w1, y + tr, { police: pf, taille: tr, couleur: c.fort });
  }

  /* pied : date + avertissement à gauche, QR + code à droite */
  const bas = H - 25.5 * MM;
  const droiteX = x1;
  const tailleQr = 26 * MM;
  const haut = bas - tailleQr - 2 * PX * 14;
  if (o.qr !== false && o.urlVerif) {
    const qrx = droiteX - tailleQr - (sombre ? 2 * MM : 0), qry = haut;
    if (sombre) p.rect(qrx - 2 * MM, qry - 2 * MM, tailleQr + 4 * MM, tailleQr + 4 * MM, { fond: "#ffffff" });
    p.qr(encoder(o.urlVerif), qrx, qry, tailleQr, { marge: 1, couleur: "#000000" });
    p.lien(qrx, qry, tailleQr, tailleQr, o.urlVerif);
    const cx = qrx + tailleQr / 2;
    p.texte(a.code, cx, qry + tailleQr + 16 * PX + (sombre ? 2 * MM : 0), { police: "Helvetica-Bold", taille: 13 * PX, couleur: c.code, align: "center", espacement: 13 * PX * 0.05 });
    p.texte("Vérifier l’authenticité", cx, qry + tailleQr + 30 * PX + (sombre ? 2 * MM : 0), { police: "Helvetica", taille: 11.5 * PX, couleur: c.pied, align: "center" });
  } else {
    p.texte(a.code, droiteX, bas - 16 * PX, { police: "Helvetica-Bold", taille: 13 * PX, couleur: c.code, align: "right", espacement: 13 * PX * 0.05 });
    p.texte("Vérification en ligne : voir le code ci-dessus", droiteX, bas, { police: "Helvetica", taille: 11.5 * PX, couleur: c.pied, align: "right" });
  }
  const largeurAvert = Math.min(150 * MM, droiteX - tailleQr - x0 - 10 * MM);
  const hautAvert = bas - 3 * 10.5 * PX * 1.5 - 14 * PX - 6 * PX;
  p.texte(`Délivré le ${dateFr(a.date_emission)}`, x0, hautAvert, { police: "Helvetica", taille: 11.5 * PX, couleur: c.pied });
  p.paragraphe(a.avertissement || "", x0, hautAvert + 18 * PX, largeurAvert, { police: "Helvetica", taille: 10.5 * PX, couleur: c.pied, interligne: 10.5 * PX * 1.45 });

  if (a.statut && a.statut !== "valide") p.texte("RÉVOQUÉ", L / 2, H / 2 + 22, { police: "Helvetica-Bold", taille: 64 * PX * 1.4, couleur: "#dc2626", angle: 18, align: "center", alpha: 0.28 });
  return pdf.build();
}

module.exports = { certificatPdf, dateFr };
