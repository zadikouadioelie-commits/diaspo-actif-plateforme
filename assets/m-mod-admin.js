/* ============================================================
   Diaspo'Actif — Version téléphone : modules du compte ADMINISTRATEUR
   Équivalents des rubriques du tableau de bord administrateur (dashboard-administrateur.html), mêmes routes serveur :
     #/admin                       menu des modules
     #/admin/journal               Journal d'erreurs + contrôles de diagnostic (vérifier / réparer la base, e-mail, Premium, événements)
     #/admin/acquisition           Acquisition de membres (rétention J+7 / J+30 / J+90)
     #/admin/verif-org             Vérifications d'organisation
     #/admin/rencontres            Rencontres D'A
     #/admin/passage               Passage « Existante »
     #/admin/membres               Membres (liste, validation, suppression, historique)
     #/admin/diaspora              Diaspora Données (statistiques agrégées)
     #/admin/obs-eco               Observatoire économique
     #/admin/suppression[/<id>]    Demandes de suppression de compte (liste, dossier, messagerie, décision)
     #/admin/juniors[/<id>]        Administrateurs junior (création, droits, suspension, activité)
   Le serveur contrôle le rôle sur chaque route : ce fichier n'ajoute aucun droit, il rend les écrans utilisables au pouce.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast, safeUrl } = A;
  window.MMods = window.MMods || {};

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  if (!document.getElementById('m-mod-admin-css')) {
    const st = document.createElement('style');
    st.id = 'm-mod-admin-css';
    st.textContent = `
      .ad-in{width:100%;min-height:46px;border:1px solid var(--border);border-radius:12px;padding:10px 12px;font-size:16px;background:#fff;color:var(--text);font-family:inherit;box-sizing:border-box}
      textarea.ad-in{min-height:84px;resize:vertical}
      .ad-note{background:var(--sky-l);color:var(--navy2);border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.5;margin:0 0 12px}
      .ad-warn{background:#FFF7E0;color:#7A5200;border:1px solid #F2D27A;border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.5;margin:0 0 12px}
      .ad-ok{background:var(--green-l);color:var(--green);border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.5;margin:0 0 12px}
      .ad-res{border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.55;margin:12px 0 0;border:1.5px solid var(--border);word-break:break-word}
      .ad-res code{font-size:12px;background:rgba(0,0,0,.06);border-radius:5px;padding:1px 4px;word-break:break-all}
      .ad-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px}
      .ad-tile{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:12px 8px;text-align:center;box-shadow:var(--shadow)}
      .ad-tile b{display:block;font-size:24px;line-height:1.15;color:var(--navy)}
      .ad-tile span{font-size:12.5px;color:var(--muted)}
      .ad-row{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 0}
      .ad-row .btn{flex:1 1 140px;padding:0 12px}
      .ad-row.ad-col{flex-direction:column}
      .ad-row.ad-col .btn{flex:none}
      .ad-k{font-size:12px;font-weight:700;color:var(--muted);margin:10px 0 2px;text-transform:uppercase;letter-spacing:.02em}
      .ad-v{font-size:14.5px;word-break:break-word;white-space:pre-wrap}
      .ad-bar{height:8px;border-radius:99px;background:#E7ECF3;overflow:hidden;margin:6px 0 0}
      .ad-bar i{display:block;height:100%;border-radius:99px;background:var(--navy2)}
      .ad-line{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
      .ad-line b{font-size:14.5px}
      .ad-pre{font-size:11px;background:#F4F6FA;border-radius:8px;padding:8px;max-height:150px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:6px 0 0}
      .ad-more{display:flex;margin:6px auto 0}
      .ad-lab{display:flex;gap:10px;align-items:flex-start;padding:8px 2px;font-size:14px}
      .ad-lab input{width:20px;height:20px;margin-top:2px;flex:none}
      .ad-msg{background:#F4F6FA;border-radius:12px;padding:8px 10px;margin:0 0 8px;font-size:14px;word-break:break-word}
      .ad-msg small{display:block;color:var(--muted);font-weight:700;font-size:12px;margin-bottom:2px}
      .ad-cred{font-family:monospace;font-size:14px;background:#F4F6FA;border-radius:8px;padding:6px 8px;word-break:break-all;display:inline-block;margin:2px 0}
    `;
    document.head.appendChild(st);
  }

  /* ---------- utilitaires ---------- */
  let seq = 0;
  const alive = (my, sub) => my === seq && new RegExp('^#/admin/' + sub + '(/|$)').test(location.hash);
  const num = v => Number(v) || 0;
  const fmtNum = v => new Intl.NumberFormat('fr-FR').format(num(v));
  const fmtEur = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(num(v));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const utc = s => { if (!s) return null; const t = String(s); const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t.replace(' ', 'T') : t.replace(' ', 'T') + 'Z'); return isNaN(d) ? null : d; };
  const dt = s => { const d = utc(s); return d ? d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
  const dj = s => { const d = utc(s); return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
  const loading = () => '<div class="sk skc" style="height:90px"></div><div class="sk skc" style="height:90px"></div>';
  const empty = (txt, icon) => `<div class="empty"><div class="ei">${ic(icon || 'check', 'l')}</div>${txt}</div>`;
  const errBox = e => `<div class="ad-warn">${esc((e && e.message) || 'Une erreur est survenue.')}</div>`;
  const msgErr = e => (e && e.message) || 'Une erreur est survenue.';
  const chipsHtml = (defs, cur, attr) => `<div class="chips">${defs.map(([k, l, n]) => `<button type="button" class="chip${k === cur ? ' on' : ''}" ${attr}="${esc(k)}">${l}${n != null ? ` <span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
  const get = p => api('/api' + p);
  const send = (method, p, body) => api('/api' + p, body === undefined ? { method } : { method, body });
  const richLite = html => String(html || '').replace(/<(?!\/?(strong|b|em|i)\b)[^>]*>/gi, '').replace(/<(strong|b|em|i)\b[^>]*>/gi, '<$1>');
  const bar = (v, max, col) => `<div class="ad-bar"><i style="width:${max > 0 ? Math.max(2, Math.round(num(v) / max * 100)) : 0}%;${col ? 'background:' + col : ''}"></i></div>`;
  const copier = async txt => {
    try { await navigator.clipboard.writeText(txt); return true; } catch (e) { /* repli ci-dessous */ }
    try { const t = document.createElement('textarea'); t.value = txt; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch (e) { return false; }
  };
  const busy = async (btn, fn) => { if (btn) btn.disabled = true; try { return await fn(); } finally { if (btn) btn.disabled = false; } };

  /* ============================================================
     MENU
     ============================================================ */
  const MODULES = [
    ['journal', 'doc', 'Journal d’erreurs', 'Erreurs serveur, réparer la base, tester l’e-mail'],
    ['acquisition', 'people', 'Acquisition de membres', 'Rétention à 7, 30 et 90 jours'],
    ['verif-org', 'check', 'Vérifications d’organisation', 'Dossiers documentaires des initiatives'],
    ['rencontres', 'cal', 'Rencontres D’A', 'Demandes de rendez-vous, validation (10 points)'],
    ['passage', 'star', 'Passage « Existante »', 'Demandes de changement de statut des initiatives'],
    ['membres', 'user', 'Membres', 'Comptes inscrits, validation, suppression'],
    ['diaspora', 'pin', 'Diaspora Données', 'Statistiques agrégées et anonymisées'],
    ['obs-eco', 'brief', 'Observatoire économique', 'Valeur, transactions et indices'],
    ['suppression', 'trash', 'Demandes de suppression', 'Dossiers de suppression de compte'],
    ['juniors', 'lock', 'Administrateurs junior', 'Droits délégués, suspension, activité']
  ];
  window.MAdminModules = MODULES.map(([k, i, t, d]) => ({ t, i, h: '#/admin/' + k, d }));

  function paneMenu() {
    setPane('Administration', `<div class="ad-note">Les modules du compte administrateur, adaptés au téléphone. Les pastilles indiquent ce qui attend une décision.</div>
      <div class="lst">${MODULES.map(([k, i, t, d]) => `<a class="li" href="#/admin/${k}"><span class="ic">${ic(i)}</span><span class="sp"><span class="t">${esc(t)}</span><br><span class="d">${esc(d)}</span></span><span id="ad-b-${k}" class="badge o" hidden></span><span class="ch">${ic('chev', 's')}</span></a>`).join('')}</div>`);
    const my = ++seq;
    const set = (k, n) => { const b = $('#ad-b-' + k); if (b && my === seq && n > 0) { b.textContent = n; b.hidden = false; } };
    get('/admin/error-logs').then(r => set('journal', num(r.stats && r.stats.non_resolues))).catch(() => { });
    get('/admin/verifications-organisation?statut=en_attente').then(r => set('verif-org', (r.demandes || []).length)).catch(() => { });
    get('/admin/demandes-passage?statut=en_attente').then(r => set('passage', (r.demandes || []).length)).catch(() => { });
    Promise.all([get('/admin/rencontres?statut=demandee'), get('/admin/rencontres?statut=en_attente_validation')]).then(([a, b]) => set('rencontres', (a.rencontres || []).length + (b.rencontres || []).length)).catch(() => { });
    get('/admin/deletion-requests').then(r => set('suppression', (r.requests || []).filter(x => x.statut === 'demande_recue').length)).catch(() => { });
  }

  /* ============================================================
     1. JOURNAL D'ERREURS + DIAGNOSTIC
     ============================================================ */
  const J = { filtre: 'actif', cache: [], n: 30 };
  function viewJournal() {
    const my = ++seq; J.n = 30;
    setPane('Journal d’erreurs', `<div class="card"><div class="pad">
        <b>🧪 Contrôles de diagnostic</b>
        <p class="small muted" style="margin:4px 0 0">À lancer notamment après chaque déploiement.</p>
        <div class="ad-row ad-col">
          <button type="button" class="btn out" data-diag="schema">🗄️ Vérifier la base</button>
          <button type="button" class="btn out" data-diag="reparer">🔧 Réparer la base</button>
          <button type="button" class="btn out" data-diag="premium">👑 Impact des restrictions Premium</button>
          <button type="button" class="btn out" data-diag="email">✉️ Tester l’envoi d’e-mail</button>
          <button type="button" class="btn out" data-diag="sync">📅 Rattraper les événements manquants</button>
        </div>
        <div id="diag-res"></div></div></div>
      <div id="jr-top"></div><div id="jr-bar"></div><div id="jr-list">${loading()}</div>`);
    $$('[data-diag]').forEach(b => b.onclick = () => busy(b, () => diag(b.dataset.diag)));
    loadJournal(my);
  }
  function diagShow(html, col) { const z = $('#diag-res'); if (z) { z.innerHTML = `<div class="ad-res" style="border-color:${col};background:${col}14">${html}</div>`; z.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
  const diagWait = q => diagShow('⏳ ' + esc(q) + '…', '#94A3B8');
  const diagErr = e => { const d = e && e.data, det = d && (d.detail || d.error); return esc(e.message) + (det && det !== e.message ? `<br><code>${esc(det)}</code>` : ''); };
  async function diag(k) {
    try {
      if (k === 'schema') {
        diagWait('Vérification de la base');
        const d = await get('/admin/schema-check');
        if (d.SCHEMA_A_JOUR) diagShow(`✅ <b>Base à jour</b> — ${esc(d.colonnes_attendues)} colonnes vérifiées sur ${esc(d.moteur)}.`, '#16a34a');
        else diagShow(`⚠️ <b>${esc(d.colonnes_manquantes)} colonne(s) manquante(s)</b><br>${esc((d.detail || []).map(c => c.table + '.' + c.colonne).join(', '))}<br><span class="muted">${esc(d.remede || '')}</span>`, '#dc2626');
      } else if (k === 'reparer') {
        if (!confirm('Recréer les tables et colonnes manquantes ?\n\nAucune donnée existante n’est modifiée ni supprimée.')) return;
        diagWait('Réparation en cours');
        const d = await send('POST', '/admin/reparer-schema');
        const creees = d.tables_creees || [], echecs = d.echecs || [], colonnes = d.colonnes_ajoutees || [], absentes = d.tables_absentes || [], illisibles = d.tables_illisibles || [];
        let h = `Base passée de <b>${esc(d.tables_avant)}</b> à <b>${esc(d.tables_apres)}</b> tables.`;
        if (creees.length) h += `<br>✅ Tables créées : <code>${esc(creees.join(', '))}</code>`;
        if (colonnes.length) h += `<br>✅ Champs ajoutés : <code>${esc(colonnes.join(', '))}</code>`;
        if (d.migration && d.migration !== 'ok') h += `<br>⚠️ Migration des colonnes : ${esc(d.migration)}`;
        if (absentes.length) h += `<br><br>❌ <b>${absentes.length} table(s) déclarée(s) mais ABSENTE(S)</b> :<br><code>${esc(absentes.join(', '))}</code>`;
        if (illisibles.length) h += `<br><br>❌ <b>${illisibles.length} table(s) ILLISIBLE(S)</b> :<br>${illisibles.map(x => `<code>${esc(x.table)}</code> — ${esc(x.erreur)}`).join('<br>')}`;
        if (echecs.length) h += `<br><br>❌ <b>${echecs.length} opération(s) impossible(s)</b> :<br>${echecs.map(x => `<code>${esc(x.objet)}</code> — ${esc(x.erreur)}`).join('<br>')}`;
        if (echecs.length || absentes.length || illisibles.length) diagShow(h, '#dc2626');
        else if (creees.length || colonnes.length) diagShow('✅ <b>Base réparée</b><br>' + h, '#16a34a');
        else diagShow('✅ <b>Rien à réparer</b> — ' + h, '#16a34a');
      } else if (k === 'premium') {
        diagWait('Calcul de l’impact');
        const d = await get('/admin/premium/observations'), i = d.impact_si_activation || {}, s = i.comptes_par_statut || {}, bloques = s.expire || 0, vit = i.vitrines_passant_en_maintenance || 0, actif = !!d.application_active;
        diagShow(`<b>Restrictions ${actif ? 'ACTIVES' : 'désactivées'}</b><br>Comptes : ${s.actif || 0} actifs · ${s.bientot_expire || 0} bientôt expirés · <b>${bloques} expirés</b><br>`
          + (actif ? `Boutiques actuellement en maintenance : <b>${vit}</b><br>` + (bloques ? `<b>${bloques} compte(s) sont bloqués en ce moment.</b>` : 'Aucun compte n’est bloqué pour l’instant.')
            : `Boutiques qui passeraient en maintenance : <b>${vit}</b><br>` + (bloques ? `${bloques} compte(s) seraient bloqués dès l’activation.` : 'Activer maintenant ne bloquerait personne.')), bloques ? '#f59e0b' : '#16a34a');
      } else if (k === 'email') {
        const to = prompt('Adresse de destination du test :', '');
        if (to === null) return;
        diagWait('Envoi en cours');
        const d = await send('POST', '/admin/test-email', to ? { to } : {});
        if (d.ENVOI_REUSSI) diagShow(`✅ <b>E-mail envoyé</b> à ${esc(d.destinataire)}.<br>Vérifiez la réception — pensez aux indésirables.`, '#16a34a');
        else if (d.resultat && d.resultat.reason === 'no_key') diagShow('⚠️ <b>Aucune clé d’envoi configurée</b> sur cet environnement (RESEND_API_KEY).<br>Les e-mails ne partent pas — y compris les rappels de fin d’abonnement.', '#dc2626');
        else diagShow(`❌ <b>Envoi refusé</b><br><code>${esc(JSON.stringify(d.resultat || d).slice(0, 300))}</code>`, '#dc2626');
      } else if (k === 'sync') {
        if (!confirm('Rattraper les événements déjà publiés qui n’apparaissent pas encore sur « Événements Diaspo’Actif » ?')) return;
        diagWait('Synchronisation en cours');
        const d = await send('POST', '/admin/evenements/sync-retroactif');
        diagShow(`✅ <b>${esc(d.synchronises)}</b> événement(s) publié(s) vérifié(s) ou synchronisé(s).`, '#16a34a');
      }
    } catch (e) { diagShow('❌ ' + diagErr(e), '#dc2626'); }
  }
  async function loadJournal(my) {
    const list = $('#jr-list'); if (!list) return;
    list.innerHTML = loading();
    try {
      const r = await get('/admin/error-logs' + (J.filtre !== 'tout' ? '?statut=' + J.filtre : ''));
      if (!alive(my, 'journal')) return;
      J.cache = r.logs || [];
      const st = r.stats || {}, ar = r.auto_resolution;
      $('#jr-top').innerHTML = `${ar && ar.auto_resolues ? `<div class="ad-ok">♻️ <b>${ar.auto_resolues} erreur(s) ancienne(s) archivée(s)</b> — un nouveau déploiement a eu lieu.${ar.restantes ? ` <b>${ar.restantes}</b> reste(nt) active(s).` : ''}</div>` : ''}
        <div class="ad-tiles"><div class="ad-tile"><b>${fmtNum(st.total_24h)}</b><span>Journalisées sur 24 h</span></div><div class="ad-tile"><b style="color:var(--red)">${fmtNum(st.non_resolues)}</b><span>Non résolues</span></div></div>`;
      $('#jr-bar').innerHTML = chipsHtml([['actif', '🔴 Actives'], ['resolu', '✅ Résolues'], ['tout', 'Tout']], J.filtre, 'data-jf')
        + `<div class="ad-row" style="margin:0 0 12px"><button type="button" class="btn out sm" id="jr-ref">↺ Rafraîchir</button><button type="button" class="btn out sm" id="jr-copy">📋 Copier le rapport</button><button type="button" class="btn out sm" id="jr-purge" style="color:var(--red)">🗑 Purger les résolues</button></div>`;
      $$('[data-jf]').forEach(b => b.onclick = () => { J.filtre = b.dataset.jf; J.n = 30; loadJournal(my); });
      $('#jr-ref').onclick = () => loadJournal(my);
      $('#jr-copy').onclick = async () => {
        if (!J.cache.length) { toast('Aucune erreur à copier pour ce filtre.'); return; }
        const txt = ['RAPPORT D’ERREURS — ' + ({ actif: 'Actives', resolu: 'Résolues', tout: 'Toutes' }[J.filtre]) + ' (' + J.cache.length + ')', ''].concat(J.cache.map((l, i) => [`#${i + 1} — ${l.created_at ? String(l.created_at).slice(0, 19).replace('T', ' ') : '—'}${l.resolu ? ' — Résolue' : ''}`, l.context ? 'Contexte : ' + l.context : null, [l.method, l.url].filter(Boolean).length ? 'Route : ' + [l.method, l.url].filter(Boolean).join(' ') : null, 'Message : ' + (l.message || '—'), l.stack ? 'Pile :\n' + l.stack : null, ''].filter(x => x !== null).join('\n'))).join('\n');
        toast((await copier(txt)) ? 'Rapport copié (' + J.cache.length + ' erreur(s)).' : 'Copie impossible sur cet appareil.', false);
      };
      $('#jr-purge').onclick = async () => {
        if (!confirm('Purger définitivement toutes les erreurs marquées résolues ?')) return;
        try { await send('DELETE', '/admin/error-logs'); toast('Erreurs résolues purgées.'); loadJournal(my); } catch (e) { toast(msgErr(e), true); }
      };
      list.innerHTML = J.cache.length ? J.cache.slice(0, J.n).map(l => `<div class="card"><div class="pad">
          <div style="font-weight:700;color:var(--red);word-break:break-word">${esc(l.message || '—')}</div>
          <div class="small muted" style="margin-top:3px;word-break:break-all">${l.context ? '<b>' + esc(l.context) + '</b> · ' : ''}${l.method ? esc(l.method) + ' ' : ''}${esc(l.url || '')}</div>
          <div class="small muted">${esc(dt(l.created_at))}</div>
          ${l.stack ? `<details style="margin-top:6px"><summary class="small muted">Pile d’appels</summary><pre class="ad-pre">${esc(l.stack)}</pre></details>` : ''}
          <div style="margin-top:8px">${l.resolu ? '<span class="badge g">✅ Résolue</span>' : `<button type="button" class="btn sm" data-res="${l.id}" style="background:#16a34a;border-color:#16a34a">✅ Marquer résolue</button>`}</div></div></div>`).join('') + (J.cache.length > J.n ? `<button type="button" class="btn out ad-more" id="jr-more">Voir plus (${J.cache.length - J.n})</button>` : '') : empty('Aucune erreur.');
      const jm = $('#jr-more'); if (jm) jm.onclick = () => { J.n += 30; loadJournal(my); };
      $$('[data-res]', list).forEach(b => b.onclick = () => busy(b, async () => { try { await send('PATCH', '/admin/error-logs/' + b.dataset.res); loadJournal(my); } catch (e) { toast(msgErr(e), true); } }));
    } catch (e) { if (alive(my, 'journal')) list.innerHTML = errBox(e); }
  }

  /* ============================================================
     2. ACQUISITION DE MEMBRES (rétention)
     ============================================================ */
  async function viewAcquisition() {
    const my = ++seq;
    setPane('Acquisition de membres', loading());
    try {
      const r = await get('/admin/retention'); if (!alive(my, 'acquisition')) return;
      const defs = [['j7', 'Rétention J+7', '#059669', 'Inscrits il y a 7 à 14 jours, actifs dans les 7 derniers jours.'], ['j30', 'Rétention J+30', '#0891B2', 'Inscrits il y a 30 à 60 jours, actifs ce mois.'], ['j90', 'Rétention J+90', '#7C3AED', 'Inscrits il y a 90 à 180 jours, toujours actifs.']];
      setPane('Acquisition de membres', `<div class="ad-note">Taux de rétention basé sur l’activité réelle des membres.</div>${defs.map(([k, l, c, d]) => {
        const x = r[k] || {}, taux = parseFloat(x.taux);
        return `<div class="card"><div class="pad" style="text-align:center"><div class="small muted" style="font-weight:700;text-transform:uppercase">${l}</div><div style="font-size:44px;font-weight:800;color:${c};line-height:1.1;margin:6px 0">${isNaN(taux) ? '—' : taux + ' %'}</div><div class="small muted">${num(x.actifs)} / ${num(x.cohorte)} membres</div>${bar(isNaN(taux) ? 0 : taux, 100, c)}<p class="small muted" style="margin:10px 0 0">${d}</p></div></div>`;
      }).join('')}`);
    } catch (e) { if (alive(my, 'acquisition')) setPane('Acquisition de membres', errBox(e)); }
  }

  /* ============================================================
     3. VÉRIFICATIONS D'ORGANISATION / 5. PASSAGE « EXISTANTE »
     ============================================================ */
  const V = { statut: 'en_attente' };
  function viewVerifOrg() {
    const my = ++seq;
    setPane('Vérifications d’organisation', `<div class="ad-note">Dossiers (numéro + document) soumis par les initiatives pour obtenir le badge d’organisation vérifiée.</div><div id="vo-bar"></div><div id="vo-list">${loading()}</div>`);
    loadVerifOrg(my);
  }
  async function loadVerifOrg(my) {
    $('#vo-bar').innerHTML = chipsHtml([['en_attente', '⏳ En attente'], ['verifiee', '✅ Vérifiées'], ['rejetee', '❌ Rejetées']], V.statut, 'data-vs');
    $$('[data-vs]').forEach(b => b.onclick = () => { V.statut = b.dataset.vs; loadVerifOrg(my); });
    const list = $('#vo-list'); list.innerHTML = loading();
    try {
      const r = await get('/admin/verifications-organisation?statut=' + V.statut); if (!alive(my, 'verif-org')) return;
      const l = r.demandes || [];
      list.innerHTML = l.length ? l.map(d => `<div class="card"><div class="pad">
          <div style="font-weight:700">${esc(d.initiative_nom)} <span class="small muted">— ${esc(d.type_compte || '')}</span></div>
          <div class="small muted">Numéro déclaré : ${d.numero ? esc(d.numero) : '—'}</div>
          <div class="small muted">Soumis le ${esc(dt(d.created_at))}</div>
          ${d.motif_alerte ? `<div class="ad-warn" style="margin:8px 0 0">⚠️ ${esc(d.motif_alerte)}</div>` : ''}
          ${d.statut === 'rejetee' && d.motif_rejet ? `<div class="small" style="color:var(--red);margin-top:6px">Motif du rejet : ${esc(d.motif_rejet)}</div>` : ''}
          ${d.document_url ? `<a class="btn out sm" style="margin-top:8px" href="${esc(safeUrl ? safeUrl(d.document_url) : d.document_url)}" target="_blank" rel="noopener">📄 Voir le document</a>` : '<div class="small muted" style="margin-top:6px">Aucun document joint.</div>'}
          ${d.statut === 'en_attente' ? `<div class="ad-row"><button type="button" class="btn" data-ok="${d.id}" style="background:#16a34a;border-color:#16a34a">✅ Valider</button><button type="button" class="btn out" data-ko="${d.id}" style="color:var(--red)">❌ Rejeter</button></div>` : ''}</div></div>`).join('') : empty('Aucun dossier dans cette catégorie.');
      const dec = (id, body) => send('PUT', '/admin/verifications-organisation/' + id, body).then(() => { toast('Décision enregistrée.'); loadVerifOrg(my); }).catch(e => toast(msgErr(e), true));
      $$('[data-ok]', list).forEach(b => b.onclick = () => busy(b, () => dec(b.dataset.ok, { decision: 'verifiee' })));
      $$('[data-ko]', list).forEach(b => b.onclick = () => { const m = prompt('Motif du rejet (visible par l’initiative) :', ''); if (m === null) return; if (!m.trim()) { toast('Un motif est requis.', true); return; } busy(b, () => dec(b.dataset.ko, { decision: 'rejetee', motif_rejet: m.trim() })); });
    } catch (e) { if (alive(my, 'verif-org')) list.innerHTML = errBox(e); }
  }

  const P = { statut: 'en_attente' };
  function viewPassage() {
    const my = ++seq;
    setPane('Passage « Existante »', `<div class="ad-note">Demandes de passage du statut « En création » au statut « Existante ».</div><div id="dp-bar"></div><div id="dp-list">${loading()}</div>`);
    loadPassage(my);
  }
  async function loadPassage(my) {
    $('#dp-bar').innerHTML = chipsHtml([['en_attente', '⏳ En attente'], ['approuvee', '✅ Approuvées'], ['refusee', '❌ Refusées']], P.statut, 'data-ps');
    $$('[data-ps]').forEach(b => b.onclick = () => { P.statut = b.dataset.ps; loadPassage(my); });
    const list = $('#dp-list'); list.innerHTML = loading();
    try {
      const r = await get('/admin/demandes-passage?statut=' + P.statut); if (!alive(my, 'passage')) return;
      const l = r.demandes || [];
      list.innerHTML = l.length ? l.map(d => `<div class="card"><div class="pad">
          <div style="font-weight:700">${esc(d.initiative_nom)} <span class="small muted">— ${esc(d.initiative_type || '')}</span></div>
          <div class="small muted">Avancement au moment de la demande : <b>${esc(d.avancement_pourcentage_snapshot)} %</b></div>
          <div class="small muted">Soumis le ${esc(dt(d.created_at))}</div>
          ${d.message ? `<div class="ad-msg" style="margin-top:8px">${esc(d.message)}</div>` : ''}
          ${d.statut === 'refusee' && d.motif_refus ? `<div class="small" style="color:var(--red);margin-top:6px">Motif du refus : ${esc(d.motif_refus)}</div>` : ''}
          ${d.statut === 'en_attente' ? `<div class="ad-row"><button type="button" class="btn" data-ok="${d.id}" style="background:#16a34a;border-color:#16a34a">✅ Approuver</button><button type="button" class="btn out" data-ko="${d.id}" style="color:var(--red)">❌ Refuser</button></div>` : ''}</div></div>`).join('') : empty('Aucune demande dans cette catégorie.');
      const dec = (id, body) => send('PUT', '/admin/demandes-passage/' + id, body).then(() => { toast('Décision enregistrée.'); loadPassage(my); }).catch(e => toast(msgErr(e), true));
      $$('[data-ok]', list).forEach(b => b.onclick = () => busy(b, () => dec(b.dataset.ok, { decision: 'approuvee' })));
      $$('[data-ko]', list).forEach(b => b.onclick = () => { const m = prompt('Motif du refus (visible par l’initiative) :', ''); if (m === null) return; if (!m.trim()) { toast('Un motif est requis.', true); return; } busy(b, () => dec(b.dataset.ko, { decision: 'refusee', motif_refus: m.trim() })); });
    } catch (e) { if (alive(my, 'passage')) list.innerHTML = errBox(e); }
  }

  /* ============================================================
     4. RENCONTRES D'A
     ============================================================ */
  const RDV = [['demandee', '📥 À traiter'], ['reportee', '⏭️ Reportées'], ['planifiee', '📅 Rendez-vous fixé'], ['en_attente_validation', '⏳ À valider'], ['validee', '✅ Validées'], ['non_validee', '🚫 Non validées'], ['refusee', '✖️ Écartées']];
  const RDV_COL = { demandee: '#F59E0B', reportee: '#F97316', planifiee: '#3B82F6', en_attente_validation: '#8B5CF6', validee: '#22C55E', non_validee: '#EF4444', refusee: '#94A3B8' };
  const R = { statut: 'demandee' };
  function viewRencontres() {
    const my = ++seq;
    setPane('Rencontres D’A', `<div class="ad-note">Chaque rencontre vaut 10 points d’indice de fiabilité, accordés uniquement par vous : c’est « Valider » qui les attribue, pas le fait que le rendez-vous ait eu lieu.</div><div id="rd-bar"></div><div id="rd-list">${loading()}</div>`);
    loadRencontres(my);
  }
  const piecesHtml = json => {
    let p = []; try { p = typeof json === 'string' ? JSON.parse(json || '[]') : (json || []); } catch (e) { p = []; }
    if (!Array.isArray(p) || !p.length) return '';
    return `<div class="ad-k">Pièces jointes (${p.length})</div><div class="ad-row" style="margin:4px 0 0">${p.map(x => `<a class="btn out sm" style="flex:0 1 auto" href="${esc(safeUrl ? safeUrl(x.url) : x.url)}" target="_blank" rel="noopener noreferrer">${/\.(jpg|jpeg|png|gif|webp)$/i.test(x.url || '') ? '🖼️' : '📄'} ${esc(x.nom || 'Document')}</a>`).join('')}</div>`;
  };
  const kv = (k, v) => v ? `<div class="ad-k">${k}</div><div class="ad-v">${esc(v)}</div>` : '';
  const rdvDate = d => d ? String(d).slice(0, 16).replace('T', ' ') : '—';
  async function loadRencontres(my) {
    $('#rd-bar').innerHTML = chipsHtml(RDV.map(([k, l]) => [k, l]), R.statut, 'data-rs');
    $$('[data-rs]').forEach(b => b.onclick = () => { R.statut = b.dataset.rs; loadRencontres(my); });
    const list = $('#rd-list'); list.innerHTML = loading();
    try {
      const r = await get('/admin/rencontres?statut=' + encodeURIComponent(R.statut)); if (!alive(my, 'rencontres')) return;
      const l = r.rencontres || [];
      list.innerHTML = l.length ? l.map(x => {
        const nom = [x.membre_prenom, x.membre_nom].filter(Boolean).join(' ').trim() || x.membre_email;
        let act = '';
        if (x.statut === 'demandee' || x.statut === 'reportee') {
          act = `<div class="ad-k">Planifier</div><input type="datetime-local" class="ad-in" id="rd-d-${x.id}"><input type="text" class="ad-in" id="rd-l-${x.id}" placeholder="Lien de visio ou adresse" style="margin-top:8px">
            <div class="ad-row"><button type="button" class="btn" data-a="planifier" data-id="${x.id}">📅 Planifier le rendez-vous</button>${x.statut === 'demandee' ? `<button type="button" class="btn out" data-a="reporter" data-id="${x.id}">⏭️ Reporter</button>` : ''}<button type="button" class="btn out" data-a="refuser" data-id="${x.id}">✖️ Écarter la demande</button></div><p class="small muted" style="margin:6px 0 0">Durée à prévoir : 30 à 45 minutes.</p>`;
        } else if (x.statut === 'planifiee') {
          act = `<div class="ad-k">Après le rendez-vous</div><textarea class="ad-in" id="rd-c-${x.id}" placeholder="Compte rendu de l’échange (facultatif)"></textarea>
            <div class="ad-row"><button type="button" class="btn" data-a="valider" data-id="${x.id}">✅ Valider — 10 points</button><button type="button" class="btn out" data-a="attente" data-id="${x.id}">⏳ En attente de validation</button><button type="button" class="btn out" data-a="ne_pas_valider" data-id="${x.id}">🚫 Ne pas valider</button></div>`;
        } else if (x.statut === 'en_attente_validation') {
          act = `<div class="ad-row"><button type="button" class="btn" data-a="valider" data-id="${x.id}">✅ Valider — 10 points</button><button type="button" class="btn out" data-a="ne_pas_valider" data-id="${x.id}">🚫 Ne pas valider</button></div>`;
        }
        return `<div class="card" style="border-left:5px solid ${RDV_COL[x.statut] || '#94A3B8'}"><div class="pad">
          <div style="font-weight:800;font-size:16px">${esc(nom)}</div>
          <div class="small muted" style="word-break:break-word">${esc(x.membre_email || '')}${x.membre_ville ? ' · ' + esc(x.membre_ville) : ''} · ${esc(x.membre_role || '')}</div>
          <div class="small muted">${x.mode === 'presentiel' ? '📍 En présentiel' : '🎥 En visioconférence'} · demandé le ${esc(rdvDate(x.created_at))}</div>
          ${x.telephone ? `<div class="ad-k">📞 Téléphone / WhatsApp</div><div class="ad-v"><a href="tel:${esc(x.telephone)}" style="text-decoration:underline">${esc(x.telephone)}</a></div>` : ''}
          ${kv('Message du membre', x.message)}${kv('Disponibilités indiquées', x.disponibilites)}${piecesHtml(x.pieces_json)}
          ${kv('Rendez-vous prévu', x.date_prevue ? rdvDate(x.date_prevue) + (x.lieu_ou_lien ? ' — ' + x.lieu_ou_lien : '') : '')}
          ${kv('Rencontre effectuée le', x.date_rencontre ? rdvDate(x.date_rencontre) : '')}${kv('Compte rendu', x.compte_rendu)}${kv('Motif communiqué au membre', x.motif_refus)}
          ${kv('Nouvelle demande possible à partir du', x.date_reouverture ? String(x.date_reouverture).slice(0, 10) : '')}${kv('Traité par', x.agent_nom)}
          ${act}</div></div>`;
      }).join('') : empty('Aucune rencontre dans cette catégorie.');
      $$('[data-a]', list).forEach(b => b.onclick = () => {
        const id = b.dataset.id, a = b.dataset.a, corps = { action: a };
        if (a === 'planifier') { const d = ($('#rd-d-' + id) || {}).value; if (!d) { toast('Indiquez la date et l’heure du rendez-vous.', true); return; } corps.date_prevue = d.replace('T', ' '); corps.lieu_ou_lien = ($('#rd-l-' + id) || {}).value || ''; }
        if (a === 'valider' || a === 'attente') corps.compte_rendu = ($('#rd-c-' + id) || {}).value || '';
        if (a === 'ne_pas_valider') { const m = prompt('Motif de la non-validation — il sera transmis au membre (10 caractères minimum) :'); if (m === null) return; if (m.trim().length < 10) { toast('Le motif doit faire au moins 10 caractères.', true); return; } corps.motif_refus = m.trim(); }
        if (a === 'refuser') { const m = prompt('Motif pour écarter cette demande (facultatif) :'); if (m === null) return; corps.motif_refus = m.trim(); }
        if (a === 'valider' && !confirm('Valider cette rencontre ? 10 points seront ajoutés à l’indice de fiabilité du membre.')) return;
        busy(b, () => send('PATCH', '/admin/rencontres/' + id, corps).then(() => { toast('Rencontre mise à jour.'); loadRencontres(my); }).catch(e => toast(msgErr(e), true)));
      });
    } catch (e) { if (alive(my, 'rencontres')) list.innerHTML = errBox(e); }
  }

  /* ============================================================
     6. MEMBRES
     ============================================================ */
  const STAT_M = { valide: ['✅ Validé', 'g'], en_attente: ['⏳ En attente', 'o'], rejete: ['❌ Rejeté', 'r'], refuse: ['❌ Rejeté', 'r'], auto: ['Standard', ''] };
  const ROLES_M = [['', 'Tous'], ['utilisateur', '👤 Utilisateurs'], ['initiative', '🏢 Initiatives'], ['collectivite', '🏛️ Collectivités'], ['administrateur', '🛡️ Administrateurs']];
  const M = { liste: [], role: '', q: '', n: 25, onglet: 'actifs' };
  function viewMembres() {
    const my = ++seq;
    setPane('Membres', `<div class="ad-warn">🔐 Accès administrateur uniquement : les coordonnées sont confidentielles.</div>${chipsHtml([['actifs', '👥 Membres'], ['histo', '🕘 Suppressions']], M.onglet, 'data-mt')}<div id="mb-body">${loading()}</div>`);
    $$('[data-mt]').forEach(b => b.onclick = () => { M.onglet = b.dataset.mt; $$('[data-mt]').forEach(x => x.classList.toggle('on', x === b)); M.onglet === 'actifs' ? membresActifs(my) : membresHisto(my); });
    M.onglet === 'actifs' ? membresActifs(my) : membresHisto(my);
  }
  async function membresActifs(my) {
    const body = $('#mb-body'); body.innerHTML = loading();
    try {
      if (!M.liste.length) M.liste = (await get('/admin/membres')).membres || [];
      if (!alive(my, 'membres')) return;
      body.innerHTML = `<div class="chips" id="mb-roles"></div><input class="ad-in" type="search" id="mb-q" placeholder="🔍 Nom, e-mail, téléphone, rôle…" value="${esc(M.q)}" style="margin-bottom:10px"><div class="small muted" id="mb-n" style="margin:0 2px 8px"></div><div id="mb-list"></div>`;
      $('#mb-q').oninput = e => { M.q = e.target.value; M.n = 25; paintMembres(my); };
      paintMembres(my);
    } catch (e) { if (alive(my, 'membres')) body.innerHTML = errBox(e); }
  }
  function paintMembres(my) {
    const roles = $('#mb-roles'); if (!roles) return;
    roles.innerHTML = ROLES_M.map(([k, l]) => `<button type="button" class="chip${k === M.role ? ' on' : ''}" data-mr="${k}">${l} <span class="n">${k ? M.liste.filter(m => m.role === k).length : M.liste.length}</span></button>`).join('');
    $$('[data-mr]', roles).forEach(b => b.onclick = () => { M.role = b.dataset.mr; M.n = 25; paintMembres(my); });
    const q = norm(M.q);
    let l = M.role ? M.liste.filter(m => m.role === M.role) : M.liste;
    if (q) l = l.filter(m => norm([m.nom, m.prenom, m.email, m.telephone, m.role].join(' ')).includes(q));
    $('#mb-n').textContent = (q || M.role ? l.length + ' sur ' + M.liste.length : M.liste.length) + ' membre' + (l.length > 1 ? 's' : '');
    const box = $('#mb-list');
    box.innerHTML = (l.length ? l.slice(0, M.n).map(m => {
      const st = STAT_M[m.statut_verification] || STAT_M.auto, nom = [m.prenom, m.nom].filter(Boolean).join(' ') || m.email;
      return `<div class="card"><div class="pad"><div class="ad-line"><b style="word-break:break-word">${esc(nom)}</b><span class="badge ${st[1]}">${st[0]}</span></div>
        <div class="small muted">${esc(m.role)} · inscrit le ${esc(dj(m.created_at))}${m.ville ? ' · ' + esc(m.ville) : ''}</div>
        <div style="margin-top:6px;word-break:break-all"><a href="mailto:${esc(m.email)}" style="text-decoration:underline">${esc(m.email)}</a></div>
        ${m.telephone ? `<div><a href="tel:${esc(m.telephone)}" style="text-decoration:underline">${esc(m.telephone)}</a></div>` : ''}
        <div class="ad-row">${m.statut_verification === 'en_attente' ? `<button type="button" class="btn sm" data-val="${m.id}">Valider</button>` : ''}<a class="btn out sm" href="#/profil/${encodeURIComponent(m.id)}">Voir le profil</a><button type="button" class="btn out sm" style="color:var(--red)" data-del="${m.id}" data-nom="${esc(nom)}">Supprimer</button></div></div></div>`;
    }).join('') : empty('Aucun membre ne correspond à cette recherche.', 'user'))
      + (l.length > M.n ? `<button type="button" class="btn out ad-more" id="mb-more">Voir plus (${l.length - M.n})</button>` : '');
    const more = $('#mb-more'); if (more) more.onclick = () => { M.n += 25; paintMembres(my); };
    $$('[data-val]', box).forEach(b => b.onclick = () => busy(b, async () => { try { await send('PATCH', '/admin/comptes/' + b.dataset.val + '/valider'); const m = M.liste.find(x => String(x.id) === b.dataset.val); if (m) m.statut_verification = 'valide'; toast('Compte validé.'); paintMembres(my); } catch (e) { toast(msgErr(e), true); } }));
    $$('[data-del]', box).forEach(b => b.onclick = () => {
      const nom = b.dataset.nom;
      if (!confirm('Supprimer définitivement le compte de « ' + nom + ' » ?')) return;
      const motif = prompt('Motif de la suppression de « ' + nom + ' » (facultatif) :'); if (motif === null) return;
      busy(b, async () => { try { await send('DELETE', '/admin/membres/' + b.dataset.del, { motif }); M.liste = M.liste.filter(x => String(x.id) !== b.dataset.del); toast('Compte supprimé.'); paintMembres(my); } catch (e) { toast(msgErr(e), true); } });
    });
  }
  async function membresHisto(my) {
    const body = $('#mb-body'); body.innerHTML = loading();
    try {
      const h = (await get('/admin/membres/historique-suppressions')).historique || []; if (!alive(my, 'membres')) return;
      body.innerHTML = h.length ? h.map(x => `<div class="card"><div class="pad"><div class="ad-line"><b>${esc([x.prenom, x.nom].filter(Boolean).join(' ') || '—')}</b><span class="small muted">#${esc(x.user_id)}</span></div>
          <div class="small muted" style="word-break:break-all">${esc(x.email || '—')} · ${esc(x.role || '—')}</div>
          <div class="small muted">Créé le ${esc(dj(x.date_creation_compte))} · supprimé le ${esc(dt(x.created_at))}</div>
          <div class="small muted">Par ${esc(x.admin_nom || '—')}</div>${x.motif ? `<div class="ad-msg" style="margin:8px 0 0">${esc(x.motif)}</div>` : ''}</div></div>`).join('') : empty('Aucune suppression enregistrée.', 'trash');
    } catch (e) { if (alive(my, 'membres')) body.innerHTML = errBox(e); }
  }

  /* ============================================================
     7. DIASPORA DONNÉES
     ============================================================ */
  const D = { data: null, tab: 'global' };
  const DTABS = [['global', '🌐 Globale'], ['pays', '🗺️ Pays'], ['villes', '📍 Villes'], ['domaines', '💼 Domaines'], ['scores', '⭐ Scores'], ['insights', '🤖 Insights']];
  function viewDiaspora() {
    const my = ++seq;
    setPane('Diaspora Données', `<div class="ad-ok">🔐 Données 100 % agrégées et anonymisées — aucune donnée personnelle.</div>${chipsHtml(DTABS, D.tab, 'data-dt')}<div id="ds-body">${loading()}</div>`);
    $$('[data-dt]').forEach(b => b.onclick = () => { D.tab = b.dataset.dt; $$('[data-dt]').forEach(x => x.classList.toggle('on', x === b)); paintDiaspora(my); });
    paintDiaspora(my);
  }
  const barList = (rows, lab, val, col) => { const mx = Math.max(1, ...rows.map(r => num(r[val]))); return rows.length ? rows.map(r => `<div style="margin:0 0 10px"><div class="ad-line"><span style="word-break:break-word">${esc(r[lab] || '—')}</span><b>${fmtNum(r[val])}</b></div>${bar(r[val], mx, col)}</div>`).join('') : '<p class="small muted">Aucune donnée.</p>'; };
  const cardSec = (t, inner) => `<div class="card"><div class="pad"><b>${t}</b><div style="margin-top:10px">${inner}</div></div></div>`;
  async function paintDiaspora(my) {
    const body = $('#ds-body'); if (!body) return;
    try {
      if (!D.data) { body.innerHTML = loading(); D.data = await get('/admin/diaspora-stats'); if (!alive(my, 'diaspora')) return; }
      const r = D.data, k = r.kpi || {};
      if (D.tab === 'global') {
        const tot = (r.par_domaine || []).reduce((s, d) => s + num(d.n), 0) || 1;
        body.innerHTML = `<div class="ad-tiles">${[['totalInit', 'Initiatives actives'], ['totalEvents', 'Événements ouverts'], ['totalForm', 'Formations'], ['totalPays', 'Pays représentés'], ['totalVilles', 'Villes couvertes'], ['totalAbos', 'Abonnements']].map(([c, l]) => `<div class="ad-tile"><b>${fmtNum(k[c])}</b><span>${l}</span></div>`).join('')}</div>`
          + cardSec('💼 Top 3 domaines', (r.par_domaine || []).slice(0, 3).map(d => `<div class="ad-line" style="margin:0 0 8px"><span>${esc(d.domaine)}</span><b>${fmtNum(d.n)} <span class="small muted">· ${Math.round(num(d.n) / tot * 100)} %</span></b></div>`).join('') || '<p class="small muted">Aucune donnée.</p>')
          + cardSec('📈 Nouvelles initiatives par mois', barList(r.evolution || [], 'mois', 'n', 'var(--orange-d)'))
          + cardSec('📅 Événements par mois', barList(r.evolution_events || [], 'mois', 'n', '#6366f1'));
      } else if (D.tab === 'pays') {
        body.innerHTML = cardSec('🌍 Pays d’origine', barList(r.par_origine || [], 'pays_origine', 'n', '#6366f1')) + cardSec('🏠 Pays de résidence', barList(r.par_pays_residence || [], 'pays', 'n', '#10b981'));
      } else if (D.tab === 'villes') {
        const mx = Math.max(1, ...(r.par_ville || []).map(v => num(v.n)));
        body.innerHTML = cardSec('📍 Villes par nombre d’initiatives', (r.par_ville || []).map(v => `<div style="margin:0 0 12px"><div class="ad-line"><span>${esc(v.ville)} <span class="small muted">${esc(v.pays || '')}</span></span><b>${fmtNum(v.n)}</b></div>${bar(v.n, mx, '#ef4444')}<div class="small muted">${fmtNum(v.nb_events)} événement(s) · ${fmtNum(v.total_vues)} vue(s)</div></div>`).join('') || '<p class="small muted">Aucune donnée.</p>')
          + ((r.tendance_ville || []).length ? cardSec('🔥 Tendance', r.tendance_ville.map(v => `<div class="ad-line"><span>${esc(v.ville)}</span><b>${fmtNum(v.mois_prec)} → ${fmtNum(v.ce_mois)}</b></div>`).join('')) : '');
      } else if (D.tab === 'domaines') {
        body.innerHTML = cardSec('💼 Initiatives par domaine', barList(r.par_domaine || [], 'domaine', 'n', '#f59e0b')) + cardSec('📅 Événements par domaine', barList(r.events_par_domaine || [], 'domaine', 'n', '#6366f1')) + cardSec('📚 Formations par domaine', barList(r.formations_par_domaine || [], 'domaine', 'n', '#10b981'));
      } else if (D.tab === 'scores') {
        body.innerHTML = cardSec('⭐ Initiatives les plus actives', (r.top_initiatives || []).map((x, i) => `<a class="li" style="padding:8px 0;min-height:0" href="#/profil/i/${encodeURIComponent(x.slug || x.id)}"><span class="sp"><span class="t">${i + 1}. ${esc(x.nom)}</span><br><span class="d">${esc([x.ville, x.pays].filter(Boolean).join(', '))} · ${fmtNum(x.nb_abonnes)} abonné(s) · ${fmtNum(x.nb_events)} événement(s)</span></span><span class="badge o">${esc(x.score)}</span></a>`).join('') || '<p class="small muted">Aucune donnée.</p>');
      } else {
        body.innerHTML = loading();
        const ins = await get('/admin/diaspora-stats/insights').catch(() => ({ insights: [], alertes: [] })); if (!alive(my, 'diaspora') || D.tab !== 'insights') return;
        body.innerHTML = cardSec('🤖 Analyses', (ins.insights || []).map(i => `<div class="ad-line" style="justify-content:flex-start;align-items:flex-start;margin:0 0 10px"><span style="font-size:20px">${esc(i.icone || '•')}</span><div style="font-size:14.5px;line-height:1.5">${richLite(i.texte)}</div></div>`).join('') || '<p class="small muted">Aucun insight disponible.</p>')
          + cardSec('🚨 Alertes', (ins.alertes || []).map(a => `<div class="ad-warn" style="margin:0 0 8px">${esc(a.icone || '')} ${richLite(a.texte)}</div>`).join('') || '<p class="small muted">Aucune alerte détectée. 🟢</p>');
      }
    } catch (e) { if (alive(my, 'diaspora')) body.innerHTML = errBox(e); }
  }

  /* ============================================================
     8. OBSERVATOIRE ÉCONOMIQUE
     ============================================================ */
  const O = { periode: 'all', tab: 'diasporas', data: null };
  const OTABS = [['diasporas', '🌍 Diasporas'], ['categories', '📂 Catégories'], ['secteurs', '🏭 Secteurs'], ['carte', '🗺️ Flux'], ['indices', '📐 Indices'], ['ia', '🤖 IA'], ['top', '🏆 Classements']];
  const evol = v => { const p = num(v) >= 0; return `<span class="badge ${p ? 'g' : 'r'}">${p ? '+' : ''}${num(v)} %</span>`; };
  function viewObsEco() {
    const my = ++seq;
    setPane('Observatoire économique', `<div class="ad-ok">🔒 Statistiques agrégées et anonymisées — aucune transaction individuelle.</div>
      <select class="ad-in" id="oe-per" style="margin-bottom:10px">${[['all', 'Depuis la création'], ['year', 'Cette année'], ['month', 'Ce mois'], ['day', 'Aujourd’hui']].map(([v, l]) => `<option value="${v}"${v === O.periode ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <div id="oe-kpi">${loading()}</div>${chipsHtml(OTABS, O.tab, 'data-ot')}<div id="oe-body"></div>`);
    $('#oe-per').onchange = e => { O.periode = e.target.value; O.data = null; loadObsEco(my); };
    $$('[data-ot]').forEach(b => b.onclick = () => { O.tab = b.dataset.ot; $$('[data-ot]').forEach(x => x.classList.toggle('on', x === b)); paintObsEco(); });
    loadObsEco(my);
  }
  async function loadObsEco(my) {
    try {
      O.data = await get('/admin/observatoire-eco?periode=' + encodeURIComponent(O.periode)); if (!alive(my, 'obs-eco')) return;
      const g = O.data.global || {};
      $('#oe-kpi').innerHTML = `<div class="ad-tiles">${[['💶 Valeur totale', fmtEur(g.totalVal)], ['🔄 Transactions', fmtNum(g.totalTx)], ['🛒 Achats', fmtNum(g.nbAchats)], ['📤 Ventes', fmtNum(g.nbVentes)], ['📊 Valeur moyenne', fmtEur(g.valMoy)], ['Aujourd’hui · mois · an', fmtNum(g.txJour) + ' · ' + fmtNum(g.txMois) + ' · ' + fmtNum(g.txAn)]].map(([l, v]) => `<div class="ad-tile"><b style="${v.length > 12 ? 'font-size:17px' : ''}">${v}</b><span>${l}</span></div>`).join('')}</div>`;
      paintObsEco();
    } catch (e) { if (alive(my, 'obs-eco')) $('#oe-kpi').innerHTML = errBox(e); }
  }
  function paintObsEco() {
    const d = O.data, body = $('#oe-body'); if (!d || !body) return;
    const none = '<div class="empty">Aucune donnée pour cette période.</div>';
    const rank = (rows, nom, val, fmt, extra, col) => { const mx = Math.max(1, ...rows.map(r => num(r[val]))); return rows.length ? rows.map((r, i) => `<div class="card"><div class="pad"><div class="ad-line"><b>${i < 3 ? ['🥇', '🥈', '🥉'][i] + ' ' : ''}${esc(r[nom])}</b><b>${fmt(r[val])}</b></div>${bar(r[val], mx, col)}<div class="small muted" style="margin-top:6px">${extra(r)}</div></div></div>`).join('') : none; };
    if (O.tab === 'diasporas') body.innerHTML = rank(d.diasporas || [], 'nom', 'valeur_eco', fmtEur, r => `Achats ${fmtNum(r.achats)} (${fmtEur(r.val_achats)}) · Ventes ${fmtNum(r.ventes)} (${fmtEur(r.ca_ventes)}) · ${fmtNum(r.vendeurs)} vendeur(s) · ${fmtNum(r.acheteurs)} acheteur(s) ${evol(r.evol)}`, '#7c3aed');
    else if (O.tab === 'categories') body.innerHTML = rank((d.categories || []).map(c => Object.assign({}, c, { nom: (c.emoji ? c.emoji + ' ' : '') + c.nom })), 'nom', 'ca', fmtEur, r => `${fmtNum(r.ventes)} vente(s) ${evol(r.evol_pct)}`, '#f97316');
    else if (O.tab === 'secteurs') body.innerHTML = rank(d.secteurs || [], 'nom', 'ca', fmtEur, r => `Ventes ${fmtNum(r.ventes)} · achats ${fmtNum(r.achats)} ${evol(r.croissance_pct)}`, '#1B3A6B');
    else if (O.tab === 'carte') body.innerHTML = (d.flux_pays || []).length ? `<div class="ad-note">Corridors économiques : flux agrégés entre pays d’origine et pays de résidence.</div>` + rank(d.flux_pays.map(f => Object.assign({}, f, { nom: f.origine + ' → ' + f.destination })), 'nom', 'montant', fmtEur, r => fmtNum(r.nb) + ' transaction(s)', '#7c3aed') : none;
    else if (O.tab === 'indices') {
      const x = d.indices || {};
      body.innerHTML = [['IGCV', 'Indice global de création de valeur', x.igcv, '#7c3aed', '💎'], ['IDC', 'Indice de dynamisme commercial', x.idc, '#f97316', '📈'], ['IED', 'Indice des échanges entre diasporas', x.ied, '#059669', '🌍'], ['ICD', 'Indice de consommation des diasporas', x.icd, '#2563eb', '🛒'], ['IPE', 'Indice de production économique', x.ipe, '#dc2626', '🏭']]
        .map(([c, n, v, col, i]) => `<div class="card"><div class="pad"><div class="ad-line"><b style="color:${col}">${i} ${c}</b><b style="font-size:26px;color:${col}">${esc(v == null ? '—' : v)}</b></div><div class="small muted">${n}</div>${bar(Math.min(num(v), 100), 100, col)}</div></div>`).join('');
    } else if (O.tab === 'ia') {
      const a = d.ai_insights || {}, blk = (t, l) => (l || []).length ? cardSec(t, l.map(v => `<div style="padding:5px 0;border-bottom:1px solid var(--border)">${esc(v)}</div>`).join('')) : '';
      body.innerHTML = (blk('🚀 Secteurs en forte croissance', a.croissance) + blk('🔍 Catégories les plus recherchées', a.recherches) + blk('🌱 Marchés émergents', a.marches) + blk('📊 Tendances commerciales', a.tendances) + blk('💡 Opportunités', a.opportunites)) || none;
    } else body.innerHTML = (cardSec('🌍 Pays par chiffre d’affaires', (d.top_pays || []).map((p, i) => `<div class="ad-line" style="margin:0 0 8px"><span>${i + 1}. ${esc((p.emoji || '') + ' ' + (p.pays || ''))}</span><b>${fmtEur(p.ca)}</b></div>`).join('') || '<p class="small muted">Aucune donnée.</p>')) + cardSec('🏭 Secteurs', (d.secteurs || []).slice(0, 6).map((s, i) => `<div class="ad-line" style="margin:0 0 8px"><span>${i + 1}. ${esc(s.nom)}</span><b>${fmtEur(s.ca)}</b></div>`).join('') || '<p class="small muted">Aucune donnée.</p>');
  }

  /* ============================================================
     9. DEMANDES DE SUPPRESSION DE COMPTE
     ============================================================ */
  const DR_LAB = { demande_recue: '🟡 Demande reçue', en_discussion: '🔵 En discussion', en_cours_analyse: '🟠 En cours d’analyse', validee: '🟢 Validée', refusee: '🔴 Refusée', compte_supprime: '⚫ Compte supprimé' };
  const drLabel = dr => {
    if (dr.statut !== 'validee') return DR_LAB[dr.statut] || dr.statut;
    if (dr.restauree_le) return '🔵 Restauré par l’utilisateur';
    if (dr.suppression_definitive_le) { const e = utc(dr.suppression_definitive_le); if (e && e <= new Date()) return '🟠 Délai écoulé (en attente de la suppression automatique)'; const j = e ? Math.ceil((e - new Date()) / 86400000) : 0; return `🟡 Délai de grâce — ${j} j restant${j > 1 ? 's' : ''}`; }
    return DR_LAB.validee;
  };
  const DF = { type: '', statut: '' };
  function viewSuppression(id) {
    const my = ++seq;
    if (id) { dossierSuppression(my, id); return; }
    setPane('Demandes de suppression', `<div class="ad-note">La suppression n’est jamais automatique : elle exige une validation explicite après échange avec le titulaire du compte.</div><div id="dr-bars"></div><div id="dr-list">${loading()}</div>`);
    loadSuppression(my);
  }
  async function loadSuppression(my) {
    $('#dr-bars').innerHTML = chipsHtml([['', 'Tous types'], ['utilisateur', 'Utilisateurs'], ['initiative', 'Initiatives'], ['collectivite', 'Institutions']], DF.type, 'data-dty') + chipsHtml([['', 'Tous statuts'], ['demande_recue', '🟡 En attente'], ['en_discussion', '🔵 En discussion'], ['validee', '🟢 Validées'], ['refusee', '🔴 Refusées'], ['compte_supprime', '⚫ Supprimés']], DF.statut, 'data-dst');
    $$('[data-dty]').forEach(b => b.onclick = () => { DF.type = b.dataset.dty; loadSuppression(my); });
    $$('[data-dst]').forEach(b => b.onclick = () => { DF.statut = b.dataset.dst; loadSuppression(my); });
    const list = $('#dr-list'); list.innerHTML = loading();
    try {
      const r = await get('/admin/deletion-requests'); if (!alive(my, 'suppression')) return;
      let rows = r.requests || [];
      if (DF.type) rows = rows.filter(x => x.type_compte === DF.type);
      if (DF.statut) rows = rows.filter(x => x.statut === DF.statut);
      list.innerHTML = rows.length ? rows.map(x => `<a class="card" style="display:block" href="#/admin/suppression/${x.id}"><div class="pad"><div class="ad-line"><b>${esc(x.user_nom || '—')}</b><span class="small muted">${esc(x.type_compte)}</span></div>
          <div class="small" style="margin-top:4px">${esc(drLabel(x))}</div><div class="small muted">Demande du ${esc(dj(x.created_at))}${x.dernier_echange ? ' · dernier échange le ' + esc(dj(x.dernier_echange)) : ''}${x.admin_nom ? ' · ' + esc(x.admin_nom) : ''}</div></div></a>`).join('') : empty('Aucune demande.', 'trash');
    } catch (e) { if (alive(my, 'suppression')) list.innerHTML = errBox(e); }
  }
  async function dossierSuppression(my, id) {
    setPane('Dossier de suppression', loading());
    try {
      const dr = (await get('/admin/deletion-requests/' + encodeURIComponent(id))).request; if (!alive(my, 'suppression')) return;
      const fin = ['refusee', 'compte_supprime', 'validee'].includes(dr.statut);
      setPane('Dossier ' + (dr.numero_dossier || ''), `<div class="card"><div class="pad"><b>${esc(dr.user_nom || '—')}</b> <span class="small muted">(${esc(dr.user_role || dr.type_compte || '')})</span>
          <div class="small muted" style="word-break:break-all">${esc(dr.user_email || '—')}</div><div style="margin-top:6px">${esc(drLabel(dr))}</div>
          ${dr.statut === 'validee' && dr.suppression_definitive_le && !dr.restauree_le ? `<div class="ad-warn" style="margin:8px 0 0">Suppression définitive automatique prévue le ${esc(dj(dr.suppression_definitive_le))}.</div>` : ''}
          ${dr.motif ? kv('Motif initial', dr.motif) : ''}${dr.admin_justification ? `<div class="ad-k">Justification</div><div class="ad-v" style="color:var(--red)">${esc(dr.admin_justification)}</div>` : ''}</div></div>
        <div class="h2">HISTORIQUE</div><div class="card"><div class="pad">${(dr.historique || []).map(h => `<div class="small" style="margin:0 0 6px"><span class="muted">${esc(dt(h.created_at))}</span> — ${esc(h.action)}${h.admin_nom ? ' par ' + esc(h.admin_nom) : ''}${h.note ? ' — ' + esc(h.note) : ''}</div>`).join('') || '<span class="small muted">Aucun historique.</span>'}</div></div>
        <div class="h2">MESSAGERIE PRIVÉE</div><div class="card"><div class="pad">${(dr.messages || []).map(m => `<div class="ad-msg"><small>${esc(m.sender_nom || '—')} · ${esc(dt(m.created_at))}</small>${esc(m.contenu)}</div>`).join('') || '<span class="small muted">Aucun message.</span>'}
          ${!fin ? `<textarea class="ad-in" id="dr-msg" placeholder="Répondre au demandeur…" style="margin-top:8px"></textarea><button type="button" class="btn out block" id="dr-send" style="margin-top:8px">Envoyer</button>` : ''}</div></div>
        ${!fin ? `<div class="ad-row ad-col"><button type="button" class="btn out" data-st="en_discussion">🔵 Passer en discussion</button><button type="button" class="btn out" data-st="en_cours_analyse">🟠 En cours d’analyse</button><button type="button" class="btn" data-st="validee" style="background:#16a34a;border-color:#16a34a">✅ Valider la suppression</button><button type="button" class="btn" data-st="refusee" style="background:#dc2626;border-color:#dc2626">❌ Refuser</button></div>` : '<p class="small muted" style="text-align:center">Dossier clos.</p>'}`);
      const rel = () => { if (alive(my, 'suppression')) dossierSuppression(my, id); };
      const sb = $('#dr-send'); if (sb) sb.onclick = () => { const t = $('#dr-msg').value.trim(); if (!t) return; busy(sb, () => send('POST', '/deletion-requests/' + id + '/messages', { contenu: t }).then(rel).catch(e => toast(msgErr(e), true))); };
      $$('[data-st]').forEach(b => b.onclick = () => {
        const st = b.dataset.st; let justification;
        if (st === 'validee' && !confirm('Valider la suppression ? Le compte sera masqué immédiatement et son propriétaire recevra un e-mail avec un délai de 5 jours pour l’annuler. Passé ce délai, les données seront anonymisées automatiquement et définitivement.')) return;
        if (st === 'refusee') { const m = prompt('Motif du refus (obligatoire) :'); if (!m || !m.trim()) return; justification = m.trim(); }
        busy(b, () => send('PATCH', '/admin/deletion-requests/' + id, { statut: st, justification }).then(() => { toast('Dossier mis à jour.'); rel(); }).catch(e => toast(msgErr(e), true)));
      });
    } catch (e) { if (alive(my, 'suppression')) setPane('Dossier de suppression', errBox(e)); }
  }

  /* ============================================================
     10. ADMINISTRATEURS JUNIOR
     ============================================================ */
  const AJ_MOD = { moderation: '🛡 Modération', suppression_comptes: '🗑 Demandes de suppression', videos_tutoriels: '🎬 Vidéos Tuto', avis: '⭐ Avis clients', relances_profil: '📣 Relances de profil' };
  let catCache = null;
  const catalogue = async () => { if (!catCache) catCache = (await get('/admin/administrateurs-junior/catalogue')).catalogue || []; return catCache; };
  const parModule = cat => { const m = {}; cat.forEach(e => { (m[e.module] = m[e.module] || []).push(e); }); return m; };
  function viewJuniors(id) {
    const my = ++seq;
    if (id === 'nouveau') { creerJunior(my); return; }
    if (id) { detailJunior(my, id); return; }
    setPane('Administrateurs junior', `<div class="ad-note">Identifiants générés automatiquement, jamais choisis par le junior, renouvelés chaque mois. Une révocation ne prend effet qu’à sa prochaine connexion.</div><a class="btn block" href="#/admin/juniors/nouveau" style="margin-bottom:12px">${ic('plus', 's')} Nouvel administrateur junior</a><div id="aj-list">${loading()}</div>`);
    (async () => {
      try {
        const rows = (await get('/admin/administrateurs-junior')).juniors || []; if (!alive(my, 'juniors')) return;
        $('#aj-list').innerHTML = rows.length ? rows.map(r => `<a class="card" style="display:block" href="#/admin/juniors/${r.id}"><div class="pad"><div class="ad-line"><b>Junior n°${esc(r.sequence_number)}</b><span class="small">${r.suspendu ? '🟠 Suspendu' : r.verrouille ? '🔴 Verrouillé' : '🟢 Actif'}</span></div>
            <div class="small muted" style="word-break:break-all;font-family:monospace">${esc(r.email)}</div><div class="small" style="margin-top:4px">${(r.modules || []).map(m => esc(AJ_MOD[m] || m)).join(' · ') || '<span class="muted">Aucun droit</span>'}</div>
            <div class="small muted">Dernière rotation : ${esc(dj(r.derniere_rotation_at))}</div></div></a>`).join('') : empty('Aucun administrateur junior créé pour le moment.', 'lock');
      } catch (e) { if (alive(my, 'juniors')) $('#aj-list').innerHTML = errBox(e); }
    })();
  }
  async function creerJunior(my) {
    setPane('Nouvel administrateur junior', loading());
    try {
      const pm = parModule(await catalogue()); if (!alive(my, 'juniors')) return;
      setPane('Nouvel administrateur junior', `<div class="ad-note">Sélectionnez les droits à déléguer. L’identifiant et le mot de passe seront générés automatiquement.</div>
        ${Object.entries(pm).map(([mod, es]) => `<div class="h2">${esc(AJ_MOD[mod] || mod)}</div><div class="card"><div class="pad">${es.map(e => `<label class="ad-lab"><input type="checkbox" class="aj-cb" value="${esc(e.id)}"><span>${esc(e.description)}</span></label>`).join('')}</div></div>`).join('')}
        <button type="button" class="btn block" id="aj-go">Créer</button><div id="aj-res"></div>`);
      $('#aj-go').onclick = () => busy($('#aj-go'), async () => {
        const ids = $$('.aj-cb:checked').map(c => c.value);
        try {
          const j = await send('POST', '/admin/administrateurs-junior', { catalogue_ids: ids });
          $('#aj-res').innerHTML = `<div class="ad-ok" style="margin-top:12px"><b>Administrateur junior n°${esc(j.sequenceNumber)} créé.</b> Transmettez ces identifiants à la main.<br>Identifiant : <span class="ad-cred">${esc(j.email)}</span> <button type="button" class="btn out sm" data-cp="${esc(j.email)}">Copier</button><br>Mot de passe : <span class="ad-cred">${esc(j.password)}</span> <button type="button" class="btn out sm" data-cp="${esc(j.password)}">Copier</button></div>`;
          $$('[data-cp]').forEach(b => b.onclick = async () => toast((await copier(b.dataset.cp)) ? 'Copié.' : 'Copie impossible.'));
        } catch (e) { toast('Création impossible : ' + msgErr(e), true); }
      });
    } catch (e) { if (alive(my, 'juniors')) setPane('Nouvel administrateur junior', errBox(e)); }
  }
  async function detailJunior(my, id) {
    setPane('Administrateur junior', loading());
    try {
      const [fiche, cat, jr] = await Promise.all([get('/admin/administrateurs-junior/' + encodeURIComponent(id)), catalogue(), get('/admin/administrateurs-junior/' + encodeURIComponent(id) + '/journal')]);
      if (!alive(my, 'juniors')) return;
      const ok = new Set((fiche.permissions || []).map(p => p.id)), pm = parModule(cat);
      setPane('Junior n°' + fiche.sequence_number, `<div class="card"><div class="pad"><b>Junior n°${esc(fiche.sequence_number)}</b> <span class="small">${fiche.suspendu ? '🟠 Suspendu' : fiche.verrouille ? '🔴 Verrouillé' : '🟢 Actif'}</span>
          <div class="ad-k">Identifiant courant</div><span class="ad-cred">${esc(fiche.email)}</span> <button type="button" class="btn out sm" data-cp="${esc(fiche.email)}">Copier</button>
          <div class="ad-k">Mot de passe courant</div><span class="ad-cred">${esc(fiche.password || '')}</span> <button type="button" class="btn out sm" data-cp="${esc(fiche.password || '')}">Copier</button>
          <div class="small muted" style="margin-top:8px">Dernière rotation : ${esc(dt(fiche.derniere_rotation_at))}</div>
          <div class="ad-row"><a class="btn out sm" href="#/conv/${encodeURIComponent(id)}">✉️ Écrire</a><button type="button" class="btn sm" id="aj-rot">🔄 Régénérer</button>${fiche.suspendu ? '<button type="button" class="btn out sm" id="aj-react">▶️ Réactiver</button>' : '<button type="button" class="btn out sm" id="aj-susp">⏸️ Suspendre</button>'}<button type="button" class="btn out sm" id="aj-del" style="color:var(--red)">🗑 Supprimer</button></div></div></div>
        <div class="h2">DROITS ACCORDÉS</div>${Object.entries(pm).map(([mod, es]) => `<div class="card"><div class="pad"><b>${esc(AJ_MOD[mod] || mod)}</b>${es.map(e => `<div class="ad-line" style="padding:8px 0;border-bottom:1px solid var(--border);align-items:center"><span style="font-size:14px">${ok.has(e.id) ? '✅' : '⬜'} ${esc(e.description)}</span>${ok.has(e.id) ? `<button type="button" class="btn out sm" style="flex:none" data-rv="${esc(e.id)}">Révoquer</button>` : `<button type="button" class="btn sm" style="flex:none" data-gr="${esc(e.id)}">Accorder</button>`}</div>`).join('')}</div></div>`).join('')}
        <div class="h2">HISTORIQUE / ACTIVITÉ</div><div class="card"><div class="pad">${(jr.journal || []).map(j => `<div class="small" style="margin:0 0 8px"><span class="muted">${esc(dt(j.created_at))}</span><br>${esc(j.action)}${(j.details || j.catalogue_description) ? ' — ' + esc(j.details || j.catalogue_description) : ''}</div>`).join('') || '<span class="small muted">Aucune action enregistrée.</span>'}</div></div>`);
      const rel = () => { if (alive(my, 'juniors')) detailJunior(my, id); };
      const act = (fn) => async () => { try { await fn(); } catch (e) { toast(msgErr(e), true); } };
      $$('[data-cp]').forEach(b => b.onclick = async () => toast((await copier(b.dataset.cp)) ? 'Copié.' : 'Copie impossible.'));
      $$('[data-gr]').forEach(b => b.onclick = () => busy(b, act(async () => { await send('PATCH', '/admin/administrateurs-junior/' + id + '/permissions', { grant: [b.dataset.gr] }); rel(); })));
      $$('[data-rv]').forEach(b => b.onclick = () => { if (!confirm('Révoquer ce droit ? L’effet ne s’appliquera qu’à la prochaine connexion du junior.')) return; busy(b, act(async () => { await send('PATCH', '/admin/administrateurs-junior/' + id + '/permissions', { revoke: [b.dataset.rv] }); rel(); })); });
      const su = $('#aj-susp'); if (su) su.onclick = () => { if (!confirm('Suspendre cet administrateur junior ? Il ne pourra plus se connecter tant qu’il n’aura pas été réactivé. Ses droits et son historique sont conservés.')) return; busy(su, act(async () => { await send('POST', '/admin/administrateurs-junior/' + id + '/suspendre'); rel(); })); };
      const re = $('#aj-react'); if (re) re.onclick = () => busy(re, act(async () => { await send('POST', '/admin/administrateurs-junior/' + id + '/reactiver'); rel(); }));
      $('#aj-rot').onclick = () => { if (!confirm('Régénérer l’identifiant et le mot de passe maintenant ? Les anciens cesseront immédiatement de fonctionner.')) return; busy($('#aj-rot'), act(async () => { await send('POST', '/admin/administrateurs-junior/' + id + '/refresh'); toast('Nouveaux identifiants générés.'); rel(); })); };
      $('#aj-del').onclick = () => { if (!confirm('Supprimer DÉFINITIVEMENT cet administrateur junior ? Ses droits et son historique seront perdus.')) return; if (!confirm('Confirmez une seconde fois : la suppression est immédiate et irréversible.')) return; busy($('#aj-del'), act(async () => { await send('DELETE', '/admin/administrateurs-junior/' + id); toast('Administrateur junior supprimé.'); location.hash = '#/admin/juniors'; })); };
    } catch (e) { if (alive(my, 'juniors')) setPane('Administrateur junior', errBox(e)); }
  }

  /* ---------- point d'entrée : #/admin[/<module>[/<id>]] ---------- */
  window.MMods.admin = function (sub, id) {
    if (!S.me) { setPane('Administration', A.loginCard ? A.loginCard('Connectez-vous avec un compte administrateur.') : ''); const b = $('#go-login'); if (b && A.openLogin) b.onclick = () => A.openLogin(); return; }
    if (S.me.role !== 'administrateur') { setPane('Administration', empty('Ces modules sont réservés au compte administrateur.', 'lock')); return; }
    switch (sub) {
      case 'journal': return viewJournal();
      case 'acquisition': return viewAcquisition();
      case 'verif-org': return viewVerifOrg();
      case 'rencontres': return viewRencontres();
      case 'passage': return viewPassage();
      case 'membres': M.liste = []; return viewMembres();
      case 'diaspora': D.data = null; return viewDiaspora();
      case 'obs-eco': return viewObsEco();
      case 'suppression': return viewSuppression(id);
      case 'juniors': return viewJuniors(id);
      default: return paneMenu();
    }
  };
})();
