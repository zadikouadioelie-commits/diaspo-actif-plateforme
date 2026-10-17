/* ============================================================
   Diaspo'Actif — Version téléphone : module « Maracana Tracker » (2026-10-17)
   Saisie au bord du terrain : matchs, présents du jour, notes, joueurs, prix et classements, historique des présences.
   Routes :  #/tracker                accueil (matchs)        #/tracker/match/<id>   présents + notes d'un match
             #/tracker/joueurs        joueurs                 #/tracker/prix[/<id>]  prix et classements
             #/tracker/presences      historique des présences
   API : /api/tracker/* (voir server/tracker-routes.js). Règles : majeurs uniquement, présents du jour d'abord,
   fair-play 5/10 par défaut (+2 ou +3 pour un fait remarquable).
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, setPane, toast, openSheet } = A;
  window.MMods = window.MMods || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const TITRE = 'Maracana Tracker';
  let jeton = 0, ctx = null;
  const POSTE = { gardien: '🧤 Gardien', defenseur: '🛡️ Défenseur', milieu: '🎯 Milieu', attaquant: '⚽ Attaquant' };
  const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (d || ''); };
  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  const RAPPEL = '<div class="cf-alert o" style="background:#FFFBEB;border:1px solid #F59E0B;color:#92400E;border-radius:12px;padding:10px 12px;font-size:13px;margin:0 0 12px">⚠️ Le Tracker ne concerne que les <b>personnes majeures</b>. Ne saisissez aucune donnée relative à un mineur.</div>';
  const call = (m, p, b) => api('/api/tracker' + p, b === undefined ? { method: m } : { method: m, body: b });

  if (!document.getElementById('m-mod-tracker-css')) {
    const st = document.createElement('style'); st.id = 'm-mod-tracker-css';
    st.textContent = `
      .tk-nav{display:flex;gap:8px;overflow-x:auto;margin:0 0 12px;padding-bottom:2px}
      .tk-nav a{flex:none;border:1px solid var(--border);border-radius:99px;padding:8px 14px;font-weight:700;font-size:13.5px;background:var(--card);color:var(--text);text-decoration:none}
      .tk-nav a.on{background:var(--navy);color:#fff;border-color:var(--navy)}
      .tk-in{width:100%;min-height:46px;border:1px solid var(--border);border-radius:12px;padding:0 12px;font-size:16px;background:#fff;color:var(--text);font-family:inherit;box-sizing:border-box}
      textarea.tk-in{padding:10px 12px;min-height:70px}
      .tk-lbl{display:block;font-weight:600;font-size:13px;margin:10px 0 4px}
      .tk-pill{display:inline-block;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:700;background:#E8F0FE;color:#1E40AF}
      .tk-pill.ok{background:#DCFCE7;color:#166534}.tk-pill.no{background:#FEE2E2;color:#991B1B}.tk-pill.mu{background:#EEF2F6;color:#475569}
      .tk-pres{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--border)}
      .tk-pres:last-child{border-bottom:none}
      .tk-pres input[type=checkbox]{width:26px;height:26px;flex:none}
      .tk-pres select{min-height:40px;border:1px solid var(--border);border-radius:10px;font-size:15px;padding:0 8px;background:#fff}
      .tk-num{display:flex;gap:10px;flex-wrap:wrap}
      .tk-num label{font-size:12px;font-weight:700;display:block;margin-bottom:3px}
      .tk-num input{width:84px;min-height:46px;border:1px solid var(--border);border-radius:12px;font-size:18px;text-align:center;background:#fff}
      .tk-fp{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .tk-fp button{min-height:42px;border:1px solid var(--border);border-radius:10px;padding:0 12px;font-weight:700;background:#fff;font-size:14px}
      .tk-fp button.on{background:var(--navy);color:#fff;border-color:var(--navy)}
      .tk-fp input{width:70px;min-height:42px;border:1px solid var(--border);border-radius:10px;font-size:16px;text-align:center}
      .tk-dot{display:inline-block;width:14px;height:14px;border-radius:50%}.tk-dot.p{background:#22C55E}.tk-dot.a{background:#DDE3EA}
      .tk-err{color:var(--red,#b91c1c);font-size:13.5px;min-height:20px;margin:8px 2px 0}`;
    document.head.appendChild(st);
  }

  const nav = (actif) => `<div class="tk-nav">${[['', 'Matchs'], ['joueurs', 'Joueurs'], ['prix', 'Prix'], ['presences', 'Présences']].map(([k, l]) => `<a href="#/tracker${k ? '/' + k : ''}" class="${actif === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
  const skeleton = () => setPane(TITRE, '<div class="sk skc" style="height:60px"></div><div class="sk skc" style="height:240px"></div>');
  const erreur = (e, retry) => { setPane(TITRE, `<div class="empty"><b>Indisponible</b>${esc(e && e.message ? e.message : 'Erreur.')}<br><br><button class="btn" id="tk-retry">Réessayer</button></div>`); const b = $('#tk-retry'); if (b) b.onclick = retry; };
  async function init() {
    if (!S.me) { const ok = await A.needLogin('Connectez-vous pour accéder au Maracana Tracker.'); if (!ok) { location.hash = '#/moi'; return false; } }
    try { ctx = await call('GET', '/contexte'); return true; } catch (e) { erreur(e, () => location.reload()); return false; }
  }
  const ici = (mon) => mon === jeton && /^#\/tracker/.test(location.hash);

  /* ---------------- accueil : matchs ---------------- */
  async function ecranMatchs() {
    const mon = ++jeton; skeleton(); if (!(await init())) return;
    let r; try { r = await call('GET', '/matchs'); } catch (e) { return ici(mon) && erreur(e, ecranMatchs); }
    if (!ici(mon)) return;
    setPane(TITRE, `${nav('')}${RAPPEL}
      <div class="card pad"><b>＋ Nouveau match</b>
        <label class="tk-lbl" for="tk-d">Date</label><input class="tk-in" type="date" id="tk-d" value="${aujourdhui()}">
        <label class="tk-lbl" for="tk-a">Adversaire</label><input class="tk-in" id="tk-a" placeholder="ex. AS Sud">
        <div class="tk-num" style="margin-top:10px"><div><label>Notre score</label><input type="number" inputmode="numeric" min="0" id="tk-sp"></div><div><label>Score adverse</label><input type="number" inputmode="numeric" min="0" id="tk-sc"></div></div>
        <p class="tk-err" id="tk-err" role="alert"></p><button class="btn block" id="tk-creer">Créer le match</button></div>
      <div class="h2" style="margin-top:14px">MATCHS</div>
      ${r.matchs.length ? `<div class="lst">${r.matchs.map(m => `<a class="li" href="#/tracker/match/${m.id}"><span class="sp"><span class="t">${fmtDate(m.date_match)} — ${esc(m.adversaire || 'Match')}</span><br><span class="d">${m.score_pour == null ? 'Score non saisi' : esc(m.score_pour + ' - ' + m.score_contre)} · ${m.joueurs} présent(s)</span></span></a>`).join('')}</div>` : '<div class="empty"><b>Aucun match</b>Créez le premier ci-dessus.</div>'}`);
    $('#tk-creer').onclick = async (ev) => {
      const b = ev.currentTarget, err = $('#tk-err'); err.textContent = ''; b.disabled = true;
      try { const x = await call('POST', '/matchs', { date_match: $('#tk-d').value, adversaire: $('#tk-a').value, score_pour: $('#tk-sp').value, score_contre: $('#tk-sc').value }); toast('Match créé ✓'); location.hash = '#/tracker/match/' + x.id; }
      catch (e) { err.textContent = e.message || 'Erreur.'; b.disabled = false; }
    };
  }

  /* ---------------- un match : présents puis notes ---------------- */
  let vueMatch = 'presents';
  async function ecranMatch(id) {
    const mon = ++jeton; skeleton(); if (!(await init())) return;
    let dm, rj; try { [dm, rj] = await Promise.all([call('GET', '/matchs/' + id), call('GET', '/joueurs')]); } catch (e) { return ici(mon) && erreur(e, () => ecranMatch(id)); }
    if (!ici(mon)) return;
    const m = dm.match, notes = dm.notes, joueurs = rj.joueurs, presents = new Map(notes.map(n => [Number(n.joueur_id), n]));
    const entete = `<div class="small muted" style="margin:0 4px 10px"><b>${fmtDate(m.date_match)} — ${esc(m.adversaire || 'Match')}</b>${m.score_pour == null ? '' : ' · ' + esc(m.score_pour + ' - ' + m.score_contre)}</div>
      <div class="tk-nav"><a href="#/tracker" >← Matchs</a><a href="#" data-v="presents" class="${vueMatch === 'presents' ? 'on' : ''}">① Présents (${notes.length})</a><a href="#" data-v="notes" class="${vueMatch === 'notes' ? 'on' : ''}">② Notes</a></div>`;
    let corps = '', pied = '';
    if (vueMatch === 'presents') {
      corps = `${RAPPEL}<p class="small muted" style="margin:0 4px 10px;line-height:1.5">Cochez les joueurs <b>présents ce jour-là</b> : eux seuls pourront être notés.</p>
        ${joueurs.length ? `<div class="card" style="overflow:hidden">${joueurs.map(j => { const p = presents.get(Number(j.id)); const po = (p && p.poste_joue) || j.poste_habituel || '';
          return `<label class="tk-pres"><input type="checkbox" data-pres="${j.id}"${p ? ' checked' : ''}><span class="sp" style="flex:1;font-weight:600">${esc((j.prenom || '') + ' ' + j.nom)}</span>
            <select data-po="${j.id}" aria-label="Poste ce jour"><option value="">Poste</option>${ctx.postes.map(x => `<option value="${x}"${po === x ? ' selected' : ''}>${POSTE[x]}</option>`).join('')}</select></label>`; }).join('')}</div>`
          : '<div class="empty"><b>Aucun joueur</b>Ajoutez-en dans l’onglet Joueurs.</div>'}`;
      pied = joueurs.length ? '<button class="btn block" id="tk-save-pres">Enregistrer les présents</button>' : '';
    } else {
      corps = notes.length ? `<p class="small muted" style="margin:0 4px 10px;line-height:1.5">Fair-play : <b>${ctx.fair_play.defaut}/10 par défaut</b>. Ajoutez +${ctx.fair_play.bonus.join(' ou +')} pour un fait remarquable. Observations : bureau uniquement.</p>${notes.map(carte).join('')}`
        : '<div class="empty"><b>Aucun présent</b>Déclarez d’abord les présents (étape ①).</div>';
      pied = notes.length ? '<button class="btn block" id="tk-save-notes">Enregistrer les notes</button>' : '';
    }
    setPane(TITRE, `<div id="tk-root">${entete}${corps}<p class="tk-err" id="tk-err" role="alert"></p></div>`, pied);
    document.querySelectorAll('.tk-nav a[data-v]').forEach(a => a.onclick = ev => { ev.preventDefault(); vueMatch = a.dataset.v; ecranMatch(id); });
    document.querySelectorAll('.tk-fp').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => { g.querySelector('input').value = b.dataset.v; g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }));
    const sp = $('#tk-save-pres'); if (sp) sp.onclick = async () => {
      const presentsL = [...document.querySelectorAll('[data-pres]')].filter(c => c.checked).map(c => ({ joueur_id: Number(c.dataset.pres), poste_joue: ($(`[data-po="${c.dataset.pres}"]`) || {}).value || '' }));
      sp.disabled = true;
      try { await call('PUT', `/matchs/${id}/presents`, { presents: presentsL }); toast('Présents enregistrés ✓'); vueMatch = 'notes'; ecranMatch(id); }
      catch (e) { $('#tk-err').textContent = e.message || 'Erreur.'; sp.disabled = false; }
    };
    const sn = $('#tk-save-notes'); if (sn) sn.onclick = async () => {
      const out = {}; document.querySelectorAll('[data-n]').forEach(e => { const j = e.dataset.n; out[j] = out[j] || { joueur_id: Number(j) }; out[j][e.dataset.k] = e.value; });
      sn.disabled = true;
      try { await call('PUT', `/matchs/${id}/notes`, { notes: Object.values(out) }); toast('Notes enregistrées ✓'); ecranMatch(id); }
      catch (e) { $('#tk-err').textContent = e.message || 'Erreur.'; sn.disabled = false; }
    };
  }
  function carte(n) {
    const id = n.joueur_id, p = n.poste_joue || '', def = ctx.fair_play.defaut, fp = n.fair_play == null ? null : Number(n.fair_play);
    const num = (k, lib, v, max) => `<div><label>${lib}</label><input type="number" inputmode="numeric" min="0" max="${max || 99}" data-n="${id}" data-k="${k}" value="${v || 0}"></div>`;
    const et = `<div><label>Étoiles 0-5</label><input type="number" inputmode="decimal" min="0" max="5" step="0.5" data-n="${id}" data-k="note_etoiles" value="${n.note_etoiles == null ? '' : n.note_etoiles}"></div>`;
    const spe = p === 'gardien' ? num('arrets', 'Arrêts', n.arrets) + num('buts_encaisses', 'Encaissés', n.buts_encaisses) + et
      : p === 'defenseur' ? num('duels_gagnes', 'Duels', n.duels_gagnes) + num('interceptions', 'Intercept.', n.interceptions) + num('tacles', 'Tacles', n.tacles) + et : et;
    return `<div class="card pad" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${esc((n.prenom || '') + ' ' + n.nom)}</b><span class="tk-pill">${POSTE[p] || 'poste ?'}</span></div>
      <div class="tk-num" style="margin-top:10px">${num('buts', 'Buts', n.buts, 30)}${num('passes', 'Passes', n.passes, 30)}${spe}</div>
      <label class="tk-lbl">Fair-play (0-10)</label><div class="tk-fp"><button type="button" data-v="" class="${fp === null ? 'on' : ''}">${def} par défaut</button>
        ${ctx.fair_play.bonus.map(b => `<button type="button" data-v="${def + b}" class="${fp === def + b ? 'on' : ''}">+${b} → ${def + b}</button>`).join('')}<input type="number" inputmode="numeric" min="0" max="10" data-n="${id}" data-k="fair_play" value="${fp === null ? '' : fp}" placeholder="libre"></div>
      <label class="tk-lbl">Observations (bureau uniquement)</label><textarea class="tk-in" data-n="${id}" data-k="observations" placeholder="Comportement, fait marquant…">${esc(n.observations || '')}</textarea></div>`;
  }

  /* ---------------- joueurs ---------------- */
  async function ecranJoueurs() {
    const mon = ++jeton; skeleton(); if (!(await init())) return;
    let rj, ra; try { [rj, ra] = await Promise.all([call('GET', '/joueurs'), call('GET', '/adherents')]); } catch (e) { return ici(mon) && erreur(e, ecranJoueurs); }
    if (!ici(mon)) return;
    const prop = ra.adherents.filter(a => !a.deja_ajoute);
    setPane(TITRE, `${nav('joueurs')}${RAPPEL}
      <div class="h2">JOUEURS (${rj.joueurs.length})</div>
      ${rj.joueurs.length ? `<div class="lst">${rj.joueurs.map(j => `<div class="li"><span class="sp"><span class="t">${esc((j.prenom || '') + ' ' + j.nom)}</span><br><span class="d">${POSTE[j.poste_habituel] || 'poste libre'} · ${j.matchs} match(s) · ${j.buts} but(s)</span></span><button class="btn out sm" data-ret="${j.id}" data-nom="${esc((j.prenom || '') + ' ' + j.nom)}">Retirer</button></div>`).join('')}</div>` : '<div class="empty"><b>Aucun joueur</b></div>'}
      <div class="h2" style="margin-top:16px">AJOUTER UN ADHÉRENT</div>
      ${prop.length ? `<div class="lst">${prop.map((a, i) => `<div class="li"><span class="sp"><span class="t">${esc((a.prenom || '') + ' ' + a.nom)}</span>${a.mineur ? '<br><span class="tk-pill no">mineur — refusé</span>' : (a.age_inconnu ? '<br><span class="d">âge non renseigné</span>' : '')}</span><button class="btn out sm" data-adh="${i}"${a.mineur ? ' disabled' : ''}>Ajouter</button></div>`).join('')}</div>` : '<p class="small muted" style="margin:4px">Aucun adhérent à proposer.</p>'}
      <div class="h2" style="margin-top:16px">PERSONNE SANS COMPTE</div>
      <div class="card pad"><label class="tk-lbl" for="tk-jn" style="margin-top:0">Nom *</label><input class="tk-in" id="tk-jn"><label class="tk-lbl" for="tk-jp">Prénom</label><input class="tk-in" id="tk-jp">
        <label class="tk-lbl" for="tk-je">E-mail * (pour lui envoyer ses statistiques)</label><input class="tk-in" id="tk-je" type="email" inputmode="email" autocapitalize="off">
        <label class="tk-lbl" for="tk-jo">Poste habituel</label><select class="tk-in" id="tk-jo"><option value="">—</option>${ctx.postes.map(x => `<option value="${x}">${POSTE[x]}</option>`).join('')}</select>
        <label style="display:flex;gap:10px;align-items:center;margin-top:12px;font-weight:600"><input type="checkbox" id="tk-jm" style="width:24px;height:24px"> J’atteste que cette personne est majeure (18 ans ou plus)</label>
        <p class="tk-err" id="tk-err" role="alert"></p><button class="btn block" id="tk-jadd">Ajouter</button></div>`);
    const recharger = ecranJoueurs;
    document.querySelectorAll('[data-ret]').forEach(b => b.onclick = async () => {
      const ok = await confirmer(`Retirer ${b.dataset.nom} ?`, 'Toutes ses notes et statistiques seront supprimées.', 'Retirer');
      if (!ok) return;
      try { await call('DELETE', '/joueurs/' + b.dataset.ret); toast('Joueur retiré ✓'); recharger(); } catch (e) { toast(e.message || 'Erreur', true); }
    });
    document.querySelectorAll('[data-adh]').forEach(b => b.onclick = async () => {
      const a = prop[Number(b.dataset.adh)];
      const ok = await confirmer('Attestation de majorité', `J’atteste que <b>${esc((a.prenom || '') + ' ' + a.nom)}</b> est majeur(e) (18 ans ou plus).`, 'J’atteste');
      if (!ok) return;
      try { await call('POST', '/joueurs', { user_id: a.user_id, adhesion_membre_id: a.adhesion_membre_id, nom: a.nom, prenom: a.prenom, email: a.email, majeur_atteste: true }); toast('Joueur ajouté ✓'); recharger(); } catch (e) { toast(e.message || 'Erreur', true); }
    });
    $('#tk-jadd').onclick = async (ev) => {
      const b = ev.currentTarget, err = $('#tk-err'); err.textContent = ''; b.disabled = true;
      try { await call('POST', '/joueurs', { nom: $('#tk-jn').value, prenom: $('#tk-jp').value, email: $('#tk-je').value, poste_habituel: $('#tk-jo').value, majeur_atteste: $('#tk-jm').checked }); toast('Joueur ajouté ✓'); recharger(); }
      catch (e) { err.textContent = e.message || 'Erreur.'; b.disabled = false; }
    };
  }
  function confirmer(titre, html, ok) {
    return new Promise(resolve => {
      const close = openSheet(`<h2 style="margin:4px 0 8px;font-size:19px">${esc(titre)}</h2><div style="margin:0 0 12px;line-height:1.5">${html}</div><button class="btn block" id="tk-cok">${esc(ok)}</button><button class="btn out block" id="tk-cno" style="margin-top:10px">Annuler</button>`);
      const fin = v => { close(); resolve(v); }; $('#tk-cok').onclick = () => fin(true); $('#tk-cno').onclick = () => fin(false);
    });
  }

  /* ---------------- prix ---------------- */
  async function ecranPrix(id) {
    const mon = ++jeton; skeleton(); if (!(await init())) return;
    if (id) {
      let r; try { r = await call('GET', '/prix/' + id); } catch (e) { return ici(mon) && erreur(e, () => ecranPrix(id)); }
      if (!ici(mon)) return;
      const p = r.prix, det = d => Object.entries(d).filter(([k]) => k !== 'matchs').map(([k, v]) => `${k.replace(/_/g, ' ')} : ${v}`).join(' · ');
      setPane(p.nom, `<div class="small muted" style="margin:0 4px 10px">${r.matchs_pris_en_compte} match(s) pris en compte · minimum ${p.regle.min_matchs}</div>
        ${r.classement.some(x => x.egalite) ? '<div class="cf-alert o" style="background:#FFFBEB;border:1px solid #F59E0B;border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:13px">Égalité parfaite sur certains rangs : le bureau tranche.</div>' : ''}
        ${r.classement.length ? r.classement.map(x => `<div class="card pad" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${x.rang}${x.egalite ? ' =' : ''}. ${esc(x.nom)}${p.laureat_joueur_id === x.joueur_id ? ' 🏆' : ''}</b><span class="tk-pill ok">${x.score}</span></div>
          <div class="small muted" style="margin-top:4px">${esc(det(x.detail))}</div>
          ${p.laureat_joueur_id === x.joueur_id ? '<div style="margin-top:8px"><span class="tk-pill ok">Lauréat</span></div>' : `<button class="btn out sm" style="margin-top:8px" data-lau="${x.joueur_id}">Désigner lauréat</button>`}</div>`).join('') : '<div class="empty"><b>Pas encore de classement</b>Matchs minimum non atteint.</div>'}
        ${r.ecartes.length ? `<p class="small muted" style="margin:6px 4px">Écartés (moins de ${p.regle.min_matchs} match(s)) : ${r.ecartes.map(e => esc(e.nom) + ' (' + e.matchs + ')').join(', ')}</p>` : ''}
        <a class="btn out block" href="#/tracker/prix" style="margin-top:8px">← Tous les prix</a>`);
      document.querySelectorAll('[data-lau]').forEach(b => b.onclick = async () => {
        try { await call('POST', `/prix/${id}/laureat`, { joueur_id: Number(b.dataset.lau) }); toast('Lauréat désigné ✓'); ecranPrix(id); } catch (e) { toast(e.message || 'Erreur', true); }
      });
      return;
    }
    let r; try { r = await call('GET', '/prix'); } catch (e) { return ici(mon) && erreur(e, () => ecranPrix()); }
    if (!ici(mon)) return;
    setPane(TITRE, `${nav('prix')}${r.prix.length ? r.prix.map(p => `<a class="card pad" style="display:block;margin-bottom:10px;text-decoration:none;color:inherit" href="#/tracker/prix/${p.id}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${p.emoji || ''} ${esc(p.nom)}</b><span class="tk-pill ${p.statut === 'clos' ? 'ok' : 'mu'}">${p.statut === 'clos' ? 'Clos' : 'En cours'}</span></div>
      ${p.lot ? `<div class="small muted">🎁 ${esc(p.lot.nom)}</div>` : ''}
      <div style="margin-top:8px">${p.podium.length ? p.podium.map(x => `<span class="tk-pill ${x.rang === 1 ? 'ok' : 'mu'}" style="margin:0 4px 4px 0">${x.rang}. ${esc(x.nom)} · ${x.score}</span>`).join('') : '<span class="small muted">Pas encore assez de données.</span>'}</div></a>`).join('') : '<div class="empty"><b>Aucun prix</b>Créez-les depuis le site (tableau de bord → Maracana Tracker).</div>'}`);
  }

  /* ---------------- historique des présences ---------------- */
  async function ecranPresences() {
    const mon = ++jeton; skeleton(); if (!(await init())) return;
    let r; try { r = await call('GET', '/presences'); } catch (e) { return ici(mon) && erreur(e, ecranPresences); }
    if (!ici(mon)) return;
    setPane(TITRE, `${nav('presences')}${r.matchs.length ? `<p class="small muted" style="margin:0 4px 10px">🟢 présent · ⚪ absent — jour après jour</p>
      <div class="card" style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:13px"><tr><th style="text-align:left;padding:8px">Joueur</th>${r.matchs.map(m => `<th style="padding:8px 4px">${fmtDate(m.date_match).slice(0, 5)}</th>`).join('')}<th style="padding:8px">Total</th></tr>
      ${r.joueurs.map(j => `<tr style="border-top:1px solid var(--border)"><td style="padding:8px;white-space:nowrap">${esc(j.nom)}</td>${r.matchs.map(m => `<td style="text-align:center;padding:8px 4px"><span class="tk-dot ${j.presents.includes(m.id) ? 'p' : 'a'}"></span></td>`).join('')}<td style="padding:8px;white-space:nowrap"><b>${j.nb_presents}/${j.nb_matchs}</b></td></tr>`).join('')}</table></div>`
      : '<div class="empty"><b>Aucun match</b>L’historique des présences apparaîtra ici.</div>'}`);
  }

  window.MMods.tracker = function (b, c) {
    if (b === 'match') return ecranMatch(c);
    if (b === 'joueurs') return ecranJoueurs();
    if (b === 'prix') return ecranPrix(c);
    if (b === 'presences') return ecranPresences();
    vueMatch = 'presents';
    return ecranMatchs();
  };
})();
