/* Boutique « Créateur d'événements » — boutique-evenements.html, 2026-11-12 (lot E).
   Lit : /initiatives/:id, /evenements?owner=…&boutique=1, /evenements/:id (fiche : cagnottes liées), /auth/me.
   Écrit : POST /evenements/:id/ajouter-agenda (compte connecté). L'inscription elle-même reste celle de la plateforme :
   fiche d'inscription publiée (inscription-publique.html), lien externe de l'organisateur, sinon la page des événements.
   Aucun paiement ici. Couleurs : style de la boutique (vitrine_style_json.couleurs), sinon Bordeaux & Or.
   Paramètre d'adresse : ?id=… (ou ?slug=…). */
(function () {
  'use strict';
  var app = document.getElementById('evb-app');
  var toastEl = document.getElementById('evb-toast');
  var PAR_PAGE = 6;
  var MOIS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var TYPES = { evenement: 'Événement', forum: 'Forum', atelier: 'Atelier', webinaire: 'Webinaire', conference: 'Conférence', gala: 'Gala', marche: 'Marché / Foire', networking: 'Réseautage', debat: 'Débat', concours: 'Concours', trophee_diaspora: 'Trophée diaspora', autre: 'Autre' };
  var etat = { init: null, evts: [], moi: null, agendaIds: [], inscrits: [], onglet: 'a_venir', cat: '', q: '', mois: '', format: '', prix: '', tri: 'date', vue: 'cartes', page: 1, courant: null, ouvreur: null };

  /* ── utilitaires ── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(methode, chemin, corps) {
    return fetch('/api' + chemin, { method: methode, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Erreur.'); e.status = r.status; throw e; } return j; }); });
  }
  function texte(s) { return String(s == null ? '' : s).trim(); }
  function lienSur(u) { var s = texte(u); if (!s) return ''; if (/^https?:\/\//i.test(s)) return s; if (/^[\w.-]+\.[a-z]{2,}/i.test(s)) return 'https://' + s; return ''; }
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
  /* Le texte riche des événements est affiché en texte simple : jamais de balises venues de la base. */
  function enTexte(html) {
    return String(html == null ? '' : html).replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
  }
  function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.classList.remove('show'); }, 3200); }

  /* ── icônes filaires ── */
  var ICONES = {
    calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    lieu: '<path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    ecran: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    croix: '<path d="M6 6l12 12M18 6L6 18"/>',
    gauche: '<path d="M15 5l-7 7 7 7"/>', droite: '<path d="M9 5l7 7-7 7"/>',
    grille: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    liste: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    billet: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 0 0-6V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/>',
    bouclier: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    cloche: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>',
    compte: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'
  };
  function ic(nom) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[nom] || ICONES.calendrier) + '</svg>'; }

  /* ── couleurs : style de la boutique -> --c1 (accent du bandeau), --c2 (fond), --c3 (or) ── */
  function rgb(h) { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(a) { return '#' + a.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join(''); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hex(x.map(function (v, i) { return v * (1 - t) + y[i] * t; })); }
  function lum(h) { var c = rgb(h).map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
  function appliquerCouleurs(style) {
    var c = (style && Array.isArray(style.couleurs) ? style.couleurs : []).filter(function (x) { return /^#[0-9a-f]{6}$/i.test(x); });
    var d = ['#83172f', '#111c38', '#d8b36a'];
    var c1 = c[0] || d[0], c2 = c[1] || (c[0] ? mix(c[0], '#000000', .6) : d[1]), c3 = c[2] || d[2];
    var b = document.body.style;
    var bg = lum(c2) > .2 ? mix(c2, '#000000', .75) : mix(c2, '#000000', .35);
    var or = lum(c3) < .3 ? mix(c3, '#ffffff', .5) : c3;
    b.setProperty('--c1', c1); b.setProperty('--c2', c2); b.setProperty('--c3', c3);
    b.setProperty('--bg', bg); b.setProperty('--panel', mix(bg, '#ffffff', .05)); b.setProperty('--panel2', mix(bg, '#ffffff', .09));
    b.setProperty('--gold', or); b.setProperty('--line', mix(bg, or, .38)); b.setProperty('--on-gold', lum(or) > .35 ? mix(bg, '#000000', .3) : '#ffffff');
  }

  /* ── données d'un événement ── */
  function dateDe(e) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(e.date_evt || '')); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; }
  function cleMois(e) { var d = dateDe(e); return d ? d.getFullYear() * 100 + d.getMonth() + 1 : 0; }
  function libMois(k) { return MOIS[k % 100] + ' ' + Math.floor(k / 100); }
  function dateLongue(e) { var d = dateDe(e); return d ? JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth() + 1] + ' ' + d.getFullYear() : 'Date à confirmer'; }
  function horaire(e) { var a = texte(e.heure_debut), b = texte(e.heure_fin); return a ? (b ? a + ' à ' + b : a) : 'Horaire à confirmer'; }
  function statut(e) { return e.statut_temporel || 'a_venir'; }
  function enLigne(e) { return e.mode_participation === 'distanciel'; }
  function typeLib(e) { return TYPES[e.type_evt] || texte(e.domaine) || 'Événement'; }
  function categorie(e) { return typeLib(e); }
  function prixMin(e) { var p = Number(e.prix_min); return p > 0 ? p : 0; }
  function payant(e) { return e.type_participation === 'payant' || e.type_participation === 'partiellement_payant' || prixMin(e) > 0; }
  function prixTexte(e) {
    if (e.type_participation === 'partiellement_payant') return prixMin(e) ? 'À partir de ' + eur(prixMin(e)) : 'Partiellement payant';
    if (prixMin(e)) return 'À partir de ' + eur(prixMin(e));
    return e.type_participation === 'payant' ? 'Payant' : 'Gratuit';
  }
  function eur(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €'; }
  function langue(v) { var t = texte(v).toLowerCase(); return t === 'francais' ? 'Français' : t === 'anglais' ? 'Anglais' : t.charAt(0).toUpperCase() + t.slice(1); }
  function placesMax(e) { var n = Number(e.places_max); return n > 0 ? n : 0; }
  function inscrits(e) { return e.nb_participants == null ? null : Number(e.nb_participants); }
  function restantes(e) { var m = placesMax(e), n = inscrits(e); return m && n != null ? m - n : null; }
  function couverture(e) {
    var img = texte(e.image_couverture) || texte(e.image_url) || texte(liste(e.galerie_photos)[0]) || texte(e.fiche_media && e.fiche_media.affiche_url);
    if (!img) return '';
    return /^data:/i.test(img) ? '/api/evenements/' + e.id + '/couverture' : img;
  }
  function programme(e) { var p = liste(e.programme_json); return p.filter(function (j) { return j && (liste(j.etapes).length || j.date_debut); }); }
  /* Rubrique éteinte par le propriétaire à l'étape « Rubriques » (lot 4B) : cachée aux visiteurs, ses données restent. Rien d'éteint = comportement d'avant. */
  function rub(cle) { return !window.BoutiqueRubriques || window.BoutiqueRubriques.active(etat.init.vitrine_modules_state, cle); }
  /* Sans la rubrique « Réservation », les événements restent consultables mais ne proposent plus d'inscription (comme un événement informatif). */
  function infoSeule(e) { return Number(e.inscription_ouverte) === 0 || !rub('reservation'); }
  /* Quel bouton d'inscription ? (mêmes règles que la page des événements) */
  function action(e) {
    if (statut(e) === 'termine') return { lib: 'Événement terminé', actif: false };
    if (infoSeule(e)) { var info = lienSur(e.lien_plus_info); return info ? { lib: 'Plus d’informations', href: info, externe: true, actif: true } : { lib: 'Événement informatif', actif: false }; }
    if (estInscrit(e)) return { lib: 'Inscrit', actif: false, inscrit: true };
    if (lienSur(e.lien_inscription)) return { lib: 'S’inscrire', href: lienSur(e.lien_inscription), externe: true, actif: true };
    if (e.fiche_slug) return { lib: payant(e) ? 'Réserver' : 'S’inscrire', href: 'inscription-publique.html?slug=' + encodeURIComponent(e.fiche_slug), actif: true };
    var r = restantes(e);
    if (r != null && r <= 0) return { lib: 'Complet', actif: false };
    /* Événement gratuit, sans fiche ni lien externe, visiteur connecté : l'inscription se fait ici même (POST /evenements/:id/rejoindre). */
    if (etat.moi && !payant(e)) return { lib: 'S’inscrire', direct: true, actif: true };
    return { lib: 'S’inscrire', href: 'evenements.html?evt=' + e.id, actif: true };
  }
  function estInscrit(e) { return etat.inscrits.indexOf(Number(e.id)) >= 0; }
  function boutonAction(e, classe, avecAnnulation) {
    var a = action(e);
    if (a.direct) return '<button type="button" class="btn ' + classe + '" data-inscrire="' + e.id + '">' + esc(a.lib) + '</button>';
    if (a.inscrit) return '<button type="button" class="btn ' + classe + '" disabled>' + esc(a.lib) + '</button>' + (avecAnnulation && statut(e) !== 'termine' ? '<button type="button" class="btn" data-quitter="' + e.id + '">Annuler mon inscription</button>' : '');
    if (!a.actif) return '<button type="button" class="btn ' + classe + '" disabled>' + esc(a.lib) + '</button>';
    return '<a class="btn ' + classe + '" href="' + esc(a.href) + '"' + (a.externe ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(a.lib) + '</a>';
  }

  /* ── filtres ── */
  function inscriptionsOuvertes() { return !!etat.moi && rub('reservation'); }
  function parOnglet() {
    if (etat.onglet === 'mes') return etat.evts.filter(estInscrit);
    return etat.evts.filter(function (e) { return statut(e) === etat.onglet || (etat.onglet === 'a_venir' && statut(e) === 'en_cours'); });
  }
  function compte(o) {
    if (o === 'mes') return etat.evts.filter(estInscrit).length;
    return etat.evts.filter(function (e) { return statut(e) === o || (o === 'a_venir' && statut(e) === 'en_cours'); }).length;
  }
  function filtrer() {
    var q = etat.q.trim().toLowerCase();
    var l = parOnglet().filter(function (e) {
      return (!etat.cat || categorie(e) === etat.cat) && (!etat.mois || String(cleMois(e)) === etat.mois) &&
        (!etat.format || (etat.format === 'ligne' ? enLigne(e) : !enLigne(e))) &&
        (!etat.prix || (etat.prix === 'gratuit' ? !payant(e) : payant(e))) &&
        (!q || (e.titre + ' ' + (e.lieu || '') + ' ' + (e.ville || '') + ' ' + enTexte(e.description) + ' ' + categorie(e)).toLowerCase().indexOf(q) >= 0);
    });
    var passe = etat.onglet === 'termine';
    l.sort(function (a, b) {
      if (etat.tri === 'prix-asc') return prixMin(a) - prixMin(b);
      if (etat.tri === 'prix-desc') return prixMin(b) - prixMin(a);
      if (etat.tri === 'places') return (restantes(b) == null ? -1 : restantes(b)) - (restantes(a) == null ? -1 : restantes(a));
      var da = dateDe(a), db = dateDe(b);
      var r = (da ? da.getTime() : 9e15) - (db ? db.getTime() : 9e15);
      return passe ? -r : r;
    });
    return l;
  }

  /* ── morceaux de page ── */
  function nom() { return etat.init.boutique_nom || etat.init.nom; }
  function proprio() { return etat.init.owner_user_id; }
  function lienMessage(objetMsg) { return 'messagerie.html?with=' + proprio() + '&origine=vitrine&objet=' + encodeURIComponent(objetMsg); }
  function logoHtml() {
    var src = texte(etat.init.logo_url);
    return src ? '<img src="' + esc(src) + '" alt="">' : esc((nom() || '?').charAt(0).toUpperCase());
  }
  function entete() {
    var compteLien = etat.moi ? ('dashboard-' + (etat.moi.role === 'administrateur' ? 'administrateur' : etat.moi.role) + '.html') : 'login.html';
    return '<header class="top"><div class="top-in"><a class="logo" href="index.html"><span class="pastille">' + logoHtml() + '</span><b>' + esc(nom()) + '</b></a>' +
      '<nav class="nav" aria-label="Rubriques"><button type="button" data-nav="accueil">Accueil</button>' +
      '<button type="button" data-nav="cartes" id="navCartes" aria-current="true">Événements</button>' +
      '<button type="button" data-nav="agenda" id="navAgenda" aria-current="false">Agenda</button></nav>' +
      '<div class="tools"><a class="minebtn" href="' + compteLien + '">' + ic('compte') + '<span>' + (etat.moi ? 'Mon compte' : 'Connexion') + '</span></a></div></div></header>';
  }
  function scene() {
    /* Illustration du bandeau : faisceaux, guirlande et public, dessinés en SVG (aucune image externe). */
    var s = '<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs><linearGradient id="evbh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--bg)"/><stop offset="1" stop-color="var(--panel2)"/></linearGradient></defs>' +
      '<rect width="400" height="250" fill="url(#evbh)"/><g fill="var(--gold)" opacity=".16"><path d="M80 0h40l60 190H20z"/><path d="M180 0h40l40 190H140z"/><path d="M280 0h40l60 190H260z"/></g>' +
      '<path d="M40 190Q200 90 360 190" fill="none" stroke="var(--gold)" stroke-width="3" opacity=".7"/><path d="M70 190Q200 112 330 190" fill="none" stroke="var(--gold)" stroke-width="2" opacity=".45"/>' +
      '<path d="M0 30Q100 62 200 30T400 30" stroke="#fff" stroke-opacity=".6" fill="none" stroke-width="2"/>';
    [24, 84, 144, 204, 264, 324].forEach(function (x, i) { s += '<path d="M' + x + ' ' + (38 + (i % 2 ? 7 : 0)) + 'l14 4-7 22z" fill="' + ['var(--gold)', '#f4f0e8', 'var(--c1)'][i % 3] + '"/>'; });
    s += '<g fill="#05070f">';
    [20, 62, 104, 146, 188, 230, 272, 314, 356].forEach(function (x, i) { s += '<circle cx="' + x + '" cy="' + (214 - (i % 3) * 6) + '" r="14"/><path d="M' + (x - 22) + ' 250c0-24 10-34 22-34s22 10 22 34z"/>'; });
    return s + '</g></svg>';
  }
  function hero() {
    var i = etat.init, ban = texte(i.vitrine_banniere_url);
    ban = ban && !/["'()\\]/.test(ban) ? ban : '';
    var slogan = texte(i.slogan) || texte(i.boutique_description) || texte(i.description).slice(0, 160) || 'Rencontres, ateliers et rendez-vous de la communauté.';
    return '<section class="hero' + (ban ? ' image' : '') + '" id="accueil"' + (ban ? ' style="background-image:url(\'' + esc(ban) + '\')"' : '') + '><div class="hero-in"><div>' +
      '<p class="eyebrow">Créateur d’événements</p><h1>' + esc(nom()) + '</h1><p class="lead">' + esc(slogan) + '</p>' +
      '<div class="garanties"><div class="garantie">' + ic('billet') + '<span>Inscription en<br>quelques clics</span></div>' +
      '<div class="garantie">' + ic('bouclier') + '<span>Organisateur<br>identifié</span></div>' +
      '<div class="garantie">' + ic('cloche') + '<span>Ajout à votre<br>agenda</span></div></div>' +
      '<button class="btn or" type="button" data-nav="cartes">' + ic('calendrier') + 'Voir les prochains événements</button></div>' +
      '<div class="hero-art">' + scene() + '</div></div></section>';
  }
  function onglets() {
    var defs = [['a_venir', 'À venir'], ['termine', 'Terminés']];
    if (inscriptionsOuvertes()) defs.push(['mes', 'Mes inscriptions']);
    return '<div class="ongletsT" role="tablist" aria-label="Période">' + defs.map(function (d) {
      return '<button type="button" role="tab" class="chip" data-onglet="' + d[0] + '" aria-selected="' + (etat.onglet === d[0]) + '">' + d[1] + ' <span class="n">' + compte(d[0]) + '</span></button>';
    }).join('') + '</div>';
  }
  function optionsMois() {
    var cles = []; parOnglet().forEach(function (e) { var k = cleMois(e); if (k && cles.indexOf(k) < 0) cles.push(k); });
    cles.sort();
    return '<option value="">Tous les mois</option>' + cles.map(function (k) { return '<option value="' + k + '"' + (String(k) === etat.mois ? ' selected' : '') + '>' + esc(libMois(k)) + '</option>'; }).join('');
  }
  function categories() {
    var v = []; parOnglet().forEach(function (e) { var c = categorie(e); if (v.indexOf(c) < 0) v.push(c); });
    return v.sort();
  }
  function carte(e) {
    var d = dateDe(e), r = restantes(e), m = placesMax(e), n = inscrits(e), img = couverture(e), term = statut(e) === 'termine';
    var pct = m && n != null ? Math.min(100, Math.round(n / m * 100)) : null;
    var pastille = term ? 'Terminé' : statut(e) === 'en_cours' ? 'En cours' : (r != null && r <= 0) ? 'Complet' : (r != null && r <= 5) ? 'Plus que ' + r + ' place' + (r > 1 ? 's' : '') : enLigne(e) ? 'En ligne' : '';
    var alerte = !term && r != null && r <= 5;
    return '<article class="carte' + (term ? ' termine' : '') + '"><button class="vue" type="button" data-ev="' + e.id + '" aria-label="Voir l’événement : ' + esc(e.titre) + '">' +
      (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : '<span class="affiche-vide">' + ic('calendrier') + '</span>') +
      (d ? '<span class="datebadge"><b>' + d.getDate() + '</b><small>' + MOIS[d.getMonth() + 1].slice(0, 3) + '</small></span>' : '') +
      (pastille ? '<span class="etat' + (alerte ? ' alerte' : '') + '">' + pastille + '</span>' : '') + '</button>' +
      '<div class="corps"><span class="badge">' + esc(categorie(e)) + '</span><h3>' + esc(e.titre) + '</h3>' +
      '<div class="lieu">' + ic(enLigne(e) ? 'ecran' : 'lieu') + '<span>' + esc(dateLongue(e)) + (texte(e.heure_debut) ? ', ' + esc(e.heure_debut) : '') + '<br>' + (enLigne(e) ? 'En ligne' : esc([e.lieu, e.ville].filter(Boolean).join(', ') || 'Lieu à confirmer')) + '</span></div>' +
      '<div class="prix">' + esc(prixTexte(e)) + '</div>' +
      (pct != null ? '<div class="jauge' + (r <= 0 ? ' pleine' : '') + '" role="img" aria-label="' + n + ' places réservées sur ' + m + '"><i style="width:' + pct + '%"></i></div><div class="places">' + (r <= 0 ? 'Aucune place disponible' : r + ' place' + (r > 1 ? 's' : '') + ' sur ' + m) + '</div>' : '') +
      '<div class="actions"><button class="btn" type="button" data-ev="' + e.id + '">Détails</button>' + boutonAction(e, 'or', etat.onglet === 'mes') + '</div></div></article>';
  }
  function ligneAgenda(e) {
    var d = dateDe(e);
    return '<li class="ev"><div class="datebloc">' + (d ? '<b>' + d.getDate() + '</b><small>' + MOIS[d.getMonth() + 1].slice(0, 3) + '</small>' : '<b>·</b><small>bientôt</small>') + '</div>' +
      '<div><h3>' + esc(e.titre) + '</h3><div class="meta">' + esc(d ? JOURS[d.getDay()] : '') + ' · ' + esc(horaire(e)) + ' · ' + (enLigne(e) ? 'En ligne' : esc([e.lieu, e.ville].filter(Boolean).join(', ') || 'Lieu à confirmer')) + '</div>' +
      '<div class="meta">' + esc(categorie(e)) + '</div></div>' +
      '<div class="droite"><span class="prix">' + esc(prixTexte(e)) + '</span><button class="btn" type="button" data-ev="' + e.id + '">Détails</button></div></li>';
  }
  function corpsListe() {
    var l = filtrer(), total = l.length, pages = Math.max(1, Math.ceil(total / PAR_PAGE));
    if (etat.page > pages) etat.page = pages;
    var cats = categories();
    var act = [];
    if (etat.q.trim()) act.push(['q', 'Recherche : ' + etat.q.trim()]);
    if (etat.cat) act.push(['cat', 'Catégorie : ' + etat.cat]);
    if (etat.mois) act.push(['mois', 'Mois : ' + libMois(Number(etat.mois))]);
    if (etat.format) act.push(['format', etat.format === 'ligne' ? 'En ligne' : 'Sur place']);
    if (etat.prix) act.push(['prix', etat.prix === 'gratuit' ? 'Gratuit' : 'Payant']);
    var h = '<div class="barre"><div class="chips" role="group" aria-label="Catégories"><button class="chip" type="button" data-cat="" aria-pressed="' + (!etat.cat) + '">Toutes</button>' +
      cats.map(function (c) { return '<button class="chip" type="button" data-cat="' + esc(c) + '" aria-pressed="' + (etat.cat === c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
      '<div class="vues" role="group" aria-label="Affichage"><button type="button" data-vue="cartes" aria-pressed="' + (etat.vue === 'cartes') + '">' + ic('grille') + 'Cartes</button><button type="button" data-vue="agenda" aria-pressed="' + (etat.vue === 'agenda') + '">' + ic('liste') + 'Agenda</button></div></div>' +
      '<div class="actifs" aria-live="polite">' + act.map(function (a) { return '<button class="actif" type="button" data-retirer="' + a[0] + '" aria-label="Retirer le filtre : ' + esc(a[1]) + '">' + esc(a[1]) + ic('croix') + '</button>'; }).join('') + (act.length > 1 ? '<button class="lienor" type="button" data-raz>Tout réinitialiser</button>' : '') + '</div>' +
      '<h2 class="sectitre" id="sectMain">' + (etat.onglet === 'termine' ? 'Événements passés' : etat.onglet === 'mes' ? 'Mes inscriptions' : 'Nos prochains événements') + '<small>' + total + ' événement' + (total > 1 ? 's' : '') + '</small></h2>';
    if (!total) {
      return h + '<div class="vide"><b>' + (etat.evts.length ? 'Aucun événement ne correspond' : 'Aucun événement publié pour le moment') + '</b>' + (etat.evts.length ? 'Essayez un autre mois, une autre catégorie, ou réinitialisez les filtres.' : 'Revenez bientôt : de nouveaux rendez-vous seront annoncés.') +
        (act.length ? '<div style="margin-top:12px"><button class="btn or" type="button" data-raz style="flex:0 0 auto">Réinitialiser les filtres</button></div>' : '') + '</div>';
    }
    var vis = etat.vue === 'agenda' ? l : l.slice((etat.page - 1) * PAR_PAGE, etat.page * PAR_PAGE);
    if (etat.vue === 'cartes') h += '<div class="grille">' + vis.map(carte).join('') + '</div>';
    else {
      var dernier = null, corps = '';
      vis.forEach(function (e) {
        var k = cleMois(e);
        if (etat.tri === 'date' && k !== dernier) { if (dernier !== null) corps += '</ul>'; corps += '<h3 class="mois">' + esc(k ? libMois(k) : 'Date à confirmer') + '</h3><ul class="agenda">'; dernier = k; }
        else if (etat.tri !== 'date' && dernier === null) { corps += '<ul class="agenda">'; dernier = 0; }
        corps += ligneAgenda(e);
      });
      h += corps + '</ul>';
    }
    if (etat.vue === 'cartes' && pages > 1) {
      var p = ''; for (var i = 1; i <= pages; i++) p += '<button class="pg" type="button" data-page="' + i + '"' + (i === etat.page ? ' aria-current="page"' : '') + ' aria-label="Page ' + i + '">' + i + '</button>';
      h += '<div class="pied"><span class="compte">' + ((etat.page - 1) * PAR_PAGE + 1) + ' à ' + Math.min(total, etat.page * PAR_PAGE) + ' sur ' + total + '</span><div class="pages"><button class="pg" type="button" data-page="' + (etat.page - 1) + '"' + (etat.page === 1 ? ' disabled' : '') + ' aria-label="Page précédente">' + ic('gauche') + '</button>' + p +
        '<button class="pg" type="button" data-page="' + (etat.page + 1) + '"' + (etat.page === pages ? ' disabled' : '') + ' aria-label="Page suivante">' + ic('droite') + '</button></div></div>';
    } else h += '<div class="pied"><span class="compte">' + total + ' événement' + (total > 1 ? 's' : '') + ' affiché' + (total > 1 ? 's' : '') + '</span></div>';
    return h;
  }
  function recherche() {
    return '<div class="recherche" role="search"><label class="champ" for="evb-q">Rechercher un événement<input type="search" id="evb-q" placeholder="Titre, lieu ou thème" autocomplete="off" value="' + esc(etat.q) + '"></label>' +
      '<label for="evb-mois">Mois<select id="evb-mois">' + optionsMois() + '</select></label>' +
      '<label for="evb-format">Format<select id="evb-format"><option value="">Tous les formats</option><option value="presentiel"' + (etat.format === 'presentiel' ? ' selected' : '') + '>Sur place</option><option value="ligne"' + (etat.format === 'ligne' ? ' selected' : '') + '>En ligne</option></select></label>' +
      '<label for="evb-prix">Prix<select id="evb-prix"><option value="">Tous les prix</option><option value="gratuit"' + (etat.prix === 'gratuit' ? ' selected' : '') + '>Gratuit</option><option value="payant"' + (etat.prix === 'payant' ? ' selected' : '') + '>Payant</option></select></label>' +
      '<label for="evb-tri">Trier par<select id="evb-tri"><option value="date">Date</option><option value="prix-asc"' + (etat.tri === 'prix-asc' ? ' selected' : '') + '>Prix croissant</option><option value="prix-desc"' + (etat.tri === 'prix-desc' ? ' selected' : '') + '>Prix décroissant</option><option value="places"' + (etat.tri === 'places' ? ' selected' : '') + '>Places restantes</option></select></label></div>';
  }
  /* Réglages de la boutique (lot 4A) : livraison, minimum, délais, informations légales — rien si la boutique n'a rien réglé. */
  function rp(nom, opt) { var m = window.BoutiqueReglagesPublic; return m ? m[nom](opt) : ''; }
  function pied() {
    var i = etat.init, adresse = [i.adresse, i.code_postal, i.vitrine_ville || i.ville, i.vitrine_pays || i.pays].filter(Boolean).join(', ');
    var reseaux = rub('reseaux_sociaux') ? objet(i.reseaux_sociaux) : {}, liens = [];
    if (rub('reseaux_sociaux') && lienSur(i.site_web)) liens.push(['Web', lienSur(i.site_web), 'Site web']);
    Object.keys(reseaux).forEach(function (k) { var u = lienSur(reseaux[k]); if (u) liens.push([k.slice(0, 2).toUpperCase(), u, k.charAt(0).toUpperCase() + k.slice(1)]); });
    var cats = categories().slice(0, 6);
    return '<footer class="site-pied" aria-label="Bas de page"><div class="pied-in"><div class="pied-grille">' +
      '<div class="pied-marque"><div class="logo-pied">' + esc(nom()) + '</div><p>' + esc((rub('a_propos') ? texte(i.description).slice(0, 140) : '') || 'L’agenda en ligne de la communauté : ateliers, rencontres, concerts et formations.') + '</p>' +
      (liens.length ? '<div class="reseaux" role="group" aria-label="Liens">' + liens.slice(0, 6).map(function (l) { return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(l[2]) + '">' + esc(l[0]) + '</a>'; }).join('') + '</div>' : '') + '</div>' +
      '<nav class="pied-col" aria-label="Explorer"><h4>Explorer</h4><ul><li><button type="button" data-nav="cartes">Prochains événements</button></li><li><button type="button" data-nav="agenda">Agenda par mois</button></li><li><a href="annuaire.html">Annuaire des initiatives</a></li><li><a href="vitrines.html">Toutes les boutiques</a></li></ul></nav>' +
      '<nav class="pied-col" aria-label="Catégories"><h4>Catégories</h4><ul>' + (cats.length ? cats.map(function (c) { return '<li><button type="button" data-pied-cat="' + esc(c) + '">' + esc(c) + '</button></li>'; }).join('') : '<li><span class="aide">Bientôt</span></li>') + '</ul></nav>' +
      (rub('contact') ? '<div class="pied-col pied-contact"><h4>Nous contacter</h4><p>Une question sur un événement ? Écrivez-nous par la messagerie de la plateforme.</p>' +
      (adresse ? '<address>' + esc(adresse) + (texte(i.vitrine_horaires) ? '<br>' + esc(i.vitrine_horaires) : '') + '</address>' : '') +
      '<a class="ecrire" href="' + lienMessage('contact') + '">Nous écrire</a></div>' : '') + '</div>' +
      '<div class="pied-bas"><p class="copy">© ' + new Date().getFullYear() + ' ' + esc(nom()) + '. Boutique propulsée par Diaspo’Actif.</p></div>' + rp('htmlLegal') + '</div></footer>';
  }
  function page() {
    return entete() + hero() + '<main class="wrap"><div id="catalogue">' + onglets() + recherche() + '<div id="liste">' + corpsListe() + '</div></div></main>' + pied() +
      '<div class="overlay" id="evOv" role="dialog" aria-modal="true" aria-labelledby="eTitle"><div class="sheet"><button class="close" type="button" data-close aria-label="Fermer la fiche">' + ic('croix') + '</button><h2 id="eTitle"></h2><div id="eBody"></div></div></div>';
  }
  function majListe() {
    var z = document.getElementById('liste'); if (!z) return;
    z.innerHTML = corpsListe();
    var m = document.getElementById('evb-mois'); if (m) m.innerHTML = optionsMois();
    var vc = document.getElementById('navCartes'), va = document.getElementById('navAgenda');
    if (vc) vc.setAttribute('aria-current', String(etat.vue === 'cartes')); if (va) va.setAttribute('aria-current', String(etat.vue === 'agenda'));
  }
  function redessiner() { app.innerHTML = page(); }

  /* ── fiche d'événement ── */
  function ouvrir(id, depuis) {
    var e = etat.evts.filter(function (x) { return Number(x.id) === Number(id); })[0]; if (!e) return;
    etat.courant = e; etat.ouvreur = depuis || document.activeElement;
    document.getElementById('eTitle').textContent = e.titre;
    document.getElementById('evOv').classList.add('open');
    fiche(e, []);
    document.querySelector('#evOv [data-close]').focus();
    libererFiche = window.BoutiqueA11y ? BoutiqueA11y.piege(document.getElementById('evOv'), { restaurer: false, ouvreur: etat.ouvreur }) : null; /* lot 4D : Tab reste dans la fiche */
    api('GET', '/evenements/' + e.id).then(function (r) { if (etat.courant && etat.courant.id === e.id) fiche(e, r.cagnottes || []); }).catch(function () { /* la fiche reste complète sans les cagnottes */ });
  }
  function fiche(e, cagnottes) {
    etat.cagn = cagnottes;
    var img = couverture(e), d = dateDe(e), prog = programme(e), r = restantes(e);
    var org = texte(e.organisateur_externe_nom);
    var wa = lienSur(e.whatsapp_lien), info = lienSur(e.lien_plus_info), desc = enTexte(e.description);
    var h = '<div class="fiche"><div><div class="grand">' + (img ? '<img src="' + esc(img) + '" alt="">' : '<span class="affiche-vide">' + ic('calendrier') + '</span>') +
      (d ? '<span class="datebadge"><b>' + d.getDate() + '</b><small>' + MOIS[d.getMonth() + 1].slice(0, 3) + '</small></span>' : '') + '</div>' +
      '<div class="faits"><div><b>Date</b>' + esc(dateLongue(e)) + (e.date_fin && String(e.date_fin).slice(0, 10) !== String(e.date_evt).slice(0, 10) ? ' au ' + esc(String(e.date_fin).slice(0, 10).split('-').reverse().join('/')) : '') + '</div>' +
      '<div><b>Horaires</b>' + esc(horaire(e)) + '</div>' +
      '<div><b>Lieu</b>' + (enLigne(e) ? 'En ligne' : esc([e.lieu, e.ville, e.pays].filter(Boolean).join(', ') || 'À confirmer')) + '</div>' +
      '<div><b>Tarif</b>' + esc(prixTexte(e)) + '</div>' +
      (placesMax(e) ? '<div><b>Places</b>' + (r != null ? (r <= 0 ? 'Complet' : r + ' restante' + (r > 1 ? 's' : '') + ' sur ' + placesMax(e)) : placesMax(e) + ' places') + '</div>' : '') +
      (texte(e.langue) ? '<div><b>Langue</b>' + esc(langue(e.langue)) + '</div>' : '') + '</div></div>' +
      '<div><span class="badge">' + esc(categorie(e)) + '</span>' + (org ? '<p class="aide">Organisé par ' + esc(org) + '</p>' : '') +
      (desc ? '<p class="histoire" style="margin-top:10px">' + esc(desc) + '</p>' : '<p class="histoire" style="margin-top:10px">L’organisateur n’a pas encore ajouté de description.</p>');
    if (prog.length) {
      h += '<h3 class="st" style="margin-top:6px">Programme</h3>';
      prog.forEach(function (j, k) {
        var jour = j.date_debut ? new Date(j.date_debut + 'T12:00:00') : null;
        h += '<div class="prog-jour">Journée ' + (k + 1) + (jour && !isNaN(jour) ? ' · ' + esc(JOURS[jour.getDay()] + ' ' + jour.getDate() + ' ' + MOIS[jour.getMonth() + 1]) : '') + '</div><ul class="prog">' +
          liste(j.etapes).map(function (s) { return '<li><b>' + esc(texte(s.heure_debut) + (texte(s.heure_fin) ? ' – ' + texte(s.heure_fin) : '')) + '</b><span>' + esc(s.titre || '') + '</span></li>'; }).join('') + '</ul>';
      });
    }
    h += '</div></div><div class="resa" id="resa"><h3>' + (statut(e) === 'termine' ? 'Événement terminé' : infoSeule(e) ? 'Événement informatif' : (payant(e) ? 'Réserver' : 'S’inscrire')) + '</h3>' +
      '<p class="aide" style="margin-top:0">' + (statut(e) === 'termine' ? 'Cet événement a eu lieu : les inscriptions sont closes.' : infoSeule(e) ? 'Aucune inscription n’est demandée pour cet événement.' : 'L’inscription se termine sur la page sécurisée de la plateforme ou chez l’organisateur. Aucun paiement n’est demandé sur cette page.') + '</p>' +
      '<div class="rang">' + boutonAction(e, 'or', true) +
      (statut(e) !== 'termine' ? '<button class="btn" type="button" data-agenda="' + e.id + '">' + (etat.agendaIds.indexOf(Number(e.id)) >= 0 ? 'Dans mon agenda' : 'Ajouter à mon agenda') + '</button>' : '') +
      '<button class="btn" type="button" data-partager="' + e.id + '">Partager</button>' +
      (info && !infoSeule(e) ? '<a class="btn" href="' + esc(info) + '" target="_blank" rel="noopener noreferrer">Plus d’informations</a>' : '') +
      (wa ? '<a class="btn" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">Chaîne WhatsApp</a>' : '') +
      '<a class="btn" href="evenements.html?evt=' + e.id + '">Page complète</a></div>' +
      (cagnottes.length ? '<h3 class="st">Cagnottes liées</h3>' + cagnottes.map(function (c) { return '<div class="cagnotte"><b>' + esc(c.titre) + '</b><a class="btn or" style="flex:0 0 auto" href="cagnotte.html?slug=' + encodeURIComponent(c.slug) + '">Participer</a></div>'; }).join('') : '') + '</div>';
    document.getElementById('eBody').innerHTML = h;
  }
  var libererFiche = null;
  function fermer() {
    var ov = document.getElementById('evOv'); if (!ov) return;
    ov.classList.remove('open');
    if (libererFiche) { libererFiche(); libererFiche = null; }
    if (etat.ouvreur && document.contains(etat.ouvreur) && etat.ouvreur.focus) etat.ouvreur.focus();
    etat.courant = null;
  }
  /* Inscription gratuite directe et annulation : mêmes routes que le reste de la plateforme (rejoindre / quitter). */
  function majApresInscription(e) {
    var bloc = document.getElementById('liste'); if (bloc) majListe();
    var onglets_ = document.querySelector('.ongletsT'); if (onglets_) onglets_.outerHTML = onglets();
    if (etat.courant && Number(etat.courant.id) === Number(e.id)) fiche(etat.courant, etat.cagn || []);
  }
  function evenementPar(id) { return etat.evts.filter(function (x) { return Number(x.id) === Number(id); })[0]; }
  function inscrire(id, bouton) {
    var e = evenementPar(id); if (!e) return;
    if (bouton) bouton.disabled = true;
    api('POST', '/evenements/' + id + '/rejoindre', {}).then(function () {
      if (!estInscrit(e)) { etat.inscrits.push(Number(id)); if (e.nb_participants != null) e.nb_participants = Number(e.nb_participants) + 1; }
      toast('Inscription enregistrée.');
      majApresInscription(e);
    }).catch(function (err) { if (bouton) bouton.disabled = false; toast((err && err.message) || 'Inscription impossible pour le moment.'); });
  }
  function quitter(id, bouton) {
    var e = evenementPar(id); if (!e) return;
    if (!window.confirm('Annuler votre inscription à « ' + e.titre + ' » ?')) return;
    if (bouton) bouton.disabled = true;
    api('DELETE', '/evenements/' + id + '/quitter').then(function () {
      etat.inscrits = etat.inscrits.filter(function (x) { return x !== Number(id); });
      if (e.nb_participants != null && Number(e.nb_participants) > 0) e.nb_participants = Number(e.nb_participants) - 1;
      if (etat.onglet === 'mes' && !etat.inscrits.length) etat.onglet = 'a_venir';
      toast('Inscription annulée.');
      majApresInscription(e);
    }).catch(function (err) { if (bouton) bouton.disabled = false; toast((err && err.message) || 'Annulation impossible pour le moment.'); });
  }
  function ajouterAgenda(id) {
    if (!etat.moi) { location.href = 'login.html?next=' + encodeURIComponent('boutique-evenements.html?id=' + etat.init.id); return; }
    api('POST', '/evenements/' + id + '/ajouter-agenda').then(function () {
      if (etat.agendaIds.indexOf(Number(id)) < 0) etat.agendaIds.push(Number(id));
      toast('Ajouté à votre agenda.');
      if (etat.courant && Number(etat.courant.id) === Number(id)) { var b = document.querySelector('#resa [data-agenda]'); if (b) b.textContent = 'Dans mon agenda'; }
    }).catch(function (e) { toast(e.message || 'Ajout impossible pour le moment.'); });
  }
  function partager(id) {
    var url = location.origin + '/evenements.html?evt=' + id, e = etat.evts.filter(function (x) { return Number(x.id) === Number(id); })[0];
    if (navigator.share) { navigator.share({ title: e ? e.titre : 'Événement', url: url }).catch(function () {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { toast('Lien copié.'); }, function () { toast(url); });
    else toast(url);
  }
  function versCatalogue(vue) {
    if (vue) { etat.vue = vue; etat.page = 1; majListe(); }
    var c = document.getElementById('sectMain'); if (c) c.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  /* ── interactions ── */
  app.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-ev],[data-nav],[data-onglet],[data-cat],[data-vue],[data-retirer],[data-raz],[data-page],[data-close],[data-agenda],[data-partager],[data-pied-cat],[data-inscrire],[data-quitter]');
    if (!t) { if (ev.target.id === 'evOv') fermer(); return; }
    if (t.dataset.ev) return ouvrir(t.dataset.ev, t);
    if (t.hasAttribute('data-close')) return fermer();
    if (t.dataset.agenda) return ajouterAgenda(t.dataset.agenda);
    if (t.dataset.inscrire) return inscrire(t.dataset.inscrire, t);
    if (t.dataset.quitter) return quitter(t.dataset.quitter, t);
    if (t.dataset.partager) return partager(t.dataset.partager);
    if (t.dataset.nav) {
      if (t.dataset.nav === 'accueil') return window.scrollTo({ top: 0, behavior: 'smooth' });
      return versCatalogue(t.dataset.nav);
    }
    if (t.dataset.onglet) { etat.onglet = t.dataset.onglet; etat.cat = ''; etat.mois = ''; etat.page = 1; redessiner(); return; }
    if (t.dataset.piedCat !== undefined) { etat.cat = t.dataset.piedCat; etat.page = 1; majListe(); return versCatalogue(); }
    if (t.dataset.cat !== undefined) { etat.cat = t.dataset.cat; etat.page = 1; return majListe(); }
    if (t.dataset.vue) { etat.vue = t.dataset.vue; etat.page = 1; return majListe(); }
    if (t.dataset.retirer) {
      var k = t.dataset.retirer; if (k === 'q') { etat.q = ''; var i = document.getElementById('evb-q'); if (i) i.value = ''; } else etat[k] = '';
      var sel = { mois: 'evb-mois', format: 'evb-format', prix: 'evb-prix' }[k]; if (sel && document.getElementById(sel)) document.getElementById(sel).value = '';
      etat.page = 1; return majListe();
    }
    if (t.hasAttribute('data-raz')) { etat.q = ''; etat.cat = ''; etat.mois = ''; etat.format = ''; etat.prix = ''; etat.page = 1; return redessiner(); }
    if (t.dataset.page) { etat.page = Number(t.dataset.page); majListe(); return versCatalogue(); }
  });
  app.addEventListener('input', function (ev) { if (ev.target.id === 'evb-q') { etat.q = ev.target.value; etat.page = 1; majListe(); } });
  app.addEventListener('change', function (ev) {
    var m = { 'evb-mois': 'mois', 'evb-format': 'format', 'evb-prix': 'prix', 'evb-tri': 'tri' }[ev.target.id];
    if (m) { etat[m] = ev.target.value; etat.page = 1; majListe(); }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') fermer(); });
  /* Aperçu instantané du centre de création : couleurs reçues du parent (même origine), uniquement quand la page est intégrée. */
  window.addEventListener('message', function (ev) {
    if (window.parent === window || ev.origin !== location.origin || !ev.data || ev.data.type !== 'da-vitrine-style') return;
    appliquerCouleurs(ev.data.style || {});
  });

  /* ── chargement ── */
  function charger() {
    var q = new URLSearchParams(location.search), ref = q.get('id') || q.get('slug');
    if (!ref) return Promise.reject(new Error('Aucune boutique indiquée.'));
    return api('GET', '/initiatives/' + encodeURIComponent(ref) + (/[?&]preview=draft(&|$)/.test(location.search) ? '?preview=draft' : '')).then(function (d) {
      etat.init = d.initiative || d;
      if (window.BoutiqueReglagesPublic) window.BoutiqueReglagesPublic.definir(etat.init.vitrine_reglages);
      appliquerCouleurs(objet(etat.init.vitrine_style_json));
      return Promise.all([
        api('GET', '/evenements?owner=' + encodeURIComponent(etat.init.owner_user_id) + '&boutique=1').then(function (r) {
          etat.evts = (r.evenements || []).filter(function (e) { return Number(e.owner_user_id) === Number(etat.init.owner_user_id) && e.statut !== 'brouillon'; });
        }).catch(function () { etat.evts = []; }),
        api('GET', '/auth/me').then(function (r) { etat.moi = r.user || null; }).catch(function () {}).then(function () {
          if (!etat.moi) return;
          return api('GET', '/evenements/participants/mine').then(function (r) { etat.inscrits = (r.inscriptions || []).map(function (i) { return Number(i.evenement_id); }); }).catch(function () {});
        }),
        api('GET', '/agenda/evenements-ajoutes').then(function (r) { etat.agendaIds = (r.ids || []).map(Number); }).catch(function () {})
      ]);
    });
  }
  function demarrer() {
    var apres = function (maintenance) {
      if (maintenance) return;
      charger().then(function () {
        document.title = nom() + ' — Événements';
        if (!compte('a_venir') && compte('termine')) etat.onglet = 'termine';
        redessiner();
      }).catch(function (e) {
        app.innerHTML = '<p class="evb-chargement">' + esc(e && e.status === 404 ? 'Cette boutique est introuvable.' : (e && e.message) || 'Impossible de charger la boutique.') + ' <a href="vitrines.html" style="color:var(--gold)">Voir les boutiques</a></p>';
      });
    };
    if (window.DA_verifierMaintenanceBoutique) window.DA_verifierMaintenanceBoutique(app).then(apres); else apres(false);
  }
  demarrer();
})();
