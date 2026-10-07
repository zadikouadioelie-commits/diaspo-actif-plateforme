/* ============================================================
   Diaspo'Actif — Version téléphone : « Messages de la boutique »
   Équivalent téléphone de la section « Messages de la boutique » (id messages-vitrine) du
   tableau de bord Initiative, enrichi du suivi des demandes de devis.
   Routes :  #/msgboutique          conversations et demandes reçues via la boutique
             #/msgboutique/d/<id>   détail d'une demande de devis (+ suivi du statut)
   Les conversations s'ouvrent dans la messagerie de l'appli (#/conv/<id>).
   Compte Initiative uniquement.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, strip, ic, setPane, toast } = A;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const MODULE = 'Messages de la boutique';

  /* Statuts d'une demande de devis et transitions permises : reprises du serveur (STATUT_TRANSITIONS_DEVIS).
     Le serveur reste le vrai juge ; cette copie sert seulement à ne proposer que les boutons utiles. */
  const STATUT = {
    nouvelle: { l: 'Nouvelle demande', c: 'o' },
    en_cours: { l: 'En cours', c: '' },
    devis_envoye: { l: 'Devis envoyé', c: '' },
    acceptee: { l: 'Acceptée', c: 'g' },
    cloturee: { l: 'Clôturée', c: '' }
  };
  const SUIVANT = {
    nouvelle: [['en_cours', 'Prendre en charge', false], ['cloturee', 'Clôturer sans suite', true]],
    en_cours: [['devis_envoye', 'Marquer le devis comme envoyé', false], ['cloturee', 'Clôturer sans suite', true]],
    devis_envoye: [['acceptee', 'Marquer comme acceptée', false], ['cloturee', 'Clôturer sans suite', true]],
    acceptee: [['cloturee', 'Clôturer la demande', true]],
    cloturee: []
  };
  const statutBadge = s => { const x = STATUT[s]; return `<span class="badge ${x ? x.c : ''}">${esc(x ? x.l : 'Statut à vérifier')}</span>`; };

  /* ---------- état ---------- */
  const ST = { initFor: null, initId: null, filtre: 'tous', shown: 30, msgs: [], guests: [], nonLus: 0 };
  let NAV = 0; // jeton de navigation : un écran asynchrone obsolète ne doit jamais repeindre le panneau
  const guard = () => { const my = ++NAV; return () => my === NAV && !!S.pane && S.pane.k === 'msgboutique'; };

  function injectCss() {
    if ($('#m-mod-msgboutique-css')) return;
    const st = document.createElement('style'); st.id = 'm-mod-msgboutique-css';
    st.textContent = `
.mmb-card .mmb-main{display:block;padding:14px}
.mmb-card .mmb-pv{margin:6px 0 0;color:var(--muted);font-size:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.mmb-card.unread{border-left:4px solid var(--orange-d)}
.mmb-card.unread .mmb-pv{color:var(--text);font-weight:600}
.mmb-act{padding:0 14px 14px}
.mmb-dot{display:inline-flex;min-width:20px;height:20px;border-radius:10px;background:var(--orange-d);color:#fff;font-size:12px;font-weight:700;align-items:center;justify-content:center;padding:0 6px}
.mmb-in{width:100%;min-height:96px;padding:10px 14px;font-size:16px;border:1px solid var(--border);border-radius:12px;background:var(--card);color:var(--text);outline:none;font-family:inherit;resize:vertical;line-height:1.4}
.mmb-in:focus{border-color:var(--sky);box-shadow:0 0 0 3px rgba(68,144,226,.2)}
.mmb-err{color:var(--red);font-size:14px;margin:6px 2px 0}
.mmb-err:empty{display:none}
.mmb-txt{white-space:pre-line;word-break:break-word}
.mmb-hist{display:flex;flex-direction:column;gap:6px}
`;
    document.head.appendChild(st);
  }

  /* ---------- petits outils ---------- */
  function since(d) {
    const x = A.ago(d); if (!x) return '';
    if (x === 'à l’instant' || x === "à l'instant") return x;
    return /^\d+ (min|h|j)$/.test(x) ? 'il y a ' + x : 'le ' + x;
  }
  const quand = d => d ? (A.dateLong(d) + (A.hhmm(d) ? ' à ' + A.hhmm(d) : '')) : '';
  const humanise = k => { const t = String(k || '').replace(/[_-]+/g, ' ').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; };
  const nomClient = d => [d.requester_first_name, d.requester_last_name].filter(Boolean).join(' ') || 'Client';

  function fail(box, e, retry, title) {
    if (e && e.status === 401) { box.innerHTML = A.loginCard('Votre session a expiré. Reconnectez-vous pour continuer.'); const g = $('#go-login', box); if (g) g.onclick = () => A.openLogin(); return; }
    box.innerHTML = `<div class="empty"><div class="ei">${ic('close', 'l')}</div><b>${esc(title || 'Chargement impossible')}</b>${esc((e && e.message) || 'Une erreur est survenue.')}<br><br><button class="btn sm" data-retry>Réessayer</button></div>`;
    const b = $('[data-retry]', box); if (b) b.onclick = retry;
  }
  /* Réponse 402 : le Premium de l'initiative est expiré → feuille Premium + écran explicatif. */
  function premiumWall(title) {
    setPane(title, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Module Premium</b>Les messages de votre boutique font partie de l’abonnement Premium.<br><br><a class="btn" href="mon-abonnement.html">Voir mon abonnement</a></div>`);
    A.premiumSheet(MODULE);
  }

  /* Accès : connecté, compte Initiative. Renvoie true si on peut continuer. */
  function accessGate(title) {
    if (!S.me) { setPane(title, A.loginCard('Connectez-vous avec votre compte Initiative pour lire les messages reçus via votre boutique.')); const g = $('#go-login'); if (g) g.onclick = () => A.openLogin(); return false; }
    if (S.me.role !== 'initiative') {
      setPane(title, `<div class="empty"><div class="ei">${ic('shop', 'l')}</div><b>Réservé aux comptes Initiative</b>Les messages de la boutique concernent les comptes Initiative qui présentent leurs produits. Votre compte est de type « ${esc(A.ROLE_LABEL[S.me.role] || S.me.role)} ».<br><br><a class="btn" href="#/moi">Retour à mon espace</a></div>`);
      return false;
    }
    return true;
  }

  /* Identifiant de l'initiative du compte (même source que le tableau de bord : /api/dashboard/initiative). */
  async function getInitId() {
    if (ST.initFor === S.me.id && ST.initId) return ST.initId;
    const r = await api('/api/dashboard/initiative');
    ST.initFor = S.me.id; ST.initId = r.initiative ? r.initiative.id : null;
    return ST.initId;
  }

  /* ============================================================
     LISTE
     ============================================================ */
  function convCard(m) {
    const nl = Number(m.non_lus) || 0;
    const apercu = strip(m.apercu || '') || 'Nouvelle conversation';
    const dv = m.devis;
    return `<article class="card mmb-card ${nl ? 'unread' : ''}"><a class="mmb-main" href="#/conv/${Number(m.conversation_id)}">
        <div class="row"><div class="av">${esc(A.initials(m.autre_nom))}</div>
          <div class="sp"><b class="ell" style="display:block">${esc(m.autre_nom || 'Client')}</b><div class="small muted">${esc(since(m.date))}</div></div>
          ${nl ? `<span class="mmb-dot" aria-label="${nl} message${nl > 1 ? 's' : ''} non lu${nl > 1 ? 's' : ''}">${nl}</span>` : ''}</div>
        <p class="mmb-pv">${esc(apercu)}</p>
        ${(m.produit || dv) ? `<div class="tags">${m.produit ? `<span class="badge">${ic('shop', 's')} ${esc(m.produit.nom)}${m.produit.reference ? ' · ' + esc(m.produit.reference) : ''}</span>` : ''}${dv ? statutBadge(dv.statut) : ''}</div>` : ''}</a>
      ${dv ? `<div class="mmb-act"><a class="btn sm out block" href="#/msgboutique/d/${Number(dv.id)}">${ic('file', 's')} Voir la demande de devis</a></div>` : ''}</article>`;
  }
  function guestCard(d) {
    return `<article class="card mmb-card"><a class="mmb-main" href="#/msgboutique/d/${Number(d.id)}">
      <div class="row"><div class="av">${esc(A.initials(nomClient(d)))}</div><div class="sp"><b class="ell" style="display:block">${esc(nomClient(d))}</b><div class="small muted">${esc(since(d.created_at))} · sans compte</div></div>${statutBadge(d.statut)}</div>
      <p class="mmb-pv">Demande de devis pour « ${esc(d.produit_nom)} »${d.quantity ? ' · quantité ' + esc(d.quantity) : ''}</p></a></article>`;
  }

  function paintList() {
    const box = $('#mmb-list'); if (!box) return;
    const f = ST.filtre;
    let items;
    if (f === 'sans') items = ST.guests;
    else if (f === 'nonlus') items = ST.msgs.filter(m => Number(m.non_lus) > 0);
    else if (f === 'devis') items = ST.msgs.filter(m => m.devis);
    else items = ST.msgs;
    if (!items.length) {
      const vide = { tous: ['Aucun message pour le moment', 'Quand un visiteur vous écrira depuis votre boutique ou demandera un devis, sa conversation apparaîtra ici.'], nonlus: ['Tout est lu', 'Vous n’avez aucun message en attente de lecture.'], devis: ['Aucune demande de devis', 'Les demandes de devis envoyées par des comptes connectés apparaîtront ici.'], sans: ['Aucune demande sans compte', 'Les demandes de devis de visiteurs sans compte apparaîtront ici ; vous pourrez leur répondre par e-mail.'] }[f];
      box.innerHTML = `<div class="empty"><div class="ei">${ic(f === 'sans' ? 'file' : 'chat', 'l')}</div><b>${vide[0]}</b>${vide[1]}</div>`;
      $('#mmb-more').innerHTML = ''; return;
    }
    const shown = items.slice(0, ST.shown);
    box.innerHTML = shown.map(f === 'sans' ? guestCard : convCard).join('');
    $('#mmb-more').innerHTML = items.length > ST.shown ? `<button class="btn out block" id="mmb-next">Voir plus (${items.length - ST.shown})</button>` : '';
    const n = $('#mmb-next'); if (n) n.onclick = () => { ST.shown += 30; paintList(); };
  }

  async function viewList() {
    injectCss();
    const alive = guard();
    if (!accessGate(MODULE)) return;
    setPane(MODULE, '<div class="sk skc" style="height:90px"></div><div class="sk skc" style="height:90px"></div><div class="sk skc" style="height:90px"></div>');
    let r1, r2 = { demandes: [] }, initId;
    try {
      initId = await getInitId();
      if (!alive()) return;
      if (!initId) {
        setPane(MODULE, `<div class="empty"><div class="ei">${ic('shop', 'l')}</div><b>Aucune initiative liée</b>Ce compte n’a pas encore créé son initiative ni sa boutique. Complétez-la sur ordinateur pour recevoir des messages.<br><br><a class="btn" href="dashboard-initiative.html">Ouvrir mon tableau de bord</a></div>`);
        return;
      }
      r1 = await api(`/api/initiatives/${initId}/vitrine-messages`);
      /* Les demandes de devis de visiteurs sans compte n'ont pas de conversation : seconde liste, facultative. */
      try { r2 = await api(`/api/initiatives/${initId}/devis-demandes`); } catch (e) { if (e.status === 402) throw e; }
    } catch (e) {
      if (!alive()) return;
      if (e.status === 402) return premiumWall(MODULE);
      setPane(MODULE, '<div id="mmb-box"></div>'); return fail($('#mmb-box'), e, viewList, 'Messages indisponibles');
    }
    if (!alive()) return;
    ST.msgs = r1.messages || []; ST.guests = r2.demandes || []; ST.nonLus = Number(r1.total_non_lus) || 0;
    const nDevis = ST.msgs.filter(m => m.devis).length, nNon = ST.msgs.filter(m => Number(m.non_lus) > 0).length;
    if (!['tous', 'nonlus', 'devis', 'sans'].includes(ST.filtre)) ST.filtre = 'tous';
    ST.shown = 30;
    setPane(MODULE, `<p class="muted small" style="margin:0 4px 10px">Conversations issues de votre boutique. Chaque message peut être lié à un produit précis.</p>
      <div class="chips" role="tablist">${[['tous', 'Toutes', ST.msgs.length], ['nonlus', 'Non lus', nNon], ['devis', 'Devis', nDevis], ['sans', 'Sans compte', ST.guests.length]].map(([k, l, n]) => `<button class="chip ${ST.filtre === k ? 'on' : ''}" role="tab" aria-selected="${ST.filtre === k}" data-f="${k}">${l} <span class="n">${n}</span></button>`).join('')}</div>
      <div id="mmb-list"></div><div id="mmb-more"></div>
      <button class="btn out block" id="mmb-refresh" style="margin-top:6px">↺ Actualiser</button>`);
    $$('#pane-body [data-f]').forEach(b => b.onclick = () => { ST.filtre = b.dataset.f; ST.shown = 30; $$('#pane-body [data-f]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); }); paintList(); });
    $('#mmb-refresh').onclick = viewList;
    paintList();
  }

  /* ============================================================
     DÉTAIL D'UNE DEMANDE DE DEVIS
     ============================================================ */
  async function viewDevis(rawId) {
    injectCss();
    const alive = guard(); const id = Number(rawId);
    const TITLE = 'Demande de devis';
    if (!accessGate(TITLE)) return;
    setPane(TITLE, '<div class="sk skc" style="height:200px"></div>');
    let r;
    try { r = await api('/api/devis-demandes/' + id); }
    catch (e) {
      if (!alive()) return;
      if (e.status === 402) return premiumWall(TITLE);
      if (e.status === 403 || e.status === 404) return setPane(TITLE, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>${e.status === 404 ? 'Demande introuvable' : 'Accès refusé'}</b>${esc(e.message)}<br><br><a class="btn" href="#/msgboutique">Retour aux messages</a></div>`);
      setPane(TITLE, '<div id="mmb-box"></div>'); return fail($('#mmb-box'), e, () => viewDevis(rawId), 'Demande indisponible');
    }
    if (!alive()) return;
    const d = r.demande || {}, hist = r.historique || [];
    const avecConv = !!d.conversation_id;
    const kv = [
      ['Quantité', d.quantity], ['Date souhaitée', d.desired_date ? A.dateLong(d.desired_date) : ''],
      ['Dimensions ou caractéristiques', d.dimensions]
    ].filter(x => x[1]);
    const extra = d.extra_fields && typeof d.extra_fields === 'object' ? Object.entries(d.extra_fields).filter(([, v]) => v !== '' && v != null && typeof v !== 'object') : [];
    const nexts = SUIVANT[d.statut] || [];
    const clientLignes = [
      d.requester_email ? `<a class="btn sm out" href="mailto:${esc(d.requester_email)}">E-mail</a>` : '',
      d.requester_phone ? `<a class="btn sm out" href="tel:${esc(String(d.requester_phone).replace(/[^+\d]/g, ''))}">Appeler</a>` : ''
    ].filter(Boolean).join('');
    const html = `<div class="card"><div class="pad">
        <div class="tags" style="margin:0 0 8px">${statutBadge(d.statut)}${avecConv ? '' : '<span class="badge">Sans compte</span>'}</div>
        <h2 style="margin:0 0 4px;font-size:20px;line-height:1.25;word-break:break-word">${esc(d.produit_nom || 'Produit')}</h2>
        ${d.produit_reference ? `<div class="small muted">Référence ${esc(d.produit_reference)}</div>` : ''}
        <div class="meta">${ic('clock', 's')}<span>Reçue le ${esc(quand(d.created_at))}</span></div></div></div>
      <div class="h2">CLIENT</div><div class="card"><div class="pad">
        <div class="row"><div class="av">${esc(A.initials(nomClient(d)))}</div><div class="sp"><b>${esc(nomClient(d))}</b>${d.requester_email ? `<div class="small muted" style="word-break:break-all">${esc(d.requester_email)}</div>` : ''}${d.requester_phone ? `<div class="small muted">${esc(d.requester_phone)}</div>` : ''}</div></div>
        ${clientLignes ? `<div class="row" style="margin-top:10px;gap:8px">${clientLignes}</div>` : ''}</div></div>
      ${(kv.length || d.description || d.additional_information || extra.length || d.attachment_url) ? `<div class="h2">DÉTAIL DE LA DEMANDE</div><div class="card"><div class="pad">
        ${kv.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}
        ${extra.map(([k, v]) => `<div class="kv"><span>${esc(humanise(k))}</span><span>${esc(v)}</span></div>`).join('')}
        ${d.description ? `<div style="padding:9px 0"><div class="small muted">Besoin exprimé</div><div class="mmb-txt">${esc(strip(d.description))}</div></div>` : ''}
        ${d.additional_information ? `<div style="padding:9px 0;border-top:1px solid var(--border)"><div class="small muted">Informations complémentaires</div><div class="mmb-txt">${esc(strip(d.additional_information))}</div></div>` : ''}
        ${d.attachment_url ? `<a class="btn sm out" style="margin-top:8px" href="${A.attrUrl(d.attachment_url)}" target="_blank" rel="noopener">${ic('doc', 's')} ${esc(d.attachment_nom || 'Pièce jointe')}</a>` : ''}</div></div>` : ''}
      <div class="h2">SUIVI</div><div class="card"><div class="pad">
        <p class="small muted" style="margin:0 0 ${nexts.length ? 10 : 0}px">${nexts.length ? 'Faites avancer la demande. Le statut n’est visible que par vous.' : 'Cette demande est clôturée : plus aucun changement de statut n’est possible.'}</p>
        <div id="mmb-st" style="display:flex;flex-direction:column;gap:8px">${nexts.map(([k, l, danger]) => `<button class="btn ${danger ? 'out' : ''} block" data-st="${k}" ${danger ? 'style="color:var(--red)"' : ''}>${esc(l)}</button>`).join('')}</div>
        <div class="mmb-err" id="mmb-sterr" role="alert"></div></div></div>
      ${avecConv ? '' : `<div class="h2">ÉCHANGES PAR E-MAIL</div><div class="card"><div class="pad">
        ${hist.length ? `<div class="mmb-hist" style="margin-bottom:12px">${hist.map(h => `<div class="b ${h.auteur_role === 'owner' ? 'out' : 'in'}" style="max-width:100%">${h.contenu ? esc(h.contenu) : ''}${h.fichier_url ? `<div><a href="${A.attrUrl(h.fichier_url)}" target="_blank" rel="noopener" style="text-decoration:underline">📎 ${esc(h.fichier_nom || 'Pièce jointe')}</a></div>` : ''}<time>${esc(quand(h.created_at))}</time></div>`).join('')}</div>` : '<p class="small muted" style="margin:0 0 10px">Aucune réponse envoyée pour l’instant.</p>'}
        ${d.statut === 'cloturee' ? '' : `<form id="mmb-rep" novalidate><label for="mmb-rmsg" class="small" style="font-weight:700;display:block;margin-bottom:6px">Votre réponse</label>
        <textarea class="mmb-in" id="mmb-rmsg" maxlength="2000" placeholder="Bonjour, merci pour votre demande…"></textarea>
        <p class="small muted" style="margin:6px 2px 0">Ce client n’a pas de compte : votre réponse lui est envoyée par e-mail.</p>
        <div class="mmb-err" id="mmb-rerr" role="alert"></div>
        <button class="btn block" type="submit" id="mmb-rsend" style="margin-top:12px">Envoyer la réponse</button></form>`}</div></div>`}`;
    setPane(TITLE, html, avecConv ? `<a class="btn block" href="#/conv/${Number(d.conversation_id)}">${ic('chat', 's')} Ouvrir la conversation</a>` : '');

    $$('#mmb-st [data-st]').forEach(b => b.onclick = async () => {
      const k = b.dataset.st;
      if (k === 'cloturee' && !confirm('Clôturer cette demande ? Vous ne pourrez plus changer son statut ensuite.')) return;
      $$('#mmb-st button').forEach(x => { x.disabled = true; });
      try { await api(`/api/devis-demandes/${id}/statut`, { method: 'PATCH', body: { statut: k } }); toast('Statut mis à jour ✓'); if (alive()) viewDevis(id); }
      catch (e) {
        if (e.status === 402) return A.premiumSheet(MODULE);
        $('#mmb-sterr').textContent = e.message; $$('#mmb-st button').forEach(x => { x.disabled = false; });
      }
    });
    const f = $('#mmb-rep'); if (f) f.onsubmit = async ev => {
      ev.preventDefault();
      const txt = $('#mmb-rmsg').value.trim(), err = $('#mmb-rerr'); err.textContent = '';
      if (!txt) { err.textContent = 'Écrivez votre réponse avant de l’envoyer.'; return; }
      const btn = $('#mmb-rsend'); btn.disabled = true; btn.textContent = 'Envoi…';
      try { await api(`/api/devis-demandes/${id}/reponses`, { method: 'POST', body: { contenu: txt } }); toast('Réponse envoyée ✓'); if (alive()) viewDevis(id); }
      catch (e) {
        if (e.status === 402) A.premiumSheet(MODULE); else err.textContent = e.message;
        btn.disabled = false; btn.textContent = 'Envoyer la réponse';
      }
    };
  }

  /* ============================================================
     ROUTEUR  —  #/msgboutique[/d/<id>]
     ============================================================ */
  window.MMods = window.MMods || {};
  window.MMods.msgboutique = function (b, c) {
    if (b === 'd' && c) return viewDevis(c);
    return viewList();
  };
})();
