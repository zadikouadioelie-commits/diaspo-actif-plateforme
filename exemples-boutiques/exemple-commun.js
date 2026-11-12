/* Exemples de boutiques — socle commun (2026-11-10).
   Chaque page d'exemple (boutique.html?type=…, video.html, portfolio.html, evenements.html) charge ce script en premier.
   Il garantit que l'exemple reste ISOLÉ de la vraie plateforme :
   - il ne lit ni n'écrit jamais dans la vraie boutique de quelqu'un : tout le stockage du navigateur est préfixé « exemple: » ;
   - il force le type de l'exemple (shopConfig.main) pour que la page affiche toujours le bon type ;
   - il affiche un bandeau « Exemple — données fictives » et un bouton pour fermer l'onglet ;
   - il demande d'être connecté (créateurs et administrateurs) ;
   - il neutralise les liens vers des pages qui n'existent pas dans l'exemple ;
   - il n'envoie rien au serveur : achats, paiements, messages et inscriptions sont des simulations locales. */
(function () {
  "use strict";
  var PREFIXE = "exemple:";

  /* 1. Type de l'exemple selon la page. La page « Paramètres vitrine » (création) ne force aucun type : c'est elle qui choisit. */
  var fichier = (location.pathname.split("/").pop() || "boutique.html").toLowerCase();
  var params = new URLSearchParams(location.search);
  var PAR_PAGE = { "video.html": "video", "portfolio.html": "portfolio", "evenements.html": "events" };
  var VALIDES = ["ecom", "video", "portfolio", "events", "impact", "finance"];
  var CREATION = fichier === "parametres-vitrine.html";
  /* ?suivre=1 : « Aperçu de ma boutique » — la page affiche le type ET les options enregistrés par la création, sans rien forcer. */
  var SUIVRE = params.get("suivre") === "1";
  var type = (CREATION || SUIVRE) ? null : (PAR_PAGE[fichier] || params.get("type") || "ecom");
  if (type && VALIDES.indexOf(type) < 0) type = "ecom";
  window.EXEMPLE_TYPE = type;

  /* 2. Stockage isolé : toutes les clés de l'exemple sont préfixées, sans modifier le code des pages.
     Pour une page d'exemple d'un type, shopConfig.main est FORCÉ À LA LECTURE (la page affiche toujours son type) et
     n'est jamais réécrit : ouvrir « Voir l'exemple » ne change donc pas la configuration en cours dans Paramètres vitrine. */
  try {
    var proto = Storage.prototype;
    var get = proto.getItem, set = proto.setItem, del = proto.removeItem;
    proto.getItem = function (k) {
      var v = get.call(this, PREFIXE + k);
      if (k === "shopConfig" && type) {
        try { var c = JSON.parse(v) || {}; c.main = type; return JSON.stringify(c); } catch (e) { return JSON.stringify({ main: type }); }
      }
      return v;
    };
    proto.setItem = function (k, v) {
      if (k === "shopConfig" && type) {
        try {
          var nouveau = JSON.parse(v) || {}, ancien = {};
          try { ancien = JSON.parse(get.call(this, PREFIXE + k)) || {}; } catch (e) {}
          if (ancien.main) nouveau.main = ancien.main; else delete nouveau.main;
          v = JSON.stringify(nouveau);
        } catch (e) {}
      }
      return set.call(this, PREFIXE + k, v);
    };
    proto.removeItem = function (k) { return del.call(this, PREFIXE + k); };
  } catch (e) { /* stockage indisponible : l'exemple fonctionne sans mémoire */ }

  var LIBELLES = { video: "Boutique Vidéo", ecom: "Boutique Traditionnelle", portfolio: "Portfolio",
    events: "Créateur d'événements", impact: "Projet Impact", finance: "Organismes de financement" };

  /* 3. Bandeau d'exemple + contrôle de connexion, une fois la page prête. */
  function monter() {
    var s = document.createElement("style");
    s.textContent =
      "#exBandeau{position:sticky;top:0;z-index:100000;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:9px 14px;" +
      "background:#1b1b22;color:#fff;font:13px/1.35 system-ui,-apple-system,'Segoe UI',sans-serif;border-bottom:2px solid #d8b36a}" +
      "#exBandeau b{color:#d8b36a}#exBandeau .exsp{flex:1 1 220px}" +
      "#exBandeau button{border:1px solid #d8b36a;background:transparent;color:#fff;border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit}" +
      "#exBandeau button:hover{background:#d8b36a;color:#111}" +
      "#exVoile{position:fixed;inset:0;z-index:100001;background:rgba(17,17,24,.96);color:#fff;display:none;align-items:center;justify-content:center;" +
      "padding:24px;text-align:center;font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif}" +
      "#exVoile a{color:#111;background:#d8b36a;border-radius:999px;padding:10px 20px;text-decoration:none;font-weight:600;display:inline-block;margin-top:14px}" +
      "#exToast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:100002;background:#1b1b22;color:#fff;border:1px solid #d8b36a;" +
      "border-radius:10px;padding:10px 16px;font:14px system-ui,sans-serif;display:none;max-width:90vw}";
    document.head.appendChild(s);

    var b = document.createElement("div");
    b.id = "exBandeau";
    b.setAttribute("role", "note");
    b.innerHTML = '<span><b>Exemple — données fictives.</b> ' + (CREATION ? "Création d'une boutique (Paramètres vitrine)" : SUIVRE ? "Aperçu de votre boutique selon vos réglages" : (LIBELLES[type] || "")) +'</span>' +
      '<span class="exsp">Tout est simulé : aucun achat, paiement, message ni inscription réel. Cette page n\'est pas une vraie boutique.</span>' +
      '<button type="button" id="exReset">Remettre l\'exemple à zéro</button>' +
      '<button type="button" id="exClose">Fermer l\'exemple</button>';
    document.body.insertBefore(b, document.body.firstChild);

    document.getElementById("exClose").onclick = function () {
      window.close();
      setTimeout(function () { if (!window.closed) history.length > 1 ? history.back() : (location.href = "/index.html"); }, 150);
    };
    document.getElementById("exReset").onclick = function () {
      try {
        var del2 = [];
        for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(PREFIXE) === 0) del2.push(k); }
        del2.forEach(function (k) { Object.getPrototypeOf(localStorage).removeItem.call(localStorage, k.slice(PREFIXE.length)); });
      } catch (e) {}
      location.reload();
    };

    var toast = document.createElement("div"); toast.id = "exToast"; document.body.appendChild(toast);
    var tt = null;
    window.exempleToast = function (m) { toast.textContent = m; toast.style.display = "block"; clearTimeout(tt); tt = setTimeout(function () { toast.style.display = "none"; }, 2600); };

    /* Texture de la couleur principale sur le bandeau (les couleurs 2 et 3 ne sont pas texturées, comme dans la maquette). */
    try {
      var R = window.BOUTIQUE_TYPES, cfgT = JSON.parse(localStorage.getItem("shopConfig") || "{}");
      var idTex = (cfgT.textures || [])[0];
      var tex = R && R.TEXTURES && R.TEXTURES.filter(function (t) { return t.id === idTex; })[0];
      /* Premier bandeau VISIBLE : sur la page commune, impact et finance ont leur propre bandeau (.ih-hero, .fin-hero). */
      var hero = null;
      if (!CREATION) {
        var cands = document.querySelectorAll(".fin-hero, .ih-hero, section.hero, .hero");
        for (var ci = 0; ci < cands.length; ci++) { if (cands[ci].getClientRects().length) { hero = cands[ci]; break; } }
      }
      if (tex && tex.bg && hero) {
        hero.style.position = "relative"; hero.style.overflow = "hidden";
        var couche = document.createElement("div");
        couche.setAttribute("aria-hidden", "true");
        couche.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:0;background:" + tex.bg;
        hero.insertBefore(couche, hero.firstChild);
        Array.prototype.forEach.call(hero.children, function (c) { if (c !== couche) { c.style.position = c.style.position || "relative"; c.style.zIndex = "1"; } });
      }
    } catch (e) {}

    /* Liens vers des pages qui n'existent pas dans l'exemple : message au lieu d'une erreur 404. */
    document.addEventListener("click", function (ev) {
      var a = ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a) return;
      var h = a.getAttribute("href") || "";
      if (!h || h.charAt(0) === "#" || /^(javascript:|mailto:|tel:)/i.test(h)) return;
      if (/^https?:/i.test(h) && a.hostname !== location.hostname) { ev.preventDefault(); window.exempleToast("Lien externe désactivé dans l'exemple."); return; }
      if (/^(boutique|video|portfolio|evenements|parametres-vitrine)\.html(\?|#|$)/i.test(h)) return;
      ev.preventDefault();
      window.exempleToast("Cette page n'existe pas dans l'exemple.");
    }, true);

    /* Connexion : les exemples sont réservés aux créateurs et administrateurs connectés. */
    var voile = document.createElement("div");
    voile.id = "exVoile";
    voile.innerHTML = '<div><p style="font-size:20px;margin:0 0 6px"><b>Connectez-vous pour voir l\'exemple</b></p>' +
      '<p style="margin:0;color:#c9c9d3">Les exemples de boutiques sont réservés aux comptes Diaspo\'Actif connectés.</p>' +
      '<a href="/login.html?redirect=' + encodeURIComponent(location.pathname.replace(/^\//, "") + location.search) + '">Se connecter</a></div>';
    document.body.appendChild(voile);
    try {
      fetch("/api/auth/me", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.user) voile.style.display = "flex";
      }).catch(function () { /* hors ligne : on laisse voir l'exemple fictif */ });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", monter); else monter();
})();
