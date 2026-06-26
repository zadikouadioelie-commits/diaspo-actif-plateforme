/**
 * Diaspo'Actif — CV Builder Logic
 * Auto-save, version history, photo crop, signature, audio, video, QR, export
 */

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let CVB = {
  id: null,
  dirty: false,
  saving: false,
  autoSaveTimer: null,
  historyVersions: [],
  data: {
    meta: { titre: 'Mon CV', numero: 1, template: 'moderne' },
    style: {
      couleur1: '#1a3a5c', couleur2: '#4a90d9', couleur3: '#e8f0fe',
      font: 'Segoe UI', fontSize: 11,
      spacing: 1.4, margins: { top: 15, bottom: 15, left: 15, right: 15 }
    },
    photo: { url: '', shape: 'round', size: 80, show: true },
    infos: {
      prenom: '', nom: '', titre_pro: '', nationalite: '',
      pays_residence: '', ville: '', telephone: '', email: '',
      linkedin: '', site: '', adresse: ''
    },
    resume: '',
    experiences: [],
    formations: [],
    competences: { tech: [], metier: [], num: [] },
    langues: [],
    certifications: [],
    interests: [],
    media: { audio: null, video: null, signature: null, qr: { enabled: false } }
  }
};

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const num = parseInt(params.get('numero') || '1');

  if (id) {
    await loadCV(id);
  } else {
    CVB.data.meta.numero = num;
    document.getElementById('cv-numero').value = num;
    render();
  }
  setupAutoSave();
  renderTemplateGallery();
  setupDesignListeners();
  setThemeBtn(CVB.data.meta.template);
});

/* ═══════════════════════════════════════════
   LOAD / SAVE / AUTOSAVE / VERSIONS
═══════════════════════════════════════════ */
async function loadCV(id) {
  try {
    const r = await fetch('/api/cv/' + id, { credentials: 'include' });
    if (!r.ok) { render(); return; }
    const cv = await r.json();
    CVB.id = cv.id;
    CVB.data = deepMerge(CVB.data, cv.data || {});
    CVB.data.meta.titre = cv.titre || 'Mon CV';
    CVB.data.meta.numero = cv.numero || 1;
    CVB.data.meta.template = cv.data?.meta?.template || 'moderne';
    CVB.historyVersions = cv.versions || [];

    // Remplir formulaire
    syncFormFromData();
    setThemeBtn(CVB.data.meta.template);
    render();
    setSaveStatus('saved');
  } catch (e) { render(); }
}

async function saveCV(force = false) {
  if (CVB.saving) return;
  CVB.saving = true;
  setSaveStatus('saving');
  collectFormData();

  const payload = {
    numero: CVB.data.meta.numero,
    titre: document.getElementById('cv-titre')?.value || CVB.data.meta.titre || 'Mon CV',
    theme: CVB.data.meta.template,
    data: CVB.data,
    save_version: force
  };

  try {
    const r = await fetch('/api/cv', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(payload)
    });
    if (r.ok) {
      const j = await r.json();
      if (!CVB.id) { CVB.id = j.id; history.replaceState({}, '', '?id=' + j.id); }
      CVB.dirty = false;
      setSaveStatus('saved');
      if (j.version_saved) {
        CVB.historyVersions = j.versions || CVB.historyVersions;
      }
    } else {
      setSaveStatus('error');
    }
  } catch (e) { setSaveStatus('error'); }
  CVB.saving = false;
}

function setupAutoSave() {
  document.addEventListener('input', () => {
    CVB.dirty = true;
    setSaveStatus('unsaved');
    clearTimeout(CVB.autoSaveTimer);
    CVB.autoSaveTimer = setTimeout(() => { collectFormData(); render(); saveCV(); }, 2500);
  });
}

function setSaveStatus(status) {
  const el = document.getElementById('save-status');
  if (!el) return;
  const map = {
    saving:  { icon: '⏳', text: 'Sauvegarde…', color: '#888' },
    saved:   { icon: '✅', text: 'Enregistré', color: '#27ae60' },
    unsaved: { icon: '●',  text: 'Non sauvegardé', color: '#e67e22' },
    error:   { icon: '⚠️', text: 'Erreur', color: '#e74c3c' }
  };
  const s = map[status] || map.saved;
  el.innerHTML = `<span style="color:${s.color};">${s.icon} ${s.text}</span>`;
}

