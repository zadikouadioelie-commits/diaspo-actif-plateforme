/* ══ Galerie photo — lightbox réactions/commentaires (partagé tous types de comptes) ══ */
function _gaEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function loadGaleriePhotoCounts(ownerType, ownerId) {
  try {
    const r = await api('GET', `/galerie/${ownerType}/${ownerId}/stats`);
    Object.entries(r.stats || {}).forEach(([photoId, s]) => {
      const el = document.getElementById('ga-counts-' + photoId);
      if (el) el.textContent = `♥ ${s.reactions || 0} · 💬 ${s.commentaires || 0}`;
    });
  } catch (e) {}
}

let _gaCurrent = null;
function openGaleriePhoto(ownerType, ownerId, photoId, url, titre, caption) {
  _gaCurrent = { ownerType, ownerId, photoId };
  let bg = document.getElementById('ga-lightbox-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.id = 'ga-lightbox-bg';
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;';
    bg.onclick = (e) => { if (e.target === bg) closeGaleriePhoto(); };
    document.body.appendChild(bg);
  }
  bg.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:92vh;overflow-y:auto;">
      <div style="position:relative;background:#000;display:flex;align-items:center;justify-content:center;min-height:200px;">
        ${url ? `<img src="${_gaEsc(url)}" style="max-width:100%;max-height:60vh;display:block;">` : '<div style="font-size:60px;padding:40px;">🖼</div>'}
        <button onclick="closeGaleriePhoto()" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:18px;">×</button>
      </div>
      <div style="padding:16px 18px;">
        ${titre ? `<div style="font-weight:800;font-size:15px;margin-bottom:4px;">${_gaEsc(titre)}</div>` : ''}
        ${caption ? `<div style="font-size:13px;color:var(--muted);margin-bottom:10px;">${_gaEsc(caption)}</div>` : ''}
        <button id="ga-react-btn" class="btn btn-sm btn-outline" onclick="reagirGaleriePhoto()">♥ J'aime</button>
        <div id="ga-comments-list" style="margin-top:14px;display:flex;flex-direction:column;gap:8px;"></div>
        <div style="display:flex;gap:6px;margin-top:10px;">
          <input id="ga-comment-input" placeholder="Ajouter un commentaire…" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
          <button class="btn btn-sm btn-orange" onclick="commenterGaleriePhoto()">Envoyer</button>
        </div>
      </div>
    </div>`;
  loadGaleriePhotoComments();
}
function closeGaleriePhoto() {
  const bg = document.getElementById('ga-lightbox-bg');
  if (bg) bg.remove();
  _gaCurrent = null;
}
async function reagirGaleriePhoto() {
  if (!_gaCurrent) return;
  const { ownerType, ownerId, photoId } = _gaCurrent;
  try {
    const r = await api('POST', `/galerie/${ownerType}/${ownerId}/${encodeURIComponent(photoId)}/react`, {});
    const btn = document.getElementById('ga-react-btn');
    if (btn) btn.textContent = `♥ ${r.reactions} J'aime`;
    loadGaleriePhotoCounts(ownerType, ownerId);
  } catch (e) { if (typeof showToast === 'function') showToast('Connectez-vous pour réagir.', 'error'); else alert('Connectez-vous pour réagir.'); }
}
async function loadGaleriePhotoComments() {
  if (!_gaCurrent) return;
  const { ownerType, ownerId, photoId } = _gaCurrent;
  const list = document.getElementById('ga-comments-list');
  try {
    const r = await api('GET', `/galerie/${ownerType}/${ownerId}/${encodeURIComponent(photoId)}/commentaires`);
    list.innerHTML = (r.commentaires || []).map(c => `
      <div style="font-size:12.5px;"><strong>${_gaEsc(c.auteur_nom)}</strong> <span style="color:var(--muted);">${_gaEsc(c.contenu)}</span></div>
    `).join('') || '<div style="font-size:12px;color:var(--muted);">Aucun commentaire pour l\'instant.</div>';
  } catch (e) {}
}
async function commenterGaleriePhoto() {
  if (!_gaCurrent) return;
  const { ownerType, ownerId, photoId } = _gaCurrent;
  const input = document.getElementById('ga-comment-input');
  const contenu = (input.value || '').trim();
  if (!contenu) return;
  try {
    await api('POST', `/galerie/${ownerType}/${ownerId}/${encodeURIComponent(photoId)}/commentaires`, { contenu });
    input.value = '';
    loadGaleriePhotoComments();
    loadGaleriePhotoCounts(ownerType, ownerId);
  } catch (e) { if (typeof showToast === 'function') showToast('Connectez-vous pour commenter.', 'error'); else alert('Connectez-vous pour commenter.'); }
}
