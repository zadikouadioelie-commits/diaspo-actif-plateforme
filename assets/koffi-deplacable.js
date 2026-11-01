/* Diaspo'Actif — bouton Koffi déplaçable (souris sur ordinateur, doigt sur téléphone).
   KoffiDeplacable(element, cle, poignee) : on saisit la poignée (par défaut l'élément) et on pose l'élément où il ne gêne pas.
   Un simple clic ou appui garde son effet habituel ; l'emplacement est mémorisé sur l'appareil (clé localStorage) en proportion de
   l'écran, donc il reste bien placé si la fenêtre change de taille. */
(function () {
  'use strict';
  if (window.KoffiDeplacable) return;

  window.KoffiDeplacable = function (el, cle, poignee) {
    if (!el || el.dataset.deplacable) return;
    el.dataset.deplacable = '1';
    const grip = poignee || el;
    let sx = 0, sy = 0, ox = 0, oy = 0, actif = false, bouge = false, glisse = false;

    const marges = () => ({ w: innerWidth - el.offsetWidth, h: innerHeight - el.offsetHeight });
    function poser(fx, fy) {
      const m = marges();
      const x = Math.min(Math.max(4, fx * m.w), Math.max(4, m.w - 4));
      const y = Math.min(Math.max(4, fy * m.h), Math.max(4, m.h - 4));
      el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';
    }
    function lire() {
      try { const s = JSON.parse(localStorage.getItem(cle) || 'null'); return s && isFinite(s.fx) && isFinite(s.fy) ? s : null; } catch (_) { return null; }
    }
    const memo = lire();
    if (memo) poser(memo.fx, memo.fy);
    window.addEventListener('resize', () => { const m = lire(); if (m) poser(m.fx, m.fy); });

    grip.style.touchAction = 'none'; grip.style.cursor = 'grab';
    grip.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      const r = el.getBoundingClientRect();
      actif = true; bouge = false; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
    });
    grip.addEventListener('pointermove', e => {
      if (!actif) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!bouge && Math.hypot(dx, dy) < 6) return;
      bouge = true; grip.style.cursor = 'grabbing';
      const m = marges();
      poser(m.w > 0 ? (ox + dx) / m.w : 0, m.h > 0 ? (oy + dy) / m.h : 0);
    });
    function fin() {
      if (!actif) return;
      actif = false; grip.style.cursor = 'grab';
      if (!bouge) return;
      const r = el.getBoundingClientRect(), m = marges();
      try { localStorage.setItem(cle, JSON.stringify({ fx: m.w > 0 ? r.left / m.w : 0, fy: m.h > 0 ? r.top / m.h : 0 })); } catch (_) {}
      glisse = true; setTimeout(() => { glisse = false; }, 0);
    }
    grip.addEventListener('pointerup', fin); grip.addEventListener('pointercancel', fin);
    /* Le « clic » qui suit un déplacement ne doit pas ouvrir Koffi. */
    grip.addEventListener('click', e => { if (glisse) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  };
})();
