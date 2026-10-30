/* ═════════════════════════════════════════════════
   server/qr-code.js — générateur de QR code (2026-10-30), sans bibliothèque tierce.
   Mode octets, correction d'erreur de niveau M, versions 1 à 10 (jusqu'à 213 octets : largement assez pour une adresse de vérification).
   Sert au certificat en PDF (server/formation-certificat-pdf.js) ; la page imprimable utilise toujours qrcodejs côté navigateur.
   encoder(texte [, { masque }]) → { taille, modules: boolean[][] }  (modules[ligne][colonne], true = module sombre).
   ═════════════════════════════════════════════════ */
"use strict";

/* Niveau M, versions 1-10 : [mots de code de correction par bloc, [[nombre de blocs, mots de données par bloc], …]] */
const VERSIONS_M = {
  1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]],
  6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
};
const ALIGNEMENTS = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

const donneesTotales = v => VERSIONS_M[v][1].reduce((s, [n, d]) => s + n * d, 0);

/* ── Corps de Galois GF(256), polynôme 0x11D ── */
const EXP = new Array(512), LOG = new Array(256);
(function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function diviseurRS(degre) {
  let p = [1];
  for (let i = 0; i < degre; i++) {
    const suivant = new Array(p.length + 1).fill(0);
    for (let j = 0; j < p.length; j++) { suivant[j] ^= p[j]; suivant[j + 1] ^= mul(p[j], EXP[i]); }
    p = suivant;
  }
  return p.slice(1); /* le coefficient de tête (1) est implicite */
}
function resteRS(donnees, diviseur) {
  const reste = new Array(diviseur.length).fill(0);
  for (const b of donnees) {
    const facteur = b ^ reste.shift();
    reste.push(0);
    if (facteur) diviseur.forEach((c, i) => { reste[i] ^= mul(c, facteur); });
  }
  return reste;
}

/* ── Flux de bits : mode octets, longueur, données, terminateur, remplissage ── */
function motsDeDonnees(octets, version) {
  const bits = [];
  const pousser = (valeur, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valeur >>> i) & 1); };
  pousser(0b0100, 4);
  pousser(octets.length, version >= 10 ? 16 : 8);
  octets.forEach(o => pousser(o, 8));
  const capacite = donneesTotales(version) * 8;
  pousser(0, Math.min(4, capacite - bits.length));
  while (bits.length % 8) bits.push(0);
  const mots = [];
  for (let i = 0; i < bits.length; i += 8) mots.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; mots.length < donneesTotales(version); pad ^= 0xec ^ 0x11) mots.push(pad);
  return mots;
}

/* Découpe en blocs, ajoute la correction d'erreur, entrelace. */
function motsDeCode(mots, version) {
  const [nEcc, groupes] = VERSIONS_M[version];
  const blocs = [];
  let pos = 0;
  for (const [n, d] of groupes) for (let i = 0; i < n; i++) { blocs.push(mots.slice(pos, pos + d)); pos += d; }
  const diviseur = diviseurRS(nEcc);
  const eccs = blocs.map(b => resteRS(b, diviseur));
  const sortie = [];
  const maxDonnees = Math.max(...blocs.map(b => b.length));
  for (let i = 0; i < maxDonnees; i++) blocs.forEach(b => { if (i < b.length) sortie.push(b[i]); });
  for (let i = 0; i < nEcc; i++) eccs.forEach(e => sortie.push(e[i]));
  return sortie;
}

const bit = (x, i) => ((x >>> i) & 1) !== 0;

