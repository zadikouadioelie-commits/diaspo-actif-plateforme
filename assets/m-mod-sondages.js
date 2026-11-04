/* ============================================================
   Diaspo'Actif — Version téléphone : module « Sondages & Consultations »
   Route : #/sondages                liste (ouverts, filtrables, publics)
           #/sondages/voir/ID        détail : participer, résultats, réactions, commentaires
           #/sondages/mes            mes sondages (comptes Initiative, Collectivité, Administrateur)
           #/sondages/nouveau        création (mêmes comptes)
   Mêmes routes d'API et mêmes règles que sondages.html (site) : un sondage dure 30 jours
   maximum par période de publication ; une fois terminé il reste visible (« Fin de ce
   sondage ») mais n'accepte plus de réponses, jusqu'à une republication.
   Chargé APRÈS m.js : s'appuie uniquement sur window.MApp.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast } = A;
  window.MMods = window.MMods || {};

  const NOM = 'Sondages';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const SK = '<div class="sk skc" style="height:96px"></div><div class="sk skc" style="height:96px"></div><div class="sk skc" style="height:96px"></div>';
  const ROLES_CREATION = ['initiative', 'collectivite', 'administrateur'];

  const CAT_LABELS = { consultation_citoyenne: 'Consultation citoyenne', projet: 'Projet', emploi: 'Emploi', formation: 'Formation', culture: 'Culture', tourisme: 'Tourisme', investissement: 'Investissement', sante: 'Santé', numerique: 'Numérique', education: 'Éducation', environnement: 'Environnement', autre: 'Sondage' };
  const CATEGORIES = ['consultation_citoyenne', 'projet', 'emploi', 'formation', 'culture', 'investissement', 'sante', 'numerique', 'education', 'environnement', 'autre'];
  const RAYONS = [['national', 'National'], ['international', 'International'], ['region', 'Région'], ['departement', 'Département'], ['ville', 'Ville']];
  const CONFS = [['anonyme', 'Anonymes'], ['nominatif', 'Nominatifs']];
  const VISIBS = [['apres_cloture', 'Après clôture'], ['temps_reel', 'En temps réel'], ['createur', 'Créateur uniquement'], ['public', 'Publics']];
  const Q_TYPES = [['choix_unique', 'Choix unique'], ['choix_multiple', 'Choix multiples'], ['oui_non', 'Oui / Non'], ['texte_libre', 'Réponse libre'], ['texte_long', 'Texte long'], ['echelle_5', 'Échelle 1-5'], ['echelle_10', 'Échelle 1-10'], ['etoiles', 'Étoiles'], ['nombre', 'Nombre'], ['date', 'Date']];
  const STATUT_LABELS = { ouvert: 'En cours', cloture: 'Fin de ce sondage', brouillon: 'Brouillon', archive: 'Archivé' };
  const DUREE_MAX = 30;

  function css() {
    if ($('#m-mod-sondages-css')) return;
    const s = document.createElement('style');
    s.id = 'm-mod-sondages-css';
    s.textContent = `
.mso-cat{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;background:var(--border);color:var(--text)}
.mso-tabs{display:flex;gap:0;border-bottom:1.5px solid var(--border);margin-bottom:12px}
.mso-tab{flex:1;padding:10px 4px;font-size:13px;font-weight:700;text-align:center;background:none;border:none;border-bottom:3px solid transparent;color:var(--muted);cursor:pointer}
.mso-tab.on{color:var(--navy2);border-bottom-color:var(--navy2)}
.mso-card{display:block;color:inherit}
.mso-card .pad{padding:14px}
.mso-q{background:var(--card2,var(--bg));border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px}
.mso-q label{display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer;font-size:14px}
.mso-q input[type=text],.mso-q input[type=number],.mso-q input[type=date],.mso-q textarea{width:100%;box-sizing:border-box;min-height:44px;padding:9px 11px;border:1px solid var(--border);border-radius:10px;font-size:16px;background:#fff;color:var(--text)}
.mso-q textarea{min-height:90px;resize:vertical}
.mso-bar{height:8px;border-radius:4px;background:var(--border);overflow:hidden;margin-top:4px}
.mso-bar i{display:block;height:100%;background:var(--navy2)}
.mso-res{margin-bottom:12px}
.mso-res .row{display:flex;justify-content:space-between;font-size:13px;margin-top:3px}
.mso-com{display:flex;gap:10px;margin-bottom:10px}
.mso-com .av{width:30px;height:30px;border-radius:50%;background:var(--border);flex:none;display:flex;align-items:center;justify-content:center;font-size:12px}
.mso-com .bub{flex:1;background:var(--card2,var(--bg));border-radius:12px;padding:8px 12px}
.mso-f label.mso-l{display:block;font-weight:700;font-size:13.5px;margin:14px 2px 5px}
.mso-f label.mso-l small{font-weight:400;color:var(--muted)}
.mso-f input[type=text],.mso-f input[type=date],.mso-f select,.mso-f textarea{display:block;width:100%;min-width:0;min-height:46px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:#fff;font-size:16px;color:var(--text);box-sizing:border-box}
.mso-f textarea{min-height:90px;resize:vertical;line-height:1.4}
.mso-f [aria-invalid=true]{border-color:var(--red);background:var(--red-l)}
.mso-err{color:var(--red);font-size:13px;margin:4px 2px 0}
.mso-err:empty{display:none}
.mso-gerr{background:var(--red-l);color:var(--red);border-radius:12px;padding:10px 14px;font-weight:600;font-size:14px;margin-bottom:12px}
.mso-gerr:empty{display:none}
.mso-opt{display:flex;gap:12px;align-items:flex-start;border:1.5px solid var(--border);background:#fff;border-radius:14px;padding:12px;margin-bottom:8px;cursor:pointer}
.mso-opt.on{border-color:var(--navy2);background:var(--sky-l)}
.mso-opt input{margin:3px 0 0;width:20px;height:20px;flex:none;accent-color:var(--navy2)}
.mso-opt b{display:block;font-size:15px}
.mso-opt small{display:block;color:var(--muted);font-size:12.5px;line-height:1.3}
.mso-hint{font-size:12.5px;color:var(--muted);margin:6px 2px;line-height:1.4}
.mso-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.mso-stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px;text-align:center}
.mso-stat b{display:block;font-size:18px;color:var(--navy2)}
.mso-stat span{font-size:11px;color:var(--muted)}
`;
    document.head.appendChild(s);
  }

  /* ---------- outils ---------- */
  let rendu = 0;
  const vivant = t => t === rendu && /^#\/sondages/.test(location.hash);
  const paint = (t, titre, html, foot) => { if (vivant(t)) setPane(titre, html, foot); };
  const pl = (n, un, plus) => n + ' ' + (n > 1 ? plus : un);
  function fmtDate(s) { const p = A.parseDay(s); if (!p) return '—'; return p.d + ' ' + ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][p.m - 1] + ' ' + p.y; }
  function joursRestants(d) { if (!d) return null; return Math.ceil((new Date(String(d).slice(0, 10) + 'T23:59:59') - new Date()) / 86400000); }

  function gate(titre) {
    if (!S.me) {
      setPane(titre, A.loginCard('Connectez-vous avec votre compte Initiative, Collectivité ou Administrateur pour créer et gérer des sondages.'));
      const b = $('#go-login'); if (b) b.onclick = () => A.openLogin();
      return false;
    }
    if (!ROLES_CREATION.includes(S.me.role)) {
      setPane(titre, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Réservé aux comptes organisateurs</b>La création de sondages est proposée aux comptes Initiative, Collectivité et Administrateur. Vous êtes connecté avec un autre type de compte.<br><br><a class="btn" href="#/sondages">Voir les sondages ouverts</a></div>`);
      return false;
    }
    return true;
  }
  function showError(t, titre, e, titreErreur, retry) {
    if (!vivant(t)) return;
    if (e && e.status === 401) { S.me = null; return gate(titre); }
    setPane(titre, `<div class="empty"><div class="ei">${ic('close', 'l')}</div><b>${esc(titreErreur)}</b>${esc((e && e.message) || 'Une erreur est survenue.')}<br><br><button class="btn sm" id="mso-retry">Réessayer</button></div>`);
    const r = $('#mso-retry'); if (r) r.onclick = retry;
  }

  /* ---------- aiguillage ---------- */
  window.MMods.sondages = function (b, c) {
    const t = ++rendu; css();
    if (!b) return liste(t);
    if (b === 'voir' && /^\d+$/.test(c || '')) return detail(t, Number(c));
    if (b === 'mes') return mesSondages(t);
    if (b === 'nouveau') return formulaire(t);
    location.replace('#/sondages');
  };

  /* ============================================================
     LISTE (publique)
     ============================================================ */
  const ST = { q: '', cat: '', items: [] };
  function carte(s) {
    const jours = joursRestants(s.date_cloture);
    const fini = s.statut !== 'ouvert';
    return `<a class="card mso-card" href="#/sondages/voir/${Number(s.id)}"><div class="pad">
      <div class="row" style="align-items:flex-start"><span class="mso-cat">${esc(CAT_LABELS[s.categorie] || 'Sondage')}</span><span class="sp"></span>${fini ? '<span class="small muted">Fin de ce sondage</span>' : (jours !== null ? `<span class="small" style="color:${jours <= 3 ? 'var(--red)' : 'var(--muted)'}">${jours > 1 ? jours + ' j restants' : 'Dernier jour'}</span>` : '')}</div>
      <div style="font-weight:700;font-size:15.5px;margin-top:8px;word-break:break-word">${esc(s.titre)}</div>
      ${s.description ? `<p class="small muted" style="margin:4px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(A.strip(s.description))}</p>` : ''}
      <div class="small muted" style="margin-top:8px">🏛️ ${esc(s.createur_nom || '—')} · ${s.nb_questions || 0} question${s.nb_questions > 1 ? 's' : ''}</div>
      <div class="row small muted" style="margin-top:4px;justify-content:space-between"><span>👥 ${s.nb_reponses || 0} participant${s.nb_reponses > 1 ? 's' : ''}</span><span>👁️ ${s.nb_vues || 0} · ❤️ ${s.nb_reactions || 0}</span></div>
    </div></a>`;
  }
  function renderListe() {
    const box = $('#mso-grid'); if (!box) return;
    const q = ST.q.toLowerCase();
    const l = ST.items.filter(s => (!q || s.titre.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)) && (!ST.cat || s.categorie === ST.cat));
    box.innerHTML = l.length ? l.map(carte).join('') : `<div class="empty"><div class="ei">${ic('doc', 'l')}</div><b>Aucun sondage</b>${q || ST.cat ? 'Essayez un autre mot-clé ou une autre catégorie.' : 'Aucun sondage ouvert pour le moment.'}</div>`;
  }
  async function liste(t) {
    const peutCreer = S.me && ROLES_CREATION.includes(S.me.role);
    setPane(NOM, `<div class="search">${ic('search', 's')}<input id="mso-q" type="search" placeholder="Rechercher un sondage…" aria-label="Rechercher un sondage"></div>
      <select id="mso-cat" aria-label="Filtrer par catégorie" style="width:100%;box-sizing:border-box;min-height:44px;padding:0 10px;border:1px solid var(--border);border-radius:10px;background:#fff;font-size:15px;margin:8px 0 12px">
        <option value="">Toutes catégories</option>${CATEGORIES.map(c => `<option value="${c}">${esc(CAT_LABELS[c])}</option>`).join('')}
      </select>
      ${peutCreer ? `<a class="btn out block" href="#/sondages/mes" style="margin-bottom:12px">${ic('doc', 's')} Mes sondages</a>` : ''}
      <div id="mso-grid">${SK}</div>`, peutCreer ? `<a class="btn block" href="#/sondages/nouveau">${ic('plus', 's')} Créer un sondage</a>` : '');
    const qi = $('#mso-q'), ci = $('#mso-cat');
    if (qi) qi.oninput = () => { ST.q = qi.value.trim(); renderListe(); };
    if (ci) ci.onchange = () => { ST.cat = ci.value; renderListe(); };
    try { ST.items = (await api('/api/sondages')).sondages || []; }
    catch (e) { return showError(t, NOM, e, 'Impossible de charger les sondages', () => liste(++rendu)); }
    if (!vivant(t)) return;
    renderListe();
  }

  /* ============================================================
     MES SONDAGES
     ============================================================ */
  async function mesSondages(t) {
    if (!gate('Mes sondages')) return;
    setPane('Mes sondages', SK, `<a class="btn block" href="#/sondages/nouveau">${ic('plus', 's')} Créer un sondage</a>`);
    let rows;
    try { rows = (await api('/api/sondages?mine=1')).sondages || []; }
    catch (e) { return showError(t, 'Mes sondages', e, 'Impossible de charger vos sondages', () => mesSondages(++rendu)); }
    if (!vivant(t)) return;
    const html = rows.length ? rows.map(s => {
      const st = STATUT_LABELS[s.statut] || s.statut;
      return `<a class="card mso-card" href="#/sondages/voir/${Number(s.id)}"><div class="pad">
        <div class="row" style="align-items:flex-start"><div class="sp"><span class="mso-cat">${esc(CAT_LABELS[s.categorie] || 'Sondage')}</span><div style="font-weight:700;font-size:15px;margin-top:4px;word-break:break-word">${esc(s.titre)}</div><div class="small muted">${s.statut === 'ouvert' ? 'Fin le ' : 'Terminé le '}${fmtDate(s.date_cloture)} · ${s.nb_reponses || 0} réponse${s.nb_reponses > 1 ? 's' : ''}</div></div><span class="badge ${s.statut === 'ouvert' ? 'g' : ''}">${esc(st)}</span></div>
      </div></a>`;
    }).join('') : `<div class="empty"><div class="ei">${ic('doc', 'l')}</div><b>Vous n’avez pas encore créé de sondage</b>Créez-en un pour consulter votre communauté.</div>`;
    paint(t, 'Mes sondages', html, `<a class="btn block" href="#/sondages/nouveau">${ic('plus', 's')} Créer un sondage</a>`);
  }

  /* ============================================================
     DÉTAIL
     ============================================================ */
  function renderQ(q, i) {
    const opts = JSON.parse(q.options_json || '[]');
    let inner = '';
    if (q.type === 'oui_non') {
      inner = `<label><input type="radio" name="q_${q.id}" value="oui"> Oui</label><label><input type="radio" name="q_${q.id}" value="non"> Non</label>`;
    } else if (q.type === 'choix_unique') {
      inner = opts.map(o => `<label><input type="radio" name="q_${q.id}" value="${esc(o)}"> ${esc(o)}</label>`).join('');
    } else if (q.type === 'choix_multiple') {
      inner = opts.map(o => `<label><input type="checkbox" name="q_${q.id}" value="${esc(o)}"> ${esc(o)}</label>`).join('');
    } else if (['echelle_5', 'echelle_10', 'etoiles'].includes(q.type)) {
      const max = q.type === 'echelle_10' ? 10 : 5;
      let r = '<div class="row" style="flex-wrap:wrap;gap:10px">';
      for (let v = 1; v <= max; v++) r += `<label style="flex-direction:column;text-align:center"><input type="radio" name="q_${q.id}" value="${v}"><span class="small">${v}</span></label>`;
      inner = r + '</div>';
    } else if (q.type === 'texte_long') {
      inner = `<textarea name="q_${q.id}" placeholder="Votre réponse…"></textarea>`;
    } else {
      inner = `<input type="${q.type === 'date' ? 'date' : q.type === 'nombre' ? 'number' : 'text'}" name="q_${q.id}" placeholder="Votre réponse…">`;
    }
    return `<div class="mso-q"><div style="font-weight:700;font-size:14px;margin-bottom:8px">${i + 1}. ${esc(q.texte)} ${q.obligatoire ? '<span style="color:var(--red)">*</span>' : ''}</div>${inner}</div>`;
  }
  async function detail(t, id) {
    setPane(NOM, SK);
    api('/api/sondages/' + id + '/view', { method: 'POST' }).catch(() => { });
    let r;
    try { r = await api('/api/sondages/' + id); }
    catch (e) { return showError(t, NOM, e, 'Sondage introuvable', () => detail(++rendu, id)); }
    if (!vivant(t)) return;
    const s = r.sondage, qs = r.questions || [], maP = r.ma_participation;
    const estCreateur = S.me && (S.me.id === s.createur_id || S.me.role === 'administrateur');
    const ferme = s.statut !== 'ouvert';
    const dejaRepondu = !!maP;
    const peutParticiper = S.me && !ferme && !dejaRepondu;
    const html = `<div class="card"><div class="pad">
        <span class="mso-cat">${esc(CAT_LABELS[s.categorie] || 'Sondage')}</span>
        <h2 style="margin:8px 0 2px;font-size:19px;word-break:break-word">${esc(s.titre)}</h2>
        <div class="small muted">Par ${esc(s.createur_nom || '—')} · Clôture le ${fmtDate(s.date_cloture)}</div>
        ${s.description ? `<p class="small" style="white-space:pre-line;word-break:break-word;margin:10px 0 0">${esc(A.strip(s.description))}</p>` : ''}
        <div class="mso-stats"><div class="mso-stat"><b>${s.nb_reponses || 0}</b><span>réponses</span></div><div class="mso-stat"><b>${s.nb_vues || 0}</b><span>vues</span></div><div class="mso-stat"><b>${s.nb_reactions || 0}</b><span>réactions</span></div></div>
      </div></div>
      ${s.statut === 'cloture' ? `<div class="mso-hint" style="background:var(--orange-l);color:var(--orange-d);border-radius:12px;padding:10px 12px">⏹️ <b>Fin de ce sondage</b> — il n’accepte plus de réponses.${estCreateur ? ' Republiez-le pour le réactiver.' : ''}</div>` : ''}
      ${s.statut === 'brouillon' ? `<div class="mso-hint" style="background:var(--border);border-radius:12px;padding:10px 12px">📝 Brouillon : ce sondage n’est pas encore publié.</div>` : ''}
      ${dejaRepondu && !ferme ? `<div class="mso-hint" style="background:var(--green-l,#d1fae5);color:var(--green-d,#065f46);border-radius:12px;padding:10px 12px;font-weight:700">✅ Vous avez déjà répondu.</div>` : ''}
      ${peutParticiper ? `<form id="mso-form">${qs.map((q, i) => renderQ(q, i)).join('')}<button type="button" class="btn block" id="mso-submit" style="margin-top:4px">✅ Soumettre</button></form>` : ''}
      ${(ferme || dejaRepondu) ? `<button type="button" class="btn out block" id="mso-res-btn" style="margin-top:4px">📊 Voir les résultats</button><div id="mso-res"></div>` : ''}
      ${!S.me && !ferme ? `<div class="mso-hint" style="background:var(--sky-l);border-radius:12px;padding:10px 12px">🔑 <a href="#" id="mso-login" style="font-weight:700">Connectez-vous</a> pour participer.</div>` : ''}
      <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
        <button type="button" class="btn out sm" id="mso-rxn">❤️ ${s.nb_reactions || 0}</button>
        <button type="button" class="btn out sm" id="mso-fav">⭐ ${s.est_favori ? 'Sauvegardé' : 'Favoris'}</button>
        <button type="button" class="btn out sm" id="mso-share">${ic('share', 's')} Partager</button>
      </div>
      ${estCreateur ? `<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
        <button type="button" class="btn out sm" id="mso-stats-btn">📊 Statistiques</button>
        ${!ferme ? `<button type="button" class="btn out sm" id="mso-cloturer">🔒 Clôturer</button>` : ''}
        ${s.statut === 'cloture' ? `<button type="button" class="btn out sm" id="mso-republier">🔁 Republier</button>` : ''}
        ${s.statut === 'brouillon' ? `<button type="button" class="btn sm" id="mso-publier">🚀 Publier</button>` : ''}
        <button type="button" class="btn out sm" id="mso-export">⬇️ Export CSV</button>
      </div><div id="mso-stats-box"></div>` : ''}
      <div class="h2" style="margin-top:16px">COMMENTAIRES</div>
      <div id="mso-coms"></div>
      ${S.me ? `<div class="row" style="gap:8px;margin-top:8px"><input type="text" id="mso-com-in" placeholder="Votre commentaire…" style="flex:1;min-height:44px;padding:0 12px;border:1px solid var(--border);border-radius:10px;font-size:15px"><button type="button" class="btn sm" id="mso-com-send">Envoyer</button></div>` : ''}`;
    paint(t, NOM, html);

    const rxn = $('#mso-rxn'); if (rxn) rxn.onclick = async () => {
      if (!(await needLoginSond())) return;
      try { const rr = await api('/api/sondages/' + id + '/reaction', { method: 'POST', body: { type: 'jaime' } }); rxn.textContent = '❤️ ' + rr.nb_reactions; } catch (e) { }
    };
    const fav = $('#mso-fav'); if (fav) fav.onclick = async () => {
      if (!(await needLoginSond())) return;
      try { const rr = await api('/api/sondages/' + id + '/favori', { method: 'POST' }); fav.textContent = '⭐ ' + (rr.est_favori ? 'Sauvegardé' : 'Favoris'); } catch (e) { }
    };
    const sh = $('#mso-share'); if (sh) sh.onclick = () => partager(location.origin + '/sondages.html?id=' + id, s.titre);
    const lg = $('#mso-login'); if (lg) lg.onclick = ev => { ev.preventDefault(); A.openLogin(); };
    const sub = $('#mso-submit'); if (sub) sub.onclick = () => soumettre(t, id, qs);
    const rb = $('#mso-res-btn'); if (rb) rb.onclick = () => chargerResultats(id);
    chargerCommentaires(id);
    const ci = $('#mso-com-send'); if (ci) ci.onclick = () => poster(id);

    if (estCreateur) {
      const sb = $('#mso-stats-btn'); if (sb) sb.onclick = () => chargerStats(id);
      const cl = $('#mso-cloturer'); if (cl) cl.onclick = () => cloturer(t, id);
      const rp = $('#mso-republier'); if (rp) rp.onclick = () => republier(t, id, false);
      const pb = $('#mso-publier'); if (pb) pb.onclick = () => republier(t, id, true);
      const ex = $('#mso-export'); if (ex) ex.onclick = () => { window.location.href = '/api/sondages/' + id + '/export'; };
    }
  }
  async function needLoginSond() { if (S.me) return true; A.openLogin(); return false; }
  async function partager(url, titre) {
    try { if (navigator.share) { await navigator.share({ title: titre, text: titre, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Lien copié'); } catch (e) { toast('Partage impossible sur cet appareil.', true); }
  }
  async function soumettre(t, id, qs) {
    const reponses = [];
    for (const q of qs) {
      const radios = $$(`[name="q_${q.id}"]:checked`);
      const checks = radios.filter(r => r.type === 'checkbox');
      const singles = radios.filter(r => r.type === 'radio');
      const txt = $(`[name="q_${q.id}"]:not([type=radio]):not([type=checkbox])`);
      let valeur = null;
      if (singles.length) valeur = singles[0].value;
      else if (checks.length) valeur = checks.map(c => c.value);
      else if (txt && txt.value && txt.value.trim()) valeur = txt.value.trim();
      if (valeur !== null) reponses.push({ question_id: q.id, valeur });
    }
    const btn = $('#mso-submit'); if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      await api('/api/sondages/' + id + '/participer', { method: 'POST', body: { reponses } });
      toast('Réponses enregistrées ✓');
      detail(++rendu, id);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Soumettre'; }
      toast((e && e.message) || 'Erreur lors de l’envoi.', true);
    }
  }
  async function chargerResultats(id) {
    const el = $('#mso-res'); if (!el) return;
    el.innerHTML = '<p class="small muted">Chargement…</p>';
    try {
      const r = await api('/api/sondages/' + id + '/resultats');
      el.innerHTML = (r.resultats || []).map(({ question: q, reponses }) => {
        const total = reponses.reduce((s, x) => s + x.n, 0) || 1;
        return `<div class="mso-res"><div style="font-weight:700;font-size:13.5px;margin-bottom:4px">${esc(q.texte)}</div>${reponses.slice(0, 8).map(rep => {
          const pct = Math.round(rep.n / total * 100);
          const lib = String(rep.reponse || '').replace(/^"|"$/g, '');
          return `<div class="row"><span class="small">${esc(lib)}</span><span class="small" style="font-weight:700">${pct}% (${rep.n})</span></div><div class="mso-bar"><i style="width:${pct}%"></i></div>`;
        }).join('')}</div>`;
      }).join('') || '<p class="small muted">Pas encore de réponses.</p>';
    } catch (e) { el.innerHTML = `<p class="small muted">${esc((e && e.message) || 'Résultats non disponibles.')}</p>`; }
  }
  async function chargerStats(id) {
    const el = $('#mso-stats-box'); if (!el) return;
    el.innerHTML = '<p class="small muted">Chargement…</p>';
    try {
      const r = await api('/api/sondages/' + id + '/stats');
      const s = r.sondage;
      el.innerHTML = `<div class="mso-stats" style="grid-template-columns:repeat(2,1fr)">
        <div class="mso-stat"><b>${s.nb_vues || 0}</b><span>Vues</span></div><div class="mso-stat"><b>${s.nb_reponses || 0}</b><span>Répondants</span></div>
        <div class="mso-stat"><b>${r.taux_participation}%</b><span>Taux</span></div><div class="mso-stat"><b>${s.nb_commentaires || 0}</b><span>Commentaires</span></div>
      </div>
      ${r.par_pays && r.par_pays.length ? `<div class="h2">PAR PAYS</div>${r.par_pays.map(p => `<div class="row small"><span>${esc(p.pays || '—')}</span><span style="font-weight:700">${p.n}</span></div>`).join('')}` : ''}
      ${r.par_type && r.par_type.length ? `<div class="h2">PAR TYPE DE COMPTE</div>${r.par_type.map(x => `<div class="row small"><span>${esc(x.type_compte || '—')}</span><span style="font-weight:700">${x.n}</span></div>`).join('')}` : ''}`;
    } catch (e) { el.innerHTML = `<p class="small muted">${esc((e && e.message) || 'Statistiques indisponibles.')}</p>`; }
  }
  async function chargerCommentaires(id) {
    const el = $('#mso-coms'); if (!el) return;
    try {
      const r = await api('/api/sondages/' + id + '/commentaires');
      const coms = r.commentaires || [];
      el.innerHTML = coms.length ? coms.map(c => `<div class="mso-com">${c.photo_url ? `<img class="av" src="${A.attrUrl(c.photo_url)}" alt="" style="object-fit:cover">` : `<div class="av">👤</div>`}<div class="bub"><div class="small" style="font-weight:700">${esc(c.prenom || '')} ${esc(c.nom || '')}</div><div class="small">${esc(c.contenu)}</div></div></div>`).join('') : '<p class="small muted">Aucun commentaire.</p>';
    } catch (e) { }
  }
  async function poster(id) {
    const inp = $('#mso-com-in'); if (!inp || !inp.value.trim()) return;
    try { await api('/api/sondages/' + id + '/commentaires', { method: 'POST', body: { contenu: inp.value.trim() } }); inp.value = ''; chargerCommentaires(id); }
    catch (e) { toast((e && e.message) || 'Erreur.', true); }
  }
  async function cloturer(t, id) {
    if (!confirm('Clôturer ce sondage ?')) return;
    try { await api('/api/sondages/' + id, { method: 'PUT', body: { statut: 'cloture' } }); toast('Sondage clôturé.'); detail(++rendu, id); }
    catch (e) { toast((e && e.message) || 'Erreur.', true); }
  }
  async function republier(t, id, brouillon) {
    const duree = prompt(brouillon ? 'Publier pour combien de jours (1 à 30) ?' : 'Republier pour combien de jours (1 à 30) ?', String(DUREE_MAX));
    if (duree === null) return;
    const n = parseInt(duree, 10);
    if (!(n >= 1 && n <= DUREE_MAX)) { toast('Durée : de 1 à 30 jours.', true); return; }
    try { const r = await api('/api/sondages/' + id + '/republier', { method: 'POST', body: { duree_jours: n } }); toast(r.message || 'Sondage republié.'); detail(++rendu, id); }
    catch (e) { toast((e && e.message) || 'Erreur.', true); }
  }

  /* ============================================================
     CRÉATION
     ============================================================ */
  let QS = [], QIDX = 0;
  function majFin() {
    const d = $('#mso-debut'), f = $('#mso-fin'); if (!d || !f || !d.value) return;
    const max = new Date(new Date(d.value + 'T00:00:00Z').getTime() + (DUREE_MAX - 1) * 86400000).toISOString().slice(0, 10);
    f.min = d.value; f.max = max; if (f.value && f.value > max) f.value = max;
  }
  function qCard(idx) {
    QS.push({ idx, texte: '', type: 'choix_unique', options: [] });
    const div = document.createElement('div');
    div.className = 'mso-q'; div.id = 'qb-' + idx;
    div.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px"><b class="small">Question ${idx}</b><button type="button" class="btn out sm" data-del-q="${idx}">Retirer</button></div>
      <label class="mso-l" style="margin:4px 0">Texte</label><input type="text" id="qt-${idx}" placeholder="Texte de la question" oninput="document.dispatchEvent(new CustomEvent('mso-qtxt',{detail:{idx:${idx},v:this.value}}))">
      <label class="mso-l" style="margin:8px 0 4px">Type</label>
      <select id="qtype-${idx}">${Q_TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <div id="qopts-${idx}"><div id="qopts-list-${idx}" style="margin-top:8px"></div><button type="button" class="btn out sm" data-add-opt="${idx}" style="margin-top:6px">+ Option</button></div>`;
    $('#mso-qbuilder').appendChild(div);
    document.addEventListener('mso-qtxt', ev => { const q = QS.find(x => x.idx === ev.detail.idx); if (q) q.texte = ev.detail.v; });
    $('#qtype-' + idx).onchange = function () {
      const q = QS.find(x => x.idx === idx); if (q) q.type = this.value;
      $('#qopts-' + idx).style.display = ['choix_unique', 'choix_multiple'].includes(this.value) ? '' : 'none';
    };
    $(`[data-del-q="${idx}"]`).onclick = () => { QS = QS.filter(x => x.idx !== idx); $('#qb-' + idx).remove(); };
    $(`[data-add-opt="${idx}"]`).onclick = () => {
      const q = QS.find(x => x.idx === idx); if (!q) return;
      const oi = q.options.length; q.options.push('');
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin-top:4px';
      row.innerHTML = `<input type="text" placeholder="Option ${oi + 1}" style="flex:1;min-height:40px" oninput="document.dispatchEvent(new CustomEvent('mso-qopt',{detail:{idx:${idx},oi:${oi},v:this.value}}))"><button type="button" class="btn out sm" data-del-opt>×</button>`;
      $('#qopts-list-' + idx).appendChild(row);
      row.querySelector('[data-del-opt]').onclick = () => row.remove();
    };
  }
  document.addEventListener('mso-qopt', ev => { const q = QS.find(x => x.idx === ev.detail.idx); if (q) q.options[ev.detail.oi] = ev.detail.v; });

  async function formulaire(t) {
    if (!gate('Nouveau sondage')) return;
    setPane('Nouveau sondage', SK);
    QS = []; QIDX = 0;
    const auj = new Date().toISOString().slice(0, 10);
    const finDef = new Date(Date.now() + (DUREE_MAX - 1) * 86400000).toISOString().slice(0, 10);
    const html = `<form id="mso-form2" class="mso-f" novalidate autocomplete="off">
      <div class="mso-gerr" id="mso-gerr" role="alert"></div>
      <label class="mso-l" for="mso-titre">Titre *</label>
      <input type="text" id="mso-titre" maxlength="200" placeholder="Ex. : Votre avis sur le projet…" aria-describedby="mso-e-titre"><div class="mso-err" id="mso-e-titre" role="alert"></div>
      <label class="mso-l" for="mso-desc">Description <small>(facultative)</small></label>
      <textarea id="mso-desc" placeholder="Contexte et objectif…"></textarea>
      <label class="mso-l" for="mso-cat">Catégorie</label>
      <select id="mso-cat2">${CATEGORIES.map(c => `<option value="${c}" ${c === 'autre' ? 'selected' : ''}>${esc(CAT_LABELS[c])}</option>`).join('')}</select>
      <label class="mso-l" for="mso-rayon">Rayon de publication</label>
      <select id="mso-rayon">${RAYONS.map(([v, l]) => `<option value="${v}" ${v === 'national' ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="mso-l" for="mso-debut">Date de début</label>
      <input type="date" id="mso-debut" value="${auj}">
      <label class="mso-l" for="mso-fin">Date de fin <small>(30 jours maximum)</small></label>
      <input type="date" id="mso-fin" value="${finDef}">
      <p class="mso-hint">Un sondage reste actif 30 jours au maximum. Une fois terminé, il reste visible (« Fin de ce sondage ») mais n’accepte plus de réponses — vous pourrez le republier depuis « Mes sondages ».</p>
      <label class="mso-opt" id="mso-anon-opt"><input type="checkbox" id="mso-anon"><span><b>Sondage anonyme</b><small>Aucune information personnelle n’est demandée aux répondants sans compte.</small></span></label>
      <label class="mso-l" for="mso-conf">Votes</label>
      <select id="mso-conf">${CONFS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <label class="mso-l" for="mso-vis">Résultats visibles</label>
      <select id="mso-vis">${VISIBS.map(([v, l]) => `<option value="${v}" ${v === 'apres_cloture' ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div class="h2" style="margin-top:16px">QUESTIONS</div>
      <div id="mso-qbuilder"></div>
      <button type="button" class="btn out block" id="mso-addq" style="margin:4px 0 14px">+ Ajouter une question</button>
      <label class="mso-opt" id="mso-pub-opt"><input type="checkbox" id="mso-publier-ck"><span><b>Publier immédiatement</b><small>Sinon, le sondage est enregistré comme brouillon.</small></span></label>
    </form>`;
    setPane('Nouveau sondage', html, `<button class="btn block" id="mso-save">Créer le sondage</button>`);

    $('#mso-debut').onchange = majFin;
    $$('.mso-opt input', $('#mso-form2')).forEach(cb => cb.addEventListener('change', () => cb.closest('.mso-opt').classList.toggle('on', cb.checked)));
    $('#mso-addq').onclick = () => { QIDX++; qCard(QIDX); };
    qCard(++QIDX);

    const val = id => { const x = $('#mso-' + id); return x ? x.value.trim() : ''; };
    const bad = (id, msg) => { const x = $('#mso-' + id), m = $('#mso-e-' + id); if (x) x.setAttribute('aria-invalid', 'true'); if (m) m.textContent = msg; return x; };
    $('#mso-save').onclick = async () => {
      $$('#mso-form2 [aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
      $$('#mso-form2 .mso-err').forEach(x => { x.textContent = ''; }); $('#mso-gerr').textContent = '';
      let first = null;
      if (!val('titre')) first = bad('titre', 'Donnez un titre à votre sondage.');
      const d1 = $('#mso-debut').value, d2 = $('#mso-fin').value;
      if (d1 && d2 && (new Date(d2) - new Date(d1)) / 86400000 > DUREE_MAX - 1) { if (!first) first = $('#mso-fin'); toast('Un sondage dure 30 jours au maximum.', true); }
      const questions = QS.map(q => ({ texte: q.texte, type: q.type, options: (q.options || []).filter(Boolean), obligatoire: true })).filter(q => q.texte.trim());
      if (!questions.length) { toast('Ajoutez au moins une question.', true); if (!first) first = $('#mso-addq'); }
      if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (first.focus) first.focus(); $('#mso-gerr').textContent = 'Certains champs sont à corriger.'; return; }
      const btn = $('#mso-save'); btn.disabled = true; const txt = btn.textContent; btn.textContent = '…';
      try {
        const r = await api('/api/sondages', {
          method: 'POST', body: {
            titre: val('titre'), description: val('desc') || null, categorie: $('#mso-cat2').value,
            rayon_publication: $('#mso-rayon').value, date_debut: d1 || null, date_cloture: d2 || null,
            confidentialite: $('#mso-conf').value, anonyme: $('#mso-anon').checked,
            resultats_visibles: $('#mso-vis').value, statut: $('#mso-publier-ck').checked ? 'ouvert' : 'brouillon', questions
          }
        });
        toast('Sondage créé ✓');
        location.replace('#/sondages/voir/' + Number(r.id));
      } catch (e) {
        btn.disabled = false; btn.textContent = txt;
        $('#mso-gerr').textContent = (e && e.message) || 'Création impossible.';
        toast((e && e.message) || 'Création impossible.', true);
      }
    };
  }
})();
