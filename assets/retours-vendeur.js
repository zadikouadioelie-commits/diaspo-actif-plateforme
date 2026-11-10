/* Section « Retours et litiges » du tableau de bord Initiative (lot G, 2026-11-10).
   Structure et actions de la maquette validée (espace-proprietaire) ; données réelles : GET /api/initiatives/:id/retours.
   Différences voulues avec la maquette : pas de bouton « Simuler +15 jours » (le délai est calculé par le serveur) et « Marquer remboursé »
   devient « Rembourser le client » : le remboursement est demandé au prestataire de paiement depuis VOTRE compte, et n'est affiché « Remboursé »
   qu'une fois confirmé par le prestataire. */
(function () {
  'use strict';
  var R = window.RetoursCommun;
  var ETAT = { racine: null, initId: 0 };
  var VERROUILLES = ['litige', 'litige_traite', 'remboursement_en_cours', 'remboursee', 'refusee'];

  function boutons(d) {
    var id = d.id, s = d.statut, h = '';
    if (s === 'envoyee' || s === 'precisions') h += '<button class="rt-bouton" type="button" data-rv="accepter" data-id="' + id + '">Accepter le retour</button>';
    if (s === 'envoyee') h += '<button class="rt-bouton discret" type="button" data-rv="preciser" data-id="' + id + '">Demander des précisions</button>';
    if (s === 'envoyee' || s === 'precisions') h += '<button class="rt-bouton danger" type="button" data-rv="refuser" data-id="' + id + '">Refuser</button>';
    h += '<button class="rt-bouton discret" type="button" data-rv="rembourser" data-id="' + id + '" data-montant="' + R.esc(R.euros(d.montant, d.devise)) + '">Rembourser le client</button>';
    h += '<button class="rt-bouton discret" type="button" data-rv="repondre" data-id="' + id + '">Répondre au client</button>';
    return h;
  }

  function carte(d) {
    var verrou = d.verrouille_vendeur;
    var info = '';
    if (d.statut === 'litige' || d.statut === 'litige_traite') info = 'Ce dossier est confié à l\'administrateur litiges : vous ne pouvez plus agir dessus.';
    else if (d.statut === 'remboursement_en_cours') info = 'Le remboursement est demandé à votre prestataire de paiement. Le dossier passera à « Remboursé » dès sa confirmation.';
    else if (verrou) info = 'Ce dossier est clos.';
    return '<li>' +
      '<div><b>' + R.esc(d.produit) + '</b> · ' + R.esc(d.motif) + ' · <b>' + R.esc(R.STATUT_VENDEUR[d.statut] || d.statut) + '</b></div>' +
      '<div class="rt-muet">' + R.esc(d.plaignant || 'Client') + ' · ' + R.esc(R.euros(d.montant, d.devise)) + ' · Règle : ' + R.esc(d.regle) + ' · ' + R.esc(d.jours_sans_reponse) + ' jour(s) sans activité</div>' +
      '<div style="margin-top:6px">' + R.esc(d.details) + '</div>' +
      R.photo(d.photo, 'Photo du client') +
      R.historique(d) +
      (verrou ? '<p class="rt-verrou">' + R.esc(info) + '</p>' :
        '<textarea id="rv-' + d.id + '" placeholder="Votre message ou motif" style="margin-top:10px"></textarea>' +
        '<div class="rt-actions">' + boutons(d) + '</div><div class="rt-msg" id="rvm-' + d.id + '"></div>') +
      '</li>';
  }

  async function charger() {
    var el = ETAT.racine;
    if (!el) return;
    if (!ETAT.initId) { el.innerHTML = '<p class="rt-muet">Aucune initiative liée.</p>'; return; }
    el.innerHTML = '<div class="rt-muet" style="text-align:center;padding:24px">Chargement…</div>';
    try {
      var r = await api('GET', '/initiatives/' + ETAT.initId + '/retours');
      var liste = r.retours || [];
      el.innerHTML =
        '<h3>Retours et litiges</h3>' +
        '<p class="rt-muet">Vous devez répondre sous ' + R.esc(r.delai_jours) + ' jours. Sans réponse, le dossier est transmis automatiquement à l\'administrateur litiges de Diaspo\'Actif.</p>' +
        (liste.length ? '<ul class="rt-liste">' + liste.map(carte).join('') + '</ul>'
          : '<div class="rt-note">Aucune demande de retour pour l\'instant. Les clients les envoient depuis la page « Demande de retour ».</div>');
    } catch (e) {
      el.innerHTML = '<p class="rt-muet">Impossible de charger les demandes de retour pour le moment.</p>';
    }
  }

  document.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-rv]');
    if (!b || !ETAT.racine || !ETAT.racine.contains(b)) return;
    var act = b.getAttribute('data-rv'), id = b.getAttribute('data-id');
    var champ = document.getElementById('rv-' + id), texte = (champ && champ.value || '').trim(), sortie = document.getElementById('rvm-' + id);
    if ((act === 'refuser' || act === 'preciser' || act === 'repondre') && texte.length < 5) return R.dire(sortie, 'Écrivez votre message (5 caractères minimum).', true);
    if (act === 'rembourser' && !confirm('Rembourser ' + b.getAttribute('data-montant') + ' au client ? Le remboursement part de votre compte de paiement et ne peut pas être annulé.')) return;
    var chemin = act === 'repondre' ? '/retours/' + id + '/repondre' : '/retours/' + id + '/' + act;
    var corps = act === 'refuser' ? { motif: texte } : { message: texte };
    b.disabled = true;
    try { await api('POST', chemin, corps); await charger(); }
    catch (err) { b.disabled = false; R.dire(sortie, err && err.message ? err.message : 'Action impossible.', true); }
  });

  window.RetoursVendeur = {
    monter: function (el, initId) { ETAT.racine = el; ETAT.initId = Number(initId) || 0; return charger(); }
  };
})();
