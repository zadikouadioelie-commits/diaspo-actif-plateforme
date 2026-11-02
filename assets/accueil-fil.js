/* ============================================================
   Diaspo'Actif — Bande « À la une » de l'accueil (2026-11-01, demande explicite)
   « Une bande à droite de la carte, avec le fil d'actualité et les reels mélangés : un reel et deux actualités, les uns
   sous les autres ; au clic, on continue et on voit tout le contenu de Diaspo'Actif, en reels ou en actualité texte. »
   - 1 Reel : la vidéo courte publique la plus récente (GET /api/fil/medias?type=video). Au clic, le visionneur plein écran des Reels
     (assets/media-viewer.js, chargé à la demande) s'ouvre sur CETTE vidéo et on enchaîne vers les suivantes en balayant.
   - 2 actualités texte : les dernières publications des comptes professionnels (GET /api/fil?mode=organisations). Au clic, la
     publication s'ouvre en plein écran dans le fil (fil-actualite-app.html?post=ID), avec ‹ › vers les autres.
   Sans Reel publié, la bande présente trois actualités ; sans aucune donnée, elle se retire (la page redevient celle d'avant).
   Tout le texte vient de l'API : il est posé par textContent (jamais en HTML).
   ============================================================ */
(function () {
  'use strict';
  var VERSION = '20261102i';
  var liste = document.getElementById('hp-fil-liste');
  var zone = document.getElementById('hp-hero-fil');
  if (!liste || !zone) return;

  function get(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)); });
  }
  /* Texte brut : l'API renvoie parfois des titres avec <strong> et du Markdown (« **gras** »). */
  function brut(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
  }
  function urlSure(u) { return typeof u === 'string' && /^(https:\/\/|\/[^\/])/.test(u) ? u : ''; }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  /* « il y a 3 j » — les dates de l'API sont en UTC, sans fuseau. */
  function depuis(d) {
    if (!d) return '';
    var t = Date.parse(String(d).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(d)) ? '' : 'Z'));
    if (isNaN(t)) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 3600) return 'il y a ' + Math.max(1, Math.round(s / 60)) + ' min';
    if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
    if (s < 86400 * 30) return 'il y a ' + Math.round(s / 86400) + ' j';
    if (s < 86400 * 365) return 'il y a ' + Math.round(s / (86400 * 30)) + ' mois';
    return 'il y a ' + Math.round(s / (86400 * 365)) + ' an(s)';
  }
  function avatar(nom, photo) {
    var u = urlSure(photo);
    if (u) { var i = el('img', 'hp-fil-av'); i.src = u; i.alt = ''; i.loading = 'lazy'; i.referrerPolicy = 'no-referrer'; return i; }
    return el('span', 'hp-fil-av hp-fil-av-lettre', (brut(nom).charAt(0) || '·').toUpperCase());
  }
  function ligneAuteur(nom, photo, date) {
    var l = el('span', 'hp-fil-auteur');
    l.appendChild(avatar(nom, photo));
    l.appendChild(el('span', 'hp-fil-nom', brut(nom) || 'Diaspo’Actif'));
    var d = depuis(date);
    if (d) l.appendChild(el('span', 'hp-fil-date', d));
    return l;
  }

  /* ---------- visionneur des Reels (même chargement à la demande que assets/reels.js) ---------- */
  var chargement = null;
  function chargerVisionneur() {
    if (window.MediaViewer && window.MediaViewer.openReels) return Promise.resolve();
    if (chargement) return chargement;
    chargement = new Promise(function (resolve) {
      if (!document.querySelector('link[href*="media-viewer.css"]')) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/media-viewer.css?v=' + VERSION; document.head.appendChild(l); }
      var s = document.createElement('script'); s.src = '/assets/media-viewer.js?v=' + VERSION; s.onload = resolve; s.onerror = resolve; document.head.appendChild(s);
    });
    return chargement;
  }
  function ouvrirReel(postId) {
    return chargerVisionneur().then(function () {
      if (window.MediaViewer && window.MediaViewer.openReels) window.MediaViewer.openReels({ postId: postId, onLogin: function () { location.href = 'login.html'; } });
      else location.href = 'fil-actualite-app.html?post=' + encodeURIComponent(postId);
    });
  }

  /* ---------- cartes ---------- */
  function carteReel(it) {
    var m = (it.medias && it.medias[0]) || {};
    var b = el('button', 'hp-fil-carte hp-fil-reel');
    b.type = 'button';
    var titre = brut(it.titre) || brut(it.extrait) || 'Nouveau Reel';
    b.setAttribute('aria-label', 'Regarder le Reel : ' + titre);
    var poster = urlSure(m.poster);
    if (poster) b.style.backgroundImage = 'url("' + poster.replace(/"/g, '%22') + '")';
    else b.classList.add('hp-fil-reel-sans');
    var badge = el('span', 'hp-fil-badge');
    badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14"><rect x="2" y="6" width="13.5" height="12" rx="3.2" fill="currentColor"/><path d="M17.2 10.4l4.2-2.5a.7.7 0 0 1 1.05.6v7a.7.7 0 0 1-1.05.6l-4.2-2.5z" fill="currentColor"/></svg>';
    badge.appendChild(document.createTextNode('Reel'));
    b.appendChild(badge);
    var play = el('span', 'hp-fil-play');
    play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>';
    b.appendChild(play);
    var bas = el('span', 'hp-fil-reel-bas');
    bas.appendChild(ligneAuteur(it.auteur_nom, it.auteur_photo, it.created_at));
    bas.appendChild(el('b', 'hp-fil-titre', titre));
    b.appendChild(bas);
    b.addEventListener('click', function () { ouvrirReel(it.post_id); });
    return b;
  }

  function mediasDe(p) {
    var m = p.medias;
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = []; } }
    return Array.isArray(m) ? m : [];
  }
  function estVideo(m) { return m && (m.type === 'video' || m.kind === 'video'); }
  function carteActu(p) {
    var titre = brut(p.titre) || brut(p.article_titre);
    var corps = brut(p.corps != null && p.corps !== '' ? p.corps : (p.contenu || p.article_contenu));
    var extrait = titre && corps.indexOf(titre) === 0 ? corps.slice(titre.length).trim() : corps;
    if (!titre) { titre = corps.slice(0, 90); extrait = corps.slice(90).trim(); }
    var a = el('a', 'hp-fil-carte hp-fil-actu');
    a.href = 'fil-actualite-app.html?post=' + encodeURIComponent(p.id);
    var img = mediasDe(p).filter(function (m) { return !estVideo(m) && urlSure(m.url); })[0];
    var imgUrl = img ? urlSure(img.url) : (p.media_type === 'image' ? urlSure(p.media_url) : '');
    var prof = p.auteur_profil || {};
    var corpsEl = el('span', 'hp-fil-corps');
    corpsEl.appendChild(ligneAuteur(p.auteur_nom, prof.photo_url, p.created_at));
    corpsEl.appendChild(el('b', 'hp-fil-titre', titre));
    if (extrait) corpsEl.appendChild(el('span', 'hp-fil-extrait', extrait));
    a.appendChild(corpsEl);
    if (imgUrl) {
      var im = el('span', 'hp-fil-img');
      im.style.backgroundImage = 'url("' + imgUrl.replace(/"/g, '%22') + '")';
      a.appendChild(im);
    }
    return a;
  }

  /* Publications présentables : ni reposts, ni vidéos (ce sont des Reels), ni publication sans aucun texte.
     Les annonces automatiques de cagnotte passent après les vraies actualités. */
  function actualites(posts) {
    var bonnes = (posts || []).filter(function (p) {
      if (p.pub_type === 'repost' || p.type === 'repost') return false;
      if (mediasDe(p).some(estVideo) || p.media_type === 'video') return false;
      return !!(brut(p.titre) || brut(p.corps) || brut(p.contenu));
    });
    var vraies = bonnes.filter(function (p) { return p.type !== 'cagnotte' && p.pub_type !== 'cagnotte'; });
    var auto = bonnes.filter(function (p) { return p.type === 'cagnotte' || p.pub_type === 'cagnotte'; });
    return vraies.concat(auto);
  }

  Promise.all([
    get('/api/fil/medias?type=video&reels=1&limit=1').catch(function () { return null; }),
    get('/api/fil?mode=organisations&limit=20').catch(function () { return null; })
  ]).then(function (r) {
    var reel = r[0] && r[0].items && r[0].items[0];
    var actus = actualites(r[1] && r[1].posts);
    var cartes = [];
    if (reel) { cartes.push(carteReel(reel)); actus.slice(0, 2).forEach(function (p) { cartes.push(carteActu(p)); }); }
    else actus.slice(0, 3).forEach(function (p) { cartes.push(carteActu(p)); });
    if (!cartes.length) { zone.hidden = true; return; }
    liste.textContent = '';
    cartes.forEach(function (c) { liste.appendChild(c); });
    liste.removeAttribute('aria-busy');
  }).catch(function () { zone.hidden = true; });
})();
