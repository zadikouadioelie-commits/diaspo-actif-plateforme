/* Boutique « Portfolio » — portfolio.html, 2026-11-01.
   Lit : /initiatives/:id, /produits, /avis, /evenements, /formations, /panier. Écrit : POST /panier. Contacts : messagerie.html?with=…
   Filtres de la grille : construits à partir du champ « Catégorie » saisi dans l'éditeur du portfolio (aucun filtre s'il n'y en a pas).
   Durée d'une vidéo / réalisation : affichée seulement si elle a été saisie. Favoris (cœurs) : mémorisés sur l'appareil. Paramètre d'adresse : ?id=… (ou ?slug=…). */
(function () {
  'use strict';
  var app = document.getElementById('pf-app');
  var toastEl = document.getElementById('pf-toast');
  var modalEl = document.getElementById('pf-modal');
  var PAGE = 6;
  var etat = { init: null, produits: [], avis: null, agenda: [], moi: null, panier: 0, onglet: 'portfolio', filtre: '', nb: PAGE, filtreGalerie: '', slide: 0, minuteur: null, favoris: [], apropos: false };

  /* ── utilitaires ── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(methode, chemin, corps) {
    return fetch('/api' + chemin, { method: methode, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Erreur.'); e.status = r.status; throw e; } return j; }); });
  }
  function toast(msg, ko, lien) {
    toastEl.innerHTML = esc(msg) + (lien ? ' <a href="' + esc(lien.href) + '">' + esc(lien.texte) + '</a>' : '');
    toastEl.className = 'pf-toast vu' + (ko ? ' ko' : '');
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.className = 'pf-toast' + (ko ? ' ko' : ''); }, 4200);
  }
  function argent(n, devise) {
    var d = String(devise || 'EUR').toUpperCase();
    var sym = d === 'EUR' || d === '€' ? '€' : d === 'USD' ? '$' : d;
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + sym;
  }
  function dates(iso) { var d = new Date(String(iso || '').slice(0, 10) + 'T12:00:00'); return isNaN(d) ? null : d; }
  function liste(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v) { try { var j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch (e) { return []; } }
    return [];
  }
  function objet(v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    if (typeof v === 'string' && v) { try { var j = JSON.parse(v); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch (e) { return {}; } }
    return {};
  }
  function texte(s) { return String(s == null ? '' : s).trim(); }
  function lienSur(u) { var s = texte(u); if (!s) return ''; if (/^https?:\/\//i.test(s)) return s; if (/^[\w.-]+\.[a-z]{2,}/i.test(s)) return 'https://' + s; return ''; }

  /* ── icônes filaires ── */
  var ICONES = {
    portfolio: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 16l-5-5-9 9"/>',
    creations: '<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.2l5.9-.8z"/>',
    services: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/>',
    boutique: '<path d="M3 4h2.5l2.2 11h10.3l2-8H6.3"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
    collab: '<path d="M12 12s-4-2.6-4-5.4C8 5 9.2 4 10.6 4c.9 0 1.5.5 1.4 1 .1-.5.5-1 1.4-1C14.8 4 16 5 16 6.6 16 9.4 12 12 12 12z"/><path d="M2 16l4-1.5 4 1.5h3.5a1.5 1.5 0 010 3H9M22 15l-5.5 3.5H9"/>',
    avis: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    contact: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    etoile: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
    coeur: '<path d="M12 20s-7-4.6-9-9.2C1.6 7.4 3.7 4 7 4c2 0 3.4 1 5 3 1.6-2 3-3 5-3 3.3 0 5.4 3.4 4 6.8-2 4.6-9 9.2-9 9.2z"/>',
    panier: '<path d="M3 4h2.5l2.2 11h10.3l2-8H6.3"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
    compte: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    lieu: '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lien: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    tel: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
    gauche: '<path d="M15 5l-7 7 7 7"/>',
    droite: '<path d="M9 5l7 7-7 7"/>',
    fleche: '<path d="M4 12h16M14 6l6 6-6 6"/>',
    fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
    etiquette: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    lecture: '<path d="M8 5l12 7-12 7z"/>',
    pinceau: '<path d="M14 4l6 6-9 9H5v-6z"/><path d="M12 6l6 6"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.6"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    mallette: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/>'
  };
  function ic(nom, classe) { return '<svg class="ic' + (classe ? ' ' + classe : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[nom] || ICONES.etiquette) + '</svg>'; }
  var COCHE_BLEUE = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 1.8 3-.2 1 2.8 2.5 1.7-.8 2.9.8 2.9-2.5 1.7-1 2.8-3-.2L12 22l-2.4-1.8-3 .2-1-2.8-2.5-1.7.8-2.9-.8-2.9 2.5-1.7 1-2.8 3 .2z"/><path d="M8 12l3 3 5-6"/></svg>';
  function iconeService(nom) {
    var n = String(nom || '').toLowerCase();
    if (/photo|portrait|shooting/.test(n)) return 'camera';
    if (/vid[ée]o|film|montage|documentaire|clip/.test(n)) return 'film';
    if (/design|graphi|logo|affiche|identit|illustr/.test(n)) return 'pinceau';
    return 'mallette';
  }

  /* ── favoris sur l'appareil ── */
  function cleFav() { return 'da_pf_favoris_' + (etat.init ? etat.init.id : '0'); }
  function chargeFavoris() { try { etat.favoris = JSON.parse(localStorage.getItem(cleFav()) || '[]'); } catch (e) { etat.favoris = []; } }
  function basculeFavori(id) {
    id = Number(id); var i = etat.favoris.indexOf(id);
    if (i >= 0) etat.favoris.splice(i, 1); else etat.favoris.push(id);
    try { localStorage.setItem(cleFav(), JSON.stringify(etat.favoris)); } catch (e) { /* stockage indisponible : le cœur reste valable pour la page */ }
    document.querySelectorAll('[data-fav="' + id + '"]').forEach(function (b) { b.setAttribute('aria-pressed', etat.favoris.indexOf(id) >= 0 ? 'true' : 'false'); });
  }

  /* ── données ── */
  function charger() {
    var q = new URLSearchParams(location.search);
    var ref = q.get('id') || q.get('slug');
    var pre = ref ? Promise.resolve(ref) : Promise.reject(new Error('Aucune boutique indiquée.'));
    return pre.then(function (id) {
      return api('GET', '/initiatives/' + encodeURIComponent(id) + (/[?&]preview=draft(&|$)/.test(location.search) ? '?preview=draft' : '')).then(function (d) {
        etat.init = d.initiative || d;
        if (window.BoutiqueReglagesPublic) window.BoutiqueReglagesPublic.definir(etat.init.vitrine_reglages);
        appliquerCouleurs(styleBoutique(etat.init.vitrine_style_json));
        var iid = etat.init.id;
        return Promise.all([
          api('GET', '/initiatives/' + iid + '/produits').then(function (r) { etat.produits = r.produits || []; }).catch(function () {}),
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
          .map(function (e) { return { type: 'ÉVÉNEMENT', titre: e.titre, date: e.date_evt, lieu: e.lieu || e.ville || '', href: 'evenements.html' }; });
      }).catch(function () { return []; }),
      api('GET', '/formations').then(function (r) {
        return (r.formations || []).filter(function (f) { return Number(f.owner_user_id) === Number(owner) && (!f.date_debut || String(f.date_debut) >= auj); })
          .map(function (f) { return { type: 'FORMATION', titre: f.titre, date: f.date_debut || null, lieu: f.mode_acces || f.type_formation || '', href: 'formation-fiche.html?id=' + f.id }; });
      }).catch(function () { return []; })
    ]).then(function (t) {
      etat.agenda = t[0].concat(t[1]).sort(function (a, b) { return String(a.date || '9').localeCompare(String(b.date || '9')); }).slice(0, 6);
    });
  }

  /* Les rubriques de base du type (portfolio, galeries, réalisations, témoignages, services) s'affichent dès qu'elles ont du contenu ; seules les OPTIONS (boutique, devis…) dépendent de leur état. */
  /* rubrique active ? (l'état des rubriques vient du serveur ; absent = on montre ce qui a du contenu) */
  function moduleActif(cle) {
    var m = etat.init.vitrine_modules_state;
    if (!m || typeof m !== 'object') return true;
    return !m[cle] || !!m[cle].actif;
  }
  /* Rubrique éteinte par le propriétaire à l'étape « Rubriques » (lot 4B) : cachée aux visiteurs, ses données restent. Rien d'éteint = comportement d'avant. */
  function rub(cle) { return !window.BoutiqueRubriques || window.BoutiqueRubriques.active(etat.init.vitrine_modules_state, cle); }
  function creations() {
    if (!rub('portfolio')) return [];
    return liste(etat.init.vitrine_portfolio_json).map(function (x) {
      return { image: texte(x.image || x.url), titre: texte(x.titre), description: texte(x.description), categorie: texte(x.categorie), lien: lienSur(x.lien) };
    }).filter(function (x) { return x.image; });
  }
  function galerie() {
    if (!rub('galerie_photos')) return [];
    return liste(etat.init.galerie_json).map(function (x) {
      if (typeof x === 'string') return { image: texte(x), categorie: '', titre: '' };
      return { image: texte(x.url || x.image), categorie: texte(x.categorie), titre: texte(x.titre || x.legende) };
    }).filter(function (x) { return x.image; });
  }
  function videos() { if (!rub('galerie_videos')) return []; return liste(etat.init.vitrine_videos_json).filter(function (v) { return texte(v && v.url); }); }
  function realisations() {
    if (!rub('realisations')) return [];
    return liste(etat.init.realisations_json).filter(function (r) { return r && (texte(r.titre) || texte(r.image)); });
  }
  function temoignages() { if (!rub('temoignages')) return []; return liste(etat.init.vitrine_temoignages_json).filter(function (t) { return t && texte(t.texte); }); }
  function services() {
    if (!rub('services')) return [];
    var i = etat.init, cats = liste(i.vitrine_services_categories_json), exp = liste(i.vitrine_expertise_json), sortie = [];
    function ajoute(x) {
      if (typeof x === 'string') { if (texte(x)) sortie.push({ titre: texte(x), description: '' }); }
      else if (x && texte(x.titre || x.nom)) sortie.push({ titre: texte(x.titre || x.nom), description: texte(x.description) });
    }
    cats.forEach(ajoute);
    if (!sortie.length) exp.forEach(ajoute);
    if (!sortie.length) texte(i.vitrine_services).split(/\r?\n/).forEach(ajoute);
    return sortie.slice(0, 12);
  }
  function categoriesDe(liste_) {
    var vues = [];
    liste_.forEach(function (x) { var c = texte(x.categorie); if (c && vues.indexOf(c) < 0) vues.push(c); });
    return vues;
  }
  function competences() {
    var i = etat.init, l = [];
    [i.domaine].concat(liste(i.domaines_secondaires_json)).forEach(function (d) { var t = texte(typeof d === 'string' ? d : (d && (d.nom || d.titre))); if (t && l.indexOf(t) < 0) l.push(t); });
    return l.slice(0, 10);
  }
  function nom() { return etat.init.boutique_nom || etat.init.nom; }
  function proprio() { return etat.init.owner_user_id; }
  function estProprio() { return !!(etat.moi && etat.init && Number(etat.moi.id) === Number(etat.init.owner_user_id)); }
  function devisOuvert() { return Number(etat.init.vitrine_devis_active) === 1 && moduleActif('demande_devis'); }
  function lienMessage(objetMsg) { return 'messagerie.html?with=' + proprio() + '&origine=vitrine&objet=' + encodeURIComponent(objetMsg); }
  function photoProduit(p) { return (p.photos || []).filter(Boolean)[0] || ''; }
  function prixProduit(p) { return p.prix == null || Number(p.prix) <= 0 ? null : Number(p.prix); }
  function produitsAffiches() { return moduleActif('produits') ? etat.produits.filter(function (p) { return (p.statut || 'disponible') !== 'masque'; }) : []; }

  /* ── morceaux de page ── */
  function etoiles(note) {
    var n = Math.round(Number(note) || 0), h = '';
    for (var i = 1; i <= 5; i++) h += ic('etoile', i <= n ? '' : 'vide');
    return h;
  }
  function logoHtml(init) {
    var src = init.logo_url || '';
    return src ? '<img src="' + esc(src) + '" alt="Logo ' + esc(init.nom) + '">' : '<span>' + esc((init.boutique_nom || init.nom || '?').charAt(0).toUpperCase()) + '</span>';
  }
  function entete() {
    var nav = [['Accueil', 'index.html'], ['Boutiques', 'vitrines.html'], ['Annuaire', 'annuaire.html'], ['Événements', 'evenements.html'], ['À propos', 'initiative.html?id=' + etat.init.id]];
    var compte = etat.moi ? ('dashboard-' + (etat.moi.role === 'administrateur' ? 'administrateur' : etat.moi.role) + '.html') : 'login.html';
    return '<header class="pf-top"><div class="pf-top-in"><a class="pf-marque" href="index.html"><img src="/assets/logo.png" alt=""><b>DIASPO\'ACTIF</b></a>' +
      '<nav class="pf-nav" aria-label="Navigation principale">' + nav.map(function (n) { return '<a href="' + n[1] + '">' + n[0] + '</a>'; }).join('') + '</nav>' +
      '<div class="pf-icones"><a class="pf-icone" href="panier.html" aria-label="Mon panier">' + ic('panier') + '<span class="pf-pastille" id="pf-pan-n"' + (etat.panier ? '' : ' hidden') + '>' + etat.panier + '</span></a>' +
      '<a class="pf-compte" href="' + compte + '">' + ic('compte') + '<span>' + (etat.moi ? 'Mon compte' : 'Connexion') + '</span></a></div></div></header>';
  }
  function hero() {
    var i = etat.init, ban = lienSurImage(i.vitrine_banniere_url);
    var cite = texte(i.slogan) || texte(i.boutique_description) || texte(i.description).slice(0, 110);
    return '<section class="pf-hero' + (ban ? ' image' : '') + '"' + (ban ? ' style="background-image:url(\'' + esc(ban) + '\')"' : '') + '><div class="pf-hero-in">' +
      '<div class="pf-hero-logo">' + logoHtml(i) + '</div>' +
      '<div><h1>' + esc(nom()) + '</h1><span class="pf-pilule">' + ic('portfolio') + 'Boutique Portfolio</span></div>' +
      (cite ? '<div class="pf-hero-droite"><div class="pf-citation">«&nbsp;' + esc(cite) + '&nbsp;»</div></div>' : '<div></div>') + '</div></section>';
  }
  function lienSurImage(u) { var s = texte(u); return s && !/["'()\\]/.test(s) ? s : ''; }
  function listeOnglets() {
    var o = rub('portfolio') ? [['portfolio', 'Portfolio', 'portfolio']] : [];
    if (realisations().length || galerie().length || videos().length) o.push(['creations', 'Nos créations', 'creations']);
    if (services().length) o.push(['services', 'Services', 'services']);
    if (produitsAffiches().length) o.push(['boutique', 'Boutique', 'boutique']);
    if (agendaVisible().length || partenairesVisibles().length) o.push(['collab', 'Projets & collaborations', 'collab']);
    var nAvis = rub('avis') ? (etat.avis && Number(etat.avis.total)) || 0 : 0, nTem = temoignages().length;
    if (nAvis || nTem) o.push(['avis', 'Avis' + (nAvis ? ' (' + nAvis + ')' : ''), 'avis']);
    if (rub('contact') || !o.length) o.push(['contact', 'Contact', 'contact']); /* jamais une page sans aucune entrée */
    return o;
  }
  function onglets() {
    var o = listeOnglets();
    if (!o.some(function (x) { return x[0] === etat.onglet; })) etat.onglet = o[0][0];
    return '<div class="pf-onglets"><div class="pf-onglets-in" role="tablist" aria-label="Rubriques de la boutique">' + o.map(function (x) {
      return '<button type="button" class="pf-onglet" role="tab" data-onglet="' + x[0] + '" aria-selected="' + (etat.onglet === x[0]) + '">' + ic(x[2]) + esc(x[1]) + '</button>';
    }).join('') + '</div></div>';
  }
  function lateral() {
    var i = etat.init, a = etat.avis || {}, verifiee = !!Number(i.organisation_verifiee);
    var lieu = [i.vitrine_ville || i.ville, i.vitrine_pays || i.pays].filter(Boolean).join(', ');
    var desc = texte(i.description) || texte(i.mission), longue = desc.length > 220;
    var comp = competences();
    var reseaux = objet(i.reseaux_sociaux), liens = [];
    Object.keys(reseaux).forEach(function (k) { var u = lienSur(reseaux[k]); if (u) liens.push([k.charAt(0).toUpperCase() + k.slice(1), u]); });
    if (lienSur(i.site_web)) liens.unshift(['Site web', lienSur(i.site_web)]);
    var h = '<aside class="pf-lateral"><div class="pf-carte pf-profil"><h2>' + esc(nom()) + (verifiee ? COCHE_BLEUE : '') + '</h2><small>' + esc(i.type || 'Créateur') + '</small>' +
      '<div class="pf-etoiles" aria-label="Note moyenne ' + esc(a.moyenne || 0) + ' sur 5">' + etoiles(a.moyenne) + '<em>' + (a.total ? '(' + a.total + ' avis)' : '(aucun avis)') + '</em></div>' +
      '<ul class="pf-infos">' + (lieu ? '<li>' + ic('lieu') + '<span>' + esc(lieu) + '</span></li>' : '') + (i.vitrine_horaires ? '<li>' + ic('horloge') + '<span>' + esc(i.vitrine_horaires) + '</span></li>' : '') + '</ul>' +
      '<a class="pf-bouton pri" href="' + lienMessage('contact') + '">' + ic('contact') + 'Nous contacter</a>' +
      (devisOuvert() ? '<a class="pf-bouton" href="' + lienMessage('devis') + '">Demander un devis</a>' : '') + '</div>';
    if (desc && rub('a_propos')) h += '<div class="pf-carte pf-apropos"><h3>À propos</h3><p>' + esc(etat.apropos || !longue ? desc : desc.slice(0, 217).replace(/\s+\S*$/, '') + '…') + '</p>' +
      (longue ? '<button type="button" class="pf-lire" data-act="apropos">' + (etat.apropos ? 'Réduire' : 'Lire la suite') + '</button>' : '') + '</div>';
    if (comp.length) h += '<div class="pf-carte"><h3>Compétences</h3><div class="pf-puces">' + comp.map(function (c) { return '<span class="pf-puce">' + esc(c) + '</span>'; }).join('') + '</div></div>';
    if (liens.length && rub('reseaux_sociaux')) h += '<div class="pf-carte"><h3>Liens &amp; réseaux</h3><ul class="pf-liens">' + liens.slice(0, 8).map(function (l) { return '<li><a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + ic('lien') + esc(l[0]) + '</a></li>'; }).join('') + '</ul></div>';
    h += '<div class="pf-carte pf-appel"><h3>Vous avez un projet ?</h3><p>Collaborez avec nous : racontez-nous votre idée, nous vous répondons.</p><a class="pf-bouton" href="' + lienMessage('partenariat') + '">Collaborez avec nous</a></div></aside>';
    return h;
  }
  function enTete(titre, sous) { return '<div class="pf-sect-tete"><h2>' + esc(titre) + '</h2>' + (sous ? '<p>' + esc(sous) + '</p>' : '') + '</div>'; }
  function bandeau(titre, sousTitre, cta, objetMsg) {
    return '<section class="pf-bandeau"><div><h2>' + esc(titre) + '</h2><p>' + esc(sousTitre) + '</p></div><a class="pf-bouton" href="' + lienMessage(objetMsg) + '">' + esc(cta) + ic('fleche') + '</a></section>';
  }

  /* à la une : jusqu'à 4 créations, la première sert d'ouverture */
  function aLaUne() {
    var c = creations().slice(0, 4);
    if (!c.length) return '';
    return '<section class="pf-une" aria-roledescription="carrousel" aria-label="À la une">' + c.map(function (x, k) {
      return '<div class="pf-diapo' + (k === etat.slide ? ' actif' : '') + '" style="background-image:url(\'' + esc(lienSurImage(x.image)) + '\')">' +
        (x.categorie ? '<span class="etiquette">' + esc(x.categorie) + '</span>' : '') + (x.titre ? '<h2>' + esc(x.titre) + '</h2>' : '') + (x.description ? '<p>' + esc(x.description) + '</p>' : '') +
        '<button type="button" class="pf-bouton or" data-voir="' + creations().indexOf(x) + '">Voir la création' + ic('fleche') + '</button></div>';
    }).join('') + (c.length > 1 ? '<div class="pf-points">' + c.map(function (_, k) { return '<button type="button" data-slide="' + k + '" aria-label="Création ' + (k + 1) + '"' + (k === etat.slide ? ' aria-current="true"' : '') + '></button>'; }).join('') + '</div>' : '') + '</section>';
  }
  function grilleCreations() {
    var tout = creations(), cats = categoriesDe(tout);
    if (!tout.length) return '<div class="pf-vide">Aucune création publiée pour le moment. Revenez bientôt !</div>';
    var l = etat.filtre ? tout.filter(function (x) { return x.categorie === etat.filtre; }) : tout;
    var h = enTete('Notre portfolio', tout.length + ' création' + (tout.length > 1 ? 's' : ''));
    if (cats.length) h += '<div class="pf-filtres" role="toolbar" aria-label="Filtrer par catégorie"><button type="button" class="pf-filtre" data-filtre="" aria-pressed="' + (!etat.filtre) + '">Tout</button>' +
      cats.map(function (c) { return '<button type="button" class="pf-filtre" data-filtre="' + esc(c) + '" aria-pressed="' + (etat.filtre === c) + '">' + esc(c) + '</button>'; }).join('') + '</div>';
    h += '<div class="pf-grille">' + l.slice(0, etat.nb).map(function (x) {
      return '<button type="button" class="pf-creation" data-voir="' + tout.indexOf(x) + '"><div class="vignette"><img loading="lazy" src="' + esc(x.image) + '" alt="' + esc(x.titre || 'Création') + '">' +
        (x.categorie ? '<span class="pf-etiquette">' + esc(x.categorie) + '</span>' : '') + '</div>' +
        (x.titre || x.description ? '<div class="corps">' + (x.titre ? '<h3>' + esc(x.titre) + '</h3>' : '') + (x.description ? '<p>' + esc(x.description) + '</p>' : '') + '</div>' : '') + '</button>';
    }).join('') + '</div>';
    if (l.length > etat.nb) h += '<div class="pf-plus"><button type="button" class="pf-bouton" data-act="plus">Voir plus de créations</button></div>';
    return '<section>' + h + '</section>';
  }
  function blocServices(limite) {
    var s = services(); if (!s.length) return '';
    return '<section>' + enTete('Nos services professionnels') + '<div class="pf-services">' + s.slice(0, limite || 12).map(function (x) {
      return '<div class="pf-service"><div class="puce">' + ic(iconeService(x.titre)) + '</div><h3>' + esc(x.titre) + '</h3>' + (x.description ? '<p>' + esc(x.description) + '</p>' : '') + '</div>';
    }).join('') + '</div></section>';
  }
  function phares() {
    var r = realisations(); if (!r.length) return '';
    return '<section>' + enTete('Réalisations phares') + '<div class="pf-rail-cadre">' +
      (r.length > 2 ? '<button type="button" class="pf-fl g" data-defil="-1" aria-label="Précédent">' + ic('gauche') + '</button>' : '') +
      '<div class="pf-rail" id="pf-rail">' + r.map(function (x) {
        var img = lienSurImage(x.image), balise = lienSur(x.lien) ? 'a' : 'div';
        return '<' + balise + ' class="pf-phare"' + (balise === 'a' ? ' href="' + esc(lienSur(x.lien)) + '" target="_blank" rel="noopener"' : '') + '><div class="vignette"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '>' +
          (texte(x.categorie) ? '<span class="pf-etiquette">' + esc(x.categorie) + '</span>' : '') +
          (texte(x.duree) ? '<span class="pf-duree">' + ic('horloge') + esc(x.duree) + '</span>' : '') + '</div>' +
          '<div class="corps"><h3>' + esc(x.titre || '') + '</h3>' + (texte(x.description) ? '<p>' + esc(x.description) + '</p>' : '') + '</div></' + balise + '>';
      }).join('') + '</div>' +
      (r.length > 2 ? '<button type="button" class="pf-fl d" data-defil="1" aria-label="Suivant">' + ic('droite') + '</button>' : '') + '</div></section>';
  }
  function blocGalerie() {
    var g = galerie(); if (!g.length) return '';
    var cats = categoriesDe(g), l = etat.filtreGalerie ? g.filter(function (x) { return x.categorie === etat.filtreGalerie; }) : g;
    return '<section>' + enTete('Galerie photos') +
      (cats.length ? '<div class="pf-filtres" role="toolbar" aria-label="Filtrer la galerie"><button type="button" class="pf-filtre" data-filtre-g="" aria-pressed="' + (!etat.filtreGalerie) + '">Tout</button>' +
        cats.map(function (c) { return '<button type="button" class="pf-filtre" data-filtre-g="' + esc(c) + '" aria-pressed="' + (etat.filtreGalerie === c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="pf-galerie">' + l.slice(0, 24).map(function (x) {
        return '<button type="button" data-photo="' + esc(x.image) + '" data-legende="' + esc(x.titre) + '"><img loading="lazy" src="' + esc(x.image) + '" alt="' + esc(x.titre || 'Photo de la galerie') + '"></button>';
      }).join('') + '</div></section>';
  }
  function integrable(url) {
    var u = String(url || ''), m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1];
    m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? 'https://player.vimeo.com/video/' + m[1] : null;
  }
  function blocVideos() {
    var v = videos(); if (!v.length) return '';
    return '<section>' + enTete('Vidéos') + '<div class="pf-videos">' + v.slice(0, 9).map(function (x) {
      var emb = integrable(x.url), lien = lienSur(x.url);
      return '<div class="pf-video"><div class="lecteur">' + (emb ? '<iframe src="' + esc(emb) + '" title="' + esc(x.titre || 'Vidéo') + '" loading="lazy" allowfullscreen></iframe>' :
        '<a class="lien" href="' + esc(lien || '#') + '" target="_blank" rel="noopener">' + ic('lecture') + ' Voir la vidéo</a>') + '</div>' +
        ((texte(x.titre) || texte(x.duree)) ? '<div class="corps"><b>' + esc(x.titre || '') + '</b>' + (texte(x.duree) ? '<span>' + esc(x.duree) + '</span>' : '') + '</div>' : '') + '</div>';
    }).join('') + '</div></section>';
  }
  function blocTemoignages(max) {
    var t = temoignages().slice(0, max || 12); if (!t.length) return '';
    return '<section>' + enTete('Témoignages clients') + '<div class="pf-avis">' + t.map(function (x) {
      return '<div class="pf-avis-carte"><p>«&nbsp;' + esc(x.texte) + '&nbsp;»</p><div class="pf-qui"><span class="pf-rond">' + esc(texte(x.nom || '?').charAt(0).toUpperCase()) + '</span><span>' + esc(x.nom || 'Client') + (texte(x.fonction) ? '<small>' + esc(x.fonction) + '</small>' : '') + '</span></div></div>';
    }).join('') + '</div></section>';
  }
  function carteProduit(p) {
    var ph = photoProduit(p), prix = prixProduit(p), cat = texte(p.categorie);
    var promo = p.prix_promo != null && Number(p.prix_promo) > 0 && prix && Number(p.prix_promo) < prix ? Number(p.prix_promo) : null;
    var vendable = prix && (p.statut || 'disponible') === 'disponible';
    var prixHtml = !prix ? '<div class="pf-prix demande">' + (p.prix != null && Number(p.prix) <= 0 ? 'Gratuit' : 'Sur demande') + '</div>' :
      '<div class="pf-prix">' + argent(promo || prix, p.devise) + (promo ? '<s>' + argent(prix, p.devise) + '</s>' : '') + '</div>';
    return '<article class="pf-produit"><button type="button" class="vignette" data-prod="' + p.id + '" aria-label="Voir ' + esc(p.nom) + '">' + (ph ? '<img loading="lazy" src="' + esc(ph) + '" alt="' + esc(p.nom) + '">' : ic('boutique')) + '</button>' +
      (cat ? '<span class="pf-etiquette">' + esc(cat) + '</span>' : '') +
      '<button type="button" class="pf-coeur" data-fav="' + p.id + '" aria-pressed="' + (etat.favoris.indexOf(Number(p.id)) >= 0) + '" aria-label="Ajouter aux favoris">' + ic('coeur') + '</button>' +
      '<div class="corps"><h3>' + esc(p.nom) + '</h3>' + prixHtml +
      (vendable ? '<button type="button" class="pf-bouton pri" data-ajout="' + p.id + '">' + ic('panier') + 'Ajouter au panier</button>' : '<a class="pf-bouton" href="' + lienMessage('Question sur : ' + p.nom) + '">Nous écrire</a>') + '</div></article>';
  }
  function blocProduits(max, titre) {
    var p = produitsAffiches(); if (!p.length) return '';
    return '<section>' + enTete(titre || 'Boutique créative') + '<div class="pf-produits">' + p.slice(0, max || 40).map(carteProduit).join('') + '</div></section>';
  }
  function blocAvis() {
    if (!rub('avis')) return '';
    var av = (etat.avis && etat.avis.avis || []).filter(function (a) { return a.commentaire; });
    if (!av.length) return '';
    return '<section>' + enTete('Avis des clients') + '<div class="pf-avis">' + av.slice(0, 20).map(function (a) {
      var n = ((a.prenom || '') + ' ' + String(a.nom || '').charAt(0) + (a.nom ? '.' : '')).trim();
      return '<div class="pf-avis-carte"><div class="pf-etoiles">' + etoiles(a.note) + '</div><p>«&nbsp;' + esc(a.commentaire) + '&nbsp;»</p><div class="pf-qui"><span class="pf-rond">' + esc((a.prenom || a.nom || '?').charAt(0).toUpperCase()) + '</span><span>' + esc(n || 'Client') + '</span></div></div>';
    }).join('') + '</div></section>';
  }
  function agendaVisible() { return rub('evenements') ? etat.agenda : []; }
  function partenairesVisibles() { return rub('partenaires') ? liste(etat.init.vitrine_partenaires_json).filter(function (x) { return x && texte(x.nom); }) : []; }
  function blocAgenda() {
    if (!agendaVisible().length) return '';
    return '<section>' + enTete('Prochains événements & formations') + '<div class="pf-agenda">' + etat.agenda.map(function (e) {
      var d = dates(e.date);
      return '<a class="pf-evt" href="' + esc(e.href) + '"><div class="pf-date">' + (d ? '<b>' + d.getDate() + '</b><span>' + d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') + '</span>' : '<b>·</b><span>bientôt</span>') + '</div>' +
        '<div><span class="tag">' + esc(e.type) + '</span><h3>' + esc(e.titre) + '</h3>' + (e.lieu ? '<div class="lieu">' + esc(e.lieu) + '</div>' : '') + '</div></a>';
    }).join('') + '</div></section>';
  }
  function blocPartenaires() {
    var p = partenairesVisibles();
    if (!p.length) return '';
    return '<section>' + enTete('Nos partenaires') + '<div class="pf-cartouches">' + p.slice(0, 12).map(function (x) {
      return '<div class="pf-cartouche">' + (x.logo_url ? '<img loading="lazy" src="' + esc(x.logo_url) + '" alt="' + esc(x.nom) + '" style="max-height:44px;margin-bottom:6px">' : '') + '<h4>' + esc(x.nom) + '</h4></div>';
    }).join('') + '</div></section>';
  }
  function blocContact() {
    if (!rub('contact')) return '';
    var i = etat.init, adresse = [i.adresse, i.code_postal, i.vitrine_ville || i.ville, i.vitrine_pays || i.pays].filter(Boolean).join(', ');
    var wa = String(i.vitrine_whatsapp || '').replace(/[^0-9]/g, ''), cartes = '';
    cartes += '<div class="pf-carte"><b>Écrire à ' + esc(nom()) + '</b><span>Par la messagerie de la plateforme.</span><a class="pf-bouton pri" href="' + lienMessage('contact') + '">' + ic('contact') + 'Nous contacter</a>' +
      (devisOuvert() ? '<a class="pf-bouton" href="' + lienMessage('devis') + '">Demander un devis</a>' : '') + '</div>';
    var coord = '';
    if (adresse) coord += '<span>' + esc(adresse) + '</span>';
    if (i.vitrine_horaires) coord += '<span>' + esc(i.vitrine_horaires) + '</span>';
    if (i.vitrine_email_pro) coord += '<a href="mailto:' + esc(i.vitrine_email_pro) + '">' + esc(i.vitrine_email_pro) + '</a>';
    if (i.vitrine_tel_pro && Number(i.vitrine_tel_visible)) coord += '<a href="tel:' + esc(String(i.vitrine_tel_pro).replace(/[^0-9+]/g, '')) + '">' + esc(i.vitrine_tel_pro) + '</a>';
    if (wa) coord += '<a href="https://wa.me/' + wa + '" target="_blank" rel="noopener">WhatsApp</a>';
    if (lienSur(i.site_web)) coord += '<a href="' + esc(lienSur(i.site_web)) + '" target="_blank" rel="noopener">Site web</a>';
    if (coord) cartes += '<div class="pf-carte"><b>Coordonnées</b>' + coord + '</div>';
    if (i.vitrine_google_maps_url && lienSur(i.vitrine_google_maps_url)) cartes += '<div class="pf-carte"><b>Nous trouver</b><a href="' + esc(lienSur(i.vitrine_google_maps_url)) + '" target="_blank" rel="noopener">Ouvrir sur la carte</a></div>';
    return '<section>' + enTete('Contact') + '<div class="pf-contact">' + cartes + '</div></section>';
  }

  /* ── Bonus de la boutique : contenus sans équivalent dans le type, conservés et jamais mis en avant (même règle que la boutique de vente) ── */
  function cartouches(items) {
    return '<div class="pf-cartouches">' + items.map(function (x) {
      if (typeof x === 'string') return '<div class="pf-cartouche"><p>' + esc(x) + '</p></div>';
      var corps = '<h4>' + esc(x.titre || x.nom || x.valeur || '') + '</h4>' + (x.description || x.libelle ? '<p>' + esc(x.description || x.libelle) + '</p>' : '');
      return x.lien ? '<a class="pf-cartouche" href="' + esc(lienSur(x.lien)) + '" target="_blank" rel="noopener">' + corps + '</a>' : '<div class="pf-cartouche">' + corps + '</div>';
    }).join('') + '</div>';
  }
  function bonusHtml() {
    var b = (etat.init.vitrine_bonus || []).filter(function (x) { return estProprio() || x.publie; });
    if (!b.length) return '';
    var groupes = b.map(function (x) {
      var c = x.contenu || {}, corps = '';
      Object.keys(c).forEach(function (k) {
        var v = c[k], l = liste(v);
        if (l.length) corps += cartouches(l.slice(0, 8));
        else if (typeof v === 'string' && v && v.charAt(0) !== '[' && v.charAt(0) !== '{') corps += '<p class="texte">' + esc(v) + '</p>';
      });
      return corps ? '<h3>' + esc(x.label) + (estProprio() && !x.publie ? '<span class="pf-pastille-prive">Non publié</span>' : '') + '</h3>' + corps : '';
    }).filter(Boolean);
    if (!groupes.length) return '';
    return '<section class="pf-bonus"><h2>Bonus de la boutique</h2>' + (estProprio() ? '<p class="note">Vous seul voyez les éléments non publiés. Publiez-les depuis Paramètres boutique pour les montrer aux visiteurs.</p>' : '') + groupes.join('') + '</section>';
  }

  /* ── contenu de chaque onglet ── */
  function panneau() {
    var o = etat.onglet, h = '';
    if (o === 'portfolio') {
      h += aLaUne() + grilleCreations() + blocServices(6) +
        bandeau('Vous êtes une entreprise, une initiative ou une institution ?', 'Parlons de votre projet : nous vous répondons rapidement.', 'Demander une collaboration', 'partenariat') + bonusHtml();
    } else if (o === 'creations') {
      h += phares() + blocGalerie() + blocVideos() + blocTemoignages(3) + blocProduits(4) +
        bandeau('Disponible pour vos projets', 'Travaillons ensemble ! Dites-nous ce que vous imaginez.', 'Demander une collaboration', 'partenariat');
    } else if (o === 'services') {
      h += blocServices(12) + bandeau('Un besoin précis ?', 'Décrivez-nous votre projet, nous préparons une proposition.', devisOuvert() ? 'Demander un devis' : 'Nous contacter', devisOuvert() ? 'devis' : 'contact');
    } else if (o === 'boutique') {
      h += blocProduits(60, 'Boutique créative');
    } else if (o === 'collab') {
      h += blocAgenda() + blocPartenaires() + bandeau('Disponible pour vos projets', 'Entreprise, initiative ou institution : proposons un projet commun.', 'Demander une collaboration', 'partenariat');
    } else if (o === 'avis') {
      h += blocAvis() + blocTemoignages(24);
    } else {
      h += blocContact();
    }
    return h || '<div class="pf-vide">Rien à afficher ici pour le moment.</div>';
  }
  /* Couleurs de la boutique (lot 4A, 2026-11-13) : les 3 couleurs choisies à l'étape « Apparence » remplacent bordeaux / bleu nuit / or.
     Sans couleurs enregistrées, la page garde sa charte d'origine. */
  var NOMS_COULEURS = {'--pf-bordeaux': 'p', '--pf-bordeaux2': 'p_clair', '--pf-bordeaux3': 'p_fonce', '--pf-marine': 's', '--pf-marine2': 's_clair', '--pf-or': 'a', '--pf-or2': 'a_fonce'};
  function styleBoutique(v) { try { var o = typeof v === 'string' ? JSON.parse(v || '{}') : v; return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function appliquerCouleurs(style) { if (window.BOUTIQUE_COULEURS && window.BOUTIQUE_COULEURS.appliquerPage) window.BOUTIQUE_COULEURS.appliquerPage(document.body, style, NOMS_COULEURS); }
  window.addEventListener('message', function (ev) {
    if (window.parent === window || ev.origin !== location.origin || !ev.data || ev.data.type !== 'da-vitrine-style') return;
    appliquerCouleurs(ev.data.style || {});
  });
  /* Réglages de la boutique (lot 4A) : livraison, minimum, délais, informations légales — rien si la boutique n'a rien réglé. */
  function rp(nom, opt) { var m = window.BoutiqueReglagesPublic; return m ? m[nom](opt) : ''; }
  function pied() {
    var i = etat.init;
    return '<footer class="pf-pied"><div class="pf-pied-in"><span><b>DIASPO\'ACTIF</b> · Actions locales, impact global</span><div class="liens">' +
      '<a href="initiative.html?id=' + i.id + '">À propos de la boutique</a><a href="vitrines.html">Toutes les boutiques</a><a href="annuaire.html">Annuaire</a><a href="confidentialite.html">Confidentialité</a><a href="mentions-legales.html">Mentions légales</a></div></div>' + rp('htmlLegal') + '</footer>';
  }

  /* ── affichage ── */
  function dessiner() {
    document.title = nom() + ' — Boutique Portfolio Diaspo\'Actif';
    app.innerHTML = entete() + hero() + onglets() + '<main class="pf-corps">' + lateral() + '<div class="pf-principal" id="pf-principal">' + panneau() + '</div></main>' + rp('htmlConditions') + pied();
    demarreCarrousel();
    /* Encart « Sondage en cours » : sondages que le propriétaire a choisi d'afficher sur sa boutique (2026-11-09). */
    var m = app.querySelector('.pf-corps');
    if (window.SondagesEnCours && etat.init && etat.init.owner_user_id && m && m.previousElementSibling) SondagesEnCours.rendre({ boutique: etat.init.owner_user_id, apres: m.previousElementSibling });
  }
  function rafraichirPanneau(faireDefiler) {
    var p = document.getElementById('pf-principal'); if (!p) return dessiner();
    p.innerHTML = panneau();
    var ongl = document.querySelector('.pf-onglets-in');
    if (ongl) ongl.querySelectorAll('.pf-onglet').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-onglet') === etat.onglet ? 'true' : 'false'); });
    demarreCarrousel();
    if (faireDefiler) { var o = document.querySelector('.pf-onglets'); if (o) window.scrollTo({ top: o.offsetTop - 58, behavior: 'smooth' }); }
  }
  function demarreCarrousel() {
    clearInterval(etat.minuteur);
    var n = document.querySelectorAll('.pf-diapo').length;
    if (n < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    etat.minuteur = setInterval(function () { allerSlide((etat.slide + 1) % n); }, 6500);
  }
  function allerSlide(k) {
    etat.slide = k;
    document.querySelectorAll('.pf-diapo').forEach(function (s, i) { s.classList.toggle('actif', i === k); });
    document.querySelectorAll('.pf-points button').forEach(function (b, i) { if (i === k) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  }

  /* ── fenêtres ── */
  function ouvrir(html) {
    modalEl.innerHTML = '<div class="pf-fenetre" role="dialog" aria-modal="true"><button type="button" class="pf-fermer" data-fermer aria-label="Fermer">' + ic('fermer') + '</button>' + html + '</div>';
    modalEl.hidden = false;
  }
  function fermer() { modalEl.hidden = true; modalEl.innerHTML = ''; }
  function voirCreation(k) {
    var x = creations()[k]; if (!x) return;
    ouvrir('<div class="grande"><img src="' + esc(x.image) + '" alt="' + esc(x.titre || 'Création') + '"></div><div class="texte">' +
      (x.categorie ? '<span class="pf-pilule petite">' + esc(x.categorie) + '</span>' : '') +
      (x.titre ? '<h2>' + esc(x.titre) + '</h2>' : '') + (x.description ? '<p>' + esc(x.description) + '</p>' : '') +
      (x.lien ? '<a class="pf-bouton pri" href="' + esc(x.lien) + '" target="_blank" rel="noopener">Voir le projet' + ic('fleche') + '</a>' : '') +
      '<a class="pf-bouton" href="' + lienMessage('Question sur : ' + (x.titre || 'une création')) + '">Nous écrire</a></div>');
  }
  function voirPhoto(src, legende) {
    ouvrir('<div class="grande"><img src="' + esc(src) + '" alt="' + esc(legende || 'Photo de la galerie') + '"></div>' + (legende ? '<div class="texte"><h2>' + esc(legende) + '</h2></div>' : ''));
  }
  function voirProduit(id) {
    var p = etat.produits.filter(function (x) { return Number(x.id) === Number(id); })[0]; if (!p) return;
    var ph = photoProduit(p), prix = prixProduit(p), vendable = prix && (p.statut || 'disponible') === 'disponible';
    ouvrir((ph ? '<div class="grande"><img src="' + esc(ph) + '" alt="' + esc(p.nom) + '"></div>' : '') + '<div class="texte"><h2>' + esc(p.nom) + '</h2>' +
      '<div class="prix">' + (prix ? argent(prix, p.devise) : (p.prix != null && Number(p.prix) <= 0 ? 'Gratuit' : 'Sur demande')) + '</div>' +
      '<p>' + esc(p.description || 'Aucune description.') + '</p>' +
      (vendable ? '<button type="button" class="pf-bouton pri" data-ajout="' + p.id + '">' + ic('panier') + 'Ajouter au panier</button>' : '<a class="pf-bouton pri" href="' + lienMessage('Question sur : ' + p.nom) + '">Nous écrire</a>') + '</div>');
  }

  /* ── actions ── */
  function ajouter(id, bouton) {
    var p = etat.produits.filter(function (x) { return Number(x.id) === Number(id); })[0]; if (!p) return;
    if (!etat.moi) { toast('Connectez-vous pour ajouter au panier.', true, { href: 'login.html', texte: 'Me connecter' }); return; }
    var mode = Number(p.livraison_expedition) && !Number(p.livraison_retrait) ? 'expedition' : 'retrait';
    if (bouton) bouton.disabled = true;
    api('POST', '/panier', { produit_id: Number(p.id), quantite: 1, mode_livraison: mode }).then(function (r) {
      etat.panier = Number(r.nb_articles) || etat.panier + 1;
      var b = document.getElementById('pf-pan-n'); if (b) { b.textContent = etat.panier; b.hidden = false; }
      toast('Ajouté au panier ✓', false, { href: 'panier.html', texte: 'Voir mon panier' });
    }).catch(function (e) { toast(e.message || 'Impossible d\'ajouter au panier.', true); })
      .then(function () { if (bouton) bouton.disabled = false; });
  }

  /* ── événements (délégation) ── */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-onglet],[data-filtre],[data-filtre-g],[data-act],[data-voir],[data-photo],[data-prod],[data-fav],[data-ajout],[data-slide],[data-defil],[data-fermer]');
    if (!t) { if (e.target === modalEl) fermer(); return; }
    if (t.hasAttribute('data-fermer')) return fermer();
    if (t.hasAttribute('data-onglet')) { etat.onglet = t.getAttribute('data-onglet'); etat.filtre = ''; etat.nb = PAGE; etat.filtreGalerie = ''; etat.slide = 0; return rafraichirPanneau(true); }
    if (t.hasAttribute('data-filtre')) { etat.filtre = t.getAttribute('data-filtre'); etat.nb = PAGE; return rafraichirPanneau(false); }
    if (t.hasAttribute('data-filtre-g')) { etat.filtreGalerie = t.getAttribute('data-filtre-g'); return rafraichirPanneau(false); }
    if (t.hasAttribute('data-act')) {
      var a = t.getAttribute('data-act');
      if (a === 'plus') { etat.nb += PAGE; return rafraichirPanneau(false); }
      if (a === 'apropos') { etat.apropos = !etat.apropos; return dessiner(); }
      return;
    }
    if (t.hasAttribute('data-voir')) return voirCreation(Number(t.getAttribute('data-voir')));
    if (t.hasAttribute('data-photo')) return voirPhoto(t.getAttribute('data-photo'), t.getAttribute('data-legende'));
    if (t.hasAttribute('data-prod')) return voirProduit(t.getAttribute('data-prod'));
    if (t.hasAttribute('data-fav')) return basculeFavori(t.getAttribute('data-fav'));
    if (t.hasAttribute('data-ajout')) return ajouter(t.getAttribute('data-ajout'), t);
    if (t.hasAttribute('data-slide')) { allerSlide(Number(t.getAttribute('data-slide'))); return demarreCarrousel(); }
    if (t.hasAttribute('data-defil')) { var r = document.getElementById('pf-rail'); if (r) r.scrollBy({ left: Number(t.getAttribute('data-defil')) * 340, behavior: 'smooth' }); return; }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modalEl.hidden) fermer(); });

  charger().then(function () {
    chargeFavoris();
    var h = (location.hash || '').replace('#', '');
    if (h && listeOnglets().some(function (x) { return x[0] === h; })) etat.onglet = h;
    dessiner();
  }).catch(function (e) { app.innerHTML = '<p class="pf-chargement">' + esc(e.message || 'Boutique introuvable.') + ' <a href="vitrines.html" style="color:var(--pf-bordeaux);font-weight:700">Voir toutes les boutiques</a></p>'; });
})();