function construire(version, codes, masque) {
  const taille = version * 4 + 17;
  const modules = Array.from({ length: taille }, () => new Array(taille).fill(false));
  const fonction = Array.from({ length: taille }, () => new Array(taille).fill(false));
  const poser = (x, y, sombre) => { modules[y][x] = sombre; fonction[y][x] = true; };

  /* motifs de repérage (3 coins) avec leur séparateur */
  const viseur = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
      if (x >= 0 && x < taille && y >= 0 && y < taille) poser(x, y, d !== 2 && d !== 4);
    }
  };
  /* lignes de synchronisation */
  for (let i = 0; i < taille; i++) { poser(6, i, i % 2 === 0); poser(i, 6, i % 2 === 0); }
  viseur(3, 3); viseur(taille - 4, 3); viseur(3, taille - 4);
  /* motifs d'alignement (hors des trois coins) */
  const al = ALIGNEMENTS[version];
  al.forEach((cx, i) => al.forEach((cy, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poser(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));

  /* format : niveau M (00) + masque, BCH(15,5) */
  const formater = m => {
    const data = (0 << 3) | m; /* niveau M = 0b00 */
    let r = data;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const bits = ((data << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) poser(8, i, bit(bits, i));
    poser(8, 7, bit(bits, 6)); poser(8, 8, bit(bits, 7)); poser(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) poser(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) poser(taille - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) poser(8, taille - 15 + i, bit(bits, i));
    poser(8, taille - 8, true); /* module sombre fixe */
  };
  formater(0);
  /* version (à partir de 7), BCH(18,6) */
  if (version >= 7) {
    let r = version;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const bits = (version << 12) | r;
    for (let i = 0; i < 18; i++) { const a = taille - 11 + (i % 3), b = Math.floor(i / 3); poser(a, b, bit(bits, i)); poser(b, a, bit(bits, i)); }
  }

  /* placement des mots de code en zigzag, par colonnes de deux, de droite à gauche */
  let k = 0;
  for (let droite = taille - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5;
    for (let v = 0; v < taille; v++) for (let j = 0; j < 2; j++) {
      const x = droite - j, haut = ((droite + 1) & 2) === 0, y = haut ? taille - 1 - v : v;
      if (!fonction[y][x] && k < codes.length * 8) { modules[y][x] = bit(codes[k >>> 3], 7 - (k & 7)); k++; }
    }
  }

  const masquer = m => {
    for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) {
      let inverser;
      switch (m) {
        case 0: inverser = (x + y) % 2 === 0; break;
        case 1: inverser = y % 2 === 0; break;
        case 2: inverser = x % 3 === 0; break;
        case 3: inverser = (x + y) % 3 === 0; break;
        case 4: inverser = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: inverser = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: inverser = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: inverser = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      }
      if (!fonction[y][x] && inverser) modules[y][x] = !modules[y][x];
    }
  };

  /* pénalité : séries de 5+, blocs 2×2, motifs de type repère, équilibre clair/sombre */
  const penalite = () => {
    let total = 0;
    const serie = ligne => {
      let n = 1;
      for (let i = 1; i <= ligne.length; i++) {
        if (i < ligne.length && ligne[i] === ligne[i - 1]) n++;
        else { if (n >= 5) total += 3 + (n - 5); n = 1; }
      }
      const s = ligne.map(b => (b ? "1" : "0")).join("");
      for (const m of s.matchAll(/(?=(10111010000|00001011101))/g)) total += 40 * (m[1] ? 1 : 0);
    };
    for (let y = 0; y < taille; y++) serie(modules[y]);
    for (let x = 0; x < taille; x++) serie(modules.map(l => l[x]));
    for (let y = 0; y < taille - 1; y++) for (let x = 0; x < taille - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) total += 3;
    }
    const sombres = modules.reduce((s, l) => s + l.filter(Boolean).length, 0);
    total += Math.floor(Math.abs(sombres * 20 - taille * taille * 10) / (taille * taille)) * 10;
    return total;
  };

  let meilleur = masque;
  if (meilleur === undefined || meilleur === null) {
    let min = Infinity;
    for (let m = 0; m < 8; m++) {
      masquer(m); formater(m);
      const p = penalite();
      if (p < min) { min = p; meilleur = m; }
      masquer(m); /* annule (le masque est son propre inverse) */
    }
  }
  masquer(meilleur); formater(meilleur);
  return { taille, modules, masque: meilleur };
}

function encoder(texte, options) {
  const octets = Array.from(Buffer.from(String(texte), "utf8"));
  let version = 0;
  for (let v = 1; v <= 10 && !version; v++) {
    const bitsEntete = 4 + (v >= 10 ? 16 : 8);
    if (bitsEntete + octets.length * 8 <= donneesTotales(v) * 8) version = v;
  }
  if (!version) throw new Error("Texte trop long pour ce générateur de QR code (213 octets au plus).");
  const codes = motsDeCode(motsDeDonnees(octets, version), version);
  const r = construire(version, codes, options && options.masque);
  return { taille: r.taille, modules: r.modules, version, masque: r.masque };
}

module.exports = { encoder };
