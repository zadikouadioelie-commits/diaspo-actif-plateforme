/* ===========================================================
   assets/boutique-portfolio-contenus.js — « Mon portfolio » dans les Paramètres de la boutique (2026-11-24, étape 2)
   Le propriétaire d'une boutique Portfolio gère ses CRÉATIONS (photos du portfolio), ses RÉALISATIONS et ses VIDÉOS ICI,
   dans Paramètres Boutique (dashboard-initiative.html#parametres-vitrine&portfolio), au lieu de l'ancienne vue d'édition du profil (?edition=1).
   Mêmes données que la page portfolio.html (aucune donnée ni route nouvelle) :
     - Créations     → vitrine_portfolio_json  [{ image, titre, categorie, description, lien }]   (la catégorie forme les filtres de la page)
     - Réalisations  → realisations_json       [{ titre, categorie, duree, description, image, lien }]
     - Vidéos        → vitrine_videos_json     [{ url, titre, duree }]                              (liens YouTube / Vimeo)
   Enregistrement : PUT /api/initiatives/:id/vitrine { <champ>: [...] } (le serveur remplace la liste entière, comme l'ancien éditeur).
   La galerie photos et les témoignages restent réglés par les modules de l'aperçu (brouillon + « Publier ») : ils n'ont pas leur place ici.
   Utilise les fonctions globales de la page : api(method, path, body), uploadMedia(), compressImageFile(), pvRefreshPreview().
   Montage : PvPortfolio.monter(initiative) depuis loadParametresVitrineFull() ; visible pour le type « portfolio » seulement.
   =========================================================== */
