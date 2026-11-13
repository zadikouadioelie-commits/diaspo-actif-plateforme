/* Boutique « Projet Impact » — boutique-impact.html, 2026-11-12 (lot E).
   Lit : /initiatives/:id (présentation, vision, résultats, besoins, réalisations, état des rubriques),
         /cagnottes/publiques?owner_user_id=… (projets à soutenir, avancement de la collecte),
         /initiatives/:id/partenaires, /auth/me (lien « Mon compte »).
   N'écrit rien. Le soutien passe par la page de cagnotte de la plateforme (cagnotte.html?slug=…) et les contacts par la messagerie :
   aucun paiement n'est codé ici. Respecte les choix du créateur de chaque cagnotte (montants et contributeurs masqués si demandé).
   Couleurs : style de la boutique (vitrine_style_json.couleurs), sinon Marine, Orange et Vert.
   Paramètre d'adresse : ?id=… (ou ?slug=…). */
(function () {
  'use strict';
  var app = document.getElementById('imp-app');
    var PAR_PAGE = 6;
  var etat = { init: null, camp: [], dons: [], partenaires: [], evts: [], moi: null, cat: '', statut: '', affiches: PAR_PAGE };

  /* ── utilitaires ── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(methode, chemin, corps) {
    return fetch('/api' + chemin, { method: methode, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Erreur.'); e.status = r.status; throw e; } return j; }); });
  }
  function texte(s) { return String(s == null ? '' : s).trim(); }
  function lienSur(u) { var s = texte(u); if (!s) return ''; if (/^https?:\/\//i.test(s)) return s; if (/^[\w.-]+\.[a-z]{2,}/i.test(s)) return 'https://' + s; return ''; }
  /* Adresse d'image : http(s), chemin du site ou image intégrée ; tout le reste (javascript:, etc.) est refusé. */
  function imageSure(u) {
    var s = texte(u);
    if (!s) return '';
    if (/^(https?:\/\/|\/)/i.test(s) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s) || /^[\w.\-\/]+\.(png|jpe?g|webp|gif|svg)$/i.test(s)) return s;
    return '';
  }
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
  /* Les textes riches sont affichés en texte simple : jamais de balises venues de la base. */
  function enTexte(html) {
    return String(html == null ? '' : html).replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
  }
  function paragraphes(t) {
    return enTexte(t).split(/\n{1,}/).map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
  }

  /* ── icônes filaires ── */
  var ICONES = {
    projet: '<path d="M4 20V9l8-5 8 5v11z"/><path d="M9 20v-6h6v6"/>',
    coeur: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    groupe: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-5.6 6-5.6s6 2 6 5.6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.2c2.5.2 4 1.9 4 4.8"/>',
    cible: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    message: '<path d="M4 5h16v11H9l-5 4z"/>',
    compte: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    main: '<path d="M7 12V6a1.5 1.5 0 0 1 3 0v5m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V13m0-2a1.5 1.5 0 0 1 3 0v4c0 4-3 6-6 6h-1c-2.5 0-4-1-5.5-3L4 14.5a1.6 1.6 0 0 1 2.5-2L7 13"/>'
  };
  function ic(nom) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[nom] || ICONES.projet) + '</svg>'; }

  /* ── couleurs : style de la boutique -> --c1 (principale), --c2 (accent des boutons), --c3 (réussite) ── */
  function rgb(h) { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(a) { return '#' + a.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join(''); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hex(x.map(function (v, i) { return v * (1 - t) + y[i] * t; })); }
  function lum(h) { var c = rgb(h).map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
  function appliquerCouleurs(style) {
    var c = (style && Array.isArray(style.couleurs) ? style.couleurs : []).filter(function (x) { return /^#[0-9a-f]{6}$/i.test(x); });
    var d = ['#0d2750', '#f47c20', '#1e9b4c'];
    var c1 = c[0] || d[0], c2 = c[1] || d[1], c3 = c[2] || d[2];
    var b = document.body.style;
    b.setProperty('--c1', c1); b.setProperty('--c2', c2); b.setProperty('--c3', c3);
    b.setProperty('--navy', c1); b.setProperty('--navy-fonce', mix(c1, '#000000', .28)); b.setProperty('--acc', c2); b.setProperty('--vert', c3);
    b.setProperty('--on-navy', lum(c1) > .45 ? '#0d1b2a' : '#ffffff');
    b.setProperty('--on-acc', lum(c2) > .4 ? '#0d1b2a' : '#ffffff');
    b.setProperty('--teinte', mix(c1, '#ffffff', .95)); b.setProperty('--ligne', mix(c1, '#ffffff', .88));
    b.setProperty('--fond-vert', mix(c3, '#ffffff', .88)); b.setProperty('--texte-vert', mix(c3, '#000000', .42));
  }

  /* ── état des rubriques (le créateur peut en désactiver) ── */
  function rubrique(cle) { var s = objet(etat.init.vitrine_modules_state)[cle]; return s ? !!s.actif : true; }

  /* ── cagnottes = projets à soutenir ── */
  function pourcent(c) { var p = Number(c.pourcentage); return c.objectif_montant ? (isFinite(p) ? p : 0) : null; }
  function argent(n, devise) {
    var v = Number(n) || 0, dv = /^[A-Z]{3}$/.test(texte(devise)) ? texte(devise) : 'EUR';
    try { return v.toLocaleString('fr-FR', { style: 'currency', currency: dv, maximumFractionDigits: v % 1 ? 2 : 0 }); } catch (e) { return v.toLocaleString('fr-FR') + ' ' + dv; }
  }
  function montantsVisibles(c) { return Number(c.afficher_montants) !== 0; }
  function contributeursVisibles(c) { return Number(c.afficher_participants) !== 0; }
  function joursRestants(c) {
    if (!c.date_fin) return null;
    var fin = new Date(String(c.date_fin).slice(0, 10) + 'T23:59:59'); if (isNaN(fin)) return null;
    return Math.ceil((fin.getTime() - Date.now()) / 86400000);
  }
  function estOuverte(c) { return c.statut === 'active'; }
  function categorieDe(c) { return texte(c.categorie) || 'Autre'; }
  function projetsPublics() {
    /* Les dons récurrents et occasionnels ne sont pas des projets : ils servent au bouton « Faire un don ». */
    return etat.camp;
  }
  function categories() {
    var m = {}, ordre = [];
    projetsPublics().forEach(function (c) { var k = categorieDe(c); if (!m[k]) { m[k] = 0; ordre.push(k); } m[k]++; });
    return ordre.sort().map(function (k) { return { nom: k, n: m[k] }; });
  }
  function filtres() {
    var v = projetsPublics().filter(function (c) {
      if (etat.cat && categorieDe(c) !== etat.cat) return false;
      if (etat.statut === 'ouverts') return estOuverte(c);
      if (etat.statut === 'termines') return !estOuverte(c);
      return true;
    });
    /* Collectes ouvertes d'abord, puis les plus récentes. */
    return v.slice().sort(function (a, b) { return (estOuverte(b) ? 1 : 0) - (estOuverte(a) ? 1 : 0); });
  }

  /* ── totaux affichés dans le bandeau (uniquement ce que chaque créateur accepte de montrer) ── */
  function totaux() {
    var camp = projetsPublics(), reals = etatReals();
    var parDevise = {}, ordre = [], contrib = 0, contribOk = false;
    camp.forEach(function (c) {
      if (montantsVisibles(c)) { var d = texte(c.devise) || 'EUR'; if (!(d in parDevise)) { parDevise[d] = 0; ordre.push(d); } parDevise[d] += Number(c.montant_collecte) || 0; }
      if (contributeursVisibles(c)) { contrib += Number(c.nb_contributeurs) || 0; contribOk = true; }
    });
    var t = [];
    var nbProjets = camp.length + reals.length;
    if (nbProjets) t.push({ icone: 'projet', valeur: String(nbProjets), libelle: nbProjets > 1 ? 'projets présentés' : 'projet présenté' });
    var somme = ordre.filter(function (d) { return parDevise[d] > 0; });
    if (somme.length) t.push({ icone: 'coeur', valeur: somme.map(function (d) { return argent(parDevise[d], d); }).join(' + '), libelle: 'collectés grâce à vous' });
    if (contribOk && contrib > 0) t.push({ icone: 'groupe', valeur: String(contrib), libelle: contrib > 1 ? 'soutiens reçus' : 'soutien reçu' });
    if (t.length < 3) liste(etat.init.vitrine_resultats_impact).slice(0, 3 - t.length).forEach(function (r) { if (texte(r && r.valeur)) t.push({ icone: 'cible', valeur: texte(r.valeur), libelle: texte(r.libelle) }); });
    return t;
  }
  function etatReals() { return rubrique('realisations') ? liste(etat.init.realisations_json || etat.init.realisations).filter(function (r) { return r && texte(r.titre); }) : []; }
  function resultats() { return rubrique('resultats_impact') ? liste(etat.init.vitrine_resultats_impact || etat.init.vitrine_resultats_impact_json).filter(function (r) { return r && texte(r.valeur); }) : []; }
  function besoins() { return rubrique('besoins_projet') ? liste(etat.init.besoins || etat.init.besoins_json).map(texte).filter(Boolean) : []; }
  function equipe() { return rubrique('equipe') ? liste(etat.init.vitrine_equipe_json).filter(function (m) { return m && texte(m.nom); }) : []; }
  function visionTexte() { return rubrique('vision_objectifs') ? enTexte(etat.init.vitrine_vision_objectifs) : ''; }
  function presentation() { return rubrique('a_propos') ? enTexte(etat.init.description || '') : ''; }

  /* ── morceaux de page ── */
  function nom() { return etat.init.boutique_nom || etat.init.nom; }
  function proprio() { return etat.init.owner_user_id; }
  function lienMessage(objetMsg) { return 'messagerie.html?with=' + proprio() + '&origine=vitrine&objet=' + encodeURIComponent(objetMsg); }
  function logoHtml() {
    var src = imageSure(etat.init.logo_url);
    return src ? '<img src="' + esc(src) + '" alt="">' : esc((nom() || '?').charAt(0).toUpperCase());
  }
  /* Rubriques ajoutées au lot 4C : cachées seulement si le propriétaire les a éteintes lui-même (voir boutique-rubriques.js). */
  function rubChoisie(cle) { return !window.BoutiqueRubriques || window.BoutiqueRubriques.active(etat.init.vitrine_modules_state, cle); }
  function galeriePhotos() {
    if (!rubChoisie('galerie_photos')) return [];
    return liste(etat.init.galerie_json).map(function (x) {
      if (typeof x === 'string') return { image: imageSure(x), titre: '' };
      return { image: imageSure(x.url || x.image), titre: texte(x.titre || x.legende) };
    }).filter(function (x) { return x.image; });
  }
  function evenementsAVenir() {
    if (!rubChoisie('evenements')) return [];
    return (etat.evts || []).filter(function (e) { return e.statut_temporel !== 'termine'; }).slice(0, 3);
  }
  function reseauxLiens() {
    if (!rubChoisie('reseaux_sociaux')) return [];
    var i = etat.init, out = [], rs = objet(i.reseaux_sociaux);
    if (lienSur(i.site_web)) out.push(['Site web', lienSur(i.site_web)]);
    Object.keys(rs).forEach(function (c) { var u = lienSur(rs[c]); if (u) out.push([c.charAt(0).toUpperCase() + c.slice(1), u]); });
    return out.slice(0, 8);
  }
  function rubriquesNav() {
    var n = [];
    if (projetsPublics().length || etatReals().length) n.push(['projets', 'Nos projets']);
    if (visionTexte() || presentation()) n.push(['vision', 'Notre vision']);
    if (equipe().length) n.push(['equipe', 'Équipe']);
    if (galeriePhotos().length) n.push(['galerie', 'Galerie']);
    if (evenementsAVenir().length) n.push(['evenements', 'Événements']);
    if (resultats().length) n.push(['resultats', 'Résultats']);
    if (besoins().length) n.push(['besoins', 'Besoins']);
    if (rubrique('partenaires') && etat.partenaires.length) n.push(['partenaires', 'Partenaires']);
    return n;
  }
  function entete() {
    var compteLien = etat.moi ? ('dashboard-' + (etat.moi.role === 'administrateur' ? 'administrateur' : etat.moi.role) + '.html') : 'login.html';
    return '<header class="top"><div class="top-in"><a class="logo" href="index.html"><span class="pastille">' + logoHtml() + '</span><b>' + esc(nom()) + '</b></a>' +
      '<nav class="nav" aria-label="Rubriques">' + rubriquesNav().map(function (r) { return '<a href="#' + r[0] + '">' + esc(r[1]) + '</a>'; }).join('') + '</nav>' +
      '<div class="tools"><a class="btn petit" href="' + compteLien + '">' + ic('compte') + '<span>' + (etat.moi ? 'Mon compte' : 'Connexion') + '</span></a></div></div></header>';
  }
  function hero() {
    var i = etat.init, ban = imageSure(i.vitrine_banniere_url);
    ban = ban && !/["'()\\]/.test(ban) ? ban : '';
    var slogan = texte(i.slogan) || texte(i.boutique_description) || enTexte(i.description).slice(0, 170) || 'Des projets pour changer les choses, avec vous.';
    var t = totaux();
    var premier = projetsPublics().length || etatReals().length;
    var lieu = [texte(i.ville), texte(i.pays)].filter(Boolean).join(', ');
    return '<section class="hero' + (ban ? ' image' : '') + '"' + (ban ? ' style="background-image:url(\'' + esc(ban) + '\')"' : '') + '><div class="hero-in"><div>' +
      '<p class="kicker">Projet à impact' + (lieu ? ' · ' + esc(lieu) : '') + '</p><h1>' + esc(nom()) + '</h1><p class="lead">' + esc(slogan) + '</p>' +
      '<div class="rang">' + (premier ? '<a class="btn acc" href="#projets">Voir les projets</a>' : '') +
      '<a class="btn clair" href="' + esc(lienMessage('Contact : ' + nom())) + '">' + ic('message') + 'Nous contacter</a></div></div>' +
      (t.length ? '<aside class="stats" aria-label="Chiffres clés">' + t.map(function (x) { return '<div class="stat"><span class="pict">' + ic(x.icone) + '</span><div><b>' + esc(x.valeur) + '</b><span>' + esc(x.libelle) + '</span></div></div>'; }).join('') + '</aside>' : '') +
      '</div></section>';
  }
  /* Filtre « Ouverts / Terminés » : proposé seulement quand la liste contient les deux sortes de projets. */
  function filtreStatut() {
    var p = projetsPublics(), o = p.filter(estOuverte).length;
    if (!o || o === p.length) return '';
    var defs = [['', 'Tous', p.length], ['ouverts', 'Collectes ouvertes', o], ['termines', 'Terminés', p.length - o]];
    return '<div class="statuts" role="group" aria-label="Statut des projets">' + defs.map(function (d) {
      return '<button type="button" class="statut-b" data-statut="' + d[0] + '" aria-pressed="' + (etat.statut === d[0]) + '">' + esc(d[1]) + ' <small>' + d[2] + '</small></button>';
    }).join('') + '</div>';
  }
  function tuilesCategories() {
    var cs = categories();
    if (cs.length < 2) return '';
    var tout = '<button type="button" class="cat" data-cat="" aria-pressed="' + (!etat.cat) + '"><b>Tous</b><small>' + projetsPublics().length + ' projet' + (projetsPublics().length > 1 ? 's' : '') + '</small></button>';
    return '<div class="cats" role="group" aria-label="Catégories de projets">' + tout + cs.map(function (c) {
      return '<button type="button" class="cat" data-cat="' + esc(c.nom) + '" aria-pressed="' + (etat.cat === c.nom) + '"><b>' + esc(c.nom) + '</b><small>' + c.n + ' projet' + (c.n > 1 ? 's' : '') + '</small></button>';
    }).join('') + '</div>';
  }
  function carte(c) {
    var img = imageSure(c.image_url), pct = pourcent(c), j = joursRestants(c), ouverte = estOuverte(c);
    var etiq = categorieDe(c);
    var atteint = pct != null && pct >= 100;
    var h = '<article class="carte"><div class="media">' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : '') + '<span class="etiquette">' + esc(etiq) + '</span></div><div class="corps">' +
      '<h3>' + esc(c.titre) + '</h3>';
    var desc = enTexte(c.description); if (desc) h += '<p>' + esc(desc) + '</p>';
    if (pct != null) {
      h += '<div class="prog" role="img" aria-label="' + pct + ' % de l’objectif"><span class="barre"><i style="width:' + Math.min(100, pct) + '%"></i></span><b>' + pct + ' %</b></div>';
      if (montantsVisibles(c)) h += '<div class="montant"><b>' + esc(argent(c.montant_collecte, c.devise)) + '</b> sur ' + esc(argent(c.objectif_montant, c.devise)) + '</div>';
    } else if (montantsVisibles(c) && Number(c.montant_collecte) > 0) {
      h += '<div class="montant"><b>' + esc(argent(c.montant_collecte, c.devise)) + '</b> collectés</div>';
    }
    if (atteint) h += '<span class="finance">Objectif atteint</span>';
    else if (c.statut === 'en_pause') h += '<span class="finance neutre">Collecte en pause</span>';
    else if (c.statut === 'expiree' || c.statut === 'terminee') h += '<span class="finance neutre">Collecte terminée</span>';
    var meta = [];
    if (contributeursVisibles(c) && Number(c.nb_contributeurs) > 0) meta.push('<span>' + Number(c.nb_contributeurs) + ' soutien' + (Number(c.nb_contributeurs) > 1 ? 's' : '') + '</span>');
    if (ouverte && j != null) meta.push('<span>' + (j > 1 ? j + ' jours restants' : j === 1 ? 'Dernier jour' : 'Se termine aujourd’hui') + '</span>');
    if (meta.length) h += '<div class="meta">' + meta.join('') + '</div>';
    h += '<a class="btn ' + (ouverte ? 'acc' : '') + ' petit" href="cagnotte.html?slug=' + encodeURIComponent(c.slug) + '">' + (ouverte ? 'Soutenir ce projet' : 'Voir le projet') + '</a>';
    return h + '</div></article>';
  }
  function listeProjets() {
    var v = filtres(), vus = v.slice(0, etat.affiches);
    return '<div class="cartes" id="imp-cartes">' + vus.map(carte).join('') + '</div>' +
      (v.length > vus.length ? '<div class="plus"><button type="button" class="btn" data-plus="1">Afficher plus de projets (' + (v.length - vus.length) + ')</button></div>' : '');
  }
  function blocProjets() {
    var camp = projetsPublics(), reals = etatReals(), h = '';
    h += '<section class="bloc" id="projets"><div class="sh"><h2>Nos projets à soutenir</h2><span class="nb">' + camp.length + ' projet' + (camp.length > 1 ? 's' : '') + '</span></div>';
    h += camp.length ? filtreStatut() + '<div id="imp-liste">' + listeProjets() + '</div>' : '<div class="vide">Aucune collecte n’est ouverte pour le moment. Vous pouvez tout de même contacter l’équipe pour proposer votre aide.</div>';
    h += '</section>';
    if (reals.length) {
      h += '<section class="bloc" id="realisations"><div class="sh"><h2>Nos réalisations</h2><span class="nb">' + reals.length + '</span></div><div class="realisations">' + reals.map(function (r) {
        var img = imageSure(r.image), lien = lienSur(r.lien), inner = (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : '') + '<div>' + (texte(r.categorie) ? '<small>' + esc(r.categorie) + '</small>' : '') + '<b>' + esc(r.titre) + '</b>' + (texte(r.description) ? '<p>' + esc(texte(r.description)) + '</p>' : '') + '</div>';
        return lien ? '<a class="real" href="' + esc(lien) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>' : '<div class="real">' + inner + '</div>';
      }).join('') + '</div></section>';
    }
    return h;
  }
  function blocVision() {
    var v = visionTexte(), p = presentation();
    if (!v && !p) return '';
    var deux = v && p;
    return '<section class="bloc" id="vision"><div class="sh"><h2>Notre vision</h2></div><div class="vision' + (deux ? '' : ' seul') + '">' +
      (p ? '<div class="texte"><h3>Qui nous sommes</h3>' + paragraphes(p) + '</div>' : '') +
      (v ? '<div class="texte"><h3>Nos objectifs</h3>' + paragraphes(v) + '</div>' : '') + '</div></section>';
  }
  function blocEquipe() {
    var m = equipe(); if (!m.length) return '';
    return '<section class="bloc" id="equipe"><div class="sh"><h2>Notre équipe</h2><span class="nb">' + m.length + '</span></div><div class="equipe">' + m.map(function (x) {
      var img = imageSure(x.photo);
      return '<div class="membre"><span class="avatar">' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : esc(texte(x.nom).charAt(0).toUpperCase())) + '</span><b>' + esc(texte(x.nom)) + '</b>' + (texte(x.fonction) ? '<small>' + esc(texte(x.fonction)) + '</small>' : '') + '</div>';
    }).join('') + '</div></section>';
  }
  function blocResultats() {
    var r = resultats(); if (!r.length) return '';
    return '<section class="bloc" id="resultats"><div class="sh"><h2>Notre impact en chiffres</h2></div><div class="resultats">' +
      r.map(function (x) { return '<div class="resultat"><b>' + esc(texte(x.valeur)) + '</b><span>' + esc(texte(x.libelle)) + '</span></div>'; }).join('') + '</div></section>';
  }
  function blocBesoins() {
    var b = besoins(); if (!b.length) return '';
    return '<section class="bloc" id="besoins"><div class="sh"><h2>De quoi avons-nous besoin ?</h2></div><div class="besoins">' + b.map(function (x) { return '<span class="besoin">' + esc(x) + '</span>'; }).join('') + '</div>' +
      '<p class="aide">Vous pouvez aider ? <a href="' + esc(lienMessage('Proposition d’aide : ' + nom())) + '">Écrivez-nous</a>.</p></section>';
  }
  function blocGalerie() {
    var g = galeriePhotos(); if (!g.length) return '';
    return '<section class="bloc" id="galerie"><div class="sh"><h2>Galerie photos</h2><span class="nb">' + g.length + '</span></div><div class="galerie-imp">' + g.slice(0, 12).map(function (x) {
      return '<figure><img loading="lazy" src="' + esc(x.image) + '" alt="' + esc(x.titre || 'Photo de ' + nom()) + '">' + (x.titre ? '<figcaption>' + esc(x.titre) + '</figcaption>' : '') + '</figure>';
    }).join('') + '</div></section>';
  }
  var MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function blocEvenements() {
    var ev = evenementsAVenir(); if (!ev.length) return '';
    return '<section class="bloc" id="evenements"><div class="sh"><h2>Événements à venir</h2><a class="btn petit" href="boutique-evenements.html?id=' + esc(etat.init.id) + '">Voir tous les événements</a></div><div class="evts-imp">' + ev.map(function (e) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(e.date_evt || ''));
      var d = m ? '<span class="evt-date"><b>' + Number(m[3]) + '</b>' + MOIS_C[Number(m[2]) - 1] + '</span>' : '<span class="evt-date"><b>?</b>date</span>';
      var lieu = [texte(e.ville), texte(e.pays)].filter(Boolean).join(', ');
      return '<a class="evt-imp" href="evenements.html?evt=' + esc(e.id) + '">' + d + '<span><b>' + esc(e.titre) + '</b>' + (lieu ? '<small>' + esc(lieu) + '</small>' : '') + '</span></a>';
    }).join('') + '</div></section>';
  }
  function blocReseaux() {
    var l = reseauxLiens(); if (!l.length) return '';
    return '<section class="bloc" id="reseaux"><div class="sh"><h2>Suivez-nous</h2></div><ul class="reseaux-imp">' + l.map(function (x) {
      return '<li><a class="btn" href="' + esc(x[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(x[0]) + '</a></li>';
    }).join('') + '</ul></section>';
  }
  function blocPartenaires() {
    if (!rubrique('partenaires') || !etat.partenaires.length) return '';
    return '<section class="bloc" id="partenaires"><div class="sh"><h2>Nos partenaires</h2></div><div class="partenaires">' + etat.partenaires.map(function (p) {
      var img = imageSure(p.logo_url), lien = lienSur(p.site_web);
      var inner = '<div class="logo-p">' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : '<span>' + esc(texte(p.nom).charAt(0).toUpperCase() || '?') + '</span>') + '</div><b>' + esc(p.nom) + '</b>' + (texte(p.type_partenaire) ? '<small>' + esc(p.type_partenaire) + '</small>' : '');
      return lien ? '<a class="part" href="' + esc(lien) + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit">' + inner + '</a>' : '<div class="part">' + inner + '</div>';
    }).join('') + '</div></section>';
  }
  function barreFinale() {
    var don = etat.dons[0], ouvertes = projetsPublics().filter(estOuverte);
    var cible = don ? 'cagnotte.html?slug=' + encodeURIComponent(don.slug) : (ouvertes.length === 1 ? 'cagnotte.html?slug=' + encodeURIComponent(ouvertes[0].slug) : '#projets');
    return '<section class="final" id="soutenir"><div class="lead"><b>Soutenez ' + esc(nom()) + '</b><span>Un don, du temps, une compétence ou un partenariat : chaque aide compte.</span></div>' +
      '<div class="rang">' + (don || ouvertes.length ? '<a class="btn acc" href="' + esc(cible) + '">' + ic('coeur') + (don ? 'Faire un don' : 'Soutenir un projet') + '</a>' : '') +
      '<a class="btn clair" href="' + esc(lienMessage('Demande de partenariat : ' + nom())) + '">' + ic('main') + 'Devenir partenaire</a></div></section>';
  }
  /* Réglages de la boutique (lot 4A) : livraison, minimum, délais, informations légales — rien si la boutique n'a rien réglé. */
  function rp(nom, opt) { var m = window.BoutiqueReglagesPublic; return m ? m[nom](opt) : ''; }
  function pied() {
    var i = etat.init, lieu = [texte(i.ville), texte(i.pays)].filter(Boolean).join(', ');
    return '<footer class="pied"><div class="pied-in"><div><b>' + esc(nom()) + '</b>' + (lieu ? '<div>' + esc(lieu) + '</div>' : '') + '</div>' +
      '<div>Boutique hébergée sur <a href="index.html">Diaspo’Actif</a></div></div>' + rp('htmlLegal') + '</footer>';
  }
  function page() {
    var vide = !projetsPublics().length && !etatReals().length && !visionTexte() && !presentation() && !equipe().length && !resultats().length && !besoins().length;
    return entete() + hero() + tuilesCategories() + '<main class="wrap">' +
      (vide ? '<section class="bloc"><div class="vide">Cette boutique n’a pas encore publié de projet. Revenez bientôt, ou écrivez à l’équipe.</div></section>' :
        blocProjets() + blocVision() + blocEquipe() + blocGalerie() + blocEvenements() + blocResultats() + blocBesoins() + blocPartenaires() + blocReseaux()) +
      barreFinale() + '</main>' + pied();
  }
  function redessiner() { app.innerHTML = page(); }
  function majListe() {
    var z = document.getElementById('imp-liste'); if (z) z.innerHTML = listeProjets();
    Array.prototype.forEach.call(document.querySelectorAll('.cat'), function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-cat') || '') === etat.cat)); });
    Array.prototype.forEach.call(document.querySelectorAll('.statut-b'), function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-statut') || '') === etat.statut)); });
  }

  /* ── événements ── */
  app.addEventListener('click', function (ev) {
    var cat = ev.target.closest && ev.target.closest('[data-cat]');
    if (cat) { etat.cat = cat.getAttribute('data-cat') || ''; etat.affiches = PAR_PAGE; majListe(); return; }
    var st = ev.target.closest && ev.target.closest('[data-statut]');
    if (st) { etat.statut = st.getAttribute('data-statut') || ''; etat.affiches = PAR_PAGE; majListe(); return; }
    var plus = ev.target.closest && ev.target.closest('[data-plus]');
    if (plus) { etat.affiches += PAR_PAGE; majListe(); }
  });
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
      var id = etat.init.id, prop = etat.init.owner_user_id;
      return Promise.all([
        api('GET', '/cagnottes/publiques?owner_user_id=' + encodeURIComponent(prop)).then(function (r) {
          /* Seules les cagnottes de CETTE boutique : celles rattachées à une autre initiative du même compte sont écartées. */
          var toutes = (r.cagnottes || []).filter(function (c) { return Number(c.owner_user_id) === Number(prop) && (!c.initiative_id || Number(c.initiative_id) === Number(id)); });
          etat.camp = toutes.filter(function (c) { return !c.type_don || c.type_don === 'campagne'; });
          etat.dons = toutes.filter(function (c) { return c.type_don === 'recurrent' || c.type_don === 'occasionnel'; }).filter(estOuverte);
          etat.dons.sort(function (a, b) { return (Number(b.est_vedette) || 0) - (Number(a.est_vedette) || 0); });
        }).catch(function () { etat.camp = []; etat.dons = []; }),
        api('GET', '/initiatives/' + encodeURIComponent(id) + '/partenaires').then(function (r) { etat.partenaires = (r.partenaires || []).filter(function (p) { return p && texte(p.nom); }); }).catch(function () { etat.partenaires = []; }),
        api('GET', '/evenements?owner=' + encodeURIComponent(prop) + '&boutique=1').then(function (r) {
          etat.evts = (r.evenements || []).filter(function (e) { return Number(e.owner_user_id) === Number(prop) && e.statut !== 'brouillon'; });
        }).catch(function () { etat.evts = []; }),
        api('GET', '/auth/me').then(function (r) { etat.moi = r.user || null; }).catch(function () {})
      ]);
    });
  }
  function demarrer() {
    var apres = function (maintenance) {
      if (maintenance) return;
      charger().then(function () {
        document.title = nom() + ' — Projets à impact';
        redessiner();
      }).catch(function (e) {
        app.innerHTML = '<p class="imp-chargement">' + esc(e && e.status === 404 ? 'Cette boutique est introuvable.' : (e && e.message) || 'Impossible de charger la boutique.') + ' <a href="vitrines.html" style="color:var(--acc)">Voir les boutiques</a></p>';
      });
    };
    if (window.DA_verifierMaintenanceBoutique) window.DA_verifierMaintenanceBoutique(app).then(apres); else apres(false);
  }
  demarrer();
})();
