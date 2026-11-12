/* ===========================================================
   assets/boutique-couleurs.js — couleurs et textures de la VRAIE boutique (2026-11-12)
   ===========================================================
   Une seule source, trois usages :
     - le serveur (server/index.js) : validation du style enregistré dans le brouillon (PUT /vitrine-draft) ;
     - la boutique publique (profil-app.html) : application des couleurs et textures ;
     - le centre de création (dashboard-initiative.html) : studio de couleurs + aperçu instantané.
   Les textures viennent du registre assets/boutique-types.js (TEXTURES) : rien n'est recopié ici.
   Fichier UMD : window.BOUTIQUE_COULEURS ou require() dans Node.

   Format enregistré dans le style de la boutique (vitrine_style_json / brouillon.style) :
     { preset?: "moderne"|"elegant"|"minimaliste", couleurs?: ["#rrggbb", …1 à 3], textures?: ["uni"|…, …même nombre] }
   Sans « couleurs », la boutique garde son thème actuel (Bordeaux, Océan…) : aucune boutique existante ne change.

   Rôle des 3 couleurs (mêmes libellés que la maquette des paramètres) :
     1 principale  -> boutons et éléments actifs        (--v1, nuances --v2, --vsoft, --vsoftbd)
     2 secondaire  -> bannière et zones importantes     (--v4)
     3 accent      -> détails et boutons d'appel        (--v3)
   Textures : la texture n°1 se pose sur la bannière, la n°2 sur le bloc contact, la n°3 sur le bouton d'appel.
   =========================================================== */
