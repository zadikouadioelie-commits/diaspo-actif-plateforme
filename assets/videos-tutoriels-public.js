/* ── Vidéos Tuto (public) — bandeau accueil, grille dédiée, page vidéo individuelle,
   commentaires et réactions. Cahier des charges 2026-09-18 : tout le monde regarde,
   seuls les connectés commentent/réagissent. Nécessite fetchCurrentUser()/api() (assets/app.js)
   déjà chargés par la page hôte. ── */

let _dvtCache = {};
const VT_REACTIONS = [
  { type: 'jaime',  emoji: '👍', label: "J'aime" },
  { type: 'jadore', emoji: '❤️', label: "J'adore" },
  { type: 'bravo',  emoji: '👏', label: 'Bravo' },
  { type: 'utile',  emoji: '💡', label: 'Utile' },
];

function dvtYoutubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function dvtFormatDuree(sec) {
  sec = sec | 0;
  if (!sec) return '';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function dvtFormatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch (e) { return ''; }
}

function dvtEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

function dvtVignetteHtml(v) {
  const ytId = v.type_source === 'youtube' ? dvtYoutubeId(v.url) : null;
  if (v.miniature_url) return `<img src="${v.miniature_url}" alt="" loading="lazy">`;
  if (ytId) return `<img src="https://img.youtube.com/vi/${ytId}/mqdefault.jpg" alt="" loading="lazy">`;
  // "bientot" (aucune vidéo réelle) : visuel officiel "Bientôt disponible" fourni par Diaspo'Actif,
  // affiché en entier (jamais recadré) car c'est une affiche verticale, pas une vignette 16/9.
  if (v.type_source === 'bientot') return `<img src="/assets/videos-bientot-disponible.jpg" alt="Bientôt disponible" loading="lazy" style="object-fit:contain;background:#EEF2F8;">`;
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:32px;color:#fff;">${v.icone || '🎬'}</div>`;
}

/* Carte cliquable → mène toujours à la page vidéo individuelle (lecteur + commentaires +
   réactions), jamais à une simple modale — cohérent avec la fiche vidéo du cahier des charges.
   Une capsule "bientot" (aucune vidéo réelle pour l'instant) reste cliquable mais affiche un
   bandeau "Bientôt disponible" à la place du chrono/lecture — jamais de ▶ trompeur. */
function dvtCardHtml(v, { compact } = {}) {
  _dvtCache[v.id] = v;
  const bientot = v.type_source === 'bientot';
  const duree = dvtFormatDuree(v.duree_secondes);
  return `
    <a class="dvt-card" href="videos-tutoriels.html?v=${v.id}" style="text-decoration:none;color:inherit;display:block;">
      <div class="dvt-thumb">
        ${dvtVignetteHtml(v)}
        ${bientot ? `<span class="dvt-duree" style="background:#B84C1A;">Bientôt disponible</span>` : (duree ? `<span class="dvt-duree">${duree}</span>` : '')}
        ${bientot ? '' : `<div class="dvt-play"><span>▶</span></div>`}
      </div>
      <div class="dvt-body">
        ${v.categorie ? `<div class="dvt-badge-categorie">${dvtEsc(v.categorie)}</div>` : ''}
        <div class="dvt-card-titre">${dvtEsc(v.titre)}</div>
        ${!compact ? `<div class="dvt-card-desc">${dvtEsc(v.description || '')}</div>
        <div class="dvt-card-meta">${bientot ? 'Bientôt disponible' : `${v.vues || 0} vues · ${dvtFormatDate(v.created_at)}`}</div>
        <div class="dvt-card-stats">
          <span>${v.nb_commentaires || 0} commentaire${(v.nb_commentaires || 0) > 1 ? 's' : ''}</span>
          <span>${v.nb_reactions || 0} réaction${(v.nb_reactions || 0) > 1 ? 's' : ''}</span>
        </div>` : ''}
        <div class="dvt-card-plus">En savoir plus →</div>
      </div>
    </a>`;
}

