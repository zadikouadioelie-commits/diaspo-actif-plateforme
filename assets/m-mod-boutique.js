/* ============================================================
   Diaspo'Actif — Version téléphone : « Boutique » et « Article »
   Avant (signalé le 2026-10-13) : la liste des boutiques menait seulement au profil public, les articles n'étaient pas cliquables et le
   lien « Voir toute la boutique sur le site » repartait vers profil.html?vitrine=1, que la bascule téléphone renvoyait… sur le profil public.
   Routes :  #/boutique/<id initiative>     la boutique : en-tête, recherche, catalogues, tous les articles
             #/boutique/u/<id du compte>    même écran, retrouvé à partir du compte propriétaire (anciens liens profil.html?id=…&vitrine=1)
             #/produit/<id>                 un article : photos, prix, disponibilité, livraison et actions
   Actions d'un article : ajouter au panier (prix fixe), faire une demande (sans prix), être averti (indisponible), demander un devis,
   contacter le vendeur. Le panier et le paiement restent ceux du site (panier.html), déjà utilisables sur téléphone.
   Mêmes routes serveur que l'ordinateur : aucun droit en plus.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, strip, ic, setPane, toast } = A;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  let NAV = 0; // jeton de navigation : un écran asynchrone obsolète ne doit jamais repeindre le panneau
  const guard = k => { const my = ++NAV; return () => my === NAV && !!S.pane && S.pane.k === k; };

  function injectCss() {
    if ($('#m-mod-boutique-css')) return;
    const st = document.createElement('style'); st.id = 'm-mod-boutique-css';
    st.textContent = `
.bq-head{display:flex;gap:12px;align-items:center;padding:14px}
.bq-lg{flex:none;width:64px;height:64px;border-radius:16px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--navy2);overflow:hidden}
.bq-lg img{width:100%;height:100%;object-fit:cover}
.bq-desc{padding:0 14px 12px;font-size:14px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.bq-acts{display:flex;gap:8px;padding:0 14px 14px}
.bq-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 14px}
.bq-p{display:block;background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden;color:inherit;text-decoration:none}
.bq-ph{position:relative;aspect-ratio:1;background:var(--bg);display:flex;align-items:center;justify-content:center;color:var(--muted)}
.bq-ph img{width:100%;height:100%;object-fit:cover}
.bq-ind{position:absolute;left:8px;top:8px;background:rgba(15,23,42,.78);color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px}
.bq-in{padding:9px 10px 11px}
.bq-nm{font-weight:700;font-size:14px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.bq-pr{margin-top:4px;font-weight:800;color:var(--navy2);font-size:15px}
.bq-cat{font-size:12px;color:var(--muted);margin-top:2px}
.bq-gal{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:0;margin:0 -14px;scrollbar-width:none;background:var(--bg)}
.bq-gal::-webkit-scrollbar{display:none}
.bq-gal>div{flex:0 0 100%;scroll-snap-align:center;aspect-ratio:1;display:flex;align-items:center;justify-content:center;max-height:70vh}
.bq-gal img{width:100%;height:100%;object-fit:contain}
.bq-dots{display:flex;gap:6px;justify-content:center;margin:8px 0}
.bq-dots i{width:7px;height:7px;border-radius:50%;background:var(--border);display:block}
.bq-dots i.on{background:var(--orange-d,#e8590c)}
.bq-price{font-size:26px;font-weight:800;color:var(--navy2);margin:10px 0 4px}
.bq-txt{white-space:pre-line;word-break:break-word;font-size:15px;line-height:1.5}
.bq-kv{display:flex;gap:8px;align-items:flex-start;font-size:14px;margin:6px 0}
.bq-in2{width:100%;padding:11px 14px;font-size:16px;border:1px solid var(--border);border-radius:12px;background:var(--card);color:var(--text);outline:none;font-family:inherit;box-sizing:border-box}
.bq-in2:focus{border-color:var(--sky);box-shadow:0 0 0 3px rgba(68,144,226,.2)}
.bq-lbl{display:block;font-size:13px;font-weight:700;margin:12px 0 4px}
.bq-err{color:var(--red);font-size:14px;margin:8px 2px 0}
.bq-err:empty{display:none}
`;
    document.head.appendChild(st);
  }

  /* ---------- petits outils ---------- */
  const list = v => { if (Array.isArray(v)) return v; try { const j = JSON.parse(v || '[]'); return Array.isArray(j) ? j : []; } catch (e) { return []; } };
  const prixFixe = p => p && p.prix != null && Number(p.prix) > 0;
  function prix(p) {
    if (!prixFixe(p)) return 'Prix sur demande';
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: (p.devise || 'EUR').toUpperCase() }).format(Number(p.prix)); }
    catch (e) { return Number(p.prix).toFixed(2) + ' ' + (p.devise || '€'); }
  }
  const statutDe = p => p.statut || 'disponible';
  const dispo = p => statutDe(p) === 'disponible' && Number(p.disponible) !== 0;
  const photosDe = p => (Array.isArray(p.photos) && p.photos.length ? p.photos : list(p.photos_json)).filter(Boolean);
  const fmtDate = d => { const x = String(d || '').slice(0, 10).split('-'); return x.length === 3 ? x.reverse().join('/') : ''; };
  function fail(title, e, retry) {
    setPane(title, `<div class="empty"><div class="ei">${ic('close', 'l')}</div><b>Chargement impossible</b>${esc((e && e.message) || 'Une erreur est survenue.')}<br><br><button class="btn sm" id="bq-retry">Réessayer</button></div>`);
    const b = $('#bq-retry'); if (b) b.onclick = retry;
  }
  const skeleton = '<div class="sk skc"></div><div class="sk skc" style="height:160px"></div><div class="sk skc" style="height:160px"></div>';

  /* ============================================================
     BOUTIQUE
     ============================================================ */
  async function viewBoutique(id, owner) {
    injectCss();
    const alive = guard('boutique');
    setPane('Boutique', skeleton);
    try {
      let iid = id;
      if (id === 'u') { // ancien lien profil.html?id=<compte>&vitrine=1
        const vs = (await api('/api/vitrines')).vitrines || [];
        const v = vs.find(x => Number(x.owner_user_id) === Number(owner));
        if (!v) { if (!alive()) return; return setPane('Boutique', `<div class="empty"><div class="ei">${ic('shop', 'l')}</div><b>Boutique introuvable</b>Cette boutique n’est pas visible pour le moment.<br><br><a class="btn sm" href="#/boutiques">Toutes les boutiques</a></div>`); }
        iid = v.id;
      }
      const [ri, rp, rc] = await Promise.all([
        api('/api/initiatives/' + encodeURIComponent(iid)),
        api('/api/initiatives/' + encodeURIComponent(iid) + '/produits'),
        api('/api/initiatives/' + encodeURIComponent(iid) + '/catalogues').catch(() => ({}))
      ]);
      if (!alive()) return;
      const ini = ri.initiative || {};
      const nom = ini.boutique_nom || ini.nom || 'Boutique';
      const prods = (rp.produits || []).filter(p => statutDe(p) !== 'masque');
      const cats = (rc.catalogues || []).filter(c => c.statut !== 'masque' && Number(c.nb_articles) > 0);
      const lieu = [ini.ville, ini.pays].filter(Boolean).join(', ');
      const desc = strip(ini.boutique_description || ini.description || ini.slogan || '');
      const ST = { q: '', cat: '' };
      const carte = p => {
        const ph = photosDe(p)[0], ok = dispo(p);
        return `<a class="bq-p" href="#/produit/${encodeURIComponent(p.id)}"><div class="bq-ph">${ph ? `<img src="${A.attrUrl(ph)}" alt="" loading="lazy" onerror="this.remove()">` : ic('shop', 'l')}${ok ? '' : `<span class="bq-ind">${statutDe(p) === 'epuise' ? 'Épuisé' : 'Indisponible'}</span>`}</div>
          <div class="bq-in"><div class="bq-nm">${esc(p.nom)}</div><div class="bq-pr">${esc(prix(p))}</div>${p.categorie ? `<div class="bq-cat">${esc(p.categorie)}</div>` : ''}</div></a>`;
      };
      setPane(nom, `<div class="card" style="margin-bottom:12px"><div class="bq-head"><div class="bq-lg">${ini.logo_url ? `<img src="${A.attrUrl(ini.logo_url)}" alt="" onerror="this.remove()">` : esc(A.initials(nom))}</div>
          <div class="sp"><b style="font-size:18px;line-height:1.2;display:block">${esc(nom)}</b>${lieu ? `<div class="small muted">${ic('pin', 's')} ${esc(lieu)}</div>` : ''}<div class="small muted">${prods.length} article${prods.length > 1 ? 's' : ''}</div></div></div>
        ${desc ? `<div class="bq-desc">${esc(desc)}</div>` : ''}
        <div class="bq-acts">${ini.owner_user_id ? `<button class="btn out sm sp" data-write="${Number(ini.owner_user_id)}" type="button">${ic('chat', 's')} Contacter</button>` : ''}</div></div>
        ${prods.length ? `<div class="search" style="margin-bottom:10px">${ic('search', 's')}<input id="bq-q" type="search" placeholder="Rechercher un article…" aria-label="Rechercher un article"></div>` : ''}
        ${cats.length ? `<div class="chips" id="bq-cats"><button class="chip on" data-c="">Tous</button>${cats.map(c => `<button class="chip" data-c="${esc(c.id)}">${esc(c.nom)}</button>`).join('')}</div>` : ''}
        <div id="bq-list"></div>`);
      const paint = () => {
        const q = ST.q.toLowerCase();
        const a = prods.filter(p => (!ST.cat || String(p.catalogue_id) === String(ST.cat)) && (!q || [p.nom, p.categorie, p.reference, p.description].join(' ').toLowerCase().includes(q)));
        $('#bq-list').innerHTML = a.length ? `<div class="bq-grid">${a.map(carte).join('')}</div>`
          : `<div class="empty"><div class="ei">${ic('shop', 'l')}</div><b>${prods.length ? 'Aucun article' : 'Cette boutique n’a pas encore d’article'}</b>${prods.length ? 'Modifiez votre recherche ou le catalogue.' : ''}</div>`;
      };
      paint();
      const q = $('#bq-q'); if (q) { let t; q.oninput = e => { clearTimeout(t); t = setTimeout(() => { ST.q = e.target.value.trim(); paint(); }, 200); }; }
      $$('#bq-cats .chip').forEach(b => { b.onclick = () => { ST.cat = b.dataset.c; $$('#bq-cats .chip').forEach(x => x.classList.toggle('on', x === b)); paint(); }; });
      if (A.paneShare) A.paneShare(location.origin + '/profil.html?id=' + encodeURIComponent(ini.owner_user_id) + '&vitrine=1&r=' + A.jetonPartage(), nom);
    } catch (e) { if (alive()) fail('Boutique', e, () => viewBoutique(id, owner)); }
  }

  /* « Contacter » : boutons data-write, gérés par l'écouteur commun de m.js (connexion, conversation, demande de contact si les deux comptes ne sont pas encore en contact). */

  /* ============================================================
     ARTICLE
     ============================================================ */
  async function viewProduit(id) {
    injectCss();
    const alive = guard('produit');
    setPane('Article', skeleton);
    try {
      const rp = await api('/api/produits/' + encodeURIComponent(id));
      const p = rp.produit; if (!p) throw new Error('Article introuvable.');
      const ri = await api('/api/initiatives/' + encodeURIComponent(p.initiative_id)).catch(() => ({}));
      if (!alive()) return;
      const ini = ri.initiative || {};
      const nomB = ini.boutique_nom || p.initiative_nom || ini.nom || 'la boutique';
      const photos = photosDe(p), ok = dispo(p), fixe = prixFixe(p);
      const retrait = Number(p.livraison_retrait) !== 0, expedition = Number(p.livraison_expedition) === 1;
      const devisOn = (p.devis_active != null ? Number(p.devis_active) : Number(ini.vitrine_devis_active || 0)) === 1;
      const proprio = S.me && Number(S.me.id) === Number(p.owner_user_id);
      const statutTxt = ok ? 'Disponible' : (statutDe(p) === 'epuise' ? 'Épuisé' : 'Indisponible');
      const liv = [retrait ? 'Retrait sur place' : '', expedition ? 'Expédition' + (p.frais_expedition != null && Number(p.frais_expedition) > 0 ? ' (' + Number(p.frais_expedition).toFixed(2).replace('.', ',') + ' €)' : '') : ''].filter(Boolean).join(' · ');
      const body = `${photos.length ? `<div class="bq-gal" id="bq-gal">${photos.map(u => `<div><img src="${A.attrUrl(u)}" alt="${esc(p.nom)}" loading="lazy" onerror="this.remove()"></div>`).join('')}</div>${photos.length > 1 ? `<div class="bq-dots" id="bq-dots">${photos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}` : `<div class="bq-ph" style="border-radius:16px;margin:0 0 8px">${ic('shop', 'l')}</div>`}
        <h2 style="margin:8px 0 0;font-size:21px;line-height:1.25;word-break:break-word">${esc(p.nom)}</h2>
        <div class="bq-price">${esc(prix(p))}</div>
        <div class="tags" style="margin:0 0 10px"><span class="badge ${ok ? 'g' : ''}">${ok ? ic('check', 's') + ' ' : ''}${esc(statutTxt)}</span>${p.categorie ? `<span class="badge">${esc(p.categorie)}</span>` : ''}${p.reference ? `<span class="badge">Réf. ${esc(p.reference)}</span>` : ''}</div>
        ${!ok && p.date_retour ? `<div class="bq-kv"><b>Retour estimé :</b> ${esc(fmtDate(p.date_retour))}</div>` : ''}
        ${p.description ? `<div class="bq-txt" style="margin:8px 0 12px">${esc(strip(p.description))}</div>` : ''}
        ${liv ? `<div class="bq-kv">${ic('pin', 's')}<span><b>Livraison :</b> ${esc(liv)}</span></div>` : ''}
        <a class="card pad row" href="#/boutique/${encodeURIComponent(p.initiative_id)}" style="gap:12px;margin:14px 0 6px"><div class="bq-lg" style="width:44px;height:44px;border-radius:12px">${ini.logo_url ? `<img src="${A.attrUrl(ini.logo_url)}" alt="" onerror="this.remove()">` : esc(A.initials(nomB))}</div><div class="sp"><div class="small muted">Vendu par</div><b>${esc(nomB)}</b></div><span class="muted">›</span></a>
        ${proprio ? '<div class="small muted" style="margin-top:8px">C’est votre article. Modifiez-le depuis votre tableau de bord.</div>' : ''}`;

      /* Actions : le bas de l'écran reste visible pendant la lecture. */
      let foot = '';
      if (!proprio) {
        const principal = ok
          ? (fixe ? `<button class="btn sp" id="bq-add" type="button">${ic('shop', 's')} Ajouter au panier</button>` : `<button class="btn sp" id="bq-ask" type="button">Faire une demande</button>`)
          : `<button class="btn sp" id="bq-alert" type="button">M’avertir du retour</button>`;
        foot = principal + (devisOn ? `<button class="btn out" id="bq-devis" type="button">Devis</button>` : '') + `<button class="btn out" data-write="${Number(p.owner_user_id)}" type="button" aria-label="Contacter le vendeur">${ic('chat', 's')}</button>`;
      }
      setPane(p.nom, body, foot);
      const gal = $('#bq-gal'), dots = $$('#bq-dots i');
      if (gal && dots.length) gal.addEventListener('scroll', () => { const i = Math.round(gal.scrollLeft / Math.max(1, gal.clientWidth)); dots.forEach((d, k) => d.classList.toggle('on', k === i)); }, { passive: true });
      if (A.paneShare) A.paneShare(location.origin + '/profil.html?id=' + encodeURIComponent(p.owner_user_id) + '&vitrine=1&r=' + A.jetonPartage(), p.nom);
      const clic = (sel, fn) => { const b = $(sel); if (b) b.onclick = fn; };
      clic('#bq-add', () => ajouterPanier(p, retrait, expedition));
      clic('#bq-alert', () => alerter(p));
      clic('#bq-ask', () => demande(p, expedition, retrait));
      clic('#bq-devis', () => devis(p, ini));
    } catch (e) { if (alive()) fail('Article', e, () => viewProduit(id)); }
  }

  async function ajouterPanier(p, retrait, expedition) {
    if (!(await A.needLogin('Connectez-vous pour ajouter cet article au panier.'))) return;
    const btn = $('#bq-add'); if (btn) btn.disabled = true;
    try {
      /* Même règle que sur ordinateur : l'expédition seulement si le retrait sur place n'est pas proposé. */
      const mode = expedition && !retrait ? 'expedition' : 'retrait';
      const r = await api('/api/panier', { method: 'POST', body: { produit_id: Number(p.id), quantite: 1, mode_livraison: mode } });
      toast('Ajouté au panier ✓');
      /* Pastille du panier dans la barre du haut (2026-10-13) — même principe que
         window.updatePanierBadge() sur ordinateur : se met à jour sans attendre un changement
         d'onglet. */
      if (r && r.nb_articles != null) { S.panierCount = Number(r.nb_articles) || 0; A.paintBadges(); }
      const f = $('#pane-foot'); if (f) {
        const ancien = $('#bq-add');
        if (ancien) { ancien.insertAdjacentHTML('afterend', '<a class="btn sp" id="bq-cart" href="panier.html">Voir mon panier</a>'); ancien.remove(); }
      }
    } catch (e) { toast(e.message || 'Impossible d’ajouter au panier.', true); if (btn) btn.disabled = false; }
  }

  async function alerter(p) {
    if (!(await A.needLogin('Connectez-vous pour être averti du retour de cet article.'))) return;
    try { await api('/api/produits/' + encodeURIComponent(p.id) + '/alerte', { method: 'POST', body: {} }); toast('Vous serez averti dès son retour ✓'); }
    catch (e) { toast(e.message || 'Erreur.', true); }
  }

  /* Article sans prix fixe : une demande envoyée au vendeur (comme « Commander » sur ordinateur). */
  async function demande(p, expedition, retrait) {
    if (!(await A.needLogin('Connectez-vous pour faire une demande.'))) return;
    const close = A.openSheet(`<h2 style="margin:2px 0 4px;font-size:19px">Faire une demande</h2><p class="muted small" style="margin:0 0 6px">${esc(p.nom)}</p>
      <label class="bq-lbl" for="bq-qte">Quantité</label><input id="bq-qte" class="bq-in2" type="number" min="1" value="1" inputmode="numeric">
      <label class="bq-lbl" for="bq-msg-t">Message au vendeur <span class="muted">(facultatif)</span></label><textarea id="bq-msg-t" class="bq-in2" rows="3" placeholder="Précisions, questions…"></textarea>
      <div class="bq-err" id="bq-err" role="alert"></div>
      <button class="btn block" id="bq-send" type="button" style="margin-top:12px">Envoyer la demande</button>`);
    $('#bq-send').onclick = async () => {
      const b = $('#bq-send'), err = $('#bq-err'); err.textContent = ''; b.disabled = true; b.textContent = 'Envoi…';
      try {
        await api('/api/produits/' + encodeURIComponent(p.id) + '/commander', { method: 'POST', body: { quantite: Math.max(1, Number($('#bq-qte').value) || 1), message: $('#bq-msg-t').value.trim() || null, mode_livraison: retrait || !expedition ? 'retrait' : 'expedition' } });
        close(); toast('Demande envoyée ✓');
      } catch (e) { err.textContent = e.message || 'Envoi impossible.'; b.disabled = false; b.textContent = 'Envoyer la demande'; }
    };
  }

  function devis(p, ini) {
    const me = S.me || {}, formTs = Date.now();
    const telReq = !!ini.vitrine_devis_tel_requis;
    const close = A.openSheet(`<h2 style="margin:2px 0 4px;font-size:19px">Demander un devis</h2><p class="muted small" style="margin:0 0 6px">${esc(p.nom)}</p>
      <label class="bq-lbl" for="dv-prenom">Prénom</label><input id="dv-prenom" class="bq-in2" value="${esc(me.prenom || '')}" autocomplete="given-name">
      <label class="bq-lbl" for="dv-nom">Nom</label><input id="dv-nom" class="bq-in2" value="${esc(me.nom || '')}" autocomplete="family-name">
      <label class="bq-lbl" for="dv-email">E-mail</label><input id="dv-email" class="bq-in2" type="email" value="${esc(me.email || '')}" autocomplete="email" inputmode="email">
      <label class="bq-lbl" for="dv-tel">Téléphone${telReq ? '' : ' <span class="muted">(facultatif)</span>'}</label><input id="dv-tel" class="bq-in2" type="tel" autocomplete="tel" inputmode="tel">
      <label class="bq-lbl" for="dv-qte">Quantité <span class="muted">(facultatif)</span></label><input id="dv-qte" class="bq-in2" type="number" min="1" inputmode="numeric">
      <label class="bq-lbl" for="dv-desc">Votre besoin</label><textarea id="dv-desc" class="bq-in2" rows="4" placeholder="Décrivez ce que vous souhaitez"></textarea>
      <input type="text" id="dv-site" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0;height:0">
      <div class="bq-err" id="bq-err" role="alert"></div>
      <button class="btn block" id="bq-send" type="button" style="margin-top:12px">Envoyer la demande</button>`);
    $('#bq-send').onclick = async () => {
      const err = $('#bq-err'), v = id => $('#' + id).value.trim(); err.textContent = '';
      if (!v('dv-prenom') || !v('dv-nom')) { err.textContent = 'Nom et prénom requis.'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('dv-email'))) { err.textContent = 'Adresse e-mail invalide.'; return; }
      if (telReq && !v('dv-tel')) { err.textContent = 'Téléphone requis pour cette boutique.'; return; }
      if (!v('dv-desc')) { err.textContent = 'Décrivez votre besoin.'; return; }
      const b = $('#bq-send'); b.disabled = true; b.textContent = 'Envoi…';
      try {
        await api('/api/produits/' + encodeURIComponent(p.id) + '/devis', { method: 'POST', body: {
          requester_first_name: v('dv-prenom'), requester_last_name: v('dv-nom'), requester_email: v('dv-email'), requester_phone: v('dv-tel') || null,
          quantity: v('dv-qte') || null, description: v('dv-desc'), site_perso: v('dv-site'), _form_ts: formTs } });
        close(); toast('Demande de devis envoyée ✓');
      } catch (e) { err.textContent = e.message || 'Envoi impossible.'; b.disabled = false; b.textContent = 'Envoyer la demande'; }
    };
  }

  /* ============================================================
     ROUTEUR  —  #/boutique/<id> · #/boutique/u/<compte> · #/produit/<id>
     ============================================================ */
  window.MMods = window.MMods || {};
  window.MMods.boutique = function (b, c) { return b === 'u' ? viewBoutique('u', c) : viewBoutique(b); };
  window.MMods.produit = function (b) { return viewProduit(b); };
})();
