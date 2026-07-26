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

/* ── Indice de fiabilité ── */
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

.ts-total { font-size: 11.5px; color: #64748b; margin-bottom: 12px; }
.ts-groupe {
  font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em;
  color: #94a3b8; margin: 12px 0 6px;
}
.ts-detail { display: flex; flex-direction: column; gap: 6px; }

/* Une ligne par critère, obtenu ou non. Le manque n'est pas une faute : il est présenté
   comme une étape à franchir, avec le bouton qui y mène. */
.ts-crit {
  display: flex; align-items: flex-start; gap: 9px;
  padding: 9px 11px; border-radius: 10px;
  background: #F8FAFC; border: 1px solid #E2E8F0;
}
.ts-crit.ok      { background: #F6FBF8; border-color: #C7EBD5; }
.ts-crit.encours { background: #FFFBEB; border-color: #FDE68A; }
.ts-crit.alerte  { background: #FEF2F2; border-color: #FECACA; }
.ts-crit-icone { font-size: 15px; line-height: 1.3; flex-shrink: 0; }
.ts-crit-corps { flex: 1; min-width: 0; }
.ts-crit-titre { font-size: 12.5px; font-weight: 700; color: #1F2937; }
.ts-crit-aide  { font-size: 11.5px; color: #64748b; margin-top: 2px; line-height: 1.45; }
.ts-crit-pts   { font-size: 12px; font-weight: 800; color: #475569; flex-shrink: 0; margin-left: 4px; }
.ts-crit.ok .ts-crit-pts { color: #15803D; }
.ts-crit-action {
  display: inline-block; margin-top: 6px; font-size: 11.5px; font-weight: 700;
  color: #fff; background: #F26422; padding: 5px 11px; border-radius: 7px;
  text-decoration: none; border: 0; cursor: pointer; font-family: inherit;
}
.ts-crit-action:hover { background: #D9531A; }
.ts-crit-action:focus-visible { outline: 3px solid #0D2B4E; outline-offset: 2px; }

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
  /* Paliers de l'indice de fiabilité. L'ancienne échelle étiquetait « Faible » en ROUGE
     tout compte sous 50 % — c'est-à-dire tout nouveau membre, quoi qu'il fasse : plus des
     deux tiers des points exigeaient de l'ancienneté ou des vérifications administratives.
     Un nouvel arrivant honnête lisait donc un verdict d'alarme sur son propre profil.
     Sa rampe de couleur n'était même pas monotone : « Élevé » (75-89) s'affichait en
     orange, donc visuellement moins bien que « Moyen » (50-74) en indigo.
     Le serveur fait désormais autorité sur le palier ; ces valeurs sont un repli. */
  const PALIERS = [
    { min: 91, nom: 'Exemplaire', couleur: '#7C3AED', encre: '#5B21B6', fond: '#F3E8FF' },
    { min: 61, nom: 'Reconnu',    couleur: '#22C55E', encre: '#15803D', fond: '#DCFCE7' },
    { min: 31, nom: 'Établi',     couleur: '#3B82F6', encre: '#1D4ED8', fond: '#DBEAFE' },
    { min: 0,  nom: 'Découverte', couleur: '#D1D5DB', encre: '#4B5563', fond: '#F3F4F6' },
  ];
  function palier(s) { return PALIERS.find(p => s >= p.min) || PALIERS[PALIERS.length - 1]; }
  function scoreColor(s) { return palier(s).couleur; }
  /* Les couleurs de palier servent l'anneau et la barre. Pour le TEXTE, on emploie une
     teinte foncée sur fond clair : du blanc sur #22C55E ne donne que 2,3:1, et #D1D5DB
     est trop clair pour porter quelque texte que ce soit. */
  function encreDe(s) { return palier(s).encre; }
  function fondDe(s)  { return palier(s).fond; }
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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

      const { score = 0, detail = [], color, couleur, sur, points, sens, reactivity } = tsRes;
      const label = tsRes.label || palier(score).nom;
      const absence = absRes.absence;
      const col = couleur || color || scoreColor(score);

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
        // ── Indice de fiabilité ──
        /* Les critères sont désormais TOUS renvoyés par le serveur, obtenus ou non.
           Auparavant seuls les critères acquis remontaient : le membre lisait un verdict
           sans jamais savoir ce qui lui manquait ni comment y remédier. On sépare donc
           l'obtenu du restant, et chaque manque porte son bouton d'action. */
        const acquis   = detail.filter(d => d.pts >= d.max);
        const restants = detail.filter(d => d.pts < d.max);
        const ligne = d => {
          const complet = d.pts >= d.max;
          const bouton = (isMine && d.action)
            ? `<a class="ts-crit-action" href="${esc(d.action.href)}"${d.action.href === '#rencontre' ? ' data-rencontre="1"' : ''}>${esc(d.action.texte)} →</a>`
            : '';
          return `<div class="ts-crit${complet ? ' ok' : ''}${d.alerte ? ' alerte' : ''}${d.enCours ? ' encours' : ''}">
            <span class="ts-crit-icone">${d.icon || '•'}</span>
            <div class="ts-crit-corps">
              <div class="ts-crit-titre">${esc(d.label)}</div>
              ${d.aide ? `<div class="ts-crit-aide">${esc(d.aide)}</div>` : ''}
              ${bouton}
            </div>
            <span class="ts-crit-pts">${d.pts}<span style="opacity:.55">/${d.max}</span></span>
          </div>`;
        };

        html += `<div class="ts-card">
          <div class="ts-card-title">🛡️ ${isMine ? 'Mon indice de fiabilité' : 'Indice de fiabilité'}</div>
          <div class="ts-score-row">
            <div class="ts-donut" style="background:${col};color:${score >= 31 && score <= 90 ? '#fff' : encreDe(score)}">${score}%</div>
            <div class="ts-score-info">
              <div>
                <span class="ts-score-pct" style="color:${encreDe(score)}">${score}<span style="font-size:14px;font-weight:600">%</span></span>
                <span class="ts-score-label" style="background:${fondDe(score)};color:${encreDe(score)}">${esc(label)}</span>
              </div>
              <div class="ts-score-desc">${esc(sens || 'Fiabilité globale du profil')}</div>
            </div>
          </div>
          <div class="ts-bar-wrap">
            <div class="ts-bar" style="width:${score}%;background:${col}"></div>
          </div>
          ${(typeof points === 'number' && sur)
            ? `<div class="ts-total">${points} point${points > 1 ? 's' : ''} sur ${sur}${sur < 100 ? ' — les critères réservés aux structures ne vous sont pas comptés' : ''}</div>` : ''}

          ${restants.length ? `<div class="ts-groupe">${isMine ? 'Ce qu’il vous reste à faire' : 'Non acquis'}</div>
            <div class="ts-detail">${restants.map(ligne).join('')}</div>` : ''}
          ${acquis.length ? `<div class="ts-groupe">Acquis</div>
            <div class="ts-detail">${acquis.map(ligne).join('')}</div>` : ''}
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
          <span class="ts-badge-trust" style="background:${fondDe(score)};color:${encreDe(score)};border:1px solid ${col}">
            🛡️ ${score}% · ${esc(label)}
          </span>`;
        /* Le test portait sur la PRÉSENCE d'une ligne « Identité » dans le détail. Depuis que
           le serveur renvoie aussi les critères NON acquis, cette condition serait vraie pour
           tout le monde : chaque compte se serait affiché « vérifié », y compris ceux qui ne
           le sont pas. On vérifie donc les points, pas l'existence de la ligne. */
        const identite = detail.find(d => d.cle === 'identite');
        if (identite && identite.pts >= identite.max) {
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

      /* Le bouton « Demander une rencontre » n'est pas un lien : il ouvre le formulaire
         sur place. Sans ce branchement, il renverrait vers une ancre inexistante. */
      container.querySelectorAll('[data-rencontre]').forEach(a => {
        a.addEventListener('click', e => {
          e.preventDefault();
          demanderRencontre(() => render(userId, container, opts));
        });
      });

    } catch (e) {
      container.innerHTML = '<div style="color:#ef4444;font-size:12px">Impossible de charger l’indice de fiabilité.</div>';
    }
  }

  /* ─────────── Demander une rencontre Diaspo'Actif ───────────
     Le membre demande ; un agent fixe la date, puis décide de valider ou non.
     Rien ici n'accorde de point : c'est volontaire, et c'est dit à l'écran. */
  function demanderRencontre(apres) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(13,27,42,.55);z-index:10000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:36px 14px;';
    ov.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:460px;width:100%;padding:22px;font-family:inherit;">
      <h3 style="margin:0 0 6px;font-size:16px;">🤝 Demander une rencontre Diaspo'Actif</h3>
      <p style="margin:0 0 14px;font-size:12.5px;color:#64748b;line-height:1.5;">
        À l'issue de l'échange, Diaspo'Actif décide d'accorder ou non les points correspondants.
        <strong style="color:#334155;">Durée estimée : 30 à 45 minutes.</strong>
      </p>

      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:5px;">Comment souhaitez-vous échanger ?</label>
      <div class="da-pill-group" id="tr-modes" style="margin-bottom:14px;">
        <label class="da-pill checked"><input type="radio" name="tr-mode" value="visio" checked><span>🎥 En visioconférence</span></label>
        <label class="da-pill"><input type="radio" name="tr-mode" value="presentiel"><span>📍 En présentiel</span></label>
      </div>

      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:5px;" for="tr-creneau">Proposez une date et une heure</label>
      <input type="datetime-local" id="tr-creneau"
        style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:9px;font-size:13px;font-family:inherit;">
      <p style="margin:6px 0 12px;font-size:11.5px;color:#64748b;line-height:1.45;">
        Si ce créneau n'est pas disponible, la rencontre sera reprogrammée à une date
        ultérieure par Diaspo'Actif.
      </p>

      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:5px;">Message (facultatif)</label>
      <textarea id="tr-message" rows="3" placeholder="Ce dont vous aimeriez parler…"
        style="width:100%;padding:9px 12px;border:1px solid #CBD5E1;border-radius:9px;font-size:13px;font-family:inherit;"></textarea>

      <label style="display:block;font-size:12px;font-weight:700;margin:12px 0 5px;">Pièces jointes (facultatif)</label>
      <p style="margin:0 0 8px;font-size:11.5px;color:#64748b;line-height:1.45;">
        Documents ou images qui présentent mieux votre profil : plaquette, statuts,
        photos de réalisations… PDF, Word, Excel, PowerPoint ou image, 15 Mo maximum,
        5 fichiers au plus.
      </p>
      <button type="button" id="tr-ajouter-piece"
        style="padding:8px 14px;border:1.5px dashed #CBD5E1;background:#F8FAFC;border-radius:9px;font-size:12.5px;font-weight:700;color:#334155;cursor:pointer;font-family:inherit;">
        📎 Ajouter un fichier
      </button>
      <div id="tr-pieces" style="display:flex;flex-direction:column;gap:6px;margin-top:8px;"></div>

      <div id="tr-erreur" style="display:none;margin-top:10px;padding:9px 12px;background:#FEF2F2;border:1px solid #FECACA;border-radius:9px;font-size:12.5px;color:#991B1B;"></div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
        <button type="button" id="tr-annuler" style="padding:9px 16px;border:1.5px solid #CBD5E1;background:#fff;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">Annuler</button>
        <button type="button" id="tr-envoyer" style="padding:9px 18px;border:0;background:#F26422;color:#fff;border-radius:9px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;">Envoyer la demande</button>
      </div>
    </div>`;
    document.body.appendChild(ov);

    /* On empêche de proposer une date passée dès la saisie, plutôt que de laisser le
       serveur refuser après coup : le champ ne propose que des créneaux à venir. */
    const champCreneau = ov.querySelector('#tr-creneau');
    const dansUneHeure = new Date(Date.now() + 3600000);
    dansUneHeure.setMinutes(dansUneHeure.getMinutes() - dansUneHeure.getTimezoneOffset());
    champCreneau.min = dansUneHeure.toISOString().slice(0, 16);

    /* Déclaré au niveau de la fenêtre : la zone d'erreur sert aussi bien à l'envoi du
       formulaire qu'aux refus de fichiers. */
    const err = ov.querySelector('#tr-erreur');

    /* ── Pièces jointes ──
       Les fichiers sont envoyés dès leur sélection, pas au moment de valider : le membre
       voit immédiatement si l'un d'eux est refusé, plutôt que de perdre tout son
       formulaire sur une erreur d'envoi. */
    const pieces = [];
    const zonePieces = ov.querySelector('#tr-pieces');
    const dessinerPieces = () => {
      zonePieces.innerHTML = pieces.map((p, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#F1F5F9;border-radius:8px;font-size:12.5px;">
          <span>${/\.(jpg|jpeg|png|gif|webp)$/i.test(p.url) ? '🖼️' : '📄'}</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.nom)}</span>
          <button type="button" data-retirer="${i}" title="Retirer" aria-label="Retirer ${esc(p.nom)}"
            style="border:0;background:none;cursor:pointer;font-size:15px;color:#94A3B8;line-height:1;">×</button>
        </div>`).join('');
      zonePieces.querySelectorAll('[data-retirer]').forEach(b => {
        b.onclick = () => { pieces.splice(Number(b.dataset.retirer), 1); dessinerPieces(); };
      });
    };

    ov.querySelector('#tr-ajouter-piece').onclick = () => {
      if (!window.uploadMedia) {
        err.textContent = "Le module d'envoi de fichiers n'est pas disponible sur cette page.";
        err.style.display = ''; return;
      }
      if (pieces.length >= 5) {
        err.textContent = '5 fichiers au maximum.'; err.style.display = ''; return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/jpeg,image/png,image/gif,image/webp';
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return;
        const btn = ov.querySelector('#tr-ajouter-piece');
        btn.disabled = true; btn.textContent = '📎 Envoi…';
        try {
          const url = await uploadMedia(f, 'document');
          pieces.push({ url, nom: f.name });
          dessinerPieces();
          err.style.display = 'none';
        } catch (e) {
          err.textContent = 'Fichier refusé : ' + e.message;
          err.style.display = '';
        } finally {
          btn.disabled = false; btn.textContent = '📎 Ajouter un fichier';
        }
      };
      input.click();
    };

    /* Les pastilles portent leur état par une classe : sans cette synchronisation,
       cliquer ne changerait rien à l'écran. */
    ov.addEventListener('change', () => {
      ov.querySelectorAll('.da-pill').forEach(l => {
        const i = l.querySelector('input');
        if (i) l.classList.toggle('checked', i.checked);
      });
    });

    ov.querySelector('#tr-annuler').onclick = () => ov.remove();
    ov.querySelector('#tr-envoyer').onclick = async () => {
      const btn = ov.querySelector('#tr-envoyer');
      const creneau = champCreneau.value;
      if (!creneau) {
        err.textContent = 'Proposez une date et une heure pour la rencontre.';
        err.style.display = '';
        champCreneau.focus();
        return;
      }
      btn.disabled = true; btn.textContent = 'Envoi…';
      try {
        const r = await fetch('/api/rencontres', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: ov.querySelector('input[name="tr-mode"]:checked')?.value || 'visio',
            creneau_souhaite: creneau.replace('T', ' '),
            message: ov.querySelector('#tr-message').value,
            pieces,
          }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error || ('Réponse ' + r.status));
        ov.remove();
        if (typeof apres === 'function') apres();
      } catch (e) {
        err.textContent = e.message;
        err.style.display = '';
        btn.disabled = false; btn.textContent = 'Envoyer la demande';
      }
    };
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
  window.TrustWidget = { render, reportAccount, reportInitiative, setAbsence, clearAbsence, autoInit, demanderRencontre };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

})();
