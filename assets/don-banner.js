/* ── Bouton "Faire un don" partagé — Diaspo'Actif (2026-09-28, demande explicite) ──
   Injecté à la demande par chaque page une fois qu'elle connaît le owner_user_id de
   l'initiative/compte concerné (initiative.html, evenements.html, inscription-publique.html).
   N'affiche RIEN si ce owner_user_id n'a aucun don mis en avant ("vedette") — jamais de bouton
   mort. Même esprit self-contained qu'assets/cookies-banner.js, mais avec une API appelable
   plutôt qu'un déclenchement inconditionnel au chargement, puisque chaque page ne connaît le
   owner_user_id qu'après son propre fetch. */
window.DonBanner = (function () {
  const CACHE = new Map(); // owner_user_id -> Promise<don|null>, évite un fetch par appel si render() est invoqué plusieurs fois pour le même owner sur une même page.

  /* Priorité recurrent > toutes (2026-09-28, demande explicite) : le don récurrent d'un compte
     (un seul, créé via "Créer un don récurrent") est CE QUI DOIT s'afficher partout en premier —
     jamais un choix "vedette" libre parmi ses cagnottes. Sans don récurrent mais avec d'autres
     cagnottes publiques (campagnes, occasionnels — "les dons sont aussi comptabilisés comme des
     cagnottes"), le bouton reste affiché mais mène à la liste complète plutôt qu'à une cagnotte
     précise. Le format renvoyé par l'API est donc {don, mode} et plus seulement {don}. */
  function fetchVedette(ownerUserId) {
    if (!CACHE.has(ownerUserId)) {
      CACHE.set(ownerUserId, fetch(`/api/cagnottes/vedette?owner_user_id=${encodeURIComponent(ownerUserId)}`)
        .then(r => r.json())
        .then(d => (d.mode === 'recurrent' || d.mode === 'toutes') ? d : null)
        .catch(() => null));
    }
    return CACHE.get(ownerUserId);
  }

  function boutonHtml(data, ownerUserId) {
    if (data.mode === 'toutes') {
      return `<a href="cagnottes.html?owner=${encodeURIComponent(ownerUserId)}" class="don-banner-btn">💚 Faire un don</a>`;
    }
    const don = data.don;
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
    const data = await fetchVedette(ownerUserId);
    if (!data) return;
    injecterStyles();
    if (opts.mode === 'inline') {
      const el = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
      if (el) el.insertAdjacentHTML('beforeend', boutonHtml(data, ownerUserId));
    } else if (!document.getElementById('don-banner-floating')) {
      const wrap = document.createElement('div');
      wrap.innerHTML = boutonHtml(data, ownerUserId);
      wrap.firstElementChild.id = 'don-banner-floating';
      document.body.appendChild(wrap.firstElementChild);
    }
  }

  /* renderLot(mapping) — pour une PAGE DE LISTE (ex. l'annuaire), jamais render() en boucle par
     carte (2026-09-28, bug réel trouvé en testant l'annuaire : une recherche à 30-50 résultats
     déclenchait autant de requêtes GET /api/cagnottes/vedette en parallèle, provoquant des 429
     Too Many Requests). Une seule requête groupée (GET /api/cagnottes/vedette-lot) quel que soit
     le nombre de cartouches affichées.
     mapping : { ownerUserId: containerElementOuSelecteur, ... } — un container par carte, déjà
     posé dans son DOM (mode toujours 'inline' ici, jamais 'floating' qui n'a de sens que pour
     UNE seule carte). Ne fait rien pour les owner_user_id sans don vedette. */
  async function renderLot(mapping) {
    const ids = Object.keys(mapping).filter(Boolean);
    if (!ids.length) return;
    let dons = {};
    try {
      const r = await fetch(`/api/cagnottes/vedette-lot?owner_user_ids=${ids.join(',')}`);
      dons = (await r.json()).dons || {};
    } catch (e) { return; }
    if (!Object.keys(dons).length) return;
    injecterStyles();
    for (const id of ids) {
      const data = dons[id];
      if (!data) continue;
      const el = typeof mapping[id] === 'string' ? document.querySelector(mapping[id]) : mapping[id];
      if (el) el.insertAdjacentHTML('beforeend', boutonHtml(data, id));
    }
  }

  return { render, renderLot };
})();
