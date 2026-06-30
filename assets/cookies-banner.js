/* ── Bandeau cookies Diaspo'Actif ── */
(function () {
  if (localStorage.getItem('da_cookies_ok')) return;

  const banner = document.createElement('div');
  banner.id = 'da-cookie-banner';
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <span style="flex:1;min-width:220px;font-size:13px;color:#cbd5e1;line-height:1.6;">
        🍪 Diaspo'Actif utilise uniquement des cookies techniques nécessaires à votre connexion (session, authentification). Aucun cookie publicitaire.
        <a href="/politique-confidentialite.html" style="color:#60A5FA;font-weight:600;margin-left:4px;">En savoir plus</a>
      </span>
      <div style="display:flex;gap:10px;flex-shrink:0;">
        <a href="/politique-confidentialite.html" style="font-size:12px;color:#94A3B8;text-decoration:underline;line-height:2.4;">Politique de confidentialité</a>
        <button id="da-cookie-accept" style="background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;border:none;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">
          J'accepte
        </button>
      </div>
    </div>`;

  Object.assign(banner.style, {
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    background: '#0D1B2A',
    borderTop: '1px solid rgba(37,99,235,.3)',
    padding: '14px 24px',
    zIndex: '9999',
    boxShadow: '0 -4px 24px rgba(0,0,0,.3)'
  });

  document.body.appendChild(banner);

  document.getElementById('da-cookie-accept').addEventListener('click', function () {
    localStorage.setItem('da_cookies_ok', '1');
    banner.style.transition = 'opacity .3s';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 300);
  });
})();
