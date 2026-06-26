/**
 * Diaspo'Actif — QR Code Profil
 * Usage :
 *   ProfileQR.render(container, { userId, userName, userRole, userOrg, userSlug })
 *   ProfileQR.renderInit(container, { initId, initNom, initSlug })
 *
 * Dépendance : qrcodejs (chargée dynamiquement si absente)
 */
(function () {
  'use strict';

  const QRCODE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  const BASE_URL   = window.location.origin;

  /* ── Styles ── */
  const CSS = `
.pqr-wrap {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  font-family: inherit;
}
.pqr-canvas-wrap {
  position: relative; width: 180px; height: 180px; border-radius: 14px;
  overflow: hidden; border: 2px solid #e2e8f0;
  box-shadow: 0 4px 20px rgba(0,0,0,.08);
  background: #fff; display: flex; align-items: center; justify-content: center;
}
.pqr-canvas-wrap canvas, .pqr-canvas-wrap img { display: block; }
.pqr-logo {
  position: absolute; width: 40px; height: 40px; border-radius: 50%;
  border: 3px solid #fff; background: #0F2A50;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; pointer-events: none;
  box-shadow: 0 2px 8px rgba(0,0,0,.2);
}
.pqr-url {
  font-size: 10px; color: #64748b; text-align: center; word-break: break-all;
  max-width: 200px; padding: 4px 8px; background: #f8fafc; border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.pqr-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; max-width: 220px; }
.pqr-btn {
  padding: 6px 12px; border-radius: 8px; border: 1.5px solid #e2e8f0;
  background: #fff; font-size: 11px; font-weight: 800; cursor: pointer;
  display: flex; align-items: center; gap: 4px; color: #374151; transition: all .15s;
}
.pqr-btn:hover { background: #0F2A50; color: #fff; border-color: #0F2A50; }
.pqr-btn.primary { background: #ff6b00; color: #fff; border-color: #ff6b00; }
.pqr-btn.primary:hover { background: #e55a00; }
.pqr-copy-ok { color: #10b981 !important; border-color: #10b981 !important; }

/* ── Modal carte de visite ── */
.pqr-modal-bg {
  position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 9999;
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.pqr-modal {
  background: #fff; border-radius: 20px; padding: 28px; max-width: 520px; width: 100%;
  box-shadow: 0 24px 60px rgba(0,0,0,.25);
}
.pqr-modal h3 { font-size: 16px; font-weight: 800; margin: 0 0 18px; color: #0F2A50; }
.pqr-card-preview {
  background: linear-gradient(135deg, #0F2A50 0%, #1565C0 100%);
  border-radius: 14px; padding: 24px 20px; color: #fff; display: flex;
  gap: 20px; align-items: center; margin-bottom: 16px;
}
.pqr-card-qr {
  width: 100px; height: 100px; border-radius: 10px; background: #fff;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  overflow: hidden;
}
.pqr-card-info { flex: 1; min-width: 0; }
.pqr-card-logo { font-size: 11px; font-weight: 800; opacity: .7; margin-bottom: 6px; letter-spacing: .05em; }
.pqr-card-name { font-size: 18px; font-weight: 900; margin-bottom: 4px; }
.pqr-card-role { font-size: 12px; opacity: .8; margin-bottom: 6px; }
.pqr-card-url { font-size: 10px; opacity: .6; word-break: break-all; }
.pqr-modal-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.pqr-modal-btn {
  flex: 1; min-width: 110px; text-align: center; padding: 10px;
  border-radius: 9px; border: 1.5px solid #e2e8f0; background: #fff;
  font-size: 12px; font-weight: 800; cursor: pointer; transition: all .15s; color: #374151;
}
.pqr-modal-btn:hover { background: #0F2A50; color: #fff; border-color: transparent; }
.pqr-modal-btn.orange { background: #ff6b00; color: #fff; border-color: transparent; }
.pqr-modal-btn.orange:hover { background: #e55a00; }
`;

  function injectCSS() {
    if (document.getElementById('pqr-styles')) return;
    const s = document.createElement('style');
    s.id = 'pqr-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ── Charger QRCode.js si absent ── */
  function loadQRLib() {
    return new Promise((resolve, reject) => {
      if (window.QRCode) { resolve(); return; }
      const s = document.createElement('script');
      s.src = QRCODE_CDN;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  /* ── URL publique permanente ── */
  function profileUrl(id, type = 'user') {
    if (type === 'initiative') return `${BASE_URL}/initiative.html?id=${id}`;
    return `${BASE_URL}/profil.html?id=${id}`;
  }

  /* ── Générer le QR dans un canvas ── */
  function generateQR(canvasWrap, url, size = 180) {
    canvasWrap.innerHTML = '';
    const div = document.createElement('div');
    canvasWrap.appendChild(div);
    return new window.QRCode(div, {
      text: url,
      width: size,
      height: size,
      colorDark: '#0F2A50',
      colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel.H,
    });
  }

  /* ── Obtenir le canvas du QR ── */
  function getCanvas(wrap) {
    return wrap.querySelector('canvas');
  }

  /* ── Download PNG ── */
  function downloadPNG(canvas, name) {
    const url = canvas.toDataURL('image/png', 1.0);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-diaspoactif-${name.toLowerCase().replace(/\s+/g,'-')}.png`;
    a.click();
  }

  /* ── Download SVG (QR encodé en SVG vectoriel simple) ── */
  function downloadSVG(canvas, name, url) {
    // On crée un SVG qui contient l'image QR encodée + texte
    const dataURL = canvas.toDataURL('image/png', 1.0);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="300" height="340" viewBox="0 0 300 340">
  <rect width="300" height="340" fill="#fff" rx="14"/>
  <image x="50" y="30" width="200" height="200" xlink:href="${dataURL}"/>
  <text x="150" y="252" text-anchor="middle" font-family="Arial,sans-serif"
        font-size="11" fill="#0F2A50" font-weight="700">${name}</text>
  <text x="150" y="268" text-anchor="middle" font-family="Arial,sans-serif"
        font-size="8.5" fill="#64748b">${url}</text>
  <text x="150" y="310" text-anchor="middle" font-family="Arial,sans-serif"
        font-size="9" fill="#ff6b00" font-weight="800">Diaspo'Actif</text>
  <text x="150" y="322" text-anchor="middle" font-family="Arial,sans-serif"
        font-size="7.5" fill="#94a3b8">Plateforme internationale de la diaspora</text>
</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qr-diaspoactif-${name.toLowerCase().replace(/\s+/g,'-')}.svg`;
    a.click();
  }

  /* ── Impression carte de visite ── */
  function printCard(qrDataURL, name, role, url, orgName) {
    const w = window.open('', '_blank', 'width=600,height=400');
    w.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Carte de visite — ${name}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f0f4f8; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  @page { size: 90mm 55mm; margin: 0; }
  @media print {
    body { background: none; display: block; }
    .no-print { display: none; }
    .card { page-break-inside: avoid; box-shadow: none !important; }
  }
  .controls { text-align: center; padding: 20px; }
  .controls button { margin: 4px; padding: 8px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 13px; }
  .btn-print { background: #0F2A50; color: #fff; }
  .btn-close { background: #e2e8f0; color: #374151; }
  .card-wrap { display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .card {
    width: 340px; height: 200px; border-radius: 14px; overflow: hidden;
    display: flex; box-shadow: 0 8px 30px rgba(0,0,0,.2);
    background: linear-gradient(135deg, #0F2A50 0%, #1565C0 100%);
  }
  .card-left {
    width: 200px; padding: 20px 16px; display: flex; flex-direction: column;
    justify-content: space-between; color: #fff;
  }
  .card-da { font-size: 9px; font-weight: 800; letter-spacing: .1em; opacity: .6; text-transform: uppercase; }
  .card-name { font-size: 17px; font-weight: 900; line-height: 1.2; margin: 6px 0 3px; }
  .card-role { font-size: 10px; opacity: .75; margin-bottom: 3px; }
  .card-org { font-size: 10px; opacity: .6; font-style: italic; }
  .card-url { font-size: 8px; opacity: .5; word-break: break-all; margin-top: auto; }
  .card-right {
    width: 140px; background: #fff; display: flex; align-items: center;
    justify-content: center; flex-direction: column; gap: 6px; padding: 10px;
  }
  .card-qr { width: 100px; height: 100px; display: block; border-radius: 6px; }
  .card-scan { font-size: 8px; color: #0F2A50; font-weight: 800; text-align: center; }
  .card-back {
    width: 340px; height: 200px; border-radius: 14px; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #0F2A50 0%, #1565C0 100%);
    flex-direction: column; gap: 8px; color: #fff; box-shadow: 0 8px 30px rgba(0,0,0,.2);
  }
  .card-back-logo { font-size: 32px; }
  .card-back-brand { font-size: 16px; font-weight: 900; }
  .card-back-tagline { font-size: 9px; opacity: .7; text-align: center; max-width: 200px; }
  .card-back-web { font-size: 10px; opacity: .5; margin-top: 8px; }
</style></head>
<body>
<div class="controls no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimer</button>
  <button class="btn-close" onclick="window.close()">✕ Fermer</button>
</div>
<div class="card-wrap">
  <!-- Recto -->
  <div class="card">
    <div class="card-left">
      <div>
        <div class="card-da">Diaspo'Actif</div>
        <div class="card-name">${name}</div>
        <div class="card-role">${role}</div>
        ${orgName ? `<div class="card-org">${orgName}</div>` : ''}
      </div>
      <div class="card-url">${url}</div>
    </div>
    <div class="card-right">
      <img class="card-qr" src="${qrDataURL}" alt="QR Code">
      <div class="card-scan">Scannez pour voir le profil</div>
    </div>
  </div>
  <!-- Verso -->
  <div class="card-back">
    <div class="card-back-logo">🌍</div>
    <div class="card-back-brand">Diaspo'Actif</div>
    <div class="card-back-tagline">Plateforme internationale de la diaspora africaine</div>
    <div class="card-back-web">diaspoactif.com</div>
  </div>
</div>
</body></html>`);
    w.document.close();
  }

  /* ── Modal carte de visite (preview) ── */
  function showCardModal(qrDataURL, name, role, url, orgName) {
    const bg = document.createElement('div');
    bg.className = 'pqr-modal-bg';
    bg.innerHTML = `
      <div class="pqr-modal">
        <h3>🎴 Carte de visite — ${name}</h3>
        <div class="pqr-card-preview">
          <div class="pqr-card-qr"><img src="${qrDataURL}" width="96" height="96" style="border-radius:8px;display:block;"></div>
          <div class="pqr-card-info">
            <div class="pqr-card-logo">🌍 DIASPO'ACTIF</div>
            <div class="pqr-card-name">${name}</div>
            <div class="pqr-card-role">${role}${orgName ? ' · ' + orgName : ''}</div>
            <div class="pqr-card-url">${url}</div>
          </div>
        </div>
        <div class="pqr-modal-actions">
          <button class="pqr-modal-btn" onclick="this.closest('.pqr-modal-bg').remove()">✕ Fermer</button>
          <button class="pqr-modal-btn" id="pqr-dl-png-modal">⬇️ PNG</button>
          <button class="pqr-modal-btn" id="pqr-dl-svg-modal">⬇️ SVG</button>
          <button class="pqr-modal-btn orange" id="pqr-print-modal">🖨️ Imprimer</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });

    const safeName = name.toLowerCase().replace(/\s+/g, '-');
    bg.querySelector('#pqr-dl-png-modal').onclick = () => {
      const a = document.createElement('a');
      a.href = qrDataURL;
      a.download = `qr-diaspoactif-${safeName}.png`;
      a.click();
    };
    bg.querySelector('#pqr-dl-svg-modal').onclick = () => {
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="300" height="340" viewBox="0 0 300 340">
  <rect width="300" height="340" fill="#ffffff" rx="14"/>
  <image x="50" y="30" width="200" height="200" xlink:href="${qrDataURL}"/>
  <text x="150" y="252" text-anchor="middle" font-family="Arial" font-size="13" fill="#0F2A50" font-weight="700">${name}</text>
  <text x="150" y="268" text-anchor="middle" font-family="Arial" font-size="9" fill="#64748b">${role}${orgName ? ' · ' + orgName : ''}</text>
  <text x="150" y="286" text-anchor="middle" font-family="Arial" font-size="8" fill="#94a3b8">${url}</text>
  <text x="150" y="316" text-anchor="middle" font-family="Arial" font-size="10" fill="#ff6b00" font-weight="800">🌍 Diaspo'Actif</text>
</svg>`;
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `qr-diaspoactif-${safeName}.svg`;
      a.click();
    };
    bg.querySelector('#pqr-print-modal').onclick = () => {
      printCard(qrDataURL, name, role, url, orgName);
    };
  }

  /* ── Render principal ── */
  async function render(container, opts = {}) {
    injectCSS();

    const {
      userId = null, initId = null, userName = 'Profil',
      userRole = 'Membre', userOrg = '', userSlug = null,
      initNom = 'Initiative', initSlug = null, size = 180,
      showActions = true, compact = false,
    } = opts;

    const type = initId ? 'initiative' : 'user';
    const id   = initId || userId;
    const name = initId ? initNom : userName;
    const role = userRole;
    const org  = userOrg;
    const url  = profileUrl(id, type);

    container.innerHTML = '<div style="color:#94a3b8;font-size:12px;padding:8px;">Génération du QR…</div>';

    try {
      await loadQRLib();
    } catch(e) {
      container.innerHTML = '<div style="color:#ef4444;font-size:12px;">Impossible de charger QRCode.js</div>';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'pqr-wrap';

    // Conteneur QR
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'pqr-canvas-wrap';
    canvasWrap.style.width = canvasWrap.style.height = size + 'px';
    wrap.appendChild(canvasWrap);

    // Logo central
    const logo = document.createElement('div');
    logo.className = 'pqr-logo';
    logo.textContent = '🌍';
    logo.style.cssText = `width:${Math.round(size*0.22)}px;height:${Math.round(size*0.22)}px;font-size:${Math.round(size*0.11)}px;`;
    canvasWrap.appendChild(logo);

    // Génération QR
    generateQR(canvasWrap, url, size);

    // URL raccourcie
    if (!compact) {
      const urlEl = document.createElement('div');
      urlEl.className = 'pqr-url';
      const short = url.replace(/^https?:\/\//, '').replace(/\.vercel\.app/, '').slice(0, 60);
      urlEl.textContent = short;
      wrap.appendChild(urlEl);
    }

    // Actions
    if (showActions) {
      const actions = document.createElement('div');
      actions.className = 'pqr-actions';

      actions.innerHTML = `
        <button class="pqr-btn primary" id="pqr-card">🎴 Carte</button>
        <button class="pqr-btn" id="pqr-dl-png">⬇️ PNG</button>
        <button class="pqr-btn" id="pqr-dl-svg">⬇️ SVG</button>
        <button class="pqr-btn" id="pqr-copy">🔗 Copier</button>
        ${navigator.share ? `<button class="pqr-btn" id="pqr-share">↗️ Partager</button>` : ''}
      `;
      wrap.appendChild(actions);

      const safeName = name.toLowerCase().replace(/\s+/g, '-');

      function getQRDataURL() {
        const canvas = getCanvas(canvasWrap);
        if (!canvas) return null;
        return canvas.toDataURL('image/png', 1.0);
      }

      actions.querySelector('#pqr-dl-png').onclick = () => {
        const d = getQRDataURL(); if (!d) return;
        const a = document.createElement('a');
        a.href = d; a.download = `qr-diaspoactif-${safeName}.png`; a.click();
      };
      actions.querySelector('#pqr-dl-svg').onclick = () => {
        const d = getQRDataURL(); if (!d) return;
        downloadSVG({ toDataURL: () => d }, name, url);
      };
      actions.querySelector('#pqr-card').onclick = () => {
        const d = getQRDataURL(); if (!d) return;
        showCardModal(d, name, role, url, org);
      };
      actions.querySelector('#pqr-copy').onclick = async (e) => {
        await navigator.clipboard.writeText(url).catch(() => {});
        const btn = e.currentTarget;
        btn.textContent = '✅ Copié !';
        btn.classList.add('pqr-copy-ok');
        setTimeout(() => { btn.textContent = '🔗 Copier'; btn.classList.remove('pqr-copy-ok'); }, 2000);
      };
      const shareBtn = actions.querySelector('#pqr-share');
      if (shareBtn) {
        shareBtn.onclick = () => navigator.share({ title: name + ' — Diaspo\'Actif', url });
      }
    }

    container.innerHTML = '';
    container.appendChild(wrap);
  }

  /* ── Auto-init ── */
  function autoInit() {
    document.querySelectorAll('[data-profile-qr]').forEach(el => {
      const userId = parseInt(el.dataset.profileQr) || null;
      const initId = parseInt(el.dataset.initQr) || null;
      render(el, {
        userId, initId,
        userName: el.dataset.qrName || 'Profil',
        userRole: el.dataset.qrRole || 'Membre',
        userOrg:  el.dataset.qrOrg  || '',
        initNom:  el.dataset.qrName || 'Initiative',
        compact:  el.dataset.qrCompact === '1',
        size:     parseInt(el.dataset.qrSize) || 180,
      });
    });
  }

  window.ProfileQR = { render, autoInit, profileUrl };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
