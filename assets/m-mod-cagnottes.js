/* ============================================================
   Diaspo'Actif — Version téléphone : module « Mes cagnottes et dons » (comptes Initiative)
   Route : #/mescagnottes                       liste (chiffres, statut, progression)
           #/mescagnottes/voir/ID               détail : actions, dons reçus
           #/mescagnottes/nouvelle[/TYPE]       création (campagne | recurrent | occasionnel)
           #/mescagnottes/modifier/ID           modification
   Mêmes routes d'API et mêmes règles que la rubrique « Cagnottes et dons » de dashboard-initiative.html
   (le type d'un don ne se change plus après la création ; seul un brouillon se supprime).
   Chargé APRÈS m.js : s'appuie uniquement sur window.MApp.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast } = A;
  window.MMods = window.MMods || {};

  const NOM = 'Mes cagnottes et dons';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const SK = '<div class="sk skc" style="height:96px"></div><div class="sk skc" style="height:96px"></div><div class="sk skc" style="height:96px"></div>';
  const STATUTS = { brouillon: ['Brouillon', ''], active: ['Active', 'g'], en_pause: ['En pause', 'o'], terminee: ['Terminée', ''], expiree: ['Expirée', 'r'] };
  const TYPES = { campagne: ['🪙', 'Cagnotte', 'Un objectif à atteindre avant une date.'], recurrent: ['💚', 'Don récurrent', 'Les donateurs soutiennent chaque mois, trimestre ou année.'], occasionnel: ['🎁', 'Don occasionnel', 'Un don ponctuel, sans objectif ni date de fin.'] };
  const RECURRENCES = [['mensuel', 'Tous les mois'], ['trimestriel', 'Tous les 3 mois'], ['annuel', 'Tous les ans']];
  const DEVISES = ['EUR', 'USD', 'XOF', 'XAF', 'CAD', 'GBP'];
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  function css() {
    if ($('#m-mod-cagnottes-css')) return;
    const s = document.createElement('style');
    s.id = 'm-mod-cagnottes-css';
    s.textContent = `
.mca-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.mca-stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 10px;text-align:center}
.mca-stat b{display:block;font-size:20px;line-height:1.2;color:var(--navy)}
.mca-stat span{font-size:12.5px;color:var(--muted)}
.mca-bar{height:8px;border-radius:4px;background:var(--border);overflow:hidden;margin:8px 0 4px}
.mca-bar i{display:block;height:100%;background:var(--green);border-radius:4px}
.mca-note{background:var(--sky-l);border-radius:12px;padding:12px 14px;font-size:13.5px;color:var(--navy);margin-bottom:12px}
.mca-note b{display:block;margin-bottom:2px}
.mca-warn{background:var(--orange-l);color:var(--orange-d)}
.mca-f label.mca-l{display:block;font-weight:700;font-size:13.5px;margin:14px 2px 5px}
.mca-f label.mca-l small{font-weight:400;color:var(--muted)}
.mca-f input[type=text],.mca-f input[type=number],.mca-f input[type=date],.mca-f select,.mca-f textarea{display:block;width:100%;min-width:0;min-height:46px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:#fff;font-size:16px;color:var(--text);box-sizing:border-box}
.mca-f textarea{min-height:110px;resize:vertical;line-height:1.4}
.mca-f [aria-invalid=true]{border-color:var(--red);background:var(--red-l)}
.mca-err{color:var(--red);font-size:13px;margin:4px 2px 0}
.mca-err:empty{display:none}
.mca-gerr{background:var(--red-l);color:var(--red);border-radius:12px;padding:10px 14px;font-weight:600;font-size:14px;margin-bottom:12px}
.mca-gerr:empty{display:none}
.mca-opt{display:flex;gap:12px;align-items:flex-start;border:1.5px solid var(--border);background:#fff;border-radius:14px;padding:12px;margin-bottom:8px;cursor:pointer}
.mca-opt.on{border-color:var(--navy2);background:var(--sky-l)}
.mca-opt input{margin:3px 0 0;width:20px;height:20px;flex:none;accent-color:var(--navy2)}
.mca-opt b{display:block;font-size:15px}
.mca-opt small{display:block;color:var(--muted);font-size:12.5px;line-height:1.3}
.mca-hint{font-size:12.5px;color:var(--muted);margin:5px 2px 0;line-height:1.35}
.mca-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mca-img{display:flex;gap:12px;align-items:center}
.mca-img img,.mca-img .ph{width:72px;height:72px;border-radius:12px;object-fit:cover;background:var(--border);flex:none}
.mca-acts{display:grid;gap:8px;margin:12px 0}
.mca-don{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--border)}
.mca-don:first-child{border-top:0}
.mca-don .m{font-weight:700;white-space:nowrap}
`;
    document.head.appendChild(s);
  }

  /* ---------- outils ---------- */
  let rendu = 0; // une réponse tardive ne doit jamais écraser un autre écran
  const vivant = t => t === rendu && /^#\/mescagnottes/.test(location.hash);
  const paint = (t, titre, html, foot) => { if (vivant(t)) setPane(titre, html, foot); };
  const money = (n, d) => A.money ? A.money(n, d) : (Number(n) || 0) + ' ' + (d || '€');
  const pl = (n, un, plus) => n + ' ' + (n > 1 ? plus : un);
  function dateCourte(s) { const p = A.parseDay(s); return p ? p.d + ' ' + MOIS[p.m - 1] + ' ' + p.y : ''; }
  const lienPublic = c => location.origin + '/cagnotte.html?slug=' + encodeURIComponent(c.slug);
  const typeDe = c => TYPES[c.type_don] ? c.type_don : 'campagne';

  function gate(titre) {
    if (!S.me) {
      setPane(titre, A.loginCard('Connectez-vous avec votre compte Initiative pour gérer vos cagnottes et vos dons.'));
      const b = $('#go-login'); if (b) b.onclick = () => A.openLogin();
      return false;
    }
    if (S.me.role !== 'initiative') {
      setPane(titre, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Réservé aux comptes Initiative</b>Les cagnottes et les dons sont gérés depuis un compte Initiative. Changez de compte si vous en avez un lié.<br><br><a class="btn" href="#/moi">Retour à mon espace</a></div>`);
      return false;
    }
    if (A.premiumLocked(2)) { lockPane(titre); return false; }
    return true;
  }
  function lockPane(titre) {
    setPane(titre, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Module Premium</b>Votre abonnement Premium est arrivé à expiration : vos cagnottes et leurs dons sont conservés, mais leur gestion est suspendue jusqu’au renouvellement.<br><br><a class="btn" href="mon-abonnement.html">Voir mon abonnement</a></div>`);
    A.premiumSheet(NOM);
  }
  function showError(t, titre, e, titreErreur, retry) {
    if (!vivant(t)) return;
    if (e && e.status === 402) return lockPane(titre);
    if (e && e.status === 401) { S.me = null; return gate(titre); }
    setPane(titre, `<div class="empty"><div class="ei">${ic('close', 'l')}</div><b>${esc(titreErreur)}</b>${esc((e && e.message) || 'Une erreur est survenue.')}<br><br><button class="btn sm" id="mca-retry">Réessayer</button></div>`);
    $('#mca-retry').onclick = retry;
  }
  function erreurAction(er) {
    if (er && er.status === 402) { A.premiumSheet(NOM); return; }
    toast((er && er.message) || 'Une erreur est survenue.', true);
  }
  async function partager(url, titre) {
    try {
      if (navigator.share) await navigator.share({ title: titre, text: titre, url });
      else { await navigator.clipboard.writeText(url); toast('Lien copié'); }
    } catch (er) {
      if (er && er.name === 'AbortError') return;
      try { await navigator.clipboard.writeText(url); toast('Lien copié'); } catch (e2) { toast('Partage impossible sur cet appareil.', true); }
    }
  }

  /* ---------- aiguillage ---------- */
  window.MMods.mescagnottes = function (b, c) {
    const t = ++rendu; css();
    if (!b) return liste(t);
    if (b === 'voir' && /^\d+$/.test(c || '')) return detail(t, Number(c));
    if (b === 'nouvelle') return formulaire(t, null, TYPES[c] ? c : 'campagne');
    if (b === 'modifier' && /^\d+$/.test(c || '')) return formulaire(t, Number(c));
    location.replace('#/mescagnottes');
  };

  /* ============================================================
     LISTE
     ============================================================ */
  function carte(c) {
    const st = STATUTS[c.statut] || [c.statut, ''], ty = TYPES[typeDe(c)];
    const obj = Number(c.objectif_montant) || 0, pct = obj ? Math.min(100, Math.round((Number(c.montant_collecte) || 0) / obj * 100)) : null;
    return `<a class="card" href="#/mescagnottes/voir/${Number(c.id)}" style="display:block;color:inherit"><div class="pad">
      <div class="row" style="align-items:flex-start"><div class="sp"><div style="font-weight:700;font-size:16px;line-height:1.25;word-break:break-word">${esc(A.strip(c.titre))}</div>
        <div class="small muted">${ty[0]} ${esc(ty[1])}${c.date_fin ? ' · jusqu’au ' + esc(dateCourte(c.date_fin)) : ''}</div></div><span class="badge ${st[1]}">${esc(st[0])}</span></div>
      <div style="margin-top:8px"><b>${esc(money(c.montant_collecte, c.devise))}</b>${obj ? ` <span class="muted small">sur ${esc(money(obj, c.devise))}</span>` : ' <span class="muted small">collectés</span>'}</div>
      ${pct == null ? '' : `<div class="mca-bar"><i style="width:${pct}%"></i></div><div class="small muted">${pct} %</div>`}
    </div></a>`;
  }
  async function liste(t) {
    if (!gate(NOM)) return;
    setPane(NOM, SK);
    let rows;
    try { rows = (await api('/api/cagnottes/mes')).cagnottes || []; }
    catch (e) { return showError(t, NOM, e, 'Impossible de charger vos cagnottes', () => liste(++rendu)); }
    if (!vivant(t)) return;
    const foot = `<button class="btn block" id="mca-new">${ic('plus', 's')} Créer une cagnotte ou un don</button>`;
    const total = rows.reduce((n, c) => n + (Number(c.montant_collecte) || 0), 0), actives = rows.filter(c => c.statut === 'active').length;
    const devs = [...new Set(rows.map(c => c.devise || 'EUR'))];
    const html = rows.length
      ? `<div class="mca-stats"><div class="mca-stat"><b>${rows.length}</b><span>${rows.length > 1 ? 'cagnottes et dons' : 'cagnotte ou don'}</span></div><div class="mca-stat"><b>${actives}</b><span>${actives > 1 ? 'actives' : 'active'}</span></div>${devs.length === 1 ? `<div class="mca-stat" style="grid-column:1/-1"><b>${esc(money(total, devs[0]))}</b><span>collectés au total</span></div>` : ''}</div>${rows.map(carte).join('')}`
      : `<div class="empty"><div class="ei">${ic('heart', 'l')}</div><b>Aucune cagnotte pour le moment</b>Créez une cagnotte, un don récurrent ou un don occasionnel : vos soutiens pourront donner depuis leur téléphone.</div>`;
    paint(t, NOM, html, foot);
    $('#mca-new').onclick = choisirType;
  }
  function choisirType() {
    const close = A.openSheet(`<div style="font-weight:700;font-size:18px;margin-bottom:10px">Que voulez-vous créer ?</div>
      ${Object.entries(TYPES).map(([k, v]) => `<a class="mca-opt" href="#/mescagnottes/nouvelle/${k}" data-close="1"><span style="font-size:24px">${v[0]}</span><span><b>${esc(v[1])}</b><small>${esc(v[2])}</small></span></a>`).join('')}
      <button class="btn out block" id="mca-cancel" style="margin-top:6px">Annuler</button>`);
    $$('#sheet [data-close]').forEach(a => a.addEventListener('click', () => close()));
    const c = $('#mca-cancel'); if (c) c.onclick = close;
  }

  /* ============================================================
     DÉTAIL
     ============================================================ */
  async function detail(t, id) {
    if (!gate(NOM)) return;
    setPane('Cagnotte', SK);
    let c, dons = null;
    try { c = (await api('/api/cagnottes/' + id)).cagnotte; }
    catch (e) { return showError(t, 'Cagnotte', e, 'Impossible de charger cette cagnotte', () => detail(++rendu, id)); }
    if (!vivant(t)) return;
    try { dons = (await api(`/api/cagnottes/${id}/contributions`)).contributions || []; } catch (e) { dons = null; }
    if (!vivant(t)) return;
    const st = STATUTS[c.statut] || [c.statut, ''], ty = TYPES[typeDe(c)];
    const obj = Number(c.objectif_montant) || 0, pct = obj ? Math.min(100, Math.round((Number(c.montant_collecte) || 0) / obj * 100)) : null;
    const kv = (k, v) => v ? `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>` : '';
    const rec = (RECURRENCES.find(r => r[0] === c.recurrence_periodicite) || [])[1];
    const a = (k, cls, lib) => `<button class="btn ${cls || ''} block" data-a="${k}">${lib}</button>`;
    const acts = [];
    if (c.statut === 'brouillon') acts.push(a('publier', '', 'Publier maintenant'));
    if (c.statut === 'active') acts.push(a('pause', 'out', 'Mettre en pause'));
    if (c.statut === 'en_pause') acts.push(a('reprendre', '', 'Reprendre la collecte'));
    if (c.statut === 'terminee' && c.statut_manuel === 'cloturee') acts.push(a('reprendre', 'out', 'Rouvrir la cagnotte'));
    if (c.est_publiee && c.statut !== 'terminee') acts.push(a('cloturer', 'out', 'Clôturer'));
    acts.push(`<a class="btn out block" href="#/mescagnottes/modifier/${id}">Modifier</a>`);
    if (c.statut === 'brouillon') acts.push(a('supprimer', 'out', 'Supprimer ce brouillon'));
    const vedetteOk = c.visibilite !== 'privee' && c.statut === 'active';
    const html = `${c.image_url ? `<img src="${A.attrUrl(c.image_url)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:14px;margin-bottom:12px" onerror="this.remove()">` : ''}
      <div class="card"><div class="pad">
        <div class="row" style="align-items:flex-start"><h2 class="sp" style="margin:0;font-size:20px;line-height:1.25;word-break:break-word">${esc(A.strip(c.titre))}</h2><span class="badge ${st[1]}">${esc(st[0])}</span></div>
        <div class="small muted" style="margin:4px 0 8px">${ty[0]} ${esc(ty[1])}${c.categorie ? ' · ' + esc(c.categorie) : ''}</div>
        <div><b style="font-size:22px">${esc(money(c.montant_collecte, c.devise))}</b>${obj ? ` <span class="muted">sur ${esc(money(obj, c.devise))}</span>` : ' <span class="muted">collectés</span>'}</div>
        ${pct == null ? '' : `<div class="mca-bar"><i style="width:${pct}%"></i></div><div class="small muted">${pct} % de l’objectif</div>`}
        <div style="margin-top:10px">${kv('Périodicité', typeDe(c) === 'recurrent' ? rec : '')}${kv('Début', dateCourte(c.date_debut))}${kv('Fin', dateCourte(c.date_fin))}${kv('Visibilité', c.visibilite === 'privee' ? 'Privée (sur invitation)' : 'Publique')}</div>
        ${c.description ? `<p class="small" style="white-space:pre-line;word-break:break-word;margin:10px 0 0">${esc(A.strip(c.description))}</p>` : ''}
      </div></div>
      <div class="mca-acts">${acts.join('')}</div>
      ${c.est_publiee ? `<div class="mca-acts" style="margin-top:0"><button class="btn out block" data-a="partager">${ic('share', 's')} Partager le lien</button>${vedetteOk ? `<label class="mca-opt ${Number(c.est_vedette) ? 'on' : ''}" style="margin:0"><input type="checkbox" id="mca-ved" ${Number(c.est_vedette) ? 'checked' : ''}><span><b>Mettre en avant partout</b><small>Le bouton « Faire un don » de vos pages publiques mène à ce don. Un seul à la fois.</small></span></label>` : ''}</div>` : '<div class="mca-note mca-warn"><b>Pas encore publiée</b>Cette cagnotte est un brouillon : personne ne la voit tant que vous ne l’avez pas publiée.</div>'}
      <div class="h2">DONS REÇUS</div>
      ${dons == null ? '<p class="small muted">Liste momentanément indisponible.</p>' : (dons.length ? `<div class="card"><div class="pad">${dons.slice(0, 30).map(d => `<div class="mca-don"><div class="sp"><div style="font-weight:600;word-break:break-word">${esc(d.anonyme ? 'Anonyme' : (d.contributeur_nom || 'Donateur'))}</div>${d.message ? `<div class="small muted" style="word-break:break-word">« ${esc(A.strip(d.message))} »</div>` : ''}<div class="small muted">${esc(dateCourte(d.created_at))}</div></div><div class="m">${esc(money(d.montant, d.devise || c.devise))}</div></div>`).join('')}${dons.length > 30 ? `<p class="small muted" style="margin:8px 0 0">${dons.length - 30} autres dons : liste complète sur ordinateur.</p>` : ''}</div></div>` : '<div class="empty" style="padding:18px"><b>Aucun don pour le moment</b>Partagez le lien de votre cagnotte pour recevoir vos premiers dons.</div>')}
      <p class="small muted" style="margin:12px 4px">Participants autorisés, co-organisateurs, nouvelles de la cagnotte et lien avec un événement : à faire sur ordinateur.</p>`;
    paint(t, 'Cagnotte', html);
    $$('[data-a]').forEach(b => b.onclick = () => action(t, c, b));
    const v = $('#mca-ved'); if (v) v.onchange = () => vedette(t, c, v);
  }
  async function action(t, c, btn) {
    const k = btn.dataset.a;
    if (k === 'partager') return partager(lienPublic(c), A.strip(c.titre));
    const msg = { cloturer: 'Clôturer cette cagnotte ?\n\nPlus personne ne pourra donner. Vous pourrez la rouvrir plus tard.', supprimer: 'Supprimer ce brouillon ?\n\nCette action est définitive.', pause: 'Mettre cette cagnotte en pause ?\n\nLes dons sont suspendus jusqu’à la reprise.' }[k];
    if (msg && !confirm(msg)) return;
    $$('[data-a]').forEach(b => { b.disabled = true; });
    try {
      if (k === 'supprimer') { await api('/api/cagnottes/' + Number(c.id), { method: 'DELETE' }); toast('Brouillon supprimé'); location.replace('#/mescagnottes'); return; }
      await api(`/api/cagnottes/${Number(c.id)}/statut`, { method: 'PATCH', body: { action: k } });
      toast({ publier: 'Cagnotte publiée ✓', pause: 'Cagnotte mise en pause', reprendre: 'Collecte reprise ✓', cloturer: 'Cagnotte clôturée' }[k]);
      detail(++rendu, Number(c.id));
    } catch (er) { $$('[data-a]').forEach(b => { b.disabled = false; }); erreurAction(er); }
  }
  async function vedette(t, c, cb) {
    const cible = cb.checked; cb.disabled = true;
    try { await api(`/api/cagnottes/${Number(c.id)}/vedette`, { method: 'PATCH', body: { vedette: cible } }); toast(cible ? 'Mis en avant partout ✓' : 'Retiré de la mise en avant'); detail(++rendu, Number(c.id)); }
    catch (er) { cb.checked = !cible; cb.disabled = false; erreurAction(er); }
  }

  /* ============================================================
     CRÉATION / MODIFICATION
     ============================================================ */
  /* Photo : réduite dans le navigateur (≤ 1600 px, JPEG) avant l'envoi, comme le fait le site. */
  function reduirePhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(b => b ? resolve(b) : reject(new Error('Cette image ne peut pas être traitée.')), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Cette image ne peut pas être lue. Choisissez une photo JPEG, PNG ou WebP.')); };
      img.src = url;
    });
  }
  async function envoyerPhoto(blob) {
    const fd = new FormData(); fd.append('cagnotte', blob, 'cagnotte.jpg');
    let r; try { r = await fetch('/api/upload/cagnotte', { method: 'POST', body: fd, credentials: 'same-origin' }); }
    catch (e) { throw new Error('Connexion impossible pendant l’envoi de la photo. Vérifiez votre réseau.'); }
    let j = null; try { j = await r.json(); } catch (e) { /* réponse vide */ }
    if (!r.ok || !j || !j.url) throw Object.assign(new Error((j && j.error) || 'La photo n’a pas pu être envoyée.'), { status: r.status });
    return j.url;
  }
  let CATS = null;
  async function categories() {
    if (CATS) return CATS;
    try { CATS = (await api('/api/cagnottes/categories')).categories || []; } catch (e) { CATS = []; }
    return CATS;
  }

  async function formulaire(t, id, typeInit) {
    const edition = !!id, titrePane = edition ? 'Modifier' : 'Nouvelle cagnotte';
    if (!gate(titrePane)) return;
    setPane(titrePane, SK);
    let c = { titre: '', description: '', categorie: '', image_url: '', objectif_montant: null, devise: 'EUR', date_debut: '', date_fin: '', visibilite: 'publique', afficher_participants: 1, afficher_montants: 1, type_don: typeInit || 'campagne', recurrence_periodicite: 'mensuel' };
    let cats;
    try {
      if (edition) c = (await api('/api/cagnottes/' + id)).cagnotte;
      cats = await categories();
    } catch (e) { return showError(t, titrePane, e, 'Impossible de charger cette cagnotte', () => formulaire(++rendu, id, typeInit)); }
    if (!vivant(t)) return;
    const type = typeDe(c), ty = TYPES[type], recurrent = type === 'recurrent';
    const j10 = s => (s || '').slice(0, 10);
    let image = c.image_url || '';
    const html = `<form id="mca-form" class="mca-f" novalidate autocomplete="off">
      <div class="mca-gerr" id="mca-gerr" role="alert"></div>
      <div class="mca-note"><b>${ty[0]} ${esc(ty[1])}</b>${esc(ty[2])}${edition ? ' Le type ne peut plus être changé après la création.' : ''}</div>
      <label class="mca-l" for="mca-titre">Titre *</label>
      <input type="text" id="mca-titre" maxlength="140" value="${esc(c.titre)}" placeholder="Ex. : Un puits pour le village" aria-describedby="mca-e-titre"><div class="mca-err" id="mca-e-titre" role="alert"></div>
      <label class="mca-l" for="mca-desc">Description <small>(pourquoi donner ?)</small></label>
      <textarea id="mca-desc" placeholder="Expliquez le projet, à quoi servira l’argent…">${esc(c.description || '')}</textarea>
      <label class="mca-l" for="mca-cat">Catégorie</label>
      <select id="mca-cat"><option value="">— Aucune —</option>${cats.map(x => `<option value="${esc(x)}" ${c.categorie === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <label class="mca-l">Image principale <small>(facultative)</small></label>
      <div class="mca-img"><div id="mca-prev">${image ? `<img src="${A.attrUrl(image)}" alt="">` : '<div class="ph"></div>'}</div>
        <div class="sp"><input type="file" id="mca-file" accept="image/*" style="font-size:14px;max-width:100%"><div class="mca-hint" id="mca-img-st"></div></div></div>
      <div class="mca-2"><div><label class="mca-l" for="mca-obj">Objectif <small>(facultatif)</small></label>
        <input type="number" id="mca-obj" min="1" step="1" inputmode="decimal" value="${c.objectif_montant ? Number(c.objectif_montant) : ''}" placeholder="Ex. : 5000" aria-describedby="mca-e-obj"><div class="mca-err" id="mca-e-obj" role="alert"></div></div>
        <div><label class="mca-l" for="mca-dev">Devise</label><select id="mca-dev">${DEVISES.map(d => `<option ${((c.devise || 'EUR') === d) ? 'selected' : ''}>${d}</option>`).join('')}</select></div></div>
      ${recurrent ? `<label class="mca-l" for="mca-rec">Périodicité</label><select id="mca-rec">${RECURRENCES.map(([v, l]) => `<option value="${v}" ${(c.recurrence_periodicite || 'mensuel') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
      <div class="mca-2">${recurrent ? '' : `<div><label class="mca-l" for="mca-d1">Début <small>(facultatif)</small></label><input type="date" id="mca-d1" value="${esc(j10(c.date_debut))}"></div>`}
        <div ${recurrent ? 'style="grid-column:1/-1"' : ''}><label class="mca-l" for="mca-d2">Fin <small>(facultative)</small></label><input type="date" id="mca-d2" value="${esc(j10(c.date_fin))}" aria-describedby="mca-e-d2"><div class="mca-err" id="mca-e-d2" role="alert"></div></div></div>
      <div class="h2">VISIBILITÉ</div>
      <label class="mca-opt ${c.visibilite !== 'privee' ? 'on' : ''}"><input type="radio" name="mca-vis" value="publique" ${c.visibilite !== 'privee' ? 'checked' : ''}><span><b>Publique</b><small>Visible par tous, sur le fil et dans le catalogue des cagnottes.</small></span></label>
      <label class="mca-opt ${c.visibilite === 'privee' ? 'on' : ''}"><input type="radio" name="mca-vis" value="privee" ${c.visibilite === 'privee' ? 'checked' : ''}><span><b>Privée</b><small>Seules les personnes que vous invitez peuvent donner (invitations : sur ordinateur).</small></span></label>
      <label class="mca-opt ${Number(c.afficher_participants) !== 0 ? 'on' : ''}"><input type="checkbox" id="mca-ap" ${Number(c.afficher_participants) !== 0 ? 'checked' : ''}><span><b>Afficher la liste des donateurs</b></span></label>
      <label class="mca-opt ${Number(c.afficher_montants) !== 0 ? 'on' : ''}"><input type="checkbox" id="mca-am" ${Number(c.afficher_montants) !== 0 ? 'checked' : ''}><span><b>Afficher les montants donnés</b></span></label>
      ${type === 'occasionnel' ? '<p class="mca-hint">Pour relier ce don à un formulaire d’inscription ou à un événement, utilisez l’ordinateur.</p>' : ''}
    </form>`;
    setPane(titrePane, html, `<button class="btn block" id="mca-save">${edition ? 'Enregistrer' : 'Créer'}</button>`);

    const form = $('#mca-form'); form.onsubmit = ev => ev.preventDefault();
    $$('.mca-opt input', form).forEach(r => r.addEventListener('change', () => {
      if (r.type === 'radio') $$(`.mca-opt input[name="${r.name}"]`, form).forEach(x => x.closest('.mca-opt').classList.toggle('on', x.checked));
      else r.closest('.mca-opt').classList.toggle('on', r.checked);
    }));
    $('#mca-file').onchange = async ev => {
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      const st = $('#mca-img-st'); st.textContent = 'Envoi de la photo…';
      try { image = await envoyerPhoto(await reduirePhoto(f)); $('#mca-prev').innerHTML = `<img src="${A.attrUrl(image)}" alt="">`; st.textContent = 'Photo prête ✓'; }
      catch (er) { st.textContent = (er && er.message) || 'Envoi impossible.'; }
    };
    const val = id2 => { const x = $('#' + id2); return x ? x.value.trim() : ''; };
    const bad = (id2, msg) => { const x = $('#mca-' + id2), m = $('#mca-e-' + id2); if (x) x.setAttribute('aria-invalid', 'true'); if (m) m.textContent = msg; return x; };
    function valider() {
      $$('#mca-form [aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
      $$('#mca-form .mca-err').forEach(x => { x.textContent = ''; }); $('#mca-gerr').textContent = '';
      let first = null; const mark = (i, m) => { const x = bad(i, m); if (!first) first = x; };
      if (!val('mca-titre')) mark('titre', 'Donnez un titre à votre cagnotte.');
      if (val('mca-obj') !== '' && !(Number(val('mca-obj')) > 0)) mark('obj', 'L’objectif doit être supérieur à 0, ou laissé vide.');
      const d1 = val('mca-d1'), d2 = val('mca-d2');
      if (d1 && d2 && new Date(d2) <= new Date(d1)) mark('d2', 'La date de fin doit être après la date de début.');
      if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (first.focus) first.focus(); $('#mca-gerr').textContent = 'Certains champs sont à corriger.'; return false; }
      return true;
    }
    $('#mca-save').onclick = async ev => {
      if (!valider()) return;
      const btn = ev.currentTarget;
      const body = {
        titre: val('mca-titre'), description: val('mca-desc') || null, categorie: val('mca-cat') || null, image_url: image || null,
        objectif_montant: val('mca-obj') !== '' ? Number(val('mca-obj')) : null, devise: val('mca-dev') || 'EUR',
        date_debut: recurrent ? null : (val('mca-d1') || null), date_fin: val('mca-d2') || null,
        visibilite: ($('input[name="mca-vis"]:checked', form) || {}).value === 'privee' ? 'privee' : 'publique',
        afficher_participants: !!$('#mca-ap').checked, afficher_montants: !!$('#mca-am').checked
      };
      if (!edition) body.type_don = type;
      if (recurrent) body.recurrence_periodicite = val('mca-rec') || 'mensuel';
      $$('#pane-foot button').forEach(b => { b.disabled = true; }); const txt = btn.textContent; btn.textContent = edition ? 'Enregistrement…' : 'Création…';
      try {
        const r = await api(edition ? '/api/cagnottes/' + id : '/api/cagnottes', { method: edition ? 'PUT' : 'POST', body });
        toast(edition ? 'Modifications enregistrées ✓' : 'Brouillon créé ✓ — publiez-le quand vous êtes prêt');
        location.replace('#/mescagnottes/voir/' + Number(((r && r.cagnotte) || {}).id || id));
      } catch (er) {
        $$('#pane-foot button').forEach(b => { b.disabled = false; }); btn.textContent = txt;
        if (er && er.status === 402) { A.premiumSheet(NOM); return; }
        const g = $('#mca-gerr'); if (g) { g.textContent = (er && er.message) || 'Enregistrement impossible.'; g.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        toast((er && er.message) || 'Enregistrement impossible.', true);
      }
    };
  }
})();
