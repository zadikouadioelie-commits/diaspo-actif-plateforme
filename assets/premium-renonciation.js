/* ============================================================
   Diaspo'Actif — Souscription Premium : confirmation obligatoire (2026-10-13, demande explicite)
   Avant d'ouvrir le paiement, le membre confirme :
   · qu'il demande l'exécution immédiate du service et renonce à son droit de rétractation de 14 jours (case OBLIGATOIRE) ;
   · il voit aussi ce qui se passe avec sa période Premium offerte : elle n'est jamais perdue — l'abonnement est enregistré tout de suite
     (carte enregistrée, tout est « scellé »), mais le premier prélèvement n'a lieu qu'à la fin de la période offerte.
   Usage : const ok = await PremiumRenonciation.demander({ typeTarif:'mensuel'|'annuel', montant, devise }); → true si confirmé.
   Le serveur revérifie tout (POST /api/accreditations/:type/payer refuse sans renonciation_retractation:true et fixe lui-même la date du
   premier prélèvement) : cette fenêtre n'est qu'une explication, jamais une source de confiance.
   ============================================================ */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = d => { try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } };
  const fmtPrix = (m, dev) => { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: (dev || 'EUR').toUpperCase() }).format(Number(m)); } catch (e) { return m + ' ' + (dev || '€'); } };

  async function finOffert() {
    try {
      const r = await fetch('/api/premium/statut', { credentials: 'same-origin' });
      if (!r.ok) return null;
      const s = await r.json();
      /* Période offerte en cours : actif, aucun montant payé, date de fin connue et à plus de 48 h (minimum accepté par le prestataire de paiement). */
      if (s && s.actif && !(Number(s.montant_paye) > 0) && s.date_expiration && new Date(s.date_expiration).getTime() > Date.now() + 49 * 3600 * 1000) return s.date_expiration;
    } catch (e) { /* on affiche alors la version « prélèvement immédiat » */ }
    return null;
  }

  async function demander(opts) {
    opts = opts || {};
    const fin = await finOffert();
    const formule = opts.typeTarif === 'annuel' ? 'annuelle' : 'mensuelle';
    const prix = opts.montant != null ? fmtPrix(opts.montant, opts.devise) + (opts.typeTarif === 'annuel' ? ' / an' : ' / mois') : '';
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.id = 'pr-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'pr-titre');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(13,27,42,.62);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';
      ov.innerHTML = `<div style="background:#fff;color:#0D1B2A;border-radius:16px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:inherit;max-height:94vh;overflow-y:auto;">
        <div style="padding:20px 22px 6px;"><h2 id="pr-titre" style="margin:0 0 6px;font-size:19px;line-height:1.25;">Confirmer votre abonnement Premium</h2>
          <p style="margin:0;font-size:14px;color:#475569;">Formule ${formule}${prix ? ' — <b>' + esc(prix) + '</b>' : ''}</p></div>
        <div style="padding:10px 22px 0;">
          ${fin ? `<div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5;margin-bottom:12px;">
            <b>✅ Votre Premium offert n’est pas perdu.</b> Il continue jusqu’au <b>${esc(fmtDate(fin))}</b>. Votre abonnement est enregistré dès maintenant, mais <b>aucun prélèvement n’aura lieu avant cette date</b> : le premier prélèvement interviendra le <b>${esc(fmtDate(fin))}</b>. Vous pouvez résilier avant, sans frais, depuis « Mon abonnement ».</div>`
            : `<div style="background:#FFF7ED;border:1px solid #FDBA74;border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5;margin-bottom:12px;">Votre période offerte est terminée : le premier prélèvement aura lieu dès la confirmation du paiement.</div>`}
          <label style="display:flex;gap:10px;align-items:flex-start;font-size:13.5px;line-height:1.5;cursor:pointer;">
            <input type="checkbox" id="pr-case" style="width:20px;height:20px;margin-top:2px;flex:none;accent-color:#B9893A;">
            <span>Je demande l’<b>exécution immédiate</b> de mon abonnement Premium et je reconnais que je <b>renonce à mon droit de rétractation de 14 jours</b> une fois le service pleinement exécuté (article L221-28 du Code de la consommation). <a href="cgv.html#retractation" target="_blank" rel="noopener" style="color:#1d4ed8;">Conditions générales de vente</a></span>
          </label>
          <p id="pr-err" role="alert" style="color:#b91c1c;font-size:13px;margin:8px 0 0;min-height:0;"></p>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;padding:14px 22px 20px;flex-wrap:wrap;">
          <button type="button" id="pr-non" style="padding:11px 18px;border-radius:10px;border:1.5px solid #CBD5E1;background:#fff;color:#334155;font-weight:700;cursor:pointer;min-height:44px;">Annuler</button>
          <button type="button" id="pr-oui" disabled style="padding:11px 18px;border-radius:10px;border:none;background:#0D2B4E;color:#fff;font-weight:800;cursor:pointer;min-height:44px;opacity:.5;">Confirmer et continuer</button>
        </div></div>`;
      document.body.appendChild(ov);
      const oui = ov.querySelector('#pr-oui'), non = ov.querySelector('#pr-non'), cas = ov.querySelector('#pr-case'), err = ov.querySelector('#pr-err');
      const fermer = v => { document.removeEventListener('keydown', echap); ov.remove(); resolve(v); };
      const echap = e => { if (e.key === 'Escape') fermer(false); };
      document.addEventListener('keydown', echap);
      cas.onchange = () => { oui.disabled = !cas.checked; oui.style.opacity = cas.checked ? '1' : '.5'; err.textContent = ''; };
      oui.onclick = () => { if (!cas.checked) { err.textContent = 'Cochez la case pour continuer.'; return; } fermer(true); };
      non.onclick = () => fermer(false);
      ov.addEventListener('click', e => { if (e.target === ov) fermer(false); });
      cas.focus();
    });
  }
  window.PremiumRenonciation = { demander };
})();
