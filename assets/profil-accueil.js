/* ============================================================
   Diaspo'Actif — Accueil du profil public : Reels + fil d'actualités filtrable (2026-11-02, demande explicite)
   « Une personne connectée arrive sur son profil public. Au-dessus : les derniers Reels, dans des cadres ; un clic ouvre le visionneur
   et on se balade de Reel en Reel. Au milieu : toutes les nouvelles actualités (textes, vidéos, événements) qui défilent, avec des filtres,
   la possibilité d'en créer facilement, et un bouton « Mes actualités » qui ne montre que ce qu'on a publié soi-même. »
   Sur le profil d'un AUTRE compte, rien de tout cela : seules les actualités de ce compte (publiées ou republiées) — voir profil-app.html.

   Utilisation (site) :
     ProfilAccueil.monterReels(element, { moi })      → la bande de Reels (en haut de la page)
     ProfilAccueil.monterFil(element, { moi })        → le compositeur, les filtres et le fil (au milieu)
   Données : GET /api/fil/medias?type=video (Reels) · GET /api/fil/accueil?filtre=… (fil) · GET /api/evenements?date=… (prochains événements).
   Les publications sont dessinées par le composant partagé Posts (assets/posts.js) : mêmes cartes, mêmes réactions, mêmes commentaires que le fil.
   Tout texte venant de l'API est posé par textContent ou échappé : jamais de HTML brut.
   ============================================================ */
