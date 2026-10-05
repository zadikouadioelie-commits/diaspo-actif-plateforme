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
      etat = { connexions: r.connexions || [], total: r.total || 0, comptes_lies: r.comptes_lies || [] };
      majBouton();
    } catch (e) { /* silencieux : la pastille reste masquée */ }
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
            <div class="cx-nom">${esc(c.etiquette)}${c.courante ? '<span class="cx-tag">Cet appareil</span>' : ''}</div>
            <div class="cx-meta">${c.lieu ? '📍 ' + esc(c.lieu) + ' · ' : ''}Active ${esc(ilYa(c.derniere_activite))}${c.ip ? ' · réseau ' + esc(c.ip) : ''}</div>
          </div>
          ${c.courante ? '' : `<button type="button" class="cx-off" data-act="off" data-id="${esc(c.id)}">Déconnecter</button>`}
        </div>`).join('');
    }
    const autres = etat.connexions.filter(c => !c.courante).length;
    const lies = etat.comptes_lies || [];
    const nLies = lies.reduce((s, c) => s + (c.total || 0), 0);
    let html = '';
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
})();
