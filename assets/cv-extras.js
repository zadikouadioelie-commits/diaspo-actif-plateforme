/* ══════════════════════════════════════════════════════════════════════════
   assets/cv-extras.js — Éditeur de CV : zones de texte, médias, QR, partage du PDF (2026-10-09)
   Chargé par cv-builder.html APRÈS assets/cv-builder.js (qui fournit CVB, render(), saveCV()...).
   ══════════════════════════════════════════════════════════════════════════ */
window.CvX = (function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const $ = id => document.getElementById(id);
  const X = { medias: [], qrImg: '', maxMedias: 30 };

  /* ───────────────────────── Texte enrichi ───────────────────────── */
  function legacyToHtml(v) {
    v = String(v == null ? '' : v);
    if (!v.trim()) return '';
    if (/<\/?[a-z][\s\S]*?>/i.test(v)) return v;
    return v.split(/\r?\n+/).map(l => '<p>' + esc(l) + '</p>').join('');
  }
  /* La pose d'un éditeur dispatche un évènement « input » : il ne doit ni déclencher l'auto-sauvegarde ni
     marquer le CV comme modifié. */
  function silencieux(fn) {
    const dirty = CVB.dirty; CVB.silent = true;
    try { fn(); } finally { CVB.silent = false; CVB.dirty = dirty; }
  }
  X.attachRich = function (id, placeholder) {
    const ta = $(id);
    if (!ta || !window.RichEditor) return null;
    ta.value = legacyToHtml(ta.value);
    let inst = null;
    silencieux(() => { inst = RichEditor.attach(ta, { placeholder: placeholder || 'Écrivez ici…' }); });
    return inst;
  };
  X.setRich = function (id, html) {
    const ta = $(id);
    if (!ta) return;
    const h = legacyToHtml(html);
    if (ta._richEditorInstance) silencieux(() => ta._richEditorInstance.setHTML(h));
    else ta.value = h;
  };

  /* ───────────────────────── Zones de texte (titre + texte) ───────────────────────── */
  X.renderBlocs = function () {
    const el = $('bloc-list');
    if (!el) return;
    const blocs = CVB.data.blocs || (CVB.data.blocs = []);
    el.innerHTML = blocs.length ? blocs.map((b, i) => `
      <div class="repeater-item">
        <div class="repeater-controls">
          <button type="button" onclick="CvX.moveBloc(${i},-1)" title="Monter" aria-label="Monter cette zone">↑</button>
          <button type="button" onclick="CvX.moveBloc(${i},1)" title="Descendre" aria-label="Descendre cette zone">↓</button>
          <button type="button" onclick="CvX.removeBloc(${i})" class="btn-remove" title="Supprimer cette zone" aria-label="Supprimer cette zone">×</button>
        </div>
        <label for="bloc-titre-${i}">Titre de la zone</label>
        <input id="bloc-titre-${i}" type="text" maxlength="120" value="${esc(b.titre)}" placeholder="Ex : Projets personnels" oninput="CVB.data.blocs[${i}].titre=this.value;render();CVB.dirty=true;">
        <label for="bloc-texte-${i}" style="margin-top:6px;">Texte</label>
        <textarea id="bloc-texte-${i}" rows="3" oninput="CVB.data.blocs[${i}].texte=this.value;render();CVB.dirty=true;">${esc(b.texte)}</textarea>
      </div>`).join('') : '<p style="font-size:.76rem;color:#888;margin-bottom:8px;">Un rectangle libre avec un titre et un texte, à placer dans votre CV.</p>';
    blocs.forEach((b, i) => X.attachRich('bloc-texte-' + i, 'Le texte de votre zone…'));
  };
  X.addBloc = function () {
    const blocs = CVB.data.blocs || (CVB.data.blocs = []);
    if (blocs.length >= 12) { alert('12 zones de texte au maximum.'); return; }
    blocs.push({ id: Date.now(), titre: '', texte: '' });
    X.renderBlocs(); render(); CVB.dirty = true;
    const t = $('bloc-titre-' + (blocs.length - 1)); if (t) t.focus();
  };
  X.removeBloc = function (i) {
    if (!confirm('Supprimer cette zone de texte ?')) return;
    CVB.data.blocs.splice(i, 1); X.renderBlocs(); render(); CVB.dirty = true;
  };
  X.moveBloc = function (i, dir) {
    const a = CVB.data.blocs;
    if (i + dir < 0 || i + dir >= a.length) return;
    [a[i], a[i + dir]] = [a[i + dir], a[i]];
    X.renderBlocs(); render(); CVB.dirty = true;
  };

  /* ───────────────────────── QR code + lien de la page publique ───────────────────────── */
  function chargerQRLib() {
    return new Promise((ok, ko) => {
      if (window.QRCode) return ok();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.onload = ok; s.onerror = ko; document.head.appendChild(s);
    });
  }
  /* Le QR est dessiné dans le navigateur : l'adresse (privée) du CV n'est jamais envoyée à un service tiers. */
  X.qrDataUrl = async function (texte) {
    await chargerQRLib();
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(box);
    try {
      new window.QRCode(box, { text: texte, width: 256, height: 256, colorDark: '#000000', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
      const canvas = box.querySelector('canvas');
      if (canvas) return canvas.toDataURL('image/png');
      const img = box.querySelector('img');
      return img ? img.src : '';
    } finally { box.remove(); }
  };
  X.lienPublic = function () { return CVB.token ? `${location.origin}/cv-public.html?t=${encodeURIComponent(CVB.token)}` : ''; };
  X.nbMediasLies = function () {
    const n = Number(CVB.data.meta.numero) || 1;
    return X.medias.filter(m => (m.numeros || []).includes(n)).length;
  };
  /* Vue envoyée aux gabarits : données du CV + (jamais enregistré) image du QR. edit=true : propositions photo. */
  X.vue = function (edit) {
    const qr = CVB.data.media?.qr || {};
    return { ...CVB.data, _edit: !!edit, media: { ...CVB.data.media, qr: { ...qr, img: X.qrImg, medias: X.nbMediasLies() } } };
  };
  X.appliquerJeton = async function (jeton) {
    CVB.token = jeton;
    const url = X.lienPublic();
    const q = CVB.data.media.qr || {};
    CVB.data.media.qr = { enabled: q.enabled !== false, url };
    try { X.qrImg = await X.qrDataUrl(url); } catch (e) { X.qrImg = ''; }
    const img = $('qr-img');
    if (img && X.qrImg) { img.src = X.qrImg; img.style.display = 'block'; }
    const u = $('qr-url'); if (u) u.textContent = url;
    const lien = $('qr-lien-actions'); if (lien) lien.style.display = '';
    render();
  };
  X.regenererLien = async function () {
    if (!CVB.id) { alert('Enregistrez d\'abord votre CV.'); return; }
    if (!confirm('Créer un nouveau lien ? L\'ancien QR code et les anciens liens déjà envoyés cesseront de fonctionner.')) return;
    const r = await post('/api/cv/partage', { numero: CVB.data.meta.numero, action: 'regenerer' });
    if (r.jeton) { await X.appliquerJeton(r.jeton); CVB.dirty = true; saveCV(); X.statutLien(true); }
    else alert(r.error || 'Impossible de créer un nouveau lien.');
  };
  X.basculerLien = async function () {
    if (!CVB.id) { alert('Enregistrez d\'abord votre CV.'); return; }
    const actif = CVB.lienActif !== false;
    if (actif && !confirm('Désactiver la page publique de ce CV ? Le QR code et les liens envoyés n\'ouvriront plus rien jusqu\'à sa réactivation.')) return;
    const r = await post('/api/cv/partage', { numero: CVB.data.meta.numero, action: actif ? 'desactiver' : 'activer' });
    if (r.jeton) X.statutLien(r.actif); else alert(r.error || 'Action impossible.');
  };
  X.statutLien = function (actif) {
    CVB.lienActif = actif;
    const b = $('btn-lien-bascule'); if (b) b.textContent = actif ? '⏸ Désactiver la page publique' : '▶ Réactiver la page publique';
    const t = $('lien-statut'); if (t) { t.textContent = actif ? 'Page publique active' : 'Page publique désactivée'; t.style.color = actif ? '#27ae60' : '#e74c3c'; }
  };

  /* ───────────────────────── Appels réseau ───────────────────────── */
  async function appel(method, url, body) {
    const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok && !j.error) j.error = 'Erreur ' + r.status;
    j._status = r.status;
    return j;
  }
  const post = (u, b) => appel('POST', u, b);

  /* ───────────────────────── Bibliothèque de médias ───────────────────────── */
  X.msg = function (texte, ok) {
    const el = $('cvx-msg'); if (!el) return;
    el.textContent = texte || ''; el.style.color = ok === false ? '#e74c3c' : '#27ae60';
    el.style.display = texte ? 'block' : 'none';
    if (texte) { clearTimeout(X._tmsg); X._tmsg = setTimeout(() => { el.style.display = 'none'; }, 5000); }
  };
  X.chargerMedias = async function () {
    if (!CVB.userId) { X.renderMedias(); return; }
    const j = await appel('GET', '/api/cv-medias');
    if (j.medias) { X.medias = j.medias; X.maxMedias = j.max || 30; }
    X.renderMedias(); render();
  };
  X.renderMedias = function () {
    const el = $('media-lib'); if (!el) return;
    const num = Number(CVB.data.meta.numero) || 1;
    if (!CVB.userId) { el.innerHTML = '<p class="cvx-vide">Connectez-vous pour ajouter des médias à votre CV.</p>'; return; }
    if (!X.medias.length) { el.innerHTML = '<p class="cvx-vide">Aucun média pour l\'instant. Ajoutez une vidéo de 30 secondes ou jusqu\'à 4 images : elles s\'ouvrent depuis le QR code ou le bouton « Accéder aux médias » de votre CV.</p>'; return; }
    el.innerHTML = X.medias.map(m => {
      const lie = (m.numeros || []).includes(num);
      const miniature = m.kind === 'video'
        ? `<video preload="metadata" muted playsinline src="${esc(m.urls[0] || '')}#t=0.5" aria-hidden="true"></video><span class="cvx-badge">▶ ${m.duree_s ? m.duree_s + ' s' : 'Vidéo'}</span>`
        : `<img loading="lazy" src="${esc(m.urls[0] || '')}" alt=""><span class="cvx-badge">🖼 ${m.urls.length}</span>`;
      const puces = [1, 2].map(n => `<span class="cvx-puce ${(m.numeros || []).includes(n) ? 'on' : ''}">CV n°${n}</span>`).join('');
      return `<div class="cvx-media ${lie ? 'lie' : ''}">
        <div class="cvx-thumb">${miniature}</div>
        <div class="cvx-media-corps">
          <input class="cvx-titre" value="${esc(m.titre)}" maxlength="80" aria-label="Titre du média" onchange="CvX.renommer(${m.id},this.value)">
          <div class="cvx-puces">${puces}</div>
          <div class="cvx-actions">
            ${lie ? `<button type="button" onclick="CvX.lier(${m.id},false)">✂️ Délier de ce CV</button>` : `<button type="button" class="prim" onclick="CvX.lier(${m.id},true)">🔗 Lier à ce CV (n°${num})</button>`}
            <button type="button" class="dang" onclick="CvX.supprimer(${m.id})">🗑 Supprimer pour tous les CV</button>
          </div>
        </div>
      </div>`;
    }).join('');
  };
  X.lier = async function (id, lier) {
    const m = X.medias.find(x => x.id === id); if (!m) return;
    const num = Number(CVB.data.meta.numero) || 1;
    const set = new Set(m.numeros || []); lier ? set.add(num) : set.delete(num);
    const r = await appel('PUT', '/api/cv-medias/' + id, { numeros: [...set] });
    if (r.ok) { m.numeros = [...set].sort(); X.renderMedias(); render(); X.msg(lier ? 'Média lié à ce CV.' : 'Média délié de ce CV (il reste dans votre bibliothèque).'); }
    else X.msg(r.error || 'Action impossible.', false);
  };
  X.renommer = async function (id, titre) {
    const r = await appel('PUT', '/api/cv-medias/' + id, { titre });
    if (r.ok) { const m = X.medias.find(x => x.id === id); if (m) m.titre = titre.trim().slice(0, 80); }
  };
  X.supprimer = async function (id) {
    if (!confirm('Supprimer ce média de TOUS vos CV ? Cette action est définitive.')) return;
    const r = await appel('DELETE', '/api/cv-medias/' + id);
    if (r.deleted) { X.medias = X.medias.filter(m => m.id !== id); X.renderMedias(); render(); X.msg('Média supprimé de tous vos CV.'); }
    else X.msg(r.error || 'Suppression impossible.', false);
  };

  /* ── Fenêtre « Ajouter un média » : une vidéo de 30 s OU 1 à 4 images ── */
  const DUREE_MAX = 30;
  let ajout = null; // état de la fenêtre

  async function televerser(fichier, nom) {
    const fd = new FormData();
    fd.append('cv-media', fichier, nom || fichier.name || 'media');
    const r = await fetch('/api/upload/cv-media', { method: 'POST', body: fd, credentials: 'include' });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(j.error || ('Envoi refusé (' + r.status + ')'));
    return j.url;
  }
  function dureeVideo(fichier) {
    return new Promise((ok, ko) => {
      const v = document.createElement('video'); v.preload = 'metadata';
      const url = URL.createObjectURL(fichier);
      v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(url); ok(isFinite(d) ? d : 0); };
      v.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Vidéo illisible.')); };
      v.src = url;
    });
  }
  function fermerAjout() {
    if (ajout?.flux) ajout.flux.getTracks().forEach(t => t.stop());
    clearInterval(ajout?.timer);
    const m = $('modal-add-media'); if (m) m.style.display = 'none';
    ajout = null;
  }
  X.fermerAjout = fermerAjout;
  function modalAjout() {
    let m = $('modal-add-media');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'modal-backdrop'; m.id = 'modal-add-media';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'am-titre');
    m.innerHTML = '<div class="modal-box" style="max-width:480px;"><button class="modal-close" aria-label="Fermer" onclick="CvX.fermerAjout()">×</button><div id="am-corps"></div></div>';
    document.body.appendChild(m);
    return m;
  }
  X.ouvrirAjout = function () {
    if (!CVB.userId) { alert('Connectez-vous pour ajouter un média.'); return; }
    if (X.medias.length >= X.maxMedias) { alert('Limite de ' + X.maxMedias + ' médias atteinte : supprimez-en avant d\'en ajouter.'); return; }
    ajout = { type: null, fichiers: [], video: null, duree: 0 };
    modalAjout().style.display = 'flex';
    X.etapeChoix();
  };
  X.etapeChoix = function () {
    $('am-corps').innerHTML = `
      <div class="modal-title" id="am-titre">➕ Ajouter un média</div>
      <p style="font-size:.8rem;color:#666;margin-bottom:12px;">Il s'ouvrira depuis le QR code ou le bouton « Accéder aux médias » de votre CV, avec le CV lui-même.</p>
      <div class="cvx-choix">
        <button type="button" onclick="CvX.etapeVideo()"><span style="font-size:1.6rem;">🎬</span><strong>Une vidéo</strong><small>30 secondes maximum</small></button>
        <button type="button" onclick="CvX.etapeImages()"><span style="font-size:1.6rem;">🖼</span><strong>Des images</strong><small>de 1 à 4 images</small></button>
      </div>`;
  };
  function piedAjout() {
    const num = Number(CVB.data.meta.numero) || 1, autre = num === 1 ? 2 : 1;
    return `<label for="am-nom" style="margin-top:12px;">Titre (facultatif)</label>
      <input id="am-nom" type="text" maxlength="80" placeholder="Ex : Ma présentation">
      <div style="margin:10px 0 4px;font-size:.78rem;font-weight:600;color:#555;">Lier à :</div>
      <label style="display:flex;gap:8px;align-items:center;font-weight:500;"><input type="checkbox" id="am-l-${num}" checked> Ce CV (n°${num})</label>
      <label style="display:flex;gap:8px;align-items:center;font-weight:500;"><input type="checkbox" id="am-l-${autre}"> L'autre CV (n°${autre})</label>
      <div id="am-etat" role="status" aria-live="polite" style="font-size:.78rem;min-height:18px;margin-top:8px;color:#888;"></div>
      <div class="modal-actions"><button type="button" class="btn btn-primary" id="am-ok" onclick="CvX.enregistrerAjout()">✓ Enregistrer</button><button type="button" class="btn btn-outline" onclick="CvX.etapeChoix()">← Retour</button></div>`;
  }
  X.etapeVideo = function () {
    ajout.type = 'video'; ajout.video = null; ajout.duree = 0;
    $('am-corps').innerHTML = `
      <div class="modal-title" id="am-titre">🎬 Vidéo de ${DUREE_MAX} secondes</div>
      <div class="cvx-choix">
        <button type="button" onclick="document.getElementById('am-fichier').click()"><span style="font-size:1.4rem;">📁</span><strong>Importer</strong><small>un fichier vidéo</small></button>
        <button type="button" onclick="CvX.filmer()"><span style="font-size:1.4rem;">🔴</span><strong>Filmer</strong><small>avec la caméra</small></button>
      </div>
      <input type="file" id="am-fichier" accept="video/mp4,video/webm,video/quicktime,video/*" style="display:none">
      <video id="am-apercu" controls playsinline style="display:none;width:100%;max-height:220px;border-radius:8px;margin-top:10px;background:#000;"></video>
      <video id="am-direct" autoplay muted playsinline style="display:none;width:100%;max-height:220px;border-radius:8px;margin-top:10px;background:#000;"></video>
      <div id="am-chrono" style="font-size:.8rem;margin-top:6px;"></div>
      <div id="am-suite">${piedAjout()}</div>`;
    $('am-ok').disabled = true;
    $('am-fichier').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const d = await dureeVideo(f);
        if (d > DUREE_MAX + 0.5) { $('am-etat').textContent = `Cette vidéo dure ${Math.round(d)} s : ${DUREE_MAX} secondes au maximum.`; $('am-etat').style.color = '#e74c3c'; return; }
        if (f.size > 25 * 1024 * 1024) { $('am-etat').textContent = 'Vidéo trop lourde (25 Mo maximum).'; $('am-etat').style.color = '#e74c3c'; return; }
        ajout.video = f; ajout.duree = Math.round(d);
        const ap = $('am-apercu'); ap.src = URL.createObjectURL(f); ap.style.display = 'block';
        $('am-etat').textContent = ''; $('am-ok').disabled = false;
      } catch (err) { $('am-etat').textContent = err.message; $('am-etat').style.color = '#e74c3c'; }
    };
  };
  X.filmer = async function () {
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: true });
      ajout.flux = flux;
      const direct = $('am-direct'); direct.srcObject = flux; direct.style.display = 'block';
      $('am-apercu').style.display = 'none';
      const morceaux = [];
      const opts = { videoBitsPerSecond: 900000 };
      const rec = new MediaRecorder(flux, opts);
      rec.ondataavailable = e => { if (e.data.size) morceaux.push(e.data); };
      const debut = Date.now();
      rec.onstop = () => {
        flux.getTracks().forEach(t => t.stop()); clearInterval(ajout.timer);
        const dureeS = Math.min(DUREE_MAX, Math.round((Date.now() - debut) / 1000));
        const blob = new Blob(morceaux, { type: 'video/webm' });
        ajout.video = new File([blob], 'cv-video.webm', { type: 'video/webm' }); ajout.duree = dureeS; ajout.flux = null;
        direct.style.display = 'none'; direct.srcObject = null;
        const ap = $('am-apercu'); ap.src = URL.createObjectURL(blob); ap.style.display = 'block';
        $('am-chrono').innerHTML = '✅ Vidéo prête (' + dureeS + ' s) <button type="button" class="btn btn-outline btn-sm" onclick="CvX.filmer()">Refaire</button>';
        $('am-ok').disabled = false;
      };
      rec.start();
      ajout.rec = rec;
      const maj = () => {
        const s = Math.floor((Date.now() - debut) / 1000);
        $('am-chrono').innerHTML = `🔴 ${s} s / ${DUREE_MAX} s <button type="button" class="btn btn-red btn-sm" onclick="CvX.arreterFilm()">⏹ Arrêter</button>`;
        if (s >= DUREE_MAX) X.arreterFilm();
      };
      maj(); ajout.timer = setInterval(maj, 500);
      $('am-ok').disabled = true;
    } catch (e) { $('am-etat').textContent = 'Caméra indisponible : ' + e.message; $('am-etat').style.color = '#e74c3c'; }
  };
  X.arreterFilm = function () { if (ajout?.rec && ajout.rec.state !== 'inactive') ajout.rec.stop(); };

  X.etapeImages = function () {
    ajout.type = 'galerie'; ajout.fichiers = [];
    $('am-corps').innerHTML = `
      <div class="modal-title" id="am-titre">🖼 Images (1 à 4)</div>
      <button type="button" class="btn btn-outline" style="width:100%;" onclick="document.getElementById('am-images').click()">📁 Choisir des images</button>
      <input type="file" id="am-images" accept="image/*" multiple style="display:none">
      <div id="am-miniatures" class="cvx-miniatures"></div>
      <div id="am-suite">${piedAjout()}</div>`;
    $('am-ok').disabled = true;
    $('am-images').onchange = e => {
      const nouveaux = [...e.target.files].filter(f => /^image\//.test(f.type));
      for (const f of nouveaux) { if (ajout.fichiers.length < 4) ajout.fichiers.push(f); }
      if (nouveaux.length + ajout.fichiers.length > 4 && ajout.fichiers.length >= 4) { $('am-etat').textContent = '4 images au maximum : les suivantes ont été ignorées.'; $('am-etat').style.color = '#e67e22'; }
      e.target.value = ''; X.dessinerMiniatures();
    };
  };
  X.dessinerMiniatures = function () {
    const el = $('am-miniatures'); if (!el) return;
    el.innerHTML = ajout.fichiers.map((f, i) => `<div class="cvx-mini"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" aria-label="Retirer cette image" onclick="CvX.retirerImage(${i})">×</button></div>`).join('');
    $('am-ok').disabled = !ajout.fichiers.length;
  };
  X.retirerImage = function (i) { ajout.fichiers.splice(i, 1); X.dessinerMiniatures(); };

  X.enregistrerAjout = async function () {
    const etat = $('am-etat'), ok = $('am-ok');
    const numeros = [1, 2].filter(n => $('am-l-' + n)?.checked);
    const titre = ($('am-nom')?.value || '').trim();
    const fail = t => { etat.textContent = t; etat.style.color = '#e74c3c'; ok.disabled = false; };
    ok.disabled = true; etat.style.color = '#888';
    try {
      let urls = [];
      if (ajout.type === 'video') {
        if (!ajout.video) return fail('Choisissez ou filmez une vidéo.');
        etat.textContent = 'Envoi de la vidéo…';
        urls = [await televerser(ajout.video, ajout.video.name)];
      } else {
        if (!ajout.fichiers.length) return fail('Choisissez au moins une image.');
        for (let i = 0; i < ajout.fichiers.length; i++) {
          etat.textContent = `Envoi de l'image ${i + 1} / ${ajout.fichiers.length}…`;
          let f = ajout.fichiers[i];
          if (window.compressImageFile) { try { f = await compressImageFile(f, 1600, 1600, 0.85); } catch (e) {} }
          urls.push(await televerser(f, f.name));
        }
      }
      etat.textContent = 'Enregistrement…';
      const r = await post('/api/cv-medias', { kind: ajout.type, titre, urls, duree_s: ajout.duree, numeros });
      if (!r.id) return fail(r.error || 'Enregistrement impossible.');
      fermerAjout();
      await X.chargerMedias();
      X.msg('Média ajouté.' + (numeros.length ? '' : ' Il n\'est lié à aucun CV pour l\'instant.'));
    } catch (e) { fail(e.message || 'Envoi impossible.'); }
  };

  /* ───────────────────────── PDF et partage ───────────────────────── */
  X.genererPDF = function () {
    const sheet = $('cv-sheet');
    const clone = sheet.cloneNode(true);
    clone.querySelectorAll('[data-nopdf]').forEach(n => n.remove());
    clone.style.cssText = 'width:210mm;box-shadow:none;';
    return html2pdf().set({
      margin: 0, image: { type: 'jpeg', quality: 0.9 }, html2canvas: { scale: 1.5, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] }, enableLinks: true,
    }).from(clone).outputPdf('blob');
  };
  function nomFichier() { return ((CVB.data.meta.titre || 'CV').replace(/[^a-zA-Z0-9À-ÿ_-]+/g, '_') || 'CV') + '.pdf'; }
  async function attendreSauvegarde() {
    for (let i = 0; i < 40 && CVB.saving; i++) await new Promise(r => setTimeout(r, 150));
    if (CVB.dirty || !CVB.id) { clearTimeout(CVB.autoSaveTimer); collectFormData(); await saveCV(); }
    for (let i = 0; i < 40 && CVB.saving; i++) await new Promise(r => setTimeout(r, 150));
  }
  let cachePDF = null;
  async function preparerPDF(etat) {
    if (typeof html2pdf === 'undefined') throw new Error('Le générateur de PDF n\'est pas disponible. Vérifiez votre connexion.');
    etat('Enregistrement de votre CV…');
    await attendreSauvegarde();
    if (!CVB.token) throw new Error('Enregistrez d\'abord votre CV (connexion requise).');
    await X.chargerMedias();
    const cle = JSON.stringify(CVB.data) + '|' + X.nbMediasLies() + '|' + (X.qrImg ? 1 : 0);
    if (cachePDF && cachePDF.cle === cle) return cachePDF;
    etat('Création du PDF…');
    const blob = await X.genererPDF();
    const fichier = new File([blob], nomFichier(), { type: 'application/pdf' });
    if (fichier.size > 14 * 1024 * 1024) throw new Error('Le PDF est trop volumineux (15 Mo maximum).');
    etat('Envoi du PDF…');
    const url = await uploadMedia(fichier, 'document');
    cachePDF = { cle, url, fichier };
    return cachePDF;
  }
  X.telechargerPDF = function () { exportPDF(); };

  /* — Fenêtre de partage — */
  let dest = { compte: null, email: '' }, suggTimer = null;
  function modalPartage() {
    let m = $('modal-share'); if (m) return m;
    m = document.createElement('div');
    m.className = 'modal-backdrop'; m.id = 'modal-share';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'sh-titre');
    m.innerHTML = `<div class="modal-box" style="max-width:500px;">
      <button class="modal-close" aria-label="Fermer" onclick="CvX.fermerPartage()">×</button>
      <div class="modal-title" id="sh-titre">📤 Partager mon CV en PDF</div>
      <label for="sh-dest">Destinataire</label>
      <div style="position:relative;">
        <div id="sh-chip" style="display:none;"></div>
        <input id="sh-dest" type="text" autocomplete="off" placeholder="@nom d'un compte Diaspo'Actif, ou adresse e-mail" aria-autocomplete="list" aria-controls="sh-sugg">
        <div id="sh-sugg" class="cvx-sugg" role="listbox" style="display:none;"></div>
      </div>
      <div style="font-size:.72rem;color:#888;margin:4px 0 10px;">Tapez <strong>@</strong> puis un nom pour choisir un compte Diaspo'Actif, ou saisissez une adresse e-mail.</div>
      <label for="sh-msg">Message (facultatif)</label>
      <textarea id="sh-msg" rows="2" maxlength="500" placeholder="Un mot pour accompagner votre CV…"></textarea>
      <div id="sh-info" style="font-size:.76rem;color:#555;background:#f3f6fb;border-radius:8px;padding:8px 10px;margin-top:10px;"></div>
      <div id="sh-etat" role="status" aria-live="polite" style="font-size:.8rem;min-height:20px;margin-top:8px;"></div>
      <div class="cvx-partage-actions">
        <button type="button" class="btn btn-primary" id="sh-envoyer" onclick="CvX.envoyerPartage()">Envoyer</button>
        <button type="button" class="btn" id="sh-wa" style="background:#25D366;color:#fff;" onclick="CvX.partagerWhatsApp()">WhatsApp</button>
        <button type="button" class="btn btn-outline" onclick="CvX.copierLien()">🔗 Copier le lien</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    const champ = $('sh-dest');
    champ.addEventListener('input', () => { clearTimeout(suggTimer); suggTimer = setTimeout(suggerer, 220); majBoutons(); });
    champ.addEventListener('keydown', e => { if (e.key === 'Escape') cacherSugg(); });
    champ.addEventListener('blur', () => setTimeout(cacherSugg, 180));
    return m;
  }
  function cacherSugg() { const s = $('sh-sugg'); if (s) s.style.display = 'none'; }
  function majBoutons() {
    const champ = $('sh-dest'), v = champ ? champ.value.trim() : '';
    const b = $('sh-envoyer'); if (!b) return;
    if (dest.compte) b.textContent = 'Envoyer sur Diaspo\'Actif';
    else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) b.textContent = 'Envoyer par e-mail';
    else b.textContent = 'Envoyer';
  }
  async function suggerer() {
    const champ = $('sh-dest'), box = $('sh-sugg'); if (!champ) return;
    const v = champ.value.trim();
    if (dest.compte) return;
    const q = v.replace(/^@/, '');
    if (q.length < 2 || /^[^@\s]+@[^@\s]+/.test(v) || /\s{2,}/.test(v)) { cacherSugg(); return; }
    const j = await appel('GET', '/api/users/search?q=' + encodeURIComponent(q));
    const liste = (j.users || []).slice(0, 6);
    if (!liste.length) { box.innerHTML = '<div class="cvx-sugg-vide">Aucun compte trouvé. Vous pouvez saisir une adresse e-mail.</div>'; box.style.display = 'block'; return; }
    const roles = { utilisateur: 'Membre', initiative: 'Organisation', collectivite: 'Collectivité', administrateur: 'Admin' };
    box.innerHTML = liste.map((u, i) => {
      const nom = u.role === 'utilisateur' ? [u.prenom, u.nom].filter(Boolean).join(' ') : (u.init_nom || u.nom);
      return `<button type="button" role="option" class="cvx-sugg-item" data-i="${i}"><span class="cvx-av">${esc((nom || '?').trim()[0] || '?').toUpperCase()}</span><span><strong>${esc(nom)}</strong><small>${esc(roles[u.role] || u.role || '')}</small></span></button>`;
    }).join('');
    box.style.display = 'block';
    box.querySelectorAll('.cvx-sugg-item').forEach(b => b.addEventListener('mousedown', e => {
      e.preventDefault();
      const u = liste[Number(b.dataset.i)];
      const nom = u.role === 'utilisateur' ? [u.prenom, u.nom].filter(Boolean).join(' ') : (u.init_nom || u.nom);
      choisirCompte({ id: u.id, nom });
    }));
  }
  function choisirCompte(c) {
    dest.compte = c; const champ = $('sh-dest'), chip = $('sh-chip');
    champ.value = ''; champ.style.display = 'none'; cacherSugg();
    chip.style.display = 'flex';
    chip.innerHTML = `<span>@${esc(c.nom)}</span><button type="button" aria-label="Retirer ce destinataire" onclick="CvX.retirerDest()">×</button>`;
    majBoutons();
  }
  X.retirerDest = function () {
    dest.compte = null; const champ = $('sh-dest'); champ.style.display = ''; $('sh-chip').style.display = 'none'; champ.focus(); majBoutons();
  };
  X.ouvrirPartage = function () {
    if (!CVB.userId) { alert('Connectez-vous pour partager votre CV.'); return; }
    dest = { compte: null, email: '' };
    const m = modalPartage(); m.style.display = 'flex';
    const champ = $('sh-dest'); champ.value = ''; champ.style.display = ''; $('sh-chip').style.display = 'none'; $('sh-etat').textContent = ''; majBoutons();
    const n = X.nbMediasLies();
    $('sh-info').innerHTML = n > 0
      ? `Le message contiendra le bouton <strong>▶ Accéder aux médias</strong> (${n} média${n > 1 ? 's' : ''} lié${n > 1 ? 's' : ''} à ce CV), en plus du PDF.`
      : 'Aucun média n\'est lié à ce CV : le lien ouvrira seulement votre CV en ligne. Ajoutez-en depuis l\'onglet <strong>Médias</strong>.';
    champ.focus();
  };
  X.fermerPartage = function () { const m = $('modal-share'); if (m) m.style.display = 'none'; };
  function etatPartage(t, ok) { const e = $('sh-etat'); if (e) { e.textContent = t || ''; e.style.color = ok === false ? '#e74c3c' : (ok === true ? '#27ae60' : '#666'); } }
  function textePartage(pdf) {
    const n = X.nbMediasLies();
    const nom = [CVB.data.infos?.prenom, CVB.data.infos?.nom].filter(Boolean).join(' ');
    const msg = ($('sh-msg')?.value || '').trim();
    return [msg, `${nom ? 'CV de ' + nom : 'Mon CV'}`, pdf ? `📄 PDF : ${pdf}` : '', `${n > 0 ? '▶ Accéder aux médias' : '👀 Voir le CV en ligne'} : ${X.lienPublic()}${n > 0 ? '&vue=medias' : ''}`].filter(Boolean).join('\n');
  }
  X.envoyerPartage = async function () {
    const bouton = $('sh-envoyer'); const v = ($('sh-dest').value || '').trim();
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : '';
    if (!dest.compte && !email) { etatPartage('Choisissez un compte (tapez @ puis un nom) ou saisissez une adresse e-mail.', false); return; }
    bouton.disabled = true;
    try {
      const pdf = await preparerPDF(t => etatPartage(t));
      const num = CVB.data.meta.numero;
      if (dest.compte) {
        etatPartage('Envoi à ' + dest.compte.nom + '…');
        const c = await post('/api/conversations', { user_id: dest.compte.id, origine: 'cv' });
        if (!c.conversation_id) {
          if (c.code === 'contact_requis') {
            etatPartage('Vous devez d\'abord établir le contact avec ' + dest.compte.nom + ' (demande de contact depuis son profil) avant de pouvoir lui écrire.', false);
          } else etatPartage(c.error || 'Envoi impossible.', false);
          return;
        }
        const fichier = { nom: pdf.fichier.name, url: pdf.url, taille: pdf.fichier.size, mime: 'application/pdf', isImage: false };
        const r = await post('/api/conversations/' + c.conversation_id + '/messages', { contenu: textePartage(null), type: 'file', fichier });
        if (!r.message) { etatPartage(r.error || 'Envoi impossible.', false); return; }
        post('/api/cv/partage-journal', { canal: 'diaspoactif', numero: num, destinataire: String(dest.compte.id) });
        etatPartage('✅ CV envoyé à ' + dest.compte.nom + ' dans sa messagerie.', true);
      } else {
        etatPartage('Envoi par e-mail…');
        const r = await post('/api/cv/partager-email', { pdf_url: pdf.url, email, message: ($('sh-msg')?.value || '').trim(), numero: num });
        if (!r.ok) { etatPartage(r.error || 'E-mail non envoyé.', false); return; }
        etatPartage('✅ CV envoyé à ' + email + '.', true);
      }
    } catch (e) { etatPartage(e.message || 'Envoi impossible.', false); }
    finally { bouton.disabled = false; }
  };
  X.partagerWhatsApp = async function () {
    try {
      const pdf = await preparerPDF(t => etatPartage(t));
      const texte = textePartage(pdf.url);
      post('/api/cv/partage-journal', { canal: 'whatsapp', numero: CVB.data.meta.numero });
      etatPartage('Ouverture de WhatsApp…', true);
      window.open('https://wa.me/?text=' + encodeURIComponent(texte), '_blank', 'noopener');
    } catch (e) { etatPartage(e.message || 'Impossible de préparer le PDF.', false); }
  };
  X.copierLien = async function () {
    try {
      await attendreSauvegarde();
      if (!CVB.token) throw new Error('Enregistrez d\'abord votre CV.');
      await navigator.clipboard.writeText(X.lienPublic());
      etatPartage('✅ Lien copié : il ouvre votre CV et vos médias.', true);
    } catch (e) { etatPartage(e.message || 'Copie impossible : ' + X.lienPublic(), false); }
  };

  /* ───────────────────────── Initialisation ───────────────────────── */
  document.addEventListener('DOMContentLoaded', async () => {
    X.attachRich('resume', 'Bref résumé de votre profil et de vos objectifs…');
    X.renderBlocs();
    $('cv-numero')?.addEventListener('change', () => { X.renderMedias(); render(); });
    // La session est connue de cv-builder.js après son /api/auth/me : on attend un court instant.
    for (let i = 0; i < 30 && CVB.userId == null; i++) await new Promise(r => setTimeout(r, 150));
    X.chargerMedias();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('modal-add-media')?.style.display === 'flex') fermerAjout();
    if ($('modal-share')?.style.display === 'flex') X.fermerPartage();
  });

  return X;
})();