/* Charge les vidéos actives dans #<gridId>. Si sectionIdSiVide est fourni, la section
   parente entière reste masquée tant qu'aucune vidéo n'est encore publiée — SAUF si
   posterSiVide est fourni (bandeau accueil, 2026-09-19, demande explicite : aucune vidéo
   prête pour l'instant, afficher l'affiche officielle "Bientôt disponible" à la place plutôt
   que de masquer toute la rubrique) : la section reste visible, l'en-tête/le bouton "voir
   plus" (masquerIdsSiVide) disparaissent, et l'affiche seule occupe la grille. */
async function dvtCharger(gridId, { limit, sectionIdSiVide, compact, categorie, q, tri, posterSiVide, masquerIdsSiVide, plusBoutonInline } = {}) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  try {
    const qs = new URLSearchParams();
    if (limit) qs.set('limit', limit);
    if (categorie) qs.set('categorie', categorie);
    if (q) qs.set('q', q);
    if (tri) qs.set('tri', tri);
    const { videos } = await fetch('/api/videos-tutoriels?' + qs.toString()).then(r => r.json());
    const section = sectionIdSiVide ? document.getElementById(sectionIdSiVide) : null;
    if (!videos || !videos.length) {
      if (posterSiVide) {
        (masquerIdsSiVide || []).forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        grid.style.cssText = 'display:flex;justify-content:center;';
        grid.innerHTML = `<img src="/assets/videos-bientot-disponible.jpg" alt="Bientôt disponible" style="max-width:280px;width:100%;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);">`;
        if (section) section.style.display = '';
      } else if (section) section.style.display = 'none';
      else grid.innerHTML = '<p style="color:var(--muted);font-size:13px;">Aucune vidéo pour le moment.</p>';
      return;
    }
    grid.innerHTML = videos.map(v => dvtCardHtml(v, { compact })).join('')
      + (plusBoutonInline ? `<a class="dvt-more-btn" href="${plusBoutonInline.href}">${plusBoutonInline.label}</a>` : '');
    if (section) section.style.display = '';
  } catch (e) { console.error('[videos-tutoriels]', e); }
}

/* ═══ Page vidéo individuelle (videos-tutoriels.html?v=ID) ═══ */

function dvtLecteurHtml(v) {
  if (v.type_source === 'bientot') {
    return `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:linear-gradient(135deg,#0D2B4E 0%,#123a63 100%);color:#fff;">
      <div style="font-size:16px;font-weight:700;">Bientôt disponible</div>
      <div style="font-size:12.5px;color:rgba(255,255,255,.75);max-width:280px;text-align:center;">Cette vidéo est en préparation — revenez bientôt !</div>
    </div>`;
  }
  const ytId = v.type_source === 'youtube' ? dvtYoutubeId(v.url) : null;
  return ytId
    ? `<iframe src="https://www.youtube.com/embed/${ytId}" style="width:100%;height:100%;border:0;" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
    : `<video src="${v.url}" controls style="width:100%;height:100%;background:#000;"></video>`;
}

async function dvtGuestUser() {
  try { const me = await fetchCurrentUser(); return me || null; } catch (e) { return null; }
}

function dvtRedirectLoginUrl(page) {
  return `login.html?redirect=${encodeURIComponent(page || location.pathname + location.search)}`;
}

function dvtInvitePrompt(texte) {
  const retour = encodeURIComponent(location.pathname + location.search);
  return `
    <div class="dvt-invite">
      <p>🔒 ${dvtEsc(texte)}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a href="login.html?redirect=${retour}" class="dvt-btn-primary">Me connecter</a>
        <a href="inscription.html" class="dvt-btn-outline">Créer mon compte</a>
      </div>
    </div>`;
}

async function dvtChargerReactions(videoId, user) {
  const box = document.getElementById('dvt-reactions');
  if (!box) return;
  try {
    const data = await fetch(`/api/videos-tutoriels/${videoId}/reactions`).then(r => r.json());
    const counts = {}; (data.counts || []).forEach(c => counts[c.type] = c.n);
    const mesReactions = data.mesReactions || [];
    box.innerHTML = VT_REACTIONS.map(r => `
      <button class="dvt-reaction-btn ${mesReactions.includes(r.type) ? 'actif' : ''}" onclick="dvtReagir(${videoId},'${r.type}')">
        ${r.emoji} <span>${r.label}</span> <strong>${counts[r.type] || 0}</strong>
      </button>`).join('');
  } catch (e) { box.innerHTML = ''; }
}

async function dvtReagir(videoId, type) {
  const user = await dvtGuestUser();
  if (!user) { alert("Connectez-vous à Diaspo'Actif pour réagir à cette vidéo."); window.location.href = dvtRedirectLoginUrl(); return; }
  try { await fetch(`/api/videos-tutoriels/${videoId}/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ type }) }); }
  catch (e) {}
  dvtChargerReactions(videoId, user);
}

