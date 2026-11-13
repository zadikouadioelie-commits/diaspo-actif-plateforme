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

   Rôle des 3 couleurs (les libellés de la maquette des paramètres, précisés pour la vraie boutique) :
     1 principale  -> bandeaux de rubriques, boutons, éléments actifs   (--v1, nuances --v2, --vsoft, --vsoftbd)
     2 secondaire  -> bloc contact, offre flash, bannière               (--v4)
     3 accent      -> liseré des rubriques, boutons de contact, bouton d'appel   (--v3 ; texte du bouton en noir ou blanc : --von3)
   Textures : la n°1 se pose sur les bandeaux de rubriques, la n°2 sur le bloc contact / l'offre flash / la bannière,
   la n°3 sur le liseré d'accent et le bouton d'appel. L'attribut data-couleurs (posé par appliquer) réserve ces habillages
   aux boutiques personnalisées : sans couleurs enregistrées, l'aspect actuel est strictement inchangé.
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
    { nom: "Bordeaux & Or", groupe: "Élégance", c: ["#83172f", "#111c38", "#d8b36a"] },
    { nom: "Émeraude", groupe: "Nature", c: ["#1f6b55", "#0f3330", "#e6c98a"] },
    { nom: "Prestige violet", groupe: "Élégance", c: ["#573a7d", "#21163a", "#dcb0d8"] },
    { nom: "Océan", groupe: "Fraîches", c: ["#1e5e91", "#111c38", "#86cbd9"] },
    { nom: "Terre & Sable", groupe: "Chaudes", c: ["#a35a3a", "#402c22", "#dcc2a0"] },
    { nom: "Noir & Or", groupe: "Élégance", c: ["#222222", "#b38b3a", "#f1e2bd"] },
    { nom: "Ardoise & Cuivre", groupe: "Élégance", c: ["#2f3e4e", "#1a2330", "#d08a5b"] },
    { nom: "Nuit & Argent", groupe: "Élégance", c: ["#1f2a44", "#0e1424", "#c9d2e3"] },
    { nom: "Prune & Rose poudré", groupe: "Élégance", c: ["#5a2a4a", "#2c1226", "#f0c6d2"] },
    { nom: "Forêt & Miel", groupe: "Nature", c: ["#2f5d3a", "#17301f", "#e0b457"] },
    { nom: "Sauge & Crème", groupe: "Nature", c: ["#4f7a55", "#2f4a3a", "#f1e8d2"] },
    { nom: "Olive & Moutarde", groupe: "Nature", c: ["#68701f", "#2e3210", "#e0b23a"] },
    { nom: "Menthe & Ardoise", groupe: "Nature", c: ["#1f7a6b", "#1b3b44", "#bfeadf"] },
    { nom: "Terracotta & Ocre", groupe: "Chaudes", c: ["#b5522f", "#5a2a18", "#f0c27a"] },
    { nom: "Soleil d'Afrique", groupe: "Chaudes", c: ["#b8560f", "#4a2208", "#ffd166"] },
    { nom: "Rouge piment", groupe: "Chaudes", c: ["#b3261e", "#3a0f0c", "#ffb870"] },
    { nom: "Café & Caramel", groupe: "Chaudes", c: ["#5b3a29", "#2a1a12", "#d9a066"] },
    { nom: "Lagon", groupe: "Fraîches", c: ["#0e7490", "#0b3d52", "#a5f3fc"] },
    { nom: "Bleu nuit & Ciel", groupe: "Fraîches", c: ["#23408e", "#0f1c45", "#9ec5ff"] },
    { nom: "Turquoise & Corail", groupe: "Fraîches", c: ["#13828a", "#0c3f48", "#ff8f78"] },
    { nom: "Fuchsia & Jaune", groupe: "Vives", c: ["#c2185b", "#4a0a28", "#ffd23f"] },
    { nom: "Violet & Menthe", groupe: "Vives", c: ["#6a2fb0", "#2a1050", "#6fe3c1"] },
    { nom: "Orange & Bleu", groupe: "Vives", c: ["#c2500a", "#102a56", "#ffc46b"] },
    { nom: "Magenta & Or", groupe: "Vives", c: ["#a81d6b", "#2a0f3a", "#e9c46a"] },
    { nom: "Rose poudré", groupe: "Douces", c: ["#b04a6c", "#5a2a3c", "#fbe3e8"] },
    { nom: "Lavande & Brume", groupe: "Douces", c: ["#6f5fa6", "#34295c", "#e6e0f8"] },
    { nom: "Pêche & Sable", groupe: "Douces", c: ["#ad5738", "#6b3a2a", "#fbe4cf"] },
    { nom: "Sable & Ciel", groupe: "Douces", c: ["#8c6d3c", "#4e3f2a", "#cfe6f2"] },
    { nom: "Graphite & Citron", groupe: "Douces", c: ["#3d4148", "#16181c", "#e8e46a"] }
  ];
  /* Ordre d'affichage des familles de palettes (la liste elle-même garde un ordre stable : les 6 premières sont celles d'origine). */
  var GROUPES_PALETTES = ["Élégance", "Nature", "Chaudes", "Fraîches", "Vives", "Douces"];
  var NOMS = ["Couleur principale", "Couleur secondaire", "Couleur d'accent"];
  var INDICES = ["Bandeaux de rubriques, boutons et éléments actifs", "Bloc contact, offre flash et bannière", "Détails : liseré des rubriques, boutons de contact"];

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
    /* L'accent garde sa vraie couleur (souvent claire : doré, sable…) ; c'est le TEXTE du bouton d'appel qui s'adapte. */
    var v3 = c[2] || (c[1] ? c[1] : nuance(c[0], Math.min(l1 + 8, 52)));
    var von3 = contraste("#ffffff", v3) >= contraste("#111111", v3) ? "#ffffff" : "#111111";
    return {
      "--v1": v1, "--v2": v2, "--v3": v3, "--von3": von3, "--v4": v4,
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
    var noms = ["--v1", "--v2", "--v3", "--von3", "--v4", "--vsoft", "--vsoftbd", "--vtex1", "--vtex2", "--vtex3"];
    noms.forEach(function (n) { el.style.removeProperty(n); });
    if (el.removeAttribute) el.removeAttribute("data-couleurs");
    var vars = variables(style && style.couleurs);
    if (!vars) return;
    /* L'attribut déclenche les habillages réservés aux boutiques personnalisées (liserés, textures) : sans lui, l'aspect actuel est inchangé. */
    if (el.setAttribute) el.setAttribute("data-couleurs", "1");
    Object.keys(vars).forEach(function (n) { el.style.setProperty(n, vars[n]); });
    var tex = (style && Array.isArray(style.textures)) ? style.textures : [];
    for (var i = 0; i < MAX_COULEURS; i++) el.style.setProperty("--vtex" + (i + 1), textureCss(tex[i]) || "none");
  }

  /* Palette des pages de boutique à fond clair (commerce, vidéo, portfolio) — lot 4A, 2026-11-13.
     Ces pages utilisent un bordeaux / bleu nuit / or. Les 3 couleurs de la boutique les remplacent dans le même rôle :
     principale -> boutons et bandeaux, secondaire -> en-tête et pied de page, accent -> détails dorés.
     Sans couleurs enregistrées : null, et la page garde sa charte d'origine (aucune boutique existante ne change). */
  function paletteClaire(couleurs) {
    var c = (couleurs || []).map(hexValide).filter(Boolean).slice(0, MAX_COULEURS);
    if (!c.length) return null;
    var p = lisibleSousBlanc(c[0]), lp = hexToHsl(p)[2];
    var s = lisibleSousBlanc(c[1] || nuance(c[0], 12)), ls = hexToHsl(s)[2];
    var a = c[2] || nuance(c[0], 62), la = hexToHsl(a)[2];
    return {
      p: p, p_clair: nuance(p, Math.min(lp + 7, 60)), p_fonce: nuance(p, Math.max(lp - 9, 6)), p_tres_fonce: nuance(p, Math.max(lp - 14, 4)),
      s: s, s_clair: nuance(s, Math.min(ls + 10, 60)),
      a: a, a_fonce: nuance(a, Math.max(la - 10, 10)), a_clair: nuance(a, Math.min(la + 12, 92)),
      hero: nuance(p, 13), hero2: nuance(p, 15)
    };
  }

  /* Pose la palette sur l'élément portant la page. noms = { "--variable-css": "clé de la palette", … } propre à chaque page. */
  function appliquerPage(el, style, noms) {
    if (!el || !el.style || !noms) return;
    Object.keys(noms).forEach(function (n) { el.style.removeProperty(n); });
    if (el.removeAttribute) el.removeAttribute("data-couleurs");
    var pal = paletteClaire(style && style.couleurs);
    if (!pal) return;
    /* L'attribut réserve les dégradés « suivant les couleurs » aux boutiques personnalisées : sans lui, l'aspect d'origine est strictement inchangé. */
    if (el.setAttribute) el.setAttribute("data-couleurs", "1");
    Object.keys(noms).forEach(function (n) { if (pal[noms[n]]) el.style.setProperty(n, pal[noms[n]]); });
  }

  return {
    paletteClaire: paletteClaire, appliquerPage: appliquerPage,
    PRESETS: PRESETS, MAX_COULEURS: MAX_COULEURS, TEXTURES: TEXTURES, PALETTES: PALETTES, GROUPES_PALETTES: GROUPES_PALETTES, NOMS: NOMS, INDICES: INDICES,
    hexValide: hexValide, hexToHsl: hexToHsl, hslToHex: hslToHex, contraste: contraste, luminance: luminance,
    variables: variables, textureCss: textureCss, fusionnerStyle: fusionnerStyle, appliquer: appliquer
  };
});
