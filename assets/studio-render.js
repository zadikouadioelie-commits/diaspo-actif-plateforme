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
  const PAGE_W = 1280, PAGE_H = 720, FLUX_W = 900, SEUIL_ETROIT = 720;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const TEXTE = ['titre', 'soustitre', 'paragraphe', 'citation', 'encadre'];
  const ESPACE = { titre: 'Votre titre', soustitre: 'Votre sous-titre', paragraphe: 'Écrivez votre texte ici…', citation: 'Une citation…', encadre: 'Un point important à retenir…' };

  /* Affichage adapté au téléphone : un texte posé pour une page de 1280 px est réduit (40 px → 28 px) mais jamais sous 15 px. */
  const tailleAdaptee = t => (t > 18 ? Math.round(Math.max(15, 18 + (t - 18) * 0.45)) : Math.max(15, t));
  /* Ordre de lecture d'une page libre : de haut en bas, et de gauche à droite pour les éléments posés sur la même rangée (à moins de 40 px d'écart). */
  function ordreLecture(elements) {
    const tri = (elements || []).slice().sort((a, b) => ((a.y || 0) - (b.y || 0)) || ((a.x || 0) - (b.x || 0)) || ((a.z || 0) - (b.z || 0)));
    const rangees = [];
    tri.forEach(e => { const r = rangees[rangees.length - 1]; if (r && (e.y || 0) < r.y0 + 40) r.els.push(e); else rangees.push({ y0: e.y || 0, els: [e] }); });
    return rangees.flatMap(r => r.els.sort((a, b) => ((a.x || 0) - (b.x || 0)) || ((a.y || 0) - (b.y || 0))));
  }

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
    if (['mp4', 'mov', 'm4v'].includes(x)) return 'video';
    if (['doc', 'docx'].includes(x)) return 'word';
    if (['ppt', 'pptx'].includes(x)) return 'ppt';
    return 'autre';
  }
  const FAMILLES = { video: ['🎬', 'Vidéo'], pdf: ['📕', 'Document PDF'], image: ['🖼️', 'Image'], excel: ['📗', 'Tableur Excel'], word: ['📘', 'Document Word'], ppt: ['📙', 'Présentation PowerPoint'], autre: ['📄', 'Fichier'] };
  const placeholder = (icone, texte) => `<div class="st-ph"><span>${icone}</span><small>${esc(texte)}</small></div>`;

  /* Contenu d'un élément. ctx = { edit: bool, lecture: bool } */
  function inner(e, ctx) {
    const p = e.props || {};
    if (TEXTE.includes(e.type)) {
      const st = [];
      if (p.police) st.push(`font-family:${p.police}`);
      if (p.taille) st.push(`font-size:${ctx.adapte ? tailleAdaptee(Number(p.taille)) : Number(p.taille)}px`);
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
        const c = p.crop;
        if (c && c.ratio > 0 && c.w > 0 && c.h > 0) {
          /* Recadrage : on montre seulement la partie (x, y, w, h en % de l'image) ; la proportion de la partie est conservée, jamais déformée. */
          const img = `<img src="${esc(p.url)}" alt="${esc(p.alt)}" draggable="false" style="position:absolute;left:${-c.x * 100 / c.w}%;top:${-c.y * 100 / c.h}%;width:${10000 / c.w}%;height:${10000 / c.h}%;max-width:none;max-height:none;flex:none">`;
          return `<figure class="st-fig st-fig-crop" style="align-items:${al}"><div class="st-cropbox" style="justify-content:${al}"><div class="st-crop" style="--r:${Number(c.ratio)};border-radius:${Number(p.rayon) || 0}px">${img}</div></div>${p.legende ? `<figcaption>${esc(p.legende)}</figcaption>` : ''}</figure>`;
        }
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
      case 'audio': {
        /* Audio privé (lot K) : lu par la plateforme (accès contrôlé), jamais par son adresse de stockage ; téléchargeable seulement si le formateur l'a permis. */
        const prive = /^(prive|document):/.test(String(p.url || ''));
        const base = ctx.docBase && !ctx.edit ? `${ctx.docBase}%S?element=${encodeURIComponent(e.id)}${ctx.brouillon ? '&brouillon=1' : ''}` : '';
        const src = prive ? (base ? base.replace('%S', '/audio') : '') : p.url;
        const dlOk = prive && base && p.telechargeable !== false;
        return p.url ? `<div class="st-audio${ctx.edit ? ' st-inerte' : ''}">${p.titre ? `<div class="st-audio-t">🎧 ${esc(p.titre)}</div>` : ''}<audio controls preload="none" ${prive && p.telechargeable === false ? 'controlsList="nodownload"' : ''} ${src ? `src="${esc(src)}"` : ''}></audio>${dlOk ? `<a class="st-audio-dl" href="${esc(base.replace('%S', '/telecharger'))}" target="_blank" rel="noopener noreferrer" download>⬇ Télécharger l'audio</a>` : ''}</div>` : placeholder('🎧', 'Audio à ajouter');
      }
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
      case 'fichier': {
        /* Fichier privé (lot I) : le lien passe par le serveur, qui contrôle l'accès ; une adresse https publique reste un lien direct. */
        const prive = /^(prive|document):/.test(String(p.url || '')) && ctx.docBase;
        const lienF = prive ? `${ctx.docBase}/telecharger?element=${encodeURIComponent(e.id)}${ctx.brouillon ? '&brouillon=1' : ''}` : p.url;
        return p.url
          ? `<div class="st-file"><span class="st-file-i">${FAMILLES[typeFichier(p.url)][0]}</span><div class="st-file-t"><strong>${esc(p.nom) || 'Fichier'}</strong>${p.description ? `<small>${esc(p.description)}</small>` : ''}</div>${ctx.edit ? '<span class="st-file-b">Télécharger</span>' : `<a class="st-file-b" href="${esc(lienF)}" target="_blank" rel="noopener noreferrer" download>Télécharger</a>`}</div>`
          : placeholder('📎', 'Fichier à ajouter');
      }
      case 'document': {
        if (!p.url) return placeholder('📄', 'Document à ajouter');
        const fam = typeFichier(p.url), F = FAMILLES[fam];
        const integre = p.integre !== undefined ? !!p.integre : p.mode !== 'telechargement';
        const telech = p.telechargeable !== undefined ? !!p.telechargeable : p.mode === 'telechargement';
        /* En lecture, le téléchargement passe par le serveur (autorisation du formateur) ; dans l'éditeur ou l'aperçu simple, l'adresse directe. */
        const lienDl = ctx.docBase ? `${ctx.docBase}/telecharger?element=${encodeURIComponent(e.id)}${ctx.brouillon ? '&brouillon=1' : ''}` : p.url;
        if (integre && (fam === 'pdf' || fam === 'excel')) {
          if (ctx.docBase && !ctx.edit) return `<div class="st-docview" data-element="${esc(e.id)}" data-nom="${esc(p.nom)}" data-hauteur="${Number(p.hauteur) || 640}"></div>`;
          return `<div class="st-docpre"><span>${F[0]}</span><div><strong>${esc(p.nom) || F[1]}</strong><small>${F[1]} · affiché dans la page${telech ? ' · téléchargeable' : ''} · hauteur ${Number(p.hauteur) || 640} px</small></div></div>`;
        }
        const carte = `<div class="st-file"><span class="st-file-i">${F[0]}</span><div class="st-file-t"><strong>${esc(p.nom) || F[1]}</strong><small>${F[1]} · à télécharger</small></div>${ctx.edit ? '<span class="st-file-b">Télécharger</span>' : (ctx.docBase && !telech ? '<span class="st-file-b" style="opacity:.55">Non téléchargeable</span>' : `<a class="st-file-b" href="${esc(lienDl)}" target="_blank" rel="noopener noreferrer" download>Télécharger</a>`)}</div>`;
        if (!integre) return carte;
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
    const st = ll ? `left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;z-index:${e.z || 1}` : ctx.adapte ? '' : `max-width:${Math.min(e.w || FLUX_W, FLUX_W)}px`;
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
    const fond = page.fond ? `background:${esc(page.fond)};` : '';
    /* « adapte » : une page libre lue sur un écran étroit est remise en colonne, dans l'ordre de lecture, au lieu d'être réduite. */
    if (mode === 'adapte') {
      const c = Object.assign({}, ctx, { adapte: true });
      return `<div class="st-page st-flux st-adapte" data-page="${esc(page.id)}" style="${fond}">${ordreLecture(page.elements).map(e => elHtml(e, 'structure', c)).join('')}</div>`;
    }
    const els = (page.elements || []).map(e => elHtml(e, mode, ctx)).join('');
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
    /* Vidéos à regarder (fichiers lus par la page : pas YouTube) et état du visionnage de chaque vidéo suivie : morceaux de 5 s réellement regardés. */
    const seuil = Number(opts.seuil) || 90;
    const videosReq = pages.flatMap(p => (p.elements || []).filter(e => e.type === 'video' && (e.props || {}).exiger && e.props.url && !ytId(e.props.url)).map(e => e.id));
    const etats = {};
    Object.keys(opts.videos || {}).forEach(k => { const v = opts.videos[k]; etats[k] = { segs: String(v.segments || '').split(''), pct: Number(v.pct) || 0, srv: Number(v.pct) || 0, position: Number(v.position) || 0, dernierEnvoi: 0 }; });
    /* Une vidéo compte comme regardée quand le SERVEUR l'a confirmé (sinon la validation de la leçon partirait avant l'enregistrement et serait refusée). */
    const videosOk = () => opts.apercu || videosReq.every(id => { const e = etats[id]; return e && (opts.videoSauver ? e.srv : e.pct) >= seuil; });
    container.innerHTML = `<div class="st-lect">
      <div class="st-lect-nav"><button type="button" class="st-nb" data-n="-1" aria-label="Page précédente">‹</button><span class="st-lect-pos" aria-live="polite"></span><button type="button" class="st-nb" data-n="1" aria-label="Page suivante">›</button></div>
      <div class="st-lect-mode" hidden><button type="button" class="st-lien-mode"></button></div>
      <div class="st-lect-vue"><div class="st-lect-echelle"></div></div>
    </div>`;
    const vue = container.querySelector('.st-lect-vue'), ech = container.querySelector('.st-lect-echelle'), pos = container.querySelector('.st-lect-pos'), basc = container.querySelector('.st-lect-mode');
    /* Page libre sur écran étroit : affichage adapté (colonne) par défaut, la mise en page d'origine reste un bouton. */
    let origine = false, affMode = mode;
    const etroit = () => mode === 'libre' && vue.clientWidth > 0 && vue.clientWidth < SEUIL_ETROIT;
    const modeVu = () => (etroit() && !origine ? 'adapte' : mode);
    function echelle() {
      if (modeVu() !== affMode) { afficher(i); return; }
      basc.hidden = !etroit(); basc.firstChild.textContent = origine ? '📱 Affichage adapté au téléphone' : '🖥️ Voir la mise en page d’origine';
      if (affMode !== 'libre') { ech.style.transform = ''; ech.style.width = ''; vue.style.height = ''; return; }
      const s = Math.min(1, vue.clientWidth / PAGE_W || 1);
      ech.style.transformOrigin = 'top left'; ech.style.transform = `scale(${s})`; ech.style.width = PAGE_W + 'px';
      vue.style.height = Math.round(hauteurPage(pages[i], 'libre') * s) + 'px';
    }
    function progres() {
      const fin = i === pages.length - 1 || vues.size === pages.length;
      const ok = requis.every(id => valides.has(id)) && videosOk();
      if (opts.onProgress) opts.onProgress({ vue: vues.size, total: pages.length, validations: valides.size, validations_total: requis.length, videos_requises: videosReq.length, videos_ok: videosReq.filter(id => etats[id] && (opts.videoSauver ? etats[id].srv : etats[id].pct) >= seuil).length, termine: fin && vues.size === pages.length && ok });
    }
    /* Documents PDF / Excel intégrés : visionneuse chargée à la demande (assets/doc-viewer.js). */
    const docs = [];
    function monterDocuments(racine) {
      docs.splice(0).forEach(d => { try { d.detruire && d.detruire(); } catch (_) { /* sans importance */ } });
      if (!opts.docBase || !window.DocViewer) return;
      racine.querySelectorAll('.st-docview').forEach(n => {
        Promise.resolve(window.DocViewer.monter(n, { base: opts.docBase, element: n.dataset.element, nom: n.dataset.nom || undefined, hauteur: Number(n.dataset.hauteur) || undefined, brouillon: !!opts.brouillon })).then(inst => { if (inst) docs.push(inst); });
      });
    }
    /* Suivi d'une vidéo : seuls les morceaux lus en continu comptent (un saut dans la vidéo ne coche rien) ; envoi régulier, à la pause et à la fin. */
    function badge(v, id) {
      if (!videosReq.includes(id)) return null;
      const box = v.closest('.st-video'); if (!box) return null;
      let b = box.querySelector('.st-video-etat');
      if (!b) { b = document.createElement('div'); b.className = 'st-video-etat'; b.setAttribute('role', 'status'); box.appendChild(b); }
      const e = etats[id] || { pct: 0 };
      b.classList.toggle('ok', e.pct >= seuil);
      b.textContent = e.pct >= seuil ? '✓ Vidéo regardée' : `À regarder en entier : ${e.pct} % vu (${seuil} % demandés)`;
      return b;
    }
    function suivreVideos(racine) {
      racine.querySelectorAll('video[data-suivi]').forEach(v => {
        const holder = v.closest('.st-el'); const id = holder && holder.dataset.id; if (!id) return;
        const e = etats[id] || (etats[id] = { segs: null, pct: 0, srv: 0, position: 0, dernierEnvoi: 0 });
        let n = 0, dernierT = null, aEnvoyer = false;
        const init = () => {
          if (!isFinite(v.duration) || v.duration <= 0) return false;
          n = Math.min(1000, Math.max(1, Math.ceil(v.duration / 5)));
          if (!e.segs || e.segs.length !== n) e.segs = new Array(n).fill('0');
          return true;
        };
        const pourcent = () => Math.floor(e.segs.filter(c => c === '1').length * 100 / e.segs.length);
        const envoyer = () => {
          if (!aEnvoyer || !e.segs || !opts.videoSauver || opts.apercu) return;
          aEnvoyer = false; e.dernierEnvoi = Date.now();
          Promise.resolve(opts.videoSauver(id, { segments: e.segs.join(''), position: v.currentTime || 0, duree: v.duration || 0 })).then(r => {
            if (r && typeof r.pct === 'number') { e.pct = Math.max(e.pct, r.pct); e.srv = Math.max(e.srv, r.pct); badge(v, id); progres(); }
          }).catch(() => { aEnvoyer = true; });
        };
        badge(v, id);
        v.addEventListener('loadedmetadata', () => { if (init() && e.position > 5 && e.position < v.duration - 3) { try { v.currentTime = e.position; } catch (_) { /* sans importance */ } } });
        v.addEventListener('timeupdate', () => {
          if (v.paused || v.seeking || !init()) return;
          const t = v.currentTime;
          if (dernierT != null && Math.abs(t - dernierT) <= 1.6) {
            const k = Math.min(n - 1, Math.floor(t / (v.duration / n)));
            if (e.segs[k] !== '1') { e.segs[k] = '1'; aEnvoyer = true; const p = pourcent(); if (p > e.pct) { const franchi = p >= seuil && e.pct < seuil; e.pct = p; badge(v, id); if (franchi) envoyer(); else progres(); } }
          }
          dernierT = t;
          if (aEnvoyer && Date.now() - e.dernierEnvoi > 10000) envoyer();
        });
        v.addEventListener('seeking', () => { dernierT = null; });
        v.addEventListener('pause', () => { dernierT = null; envoyer(); });
        v.addEventListener('ended', () => { dernierT = null; envoyer(); });
      });
    }
    function afficher(n) {
      i = Math.max(0, Math.min(pages.length - 1, n)); vues.add(i);
      affMode = modeVu();
      ech.innerHTML = pageHtml(pages[i], affMode, { lecture: true, apercu: !!opts.apercu, docBase: opts.docBase, brouillon: !!opts.brouillon });
      monterDocuments(ech);
      ech.querySelectorAll('input[data-valid]').forEach(c => { c.checked = valides.has(c.dataset.valid); });
      suivreVideos(ech);
      pos.textContent = pages.length > 1 ? `Page ${i + 1} / ${pages.length}` : '';
      container.querySelector('.st-lect-nav').style.display = pages.length > 1 ? '' : 'none';
      container.querySelector('[data-n="-1"]').disabled = i === 0;
      container.querySelector('[data-n="1"]').disabled = i === pages.length - 1;
      echelle(); progres();
      if (opts.onPage) opts.onPage(ech, i);
    }
    container.addEventListener('click', ev => {
      if (ev.target.closest('.st-lien-mode')) { origine = !origine; afficher(i); return; }
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
    return { destroy() { if (ro) ro.disconnect(); docs.splice(0).forEach(d => { try { d.detruire && d.detruire(); } catch (_) { /* sans importance */ } }); }, goTo: afficher };
  }

  window.StudioRender = { PAGE_W, PAGE_H, FLUX_W, TEXTE, esc, ytId, typeFichier, FAMILLES, inner, elHtml, pageHtml, hauteurPage, lecture };
})();
