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
      box-shadow:0 20px 60px rgba(0,0,0,.35); overflow-x:hidden; overflow-y:auto;
      max-height:calc(100vh - 32px); max-height:calc(100dvh - 32px);
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
    /* Jauge de zoom plus visible (2026-09-22, demande explicite : "le curseur passait
       inaperçu") — le style natif du navigateur (piste fine ~4px, aucun contraste) ne
       suffisait pas ; piste et curseur redessinés explicitement, mêmes règles dupliquées
       pour chaque moteur (-webkit-/-moz-) car les pseudo-éléments de <input type=range> ne
       peuvent pas être partagés dans un seul sélecteur sans invalider toute la règle. */
    .icrop-controls input[type=range] {
      flex:1; accent-color:#1565C0; -webkit-appearance:none; appearance:none;
      height:8px; border-radius:99px; background:#CBD5E1; outline:none; cursor:pointer;
    }
    .icrop-controls input[type=range]::-webkit-slider-runnable-track { height:8px; border-radius:99px; background:#CBD5E1; }
    .icrop-controls input[type=range]::-webkit-slider-thumb {
      -webkit-appearance:none; appearance:none; width:22px; height:22px; margin-top:-7px;
      border-radius:50%; background:#1565C0; border:3px solid #fff;
      box-shadow:0 0 0 1.5px #1565C0, 0 2px 6px rgba(0,0,0,.35); cursor:pointer;
    }
    .icrop-controls input[type=range]::-moz-range-track { height:8px; border-radius:99px; background:#CBD5E1; }
    .icrop-controls input[type=range]::-moz-range-thumb {
      width:22px; height:22px; border-radius:50%; background:#1565C0; border:3px solid #fff;
      box-shadow:0 0 0 1.5px #1565C0, 0 2px 6px rgba(0,0,0,.35); cursor:pointer;
    }
    .icrop-zoom-label { font-size:16px; color:var(--icrop-muted); user-select:none; }
    /* Boutons toujours atteignables (2026-10-28) : avec une bannière haute ou le sélecteur de couleur ouvert, la fenêtre dépasse l'écran —
       elle défile et la barre Annuler / Valider reste collée en bas. */
    .icrop-actions { position:sticky; bottom:0; background:#fff; border-top:1px solid #E2E8F0; margin-top:16px; padding:14px 20px 16px; display:flex; gap:10px; justify-content:flex-end; }
    .icrop-btn { padding:10px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; border:1.5px solid transparent; }
    .icrop-btn-cancel { background:#fff; color:var(--icrop-ink); border-color:var(--icrop-border); }
    .icrop-btn-cancel:hover { background:#F8FAFC; border-color:#94A3B8; }
    .icrop-btn-ok { background:#1565C0; color:#fff; box-shadow:0 2px 8px rgba(21,101,192,.3); }
    .icrop-btn-ok:hover { background:#0D47A1; }
    .icrop-btn-reset { background:#fff; color:#1565C0; border-color:#BFDBFE; padding:6px 12px; font-size:11.5px; font-weight:700; white-space:nowrap; }
    .icrop-btn-reset:hover { background:#EAF2FE; }
    .icrop-fillrow { display:flex; align-items:center; gap:10px; }
    .icrop-swatches { display:flex; flex-wrap:wrap; gap:9px; }
    /* Pastille « autre couleur » (2026-10-28, demande explicite : noir, vert et un diagramme de couleurs
       à la souris pour choisir des nuances) : cercle arc-en-ciel qui ouvre le sélecteur ci-dessous. */
    .icrop-swatch-custom { background:conic-gradient(from 0deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00); }
    .icrop-swatch-custom.active::after { content:""; display:block; width:10px; height:10px; margin:auto; border-radius:50%; background:var(--icrop-pick,#fff); border:2px solid #fff; box-shadow:0 0 0 1px rgba(0,0,0,.4); }
    .icrop-picker { margin-top:12px; }
    .icrop-picker[hidden] { display:none; }
    .icrop-sv { position:relative; height:150px; border-radius:8px; overflow:hidden; border:1px solid var(--icrop-border); cursor:crosshair; touch-action:none; }
    .icrop-sv canvas { display:block; width:100%; height:100%; }
    .icrop-sv-dot { position:absolute; width:16px; height:16px; margin:-8px 0 0 -8px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 1.5px rgba(0,0,0,.55), 0 1px 4px rgba(0,0,0,.4); pointer-events:none; }
    .icrop-picker input.icrop-hue { display:block; width:100%; margin:12px 0 0; height:14px; border-radius:99px; -webkit-appearance:none; appearance:none; outline:none; cursor:pointer;
      background:linear-gradient(90deg,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%); border:1px solid var(--icrop-border); }
    .icrop-picker input.icrop-hue::-webkit-slider-runnable-track { height:14px; background:transparent; }
    .icrop-picker input.icrop-hue::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:22px; height:22px; margin-top:-4px; border-radius:50%; background:var(--icrop-hue-c,#fff); border:3px solid #fff; box-shadow:0 0 0 1.5px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.35); cursor:pointer; }
    .icrop-picker input.icrop-hue::-moz-range-track { height:14px; background:transparent; }
    .icrop-picker input.icrop-hue::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:var(--icrop-hue-c,#fff); border:3px solid #fff; box-shadow:0 0 0 1.5px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.35); cursor:pointer; }
    .icrop-hexrow { display:flex; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap; }
    .icrop-hex-prev { width:30px; height:30px; border-radius:8px; border:2px solid var(--icrop-border); flex:none; }
    .icrop-hex { width:96px; padding:7px 10px; font:700 13px/1 ui-monospace,Consolas,monospace; text-transform:uppercase; color:var(--icrop-ink); background:#fff; border:1.5px solid var(--icrop-border); border-radius:8px; }
    .icrop-hex:focus { outline:none; border-color:#1565C0; box-shadow:0 0 0 3px rgba(21,101,192,.2); }
    .icrop-hex.bad { border-color:#DC2626; }
    .icrop-picker-hint { font-size:11.5px; color:var(--icrop-muted); flex:1; min-width:140px; }
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
              <button class="icrop-btn icrop-btn-reset" type="button" title="Revenir à l'image complète">↺ Restaurer</button>
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
                <button type="button" class="icrop-swatch" data-color="#000000" style="background:#000000" title="Noir"></button>
                <button type="button" class="icrop-swatch" data-color="#16A34A" style="background:#16A34A" title="Vert"></button>
                <button type="button" class="icrop-swatch icrop-swatch-custom" title="Autre couleur : choisir une nuance à la souris" aria-expanded="false"></button>
              </div>
            </div>
            <div class="icrop-picker" hidden>
              <div class="icrop-sv"><canvas width="300" height="150"></canvas><span class="icrop-sv-dot"></span></div>
              <input type="range" class="icrop-hue" min="0" max="360" value="210" step="1" aria-label="Teinte">
              <div class="icrop-hexrow">
                <span class="icrop-hex-prev"></span>
                <input type="text" class="icrop-hex" maxlength="7" value="#FFFFFF" spellcheck="false" aria-label="Code de la couleur">
                <span class="icrop-picker-hint">Cliquez ou glissez dans le carré pour choisir la nuance, la barre arc-en-ciel change la teinte.</span>
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
      const swatches   = overlay.querySelectorAll('.icrop-swatch:not(.icrop-swatch-custom)');
      const customBtn  = overlay.querySelector('.icrop-swatch-custom');
      const picker     = overlay.querySelector('.icrop-picker');
      const svBox      = overlay.querySelector('.icrop-sv');
      const svCanvas   = svBox.querySelector('canvas');
      const svDot      = svBox.querySelector('.icrop-sv-dot');
      const hueEl      = overlay.querySelector('.icrop-hue');
      const hexEl      = overlay.querySelector('.icrop-hex');
      const hexPrev    = overlay.querySelector('.icrop-hex-prev');

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

      /* ----- sélecteur de nuances (teinte / saturation / luminosité), sans dépendance ----- */
      let pH = 210, pS = 0, pV = 1; // teinte 0-360, saturation et luminosité 0-1
      function hsv2hex(h, s, v) {
        const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
        return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
      }
      function hex2hsv(hex) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
        if (!m) return null;
        const n = parseInt(m[1], 16);
        const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return { h: h * 60, s: mx ? d / mx : 0, v: mx };
      }
      function drawSV() {
        const c = svCanvas.getContext('2d'), w = svCanvas.width, h = svCanvas.height;
        c.fillStyle = hsv2hex(pH, 1, 1); c.fillRect(0, 0, w, h);
        const gw = c.createLinearGradient(0, 0, w, 0); gw.addColorStop(0, '#fff'); gw.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = gw; c.fillRect(0, 0, w, h);
        const gb = c.createLinearGradient(0, 0, 0, h); gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, '#000');
        c.fillStyle = gb; c.fillRect(0, 0, w, h);
      }
      function paintPicker(fromHexField) {
        const hex = hsv2hex(pH, pS, pV);
        svDot.style.left = (pS * 100) + '%';
        svDot.style.top = ((1 - pV) * 100) + '%';
        hueEl.value = Math.round(pH);
        hueEl.style.setProperty('--icrop-hue-c', hsv2hex(pH, 1, 1));
        hexPrev.style.background = hex;
        if (!fromHexField) { hexEl.value = hex; hexEl.classList.remove('bad'); }
        return hex;
      }
      function applyCustom(fromHexField) {
        drawSV();
        fillColor = paintPicker(fromHexField);
        swatches.forEach((b) => b.classList.remove('active'));
        customBtn.classList.add('active');
        customBtn.style.setProperty('--icrop-pick', fillColor);
        draw();
      }
      function syncPickerTo(hex) {
        const p = hex2hsv(hex);
        if (!p) return;
        // un gris/noir/blanc n'a pas de teinte propre : on garde la teinte précédente pour ne pas faire sauter la barre
        if (p.s > 0.001 && p.v > 0.001) pH = p.h;
        pS = p.s; pV = p.v;
        drawSV(); paintPicker(false);
      }
      function svFromEvent(e) {
        const r = svBox.getBoundingClientRect();
        pS = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        pV = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        applyCustom(false);
      }
      let svDrag = false;
      svBox.addEventListener('pointerdown', (e) => { svDrag = true; try { svBox.setPointerCapture(e.pointerId); } catch (_) {} svFromEvent(e); e.preventDefault(); });
      svBox.addEventListener('pointermove', (e) => { if (svDrag) svFromEvent(e); });
      const svEnd = () => { svDrag = false; };
      svBox.addEventListener('pointerup', svEnd);
      svBox.addEventListener('pointercancel', svEnd);
      hueEl.addEventListener('input', () => { pH = Number(hueEl.value); applyCustom(false); });
      hexEl.addEventListener('input', () => {
        let v = hexEl.value.trim();
        if (v && v[0] !== '#') v = '#' + v;
        const p = hex2hsv(v);
        hexEl.classList.toggle('bad', !p);
        if (!p) return;
        if (p.s > 0.001 && p.v > 0.001) pH = p.h;
        pS = p.s; pV = p.v;
        applyCustom(true);
      });
      customBtn.addEventListener('click', () => {
        const open = picker.hidden;
        picker.hidden = !open;
        customBtn.setAttribute('aria-expanded', String(open));
        if (open) { syncPickerTo(fillColor); customBtn.classList.add('active'); swatches.forEach((b) => b.classList.remove('active')); customBtn.style.setProperty('--icrop-pick', fillColor); }
      });

      swatches.forEach((btn) => {
        btn.addEventListener('click', () => {
          fillColor = btn.getAttribute('data-color');
          swatches.forEach((b) => b.classList.remove('active'));
          customBtn.classList.remove('active');
          btn.classList.add('active');
          if (!picker.hidden) syncPickerTo(fillColor);
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
