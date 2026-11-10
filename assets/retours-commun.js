/* Retours, réclamations et litiges (lot G, 2026-11-10) — éléments communs aux trois interfaces (client, vendeur, administrateur).
   Données : uniquement celles du serveur (/api/mes-retours, /api/initiatives/:id/retours, /api/admin/litiges). Aucune donnée de démonstration,
   aucune horloge simulée : le délai de 15 jours est calculé par le serveur. */
(function () {
  'use strict';
  var STATUT_CLIENT = {
    envoyee: ['En attente de réponse du vendeur', ''],
    precisions: ['Le vendeur demande des précisions', ''],
    acceptee: ['Retour accepté', 'ok'],
    refusee: ['Demande refusée', 'off'],
    remboursement_en_cours: ['Remboursement en cours', 'cours'],
    remboursee: ['Remboursé', 'ok'],
    litige: ['Transmis à l\'administrateur litiges', 'off'],
    litige_traite: ['Dossier traité par l\'administrateur litiges', 'ok']
  };
  var STATUT_VENDEUR = {
    envoyee: 'En attente de votre réponse',
    precisions: 'Précisions demandées au client',
    acceptee: 'Retour accepté',
    refusee: 'Retour refusé',
    remboursement_en_cours: 'Remboursement demandé — en attente de la confirmation du prestataire de paiement',
    remboursee: 'Remboursé',
    litige: 'Transmis à l\'administrateur litiges',
    litige_traite: 'Traité par l\'administrateur litiges'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  /* Les dates du serveur sont en UTC, au format « AAAA-MM-JJ HH:MM:SS ». */
  function date(t) {
    if (!t) return '';
    var d = new Date(String(t).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(t)) ? '' : 'Z'));
    return isNaN(d) ? '' : d;
  }
  function jour(t) { var d = date(t); return d ? d.toLocaleDateString('fr-FR') : ''; }
  function jourHeure(t) { var d = date(t); return d ? d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''; }
  function euros(n, devise) {
    var v = Number(n) || 0;
    try { return v.toLocaleString('fr-FR', { style: 'currency', currency: devise || 'EUR' }); } catch (e) { return v.toFixed(2) + ' ' + (devise || '€'); }
  }
  /* Seules les images envoyées au serveur (data:image/… ou https://…) sont affichées. */
  function photo(src, alt) {
    if (!src || !/^(data:image\/|https:\/\/)/.test(src)) return '<div class="rt-muet" style="margin-top:8px">Aucune photo jointe.</div>';
    return '<img class="rt-photo" src="' + esc(src) + '" alt="' + esc(alt || 'Photo jointe') + '" loading="lazy">';
  }
  function historique(d) {
    return '<div class="rt-hist"><b>Historique complet</b>' + (d.historique || []).map(function (h) {
      return '<div>' + esc(jourHeure(h.le)) + ' · ' + esc(h.par) + (h.texte ? ' : ' + esc(h.texte) : (h.action ? ' : ' + esc(h.action) : '')) + '</div>';
    }).join('') + '</div>';
  }
  function etiquetteClient(statut) {
    var s = STATUT_CLIENT[statut] || [statut, ''];
    return '<span class="rt-tag ' + s[1] + '">' + esc(s[0]) + '</span>';
  }
  function dire(el, texte, erreur) { if (!el) return; el.textContent = texte; el.className = 'rt-msg' + (erreur ? ' err' : ''); }

  window.RetoursCommun = { esc: esc, jour: jour, jourHeure: jourHeure, euros: euros, photo: photo, historique: historique, etiquetteClient: etiquetteClient, dire: dire, STATUT_VENDEUR: STATUT_VENDEUR, STATUT_CLIENT: STATUT_CLIENT };
})();
