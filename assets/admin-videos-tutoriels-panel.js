/* ═══ VIDÉOS TUTORIELS — panneau d'administration (partagé entre dashboard-administrateur.html
   et dashboard-administrateur-junior.html, même principe que assets/admin-moderation-panels.js).
   Nécessite dans la page hôte : la fonction api(), la fonction uploadMedia() (assets/upload-media.js),
   et les éléments HTML #vt-liste, #vt-stats, #vt-tab-*, #vt-modal-overlay + ses champs. ═══ */

let _vtCache = [];
let _vtCategories = ["Bien démarrer", "Compte Diaspo'Actif", "Recensement", "Réseau Pro", "Carnet professionnel", "Initiatives", "Événements", "Services", "Tutoriels plateforme", "Autres"];
let _vtOnglet = 'videos';

function vtYoutubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function vtEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

function vtFormatDuree(sec) {
  sec = sec | 0;
  if (!sec) return '—';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function vtParseDuree(txt) {
  const m = String(txt || '').trim().match(/^(\d+):(\d{1,2})$/);
  return m ? (parseInt(m[1], 10) * 60) + parseInt(m[2], 10) : 0;
}

const VT_STATUT_LABEL = { brouillon: '📝 Brouillon', publie: '✅ Publiée', depublie: '🚫 Dépubliée' };
const VT_STATUT_COLOR = { brouillon: '#6b7280', publie: '#16a34a', depublie: '#dc2626' };

/* ── Onglets ── */
function vtOuvrirOnglet(nom) {
  _vtOnglet = nom;
  ['videos', 'commentaires', 'signalements'].forEach(n => {
    const btn = document.getElementById(`vt-tab-${n}`);
    const panel = document.getElementById(`vt-panel-${n}`);
    if (btn) btn.className = n === nom ? 'btn btn-orange' : 'btn btn-outline';
    if (panel) panel.style.display = n === nom ? '' : 'none';
  });
  if (nom === 'videos') vtCharger();
  if (nom === 'commentaires') vtChargerCommentaires();
  if (nom === 'signalements') vtChargerSignalements();
}

/* ── Onglet Vidéos ── */
async function vtChargerStats() {
  const el = document.getElementById('vt-stats');
  if (!el) return;
  try {
    const s = await api('GET', '/admin/videos-tutoriels/stats');
    el.innerHTML = [
      ['Total', s.total], ['Publiées', s.publiees], ['Brouillons', s.brouillons], ['Dépubliées', s.depubliees],
      ['Vues totales', s.totalVues], ['Commentaires', s.totalCommentaires], ['Réactions', s.totalReactions],
    ].map(([lbl, val]) => `
      <div class="card" style="text-align:center;padding:12px;">
        <div style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;">${lbl}</div>
        <div style="font-size:22px;font-weight:800;">${val}</div>
      </div>`).join('');
  } catch (e) { el.innerHTML = ''; }
}

async function vtCharger() {
  vtChargerStats();
  const box = document.getElementById('vt-liste');
  /* videos-tutoriels.html (2026-09-25, demande explicite) n'embarque que la modale, pas la
     liste de gestion #vt-liste (hors périmètre : gestion complète réservée au tableau de bord
     admin) — après un enregistrement, rafraîchit plutôt la grille publique de CETTE page si sa
     propre fonction de filtrage existe, pour que la vidéo ajoutée/modifiée apparaisse tout de
     suite sans recharger la page. */
  if (!box) { window.vtAppliquerFiltres?.(); return; }
  try {
    const { videos, categories } = await api('GET', '/admin/videos-tutoriels');
    _vtCache = videos;
    if (categories?.length) _vtCategories = categories;
    if (!videos.length) { box.innerHTML = '<p style="color:var(--muted);font-size:13px;">Aucune vidéo pour le moment.</p>'; return; }
    box.innerHTML = videos.map((v, i) => {
      const ytId = v.type_source === 'youtube' ? vtYoutubeId(v.url) : null;
      const vignette = v.miniature_url
        ? `<img src="${v.miniature_url}" alt="" style="width:100px;height:56px;object-fit:cover;border-radius:6px;flex-shrink:0;">`
        : ytId
        ? `<img src="https://img.youtube.com/vi/${ytId}/mqdefault.jpg" alt="" style="width:100px;height:56px;object-fit:cover;border-radius:6px;flex-shrink:0;">`
        : `<div style="width:100px;height:56px;border-radius:6px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">${v.icone || '🎬'}</div>`;
      return `
      <div class="card" style="display:flex;align-items:center;gap:14px;margin-bottom:10px;flex-wrap:wrap;">
        ${vignette}
        <div style="flex:1;min-width:180px;">
          <div style="font-weight:700;font-size:14px;">${v.icone || '🎬'} ${vtEsc(v.titre)} <span style="color:${VT_STATUT_COLOR[v.statut]||'#6b7280'};font-size:11px;font-weight:700;">${VT_STATUT_LABEL[v.statut]||v.statut}</span></div>
          <div style="color:var(--muted);font-size:12.5px;margin-top:2px;">${vtEsc(v.description || '')}</div>
          <div style="color:var(--muted);font-size:11.5px;margin-top:4px;">🏷 ${vtEsc(v.categorie||'—')} · ${vtSourceLabel(v)} · ${vtFormatDuree(v.duree_secondes)} · ${v.vues || 0} vues · 💬 ${v.nb_commentaires||0} · 👍 ${v.nb_reactions||0}</div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-outline" ${i === 0 ? 'disabled' : ''} onclick="vtDeplacer(${v.id},'haut')" title="Monter">↑</button>
          <button class="btn btn-sm btn-outline" ${i === videos.length - 1 ? 'disabled' : ''} onclick="vtDeplacer(${v.id},'bas')" title="Descendre">↓</button>
          ${v.statut !== 'publie' ? `<button class="btn btn-sm btn-outline" style="color:#16a34a;border-color:#16a34a;" onclick="vtPublier(${v.id})">✅ Publier</button>` : `<button class="btn btn-sm btn-outline" onclick="vtDepublier(${v.id})">🚫 Dépublier</button>`}
          <button class="btn btn-sm btn-outline" onclick="vtOuvrirForm(${v.id})">✎ Modifier</button>
          <button class="btn btn-sm btn-outline" style="color:#dc2626;border-color:#dc2626;" onclick="vtSupprimer(${v.id})">🗑 Supprimer</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) { box.innerHTML = `<p style="color:#dc2626;font-size:13px;">Erreur : ${e.message}</p>`; }
}

function vtChangerType() {
  const type = document.querySelector('input[name="vt-type"]:checked').value;
  document.getElementById('vt-champ-youtube').style.display = type === 'youtube' ? '' : 'none';
  document.getElementById('vt-champ-mp4').style.display = type === 'mp4' ? '' : 'none';
}

function vtSourceLabel(v) {
  return v.type_source === 'youtube' ? '📺 YouTube' : v.type_source === 'mp4' ? '🎞️ MP4' : '🕒 Bientôt disponible';
}

function vtRemplirCategories() {
  const sel = document.getElementById('vt-categorie');
  if (!sel) return;
  sel.innerHTML = _vtCategories.map(c => `<option value="${vtEsc(c)}">${vtEsc(c)}</option>`).join('');
}

function vtOuvrirForm(id) {
  vtRemplirCategories();
  document.getElementById('vt-id').value = id || '';
  document.getElementById('vt-modal-titre').textContent = id ? 'Modifier la vidéo' : 'Ajouter une vidéo';
  /* videos-tutoriels.html (2026-09-25) n'alimente jamais _vtCache (liste de gestion absente de
     cette page, voir vtCharger ci-dessus) — repli sur _dvtCache, le cache de la grille PUBLIQUE
     (assets/videos-tutoriels-public.js, même scope global classique donc accessible ici sans
     import), où la vidéo cliquée est forcément déjà présente. `typeof` obligatoire : sur
     dashboard-administrateur.html, qui charge ce fichier SANS le script public, _dvtCache
     n'existe pas du tout — y référencer la variable nue lèverait un ReferenceError. */
  const v = id ? (_vtCache.find(x => x.id === id) || (typeof _dvtCache !== 'undefined' ? _dvtCache[id] : null)) : null;
  document.getElementById('vt-titre').value = v?.titre || '';
  document.getElementById('vt-description').value = v?.description || '';
  if (window.RichEditor) RichEditor.attach('vt-description', { placeholder: 'Présentez-vous et mettez en valeur votre parcours…' })?.setHTML(v?.description || '');
  document.getElementById('vt-icone').value = v?.icone || '🎬';
  document.getElementById('vt-categorie').value = v?.categorie || _vtCategories[0];
  document.getElementById('vt-statut').value = v?.statut || 'brouillon';
  document.getElementById('vt-url-youtube').value = (v && v.type_source === 'youtube') ? v.url : '';
  document.getElementById('vt-url-mp4').value = (v && v.type_source === 'mp4') ? v.url : '';
  document.getElementById('vt-fichier-mp4').value = '';
  document.getElementById('vt-upload-statut').textContent = (v && v.type_source === 'mp4') ? 'Fichier déjà envoyé — en choisir un nouveau pour le remplacer.' : '';
  document.getElementById('vt-duree').value = v ? vtFormatDuree(v.duree_secondes) : '';
  document.getElementById('vt-miniature-url').value = v?.miniature_url || '';
  document.getElementById('vt-fichier-miniature').value = '';
  document.getElementById('vt-miniature-statut').textContent = v?.miniature_url ? 'Miniature déjà envoyée — en choisir une nouvelle pour la remplacer.' : '';
  document.querySelector(`input[name="vt-type"][value="${v?.type_source || 'youtube'}"]`).checked = true;
  vtChangerType();
  document.getElementById('vt-modal-overlay').style.display = 'flex';
}

function vtFermerForm() {
  document.getElementById('vt-modal-overlay').style.display = 'none';
}

function vtLireDureeFichier(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(v.src); reject(new Error('Impossible de lire ce fichier vidéo. Formats acceptés : MP4, WebM.')); };
    v.src = URL.createObjectURL(file);
  });
}

async function vtFichierChoisi(input) {
  const file = input.files[0];
  const statutEl = document.getElementById('vt-upload-statut');
  if (!file) return;
  const MAX_MO = 300;
  if (file.size > MAX_MO * 1024 * 1024) { alert(`Vidéo trop volumineuse (max ${MAX_MO} Mo).`); input.value = ''; return; }
  try {
    statutEl.textContent = 'Vérification de la durée…';
    const duree = await vtLireDureeFichier(file);
    if (duree > 15 * 60) {
      alert(`Cette vidéo dure ${Math.round(duree / 60)} min — 15 minutes maximum.`);
      statutEl.textContent = ''; input.value = ''; return;
    }
    statutEl.textContent = 'Envoi de la vidéo…';
    const url = await uploadMedia(file, 'video-tutoriel');
    document.getElementById('vt-url-mp4').value = url;
    document.getElementById('vt-duree').value = vtFormatDuree(Math.round(duree));
    statutEl.textContent = '✓ Vidéo envoyée.';
  } catch (e) {
    statutEl.textContent = '';
    alert('Erreur upload vidéo : ' + e.message);
    input.value = '';
  }
}

async function vtMiniatureChoisie(input) {
  const file = input.files[0];
  const statutEl = document.getElementById('vt-miniature-statut');
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Image trop volumineuse (max 5 Mo).'); input.value = ''; return; }
  try {
    statutEl.textContent = 'Envoi de la miniature…';
    const url = await uploadMedia(file, 'video-tutoriel-miniature');
    document.getElementById('vt-miniature-url').value = url;
    statutEl.textContent = '✓ Miniature envoyée.';
  } catch (e) {
    statutEl.textContent = '';
    alert('Erreur upload miniature : ' + e.message);
    input.value = '';
  }
}

async function vtSauver() {
  const id = document.getElementById('vt-id').value;
  const titre = document.getElementById('vt-titre').value.trim();
  const type_source = document.querySelector('input[name="vt-type"]:checked').value;
  const url = type_source === 'youtube' ? document.getElementById('vt-url-youtube').value.trim()
    : type_source === 'mp4' ? document.getElementById('vt-url-mp4').value.trim()
    : ''; // "bientot" : aucune vidéo réelle, pas d'URL à exiger
  const categorie = document.getElementById('vt-categorie').value;
  if (!titre) return alert('Le titre est obligatoire.');
  if (type_source !== 'bientot' && !url) return alert(type_source === 'youtube' ? "L'URL YouTube est obligatoire." : 'Merci de charger un fichier vidéo.');
  if (!categorie) return alert('La catégorie est obligatoire.');
  const payload = {
    titre,
    description: document.getElementById('vt-description').value.trim() || null,
    icone: document.getElementById('vt-icone').value.trim() || '🎬',
    type_source, url, categorie,
    statut: document.getElementById('vt-statut').value,
    miniature_url: document.getElementById('vt-miniature-url').value || null,
    duree_secondes: vtParseDuree(document.getElementById('vt-duree').value),
  };
  try {
    if (id) await api('PUT', `/admin/videos-tutoriels/${id}`, payload);
    else await api('POST', '/admin/videos-tutoriels', payload);
    vtFermerForm();
    vtCharger();
  } catch (e) { alert('Erreur : ' + e.message); }
}

async function vtSupprimer(id) {
  if (!confirm("Supprimer cette vidéo ?\n\nCette action supprimera la vidéo de la rubrique Vidéos Tuto ainsi que ses commentaires et réactions. Cette action est irréversible.")) return;
  try { await api('DELETE', `/admin/videos-tutoriels/${id}`); vtCharger(); }
  catch (e) { alert('Erreur : ' + e.message); }
}

async function vtDeplacer(id, direction) {
  try { await api('POST', `/admin/videos-tutoriels/${id}/deplacer`, { direction }); vtCharger(); }
  catch (e) { alert('Erreur : ' + e.message); }
}

async function vtPublier(id) {
  try { await api('POST', `/admin/videos-tutoriels/${id}/publier`); vtCharger(); }
  catch (e) { alert('Erreur : ' + e.message); }
}

async function vtDepublier(id) {
  try { await api('POST', `/admin/videos-tutoriels/${id}/depublier`); vtCharger(); }
  catch (e) { alert('Erreur : ' + e.message); }
}

/* ── Onglet Commentaires (modération) ── */
async function vtChargerCommentaires(signalesUniquement) {
  if (signalesUniquement === undefined) signalesUniquement = document.getElementById('vt-filtre-signales')?.checked;
  const box = document.getElementById('vt-commentaires-liste');
  if (!box) return;
  try {
    const { commentaires } = await api('GET', `/admin/videos-tutoriels/commentaires${signalesUniquement ? '?signales=1' : ''}`);
    if (!commentaires.length) { box.innerHTML = '<p style="color:var(--muted);font-size:13px;">Aucun commentaire.</p>'; return; }
    box.innerHTML = commentaires.map(c => `
      <div class="card" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          <div>
            <strong style="font-size:13px;">${vtEsc(c.auteur_nom)}</strong>
            <span style="color:var(--muted);font-size:11.5px;"> sur « ${vtEsc(c.video_titre)} » · ${c.created_at ? new Date(c.created_at.replace(' ','T')+'Z').toLocaleString('fr-FR') : ''}</span>
            ${c.statut === 'masque' ? '<span style="color:#dc2626;font-size:11px;font-weight:700;"> (masqué)</span>' : ''}
            ${c.nb_signalements > 0 ? `<span style="color:#dc2626;font-size:11px;font-weight:700;"> · 🚩 ${c.nb_signalements} signalement(s)</span>` : ''}
          </div>
          <div style="display:flex;gap:6px;">
            ${c.statut === 'masque'
              ? `<button class="btn btn-sm btn-outline" onclick="vtRestaurerCommentaire(${c.id})">↺ Restaurer</button>`
              : `<button class="btn btn-sm btn-outline" onclick="vtMasquerCommentaire(${c.id})">🙈 Masquer</button>`}
            <button class="btn btn-sm btn-outline" style="color:#dc2626;border-color:#dc2626;" onclick="vtSupprimerCommentaire(${c.id})">🗑 Supprimer</button>
          </div>
        </div>
        <p style="margin:8px 0 0;font-size:13px;">${vtEsc(c.contenu)}</p>
      </div>`).join('');
  } catch (e) { box.innerHTML = `<p style="color:#dc2626;font-size:13px;">Erreur : ${e.message}</p>`; }
}

async function vtMasquerCommentaire(id) {
  try { await api('POST', `/admin/videos-tutoriels/commentaires/${id}/masquer`); vtChargerCommentaires(); }
  catch (e) { alert('Erreur : ' + e.message); }
}

async function vtRestaurerCommentaire(id) {
  try { await api('POST', `/admin/videos-tutoriels/commentaires/${id}/restaurer`); vtChargerCommentaires(); }
  catch (e) { alert('Erreur : ' + e.message); }
}

async function vtSupprimerCommentaire(id) {
  if (!confirm('Supprimer définitivement ce commentaire (et ses réponses) ?')) return;
  try { await api('DELETE', `/videos-tutoriels/commentaires/${id}`); vtChargerCommentaires(); }
  catch (e) { alert('Erreur : ' + e.message); }
}

/* ── Onglet Signalements ── */
async function vtChargerSignalements() {
  const box = document.getElementById('vt-signalements-liste');
  if (!box) return;
  try {
    const { signalements } = await api('GET', '/admin/videos-tutoriels/signalements');
    if (!signalements.length) { box.innerHTML = '<p style="color:var(--muted);font-size:13px;">Aucun signalement en attente.</p>'; return; }
    box.innerHTML = signalements.map(s => `
      <div class="card" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          <div>
            <strong style="font-size:13px;">Motif : ${vtEsc(s.motif)}</strong>
            <span style="color:var(--muted);font-size:11.5px;"> — signalé par ${vtEsc(s.signale_par_nom)} · ${s.created_at ? new Date(s.created_at.replace(' ','T')+'Z').toLocaleString('fr-FR') : ''}</span>
          </div>
          <button class="btn btn-sm btn-outline" onclick="vtTraiterSignalement(${s.id})">✓ Marquer comme traité</button>
        </div>
        <p style="margin:8px 0 0;font-size:13px;color:var(--muted);">Commentaire signalé : « ${vtEsc(s.commentaire_contenu)} »</p>
      </div>`).join('');
  } catch (e) { box.innerHTML = `<p style="color:#dc2626;font-size:13px;">Erreur : ${e.message}</p>`; }
}

async function vtTraiterSignalement(id) {
  try { await api('POST', `/admin/videos-tutoriels/signalements/${id}/traiter`); vtChargerSignalements(); }
  catch (e) { alert('Erreur : ' + e.message); }
}
