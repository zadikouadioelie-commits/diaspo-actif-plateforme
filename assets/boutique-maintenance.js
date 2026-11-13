/* Page de maintenance des boutiques (2026-11-02, demande explicite : "tout le module boutique
   lorsqu'on clique dessus, on va mettre une jolie image en maintenance... pas possible d'acheter").
   Partagé par boutique.html (boutique-commerce.js) et boutique-video.html (boutique-video.js) :
   un seul appel avant tout rendu, qui remplace le conteneur par cet écran si la plateforme est
   en réorganisation, sans jamais toucher à la création/configuration d'une boutique (accessible
   ailleurs, depuis le tableau de bord du propriétaire). */
(function () {
  'use strict';
  function ecran() {
    return (
      '<div style="min-height:70vh;display:flex;align-items:center;justify-content:center;padding:32px 20px;font-family:Manrope,system-ui,sans-serif;">' +
        '<div style="max-width:440px;text-align:center;">' +
          '<svg viewBox="0 0 120 120" width="112" height="112" style="margin:0 auto 20px;display:block" aria-hidden="true">' +
            '<circle cx="60" cy="60" r="54" fill="none" stroke="#F2B35C" stroke-width="3" stroke-dasharray="6 7" opacity="0.55"/>' +
            '<rect x="34" y="50" width="52" height="38" rx="4" fill="#8E1B2E"/>' +
            '<rect x="42" y="38" width="36" height="16" rx="3" fill="#B5314A"/>' +
            '<circle cx="60" cy="69" r="7" fill="#F7E6D0"/>' +
            '<rect x="57.5" y="69" width="5" height="11" rx="2" fill="#F7E6D0"/>' +
            '<path d="M22 94h76" stroke="#D7C3A8" stroke-width="3" stroke-linecap="round"/>' +
          '</svg>' +
          '<h1 style="font-family:\'Playfair Display\',serif;font-size:1.5rem;font-weight:700;color:#2A1A12;margin:0 0 10px;">Boutique en réorganisation</h1>' +
          '<p style="font-size:1rem;line-height:1.5;color:#5A4B3E;margin:0 0 6px;">Nous sommes en réorganisation de l’aspect des boutiques.</p>' +
          '<p style="font-size:1rem;line-height:1.5;color:#5A4B3E;margin:0 0 22px;">Vous serez averti rapidement du stade d’avancement.</p>' +
          '<a href="vitrines.html" style="display:inline-block;padding:11px 22px;border-radius:999px;background:#8E1B2E;color:#fff;text-decoration:none;font-weight:700;font-size:0.95rem;">Retour à l’accueil des boutiques</a>' +
        '</div>' +
      '</div>'
    );
  }
  function maintenanceActive() {
    return fetch('/api/plateforme/boutiques-maintenance', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { return !!(d && d.en_maintenance); })
      .catch(function () { return false; });
  }
  /* Aperçu du brouillon (?preview=draft&id=…, dans le centre de création) : le propriétaire voit sa propre page même
     quand la plateforme est en maintenance. On ne s'y fie pas au simple paramètre d'adresse : le serveur répond
     « apercu_brouillon » vrai seulement au propriétaire connecté de cette boutique. Pour tout autre visiteur, rien ne change. */
  function apercuDuProprietaire() {
    var q = new URLSearchParams(location.search), ref = q.get('id') || q.get('slug');
    if (q.get('preview') !== 'draft' || !ref) return Promise.resolve(false);
    return fetch('/api/initiatives/' + encodeURIComponent(ref) + '?preview=draft', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return !!(d && (d.initiative || d).apercu_brouillon === true); })
      .catch(function () { return false; });
  }
  /* Renvoie une Promise<boolean> : true = maintenance active ET conteneur déjà remplacé par
     l'écran (l'appelant doit arrêter son propre chargement), false = continuer normalement. */
  function verifierMaintenanceBoutique(elementOuId) {
    var el = typeof elementOuId === 'string' ? document.getElementById(elementOuId) : elementOuId;
    return apercuDuProprietaire().then(function (apercu) {
      if (apercu) return false;
      return maintenanceActive().then(function (active) {
        if (active && el) el.innerHTML = ecran();
        return active;
      });
    });
  }
  window.DA_verifierMaintenanceBoutique = verifierMaintenanceBoutique;
})();
