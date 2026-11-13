/* ===========================================================
   assets/boutique-rubriques.js — Rubriques choisies par le propriétaire, vues par les visiteurs (lot 4B, 2026-11-13)
   ===========================================================
   Les pages Portfolio, Vidéo et Événements montrent ce qu'elles ont toujours montré, SAUF si le propriétaire a décidé d'éteindre une
   rubrique à l'étape « Rubriques » de la création de sa boutique. Le serveur marque ces décisions (champ `choisi`) : tant qu'une
   rubrique n'a pas été touchée, elle garde le comportement d'avant (affichée dès qu'elle a du contenu). Éteindre une rubrique ne
   supprime jamais ses données : elle est seulement cachée aux visiteurs.
   Usage : BoutiqueRubriques.active(init.vitrine_modules_state, 'avis') → true / false
   =========================================================== */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.BoutiqueRubriques = api;
})(typeof window !== 'undefined' ? window : this, function () {
  /* true sauf si le propriétaire a explicitement éteint cette rubrique */
  function active(etat, cle) {
    var m = etat && typeof etat === 'object' ? etat[cle] : null;
    if (!m || typeof m !== 'object' || !m.choisi) return true;
    return !!m.actif;
  }
  /* liste des rubriques éteintes par le propriétaire (utile pour les tests et le diagnostic) */
  function eteintes(etat) {
    var l = [];
    if (etat && typeof etat === 'object') Object.keys(etat).forEach(function (k) { if (!active(etat, k)) l.push(k); });
    return l;
  }
  return { active: active, eteintes: eteintes };
});
