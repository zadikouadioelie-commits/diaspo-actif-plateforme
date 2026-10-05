/* ═══════════════════════════════════════════════════════════════════════════
   Fil d'actualité en GRILLE (2026-10-05, demande explicite) — plusieurs publications visibles
   en même temps (vignettes), au lieu d'une seule grande carte à la fois ; un clic ouvre la vue
   dédiée (Posts.openDetail, assets/posts.js) où l'on passe de publication en publication par
   ↑ ↓, boutons ou balayage vertical, avec accès au profil public de l'auteur.

   Ordre : d'abord ce qui concerne le membre selon les filtres actifs (mode + catégorie) ; une
   fois ces pages épuisées, on poursuit avec TOUTES les autres publications (mode « tous », sans
   catégorie), présentées comme des propositions « pour ouvrir son horizon » — jamais deux fois
   la même publication.

   Publicité : emplacement « vue_publication_restreinte » (onglet Publicité des annonceurs) — une
   case toutes les 6 vignettes dans la grille, et une entrée toutes les 5 publications dans la
   vue dédiée. Aucune case vide : sans publicité active, rien n'est réservé.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SLOT_PUB = 'vue_publication_restreinte';
  const PAR_PAGE = 24;
  const PUB_TOUTES_LES_GRILLE = 6;   // une case pub toutes les N vignettes
  const PUB_TOUTES_LES_VUE = 5;      // une entrée pub toutes les N publications dans la vue dédiée

  const st = {
    containerId: null,
    mode: 'tous', cat: '', hashtag: '',
    phase: 'filtre',           // 'filtre' puis 'horizon'
    page: 1,
    done: false, loading: false,
    token: 0,                  // invalide les chargements en cours quand les filtres changent
    seen: new Set(),
    posts: [],                 // publications affichées (hors cartes boutique)
    compteVignettes: 0,
    compteVue: 0,
    horizonMontre: false,
    pubDispo: false,
    adIds: new Set(),
    currentUserId: null,
  };
  let observer = null;

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  /* Les entités (&#39;, &amp;…) du titre/texte sont décodées AVANT d'être ré-échappées par esc() :
     sinon « j&#39;accompagne » s'affichait tel quel sur la vignette (double échappement). */
  const decoderEntites = s => s
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const texteSeul = html => decoderEntites(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

  function tempsEcoule(d) {
    if (!d) return '';
    const t = new Date(String(d).includes('T') ? d : String(d).replace(' ', 'T') + 'Z').getTime();
    if (!t) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min';
    if (s < 86400) return Math.round(s / 3600) + ' h';
    if (s < 86400 * 30) return Math.round(s / 86400) + ' j';
    return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  const COULEURS = ['#ff6b00', '#0284c7', '#16a34a', '#7c3aed', '#dc2626', '#d97706', '#0891b2', '#be185d'];
  function couleurPour(nom) {
    let h = 0;
    for (const c of (nom || '')) h = c.charCodeAt(0) + ((h << 5) - h);
    return COULEURS[Math.abs(h) % COULEURS.length];
  }
  function initiales(nom) {
    const p = String(nom || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
  }

  /* Premier média exploitable d'une publication (image > vidéo), pour la vignette. */
  function mediaPrincipal(p) {
    let liste = [];
    try { liste = JSON.parse(p.medias || '[]'); } catch (_) { liste = []; }
    const items = [];
    if (p.media_url) items.push({ type: p.media_type || '', url: p.media_url });
    items.push(...liste);
    const estImg = m => m.type === 'image' || (!m.type && /\.(jpe?g|png|gif|webp|avif)/i.test(m.url || '')) || /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(m.url || '');
    const estVid = m => m.type === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(m.url || '');
    const imgs = items.filter(m => m.url && estImg(m));
    const vids = items.filter(m => m.url && estVid(m));
    if (imgs.length) return { kind: 'image', url: imgs[0].url, nb: imgs.length + vids.length };
    if (vids.length) return { kind: 'video', url: vids[0].url, nb: vids.length };
    return null;
  }

  function avatar(p) {
    const photo = (p.auteur_profil || {}).photo_url;
    if (photo && photo.length < 5000) return `<img class="fg-avatar" src="${esc(photo)}" alt="" loading="lazy">`;
    return `<span class="fg-avatar fg-avatar-init" style="background:${couleurPour(p.auteur_nom)}">${esc(initiales(p.auteur_nom))}</span>`;
  }

  function statsHtml(p) {
    const r = p.reactions || {};
    const nbR = Object.values(r).reduce((s, n) => s + (Number(n) || 0), 0);
    const nbC = p.nb_commentaires || 0;
    return `${nbR ? `<span>❤️ ${nbR}</span>` : ''}${nbC ? `<span>💬 ${nbC}</span>` : ''}`;
  }

  function vignettePost(p) {
    const promo = p.type === 'evenement_promo' && p.evenement_promo && p.evenement_promo.promo_active ? p.evenement_promo : null;
    if (p.type === 'evenement_promo' && !promo) return '';
    /* Compte-rendu d'événement (2026-10-05) : image de l'événement, titre du compte-rendu,
       aperçu du résumé quand il n'y a pas d'image. */
    const cr = p.type === 'compte_rendu' && p.compte_rendu ? p.compte_rendu : null;
    /* Annonce officielle (2026-10-05) : affiche de l'annonce, badge « Annonce officielle ». */
    const ann = p.type === 'annonce_officielle' && p.annonce ? p.annonce : null;
    const media = ann ? (ann.image_url ? { kind: 'image', url: ann.image_url, nb: 1 } : null) : promo ? (promo.image ? { kind: 'image', url: promo.image, nb: 1 } : null)
      : (cr ? (cr.image ? { kind: 'image', url: cr.image, nb: 1 } : null) : mediaPrincipal(p));
    const titre = ann ? ann.titre : promo ? promo.titre : (cr ? cr.titre : texteSeul(p.titre));
    const estRepost = (p.pub_type === 'repost' || p.type === 'repost') && p.original_post;
    const texte = cr ? texteSeul(cr.resume) : texteSeul(estRepost && !(p.corps || p.contenu)
      ? p.original_post.contenu
      : (p.pub_type === 'article' ? p.article_contenu : (p.corps != null ? p.corps : p.contenu)));
    let vignette;
    if (media && media.kind === 'image') {
      vignette = `<img class="fg-bg" src="${esc(media.url)}" alt="" aria-hidden="true" loading="lazy"><img class="fg-fg" src="${esc(media.url)}" alt="${esc(titre)}" loading="lazy">`;
    } else if (media) {
      vignette = `<video class="fg-fg" src="${esc(media.url)}#t=0.1" preload="metadata" muted playsinline></video><span class="fg-play" aria-hidden="true">▶</span>`;
    } else {
      const c = couleurPour(p.auteur_nom);
      vignette = `<div class="fg-texte" style="background:linear-gradient(135deg,${c},${c}bb)"><span>${esc((texte || titre).slice(0, 150))}${(texte || titre).length > 150 ? '…' : ''}</span></div>`;
    }
    const badges = [];
    if (ann) badges.push(`<span class="fg-badge fg-badge-promo">📌 Annonce officielle</span>`);
    else if (cr) badges.push(`<span class="fg-badge fg-badge-promo">📄 Compte-rendu</span>`);
    else if (promo) badges.push(`<span class="fg-badge fg-badge-promo">🔥 J-${Math.max(0, promo.jours_restants == null ? 0 : promo.jours_restants)}</span>`);
    else if (p.categorie && p.categorie !== 'Publication') badges.push(`<span class="fg-badge">${esc(p.categorie)}</span>`);
    if (estRepost) badges.push(`<span class="fg-badge">🔁 Republié</span>`);
    if (media && media.nb > 1) badges.push(`<span class="fg-badge fg-badge-nb">⧉ ${media.nb}</span>`);
    return `<article class="fg-tile" tabindex="0" role="button" data-post-id="${esc(p.id)}" aria-label="Ouvrir : ${esc(titre || p.auteur_nom)}">
      <div class="fg-thumb">${vignette}<div class="fg-badges">${badges.join('')}</div></div>
      <div class="fg-meta">
        ${titre ? `<div class="fg-titre">${esc(titre)}</div>` : ''}
        <div class="fg-auteur">${avatar(p)}<span class="fg-nom">${esc(p.auteur_nom)}</span><span class="fg-temps">${esc(tempsEcoule(p.created_at))}</span></div>
        <div class="fg-stats">${statsHtml(p)}</div>
      </div>
    </article>`;
  }

  function vignetteBoutique(c) {
    const loc = [c.ville, c.pays].filter(Boolean).join(', ');
    const img = c.image_url
      ? `<img class="fg-bg" src="${esc(c.image_url)}" alt="" aria-hidden="true" loading="lazy"><img class="fg-fg" src="${esc(c.image_url)}" alt="" loading="lazy">`
      : `<div class="fg-texte" style="background:linear-gradient(135deg,#F59E0B,#D97706)"><span>🛍️</span></div>`;
    return `<article class="fg-tile fg-tile-boutique" tabindex="0" role="link" data-boutique="${esc(c.initiative_id)}|${esc(c.sous_type)}|${esc(c.owner_user_id)}">
      <div class="fg-thumb">${img}<div class="fg-badges"><span class="fg-badge fg-badge-promo">🛍️ Boutique</span></div></div>
      <div class="fg-meta">
        <div class="fg-titre">${esc(c.titre || c.initiative_nom || '')}</div>
        <div class="fg-auteur"><span class="fg-nom">${esc(c.initiative_nom || '')}</span>${loc ? `<span class="fg-temps">📍 ${esc(loc)}</span>` : ''}</div>
      </div>
    </article>`;
  }

  function vignettePub() {
    return `<aside class="fg-tile fg-ad" data-ad-pending="1" aria-label="Publicité">
      <div class="fg-thumb fg-ad-attente"><span class="fg-ad-badge">📣 PUBLICITÉ</span></div>
      <div class="fg-meta"></div>
    </aside>`;
  }

  /* Remplit une case publicitaire au moment où elle approche de l'écran (une impression n'est
     comptée que pour une publicité réellement sur le point d'être vue). Sans publicité : la case
     disparaît, la grille se resserre. */
  function remplirPub(el) {
    el.removeAttribute('data-ad-pending');
    const exclure = [...st.adIds].join(',');
    fetch(`/api/ads/servir?emplacement=${SLOT_PUB}${exclure ? '&exclude=' + exclure : ''}`, { credentials: 'include' })
      .then(r => r.json())
      .then(({ ad }) => {
        if (!ad) { el.remove(); return; }
        st.adIds.add(ad.id);
        const media = ad.media_url
          ? (ad.media_type === 'video'
              ? `<video class="fg-fg" src="${esc(ad.media_url)}" muted autoplay loop playsinline></video>`
              : `<img class="fg-bg" src="${esc(ad.media_url)}" alt="" aria-hidden="true"><img class="fg-fg" src="${esc(ad.media_url)}" alt="${esc(ad.titre)}">`)
          : `<div class="fg-texte" style="background:linear-gradient(135deg,#B84C1A,#E07A3C)"><span>📣</span></div>`;
        const cta = ad.lien_url
          ? `<a class="fg-ad-cta" href="${esc(ad.lien_url)}" target="_blank" rel="noopener sponsored" onclick="fetch('/api/ads/${Number(ad.id)}/clic',{method:'POST'}).catch(function(){})">${esc(ad.cta || 'En savoir plus')}</a>`
          : '';
        el.innerHTML = `<div class="fg-thumb"><span class="fg-ad-badge">📣 PUBLICITÉ</span>${media}</div>
          <div class="fg-meta"><div class="fg-titre">${esc(ad.titre)}</div>${ad.description ? `<div class="fg-ad-desc">${esc(ad.description)}</div>` : ''}${cta}</div>`;
        el.classList.add('fg-ad-pret');
      })
      .catch(() => el.remove());
  }

  let obsPub = null;
  function surveillerPubs(racine) {
    const cases = racine.querySelectorAll('.fg-ad[data-ad-pending]');
    if (!cases.length) return;
    if (!('IntersectionObserver' in window)) { cases.forEach(remplirPub); return; }
    if (!obsPub) {
      obsPub = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          obsPub.unobserve(e.target);
          if (e.target.hasAttribute('data-ad-pending')) remplirPub(e.target);
        });
      }, { rootMargin: '300px' });
    }
    cases.forEach(c => obsPub.observe(c));
  }

  /* ── Ajout d'un lot de publications à la grille et à la séquence de la vue dédiée ── */
  function ajouter(posts, avecSeparateur, messageSeparateur) {
    const grille = document.getElementById('fg-grille');
    if (!grille) return;
    let html = '';
    if (avecSeparateur && !st.horizonMontre) {
      st.horizonMontre = true;
      html += `<div class="fg-separateur"><strong>✨ Pour ouvrir votre horizon</strong><span>${esc(messageSeparateur)}</span></div>`;
    }
    const entreesVue = [];
    posts.forEach(p => {
      const cle = p.type === 'carte_vitrine' ? 'b:' + p.initiative_id + ':' + p.sous_type : 'p:' + p.id;
      if (st.seen.has(cle)) return;
      const v = p.type === 'carte_vitrine' ? vignetteBoutique(p) : vignettePost(p);
      if (!v) return;
      st.seen.add(cle);
      html += v;
      st.compteVignettes++;
      if (st.pubDispo && st.compteVignettes % PUB_TOUTES_LES_GRILLE === 0) html += vignettePub();
      if (p.type !== 'carte_vitrine') {
        st.posts.push(p);
        entreesVue.push({ kind: 'post', id: p.id });
        st.compteVue++;
        if (st.pubDispo && st.compteVue % PUB_TOUTES_LES_VUE === 0) entreesVue.push({ kind: 'ad' });
      }
    });
    if (!html) return;
    grille.insertAdjacentHTML('beforeend', html);
    surveillerPubs(grille);
    return entreesVue;
  }

  function messageHorizon(vide) {
    return vide
      ? "Rien de nouveau pour ce filtre pour l'instant — voici d'autres publications de la communauté."
      : 'Vous avez tout vu pour ce filtre. Voici d\'autres publications de la communauté, pour élargir vos horizons.';
  }

  async function chargerPage(jeton) {
    const params = new URLSearchParams({ page: st.page, limit: PAR_PAGE });
    if (st.phase === 'filtre') {
      params.set('mode', st.mode);
      if (st.cat) params.set('categorie', st.cat);
    } else {
      params.set('mode', 'tous');
    }
    if (st.hashtag) params.set('hashtag', st.hashtag);
    const r = await fetch(`/api/fil?${params}`, { credentials: 'include' }).then(x => x.json());
    if (jeton !== st.token) return null;
    return r;
  }

  /* Charge la page suivante (ou la première des « autres publications » quand le filtre est
     épuisé). Renvoie les entrées à ajouter à la séquence de la vue dédiée. */
  async function chargerSuite() {
    if (st.loading || st.done) return [];
    st.loading = true;
    const jeton = st.token;
    majPied();
    let entrees = [];
    try {
      for (let essais = 0; essais < 6; essais++) {
        const r = await chargerPage(jeton);
        if (!r) return []; // filtres changés entre-temps
        const posts = r.posts || [];
        const fin = !posts.length || st.page >= (r.pages || 1);
        const nouveaux = posts.filter(p => !st.seen.has(p.type === 'carte_vitrine' ? 'b:' + p.initiative_id + ':' + p.sous_type : 'p:' + p.id));
        st.page++;
        if (nouveaux.length) {
          const e = ajouter(nouveaux, st.phase === 'horizon', messageHorizon(st.compteVignettes === 0));
          if (e) entrees.push(...e);
        }
        if (fin) {
          const peutElargir = st.phase === 'filtre' && !st.hashtag && (st.mode !== 'tous' || st.cat);
          if (peutElargir) { st.phase = 'horizon'; st.page = 1; }
          else st.done = true;
        }
        if (nouveaux.length || st.done) break;
      }
    } catch (e) {
      st.done = true;
      if (!st.compteVignettes) montrerErreur();
    } finally {
      if (jeton === st.token) st.loading = false;
    }
    if (jeton !== st.token) return [];
    if (!st.compteVignettes && st.done) montrerVide();
    majPied();
    return entrees;
  }

  function montrerVide() {
    const g = document.getElementById('fg-grille');
    if (!g || g.children.length) return;
    g.innerHTML = `<div class="fg-vide">
      <div style="font-size:2.5rem;margin-bottom:10px;">📭</div>
      <p style="font-weight:700;margin:0 0 4px;">Aucune publication</p>
      <p style="margin:0;font-size:.88rem;">${st.mode === 'suivis' ? 'Suivez des personnes et des initiatives pour voir leurs publications.' : 'Soyez le premier à partager quelque chose !'}</p>
    </div>`;
  }
  function montrerErreur() {
    const g = document.getElementById('fg-grille');
    if (g) g.innerHTML = `<div class="fg-vide" style="color:#dc2626;">Erreur de chargement. <button class="btn-secondary" onclick="FilGrille.recharger()">Réessayer</button></div>`;
  }

  function majPied() {
    const pied = document.getElementById('fg-pied');
    if (!pied) return;
    if (st.loading) pied.innerHTML = '<span class="fg-chargement">⏳ Chargement…</span>';
    else if (st.done && st.compteVignettes) pied.innerHTML = '<span class="fg-fin">Vous êtes à jour — plus aucune publication pour le moment.</span>';
    else if (!st.done && st.compteVignettes) pied.innerHTML = '<button type="button" class="fg-plus" onclick="FilGrille.chargerPlus()">Voir plus de publications</button>';
    else pied.innerHTML = '';
  }

  /* Rappel de la vue dédiée : on approche de la fin de la séquence → charger la suite. */
  async function suiteVue() {
    const entrees = await chargerSuite();
    if (window.Posts) window.Posts.appendDetailItems(entrees, !st.done);
  }

  function ouvrirTuile(el) {
    if (el.dataset.boutique) {
      const [iid, sous, owner] = el.dataset.boutique.split('|');
      if (window.voirVitrineDepuisFil) window.voirVitrineDepuisFil(Number(iid), sous, Number(owner));
      return;
    }
    const id = el.dataset.postId;
    if (id && window.Posts) window.Posts.openDetail(isNaN(Number(id)) ? id : Number(id));
  }

  function brancherGrille(grille) {
    grille.addEventListener('click', e => {
      if (e.target.closest('.fg-ad')) return;
      const t = e.target.closest('.fg-tile');
      if (t) ouvrirTuile(t);
    });
    grille.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target.closest && e.target.closest('.fg-tile:not(.fg-ad)');
      if (!t || e.target !== t) return;
      e.preventDefault();
      ouvrirTuile(t);
    });
  }

  function armerDefilement() {
    const sentinelle = document.getElementById('fg-sentinelle');
    if (!sentinelle) return;
    if (observer) observer.disconnect();
    if (!('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(async entries => {
      if (!entries.some(e => e.isIntersecting) || st.loading || st.done) return;
      const entrees = await chargerSuite();
      if (window.Posts && entrees.length) window.Posts.appendDetailItems(entrees, !st.done);
      // La sentinelle peut rester visible après l'ajout : on la ré-observe pour relancer la mesure.
      if (!st.done) { observer.unobserve(sentinelle); observer.observe(sentinelle); }
    }, { rootMargin: '700px' });
    observer.observe(sentinelle);
  }

  async function charger(mode, cat, hashtag) {
    const c = document.getElementById(st.containerId);
    if (!c) return;
    st.token++;
    Object.assign(st, {
      mode: mode || 'tous', cat: cat || '', hashtag: hashtag || '',
      phase: 'filtre', page: 1, done: false, loading: false,
      seen: new Set(), posts: [], compteVignettes: 0, compteVue: 0, horizonMontre: false, adIds: new Set(),
    });
    c.innerHTML = `<div id="fg-grille" class="fg-grille" aria-live="polite"></div><div id="fg-sentinelle" style="height:1px"></div><div id="fg-pied" class="fg-pied"></div>`;
    brancherGrille(document.getElementById('fg-grille'));
    const jeton = st.token;
    // Existe-t-il au moins une publicité à servir ? (sans compter d'impression) — sinon aucune case.
    try {
      const r = await fetch(`/api/ads/servir?emplacement=${SLOT_PUB}&peek=1`, { credentials: 'include' }).then(x => x.json());
      st.pubDispo = !!(r && r.ad);
    } catch (_) { st.pubDispo = false; }
    if (jeton !== st.token) return;
    const entrees = await chargerSuite();
    if (jeton !== st.token) return;
    if (window.Posts) window.Posts.setDetailSequence(entrees.slice(), suiteVue, !st.done);
    armerDefilement();
  }

  window.FilGrille = {
    init(opts) { st.containerId = opts.containerId; st.currentUserId = opts.currentUserId || null; },
    charger,
    recharger() { charger(st.mode, st.cat, st.hashtag); },
    // Repli du défilement infini (bouton « Voir plus »), et vue dédiée tenue au courant.
    async chargerPlus() {
      const e = await chargerSuite();
      if (window.Posts && e.length) window.Posts.appendDetailItems(e, !st.done);
    },
    // Libère la séquence quand on repasse en vue liste.
    arreter() {
      st.token++;
      if (observer) observer.disconnect();
      if (window.Posts) window.Posts.setDetailSequence(null);
    },
  };
})();
