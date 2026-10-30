/* ═══════════════════════════════════════════════════════════════════════════
   CARTOUCHE « MODULES PREMIUM » du menu latéral (2026-10-13, demande explicite : « une cartouche générale qui englobera tous les modules
   contenus dans l'espace Premium, contour jaune doré scintillant, avec la petite couronne » — comptes Utilisateur et Initiative).

   Le cadre est un élément DÉCORATIF (aria-hidden, sans clic) posé derrière les liens, calé sur le titre « MODULES PREMIUM » et le dernier
   module visible de ce groupe. Il ne déplace, n'enveloppe ni ne remplace aucun lien : assets/sidebar-reorder.js (qui lit les <a> directs de
   .sidebar), la recherche de modules, les verrous Premium et le tiroir mobile fonctionnent donc exactement comme avant.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  /* monter(sb) équipe UN menu (idempotent). Exposée en window.sidebarPremiumCadre : le « Menu des modules » ouvert sur place depuis n'importe quelle page
     (assets/app.js, ouvrirMenuIci — copie du menu du tableau de bord, fabriquée au clic) n'existe pas au chargement de ce script, et perdait donc sa
     cartouche dorée depuis le 2026-10-28 (le bouton ☰ n'envoyait plus au tableau de bord). */
  function monter(sb) {
  if (!sb || sb.dataset.cadrePremium) return;
  sb.dataset.cadrePremium = '1';

  if (!document.getElementById('sbp-css')) {
    const st = document.createElement('style');
    st.id = 'sbp-css';
    st.textContent = `
.sbp-cadre{position:absolute;z-index:-1;pointer-events:none;border-radius:20px;
  background:linear-gradient(180deg,rgba(255,214,102,.07),rgba(255,214,102,.02));
  box-shadow:0 0 18px rgba(227,169,43,.35),inset 0 0 22px rgba(247,222,138,.08);display:none}
.sbp-cadre.on{display:block;animation:sbp-halo 3.2s ease-in-out infinite}
.sbp-cadre::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:2.5px;
  background:linear-gradient(115deg,#8a5a00 0%,#F7DE8A 22%,#E3A92B 38%,#fff3bf 50%,#E3A92B 62%,#F7DE8A 78%,#8a5a00 100%);background-size:260% 100%;animation:sbp-brille 5.5s linear infinite;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
@keyframes sbp-brille{from{background-position:0% 0}to{background-position:260% 0}}
@keyframes sbp-halo{0%,100%{box-shadow:0 0 12px rgba(227,169,43,.28),inset 0 0 18px rgba(247,222,138,.06)}50%{box-shadow:0 0 28px rgba(247,222,138,.55),inset 0 0 26px rgba(247,222,138,.12)}}
.sbp-cadre i{position:absolute;width:5px;height:5px;border-radius:50%;background:#fff6c9;box-shadow:0 0 8px 2px rgba(255,236,150,.95);opacity:0;animation:sbp-etincelle 3.4s ease-in-out infinite}
@keyframes sbp-etincelle{0%,100%{opacity:0;transform:scale(.4)}45%,55%{opacity:1;transform:scale(1.15)}}
.sbp-couronne{position:absolute;left:14px;top:-17px;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;
  background:linear-gradient(135deg,#FDEBA8 0%,#E8B22E 52%,#B67E14 100%);border:2px solid #fff3bf;box-shadow:0 4px 14px rgba(0,0,0,.45),0 0 16px rgba(247,222,138,.7)}
@media (prefers-reduced-motion:reduce){.sbp-cadre,.sbp-cadre.on,.sbp-cadre::before,.sbp-cadre i{animation:none!important}.sbp-cadre i{opacity:.8}}
`;
    document.head.appendChild(st);
  }

  /* Le cadre : 4 étincelles réparties sur le contour + la couronne qui chevauche l'angle haut-gauche. */
  const cadre = document.createElement('div');
  cadre.className = 'sbp-cadre';
  cadre.setAttribute('aria-hidden', 'true');
  cadre.innerHTML = '<span class="sbp-couronne">👑</span>'
    + [['12%', '-3px', '0s'], ['72%', '-3px', '1.1s'], ['calc(100% - 3px)', '38%', '2.2s'], ['30%', 'calc(100% - 3px)', '1.7s'], ['-3px', '62%', '2.8s']]
      .map(([x, y, d]) => `<i style="left:${x};top:${y};animation-delay:${d}"></i>`).join('');
  sb.appendChild(cadre);

  /* Les liens du groupe : tout <a> direct situé entre le titre « MODULES PREMIUM » et le titre de groupe suivant. */
  function lienDuGroupe() {
    /* Le titre n'est pas forcément un enfant direct du menu (dans la copie ouverte sur place, les liens sont dans un conteneur) : on prend ses frères. */
    const t0 = Array.from(sb.querySelectorAll('.sb-group-lbl')).find(el => /MODULES PREMIUM/i.test(el.textContent));
    const fils = t0 ? Array.from(t0.parentElement.children) : [];
    const i = fils.indexOf(t0);
    if (i < 0) return { titre: null, liens: [] };
    const liens = [];
    for (let k = i + 1; k < fils.length; k++) {
      const el = fils[k];
      if (el.classList && el.classList.contains('sb-group-lbl')) break;
      if (el.tagName === 'A' && el.hasAttribute('href')) liens.push(el);
    }
    return { titre: fils[i], liens };
  }
  /* « Visible » = présent dans la mise en page (pas masqué par display:none) — la visibilité du tiroir fermé n'entre pas en compte : le cadre est calé même menu fermé. */
  const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';

  let attente = 0;
  const obs = new MutationObserver(planifier);
  const options = { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] };
  function planifier() { if (!attente) attente = setTimeout(() => { attente = 0; caler(); }, 30); }

  function caler() {
    obs.disconnect();                       // nos propres changements de style ne doivent pas relancer le calage
    try {
      const { titre, liens } = lienDuGroupe();
      const vus = liens.filter(visible);
      if (!titre || !visible(titre) || !vus.length) { cadre.classList.remove('on'); return; }
      if (getComputedStyle(sb).position === 'static') sb.style.position = 'relative';
      sb.style.isolation = 'isolate';
      const base = sb.getBoundingClientRect(), t = titre.getBoundingClientRect(), d = vus[vus.length - 1].getBoundingClientRect();
      const haut = t.top - base.top + sb.scrollTop - 6, bas = d.bottom - base.top + sb.scrollTop + 8;
      cadre.style.left = '4px';
      cadre.style.width = Math.max(40, sb.clientWidth - 8) + 'px';
      cadre.style.top = Math.round(haut) + 'px';
      cadre.style.height = Math.max(40, Math.round(bas - haut)) + 'px';
      cadre.classList.add('on');
    } finally {
      obs.observe(sb, options);
    }
  }

  /* Un menu ouvert sur place est retiré à sa fermeture : on débranche alors les écouteurs (un par ouverture sinon). */
  function surRedimension() { if (!sb.isConnected) { window.removeEventListener('resize', surRedimension); obs.disconnect(); return; } planifier(); }
  window.addEventListener('resize', surRedimension);
  if (window.ResizeObserver) new ResizeObserver(planifier).observe(sb);
  /* Le menu se complète après le chargement (statut Premium, recherche de module, ordre personnalisé) : on recale à plusieurs reprises. */
  [0, 400, 1200, 2800, 6000].forEach(ms => setTimeout(planifier, ms));
  obs.observe(sb, options);
  planifier();
  }
  window.sidebarPremiumCadre = monter;
  monter(document.querySelector('.sidebar'));
})();
