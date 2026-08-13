/* ===========================================================
   assets/admin-moderation-panels.js — Panneaux Modération + Demandes de suppression
   ===========================================================
   COPIE SYNCHRONISÉE, PAS UNE EXTRACTION — voir dashboard-administrateur.html
   (recherche "Signalement de compte & Gestion des litiges" et "Demandes de
   suppression de compte (RGPD)" / "Logique modération comptes & contenus").

   Une extraction propre en un seul fichier partagé s'est avérée risquée dans le
   temps imparti : dans dashboard-administrateur.html, les fonctions Modération /
   Demandes de suppression ne sont PAS contiguës — elles sont entrelacées avec
   d'autres modules non concernés par la délégation Administrateurs Junior
   (Journal d'erreurs, Messages techniques). Découper ce fichier massif en
   plusieurs fragments précis pour extraire proprement aurait présenté un risque
   réel de casser du code de modération déployé et utilisé quotidiennement.

   Choix assumé (fallback explicitement prévu au plan) : copie ici, chargée par
   dashboard-administrateur.html ET dashboard-administrateur-junior.html. Toute
   correction de bug dans ces fonctions doit être répercutée dans LES DEUX
   fichiers tant qu'une vraie extraction n'aura pas été faite. Dépend des
   globales définies par assets/app.js : api(), et de esc() (définie localement
   dans chaque page hôte).

   Sécurité inchangée : ce fichier ne fait que du rendu et des appels réseau —
   chaque route appelée reste protégée côté serveur (server/index.js,
   AdminJunior.hasAdminPermission), qu'on soit sur le dashboard admin ou junior. */

/* ===== Onglets internes du panneau Modération (comptes / contenus / signalements) ===== */
let _modeTab = 'comptes';
function switchModeTab(tab) {
  _modeTab = tab;
  ['comptes','contenus','signalements'].forEach(t => {
    const panel = document.getElementById(`mtab-${t}-panel`);
    const btn   = document.getElementById(`mtab-${t}`);
    if (panel) panel.style.display = t === tab ? '' : 'none';
    if (btn)   btn.className = 'btn ' + (t === tab ? 'btn-orange' : 'btn-outline');
  });
  if (tab === 'comptes') loadModerationComptes('en_attente');
  else if (tab === 'contenus') loadModerationContenus();
  else if (tab === 'signalements') loadDossiersSignalement();
}

/* ===== Signalement de compte & Gestion des litiges ===== */
const SIG_STATUT_BADGE = {
  nouveau: ['#dbeafe','#1e40af'], en_analyse: ['#fef3c7','#92400e'], litige_ouvert: ['#fde68a','#92400e'],
  decision_attente: ['#e0e7ff','#3730a3'], classe_sans_suite: ['#dcfce7','#166534'],
  archive: ['#f3f4f6','#4b5563'], suspendu: ['#fee2e2','#991b1b'],
};
const SIG_STATUT_LABEL = {
  nouveau: '🆕 Nouveau', en_analyse: '🔎 En analyse', litige_ouvert: '⚖️ Litige ouvert',
  decision_attente: '⏳ Décision en attente', classe_sans_suite: '✅ Classé sans suite',
  archive: '📁 Archivé', suspendu: '⛔ Suspendu',
};
const SIG_GRAVITE_LABEL = { 1: '🟢 N1', 2: '🟡 N2', 3: '🟠 N3', 4: '🔴 N4' };
const SIG_TYPE_LABEL = { utilisateur: 'Particulier', initiative: 'Initiative/Entreprise/Assoc.', collectivite: 'Collectivité' };

