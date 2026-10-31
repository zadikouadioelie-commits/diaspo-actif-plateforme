/* ═════════════════════════════════════════════════
   server/kofi-carte.js — CARTE MENTALE générée pour l'assistant du formateur (2026-10-31)

   Entrée : { centre, branches: [{ titre, enfants: [texte, …] }] } (déjà borné). Sortie : une image PNG (1600 × 1000) dessinée par le serveur, jamais par le modèle d'IA :
   le modèle ne fournit que les idées, la mise en page est déterministe (même carte = même image), le texte est échappé (aucun code ne peut passer dans l'image).
   Disposition : le thème central au milieu, les branches en étoile, leurs sous-idées en petites pastilles tout autour.
   ═════════════════════════════════════════════════ */
"use strict";

const L = 1600, H = 1000, CX = L / 2, CY = H / 2;
const COULEURS = ["#E6B84A", "#4FA3D1", "#7BC47F", "#E07A5F", "#A78BDA", "#F2A65A", "#5CC8C0", "#D96C9B"];
const FOND = "#0F2342";

const echap = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nettoyer = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/* Coupe un texte en lignes d'au plus `larg` caractères (aux espaces) ; au plus `lignesMax` lignes, la dernière finit par « … » si le texte est tronqué. */
function lignes(texte, larg, lignesMax) {
  const mots = String(texte).split(" ").filter(Boolean);
  const out = []; let cur = "";
  for (const m of mots) {
    if ((cur + " " + m).trim().length > larg && cur) { out.push(cur); cur = m; } else cur = (cur + " " + m).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lignesMax) { const garde = out.slice(0, lignesMax); garde[lignesMax - 1] = garde[lignesMax - 1].replace(/\s*\S{0,3}$/, "") + "…"; return garde; }
  return out;
}

/* Valide et borne la carte : 1 à 8 branches, 0 à 5 sous-idées par branche, textes courts. Renvoie { carte } ou { erreur }. */
function normaliser(brut) {
  if (!brut || typeof brut !== "object") return { erreur: "Carte mentale invalide." };
  const centre = nettoyer(brut.centre, 60);
  if (!centre) return { erreur: "La carte mentale a besoin d'un thème central." };
  const branches = (Array.isArray(brut.branches) ? brut.branches : []).slice(0, 8).map(b => {
    const titre = nettoyer(b && (b.titre || b.nom), 40);
    if (!titre) return null;
    return { titre, enfants: (Array.isArray(b.enfants) ? b.enfants : []).slice(0, 5).map(e => nettoyer(typeof e === "string" ? e : (e && (e.titre || e.nom)), 48)).filter(Boolean) };
  }).filter(Boolean);
  if (branches.length < 2) return { erreur: "Une carte mentale a besoin d'au moins deux branches." };
  return { carte: { centre, branches } };
}

function texteSvg(x, y, texte, { taille, poids, couleur, larg, lignesMax, ancre }) {
  const ls = lignes(texte, larg, lignesMax), h = taille * 1.22;
  const y0 = y - ((ls.length - 1) * h) / 2 + taille * 0.35;
  return `<text x="${x.toFixed(1)}" y="${y0.toFixed(1)}" font-family="Segoe UI, Arial, sans-serif" font-size="${taille}" font-weight="${poids}" fill="${couleur}" text-anchor="${ancre || "middle"}">` +
    ls.map((l, i) => `<tspan x="${x.toFixed(1)}" dy="${i === 0 ? 0 : h.toFixed(1)}">${echap(l)}</tspan>`).join("") + "</text>";
}