function dvtCommentaireHtml(c, videoId, user, estModo) {
  const mien = user && Number(user.id) === Number(c.auteur_id);
  return `
    <div class="dvt-commentaire" id="dvt-comm-${c.id}">
      <div class="dvt-commentaire-tete">
        <strong>${dvtEsc(c.auteur_nom)}</strong>${c.est_admin ? ' <span class="dvt-badge-admin">ADMIN</span>' : ''}
        <span class="dvt-commentaire-date">${dvtFormatDate(c.created_at)}</span>
      </div>
      <p class="dvt-commentaire-texte">${dvtEsc(c.contenu)}</p>
      <div class="dvt-commentaire-actions">
        ${user ? `<button onclick="dvtAfficherReponse(${c.id})">Répondre</button>` : ''}
        ${mien ? `<button onclick="dvtSupprimerCommentaire(${c.id},${videoId})">Supprimer</button>` : ''}
        ${(user && !mien) ? `<button onclick="dvtSignalerCommentaire(${c.id})">Signaler</button>` : ''}
        ${(estModo && !mien) ? `<button onclick="dvtSupprimerCommentaire(${c.id},${videoId})">🛡 Supprimer (modération)</button>` : ''}
      </div>
      <div id="dvt-reponse-form-${c.id}" style="display:none;margin-top:8px;"></div>
      <div class="dvt-reponses">
        ${(c.reponses || []).map(r => dvtCommentaireHtml(r, videoId, user, estModo)).join('')}
      </div>
    </div>`;
}

async function dvtChargerCommentaires(videoId) {
  const box = document.getElementById('dvt-commentaires-liste');
  if (!box) return;
  const user = await dvtGuestUser();
  // Affichage seulement — l'action réelle de modération est de toute façon revérifiée
  // côté serveur (AdminJunior.hasAdminPermission) sur DELETE /videos-tutoriels/commentaires/:id.
  const estModo = !!user && (user.role === 'administrateur' || user.role === 'administrateur_junior');
  try {
    const { commentaires } = await fetch(`/api/videos-tutoriels/${videoId}/commentaires`).then(r => r.json());
    box.innerHTML = commentaires.length
      ? commentaires.map(c => dvtCommentaireHtml(c, videoId, user, estModo)).join('')
      : '<p style="color:var(--muted);font-size:13px;">Aucun commentaire pour le moment.</p>';
  } catch (e) { box.innerHTML = ''; }
}

function dvtAfficherReponse(commentaireId) {
  const box = document.getElementById(`dvt-reponse-form-${commentaireId}`);
  if (!box) return;
  box.style.display = '';
  box.innerHTML = `
    <textarea id="dvt-reponse-texte-${commentaireId}" class="dvt-textarea" placeholder="Votre réponse..."></textarea>
    <button class="dvt-btn-primary" style="margin-top:6px;" onclick="dvtEnvoyerCommentaire(${window.__dvtVideoId}, ${commentaireId})">Publier</button>`;
}

