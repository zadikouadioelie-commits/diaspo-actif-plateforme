/* ============================================================
   DIASPO'ACTIF — Système de Publications (Posts)
   Module global : création, affichage, interactions
   ============================================================ */

(function() {
'use strict';

/* ── Constantes ── */
const CATEGORIES = [
  'Actualité','Projet','Opportunité','Investissement','Recherche de partenaires',
  'Emploi','Formation','Événement','Succès','Témoignage','Appel à bénévoles',
  'Culture','Diaspora','Innovation','Autre'
];
const VISIBILITES = [
  { val:'public', label:'🌍 Public' },
  { val:'membres', label:'👥 Membres Diaspo\'Actif' },
  { val:'abonnes', label:'🔔 Mes abonnés' },
  { val:'prive', label:'🔒 Privé' }
];
const REACTIONS = [
  { type:'like',       emoji:'❤️',  label:'J\'aime' },
  { type:'applause',   emoji:'👏',  label:'Applaudir' },
  { type:'utile',      emoji:'💡',  label:'Utile' },
  { type:'soutien',    emoji:'🤝',  label:'Soutenir' },
  { type:'feliciter',  emoji:'🎉',  label:'Féliciter' },
  { type:'inspirant',  emoji:'🔥',  label:'Inspirant' },
];
const CONTRIBUTIONS = [
  'Je souhaite devenir partenaire',
  'Je souhaite investir',
  'Je peux apporter mon expertise',
  'Je souhaite rejoindre ce projet',
  'Je souhaite participer à cet événement',
  'Je souhaite être contacté',
  'Je souhaite soutenir cette initiative',
];

/* ── Utilitaires ── */
function apiRequest(method, url, data) {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include'
  }).then(r => r.json());
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return Math.floor(diff/60) + ' min';
  if (diff < 86400) return Math.floor(diff/3600) + 'h';
  if (diff < 2592000) return Math.floor(diff/86400) + 'j';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderHashtags(text) {
  if (!text) return '';
  return escHtml(text).replace(/#([\wÀ-ÿ]+)/g, '<a href="fil-actualite.html?hashtag=$1" class="post-hashtag">#$1</a>');
}

function renderMentions(text) {
  if (!text) return text;
  return text.replace(/@\[([^\]]+)\]\([ui]:\d+\)/g, '<strong>@$1</strong>');
}

function processContent(text) {
  if (!text) return '';
  let t = escHtml(text);
  t = t.replace(/#([\wÀ-ÿ]+)/g, '<a href="fil-actualite.html?hashtag=$1" class="post-hashtag">#$1</a>');
  t = t.replace(/@\[([^\]]+)\]\([ui]:\d+\)/g, '<strong class="post-mention">@$1</strong>');
  t = t.replace(/\n/g, '<br>');
  return t;
}

function getInitiales(nom) {
  if (!nom) return '?';
  const parts = nom.trim().split(' ');
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function getAvatarColor(nom) {
  const colors = ['#ff6b00','#0284c7','#16a34a','#7c3aed','#dc2626','#d97706','#0891b2','#be185d'];
  let hash = 0;
  for (const c of (nom||'')) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/* ── Avatar HTML ── */
function avatarHTML(post, size=40) {
  const profil = post.auteur_profil || {};
  const photo = profil.photo_url;
  if (photo && photo.length < 5000) {
    return `<img src="${escHtml(photo)}" alt="${escHtml(post.auteur_nom)}" class="post-avatar" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;">`;
  }
  const initiales = getInitiales(post.auteur_nom);
  const color = getAvatarColor(post.auteur_nom);
  return `<div class="post-avatar" style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${Math.floor(size*0.36)}px;flex-shrink:0;">${initiales}</div>`;
}

/* ── Rendu médias ── */
function renderMedias(post) {
  const medias = (() => { try { return JSON.parse(post.medias || '[]'); } catch(e) { return []; } })();
  const items = [];
  if (post.media_url) items.push({ type: post.media_type || 'image', url: post.media_url });
  items.push(...medias);
  if (!items.length) return '';

  const imgs = items.filter(m => m.type === 'image' || (!m.type && /\.(jpg|jpeg|png|gif|webp)/i.test(m.url||'')));
  const vids = items.filter(m => m.type === 'video' || /\.(mp4|webm|ogg)/i.test(m.url||''));
  const auds = items.filter(m => m.type === 'audio' || /\.(mp3|wav|ogg)/i.test(m.url||''));
  const docs = items.filter(m => m.type === 'document' || /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)/i.test(m.url||''));
  const links = items.filter(m => m.type === 'link');

  let html = '';

  if (imgs.length) {
    const cols = imgs.length === 1 ? 1 : imgs.length === 2 ? 2 : 3;
    html += `<div class="post-media-grid" style="grid-template-columns:repeat(${cols},1fr);">`;
    imgs.forEach(m => {
      html += `<div class="post-media-item"><img src="${escHtml(m.url)}" alt="Média" loading="lazy" onclick="window.open('${escHtml(m.url)}','_blank')" style="cursor:zoom-in;"></div>`;
    });
    html += `</div>`;
  }
  if (vids.length) {
    vids.forEach(m => {
      html += `<div class="post-media-video"><video controls preload="metadata" style="width:100%;border-radius:8px;max-height:300px;"><source src="${escHtml(m.url)}">Votre navigateur ne supporte pas la vidéo.</video></div>`;
    });
  }
  if (auds.length) {
    auds.forEach(m => {
      html += `<div class="post-media-audio" style="margin:8px 0;"><audio controls style="width:100%;"><source src="${escHtml(m.url)}"></audio></div>`;
    });
  }
  if (docs.length) {
    html += `<div class="post-media-docs">`;
    docs.forEach(m => {
      const ext = (m.url||'').split('.').pop().toUpperCase();
      const name = m.name || m.url.split('/').pop() || 'Document';
      const icons = { PDF:'📄', DOC:'📝', DOCX:'📝', XLS:'📊', XLSX:'📊', PPT:'📋', PPTX:'📋' };
      html += `<a href="${escHtml(m.url)}" target="_blank" class="post-doc-chip">${icons[ext]||'📎'} ${escHtml(name)}</a>`;
    });
    html += `</div>`;
  }
  if (links.length) {
    links.forEach(m => {
      html += `<a href="${escHtml(m.url)}" target="_blank" rel="noopener" class="post-link-preview">🔗 ${escHtml(m.label||m.url)}</a>`;
    });
  }
  return html;
}

/* ── Carte de post ── */
const VITRINE_CARD_BADGES = {
  vitrine:         { emoji: '🛍️', label: 'Vitrine' },
  catalogue:       { emoji: '📢', label: 'Nouveau catalogue' },
  promotion:       { emoji: '🎉', label: 'Promotion' },
  meilleure_vente: { emoji: '🔥', label: 'Meilleure vente' },
};

function renderVitrineCard(card) {
  const badge = VITRINE_CARD_BADGES[card.sous_type] || VITRINE_CARD_BADGES.vitrine;
  const loc = [card.ville, card.pays].filter(Boolean).join(', ');
  const prixHtml = card.sous_type === 'promotion'
    ? `<span style="text-decoration:line-through;color:#94a3b8;font-size:12.5px;">${card.prix_initial!=null?Number(card.prix_initial).toFixed(2)+' €':''}</span> <strong style="color:#dc2626;">${card.prix_promo!=null?Number(card.prix_promo).toFixed(2)+' €':''}</strong>`
    : card.sous_type === 'meilleure_vente'
      ? `<strong>${card.prix!=null?Number(card.prix).toFixed(2)+' '+(card.devise||'EUR'):''}</strong>${card.nb_ventes?` · ${card.nb_ventes} vente${card.nb_ventes>1?'s':''}`:''}`
      : '';
  return `
  <div class="post-card vitrine-card" data-initiative="${card.initiative_id}">
    <div class="post-header" style="display:flex;align-items:center;gap:8px;">
      <span class="post-badge" style="background:#FEF3C7;color:#92400E;">${badge.emoji} ${escHtml(badge.label)}</span>
      ${loc ? `<span class="post-badge post-badge-loc">📍 ${escHtml(loc)}</span>` : ''}
    </div>
    <div style="display:flex;gap:14px;padding:10px 0;">
      ${card.image_url ? `<img loading="lazy" src="${escHtml(card.image_url)}" style="width:96px;height:96px;object-fit:cover;border-radius:10px;flex:none;">` : `<div style="width:96px;height:96px;border-radius:10px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:28px;flex:none;">${badge.emoji}</div>`}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:14.5px;">${escHtml(card.titre||card.initiative_nom||'')}</div>
        <div style="font-size:12.5px;color:#6B7686;margin:2px 0 4px;">${escHtml(card.initiative_nom||'')}</div>
        ${card.description ? `<div style="font-size:12.5px;color:#374151;margin-bottom:4px;">${escHtml((card.description||'').slice(0,90))}${(card.description||'').length>90?'…':''}</div>` : ''}
        ${prixHtml ? `<div style="font-size:13px;margin-bottom:6px;">${prixHtml}</div>` : ''}
        <button class="btn btn-sm btn-outline" onclick="voirVitrineDepuisFil(${card.initiative_id}, '${card.sous_type}', ${card.owner_user_id})">Voir la vitrine →</button>
      </div>
    </div>
  </div>`;
}

function renderPostCard(post, options = {}) {
  if (post.type === 'carte_vitrine') return renderVitrineCard(post);
  const { currentUserId, showStats } = options;
  const isAuteur = currentUserId && post.auteur_id === currentUserId;
  const reactions = post.reactions || {};
  const totalReactions = Object.values(reactions).reduce((s, n) => s + n, 0);
  const nb_commentaires = post.nb_commentaires || 0;
  const nb_reposts = reactions.repost || 0;
  const hashtags = (() => { try { return JSON.parse(post.hashtags||'[]'); } catch(e){ return []; } })();

  const categorieBadge = post.categorie && post.categorie !== 'Publication'
    ? `<span class="post-badge">${escHtml(post.categorie)}</span>` : '';

  const locBadge = (post.localisation_pays || post.localisation_ville)
    ? `<span class="post-badge post-badge-loc">📍 ${escHtml([post.localisation_ville, post.localisation_pays].filter(Boolean).join(', '))}</span>` : '';

  const SOCIAL_SRC_LABELS = { linkedin:'LinkedIn', facebook:'Facebook', instagram:'Instagram', x:'X', youtube:'YouTube', tiktok:'TikTok', threads:'Threads' };
  const sourceImportBadge = post.source_import
    ? `<span class="post-badge" style="opacity:.7;" title="Synchronisée depuis un réseau social">🔄 Importée depuis ${escHtml(SOCIAL_SRC_LABELS[post.source_import]||post.source_import)}</span>` : '';

  const certifBadge = post.auteur_certif
    ? `<span class="post-certif" title="${escHtml(post.auteur_certif.label||'Vérifié')}">✓</span>` : '';

  const accreBadges = (post.auteur_accreditations||[]).map(t =>
    `<span class="post-accre-badge" title="${escHtml(t)}">${t==='deal'?'🎖':t==='officiel'?'🏛':'⭐'}</span>`
  ).join('');

  const profil = post.auteur_profil || {};
  const titrePro = profil.titre_pro ? `<span class="post-auteur-titre">${escHtml(profil.titre_pro)}</span>` : '';
  const villeInfo = profil.ville ? `· ${escHtml(profil.ville)}` : '';

  const contenuHTML = post.pub_type === 'article'
    ? `<h3 class="post-article-titre">${escHtml(post.article_titre||post.contenu)}</h3>${processContent(post.article_contenu||'')}`
    : processContent(post.contenu);

  const repostBanner = (post.pub_type === 'repost' || post.type === 'repost') && post.original_post
    ? `<div class="post-repost-banner">
        <span>🔁 Republié par ${escHtml(post.auteur_nom)}</span>
        <div class="post-repost-original">
          <strong>${escHtml(post.original_post.auteur_nom)}</strong>
          <p>${escHtml((post.original_post.contenu||'').slice(0,150))}${(post.original_post.contenu||'').length>150?'…':''}</p>
        </div>
       </div>` : '';

  const menuItems = isAuteur
    ? `<button class="post-menu-item" onclick="Posts.editPost(${post.id})">✏️ Modifier</button>
       <button class="post-menu-item" onclick="Posts.archivePost(${post.id})">📁 Archiver</button>
       <button class="post-menu-item post-menu-danger" onclick="Posts.deletePost(${post.id})">🗑️ Supprimer</button>
       ${showStats ? `<button class="post-menu-item" onclick="Posts.showStats(${post.id})">📊 Statistiques</button>` : ''}`
    : `<button class="post-menu-item" onclick="Posts.reportPost(${post.id})">🚩 Signaler</button>
       <button class="post-menu-item" onclick="Posts.copyLink(${post.id})">📎 Copier le lien</button>`;

  const mainReaction = totalReactions > 0
    ? `${REACTIONS.find(r => (reactions[r.type]||0) === Math.max(...Object.values(reactions)))?.emoji||'❤️'} ${totalReactions}`
    : '';

  return `
<article class="post-card" id="post-${post.id}" data-post-id="${post.id}">
  <div class="post-header">
    <a href="profil.html?id=${post.auteur_id||''}" class="post-auteur-link">
      ${avatarHTML(post)}
      <div class="post-auteur-info">
        <div class="post-auteur-name">
          ${escHtml(post.auteur_nom)}${certifBadge}${accreBadges}
        </div>
        ${titrePro}
        <div class="post-meta">${timeAgo(post.created_at)} ${villeInfo}</div>
      </div>
    </a>
    <div class="post-header-right">
      ${categorieBadge}${locBadge}${sourceImportBadge}
      <div class="post-menu-wrap">
        <button class="post-menu-btn" onclick="this.nextElementSibling.classList.toggle('open')" title="Plus d'options">⋯</button>
        <div class="post-menu-dropdown">
          ${menuItems}
        </div>
      </div>
    </div>
  </div>

  ${repostBanner}

  <div class="post-body">
    ${contenuHTML}
  </div>

  ${renderMedias(post)}

  ${hashtags.length ? `<div class="post-hashtags">${hashtags.map(h=>`<a href="fil-actualite.html?hashtag=${encodeURIComponent(h.replace('#',''))}" class="post-hashtag">${escHtml(h.startsWith('#')?h:'#'+h)}</a>`).join(' ')}</div>` : ''}

  <div class="post-stats-bar">
    ${mainReaction ? `<span class="post-stats-item">${mainReaction}</span>` : ''}
    ${nb_commentaires ? `<span class="post-stats-item">${nb_commentaires} commentaire${nb_commentaires>1?'s':''}</span>` : ''}
    ${nb_reposts ? `<span class="post-stats-item">${nb_reposts} republication${nb_reposts>1?'s':''}</span>` : ''}
  </div>

  <div class="post-actions">
    <div class="post-reactions-wrap">
      <button class="post-action-btn ${post.user_a_aime?'active':''}" onclick="Posts.toggleReactionMenu(${post.id}, this)" title="Réagir">
        ❤️ <span class="post-action-count">${totalReactions||''}</span>
      </button>
      <div class="post-reaction-menu" id="react-menu-${post.id}">
        ${REACTIONS.map(r=>`<button class="post-react-btn" onclick="Posts.react(${post.id},'${r.type}')" title="${r.label}">${r.emoji}</button>`).join('')}
      </div>
    </div>
    <button class="post-action-btn" onclick="Posts.toggleComments(${post.id})" title="Commenter">
      💬 <span class="post-action-count">${nb_commentaires||''}</span>
    </button>
    <button class="post-action-btn" onclick="Posts.repost(${post.id})" title="Republier">
      🔁 <span class="post-action-count">${nb_reposts||''}</span>
    </button>
    <button class="post-action-btn" onclick="Posts.bookmark(${post.id}, this)" title="Enregistrer" data-bookmarked="${post.user_bookmarked||false}">
      ${post.user_bookmarked ? '🔖' : '📌'}
    </button>
    <button class="post-action-btn post-contribute-btn" onclick="Posts.openContribute(${post.id})" title="Je souhaite contribuer">
      🤝 Contribuer
    </button>
    <button class="post-action-btn" onclick="Posts.share(${post.id})" title="Partager">
      📤
    </button>
  </div>

  <div class="post-comments-section" id="comments-${post.id}" style="display:none;">
    <div class="post-comments-list" id="comments-list-${post.id}"></div>
    <div class="post-comment-form">
      <textarea id="comment-input-${post.id}" class="post-comment-input" placeholder="Écrire un commentaire…" rows="2"></textarea>
      <div class="post-comment-actions">
        <button class="btn-primary btn-sm" onclick="Posts.submitComment(${post.id})">Publier</button>
      </div>
    </div>
  </div>
</article>`;
}

/* ── Modal de création ── */
function buildCreateModal() {
  if (document.getElementById('posts-create-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'posts-create-modal';
  modal.className = 'posts-modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
<div class="posts-modal-box" id="posts-modal-content">
  <div class="posts-modal-header">
    <h2 class="posts-modal-title">✍️ Créer une publication</h2>
    <button class="posts-modal-close" onclick="Posts.closeModal()">✕</button>
  </div>

  <div class="posts-modal-body">
    <!-- Zone de texte -->
    <div class="posts-field">
      <textarea id="post-contenu" class="posts-textarea" placeholder="Partagez une actualité, un projet, une opportunité… Utilisez #hashtag et @mention" rows="5" oninput="Posts.updateCounter()"></textarea>
      <div class="posts-counter"><span id="post-counter">0</span> caractères</div>
    </div>

    <!-- Médias -->
    <div class="posts-field">
      <div class="posts-media-toolbar">
        <button type="button" class="posts-media-btn" onclick="Posts.addMediaUrl('image')" title="Ajouter une photo">🖼️ Photo</button>
        <button type="button" class="posts-media-btn" onclick="Posts.addMediaUrl('video')" title="Ajouter une vidéo">🎥 Vidéo</button>
        <button type="button" class="posts-media-btn" onclick="Posts.addMediaUrl('document')" title="Ajouter un document">📄 Document</button>
        <button type="button" class="posts-media-btn" onclick="Posts.addMediaUrl('audio')" title="Ajouter un audio">🎵 Audio</button>
        <button type="button" class="posts-media-btn" onclick="Posts.addMediaUrl('link')" title="Ajouter un lien">🔗 Lien</button>
      </div>
      <div id="post-medias-list" class="posts-medias-list"></div>
    </div>

    <!-- Options (catégorie, visibilité, localisation) -->
    <div class="posts-options-grid">
      <div class="posts-field-sm">
        <label class="posts-label">📂 Catégorie</label>
        <select id="post-categorie" class="posts-select">
          <option value="">Choisir…</option>
          ${CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="posts-field-sm">
        <label class="posts-label">👁 Visibilité</label>
        <select id="post-visibilite" class="posts-select">
          ${VISIBILITES.map(v=>`<option value="${v.val}">${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="posts-field-sm">
        <label class="posts-label">📍 Pays (optionnel)</label>
        <input type="text" id="post-pays" class="posts-input" placeholder="France, Sénégal…">
      </div>
      <div class="posts-field-sm">
        <label class="posts-label">🏙 Ville (optionnel)</label>
        <input type="text" id="post-ville" class="posts-input" placeholder="Paris, Dakar…">
      </div>
    </div>

    <!-- Brouillon ID caché pour édition -->
    <input type="hidden" id="post-edit-id" value="">
  </div>

  <div class="posts-modal-footer">
    <button type="button" class="posts-btn-secondary" onclick="Posts.saveDraft()">💾 Brouillon</button>
    <button type="button" class="posts-btn-secondary" onclick="Posts.openSchedule()">🕐 Programmer</button>
    <button type="button" class="posts-btn-primary" onclick="Posts.submitPost()">📢 Publier</button>
  </div>

  <!-- Programmer -->
  <div id="posts-schedule-panel" style="display:none;padding:12px 24px;border-top:1px solid var(--border,#e5e7eb);">
    <label class="posts-label">📅 Date et heure de publication</label>
    <input type="datetime-local" id="post-programmed-at" class="posts-input" style="max-width:260px;">
    <button type="button" class="posts-btn-primary" style="margin-top:8px;" onclick="Posts.submitPost('programme')">Programmer</button>
  </div>
</div>`;

  modal.addEventListener('click', e => { if (e.target === modal) Posts.closeModal(); });
  document.body.appendChild(modal);

  // Liste des médias en mémoire
  window._postMedias = [];
}

/* ── Modal de contribution ── */
function buildContributeModal() {
  if (document.getElementById('posts-contribute-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'posts-contribute-modal';
  modal.className = 'posts-modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
<div class="posts-modal-box" style="max-width:480px;">
  <div class="posts-modal-header">
    <h2 class="posts-modal-title">🤝 Je souhaite contribuer</h2>
    <button class="posts-modal-close" onclick="Posts.closeContributeModal()">✕</button>
  </div>
  <div class="posts-modal-body">
    <p style="color:var(--text-secondary,#6b7280);margin-bottom:16px;">Choisissez comment vous souhaitez contribuer à cette publication :</p>
    <div id="contrib-options" class="contrib-options-list">
      ${CONTRIBUTIONS.map(c=>`
        <label class="contrib-option">
          <input type="radio" name="contrib-type" value="${c}">
          <span>${c}</span>
        </label>`).join('')}
      <label class="contrib-option">
        <input type="radio" name="contrib-type" value="Autre">
        <span>Autre</span>
      </label>
    </div>
    <textarea id="contrib-message" class="posts-textarea" rows="3" placeholder="Message complémentaire (optionnel)…" style="margin-top:12px;"></textarea>
    <input type="hidden" id="contrib-post-id" value="">
  </div>
  <div class="posts-modal-footer">
    <button class="posts-btn-secondary" onclick="Posts.closeContributeModal()">Annuler</button>
    <button class="posts-btn-primary" onclick="Posts.submitContribution()">Envoyer</button>
  </div>
</div>`;
  modal.addEventListener('click', e => { if (e.target === modal) Posts.closeContributeModal(); });
  document.body.appendChild(modal);
}

/* ── Styles CSS injectés ── */
function injectStyles() {
  if (document.getElementById('posts-styles')) return;
  const s = document.createElement('style');
  s.id = 'posts-styles';
  s.textContent = `
/* ── Post Card ── */
.post-card{background:#fff;border-radius:12px;border:1px solid #e5e7eb;margin-bottom:16px;overflow:hidden;transition:box-shadow .2s;}
.post-card:hover{box-shadow:0 2px 12px rgba(0,0,0,.08);}
.post-header{display:flex;align-items:flex-start;justify-content:space-between;padding:16px 16px 8px;}
.post-auteur-link{display:flex;gap:10px;text-decoration:none;color:inherit;flex:1;min-width:0;}
.post-auteur-info{display:flex;flex-direction:column;gap:2px;min-width:0;}
.post-auteur-name{font-weight:700;font-size:.95rem;color:#111;display:flex;align-items:center;gap:4px;flex-wrap:wrap;}
.post-auteur-titre{font-size:.8rem;color:#6b7280;}
.post-meta{font-size:.78rem;color:#9ca3af;}
.post-certif{background:#0284c7;color:#fff;border-radius:50%;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;font-size:.6rem;flex-shrink:0;}
.post-accre-badge{font-size:.85rem;}
.post-header-right{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.post-badge{background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:20px;padding:2px 10px;font-size:.75rem;font-weight:600;white-space:nowrap;}
.post-badge-loc{background:#f0fdf4;color:#15803d;border-color:#bbf7d0;}
/* Body */
.post-body{padding:4px 16px 12px;font-size:.95rem;line-height:1.6;color:#1f2937;white-space:pre-wrap;word-break:break-word;}
.post-article-titre{font-size:1.1rem;font-weight:700;color:#111;margin-bottom:8px;}
.post-hashtag{color:#ff6b00;text-decoration:none;font-weight:500;}
.post-hashtag:hover{text-decoration:underline;}
.post-mention{color:#0284c7;}
.post-hashtags{padding:4px 16px 8px;display:flex;flex-wrap:wrap;gap:6px;}
/* Médias */
.post-media-grid{display:grid;gap:4px;padding:0 16px 12px;}
.post-media-item img{width:100%;height:200px;object-fit:cover;border-radius:8px;display:block;}
.post-media-video{padding:0 16px 12px;}
.post-media-audio{padding:0 16px;}
.post-media-docs{display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px;}
.post-doc-chip{display:inline-flex;align-items:center;gap:4px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:6px 12px;font-size:.82rem;color:#374151;text-decoration:none;}
.post-doc-chip:hover{background:#e5e7eb;}
.post-link-preview{display:block;margin:0 16px 12px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#0284c7;text-decoration:none;font-size:.88rem;}
.post-link-preview:hover{background:#e0f2fe;}
/* Repost */
.post-repost-banner{margin:0 16px 12px;padding:10px;background:#f9fafb;border-left:3px solid #ff6b00;border-radius:0 8px 8px 0;}
.post-repost-banner>span{font-size:.8rem;color:#6b7280;display:block;margin-bottom:6px;}
.post-repost-original{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px;font-size:.88rem;}
.post-repost-original strong{display:block;margin-bottom:4px;}
.post-repost-original p{color:#4b5563;margin:0;}
/* Stats bar */
.post-stats-bar{display:flex;gap:16px;padding:4px 16px;font-size:.8rem;color:#6b7280;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;}
.post-stats-item{cursor:default;}
/* Actions */
.post-actions{display:flex;align-items:center;padding:4px 8px;gap:2px;flex-wrap:wrap;}
.post-action-btn{display:inline-flex;align-items:center;gap:4px;background:none;border:none;color:#6b7280;cursor:pointer;padding:6px 10px;border-radius:8px;font-size:.85rem;transition:background .15s,color .15s;}
.post-action-btn:hover,.post-action-btn.active{background:#fff7ed;color:#ff6b00;}
.post-action-count{font-size:.8rem;}
.post-contribute-btn{color:#0284c7;font-weight:600;}
.post-contribute-btn:hover{background:#e0f2fe!important;color:#0284c7!important;}
/* Reaction menu */
.post-reactions-wrap{position:relative;}
.post-reaction-menu{display:none;position:absolute;bottom:110%;left:0;background:#fff;border:1px solid #e5e7eb;border-radius:30px;padding:6px 10px;box-shadow:0 4px 20px rgba(0,0,0,.12);flex-direction:row;gap:4px;z-index:200;white-space:nowrap;}
.post-reaction-menu.open{display:flex;}
.post-react-btn{background:none;border:none;cursor:pointer;font-size:1.4rem;padding:2px 4px;border-radius:6px;transition:transform .15s;}
.post-react-btn:hover{transform:scale(1.3);}
/* Menu dropdown */
.post-menu-wrap{position:relative;}
.post-menu-btn{background:none;border:none;cursor:pointer;color:#9ca3af;font-size:1.2rem;padding:4px 8px;border-radius:6px;line-height:1;}
.post-menu-btn:hover{background:#f3f4f6;}
.post-menu-dropdown{display:none;position:absolute;right:0;top:110%;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.12);min-width:180px;z-index:200;overflow:hidden;}
.post-menu-dropdown.open{display:block;}
.post-menu-item{display:block;width:100%;text-align:left;background:none;border:none;padding:10px 16px;cursor:pointer;font-size:.88rem;color:#374151;}
.post-menu-item:hover{background:#f9fafb;}
.post-menu-danger{color:#dc2626!important;}
.post-menu-danger:hover{background:#fef2f2!important;}
/* Comments */
.post-comments-section{border-top:1px solid #f3f4f6;padding:12px 16px;}
.post-comments-list{display:flex;flex-direction:column;gap:10px;margin-bottom:12px;}
.post-comment{display:flex;gap:8px;align-items:flex-start;}
.post-comment-bubble{background:#f9fafb;border-radius:12px;padding:8px 12px;flex:1;}
.post-comment-author{font-weight:600;font-size:.83rem;color:#374151;margin-bottom:2px;}
.post-comment-text{font-size:.88rem;color:#1f2937;line-height:1.5;}
.post-comment-time{font-size:.75rem;color:#9ca3af;margin-top:4px;}
.post-comment-form{display:flex;flex-direction:column;gap:8px;}
.post-comment-input{width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:.88rem;resize:vertical;font-family:inherit;}
.post-comment-input:focus{outline:none;border-color:#ff6b00;}
.post-comment-actions{display:flex;justify-content:flex-end;}
/* Bouton créer post */
.posts-create-trigger{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 16px;cursor:pointer;width:100%;text-align:left;color:#9ca3af;font-size:.95rem;transition:border-color .2s,box-shadow .2s;margin-bottom:16px;}
.posts-create-trigger:hover{border-color:#ff6b00;box-shadow:0 0 0 3px rgba(255,107,0,.08);}
.posts-create-trigger .pct-avatar{width:40px;height:40px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;}
.posts-create-trigger-text{flex:1;}
.posts-create-trigger-actions{display:flex;gap:8px;flex-wrap:wrap;}
.pct-action-btn{display:inline-flex;align-items:center;gap:4px;background:none;border:none;color:#6b7280;cursor:pointer;padding:6px 10px;border-radius:8px;font-size:.82rem;}
.pct-action-btn:hover{background:#f3f4f6;color:#374151;}
/* Modal */
.posts-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;}
.posts-modal-box{background:#fff;border-radius:16px;width:100%;max-width:580px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);}
.posts-modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#fff;z-index:1;}
.posts-modal-title{font-size:1.1rem;font-weight:700;color:#111;margin:0;}
.posts-modal-close{background:none;border:none;cursor:pointer;font-size:1.2rem;color:#6b7280;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;}
.posts-modal-close:hover{background:#f3f4f6;}
.posts-modal-body{padding:16px 20px;}
.posts-modal-footer{padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:8px;sticky:bottom 0;}
.posts-field{margin-bottom:14px;}
.posts-field-sm{display:flex;flex-direction:column;gap:4px;}
.posts-label{font-size:.82rem;font-weight:600;color:#374151;margin-bottom:4px;display:block;}
.posts-textarea{width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;font-size:.95rem;resize:vertical;font-family:inherit;min-height:100px;box-sizing:border-box;}
.posts-textarea:focus{outline:none;border-color:#ff6b00;}
.posts-input{border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:.88rem;font-family:inherit;width:100%;box-sizing:border-box;}
.posts-input:focus{outline:none;border-color:#ff6b00;}
.posts-select{border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:.88rem;background:#fff;width:100%;box-sizing:border-box;}
.posts-select:focus{outline:none;border-color:#ff6b00;}
.posts-counter{text-align:right;font-size:.75rem;color:#9ca3af;margin-top:4px;}
.posts-options-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;}
.posts-media-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;}
.posts-media-btn{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:.82rem;display:inline-flex;align-items:center;gap:4px;}
.posts-media-btn:hover{border-color:#ff6b00;color:#ff6b00;}
.posts-medias-list{display:flex;flex-direction:column;gap:6px;}
.posts-media-item{display:flex;align-items:center;gap:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;font-size:.82rem;}
.posts-media-item input{flex:1;border:none;background:none;font-size:.82rem;outline:none;font-family:inherit;}
.posts-media-remove{background:none;border:none;cursor:pointer;color:#dc2626;font-size:1rem;padding:0 4px;}
.posts-btn-primary{background:#ff6b00;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:.9rem;font-weight:600;cursor:pointer;}
.posts-btn-primary:hover{background:#e05e00;}
.posts-btn-secondary{background:#f3f4f6;color:#374151;border:none;border-radius:8px;padding:8px 18px;font-size:.9rem;font-weight:600;cursor:pointer;}
.posts-btn-secondary:hover{background:#e5e7eb;}
/* Contribution */
.contrib-options-list{display:flex;flex-direction:column;gap:8px;}
.contrib-option{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:border-color .15s;}
.contrib-option:hover{border-color:#0284c7;}
.contrib-option input[type=radio]{accent-color:#0284c7;}
/* Feed filter */
.posts-feed-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;overflow-x:auto;padding-bottom:4px;}
.posts-feed-filter{background:#f3f4f6;border:none;border-radius:20px;padding:6px 14px;font-size:.82rem;cursor:pointer;white-space:nowrap;color:#374151;}
.posts-feed-filter.active{background:#ff6b00;color:#fff;}
/* Bouton flottant */
.posts-fab{position:fixed;bottom:80px;right:20px;width:52px;height:52px;background:#ff6b00;color:#fff;border:none;border-radius:50%;font-size:1.5rem;box-shadow:0 4px 16px rgba(255,107,0,.4);cursor:pointer;z-index:100;display:flex;align-items:center;justify-content:center;transition:transform .2s;}
.posts-fab:hover{transform:scale(1.1);}
@media(max-width:600px){
  .posts-options-grid{grid-template-columns:1fr;}
  .post-actions{gap:0;}
  .post-action-btn{padding:6px 7px;font-size:.8rem;}
  .post-contribute-btn{font-size:.75rem;}
}`;
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════
   API Publique : window.Posts
══════════════════════════════════════════════ */
const Posts = {
  _currentUserId: null,
  _editingId: null,

  init(userId) {
    this._currentUserId = userId;
    injectStyles();
    buildCreateModal();
    buildContributeModal();
    // Fermer menus sur clic extérieur
    document.addEventListener('click', e => {
      if (!e.target.closest('.post-menu-wrap')) document.querySelectorAll('.post-menu-dropdown.open').forEach(d => d.classList.remove('open'));
      if (!e.target.closest('.post-reactions-wrap')) document.querySelectorAll('.post-reaction-menu.open').forEach(d => d.classList.remove('open'));
    });
  },

  /* ── Bouton déclencheur ── */
  renderTrigger(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
      <div class="posts-create-trigger" onclick="Posts.openModal()">
        <div class="pct-avatar">✍️</div>
        <div class="posts-create-trigger-text">Quoi de neuf ? Partagez avec la communauté…</div>
      </div>
      <div class="posts-create-trigger-actions">
        <button class="pct-action-btn" onclick="event.stopPropagation();Posts.openModal('photo')">🖼️ Photo</button>
        <button class="pct-action-btn" onclick="event.stopPropagation();Posts.openModal('video')">🎥 Vidéo</button>
        <button class="pct-action-btn" onclick="event.stopPropagation();Posts.openModal('article')">📰 Article</button>
        <button class="pct-action-btn" onclick="event.stopPropagation();Posts.openModal()">📝 Texte</button>
      </div>`;
  },

  /* ── Ouvrir modal ── */
  openModal(type, draftPost) {
    if (!this._currentUserId) {
      if (typeof showToast === 'function') showToast('Connectez-vous pour publier.', 'error');
      else alert('Connectez-vous pour publier.');
      return;
    }
    buildCreateModal();
    const modal = document.getElementById('posts-create-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    window._postMedias = [];
    this._editingId = null;

    // Réinitialiser
    document.getElementById('post-contenu').value = '';
    document.getElementById('post-categorie').value = '';
    document.getElementById('post-visibilite').value = 'public';
    document.getElementById('post-pays').value = '';
    document.getElementById('post-ville').value = '';
    document.getElementById('post-edit-id').value = '';
    document.getElementById('posts-schedule-panel').style.display = 'none';
    document.getElementById('post-medias-list').innerHTML = '';
    this.updateCounter();

    if (draftPost) {
      document.getElementById('post-contenu').value = draftPost.contenu || '';
      document.getElementById('post-categorie').value = draftPost.categorie || '';
      document.getElementById('post-visibilite').value = draftPost.visibilite || 'public';
      document.getElementById('post-pays').value = draftPost.localisation_pays || '';
      document.getElementById('post-ville').value = draftPost.localisation_ville || '';
      document.getElementById('post-edit-id').value = draftPost.id || '';
      this._editingId = draftPost.id;
      try { window._postMedias = JSON.parse(draftPost.medias||'[]'); this.renderMediasList(); } catch(e){}
    }
  },

  closeModal() {
    const modal = document.getElementById('posts-create-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  },

  updateCounter() {
    const v = document.getElementById('post-contenu')?.value || '';
    const el = document.getElementById('post-counter');
    if (el) el.textContent = v.length;
  },

  /* ── Médias ── */
  addMediaUrl(type) {
    const labels = { image:'URL de la photo', video:'URL de la vidéo', document:'URL du document', audio:'URL du fichier audio', link:'URL du lien' };
    window._postMedias.push({ type, url: '', label: '', _id: Date.now() });
    this.renderMediasList();
  },

  renderMediasList() {
    const container = document.getElementById('post-medias-list');
    if (!container) return;
    container.innerHTML = (window._postMedias||[]).map((m, i) => {
      const icons = { image:'🖼️', video:'🎥', document:'📄', audio:'🎵', link:'🔗' };
      return `
        <div class="posts-media-item">
          <span>${icons[m.type]||'📎'}</span>
          <input type="text" value="${escHtml(m.url)}" placeholder="URL du ${m.type}…"
            oninput="window._postMedias[${i}].url=this.value" style="flex:1;">
          ${m.type==='link' ? `<input type="text" value="${escHtml(m.label||'')}" placeholder="Texte du lien…"
            oninput="window._postMedias[${i}].label=this.value" style="width:120px;">` : ''}
          <button class="posts-media-remove" onclick="Posts.removeMedia(${i})">✕</button>
        </div>`;
    }).join('');
  },

  removeMedia(idx) {
    window._postMedias.splice(idx, 1);
    this.renderMediasList();
  },

  /* ── Programme ── */
  openSchedule() {
    const panel = document.getElementById('posts-schedule-panel');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  },

  /* ── Brouillon ── */
  async saveDraft() {
    const contenu = document.getElementById('post-contenu')?.value?.trim() || '';
    const editId = document.getElementById('post-edit-id')?.value;
    const payload = {
      contenu, statut: 'brouillon',
      categorie: document.getElementById('post-categorie')?.value || '',
      visibilite: document.getElementById('post-visibilite')?.value || 'public',
      localisation_pays: document.getElementById('post-pays')?.value || '',
      localisation_ville: document.getElementById('post-ville')?.value || '',
      medias: JSON.stringify((window._postMedias||[]).filter(m => m.url))
    };
    try {
      let r;
      if (editId) r = await apiRequest('PUT', `/api/fil/${editId}`, payload);
      else r = await apiRequest('POST', '/api/fil', payload);
      this.closeModal();
      if (typeof showToast === 'function') showToast('Brouillon enregistré.', 'success');
    } catch(e) { if (typeof showToast === 'function') showToast('Erreur lors de l\'enregistrement.', 'error'); }
  },

  /* ── Publier ── */
  async submitPost(mode) {
    const contenu = document.getElementById('post-contenu')?.value?.trim() || '';
    const editId = document.getElementById('post-edit-id')?.value;
    const programmedAt = mode === 'programme' ? document.getElementById('post-programmed-at')?.value : null;

    if (!contenu && !(window._postMedias||[]).some(m=>m.url)) {
      if (typeof showToast === 'function') showToast('Veuillez écrire quelque chose.', 'error');
      else alert('Veuillez écrire quelque chose.');
      return;
    }

    const payload = {
      contenu,
      statut: programmedAt ? 'programme' : 'publie',
      categorie: document.getElementById('post-categorie')?.value || 'Publication',
      visibilite: document.getElementById('post-visibilite')?.value || 'public',
      localisation_pays: document.getElementById('post-pays')?.value || '',
      localisation_ville: document.getElementById('post-ville')?.value || '',
      medias: JSON.stringify((window._postMedias||[]).filter(m=>m.url)),
      programmed_at: programmedAt || null,
    };

    try {
      let r;
      if (editId) r = await apiRequest('PUT', `/api/fil/${editId}`, { ...payload, statut:'publie' });
      else r = await apiRequest('POST', '/api/fil', payload);

      if (r.error) { if (typeof showToast === 'function') showToast(r.error, 'error'); return; }

      this.closeModal();
      if (typeof showToast === 'function') showToast(programmedAt ? 'Publication programmée !' : 'Publication publiée !', 'success');

      // Recharger le fil si disponible
      if (typeof loadFeed === 'function') loadFeed();
      else if (window.PostsFeed) window.PostsFeed.refresh();

    } catch(e) {
      if (typeof showToast === 'function') showToast('Erreur lors de la publication.', 'error');
    }
  },

  /* ── Réactions ── */
  toggleReactionMenu(postId, btn) {
    const menu = document.getElementById(`react-menu-${postId}`);
    if (menu) menu.classList.toggle('open');
  },

  async react(postId, type) {
    try {
      const r = await apiRequest('POST', `/api/fil/${postId}/react`, { type });
      const menu = document.getElementById(`react-menu-${postId}`);
      if (menu) menu.classList.remove('open');
      // Mettre à jour le bouton réaction
      const card = document.getElementById(`post-${postId}`);
      if (card) {
        const total = Object.values(r.reactions||{}).reduce((s,n)=>s+n,0);
        const btn = card.querySelector('.post-reactions-wrap .post-action-btn');
        if (btn) { btn.querySelector('.post-action-count').textContent = total || ''; btn.classList.add('active'); }
        const statsBar = card.querySelector('.post-stats-bar');
        if (statsBar) {
          const topType = Object.entries(r.reactions||{}).sort((a,b)=>b[1]-a[1])[0]?.[0];
          const topEmoji = REACTIONS.find(re=>re.type===topType)?.emoji||'❤️';
          statsBar.innerHTML = total ? `<span class="post-stats-item">${topEmoji} ${total}</span>` : '';
        }
      }
    } catch(e) {}
  },

  /* ── Commentaires ── */
  async toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (!section) return;
    if (section.style.display === 'none') {
      section.style.display = 'block';
      await this.loadComments(postId);
    } else {
      section.style.display = 'none';
    }
  },

  async loadComments(postId) {
    const list = document.getElementById(`comments-list-${postId}`);
    if (!list) return;
    try {
      const r = await apiRequest('GET', `/api/fil/${postId}/commentaires`);
      const comms = r.commentaires || [];
      if (!comms.length) { list.innerHTML = '<p style="color:#9ca3af;font-size:.85rem;text-align:center;padding:8px 0;">Aucun commentaire. Soyez le premier !</p>'; return; }
      list.innerHTML = comms.map(c => {
        const initiales = getInitiales(c.auteur_nom);
        const color = getAvatarColor(c.auteur_nom);
        const avatarEl = c.photo_url
          ? `<img src="${escHtml(c.photo_url)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" alt="">`
          : `<div style="width:32px;height:32px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.75rem;flex-shrink:0;">${initiales}</div>`;
        return `
          <div class="post-comment">
            ${avatarEl}
            <div class="post-comment-bubble">
              <div class="post-comment-author">${escHtml(c.auteur_nom)}</div>
              <div class="post-comment-text">${escHtml(c.contenu)}</div>
              <div class="post-comment-time">${timeAgo(c.created_at)}</div>
            </div>
          </div>`;
      }).join('');
    } catch(e) { list.innerHTML = '<p style="color:#dc2626;">Erreur de chargement.</p>'; }
  },

  async submitComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const contenu = input?.value?.trim() || '';
    if (!contenu) return;
    try {
      await apiRequest('POST', `/api/fil/${postId}/commentaires`, { contenu });
      input.value = '';
      await this.loadComments(postId);
      // Mettre à jour le compteur
      const card = document.getElementById(`post-${postId}`);
      if (card) {
        const btn = card.querySelector('.post-action-btn[onclick*="toggleComments"]');
        if (btn) {
          const list = document.getElementById(`comments-list-${postId}`);
          const n = list ? list.querySelectorAll('.post-comment').length : 0;
          btn.querySelector('.post-action-count').textContent = n || '';
        }
      }
    } catch(e) { if (typeof showToast === 'function') showToast('Erreur.', 'error'); }
  },

  /* ── Repost ── */
  async repost(postId) {
    const commentaire = prompt('Ajouter un commentaire au repost (optionnel) :') ?? null;
    if (commentaire === null) return;
    try {
      await apiRequest('POST', `/api/fil/${postId}/republier`, { commentaire });
      if (typeof showToast === 'function') showToast('Publication republiée !', 'success');
      if (typeof loadFeed === 'function') loadFeed();
      else if (window.PostsFeed) window.PostsFeed.refresh();
    } catch(e) {}
  },

  /* ── Bookmark ── */
  async bookmark(postId, btn) {
    try {
      const r = await apiRequest('POST', `/api/fil/${postId}/bookmark`);
      if (btn) {
        btn.textContent = r.bookmarked ? '🔖' : '📌';
        btn.dataset.bookmarked = r.bookmarked;
        btn.title = r.bookmarked ? 'Enregistré' : 'Enregistrer';
      }
      if (typeof showToast === 'function') showToast(r.bookmarked ? 'Publication enregistrée.' : 'Enregistrement retiré.', 'success');
    } catch(e) {}
  },

  /* ── Contribuer ── */
  openContribute(postId) {
    if (!this._currentUserId) {
      if (typeof showToast === 'function') showToast('Connectez-vous pour contribuer.', 'error');
      return;
    }
    buildContributeModal();
    document.getElementById('contrib-post-id').value = postId;
    document.getElementById('contrib-message').value = '';
    document.querySelectorAll('input[name="contrib-type"]').forEach(r => r.checked = false);
    const modal = document.getElementById('posts-contribute-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  },

  closeContributeModal() {
    const modal = document.getElementById('posts-contribute-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  },

  async submitContribution() {
    const postId = document.getElementById('contrib-post-id')?.value;
    const type_contribution = document.querySelector('input[name="contrib-type"]:checked')?.value;
    const message = document.getElementById('contrib-message')?.value?.trim() || '';
    if (!type_contribution) { if (typeof showToast === 'function') showToast('Choisissez un type de contribution.', 'error'); return; }
    try {
      const r = await apiRequest('POST', `/api/fil/${postId}/contribuer`, { type_contribution, message });
      this.closeContributeModal();
      if (typeof showToast === 'function') showToast('Votre demande a été envoyée à l\'auteur !', 'success');
    } catch(e) { if (typeof showToast === 'function') showToast('Erreur.', 'error'); }
  },

  /* ── Partager ── */
  share(postId) {
    const url = `${location.origin}/fil-actualite.html?post=${postId}`;
    if (navigator.share) {
      navigator.share({ title: 'Diaspo\'Actif', url }).catch(()=>{});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        if (typeof showToast === 'function') showToast('Lien copié !', 'success');
      });
    }
  },

  copyLink(postId) {
    const url = `${location.origin}/fil-actualite.html?post=${postId}`;
    navigator.clipboard.writeText(url).then(() => {
      if (typeof showToast === 'function') showToast('Lien copié dans le presse-papier !', 'success');
    });
  },

  /* ── Modifier post ── */
  async editPost(postId) {
    try {
      const r = await apiRequest('GET', `/api/fil/${postId}`);
      if (r.post) this.openModal(null, r.post);
    } catch(e) {}
  },

  /* ── Supprimer post ── */
  async deletePost(postId) {
    if (!confirm('Supprimer définitivement cette publication ?')) return;
    try {
      await apiRequest('DELETE', `/api/fil/${postId}`);
      const card = document.getElementById(`post-${postId}`);
      if (card) { card.style.opacity='0'; setTimeout(()=>card.remove(), 300); }
      if (typeof showToast === 'function') showToast('Publication supprimée.', 'success');
    } catch(e) { if (typeof showToast === 'function') showToast('Erreur.', 'error'); }
  },

  /* ── Archiver ── */
  async archivePost(postId) {
    try {
      await apiRequest('POST', `/api/fil/${postId}/archiver`);
      const card = document.getElementById(`post-${postId}`);
      if (card) { card.style.opacity='0'; setTimeout(()=>card.remove(), 300); }
      if (typeof showToast === 'function') showToast('Publication archivée.', 'success');
    } catch(e) {}
  },

  /* ── Signaler ── */
  async reportPost(postId) {
    const motif = prompt('Motif du signalement :');
    if (!motif) return;
    try {
      await apiRequest('POST', `/api/fil/${postId}/signaler`, { motif });
      if (typeof showToast === 'function') showToast('Signalement envoyé aux modérateurs.', 'success');
    } catch(e) {}
  },

  /* ── Stats ── */
  async showStats(postId) {
    try {
      const r = await apiRequest('GET', `/api/fil/${postId}/stats`);
      const s = r.stats || {};
      alert(`📊 Statistiques\n\n👁 Vues : ${s.nb_vues||0}\n❤️ Réactions : ${s.nb_reactions||0}\n💬 Commentaires : ${s.nb_commentaires||0}\n🔁 Reposts : ${s.nb_reposts||0}\n📌 Enregistrements : ${s.nb_bookmarks||0}\n🤝 Demandes de contribution : ${s.nb_contributions||0}`);
    } catch(e) {}
  },

  /* ── Rendu d'un fil ── */
  renderFeed(posts, containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!posts.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:#9ca3af;">
        <div style="font-size:2.5rem;margin-bottom:12px;">📭</div>
        <p>Aucune publication pour l'instant.</p>
        <p style="font-size:.88rem;">Soyez le premier à partager quelque chose !</p>
      </div>`;
      return;
    }
    container.innerHTML = posts.map(p => renderPostCard(p, { currentUserId: this._currentUserId })).join('');
  },

  renderPostCard,
};

window.Posts = Posts;

/* Clic "Voir la vitrine" depuis une carte du fil : trace le clic (best-effort) puis redirige */
window.voirVitrineDepuisFil = function(initiativeId, sousType, ownerUserId) {
  apiRequest('POST', '/api/fil/vitrine-clic', { initiative_id: initiativeId, type_carte: sousType }).catch(() => {});
  window.location.href = `profil.html?id=${ownerUserId}#vitrine`;
};

})();
