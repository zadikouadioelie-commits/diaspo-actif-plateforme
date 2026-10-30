/* ═════════════════════════════════════════════════
   assets/studio-render.js — Formation Diaspora : rendu d'un module « studio » (lot D, 2026-10-30)

   Un seul rendu pour trois usages : l'éditeur (assets/studio-engine.js), l'aperçu du formateur et la lecture par l'apprenant (suivre-formation.html).
   Le document est { mode: "libre" | "structure", pages: [{ id, titre, fond, elements: [{ id, type, x, y, w, h, z, locked, props }] }] }.
   - libre      : chaque élément est posé en x / y / largeur / hauteur sur une page de 1280 px de large (mise à l'échelle à l'écran).
   - structure  : les éléments sont empilés dans l'ordre du tableau ; x / y sont conservés pour pouvoir repasser en mode libre sans rien perdre.
   Le texte riche arrive DÉJÀ nettoyé par le serveur (liste blanche) ; toutes les autres valeurs sont échappées ici.
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  const PAGE_W = 1280, PAGE_H = 720, FLUX_W = 900;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const TEXTE = ['titre', 'soustitre', 'paragraphe', 'citation', 'encadre'];
  const ESPACE = { titre: 'Votre titre', soustitre: 'Votre sous-titre', paragraphe: 'Écrivez votre texte ici…', citation: 'Une citation…', encadre: 'Un point important à retenir…' };

  function ytId(url) {
    const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : '';
  }
  /* Famille d'un fichier d'après son extension (le serveur n'accepte que PDF, Word, Excel, PowerPoint et images pour les documents). */
  function typeFichier(url) {
    const m = String(url || '').split('?')[0].split('#')[0].match(/\.([a-z0-9]{2,5})$/i), x = m ? m[1].toLowerCase() : '';
    if (x === 'pdf') return 'pdf';
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(x)) return 'image';
    if (['xls', 'xlsx'].includes(x)) return 'excel';
    if (['doc', 'docx'].includes(x)) return 'word';
    if (['ppt', 'pptx'].includes(x)) return 'ppt';
    return 'autre';
  }
  const FAMILLES = { pdf: ['📕', 'Document PDF'], image: ['🖼️', 'Image'], excel: ['📗', 'Tableur Excel'], word: ['📘', 'Document Word'], ppt: ['📙', 'Présentation PowerPoint'], autre: ['📄', 'Fichier'] };
  const placeholder = (icone, texte) => `<div class="st-ph"><span>${icone}</span><small>${esc(texte)}</small></div>`;

  /* Contenu d'un élément. ctx = { edit: bool, lecture: bool } */
  function inner(e, ctx) {
    const p = e.props || {};
    if (TEXTE.includes(e.type)) {
      const st = [];
      if (p.police) st.push(`font-family:${p.police}`);
      if (p.taille) st.push(`font-size:${Number(p.taille)}px`);
      if (p.couleur) st.push(`color:${esc(p.couleur)}`);
      if (p.fond) st.push(`background:${esc(p.fond)}`);
      if (p.align) st.push(`text-align:${esc(p.align)}`);
      if (p.interligne) st.push(`line-height:${Number(p.interligne)}`);
      if (p.gras) st.push('font-weight:700');
      const vide = !p.html || !String(p.html).replace(/<[^>]*>/g, '').trim();
      return `<div class="st-txt st-txt-${e.type}${vide && ctx.edit ? ' st-vide' : ''}" style="${st.join(';')}" data-ph="${esc(ESPACE[e.type])}">${p.html || ''}</div>`;
    }
    switch (e.type) {
      case 'image': {
        if (!p.url) return placeholder('🖼️', 'Image à ajouter');
        const al = p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center';
        return `<figure class="st-fig" style="align-items:${al}"><img src="${esc(p.url)}" alt="${esc(p.alt)}" draggable="false" style="object-fit:${p.ajust === 'cover' ? 'cover' : 'contain'};border-radius:${Number(p.rayon) || 0}px">${p.legende ? `<figcaption>${esc(p.legende)}</figcaption>` : ''}</figure>`;
      }
      case 'video': {
        if (!p.url) return placeholder('🎬', 'Vidéo à ajouter');
        const id = ytId(p.url);
        const cadre = id
          ? `<iframe src="https://www.youtube.com/embed/${esc(id)}" title="${esc(p.titre || 'Vidéo')}" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`
          : `<video controls preload="metadata" ${p.miniature ? `poster="${esc(p.miniature)}"` : ''} src="${esc(p.url)}" ${ctx.edit ? '' : 'data-suivi="1"'}></video>`;
        return `<div class="st-video${ctx.edit ? ' st-inerte' : ''}">${cadre}</div>`;
      }
      case 'audio':
        return p.url ? `<div class="st-audio${ctx.edit ? ' st-inerte' : ''}">${p.titre ? `<div class="st-audio-t">🎧 ${esc(p.titre)}</div>` : ''}<audio controls preload="none" src="${esc(p.url)}"></audio></div>` : placeholder('🎧', 'Audio à ajouter');
      case 'separateur':
        return `<div class="st-sep"><hr style="border:0;border-top:${Number(p.epaisseur) || 2}px ${p.style === 'pointille' ? 'dotted' : p.style === 'double' ? 'double' : 'solid'} ${esc(p.couleur) || '#e6b84a'}"></div>`;
      case 'lien':
        return `<a class="st-lien" ${ctx.edit || !p.url ? '' : `href="${esc(p.url)}" target="_blank" rel="noopener noreferrer"`}>🔗 ${esc(p.libelle) || 'Lien à renseigner'}</a>`;
      case 'bouton': {
        const st = `background:${esc(p.couleur) || '#e6b84a'};color:${esc(p.couleur_texte) || '#0b1226'};border-radius:${Number(p.rayon) || 0}px`;
        const lib = esc(p.libelle) || 'Bouton';
        if (ctx.edit) return `<span class="st-btn" style="${st}">${lib}</span>`;
        if (p.action === 'page') return `<button type="button" class="st-btn" style="${st}" data-goto="${esc(p.page)}">${lib}</button>`;
        if (!p.url) return `<span class="st-btn" style="${st};opacity:.6">${lib}</span>`;
        return `<a class="st-btn" style="${st}" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${lib}</a>`;
      }
      case 'fichier':
        return p.url
          ? `<div class="st-file"><span class="st-file-i">${FAMILLES[typeFichier(p.url)][0]}</span><div class="st-file-t"><strong>${esc(p.nom) || 'Fichier'}</strong>${p.description ? `<small>${esc(p.description)}</small>` : ''}</div>${ctx.edit ? '<span class="st-file-b">Télécharger</span>' : `<a class="st-file-b" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" download>Télécharger</a>`}</div>`
          : placeholder('📎', 'Fichier à ajouter');
      case 'document': {
        if (!p.url) return placeholder('📄', 'Document à ajouter');
        const fam = typeFichier(p.url), F = FAMILLES[fam];
        const carte = `<div class="st-file"><span class="st-file-i">${F[0]}</span><div class="st-file-t"><strong>${esc(p.nom) || F[1]}</strong><small>${F[1]} · à télécharger</small></div>${ctx.edit ? '<span class="st-file-b">Télécharger</span>' : `<a class="st-file-b" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" download>Télécharger</a>`}</div>`;
        if (p.mode !== 'lecteur') return carte;
        if (fam === 'image') return `<figure class="st-fig"><img src="${esc(p.url)}" alt="${esc(p.nom)}" draggable="false" style="object-fit:contain">${p.nom ? `<figcaption>${esc(p.nom)}</figcaption>` : ''}</figure>`;
        if (fam !== 'pdf') return carte;
        return `<div class="st-doc${ctx.edit ? ' st-inerte' : ''}"><iframe src="${esc(p.url)}#toolbar=1&view=FitH" title="${esc(p.nom) || 'Document PDF'}" loading="lazy"></iframe>${ctx.edit ? '' : `<a class="st-doc-dl" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" download>⬇ Télécharger le document</a>`}</div>`;
      }
      case 'quiz':
        if (ctx.edit || ctx.apercu) return `<div class="st-quizcard"><span>📝</span><div><strong>${esc(p.libelle) || (p.quiz_id ? 'Activité évaluée' : 'Quiz / questionnaire / exercice')}</strong><small>${p.quiz_id ? (ctx.apercu ? 'Les apprenants passent cette activité ici (sa correction est faite par le serveur).' : 'Cliquez pour modifier les questions et les réglages.') : 'À créer : choisissez le type d\'activité dans le panneau de droite.'}</small></div></div>`;
        return '<div id="sf-quiz-zone" class="st-quiz-slot"></div>';
      case 'tableau': {
        const l = Array.isArray(p.lignes) ? p.lignes : [];
        const corps = l.map((r, i) => `<tr>${r.map(c => (i === 0 && p.entete !== false ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('');
        return `<div class="st-table-w"><table class="st-table">${corps}</table></div>`;
      }
      case 'validation':
        return `<label class="st-valid"><input type="checkbox" data-valid="${esc(e.id)}" data-oblig="${p.obligatoire === false ? 0 : 1}" ${ctx.edit ? 'disabled' : ''}><span>${esc(p.libelle) || 'J\'ai terminé cette activité'}</span></label>`;
    }
    return '';
  }

  function elHtml(e, mode, ctx) {
    const ll = mode === 'libre';
    const st = ll ? `left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;z-index:${e.z || 1}` : `max-width:${Math.min(e.w || FLUX_W, FLUX_W)}px`;
    const largeur = !ll && ['image', 'video', 'tableau', 'bouton', 'lien', 'fichier', 'audio', 'validation', 'document', 'quiz'].includes(e.type);
    return `<div class="st-el st-t-${e.type}${e.locked ? ' st-lock' : ''}${largeur ? ' st-flux-' + (e.type === 'image' ? 'img' : e.type === 'video' ? 'vid' : 'bloc') : ''}" data-id="${esc(e.id)}" data-type="${esc(e.type)}" style="${st}">${inner(e, ctx)}${ctx.edit && e.locked ? '<span class="st-lockbadge" title="Élément verrouillé">🔒</span>' : ''}</div>`;
  }

  function hauteurPage(page, mode) {
    if (mode !== 'libre') return 0;
    let bas = PAGE_H;
    (page.elements || []).forEach(e => { bas = Math.max(bas, (e.y || 0) + (e.h || 0) + 40); });
    return Math.min(bas, 6000);
  }

  /* HTML d'une page. ctx : { edit } */
  function pageHtml(page, mode, ctx) {
    ctx = ctx || {};
    const els = (page.elements || []).map(e => elHtml(e, mode, ctx)).join('');
    const fond = page.fond ? `background:${esc(page.fond)};` : '';
    if (mode === 'libre') return `<div class="st-page st-libre" data-page="${esc(page.id)}" style="${fond}width:${PAGE_W}px;height:${hauteurPage(page, mode)}px">${els}</div>`;
    return `<div class="st-page st-flux" data-page="${esc(page.id)}" style="${fond}max-width:${FLUX_W}px">${els || (ctx.edit ? '<div class="st-vide-page">Glissez un outil ici pour commencer cette page</div>' : '')}</div>`;
  }

  /* Lecture interactive (apprenant, aperçu) : navigation page à page, boutons « aller à la page », zones de validation.
     opts : { onProgress({vue, total, validations, validations_total, termine}), titre } — renvoie { destroy, goTo }. */
  function lecture(container, doc, opts) {
    opts = opts || {};
    const pages = doc.pages || [];
    const mode = doc.mode === 'libre' ? 'libre' : 'structure';
    let i = 0, vues = new Set([0]);
    const valides = new Set();
    const requis = pages.flatMap(p => (p.elements || []).filter(e => e.type === 'validation' && (e.props || {}).obligatoire !== false).map(e => e.id));
    container.innerHTML = `<div class="st-lect">
      <div class="st-lect-nav"><button type="button" class="st-nb" data-n="-1" aria-label="Page précédente">‹</button><span class="st-lect-pos" aria-live="polite"></span><button type="button" class="st-nb" data-n="1" aria-label="Page suivante">›</button></div>
      <div class="st-lect-vue"><div class="st-lect-echelle"></div></div>
    </div>`;
    const vue = container.querySelector('.st-lect-vue'), ech = container.querySelector('.st-lect-echelle'), pos = container.querySelector('.st-lect-pos');
    function echelle() {
      if (mode !== 'libre') { ech.style.transform = ''; ech.style.width = ''; vue.style.height = ''; return; }
      const s = Math.min(1, vue.clientWidth / PAGE_W || 1);
      ech.style.transformOrigin = 'top left'; ech.style.transform = `scale(${s})`; ech.style.width = PAGE_W + 'px';
      vue.style.height = Math.round(hauteurPage(pages[i], mode) * s) + 'px';
    }
    function progres() {
      const fin = i === pages.length - 1 || vues.size === pages.length;
      const ok = requis.every(id => valides.has(id));
      if (opts.onProgress) opts.onProgress({ vue: vues.size, total: pages.length, validations: valides.size, validations_total: requis.length, termine: fin && vues.size === pages.length && ok });
    }
    function afficher(n) {
      i = Math.max(0, Math.min(pages.length - 1, n)); vues.add(i);
      ech.innerHTML = pageHtml(pages[i], mode, { lecture: true, apercu: !!opts.apercu });
      ech.querySelectorAll('input[data-valid]').forEach(c => { c.checked = valides.has(c.dataset.valid); });
      pos.textContent = pages.length > 1 ? `Page ${i + 1} / ${pages.length}` : '';
      container.querySelector('.st-lect-nav').style.display = pages.length > 1 ? '' : 'none';
      container.querySelector('[data-n="-1"]').disabled = i === 0;
      container.querySelector('[data-n="1"]').disabled = i === pages.length - 1;
      echelle(); progres();
      if (opts.onPage) opts.onPage(ech, i);
    }
    container.addEventListener('click', ev => {
      const nb = ev.target.closest('.st-nb'); if (nb) { afficher(i + Number(nb.dataset.n)); return; }
      const g = ev.target.closest('[data-goto]'); if (g) { const k = pages.findIndex(p => p.id === g.dataset.goto); if (k >= 0) afficher(k); }
    });
    container.addEventListener('change', ev => {
      const c = ev.target.closest('input[data-valid]'); if (!c) return;
      if (c.checked) valides.add(c.dataset.valid); else valides.delete(c.dataset.valid);
      progres();
    });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(echelle) : null;
    if (ro) ro.observe(vue);
    afficher(0);
    return { destroy() { if (ro) ro.disconnect(); }, goTo: afficher };
  }

  window.StudioRender = { PAGE_W, PAGE_H, FLUX_W, TEXTE, esc, ytId, typeFichier, FAMILLES, inner, elHtml, pageHtml, hauteurPage, lecture };
})();
