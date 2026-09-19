/* ═══ AVIS — panneau de modération (partagé entre dashboard-administrateur.html et
   dashboard-administrateur-junior.html, même principe que assets/admin-videos-tutoriels-panel.js).
   Nécessite dans la page hôte : la fonction api(), et les éléments HTML
   #av-tab-avis / #av-tab-signalements, #av-panel-avis / #av-panel-signalements,
   #av-liste, #av-signalements-liste, #av-filtre-signales. ═══ */

let _avOnglet = 'avis';

function avEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function avDate(iso) { try { return iso ? new Date(iso.replace(' ','T')+'Z').toLocaleString('fr-FR') : ''; } catch (e) { return ''; } }
function avStars(n) { const r = Math.round(Number(n) || 0); return '★'.repeat(r) + '☆'.repeat(5 - r); }

/* ── Onglets ── */
function avOuvrirOnglet(nom) {
  _avOnglet = nom;
  ['avis', 'signalements'].forEach(n => {
    const btn = document.getElementById(`av-tab-${n}`);
    const panel = document.getElementById(`av-panel-${n}`);
    if (btn) btn.className = n === nom ? 'btn btn-orange' : 'btn btn-outline';
    if (panel) panel.style.display = n === nom ? '' : 'none';
  });
  if (nom === 'avis') avCharger();
  if (nom === 'signalements') avChargerSignalements();
}

/* ── Onglet Avis ── */
async function avCharger(signalesUniquement) {
  if (signalesUniquement === undefined) signalesUniquement = document.getElementById('av-filtre-signales')?.checked;
  const box = document.getElementById('av-liste');
  if (!box) return;
  try {
    const { avis } = await api('GET', `/admin/avis${signalesUniquement ? '?signales=1' : ''}`);
    if (!avis.length) { box.innerHTML = '<p style="color:var(--muted);font-size:13px;">Aucun avis.</p>'; return; }
    box.innerHTML = avis.map(a => `
      <div class="card" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          <div>
            <strong style="font-size:13px;">${avEsc(a.auteur_nom)}</strong>
            <span style="color:#F4A62A;font-size:12px;letter-spacing:1px;"> ${avStars(a.note)}</span>
            <span style="color:var(--muted);font-size:11.5px;"> → profil de ${avEsc(a.cible_nom)} · ${avDate(a.created_at)}</span>
            ${a.statut === 'masque' ? '<span style="color:#dc2626;font-size:11px;font-weight:700;"> (masqué)</span>' : ''}
            ${a.nb_signalements > 0 ? `<span style="color:#dc2626;font-size:11px;font-weight:700;"> · 🚩 ${a.nb_signalements} signalement(s)</span>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${a.statut === 'masque'
              ? `<button class="btn btn-sm btn-outline" onclick="avRestaurer(${a.id})">↺ Restaurer</button>`
              : `<button class="btn btn-sm btn-outline" onclick="avMasquer(${a.id})">🙈 Masquer</button>`}
            <button class="btn btn-sm btn-outline" style="color:#dc2626;border-color:#dc2626;" onclick="avSupprimer(${a.id})">🗑 Supprimer</button>
          </div>
        </div>
        ${a.commentaire ? `<p style="margin:8px 0 0;font-size:13px;">${avEsc(a.commentaire)}</p>` : ''}
        ${a.reponse_texte ? `
          <div style="margin:8px 0 0;padding:8px 10px;background:var(--bg);border-radius:8px;border-left:3px solid var(--navy);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
              <div style="font-size:11.5px;color:var(--muted);">↩ Réponse${a.reponse_masquee ? ' (masquée)' : ''} · ${avDate(a.reponse_date)}</div>
              <div style="display:flex;gap:6px;">
                ${a.reponse_masquee
                  ? `<button class="btn btn-sm btn-outline" onclick="avRestaurerReponse(${a.id})">↺ Restaurer la réponse</button>`
                  : `<button class="btn btn-sm btn-outline" onclick="avMasquerReponse(${a.id})">🙈 Masquer la réponse</button>`}
                <button class="btn btn-sm btn-outline" style="color:#dc2626;border-color:#dc2626;" onclick="avSupprimerReponse(${a.id})">🗑 Supprimer la réponse</button>
              </div>
            </div>
            <p style="margin:4px 0 0;font-size:13px;">${avEsc(a.reponse_texte)}</p>
          </div>` : ''}
      </div>`).join('');
  } catch (e) { box.innerHTML = `<p style="color:#dc2626;font-size:13px;">Erreur : ${e.message}</p>`; }
}

async function avMasquer(id) {
  try { await api('POST', `/admin/avis/${id}/masquer`); avCharger(); }
  catch (e) { alert('Erreur : ' + e.message); }
}
async function avRestaurer(id) {
  try { await api('POST', `/admin/avis/${id}/restaurer`); avCharger(); }
  catch (e) { alert('Erreur : ' + e.message); }
}
async function avSupprimer(id) {
  if (!confirm('Supprimer définitivement cet avis ?')) return;
  try { await api('DELETE', `/admin/avis/${id}`); avCharger(); }
  catch (e) { alert('Erreur : ' + e.message); }
}
async function avMasquerReponse(id) {
  try { await api('POST', `/admin/avis/${id}/reponse/masquer`); avCharger(); }
  catch (e) { alert('Erreur : ' + e.message); }
}
async function avRestaurerReponse(id) {
  try { await api('POST', `/admin/avis/${id}/reponse/restaurer`); avCharger(); }
  catch (e) { alert('Erreur : ' + e.message); }
}
async function avSupprimerReponse(id) {
  if (!confirm('Supprimer définitivement cette réponse ?')) return;
  try { await api('DELETE', `/admin/avis/${id}/reponse`); avCharger(); }
  catch (e) { alert('Erreur : ' + e.message); }
}

/* ── Onglet Signalements ── */
async function avChargerSignalements() {
  const box = document.getElementById('av-signalements-liste');
  if (!box) return;
  try {
    const { signalements } = await api('GET', '/admin/avis/signalements');
    if (!signalements.length) { box.innerHTML = '<p style="color:var(--muted);font-size:13px;">Aucun signalement en attente.</p>'; return; }
    box.innerHTML = signalements.map(s => `
      <div class="card" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          <div>
            <strong style="font-size:13px;">Motif : ${avEsc(s.motif)}</strong>
            <span style="color:var(--muted);font-size:11.5px;"> — signalé par ${avEsc(s.signale_par_nom)} · ${avDate(s.created_at)}</span>
          </div>
          <button class="btn btn-sm btn-outline" onclick="avTraiterSignalement(${s.id})">✓ Marquer comme traité</button>
        </div>
        <p style="margin:8px 0 0;font-size:13px;color:var(--muted);">Avis signalé : « ${avEsc(s.avis_commentaire || '(sans commentaire)')} »</p>
      </div>`).join('');
  } catch (e) { box.innerHTML = `<p style="color:#dc2626;font-size:13px;">Erreur : ${e.message}</p>`; }
}

async function avTraiterSignalement(id) {
  try { await api('POST', `/admin/avis/signalements/${id}/traiter`); avChargerSignalements(); }
  catch (e) { alert('Erreur : ' + e.message); }
}
