/* ===========================================================
   assets/boutique-types-ui.js — Lot B (B3) + lot D : choix du type de boutique sur la vraie plateforme (2026-11-11)
   ===========================================================
   Affiche les 6 types du registre (assets/boutique-types.js, servi par GET /api/vitrine-modules-registry → types_v2).
   Aucun libellé, aucun texte, aucun nombre n'est écrit ici : tout vient du registre. Icônes SVG linéaires (pas d'émoticônes).
   Le bouton « Voir l'exemple » avec miniature vient de assets/boutique-exemple-bouton.js (session de l'Atelier), s'il est chargé.
   Utilisation : BoutiqueTypesUI.rendre(zone, { desc, courant, onChoisir })
     desc      = types_v2 de la réponse du registre
     courant   = type enregistré de la boutique (ancienne ou nouvelle clé)
     onChoisir = fonction appelée avec la clé du registre choisie
   =========================================================== */
(function () {
  "use strict";
  var CSS_ID = "btuiCss";

  /* Icônes linéaires, une par clé du registre. Un type ajouté au registre sans icône reçoit l'icône générique. */
  var ICONES = {
    ecom: '<path d="M6 7h12l-1 12H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    video: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M10 9.5v5l4.5-2.5-4.5-2.5z"/>',
    portfolio: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4 3 2.5 3-3L20 16"/>',
    events: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    impact: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z"/>',
    finance: '<path d="M3.5 9.5L12 4l8.5 5.5"/><path d="M5.5 10v8M10 10v8M14 10v8M18.5 10v8M3.5 20h17"/>',
    _defaut: '<rect x="4" y="4" width="16" height="16" rx="3"/>'
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function css() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement("style");
    s.id = CSS_ID;
    s.textContent =
      ".btui-grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}" +
      ".btui-carte{display:flex;flex-direction:column;gap:10px;border:2px solid var(--border,#e2e8f0);border-radius:14px;padding:16px;background:var(--card,#fff);color:var(--text,#0f172a)}" +
      ".btui-carte.btui-actuel{border-color:var(--orange,#c2410c);background:rgba(194,65,12,.06)}" +
      ".btui-carte.btui-bientot{opacity:.78}" +
      ".btui-tete{display:flex;align-items:center;gap:12px}" +
      ".btui-ico{flex:none;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;border:1.5px solid currentColor;color:var(--orange,#c2410c)}" +
      ".btui-ico svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}" +
      ".btui-nom{font-size:15px;font-weight:800;line-height:1.25}" +
      ".btui-desc{font-size:12.5px;color:var(--muted,#475569);line-height:1.5}" +
      ".btui-plus summary{cursor:pointer;font-size:12.5px;font-weight:700;color:var(--orange,#c2410c);min-height:28px;display:flex;align-items:center}" +
      ".btui-plus div{font-size:12.5px;line-height:1.6;margin-top:6px}" +
      ".btui-plus b{display:block;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#475569);margin-top:8px}" +
      ".btui-pied{margin-top:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center}" +
      ".btui-btn{min-height:40px;padding:8px 16px;border-radius:10px;border:none;background:var(--orange,#c2410c);color:#fff;font-weight:700;font-size:13px;cursor:pointer}" +
      ".btui-btn[disabled]{background:transparent;color:var(--muted,#475569);border:1.5px solid var(--border,#e2e8f0);cursor:default}" +
      ".btui-btn:focus-visible,.btui-plus summary:focus-visible{outline:3px solid var(--orange,#c2410c);outline-offset:2px}" +
      ".btui-note{grid-column:1/-1;font-size:12.5px;line-height:1.6;border:1px solid var(--border,#e2e8f0);border-radius:10px;padding:10px 12px;background:rgba(100,116,139,.08)}";
    document.head.appendChild(s);
  }

  function icone(cle) { return '<span class="btui-ico" aria-hidden="true"><svg viewBox="0 0 24 24">' + (ICONES[cle] || ICONES._defaut) + '</svg></span>'; }

  /* Clé du registre pour une clé enregistrée (ancienne ou nouvelle) ; null si l'ancien type n'a pas d'équivalent. */
  function canonique(desc, cle) {
    if (!cle) return null;
    if ((desc.types || []).some(function (t) { return t.cle === cle; })) return cle;
    return (desc.ancien_vers_nouveau || {})[cle] || null;
  }

  function carte(t, actuel) {
    var exemple = (window.ExempleBoutique && window.ExempleBoutique.carte) ? window.ExempleBoutique.carte(t.cle) : "";
    var bouton = actuel ? '<button type="button" class="btui-btn" disabled aria-pressed="true">Type actuel</button>'
      : t.selectionnable ? '<button type="button" class="btui-btn" data-btui-choisir="' + esc(t.cle) + '">Choisir ce type</button>'
        : '<button type="button" class="btui-btn" disabled>Bientôt disponible</button>';
    return '<article class="btui-carte' + (actuel ? ' btui-actuel' : '') + (t.selectionnable ? '' : ' btui-bientot') + '" aria-label="' + esc(t.label) + '">' +
      '<div class="btui-tete">' + icone(t.cle) + '<div><div class="btui-nom">' + esc(t.label) + '</div></div></div>' +
      '<div class="btui-desc">' + esc(t.desc) + '</div>' +
      '<details class="btui-plus"><summary>En savoir plus</summary><div>' +
      '<b>Ce que c\'est</b>' + esc(t.what) + '<b>À qui il s\'adresse</b>' + esc(t.who) + '<b>Ce qu\'il contient</b>' + esc(t.contains) + '</div></details>' +
      exemple +
      '<div class="btui-pied">' + bouton + '</div></article>';
  }

  function rendre(zone, opts) {
    if (!zone || !opts || !opts.desc) return;
    css();
    var desc = opts.desc;
    var actuel = canonique(desc, opts.courant);
    var html = "";
    if (opts.courant && !actuel) {
      html += '<div class="btui-note">Votre boutique utilise un ancien type (« ' + esc(opts.courant) + ' »). Il est conservé tel quel : rien ne change tant que vous ne choisissez pas un des types ci-dessous.</div>';
    }
    html += (desc.types || []).map(function (t) { return carte(t, t.cle === actuel); }).join("");
    zone.classList.add("btui-grille");
    zone.innerHTML = html;
    if (!zone.__btuiLie) {
      zone.__btuiLie = true;
      zone.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("[data-btui-choisir]") : null;
        if (b && zone.__btuiChoisir) zone.__btuiChoisir(b.getAttribute("data-btui-choisir"));
      });
    }
    zone.__btuiChoisir = opts.onChoisir;
  }

  window.BoutiqueTypesUI = { rendre: rendre, canonique: canonique, icones: ICONES };
})();