async function loadDossiersSignalement() {
  const el = document.getElementById('sig-dossiers-list');
  if (el) el.innerHTML = '<p style="color:var(--muted);font-size:13px;">Chargement…</p>';
  const statut = document.getElementById('sig-filtre-statut')?.value || '';
  const gravite = document.getElementById('sig-filtre-gravite')?.value || '';
  const type = document.getElementById('sig-filtre-type')?.value || '';
  const qs = new URLSearchParams();
  if (statut) qs.set('statut', statut);
  if (gravite) qs.set('gravite', gravite);
  if (type) qs.set('cible_type', type);
  try {
    const data = await api('GET', `/admin/dossiers-signalement${qs.toString() ? '?' + qs.toString() : ''}`);
    const badge = document.getElementById('signalements-badge');
    const enAttente = (data.stats.nouveau || 0) + (data.stats.litige_ouvert || 0) + (data.stats.decision_attente || 0);
    if (badge) { badge.textContent = enAttente; badge.style.display = enAttente ? '' : 'none'; }

    if (!el) return;
    if (!data.dossiers.length) { el.innerHTML = '<p style="color:var(--muted);font-size:13px;">Aucun dossier.</p>'; return; }
    el.innerHTML = `
      <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <thead><tr style="text-align:left;color:var(--muted);border-bottom:1.5px solid var(--border);">
          <th style="padding:8px 6px;">Dossier</th><th style="padding:8px 6px;">Date</th>
          <th style="padding:8px 6px;">Compte signalé</th><th style="padding:8px 6px;">Signalant</th>
          <th style="padding:8px 6px;">Motif</th><th style="padding:8px 6px;">Gravité</th>
          <th style="padding:8px 6px;">Statut</th><th></th>
        </tr></thead>
        <tbody>
        ${data.dossiers.map(r => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:8px 6px;font-weight:700;">${r.numero_dossier || '#' + r.id}</td>
            <td style="padding:8px 6px;color:var(--muted);">${(r.created_at || '').slice(0, 10)}</td>
            <td style="padding:8px 6px;">${esc(r.cible_nom || '#' + r.cible_id)}<br><span style="font-size:10.5px;color:var(--muted);">${SIG_TYPE_LABEL[r.cible_type] || r.cible_type}</span></td>
            <td style="padding:8px 6px;">${esc(r.reporter_nom || '#' + r.reporter_id)}</td>
            <td style="padding:8px 6px;">${esc(r.motif)}</td>
            <td style="padding:8px 6px;">${r.gravite ? SIG_GRAVITE_LABEL[r.gravite] : '—'}</td>
            <td style="padding:8px 6px;"><span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;background:${(SIG_STATUT_BADGE[r.statut] || ['#f3f4f6', '#4b5563'])[0]};color:${(SIG_STATUT_BADGE[r.statut] || ['#f3f4f6', '#4b5563'])[1]};">${SIG_STATUT_LABEL[r.statut] || r.statut}</span></td>
            <td style="padding:8px 6px;"><button class="btn btn-sm btn-outline" onclick="viewDossierSignalement(${r.id})">👁 Voir</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>`;
  } catch (e) {
    if (el) el.innerHTML = `<p style="color:red;font-size:13px;">Erreur : ${e.message}</p>`;
  }
}

async function viewDossierSignalement(id) {
  const zone = document.getElementById('sig-dossier-detail');
  zone.style.display = 'block';
  zone.innerHTML = '<div class="card"><p style="color:var(--muted);font-size:13px;">Chargement du dossier…</p></div>';
  zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const d = await api('GET', `/admin/dossiers-signalement/${id}`);
    renderDossierSignalement(d);
  } catch (e) {
    zone.innerHTML = `<div class="card"><p style="color:red;font-size:13px;">Erreur : ${e.message}</p></div>`;
  }
}

