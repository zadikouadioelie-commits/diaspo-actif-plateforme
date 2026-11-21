/* ===========================================================
   assets/boutique-produits.js — « Mes produits » dans les Paramètres de la boutique (2026-11-21, étape 2)
   Le propriétaire d'une boutique de vente ajoute, modifie, range et masque ses produits ICI, dans Paramètres Boutique
   (dashboard-initiative.html#parametres-vitrine), au lieu de l'ancienne vue d'édition du profil (?edition=1).
   Réutilise les routes du serveur déjà en place (aucune donnée ni route nouvelle) :
     GET/POST /api/initiatives/:id/produits · PUT/DELETE /api/produits/:id · PUT /api/produits/:id/mise-en-avant
     PATCH /api/initiatives/:id/produits/reorder · GET/POST /api/initiatives/:id/catalogues
   Limites imposées par le serveur : 100 produits, 10 articles par catalogue, 4 photos, 3 produits vedettes.
   Les paiements restent SIMULÉS : ce module ne touche à aucun paiement.
   Utilise les fonctions globales de la page : api(method, path, body), uploadMedia(), compressImageFile(), pvRefreshPreview(), pvRenderCartouchePreview().
   Montage : PvProduits.monter(initiative) depuis loadParametresVitrineFull() ; visible pour les types « boutique de vente » seulement.
   =========================================================== */
