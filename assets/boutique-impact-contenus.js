/* ===========================================================
   assets/boutique-impact-contenus.js — « Mon impact » dans les Paramètres de la boutique (2026-11-25, étape 2)
   Le propriétaire d'une boutique « Projet à impact » gère ses CHIFFRES CLÉS, ses RÉALISATIONS et son ÉQUIPE ICI,
   dans Paramètres Boutique (dashboard-initiative.html#parametres-vitrine&impact), au lieu de l'ancienne vue d'édition du profil (?edition=1).
   Mêmes données que la page boutique-impact.html (aucune donnée ni route nouvelle) :
     - Chiffres clés → vitrine_resultats_impact_json  [{ valeur, libelle }]                                     (les 3 premiers aussi dans le bandeau d'accueil)
     - Réalisations  → realisations_json              [{ titre, categorie, duree, description, image, lien }]
     - Équipe        → vitrine_equipe_json            [{ nom, fonction, rattache_a, photo }]
   Enregistrement : PUT /api/initiatives/:id/vitrine { <champ>: [...] } (le serveur remplace la liste entière, comme l'ancien éditeur).
   Les projets à soutenir sont les CAGNOTTES du compte : ils restent gérés dans « Cagnottes et dons » (bouton en tête de carte).
   La vision, les besoins, la galerie photos, les partenaires et les réseaux se règlent ailleurs (modules de l'aperçu, fiche partenaires) : pas recopiés ici.
   Utilise les fonctions globales de la page : api(method, path, body), uploadMedia(), compressImageFile(), pvRefreshPreview().
   Montage : PvImpact.monter(initiative) depuis loadParametresVitrineFull() ; visible pour le type « impact » (ou « projet ») seulement.
   Tests : node --test tests/boutique-impact-contenus.test.js
   =========================================================== */
