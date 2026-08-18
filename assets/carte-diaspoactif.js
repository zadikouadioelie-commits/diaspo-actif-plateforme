/* ══════════════════════════════════════════════════════════════════
   CARTE DIASPO'ACTIF — profil condensé du rôle « utilisateur »
   Remplace l'ancien profil public pour ce rôle (2026-07-27) : une seule
   carte, affichée à la fois sur le tableau de bord du propriétaire
   (mode éditable) et sur le profil consulté depuis l'annuaire (lecture
   seule). Tout est modifiable directement depuis la carte côté
   propriétaire : photo, bannière, pays/ville/origines, biographie,
   domaine, statut professionnel, affiliations.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  const STATUTS = [
    { v: 'en_poste',    label: 'En poste',                    couleur: '#16A34A' },
    { v: 'en_recherche', label: 'En recherche',                couleur: '#F59E0B' },
    { v: 'disponible',  label: 'Disponible pour opportunités', couleur: '#2563EB' },
    { v: 'autre',       label: 'Autre statut',                 couleur: '#6B7280' },
  ];

  /* Styles de bannière au choix — définis dans assets/banner-presets.js (source unique,
     chargé avant ce script), réutilisés tels quels par tout autre point d'édition de
     bannière. L'un d'eux devient la valeur de banner_url au même titre qu'une photo
     personnelle uploadée : aucun champ ni route serveur supplémentaire nécessaire. */
  const BANNIERES_PRESET = window.BANNIERES_PRESET || [];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function drapeau(pays) { try { return window.daDrapeau ? window.daDrapeau(pays) : '🌍'; } catch (e) { return '🌍'; } }

  /* Windows n'affiche pas les emoji drapeaux (regional indicator symbols) : Chrome/Edge y
     rendent "FR" en texte brut au lieu du vrai drapeau bleu-blanc-rouge, contrairement à
     mac/Android. daDrapeau() (assets/app.js) construit cet emoji à partir de l'ISO du pays —
     on récupère cet ISO en décodant l'emoji, pour charger une vraie image de drapeau plutôt
     que de compter sur la police système. Pas de drapeau reconnu → pas d'icône du tout
     (plus de globe 🌍 générique en repli, qui n'apportait rien). */
  function drapeauImgHtml(pays) {
    if (!pays) return '';
    const emoji = drapeau(pays);
    const points = [...emoji];
    if (points.length !== 2) return '';
    const iso = points.map(c => String.fromCharCode(c.codePointAt(0) - 0x1F1E6 + 65)).join('').toLowerCase();
    if (!/^[a-z]{2}$/.test(iso)) return '';
    return `<img class="cda-flag-icon" src="https://flagcdn.com/24x18/${iso}.png" alt="${esc(pays)}" loading="lazy">`;
  }

  /* Toujours affichée, même sans valeur (placeholder « Non renseigné ») : sans ça, un champ
     jamais rempli disparaissait purement et simplement de la carte, sans inviter le membre
     à le compléter — au propriétaire de voir que le champ existe et cliquer ✏️. */
  function chipInfo(icone, label, valeur) {
    const val = valeur ? esc(valeur) : '<span class="cda-muted">Non renseigné</span>';
    return `<div class="cda-info-chip"><span class="cda-info-icon">${icone}</span><div><div class="cda-info-label">${label}</div><div class="cda-info-val">${val}</div></div></div>`;
  }

  /* Variante pays : icône = vraie image de drapeau (voir drapeauImgHtml), jamais l'emoji direct. */
  function chipPays(pays, label, valeur) {
    const icone = valeur ? drapeauImgHtml(pays) : '';
    const val = valeur ? esc(valeur) : '<span class="cda-muted">Non renseigné</span>';
    return `<div class="cda-info-chip"><span class="cda-info-icon">${icone}</span><div><div class="cda-info-label">${label}</div><div class="cda-info-val">${val}</div></div></div>`;
  }

  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const s = document.createElement('style');
    s.textContent = `
      .cda-card{background:#fff;border:1px solid #E5E9F0;border-radius:18px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.05);}
      .cda-banner{height:200px;background-image:url('assets/banner-default.svg');background-size:cover;background-position:center;position:relative;}
      .cda-banner-brand{position:absolute;top:18px;right:22px;display:flex;align-items:center;gap:10px;color:#fff;}
      .cda-banner-brand img{width:38px;height:38px;border-radius:50%;background:#fff;padding:3px;}
      .cda-banner-brand span{font-weight:800;font-size:19px;display:block;}
      .cda-banner-brand small{display:block;font-size:11px;opacity:.85;margin-top:1px;}
      .cda-banner-edit{position:absolute;top:18px;left:22px;z-index:2;background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;}
      .cda-head{display:flex;align-items:flex-start;gap:16px;padding:0 24px 16px;margin-top:-56px;flex-wrap:wrap;}
      .cda-avatar-wrap{position:relative;flex-shrink:0;}
      .cda-avatar{width:120px;height:120px;border-radius:50%;border:4px solid #fff;background:linear-gradient(135deg,#2E74E0,#1B4B8C);color:#fff;font-weight:800;font-size:38px;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.15);}
      .cda-avatar img{width:100%;height:100%;object-fit:cover;}
      .cda-online-dot{position:absolute;bottom:10px;right:8px;width:18px;height:18px;border-radius:50%;background:#22C55E;border:3px solid #fff;}
      .cda-avatar-edit{position:absolute;inset:0 8px 10px 0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0);color:#fff;font-size:20px;opacity:0;transition:opacity .15s,background .15s;cursor:pointer;border:none;}
      .cda-avatar-wrap:hover .cda-avatar-edit{opacity:1;background:rgba(0,0,0,.4);}
      .cda-headtext{padding-top:62px;flex:1;min-width:220px;}
      .cda-name{font-size:20px;font-weight:800;color:#0D1B2A;display:flex;align-items:center;gap:7px;}
      .cda-verified{display:inline-flex;align-items:center;justify-content:center;width:19px;height:19px;border-radius:50%;background:#2563EB;color:#fff;font-size:11px;}
      .cda-actions{padding-top:62px;margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;}
      .cda-btn{text-decoration:none;display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:12px;font-weight:700;font-size:13px;white-space:nowrap;}
      .cda-info-row{display:flex;flex-wrap:wrap;gap:18px;margin-top:10px;position:relative;padding-right:26px;}
      .cda-info-chip{display:flex;align-items:center;gap:7px;}
      .cda-info-icon{font-size:15px;display:inline-flex;align-items:center;}
      .cda-flag-icon{width:20px;height:15px;object-fit:cover;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.08);}
      .cda-info-label{font-size:10.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;}
      .cda-info-val{font-size:12.5px;font-weight:700;color:#0D1B2A;}
      .cda-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:16px 20px 0;}
      @media (max-width:640px){.cda-grid{grid-template-columns:1fr;}}
      .cda-col-right{display:flex;flex-direction:column;gap:14px;}
      .cda-box{background:#F8FAFC;border:1px solid #EEF2F7;border-radius:14px;padding:14px 16px;margin:0 20px;}
      .cda-grid .cda-box{margin:0;}
      .cda-box-head{display:flex;align-items:center;gap:6px;font-weight:800;font-size:13px;color:#0D1B2A;margin-bottom:8px;}
      .cda-box-head small{color:#94A3B8;font-weight:600;font-size:11px;margin-left:auto;}
      .cda-bio-text{font-size:12.5px;line-height:1.6;color:#475569;margin:0;white-space:pre-line;}
      .cda-statut-row{display:flex;flex-wrap:wrap;gap:6px;}
      .cda-statut-chip{border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:11.5px;font-weight:700;padding:6px 12px;border-radius:99px;cursor:pointer;}
      .cda-statut-chip:disabled{cursor:default;}
      .cda-tags{display:flex;flex-wrap:wrap;gap:8px;}
      .cda-tag{background:#EEF2FF;color:#3730A3;font-size:11.5px;font-weight:700;padding:5px 12px;border-radius:99px;}
      .cda-muted{color:#94A3B8;font-size:12px;}
      .cda-affiliations{display:flex;flex-wrap:wrap;gap:14px;}
      .cda-affil-item{position:relative;width:88px;text-align:center;text-decoration:none;color:inherit;display:block;}
      .cda-affil-item:hover .cda-affil-nom{color:#2563EB;}
      .cda-affil-poste{font-size:10px;color:#94A3B8;line-height:1.3;margin-top:1px;}
      .cda-affil-logo{width:56px;height:56px;border-radius:50%;background:#fff;border:1px solid #E2E8F0;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;overflow:hidden;font-size:22px;}
      .cda-affil-logo img{width:100%;height:100%;object-fit:cover;}
      .cda-affil-nom{font-size:10.5px;color:#475569;font-weight:600;line-height:1.3;}
      .cda-affil-remove{position:absolute;top:-4px;right:6px;width:18px;height:18px;border-radius:50%;background:#EF4444;color:#fff;border:none;font-size:10px;cursor:pointer;line-height:1;}
      .cda-affil-add{width:76px;text-align:center;cursor:pointer;}
      .cda-affil-add span{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;border:2px dashed #CBD5E1;color:#94A3B8;font-size:22px;margin:0 auto 6px;}
      .cda-affil-add div{font-size:10px;color:#94A3B8;font-weight:600;}
      .cda-edit-btn{background:none;border:none;color:#94A3B8;font-size:13px;cursor:pointer;padding:2px 4px;border-radius:6px;line-height:1;}
      .cda-edit-btn:hover{background:#EEF2F7;color:#2563EB;}
      .cda-theme-btn{display:inline-flex;align-items:center;gap:7px;background:linear-gradient(135deg,#2E74E0,#1B4B8C);color:#fff;border:none;border-radius:10px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 3px 10px rgba(27,75,140,.3);}
      .cda-theme-btn:hover{box-shadow:0 4px 14px rgba(27,75,140,.42);transform:translateY(-1px);}
      .cda-info-row .cda-edit-btn{position:absolute;top:0;right:0;}
      .cda-modal-bg{position:fixed;inset:0;background:rgba(13,27,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}
      .cda-modal{background:#fff;border-radius:14px;max-width:480px;width:100%;max-height:88vh;overflow-y:auto;padding:22px;}
      .cda-modal h3{margin:0 0 14px;font-size:16px;color:#0D1B2A;}
      .cda-modal label{display:block;font-size:12px;font-weight:700;color:#334155;margin:10px 0 4px;}
      .cda-modal input, .cda-modal textarea{width:100%;padding:9px 12px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box;}
      .cda-modal textarea{resize:vertical;}
      .cda-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;}
      .cda-modal-actions button{padding:9px 16px;border-radius:8px;border:none;font-weight:700;font-size:13px;cursor:pointer;}
      .cda-modal-cancel{background:#F1F5F9;color:#334155;}
      .cda-modal-save{background:#2563EB;color:#fff;}
      .cda-modal-err{color:#dc2626;font-size:12px;margin-top:8px;display:none;}
      .cda-style-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
      .cda-style-swatch{position:relative;height:70px;border-radius:10px;border:2.5px solid transparent;background-size:cover;background-position:center;cursor:pointer;overflow:hidden;padding:0;}
      .cda-style-swatch.active{border-color:#2563EB;}
      .cda-style-swatch span{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);color:#fff;font-size:10.5px;font-weight:700;padding:3px 6px;text-align:center;}
    `;
    document.head.appendChild(s);
  }

  function render(container, profil, opts) {
    injectStyles();
    opts = opts || {};
    const isOwner = !!opts.isOwner;
    if (!container || !profil) return;

    const nom = [profil.prenom, profil.nom].filter(Boolean).join(' ') || profil.nom || 'Membre';
    const verified = !!profil.identite_verifiee;
    const competences = Array.isArray(profil.competences) ? profil.competences : [];
    const affiliations = Array.isArray(profil.affiliations) ? profil.affiliations : [];
    const statutActuel = profil.situation_pro || '';
    const bio = profil.bio || '';
    /* Bannière personnalisée : remplace le visuel par défaut (assets/banner-default.svg,
       ville + globe vectoriel aux couleurs de la marque, net à toute résolution). */
    const bannerStyle = profil.banner_url ? `background-image:url('${esc(profil.banner_url)}');` : '';

    container.innerHTML = `
      <div class="cda-card">
        <div class="cda-banner" style="${bannerStyle}">
        </div>
        <div class="cda-head">
          <div class="cda-avatar-wrap">
            <div class="cda-avatar">${profil.photo_url ? `<img src="${esc(profil.photo_url)}" alt="${esc(nom)}">` : esc((nom[0]||'?').toUpperCase())}</div>
            <span class="cda-online-dot" title="En ligne"></span>
            ${isOwner ? `<button type="button" class="cda-avatar-edit" id="cda-avatar-edit" title="Changer la photo">📷</button>` : ''}
          </div>
          <div class="cda-headtext">
            <div class="cda-name">${esc(nom)} ${verified ? '<span class="cda-verified" title="Identité vérifiée">✔</span>' : ''}</div>
            <div class="cda-info-row">
              ${chipPays(profil.pays, 'Pays de résidence', profil.pays)}
              ${chipInfo('📍', 'Ville de résidence', profil.ville)}
              ${chipPays(profil.origine1, 'Origine 1', profil.origine1)}
              ${chipPays(profil.origine2, 'Origine 2 (optionnel)', profil.origine2)}
              ${isOwner ? `<button type="button" class="cda-edit-btn" id="cda-info-edit" title="Modifier">✏️</button>` : ''}
            </div>
          </div>
          <div class="cda-actions" id="cda-actions"></div>
        </div>
        ${isOwner ? `<div style="padding:0 20px 4px;"><button type="button" class="cda-theme-btn" id="cda-banner-style">🎨 Thème de bandeaux</button></div>` : ''}

        <div class="cda-grid">
          <div class="cda-box">
            <div class="cda-box-head"><span>📝 Biographie</span>${isOwner ? `<button type="button" class="cda-edit-btn" id="cda-bio-edit" title="Modifier">✏️</button>` : ''}<small>${bio.length}/800</small></div>
            <p class="cda-bio-text">${bio ? esc(bio) : '<span class="cda-muted">Ce membre n\'a pas encore ajouté de présentation.</span>'}</p>
          </div>
          <div class="cda-col-right">
            <div class="cda-box">
              <div class="cda-box-head"><span>💼 Statut professionnel</span></div>
              <div class="cda-statut-row" id="cda-statut-row">
                ${STATUTS.map(s => `<button type="button" class="cda-statut-chip${s.v===statutActuel?' active':''}" data-statut="${s.v}" style="${s.v===statutActuel?`background:${s.couleur};border-color:${s.couleur};color:#fff;`:''}" ${isOwner?'':'disabled'}>${esc(s.label)}</button>`).join('')}
              </div>
            </div>
            <div class="cda-box">
              <div class="cda-box-head"><span>🏷️ Domaine</span>${isOwner ? `<button type="button" class="cda-edit-btn" id="cda-domaine-edit" title="Modifier">✏️</button>` : ''}</div>
              <div class="cda-tags">
                ${competences.length ? competences.map(c => `<span class="cda-tag">${esc(c)}</span>`).join('') : '<span class="cda-muted">Aucun domaine renseigné.</span>'}
              </div>
            </div>
          </div>
        </div>

        <div class="cda-box" style="margin:14px 20px 20px;">
          <div class="cda-box-head"><span>🤝 Affiliations</span></div>
          <div class="cda-affiliations" id="cda-affiliations">
            ${affiliations.length ? affiliations.map(a => `
              <a class="cda-affil-item" href="initiative.html?id=${esc(a.slug || a.initiative_id)}" data-initiative-id="${a.initiative_id}" title="${esc(a.nom)}${a.fonction ? ' — ' + esc(a.fonction) : ''}">
                ${isOwner ? `<button type="button" class="cda-affil-remove" data-remove-aff="${a.initiative_id}" title="Mettre fin à cette affiliation">✕</button>` : ''}
                <div class="cda-affil-logo">${a.logo_url ? `<img src="${esc(a.logo_url)}" alt="${esc(a.nom)}">` : '🏢'}</div>
                <div class="cda-affil-nom">${esc(a.nom)}</div>
                ${a.fonction ? `<div class="cda-affil-poste">${esc(a.fonction)}</div>` : ''}
              </a>`).join('') : '<span class="cda-muted">Aucune affiliation officielle pour l\'instant — une organisation enregistrée sur Diaspo\'Actif peut vous en proposer une.</span>'}
          </div>
        </div>
      </div>`;

    if (isOwner) {
      container.querySelectorAll('#cda-statut-row .cda-statut-chip').forEach(btn => {
        btn.addEventListener('click', async () => {
          const statut = btn.dataset.statut;
          try {
            await window.api('PATCH', '/profil/statut-professionnel', { statut });
            profil.situation_pro = statut;
            render(container, profil, opts);
          } catch (e) { alert(e.message || 'Erreur.'); }
        });
      });
      container.querySelectorAll('[data-remove-aff]').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          if (!confirm('Mettre fin à cette affiliation ?')) return;
          const initiativeId = btn.dataset.removeAff;
          try {
            await window.api('DELETE', `/initiatives/${initiativeId}/membres/${profil.id}`);
            profil.affiliations = (profil.affiliations || []).filter(a => String(a.initiative_id) !== initiativeId);
            render(container, profil, opts);
          } catch (e) { alert(e.message || 'Erreur.'); }
        });
      });

      const avatarBtn = container.querySelector('#cda-avatar-edit');
      if (avatarBtn) avatarBtn.addEventListener('click', async () => {
        const url = await window.pickAndUpload('avatar', { maxW: 500, maxH: 500 });
        if (!url) return;
        profil.photo_url = url;
        render(container, profil, opts);
      });

      const styleBtn = container.querySelector('#cda-banner-style');
      if (styleBtn) styleBtn.addEventListener('click', () => editBannerStyle(container, profil, opts));

      const infoBtn = container.querySelector('#cda-info-edit');
      if (infoBtn) infoBtn.addEventListener('click', () => editInfos(container, profil, opts));

      const bioBtn = container.querySelector('#cda-bio-edit');
      if (bioBtn) bioBtn.addEventListener('click', () => editBio(container, profil, opts));

      const domaineBtn = container.querySelector('#cda-domaine-edit');
      if (domaineBtn) domaineBtn.addEventListener('click', () => editDomaine(container, profil, opts));
    } else {
      // Boutons Demande / Message — widget partagé du site, uniquement pour un visiteur
      const zone = container.querySelector('#cda-actions');
      if (zone && profil.id) {
        zone.innerHTML = `<span data-relation-user="${profil.id}" data-relation-origine="carte_diaspoactif" data-relation-classe="cda-btn"></span>`;
        if (window.initBoutonsRelation) window.initBoutonsRelation();
      }
    }
  }

  /* ── Modal d'édition générique, propre à la carte ── */
  function openCdaModal(titre, bodyHtml, onSave) {
    const ov = document.createElement('div');
    ov.className = 'cda-modal-bg';
    ov.innerHTML = `
      <div class="cda-modal">
        <h3>${titre}</h3>
        ${bodyHtml}
        <div class="cda-modal-err"></div>
        <div class="cda-modal-actions">
          <button type="button" class="cda-modal-cancel">Annuler</button>
          <button type="button" class="cda-modal-save">Enregistrer</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('.cda-modal-cancel').onclick = () => ov.remove();
    ov.querySelector('.cda-modal-save').onclick = async () => {
      const err = ov.querySelector('.cda-modal-err');
      err.style.display = 'none';
      try {
        await onSave(ov);
        ov.remove();
      } catch (e) {
        err.textContent = e.message || 'Erreur.';
        err.style.display = 'block';
      }
    };
    return ov;
  }

  function editBannerStyle(container, profil, opts) {
    const actuel = profil.banner_url || BANNIERES_PRESET[0].id;
    const vignettes = BANNIERES_PRESET.map(b => `
      <button type="button" class="cda-style-swatch${b.id === actuel ? ' active' : ''}" data-style="${b.id}"
        style="background-image:url('${b.id}');" title="${esc(b.label)}">
        <span>${esc(b.label)}</span>
      </button>`).join('');
    const ov = openCdaModal('🎨 Thème de bandeaux',
      `<p style="font-size:12px;color:#64748b;margin:0 0 10px;">Choisissez le style de votre bandeau.</p>
       <div class="cda-style-grid">${vignettes}</div>`,
      async () => { /* la sélection sauvegarde et ferme elle-même, voir ci-dessous */ });
    // Le bouton « Enregistrer » du modal générique ne sert à rien ici : chaque vignette agit seule au clic.
    ov.querySelector('.cda-modal-actions').style.display = 'none';
    ov.querySelectorAll('.cda-style-swatch').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await window.api('PUT', '/profil', { banner_url: btn.dataset.style });
          profil.banner_url = btn.dataset.style;
          ov.remove();
          render(container, profil, opts);
        } catch (e) { alert(e.message || 'Erreur.'); }
      });
    });
  }

  function editInfos(container, profil, opts) {
    openCdaModal('🌍 Origine et résidence',
      `<label>Pays de résidence <span style="color:#2563EB">*</span></label><input id="cda-e-pays" value="${esc(profil.pays||'')}" placeholder="Ex : France">
       <label>Ville de résidence</label><input id="cda-e-ville" value="${esc(profil.ville||'')}" placeholder="Ex : Lyon">
       <label>Origine 1 <span style="color:#2563EB">*</span></label><input id="cda-e-o1" value="${esc(profil.origine1||'')}" placeholder="Ex : Côte d'Ivoire">
       <label>Origine 2 (facultatif)</label><input id="cda-e-o2" value="${esc(profil.origine2||'')}" placeholder="Ex : Sénégal">`,
      async ov => {
        const pays = ov.querySelector('#cda-e-pays').value.trim();
        const ville = ov.querySelector('#cda-e-ville').value.trim();
        const origine1 = ov.querySelector('#cda-e-o1').value.trim();
        const origine2 = ov.querySelector('#cda-e-o2').value.trim();
        if (!pays) throw new Error('Le pays de résidence est obligatoire.');
        if (!origine1) throw new Error("L'origine est obligatoire.");
        const r = await window.api('PUT', '/profil', { pays, ville, origine1, origine2 });
        Object.assign(profil, r.profil);
        render(container, profil, opts);
      });
  }

  function editBio(container, profil, opts) {
    openCdaModal('📝 Biographie',
      `<textarea id="cda-e-bio" rows="7" maxlength="800" placeholder="Parlez de vous en quelques lignes…">${esc(profil.bio||'')}</textarea>`,
      async ov => {
        const bio = ov.querySelector('#cda-e-bio').value.trim();
        const r = await window.api('PUT', '/profil', { bio });
        Object.assign(profil, r.profil);
        render(container, profil, opts);
      });
  }

  function editDomaine(container, profil, opts) {
    openCdaModal('🏷️ Domaine',
      `<p style="font-size:12px;color:#64748b;margin:0;">Séparez chaque compétence par une virgule.</p>
       <textarea id="cda-e-comp" rows="3" placeholder="Ex : Entrepreneuriat, Innovation, Développement durable">${esc((Array.isArray(profil.competences)?profil.competences:[]).join(', '))}</textarea>`,
      async ov => {
        const competences = ov.querySelector('#cda-e-comp').value.split(',').map(s => s.trim()).filter(Boolean);
        const r = await window.api('PUT', '/profil', { competences });
        Object.assign(profil, r.profil);
        render(container, profil, opts);
      });
  }

  window.CarteDiaspoActif = { render };
})();
