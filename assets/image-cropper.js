/* ===========================================================
   DIASPO'ACTIF — Outil de recadrage d'image (avatar / bannière)
   Sans dépendance externe. Modal plein écran avec pan + zoom,
   export en haute résolution via canvas.
   =========================================================== */
(function () {
  /* Palette (2026-09-09, demande explicite : "tout est trop pâle et non délimité") — chaque
     bloc de contrôle (indice, zoom, fond) est désormais une carte distincte sur un fond gris-
     bleu très légèrement teinté (--icrop-alt), avec une vraie bordure et un libellé en
     majuscules, plutôt que de flotter directement sur le blanc de la modale sans séparation. */
  const STYLE = `
    .icrop-overlay {
      position:fixed; inset:0; background:rgba(13,27,42,.82); z-index:99999;
      display:flex; align-items:center; justify-content:center;
      opacity:0; transition:opacity .18s; padding:16px;
    }
    .icrop-overlay.show { opacity:1; }
    .icrop-box {
      --icrop-alt:#F1F5F9; --icrop-border:#CBD5E1; --icrop-ink:#0D1B2A; --icrop-muted:#475569;
      background:#fff; border-radius:16px; width:100%; max-width:560px;
      box-shadow:0 20px 60px rgba(0,0,0,.35); overflow:hidden;
      transform:scale(.94); transition:transform .18s;
    }
    .icrop-overlay.show .icrop-box { transform:scale(1); }
    .icrop-head { padding:16px 20px; border-bottom:1px solid #E2E8F0; font-weight:800; font-size:15px; color:var(--icrop-ink); display:flex; justify-content:space-between; align-items:center; }
    .icrop-close { background:none; border:none; font-size:20px; cursor:pointer; color:#64748b; line-height:1; padding:4px; }
    .icrop-stage { position:relative; width:100%; overflow:hidden; background:#111; touch-action:none; cursor:grab; }
    .icrop-stage.dragging { cursor:grabbing; }
    .icrop-stage canvas { display:block; width:100%; height:100%; }
    .icrop-mask { position:absolute; inset:0; pointer-events:none; box-shadow:0 0 0 9999px rgba(0,0,0,.55); }
    .icrop-mask.circle { border-radius:50%; }
    .icrop-hint {
      margin:14px 20px 0; padding:9px 12px; font-size:12px; line-height:1.5; color:#1E3A5F;
      background:#EAF2FE; border:1px solid #BFDBFE; border-left:3px solid #1565C0; border-radius:0 8px 8px 0;
    }
    .icrop-section { margin:12px 20px 0; padding:12px 14px; background:var(--icrop-alt); border:1px solid var(--icrop-border); border-radius:10px; }
    .icrop-section-label { font-size:10.5px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--icrop-muted); margin-bottom:9px; display:block; }
    .icrop-controls { display:flex; align-items:center; gap:12px; }
    .icrop-controls input[type=range] { flex:1; accent-color:#1565C0; }
    .icrop-zoom-label { font-size:16px; color:var(--icrop-muted); user-select:none; }
    .icrop-actions { padding:18px 20px 20px; display:flex; gap:10px; justify-content:flex-end; }
    .icrop-btn { padding:10px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; border:1.5px solid transparent; }
    .icrop-btn-cancel { background:#fff; color:var(--icrop-ink); border-color:var(--icrop-border); }
    .icrop-btn-cancel:hover { background:#F8FAFC; border-color:#94A3B8; }
    .icrop-btn-ok { background:#1565C0; color:#fff; box-shadow:0 2px 8px rgba(21,101,192,.3); }
    .icrop-btn-ok:hover { background:#0D47A1; }
    .icrop-btn-reset { background:#fff; color:#1565C0; border-color:#BFDBFE; padding:6px 12px; font-size:11.5px; font-weight:700; white-space:nowrap; }
    .icrop-btn-reset:hover { background:#EAF2FE; }
    .icrop-fillrow { display:flex; align-items:center; gap:10px; }
    .icrop-swatches { display:flex; gap:9px; }
    .icrop-swatch { width:28px; height:28px; border-radius:50%; border:2px solid var(--icrop-border); cursor:pointer; padding:0; box-shadow:0 0 0 1px rgba(0,0,0,.05) inset; transition:transform .1s; }
    .icrop-swatch:hover { transform:scale(1.08); }
    .icrop-swatch.active { border-color:#1565C0; box-shadow:0 0 0 3px rgba(21,101,192,.22); }
  `;

  function ensureStyle() {
    if (document.getElementById('icrop-style')) return;
    const s = document.createElement('style');
    s.id = 'icrop-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  /**
   * Ouvre l'outil de recadrage.
   * @param {File} file — fichier image sélectionné
   * @param {Object} opts
   *   shape: 'circle' | 'rect'  (avatar = circle, bannière = rect)
   *   aspect: largeur/hauteur de la zone de recadrage (ex: 1 pour carré, 3 pour bannière large)
   *   outW, outH: résolution de sortie en pixels
   * @returns {Promise<Blob|null>} le blob JPEG recadré, ou null si annulé
   */
  function openCropper(file, opts = {}) {
    const shape  = opts.shape || 'circle';
    const aspect = opts.aspect || 1;
    const outW   = opts.outW || (shape === 'circle' ? 600 : 1600);
    const outH   = opts.outH || Math.round(outW / aspect);

    ensureStyle();

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'icrop-overlay';
      overlay.innerHTML = `
        <div class="icrop-box">
          <div class="icrop-head">
            <span>${shape === 'circle' ? '🖼️ Recadrer la photo' : '🖼️ Recadrer la bannière'}</span>
            <button class="icrop-close" type="button" aria-label="Fermer">✕</button>
          </div>
          <div class="icrop-hint">💡 Image complète affichée par défaut. Faites glisser pour repositionner, utilisez le curseur pour zoomer (dans les deux sens).</div>
          <div class="icrop-stage" style="aspect-ratio:${aspect}">
            <canvas></canvas>
            <div class="icrop-mask ${shape === 'circle' ? 'circle' : ''}"></div>
          </div>
          <div class="icrop-section">
            <span class="icrop-section-label">Zoom</span>
            <div class="icrop-controls">
              <span class="icrop-zoom-label">🔍</span>
              <input type="range" min="50" max="400" value="100" step="1">
              <span class="icrop-zoom-label" style="font-size:15px;">🔍</span>
              <button class="icrop-btn icrop-btn-reset" type="button" title="Revenir à l'image complète">↺ Réinitialiser</button>
            </div>
          </div>
          <div class="icrop-section">
            <span class="icrop-section-label">Fond</span>
            <div class="icrop-fillrow">
              <div class="icrop-swatches">
                <button type="button" class="icrop-swatch active" data-color="#FFFFFF" style="background:#FFFFFF" title="Blanc"></button>
                <button type="button" class="icrop-swatch" data-color="#F1E4CB" style="background:#F1E4CB" title="Beige"></button>
                <button type="button" class="icrop-swatch" data-color="#E2E8F0" style="background:#E2E8F0" title="Gris clair"></button>
                <button type="button" class="icrop-swatch" data-color="#0D2B4E" style="background:#0D2B4E" title="Bleu marine"></button>
                <button type="button" class="icrop-swatch" data-color="#F26422" style="background:#F26422" title="Orange"></button>
              </div>
            </div>
          </div>
          <div class="icrop-actions">
            <button class="icrop-btn icrop-btn-cancel" type="button">Annuler</button>
            <button class="icrop-btn icrop-btn-ok" type="button">Valider</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));

      const stage  = overlay.querySelector('.icrop-stage');
      const canvas = overlay.querySelector('canvas');
      const ctx    = canvas.getContext('2d');
      const zoomEl = overlay.querySelector('input[type=range]');
      const btnOk  = overlay.querySelector('.icrop-btn-ok');
      const btnCancel = overlay.querySelector('.icrop-btn-cancel');
      const btnClose   = overlay.querySelector('.icrop-close');
      const btnReset   = overlay.querySelector('.icrop-btn-reset');
      const swatches   = overlay.querySelectorAll('.icrop-swatch');

      let img = new Image();
      let imgLoaded = false;
      let fillColor = '#FFFFFF';
      let scale = 1, fitScale = 1;
      let offX = 0, offY = 0; // décalage du centre de l'image (en px, repère canvas)
      let dragging = false, lastX = 0, lastY = 0;

      function stageSize() {
        const r = stage.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }

      function fitCanvasToStage() {
        const { w, h } = stageSize();
        canvas.width = Math.round(w * (window.devicePixelRatio || 1));
        canvas.height = Math.round(h * (window.devicePixelRatio || 1));
        draw();
      }

      function draw() {
        if (!imgLoaded) return;
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width, ch = canvas.height;
        ctx.clearRect(0, 0, cw, ch);
        ctx.fillStyle = fillColor;
        ctx.fillRect(0, 0, cw, ch);
        const iw = img.naturalWidth * scale * dpr;
        const ih = img.naturalHeight * scale * dpr;
        const cx = cw / 2 + offX * dpr;
        const cy = ch / 2 + offY * dpr;
        ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih);
      }

      function clampOffset() {
        const { w, h } = stageSize();
        const iw = img.naturalWidth * scale;
        const ih = img.naturalHeight * scale;
        const maxOffX = Math.max(0, (iw - w) / 2);
        const maxOffY = Math.max(0, (ih - h) / 2);
        offX = Math.min(maxOffX, Math.max(-maxOffX, offX));
        offY = Math.min(maxOffY, Math.max(-maxOffY, offY));
      }

      img.onload = () => {
        imgLoaded = true;
        const { w, h } = stageSize();
        // fitScale = plus grand facteur qui montre l'image ENTIERE dans le cadre (object-fit:contain).
        // Zoom par defaut = image complete visible, jamais recadree automatiquement (comportement
        // precedent : minScale=cover forcait toujours un recadrage, impossible a annuler).
        fitScale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
        scale = fitScale;
        offX = 0; offY = 0;
        zoomEl.value = 100;
        fitCanvasToStage();
      };
      img.src = URL.createObjectURL(file);

      window.addEventListener('resize', fitCanvasToStage);

      zoomEl.addEventListener('input', () => {
        const pct = Number(zoomEl.value) / 100; // 0.3 -> 4.0, 1.0 = image complete visible
        scale = fitScale * pct;
        clampOffset();
        draw();
      });

      btnReset.addEventListener('click', () => {
        scale = fitScale;
        offX = 0; offY = 0;
        zoomEl.value = 100;
        draw();
      });

      swatches.forEach((btn) => {
        btn.addEventListener('click', () => {
          fillColor = btn.getAttribute('data-color');
          swatches.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          draw();
        });
      });

      function pointerDown(x, y) {
        dragging = true; lastX = x; lastY = y;
        stage.classList.add('dragging');
      }
      function pointerMove(x, y) {
        if (!dragging) return;
        offX += (x - lastX);
        offY += (y - lastY);
        lastX = x; lastY = y;
        clampOffset();
        draw();
      }
      function pointerUp() { dragging = false; stage.classList.remove('dragging'); }

      stage.addEventListener('mousedown', (e) => pointerDown(e.clientX, e.clientY));
      window.addEventListener('mousemove', (e) => pointerMove(e.clientX, e.clientY));
      window.addEventListener('mouseup', pointerUp);
      stage.addEventListener('touchstart', (e) => { const t = e.touches[0]; pointerDown(t.clientX, t.clientY); }, { passive: true });
      stage.addEventListener('touchmove', (e) => { const t = e.touches[0]; pointerMove(t.clientX, t.clientY); }, { passive: true });
      stage.addEventListener('touchend', pointerUp);

      function cleanup(result) {
        window.removeEventListener('resize', fitCanvasToStage);
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 180);
        URL.revokeObjectURL(img.src);
        resolve(result);
      }

      btnCancel.addEventListener('click', () => cleanup(null));
      btnClose.addEventListener('click', () => cleanup(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });

      btnOk.addEventListener('click', () => {
        // Export haute résolution : on redessine la zone visible du stage à la résolution outW×outH
        const { w, h } = stageSize();
        const out = document.createElement('canvas');
        out.width = outW; out.height = outH;
        const octx = out.getContext('2d');
        const ratio = outW / w; // facteur d'agrandissement stage -> sortie
        const iw = img.naturalWidth * scale * ratio;
        const ih = img.naturalHeight * scale * ratio;
        const cx = outW / 2 + offX * ratio;
        const cy = outH / 2 + offY * ratio;
        octx.fillStyle = fillColor;
        octx.fillRect(0, 0, outW, outH);
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih);
        out.toBlob((blob) => cleanup(blob), 'image/jpeg', 0.9);
      });
    });
  }

  window.openImageCropper = openCropper;
})();
