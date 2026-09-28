/* ── Bouton "Faire un don" partagé — Diaspo'Actif (2026-09-28, demande explicite) ──
   Injecté à la demande par chaque page une fois qu'elle connaît le owner_user_id de
   l'initiative/compte concerné (initiative.html, evenements.html, inscription-publique.html).
   N'affiche RIEN si ce owner_user_id n'a aucun don mis en avant ("vedette") — jamais de bouton
   mort. Même esprit self-contained qu'assets/cookies-banner.js, mais avec une API appelable
   plutôt qu'un déclenchement inconditionnel au chargement, puisque chaque page ne connaît le
   owner_user_id qu'après son propre fetch. */
window.DonBanner = (function () {
  const CACHE = new Map(); // owner_user_id -> Promise<don|null>, évite un fetch par appel si render() est invoqué plusieurs fois pour le même owner sur une même page.

  function fetchVedette(ownerUserId) {
    if (!CACHE.has(ownerUserId)) {
      CACHE.set(ownerUserId, fetch(`/api/cagnottes/vedette?owner_user_id=${encodeURIComponent(ownerUserId)}`)
        .then(r => r.json()).then(d => d.don || null).catch(() => null));
    }
    return CACHE.get(ownerUserId);
  }

  function boutonHtml(don) {
    const href = `cagnotte.html?slug=${encodeURIComponent(don.slug)}`;
    const label = `💚 Faire un don${don.titre ? ' — ' + String(don.titre).slice(0, 40) : ''}`;
    return `<a href="${href}" class="don-banner-btn">${label}</a>`;
  }

  let stylesInjectes = false;
  function injecterStyles() {
    if (stylesInjectes) return;
    stylesInjectes = true;
    const style = document.createElement('style');
    style.textContent = `
      .don-banner-btn { display:inline-flex; align-items:center; gap:6px; background:#F97316; color:#fff; font-size:13px; font-weight:700; padding:10px 18px; border-radius:999px; text-decoration:none; white-space:nowrap; box-shadow:0 2px 10px rgba(249,115,22,.35); }
      .don-banner-btn:hover { background:#EA580C; }
      #don-banner-floating { position:fixed; bottom:90px; right:20px; z-index:850; }
    `;
    document.head.appendChild(style);
  }

  /* render(ownerUserId, opts)
     opts.mode: 'floating' (bouton fixe bas-droite, indépendant du DOM de la page hôte, une
                seule instance par page) ou 'inline' (rendu DANS opts.container, un élément déjà
                présent dans la page hôte).
     opts.container: requis si mode==='inline' (élément DOM ou sélecteur CSS).
     Ne fait rien si aucun don vedette n'existe pour ce owner_user_id. */
  async function render(ownerUserId, opts = {}) {
    if (!ownerUserId) return;
    const don = await fetchVedette(ownerUserId);
    if (!don) return;
    injecterStyles();
    if (opts.mode === 'inline') {
      const el = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
      if (el) el.insertAdjacentHTML('beforeend', boutonHtml(don));
    } else if (!document.getElementById('don-banner-floating')) {
      const wrap = document.createElement('div');
      wrap.innerHTML = boutonHtml(don);
      wrap.firstElementChild.id = 'don-banner-floating';
      document.body.appendChild(wrap.firstElementChild);
    }
  }

  return { render };
})();
