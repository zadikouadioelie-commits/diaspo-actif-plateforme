/* ══════════════════════════════════════════════════════════════════
   BANNIERES_PRESET — styles de bannière prêts à l'emploi (visuels
   vectoriels maison, aucun risque de droits, nets à toute résolution).

   Source unique (2026-08-18) : cette liste vivait auparavant dupliquée
   uniquement dans assets/carte-diaspoactif.js (rôle Utilisateur). Extraite
   ici pour être réutilisée telle quelle par tout autre point d'édition de
   bannière (ex. profil-app.html pour Initiative/Collectivité) — jamais une
   copie séparée qui pourrait diverger. Charger ce script AVANT tout script
   qui lit window.BANNIERES_PRESET.

   Un preset devient la valeur de banner_url au même titre qu'une photo
   personnelle uploadée : aucun champ ni route serveur supplémentaire
   nécessaire, PUT /profil { banner_url: preset.id } suffit.
   ══════════════════════════════════════════════════════════════════ */
window.BANNIERES_PRESET = [
  { id: 'assets/banner-default.svg', label: 'Ville & Réseau' },
  { id: 'assets/banner-map.svg',     label: 'Carte du monde' },
  { id: 'assets/banner-angles.svg',  label: 'Angles Marine' },
  { id: 'assets/banner-circuit.svg', label: 'Circuit Tech' },
  { id: 'assets/banner-moutarde.svg', label: 'Jaune Moutarde' },
  { id: 'assets/banner-bordeaux.svg', label: 'Bordeaux Élégant' },
  { id: 'assets/banner-damier.svg',   label: 'Damier Collage' },
  { id: 'assets/banner-diagonale.svg', label: 'Diagonale Grise' },
  { id: 'assets/banner-foret.svg',    label: 'Forêt' },
  { id: 'assets/banner-tech-bleu.svg', label: 'Tech Bleu' },
  { id: 'assets/banner-skyline-violet.svg', label: 'Skyline Violet' },
];
