/* ============================================================
   Diaspo'Actif — Version téléphone : module « Maracana Tracker » (2026-10-17)
   Saisie au bord du terrain. Parcours : Accueil → « Nouvelle rencontre » (contre un adversaire) ou « Nouvel entraînement »
   (séance : présents → équipes → matchs enchaînés). Sur un match : touchez une équipe, puis un joueur, pour lui attribuer ses
   points en un appui (but, passe, fair-play, Joga Bonito, cartons). Un bouton « Présents » reste accessible partout dans la séance.
   Routes :  #/tracker                accueil            #/tracker/seance/<id>   séance d'entraînement
             #/tracker/match/<id>     match (terrain)    #/tracker/joueurs · #/tracker/prix[/<id>] · #/tracker/presences
   API : /api/tracker/* (voir server/tracker-routes.js et tracker-seances.js). Règles : majeurs uniquement, présents d'abord,
   fair-play 5/10 pour tous (+ points, − cartons), pastilles d'adhésion vert / jaune / rouge.
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
  const POSTE_C = { gardien: 'GAR', defenseur: 'DÉF', milieu: 'MIL', attaquant: 'ATT' };
  const CARTON = { rouge: ['🟥', 'Rouge'], jaune: ['🟨', 'Jaune'], vert: ['🟩', 'Vert'], blanc: ['⬜', 'Blanc'] };
  const PORTEE = { tous: 'Entraînements et rencontres', entrainement: 'Entraînements seulement', match: 'Rencontres seulement' };
  const REGLES = { gagnant_reste: 'Gagnant reste', gagnant_sort: 'Gagnant sort (les 2 équipes sortent)', manuel: 'Manuel' };
  const AIDE_JOGA = 'Joga Bonito : le joueur le plus technique et le plus plaisant à regarder, celui qui a du style, joue avec le ballon et fait plaisir aux yeux. Noté sur 10 à chaque match, il a son propre prix.';
  const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (d || ''); };
  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  const nomJ = (j) => ((j.prenom || '') + ' ' + (j.nom || '')).trim();
  const libMatch = (m) => m.categorie === 'entrainement' ? `${m.equipe_a || 'Équipe 1'} contre ${m.equipe_b || 'Équipe 2'}` : (m.adversaire || 'Match');
  const call = (m, p, b) => api('/api/tracker' + p, b === undefined ? { method: m } : { method: m, body: b });
  const pas = (o) => `<i class="tk-pas ${esc((o && o.pastille) || 'rouge')}" title="${esc((o && o.pastille_libelle) || 'Non répertorié dans les adhésions')}" role="img" aria-label="${esc((o && o.pastille_libelle) || 'Non répertorié dans les adhésions')}"></i>`;
  const LEGENDE = '<div class="small muted" style="display:flex;gap:12px;flex-wrap:wrap;margin:0 4px 8px"><span><i class="tk-pas vert"></i>à jour</span><span><i class="tk-pas jaune"></i>pas à jour</span><span><i class="tk-pas rouge"></i>non répertorié</span></div>';
  const RAPPEL = '<div style="background:#FFFBEB;border:1px solid #F59E0B;color:#92400E;border-radius:12px;padding:10px 12px;font-size:13px;margin:0 0 12px">⚠️ Le Tracker ne concerne que les <b>personnes majeures</b>. Ne saisissez aucune donnée relative à un mineur.</div>';

  if (!document.getElementById('m-mod-tracker-css')) {
    const st = document.createElement('style'); st.id = 'm-mod-tracker-css';
    st.textContent = `
      .tk-nav{display:flex;gap:8px;overflow-x:auto;margin:0 0 12px;padding-bottom:2px}
      .tk-nav a,.tk-nav button{flex:none;border:1px solid var(--border);border-radius:99px;padding:8px 14px;font-weight:700;font-size:13.5px;background:var(--card);color:var(--text);text-decoration:none;font-family:inherit}
      .tk-nav .on{background:var(--navy);color:#fff;border-color:var(--navy)}
      .tk-in{width:100%;min-height:46px;border:1px solid var(--border);border-radius:12px;padding:0 12px;font-size:16px;background:#fff;color:var(--text);font-family:inherit;box-sizing:border-box}
      textarea.tk-in{padding:10px 12px;min-height:70px}
      .tk-lbl{display:block;font-weight:600;font-size:13px;margin:10px 0 4px}
      .tk-pill{display:inline-block;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:700;background:#E8F0FE;color:#1E40AF}
      .tk-pill.ok{background:#DCFCE7;color:#166534}.tk-pill.no{background:#FEE2E2;color:#991B1B}.tk-pill.mu{background:#EEF2F6;color:#475569}
      .tk-pas{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px;vertical-align:middle;flex:none}
      .tk-pas.vert{background:#22C55E}.tk-pas.jaune{background:#EAB308}.tk-pas.rouge{background:#EF4444}
      .tk-err{color:var(--red,#b91c1c);font-size:13.5px;min-height:20px;margin:8px 2px 0}
      .tk-big{display:grid;gap:10px;margin:0 0 12px}
      .tk-big button{text-align:left;border:2px solid var(--border);border-radius:16px;padding:16px;background:var(--card);color:var(--text);font:inherit}
      .tk-big button.on{border-color:var(--navy)}
      .tk-big b{display:block;font-size:18px;margin-bottom:3px}.tk-big span{font-size:13px;color:var(--muted)}
      .tk-ligne{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border)}
      .tk-ligne:last-child{border-bottom:none}
      .tk-ligne input[type=checkbox]{width:26px;height:26px;flex:none}
      .tk-ligne select{min-height:40px;border:1px solid var(--border);border-radius:10px;font-size:15px;padding:0 8px;background:#fff}
      .tk-eq{border:1px solid var(--border);border-radius:14px;padding:10px;margin-bottom:10px;background:var(--card)}
      .tk-eqh{display:flex;width:100%;justify-content:space-between;align-items:center;border:0;border-radius:10px;background:var(--sky-l);color:var(--navy);padding:12px;font:inherit;font-weight:700;font-size:15px}
      .tk-tj{display:block;width:100%;text-align:left;border:1px solid transparent;background:transparent;color:var(--text);border-radius:10px;padding:9px 8px;margin-top:4px;font:inherit}
      .tk-tj:active{background:var(--sky-l)}
      .tk-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:3px;font-size:12px;color:var(--muted)}
      .tk-chips span{background:#EEF2F6;border-radius:99px;padding:1px 8px}
      .tk-tuiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
      .tk-tuile{border:1px solid var(--border);border-radius:14px;padding:10px;text-align:center;background:#fff}
      .tk-tuile .v{font-size:26px;font-weight:800;line-height:1.1}
      .tk-tuile small{display:block;color:var(--muted);font-size:11.5px}
      .tk-tuile .b{display:flex;gap:6px;justify-content:center;margin-top:8px;flex-wrap:wrap}
      .tk-tuile .b button{border:1px solid var(--border);background:#fff;color:var(--text);border-radius:10px;min-width:46px;min-height:46px;font-weight:800;font-size:16px;font-family:inherit}
      .tk-tuile .b button.plus{background:var(--navy);color:#fff;border-color:var(--navy)}
      .tk-tuile.rouge{border-color:#EF4444}.tk-tuile.jaune{border-color:#EAB308}.tk-tuile.vert{border-color:#22C55E}.tk-tuile.blanc{border-color:#CBD5E1}
      .tk-tuile.or,.tk-or{background:linear-gradient(135deg,#FFF4C7,#F7D56A);border:1px solid #C99A12;border-top:6px solid #C99A12;color:#3B2A00}
      .tk-or{border-radius:12px;padding:10px 12px}
      .tk-tuile.or small{color:#5A4200}.tk-tuile.or .b button{background:rgba(255,255,255,.6);color:#3B2A00;border-color:#C99A12}.tk-tuile.or .b button.plus{background:#8A6400;color:#fff;border-color:#8A6400}
      .tk-aide{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#8A6400;color:#fff;font-weight:800;font-size:13px;border:0;margin-left:5px}
      .tk-neg{color:#B91C1C;font-weight:800}
      .tk-fab{position:fixed;right:max(14px,env(safe-area-inset-right,0px));bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:40;border:0;border-radius:99px;background:var(--navy);color:#fff;font:700 15px var(--font,inherit);padding:13px 18px;box-shadow:0 6px 18px rgba(0,0,0,.28)}
      .tk-cartons{display:grid;gap:8px;margin-top:8px}
      .tk-cartons .l{border:1px solid var(--border);border-radius:12px;padding:10px;display:grid;gap:6px}
      .tk-cartons .l .r{display:flex;gap:8px}.tk-cartons .l .r>div{flex:1}
      .tk-affiche{border:2px dashed var(--navy);border-radius:14px;padding:12px;margin:0 0 12px;background:var(--card)}
      .tk-dot{display:inline-block;width:14px;height:14px;border-radius:50%}.tk-dot.p{background:#22C55E}.tk-dot.a{background:#DDE3EA}`;
    document.head.appendChild(st);
  }

  const nav = (actif) => `<div class="tk-nav">${[['', 'Accueil'], ['joueurs', 'Joueurs'], ['prix', 'Prix'], ['presences', 'Présences']].map(([k, l]) => `<a href="#/tracker${k ? '/' + k : ''}" class="${actif === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
  const skeleton = () => setPane(TITRE, '<div class="sk skc" style="height:60px"></div><div class="sk skc" style="height:240px"></div>');
  const erreur = (e, retry) => { setPane(TITRE, `<div class="empty"><b>Indisponible</b>${esc(e && e.message ? e.message : 'Erreur.')}<br><br><button class="btn" id="tk-retry">Réessayer</button></div>`); const b = $('#tk-retry'); if (b) b.onclick = retry; };
  async function init() {
    if (!S.me) { const ok = await A.needLogin('Connectez-vous pour accéder au Maracana Tracker.'); if (!ok) { location.hash = '#/moi'; return false; } }
    try { ctx = await call('GET', '/contexte'); return true; } catch (e) { erreur(e, () => location.reload()); return false; }
  }
  const ici = (mon) => mon === jeton && /^#\/tracker/.test(location.hash);
  const retirerFab = () => { const f = $('#tk-fab'); if (f) f.remove(); };
  function confirmer(titre, html, ok) {
    return new Promise(resolve => {
      const close = openSheet(`<h2 style="margin:4px 0 8px;font-size:19px">${esc(titre)}</h2><div style="margin:0 0 12px;line-height:1.5">${html}</div><button class="btn block" id="tk-cok">${esc(ok)}</button><button class="btn out block" id="tk-cno" style="margin-top:10px">Annuler</button>`);
      const fin = v => { close(); resolve(v); }; $('#tk-cok').onclick = () => fin(true); $('#tk-cno').onclick = () => fin(false);
    });
  }

  /* ---------- cartons de la journée ---------- */
  function cartonsForm(reg) {
    return `<div class="tk-cartons"><b style="font-size:14px">Cartons de cette journée</b><span class="small muted">Points de fair-play (sur 10) retirés par chaque carton, sur combien de matchs, et sur quel type de rencontres. Réglage conservé jusqu’à ce que vous le changiez.</span>
      ${ctx.cartons.map(c => { const r = reg[c]; return `<div class="l"><b>${CARTON[c][0]} ${CARTON[c][1]}</b><div class="r"><div><label class="tk-lbl" style="margin-top:0" for="tk-c-${c}-m">Malus</label><input class="tk-in" type="number" inputmode="numeric" min="0" max="10" id="tk-c-${c}-m" value="${r.malus}"></div>
        <div><label class="tk-lbl" style="margin-top:0" for="tk-c-${c}-n">Pèse sur</label><select class="tk-in" id="tk-c-${c}-n">${[1, 2, 3].map(n => `<option value="${n}"${r.matchs === n ? ' selected' : ''}>${n} match${n > 1 ? 's' : ''}</option>`).join('')}</select></div></div>
        <select class="tk-in" id="tk-c-${c}-p" aria-label="Rencontres concernées">${Object.entries(PORTEE).map(([k, v]) => `<option value="${k}"${r.portee === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>`; }).join('')}</div>`;
  }
  const lireCartons = () => { const o = {}; ctx.cartons.forEach(c => { o[c] = { malus: Number($('#tk-c-' + c + '-m').value), matchs: Number($('#tk-c-' + c + '-n').value), portee: $('#tk-c-' + c + '-p').value }; }); return o; };

  /* ---------- accueil ---------- */
  let creation = null, filtre = 'tous';
  async function ecranAccueil() {
    const mon = ++jeton; retirerFab(); skeleton(); if (!(await init())) return;
    let rm, rs, rr; try { [rm, rs, rr] = await Promise.all([call('GET', '/matchs'), call('GET', '/seances'), call('GET', '/reglages')]); } catch (e) { return ici(mon) && erreur(e, ecranAccueil); }
    if (!ici(mon)) return;
    const matchs = rm.matchs.filter(m => !m.seance_id), seances = rs.seances;
    const items = [...seances.map(s => ({ t: 's', d: s.date_seance, id: s.id, o: s })), ...matchs.map(m => ({ t: 'm', d: m.date_match, id: m.id, o: m }))]
      .filter(x => filtre === 'tous' || (filtre === 'entrainement' ? x.t === 's' : x.t === 'm')).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : b.id - a.id));
    const formR = `<div class="card pad" style="margin-bottom:12px"><b>⚽ Nouvelle rencontre</b><label class="tk-lbl" for="tk-d">Date</label><input class="tk-in" type="date" id="tk-d" value="${aujourdhui()}">
        <label class="tk-lbl" for="tk-a">Adversaire</label><input class="tk-in" id="tk-a" placeholder="ex. AS Sud">
        <label style="display:flex;gap:10px;align-items:center;margin-top:12px;font-weight:600"><input type="checkbox" id="tk-rep" style="width:24px;height:24px"> Reprendre les présents de la rencontre précédente du jour</label>
        ${cartonsForm(rr.cartons)}<p class="tk-err" id="tk-err" role="alert"></p><button class="btn block" id="tk-creer-r">Créer la rencontre</button></div>`;
    const formE = `<div class="card pad" style="margin-bottom:12px"><b>🏋️ Nouvel entraînement</b><label class="tk-lbl" for="tk-sd">Date</label><input class="tk-in" type="date" id="tk-sd" value="${aujourdhui()}">
        <label class="tk-lbl" for="tk-snb">Nombre d’équipes</label><select class="tk-in" id="tk-snb">${[2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}">${n}</option>`).join('')}</select>
        <label class="tk-lbl" for="tk-sr">Enchaînement des matchs</label><select class="tk-in" id="tk-sr">${Object.entries(REGLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        ${cartonsForm(rr.cartons)}<p class="tk-err" id="tk-err" role="alert"></p><button class="btn block" id="tk-creer-e">Créer l’entraînement</button></div>`;
    setPane(TITRE, `${nav('')}${RAPPEL}
      <div class="tk-big"><button data-c="rencontre" class="${creation === 'rencontre' ? 'on' : ''}"><b>⚽ Nouvelle rencontre</b><span>Un match contre un adversaire autre que le club.</span></button>
        <button data-c="entrainement" class="${creation === 'entrainement' ? 'on' : ''}"><b>🏋️ Nouvel entraînement</b><span>Équipes du même club : présents, équipes, matchs.</span></button></div>
      ${creation === 'rencontre' ? formR : creation === 'entrainement' ? formE : ''}
      <div class="tk-nav">${[['tous', 'Tout'], ['match', 'Rencontres'], ['entrainement', 'Entraînements']].map(([k, l]) => `<button data-f="${k}" class="${filtre === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${items.length ? `<div class="lst">${items.map(x => x.t === 's'
        ? `<a class="li" href="#/tracker/seance/${x.id}"><span class="sp"><span class="t">🏋️ ${fmtDate(x.d)} — Entraînement</span><br><span class="d">${x.o.nb_equipes} équipes · ${x.o.nb_presents} présent(s) · ${x.o.nb_matchs} match(s)</span></span></a>`
        : `<a class="li" href="#/tracker/match/${x.id}"><span class="sp"><span class="t">⚽ ${fmtDate(x.d)} — ${esc(x.o.adversaire || 'Match')}</span><br><span class="d">${x.o.score_pour == null ? 'Score non saisi' : esc(x.o.score_pour + ' - ' + x.o.score_contre)} · ${x.o.joueurs} présent(s)</span></span></a>`).join('')}</div>` : '<div class="empty"><b>Rien pour le moment</b>Choisissez « Nouvelle rencontre » ou « Nouvel entraînement ».</div>'}`);
    document.querySelectorAll('.tk-big button').forEach(b => b.onclick = () => { creation = creation === b.dataset.c ? null : b.dataset.c; ecranAccueil(); });
    document.querySelectorAll('.tk-nav button[data-f]').forEach(b => b.onclick = () => { filtre = b.dataset.f; ecranAccueil(); });
    const cr = $('#tk-creer-r'); if (cr) cr.onclick = async (ev) => {
      const b = ev.currentTarget, err = $('#tk-err'); err.textContent = ''; b.disabled = true;
      try { const x = await call('POST', '/matchs', { date_match: $('#tk-d').value, adversaire: $('#tk-a').value, reprendre_presents: $('#tk-rep').checked, cartons: lireCartons() }); creation = null; toast('Rencontre créée ✓'); vueM = 'presents'; location.hash = '#/tracker/match/' + x.id; }
      catch (e) { err.textContent = e.message || 'Erreur.'; b.disabled = false; }
    };
    const ce = $('#tk-creer-e'); if (ce) ce.onclick = async (ev) => {
      const b = ev.currentTarget, err = $('#tk-err'); err.textContent = ''; b.disabled = true;
      try { const x = await call('POST', '/seances', { date_seance: $('#tk-sd').value, nb_equipes: Number($('#tk-snb').value), regle: $('#tk-sr').value, suivi_auto: $('#tk-sr').value !== 'manuel', cartons: lireCartons() }); creation = null; toast('Entraînement créé ✓'); vueS = 'presents'; location.hash = '#/tracker/seance/' + x.id; }
      catch (e) { err.textContent = e.message || 'Erreur.'; b.disabled = false; }
    };
  }

  /* ---------- liste des présents + fiche (toujours à portée de main) ---------- */
  function groupesPresents(presents, equipes) {
    if (!equipes || !equipes.length) return [{ nom: null, lst: presents }];
    const g = equipes.map(e => ({ nom: e.nom, lst: presents.filter(p => Number(p.equipe_id) === Number(e.id)) }));
    const sans = presents.filter(p => !p.equipe_id || !equipes.some(e => Number(e.id) === Number(p.equipe_id)));
    if (sans.length) g.push({ nom: 'Sans équipe', lst: sans });
    return g;
  }
  function poserFab(presents, equipes) {
    retirerFab();
    const f = document.createElement('button'); f.id = 'tk-fab'; f.className = 'tk-fab'; f.type = 'button'; f.textContent = `👥 Présents (${presents.length})`;
    f.onclick = () => {
      const close = openSheet(`<h2 style="margin:4px 0 8px;font-size:19px">👥 Présents (${presents.length})</h2>${LEGENDE}
        ${presents.length ? groupesPresents(presents, equipes).map(g => `<div style="margin-bottom:12px">${g.nom !== null ? `<div class="small muted" style="font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin:0 4px 4px">${esc(g.nom)} · ${g.lst.length}</div>` : ''}
          <div class="lst">${g.lst.map(p => `<button class="li" data-fj="${p.joueur_id}" style="width:100%;text-align:left">${pas(p)}<span class="sp"><span class="t">${esc(nomJ(p))}</span></span><span class="small muted">${esc(POSTE_C[p.poste_joue] || '')}${p.arrive_en_retard ? ' ⏱' : ''}</span></button>`).join('') || '<div class="li small muted">—</div>'}</div></div>`).join('') : '<div class="empty"><b>Personne n’est encore inscrit</b></div>'}`);
      document.querySelectorAll('[data-fj]').forEach(b => b.onclick = () => { close(); ficheSheet(Number(b.dataset.fj)); });
    };
    document.body.appendChild(f);
  }
  async function ficheSheet(jid) {
    let r; try { r = await call('GET', '/joueurs/' + jid); } catch (e) { return toast(e.message || 'Erreur', true); }
    const j = r.joueur, s = r.stats;
    openSheet(`<h2 style="margin:4px 0 4px;font-size:19px">${pas(j)}${esc(nomJ(j))}</h2><div class="small muted" style="margin-bottom:10px">${esc(j.pastille_libelle || '')}</div>
      <div class="lst"><div class="li"><span class="sp"><span class="t">Postes</span><br><span class="d">${esc(POSTE[j.poste_habituel] || '—')} · ${esc(POSTE[j.poste_2] || '—')}</span></span></div>
        ${j.email ? `<div class="li"><span class="sp"><span class="t">E-mail</span><br><span class="d">${esc(j.email)}</span></span></div>` : ''}
        <div class="li"><span class="sp"><span class="t">Statistiques</span><br><span class="d">${s.matchs} match(s) · ${s.buts} but(s) · ${s.passes} passe(s)</span></span></div>
        <div class="li"><span class="sp"><span class="t">Fair-play actuel</span><br><span class="d">${s.fair_play_actuel < 0 ? `<span class="tk-neg">${s.fair_play_actuel}</span>` : s.fair_play_actuel}${s.en_sanction ? ' ⚠️ en sanction' : ''} · moyenne ${Math.round((s.fair_play_moyenne || 5) * 10) / 10}</span></span></div>
        <div class="li"><span class="sp"><span class="t">Cartons</span><br><span class="d">🟥 ${s.carton_rouge} · 🟨 ${s.carton_jaune} · 🟩 ${s.carton_vert} · ⬜ ${s.carton_blanc}</span></span></div></div>
      <div class="tk-or" style="margin-top:10px"><b>✨ Joga Bonito moyen : ${Math.round((s.joga_moyen || 0) * 10) / 10}/10</b></div>`);
  }

  /* ---------- séance d'entraînement ---------- */
  let vueS = 'presents';
  async function ecranSeance(id) {
    const mon = ++jeton; skeleton(); if (!(await init())) return;
    let d, rj; try { [d, rj] = await Promise.all([call('GET', '/seances/' + id), call('GET', '/joueurs')]); } catch (e) { return ici(mon) && erreur(e, () => ecranSeance(id)); }
    if (!ici(mon)) return;
    const s = d.seance, E = d.equipes, P = d.presents, joueurs = rj.joueurs, eqNom = new Map(E.map(e => [Number(e.id), e.nom]));
    const entete = `<div class="small muted" style="margin:0 4px 10px"><b>🏋️ ${fmtDate(s.date_seance)}</b> · ${esc(REGLES[s.regle] || '')}</div>
      <div class="tk-nav"><a href="#/tracker">← Accueil</a>${[['presents', `① Présents (${P.length})`], ['equipes', '② Équipes'], ['matchs', `③ Matchs (${d.matchs.length})`]].map(([k, l]) => `<button data-v="${k}" class="${vueS === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    let corps = '', pied = '';
    if (vueS === 'presents') {
      const presMap = new Map(P.map(p => [Number(p.joueur_id), p])), absents = joueurs.filter(j => !presMap.has(Number(j.id)));
      corps = `${RAPPEL}${LEGENDE}<p class="small muted" style="margin:0 4px 10px;line-height:1.5">Cochez les personnes <b>présentes</b> : elles seules formeront les équipes.</p>
        ${joueurs.length ? `<div class="card" style="overflow:hidden">${joueurs.map(j => { const p = presMap.get(Number(j.id)); const po = (p && p.poste_joue) || j.poste_habituel || '';
          return `<div class="tk-ligne" style="flex-wrap:wrap"><label style="display:flex;align-items:center;gap:12px;flex:1;min-width:190px"><input type="checkbox" data-pres="${j.id}"${p ? ' checked' : ''}><span class="sp" style="font-weight:600">${pas(j)}${esc(nomJ(j))}${p && p.arrive_en_retard ? ' <span class="tk-pill no">en retard</span>' : ''}<br><span class="small muted" style="font-weight:400">${[j.poste_habituel, j.poste_2].filter(Boolean).map(x => POSTE[x]).join(' · ')}</span></span></label>
            <select data-po="${j.id}" aria-label="Poste du jour"><option value="">Poste</option>${ctx.postes.map(x => `<option value="${x}"${po === x ? ' selected' : ''}>${POSTE[x]}</option>`).join('')}</select></div>`; }).join('')}</div>
          ${absents.length ? '<button class="btn out block" id="tk-retard" style="margin-top:12px">⏱️ Un joueur arrive en retard</button>' : ''}` : '<div class="empty"><b>Aucun joueur</b>Ajoutez-en dans l’onglet Joueurs.</div>'}`;
      pied = joueurs.length ? '<button class="btn block" id="tk-save-pres">Enregistrer les présents</button>' : '';
    } else if (vueS === 'equipes') {
      const opt = (sel) => `<option value="">Sans équipe</option>${E.map(e => `<option value="${e.id}"${Number(sel) === Number(e.id) ? ' selected' : ''}>${esc(e.nom)}</option>`).join('')}`;
      const resume = (lst) => ['gardien', 'defenseur', 'milieu', 'attaquant'].map(k => { const n = lst.filter(p => p.poste_joue === k).length; return n ? `${n} ${POSTE_C[k]}` : ''; }).filter(Boolean).join(' · ') || '—';
      const ligne = (p) => `<div class="tk-ligne">${pas(p)}<span class="sp" style="flex:1">${esc(nomJ(p))} <span class="small muted">${esc(POSTE_C[p.poste_joue] || '')}</span>${p.arrive_en_retard ? ' <span class="tk-pill no">⏱</span>' : ''}</span><select data-move="${p.joueur_id}" aria-label="Changer d’équipe">${opt(p.equipe_id)}</select></div>`;
      const sans = P.filter(p => !p.equipe_id || !eqNom.has(Number(p.equipe_id)));
      corps = `<div class="row" style="gap:8px;margin-bottom:10px"><button class="btn sp" id="tk-equilibrer"${d.matchs.length ? ' disabled' : ''}>⚖️ Répartir automatiquement</button><button class="btn out" id="tk-addeq">＋ Équipe</button></div>
        <p class="small muted" style="margin:0 4px 10px;line-height:1.5">Un joueur peut changer d’équipe à tout moment : il garde ses stats et reçoit <b>1 point de fair-play</b> une fois les matchs commencés.</p>
        ${E.map(e => { const lst = P.filter(p => Number(p.equipe_id) === Number(e.id)); return `<div class="tk-eq"><div style="display:flex;gap:8px;align-items:center;margin-bottom:4px"><input class="tk-in" data-nomeq="${e.id}" value="${esc(e.nom)}" aria-label="Nom de l’équipe" style="font-weight:700"><span class="tk-pill">${lst.length}</span></div><div class="small muted" style="margin:0 2px 4px">${esc(resume(lst))}</div>${lst.map(ligne).join('') || '<div class="small muted" style="padding:6px">Aucun joueur</div>'}</div>`; }).join('')}
        ${sans.length ? `<div class="tk-eq"><b>Sans équipe (${sans.length})</b>${sans.map(ligne).join('')}</div>` : ''}
        <div class="card pad"><b>Enchaînement</b><select class="tk-in" id="tk-regle" style="margin-top:8px">${Object.entries(REGLES).map(([k, v]) => `<option value="${k}"${s.regle === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
          <label style="display:flex;gap:10px;align-items:center;margin-top:10px;font-weight:600"><input type="checkbox" id="tk-auto" style="width:24px;height:24px"${s.suivi_auto ? ' checked' : ''}> Suivi automatique</label>
          <div class="small muted" style="margin:10px 2px 4px"><b>Ordre de passage</b></div>${d.ordre.map((eid, i) => `<div class="tk-ligne"><span class="tk-pill mu">${i + 1}</span><span class="sp" style="flex:1">${esc(eqNom.get(Number(eid)) || '')}</span><button class="btn out sm" data-ord="${eid}" data-dir="-1"${i === 0 ? ' disabled' : ''}>↑</button><button class="btn out sm" data-ord="${eid}" data-dir="1"${i === d.ordre.length - 1 ? ' disabled' : ''}>↓</button></div>`).join('')}</div>`;
      pied = '<button class="btn block" id="tk-save-eq">Enregistrer noms et réglage</button>';
    } else {
      const et = d.etat, manuel = !s.suivi_auto || s.regle === 'manuel';
      corps = `${et.prochain ? `<div class="tk-affiche"><b>Prochaine affiche proposée</b><div style="font-size:18px;margin:6px 0"><b>${esc(et.prochain[0].nom)}</b> contre <b>${esc(et.prochain[1].nom)}</b></div><div class="small muted" style="margin-bottom:10px">${et.attente.length ? 'En attente : ' + et.attente.map(x => esc(x.nom)).join(', ') : ''}</div><button class="btn block" id="tk-auto-go">▶ Lancer ce match</button></div>`
        : `<div class="card pad" style="margin-bottom:12px"><b>${manuel ? 'Mode manuel' : 'Prochaine affiche'}</b><div class="small muted" style="margin-top:4px">${esc(et.raison || 'Choisissez les deux équipes.')}</div></div>`}
        <div class="card pad" style="margin-bottom:12px"><b>Choisir l’affiche à la main</b><div class="row" style="gap:8px;margin-top:8px"><select class="tk-in" id="tk-ma">${E.map(e => `<option value="${e.id}">${esc(e.nom)}</option>`).join('')}</select><select class="tk-in" id="tk-mb">${E.map((e, i) => `<option value="${e.id}"${i === 1 ? ' selected' : ''}>${esc(e.nom)}</option>`).join('')}</select></div><button class="btn out block" id="tk-man-go" style="margin-top:8px">Lancer ce match</button></div>
        <div class="h2">MATCHS DE LA SÉANCE</div>${d.matchs.length ? `<div class="lst">${d.matchs.map(m => `<a class="li" href="#/tracker/match/${m.id}"><span class="sp"><span class="t">N°${m.ordre_seance} · ${esc(m.equipe_a)} contre ${esc(m.equipe_b)}</span><br><span class="d">${m.score_pour == null ? 'Score à saisir' : esc(m.score_pour + ' - ' + m.score_contre)} · ${m.joueurs} joueur(s)</span></span></a>`).join('')}</div>` : '<div class="empty"><b>Aucun match</b></div>'}`;
    }
    setPane(TITRE, `<div id="tk-root">${entete}${corps}<p class="tk-err" id="tk-err" role="alert"></p></div>`, pied);
    poserFab(P, E);
    const err = (e) => { const x = $('#tk-err'); if (x) x.textContent = e.message || 'Erreur.'; toast(e.message || 'Erreur', true); };
    const refaire = () => ecranSeance(id);
    document.querySelectorAll('.tk-nav button[data-v]').forEach(b => b.onclick = () => { vueS = b.dataset.v; ecranSeance(id); });
    const sp = $('#tk-save-pres'); if (sp) sp.onclick = async () => {
      const liste = [...document.querySelectorAll('[data-pres]')].filter(c => c.checked).map(c => ({ joueur_id: Number(c.dataset.pres), poste_joue: ($(`[data-po="${c.dataset.pres}"]`) || {}).value || '' }));
      sp.disabled = true; try { await call('PUT', `/seances/${id}/presents`, { presents: liste }); toast('Présents enregistrés ✓'); vueS = 'equipes'; refaire(); } catch (e) { err(e); sp.disabled = false; }
    };
    const rt = $('#tk-retard'); if (rt) rt.onclick = () => {
      const absents = joueurs.filter(j => !P.some(p => Number(p.joueur_id) === Number(j.id)));
      const close = openSheet(`<h2 style="margin:4px 0 8px;font-size:19px">⏱️ Joueur arrivé en retard</h2>
        <label class="tk-lbl" for="tk-rj">Joueur</label><select class="tk-in" id="tk-rj">${absents.map(j => `<option value="${j.id}">${esc(nomJ(j))}</option>`).join('')}</select>
        <label class="tk-lbl" for="tk-rp">Son poste</label><select class="tk-in" id="tk-rp">${ctx.postes.map(x => `<option value="${x}">${POSTE[x]}</option>`).join('')}</select>
        <label class="tk-lbl" for="tk-rq">Équipe</label><select class="tk-in" id="tk-rq">${E.map(e => `<option value="${e.id}">${esc(e.nom)}</option>`).join('')}</select>
        <p class="small" id="tk-rs" style="margin:8px 2px;line-height:1.4">La proposition d’équipe apparaît ici.</p><p class="tk-err" id="tk-rerr" role="alert"></p><button class="btn block" id="tk-rok">Ajouter aux présents</button>`);
      const maj = async () => { try { const r = await call('GET', `/seances/${id}/suggestion?joueur_id=${$('#tk-rj').value}&poste=${$('#tk-rp').value}`); if (r.suggestion) { $('#tk-rq').value = r.suggestion.equipe_id; $('#tk-rs').innerHTML = `💡 Proposition : <b>${esc(r.suggestion.nom)}</b> — ${esc(r.suggestion.raison)}. Vous pouvez choisir une autre équipe.`; } } catch (e) { /* facultatif */ } };
      $('#tk-rj').onchange = () => { const j = joueurs.find(x => String(x.id) === $('#tk-rj').value); if (j && j.poste_habituel) $('#tk-rp').value = j.poste_habituel; maj(); }; $('#tk-rp').onchange = maj;
      const j0 = absents[0]; if (j0 && j0.poste_habituel) $('#tk-rp').value = j0.poste_habituel; maj();
      $('#tk-rok').onclick = async (ev) => { const b = ev.currentTarget; b.disabled = true; try { await call('POST', `/seances/${id}/retardataire`, { joueur_id: Number($('#tk-rj').value), poste_joue: $('#tk-rp').value, equipe_id: Number($('#tk-rq').value) }); close(); toast('Ajouté aux présents ✓'); refaire(); } catch (e) { $('#tk-rerr').textContent = e.message || 'Erreur.'; b.disabled = false; } };
    };
    document.querySelectorAll('[data-move]').forEach(sel => sel.onchange = async () => { try { const r = await call('PUT', `/seances/${id}/joueurs/${sel.dataset.move}/equipe`, { equipe_id: sel.value ? Number(sel.value) : null }); toast(r.bonus_fair_play ? 'Déplacé : +1 point de fair-play ✓' : 'Joueur déplacé ✓'); refaire(); } catch (e) { err(e); refaire(); } });
    const eq = $('#tk-equilibrer'); if (eq) eq.onclick = async () => { try { await call('POST', `/seances/${id}/equilibrer`, {}); toast('Équipes équilibrées ✓'); refaire(); } catch (e) { err(e); } };
    const ae = $('#tk-addeq'); if (ae) ae.onclick = async () => { try { await call('POST', `/seances/${id}/equipes`, {}); refaire(); } catch (e) { err(e); } };
    document.querySelectorAll('[data-ord]').forEach(b => b.onclick = async () => { const o = d.ordre.slice(), i = o.indexOf(Number(b.dataset.ord)), j = i + Number(b.dataset.dir); if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; try { await call('PUT', '/seances/' + id, { ordre: o }); refaire(); } catch (e) { err(e); } });
    const se = $('#tk-save-eq'); if (se) se.onclick = async () => {
      try { await call('PUT', '/seances/' + id, { equipes: [...document.querySelectorAll('[data-nomeq]')].map(i => ({ id: Number(i.dataset.nomeq), nom: i.value })), regle: $('#tk-regle').value, suivi_auto: $('#tk-auto').checked }); toast('Enregistré ✓'); vueS = 'matchs'; refaire(); } catch (e) { err(e); }
    };
    const ag = $('#tk-auto-go'); if (ag) ag.onclick = async () => { ag.disabled = true; try { const r = await call('POST', `/seances/${id}/matchs`, { auto: true }); toast(`Match lancé · ${r.joueurs} joueur(s) ✓`); location.hash = '#/tracker/match/' + r.id; } catch (e) { err(e); ag.disabled = false; } };
    const mg = $('#tk-man-go'); if (mg) mg.onclick = async () => { try { const r = await call('POST', `/seances/${id}/matchs`, { equipe_a_id: Number($('#tk-ma').value), equipe_b_id: Number($('#tk-mb').value) }); toast(`Match lancé · ${r.joueurs} joueur(s) ✓`); location.hash = '#/tracker/match/' + r.id; } catch (e) { err(e); } };
  }

  /* ---------- un match : présents (rencontre) + terrain ---------- */
  let vueM = 'presents', T = null;
  const CHAMPS = { but: 'buts', passe: 'passes', fair_play: 'fp_points', joga: 'joga_bonito', rouge: 'carton_rouge', jaune: 'carton_jaune', vert: 'carton_vert', blanc: 'carton_blanc' };
  const fpTxt = (n) => n.fp_score < 0 ? `<span class="tk-neg">${n.fp_score}</span>` : String(n.fp_score);
  function ligneTerrain(n) {
    const chips = [n.buts ? `⚽ ${n.buts}` : '', n.passes ? `🎯 ${n.passes}` : '', n.fp_points ? `🤝 +${n.fp_points}` : '', n.joga_bonito ? `✨ ${n.joga_bonito}/10` : '', n.carton_rouge ? `🟥 ${n.carton_rouge}` : '', n.carton_jaune ? `🟨 ${n.carton_jaune}` : '', n.carton_vert ? `🟩 ${n.carton_vert}` : '', n.carton_blanc ? `⬜ ${n.carton_blanc}` : ''].filter(Boolean);
    return `<button class="tk-tj" data-tj="${n.joueur_id}">${pas(n)}<b>${esc(nomJ(n))}</b> <span class="small muted">${esc(POSTE_C[n.poste_joue] || '')}</span><span style="float:right;font-size:12.5px">fair-play ${fpTxt(n)}${n.fp_sanction ? ' ⚠️' : ''}</span>${chips.length ? `<div class="tk-chips">${chips.map(c => `<span>${c}</span>`).join('')}</div>` : ''}</button>`;
  }
  function terrainHtml() {
    const entr = !!T.m.seance_id, groupes = entr ? [T.m.equipe_a, T.m.equipe_b] : [null];
    return groupes.map(eq => { const lst = T.notes.filter(n => entr ? n.equipe === eq : true), ouvert = !entr || T.ouvertes.has(eq);
      return `<div class="tk-eq">${entr ? `<button class="tk-eqh" data-te="${esc(eq)}"><span>${esc(eq)}</span><span>${lst.length} joueur(s) ${ouvert ? '▾' : '▸'}</span></button>` : ''}${ouvert ? lst.map(ligneTerrain).join('') || '<div class="small muted" style="padding:6px">Aucun joueur.</div>' : ''}</div>`; }).join('');
  }
  function majTerrain() { const el = $('#tk-terrain'); if (!el) return; el.innerHTML = terrainHtml(); brancherTerrain(); }
  function brancherTerrain() {
    document.querySelectorAll('[data-te]').forEach(b => b.onclick = () => { const e = b.dataset.te; if (T.ouvertes.has(e)) T.ouvertes.delete(e); else T.ouvertes.add(e); majTerrain(); });
    document.querySelectorAll('[data-tj]').forEach(b => b.onclick = () => panneauPoints(Number(b.dataset.tj)));
  }
  function panneauPoints(jid) {
    const n = T.notes.find(x => Number(x.joueur_id) === jid); if (!n) return;
    let aide = false;
    const open = openSheet('<div id="tk-pt"></div>');
    const rendre = () => {
      const tuile = (cls, titre, valeur, a, boutons, sous) => `<div class="tk-tuile ${cls}"><div style="font-weight:700">${titre}</div><div class="v">${valeur}</div>${sous ? `<small>${sous}</small>` : ''}<div class="b">${boutons.map(([l, d]) => `<button class="${d > 0 ? 'plus' : ''}" data-a="${a}" data-d="${d}" aria-label="${esc(titre)} ${l}">${l}</button>`).join('')}</div></div>`;
      const cr = T.cartons || {};
      $('#tk-pt').innerHTML = `<h2 style="margin:4px 0 4px;font-size:19px">${pas(n)}${esc(nomJ(n))}</h2><div style="margin-bottom:6px"><span class="tk-pill ${n.fp_sanction ? 'no' : 'ok'}">fair-play du match : ${n.fp_score}${n.fp_sanction ? ' (sanction)' : ''}</span></div>
        <div class="tk-tuiles">${tuile('', '⚽ But', n.buts, 'but', [['−', -1], ['+1', 1]])}${tuile('', '🎯 Passe décisive', n.passes, 'passe', [['−', -1], ['+1', 1]])}
        ${tuile('', '🤝 Fair-play', '+' + n.fp_points, 'fair_play', [['−', -1], ['+1', 1], ['+2', 2], ['+3', 3]], 'belle action')}
        ${tuile('or', '✨ Joga Bonito <button type="button" class="tk-aide" data-aide="1" aria-label="Qu’est-ce que le Joga Bonito ?">?</button>', n.joga_bonito + '/10', 'joga', [['−', -1], ['+1', 1], ['+2', 2], ['+3', 3]], 'technique et plaisir des yeux')}
        ${ctx.cartons.map(c => { const r = cr[c] || { malus: 0, matchs: 1 }; return tuile(c, `${CARTON[c][0]} ${CARTON[c][1]}`, n['carton_' + c] || 0, c, [['−', -1], ['+1', 1]], `−${r.malus} pt · ${r.matchs} match${r.matchs > 1 ? 's' : ''}`); }).join('')}</div>
        ${aide ? `<div class="tk-or" style="margin-top:10px"><b>✨ Joga Bonito</b><br><span class="small">${esc(AIDE_JOGA)}</span></div>` : ''}<button class="btn out block" id="tk-ptc" style="margin-top:12px">Fermer</button>`;
      document.querySelectorAll('#tk-pt [data-a]').forEach(b => b.onclick = async () => {
        try {
          const r = await call('POST', `/matchs/${T.m.id}/joueurs/${jid}/action`, { action: b.dataset.a, delta: Number(b.dataset.d) });
          n[CHAMPS[b.dataset.a]] = r.valeur; if (r.fair_play) { n.fp_score = r.fair_play.score; n.fp_niveau = r.fair_play.niveau; n.fp_sanction = r.fair_play.sanction; }
          rendre(); majTerrain();
        } catch (e) { toast(e.message || 'Erreur', true); }
      });
      const ha = $('#tk-pt [data-aide]'); if (ha) ha.onclick = () => { aide = !aide; rendre(); };
      $('#tk-ptc').onclick = () => { open(); majTerrain(); };
    };
    rendre();
  }
  async function ecranMatch(id) {
    const mon = ++jeton; skeleton(); if (!(await init())) return;
    let dm, rj; try { [dm, rj] = await Promise.all([call('GET', '/matchs/' + id), call('GET', '/joueurs')]); } catch (e) { return ici(mon) && erreur(e, () => ecranMatch(id)); }
    if (!ici(mon)) return;
    const m = dm.match, notes = dm.notes, joueurs = rj.joueurs, seance = !!m.seance_id;
    const garde = T && T.m.id === m.id;
    T = { m, notes: notes.map(x => ({ ...x })), cartons: dm.cartons, ouvertes: garde ? T.ouvertes : new Set(seance ? [] : ['*']) };
    const presents = new Map(notes.map(n => [Number(n.joueur_id), n]));
    const entete = seance
      ? `<div class="tk-nav"><a href="#/tracker/seance/${m.seance_id}">← Entraînement</a></div><div class="small muted" style="margin:0 4px 8px"><b>🏋️ Match n°${m.ordre_seance} · ${esc(libMatch(m))}</b></div>
         <div class="card pad" style="margin-bottom:12px"><b>Score</b><div class="row" style="gap:10px;margin-top:8px"><div style="flex:1"><label class="tk-lbl" style="margin-top:0" for="tk-sa">${esc(m.equipe_a)}</label><input class="tk-in" type="number" inputmode="numeric" min="0" id="tk-sa" value="${m.score_pour == null ? '' : m.score_pour}"></div><div style="flex:1"><label class="tk-lbl" style="margin-top:0" for="tk-sb">${esc(m.equipe_b)}</label><input class="tk-in" type="number" inputmode="numeric" min="0" id="tk-sb" value="${m.score_contre == null ? '' : m.score_contre}"></div></div><button class="btn block" id="tk-score" style="margin-top:10px">Enregistrer le score</button></div>`
      : `<div class="tk-nav"><a href="#/tracker">← Accueil</a>${[['presents', `① Présents (${notes.length})`], ['terrain', '② Terrain']].map(([k, l]) => `<button data-v="${k}" class="${vueM === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="small muted" style="margin:0 4px 8px"><b>⚽ ${fmtDate(m.date_match)} — ${esc(libMatch(m))}</b></div>`;
    let corps = '', pied = '';
    if (!seance && vueM === 'presents') {
      const absents = joueurs.filter(j => !presents.has(Number(j.id)));
      corps = `${RAPPEL}${LEGENDE}<p class="small muted" style="margin:0 4px 10px;line-height:1.5">Cochez les joueurs <b>présents</b> : eux seuls pourront être notés.</p>
        ${joueurs.length ? `<div class="card" style="overflow:hidden">${joueurs.map(j => { const p = presents.get(Number(j.id)); const po = (p && p.poste_joue) || j.poste_habituel || '';
          return `<div class="tk-ligne" style="flex-wrap:wrap"><label style="display:flex;align-items:center;gap:12px;flex:1;min-width:190px"><input type="checkbox" data-pres="${j.id}"${p ? ' checked' : ''}><span class="sp" style="font-weight:600">${pas(j)}${esc(nomJ(j))}${p && p.arrive_en_retard ? ' <span class="tk-pill no">en retard</span>' : ''}</span></label>
            <select data-po="${j.id}"><option value="">Poste</option>${ctx.postes.map(x => `<option value="${x}"${po === x ? ' selected' : ''}>${POSTE[x]}</option>`).join('')}</select></div>`; }).join('')}</div>
          ${absents.length ? '<button class="btn out block" id="tk-retard" style="margin-top:12px">⏱️ Un joueur arrive en retard</button>' : ''}` : '<div class="empty"><b>Aucun joueur</b></div>'}`;
      pied = '<button class="btn block" id="tk-save-pres">Enregistrer les présents</button>';
    } else {
      corps = `${RAPPEL}${notes.length ? `<p class="small muted" style="margin:0 4px 10px;line-height:1.5">${seance ? 'Touchez une équipe, puis un joueur' : 'Touchez un joueur'} pour lui attribuer ses points : <b>1 appui = 1 point</b>. Fair-play : <b>${ctx.fair_play.defaut}/10</b> pour tous, + points, − cartons.</p>${LEGENDE}<div id="tk-terrain">${terrainHtml()}</div>` : '<div class="empty"><b>Aucun présent</b>Déclarez d’abord les présents.</div>'}`;
    }
    setPane(TITRE, `<div id="tk-root">${entete}${corps}<p class="tk-err" id="tk-err" role="alert"></p></div>`, pied);
    poserFab(notes.map(n => ({ joueur_id: n.joueur_id, prenom: n.prenom, nom: n.nom, poste_joue: n.poste_joue, arrive_en_retard: n.arrive_en_retard, pastille: n.pastille, pastille_libelle: n.pastille_libelle, equipe_id: seance ? ((n.equipe === m.equipe_a) ? m.equipe_a_id : m.equipe_b_id) : null })),
      seance ? [{ id: m.equipe_a_id, nom: m.equipe_a }, { id: m.equipe_b_id, nom: m.equipe_b }] : null);
    brancherTerrain();
    document.querySelectorAll('.tk-nav button[data-v]').forEach(b => b.onclick = () => { vueM = b.dataset.v; ecranMatch(id); });
    const sc = $('#tk-score'); if (sc) sc.onclick = async () => { try { await call('PUT', '/matchs/' + id, { score_pour: $('#tk-sa').value, score_contre: $('#tk-sb').value }); toast('Score enregistré ✓'); } catch (e) { toast(e.message || 'Erreur', true); } };
    const sp = $('#tk-save-pres'); if (sp) sp.onclick = async () => {
      const liste = [...document.querySelectorAll('[data-pres]')].filter(c => c.checked).map(c => ({ joueur_id: Number(c.dataset.pres), poste_joue: ($(`[data-po="${c.dataset.pres}"]`) || {}).value || '' }));
      sp.disabled = true; try { await call('PUT', `/matchs/${id}/presents`, { presents: liste }); toast('Présents enregistrés ✓'); vueM = 'terrain'; ecranMatch(id); } catch (e) { $('#tk-err').textContent = e.message || 'Erreur.'; sp.disabled = false; }
    };
    const rt = $('#tk-retard'); if (rt) rt.onclick = () => {
      const absents = joueurs.filter(j => !presents.has(Number(j.id)));
      const close = openSheet(`<h2 style="margin:4px 0 8px;font-size:19px">⏱️ Joueur arrivé en retard</h2><label class="tk-lbl" for="tk-rj">Joueur</label><select class="tk-in" id="tk-rj">${absents.map(j => `<option value="${j.id}">${esc(nomJ(j))}</option>`).join('')}</select>
        <label class="tk-lbl" for="tk-rp">Poste</label><select class="tk-in" id="tk-rp"><option value="">—</option>${ctx.postes.map(x => `<option value="${x}">${POSTE[x]}</option>`).join('')}</select><p class="tk-err" id="tk-rerr" role="alert"></p><button class="btn block" id="tk-rok">Ajouter aux présents</button>`);
      $('#tk-rok').onclick = async () => { try { await call('POST', `/matchs/${id}/retardataire`, { joueur_id: Number($('#tk-rj').value), poste_joue: $('#tk-rp').value }); close(); toast('Ajouté ✓'); ecranMatch(id); } catch (e) { $('#tk-rerr').textContent = e.message || 'Erreur.'; } };
    };
  }

  /* ---------- joueurs ---------- */
  async function ecranJoueurs() {
    const mon = ++jeton; retirerFab(); skeleton(); if (!(await init())) return;
    let rj, ra; try { [rj, ra] = await Promise.all([call('GET', '/joueurs'), call('GET', '/adherents')]); } catch (e) { return ici(mon) && erreur(e, ecranJoueurs); }
    if (!ici(mon)) return;
    const prop = ra.adherents.filter(a => !a.deja_ajoute);
    setPane(TITRE, `${nav('joueurs')}${RAPPEL}${LEGENDE}
      <div class="h2">JOUEURS (${rj.joueurs.length})</div>
      ${rj.joueurs.length ? `<div class="lst">${rj.joueurs.map(j => `<div class="li"><span class="sp"><span class="t">${pas(j)}${esc(nomJ(j))}</span><br><span class="d">${[j.poste_habituel, j.poste_2].filter(Boolean).map(x => POSTE[x]).join(' · ') || 'postes non précisés'} · ${j.matchs} match(s) · ${j.buts} but(s)</span></span><button class="btn out sm" data-fic="${j.id}">Fiche</button> <button class="btn out sm" data-ret="${j.id}" data-nom="${esc(nomJ(j))}">Retirer</button></div>`).join('')}</div>` : '<div class="empty"><b>Aucun joueur</b></div>'}
      <div class="h2" style="margin-top:16px">AJOUTER UN ADHÉRENT</div>
      ${prop.length ? `<div class="lst">${prop.map((a, i) => `<div class="li"><span class="sp"><span class="t">${pas(a)}${esc(nomJ(a))}</span>${a.mineur ? '<br><span class="tk-pill no">mineur — refusé</span>' : (a.age_inconnu ? '<br><span class="d">âge non renseigné</span>' : '')}</span><button class="btn out sm" data-adh="${i}"${a.mineur ? ' disabled' : ''}>Ajouter</button></div>`).join('')}</div>` : '<p class="small muted" style="margin:4px">Aucun adhérent à proposer.</p>'}
      <div class="h2" style="margin-top:16px">PERSONNE SANS COMPTE</div>
      <div class="card pad"><label class="tk-lbl" for="tk-jn" style="margin-top:0">Nom *</label><input class="tk-in" id="tk-jn"><label class="tk-lbl" for="tk-jp">Prénom</label><input class="tk-in" id="tk-jp">
        <label class="tk-lbl" for="tk-je">E-mail * (pour lui envoyer ses statistiques)</label><input class="tk-in" id="tk-je" type="email" inputmode="email" autocapitalize="off">
        <label class="tk-lbl" for="tk-jo">Poste 1</label><select class="tk-in" id="tk-jo"><option value="">—</option>${ctx.postes.map(x => `<option value="${x}">${POSTE[x]}</option>`).join('')}</select>
        <label class="tk-lbl" for="tk-jo2">Poste 2</label><select class="tk-in" id="tk-jo2"><option value="">—</option>${ctx.postes.map(x => `<option value="${x}">${POSTE[x]}</option>`).join('')}</select>
        <label style="display:flex;gap:10px;align-items:center;margin-top:12px;font-weight:600"><input type="checkbox" id="tk-jm" style="width:24px;height:24px"> J’atteste que cette personne est majeure (18 ans ou plus)</label>
        <p class="tk-err" id="tk-err" role="alert"></p><button class="btn block" id="tk-jadd">Ajouter</button></div>`);
    const recharger = ecranJoueurs;
    document.querySelectorAll('[data-ret]').forEach(b => b.onclick = async () => { if (!(await confirmer(`Retirer ${b.dataset.nom} ?`, 'Toutes ses notes et statistiques seront supprimées.', 'Retirer'))) return; try { await call('DELETE', '/joueurs/' + b.dataset.ret); toast('Joueur retiré ✓'); recharger(); } catch (e) { toast(e.message || 'Erreur', true); } });
    document.querySelectorAll('[data-fic]').forEach(b => b.onclick = () => {
      const j = rj.joueurs.find(x => Number(x.id) === Number(b.dataset.fic)); const lie = !!j.user_id;
      const opt = (sel) => `<option value="">—</option>${ctx.postes.map(x => `<option value="${x}"${sel === x ? ' selected' : ''}>${POSTE[x]}</option>`).join('')}`;
      const close = openSheet(`<h2 style="margin:4px 0 8px;font-size:19px">🪪 Fiche joueur</h2>${lie ? '<p class="small muted" style="margin:0 0 6px">Adhérent avec compte : nom et e-mail viennent de son compte.</p>' : ''}
        <label class="tk-lbl" for="tk-fn">Nom</label><input class="tk-in" id="tk-fn" value="${esc(j.nom)}"${lie ? ' disabled' : ''}><label class="tk-lbl" for="tk-fp">Prénom</label><input class="tk-in" id="tk-fp" value="${esc(j.prenom || '')}"${lie ? ' disabled' : ''}>
        <label class="tk-lbl" for="tk-fe">E-mail</label><input class="tk-in" id="tk-fe" type="email" inputmode="email" value="${esc(j.email || '')}"${lie ? ' disabled' : ''}>
        <label class="tk-lbl" for="tk-f1">Poste 1</label><select class="tk-in" id="tk-f1">${opt(j.poste_habituel)}</select><label class="tk-lbl" for="tk-f2">Poste 2</label><select class="tk-in" id="tk-f2">${opt(j.poste_2)}</select>
        <p class="tk-err" id="tk-ferr" role="alert"></p><button class="btn block" id="tk-fok">Enregistrer la fiche</button>`);
      $('#tk-fok').onclick = async (ev) => { const bt = ev.currentTarget; bt.disabled = true; try { await call('PUT', '/joueurs/' + j.id, { nom: $('#tk-fn').value, prenom: $('#tk-fp').value, email: $('#tk-fe').value, poste_habituel: $('#tk-f1').value, poste_2: $('#tk-f2').value }); close(); toast('Fiche enregistrée ✓'); recharger(); } catch (e) { $('#tk-ferr').textContent = e.message || 'Erreur.'; bt.disabled = false; } };
    });
    document.querySelectorAll('[data-adh]').forEach(b => b.onclick = async () => {
      const a = prop[Number(b.dataset.adh)];
      if (!(await confirmer('Attestation de majorité', `J’atteste que <b>${esc(nomJ(a))}</b> est majeur(e) (18 ans ou plus).`, 'J’atteste'))) return;
      try { await call('POST', '/joueurs', { user_id: a.user_id, adhesion_membre_id: a.adhesion_membre_id, nom: a.nom, prenom: a.prenom, email: a.email, majeur_atteste: true }); toast('Joueur ajouté ✓'); recharger(); } catch (e) { toast(e.message || 'Erreur', true); }
    });
    $('#tk-jadd').onclick = async (ev) => {
      const b = ev.currentTarget, err = $('#tk-err'); err.textContent = ''; b.disabled = true;
      try { await call('POST', '/joueurs', { nom: $('#tk-jn').value, prenom: $('#tk-jp').value, email: $('#tk-je').value, poste_habituel: $('#tk-jo').value, poste_2: $('#tk-jo2').value, majeur_atteste: $('#tk-jm').checked }); toast('Joueur ajouté ✓'); recharger(); }
      catch (e) { err.textContent = e.message || 'Erreur.'; b.disabled = false; }
    };
  }

  /* ---------- prix ---------- */
  async function ecranPrix(id) {
    const mon = ++jeton; retirerFab(); skeleton(); if (!(await init())) return;
    if (id) {
      let r; try { r = await call('GET', '/prix/' + id); } catch (e) { return ici(mon) && erreur(e, () => ecranPrix(id)); }
      if (!ici(mon)) return;
      const p = r.prix, det = (d) => Object.entries(d).filter(([k]) => k !== 'matchs').map(([k, v]) => `${k.replace(/_/g, ' ')} : ${v}`).join(' · ');
      setPane(p.nom, `${p.modele === 'jogabonito' ? `<div class="tk-or" style="margin-bottom:10px"><b>✨ Joga Bonito</b><br><span class="small">${esc(AIDE_JOGA)}</span></div>` : ''}
        <div class="small muted" style="margin:0 4px 10px">${r.matchs_pris_en_compte} match(s) pris en compte · minimum ${p.regle.min_matchs}${p.regle.membres_a_jour ? ' · <b>membres à jour uniquement</b>' : ''}</div>${LEGENDE}
        ${r.classement.some(x => x.egalite) ? '<div style="background:#FFFBEB;border:1px solid #F59E0B;border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:13px">Égalité parfaite sur certains rangs : le bureau tranche.</div>' : ''}
        ${r.classement.length ? r.classement.map(x => `<div class="card pad" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${x.rang}${x.egalite ? ' =' : ''}. ${pas(x)}${esc(x.nom)}${p.laureat_joueur_id === x.joueur_id ? ' 🏆' : ''}</b><span class="tk-pill ok">${x.score}</span></div>
          <div class="small muted" style="margin-top:4px">${esc(det(x.detail))}</div>${p.laureat_joueur_id === x.joueur_id ? '<div style="margin-top:8px"><span class="tk-pill ok">Lauréat</span></div>' : `<button class="btn out sm" style="margin-top:8px" data-lau="${x.joueur_id}">Désigner lauréat</button>`}</div>`).join('') : '<div class="empty"><b>Pas encore de classement</b>Minimum non atteint.</div>'}
        ${r.ecartes.length ? `<p class="small muted" style="margin:6px 4px">Écartés (moins de ${p.regle.min_matchs} match(s)) : ${r.ecartes.map(e => pas(e) + esc(e.nom) + ' (' + e.matchs + ')').join(', ')}</p>` : ''}
        ${r.exclus_cotisation && r.exclus_cotisation.length ? `<p class="small muted" style="margin:6px 4px">Exclus (cotisation non à jour) : ${r.exclus_cotisation.map(e => pas(e) + esc(e.nom)).join(', ')}</p>` : ''}
        <a class="btn out block" href="#/tracker/prix" style="margin-top:8px">← Tous les prix</a>`);
      document.querySelectorAll('[data-lau]').forEach(b => b.onclick = async () => { try { await call('POST', `/prix/${id}/laureat`, { joueur_id: Number(b.dataset.lau) }); toast('Lauréat désigné ✓'); ecranPrix(id); } catch (e) { toast(e.message || 'Erreur', true); } });
      return;
    }
    let r; try { r = await call('GET', '/prix'); } catch (e) { return ici(mon) && erreur(e, () => ecranPrix()); }
    if (!ici(mon)) return;
    setPane(TITRE, `${nav('prix')}${r.prix.length ? r.prix.map(p => `<a class="card pad${p.modele === 'jogabonito' ? ' tk-or' : ''}" style="display:block;margin-bottom:10px;text-decoration:none;color:${p.modele === 'jogabonito' ? '#3B2A00' : 'inherit'}" href="#/tracker/prix/${p.id}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${p.emoji || ''} ${esc(p.nom)}</b><span class="tk-pill ${p.statut === 'clos' ? 'ok' : 'mu'}">${p.statut === 'clos' ? 'Clos' : 'En cours'}</span></div>
      <div class="small" style="opacity:.8">${p.lot ? '🎁 ' + esc(p.lot.nom) : ''}${p.regle.membres_a_jour ? ' · membres à jour' : ''}</div>
      <div style="margin-top:8px">${p.podium.length ? p.podium.map(x => `<span class="tk-pill ${x.rang === 1 ? 'ok' : 'mu'}" style="margin:0 4px 4px 0">${x.rang}. ${esc(x.nom)} · ${x.score}</span>`).join('') : '<span class="small muted">Pas encore assez de données.</span>'}</div></a>`).join('') : '<div class="empty"><b>Aucun prix</b>Créez-les depuis le site (tableau de bord → Maracana Tracker).</div>'}`);
  }

  /* ---------- historique des présences ---------- */
  async function ecranPresences() {
    const mon = ++jeton; retirerFab(); skeleton(); if (!(await init())) return;
    let r; try { r = await call('GET', '/presences'); } catch (e) { return ici(mon) && erreur(e, ecranPresences); }
    if (!ici(mon)) return;
    setPane(TITRE, `${nav('presences')}${r.colonnes.length ? `<p class="small muted" style="margin:0 4px 10px">🟢 présent · ⚪ absent — jour après jour. Les matchs d’un entraînement comptent pour une présence.</p>${LEGENDE}
      <div class="card" style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:13px"><tr><th style="text-align:left;padding:8px">Joueur</th>${r.colonnes.map(c => `<th style="padding:8px 4px">${fmtDate(c.date).slice(0, 5)}<br><span style="font-weight:400">${c.categorie === 'entrainement' ? '🏋️' : '⚽'}</span></th>`).join('')}<th style="padding:8px">Total</th></tr>
      ${r.joueurs.map(j => `<tr style="border-top:1px solid var(--border)"><td style="padding:8px;white-space:nowrap">${pas(j)}${esc(j.nom)}</td>${r.colonnes.map(c => `<td style="text-align:center;padding:8px 4px"><span class="tk-dot ${j.presents.includes(c.cle) ? 'p' : 'a'}"></span></td>`).join('')}<td style="padding:8px;white-space:nowrap"><b>${j.nb_presents}/${j.nb_matchs}</b></td></tr>`).join('')}</table></div>`
      : '<div class="empty"><b>Rien pour le moment</b>L’historique des présences apparaîtra ici.</div>'}`);
  }

  window.MMods.tracker = function (b, c) {
    if (b === 'seance') return ecranSeance(c);
    if (b === 'match') return ecranMatch(c);
    if (b === 'joueurs') return ecranJoueurs();
    if (b === 'prix') return ecranPrix(c);
    if (b === 'presences') return ecranPresences();
    return ecranAccueil();
  };
  window.addEventListener('hashchange', () => { if (!/^#\/tracker/.test(location.hash)) retirerFab(); });
})();
