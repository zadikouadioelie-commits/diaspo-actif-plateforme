/* ===========================================================
   assets/boutique-evenements-contenus.js — « Mes événements » dans les Paramètres de la boutique (2026-11-24, étape 2)
   Le propriétaire d'une boutique « Créateur d'événements » voit ICI les événements que sa boutique présente (À venir, Brouillons, Terminés),
   les publie, et ouvre leur modification, dans Paramètres Boutique (dashboard-initiative.html#parametres-vitrine&evenements),
   au lieu de l'ancienne vue d'édition du profil (?edition=1) — qui ne faisait que les afficher et renvoyer vers « Créer un événement ».
   Aucune donnée ni route nouvelle :
     - Liste      → GET   /api/evenements?owner=<compte>   (le propriétaire y voit aussi ses brouillons ; même source que la page boutique-evenements.html)
     - Publier    → PATCH /api/evenements/:id/publier      (ne touche que le statut : aucun champ de l'événement n'est réécrit)
     - Créer / Modifier / Voir → écrans qui existent déjà (evenements.html) ; « Tout gérer » ouvre le module « Mes événements » du tableau de bord.
   Le formulaire complet d'un événement, la billetterie et les statistiques ne sont PAS recopiés ici.
   Utilise les fonctions globales de la page : api(method, path, body), pvRefreshPreview().
   Montage : PvEvenements.monter(initiative) depuis loadParametresVitrineFull() ; visible pour le type « Créateur d'événements » seulement.
   Tests : node --test tests/boutique-evenements-contenus.test.js
   =========================================================== */
