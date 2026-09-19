/* ===========================================================
   DIASPO'ACTIF — Réorganisation des modules du menu latéral
   (2026-09-07, demande explicite de l'utilisateur, capture à l'appui)

   REMPLACE une première version de ce fichier (commit ad41971, 13/07/2026),
   restée branchée sur les 4 dashboards mais jamais réellement utilisable :
   elle rendait CHAQUE lien draggable en permanence via l'API HTML5 native
   (draggable="true"), qui ne fonctionne pas au toucher (mobile/tablette) —
   or c'est là que ce menu est le plus utilisé. Aucune poignée visible non
   plus, donc même sur ordinateur la fonctionnalité restait invisible.
   Découvert en creusant pourquoi aucun bouton de réorganisation n'apparaissait
   dans mes tests, alors que l'utilisateur demandait cette fonctionnalité comme
   si elle n'existait pas — elle existait, mais ne marchait jamais vraiment.

   Cette version : glisser-déposer par Pointer Events (souris ET tactile),
   UNIQUEMENT en mode "Réorganiser" (bouton dédié en haut du menu) pour éviter
   tout déplacement accidentel en usage normal — même logique que le mode
   édition du Widget Board — avec poignée ⠿ visible en mode actif.

   Le glisser-déposer reste CONFINÉ à l'intérieur de chaque groupe
   (les intitulés ".sb-group-lbl" comme "01 — OUTILS") : on ne mélange
   pas les catégories entre elles, seulement leur ordre interne.

   Persistance : PUT /api/profil { profil: { sidebar_ordre: [...] } } —
   réutilise la route générique déjà utilisée pour toutes les préférences
   utilisateur (fusionnée dans profil_json), donc aucune nouvelle route ni
   colonne de base de données. Clé différente de l'ancienne version
   (qui utilisait profil.sidebar_order, un objet keyé par pathname) : l'ancienne
   clé devient orpheline mais elle n'a jamais contenu de données réelles
   utilisables (fonctionnalité invisible = jamais utilisée), donc rien à migrer.

   Branché historiquement sur 4 dashboards (Initiative, Utilisateur,
   Collectivité, Administrateur — voir le <script> déjà présent dans chacun,
   non touché ici) ; tous partagent la même structure .sidebar / .sb-group-lbl
   / .brand.
   =========================================================== */