(function () {
  'use strict';
  if (window.ProfilAccueil) return;
  var VERSION = '20261102h';
  var FILTRES = [['tout', 'Tout'], ['textes', 'Textes'], ['photos', 'Photos'], ['articles', 'Articles'], ['evenements', 'Événements'], ['abonnements', 'Abonnements']];
  var CATEGORIES = ['Actualité', 'Projet', 'Investissement', 'Emploi', 'Formation', 'Événement', 'Succès', 'Témoignage', 'Appel à bénévoles', 'Culture', 'Diaspora', 'Innovation', 'Autre'];
  var CAM = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2" y="6" width="13.5" height="12" rx="3.2" fill="currentColor"/><path d="M17.2 10.4l4.2-2.5a.7.7 0 0 1 1.05.6v7a.7.7 0 0 1-1.05.6l-4.2-2.5z" fill="currentColor"/></svg>';
  var PLUME = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20l1.2-4.4L16.6 4.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.4 18.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14.5 6.3l3.2 3.2" stroke="currentColor" stroke-width="1.8"/></svg>';

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var urlOk = function (u) { return typeof u === 'string' && /^(https?:\/\/|\/[^\/])/i.test(u); };
  var initiales = function (n) { return String(n || '').trim().split(/\s+/).slice(0, 2).map(function (m) { return m.charAt(0); }).join('').toUpperCase() || '·'; };
  var getJSON = function (u) { return fetch(u, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : Promise.reject(Object.assign(new Error('http ' + r.status), { status: r.status })); }); };
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function dateCourte(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? (Number(m[3]) + ' ' + MOIS[Number(m[2]) - 1]) : ''; }

  function css() {
    if (document.getElementById('pa-css')) return;
    var s = document.createElement('style'); s.id = 'pa-css';
    s.textContent = [
      ':root{--pa-or:var(--nd-or,#E3C06E);--pa-verre:var(--nd-verre,rgba(17,27,56,.82));--pa-bord:var(--nd-bord,rgba(227,192,110,.38));--pa-bord2:var(--nd-bord2,rgba(227,192,110,.2));--pa-texte:var(--nd-texte,#F2F5FB);--pa-doux:var(--nd-doux,#B9C6DC);--pa-encre:#0B1226}',
      /* --- bande de Reels --- */
      '.pa-reels{margin:0 0 18px;padding:14px 0 12px;border-radius:20px;background:var(--pa-verre);border:1px solid var(--pa-bord2)}',
      '.pa-tete{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:0 16px 10px}',
      '.pa-tete h2{margin:0;font-size:18px;font-weight:800;letter-spacing:.01em;color:#fff!important;display:flex;align-items:center;gap:9px}',
      '.pa-tete h2 svg{width:22px;height:22px;color:var(--pa-or)}',
      '.pa-tete small{color:var(--pa-doux)!important;font-size:12.5px;flex:1 1 180px}',
      '.pa-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--pa-bord);background:rgba(255,255,255,.06);color:var(--pa-texte)!important;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;transition:border-color .15s,background .15s,transform .15s}',
      '.pa-btn:hover{border-color:var(--pa-or);background:rgba(227,192,110,.12)}',
      '.pa-btn svg{width:18px;height:18px;flex:none}',
      '.pa-btn.pa-or{background:linear-gradient(135deg,#F0D48C,#D9A94A);border-color:#E3C06E;color:#1a1202!important}',
      '.pa-btn.pa-or:hover{filter:brightness(1.06);background:linear-gradient(135deg,#F0D48C,#D9A94A)}',
      '.pa-btn:focus-visible,.pa-puce:focus-visible,.pa-reel:focus-visible,.pa-evt:focus-visible,.pa-compo-ligne:focus-visible,.pa-flech:focus-visible{outline:3px solid var(--pa-or);outline-offset:2px}',
      '.pa-rail-cadre{position:relative}',
      '.pa-rail{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x proximity;padding:4px 16px 8px;scrollbar-width:thin;scrollbar-color:rgba(227,192,110,.4) transparent;-webkit-overflow-scrolling:touch}',
      '.pa-reel{position:relative;flex:0 0 138px;aspect-ratio:9/16;border-radius:16px;overflow:hidden;border:1px solid var(--pa-bord);background:#0B1226;padding:0;cursor:pointer;scroll-snap-align:start;color:#fff;transition:transform .18s,border-color .18s}',
      '.pa-reel:hover{transform:translateY(-3px);border-color:var(--pa-or)}',
      '.pa-reel img,.pa-reel video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}',
      '.pa-reel .pa-ombre{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.28) 0,transparent 30%,transparent 52%,rgba(5,9,22,.92) 100%)}',
      '.pa-reel .pa-lire{position:absolute;top:9px;right:9px;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;border:1px solid rgba(255,255,255,.35)}',
      '.pa-reel .pa-bas{position:absolute;left:0;right:0;bottom:0;padding:9px 10px;text-align:left;display:flex;flex-direction:column;gap:5px}',
      '.pa-reel .pa-auteur{display:flex;align-items:center;gap:6px;min-width:0}',
      '.pa-reel .pa-av{flex:none;width:22px;height:22px;border-radius:50%;overflow:hidden;background:#1d2b55;border:1px solid var(--pa-or);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff}',
      '.pa-reel .pa-av img{position:static;width:100%;height:100%}',
      '.pa-reel .pa-nom{font-size:11.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff!important}',
      '.pa-reel .pa-stats{font-size:11px;color:#E8EEF9!important;display:flex;gap:10px}',
      '.pa-reel.pa-nouveau{border-style:dashed;background:rgba(255,255,255,.05);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:14px}',
      '.pa-reel.pa-nouveau svg{width:34px;height:34px;color:var(--pa-or)}',
      '.pa-reel.pa-nouveau b{font-size:13px;color:#fff!important;line-height:1.3}',
      '.pa-flech{position:absolute;top:50%;transform:translateY(-60%);width:44px;height:44px;border-radius:50%;border:1px solid var(--pa-bord);background:rgba(11,18,38,.9);color:#fff;font-size:20px;cursor:pointer;display:none;align-items:center;justify-content:center}',
      '.pa-flech.g{left:6px}.pa-flech.d{right:6px}',
      '@media (hover:hover) and (min-width:760px){.pa-flech{display:flex}.pa-flech[hidden]{display:none}}',
      /* --- compositeur --- */
      '.pa-hub{display:flex;flex-direction:column;gap:14px;min-width:0}',
      '.pa-compo{padding:14px 16px;border-radius:18px;background:var(--pa-verre);border:1px solid var(--pa-bord2);display:flex;flex-direction:column;gap:12px}',
      '.pa-compo-haut{display:flex;align-items:center;gap:12px}',
      '.pa-moi{flex:none;width:44px;height:44px;border-radius:50%;overflow:hidden;background:#1d2b55;border:2px solid var(--pa-or);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:15px}',
      '.pa-moi img{width:100%;height:100%;object-fit:cover}',
      '.pa-compo-ligne{flex:1;min-height:46px;text-align:left;padding:0 18px;border-radius:999px;border:1px solid var(--pa-bord2);background:rgba(255,255,255,.06);color:var(--pa-doux)!important;font:inherit;font-size:15px;cursor:pointer}',
      '.pa-compo-ligne:hover{border-color:var(--pa-or)}',
      '.pa-compo-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '.pa-compo-actions .pa-btn{min-height:42px;padding:0 14px;font-size:13px}',
      /* --- filtres --- */
      '.pa-filtres{display:flex;flex-direction:column;gap:10px}',
      '.pa-rangee{display:flex;align-items:center;gap:8px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:none}',
      '.pa-rangee::-webkit-scrollbar{display:none}',
      '@media (min-width:700px){.pa-rangee{flex-wrap:wrap;overflow:visible}.pa-sep{display:none}}',
      '.pa-puce{flex:none;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--pa-bord2);background:rgba(255,255,255,.05);color:var(--pa-texte)!important;font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s}',
      '.pa-puce:hover{border-color:var(--pa-or)}',
      '.pa-puce[aria-pressed="true"]{background:rgba(227,192,110,.2);border-color:var(--pa-or);color:#fff!important}',
      '.pa-puce.pa-mes{border-color:var(--pa-or);font-weight:800}',
      '.pa-puce.pa-mes[aria-pressed="true"]{background:linear-gradient(135deg,#F0D48C,#D9A94A);color:#1a1202!important}',
      '.pa-puce svg{width:17px;height:17px}',
      '.pa-sep{flex:none;width:1px;height:26px;background:var(--pa-bord2)}',
      '.pa-cat,html body.nd .pa-hub select.pa-cat{flex:none;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--pa-bord2)!important;background-color:#101a38!important;color:#F2F5FB!important;font:inherit;font-size:14px;cursor:pointer;max-width:220px}',
      '.pa-cat option{background:#101a38;color:#F2F5FB}',
      '.pa-cat:focus-visible{outline:3px solid var(--pa-or);outline-offset:2px}',
      '.pa-etat{font-size:13px;color:var(--pa-doux)!important;padding:0 4px;min-height:18px}',
      /* --- événements à venir --- */
      '.pa-evts{padding:14px 0 12px;border-radius:18px;background:rgba(227,192,110,.07);border:1px solid var(--pa-bord2);margin:2px 0}',
      '.pa-evts h3{margin:0;padding:0 16px 10px;font-size:15px;font-weight:800;color:#fff!important;display:flex;align-items:center;gap:8px}',
      '.pa-evts-rail{display:flex;gap:12px;overflow-x:auto;padding:2px 16px 6px;scrollbar-width:thin;scrollbar-color:rgba(227,192,110,.4) transparent}',
      '.pa-evt{flex:0 0 232px;display:flex;flex-direction:column;border-radius:14px;overflow:hidden;border:1px solid var(--pa-bord2);background:rgba(11,18,38,.85);text-decoration:none;color:var(--pa-texte)!important;transition:transform .18s,border-color .18s}',
      '.pa-evt:hover{transform:translateY(-3px);border-color:var(--pa-or)}',
      '.pa-evt-img{height:104px;background:linear-gradient(135deg,#1d2b55,#0B1226);position:relative}',
      '.pa-evt-img img{width:100%;height:100%;object-fit:cover;display:block}',
      '.pa-evt-date{position:absolute;left:10px;bottom:-14px;background:linear-gradient(135deg,#F0D48C,#D9A94A);color:#1a1202!important;font-weight:800;font-size:12px;padding:5px 10px;border-radius:9px;white-space:nowrap}',
      '.pa-evt-corps{padding:20px 12px 12px;display:flex;flex-direction:column;gap:3px}',
      '.pa-evt-corps b{font-size:14px;line-height:1.3;color:#fff!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.pa-evt-corps span{font-size:12px;color:var(--pa-doux)!important}',
      '.pa-evts-tout{display:flex;justify-content:flex-end;padding:6px 16px 0}',
      '.pa-evts-tout a{font-size:13px;font-weight:700;color:var(--pa-or)!important}',
      /* --- fil --- */
      '#pa-fil{display:flex;flex-direction:column;gap:16px;min-width:0}',
      '.pa-vide{padding:30px 18px;border-radius:18px;border:1px dashed var(--pa-bord);text-align:center;color:var(--pa-doux)!important;display:flex;flex-direction:column;align-items:center;gap:12px}',
      '.pa-vide b{font-size:16px;color:#fff!important}',
      '.pa-suite{display:flex;flex-direction:column;align-items:center;gap:8px;padding:6px 0 4px}',
      '.pa-fin{font-size:13px;color:var(--pa-doux)!important;text-align:center;padding:10px}',
      '.pa-squelette{height:150px;border-radius:18px;background:linear-gradient(100deg,rgba(255,255,255,.04) 30%,rgba(255,255,255,.1) 50%,rgba(255,255,255,.04) 70%);background-size:200% 100%;animation:pa-sk 1.3s linear infinite}',
      '@keyframes pa-sk{to{background-position:-200% 0}}',
      '@media (prefers-reduced-motion:reduce){.pa-squelette{animation:none}.pa-reel,.pa-evt{transition:none}.pa-reel:hover,.pa-evt:hover{transform:none}}',
      '@media (max-width:600px){.pa-reel{flex-basis:124px}.pa-compo-actions .pa-btn{flex:1 1 calc(50% - 8px)}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- visionneur et création de Reels (chargés à la demande, comme assets/reels.js) ---------- */
  var chargeV = null;
  function visionneur() {
    if (window.MediaViewer && window.MediaViewer.openReels) return Promise.resolve();
    if (chargeV) return chargeV;
    chargeV = new Promise(function (resolve) {
      if (!document.querySelector('link[href*="media-viewer.css"]')) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/media-viewer.css?v=' + VERSION; document.head.appendChild(l); }
      var sc = document.createElement('script'); sc.src = '/assets/media-viewer.js?v=' + VERSION; sc.onload = resolve; sc.onerror = resolve; document.head.appendChild(sc);
    });
    return chargeV;
  }
  function ouvrirReels(postId) {
    return visionneur().then(function () { if (window.MediaViewer && window.MediaViewer.openReels) window.MediaViewer.openReels(postId ? { postId: postId } : {}); });
  }
  function creerReel(apres) {
    var charge = window.ReelsCreer ? Promise.resolve() : new Promise(function (resolve) { var sc = document.createElement('script'); sc.src = '/assets/reels-creer.js?v=' + VERSION; sc.onload = resolve; sc.onerror = resolve; document.head.appendChild(sc); });
    return charge.then(function () {
      if (!window.ReelsCreer) return;
      window.ReelsCreer.ouvrir({ onPublie: function (r) { if (apres) apres(); if (r && r.post_id && !r.silencieux) ouvrirReels(r.post_id); } });
    });
  }

  /* ============================================================
     1. Bande de Reels
     ============================================================ */
  var rafraichirBande = null;
  function monterReels(el, o) {
    if (!el) return Promise.resolve(false);
    o = o || {}; css();
    function peindre(items) {
      el.innerHTML = '';
      var sec = document.createElement('section'); sec.className = 'pa-reels'; sec.setAttribute('aria-label', 'Derniers Reels de la communauté');
      var tete = document.createElement('div'); tete.className = 'pa-tete';
      tete.innerHTML = '<h2>' + CAM + 'Reels</h2><small>Les dernières vidéos de la communauté</small>'
        + '<button type="button" class="pa-btn pa-or" data-pa="creer">' + CAM + 'Créer un Reel</button>'
        + (items.length ? '<button type="button" class="pa-btn" data-pa="tout">Tout voir</button>' : '');
      sec.appendChild(tete);
      var cadre = document.createElement('div'); cadre.className = 'pa-rail-cadre';
      var rail = document.createElement('div'); rail.className = 'pa-rail'; rail.setAttribute('role', 'list');
      if (!items.length) {
        var nv = document.createElement('button'); nv.type = 'button'; nv.className = 'pa-reel pa-nouveau'; nv.setAttribute('role', 'listitem');
        nv.innerHTML = CAM + '<b>Soyez le premier à partager un Reel</b>'; nv.onclick = function () { creerReel(rafraichir); };
        rail.appendChild(nv);
      }
      items.forEach(function (it) {
        var m = (it.medias && it.medias[0]) || {};
        var b = document.createElement('button'); b.type = 'button'; b.className = 'pa-reel'; b.setAttribute('role', 'listitem');
        var titre = String(it.titre || it.extrait || 'Reel').slice(0, 80);
        b.setAttribute('aria-label', 'Voir le Reel de ' + (it.auteur_nom || 'la communauté') + ' : ' + titre);
        var vignette = urlOk(m.poster) ? '<img src="' + esc(m.poster) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
          : (urlOk(m.url) ? '<video src="' + esc(m.url) + '#t=0.5" muted playsinline preload="metadata"></video>' : '');
        var av = urlOk(it.auteur_photo) ? '<img src="' + esc(it.auteur_photo) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : esc(initiales(it.auteur_nom));
        b.innerHTML = vignette + '<span class="pa-ombre"></span><span class="pa-lire" aria-hidden="true">▶</span>'
          + '<span class="pa-bas"><span class="pa-auteur"><span class="pa-av">' + av + '</span><span class="pa-nom">' + esc(it.auteur_nom || '') + '</span></span>'
          + '<span class="pa-stats"><span>❤ ' + (Number(it.nb_reactions) || Number(it.nb_likes) || 0) + '</span><span>💬 ' + (Number(it.nb_commentaires) || 0) + '</span></span></span>';
        b.onclick = function () { ouvrirReels(Number(it.post_id)); };
        rail.appendChild(b);
      });
      cadre.appendChild(rail);
      var g = document.createElement('button'); g.type = 'button'; g.className = 'pa-flech g'; g.setAttribute('aria-label', 'Reels précédents'); g.textContent = '‹'; g.hidden = true;
      var d = document.createElement('button'); d.type = 'button'; d.className = 'pa-flech d'; d.setAttribute('aria-label', 'Reels suivants'); d.textContent = '›';
      function maj() { g.hidden = rail.scrollLeft < 8; d.hidden = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8; }
      g.onclick = function () { rail.scrollBy({ left: -rail.clientWidth * 0.8, behavior: 'smooth' }); };
      d.onclick = function () { rail.scrollBy({ left: rail.clientWidth * 0.8, behavior: 'smooth' }); };
      rail.addEventListener('scroll', maj, { passive: true }); setTimeout(maj, 60);
      cadre.appendChild(g); cadre.appendChild(d); sec.appendChild(cadre);
      el.appendChild(sec);
      var bc = sec.querySelector('[data-pa="creer"]'); if (bc) bc.onclick = function () { creerReel(rafraichir); };
      var bt = sec.querySelector('[data-pa="tout"]'); if (bt) bt.onclick = function () { ouvrirReels(); };
    }
    function rafraichir() {
      return getJSON('/api/fil/medias?type=video&limit=14').catch(function () { return { items: [] }; }).then(function (r) { peindre((r && r.items) || []); return true; });
    }
    rafraichirBande = rafraichir;
    return rafraichir();
  }

  /* ============================================================
     2. Compositeur + filtres + fil
     ============================================================ */
  function monterFil(el, o) {
    if (!el) return;
    o = o || {}; css();
    var moi = o.moi || {};
    /* On arrive toujours sur « Tout » (un filtre mémorisé d'une visite à l'autre ferait croire que la plateforme est vide) ; le choix tient le temps de la visite. */
    var etat = { filtre: 'tout', categorie: '', posts: [], suivant: null, fini: false, charge: false, gen: 0, evts: null };
    if (!/^(tout|textes|photos|videos|articles|evenements|abonnements|mes)$/.test(etat.filtre)) etat.filtre = 'tout';

    var prenom = String(moi.prenom || moi.nom || '').split(/\s+/)[0] || '';
    var avatar = urlOk(moi.photo_url) ? '<img src="' + esc(moi.photo_url) + '" alt="" referrerpolicy="no-referrer">' : esc(initiales(moi.nom_affichage || moi.nom));
    el.innerHTML = '<div class="pa-hub">'
      + '<div class="pa-compo"><div class="pa-compo-haut"><span class="pa-moi" aria-hidden="true">' + avatar + '</span>'
      + '<button type="button" class="pa-compo-ligne" data-pa="texte">' + esc(prenom ? 'Quoi de neuf, ' + prenom + ' ?' : 'Quoi de neuf ?') + '</button></div>'
      + '<div class="pa-compo-actions">'
      + '<button type="button" class="pa-btn" data-pa="texte">' + PLUME + 'Écrire</button>'
      + '<button type="button" class="pa-btn" data-pa="photo">🖼️ Photo</button>'
      + '<button type="button" class="pa-btn" data-pa="video">🎥 Vidéo</button>'
      + '<button type="button" class="pa-btn" data-pa="article">📰 Article</button>'
      + '<button type="button" class="pa-btn pa-or" data-pa="reel">' + CAM + 'Reel</button></div></div>'
      + '<div class="pa-filtres"><div class="pa-rangee" role="group" aria-label="Filtrer les actualités">'
      + '<button type="button" class="pa-puce pa-mes" data-filtre="mes" aria-pressed="false">' + PLUME + 'Mes actualités</button><span class="pa-sep" aria-hidden="true"></span>'
      + FILTRES.map(function (f) { return '<button type="button" class="pa-puce" data-filtre="' + f[0] + '" aria-pressed="false">' + f[1] + '</button>'; }).join('')
      + '<span class="pa-sep" aria-hidden="true"></span>'
      + '<label class="sr-only" for="pa-cat" style="position:absolute;left:-9999px">Catégorie</label>'
      + '<select class="pa-cat" id="pa-cat"><option value="">Toutes catégories</option>' + CATEGORIES.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('') + '</select>'
      + '</div><div class="pa-etat" id="pa-etat" role="status" aria-live="polite"></div></div>'
      + '<div id="pa-evts"></div>'
      + '<div id="pa-fil" aria-live="off"></div>'
      + '<div class="pa-suite" id="pa-suite"></div></div>';

    var elFil = el.querySelector('#pa-fil'), elSuite = el.querySelector('#pa-suite'), elEtat = el.querySelector('#pa-etat'), elEvts = el.querySelector('#pa-evts'), selCat = el.querySelector('#pa-cat');
    var sentinelle = document.createElement('div'); sentinelle.setAttribute('aria-hidden', 'true'); sentinelle.style.height = '1px';

    /* ----- création ----- */
    el.querySelectorAll('[data-pa]').forEach(function (b) {
      b.onclick = function () {
        var a = b.dataset.pa;
        if (a === 'reel') { creerReel(function () { if (etat.filtre === 'mes') recharger(); if (window.ProfilAccueil && window.ProfilAccueil.rafraichirReels) window.ProfilAccueil.rafraichirReels(); }); return; }
        if (window.Posts && window.Posts.openModal) window.Posts.openModal(a === 'texte' ? undefined : a);
        else location.href = 'fil-actualite.html';
      };
    });
    /* Après une publication (ou un repost), Posts demande au fil de se recharger (même convention que carte-diaspoactif.js). */
    window.PostsFeed = { refresh: function () { recharger(); } };

    /* ----- filtres ----- */
    function marquer() {
      el.querySelectorAll('[data-filtre]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.filtre === etat.filtre ? 'true' : 'false'); });
      selCat.value = etat.categorie;
    }
    el.querySelectorAll('[data-filtre]').forEach(function (b) {
      b.onclick = function () {
        if (etat.filtre === b.dataset.filtre && b.dataset.filtre !== 'tout') { etat.filtre = 'tout'; }   /* un second appui sur « Mes actualités » (ou un filtre) revient à Tout */
        else etat.filtre = b.dataset.filtre;
        recharger();
      };
    });
    selCat.onchange = function () { etat.categorie = selCat.value; recharger(); };

    /* ----- événements à venir ----- */
    function chargerEvts() {
      if (etat.evts) return Promise.resolve(etat.evts);
      var auj = new Date(); var iso = auj.getFullYear() + '-' + String(auj.getMonth() + 1).padStart(2, '0') + '-' + String(auj.getDate()).padStart(2, '0');
      etat.auj = iso;
      return getJSON('/api/evenements?date=' + iso).then(function (r) { etat.evts = ((r && r.evenements) || []).filter(function (e) { return e.statut !== 'brouillon' && e.statut !== 'annule'; }).slice(0, 8); return etat.evts; }).catch(function () { etat.evts = []; return []; });
    }
    function blocEvts() {
      var l = etat.evts || [];
      if (!l.length) return null;
      var d = document.createElement('section'); d.className = 'pa-evts'; d.setAttribute('aria-label', 'Prochains événements');
      d.innerHTML = '<h3>📅 Prochains événements</h3><div class="pa-evts-rail" role="list">' + l.map(function (e) {
        var img = urlOk(e.image_couverture) ? e.image_couverture : (urlOk(e.image_url) ? e.image_url : '');
        var lieu = e.ville || e.pays || (e.lien_visio ? 'En ligne' : (e.lieu || ''));
        return '<a class="pa-evt" role="listitem" href="evenements.html?evt=' + Number(e.id) + '"><span class="pa-evt-img">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') + '<span class="pa-evt-date">' + esc(String(e.date_evt || '') < etat.auj ? 'En cours' : dateCourte(e.date_evt)) + '</span></span>'
          + '<span class="pa-evt-corps"><b>' + esc(e.titre || 'Événement') + '</b><span>' + esc([lieu, e.organisateur_nom].filter(Boolean).join(' · ')) + '</span></span></a>';
      }).join('') + '</div><div class="pa-evts-tout"><a href="evenements.html">Tous les événements →</a></div>';
      return d;
    }
    /* Sous « Événements » : les prochains événements en tête ; sous « Tout » : un seul bandeau, glissé après la 3e publication. */
    function placerEvts() {
      elEvts.innerHTML = '';
      var anc = elFil.querySelector('.pa-evts'); if (anc) anc.remove();
      var b = (etat.filtre === 'evenements' || etat.filtre === 'tout') ? blocEvts() : null;
      if (!b) return;
      if (etat.filtre === 'evenements') { elEvts.appendChild(b); return; }
      var cartes = elFil.querySelectorAll('.post-card');
      if (cartes.length >= 3) cartes[2].insertAdjacentElement('afterend', b);
      else if (cartes.length) cartes[cartes.length - 1].insertAdjacentElement('afterend', b);
    }

    /* ----- le fil ----- */
    function messageVide(conseil) {
      var f = etat.filtre, t, p = '', act = '';
      if (f === 'mes') { t = 'Vous n’avez encore rien publié'; p = 'Partagez une actualité, une photo ou une vidéo : elle apparaîtra ici.'; act = '<button type="button" class="pa-btn pa-or" data-pa-vide="creer">' + PLUME + 'Créer une publication</button>'; }
      else if (f === 'abonnements') { t = 'Rien à afficher pour l’instant'; p = conseil || 'Abonnez-vous à des personnes et à des initiatives pour voir ici leurs actualités.'; act = '<a class="pa-btn" href="annuaire.html">Découvrir l’annuaire</a>'; }
      else { t = 'Aucune publication pour ce filtre'; p = 'Essayez un autre filtre, ou soyez le premier à publier.'; act = '<button type="button" class="pa-btn" data-pa-vide="tout">Voir tout</button>'; }
      return '<div class="pa-vide"><b>' + esc(t) + '</b><span>' + esc(p) + '</span>' + act + '</div>';
    }
    function peindre(conseil) {
      if (!etat.posts.length) {
        elFil.innerHTML = messageVide(conseil);
        var c = elFil.querySelector('[data-pa-vide="creer"]'); if (c) c.onclick = function () { if (window.Posts && Posts.openModal) Posts.openModal(); };
        var t = elFil.querySelector('[data-pa-vide="tout"]'); if (t) t.onclick = function () { etat.filtre = 'tout'; etat.categorie = ''; recharger(); };
      } else if (window.Posts && window.Posts.renderFeed) {
        window.Posts.renderFeed(etat.posts, 'pa-fil', { currentUserId: moi.id });   /* tout le fil chargé : la navigation ‹ › de la vue détaillée le parcourt en entier */
      }
      placerEvts();
      elSuite.innerHTML = '';
      if (etat.posts.length && !etat.fini) {
        var plus = document.createElement('button'); plus.type = 'button'; plus.className = 'pa-btn'; plus.textContent = etat.charge ? 'Chargement…' : 'Afficher plus d’actualités'; plus.disabled = etat.charge;
        plus.onclick = function () { suite(); };
        elSuite.appendChild(plus); elSuite.appendChild(sentinelle);
        observer();
      } else if (etat.posts.length) {
        elSuite.innerHTML = '<div class="pa-fin">Vous êtes à jour : c’est tout pour l’instant.</div>';
      }
    }
    var io = null;
    /* Doublon volontaire de l'observateur : certains navigateurs (intégrés, en arrière-plan) ne notifient pas les observateurs ; l'écoute du défilement les remplace alors. */
    var attente = false;
    function surDefilement() {
      if (attente || etat.charge || etat.fini || !etat.suivant || !sentinelle.isConnected) return;
      attente = true;
      setTimeout(function () { attente = false; if (sentinelle.isConnected && sentinelle.getBoundingClientRect().top < window.innerHeight + 700) suite(); }, 150);
    }
    window.addEventListener('scroll', surDefilement, { passive: true });
    function observer() {
      if (!('IntersectionObserver' in window)) return;
      if (io) io.disconnect();
      io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) suite(); }, { rootMargin: '700px 0px' });
      io.observe(sentinelle);
    }
    function url(avant) {
      var q = 'filtre=' + encodeURIComponent(etat.filtre) + '&limit=10' + (etat.categorie ? '&categorie=' + encodeURIComponent(etat.categorie) : '') + (avant ? '&avant=' + avant : '');
      return '/api/fil/accueil?' + q;
    }
    function libelleEtat() {
      var f = etat.filtre === 'mes' ? 'Mes actualités' : (FILTRES.filter(function (x) { return x[0] === etat.filtre; })[0] || ['', 'Tout'])[1];
      return f + (etat.categorie ? ' · ' + etat.categorie : '');
    }
    function recharger() {
      etat.gen++; etat.posts = []; etat.suivant = null; etat.fini = false; etat.charge = false;
      marquer(); elEtat.textContent = libelleEtat();
      elSuite.innerHTML = '';
      elFil.innerHTML = '<div class="pa-squelette"></div><div class="pa-squelette"></div>';
      var gen = etat.gen;
      var evts = (etat.filtre === 'evenements' || etat.filtre === 'tout') ? chargerEvts() : Promise.resolve();
      getJSON(url(null)).then(function (r) {
        if (gen !== etat.gen) return;
        etat.posts = r.posts || []; etat.suivant = r.suivant || null; etat.fini = !r.suivant;
        return evts.then(function () { if (gen === etat.gen) peindre(r.conseil); });
      }).catch(function (e) {
        if (gen !== etat.gen) return;
        if (e && e.status === 401) { elFil.innerHTML = '<div class="pa-vide"><b>Connexion requise</b><span>Connectez-vous pour voir cette rubrique.</span><a class="pa-btn pa-or" href="login.html">Se connecter</a></div>'; return; }
        elFil.innerHTML = '<div class="pa-vide"><b>Impossible de charger les actualités</b><button type="button" class="pa-btn" data-pa-vide="retry">Réessayer</button></div>';
        var rb = elFil.querySelector('[data-pa-vide="retry"]'); if (rb) rb.onclick = recharger;
      });
    }
    function suite() {
      if (etat.charge || etat.fini || !etat.suivant) return;
      etat.charge = true; var gen = etat.gen;
      var bt = elSuite.querySelector('button'); if (bt) { bt.disabled = true; bt.textContent = 'Chargement…'; }
      getJSON(url(etat.suivant)).then(function (r) {
        if (gen !== etat.gen) return;
        var vus = {}; etat.posts.forEach(function (p) { vus[p.id] = 1; });
        etat.posts = etat.posts.concat((r.posts || []).filter(function (p) { return !vus[p.id]; }));
        etat.suivant = r.suivant || null; etat.fini = !r.suivant; etat.charge = false; peindre();
      }).catch(function () { if (gen !== etat.gen) return; etat.charge = false; peindre(); });
    }

    recharger();
    return { rafraichir: recharger };
  }

  window.ProfilAccueil = { monterReels: monterReels, monterFil: monterFil, rafraichirReels: function () { return rafraichirBande ? rafraichirBande() : Promise.resolve(false); }, version: VERSION };
})();
