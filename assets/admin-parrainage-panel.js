/* ═══ PARRAINAGE & INVITATIONS — panneau d'administration (dashboard-administrateur.html,
   2026-09-20, demande explicite) ═══
   Chaque invitation est déjà référencée à son créateur (invitations.inviter_user_id, posé dès
   la création) — ce panneau rend cette référence visible : liste TOUTES les invitations de
   TOUS les comptes (GET /api/admin/parrainage/invitations), avec les mêmes actions que la
   personne qui les a créées. Aucune nouvelle route de mutation : PUT/DELETE/desactiver/
   reactiver de /api/parrainage/invitations/:id autorisent déjà un administrateur à agir sur une
   invitation qui n'est pas la sienne (vérifié dans server/index.js avant d'écrire ce fichier).
   Nécessite dans la page hôte : la fonction api(), et les éléments #pa-adm-stats,
   #pa-adm-recherche, #pa-adm-liste, #pa-adm-edit-overlay + ses champs, #pa-adm-confirm-overlay
   + ses champs (voir dashboard-administrateur.html, section #section-parrainage-admin). */

function paAdmEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

let _paAdmCache = [];
let _paAdmDomaines = [];
let _paAdmChargee = false;

async function paAdminCharger() {
  const zone = document.getElementById('pa-adm-liste');
  if (!zone) return;
  try {
    const [{ invitations }, { domaines }] = await Promise.all([
      api('GET', '/admin/parrainage/invitations'),
      _paAdmDomaines.length ? Promise.resolve({ domaines: _paAdmDomaines }) : api('GET', '/parrainage/domaines'),
    ]);
    _paAdmDomaines = domaines;
    _paAdmCache = invitations;
    _paAdmChargee = true;
    paAdmRenderStats(invitations);
    paAdmRenderListe(invitations);
  } catch (e) {
    zone.innerHTML = `<div class="notice" style="color:#dc2626;">Erreur de chargement : ${paAdmEsc(e.message || 'inconnue')}</div>`;
  }
}

function paAdmRenderStats(invitations) {
  const el = document.getElementById('pa-adm-stats');
  if (!el) return;
  const actives = invitations.filter(i => i.statut === 'active').length;
  const comptesCreateurs = new Set(invitations.map(i => i.inviter_user_id)).size;
  const totalInscrits = invitations.reduce((s, i) => s + (i.registration_count || 0), 0);
  const totalVues = invitations.reduce((s, i) => s + (i.visit_count || 0), 0);
  el.innerHTML = [
    ['Invitations', invitations.length], ['Actives', actives], ['Comptes créateurs', comptesCreateurs],
    ['Comptes créés', totalInscrits], ['Vues cumulées', totalVues],
  ].map(([lbl, val]) => `
    <div class="card" style="text-align:center;padding:12px;">
      <div style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;">${lbl}</div>
      <div style="font-size:22px;font-weight:800;">${val}</div>
    </div>`).join('');
}

function paAdmRenderListe(invitations) {
  const zone = document.getElementById('pa-adm-liste');
  if (!invitations.length) {
    zone.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted);"><div style="font-size:32px;margin-bottom:8px;">🤝</div><p>Aucune invitation trouvée.</p></div>`;
    return;
  }
  zone.innerHTML = invitations.map(inv => {
    const actif = inv.statut === 'active';
    const createurNom = [inv.createur_prenom, inv.createur_nom].filter(Boolean).join(' ') || 'Compte introuvable';
    return `<div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 16px;margin-bottom:10px;">
      <div style="flex:1;min-width:240px;">
        <div style="font-weight:700;font-size:13.5px;">${paAdmEsc(inv.nom || inv.domaine_nom)}
          <span style="font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:99px;${actif ? 'background:rgba(21,128,61,.12);color:#15803d;' : 'background:rgba(220,38,38,.12);color:#dc2626;'}">${actif ? 'Active' : 'Désactivée'}</span>
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:3px;">${paAdmEsc(inv.domaine_icone || '')} ${paAdmEsc(inv.domaine_nom)}${inv.sous_domaine_nom ? ' · ' + paAdmEsc(inv.sous_domaine_nom) : ''} · <span style="font-family:monospace;background:var(--bg);border-radius:6px;padding:1px 6px;">${paAdmEsc(inv.code)}</span></div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:3px;">👁️ ${inv.visit_count} vues · 📷 ${inv.qr_scan_count} scans · ✅ ${inv.registration_count} comptes créés</div>
        <div style="font-size:11.5px;color:#2563EB;margin-top:5px;font-weight:600;">👤 Créée par ${paAdmEsc(createurNom)}${inv.createur_email ? ' · ' + paAdmEsc(inv.createur_email) : ''}${inv.createur_role ? ' · ' + paAdmEsc(inv.createur_role) : ''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="pa-adm-modifier" data-id="${inv.id}" style="background:var(--bg);border:1.5px solid var(--border);border-radius:9px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;">✏️ Modifier</button>
        ${actif
          ? `<button type="button" class="pa-adm-desactiver" data-id="${inv.id}" style="background:var(--bg);border:1.5px solid var(--border);border-radius:9px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;">⏸️ Désactiver</button>`
          : `<button type="button" class="pa-adm-reactiver" data-id="${inv.id}" style="background:var(--bg);border:1.5px solid var(--border);border-radius:9px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;">▶️ Réactiver</button>`}
        <button type="button" class="pa-adm-supprimer" data-id="${inv.id}" data-nom="${paAdmEsc(inv.nom || inv.domaine_nom)}" style="background:#fef2f2;color:#991b1b;border:1.5px solid #fecaca;border-radius:9px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;">🗑️ Supprimer</button>
      </div>
    </div>`;
  }).join('');
}

