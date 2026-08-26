/* Calcule les modules réellement présents sur CETTE page (assets/module-aide.js) —
   permet à O-Z de ne répondre qu'avec les modules pertinents pour ce dashboard
   (ex. ne pas répondre avec le "Module paiement" de l'Initiative sur le dashboard
   Utilisateur, qui a son propre module "Paiements").

   Icône "?" par module (2026-08-26, demande explicite de l'utilisateur, capture à l'appui) :
   le commentaire d'assets/module-aide.js annonçait cette icône depuis le début, mais elle
   n'avait jamais été branchée — MODULE_AIDE ne servait qu'au chatbot. Ajoutée ici, seul
   endroit qui scanne déjà les liens .sidebar[data-aide] : un petit bouton rond en fin de
   ligne, à côté du nom du module, ouvre une explication courte (à quoi sert ce module).
   Couvre les 3 dashboards qui chargent ce script (Initiative, Utilisateur, Collectivité) et,
   de fait, le menu plein écran mobile qui réutilise le même .sidebar. */
(function () {
  function init() {
    if (!window.MODULE_AIDE) return;
    window._moduleAideActifs = new Set(
      [...document.querySelectorAll('.sidebar a[data-aide]')].map(a => a.getAttribute('data-aide'))
    );
    poserBoutons();
  }

  function poserBoutons() {
    document.querySelectorAll('.sidebar a[data-aide]').forEach(a => {
      if (a.querySelector('.module-aide-btn')) return; // déjà posé (rescan périodique)
      const slug = a.getAttribute('data-aide');
      const entree = window.MODULE_AIDE[slug];
      if (!entree) return; // slug présent dans le HTML mais pas encore documenté — n'affiche rien plutôt qu'un bouton vide
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'module-aide-btn';
      btn.setAttribute('data-aide-slug', slug);
      btn.setAttribute('aria-label', `À quoi sert « ${entree.titre.replace(/^\S+\s/, '')} » ?`);
      btn.title = 'En savoir plus sur ce module';
      btn.textContent = '?';
      btn.style.cssText = 'flex-shrink:0;margin-left:auto;width:20px;height:20px;min-height:0;border-radius:50%;border:none;background:#16A34A;color:#fff;font-size:12px;font-weight:800;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;box-shadow:0 1px 3px rgba(0,0,0,.25);';
      btn.addEventListener('mouseenter', () => btn.style.background = '#15803D');
      btn.addEventListener('mouseleave', () => btn.style.background = '#16A34A');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ouvrirAideModule(entree);
      });
      a.appendChild(btn);
    });
  }

  function ouvrirAideModule(entree) {
    document.getElementById('module-aide-modal')?.remove();
    const ov = document.createElement('div');
    ov.id = 'module-aide-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(13,27,42,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:24px;">
      <h3 style="margin:0 0 12px;font-size:16px;color:#0D1B2A;">${entree.titre}</h3>
      <p style="margin:0;font-size:13.5px;color:#374151;line-height:1.6;">${entree.texte}</p>
      <div style="text-align:right;margin-top:18px;">
        <button type="button" onclick="document.getElementById('module-aide-modal').remove()" style="padding:8px 18px;border-radius:8px;border:none;background:#16A34A;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">Compris</button>
      </div>
    </div>`;
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* Certains liens (ex. modules Premium révélés après vérification d'accréditation,
     ou groupes masqués par défaut) apparaissent après le chargement initial —
     on rescanne périodiquement pendant les premières secondes. poserBoutons() est
     déjà protégé contre les doublons (voir plus haut). */
  let tries = 0;
  const rescan = setInterval(() => {
    init();
    if (++tries > 20) clearInterval(rescan);
  }, 500);
})();
