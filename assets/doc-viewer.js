/* ═════════════════════════════════════════════════
   assets/doc-viewer.js — visionneuses de documents du cours : PDF et Excel DANS la page (2026-10-30)

   Composants : InlinePDFViewer (PDF.js, chargé à la demande), InlineExcelViewer (tableau lu par fenêtres de lignes côté serveur),
   TrainingDocumentBlock (choisit la bonne visionneuse d'après la réponse du serveur : famille, intégré, téléchargeable, hauteur).
   Le navigateur ne lit JAMAIS l'adresse brute du fichier : tout passe par /api/formations/:id/lecons/:leconId/document/… (accès contrôlé).

   Pour l'assistant pédagogique (Koffi) :
     - événement document « diaspo:document-contexte » {type, nom, page | feuille + cellule, valeur, formule, selection} à chaque changement de page,
       de cellule ou de sélection de texte ;
     - DocViewer.contexte() : le dernier contexte ; DocViewer.aller({ page, recherche } | { feuille, cellule }) : ouvrir l'emplacement voulu ;
     - tout lien portant data-doc-aller="p:3" · "p:3:bénéfice" · "c:Prévisions!B12" · "c:B12" déplace la visionneuse concernée (sans quitter la page).
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  const PDF_JS = { version: '3.11.174', src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    sri: 'sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==' };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const instances = new Set(); let derniere = null, dernierContexte = null;

  async function json(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || 'Document indisponible.'); e.code = d.code; e.status = r.status; throw e; }
    return d;
  }
  function publier(inst, detail) {
    derniere = inst; dernierContexte = Object.assign({ nom: inst.nom, type: inst.type }, detail);
    try { document.dispatchEvent(new CustomEvent('diaspo:document-contexte', { detail: dernierContexte })); } catch (_) { /* sans importance */ }
  }
  function plein(inst) {
    const h = inst.host;
    const actif = document.fullscreenElement === h || h.classList.contains('dv-plein');
    if (actif) { if (document.fullscreenElement) document.exitFullscreen(); h.classList.remove('dv-plein'); document.body.classList.remove('dv-bloque'); }
    else if (h.requestFullscreen) { h.requestFullscreen().catch(() => { h.classList.add('dv-plein'); document.body.classList.add('dv-bloque'); }); }
    else { h.classList.add('dv-plein'); document.body.classList.add('dv-bloque'); } /* iPhone : pas d'API plein écran → on occupe tout l'écran */
    setTimeout(() => inst.redim && inst.redim(), 150);
  }
  document.addEventListener('fullscreenchange', () => instances.forEach(i => i.redim && setTimeout(() => i.redim(), 100)));
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') instances.forEach(i => { if (i.host.classList.contains('dv-plein')) plein(i); }); });

  function barreBouton(id, titre, html, extra) { return `<button type="button" class="dv-b" data-a="${id}" title="${esc(titre)}" aria-label="${esc(titre)}"${extra || ''}>${html}</button>`; }
  function messageErreur(host, texte, lien) {
    host.innerHTML = `<div class="dv-erreur" role="alert"><div class="dv-erreur-t">📄 Ce document ne peut pas s'afficher</div><p>${esc(texte)}</p>${lien ? `<a class="dv-b dv-lien" href="${esc(lien)}" download>⬇ Télécharger le fichier</a>` : ''}</div>`;
  }

  /* ═══════════ PDF ═══════════ */
  let promessePdf = null;
  function chargerPdfJs() {
    if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS.worker; return Promise.resolve(window.pdfjsLib); }
    if (promessePdf) return promessePdf;
    promessePdf = new Promise((ok, ko) => {
      const s = document.createElement('script'); s.src = PDF_JS.src; s.integrity = PDF_JS.sri; s.crossOrigin = 'anonymous'; s.async = true;
      s.onload = () => { if (!window.pdfjsLib) return ko(new Error('Le lecteur PDF n\'a pas pu démarrer.')); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS.worker; ok(window.pdfjsLib); };
      s.onerror = () => { promessePdf = null; ko(new Error('Le lecteur PDF n\'a pas pu être chargé (connexion ?).')); };
      document.head.appendChild(s);
    });
    return promessePdf;
  }

  function InlinePDFViewer(host, o) {
    const inst = { host, type: 'pdf', nom: o.nom || 'Document PDF', redim: null }; instances.add(inst);
    host.classList.add('dv', 'dv-pdf'); host.style.setProperty('--dv-h', Math.min(1600, Math.max(240, Number(o.hauteur) || 640)) + 'px');
    host.innerHTML = `<div class="dv-barre" role="toolbar" aria-label="Lecteur PDF">
        ${barreBouton('prec', 'Page précédente', '‹')}<span class="dv-page"><input class="dv-num" type="number" min="1" value="1" aria-label="Numéro de page"> / <span class="dv-tot">…</span></span>${barreBouton('suiv', 'Page suivante', '›')}
        <span class="dv-sep"></span>${barreBouton('moins', 'Zoom arrière', '−')}<span class="dv-zoom" aria-live="polite">100 %</span>${barreBouton('plus', 'Zoom avant', '+')}${barreBouton('ajuster', 'Ajuster à la largeur', '↔')}
        <span class="dv-sep"></span>${barreBouton('chercher', 'Rechercher dans le document', '🔍')}
        <span class="dv-flex"></span>${o.telechargement ? `<a class="dv-b dv-lien" href="${esc(o.telechargement)}" download title="Télécharger le fichier">⬇</a>` : ''}${barreBouton('plein', 'Plein écran', '⛶')}</div>
      <div class="dv-recherche" hidden><input type="search" class="dv-q" placeholder="Rechercher dans le document…" aria-label="Rechercher dans le document"><button type="button" class="dv-b" data-a="rp" aria-label="Résultat précédent">↑</button><button type="button" class="dv-b" data-a="rs" aria-label="Résultat suivant">↓</button><span class="dv-rc" aria-live="polite"></span></div>
      <div class="dv-zone" tabindex="0"><div class="dv-pages"></div><div class="dv-etat">Chargement du document…</div></div>`;
    const $ = s => host.querySelector(s), zone = $('.dv-zone'), conteneur = $('.dv-pages'), etat = $('.dv-etat'), num = $('.dv-num');
    let pdf = null, nb = 0, zoom = 1, dimBase = null, pages = [], observateur = null, courante = 1, texte = [], resultats = [], rIdx = -1, requete = '';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const largeurUtile = () => Math.max(160, zone.clientWidth - 20);
    const echelleCss = (vp1) => (largeurUtile() * zoom) / vp1.width;

    function dessinerTailles() {
      if (!dimBase) return; const ech = echelleCss(dimBase);
      pages.forEach(p => { const w = Math.round(dimBase.width * ech), h = Math.round(dimBase.height * ech); p.el.style.width = w + 'px'; p.el.style.height = h + 'px'; });
      $('.dv-zoom').textContent = Math.round(zoom * 100) + ' %';
    }
    async function rendrePage(p) {
      if (p.rendu || p.enCours || !pdf) return; p.enCours = true;
      try {
        const page = await pdf.getPage(p.n); const vp1 = page.getViewport({ scale: 1 }); const ech = (largeurUtile() * zoom) / vp1.width; const vp = page.getViewport({ scale: ech });
        p.el.style.width = Math.round(vp.width) + 'px'; p.el.style.height = Math.round(vp.height) + 'px';
        const canvas = document.createElement('canvas'); canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr); canvas.style.width = '100%'; canvas.style.height = '100%';
        const ctx = canvas.getContext('2d', { alpha: false });
        await page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null, background: '#ffffff' }).promise;
        const couche = document.createElement('div'); couche.className = 'dv-texte'; couche.style.setProperty('--scale-factor', String(vp.scale));
        p.el.innerHTML = ''; p.el.appendChild(canvas); p.el.appendChild(couche);
        try { const tc = await page.getTextContent(); texte[p.n - 1] = tc.items.map(i => i.str).join(' '); await window.pdfjsLib.renderTextLayer({ textContentSource: tc, container: couche, viewport: vp, textDivs: [] }).promise; } catch (_) { /* texte non disponible : le PDF reste lisible */ }
        p.rendu = true; surligner(p);
      } catch (e) { if (e && e.name !== 'RenderingCancelledException') p.el.innerHTML = '<div class="dv-page-err">Page illisible</div>'; }
      finally { p.enCours = false; }
    }
    function libererPage(p) { if (!p.rendu) return; p.el.innerHTML = ''; p.rendu = false; }
    /* Une page n'est libérée (mémoire) que si elle est réellement loin de la zone visible : un rapport tardif de l'observateur ne doit pas effacer une page qu'on vient d'atteindre. */
    const loin = p => { const t = p.el.offsetTop, f = t + p.el.offsetHeight; return f < zone.scrollTop - 1800 || t > zone.scrollTop + zone.clientHeight + 1800; };
    function surveiller() {
      if (observateur) observateur.disconnect();
      observateur = new IntersectionObserver(es => es.forEach(e => { const p = pages[Number(e.target.dataset.n) - 1]; if (e.isIntersecting) rendrePage(p); else if (loin(p)) libererPage(p); }), { root: zone, rootMargin: '900px 0px' });
      pages.forEach(p => observateur.observe(p.el));
      rendreVisibles();
    }
    /* Filet de sécurité : les pages proches de la zone visible sont dessinées d'après leur position, sans attendre l'observateur. */
    function rendreVisibles() {
      const h = zone.scrollTop - 900, b = zone.scrollTop + zone.clientHeight + 900;
      pages.forEach(p => { const t = p.el.offsetTop, f = t + p.el.offsetHeight; if (f >= h && t <= b) rendrePage(p); });
    }
    function pageCourante() {
      const ref = zone.scrollTop + zone.clientHeight * 0.3; let n = 1;
      for (const p of pages) { if (p.el.offsetTop <= ref) n = p.n; else break; }
      return n;
    }
    function majPage(publie) { const n = pageCourante(); if (n !== courante || publie) { courante = n; num.value = n; publier(inst, { page: n, pages: nb, recherche: requete || undefined }); } }
    let tPub = null; zone.addEventListener('scroll', () => { clearTimeout(tPub); tPub = setTimeout(() => { majPage(false); rendreVisibles(); }, 120); }, { passive: true });
    function aller(n, haut) { n = clamp(Math.round(n) || 1, 1, nb || 1); const p = pages[n - 1]; if (!p) return; zone.scrollTo({ top: p.el.offsetTop - (haut ? 0 : 6), behavior: 'auto' }); courante = n; num.value = n; rendrePage(p); publier(inst, { page: n, pages: nb, recherche: requete || undefined }); }
    function definirZoom(z) {
      const centre = pageCourante(); zoom = clamp(Math.round(z * 100) / 100, 0.5, 4); dessinerTailles();
      pages.forEach(p => { p.rendu = false; p.el.innerHTML = ''; }); surveiller(); aller(centre, true);
    }

    /* recherche : texte de chaque page lu à la demande ; on surligne les segments qui contiennent le mot */
    async function texteDe(n) { if (texte[n - 1] != null) return texte[n - 1]; const page = await pdf.getPage(n); const tc = await page.getTextContent(); texte[n - 1] = tc.items.map(i => i.str).join(' '); return texte[n - 1]; }
    function surligner(p) {
      const couche = p.el.querySelector('.dv-texte'); if (!couche) return; couche.querySelectorAll('.dv-trouve').forEach(x => x.classList.remove('dv-trouve'));
      if (!requete) return; const q = requete.toLowerCase();
      couche.querySelectorAll('span').forEach(s => { if (s.textContent.toLowerCase().includes(q)) s.classList.add('dv-trouve'); });
    }
    async function chercher(q) {
      requete = String(q || '').trim(); resultats = []; rIdx = -1; const rc = $('.dv-rc');
      if (requete.length < 2) { rc.textContent = ''; pages.forEach(surligner); return; }
      rc.textContent = 'Recherche…'; const ql = requete.toLowerCase();
      for (let n = 1; n <= nb; n++) { const t = (await texteDe(n)).toLowerCase(); let i = t.indexOf(ql), k = 0; while (i >= 0 && k < 50) { resultats.push({ page: n, i }); k++; i = t.indexOf(ql, i + ql.length); } if (resultats.length > 500) break; }
      pages.forEach(surligner);
      rc.textContent = resultats.length ? `${resultats.length} résultat${resultats.length > 1 ? 's' : ''}` : 'Aucun résultat';
      if (resultats.length) suivant(1);
    }
    function suivant(sens) {
      if (!resultats.length) return; rIdx = (rIdx + sens + resultats.length) % resultats.length; const r = resultats[rIdx];
      $('.dv-rc').textContent = `${rIdx + 1} / ${resultats.length} · page ${r.page}`; aller(r.page, false);
    }

    host.addEventListener('click', ev => {
      const b = ev.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
      if (a === 'prec') aller(courante - 1, true); else if (a === 'suiv') aller(courante + 1, true);
      else if (a === 'plus') definirZoom(zoom + 0.25); else if (a === 'moins') definirZoom(zoom - 0.25); else if (a === 'ajuster') definirZoom(1);
      else if (a === 'plein') plein(inst);
      else if (a === 'chercher') { const r = $('.dv-recherche'); r.hidden = !r.hidden; if (!r.hidden) $('.dv-q').focus(); }
      else if (a === 'rs') suivant(1); else if (a === 'rp') suivant(-1);
    });
    num.addEventListener('change', () => aller(Number(num.value), true));
    $('.dv-q').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); if (ev.target.value.trim().toLowerCase() === requete.toLowerCase() && resultats.length) suivant(ev.shiftKey ? -1 : 1); else chercher(ev.target.value); } });
    zone.addEventListener('keydown', ev => { if (ev.key === 'PageDown' || ev.key === 'ArrowRight') { ev.preventDefault(); aller(courante + 1, true); } else if (ev.key === 'PageUp' || ev.key === 'ArrowLeft') { ev.preventDefault(); aller(courante - 1, true); } });
    let tSel = null; document.addEventListener('selectionchange', () => { clearTimeout(tSel); tSel = setTimeout(() => { const s = window.getSelection(); if (!s || s.isCollapsed || !zone.contains(s.anchorNode)) return; const t = String(s).trim(); if (t.length > 1) publier(inst, { page: courante, pages: nb, selection: t.slice(0, 600) }); }, 400); });
    let largeurAvant = 0; inst.redim = () => { if (!dimBase || Math.abs(zone.clientWidth - largeurAvant) < 4) return; largeurAvant = zone.clientWidth; dessinerTailles(); pages.forEach(p => { p.rendu = false; p.el.innerHTML = ''; }); surveiller(); majPage(true); };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => inst.redim()).observe(zone);

    inst.aller = ref => { if (ref.recherche) { $('.dv-recherche').hidden = false; $('.dv-q').value = ref.recherche; return chercher(ref.recherche).then(() => { if (ref.page) aller(ref.page, false); }); } if (ref.page) aller(ref.page, false); return Promise.resolve(); };
    inst.detruire = () => { instances.delete(inst); if (observateur) observateur.disconnect(); if (pdf) pdf.destroy(); };

    chargerPdfJs().then(lib => lib.getDocument({ url: o.src, withCredentials: true, isEvalSupported: false, enableXfa: false, rangeChunkSize: 65536, disableAutoFetch: true, stopAtErrors: false }).promise).then(async doc => {
      pdf = doc; nb = doc.numPages; $('.dv-tot').textContent = nb; num.max = nb; texte = new Array(nb);
      const p1 = await doc.getPage(1); dimBase = p1.getViewport({ scale: 1 }); largeurAvant = zone.clientWidth;
      for (let n = 1; n <= nb; n++) { const el = document.createElement('div'); el.className = 'dv-p'; el.dataset.n = n; el.innerHTML = '<div class="dv-p-att">Page ' + n + '</div>'; conteneur.appendChild(el); pages.push({ n, el, rendu: false, enCours: false }); }
      etat.remove(); dessinerTailles(); surveiller(); majPage(true);
    }).catch(e => {
      const mdp = e && (e.name === 'PasswordException'); const inv = e && e.name === 'InvalidPDFException';
      messageErreur(host, mdp ? 'Ce PDF est protégé par un mot de passe : il ne peut pas être affiché dans la page.' : inv ? 'Ce fichier n\'est pas un PDF valide.' : (e && e.message) || 'Le document n\'a pas pu être chargé.', o.telechargement);
    });
    return inst;
  }

  /* ═══════════ EXCEL ═══════════ */
  function InlineExcelViewer(host, o) {
    const inst = { host, type: 'excel', nom: o.nom || 'Classeur Excel', redim: null }; instances.add(inst);
    host.classList.add('dv', 'dv-xl'); host.style.setProperty('--dv-h', Math.min(1600, Math.max(240, Number(o.hauteur) || 640)) + 'px');
    host.innerHTML = `<div class="dv-barre" role="toolbar" aria-label="Lecteur de tableur">
        <span class="dv-onglets" role="tablist" aria-label="Feuilles du classeur"></span><span class="dv-flex"></span>
        ${barreBouton('a-', 'Réduire le texte', 'A−')}${barreBouton('a+', 'Agrandir le texte', 'A+')}${barreBouton('info', 'Limites d\'affichage', 'ⓘ')}
        ${o.telechargement ? `<a class="dv-b dv-lien" href="${esc(o.telechargement)}" download title="Télécharger le fichier">⬇</a>` : ''}${barreBouton('plein', 'Plein écran', '⛶')}</div>
      <div class="dv-formule" aria-live="polite"><span class="dv-adr">—</span><span class="dv-fx">ƒx</span><span class="dv-val">Cliquez sur une cellule pour voir sa valeur et sa formule · lecture seule</span></div>
      <div class="dv-limites" hidden></div>
      <div class="dv-zone dv-xl-zone" tabindex="0"><div class="dv-etat">Chargement du classeur…</div></div>`;
    const $ = s => host.querySelector(s), zone = $('.dv-xl-zone');
    let meta = null, fi = 0, taille = 13; const feuilles = []; /* par feuille : { charge, total, colonnes, merges: Map, couverts: Set, largeurs, table, tbody, fin, charge en cours } */
    const CH = 100;

    function celluleHtml(c, st, r, k, f) {
      const s = c && c.s != null ? (meta.styles[c.s] || {}) : {}; const css = [];
      if (s.b) css.push('font-weight:700'); if (s.i) css.push('font-style:italic'); if (s.c) css.push('color:' + s.c); if (s.bg) css.push('background:' + s.bg);
      const al = s.al || (c && c.y === 'n' ? 'right' : (c && (c.y === 'b' || c.y === 'e') ? 'center' : '')); if (al) css.push('text-align:' + al);
      if (s.wrap) css.push('white-space:pre-wrap');
      return css.join(';');
    }
    async function chargerFenetre(f, debut, n) {
      const d = await json(`${o.base}/feuille?${o.params}&feuille=${f.i}&debut=${debut}&n=${n}`);
      if (!f.table) { f.total = d.total; f.colonnes = d.colonnes; f.largeurs = d.largeurs; f.noms = d.noms_colonnes; construireTable(f); }
      d.merges.forEach(m => { f.merges.set(m.r + ',' + m.c, m); for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) if (r !== m.r || c !== m.c) f.couverts.add(r + ',' + c); });
      const html = []; d.lignes.forEach((ligne, k) => {
        const r = d.debut + k; let tr = `<tr data-r="${r}"><th class="dv-rh" scope="row">${r + 1}</th>`;
        for (let c = 0; c < f.colonnes; c++) {
          if (f.couverts.has(r + ',' + c)) continue; const cell = ligne ? ligne[c] : null; const m = f.merges.get(r + ',' + c);
          const style = celluleHtml(cell, null, r, c, f); const attrs = (m ? ` rowspan="${m.rs}" colspan="${m.cs}"` : '') + (style ? ` style="${esc(style)}"` : '');
          tr += `<td data-c="${c}"${attrs}${cell && cell.f ? ' class="dv-f"' : ''}>${cell ? esc(cell.t) : ''}</td>`;
          if (cell) f.cellules.set(r + ',' + c, cell);
        }
        html.push(tr + '</tr>');
      });
      f.tbody.insertAdjacentHTML('beforeend', html.join('')); f.charge = d.fin;
      f.compteur.textContent = `${f.charge < f.total ? f.charge + ' lignes chargées sur ' : ''}${f.total.toLocaleString('fr-FR')} ligne${f.total > 1 ? 's' : ''} · ${f.colonnes} colonne${f.colonnes > 1 ? 's' : ''}`;
    }
    function construireTable(f) {
      f.merges = new Map(); f.couverts = new Set(); f.cellules = new Map();
      const w = document.createElement('div'); w.className = 'dv-tw'; w.style.fontSize = taille + 'px';
      const cols = f.noms.map((nom, c) => `<col style="width:${f.largeurs[c] || 84}px">`).join('');
      w.innerHTML = `<table class="dv-table"><colgroup><col style="width:46px">${cols}</colgroup><thead><tr><th class="dv-corner"></th>${f.noms.map(n => `<th class="dv-ch" scope="col">${n}</th>`).join('')}</tr></thead><tbody></tbody></table><div class="dv-compteur"></div>`;
      f.table = w; f.tbody = w.querySelector('tbody'); f.compteur = w.querySelector('.dv-compteur');
      w.addEventListener('click', ev => { const td = ev.target.closest('td'); if (!td) return; choisir(f, Number(td.parentNode.dataset.r), Number(td.dataset.c), td); });
    }
    function adresse(r, c) { return (meta.nomsCol ? meta.nomsCol(c) : String.fromCharCode(65 + c)) + (r + 1); }
    function nomCol(c) { let s = '', i = c + 1; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
    let selTd = null;
    function choisir(f, r, c, td) {
      if (selTd) selTd.classList.remove('dv-sel'); selTd = td; td.classList.add('dv-sel');
      const cell = f.cellules.get(r + ',' + c) || { t: '' }; const adr = nomCol(c) + (r + 1);
      $('.dv-adr').textContent = adr; $('.dv-fx').style.visibility = cell.f ? 'visible' : 'hidden';
      $('.dv-val').textContent = (cell.f ? '=' + cell.f.replace(/^=/, '') + '   →   ' : '') + (cell.t === '' ? '(vide)' : cell.t);
      publier(inst, { feuille: meta.feuilles[f.i].nom, cellule: adr, valeur: cell.t, formule: cell.f ? '=' + cell.f.replace(/^=/, '') : undefined });
    }
    async function ouvrirFeuille(i) {
      fi = i; $$onglets(); const f = feuilles[i]; zone.innerHTML = '';
      if (!f.table) { zone.innerHTML = '<div class="dv-etat">Chargement de la feuille…</div>'; try { await chargerFenetre(f, 0, CH); } catch (e) { zone.innerHTML = ''; messageErreur(zone, e.message); return; } zone.innerHTML = ''; }
      zone.appendChild(f.table); zone.scrollTop = f.scroll || 0; publier(inst, { feuille: meta.feuilles[i].nom }); remplir();
    }
    function $$onglets() { host.querySelectorAll('.dv-onglet').forEach((b, k) => { b.setAttribute('aria-selected', k === fi ? 'true' : 'false'); b.classList.toggle('on', k === fi); }); }
    /* Chargement progressif : tant que le bas du tableau est à moins de 400 px de la zone visible, on charge les lignes suivantes. */
    let charge = false;
    async function remplir() {
      const f = feuilles[fi]; if (!f || !f.table || charge) return;
      charge = true;
      try {
        for (let k = 0; k < 40 && f.charge < f.total; k++) {
          const bas = f.compteur.getBoundingClientRect().top, haut = zone.getBoundingClientRect().bottom;
          if (bas > haut + 400) break;
          await chargerFenetre(f, f.charge, CH);
        }
      } catch (_) { /* on réessaiera au prochain défilement */ }
      charge = false;
    }
    zone.addEventListener('scroll', () => { const f = feuilles[fi]; if (f && f.table) f.scroll = zone.scrollTop; remplir(); }, { passive: true });
    host.addEventListener('click', ev => {
      const b = ev.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
      if (a === 'plein') plein(inst);
      else if (a === 'a+' || a === 'a-') { taille = clamp(taille + (a === 'a+' ? 1 : -1), 9, 22); feuilles.forEach(f => { if (f.table) f.table.style.fontSize = taille + 'px'; }); }
      else if (a === 'info') { const l = $('.dv-limites'); l.hidden = !l.hidden; }
      else if (a === 'onglet') ouvrirFeuille(Number(b.dataset.i));
    });
    inst.detruire = () => { instances.delete(inst); };
    inst.redim = null;
    /* Aller à « Feuille!B12 » : charge les lignes nécessaires, défile, entoure la cellule. */
    inst.aller = async ref => {
      if (!meta) return; let i = fi;
      if (ref.feuille != null) { const k = typeof ref.feuille === 'number' ? ref.feuille : meta.feuilles.findIndex(x => x.nom.toLowerCase() === String(ref.feuille).toLowerCase()); if (k >= 0) i = k; }
      if (i !== fi || !feuilles[i].table) await ouvrirFeuille(i);
      if (!ref.cellule) return; const m = /^([A-Za-z]{1,3})(\d{1,7})$/.exec(String(ref.cellule).trim()); if (!m) return;
      const f = feuilles[i]; let c = 0; for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64); c -= 1; const r = Number(m[2]) - 1;
      if (r >= f.total || c >= f.colonnes) return;
      let garde = 0; while (f.charge <= r && garde++ < 60) await chargerFenetre(f, f.charge, 500);
      const tr = f.tbody.querySelector(`tr[data-r="${r}"]`); if (!tr) return;
      let td = tr.querySelector(`td[data-c="${c}"]`); if (!td) { /* cellule couverte par une fusion : on prend la cellule d'origine de la ligne */ td = tr.querySelector('td'); }
      if (!td) return; choisir(f, r, Number(td.dataset.c), td); zone.scrollTo({ top: Math.max(0, tr.offsetTop - zone.clientHeight / 3), left: Math.max(0, td.offsetLeft - zone.clientWidth / 3) });
      td.classList.remove('dv-pulse'); void td.offsetWidth; td.classList.add('dv-pulse');
    };
    json(`${o.base}/classeur?${o.params}`).then(async m => {
      meta = m; m.feuilles.forEach(f => feuilles.push({ i: f.i }));
      $('.dv-onglets').innerHTML = m.feuilles.map((f, k) => `<button type="button" class="dv-onglet" role="tab" data-a="onglet" data-i="${k}" aria-selected="${k === 0}">${esc(f.nom)}</button>`).join('');
      $('.dv-limites').innerHTML = '<strong>Limites d\'affichage</strong><ul>' + (m.limites || []).map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>';
      await ouvrirFeuille(0);
    }).catch(e => messageErreur(zone, e.message, e.code === 'non_integre' ? null : o.telechargement));
    return inst;
  }

  /* ═══════════ Bloc de document de cours ═══════════ */
  function TrainingDocumentBlock(host, o) {
    const params = [o.element ? 'element=' + encodeURIComponent(o.element) : '', o.brouillon ? 'brouillon=1' : ''].filter(Boolean).join('&');
    const suffixe = params ? '?' + params : '';
    host.classList.add('dv-bloc'); host.innerHTML = '<div class="dv-etat">Chargement du document…</div>';
    return json(`${o.base}/infos${suffixe}`).then(info => {
      const dl = info.peut_telecharger ? `${o.base}/telecharger${suffixe}` : null; const nom = o.nom || info.nom;
      host.innerHTML = '';
      if (info.erreur) { messageErreur(host, info.erreur.message, dl); return null; }
      if (!info.integre) { host.innerHTML = `<div class="dv-carte"><span>${info.famille === 'pdf' ? '📕' : '📗'}</span><div><strong>${esc(nom)}</strong><small>Document à télécharger</small></div>${dl ? `<a class="dv-b dv-lien" href="${esc(dl)}" download>⬇ Télécharger</a>` : ''}</div>`; return null; }
      const hauteur = o.hauteur || info.hauteur;
      if (info.famille === 'pdf') return InlinePDFViewer(host, { src: `${o.base}/fichier${suffixe}`, nom, hauteur, telechargement: dl });
      if (info.famille === 'excel') return InlineExcelViewer(host, { base: o.base, params, nom, hauteur, telechargement: dl });
      messageErreur(host, 'Ce type de fichier ne peut pas s\'afficher dans la page.', dl); return null;
    }).catch(e => { messageErreur(host, e.message || 'Document indisponible.'); return null; });
  }

  /* Liens « aller à… » (p:3 · p:3:mot · c:Feuille!B12 · c:B12) */
  document.addEventListener('click', ev => {
    const a = ev.target.closest('[data-doc-aller]'); if (!a) return; ev.preventDefault();
    const v = a.getAttribute('data-doc-aller') || ''; const cible = derniere && instances.has(derniere) ? derniere : [...instances][0]; if (!cible) return;
    let ref = null;
    if (v.startsWith('p:')) { const [, p, ...mot] = v.split(':'); ref = { page: Number(p), recherche: mot.join(':') || undefined }; }
    else if (v.startsWith('c:')) { const t = v.slice(2); const k = t.lastIndexOf('!'); ref = k >= 0 ? { feuille: t.slice(0, k), cellule: t.slice(k + 1) } : { cellule: t }; }
    if (ref) { const h = cible.host; h.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); cible.aller(ref); }
  });

  window.DocViewer = { monter: TrainingDocumentBlock, InlinePDFViewer, InlineExcelViewer, TrainingDocumentBlock,
    contexte: () => dernierContexte, aller: (ref, i) => { const c = i || derniere || [...instances][0]; return c ? c.aller(ref) : Promise.resolve(); }, instances };
})();
