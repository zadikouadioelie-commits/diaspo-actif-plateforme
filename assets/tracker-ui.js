/* ============================================================
   Diaspo'Actif — MARACANA TRACKER : interface bureau (tableau de bord Initiative).
   Utilisation : TrackerUI.mount(elementConteneur). Toutes les données passent par /api/tracker/*.
   Règles affichées : majeurs uniquement, présents du jour d'abord, fair-play 5/10 par défaut (+2/+3).
   ============================================================ */
(function () {
  'use strict';
  if (window.TrackerUI) return;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const call = (m, p, b) => window.api(m, p, b);
  const POSTE_LIB = { gardien: '🧤 Gardien', defenseur: '🛡️ Défenseur', milieu: '🎯 Milieu', attaquant: '⚽ Attaquant' };
  const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (d || ''); };
  const aujourdhui = () => new Date().toISOString().slice(0, 10);

  let root = null, ctx = null, tab = 'matchs', matchOuvert = null, prixOuvert = null, msg = null;

  const css = `
  .trk{--trk-bord:var(--border,#e2e8f0);font-size:14px}
  .trk h2{margin:0 0 4px}
  .trk .trk-sub{color:var(--muted,#64748b);margin:0 0 14px;font-size:13px}
  .trk-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px}
  .trk-tab{border:1px solid var(--trk-bord);background:transparent;color:inherit;border-radius:999px;padding:8px 14px;font-weight:700;cursor:pointer;font-size:13px}
  .trk-tab.on{background:#2563EB;color:#fff;border-color:#2563EB}
  .trk-rappel{background:#fffbeb;border:1px solid #f59e0b;color:#92400e;border-radius:10px;padding:9px 12px;font-size:12.5px;margin:0 0 14px}
  .trk-card{border:1px solid var(--trk-bord);border-radius:12px;padding:14px;margin:0 0 12px;background:var(--card,transparent)}
  .trk-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .trk-grow{flex:1;min-width:140px}
  .trk input,.trk select,.trk textarea{border:1px solid var(--trk-bord);border-radius:8px;padding:8px 10px;font-size:14px;background:var(--bg,#fff);color:inherit;font-family:inherit;max-width:100%;box-sizing:border-box}
  .trk input[type=number]{width:70px}
  .trk label{font-size:12px;font-weight:700;display:block;margin:0 0 3px}
  .trk-btn{border:none;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer;background:#2563EB;color:#fff;font-size:13px}
  .trk-btn.sec{background:transparent;color:inherit;border:1px solid var(--trk-bord)}
  .trk-btn.danger{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}
  .trk-btn[disabled]{opacity:.5;cursor:not-allowed}
  .trk-ok{background:#f0fdf4;border:1px solid #22c55e;color:#166534;border-radius:8px;padding:8px 12px;margin:0 0 12px;font-size:13px}
  .trk-err{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:8px 12px;margin:0 0 12px;font-size:13px}
  .trk table{border-collapse:collapse;width:100%}
  .trk th,.trk td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--trk-bord);vertical-align:top;font-size:13px}
  .trk-scroll{overflow-x:auto}
  .trk-pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11.5px;font-weight:700;background:#eff6ff;color:#1d4ed8}
  .trk-pill.ok{background:#f0fdf4;color:#166534}.trk-pill.no{background:#fef2f2;color:#b91c1c}.trk-pill.mut{background:#f1f5f9;color:#475569}
  .trk-modele{cursor:pointer;border:2px solid var(--trk-bord);border-radius:12px;padding:12px;flex:1;min-width:150px}
  .trk-modele.on{border-color:#2563EB;background:rgba(37,99,235,.16)}
  .trk-modele b{display:block;margin-bottom:3px}.trk-modele span{font-size:12px;color:var(--muted,#64748b)}
  .trk-fp{display:flex;gap:4px;flex-wrap:wrap}
  .trk-fp button{border:1px solid var(--trk-bord);background:transparent;color:inherit;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;font-weight:700}
  .trk-fp button.on{background:#2563EB;color:#fff;border-color:#2563EB}
  .trk-dot{display:inline-block;width:16px;height:16px;border-radius:50%}
  .trk-dot.p{background:#22c55e}.trk-dot.a{background:#e2e8f0}
  @media(max-width:640px){.trk-tab{padding:7px 11px}}`;

  function box(html) { root.innerHTML = `<style>${css}</style><div class="trk">${html}</div>`; }
  function annonce() { if (!msg) return ''; const h = `<div class="${msg.type === 'ok' ? 'trk-ok' : 'trk-err'}" role="${msg.type === 'ok' ? 'status' : 'alert'}">${esc(msg.text)}</div>`; return h; }
  function dire(type, text) { msg = { type, text }; }
  const RAPPEL = `<div class="trk-rappel">⚠️ Le Tracker ne concerne que les <b>personnes majeures</b>. Ne saisissez aucune donnée relative à un mineur.</div>`;

  async function charger(fn) { try { return await fn(); } catch (e) { dire('err', e.message || 'Erreur.'); return null; } }

  /* ---------------- structure ---------------- */
  async function mount(el) {
    root = el;
    root.innerHTML = '<p style="padding:20px">Chargement…</p>';
    try { ctx = await call('GET', '/tracker/contexte'); }
    catch (e) { root.innerHTML = `<div class="trk-err" style="margin:20px">${esc(e.message || 'Accès refusé.')}</div>`; return; }
    tab = 'matchs'; matchOuvert = null; prixOuvert = null; msg = null;
    await rendre();
  }
  const TABS = [['matchs', '📅 Matchs'], ['joueurs', '👥 Joueurs'], ['prix', '🏆 Prix & classements'], ['presences', '🗓️ Présences'], ['lots', '🎁 Lots'], ['gestion', '⚙️ Bureau & historique']];
  async function rendre() {
    let corps = '';
    if (tab === 'matchs') corps = matchOuvert ? await vueMatch() : await vueMatchs();
    else if (tab === 'joueurs') corps = await vueJoueurs();
    else if (tab === 'prix') corps = prixOuvert ? await vuePrixDetail() : await vuePrix();
    else if (tab === 'presences') corps = await vuePresences();
    else if (tab === 'lots') corps = await vueLots();
    else corps = await vueGestion();
    box(`<h2>⚽ Maracana Tracker</h2><p class="trk-sub">${esc(ctx.initiative.nom || '')} — suivi des matchs, des présences et des prix de la saison.</p>
      <div class="trk-tabs" role="tablist">${TABS.map(([k, l]) => `<button class="trk-tab${tab === k ? ' on' : ''}" data-trk-tab="${k}" role="tab">${l}</button>`).join('')}</div>
      ${annonce()}${corps}`);
    msg = null;
    brancher();
  }

  /* ---------------- matchs ---------------- */
  const libMatch = (m) => m.categorie === 'entrainement' ? `${m.equipe_a || 'Équipe 1'} contre ${m.equipe_b || 'Équipe 2'}` : (m.adversaire || 'Match');
  const pillCat = (m) => m.categorie === 'entrainement' ? '<span class="trk-pill ok">🏋️ Entraînement</span>' : '<span class="trk-pill">⚽ Match</span>';
  let filtreCat = 'tous';
  async function vueMatchs() {
    const r = await charger(() => call('GET', '/tracker/matchs'));
    const toutes = r ? r.matchs : [];
    const l = filtreCat === 'tous' ? toutes : toutes.filter(m => m.categorie === filtreCat);
    const memeJour = toutes.some(m => m.date_match === aujourdhui());
    return `${RAPPEL}
    <div class="trk-card"><b>＋ Nouvelle rencontre</b>
      <p class="trk-sub" style="margin:4px 0 0">Autant de rencontres que vous voulez dans la même journée. Les présents sont à déclarer avant de noter.</p>
      <div class="trk-row" style="margin-top:8px">
        <div><label>Catégorie</label><select id="trk-m-cat"><option value="match">⚽ Match (contre un adversaire)</option><option value="entrainement">🏋️ Entraînement (équipes du club)</option></select></div>
        <div><label>Date</label><input type="date" id="trk-m-date" value="${aujourdhui()}"></div>
        <div class="trk-grow" data-trk-cat="match"><label>Adversaire</label><input id="trk-m-adv" style="width:100%" placeholder="ex. AS Sud"></div>
        <div class="trk-grow" data-trk-cat="entrainement" hidden><label>Équipe 1</label><input id="trk-m-ea" style="width:100%" placeholder="ex. CT 1" value="Équipe 1"></div>
        <div class="trk-grow" data-trk-cat="entrainement" hidden><label>Équipe 2</label><input id="trk-m-eb" style="width:100%" placeholder="ex. MCT 2" value="Équipe 2"></div>
        <div class="trk-grow"><label>Lieu</label><input id="trk-m-lieu" style="width:100%"></div>
        <div><label>Score éq. 1 / nous</label><input type="number" min="0" id="trk-m-sp"></div>
        <div><label>Score éq. 2 / adverse</label><input type="number" min="0" id="trk-m-sc"></div></div>
      <label style="display:flex;gap:8px;align-items:center;margin:10px 0 0;font-weight:600"><input type="checkbox" id="trk-m-reprendre"${memeJour ? ' checked' : ''}> Reprendre les présents de la rencontre précédente du même jour</label>
      <div style="margin-top:10px"><button class="trk-btn" data-trk="creer-match">Créer la rencontre</button></div></div>
    <div class="trk-tabs">${[['tous', 'Toutes'], ['match', '⚽ Matchs'], ['entrainement', '🏋️ Entraînements']].map(([k, t]) => `<button class="trk-tab${filtreCat === k ? ' on' : ''}" data-trk="filtre-cat" data-c="${k}">${t}</button>`).join('')}</div>
    ${l.length ? `<div class="trk-card trk-scroll"><table><tr><th>Date</th><th>Catégorie</th><th>Rencontre</th><th>Score</th><th>Présents</th><th></th></tr>
      ${l.map(m => `<tr><td>${fmtDate(m.date_match)}</td><td>${pillCat(m)}</td><td>${esc(libMatch(m))}</td><td>${m.score_pour == null ? '—' : esc(m.score_pour + ' - ' + m.score_contre)}</td><td><span class="trk-pill ${m.joueurs ? 'ok' : 'mut'}">${m.joueurs} présent(s)</span></td>
        <td><button class="trk-btn sec" data-trk="ouvrir-match" data-id="${m.id}">Ouvrir</button></td></tr>`).join('')}</table></div>`
      : '<p class="trk-sub">Aucune rencontre pour le moment. Créez la première ci-dessus.</p>'}`;
  }

  let cacheJoueurs = [];
  async function vueMatch() {
    const [dm, rj] = await Promise.all([charger(() => call('GET', '/tracker/matchs/' + matchOuvert)), charger(() => call('GET', '/tracker/joueurs'))]);
    if (!dm) { matchOuvert = null; return await vueMatchs(); }
    const m = dm.match, notes = dm.notes; cacheJoueurs = rj ? rj.joueurs : [];
    const presents = new Map(notes.map(n => [Number(n.joueur_id), n]));
    const dispo = cacheJoueurs;
    const entr = m.categorie === 'entrainement', eqA = m.equipe_a || 'Équipe 1', eqB = m.equipe_b || 'Équipe 2';
    const absents = dispo.filter(j => !presents.has(Number(j.id)));
    const ligne = (j) => { const p = presents.get(Number(j.id)); const poste = (p && p.poste_joue) || j.poste_habituel || '';
      const champEq = entr ? `<select data-trk-eq="${j.id}"><option value="">Équipe ?</option><option value="${esc(eqA)}"${p && p.equipe === eqA ? ' selected' : ''}>${esc(eqA)}</option><option value="${esc(eqB)}"${p && p.equipe === eqB ? ' selected' : ''}>${esc(eqB)}</option></select>`
        : `<input data-trk-eq="${j.id}" value="${esc((p && p.equipe) || '')}" placeholder="Équipe (facultatif)" style="width:130px">`;
      const postes = [j.poste_habituel, j.poste_2].filter(Boolean);
      return `<tr><td><label style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" data-trk-pres="${j.id}"${p ? ' checked' : ''}> <span>${esc((j.prenom || '') + ' ' + j.nom)}</span></label>${p && p.arrive_en_retard ? ' <span class="trk-pill no">arrivé en retard</span>' : ''}${postes.length ? `<div class="trk-sub" style="margin:2px 0 0 26px;font-size:11.5px">${postes.map(x => POSTE_LIB[x]).join(' · ')}</div>` : ''}</td>
        <td>${champEq}</td>
        <td><select data-trk-po="${j.id}"><option value="">—</option>${ctx.postes.map(x => `<option value="${x}"${poste === x ? ' selected' : ''}>${POSTE_LIB[x]}</option>`).join('')}</select></td></tr>`; };
    return `${RAPPEL}
    <div class="trk-row" style="margin-bottom:10px"><button class="trk-btn sec" data-trk="retour-matchs">← Toutes les rencontres</button>
      ${pillCat(m)} <b>${fmtDate(m.date_match)} — ${esc(libMatch(m))}</b> ${m.score_pour == null ? '' : `<span class="trk-pill">${esc(m.score_pour + ' - ' + m.score_contre)}</span>`}
      <span class="trk-grow"></span><button class="trk-btn danger" data-trk="suppr-match">Supprimer</button></div>
    <div class="trk-card"><b>① Qui est présent ce jour-là ?</b>
      <p class="trk-sub" style="margin:4px 0 10px">Seuls les joueurs présents pourront être notés. ${entr ? `Répartissez-les entre <b>${esc(eqA)}</b> et <b>${esc(eqB)}</b>, et indiquez le poste tenu.` : 'Indiquez aussi leur équipe et le poste tenu ce jour-là.'}</p>
      ${dispo.length ? `<div class="trk-scroll"><table><tr><th>Joueur</th><th>Équipe</th><th>Poste ce jour</th></tr>${dispo.map(ligne).join('')}</table></div>
        <div class="trk-row" style="margin-top:10px"><button class="trk-btn" data-trk="save-presents">💾 Enregistrer les présents</button>
        <button class="trk-btn sec" data-trk="tout-cocher">Tout cocher</button><span class="trk-pill mut">${notes.length} présent(s) enregistré(s)</span></div>`
        : '<p class="trk-sub">Ajoutez d’abord des joueurs dans l’onglet « Joueurs ».</p>'}
      ${absents.length ? `<div class="trk-row" style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--trk-bord)"><b>⏱️ Un joueur arrive en retard ?</b>
        <select id="trk-r-j">${absents.map(j => `<option value="${j.id}">${esc((j.prenom || '') + ' ' + j.nom)}</option>`).join('')}</select>
        ${entr ? `<select id="trk-r-eq"><option value="">Équipe ?</option><option value="${esc(eqA)}">${esc(eqA)}</option><option value="${esc(eqB)}">${esc(eqB)}</option></select>` : ''}
        <select id="trk-r-po"><option value="">Poste</option>${ctx.postes.map(x => `<option value="${x}">${POSTE_LIB[x]}</option>`).join('')}</select>
        <label style="display:flex;gap:6px;align-items:center;margin:0;font-weight:600"><input type="checkbox" id="trk-r-jour"> aussi aux autres rencontres de la journée</label>
        <button class="trk-btn sec" data-trk="retardataire">＋ Ajouter</button></div>` : ''}</div>
    <div class="trk-card"><b>② Notes du match</b> <span class="trk-pill mut">réservé au bureau</span>
      <p class="trk-sub" style="margin:4px 0 10px">Fair-play : <b>${ctx.fair_play.defaut}/10 par défaut</b> (irréprochable). Pour un fait remarquable, ajoutez +${ctx.fair_play.bonus.join(' ou +')}.</p>
      ${notes.length ? `<div class="trk-scroll">${notes.map(n => carteNote(n)).join('')}</div>
        <div style="margin-top:10px"><button class="trk-btn" data-trk="save-notes">💾 Enregistrer les notes</button></div>`
        : '<p class="trk-sub">Enregistrez d’abord les présents (étape ①) : ils apparaîtront ici pour être notés.</p>'}</div>
    <details class="trk-card"><summary style="cursor:pointer;font-weight:700">Modifier les infos de la rencontre</summary>
      <div class="trk-row" style="margin-top:10px">
        <div><label>Date</label><input type="date" id="trk-e-date" value="${esc(m.date_match)}"></div>
        ${entr ? `<div class="trk-grow"><label>Équipe 1</label><input id="trk-e-ea" style="width:100%" value="${esc(eqA)}"></div><div class="trk-grow"><label>Équipe 2</label><input id="trk-e-eb" style="width:100%" value="${esc(eqB)}"></div>`
          : `<div class="trk-grow"><label>Adversaire</label><input id="trk-e-adv" style="width:100%" value="${esc(m.adversaire || '')}"></div>`}
        <div class="trk-grow"><label>Lieu</label><input id="trk-e-lieu" style="width:100%" value="${esc(m.lieu || '')}"></div>
        <div><label>${entr ? 'Score éq. 1' : 'Notre score'}</label><input type="number" min="0" id="trk-e-sp" value="${m.score_pour == null ? '' : m.score_pour}"></div>
        <div><label>${entr ? 'Score éq. 2' : 'Score adverse'}</label><input type="number" min="0" id="trk-e-sc" value="${m.score_contre == null ? '' : m.score_contre}"></div>
        <button class="trk-btn" data-trk="save-match">Enregistrer</button></div></details>`;
  }

  function carteNote(n) {
    const id = n.joueur_id, p = n.poste_joue || '';
    const fp = n.fair_play == null ? null : Number(n.fair_play), def = ctx.fair_play.defaut;
    const num = (k, lib, v, max) => `<div><label>${lib}</label><input type="number" min="0" max="${max || 99}" data-trk-n="${id}" data-k="${k}" value="${v || 0}"></div>`;
    const etoiles = `<div><label>Étoiles (0-5)</label><input type="number" min="0" max="5" step="0.5" data-trk-n="${id}" data-k="note_etoiles" value="${n.note_etoiles == null ? '' : n.note_etoiles}"></div>`;
    let spe = '';
    if (p === 'gardien') spe = num('arrets', 'Arrêts', n.arrets) + num('buts_encaisses', 'Buts encaissés', n.buts_encaisses) + etoiles;
    else if (p === 'defenseur') spe = num('duels_gagnes', 'Duels gagnés', n.duels_gagnes) + num('interceptions', 'Interceptions', n.interceptions) + num('tacles', 'Tacles', n.tacles) + etoiles;
    else spe = etoiles;
    return `<div class="trk-card" style="margin-bottom:8px" data-trk-carte="${id}">
      <div class="trk-row"><b>${esc((n.prenom || '') + ' ' + n.nom)}</b> <span class="trk-pill">${POSTE_LIB[p] || 'poste non précisé'}</span>${n.equipe ? ` <span class="trk-pill mut">${esc(n.equipe)}</span>` : ''}${n.arrive_en_retard ? ' <span class="trk-pill no">arrivé en retard</span>' : ''}</div>
      <div class="trk-row" style="margin-top:8px">${num('buts', 'Buts', n.buts, 30)}${num('passes', 'Passes déc.', n.passes, 30)}${spe}
        <div><label>Fair-play (0-10)</label><div class="trk-fp" data-trk-fp="${id}">
          <button type="button" data-v="" class="${fp === null ? 'on' : ''}">${def} (défaut)</button>
          ${ctx.fair_play.bonus.map(b => `<button type="button" data-v="${def + b}" class="${fp === def + b ? 'on' : ''}">+${b} → ${def + b}</button>`).join('')}
          <input type="number" min="0" max="10" data-trk-n="${id}" data-k="fair_play" value="${fp === null ? '' : fp}" placeholder="libre" style="width:64px"></div></div></div>
      <div style="margin-top:8px"><label>Observations (bureau uniquement)</label><textarea data-trk-n="${id}" data-k="observations" rows="2" style="width:100%" placeholder="Comportement, fait marquant…">${esc(n.observations || '')}</textarea></div></div>`;
  }

  /* ---------------- joueurs ---------------- */
  let ficheOuverte = null;
  const optPostes = (sel) => `<option value="">—</option>${ctx.postes.map(x => `<option value="${x}"${sel === x ? ' selected' : ''}>${POSTE_LIB[x]}</option>`).join('')}`;
  function ficheHtml(j) {
    if (!j) return '';
    const lie = !!j.user_id;
    return `<div class="trk-card"><b>🪪 Fiche de ${esc((j.prenom || '') + ' ' + j.nom)}</b>
      ${lie ? '<p class="trk-sub" style="margin:4px 0 0">Adhérent avec compte : nom, prénom et e-mail viennent de son compte. Vous pouvez modifier ses postes.</p>' : ''}
      <div class="trk-row" style="margin-top:8px">
        <div class="trk-grow"><label>Nom</label><input id="trk-f-nom" style="width:100%" value="${esc(j.nom)}"${lie ? ' disabled' : ''}></div>
        <div class="trk-grow"><label>Prénom</label><input id="trk-f-prenom" style="width:100%" value="${esc(j.prenom || '')}"${lie ? ' disabled' : ''}></div>
        <div class="trk-grow"><label>E-mail</label><input type="email" id="trk-f-email" style="width:100%" value="${esc(j.email || '')}"${lie ? ' disabled' : ''}></div>
        <div><label>Poste 1</label><select id="trk-f-p1">${optPostes(j.poste_habituel)}</select></div>
        <div><label>Poste 2</label><select id="trk-f-p2">${optPostes(j.poste_2)}</select></div></div>
      <div style="margin-top:10px" class="trk-row"><button class="trk-btn" data-trk="save-fiche" data-id="${j.id}">💾 Enregistrer la fiche</button><button class="trk-btn sec" data-trk="fermer-fiche">Fermer</button></div></div>`;
  }
  async function vueJoueurs() {
    const [rj, ra] = await Promise.all([charger(() => call('GET', '/tracker/joueurs')), charger(() => call('GET', '/tracker/adherents'))]);
    const js = rj ? rj.joueurs : [];
    const proposables = (ra ? ra.adherents : []).filter(a => !a.deja_ajoute);
    return `${RAPPEL}
    <div class="trk-card"><b>Joueurs (${js.length})</b>
      ${js.length ? `<div class="trk-scroll"><table><tr><th>Nom</th><th>E-mail</th><th>Poste 1</th><th>Poste 2</th><th>Matchs</th><th>Buts</th><th>Passes</th><th></th></tr>
        ${js.map(j => `<tr><td>${esc((j.prenom || '') + ' ' + j.nom)}${j.user_id ? ' <span class="trk-pill ok">compte</span>' : ' <span class="trk-pill mut">sans compte</span>'}</td>
          <td style="font-size:12px">${esc(j.email || '—')}</td><td>${POSTE_LIB[j.poste_habituel] || '—'}</td><td>${POSTE_LIB[j.poste_2] || '—'}</td><td>${j.matchs}</td><td>${j.buts}</td><td>${j.passes}</td>
          <td style="white-space:nowrap"><button class="trk-btn sec" data-trk="fiche-joueur" data-id="${j.id}">Fiche</button> <button class="trk-btn danger" data-trk="retirer-joueur" data-id="${j.id}" data-nom="${esc((j.prenom || '') + ' ' + j.nom)}">Retirer</button></td></tr>`).join('')}</table></div>`
        : '<p class="trk-sub">Aucun joueur. Ajoutez-en ci-dessous.</p>'}</div>
    ${ficheOuverte ? ficheHtml(js.find(j => Number(j.id) === ficheOuverte)) : ''}
    <div class="trk-card"><b>＋ Ajouter un adhérent</b>
      ${proposables.length ? `<div class="trk-scroll"><table>${proposables.map((a, i) => `<tr><td>${esc((a.prenom || '') + ' ' + a.nom)}${a.mineur ? ' <span class="trk-pill no">mineur — refusé</span>' : (a.age_inconnu ? ' <span class="trk-pill mut">âge non renseigné</span>' : '')}</td>
          <td style="text-align:right"><button class="trk-btn sec" data-trk="ajout-adh" data-i="${i}"${a.mineur ? ' disabled' : ''}>Ajouter</button></td></tr>`).join('')}</table></div>`
        : '<p class="trk-sub">Aucun adhérent à proposer (registre vide ou déjà tous ajoutés).</p>'}</div>
    <div class="trk-card"><b>＋ Ajouter une personne sans compte</b>
      <div class="trk-row" style="margin-top:8px">
        <div class="trk-grow"><label>Nom *</label><input id="trk-j-nom" style="width:100%"></div>
        <div class="trk-grow"><label>Prénom</label><input id="trk-j-prenom" style="width:100%"></div>
        <div class="trk-grow"><label>E-mail * (pour lui envoyer ses statistiques)</label><input type="email" id="trk-j-email" style="width:100%"></div>
        <div><label>Poste 1</label><select id="trk-j-poste"><option value="">—</option>${ctx.postes.map(x => `<option value="${x}">${POSTE_LIB[x]}</option>`).join('')}</select></div>
        <div><label>Poste 2</label><select id="trk-j-poste2"><option value="">—</option>${ctx.postes.map(x => `<option value="${x}">${POSTE_LIB[x]}</option>`).join('')}</select></div></div>
      <label style="display:flex;gap:8px;align-items:center;margin:10px 0 0;font-weight:600"><input type="checkbox" id="trk-j-maj"> J’atteste que cette personne est majeure (18 ans ou plus)</label>
      <div style="margin-top:10px"><button class="trk-btn" data-trk="ajout-manuel">Ajouter</button></div></div>
    <div id="trk-attest" hidden>${JSON.stringify(proposables).replace(/</g, '\\u003c').replace(/&/g, '\\u0026')}</div>`;
  }

  /* ---------------- prix ---------------- */
  let brouillonPrix = null;
  async function vuePrix() {
    const [rp, rl] = await Promise.all([charger(() => call('GET', '/tracker/prix')), charger(() => call('GET', '/tracker/lots'))]);
    const ps = rp ? rp.prix : [], lots = rl ? rl.lots : [];
    if (!brouillonPrix) brouillonPrix = { modele: 'buteur' };
    const mod = ctx.modeles.find(x => x.cle === brouillonPrix.modele) || ctx.modeles[0];
    const rg = mod.regle_defaut;
    const poids = rg.poids || {};
    const champsPoids = Object.keys(poids).map(k => `<div><label>${esc({ etoiles: 'Poids étoiles', taux_arrets: 'Poids taux d’arrêts', duels: 'Poids duels', interceptions: 'Poids interceptions', tacles: 'Poids tacles' }[k] || k)}</label><input type="number" min="0" max="100" id="trk-w-${k}" value="${poids[k]}"></div>`).join('');
    return `${RAPPEL}
    <div class="trk-card"><b>＋ Créer un prix à partir d’un modèle</b>
      <div class="trk-row" style="margin:10px 0">${ctx.modeles.map(x => `<div class="trk-modele${x.cle === mod.cle ? ' on' : ''}" data-trk="choisir-modele" data-m="${x.cle}"><b>${x.emoji} ${esc(x.nom)}</b><span>${esc(x.description)}</span></div>`).join('')}</div>
      <div class="trk-row">
        <div class="trk-grow"><label>Nom du prix</label><input id="trk-p-nom" style="width:100%" value="${esc(mod.nom)}"></div>
        <div><label>Lot</label><select id="trk-p-lot"><option value="">— aucun —</option>${lots.map(l => `<option value="${l.id}">${esc(l.nom)}</option>`).join('')}</select></div>
        <div><label>Du</label><input type="date" id="trk-p-debut"></div><div><label>Au</label><input type="date" id="trk-p-fin"></div>
        <div><label>Matchs minimum</label><input type="number" min="1" id="trk-p-min" value="${rg.min_matchs}"></div>
        <div><label>Rencontres prises en compte</label><label style="font-weight:600;display:inline-flex;gap:5px;align-items:center;margin-right:10px"><input type="checkbox" id="trk-p-cat-match" checked> ⚽ Matchs</label><label style="font-weight:600;display:inline-flex;gap:5px;align-items:center"><input type="checkbox" id="trk-p-cat-ent" checked> 🏋️ Entraînements</label></div>
        ${mod.cle === 'fairplay' ? `<div><label>Calcul</label><select id="trk-p-fpmode"><option value="moyenne">Moyenne par match</option><option value="total">Total</option></select></div>` : ''}
        ${champsPoids}</div>
      <p class="trk-sub" style="margin:8px 0">Tout reste modifiable après création. Le vote des adhérents sera ajouté à l’étape suivante.</p>
      <button class="trk-btn" data-trk="creer-prix">Créer le prix</button></div>
    ${ps.length ? ps.map(p => `<div class="trk-card"><div class="trk-row"><b>${p.emoji || ''} ${esc(p.nom)}</b>
        ${p.lot ? `<span class="trk-pill">🎁 ${esc(p.lot.nom)}</span>` : ''}<span class="trk-pill mut">${p.regle.categories.length === 2 ? 'Matchs + entraînements' : (p.regle.categories[0] === 'entrainement' ? 'Entraînements seuls' : 'Matchs seuls')}</span><span class="trk-pill mut">${p.periode_debut ? fmtDate(p.periode_debut) : '…'} → ${p.periode_fin ? fmtDate(p.periode_fin) : '…'}</span>
        <span class="trk-pill ${p.statut === 'clos' ? 'ok' : 'mut'}">${p.statut === 'clos' ? 'Clos' : 'En cours'}</span><span class="trk-grow"></span>
        <button class="trk-btn sec" data-trk="ouvrir-prix" data-id="${p.id}">Voir le classement</button></div>
        <p style="margin:8px 0 0">${p.podium.length ? p.podium.map(x => `<span class="trk-pill ${x.rang === 1 ? 'ok' : 'mut'}">${x.rang}. ${esc(x.nom)} · ${x.score}${x.egalite ? ' (égalité)' : ''}</span>`).join(' ') : '<span class="trk-sub">Pas encore assez de données (matchs minimum non atteint).</span>'}</p></div>`).join('')
      : '<p class="trk-sub">Aucun prix pour le moment.</p>'}`;
  }

  async function vuePrixDetail() {
    const r = await charger(() => call('GET', '/tracker/prix/' + prixOuvert));
    if (!r) { prixOuvert = null; return await vuePrix(); }
    const p = r.prix, c = r.classement;
    const det = (d) => Object.entries(d).filter(([k]) => k !== 'matchs').map(([k, v]) => `${k.replace(/_/g, ' ')} : ${v}`).join(' · ');
    return `<div class="trk-row" style="margin-bottom:10px"><button class="trk-btn sec" data-trk="retour-prix">← Tous les prix</button><b>${p.emoji || ''} ${esc(p.nom)}</b>
      <span class="trk-pill mut">${r.matchs_pris_en_compte} match(s) pris en compte · minimum ${p.regle.min_matchs}</span><span class="trk-grow"></span>
      ${p.statut === 'clos' ? `<button class="trk-btn sec" data-trk="rouvrir-prix" data-id="${p.id}">Rouvrir</button>` : ''}<button class="trk-btn danger" data-trk="suppr-prix" data-id="${p.id}">Supprimer</button></div>
    ${c.some(x => x.egalite) ? '<div class="trk-rappel">Égalité parfaite sur certains rangs : le bureau tranche en désignant le lauréat.</div>' : ''}
    <div class="trk-card trk-scroll"><table><tr><th>Rang</th><th>Joueur</th><th>Score</th><th>Sur 100</th><th>Détail</th><th></th></tr>
      ${c.map(x => `<tr><td>${x.rang}${x.egalite ? ' =' : ''}</td><td>${esc(x.nom)}${p.laureat_joueur_id === x.joueur_id ? ' 🏆' : ''}</td><td><b>${x.score}</b></td><td>${x.score_sur_100}</td><td style="font-size:12px;color:var(--muted,#64748b)">${esc(det(x.detail))}</td>
        <td>${p.laureat_joueur_id === x.joueur_id ? '<span class="trk-pill ok">Lauréat</span>' : `<button class="trk-btn sec" data-trk="laureat" data-id="${p.id}" data-j="${x.joueur_id}">Désigner lauréat</button>`}</td></tr>`).join('') || '<tr><td colspan="6">Aucun classement : pas assez de données.</td></tr>'}</table></div>
    ${r.ecartes.length ? `<p class="trk-sub">Écartés (moins de ${p.regle.min_matchs} match(s)) : ${r.ecartes.map(e => esc(e.nom) + ' (' + e.matchs + ')').join(', ')}</p>` : ''}`;
  }

  /* ---------------- présences ---------------- */
  async function vuePresences() {
    const r = await charger(() => call('GET', '/tracker/presences'));
    if (!r || !r.matchs.length) return '<p class="trk-sub">Aucun match enregistré : l’historique des présences apparaîtra ici, jour après jour.</p>';
    return `<p class="trk-sub">Historique des présences, jour après jour (🟢 présent · ⚪ absent).</p>
    <div class="trk-card trk-scroll"><table><tr><th>Joueur</th>${r.matchs.map(m => `<th title="${esc(m.libelle || '')}" style="text-align:center">${fmtDate(m.date_match).slice(0, 5)}<br><span style="font-size:11px;font-weight:400">${m.categorie === 'entrainement' ? '🏋️' : '⚽'}</span></th>`).join('')}<th>Présences</th></tr>
      ${r.joueurs.map(j => `<tr><td>${esc(j.nom)}</td>${r.matchs.map(m => `<td><span class="trk-dot ${j.presents.includes(m.id) ? 'p' : 'a'}"></span></td>`).join('')}<td><b>${j.nb_presents}/${j.nb_matchs}</b> · ${j.taux_pct}%</td></tr>`).join('')}
      <tr><td><b>Total présents</b></td>${r.matchs.map(m => `<td><b>${m.nb_presents}</b></td>`).join('')}<td></td></tr></table></div>`;
  }

  /* ---------------- lots ---------------- */
  async function vueLots() {
    const r = await charger(() => call('GET', '/tracker/lots')); const l = r ? r.lots : [];
    return `<div class="trk-card"><b>＋ Nouveau lot</b><div class="trk-row" style="margin-top:8px">
        <div class="trk-grow"><label>Lot (voyage, ballon, maillot…)</label><input id="trk-l-nom" style="width:100%"></div>
        <div class="trk-grow"><label>Description</label><input id="trk-l-desc" style="width:100%"></div><button class="trk-btn" data-trk="creer-lot">Ajouter</button></div></div>
      ${l.length ? `<div class="trk-card"><table>${l.map(x => `<tr><td><b>${esc(x.nom)}</b><br><span class="trk-sub">${esc(x.description || '')}</span></td><td style="text-align:right"><button class="trk-btn danger" data-trk="suppr-lot" data-id="${x.id}">Supprimer</button></td></tr>`).join('')}</table></div>` : '<p class="trk-sub">Aucun lot.</p>'}`;
  }

  /* ---------------- bureau & historique ---------------- */
  async function vueGestion() {
    const [rb, rh] = await Promise.all([charger(() => call('GET', '/tracker/bureau')), charger(() => call('GET', '/tracker/historique'))]);
    const b = rb ? rb.bureau : [], h = rh ? rh.historique : [];
    const LIB = { joueur_ajout: 'Joueur ajouté', joueur_retrait: 'Joueur retiré', joueur_refuse_mineur: 'Refus (mineur)', match_creation: 'Match créé', match_modification: 'Match modifié', match_suppression: 'Match supprimé', presents_enregistres: 'Présents enregistrés', notes_enregistrees: 'Notes enregistrées', lot_creation: 'Lot créé', prix_creation: 'Prix créé', prix_modification: 'Prix modifié', prix_suppression: 'Prix supprimé', prix_laureat: 'Lauréat désigné', bureau_ajout: 'Membre du bureau ajouté', bureau_retrait: 'Membre du bureau retiré' };
    return `<div class="trk-card"><b>Membres du bureau</b>
      <p class="trk-sub" style="margin:4px 0 8px">Le propriétaire du compte et les membres ajoutés ici peuvent saisir les données. L’association s’en remet à leur bonne foi.</p>
      ${b.length ? `<table>${b.map(x => `<tr><td>${esc((x.prenom || '') + ' ' + x.nom)} <span class="trk-sub">${esc(x.email)}</span></td><td style="text-align:right">${ctx.estProprietaire ? `<button class="trk-btn danger" data-trk="retirer-bureau" data-id="${x.id}">Retirer</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="trk-sub">Aucun membre supplémentaire.</p>'}
      ${ctx.estProprietaire ? `<div class="trk-row" style="margin-top:10px"><div class="trk-grow"><label>E-mail d’un compte Diaspo’Actif</label><input type="email" id="trk-b-email" style="width:100%"></div><button class="trk-btn" data-trk="ajout-bureau">Ajouter au bureau</button></div>` : ''}</div>
    <div class="trk-card"><b>Historique des modifications</b><p class="trk-sub" style="margin:4px 0 8px">Qui a fait quoi, et quand (100 dernières actions).</p>
      ${h.length ? `<div class="trk-scroll"><table>${h.map(x => `<tr><td>${esc(String(x.created_at || '').slice(0, 16))}</td><td>${esc((x.prenom || '') + ' ' + (x.nom || ''))}</td><td>${esc(LIB[x.action] || x.action)}</td><td>${esc(x.cible || '')} <span class="trk-sub">${esc(x.detail || '')}</span></td></tr>`).join('')}</table></div>` : '<p class="trk-sub">Rien pour le moment.</p>'}</div>`;
  }

  /* ---------------- actions ---------------- */
  const val = (id) => { const e = root.querySelector('#' + id); return e ? e.value : ''; };
  const num = (id) => { const v = val(id); return v === '' ? null : Number(v); };
  async function agir(fn, ok) {
    try { await fn(); if (ok) dire('ok', ok); } catch (e) { dire('err', e.message || 'Erreur.'); }
    await rendre();
  }

  function collecterPresents() {
    return Array.from(root.querySelectorAll('[data-trk-pres]')).filter(c => c.checked).map(c => {
      const id = c.dataset.trkPres;
      return { joueur_id: Number(id), equipe: val_(`[data-trk-eq="${id}"]`), poste_joue: val_(`[data-trk-po="${id}"]`) };
    });
  }
  const val_ = (sel) => { const e = root.querySelector(sel); return e ? e.value : ''; };
  function collecterNotes() {
    const out = {};
    root.querySelectorAll('[data-trk-n]').forEach(e => {
      const id = e.dataset.trkN; out[id] = out[id] || { joueur_id: Number(id) };
      out[id][e.dataset.k] = e.value;
    });
    return Object.values(out);
  }

  function brancher() {
    root.querySelectorAll('[data-trk-tab]').forEach(b => b.onclick = () => { tab = b.dataset.trkTab; matchOuvert = null; prixOuvert = null; ficheOuverte = null; rendre(); });
    root.querySelectorAll('[data-trk-fp]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
      const inp = g.querySelector('input'); inp.value = b.dataset.v;
      g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    }));
    root.querySelectorAll('[data-trk]').forEach(el => el.onclick = () => action(el));
    const cat = root.querySelector('#trk-m-cat');
    if (cat) cat.onchange = () => root.querySelectorAll('[data-trk-cat]').forEach(b => { b.hidden = b.dataset.trkCat !== cat.value; });
  }

  async function action(el) {
    const a = el.dataset.trk, id = el.dataset.id;
    if (a === 'filtre-cat') { filtreCat = el.dataset.c; return rendre(); }
    if (a === 'creer-match') return agir(async () => {
      const r = await call('POST', '/tracker/matchs', { categorie: val('trk-m-cat'), date_match: val('trk-m-date'), adversaire: val('trk-m-adv'), equipe_a: val('trk-m-ea'), equipe_b: val('trk-m-eb'),
        lieu: val('trk-m-lieu'), score_pour: val('trk-m-sp'), score_contre: val('trk-m-sc'), reprendre_presents: root.querySelector('#trk-m-reprendre').checked });
      matchOuvert = r.id;
      dire('ok', r.presents_repris ? `Rencontre créée, ${r.presents_repris} présent(s) repris. Vérifiez les équipes puis notez.` : 'Rencontre créée. Déclarez maintenant les présents.');
    });
    if (a === 'retardataire') return agir(() => call('POST', `/tracker/matchs/${matchOuvert}/retardataire`, { joueur_id: Number(val('trk-r-j')), equipe: val('trk-r-eq'), poste_joue: val('trk-r-po'), aussi_journee: root.querySelector('#trk-r-jour').checked }), 'Retardataire ajouté aux présents : il peut maintenant être noté.');
    if (a === 'fiche-joueur') { ficheOuverte = Number(id); return rendre(); }
    if (a === 'fermer-fiche') { ficheOuverte = null; return rendre(); }
    if (a === 'save-fiche') return agir(async () => { await call('PUT', '/tracker/joueurs/' + id, { nom: val('trk-f-nom'), prenom: val('trk-f-prenom'), email: val('trk-f-email'), poste_habituel: val('trk-f-p1'), poste_2: val('trk-f-p2') }); ficheOuverte = null; }, 'Fiche enregistrée.');
    if (a === 'ouvrir-match') { matchOuvert = Number(id); return rendre(); }
    if (a === 'retour-matchs') { matchOuvert = null; return rendre(); }
    if (a === 'tout-cocher') { root.querySelectorAll('[data-trk-pres]').forEach(c => c.checked = true); return; }
    if (a === 'save-presents') return agir(() => call('PUT', `/tracker/matchs/${matchOuvert}/presents`, { presents: collecterPresents() }), 'Présents enregistrés. Vous pouvez maintenant les noter.');
    if (a === 'save-notes') return agir(() => call('PUT', `/tracker/matchs/${matchOuvert}/notes`, { notes: collecterNotes() }), 'Notes enregistrées. Les classements sont à jour.');
    if (a === 'save-match') return agir(() => call('PUT', '/tracker/matchs/' + matchOuvert, { date_match: val('trk-e-date'), adversaire: val('trk-e-adv'), equipe_a: val('trk-e-ea'), equipe_b: val('trk-e-eb'), lieu: val('trk-e-lieu'), score_pour: val('trk-e-sp'), score_contre: val('trk-e-sc') }), 'Rencontre modifiée.');
    if (a === 'suppr-match') { if (!confirm('Supprimer ce match et toutes ses notes ?')) return; return agir(async () => { await call('DELETE', '/tracker/matchs/' + matchOuvert); matchOuvert = null; }, 'Match supprimé.'); }

    if (a === 'ajout-adh') {
      const liste = JSON.parse(root.querySelector('#trk-attest').textContent); const x = liste[Number(el.dataset.i)];
      if (!confirm(`J’atteste que ${(x.prenom || '') + ' ' + x.nom} est majeur(e) (18 ans ou plus).`)) return;
      return agir(() => call('POST', '/tracker/joueurs', { user_id: x.user_id, adhesion_membre_id: x.adhesion_membre_id, nom: x.nom, prenom: x.prenom, email: x.email, majeur_atteste: true }), 'Joueur ajouté.');
    }
    if (a === 'ajout-manuel') {
      const maj = root.querySelector('#trk-j-maj').checked;
      return agir(() => call('POST', '/tracker/joueurs', { nom: val('trk-j-nom'), prenom: val('trk-j-prenom'), email: val('trk-j-email'), poste_habituel: val('trk-j-poste'), poste_2: val('trk-j-poste2'), majeur_atteste: maj }), 'Joueur ajouté.');
    }
    if (a === 'retirer-joueur') { if (!confirm(`Retirer ${el.dataset.nom} ? Toutes ses notes et statistiques seront supprimées.`)) return; return agir(() => call('DELETE', '/tracker/joueurs/' + id), 'Joueur retiré (notes supprimées).'); }

    if (a === 'choisir-modele') { brouillonPrix = { modele: el.dataset.m }; return rendre(); }
    if (a === 'creer-prix') {
      const regle = { min_matchs: num('trk-p-min'), poids: {}, categories: [root.querySelector('#trk-p-cat-match').checked ? 'match' : null, root.querySelector('#trk-p-cat-ent').checked ? 'entrainement' : null].filter(Boolean) };
      root.querySelectorAll('[id^="trk-w-"]').forEach(e => { regle.poids[e.id.replace('trk-w-', '')] = Number(e.value); });
      if (root.querySelector('#trk-p-fpmode')) regle.fair_play_mode = val('trk-p-fpmode');
      return agir(async () => { await call('POST', '/tracker/prix', { modele: brouillonPrix.modele, nom: val('trk-p-nom'), lot_id: val('trk-p-lot') || null, periode_debut: val('trk-p-debut'), periode_fin: val('trk-p-fin'), regle }); brouillonPrix = null; }, 'Prix créé.');
    }
    if (a === 'ouvrir-prix') { prixOuvert = Number(id); return rendre(); }
    if (a === 'retour-prix') { prixOuvert = null; return rendre(); }
    if (a === 'laureat') return agir(() => call('POST', `/tracker/prix/${id}/laureat`, { joueur_id: Number(el.dataset.j) }), 'Lauréat désigné.');
    if (a === 'rouvrir-prix') return agir(() => call('POST', `/tracker/prix/${id}/rouvrir`), 'Prix rouvert.');
    if (a === 'suppr-prix') { if (!confirm('Supprimer ce prix ?')) return; return agir(async () => { await call('DELETE', '/tracker/prix/' + id); prixOuvert = null; }, 'Prix supprimé.'); }

    if (a === 'creer-lot') return agir(() => call('POST', '/tracker/lots', { nom: val('trk-l-nom'), description: val('trk-l-desc') }), 'Lot ajouté.');
    if (a === 'suppr-lot') { if (!confirm('Supprimer ce lot ?')) return; return agir(() => call('DELETE', '/tracker/lots/' + id), 'Lot supprimé.'); }
    if (a === 'ajout-bureau') return agir(() => call('POST', '/tracker/bureau', { email: val('trk-b-email') }), 'Membre ajouté au bureau.');
    if (a === 'retirer-bureau') { if (!confirm('Retirer ce membre du bureau ?')) return; return agir(() => call('DELETE', '/tracker/bureau/' + id), 'Membre retiré.'); }
  }

  window.TrackerUI = { mount };
})();