/* ═══════════════════════════════════════════
   COLLECT FORM DATA → STATE
═══════════════════════════════════════════ */
function collectFormData() {
  const g = id => (document.getElementById(id)?.value || '').trim();
  CVB.data.infos = {
    prenom: g('prenom'), nom: g('nom'), titre_pro: g('titre-pro'),
    nationalite: g('nationalite'), pays_residence: g('pays-residence'),
    ville: g('ville'), telephone: g('telephone'), email: g('email'),
    linkedin: g('linkedin'), site: g('site'), adresse: g('adresse')
  };
  CVB.data.resume = document.getElementById('resume')?.value || '';
  CVB.data.meta.titre = document.getElementById('cv-titre')?.value || 'Mon CV';
  CVB.data.meta.numero = parseInt(document.getElementById('cv-numero')?.value || '1');
}

/* ═══════════════════════════════════════════
   SYNC FORM FROM STATE (on load)
═══════════════════════════════════════════ */
function syncFormFromData() {
  const s = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  const inf = CVB.data.infos || {};
  s('prenom', inf.prenom); s('nom', inf.nom); s('titre-pro', inf.titre_pro);
  s('nationalite', inf.nationalite); s('pays-residence', inf.pays_residence);
  s('ville', inf.ville); s('telephone', inf.telephone);
  s('email', inf.email); s('linkedin', inf.linkedin);
  s('site', inf.site); s('adresse', inf.adresse);
  s('resume', CVB.data.resume);
  s('cv-titre', CVB.data.meta.titre);
  const numEl = document.getElementById('cv-numero');
  if (numEl) numEl.value = CVB.data.meta.numero;
  if (CVB.data.photo?.url) {
    document.getElementById('photo-preview').src = CVB.data.photo.url;
    document.getElementById('photo-preview').style.display = 'block';
  }
  renderExpList(); renderEduList(); renderLangList(); renderCertList();
  renderTagsAll();
  renderDesignPanel();
}

/* ═══════════════════════════════════════════
   RENDER PREVIEW
═══════════════════════════════════════════ */
function render() {
  collectFormData();
  const sheet = document.getElementById('cv-sheet');
  if (!sheet) return;
  const tmpl = CV_TEMPLATES[CVB.data.meta.template] || CV_TEMPLATES['moderne'];
  sheet.innerHTML = tmpl.render(CVB.data, CVB.data.style);
}

/* ═══════════════════════════════════════════
   TEMPLATE GALLERY
═══════════════════════════════════════════ */
function renderTemplateGallery() {
  const container = document.getElementById('template-list');
  if (!container) return;
  container.innerHTML = Object.entries(CV_TEMPLATES).map(([id, tmpl]) => `
    <div class="tmpl-card ${CVB.data.meta.template === id ? 'active' : ''}" onclick="selectTemplate('${id}')" data-id="${id}">
      <div class="tmpl-preview" style="background:${tmpl.preview};height:90px;border-radius:6px 6px 0 0;"></div>
      <div style="padding:8px 10px;font-size:.8rem;font-weight:700;">${tmpl.name}</div>
      <div style="padding:0 10px 8px;font-size:.72rem;color:#888;">${tmpl.category}</div>
    </div>`).join('');
}
window.selectTemplate = function(id) {
  CVB.data.meta.template = id;
  document.querySelectorAll('.tmpl-card').forEach(c => c.classList.toggle('active', c.dataset.id === id));
  setThemeBtn(id);
  render();
  CVB.dirty = true;
};
function setThemeBtn(id) {
  const tmpl = CV_TEMPLATES[id];
  const btn = document.getElementById('btn-template');
  if (btn && tmpl) btn.textContent = '🎨 ' + tmpl.name;
}

/* ═══════════════════════════════════════════
   DESIGN PANEL
═══════════════════════════════════════════ */
function renderDesignPanel() {
  const s = CVB.data.style;
  const g = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  g('color1', s.couleur1); g('color2', s.couleur2); g('color3', s.couleur3);
  g('font-select', s.font); g('font-size', s.fontSize);
  g('spacing', s.spacing);
}
function setupDesignListeners() {
  ['color1','color2','color3'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', e => {
      const map = { color1:'couleur1', color2:'couleur2', color3:'couleur3' };
      CVB.data.style[map[id]] = e.target.value;
      render(); CVB.dirty = true;
    });
  });
  document.getElementById('font-select')?.addEventListener('change', e => {
    CVB.data.style.font = e.target.value; render(); CVB.dirty = true;
  });
  document.getElementById('font-size')?.addEventListener('input', e => {
    CVB.data.style.fontSize = parseInt(e.target.value) || 11; render(); CVB.dirty = true;
  });
  document.getElementById('spacing')?.addEventListener('input', e => {
    CVB.data.style.spacing = parseFloat(e.target.value) || 1.4; render(); CVB.dirty = true;
  });
}