(function () {
  let mode = false;
  let saveTimer = null;
  let dragEl = null;
  let dragGroup = null;

  function stableKey(a) {
    return a.id || a.dataset.section || a.dataset.aide ||
      (a.getAttribute('href') || '').replace(/[^a-z0-9_-]/gi, '_');
  }

  /* Module "La Valise" (rangement de modules inutilisés) retiré le 2026-09-19 à la demande
     explicite de l'utilisateur, remplacé par le module Expansion déjà existant sur
     dashboard-initiative.html (data-section="expansion-catalogue"). Nettoyage ponctuel
     ci-dessous plutôt qu'un simple retrait sec du code : un compte ayant déjà rangé des
     modules avant ce retrait aurait sinon des liens restés display:none pour toujours
     (dataset.valiseHiddenBy) sans plus aucun moyen de les récupérer dans l'interface, et la
     clé "sidebar_valise" resterait orpheline dans profil_json. */
  function nettoyerValiseHeritee(sidebar) {
    const u = utilisateurCourant();
    const avaitValise = u && u.profil && Array.isArray(u.profil.sidebar_valise) && u.profil.sidebar_valise.length;
    sidebar.querySelectorAll(':scope > a[href][data-valise-hidden-by]').forEach(a => {
      a.style.display = '';
      delete a.dataset.valiseHiddenBy;
    });
    getGroups(sidebar).forEach(group => {
      const lbl = group[0].previousElementSibling;
      if (lbl && lbl.classList && lbl.classList.contains('sb-group-lbl')) lbl.style.display = '';
    });
    if (avaitValise) {
      u.profil.sidebar_valise = [];
      api('PUT', '/profil', { profil: { sidebar_valise: [] } }).catch(() => {});
    }
  }

  // Découpe les <a> directs de la sidebar en tronçons contigus, séparés par ".sb-group-lbl"
  function getGroups(sidebar) {
    const groups = [];
    let current = [];
    Array.from(sidebar.children).forEach(el => {
      if (el.tagName === 'A' && el.hasAttribute('href')) {
        current.push(el);
      } else if (el.classList && el.classList.contains('sb-group-lbl')) {
        if (current.length) groups.push(current);
        current = [];
      }
    });
    if (current.length) groups.push(current);
    return groups;
  }

  // CURRENT_USER est déclaré avec "let" dans assets/app.js (portée lexicale globale du
  // script, PAS une propriété de window) — accessible ici sans préfixe car ce fichier est
  // chargé après app.js comme <script> classique du même contexte global, jamais via
  // "window.CURRENT_USER" qui reste undefined. Piège découvert en testant en conditions
  // réelles (l'ordre sauvegardé ne se réappliquait jamais après rechargement).
  function utilisateurCourant() {
    return typeof CURRENT_USER !== 'undefined' ? CURRENT_USER : null;
  }

  function applySavedOrder(sidebar) {
    const u = utilisateurCourant();
    const ordre = u && u.profil && Array.isArray(u.profil.sidebar_ordre) ? u.profil.sidebar_ordre : null;
    if (!ordre || !ordre.length) return;
    const pos = new Map(ordre.map((k, i) => [k, i]));
    getGroups(sidebar).forEach(group => {
      const sorted = group.slice().sort((a, b) => {
        const pa = pos.has(stableKey(a)) ? pos.get(stableKey(a)) : Infinity;
        const pb = pos.has(stableKey(b)) ? pos.get(stableKey(b)) : Infinity;
        return pa - pb;
      });
      if (sorted.every((el, i) => el === group[i])) return; // déjà dans cet ordre
      const parent = group[0].parentNode;
      const anchor = group[group.length - 1].nextSibling;
      sorted.forEach(el => parent.insertBefore(el, anchor));
    });
  }

  function currentOrder(sidebar) {
    return Array.from(sidebar.children).filter(el => el.tagName === 'A' && el.hasAttribute('href')).map(stableKey);
  }

  function scheduleSave(sidebar) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const ordre = currentOrder(sidebar);
      try {
        await api('PUT', '/profil', { profil: { sidebar_ordre: ordre } });
        const u = utilisateurCourant();
        if (u) {
          u.profil = u.profil || {};
          u.profil.sidebar_ordre = ordre;
        }
      } catch (e) { console.error('[sidebar-reorder] sauvegarde échouée', e); }
    }, 500);
  }

  function poserPoignees(sidebar) {
    sidebar.querySelectorAll(':scope > a[href]').forEach(a => {
      if (a.querySelector('.sb-drag-handle')) return;
      const handle = document.createElement('span');
      handle.className = 'sb-drag-handle';
      handle.textContent = '⠿';
      handle.setAttribute('aria-hidden', 'true');
      handle.title = 'Glisser pour réordonner';
      handle.style.cssText = 'display:none;margin-right:8px;cursor:grab;opacity:.65;touch-action:none;flex-shrink:0;';
      a.insertBefore(handle, a.firstChild);
      handle.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
      /* Écouteur posé sur TOUTE la carte (a), pas seulement sur la petite icône ⠿ — signalé
         par l'utilisateur ("je n'arrive pas à déplacer les modules") : la poignée, collée au
         bord gauche, est une cible trop petite/imprécise à attraper alors que toute la carte a
         l'air cliquable (cadre plein, coins arrondis). L'icône ⠿ reste comme indice visuel,
         mais on peut désormais saisir n'importe où sur la carte, sauf le bouton d'aide "?"
         (.module-aide-btn, assets/module-aide-ui.js), qui doit rester cliquable seul en mode
         réorganisation. */
      a.addEventListener('pointerdown', (e) => {
        if (!mode) return;
        if (e.target.closest('.module-aide-btn')) return;
        e.preventDefault();
        dragEl = a;
        dragGroup = getGroups(sidebar).find(g => g.includes(a)) || [];
        dragEl.classList.add('sb-dragging');
        try { a.setPointerCapture(e.pointerId); } catch (err) {}
      });
    });
  }

  function setMode(sidebar, on, btn) {
    mode = on;
    sidebar.classList.toggle('sb-reorder-mode', on);
    sidebar.querySelectorAll('.sb-drag-handle').forEach(h => h.style.display = on ? 'inline-flex' : 'none');
    if (btn) btn.textContent = on ? '✓ Terminé' : '↕️ Réorganiser les modules';
  }

  function injectStyle() {
    if (document.getElementById('sb-reorder-style')) return;
    const st = document.createElement('style');
    st.id = 'sb-reorder-style';
    st.textContent = '.sb-dragging{opacity:.5;background:rgba(255,255,255,.08);}' +
      /* cursor:grab sur toute la carte (pas seulement la poignée) : le glisser fonctionne
         désormais depuis n'importe où sur la carte, le curseur doit le signaler partout. */
      '.sb-reorder-mode>a[href]{cursor:grab;touch-action:none;}' +
      '.sb-reorder-mode>a[href]:active{cursor:grabbing;}' +
      '.sb-drag-handle:active{cursor:grabbing;}';
    document.head.appendChild(st);
  }

  function injectToggle(sidebar) {
    if (sidebar.querySelector('.sb-reorder-toggle')) return;
    injectStyle();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sb-reorder-toggle';
    btn.textContent = '↕️ Réorganiser les modules';
    btn.style.cssText = 'display:block;width:calc(100% - 24px);margin:6px 12px 4px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:rgba(255,255,255,.85);font-size:11.5px;font-weight:700;cursor:pointer;text-align:left;';
    btn.addEventListener('click', () => setMode(sidebar, !mode, btn));
    const brand = sidebar.querySelector('.brand');
    if (brand) brand.insertAdjacentElement('afterend', btn);
    else sidebar.insertBefore(btn, sidebar.firstChild);

    // Empêche la navigation accidentelle pendant le mode réorganisation (seule la poignée doit agir)
    sidebar.addEventListener('click', (e) => {
      if (!mode) return;
      const a = e.target.closest('a[href]');
      if (a && sidebar.contains(a) && !e.target.closest('.sb-drag-handle')) e.preventDefault();
    }, true);

    sidebar.addEventListener('pointermove', (e) => {
      if (!dragEl || !dragGroup) return;
      const y = e.clientY;
      for (const sib of dragGroup) {
        if (sib === dragEl) continue;
        const r = sib.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) {
          const parent = dragEl.parentNode;
          if (y < r.top + r.height / 2) parent.insertBefore(dragEl, sib);
          else parent.insertBefore(dragEl, sib.nextSibling);
          break;
        }
      }
    });
    const finirDrag = () => {
      if (!dragEl) return;
      dragEl.classList.remove('sb-dragging');
      scheduleSave(sidebar);
      dragEl = null; dragGroup = null;
    };
    sidebar.addEventListener('pointerup', finirDrag);
    sidebar.addEventListener('pointercancel', finirDrag);
  }

  /* En-tête fixe du menu (2026-09-18, demande explicite, capture à l'appui : "même en défilant
     les modules, garde ceci toujours visible" — recherche + bouton Réorganiser).
     .sidebar est le conteneur qui défile lui-même (overflow-y:auto, voir styles.v2.css) et le
     logo/la recherche/ces boutons ne sont que des enfants directs comme les liens de module —
     rien ne les gardait visibles au défilement. Regroupe tout ce qui précède le premier lien
     ou intitulé de groupe dans un conteneur position:sticky;top:0 — sans déplacer les liens
     eux-mêmes, qui doivent rester des enfants DIRECTS de .sidebar (poserPoignees/getGroups
     plus haut les sélectionnent via ":scope > a[href]"). Idempotent et rejoué à chaque rescan
     ci-dessous : peu importe que la recherche (assets/app.js) ou ces boutons soient injectés
     en premier, le prochain passage les regroupe de toute façon. */
  function applyStickyHeader(sidebar) {
    let header = sidebar.querySelector('.sb-sticky-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'sb-sticky-header';
      header.style.cssText = 'position:sticky;top:0;z-index:20;background:var(--navy);';
      sidebar.insertBefore(header, sidebar.firstChild);
    }
    let node = header.nextSibling;
    while (node && !(node.nodeType === 1 && (node.matches('a[href]') || node.classList.contains('sb-group-lbl')))) {
      const suivant = node.nextSibling;
      header.appendChild(node);
      node = suivant;
    }
  }

  function init() {
    const sidebar = document.querySelector('aside.sidebar');
    if (!sidebar) return;
    // Réappliqué à chaque re-scan (pas seulement une fois) : d'autres scripts du dashboard
    // peuvent réinjecter/réordonner des liens après le premier passage (ex. révélation de
    // modules Premium) — la fonction est un no-op si l'ordre est déjà correct.
    if (!mode && utilisateurCourant()) applySavedOrder(sidebar);
    injectToggle(sidebar);
    poserPoignees(sidebar); // pose aussi les poignées des liens révélés après coup (Premium, association...)
    if (utilisateurCourant()) nettoyerValiseHeritee(sidebar); // ex-module "La Valise" retiré, voir plus haut
    applyStickyHeader(sidebar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  let tries = 0;
  const rescan = setInterval(() => {
    init();
    if (++tries > 20) clearInterval(rescan);
  }, 500);
})();