/* ── Recherche (par nom d'invitation, code, ou compte créateur) — filtrage local, la liste
   complète est déjà en cache et reste petite (nombre d'invitations, pas de comptes). ── */
function paAdmFiltrer() {
  const q = (document.getElementById('pa-adm-recherche')?.value || '').trim().toLowerCase();
  if (!q) { paAdmRenderListe(_paAdmCache); return; }
  const filtrees = _paAdmCache.filter(inv => [
    inv.nom, inv.code, inv.createur_nom, inv.createur_prenom, inv.createur_email,
  ].filter(Boolean).some(v => String(v).toLowerCase().includes(q)));
  paAdmRenderListe(filtrees);
}

document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('pa-adm-liste');
  if (!zone) return; // panneau absent de cette page (dashboard-administrateur-junior.html, etc.)

  document.getElementById('pa-adm-recherche')?.addEventListener('input', paAdmFiltrer);

  zone.addEventListener('click', async (e) => {
    const desact = e.target.closest('.pa-adm-desactiver');
    if (desact) {
      desact.disabled = true;
      try { await api('PATCH', `/parrainage/invitations/${desact.dataset.id}/desactiver`); await paAdminCharger(); }
      catch (e2) { alert(e2.message || 'Impossible de désactiver.'); desact.disabled = false; }
      return;
    }
    const react = e.target.closest('.pa-adm-reactiver');
    if (react) {
      react.disabled = true;
      try { await api('PATCH', `/parrainage/invitations/${react.dataset.id}/reactiver`); await paAdminCharger(); }
      catch (e2) { alert(e2.message || 'Impossible de réactiver.'); react.disabled = false; }
      return;
    }
    const modif = e.target.closest('.pa-adm-modifier');
    if (modif) {
      const inv = _paAdmCache.find(i => Number(i.id) === Number(modif.dataset.id));
      if (inv) paAdmOuvrirEdition(inv);
      return;
    }
    const suppr = e.target.closest('.pa-adm-supprimer');
    if (suppr) paAdmOuvrirConfirmSuppression(suppr.dataset.id, suppr.dataset.nom);
  });

  /* ── Modification ── */
  const editOverlay = document.getElementById('pa-adm-edit-overlay');
  const selDomaine = document.getElementById('pa-adm-e-domaine');
  const sousDomaineZone = document.getElementById('pa-adm-e-sous-domaine-zone');
  let invitationEnCours = null;

  function paAdmRafraichirSousDomaine(sousDomaineIdActuel, sousDomaineLibreActuel) {
    const opt = selDomaine.selectedOptions[0];
    const sousDomaines = opt ? JSON.parse(opt.dataset.sousDomaines || '[]') : [];
    if (sousDomaines.length) {
      sousDomaineZone.innerHTML = `<label style="font-size:12.5px;font-weight:700;">Sous-domaine <span style="font-weight:400;color:var(--muted);">(facultatif)</span></label>
        <select id="pa-adm-e-sous-domaine" class="input-field" style="width:100%;margin-top:4px;box-sizing:border-box;">
          <option value="">— Aucun —</option>
          ${sousDomaines.map(sd => `<option value="${sd.id}"${Number(sd.id) === Number(sousDomaineIdActuel) ? ' selected' : ''}>${paAdmEsc(sd.nom)}</option>`).join('')}
        </select>`;
    } else if (opt && opt.value) {
      sousDomaineZone.innerHTML = `<label style="font-size:12.5px;font-weight:700;">Sous-domaine <span style="font-weight:400;color:var(--muted);">(facultatif)</span></label>
        <input type="text" id="pa-adm-e-sous-domaine-libre" class="input-field" style="width:100%;margin-top:4px;box-sizing:border-box;" value="${paAdmEsc(sousDomaineLibreActuel || '')}" placeholder="Précisez si utile">`;
    } else {
      sousDomaineZone.innerHTML = '';
    }
  }

  function paAdmOuvrirEdition(inv) {
    invitationEnCours = inv;
    document.getElementById('pa-adm-e-nom').value = inv.nom || '';
    document.getElementById('pa-adm-e-err').textContent = '';
    if (!selDomaine.options.length) {
      _paAdmDomaines.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id; opt.textContent = `${d.icone} ${d.nom}`;
        opt.dataset.sousDomaines = JSON.stringify(d.sous_domaines || []);
        selDomaine.appendChild(opt);
      });
      selDomaine.addEventListener('change', () => paAdmRafraichirSousDomaine(null, null));
    }
    selDomaine.value = inv.domaine_id;
    paAdmRafraichirSousDomaine(inv.sous_domaine_id, inv.sous_domaine_libre);
    editOverlay.style.display = 'flex';
  }

  document.getElementById('pa-adm-e-annuler')?.addEventListener('click', () => { editOverlay.style.display = 'none'; });
  editOverlay?.addEventListener('click', e => { if (e.target === editOverlay) editOverlay.style.display = 'none'; });
  document.getElementById('pa-adm-e-enregistrer')?.addEventListener('click', async () => {
    const btn = document.getElementById('pa-adm-e-enregistrer');
    const err = document.getElementById('pa-adm-e-err');
    err.textContent = '';
    const domaineId = selDomaine.value;
    if (!domaineId) { err.textContent = 'Veuillez sélectionner un domaine.'; return; }
    const sousDomaineSel = document.getElementById('pa-adm-e-sous-domaine');
    const sousDomaineLibre = document.getElementById('pa-adm-e-sous-domaine-libre');
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      await api('PUT', `/parrainage/invitations/${invitationEnCours.id}`, {
        nom: document.getElementById('pa-adm-e-nom').value.trim() || null,
        domaine_id: domaineId,
        sous_domaine_id: sousDomaineSel ? sousDomaineSel.value || null : null,
        sous_domaine_libre: sousDomaineLibre ? sousDomaineLibre.value.trim() || null : null,
        // Bannière jamais exposée dans cette modale admin (moderation, pas re-création de
        // contenu marketing) — on la renvoie inchangée pour ne pas l'effacer : PUT écrit
        // banniere_url tel quel, sans COALESCE côté serveur.
        banniere_url: invitationEnCours.banniere_url || null,
      });
      editOverlay.style.display = 'none';
      await paAdminCharger();
    } catch (e2) {
      err.textContent = e2.message || "Impossible d'enregistrer les modifications.";
    } finally {
      btn.disabled = false; btn.textContent = 'Enregistrer';
    }
  });

  /* ── Confirmation de suppression (jamais de confirm() natif) ── */
  const confirmOverlay = document.getElementById('pa-adm-confirm-overlay');
  let invitationASupprimer = null;
  function paAdmOuvrirConfirmSuppression(id, nom) {
    invitationASupprimer = id;
    document.getElementById('pa-adm-confirm-texte').textContent =
      `« ${nom} » sera supprimée définitivement. Le lien et le QR Code cesseront de fonctionner immédiatement.`;
    confirmOverlay.style.display = 'flex';
  }
  document.getElementById('pa-adm-confirm-annuler')?.addEventListener('click', () => { confirmOverlay.style.display = 'none'; invitationASupprimer = null; });
  confirmOverlay?.addEventListener('click', e => { if (e.target === confirmOverlay) { confirmOverlay.style.display = 'none'; invitationASupprimer = null; } });
  document.getElementById('pa-adm-confirm-supprimer')?.addEventListener('click', async (e) => {
    if (!invitationASupprimer) return;
    e.target.disabled = true;
    try {
      await api('DELETE', `/parrainage/invitations/${invitationASupprimer}`);
      confirmOverlay.style.display = 'none';
      invitationASupprimer = null;
      await paAdminCharger();
    } catch (e2) {
      alert(e2.message || 'Impossible de supprimer.');
    } finally {
      e.target.disabled = false;
    }
  });
});
