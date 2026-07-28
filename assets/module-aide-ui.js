/* Calcule les modules réellement présents sur CETTE page (assets/module-aide.js) —
   permet à O-Z de ne répondre qu'avec les modules pertinents pour ce dashboard
   (ex. ne pas répondre avec le "Module paiement" de l'Initiative sur le dashboard
   Utilisateur, qui a son propre module "Paiements"). Aucune icône affichée. */
(function () {
  function init() {
    if (!window.MODULE_AIDE) return;
    window._moduleAideActifs = new Set(
      [...document.querySelectorAll('.sidebar a[data-aide]')].map(a => a.getAttribute('data-aide'))
    );
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* Certains liens (ex. modules Premium révélés après vérification d'accréditation,
     ou groupes masqués par défaut) apparaissent après le chargement initial —
     on rescanne périodiquement pendant les premières secondes. */
  let tries = 0;
  const rescan = setInterval(() => {
    init();
    if (++tries > 20) clearInterval(rescan);
  }, 500);
})();