async function dvtEnvoyerCommentaire(videoId, parentId) {
  const champId = parentId ? `dvt-reponse-texte-${parentId}` : 'dvt-nouveau-commentaire';
  const champ = document.getElementById(champId);
  const contenu = champ?.value.trim();
  if (!contenu) return;
  try {
    await fetch(`/api/videos-tutoriels/${videoId}/commentaires`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ contenu, parent_id: parentId || null }),
    });
    if (champ) champ.value = '';
    dvtChargerCommentaires(videoId);
  } catch (e) { alert("Impossible d'envoyer le commentaire."); }
}

async function dvtSupprimerCommentaire(id, videoId) {
  if (!confirm('Supprimer ce commentaire ?')) return;
  try { await fetch(`/api/videos-tutoriels/commentaires/${id}`, { method: 'DELETE', credentials: 'include' }); dvtChargerCommentaires(videoId); }
  catch (e) { alert('Erreur.'); }
}

async function dvtSignalerCommentaire(id) {
  const motif = prompt('Motif du signalement (spam, contenu inapproprié, publicité non autorisée, harcèlement, autre) :');
  if (!motif) return;
  try {
    await fetch(`/api/videos-tutoriels/commentaires/${id}/signaler`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ motif }) });
    alert('Signalement envoyé, merci.');
  } catch (e) { alert('Erreur.'); }
}

async function dvtChargerPageVideo(videoId) {
  window.__dvtVideoId = videoId;
  const root = document.getElementById('dvt-page-video');
  if (!root) return;
  try {
    const { video: v } = await fetch(`/api/videos-tutoriels/${videoId}`).then(r => r.json());
    if (!v) { root.innerHTML = '<p style="color:var(--muted);">Vidéo introuvable.</p>'; return; }
    document.title = `${v.titre} — Diaspo'Actif`;
    root.innerHTML = `
      <div class="dvt-player">${dvtLecteurHtml(v)}</div>
      <h1 class="dvt-page-titre">${dvtEsc(v.titre)}</h1>
      <div class="dvt-page-meta">🏷 ${dvtEsc(v.categorie||'')} · 📅 ${dvtFormatDate(v.created_at)} · 👁 ${v.vues||0} vues</div>
      <p class="dvt-page-desc">${dvtEsc(v.description || '')}</p>
      <div id="dvt-reactions" class="dvt-reactions"></div>
      <div id="dvt-invite-zone"></div>
      <h3 style="margin-top:28px;">💬 Commentaires</h3>
      <div id="dvt-comment-form"></div>
      <div id="dvt-commentaires-liste" style="margin-top:16px;"><p style="color:var(--muted);font-size:13px;">Chargement…</p></div>
    `;
    fetch(`/api/videos-tutoriels/${videoId}/vue`, { method: 'POST' }).catch(() => {});
    dvtChargerReactions(videoId);
    dvtChargerCommentaires(videoId);
    const user = await dvtGuestUser();
    const formBox = document.getElementById('dvt-comment-form');
    const inviteBox = document.getElementById('dvt-invite-zone');
    if (user) {
      formBox.innerHTML = `
        <textarea id="dvt-nouveau-commentaire" class="dvt-textarea" placeholder="Écrire un commentaire..."></textarea>
        <button class="dvt-btn-primary" style="margin-top:6px;" onclick="dvtEnvoyerCommentaire(${videoId})">Publier</button>`;
    } else {
      formBox.innerHTML = `<p style="color:var(--muted);font-size:13px;">🔒 Connectez-vous pour participer à la discussion.</p>`;
      inviteBox.innerHTML = dvtInvitePrompt('Vous souhaitez commenter ou réagir ? Créez gratuitement votre compte Diaspo’Actif et participez à la communauté.');
    }
  } catch (e) { root.innerHTML = '<p style="color:var(--muted);">Erreur de chargement.</p>'; }
}