/* ═══════════════════════════════════════════
   TABS
═══════════════════════════════════════════ */
window.switchTab = function(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('tab-' + tab);
  if (el) el.style.display = 'block';
  event?.target?.classList.add('active');
};

/* ═══════════════════════════════════════════
   SECTIONS TOGGLE
═══════════════════════════════════════════ */
window.toggleSection = function(header) {
  header.parentElement.classList.toggle('open');
  header.querySelector('.toggle-arrow').textContent =
    header.parentElement.classList.contains('open') ? '▼' : '▶';
};

/* ═══════════════════════════════════════════
   EXPÉRIENCES
═══════════════════════════════════════════ */
window.addExp = function() {
  CVB.data.experiences.push({ id: Date.now(), poste:'', entreprise:'', ville:'', pays:'', date_debut:'', date_fin:'', actuel:false, description:'' });
  renderExpList(); CVB.dirty = true;
};
window.removeExp = function(i) { CVB.data.experiences.splice(i,1); renderExpList(); render(); CVB.dirty = true; };
window.moveExp = function(i, dir) {
  const arr = CVB.data.experiences;
  if (i+dir < 0 || i+dir >= arr.length) return;
  [arr[i], arr[i+dir]] = [arr[i+dir], arr[i]];
  renderExpList(); render(); CVB.dirty = true;
};
function renderExpList() {
  const el = document.getElementById('exp-list');
  if (!el) return;
  el.innerHTML = CVB.data.experiences.map((e,i) => `
    <div class="repeater-item">
      <div class="repeater-controls">
        <button onclick="moveExp(${i},-1)" title="Monter">↑</button>
        <button onclick="moveExp(${i},1)" title="Descendre">↓</button>
        <button onclick="removeExp(${i})" class="btn-remove" title="Supprimer">×</button>
      </div>
      <div class="form-row"><div><label>Poste</label><input value="${_esc(e.poste)}" oninput="CVB.data.experiences[${i}].poste=this.value;render();CVB.dirty=true;"></div><div><label>Entreprise</label><input value="${_esc(e.entreprise)}" oninput="CVB.data.experiences[${i}].entreprise=this.value;render();CVB.dirty=true;"></div></div>
      <div class="form-row"><div><label>Ville</label><input value="${_esc(e.ville)}" oninput="CVB.data.experiences[${i}].ville=this.value;render();CVB.dirty=true;"></div><div><label>Pays</label><input value="${_esc(e.pays)}" oninput="CVB.data.experiences[${i}].pays=this.value;render();CVB.dirty=true;"></div></div>
      <div class="form-row"><div><label>Début</label><input type="month" value="${e.date_debut||''}" oninput="CVB.data.experiences[${i}].date_debut=this.value;render();CVB.dirty=true;"></div><div><label>Fin</label><input type="month" value="${e.date_fin||''}" ${e.actuel?'disabled':''} oninput="CVB.data.experiences[${i}].date_fin=this.value;render();CVB.dirty=true;"></div></div>
      <label style="font-size:.78rem;display:flex;align-items:center;gap:6px;margin-bottom:6px;"><input type="checkbox" ${e.actuel?'checked':''} onchange="CVB.data.experiences[${i}].actuel=this.checked;renderExpList();render();CVB.dirty=true;"> Poste actuel</label>
      <label style="font-size:.78rem;">Description</label>
      <textarea rows="2" oninput="CVB.data.experiences[${i}].description=this.value;render();CVB.dirty=true;">${_esc(e.description)}</textarea>
    </div>`).join('');
}

