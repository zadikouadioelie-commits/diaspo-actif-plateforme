/**
 * Diaspo'Actif — Widget Trust Score & Réactivité
 * Usage : <div data-trust-widget="USER_ID"></div>
 *         TrustWidget.render(userId, container);
 */
(function () {
  'use strict';

  /* ───────────────────────── Styles ───────────────────────── */
  const CSS = `
.ts-widget { font-family: inherit; }

/* ── Score de confiance ── */
.ts-card {
  border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 16px;
  background: #fff; margin-bottom: 12px;
}
.ts-card-title {
  font-size: 11px; font-weight: 800; text-transform: uppercase;
  letter-spacing: .06em; color: #64748b; margin-bottom: 10px;
}
.ts-score-row { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
.ts-donut {
  width: 60px; height: 60px; flex-shrink: 0;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 900; color: #fff; position: relative;
}
.ts-score-info { flex: 1; }
.ts-score-pct { font-size: 22px; font-weight: 900; line-height: 1; }
.ts-score-label {
  display: inline-block; margin-left: 6px;
  font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 99px;
}
.ts-score-desc { font-size: 11.5px; color: #64748b; margin-top: 3px; }

.ts-bar-wrap { background: #f1f5f9; border-radius: 99px; height: 7px; margin-bottom: 10px; overflow: hidden; }
.ts-bar { height: 100%; border-radius: 99px; transition: width .6s cubic-bezier(.4,0,.2,1); }

.ts-detail { display: flex; flex-direction: column; gap: 4px; }
.ts-detail-row {
  display: flex; align-items: center; gap: 7px;
  font-size: 11.5px; color: #374151; padding: 3px 0;
}
.ts-detail-row.warn { color: #b45309; }
.ts-detail-icon { font-size: 14px; width: 18px; text-align: center; }
.ts-detail-pts { margin-left: auto; font-weight: 700; font-size: 11px; color: #94a3b8; }

/* ── Réactivité ── */
.ts-react-row { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.ts-stars { font-size: 16px; letter-spacing: 1px; }
.ts-react-label { font-size: 11.5px; color: #64748b; flex: 1; }

/* ── Mode absence ── */
.ts-absence {
  border-radius: 10px; padding: 9px 12px; background: #fef9c3; border: 1.5px solid #fde047;
  font-size: 12px; color: #713f12; display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
}
.ts-absence-icon { font-size: 18px; }

/* ── Bouton signaler ── */
.ts-report-btn {
  margin-top: 8px; width: 100%; padding: 8px; border-radius: 9px;
  border: 1.5px solid #e2e8f0; background: #fff; color: #64748b;
  font-size: 12px; font-weight: 700; cursor: pointer; transition: all .15s;
}
.ts-report-btn:hover { border-color: #ef4444; color: #ef4444; background: #fef2f2; }

/* ── Badges vérifiés inline (pour l'annuaire / chatbot) ── */
.ts-badge-verified {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 99px;
  background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;
}
.ts-badge-trust {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 99px;
}

/* ── Modal signalement ── */
.ts-modal-bg {
  position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 9999;
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.ts-modal {
  background: #fff; border-radius: 18px; padding: 24px; max-width: 480px; width: 100%;
  max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.25);
}
.ts-modal h3 { font-size: 16px; font-weight: 800; margin: 0 0 16px; }
.ts-modal label { display: block; font-size: 12px; font-weight: 700; color: #374151; margin: 10px 0 4px; }
.ts-modal select, .ts-modal textarea {
  width: 100%; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 9px;
  font-size: 13px; box-sizing: border-box; resize: vertical;
}
.ts-modal textarea { min-height: 80px; }
.ts-modal-actions { display: flex; gap: 8px; margin-top: 16px; }
.ts-modal-btn {
  flex: 1; padding: 10px; border-radius: 9px; border: 1.5px solid #e2e8f0;
  font-size: 13px; font-weight: 700; cursor: pointer;
}
.ts-modal-btn.primary { background: #ef4444; color: #fff; border-color: transparent; }
.ts-modal-btn.primary:hover { background: #dc2626; }
.ts-absence-modal label { display: block; font-size: 12px; font-weight: 700; margin: 8px 0 3px; }
.ts-absence-modal select, .ts-absence-modal input {
  width: 100%; padding: 9px; border: 1.5px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; box-sizing: border-box;
}
`;

  function injectCSS() {
    if (document.getElementById('ts-styles')) return;
    const s = document.createElement('style');
    s.id = 'ts-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ───────────────────────── Helpers ──────────────────────── */
  function scoreColor(s) {
    if (s >= 90) return '#10b981';
    if (s >= 75) return '#f59e0b';
    if (s >= 50) return '#6366f1';
    return '#ef4444';
  }
  function starsHTML(n) {
    const filled = Math.max(0, Math.min(5, n || 0));
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
  }
  function absenceLabel(mode) {
    const map = { vacances:'🏖️ En vacances', deplacement:'✈️ En déplacement',
      indisponible:'🚫 Indisponible', mission:'💼 En mission professionnelle',
      conge:'🏠 En congé', autre:'⏸️ Temporairement absent' };
    return map[mode] || mode;
  }

  /* ──────────────────────── Render widget ─────────────────── */
  async function render(userId, container, opts = {}) {
    injectCSS();
    const { showReportBtn = true, compact = false, isMine = false, targetType = 'compte' } = opts;

    container.innerHTML = '<div style="color:#94a3b8;font-size:12px;padding:8px 0;">Chargement…</div>';

    try {
      const [tsRes, absRes] = await Promise.all([
        fetch(`/api/users/${userId}/trust-score`).then(r => r.json()),
        fetch(`/api/users/${userId}/absence`).then(r => r.json()),
      ]);

      const { score = 0, detail = [], label = 'Faible', color, reactivity } = tsRes;
      const absence = absRes.absence;
      const col = color || scoreColor(score);

      let html = '<div class="ts-widget">';

      // ── Mode absence banner ──
      if (absence) {
        html += `<div class="ts-absence">
          <span class="ts-absence-icon">⏸️</span>
          <div>
            <strong>${absenceLabel(absence.mode)}</strong>
            ${absence.fin ? `<br><span style="font-size:11px">Jusqu'au ${absence.fin}</span>` : ''}
            ${absence.message ? `<br><em style="font-size:11px">${absence.message}</em>` : ''}
          </div>
        </div>`;
      }

      if (!compact) {
        // ── Score de confiance ──
        html += `<div class="ts-card">
          <div class="ts-card-title">🛡️ Score de confiance</div>
          <div class="ts-score-row">
            <div class="ts-donut" style="background:${col}">${score}%</div>
            <div class="ts-score-info">
              <div>
                <span class="ts-score-pct" style="color:${col}">${score}<span style="font-size:14px;font-weight:600">%</span></span>
                <span class="ts-score-label" style="background:${col}22;color:${col}">${label}</span>
              </div>
              <div class="ts-score-desc">Fiabilité globale du profil</div>
            </div>
          </div>
          <div class="ts-bar-wrap">
            <div class="ts-bar" style="width:${score}%;background:${col}"></div>
          </div>
          <div class="ts-detail">
            ${detail.map(d => `
              <div class="ts-detail-row${d.warning?' warn':''}">
                <span class="ts-detail-icon">${d.icon||'•'}</span>
                <span>${d.label}</span>
                <span class="ts-detail-pts">${d.pts}/${d.max} pts</span>
              </div>`).join('')}
          </div>
        </div>`;

        // ── Indice de réactivité ──
        if (reactivity) {
          html += `<div class="ts-card">
            <div class="ts-card-title">⚡ Indice de réactivité</div>
            <div class="ts-react-row">
              <span class="ts-stars" style="color:#f59e0b">${starsHTML(reactivity.stars)}</span>
              <span class="ts-react-label">${reactivity.label}</span>
            </div>
          </div>`;
        }
      } else {
        // ── Version compacte (badges seulement) ──
        html += `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <span class="ts-badge-trust" style="background:${col}22;color:${col};border:1px solid ${col}44">
            🛡️ ${score}% · ${label}
          </span>`;
        if (detail.some(d => d.label.includes('Identité'))) {
          html += `<span class="ts-badge-verified">✅ Compte vérifié</span>`;
        }
        if (reactivity?.stars >= 4) {
          html += `<span class="ts-badge-trust" style="background:#fef9c3;color:#713f12;border:1px solid #fde047">⚡ Très réactif</span>`;
        }
        html += '</div>';
      }

      // ── Bouton signaler (si pas son propre profil) ──
      if (showReportBtn && !isMine) {
        if (targetType === 'initiative') {
          html += `<button class="ts-report-btn" onclick="TrustWidget.reportInitiative(${userId})">🚩 Signaler cette initiative</button>`;
        } else {
          html += `<button class="ts-report-btn" onclick="TrustWidget.reportAccount(${userId})">🚩 Signaler un compte inactif</button>`;
        }
      }

      // ── Bouton mode absence (si c'est son propre profil) ──
      if (isMine) {
        if (absence) {
          html += `<button class="ts-report-btn" style="border-color:#f59e0b;color:#92400e" onclick="TrustWidget.clearAbsence()">
            ✅ Désactiver le mode absence
          </button>`;
        } else {
          html += `<button class="ts-report-btn" style="border-color:#6366f1;color:#4338ca" onclick="TrustWidget.setAbsence()">
            ⏸️ Activer le mode absence
          </button>`;
        }
      }

      html += '</div>';
      container.innerHTML = html;

    } catch (e) {
      container.innerHTML = '<div style="color:#ef4444;font-size:12px">Impossible de charger le score.</div>';
    }
  }

  /* ──────────────── Modal signalement compte inactif ─────── */
  function reportAccount(userId) {
    const bg = document.createElement('div');
    bg.className = 'ts-modal-bg';
    bg.innerHTML = `
      <div class="ts-modal">
        <h3>🚩 Signaler un compte inactif</h3>
        <p style="font-size:12.5px;color:#64748b;margin:0 0 12px">
          Ce signalement est transmis à nos modérateurs. Il n'est possible que si vous avez envoyé
          un message il y a plus de 14 jours sans réponse.
        </p>
        <div id="ts-report-msg" style="font-size:12px;margin-bottom:8px;"></div>
        <div class="ts-modal-actions">
          <button class="ts-modal-btn" onclick="this.closest('.ts-modal-bg').remove()">Annuler</button>
          <button class="ts-modal-btn primary" id="ts-report-submit">Envoyer le signalement</button>
        </div>
      </div>`;
    document.body.appendChild(bg);

    bg.querySelector('#ts-report-submit').onclick = async () => {
      const msgEl = bg.querySelector('#ts-report-msg');
      msgEl.style.color = '#64748b';
      msgEl.textContent = 'Envoi…';
      try {
        const r = await fetch(`/api/users/${userId}/signaler`, { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
        const d = await r.json();
        if (r.ok) {
          msgEl.style.color = '#10b981';
          msgEl.textContent = d.message || 'Signalement enregistré.';
          setTimeout(() => bg.remove(), 2000);
        } else {
          msgEl.style.color = '#ef4444';
          msgEl.textContent = d.error || 'Erreur.';
        }
      } catch { msgEl.style.color='#ef4444'; msgEl.textContent = 'Erreur réseau.'; }
    };
  }

  /* ──────────────── Modal signalement initiative ─────────── */
  const MOTIFS = [
    'Suspicion d\'escroquerie','Faux documents','Informations mensongères',
    'Collecte de fonds suspecte','Usurpation d\'identité','Contenu illégal',
    'Discours haineux','Spam','Publicité abusive',
    'Violation des règles Diaspo\'Actif','Conflit d\'intérêt non déclaré','Autre'
  ];

  function reportInitiative(initId) {
    const bg = document.createElement('div');
    bg.className = 'ts-modal-bg';
    bg.innerHTML = `
      <div class="ts-modal">
        <h3>🚩 Signaler cette initiative</h3>
        <label>Motif *</label>
        <select id="ts-motif">
          <option value="">-- Choisir un motif --</option>
          ${MOTIFS.map(m => `<option value="${m}">${m}</option>`).join('')}
        </select>
        <label>Description (facultatif)</label>
        <textarea id="ts-desc" placeholder="Décrivez le problème en détail…"></textarea>
        <div id="ts-rep-msg" style="font-size:12px;margin-top:8px;"></div>
        <div class="ts-modal-actions">
          <button class="ts-modal-btn" onclick="this.closest('.ts-modal-bg').remove()">Annuler</button>
          <button class="ts-modal-btn primary" id="ts-rep-submit">Envoyer</button>
        </div>
      </div>`;
    document.body.appendChild(bg);

    bg.querySelector('#ts-rep-submit').onclick = async () => {
      const motif = bg.querySelector('#ts-motif').value;
      const description = bg.querySelector('#ts-desc').value.trim();
      const msgEl = bg.querySelector('#ts-rep-msg');
      if (!motif) { msgEl.style.color='#ef4444'; msgEl.textContent='Veuillez choisir un motif.'; return; }
      msgEl.style.color='#64748b'; msgEl.textContent='Envoi…';
      try {
        const r = await fetch(`/api/initiatives/${initId}/signaler`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ motif, description })
        });
        const d = await r.json();
        if (r.ok) {
          msgEl.style.color='#10b981'; msgEl.textContent = d.message || 'Signalement transmis.';
          setTimeout(() => bg.remove(), 2000);
        } else {
          msgEl.style.color='#ef4444'; msgEl.textContent = d.error || 'Erreur.';
        }
      } catch { msgEl.style.color='#ef4444'; msgEl.textContent='Erreur réseau.'; }
    };
  }

  /* ──────────────── Modal mode absence ────────────────────── */
  function setAbsence() {
    const bg = document.createElement('div');
    bg.className = 'ts-modal-bg';
    bg.innerHTML = `
      <div class="ts-modal ts-absence-modal">
        <h3>⏸️ Activer le mode absence</h3>
        <label>Type d'absence *</label>
        <select id="ts-abs-mode">
          <option value="vacances">🏖️ En vacances</option>
          <option value="deplacement">✈️ En déplacement</option>
          <option value="indisponible">🚫 Indisponible</option>
          <option value="mission">💼 Mission professionnelle</option>
          <option value="conge">🏠 Congé</option>
          <option value="autre">⏸️ Autre</option>
        </select>
        <label>Date de retour (facultatif)</label>
        <input type="date" id="ts-abs-fin" min="${new Date().toISOString().slice(0,10)}">
        <label>Message personnalisé (facultatif)</label>
        <input type="text" id="ts-abs-msg" placeholder="Ex: Je reviens le 15 juillet, urgent par email.">
        <div id="ts-abs-status" style="font-size:12px;margin-top:8px;"></div>
        <div class="ts-modal-actions">
          <button class="ts-modal-btn" onclick="this.closest('.ts-modal-bg').remove()">Annuler</button>
          <button class="ts-modal-btn primary" id="ts-abs-submit">Activer</button>
        </div>
      </div>`;
    document.body.appendChild(bg);

    bg.querySelector('#ts-abs-submit').onclick = async () => {
      const mode = bg.querySelector('#ts-abs-mode').value;
      const fin = bg.querySelector('#ts-abs-fin').value || null;
      const message = bg.querySelector('#ts-abs-msg').value.trim() || null;
      const st = bg.querySelector('#ts-abs-status');
      st.style.color = '#64748b'; st.textContent = 'Activation…';
      try {
        const r = await fetch('/api/users/me/absence', {
          method:'PUT', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ mode, fin, message })
        });
        if (r.ok) {
          st.style.color='#10b981'; st.textContent='Mode absence activé.';
          setTimeout(() => { bg.remove(); location.reload(); }, 1200);
        } else {
          const d = await r.json();
          st.style.color='#ef4444'; st.textContent = d.error || 'Erreur.';
        }
      } catch { st.style.color='#ef4444'; st.textContent='Erreur réseau.'; }
    };
  }

  async function clearAbsence() {
    if (!confirm('Désactiver le mode absence ?')) return;
    await fetch('/api/users/me/absence', { method:'DELETE' });
    location.reload();
  }

  /* ─────────────────── Auto-init (data-trust-widget) ─────── */
  function autoInit() {
    document.querySelectorAll('[data-trust-widget]').forEach(el => {
      const userId = parseInt(el.dataset.trustWidget);
      if (!userId) return;
      const isMine = el.dataset.trustMine === '1';
      const compact = el.dataset.trustCompact === '1';
      const targetType = el.dataset.trustType || 'compte';
      render(userId, el, { isMine, compact, targetType });
    });
  }

  /* ────────────────────── Public API ─────────────────────── */
  window.TrustWidget = { render, reportAccount, reportInitiative, setAbsence, clearAbsence, autoInit };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

})();