(function (racine, fabrique) {
  var types = null;
  try { types = (typeof module === "object" && module.exports) ? require("./boutique-types.js") : racine.BOUTIQUE_TYPES; } catch (e) { types = racine && racine.BOUTIQUE_TYPES; }
  var api = fabrique(types);
  if (typeof module === "object" && module.exports) module.exports = api; else racine.BOUTIQUE_COULEURS = api;
})(typeof self !== "undefined" ? self : this, function (TYPES) {
  "use strict";

  var PRESETS = ["moderne", "elegant", "minimaliste"];
  var MAX_COULEURS = 3;
  var TEXTURES = (TYPES && TYPES.TEXTURES) || [{ id: "uni", label: "Uni (aucune texture)", bg: "" }];

  /* Palettes proposées d'un clic (reprises de la maquette des paramètres). */
  var PALETTES = [
    { nom: "Bordeaux & Or", c: ["#83172f", "#111c38", "#d8b36a"] },
    { nom: "Émeraude", c: ["#1f6b55", "#0f3330", "#e6c98a"] },
    { nom: "Prestige violet", c: ["#573a7d", "#21163a", "#dcb0d8"] },
    { nom: "Océan", c: ["#1e5e91", "#111c38", "#86cbd9"] },
    { nom: "Terre & Sable", c: ["#a35a3a", "#402c22", "#dcc2a0"] },
    { nom: "Noir & Or", c: ["#222222", "#b38b3a", "#f1e2bd"] }
  ];
  var NOMS = ["Couleur principale", "Couleur secondaire", "Couleur d'accent"];
  var INDICES = ["Boutons et éléments actifs", "Bannière et zones importantes", "Détails et boutons d'appel"];

  function hexValide(h) { return typeof h === "string" && /^#[0-9a-fA-F]{6}$/.test(h) ? h.toLowerCase() : null; }

  function hexToHsl(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; }, a = s * Math.min(l, 1 - l);
    var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
    var to = function (x) { var v = Math.round(x * 255).toString(16); return v.length < 2 ? "0" + v : v; };
    return "#" + to(f(0)) + to(f(8)) + to(f(4));
  }
  function luminance(hex) {
    var n = parseInt(hex.slice(1), 16);
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  }
  function contraste(a, b) { var x = luminance(a), y = luminance(b); if (y > x) { var t = x; x = y; y = t; } return (x + 0.05) / (y + 0.05); }

  /* Assombrit une couleur jusqu'à ce que du texte blanc y soit lisible (rapport 4,5 : 1). Les couleurs déjà foncées ne changent pas. */
  function lisibleSousBlanc(hex) {
    var hsl = hexToHsl(hex), l = hsl[2], essais = 0, h = hex;
    while (contraste("#ffffff", h) < 4.5 && l > 4 && essais < 60) { l -= 1.5; h = hslToHex(hsl[0], hsl[1], l); essais++; }
    return h;
  }
  function nuance(hex, l) { var hsl = hexToHsl(hex); return hslToHex(hsl[0], hsl[1], Math.max(0, Math.min(100, l))); }

  /* Variables de couleur de la boutique (mêmes noms que .pvt-scope dans profil-app.html). */
  function variables(couleurs) {
    var c = (couleurs || []).map(hexValide).filter(Boolean).slice(0, MAX_COULEURS);
    if (!c.length) return null;
    var hsl1 = hexToHsl(c[0]);
    var v1 = lisibleSousBlanc(c[0]);
    var l1 = hexToHsl(v1)[2];
    var v2 = nuance(v1, Math.max(8, l1 - 12));
    var v4 = lisibleSousBlanc(c[1] || nuance(c[0], Math.max(8, Math.min(16, l1 - 20))));
    var v3 = lisibleSousBlanc(c[2] || (c[1] ? c[1] : nuance(c[0], Math.min(l1 + 8, 52))));
    return {
      "--v1": v1, "--v2": v2, "--v3": v3, "--v4": v4,
      "--vsoft": hslToHex(hsl1[0], Math.min(hsl1[1], 55), 95),
      "--vsoftbd": "rgba(" + parseInt(v2.slice(1, 3), 16) + "," + parseInt(v2.slice(3, 5), 16) + "," + parseInt(v2.slice(5, 7), 16) + ",.14)"
    };
  }

  function texture(id) {
    for (var i = 0; i < TEXTURES.length; i++) if (TEXTURES[i].id === id) return TEXTURES[i];
    return null;
  }
  function textureCss(id) { var t = texture(id); return t && t.bg ? t.bg : ""; }

  /* Fusion + validation d'un correctif de style (merge-patch). Retourne { style } ou { erreur }. */
  function fusionnerStyle(actuel, correctif) {
    var base = (actuel && typeof actuel === "object" && !Array.isArray(actuel)) ? JSON.parse(JSON.stringify(actuel)) : {};
    if (correctif === null) return { style: {} };
    if (!correctif || typeof correctif !== "object" || Array.isArray(correctif)) return { erreur: "Style invalide." };
    if (correctif.preset !== undefined) {
      if (PRESETS.indexOf(correctif.preset) < 0) return { erreur: "Style visuel inconnu." };
      base.preset = correctif.preset;
    }
    if (correctif.couleurs !== undefined) {
      if (correctif.couleurs === null) { delete base.couleurs; delete base.textures; }
      else {
        if (!Array.isArray(correctif.couleurs) || correctif.couleurs.length < 1 || correctif.couleurs.length > MAX_COULEURS) return { erreur: "Choisissez de 1 à 3 couleurs." };
        var propres = correctif.couleurs.map(hexValide);
        if (propres.some(function (x) { return !x; })) return { erreur: "Couleur invalide : utilisez le format #rrggbb." };
        base.couleurs = propres;
        /* Le nombre de textures suit toujours le nombre de couleurs. */
        var anciennes = Array.isArray(base.textures) ? base.textures : [];
        base.textures = propres.map(function (_, i) { return anciennes[i] || "uni"; });
      }
    }
    if (correctif.textures !== undefined) {
      if (correctif.textures === null) delete base.textures;
      else {
        if (!Array.isArray(base.couleurs)) return { erreur: "Choisissez d'abord vos couleurs avant d'ajouter des textures." };
        if (!Array.isArray(correctif.textures) || correctif.textures.length > base.couleurs.length) return { erreur: "Trop de textures pour le nombre de couleurs." };
        for (var i = 0; i < correctif.textures.length; i++) if (!texture(correctif.textures[i])) return { erreur: "Texture inconnue." };
        base.textures = base.couleurs.map(function (_, k) { return correctif.textures[k] || "uni"; });
      }
    }
    if (base.couleurs === undefined && base.textures !== undefined) delete base.textures;
    return { style: base };
  }

  /* Pose (ou retire) couleurs et textures sur l'élément portant la boutique (.pvt-scope).
     style = objet du style enregistré ; sans couleurs, les variables posées plus tôt sont retirées et le thème reprend la main. */
  function appliquer(el, style) {
    if (!el || !el.style) return;
    var noms = ["--v1", "--v2", "--v3", "--v4", "--vsoft", "--vsoftbd", "--vtex1", "--vtex2", "--vtex3"];
    noms.forEach(function (n) { el.style.removeProperty(n); });
    var vars = variables(style && style.couleurs);
    if (!vars) return;
    Object.keys(vars).forEach(function (n) { el.style.setProperty(n, vars[n]); });
    var tex = (style && Array.isArray(style.textures)) ? style.textures : [];
    for (var i = 0; i < MAX_COULEURS; i++) el.style.setProperty("--vtex" + (i + 1), textureCss(tex[i]) || "none");
  }

  return {
    PRESETS: PRESETS, MAX_COULEURS: MAX_COULEURS, TEXTURES: TEXTURES, PALETTES: PALETTES, NOMS: NOMS, INDICES: INDICES,
    hexValide: hexValide, hexToHsl: hexToHsl, hslToHex: hslToHex, contraste: contraste,
    variables: variables, textureCss: textureCss, fusionnerStyle: fusionnerStyle, appliquer: appliquer
  };
});
