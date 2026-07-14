/* ===========================================================
   BOUTON RETOUR AU TABLEAU DE BORD — pour les profils publics
   (profil-app.html, initiative.html, profil-collectivite.html).
   Contrairement à back-button.js (historique navigateur), ce
   bouton renvoie toujours vers le tableau de bord du rôle connecté,
   quelle que soit la façon dont l'utilisateur est arrivé sur la page.
   =========================================================== */
(function () {
  function insertBtn() {
    if (document.getElementById('da-back-dash-btn')) return;
    const btn = document.createElement('a');
    btn.id = 'da-back-dash-btn';
    btn.href = '#';
    btn.innerHTML = '← Retour au tableau de bord';
    btn.style.cssText = [
      'position:fixed', 'top:14px', 'left:14px', 'z-index:9999',
      'display:inline-flex', 'align-items:center', 'gap:6px',
      'padding:8px 16px', 'border-radius:99px',
      'background:rgba(13,43,78,.85)', 'backdrop-filter:blur(4px)',
      'color:#fff', 'font-size:13px', 'font-weight:700',
      'text-decoration:none', 'box-shadow:0 4px 14px rgba(0,0,0,.25)',
      'cursor:pointer'
    ].join(';');
    btn.addEventListener('mouseenter', () => { btn.style.background = '#E8703A'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(13,43,78,.85)'; });
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const user = typeof fetchCurrentUser === 'function' ? await fetchCurrentUser() : null;
        if (user && typeof ROLE_DASHBOARD !== 'undefined' && ROLE_DASHBOARD[user.role]) {
          window.location.href = ROLE_DASHBOARD[user.role];
          return;
        }
      } catch (e2) { /* pas connecté — repli sur l'accueil */ }
      window.location.href = 'index.html';
    });
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertBtn);
  } else {
    insertBtn();
  }
})();
