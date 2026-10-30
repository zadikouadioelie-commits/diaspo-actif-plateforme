/* ═════════════════════════════════════════════════
   assets/studio-engine.js — FORMATION DIASPORA : moteur du Studio de création (lot D, 2026-10-30)

   Glisser-déposer réel (bibliothèque → page), déplacement / redimensionnement / aimantation (mode libre), réordonnancement (mode structuré),
   panneau de propriétés contextuel, annuler / rétablir, copier / coller, verrouillage, zoom, pages et miniatures, deux modes dans le même studio,
   sauvegarde automatique (révisions + conflits + copie locale), historique, aperçu (ordinateur / tablette / smartphone) et publication contrôlée.
   Le serveur (server/formation-studio.js) reste la seule source de confiance : il nettoie et valide tout ce qui est envoyé d'ici.
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  const R = window.StudioRender;
  const Q = new URLSearchParams(location.search);
  const FID = Q.get('formation'), LID = Q.get('lecon');
  const API = `/api/formations/${encodeURIComponent(FID)}/lecons/${encodeURIComponent(LID)}/studio`;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const uid = p => p + Math.random().toString(36).slice(2, 10);
  const esc = R.esc;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const copie = o => JSON.parse(JSON.stringify(o));

  const TOOLS = [
    { cat: 'Texte', items: [
      { t: 'titre', n: 'Titre', i: '🔠', w: 800, h: 80, props: { html: '<p>Votre titre</p>' } },
      { t: 'soustitre', n: 'Sous-titre', i: '🔡', w: 700, h: 56, props: { html: '<p>Votre sous-titre</p>' } },
      { t: 'paragraphe', n: 'Paragraphe', i: '📝', w: 620, h: 150, props: { html: '<p>Écrivez votre texte ici…</p>' } },
      { t: 'citation', n: 'Citation', i: '❝', w: 620, h: 110, props: { html: '<p>Une citation…</p>' } },
      { t: 'encadre', n: 'Encadré', i: '💡', w: 620, h: 120, props: { html: '<p>Un point important à retenir…</p>' } } ] },
    { cat: 'Médias', items: [
      { t: 'image', n: 'Image', i: '🖼️', w: 400, h: 280, props: { url: '', alt: '', legende: '', ajust: 'contain', rayon: 0, align: 'center' } },
      { t: 'video', n: 'Vidéo', i: '🎬', w: 640, h: 360, props: { url: '', titre: '' } },
      { t: 'audio', n: 'Audio', i: '🎧', w: 480, h: 96, props: { url: '', titre: '' } } ] },
    { cat: 'Documents', items: [
      { t: 'fichier', n: 'Fichier / document', i: '📎', w: 440, h: 72, props: { nom: '', url: '', description: '' } } ] },
    { cat: 'Interactions', items: [
      { t: 'bouton', n: 'Bouton', i: '🔘', w: 240, h: 54, props: { libelle: 'Mon bouton', action: 'lien', url: '', page: '', couleur: '#e6b84a', couleur_texte: '#0b1226', rayon: 10 } },
      { t: 'lien', n: 'Lien externe', i: '🔗', w: 320, h: 40, props: { libelle: 'Mon lien', url: '' } },
      { t: 'tableau', n: 'Tableau', i: '▦', w: 620, h: 170, props: { lignes: [['Colonne 1', 'Colonne 2', 'Colonne 3'], ['', '', ''], ['', '', '']], entete: true } },
      { t: 'validation', n: 'Zone de validation', i: '✅', w: 480, h: 62, props: { libelle: "J'ai terminé cette activité", obligatoire: true } } ] },
    { cat: 'Mise en page', items: [
      { t: 'separateur', n: 'Séparateur', i: '➖', w: 800, h: 16, props: { style: 'trait', couleur: '', epaisseur: 2 } } ] },
  ];
  const outil = t => { for (const c of TOOLS) for (const o of c.items) if (o.t === t) return o; return null; };
  const NOMS = {}; TOOLS.forEach(c => c.items.forEach(o => { NOMS[o.t] = o.n; }));
  const POLICES = ['', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Garamond', 'Calibri', 'Segoe UI', 'Courier New'];

  const S = {
    doc: { mode: 'structure', pages: [] }, rev: 0, existe: false, pi: 0, sel: [], zoom: 1, autoFit: true,
    undo: [], redo: [], clip: [], dirty: false, saving: false, timer: null, editing: null, aimant: true, publiee: null, nonPubliees: false, lecon: {}, formation: {}, propSnap: null, pasteN: 0,
  };
  const zi = $('#st-zi'), zw = $('#st-zw'), stage = $('#st-stage'), libEl = $('#st-lib'), propsEl = $('#st-props'), thumbsEl = $('#st-thumbs'), barreEl = $('#st-barre');
  const pg = () => S.doc.pages[S.pi];
  const el = id => (pg().elements || []).find(e => e.id === id);
  const noeud = id => zi.querySelector(`.st-el[data-id="${CSS.escape(id)}"]`);
  const libre = () => S.doc.mode === 'libre';
  const pageW = () => (libre() ? R.PAGE_W : R.FLUX_W);

  /* ───────── utilitaires d'interface ───────── */
  let toastT;
  function toast(msg) { const t = $('#st-toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = 'none'; }, 2600); }
  const ouvrir = id => $('#' + id).classList.add('open');
  const fermer = id => $('#' + id).classList.remove('open');
  function boite(id, html, large) { const m = $('#' + id); m.innerHTML = `<div class="st-boite${large ? ' large' : ''}" role="dialog" aria-modal="true">${html}</div>`; m.classList.add('open'); return m; }
  async function api(method, url, corps) {
    const r = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || 'Erreur ' + r.status); e.status = r.status; e.data = d; throw e; }
    return d;
  }

  /* ───────── historique local (annuler / rétablir) ───────── */
  const snap = () => JSON.stringify({ mode: S.doc.mode, pages: S.doc.pages });
  function pousserUndo(avant) { S.undo.push(avant); if (S.undo.length > 80) S.undo.shift(); S.redo = []; majBarre(); }
  function modifier(fn, opts) {
    opts = opts || {};
    const avant = snap(); fn();
    if (snap() === avant) return false;
    pousserUndo(avant); modifie();
    if (!opts.sansRendu) renderTout();
    return true;
  }
  function appliquerSnap(s) {
    const d = JSON.parse(s); S.doc.mode = d.mode; S.doc.pages = d.pages;
    S.pi = clamp(S.pi, 0, S.doc.pages.length - 1);
    S.sel = S.sel.filter(id => !!el(id));
    modifie(); renderTout();
  }
  function annuler() { if (S.editing) finEdition(); if (!S.undo.length) return; S.redo.push(snap()); appliquerSnap(S.undo.pop()); }
  function retablir() { if (S.editing) finEdition(); if (!S.redo.length) return; S.undo.push(snap()); appliquerSnap(S.redo.pop()); }

  /* ───────── enregistrement automatique ───────── */
  function setEtat(txt, cls) { const e = $('#st-etat'); e.textContent = txt; e.className = 'st-etat ' + (cls || ''); }
  function majPub() {
    const b = $('#st-pub');
    if (S.publiee == null) { b.textContent = 'Brouillon'; b.className = 'st-pub'; }
    else { b.textContent = S.nonPubliees ? `En ligne (v${S.publiee}) · modifications non publiées` : `En ligne (v${S.publiee})`; b.className = 'st-pub live'; }
  }
  function sauvegardeLocale() { try { localStorage.setItem('studio:' + LID, JSON.stringify({ t: Date.now(), rev: S.rev, doc: { mode: S.doc.mode, pages: S.doc.pages } })); } catch (_) { /* stockage indisponible : sans conséquence */ } }
  function modifie() {
    S.dirty = true; if (S.publiee != null) S.nonPubliees = true; majPub();
    setEtat('Modifications non enregistrées…', 'att');
    clearTimeout(S.timer); S.timer = setTimeout(sauver, 1400);
    sauvegardeLocale();
  }
  let echecs = 0;
  async function sauver() {
    clearTimeout(S.timer);
    if (S.saving) { S.timer = setTimeout(sauver, 600); return true; }
    if (!S.dirty) return true;
    S.saving = true; const envoye = snap(); setEtat('Enregistrement…', 'att');
    try {
      const r = await api('PUT', API, { mode: S.doc.mode, pages: S.doc.pages, rev: S.rev });
      S.rev = r.rev; S.existe = true; echecs = 0;
      if (snap() === envoye) { S.dirty = false; setEtat('Enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), 'ok'); try { localStorage.removeItem('studio:' + LID); } catch (_) {} }
      else { S.timer = setTimeout(sauver, 300); }
      S.saving = false; return true;
    } catch (e) {
      S.saving = false;
      if (e.status === 409) { conflit(e.data && e.data.rev); return false; }
      if (e.status === 401 || e.status === 403) { setEtat('Session expirée ou accès refusé', 'err'); toast(e.message); return false; }
      if (e.status === 400) { setEtat('Contenu refusé : ' + e.message, 'err'); toast(e.message); return false; }
      echecs++; setEtat('Hors connexion — nouvel essai…', 'err'); S.timer = setTimeout(sauver, Math.min(30000, 3000 * echecs)); return false;
    }
  }
  function conflit() {
    boite('m-info', `<h2>Ce module a été modifié ailleurs</h2><p>Un autre onglet ou un autre appareil a enregistré une version plus récente. Vos modifications récentes sont encore ici.</p>
      <div class="st-btns"><button class="st-b or" id="cf-ecraser">Garder ma version (remplacer l'autre)</button><button class="st-b" id="cf-charger">Charger la version enregistrée</button></div>`);
    $('#cf-ecraser').onclick = async () => { try { const d = await api('GET', API); S.rev = d.rev; fermer('m-info'); S.dirty = true; sauver(); } catch (e) { toast(e.message); } };
    $('#cf-charger').onclick = async () => { try { const d = await api('GET', API); chargerDoc(d); S.undo = []; S.redo = []; S.dirty = false; fermer('m-info'); setEtat('Version enregistrée chargée', 'ok'); } catch (e) { toast(e.message); } };
  }

  /* ───────── bibliothèque d'outils ───────── */
  function renderOutils() {
    libEl.innerHTML = TOOLS.map(c => `<h3 class="st-h3">${esc(c.cat)}</h3><div class="st-tools">${c.items.map(o => `<button type="button" class="st-tool" draggable="true" data-tool="${o.t}" title="${esc(o.n)} — glissez-le sur la page, ou touchez-le pour l'ajouter"><span class="i">${o.i}</span><span class="n">${esc(o.n)}</span></button>`).join('')}</div>`).join('')
      + '<p class="st-aide">Glissez un outil sur la page. Sur tablette ou téléphone, touchez-le pour l\'ajouter à la page.</p>';
    $$('.st-tool', libEl).forEach(b => {
      b.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/x-studio-tool', b.dataset.tool); ev.dataTransfer.setData('text/plain', b.dataset.tool); ev.dataTransfer.effectAllowed = 'copy'; });
      b.addEventListener('click', () => { ajouterOutil(b.dataset.tool); libEl.classList.remove('open'); });
    });
  }

  /* ───────── pages et miniatures ───────── */
  function renderMiniatures() {
    const echelle = 124 / pageW();
    const barre = `<div class="st-th-b"><button class="st-b" data-pa="ajouter" title="Ajouter une page">＋</button><button class="st-b" data-pa="dupliquer" title="Dupliquer la page">⧉</button><button class="st-b dg" data-pa="supprimer" title="Supprimer la page">🗑</button></div>
      <div class="st-th-b"><button class="st-b" data-pa="haut" title="Monter la page">↑</button><button class="st-b" data-pa="bas" title="Descendre la page">↓</button></div>`;
    thumbsEl.innerHTML = barre + S.doc.pages.map((p, i) => `<div class="st-th${i === S.pi ? ' cur' : ''}" data-i="${i}" draggable="true" title="${esc(p.titre || 'Page ' + (i + 1))}"><span class="st-th-n">${i + 1}</span><div class="st-th-v" style="height:${Math.round((libre() ? R.PAGE_H : 520) * echelle)}px"><div style="transform:scale(${echelle});transform-origin:top left;width:${pageW()}px">${R.pageHtml(p, S.doc.mode, {})}</div></div></div>`).join('');
    $$('.st-th', thumbsEl).forEach(t => {
      t.addEventListener('click', () => allerPage(Number(t.dataset.i)));
      t.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/x-studio-page', t.dataset.i); ev.dataTransfer.effectAllowed = 'move'; });
      t.addEventListener('dragover', ev => { if (ev.dataTransfer.types.includes('text/x-studio-page')) { ev.preventDefault(); t.classList.add('over'); } });
      t.addEventListener('dragleave', () => t.classList.remove('over'));
      t.addEventListener('drop', ev => { ev.preventDefault(); t.classList.remove('over'); const de = Number(ev.dataTransfer.getData('text/x-studio-page')), vers = Number(t.dataset.i); if (Number.isFinite(de) && de !== vers) deplacerPage(de, vers); });
    });
    $$('[data-pa]', thumbsEl).forEach(b => b.addEventListener('click', () => actionPage(b.dataset.pa)));
  }
  function allerPage(i) { if (S.editing) finEdition(); S.pi = clamp(i, 0, S.doc.pages.length - 1); S.sel = []; renderTout(); }
  const nouvellePage = () => ({ id: uid('p_'), titre: '', fond: '', elements: [] });
  function actionPage(a) {
    if (S.editing) finEdition();
    if (a === 'ajouter') { modifier(() => { S.doc.pages.splice(S.pi + 1, 0, nouvellePage()); }); allerPage(S.pi + 1); }
    else if (a === 'dupliquer') { modifier(() => { const c = copie(pg()); c.id = uid('p_'); c.elements.forEach(e => { e.id = uid('e_'); }); S.doc.pages.splice(S.pi + 1, 0, c); }); allerPage(S.pi + 1); }
    else if (a === 'supprimer') {
      if (S.doc.pages.length < 2) { toast('Un module doit garder au moins une page.'); return; }
      if (!confirm('Supprimer cette page et son contenu ? (Vous pourrez annuler avec Ctrl+Z.)')) return;
      modifier(() => { S.doc.pages.splice(S.pi, 1); }); allerPage(Math.min(S.pi, S.doc.pages.length - 1));
    }
    else if (a === 'haut') deplacerPage(S.pi, S.pi - 1);
    else if (a === 'bas') deplacerPage(S.pi, S.pi + 1);
  }
  function deplacerPage(de, vers) {
    if (vers < 0 || vers >= S.doc.pages.length || de === vers) return;
    const id = S.doc.pages[S.pi].id;
    modifier(() => { const [p] = S.doc.pages.splice(de, 1); S.doc.pages.splice(vers, 0, p); });
    S.pi = S.doc.pages.findIndex(p => p.id === id); renderTout();
  }

  /* ───────── zone de création ───────── */
  function renderScene() {
    zi.innerHTML = R.pageHtml(pg(), S.doc.mode, { edit: true });
    const page = zi.firstElementChild; page.classList.add('st-edit');
    zi.style.width = pageW() + 'px';
    appliquerZoom(); decorer();
  }
  function appliquerZoom() {
    zi.style.transform = `scale(${S.zoom})`;
    const h = zi.firstElementChild ? zi.firstElementChild.offsetHeight : R.PAGE_H;
    zw.style.width = Math.round(pageW() * S.zoom) + 'px'; zw.style.height = Math.round(h * S.zoom) + 'px';
    $('#st-zoom').textContent = Math.round(S.zoom * 100) + ' %';
  }
  function ajuster() { S.autoFit = true; S.zoom = clamp((stage.clientWidth - 44) / pageW(), 0.2, 1); appliquerZoom(); }
  function zoomer(f) { S.autoFit = false; S.zoom = clamp(S.zoom * f, 0.2, 3); appliquerZoom(); }
  function decorer() {
    $$('.st-el.sel', zi).forEach(n => n.classList.remove('sel'));
    $$('.st-h,.st-grip', zi).forEach(n => n.remove());
    S.sel.forEach(id => {
      const n = noeud(id); if (!n) return; n.classList.add('sel');
      const e = el(id);
      if (S.sel.length === 1 && !e.locked) {
        if (libre()) ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(h => { const d = document.createElement('div'); d.className = 'st-h'; d.dataset.h = h; n.appendChild(d); });
        else { const g = document.createElement('div'); g.className = 'st-grip'; g.title = 'Glissez pour déplacer'; g.textContent = '⠿'; n.appendChild(g); }
      }
    });
  }
  function choisir(ids) { S.sel = ids.filter(Boolean); decorer(); renderProps(); majBarre(); }
  function remplacerNoeud(e) {
    const n = noeud(e.id); if (!n) return;
    const tmp = document.createElement('div'); tmp.innerHTML = R.elHtml(e, S.doc.mode, { edit: true });
    n.replaceWith(tmp.firstElementChild); decorer(); appliquerZoom();
  }

  /* ajout d'un outil (glisser-déposer ou toucher) */
  function ajouterOutil(type, pos) {
    const T = outil(type); if (!T) return;
    if (S.editing) finEdition();
    const e = { id: uid('e_'), type, x: 0, y: 0, w: T.w, h: T.h, z: 1, locked: false, props: copie(T.props) };
    if (R.TEXTE.includes(type)) Object.assign(e.props, { police: '', taille: 0, couleur: '', fond: '', align: 'left', interligne: 0, gras: false });
    modifier(() => {
      const els = pg().elements;
      if (libre()) {
        const n = els.length;
        e.x = Math.round(pos && pos.x != null ? pos.x - T.w / 2 : (R.PAGE_W - T.w) / 2 + (n % 6) * 24);
        e.y = Math.round(pos && pos.y != null ? pos.y - Math.min(T.h, 60) / 2 : 60 + (n % 8) * 40);
        e.x = clamp(e.x, 0, R.PAGE_W - 40); e.y = clamp(e.y, 0, 5000);
        e.z = els.reduce((m, x) => Math.max(m, x.z || 1), 0) + 1;
        els.push(e);
      } else {
        let i = pos && pos.index != null ? pos.index : (S.sel.length ? els.findIndex(x => x.id === S.sel[S.sel.length - 1]) + 1 : els.length);
        if (i <= 0 && !(pos && pos.index === 0)) i = els.length;
        els.splice(i, 0, e);
      }
    });
    choisir([e.id]);
    if (R.TEXTE.includes(type)) setTimeout(() => debutEdition(e.id, true), 30);
  }
  stage.addEventListener('dragover', ev => {
    if (!ev.dataTransfer.types.includes('text/x-studio-tool')) return;
    ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy';
    if (!libre()) indicateur(indexDepuisY(ev.clientY));
  });
  stage.addEventListener('dragleave', ev => { if (!stage.contains(ev.relatedTarget)) effacerRepères(); });
  stage.addEventListener('drop', ev => {
    const t = ev.dataTransfer.getData('text/x-studio-tool'); if (!t) return;
    ev.preventDefault(); effacerRepères();
    if (libre()) { const r = zi.firstElementChild.getBoundingClientRect(); ajouterOutil(t, { x: (ev.clientX - r.left) / S.zoom, y: (ev.clientY - r.top) / S.zoom }); }
    else ajouterOutil(t, { index: indexDepuisY(ev.clientY) });
  });
  function indexDepuisY(y) {
    const ns = $$('.st-el', zi); let i = ns.length;
    for (let k = 0; k < ns.length; k++) { const r = ns[k].getBoundingClientRect(); if (y < r.top + r.height / 2) { i = k; break; } }
    return i;
  }
  function indicateur(i) {
    effacerRepères(); const page = zi.firstElementChild, ns = $$('.st-el', zi), pr = page.getBoundingClientRect();
    const d = document.createElement('div'); d.className = 'st-drop';
    let y; if (!ns.length) y = 10; else if (i >= ns.length) y = (ns[ns.length - 1].getBoundingClientRect().bottom - pr.top) / S.zoom + 6; else y = (ns[i].getBoundingClientRect().top - pr.top) / S.zoom - 7;
    d.style.top = Math.max(0, y) + 'px'; page.appendChild(d);
  }
  function effacerRepères() { $$('.st-drop,.st-guide', zi).forEach(n => n.remove()); }

  /* sélection, déplacement, redimensionnement, réordonnancement */
  zi.addEventListener('pointerdown', ev => {
    if (ev.button > 0) return;
    if (S.editing) { if (ev.target.closest('.st-txt[contenteditable="true"]')) return; finEdition(); }
    const h = ev.target.closest('.st-h'); if (h) return debutRedim(ev, h.dataset.h);
    const g = ev.target.closest('.st-grip'); if (g) return debutReordre(ev);
    const n = ev.target.closest('.st-el');
    if (!n) { if (!ev.shiftKey) choisir([]); return; }
    const id = n.dataset.id;
    if (ev.shiftKey) choisir(S.sel.includes(id) ? S.sel.filter(x => x !== id) : [...S.sel, id]);
    else if (!S.sel.includes(id)) choisir([id]);
    if (libre()) debutDeplacement(ev);
  });
  zi.addEventListener('dblclick', ev => {
    const n = ev.target.closest('.st-el'); if (!n) return;
    const e = el(n.dataset.id); if (!e || e.locked) return;
    if (R.TEXTE.includes(e.type)) debutEdition(e.id);
    else if (e.type === 'image') choisirImage(e.id);
  });
  zi.addEventListener('click', ev => { if (ev.target.closest('a,button.st-btn')) ev.preventDefault(); });

  function candidats(exclus) {
    const W = R.PAGE_W, H = R.hauteurPage(pg(), 'libre'), xs = [0, W / 2, W], ys = [0, H / 2, H];
    pg().elements.forEach(e => { if (exclus.includes(e.id)) return; xs.push(e.x, e.x + e.w / 2, e.x + e.w); ys.push(e.y, e.y + e.h / 2, e.y + e.h); });
    return { xs, ys };
  }
  function aimanter(vals, cands, seuil) {
    let meilleur = null;
    vals.forEach(v => cands.forEach(c => { const d = c - v; if (Math.abs(d) <= seuil && (!meilleur || Math.abs(d) < Math.abs(meilleur.d))) meilleur = { d, c }; }));
    return meilleur;
  }
  function tracerRepères(x, y) {
    $$('.st-guide', zi).forEach(n => n.remove()); const page = zi.firstElementChild;
    if (x != null) { const g = document.createElement('div'); g.className = 'st-guide v'; g.style.left = x + 'px'; page.appendChild(g); }
    if (y != null) { const g = document.createElement('div'); g.className = 'st-guide h'; g.style.top = y + 'px'; page.appendChild(g); }
  }
  function ecouter(mv, up) {
    const fin = ev => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin); up(ev); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', fin);
  }
  function debutDeplacement(ev) {
    const ids = S.sel.filter(id => !el(id).locked); if (!ids.length) return;
    ev.preventDefault();
    const dep = { x: ev.clientX, y: ev.clientY }, avant = snap(), orig = ids.map(id => ({ id, x: el(id).x, y: el(id).y }));
    const bb = { x: Math.min(...ids.map(i => el(i).x)), y: Math.min(...ids.map(i => el(i).y)), x2: Math.max(...ids.map(i => el(i).x + el(i).w)), y2: Math.max(...ids.map(i => el(i).y + el(i).h)) };
    const cand = candidats(ids); let bouge = false;
    ecouter(e2 => {
      let dx = (e2.clientX - dep.x) / S.zoom, dy = (e2.clientY - dep.y) / S.zoom;
      if (!bouge && Math.hypot(dx, dy) * S.zoom < 3) return; bouge = true;
      let gx = null, gy = null;
      if (S.aimant && !e2.altKey) {
        const T = 6 / S.zoom, nx = bb.x + dx, nx2 = bb.x2 + dx, ny = bb.y + dy, ny2 = bb.y2 + dy;
        const sx = aimanter([nx, (nx + nx2) / 2, nx2], cand.xs, T), sy = aimanter([ny, (ny + ny2) / 2, ny2], cand.ys, T);
        if (sx) { dx += sx.d; gx = sx.c; } if (sy) { dy += sy.d; gy = sy.c; }
      }
      orig.forEach(o => { const e = el(o.id); e.x = Math.round(o.x + dx); e.y = Math.round(o.y + dy); const n = noeud(o.id); n.style.left = e.x + 'px'; n.style.top = e.y + 'px'; });
      tracerRepères(gx, gy);
    }, () => { effacerRepères(); if (bouge && snap() !== avant) { pousserUndo(avant); modifie(); renderProps(); renderMiniaturesSoon(); fitPage(); } });
  }
  function debutRedim(ev, dir) {
    const e = el(S.sel[0]); if (!e || e.locked) return; ev.preventDefault(); ev.stopPropagation();
    const dep = { x: ev.clientX, y: ev.clientY }, o = { x: e.x, y: e.y, w: e.w, h: e.h }, avant = snap(), ratio = o.w / o.h, n = noeud(e.id);
    const cand = candidats([e.id]); let bouge = false;
    ecouter(e2 => {
      const dx = (e2.clientX - dep.x) / S.zoom, dy = (e2.clientY - dep.y) / S.zoom; bouge = true;
      let x = o.x, y = o.y, w = o.w, h = o.h;
      if (dir.includes('e')) w = o.w + dx; if (dir.includes('s')) h = o.h + dy;
      if (dir.includes('w')) { w = o.w - dx; x = o.x + dx; } if (dir.includes('n')) { h = o.h - dy; y = o.y + dy; }
      if ((e2.shiftKey || ['image', 'video'].includes(e.type)) && dir.length === 2) { h = w / ratio; if (dir.includes('n')) y = o.y + o.h - h; }
      if (S.aimant && !e2.altKey) { const T = 6 / S.zoom; if (dir.includes('e')) { const s = aimanter([x + w], cand.xs, T); if (s) w += s.d; } if (dir.includes('s')) { const s = aimanter([y + h], cand.ys, T); if (s) h += s.d; } }
      w = Math.max(30, w); h = Math.max(16, h);
      if (dir.includes('w') && w === 30) x = o.x + o.w - 30; if (dir.includes('n') && h === 16) y = o.y + o.h - 16;
      Object.assign(e, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
      Object.assign(n.style, { left: e.x + 'px', top: e.y + 'px', width: e.w + 'px', height: e.h + 'px' });
    }, () => { if (bouge && snap() !== avant) { pousserUndo(avant); modifie(); renderProps(); renderMiniaturesSoon(); fitPage(); } });
  }
  function debutReordre(ev) {
    const id = S.sel[0], e = el(id); if (!e) return; ev.preventDefault(); ev.stopPropagation();
    const avant = snap(); let cible = null;
    ecouter(e2 => {
      const ns = $$('.st-el', zi).filter(n => n.dataset.id !== id); let i = ns.length;
      for (let k = 0; k < ns.length; k++) { const r = ns[k].getBoundingClientRect(); if (e2.clientY < r.top + r.height / 2) { i = k; break; } }
      cible = i;
      effacerRepères(); const page = zi.firstElementChild, pr = page.getBoundingClientRect(), d = document.createElement('div'); d.className = 'st-drop';
      const y = !ns.length ? 10 : i >= ns.length ? (ns[ns.length - 1].getBoundingClientRect().bottom - pr.top) / S.zoom + 6 : (ns[i].getBoundingClientRect().top - pr.top) / S.zoom - 7;
      d.style.top = Math.max(0, y) + 'px'; page.appendChild(d);
    }, () => {
      effacerRepères(); if (cible == null) return;
      const els = pg().elements, de = els.findIndex(x => x.id === id), [m] = els.splice(de, 1); els.splice(cible, 0, m);
      if (snap() !== avant) { pousserUndo(avant); modifie(); renderTout(); choisir([id]); } else { renderScene(); }
    });
  }

  /* édition du texte directement dans la page */
  function debutEdition(id, tout) {
    const e = el(id), n = noeud(id); if (!e || !n || e.locked) return;
    const t = $('.st-txt', n); if (!t) return;
    if (S.editing) finEdition();
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, true); } catch (_) {}
    t.contentEditable = 'true'; t.classList.remove('st-vide'); t.focus();
    const r = document.createRange(); r.selectNodeContents(t); if (!tout) r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    S.editing = { id, avant: snap(), t };
    t.addEventListener('input', surSaisie); t.addEventListener('paste', surColler);
    t.addEventListener('blur', () => { if (S.editing && S.editing.t === t) finEdition(); }, { once: true });
  }
  function surSaisie() { if (!S.editing) return; const e = el(S.editing.id); e.props.html = S.editing.t.innerHTML; if (libre() && S.editing.t.scrollHeight > e.h) { e.h = S.editing.t.scrollHeight; noeud(e.id).style.height = e.h + 'px'; } modifie(); fitPage(); }
  function surColler(ev) { ev.preventDefault(); const txt = (ev.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, txt); }
  function finEdition() {
    if (!S.editing) return; const { id, avant, t } = S.editing; S.editing = null;
    t.removeEventListener('input', surSaisie); t.removeEventListener('paste', surColler); t.contentEditable = 'false';
    const e = el(id); if (!e) return;
    e.props.html = t.innerHTML; if (libre() && t.scrollHeight > e.h) e.h = t.scrollHeight;
    if (snap() !== avant) pousserUndo(avant);
    remplacerNoeud(e); renderMiniaturesSoon(); renderProps();
  }
  function fitPage() { appliquerZoom(); }
  let tMin; function renderMiniaturesSoon() { clearTimeout(tMin); tMin = setTimeout(renderMiniatures, 250); }

  /* ───────── actions sur les éléments ───────── */
  const selection = () => S.sel.map(el).filter(Boolean);
  function supprimer() {
    const ids = selection().filter(e => !e.locked).map(e => e.id);
    if (!ids.length) { if (S.sel.length) toast('Déverrouillez l\'élément pour le supprimer.'); return; }
    modifier(() => { pg().elements = pg().elements.filter(e => !ids.includes(e.id)); }); choisir([]);
  }
  function dupliquer() {
    const src = selection(); if (!src.length) return; const nouveaux = [];
    modifier(() => { src.forEach(e => { const c = copie(e); c.id = uid('e_'); c.locked = false; if (libre()) { c.x += 24; c.y += 24; c.z = (c.z || 1) + 1; } const i = pg().elements.findIndex(x => x.id === e.id); pg().elements.splice(libre() ? pg().elements.length : i + 1, 0, c); nouveaux.push(c.id); }); });
    choisir(nouveaux);
  }
  function copier() { S.clip = selection().map(copie); S.pasteN = 0; if (S.clip.length) toast(S.clip.length > 1 ? S.clip.length + ' éléments copiés' : 'Élément copié'); majBarre(); }
  function coller() {
    if (!S.clip.length) return; S.pasteN++; const nouveaux = [];
    modifier(() => { S.clip.forEach(e => { const c = copie(e); c.id = uid('e_'); c.locked = false; if (libre()) { c.x += 24 * S.pasteN; c.y += 24 * S.pasteN; } pg().elements.push(c); nouveaux.push(c.id); }); });
    choisir(nouveaux);
  }
  function verrouiller() { const s = selection(); if (!s.length) return; const v = !s.every(e => e.locked); modifier(() => { s.forEach(e => { e.locked = v; }); }); toast(v ? 'Élément verrouillé' : 'Élément déverrouillé'); choisir(S.sel); }
  function ordre(dir) {
    const e = selection()[0]; if (!e) return;
    modifier(() => {
      const els = pg().elements;
      if (libre()) { const zs = els.map(x => x.z || 1); if (dir === 'premier') e.z = Math.max(...zs) + 1; else if (dir === 'dernier') e.z = Math.max(0, Math.min(...zs) - 1); else e.z = clamp((e.z || 1) + (dir === 'avancer' ? 1 : -1), 0, 999); }
      else { const i = els.findIndex(x => x.id === e.id), j = dir === 'monter' ? i - 1 : i + 1; if (j >= 0 && j < els.length) { els.splice(j, 0, els.splice(i, 1)[0]); } }
    }); choisir(S.sel);
  }
  function aligner(sens) {
    const s = selection().filter(e => !e.locked); if (!s.length || !libre()) return;
    const W = R.PAGE_W, H = R.hauteurPage(pg(), 'libre');
    const bb = s.length > 1 ? { x: Math.min(...s.map(e => e.x)), y: Math.min(...s.map(e => e.y)), x2: Math.max(...s.map(e => e.x + e.w)), y2: Math.max(...s.map(e => e.y + e.h)) } : { x: 0, y: 0, x2: W, y2: H };
    modifier(() => { s.forEach(e => {
      if (sens === 'g') e.x = bb.x; else if (sens === 'c') e.x = Math.round((bb.x + bb.x2) / 2 - e.w / 2); else if (sens === 'd') e.x = bb.x2 - e.w;
      else if (sens === 'h') e.y = bb.y; else if (sens === 'm') e.y = Math.round((bb.y + bb.y2) / 2 - e.h / 2); else if (sens === 'b') e.y = bb.y2 - e.h;
    }); }); choisir(S.sel);
  }

  /* ───────── barre d'outils de la zone centrale ───────── */
  function majBarre() {
    const aSel = S.sel.length > 0, edit = !!S.editing;
    $('#st-annuler').disabled = !S.undo.length; $('#st-retablir').disabled = !S.redo.length;
    ['st-copier', 'st-dupliquer', 'st-suppr', 'st-verrou'].forEach(i => { $('#' + i).disabled = !aSel; });
    $('#st-coller').disabled = !S.clip.length;
    $$('.st-al').forEach(b => { b.style.display = libre() ? '' : 'none'; b.disabled = !aSel; });
    $('#st-aimant').style.display = libre() ? '' : 'none'; $('#st-aimant').classList.toggle('on', S.aimant);
    $$('#st-modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === S.doc.mode));
    void edit;
  }

  /* ───────── panneau des propriétés (contextuel) ───────── */
  const champ = (lib, p, v, type, extra) => `<label class="st-f"><span>${lib}</span><input type="${type || 'text'}" data-p="${p}" data-k="${type === 'number' ? 'num' : 'str'}" value="${esc(v == null ? '' : v)}" ${extra || ''}></label>`;
  const select = (lib, p, v, options) => `<label class="st-f"><span>${lib}</span><select data-p="${p}" data-k="str">${options.map(o => `<option value="${esc(o[0])}" ${String(v) === String(o[0]) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
  const couleurChamp = (lib, p, v, defaut) => `<label class="st-f"><span>${lib}</span><div class="st-row"><input type="color" data-p="${p}" data-k="str" value="${esc(v || defaut || '#000000')}"><button type="button" class="st-b" data-raz="${p}">Aucune</button></div></label>`;
  function renderProps() {
    const s = selection();
    let h;
    if (!s.length) h = propsPage();
    else if (s.length > 1) h = `<h3 class="st-pt">${s.length} éléments sélectionnés</h3><p class="st-ps">Déplacez-les ensemble, alignez-les ou supprimez-les.</p>${libre() ? alignerHtml('Aligner sur la sélection') : ''}${actionsComm(s)}`;
    else h = propsElement(s[0]);
    propsEl.innerHTML = h;
  }
  const alignerHtml = t => `<span class="st-h3" style="display:block">${t}</span><div class="st-btns"><button class="st-b" data-al="g" title="Aligner à gauche">⇤ Gauche</button><button class="st-b" data-al="c" title="Centrer horizontalement">⇔ Centre</button><button class="st-b" data-al="d" title="Aligner à droite">⇥ Droite</button><button class="st-b" data-al="h" title="Aligner en haut">⤒ Haut</button><button class="st-b" data-al="m" title="Centrer verticalement">⇕ Milieu</button><button class="st-b" data-al="b" title="Aligner en bas">⤓ Bas</button></div>`;
  function propsPage() {
    const p = pg();
    return `<h3 class="st-pt">Page ${S.pi + 1} sur ${S.doc.pages.length}</h3><p class="st-ps">${libre() ? 'Mode page libre : posez les éléments où vous voulez.' : 'Mode pages structurées : les éléments s\'empilent dans l\'ordre.'}</p>
      <label class="st-f"><span>Titre de la page (facultatif)</span><input type="text" data-scope="page" data-p="titre" data-k="str" maxlength="120" value="${esc(p.titre)}"></label>
      <label class="st-f"><span>Couleur de fond de la page</span><div class="st-row"><input type="color" data-scope="page" data-p="fond" data-k="str" value="${esc(p.fond || '#ffffff')}"><button type="button" class="st-b" data-raz="fond" data-scope="page">Blanc</button></div></label>
      <div class="st-btns"><button class="st-b" data-pa="ajouter">＋ Page</button><button class="st-b" data-pa="dupliquer">⧉ Dupliquer</button><button class="st-b dg" data-pa="supprimer">🗑 Supprimer</button></div>
      <p class="st-aide">Cliquez sur un élément pour modifier ses propriétés. Double-cliquez sur un texte pour l'écrire directement dans la page.</p>
      <p class="st-aide"><b>Raccourcis</b> : Ctrl+Z annuler · Ctrl+Y rétablir · Ctrl+C / V copier-coller · Ctrl+D dupliquer · Suppr supprimer · flèches déplacer · Alt = sans aimantation.</p>`;
  }
  function actionsComm(s) {
    const e = s[0], un = s.length === 1, verr = s.every(x => x.locked);
    const ord = libre() ? `<span class="st-h3" style="display:block">Ordre d'affichage</span><div class="st-btns"><button class="st-b" data-ord="premier">Premier plan</button><button class="st-b" data-ord="avancer">Avancer</button><button class="st-b" data-ord="reculer">Reculer</button><button class="st-b" data-ord="dernier">Arrière-plan</button></div>`
      : (un ? `<span class="st-h3" style="display:block">Position dans la page</span><div class="st-btns"><button class="st-b" data-ord="monter">↑ Monter</button><button class="st-b" data-ord="descendre">↓ Descendre</button></div>` : '');
    const dim = libre() && un ? `<span class="st-h3" style="display:block">Position et taille</span><div class="st-row">${champ('X', 'x', e.x, 'number')}${champ('Y', 'y', e.y, 'number')}</div><div class="st-row">${champ('Largeur', 'w', e.w, 'number', 'min="30"')}${champ('Hauteur', 'h', e.h, 'number', 'min="16"')}</div>` : '';
    const largMax = !libre() && un && ['image', 'video', 'tableau'].includes(e.type) ? champ('Largeur maximale (px)', 'w', e.w, 'number', 'min="120" max="900"') : '';
    return `${dim}${largMax}${ord}<div class="st-btns" style="margin-top:6px"><button class="st-b" data-act="dupliquer">⧉ Dupliquer</button><button class="st-b" data-act="verrou">${verr ? '🔓 Déverrouiller' : '🔒 Verrouiller'}</button><button class="st-b dg" data-act="suppr">🗑 Supprimer</button></div>`;
  }
  function propsElement(e) {
    const p = e.props, t = e.type; let h = `<h3 class="st-pt">${esc(NOMS[t] || t)}</h3><p class="st-ps">${e.locked ? '🔒 Élément verrouillé : déverrouillez-le pour le modifier.' : 'Les modifications s\'appliquent tout de suite.'}</p>`;
    if (e.locked) return h + actionsComm([e]);
    if (R.TEXTE.includes(t)) {
      h += `<div class="st-fmt" id="st-fmt"><button type="button" data-cmd="bold" title="Gras"><b>G</b></button><button type="button" data-cmd="italic" title="Italique"><i>I</i></button><button type="button" data-cmd="underline" title="Souligné"><u>S</u></button><button type="button" data-cmd="insertUnorderedList" title="Liste à puces">•≡</button><button type="button" data-cmd="insertOrderedList" title="Liste numérotée">1≡</button><button type="button" data-cmd="createLink" title="Lien">🔗</button><button type="button" data-cmd="removeFormat" title="Effacer la mise en forme">✖</button><input type="color" id="st-fcol" title="Couleur de la sélection" value="#0b1226" style="width:34px;height:30px;padding:0;border:1px solid var(--st-bord);border-radius:6px;background:none"></div>
        <p class="st-aide" style="margin-top:-4px">Double-cliquez le texte dans la page, sélectionnez des mots, puis utilisez ces boutons.</p>
        ${select('Police', 'police', p.police || '', POLICES.map(f => [f, f || 'Par défaut']))}
        <div class="st-row">${champ('Taille (px)', 'taille', p.taille || '', 'number', 'min="8" max="120" placeholder="auto"')}${champ('Interligne', 'interligne', p.interligne || '', 'number', 'min="1" max="3" step="0.1" placeholder="auto"')}</div>
        ${couleurChamp('Couleur du texte', 'couleur', p.couleur, '#0b1226')}${t === 'encadre' ? couleurChamp('Couleur du fond', 'fond', p.fond, '#fff7e0') : ''}
        ${select('Alignement', 'align', p.align || 'left', [['left', 'À gauche'], ['center', 'Centré'], ['right', 'À droite'], ['justify', 'Justifié']])}
        <label class="st-f" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="gras" data-k="bool" ${p.gras ? 'checked' : ''}> <span style="margin:0">Tout en gras</span></label>`;
    } else if (t === 'image') {
      h += `<div class="st-btns"><button class="st-b or" data-up="image">${p.url ? 'Remplacer l\'image' : 'Importer une image'}</button>${p.url ? '<button class="st-b dg" data-vide="url">Retirer</button>' : ''}</div>
        ${champ('ou adresse (https) de l\'image', 'url', p.url, 'url', 'placeholder="https://…"')}${champ('Texte alternatif (accessibilité)', 'alt', p.alt)}${champ('Légende', 'legende', p.legende)}
        ${select('Ajustement', 'ajust', p.ajust, [['contain', 'Image entière'], ['cover', 'Remplir le cadre (recadre les bords)']])}
        ${select('Alignement', 'align', p.align, [['left', 'À gauche'], ['center', 'Centré'], ['right', 'À droite']])}${champ('Arrondi des coins (px)', 'rayon', p.rayon, 'number', 'min="0" max="60"')}`;
    } else if (t === 'video') {
      h += `${champ('Adresse de la vidéo (YouTube ou fichier https)', 'url', p.url, 'url', 'placeholder="https://www.youtube.com/watch?v=…"')}${champ('Titre de la vidéo', 'titre', p.titre)}
        <p class="st-aide">Les vidéos importées depuis votre ordinateur arrivent avec la bibliothèque de médias (étape suivante) ; pour l'instant, collez l'adresse d'une vidéo hébergée.</p>`;
    } else if (t === 'audio') {
      h += `${champ('Adresse du fichier audio (https)', 'url', p.url, 'url', 'placeholder="https://…/audio.mp3"')}${champ('Titre', 'titre', p.titre)}`;
    } else if (t === 'fichier') {
      h += `<div class="st-btns"><button class="st-b or" data-up="document">${p.url ? 'Remplacer le fichier' : 'Importer un fichier'}</button></div><p class="st-aide">PDF, Word, Excel, PowerPoint ou image — 15 Mo maximum.</p>
        ${champ('Nom affiché', 'nom', p.nom)}${champ('Description', 'description', p.description)}${champ('ou adresse (https) du fichier', 'url', p.url, 'url')}`;
    } else if (t === 'bouton') {
      h += `${champ('Texte du bouton', 'libelle', p.libelle)}${select('Action', 'action', p.action, [['lien', 'Ouvrir un lien'], ['page', 'Aller à une page du module'], ['fichier', 'Télécharger un fichier']])}
        ${p.action === 'page' ? select('Page de destination', 'page', p.page, [['', '— choisir —'], ...S.doc.pages.map((x, i) => [x.id, `Page ${i + 1}${x.titre ? ' — ' + x.titre : ''}`])]) : champ(p.action === 'fichier' ? 'Adresse (https) du fichier' : 'Adresse du lien', 'url', p.url, 'url', 'placeholder="https://…"')}
        <div class="st-row">${couleurChamp('Fond', 'couleur', p.couleur, '#e6b84a')}${couleurChamp('Texte', 'couleur_texte', p.couleur_texte, '#0b1226')}</div>${champ('Arrondi (px)', 'rayon', p.rayon, 'number', 'min="0" max="60"')}`;
    } else if (t === 'lien') {
      h += `${champ('Texte du lien', 'libelle', p.libelle)}${champ('Adresse', 'url', p.url, 'url', 'placeholder="https://…"')}`;
    } else if (t === 'separateur') {
      h += `${select('Style', 'style', p.style, [['trait', 'Trait'], ['pointille', 'Pointillés'], ['double', 'Double']])}${couleurChamp('Couleur', 'couleur', p.couleur, '#e6b84a')}${champ('Épaisseur (px)', 'epaisseur', p.epaisseur, 'number', 'min="1" max="12"')}`;
    } else if (t === 'validation') {
      h += `${champ('Texte', 'libelle', p.libelle)}<label class="st-f" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="obligatoire" data-k="bool" ${p.obligatoire !== false ? 'checked' : ''}> <span style="margin:0">Obligatoire pour terminer ce module</span></label>`;
    } else if (t === 'tableau') {
      h += `<label class="st-f" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="entete" data-k="bool" ${p.entete !== false ? 'checked' : ''}> <span style="margin:0">Première ligne = en-tête</span></label>
        <div class="st-btns"><button class="st-b" data-tab="+l">＋ Ligne</button><button class="st-b" data-tab="-l">− Ligne</button><button class="st-b" data-tab="+c">＋ Colonne</button><button class="st-b" data-tab="-c">− Colonne</button></div>
        <div style="overflow:auto"><table class="st-grille">${p.lignes.map((l, i) => `<tr>${l.map((c, j) => `<td><input type="text" data-cell="${i},${j}" value="${esc(c)}" maxlength="200"></td>`).join('')}</tr>`).join('')}</table></div>`;
    }
    return h + actionsComm([e]);
  }

  function lireChamp(f) { return f.dataset.k === 'bool' ? f.checked : f.dataset.k === 'num' ? (f.value === '' ? 0 : Number(f.value)) : f.value; }
  propsEl.addEventListener('focusin', () => { if (S.propSnap == null) S.propSnap = snap(); });
  propsEl.addEventListener('input', ev => appliquerChamp(ev.target, false));
  propsEl.addEventListener('change', ev => appliquerChamp(ev.target, true));
  function appliquerChamp(f, fin) {
    if (f.id === 'st-fcol') { if (S.editing) { S.editing.t.focus(); document.execCommand('foreColor', false, f.value); surSaisie(); } return; }
    if (f.dataset.cell) {
      const e = selection()[0]; if (!e) return; const [i, j] = f.dataset.cell.split(',').map(Number); e.props.lignes[i][j] = f.value; remplacerNoeud(e); if (fin) { validerProp(); } else modifie(); return;
    }
    if (!f.dataset.p) return;
    const v = lireChamp(f);
    if (f.dataset.scope === 'page') { pg()[f.dataset.p] = v; renderScene(); renderMiniaturesSoon(); }
    else {
      const e = selection()[0]; if (!e) return;
      if (['x', 'y', 'w', 'h'].includes(f.dataset.p)) e[f.dataset.p] = Math.round(clamp(v, f.dataset.p === 'x' || f.dataset.p === 'y' ? -2000 : 16, 6000));
      else e.props[f.dataset.p] = v;
      remplacerNoeud(e);
    }
    if (!fin) { modifie(); return; }
    validerProp(f.dataset.p === 'action' || f.dataset.p === 'obligatoire');
  }
  function validerProp(rerendre) {
    if (S.propSnap != null && S.propSnap !== snap()) { pousserUndo(S.propSnap); modifie(); }
    S.propSnap = null; renderMiniaturesSoon(); majBarre(); if (rerendre) renderProps();
  }
  propsEl.addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.cmd) { if (!S.editing) { toast('Double-cliquez d\'abord sur le texte dans la page.'); return; } S.editing.t.focus(); if (b.dataset.cmd === 'createLink') { const u = prompt('Adresse du lien (https://…)', 'https://'); if (u && /^https?:\/\//i.test(u)) document.execCommand('createLink', false, u); } else document.execCommand(b.dataset.cmd, false, null); surSaisie(); return; }
    if (b.dataset.al) return aligner(b.dataset.al);
    if (b.dataset.ord) return ordre(b.dataset.ord);
    if (b.dataset.pa) return actionPage(b.dataset.pa);
    if (b.dataset.act === 'dupliquer') return dupliquer();
    if (b.dataset.act === 'verrou') return verrouiller();
    if (b.dataset.act === 'suppr') return supprimer();
    if (b.dataset.raz) { const f = b.dataset.raz; if (b.dataset.scope === 'page') modifier(() => { pg()[f] = ''; }); else { const e = selection()[0]; modifier(() => { e.props[f] = ''; }); } renderProps(); return; }
    if (b.dataset.vide) { const e = selection()[0]; modifier(() => { e.props[b.dataset.vide] = ''; }); renderProps(); return; }
    if (b.dataset.up === 'image') return choisirImage(S.sel[0]);
    if (b.dataset.up === 'document') return choisirDocument(S.sel[0]);
    if (b.dataset.tab) {
      const e = selection()[0], L = e.props.lignes, n = L[0].length;
      modifier(() => { if (b.dataset.tab === '+l') L.push(new Array(n).fill('')); else if (b.dataset.tab === '-l' && L.length > 1) L.pop(); else if (b.dataset.tab === '+c' && n < 8) L.forEach(r => r.push('')); else if (b.dataset.tab === '-c' && n > 1) L.forEach(r => r.pop()); }); renderProps();
    }
  });
  /* les boutons de mise en forme ne doivent pas faire perdre la sélection du texte */
  propsEl.addEventListener('mousedown', ev => { if (ev.target.closest('#st-fmt button')) ev.preventDefault(); });

  async function choisirImage(id) {
    if (typeof pickAndUpload !== 'function') { toast('Le téléversement est indisponible sur cette page.'); return; }
    toast('Choisissez une image…');
    const url = await pickAndUpload('post', { maxW: 1600, maxH: 1600, maxMo: 5 });
    if (!url) return; const e = el(id); if (!e) return;
    modifier(() => { e.props.url = url; if (!e.props.alt) e.props.alt = ''; }); choisir([id]); toast('Image ajoutée');
  }
  function choisirDocument(id) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*'; inp.style.display = 'none'; document.body.appendChild(inp);
    inp.onchange = async () => {
      const f = inp.files[0]; inp.remove(); if (!f) return;
      if (f.size > 15 * 1024 * 1024) { toast('Fichier trop volumineux (15 Mo maximum).'); return; }
      toast('Envoi du fichier…');
      try { const url = await uploadMedia(f, 'document'); const e = el(id); if (!e) return; modifier(() => { e.props.url = url; if (!e.props.nom) e.props.nom = f.name; }); choisir([id]); toast('Fichier ajouté'); }
      catch (err) { toast(err.message || 'Envoi impossible.'); }
    };
    inp.click();
  }

  /* ───────── clavier ───────── */
  document.addEventListener('keydown', ev => {
    const cible = ev.target; const saisie = cible.closest && cible.closest('input,textarea,select,[contenteditable="true"]');
    const ctrl = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
    if (ctrl && k === 's') { ev.preventDefault(); sauver(); return; }
    if (saisie) { if (ev.key === 'Escape' && S.editing) { finEdition(); } return; }
    if (ctrl && k === 'z') { ev.preventDefault(); ev.shiftKey ? retablir() : annuler(); }
    else if (ctrl && k === 'y') { ev.preventDefault(); retablir(); }
    else if (ctrl && k === 'c') { copier(); }
    else if (ctrl && k === 'v') { ev.preventDefault(); coller(); }
    else if (ctrl && k === 'd') { ev.preventDefault(); dupliquer(); }
    else if (ctrl && k === 'a') { ev.preventDefault(); choisir(pg().elements.map(e => e.id)); }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); supprimer(); }
    else if (ev.key === 'Escape') { choisir([]); }
    else if (ev.key.startsWith('Arrow') && libre() && S.sel.length) {
      ev.preventDefault(); const pas = ev.shiftKey ? 10 : 1, dx = ev.key === 'ArrowLeft' ? -pas : ev.key === 'ArrowRight' ? pas : 0, dy = ev.key === 'ArrowUp' ? -pas : ev.key === 'ArrowDown' ? pas : 0;
      const s = selection().filter(e => !e.locked); if (!s.length) return;
      modifier(() => { s.forEach(e => { e.x += dx; e.y += dy; }); }, { sansRendu: true }); s.forEach(remplacerNoeud); renderProps();
    }
  });
  stage.addEventListener('wheel', ev => { if (ev.ctrlKey) { ev.preventDefault(); zoomer(ev.deltaY < 0 ? 1.1 : 1 / 1.1); } }, { passive: false });
  window.addEventListener('resize', () => { if (S.autoFit) ajuster(); });
  window.addEventListener('beforeunload', ev => { if (S.dirty || S.saving) { ev.preventDefault(); ev.returnValue = ''; } });

  /* ───────── modes de création ───────── */
  function convertir(vers) {
    if (S.doc.mode === vers) return;
    if (S.editing) finEdition();
    modifier(() => {
      if (vers === 'structure') S.doc.pages.forEach(p => p.elements.sort((a, b) => (a.y - b.y) || (a.x - b.x)));
      else S.doc.pages.forEach(p => { let y = 40; p.elements.forEach((e, i) => { const w = Math.min(e.w || 600, 1100); e.w = w; e.x = Math.round((R.PAGE_W - w) / 2); e.y = y; e.z = i + 1; y += (e.h || 80) + 20; }); });
      S.doc.mode = vers;
    });
    S.sel = []; if (S.autoFit) ajuster(); renderTout(); toast(vers === 'libre' ? 'Mode page libre — vos éléments ont été posés sur la page.' : 'Mode pages structurées — vos éléments sont empilés dans l\'ordre.');
  }
  $('#st-modes').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-mode]'); if (!b) return;
    const vers = b.dataset.mode; if (vers === S.doc.mode) return;
    if (!S.doc.pages.some(p => p.elements.length)) { convertir(vers); return; }
    boite('m-info', `<h2>Changer de mode ?</h2><p>${vers === 'libre' ? 'Vos éléments seront posés sur une page libre, dans leur ordre actuel.' : 'Vos éléments seront empilés dans l\'ordre où ils apparaissent sur la page (de haut en bas).'} Aucun contenu n'est perdu, et vous pourrez annuler avec Ctrl+Z.</p>
      <div class="st-btns"><button class="st-b or" id="md-ok">Changer de mode</button><button class="st-b" id="md-non">Annuler</button></div>`);
    $('#md-ok').onclick = () => { fermer('m-info'); convertir(vers); }; $('#md-non').onclick = () => fermer('m-info');
  });

  /* ───────── aperçu (ordinateur / tablette / smartphone) ───────── */
  function apercu() {
    if (S.editing) finEdition();
    boite('m-info', `<h2>Aperçu — comme l'apprenant</h2><div class="st-prev-bar"><button class="st-b on" data-dev="1100">🖥️ Ordinateur</button><button class="st-b" data-dev="768">📱 Tablette</button><button class="st-b" data-dev="390">📞 Smartphone</button><span class="grow"></span><button class="st-b" id="pv-x">Fermer</button></div>
      <div class="st-prev-zone"><div class="st-prev-cadre" id="pv-cadre" style="width:1100px;max-width:100%"></div></div><p class="st-aide">Les boutons, les validations et la navigation entre les pages fonctionnent comme pour l'apprenant.</p>`, true);
    let inst = null;
    const monter = () => { if (inst) inst.destroy(); inst = R.lecture($('#pv-cadre'), { mode: S.doc.mode, pages: copie(S.doc.pages) }, {}); };
    $$('[data-dev]', $('#m-info')).forEach(b => b.addEventListener('click', () => { $$('[data-dev]', $('#m-info')).forEach(x => x.classList.remove('on')); b.classList.add('on'); $('#pv-cadre').style.width = b.dataset.dev + 'px'; monter(); }));
    $('#pv-x').onclick = () => { if (inst) inst.destroy(); fermer('m-info'); }; monter();
  }

  /* ───────── historique, publication ───────── */
  async function historique() {
    await sauver();
    try {
      const { versions } = await api('GET', API + '/versions');
      const lignes = versions.length ? versions.map(v => `<li><div><b>Version ${v.version}</b> ${v.en_ligne ? '<span class="st-pub live">En ligne</span>' : v.publiee ? '<span class="st-pub">Publiée</span>' : ''}<small>${esc(new Date(String(v.date).replace(' ', 'T') + 'Z').toLocaleString('fr-FR'))}${v.libelle ? ' · ' + esc(v.libelle) : ''}${v.auteur ? ' · ' + esc(v.auteur) : ''}</small></div><button class="st-b" data-rest="${v.version}">Restaurer</button></li>`).join('') : '<li><div>Aucune version enregistrée pour le moment. Elles apparaissent à la publication ou quand vous créez un point de restauration.</div></li>';
      boite('m-info', `<h2>Historique des versions</h2><p>Restaurer une version remplace le contenu actuel (le contenu actuel est d'abord conservé dans l'historique).</p><ul class="st-liste">${lignes}</ul>
        <div class="st-btns"><button class="st-b or" id="hv-pt">＋ Créer un point de restauration</button>${S.publiee != null ? '<button class="st-b dg" id="hv-dep">Dépublier</button>' : ''}<button class="st-b" id="hv-x">Fermer</button></div>`);
      $('#hv-x').onclick = () => fermer('m-info');
      $('#hv-pt').onclick = async () => { try { await api('POST', API + '/versions', {}); toast('Point de restauration créé'); historique(); } catch (e) { toast(e.message); } };
      const dep = $('#hv-dep'); if (dep) dep.onclick = async () => { if (!confirm('Dépublier ce module ? Les apprenants ne le verront plus (leur progression est conservée).')) return; try { await api('POST', API + '/depublier'); S.publiee = null; S.nonPubliees = false; majPub(); toast('Module dépublié'); fermer('m-info'); } catch (e) { toast(e.message); } };
      $$('[data-rest]', $('#m-info')).forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Restaurer la version ' + b.dataset.rest + ' ?')) return;
        try { const r = await api('POST', API + '/restaurer', { version: Number(b.dataset.rest), rev: S.rev }); S.rev = r.rev; chargerDocLocal(r.doc); S.undo = []; S.redo = []; S.dirty = false; S.nonPubliees = S.publiee != null; majPub(); fermer('m-info'); setEtat('Version restaurée', 'ok'); toast('Version ' + b.dataset.rest + ' restaurée'); } catch (e) { toast(e.message); }
      }));
    } catch (e) { toast(e.message); }
  }
  async function publier() {
    if (S.editing) finEdition();
    setEtat('Enregistrement…', 'att'); const ok = await sauver(); if (!ok) { toast('Enregistrez d\'abord (voir le message d\'état).'); return; }
    try {
      const r = await api('POST', API + '/publier'); S.publiee = r.version; S.nonPubliees = false; majPub();
      boite('m-info', `<h2>✅ Module publié</h2><p>La version ${r.version} est en ligne : les apprenants qui ont accès à cette leçon la voient. Vous pouvez continuer à modifier le brouillon sans toucher à la version en ligne, puis republier.</p><div class="st-btns"><button class="st-b or" id="pb-x">Continuer</button></div>`);
      $('#pb-x').onclick = () => fermer('m-info');
    } catch (e) {
      const liste = (e.data && e.data.problemes) || [e.message];
      boite('m-info', `<h2>Le module n'est pas prêt</h2><p>Corrigez ces points avant de publier :</p><ul class="st-liste st-prob">${liste.map(p => `<li>⚠ ${esc(p)}</li>`).join('')}</ul><div class="st-btns"><button class="st-b or" id="pb-x">Compris</button></div>`);
      $('#pb-x').onclick = () => fermer('m-info');
    }
  }

  /* ───────── chargement ───────── */
  function chargerDocLocal(doc) { S.doc = { mode: doc.mode === 'libre' ? 'libre' : 'structure', pages: doc.pages && doc.pages.length ? doc.pages : [nouvellePage()] }; S.pi = 0; S.sel = []; renderTout(); }
  function chargerDoc(d) {
    S.rev = d.rev; S.existe = d.existe; S.publiee = d.publiee_version != null ? d.publiee_version : null; S.nonPubliees = false;
    S.lecon = d.lecon || {}; S.formation = d.formation || {};
    $('#st-ariane').innerHTML = `<b>${esc(S.formation.titre || '')}</b> › ${esc(S.lecon.titre || '')}`;
    chargerDocLocal(d.doc); majPub();
  }
  function renderTout() { renderMiniatures(); renderScene(); renderProps(); majBarre(); if (S.autoFit) ajuster(); }

  function choixMode() {
    boite('m-info', `<h2>Comment voulez-vous créer ce module ?</h2><p>Les deux méthodes sont dans le même studio. Vous pourrez changer de mode plus tard sans perdre votre contenu.</p>
      <div class="st-choix"><button class="st-carte" data-m="structure"><span>🧱</span><b>Pages structurées</b><small>Comme PowerPoint ou un constructeur de pages : vos éléments s'empilent, page après page. Idéal pour les cours classiques.</small></button>
      <button class="st-carte" data-m="libre"><span>🎨</span><b>Page libre</b><small>Comme Canva : placez, déplacez et redimensionnez chaque élément où vous voulez. Idéal pour les supports très visuels.</small></button></div>`);
    $$('.st-carte', $('#m-info')).forEach(b => b.addEventListener('click', () => { S.doc.mode = b.dataset.m; fermer('m-info'); S.dirty = true; modifie(); renderTout(); ajuster(); }));
  }

  function brancher() {
    $('#st-annuler').onclick = annuler; $('#st-retablir').onclick = retablir; $('#st-copier').onclick = copier; $('#st-coller').onclick = coller;
    $('#st-dupliquer').onclick = dupliquer; $('#st-suppr').onclick = supprimer; $('#st-verrou').onclick = verrouiller;
    $('#st-zoom-m').onclick = () => zoomer(1 / 1.15); $('#st-zoom-p').onclick = () => zoomer(1.15); $('#st-ajuster').onclick = ajuster;
    $('#st-aimant').onclick = () => { S.aimant = !S.aimant; majBarre(); toast(S.aimant ? 'Aimantation activée (repères et alignements)' : 'Aimantation désactivée'); };
    $$('.st-al').forEach(b => { b.onclick = () => aligner(b.dataset.al); });
    $('#st-apercu').onclick = apercu; $('#st-histo').onclick = historique; $('#st-publier').onclick = publier;
    $('#st-retour').onclick = async () => { if (S.dirty) await sauver(); location.href = 'formations.html'; };
    $('#st-btn-outils').onclick = () => { libEl.classList.toggle('open'); propsEl.classList.remove('open'); };
    $('#st-btn-props').onclick = () => { propsEl.classList.toggle('open'); libEl.classList.remove('open'); };
    $$('.st-mod').forEach(m => m.addEventListener('mousedown', ev => { if (ev.target === m && m.id !== 'm-info') m.classList.remove('open'); }));
  }

  async function demarrer() {
    if (!FID || !LID) { document.body.innerHTML = '<p style="padding:30px;color:#fff">Module introuvable : ouvrez le studio depuis une leçon de votre formation.</p>'; return; }
    renderOutils(); brancher();
    let d;
    try { d = await api('GET', API); }
    catch (e) {
      if (e.status === 401) { location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname + location.search); return; }
      document.body.innerHTML = `<div style="padding:30px;color:#fff;max-width:560px;margin:auto"><h2>Studio indisponible</h2><p>${esc(e.message)}</p><p><a style="color:#f4d98a" href="formations.html">← Retour à mes formations</a></p></div>`; return;
    }
    chargerDoc(d); ajuster();
    let sauvegarde = null; try { sauvegarde = JSON.parse(localStorage.getItem('studio:' + LID) || 'null'); } catch (_) {}
    if (sauvegarde && sauvegarde.doc && Number(sauvegarde.rev) === Number(S.rev) && JSON.stringify(sauvegarde.doc) !== snap()) {
      boite('m-info', `<h2>Modifications non enregistrées retrouvées</h2><p>La dernière fois, la page s'est fermée avant l'enregistrement (${esc(new Date(sauvegarde.t).toLocaleString('fr-FR'))}). Voulez-vous les récupérer ?</p><div class="st-btns"><button class="st-b or" id="rc-ok">Récupérer mes modifications</button><button class="st-b" id="rc-non">Ignorer</button></div>`);
      $('#rc-ok').onclick = () => { chargerDocLocal(sauvegarde.doc); fermer('m-info'); S.dirty = true; modifie(); };
      $('#rc-non').onclick = () => { try { localStorage.removeItem('studio:' + LID); } catch (_) {} fermer('m-info'); };
    } else if (!S.existe) choixMode();
    setEtat(S.existe ? 'Enregistré' : 'Nouveau module', S.existe ? 'ok' : '');
  }
  window.StudioDebug = { S, el, pg, ajouterOutil, sauver, convertir };
  demarrer();
})();
