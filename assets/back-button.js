/* ===========================================================
   BOUTON RETOUR UNIVERSEL — inséré dans toutes les pages modules.
   Priorité : historique navigateur (même origine) > dashboard du
   rôle connecté (via ROLE_DASHBOARD de app.js) > accueil.
   =========================================================== */
(function () {
  function insertBackButton() {
    if (document.getElementById('da-back-btn')) return;
    const bar = document.createElement('div');
    bar.id = 'da-back-bar';
    bar.style.cssText = [
      'position:sticky', 'top:0', 'z-index:9999', 'width:100%', 'box-sizing:border-box',
      'padding:8px 14px', 'background:#ffffff', 'border-bottom:1px solid rgba(0,0,0,.06)'
    ].join(';');
    const btn = document.createElement('button');
    btn.id = 'da-back-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Retour');
    btn.innerHTML = '← Retour';
    btn.style.cssText = [
      'display:inline-flex', 'align-items:center', 'gap:6px',
      'padding:7px 14px', 'border-radius:99px', 'border:1px solid rgba(0,0,0,.1)',
      'background:#f7f8fa', 'color:#0D2B4E', 'font-size:13px', 'font-weight:700',
      'cursor:pointer'
    ].join(';');
    btn.onmouseenter = () => { btn.style.background = '#F26422'; btn.style.color = '#fff'; };
    btn.onmouseleave = () => { btn.style.background = '#f7f8fa'; btn.style.color = '#0D2B4E'; };
    btn.addEventListener('click', daGoBack);
    bar.appendChild(btn);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  async function daGoBack() {
    const ref = document.referrer;
    const sameOrigin = ref && ref.indexOf(window.location.origin) === 0;
    if (window.history.length > 1 && sameOrigin) {
      window.history.back();
      return;
    }
    try {
      if (typeof fetchCurrentUser === 'function') {
        const user = await fetchCurrentUser();
        if (user && typeof ROLE_DASHBOARD !== 'undefined' && ROLE_DASHBOARD[user.role]) {
          window.location.href = ROLE_DASHBOARD[user.role];
          return;
        }
      }
    } catch (e) { /* pas connecté ou erreur réseau — repli sur l'accueil */ }
    window.location.href = 'index.html';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertBackButton);
  } else {
    insertBackButton();
  }
})();