(function () {
  'use strict';
  if (window.PvPortfolio) return;

  var PAGE = 30; /* lignes affichées d'un coup : « Voir plus » pour le reste */
  var SECTIONS = [
    {
      cle: 'creations', champ: 'vitrine_portfolio_json', lib: 'Créations', rubrique: 'portfolio', rubLib: 'Portfolio', max: 300, image: 'requise', icone: '🖼️',
      sing: 'création', ajouter: '＋ Ajouter des photos', nouveau: 'Nouvelle création', ajoutee: 'Création ajoutée. Elle apparaît déjà dans votre portfolio.', supprimee: 'Création supprimée.',
      vide: '<b>Votre portfolio est encore vide.</b><br>Envoyez vos premières photos : vous pourrez ensuite leur donner un titre et une catégorie.',
      aide: 'Les photos de votre portfolio. Les catégories que vous saisissez deviennent les filtres de la page Portfolio.',
      champs: [
        { k: 'titre', lib: 'Titre', max: 140, ph: 'Ex : Mariage à Dakar', large: true },
        { k: 'categorie', lib: 'Catégorie', max: 40, ph: 'Ex : Photos, Vidéos, Affiches', liste: true, aide: 'Réutilisez le même nom pour regrouper vos créations : chaque catégorie devient un filtre.' },
        { k: 'description', lib: 'Description courte', max: 500, zone: true, ph: 'Le contexte, le client, la technique…', large: true },
        { k: 'lien', lib: 'Lien externe (facultatif)', url: true, max: 600, ph: 'https://…', large: true }
      ]
    },
    {
      cle: 'realisations', champ: 'realisations_json', lib: 'Réalisations', rubrique: 'realisations', rubLib: 'Réalisations', max: 100, image: 'facultative', icone: '🎬',
      sing: 'réalisation', ajouter: '＋ Ajouter une réalisation', nouveau: 'Nouvelle réalisation', ajoutee: 'Réalisation ajoutée. Elle apparaît déjà dans votre boutique.', supprimee: 'Réalisation supprimée.',
      vide: '<b>Aucune réalisation pour l\'instant.</b><br>Ajoutez un projet mené à bien : un titre suffit pour commencer.',
      aide: 'Vos projets menés à bien, présentés sous « Nos créations ».',
      champs: [
        { k: 'titre', lib: 'Titre du projet', max: 140, requis: true, ph: 'Ex : Documentaire « Retour au village »', large: true },
        { k: 'categorie', lib: 'Catégorie', max: 40, ph: 'Ex : Film, Reportage', liste: true },
        { k: 'duree', lib: 'Durée', max: 20, ph: 'Ex : 12 min' },
        { k: 'description', lib: 'Description courte', max: 500, zone: true, large: true },
        { k: 'lien', lib: 'Lien externe (facultatif)', url: true, max: 600, ph: 'https://…', large: true }
      ]
    },
    {
      cle: 'videos', champ: 'vitrine_videos_json', lib: 'Vidéos', rubrique: 'galerie_videos', rubLib: 'Galerie vidéos', max: 100, image: 'aucune', icone: '▶',
      sing: 'vidéo', ajouter: '＋ Ajouter une vidéo', nouveau: 'Nouvelle vidéo', ajoutee: 'Vidéo ajoutée. Elle apparaît déjà dans votre boutique.', supprimee: 'Vidéo supprimée.',
      vide: '<b>Aucune vidéo pour l\'instant.</b><br>Collez le lien d\'une vidéo YouTube ou Vimeo : la plateforme ne l\'héberge pas, elle l\'affiche dans un lecteur.',
      aide: 'Des liens vers vos vidéos YouTube ou Vimeo, affichés sous « Nos créations ».',
      champs: [
        { k: 'url', lib: 'Lien de la vidéo (YouTube ou Vimeo)', url: true, max: 600, requis: true, ph: 'https://…', large: true },
        { k: 'titre', lib: 'Titre (facultatif)', max: 140, large: true },
        { k: 'duree', lib: 'Durée (facultatif)', max: 20, ph: 'Ex : 3:20' }
      ]
    }
  ];

  var S = { initId: null, etat: null, cle: 'creations', donnees: { creations: [], realisations: [], videos: [] }, vue: 'liste', index: null, image: '', n: PAGE, message: '', erreur: '', occupe: false };

  function $(id) { return document.getElementById(id); }
  function racine() { return $('pv-portfolio-mount'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sect(cle) { for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].cle === (cle || S.cle)) return SECTIONS[i]; return SECTIONS[0]; }
  function liste(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x && typeof x === 'object'; });
    if (typeof v === 'string' && v) { try { var p = JSON.parse(v); return Array.isArray(p) ? p.filter(function (x) { return x && typeof x === 'object'; }) : []; } catch (e) { return []; } }
    return [];
  }
  function texte(v) { return String(v == null ? '' : v).trim(); }
  function lienOk(u) { return /^https?:\/\/\S+$/i.test(u); }
  function imageDe(it) { return texte(it.image || it.url); }
  function titreDe(it, s) {
    if (s.cle === 'videos') return texte(it.titre) || texte(it.url).replace(/^https?:\/\/(www\.)?/i, '').slice(0, 60) || 'Vidéo';
    return texte(it.titre) || 'Sans titre';
  }

  /* ---------- enregistrement : la liste entière de la rubrique ---------- */
  function enregistrer(s, tableau) {
    var corps = {}; corps[s.champ] = tableau;
    return api('PUT', '/initiatives/' + S.initId + '/vitrine', corps).then(function () {
      S.donnees[s.cle] = tableau;
      try { if (typeof pvRefreshPreview === 'function') pvRefreshPreview(); } catch (e) {}
    });
  }
  function apres(msg) { S.message = msg || ''; S.erreur = ''; S.occupe = false; dessiner(); }
  function echec(e) { S.erreur = (e && e.message) || 'Une erreur est survenue. Réessayez.'; S.message = ''; S.occupe = false; dessiner(); }

  /* ---------- liste ---------- */
  function ligne(it, i, total, s) {
    var img = imageDe(it);
    var cat = texte(it.categorie), duree = texte(it.duree);
    var nom = titreDe(it, s);
    return '<div class="pvp-ligne" data-i="' + i + '">' +
      '<div class="pvp-ordre"><button type="button" class="pvp-mini" data-a="haut" aria-label="Monter « ' + esc(nom) + ' »"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
      '<span class="pvp-poignee" aria-hidden="true">⋮⋮</span>' +
      '<button type="button" class="pvp-mini" data-a="bas" aria-label="Descendre « ' + esc(nom) + ' »"' + (i === total - 1 ? ' disabled' : '') + '>▼</button></div>' +
      '<div class="pvp-vignette">' + (img && s.cle !== 'videos' ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span aria-hidden="true">' + s.icone + '</span>') + '</div>' +
      '<div class="pvp-info"><p class="pvp-nom">' + esc(nom) + '</p><div class="pvp-meta">' +
      (cat ? '<span class="pvp-pastille pvp-dispo">' + esc(cat) + '</span>' : '') +
      (duree ? '<span class="pvp-pastille pvp-duree">' + esc(duree) + '</span>' : '') +
      (s.cle === 'creations' && !cat ? '<span class="pvp-pastille pvp-masque">Sans catégorie</span>' : '') + '</div></div>' +
      '<div class="pvp-actions"><button type="button" class="pvp-btn pvp-petit" data-a="edit">Modifier</button>' +
      '<button type="button" class="pvp-btn pvp-petit pvp-danger" data-a="suppr-ligne" aria-label="Supprimer « ' + esc(nom) + ' »">Supprimer</button></div></div>';
  }

  function rubriqueEteinte(s) {
    return !!(window.BoutiqueRubriques && S.etat && !window.BoutiqueRubriques.active(S.etat, s.rubrique));
  }

  function vueListe() {
    var s = sect(), items = S.donnees[s.cle], n = items.length;
    var onglets = '<div class="pvp-puces" role="group" aria-label="Contenus du portfolio">' + SECTIONS.map(function (x) {
      var nb = S.donnees[x.cle].length;
      return '<button type="button" class="pvp-puce' + (x.cle === s.cle ? ' on' : '') + '" data-s="' + x.cle + '" aria-pressed="' + (x.cle === s.cle) + '">' + x.lib + (nb ? ' (' + nb + ')' : '') + '</button>';
    }).join('') + '</div>';
    var h = '<div class="pvp-outils">' + onglets + '</div>' +
      '<p class="pvp-aide">' + s.aide + '</p>';
    if (rubriqueEteinte(s)) h += '<p class="pvp-note" role="status">La rubrique « ' + esc(s.rubLib) + ' » est éteinte dans votre boutique : vos visiteurs ne voient pas ce contenu. Vous pouvez la rallumer à l\'étape « Rubriques » de la création de la boutique.</p>';
    h += '<div class="pvp-barre"><span class="pvp-compteur"><b>' + n + '</b> ' + s.sing + (n > 1 ? 's' : '') + ' sur ' + s.max + '</span>' +
      '<button type="button" class="pvp-btn pvp-or pvp-pousse" data-a="ajouter"' + (n >= s.max || S.occupe ? ' disabled' : '') + '>' + s.ajouter + '</button>' +
      (s.cle === 'creations' ? '<input type="file" id="pvpf-fichiers" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden>' : '') + '</div>';
    if (n >= s.max) h += '<p class="pvp-note">Limite de ' + s.max + ' ' + s.sing + 's atteinte : supprimez-en une pour en ajouter une nouvelle.</p>';
    if (!n) h += '<div class="pvp-vide">' + s.vide + '</div>';
    else {
      var vus = items.slice(0, S.n);
      h += '<div class="pvp-groupes"><section class="pvp-groupe">' + vus.map(function (it, i) { return ligne(it, i, n, s); }).join('') + '</section></div>';
      if (n > S.n) h += '<p class="pvp-note"><button type="button" class="pvp-lien" data-a="plus">Voir les ' + (n - S.n) + ' suivantes</button></p>';
      h += '<p class="pvp-note">Utilisez les flèches ▲ ▼ pour changer l\'ordre d\'affichage : le premier élément passe en premier dans votre boutique.</p>';
    }
    return h;
  }

  /* ---------- formulaire ---------- */
  function champ(id, lib, html, large) { return '<div' + (large ? ' class="pvp-large"' : '') + '><label for="' + id + '">' + lib + '</label>' + html + '</div>'; }
  function categoriesExistantes(s) {
    var v = [];
    S.donnees[s.cle].forEach(function (it) { var c = texte(it.categorie); if (c && v.indexOf(c) < 0) v.push(c); });
    return v;
  }
  function vueForm() {
    var s = sect(), it = S.index != null ? S.donnees[s.cle][S.index] : null;
    var cats = categoriesExistantes(s);
    var bloc = '';
    if (s.image !== 'aucune') {
      bloc = '<fieldset class="pvp-carte"><legend>' + (s.image === 'requise' ? 'Photo *' : 'Image (facultative)') + '</legend>' +
        '<p class="pvp-aide">' + (s.image === 'requise' ? 'La photo s\'affiche dans la grille de votre portfolio.' : 'Une image d\'illustration pour ce projet.') + '</p>' +
        '<div class="pvp-photos"><div class="pvp-photo' + (S.image ? ' pleine' : '') + '" data-slot="0">' +
        (S.image ? '<img src="' + esc(S.image) + '" alt="Image"><button type="button" class="pvp-photo-x" data-a="photo-x" aria-label="Retirer l\'image">✕</button>'
          : '<button type="button" class="pvp-photo-add" data-a="photo-add"><b>＋</b>Ajouter</button>') +
        '<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" id="pvpf-image" hidden></div></div></fieldset>';
    }
    var champs = s.champs.map(function (c) {
      var id = 'pvpf-' + c.k, val = it ? esc(texte(it[c.k])) : '';
      var ctl = c.zone ? '<textarea id="' + id + '" maxlength="' + c.max + '" placeholder="' + esc(c.ph || '') + '">' + val + '</textarea>'
        : '<input type="' + (c.url ? 'url' : 'text') + '"' + (c.url ? ' inputmode="url"' : '') + ' id="' + id + '" maxlength="' + c.max + '" value="' + val + '" placeholder="' + esc(c.ph || '') + '"' + (c.liste ? ' list="pvpf-cats"' : '') + '>';
      if (c.liste) ctl += '<datalist id="pvpf-cats">' + cats.map(function (x) { return '<option value="' + esc(x) + '"></option>'; }).join('') + '</datalist>';
      if (c.aide) ctl += '<p class="pvp-aide">' + c.aide + '</p>';
      return champ(id, c.lib + (c.requis ? ' *' : ''), ctl, c.large);
    }).join('');
    return '<div class="pvp-form"><div><button type="button" class="pvp-btn pvp-petit" data-a="retour">← Retour à mes ' + s.lib.toLowerCase() + '</button>' +
      '<h4 class="pvp-titre">' + (it ? 'Modifier « ' + esc(titreDe(it, s)) + ' »' : s.nouveau) + '</h4>' +
      '<p class="pvp-aide">Les champs marqués d\'une étoile sont obligatoires. Vous pourrez tout modifier plus tard.</p></div>' + bloc +
      '<fieldset class="pvp-carte"><legend>Informations</legend><div class="pvp-champs">' + champs + '</div></fieldset>' +
      '<p class="pvp-erreur" id="pvpf-err" role="alert"' + (S.erreur ? '' : ' hidden') + '>' + esc(S.erreur) + '</p>' +
      '<div class="pvp-pied"><button type="button" class="pvp-btn pvp-or" data-a="enreg" id="pvpf-enreg"' + (S.occupe ? ' disabled' : '') + '>' + (it ? 'Enregistrer les modifications' : 'Ajouter') + '</button>' +
      '<button type="button" class="pvp-btn" data-a="retour">Annuler</button>' +
      (it ? '<button type="button" class="pvp-btn pvp-danger pvp-pousse" data-a="suppr-form">Supprimer</button>' : '') + '</div></div>';
  }

  function dessiner() {
    var r = racine(); if (!r) return;
    var banniere = (S.message ? '<p class="pvp-ok" role="status">' + esc(S.message) + '</p>' : '') +
      (S.vue === 'liste' && S.erreur ? '<p class="pvp-erreur" role="alert">' + esc(S.erreur) + '</p>' : '');
    r.innerHTML = banniere + (S.vue === 'form' ? vueForm() : vueListe());
  }

  /* ---------- actions ---------- */
  function lireForm(s) {
    var o = {};
    for (var i = 0; i < s.champs.length; i++) {
      var c = s.champs[i], v = texte(($('pvpf-' + c.k) || {}).value);
      if (c.requis && !v) return { erreur: s.cle === 'videos' ? 'Le lien de la vidéo est obligatoire.' : 'Le titre du projet est obligatoire.' };
      if (c.url && v && !lienOk(v)) return { erreur: (s.cle === 'videos' ? 'Le lien de la vidéo' : 'Le lien externe') + ' doit commencer par http:// ou https://.' };
      o[c.k] = v;
    }
    if (s.image === 'requise' && !S.image) return { erreur: 'Ajoutez une photo.' };
    if (s.image !== 'aucune') o.image = S.image || '';
    return { valeur: o };
  }
  function enregForm() {
    var s = sect(), lu = lireForm(s);
    if (lu.erreur) { S.erreur = lu.erreur; var e = $('pvpf-err'); if (e) { e.textContent = lu.erreur; e.hidden = false; } return; }
    var tab = S.donnees[s.cle].slice(), neuf = S.index == null;
    if (neuf) tab.push(lu.valeur);
    else { var orig = Object.assign({}, tab[S.index]); if (s.cle === 'creations') delete orig.url; tab[S.index] = Object.assign(orig, lu.valeur); }
    S.occupe = true; S.erreur = '';
    var b = $('pvpf-enreg'); if (b) b.disabled = true;
    enregistrer(s, tab).then(function () { S.vue = 'liste'; S.index = null; apres(neuf ? s.ajoutee : 'Modifications enregistrées.'); }).catch(function (err) {
      S.erreur = (err && err.message) || 'Une erreur est survenue. Réessayez.'; S.occupe = false;
      var z = $('pvpf-err'); if (z) { z.textContent = S.erreur; z.hidden = false; } if (b) b.disabled = false;
    });
  }
  function supprimer(i) {
    var s = sect(), it = S.donnees[s.cle][i]; if (!it) return;
    if (!window.confirm('Supprimer « ' + titreDe(it, s) + ' » ? Cette action est définitive.')) return;
    var tab = S.donnees[s.cle].filter(function (x, k) { return k !== i; });
    S.occupe = true;
    enregistrer(s, tab).then(function () { S.vue = 'liste'; S.index = null; apres(s.supprimee); }).catch(echec);
  }
  function deplacer(i, sens) {
    var s = sect(), tab = S.donnees[s.cle].slice(), j = i + sens;
    if (j < 0 || j >= tab.length) return;
    var t = tab[i]; tab[i] = tab[j]; tab[j] = t;
    enregistrer(s, tab).then(function () { apres('Ordre enregistré.'); }).catch(echec);
  }
  function televerser(fichier) {
    return Promise.resolve(compressImageFile(fichier, 1600, 1600, 0.85)).then(function (c) { return uploadMedia(c, 'produit'); });
  }
  /* Plusieurs photos d'un coup (créations) : chacune devient une création sans titre, enregistrées ensemble à la fin. */
  function ajouterPhotos(fichiers) {
    var s = sect('creations'), place = s.max - S.donnees.creations.length;
    fichiers = Array.prototype.slice.call(fichiers || []).slice(0, Math.max(0, place));
    if (!fichiers.length) return;
    S.occupe = true; S.erreur = ''; var neuves = [], ratees = [], k = 0;
    function suite() {
      if (k >= fichiers.length) {
        if (!neuves.length) { S.occupe = false; S.erreur = 'Aucune photo n\'a pu être envoyée : ' + ratees.join(', ') + '.'; S.message = ''; dessiner(); return; }
        enregistrer(s, S.donnees.creations.concat(neuves)).then(function () {
          apres(neuves.length + (neuves.length > 1 ? ' photos ajoutées' : ' photo ajoutée') + '. Cliquez sur « Modifier » pour leur donner un titre et une catégorie.' + (ratees.length ? ' Non envoyées : ' + ratees.join(', ') + '.' : ''));
        }).catch(echec);
        return;
      }
      S.message = 'Envoi de la photo ' + (k + 1) + ' sur ' + fichiers.length + '…'; dessiner();
      var f = fichiers[k++];
      televerser(f).then(function (url) { neuves.push({ image: url, titre: '', categorie: '', description: '', lien: '' }); }).catch(function () { ratees.push(f.name || 'photo'); }).then(suite);
    }
    suite();
  }
  function envoyerImage(fichier) {
    var zone = document.querySelector('#pv-portfolio .pvp-photo'); if (zone) zone.classList.add('charge');
    televerser(fichier).then(function (url) { S.image = url; majImage(); }).catch(function (e) {
      if (zone) zone.classList.remove('charge');
      S.erreur = 'L\'image n\'a pas pu être envoyée : ' + ((e && e.message) || 'réessayez.'); var z = $('pvpf-err'); if (z) { z.textContent = S.erreur; z.hidden = false; }
    });
  }
  function majImage() {
    var z = document.querySelector('#pv-portfolio .pvp-photo'); if (!z) return;
    z.classList.remove('charge'); z.classList.toggle('pleine', !!S.image);
    z.innerHTML = (S.image ? '<img src="' + esc(S.image) + '" alt="Image"><button type="button" class="pvp-photo-x" data-a="photo-x" aria-label="Retirer l\'image">✕</button>'
      : '<button type="button" class="pvp-photo-add" data-a="photo-add"><b>＋</b>Ajouter</button>') + '<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" id="pvpf-image" hidden>';
  }
  function ouvrirForm(i) {
    var s = sect(), it = i != null ? S.donnees[s.cle][i] : null;
    S.vue = 'form'; S.index = i; S.image = it ? imageDe(it) : ''; S.erreur = ''; S.message = ''; dessiner();
    var c = $('pv-portfolio'); if (c && c.scrollIntoView) try { c.scrollIntoView({ block: 'start' }); } catch (e) {}
  }

  function brancher() {
    var r = racine(); if (!r || r.__pvpfBranche) return; r.__pvpfBranche = true;
    r.addEventListener('click', function (e) {
      var o = e.target.closest('[data-s]');
      if (o) { S.cle = o.dataset.s; S.n = PAGE; S.message = ''; S.erreur = ''; dessiner(); return; }
      var b = e.target.closest('[data-a]'); if (!b) return;
      var a = b.dataset.a, l = b.closest('.pvp-ligne'), i = l ? Number(l.dataset.i) : null;
      if (a === 'ajouter') { if (S.cle === 'creations') { var f = $('pvpf-fichiers'); if (f) f.click(); } else ouvrirForm(null); }
      else if (a === 'edit') ouvrirForm(i);
      else if (a === 'suppr-ligne') supprimer(i);
      else if (a === 'suppr-form') supprimer(S.index);
      else if (a === 'haut') deplacer(i, -1);
      else if (a === 'bas') deplacer(i, 1);
      else if (a === 'plus') { S.n += PAGE; dessiner(); }
      else if (a === 'retour') { S.vue = 'liste'; S.index = null; S.erreur = ''; dessiner(); }
      else if (a === 'enreg') enregForm();
      else if (a === 'photo-add') { var inp = $('pvpf-image'); if (inp) inp.click(); }
      else if (a === 'photo-x') { S.image = ''; majImage(); }
    });
    r.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'pvpf-fichiers' && t.files && t.files.length) { var fs = t.files; ajouterPhotos(fs); t.value = ''; }
      else if (t.id === 'pvpf-image' && t.files && t.files[0]) envoyerImage(t.files[0]);
    });
  }

  function monter(init) {
    var carte = $('pv-portfolio'); if (!carte) return;
    var type = init && init.vitrine_type ? String(init.vitrine_type) : '';
    if (!init || !init.id || type !== 'portfolio') { carte.style.display = 'none'; return; }
    carte.style.display = '';
    S.initId = init.id; S.etat = init.vitrine_modules_state || null; S.vue = 'liste'; S.index = null; S.n = PAGE; S.message = ''; S.erreur = ''; S.occupe = false;
    S.donnees = { creations: liste(init.vitrine_portfolio_json), realisations: liste(init.realisations_json), videos: liste(init.vitrine_videos_json) };
    brancher(); dessiner();
    if (/[#&]portfolio(&|$)/.test(location.hash)) { try { carte.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
  }

  window.PvPortfolio = { monter: monter };
})();
