/* ===========================================================
   assets/boutique-a11y.js — Accessibilité des fenêtres des pages boutique (lot 4D, 2026-11-13)
   Pour une fenêtre modale (fiche produit, lecteur vidéo, création, fiche d'événement…) :
   - le focus clavier reste DANS la fenêtre (Tab et Maj+Tab font le tour, rien ne s'échappe vers la page cachée) ;
   - à la fermeture, le focus revient sur l'élément qui l'a ouverte ;
   - le focus entre dans la fenêtre à l'ouverture (premier élément utilisable) si rien n'y est encore actif.
   Usage :  var liberer = BoutiqueA11y.piege(zone);   …   liberer();
   - zone : l'élément qui contient la fenêtre (visible quand elle est ouverte).
   - options : { restaurer: false } pour garder soi-même le retour du focus ; { ouvreur: el } pour le fixer.
   Un second appel sur la même zone (contenu remplacé pendant que la fenêtre reste ouverte) garde l'ouvreur d'origine.
   =========================================================== */
(function () {
  'use strict';
  if (window.BoutiqueA11y) return;

  var FOCALISABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,video[controls],audio[controls],summary,[tabindex]:not([tabindex="-1"])';
  var actif = null; // { zone, ouvreur, restaurer }

  function visible(el) {
    if (el.hidden) return false;
    var s = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (s && (s.visibility === 'hidden' || s.display === 'none')) return false;
    return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
  }
  function focalisables(zone) {
    return Array.prototype.filter.call(zone.querySelectorAll(FOCALISABLE), visible);
  }
  function surTab(e) {
    if (!actif || e.key !== 'Tab') return;
    var zone = actif.zone;
    var liste = focalisables(zone);
    if (!liste.length) { e.preventDefault(); zone.setAttribute('tabindex', '-1'); zone.focus(); return; }
    var premier = liste[0], dernier = liste[liste.length - 1], cour = document.activeElement;
    if (!zone.contains(cour)) { e.preventDefault(); premier.focus(); return; }
    if (e.shiftKey && (cour === premier || cour === zone)) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && cour === dernier) { e.preventDefault(); premier.focus(); }
  }
  function surFocus(e) {
    if (!actif || actif.zone.contains(e.target)) return;
    var liste = focalisables(actif.zone);
    if (liste.length) liste[0].focus();
  }
  function liberer() {
    if (!actif) return;
    var a = actif; actif = null;
    document.removeEventListener('keydown', surTab, true);
    document.removeEventListener('focusin', surFocus, true);
    if (a.restaurer && a.ouvreur && document.contains(a.ouvreur) && typeof a.ouvreur.focus === 'function') {
      try { a.ouvreur.focus({ preventScroll: true }); } catch (x) { a.ouvreur.focus(); }
    }
  }
  function piege(zone, options) {
    options = options || {};
    if (!zone) return function () {};
    if (actif && actif.zone === zone) { /* contenu remplacé : on garde l'ouvreur d'origine */ }
    else {
      liberer();
      var ouvreur = options.ouvreur || document.activeElement;
      if (ouvreur === document.body || (zone.contains && zone.contains(ouvreur))) ouvreur = null;
      actif = { zone: zone, ouvreur: ouvreur, restaurer: options.restaurer !== false };
      document.addEventListener('keydown', surTab, true);
      document.addEventListener('focusin', surFocus, true);
    }
    if (!zone.contains(document.activeElement)) {
      var liste = focalisables(zone);
      if (liste.length) liste[0].focus(); else { zone.setAttribute('tabindex', '-1'); zone.focus(); }
    }
    return liberer;
  }
  window.BoutiqueA11y = { piege: piege, liberer: liberer };
})();
