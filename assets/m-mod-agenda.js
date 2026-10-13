/* ============================================================
   Diaspo'Actif — Version téléphone : « Calendrier Diaspora » et « Mon Agenda »
   2026-10-13, demande explicite : "Dans le bouton événement. Créer le bouton calendrier. Qui
   permet de voir sur le mois actuel ou les mois suivants tous les événements qui sont notés. Et
   de pouvoir les ajouter à son propre agenda." + "affiche sur le téléphone le module agenda...
   pour les initiatives et les utilisateurs, avec les mêmes fonctionnements."
   Port fidèle du « Calendrier Diaspora » déjà construit sur ordinateur (evenements-app.html,
   fonctions cd*) et de « Mon Agenda » (agenda.html) : mêmes routes serveur (GET /api/evenements,
   GET/POST /api/agenda/events, GET /api/agenda/evenements-ajoutes,
   POST /api/evenements/:id/ajouter-agenda, DELETE /api/agenda/events/:id) — aucune ne distingue
   le rôle utilisateur/initiative, donc rien à adapter ici non plus (voir ces routes côté serveur).
   Volontairement HORS périmètre de ce portage (réservé à agenda.html, resté accessible tel
   quel) : connexion Google Agenda et rendez-vous entre membres — fonctionnalités avancées,
   pas demandées pour cette vue mobile.
   Routes : #/calendrier   Calendrier Diaspora (tous les événements de la plateforme)
            #/agenda       Mon agenda (événements personnels + événements ajoutés)
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast, needLogin } = A;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  let NAV = 0;
  const guard = k => { const my = ++NAV; return () => my === NAV && !!S.pane && S.pane.k === k; };

  function injectCss() {
    if ($('#m-mod-agenda-css')) return;
    const st = document.createElement('style'); st.id = 'm-mod-agenda-css';
    st.textContent = `
.ag-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 4px}
.ag-head span{font-weight:700;font-size:15px;text-transform:capitalize}
.ag-nav{background:var(--card);border:1px solid var(--border);border-radius:10px;width:34px;height:34px;font-size:18px;color:var(--text)}
.ag-nav:disabled{opacity:.35}
.ag-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:8px 14px 4px}
.ag-dow{text-align:center;font-size:11px;color:var(--muted);font-weight:700;padding:4px 0}
.ag-day{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:13px;background:none;border:none;color:var(--text)}
.ag-day.empty{visibility:hidden}
.ag-day.has{background:var(--bg);font-weight:700}
.ag-day.today{box-shadow:inset 0 0 0 2px var(--orange-d,#e8590c)}
.ag-day.sel{background:var(--orange-d,#e8590c);color:#fff}
.ag-day.passe.has{opacity:.55}
.ag-list{padding:10px 14px 4px}
.ag-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)}
.ag-item:last-child{border-bottom:none}
.ag-item-t{font-weight:700;font-size:13.5px}
.ag-item-m{font-size:12px;color:var(--muted);margin-top:2px}
.ag-item.passe{opacity:.55}
.ag-chip{font-size:11.5px;font-weight:700;color:var(--orange-d,#e8590c);white-space:nowrap;background:none;border:none}
.ag-in2{width:100%;padding:11px 14px;font-size:16px;border:1px solid var(--border);border-radius:12px;background:var(--card);color:var(--text);outline:none;font-family:inherit;box-sizing:border-box}
.ag-lbl{display:block;font-size:13px;font-weight:700;margin:12px 0 4px}
.ag-err{color:var(--red);font-size:14px;margin:8px 2px 0}
.ag-err:empty{display:none}
`;
    document.head.appendChild(st);
  }

  const skeleton = '<div class="sk skc" style="height:220px"></div><div class="sk skc"></div>';
  const MOIS_NOMS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS = ['L','M','M','J','V','S','D'];
  /* Clé locale AAAA-MM-JJ sans passer par toISOString() — même piège que le Calendrier Diaspora
     ordinateur (fuseaux positifs : toISOString() décale un minuit local au jour précédent). */
  const cleLocale = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const bornes = () => {
    const now = new Date();
    const min = { y: now.getFullYear(), m: now.getMonth() - 12 }; while (min.m < 0) { min.m += 12; min.y--; }
    const max = { y: now.getFullYear(), m: now.getMonth() + 12 }; while (max.m > 11) { max.m -= 12; max.y++; }
    return { min, max };
  };
  const estPasse = dateFinStr => dateFinStr && dateFinStr < cleLocale(new Date());

  /* Grille mensuelle réutilisable (Calendrier Diaspora ET Mon Agenda) : `parJour` est une map
     "AAAA-MM-JJ" -> tableau d'éléments ; `mois` = { y, m } ; `selection` = clé du jour choisi ou
     null ; `onJour(cle)` est appelé au clic sur un jour marqué. Retourne le HTML, à injecter puis
     ré-injecter soi-même (pas de wiring automatique des boutons de mois ici, voir les deux panes). */
  function grilleHtml(parJour, mois, selection) {
    const { y, m } = mois;
    const premierJourSemaine = (new Date(y, m, 1).getDay() + 6) % 7;
    const nbJours = new Date(y, m + 1, 0).getDate();
    const todayStr = cleLocale(new Date());
    let cells = '';
    for (let i = 0; i < premierJourSemaine; i++) cells += `<div class="ag-day empty">·</div>`;
    for (let d = 1; d <= nbJours; d++) {
      const cle = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const evts = parJour[cle];
      const classes = ['ag-day'];
      if (evts) classes.push('has');
      if (cle === todayStr) classes.push('today');
      if (evts && cle < todayStr) classes.push('passe');
      if (cle === selection) classes.push('sel');
      cells += evts
        ? `<button type="button" class="${classes.join(' ')}" data-jour="${cle}">${d}</button>`
        : `<div class="${classes.join(' ')}">${d}</div>`;
    }
    const { min, max } = bornes();
    const idx = y * 12 + m, minIdx = min.y * 12 + min.m, maxIdx = max.y * 12 + max.m;
    return `<div class="ag-head"><button type="button" class="ag-nav" data-mois="prec" ${idx <= minIdx ? 'disabled' : ''} aria-label="Mois précédent">‹</button><span>${MOIS_NOMS[m]} ${y}</span><button type="button" class="ag-nav" data-mois="suiv" ${idx >= maxIdx ? 'disabled' : ''} aria-label="Mois suivant">›</button></div>
      <div class="ag-grid">${JOURS.map(j => `<div class="ag-dow">${j}</div>`).join('')}${cells}</div>`;
  }

  /* Regroupe une liste d'événements plate-forme (date_evt → date_fin) par jour occupé —
     identique à cdDatesParJour() sur ordinateur, filet de sécurité 60 jours inclus. */
  function parJourEvenements(items) {
    const map = {};
    items.forEach(e => {
      if (!e.date_evt) return;
      const debut = new Date(String(e.date_evt).slice(0, 10) + 'T00:00:00'); if (isNaN(debut)) return;
      let fin = e.date_fin ? new Date(String(e.date_fin).slice(0, 10) + 'T00:00:00') : debut;
      if (isNaN(fin) || fin < debut) fin = debut;
      const cur = new Date(debut); let n = 0;
      while (cur <= fin && n < 60) { const cle = cleLocale(cur); (map[cle] = map[cle] || []).push(e); cur.setDate(cur.getDate() + 1); n++; }
    });
    return map;
  }
  /* Regroupe les entrées d'agenda personnel par jour (une seule date de référence : date_debut). */
  function parJourAgenda(items) {
    const map = {};
    items.forEach(e => { if (!e.date_debut) return; const cle = String(e.date_debut).slice(0, 10); (map[cle] = map[cle] || []).push(e); });
    return map;
  }

  /* ============================================================
     CALENDRIER DIASPORA — tous les événements de la plateforme
     ============================================================ */
  let CD = { evts: [], ajoutes: new Set(), mois: null, jour: null };
  async function viewCalendrier() {
    injectCss();
    const alive = guard('calendrier');
    setPane('Calendrier Diaspora', skeleton);
    try {
      const [re, ra] = await Promise.all([
        api('/api/evenements'),
        S.me ? api('/api/agenda/evenements-ajoutes').catch(() => ({ ids: [] })) : Promise.resolve({ ids: [] }),
      ]);
      if (!alive()) return;
      CD.evts = re.evenements || [];
      CD.ajoutes = new Set((ra.ids || []).map(Number));
      const now = new Date();
      CD.mois = { y: now.getFullYear(), m: now.getMonth() };
      CD.jour = null;
      setPane('Calendrier Diaspora', `<p class="small muted" style="padding:0 14px;margin:0 0 4px">Tous les événements de la plateforme, mois par mois. Touchez un jour marqué pour voir ses événements.</p><div id="ag-cal"></div><div id="ag-jour" class="ag-list"></div>`);
      peindreCalendrier();
    } catch (e) { if (alive()) setPane('Calendrier Diaspora', `<div class="empty"><div class="ei">${ic('cal', 'l')}</div><b>Chargement impossible</b>${esc(e.message || '')}<br><br><button class="btn sm" id="ag-retry">Réessayer</button></div>`), $('#ag-retry') && ($('#ag-retry').onclick = viewCalendrier); }
  }
  function peindreCalendrier() {
    const mount = $('#ag-cal'); if (!mount) return;
    mount.innerHTML = grilleHtml(parJourEvenements(CD.evts), CD.mois, CD.jour);
    $$('[data-mois]', mount).forEach(b => b.onclick = () => { changerMoisCalendrier(b.dataset.mois === 'suiv' ? 1 : -1); });
    $$('[data-jour]', mount).forEach(b => b.onclick = () => { CD.jour = b.dataset.jour; peindreCalendrier(); peindreJourCalendrier(b.dataset.jour); });
  }
  function changerMoisCalendrier(delta) {
    const { min, max } = bornes();
    let { y, m } = CD.mois; m += delta; if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    const idx = y * 12 + m; if (idx < min.y * 12 + min.m || idx > max.y * 12 + max.m) return;
    CD.mois = { y, m }; peindreCalendrier();
  }
  function peindreJourCalendrier(cle) {
    const box = $('#ag-jour'); if (!box) return;
    const evts = parJourEvenements(CD.evts)[cle] || [];
    const label = new Date(cle + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    box.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:4px;text-transform:capitalize">${esc(label)}</div>` + (evts.length ? evts.map(e => {
      const passe = estPasse(String(e.date_fin || e.date_evt).slice(0, 10));
      const ajoute = CD.ajoutes.has(Number(e.id));
      return `<div class="ag-item ${passe ? 'passe' : ''}">
        <div><div class="ag-item-t">${esc(e.titre || 'Sans titre')}</div><div class="ag-item-m">${esc(e.ville || e.lieu || '')}${passe ? ' · Terminé' : ''}</div></div>
        <span style="display:flex;gap:12px;align-items:center;">
          <button type="button" class="ag-chip" data-ajouter="${e.id}" ${ajoute ? 'disabled' : ''}>${ajoute ? '✅ Ajouté' : '📅 Agenda'}</button>
          <button type="button" class="ag-chip" data-voir="${e.id}">Voir ›</button>
        </span></div>`;
    }).join('') : `<p class="small muted">Aucun événement ce jour.</p>`);
    $$('[data-ajouter]', box).forEach(b => b.onclick = () => ajouterEvenementAgenda(Number(b.dataset.ajouter), b));
    $$('[data-voir]', box).forEach(b => b.onclick = () => { location.hash = '#/evenement/' + b.dataset.voir; });
  }
  async function ajouterEvenementAgenda(evtId, btn) {
    if (!(await needLogin('Connectez-vous pour ajouter cet événement à votre agenda.'))) return;
    if (btn) btn.disabled = true;
    try {
      const r = await api('/api/evenements/' + evtId + '/ajouter-agenda', { method: 'POST', body: {} });
      CD.ajoutes.add(evtId);
      if (btn) btn.textContent = '✅ Ajouté';
      toast(r.deja ? 'Déjà dans votre agenda' : 'Ajouté à votre agenda ✓');
    } catch (e) { toast(e.message || 'Impossible d’ajouter cet événement.', true); if (btn) btn.disabled = false; }
  }

  /* ============================================================
     MON AGENDA — événements personnels + événements ajoutés
     ============================================================ */
  let MA = { items: [], mois: null, jour: null };
  async function viewAgenda() {
    injectCss();
    if (!(await needLogin('Connectez-vous pour voir votre agenda.'))) return;
    const alive = guard('agenda');
    setPane('Mon agenda', skeleton);
    const now = new Date();
    MA.mois = { y: now.getFullYear(), m: now.getMonth() };
    MA.jour = null;
    await chargerAgenda(alive);
  }
  async function chargerAgenda(alive) {
    const { min, max } = bornes();
    const from = `${min.y}-${String(min.m + 1).padStart(2, '0')}-01`;
    const to = `${max.y}-${String(max.m + 1).padStart(2, '0')}-28`;
    try {
      const items = await api('/api/agenda/events?from=' + from + '&to=' + to);
      if (alive && !alive()) return;
      MA.items = Array.isArray(items) ? items : [];
      setPane('Mon agenda', `<div id="ag-cal"></div><div id="ag-jour" class="ag-list"></div><p class="small muted" style="padding:10px 14px 0">Connexion Google Agenda et rendez-vous entre membres : <a href="agenda.html?version=ordinateur" style="text-decoration:underline">options avancées (ordinateur)</a>.</p>`, `<button class="btn block sp" id="ag-add" type="button">${ic('plus', 's')} Ajouter un événement</button>`);
      peindreAgenda();
      $('#ag-add').onclick = () => ouvrirFormAgenda();
    } catch (e) { if (!alive || alive()) setPane('Mon agenda', `<div class="empty"><div class="ei">${ic('cal', 'l')}</div><b>Chargement impossible</b>${esc(e.message || '')}</div>`); }
  }
  function peindreAgenda() {
    const mount = $('#ag-cal'); if (!mount) return;
    mount.innerHTML = grilleHtml(parJourAgenda(MA.items), MA.mois, MA.jour);
    $$('[data-mois]', mount).forEach(b => b.onclick = () => {
      const { min, max } = bornes(); let { y, m } = MA.mois; m += (b.dataset.mois === 'suiv' ? 1 : -1);
      if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
      const idx = y * 12 + m; if (idx < min.y * 12 + min.m || idx > max.y * 12 + max.m) return;
      MA.mois = { y, m }; peindreAgenda();
    });
    $$('[data-jour]', mount).forEach(b => b.onclick = () => { MA.jour = b.dataset.jour; peindreAgenda(); peindreJourAgenda(b.dataset.jour); });
    if (MA.jour) peindreJourAgenda(MA.jour);
  }
  function peindreJourAgenda(cle) {
    const box = $('#ag-jour'); if (!box) return;
    const evts = (parJourAgenda(MA.items)[cle] || []).sort((a, b) => String(a.date_debut).localeCompare(String(b.date_debut)));
    const label = new Date(cle + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    box.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:4px;text-transform:capitalize">${esc(label)}</div>` + (evts.length ? evts.map(e => {
      const heure = e.all_day ? 'Toute la journée' : String(e.date_debut).slice(11, 16);
      return `<div class="ag-item">
        <div><div class="ag-item-t">${esc(e.titre)}</div><div class="ag-item-m">${esc(heure)}${e.lieu ? ' · ' + esc(e.lieu) : ''}${e.evenement_id ? ' · Événement Diaspo’Actif' : ''}</div></div>
        <button type="button" class="ag-chip" data-suppr="${e.id}" style="color:#dc2626;" aria-label="Retirer">🗑️</button></div>`;
    }).join('') : `<p class="small muted">Aucun événement ce jour.</p>`);
    $$('[data-suppr]', box).forEach(b => b.onclick = () => supprimerAgenda(Number(b.dataset.suppr)));
  }
  async function supprimerAgenda(id) {
    try {
      await api('/api/agenda/events/' + id, { method: 'DELETE' });
      MA.items = MA.items.filter(e => Number(e.id) !== id);
      peindreAgenda(); if (MA.jour) peindreJourAgenda(MA.jour);
      toast('Retiré de votre agenda ✓');
    } catch (e) { toast(e.message || 'Suppression impossible.', true); }
  }
  function ouvrirFormAgenda() {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const close = A.openSheet(`<h2 style="margin:2px 0 4px;font-size:19px">Ajouter un événement</h2>
      <label class="ag-lbl" for="ag-f-titre">Titre</label><input id="ag-f-titre" class="ag-in2" placeholder="Ex : Réunion, rendez-vous…">
      <label class="ag-lbl" for="ag-f-date">Date</label><input id="ag-f-date" class="ag-in2" type="date" value="${aujourdhui}">
      <div style="display:flex;gap:10px;">
        <div style="flex:1"><label class="ag-lbl" for="ag-f-hd">Début</label><input id="ag-f-hd" class="ag-in2" type="time" value="09:00"></div>
        <div style="flex:1"><label class="ag-lbl" for="ag-f-hf">Fin</label><input id="ag-f-hf" class="ag-in2" type="time" value="10:00"></div>
      </div>
      <label class="ag-lbl" for="ag-f-lieu">Lieu <span class="muted">(facultatif)</span></label><input id="ag-f-lieu" class="ag-in2" placeholder="Ville, adresse, lien…">
      <div class="ag-err" id="ag-f-err" role="alert"></div>
      <button class="btn block" id="ag-f-send" type="button" style="margin-top:12px">Ajouter</button>`);
    $('#ag-f-send').onclick = async () => {
      const err = $('#ag-f-err'), titre = $('#ag-f-titre').value.trim(), date = $('#ag-f-date').value;
      err.textContent = '';
      if (!titre) { err.textContent = 'Le titre est requis.'; return; }
      if (!date) { err.textContent = 'La date est requise.'; return; }
      const hd = $('#ag-f-hd').value || '09:00', hf = $('#ag-f-hf').value || hd;
      const b = $('#ag-f-send'); b.disabled = true; b.textContent = 'Ajout…';
      try {
        await api('/api/agenda/events', { method: 'POST', body: {
          titre, date_debut: date + 'T' + hd, date_fin: date + 'T' + hf, lieu: $('#ag-f-lieu').value.trim() || null,
        } });
        close(); toast('Ajouté à votre agenda ✓');
        await chargerAgenda();
      } catch (e) { err.textContent = e.message || 'Ajout impossible.'; b.disabled = false; b.textContent = 'Ajouter'; }
    };
  }

  window.MMods = window.MMods || {};
  window.MMods.calendrier = viewCalendrier;
  window.MMods.agenda = viewAgenda;
})();
