/* ============================================================
   Diaspo'Actif — MARACANA TRACKER : interface bureau (tableau de bord Initiative).
   Utilisation : TrackerUI.mount(elementConteneur). Toutes les données passent par /api/tracker/*.
   Parcours : Accueil → « Nouvelle rencontre » (contre un adversaire) ou « Nouvel entraînement » (séance : présents → équipes → matchs).
   Règles affichées : majeurs uniquement, présents d'abord, fair-play 5/10 par défaut (+2/+3), pastilles d'adhésion (vert / jaune / rouge).
   ============================================================ */
(function () {
  'use strict';
  if (window.TrackerUI) return;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const call = (m, p, b) => window.api(m, p, b);
  const POSTE_LIB = { gardien: 'Gardien', defenseur: 'Défenseur', milieu: 'Milieu', attaquant: 'Attaquant' };
  const POSTE_COURT = { gardien: 'GAR', defenseur: 'DÉF', milieu: 'MIL', attaquant: 'ATT' };
  const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (d || ''); };
  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  const REGLES = { gagnant_reste: 'Gagnant reste', gagnant_sort: 'Gagnant sort (les deux équipes sortent)', manuel: 'Manuel (je choisis chaque affiche)' };

  let root = null, ctx = null, tab = 'accueil', msg = null;
  let creation = null, filtreCat = 'tous', matchOuvert = null, seanceOuverte = null, vueSeance = 'presents', retourSeance = null;
  let prixOuvert = null, ficheOuverte = null, ficheAside = null, brouillonPrix = null;
  let reglages = null, terrain = null, aideJoga = false;
  const CARTON_META = { rouge: ['🟥', 'Rouge'], jaune: ['🟨', 'Jaune'], vert: ['🟩', 'Vert'], blanc: ['⬜', 'Blanc'] };
  const PORTEE_LIB = { tous: 'Entraînements et rencontres', entrainement: 'Entraînements seulement', match: 'Rencontres seulement' };
  const AIDE_JOGA = 'Joga Bonito : le joueur le plus technique et le plus plaisant à regarder, celui qui a du style, joue avec le ballon et fait plaisir aux yeux. Noté sur 10 à chaque match, il donne son propre prix.';

  /* Réglage des cartons demandé au début de chaque journée (valeurs reprises du dernier réglage, enregistrées ensuite jusqu'à modification). */
  function cartonsFormHtml(reg) {
    return `<div class="trk-cartons-form"><b style="font-size:13px">Cartons de cette journée</b><span class="trk-sub" style="margin:0">Combien de points de fair-play (sur 10) chaque carton retire, sur combien de matchs, et sur quel type de rencontres. Ce réglage est conservé jusqu’à ce que vous le modifiiez.</span>
      ${ctx.cartons.map(c => { const r = reg[c]; return `<div class="l"><b>${CARTON_META[c][0]} ${CARTON_META[c][1]}</b>
        <div><label>Malus (points)</label><input type="number" min="0" max="10" id="trk-c-${c}-malus" value="${r.malus}"></div>
        <div><label>Pèse sur</label><select id="trk-c-${c}-matchs">${[1, 2, 3].map(n => `<option value="${n}"${r.matchs === n ? ' selected' : ''}>${n} match${n > 1 ? 's' : ''}</option>`).join('')}</select></div>
        <div class="trk-grow"><label>Rencontres concernées</label><select id="trk-c-${c}-portee" style="width:100%">${Object.entries(PORTEE_LIB).map(([k, v]) => `<option value="${k}"${r.portee === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div></div>`; }).join('')}</div>`;
  }
  function collecterCartons() {
    const out = {};
    ctx.cartons.forEach(c => { out[c] = { malus: Number(val(`trk-c-${c}-malus`)), matchs: Number(val(`trk-c-${c}-matchs`)), portee: val(`trk-c-${c}-portee`) }; });
    return out;
  }
  const aideBtn = '<button type="button" class="trk-aide" data-trk="aide-joga" aria-label="Qu’est-ce que le Joga Bonito ?">?</button>';

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
  .trk-modele.dore{background:linear-gradient(135deg,#fff4c7,#f7d56a);border:1px solid #c99a12;border-top:6px solid #c99a12;color:#3b2a00}
  .trk-modele.dore.on{box-shadow:0 0 0 3px #2563EB}.trk-modele.dore span{color:#5a4200}
  .trk-modele b{display:block;margin-bottom:3px}.trk-modele span{font-size:12px;color:var(--muted,#64748b)}
  .trk-fp{display:flex;gap:4px;flex-wrap:wrap}
  .trk-fp button{border:1px solid var(--trk-bord);background:transparent;color:inherit;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;font-weight:700}
  .trk-fp button.on{background:#2563EB;color:#fff;border-color:#2563EB}
  .trk-dot{display:inline-block;width:16px;height:16px;border-radius:50%}
  .trk-dot.p{background:#22c55e}.trk-dot.a{background:#e2e8f0}
  /* Pastille d'adhésion : petit rond posé avant le nom, sans gêner la lecture */
  .trk-pas{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle;flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.14)}
  .trk-pas.vert{background:#22c55e}.trk-pas.jaune{background:#eab308}.trk-pas.rouge{background:#ef4444}
  .trk-legende{font-size:12px;color:var(--muted,#64748b);display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin:0 0 10px}
  .trk-legende .trk-pas{margin-right:4px}
  .trk-entree{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:0 0 14px}
  .trk-entree button{text-align:left;border:2px solid var(--trk-bord);border-radius:14px;padding:16px;background:transparent;color:inherit;cursor:pointer;font:inherit}
  .trk-entree button.on{border-color:#2563EB;background:rgba(37,99,235,.12)}
  .trk-entree b{display:block;font-size:18px;margin-bottom:4px}.trk-entree span{font-size:13px;color:var(--muted,#64748b)}
  .trk-seance{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:14px;align-items:start}
  .trk-aside{position:sticky;top:8px;border:1px solid var(--trk-bord);border-radius:12px;padding:12px;background:var(--card,transparent);max-height:calc(100vh - 24px);overflow:auto}
  .trk-aside h3{margin:0 0 6px;font-size:14px}
  .trk-aeq{margin:0 0 10px}.trk-aeq>b{display:flex;justify-content:space-between;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#64748b);margin-bottom:3px}
  .trk-aj{display:flex;align-items:center;gap:2px;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:4px 4px;border-radius:6px;cursor:pointer;font:inherit;font-size:13px}
  .trk-aj:hover{background:rgba(127,127,127,.14)}
  .trk-aj small{margin-left:auto;color:var(--muted,#64748b);font-size:11px;padding-left:6px}
  .trk-fiche{border-top:1px solid var(--trk-bord);margin-top:10px;padding-top:10px;font-size:13px}
  .trk-eqs{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
  .trk-eq{border:1px solid var(--trk-bord);border-radius:12px;padding:10px}
  .trk-eq header{display:flex;gap:6px;align-items:center;margin-bottom:6px}
  .trk-eq header input{flex:1;font-weight:700}
  .trk-ligne{display:flex;align-items:center;gap:4px;padding:4px 0;border-bottom:1px dashed var(--trk-bord);font-size:13px}
  .trk-ligne select{margin-left:auto;font-size:12px;padding:3px 6px}
  .trk-affiche{border:2px dashed #2563EB;border-radius:12px;padding:12px;margin:0 0 12px}
  /* Cartouche dorée « Joga Bonito » : bande dorée, point d'interrogation d'aide */
  .trk-or{background:linear-gradient(135deg,#fff4c7,#f7d56a);color:#3b2a00;border:1px solid #c99a12;border-top:6px solid #c99a12;border-radius:10px;padding:8px 10px}
  .trk-or b,.trk-or small,.trk-or span{color:#3b2a00}
  .trk-or .trk-btn{background:#8a6400;color:#fff}
  .trk-aide{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#8a6400;color:#fff;font-size:12px;font-weight:800;cursor:pointer;border:0;margin-left:4px}
  .trk-terrain{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
  .trk-tequipe{border:1px solid var(--trk-bord);border-radius:12px;padding:8px}
  .trk-eqbtn{display:flex;width:100%;justify-content:space-between;align-items:center;border:0;background:rgba(37,99,235,.14);color:inherit;border-radius:8px;padding:10px 12px;cursor:pointer;font:inherit;font-size:14px}
  .trk-tj{display:block;width:100%;text-align:left;border:1px solid transparent;background:transparent;color:inherit;border-radius:8px;padding:7px 8px;margin-top:4px;cursor:pointer;font:inherit}
  .trk-tj:hover,.trk-tj.sel{background:rgba(127,127,127,.14);border-color:var(--trk-bord)}
  .trk-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:3px;font-size:11.5px;color:var(--muted,#64748b)}
  .trk-chips span{background:rgba(127,127,127,.14);border-radius:999px;padding:1px 7px}
  .trk-panneau{border:2px solid #2563EB;border-radius:12px;padding:10px;margin:6px 0 8px;background:var(--card,transparent)}
  .trk-tuiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px;margin-top:8px}
  .trk-tuile{border:1px solid var(--trk-bord);border-radius:10px;padding:8px;text-align:center}
  .trk-tuile .v{font-size:22px;font-weight:800;line-height:1.1}
  .trk-tuile .b{display:flex;gap:4px;justify-content:center;margin-top:6px;flex-wrap:wrap}
  .trk-tuile .b button{border:1px solid var(--trk-bord);background:transparent;color:inherit;border-radius:8px;min-width:36px;padding:7px 8px;font-weight:800;cursor:pointer;font-size:14px}
  .trk-tuile .b button.plus{background:#2563EB;color:#fff;border-color:#2563EB}
  .trk-tuile small{display:block;color:var(--muted,#64748b);font-size:11px;margin-top:2px}
  .trk-tuile.rouge{border-color:#ef4444}.trk-tuile.jaune{border-color:#eab308}.trk-tuile.vert{border-color:#22c55e}.trk-tuile.blanc{border-color:#cbd5e1}
  .trk-tuile.or{background:linear-gradient(135deg,#fff4c7,#f7d56a);border:1px solid #c99a12;border-top:5px solid #c99a12;color:#3b2a00}
  .trk-tuile.or small{color:#5a4200}.trk-tuile.or .b button{background:rgba(255,255,255,.55);color:#3b2a00;border-color:#c99a12}.trk-tuile.or .b button.plus{background:#8a6400;color:#fff;border-color:#8a6400}
  .trk-negatif{color:#dc2626;font-weight:800}
  .trk-cartons-form{display:grid;gap:6px;margin-top:8px}
  .trk-cartons-form .l{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;border:1px solid var(--trk-bord);border-radius:10px;padding:8px}
  .trk-cartons-form .l b{min-width:84px;align-self:center}
  @media(max-width:900px){.trk-seance{grid-template-columns:1fr}.trk-aside{position:static;max-height:none}}
  @media(max-width:640px){.trk-tab{padding:7px 11px}}`;

  const pas = (o) => `<i class="trk-pas ${esc(o && o.pastille || 'rouge')}" title="${esc(o && o.pastille_libelle || 'Non répertorié dans les adhésions')}" role="img" aria-label="${esc(o && o.pastille_libelle || 'Non répertorié dans les adhésions')}"></i>`;
  const LEGENDE = `<div class="trk-legende"><span><i class="trk-pas vert"></i>Cotisation à jour</span><span><i class="trk-pas jaune"></i>Répertorié, pas à jour</span><span><i class="trk-pas rouge"></i>Non répertorié</span></div>`;
  const RAPPEL = `<div class="trk-rappel">⚠️ Le Tracker ne concerne que les <b>personnes majeures</b>. Ne saisissez aucune donnée relative à un mineur.</div>`;
  const nomJ = (j) => ((j.prenom || '') + ' ' + (j.nom || '')).trim();

  function box(html) { root.innerHTML = `<style>${css}</style><div class="trk">${html}</div>`; }
  function annonce() { return msg ? `<div class="${msg.type === 'ok' ? 'trk-ok' : 'trk-err'}" role="${msg.type === 'ok' ? 'status' : 'alert'}">${esc(msg.text)}</div>` : ''; }
  function dire(type, text) { msg = { type, text }; }
  async function charger(fn) { try { return await fn(); } catch (e) { dire('err', e.message || 'Erreur.'); return null; } }
  const libMatch = (m) => m.categorie === 'entrainement' ? `${m.equipe_a || 'Équipe 1'} contre ${m.equipe_b || 'Équipe 2'}` : (m.adversaire || 'Match');

  /* ---------------- structure ---------------- */
  async function mount(el) {
    root = el;
    root.innerHTML = '<p style="padding:20px">Chargement…</p>';
    try { ctx = await call('GET', '/tracker/contexte'); }
    catch (e) { root.innerHTML = `<div class="trk-err" style="margin:20px">${esc(e.message || 'Accès refusé.')}</div>`; return; }
    tab = 'accueil'; creation = null; matchOuvert = null; seanceOuverte = null; prixOuvert = null; ficheOuverte = null; ficheAside = null; msg = null;
    await rendre();
  }
  const TABS = [['accueil', '🏠 Accueil'], ['joueurs', '👥 Joueurs'], ['prix', '🏆 Prix & classements'], ['presences', '🗓️ Présences'], ['lots', '🎁 Lots'], ['gestion', '⚙️ Bureau & historique']];
  async function rendre() {
    let corps = '';
    if (tab === 'accueil') corps = seanceOuverte ? await vueSeanceComplete() : (matchOuvert ? await vueMatch() : await vueAccueil());
    else if (tab === 'joueurs') corps = await vueJoueurs();
    else if (tab === 'prix') corps = prixOuvert ? await vuePrixDetail() : await vuePrix();
    else if (tab === 'presences') corps = await vuePresences();
    else if (tab === 'lots') corps = await vueLots();
    else corps = await vueGestion();
    box(`<h2>⚽ Maracana Tracker</h2><p class="trk-sub">${esc(ctx.initiative.nom || '')} — rencontres, entraînements, présents, notes et prix de la saison.</p>
      <div class="trk-tabs" role="tablist">${TABS.map(([k, l]) => `<button class="trk-tab${tab === k ? ' on' : ''}" data-trk-tab="${k}" role="tab">${l}</button>`).join('')}</div>
      ${annonce()}${corps}`);
    msg = null;
    brancher();
  }

  /* ---------------- accueil : les deux entrées ---------------- */
  async function vueAccueil() {
    const [rm, rs, rr] = await Promise.all([charger(() => call('GET', '/tracker/matchs')), charger(() => call('GET', '/tracker/seances')), charger(() => call('GET', '/tracker/reglages'))]);
    const matchs = (rm ? rm.matchs : []).filter(m => !m.seance_id), seances = rs ? rs.seances : [];
    reglages = rr ? rr.cartons : reglages;
    const items = [
      ...seances.map(s => ({ type: 'seance', date: s.date_seance, id: s.id, o: s })),
      ...matchs.map(m => ({ type: 'match', date: m.date_match, id: m.id, o: m })),
    ].filter(x => filtreCat === 'tous' || (filtreCat === 'entrainement' ? x.type === 'seance' : x.type === 'match')).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
    const formRencontre = `<div class="trk-card"><b>⚽ Nouvelle rencontre</b><p class="trk-sub" style="margin:4px 0 8px">Un match contre un adversaire extérieur au club. Les présents sont inscrits d’abord, puis les joueurs sont notés.</p>
      <div class="trk-row"><div><label>Date</label><input type="date" id="trk-m-date" value="${aujourdhui()}"></div>
        <div class="trk-grow"><label>Adversaire</label><input id="trk-m-adv" style="width:100%" placeholder="ex. AS Sud"></div>
        <div class="trk-grow"><label>Lieu</label><input id="trk-m-lieu" style="width:100%"></div>
        <button class="trk-btn" data-trk="creer-match">Créer la rencontre</button></div>
      <label style="display:flex;gap:8px;align-items:center;margin:10px 0 0;font-weight:600"><input type="checkbox" id="trk-m-reprendre"> Reprendre les présents de la rencontre précédente du même jour</label>
      ${cartonsFormHtml(reglages)}</div>`;
    const formEntr = `<div class="trk-card"><b>🏋️ Nouvel entraînement</b><p class="trk-sub" style="margin:4px 0 8px">Une séance : on inscrit les présents, on monte les équipes du club, puis on enchaîne les matchs.</p>
      <div class="trk-row"><div><label>Date</label><input type="date" id="trk-s-date" value="${aujourdhui()}"></div>
        <div><label>Nombre d’équipes</label><select id="trk-s-nb">${[2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}">${n}</option>`).join('')}</select></div>
        <div class="trk-grow"><label>Enchaînement des matchs</label><select id="trk-s-regle" style="width:100%">${Object.entries(REGLES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
        <button class="trk-btn" data-trk="creer-seance">Créer l’entraînement</button></div>
      ${cartonsFormHtml(reglages)}</div>`;
    return `${RAPPEL}
    <div class="trk-entree"><button class="${creation === 'rencontre' ? 'on' : ''}" data-trk="choisir-creation" data-c="rencontre"><b>⚽ Nouvelle rencontre</b><span>Un match contre un adversaire autre que le club.</span></button>
      <button class="${creation === 'entrainement' ? 'on' : ''}" data-trk="choisir-creation" data-c="entrainement"><b>🏋️ Nouvel entraînement</b><span>Des équipes du même club qui jouent entre elles : présents, équipes, matchs.</span></button></div>
    ${creation === 'rencontre' ? formRencontre : creation === 'entrainement' ? formEntr : ''}
    <div class="trk-tabs">${[['tous', 'Tout'], ['match', '⚽ Rencontres'], ['entrainement', '🏋️ Entraînements']].map(([k, t]) => `<button class="trk-tab${filtreCat === k ? ' on' : ''}" data-trk="filtre-cat" data-c="${k}">${t}</button>`).join('')}</div>
    ${items.length ? `<div class="trk-card trk-scroll"><table><tr><th>Date</th><th>Type</th><th>Détail</th><th></th></tr>${items.map(x => x.type === 'seance'
      ? `<tr><td>${fmtDate(x.date)}</td><td><span class="trk-pill ok">🏋️ Entraînement</span></td><td>${x.o.nb_equipes} équipes · ${x.o.nb_presents} présent(s) · ${x.o.nb_matchs} match(s)</td><td><button class="trk-btn sec" data-trk="ouvrir-seance" data-id="${x.id}">Ouvrir</button></td></tr>`
      : `<tr><td>${fmtDate(x.date)}</td><td><span class="trk-pill">⚽ Rencontre</span></td><td>${esc(x.o.adversaire || 'Match')}${x.o.score_pour == null ? '' : ` · ${esc(x.o.score_pour + ' - ' + x.o.score_contre)}`} · ${x.o.joueurs} présent(s)</td><td><button class="trk-btn sec" data-trk="ouvrir-match" data-id="${x.id}">Ouvrir</button></td></tr>`).join('')}</table></div>`
      : '<p class="trk-sub">Rien pour le moment : choisissez « Nouvelle rencontre » ou « Nouvel entraînement » ci-dessus.</p>'}`;
  }

  /* ---------------- panneau « Présents » toujours visible ---------------- */
  function asideHtml(presents, equipes) {
    const groupes = [];
    if (equipes && equipes.length) {
      equipes.forEach(e => groupes.push({ nom: e.nom, lst: presents.filter(p => Number(p.equipe_id) === Number(e.id)) }));
      const sans = presents.filter(p => !p.equipe_id || !equipes.some(e => Number(e.id) === Number(p.equipe_id)));
      if (sans.length) groupes.push({ nom: 'Sans équipe', lst: sans });
    } else groupes.push({ nom: null, lst: presents });
    return `<aside class="trk-aside" aria-label="Présents"><h3>👥 Présents (${presents.length})</h3>${LEGENDE}
      ${presents.length ? groupes.map(g => `<div class="trk-aeq">${g.nom !== null ? `<b><span>${esc(g.nom)}</span><span>${g.lst.length}</span></b>` : ''}
        ${g.lst.map(p => `<button class="trk-aj" data-trk="fiche-aside" data-id="${p.joueur_id}">${pas(p)}<span>${esc(nomJ(p))}</span><small>${esc(POSTE_COURT[p.poste_joue] || '')}${p.arrive_en_retard ? ' ⏱' : ''}</small></button>`).join('') || '<span class="trk-sub">—</span>'}</div>`).join('')
        : '<p class="trk-sub">Personne n’est encore inscrit.</p>'}
      ${ficheAside ? `<div class="trk-fiche"><b>${pas(ficheAside.joueur)}${esc(nomJ(ficheAside.joueur))}</b><br>
        <span class="trk-sub">${esc(ficheAside.joueur.pastille_libelle || '')}</span><br>
        Poste 1 : ${esc(POSTE_LIB[ficheAside.joueur.poste_habituel] || '—')} · Poste 2 : ${esc(POSTE_LIB[ficheAside.joueur.poste_2] || '—')}<br>
        ${ficheAside.joueur.email ? esc(ficheAside.joueur.email) + '<br>' : ''}
        ${ficheAside.stats.matchs} match(s) · ${ficheAside.stats.buts} but(s) · ${ficheAside.stats.passes} passe(s)<br>
        Fair-play actuel : <b>${ficheAside.stats.fair_play_actuel < 0 ? `<span class="trk-negatif">${ficheAside.stats.fair_play_actuel}</span>` : ficheAside.stats.fair_play_actuel}</b>${ficheAside.stats.en_sanction ? ' ⚠️ en sanction' : ''} · moyenne ${Math.round((ficheAside.stats.fair_play_moyenne || 5) * 10) / 10}<br>
        Cartons : 🟥 ${ficheAside.stats.carton_rouge} · 🟨 ${ficheAside.stats.carton_jaune} · 🟩 ${ficheAside.stats.carton_vert} · ⬜ ${ficheAside.stats.carton_blanc}<br>
        <span class="trk-or" style="display:inline-block;margin-top:4px;padding:2px 8px;border-top-width:3px">✨ Joga Bonito moyen ${Math.round((ficheAside.stats.joga_moyen || 0) * 10) / 10}/10</span>
        <div style="margin-top:6px"><button class="trk-btn sec" data-trk="fermer-aside">Fermer</button></div></div>` : ''}</aside>`;
  }

  /* ---------------- rencontre contre un adversaire / notes d'un match ---------------- */
  async function vueMatch() {
    const [dm, rj] = await Promise.all([charger(() => call('GET', '/tracker/matchs/' + matchOuvert)), charger(() => call('GET', '/tracker/joueurs'))]);
    if (!dm) { matchOuvert = null; return await vueAccueil(); }
    const m = dm.match, notes = dm.notes, joueurs = rj ? rj.joueurs : [];
    const presents = new Map(notes.map(n => [Number(n.joueur_id), n]));
    const dejaSeance = !!m.seance_id;
    const absents = joueurs.filter(j => !presents.has(Number(j.id)));
    const ligne = (j) => { const p = presents.get(Number(j.id)); const poste = (p && p.poste_joue) || j.poste_habituel || '';
      const postes = [j.poste_habituel, j.poste_2].filter(Boolean);
      return `<tr><td><label style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" data-trk-pres="${j.id}"${p ? ' checked' : ''}> ${pas(j)}<span>${esc(nomJ(j))}</span></label>${p && p.arrive_en_retard ? ' <span class="trk-pill no">arrivé en retard</span>' : ''}${postes.length ? `<div class="trk-sub" style="margin:2px 0 0 28px;font-size:11.5px">${postes.map(x => POSTE_LIB[x]).join(' · ')}</div>` : ''}</td>
        <td><select data-trk-po="${j.id}"><option value="">—</option>${ctx.postes.map(x => `<option value="${x}"${poste === x ? ' selected' : ''}>${POSTE_LIB[x]}</option>`).join('')}</select></td></tr>`; };
    const aside = asideHtml(notes.map(n => ({ joueur_id: n.joueur_id, prenom: n.prenom, nom: n.nom, poste_joue: n.poste_joue, arrive_en_retard: n.arrive_en_retard, pastille: n.pastille, pastille_libelle: n.pastille_libelle, equipe_id: null })), null);
    const entete = dejaSeance
      ? `<div class="trk-row" style="margin-bottom:10px"><button class="trk-btn sec" data-trk="retour-seance">← Retour à l’entraînement</button><span class="trk-pill ok">🏋️ Match n°${m.ordre_seance}</span><b>${esc(libMatch(m))}</b></div>
         <div class="trk-card"><b>Score</b><div class="trk-row" style="margin-top:6px"><div><label>${esc(m.equipe_a || 'Équipe 1')}</label><input type="number" min="0" id="trk-sc-a" value="${m.score_pour == null ? '' : m.score_pour}"></div><div><label>${esc(m.equipe_b || 'Équipe 2')}</label><input type="number" min="0" id="trk-sc-b" value="${m.score_contre == null ? '' : m.score_contre}"></div><button class="trk-btn" data-trk="save-score">Enregistrer le score</button></div></div>`
      : `<div class="trk-row" style="margin-bottom:10px"><button class="trk-btn sec" data-trk="retour-accueil">← Accueil</button><span class="trk-pill">⚽ Rencontre</span><b>${fmtDate(m.date_match)} — ${esc(libMatch(m))}</b> ${m.score_pour == null ? '' : `<span class="trk-pill">${esc(m.score_pour + ' - ' + m.score_contre)}</span>`}<span class="trk-grow"></span><button class="trk-btn danger" data-trk="suppr-match">Supprimer</button></div>`;
    const blocPresents = dejaSeance ? '' : `<div class="trk-card"><b>① Qui est présent ?</b>
      <p class="trk-sub" style="margin:4px 0 10px">Seuls les joueurs présents pourront être notés. Indiquez le poste tenu ce jour-là.</p>
      ${joueurs.length ? `${LEGENDE}<div class="trk-scroll"><table><tr><th>Joueur</th><th>Poste ce jour</th></tr>${joueurs.map(ligne).join('')}</table></div>
        <div class="trk-row" style="margin-top:10px"><button class="trk-btn" data-trk="save-presents">💾 Enregistrer les présents</button><button class="trk-btn sec" data-trk="tout-cocher">Tout cocher</button></div>` : '<p class="trk-sub">Ajoutez d’abord des joueurs dans l’onglet « Joueurs ».</p>'}
      ${absents.length ? `<div class="trk-row" style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--trk-bord)"><b>⏱️ Un joueur arrive en retard ?</b>
        <select id="trk-r-j">${absents.map(j => `<option value="${j.id}">${esc(nomJ(j))}</option>`).join('')}</select>
        <select id="trk-r-po"><option value="">Poste</option>${ctx.postes.map(x => `<option value="${x}">${POSTE_LIB[x]}</option>`).join('')}</select>
        <button class="trk-btn sec" data-trk="retardataire-match">＋ Ajouter</button></div>` : ''}</div>`;
    const garde = terrain && terrain.m.id === m.id;
    terrain = { m, notes: notes.map(x => ({ ...x })), cartons: dm.cartons, sel: garde ? terrain.sel : null, ouvertes: garde ? terrain.ouvertes : new Set(dejaSeance ? [] : ['*']) };
    const blocTerrain = notes.length ? `<div class="trk-card"><b>🎯 Terrain : points rapides</b> <span class="trk-pill mut">1 appui = 1 point</span>
        <p class="trk-sub" style="margin:4px 0 10px">${dejaSeance ? 'Touchez une équipe pour voir ses joueurs, puis un joueur pour lui attribuer ses points.' : 'Touchez un joueur pour lui attribuer ses points.'} Tout est comptabilisé à son nom.</p>
        <div id="trk-terrain" class="trk-terrain">${terrainHtml()}</div></div>` : '';
    const blocNotes = `<details class="trk-card"><summary style="cursor:pointer;font-weight:700">${dejaSeance ? 'Notes détaillées du match' : '② Notes détaillées de la rencontre'} <span class="trk-pill mut">réservé au bureau</span></summary>
      <p class="trk-sub" style="margin:8px 0 10px">Étoiles, arrêts, duels, observations… Les compteurs rapides ci-dessus se retrouvent ici et peuvent aussi s’y corriger. Fair-play : <b>${ctx.fair_play.defaut}/10 pour tout le monde</b> ; les points s’ajoutent, les cartons en retirent.</p>
      ${notes.length ? `<div>${notes.map(carteNote).join('')}</div><div style="margin-top:10px"><button class="trk-btn" data-trk="save-notes">💾 Enregistrer les notes</button></div>` : '<p class="trk-sub">Enregistrez d’abord les présents : ils apparaîtront ici pour être notés.</p>'}</details>`;
    const edition = dejaSeance ? '' : `<details class="trk-card"><summary style="cursor:pointer;font-weight:700">Modifier les infos de la rencontre</summary><div class="trk-row" style="margin-top:10px">
        <div><label>Date</label><input type="date" id="trk-e-date" value="${esc(m.date_match)}"></div><div class="trk-grow"><label>Adversaire</label><input id="trk-e-adv" style="width:100%" value="${esc(m.adversaire || '')}"></div>
        <div class="trk-grow"><label>Lieu</label><input id="trk-e-lieu" style="width:100%" value="${esc(m.lieu || '')}"></div>
        <div><label>Notre score</label><input type="number" min="0" id="trk-e-sp" value="${m.score_pour == null ? '' : m.score_pour}"></div><div><label>Score adverse</label><input type="number" min="0" id="trk-e-sc" value="${m.score_contre == null ? '' : m.score_contre}"></div>
        <button class="trk-btn" data-trk="save-match">Enregistrer</button></div></details>`;
    return `${RAPPEL}${entete}<div class="trk-seance"><div>${blocPresents}${blocTerrain}${blocNotes}${edition}</div>${aside}</div>`;
  }

  /* ---------------- terrain : points rapides ---------------- */
  const fpTexte = (n) => n.fp_score < 0 ? `<span class="trk-negatif">${n.fp_score}</span>` : String(n.fp_score);
  function joueurTerrain(n) {
    const T = terrain, sel = T.sel === Number(n.joueur_id);
    const chips = [n.buts ? `⚽ ${n.buts}` : '', n.passes ? `🎯 ${n.passes}` : '', n.fp_points ? `🤝 +${n.fp_points}` : '', n.joga_bonito ? `✨ ${n.joga_bonito}/10` : '',
      n.carton_rouge ? `🟥 ${n.carton_rouge}` : '', n.carton_jaune ? `🟨 ${n.carton_jaune}` : '', n.carton_vert ? `🟩 ${n.carton_vert}` : '', n.carton_blanc ? `⬜ ${n.carton_blanc}` : ''].filter(Boolean);
    return `<button class="trk-tj${sel ? ' sel' : ''}" data-trk="terrain-joueur" data-j="${n.joueur_id}">${pas(n)}<b>${esc(nomJ(n))}</b> <small class="trk-sub">${esc(POSTE_COURT[n.poste_joue] || '')}</small>
        <span style="float:right;font-size:12px">fair-play ${fpTexte(n)}${n.fp_sanction ? ' ⚠️' : ''}</span>${chips.length ? `<div class="trk-chips">${chips.map(c => `<span>${c}</span>`).join('')}</div>` : ''}</button>${sel ? panneauJoueur(n) : ''}`;
  }
  function panneauJoueur(n) {
    const tuile = (cls, titre, valeur, action, boutons, sous) => `<div class="trk-tuile ${cls}"><div>${titre}</div><div class="v">${valeur}</div>${sous ? `<small>${sous}</small>` : ''}<div class="b">${boutons.map(([lib, d]) => `<button class="${d > 0 ? 'plus' : ''}" data-trk="pt" data-j="${n.joueur_id}" data-a="${action}" data-d="${d}" aria-label="${esc(titre)} ${lib}">${lib}</button>`).join('')}</div></div>`;
    const cr = terrain.cartons || {};
    return `<div class="trk-panneau"><div class="trk-row"><b>${esc(nomJ(n))}</b><span class="trk-pill ${n.fp_sanction ? 'no' : 'ok'}">fair-play du match : ${n.fp_score}${n.fp_sanction ? ' (en sanction)' : ''}</span><span class="trk-grow"></span><button class="trk-btn sec" data-trk="fermer-joueur">Fermer</button></div>
      <div class="trk-tuiles">
        ${tuile('', '⚽ But', n.buts, 'but', [['−', -1], ['+1', 1]])}
        ${tuile('', '🎯 Passe décisive', n.passes, 'passe', [['−', -1], ['+1', 1]])}
        ${tuile('', '🤝 Fair-play', `+${n.fp_points}`, 'fair_play', [['−', -1], ['+1', 1], ['+2', 2], ['+3', 3]], 'belle action')}
        ${tuile('or', `✨ Joga Bonito ${aideBtn}`, `${n.joga_bonito}/10`, 'joga', [['−', -1], ['+1', 1], ['+2', 2], ['+3', 3]], 'technique et plaisir des yeux')}
        ${ctx.cartons.map(c => { const r = cr[c] || { malus: 0, matchs: 1 }; return tuile(c, `${CARTON_META[c][0]} ${CARTON_META[c][1]}`, n['carton_' + c] || 0, c, [['−', -1], ['+1', 1]], `−${r.malus} pt · ${r.matchs} match${r.matchs > 1 ? 's' : ''}`); }).join('')}
      </div>${aideJoga ? `<div class="trk-or" style="margin-top:8px"><b>✨ Joga Bonito</b><br><small>${esc(AIDE_JOGA)}</small></div>` : ''}</div>`;
  }
  function terrainHtml() {
    const T = terrain, entr = !!T.m.seance_id;
    const groupes = entr ? [T.m.equipe_a, T.m.equipe_b] : [null];
    return groupes.map(eq => {
      const lst = T.notes.filter(n => entr ? n.equipe === eq : true), ouvert = !entr || T.ouvertes.has(eq);
      return `<div class="trk-tequipe">${entr ? `<button class="trk-eqbtn" data-trk="terrain-equipe" data-e="${esc(eq)}"><b>${esc(eq)}</b><span>${lst.length} joueur(s) ${ouvert ? '▾' : '▸'}</span></button>` : ''}${ouvert ? lst.map(joueurTerrain).join('') || '<p class="trk-sub">Aucun joueur.</p>' : ''}</div>`;
    }).join('');
  }
  function majTerrain() {
    const el = root.querySelector('#trk-terrain'); if (!el) return;
    el.innerHTML = terrainHtml();
    el.querySelectorAll('[data-trk]').forEach(b => b.onclick = () => action(b));
  }
  const CHAMPS_PT = { but: 'buts', passe: 'passes', fair_play: 'fp_points', joga: 'joga_bonito', rouge: 'carton_rouge', jaune: 'carton_jaune', vert: 'carton_vert', blanc: 'carton_blanc' };
  async function pointRapide(el) {
    const jid = Number(el.dataset.j), a = el.dataset.a;
    try {
      const r = await call('POST', `/tracker/matchs/${matchOuvert}/joueurs/${jid}/action`, { action: a, delta: Number(el.dataset.d) });
      const n = terrain.notes.find(x => Number(x.joueur_id) === jid); if (!n) return;
      n[CHAMPS_PT[a]] = r.valeur;
      if (r.fair_play) { n.fp_score = r.fair_play.score; n.fp_niveau = r.fair_play.niveau; n.fp_sanction = r.fair_play.sanction; }
      const champ = root.querySelector(`[data-trk-n="${jid}"][data-k="${CHAMPS_PT[a]}"]`); if (champ) champ.value = r.valeur;
      majTerrain();
    } catch (e) { dire('err', e.message || 'Erreur.'); await rendre(); }
  }

  function carteNote(n) {
    const id = n.joueur_id, p = n.poste_joue || '';
    const def = ctx.fair_play.defaut;
    const num = (k, lib, v, max) => `<div><label>${lib}</label><input type="number" min="0" max="${max || 99}" data-trk-n="${id}" data-k="${k}" value="${v || 0}"></div>`;
    const etoiles = `<div><label>Étoiles (0-5)</label><input type="number" min="0" max="5" step="0.5" data-trk-n="${id}" data-k="note_etoiles" value="${n.note_etoiles == null ? '' : n.note_etoiles}"></div>`;
    let spe = '';
    if (p === 'gardien') spe = num('arrets', 'Arrêts', n.arrets) + num('buts_encaisses', 'Buts encaissés', n.buts_encaisses) + etoiles;
    else if (p === 'defenseur') spe = num('duels_gagnes', 'Duels gagnés', n.duels_gagnes) + num('interceptions', 'Interceptions', n.interceptions) + num('tacles', 'Tacles', n.tacles) + etoiles;
    else spe = etoiles;
    return `<div class="trk-card" style="margin-bottom:8px" data-trk-carte="${id}">
      <div class="trk-row"><b>${pas(n)}${esc(nomJ(n))}</b> <span class="trk-pill">${POSTE_LIB[p] || 'poste non précisé'}</span>${n.equipe ? ` <span class="trk-pill mut">${esc(n.equipe)}</span>` : ''}${n.arrive_en_retard ? ' <span class="trk-pill no">arrivé en retard</span>' : ''}${n.fp_bonus ? ` <span class="trk-pill ok">+${n.fp_bonus} fair-play (changement d’équipe)</span>` : ''}</div>
      <div class="trk-row" style="margin-top:8px">${num('buts', 'Buts', n.buts, 30)}${num('passes', 'Passes déc.', n.passes, 30)}${spe}
        ${num('fp_points', 'Fair-play (+ points)', n.fp_points, 10)}
        <div class="trk-or"><label style="color:#3b2a00">✨ Joga Bonito (0-10)${aideBtn}</label><input type="number" min="0" max="10" data-trk-n="${id}" data-k="joga_bonito" value="${n.joga_bonito || 0}"></div></div>
      <div class="trk-row" style="margin-top:8px"><span class="trk-sub" style="margin:0">Cartons :</span>${ctx.cartons.map(c => `<div><label>${CARTON_META[c][0]} ${CARTON_META[c][1]}</label><input type="number" min="0" max="9" data-trk-n="${id}" data-k="carton_${c}" value="${n['carton_' + c] || 0}"></div>`).join('')}
        <span class="trk-pill ${n.fp_sanction ? 'no' : 'mut'}">fair-play du match : ${n.fp_score == null ? def : n.fp_score}${n.fp_sanction ? ' (sanction)' : ''}</span></div>
      <div style="margin-top:8px"><label>Observations (bureau uniquement)</label><textarea data-trk-n="${id}" data-k="observations" rows="2" style="width:100%" placeholder="Comportement, fait marquant…">${esc(n.observations || '')}</textarea></div></div>`;
  }

  /* ---------------- séance d'entraînement ---------------- */
  async function vueSeanceComplete() {
    const [d, rj] = await Promise.all([charger(() => call('GET', '/tracker/seances/' + seanceOuverte)), charger(() => call('GET', '/tracker/joueurs'))]);
    if (!d) { seanceOuverte = null; return await vueAccueil(); }
    const joueurs = rj ? rj.joueurs : [];
    if (ficheOuverte) ficheAside = await charger(() => call('GET', '/tracker/joueurs/' + ficheOuverte)); else ficheAside = null;
    const s = d.seance, E = d.equipes, P = d.presents, eqNom = new Map(E.map(e => [Number(e.id), e.nom]));
    const sousOnglets = [['presents', `① Présents (${P.length})`], ['equipes', '② Équipes'], ['matchs', `③ Matchs (${d.matchs.length})`]];
    let corps = '';
    if (vueSeance === 'presents') {
      const presMap = new Map(P.map(p => [Number(p.joueur_id), p]));
      const absents = joueurs.filter(j => !presMap.has(Number(j.id)));
      corps = `<div class="trk-card"><b>Qui est présent ?</b><p class="trk-sub" style="margin:4px 0 10px">Seules les personnes présentes pourront former les équipes. Indiquez le poste tenu aujourd’hui.</p>
        ${joueurs.length ? `${LEGENDE}<div class="trk-scroll"><table><tr><th>Joueur</th><th>Poste du jour</th></tr>${joueurs.map(j => { const p = presMap.get(Number(j.id)); const po = (p && p.poste_joue) || j.poste_habituel || '';
          return `<tr><td><label style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" data-trk-pres="${j.id}"${p ? ' checked' : ''}> ${pas(j)}<span>${esc(nomJ(j))}</span></label>${p && p.arrive_en_retard ? ' <span class="trk-pill no">arrivé en retard</span>' : ''}<div class="trk-sub" style="margin:2px 0 0 28px;font-size:11.5px">${[j.poste_habituel, j.poste_2].filter(Boolean).map(x => POSTE_LIB[x]).join(' · ')}</div></td>
          <td><select data-trk-po="${j.id}"><option value="">—</option>${ctx.postes.map(x => `<option value="${x}"${po === x ? ' selected' : ''}>${POSTE_LIB[x]}</option>`).join('')}</select></td></tr>`; }).join('')}</table></div>
          <div class="trk-row" style="margin-top:10px"><button class="trk-btn" data-trk="save-presents-seance">💾 Enregistrer les présents</button><button class="trk-btn sec" data-trk="tout-cocher">Tout cocher</button></div>` : '<p class="trk-sub">Ajoutez d’abord des joueurs dans l’onglet « Joueurs ».</p>'}
        ${absents.length ? `<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--trk-bord)"><b>⏱️ Un joueur arrive en retard ?</b>
          <div class="trk-row" style="margin-top:8px"><div><label>Joueur</label><select id="trk-r-j">${absents.map(j => `<option value="${j.id}">${esc(nomJ(j))}</option>`).join('')}</select></div>
            <div><label>Son poste</label><select id="trk-r-po">${ctx.postes.map(x => `<option value="${x}">${POSTE_LIB[x]}</option>`).join('')}</select></div>
            <div><label>Équipe</label><select id="trk-r-eq">${E.map(e => `<option value="${e.id}">${esc(e.nom)}</option>`).join('')}</select></div>
            <button class="trk-btn sec" data-trk="retardataire-seance">＋ Ajouter</button></div>
          <p class="trk-sub" id="trk-r-sugg" style="margin:6px 0 0">La proposition d’équipe apparaît ici.</p></div>` : ''}</div>`;
    } else if (vueSeance === 'equipes') {
      const sans = P.filter(p => !p.equipe_id || !eqNom.has(Number(p.equipe_id)));
      const optEq = (sel) => `<option value="">Sans équipe</option>${E.map(e => `<option value="${e.id}"${Number(sel) === Number(e.id) ? ' selected' : ''}>${esc(e.nom)}</option>`).join('')}`;
      const resume = (lst) => ['gardien', 'defenseur', 'milieu', 'attaquant'].map(k => { const n = lst.filter(p => p.poste_joue === k).length; return n ? `${n} ${POSTE_COURT[k]}` : ''; }).filter(Boolean).join(' · ') || '—';
      const carteJ = (p) => `<div class="trk-ligne">${pas(p)}<span>${esc(nomJ(p))}</span> <small class="trk-sub">${esc(POSTE_COURT[p.poste_joue] || '')}</small>${p.arrive_en_retard ? ' <span class="trk-pill no">⏱</span>' : ''}<select data-trk-move="${p.joueur_id}" aria-label="Changer d’équipe">${optEq(p.equipe_id)}</select></div>`;
      corps = `<div class="trk-card"><div class="trk-row"><b>Équipes</b><span class="trk-grow"></span>
          <button class="trk-btn" data-trk="equilibrer"${d.matchs.length ? ' disabled title="Les matchs ont commencé"' : ''}>⚖️ Répartir automatiquement</button><button class="trk-btn sec" data-trk="ajout-equipe">＋ Ajouter une équipe</button><button class="trk-btn sec" data-trk="save-noms">Enregistrer les noms</button></div>
        <p class="trk-sub" style="margin:6px 0 10px">Répartition équilibrée poste par poste. Un joueur peut changer d’équipe à tout moment : il garde ses stats${''} et reçoit <b>1 point de fair-play automatique</b> une fois les matchs commencés.</p>
        <div class="trk-eqs">${E.map(e => { const lst = P.filter(p => Number(p.equipe_id) === Number(e.id));
          return `<div class="trk-eq"><header><input data-trk-eqnom="${e.id}" value="${esc(e.nom)}" aria-label="Nom de l’équipe"><span class="trk-pill">${lst.length}</span></header><div class="trk-sub" style="margin:0 0 4px;font-size:11.5px">${esc(resume(lst))}</div>${lst.map(carteJ).join('') || '<div class="trk-sub">Aucun joueur</div>'}</div>`; }).join('')}
          ${sans.length ? `<div class="trk-eq"><header><b>Sans équipe</b><span class="trk-pill mut">${sans.length}</span></header>${sans.map(carteJ).join('')}</div>` : ''}</div></div>
        <div class="trk-card"><b>Réglage de l’enchaînement</b><div class="trk-row" style="margin-top:8px"><div class="trk-grow"><label>Règle</label><select id="trk-s-regle" style="width:100%">${Object.entries(REGLES).map(([k, v]) => `<option value="${k}"${s.regle === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          <label style="display:flex;gap:6px;align-items:center;margin:0;font-weight:600"><input type="checkbox" id="trk-s-auto"${s.suivi_auto ? ' checked' : ''}> Suivi automatique</label><button class="trk-btn sec" data-trk="save-reglage">Enregistrer</button></div>
          <p class="trk-sub" style="margin:8px 0 4px"><b>Ordre de passage</b> (les deux premières équipes jouent en premier) :</p>
          <div>${d.ordre.map((id, i) => `<div class="trk-ligne"><span class="trk-pill mut">${i + 1}</span><span>${esc(eqNom.get(Number(id)) || '')}</span><span style="margin-left:auto"><button class="trk-btn sec" style="padding:2px 8px" data-trk="ordre" data-id="${id}" data-dir="-1"${i === 0 ? ' disabled' : ''}>↑</button> <button class="trk-btn sec" style="padding:2px 8px" data-trk="ordre" data-id="${id}" data-dir="1"${i === d.ordre.length - 1 ? ' disabled' : ''}>↓</button></span></div>`).join('')}</div></div>`;
    } else {
      const et = d.etat, manuel = !s.suivi_auto || s.regle === 'manuel';
      corps = `${et.prochain ? `<div class="trk-affiche"><b>Prochaine affiche proposée</b><div style="font-size:18px;margin:6px 0"><b>${esc(et.prochain[0].nom)}</b> contre <b>${esc(et.prochain[1].nom)}</b></div>
          <div class="trk-sub" style="margin:0 0 8px">${esc(REGLES[s.regle] || '')}${et.attente.length ? ` · en attente : ${et.attente.map(x => esc(x.nom)).join(', ')}` : ''}</div><button class="trk-btn" data-trk="lancer-auto">▶ Lancer ce match</button></div>`
        : `<div class="trk-card"><b>${manuel ? 'Mode manuel' : 'Prochaine affiche'}</b><p class="trk-sub" style="margin:4px 0 0">${esc(et.raison || 'Choisissez les deux équipes ci-dessous.')}</p></div>`}
        <div class="trk-card"><b>Choisir l’affiche à la main</b><div class="trk-row" style="margin-top:8px"><div><label>Équipe 1</label><select id="trk-mm-a">${E.map(e => `<option value="${e.id}">${esc(e.nom)}</option>`).join('')}</select></div>
          <div><label>Équipe 2</label><select id="trk-mm-b">${E.map((e, i) => `<option value="${e.id}"${i === 1 ? ' selected' : ''}>${esc(e.nom)}</option>`).join('')}</select></div><button class="trk-btn sec" data-trk="lancer-manuel">Lancer ce match</button></div></div>
        <div class="trk-card"><b>Matchs de la séance</b>${d.matchs.length ? `<div class="trk-scroll"><table><tr><th>N°</th><th>Affiche</th><th>Score</th><th>Joueurs</th><th></th></tr>${d.matchs.map(m => `<tr><td>${m.ordre_seance}</td><td>${esc(m.equipe_a)} contre ${esc(m.equipe_b)}</td><td>${m.score_pour == null ? '<span class="trk-pill no">à saisir</span>' : esc(m.score_pour + ' - ' + m.score_contre)}</td><td>${m.joueurs}</td><td style="white-space:nowrap"><button class="trk-btn sec" data-trk="ouvrir-match-seance" data-id="${m.id}">Score et notes</button></td></tr>`).join('')}</table></div>` : '<p class="trk-sub">Aucun match pour le moment.</p>'}</div>`;
    }
    return `${RAPPEL}<div class="trk-row" style="margin-bottom:10px"><button class="trk-btn sec" data-trk="retour-accueil">← Accueil</button><span class="trk-pill ok">🏋️ Entraînement</span><b>${fmtDate(s.date_seance)}</b><span class="trk-pill mut">${esc(REGLES[s.regle] || '')}${s.suivi_auto ? '' : ' (suivi désactivé)'}</span><span class="trk-grow"></span><button class="trk-btn danger" data-trk="suppr-seance">Supprimer</button></div>
      <div class="trk-tabs">${sousOnglets.map(([k, l]) => `<button class="trk-tab${vueSeance === k ? ' on' : ''}" data-trk="sous-onglet" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="trk-seance"><div>${corps}</div>${asideHtml(P, E)}</div>`;
  }

  /* ---------------- joueurs ---------------- */
  const optPostes = (sel) => `<option value="">—</option>${ctx.postes.map(x => `<option value="${x}"${sel === x ? ' selected' : ''}>${POSTE_LIB[x]}</option>`).join('')}`;
  function ficheHtml(j) {
    if (!j) return '';
    const lie = !!j.user_id;
    return `<div class="trk-card"><b>🪪 Fiche de ${esc(nomJ(j))}</b> ${pas(j)}<span class="trk-sub">${esc(j.pastille_libelle || '')}</span>
      ${lie ? '<p class="trk-sub" style="margin:4px 0 0">Adhérent avec compte : nom, prénom et e-mail viennent de son compte. Vous pouvez modifier ses postes.</p>' : ''}
      <div class="trk-row" style="margin-top:8px">
        <div class="trk-grow"><label>Nom</label><input id="trk-f-nom" style="width:100%" value="${esc(j.nom)}"${lie ? ' disabled' : ''}></div>
        <div class="trk-grow"><label>Prénom</label><input id="trk-f-prenom" style="width:100%" value="${esc(j.prenom || '')}"${lie ? ' disabled' : ''}></div>
        <div class="trk-grow"><label>E-mail</label><input type="email" id="trk-f-email" style="width:100%" value="${esc(j.email || '')}"${lie ? ' disabled' : ''}></div>
        <div><label>Poste 1</label><select id="trk-f-p1">${optPostes(j.poste_habituel)}</select></div><div><label>Poste 2</label><select id="trk-f-p2">${optPostes(j.poste_2)}</select></div></div>
      <div style="margin-top:10px" class="trk-row"><button class="trk-btn" data-trk="save-fiche" data-id="${j.id}">💾 Enregistrer la fiche</button><button class="trk-btn sec" data-trk="fermer-fiche">Fermer</button></div></div>`;
  }
  async function vueJoueurs() {
    const [rj, ra] = await Promise.all([charger(() => call('GET', '/tracker/joueurs')), charger(() => call('GET', '/tracker/adherents'))]);
    const js = rj ? rj.joueurs : [];
    const proposables = (ra ? ra.adherents : []).filter(a => !a.deja_ajoute);
    return `${RAPPEL}
    <div class="trk-card"><b>Joueurs (${js.length})</b>${LEGENDE}
      ${js.length ? `<div class="trk-scroll"><table><tr><th>Nom</th><th>E-mail</th><th>Poste 1</th><th>Poste 2</th><th>Rencontres</th><th>Buts</th><th>Passes</th><th></th></tr>
        ${js.map(j => `<tr><td>${pas(j)}${esc(nomJ(j))}${j.user_id ? ' <span class="trk-pill ok">compte</span>' : ' <span class="trk-pill mut">sans compte</span>'}</td>
          <td style="font-size:12px">${esc(j.email || '—')}</td><td>${POSTE_LIB[j.poste_habituel] || '—'}</td><td>${POSTE_LIB[j.poste_2] || '—'}</td><td>${j.matchs}</td><td>${j.buts}</td><td>${j.passes}</td>
          <td style="white-space:nowrap"><button class="trk-btn sec" data-trk="fiche-joueur" data-id="${j.id}">Fiche</button> <button class="trk-btn danger" data-trk="retirer-joueur" data-id="${j.id}" data-nom="${esc(nomJ(j))}">Retirer</button></td></tr>`).join('')}</table></div>`
        : '<p class="trk-sub">Aucun joueur. Ajoutez-en ci-dessous.</p>'}</div>
    ${ficheOuverte ? ficheHtml(js.find(j => Number(j.id) === ficheOuverte)) : ''}
    <div class="trk-card"><b>＋ Ajouter un adhérent</b>
      ${proposables.length ? `<div class="trk-scroll"><table>${proposables.map((a, i) => `<tr><td>${pas(a)}${esc(nomJ(a))}${a.mineur ? ' <span class="trk-pill no">mineur — refusé</span>' : (a.age_inconnu ? ' <span class="trk-pill mut">âge non renseigné</span>' : '')}</td>
          <td style="text-align:right"><button class="trk-btn sec" data-trk="ajout-adh" data-i="${i}"${a.mineur ? ' disabled' : ''}>Ajouter</button></td></tr>`).join('')}</table></div>`
        : '<p class="trk-sub">Aucun adhérent à proposer (registre vide ou déjà tous ajoutés).</p>'}</div>
    <div class="trk-card"><b>＋ Ajouter une personne sans compte</b>
      <div class="trk-row" style="margin-top:8px">
        <div class="trk-grow"><label>Nom *</label><input id="trk-j-nom" style="width:100%"></div><div class="trk-grow"><label>Prénom</label><input id="trk-j-prenom" style="width:100%"></div>
        <div class="trk-grow"><label>E-mail * (pour lui envoyer ses statistiques)</label><input type="email" id="trk-j-email" style="width:100%"></div>
        <div><label>Poste 1</label><select id="trk-j-poste">${optPostes('')}</select></div><div><label>Poste 2</label><select id="trk-j-poste2">${optPostes('')}</select></div></div>
      <label style="display:flex;gap:8px;align-items:center;margin:10px 0 0;font-weight:600"><input type="checkbox" id="trk-j-maj"> J’atteste que cette personne est majeure (18 ans ou plus)</label>
      <div style="margin-top:10px"><button class="trk-btn" data-trk="ajout-manuel">Ajouter</button></div></div>
    <div id="trk-attest" hidden>${JSON.stringify(proposables).replace(/</g, '\\u003c').replace(/&/g, '\\u0026')}</div>`;
  }

  /* ---------------- prix ---------------- */
  async function vuePrix() {
    const [rp, rl] = await Promise.all([charger(() => call('GET', '/tracker/prix')), charger(() => call('GET', '/tracker/lots'))]);
    const ps = rp ? rp.prix : [], lots = rl ? rl.lots : [];
    if (!brouillonPrix) brouillonPrix = { modele: 'buteur' };
    const mod = ctx.modeles.find(x => x.cle === brouillonPrix.modele) || ctx.modeles[0];
    const rg = mod.regle_defaut, poids = rg.poids || {};
    const champsPoids = Object.keys(poids).map(k => `<div><label>${esc({ etoiles: 'Poids étoiles', taux_arrets: 'Poids taux d’arrêts', duels: 'Poids duels', interceptions: 'Poids interceptions', tacles: 'Poids tacles' }[k] || k)}</label><input type="number" min="0" max="100" id="trk-w-${k}" value="${poids[k]}"></div>`).join('');
    return `${RAPPEL}
    <div class="trk-card"><b>＋ Créer un prix à partir d’un modèle</b>
      <div class="trk-row" style="margin:10px 0">${ctx.modeles.map(x => `<div class="trk-modele${x.cle === mod.cle ? ' on' : ''}${x.dore ? ' dore' : ''}" data-trk="choisir-modele" data-m="${x.cle}"><b>${x.emoji} ${esc(x.nom)}${x.dore ? ' ' + aideBtn : ''}</b><span>${esc(x.description)}</span></div>`).join('')}</div>
      <div class="trk-row">
        <div class="trk-grow"><label>Nom du prix</label><input id="trk-p-nom" style="width:100%" value="${esc(mod.nom)}"></div>
        <div><label>Lot</label><select id="trk-p-lot"><option value="">— aucun —</option>${lots.map(l => `<option value="${l.id}">${esc(l.nom)}</option>`).join('')}</select></div>
        <div><label>Du</label><input type="date" id="trk-p-debut"></div><div><label>Au</label><input type="date" id="trk-p-fin"></div>
        <div><label>Matchs minimum</label><input type="number" min="1" id="trk-p-min" value="${rg.min_matchs}"></div>
        <div><label>Rencontres prises en compte</label><label style="font-weight:600;display:inline-flex;gap:5px;align-items:center;margin-right:10px"><input type="checkbox" id="trk-p-cat-match" checked> ⚽ Matchs</label><label style="font-weight:600;display:inline-flex;gap:5px;align-items:center"><input type="checkbox" id="trk-p-cat-ent" checked> 🏋️ Entraînements</label></div>
        ${mod.cle === 'jogabonito' ? `<div><label>Calcul</label><select id="trk-p-jogamode"><option value="moyenne">Moyenne par match (non noté = 0)</option><option value="total">Total des notes</option></select></div>` : ''}
        ${champsPoids}</div>
      <label style="display:flex;gap:8px;align-items:center;margin:12px 0 0;font-weight:600"><input type="checkbox" id="trk-p-ajour"> <i class="trk-pas vert" style="margin:0"></i> Membres à jour uniquement (seuls les adhérents à jour de leur cotisation comptent pour ce prix, son lauréat et son trophée)</label>
      <p class="trk-sub" style="margin:8px 0">Tout reste modifiable après création. Le vote des adhérents sera ajouté à l’étape suivante.</p>
      <button class="trk-btn" data-trk="creer-prix">Créer le prix</button></div>
    ${ps.length ? ps.map(p => `<div class="trk-card"><div class="trk-row"><b>${p.emoji || ''} ${esc(p.nom)}</b>
        ${p.lot ? `<span class="trk-pill">🎁 ${esc(p.lot.nom)}</span>` : ''}<span class="trk-pill mut">${p.regle.categories.length === 2 ? 'Matchs + entraînements' : (p.regle.categories[0] === 'entrainement' ? 'Entraînements seuls' : 'Matchs seuls')}</span>${p.regle.membres_a_jour ? '<span class="trk-pill ok">Membres à jour</span>' : ''}<span class="trk-pill mut">${p.periode_debut ? fmtDate(p.periode_debut) : '…'} → ${p.periode_fin ? fmtDate(p.periode_fin) : '…'}</span>
        <span class="trk-pill ${p.statut === 'clos' ? 'ok' : 'mut'}">${p.statut === 'clos' ? 'Clos' : 'En cours'}</span><span class="trk-grow"></span>
        <button class="trk-btn sec" data-trk="ouvrir-prix" data-id="${p.id}">Voir le classement</button></div>
        <p style="margin:8px 0 0">${p.podium.length ? p.podium.map(x => `<span class="trk-pill ${x.rang === 1 ? 'ok' : 'mut'}">${x.rang}. ${esc(x.nom)} · ${x.score}${x.egalite ? ' (égalité)' : ''}</span>`).join(' ') : '<span class="trk-sub">Pas encore assez de données (minimum non atteint).</span>'}</p></div>`).join('')
      : '<p class="trk-sub">Aucun prix pour le moment.</p>'}`;
  }

  async function vuePrixDetail() {
    const r = await charger(() => call('GET', '/tracker/prix/' + prixOuvert));
    if (!r) { prixOuvert = null; return await vuePrix(); }
    const p = r.prix, c = r.classement;
    const det = (d) => Object.entries(d).filter(([k]) => k !== 'matchs').map(([k, v]) => `${k.replace(/_/g, ' ')} : ${v}`).join(' · ');
    return `<div class="trk-row" style="margin-bottom:10px"><button class="trk-btn sec" data-trk="retour-prix">← Tous les prix</button><b>${p.emoji || ''} ${esc(p.nom)}</b>
      <span class="trk-pill mut">${r.matchs_pris_en_compte} match(s) pris en compte · minimum ${p.regle.min_matchs}</span>${p.regle.membres_a_jour ? '<span class="trk-pill ok">Membres à jour uniquement</span>' : ''}<span class="trk-grow"></span>
      ${p.statut === 'clos' ? `<button class="trk-btn sec" data-trk="rouvrir-prix" data-id="${p.id}">Rouvrir</button>` : ''}<button class="trk-btn danger" data-trk="suppr-prix" data-id="${p.id}">Supprimer</button></div>
    ${c.some(x => x.egalite) ? '<div class="trk-rappel">Égalité parfaite sur certains rangs : le bureau tranche en désignant le lauréat.</div>' : ''}
    <div class="trk-card trk-scroll">${LEGENDE}<table><tr><th>Rang</th><th>Joueur</th><th>Score</th><th>Sur 100</th><th>Détail</th><th></th></tr>
      ${c.map(x => `<tr><td>${x.rang}${x.egalite ? ' =' : ''}</td><td>${pas(x)}${esc(x.nom)}${p.laureat_joueur_id === x.joueur_id ? ' 🏆' : ''}</td><td><b>${x.score}</b></td><td>${x.score_sur_100}</td><td style="font-size:12px;color:var(--muted,#64748b)">${esc(det(x.detail))}</td>
        <td>${p.laureat_joueur_id === x.joueur_id ? '<span class="trk-pill ok">Lauréat</span>' : `<button class="trk-btn sec" data-trk="laureat" data-id="${p.id}" data-j="${x.joueur_id}">Désigner lauréat</button>`}</td></tr>`).join('') || '<tr><td colspan="6">Aucun classement : pas assez de données.</td></tr>'}</table></div>
    ${r.ecartes.length ? `<p class="trk-sub">Écartés (moins de ${p.regle.min_matchs} match(s)) : ${r.ecartes.map(e => pas(e) + esc(e.nom) + ' (' + e.matchs + ')').join(', ')}</p>` : ''}
    ${r.exclus_cotisation && r.exclus_cotisation.length ? `<p class="trk-sub">Exclus car cotisation non à jour : ${r.exclus_cotisation.map(e => pas(e) + esc(e.nom)).join(', ')}</p>` : ''}`;
  }

  /* ---------------- présences ---------------- */
  async function vuePresences() {
    const r = await charger(() => call('GET', '/tracker/presences'));
    if (!r || !r.colonnes.length) return '<p class="trk-sub">Aucune rencontre ni séance : l’historique des présences apparaîtra ici, jour après jour.</p>';
    return `<p class="trk-sub">Historique des présences, jour après jour (🟢 présent · ⚪ absent). Les matchs d’une séance d’entraînement comptent pour une seule présence.</p>
    <div class="trk-card trk-scroll">${LEGENDE}<table><tr><th>Joueur</th>${r.colonnes.map(c => `<th title="${esc(c.libelle)}" style="text-align:center">${fmtDate(c.date).slice(0, 5)}<br><span style="font-size:11px;font-weight:400">${c.categorie === 'entrainement' ? '🏋️' : '⚽'}</span></th>`).join('')}<th>Présences</th></tr>
      ${r.joueurs.map(j => `<tr><td>${pas(j)}${esc(j.nom)}</td>${r.colonnes.map(c => `<td><span class="trk-dot ${j.presents.includes(c.cle) ? 'p' : 'a'}"></span></td>`).join('')}<td><b>${j.nb_presents}/${j.nb_matchs}</b> · ${j.taux_pct}%</td></tr>`).join('')}
      <tr><td><b>Total présents</b></td>${r.colonnes.map(c => `<td><b>${c.nb_presents}</b></td>`).join('')}<td></td></tr></table></div>`;
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
    const LIB = { joueur_ajout: 'Joueur ajouté', joueur_retrait: 'Joueur retiré', joueur_modification: 'Fiche joueur modifiée', joueur_refuse_mineur: 'Refus (mineur)', match_creation: 'Rencontre créée', match_modification: 'Rencontre modifiée', match_suppression: 'Rencontre supprimée', presents_enregistres: 'Présents enregistrés', notes_enregistrees: 'Notes enregistrées', retardataire_ajoute: 'Retardataire ajouté', seance_creation: 'Entraînement créé', seance_modification: 'Entraînement modifié', seance_suppression: 'Entraînement supprimé', presents_seance: 'Présents de la séance', retardataire_seance: 'Retardataire (séance)', changement_equipe: 'Changement d’équipe', equipes_equilibrees: 'Équipes équilibrées', match_seance: 'Match de séance lancé', score_seance: 'Score de séance', lot_creation: 'Lot créé', prix_creation: 'Prix créé', prix_modification: 'Prix modifié', prix_suppression: 'Prix supprimé', prix_laureat: 'Lauréat désigné', bureau_ajout: 'Membre du bureau ajouté', bureau_retrait: 'Membre du bureau retiré' };
    return `<div class="trk-card"><b>Membres du bureau</b>
      <p class="trk-sub" style="margin:4px 0 8px">Le propriétaire du compte et les membres ajoutés ici peuvent saisir les données. L’association s’en remet à leur bonne foi.</p>
      ${b.length ? `<table>${b.map(x => `<tr><td>${esc(nomJ(x))} <span class="trk-sub">${esc(x.email)}</span></td><td style="text-align:right">${ctx.estProprietaire ? `<button class="trk-btn danger" data-trk="retirer-bureau" data-id="${x.id}">Retirer</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="trk-sub">Aucun membre supplémentaire.</p>'}
      ${ctx.estProprietaire ? `<div class="trk-row" style="margin-top:10px"><div class="trk-grow"><label>E-mail d’un compte Diaspo’Actif</label><input type="email" id="trk-b-email" style="width:100%"></div><button class="trk-btn" data-trk="ajout-bureau">Ajouter au bureau</button></div>` : ''}</div>
    <div class="trk-card"><b>Historique des modifications</b><p class="trk-sub" style="margin:4px 0 8px">Qui a fait quoi, et quand (100 dernières actions).</p>
      ${h.length ? `<div class="trk-scroll"><table>${h.map(x => `<tr><td>${esc(String(x.created_at || '').slice(0, 16))}</td><td>${esc(nomJ(x))}</td><td>${esc(LIB[x.action] || x.action)}</td><td>${esc(x.cible || '')} <span class="trk-sub">${esc(x.detail || '')}</span></td></tr>`).join('')}</table></div>` : '<p class="trk-sub">Rien pour le moment.</p>'}</div>`;
  }

  /* ---------------- actions ---------------- */
  const val = (id) => { const e = root.querySelector('#' + id); return e ? e.value : ''; };
  const num = (id) => { const v = val(id); return v === '' ? null : Number(v); };
  const val_ = (sel) => { const e = root.querySelector(sel); return e ? e.value : ''; };
  async function agir(fn, ok) {
    try { const r = await fn(); if (ok) dire('ok', typeof ok === 'function' ? ok(r) : ok); } catch (e) { dire('err', e.message || 'Erreur.'); }
    await rendre();
  }
  function collecterPresents() {
    return Array.from(root.querySelectorAll('[data-trk-pres]')).filter(c => c.checked).map(c => ({ joueur_id: Number(c.dataset.trkPres), poste_joue: val_(`[data-trk-po="${c.dataset.trkPres}"]`) }));
  }
  function collecterNotes() {
    const out = {};
    root.querySelectorAll('[data-trk-n]').forEach(e => { const id = e.dataset.trkN; out[id] = out[id] || { joueur_id: Number(id) }; out[id][e.dataset.k] = e.value; });
    return Object.values(out);
  }

  function brancher() {
    root.querySelectorAll('[data-trk-tab]').forEach(b => b.onclick = () => { tab = b.dataset.trkTab; matchOuvert = null; seanceOuverte = null; prixOuvert = null; ficheOuverte = null; ficheAside = null; rendre(); });
    root.querySelectorAll('[data-trk-fp]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
      const inp = g.querySelector('input'); inp.value = b.dataset.v;
      g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    }));
    root.querySelectorAll('[data-trk]').forEach(el => el.onclick = () => action(el));
    root.querySelectorAll('[data-trk-move]').forEach(sel => sel.onchange = () => agir(() => call('PUT', `/tracker/seances/${seanceOuverte}/joueurs/${sel.dataset.trkMove}/equipe`, { equipe_id: sel.value ? Number(sel.value) : null }),
      r => r.bonus_fair_play ? 'Joueur déplacé : il garde ses stats et reçoit 1 point de fair-play automatique sur son prochain match.' : 'Joueur déplacé.'));
    const rj = root.querySelector('#trk-r-j'), rp = root.querySelector('#trk-r-po');
    if (rj && root.querySelector('#trk-r-eq')) {
      const maj = async () => {
        try {
          const r = await call('GET', `/tracker/seances/${seanceOuverte}/suggestion?joueur_id=${rj.value}&poste=${rp.value}`);
          if (r.suggestion) { root.querySelector('#trk-r-eq').value = r.suggestion.equipe_id; root.querySelector('#trk-r-sugg').innerHTML = `💡 Proposition : <b>${esc(r.suggestion.nom)}</b> — ${esc(r.suggestion.raison)}. Vous pouvez choisir une autre équipe.`; }
        } catch (e) { /* proposition facultative */ }
      };
      rj.onchange = async () => { const j = (await charger(() => call('GET', '/tracker/joueurs'))); const f = j && j.joueurs.find(x => String(x.id) === rj.value); if (f && f.poste_habituel) rp.value = f.poste_habituel; maj(); };
      rp.onchange = maj; maj();
    }
  }

  async function action(el) {
    const a = el.dataset.trk, id = el.dataset.id;
    if (a === 'pt') return pointRapide(el);
    if (a === 'terrain-equipe') { const e = el.dataset.e; if (terrain.ouvertes.has(e)) terrain.ouvertes.delete(e); else terrain.ouvertes.add(e); return majTerrain(); }
    if (a === 'terrain-joueur') { const j = Number(el.dataset.j); terrain.sel = terrain.sel === j ? null : j; return majTerrain(); }
    if (a === 'fermer-joueur') { terrain.sel = null; return majTerrain(); }
    if (a === 'aide-joga') { aideJoga = !aideJoga; if (terrain && terrain.sel && root.querySelector('#trk-terrain')) return majTerrain(); dire('ok', AIDE_JOGA); return rendre(); }
    if (a === 'choisir-creation') { creation = creation === el.dataset.c ? null : el.dataset.c; return rendre(); }
    if (a === 'filtre-cat') { filtreCat = el.dataset.c; return rendre(); }
    if (a === 'retour-accueil') { matchOuvert = null; seanceOuverte = null; ficheOuverte = null; return rendre(); }
    if (a === 'creer-match') return agir(async () => {
      const r = await call('POST', '/tracker/matchs', { date_match: val('trk-m-date'), adversaire: val('trk-m-adv'), lieu: val('trk-m-lieu'), reprendre_presents: root.querySelector('#trk-m-reprendre').checked, cartons: collecterCartons() });
      matchOuvert = r.id; creation = null;
      dire('ok', r.presents_repris ? `Rencontre créée, ${r.presents_repris} présent(s) repris.` : 'Rencontre créée. Inscrivez maintenant les présents.');
    });
    if (a === 'creer-seance') return agir(async () => {
      const r = await call('POST', '/tracker/seances', { date_seance: val('trk-s-date'), nb_equipes: Number(val('trk-s-nb')), regle: val('trk-s-regle'), suivi_auto: val('trk-s-regle') !== 'manuel', cartons: collecterCartons() });
      seanceOuverte = r.id; vueSeance = 'presents'; creation = null;
      dire('ok', 'Entraînement créé. Inscrivez d’abord les personnes présentes.');
    });
    if (a === 'ouvrir-match') { matchOuvert = Number(id); return rendre(); }
    if (a === 'ouvrir-seance') { seanceOuverte = Number(id); vueSeance = 'presents'; ficheOuverte = null; return rendre(); }
    if (a === 'ouvrir-match-seance') { retourSeance = seanceOuverte; matchOuvert = Number(id); seanceOuverte = null; return rendre(); }
    if (a === 'retour-seance') { seanceOuverte = retourSeance; matchOuvert = null; vueSeance = 'matchs'; return rendre(); }
    if (a === 'sous-onglet') { vueSeance = el.dataset.v; return rendre(); }
    if (a === 'fiche-aside') { ficheOuverte = Number(id); return rendre(); }
    if (a === 'fermer-aside') { ficheOuverte = null; return rendre(); }
    if (a === 'tout-cocher') { root.querySelectorAll('[data-trk-pres]').forEach(c => c.checked = true); return; }
    if (a === 'save-presents') return agir(() => call('PUT', `/tracker/matchs/${matchOuvert}/presents`, { presents: collecterPresents() }), 'Présents enregistrés. Vous pouvez maintenant les noter.');
    if (a === 'retardataire-match') return agir(() => call('POST', `/tracker/matchs/${matchOuvert}/retardataire`, { joueur_id: Number(val('trk-r-j')), poste_joue: val('trk-r-po') }), 'Retardataire ajouté aux présents : il peut maintenant être noté.');
    if (a === 'save-notes') return agir(() => call('PUT', `/tracker/matchs/${matchOuvert}/notes`, { notes: collecterNotes() }), 'Notes enregistrées. Les classements sont à jour.');
    if (a === 'save-score') return agir(() => call('PUT', '/tracker/matchs/' + matchOuvert, { score_pour: val('trk-sc-a'), score_contre: val('trk-sc-b') }), 'Score enregistré : la suite de l’enchaînement est mise à jour.');
    if (a === 'save-match') return agir(() => call('PUT', '/tracker/matchs/' + matchOuvert, { date_match: val('trk-e-date'), adversaire: val('trk-e-adv'), lieu: val('trk-e-lieu'), score_pour: val('trk-e-sp'), score_contre: val('trk-e-sc') }), 'Rencontre modifiée.');
    if (a === 'suppr-match') { if (!confirm('Supprimer cette rencontre et toutes ses notes ?')) return; return agir(async () => { await call('DELETE', '/tracker/matchs/' + matchOuvert); matchOuvert = null; }, 'Rencontre supprimée.'); }

    if (a === 'save-presents-seance') return agir(() => call('PUT', `/tracker/seances/${seanceOuverte}/presents`, { presents: collecterPresents() }), () => { vueSeance = 'equipes'; return 'Présents enregistrés. Montez maintenant les équipes.'; });
    if (a === 'retardataire-seance') return agir(() => call('POST', `/tracker/seances/${seanceOuverte}/retardataire`, { joueur_id: Number(val('trk-r-j')), poste_joue: val('trk-r-po'), equipe_id: Number(val('trk-r-eq')) }),
      r => `Retardataire ajouté${r.suggestion && Number(val('trk-r-eq')) !== r.suggestion.equipe_id ? '' : ' dans l’équipe proposée'}.`);
    if (a === 'equilibrer') return agir(() => call('POST', `/tracker/seances/${seanceOuverte}/equilibrer`, {}), 'Équipes réparties de façon équilibrée, poste par poste.');
    if (a === 'ajout-equipe') return agir(() => call('POST', `/tracker/seances/${seanceOuverte}/equipes`, {}), 'Équipe ajoutée.');
    if (a === 'save-noms') return agir(() => call('PUT', '/tracker/seances/' + seanceOuverte, { equipes: Array.from(root.querySelectorAll('[data-trk-eqnom]')).map(i => ({ id: Number(i.dataset.trkEqnom), nom: i.value })) }), 'Noms des équipes enregistrés.');
    if (a === 'save-reglage') return agir(() => call('PUT', '/tracker/seances/' + seanceOuverte, { regle: val('trk-s-regle'), suivi_auto: root.querySelector('#trk-s-auto').checked }), 'Réglage enregistré.');
    if (a === 'ordre') {
      const d = await charger(() => call('GET', '/tracker/seances/' + seanceOuverte)); if (!d) return rendre();
      const o = d.ordre.slice(), i = o.indexOf(Number(id)), j = i + Number(el.dataset.dir);
      if (i < 0 || j < 0 || j >= o.length) return;
      [o[i], o[j]] = [o[j], o[i]];
      return agir(() => call('PUT', '/tracker/seances/' + seanceOuverte, { ordre: o }), 'Ordre de passage modifié.');
    }
    if (a === 'lancer-auto') return agir(() => call('POST', `/tracker/seances/${seanceOuverte}/matchs`, { auto: true }), r => `Match lancé avec ${r.joueurs} joueur(s). Saisissez le score à la fin.`);
    if (a === 'lancer-manuel') return agir(() => call('POST', `/tracker/seances/${seanceOuverte}/matchs`, { equipe_a_id: Number(val('trk-mm-a')), equipe_b_id: Number(val('trk-mm-b')) }), r => `Match lancé avec ${r.joueurs} joueur(s).`);
    if (a === 'suppr-seance') { if (!confirm('Supprimer cet entraînement, ses équipes, ses matchs et toutes les notes ?')) return; return agir(async () => { await call('DELETE', '/tracker/seances/' + seanceOuverte); seanceOuverte = null; }, 'Entraînement supprimé.'); }

    if (a === 'fiche-joueur') { ficheOuverte = Number(id); return rendre(); }
    if (a === 'fermer-fiche') { ficheOuverte = null; return rendre(); }
    if (a === 'save-fiche') return agir(async () => { await call('PUT', '/tracker/joueurs/' + id, { nom: val('trk-f-nom'), prenom: val('trk-f-prenom'), email: val('trk-f-email'), poste_habituel: val('trk-f-p1'), poste_2: val('trk-f-p2') }); ficheOuverte = null; }, 'Fiche enregistrée.');
    if (a === 'ajout-adh') {
      const liste = JSON.parse(root.querySelector('#trk-attest').textContent); const x = liste[Number(el.dataset.i)];
      if (!confirm(`J’atteste que ${nomJ(x)} est majeur(e) (18 ans ou plus).`)) return;
      return agir(() => call('POST', '/tracker/joueurs', { user_id: x.user_id, adhesion_membre_id: x.adhesion_membre_id, nom: x.nom, prenom: x.prenom, email: x.email, majeur_atteste: true }), 'Joueur ajouté.');
    }
    if (a === 'ajout-manuel') return agir(() => call('POST', '/tracker/joueurs', { nom: val('trk-j-nom'), prenom: val('trk-j-prenom'), email: val('trk-j-email'), poste_habituel: val('trk-j-poste'), poste_2: val('trk-j-poste2'), majeur_atteste: root.querySelector('#trk-j-maj').checked }), 'Joueur ajouté.');
    if (a === 'retirer-joueur') { if (!confirm(`Retirer ${el.dataset.nom} ? Toutes ses notes et statistiques seront supprimées.`)) return; return agir(() => call('DELETE', '/tracker/joueurs/' + id), 'Joueur retiré (notes supprimées).'); }

    if (a === 'choisir-modele') { brouillonPrix = { modele: el.dataset.m }; return rendre(); }
    if (a === 'creer-prix') {
      const regle = { min_matchs: num('trk-p-min'), poids: {}, membres_a_jour: root.querySelector('#trk-p-ajour').checked,
        categories: [root.querySelector('#trk-p-cat-match').checked ? 'match' : null, root.querySelector('#trk-p-cat-ent').checked ? 'entrainement' : null].filter(Boolean) };
      root.querySelectorAll('[id^="trk-w-"]').forEach(e => { regle.poids[e.id.replace('trk-w-', '')] = Number(e.value); });
      if (root.querySelector('#trk-p-jogamode')) regle.joga_mode = val('trk-p-jogamode');
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