(function () {
  'use strict';
  if (window.PvProduits) return;

  var MAX_PRODUITS = 100, MAX_PAR_CATALOGUE = 10;
  var TYPES_VENTE = ['ecom', 'commercial', ''];
  var LIB = {
    disponible: ['Disponible', 'pvp-dispo'], indisponible: ['Indisponible', 'pvp-indispo'],
    epuise: ['Épuisé', 'pvp-epuise'], masque: ['Masqué', 'pvp-masque']
  };
  var S = { initId: null, produits: [], catalogues: [], vue: 'liste', edition: null, photos: [null, null, null, null], filtre: 'tous', q: '', glisse: null, message: '', erreur: '' };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function prix(n, devise) { var v = Number(n); if (!isFinite(v)) return ''; return v.toFixed(2).replace('.', ',') + ' ' + (!devise || devise === 'EUR' ? '€' : esc(devise)); }
  function racine() { return $('pv-produits-mount'); }

  /* ---------- données ---------- */
  function charger() {
    return Promise.all([
      api('GET', '/initiatives/' + S.initId + '/produits'),
      api('GET', '/initiatives/' + S.initId + '/catalogues')
    ]).then(function (r) {
      S.produits = (r[0] && r[0].produits) || [];
      S.catalogues = (r[1] && r[1].catalogues) || [];
    });
  }
  function apresChangement(msg) {
    S.message = msg || ''; S.erreur = '';
    return charger().then(function () {
      dessiner();
      try { if (typeof pvRefreshPreview === 'function') pvRefreshPreview(); } catch (e) {}
      try { if (typeof pvRenderCartouchePreview === 'function') pvRenderCartouchePreview(); } catch (e) {}
    });
  }
  function echec(e) { S.erreur = (e && e.message) || 'Une erreur est survenue. Réessayez.'; S.message = ''; dessiner(); }
  function produit(id) { for (var i = 0; i < S.produits.length; i++) if (Number(S.produits[i].id) === Number(id)) return S.produits[i]; return null; }
  function nomCatalogue(id) { for (var i = 0; i < S.catalogues.length; i++) if (Number(S.catalogues[i].id) === Number(id)) return S.catalogues[i].nom; return ''; }

  /* ---------- liste ---------- */
  function ligne(p, i, total) {
    var photo = p.photos && p.photos[0];
    var st = LIB[p.statut] || LIB.disponible;
    var enPromo = p.prix_promo != null && p.prix != null && Number(p.prix_promo) < Number(p.prix);
    var pr = p.prix == null ? '<span class="pvp-prix">Prix sur demande</span>'
      : enPromo ? '<span class="pvp-prix"><s>' + prix(p.prix, p.devise) + '</s>' + prix(p.prix_promo, p.devise) + '</span>'
      : '<span class="pvp-prix">' + prix(p.prix, p.devise) + '</span>';
    var vedette = Number(p.mis_en_avant) === 1;
    return '<div class="pvp-ligne" draggable="true" data-id="' + esc(p.id) + '">' +
      '<div class="pvp-ordre"><button type="button" class="pvp-mini" data-a="haut" aria-label="Monter « ' + esc(p.nom) + ' »"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
      '<span class="pvp-poignee" aria-hidden="true" title="Glisser pour changer l\'ordre">⋮⋮</span>' +
      '<button type="button" class="pvp-mini" data-a="bas" aria-label="Descendre « ' + esc(p.nom) + ' »"' + (i === total - 1 ? ' disabled' : '') + '>▼</button></div>' +
      '<div class="pvp-vignette">' + (photo ? '<img src="' + esc(photo) + '" alt="" loading="lazy">' : '<span aria-hidden="true">📦</span>') + '</div>' +
      '<div class="pvp-info"><p class="pvp-nom">' + esc(p.nom) + '</p><div class="pvp-meta">' + pr +
      '<span class="pvp-pastille ' + st[1] + '">' + st[0] + '</span>' +
      (vedette ? '<span class="pvp-pastille pvp-avant">★ Mis en avant</span>' : '') + '</div></div>' +
      '<div class="pvp-actions">' +
      '<button type="button" class="pvp-btn pvp-petit" data-a="edit">Modifier</button>' +
      '<button type="button" class="pvp-btn pvp-petit' + (vedette ? ' pvp-on' : '') + '" data-a="avant" aria-pressed="' + (vedette ? 'true' : 'false') + '" title="' + (vedette ? 'Retirer des produits mis en avant' : 'Mettre en avant (3 maximum)') + '" aria-label="' + (vedette ? 'Retirer « ' + esc(p.nom) + ' » des produits mis en avant' : 'Mettre « ' + esc(p.nom) + ' » en avant') + '">★</button>' +
      '<button type="button" class="pvp-btn pvp-petit" data-a="masque" title="' + (p.statut === 'masque' ? 'Afficher dans la boutique' : 'Masquer de la boutique') + '" aria-label="' + (p.statut === 'masque' ? 'Afficher' : 'Masquer') + ' « ' + esc(p.nom) + ' »">' + (p.statut === 'masque' ? '👁' : '🙈') + '</button>' +
      '</div></div>';
  }

  function groupes() {
    var q = S.q.trim().toLowerCase();
    var visibles = S.produits.filter(function (p) {
      return (S.filtre === 'tous' || (p.statut || 'disponible') === S.filtre) && (!q || String(p.nom || '').toLowerCase().indexOf(q) > -1);
    });
    var ordre = S.catalogues.map(function (c) { return { id: c.id, nom: c.nom, masque: c.statut === 'masque', items: [] }; });
    var sans = { id: null, nom: 'Non classé', items: [] };
    visibles.forEach(function (p) {
      var g = null;
      if (p.catalogue_id != null) ordre.forEach(function (x) { if (Number(x.id) === Number(p.catalogue_id)) g = x; });
      (g || sans).items.push(p);
    });
    ordre.push(sans);
    return ordre.filter(function (g) { return g.items.length; });
  }

  function vueListe() {
    var n = S.produits.length;
    var gs = groupes();
    var h = '<div class="pvp-barre"><span class="pvp-compteur"><b>' + n + '</b> produit' + (n > 1 ? 's' : '') + ' sur ' + MAX_PRODUITS +
      ' <span class="pvp-jauge" aria-hidden="true"><i style="width:' + Math.min(100, Math.max(3, n)) + '%"></i></span></span>' +
      '<button type="button" class="pvp-btn pvp-or pvp-pousse" data-a="ajouter"' + (n >= MAX_PRODUITS ? ' disabled' : '') + '>＋ Ajouter un produit</button></div>';
    if (n >= MAX_PRODUITS) h += '<p class="pvp-note">Limite de ' + MAX_PRODUITS + ' produits atteinte : supprimez-en un pour en ajouter un nouveau.</p>';
    if (n) {
      h += '<div class="pvp-outils"><input type="search" id="pvp-rech" placeholder="Rechercher un produit…" aria-label="Rechercher un produit" value="' + esc(S.q) + '">' +
        '<div class="pvp-puces" role="group" aria-label="Filtrer par statut">' +
        [['tous', 'Tous'], ['disponible', 'Disponibles'], ['indisponible', 'Indisponibles'], ['epuise', 'Épuisés'], ['masque', 'Masqués']].map(function (f) {
          return '<button type="button" class="pvp-puce' + (S.filtre === f[0] ? ' on' : '') + '" data-f="' + f[0] + '" aria-pressed="' + (S.filtre === f[0]) + '">' + f[1] + '</button>';
        }).join('') + '</div></div>';
    }
    if (!n) {
      h += '<div class="pvp-vide"><b>Votre boutique n\'a pas encore de produit.</b><br>Ajoutez votre premier produit : une photo, un nom et un prix suffisent pour commencer.</div>';
    } else if (!gs.length) {
      h += '<div class="pvp-vide"><b>Aucun produit ne correspond.</b><br>Essayez un autre mot ou un autre statut.</div>';
    } else {
      h += '<div class="pvp-groupes">' + gs.map(function (g) {
        var total = S.produits.filter(function (p) { return g.id == null ? p.catalogue_id == null : Number(p.catalogue_id) === Number(g.id); }).length;
        return '<section class="pvp-groupe" data-cat="' + (g.id == null ? '' : esc(g.id)) + '"><header><h4>' + esc(g.nom) + (g.masque ? ' <small>(catalogue masqué)</small>' : '') + '</h4>' +
          '<small>' + total + (g.id == null ? ' article' + (total > 1 ? 's' : '') : ' / ' + MAX_PAR_CATALOGUE + ' articles') + '</small></header>' +
          g.items.map(function (p, i) { return ligne(p, i, g.items.length); }).join('') + '</section>';
      }).join('') + '</div><p class="pvp-note">Glissez la poignée ⋮⋮ (ou utilisez les flèches) pour changer l\'ordre d\'affichage. 3 produits « mis en avant » au maximum.</p>';
    }
    return h;
  }

  /* ---------- formulaire ---------- */
  function champ(id, lib, html, large) { return '<div' + (large ? ' class="pvp-large"' : '') + '><label for="' + id + '">' + lib + '</label>' + html + '</div>'; }
  function vueForm() {
    var p = S.edition ? produit(S.edition) : null;
    var cat = p ? p.catalogue_id : null;
    var statut = (p && p.statut) || 'disponible';
    var exp = p && Number(p.livraison_expedition) === 1;
    var slots = [0, 1, 2, 3].map(function (i) {
      var u = S.photos[i];
      return '<div class="pvp-photo' + (u ? ' pleine' : '') + '" data-slot="' + i + '">' +
        (u ? '<img src="' + esc(u) + '" alt="Photo ' + (i + 1) + '">' + (i === 0 ? '<small>Principale</small>' : '') + '<button type="button" class="pvp-photo-x" data-a="photo-x" data-i="' + i + '" aria-label="Retirer la photo ' + (i + 1) + '">✕</button>'
          : '<button type="button" class="pvp-photo-add" data-a="photo-add" data-i="' + i + '"><b>＋</b>Ajouter</button>') +
        '<input type="file" accept="image/jpeg,image/png,image/webp" data-file="' + i + '" hidden></div>';
    }).join('');
    var opts = '<option value="">— Non classé —</option>' + S.catalogues.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (cat != null && Number(cat) === Number(c.id) ? ' selected' : '') + '>' + esc(c.nom) + '</option>';
    }).join('');
    return '<div class="pvp-form">' +
      '<div><button type="button" class="pvp-btn pvp-petit" data-a="retour">← Retour à mes produits</button>' +
      '<h4 class="pvp-titre">' + (p ? 'Modifier « ' + esc(p.nom) + ' »' : 'Nouveau produit') + '</h4>' +
      '<p class="pvp-aide">Les champs marqués d\'une étoile sont obligatoires. Vous pourrez tout modifier plus tard.</p></div>' +
      '<fieldset class="pvp-carte"><legend>Photos</legend><p class="pvp-aide">Jusqu\'à 4 photos. La première s\'affiche sur la carte du produit.</p><div class="pvp-photos">' + slots + '</div></fieldset>' +
      '<fieldset class="pvp-carte"><legend>Informations</legend><div class="pvp-champs">' +
        champ('pvp-nom', 'Nom *', '<input type="text" id="pvp-nom" maxlength="140" value="' + esc(p ? p.nom : '') + '" placeholder="Ex : Pagne wax premium — 6 yards">', true) +
        champ('pvp-desc', 'Description', '<textarea id="pvp-desc" placeholder="Matière, taille, origine, conseils d\'entretien…">' + esc(p ? p.description || '' : '') + '</textarea>', true) +
        champ('pvp-cat', 'Catalogue', '<select id="pvp-cat">' + opts + '</select><button type="button" class="pvp-lien" data-a="nouveau-cat">＋ Créer un catalogue</button>' +
          '<div class="pvp-nouveau-cat" id="pvp-nouveau-cat" hidden><input type="text" id="pvp-cat-nom" maxlength="80" placeholder="Nom du catalogue"><button type="button" class="pvp-btn pvp-petit" data-a="creer-cat">Créer</button></div>') +
        champ('pvp-categorie', 'Catégorie', '<input type="text" id="pvp-categorie" maxlength="80" value="' + esc(p ? p.categorie || '' : '') + '" placeholder="Ex : Mode">') +
        champ('pvp-ref', 'Référence', '<input type="text" id="pvp-ref" maxlength="60" value="' + esc(p ? p.reference || '' : '') + '" placeholder="Automatique si vide">') +
      '</div></fieldset>' +
      '<fieldset class="pvp-carte"><legend>Prix</legend><p class="pvp-aide">Les paiements restent en simulation : aucun argent réel n\'est encaissé.</p><div class="pvp-champs">' +
        champ('pvp-prix', 'Prix (EUR)', '<input type="number" id="pvp-prix" step="0.01" min="0" inputmode="decimal" value="' + (p && p.prix != null ? esc(p.prix) : '') + '" placeholder="0.00">') +
        champ('pvp-promo', 'Prix promo (facultatif)', '<input type="number" id="pvp-promo" step="0.01" min="0" inputmode="decimal" value="' + (p && p.prix_promo != null ? esc(p.prix_promo) : '') + '" placeholder="0.00">') +
      '</div></fieldset>' +
      '<fieldset class="pvp-carte"><legend>Disponibilité</legend><div class="pvp-champs">' +
        champ('pvp-statut', 'Statut', '<select id="pvp-statut">' + [['disponible', 'Disponible'], ['indisponible', 'Temporairement indisponible'], ['epuise', 'Épuisé'], ['masque', 'Masqué (invisible du public)']].map(function (s) {
          return '<option value="' + s[0] + '"' + (statut === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>') +
        '<div id="pvp-retour-wrap"' + (statut === 'indisponible' ? '' : ' hidden') + '><label for="pvp-retour">Date de retour estimée</label><input type="date" id="pvp-retour" value="' + esc(p && p.date_retour ? p.date_retour : '') + '"></div>' +
      '</div></fieldset>' +
      '<fieldset class="pvp-carte"><legend>Livraison et devis</legend><p class="pvp-aide">Le retrait est proposé par défaut. L\'expédition doit être activée ici pour être choisie à l\'achat.</p><div class="pvp-choix">' +
        '<label class="pvp-option"><input type="checkbox" id="pvp-retrait"' + (!p || Number(p.livraison_retrait) !== 0 ? ' checked' : '') + '><div><b>Retrait sur place</b><span>Le client vient récupérer sa commande.</span></div></label>' +
        '<label class="pvp-option"><input type="checkbox" id="pvp-exp"' + (exp ? ' checked' : '') + '><div><b>Expédition</b><span>L\'acheteur renseigne son adresse à la commande.</span></div></label>' +
        '<div id="pvp-frais-wrap"' + (exp ? '' : ' hidden') + '><label for="pvp-frais">Frais d\'expédition (EUR)</label><input type="number" id="pvp-frais" step="0.01" min="0" inputmode="decimal" value="' + (p && p.frais_expedition != null ? esc(p.frais_expedition) : '') + '" placeholder="0.00"><p class="pvp-aide">Ajoutés au montant payé si l\'acheteur choisit l\'expédition. Laissez vide pour une expédition gratuite.</p></div>' +
        champ('pvp-devis', '📩 Demande de devis', '<select id="pvp-devis"><option value=""' + (!p || p.devis_active == null ? ' selected' : '') + '>Selon le réglage général de la boutique</option>' +
          '<option value="1"' + (p && p.devis_active != null && Number(p.devis_active) === 1 ? ' selected' : '') + '>Autoriser les demandes de devis</option>' +
          '<option value="0"' + (p && p.devis_active != null && Number(p.devis_active) === 0 ? ' selected' : '') + '>Désactiver les demandes de devis</option></select>') +
      '</div></fieldset>' +
      '<p class="pvp-erreur" id="pvp-err" role="alert"' + (S.erreur ? '' : ' hidden') + '>' + esc(S.erreur) + '</p>' +
      '<div class="pvp-pied"><button type="button" class="pvp-btn pvp-or" data-a="enreg" id="pvp-enreg">' + (p ? 'Enregistrer les modifications' : 'Ajouter le produit') + '</button>' +
      '<button type="button" class="pvp-btn" data-a="retour">Annuler</button>' +
      (p ? '<button type="button" class="pvp-btn pvp-danger pvp-pousse" data-a="suppr">Supprimer</button>' : '') + '</div></div>';
  }

  function dessiner() {
    var r = racine(); if (!r) return;
    var enForm = S.vue === 'form';
    r.innerHTML = (S.message && !enForm ? '<p class="pvp-ok" role="status">' + esc(S.message) + '</p>' : '') +
      (S.erreur && !enForm ? '<p class="pvp-erreur" role="alert">' + esc(S.erreur) + '</p>' : '') +
      (enForm ? vueForm() : vueListe());
  }

  /* ---------- actions ---------- */
  function ouvrirForm(id) {
    var p = id ? produit(id) : null;
    S.vue = 'form'; S.edition = id || null; S.erreur = ''; S.message = '';
    S.photos = [null, null, null, null];
    if (p && p.photos) p.photos.forEach(function (u, i) { if (i < 4) S.photos[i] = u; });
    dessiner();
    var c = $('pv-produits'); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var n = $('pvp-nom'); if (n) n.focus({ preventScroll: true });
  }
  function fermerForm() { S.vue = 'liste'; S.edition = null; S.erreur = ''; dessiner(); }

  function lireForm() {
    var num = function (id) { var v = $(id).value; return v === '' ? null : Number(v); };
    var statut = $('pvp-statut').value;
    return {
      nom: $('pvp-nom').value.trim(),
      description: $('pvp-desc').value.trim() || null,
      prix: num('pvp-prix'), prix_promo: num('pvp-promo'),
      categorie: $('pvp-categorie').value.trim() || null,
      reference: $('pvp-ref').value.trim() || null,
      statut: statut, date_retour: statut === 'indisponible' ? ($('pvp-retour').value || null) : null,
      photos: S.photos.filter(Boolean),
      catalogue_id: $('pvp-cat').value ? Number($('pvp-cat').value) : null,
      devis_active: $('pvp-devis').value === '' ? null : Number($('pvp-devis').value),
      livraison_retrait: $('pvp-retrait').checked, livraison_expedition: $('pvp-exp').checked,
      frais_expedition: $('pvp-exp').checked ? num('pvp-frais') : null
    };
  }
  function erreurForm(msg) {
    S.erreur = msg; var e = $('pvp-err'); if (e) { e.textContent = msg; e.hidden = false; e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  function enregistrer() {
    var d = lireForm();
    if (!d.nom) { erreurForm('Le nom du produit est obligatoire.'); $('pvp-nom').focus(); return; }
    if ((d.prix != null && !(d.prix >= 0)) || (d.prix_promo != null && !(d.prix_promo >= 0))) { erreurForm('Les prix doivent être des nombres positifs.'); return; }
    if (d.prix_promo != null && d.prix != null && d.prix_promo >= d.prix) { erreurForm('Le prix promo doit être inférieur au prix normal.'); return; }
    var b = $('pvp-enreg'); if (b) { b.disabled = true; b.textContent = 'Enregistrement…'; }
    var edition = S.edition;
    var req = edition ? api('PUT', '/produits/' + edition, d) : api('POST', '/initiatives/' + S.initId + '/produits', d);
    req.then(function () {
      S.vue = 'liste'; S.edition = null;
      return apresChangement(edition ? 'Modifications enregistrées. Votre boutique est à jour.' : 'Produit ajouté. Il apparaît déjà dans votre boutique.');
    }).catch(function (e) {
      if (b) { b.disabled = false; b.textContent = edition ? 'Enregistrer les modifications' : 'Ajouter le produit'; }
      erreurForm((e && e.message) || 'Enregistrement impossible. Réessayez.');
    });
  }

  function supprimer() {
    var p = produit(S.edition); if (!p) return;
    if (!confirm('Supprimer « ' + p.nom + ' » ? Cette action est définitive.')) return;
    api('DELETE', '/produits/' + p.id).then(function () { S.vue = 'liste'; S.edition = null; return apresChangement('Produit supprimé.'); }).catch(echec);
  }

  function basculerVedette(id) {
    api('PUT', '/produits/' + id + '/mise-en-avant').then(function (r) {
      return apresChangement(r && r.mis_en_avant ? 'Produit mis en avant.' : 'Produit retiré des produits mis en avant.');
    }).catch(echec);
  }
  function basculerMasque(id) {
    var p = produit(id); if (!p) return;
    var vers = p.statut === 'masque' ? 'disponible' : 'masque';
    api('PUT', '/produits/' + id, { statut: vers }).then(function () {
      return apresChangement(vers === 'masque' ? '« ' + p.nom + ' » est masqué : les visiteurs ne le voient plus.' : '« ' + p.nom + ' » est de nouveau visible.');
    }).catch(echec);
  }

  /* Ordre : on réécrit l'ordre des articles du groupe (même catalogue). */
  function enregistrerOrdre(catId, ids) {
    var payload = { order: ids.map(Number) };
    if (catId !== '' && catId != null) payload.catalogue_id = Number(catId);
    return api('PATCH', '/initiatives/' + S.initId + '/produits/reorder', payload).then(function () { return apresChangement('Ordre enregistré.'); }).catch(echec);
  }
  function idsDuGroupe(section) {
    return Array.prototype.map.call(section.querySelectorAll('.pvp-ligne'), function (l) { return l.dataset.id; });
  }
  function deplacer(ligneEl, sens) {
    var sec = ligneEl.closest('.pvp-groupe'), ids = idsDuGroupe(sec), i = ids.indexOf(ligneEl.dataset.id), j = i + sens;
    if (i < 0 || j < 0 || j >= ids.length) return;
    var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    enregistrerOrdre(sec.dataset.cat, ids);
  }

  function envoyerPhoto(i, fichier) {
    var slot = document.querySelector('.pvp-photo[data-slot="' + i + '"]'); if (slot) slot.classList.add('charge');
    return Promise.resolve(compressImageFile(fichier, 800, 800, 0.82)).then(function (c) { return uploadMedia(c, 'produit'); }).then(function (url) {
      S.photos[i] = url; S.erreur = ''; majPhotos();
    }).catch(function (e) { if (slot) slot.classList.remove('charge'); erreurForm('Photo non envoyée : ' + ((e && e.message) || 'réessayez avec une autre image.')); });
  }
  function majPhotos() {
    var p = document.querySelector('.pvp-photos'); if (!p) return;
    var tmp = document.createElement('div'); tmp.innerHTML = vueForm();
    var neuf = tmp.querySelector('.pvp-photos'); if (neuf) p.innerHTML = neuf.innerHTML;
  }

  function creerCatalogue() {
    var n = $('pvp-cat-nom'); var nom = n && n.value.trim(); if (!nom) { if (n) n.focus(); return; }
    var garde = lireFormSecurise();
    api('POST', '/initiatives/' + S.initId + '/catalogues', { nom: nom }).then(function (r) {
      return api('GET', '/initiatives/' + S.initId + '/catalogues').then(function (c) {
        S.catalogues = (c && c.catalogues) || []; dessiner(); restaurerForm(garde);
        var sel = $('pvp-cat'); if (sel && r && r.id != null) sel.value = String(r.id);
      });
    }).catch(function (e) { erreurForm((e && e.message) || 'Catalogue non créé.'); });
  }
  /* Garde les champs déjà saisis quand on redessine le formulaire (création d'un catalogue). */
  function lireFormSecurise() { try { return lireForm(); } catch (e) { return null; } }
  function restaurerForm(d) {
    if (!d) return;
    $('pvp-nom').value = d.nom || ''; $('pvp-desc').value = d.description || ''; $('pvp-categorie').value = d.categorie || ''; $('pvp-ref').value = d.reference || '';
    $('pvp-prix').value = d.prix == null ? '' : d.prix; $('pvp-promo').value = d.prix_promo == null ? '' : d.prix_promo;
    $('pvp-statut').value = d.statut; $('pvp-retrait').checked = d.livraison_retrait; $('pvp-exp').checked = d.livraison_expedition;
    $('pvp-devis').value = d.devis_active == null ? '' : String(d.devis_active);
    $('pvp-frais').value = d.frais_expedition == null ? '' : d.frais_expedition; $('pvp-retour').value = d.date_retour || '';
    $('pvp-retour-wrap').hidden = d.statut !== 'indisponible'; $('pvp-frais-wrap').hidden = !d.livraison_expedition;
    S.photos = [null, null, null, null]; (d.photos || []).forEach(function (u, i) { S.photos[i] = u; }); majPhotos();
  }

  /* ---------- événements (délégués sur la racine) ---------- */
  function brancher() {
    var r = racine(); if (!r || r.__pvpBranche) return; r.__pvpBranche = true;
    r.addEventListener('click', function (e) {
      var f = e.target.closest('[data-f]');
      if (f) { S.filtre = f.dataset.f; dessiner(); return; }
      var b = e.target.closest('[data-a]'); if (!b) return;
      var a = b.dataset.a, l = b.closest('.pvp-ligne'), id = l && l.dataset.id;
      if (a === 'ajouter') ouvrirForm(null);
      else if (a === 'edit') ouvrirForm(id);
      else if (a === 'avant') basculerVedette(id);
      else if (a === 'masque') basculerMasque(id);
      else if (a === 'haut') deplacer(l, -1);
      else if (a === 'bas') deplacer(l, 1);
      else if (a === 'retour') fermerForm();
      else if (a === 'enreg') enregistrer();
      else if (a === 'suppr') supprimer();
      else if (a === 'photo-add') { var inp = b.parentNode.querySelector('input[type=file]'); if (inp) inp.click(); }
      else if (a === 'photo-x') { S.photos[Number(b.dataset.i)] = null; majPhotos(); }
      else if (a === 'nouveau-cat') { var z = $('pvp-nouveau-cat'); if (z) { z.hidden = false; $('pvp-cat-nom').focus(); } }
      else if (a === 'creer-cat') creerCatalogue();
    });
    r.addEventListener('input', function (e) { if (e.target.id === 'pvp-rech') { S.q = e.target.value; var pos = e.target.selectionStart; dessiner(); var n = $('pvp-rech'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} } } });
    r.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'pvp-statut') $('pvp-retour-wrap').hidden = t.value !== 'indisponible';
      else if (t.id === 'pvp-exp') $('pvp-frais-wrap').hidden = !t.checked;
      else if (t.dataset && t.dataset.file != null && t.files && t.files[0]) envoyerPhoto(Number(t.dataset.file), t.files[0]);
    });
    r.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'pvp-cat-nom') { e.preventDefault(); creerCatalogue(); } });
    /* Glisser-déposer : l'ordre ne change qu'à l'intérieur d'un même catalogue. */
    r.addEventListener('dragstart', function (e) { var l = e.target.closest && e.target.closest('.pvp-ligne'); if (!l) return; S.glisse = l.dataset.id; l.classList.add('glisse'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.dataset.id); } catch (x) {} });
    r.addEventListener('dragend', function (e) { var l = e.target.closest && e.target.closest('.pvp-ligne'); if (l) l.classList.remove('glisse'); S.glisse = null; });
    r.addEventListener('dragover', function (e) { var l = e.target.closest && e.target.closest('.pvp-ligne'); if (l && S.glisse) e.preventDefault(); });
    r.addEventListener('drop', function (e) {
      var cible = e.target.closest && e.target.closest('.pvp-ligne'); if (!cible || !S.glisse || cible.dataset.id === S.glisse) return;
      e.preventDefault();
      var sec = cible.closest('.pvp-groupe'), ids = idsDuGroupe(sec), de = ids.indexOf(String(S.glisse));
      if (de < 0) { S.erreur = 'Un produit ne peut changer d\'ordre qu\'à l\'intérieur de son catalogue. Pour le déplacer, modifiez son catalogue.'; dessiner(); return; }
      ids.splice(de, 1); ids.splice(ids.indexOf(cible.dataset.id), 0, String(S.glisse));
      enregistrerOrdre(sec.dataset.cat, ids);
    });
  }

  /* ---------- montage ---------- */
  function monter(init) {
    var carte = $('pv-produits'); if (!carte) return;
    var type = init && init.vitrine_type ? String(init.vitrine_type) : '';
    if (!init || !init.id || TYPES_VENTE.indexOf(type) < 0) { carte.style.display = 'none'; return; }
    carte.style.display = '';
    S.initId = init.id; S.vue = 'liste'; S.edition = null; S.message = ''; S.erreur = '';
    brancher();
    var r = racine(); if (r && !S.produits.length) r.innerHTML = '<div class="notice">Chargement de vos produits…</div>';
    charger().then(function () {
      dessiner();
      if (/[#&]produits(&|$)/.test(location.hash)) { try { carte.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    }).catch(function (e) { if (r) r.innerHTML = '<p class="pvp-erreur" role="alert">Vos produits n\'ont pas pu être chargés : ' + esc((e && e.message) || 'erreur réseau') + '. <button type="button" class="pvp-lien" id="pvp-retenter">Réessayer</button></p>'; var b = $('pvp-retenter'); if (b) b.onclick = function () { monter(init); }; });
  }

  window.PvProduits = { monter: monter };
})();
