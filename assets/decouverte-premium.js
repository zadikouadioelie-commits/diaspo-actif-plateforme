/* 🥇 Découverte Premium — badge doré réutilisable + compte à rebours (30 jours d'essai
   Premium offerts à la création de tout compte). Cohérent avec l'identité visuelle
   Premium (dégradé or #c8960c → #f2c94c, texte brun foncé #2a1e00). */
(function () {
  function joursHeuresMinutes(msRestant) {
    const totalMin = Math.max(0, Math.floor(msRestant / 60000));
    const jours = Math.floor(totalMin / (60 * 24));
    const heures = Math.floor((totalMin % (60 * 24)) / 60);
    const minutes = totalMin % 60;
    return { jours, heures, minutes };
  }

  /* Badge compact (annuaire, en-tête de profil) : "🥇 Découverte Premium · 18 j restants" */
  window.decouvertePremiumBadgeHtml = function (dateExpirationIso, opts) {
    opts = opts || {};
    const ms = new Date(dateExpirationIso).getTime() - Date.now();
    if (ms <= 0) return '';
    const { jours } = joursHeuresMinutes(ms);
    const dateFin = new Date(dateExpirationIso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const extra = opts.showDate ? ` · Fin : ${dateFin}` : '';
    return `<span class="dp-badge" title="Ce compte bénéficie d'un accès Premium temporaire de découverte (30 jours), transparent pour tous les visiteurs.">🥇 Découverte Premium · ${jours} j restant${jours > 1 ? 's' : ''}${extra}</span>`;
  };

  /* Bloc complet avec compte à rebours détaillé (haut de profil public / vitrine). */
  window.decouvertePremiumBlockHtml = function (dateExpirationIso, id) {
    const ms = new Date(dateExpirationIso).getTime() - Date.now();
    if (ms <= 0) return '';
    return `<div class="dp-block" id="${id || 'dp-block'}" data-expire="${dateExpirationIso}">
      <div class="dp-block-title">🥇 Découverte Premium</div>
      <div class="dp-block-sub">Compte Premium en découverte</div>
      <div class="dp-block-countdown">⏳ <span class="dp-countdown-text">…</span></div>
      <div class="dp-block-note">Ce compte bénéficie actuellement des fonctionnalités Premium dans le cadre de l'offre de découverte Diaspo'Actif.</div>
    </div>`;
  };

  function updateCountdowns() {
    document.querySelectorAll('[data-expire]').forEach(el => {
      const ms = new Date(el.dataset.expire).getTime() - Date.now();
      const span = el.querySelector('.dp-countdown-text');
      if (!span) return;
      if (ms <= 0) { el.remove(); return; }
      const { jours, heures, minutes } = joursHeuresMinutes(ms);
      span.textContent = `Il reste : ${jours} jour${jours > 1 ? 's' : ''}, ${String(heures).padStart(2, '0')} heure${heures > 1 ? 's' : ''}, ${String(minutes).padStart(2, '0')} minute${minutes > 1 ? 's' : ''}`;
    });
  }
  window.startDecouvertePremiumCountdown = function () {
    updateCountdowns();
    if (window._dpCountdownInterval) clearInterval(window._dpCountdownInterval);
    window._dpCountdownInterval = setInterval(updateCountdowns, 60000);
  };

  const style = document.createElement('style');
  style.textContent = `
    .dp-badge { display:inline-flex; align-items:center; gap:5px; background:linear-gradient(135deg,#c8960c,#f2c94c); color:#2a1e00; font-size:11.5px; font-weight:800; padding:4px 10px; border-radius:999px; box-shadow:0 1px 3px rgba(0,0,0,.2); white-space:nowrap; }
    .dp-block { background:linear-gradient(135deg,#fffbeb,#fff7e0); border:1px solid #f2c94c; border-radius:12px; padding:14px 16px; margin:10px 0; }
    .dp-block-title { font-weight:800; color:#8a6400; font-size:15px; }
    .dp-block-sub { color:#5c4600; font-size:12.5px; margin-top:2px; }
    .dp-block-countdown { color:#2a1e00; font-weight:700; font-size:13.5px; margin-top:8px; }
    .dp-block-note { color:#6b5200; font-size:11.5px; margin-top:6px; }
  `;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  else document.head.appendChild(style);
})();
