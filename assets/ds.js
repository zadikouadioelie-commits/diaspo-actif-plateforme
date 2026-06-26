/* ═══════════════════════════════════════════════════════════════════
   DIASPO'ACTIF — Design System JS v1.0
   Comportements interactifs : modals, toasts, tables, dropdowns…
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const DA = (() => {

  /* ─── UTILITAIRES ────────────────────────────────────────────── */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const uid = () => Math.random().toString(36).slice(2, 9);

  function fmtDate(iso) {
    if (!iso) return '–';
    try { return new Intl.DateTimeFormat('fr-FR', { day:'2-digit', month:'short', year:'numeric' }).format(new Date(iso)); }
    catch { return iso.slice(0, 10); }
  }
  function fmtDateTime(iso) {
    if (!iso) return '–';
    try { return new Intl.DateTimeFormat('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(iso)); }
    catch { return iso.slice(0, 16).replace('T', ' '); }
  }
  function relTime(iso) {
    if (!iso) return '–';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'À l\'instant';
    if (m < 60) return `Il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Il y a ${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `Il y a ${d}j`;
    return fmtDate(iso);
  }
  function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  /* ─── FOCUS TRAP (pour modals) ──────────────────────────────── */
  function trapFocus(el) {
    const focusable = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const items = $$(`${focusable}`, el).filter(e => e.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    el._trapHandler = e => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
    };
    el.addEventListener('keydown', el._trapHandler);
    items[0]?.focus();
  }
  function releaseFocus(el) { if (el._trapHandler) el.removeEventListener('keydown', el._trapHandler); }

  /* ─── MODAL ──────────────────────────────────────────────────── */
  let _prevFocus = null;
  const _openModals = [];

  function openModal(idOrEl) {
    const backdrop = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
    if (!backdrop) return;
    _prevFocus = document.activeElement;
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    _openModals.push(backdrop);
    const modal = $('.da-modal', backdrop) || backdrop;
    trapFocus(modal);
  }

  function closeModal(idOrEl) {
    const backdrop = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
    if (!backdrop) return;
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
    const idx = _openModals.indexOf(backdrop);
    if (idx > -1) _openModals.splice(idx, 1);
    if (!_openModals.length) document.body.style.overflow = '';
    const modal = $('.da-modal', backdrop) || backdrop;
    releaseFocus(modal);
    _prevFocus?.focus();
  }

  function closeAllModals() { [..._openModals].forEach(closeModal); }

  /* Confirm dialog */
  function confirm({ title = 'Confirmer', message = '', confirmLabel = 'Confirmer', cancelLabel = 'Annuler', type = 'warning', icon = '⚠️' } = {}) {
    return new Promise(resolve => {
      const id = 'da-confirm-' + uid();
      const div = document.createElement('div');
      div.className = 'da-modal-backdrop da-modal--confirm';
      div.id = id;
      div.setAttribute('role', 'dialog');
      div.setAttribute('aria-modal', 'true');
      div.innerHTML = `
        <div class="da-modal da-modal--sm">
          <div class="da-modal__body" style="text-align:center;padding:2rem;">
            <div class="da-modal__icon-large" aria-hidden="true">${icon}</div>
            <div class="da-modal__title-confirm">${esc(title)}</div>
            <div class="da-modal__desc">${esc(message)}</div>
          </div>
          <div class="da-modal__footer" style="justify-content:center;">
            <button class="da-btn da-btn--outline da-btn--sm" id="${id}-cancel">${esc(cancelLabel)}</button>
            <button class="da-btn da-btn--${type === 'danger' ? 'danger' : 'accent'} da-btn--sm" id="${id}-confirm">${esc(confirmLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(div);
      openModal(div);
      const cleanup = (result) => { closeModal(div); setTimeout(() => div.remove(), 300); resolve(result); };
      document.getElementById(`${id}-confirm`).onclick = () => cleanup(true);
      document.getElementById(`${id}-cancel`).onclick = () => cleanup(false);
      div.addEventListener('click', e => { if (e.target === div) cleanup(false); });
    });
  }

  /* ─── TOASTS ─────────────────────────────────────────────────── */
  let _toastContainer = null;
  function _ensureToastContainer() {
    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.className = 'da-toast-container';
      _toastContainer.setAttribute('role', 'region');
      _toastContainer.setAttribute('aria-live', 'polite');
      document.body.appendChild(_toastContainer);
    }
    return _toastContainer;
  }

  function toast(message, { type = 'info', duration = 4000, icon = '' } = {}) {
    const container = _ensureToastContainer();
    const icons = { success: '✅', danger: '❌', warning: '⚠️', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `da-toast da-toast--${type}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `<span aria-hidden="true">${icon || icons[type] || ''}</span><span>${esc(message)}</span><button class="da-toast__close" aria-label="Fermer">×</button>`;
    container.appendChild(el);
    const remove = () => { el.classList.add('removing'); setTimeout(() => el.remove(), 300); };
    el.querySelector('.da-toast__close').addEventListener('click', remove);
    if (duration > 0) setTimeout(remove, duration);
    return { remove };
  }

  const toastSuccess = (msg, opts) => toast(msg, { type: 'success', ...opts });
  const toastDanger  = (msg, opts) => toast(msg, { type: 'danger',  ...opts });
  const toastWarning = (msg, opts) => toast(msg, { type: 'warning', ...opts });
  const toastInfo    = (msg, opts) => toast(msg, { type: 'info',    ...opts });

  /* ─── DROPDOWN ───────────────────────────────────────────────── */
  const _openDropdowns = new Set();

  function initDropdowns() {
    $$('[data-da-dropdown]').forEach(trigger => {
      if (trigger._daDropdownInit) return;
      trigger._daDropdownInit = true;
      const targetId = trigger.dataset.daDdTarget || trigger.getAttribute('aria-controls');
      const menu = targetId ? document.getElementById(targetId) : trigger.nextElementSibling;
      if (!menu) return;

      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');

      trigger.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = menu.classList.contains('open');
        _closeAllDropdowns();
        if (!isOpen) {
          menu.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
          _openDropdowns.add({ trigger, menu });
        }
      });

      // Keyboard navigation
      menu.addEventListener('keydown', e => {
        const items = $$('.da-dropdown__item', menu);
        const idx = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(idx + 1, items.length - 1)]?.focus(); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); items[Math.max(idx - 1, 0)]?.focus(); }
        if (e.key === 'Escape')    { menu.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); }
      });
    });
  }

  function _closeAllDropdowns() {
    $$('.da-dropdown__menu.open').forEach(m => m.classList.remove('open'));
    $$('[data-da-dropdown][aria-expanded="true"]').forEach(t => t.setAttribute('aria-expanded', 'false'));
    _openDropdowns.clear();
  }

  document.addEventListener('click', _closeAllDropdowns);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeAllDropdowns(); });

  /* ─── TABS ───────────────────────────────────────────────────── */
  function initTabs(container) {
    const tabs = $$('.da-tab', container);
    const panels = $$('.da-tab-panel', container.closest('[data-da-tabs]') || container.parentElement);

    tabs.forEach(tab => {
      tab.setAttribute('role', 'tab');
      if (!tab.id) tab.id = 'da-tab-' + uid();
      tab.addEventListener('click', () => {
        tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        const target = tab.dataset.panel || tab.getAttribute('aria-controls');
        if (target) {
          const panel = document.getElementById(target) || container.parentElement.querySelector(`[data-panel-id="${target}"]`);
          panel?.classList.add('active');
        } else if (panels[tabs.indexOf(tab)]) {
          panels[tabs.indexOf(tab)].classList.add('active');
        }
      });
      // Keyboard
      tab.addEventListener('keydown', e => {
        let idx = tabs.indexOf(tab);
        if (e.key === 'ArrowRight') { e.preventDefault(); tabs[(idx + 1) % tabs.length]?.click(); tabs[(idx + 1) % tabs.length]?.focus(); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); tabs[(idx - 1 + tabs.length) % tabs.length]?.click(); tabs[(idx - 1 + tabs.length) % tabs.length]?.focus(); }
      });
    });
  }

  /* ─── TABLES DYNAMIQUES ──────────────────────────────────────── */
  function createTable({ containerId, columns, data = [], title = '', pageSize = 10, searchable = true, exportable = false, onRowClick = null }) {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return;

    let currentPage = 1;
    let sortCol = null, sortDir = 'asc';
    let searchTerm = '';

    function filtered() {
      let rows = [...data];
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        rows = rows.filter(row => columns.some(col => String(col.render ? col.render(row) : row[col.key] ?? '').toLowerCase().includes(q)));
      }
      if (sortCol !== null) {
        rows.sort((a, b) => {
          const col = columns[sortCol];
          let va = col.sortValue ? col.sortValue(a) : (col.render ? '' : a[col.key] ?? '');
          let vb = col.sortValue ? col.sortValue(b) : (col.render ? '' : b[col.key] ?? '');
          if (typeof va === 'string') va = va.toLowerCase();
          if (typeof vb === 'string') vb = vb.toLowerCase();
          return (va < vb ? -1 : va > vb ? 1 : 0) * (sortDir === 'asc' ? 1 : -1);
        });
      }
      return rows;
    }

    function paginated(rows) { return rows.slice((currentPage - 1) * pageSize, currentPage * pageSize); }

    function render() {
      const rows = filtered();
      const page = paginated(rows);
      const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

      const searchHtml = searchable ? `
        <div class="da-search" style="min-width:200px;">
          <span class="da-search__icon">🔍</span>
          <input class="da-input da-input--sm da-search__input" id="dt-search-${container.id}" placeholder="Rechercher…" value="${esc(searchTerm)}" aria-label="Rechercher dans le tableau">
        </div>` : '';

      const exportHtml = exportable ? `<button class="da-btn da-btn--outline da-btn--sm" id="dt-export-${container.id}">📥 Exporter</button>` : '';

      container.innerHTML = `
        <div class="da-table-wrapper">
          ${title || searchable || exportable ? `
          <div class="da-table-toolbar">
            <span class="da-table-toolbar__title">${esc(title)}</span>
            <div class="da-table-toolbar__actions">${searchHtml}${exportHtml}</div>
          </div>` : ''}
          <div style="overflow-x:auto;">
            <table class="da-table" role="grid">
              <thead>
                <tr>
                  ${columns.map((col, i) => `
                    <th data-col="${i}" scope="col"
                      class="${sortCol === i ? (sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc') : ''}"
                      aria-sort="${sortCol === i ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}">
                      ${esc(col.label)}
                    </th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${page.length ? page.map(row => `
                  <tr ${onRowClick ? 'class="da-table--clickable" style="cursor:pointer;"' : ''} data-row-id="${esc(row.id ?? '')}">
                    ${columns.map(col => `<td data-label="${esc(col.label)}">${col.render ? col.render(row) : esc(row[col.key] ?? '–')}</td>`).join('')}
                  </tr>`).join('') : `<tr><td colspan="${columns.length}" class="da-table-empty">Aucun résultat trouvé</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="da-table-footer">
            <span class="da-table-info">${rows.length ? `${(currentPage-1)*pageSize+1}–${Math.min(currentPage*pageSize, rows.length)} sur ${rows.length} résultats` : '0 résultat'}</span>
            <div class="da-pagination" role="navigation" aria-label="Pagination">
              <button class="da-page-btn" id="dt-prev-${container.id}" ${currentPage <= 1 ? 'disabled' : ''} aria-label="Page précédente">‹</button>
              ${Array.from({length: Math.min(totalPages, 7)}, (_, i) => {
                let p = i + 1;
                if (totalPages > 7) {
                  if (currentPage <= 4) p = i + 1;
                  else if (currentPage >= totalPages - 3) p = totalPages - 6 + i;
                  else p = currentPage - 3 + i;
                }
                p = Math.max(1, Math.min(p, totalPages));
                return `<button class="da-page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}" aria-label="Page ${p}" ${p === currentPage ? 'aria-current="page"' : ''}>${p}</button>`;
              }).join('')}
              <button class="da-page-btn" id="dt-next-${container.id}" ${currentPage >= totalPages ? 'disabled' : ''} aria-label="Page suivante">›</button>
            </div>
          </div>
        </div>`;

      // Tri
      $$('th[data-col]', container).forEach(th => {
        th.addEventListener('click', () => {
          const col = parseInt(th.dataset.col);
          if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
          else { sortCol = col; sortDir = 'asc'; }
          currentPage = 1;
          render();
        });
      });

      // Recherche
      if (searchable) {
        const inp = document.getElementById(`dt-search-${container.id}`);
        inp?.addEventListener('input', e => { searchTerm = e.target.value; currentPage = 1; render(); });
      }

      // Pagination
      $$('[data-page]', container).forEach(btn => {
        btn.addEventListener('click', () => { currentPage = parseInt(btn.dataset.page); render(); });
      });
      document.getElementById(`dt-prev-${container.id}`)?.addEventListener('click', () => { currentPage--; render(); });
      document.getElementById(`dt-next-${container.id}`)?.addEventListener('click', () => { currentPage++; render(); });

      // Row click
      if (onRowClick) {
        $$('tbody tr[data-row-id]', container).forEach((tr, i) => {
          tr.addEventListener('click', () => onRowClick(page[i], i));
          tr.setAttribute('tabindex', '0');
          tr.addEventListener('keydown', e => { if (e.key === 'Enter') onRowClick(page[i], i); });
        });
      }

      // Export CSV
      if (exportable) {
        document.getElementById(`dt-export-${container.id}`)?.addEventListener('click', () => {
          const allRows = filtered();
          const header = columns.map(c => `"${c.label}"`).join(',');
          const body = allRows.map(row => columns.map(col => {
            const val = col.exportValue ? col.exportValue(row) : (col.render ? '' : row[col.key] ?? '');
            return `"${String(val).replace(/"/g, '""')}"`;
          }).join(',')).join('\n');
          const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = slugify(title || 'export') + '.csv';
          a.click();
        });
      }
    }

    render();
    return {
      setData: d => { data = d; currentPage = 1; render(); },
      refresh: render,
      addRow: row => { data.push(row); render(); },
      removeRow: id => { data = data.filter(r => r.id !== id); render(); },
    };
  }

  /* ─── SIDEBAR MOBILE ─────────────────────────────────────────── */
  function initSidebar() {
    const sidebar = $('.da-sidebar');
    if (!sidebar) return;
    let overlay = $('.da-sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'da-sidebar-overlay';
      document.body.appendChild(overlay);
    }
    const hamburger = $('.da-navbar__hamburger');
    const openSidebar  = () => { sidebar.classList.add('open'); overlay.classList.add('visible'); hamburger?.setAttribute('aria-expanded', 'true'); };
    const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('visible'); hamburger?.setAttribute('aria-expanded', 'false'); };

    hamburger?.addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
    overlay.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar(); });

    // Fermer au clic d'un lien (mobile)
    $$('.da-sidebar__item', sidebar).forEach(item => {
      item.addEventListener('click', () => { if (window.innerWidth <= 768) closeSidebar(); });
    });

    // Active link
    const currentPath = location.pathname.split('/').pop() || 'index.html';
    $$('.da-sidebar__item', sidebar).forEach(item => {
      const href = item.getAttribute('href') || '';
      if (href && (href === currentPath || href.endsWith('/' + currentPath))) {
        item.classList.add('active');
        item.setAttribute('aria-current', 'page');
      }
    });
  }

  /* ─── FORMULAIRES ────────────────────────────────────────────── */
  function initForms() {
    // File drop zone
    $$('.da-file-drop').forEach(zone => {
      if (zone._daInit) return;
      zone._daInit = true;
      const input = $('input[type="file"]', zone);
      zone.addEventListener('click', () => input?.click());
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (input && e.dataTransfer.files.length) {
          const dt = new DataTransfer();
          [...e.dataTransfer.files].forEach(f => dt.items.add(f));
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      input?.addEventListener('change', () => {
        const fileText = zone.querySelector('.da-file-drop__text');
        if (fileText && input.files.length) {
          fileText.textContent = [...input.files].map(f => f.name).join(', ');
        }
      });
    });

    // Character counter
    $$('[data-maxlength]').forEach(input => {
      if (input._daCounter) return;
      input._daCounter = true;
      const max = parseInt(input.dataset.maxlength);
      const counter = document.createElement('div');
      counter.className = 'da-hint da-text-muted';
      counter.style.textAlign = 'right';
      const update = () => {
        const rem = max - input.value.length;
        counter.textContent = `${input.value.length}/${max}`;
        counter.style.color = rem < 20 ? 'var(--da-color-danger)' : '';
      };
      input.parentElement.appendChild(counter);
      input.addEventListener('input', update);
      update();
    });

    // Form validation
    $$('.da-form[data-validate]').forEach(form => {
      form.addEventListener('submit', e => {
        let valid = true;
        $$('[required]', form).forEach(field => {
          const err = field.parentElement.querySelector('.da-error-text');
          if (!field.value.trim()) {
            field.classList.add('da-input--error');
            if (err) err.style.display = 'flex';
            valid = false;
          } else {
            field.classList.remove('da-input--error');
            if (err) err.style.display = 'none';
          }
        });
        if (!valid) { e.preventDefault(); toastDanger('Veuillez remplir tous les champs obligatoires.'); }
      });
    });
  }

  /* ─── PROGRESS BARS ANIMÉES ──────────────────────────────────── */
  function initProgressBars() {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const bar = entry.target;
          const target = parseInt(bar.dataset.value || 0);
          bar.style.width = target + '%';
          observer.unobserve(bar);
        }
      });
    }, { threshold: 0.1 });
    $$('.da-progress__bar[data-value]').forEach(bar => {
      bar.style.width = '0%';
      observer.observe(bar);
    });
  }

  /* ─── SKELETON LOADERS ───────────────────────────────────────── */
  function skeleton(count = 3, type = 'card') {
    const templates = {
      card: `<div class="da-card"><div class="da-skeleton da-skeleton--title" style="margin-bottom:.5rem;"></div><div class="da-skeleton da-skeleton--text" style="width:80%;margin-bottom:.5rem;"></div><div class="da-skeleton da-skeleton--text" style="width:60%;"></div></div>`,
      list: `<div class="da-list__item"><div class="da-skeleton da-skeleton--avatar" style="flex-shrink:0;"></div><div style="flex:1;display:flex;flex-direction:column;gap:.35rem;"><div class="da-skeleton da-skeleton--text"></div><div class="da-skeleton da-skeleton--text" style="width:60%;"></div></div></div>`,
      user: `<div class="da-card da-card--user"><div class="da-skeleton da-skeleton--avatar da-avatar--lg" style="margin-bottom:.75rem;"></div><div class="da-skeleton da-skeleton--title" style="width:80%;margin-bottom:.35rem;"></div><div class="da-skeleton da-skeleton--text" style="width:60%;"></div></div>`,
    };
    return Array(count).fill(templates[type] || templates.card).join('');
  }

  /* ─── COPY TO CLIPBOARD ──────────────────────────────────────── */
  function initCopyButtons() {
    $$('[data-copy]').forEach(btn => {
      if (btn._daCopy) return;
      btn._daCopy = true;
      btn.addEventListener('click', async () => {
        const text = btn.dataset.copy || btn.textContent;
        try {
          await navigator.clipboard.writeText(text);
          const orig = btn.textContent;
          btn.textContent = '✅ Copié !';
          setTimeout(() => btn.textContent = orig, 2000);
          toastSuccess('Copié dans le presse-papier');
        } catch { toastDanger('Impossible de copier'); }
      });
    });
  }

  /* ─── MODAL AUTO-INIT ────────────────────────────────────────── */
  function initModals() {
    // Backdrop click = fermer
    $$('.da-modal-backdrop').forEach(backdrop => {
      if (backdrop._daInit) return;
      backdrop._daInit = true;
      backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(backdrop); });
    });

    // data-da-modal-open
    $$('[data-da-modal-open]').forEach(btn => {
      if (btn._daInit) return;
      btn._daInit = true;
      btn.addEventListener('click', () => openModal(btn.dataset.daModalOpen));
    });

    // data-da-modal-close
    $$('[data-da-modal-close]').forEach(btn => {
      if (btn._daInit) return;
      btn._daInit = true;
      btn.addEventListener('click', () => closeModal(btn.closest('.da-modal-backdrop') || btn.dataset.daModalClose));
    });

    // .da-modal__close buttons
    $$('.da-modal__close').forEach(btn => {
      if (btn._daInit) return;
      btn._daInit = true;
      btn.addEventListener('click', () => closeModal(btn.closest('.da-modal-backdrop')));
    });

    // Escape ferme le dernier modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _openModals.length) closeModal(_openModals[_openModals.length - 1]);
    });
  }

  /* ─── TABS AUTO-INIT ─────────────────────────────────────────── */
  function initAllTabs() {
    $$('[data-da-tabs]').forEach(initTabs);
    $$('.da-tabs:not([data-da-tabs])').forEach(initTabs);
  }

  /* ─── CONTEXT MENU ───────────────────────────────────────────── */
  function createContextMenu(items) {
    const menu = document.createElement('div');
    menu.className = 'da-context-menu';
    items.forEach(item => {
      if (item === 'divider') {
        const d = document.createElement('div');
        d.className = 'da-dropdown__divider';
        menu.appendChild(d);
      } else {
        const btn = document.createElement('button');
        btn.className = `da-dropdown__item${item.danger ? ' da-dropdown__item--danger' : ''}`;
        btn.innerHTML = `${item.icon ? `<span aria-hidden="true">${item.icon}</span>` : ''}<span>${esc(item.label)}</span>`;
        btn.addEventListener('click', () => { item.action?.(); hideContextMenu(); });
        menu.appendChild(btn);
      }
    });
    document.body.appendChild(menu);
    return menu;
  }

  let _activeContextMenu = null;
  function showContextMenu(e, items) {
    e.preventDefault();
    if (_activeContextMenu) { _activeContextMenu.classList.remove('open'); _activeContextMenu.remove(); }
    const menu = createContextMenu(items);
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - (items.length * 36 + 16));
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.add('open');
    _activeContextMenu = menu;
  }
  function hideContextMenu() { _activeContextMenu?.remove(); _activeContextMenu = null; }
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideContextMenu(); });

  /* ─── NOTIFICATIONS BADGE (navbar) ──────────────────────────── */
  async function updateNotifBadge(url = '/api/notifications?unread=1') {
    const badge = $('.da-navbar__notif-count');
    if (!badge) return;
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      const count = Array.isArray(data) ? data.length : (data.count || 0);
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    } catch {}
  }

  /* ─── BREADCRUMB BUILDER ─────────────────────────────────────── */
  function buildBreadcrumb(containerId, items) {
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el) return;
    el.className = 'da-breadcrumb';
    el.setAttribute('aria-label', 'Fil d\'ariane');
    el.innerHTML = items.map((item, i) => {
      const isLast = i === items.length - 1;
      return `
        <span class="da-breadcrumb__item">
          ${isLast ? `<span aria-current="page">${esc(item.label)}</span>` : `<a href="${esc(item.href || '#')}">${esc(item.label)}</a>`}
        </span>
        ${!isLast ? '<span class="da-breadcrumb__sep" aria-hidden="true">›</span>' : ''}`;
    }).join('');
  }

  /* ─── AVATAR PLACEHOLDER ──────────────────────────────────────  */
  function avatarHtml(name, size = 40, color = null) {
    const initials = String(name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const bg = color || '#' + [...initials].reduce((h, c) => h * 31 + c.charCodeAt(0), 0).toString(16).slice(-6).padStart(6, 'a');
    return `<div class="da-avatar-placeholder" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px;background:${bg};">${initials}</div>`;
  }

  /* ─── BADGE HTML ──────────────────────────────────────────────── */
  function badgeHtml(text, type = 'neutral') {
    return `<span class="da-badge da-badge--${type}">${esc(text)}</span>`;
  }
  function statusHtml(label, type = 'active') {
    return `<span class="da-status da-status--${type}">${esc(label)}</span>`;
  }

  /* ─── CARD BUILDERS ───────────────────────────────────────────── */
  function statCardHtml({ icon, value, label, trend, trendUp, color = '#eff6ff' }) {
    return `
      <div class="da-card da-card--stat">
        <div class="da-card__icon" style="background:${color}">${icon}</div>
        <div>
          <div class="da-card__value">${esc(value)}</div>
          <div class="da-card__label">${esc(label)}</div>
          ${trend ? `<div class="da-card__trend da-card__trend--${trendUp ? 'up' : 'down'}">${trendUp ? '↑' : '↓'} ${esc(trend)}</div>` : ''}
        </div>
      </div>`;
  }

  /* ─── INIT GLOBAL ────────────────────────────────────────────── */
  function init() {
    initModals();
    initAllTabs();
    initDropdowns();
    initSidebar();
    initForms();
    initProgressBars();
    initCopyButtons();

    // Ré-initialiser lors des mutations DOM (contenu chargé dynamiquement)
    const obs = new MutationObserver(() => {
      initModals();
      initDropdowns();
      initProgressBars();
      initCopyButtons();
      initForms();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ─── EXPORT PUBLIC API ──────────────────────────────────────── */
  return {
    // Modal
    openModal, closeModal, closeAllModals, confirm,
    // Toast
    toast, toastSuccess, toastDanger, toastWarning, toastInfo,
    // Dropdown
    initDropdowns,
    // Tabs
    initTabs,
    // Table
    createTable,
    // Context menu
    showContextMenu, hideContextMenu,
    // Sidebar
    initSidebar,
    // Helpers
    esc, fmtDate, fmtDateTime, relTime, uid, avatarHtml, badgeHtml, statusHtml, statCardHtml, skeleton,
    // Breadcrumb
    buildBreadcrumb,
    // Notifications
    updateNotifBadge,
    // Utils
    $, $$,
  };
})();

// Expose globalement
window.DA = DA;
