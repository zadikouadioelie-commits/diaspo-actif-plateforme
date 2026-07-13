/* Rend les liens du menu latéral (.sidebar) déplaçables (drag & drop) et persiste
   l'ordre choisi par compte dans users.profil_json.sidebar_order[pathname]. */
(function () {
  function linkId(a) {
    return a.getAttribute('href') || a.getAttribute('data-section') || a.getAttribute('data-usection') || a.textContent.trim();
  }

  function injectStyle() {
    if (document.getElementById('sb-reorder-style')) return;
    const style = document.createElement('style');
    style.id = 'sb-reorder-style';
    style.textContent = `
      .sidebar a.sb-draggable{cursor:grab;position:relative;}
      .sidebar a.sb-draggable:active{cursor:grabbing;}
      .sidebar a.sb-dragging{opacity:.4;}
      .sidebar a.sb-drag-over{box-shadow:inset 0 2px 0 var(--orange,#f97316);}
    `;
    document.head.appendChild(style);
  }

  function applySidebarOrder(sidebar, order) {
    const links = Array.from(sidebar.querySelectorAll(':scope > a'));
    if (!links.length || !Array.isArray(order) || !order.length) return;
    const slots = links.map(a => a.nextSibling);
    const byId = {};
    links.forEach(a => { byId[linkId(a)] = a; });
    const seen = new Set();
    const wanted = [];
    order.forEach(id => { if (byId[id] && !seen.has(id)) { seen.add(id); wanted.push(byId[id]); } });
    const remaining = links.filter(a => !seen.has(linkId(a)));
    const finalSeq = wanted.concat(remaining);
    finalSeq.forEach((a, i) => { sidebar.insertBefore(a, slots[i]); });
  }

  function currentOrder(sidebar) {
    return Array.from(sidebar.querySelectorAll(':scope > a')).map(linkId);
  }

  let saveTimer = null;
  function scheduleSave(order) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const me = await api('GET', '/auth/me');
        const cur = (me && me.user && me.user.profil && me.user.profil.sidebar_order) || {};
        cur[location.pathname] = order;
        await api('PUT', '/profil', { profil: { sidebar_order: cur } });
      } catch (e) { /* silencieux : réorganisation reste appliquée localement */ }
    }, 700);
  }

  function makeDraggable(sidebar) {
    Array.from(sidebar.querySelectorAll(':scope > a')).forEach(a => {
      if (a.dataset.sbDragBound) return;
      a.dataset.sbDragBound = '1';
      a.classList.add('sb-draggable');
      a.setAttribute('draggable', 'true');
      a.addEventListener('dragstart', e => {
        a.classList.add('sb-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', linkId(a));
      });
      a.addEventListener('dragend', () => {
        a.classList.remove('sb-dragging');
        sidebar.querySelectorAll('.sb-drag-over').forEach(el => el.classList.remove('sb-drag-over'));
        scheduleSave(currentOrder(sidebar));
      });
      a.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        a.classList.add('sb-drag-over');
      });
      a.addEventListener('dragleave', () => a.classList.remove('sb-drag-over'));
      a.addEventListener('drop', e => {
        e.preventDefault();
        a.classList.remove('sb-drag-over');
        const dragging = sidebar.querySelector('.sb-dragging');
        if (!dragging || dragging === a) return;
        const rect = a.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        sidebar.insertBefore(dragging, before ? a : a.nextSibling);
      });
    });
  }

  async function init() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    injectStyle();
    try {
      const me = await api('GET', '/auth/me');
      const order = me && me.user && me.user.profil && me.user.profil.sidebar_order && me.user.profil.sidebar_order[location.pathname];
      if (order) applySidebarOrder(sidebar, order);
    } catch (e) { /* pas connecté ou erreur réseau : ordre par défaut */ }
    makeDraggable(sidebar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
