/* Boutique « Organismes de financement » — boutique-finance.html, 2026-11-12 (lot E).
   Lit : /initiatives/:id (présentation, programmes = services, projets accompagnés = réalisations, résultats, équipe, rendez-vous,
         documents, témoignages, certifications, état des rubriques), /initiatives/:id/partenaires, /auth/me (lien « Mon compte »).
   N'écrit rien. AUCUN formulaire de dépôt de projet : le bouton « Soumettre à Diaspo'Actif » (data-depot) est géré par
   assets/depot-central.js. Les contacts passent par la messagerie, les rendez-vous par le lien de l'organisme ou la messagerie.
   Aucun paiement, aucune souscription. Couleurs : style de la boutique (vitrine_style_json.couleurs), sinon Marine, Orange et Vert.
   Paramètre d'adresse : ?id=… (ou ?slug=…). */
(function () {
  'use strict';
  var app = document.getElementById('imp-app');
  var etat = { init: null, partenaires: [], moi: null };

  /* ── utilitaires ── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(methode, chemin, corps) {
    return fetch('/api' + chemin, { method: methode, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Erreur.'); e.status = r.status; throw e; } return j; }); });
  }
  function texte(s) { return String(s == null ? '' : s).trim(); }
  function lienSur(u) { var s = texte(u); if (!s) return ''; if (/^https?:\/\//i.test(s)) return s; if (/^[\w.-]+\.[a-z]{2,}/i.test(s)) return 'https://' + s; return ''; }
  /* Adresse d'image ou de fichier : http(s), chemin du site ou image intégrée ; tout le reste (javascript:, etc.) est refusé. */
  function imageSure(u) {
    var s = texte(u);
    if (!s) return '';
    if (/^(https?:\/\/|\/)/i.test(s) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s) || /^[\w.\-\/]+\.(png|jpe?g|webp|gif|svg)$/i.test(s)) return s;
    return '';
  }
  function fichierSur(u) { var s = texte(u); return /^(https?:\/\/|\/)/i.test(s) ? s : (lienSur(s) || ''); }
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
    banque: '<path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M2 20h20M12 4l9 5H3z"/>',
    projet: '<path d="M4 20V9l8-5 8 5v11z"/><path d="M9 20v-6h6v6"/>',
    groupe: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-5.6 6-5.6s6 2 6 5.6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.2c2.5.2 4 1.9 4 4.8"/>',
    cible: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    message: '<path d="M4 5h16v11H9l-5 4z"/>',
    compte: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    envoi: '<path d="M4 12l16-8-6 16-3-7z"/>'
  };
  function ic(nom) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[nom] || ICONES.banque) + '</svg>'; }

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

  /* ── données ── */
  function nom() { return etat.init.boutique_nom || etat.init.nom; }
  function proprio() { return etat.init.owner_user_id; }
  function lienMessage(objetMsg) { return 'messagerie.html?with=' + proprio() + '&origine=vitrine&objet=' + encodeURIComponent(objetMsg); }
  /* Programmes : une ligne du champ « Services » = un programme ; « Titre : description » est séparé en deux. */
  function programmes() {
    if (!rubrique('services')) return [];
    return enTexte(etat.init.vitrine_services).split(/\n+/).map(function (l) { return l.replace(/^[\s\-*\u2022\u2714]+/, '').trim(); }).filter(Boolean).slice(0, 24).map(function (l) {
      var m = /^(.{2,80}?)\s*:\s+(.+)$/.exec(l);
      return m ? { titre: m[1], description: m[2] } : { titre: l, description: '' };
    });
  }
  function projets() { return rubrique('realisations') ? liste(etat.init.realisations_json || etat.init.realisations).filter(function (r) { return r && texte(r.titre); }) : []; }
  function resultats() { return rubrique('resultats_impact') ? liste(etat.init.vitrine_resultats_impact || etat.init.vitrine_resultats_impact_json).filter(function (r) { return r && texte(r.valeur); }) : []; }
  function equipe() { return rubrique('equipe') ? liste(etat.init.vitrine_equipe_json).filter(function (m) { return m && texte(m.nom); }) : []; }
  function rendezVous() { return rubrique('reservation') ? liste(etat.init.vitrine_reservation_json).filter(function (r) { return r && texte(r.intitule); }) : []; }
  function documents() { return rubrique('documents') ? liste(etat.init.documents || etat.init.vitrine_documents_json).filter(function (d) { return d && texte(d.titre) && fichierSur(d.url); }) : []; }
  function temoignages() { return rubrique('temoignages') ? liste(etat.init.vitrine_temoignages || etat.init.vitrine_temoignages_json).filter(function (t) { return t && texte(t.texte); }) : []; }
  function agrements() { return rubrique('certifications') ? liste(etat.init.vitrine_certifications || etat.init.vitrine_certifications_json).filter(function (c) { return c && texte(c.nom); }) : []; }
  function partenaires() { return rubrique('partenaires') ? etat.partenaires : []; }
  function presentation() { return rubrique('a_propos') ? enTexte(etat.init.description || '') : ''; }
  function mission() { return rubrique('a_propos') ? enTexte(etat.init.mission || '') : ''; }

  function chiffres() {
    var t = [];
    resultats().slice(0, 3).forEach(function (r) { t.push({ icone: 'cible', valeur: texte(r.valeur), libelle: texte(r.libelle) }); });
    if (t.length < 3 && programmes().length) t.push({ icone: 'banque', valeur: String(programmes().length), libelle: programmes().length > 1 ? 'programmes et offres' : 'programme ou offre' });
    if (t.length < 3 && projets().length) t.push({ icone: 'projet', valeur: String(projets().length), libelle: projets().length > 1 ? 'projets accompagnés' : 'projet accompagné' });
    if (t.length < 3 && partenaires().length) t.push({ icone: 'groupe', valeur: String(partenaires().length), libelle: partenaires().length > 1 ? 'partenaires' : 'partenaire' });
    return t.slice(0, 3);
  }

  /* ── morceaux de page ── */
  function logoHtml() {
    var src = imageSure(etat.init.logo_url);
    return src ? '<img src="' + esc(src) + '" alt="">' : esc((nom() || '?').charAt(0).toUpperCase());
  }
  function rubriquesNav() {
    var n = [];
    if (programmes().length) n.push(['programmes', 'Programmes']);
    if (projets().length) n.push(['projets', 'Projets accompagnés']);
    if (resultats().length) n.push(['resultats', 'Résultats']);
    if (rendezVous().length) n.push(['rendez-vous', 'Rendez-vous']);
    if (documents().length) n.push(['documents', 'Documents']);
    if (equipe().length) n.push(['equipe', 'Équipe']);
    if (partenaires().length) n.push(['partenaires', 'Partenaires']);
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
    var slogan = texte(i.slogan) || texte(i.boutique_description) || enTexte(i.description).slice(0, 170) || 'Financer, accompagner et faire grandir les projets.';
    var t = chiffres();
    var lieu = [texte(i.ville), texte(i.pays)].filter(Boolean).join(', ');
    return '<section class="hero' + (ban ? ' image' : '') + '"' + (ban ? ' style="background-image:url(\'' + esc(ban) + '\')"' : '') + '><div class="hero-in"><div>' +
      '<p class="kicker">Organisme de financement' + (lieu ? ' · ' + esc(lieu) : '') + '</p><h1>' + esc(nom()) + '</h1><p class="lead">' + esc(slogan) + '</p>' +
      '<div class="rang"><button type="button" class="btn acc" data-depot>' + ic('envoi') + 'Soumettre à Diaspo’Actif</button>' +
      '<a class="btn clair" href="' + esc(lienMessage('Contact : ' + nom())) + '">' + ic('message') + 'Nous contacter</a></div></div>' +
      (t.length ? '<aside class="stats" aria-label="Chiffres clés">' + t.map(function (x) { return '<div class="stat"><span class="pict">' + ic(x.icone) + '</span><div><b>' + esc(x.valeur) + '</b><span>' + esc(x.libelle) + '</span></div></div>'; }).join('') + '</aside>' : '') +
      '</div></section>';
  }
  function blocPresentation() {
    var p = presentation(), m = mission();
    if (!p && !m) return '';
    return '<section class="bloc" id="presentation"><div class="sh"><h2>Qui sommes-nous</h2></div><div class="vision' + (p && m ? '' : ' seul') + '">' +
      (p ? '<div class="texte"><h3>Notre organisme</h3>' + paragraphes(p) + '</div>' : '') +
      (m ? '<div class="texte"><h3>Notre mission</h3>' + paragraphes(m) + '</div>' : '') + '</div></section>';
  }
  function blocProgrammes() {
    var p = programmes(); if (!p.length) return '';
    return '<section class="bloc" id="programmes"><div class="sh"><h2>Nos programmes et offres</h2><span class="nb">' + p.length + '</span></div><div class="programmes">' + p.map(function (x) {
      return '<article class="programme"><h3>' + esc(x.titre) + '</h3>' + (x.description ? '<p>' + esc(x.description) + '</p>' : '') +
        '<a class="btn petit" href="' + esc(lienMessage('Programme : ' + x.titre)) + '">En savoir plus</a></article>';
    }).join('') + '</div><p class="avis-info">Les conditions, montants et critères sont précisés par l’organisme. Pour faire financer un projet, utilisez « Soumettre à Diaspo’Actif » : aucun dépôt ne se fait ici.</p></section>';
  }
  function blocProjets() {
    var r = projets(); if (!r.length) return '';
    return '<section class="bloc" id="projets"><div class="sh"><h2>Projets accompagnés</h2><span class="nb">' + r.length + '</span></div><div class="realisations">' + r.map(function (x) {
      var img = imageSure(x.image), lien = lienSur(x.lien), inner = (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : '') + '<div>' + (texte(x.categorie) ? '<small>' + esc(x.categorie) + '</small>' : '') + '<b>' + esc(x.titre) + '</b>' + (texte(x.description) ? '<p>' + esc(texte(x.description)) + '</p>' : '') + '</div>';
      return lien ? '<a class="real" href="' + esc(lien) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>' : '<div class="real">' + inner + '</div>';
    }).join('') + '</div></section>';
  }
  function blocResultats() {
    var r = resultats(); if (!r.length) return '';
    return '<section class="bloc" id="resultats"><div class="sh"><h2>Nos résultats</h2></div><div class="resultats">' +
      r.map(function (x) { return '<div class="resultat"><b>' + esc(texte(x.valeur)) + '</b><span>' + esc(texte(x.libelle)) + '</span></div>'; }).join('') + '</div></section>';
  }
  function blocRendezVous() {
    var r = rendezVous(); if (!r.length) return '';
    return '<section class="bloc" id="rendez-vous"><div class="sh"><h2>Prendre rendez-vous</h2></div><div class="rdv">' + r.map(function (x) {
      var lien = lienSur(x.lien), detail = [texte(x.duree), texte(x.prix)].filter(Boolean).join(' · ');
      return '<div class="rdv-ligne"><div><b>' + esc(texte(x.intitule)) + '</b>' + (detail ? '<small>' + esc(detail) + '</small>' : '') + '</div>' +
        (lien ? '<a class="btn acc petit" href="' + esc(lien) + '" target="_blank" rel="noopener noreferrer">Réserver</a>' : '<a class="btn petit" href="' + esc(lienMessage('Rendez-vous : ' + texte(x.intitule))) + '">Demander</a>') + '</div>';
    }).join('') + '</div></section>';
  }
  function blocDocuments() {
    var d = documents(); if (!d.length) return '';
    return '<section class="bloc" id="documents"><div class="sh"><h2>Documents à télécharger</h2></div><div class="documents">' + d.map(function (x) {
      return '<a class="document" href="' + esc(fichierSur(x.url)) + '" target="_blank" rel="noopener noreferrer"><b>' + esc(texte(x.titre)) + '</b><span>Ouvrir</span></a>';
    }).join('') + '</div></section>';
  }
  function blocTemoignages() {
    var t = temoignages(); if (!t.length) return '';
    return '<section class="bloc" id="temoignages"><div class="sh"><h2>Témoignages</h2></div><div class="temoignages">' + t.map(function (x) {
      return '<blockquote class="temoignage"><p>' + esc(texte(x.texte)) + '</p>' + (texte(x.nom) ? '<footer><b>' + esc(texte(x.nom)) + '</b>' + (texte(x.fonction) ? ', ' + esc(texte(x.fonction)) : '') + '</footer>' : '') + '</blockquote>';
    }).join('') + '</div></section>';
  }
  function blocAgrements() {
    var c = agrements(); if (!c.length) return '';
    return '<section class="bloc" id="agrements"><div class="sh"><h2>Agréments et certifications</h2></div><div class="agrements">' +
      c.map(function (x) { return '<span class="agrement">' + esc(texte(x.nom)) + (texte(x.annee) ? ' · ' + esc(texte(x.annee)) : '') + '</span>'; }).join('') + '</div></section>';
  }
  function blocEquipe() {
    var m = equipe(); if (!m.length) return '';
    return '<section class="bloc" id="equipe"><div class="sh"><h2>Notre équipe</h2><span class="nb">' + m.length + '</span></div><div class="equipe">' + m.map(function (x) {
      var img = imageSure(x.photo);
      return '<div class="membre"><span class="avatar">' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : esc(texte(x.nom).charAt(0).toUpperCase())) + '</span><b>' + esc(texte(x.nom)) + '</b>' + (texte(x.fonction) ? '<small>' + esc(texte(x.fonction)) + '</small>' : '') + '</div>';
    }).join('') + '</div></section>';
  }
  function blocPartenaires() {
    var ps = partenaires(); if (!ps.length) return '';
    return '<section class="bloc" id="partenaires"><div class="sh"><h2>Nos partenaires</h2></div><div class="partenaires">' + ps.map(function (p) {
      var img = imageSure(p.logo_url), lien = lienSur(p.site_web);
      var inner = '<div class="logo-p">' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : '<span>' + esc(texte(p.nom).charAt(0).toUpperCase() || '?') + '</span>') + '</div><b>' + esc(p.nom) + '</b>' + (texte(p.type_partenaire) ? '<small>' + esc(p.type_partenaire) + '</small>' : '');
      return lien ? '<a class="part" href="' + esc(lien) + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit">' + inner + '</a>' : '<div class="part">' + inner + '</div>';
    }).join('') + '</div></section>';
  }
  function barreFinale() {
    return '<section class="final" id="soumettre"><div class="lead"><b>Un projet à faire financer ?</b><span>Les projets se déposent uniquement via Diaspo’Actif, qui les qualifie avant toute orientation vers un organisme.</span></div>' +
      '<div class="rang"><button type="button" class="btn acc" data-depot>' + ic('envoi') + 'Soumettre à Diaspo’Actif</button>' +
      '<a class="btn clair" href="' + esc(lienMessage('Demande de partenariat : ' + nom())) + '">' + ic('message') + 'Nous écrire</a></div></section>';
  }
  function pied() {
    var i = etat.init, lieu = [texte(i.ville), texte(i.pays)].filter(Boolean).join(', ');
    return '<footer class="pied"><div class="pied-in"><div><b>' + esc(nom()) + '</b>' + (lieu ? '<div>' + esc(lieu) + '</div>' : '') + '</div>' +
      '<div>Boutique hébergée sur <a href="index.html">Diaspo’Actif</a></div></div></footer>';
  }
  function page() {
    var corps = blocPresentation() + blocProgrammes() + blocProjets() + blocResultats() + blocRendezVous() + blocDocuments() + blocTemoignages() + blocAgrements() + blocEquipe() + blocPartenaires();
    return entete() + hero() + '<main class="wrap">' +
      (corps ? corps : '<section class="bloc"><div class="vide">Cet organisme n’a pas encore publié ses programmes. Revenez bientôt, ou écrivez-lui.</div></section>') +
      barreFinale() + '</main>' + pied();
  }
  function redessiner() { app.innerHTML = page(); }

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
      appliquerCouleurs(objet(etat.init.vitrine_style_json));
      var id = etat.init.id;
      return Promise.all([
        api('GET', '/initiatives/' + encodeURIComponent(id) + '/partenaires').then(function (r) { etat.partenaires = (r.partenaires || []).filter(function (p) { return p && texte(p.nom); }); }).catch(function () { etat.partenaires = []; }),
        api('GET', '/auth/me').then(function (r) { etat.moi = r.user || null; }).catch(function () {})
      ]);
    });
  }
  function demarrer() {
    var apres = function (maintenance) {
      if (maintenance) return;
      charger().then(function () {
        document.title = nom() + ' — Organisme de financement';
        redessiner();
      }).catch(function (e) {
        app.innerHTML = '<p class="imp-chargement">' + esc(e && e.status === 404 ? 'Cette boutique est introuvable.' : (e && e.message) || 'Impossible de charger la boutique.') + ' <a href="vitrines.html" style="color:var(--acc)">Voir les boutiques</a></p>';
      });
    };
    if (window.DA_verifierMaintenanceBoutique) window.DA_verifierMaintenanceBoutique(app).then(apres); else apres(false);
  }
  demarrer();
})();
