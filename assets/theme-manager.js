/* ============================================================
   DIASPO'ACTIF — Gestionnaire de thèmes
   Gère Classique / Institutionnel 2 avec aperçu + confirmation
   ============================================================ */
(function () {
  'use strict';

  const THEMES = {
    classique: {
      label: 'Classique',
      vars: {
        '--navy':        '#1B3A6B',
        '--navy-light':  '#24487E',
        '--orange':      '#E87722',
        '--orange-light':'#FFF4EC',
        '--bg':          '#F5F7FA',
        '--card':        '#FFFFFF',
        '--text':        '#1A2332',
        '--muted':       '#637085',
        '--border':      '#DDE3EC',
        '--green':       '#1A7A52',
        '--radius':      '10px',
        '--shadow':      '0 2px 14px rgba(27,58,107,.08)',
      }
    },
    institutionnel2: {
      label: 'Institutionnel 2',
      vars: {
        '--navy':        '#0D2B4E',
        '--navy-light':  '#1E4F8A',
        '--orange':      '#F26422',
        '--orange-light':'#FFF0E8',
        '--bg':          '#EEF2F8',
        '--card':        '#FFFFFF',
        '--text':        '#102A43',
        '--muted':       '#6B7280',
        '--border':      '#D6DEE8',
        '--green':       '#1A7A52',
        '--radius':      '12px',
        '--shadow':      '0 2px 16px rgba(13,43,78,.08)',
      }
    },
    emeraude: {
      label: 'Émeraude',
      vars: {
        '--navy':        '#065F46',
        '--navy-light':  '#0D9668',
        '--orange':      '#D97706',
        '--orange-light':'#FEF3E2',
        '--bg':          '#F0FBF6',
        '--card':        '#FFFFFF',
        '--text':        '#0F2E22',
        '--muted':       '#5B7A6D',
        '--border':      '#D3EBE0',
        '--green':       '#0D9668',
        '--radius':      '10px',
        '--shadow':      '0 2px 14px rgba(6,95,70,.08)',
      }
    },
    bordeaux: {
      label: 'Bordeaux',
      vars: {
        '--navy':        '#7A1E32',
        '--navy-light':  '#9C2B44',
        '--orange':      '#E8874B',
        '--orange-light':'#FCEFE7',
        '--bg':          '#FBF3F4',
        '--card':        '#FFFFFF',
        '--text':        '#2E1218',
        '--muted':       '#7A5F64',
        '--border':      '#EBD9DC',
        '--green':       '#1A7A52',
        '--radius':      '10px',
        '--shadow':      '0 2px 14px rgba(122,30,50,.09)',
      }
    },
    ardoise: {
      label: 'Ardoise sombre',
      vars: {
        '--navy':        '#1E293B',
        '--navy-light':  '#334155',
        '--orange':      '#F59E0B',
        '--orange-light':'#3A2F1A',
        '--bg':          '#0F172A',
        '--card':        '#1E293B',
        '--text':        '#E2E8F0',
        '--muted':       '#94A3B8',
        '--border':      '#334155',
        '--green':       '#22C55E',
        '--radius':      '10px',
        '--shadow':      '0 2px 16px rgba(0,0,0,.35)',
      }
    }
  };

  let _current = localStorage.getItem('da_theme') || 'institutionnel2';
  let _preview = null;
  let _timer   = null;
  let _seconds = 30;

  /* ── Applique les variables CSS sur :root ── */
  function applyVars(themeName) {
    const t = THEMES[themeName];
    if (!t) return;
    const root = document.documentElement;
    root.setAttribute('data-theme', themeName);
    Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  }

  /* ── Bannière de preview ── */
  function showBanner(newTheme) {
    removeBanner();
    const b = document.createElement('div');
    b.id = 'da-theme-banner';
    b.innerHTML = `
      <div class="da-tb-inner">
        <span class="da-tb-msg">👁 Aperçu : <strong>${THEMES[newTheme].label}</strong></span>
        <div class="da-tb-actions">
          <span class="da-tb-countdown" id="da-tb-cd">30s</span>
          <button class="da-tb-btn da-tb-confirm" onclick="window.daTheme.confirm()">✓ Conserver ce thème</button>
          <button class="da-tb-btn da-tb-revert"  onclick="window.daTheme.revert()">↩ Revenir au précédent</button>
        </div>
      </div>`;
    document.body.insertBefore(b, document.body.firstChild);

    _seconds = 30;
    _timer = setInterval(function () {
      _seconds--;
      var el = document.getElementById('da-tb-cd');
      if (el) el.textContent = _seconds + 's';
      if (_seconds <= 0) { clearInterval(_timer); window.daTheme.revert(); }
    }, 1000);
  }

  function removeBanner() {
    clearInterval(_timer);
    var b = document.getElementById('da-theme-banner');
    if (b) b.remove();
  }

  /* ── Sauvegarde côté serveur ── */
  function saveToServer(theme) {
    fetch('/api/user/preferences', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: theme })
    }).catch(function () {});
  }

  /* ── API publique ── */
  window.daTheme = {
    current: function () { return _current; },

    preview: function (themeName) {
      if (!THEMES[themeName] || themeName === _current) return;
      _preview = themeName;
      applyVars(themeName);
      showBanner(themeName);
    },

    confirm: function () {
      if (!_preview) return;
      _current = _preview;
      _preview = null;
      removeBanner();
      localStorage.setItem('da_theme', _current);
      saveToServer(_current);
      /* Flash succès */
      var flash = document.createElement('div');
      flash.id = 'da-theme-flash';
      flash.textContent = '✓ Thème enregistré !';
      document.body.insertBefore(flash, document.body.firstChild);
      setTimeout(function () { if (flash.parentNode) flash.remove(); }, 2500);
    },

    revert: function () {
      _preview = null;
      removeBanner();
      applyVars(_current);
    },

    getList: function () {
      return Object.entries(THEMES).map(function ([k, v]) {
        return { id: k, label: v.label };
      });
    }
  };

  /* ── Chargement initial ── */
  /* Appliquer le thème AVANT le premier paint pour éviter le flash */
  applyVars(_current);

  /* Synchroniser avec le serveur une fois connecté */
  document.addEventListener('DOMContentLoaded', function () {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.user && data.user.profil && data.user.profil.theme) {
          var serverTheme = data.user.profil.theme;
          if (serverTheme !== _current && THEMES[serverTheme]) {
            _current = serverTheme;
            localStorage.setItem('da_theme', _current);
            applyVars(_current);
          }
        }
      })
      .catch(function () {});
  });

})();
