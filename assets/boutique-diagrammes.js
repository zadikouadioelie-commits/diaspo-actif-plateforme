/* ===========================================================
   assets/boutique-diagrammes.js — diagrammes du studio de couleurs (2026-11-12)
   ===========================================================
   Trois schémas, fabriqués en HTML/SVG pur (aucune image, aucune émoticône) à partir de la couleur choisie :
     - nuances(hex, i)     : échelle de 11 tons + courbe de clarté ; chaque ton est cliquable (data-ton="i:#rrggbb") ;
     - harmonies(hex, i)   : roue des teintes avec les accords complémentaire / analogues / triade / compléments voisins ;
                             un ton se choisit seul (data-harm="i:#rrggbb") ou en jeu complet (data-harm-jeu="#a,#b,#c") ;
     - textures(hex, i, id): pastilles de textures et de DÉGRADÉS rangées par famille, vues sur la couleur choisie (data-texbtn="i:id").
   Dépend de assets/boutique-couleurs.js (calculs de couleur) et de assets/boutique-types.js (liste des textures).
   Rien n'est enregistré ici : la page appelle ces fonctions et branche les clics.
   =========================================================== */
(function (racine) {
  "use strict";
  var C = racine.BOUTIQUE_COULEURS, REG = racine.BOUTIQUE_TYPES;
  if (!C || !REG) return;

  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };

  /* ── Mise en forme (injectée une seule fois) ── */
  function css() {
    if (!racine.document || racine.document.getElementById("bdgCss")) return;
    var s = racine.document.createElement("style");
    s.id = "bdgCss";
    s.textContent =
      ".bdg{margin-top:10px;border:1px solid var(--line,#e6e0d6);border-radius:12px;background:#fff}" +
      ".bdg>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:10px 12px;font-weight:700;font-size:13.5px}" +
      ".bdg>summary::-webkit-details-marker{display:none}" +
      ".bdg>summary::after{content:'';margin-left:auto;width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform .15s}" +
      ".bdg[open]>summary::after{transform:rotate(-135deg)}" +
      ".bdg>summary:focus-visible{outline:2px solid var(--bordeaux,#83172f);outline-offset:2px;border-radius:12px}" +
      ".bdg-corps{padding:2px 12px 12px}.bdg-aide{margin:0 0 8px;font-size:12px;color:var(--muted,#6b7280);line-height:1.5}" +
      ".bdg-echelle{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:3px}" +
      ".bdg-ton{position:relative;border:0;border-radius:6px;padding:0;height:58px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:space-between;font:inherit;font-size:10.5px;font-weight:700}" +
      ".bdg-ton i{font-style:normal;padding-top:4px;opacity:.85}.bdg-ton b{font-size:14px;line-height:1}.bdg-ton span{padding-bottom:4px;font-size:9.5px;font-weight:600;opacity:.9}" +
      ".bdg-ton.on{outline:2px solid #111;outline-offset:2px}.bdg-ton:focus-visible{outline:2px solid #111;outline-offset:2px}" +
      ".bdg-courbe{display:block;width:100%;height:auto;margin-top:8px}.bdg-courbe text{font-size:9px;fill:var(--muted,#6b7280)}" +
      ".bdg-legende{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--muted,#6b7280);margin-top:4px}" +
      ".bdg-harm{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}" +
      ".bdg-carte{border:1px solid var(--line,#e6e0d6);border-radius:10px;padding:8px;display:flex;gap:10px;align-items:center}" +
      ".bdg-carte svg{flex:none;width:76px;height:76px}.bdg-carte h5{margin:0 0 5px;font-size:12.5px}" +
      ".bdg-tons{display:flex;gap:4px}.bdg-tons button{width:30px;height:30px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #bbb;cursor:pointer;padding:0}" +
      ".bdg-tons button:focus-visible{outline:2px solid #111;outline-offset:2px}" +
      ".bdg-jeu{margin-top:6px;border:1px solid var(--line,#e6e0d6);background:#fff;border-radius:8px;padding:5px 8px;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer}" +
      ".bdg-jeu:hover{border-color:var(--bordeaux,#83172f)}.bdg-jeu:focus-visible{outline:2px solid #111;outline-offset:2px}" +
      ".bdg-fam{margin:10px 0 5px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#6b7280);display:flex;align-items:center;gap:6px}" +
      ".bdg-fam::after{content:'';flex:1;height:1px;background:var(--line,#e6e0d6)}" +
      ".bdg-pastilles{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px}" +
      ".bdg-pastille{position:relative;height:54px;border:2px solid transparent;border-radius:8px;padding:0;cursor:pointer;overflow:hidden;font:inherit;text-align:left}" +
      ".bdg-pastille.on{border-color:#111;box-shadow:0 0 0 2px #fff inset}.bdg-pastille:focus-visible{outline:2px solid #111;outline-offset:2px}" +
      ".bdg-pastille .bdg-nom{position:absolute;left:4px;right:4px;bottom:4px;padding:2px 6px;border-radius:5px;background:rgba(0,0,0,.52);color:#fff;font-size:11px;font-weight:600;line-height:1.25}" +
      ".bdg-pastille svg{position:absolute;right:5px;top:5px;width:16px;height:16px;color:#fff;filter:drop-shadow(0 1px 1px rgba(0,0,0,.7))}" +
      ".bdg-apercu{height:46px;border-radius:8px;margin-top:10px;border:1px solid var(--line,#e6e0d6)}";
    racine.document.head.appendChild(s);
  }

  /* ── 1. Nuances ── */
  var TONS = [[50, 97], [100, 93], [200, 85], [300, 75], [400, 64], [500, 54], [600, 45], [700, 36], [800, 27], [900, 19], [950, 11]];

  function echelle(hex) {
    var hsl = C.hexToHsl(hex);
    return TONS.map(function (t) {
      var h = C.hslToHex(hsl[0], hsl[1], t[1]);
      return { nom: t[0], l: t[1], hex: h, blanc: C.contraste("#ffffff", h), noir: C.contraste("#111111", h) };
    });
  }
  function tonProche(liste, hex) {
    var l = C.hexToHsl(hex)[2], best = 0, ecart = 1e9;
    liste.forEach(function (t, k) { var e = Math.abs(t.l - l); if (e < ecart) { ecart = e; best = k; } });
    return best;
  }

  function nuances(hex, i) {
    var liste = echelle(hex), courant = tonProche(liste, hex), hsl = C.hexToHsl(hex);
    var cellules = liste.map(function (t, k) {
      var fg = t.blanc >= t.noir ? "#ffffff" : "#111111";
      var ok = (fg === "#ffffff" ? t.blanc : t.noir) >= 4.5;
      return '<button type="button" class="bdg-ton' + (k === courant ? " on" : "") + '" data-ton="' + i + ":" + t.hex + '" style="background:' + t.hex + ";color:" + fg +
        '" title="Ton ' + t.nom + " : " + t.hex.toUpperCase() + " — texte " + (fg === "#ffffff" ? "blanc" : "foncé") + (ok ? " lisible" : " peu lisible") + '"><i>' + t.nom + "</i><b>Aa</b><span>" + (ok ? "AA" : "—") + "</span></button>";
    }).join("");
    /* Courbe de clarté : un point par ton, de 50 (très clair) à 950 (très foncé) */
    var W = 330, H = 66, x0 = 14, dx = (W - 2 * x0) / (liste.length - 1);
    var pts = liste.map(function (t, k) { return [x0 + k * dx, 8 + (100 - t.l) / 100 * (H - 22)]; });
    var courbe = '<svg class="bdg-courbe" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Courbe de clarté des 11 tons, du plus clair au plus foncé">' +
      '<line x1="' + x0 + '" y1="' + (H - 12) + '" x2="' + (W - x0) + '" y2="' + (H - 12) + '" stroke="#d9d3c8" stroke-width="1"/>' +
      '<polyline fill="none" stroke="#9a9388" stroke-width="1.5" points="' + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>' +
      pts.map(function (p, k) {
        return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (k === courant ? 6 : 4) + '" fill="' + liste[k].hex + '" stroke="' + (k === courant ? "#111" : "#fff") + '" stroke-width="' + (k === courant ? 2 : 1.5) + '"/>';
      }).join("") +
      '<text x="' + x0 + '" y="' + (H - 1) + '" text-anchor="start">plus clair</text><text x="' + (W - x0) + '" y="' + (H - 1) + '" text-anchor="end">plus foncé</text></svg>';
    return '<details class="bdg" open><summary>Nuances de cette couleur</summary><div class="bdg-corps">' +
      '<p class="bdg-aide">Onze tons de la même teinte, du plus clair (50) au plus foncé (950). Cliquez un ton pour l’adopter. « AA » : le texte posé sur ce ton se lit bien (contraste d’au moins 4,5 : 1) ; « — » : à éviter pour du texte.</p>' +
      '<div class="bdg-echelle">' + cellules + "</div>" + courbe +
      '<div class="bdg-legende"><span>Teinte ' + Math.round(hsl[0]) + "°</span><span>Saturation " + Math.round(hsl[1]) + " %</span><span>Clarté " + Math.round(hsl[2]) + " %</span></div></div></details>";
  }

  /* ── 2. Harmonies sur la roue des teintes ── */
  var HARMONIES = [
    { id: "compl", nom: "Complémentaire", dec: [180] },
    { id: "analogue", nom: "Analogues", dec: [-30, 30] },
    { id: "triade", nom: "Triade", dec: [120, 240] },
    { id: "voisins", nom: "Compléments voisins", dec: [150, 210] }
  ];
  function anneau() { /* anneau de 72 secteurs, calculé une seule fois */
    if (anneau.cache) return anneau.cache;
    var out = "", R = 36, r = 25, n = 72;
    for (var k = 0; k < n; k++) {
      var a0 = k / n * 2 * Math.PI - Math.PI / 2, a1 = (k + 1.15) / n * 2 * Math.PI - Math.PI / 2;
      var p = function (a, rr) { return (40 + rr * Math.cos(a)).toFixed(2) + "," + (40 + rr * Math.sin(a)).toFixed(2); };
      out += '<polygon points="' + p(a0, R) + " " + p(a1, R) + " " + p(a1, r) + " " + p(a0, r) + '" fill="' + C.hslToHex(k / n * 360, 85, 55) + '"/>';
    }
    return (anneau.cache = out);
  }
  function mini(teinte, dec) {
    var pos = function (deg, rr) { var a = (deg - 90) * Math.PI / 180; return [40 + rr * Math.cos(a), 40 + rr * Math.sin(a)]; };
    var pts = [teinte].concat(dec.map(function (d) { return teinte + d; })).map(function (d) { return pos(d, 30.5); });
    return '<svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">' + anneau() +
      '<polygon points="' + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '" fill="rgba(255,255,255,.35)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>' +
      pts.map(function (p, k) { return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (k === 0 ? 4.4 : 3.4) + '" fill="#fff" stroke="#111" stroke-width="' + (k === 0 ? 1.8 : 1.2) + '"/>'; }).join("") + "</svg>";
  }
  function harmonies(hex, i) {
    var hsl = C.hexToHsl(hex);
    var cartes = HARMONIES.map(function (hm) {
      var tons = hm.dec.map(function (d) { return C.hslToHex((hsl[0] + d + 360) % 360, hsl[1], hsl[2]); });
      /* Jeu complet : la couleur, un ton profond du premier accord, puis le dernier accord à la clarté d'origine. */
      var profond = C.hslToHex((hsl[0] + hm.dec[0] + 360) % 360, Math.min(hsl[1], 70), 18);
      var jeu = [hex, profond, tons[tons.length - 1]];
      return '<div class="bdg-carte">' + mini(hsl[0], hm.dec) + "<div><h5>" + hm.nom + '</h5><div class="bdg-tons">' +
        tons.map(function (t) { return '<button type="button" data-harm="' + i + ":" + t + '" style="background:' + t + '" title="Adopter ' + t.toUpperCase() + '" aria-label="Adopter ' + t.toUpperCase() + '"></button>'; }).join("") +
        '</div><button type="button" class="bdg-jeu" data-harm-jeu="' + jeu.join(",") + '">Utiliser ce jeu de couleurs</button></div></div>';
    }).join("");
    return '<details class="bdg"><summary>Harmonies de couleurs (roue des teintes)</summary><div class="bdg-corps">' +
      '<p class="bdg-aide">Sur la roue, votre couleur est le grand point ; les autres points sont les teintes qui s’accordent avec elle. Cliquez une pastille pour l’adopter, ou prenez le jeu complet.</p>' +
      '<div class="bdg-harm">' + cartes + "</div></div></details>";
  }

  /* ── 3. Textures et dégradés ── */
  var CHEM = {
    bas: '<path d="M12 5v14M6 13l6 6 6-6"/>', haut: '<path d="M12 19V5M6 11l6-6 6 6"/>', droite: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    diagonale: '<path d="M6 6l12 12M18 10v8h-8"/>', "haut-bas": '<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>',
    lueur: '<circle cx="12" cy="12" r="8"/><circle cx="9" cy="9" r="2.6"/>', vignette: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/>',
    tour: '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>'
  };
  var ORDRE = ["Aucune", "Dégradés", "Métal et brillance", "Motifs", "Matières"];
  var FAM_ETIQ = { "Aucune": "Sans texture", "Dégradés": "Dégradés (clair, foncé, lueur, couleurs)" };

  function textures(hex, i, idCourant) {
    var liste = REG.TEXTURES, groupes = {};
    liste.forEach(function (t) { (groupes[t.groupe || "Aucune"] = groupes[t.groupe || "Aucune"] || []).push(t); });
    var cour = liste.filter(function (t) { return t.id === idCourant; })[0] || liste[0];
    var html = ORDRE.concat(Object.keys(groupes).filter(function (g) { return ORDRE.indexOf(g) < 0; })).filter(function (g) { return groupes[g]; }).map(function (g) {
      return '<div class="bdg-fam">' + esc(FAM_ETIQ[g] || g) + '</div><div class="bdg-pastilles">' + groupes[g].map(function (t) {
        var fond = t.bg ? t.bg + ", " + hex : hex;
        return '<button type="button" class="bdg-pastille' + (t.id === cour.id ? " on" : "") + '" data-texbtn="' + i + ":" + esc(t.id) + '" style="background:' + esc(fond) + '" aria-pressed="' + (t.id === cour.id) + '">' +
          (t.sens && CHEM[t.sens] ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + CHEM[t.sens] + "</svg>" : "") +
          '<span class="bdg-nom">' + esc(t.label) + "</span></button>";
      }).join("") + "</div>";
    }).join("");
    return '<details class="bdg" open><summary>Textures et dégradés</summary><div class="bdg-corps">' +
      '<p class="bdg-aide">Chaque pastille montre l’effet sur votre couleur. Les dégradés éclaircissent, assombrissent ou teintent la couleur ; la flèche indique leur sens.</p>' + html +
      '<div class="bdg-apercu" style="background:' + esc(cour.bg ? cour.bg + ", " + hex : hex) + '" role="img" aria-label="Aperçu : ' + esc(cour.label) + '"></div></div></details>';
  }

  css();
  racine.BOUTIQUE_DIAGRAMMES = { nuances: nuances, harmonies: harmonies, textures: textures, echelle: echelle, HARMONIES: HARMONIES };
  if (typeof module === "object" && module.exports) module.exports = racine.BOUTIQUE_DIAGRAMMES;
})(typeof self !== "undefined" ? self : this);
