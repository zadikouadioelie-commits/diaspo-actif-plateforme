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

  /* ===========================================================
     LA VALISE (2026-09-18, demande explicite : "cree un module nomé
     valise utile pour ranger les moduls inutils... stoquer les moduls
     non utile pour le comte afin de liberer la place")

     Reprend exactement le même patron que la réorganisation ci-dessus :
     - stableKey() réutilisée telle quelle comme identifiant persistant.
     - Persistance via la même route générique PUT /api/profil (fusion
       dans profil_json), nouvelle clé "sidebar_valise" (tableau de clés
       rangées) — aucune nouvelle route ni colonne de base.
     - Un module rangé n'est JAMAIS supprimé du DOM (juste display:none
       en vue normale) : ses écouteurs et ses dataset restent intacts
       si un autre script du dashboard le cible par id (ex. le badge
       #init-pub-badge sur "Publicités").
     - Rangement possible uniquement en mode "Réorganiser les modules"
       déjà existant (petit bouton 🧳 à côté de la poignée ⠿), pour ne
       jamais ajouter de bouton supplémentaire en usage normal — but
       explicite de la demande étant justement de libérer de la place.
     =========================================================== */
  let valiseMode = false;
  let valiseSaveTimer = null;
  // { a: <élément>, parent, next } — position d'origine de chaque lien
  // temporairement déplacé dans le panneau Valise, pour le restituer
  // exactement là où il était une fois la Valise refermée.
  const valiseSlots = new Map();

  function getValise() {
    const u = utilisateurCourant();
    const v = u && u.profil && Array.isArray(u.profil.sidebar_valise) ? u.profil.sidebar_valise : [];
    return v.slice();
  }

  function scheduleSaveValise(valise) {
    // L'état local (CURRENT_USER.profil.sidebar_valise) doit refléter le changement
    // IMMÉDIATEMENT et non à la fin du debounce — bug réel constaté à l'exécution : deux
    // rangements/sorties rapprochés (ex. sortir un module puis rouvrir aussitôt la Valise)
    // relisaient l'ancienne valeur via getValise() tant que le PUT débouncé n'avait pas
    // encore abouti, laissant le panneau et le badge affichés au mauvais état pendant ~400ms
    // voire de façon incohérente en cas de clics rapprochés. Seul l'APPEL RÉSEAU reste
    // débouncé ci-dessous, pas la mise à jour de l'état local qui pilote l'affichage.
    const u = utilisateurCourant();
    if (u) { u.profil = u.profil || {}; u.profil.sidebar_valise = valise; }
    clearTimeout(valiseSaveTimer);
    valiseSaveTimer = setTimeout(async () => {
      try {
        await api('PUT', '/profil', { profil: { sidebar_valise: valise } });
      } catch (e) { console.error('[sidebar-valise] sauvegarde échouée', e); }
    }, 400);
  }

  // Masque (vue normale) tout lien dont la clé est dans la Valise, et masque avec lui
  // toute catégorie devenue entièrement vide — un intitulé de groupe flottant sans rien
  // en dessous aurait l'air cassé, contraire au but de "libérer la place".
  function applyValiseHidden(sidebar) {
    if (valiseMode) return; // la vue Valise gère sa propre visibilité, voir renderValiseView()
    const valise = new Set(getValise());
    sidebar.querySelectorAll(':scope > a[href]').forEach(a => {
      if (valise.has(stableKey(a))) a.style.display = 'none';
      else if (a.dataset.valiseHiddenBy === '1') { a.style.display = ''; delete a.dataset.valiseHiddenBy; }
    });
    getGroups(sidebar).forEach(group => {
      const lbl = group[0].previousElementSibling;
      const toutMasque = group.every(a => a.style.display === 'none');
      if (lbl && lbl.classList && lbl.classList.contains('sb-group-lbl')) lbl.style.display = toutMasque ? 'none' : '';
    });
  }

  function majBadgeValise(btn) {
    const n = getValise().length;
    btn.textContent = n ? `🧳 La Valise (${n})` : '🧳 La Valise';
  }

  // Bug réel constaté à l'exécution : sur un module verrouillé Premium (ex. "CRM"),
  // applyPremiumButtonStyles() (dashboard-initiative.html) reconstruit link.innerHTML
  // ("🔒 " + innerHTML actuel) pour poser le cadenas — une réécriture d'innerHTML détruit
  // TOUT élément enfant existant et le recrée sans ses écouteurs, y compris un bouton 🧳
  // déjà posé avec son propre addEventListener('click', ...). Un clic sur "CRM" en mode
  // Réorganiser continuait donc jusqu'à l'intercepteur Premium du lien lui-même (ouverture
  // de l'upsell, fermeture accidentelle du tiroir), sans jamais ranger le module. Ce bouton
  // reste donc un simple marqueur visuel (pas de logique posée dessus) ; le clic réel est
  // géré une seule fois par délégation sur .sidebar lui-même (jamais reconstruit), voir
  // injectValiseToggle().
  function poserBoutonsValise(sidebar) {
    sidebar.querySelectorAll(':scope > a[href]').forEach(a => {
      if (a.querySelector('.sb-valise-btn')) return;
      const btn = document.createElement('span');
      btn.className = 'sb-valise-btn';
      btn.textContent = '🧳';
      btn.title = 'Ranger dans la Valise';
      btn.setAttribute('role', 'button');
      btn.style.cssText = 'display:none;margin-left:8px;flex-shrink:0;cursor:pointer;opacity:.7;font-size:13px;';
      a.appendChild(btn);
    });
  }

  function renderValiseView(sidebar, panel) {
    const valise = getValise();
    panel.innerHTML = '';
    if (!valise.length) {
      const vide = document.createElement('div');
      vide.style.cssText = 'padding:16px;color:rgba(255,255,255,.55);font-size:12.5px;line-height:1.6;';
      vide.textContent = "Aucun module rangé pour l'instant. En mode « Réorganiser les modules », cliquez sur 🧳 à côté d'un module pour le ranger ici.";
      panel.appendChild(vide);
      return;
    }
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.9px;color:rgba(255,255,255,.4);padding:12px 16px 4px;';
    lbl.textContent = 'Modules rangés';
    panel.appendChild(lbl);
    const allLinks = Array.from(sidebar.querySelectorAll(':scope > a[href]'));
    valise.forEach(key => {
      const a = allLinks.find(el => stableKey(el) === key);
      if (!a) return; // clé orpheline (module retiré de la plateforme depuis) : ignorée, sans casser le reste
      if (!valiseSlots.has(a)) valiseSlots.set(a, { parent: a.parentNode, next: a.nextSibling });
      a.style.display = 'flex';
      // Même choix que .sb-valise-btn ci-dessus : aucun écouteur posé directement sur ce
      // bouton (vulnérable à une reconstruction innerHTML par ailleurs sur ce même lien) —
      // le clic réel est géré par délégation sur .sidebar, voir injectValiseToggle().
      let restore = a.querySelector('.sb-valise-restore');
      if (!restore) {
        restore = document.createElement('span');
        restore.className = 'sb-valise-restore';
        restore.title = 'Remettre dans le menu';
        restore.setAttribute('role', 'button');
        restore.style.cssText = 'margin-left:auto;flex-shrink:0;cursor:pointer;font-size:12.5px;font-weight:700;opacity:.85;';
        restore.textContent = '↩️';
        a.appendChild(restore);
      }
      panel.appendChild(a);
    });
  }

  function setValiseMode(sidebar, on, btn) {
    valiseMode = on;
    if (on && mode) setMode(sidebar, false, sidebar.querySelector('.sb-reorder-toggle')); // les deux modes d'édition ne se mélangent pas
    sidebar.querySelectorAll(':scope > a[href]').forEach(a => { a.style.display = on ? 'none' : ''; });
    getGroups(sidebar).forEach(group => {
      const lbl = group[0].previousElementSibling;
      if (lbl && lbl.classList && lbl.classList.contains('sb-group-lbl')) lbl.style.display = on ? 'none' : '';
    });
    const panel = sidebar.querySelector('.sb-valise-panel');
    if (on) {
      renderValiseView(sidebar, panel);
      panel.style.display = 'block';
    } else {
      // Restitue chaque lien encore présent dans le panneau à sa position d'origine avant de
      // réappliquer le masquage normal (relié aux modules toujours rangés dans la Valise).
      valiseSlots.forEach((slot, a) => slot.parent.insertBefore(a, slot.next));
      valiseSlots.clear();
      panel.style.display = 'none';
      applyValiseHidden(sidebar);
    }
    btn.textContent = on ? '✓ Fermer la Valise' : (getValise().length ? `🧳 La Valise (${getValise().length})` : '🧳 La Valise');
    btn.classList.toggle('sb-valise-open', on);
  }

  function injectValiseToggle(sidebar) {
    if (sidebar.querySelector('.sb-valise-toggle')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sb-valise-toggle';
    majBadgeValise(btn);
    // "Marron clair" demandé explicitement pour ce bouton — couleur dédiée, distincte du
    // doré Premium (#c8960c→#f2c94c) et du terracotta actif (#B84C1A) déjà utilisés dans ce
    // même menu, pour rester repérable parmi les autres variantes de boutons existantes.
    btn.style.cssText = 'display:block;width:calc(100% - 24px);margin:2px 12px 8px;padding:7px 10px;border-radius:8px;border:1px solid rgba(0,0,0,.12);background:#C9A27A;color:#3A2415;font-size:11.5px;font-weight:700;cursor:pointer;text-align:left;';
    btn.addEventListener('click', () => setValiseMode(sidebar, !valiseMode, btn));
    const reorderBtn = sidebar.querySelector('.sb-reorder-toggle');
    if (reorderBtn) reorderBtn.insertAdjacentElement('afterend', btn);
    else { const brand = sidebar.querySelector('.brand'); if (brand) brand.insertAdjacentElement('afterend', btn); else sidebar.insertBefore(btn, sidebar.firstChild); }

    const panel = document.createElement('div');
    panel.className = 'sb-valise-panel';
    panel.style.cssText = 'display:none;';
    btn.insertAdjacentElement('afterend', panel);

    // Délégation unique, posée une seule fois sur .sidebar (jamais recréé, contrairement aux
    // <a> qu'il contient — voir le commentaire détaillé sur poserBoutonsValise()) et en phase
    // de CAPTURE : elle doit s'exécuter AVANT tout écouteur "bubble" posé directement sur le
    // <a> lui-même (ex. l'intercepteur Premium qui ouvre l'upsell), sinon stopPropagation()
    // ici arrive trop tard pour l'empêcher.
    sidebar.addEventListener('click', (e) => {
      const archiveBtn = e.target.closest('.sb-valise-btn');
      if (archiveBtn) {
        e.preventDefault(); e.stopPropagation();
        const a = archiveBtn.closest('a[href]');
        if (!a) return;
        const key = stableKey(a);
        const valise = getValise();
        if (!valise.includes(key)) valise.push(key);
        a.style.display = 'none';
        a.dataset.valiseHiddenBy = '1';
        applyValiseHidden(sidebar);
        scheduleSaveValise(valise);
        majBadgeValise(btn);
        return;
      }
      const restoreBtn = e.target.closest('.sb-valise-restore');
      if (restoreBtn) {
        e.preventDefault(); e.stopPropagation();
        const a = restoreBtn.closest('a[href]');
        if (!a) return;
        const key = stableKey(a);
        scheduleSaveValise(getValise().filter(k => k !== key));
        const slot = valiseSlots.get(a);
        if (slot) { slot.parent.insertBefore(a, slot.next); valiseSlots.delete(a); }
        delete a.dataset.valiseHiddenBy;
        majBadgeValise(btn);
        renderValiseView(sidebar, panel);
      }
    }, true);
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
    if (on && valiseMode) { const vb = sidebar.querySelector('.sb-valise-toggle'); if (vb) setValiseMode(sidebar, false, vb); } // les deux modes d'édition ne se mélangent pas
    sidebar.classList.toggle('sb-reorder-mode', on);
    sidebar.querySelectorAll('.sb-drag-handle').forEach(h => h.style.display = on ? 'inline-flex' : 'none');
    sidebar.querySelectorAll('.sb-valise-btn').forEach(b => b.style.display = on ? 'inline-flex' : 'none');
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
      dragEl = null; dragGroup = null;
      scheduleSave(sidebar);
    };
    sidebar.addEventListener('pointerup', finirDrag);
    sidebar.addEventListener('pointercancel', finirDrag);
  }

  function init() {
    const sidebar = document.querySelector('aside.sidebar');
    if (!sidebar) return;
    // Réappliqué à chaque re-scan (pas seulement une fois) : d'autres scripts du dashboard
    // peuvent réinjecter/réordonner des liens après le premier passage (ex. révélation de
    // modules Premium) — la fonction est un no-op si l'ordre est déjà correct.
    if (!mode && utilisateurCourant()) applySavedOrder(sidebar);
    injectToggle(sidebar);
    injectValiseToggle(sidebar);
    poserPoignees(sidebar); // pose aussi les poignées des liens révélés après coup (Premium, association...)
    poserBoutonsValise(sidebar); // idem pour le bouton 🧳 de rangement
    if (utilisateurCourant()) applyValiseHidden(sidebar); // masque aussi les modules révélés après coup si déjà rangés
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  let tries = 0;
  const rescan = setInterval(() => {
    init();
    if (++tries > 20) clearInterval(rescan);
  }, 500);
})();
