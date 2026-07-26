/* ======================================================
   MODULE SIGNALEMENT DE COMPTE & GESTION DES LITIGES
   Bouton + formulaire "🚩 Signaler ce compte", partagé entre
   profil-app.html, initiative.html et profil-collectivite.html.
   Dépend de assets/app.js (api(), fetchCurrentUser / CURRENT_USER).
   ====================================================== */
(function () {
  const MOTIFS_SIGNALEMENT = [
    'Fraude / escroquerie', 'Faux compte', "Usurpation d'identité", 'Informations fausses',
    'Harcèlement', 'Comportement abusif', 'Contenu interdit', 'Publicité abusive',
    "Non-respect d'un engagement", 'Problème commercial', 'Autre'
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let _preuves = [];

  function css() {
    if (document.getElementById('sig-modal-css')) return;
    const style = document.createElement('style');
    style.id = 'sig-modal-css';
    style.textContent = `
      .sig-modal-bg{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}
      .sig-modal{background:#fff;border-radius:14px;max-width:480px;width:100%;max-height:88vh;overflow-y:auto;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.25);}
      .sig-modal h3{margin:0 0 4px;font-size:17px;color:#0f172a;}
      .sig-modal .sig-sub{font-size:12.5px;color:#64748b;margin:0 0 16px;}
      .sig-modal label{display:block;font-size:12.5px;font-weight:700;color:#334155;margin:12px 0 5px;}
      .sig-modal select, .sig-modal textarea{width:100%;padding:9px 10px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box;}
      .sig-modal textarea{min-height:80px;resize:vertical;}
      .sig-preuves-list{display:flex;flex-direction:column;gap:6px;margin-top:8px;}
      .sig-preuve-item{display:flex;align-items:center;gap:8px;font-size:12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:7px;padding:6px 9px;}
      .sig-preuve-item button{margin-left:auto;background:none;border:none;color:#dc2626;cursor:pointer;font-size:13px;}
      .sig-preuve-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
      .sig-preuve-btns button{background:#F1F5F9;border:1px solid #E2E8F0;border-radius:7px;padding:6px 10px;font-size:12px;cursor:pointer;color:#334155;}
      .sig-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px;}
      .sig-modal-actions button{padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;}
      .sig-btn-cancel{background:#F1F5F9;color:#334155;}
      .sig-btn-submit{background:#dc2626;color:#fff;}
      .sig-btn-submit:disabled{opacity:.6;cursor:default;}
      .sig-msg{font-size:12.5px;margin-top:10px;}
    `;
    document.head.appendChild(style);
  }

  async function uploadPreuveImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const r = await api('POST', '/upload', { data: reader.result, nom: file.name });
          resolve({ type: 'image', url: r.url, nom: file.name });
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadPreuveDocument(file) {
    const fd = new FormData();
    fd.append('document', file, file.name);
    const res = await fetch((window.API_BASE || '/api') + '/upload/document', { method: 'POST', credentials: 'same-origin', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erreur upload document.');
    return { type: 'document', url: data.url, nom: file.name };
  }

  function renderPreuves() {
    const list = document.getElementById('sig-preuves-list');
    if (!list) return;
    if (!_preuves.length) { list.innerHTML = ''; return; }
    list.innerHTML = _preuves.map((p, i) => `
      <div class="sig-preuve-item">
        <span>${p.type === 'image' ? '🖼️' : p.type === 'document' ? '📄' : '🔗'}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.nom || p.url)}</span>
        <button type="button" onclick="window.__sigRemovePreuve(${i})">✕</button>
      </div>`).join('');
  }
  window.__sigRemovePreuve = (i) => { _preuves.splice(i, 1); renderPreuves(); };

  window.ouvrirSignalementModal = async function (cibleId, cibleNom) {
    if (typeof CURRENT_USER !== 'undefined' && !CURRENT_USER) {
      if (!(await fetchCurrentUser().catch(() => null)) && !window.CURRENT_USER) {
        window.location.href = 'login.html';
        return;
      }
    }
    css();
    _preuves = [];
    const bg = document.createElement('div');
    bg.className = 'sig-modal-bg';
    bg.innerHTML = `
      <div class="sig-modal">
        <h3>🚩 Signaler ce compte</h3>
        <p class="sig-sub">Vous signalez <strong>${esc(cibleNom || 'ce compte')}</strong>. Ce dossier sera examiné par notre équipe de modération.</p>

        <label>Motif *</label>
        <select id="sig-motif">
          <option value="">— Choisir un motif —</option>
          ${MOTIFS_SIGNALEMENT.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
        </select>

        <label>Description du problème</label>
        <textarea id="sig-description" placeholder="Décrivez la situation en détail…"></textarea>

        <label>Preuves (facultatif)</label>
        <div class="sig-preuve-btns">
          <button type="button" onclick="document.getElementById('sig-file-image').click()">🖼️ Image / capture</button>
          <button type="button" onclick="document.getElementById('sig-file-doc').click()">📄 Document</button>
          <button type="button" onclick="window.__sigAddLien()">🔗 Ajouter un lien</button>
        </div>
        <input type="file" id="sig-file-image" accept="image/*" style="display:none;">
        <input type="file" id="sig-file-doc" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" style="display:none;">
        <div class="sig-preuves-list" id="sig-preuves-list"></div>

        <div id="sig-msg" class="sig-msg"></div>
        <div class="sig-modal-actions">
          <button type="button" class="sig-btn-cancel" onclick="this.closest('.sig-modal-bg').remove()">Annuler</button>
          <button type="button" class="sig-btn-submit" id="sig-submit-btn">Envoyer le signalement</button>
        </div>
      </div>`;
    document.body.appendChild(bg);

    const msgEl = bg.querySelector('#sig-msg');
    const setMsg = (txt, ok) => { msgEl.style.color = ok ? '#16a34a' : '#dc2626'; msgEl.textContent = txt; };

    window.__sigAddLien = () => {
      const url = prompt('Coller le lien concerné :');
      if (!url) return;
      try { new URL(url); } catch (e) { setMsg('Lien invalide.', false); return; }
      _preuves.push({ type: 'lien', url, nom: url });
      renderPreuves();
    };

    bg.querySelector('#sig-file-image').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      setMsg('Ajout de l\'image…', true);
      try { _preuves.push(await uploadPreuveImage(file)); renderPreuves(); setMsg('', true); }
      catch (err) { setMsg(err.message || 'Erreur upload image.', false); }
      e.target.value = '';
    });
    bg.querySelector('#sig-file-doc').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      setMsg('Ajout du document…', true);
      try { _preuves.push(await uploadPreuveDocument(file)); renderPreuves(); setMsg('', true); }
      catch (err) { setMsg(err.message || 'Erreur upload document.', false); }
      e.target.value = '';
    });

    bg.querySelector('#sig-submit-btn').addEventListener('click', async () => {
      const motif = bg.querySelector('#sig-motif').value;
      const description = bg.querySelector('#sig-description').value.trim();
      if (!motif) { setMsg('Veuillez choisir un motif.', false); return; }
      const btn = bg.querySelector('#sig-submit-btn');
      btn.disabled = true; setMsg('Envoi…', true);
      try {
        const r = await api('POST', '/signalements', { cible_id: cibleId, motif, description, preuves: _preuves });
        setMsg(`✅ Signalement enregistré (dossier ${r.numero_dossier}). Nos modérateurs vont l'examiner.`, true);
        setTimeout(() => bg.remove(), 2500);
      } catch (err) {
        setMsg(err.message || 'Erreur lors de l\'envoi.', false);
        btn.disabled = false;
      }
    });
  };
})();