function svgDe(carte) {
  const n = carte.branches.length;
  const parts = [];
  /* Arbre : la moitié des branches à droite, l'autre à gauche. Chaque branche réserve autant de « lignes » verticales que de sous-idées (au moins une) ;
     la hauteur d'une ligne s'adapte pour que tout tienne : aucun chevauchement possible. */
  const droite = carte.branches.slice(0, Math.ceil(n / 2)), gauche = carte.branches.slice(Math.ceil(n / 2));
  const XB = 330, XE = 640; /* distance du centre : branches, sous-idées */
  const placer = (liste, sens, offset) => {
    const lignesTotal = liste.reduce((a, b) => a + Math.max(1, b.enfants.length), 0) || 1;
    const hLigne = Math.min(74, (H - 90) / lignesTotal);
    let y = (H - lignesTotal * hLigne) / 2;
    liste.forEach((b, k) => {
      const nb = Math.max(1, b.enfants.length);
      const col = COULEURS[(offset + k) % COULEURS.length];
      const by = y + (nb * hLigne) / 2, bx = CX + sens * XB;
      b.enfants.forEach((e, j) => {
        const ey = y + (j + 0.5) * hLigne, ex = CX + sens * XE;
        const ph = Math.min(52, hLigne - 8);
        parts.push(`<path d="M ${(bx + sens * 112).toFixed(1)} ${by.toFixed(1)} C ${(bx + sens * 170).toFixed(1)} ${by.toFixed(1)} ${(ex - sens * 150).toFixed(1)} ${ey.toFixed(1)} ${(ex - sens * 105).toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="${col}" stroke-width="2.5" stroke-opacity=".7"/>`);
        parts.push(`<rect x="${(ex - 105).toFixed(1)}" y="${(ey - ph / 2).toFixed(1)}" width="210" height="${ph}" rx="${ph / 2}" fill="${FOND}"/>`);
        parts.push(`<rect x="${(ex - 105).toFixed(1)}" y="${(ey - ph / 2).toFixed(1)}" width="210" height="${ph}" rx="${ph / 2}" fill="${col}" fill-opacity=".16" stroke="${col}" stroke-opacity=".8" stroke-width="2"/>`);
        parts.push(texteSvg(ex, ey, e, { taille: ph < 44 ? 14 : 17, poids: 500, couleur: "#F1F5FC", larg: 26, lignesMax: ph < 44 ? 1 : 2 }));
      });
      parts.push(`<path d="M ${CX} ${CY} C ${(CX + sens * 120).toFixed(1)} ${CY} ${(bx - sens * 150).toFixed(1)} ${by.toFixed(1)} ${(bx - sens * 112).toFixed(1)} ${by.toFixed(1)}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" stroke-opacity=".9"/>`);
      parts.push(`<rect x="${(bx - 112).toFixed(1)}" y="${(by - 32).toFixed(1)}" width="224" height="64" rx="32" fill="${col}"/>`);
      parts.push(texteSvg(bx, by, b.titre, { taille: 20, poids: 700, couleur: "#0B1B33", larg: 20, lignesMax: 2 }));
      y += nb * hLigne;
    });
  };
  placer(droite, 1, 0); placer(gauche, -1, droite.length);
  /* le centre est dessiné en dernier : il recouvre le départ des branches */
  parts.push(`<circle cx="${CX}" cy="${CY}" r="96" fill="#E6B84A"/><circle cx="${CX}" cy="${CY}" r="110" fill="none" stroke="#E6B84A" stroke-opacity=".4" stroke-width="3"/>`);
  parts.push(texteSvg(CX, CY, carte.centre, { taille: 24, poids: 800, couleur: "#0B1B33", larg: 14, lignesMax: 4 }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}"><rect width="${L}" height="${H}" fill="${FOND}"/>` +
    `<text x="40" y="${H - 28}" font-family="Segoe UI, Arial, sans-serif" font-size="16" fill="#8FA3C4">Diaspo'Actif · Formation Diaspora</text>` + parts.join("") + "</svg>";
}

/* Rend la carte en PNG (Buffer). `sharp` est déjà une dépendance du projet (compression des images). */
async function rendrePng(carte) {
  const sharp = require("sharp");
  return sharp(Buffer.from(svgDe(carte))).png({ compressionLevel: 9 }).toBuffer();
}

module.exports = { normaliser, svgDe, rendrePng, L, H };
