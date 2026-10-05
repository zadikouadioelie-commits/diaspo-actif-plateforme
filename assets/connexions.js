/* ═══════════════════════════════════════════════════════════════════════════
   « Mes connexions » (2026-10-05, demande explicite) — pastille dans la barre du haut qui indique
   sur combien d'appareils le compte est ouvert (orange dès qu'il y en a plus d'un), et fenêtre
   listant ces appareils avec « Déconnecter » (un seul, ou tous les autres, comptes liés compris).
   Chargé à la demande par app.js (chargerConnexionsUI) une fois l'utilisateur connu.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__cxInit) return;
  window.__cxInit = true;

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let etat = { connexions: [], total: 0, comptes_lies: [] };

  function injecterStyles() {
    if (document.getElementById('cx-style')) return;
    const st = document.createElement('style');
    st.id = 'cx-style';
    st.textContent = `
.cx-btn{display:none;align-items:center;gap:4px;border:none;cursor:pointer;margin-left:4px;height:24px;padding:0 8px;border-radius:6px;font-size:12px;font-weight:800;background:#e5e7eb;color:#1f2937;box-shadow:0 1px 4px rgba(0,0,0,.25);}
.cx-btn:hover{filter:brightness(.95);}
.cx-btn:focus-visible{outline:2px solid #ff6b00;outline-offset:2px;}
.cx-btn.cx-alerte{background:linear-gradient(135deg,#f97316,#fb923c);color:#fff;}
.cx-overlay{position:fixed;inset:0;background:rgba(13,27,42,.6);z-index:2500;display:none;align-items:center;justify-content:center;padding:16px;}
.cx-overlay.open{display:flex;}
.cx-box{background:#fff;color:#111;color-scheme:light;border-radius:16px;width:100%;max-width:560px;max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.35);}
.cx-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 8px;}
.cx-head h3{margin:0;font-size:18px;}
.cx-head p{margin:4px 0 0;font-size:12.5px;color:#6b7280;line-height:1.45;}
.cx-close{border:none;background:#f3f4f6;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:15px;flex:none;}
.cx-liste{padding:6px 20px 4px;display:flex;flex-direction:column;gap:10px;}
.cx-item{display:flex;align-items:center;gap:12px;border:1.5px solid #e5e7eb;border-radius:12px;padding:12px;}
.cx-item.cx-courante{border-color:#16a34a;background:#f0fdf4;}
.cx-ico{font-size:24px;flex:none;width:34px;text-align:center;}
.cx-info{flex:1;min-width:0;}
.cx-nom{font-weight:700;font-size:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.cx-tag{font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:99px;background:#16a34a;color:#fff;}
.cx-meta{font-size:12px;color:#6b7280;margin-top:2px;line-height:1.4;}
.cx-off{border:1.5px solid #fca5a5;background:#fff;color:#b91c1c;font-weight:700;font-size:12.5px;border-radius:8px;padding:7px 12px;cursor:pointer;flex:none;}
.cx-off:hover:not(:disabled){background:#fee2e2;}
.cx-off:disabled{opacity:.55;cursor:default;}
.cx-pied{padding:12px 20px 18px;display:flex;flex-direction:column;gap:10px;}
.cx-tous{border:none;background:#dc2626;color:#fff;font-weight:800;font-size:13.5px;border-radius:10px;padding:11px;cursor:pointer;}
.cx-tous:hover:not(:disabled){background:#b91c1c;}
.cx-tous:disabled{opacity:.55;cursor:default;}
.cx-lies{font-size:12.5px;color:#374151;display:flex;gap:8px;align-items:flex-start;line-height:1.4;}
.cx-aide{font-size:12px;color:#6b7280;line-height:1.5;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;}
.cx-aide a{color:#b45309;font-weight:700;}
.cx-msg{font-size:12.5px;color:#15803d;font-weight:700;min-height:1em;}
.cx-vide{padding:24px;text-align:center;color:#6b7280;font-size:13px;}
.cx-tag.cx-principal{background:#b45309;}
.cx-exp{font-size:11.5px;color:#92400e;margin-top:2px;}
.cx-exp.cx-long{color:#15803d;}
.cx-star{border:1.5px solid #f59e0b;background:#fffbeb;color:#92400e;font-weight:700;font-size:12px;border-radius:8px;padding:6px 10px;cursor:pointer;margin-top:8px;}
.cx-star:hover:not(:disabled){background:#fef3c7;}
.cx-star:disabled{opacity:.55;cursor:default;}
.cx-star.cx-retirer{border-color:#d1d5db;background:#fff;color:#4b5563;}
.cx-dsid-zone{border:1.5px solid #fcd34d;background:#fffbeb;border-radius:10px;padding:12px;font-size:12.5px;color:#78350f;line-height:1.5;}
.cx-dsid-zone input{width:100%;box-sizing:border-box;margin:8px 0;padding:10px;border:1.5px solid #d1d5db;border-radius:8px;font-size:15px;color:#111;background:#fff;}
.cx-dsid-zone button{border:none;border-radius:8px;padding:9px 14px;font-weight:800;font-size:12.5px;cursor:pointer;background:#b45309;color:#fff;margin-right:8px;}
.cx-prop-box{background:#fff;color:#111;color-scheme:light;border-radius:16px;width:100%;max-width:420px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.4);}
.cx-prop-box h3{margin:0 0 8px;font-size:18px;}
.cx-prop-box p{margin:0 0 10px;font-size:13.5px;line-height:1.55;color:#374151;}
.cx-prop-act{display:flex;gap:10px;margin-top:16px;}
.cx-prop-act button{flex:1;border:none;border-radius:10px;padding:12px;font-weight:800;font-size:13.5px;cursor:pointer;}
.cx-prop-oui{background:#b45309;color:#fff;}
.cx-prop-non{background:#f3f4f6;color:#374151;}
.cx-bandeau{display:none;position:fixed;left:50%;transform:translateX(-50%);top:12px;z-index:2600;width:calc(100% - 24px);max-width:760px;background:#7f1d1d;color:#fff;border-radius:14px;padding:12px 16px;box-shadow:0 10px 40px rgba(0,0,0,.4);align-items:center;gap:14px;flex-wrap:wrap;}
.cx-bandeau-txt{flex:1;min-width:220px;font-size:13px;line-height:1.45;}
.cx-bandeau-txt span{opacity:.92;font-size:12.5px;}
.cx-bandeau-act{display:flex;gap:8px;flex-wrap:wrap;}
.cx-b-rouge,.cx-b-gris{border:none;border-radius:8px;padding:9px 14px;font-weight:800;font-size:12.5px;cursor:pointer;text-decoration:none;display:inline-block;}
.cx-b-rouge{background:#fff;color:#991b1b;}
.cx-b-gris{background:rgba(255,255,255,.18);color:#fff;}
.cx-b-rouge:disabled{opacity:.6;cursor:default;}
`;
    document.head.appendChild(st);
  }

  function ilYa(d) {
    if (!d) return '';
    const t = new Date(String(d).replace(' ', 'T') + 'Z').getTime();
    if (!t) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 90) return "à l'instant";
    if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
    return 'il y a ' + Math.round(s / 86400) + ' j';
  }

  function dans(d) {
    if (!d) return '';
    const t = new Date(String(d).replace(' ', 'T') + 'Z').getTime();
    if (!t) return '';
    const s = (t - Date.now()) / 1000;
    if (s <= 0) return 'maintenant';
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min';
    if (s < 86400) return Math.round(s / 3600) + ' h';
    const j = Math.floor(s / 86400), h = Math.floor((s - j * 86400) / 3600);
    return j + ' j' + (h && j < 3 ? ' ' + h + ' h' : '');
  }

  function majBouton() {
    const btn = document.getElementById('cx-btn');
    if (!btn) return;
    const n = etat.total;
    const nLies = (etat.comptes_lies || []).reduce((s, c) => s + (c.total || 0), 0);
    btn.style.display = 'inline-flex';
    btn.classList.toggle('cx-alerte', n > 1);
    btn.querySelector('.cx-n').textContent = String(n);
    btn.title = n > 1
      ? `Votre compte est ouvert sur ${n} appareils — cliquez pour vérifier`
      : 'Votre compte n\'est ouvert que sur cet appareil';
    if (nLies) btn.title += ` (+ ${nLies} connexion${nLies > 1 ? 's' : ''} sur vos comptes liés)`;
  }

  async function charger() {
    try {
      const r = await api('GET', '/auth/connexions');
      etat = { connexions: r.connexions || [], total: r.total || 0, comptes_lies: r.comptes_lies || [], en_attente: r.en_attente || [], incidents: r.incidents_30j || 0,
        principaux: r.principaux || {}, proposer: !!r.proposer_principal, exempt: !!r.exempt, categorie: r.categorie_courante || null };
      majBouton();
      majBandeau();
      majProposition();
    } catch (e) { /* silencieux : la pastille reste masquée */ }
  }

  /* ── Bandeau d'alerte (étape 2) : une connexion attend confirmation depuis un autre appareil, ou
     plusieurs tentatives suspectes ont eu lieu ces 30 derniers jours (=> on recommande de changer
     de mot de passe). Affiché sur l'appareil DÉJÀ connecté, mis à jour toutes les 30 s. ── */
  const ignorees = new Set();
  function bandeau() {
    let b = document.getElementById('cx-bandeau');
    if (!b) {
      b = document.createElement('div');
      b.id = 'cx-bandeau';
      b.className = 'cx-bandeau';
      b.setAttribute('role', 'alert');
      document.body.appendChild(b);
    }
    return b;
  }
  function cacherBandeau() { const b = document.getElementById('cx-bandeau'); if (b) b.style.display = 'none'; }
  function aujourdhui() { return new Date().toISOString().slice(0, 10); }
  function rappelMdpDejaVu() { try { return localStorage.getItem('cx_mdp_rappel') === aujourdhui(); } catch (_) { return false; } }
  function noterRappelMdp() { try { localStorage.setItem('cx_mdp_rappel', aujourdhui()); } catch (_) {} }

  function majBandeau() {
    const attente = (etat.en_attente || []).filter(d => !ignorees.has(d.id));
    if (attente.length) {
      const d = attente[0];
      const b = bandeau();
      b.style.display = 'flex';
      b.innerHTML = `<div class="cx-bandeau-txt"><strong>⚠️ Une connexion à votre compte attend votre confirmation</strong><br>
        <span>Depuis ${esc(d.etiquette)}${d.lieu ? ' — ' + esc(d.lieu) : ''}. Si c'est vous, saisissez votre Code de Sécurité sur cet appareil ; sinon, bloquez-la.</span></div>
        <div class="cx-bandeau-act">
          <button type="button" class="cx-b-rouge" data-id="${esc(d.id)}">Ce n'est pas moi — Bloquer</button>
          <button type="button" class="cx-b-gris" data-id="${esc(d.id)}">C'est moi</button>
        </div>`;
      b.querySelector('.cx-b-rouge').onclick = async (e) => {
        e.target.disabled = true;
        try {
          const r = await api('POST', '/auth/connexions/en-attente/' + encodeURIComponent(d.id) + '/bloquer');
          ignorees.add(d.id);
          etat.incidents = r.incidents_30j || etat.incidents + 1;
          await charger();
          if (etat.incidents >= 2) montrerRappelMdp(true); else cacherBandeau();
        } catch (err) { e.target.disabled = false; }
      };
      b.querySelector('.cx-b-gris').onclick = () => { ignorees.add(d.id); majBandeau(); };
      return;
    }
    if ((etat.incidents || 0) >= 2 && !rappelMdpDejaVu()) { montrerRappelMdp(false); return; }
    cacherBandeau();
  }

  function montrerRappelMdp(apresBlocage) {
    const b = bandeau();
    b.style.display = 'flex';
    b.innerHTML = `<div class="cx-bandeau-txt"><strong>🔒 ${apresBlocage ? 'Connexion bloquée.' : 'Plusieurs tentatives suspectes.'} Changez votre mot de passe.</strong><br>
      <span>Des connexions inhabituelles à votre compte ont été signalées à ${etat.incidents} reprises ces 30 derniers jours. Changer votre mot de passe déconnecte aussitôt tous les autres appareils.</span></div>
      <div class="cx-bandeau-act">
        <a class="cx-b-rouge" href="parametres-compte.html">Changer mon mot de passe</a>
        <button type="button" class="cx-b-gris" id="cx-plus-tard">Plus tard</button>
      </div>`;
    document.getElementById('cx-plus-tard').onclick = () => { noterRappelMdp(); cacherBandeau(); };
  }

  const ICONES = { mobile: '📱', tablette: '📟', ordinateur: '💻' };

  function rendreListe() {
    const liste = document.getElementById('cx-liste');
    const pied = document.getElementById('cx-pied');
    if (!liste || !pied) return;
    if (!etat.connexions.length) {
      liste.innerHTML = '<div class="cx-vide">Aucune connexion enregistrée.</div>';
    } else {
      liste.innerHTML = etat.connexions.map(c => `
        <div class="cx-item${c.courante ? ' cx-courante' : ''}" data-id="${esc(c.id)}">
          <div class="cx-ico" aria-hidden="true">${ICONES[c.type] || '💻'}</div>
          <div class="cx-info">
            <div class="cx-nom">${esc(c.etiquette)}${c.courante ? '<span class="cx-tag">Cet appareil</span>' : ''}${c.principal ? '<span class="cx-tag cx-principal">⭐ Principal</span>' : ''}</div>
            <div class="cx-meta">${c.lieu ? '📍 ' + esc(c.lieu) + ' · ' : ''}Active ${esc(ilYa(c.derniere_activite))}${c.ip ? ' · réseau ' + esc(c.ip) : ''}</div>
            ${etat.exempt ? '' : (c.principal
              ? `<div class="cx-exp cx-long">Reste connecté tant que vous l'utilisez (renouvelé 30 jours à chaque visite).</div>`
              : `<div class="cx-exp">Déconnexion automatique dans ${esc(dans(c.expire))}.</div>`)}
            ${c.courante && !etat.exempt ? (c.principal
              ? `<button type="button" class="cx-star cx-retirer" data-act="retirer">Ne plus en faire mon appareil principal</button>`
              : `<button type="button" class="cx-star" data-act="principal">⭐ En faire mon ${c.categorie === 'mobile' ? 'téléphone' : 'ordinateur'} principal</button>`) : ''}
          </div>
          ${c.courante ? '' : `<button type="button" class="cx-off" data-act="off" data-id="${esc(c.id)}">Déconnecter</button>`}
        </div>`).join('');
    }
    const autres = etat.connexions.filter(c => !c.courante).length;
    const lies = etat.comptes_lies || [];
    const nLies = lies.reduce((s, c) => s + (c.total || 0), 0);
    let html = '<div id="cx-dsid-zone"></div>';
    if (autres > 0 || nLies > 0) {
      if (lies.length) {
        html += `<label class="cx-lies"><input type="checkbox" id="cx-lies-chk" ${nLies ? 'checked' : ''}>
          <span>Déconnecter aussi mes comptes liés (${esc(lies.map(c => c.nom).join(', '))}) : ils seront fermés partout, vous restez connecté à ce compte seulement.</span></label>`;
      }
      html += `<button type="button" class="cx-tous" id="cx-tous">Déconnecter tous les autres appareils</button>`;
    }
    html += `<div class="cx-msg" id="cx-msg" role="status" aria-live="polite"></div>
      <div class="cx-aide">Vous ne reconnaissez pas un appareil ? Déconnectez-le, puis <a href="parametres-compte.html">changez votre mot de passe</a> : cela ferme aussi toutes les autres sessions.</div>`;
    pied.innerHTML = html;
  }

  function creerModale() {
    if (document.getElementById('cx-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'cx-overlay';
    ov.className = 'cx-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'cx-titre');
    ov.innerHTML = `<div class="cx-box">
      <div class="cx-head">
        <div><h3 id="cx-titre">🛡 Mes connexions</h3>
        <p>Les appareils sur lesquels votre compte est actuellement ouvert. Si l'un d'eux n'est pas à vous, déconnectez-le immédiatement.</p></div>
        <button type="button" class="cx-close" id="cx-close" aria-label="Fermer">✕</button>
      </div>
      <div class="cx-liste" id="cx-liste"></div>
      <div class="cx-pied" id="cx-pied"></div>
    </div>`;
    document.body.appendChild(ov);
    const fermer = () => ov.classList.remove('open');
    ov.addEventListener('click', (e) => { if (e.target === ov) fermer(); });
    document.getElementById('cx-close').addEventListener('click', fermer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermer(); });
    ov.addEventListener('click', async (e) => {
      const off = e.target.closest('[data-act="off"]');
      if (off) {
        off.disabled = true;
        try { await api('POST', '/auth/connexions/' + encodeURIComponent(off.dataset.id) + '/deconnecter'); }
        catch (err) { off.disabled = false; return; }
        await charger(); rendreListe();
        const m = document.getElementById('cx-msg'); if (m) m.textContent = 'Appareil déconnecté.';
        return;
      }
      if (e.target.closest('[data-act="principal"]')) { await designerPrincipal(null); return; }
      if (e.target.closest('[data-act="retirer"]')) {
        try { await api('POST', '/auth/connexions/principal/retirer'); await charger(); rendreListe(); const m = document.getElementById('cx-msg'); if (m) m.textContent = 'Cet appareil n\'est plus votre appareil principal : il sera déconnecté automatiquement dans 3 jours.'; }
        catch (err) { const m = document.getElementById('cx-msg'); if (m) m.textContent = err.message || 'Erreur.'; }
        return;
      }
      if (e.target.id === 'cx-dsid-ok') { await designerPrincipal((document.getElementById('cx-dsid-champ') || {}).value || ''); return; }
      if (e.target.id === 'cx-tous') {
        const tous = e.target;
        const lies = document.getElementById('cx-lies-chk');
        tous.disabled = true;
        try {
          const r = await api('POST', '/auth/connexions/deconnecter-autres', { tous_les_comptes_lies: !!(lies && lies.checked) });
          await charger(); rendreListe();
          const m = document.getElementById('cx-msg');
          if (m) m.textContent = `${r.deconnectees || 0} appareil${(r.deconnectees || 0) > 1 ? 's' : ''} déconnecté${(r.deconnectees || 0) > 1 ? 's' : ''}` + (r.deconnectees_comptes_lies ? ` · ${r.deconnectees_comptes_lies} connexion(s) fermée(s) sur vos comptes liés` : '') + '.';
        } catch (err) { tous.disabled = false; }
      }
    });
  }

  /* Désigne CET appareil comme principal. Si la place est prise, le serveur répond « DS-ID requis » :
     on affiche alors une zone de saisie dans la fenêtre. Utilisable depuis la fenêtre ET la proposition. */
  async function designerPrincipal(dsId) {
    const msg = (t) => { const m = document.getElementById('cx-msg'); if (m) m.textContent = t; };
    try {
      await api('POST', '/auth/connexions/principal', dsId ? { ds_id: dsId } : {});
      await charger();
      if (document.getElementById('cx-liste')) rendreListe();
      msg('✅ Cet appareil est maintenant votre appareil principal : vous y restez connecté 30 jours.');
      return true;
    } catch (err) {
      const zone = document.getElementById('cx-dsid-zone');
      if (err.data && err.data.ds_id_requis && zone) {
        zone.innerHTML = `<div class="cx-dsid-zone">${esc(err.message)}
          <input id="cx-dsid-champ" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Votre Code de Sécurité (DS-ID)">
          <button type="button" id="cx-dsid-ok">Remplacer</button></div>`;
        const c = document.getElementById('cx-dsid-champ'); if (c) c.focus();
      } else if (zone && dsId) {
        const c = zone.querySelector('.cx-dsid-zone');
        if (c) c.insertAdjacentHTML('beforeend', `<div style="color:#b91c1c;font-weight:700;margin-top:6px;">${esc(err.message || 'Erreur.')}</div>`);
      } else { msg(err.message || 'Erreur.'); }
      return false;
    }
  }

  /* Proposition « est-ce votre appareil principal ? » : une fois que le serveur dit qu'il y a une place
     libre pour cette catégorie d'appareil. Refus mémorisé 7 jours sur cet appareil. */
  function propositionRefusee() { try { const t = Number(localStorage.getItem('cx_prop_refus') || 0); return Date.now() - t < 7 * 24 * 3600 * 1000; } catch (_) { return false; } }
  function majProposition() {
    if (!etat.proposer || propositionRefusee() || document.getElementById('cx-prop-overlay')) return;
    injecterStyles();
    const quoi = etat.categorie === 'mobile' ? 'téléphone' : 'ordinateur';
    const ov = document.createElement('div');
    ov.id = 'cx-prop-overlay';
    ov.className = 'cx-overlay open';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'cx-prop-titre');
    ov.innerHTML = `<div class="cx-prop-box">
      <h3 id="cx-prop-titre">⭐ Est-ce votre ${quoi} principal ?</h3>
      <p>Sur votre appareil principal, vous restez connecté <strong>30 jours</strong> d'affilée. Sur tout autre appareil, la connexion est limitée à <strong>3 jours</strong> pour protéger votre compte.</p>
      <p style="font-size:12.5px;color:#6b7280;">Vous pouvez avoir un ordinateur principal et un téléphone (ou tablette) principal, et en changer plus tard depuis « Mes connexions ».</p>
      <div class="cx-prop-act">
        <button type="button" class="cx-prop-non" id="cx-prop-non">Pas maintenant</button>
        <button type="button" class="cx-prop-oui" id="cx-prop-oui">Oui, c'est mon ${quoi} principal</button>
      </div></div>`;
    document.body.appendChild(ov);
    document.getElementById('cx-prop-non').onclick = () => { try { localStorage.setItem('cx_prop_refus', String(Date.now())); } catch (_) {} ov.remove(); };
    document.getElementById('cx-prop-oui').onclick = async (e) => {
      e.target.disabled = true;
      const ok = await designerPrincipal(null);
      ov.remove();
      if (!ok && window.ouvrirMesConnexions) window.ouvrirMesConnexions();
    };
    document.getElementById('cx-prop-oui').focus();
  }

  window.ouvrirMesConnexions = async function () {
    injecterStyles();
    creerModale();
    await charger();
    rendreListe();
    document.getElementById('cx-overlay').classList.add('open');
    document.getElementById('cx-close').focus();
  };

  injecterStyles();
  charger();
  // Rafraîchissement discret : une connexion en attente doit apparaître sans recharger la page.
  setInterval(() => { if (!document.hidden) charger(); }, 30000);
})();
