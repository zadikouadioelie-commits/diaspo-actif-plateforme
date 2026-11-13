/* Boutique « vente en ligne » (style commercial) — boutique.html, 2026-11-01.
   Lit : /initiatives/:id, /produits, /catalogues, /avis, /evenements, /formations, /panier. Écrit : POST /panier, POST /produits/:id/devis.
   Favoris (cœurs) : mémorisés sur l'appareil (localStorage), aucune donnée envoyée. Paramètre d'adresse : ?id=… (ou ?slug=…). */
(function () {
  'use strict';
  var app = document.getElementById('bq-app');
  var toastEl = document.getElementById('bq-toast');
  var modalEl = document.getElementById('bq-modal');
  var etat = { init: null, produits: [], catalogues: [], formationsBande: [], titreBande: '', avis: null, agenda: [], moi: null, panier: 0, cat: null, q: '', favoris: [], slide: 0, minuteur: null };

  /* ── utilitaires ── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(methode, chemin, corps) {
    return fetch('/api' + chemin, { method: methode, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Erreur.'); e.status = r.status; throw e; } return j; }); });
  }
  function toast(msg, ko, lien) {
    toastEl.innerHTML = esc(msg) + (lien ? ' <a href="' + esc(lien.href) + '">' + esc(lien.texte) + '</a>' : '');
    toastEl.className = 'bq-toast vu' + (ko ? ' ko' : '');
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.className = 'bq-toast' + (ko ? ' ko' : ''); }, 4200);
  }
  function argent(n, devise) {
    var d = String(devise || 'EUR').toUpperCase();
    var sym = d === 'EUR' || d === '€' ? '€' : d === 'USD' ? '$' : d;
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + sym;
  }
  function dates(iso) { var d = new Date(String(iso || '').slice(0, 10) + 'T12:00:00'); return isNaN(d) ? null : d; }

  /* ── icônes filaires ── */
  var ICONES = {
    grille: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    diplome: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9v6"/>',
    mallette: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/>',
    ordi: '<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20l-2-4H4z"/>',
    equipe: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15.5 14.4c3 .2 5.5 2.4 5.5 5.6"/>',
    agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="8" cy="14" r=".8"/><circle cx="12" cy="14" r=".8"/><circle cx="16" cy="14" r=".8"/>',
    couronne: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    coeur: '<path d="M12 20s-7-4.6-9-9.2C1.6 7.4 3.7 4 7 4c2 0 3.4 1 5 3 1.6-2 3-3 5-3 3.3 0 5.4 3.4 4 6.8-2 4.6-9 9.2-9 9.2z"/>',
    panier: '<path d="M3 4h2.5l2.2 11h10.3l2-8H6.3"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
    loupe: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    compte: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    bouclier: '<path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5L16 9.5"/>',
    etoile: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
    camion: '<path d="M2 6h11v10H2zM13 9h4l3 3v4h-7"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/>',
    horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lieu: '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    bulle: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    coche: '<path d="M4 12.5l5 5L20 6.5"/>',
    oeil: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    fleche: '<path d="M4 12h16M14 6l6 6-6 6"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    gauche: '<path d="M15 5l-7 7 7 7"/>',
    droite: '<path d="M9 5l7 7-7 7"/>',
    etiquette: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    livre: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5M8 7h7"/>',
    boite: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    casque: '<path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M19 20c0 1.2-1.5 2-4 2"/>',
    mainsCoeur: '<path d="M12 12s-4-2.6-4-5.4C8 5 9.2 4 10.6 4c.9 0 1.5.5 1.4 1 .1-.5.5-1 1.4-1C14.8 4 16 5 16 6.6 16 9.4 12 12 12 12z"/><path d="M2 16l4-1.5 4 1.5h3.5a1.5 1.5 0 010 3H9M22 15l-5.5 3.5H9"/>',
    fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
    certifie: '<path d="M12 2l2.4 1.8 3-.2 1 2.8 2.5 1.7-.8 2.9.8 2.9-2.5 1.7-1 2.8-3-.2L12 22l-2.4-1.8-3 .2-1-2.8-2.5-1.7.8-2.9-.8-2.9 2.5-1.7 1-2.8 3 .2z"/><path d="M8 12l3 3 5-6"/>'
  };
  function ic(nom, classe) { return '<svg class="ic' + (classe ? ' ' + classe : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[nom] || ICONES.etiquette) + '</svg>'; }
  function iconeCategorie(nom) {
    var n = String(nom || '').toLowerCase();
    if (/formation|cours|learning|atelier/.test(n)) return 'diplome';
    if (/accompagn|conseil|coaching|mentor/.test(n)) return 'equipe';
    if (/service/.test(n)) return 'mallette';
    if (/outil|num[ée]rique|logiciel|app/.test(n)) return 'ordi';
    if (/[ée]v[ée]nement|billet|spectacle/.test(n)) return 'agenda';
    if (/abonn|adh[ée]s|membre/.test(n)) return 'couronne';
    if (/kit|support|pack/.test(n)) return 'boite';
    if (/guide|livre|[ée]tude|ebook/.test(n)) return 'livre';
    return 'etiquette';
  }
  /* pastille de l'enseigne : coche bleue (certifié) */
  var COCHE_BLEUE = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 1.8 3-.2 1 2.8 2.5 1.7-.8 2.9.8 2.9-2.5 1.7-1 2.8-3-.2L12 22l-2.4-1.8-3 .2-1-2.8-2.5-1.7.8-2.9-.8-2.9 2.5-1.7 1-2.8 3 .2z"/><path d="M8 12l3 3 5-6"/></svg>';

  /* ── favoris sur l'appareil ── */
  function cleFav() { return 'da_bq_favoris_' + (etat.init ? etat.init.id : '0'); }
  function chargeFavoris() { try { etat.favoris = JSON.parse(localStorage.getItem(cleFav()) || '[]'); } catch (e) { etat.favoris = []; } }
  function basculeFavori(id) {
    id = Number(id); var i = etat.favoris.indexOf(id);
    if (i >= 0) etat.favoris.splice(i, 1); else etat.favoris.push(id);
    try { localStorage.setItem(cleFav(), JSON.stringify(etat.favoris)); } catch (e) { /* stockage indisponible : le cœur reste valable pour la page */ }
    document.querySelectorAll('[data-fav="' + id + '"]').forEach(function (b) { b.setAttribute('aria-pressed', etat.favoris.indexOf(id) >= 0 ? 'true' : 'false'); });
    var p = document.getElementById('bq-fav-n'); if (p) { p.textContent = etat.favoris.length; p.hidden = !etat.favoris.length; }
  }

  /* ── données ── */
  function nombreProduit(p) { return p.prix == null || Number(p.prix) <= 0 ? null : Number(p.prix); }
  function photos(p) { return (p.photos || []).filter(Boolean); }
  function devisPossible(p) {
    var perso = p.devis_active != null ? Number(p.devis_active) : Number(etat.init.vitrine_devis_active || 0);
    return perso === 1;
  }
  function disponible(p) { return (p.statut || 'disponible') === 'disponible'; }

  function charger() {
    var q = new URLSearchParams(location.search);
    var ref = q.get('id') || q.get('slug');
    var pre = ref ? Promise.resolve(ref) : api('GET', '/vitrines').then(function (d) {
      var l = (d.vitrines || d.initiatives || d || []);
      l = Array.isArray(l) ? l : [];
      var off = l.filter(function (v) { return /diaspo.?actif/i.test(v.nom || ''); })[0] || l[0];
      if (!off) throw new Error('Aucune boutique à afficher pour le moment.');
      return off.id;
    });
    return pre.then(function (id) {
      return api('GET', '/initiatives/' + encodeURIComponent(id) + (/[?&]preview=draft(&|$)/.test(location.search) ? '?preview=draft' : '')).then(function (d) {
        etat.init = d.initiative || d;
        var iid = etat.init.id;
        return Promise.all([
          api('GET', '/initiatives/' + iid + '/produits').then(function (r) { etat.produits = r.produits || []; }).catch(function () {}),
          api('GET', '/initiatives/' + iid + '/catalogues').then(function (r) { etat.catalogues = (r.catalogues || []).filter(function (c) { return c.statut !== 'masque'; }); }).catch(function () {}),
          api('GET', '/initiatives/' + iid + '/formations-boutique').then(function (r) { etat.formationsBande = r.formations || []; etat.titreBande = r.titre || ''; }).catch(function () {}),
          api('GET', '/initiatives/' + iid + '/avis').then(function (r) { etat.avis = r; }).catch(function () {}),
          api('GET', '/auth/me').then(function (r) { etat.moi = r.user || null; }).catch(function () {}),
          agenda(etat.init)
        ]);
      });
    }).then(function () {
      if (etat.moi) return api('GET', '/panier').then(function (r) { etat.panier = Number(r.nb_articles) || 0; }).catch(function () {});
    });
  }
  function agenda(init) {
    var auj = new Date().toISOString().slice(0, 10), owner = init.owner_user_id;
    return Promise.all([
      api('GET', '/evenements').then(function (r) {
        return (r.evenements || []).filter(function (e) { return Number(e.owner_user_id) === Number(owner) && String(e.date_evt || '') >= auj && !e.est_termine; })
          .map(function (e) { return { type: 'ÉVÉNEMENT', titre: e.titre, date: e.date_evt, lieu: e.lieu || e.ville || '', image: e.image_couverture || e.image_url, href: 'evenements.html' }; });
      }).catch(function () { return []; }),
      api('GET', '/formations').then(function (r) {
        return (r.formations || []).filter(function (f) { return Number(f.owner_user_id) === Number(owner) && (!f.date_debut || String(f.date_debut) >= auj); })
          .map(function (f) { return { type: 'FORMATION', titre: f.titre, date: f.date_debut || null, lieu: f.mode_acces || f.type_formation || '', image: f.banniere_url || f.image_url, href: 'formation-fiche.html?id=' + f.id }; });
      }).catch(function () { return []; })
    ]).then(function (t) {
      etat.agenda = t[0].concat(t[1]).sort(function (a, b) { return String(a.date || '9').localeCompare(String(b.date || '9')); }).slice(0, 4);
    });
  }

  /* ── morceaux de page ── */
  function etoiles(note) {
    var n = Math.round(Number(note) || 0), h = '';
    for (var i = 1; i <= 5; i++) h += ic('etoile', i <= n ? '' : 'vide');
    return h;
  }
  function logoHtml(classeImg, init) {
    var src = init.logo_url || (/diaspo.?actif/i.test(init.nom || '') ? '/assets/logo.png' : '');
    return src ? '<img src="' + esc(src) + '" alt="Logo ' + esc(init.nom) + '">' : '<span>' + esc((init.boutique_nom || init.nom || '?').charAt(0).toUpperCase()) + '</span>';
  }
  function entete() {
    var nav = [['Accueil', 'index.html'], ['Boutiques', 'vitrines.html', 1], ['Formations', 'formations.html'], ['Services', 'annuaire.html'], ['Projets diasporas', 'actualites.html'], ['À propos', 'initiative.html?id=' + etat.init.id]];
    var compte = etat.moi ? ('dashboard-' + (etat.moi.role === 'administrateur' ? 'administrateur' : etat.moi.role) + '.html') : 'login.html';
    return '<header class="bq-top"><div class="bq-top-in">' +
      '<a class="bq-marque" href="index.html"><img src="/assets/logo.png" alt=""><b>DIASPO\'ACTIF</b></a>' +
      '<nav class="bq-nav" aria-label="Navigation principale">' + nav.map(function (n) { return '<a href="' + n[1] + '">' + n[0] + (n[2] ? ic('chevron') : '') + '</a>'; }).join('') + '</nav>' +
      '<form class="bq-rech" id="bq-rech" role="search"><input type="search" id="bq-q" placeholder="Rechercher un produit, une formation…" aria-label="Rechercher dans la boutique" autocomplete="off"><button type="submit" aria-label="Rechercher">' + ic('loupe') + '</button></form>' +
      '<div class="bq-icones"><button class="bq-icone" type="button" id="bq-fav-b" aria-label="Mes favoris">' + ic('coeur') + '<span class="bq-pastille" id="bq-fav-n"' + (etat.favoris.length ? '' : ' hidden') + '>' + etat.favoris.length + '</span></button>' +
      '<a class="bq-icone" href="panier.html" aria-label="Mon panier">' + ic('panier') + '<span class="bq-pastille" id="bq-pan-n"' + (etat.panier ? '' : ' hidden') + '>' + etat.panier + '</span></a>' +
      '<a class="bq-compte" href="' + compte + '">' + ic('compte') + '<span>' + (etat.moi ? 'Mon compte' : 'Connexion') + '</span>' + ic('chevron') + '</a></div></div></header>';
  }
  function hero() {
    var i = etat.init, officielle = /diaspo.?actif/i.test(i.nom || ''), verifiee = !!Number(i.organisation_verifiee);
    var nom = i.boutique_nom || i.nom;
    var pastille = officielle ? 'Boutique officielle' : (verifiee ? 'Boutique vérifiée' : '');
    var resume = String(i.boutique_description || i.slogan || i.description || ''); if (resume.length > 120) resume = resume.slice(0, 117).replace(/\s+\S*$/, '') + '…';
    return '<section class="bq-hero"><div class="bq-hero-in"><div class="bq-hero-logo">' + logoHtml('', i) + '</div>' +
      '<div><h1>' + esc(nom) + '</h1>' + (pastille ? '<div class="bq-pastille-off">' + esc(pastille) + COCHE_BLEUE + '</div>' : '') +
      (resume ? '<p>' + esc(resume) + '</p>' : '') +
      '<div class="bq-confiance"><span>' + ic('bouclier') + (verifiee ? 'Organisation vérifiée' : 'Boutique de la diaspora') + '</span><span>' + ic('etoile') + 'Produits &amp; services fiables</span><span>' + ic('camion') + 'Paiement sécurisé</span></div></div>' +
      '<div class="bq-hero-droite"><div class="bq-script">' + esc(i.slogan || 'Actions locales, impact global') + '</div></div></div></section>';
  }
  function categories() {
    var vues = [], i;
    etat.produits.forEach(function (p) { var c = (p.categorie || '').trim(); if (c && vues.indexOf(c) < 0) vues.push(c); });
    var h = '<button type="button" class="bq-cat" data-cat="" aria-pressed="' + (etat.cat === null || etat.cat === 'TOUT') + '">' + ic('grille') + 'Tous les produits</button>';
    for (i = 0; i < vues.length; i++) h += '<button type="button" class="bq-cat" data-cat="' + esc(vues[i]) + '" aria-pressed="' + (etat.cat === vues[i]) + '">' + ic(iconeCategorie(vues[i])) + esc(vues[i]) + '</button>';
    return '<div class="bq-cats"><div class="bq-cats-in" role="toolbar" aria-label="Catégories">' + h + '</div></div>';
  }
  function lateral() {
    var i = etat.init, a = etat.avis || {}, nom = i.boutique_nom || i.nom, verifiee = !!Number(i.organisation_verifiee);
    var lieu = [i.vitrine_ville || i.ville, i.vitrine_pays || i.pays].filter(Boolean).join(', ');
    return '<aside class="bq-lateral"><div class="bq-carte bq-profil"><div class="bq-profil-tete"><div class="bq-profil-logo">' + logoHtml('', i) + '</div><div>' +
      '<h2>' + esc(nom) + (verifiee ? COCHE_BLEUE : '') + '</h2><small>' + esc(i.type || 'Organisation') + '</small></div></div>' +
      '<div class="bq-etoiles" aria-label="Note moyenne ' + esc(a.moyenne || 0) + ' sur 5">' + etoiles(a.moyenne) + '<em>' + (a.total ? '(' + a.total + ' avis)' : '(aucun avis)') + '</em></div>' +
      '<ul class="bq-infos">' + (lieu ? '<li>' + ic('lieu') + '<span>' + esc(lieu) + '</span></li>' : '') + (i.vitrine_horaires ? '<li>' + ic('horloge') + '<span>' + esc(i.vitrine_horaires) + '</span></li>' : '') + '</ul>' +
      '<a class="bq-bouton sec" href="initiative.html?id=' + i.id + '#contact">' + ic('bulle') + 'Nous contacter</a>' +
      '<a class="bq-bouton pri" href="initiative.html?id=' + i.id + '">À propos de la boutique</a></div>' +
      '<div class="bq-carte bq-engagements"><h3>' + ic('bouclier') + 'Nos engagements</h3><ul>' +
      ['Produits et services de qualité', 'Paiement 100 % sécurisé (Stripe)', 'Support client réactif', 'Accompagnement personnalisé'].map(function (t) { return '<li>' + ic('coche') + '<span>' + t + '</span></li>'; }).join('') + '</ul></div></aside>';
  }
  function slides() {
    var i = etat.init, s = [], nom = i.boutique_nom || i.nom;
    var banniere = i.vitrine_banniere_url;
    s.push({ h: esc(nom).replace(/^(\S+)/, '<em>$1</em>'), p: String(i.slogan || i.description || 'Découvrez nos produits et services.').slice(0, 150), cta: 'Voir nos produits', act: 'tout', img: banniere });
    if (i.vitrine_offre_flash_titre) s.push({ h: '<em>Offre flash</em> — ' + esc(i.vitrine_offre_flash_titre), p: 'Profitez-en avant la fin de l\'offre.', cta: 'Découvrir', act: 'tout' });
    if (etat.agenda.some(function (a) { return a.type === 'FORMATION'; })) s.push({ h: 'Formations &amp; <em>outils</em>', p: 'Renforcez vos compétences, structurez vos projets et créez de la valeur.', cta: 'Découvrir nos formations', href: 'formations.html' });
    if (i.adhesions_ouvertes) s.push({ h: 'Rejoignez <em>' + esc(nom) + '</em>', p: 'Devenez membre et profitez des avantages réservés à la communauté.', cta: 'Adhérer maintenant', href: 'adhesions.html?initiative=' + i.id });
    return s;
  }
  function carrousel() {
    var s = slides();
    return '<section class="bq-carrousel" aria-roledescription="carrousel" aria-label="À la une">' + s.map(function (x, k) {
      return '<div class="bq-slide' + (k === etat.slide ? ' actif' : '') + (x.img ? ' image' : '') + '"' + (x.img ? ' style="background-image:url(\'' + esc(x.img) + '\')"' : '') + '><h2>' + x.h + '</h2><p>' + esc(x.p) + '</p>' +
        (x.href ? '<a class="bq-bouton" href="' + x.href + '">' + esc(x.cta) + ic('fleche') + '</a>' : '<button type="button" class="bq-bouton" data-act="' + x.act + '">' + esc(x.cta) + ic('fleche') + '</button>') + '</div>';
    }).join('') + (s.length > 1 ? '<div class="bq-points">' + s.map(function (_, k) { return '<button type="button" data-slide="' + k + '" aria-label="Diapositive ' + (k + 1) + '"' + (k === etat.slide ? ' aria-current="true"' : '') + '></button>'; }).join('') + '</div>' : '') + '</section>';
  }
  function enTete(titre, lien, icone) {
    return '<div class="bq-sect-tete"><h2' + (icone ? ' class="avec-icone"' : '') + '>' + (icone ? ic(icone) : '') + esc(titre) + '</h2>' + (lien ? '<button type="button" class="bq-voir" data-act="' + lien[1] + '">' + esc(lien[0]) + ic('fleche') + '</button>' : '') + '</div>';
  }
  /* Bande « Formations créées par <initiative> » : formations que le propriétaire a choisi de vendre ici (lues en direct côté serveur). */
  function prixFormation(v, dev) {
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: String(dev || 'EUR').toUpperCase() }).format(Number(v) || 0); }
    catch (e) { return (Number(v) || 0).toFixed(2) + ' ' + (dev || '€'); }
  }
  function bandeFormations() {
    return '<section class="bq-formations">' + enTete(etat.titreBande, null, 'livre') + '<div class="bq-fbande">' + etat.formationsBande.map(function (f) {
      var promo = !f.gratuit && Number(f.prix_catalogue) > Number(f.prix_final);
      return '<a class="bq-fcarte" href="formation-fiche.html?id=' + encodeURIComponent(f.id) + '">' +
        '<div class="bq-fmedia">' + (f.image_url ? '<img src="' + esc(f.image_url) + '" alt="" loading="lazy" onerror="this.remove()">' : '<span aria-hidden="true">🎓</span>') +
        '<span class="bq-fpuce">Formation</span>' + (f.gratuit ? '<span class="bq-fpuce bq-fgratuit">Gratuit</span>' : '') + '</div>' +
        '<div class="bq-finfo"><h3>' + esc(f.titre) + '</h3>' + (f.auteur ? '<div class="bq-fauteur">par ' + esc(f.auteur) + '</div>' : '') +
        '<div class="bq-fprix">' + (f.gratuit ? 'Gratuit' : (promo ? '<s>' + esc(prixFormation(f.prix_catalogue, f.devise)) + '</s>' : '') + esc(prixFormation(f.prix_final, f.devise))) + '</div></div></a>';
    }).join('') + '</div></section>';
  }
  function carteProduit(p, compact) {
    var ph = photos(p)[0], prix = nombreProduit(p), promo = p.prix_promo != null && Number(p.prix_promo) > 0 && prix && Number(p.prix_promo) < prix ? Number(p.prix_promo) : null;
    var cat = (p.categorie || '').trim(), or = /formation/i.test(cat);
    var dev = devisPossible(p), vendable = prix && disponible(p);
    var etiq = cat ? '<span class="bq-etiquette' + (or ? ' or' : '') + '">' + esc(cat) + '</span>' : '';
    var vign = '<div class="bq-vignette">' + (ph ? '<img loading="lazy" src="' + esc(ph) + '" alt="' + esc(p.nom) + '">' : ic(iconeCategorie(cat))) + etiq +
      '<button type="button" class="bq-coeur" data-fav="' + p.id + '" aria-pressed="' + (etat.favoris.indexOf(Number(p.id)) >= 0) + '" aria-label="Ajouter aux favoris">' + ic('coeur') + '</button></div>';
    var prixHtml = !prix ? '<div class="bq-prix demande">' + (p.prix != null && Number(p.prix) <= 0 ? 'Gratuit' : 'Sur demande') + '</div>' :
      '<div class="bq-prix">' + argent(promo || prix, p.devise) + (promo ? '<s>' + argent(prix, p.devise) + '</s>' : '') + '</div>';
    if (compact) {
      return '<article class="bq-recent">' + vign + '<h3>' + esc(p.nom) + '</h3><div class="bas">' + prixHtml +
        (vendable ? '<button type="button" class="bq-panier-rond" data-ajout="' + p.id + '" aria-label="Ajouter ' + esc(p.nom) + ' au panier">' + ic('panier') + '</button>' : '<button type="button" class="bq-panier-rond" data-det="' + p.id + '" aria-label="Voir ' + esc(p.nom) + '">' + ic('oeil') + '</button>') + '</div></article>';
    }
    var second = vendable ? '<button type="button" class="plein" data-ajout="' + p.id + '">' + ic('panier') + 'Ajouter</button>'
      : dev ? '<button type="button" class="plein" data-devis="' + p.id + '">' + ic('bouclier') + 'Demander un devis</button>'
      : '<a class="plein" href="initiative.html?id=' + etat.init.id + '#contact">' + ic('bulle') + 'Contacter</a>';
    return '<article class="bq-produit">' + vign + '<h3>' + esc(p.nom) + '</h3><p class="desc">' + esc(p.description || '') + '</p>' + prixHtml +
      '<div class="bq-actions"><button type="button" data-det="' + p.id + '">' + ic('oeil') + 'Détails</button>' + second + '</div></article>';
  }
  /* ── Options : lignes horizontales en plus, sous le contenu du type, avec leur titre (décision du 2026-11-01).
     Elles n'altèrent jamais l'aspect global de la boutique : une option = un titre + des cartouches. ── */
  function liste(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v) { try { var j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch (e) { return []; } }
    return [];
  }
  function moduleActif(cle) {
    var m = etat.init.vitrine_modules_state;
    return !!(m && m[cle] && m[cle].actif);
  }
  function cartouches(items, mode) {
    return '<div class="bq-cartouches' + (mode ? ' ' + mode : '') + '">' + items.map(function (x) {
      if (mode === 'chiffres') return '<div class="bq-cartouche chiffre"><b>' + esc(x.valeur || '') + '</b><span>' + esc(x.libelle || '') + '</span></div>';
      if (mode === 'logos') return '<div class="bq-cartouche logo">' + (x.logo_url ? '<img loading="lazy" src="' + esc(x.logo_url) + '" alt="' + esc(x.nom || '') + '">' : '') + '<span>' + esc(x.nom || '') + '</span></div>';
      if (mode === 'photos') return '<div class="bq-cartouche photo">' + (x.url || x.image || typeof x === 'string' ? '<img loading="lazy" src="' + esc(x.url || x.image || x) + '" alt="">' : '') + '</div>';
      var corps = (x.image ? '<span class="img" style="background-image:url(\'' + esc(x.image) + '\')"></span>' : '<span class="img vide">' + ic('etiquette') + '</span>') +
        '<h3>' + esc(x.titre || x.nom || '') + '</h3>' + (x.description ? '<p>' + esc(x.description) + '</p>' : '');
      return x.lien ? '<a class="bq-cartouche" href="' + esc(x.lien) + '" target="_blank" rel="noopener">' + corps + '</a>' : '<div class="bq-cartouche">' + corps + '</div>';
    }).join('') + '</div>';
  }
  function optionsHtml() {
    var o = etat.init, h = '';
    var lignes = [
      ['portfolio', 'Portfolio', 'etiquette', liste(o.vitrine_portfolio_json), ''],
      ['realisations', 'Réalisations & projets', 'etiquette', liste(o.realisations_json), ''],
      ['resultats_impact', 'Résultats & impact', 'etiquette', liste(o.vitrine_resultats_impact_json), 'chiffres'],
      ['galerie_photos', 'Galerie photos', 'etiquette', liste(o.galerie_json), 'photos'],
      ['partenaires', 'Nos partenaires', 'etiquette', liste(o.vitrine_partenaires_json), 'logos']
    ];
    lignes.forEach(function (l) {
      if (!moduleActif(l[0]) || !l[3].length) return;
      h += '<section class="bq-option" data-option="' + l[0] + '">' + enTete(l[1]) + cartouches(l[3].slice(0, 8), l[4]) + '</section>';
    });
    return h;
  }

  /* ── Bonus de la boutique : contenus sans équivalent dans le type, conservés et jamais mis en avant. Le propriétaire les voit
     toujours ; les visiteurs seulement ceux qu'il a publiés (filtrage côté serveur). Placé en dernier, volontairement discret. ── */
  function estProprio() { return !!(etat.moi && etat.init && Number(etat.moi.id) === Number(etat.init.owner_user_id)); }
  function bonusHtml() {
    var b = (etat.init.vitrine_bonus || []).filter(function (x) { return estProprio() || x.publie; });
    if (!b.length) return '';
    var groupes = b.filter(function (x) { return Object.keys(x.contenu || {}).some(function (k) { var v = x.contenu[k]; return liste(v).length || (typeof v === 'string' && v && v.charAt(0) !== '[' && v.charAt(0) !== '{'); }); });
    if (!groupes.length) return '';
    var index = groupes.length > 1 ? '<nav class="bq-bonus-index" aria-label="Rubriques du bonus">' + groupes.map(function (x) { return '<a href="#bq-bonus-' + esc(x.cle) + '">' + esc(x.label) + '</a>'; }).join('') + '</nav>' : '';
    return '<section class="bq-bonus" id="bq-bonus"><h2>Bonus de la boutique</h2>' + index +
      (estProprio() ? '<p class="note">Vous seul voyez les éléments non publiés. Publiez-les depuis Paramètres boutique pour les montrer aux visiteurs.</p>' : '') +
      b.map(function (x) {
        var c = x.contenu || {}, champs = Object.keys(c), corps = '';
        champs.forEach(function (k) {
          var v = c[k], l = liste(v);
          if (l.length) corps += cartouches(l.slice(0, 8), '');
          else if (typeof v === 'string' && v && v.charAt(0) !== '[' && v.charAt(0) !== '{') corps += '<p class="texte">' + esc(v) + '</p>';
        });
        if (!corps) return '';
        return '<div class="bq-bonus-groupe" id="bq-bonus-' + esc(x.cle) + '"><h3>' + esc(x.label) + (estProprio() && !x.publie ? '<span class="pastille-prive">Non publié</span>' : '') + '</h3>' +
          '<div class="origine">Issu de votre ancien type</div>' + corps + '</div>';
      }).join('') + '</section>';
  }
  function vueAccueil() {
    var tous = etat.produits, vedettes = tous.filter(function (p) { return Number(p.mis_en_avant) === 1; });
    if (!vedettes.length) vedettes = tous.slice(0, 4);
    var recents = tous.slice().sort(function (a, b) { return Number(b.id) - Number(a.id); }).slice(0, 5);
    var h = carrousel();
    if (vedettes.length) h += '<section>' + enTete('Nos offres phares', ['Voir tout', 'tout']) + '<div class="bq-grille">' + vedettes.slice(0, 4).map(function (p) { return carteProduit(p); }).join('') + '</div></section>';
    else h += '<div class="bq-vide">Cette boutique n\'a pas encore de produit publié. Revenez bientôt !</div>';
    if (etat.formationsBande.length) h += bandeFormations();
    if (etat.catalogues.length) h += '<section>' + enTete('Nos catalogues', null, 'livre') + '<div class="bq-catalogues">' + etat.catalogues.map(function (c) {
      return '<button type="button" class="bq-catalogue" data-cat="' + esc(c.categorie || '') + '"><span class="img"' + (c.image_url ? ' style="background-image:url(\'' + esc(c.image_url) + '\')"' : '') + '><span class="puce">' + ic(iconeCategorie(c.categorie || c.nom)) + '</span></span><span class="nom">' + esc(c.nom) + '</span></button>'; }).join('') + '</div></section>';
    if (recents.length) h += '<section>' + enTete('Produits récents', ['Voir tous les produits', 'tout']) + '<div class="bq-recents">' + recents.map(function (p) { return carteProduit(p, true); }).join('') + '</div></section>';
    h += optionsHtml();
    if (etat.init.adhesions_ouvertes) {
      h += '<section class="bq-membre"><h2>' + ic('couronne') + '<span>Devenez membre<em>' + esc(etat.init.boutique_nom || etat.init.nom) + '</em></span></h2>' +
        '<ul>' + ['Soutenez l\'initiative et rejoignez la communauté', 'Suivez ses actualités et ses événements', 'Profitez des avantages réservés aux membres'].map(function (t) { return '<li>' + ic('coche') + t + '</li>'; }).join('') + '</ul>' +
        '<a class="bq-bouton" href="adhesions.html?initiative=' + etat.init.id + '">Adhérer maintenant' + ic('fleche') + '</a></section>';
    }
    if (etat.agenda.length) h += '<section>' + enTete('Prochains événements & formations', ['Voir l\'agenda complet', 'agenda'], 'agenda') + '<div class="bq-agenda">' + etat.agenda.map(function (e) {
      var d = dates(e.date);
      return '<a class="bq-evt" href="' + esc(e.href) + '"><div class="bq-date">' + (d ? '<b>' + d.getDate() + '</b><span>' + d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') + '</span>' : '<b>·</b><span>bientôt</span>') + '</div>' +
        '<div><span class="tag">' + esc(e.type) + '</span><h3>' + esc(e.titre) + '</h3>' + (e.lieu ? '<div class="lieu">' + ic('lieu') + esc(e.lieu) + '</div>' : '') + '</div>' +
        '<div class="photo"' + (e.image ? ' style="background-image:url(\'' + esc(e.image) + '\')"' : '') + '></div><span class="fleche">' + ic('fleche') + '</span></a>'; }).join('') + '</div></section>';
    var av = (etat.avis && etat.avis.avis || []).filter(function (a) { return a.commentaire; });
    if (av.length) h += '<section>' + enTete('Ils nous font confiance') + '<div class="bq-avis-rail"><button class="bq-fl g" type="button" data-defil="-1" aria-label="Précédent">' + ic('gauche') + '</button><div class="bq-avis" id="bq-avis">' + av.map(function (a) {
      var nomA = (a.prenom || '') + ' ' + String(a.nom || '').charAt(0) + (a.nom ? '.' : '');
      return '<div class="bq-avis-carte"><p>« ' + esc(a.commentaire) + ' »</p><div class="qui"><span class="rond">' + esc((a.prenom || a.nom || '?').charAt(0).toUpperCase()) + '</span><span>' + esc(nomA.trim()) + '</span><span class="bq-etoiles">' + etoiles(a.note) + '</span></div></div>'; }).join('') +
      '</div><button class="bq-fl d" type="button" data-defil="1" aria-label="Suivant">' + ic('droite') + '</button></div></section>';
    h += bonusHtml();
    return h;
  }
  function vueListe() {
    var q = etat.q.toLowerCase(), l = etat.produits.filter(function (p) {
      if (etat.cat && etat.cat !== 'TOUT' && (p.categorie || '').trim() !== etat.cat) return false;
      return !q || (p.nom + ' ' + (p.description || '') + ' ' + (p.categorie || '')).toLowerCase().indexOf(q) >= 0;
    });
    var titre = etat.cat === 'TOUT' ? 'Tous les produits' : etat.cat || 'Résultats';
    if (q) titre = 'Résultats pour « ' + etat.q + ' »';
    return '<section>' + enTete(titre) + '<p class="bq-meta">' + l.length + ' produit' + (l.length > 1 ? 's' : '') + '</p>' +
      (l.length ? '<div class="bq-grille">' + l.map(function (p) { return carteProduit(p); }).join('') + '</div>' : '<div class="bq-vide">Aucun produit ne correspond. Essayez une autre catégorie ou un autre mot.</div>') + '</section>';
  }
  function assurance() {
    var v = !!Number(etat.init.organisation_verifiee);
    var l = [['camion', 'Livraison ou retrait', 'selon le produit'], ['bouclier', 'Paiement', '100 % sécurisé'], ['casque', 'Support client', 'réactif'], ['certifie', v ? 'Organisation vérifiée' : 'Boutique de la diaspora', 'Diaspo\'Actif'], ['mainsCoeur', 'Impact local', 'et international']];
    return '<div class="bq-assur"><div class="bq-assur-in">' + l.map(function (x) { return '<div>' + ic(x[0]) + '<span><b>' + x[1] + '</b>' + x[2] + '</span></div>'; }).join('') + '</div></div>';
  }
  function pied() {
    var i = etat.init, cats = [];
    etat.produits.forEach(function (p) { var c = (p.categorie || '').trim(); if (c && cats.indexOf(c) < 0) cats.push(c); });
    return '<footer class="bq-pied"><div class="bq-pied-in"><div><div class="marque"><img src="/assets/logo.png" alt=""><span><b>DIASPO\'ACTIF</b>Actions locales, impact global</span></div></div>' +
      '<div><h4>Boutique</h4><ul><li><button type="button" class="lien" data-act="tout">Tous les produits</button></li>' + cats.slice(0, 4).map(function (c) { return '<li><button type="button" class="lien" data-cat="' + esc(c) + '">' + esc(c) + '</button></li>'; }).join('') + '</ul></div>' +
      '<div><h4>Informations</h4><ul><li><a href="initiative.html?id=' + i.id + '">À propos de la boutique</a></li><li><a href="vitrine-qui-sommes-nous.html">Qui sommes-nous</a></li><li><a href="vitrines.html">Toutes les boutiques</a></li><li><a href="annuaire.html">Annuaire</a></li></ul></div>' +
      '<div><h4>Assistance</h4><ul><li><a href="vitrine-faq.html">FAQ</a></li><li><a href="cgv.html">Conditions de vente</a></li><li><a href="confidentialite.html">Confidentialité</a></li><li><a href="mentions-legales.html">Mentions légales</a></li></ul>' +
      '<a class="bq-bouton" href="initiative.html?id=' + i.id + '#contact">' + ic('bulle') + 'Écrire à la boutique</a></div></div></footer>';
  }

  /* Encart « Sondage en cours » : sondages que le propriétaire a choisi d'afficher sur sa boutique (2026-11-09). */
  function sondageBoutique() {
    var m = app.querySelector('.bq-corps');
    if (window.SondagesEnCours && etat.init && etat.init.owner_user_id && m && m.previousElementSibling) SondagesEnCours.rendre({ boutique: etat.init.owner_user_id, apres: m.previousElementSibling });
  }
  /* ── affichage ── */
  function dessiner() {
    var accueil = etat.cat === null && !etat.q;
    document.title = (etat.init.boutique_nom || etat.init.nom) + ' — Boutique Diaspo\'Actif';
    app.innerHTML = entete() + hero() + categories() +
      '<main class="bq-corps">' + lateral() + '<div class="bq-principal" id="bq-principal">' + (accueil ? vueAccueil() : vueListe()) + '</div></main>' + assurance() + pied();
    var f = document.getElementById('bq-q'); if (f) f.value = etat.q;
    demarreCarrousel();
    sondageBoutique();
  }
  function demarreCarrousel() {
    clearInterval(etat.minuteur);
    var n = document.querySelectorAll('.bq-slide').length;
    if (n < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    etat.minuteur = setInterval(function () { allerSlide((etat.slide + 1) % n); }, 6500);
  }
  function allerSlide(k) {
    etat.slide = k;
    document.querySelectorAll('.bq-slide').forEach(function (s, i) { s.classList.toggle('actif', i === k); });
    document.querySelectorAll('.bq-points button').forEach(function (b, i) { if (i === k) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  }
  function filtrer(cat, q) {
    etat.cat = cat; etat.q = q || ''; etat.slide = 0;
    dessiner();
    var c = document.querySelector('.bq-cats'); if (c) window.scrollTo({ top: c.offsetTop - 60, behavior: 'smooth' });
  }

  /* ── fenêtres ── */
  function ouvrir(html) {
    modalEl.innerHTML = '<div class="bq-fenetre" role="dialog" aria-modal="true"><button type="button" class="bq-fermer" data-fermer aria-label="Fermer">' + ic('fermer') + '</button>' + html + '</div>';
    modalEl.hidden = false; var b = modalEl.querySelector('input,textarea,button.plein,a.plein'); if (b) b.focus();
  }
  function fermer() { modalEl.hidden = true; modalEl.innerHTML = ''; }
  function produit(id) { return etat.produits.filter(function (p) { return Number(p.id) === Number(id); })[0]; }
  function detail(id) {
    var p = produit(id); if (!p) return;
    var ph = photos(p), prix = nombreProduit(p), vendable = prix && disponible(p), dev = devisPossible(p);
    var promo = p.prix_promo != null && Number(p.prix_promo) > 0 && prix && Number(p.prix_promo) < prix ? Number(p.prix_promo) : null;
    ouvrir((ph.length ? '<div class="bq-photos"><img id="bq-grande" src="' + esc(ph[0]) + '" alt="' + esc(p.nom) + '">' + (ph.length > 1 ? '<div class="mini">' + ph.map(function (u, k) { return '<img src="' + esc(u) + '" alt="" data-photo="' + esc(u) + '"' + (k === 0 ? ' class="on"' : '') + '>'; }).join('') + '</div>' : '') + '</div>' : '') +
      '<h2>' + esc(p.nom) + '</h2><div class="bq-meta">' + (p.categorie ? '<span class="bq-etiquette" style="position:static">' + esc(p.categorie) + '</span>' : '') + (disponible(p) ? '' : '<strong>Indisponible pour le moment</strong>') + (p.reference ? '<span>Réf. ' + esc(p.reference) + '</span>' : '') + '</div>' +
      '<p style="white-space:pre-line">' + esc(p.description || 'Aucune description.') + '</p>' +
      '<div class="bq-prix' + (prix ? '' : ' demande') + '" style="margin:14px 0">' + (prix ? argent(promo || prix, p.devise) + (promo ? '<s>' + argent(prix, p.devise) + '</s>' : '') : (p.prix != null && Number(p.prix) <= 0 ? 'Gratuit' : 'Sur demande')) + '</div>' +
      '<div class="bq-actions">' + (vendable ? '<button type="button" class="plein" data-ajout="' + p.id + '">' + ic('panier') + 'Ajouter au panier</button>' : dev ? '<button type="button" class="plein" data-devis="' + p.id + '">' + ic('bouclier') + 'Demander un devis</button>' : '<a class="plein" href="initiative.html?id=' + etat.init.id + '#contact">' + ic('bulle') + 'Contacter la boutique</a>') +
      '<button type="button" data-fermer>Fermer</button></div>');
  }
  function formDevis(id) {
    var p = produit(id); if (!p) return;
    var invite = !etat.moi;
    ouvrir('<h2>Demander un devis</h2><p style="margin:0 0 12px;color:var(--bq-doux)">' + esc(p.nom) + '</p><form class="bq-form" id="bq-devis" data-id="' + p.id + '" data-ts="' + Date.now() + '">' +
      (invite ? '<div class="duo"><label>Prénom<input name="prenom" required maxlength="100" autocomplete="given-name"></label><label>Nom<input name="nom" required maxlength="100" autocomplete="family-name"></label></div>' +
        '<div class="duo"><label>E-mail<input type="email" name="email" required maxlength="254" autocomplete="email"></label><label>Téléphone' + (Number(etat.init.vitrine_devis_tel_requis) ? '' : ' (facultatif)') + '<input type="tel" name="tel" maxlength="30" autocomplete="tel"' + (Number(etat.init.vitrine_devis_tel_requis) ? ' required' : '') + '></label></div>' : '') +
      '<label>Votre besoin<textarea name="description" rows="4" maxlength="2000" required placeholder="Décrivez ce que vous souhaitez…"></textarea></label>' +
      '<label>Quantité (facultatif)<input type="number" name="quantite" min="1" step="1" inputmode="numeric"></label>' +
      '<input class="piege" name="site_perso" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div class="bq-actions"><button type="button" data-fermer>Annuler</button><button type="submit" class="plein">Envoyer la demande</button></div><p id="bq-devis-msg" role="alert" style="margin:0;color:var(--bq-bordeaux2);font-weight:700"></p></form>');
  }

  /* ── actions ── */
  function ajouter(id, bouton) {
    var p = produit(id); if (!p) return;
    if (!etat.moi) { toast('Connectez-vous pour ajouter au panier.', true, { href: 'login.html', texte: 'Me connecter' }); return; }
    var mode = Number(p.livraison_expedition) && !Number(p.livraison_retrait) ? 'expedition' : 'retrait';
    if (bouton) bouton.disabled = true;
    api('POST', '/panier', { produit_id: Number(p.id), quantite: 1, mode_livraison: mode }).then(function (r) {
      etat.panier = Number(r.nb_articles) || etat.panier + 1;
      var b = document.getElementById('bq-pan-n'); if (b) { b.textContent = etat.panier; b.hidden = false; }
      toast('Ajouté au panier ✓', false, { href: 'panier.html', texte: 'Voir mon panier' });
    }).catch(function (e) { toast(e.message || 'Impossible d\'ajouter au panier.', true); })
      .then(function () { if (bouton) bouton.disabled = false; });
  }
  function envoyerDevis(f) {
    var d = new FormData(f), msg = document.getElementById('bq-devis-msg'), btn = f.querySelector('[type=submit]');
    var corps = { site_perso: d.get('site_perso') || '', _form_ts: Number(f.dataset.ts), description: d.get('description'), quantity: d.get('quantite') || null };
    if (!etat.moi) { corps.requester_first_name = d.get('prenom'); corps.requester_last_name = d.get('nom'); corps.requester_email = d.get('email'); corps.requester_phone = d.get('tel') || ''; }
    msg.textContent = ''; btn.disabled = true;
    api('POST', '/produits/' + f.dataset.id + '/devis', corps).then(function () { fermer(); toast('Demande envoyée ✓ — la boutique vous répondra.'); })
      .catch(function (e) { msg.textContent = e.message || 'Envoi impossible.'; btn.disabled = false; });
  }

  /* ── événements (délégation) ── */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-cat],[data-act],[data-fav],[data-ajout],[data-det],[data-devis],[data-slide],[data-defil],[data-fermer],[data-photo],#bq-fav-b');
    if (!t) { if (e.target === modalEl) fermer(); return; }
    if (t.hasAttribute('data-fermer')) return fermer();
    if (t.id === 'bq-fav-b') { var fs = etat.produits.filter(function (p) { return etat.favoris.indexOf(Number(p.id)) >= 0; }); if (!fs.length) { toast('Touchez le cœur d\'un produit pour le retrouver ici.'); return; } ouvrir('<h2>Mes favoris</h2><div class="bq-grille" style="grid-template-columns:1fr">' + fs.map(function (p) { return carteProduit(p, true); }).join('') + '</div>'); return; }
    if (t.hasAttribute('data-photo')) { document.getElementById('bq-grande').src = t.getAttribute('data-photo'); modalEl.querySelectorAll('.mini img').forEach(function (i) { i.classList.toggle('on', i === t); }); return; }
    if (t.hasAttribute('data-fav')) return basculeFavori(t.getAttribute('data-fav'));
    if (t.hasAttribute('data-ajout')) return ajouter(t.getAttribute('data-ajout'), t);
    if (t.hasAttribute('data-det')) return detail(t.getAttribute('data-det'));
    if (t.hasAttribute('data-devis')) return formDevis(t.getAttribute('data-devis'));
    if (t.hasAttribute('data-slide')) { allerSlide(Number(t.getAttribute('data-slide'))); return demarreCarrousel(); }
    if (t.hasAttribute('data-defil')) { var r = document.getElementById('bq-avis'); if (r) r.scrollBy({ left: Number(t.getAttribute('data-defil')) * 380, behavior: 'smooth' }); return; }
    if (t.hasAttribute('data-act')) { var a = t.getAttribute('data-act'); if (a === 'agenda') { location.href = 'agenda.html'; return; } if (modalEl.hidden === false) fermer(); return filtrer('TOUT'); }
    if (t.hasAttribute('data-cat')) { if (modalEl.hidden === false) fermer(); var c = t.getAttribute('data-cat'); return filtrer(c === '' ? null : c); }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'bq-rech') { e.preventDefault(); var v = document.getElementById('bq-q').value.trim(); return filtrer(v ? 'TOUT' : null, v); }
    if (e.target.id === 'bq-devis') { e.preventDefault(); envoyerDevis(e.target); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modalEl.hidden) fermer(); });

  (window.DA_verifierMaintenanceBoutique ? window.DA_verifierMaintenanceBoutique(app) : Promise.resolve(false)).then(function (bloque) {
    if (bloque) return;
    charger().then(function () { chargeFavoris(); dessiner(); })
      .catch(function (e) { app.innerHTML = '<p class="bq-chargement">' + esc(e.message || 'Boutique introuvable.') + ' <a href="vitrines.html" style="color:var(--bq-bordeaux);font-weight:700">Voir toutes les boutiques</a></p>'; });
  });
})();
