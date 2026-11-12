/* ===========================================================
   assets/boutique-events-espace.js — Lot E4 (2026-11-12) : « Mon espace organisateur » de la boutique « Créateur d'événements »
   ===========================================================
   Affiché dans l'éditeur de boutique (dashboard-initiative.html) uniquement quand le type de la boutique est « Créateur d'événements ».
   Deux blocs :
     1. « Votre rôle » : organisateur / prestataire / les deux. C'est un RACCOURCI : il montre ou masque « Nos événements » et
        « Nos prestations » (modules evenements, services, demande_devis). Les libellés viennent du serveur (registre → profils_evenements).
     2. « Mon espace organisateur » : des RACCOURCIS vers les écrans qui existent déjà (Mes événements, Billetterie, Statistiques).
        Rien n'est recopié : aucune table, aucune statistique, aucun billet n'est géré ici.
   Utilisation : BoutiqueEventsEspace.rendre(zone, { profils, modules, onProfil, onAller })
     profils  = types_v2.profils_evenements ([{ cle, label, desc }])
     modules  = état des modules du brouillon ({ cle: { actif } })
     onProfil = fonction appelée avec la clé du profil choisi
     onAller  = fonction appelée avec le nom d'une section de l'espace initiative
   Tests : node --test tests/boutique-events-espace.test.js
   =========================================================== */
(function () {
  "use strict";
  var CSS_ID = "beeCss";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /** Même règle que le serveur (server/boutique-events.js → profilDe) : le profil se déduit des modules affichés. */
  function profilDe(modules) {
    var evt = !!(modules && modules.evenements && modules.evenements.actif);
    var prest = !!(modules && modules.services && modules.services.actif);
    if (evt && prest) return "les_deux";
    if (evt) return "organisateur";
    if (prest) return "prestataire";
    return null;
  }

  /* Écrans existants vers lesquels on renvoie : section de l'espace initiative + texte. Aucun nouvel écran. */
  var RACCOURCIS = [
    { section: "evenements", titre: "Mes événements", texte: "Créer, modifier et publier vos événements." },
    { section: "billetterie-init", titre: "Billetterie", texte: "Types de billets, ventes et participants inscrits." },
    { section: "stats-impact", titre: "Statistiques", texte: "Fréquentation et résultats, en chiffres agrégés." }
  ];

  function css() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement("style");
    st.id = CSS_ID;
    st.textContent =
      ".bee{margin-top:16px;padding:16px;border:1px solid var(--border,#E2E8F0);border-radius:14px;background:#fff}" +
      ".bee h4{margin:0 0 4px;font-size:14px;font-weight:800}" +
      ".bee p.bee-aide{margin:0 0 12px;font-size:12.5px;color:var(--muted,#64748B);line-height:1.55}" +
      ".bee-roles,.bee-liens{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}" +
      ".bee-role,.bee-lien{display:flex;flex-direction:column;gap:4px;text-align:left;min-height:44px;padding:12px 14px;border:2px solid var(--border,#E2E8F0);border-radius:12px;background:#fff;color:inherit;font:inherit;cursor:pointer}" +
      ".bee-role[aria-checked=true]{border-color:var(--orange,#F97316);background:#FFF7ED}" +
      ".bee-role b,.bee-lien b{font-size:13.5px}" +
      ".bee-role span,.bee-lien span{font-size:12px;color:var(--muted,#64748B);line-height:1.5}" +
      ".bee-role:focus-visible,.bee-lien:focus-visible{outline:3px solid var(--orange,#F97316);outline-offset:2px}" +
      ".bee-sep{height:1px;background:var(--border,#E2E8F0);margin:16px 0}";
    document.head.appendChild(st);
  }

  /** Construit le HTML (séparé du DOM pour être testable sans navigateur). */
  function html(opts) {
    var courant = profilDe(opts.modules);
    var roles = (opts.profils || []).map(function (p) {
      var actif = p.cle === courant;
      return '<button type="button" class="bee-role" role="radio" aria-checked="' + actif + '" data-profil="' + esc(p.cle) + '">' +
        "<b>" + esc(p.label) + (actif ? " ✓" : "") + "</b><span>" + esc(p.desc) + "</span></button>";
    }).join("");
    var liens = RACCOURCIS.map(function (r) {
      return '<button type="button" class="bee-lien" data-aller="' + esc(r.section) + '"><b>' + esc(r.titre) + "</b><span>" + esc(r.texte) + "</span></button>";
    }).join("");
    return '<div class="bee">' +
      "<h4>Votre rôle</h4>" +
      '<p class="bee-aide">Êtes-vous organisateur d\'événements, prestataire pour les événements des autres, ou les deux ? ' +
      "Ce choix montre ou masque « Nos événements » et « Nos prestations » dans votre boutique ; vous pouvez le changer à tout moment, rien n'est supprimé.</p>" +
      '<div class="bee-roles" role="radiogroup" aria-label="Votre rôle">' + roles + "</div>" +
      (courant === null ? '<p class="bee-aide" style="margin-top:10px">Aucun rôle n\'est actif pour l\'instant : ni « Nos événements » ni « Nos prestations » ne s\'affichent.</p>' : "") +
      '<div class="bee-sep"></div>' +
      "<h4>Mon espace organisateur</h4>" +
      '<p class="bee-aide">Raccourcis vers les écrans de gestion de votre espace.</p>' +
      '<div class="bee-liens">' + liens + "</div></div>";
  }

  function rendre(zone, opts) {
    if (!zone) return;
    css();
    zone.innerHTML = html(opts);
    Array.prototype.forEach.call(zone.querySelectorAll("[data-profil]"), function (b) {
      b.addEventListener("click", function () { if (opts.onProfil) opts.onProfil(b.getAttribute("data-profil")); });
    });
    Array.prototype.forEach.call(zone.querySelectorAll("[data-aller]"), function (b) {
      b.addEventListener("click", function () { if (opts.onAller) opts.onAller(b.getAttribute("data-aller")); });
    });
  }

  var API = { rendre: rendre, html: html, profilDe: profilDe, RACCOURCIS: RACCOURCIS };
  if (typeof window !== "undefined") window.BoutiqueEventsEspace = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
