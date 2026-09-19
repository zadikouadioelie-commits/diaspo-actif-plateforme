/* ══════════════════════════════════════════════════════════════════
   AVIS SECTION — composant réutilisable "avis + droit de réponse"
   (cahier des charges "Avis + droit de réponse", 2026-09-19).
   Un seul composant, monté sur toute page profil quel que soit le type
   de compte (Initiative, Utilisateur, Organisme) — voir profil-app.html
   et assets/carte-diaspoactif.js pour les points de montage.
   API publique : window.AvisSection.mount(container, {
     profilId, profilNom, isOwner, isAdmin, cu
   })
   ══════════════════════════════════════════════════════════════════ */
(function () {
  const MOTIFS = [
    { v: 'contenu_inapproprie', label: 'Contenu inapproprié' },
    { v: 'propos_insultants',   label: 'Propos insultants' },
    { v: 'spam',                label: 'Spam' },
    { v: 'faux_avis_presume',   label: 'Faux avis présumé' },
    { v: 'conflit_ou_autre',    label: 'Conflit ou autre problème' },
    { v: 'autre',               label: 'Autre' },
  ];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } }
  function stars(n, size) {
    const r = Math.round(Number(n) || 0);
    return `<span style="color:#F4A62A;font-size:${size || 14}px;letter-spacing:1px;">${'★'.repeat(r)}${'☆'.repeat(5 - r)}</span>`;
  }

  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const st = document.createElement('style');
    st.id = 'avis-section-style';
    st.textContent = `
.avz-card{background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:18px 20px;margin:14px 0;}
.avz-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
.avz-head h3{margin:0;font-size:16px;color:#0D1B2A;}
.avz-summary{display:flex;align-items:center;gap:12px;}
.avz-summary .avz-moy{font-size:30px;font-weight:800;color:#122A4D;line-height:1;}
.avz-summary .avz-total{font-size:11.5px;color:#8794A7;margin-top:2px;}
.avz-empty{color:#8794A7;font-size:13px;padding:8px 0;}
.avz-item{border-top:1px solid #F1F3F6;padding:14px 0;font-size:13px;color:#334155;}
.avz-item:first-child{border-top:none;}
.avz-item-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;}
.avz-item-auteur{font-weight:700;color:#0D1B2A;}
.avz-item-date{font-size:11.5px;color:#8794A7;}
.avz-item-modifie{font-size:11px;color:#8794A7;font-style:italic;margin-top:4px;}
.avz-comment{margin-top:6px;line-height:1.5;}
.avz-reponse{background:#F8FAFC;border-left:3px solid #2563EB;border-radius:0 8px 8px 0;padding:10px 12px;margin-top:10px;}
.avz-reponse-titre{font-size:11.5px;font-weight:700;color:#2563EB;margin-bottom:4px;}
.avz-item-actions{display:flex;gap:14px;margin-top:8px;}
.avz-link-btn{background:none;border:none;padding:0;font-size:11.5px;font-weight:600;color:#2563EB;cursor:pointer;}
.avz-link-btn.danger{color:#B91C1C;}
.avz-signaler{background:none;border:none;padding:0;font-size:11px;color:#94A3B8;cursor:pointer;}
.avz-form{margin-top:16px;border-top:1px solid #F1F3F6;padding-top:16px;}
.avz-star-picker{display:flex;gap:4px;font-size:28px;cursor:pointer;user-select:none;}
.avz-star-picker span{color:#D1D5DB;transition:color .1s;}
.avz-star-picker span.on{color:#F4A62A;}
.avz-form textarea{width:100%;box-sizing:border-box;margin-top:10px;padding:10px 12px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;min-height:70px;}
.avz-form-btn{margin-top:10px;font-size:13px;font-weight:700;color:#fff;background:#8E1B2E;border:none;border-radius:10px;padding:10px 18px;cursor:pointer;}
.avz-login-link{display:block;margin-top:10px;font-size:12.5px;color:#8E1B2E;text-align:center;}
.avz-modal-bg{position:fixed;inset:0;background:rgba(13,27,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}
.avz-modal{background:#fff;border-radius:14px;max-width:420px;width:100%;padding:20px;}
.avz-modal h4{margin:0 0 12px;font-size:15px;color:#0D1B2A;}
.avz-modal label{display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 0;cursor:pointer;}
.avz-modal textarea{width:100%;box-sizing:border-box;margin-top:8px;padding:8px 10px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;font-family:inherit;}
.avz-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px;}
.avz-modal-actions button{padding:8px 14px;border-radius:8px;border:none;font-weight:700;font-size:13px;cursor:pointer;}
.avz-modal-cancel{background:#F1F5F9;color:#334155;}
.avz-modal-save{background:#8E1B2E;color:#fff;}
.avz-modal-err{color:#dc2626;font-size:12px;margin-top:8px;}
`;
    document.head.appendChild(st);
  }

  function openModal(titreHtml, bodyHtml, onSave) {
    const ov = document.createElement('div');
    ov.className = 'avz-modal-bg';
    ov.innerHTML = `<div class="avz-modal"><h4>${titreHtml}</h4>${bodyHtml}<div class="avz-modal-err" style="display:none;"></div>
      <div class="avz-modal-actions"><button type="button" class="avz-modal-cancel">Annuler</button><button type="button" class="avz-modal-save">Valider</button></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelector('.avz-modal-cancel').onclick = () => ov.remove();
    ov.querySelector('.avz-modal-save').onclick = async () => {
      const err = ov.querySelector('.avz-modal-err');
      err.style.display = 'none';
      try { await onSave(ov); ov.remove(); }
      catch (e) { err.textContent = e.message || 'Erreur.'; err.style.display = 'block'; }
    };
    return ov;
  }

  function mount(container, opts) {
    if (!container) return;
    injectStyles();
    const { profilId, profilNom, isOwner, isAdmin, cu } = opts;
    container.className = (container.className ? container.className + ' ' : '') + 'avz-card';
    container.id = container.id || 'avis-' + profilId;
    container.innerHTML = `<div class="avz-empty">Chargement des avis…</div>`;

    async function refresh() {
      let data;
      try { data = await api('GET', `/profil/${profilId}/avis`); }
      catch (e) { container.innerHTML = `<div class="avz-empty">Impossible de charger les avis.</div>`; return; }
      render(data);
    }

    function starPickerHtml(name) {
      return `<div class="avz-star-picker" data-field="${name}">${[1,2,3,4,5].map(n => `<span data-v="${n}">★</span>`).join('')}</div>`;
    }
    function wireStarPicker(root, initialValue) {
      const picker = root.querySelector('.avz-star-picker');
      if (!picker) return;
      const spans = [...picker.querySelectorAll('span')];
      let value = initialValue || 0;
      const paint = () => spans.forEach(s => s.classList.toggle('on', Number(s.dataset.v) <= value));
      spans.forEach(sp => sp.onclick = () => { value = Number(sp.dataset.v); paint(); });
      paint();
      picker.getValue = () => value;
      return picker;
    }

    function render(data) {
      const avis = data.avis || [];
      const moiAvis = cu ? avis.find(a => Number(a.user_id) === Number(cu.id)) : null;

      const listHtml = avis.length ? avis.map(a => {
        const nom = `${a.prenom || ''} ${a.nom || ''}`.trim() || 'Membre';
        const peutRepondre = (isOwner || isAdmin) && !a.reponse_texte;
        const peutGererReponse = (isOwner || isAdmin) && a.reponse_texte;
        return `<div class="avz-item" id="avis-${a.id}">
          <div class="avz-item-head">
            <span class="avz-item-auteur">${esc(nom)}</span>
            ${stars(a.note)}
            <span class="avz-item-date">${fmtDate(a.created_at)}</span>
          </div>
          ${a.commentaire ? `<div class="avz-comment">${esc(a.commentaire)}</div>` : ''}
          ${a.modifie_le ? `<div class="avz-item-modifie">Avis modifié le ${fmtDate(a.modifie_le)}</div>` : ''}
          ${a.reponse_texte ? `<div class="avz-reponse">
              <div class="avz-reponse-titre">↩ Réponse officielle de ${esc(profilNom)}</div>
              <div>${esc(a.reponse_texte)}</div>
            </div>` : ''}
          <div class="avz-item-actions">
            ${peutRepondre ? `<button type="button" class="avz-link-btn" data-action="repondre" data-id="${a.id}">💬 Répondre</button>` : ''}
            ${peutGererReponse ? `<button type="button" class="avz-link-btn" data-action="modifier-reponse" data-id="${a.id}">✏️ Modifier la réponse</button><button type="button" class="avz-link-btn danger" data-action="supprimer-reponse" data-id="${a.id}">🗑️ Supprimer la réponse</button>` : ''}
            ${(!isOwner && cu) ? `<button type="button" class="avz-signaler" data-action="signaler" data-id="${a.id}">⋯ Signaler</button>` : ''}
          </div>
        </div>`;
      }).join('') : `<div class="avz-empty">Aucun avis pour le moment.</div>`;

      const formHtml = (!isOwner && cu) ? `<div class="avz-form">
          <div style="font-size:13px;font-weight:700;color:#0D1B2A;margin-bottom:4px;">${moiAvis ? 'Modifier mon avis' : 'Votre note'}</div>
          ${starPickerHtml('note')}
          <textarea placeholder="Partagez votre expérience avec ce profil… (facultatif)">${moiAvis ? esc(moiAvis.commentaire || '') : ''}</textarea>
          <button type="button" class="avz-form-btn" data-action="publier">${moiAvis ? 'Mettre à jour mon avis' : 'Publier mon avis'}</button>
        </div>` : (!cu ? `<a href="login.html" class="avz-login-link">Connectez-vous pour laisser un avis</a>` : '');

      container.innerHTML = `
        <div class="avz-head">
          <h3>⭐ Avis</h3>
          ${data.total ? `<div class="avz-summary"><div><div class="avz-moy">${data.moyenne}</div><div class="avz-total">${data.total} avis</div></div>${stars(data.moyenne, 18)}</div>` : ''}
        </div>
        <div class="avz-list">${listHtml}</div>
        ${formHtml}
      `;

      const picker = wireStarPicker(container, moiAvis ? moiAvis.note : 0);

      const publierBtn = container.querySelector('[data-action="publier"]');
      if (publierBtn) publierBtn.onclick = async () => {
        const note = picker ? picker.getValue() : 0;
        if (!note) { alert('Choisissez une note de 1 à 5 étoiles.'); return; }
        const commentaire = container.querySelector('.avz-form textarea').value.trim();
        publierBtn.disabled = true;
        try { await api('POST', `/profil/${profilId}/avis`, { note, commentaire }); await refresh(); }
        catch (e) { alert(e.message || 'Erreur lors de la publication.'); publierBtn.disabled = false; }
      };

      container.querySelectorAll('[data-action="repondre"], [data-action="modifier-reponse"]').forEach(btn => {
        btn.onclick = () => {
          const id = btn.dataset.id;
          const avisRow = avis.find(a => String(a.id) === id);
          openModal('Votre réponse', `<textarea rows="4" placeholder="Votre réponse à cet avis…">${esc(avisRow?.reponse_texte || '')}</textarea>`, async (ov) => {
            const texte = ov.querySelector('textarea').value.trim();
            if (!texte) throw new Error('Réponse vide.');
            await api('PUT', `/profil/${profilId}/avis/${id}/reponse`, { reponse_texte: texte });
            await refresh();
          });
        };
      });

      container.querySelectorAll('[data-action="supprimer-reponse"]').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('Supprimer votre réponse à cet avis ?')) return;
          try { await api('DELETE', `/profil/${profilId}/avis/${btn.dataset.id}/reponse`); await refresh(); }
          catch (e) { alert(e.message || 'Erreur.'); }
        };
      });

      container.querySelectorAll('[data-action="signaler"]').forEach(btn => {
        btn.onclick = () => {
          const id = btn.dataset.id;
          const optsHtml = MOTIFS.map(m => `<label><input type="radio" name="avz-motif" value="${m.v}"> ${esc(m.label)}</label>`).join('');
          openModal('Signaler cet avis', `<div>${optsHtml}</div>`, async (ov) => {
            const sel = ov.querySelector('input[name="avz-motif"]:checked');
            if (!sel) throw new Error('Sélectionnez un motif.');
            await api('POST', `/profil/${profilId}/avis/${id}/signaler`, { motif: sel.value });
            alert('Merci, cet avis a été signalé à la modération.');
          });
        };
      });

      if (location.hash === '#avis') { try { container.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    }

    refresh();
  }

  window.AvisSection = { mount };
})();
