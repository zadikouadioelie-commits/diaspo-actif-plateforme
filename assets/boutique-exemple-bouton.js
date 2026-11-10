/* Bouton « Voir l'exemple » avec miniature (2026-11-10).
   Utilisé dans le choix du type de boutique (Paramètres vitrine) et dans l'Atelier des boutiques.
   Le clic ouvre l'exemple dans un NOUVEL ONGLET : le créateur navigue, ferme l'onglet et retrouve l'écran où il était.
   Dépend de assets/boutique-types.js (window.BOUTIQUE_TYPES). */
(function () {
  "use strict";
  var CSS_ID = "exBoutiqueBtnCss";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function css() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement("style");
    s.id = CSS_ID;
    s.textContent =
      ".exb{display:flex;gap:12px;align-items:center;border:1px solid rgba(216,179,106,.45);border-radius:12px;padding:10px;background:rgba(255,255,255,.04)}" +
      ".exb-mini{flex:0 0 112px;width:112px;height:70px;border-radius:8px;object-fit:cover;object-position:top;background:#1b1b22;border:1px solid rgba(216,179,106,.35)}" +
      ".exb-txt{flex:1 1 auto;min-width:0;font-size:13px;line-height:1.35}" +
      ".exb-txt b{display:block;font-size:14px}" +
      ".exb-lien{display:inline-block;margin-top:6px;border:1px solid #d8b36a;color:inherit;border-radius:999px;padding:5px 12px;text-decoration:none;font-size:13px;font-weight:600;min-height:32px;box-sizing:border-box}" +
      ".exb-lien:hover,.exb-lien:focus-visible{background:#d8b36a;color:#111}" +
      "@media(max-width:420px){.exb{flex-direction:column;align-items:flex-start}.exb-mini{width:100%;flex-basis:auto;height:120px}}";
    document.head.appendChild(s);
  }

  /* HTML d'une carte « miniature + Voir l'exemple » pour un type donné (clé de BOUTIQUE_TYPES.TYPES). */
  function carte(cle) {
    var R = window.BOUTIQUE_TYPES;
    var t = R && R.TYPES && R.TYPES[cle];
    if (!t) return "";
    css();
    return '<div class="exb" data-exb="' + esc(cle) + '">' +
      '<img class="exb-mini" loading="lazy" src="/exemples-boutiques/miniatures/' + esc(cle) + '.webp" alt="Aperçu de l\'exemple : ' + esc(t.label) + '" width="112" height="70">' +
      '<div class="exb-txt"><b>' + esc(t.label) + '</b><span>Exemple avec des données fictives</span><br>' +
      '<a class="exb-lien" href="' + esc(t.exemple) + '" target="_blank" rel="noopener">Voir l\'exemple</a></div></div>';
  }

  window.ExempleBoutique = { carte: carte, urlExemple: function (cle) { var t = window.BOUTIQUE_TYPES && window.BOUTIQUE_TYPES.TYPES[cle]; return t ? t.exemple : null; } };
})();
