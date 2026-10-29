/* Design « Nuit dorée » — tableau de bord Initiative : convertit les couleurs CLAIRES posées en ligne par les rubriques (fonds pastel, encres sombres, liserés clairs)
   en verres teintés et encres claires, sans toucher au code des rubriques (2026-10-13).
   Il ne fait que poser des attributs data-nd-* ; la mise en forme est dans assets/dashboard-nuit-doree.css. Inactif si <body> n'a pas class="nd".
   Retour arrière : retirer la ligne <script> de dashboard-initiative.html. */
(function () {
  'use strict';
  if (!document.body || !document.body.classList.contains('nd')) return;

  var ZONES = 'main.content,.modal-back,.modal-overlay,.modal-box,[id^="modal-"]';
  /* .rich-editor-area : la zone de saisie du traitement de texte reste BLANCHE — l'encre choisie par l'auteur (noir compris) doit s'y voir telle quelle */
  var SKIP = '#pv-card-preview-mount,iframe,canvas,img,svg,video,.pqr-canvas-wrap,.rich-editor-area,[data-nd-skip]';
  var COLOR_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;

  function toRGB(c) {
    c = String(c).trim().toLowerCase();
    var m;
    if ((m = c.match(/^#([0-9a-f]{3})$/))) { var h = m[1]; return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 }; }
    if ((m = c.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/))) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
    if ((m = c.match(/^rgba?\(([^)]*)\)$/))) { var p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat); if (p.length >= 3) return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    return null;
  }
  function lum(c) {
    function f(v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }
    return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b);
  }
  /* neutre | rouge | or | vert | bleu | violet */
  function teinte(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < .06) return 'neutre';
    var h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    if (h < 20 || h >= 340) return 'rouge';
    if (h < 68) return 'or';
    if (h < 170) return 'vert';
    if (h < 258) return 'bleu';
    return 'violet';
  }
  function couleurs(txt) {
    var out = [], m, re = new RegExp(COLOR_RE.source, 'gi');
    while ((m = re.exec(txt || ''))) { var c = toRGB(m[0]); if (c && c.a > .35) out.push(c); }
    return out;
  }

  function traiter(el) {
    if (el.nodeType !== 1 || !el.hasAttribute('style')) return;
    if (el.matches(SKIP) || el.closest(SKIP) || !el.closest(ZONES)) return;
    var s = el.style;

    /* fond clair (couleur unie ou dégradé dont toutes les teintes sont claires) */
    var fond = (s.background || '') + ' ' + (s.backgroundColor || '') + ' ' + (s.backgroundImage || '');
    if (/#|rgb/i.test(fond)) {
      var cs = couleurs(fond);
      if (cs.length && cs.every(function (c) { return lum(c) > .62; })) {
        var t = teinte(cs[0]);
        /* le blanc pur et les gris très pâles : verre neutre */
        el.setAttribute('data-nd-fond', t);
      } else if (el.hasAttribute('data-nd-fond')) el.removeAttribute('data-nd-fond');
    }

    /* encre sombre posée en ligne (les boutons pleins gardent la leur : ils portent leur propre fond) */
    var col = s.color;
    if (col && /#|rgb/i.test(col) && !(el.classList.contains('btn') && !el.classList.contains('btn-outline'))) {
      var c = toRGB(col);
      if (c && lum(c) < .36) {
        var tc = teinte(c);
        el.setAttribute('data-nd-encre', tc === 'neutre' ? (lum(c) < .1 ? 'texte' : 'doux') : tc);
      }
    }

    /* liseré clair posé en ligne */
    var bord = (s.border || '') + ' ' + (s.borderColor || '') + ' ' + (s.borderTop || '') + ' ' + (s.borderBottom || '') + ' ' + (s.borderLeft || '') + ' ' + (s.borderRight || '');
    if (/#|rgb/i.test(bord)) {
      var bc = couleurs(bord);
      if (bc.length && bc.every(function (x) { return lum(x) > .6; })) el.setAttribute('data-nd-bord', '1');
    }
  }

  function balayer(racine) {
    if (!racine || racine.nodeType !== 1) return;
    traiter(racine);
    var liste = racine.querySelectorAll('[style]');
    for (var i = 0; i < liste.length; i++) traiter(liste[i]);
  }

  var file = new Set(), prevu = false;
  function planifier(n) {
    file.add(n);
    if (prevu) return;
    prevu = true;
    setTimeout(function () {
      prevu = false;
      var lot = Array.from(file); file.clear();
      lot.forEach(function (x) { if (x.isConnected) balayer(x); });
    }, 30);
  }

  var obs = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type === 'attributes') planifier(m.target);
      else m.addedNodes.forEach(function (n) { if (n.nodeType === 1) planifier(n); });
    });
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  balayer(document.body);
})();
