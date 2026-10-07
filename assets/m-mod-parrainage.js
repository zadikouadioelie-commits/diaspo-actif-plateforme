/* ============================================================
   Diaspo'Actif — Version téléphone : module « Parrainage »
   Équivalent de parrainage.html : liens d'invitation (un par thème d'activité), partage / copie /
   QR code, statistiques, comptes créés grâce à vos invitations (« Centre de vision »),
   création, modification, désactivation et suppression d'une invitation.
   Routes : #/parrainage · #/parrainage/nouvelle · #/parrainage/modifier/<id>
   Le site n'envoie aucune invitation par e-mail : ce module n'en propose donc pas non plus.
   Seule la photo de couverture d'une invitation reste à gérer sur ordinateur.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast } = A;
  window.MMods = window.MMods || {};

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  if (!document.getElementById('m-mod-parrainage-css')) {
    const st = document.createElement('style');
    st.id = 'm-mod-parrainage-css';
    st.textContent = `
      .pa-in{width:100%;min-height:46px;border:1px solid var(--border);border-radius:12px;padding:10px 12px;font-size:16px;background:#fff;color:var(--text);font-family:inherit}
      .pa-lab{display:block;font-size:13px;font-weight:600;color:var(--muted);margin:14px 0 4px}
      .pa-err{color:var(--red);font-size:13px;min-height:18px;margin:8px 2px 0}
      .pa-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
      .pa-st{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:12px 8px;text-align:center;box-shadow:var(--shadow)}
      .pa-st b{display:block;font-size:24px;line-height:1.1;color:var(--navy)}
      .pa-st span{font-size:12.5px;color:var(--muted)}
      .pa-link{background:var(--bg);border:1px dashed #B8C4D6;border-radius:12px;padding:10px 12px;font-weight:600;word-break:break-all;font-size:14px;margin:0 0 12px;user-select:all}
      .pa-steps{margin:10px 0 0;padding:0;list-style:none;counter-reset:s}
      .pa-steps li{counter-increment:s;display:flex;gap:10px;align-items:flex-start;margin:0 0 8px;font-size:14px}
      .pa-steps li::before{content:counter(s);flex:none;width:24px;height:24px;border-radius:50%;background:var(--orange-d);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center}
      .pa-thumb{width:52px;height:52px;border-radius:13px;background:linear-gradient(135deg,var(--navy),var(--navy2));color:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none}
      .pa-thumb img{width:100%;height:100%;object-fit:cover}
      .pa-btns{display:flex;gap:8px}
      .pa-btns .btn{flex:1;padding:0 10px}
      .pa-qrbox{display:flex;justify-content:center;margin:2px 0 12px}
      .pa-qrbox .qr{margin:0}
    `;
    document.head.appendChild(st);
  }

  /* ---------- état ---------- */
  let seq = 0;              // numéro de la dernière navigation (écarte les réponses réseau tardives)
  let mainSeen = false;     // l'écran principal a été affiché : on peut y revenir avec « retour »
  let pendingShare = null;  // id de l'invitation à présenter (partage) dès le retour à l'écran principal
  let shown = 8;            // nombre de comptes créés affichés
  let domCache = null;      // liste des thèmes (domaines) — elle ne change pas pendant la session
  const alive = my => my === seq && /^#\/parrainage(\/|$)/.test(location.hash);

  const plural = (n, un, plu) => n + ' ' + (n > 1 ? plu : un);
  const num = v => Number(v) || 0;
  const linkOf = inv => location.origin + '/join/' + encodeURIComponent(inv.code);
  const nomOf = inv => inv.nom || inv.domaine_nom || 'Invitation';
  const sousOf = inv => inv.sous_domaine_nom || inv.sous_domaine_libre || '';
  function fmtDate(s) {
    const t = new Date(String(s || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s || '')) ? '' : 'Z'));
    return isNaN(t) ? '' : t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function retry() { window.MMods.parrainage(...location.hash.replace(/^#\/?/, '').split('/').slice(1, 3)); }
  function fail(title, e) {
    if (e && e.status === 402) A.premiumSheet('Parrainage');
    setPane(title, `<div class="empty"><div class="ei">${ic('close', 'l')}</div><b>Impossible de charger cet écran</b>${esc((e && e.message) || 'Une erreur est survenue.')}<br><br><button class="btn" id="pa-retry">Réessayer</button></div>`);
    const b = $('#pa-retry'); if (b) b.onclick = retry;
  }

  /* ---------- copier / partager ---------- */
  async function copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); toast('Lien copié ✓'); return true; }
    } catch (e) { /* on essaie la méthode de secours */ }
    try { // anciens navigateurs / contexte non sécurisé
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove();
      if (ok) { toast('Lien copié ✓'); return true; }
    } catch (e) { /* rien de plus à tenter */ }
    toast('Copie impossible : touchez le lien pour le sélectionner, puis copiez-le.', true);
    return false;
  }
  async function share(inv) {
    const url = linkOf(inv);
    const text = 'Rejoignez-moi sur Diaspo’Actif' + (inv.domaine_nom ? ' (' + inv.domaine_nom + ')' : '') + ' :';
    if (navigator.share) {
      try { await navigator.share({ title: 'Diaspo’Actif', text, url }); }
      catch (e) { if (!e || e.name !== 'AbortError') await copy(url); } // annulé par la personne = rien à faire
      return;
    }
    await copy(url);
  }

  /* ---------- point d'entrée ---------- */
  window.MMods.parrainage = function (b, c) {
    const my = ++seq;
    if (!S.me) {
      setPane('Parrainage', A.loginCard('Connectez-vous pour créer vos invitations et suivre les comptes créés grâce à vous.'));
      const g = $('#go-login'); if (g) g.onclick = () => A.openLogin(); // la connexion relance la route
      return;
    }
    if (!b) return screenMain(my);
    if (b === 'nouvelle') return screenForm(my, null);
    if (b === 'modifier' && /^\d+$/.test(c || '')) return screenForm(my, Number(c));
    location.replace('#/parrainage');
  };

  /* La route « comptes créés » ne donne que le nom du responsable. Pour une initiative ou une collectivité, on affiche
     d'abord le nom du COMPTE : on le retrouve dans l'annuaire (facultatif — sans lui, on garde le nom du responsable). */
  async function accountNames(list) {
    const out = {}, roles = new Set(list.map(p => p.role)), jobs = [];
    if (roles.has('initiative')) jobs.push(api('/api/annuaire/recherche?type=Initiative&q=').then(r => (r.initiatives || []).forEach(x => { if (x.owner_user_id != null && !out[x.owner_user_id]) out[x.owner_user_id] = x.nom; })).catch(() => { }));
    if (roles.has('collectivite')) jobs.push(api('/api/annuaire/recherche?type=' + encodeURIComponent('Collectivité') + '&q=').then(r => (r.organismes || []).forEach(x => { if (x.id != null && !out[x.id]) out[x.id] = x.nom_institution || x.nom; })).catch(() => { }));
    await Promise.all(jobs);
    return out;
  }

  /* ============================================================
     ÉCRAN PRINCIPAL
     ============================================================ */
  async function screenMain(my) {
    setPane('Parrainage', '<div class="sk skc" style="height:150px"></div><div class="sk skc" style="height:90px"></div><div class="sk skc"></div>');
    let invs, stats = null, inscrits = null, names = {};
    try {
      const soft = p => p.catch(() => null); // statistiques et comptes créés : utiles mais non bloquants
      let r;
      [r, stats, inscrits] = await Promise.all([api('/api/parrainage/invitations'), soft(api('/api/parrainage/mon-tableau-de-bord')), soft(api('/api/parrainage/centre-vision'))]);
      invs = r.invitations || [];
      names = inscrits && inscrits.inscrits ? await accountNames(inscrits.inscrits) : {};
    } catch (e) { if (alive(my)) fail('Parrainage', e); return; }
    if (!alive(my)) return;
    mainSeen = true;

    const actives = invs.filter(i => i.statut === 'active');
    const st = stats || { nb_actives: actives.length, total_vues: invs.reduce((n, i) => n + num(i.visit_count), 0), total_scans: invs.reduce((n, i) => n + num(i.qr_scan_count), 0), total_inscriptions: invs.reduce((n, i) => n + num(i.registration_count), 0) };
    const main = actives[0]; // la plus récente (la liste arrive triée par date décroissante)

    let html = `<div class="card hero"><div class="pad">
      <div class="small" style="font-weight:700;color:var(--orange-d)">Parrainage et invitations</div>
      <h2 style="margin:6px 0 6px;font-size:20px;line-height:1.25">Faites grandir la communauté</h2>
      <p class="muted small" style="margin:0">Chaque invitation porte un thème d’activité : la personne invitée arrive directement dans le bon contexte, sans ressaisir ce qu’elle a déjà indiqué à travers vous. Elle s’abonne aussi automatiquement à votre compte.</p>
      <ul class="pa-steps"><li><span>Créez une invitation et choisissez son thème.</span></li><li><span>Partagez le lien ou le QR code.</span></li><li><span>Suivez ici les comptes créés grâce à vous.</span></li></ul></div></div>`;

    if (main) {
      html += `<div class="h2" style="margin-top:6px">MON LIEN D’INVITATION</div><div class="card"><div class="pad">
        <div class="small muted" style="margin-bottom:6px">${esc(nomOf(main))}${main.domaine_nom ? ' · ' + esc(main.domaine_icone || '') + ' ' + esc(main.domaine_nom) : ''}</div>
        <div class="pa-link" id="pa-main-link">${esc(linkOf(main))}</div>
        <div class="pa-btns"><button class="btn" id="pa-main-share">${ic('share', 's')} Partager</button><button class="btn out" id="pa-main-copy">Copier</button></div>
        <button class="btn out block sm" id="pa-main-qr" style="margin-top:10px">Afficher le QR code</button></div></div>`;
    } else {
      html += `<div class="card"><div class="empty" style="padding:24px 16px"><div class="ei">${ic('gift', 'l')}</div><b>${invs.length ? 'Toutes vos invitations sont désactivées' : 'Aucune invitation pour l’instant'}</b>${invs.length ? 'Réactivez-en une ci-dessous ou créez-en une nouvelle.' : 'Créez votre première invitation pour obtenir un lien à partager.'}</div></div>`;
    }

    html += `<div class="pa-stats" role="group" aria-label="Statistiques de vos invitations">
      <div class="pa-st"><b>${num(st.nb_actives)}</b><span>Invitations actives</span></div>
      <div class="pa-st"><b>${num(st.total_vues)}</b><span>Vues du lien</span></div>
      <div class="pa-st"><b>${num(st.total_scans)}</b><span>Scans du QR code</span></div>
      <div class="pa-st"><b>${num(st.total_inscriptions)}</b><span>Comptes créés</span></div></div>`;

    if (invs.length) {
      html += `<div class="h2">MES INVITATIONS (${invs.length})</div>` + invs.map(i => {
        const actif = i.statut === 'active';
        return `<article class="card"><div class="row" data-open="${esc(i.id)}" role="button" tabindex="0" style="padding:12px 14px;cursor:pointer" aria-label="Ouvrir l’invitation ${esc(nomOf(i))}">
          <div class="pa-thumb">${i.banniere_url ? `<img src="${A.attrUrl(i.banniere_url)}" alt="" loading="lazy" onerror="this.remove()">` : ic('gift', 'l')}</div>
          <div class="sp"><b class="ell" style="display:block">${esc(nomOf(i))}</b>
            <div class="tags" style="margin:4px 0 0"><span class="badge ${actif ? 'g' : 'r'}">${actif ? 'Active' : 'Désactivée'}</span>${i.domaine_nom ? `<span class="badge">${esc(i.domaine_icone || '')} ${esc(i.domaine_nom)}</span>` : ''}</div></div>${ic('chev', 's')}</div>
          <div class="small muted" style="padding:0 14px 8px">${esc(plural(num(i.visit_count), 'vue', 'vues'))} · ${esc(plural(num(i.qr_scan_count), 'scan', 'scans'))} · ${esc(plural(num(i.registration_count), 'compte créé', 'comptes créés'))}</div>
          <div class="pa-btns" style="padding:0 14px 14px">${actif ? `<button class="btn sm" data-share="${esc(i.id)}">${ic('share', 's')} Partager</button>` : `<button class="btn sm" data-react="${esc(i.id)}">Réactiver</button>`}<button class="btn out sm" data-open="${esc(i.id)}">QR code et gestion</button></div></article>`;
      }).join('');
    }

    html += `<div class="h2">COMPTES CRÉÉS GRÂCE À VOUS${inscrits ? ' (' + (inscrits.inscrits || []).length + ')' : ''}</div>`;
    if (!inscrits) html += `<div class="card"><div class="pad small muted">La liste des comptes créés n’a pas pu être chargée. <button class="btn out sm" id="pa-reload" style="margin-left:6px">Réessayer</button></div></div>`;
    else if (!(inscrits.inscrits || []).length) html += `<div class="card"><div class="empty" style="padding:22px 16px"><div class="ei">${ic('people', 'l')}</div><b>Aucun compte créé pour l’instant</b>Partagez votre lien : chaque inscription apparaîtra ici, avec l’invitation d’origine.</div></div>`;
    else {
      const l = inscrits.inscrits;
      html += `<div class="lst">${l.slice(0, shown).map(p => {
        const resp = [p.prenom, p.nom].filter(Boolean).join(' ');
        const acct = p.role !== 'utilisateur' ? names[p.user_id] : '';
        const nm = acct || resp || 'Nouveau membre';
        const via = p.invitation_nom || p.invitation_code || 'Invitation supprimée';
        return `<div class="li" style="cursor:default"><div class="av">${p.photo_url ? `<img src="${A.attrUrl(p.photo_url)}" alt="" onerror="this.remove()">` : esc(A.initials(nm))}</div>
          <span class="sp"><span class="t">${esc(nm)}</span><br><span class="d">${esc(A.ROLE_LABEL[p.role] || p.role || '')}${p.domaine_nom ? ' · ' + esc(p.domaine_icone || '') + ' ' + esc(p.domaine_nom) : ''}${p.registered_at ? ' · inscrit le ' + esc(fmtDate(p.registered_at)) : ''}</span><br><span class="d">Via « ${esc(via)} » · ${p.source === 'qr_code' ? 'QR code' : 'lien'}</span>${acct && resp && resp !== acct ? `<br><span class="d" style="font-size:10.5px;opacity:.75">resp. ${esc(resp)}</span>` : ''}</span></div>`;
      }).join('')}</div>${l.length > shown ? `<button class="btn out block" id="pa-more" style="margin-top:10px">Voir plus (${l.length - shown})</button>` : ''}`;
    }

    setPane('Parrainage', html, `<button class="btn block" id="pa-new">${ic('plus', 's')} Nouvelle invitation</button>`);

    const find = id => invs.find(i => Number(i.id) === Number(id));
    $('#pa-new').onclick = () => { location.hash = '#/parrainage/nouvelle'; };
    if (main) {
      $('#pa-main-share').onclick = () => share(main);
      $('#pa-main-copy').onclick = () => copy(linkOf(main));
      $('#pa-main-qr').onclick = () => openInvitation(main);
    }
    $$('#pane-body [data-open]').forEach(b => {
      const go = () => { const i = find(b.dataset.open); if (i) openInvitation(i); };
      b.onclick = go;
      if (b.getAttribute('role') === 'button') b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
    $$('#pane-body [data-share]').forEach(b => b.onclick = () => { const i = find(b.dataset.share); if (i) share(i); });
    $$('#pane-body [data-react]').forEach(b => b.onclick = () => changeStatus(find(b.dataset.react), true, b));
    const more = $('#pa-more'); if (more) more.onclick = () => { shown += 8; screenMain(++seq); };
    const rl = $('#pa-reload'); if (rl) rl.onclick = () => screenMain(++seq);

    // Retour de la création : on présente tout de suite le lien de l'invitation toute neuve.
    if (pendingShare != null) { const i = find(pendingShare); pendingShare = null; if (i) openInvitation(i); }
  }

  /* ---------- feuille « invitation » : QR code, partage, gestion ---------- */
  function drawQr(el, text, tries) {
    if (!el) return;
    if (window.QRCode) {
      try { el.innerHTML = ''; new window.QRCode(el, { text, width: 200, height: 200, colorDark: '#0F2A50', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.H }); return; }
      catch (e) { el.textContent = 'QR code indisponible.'; return; }
    }
    if ((tries || 0) < 10) setTimeout(() => drawQr($('#pa-qr'), text, (tries || 0) + 1), 300); // la bibliothèque se charge en différé
    else el.innerHTML = '<span class="small muted">QR code indisponible pour le moment : utilisez le lien.</span>';
  }

  function openInvitation(inv) {
    const actif = inv.statut === 'active', url = linkOf(inv);
    const wa = 'https://wa.me/?text=' + encodeURIComponent('Rejoignez-moi sur Diaspo’Actif' + (inv.domaine_nom ? ' (' + inv.domaine_nom + ')' : '') + ' : ' + url);
    const close = A.openSheet(`
      <h2 style="margin:4px 0 4px;font-size:19px">${esc(nomOf(inv))}</h2>
      <div class="tags" style="margin:0 0 10px"><span class="badge ${actif ? 'g' : 'r'}">${actif ? 'Active' : 'Désactivée'}</span>${inv.domaine_nom ? `<span class="badge">${esc(inv.domaine_icone || '')} ${esc(inv.domaine_nom)}</span>` : ''}${sousOf(inv) ? `<span class="badge">${esc(sousOf(inv))}</span>` : ''}</div>
      ${actif ? `<div class="pa-qrbox"><div class="qr" role="img" aria-label="QR code de l’invitation"><div id="pa-qr"></div></div></div>
      <div class="pa-link" id="pa-sh-link">${esc(url)}</div>
      <div class="pa-btns"><button class="btn" id="pa-sh-share">${ic('share', 's')} Partager</button><button class="btn out" id="pa-sh-copy">Copier</button></div>
      <a class="btn out block sm" style="margin-top:10px" href="${esc(wa)}" target="_blank" rel="noopener">Envoyer par WhatsApp ${ic('out', 's')}</a>`
        : `<div style="background:var(--sky-l);border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:13.5px">Cette invitation est désactivée : son lien n’accepte plus de nouvelle inscription. Réactivez-la pour la partager de nouveau.</div>`}
      <div style="margin-top:12px">
        <div class="kv"><span>Vues du lien</span><span>${num(inv.visit_count)}</span></div>
        <div class="kv"><span>Scans du QR code</span><span>${num(inv.qr_scan_count)}</span></div>
        <div class="kv"><span>Comptes créés</span><span>${num(inv.registration_count)}</span></div>
        ${inv.created_at ? `<div class="kv"><span>Créée le</span><span>${esc(fmtDate(inv.created_at))}</span></div>` : ''}</div>
      <div class="pa-btns" style="margin-top:14px"><a class="btn out sm" href="#/parrainage/modifier/${esc(inv.id)}" id="pa-sh-edit">Modifier</a>
        <button class="btn out sm" id="pa-sh-toggle">${actif ? 'Désactiver' : 'Réactiver'}</button></div>
      <button class="btn out block sm" id="pa-sh-del" style="margin-top:10px;color:var(--red)">Supprimer cette invitation</button>
      <button class="btn out block" id="pa-sh-close" style="margin-top:10px">Fermer</button>`);
    if (actif) drawQr($('#pa-qr'), url + '?via=qr'); // « ?via=qr » permet de compter les scans à part des clics sur le lien
    const bind = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
    bind('pa-sh-share', () => share(inv));
    bind('pa-sh-copy', () => copy(url));
    bind('pa-sh-close', close);
    bind('pa-sh-edit', close);
    bind('pa-sh-toggle', async () => { const b = $('#pa-sh-toggle'); if (await changeStatus(inv, !actif, b)) close(); });
    bind('pa-sh-del', async () => {
      if (!confirm('Supprimer définitivement « ' + nomOf(inv) + ' » ?\n\nLe lien et le QR code cesseront de fonctionner immédiatement. Les comptes déjà créés grâce à cette invitation restent comptabilisés.')) return;
      const b = $('#pa-sh-del'); b.disabled = true;
      try { await api('/api/parrainage/invitations/' + encodeURIComponent(inv.id), { method: 'DELETE' }); close(); toast('Invitation supprimée'); if (alive(seq)) screenMain(++seq); }
      catch (e) { toast(e.message, true); b.disabled = false; }
    });
  }

  async function changeStatus(inv, activer, btn) {
    if (!inv) return false;
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      await api('/api/parrainage/invitations/' + encodeURIComponent(inv.id) + (activer ? '/reactiver' : '/desactiver'), { method: 'PATCH' });
      toast(activer ? 'Invitation réactivée ✓' : 'Invitation désactivée');
      if (alive(seq)) screenMain(++seq);
      return true;
    } catch (e) {
      toast(e.message, true);
      if (btn) { btn.disabled = false; btn.textContent = label; }
      return false;
    }
  }

  /* ============================================================
     CRÉER / MODIFIER UNE INVITATION
     ============================================================ */
  async function screenForm(my, editId) {
    const titre = editId ? 'Modifier l’invitation' : 'Nouvelle invitation';
    setPane(titre, '<div class="sk skc" style="height:60px"></div><div class="sk skc" style="height:60px"></div>');
    let doms, inv = null;
    try {
      if (!domCache) domCache = (await api('/api/parrainage/domaines')).domaines || [];
      doms = domCache;
      if (editId) {
        inv = ((await api('/api/parrainage/invitations')).invitations || []).find(i => Number(i.id) === editId);
        if (!inv) { if (alive(my)) setPane(titre, `<div class="empty"><div class="ei">${ic('gift', 'l')}</div><b>Invitation introuvable</b>Elle a peut-être été supprimée.<br><br><a class="btn" href="#/parrainage">Mes invitations</a></div>`); return; }
      }
    } catch (e) { if (alive(my)) fail(titre, e); return; }
    if (!alive(my)) return;

    setPane(titre, `<form id="pa-form" novalidate>
      <p class="muted small" style="margin:0 0 4px">${editId ? 'Le lien et le QR code déjà partagés restent identiques : seul ce qu’ils présentent change.' : 'Une invitation = un lien et un QR code, rattachés à un thème d’activité.'}</p>
      <label class="pa-lab" for="pa-nom">Nom de l’invitation <span style="font-weight:400">(facultatif, pour vous y retrouver)</span></label>
      <input class="pa-in" id="pa-nom" maxlength="80" placeholder="Ex. Rencontre du 20 septembre" value="${esc(inv ? inv.nom || '' : '')}">
      <label class="pa-lab" for="pa-dom">Domaine d’activité *</label>
      <select class="pa-in" id="pa-dom" required aria-describedby="pa-err"><option value="">— Choisir un domaine —</option>${doms.map(d => `<option value="${esc(d.id)}" ${inv && Number(inv.domaine_id) === Number(d.id) ? 'selected' : ''}>${esc((d.icone || '') + ' ' + d.nom)}</option>`).join('')}</select>
      <div id="pa-sous"></div>
      <p class="small muted" style="margin:14px 2px 0">La photo de couverture d’une invitation se gère depuis un ordinateur.</p>
      <p class="pa-err" id="pa-err" role="alert"></p></form>`,
      `<button class="btn block" type="submit" form="pa-form" id="pa-save">${editId ? 'Enregistrer' : 'Créer l’invitation'}</button>`);

    const sel = $('#pa-dom'), zone = $('#pa-sous');
    const drawSous = (idCur, libreCur) => {
      const d = doms.find(x => String(x.id) === sel.value);
      const subs = d ? d.sous_domaines || [] : [];
      if (subs.length) zone.innerHTML = `<label class="pa-lab" for="pa-sd">Sous-domaine <span style="font-weight:400">(facultatif)</span></label><select class="pa-in" id="pa-sd"><option value="">— Aucun —</option>${subs.map(s => `<option value="${esc(s.id)}" ${Number(s.id) === Number(idCur) ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select>`;
      else if (d) zone.innerHTML = `<label class="pa-lab" for="pa-sdl">Sous-domaine <span style="font-weight:400">(facultatif — aucune liste pour ce domaine)</span></label><input class="pa-in" id="pa-sdl" maxlength="80" placeholder="Précisez si utile" value="${esc(libreCur || '')}">`;
      else zone.innerHTML = '';
    };
    sel.onchange = () => drawSous(null, null);
    drawSous(inv ? inv.sous_domaine_id : null, inv ? inv.sous_domaine_libre : null);

    $('#pa-form').onsubmit = async ev => {
      ev.preventDefault();
      const err = $('#pa-err'); err.textContent = '';
      if (!sel.value) { err.textContent = 'Choisissez un domaine d’activité pour continuer.'; sel.focus(); return; }
      const sd = $('#pa-sd'), sdl = $('#pa-sdl');
      const body = {
        nom: $('#pa-nom').value.trim() || null,
        domaine_id: Number(sel.value),
        sous_domaine_id: sd ? Number(sd.value) || null : null,
        sous_domaine_libre: sdl ? sdl.value.trim() || null : null
      };
      // Le serveur remplace aussi la photo à chaque modification : on renvoie celle qui existe déjà pour ne pas l'effacer.
      if (inv) body.banniere_url = inv.banniere_url || null;
      const btn = $('#pa-save'); btn.disabled = true; btn.textContent = editId ? 'Enregistrement…' : 'Création…';
      try {
        if (inv) { await api('/api/parrainage/invitations/' + encodeURIComponent(inv.id), { method: 'PUT', body }); toast('Invitation modifiée ✓'); }
        else { const r = await api('/api/parrainage/invitations', { method: 'POST', body }); pendingShare = r.invitation && r.invitation.id; toast('Invitation créée ✓'); }
        if (mainSeen && history.length > 1) history.back(); else location.replace('#/parrainage');
      } catch (e) {
        err.textContent = e.message || 'Impossible d’enregistrer l’invitation. Réessayez dans un instant.';
        btn.disabled = false; btn.textContent = editId ? 'Enregistrer' : 'Créer l’invitation';
      }
    };
  }
})();