/* ═══════════════════════════════════════════
   FORMATIONS
═══════════════════════════════════════════ */
window.addEdu = function() {
  CVB.data.formations.push({ id: Date.now(), diplome:'', etablissement:'', pays:'', ville:'', annee:'', description:'' });
  renderEduList(); CVB.dirty = true;
};
window.removeEdu = function(i) { CVB.data.formations.splice(i,1); renderEduList(); render(); CVB.dirty = true; };
function renderEduList() {
  const el = document.getElementById('edu-list');
  if (!el) return;
  el.innerHTML = CVB.data.formations.map((e,i) => `
    <div class="repeater-item">
      <button class="repeater-remove" onclick="removeEdu(${i})">×</button>
      <div class="form-row"><div><label>Diplôme</label><input value="${_esc(e.diplome)}" oninput="CVB.data.formations[${i}].diplome=this.value;render();CVB.dirty=true;"></div><div><label>Établissement</label><input value="${_esc(e.etablissement)}" oninput="CVB.data.formations[${i}].etablissement=this.value;render();CVB.dirty=true;"></div></div>
      <div class="form-row"><div><label>Pays</label><input value="${_esc(e.pays)}" oninput="CVB.data.formations[${i}].pays=this.value;render();CVB.dirty=true;"></div><div><label>Ville</label><input value="${_esc(e.ville)}" oninput="CVB.data.formations[${i}].ville=this.value;render();CVB.dirty=true;"></div></div>
      <div class="form-row"><div><label>Année</label><input type="number" min="1980" max="2030" value="${e.annee||''}" oninput="CVB.data.formations[${i}].annee=this.value;render();CVB.dirty=true;"></div><div><label>Description</label><input value="${_esc(e.description)}" oninput="CVB.data.formations[${i}].description=this.value;render();CVB.dirty=true;"></div></div>
    </div>`).join('');
}

/* ═══════════════════════════════════════════
   LANGUES
═══════════════════════════════════════════ */
const NIVEAUX = ['Débutant','Intermédiaire','Courant','Professionnel','Natif / Bilingue'];
window.addLang = function() { CVB.data.langues.push({ langue:'', niveau:'Courant' }); renderLangList(); CVB.dirty=true; };
window.removeLang = function(i) { CVB.data.langues.splice(i,1); renderLangList(); render(); CVB.dirty=true; };
function renderLangList() {
  const el = document.getElementById('lang-list');
  if (!el) return;
  el.innerHTML = CVB.data.langues.map((l,i) => `
    <div class="repeater-item" style="display:flex;gap:8px;align-items:center;">
      <input style="flex:1;" placeholder="Langue" value="${_esc(l.langue)}" oninput="CVB.data.langues[${i}].langue=this.value;render();CVB.dirty=true;">
      <select style="flex:1;" oninput="CVB.data.langues[${i}].niveau=this.value;render();CVB.dirty=true;">${NIVEAUX.map(n=>`<option ${l.niveau===n?'selected':''}>${n}</option>`).join('')}</select>
      <button onclick="removeLang(${i})" style="background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;">×</button>
    </div>`).join('');
}

/* ═══════════════════════════════════════════
   CERTIFICATIONS
═══════════════════════════════════════════ */
window.addCert = function() { CVB.data.certifications.push({ nom:'', organisme:'', date:'' }); renderCertList(); CVB.dirty=true; };
window.removeCert = function(i) { CVB.data.certifications.splice(i,1); renderCertList(); render(); CVB.dirty=true; };
function renderCertList() {
  const el = document.getElementById('cert-list');
  if (!el) return;
  el.innerHTML = CVB.data.certifications.map((c,i) => `
    <div class="repeater-item">
      <button class="repeater-remove" onclick="removeCert(${i})">×</button>
      <div class="form-row"><div><label>Certification</label><input value="${_esc(c.nom)}" oninput="CVB.data.certifications[${i}].nom=this.value;render();CVB.dirty=true;"></div><div><label>Organisme</label><input value="${_esc(c.organisme)}" oninput="CVB.data.certifications[${i}].organisme=this.value;render();CVB.dirty=true;"></div></div>
      <div><label>Date</label><input type="month" value="${c.date||''}" oninput="CVB.data.certifications[${i}].date=this.value;render();CVB.dirty=true;"></div>
    </div>`).join('');
}

