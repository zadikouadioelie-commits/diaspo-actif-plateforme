/* ============================================================
   Diaspo'Actif — Version téléphone : module « Formations »
   Catalogue (recherche, filtres, favoris) · fiche détaillée · inscription (gratuite directe,
   payante via la page de paiement sécurisée Stripe) · « Mes formations » · suivi des leçons.
   Routes : #/formations · #/formations/<id> · #/formations/mes · #/formations/<id>/suivre
            · #/formations/<id>/l<idLeçon>
   Mêmes routes d'API que le site (formations.html, suivre-formation.html). La création et la
   gestion de formations (Diaspo Formation, Premium) restent sur ordinateur.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, strip, ic, setPane, toast } = A;
  window.MMods = window.MMods || {};

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- styles propres au module (injectés une seule fois) ---------- */
  if (!document.getElementById('m-mod-formations-css')) {
    const st = document.createElement('style');
    st.id = 'm-mod-formations-css';
    st.textContent = `
      .fm-cov{position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,var(--navy),var(--navy2));color:rgba(255,255,255,.8);display:flex;align-items:center;justify-content:center;overflow:hidden}
      .fm-cov img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      .fm-star{position:absolute;top:6px;right:6px;z-index:2;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.94);color:var(--navy);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow)}
      .fm-star.on svg{fill:var(--orange);stroke:var(--orange-d)}
      .fm-bd{display:block;padding:12px 14px 14px}
      .fm-bd h3{margin:8px 0 2px;font-size:17px;line-height:1.25}
      .fm-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .fm-in{width:100%;min-height:46px;border:1px solid var(--border);border-radius:12px;padding:10px 12px;font-size:16px;background:#fff;color:var(--text);font-family:inherit}
      textarea.fm-in{min-height:96px;resize:vertical;line-height:1.35}
      .fm-lab{display:block;font-size:13px;font-weight:600;color:var(--muted);margin:14px 0 4px}
      .fm-err{color:var(--red);font-size:13px;min-height:18px;margin:6px 2px 0}
      .fm-les{display:flex;align-items:center;gap:12px;min-height:58px;padding:8px 14px;border-bottom:1px solid var(--border);width:100%;text-align:left}
      .fm-les:last-child{border-bottom:none}
      .fm-les:active{background:rgba(13,43,78,.05)}
      .fm-les .t{font-weight:600;line-height:1.25}
      .fm-les .d{font-size:12.5px;color:var(--muted)}
      .fm-ck{width:28px;height:28px;border-radius:50%;border:2px solid #B8C4D6;display:flex;align-items:center;justify-content:center;flex:none;color:#fff}
      .fm-les.done .fm-ck{background:var(--green);border-color:var(--green)}
      .fm-thumb{width:64px;height:64px;border-radius:12px;background:linear-gradient(135deg,var(--navy),var(--navy2));color:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none}
      .fm-thumb img{width:100%;height:100%;object-fit:cover}
      .fm-rate{display:flex;gap:2px;margin:6px 0 2px}
      .fm-rate button{width:44px;height:44px;font-size:28px;line-height:1;color:#cbd5e1}
      .fm-rate button.on{color:#f59e0b}
      .fm-gold{color:#f59e0b;letter-spacing:1px}
      .fm-note{background:var(--sky-l);color:var(--navy);border-radius:12px;padding:10px 12px;font-size:13.5px;margin-bottom:12px}
    `;
    document.head.appendChild(st);
  }

  /* ---------- état du module ---------- */
  const F = { items: null, at: 0, q: '', prix: 'tous', cat: '', niveau: '', type: '', shown: 12, favs: null, uid: null };
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  let seq = 0;               // numéro de la dernière navigation : écarte les réponses réseau arrivées trop tard
  let outlineSeen = null;    // id de la formation dont le plan a été affiché (sert au bouton retour en fin de leçons)
  let SF = null;             // dernier suivi chargé { id, data, at }

  /* Vrai tant que l'écran qui a lancé la requête est toujours celui que la personne regarde :
     sinon on rouvrirait le panneau par-dessus l'onglet qu'elle a retrouvé entre-temps. */
  const alive = my => my === seq && /^#\/formations(\/|$)/.test(location.hash);

  const norm = v => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const pct = v => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  const prov = f => f.formateur_organisation || f.organisme || f.formateur_nom || f.auteur_nom || '';
  const cover = f => f.image_url || f.banniere_url || '';
  const catOf = f => f.categorie || f.domaine || '';
  const plural = (n, un, plu) => n + ' ' + (n > 1 ? plu : un);
  function price(n, dev) {
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: dev || 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n) || 0); }
    catch (e) { return (Number(n) || 0) + ' ' + (dev || '€'); }
  }
  function shortDate(s) {
    const p = A.parseDay(s); return p ? p.d + ' ' + MOIS[p.m - 1] + ' ' + p.y : '';
  }
  /* Même règle que le serveur (POST /api/formations/:id/inscrire) : seule la valeur « payant »
     ou « payant_sauf_membres » avec un prix > 0 déclenche un paiement ; tout le reste est gratuit. */
  function payMode(f) {
    if (!(Number(f.prix) > 0)) return 'libre';
    if (f.mode_acces === 'payant') return 'payant';
    if (f.mode_acces === 'payant_sauf_membres') return 'membres';
    return 'libre';
  }
  function priceBadges(f) {
    const m = payMode(f);
    if (m === 'libre') return '<span class="badge g">Gratuite</span>';
    return `<span class="badge o">${esc(price(f.prix, f.devise))}</span>` + (m === 'membres' ? '<span class="badge g">Gratuite pour les membres</span>' : '');
  }
  /* Champs « liste » saisis en texte libre (séparés par des retours à la ligne ou des points-virgules). */
  function toList(v) {
    if (Array.isArray(v)) return v.map(x => strip(x)).filter(Boolean);
    let s = String(v == null ? '' : v).trim(); if (!s) return [];
    if (s[0] === '[') { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(x => strip(x)).filter(Boolean); } catch (e) { /* texte ordinaire */ } }
    return strip(s).split(/\n|;/).map(x => x.replace(/^[\s•\-–*]+/, '').trim()).filter(Boolean);
  }
  const listHtml = arr => `<ul style="margin:0;padding-left:1.2em">${arr.map(x => `<li style="margin:0 0 4px">${esc(x)}</li>`).join('')}</ul>`;
  const stars = n => `<span class="fm-gold" role="img" aria-label="${esc(n)} sur 5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;

  /* Retour à une page « courante » après un échec réseau : on relance la route telle qu'elle est dans l'adresse. */
  function retry() {
    const p = location.hash.replace(/^#\/?/, '').split('/');
    window.MMods.formations(p[1], p[2]);
  }
  function fail(title, e) {
    if (e && e.status === 402) { A.premiumSheet('Formations'); }
    setPane(title, `<div class="empty"><div class="ei">${ic('close', 'l')}</div><b>Impossible de charger cet écran</b>${esc((e && e.message) || 'Une erreur est survenue.')}<br><br><button class="btn" id="fm-retry">Réessayer</button> <a class="btn out" href="#/formations">Catalogue</a></div>`);
    const b = $('#fm-retry'); if (b) b.onclick = retry;
  }
  function needLoginCard(title, txt) {
    setPane(title, A.loginCard(txt));
    const g = $('#go-login'); if (g) g.onclick = () => A.openLogin(); // la connexion relance la route toute seule
  }
  const initiativeLink = () => S.me && S.me.role === 'initiative'
    ? `<p class="small muted" style="text-align:center;margin:18px 6px 4px">Créer ou gérer vos propres formations (Diaspo Formation) : <a href="formations.html" style="text-decoration:underline">à faire sur ordinateur</a>.</p>` : '';

  /* ---------- données partagées ---------- */
  async function loadFavs(force) {
    const uid = S.me ? S.me.id : null;
    if (F.uid !== uid) { F.uid = uid; F.favs = null; }
    if (!S.me) { F.favs = null; return; }
    if (F.favs && !force) return;
    try { F.favs = new Set(((await api('/api/formation-favoris')).favoris || []).map(f => Number(f.id))); }
    catch (e) { F.favs = F.favs || new Set(); } // facultatif : sans favoris la liste reste utilisable
  }
  async function loadMine() {
    if (!S.me) return [];
    try { return (await api('/api/mes-inscriptions')).inscriptions || []; } catch (e) { return null; }
  }
  async function toggleFav(id) {
    if (!(await A.needLogin('Connectez-vous pour enregistrer des formations en favori.'))) return;
    await loadFavs(true);
    const on = F.favs.has(id);
    try {
      await api('/api/formation-favoris/' + id, on ? { method: 'DELETE' } : { method: 'POST', body: {} });
      if (on) F.favs.delete(id); else F.favs.add(id);
      $$('[data-fav="' + id + '"]').forEach(b => {
        b.classList.toggle('on', !on); b.setAttribute('aria-pressed', String(!on));
        b.setAttribute('aria-label', on ? 'Ajouter aux favoris' : 'Retirer des favoris');
        if (b.dataset.txt) b.innerHTML = ic('star', 's') + ' ' + (on ? 'Ajouter aux favoris' : 'Retirer des favoris');
      });
      toast(on ? 'Retirée de vos favoris' : 'Ajoutée à vos favoris');
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- point d'entrée ---------- */
  window.MMods.formations = function (b, c) {
    const my = ++seq;
    if (!b) return screenCatalogue(my);
    if (b === 'mes') return screenMes(my);
    if (/^\d+$/.test(b)) {
      if (c === 'suivre') return screenSuivre(my, b);
      if (c && /^l\d+$/.test(c)) return screenLecon(my, b, Number(c.slice(1)));
      return screenDetail(my, b);
    }
    location.replace('#/formations');
  };

  /* ============================================================
     CATALOGUE
     ============================================================ */
  async function screenCatalogue(my) {
    setPane('Formations', '<div class="sk skc" style="height:120px"></div><div class="sk skc"></div><div class="sk skc"></div>');
    try {
      if (!F.items || Date.now() - F.at > 60000) {
        const r = await api('/api/formations');
        if (!alive(my)) return;
        // Les formations « privées » ne sont pas listées au catalogue (accès par lien direct seulement).
        F.items = (r.formations || []).filter(f => f.acces_type !== 'prive'); F.at = Date.now();
      }
      await loadFavs();
    } catch (e) { if (alive(my)) fail('Formations', e); return; }
    if (!alive(my)) return;
    drawCatalogue();
  }

  const filtersCount = () => (F.cat ? 1 : 0) + (F.niveau ? 1 : 0) + (F.type ? 1 : 0);

  function drawCatalogue() {
    setPane('Formations', `
      <div class="chips" role="tablist" aria-label="Rubriques">
        <button class="chip on" role="tab" aria-selected="true">Catalogue</button>
        <a class="chip" role="tab" aria-selected="false" href="#/formations/mes">${ic('book', 's')} Mes formations</a>
      </div>
      <div class="search">${ic('search', 's')}<input id="fm-q" type="search" placeholder="Rechercher une formation…" aria-label="Rechercher une formation" value="${esc(F.q)}"></div>
      <div class="chips" id="fm-chips"></div>
      <div class="small muted" id="fm-count" style="margin:-2px 4px 10px" aria-live="polite"></div>
      <div id="fm-list"></div><div id="fm-more"></div>
      ${initiativeLink()}`);
    let t;
    $('#fm-q').oninput = e => { clearTimeout(t); t = setTimeout(() => { F.q = e.target.value.trim(); F.shown = 12; paintList(); }, 200); };
    $('#fm-list').onclick = e => {
      const s = e.target.closest('[data-fav]');
      if (s) { e.preventDefault(); toggleFav(Number(s.dataset.fav)); }
    };
    paintChips(); paintList();
  }

  function paintChips() {
    const el = $('#fm-chips'); if (!el) return;
    const n = filtersCount();
    el.innerHTML = [['tous', 'Toutes'], ['gratuit', 'Gratuites'], ['payant', 'Payantes'], ['fav', '★ Favoris']]
      .map(([k, l]) => `<button class="chip ${F.prix === k ? 'on' : ''}" data-p="${k}" aria-pressed="${F.prix === k}">${l}</button>`).join('')
      + `<button class="chip ${n ? 'on' : ''}" id="fm-filters">Filtres${n ? ' (' + n + ')' : ''}</button>`;
    $$('[data-p]', el).forEach(b => b.onclick = async () => {
      if (b.dataset.p === 'fav') {
        if (!(await A.needLogin('Connectez-vous pour retrouver vos formations favorites.'))) return;
        await loadFavs();
      }
      F.prix = b.dataset.p; F.shown = 12; paintChips(); paintList();
    });
    $('#fm-filters').onclick = openFilters;
  }

  function openFilters() {
    const items = F.items || [];
    const uniq = fn => [...new Set(items.map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const opts = (arr, cur) => `<option value="">Tous</option>` + arr.map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const close = A.openSheet(`
      <h2 style="margin:4px 0 2px;font-size:19px">Filtrer les formations</h2>
      <label class="fm-lab" for="fm-f-cat">Catégorie</label><select class="fm-in" id="fm-f-cat">${opts(uniq(catOf), F.cat)}</select>
      <label class="fm-lab" for="fm-f-niv">Niveau</label><select class="fm-in" id="fm-f-niv">${opts(uniq(f => f.niveau), F.niveau)}</select>
      <label class="fm-lab" for="fm-f-type">Type de formation</label><select class="fm-in" id="fm-f-type">${opts(uniq(f => f.type_formation), F.type)}</select>
      <button class="btn block" id="fm-f-ok" style="margin-top:18px">Afficher les résultats</button>
      <button class="btn out block" id="fm-f-reset" style="margin-top:10px">Réinitialiser</button>`);
    $('#fm-f-ok').onclick = () => { F.cat = $('#fm-f-cat').value; F.niveau = $('#fm-f-niv').value; F.type = $('#fm-f-type').value; F.shown = 12; close(); paintChips(); paintList(); };
    $('#fm-f-reset').onclick = () => { F.cat = F.niveau = F.type = ''; F.shown = 12; close(); paintChips(); paintList(); };
  }

  function filtered() {
    const q = norm(F.q);
    return (F.items || []).filter(f => {
      if (q && !norm([f.titre, f.sous_titre, f.description_courte, strip(f.description || ''), prov(f), f.categorie, f.domaine, f.mots_cles].join(' ')).includes(q)) return false;
      if (F.prix === 'gratuit' && payMode(f) !== 'libre') return false;
      if (F.prix === 'payant' && payMode(f) === 'libre') return false;
      if (F.prix === 'fav' && !(F.favs && F.favs.has(Number(f.id)))) return false;
      if (F.cat && catOf(f) !== F.cat) return false;
      if (F.niveau && f.niveau !== F.niveau) return false;
      if (F.type && f.type_formation !== F.type) return false;
      return true;
    });
  }

  function card(f) {
    const cov = cover(f), fav = !!(F.favs && F.favs.has(Number(f.id)));
    const desc = strip(f.description_courte || f.description || '');
    const who = prov(f);
    return `<article class="card">
      <div class="fm-cov"><span aria-hidden="true">${ic('book', 'l')}</span>${cov ? `<img src="${A.attrUrl(cov)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        <button class="fm-star ${fav ? 'on' : ''}" data-fav="${esc(f.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${ic('star')}</button></div>
      <a class="fm-bd" href="#/formations/${esc(f.id)}">
        <div class="tags" style="margin:0">${priceBadges(f)}${f.niveau ? `<span class="badge">${esc(f.niveau)}</span>` : ''}${f.certificat_actif ? `<span class="badge">${ic('check', 's')} Certificat</span>` : ''}</div>
        <h3>${esc(f.titre)}</h3>
        ${who ? `<div class="small muted ell">${esc(who)}</div>` : ''}
        ${desc ? `<p class="small fm-clamp" style="margin:8px 0 0">${esc(desc)}</p>` : ''}
        <div class="row small muted" style="margin-top:10px;flex-wrap:wrap;gap:4px 14px">
          ${f.duree ? `<span class="meta" style="margin:0">${ic('clock', 's')}<span>${esc(f.duree)}</span></span>` : ''}
          ${f.type_formation ? `<span class="meta" style="margin:0">${ic('book', 's')}<span>${esc(f.type_formation)}</span></span>` : ''}
        </div></a></article>`;
  }

  function paintList() {
    const l = $('#fm-list'); if (!l) return;
    const a = filtered();
    $('#fm-count').textContent = F.items && F.items.length ? plural(a.length, 'formation', 'formations') : '';
    if (!a.length) {
      const vide = !(F.items && F.items.length);
      l.innerHTML = `<div class="empty"><div class="ei">${ic('book', 'l')}</div><b>${vide ? 'Aucune formation pour le moment' : F.prix === 'fav' && !F.q && !filtersCount() ? 'Aucun favori' : 'Aucune formation trouvée'}</b>${vide ? 'Le catalogue s’enrichit régulièrement : revenez bientôt.' : F.prix === 'fav' && !F.q && !filtersCount() ? 'Touchez l’étoile d’une formation pour la retrouver ici.' : 'Essayez un autre mot-clé ou retirez un filtre.'}${!vide && (F.q || F.prix !== 'tous' || filtersCount()) ? '<br><br><button class="btn out sm" id="fm-clear">Tout afficher</button>' : ''}</div>`;
      $('#fm-more').innerHTML = '';
      const c = $('#fm-clear'); if (c) c.onclick = () => { F.q = ''; F.prix = 'tous'; F.cat = F.niveau = F.type = ''; F.shown = 12; drawCatalogue(); };
      return;
    }
    l.innerHTML = a.slice(0, F.shown).map(card).join('');
    $('#fm-more').innerHTML = a.length > F.shown ? `<button class="btn out block" id="fm-next">Voir plus (${a.length - F.shown})</button>` : '';
    const n = $('#fm-next'); if (n) n.onclick = () => { F.shown += 12; paintList(); };
  }

  /* ============================================================
     FICHE D'UNE FORMATION
     ============================================================ */
  async function screenDetail(my, id) {
    setPane('Formation', '<div class="sk skc" style="height:180px"></div><div class="sk skc"></div>');
    let f, mine;
    try {
      const r = await api('/api/formations/' + encodeURIComponent(id));
      f = r.formation;
      [mine] = await Promise.all([loadMine(), loadFavs()]);
    } catch (e) {
      if (!alive(my)) return;
      if (e.status === 404) return setPane('Formation', `<div class="empty"><div class="ei">${ic('book', 'l')}</div><b>Formation introuvable</b>Elle a peut-être été retirée du catalogue.<br><br><a class="btn" href="#/formations">Voir le catalogue</a></div>`);
      return fail('Formation', e);
    }
    if (!alive(my)) return;
    const owner = !!S.me && (Number(S.me.id) === Number(f.owner_user_id) || S.me.role === 'administrateur');
    // Le serveur renvoie aussi les brouillons : on ne les montre qu'à leur auteur.
    if (f.statut !== 'publiee' && !owner) return setPane('Formation', `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Formation indisponible</b>Cette formation n’est pas ouverte au public pour le moment.<br><br><a class="btn" href="#/formations">Voir le catalogue</a></div>`);

    const ins = (mine || []).find(i => Number(i.formation_id) === Number(f.id));
    let etat = 'libre';
    if (ins) etat = ins.paiement_statut === 'en_attente' ? 'attente' : ins.statut === 'active' ? 'inscrit' : 'inactive';
    const mode = payMode(f), ferme = !!f.date_suppression_prevue;
    const fav = !!(F.favs && F.favs.has(Number(f.id)));
    const cov = cover(f);
    const who = prov(f);
    const avis = Array.isArray(f.avis) ? f.avis : [];
    const moyenne = avis.length ? avis.reduce((s, a) => s + (Number(a.note) || 0), 0) / avis.length : 0;
    const monAvis = S.me ? avis.find(a => Number(a.user_id) === Number(S.me.id)) : null;
    const objectifs = toList(f.objectifs), competences = toList(f.competences_acquises), resultats = toList(f.resultats_attendus);
    const desc = f.description ? A.richHtml(f.description) : '';

    // Bouton principal collé en bas
    let foot;
    if (etat === 'inscrit') foot = `<a class="btn block" href="#/formations/${esc(f.id)}/suivre">${pct(ins.avancement_pct) > 0 ? 'Continuer la formation' : 'Commencer la formation'}</a>`;
    else if (etat === 'attente') foot = '<button class="btn block" disabled>Paiement en cours de confirmation</button>';
    else if (etat === 'inactive') foot = '<button class="btn block" disabled>Inscription non active</button>';
    else if (owner && f.statut !== 'publiee') foot = `<a class="btn block" href="#/formations/${esc(f.id)}/suivre">Voir l’aperçu élève</a>`;
    else if (ferme) foot = '<button class="btn block" disabled>Inscriptions fermées</button>';
    else if (mode === 'libre') foot = '<button class="btn block" id="fm-join">S’inscrire gratuitement</button>';
    else foot = `<button class="btn block" id="fm-pay">S’inscrire · ${esc(price(f.prix, f.devise))}</button>`;

    const facts = [
      ['Type', f.type_formation], ['Catégorie', catOf(f)], ['Niveau', f.niveau], ['Langue', f.langue],
      ['Durée', f.duree || (f.duree_heures ? f.duree_heures + ' h' : '')],
      ['Places', f.places ? String(f.places) : ''],
      ['Début', shortDate(f.date_debut)], ['Fin', shortDate(f.date_fin)],
      ['Inscriptions jusqu’au', shortDate(f.date_fermeture_inscriptions)],
      ['Certificat', f.certificat_actif ? 'Délivré à la fin' : '']
    ].filter(x => x[1]);
    const progLine = [f.nombre_modules_prevu ? plural(Number(f.nombre_modules_prevu), 'module', 'modules') : '', f.nombre_lecons_approx ? 'environ ' + plural(Number(f.nombre_lecons_approx), 'leçon', 'leçons') : ''].filter(Boolean).join(' · ');

    const hasForm = f.formateur_nom || f.formateur_bio || f.formateur_fonction || f.formateur_organisation || f.formateur_photo_url;
    const fname = f.formateur_nom || f.formateur_organisation || f.organisme || '';
    const formateur = hasForm ? `<div class="h2">FORMATEUR</div><div class="card"><div class="pad">
        <div class="row"><div class="av big">${f.formateur_photo_url ? `<img src="${A.attrUrl(f.formateur_photo_url)}" alt="" onerror="this.remove()">` : esc(A.initials(fname))}</div>
        <div class="sp"><b>${esc(fname)}</b>${f.formateur_fonction ? `<div class="small muted">${esc(f.formateur_fonction)}${f.formateur_organisation && f.formateur_nom ? ' · ' + esc(f.formateur_organisation) : ''}</div>` : ''}${Number(f.formateur_annees_exp) > 0 ? `<div class="small muted">${esc(plural(Number(f.formateur_annees_exp), 'an', 'ans'))} d’expérience</div>` : ''}</div></div>
        ${f.formateur_bio ? `<p class="small" style="margin:10px 0 0;white-space:pre-line">${esc(strip(f.formateur_bio))}</p>` : ''}
        ${f.formateur_site && A.attrUrl(f.formateur_site) ? `<a class="btn out sm" style="margin-top:10px" href="${A.attrUrl(f.formateur_site)}" target="_blank" rel="noopener">Site du formateur ${ic('out', 's')}</a>` : ''}</div></div>` : '';

    const section = (titre, inner) => inner ? `<div class="h2">${esc(titre)}</div><div class="card"><div class="pad">${inner}</div></div>` : '';
    const avisHtml = `<div class="h2">AVIS${avis.length ? ' · ' + stars(Math.round(moyenne)) + ' ' + esc(moyenne.toFixed(1)) + ' (' + avis.length + ')' : ''}</div>
      ${avis.length ? avis.slice(0, 5).map(a => `<div class="card"><div class="pad"><div class="row"><b class="sp ell">${esc(a.auteur || 'Participant')}</b>${stars(Math.max(1, Math.min(5, Number(a.note) || 0)))}</div>
        ${a.commentaire ? `<p style="margin:6px 0 0;white-space:pre-line">${esc(strip(a.commentaire))}</p>` : ''}
        ${a.reponse_createur ? `<div class="fm-note" style="margin:10px 0 0"><b>Réponse du formateur</b><br>${esc(strip(a.reponse_createur))}</div>` : ''}</div></div>`).join('')
        : '<div class="card"><div class="pad small muted">Aucun avis pour le moment.</div></div>'}
      ${avis.length > 5 ? `<p class="small muted" style="margin:0 4px 10px">Les ${avis.length - 5} autres avis sont consultables sur ordinateur.</p>` : ''}
      ${etat === 'inscrit' ? `<button class="btn out block" id="fm-avis" style="margin-bottom:12px">${monAvis ? 'Modifier mon avis' : 'Donner mon avis'}</button>` : ''}`;

    let etatNote = '';
    if (etat === 'inscrit') etatNote = `<div class="card"><div class="pad"><div class="row"><b class="sp">Vous êtes inscrit(e)</b><span class="badge g">${pct(ins.avancement_pct)} % terminé</span></div><div class="bar" style="margin-top:10px" role="progressbar" aria-valuenow="${pct(ins.avancement_pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct(ins.avancement_pct)}%"></i></div></div></div>`;
    else if (etat === 'attente') etatNote = '<div class="fm-note"><b>Paiement en cours de confirmation.</b> Si vous n’avez pas terminé le règlement, la tentative expirera d’elle-même sous environ 24 h et vous pourrez recommencer. Sinon, votre accès s’active dès la confirmation.</div>';
    else if (etat === 'inactive') etatNote = `<div class="fm-note">Votre inscription à cette formation est <b>${ins.statut === 'expiree' ? 'expirée' : 'annulée'}</b>. Contactez le formateur ou l’équipe Diaspo’Actif pour la réactiver.</div>`;
    else if (ferme) etatNote = '<div class="fm-note">Les inscriptions sont fermées : cette formation sera bientôt retirée du catalogue.</div>';
    else if (mode === 'membres') etatNote = `<div class="fm-note"><b>${esc(price(f.prix, f.devise))}</b> · gratuite pour les membres disposant d’un code d’accès (à saisir à l’inscription).</div>`;
    if (owner) etatNote += `<div class="fm-note">Vous êtes l’auteur de cette formation. Sa gestion se fait <a href="formations.html" style="text-decoration:underline">sur ordinateur</a>.</div>`;
    if (f.accessible_mobile === 0) etatNote += '<div class="fm-note">Cette formation est surtout conçue pour être suivie sur ordinateur.</div>';

    setPane(f.titre, `
      ${cov ? A.mediaBlock(cov, { alt: f.titre }) : (f.video_intro ? A.videoBlock(f.video_intro) : '')}
      <div class="card" style="margin-top:12px"><div class="pad">
        <div class="tags" style="margin:0 0 8px">${priceBadges(f)}${f.certificat_actif ? `<span class="badge">${ic('check', 's')} Certificat</span>` : ''}${f.nb_inscrits ? `<span class="badge">${esc(plural(Number(f.nb_inscrits), 'inscrit', 'inscrits'))}</span>` : ''}</div>
        <h2 style="margin:0 0 4px;font-size:21px;line-height:1.25">${esc(f.titre)}</h2>
        ${f.sous_titre ? `<p class="muted" style="margin:0 0 6px">${esc(strip(f.sous_titre))}</p>` : ''}
        ${who ? `<p class="small muted" style="margin:0">Proposée par <b style="color:var(--text)">${esc(who)}</b></p>` : ''}
        <button class="btn out sm" style="margin-top:12px" data-fav="${esc(f.id)}" data-txt="1" aria-pressed="${fav}">${ic('star', 's')} ${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}</button></div></div>
      ${etatNote}
      ${desc ? `<div class="h2">À PROPOS</div><div class="card"><div class="pad rich">${desc}</div></div>` : (f.description_courte ? `<div class="card"><div class="pad">${esc(strip(f.description_courte))}</div></div>` : '')}
      ${facts.length ? `<div class="h2">EN BREF</div><div class="card"><div class="pad">${facts.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div></div>` : ''}
      ${section('PROGRAMME', (progLine ? `<p style="margin:0 0 8px"><b>${esc(progLine)}</b></p>` : '') + (etat === 'inscrit' ? `<a class="btn out sm" href="#/formations/${esc(f.id)}/suivre">Voir le plan et les leçons</a>` : '<p class="small muted" style="margin:0">Le détail des modules et des leçons est accessible dès votre inscription.</p>'))}
      ${section('OBJECTIFS', objectifs.length ? listHtml(objectifs) : '')}
      ${section('COMPÉTENCES ACQUISES', competences.length ? listHtml(competences) : '')}
      ${section('RÉSULTATS ATTENDUS', resultats.length ? listHtml(resultats) : '')}
      ${section('PUBLIC CONCERNÉ', f.public_concerne ? `<div style="white-space:pre-line">${esc(strip(f.public_concerne))}</div>` : '')}
      ${section('PRÉREQUIS', f.prerequis ? `<div style="white-space:pre-line">${esc(strip(f.prerequis))}</div>` : '')}
      ${formateur}
      ${avisHtml}`, foot);

    // Actions
    const star = $('#pane-body [data-fav][data-txt]'); if (star) star.onclick = () => toggleFav(Number(f.id));
    const j = $('#fm-join'); if (j) j.onclick = () => inscrire(f, '', j);
    const p = $('#fm-pay'); if (p) p.onclick = () => openPaySheet(f, mode === 'membres');
    const av = $('#fm-avis'); if (av) av.onclick = () => openAvisSheet(f, monAvis);
  }

  /* Inscription : gratuite = immédiate ; payante = le serveur crée la session Stripe et renvoie son adresse. */
  async function inscrire(f, code, btn) {
    if (!(await A.needLogin('Connectez-vous pour vous inscrire à une formation.'))) return false;
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Inscription…'; }
    try {
      const r = await api(`/api/formations/${encodeURIComponent(f.id)}/inscrire`, { method: 'POST', body: code ? { code } : {} });
      if (r.checkout_url) {
        if (!/^https:\/\/[^\s"'<>]+$/i.test(r.checkout_url)) throw new Error('Adresse de paiement invalide. Réessayez ou contactez l’assistance.');
        toast('Redirection vers le paiement sécurisé…');
        location.href = r.checkout_url;
        return true;
      }
      // Comme sur le site : l'inscription alimente aussi « Mon suivi » de l'ordinateur (échec sans gravité).
      try { await api('/api/formations/suivi', { method: 'POST', body: { formation_id: Number(f.id) } }); } catch (e) { /* déjà suivi */ }
      toast('Inscription confirmée ✓');
      screenDetail(++seq, f.id);
      return true;
    } catch (e) {
      toast(e.message, true);
      if (e.status === 409) screenDetail(++seq, f.id); // déjà inscrit : on rafraîchit l'état affiché
      else if (btn) { btn.disabled = false; btn.textContent = label; }
      return false;
    }
  }

  function openPaySheet(f, membres) {
    const close = A.openSheet(`
      <h2 style="margin:4px 0 4px;font-size:19px">Inscription payante</h2>
      <p class="muted" style="margin:0 0 10px">${esc(f.titre)}</p>
      <div class="kv"><span>Montant</span><span>${esc(price(f.prix, f.devise))}</span></div>
      ${membres ? `<label class="fm-lab" for="fm-code">Code d’accès membre (facultatif)</label>
        <input class="fm-in" id="fm-code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Votre code">
        <p class="small muted" style="margin:6px 2px 0">Un code valide rend l’inscription gratuite. Sans code, ou avec un code non valide, vous réglez le tarif normal.</p>` : ''}
      <p class="small muted" style="margin:12px 2px">Le règlement se fait sur la page sécurisée de notre prestataire de paiement (Stripe). Votre accès est activé dès que le paiement est confirmé, puis vous suivez la formation depuis votre téléphone.</p>
      <button class="btn block" id="fm-go">Continuer vers le paiement</button>
      <button class="btn out block" id="fm-no" style="margin-top:10px">Annuler</button>`);
    const code = $('#fm-code'), go = $('#fm-go');
    if (code) code.oninput = () => { go.textContent = code.value.trim() ? 'S’inscrire avec mon code' : 'Continuer vers le paiement'; };
    $('#fm-no').onclick = close;
    go.onclick = async () => {
      const ok = await inscrire(f, code ? code.value.trim() : '', go);
      if (ok) close();
    };
  }

  function openAvisSheet(f, mon) {
    let note = mon ? Number(mon.note) || 0 : 0;
    const close = A.openSheet(`
      <h2 style="margin:4px 0 4px;font-size:19px">Votre avis</h2>
      <p class="muted" style="margin:0">${esc(f.titre)}</p>
      <div class="fm-rate" role="radiogroup" aria-label="Votre note sur 5">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="${n === note}" aria-label="${n} sur 5" data-n="${n}" class="${n <= note ? 'on' : ''}">★</button>`).join('')}</div>
      <label class="fm-lab" for="fm-com">Commentaire (facultatif)</label>
      <textarea class="fm-in" id="fm-com" maxlength="1500" placeholder="Ce que vous avez apprécié, ce qui pourrait être amélioré…">${esc(mon && mon.commentaire ? mon.commentaire : '')}</textarea>
      <p class="fm-err" id="fm-aerr" role="alert"></p>
      <button class="btn block" id="fm-asend">Publier mon avis</button>
      <button class="btn out block" id="fm-ano" style="margin-top:10px">Annuler</button>`);
    $$('.fm-rate button').forEach(b => b.onclick = () => {
      note = Number(b.dataset.n);
      $$('.fm-rate button').forEach(x => { const on = Number(x.dataset.n) <= note; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(Number(x.dataset.n) === note)); });
    });
    $('#fm-ano').onclick = close;
    $('#fm-asend').onclick = async () => {
      const err = $('#fm-aerr'); err.textContent = '';
      if (!note) { err.textContent = 'Choisissez une note de 1 à 5 étoiles.'; return; }
      const b = $('#fm-asend'); b.disabled = true; b.textContent = 'Envoi…';
      try {
        await api(`/api/formations/${encodeURIComponent(f.id)}/avis`, { method: 'POST', body: { note, commentaire: $('#fm-com').value.trim() || null } });
        close(); toast('Merci, votre avis est publié ✓'); screenDetail(++seq, f.id);
      } catch (e) { err.textContent = e.message; b.disabled = false; b.textContent = 'Publier mon avis'; }
    };
  }

  /* ============================================================
     MES FORMATIONS
     ============================================================ */
  async function screenMes(my) {
    if (!S.me) return needLoginCard('Mes formations', 'Connectez-vous pour retrouver vos formations et votre progression.');
    setPane('Mes formations', '<div class="sk skc" style="height:120px"></div><div class="sk skc" style="height:120px"></div>');
    let mine, suivi = [];
    try {
      mine = (await api('/api/mes-inscriptions')).inscriptions || [];
      // « Mon suivi » personnel (formations suivies hors plateforme ou notées à la main) : facultatif.
      try { const r = await api('/api/formations/suivi'); suivi = Array.isArray(r) ? r : (r.suivi || []); } catch (e) { suivi = []; }
    } catch (e) { if (alive(my)) fail('Mes formations', e); return; }
    if (!alive(my)) return;

    const ids = new Set(mine.map(i => Number(i.formation_id)));
    const perso = suivi.filter(s => !s.formation_id || !ids.has(Number(s.formation_id)));
    const actives = mine.filter(i => i.statut === 'active' && i.paiement_statut !== 'en_attente');
    const enCours = actives.filter(i => pct(i.avancement_pct) < 100);
    const finies = actives.filter(i => pct(i.avancement_pct) >= 100);
    const attente = mine.filter(i => i.paiement_statut === 'en_attente');
    const inactives = mine.filter(i => i.statut !== 'active' && i.paiement_statut !== 'en_attente');

    const row = (i, badge, cta) => `<article class="card"><a class="row" href="#/formations/${esc(i.formation_id)}" style="padding:12px 14px">
        <div class="fm-thumb">${i.image_url ? `<img src="${A.attrUrl(i.image_url)}" alt="" loading="lazy" onerror="this.remove()">` : ic('book', 'l')}</div>
        <div class="sp"><b style="line-height:1.25;display:block">${esc(i.titre)}</b><div class="tags" style="margin:4px 0 0">${badge}</div></div>${ic('chev', 's')}</a>
        ${i.statut === 'active' && i.paiement_statut !== 'en_attente' ? `<div style="padding:0 14px 6px"><div class="bar" role="progressbar" aria-valuenow="${pct(i.avancement_pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct(i.avancement_pct)}%"></i></div>
        <div class="small muted" style="margin-top:4px">${pct(i.avancement_pct)} % terminé${i.date_inscription ? ' · inscrit le ' + esc(shortDate(i.date_inscription)) : ''}</div></div>` : ''}
        ${cta ? `<div style="padding:6px 14px 14px">${cta}</div>` : '<div style="height:12px"></div>'}</article>`;
    const go = (i, txt) => `<a class="btn block sm" href="#/formations/${esc(i.formation_id)}/suivre">${txt}</a>`;
    const STAT = { en_cours: ['En cours', ''], termine: ['Terminée', 'g'], abandonne: ['Abandonnée', ''], certifie: ['Certifiée', 'g'] };

    let html = `<div class="chips"><a class="chip" href="#/formations">Catalogue</a><button class="chip on" aria-current="page">${ic('book', 's')} Mes formations</button></div>`;
    if (!mine.length && !perso.length) {
      html += `<div class="empty"><div class="ei">${ic('book', 'l')}</div><b>Aucune formation suivie</b>Parcourez le catalogue et inscrivez-vous : votre progression apparaîtra ici.<br><br><a class="btn" href="#/formations">Voir le catalogue</a></div>`;
    } else {
      if (enCours.length) html += `<div class="h2" style="margin-top:4px">EN COURS</div>` + enCours.map(i => row(i, '<span class="badge o">En cours</span>', go(i, pct(i.avancement_pct) > 0 ? 'Continuer' : 'Commencer'))).join('');
      if (finies.length) html += `<div class="h2">TERMINÉES</div>` + finies.map(i => row(i, '<span class="badge g">Terminée</span>', go(i, 'Revoir la formation'))).join('');
      if (attente.length) html += `<div class="h2">PAIEMENT EN ATTENTE</div>` + attente.map(i => row(i, '<span class="badge">Paiement à confirmer</span>', '')).join('') + '<p class="small muted" style="margin:0 4px 10px">Si le règlement n’a pas abouti, la tentative expire d’elle-même sous environ 24 h : vous pourrez alors vous inscrire de nouveau.</p>';
      if (inactives.length) html += `<div class="h2">INSCRIPTIONS NON ACTIVES</div>` + inactives.map(i => row(i, `<span class="badge r">${i.statut === 'expiree' ? 'Expirée' : 'Annulée'}</span>`, '')).join('');
      if (perso.length) html += `<div class="h2">MON SUIVI PERSONNEL</div>` + perso.map(s => { const st = STAT[s.statut] || [s.statut || '', '']; return `<article class="card"><div class="pad"><div class="row"><b class="sp" style="line-height:1.25">${esc(s.titre)}</b><span class="badge ${st[1]}">${esc(st[0])}</span></div>${s.organisme ? `<div class="small muted">${esc(s.organisme)}</div>` : ''}<div class="bar" style="margin-top:10px" role="progressbar" aria-valuenow="${pct(s.progression)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct(s.progression)}%"></i></div><div class="small muted" style="margin-top:4px">${pct(s.progression)} % · mis à jour depuis l’ordinateur</div></div></article>`; }).join('');
    }
    html += initiativeLink();
    setPane('Mes formations', html);
  }

  /* ============================================================
     SUIVI : plan de la formation puis leçons
     ============================================================ */
  async function loadSuivi(id, force) {
    if (!force && SF && SF.id === String(id) && Date.now() - SF.at < 300000) return SF.data;
    const data = await api(`/api/formations/${encodeURIComponent(id)}/suivre`);
    SF = { id: String(id), data, at: Date.now() };
    return data;
  }
  function flat(data) {
    const out = [];
    (data.modules || []).forEach(m => (m.chapitres || []).forEach(c => (c.lecons || []).forEach(l => out.push({ l, m, c }))));
    return out;
  }
  const TYPES = { texte: 'Lecture', video: 'Vidéo', audio: 'Audio', pdf: 'Document PDF', presentation: 'Présentation', images: 'Images', telechargement: 'Document à télécharger', quiz: 'Quiz', exercice: 'Exercice', travail_pratique: 'Travail pratique', etude_cas: 'Étude de cas' };
  const lessonSub = l => [TYPES[l.type] || 'Lecture', Number(l.duree_minutes) > 0 ? l.duree_minutes + ' min' : ''].filter(Boolean).join(' · ');

  function suiviError(e, id) {
    if (e.status === 403) return setPane('Formation', `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Accès réservé aux inscrits</b>${esc(e.message)}<br><br><a class="btn" href="#/formations/${esc(id)}">Voir la fiche de la formation</a></div>`);
    if (e.status === 404) return setPane('Formation', `<div class="empty"><div class="ei">${ic('book', 'l')}</div><b>Formation introuvable</b>${esc(e.message)}<br><br><a class="btn" href="#/formations">Voir le catalogue</a></div>`);
    return fail('Formation', e);
  }

  async function screenSuivre(my, id) {
    if (!S.me) return needLoginCard('Formation', 'Connectez-vous pour suivre vos formations.');
    setPane('Formation', '<div class="sk skc" style="height:130px"></div><div class="sk skc"></div>');
    let d;
    try { d = await loadSuivi(id, true); } catch (e) { if (alive(my)) suiviError(e, id); return; }
    if (!alive(my)) return;
    outlineSeen = String(id);
    const f = d.formation, items = flat(d), apercu = d.mode === 'apercu';
    const done = items.filter(x => x.l.termine).length;
    const next = items.find(x => !x.l.termine) || items[0];
    const p = apercu ? 0 : pct(d.avancement_pct);
    let html = `<div class="card"><div class="pad"><h2 style="margin:0 0 6px;font-size:20px;line-height:1.25">${esc(f.titre)}</h2>
      ${apercu ? '<span class="badge o">Aperçu créateur</span>' : `<div class="row small" style="margin:8px 0 6px"><b class="sp">${p} % terminé</b><span class="muted">${done} / ${items.length} leçon${items.length > 1 ? 's' : ''}</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div>`}
      ${items.length ? `<a class="btn block" style="margin-top:14px" href="#/formations/${esc(id)}/l${next.l.id}">${apercu ? 'Voir la première leçon' : done === 0 ? 'Commencer' : done >= items.length ? 'Revoir la formation' : 'Continuer'}</a>` : ''}</div></div>`;
    if (!items.length) {
      html += `<div class="empty"><div class="ei">${ic('clock', 'l')}</div><b>Contenu en préparation</b>Le formateur n’a pas encore publié de leçon.</div>`;
    } else {
      (d.modules || []).forEach(m => {
        const chs = (m.chapitres || []).filter(c => (c.lecons || []).length);
        if (!chs.length) return;
        html += `<div class="h2">${esc(String(m.titre || 'Module').toUpperCase())}</div>`;
        chs.forEach(c => {
          html += `<div class="small muted" style="margin:0 6px 6px;font-weight:600">${esc(c.titre || '')}</div><div class="lst" style="margin-bottom:12px">${c.lecons.map(l => `<a class="fm-les ${l.termine ? 'done' : ''}" href="#/formations/${esc(id)}/l${esc(l.id)}"><span class="fm-ck" aria-hidden="true">${l.termine ? ic('check', 's') : ''}</span><span class="sp"><span class="t">${esc(l.titre)}</span><br><span class="d">${esc(lessonSub(l))}${l.termine ? ' · terminée' : ''}</span></span><span class="ch" style="color:#94a3b8">${ic('chev', 's')}</span></a>`).join('')}</div>`;
        });
      });
    }
    html += `<a class="btn out block" href="#/formations/${esc(id)}">Fiche de la formation</a>`;
    setPane(f.titre, html);
  }

  const noFile = msg => `<div class="card"><div class="pad muted">${esc(msg)}</div></div>`;
  function lessonBody(l) {
    const url = A.attrUrl(l.contenu_url || '');
    const dl = Number(l.telechargement_autorise) === 1;
    const head = l.description ? `<p class="muted" style="margin:0 0 12px">${esc(strip(l.description))}</p>` : '';
    switch (l.type) {
      case 'video':
        return head + (url ? `<div class="media"><video controls playsinline preload="metadata" ${dl ? '' : 'controlsList="nodownload"'} src="${url}"></video></div>` : noFile('Cette vidéo n’est pas encore disponible.'));
      case 'audio':
        return head + (url ? `<div class="card"><div class="pad"><audio controls preload="metadata" ${dl ? '' : 'controlsList="nodownload"'} style="width:100%" src="${url}"></audio></div></div>` : noFile('Cet enregistrement n’est pas encore disponible.'));
      case 'pdf':
        return head + (url ? `<div class="card"><div class="pad"><p style="margin:0 0 12px">Document PDF${Number(l.nb_pages) > 0 ? ' · ' + esc(plural(Number(l.nb_pages), 'page', 'pages')) : ''}</p><a class="btn block" href="${url}" target="_blank" rel="noopener">Lire le document ${ic('out', 's')}</a></div></div>` : noFile('Ce document n’est pas encore disponible.'));
      case 'presentation': {
        if (!url) return head + noFile('Cette présentation n’est pas encore disponible.');
        let abs = ''; try { abs = new URL(l.contenu_url, location.href).href; } catch (e) { abs = ''; }
        return head + `<div class="card"><div class="pad"><p style="margin:0 0 12px">Présentation PowerPoint</p>${abs ? `<a class="btn block" href="https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(abs)}" target="_blank" rel="noopener">Ouvrir la présentation ${ic('out', 's')}</a>` : ''}${dl ? `<a class="btn out block" style="margin-top:10px" href="${url}" target="_blank" rel="noopener">Télécharger le fichier</a>` : ''}</div></div>`;
      }
      case 'images':
        return head + (url ? A.mediaBlock(l.contenu_url, { alt: l.titre }) : noFile('Cette image n’est pas encore disponible.')) + (url && dl ? `<a class="btn out block" style="margin-top:10px" href="${url}" target="_blank" rel="noopener">Ouvrir l’image</a>` : '');
      case 'telechargement':
        return head + (!url ? noFile('Aucun fichier pour cette leçon.') : dl ? `<div class="card"><div class="pad"><a class="btn block" href="${url}" target="_blank" rel="noopener">Télécharger le document ${ic('out', 's')}</a></div></div>` : noFile('Le formateur n’autorise pas le téléchargement de ce document.'));
      case 'quiz':
        return head + `<div class="fm-note"><b>Quiz : bientôt disponible.</b> Vous pourrez passer les quiz ici dès leur ouverture. Marquez la leçon comme terminée pour avancer.</div>`;
      default: { // texte, exercice, travail pratique, étude de cas
        const t = l.contenu_texte ? A.richHtml(l.contenu_texte) : '';
        return head + (t ? `<div class="card"><div class="pad rich">${t}</div></div>` : noFile(l.type && l.type !== 'texte' ? 'Aucune consigne fournie.' : 'Aucun contenu pour cette leçon.'));
      }
    }
  }

  async function screenLecon(my, id, leconId) {
    if (!S.me) return needLoginCard('Leçon', 'Connectez-vous pour suivre vos formations.');
    setPane('Leçon', '<div class="sk skc" style="height:60px"></div><div class="sk skc"></div>');
    let d;
    try { d = await loadSuivi(id, false); } catch (e) { if (alive(my)) suiviError(e, id); return; }
    if (!alive(my)) return;
    const items = flat(d), i = items.findIndex(x => Number(x.l.id) === leconId);
    if (i < 0) return setPane('Leçon', `<div class="empty"><div class="ei">${ic('book', 'l')}</div><b>Leçon introuvable</b>Elle a peut-être été retirée de la formation.<br><br><a class="btn" href="#/formations/${esc(id)}/suivre">Retour au plan</a></div>`);
    const { l, m, c } = items[i], prev = items[i - 1], next = items[i + 1], apercu = d.mode === 'apercu';
    const goTo = x => location.replace(`#/formations/${id}/l${x.l.id}`);
    const toOutline = () => { if (outlineSeen === String(id) && history.length > 1) history.back(); else location.replace(`#/formations/${id}/suivre`); };

    const html = `<div class="small muted" style="margin:0 2px 8px">${esc(m.titre || '')}${c.titre ? ' · ' + esc(c.titre) : ''} — leçon ${i + 1} sur ${items.length}</div>
      <h2 style="margin:0 0 12px;font-size:21px;line-height:1.25">${esc(l.titre)}</h2>
      ${lessonBody(l)}
      <a class="btn out block" style="margin-top:12px" href="#/formations/${esc(id)}/suivre">Plan de la formation</a>`;
    const foot = `<button class="btn out" id="fm-prev" aria-label="Leçon précédente" ${prev ? '' : 'disabled'}>${ic('back')}</button>
      ${apercu ? '<span class="sp"></span>' : `<button class="btn ${l.termine ? 'out' : ''}" id="fm-done" style="flex:1;padding:0 10px">${l.termine ? '✓ Terminée · annuler' : next ? 'Terminer et continuer' : 'Terminer la leçon'}</button>`}
      <button class="btn out" id="fm-next" aria-label="Leçon suivante" ${next ? '' : 'disabled'}>${ic('chev')}</button>`;
    setPane(l.titre, html, foot);

    $('#fm-prev').onclick = () => prev && goTo(prev);
    $('#fm-next').onclick = () => next && goTo(next);
    const dn = $('#fm-done');
    if (dn) dn.onclick = async () => {
      const val = !l.termine; dn.disabled = true;
      try {
        const r = await api(`/api/formations/${encodeURIComponent(id)}/lecons/${encodeURIComponent(l.id)}/progression`, { method: 'POST', body: { termine: val } });
        l.termine = val; d.avancement_pct = r.avancement_pct; SF.at = Date.now();
        if (!val) { toast('Leçon marquée comme non terminée'); return screenLecon(++seq, id, leconId); }
        if (next) { toast('Leçon terminée ✓'); return goTo(next); }
        toast(pct(r.avancement_pct) >= 100 ? 'Bravo, vous avez terminé la formation ! 🎉' : 'Leçon terminée ✓');
        toOutline();
      } catch (e) { toast(e.message, true); dn.disabled = false; }
    };
  }
})();
