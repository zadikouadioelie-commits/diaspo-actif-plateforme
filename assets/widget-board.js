/* ===========================================================
   DIASPO'ACTIF — Widget Board
   Moteur générique de mise en page personnalisable par widgets.
   Sans dépendance externe. Réutilisable sur toute la plateforme.

   Usage :
     const board = WidgetBoard.init(containerEl, {
       registry: { id: { title, icon, render(bodyEl), defaultSize, removable } },
       layout:   [ { id, size, hidden, collapsed } ],   // ordre = affichage
       editable: true|false,
       defaultLayout: [...],
       onSave(layout) {}
     });
   =========================================================== */
(function () {
  const SIZES = ['small', 'medium', 'large', 'xlarge', 'full'];
  const SIZE_LABEL = { small:'Petit', medium:'Moyen', large:'Large', xlarge:'Très large', full:'Pleine largeur' };
  const SIZE_ICON  = { small:'▫', medium:'◻', large:'▭', xlarge:'▬', full:'⬛' };

  function h(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }

  function WidgetBoard(container, opts) {
    this.container = container;
    this.registry = opts.registry || {};
    this.layout = (opts.layout || []).map(x => ({ ...x }));
    this.editable = !!opts.editable;
    this.defaultLayout = opts.defaultLayout || [];
    this.onSave = opts.onSave || function () {};
    this.editMode = false;
    this._saveTimer = null;
    this._dragId = null;

    // S'assurer que tous les widgets du registre absents du layout sont considérés "masqués/disponibles"
    this.grid = h('div', 'wb-grid');
    this.container.classList.add('wb-board');
    this.container.appendChild(this.grid);
    this.render();
  }

  WidgetBoard.prototype.setEditMode = function (on) {
    this.editMode = on && this.editable;
    this.container.classList.toggle('wb-editing', this.editMode);
    this.render();
  };

  WidgetBoard.prototype.toggleEditMode = function () { this.setEditMode(!this.editMode); };

  WidgetBoard.prototype._scheduleSave = function () {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.onSave(this.layout), 400);
  };

  WidgetBoard.prototype.render = function () {
    this.grid.innerHTML = '';
    this.layout.forEach(item => {
      if (item.hidden) return;
      const def = this.registry[item.id];
      if (!def) return; // widget inconnu (supprimé du registre) → ignoré
      const card = this._buildCard(item, def);
      this.grid.appendChild(card);          // attacher AVANT de rendre le corps
      this._renderBody(card, def, item);    // pour que getElementById fonctionne dans les loaders
    });
  };

  WidgetBoard.prototype._renderBody = function (card, def, item) {
    const body = card.querySelector('.wb-card-body');
    if (!body) return;
    try {
      const out = def.render(body, item);
      if (out instanceof Node) body.appendChild(out);
      else if (typeof out === 'string') body.innerHTML = out;
    } catch (e) {
      body.innerHTML = '<div style="padding:12px;color:#94a3b8;font-size:13px;">Contenu indisponible.</div>';
      console.error('[widget ' + item.id + ']', e);
    }
  };

  WidgetBoard.prototype._buildCard = function (item, def) {
    const card = h('div', 'wb-card wb-size-' + (item.size || def.defaultSize || 'medium'));
    card.dataset.wid = item.id;
    if (item.collapsed) card.classList.add('wb-collapsed');
    if (this.editMode) card.setAttribute('draggable', 'true');

    // En-tête
    const head = h('div', 'wb-card-head');
    head.innerHTML = `<span class="wb-card-title">${def.icon ? def.icon + ' ' : ''}${escapeHtml(def.title)}</span>`;
    const tools = h('div', 'wb-card-tools');

    if (this.editMode) {
      // Sélecteur de taille
      const sizeSel = h('div', 'wb-size-menu');
      sizeSel.innerHTML = `<button class="wb-tool wb-size-btn" title="Taille">${SIZE_ICON[item.size||def.defaultSize||'medium']}</button>
        <div class="wb-size-pop">${SIZES.map(s=>`<button data-size="${s}" class="${(item.size||def.defaultSize)===s?'active':''}">${SIZE_ICON[s]} ${SIZE_LABEL[s]}</button>`).join('')}</div>`;
      sizeSel.querySelectorAll('[data-size]').forEach(b => {
        b.onclick = (e) => { e.stopPropagation(); this._setSize(item.id, b.dataset.size); };
      });
      tools.appendChild(sizeSel);
      // Réduire / ouvrir
      const col = h('button', 'wb-tool', item.collapsed ? '▸' : '▾');
      col.setAttribute('data-role', 'collapse');
      col.title = item.collapsed ? 'Ouvrir' : 'Réduire';
      col.onclick = () => this._toggleCollapse(item.id);
      tools.appendChild(col);
      // Masquer
      const hide = h('button', 'wb-tool', '✕');
      hide.title = 'Masquer';
      hide.onclick = () => this._hide(item.id);
      tools.appendChild(hide);
      // Poignée
      const handle = h('span', 'wb-handle', '⠿');
      handle.title = 'Glisser pour déplacer';
      tools.appendChild(handle);
    }
    head.appendChild(tools);
    card.appendChild(head);

    // Corps (vide ici ; rempli par _renderBody après attachement au DOM)
    const body = h('div', 'wb-card-body');
    card.appendChild(body);

    if (this.editMode) this._wireDrag(card);
    return card;
  };

  /* ---- Actions (mises à jour DOM chirurgicales, sans re-render complet) ---- */
  WidgetBoard.prototype._setSize = function (id, size) {
    const it = this.layout.find(x => x.id === id);
    if (!it) return;
    it.size = size;
    const card = this.grid.querySelector(`[data-wid="${id}"]`);
    if (card) {
      card.className = card.className.replace(/wb-size-\w+/, 'wb-size-' + size);
      const pop = card.querySelector('.wb-size-pop');
      if (pop) pop.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('active', b.dataset.size === size));
      const sb = card.querySelector('.wb-size-btn');
      if (sb) sb.textContent = SIZE_ICON[size];
    }
    this._scheduleSave();
  };
  WidgetBoard.prototype._toggleCollapse = function (id) {
    const it = this.layout.find(x => x.id === id);
    if (!it) return;
    it.collapsed = !it.collapsed;
    const card = this.grid.querySelector(`[data-wid="${id}"]`);
    if (card) {
      card.classList.toggle('wb-collapsed', it.collapsed);
      const btn = card.querySelector('.wb-tool[data-role="collapse"]');
      if (btn) { btn.textContent = it.collapsed ? '▸' : '▾'; btn.title = it.collapsed ? 'Ouvrir' : 'Réduire'; }
    }
    this._scheduleSave();
  };
  WidgetBoard.prototype._hide = function (id) {
    const it = this.layout.find(x => x.id === id);
    if (!it) return;
    it.hidden = true;
    const card = this.grid.querySelector(`[data-wid="${id}"]`);
    if (card) card.remove();
    this._scheduleSave();
  };
  WidgetBoard.prototype.addWidget = function (id) {
    let it = this.layout.find(x => x.id === id);
    if (it) { it.hidden = false; }
    else {
      const def = this.registry[id];
      this.layout.push({ id, size: (def && def.defaultSize) || 'medium', hidden: false, collapsed: false });
    }
    this.render();
    this._scheduleSave();
  };
  WidgetBoard.prototype.reset = function () {
    this.layout = this.defaultLayout.map(x => ({ ...x }));
    this.render();
    this._scheduleSave();
  };

  /* Liste des widgets masqués ou absents (pour la bibliothèque "Ajouter") */
  WidgetBoard.prototype.availableToAdd = function () {
    const present = new Set(this.layout.filter(x => !x.hidden).map(x => x.id));
    return Object.keys(this.registry)
      .filter(id => !present.has(id))
      .map(id => ({ id, title: this.registry[id].title, icon: this.registry[id].icon }));
  };

  /* ---- Drag & drop (réordonnancement) ---- */
  WidgetBoard.prototype._wireDrag = function (card) {
    const self = this;
    card.addEventListener('dragstart', (e) => {
      self._dragId = card.dataset.wid;
      card.classList.add('wb-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', self._dragId); } catch (_) {}
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('wb-dragging');
      self.grid.querySelectorAll('.wb-drop-before,.wb-drop-after').forEach(c => c.classList.remove('wb-drop-before','wb-drop-after'));
      self._dragId = null;
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!self._dragId || card.dataset.wid === self._dragId) return;
      const r = card.getBoundingClientRect();
      const after = (e.clientX - r.left) > r.width / 2;
      card.classList.toggle('wb-drop-after', after);
      card.classList.toggle('wb-drop-before', !after);
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('wb-drop-before','wb-drop-after');
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const dragId = self._dragId;
      const targetId = card.dataset.wid;
      if (!dragId || dragId === targetId) return;
      const after = card.classList.contains('wb-drop-after');
      card.classList.remove('wb-drop-before','wb-drop-after');
      self._reorder(dragId, targetId, after);
    });
  };

  WidgetBoard.prototype._reorder = function (dragId, targetId, after) {
    const from = this.layout.findIndex(x => x.id === dragId);
    if (from < 0) return;
    const moved = this.layout.splice(from, 1)[0];
    let to = this.layout.findIndex(x => x.id === targetId);
    if (to < 0) { this.layout.push(moved); }
    else { this.layout.splice(after ? to + 1 : to, 0, moved); }
    // Déplacer le nœud DOM sans re-render (évite de relancer les loaders)
    const dragCard = this.grid.querySelector(`[data-wid="${dragId}"]`);
    const targetCard = this.grid.querySelector(`[data-wid="${targetId}"]`);
    if (dragCard && targetCard) this.grid.insertBefore(dragCard, after ? targetCard.nextSibling : targetCard);
    this._scheduleSave();
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ---- Bibliothèque "Ajouter un widget" (modale) ---- */
  WidgetBoard.prototype.openLibrary = function () {
    const items = this.availableToAdd();
    const overlay = h('div', 'wb-modal-overlay');
    overlay.innerHTML = `<div class="wb-modal">
      <div class="wb-modal-head"><span>➕ Ajouter un widget</span><button class="wb-modal-close">✕</button></div>
      <div class="wb-modal-body">
        ${items.length ? `<div class="wb-lib-grid">${items.map(it=>`<button class="wb-lib-item" data-add="${it.id}">${it.icon||'▫'}<span>${escapeHtml(it.title)}</span></button>`).join('')}</div>`
          : `<div style="padding:20px;text-align:center;color:#94a3b8;">Tous les widgets sont déjà affichés.</div>`}
      </div></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    const close = () => { overlay.classList.remove('show'); setTimeout(()=>overlay.remove(), 160); };
    overlay.querySelector('.wb-modal-close').onclick = close;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelectorAll('[data-add]').forEach(b => {
      b.onclick = () => { this.addWidget(b.dataset.add); close(); };
    });
  };

  /* ---- API publique ---- */
  window.WidgetBoard = {
    init(container, opts) { return new WidgetBoard(container, opts); },
    SIZES,
  };
})();