/* ═══════════════════════════════════════════
   TAGS (compétences & intérêts)
═══════════════════════════════════════════ */
const TAG_MAP = { 'comp-tech':'tech', 'comp-metier':'metier', 'comp-num':'num' };
window.addTag = function(containerId, inputEl, value) {
  const val = value || (inputEl?.value?.trim());
  if (!val) return;
  const key = TAG_MAP[containerId];
  if (key) {
    if (!CVB.data.competences[key]) CVB.data.competences[key] = [];
    if (!CVB.data.competences[key].includes(val)) CVB.data.competences[key].push(val);
  } else if (containerId === 'interests') {
    if (!CVB.data.interests.includes(val)) CVB.data.interests.push(val);
  }
  if (inputEl) inputEl.value = '';
  renderTagsAll(); render(); CVB.dirty = true;
};
window.removeTag = function(containerId, val) {
  const key = TAG_MAP[containerId];
  if (key) CVB.data.competences[key] = CVB.data.competences[key].filter(v => v !== val);
  else if (containerId === 'interests') CVB.data.interests = CVB.data.interests.filter(v => v !== val);
  renderTagsAll(); render(); CVB.dirty = true;
};
function renderTagsAll() {
  Object.entries({ 'comp-tech':'tech','comp-metier':'metier','comp-num':'num' }).forEach(([cid,key]) => {
    const el = document.getElementById(cid);
    if (el) el.innerHTML = (CVB.data.competences[key]||[]).map(v =>
      `<span class="tag">${_esc(v)}<button onclick="removeTag('${cid}','${v.replace(/'/g,"\\'")}')">×</button></span>`).join('');
  });
  const ie = document.getElementById('interests-tags');
  if (ie) ie.innerHTML = (CVB.data.interests||[]).map(v =>
    `<span class="tag">${_esc(v)}<button onclick="removeTag('interests','${v.replace(/'/g,"\\'")}')">×</button></span>`).join('');
}

/* ═══════════════════════════════════════════
   PHOTO — IMPORT + CROP
═══════════════════════════════════════════ */
let cropCanvas, cropCtx, cropImg, cropState = {};
window.openPhotoPicker = function() { document.getElementById('photo-file-input').click(); };
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('photo-file-input');
  if (inp) inp.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => openCropModal(ev.target.result);
    r.readAsDataURL(f);
  });
});
function openCropModal(src) {
  const modal = document.getElementById('modal-crop');
  if (modal) modal.style.display = 'flex';
  cropImg = new Image();
  cropImg.onload = () => {
    cropCanvas = document.getElementById('crop-canvas');
    cropCtx = cropCanvas.getContext('2d');
    const maxW = 400, maxH = 300;
    const ratio = Math.min(maxW / cropImg.width, maxH / cropImg.height);
    cropCanvas.width = cropImg.width * ratio;
    cropCanvas.height = cropImg.height * ratio;
    cropState = { x: 0, y: 0, size: Math.min(cropCanvas.width, cropCanvas.height) * .8, dragging: false, resizing: false };
    drawCrop();
    setupCropEvents();
  };
  cropImg.src = src;
}
function drawCrop() {
  const { x, y, size } = cropState;
  cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
  cropCtx.drawImage(cropImg, 0, 0, cropCanvas.width, cropCanvas.height);
  cropCtx.fillStyle = 'rgba(0,0,0,.5)';
  cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
  cropCtx.save();
  cropCtx.globalCompositeOperation = 'destination-out';
  cropCtx.beginPath();
  cropCtx.arc(x + size/2, y + size/2, size/2, 0, Math.PI*2);
  cropCtx.fill();
  cropCtx.restore();
  cropCtx.drawImage(cropImg, (x/cropCanvas.width)*cropImg.width, (y/cropCanvas.height)*cropImg.height, (size/cropCanvas.width)*cropImg.width, (size/cropCanvas.height)*cropImg.height, x, y, size, size);
  cropCtx.strokeStyle = '#fff';
  cropCtx.lineWidth = 2;
  cropCtx.beginPath();
  cropCtx.arc(x + size/2, y + size/2, size/2, 0, Math.PI*2);
  cropCtx.stroke();
  // Resize handle
  cropCtx.fillStyle = '#fff';
  cropCtx.fillRect(x + size - 8, y + size - 8, 8, 8);
}
function setupCropEvents() {
  const getPos = e => {
    const rect = cropCanvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };
  const onDown = e => {
    e.preventDefault();
    const p = getPos(e);
    const { x, y, size } = cropState;
    if (Math.abs(p.x - (x+size)) < 12 && Math.abs(p.y - (y+size)) < 12) {
      cropState.resizing = true;
    } else if (p.x > x && p.x < x+size && p.y > y && p.y < y+size) {
      cropState.dragging = true;
      cropState.ox = p.x - x; cropState.oy = p.y - y;
    }
  };
  const onMove = e => {
    e.preventDefault();
    const p = getPos(e);
    if (cropState.dragging) {
      cropState.x = Math.max(0, Math.min(cropCanvas.width - cropState.size, p.x - cropState.ox));
      cropState.y = Math.max(0, Math.min(cropCanvas.height - cropState.size, p.y - cropState.oy));
    } else if (cropState.resizing) {
      const newSize = Math.max(40, Math.min(Math.min(cropCanvas.width, cropCanvas.height), p.x - cropState.x, p.y - cropState.y));
      cropState.size = newSize;
    }
    drawCrop();
  };
  const onUp = () => { cropState.dragging = false; cropState.resizing = false; };
  cropCanvas.removeEventListener('mousedown', cropCanvas._onDown);
  cropCanvas._onDown = onDown;
  cropCanvas.addEventListener('mousedown', onDown);
  cropCanvas.addEventListener('mousemove', onMove);
  cropCanvas.addEventListener('mouseup', onUp);
  cropCanvas.addEventListener('touchstart', onDown, { passive: false });
  cropCanvas.addEventListener('touchmove', onMove, { passive: false });
  cropCanvas.addEventListener('touchend', onUp);
}
window.applyCrop = function() {
  const { x, y, size } = cropState;
  const out = document.createElement('canvas');
  const sz = 200;
  out.width = sz; out.height = sz;
  const ctx = out.getContext('2d');
  ctx.beginPath(); ctx.arc(sz/2, sz/2, sz/2, 0, Math.PI*2); ctx.clip();
  const scaleX = cropImg.width / cropCanvas.width;
  const scaleY = cropImg.height / cropCanvas.height;
  ctx.drawImage(cropImg, x*scaleX, y*scaleY, size*scaleX, size*scaleY, 0, 0, sz, sz);
  const url = out.toDataURL('image/jpeg', .85);
  CVB.data.photo.url = url;
  CVB.data.photo.show = true;
  document.getElementById('photo-preview').src = url;
  document.getElementById('photo-preview').style.display = 'block';
  closeCropModal();
  render(); CVB.dirty = true;
};
window.closeCropModal = function() {
  const m = document.getElementById('modal-crop');
  if (m) m.style.display = 'none';
};
window.removePhoto = function() {
  CVB.data.photo.url = '';
  CVB.data.photo.show = false;
  document.getElementById('photo-preview').src = '';
  document.getElementById('photo-preview').style.display = 'none';
  render(); CVB.dirty = true;
};
window.setPhotoShape = function(shape) {
  CVB.data.photo.shape = shape;
  document.querySelectorAll('.shape-btn').forEach(b => b.classList.toggle('active', b.dataset.shape === shape));
  render(); CVB.dirty = true;
};
window.setPhotoSize = function(val) {
  CVB.data.photo.size = parseInt(val);
  render(); CVB.dirty = true;
};