(function () {
  'use strict';
  if (window.PvEvenements) return;

  var PAGE = 12; /* lignes affichées d'un coup : « Voir les N suivants » pour le reste */
  var ONGLETS = [
    { cle: 'a_venir', lib: 'À venir et en cours', vide: '<b>Aucun événement à venir.</b><br>Créez votre prochain événement : il apparaîtra dans votre boutique dès sa publication.' },
    { cle: 'brouillon', lib: 'Brouillons', vide: '<b>Aucun brouillon.</b><br>Un événement enregistré en brouillon reste invisible de vos visiteurs jusqu\'à sa publication.' },
    { cle: 'termine', lib: 'Terminés', vide: '<b>Aucun événement terminé.</b><br>Vos événements passés apparaîtront ici.' }
  ];
  var TYPES = { evenement: 'Événement', forum: 'Forum', atelier: 'Atelier', webinaire: 'Webinaire', conference: 'Conférence', gala: 'Gala', marche: 'Marché / Foire', networking: 'Réseautage', debat: 'Débat', concours: 'Concours', trophee_diaspora: 'Trophée diaspora', autre: 'Autre' };
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  var S = { initId: null, ownerId: null, etat: null, evts: null, onglet: 'a_venir', n: PAGE, message: '', erreur: '', occupe: 0 };

  function $(id) { return document.getElementById(id); }
  function racine() { return $('pv-evenements-mount'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function texte(v) { return String(v == null ? '' : v).trim(); }
  function entier(v) { var n = Number(v); return isFinite(n) && n > 0 ? Math.floor(n) : 0; }
  function jour(v) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? { a: +m[1], m: +m[2], j: +m[3] } : null; }
  function dateCourte(v) { var d = jour(v); return d ? d.j + ' ' + MOIS[d.m - 1] + ' ' + d.a : ''; }
  function imageDe(e) { var u = texte(e.image_couverture || e.image_url); return /^(https?:\/\/|\/)/i.test(u) ? u : ''; }

  /* ---------- classement ---------- */
  function termine(e) { return e.statut_temporel === 'termine' || e.est_termine === true; }
  function classe(e) {
    if (e.statut === 'brouillon') return 'brouillon';
    return termine(e) ? 'termine' : 'a_venir';
  }
  function trier(liste, cle) {
    var l = liste.slice();
    l.sort(function (a, b) {
      var x = texte(a.date_evt) + ' ' + texte(a.heure_debut), y = texte(b.date_evt) + ' ' + texte(b.heure_debut);
      return cle === 'termine' ? (x < y ? 1 : x > y ? -1 : 0) : (x < y ? -1 : x > y ? 1 : 0);
    });
    return l;
  }
  function deLonglet(cle) { return trier((S.evts || []).filter(function (e) { return classe(e) === cle; }), cle); }

  /* ---------- une ligne ---------- */
  function visibilite(e) {
    if (e.statut === 'brouillon') return null;
    if (e.visibilite === 'boutique') return { lib: 'Boutique uniquement', cl: 'pvp-dispo' };
    if (Number(e.masquer_boutique)) return { lib: 'Hors de votre boutique', cl: 'pvp-masque' };
    return { lib: 'Boutique et Événements', cl: 'pvp-dispo' };
  }
  function ligne(e) {
    var id = entier(e.id), img = imageDe(e), nom = texte(e.titre) || 'Sans titre';
    var ou = [texte(e.ville || e.lieu), texte(e.pays)].filter(Boolean).join(', ');
    var quand = dateCourte(e.date_evt) + (e.date_fin && dateCourte(e.date_fin) !== dateCourte(e.date_evt) ? ' → ' + dateCourte(e.date_fin) : '') + (texte(e.heure_debut) ? ' · ' + esc(texte(e.heure_debut)) : '');
    var v = visibilite(e), brouillon = e.statut === 'brouillon';
    var prog = brouillon && texte(e.publication_programmee_le) ? dateCourte(e.publication_programmee_le) : '';
    var pastilles =
      (brouillon ? '<span class="pvp-pastille pvp-epuise">Brouillon</span>' : termine(e) ? '<span class="pvp-pastille pvp-masque">Terminé</span>' : '<span class="pvp-pastille pvp-dispo">En ligne</span>') +
      (prog ? '<span class="pvp-pastille pvp-duree">Publication prévue le ' + esc(prog) + '</span>' : '') +
      (v ? '<span class="pvp-pastille ' + v.cl + '">' + v.lib + '</span>' : '') +
      (e.type_evt && TYPES[e.type_evt] && e.type_evt !== 'evenement' ? '<span class="pvp-pastille pvp-duree">' + esc(TYPES[e.type_evt]) + '</span>' : '') +
      (Number(e.prix_min) > 0 ? '<span class="pvp-pastille pvp-duree">Dès ' + esc(String(Number(e.prix_min))) + ' €</span>' : '');
    return '<div class="pvp-ligne pvp-ev" data-id="' + id + '">' +
      '<div class="pvp-vignette">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span aria-hidden="true">📅</span>') + '</div>' +
      '<div class="pvp-info"><p class="pvp-nom">' + esc(nom) + '</p>' +
      '<p class="pvp-aide" style="margin:0 0 4px">' + esc(quand) + (ou ? ' · ' + esc(ou) : '') + '</p>' +
      '<div class="pvp-meta">' + pastilles + '</div></div>' +
      '<div class="pvp-actions">' +
      (brouillon ? '<button type="button" class="pvp-btn pvp-petit pvp-or" data-a="publier" aria-label="Publier « ' + esc(nom) + ' »"' + (S.occupe ? ' disabled' : '') + '>Publier</button>' : '') +
      '<a class="pvp-btn pvp-petit" href="evenements.html#evt-' + id + '" aria-label="Modifier « ' + esc(nom) + ' »">Modifier</a>' +
      (brouillon ? '' : '<a class="pvp-btn pvp-petit" href="evenements.html?evt=' + id + '" aria-label="Voir « ' + esc(nom) + ' »">Voir</a>') +
      '</div></div>';
  }

  function reservationEteinte() {
    return !!(window.BoutiqueRubriques && S.etat && !window.BoutiqueRubriques.active(S.etat, 'reservation'));
  }

  /* ---------- vue ---------- */
  function dessiner() {
    var r = racine(); if (!r) return;
    if (S.evts === null) { r.innerHTML = '<div class="notice">Chargement…</div>'; return; }
    if (S.evts === false) {
      r.innerHTML = '<p class="pvp-erreur" role="alert">Vos événements ne peuvent pas être chargés pour le moment.</p><p><button type="button" class="pvp-btn" data-a="reessayer">Réessayer</button></p>';
      return;
    }
    var o = ONGLETS.filter(function (x) { return x.cle === S.onglet; })[0] || ONGLETS[0];
    var items = deLonglet(o.cle), n = items.length;
    var puces = '<div class="pvp-puces" role="group" aria-label="Vos événements">' + ONGLETS.map(function (x) {
      var nb = deLonglet(x.cle).length;
      return '<button type="button" class="pvp-puce' + (x.cle === o.cle ? ' on' : '') + '" data-s="' + x.cle + '" aria-pressed="' + (x.cle === o.cle) + '">' + x.lib + (nb ? ' (' + nb + ')' : '') + '</button>';
    }).join('') + '</div>';
    var h = '<div class="pvp-outils">' + puces + '</div>' +
      '<p class="pvp-aide">Les événements que votre boutique présente à vos visiteurs. Le formulaire complet, la billetterie et les statistiques restent dans « Mes événements ».</p>';
    if (S.message) h += '<p class="pvp-ok" role="status">' + esc(S.message) + '</p>';
    if (S.erreur) h += '<p class="pvp-erreur" role="alert">' + esc(S.erreur) + '</p>';
    if (reservationEteinte()) h += '<p class="pvp-note" role="status">La rubrique « Réservation » est éteinte dans votre boutique : vos visiteurs voient vos événements mais ne peuvent pas s\'y inscrire depuis la boutique. Vous pouvez la rallumer à l\'étape « Rubriques » de la création de la boutique.</p>';
    h += '<div class="pvp-barre"><span class="pvp-compteur"><b>' + n + '</b> événement' + (n > 1 ? 's' : '') + '</span>' +
      '<a class="pvp-btn pvp-or pvp-pousse" href="evenements.html?creer_evenement=1">＋ Nouvel événement</a>' +
      '<button type="button" class="pvp-btn" data-a="gerer">Tout gérer</button></div>';
    if (!n) h += '<div class="pvp-vide">' + o.vide + '</div>';
    else {
      h += '<div class="pvp-groupes"><section class="pvp-groupe">' + items.slice(0, S.n).map(ligne).join('') + '</section></div>';
      if (n > S.n) h += '<p class="pvp-note"><button type="button" class="pvp-lien" data-a="plus">Voir les ' + (n - S.n) + ' suivants</button></p>';
    }
    r.innerHTML = h;
  }

  /* ---------- actions ---------- */
  function charger() {
    S.evts = null; dessiner();
    return api('GET', '/evenements?owner=' + encodeURIComponent(S.ownerId)).then(function (r) {
      var liste = (r && (r.evenements || r.events)) || [];
      S.evts = liste.filter(function (e) { return e && Number(e.owner_user_id) === Number(S.ownerId); });
      dessiner();
    }).catch(function () { S.evts = false; dessiner(); });
  }
  function publier(id) {
    var e = (S.evts || []).filter(function (x) { return Number(x.id) === id; })[0]; if (!e || e.statut !== 'brouillon') return;
    if (!window.confirm('Publier « ' + (texte(e.titre) || 'cet événement') + ' » ? Il deviendra visible de vos visiteurs et des abonnés aux alertes.')) return;
    S.occupe = 1; S.erreur = ''; S.message = ''; dessiner();
    api('PATCH', '/evenements/' + id + '/publier').then(function () {
      e.statut = 'ouvert'; e.publication_programmee_le = null;
      S.occupe = 0; S.message = 'Événement publié. Il apparaît maintenant dans votre boutique.'; S.onglet = termine(e) ? 'termine' : 'a_venir'; S.n = PAGE;
      try { if (typeof pvRefreshPreview === 'function') pvRefreshPreview(); } catch (x) {}
      dessiner();
    }).catch(function (x) { S.occupe = 0; S.erreur = (x && x.message) || 'La publication a échoué. Réessayez.'; dessiner(); });
  }

  function brancher() {
    var r = racine(); if (!r || r.__pvevBranche) return; r.__pvevBranche = true;
    r.addEventListener('click', function (e) {
      var o = e.target.closest('[data-s]');
      if (o) { S.onglet = o.dataset.s; S.n = PAGE; S.message = ''; S.erreur = ''; dessiner(); return; }
      var b = e.target.closest('[data-a]'); if (!b) return;
      var a = b.dataset.a, l = b.closest('.pvp-ligne');
      if (a === 'publier' && l) publier(entier(l.dataset.id));
      else if (a === 'plus') { S.n += PAGE; dessiner(); }
      else if (a === 'gerer') { if (typeof window.initShowSection === 'function') window.initShowSection('evenements'); else location.href = 'dashboard-initiative.html#evenements'; }
      else if (a === 'reessayer') charger();
    });
  }

  function monter(init) {
    var carte = $('pv-evenements'); if (!carte) return;
    var type = init && init.vitrine_type ? String(init.vitrine_type) : '';
    if (!init || !init.id || (type !== 'events' && type !== 'evenement')) { carte.style.display = 'none'; return; }
    carte.style.display = '';
    S.initId = init.id; S.ownerId = init.owner_user_id || null; S.etat = init.vitrine_modules_state || null;
    S.onglet = 'a_venir'; S.n = PAGE; S.message = ''; S.erreur = ''; S.occupe = 0; S.evts = null;
    brancher(); dessiner();
    if (S.ownerId) charger();
    else api('GET', '/auth/me').then(function (r) { S.ownerId = r && r.user && r.user.id; if (S.ownerId) return charger(); S.evts = false; dessiner(); }).catch(function () { S.evts = false; dessiner(); });
    if (/[#&]evenements(&|$)/.test(location.hash)) { try { carte.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
  }

  window.PvEvenements = { monter: monter };
})();
