/* ============================================================
   Diaspo'Actif — Version téléphone : module « Mon Associé »
   Équivalent téléphone de mon-associe.html, mêmes routes d'API (/api/mon-associe/*).
   Routes :  #/associe                 fil d'annonces (recherche, filtres, favoris)
             #/associe/a/<id>          détail d'une annonce (candidater, favori)
             #/associe/mes             mes annonces
             #/associe/nouveau         publier une annonce
             #/associe/cand/<id>       candidatures reçues sur une de mes annonces
             #/associe/msg             conversations du module
             #/associe/c/<id>          une conversation
             #/associe/docs            mes dossiers (coffre de documents)
   Règles d'accès (appliquées par le serveur, reprises ici pour expliquer) :
   - tout le monde peut CONSULTER les annonces, même sans compte ;
   - Utilisateur : lecture seule (consulter, favoris) — ni candidature ni publication ;
   - Initiative / Collectivité : publier et candidater seulement si Premium actif.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, strip, ic, setPane, toast } = A;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* Listes identiques à celles de la page du site */
  const TYPES = [['recrutement', 'Recrutement'], ['associe', 'Associé'], ['partenaire', 'Partenaire'], ['benevole', 'Bénévole'], ['financeur', 'Financeur'], ['investisseur', 'Investisseur'], ['sponsor', 'Sponsor'], ['prestataire', 'Prestataire'], ['expert', 'Expert'], ['formateur', 'Formateur'], ['mentor', 'Mentor'], ['competences', 'Compétences'], ['autre', 'Autre']];
  const DOMAINES = [['tech', 'Tech'], ['agriculture', 'Agriculture'], ['sante', 'Santé'], ['energie', 'Énergie'], ['education', 'Éducation'], ['culture', 'Culture'], ['collectivites', 'Collectivités']];
  const lab = (list, k) => { const f = list.find(x => x[0] === k); return f ? f[1] : (k || ''); };
  const AUTEUR_ROLE = { utilisateur: 'Membre', initiative: 'Initiative', collectivite: 'Collectivité', administrateur: 'Diaspo’Actif' };

  /* ---------- état du module ---------- */
  const ST = {
    q: '', type: '', domaine: '', pays: '', fav: false, shown: 20,
    items: [], loaded: false, paysOpts: [], favs: new Set(), scroll: 0
  };
  let NAV = 0;          // jeton de navigation : un écran asynchrone obsolète ne doit jamais repeindre le panneau
  let chatTimer = null; // rafraîchissement automatique de la conversation ouverte

  /* ---------- CSS (injecté une seule fois) ---------- */
  function injectCss() {
    if ($('#m-mod-associe-css')) return;
    const st = document.createElement('style'); st.id = 'm-mod-associe-css';
    st.textContent = `
.mma-tabs{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 12px;margin:0 -2px;scrollbar-width:none}
.mma-tabs::-webkit-scrollbar{display:none}
.mma-card{position:relative}
.mma-card .mma-main{display:block;padding:14px 56px 12px 14px}
.mma-card h3{margin:0 0 4px;font-size:17px;line-height:1.25;word-break:break-word}
.mma-card .mma-desc{margin:0 0 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--muted);font-size:14px}
.mma-fav{position:absolute;top:6px;right:6px;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.mma-fav:active{background:rgba(13,43,78,.07)}
.mma-fav.on{color:var(--orange-d)}
.mma-fav.on svg{fill:currentColor}
.mma-fab{flex:none;width:52px;min-height:46px;padding:0}
.mma-fab.on{color:var(--orange-d);border-color:var(--orange-d)}
.mma-fab.on svg{fill:currentColor}
.mma-filters{display:flex;gap:8px;margin:0 0 10px}
.mma-in{width:100%;min-height:46px;padding:10px 14px;font-size:16px;border:1px solid var(--border);border-radius:12px;background:var(--card);color:var(--text);outline:none;font-family:inherit}
.mma-in:focus{border-color:var(--sky);box-shadow:0 0 0 3px rgba(68,144,226,.2)}
textarea.mma-in{resize:vertical;line-height:1.4;min-height:110px}
.mma-lbl{display:block;font-size:14px;font-weight:700;margin:14px 0 6px}
.mma-lbl small{font-weight:500;color:var(--muted)}
.mma-help{font-size:13px;color:var(--muted);margin:4px 2px 0}
.mma-err{color:var(--red);font-size:14px;margin:6px 2px 0;min-height:0}
.mma-err:empty{display:none}
.mma-warn{background:var(--orange-l);border:1px solid #F2C9A8;color:#7A3A12;border-radius:12px;padding:10px 12px;font-size:13.5px;margin:8px 0 0}
.mma-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.mma-acts .btn{padding:0 8px}
.mma-desc-full{white-space:pre-line;word-break:break-word;line-height:1.5}
.mma-cnt{font-size:13px;color:var(--muted);margin:0 4px 8px}
.mma-file{font-size:15px;width:100%}
.mma-dot{display:inline-flex;min-width:20px;height:20px;border-radius:10px;background:var(--orange-d);color:#fff;font-size:12px;font-weight:700;align-items:center;justify-content:center;padding:0 6px}
.mma-bub a{color:inherit;text-decoration:underline;word-break:break-all}
`;
    document.head.appendChild(st);
  }

  /* ---------- petits outils ---------- */
  const guard = () => { const my = ++NAV; return () => my === NAV && !!S.pane && S.pane.k === 'associe'; };
  function since(d) {
    const x = A.ago(d); if (!x) return '';
    if (x === 'à l’instant' || x === "à l'instant") return x;
    return /^\d+ (min|h|j)$/.test(x) ? 'il y a ' + x : 'le ' + x;
  }
  const fmtSize = n => { n = Number(n) || 0; if (!n) return ''; return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko'; };
  const isMine = a => !!S.me && Number(a.auteur_id) === Number(S.me.id);

  /* Affiche une erreur (avec « Réessayer ») dans un conteneur ; une session expirée devient une carte de connexion. */
  function fail(box, e, retry, title) {
    if (e && e.status === 401) {
      box.innerHTML = A.loginCard('Votre session a expiré. Reconnectez-vous pour continuer.');
      const g = $('#go-login', box); if (g) g.onclick = () => A.openLogin();
      return;
    }
    box.innerHTML = `<div class="empty"><div class="ei">${ic('close', 'l')}</div><b>${esc(title || 'Chargement impossible')}</b>${esc((e && e.message) || 'Une erreur est survenue.')}<br><br><button class="btn sm" data-retry>Réessayer</button></div>`;
    const b = $('[data-retry]', box); if (b) b.onclick = retry;
  }
  function paneFail(title, e, retry) { setPane(title, '<div id="ma-box"></div>'); fail($('#ma-box'), e, retry, 'Chargement impossible'); }
  function needLoginPane(title, texte) {
    setPane(title, A.loginCard(texte));
    const g = $('#go-login'); if (g) g.onclick = () => A.openLogin();
  }

  /* Barre d'onglets du module : on remplace l'entrée d'historique, pour que « retour » quitte le module. */
  function tabsHtml(active) {
    const t = [['', 'Annonces'], ['mes', 'Mes annonces'], ['msg', 'Messages'], ['docs', 'Dossiers']];
    return `<div class="mma-tabs" role="tablist">${t.map(([k, l]) => `<button class="chip ${active === k ? 'on' : ''}" role="tab" aria-selected="${active === k}" data-go="${k}">${l}</button>`).join('')}</div>`;
  }
  function wireTabs() {
    $$('#pane-body [data-go]').forEach(b => b.onclick = () => { location.replace('#/associe' + (b.dataset.go ? '/' + b.dataset.go : '')); });
  }

  /* Droits de publication / candidature, demandés au serveur à chaque action (jamais mémorisés : le Premium peut expirer). */
  async function getAccess() {
    try { return await api('/api/mon-associe/mon-acces'); }
    catch (e) { toast(e.message, true); return null; }
  }
  /* Explication pour un compte Utilisateur (lecture seule par conception, pas faute de Premium) */
  function infoLectureSeule(action) {
    const close = A.openSheet(`<div style="text-align:center;padding:6px 4px 10px"><div class="ei" style="width:64px;height:64px;border-radius:50%;background:var(--sky-l);color:var(--navy2);display:flex;align-items:center;justify-content:center;margin:4px auto 10px">${ic('lock', 'l')}</div>
      <h2 style="margin:0 0 6px;font-size:19px">${esc(action)} : comptes Initiative Premium</h2>
      <p class="muted" style="margin:0 0 14px">Votre compte Utilisateur permet de consulter toutes les annonces et de les mettre en favoris. Publier une annonce ou candidater est réservé aux comptes Initiative et Collectivité Premium.</p>
      <button class="btn block" id="ma-ok">J’ai compris</button></div>`);
    $('#ma-ok').onclick = close;
  }
  /* Vérifie le droit d'agir ; renvoie true si l'action peut continuer, sinon ouvre l'explication adaptée. */
  async function checkAccess(actionLabel, moduleLabel) {
    const acc = await getAccess(); if (!acc) return false;
    if (acc.peut_publier) return true;
    if (acc.lecture_seule || (S.me && S.me.role === 'utilisateur')) infoLectureSeule(actionLabel);
    else A.premiumSheet(moduleLabel);
    return false;
  }

  /* Envoi d'un fichier (CV, document, pièce jointe) — même route que le site, 15 Mo maximum. */
  async function uploadDoc(file) {
    if (file.size > 15 * 1024 * 1024) throw new Error('Ce fichier dépasse 15 Mo. Choisissez un fichier plus léger.');
    const fd = new FormData(); fd.append('document', file, file.name || 'document');
    let r;
    try { r = await fetch('/api/upload/document', { method: 'POST', body: fd, credentials: 'same-origin' }); }
    catch (e) { throw new Error('Connexion impossible. Vérifiez votre réseau.'); }
    let j = null; try { j = await r.json(); } catch (e) { /* réponse vide */ }
    if (!r.ok) throw new Error((j && j.error) || 'L’envoi du fichier a échoué. Réessayez.');
    return j.url;
  }

  /* ============================================================
     FIL D'ANNONCES
     ============================================================ */
  function annonceCard(a) {
    const nb = Number(a.nb_candidatures) || 0;
    const comp = (a.competences || []).slice(0, 3), reste = (a.competences || []).length - comp.length;
    const lieu = [a.localisation, a.pays].filter(Boolean).join(', ');
    const fav = ST.favs.has(Number(a.id));
    return `<article class="card mma-card" data-id="${Number(a.id)}">
      <a class="mma-main" href="#/associe/a/${Number(a.id)}">
        <div class="tags" style="margin:0 0 8px"><span class="badge">${esc(lab(TYPES, a.type_recherche))}</span>${a.domaine ? `<span class="badge g">${esc(lab(DOMAINES, a.domaine))}</span>` : ''}</div>
        <h3>${esc(a.titre)}</h3>
        <p class="mma-desc">${esc(strip(a.description || ''))}</p>
        ${comp.length ? `<div class="tags" style="margin:0 0 8px">${comp.map(c => `<span class="badge">${esc(c)}</span>`).join('')}${reste > 0 ? `<span class="badge">+${reste}</span>` : ''}</div>` : ''}
        <div class="meta"><span class="ell">Par <b style="color:var(--text)">${esc(a.auteur_nom || 'Membre')}</b> · ${esc(AUTEUR_ROLE[a.auteur_role] || '')}</span></div>
        ${lieu ? `<div class="meta">${ic('pin', 's')}<span class="ell">${esc(lieu)}</span></div>` : ''}
        <div class="meta">${ic('clock', 's')}<span>Publiée ${esc(since(a.created_at))} · ${nb} candidature${nb > 1 ? 's' : ''}</span></div>
      </a>
      <button class="mma-fav ${fav ? 'on' : ''}" data-fav="${Number(a.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${ic('heart')}</button></article>`;
  }

  /* Bascule favori (liste et détail). Renvoie le nouvel état, ou null si annulé / échec. */
  async function toggleFav(id) {
    if (!(await A.needLogin('Connectez-vous pour enregistrer des annonces en favoris.'))) return null;
    const was = ST.favs.has(id);
    try {
      await api(`/api/mon-associe/annonces/${id}/favori`, { method: was ? 'DELETE' : 'POST' });
      if (was) ST.favs.delete(id); else ST.favs.add(id);
      toast(was ? 'Retiré de vos favoris' : 'Ajouté à vos favoris ✓');
      return !was;
    } catch (e) { toast(e.message, true); return null; }
  }

  async function loadFavs() {
    if (!S.me) { ST.favs = new Set(); return; }
    try { ST.favs = new Set(((await api('/api/mon-associe/mes-favoris')).favoris || []).map(Number)); } catch (e) { /* facultatif : le cœur reste vide */ }
  }

  async function fetchList() {
    const p = new URLSearchParams();
    if (ST.q) p.set('q', ST.q);
    if (ST.type) p.set('type', ST.type);
    if (ST.domaine) p.set('domaine', ST.domaine);
    if (ST.pays) p.set('pays', ST.pays);
    const r = await api('/api/mon-associe/annonces' + (p.toString() ? '?' + p : ''));
    ST.items = r.annonces || []; ST.loaded = true;
    /* Liste des pays proposés : construite une fois, depuis une recherche sans filtre, car le serveur filtre le pays à l'identique. */
    if (!ST.q && !ST.type && !ST.domaine && !ST.pays) ST.paysOpts = [...new Set(ST.items.map(a => a.pays).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr'));
  }

  function paintList() {
    const box = $('#ma-list'); if (!box) return;
    let items = ST.items;
    if (ST.fav) items = items.filter(a => ST.favs.has(Number(a.id)));
    const cnt = $('#ma-count'); if (cnt) cnt.textContent = items.length ? items.length + ' annonce' + (items.length > 1 ? 's' : '') : '';
    const filtres = ST.q || ST.type || ST.domaine || ST.pays || ST.fav;
    if (!items.length) {
      box.innerHTML = `<div class="empty"><div class="ei">${ic('people', 'l')}</div><b>${ST.fav ? 'Aucun favori' : (filtres ? 'Aucune annonce ne correspond' : 'Aucune annonce pour le moment')}</b>${ST.fav ? 'Touchez le cœur d’une annonce pour la retrouver ici.' : (filtres ? 'Essayez d’autres mots-clés ou retirez un filtre.' : 'Revenez bientôt : de nouvelles annonces sont publiées régulièrement.')}${filtres ? '<br><br><button class="btn sm out" data-reset>Réinitialiser les filtres</button>' : ''}</div>`;
      const r = $('[data-reset]', box); if (r) r.onclick = resetFilters;
      $('#ma-more').innerHTML = ''; return;
    }
    box.innerHTML = items.slice(0, ST.shown).map(annonceCard).join('');
    $('#ma-more').innerHTML = items.length > ST.shown ? `<button class="btn out block" id="ma-next">Voir plus (${items.length - ST.shown})</button>` : '';
    const n = $('#ma-next'); if (n) n.onclick = () => { ST.shown += 20; paintList(); };
    $$('[data-fav]', box).forEach(b => b.onclick = async () => {
      const id = Number(b.dataset.fav), now = await toggleFav(id); if (now === null) return;
      if (ST.fav && !now) return paintList(); // dans la vue « Favoris », la carte disparaît
      b.classList.toggle('on', now); b.setAttribute('aria-pressed', String(now)); b.setAttribute('aria-label', now ? 'Retirer des favoris' : 'Ajouter aux favoris');
    });
    $$('.mma-main', box).forEach(l => l.addEventListener('click', () => { const pb = $('#pane-body'); ST.scroll = pb ? pb.scrollTop : 0; }));
  }

  function resetFilters() { ST.q = ST.type = ST.domaine = ST.pays = ''; ST.fav = false; ST.shown = 20; viewList(true); }

  async function reloadList() {
    const box = $('#ma-list'); if (box) box.innerHTML = '<div class="sk skc" style="height:150px"></div><div class="sk skc" style="height:150px"></div>';
    try { await fetchList(); await loadFavs(); paintList(); }
    catch (e) { if ($('#ma-list')) fail($('#ma-list'), e, reloadList, 'Annonces indisponibles'); }
  }

  async function viewList(fresh) {
    injectCss();
    const alive = guard();
    const filtreActif = ST.q || ST.type || ST.domaine || ST.pays;
    setPane('Mon Associé', `${tabsHtml('')}
      <div class="search">${ic('search', 's')}<input id="ma-q" type="search" enterkeyhint="search" placeholder="Titre, compétence, ville…" aria-label="Rechercher une annonce" value="${esc(ST.q)}"></div>
      <div class="chips" id="ma-types"><button class="chip ${!ST.type && !ST.fav ? 'on' : ''}" data-t="">Tout</button><button class="chip ${ST.fav ? 'on' : ''}" data-fav-only>${ic('heart', 's')} Favoris</button>${TYPES.map(([k, l]) => `<button class="chip ${ST.type === k ? 'on' : ''}" data-t="${k}">${esc(l)}</button>`).join('')}</div>
      <div class="mma-filters"><select class="mma-in" id="ma-dom" aria-label="Domaine"><option value="">Tous domaines</option>${DOMAINES.map(([k, l]) => `<option value="${k}" ${ST.domaine === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <select class="mma-in" id="ma-pays" aria-label="Pays de réalisation"><option value="">Tous pays</option>${ST.paysOpts.map(p => `<option value="${esc(p)}" ${ST.pays === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
      <div class="mma-cnt" id="ma-count"></div><div id="ma-list"></div><div id="ma-more"></div>`,
      `<button class="btn block" id="ma-publier">${ic('plus', 's')} Publier une annonce</button>`);
    wireTabs();
    let t; $('#ma-q').oninput = e => { clearTimeout(t); t = setTimeout(() => { ST.q = e.target.value.trim(); ST.shown = 20; reloadList(); }, 350); };
    $$('#ma-types [data-t]').forEach(b => b.onclick = () => { ST.type = b.dataset.t; ST.fav = false; ST.shown = 20; viewList(true); });
    $('#ma-types [data-fav-only]').onclick = () => { ST.fav = !ST.fav; if (ST.fav) ST.type = ''; ST.shown = 20; viewList(true); };
    $('#ma-dom').onchange = e => { ST.domaine = e.target.value; ST.shown = 20; reloadList(); };
    $('#ma-pays').onchange = e => { ST.pays = e.target.value; ST.shown = 20; reloadList(); };
    $('#ma-publier').onclick = startPublish;
    /* Retour depuis un détail : on réaffiche la liste connue tout de suite (et le défilement), puis on actualise discrètement. */
    if (ST.loaded && !fresh && !filtreActif) {
      paintList(); const pb = $('#pane-body'); if (pb) pb.scrollTop = ST.scroll || 0;
      try { await fetchList(); await loadFavs(); if (alive()) paintList(); } catch (e) { /* on garde l'affichage précédent */ }
      return;
    }
    const box = $('#ma-list'); box.innerHTML = '<div class="sk skc" style="height:150px"></div><div class="sk skc" style="height:150px"></div>';
    try { await fetchList(); await loadFavs(); } catch (e) { if (alive()) fail(box, e, () => viewList(true), 'Annonces indisponibles'); return; }
    if (!alive()) return;
    /* La liste des pays vient d'être découverte : on complète le sélecteur sans toucher au reste de l'écran. */
    const ps = $('#ma-pays');
    if (ps && ps.options.length <= 1 && ST.paysOpts.length) ps.innerHTML = '<option value="">Tous pays</option>' + ST.paysOpts.map(p => `<option value="${esc(p)}" ${ST.pays === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
    paintList();
  }

  /* ============================================================
     DÉTAIL D'UNE ANNONCE
     ============================================================ */
  async function findAnnonce(id) {
    let a = ST.items.find(x => Number(x.id) === id);
    if (a) return a;
    await fetchList().catch(() => { });
    a = ST.items.find(x => Number(x.id) === id);
    if (a) return a;
    /* Une de mes annonces clôturée n'est plus dans la liste publique : on la retrouve dans « Mes annonces ». */
    if (S.me) { try { a = ((await api('/api/mon-associe/mes-annonces')).annonces || []).find(x => Number(x.id) === id); } catch (e) { /* introuvable */ } }
    return a || null;
  }

  async function viewDetail(rawId) {
    injectCss();
    const alive = guard(); const id = Number(rawId);
    setPane('Annonce', '<div class="sk skc" style="height:260px"></div>');
    let a;
    try { a = await findAnnonce(id); } catch (e) { if (alive()) paneFail('Annonce', e, () => viewDetail(rawId)); return; }
    if (!alive()) return;
    if (!a) return setPane('Annonce', `<div class="empty"><div class="ei">${ic('people', 'l')}</div><b>Annonce introuvable</b>Elle a peut-être été clôturée ou retirée par son auteur.<br><br><a class="btn" href="#/associe">Voir les annonces</a></div>`);
    if (S.me && !ST.favs.size) await loadFavs();
    if (!alive()) return;
    const mine = isMine(a), fav = ST.favs.has(id), nb = Number(a.nb_candidatures) || 0;
    const clos = a.statut === 'cloturee';
    const kv = [['Localisation', a.localisation], ['Pays de réalisation', a.pays], ['Durée de la mission', a.duree_mission], ['Budget ou rémunération', a.budget]].filter(x => x[1]);
    const html = `<div class="card"><div class="pad">
        <div class="tags" style="margin:0 0 10px"><span class="badge">${esc(lab(TYPES, a.type_recherche))}</span>${a.domaine ? `<span class="badge g">${esc(lab(DOMAINES, a.domaine))}</span>` : ''}${clos ? '<span class="badge r">Clôturée</span>' : ''}</div>
        <h2 style="margin:0 0 6px;font-size:21px;line-height:1.25;word-break:break-word">${esc(a.titre)}</h2>
        <div class="meta">${ic('clock', 's')}<span>Publiée ${esc(since(a.created_at))} · ${nb} candidature${nb > 1 ? 's' : ''}</span></div></div></div>
      <div class="card"><div class="pad mma-desc-full">${A.linkify(strip(a.description || '')) || '<span class="muted">Aucune description.</span>'}</div></div>
      ${kv.length ? `<div class="card"><div class="pad">${kv.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div></div>` : ''}
      ${(a.competences || []).length ? `<div class="h2">COMPÉTENCES ET PROFILS RECHERCHÉS</div><div class="card"><div class="pad"><div class="tags" style="margin:0">${a.competences.map(c => `<span class="badge">${esc(c)}</span>`).join('')}</div></div></div>` : ''}
      ${mine ? '' : `<div class="h2">PUBLIÉE PAR</div><div class="card"><div class="pad row"><div class="av">${a.auteur_photo ? `<img src="${A.attrUrl(a.auteur_photo)}" alt="" onerror="this.remove()">` : esc(A.initials(a.auteur_nom))}</div><div class="sp"><b>${esc(a.auteur_nom || 'Membre')}</b><div class="small muted">${esc(AUTEUR_ROLE[a.auteur_role] || '')}</div></div><a class="btn sm out" href="profil.html?id=${encodeURIComponent(a.auteur_id)}">Voir le profil</a></div></div>`}`;
    const foot = mine
      ? `<a class="btn block" href="#/associe/cand/${id}">Voir les candidatures${nb ? ' (' + nb + ')' : ''}</a>`
      : `<button class="btn out mma-fab ${fav ? 'on' : ''}" id="ma-fav" aria-pressed="${fav}" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${ic('heart')}</button><button class="btn sp" id="ma-apply">Candidater</button>`;
    setPane('Annonce', html, foot);
    const f = $('#ma-fav'); if (f) f.onclick = async () => {
      const now = await toggleFav(id); if (now === null) return;
      f.classList.toggle('on', now); f.setAttribute('aria-pressed', String(now)); f.setAttribute('aria-label', now ? 'Retirer des favoris' : 'Ajouter aux favoris');
    };
    const ap = $('#ma-apply'); if (ap) ap.onclick = () => startApply(a, id);
  }

  /* ---------- candidater ---------- */
  async function startApply(a, id) {
    if (!(await A.needLogin('Connectez-vous pour candidater à cette annonce.'))) return;
    if (!(await checkAccess('Candidater', 'Mon Associé — candidater'))) return;
    const close = A.openSheet(`<h2 style="margin:0 0 4px;font-size:19px">Candidater</h2>
      <p class="muted small" style="margin:0 0 4px">Pour : <b style="color:var(--text)">${esc(a.titre)}</b></p>
      <form id="ma-capply" novalidate>
        <label class="mma-lbl" for="ma-cmsg">Votre message <small>(facultatif)</small></label>
        <textarea class="mma-in" id="ma-cmsg" maxlength="2000" placeholder="Présentez-vous et expliquez ce qui vous intéresse dans cette annonce…"></textarea>
        <label class="mma-lbl" for="ma-ccv">CV ou présentation <small>(facultatif · PDF ou Word, 15 Mo max)</small></label>
        <input class="mma-file" id="ma-ccv" type="file" accept=".pdf,.doc,.docx,application/pdf">
        <div class="mma-err" id="ma-cerr" role="alert"></div>
        <button class="btn block" type="submit" id="ma-csend" style="margin-top:16px">Envoyer ma candidature</button>
        <button class="btn out block" type="button" id="ma-ccancel" style="margin-top:10px">Annuler</button></form>`);
    $('#ma-ccancel').onclick = close;
    $('#ma-capply').onsubmit = async ev => {
      ev.preventDefault();
      const err = $('#ma-cerr'), btn = $('#ma-csend'); err.textContent = '';
      btn.disabled = true; btn.textContent = 'Envoi en cours…';
      try {
        let cv_url = null; const file = $('#ma-ccv').files[0];
        if (file) cv_url = await uploadDoc(file);
        await api(`/api/mon-associe/annonces/${id}/candidater`, { method: 'POST', body: { message: $('#ma-cmsg').value.trim() || null, cv_url } });
        close(); toast('Candidature envoyée ✓');
        ST.loaded = false; if (S.pane && S.pane.k === 'associe') viewDetail(id);
      } catch (e) {
        if (e.data && e.data.premium_requis) { close(); A.premiumSheet('Mon Associé — candidater'); return; }
        err.textContent = e.message; btn.disabled = false; btn.textContent = 'Envoyer ma candidature';
      }
    };
  }

  /* ============================================================
     MES ANNONCES
     ============================================================ */
  async function startPublish() {
    if (!(await A.needLogin('Connectez-vous pour publier une annonce.'))) return;
    if (!(await checkAccess('Publier une annonce', 'Mon Associé — publier une annonce'))) return;
    location.hash = '#/associe/nouveau';
  }

  function mesCard(a) {
    const clos = a.statut === 'cloturee', nb = Number(a.nb_candidatures) || 0, nn = Number(a.nb_nouvelles) || 0;
    return `<article class="card"><a class="pad" style="display:block" href="#/associe/cand/${Number(a.id)}">
        <div class="tags" style="margin:0 0 6px"><span class="badge ${clos ? '' : 'g'}">${clos ? 'Clôturée' : 'En ligne'}</span><span class="badge">${esc(lab(TYPES, a.type_recherche))}</span></div>
        <h3 style="margin:0 0 6px;font-size:17px;line-height:1.25;word-break:break-word">${esc(a.titre)}</h3>
        <div class="row small"><span class="muted">${nb} candidature${nb > 1 ? 's' : ''}</span>${nn ? `<span class="mma-dot">${nn} nouvelle${nn > 1 ? 's' : ''}</span>` : ''}<span class="sp"></span><span class="muted">${esc(since(a.created_at))}</span></div>
        ${a.masquee_non_premium && !clos ? `<div class="mma-warn">${ic('lock', 's')} Cette annonce est masquée aux autres membres tant que votre Premium n’est pas actif. Elle réapparaîtra dès son renouvellement.</div>` : ''}</a>
      <div class="mma-acts" style="margin:0;padding:0 14px 14px"><a class="btn sm out" href="#/associe/a/${Number(a.id)}">Voir l’annonce</a><span style="display:flex;gap:8px">${clos ? '' : `<button class="btn sm out sp" data-clo="${Number(a.id)}">Clôturer</button>`}<button class="btn sm out sp" data-del="${Number(a.id)}" style="color:var(--red)">Supprimer</button></span></div></article>`;
  }

  async function viewMes() {
    injectCss();
    const alive = guard();
    if (!S.me) return needLoginPane('Mon Associé', 'Connectez-vous pour retrouver vos annonces et les candidatures reçues.');
    const foot = `<button class="btn block" id="ma-publier">${ic('plus', 's')} Publier une annonce</button>`;
    setPane('Mon Associé', `${tabsHtml('mes')}<div id="ma-box"><div class="sk skc" style="height:120px"></div><div class="sk skc" style="height:120px"></div></div>`, foot);
    wireTabs(); $('#ma-publier').onclick = startPublish;
    let list;
    try { list = (await api('/api/mon-associe/mes-annonces')).annonces || []; }
    catch (e) { if (alive()) fail($('#ma-box'), e, viewMes, 'Annonces indisponibles'); return; }
    if (!alive()) return;
    const box = $('#ma-box');
    if (!list.length) {
      box.innerHTML = `<div class="empty"><div class="ei">${ic('people', 'l')}</div><b>Vous n’avez publié aucune annonce</b>Publiez une annonce pour trouver un associé, un partenaire, un bénévole ou un expert.</div>`;
      return;
    }
    box.innerHTML = list.map(mesCard).join('');
    $$('[data-clo]', box).forEach(b => b.onclick = async () => {
      if (!confirm('Clôturer cette annonce ? Elle ne sera plus visible ni ouverte aux candidatures.')) return;
      b.disabled = true;
      try { await api(`/api/mon-associe/annonces/${b.dataset.clo}/cloturer`, { method: 'PATCH', body: {} }); toast('Annonce clôturée'); ST.loaded = false; viewMes(); }
      catch (e) { toast(e.message, true); b.disabled = false; }
    });
    $$('[data-del]', box).forEach(b => b.onclick = async () => {
      if (!confirm('Supprimer définitivement cette annonce et toutes ses candidatures ? Cette action est irréversible.')) return;
      b.disabled = true;
      try { await api(`/api/mon-associe/annonces/${b.dataset.del}`, { method: 'DELETE' }); toast('Annonce supprimée'); ST.loaded = false; viewMes(); }
      catch (e) { toast(e.message, true); b.disabled = false; }
    });
  }

  /* ---------- publier une annonce ---------- */
  async function viewNew() {
    injectCss();
    const alive = guard();
    if (!S.me) return needLoginPane('Publier une annonce', 'Connectez-vous pour publier une annonce.');
    setPane('Publier une annonce', '<div class="sk skc" style="height:300px"></div>');
    const acc = await getAccess();
    if (!alive()) return;
    if (!acc || !acc.peut_publier) {
      const ro = acc && (acc.lecture_seule || S.me.role === 'utilisateur');
      setPane('Publier une annonce', `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Publication réservée</b>${acc ? (ro ? 'La publication d’annonces est réservée aux comptes Initiative et Collectivité Premium. Votre compte Utilisateur peut consulter les annonces.' : 'La publication d’annonces fait partie de l’offre Premium.') : 'Impossible de vérifier vos droits pour le moment.'}<br><br><a class="btn" href="#/associe/mes">Retour à mes annonces</a></div>`);
      if (acc && !ro) A.premiumSheet('Mon Associé — publier une annonce');
      return;
    }
    let validite = 30;
    setPane('Publier une annonce', `<form id="ma-form" novalidate>
      <label class="mma-lbl" for="n-type">Type de recherche</label>
      <select class="mma-in" id="n-type">${TYPES.map(([k, l]) => `<option value="${k}" ${k === 'associe' ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <label class="mma-lbl" for="n-dom">Domaine <small>(facultatif)</small></label>
      <select class="mma-in" id="n-dom"><option value="">Aucun domaine précis</option>${DOMAINES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
      <label class="mma-lbl" for="n-titre">Titre de l’annonce</label>
      <input class="mma-in" id="n-titre" maxlength="150" placeholder="Ex. : Cherche associé technique pour startup agritech" autocomplete="off">
      <div class="mma-err" id="e-titre" role="alert"></div>
      <label class="mma-lbl" for="n-desc">Description</label>
      <textarea class="mma-in" id="n-desc" rows="5" placeholder="Décrivez votre besoin en détail : le projet, le profil recherché, ce que vous proposez…"></textarea>
      <div class="mma-err" id="e-desc" role="alert"></div>
      <label class="mma-lbl" for="n-loc">Ville ou région <small>(facultatif)</small></label>
      <input class="mma-in" id="n-loc" maxlength="120" autocomplete="off">
      <label class="mma-lbl" for="n-pays">Pays de réalisation <small>(facultatif)</small></label>
      <input class="mma-in" id="n-pays" maxlength="80" list="n-pays-l" autocomplete="off" placeholder="Ex. : Côte d’Ivoire">
      <datalist id="n-pays-l">${ST.paysOpts.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      <label class="mma-lbl" for="n-duree">Durée de la mission <small>(facultatif)</small></label>
      <input class="mma-in" id="n-duree" maxlength="80" placeholder="Ex. : 6 mois" autocomplete="off">
      <label class="mma-lbl" for="n-budget">Budget ou rémunération <small>(facultatif)</small></label>
      <input class="mma-in" id="n-budget" maxlength="120" placeholder="Ex. : à négocier, 500 000 FCFA…" autocomplete="off">
      <label class="mma-lbl" for="n-comp">Compétences ou profils recherchés <small>(facultatif)</small></label>
      <input class="mma-in" id="n-comp" placeholder="développeur, designer, comptable…" autocomplete="off">
      <div class="mma-help">Séparez-les par une virgule.</div>
      <div class="mma-lbl">Durée de validité</div>
      <div class="chips" id="n-val" style="flex-wrap:wrap;overflow:visible">${[15, 30, 60, 90].map(v => `<button type="button" class="chip ${v === validite ? 'on' : ''}" data-v="${v}">${v} jours</button>`).join('')}</div>
      <div class="mma-err" id="e-form" role="alert"></div></form>`,
      `<button class="btn block" type="submit" form="ma-form" id="ma-save">Publier l’annonce</button>`);
    $$('#n-val .chip').forEach(c => c.onclick = () => { validite = Number(c.dataset.v); $$('#n-val .chip').forEach(x => x.classList.toggle('on', x === c)); });
    $('#ma-form').onsubmit = async ev => {
      ev.preventDefault();
      ['e-titre', 'e-desc', 'e-form'].forEach(i => { $('#' + i).textContent = ''; });
      const titre = $('#n-titre').value.trim(), description = $('#n-desc').value.trim();
      let bad = false;
      if (!titre) { $('#e-titre').textContent = 'Donnez un titre à votre annonce.'; bad = true; }
      if (!description) { $('#e-desc').textContent = 'Décrivez votre besoin pour que les candidats vous comprennent.'; bad = true; }
      if (bad) { const f = !titre ? $('#n-titre') : $('#n-desc'); f.focus(); return; }
      const btn = $('#ma-save'); btn.disabled = true; btn.textContent = 'Publication…';
      try {
        await api('/api/mon-associe/annonces', { method: 'POST', body: {
          type_recherche: $('#n-type').value, domaine: $('#n-dom').value || null, titre, description,
          localisation: $('#n-loc').value.trim() || null, pays: $('#n-pays').value.trim() || null,
          duree_mission: $('#n-duree').value.trim() || null, budget: $('#n-budget').value.trim() || null,
          competences: $('#n-comp').value.split(',').map(s => s.trim()).filter(Boolean), validite_jours: validite
        } });
        toast('Annonce publiée ✓'); ST.loaded = false;
        location.replace('#/associe/mes');
      } catch (e) {
        if (e.data && e.data.premium_requis) { A.premiumSheet('Mon Associé — publier une annonce'); }
        else $('#e-form').textContent = e.message;
        btn.disabled = false; btn.textContent = 'Publier l’annonce';
      }
    };
  }

  /* ============================================================
     CANDIDATURES REÇUES SUR UNE ANNONCE
     ============================================================ */
  const CAND_ST = { nouveau: ['Nouvelle', 'o'], retenu: ['Retenue', 'g'], refuse: ['Écartée', ''] };
  async function viewCand(rawId) {
    injectCss();
    const alive = guard(); const id = Number(rawId);
    if (!S.me) return needLoginPane('Candidatures', 'Connectez-vous pour consulter les candidatures de vos annonces.');
    setPane('Candidatures', '<div class="sk skc" style="height:120px"></div><div class="sk skc" style="height:120px"></div>');
    let cands, annonce = null;
    try {
      const [rc, rm] = await Promise.all([api(`/api/mon-associe/annonces/${id}/candidatures`), api('/api/mon-associe/mes-annonces').catch(() => ({ annonces: [] }))]);
      cands = rc.candidatures || []; annonce = (rm.annonces || []).find(x => Number(x.id) === id) || null;
    } catch (e) {
      if (!alive()) return;
      if (e.status === 403 || e.status === 404) return setPane('Candidatures', `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>${e.status === 404 ? 'Annonce introuvable' : 'Accès réservé'}</b>${esc(e.message)}<br><br><a class="btn" href="#/associe/mes">Mes annonces</a></div>`);
      return paneFail('Candidatures', e, () => viewCand(rawId));
    }
    if (!alive()) return;
    let filtre = '';
    const draw = () => {
      const n = s => cands.filter(c => c.statut === s).length;
      const list = cands.filter(c => !filtre || c.statut === filtre);
      const pb0 = $('#pane-body'), y0 = pb0 ? pb0.scrollTop : 0; // on garde la position de lecture après une action
      setPane('Candidatures', `${annonce ? `<div class="card"><div class="pad"><div class="tags" style="margin:0 0 6px"><span class="badge ${annonce.statut === 'cloturee' ? '' : 'g'}">${annonce.statut === 'cloturee' ? 'Clôturée' : 'En ligne'}</span></div><b style="word-break:break-word">${esc(annonce.titre)}</b></div></div>` : ''}
        <div class="chips">${[['', 'Toutes', cands.length], ['nouveau', 'Nouvelles', n('nouveau')], ['retenu', 'Retenues', n('retenu')], ['refuse', 'Écartées', n('refuse')]].map(([k, l, c]) => `<button class="chip ${filtre === k ? 'on' : ''}" data-f="${k}">${l} <span class="n">${c}</span></button>`).join('')}</div>
        ${list.length ? list.map(candCard).join('') : `<div class="empty"><div class="ei">${ic('people', 'l')}</div><b>${cands.length ? 'Aucune candidature dans cette catégorie' : 'Aucune candidature pour le moment'}</b>${cands.length ? '' : 'Les réponses des membres à votre annonce apparaîtront ici.'}</div>`}`);
      $$('#pane-body [data-f]').forEach(b => b.onclick = () => { filtre = b.dataset.f; draw(); });
      $$('#pane-body [data-st]').forEach(b => b.onclick = () => changeStatut(Number(b.dataset.c), b.dataset.st, b));
      $$('#pane-body [data-rep]').forEach(b => b.onclick = () => repondre(Number(b.dataset.rep)));
      const pb1 = $('#pane-body'); if (pb1) pb1.scrollTop = y0;
    };
    const reload = async () => {
      try { cands = (await api(`/api/mon-associe/annonces/${id}/candidatures`)).candidatures || []; if (alive()) draw(); }
      catch (e) { toast(e.message, true); }
    };
    const changeStatut = async (cid, statut, btn) => {
      if (statut === 'refuse' && !confirm('Écarter cette candidature ? Le candidat en sera informé.')) return;
      btn.disabled = true;
      try { await api(`/api/mon-associe/candidatures/${cid}/statut`, { method: 'PATCH', body: { statut } }); toast(statut === 'retenu' ? 'Candidature retenue ✓' : (statut === 'refuse' ? 'Candidature écartée' : 'Remise à traiter')); await reload(); }
      catch (e) { toast(e.message, true); btn.disabled = false; }
    };
    const repondre = cid => {
      const c = cands.find(x => Number(x.id) === cid); if (!c) return;
      const close = A.openSheet(`<h2 style="margin:0 0 4px;font-size:19px">Répondre à ${esc(c.nom || 'ce candidat')}</h2>
        <p class="muted small" style="margin:0">Votre message ouvre une conversation privée dans Mon Associé.</p>
        <form id="ma-rep" novalidate><label class="mma-lbl" for="ma-rmsg">Votre message</label>
        <textarea class="mma-in" id="ma-rmsg" maxlength="2000" placeholder="Bonjour, merci pour votre candidature…"></textarea>
        <div class="mma-err" id="ma-rerr" role="alert"></div>
        <button class="btn block" type="submit" id="ma-rsend" style="margin-top:16px">Envoyer le message</button>
        <button class="btn out block" type="button" id="ma-rcancel" style="margin-top:10px">Annuler</button></form>`);
      $('#ma-rcancel').onclick = close;
      $('#ma-rep').onsubmit = async ev => {
        ev.preventDefault();
        const msg = $('#ma-rmsg').value.trim(); if (!msg) { $('#ma-rerr').textContent = 'Écrivez votre message avant de l’envoyer.'; return; }
        const btn = $('#ma-rsend'); btn.disabled = true; btn.textContent = 'Envoi…';
        try { const r = await api(`/api/mon-associe/candidatures/${cid}/repondre`, { method: 'POST', body: { message: msg } }); close(); location.hash = '#/associe/c/' + r.conversation_id; }
        catch (e) { $('#ma-rerr').textContent = e.message; btn.disabled = false; btn.textContent = 'Envoyer le message'; }
      };
    };
    draw();
  }
  function candCard(c) {
    const [sl, sc] = CAND_ST[c.statut] || ['', ''];
    return `<article class="card"><div class="pad">
      <div class="row"><div class="av">${c.photo_url ? `<img src="${A.attrUrl(c.photo_url)}" alt="" onerror="this.remove()">` : esc(A.initials(c.nom))}</div>
        <div class="sp"><b class="ell" style="display:block">${esc(c.nom || 'Membre')}</b><div class="small muted ell">${esc([c.titre_pro, c.ville].filter(Boolean).join(' · ') || AUTEUR_ROLE[c.role] || '')}</div></div>
        <span class="badge ${sc}">${esc(sl)}</span></div>
      <div class="small muted" style="margin:8px 0 0">Reçue ${esc(since(c.created_at))}</div>
      ${c.message ? `<p style="margin:8px 0 0;white-space:pre-line;word-break:break-word">${esc(strip(c.message))}</p>` : '<p class="muted small" style="margin:8px 0 0">Aucun message joint.</p>'}
      ${c.cv_url ? `<a class="btn sm out" style="margin-top:10px" href="${A.attrUrl(c.cv_url)}" target="_blank" rel="noopener">${ic('doc', 's')} Voir le CV</a>` : ''}
      <div class="mma-acts"><button class="btn sm out" data-rep="${Number(c.id)}">${ic('chat', 's')} Répondre</button>
        ${c.statut === 'nouveau' ? `<button class="btn sm" data-st="retenu" data-c="${Number(c.id)}">${ic('check', 's')} Retenir</button><button class="btn sm out" data-st="refuse" data-c="${Number(c.id)}" style="grid-column:1/-1;color:var(--red)">Écarter</button>` : `<button class="btn sm out" data-st="nouveau" data-c="${Number(c.id)}">Remettre à traiter</button>`}</div>
      </div></article>`;
  }

  /* ============================================================
     MESSAGES DU MODULE (conversations indépendantes de la messagerie générale)
     ============================================================ */
  async function viewMsgs() {
    injectCss();
    const alive = guard();
    if (!S.me) return needLoginPane('Mon Associé', 'Connectez-vous pour lire vos messages Mon Associé.');
    setPane('Mon Associé', `${tabsHtml('msg')}<div id="ma-box"><div class="sk skc" style="height:70px"></div><div class="sk skc" style="height:70px"></div></div>`);
    wireTabs();
    let list;
    try { list = (await api('/api/mon-associe/conversations')).conversations || []; }
    catch (e) { if (alive()) fail($('#ma-box'), e, viewMsgs, 'Messages indisponibles'); return; }
    if (!alive()) return;
    $('#ma-box').innerHTML = list.length ? `<div class="lst">${list.map(c => `<a class="conv ${c.non_lus > 0 ? 'unread' : ''}" href="#/associe/c/${Number(c.id)}"><div class="av">${c.avec_photo ? `<img src="${A.attrUrl(c.avec_photo)}" alt="" onerror="this.remove()">` : esc(A.initials(c.avec_nom))}</div>
        <div class="sp"><div class="row"><span class="nm ell sp">${esc(c.avec_nom)}</span><span class="tm">${esc(A.ago(c.derniere_date))}</span></div><div class="pv ell">${esc(strip(c.derniere || 'Nouvelle conversation'))}</div></div>${c.non_lus > 0 ? `<span class="unr">${Number(c.non_lus)}</span>` : ''}</a>`).join('')}</div>`
      : `<div class="empty"><div class="ei">${ic('chat', 'l')}</div><b>Aucune conversation</b>Une conversation démarre quand l’auteur d’une annonce répond à une candidature. Candidatez à une annonce pour échanger avec son auteur.<br><br><a class="btn" href="#/associe">Voir les annonces</a></div>`;
  }

  async function viewChat(rawId) {
    injectCss();
    const alive = guard(); const id = Number(rawId);
    if (!S.me) return needLoginPane('Conversation', 'Connectez-vous pour lire cette conversation.');
    setPane('Conversation', '<div class="sk skc" style="height:80px"></div>');
    const url = `/api/mon-associe/conversations/${id}/messages`;
    let built = false;
    const bubble = m => {
      const mine = Number(m.sender_id) === Number(S.me.id);
      let body;
      if (m.deleted) body = '<i style="opacity:.75">Message supprimé</i>';
      else if (m.type === 'file' || m.type === 'image') {
        let f = {}; try { f = JSON.parse(m.fichier_json || '{}'); } catch (e) { f = {}; }
        const u = A.attrUrl(f.url);
        body = u ? `📎 <a href="${u}" target="_blank" rel="noopener">${esc(f.nom || m.contenu || 'Pièce jointe')}</a>` : `📎 ${esc(f.nom || m.contenu || 'Pièce jointe')}`;
      } else body = esc(m.contenu || '');
      return `<div class="b mma-bub ${mine ? 'out' : 'in'}">${body}<time>${esc(A.hhmm(m.created_at))}</time></div>`;
    };
    const render = async (scroll) => {
      let r;
      try { r = await api(url); }
      catch (e) {
        if (!alive()) return;
        if (!built) { clearInterval(chatTimer); return setPane('Conversation', `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Conversation inaccessible</b>${esc(e.message)}<br><br><a class="btn" href="#/associe/msg">Mes messages</a></div>`); }
        return; // erreur passagère pendant le rafraîchissement : on garde l'écran
      }
      if (!alive()) { clearInterval(chatTimer); return; }
      const msgs = r.messages || []; let last = '', html = '';
      msgs.forEach(m => { const d = A.dayLabel(m.created_at); if (d !== last) { html += `<div class="day">${esc(d)}</div>`; last = d; } html += bubble(m); });
      if (!html) html = '<div class="empty"><b>Aucun message</b>Écrivez le premier message.</div>';
      if (!built) {
        built = true;
        setPane((r.autre && r.autre.nom) || 'Conversation', `<div class="chat" id="ma-chat">${html}</div>`,
          `<form class="composer" id="ma-comp" style="width:100%;border:none;background:none"><button class="send" type="button" id="ma-att" aria-label="Joindre un fichier" style="background:var(--sky-l);color:var(--navy2)">${ic('doc')}</button><input type="file" id="ma-attf" hidden><textarea id="ma-msg" rows="1" placeholder="Votre message…" aria-label="Votre message"></textarea><button class="send" aria-label="Envoyer" id="ma-sendb" disabled>${ic('send')}</button></form>`);
        const f = $('#pane-foot'); if (f) f.style.padding = '0';
        wireComposer(id, render);
        const b = $('#pane-body'); if (b) b.scrollTop = b.scrollHeight;
        return;
      }
      const chat = $('#ma-chat'), b = $('#pane-body'); if (!chat || !b) return;
      const near = b.scrollHeight - b.scrollTop - b.clientHeight < 120;
      chat.innerHTML = html; if (scroll || near) b.scrollTop = b.scrollHeight;
    };
    await render(true);
    clearInterval(chatTimer);
    if (built) chatTimer = setInterval(() => { if (alive()) render(false); else clearInterval(chatTimer); }, 8000);
  }
  function wireComposer(id, render) {
    const ta = $('#ma-msg'), btn = $('#ma-sendb'), post = body => api(`/api/mon-associe/conversations/${id}/messages`, { method: 'POST', body });
    ta.oninput = () => { btn.disabled = !ta.value.trim(); ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; };
    $('#ma-comp').onsubmit = async ev => {
      ev.preventDefault(); const t = ta.value.trim(); if (!t) return; btn.disabled = true;
      try { await post({ contenu: t }); ta.value = ''; ta.style.height = 'auto'; await render(true); }
      catch (e) { toast(e.message, true); btn.disabled = false; }
    };
    $('#ma-att').onclick = () => $('#ma-attf').click();
    $('#ma-attf').onchange = async e => {
      const file = e.target.files[0]; e.target.value = ''; if (!file) return;
      toast('Envoi du fichier…');
      try { const url = await uploadDoc(file); await post({ fichier: { nom: file.name, url, isImage: /^image\//.test(file.type) } }); await render(true); }
      catch (er) { toast(er.message, true); }
    };
  }

  /* ============================================================
     MES DOSSIERS (coffre de documents)
     ============================================================ */
  let staged = null; // document choisi mais pas encore enregistré (choisir ≠ envoyer, comme sur le site)
  async function viewDocs() {
    injectCss();
    const alive = guard();
    if (!S.me) return needLoginPane('Mon Associé', 'Connectez-vous pour accéder à votre coffre de documents.');
    staged = null;
    setPane('Mon Associé', `${tabsHtml('docs')}<input type="file" id="ma-docf" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp"><div id="ma-staged"></div><div id="ma-box"><div class="sk skc" style="height:100px"></div></div>`,
      `<button class="btn block" id="ma-docadd">${ic('plus', 's')} Ajouter un document</button>`);
    wireTabs();
    $('#ma-docadd').onclick = () => $('#ma-docf').click();
    $('#ma-docf').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; staged = f; paintStaged(); };
    const paintStaged = () => {
      const z = $('#ma-staged'); if (!z) return;
      z.innerHTML = staged ? `<div class="card"><div class="pad"><div style="font-weight:700;word-break:break-word">${ic('doc', 's')} ${esc(staged.name)}</div><div class="small muted">${esc(fmtSize(staged.size))} · en attente d’enregistrement</div>
        <div class="mma-acts"><button class="btn sm" id="ma-dsave">Enregistrer</button><button class="btn sm out" id="ma-dcancel">Annuler</button></div></div></div>` : '';
      const s = $('#ma-dsave'), c = $('#ma-dcancel');
      if (c) c.onclick = () => { staged = null; paintStaged(); };
      if (s) s.onclick = async () => {
        const f = staged; s.disabled = true; s.textContent = 'Envoi…';
        try { const url = await uploadDoc(f); await api('/api/mon-associe/documents', { method: 'POST', body: { nom: f.name, url, taille: f.size } }); staged = null; toast('Document enregistré ✓'); load(); paintStaged(); }
        catch (er) { toast(er.message, true); s.disabled = false; s.textContent = 'Enregistrer'; }
      };
    };
    const load = async () => {
      let list;
      try { list = (await api('/api/mon-associe/documents')).documents || []; }
      catch (e) { if (alive()) fail($('#ma-box'), e, load, 'Documents indisponibles'); return; }
      if (!alive()) return;
      const box = $('#ma-box');
      if (!list.length) { box.innerHTML = `<div class="empty"><div class="ei">${ic('file', 'l')}</div><b>Aucun document</b>Ajoutez vos business plans, présentations et dossiers pour les transmettre facilement à vos contacts.</div>`; return; }
      box.innerHTML = list.map(d => `<article class="card"><div class="pad">
        <div class="row"><span class="ic" style="width:42px;height:42px;border-radius:12px;background:var(--sky-l);color:var(--navy2);display:flex;align-items:center;justify-content:center;flex:none">${ic('file')}</span>
          <div class="sp"><b style="display:block;word-break:break-word">${esc(d.nom)}</b><div class="small muted">${esc(d.kind || 'Document')}${d.taille ? ' · ' + esc(fmtSize(d.taille)) : ''}</div></div>
          <span class="badge ${d.visibilite === 'sur_demande' ? 'g' : ''}">${d.visibilite === 'sur_demande' ? 'Sur demande' : 'Privé'}</span></div>
        <div class="mma-acts">${d.url_bunny ? `<a class="btn sm out" href="${A.attrUrl(d.url_bunny)}" target="_blank" rel="noopener">Ouvrir</a>` : '<span></span>'}
          <button class="btn sm out" data-vis="${Number(d.id)}" data-to="${d.visibilite === 'prive' ? 'sur_demande' : 'prive'}">${d.visibilite === 'prive' ? 'Rendre accessible sur demande' : 'Rendre privé'}</button>
          <button class="btn sm out" data-send="${Number(d.id)}">Transmettre</button>
          <button class="btn sm out" data-rm="${Number(d.id)}" style="color:var(--red)">Supprimer</button></div></div></article>`).join('');
      $$('[data-vis]', box).forEach(b => b.onclick = async () => {
        b.disabled = true;
        try { await api(`/api/mon-associe/documents/${b.dataset.vis}/visibilite`, { method: 'PATCH', body: { visibilite: b.dataset.to } }); toast(b.dataset.to === 'prive' ? 'Document privé' : 'Accessible sur demande'); load(); }
        catch (e) { toast(e.message, true); b.disabled = false; }
      });
      $$('[data-rm]', box).forEach(b => b.onclick = async () => {
        if (!confirm('Supprimer ce document ? Cette action est irréversible.')) return;
        b.disabled = true;
        try { await api(`/api/mon-associe/documents/${b.dataset.rm}`, { method: 'DELETE' }); toast('Document supprimé'); load(); }
        catch (e) { toast(e.message, true); b.disabled = false; }
      });
      $$('[data-send]', box).forEach(b => b.onclick = () => transmettre(Number(b.dataset.send)));
    };
    const transmettre = async docId => {
      let convs;
      try { convs = (await api('/api/mon-associe/conversations')).conversations || []; } catch (e) { return toast(e.message, true); }
      const close = A.openSheet(`<h2 style="margin:0 0 8px;font-size:19px">Transmettre ce document</h2>${convs.length
        ? `<p class="muted small" style="margin:0 0 8px">Choisissez la conversation où l’envoyer.</p><div class="lst">${convs.map(c => `<button class="li" data-cv="${Number(c.id)}"><span class="ic">${ic('chat')}</span><span class="sp"><span class="t">${esc(c.avec_nom)}</span></span></button>`).join('')}</div>`
        : '<div class="empty" style="padding:22px"><b>Aucune conversation</b>Une conversation s’ouvre quand l’auteur d’une annonce répond à une candidature. Vous pourrez alors lui transmettre ce document.</div>'}
        <button class="btn out block" id="ma-tclose" style="margin-top:12px">Fermer</button>`);
      $('#ma-tclose').onclick = close;
      $$('#sheet [data-cv]').forEach(b => b.onclick = async () => {
        b.disabled = true;
        try { await api(`/api/mon-associe/documents/${docId}/transmettre`, { method: 'POST', body: { conversation_id: Number(b.dataset.cv) } }); close(); toast('Document transmis ✓'); }
        catch (e) { toast(e.message, true); b.disabled = false; }
      });
    };
    load();
  }

  /* ============================================================
     ROUTEUR DU MODULE  —  #/associe[/<b>[/<c>]]
     ============================================================ */
  window.MMods = window.MMods || {};
  window.MMods.associe = function (b, c) {
    clearInterval(chatTimer);
    if (!b) return viewList();
    if (b === 'a') return viewDetail(c);
    if (b === 'mes') return viewMes();
    if (b === 'nouveau') return viewNew();
    if (b === 'cand') return viewCand(c);
    if (b === 'msg') return viewMsgs();
    if (b === 'c') return viewChat(c);
    if (b === 'docs') return viewDocs();
    location.replace('#/associe');
  };
})();