/* ═══════════════════════════════════════════
   SIGNATURE — CANVAS DRAW
═══════════════════════════════════════════ */
let sigCanvas, sigCtx, sigDrawing = false;
window.openSignatureModal = function() {
  const m = document.getElementById('modal-signature');
  if (m) m.style.display = 'flex';
  sigCanvas = document.getElementById('sig-canvas');
  sigCtx = sigCanvas.getContext('2d');
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigCtx.strokeStyle = '#1a2b4a';
  sigCtx.lineWidth = 2;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';

  const getPos = e => {
    const r = sigCanvas.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return [t.clientX - r.left, t.clientY - r.top];
  };
  const start = e => { e.preventDefault(); sigDrawing = true; sigCtx.beginPath(); const [x,y]=getPos(e); sigCtx.moveTo(x,y); };
  const move = e => { e.preventDefault(); if (!sigDrawing) return; const [x,y]=getPos(e); sigCtx.lineTo(x,y); sigCtx.stroke(); };
  const end = () => { sigDrawing = false; };
  sigCanvas.onmousedown = start; sigCanvas.onmousemove = move; sigCanvas.onmouseup = end;
  sigCanvas.addEventListener('touchstart', start, {passive:false});
  sigCanvas.addEventListener('touchmove', move, {passive:false});
  sigCanvas.addEventListener('touchend', end);
};
window.clearSignature = function() { if (sigCtx) sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height); };
window.applySignature = function() {
  const url = sigCanvas.toDataURL('image/png');
  CVB.data.media.signature = url;
  document.getElementById('sig-preview').src = url;
  document.getElementById('sig-preview').style.display = 'block';
  closeSignatureModal(); render(); CVB.dirty = true;
};
window.importSignatureImage = function() { document.getElementById('sig-img-input').click(); };
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('sig-img-input');
  if (inp) inp.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      CVB.data.media.signature = ev.target.result;
      document.getElementById('sig-preview').src = ev.target.result;
      document.getElementById('sig-preview').style.display = 'block';
      render(); CVB.dirty = true;
    };
    r.readAsDataURL(f);
  });
});
window.removeSignature = function() {
  CVB.data.media.signature = null;
  document.getElementById('sig-preview').src = '';
  document.getElementById('sig-preview').style.display = 'none';
  render(); CVB.dirty = true;
};
window.closeSignatureModal = function() {
  const m = document.getElementById('modal-signature');
  if (m) m.style.display = 'none';
};

