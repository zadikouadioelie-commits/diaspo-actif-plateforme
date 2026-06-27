/* ═══════════════════════════════════════════════════════════════
   Package Diaspo'Actif — widget autonome
   Usage : window.DAPackages.render(containerEl, { show_on:'home' })
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const CACHE_KEY = 'da_packages_cache';
  const CACHE_TTL = 60000; // 1 min

  async function load(showOn) {
    const now = Date.now();
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const { ts, data } = JSON.parse(raw);
        if (now - ts < CACHE_TTL) {
          return showOn ? data.filter(p => {
            try { return JSON.parse(p.show_on).includes(showOn); } catch { return false; }
          }) : data;
        }
      }
    } catch {}

    const url = '/api/packages' + (showOn ? `?show_on=${encodeURIComponent(showOn)}` : '');
    const res = await fetch(url, { credentials: 'include' });
    const json = await res.json();
    const all = json.packages || [];
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: now, data: all })); } catch {}
    return all;
  }

  function invalidateCache() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch {}
  }

  function renderButtons(packages, container, opts = {}) {
    container.innerHTML = '';
    if (!packages.length) {
      if (opts.emptyMsg !== false) {
        container.innerHTML = '<span style="color:#94a3b8;font-size:13px;">Aucun lien actif</span>';
      }
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'da-pkg-wrap';
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;';

    packages.forEach(pkg => {
      const a = document.createElement('a');
      a.href = pkg.url || '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'da-pkg-btn';
      a.title = pkg.name;
      a.innerHTML = `<span class="da-pkg-icon">${pkg.icon}</span><span class="da-pkg-label">${pkg.name}</span>`;
      a.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:6px 12px;
        border-radius:20px;background:#f1f5f9;color:#1e293b;text-decoration:none;
        font-size:13px;font-weight:500;border:1px solid #e2e8f0;
        transition:background .15s,transform .1s;white-space:nowrap;`;
      a.addEventListener('mouseenter', () => {
        a.style.background = '#e2e8f0';
        a.style.transform = 'translateY(-1px)';
      });
      a.addEventListener('mouseleave', () => {
        a.style.background = '#f1f5f9';
        a.style.transform = '';
      });
      if (!pkg.url) {
        a.style.opacity = '0.45';
        a.style.pointerEvents = 'none';
      }
      wrap.appendChild(a);
    });
    container.appendChild(wrap);
  }

  async function render(container, opts = {}) {
    if (!container) return;
    container.innerHTML = '<span style="color:#94a3b8;font-size:12px;">Chargement…</span>';
    try {
      const pkgs = await load(opts.show_on || null);
      renderButtons(pkgs, container, opts);
    } catch (e) {
      container.innerHTML = '';
    }
  }

  window.DAPackages = { render, load, invalidateCache };

  // Auto-init sur les éléments [data-da-packages]
  function autoInit() {
    document.querySelectorAll('[data-da-packages]').forEach(el => {
      if (el._daInitialized) return;
      el._daInitialized = true;
      render(el, { show_on: el.dataset.daPackages || 'home', emptyMsg: false });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
