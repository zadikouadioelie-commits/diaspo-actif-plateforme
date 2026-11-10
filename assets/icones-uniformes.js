/* Icônes uniformes — remplace les émoticônes par une même famille d'illustrations (traits fins, couleur du texte).
   Demande du 2026-11-10 : « n'utilise pas des émoticônes, crée des vraies illustrations uniformes ».
   - S'applique uniquement aux zones listées dans SCOPE (le contenu de la page), jamais à la barre du haut, au tiroir ni au bandeau.
   - Couvre aussi ce que app.js fabrique après coup (cartes, boutons, pastilles) grâce à un observateur : aucun code partagé modifié.
   - Dans les menus déroulants (<option>), une illustration est impossible : l'émoticône est simplement retirée. */
(function () {
  'use strict';
  var SCOPE = window.ICONES_UNIFORMES_SCOPE || [
    '.ann-card', '.ann-filters', '.ann-cta', '.ann-demarc', '.ann-ad-col', '.ann-pubs-bloc',
    '.ann-section-head', '.ann-pager', '.ann-chip', '#init-list', '#honneur-mur', '.ann-cats'
  ].join(',');

  var P = {
    landmark: '<path d="M3 21h18M5 21V10M9.5 21V10M14.5 21V10M19 21V10M3 10l9-6 9 6z"/>',
    sprout: '<path d="M12 21v-8"/><path d="M12 13c0-3.5-2.5-6-6.5-6 0 3.8 2.5 6 6.5 6z"/><path d="M12 15c0-3 2.2-5.2 6-5.2 0 3.4-2.2 5.2-6 5.2z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    type: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    city: '<path d="M3 21h18M4.5 21V9h5.5v12M10 21V4h6v17M16 21V11h3.5v10"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.7 3 2.7 14 0 17M12 3.5c-2.7 3-2.7 14 0 17"/>',
    scale: '<path d="M12 4v16M7 20h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
    ruler: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
    wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4z"/><path d="M4 7V6a2 2 0 0 1 2-2h10"/><path d="M16 14h2"/>',
    megaphone: '<path d="M4 10v4h3l7 4V6L7 10H4z"/><path d="M17.5 9.5a4 4 0 0 1 0 5"/>',
    news: '<path d="M4 6.5h13a1.5 1.5 0 0 1 1.5 1.5v10.5H5.5A1.5 1.5 0 0 1 4 17V6.5z"/><path d="M18.5 9.5H20a1 1 0 0 1 1 1V17a1.5 1.5 0 0 1-1.5 1.5"/><path d="M7.5 10h7M7.5 13h7M7.5 16h4"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z"/>',
    share: '<path d="M7 17 17 7M8 7h9v9"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    store: '<path d="M3.5 9.5 5 4.5h14l1.5 5"/><path d="M3.5 9.5c0 1.5 1.2 2.5 2.7 2.5s2.6-1 2.6-2.5c0 1.5 1.2 2.5 2.6 2.5s2.6-1 2.6-2.5c0 1.5 1.2 2.5 2.7 2.5s2.7-1 2.7-2.5"/><path d="M5 12v7.5h14V12"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.6c-.6-.8-1.4-1.2-2.5-1.2-1.4 0-2.5.8-2.5 1.9 0 2.6 5 1.2 5 3.8 0 1.1-1.1 1.9-2.5 1.9-1.1 0-2-.4-2.6-1.2M12 6.9v1.5M12 15.7v1.4"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
    sparkle: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><path d="m8 8 1.5 1.5M14.5 14.5 16 16M16 8l-1.5 1.5M9.5 14.5 8 16"/>'
  };
  var MAP = {
    '🏛': 'landmark', '🌱': 'sprout', '🎯': 'target', '🔤': 'type', '📍': 'pin', '🏙': 'city', '🌍': 'globe', '🌎': 'globe', '🌏': 'globe',
    '⚖': 'scale', '📏': 'ruler', '🏦': 'wallet', '📢': 'megaphone', '📰': 'news', '⭐': 'star', '↗': 'share', '✉': 'mail',
    '📅': 'cal', '👁': 'eye', '🏬': 'store', '🏪': 'store', '💚': 'heart', '👤': 'user', '🪙': 'coin', '↻': 'refresh', '✨': 'sparkle'
  };
  var EMOJI = /(?:\p{Extended_Pictographic}️?|[↻↗])/gu;

  function svg(nom) {
    return '<span class="ic-u" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">' + P[nom] + '</svg></span>';
  }
  function cle(e) { return e.replace(/️/g, ''); }

  function traiterTexte(n) {
    var t = n.nodeValue;
    if (!t || !EMOJI.test(t)) { EMOJI.lastIndex = 0; return; }
    EMOJI.lastIndex = 0;
    var p = n.parentNode;
    if (!p || p.nodeType !== 1) return;
    var tag = p.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT') return;
    if (tag === 'OPTION') { n.nodeValue = t.replace(EMOJI, '').replace(/^\s+/, ''); return; }
    var html = '', dernier = 0, m, esc = function (x) { return x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    while ((m = EMOJI.exec(t))) {
      var nom = MAP[cle(m[0])];
      html += esc(t.slice(dernier, m.index));
      if (nom) html += svg(nom);
      dernier = m.index + m[0].length;
    }
    EMOJI.lastIndex = 0;
    html += esc(t.slice(dernier));
    var tmp = document.createElement('span');
    tmp.innerHTML = html;
    var frag = document.createDocumentFragment();
    while (tmp.firstChild) frag.appendChild(tmp.firstChild);
    p.replaceChild(frag, n);
  }

  function traiterRacine(r) {
    if (!r) return;
    if (r.nodeType === 3) { if (r.parentElement && r.parentElement.closest(SCOPE)) traiterTexte(r); return; }
    if (r.nodeType !== 1) return;
    var racines = r.matches && r.matches(SCOPE) ? [r] : [].slice.call(r.querySelectorAll(SCOPE));
    if (!racines.length && r.closest && r.closest(SCOPE)) racines = [r];
    racines.forEach(function (x) {
      var w = document.createTreeWalker(x, NodeFilter.SHOW_TEXT), liste = [], n;
      while ((n = w.nextNode())) liste.push(n);
      liste.forEach(traiterTexte);
    });
  }

  var file = [], prevu = false;
  function planifier(n) {
    file.push(n);
    if (prevu) return;
    prevu = true;
    setTimeout(function () {   /* pas requestAnimationFrame : il ne tourne pas dans un onglet en arrière-plan */
      prevu = false;
      var l = file; file = [];
      l.forEach(traiterRacine);
    }, 0);
  }

  function demarrer() {
    traiterRacine(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'characterData') { planifier(m.target); return; }
        [].forEach.call(m.addedNodes, planifier);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