/* ═══════════════════════════════════════════
   AUDIO — ENREGISTREMENT (20s max)
═══════════════════════════════════════════ */
let audioRecorder, audioChunks = [], audioTimer, audioSeconds = 0;
window.startAudioRec = async function() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    audioRecorder = new MediaRecorder(stream);
    audioRecorder.ondataavailable = e => audioChunks.push(e.data);
    audioRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      CVB.data.media.audio = url;
      document.getElementById('audio-player').src = url;
      document.getElementById('audio-player').style.display = 'block';
      document.getElementById('audio-rec-status').textContent = '✅ Enregistrement prêt';
      render(); CVB.dirty = true;
    };
    audioRecorder.start();
    audioSeconds = 0;
    document.getElementById('audio-rec-status').textContent = '🔴 Enregistrement en cours... 0s / 20s';
    document.getElementById('btn-stop-audio').style.display = '';
    document.getElementById('btn-start-audio').style.display = 'none';
    audioTimer = setInterval(() => {
      audioSeconds++;
      document.getElementById('audio-rec-status').textContent = `🔴 ${audioSeconds}s / 20s`;
      if (audioSeconds >= 20) stopAudioRec();
    }, 1000);
  } catch (e) { alert('Microphone non disponible : ' + e.message); }
};
window.stopAudioRec = function() {
  clearInterval(audioTimer);
  if (audioRecorder?.state !== 'inactive') audioRecorder.stop();
  document.getElementById('btn-stop-audio').style.display = 'none';
  document.getElementById('btn-start-audio').style.display = '';
};
window.removeAudio = function() {
  CVB.data.media.audio = null;
  document.getElementById('audio-player').src = '';
  document.getElementById('audio-player').style.display = 'none';
  document.getElementById('audio-rec-status').textContent = '';
  render(); CVB.dirty = true;
};

/* ═══════════════════════════════════════════
   VIDEO — ENREGISTREMENT (20s max)
═══════════════════════════════════════════ */
let videoRecorder, videoChunks = [], videoTimer, videoSeconds = 0;
window.startVideoRec = async function() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const preview = document.getElementById('video-live-preview');
    preview.srcObject = stream;
    preview.style.display = 'block';
    videoChunks = [];
    videoRecorder = new MediaRecorder(stream);
    videoRecorder.ondataavailable = e => videoChunks.push(e.data);
    videoRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      preview.srcObject = null;
      preview.style.display = 'none';
      const blob = new Blob(videoChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      CVB.data.media.video = url;
      document.getElementById('video-player').src = url;
      document.getElementById('video-player').style.display = 'block';
      document.getElementById('video-rec-status').textContent = '✅ Vidéo prête';
      render(); CVB.dirty = true;
    };
    videoRecorder.start();
    videoSeconds = 0;
    document.getElementById('video-rec-status').textContent = '🔴 0s / 20s';
    document.getElementById('btn-stop-video').style.display = '';
    document.getElementById('btn-start-video').style.display = 'none';
    videoTimer = setInterval(() => {
      videoSeconds++;
      document.getElementById('video-rec-status').textContent = `🔴 ${videoSeconds}s / 20s`;
      if (videoSeconds >= 20) stopVideoRec();
    }, 1000);
  } catch (e) { alert('Caméra non disponible : ' + e.message); }
};
window.stopVideoRec = function() {
  clearInterval(videoTimer);
  if (videoRecorder?.state !== 'inactive') videoRecorder.stop();
  document.getElementById('btn-stop-video').style.display = 'none';
  document.getElementById('btn-start-video').style.display = '';
};
window.importVideo = function() { document.getElementById('video-file-input').click(); };
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('video-file-input');
  if (inp) inp.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 10 * 1024 * 1024) { alert('Vidéo trop grande (max 10 Mo)'); return; }
    const url = URL.createObjectURL(f);
    CVB.data.media.video = url;
    document.getElementById('video-player').src = url;
    document.getElementById('video-player').style.display = 'block';
    render(); CVB.dirty = true;
  });
});
window.removeVideo = function() {
  CVB.data.media.video = null;
  document.getElementById('video-player').src = '';
  document.getElementById('video-player').style.display = 'none';
  document.getElementById('video-rec-status').textContent = '';
  render(); CVB.dirty = true;
};

