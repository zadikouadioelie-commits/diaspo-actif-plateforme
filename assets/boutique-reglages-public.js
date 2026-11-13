/* ===========================================================
   assets/boutique-reglages-public.js — Réglages de la boutique vus par les visiteurs (lot 4A, 2026-11-13)
   ===========================================================
   Les réglages des étapes 6, 7 et 10 de l'assistant de création (commande minimum, pays desservis, retrait / expédition, frais,
   délais, informations légales) sont enregistrés par server/boutique-reglages.js et renvoyés par GET /api/initiatives/:id
   dans « vitrine_reglages ». Ce fichier les affiche, de la même façon sur toutes les pages de boutique.

   Règle : une boutique qui n'a rien réglé n'affiche RIEN de plus (aucune ligne inventée, aucun bloc vide).

   Utilisation dans une page de boutique :
     BoutiqueReglagesPublic.definir(initiative.vitrine_reglages);
     BoutiqueReglagesPublic.htmlConditions()  -> bloc « Livraison et conditions » (ou "" s'il n'y a rien à dire)
     BoutiqueReglagesPublic.htmlLegal()       -> bloc « Informations légales » pour le bas de page (ou "")
     BoutiqueReglagesPublic.resumeLivraison() -> { titre, sous } pour une bande de garanties, ou null
   Les textes légaux s'ouvrent dans une fenêtre native <dialog> : le focus reste dans la fenêtre, Échap la ferme,
   le focus revient sur le bouton qui l'a ouverte. Aucun HTML n'est interprété : tout texte saisi est échappé.
   Fichier UMD : window.BoutiqueReglagesPublic ou require() dans Node (pour les tests).
   =========================================================== */
