/* Boutique « Vidéo » — boutique-video.html, 2026-11-01.
   Lit : /initiatives/:id, /initiatives/:id/produits, /auth/me, /panier. Écrit : POST /panier.
   Une vidéo à vendre = un produit de la boutique : nom, description, prix (et prix promo), catégorie, première photo = miniature,
   video_url (aperçu), video_duree (secondes), video_type (courte | explicative | serie ; sinon déduit de la durée).
   Filtres, tri, recherche et pagination sont faits sur la page. Les notes par vidéo n'existent pas encore : aucune étoile n'est affichée tant qu'une note
   (note_moyenne + nb_avis) n'est pas fournie par le produit. Favoris (cœurs) : mémorisés sur l'appareil. Paramètre d'adresse : ?id=… (ou ?slug=…). */
(function () {
  'use strict';
  var app = document.getElementById('bv-app');
  var toastEl = document.getElementById('bv-toast');
  var modalEl = document.getElementById('bv-modal');
  var PAGE = 20;
  var PRIX_MAX_PAR_DEFAUT = 50;
  var etat = { init: null, videos: [], moi: null, panier: 0, favoris: [], cats: [], types: [], prixMin: 0, prixMax: 0, plafond: PRIX_MAX_PAR_DEFAUT, q: '', tri: 'recent', vue: 'grille', nb: PAGE, fermes: {} };

  /* ── utilitaires ── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(methode, chemin, corps) {
    return fetch('/api' + chemin, { method: methode, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Erreur.'); e.status = r.status; throw e; } return j; }); });
  }
  function toast(msg, ko, lien) {
    toastEl.innerHTML = esc(msg) + (lien ? ' <a href="' + esc(lien.href) + '">' + esc(lien.texte) + '</a>' : '');
    toastEl.className = 'bv-toast vu' + (ko ? ' ko' : '');
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.className = 'bv-toast' + (ko ? ' ko' : ''); }, 4200);
  }
  function texte(s) { return String(s == null ? '' : s).trim(); }
  function nombre(n) { var x = Number(n); return isFinite(x) ? x : null; }
  function argent(n, devise) {
    var d = String(devise || 'EUR').toUpperCase();
    var sym = d === 'EUR' || d === '€' ? '€' : d === 'USD' ? '$' : d;
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + sym;
  }
  function liste(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v) { try { var j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch (e) { return []; } }
    return [];
  }
  function cleSure(s) { return texte(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function lienSurImage(u) { var s = texte(u); return s && /^(https?:)?\/\/|^\//i.test(s) && !/["'()\\\s]/.test(s) ? s : ''; }

  /* ── icônes filaires ── */
  var ICONES = {
    grille: '<rect x="3.5" y="3.5" width="5" height="5" rx=".8"/><rect x="9.5" y="3.5" width="5" height="5" rx=".8"/><rect x="15.5" y="3.5" width="5" height="5" rx=".8"/><rect x="3.5" y="9.5" width="5" height="5" rx=".8"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><rect x="15.5" y="9.5" width="5" height="5" rx=".8"/><rect x="3.5" y="15.5" width="5" height="5" rx=".8"/><rect x="9.5" y="15.5" width="5" height="5" rx=".8"/><rect x="15.5" y="15.5" width="5" height="5" rx=".8"/>',
    liste: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.8" cy="6" r="1"/><circle cx="3.8" cy="12" r="1"/><circle cx="3.8" cy="18" r="1"/>',
    fleur: '<circle cx="12" cy="12" r="2"/><path d="M12 10C10.5 7 10.6 4.4 12 3c1.4 1.4 1.5 4 0 7zM14 12c3-1.5 5.6-1.4 7 0-1.4 1.4-4 1.5-7 0zM12 14c1.5 3 1.4 5.6 0 7-1.4-1.4-1.5-4 0-7zM10 12c-3 1.5-5.6 1.4-7 0 1.4-1.4 4-1.5 7 0z"/><path d="M15.4 8.6c1.8-2.2 3.6-3.1 5-2.7-.4 1.5-1.4 3.2-3.5 4.6M8.6 8.6C6.8 6.4 5 5.5 3.6 5.9 4 7.4 5 9.1 7.1 10.5M15.4 15.4c1.8 2.2 3.6 3.1 5 2.7-.4-1.5-1.4-3.2-3.5-4.6M8.6 15.4C6.8 17.6 5 18.5 3.6 18.1 4 16.6 5 14.9 7.1 13.5"/>',
    tasse: '<path d="M4 8h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5z"/><path d="M17 9.5h1.5a2.5 2.5 0 010 5H16.6M8 4c-.8 1 .8 1.6 0 2.6M12 4c-.8 1 .8 1.6 0 2.6"/><path d="M5 21h11"/>',
    toque: '<path d="M7 17h10v3a1 1 0 01-1 1H8a1 1 0 01-1-1z"/><path d="M7 17c-2.2-.3-4-2.1-4-4.3 0-1.9 1.4-3.5 3.2-3.9C6.4 6.5 8.4 5 10.8 5c1 0 1.8.2 2.6.7C14.2 5.2 15 5 15.8 5c2.4 0 4.2 1.8 4.2 4 0 .4-.1.9-.3 1.3 1 .7 1.6 1.7 1.6 2.8 0 2.1-1.8 3.8-4 3.9"/>',
    clap: '<rect x="3.5" y="9.5" width="17" height="11" rx="1.5"/><path d="M3.5 9.5l2.2-5.2 14.3 2.4-1.4 2.8M7.3 4.9l2 4.6M12.2 5.7l2 3.8"/><path d="M3.5 14h17"/>',
    cube: '<path d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2z"/><path d="M4 7.2l8 4.3 8-4.3M12 11.5V21"/>',
    feuille: '<path d="M5 19C5 10 10 5 20 4c0 10-4.5 15-13 15"/><path d="M5 19c2.5-4.5 6-7.5 10-9.5"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    lecture: '<path d="M7 4.5v15l13-7.5z"/>',
    lectureCercle: '<circle cx="12" cy="12" r="10"/><path d="M10 8.2v7.6l6-3.8z"/>',
    telecharger: '<path d="M12 3v12M7 10.5l5 5 5-5M4 20h16"/>',
    bouclier: '<path d="M12 2.5l2.6 1.9 3.2-.2 1 3 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3-3.2-.2L12 21.5l-2.6-1.9-3.2.2-1-3-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3 3.2.2z"/><path d="M8.3 12.2l2.7 2.7 4.8-5.3"/>',
    filtre: '<path d="M3 4.5h18l-7 8.2V19l-4 2v-8.3z"/>',
    chevron: '<path d="M5 15l7-7 7 7"/>',
    chevronBas: '<path d="M5 9l7 7 7-7"/>',
    recherche: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
    coeur: '<path d="M12 20.5s-8-5-9.7-10.3C1.2 6.5 3.5 3.5 7 3.5c2 0 3.7 1 5 3 1.3-2 3-3 5-3 3.5 0 5.8 3 4.7 6.7C20 15.5 12 20.5 12 20.5z"/>',
    panier: '<path d="M2.5 3.5h2.8l2.6 12.2h10.6l2.3-9H6.2"/><circle cx="9.6" cy="20" r="1.5"/><circle cx="17.2" cy="20" r="1.5"/>',
    compte: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    etoile: '<path d="M12 2.8l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7 6.1 20.8l1.2-6.5L2.5 9.7l6.6-.9z"/>',
    fermer: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function ic(nom, classe) { return '<svg class="ic' + (classe ? ' ' + classe : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[nom] || ICONES.film) + '</svg>'; }
  function iconeCategorie(nom) {
    var n = cleSure(nom);
    if (/bissap|hibiscus|fleur|plante|jardin|nature/.test(n)) return 'fleur';
    if (/boisson|cafe|the |tisane|jus|cocktail|infusion/.test(n + ' ')) return 'tasse';
    if (/recette|astuce|cuisine|chef|gastronomie|plat/.test(n)) return 'toque';
    if (/coulisse|fabrication|making|tournage|atelier|backstage/.test(n)) return 'clap';
    if (/presentation|produit|packaging|pack|unboxing/.test(n)) return 'cube';
    if (/lifestyle|inspiration|bien-etre|bien etre|voyage|mode|beaute/.test(n)) return 'feuille';
    return 'film';
  }

  /* ── favoris sur l'appareil ── */
  function cleFav() { return 'da_bv_favoris_' + (etat.init ? etat.init.id : '0'); }
  function chargeFavoris() { try { etat.favoris = JSON.parse(localStorage.getItem(cleFav()) || '[]'); } catch (e) { etat.favoris = []; } }
  function basculeFavori(id) {
    id = Number(id); var i = etat.favoris.indexOf(id);
    if (i >= 0) etat.favoris.splice(i, 1); else etat.favoris.push(id);
    try { localStorage.setItem(cleFav(), JSON.stringify(etat.favoris)); } catch (e) { /* stockage indisponible : le cœur reste valable pour la page */ }
    document.querySelectorAll('[data-fav="' + id + '"]').forEach(function (b) { b.setAttribute('aria-pressed', etat.favoris.indexOf(id) >= 0 ? 'true' : 'false'); });
    var p = document.getElementById('bv-fav-n'); if (p) { p.textContent = etat.favoris.length; }
  }

  /* ── données ── */
  function charger() {
    var q = new URLSearchParams(location.search);
    var ref = q.get('id') || q.get('slug');
    if (!ref) return Promise.reject(new Error('Aucune boutique indiquée.'));
    return api('GET', '/initiatives/' + encodeURIComponent(ref)).then(function (d) {
      etat.init = d.initiative || d;
      var iid = etat.init.id;
      return Promise.all([
        api('GET', '/initiatives/' + iid + '/produits').then(function (r) { etat.videos = (r.produits || []).filter(function (p) { return (p.statut || 'disponible') !== 'masque'; }).map(normalise); }).catch(function () {}),
        api('GET', '/auth/me').then(function (r) { etat.moi = r.user || null; }).catch(function () {})
      ]);
    }).then(function () {
      if (etat.moi) return api('GET', '/panier').then(function (r) { etat.panier = Number(r.nb_articles) || 0; }).catch(function () {});
    });
  }
  function typeDeDuree(s) { return s == null ? '' : s <= 60 ? 'courte' : 'explicative'; }
  function normalise(p) {
    var promo = nombre(p.prix_promo), prix = nombre(p.prix);
    var enPromo = prix != null && prix > 0 && promo != null && promo > 0 && promo < prix;
    var duree = nombre(p.video_duree);
    duree = duree && duree > 0 ? Math.round(duree) : null;
    var t = texte(p.video_type).toLowerCase();
    return {
      id: Number(p.id), nom: texte(p.nom), description: texte(p.description), categorie: texte(p.categorie), devise: p.devise,
      prix: prix != null && prix > 0 ? prix : null, promo: enPromo ? promo : null,
      vu: enPromo ? promo : (prix != null && prix > 0 ? prix : null),
      photo: lienSurImage((liste(p.photos)[0]) || ''), url: texte(p.video_url), duree: duree,
      type: ['courte', 'explicative', 'serie'].indexOf(t) >= 0 ? t : typeDeDuree(duree),
      note: nombre(p.note_moyenne), nbAvis: nombre(p.nb_avis) || 0, ordre: Number(p.id) || 0, statut: p.statut || 'disponible'
    };
  }
  function estProprio() { return !!(etat.moi && etat.init && Number(etat.moi.id) === Number(etat.init.owner_user_id)); }
  function nom() { return etat.init.boutique_nom || etat.init.nom; }
  function hms(s) { if (s == null) return ''; var m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }

  /* ── catégories & filtres ── */
  function categories() {
    var vues = {}, ordre = [];
    etat.videos.forEach(function (v) {
      if (!v.categorie) return;
      var k = cleSure(v.categorie);
      if (!vues[k]) { vues[k] = { cle: k, nom: v.categorie, n: 0 }; ordre.push(k); }
      vues[k].n++;
    });
    return ordre.map(function (k) { return vues[k]; });
  }
  function plafondPrix() {
    var m = 0; etat.videos.forEach(function (v) { if (v.vu != null && v.vu > m) m = v.vu; });
    return m > PRIX_MAX_PAR_DEFAUT ? Math.ceil(m / 10) * 10 : PRIX_MAX_PAR_DEFAUT;
  }
  function filtrees() {
    var q = cleSure(etat.q);
    var l = etat.videos.filter(function (v) {
      if (etat.cats.length && etat.cats.indexOf(cleSure(v.categorie)) < 0) return false;
      if (etat.types.length && etat.types.indexOf(v.type) < 0) return false;
      var p = v.vu == null ? 0 : v.vu;
      if (p < etat.prixMin) return false;
      if (etat.prixMax < etat.plafond && p > etat.prixMax) return false;
      if (q && cleSure(v.nom + ' ' + v.description + ' ' + v.categorie).indexOf(q) < 0) return false;
      return true;
    });
    var tri = etat.tri;
    l.sort(function (a, b) {
      if (tri === 'prix_asc') return (a.vu == null ? 1e9 : a.vu) - (b.vu == null ? 1e9 : b.vu);
      if (tri === 'prix_desc') return (b.vu == null ? -1 : b.vu) - (a.vu == null ? -1 : a.vu);
      if (tri === 'duree') return (a.duree == null ? 1e9 : a.duree) - (b.duree == null ? 1e9 : b.duree);
      if (tri === 'nom') return a.nom.localeCompare(b.nom, 'fr');
      return b.ordre - a.ordre;
    });
    return l;
  }
  function filtresActifs() { return etat.cats.length || etat.types.length || etat.prixMin > 0 || etat.prixMax < etat.plafond || etat.q; }

  /* ── morceaux de page ── */
  function entete() {
    var nav = [['Accueil', 'index.html'], ['Boutiques', 'vitrines.html', true], ['Formations', 'formations.html'], ['Services', 'annuaire.html'], ['Projets diasporas', 'actualites.html'], ['À propos', 'initiative.html?id=' + etat.init.id]];
    var compte = etat.moi ? ('dashboard-' + (etat.moi.role === 'administrateur' ? 'administrateur' : etat.moi.role) + '.html') : 'login.html';
    return '<header class="bv-top"><div class="bv-top-in"><a class="bv-marque" href="index.html"><img src="/assets/logo.png" alt=""><span><b>DIASPO\'ACTIF</b><small>Actions locales, impact global</small></span></a>' +
      '<nav class="bv-nav" aria-label="Navigation principale">' + nav.map(function (n) { return '<a href="' + n[1] + '"' + (n[2] ? ' class="actif"' : '') + '>' + n[0] + (n[2] ? ic('chevronBas') : '') + '</a>'; }).join('') + '</nav>' +
      '<form class="bv-recherche" role="search" id="bv-form-q"><input type="search" id="bv-q" placeholder="Rechercher une vidéo, un thème, un pack…" value="' + esc(etat.q) + '" aria-label="Rechercher une vidéo"><button type="submit" aria-label="Rechercher">' + ic('recherche') + '</button></form>' +
      '<div class="bv-icones"><a class="bv-icone" href="#bv-liste" id="bv-voir-fav" aria-label="Mes favoris">' + ic('coeur') + '<span class="bv-pastille" id="bv-fav-n">' + etat.favoris.length + '</span></a>' +
      '<a class="bv-icone" href="panier.html" aria-label="Mon panier">' + ic('panier') + '<span class="bv-pastille" id="bv-pan-n"' + (etat.panier ? '' : ' hidden') + '>' + etat.panier + '</span></a>' +
      '<a class="bv-compte" href="' + compte + '">' + ic('compte') + '<span>' + (etat.moi ? 'Mon compte' : 'Connexion') + '</span>' + ic('chevronBas', 'fl') + '</a></div></div></header>';
  }
  function hero() {
    var i = etat.init, sous = texte(i.slogan) || texte(i.boutique_description) || 'Vidéos courtes prêtes à l’emploi pour vos projets, communications, réseaux sociaux et événements.';
    return '<section class="bv-hero"><div class="bv-hero-in"><h1>Boutique Vidéo <em>' + esc(nom()) + '</em></h1><p>' + esc(sous.length > 150 ? sous.slice(0, 147) + '…' : sous) + '</p>' +
      '<div class="bv-atouts"><span class="bv-atout">' + ic('lectureCercle') + 'Vidéos professionnelles</span><span class="bv-atout">' + ic('telecharger') + 'Téléchargement immédiat</span><span class="bv-atout">' + ic('bouclier') + 'Droits d’utilisation inclus</span></div></div></section>';
  }
  function barreCategories() {
    var cats = categories();
    return '<div class="bv-cats"><div class="bv-cats-in" role="tablist" aria-label="Catégories">' +
      '<button type="button" class="bv-cat' + (etat.cats.length === 0 ? ' actif' : '') + '" data-cat="">' + ic('grille') + 'Toutes les vidéos</button>' +
      cats.map(function (c) { return '<button type="button" class="bv-cat' + (etat.cats.length === 1 && etat.cats[0] === c.cle ? ' actif' : '') + '" data-cat="' + esc(c.cle) + '">' + ic(iconeCategorie(c.nom)) + esc(c.nom) + '</button>'; }).join('') + '</div></div>';
  }
  function blocFiltres() {
    var cats = categories(), nTot = etat.videos.length;
    var types = [['courte', 'Vidéo courte (≤ 60s)'], ['explicative', 'Vidéo explicative (1–3 min)'], ['serie', 'Série / Épisode']];
    function bloc(cle, titre, corps) {
      return '<div class="bv-bloc' + (etat.fermes[cle] ? ' ferme' : '') + '"><button type="button" class="bv-bloc-t" data-bloc="' + cle + '" aria-expanded="' + (etat.fermes[cle] ? 'false' : 'true') + '">' + titre + ic('chevron') + '</button><div class="bv-bloc-c">' + corps + '</div></div>';
    }
    function caseA(nomCase, valeur, coche, libelle) { return '<label class="bv-case' + (coche ? ' coche' : '') + '"><input type="checkbox" data-' + nomCase + '="' + esc(valeur) + '"' + (coche ? ' checked' : '') + '><i></i><span>' + libelle + '</span></label>'; }
    var hCat = caseA('cat', '', etat.cats.length === 0, 'Toutes les vidéos (' + nTot + ')') + cats.map(function (c) { return caseA('cat', c.cle, etat.cats.indexOf(c.cle) >= 0, esc(c.nom) + ' (' + c.n + ')'); }).join('');
    var hTypes = types.map(function (t) { return caseA('type', t[0], etat.types.indexOf(t[0]) >= 0, t[1]); }).join('');
    var pc = etat.plafond, g = (etat.prixMin / pc) * 100, d = (etat.prixMax / pc) * 100;
    var hPrix = '<div class="bv-prix-pistes"><span class="bv-prix-plage" id="bv-plage" style="left:' + g + '%;right:' + (100 - d) + '%"></span>' +
      '<input type="range" id="bv-pmin" min="0" max="' + pc + '" step="1" value="' + etat.prixMin + '" aria-label="Prix minimum"><input type="range" id="bv-pmax" min="0" max="' + pc + '" step="1" value="' + etat.prixMax + '" aria-label="Prix maximum"></div>' +
      '<div class="bv-prix-val"><span id="bv-pmin-t">' + etat.prixMin + ' €</span><span id="bv-pmax-t">' + etat.prixMax + ' €' + (etat.prixMax >= pc ? ' +' : '') + '</span></div>';
    return '<aside class="bv-filtres" aria-label="Filtres"><div class="bv-fil-tete"><b>' + ic('filtre') + 'Filtres</b><button type="button" id="bv-reinit">Réinitialiser</button></div>' +
      bloc('cat', 'Catégories', hCat) + bloc('type', 'Type de vidéo', hTypes) + bloc('prix', 'Prix', hPrix) + '</aside>';
  }
  function carte(v) {
    var fav = etat.favoris.indexOf(v.id) >= 0, proprio = estProprio();
    var mini = '<button type="button" class="bv-mini' + (v.photo ? '' : ' vide') + '" data-lire="' + v.id + '"' + (v.photo ? ' style="background-image:url(\'' + esc(v.photo) + '\')"' : '') + ' aria-label="Voir la vidéo « ' + esc(v.nom) + ' »"><span class="bv-lecture">' + ic('lecture') + '</span>' + (v.duree ? '<span class="bv-duree">' + hms(v.duree) + '</span>' : '') + '</button>';
    var etoiles = '';
    if (v.note != null && v.nbAvis > 0) {
      var n = Math.round(v.note); etoiles = '<div class="bv-etoiles" aria-label="Note ' + n + ' sur 5">';
      for (var i = 1; i <= 5; i++) etoiles += ic('etoile', i <= n ? '' : 'vide');
      etoiles += '<span>(' + v.nbAvis + ')</span></div>';
    } else etoiles = '<div class="bv-etoiles"></div>';
    var prix = v.vu == null ? '<span class="bv-prix">Sur devis</span>' : '<span class="bv-prix">' + (v.promo ? '<s>' + argent(v.prix, v.devise) + '</s>' : '') + argent(v.vu, v.devise) + '</span>';
    var bouton = proprio ? '<button type="button" class="bv-ajout proprio" disabled>Ma vidéo</button>'
      : (v.vu == null ? '<button type="button" class="bv-ajout" data-lire="' + v.id + '">Voir le détail</button>' : '<button type="button" class="bv-ajout" data-ajout="' + v.id + '">' + ic('panier') + 'Ajouter au panier</button>');
    return '<article class="bv-carte" data-id="' + v.id + '">' + mini + '<div class="bv-info"><h3 class="bv-titre">' + esc(v.nom) + '</h3>' + etoiles +
      (v.description ? '<p class="bv-desc">' + esc(v.description.length > 220 ? v.description.slice(0, 217) + '…' : v.description) + '</p>' : '') +
      '<div class="bv-ligne-prix">' + prix + '<button type="button" class="bv-coeur" data-fav="' + v.id + '" aria-pressed="' + fav + '" aria-label="Ajouter aux favoris">' + ic('coeur') + '</button></div></div>' + bouton + '</article>';
  }
  function zoneListe() {
    var l = filtrees(), vus = l.slice(0, etat.nb);
    var h = '<div class="bv-barre"><div class="bv-compte-v" id="bv-nb">' + l.length + ' vidéo' + (l.length > 1 ? 's' : '') + ' disponible' + (l.length > 1 ? 's' : '') + '</div>' +
      '<label class="bv-tri">Trier par :<select id="bv-tri" aria-label="Trier par">' + [['recent', 'Plus récentes'], ['prix_asc', 'Prix croissant'], ['prix_desc', 'Prix décroissant'], ['duree', 'Durée'], ['nom', 'Nom (A→Z)']].map(function (o) { return '<option value="' + o[0] + '"' + (etat.tri === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<div class="bv-vue" role="group" aria-label="Affichage"><button type="button" data-vue="grille" aria-pressed="' + (etat.vue === 'grille') + '" aria-label="Affichage en grille">' + ic('grille') + '</button><button type="button" data-vue="liste" aria-pressed="' + (etat.vue === 'liste') + '" aria-label="Affichage en liste">' + ic('liste') + '</button></div></div>';
    if (estProprio()) h += '<div class="bv-proprio"><span>Vous voyez votre boutique comme vos visiteurs. Ajoutez ou modifiez vos vidéos depuis votre boutique.</span><a href="profil.html?vitrine=1">Gérer mes vidéos</a></div>';
    if (!l.length) {
      h += '<div class="bv-grille"><div class="bv-vide-liste"><b>' + (etat.videos.length ? 'Aucune vidéo ne correspond à ces filtres.' : 'Les vidéos arrivent bientôt.') + '</b>' + (filtresActifs() ? 'Essayez de modifier ou de réinitialiser les filtres.' : 'Cette boutique n’a pas encore publié de vidéo.') + '</div></div>';
    } else {
      h += '<div class="bv-grille' + (etat.vue === 'liste' ? ' liste' : '') + '" id="bv-liste">' + vus.map(carte).join('') + '</div>';
      if (l.length > vus.length) h += '<div class="bv-plus"><button type="button" id="bv-plus">Voir plus de vidéos (' + (l.length - vus.length) + ')</button></div>';
    }
    return h;
  }
  function pied() {
    return '<footer class="bv-pied"><div class="bv-pied-in"><span>© Diaspo\'Actif — Du Sud au Nord</span><nav><a href="vitrines.html">Boutiques</a><a href="confidentialite.html">Confidentialité</a><a href="cgu.html">Conditions d’utilisation</a></nav></div></footer>';
  }
  function dessiner() {
    app.innerHTML = entete() + hero() + barreCategories() + '<main class="bv-corps">' + blocFiltres() + '<section id="bv-zone">' + zoneListe() + '</section></main>' + pied();
    document.title = 'Boutique Vidéo ' + nom() + ' — Diaspo\'Actif';
    lier();
  }
  /* Rafraîchit seulement la zone de droite (et les cases à gauche) : garde le focus de la recherche et du curseur de prix. */
  function rafraichir(avecFiltres) {
    document.getElementById('bv-zone').innerHTML = zoneListe();
    var bc = document.querySelector('.bv-cats'); if (bc) bc.outerHTML = barreCategories();
    if (avecFiltres) { var f = document.querySelector('.bv-filtres'); if (f) f.outerHTML = blocFiltres(); }
    lier();
  }

  /* ── lecteur ── */
  function embarque(url) {
    var u = texte(url), m;
    if ((m = u.match(/(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{6,})/))) return { type: 'iframe', src: 'https://www.youtube-nocookie.com/embed/' + m[1] + '?autoplay=1&rel=0' };
    if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return { type: 'iframe', src: 'https://player.vimeo.com/video/' + m[1] + '?autoplay=1' };
    if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(u) || /^\//.test(u)) return { type: 'video', src: u };
    return null;
  }
  function ouvrirLecteur(id) {
    var v = etat.videos.filter(function (x) { return x.id === Number(id); })[0]; if (!v) return;
    var e = v.url ? embarque(v.url) : null, lecteur;
    if (e && e.type === 'iframe') lecteur = '<iframe src="' + esc(e.src) + '" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen title="' + esc(v.nom) + '"></iframe>';
    else if (e) lecteur = '<video controls autoplay playsinline' + (v.photo ? ' poster="' + esc(v.photo) + '"' : '') + ' src="' + esc(e.src) + '"></video>';
    else if (v.url && /^https?:\/\//i.test(v.url)) lecteur = '<div class="bv-sans"><a class="bv-ajout" style="width:auto;padding:0 22px;height:40px;margin:0" href="' + esc(v.url) + '" target="_blank" rel="noopener noreferrer">Voir l’aperçu</a></div>';
    else lecteur = '<div class="bv-sans">L’aperçu de cette vidéo n’est pas encore disponible.</div>';
    var type = { courte: 'Vidéo courte', explicative: 'Vidéo explicative', serie: 'Série / Épisode' }[v.type] || '';
    modalEl.hidden = false; modalEl.innerHTML = '<div class="bv-fenetre" role="dialog" aria-modal="true" aria-label="' + esc(v.nom) + '"><button type="button" class="bv-fermer" data-fermer aria-label="Fermer">' + ic('fermer') + '</button><div class="bv-lecteur">' + lecteur + '</div>' +
      '<div class="bv-fiche"><h2>' + esc(v.nom) + '</h2><div class="meta">' + (v.duree ? '<span>' + hms(v.duree) + '</span>' : '') + (type ? '<span>' + type + '</span>' : '') + (v.categorie ? '<span>' + esc(v.categorie) + '</span>' : '') + '</div>' +
      (v.description ? '<p>' + esc(v.description) + '</p>' : '') +
      '<div class="bv-fiche-bas">' + (v.vu == null ? '<span class="bv-prix">Sur devis</span>' : '<span class="bv-prix">' + (v.promo ? '<s>' + argent(v.prix, v.devise) + '</s>' : '') + argent(v.vu, v.devise) + '</span>') +
      (estProprio() ? '' : (v.vu == null ? '<a class="bv-ajout" href="messagerie.html?with=' + esc(etat.init.owner_user_id) + '&origine=vitrine&objet=' + encodeURIComponent('Vidéo : ' + v.nom) + '">Demander un devis</a>' : '<button type="button" class="bv-ajout" data-ajout="' + v.id + '">' + ic('panier') + 'Ajouter au panier</button>')) + '</div></div></div>';
    var f = modalEl.querySelector('[data-fermer]'); if (f) f.focus();
  }
  function fermerLecteur() { modalEl.hidden = true; modalEl.innerHTML = ''; }

  /* ── panier ── */
  function ajouter(id) {
    if (!etat.moi) { location.href = 'login.html?next=' + encodeURIComponent(location.pathname.replace(/^\//, '') + location.search); return; }
    api('POST', '/panier', { produit_id: Number(id), quantite: 1, mode_livraison: 'retrait' }).then(function (r) {
      etat.panier = Number(r.nb_articles) || etat.panier + 1;
      var p = document.getElementById('bv-pan-n'); if (p) { p.textContent = etat.panier; p.hidden = false; }
      toast('Vidéo ajoutée au panier.', false, { href: 'panier.html', texte: 'Voir le panier' });
    }).catch(function (e) {
      if (e.status === 401) { location.href = 'login.html?next=' + encodeURIComponent(location.pathname.replace(/^\//, '') + location.search); return; }
      toast(e.message || 'Impossible d’ajouter au panier.', true);
    });
  }

  /* ── événements ── */
  function basculer(tableau, valeur) { var i = tableau.indexOf(valeur); if (i >= 0) tableau.splice(i, 1); else tableau.push(valeur); }
  function majPrixTextes() {
    var a = document.getElementById('bv-pmin-t'), b = document.getElementById('bv-pmax-t'), pl = document.getElementById('bv-plage');
    if (a) a.textContent = etat.prixMin + ' €';
    if (b) b.textContent = etat.prixMax + ' €' + (etat.prixMax >= etat.plafond ? ' +' : '');
    if (pl) { pl.style.left = (etat.prixMin / etat.plafond * 100) + '%'; pl.style.right = (100 - etat.prixMax / etat.plafond * 100) + '%'; }
  }
  function lier() {
    var fq = document.getElementById('bv-form-q');
    if (fq && !fq.dataset.lie) {
      fq.dataset.lie = '1';
      fq.addEventListener('submit', function (e) { e.preventDefault(); etat.q = texte(document.getElementById('bv-q').value); etat.nb = PAGE; rafraichir(false); document.getElementById('bv-zone').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      document.getElementById('bv-q').addEventListener('input', function () { etat.q = texte(this.value); etat.nb = PAGE; document.getElementById('bv-zone').innerHTML = zoneListe(); lier(); });
    }
    var pmin = document.getElementById('bv-pmin'), pmax = document.getElementById('bv-pmax');
    if (pmin && pmax) {
      pmin.oninput = function () { var v = Number(pmin.value); if (v > etat.prixMax - 1) { v = etat.prixMax - 1; pmin.value = v; } etat.prixMin = v; majPrixTextes(); etat.nb = PAGE; document.getElementById('bv-zone').innerHTML = zoneListe(); lier(); };
      pmax.oninput = function () { var v = Number(pmax.value); if (v < etat.prixMin + 1) { v = etat.prixMin + 1; pmax.value = v; } etat.prixMax = v; majPrixTextes(); etat.nb = PAGE; document.getElementById('bv-zone').innerHTML = zoneListe(); lier(); };
    }
  }
  app.addEventListener('click', function (e) {
    var t = e.target.closest('button, a, input'); if (!t) return;
    if (t.matches('[data-cat]') && t.classList.contains('bv-cat')) { var c = t.getAttribute('data-cat'); etat.cats = c ? [c] : []; etat.nb = PAGE; rafraichir(true); return; }
    if (t.matches('[data-ajout]')) { ajouter(t.getAttribute('data-ajout')); return; }
    if (t.matches('[data-lire]')) { ouvrirLecteur(t.getAttribute('data-lire')); return; }
    if (t.matches('[data-fav]')) { basculeFavori(t.getAttribute('data-fav')); return; }
    if (t.matches('[data-vue]')) { etat.vue = t.getAttribute('data-vue'); rafraichir(false); return; }
    if (t.matches('[data-bloc]')) { var b = t.getAttribute('data-bloc'); etat.fermes[b] = !etat.fermes[b]; var bl = t.closest('.bv-bloc'); bl.classList.toggle('ferme', !!etat.fermes[b]); t.setAttribute('aria-expanded', etat.fermes[b] ? 'false' : 'true'); return; }
    if (t.id === 'bv-reinit') { etat.cats = []; etat.types = []; etat.prixMin = 0; etat.prixMax = etat.plafond; etat.q = ''; etat.nb = PAGE; var qi = document.getElementById('bv-q'); if (qi) qi.value = ''; rafraichir(true); return; }
    if (t.id === 'bv-plus') { etat.nb += PAGE; document.getElementById('bv-zone').innerHTML = zoneListe(); lier(); return; }
    if (t.id === 'bv-voir-fav') { e.preventDefault(); toast(etat.favoris.length ? 'Vos favoris sont marqués d’un cœur plein sur cette page.' : 'Touchez le cœur d’une vidéo pour la retrouver ici.'); return; }
  });
  app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('input[data-cat]')) { var c = t.getAttribute('data-cat'); if (!c) etat.cats = []; else basculer(etat.cats, c); etat.nb = PAGE; rafraichir(true); return; }
    if (t.matches('input[data-type]')) { basculer(etat.types, t.getAttribute('data-type')); etat.nb = PAGE; rafraichir(true); return; }
    if (t.id === 'bv-tri') { etat.tri = t.value; etat.nb = PAGE; rafraichir(false); return; }
  });
  modalEl.addEventListener('click', function (e) {
    if (e.target === modalEl || e.target.closest('[data-fermer]')) { fermerLecteur(); return; }
    var a = e.target.closest('[data-ajout]'); if (a) ajouter(a.getAttribute('data-ajout'));
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modalEl.hidden) fermerLecteur(); });

  (window.DA_verifierMaintenanceBoutique ? window.DA_verifierMaintenanceBoutique(app) : Promise.resolve(false)).then(function (bloque) {
    if (bloque) return;
    charger().then(function () {
      chargeFavoris();
      etat.plafond = plafondPrix(); etat.prixMax = etat.plafond;
      /* petit écran : les filtres sont repliés pour que les vidéos apparaissent tout de suite */
      if (window.innerWidth <= 1060) etat.fermes = { cat: true, type: true, prix: true };
      dessiner();
    }).catch(function (e) {
      app.innerHTML = '<p class="bv-chargement">' + esc(e && e.message ? e.message : 'Boutique introuvable.') + ' <a href="vitrines.html" style="text-decoration:underline">Voir toutes les boutiques</a></p>';
    });
  });
})();
