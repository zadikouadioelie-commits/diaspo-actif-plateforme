/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Consentement « achat non remboursable » — formations (2026-10-30, décision : aucun remboursement, « à préciser partout »).
   Une formation achetée appartient à l'élève, qu'il la suive ou non : aucun remboursement. Pour que cette règle tienne face au droit de la consommation
   (contenu numérique à accès immédiat), l'élève doit DEMANDER l'accès immédiat et RECONNAÎTRE la perte de son droit de rétractation : case à cocher
   obligatoire avant chaque paiement. Le serveur (server/formation-droits.js) refuse tout achat payant sans `accepte_non_remboursable: true` : ce fichier ne
   fait que demander ce consentement à l'écran. Autonome (son propre CSS) : utilisé par le site ET par l'application téléphone.

   Usage :  if (!(await FormationConsent.demander({ titre, prix }))) return;   puis  api(..., { accepte_non_remboursable: true })
            FormationConsent.mention()  → petite ligne HTML à poser près d'un prix ou d'un bouton d'achat.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.FormationConsent) return;

  const TEXTE = "Achat définitif : une formation achetée vous appartient, que vous la suiviez ou non, et ne donne lieu à aucun remboursement. Réfléchissez bien avant d'acheter.";
  const RETRACTATION = "Je demande l'accès immédiat au contenu et je reconnais que je perds mon droit de rétractation dès que l'accès est ouvert.";

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function injecterCss() {
    if (document.getElementById('fcs-css')) return;
    const st = document.createElement('style');
    st.id = 'fcs-css';
    st.textContent = `
.fcs-fond{position:fixed;inset:0;z-index:100000;background:rgba(6,10,20,.72);display:flex;align-items:center;justify-content:center;padding:16px;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.fcs-carte{width:min(460px,100%);max-height:92vh;overflow:auto;box-sizing:border-box;background:#fff;color:#14213d;border-radius:18px;padding:22px 20px 18px;box-shadow:0 24px 60px rgba(0,0,0,.45);font-family:inherit;text-align:left}
/* Encres posées avec !important : la fenêtre est CLAIRE et s'ajoute au <body> ; sous un thème sombre (Nuit dorée : h1/h2 en blanc), son titre devenait blanc sur blanc. */
.fcs-carte h2{margin:0 0 4px;font-size:19px;font-weight:800;color:#14213d!important}
.fcs-carte .fcs-quoi{color:#42526e!important}
.fcs-carte .fcs-avis{color:#7c2d12!important}
.fcs-carte .fcs-case,.fcs-carte .fcs-case span{color:#14213d!important}
.fcs-carte .fcs-actions button{color:#14213d!important}
.fcs-carte .fcs-actions .fcs-ok{color:#fff!important}
.fcs-quoi{margin:0 0 12px;font-size:14px;color:#42526e}
.fcs-avis{margin:0 0 14px;padding:12px 14px;border-radius:12px;background:#fff7ed;border:1.5px solid #fdba74;color:#7c2d12;font-size:14px;line-height:1.5;font-weight:600}
.fcs-case{display:flex;gap:10px;align-items:flex-start;margin:0 0 16px;padding:10px 12px;border-radius:12px;border:1.5px solid #cbd5e1;background:#f8fafc;color:#14213d;font-size:13.5px;line-height:1.45;cursor:pointer}
.fcs-case input{flex:none;width:20px;height:20px;margin-top:1px;accent-color:#b84c1a;cursor:pointer}
.fcs-actions{display:flex;gap:10px;flex-wrap:wrap}
.fcs-actions button{flex:1 1 150px;min-height:46px;border-radius:999px;font:inherit;font-weight:800;font-size:15px;cursor:pointer;border:1.5px solid #cbd5e1;background:#fff;color:#14213d}
.fcs-actions .fcs-ok{background:#b84c1a;border-color:#b84c1a;color:#fff}
.fcs-actions .fcs-ok:disabled{opacity:.45;cursor:not-allowed}
.fcs-actions button:focus-visible,.fcs-case:focus-within{outline:2px solid #1e4f8a;outline-offset:2px}
.fcs-mention{margin:6px 0 0;font-size:12.5px;line-height:1.4;color:inherit;opacity:.85}
`;
    document.head.appendChild(st);
  }

  /* Ouvre la fenêtre ; résout true si l'élève coche puis confirme, false s'il annule (bouton, Échap ou clic à côté). */
  function demander(opts) {
    opts = opts || {};
    injecterCss();
    return new Promise(resolve => {
      const precedent = document.activeElement;
      const fond = document.createElement('div');
      fond.className = 'fcs-fond';
      const quoi = opts.titre ? `<p class="fcs-quoi">${esc(opts.titre)}${opts.prix > 0 ? ` · <b>${esc((Number(opts.prix) % 1 ? Number(opts.prix).toFixed(2) : String(opts.prix)).replace('.', ','))} €</b>` : ''}</p>` : '';
      fond.innerHTML = `<div class="fcs-carte" role="dialog" aria-modal="true" aria-labelledby="fcs-titre">
        <h2 id="fcs-titre">Avant de payer</h2>${quoi}
        <div class="fcs-avis">🚫 ${esc(opts.texte || TEXTE)}</div>
        <label class="fcs-case"><input type="checkbox" id="fcs-coche"><span>${esc(opts.retractation || RETRACTATION)}</span></label>
        <div class="fcs-actions"><button type="button" class="fcs-non">Annuler</button><button type="button" class="fcs-ok" disabled>Continuer vers le paiement</button></div>
      </div>`;
      const coche = fond.querySelector('#fcs-coche'), ok = fond.querySelector('.fcs-ok'), non = fond.querySelector('.fcs-non');
      const fermer = valeur => {
        document.removeEventListener('keydown', surTouche, true);
        fond.remove();
        try { if (precedent && precedent.focus) precedent.focus(); } catch (_) { /* sans importance */ }
        resolve(valeur);
      };
      const surTouche = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(false); }
        else if (e.key === 'Tab') { /* le focus reste dans la fenêtre */
          const focalisables = [coche, non, ok].filter(x => !x.disabled);
          const i = focalisables.indexOf(document.activeElement);
          const suivant = e.shiftKey ? (i <= 0 ? focalisables[focalisables.length - 1] : focalisables[i - 1]) : (i === -1 || i === focalisables.length - 1 ? focalisables[0] : focalisables[i + 1]);
          e.preventDefault(); suivant.focus();
        }
      };
      coche.addEventListener('change', () => { ok.disabled = !coche.checked; });
      ok.addEventListener('click', () => { if (coche.checked) fermer(true); });
      non.addEventListener('click', () => fermer(false));
      fond.addEventListener('click', e => { if (e.target === fond) fermer(false); });
      document.addEventListener('keydown', surTouche, true);
      document.body.appendChild(fond);
      coche.focus();
    });
  }

  /* Petite ligne à poser près d'un prix ou d'un bouton d'achat. */
  function mention(texteCourt) {
    injecterCss();
    return `<p class="fcs-mention">🚫 ${esc(texteCourt || 'Achat non remboursable : une formation achetée vous appartient, suivie ou non.')}</p>`;
  }

  /* Cycle complet : appel(extra) est rejoué avec { accepte_non_remboursable: true } si le serveur réclame le consentement et que l'élève l'accorde.
     Si l'élève annule, lève une erreur portant `annule: true` (à ignorer sans message). Toute autre erreur est relancée telle quelle. */
  async function appeler(appel, info) {
    try { return await appel({}); }
    catch (e) {
      if (!(e && e.data && e.data.code === 'consentement_requis')) throw e;
      const oui = await demander(Object.assign({}, info || {}, { prix: e.data.montant, texte: e.data.texte, retractation: e.data.retractation }));
      if (!oui) { const a = new Error('Achat annulé.'); a.annule = true; throw a; }
      return appel({ accepte_non_remboursable: true });
    }
  }

  window.FormationConsent = { demander, appeler, mention, TEXTE, RETRACTATION };
})();