(function () {
  'use strict';
  if (window.PvImpact) return;

  var PAGE = 30; /* lignes affichées d'un coup : « Voir plus » pour le reste */
  var SECTIONS = [
    {
      cle: 'resultats', champ: 'vitrine_resultats_impact_json', lib: 'Chiffres clés', rubrique: 'resultats_impact', rubLib: 'Résultats d\'impact', max: 12, image: 'aucune', icone: '📊', titreCle: 'valeur', titreDefaut: 'Chiffre',
      sing: 'chiffre', ajouter: '＋ Ajouter un chiffre', nouveau: 'Nouveau chiffre', ajoute: 'Chiffre ajouté. Il apparaît déjà dans votre boutique.', supprime: 'Chiffre supprimé.',
      vide: '<b>Aucun chiffre clé pour l\'instant.</b><br>Mettez en avant vos résultats : « 500+ » bénéficiaires accompagnés, « 12 » villages équipés…',
      aide: 'Vos résultats en quelques chiffres, sous « Notre impact en chiffres ». Les trois premiers apparaissent aussi dans le bandeau d\'accueil.',
      champs: [
        { k: 'valeur', lib: 'Valeur', max: 20, requis: true, erreurRequis: 'La valeur du chiffre est obligatoire (ex : 500+).', ph: 'Ex : 500+' },
        { k: 'libelle', lib: 'Libellé', max: 120, ph: 'Ex : bénéficiaires accompagnés', large: true }
      ],
      meta: function (it) { return [['libelle', it.libelle, 'pvp-duree']]; }
    },
    {
      cle: 'realisations', champ: 'realisations_json', lib: 'Réalisations', rubrique: 'realisations', rubLib: 'Réalisations', max: 100, image: 'facultative', icone: '🎯', titreCle: 'titre', titreDefaut: 'Sans titre',
      sing: 'réalisation', ajouter: '＋ Ajouter une réalisation', nouveau: 'Nouvelle réalisation', ajoute: 'Réalisation ajoutée. Elle apparaît déjà dans votre boutique.', supprime: 'Réalisation supprimée.',
      vide: '<b>Aucune réalisation pour l\'instant.</b><br>Ajoutez un projet mené à bien : un titre suffit pour commencer.',
      aide: 'Vos projets menés à bien, présentés sous « Nos réalisations ».',
      imageLib: 'Image', imageAide: 'Une image d\'illustration pour ce projet.',
      champs: [
        { k: 'titre', lib: 'Titre du projet', max: 140, requis: true, erreurRequis: 'Le titre du projet est obligatoire.', ph: 'Ex : Forage du village de Kolda', large: true },
        { k: 'categorie', lib: 'Catégorie', max: 40, ph: 'Ex : Eau, Éducation', listeDe: 'categorie' },
        { k: 'duree', lib: 'Durée', max: 20, ph: 'Ex : 6 mois' },
        { k: 'description', lib: 'Description courte', max: 500, zone: true, large: true },
        { k: 'lien', lib: 'Lien externe (facultatif)', url: true, max: 600, ph: 'https://…', large: true }
      ],
      meta: function (it) { return [['categorie', it.categorie, 'pvp-dispo'], ['duree', it.duree, 'pvp-duree']]; }
    },
    {
      cle: 'equipe', champ: 'vitrine_equipe_json', lib: 'Équipe', rubrique: 'equipe', rubLib: 'Équipe', max: 50, image: 'facultative', imageCle: 'photo', icone: '👤', titreCle: 'nom', titreDefaut: 'Sans nom',
      sing: 'membre', ajouter: '＋ Ajouter un membre', nouveau: 'Nouveau membre', ajoute: 'Membre ajouté. Il apparaît déjà dans votre boutique.', supprime: 'Membre supprimé.',
      vide: '<b>Aucun membre pour l\'instant.</b><br>Présentez les personnes qui font vivre vos projets.',
      aide: 'Les personnes de votre équipe, présentées sous « Notre équipe ».',
      imageLib: 'Photo', imageAide: 'Une photo de la personne (facultative).',
      champs: [
        { k: 'nom', lib: 'Nom complet', max: 80, requis: true, erreurRequis: 'Le nom du membre est obligatoire.', large: true },
        { k: 'fonction', lib: 'Fonction / rôle', max: 80, ph: 'Ex : Présidente, Chargé de projet', large: true },
        { k: 'rattache_a', lib: 'Rattaché(e) à (facultatif)', max: 80, ph: 'Nom d\'un autre membre', listeDe: 'nom', large: true, aide: 'Laissez vide pour le sommet de l\'organigramme.' }
      ],
      meta: function (it) { return [['fonction', it.fonction, 'pvp-dispo']]; }
    }
  ];

  var S = { initId: null, etat: null, cle: 'resultats', donnees: { resultats: [], realisations: [], equipe: [] }, vue: 'liste', index: null, image: '', n: PAGE, message: '', erreur: '', occupe: false };

  function $(id) { return document.getElementById(id); }
  function racine() { return $('pv-impact-mount'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sect(cle) { for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].cle === (cle || S.cle)) return SECTIONS[i]; return SECTIONS[0]; }
  function liste(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x && typeof x === 'object'; });
    if (typeof v === 'string' && v) { try { var p = JSON.parse(v); return Array.isArray(p) ? p.filter(function (x) { return x && typeof x === 'object'; }) : []; } catch (e) { return []; } }
    return [];
  }
  function texte(v) { return String(v == null ? '' : v).trim(); }
  function lienOk(u) { return /^https?:\/\/\S+$/i.test(u); }
  function imageSure(u) { var s = texte(u); return /^(https?:\/\/|\/)/i.test(s) ? s : ''; }
  function imageDe(it, s) { return imageSure(it[s.imageCle || 'image']); }
  function titreDe(it, s) { return texte(it[s.titreCle]) || s.titreDefaut; }

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
    var img = imageDe(it, s), nom = titreDe(it, s);
    var pastilles = (s.meta ? s.meta(it) : []).filter(function (m) { return texte(m[1]); }).map(function (m) { return '<span class="pvp-pastille ' + m[2] + '">' + esc(texte(m[1])) + '</span>'; }).join('');
    return '<div class="pvp-ligne" data-i="' + i + '">' +
      '<div class="pvp-ordre"><button type="button" class="pvp-mini" data-a="haut" aria-label="Monter « ' + esc(nom) + ' »"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
      '<span class="pvp-poignee" aria-hidden="true">⋮⋮</span>' +
      '<button type="button" class="pvp-mini" data-a="bas" aria-label="Descendre « ' + esc(nom) + ' »"' + (i === total - 1 ? ' disabled' : '') + '>▼</button></div>' +
      '<div class="pvp-vignette">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span aria-hidden="true">' + s.icone + '</span>') + '</div>' +
      '<div class="pvp-info"><p class="pvp-nom">' + esc(nom) + '</p><div class="pvp-meta">' + pastilles + '</div></div>' +
      '<div class="pvp-actions"><button type="button" class="pvp-btn pvp-petit" data-a="edit">Modifier</button>' +
      '<button type="button" class="pvp-btn pvp-petit pvp-danger" data-a="suppr-ligne" aria-label="Supprimer « ' + esc(nom) + ' »">Supprimer</button></div></div>';
  }

  function rubriqueEteinte(s) {
    return !!(window.BoutiqueRubriques && S.etat && !window.BoutiqueRubriques.active(S.etat, s.rubrique));
  }

  function vueListe() {
    var s = sect(), items = S.donnees[s.cle], n = items.length;
    var onglets = '<div class="pvp-puces" role="group" aria-label="Contenus de votre boutique à impact">' + SECTIONS.map(function (x) {
      var nb = S.donnees[x.cle].length;
      return '<button type="button" class="pvp-puce' + (x.cle === s.cle ? ' on' : '') + '" data-s="' + x.cle + '" aria-pressed="' + (x.cle === s.cle) + '">' + x.lib + (nb ? ' (' + nb + ')' : '') + '</button>';
    }).join('') + '</div>';
    var h = '<div class="pvp-outils">' + onglets + '</div>' +
      '<p class="pvp-aide">Vos projets à soutenir sont vos cagnottes : <button type="button" class="pvp-lien" data-a="cagnottes">les gérer dans « Cagnottes et dons »</button>.</p>' +
      '<p class="pvp-aide">' + s.aide + '</p>';
    if (rubriqueEteinte(s)) h += '<p class="pvp-note" role="status">La rubrique « ' + esc(s.rubLib) + ' » est éteinte dans votre boutique : vos visiteurs ne voient pas ce contenu. Vous pouvez la rallumer à l\'étape « Rubriques » de la création de la boutique.</p>';
    h += '<div class="pvp-barre"><span class="pvp-compteur"><b>' + n + '</b> ' + s.sing + (n > 1 ? 's' : '') + ' sur ' + s.max + '</span>' +
      '<button type="button" class="pvp-btn pvp-or pvp-pousse" data-a="ajouter"' + (n >= s.max || S.occupe ? ' disabled' : '') + '>' + s.ajouter + '</button></div>';
    if (n >= s.max) h += '<p class="pvp-note">Limite de ' + s.max + ' ' + s.sing + 's atteinte : supprimez-en un pour en ajouter un nouveau.</p>';
    if (!n) h += '<div class="pvp-vide">' + s.vide + '</div>';
    else {
      var vus = items.slice(0, S.n);
      h += '<div class="pvp-groupes"><section class="pvp-groupe">' + vus.map(function (it, i) { return ligne(it, i, n, s); }).join('') + '</section></div>';
      if (n > S.n) h += '<p class="pvp-note"><button type="button" class="pvp-lien" data-a="plus">Voir les ' + (n - S.n) + ' suivants</button></p>';
      h += '<p class="pvp-note">Utilisez les flèches ▲ ▼ pour changer l\'ordre d\'affichage : le premier élément passe en premier dans votre boutique.</p>';
    }
    return h;
  }

  /* ---------- formulaire ---------- */
  function champ(id, lib, html, large) { return '<div' + (large ? ' class="pvp-large"' : '') + '><label for="' + id + '">' + lib + '</label>' + html + '</div>'; }
  /* Valeurs déjà saisies, proposées en suggestion (mêmes catégories d'une réalisation à l'autre ; noms des membres pour « Rattaché(e) à »). */
  function suggestions(s, cle) {
    var v = [];
    S.donnees[s.cle].forEach(function (it, i) { var c = texte(it[cle]); if (c && v.indexOf(c) < 0 && !(s.cle === 'equipe' && S.index === i)) v.push(c); });
    return v;
  }
  function vueForm() {
    var s = sect(), it = S.index != null ? S.donnees[s.cle][S.index] : null;
    var bloc = '';
    if (s.image !== 'aucune') {
      bloc = '<fieldset class="pvp-carte"><legend>' + s.imageLib + ' (facultative)</legend>' +
        '<p class="pvp-aide">' + s.imageAide + '</p>' +
        '<div class="pvp-photos"><div class="pvp-photo' + (S.image ? ' pleine' : '') + '" data-slot="0">' +
        (S.image ? '<img src="' + esc(S.image) + '" alt="' + esc(s.imageLib) + '"><button type="button" class="pvp-photo-x" data-a="photo-x" aria-label="Retirer l\'image">✕</button>'
          : '<button type="button" class="pvp-photo-add" data-a="photo-add"><b>＋</b>Ajouter</button>') +
        '<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" id="pvpf-image" hidden></div></div></fieldset>';
    }
    var champs = s.champs.map(function (c) {
      var id = 'pvpf-' + c.k, val = it ? esc(texte(it[c.k])) : '';
      var ctl = c.zone ? '<textarea id="' + id + '" maxlength="' + c.max + '" placeholder="' + esc(c.ph || '') + '">' + val + '</textarea>'
        : '<input type="' + (c.url ? 'url' : 'text') + '"' + (c.url ? ' inputmode="url"' : '') + ' id="' + id + '" maxlength="' + c.max + '" value="' + val + '" placeholder="' + esc(c.ph || '') + '"' + (c.listeDe ? ' list="pvpf-liste-' + c.k + '"' : '') + '>';
      if (c.listeDe) ctl += '<datalist id="pvpf-liste-' + c.k + '">' + suggestions(s, c.listeDe).map(function (x) { return '<option value="' + esc(x) + '"></option>'; }).join('') + '</datalist>';
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
      if (c.requis && !v) return { erreur: c.erreurRequis || 'Ce champ est obligatoire.' };
      if (c.url && v && !lienOk(v)) return { erreur: 'Le lien externe doit commencer par http:// ou https://.' };
      o[c.k] = v;
    }
    if (s.image !== 'aucune') o[s.imageCle || 'image'] = S.image || '';
    return { valeur: o };
  }
  function enregForm() {
    var s = sect(), lu = lireForm(s);
    if (lu.erreur) { S.erreur = lu.erreur; var e = $('pvpf-err'); if (e) { e.textContent = lu.erreur; e.hidden = false; } return; }
    var tab = S.donnees[s.cle].slice(), neuf = S.index == null;
    if (neuf) tab.push(lu.valeur);
    else tab[S.index] = Object.assign({}, tab[S.index], lu.valeur);
    S.occupe = true; S.erreur = '';
    var b = $('pvpf-enreg'); if (b) b.disabled = true;
    enregistrer(s, tab).then(function () { S.vue = 'liste'; S.index = null; apres(neuf ? s.ajoute : 'Modifications enregistrées.'); }).catch(function (err) {
      S.erreur = (err && err.message) || 'Une erreur est survenue. Réessayez.'; S.occupe = false;
      var z = $('pvpf-err'); if (z) { z.textContent = S.erreur; z.hidden = false; } if (b) b.disabled = false;
    });
  }
  function supprimer(i) {
    var s = sect(), it = S.donnees[s.cle][i]; if (!it) return;
    if (!window.confirm('Supprimer « ' + titreDe(it, s) + ' » ? Cette action est définitive.')) return;
    var tab = S.donnees[s.cle].filter(function (x, k) { return k !== i; });
    S.occupe = true;
    enregistrer(s, tab).then(function () { S.vue = 'liste'; S.index = null; apres(s.supprime); }).catch(echec);
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
  function envoyerImage(fichier) {
    var zone = document.querySelector('#pv-impact .pvp-photo'); if (zone) zone.classList.add('charge');
    televerser(fichier).then(function (url) { S.image = url; majImage(); }).catch(function (e) {
      if (zone) zone.classList.remove('charge');
      S.erreur = 'L\'image n\'a pas pu être envoyée : ' + ((e && e.message) || 'réessayez.'); var z = $('pvpf-err'); if (z) { z.textContent = S.erreur; z.hidden = false; }
    });
  }
  function majImage() {
    var z = document.querySelector('#pv-impact .pvp-photo'); if (!z) return;
    z.classList.remove('charge'); z.classList.toggle('pleine', !!S.image);
    z.innerHTML = (S.image ? '<img src="' + esc(S.image) + '" alt="' + esc(sect().imageLib) + '"><button type="button" class="pvp-photo-x" data-a="photo-x" aria-label="Retirer l\'image">✕</button>'
      : '<button type="button" class="pvp-photo-add" data-a="photo-add"><b>＋</b>Ajouter</button>') + '<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" id="pvpf-image" hidden>';
  }
  function ouvrirForm(i) {
    var s = sect(), it = i != null ? S.donnees[s.cle][i] : null;
    S.vue = 'form'; S.index = i; S.image = it ? imageDe(it, s) : ''; S.erreur = ''; S.message = ''; dessiner();
    var c = $('pv-impact'); if (c && c.scrollIntoView) try { c.scrollIntoView({ block: 'start' }); } catch (e) {}
  }

  function brancher() {
    var r = racine(); if (!r || r.__pvimBranche) return; r.__pvimBranche = true;
    r.addEventListener('click', function (e) {
      var o = e.target.closest('[data-s]');
      if (o) { S.cle = o.dataset.s; S.n = PAGE; S.message = ''; S.erreur = ''; dessiner(); return; }
      var b = e.target.closest('[data-a]'); if (!b) return;
      var a = b.dataset.a, l = b.closest('.pvp-ligne'), i = l ? Number(l.dataset.i) : null;
      if (a === 'ajouter') ouvrirForm(null);
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
      else if (a === 'cagnottes') { if (typeof window.initShowSection === 'function') window.initShowSection('cagnottes'); else location.href = 'dashboard-initiative.html#cagnottes'; }
    });
    r.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'pvpf-image' && t.files && t.files[0]) envoyerImage(t.files[0]);
    });
  }

  function monter(init) {
    var carte = $('pv-impact'); if (!carte) return;
    var type = init && init.vitrine_type ? String(init.vitrine_type) : '';
    if (!init || !init.id || (type !== 'impact' && type !== 'projet')) { carte.style.display = 'none'; return; }
    carte.style.display = '';
    S.initId = init.id; S.etat = init.vitrine_modules_state || null; S.cle = 'resultats'; S.vue = 'liste'; S.index = null; S.n = PAGE; S.message = ''; S.erreur = ''; S.occupe = false;
    S.donnees = { resultats: liste(init.vitrine_resultats_impact_json), realisations: liste(init.realisations_json), equipe: liste(init.vitrine_equipe_json) };
    brancher(); dessiner();
    if (/[#&]impact(&|$)/.test(location.hash)) { try { carte.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
  }

  window.PvImpact = { monter: monter };
})();