function renderDossierSignalement(d) {
  const zone = document.getElementById('sig-dossier-detail');
  const s = d.dossier;
  const suspInfo = s.suspendu_definitif ? '⛔ Suspendu définitivement'
    : (s.suspendu_jusqu_au && new Date(s.suspendu_jusqu_au) > new Date() ? `⛔ Suspendu jusqu'au ${new Date(s.suspendu_jusqu_au).toLocaleDateString('fr-FR')}` : '');
  let preuves = []; try { preuves = JSON.parse(s.preuves_json || '[]'); } catch (e) {}

  zone.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <div>
          <h3 style="margin:0;">${s.numero_dossier}</h3>
          <span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;background:${(SIG_STATUT_BADGE[s.statut] || ['#f3f4f6', '#4b5563'])[0]};color:${(SIG_STATUT_BADGE[s.statut] || ['#f3f4f6', '#4b5563'])[1]};">${SIG_STATUT_LABEL[s.statut] || s.statut}</span>
          ${suspInfo ? `<span style="margin-left:8px;font-size:12px;color:#991b1b;font-weight:700;">${suspInfo}</span>` : ''}
        </div>
        <button class="btn btn-sm btn-outline" onclick="document.getElementById('sig-dossier-detail').style.display='none'">✕ Fermer</button>
      </div>

      <div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <h4 style="margin:0 0 8px;font-size:13px;">📋 Signalement</h4>
        <p style="font-size:12.5px;margin:2px 0;"><strong>Date :</strong> ${(s.created_at || '').slice(0, 16)}</p>
        <p style="font-size:12.5px;margin:2px 0;"><strong>Motif :</strong> ${esc(s.motif)}</p>
        ${s.description ? `<p style="font-size:12.5px;margin:2px 0;"><strong>Description :</strong> ${esc(s.description)}</p>` : ''}
        ${preuves.length ? `<p style="font-size:12.5px;margin:6px 0 2px;"><strong>Pièces jointes :</strong></p><div style="display:flex;gap:6px;flex-wrap:wrap;">${preuves.map(p => `<a href="${esc(p.url)}" target="_blank" rel="noopener" style="font-size:11.5px;background:#F1F5F9;border-radius:6px;padding:4px 8px;text-decoration:none;color:#334155;">${p.type === 'image' ? '🖼️' : p.type === 'document' ? '📄' : '🔗'} ${esc(p.nom || p.url)}</a>`).join('')}</div>` : ''}
        <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;">
          <label style="font-size:12px;font-weight:700;">Gravité :</label>
          <select id="sig-gravite-select" style="padding:5px 8px;border-radius:6px;border:1.5px solid var(--border);font-size:12px;">
            <option value="">—</option>
            <option value="1"${s.gravite === 1 ? ' selected' : ''}>🟢 N1 — Avertissement</option>
            <option value="2"${s.gravite === 2 ? ' selected' : ''}>🟡 N2 — Surveillance renforcée</option>
            <option value="3"${s.gravite === 3 ? ' selected' : ''}>🟠 N3 — Suspension temporaire</option>
            <option value="4"${s.gravite === 4 ? ' selected' : ''}>🔴 N4 — Exclusion définitive</option>
          </select>
          <button class="btn btn-sm btn-outline" onclick="sigFixerGravite(${s.id})">Enregistrer</button>
          ${s.statut === 'nouveau' ? `<button class="btn btn-sm btn-outline" onclick="sigPasserAnalyse(${s.id})">🔎 Passer en analyse</button>` : ''}
          ${!['litige_ouvert', 'classe_sans_suite', 'archive', 'suspendu'].includes(s.statut) ? `<button class="btn btn-sm" style="background:#f59e0b;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;" onclick="sigOuvrirLitige(${s.id})">⚖️ Ouvrir un litige</button>` : ''}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <div>
          <h4 style="margin:0 0 8px;font-size:13px;">👤 Compte signalé</h4>
          <p style="font-size:12.5px;margin:2px 0;"><strong>${esc(s.cible_nom || '#' + s.cible_id)}</strong> (${SIG_TYPE_LABEL[s.cible_type] || s.cible_type})</p>
          <p style="font-size:12px;margin:2px 0;color:var(--muted);">${esc(s.cible_email || '')}</p>
          <p style="font-size:12px;margin:2px 0;color:var(--muted);">Compte créé le ${(s.cible_created_at || '').slice(0, 10)}</p>
          <p style="font-size:12px;margin:6px 0 2px;"><a href="profil-app.html?id=${s.cible_id}" target="_blank">Voir le profil →</a></p>
          <p style="font-size:12px;margin:8px 0 2px;font-weight:700;">Signalements précédents (${d.signalementsPrecedents.length}) :</p>
          ${d.signalementsPrecedents.length ? d.signalementsPrecedents.map(p => `<p style="font-size:11.5px;margin:2px 0;color:var(--muted);">${p.numero_dossier} — ${esc(p.motif)} (${SIG_STATUT_LABEL[p.statut] || p.statut})</p>`).join('') : '<p style="font-size:11.5px;color:var(--muted);">Aucun.</p>'}
          <p style="font-size:12px;margin:8px 0 2px;font-weight:700;">Historique disciplinaire (${d.historiqueDisciplinaire.length}) :</p>
          ${d.historiqueDisciplinaire.length ? d.historiqueDisciplinaire.map(h => `<p style="font-size:11.5px;margin:2px 0;color:var(--muted);">${(h.created_at || '').slice(0, 10)} — ${h.type}${h.gravite ? ' (N' + h.gravite + ')' : ''} — ${esc(h.motif || '')}</p>`).join('') : '<p style="font-size:11.5px;color:var(--muted);">Aucun.</p>'}
        </div>
        <div>
          <h4 style="margin:0 0 8px;font-size:13px;">🙋 Signalant</h4>
          <p style="font-size:12.5px;margin:2px 0;"><strong>${esc(s.reporter_nom || '#' + s.reporter_id)}</strong></p>
          <p style="font-size:12px;margin:2px 0;color:var(--muted);">${esc(s.reporter_email || '')}${s.reporter_telephone ? ' · ' + esc(s.reporter_telephone) : ''}</p>
          <p style="font-size:12px;margin:8px 0 2px;font-weight:700;">Signalements effectués (${d.signalementsEffectues.length}) :</p>
          ${d.signalementsEffectues.length ? d.signalementsEffectues.map(p => `<p style="font-size:11.5px;margin:2px 0;color:var(--muted);">${p.numero_dossier} — ${esc(p.motif)} (${SIG_STATUT_LABEL[p.statut] || p.statut})</p>`).join('') : '<p style="font-size:11.5px;color:var(--muted);">Aucun.</p>'}
        </div>
      </div>

      <div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <h4 style="margin:0 0 8px;font-size:13px;">🕓 Historique des actions</h4>
        ${d.historique.map(h => `<p style="font-size:11.5px;margin:3px 0;color:var(--muted);">${(h.created_at || '').slice(0, 16)} — ${esc(h.admin_nom || 'Système')} : <strong>${esc(h.action)}</strong>${h.note ? ' — ' + esc(h.note) : ''}</p>`).join('') || '<p style="font-size:11.5px;color:var(--muted);">Aucune action.</p>'}
      </div>

      <div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <h4 style="margin:0 0 8px;font-size:13px;">💬 Espace de discussion</h4>
        <div style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px;background:#fafbfc;">
          ${d.messages.map(m => `
            <div style="margin-bottom:8px;${m.interne ? 'background:#fffbeb;border-radius:6px;padding:6px;' : ''}">
              <div style="font-size:11px;font-weight:700;color:${m.interne ? '#92400e' : (m.sender_id === s.cible_id ? '#374151' : '#2563eb')};">${m.interne ? '🔒 Note interne · ' : ''}${esc(m.sender_nom || '—')} · ${(m.created_at || '').slice(0, 16)}</div>
              <div style="font-size:13px;color:#1f2937;">${esc(m.contenu)}</div>
            </div>`).join('') || '<p style="font-size:12px;color:var(--muted);">Aucun message.</p>'}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input type="text" id="sig-msg-input" placeholder="Écrire un message au compte signalé…" style="flex:1;min-width:200px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;">
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);"><input type="checkbox" id="sig-msg-interne"> Note interne</label>
          <button class="btn btn-sm" style="background:#2563eb;color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;" onclick="sigEnvoyerMessage(${s.id})">Envoyer</button>
        </div>
      </div>

      ${!['classe_sans_suite', 'archive'].includes(s.statut) ? `
      <div>
        <h4 style="margin:0 0 10px;font-size:13px;">✅ Décision finale</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-outline" onclick="sigDecision(${s.id},'classer')">Classer sans suite</button>
          <button class="btn btn-sm btn-outline" onclick="sigDecision(${s.id},'archiver')">📁 Archiver le dossier</button>
          <button class="btn btn-sm" style="background:#ef4444;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;" onclick="sigDecision(${s.id},'suspendre')">⛔ Suspendre le compte</button>
        </div>
      </div>` : ''}
    </div>`;
}

async function sigFixerGravite(id) {
  const gravite = document.getElementById('sig-gravite-select').value;
  if (!gravite) return;
  await api('PATCH', `/admin/dossiers-signalement/${id}`, { gravite: parseInt(gravite) });
  viewDossierSignalement(id);
  loadDossiersSignalement();
}
async function sigPasserAnalyse(id) {
  await api('PATCH', `/admin/dossiers-signalement/${id}`, { statut: 'en_analyse' });
  viewDossierSignalement(id);
  loadDossiersSignalement();
}
async function sigOuvrirLitige(id) {
  if (!confirm('Ouvrir un litige (médiation) sur ce dossier ?')) return;
  await api('POST', `/admin/dossiers-signalement/${id}/litige`);
  viewDossierSignalement(id);
  loadDossiersSignalement();
}
async function sigEnvoyerMessage(id) {
  const input = document.getElementById('sig-msg-input');
  const contenu = input.value.trim();
  if (!contenu) return;
  const interne = document.getElementById('sig-msg-interne').checked;
  try {
    await api('POST', `/signalements/${id}/messages`, { contenu, interne });
    viewDossierSignalement(id);
  } catch (e) { alert('Erreur : ' + (e.message || '')); }
}
async function sigDecision(id, decision) {
  const note = prompt(decision === 'classer' ? 'Note (facultatif) :' : 'Motif de la décision :');
  if (note === null) return;
  let duree = null;
  if (decision === 'suspendre') {
    duree = prompt('Durée de suspension : 24h, 7j, 30j, ou "definitive"', '7j');
    if (!duree) return;
  }
  if (!confirm('Confirmer cette décision ? Le compte signalé sera notifié.')) return;
  try {
    await api('POST', `/admin/dossiers-signalement/${id}/decision`, { decision, note: note || null, duree });
    viewDossierSignalement(id);
    loadDossiersSignalement();
  } catch (e) { alert('Erreur : ' + (e.message || '')); }
}
async function migrerAnciensSignalements() {
  if (!confirm("Importer les anciens signalements (comptes inactifs + initiatives) dans le nouveau système ? Sans risque, peut être relancé plusieurs fois sans créer de doublon.")) return;
  try {
    const r = await api('POST', '/admin/dossiers-signalement/migrer-anciens');
    alert(`${r.migres} dossier(s) importé(s), ${r.ignores} déjà présent(s) ou ignoré(s).`);
    loadDossiersSignalement();
  } catch (e) { alert('Erreur : ' + (e.message || '')); }
}

/* ---- Demandes de suppression de compte (RGPD) ---- */
let _delReqFilterType = '', _delReqFilterStatut = '';
const DELREQ_STATUT_LABELS = {
  demande_recue: '🟡 Demande reçue', en_discussion: '🔵 En discussion', en_cours_analyse: '🟠 En cours d\'analyse',
  validee: '🟢 Validée', refusee: '🔴 Refusée', compte_supprime: '⚫ Compte supprimé',
};
/* suppression_definitive_le est stocké sans 'Z' ("YYYY-MM-DD HH:MM:SS") mais représente un instant
   UTC — le reconstruire explicitement en UTC plutôt que laisser le navigateur le lire en heure locale. */
function parseUtc(s) { return s ? new Date(s.replace(' ', 'T') + 'Z') : null; }
/* statut='validee' recouvre 3 réalités distinctes selon restauree_le / suppression_definitive_le
   (le délai de grâce de 5 jours) — ce libellé dynamique les distingue dans l'affichage admin. */
function delReqStatutLabel(dr) {
  if (dr.statut !== 'validee') return DELREQ_STATUT_LABELS[dr.statut] || dr.statut;
  if (dr.restauree_le) return '🔵 Restauré par l\'utilisateur';
  if (dr.suppression_definitive_le) {
    const echeance = parseUtc(dr.suppression_definitive_le);
    if (echeance <= new Date()) return '🟠 Délai écoulé (en attente du cron)';
    const jours = Math.ceil((echeance - new Date()) / 86400000);
    return `🟡 Délai de grâce — ${jours} j restant${jours > 1 ? 's' : ''}`;
  }
  return DELREQ_STATUT_LABELS.validee;
}
function setDelReqFilter(kind, val) {
  if (kind === 'type') _delReqFilterType = val; else _delReqFilterStatut = val;
  document.querySelectorAll(`[data-delf="${kind}"]`).forEach(b => b.classList.toggle('btn-orange', b.dataset.val === val) || b.classList.toggle('btn-outline', b.dataset.val !== val));
  loadDelReqList();
}
async function loadDelReqList() {
  const el = document.getElementById('delreq-list');
  document.getElementById('delreq-dossier').style.display = 'none';
  try {
    const r = await api('GET', '/admin/deletion-requests');
    let rows = r.requests || [];
    if (_delReqFilterType) rows = rows.filter(x => x.type_compte === _delReqFilterType);
    if (_delReqFilterStatut) rows = rows.filter(x => x.statut === _delReqFilterStatut);
    const enAttente = (r.requests||[]).filter(x => x.statut === 'demande_recue').length;
    const badge = document.getElementById('delreq-badge');
    if (badge) { badge.textContent = enAttente; badge.style.display = enAttente ? '' : 'none'; }
    if (!rows.length) { el.innerHTML = '<p style="color:var(--muted);font-size:13px;">Aucune demande.</p>'; return; }
    el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;border-bottom:1.5px solid var(--border);">
        <th style="padding:8px;">Nom</th><th style="padding:8px;">Type</th><th style="padding:8px;">Date</th>
        <th style="padding:8px;">Statut</th><th style="padding:8px;">Dernier échange</th><th style="padding:8px;">Admin</th><th></th>
      </tr></thead><tbody>
      ${rows.map(x => `<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px;">${x.user_nom||'—'}</td>
        <td style="padding:8px;">${x.type_compte}</td>
        <td style="padding:8px;">${new Date(x.created_at).toLocaleDateString('fr-FR')}</td>
        <td style="padding:8px;">${delReqStatutLabel(x)}</td>
        <td style="padding:8px;">${x.dernier_echange ? new Date(x.dernier_echange).toLocaleDateString('fr-FR') : '—'}</td>
        <td style="padding:8px;">${x.admin_nom||'—'}</td>
        <td style="padding:8px;"><button class="btn btn-sm btn-outline" onclick="openDelReqDossier(${x.id})">📂 Ouvrir</button></td>
      </tr>`).join('')}
      </tbody></table>`;
  } catch(e) { el.innerHTML = '<p style="color:red;font-size:13px;">Erreur de chargement.</p>'; }
}
async function openDelReqDossier(id) {
  const panel = document.getElementById('delreq-dossier');
  panel.style.display = '';
  panel.innerHTML = '<p style="color:var(--muted);font-size:13px;">Chargement…</p>';
  try {
    const r = await api('GET', `/admin/deletion-requests/${id}`);
    const dr = r.request;
    const terminal = ['refusee','compte_supprime','validee'].includes(dr.statut);
    panel.innerHTML = `
      <div class="card">
        <h3 style="margin:0 0 8px;">Dossier ${dr.numero_dossier} — ${dr.user_nom} (${dr.user_role})</h3>
        <p style="font-size:13px;color:var(--muted);margin:0 0 4px;">Email : ${dr.user_email||'—'} · Statut : ${delReqStatutLabel(dr)}</p>
        ${dr.statut === 'validee' && dr.suppression_definitive_le && !dr.restauree_le ? `<p style="font-size:12px;color:#b45309;margin:0 0 4px;">Suppression définitive automatique prévue le ${parseUtc(dr.suppression_definitive_le).toLocaleDateString('fr-FR')} (sauf restauration par l'utilisateur).</p>` : ''}
        ${dr.motif ? `<p style="font-size:13px;margin:0 0 4px;">Motif initial : ${dr.motif}</p>` : ''}
        ${dr.admin_justification ? `<p style="font-size:13px;color:#dc2626;margin:0 0 8px;">Justification : ${dr.admin_justification}</p>` : ''}

        <h4 style="margin:14px 0 6px;">Historique</h4>
        <div style="max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px;color:var(--muted);margin-bottom:14px;">
          ${dr.historique.map(h => `<div>${new Date(h.created_at).toLocaleString('fr-FR')} — ${h.action}${h.admin_nom ? ' par ' + h.admin_nom : ''}${h.note ? ' — ' + h.note : ''}</div>`).join('')}
        </div>

        <h4 style="margin:14px 0 6px;">Messagerie privée</h4>
        <div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:10px;">
          ${(dr.messages||[]).map(m => `<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:700;">${m.sender_nom||'—'} · ${new Date(m.created_at).toLocaleString('fr-FR')}</div><div style="font-size:13px;">${m.contenu}</div></div>`).join('') || '<p style="font-size:12px;color:var(--muted);">Aucun message.</p>'}
        </div>
        ${!terminal ? `<div style="display:flex;gap:8px;margin-bottom:16px;">
          <input type="text" id="delreq-msg-input" placeholder="Répondre au demandeur…" style="flex:1;padding:8px 10px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;">
          <button class="btn btn-sm btn-outline" onclick="sendDelReqMsg(${dr.id})">Envoyer</button>
        </div>` : ''}

        ${!terminal ? `<div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-outline" onclick="patchDelReqStatut(${dr.id},'en_discussion')">🔵 En discussion</button>
          <button class="btn btn-sm btn-outline" onclick="patchDelReqStatut(${dr.id},'en_cours_analyse')">🟠 En cours d'analyse</button>
          <button class="btn btn-sm" style="background:#16a34a;color:#fff;" onclick="confirmerValidationDelReq(${dr.id})">✅ Valider la suppression</button>
          <button class="btn btn-sm" style="background:#dc2626;color:#fff;" onclick="refuserDelReq(${dr.id})">❌ Refuser</button>
        </div>` : '<p style="font-size:12px;color:var(--muted);">Dossier clos.</p>'}
      </div>`;
  } catch(e) { panel.innerHTML = '<p style="color:red;font-size:13px;">Erreur de chargement du dossier.</p>'; }
}
async function sendDelReqMsg(id) {
  const input = document.getElementById('delreq-msg-input');
  const contenu = input.value.trim();
  if (!contenu) return;
  await api('POST', `/deletion-requests/${id}/messages`, { contenu });
  input.value = '';
  openDelReqDossier(id);
}
async function patchDelReqStatut(id, statut, justification) {
  try {
    await api('PATCH', `/admin/deletion-requests/${id}`, { statut, justification });
    openDelReqDossier(id);
    loadDelReqList();
  } catch (e) { alert('Erreur : ' + (e.message||'')); }
}
function confirmerValidationDelReq(id) {
  if (!confirm("Valider la suppression ? Le compte sera masqué immédiatement et son propriétaire recevra un e-mail avec un délai de 5 jours pour l'annuler. Passé ce délai, les données seront anonymisées automatiquement et définitivement.")) return;
  patchDelReqStatut(id, 'validee');
}
function refuserDelReq(id) {
  const justification = prompt('Motif du refus (obligatoire) :');
  if (!justification || !justification.trim()) return;
  patchDelReqStatut(id, 'refusee', justification.trim());
}

let _comptesStatut = 'en_attente';
async function loadModerationComptes(statut = 'en_attente') {
  _comptesStatut = statut;
  ['attente','valide','rejete'].forEach(s => {
    const btn = document.getElementById('btn-filtre-' + s);
    if (btn) btn.style.fontWeight = s === statut ? '800' : '';
  });
  const el = document.getElementById('moderation-comptes-list');
  el.innerHTML = '<p style="color:var(--muted);font-size:13px;">Chargement…</p>';
  try {
    const data = await api('GET', '/admin/comptes?statut=' + statut);
    const comptes = data.comptes || [];
    if (!comptes.length) {
      el.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:12px 0;">Aucun compte dans ce statut.</p>';
      return;
    }
    const ROLE_LABELS = { utilisateur:'Utilisateur', initiative:'Initiative', collectivite:'Collectivité', administrateur:'Admin' };
    el.innerHTML = comptes.map(c => `
      <div style="display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;" id="compte-row-${c.id}">
        <div style="flex:1;min-width:180px;">
          <div style="font-weight:700;font-size:13.5px;">${esc(c.nom)}${c.prenom ? ' ' + esc(c.prenom) : ''}</div>
          <div style="font-size:12px;color:var(--muted);">${esc(c.email)} · <strong>${esc(ROLE_LABELS[c.role]||c.role)}</strong>${c.ville ? ' · ' + esc(c.ville) : ''}${c.pays ? ', ' + esc(c.pays) : ''}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">Inscrit le ${c.created_at ? c.created_at.slice(0,10) : '—'}</div>
        </div>
        ${statut === 'en_attente' ? `
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn-sm" style="background:#16a34a;color:#fff;border:none;" onclick="validerCompte(${c.id})">✅ Valider</button>
          <button class="btn btn-sm btn-outline" style="color:#dc2626;border-color:#dc2626;" onclick="rejeterComptePrompt(${c.id})">❌ Rejeter</button>
        </div>` : `<span style="font-size:12px;padding:3px 10px;border-radius:20px;background:${statut==='valide'?'#d1fae5':'#fee2e2'};color:${statut==='valide'?'#065f46':'#991b1b'};font-weight:700;">${statut==='valide'?'✅ Validé':'❌ Rejeté'}</span>`}
      </div>`).join('');
  } catch(e) {
    el.innerHTML = '<p style="color:#dc2626;font-size:13px;">Erreur de chargement.</p>';
  }
}

async function validerCompte(id) {
  if (!confirm('Valider ce compte ?')) return;
  try {
    await api('PATCH', '/admin/comptes/' + id + '/valider');
    document.getElementById('compte-row-' + id)?.remove();
    const el = document.getElementById('moderation-comptes-list');
    if (!el.querySelector('[id^=compte-row-]')) el.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:12px 0;">Aucun compte en attente.</p>';
  } catch(e) { alert(e.message || 'Erreur.'); }
}

async function rejeterComptePrompt(id) {
  const motif = prompt('Motif du rejet (optionnel) :') ?? '';
  if (motif === null) return;
  try {
    await api('PATCH', '/admin/comptes/' + id + '/rejeter', { motif: motif || 'Documents insuffisants' });
    document.getElementById('compte-row-' + id)?.remove();
    const el = document.getElementById('moderation-comptes-list');
    if (!el.querySelector('[id^=compte-row-]')) el.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:12px 0;">Aucun compte en attente.</p>';
  } catch(e) { alert(e.message || 'Erreur.'); }
}

async function loadModerationContenus() {
  const el = document.getElementById('moderation-contenus-list');
  el.innerHTML = '<p style="color:var(--muted);font-size:13px;">Chargement…</p>';
  try {
    const data = await api('GET', '/admin/contenus');
    const posts = data.posts || [];
    if (!posts.length) { el.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:12px 0;">Aucune publication.</p>'; return; }
    el.innerHTML = posts.map(p => `
      <div style="display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border);" id="contenu-row-${p.id}">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:700;color:#2563EB;margin-bottom:3px;">${esc(p.auteur_nom||p.auteur||'—')} · ${p.created_at ? p.created_at.slice(0,10) : ''}</div>
          <div style="font-size:13.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc((p.contenu||'').slice(0,120))}${(p.contenu||'').length>120?'…':''}</div>
        </div>
        <button class="btn btn-sm btn-outline" style="color:#dc2626;border-color:#dc2626;flex-shrink:0;" onclick="supprimerContenu('post',${p.id})">🗑 Supprimer</button>
      </div>`).join('');
  } catch(e) {
    el.innerHTML = '<p style="color:#dc2626;font-size:13px;">Erreur de chargement.</p>';
  }
}

async function supprimerContenu(type, id) {
  if (!confirm('Supprimer ce contenu définitivement ?')) return;
  try {
    await api('DELETE', '/admin/contenu/' + type + '/' + id);
    document.getElementById('contenu-row-' + id)?.remove();
  } catch(e) { alert(e.message || 'Erreur.'); }
}