/* ═══════════════════════════════════════════
   QR CODE
═══════════════════════════════════════════ */
window.generateQR = function() {
  const url = CVB.id
    ? `${location.origin}/cv-view.html?id=${CVB.id}`
    : location.href;
  const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  document.getElementById('qr-img').src = apiUrl;
  document.getElementById('qr-img').style.display = 'block';
  document.getElementById('qr-url').textContent = url;
  CVB.data.media.qr = { enabled: true, url };
  render(); CVB.dirty = true;
};
window.toggleQR = function(enabled) {
  CVB.data.media.qr = { ...CVB.data.media.qr, enabled };
  render(); CVB.dirty = true;
};

/* ═══════════════════════════════════════════
   VERSION HISTORY
═══════════════════════════════════════════ */
window.openHistory = async function() {
  const m = document.getElementById('modal-history');
  if (m) m.style.display = 'flex';
  await saveCV(true); // force save = save version
  const el = document.getElementById('history-list');
  if (!el) return;
  if (!CVB.historyVersions.length) {
    el.innerHTML = '<p style="color:#888;font-size:13px;">Aucune version enregistrée.</p>';
    return;
  }
  el.innerHTML = CVB.historyVersions.map((v, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid #eee;border-radius:8px;margin-bottom:8px;">
      <div>
        <div style="font-weight:700;font-size:.87rem;">Version ${CVB.historyVersions.length - i}</div>
        <div style="font-size:.75rem;color:#888;">${new Date(v.saved_at).toLocaleString('fr-FR')}</div>
      </div>
      <button class="btn btn-sm btn-outline" onclick="restoreVersion(${i})">↩ Restaurer</button>
    </div>`).join('');
};
window.restoreVersion = function(i) {
  const v = CVB.historyVersions[i];
  if (!v) return;
  if (!confirm('Restaurer cette version ? Les modifications actuelles seront perdues.')) return;
  CVB.data = deepMerge(CVB.data, v.data);
  syncFormFromData();
  render(); CVB.dirty = true;
  closeHistory();
  saveCV();
};
window.closeHistory = function() {
  const m = document.getElementById('modal-history');
  if (m) m.style.display = 'none';
};

/* ═══════════════════════════════════════════
   EXPORT PDF
═══════════════════════════════════════════ */
window.exportPDF = function() {
  const sheet = document.getElementById('cv-sheet');
  const clone = sheet.cloneNode(true);
  clone.id = 'cv-print-target';
  clone.style.cssText = 'position:fixed;top:0;left:0;width:210mm;z-index:99999;display:block;box-shadow:none;';
  document.body.appendChild(clone);
  window.print();
  document.body.removeChild(clone);
};

/* ═══════════════════════════════════════════
   EXPORT WORD (.doc HTML trick)
═══════════════════════════════════════════ */
window.exportWord = function() {
  collectFormData();
  const tmpl = CV_TEMPLATES[CVB.data.meta.template] || CV_TEMPLATES['moderne'];
  const cvHtml = tmpl.render(CVB.data, CVB.data.style);
  const html = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<title>${CVB.data.meta.titre || 'CV'}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  body { font-family: ${CVB.data.style.font || 'Arial'}, sans-serif; font-size: ${CVB.data.style.fontSize || 11}pt; }
  * { box-sizing: border-box; }
</style>
</head>
<body>${cvHtml}</body>
</html>`;
  const blob = new Blob([html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(CVB.data.meta.titre || 'CV').replace(/\s+/g, '_')}.doc`;
  a.click();
};

/* ═══════════════════════════════════════════
   UTILS
═══════════════════════════════════════════ */
function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function deepMerge(target, source) {
  const out = { ...target };
  for (const k in source) {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      out[k] = deepMerge(target[k] || {}, source[k]);
    } else if (source[k] !== undefined && source[k] !== null && source[k] !== '') {
      out[k] = source[k];
    }
  }
  return out;
}

/* Fermer modals en cliquant backdrop */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-backdrop').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
  });
});
