/* ============================================================
   Diaspo'Actif — Version téléphone : module « Sondages & Consultations »
   Route : #/sondages                liste (ouverts, filtrables, publics)
           #/sondages/voir/ID        détail : participer, résultats, réactions, commentaires
           #/sondages/mes            mes sondages (comptes Initiative, Collectivité, Administrateur)
           #/sondages/nouveau        création (mêmes comptes)
   Diffusion (2026-11-05) : fil, profil public, événements liés, lien / WhatsApp, invitations par e-mail, personnes ayant répondu
   (fenêtre « 📣 Diffusion » d'un sondage) ; bloc « Sondage en cours » sur la fiche d'un événement et sur un profil public
   (window.MMods.sondagesEnCours) ; réponse sans compte via sondage.html.
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
.mso-tab{display:block;text-decoration:none;flex:1;padding:10px 4px;font-size:13px;font-weight:700;text-align:center;background:none;border:none;border-bottom:3px solid transparent;color:var(--muted);cursor:pointer}
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
.mso-opt{display:flex;gap:12px;align-items:flex-start;border:1.5px solid var(--border);background:transparent;border-radius:14px;padding:12px;margin-bottom:8px;cursor:pointer}
.mso-opt.on{border-color:var(--navy2);background:var(--sky-l)}
.mso-opt input{margin:3px 0 0;width:20px;height:20px;flex:none;accent-color:var(--navy2)}
.mso-opt b{display:block;font-size:15px}
.mso-opt small{display:block;color:var(--muted);font-size:12.5px;line-height:1.3}
.mso-hint{font-size:12.5px;color:var(--muted);margin:6px 2px;line-height:1.4}
.mso-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.mso-stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px;text-align:center}
.mso-stat b{display:block;font-size:18px;color:var(--navy2)}
.mso-stat span{font-size:11px;color:var(--muted)}
.mso-so{margin:0 0 12px;border:1px solid var(--border);background:var(--sky-l,#eff6ff);border-radius:14px;padding:12px 14px}
.mso-so .t{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--navy2);margin-bottom:6px}
.mso-so .it{display:flex;flex-direction:column;gap:8px;padding:6px 0}
.mso-so .it+.it{border-top:1px solid var(--border)}
.mso-dl{font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;margin:18px 2px 8px}
.mso-evts{max-height:190px;overflow-y:auto;border:1px solid var(--border);border-radius:12px;padding:4px 10px;margin-bottom:12px}
.mso-evts label{display:flex;gap:10px;align-items:center;padding:9px 0;font-size:14px;cursor:pointer}
.mso-evts input{width:20px;height:20px;flex:none;accent-color:var(--navy2)}
.mso-rep{padding:9px 12px;border-bottom:1px solid var(--border);font-size:13.5px}
.mso-rep:last-child{border-bottom:0}
`;
    document.head.appendChild(s);
  }

  /* ---------- outils ---------- */
  let rendu = 0;
  const vivant = t => t === rendu && /^#\/sondages/.test(location.hash);
  const paint = (t, titre, html, foot) => { if (vivant(t)) setPane(titre, html, foot); };
  /* Deux onglets toujours visibles pour un compte connecté : les sondages en cours sur Diaspo'Actif, et les siens (2026-11-09, demande explicite). */
  const onglets = actif => S.me ? `<div class="mso-tabs" role="tablist"><a class="mso-tab${actif === 'cours' ? ' on' : ''}" role="tab" href="#/sondages">En cours</a><a class="mso-tab${actif === 'mes' ? ' on' : ''}" role="tab" href="#/sondages/mes">Mes sondages</a></div>` : '';
  const pl = (n, un, plus) => n + ' ' + (n > 1 ? plus : un);
  function fmtDate(s) { const p = A.parseDay(s); if (!p) return '—'; return p.d + ' ' + ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][p.m - 1] + ' ' + p.y; }
  function joursRestants(d) { if (!d) return null; return Math.ceil((new Date(String(d).slice(0, 10) + 'T23:59:59') - new Date()) / 86400000); }

  /* Création de sondages : comptes Initiative, étatiques, administrateurs, ET tout compte qui bénéficie de Premium
     (réponse du serveur : /api/sondages/mon-acces, mémorisée par compte). */
  const ACCES = {};
  async function peutCreerSondage() {
    if (!S.me) return false;
    if (ROLES_CREATION.includes(S.me.role)) return true;
    if (ACCES[S.me.id] === undefined) {
      try { ACCES[S.me.id] = !!((await api('/api/sondages/mon-acces')) || {}).peut_creer; } catch (e) { return false; }
    }
    return ACCES[S.me.id];
  }
  async function gate(titre) {
    if (!S.me) {
      setPane(titre, A.loginCard('Connectez-vous avec votre compte Initiative, Premium, Collectivité ou Administrateur pour créer et gérer des sondages.'));
      const b = $('#go-login'); if (b) b.onclick = () => A.openLogin();
      return false;
    }
    if (!(await peutCreerSondage())) {
      setPane(titre, `${onglets('mes')}<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Créer des sondages : module Premium</b>Vous pouvez répondre à tous les sondages en cours. Créer et gérer vos propres sondages est proposé aux comptes Premium (période gratuite comprise), Initiative, Collectivité et Administrateur.<br><br><a class="btn" href="#/abonnement">Voir mon abonnement Premium</a><br><br><a class="btn out" href="#/sondages">Voir les sondages en cours</a></div>`);
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
    if (b === 'modifier' && /^\d+$/.test(c || '')) return formulaire(t, Number(c));
    location.replace('#/sondages');
  };

  /* ============================================================
     LISTE (publique)
     ============================================================ */
  const ST = { q: '', cat: '', items: [] };
  function couvSond(s){try{var a=typeof s.photos_json==='string'?JSON.parse(s.photos_json||'[]'):(s.photos_json||[]);var u=a&&a[0];return (typeof u==='string'&&/^(https:\/\/|\/)/.test(u))?u:'';}catch(e){return '';}}
  function carte(s) {
    const jours = joursRestants(s.date_cloture);
    const fini = s.statut !== 'ouvert';
    return `<a class="card mso-card" href="#/sondages/voir/${Number(s.id)}">${couvSond(s) ? `<img src="${esc(couvSond(s))}" alt="" loading="lazy" style="display:block;width:100%;height:120px;object-fit:cover;border-radius:12px 12px 0 0;background:#e8edf3">` : ''}<div class="pad">
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
    const peutCreer = await peutCreerSondage();
    setPane(NOM, `${onglets('cours')}<div class="search">${ic('search', 's')}<input id="mso-q" type="search" placeholder="Rechercher un sondage…" aria-label="Rechercher un sondage"></div>
      <select id="mso-cat" aria-label="Filtrer par catégorie" style="width:100%;box-sizing:border-box;min-height:44px;padding:0 10px;border:1px solid var(--border);border-radius:10px;background:#fff;font-size:15px;margin:8px 0 12px">
        <option value="">Toutes catégories</option>${CATEGORIES.map(c => `<option value="${c}">${esc(CAT_LABELS[c])}</option>`).join('')}
      </select>
      <div id="mso-grid">${SK}</div>`, S.me ? `<a class="btn block" href="#/sondages/nouveau">${ic('plus', 's')} Créer un sondage${peutCreer ? '' : ' · Premium'}</a>` : '');
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
  /* Lieux d'affichage d'un sondage (2026-11-09) : un sondage sans aucun lieu ne peut être qu'un brouillon. */
  let MES_F = 'tous';
  function lieuxDe(s) {
    let d = {}; try { d = JSON.parse(s.diffusion_json || '{}'); } catch (e) { /* illisible : aucun lieu */ }
    const l = [];
    if (d.onglet === undefined || d.onglet) l.push('Onglet Sondages');
    if (d.fil) l.push('Fil d’actualité');
    if (d.profil) l.push('Profil public');
    if (d.boutique) l.push('Boutique');
    const n = Number(s.nb_evts_lies) || 0; if (n) l.push(n + ' événement' + (n > 1 ? 's' : ''));
    return l;
  }
  async function mesSondages(t) {
    if (!(await gate('Mes sondages'))) return;
    setPane('Mes sondages', SK, `<a class="btn block" href="#/sondages/nouveau">${ic('plus', 's')} Créer un sondage</a>`);
    let rows;
    try { rows = (await api('/api/sondages?mine=1')).sondages || []; }
    catch (e) { return showError(t, 'Mes sondages', e, 'Impossible de charger vos sondages', () => mesSondages(++rendu)); }
    if (!vivant(t)) return;
    const nbBr = rows.filter(s => s.statut === 'brouillon').length;
    if (MES_F === 'brouillons' && !nbBr) MES_F = 'tous';
    const barre = nbBr ? `<div class="chips" id="mso-mesf" style="margin-bottom:10px"><button type="button" class="chip ${MES_F === 'tous' ? 'on' : ''}" data-f="tous">Tous</button><button type="button" class="chip ${MES_F === 'brouillons' ? 'on' : ''}" data-f="brouillons">📝 Brouillons (${nbBr})</button></div>` : '';
    if (MES_F === 'brouillons') rows = rows.filter(s => s.statut === 'brouillon');
    const html = onglets('mes') + barre + (MES_F === 'brouillons' ? '<p class="mso-hint" style="margin:0 0 10px">Ces sondages ne sont affichés nulle part : vous seul(e) les voyez. Ouvrez-en un, choisissez les lieux (« Diffusion »), puis publiez-le.</p>' : '') + (rows.length ? rows.map(s => {
      const st = STATUT_LABELS[s.statut] || s.statut;
      return `<a class="card mso-card" href="#/sondages/voir/${Number(s.id)}">${couvSond(s) ? `<img src="${esc(couvSond(s))}" alt="" loading="lazy" style="display:block;width:100%;height:120px;object-fit:cover;border-radius:12px 12px 0 0;background:#e8edf3">` : ''}<div class="pad">
        <div class="row" style="align-items:flex-start"><div class="sp"><span class="mso-cat">${esc(CAT_LABELS[s.categorie] || 'Sondage')}</span><div style="font-weight:700;font-size:15px;margin-top:4px;word-break:break-word">${esc(s.titre)}</div><div class="small muted">${s.statut === 'ouvert' ? 'Fin le ' : 'Terminé le '}${fmtDate(s.date_cloture)} · ${s.nb_reponses || 0} réponse${s.nb_reponses > 1 ? 's' : ''}</div>${s.statut === 'brouillon' ? `<div class="small muted">${lieuxDe(s).length ? 'Lieux choisis : ' + esc(lieuxDe(s).join(' · ')) : 'Aucun lieu choisi pour l’instant'}</div>` : ''}</div><span class="badge ${s.statut === 'ouvert' ? 'g' : ''}">${esc(st)}</span></div>
      </div></a>`;
    }).join('') : `<div class="empty"><div class="ei">${ic('doc', 'l')}</div><b>Vous n’avez pas encore créé de sondage</b>Créez-en un pour consulter votre communauté.</div>`);
    paint(t, 'Mes sondages', html, `<a class="btn block" href="#/sondages/nouveau">${ic('plus', 's')} Créer un sondage</a>`);
    $$('#mso-mesf .chip').forEach(b => { b.onclick = () => { MES_F = b.dataset.f; mesSondages(++rendu); }; });
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
    const html = `<div class="card">${couvSond(s) ? `<img src="${esc(couvSond(s))}" alt="" style="display:block;width:100%;height:auto;max-height:340px;object-fit:contain;border-radius:12px 12px 0 0;background:#e8edf3">` : ''}<div class="pad">
        <span class="mso-cat">${esc(CAT_LABELS[s.categorie] || 'Sondage')}</span>
        <h2 style="margin:8px 0 2px;font-size:19px;word-break:break-word">${esc(s.titre)}</h2>
        <div class="small muted">Par ${esc(s.createur_nom || '—')} · Clôture le ${fmtDate(s.date_cloture)}</div>
        ${s.description ? `<p class="small" style="white-space:pre-line;word-break:break-word;margin:10px 0 0">${esc(A.strip(s.description))}</p>` : ''}
        <div class="mso-stats"><div class="mso-stat"><b>${s.nb_reponses || 0}</b><span>réponses</span></div><div class="mso-stat"><b>${s.nb_vues || 0}</b><span>vues</span></div><div class="mso-stat"><b>${s.nb_reactions || 0}</b><span>réactions</span></div></div>
      </div></div>
      ${s.statut === 'cloture' ? `<div class="mso-hint" style="background:var(--orange-l);color:var(--orange-d);border-radius:12px;padding:10px 12px">⏹️ <b>Fin de ce sondage</b> — il n’accepte plus de réponses.${estCreateur ? ' Republiez-le pour le réactiver.' : ''}</div>` : ''}
      ${s.statut === 'brouillon' ? `<div class="mso-hint" style="background:var(--border);border-radius:12px;padding:10px 12px">📝 Brouillon : ce sondage n’est pas encore publié.${estCreateur ? ' Touchez « Modifier » pour changer le titre, les questions (obligatoires ou facultatives)…' : ''}</div>` : ''}
      ${dejaRepondu && !ferme ? `<div class="mso-hint" style="background:var(--green-l,#d1fae5);color:var(--green-d,#065f46);border-radius:12px;padding:10px 12px;font-weight:700">✅ Vous avez déjà répondu.</div>` : ''}
      ${peutParticiper ? `<form id="mso-form">${qs.map((q, i) => renderQ(q, i)).join('')}<button type="button" class="btn block" id="mso-submit" style="margin-top:4px">✅ Soumettre</button></form>` : ''}
      ${(ferme || dejaRepondu) ? `<button type="button" class="btn out block" id="mso-res-btn" style="margin-top:4px">📊 Voir les résultats</button><div id="mso-res"></div>` : ''}
      ${!S.me && !ferme ? `<div class="mso-hint" style="background:var(--sky-l);border-radius:12px;padding:10px 12px">🔑 <a href="#" id="mso-login" style="font-weight:700">Connectez-vous</a> pour participer, ou répondez sans compte.</div><a class="btn block" href="sondage.html?id=${Number(id)}" style="margin-top:8px">✍️ Répondre sans compte</a>` : ''}
      <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
        <button type="button" class="btn out sm" id="mso-rxn">❤️ ${s.nb_reactions || 0}</button>
        <button type="button" class="btn out sm" id="mso-fav">⭐ ${s.est_favori ? 'Sauvegardé' : 'Favoris'}</button>
        <button type="button" class="btn out sm" id="mso-share">${ic('share', 's')} Partager</button>
      </div>
      ${estCreateur ? `<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
        <button type="button" class="btn out sm" id="mso-stats-btn">📊 Statistiques</button>
        <button type="button" class="btn out sm" id="mso-rapport">📄 Rapport</button>
        <button type="button" class="btn out sm" id="mso-diff">📣 Diffusion</button>
        ${!ferme ? `<button type="button" class="btn out sm" id="mso-cloturer">🔒 Clôturer</button>` : ''}
        ${s.statut === 'cloture' ? `<button type="button" class="btn out sm" id="mso-republier">🔁 Republier</button>` : ''}
        ${s.statut === 'brouillon' ? `<button type="button" class="btn out sm" id="mso-modifier">✏️ Modifier</button><button type="button" class="btn sm" id="mso-publier">🚀 Publier</button>` : ''}
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
    const sh = $('#mso-share'); if (sh) sh.onclick = () => partager(location.origin + '/sondage.html?id=' + id, s.titre);
    const lg = $('#mso-login'); if (lg) lg.onclick = ev => { ev.preventDefault(); A.openLogin(); };
    const sub = $('#mso-submit'); if (sub) sub.onclick = () => soumettre(t, id, qs);
    const rb = $('#mso-res-btn'); if (rb) rb.onclick = () => chargerResultats(id);
    chargerCommentaires(id);
    const ci = $('#mso-com-send'); if (ci) ci.onclick = () => poster(id);

    if (estCreateur) {
      const sb = $('#mso-stats-btn'); if (sb) sb.onclick = () => chargerStats(id);
      const rap = $('#mso-rapport'); if (rap) rap.onclick = () => { window.open('/sondage-rapport.html?id=' + id, '_blank'); };
      const df = $('#mso-diff'); if (df) df.onclick = () => diffusion(id);
      const cl = $('#mso-cloturer'); if (cl) cl.onclick = () => cloturer(t, id);
      const rp = $('#mso-republier'); if (rp) rp.onclick = () => republier(t, id, false);
      const pb = $('#mso-publier'); if (pb) pb.onclick = () => republier(t, id, true);
      const md = $('#mso-modifier'); if (md) md.onclick = () => { location.hash = '#/sondages/modifier/' + id; };
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
        ${r.nb_invites != null ? `<div class="mso-stat" style="grid-column:1/-1"><b>${r.nb_invites}</b><span>réponses sans compte</span></div>` : ''}
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
     BLOC « SONDAGE EN COURS » — fiche d'un événement, profil public (jamais dans le parcours d'inscription).
     Participation facultative et sans compte : simple lien vers sondage.html.
     ============================================================ */
  window.MMods.sondagesEnCours = async function (opts) {
    opts = opts || {};
    const q = opts.evenement ? 'evenement=' + encodeURIComponent(opts.evenement) : opts.profil ? 'profil=' + encodeURIComponent(opts.profil) : opts.boutique ? 'boutique=' + encodeURIComponent(opts.boutique) : '';
    const apres = opts.apres;
    if (!q || !apres || !apres.parentNode) return null;
    let liste;
    try { liste = (await api('/api/sondages-en-cours?' + q)).sondages || []; } catch (e) { return null; }
    if (!liste.length || !apres.parentNode) return null;
    css();
    const cle = opts.evenement ? 'e' + opts.evenement : opts.boutique ? 'b' + opts.boutique : 'p' + opts.profil;
    const ancien = apres.parentNode.querySelector('[data-so="' + cle + '"]'); if (ancien) ancien.remove();
    const bloc = document.createElement('section');
    bloc.className = 'mso-so'; bloc.setAttribute('data-so', cle); bloc.setAttribute('aria-label', 'Sondage en cours');
    bloc.innerHTML = '<div class="t">📊 Sondage en cours</div>' + liste.map(s => '<div class="it"><div><div style="font-weight:700;font-size:15px;line-height:1.35;word-break:break-word">' + esc(s.titre) + '</div>' +
      '<div class="small muted" style="margin-top:2px">Facultatif, sans compte' + (s.date_cloture ? ' · jusqu’au ' + esc(fmtDate(s.date_cloture)) : '') + '</div></div>' +
      '<a class="btn sm block" href="sondage.html?id=' + Number(s.id) + '">Répondre au sondage</a></div>').join('');
    apres.parentNode.insertBefore(bloc, apres.nextSibling);
    return bloc;
  };

  /* ============================================================
     DIFFUSION (créateur) — lieux d'affichage, événements liés, partage, invitations, personnes ayant répondu
     ============================================================ */
  async function diffusion(id) {
    const close = A.openSheet('<div class="sk skc" style="height:120px"></div>');
    const corps = () => $('#sheet .sb');
    let d;
    try { d = await api('/api/sondages/' + id + '/diffusion'); }
    catch (e) { const sb = corps(); if (sb) sb.innerHTML = '<div class="empty"><b>Diffusion indisponible</b>' + esc((e && e.message) || 'Erreur.') + '<br><br><button class="btn sm" id="msd-x">Fermer</button></div>'; const x = $('#msd-x'); if (x) x.onclick = close; return; }
    const s = d.sondage, ouvert = s.statut === 'ouvert';
    const evts = d.mes_evenements || [], lies = new Set((d.evenement_ids || []).map(Number));
    const sb = corps(); if (!sb) return;
    sb.className = 'sb mso-f';
    sb.innerHTML = `<div class="row" style="align-items:flex-start;gap:8px"><div class="sp"><h3 style="margin:0 0 2px;font-size:18px">📣 Diffusion</h3><div class="small muted" style="word-break:break-word">${esc(s.titre)}</div></div><button type="button" class="ibtn" id="msd-close" aria-label="Fermer">${ic('close')}</button></div>
      <p class="mso-hint" style="background:var(--sky-l);border-radius:12px;padding:10px 12px">${ouvert ? '⏳ Sondage <b>en cours</b> jusqu’au ' + esc(fmtDate(s.date_cloture)) + '.' : 'Ce sondage n’est pas en cours (' + esc(STATUT_LABELS[s.statut] || s.statut) + '). Vos choix s’appliqueront dès sa publication.'} La durée (30 jours maximum) est <b>la même partout</b> où il est affiché.</p>
      <div class="mso-dl" style="margin-top:6px">Où l’afficher</div>
      <label class="mso-opt" id="msd-fil-o"><input type="checkbox" id="msd-fil" ${d.diffusion.fil ? 'checked' : ''}><span><b>Fil d’actualité</b><small>Une publication annonce le sondage avec son lien${s.fil_post_id ? ' (déjà publiée)' : ''}.</small></span></label>
      <label class="mso-opt" id="msd-onglet-o"><input type="checkbox" id="msd-onglet" ${d.diffusion.onglet ? 'checked' : ''}><span><b>Onglet Sondages</b><small>Le sondage figure dans la page publique des sondages.</small></span></label>
      <label class="mso-opt" id="msd-boutique-o"><input type="checkbox" id="msd-boutique" ${d.diffusion.boutique ? 'checked' : ''}><span><b>Ma boutique</b><small>Un encart « Sondage en cours » s’affiche sur votre vitrine.</small></span></label>
      <label class="mso-opt" id="msd-profil-o"><input type="checkbox" id="msd-profil" ${d.diffusion.profil ? 'checked' : ''}><span><b>Mon profil public</b><small>Un encart « Sondage en cours » s’affiche sur votre page.</small></span></label>
      <div class="mso-dl">Événements concernés</div>
      <p class="mso-hint" style="margin-top:0">Sur la fiche de chaque événement coché, un bloc « Sondage en cours » permet de répondre si on le souhaite. Il n’apparaît jamais dans le parcours d’inscription.</p>
      <div class="mso-evts">${evts.length ? evts.map(e => '<label><input type="checkbox" class="msd-evt" value="' + Number(e.id) + '" ' + (lies.has(Number(e.id)) ? 'checked' : '') + '><span>' + esc(e.titre) + (e.date_evt ? ' <span class="small muted">· ' + esc(fmtDate(e.date_evt)) + '</span>' : '') + '</span></label>').join('') : '<div class="small muted" style="padding:10px 0">Vous n’avez pas encore d’événement publié.</div>'}</div>
      <button type="button" class="btn block" id="msd-save">Enregistrer la diffusion</button>
      <div class="mso-dl">Partager le lien</div>
      <input type="text" readonly id="msd-lien" value="${esc(d.lien)}" aria-label="Lien du sondage">
      <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button type="button" class="btn out sm" id="msd-copy">${ic('share', 's')} Copier / partager</button><a class="btn out sm" id="msd-wa" href="${A.attrUrl(d.lien_whatsapp)}" target="_blank" rel="noopener">💬 WhatsApp</a></div>
      <div class="mso-dl">Inviter par e-mail</div>
      <p class="mso-hint" style="margin-top:0">Chaque personne reçoit un <b>lien personnel à usage unique</b> (une seule réponse par lien, sans compte).${d.invitations.total ? ' Déjà envoyées : ' + d.invitations.total + ' · utilisées : ' + d.invitations.utilisees + '.' : ''}</p>
      <textarea id="msd-emails" rows="3" placeholder="Une adresse par ligne, ou séparées par des virgules (50 maximum)" ${ouvert ? '' : 'disabled'}></textarea>
      <textarea id="msd-message" rows="2" maxlength="500" placeholder="Petit mot d’accompagnement (facultatif)" ${ouvert ? '' : 'disabled'} style="margin-top:8px"></textarea>
      <button type="button" class="btn out block" id="msd-inv" ${ouvert ? '' : 'disabled'} style="margin-top:8px">✉️ Envoyer les invitations</button>
      ${ouvert ? '' : '<p class="mso-hint">Publiez le sondage pour pouvoir envoyer des invitations.</p>'}
      <div class="mso-dl">Personnes ayant répondu</div>
      <div id="msd-rep"><button type="button" class="btn out sm" id="msd-rep-btn">👥 Voir la liste</button></div>`;
    const cb = (a, b) => { const x = $(a, sb), y = $(b, sb); if (x && y) { const sync = () => y.classList.toggle('on', x.checked); x.addEventListener('change', sync); sync(); } };
    cb('#msd-fil', '#msd-fil-o'); cb('#msd-profil', '#msd-profil-o'); cb('#msd-onglet', '#msd-onglet-o'); cb('#msd-boutique', '#msd-boutique-o');
    $('#msd-close', sb).onclick = close;
    $('#msd-save', sb).onclick = async ev => {
      const btn = ev.currentTarget; btn.disabled = true;
      try {
        await api('/api/sondages/' + id + '/diffusion', { method: 'PUT', body: { fil: $('#msd-fil', sb).checked, profil: $('#msd-profil', sb).checked, onglet: $('#msd-onglet', sb).checked, boutique: $('#msd-boutique', sb).checked, evenement_ids: $$('.msd-evt:checked', sb).map(c => Number(c.value)) } });
        toast('Diffusion enregistrée ✓'); diffusion(id);
      } catch (e) { toast((e && e.message) || 'Enregistrement impossible.', true); btn.disabled = false; }
    };
    $('#msd-lien', sb).onclick = ev => ev.currentTarget.select();
    $('#msd-copy', sb).onclick = () => partager($('#msd-lien', sb).value, s.titre);
    $('#msd-inv', sb).onclick = async ev => {
      const emails = $('#msd-emails', sb).value.trim();
      if (!emails) { toast('Indiquez au moins une adresse e-mail.', true); return; }
      const btn = ev.currentTarget; btn.disabled = true;
      try {
        const r = await api('/api/sondages/' + id + '/invitations', { method: 'POST', body: { emails, message: $('#msd-message', sb).value.trim() } });
        const det = [r.deja_invites ? r.deja_invites + ' déjà invitée(s)' : '', r.deja_repondu ? r.deja_repondu + ' ont déjà répondu' : '', r.invalides ? r.invalides + ' adresse(s) invalide(s)' : '', r.echecs ? r.echecs + ' non envoyée(s)' : ''].filter(Boolean).join(' · ');
        toast((r.message || 'Terminé.') + (det ? ' (' + det + ')' : ''), !!(r.echecs && !r.envoyes)); diffusion(id);
      } catch (e) { toast((e && e.message) || 'Envoi impossible.', true); btn.disabled = false; }
    };
    $('#msd-rep-btn', sb).onclick = async () => {
      const box = $('#msd-rep', sb); box.innerHTML = '<p class="small muted">Chargement…</p>';
      try {
        const r = await api('/api/sondages/' + id + '/repondants');
        if (r.anonyme) { box.innerHTML = '<p class="small muted">Sondage anonyme : ' + r.total + ' réponse(s), aucune identité enregistrée.</p>'; return; }
        if (!(r.repondants || []).length) { box.innerHTML = '<p class="small muted">Aucune réponse pour le moment.</p>'; return; }
        box.innerHTML = '<p class="small muted" style="margin:0 0 6px">' + r.total + ' personne(s). Les coordonnées ne sont jamais visibles par les autres comptes.</p><div style="border:1px solid var(--border);border-radius:12px;max-height:240px;overflow-y:auto">' +
          r.repondants.map(p => '<div class="mso-rep"><b>' + esc(((p.prenom || '') + ' ' + (p.nom || '')).trim() || '—') + '</b> <span class="badge ' + (p.type === 'compte' ? 'g' : '') + '">' + (p.type === 'compte' ? 'Compte' : 'Sans compte') + '</span>' +
            (p.email ? '<div class="small muted">' + esc(p.email) + (p.telephone ? ' · ' + esc(p.telephone) : '') + (p.recontact ? ' · ✅ accepte d’être recontacté(e)' : '') + '</div>' : '') + '</div>').join('') +
          '</div><button type="button" class="btn out sm" id="msd-csv" style="margin-top:8px">⬇️ Exporter en CSV</button>';
        const c = $('#msd-csv', sb); if (c) c.onclick = () => { window.location.href = '/api/sondages/' + id + '/export'; };
      } catch (e) { box.innerHTML = '<p class="small" style="color:var(--red)">' + esc((e && e.message) || 'Liste indisponible.') + '</p>'; }
    };
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
  const qAttr = v => esc(v).replace(/"/g, '&quot;');
  const qDe = idx => QS.find(x => x.idx === idx);
  function qNouvelle(q) { QIDX++; return Object.assign({ idx: QIDX, texte: '', type: 'choix_unique', options: [], obligatoire: true, description: '', min_label: '', max_label: '', min_val: 1, max_val: 5 }, q || {}); }
  function qHtml(q, n) {
    const choix = ['choix_unique', 'choix_multiple'].includes(q.type), echelle = ['echelle_5', 'echelle_10', 'etoiles'].includes(q.type);
    return `<div class="mso-q" id="qb-${q.idx}">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px"><b class="small">Question ${n + 1}</b>
        <span style="display:flex;gap:6px"><button type="button" class="btn out sm" data-q-up="${q.idx}" ${n === 0 ? 'disabled' : ''} aria-label="Monter la question ${n + 1}">↑</button><button type="button" class="btn out sm" data-q-down="${q.idx}" ${n === QS.length - 1 ? 'disabled' : ''} aria-label="Descendre la question ${n + 1}">↓</button><button type="button" class="btn out sm" data-del-q="${q.idx}" aria-label="Retirer la question ${n + 1}">Retirer</button></span></div>
      <label class="mso-l" style="margin:4px 0" for="qt-${q.idx}">Texte</label><input type="text" id="qt-${q.idx}" maxlength="500" value="${qAttr(q.texte)}" placeholder="Texte de la question" data-q-txt="${q.idx}">
      <label class="mso-l" style="margin:8px 0 4px" for="qtype-${q.idx}">Type</label>
      <select id="qtype-${q.idx}" data-q-type="${q.idx}">${Q_TYPES.map(([v, l]) => `<option value="${v}" ${v === q.type ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${choix ? `<div style="margin-top:8px">${q.options.map((o, i) => `<div style="display:flex;gap:6px;margin-top:4px"><input type="text" maxlength="200" value="${qAttr(o)}" placeholder="Choix ${i + 1}" aria-label="Choix ${i + 1} de la question ${n + 1}" style="flex:1;min-height:40px" data-q-opt="${q.idx}" data-i="${i}"><button type="button" class="btn out sm" data-del-opt="${q.idx}" data-i="${i}" aria-label="Retirer le choix ${i + 1}">×</button></div>`).join('')}<button type="button" class="btn out sm" data-add-opt="${q.idx}" style="margin-top:6px">+ Choix</button></div>` : ''}
      ${echelle ? `<label class="mso-l" style="margin:8px 0 4px">Libellé du bas de l’échelle <small>(facultatif)</small></label><input type="text" maxlength="80" value="${qAttr(q.min_label)}" data-q-min="${q.idx}"><label class="mso-l" style="margin:8px 0 4px">Libellé du haut de l’échelle <small>(facultatif)</small></label><input type="text" maxlength="80" value="${qAttr(q.max_label)}" data-q-max="${q.idx}">` : ''}
      <label class="mso-l" style="margin:8px 0 4px" for="qd-${q.idx}">Précision sous la question <small>(facultative)</small></label><input type="text" id="qd-${q.idx}" maxlength="500" value="${qAttr(q.description)}" data-q-desc="${q.idx}">
      <label class="mso-opt ${q.obligatoire ? 'on' : ''}" style="margin-top:10px"><input type="checkbox" ${q.obligatoire ? 'checked' : ''} data-q-oblig="${q.idx}"><span><b>Réponse obligatoire</b><small>Décochez pour la rendre facultative.</small></span></label>
    </div>`;
  }
  function qRender() {
    const z = $('#mso-qbuilder'); if (!z) return;
    z.innerHTML = QS.map((q, n) => qHtml(q, n)).join('');
    const num = el => Number(el.dataset.qTxt || el.dataset.qType || el.dataset.qOpt || el.dataset.qMin || el.dataset.qMax || el.dataset.qDesc || el.dataset.qOblig);
    $$('[data-q-txt]', z).forEach(el => { el.oninput = () => { const q = qDe(num(el)); if (q) q.texte = el.value; }; });
    $$('[data-q-desc]', z).forEach(el => { el.oninput = () => { const q = qDe(num(el)); if (q) q.description = el.value; }; });
    $$('[data-q-min]', z).forEach(el => { el.oninput = () => { const q = qDe(num(el)); if (q) q.min_label = el.value; }; });
    $$('[data-q-max]', z).forEach(el => { el.oninput = () => { const q = qDe(num(el)); if (q) q.max_label = el.value; }; });
    $$('[data-q-opt]', z).forEach(el => { el.oninput = () => { const q = qDe(num(el)); if (q) q.options[Number(el.dataset.i)] = el.value; }; });
    $$('[data-q-oblig]', z).forEach(el => { el.onchange = () => { const q = qDe(num(el)); if (q) q.obligatoire = el.checked; el.closest('.mso-opt').classList.toggle('on', el.checked); }; });
    $$('[data-q-type]', z).forEach(el => {
      el.onchange = () => {
        const q = qDe(num(el)); if (!q) return; q.type = el.value;
        if (['choix_unique', 'choix_multiple'].includes(q.type)) { while (q.options.length < 2) q.options.push(''); }
        q.max_val = q.type === 'echelle_10' ? 10 : 5; qRender();
      };
    });
    $$('[data-del-q]', z).forEach(el => { el.onclick = () => { QS = QS.filter(x => x.idx !== Number(el.dataset.delQ)); qRender(); }; });
    const bouger = (idx, sens) => { const i = QS.findIndex(x => x.idx === idx), j = i + sens; if (i < 0 || j < 0 || j >= QS.length) return; [QS[i], QS[j]] = [QS[j], QS[i]]; qRender(); };
    $$('[data-q-up]', z).forEach(el => { el.onclick = () => bouger(Number(el.dataset.qUp), -1); });
    $$('[data-q-down]', z).forEach(el => { el.onclick = () => bouger(Number(el.dataset.qDown), 1); });
    $$('[data-add-opt]', z).forEach(el => {
      el.onclick = () => { const q = qDe(Number(el.dataset.addOpt)); if (!q || q.options.length >= 30) return; q.options.push(''); qRender(); const nv = $$('[data-q-opt="' + q.idx + '"]'); if (nv.length) nv[nv.length - 1].focus(); };
    });
    $$('[data-del-opt]', z).forEach(el => { el.onclick = () => { const q = qDe(Number(el.dataset.delOpt)); if (q) { q.options.splice(Number(el.dataset.i), 1); qRender(); } }; });
  }
  function qAjouter(q) { const nq = qNouvelle(q); QS.push(nq); qRender(); return nq; }

  async function formulaire(t, editId) {
    const TITRE_F = editId ? 'Modifier le brouillon' : 'Nouveau sondage';
    if (!(await gate(TITRE_F))) return;
    setPane(TITRE_F, SK);
    QS = []; QIDX = 0;
    let ED = null;
    if (editId) {
      try {
        const [d, df] = await Promise.all([api('/api/sondages/' + editId), api('/api/sondages/' + editId + '/diffusion')]);
        if (!vivant(t)) return;
        if (d.sondage.statut !== 'brouillon') { toast('Seul un brouillon peut être modifié : un sondage publié garde ses questions.', true); location.replace('#/sondages/voir/' + editId); return; }
        ED = { s: d.sondage, qs: d.questions || [], dif: df.diffusion || {}, evts: new Set((df.evenement_ids || []).map(Number)) };
      } catch (e) { return showError(t, TITRE_F, e, 'Sondage introuvable', () => formulaire(++rendu, editId)); }
    }
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
      <div class="mso-dl" style="margin-top:16px">Où afficher ce sondage</div>
      <p class="mso-hint" style="margin-top:0">Plusieurs choix possibles. <b>Rien n’est coché d’office</b> : sans aucun lieu, le sondage reste un brouillon que vous seul(e) voyez.</p>
      <label class="mso-opt"><input type="checkbox" id="mso-lieu-onglet"><span><b>Onglet Sondages</b><small>La page publique des sondages.</small></span></label>
      <label class="mso-opt"><input type="checkbox" id="mso-lieu-fil"><span><b>Fil d’actualité</b><small>Une publication annonce le sondage.</small></span></label>
      <label class="mso-opt"><input type="checkbox" id="mso-lieu-profil"><span><b>Profil public</b><small>Un encart « Sondage en cours » sur votre page.</small></span></label>
      <label class="mso-opt"><input type="checkbox" id="mso-lieu-boutique"><span><b>Boutique</b><small>Un encart « Sondage en cours » sur votre vitrine.</small></span></label>
      <div class="mso-dl">Événements</div>
      <p class="mso-hint" style="margin-top:0">Sur la fiche de l’événement, un bloc « Sondage en cours » permet d’y répondre <b>sans s’inscrire</b> à l’événement. Il ne fait jamais partie de l’inscription.</p>
      <div class="mso-evts" id="mso-evts"><span class="small muted">Chargement…</span></div>
      <div class="h2" style="margin-top:16px">QUESTIONS</div>
      <div id="mso-qbuilder"></div>
      <button type="button" class="btn out block" id="mso-addq" style="margin:4px 0 14px">+ Ajouter une question</button>
      <label class="mso-opt" id="mso-pub-opt" ${editId ? 'style="display:none"' : ''}><input type="checkbox" id="mso-publier-ck"><span><b>Publier immédiatement</b><small>Si au moins un lieu est coché. Sinon, le sondage est enregistré comme brouillon.</small></span></label>
    </form>`;
    setPane(TITRE_F, html, `<button class="btn block" id="mso-save">${editId ? 'Enregistrer les modifications' : 'Créer le sondage'}</button>`);

    $('#mso-debut').onchange = majFin;
    $$('.mso-opt input', $('#mso-form2')).forEach(cb => cb.addEventListener('change', () => cb.closest('.mso-opt').classList.toggle('on', cb.checked)));
    $('#mso-addq').onclick = () => { const nq = qAjouter(); const el = $('#qt-' + nq.idx); if (el) el.focus(); };
    if (ED) {
      const sv = ED.s, set = (id, v) => { const x = $('#' + id); if (x) x.value = v == null ? '' : v; };
      set('mso-titre', sv.titre); set('mso-desc', sv.description);
      set('mso-cat2', sv.categorie); if ($('#mso-cat2').value !== sv.categorie) $('#mso-cat2').value = 'autre';
      set('mso-rayon', sv.rayon_publication || 'national'); set('mso-debut', String(sv.date_debut || auj).slice(0, 10)); set('mso-fin', String(sv.date_cloture || finDef).slice(0, 10));
      set('mso-conf', sv.confidentialite || 'anonyme'); set('mso-vis', sv.resultats_visibles || 'apres_cloture');
      $('#mso-anon').checked = !!Number(sv.anonyme) && sv.anonyme !== '0';
      [['onglet', 'mso-lieu-onglet'], ['fil', 'mso-lieu-fil'], ['profil', 'mso-lieu-profil'], ['boutique', 'mso-lieu-boutique']].forEach(([k, id]) => { $('#' + id).checked = !!ED.dif[k]; });
      $$('.mso-opt input', $('#mso-form2')).forEach(cb => cb.closest('.mso-opt').classList.toggle('on', cb.checked));
      ED.qs.forEach(q => {
        let o = []; try { o = JSON.parse(q.options_json || '[]'); } catch (_) { }
        QS.push(qNouvelle({ texte: q.texte, type: q.type, options: Array.isArray(o) ? o : [], obligatoire: !(q.obligatoire === 0 || q.obligatoire === false || q.obligatoire === '0'), description: q.description || '', min_label: q.min_label || '', max_label: q.max_label || '', min_val: q.min_val || 1, max_val: q.max_val || 5 }));
      });
      if (!QS.length) QS.push(qNouvelle());
      qRender();
    } else qAjouter();
    api('/api/sondages/mes-evenements').then(d => {
      const evts = (d && d.evenements) || [], z = $('#mso-evts'); if (!z) return;
      z.innerHTML = evts.length ? evts.map(e => '<label><input type="checkbox" class="mso-evt" value="' + Number(e.id) + '"' + (ED && ED.evts.has(Number(e.id)) ? ' checked' : '') + '><span>' + esc(e.titre) + (e.date_evt ? ' <span class="small muted">· ' + esc(fmtDate(e.date_evt)) + '</span>' : '') + '</span></label>').join('') : '<span class="small muted">Vous n’avez pas encore d’événement publié.</span>';
    }).catch(() => { const z = $('#mso-evts'); if (z) z.innerHTML = '<span class="small muted">Liste des événements indisponible.</span>'; });

    const val = id => { const x = $('#mso-' + id); return x ? x.value.trim() : ''; };
    const bad = (id, msg) => { const x = $('#mso-' + id), m = $('#mso-e-' + id); if (x) x.setAttribute('aria-invalid', 'true'); if (m) m.textContent = msg; return x; };
    $('#mso-save').onclick = async () => {
      $$('#mso-form2 [aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
      $$('#mso-form2 .mso-err').forEach(x => { x.textContent = ''; }); $('#mso-gerr').textContent = '';
      let first = null;
      if (!val('titre')) first = bad('titre', 'Donnez un titre à votre sondage.');
      const d1 = $('#mso-debut').value, d2 = $('#mso-fin').value;
      if (d1 && d2 && (new Date(d2) - new Date(d1)) / 86400000 > DUREE_MAX - 1) { if (!first) first = $('#mso-fin'); toast('Un sondage dure 30 jours au maximum.', true); }
      const questions = QS.filter(q => q.texte.trim()).map(q => {
        const ch = ['choix_unique', 'choix_multiple'].includes(q.type);
        return { texte: q.texte.trim(), type: q.type, options: ch ? (q.options || []).map(o => String(o).trim()).filter(Boolean) : [], obligatoire: !!q.obligatoire, description: q.description || null, min_label: q.min_label || null, max_label: q.max_label || null, min_val: q.min_val || 1, max_val: q.max_val || 5 };
      });
      if (!questions.length) { toast('Ajoutez au moins une question.', true); if (!first) first = $('#mso-addq'); }
      const sansChoix = questions.find(q => ['choix_unique', 'choix_multiple'].includes(q.type) && q.options.length < 2);
      if (sansChoix) { toast('La question « ' + sansChoix.texte.slice(0, 50) + ' » est à choix : indiquez au moins 2 choix (ou changez son type).', true); if (!first) first = $('#mso-addq'); }
      if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (first.focus) first.focus(); $('#mso-gerr').textContent = 'Certains champs sont à corriger.'; return; }
      const btn = $('#mso-save'); btn.disabled = true; const txt = btn.textContent; btn.textContent = '…';
      try {
        const r = await api(editId ? '/api/sondages/' + editId + '/contenu' : '/api/sondages', {
          method: editId ? 'PUT' : 'POST', body: {
            diffusion: { onglet: $('#mso-lieu-onglet').checked, fil: $('#mso-lieu-fil').checked, profil: $('#mso-lieu-profil').checked, boutique: $('#mso-lieu-boutique').checked },
            titre: val('titre'), description: val('desc') || null, categorie: $('#mso-cat2').value,
            rayon_publication: $('#mso-rayon').value, date_debut: d1 || null, date_cloture: d2 || null,
            confidentialite: $('#mso-conf').value, anonyme: $('#mso-anon').checked,
            resultats_visibles: $('#mso-vis').value, ...(editId ? {} : { statut: $('#mso-publier-ck').checked ? 'ouvert' : 'brouillon' }), evenement_ids: $$('.mso-evt:checked').map(c => Number(c.value)), questions
          }
        });
        toast(r && r.message ? r.message : (r && r.statut === 'ouvert' ? 'Sondage publié ✓' : 'Brouillon enregistré ✓'), !!(r && r.message));
        location.replace('#/sondages/voir/' + Number(editId || r.id));
      } catch (e) {
        btn.disabled = false; btn.textContent = txt;
        $('#mso-gerr').textContent = (e && e.message) || (editId ? 'Enregistrement impossible.' : 'Création impossible.');
        toast((e && e.message) || 'Création impossible.', true);
      }
    };
  }
})();