(function (racine, fabrique) {
  var api = fabrique(racine);
  if (typeof module === "object" && module.exports) module.exports = api; else racine.BoutiqueReglagesPublic = api;
})(typeof self !== "undefined" ? self : this, function (racine) {
  "use strict";

  var DOCUMENTS = [
    { id: "cgv", libelle: "Conditions de vente" },
    { id: "retours", libelle: "Retours et remboursements" },
    { id: "mentions", libelle: "Mentions légales" },
    { id: "confidentialite", libelle: "Confidentialité" }
  ];
  var reglages = null;

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function euro(n) { return Number(n).toFixed(2).replace(".", ",") + " €"; }
  function lienSur(u) { return /^https?:\/\/\S+$/i.test(String(u || "")) ? String(u) : ""; }
  function section(nom) { return (reglages && reglages[nom] && typeof reglages[nom] === "object") ? reglages[nom] : {}; }

  function definir(valeur) { reglages = (valeur && typeof valeur === "object") ? valeur : null; }

  /* Lignes « libellé / valeur » à afficher. Seules les valeurs réellement choisies par la boutique apparaissent.
     options.livraison = false : pour les types sans envoi de produit (événements, impact, finance), on n'affiche pas ces lignes. */
  function lignesConditions(options) {
    var o = options || {}, c = section("commercial"), l = section("livraison"), lignes = [];
    var min = Number(c.minimum_commande) || 0;
    if (min > 0) lignes.push(["Commande minimum", euro(min)]);
    if (o.livraison === false) return lignes;
    var zones = Array.isArray(c.pays_vente) ? c.pays_vente.filter(Boolean) : [];
    if (zones.length) lignes.push(["Livraison dans", zones.join(", ")]);
    if (l.expedition === false && l.retrait !== false) lignes.push(["Mode de remise", "Retrait sur place uniquement"]);
    else if (l.retrait === false && l.expedition !== false) lignes.push(["Mode de remise", "Expédition uniquement"]);
    if (l.frais_mode === "gratuit") lignes.push(["Frais de livraison", "Offerts"]);
    else if (l.frais_mode === "fixe") lignes.push(["Frais de livraison", euro(Number(l.frais_montant) || 0) + " par commande"]);
    var prep = Number(l.preparation_jours) || 0;
    if (prep > 0) lignes.push(["Préparation", prep + (prep > 1 ? " jours" : " jour")]);
    if (String(l.delai_estime || "").trim()) lignes.push(["Délai de livraison estimé", String(l.delai_estime).trim()]);
    return lignes;
  }

  function htmlConditions(options) {
    var lignes = lignesConditions(options);
    if (!lignes.length) return "";
    return '<section class="rp-conditions" aria-labelledby="rp-cond-titre"><h2 id="rp-cond-titre">Livraison et conditions</h2><dl>' +
      lignes.map(function (x) { return "<div><dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd></div>"; }).join("") + "</dl></section>";
  }

  /* Pour une bande de garanties : « Retrait sur place / uniquement », « Livraison offerte / partout »… null = ne rien changer. */
  function resumeLivraison() {
    var c = section("commercial"), l = section("livraison");
    var delai = String(l.delai_estime || "").trim();
    var seul = l.expedition === false && l.retrait !== false ? "Retrait sur place" : (l.retrait === false && l.expedition !== false ? "Expédition" : "");
    var zones = Array.isArray(c.pays_vente) ? c.pays_vente.filter(Boolean) : [];
    if (!seul && !delai && l.frais_mode !== "gratuit" && !zones.length) return null;
    var titre = seul || (l.frais_mode === "gratuit" ? "Livraison offerte" : "Livraison ou retrait");
    var sous = delai || (zones.length ? (zones.length > 2 ? zones.slice(0, 2).join(", ") + "…" : zones.join(", ")) : (seul ? "uniquement" : "selon le produit"));
    return { titre: titre, sous: sous };
  }

  function identite() {
    var k = section("confiance"), parts = [];
    var nom = String(k.raison_sociale || "").trim();
    var commercial = String(k.nom_commercial || "").trim();
    if (nom) parts.push("<b>" + esc(nom) + "</b>" + (commercial && commercial !== nom ? " (" + esc(commercial) + ")" : ""));
    else if (commercial) parts.push("<b>" + esc(commercial) + "</b>");
    if (String(k.statut_juridique || "").trim()) parts.push(esc(k.statut_juridique));
    if (String(k.siret || "").trim()) parts.push("N° " + esc(k.siret));
    if (String(k.email || "").trim()) parts.push('<a href="mailto:' + esc(k.email) + '">' + esc(k.email) + "</a>");
    if (String(k.tel || "").trim()) parts.push('<a href="tel:' + esc(String(k.tel).replace(/[^\d+]/g, "")) + '">' + esc(k.tel) + "</a>");
    return parts;
  }

  function documents() {
    var k = section("confiance");
    return DOCUMENTS.filter(function (d) {
      var doc = k[d.id];
      return doc && (String(doc.texte || "").trim() || lienSur(doc.url));
    });
  }

  /* Un document : bouton qui ouvre le texte, sinon lien vers l'adresse enregistrée. */
  function elementDocument(d) {
    var doc = section("confiance")[d.id] || {};
    if (String(doc.texte || "").trim()) return '<button type="button" class="rp-lien" data-rp-doc="' + esc(d.id) + '">' + esc(d.libelle) + "</button>";
    return '<a class="rp-lien" href="' + esc(lienSur(doc.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(d.libelle) + "</a>";
  }

  function htmlLegal() {
    var id = identite(), docs = documents();
    if (!id.length && !docs.length) return "";
    return '<section class="rp-legal" aria-labelledby="rp-legal-titre"><h2 id="rp-legal-titre">Informations légales de la boutique</h2>' +
      (id.length ? '<p class="rp-identite">' + id.join(" · ") + "</p>" : "") +
      (docs.length ? '<ul class="rp-docs">' + docs.map(function (d) { return "<li>" + elementDocument(d) + "</li>"; }).join("") + "</ul>" : "") + "</section>";
  }

  var STYLE = [
    ".rp-conditions,.rp-legal{max-width:1280px;margin:0 auto;padding:18px 20px;font-size:14px;line-height:1.5;color:inherit}",
    ".rp-conditions h2,.rp-legal h2{margin:0 0 8px;font-size:16px;font-weight:700;color:inherit}",
    ".rp-conditions dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:0}",
    ".rp-conditions dl>div{padding:10px 12px;border:1px solid currentColor;border-color:rgba(127,127,127,.35);border-radius:8px}",
    ".rp-conditions dt{font-size:12px;opacity:.75}.rp-conditions dd{margin:2px 0 0;font-weight:700}",
    ".rp-identite{margin:0 0 8px;opacity:.9}.rp-identite a{color:inherit;text-decoration:underline}",
    ".rp-docs{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0;padding:0;list-style:none}",
    ".rp-docs .rp-lien,.rp-lien{display:inline-flex;align-items:center;min-height:44px;padding:0;border:0;background:none;color:inherit;font:inherit;text-decoration:underline;cursor:pointer}",
    ".rp-lien:focus-visible{outline:2px solid currentColor;outline-offset:3px}",
    "dialog.rp-dialog{width:min(680px,calc(100vw - 32px));max-height:85vh;padding:0;border:0;border-radius:12px;background:#fff;color:#1b2236;box-shadow:0 20px 60px rgba(0,0,0,.4)}",
    "dialog.rp-dialog::backdrop{background:rgba(10,20,40,.6)}",
    ".rp-dialog-tete{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #e3e3e8}",
    ".rp-dialog-tete h2{margin:0;font-size:18px;color:#1b2236}",
    ".rp-dialog-corps{padding:16px 18px;overflow:auto;max-height:calc(85vh - 140px);white-space:pre-wrap;font-size:15px;line-height:1.6}",
    ".rp-dialog-pied{padding:12px 18px;border-top:1px solid #e3e3e8;font-size:14px}.rp-dialog-pied a{color:#1b2236}",
    ".rp-fermer{min-width:44px;min-height:44px;padding:0 14px;border:1px solid #c9c9d2;border-radius:8px;background:#fff;color:#1b2236;font:inherit;cursor:pointer}",
    ".rp-fermer:focus-visible{outline:2px solid #1b2236;outline-offset:2px}"
  ].join("");

  function poserStyle() {
    var doc = racine.document;
    if (!doc || doc.getElementById("rp-style")) return;
    var s = doc.createElement("style");
    s.id = "rp-style";
    s.textContent = STYLE;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function ouvrir(idDoc) {
    var doc = racine.document;
    var d = DOCUMENTS.filter(function (x) { return x.id === idDoc; })[0];
    var contenu = section("confiance")[idDoc] || {};
    if (!doc || !d || !String(contenu.texte || "").trim()) return;
    poserStyle();
    var ancien = doc.getElementById("rp-dialog");
    if (ancien && ancien.parentNode) ancien.parentNode.removeChild(ancien);
    var dlg = doc.createElement("dialog");
    dlg.id = "rp-dialog";
    dlg.className = "rp-dialog";
    dlg.setAttribute("aria-labelledby", "rp-dialog-titre");
    dlg.innerHTML = '<div class="rp-dialog-tete"><h2 id="rp-dialog-titre">' + esc(d.libelle) + '</h2><button type="button" class="rp-fermer" data-rp-fermer>Fermer</button></div>' +
      '<div class="rp-dialog-corps">' + esc(contenu.texte) + "</div>" +
      (lienSur(contenu.url) ? '<div class="rp-dialog-pied"><a href="' + esc(lienSur(contenu.url)) + '" target="_blank" rel="noopener noreferrer">Version en ligne de ce document</a></div>' : "");
    doc.body.appendChild(dlg);
    dlg.addEventListener("click", function (ev) { if (ev.target === dlg || (ev.target.closest && ev.target.closest("[data-rp-fermer]"))) dlg.close(); });
    dlg.addEventListener("close", function () { if (dlg.parentNode) dlg.parentNode.removeChild(dlg); });
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }

  if (racine.document && racine.document.addEventListener) {
    poserStyle();
    racine.document.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("[data-rp-doc]") : null;
      if (b) { ev.preventDefault(); ouvrir(b.getAttribute("data-rp-doc")); }
    });
  }

  return { definir: definir, lignesConditions: lignesConditions, htmlConditions: htmlConditions, htmlLegal: htmlLegal, resumeLivraison: resumeLivraison, identite: identite, documents: documents, ouvrir: ouvrir, DOCUMENTS: DOCUMENTS };
});
