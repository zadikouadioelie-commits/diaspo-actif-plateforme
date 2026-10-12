/* Éditeur de CV : l'aperçu A4 (794 px) rétrécit pour tenir dans la largeur disponible au lieu d'être coupé sur les écrans moyens.
   Seul le « zoom » de l'enveloppe change : le PDF et le Word sont produits à partir d'un CLONE de la feuille (#cv-sheet), à taille réelle. */
(function () {
  function ajuster() {
    var w = document.getElementById('cvb-preview-wrapper'), f = document.querySelector('.a4-wrapper');
    if (!w || !f || window.innerWidth <= 900) { if (f) f.style.zoom = ''; return; }   /* petit écran : l'éditeur a déjà sa propre mise en page */
    var z = Math.max(0.5, Math.min(1, (w.clientWidth - 48) / 794));
    f.style.zoom = z < 1 ? z.toFixed(3) : '';
  }
  window.addEventListener('resize', ajuster);
  window.addEventListener('load', function () { setTimeout(ajuster, 600); });
})();
