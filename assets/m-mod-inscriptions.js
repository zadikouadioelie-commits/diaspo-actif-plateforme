/* ============================================================
   Diaspo'Actif — Version téléphone : module « Fiches d'inscription » (Initiative, Collectivité, Administrateur)
   Route : #/inscriptions                   mes fiches (brouillons, publiées…)
           #/inscriptions/nouvelle          création d'une fiche
           #/inscriptions/<id>              pilotage : état, lien public, accès aux sections
           #/inscriptions/<id>/billets      billets / tarifs et questions du formulaire
           #/inscriptions/<id>/inscrits     liste des inscrits (confirmer, présent, annuler, renvoyer le QR)
           #/inscriptions/<id>/modifier     informations de la fiche et événements liés
           #/inscriptions/<id>/communiquer  message aux inscrits (e-mail et/ou notification)
           #/inscriptions/<id>/controle     lien de contrôle à l'entrée (scan des QR) et présences
   Mêmes routes d'API (/api/insc/*) et mêmes règles que le site (inscriptions-admin.html) : le serveur reste le vrai verrou.
   Reste sur ordinateur : candidature et documents demandés, programme, sponsors, finances (gel des fonds), partage entre
   fiches, journal d'audit, import, logique conditionnelle des questions.
   Chargé APRÈS m.js : s'appuie uniquement sur window.MApp.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast } = A;
  window.MMods = window.MMods || {};

  const NOM = 'Fiches d’inscription';
  const ROLES = ['initiative', 'collectivite', 'administrateur'];
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const SK = '<div class="sk skc" style="height:110px"></div><div class="sk skc" style="height:110px"></div><div class="sk skc" style="height:110px"></div>';
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  /* Mêmes états et mêmes libellés que le site. */
  const STATUT_FICHE = { brouillon: ['Brouillon', ''], programmee: ['Programmée', 'o'], publiee: ['Publiée', 'g'], suspendue: ['Suspendue', 'o'], fermee: ['Fermée', 'r'], archivee: ['Archivée', ''] };
  const STATUT_INS = { inscrit: ['Inscrit', ''], confirme: ['Confirmé', 'g'], present: ['Présent', 'g'], absent: ['Absent', 'r'], annule: ['Annulé', 'r'], liste_attente: ['Liste d’attente', 'o'] };
  const VISIBILITES = [['public', 'Publique', 'Visible et accessible à tous'], ['membres', 'Membres', 'Réservée aux comptes connectés'], ['prive', 'Privée', 'Accessible avec un code d’accès'], ['invitation', 'Sur invitation', 'Accessible avec un code d’accès']];
  const TYPES_CHAMP = [['texte_court', 'Texte court'], ['texte_long', 'Texte long'], ['nombre', 'Nombre'], ['email', 'E-mail'], ['telephone', 'Téléphone'], ['date', 'Date'], ['heure', 'Heure'], ['adresse', 'Adresse'], ['liste_deroulante', 'Liste déroulante'], ['choix_unique', 'Choix unique'], ['choix_multiple', 'Choix multiple'], ['oui_non', 'Oui / Non'], ['case_a_cocher', 'Case à cocher'], ['upload_photo', 'Photo à envoyer'], ['upload_fichier', 'Fichier à envoyer'], ['url', 'Lien web']];
  const AVEC_OPTIONS = ['liste_deroulante', 'choix_unique', 'choix_multiple'];
  const DUREES = [['1h', '1 heure'], ['3h', '3 heures'], ['6h', '6 heures'], ['12h', '12 heures'], ['24h', '24 heures'], ['48h', '48 heures'], ['event', 'Jusqu’à la date de l’événement']];

  function css() {
    if ($('#m-mod-inscriptions-css')) return;
    const s = document.createElement('style');
    s.id = 'm-mod-inscriptions-css';
    s.textContent = `
.mfi-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 12px}
.mfi-stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 6px;text-align:center}
.mfi-stat b{display:block;font-size:22px;line-height:1.2;color:var(--navy)}
.mfi-stat span{font-size:12.5px;color:var(--muted)}
.mfi-note{background:var(--sky-l);border-radius:12px;padding:12px 14px;font-size:13.5px;color:var(--navy);margin:0 0 12px;line-height:1.4}
.mfi-note b{display:block;margin-bottom:2px}
.mfi-warn{background:var(--orange-l);color:var(--orange-d)}
.mfi-f label.mfi-l{display:block;font-weight:700;font-size:13.5px;margin:14px 2px 5px}
.mfi-f label.mfi-l small{font-weight:400;color:var(--muted)}
.mfi-f input[type=text],.mfi-f input[type=email],.mfi-f input[type=tel],.mfi-f input[type=number],.mfi-f input[type=search],.mfi-f input[type=datetime-local],.mfi-f select,.mfi-f textarea{display:block;width:100%;min-width:0;min-height:46px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:#fff;font-size:16px;color:var(--text);font-family:inherit;box-sizing:border-box}
.mfi-f textarea{min-height:96px;resize:vertical;line-height:1.4}
.mfi-f [aria-invalid=true]{border-color:var(--red);background:var(--red-l)}
.mfi-err{color:var(--red);font-size:13px;margin:4px 2px 0}
.mfi-err:empty{display:none}
.mfi-gerr{background:var(--red-l);color:var(--red);border-radius:12px;padding:10px 14px;font-weight:600;font-size:14px;margin-bottom:12px}
.mfi-gerr:empty{display:none}
.mfi-hint{font-size:12.5px;color:var(--muted);margin:5px 2px 0;line-height:1.35}
.mfi-opt{display:flex;gap:12px;align-items:flex-start;border:1.5px solid var(--border);background:#fff;border-radius:14px;padding:12px;margin-bottom:8px;cursor:pointer}
.mfi-opt.on{border-color:var(--navy2);background:var(--sky-l)}
.mfi-opt input{margin:3px 0 0;width:20px;height:20px;flex:none;accent-color:var(--navy2)}
.mfi-opt b{display:block;font-size:15px;word-break:break-word}
.mfi-opt small{display:block;color:var(--muted);font-size:12.5px;line-height:1.3}
.mfi-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mfi-2>*{min-width:0}
@media (max-width:389px){.mfi-2{grid-template-columns:1fr}}
.mfi-acts{display:grid;gap:8px;margin-top:12px}
.mfi-link{display:block;word-break:break-all;background:#fff;border:1px dashed var(--border);border-radius:12px;padding:10px 12px;font-size:13.5px;color:var(--navy2);font-weight:600;margin:8px 0}
.mfi-q{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)}
.mfi-q:last-child{border-bottom:0}
.mfi-q .sp{min-width:0;flex:1}
.mfi-q button{flex:none;min-width:44px;min-height:44px;border:1px solid var(--border);background:#fff;border-radius:12px;font-size:15px;color:var(--navy);cursor:pointer}
.mfi-dl{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:14px;margin:10px 0}
.mfi-dl dt{color:var(--muted)}
.mfi-dl dd{margin:0;word-break:break-word;font-weight:600}
.mfi-search{margin:0 0 10px}
`;
    document.head.appendChild(s);
  }

  /* ---------- outils ---------- */
  let rendu = 0; // une réponse tardive ne doit jamais écraser un autre écran
  const vivant = t => t === rendu && /^#\/inscriptions/.test(location.hash);
  const paint = (t, titre, html, foot) => { if (vivant(t)) setPane(titre, html, foot); };
  const pl = (n, un, plus) => n + ' ' + (n > 1 ? plus : un);
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  function dateCourte(s) {
    const p = s ? A.parseDay(String(s).slice(0, 10)) : null;
    return p ? p.d + ' ' + MOIS[p.m - 1] + ' ' + p.y : '';
  }
  const dtLocal = s => s ? String(s).replace(' ', 'T').slice(0, 16) : '';
  function eur(n) {
    const v = Number(n) || 0;
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v); }
    catch (e) { return v + ' €'; }
  }
  /* Texte enrichi du site → texte simple avec paragraphes (pour un champ de saisie). */
  function enTexte(html) {
    const s = String(html == null ? '' : html).replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, '');
    const t = document.createElement('textarea'); t.innerHTML = s;
    return t.value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  /* Texte simple → paragraphes (le serveur nettoie le HTML reçu). */
  const enParagraphes = txt => String(txt || '').trim() ? String(txt).trim().split(/\n{2,}/).map(p => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('') : '';
  const lienPublic = f => location.origin + '/inscription-publique.html?slug=' + encodeURIComponent(f.slug);
  const lienControle = token => location.origin + '/controle.html?token=' + encodeURIComponent(token);
  const badge = (tab, k) => { const x = tab[k] || [k, '']; return `<span class="badge ${x[1]}">${esc(x[0])}</span>`; };
  const parseOptions = c => { try { const o = JSON.parse(c.options_json || '[]'); return Array.isArray(o) ? o.map(String) : []; } catch (e) { return []; } };

  function gate(titre) {
    if (!S.me) {
      setPane(titre, A.loginCard('Connectez-vous pour gérer vos fiches d’inscription.'));
      const b = $('#go-login'); if (b) b.onclick = () => A.openLogin();
      return false;
    }
    if (!ROLES.includes(S.me.role)) {
      setPane(titre, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Réservé aux comptes organisateurs</b>Les fiches d’inscription sont proposées aux comptes Initiative et Collectivité. Changez de compte si vous en avez un lié.<br><br><a class="btn" href="#/moi">Retour à mon espace</a></div>`);
      return false;
    }
    if (S.me.role !== 'administrateur' && A.premiumLocked(2)) { lockPane(titre); return false; }
    return true;
  }
  function lockPane(titre) {
    setPane(titre, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Module Premium</b>Votre abonnement Premium est arrivé à expiration : vos fiches et vos inscrits sont conservés, mais leur gestion est suspendue jusqu’au renouvellement.<br><br><button class="btn" id="mfi-prem">Renouveler mon abonnement</button></div>`);
    const b = $('#mfi-prem'); if (b) b.onclick = () => A.premiumSheet(NOM);
  }
  function showError(t, titre, e, titreErreur, retry) {
    if (!vivant(t)) return;
    if (e && e.status === 402) return lockPane(titre);
    if (e && e.status === 401) { S.me = null; return gate(titre); }
    setPane(titre, `<div class="empty"><div class="ei">${ic('close', 'l')}</div><b>${esc(titreErreur)}</b>${esc((e && e.message) || 'Une erreur est survenue.')}<br><br><button class="btn sm" id="mfi-retry">Réessayer</button> <a class="btn out sm" href="#/inscriptions">Mes fiches</a></div>`);
    $('#mfi-retry').onclick = retry;
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
  async function copier(url) { try { await navigator.clipboard.writeText(url); toast('Lien copié'); } catch (e) { toast('Copie impossible sur cet appareil.', true); } }
  function confirmer(titre, texte, oui, danger) {
    return new Promise(res => {
      const close = A.openSheet(`<h2 style="margin:4px 0 8px;font-size:18px">${esc(titre)}</h2><p class="muted" style="margin:0 0 14px;line-height:1.45">${texte}</p>
        <button class="btn block" id="mfi-oui" ${danger ? 'style="background:var(--red);border-color:var(--red)"' : ''}>${esc(oui)}</button><button class="btn out block" id="mfi-non" style="margin-top:10px">Annuler</button>`);
      $('#mfi-oui').onclick = () => { close(); res(true); };
      $('#mfi-non').onclick = () => { close(); res(false); };
    });
  }
  const bloquer = (btn, on, txt) => { if (!btn) return; btn.disabled = !!on; if (txt !== undefined) { if (on) { btn.dataset.t = btn.innerHTML; btn.textContent = txt; } else if (btn.dataset.t) btn.innerHTML = btn.dataset.t; } };

  /* ---------- aiguillage ---------- */
  window.MMods.inscriptions = function (b, c) {
    const t = ++rendu; css();
    if (!b) return liste(t);
    if (b === 'nouvelle') return formulaire(t, null);
    if (/^\d+$/.test(b)) {
      if (!c) return pilotage(t, b);
      if (c === 'billets') return billets(t, b);
      if (c === 'inscrits') return inscrits(t, b);
      if (c === 'modifier') return formulaire(t, b);
      if (c === 'communiquer') return communiquer(t, b);
      if (c === 'controle') return controle(t, b);
    }
    location.replace('#/inscriptions');
  };

  /* ============================================================
     LISTE
     ============================================================ */
  const ST = { items: [], filtre: 'toutes' };
  async function liste(t) {
    if (!gate(NOM)) return;
    setPane(NOM, SK, `<a class="btn block" href="#/inscriptions/nouvelle">${ic('plus', 's')} Nouvelle fiche d’inscription</a>`);
    let r;
    try { r = await api('/api/insc/fiches'); }
    catch (e) { return showError(t, NOM, e, 'Impossible de charger vos fiches', () => liste(++rendu)); }
    if (!vivant(t)) return;
    ST.items = r.fiches || []; ST.filtre = 'toutes';
    paintListe(t);
  }
  function paintListe(t) {
    const foot = `<a class="btn block" href="#/inscriptions/nouvelle">${ic('plus', 's')} Nouvelle fiche d’inscription</a>`;
    if (!ST.items.length) {
      return paint(t, NOM, `<div class="empty"><div class="ei">${ic('doc', 'l')}</div><b>Aucune fiche pour le moment</b>Une fiche d’inscription permet de recevoir les inscriptions à vos événements : billets, questions, confirmation par QR code.<br><br><a class="btn" href="#/inscriptions/nouvelle">Créer ma première fiche</a></div>`, foot);
    }
    const groupes = { toutes: () => true, publiees: f => f.statut === 'publiee', brouillons: f => f.statut === 'brouillon' || f.statut === 'programmee', autres: f => ['suspendue', 'fermee', 'archivee'].includes(f.statut) };
    const noms = { toutes: 'Toutes', publiees: 'Publiées', brouillons: 'Brouillons', autres: 'Fermées et archivées' };
    const chips = Object.keys(groupes).map(k => `<button class="chip${ST.filtre === k ? ' on' : ''}" data-f="${k}">${noms[k]} <span class="n">${ST.items.filter(groupes[k]).length}</span></button>`).join('');
    const l = ST.items.filter(groupes[ST.filtre]);
    const carte = f => {
      const n = num(f.nb_inscriptions), ne = num(f.nb_evenements);
      return `<a class="card pad" href="#/inscriptions/${num(f.id)}" style="display:block;text-decoration:none;color:inherit">
        <div class="row" style="align-items:flex-start;gap:10px"><div class="sp" style="min-width:0"><div style="font-weight:700;font-size:16px;line-height:1.25;word-break:break-word">${esc(f.nom)}</div>
        ${f.apercu_date ? `<div class="small muted">📅 ${esc(dateCourte(f.apercu_date))}${f.apercu_lieu ? ' · ' + esc(f.apercu_lieu) : ''}</div>` : ''}</div>${badge(STATUT_FICHE, f.statut)}</div>
        <div class="tags"><span class="badge">${esc(pl(n, 'inscrit', 'inscrits'))}</span>${ne ? `<span class="badge">${esc(pl(ne, 'événement lié', 'événements liés'))}</span>` : '<span class="badge o">Aucun événement lié</span>'}${f.a_types_payants ? '<span class="badge o">💶 Payante</span>' : '<span class="badge g">Gratuite</span>'}</div></a>`;
    };
    paint(t, NOM, `<div class="chips">${chips}</div>${l.length ? l.map(carte).join('') : '<div class="empty"><b>Aucune fiche dans cette catégorie</b></div>'}
      <div class="mfi-note"><b>Réglages avancés</b>Candidature et documents demandés, programme, sponsors, finances, partage entre fiches : sur ordinateur.</div>`, foot);
    $$('.chip[data-f]').forEach(b => b.onclick = () => { ST.filtre = b.dataset.f; paintListe(t); });
  }

  /* ============================================================
     PILOTAGE D'UNE FICHE
     ============================================================ */
  const FI = { fiche: null, evenements: [], types: [], stats: null };
  async function chargerFiche(id) {
    const [r, st] = await Promise.all([api('/api/insc/fiches/' + Number(id)), api('/api/insc/fiches/' + Number(id) + '/stats').catch(() => null)]);
    FI.fiche = r.fiche; FI.evenements = r.evenements || []; FI.types = r.types || []; FI.stats = st;
    return r;
  }
  async function pilotage(t, id) {
    if (!gate(NOM)) return;
    setPane(NOM, SK);
    try { await chargerFiche(id); }
    catch (e) { return showError(t, NOM, e, 'Impossible de charger cette fiche', () => pilotage(++rendu, id)); }
    if (!vivant(t)) return;
    const f = FI.fiche, total = num(FI.stats && FI.stats.total);
    const parStatut = {}; ((FI.stats && FI.stats.par_statut) || []).forEach(x => { parStatut[x.statut] = num(x.n); });
    const places = FI.types.reduce((s, x) => s + (x.places_max ? num(x.places_max) : 0), 0);
    const sansPlace = FI.types.some(x => !x.places_max);
    const lien = lienPublic(f), publiee = f.statut === 'publiee';
    const li = (href, icone, titre, desc) => `<a class="li" href="${href}"><span class="ic">${ic(icone)}</span><span class="sp"><span class="t">${esc(titre)}</span><br><span class="d">${esc(desc)}</span></span><span class="ch">${ic('chev', 's')}</span></a>`;
    const etapes = [];
    if (!FI.types.length) etapes.push('Ajoutez au moins un billet (même gratuit) : sans billet, personne ne peut s’inscrire.');
    if (!FI.evenements.length) etapes.push('Liez un événement pour que son bouton « S’inscrire » ouvre cette fiche.');
    if (f.statut === 'brouillon' && FI.types.length) etapes.push('Publiez la fiche pour ouvrir les inscriptions.');
    paint(t, f.nom || NOM, `
      <div class="card pad"><div class="row" style="align-items:flex-start;gap:10px"><div class="sp" style="min-width:0"><div style="font-weight:700;font-size:17px;line-height:1.25;word-break:break-word">${esc(f.nom)}</div>
        <div class="small muted">${esc((VISIBILITES.find(v => v[0] === f.visibilite) || VISIBILITES[0])[1])}${f.date_ouverture_inscriptions || f.date_fermeture_inscriptions ? ' · ' + esc(dateCourte(f.date_ouverture_inscriptions) || '…') + ' → ' + esc(dateCourte(f.date_fermeture_inscriptions) || '…') : ''}</div></div>${badge(STATUT_FICHE, f.statut)}</div>
        ${f.description ? `<p class="small muted" style="margin:10px 0 0;white-space:pre-line;word-break:break-word">${esc(enTexte(f.description).slice(0, 220))}</p>` : ''}
        <button class="btn out sm block" id="mfi-etat" style="margin-top:12px">Changer l’état de la fiche</button></div>
      ${etapes.length ? `<div class="mfi-note mfi-warn"><b>Pour démarrer</b>${etapes.map(e => '• ' + esc(e)).join('<br>')}</div>` : ''}
      <div class="mfi-stats"><div class="mfi-stat"><b>${total}</b><span>Inscrits</span></div><div class="mfi-stat"><b>${num(parStatut.confirme) + num(parStatut.present)}</b><span>Confirmés</span></div><div class="mfi-stat"><b>${sansPlace || !places ? '∞' : places}</b><span>Places</span></div></div>
      <div class="card pad"><div style="font-weight:700">Lien d’inscription</div>
        <div class="mfi-link">${esc(lien)}</div>
        ${publiee ? '' : '<p class="small muted" style="margin:0 0 8px">Ce lien ne fonctionne que lorsque la fiche est publiée.</p>'}
        <div class="mfi-2"><button class="btn sm" id="mfi-share">${ic('share', 's')} Partager</button><button class="btn out sm" id="mfi-copy">Copier</button></div></div>
      <div class="h2">Gérer</div>
      <div class="lst">
        ${li('#/inscriptions/' + num(f.id) + '/billets', 'ticket', 'Billets et questions', FI.types.length ? pl(FI.types.length, 'billet', 'billets') : 'Aucun billet pour le moment')}
        ${li('#/inscriptions/' + num(f.id) + '/inscrits', 'people', 'Inscrits', pl(total, 'inscrit', 'inscrits') + ' · confirmer, présence, QR')}
        ${li('#/inscriptions/' + num(f.id) + '/communiquer', 'chat', 'Message aux inscrits', 'E-mail et notification')}
        ${li('#/inscriptions/' + num(f.id) + '/controle', 'check', 'Contrôle à l’entrée', 'Lien de scan des QR codes · présences')}
        ${li('#/inscriptions/' + num(f.id) + '/modifier', 'doc', 'Informations et événements liés', FI.evenements.length ? pl(FI.evenements.length, 'événement lié', 'événements liés') : 'Aucun événement lié')}
      </div>
      ${FI.evenements.length ? `<div class="h2">Événements liés</div><div class="lst">${FI.evenements.map(e => `<a class="li" href="#/mesevenements/${num(e.id)}"><span class="ic">${ic('cal')}</span><span class="sp"><span class="t">${esc(e.titre)}</span><br><span class="d">${esc(dateCourte(e.date_evt))}${e.ville ? ' · ' + esc(e.ville) : ''}</span></span><span class="ch">${ic('chev', 's')}</span></a>`).join('')}</div>` : ''}
      <div class="mfi-acts"><button class="btn out sm block" id="mfi-dup">Dupliquer cette fiche</button><button class="btn out sm block" id="mfi-del" style="color:var(--red)">Supprimer la fiche</button></div>
      <div class="mfi-note" style="margin-top:14px"><b>Réglages avancés</b>Candidature et documents demandés, programme, sponsors, finances, partage entre fiches, journal : sur ordinateur.<br><a href="inscriptions-admin.html" style="text-decoration:underline">Ouvrir sur le site</a></div>`);
    $('#mfi-etat').onclick = () => changerEtat(t, f);
    $('#mfi-share').onclick = () => partager(lien, f.nom);
    $('#mfi-copy').onclick = () => copier(lien);
    $('#mfi-dup').onclick = ev => dupliquer(ev.currentTarget, f);
    $('#mfi-del').onclick = ev => supprimer(ev.currentTarget, f);
  }
  function changerEtat(t, f) {
    const choix = [
      ['publiee', 'Publier', 'Les inscriptions sont ouvertes, le lien fonctionne.'],
      ['suspendue', 'Suspendre', 'Pause temporaire : plus d’inscription, rien n’est perdu.'],
      ['fermee', 'Fermer', 'Les inscriptions sont terminées.'],
      ['brouillon', 'Remettre en brouillon', 'La fiche n’est plus visible du public.'],
      ['archivee', 'Archiver', 'Rangée hors de la liste active, conservée.'],
    ].filter(c => c[0] !== f.statut);
    const close = A.openSheet(`<h2 style="margin:4px 0 4px;font-size:18px">État de la fiche</h2><p class="muted small" style="margin:0 0 12px">Actuellement : <b>${esc((STATUT_FICHE[f.statut] || [f.statut])[0])}</b></p>
      ${choix.map(c => `<button class="mfi-opt" data-s="${c[0]}" style="width:100%;text-align:left;font:inherit"><span><b>${esc(c[1])}</b><small>${esc(c[2])}</small></span></button>`).join('')}
      <button class="btn out block" id="mfi-x" style="margin-top:6px">Fermer</button>`);
    $('#mfi-x').onclick = close;
    $$('.mfi-opt[data-s]').forEach(b => b.onclick = async () => {
      const s = b.dataset.s;
      if (s === 'publiee' && !FI.types.length) { close(); toast('Ajoutez d’abord un billet avant de publier.', true); return; }
      try { await api('/api/insc/fiches/' + num(f.id) + '/statut', { method: 'PATCH', body: { statut: s } }); close(); toast('État mis à jour ✓'); pilotage(++rendu, f.id); }
      catch (er) { erreurAction(er); }
    });
  }
  async function dupliquer(btn, f) {
    if (!(await confirmer('Dupliquer cette fiche ?', 'Une copie est créée avec ses billets et ses questions, sans les inscrits. Elle démarre en brouillon.', 'Dupliquer'))) return;
    bloquer(btn, true, 'Copie…');
    try { const r = await api('/api/insc/fiches/' + num(f.id) + '/dupliquer', { method: 'POST', body: {} }); toast('Fiche dupliquée ✓'); location.hash = '#/inscriptions/' + num((r.fiche && r.fiche.id) || r.id || r.fiche_id); }
    catch (er) { bloquer(btn, false); erreurAction(er); }
  }
  async function supprimer(btn, f) {
    if (!(await confirmer('Supprimer cette fiche ?', 'Cette action est définitive. Si la fiche contient déjà des inscriptions, elle ne peut pas être supprimée : archivez-la plutôt.', 'Supprimer', true))) return;
    bloquer(btn, true, 'Suppression…');
    try { await api('/api/insc/fiches/' + num(f.id), { method: 'DELETE' }); toast('Fiche supprimée'); location.replace('#/inscriptions'); }
    catch (er) { bloquer(btn, false); erreurAction(er); }
  }

  /* ============================================================
     CRÉATION / MODIFICATION
     ============================================================ */
  async function formulaire(t, id) {
    if (!gate(NOM)) return;
    const edition = !!id, titre = edition ? 'Modifier la fiche' : 'Nouvelle fiche';
    setPane(titre, SK);
    let f = {}, liés = [], mesEvts = [];
    try {
      const reqs = [api('/api/evenements?owner=' + encodeURIComponent(S.me.id)).catch(() => ({ evenements: [] }))];
      if (edition) reqs.push(chargerFiche(id));
      const rs = await Promise.all(reqs);
      if (edition) { f = rs[1].fiche; liés = (rs[1].evenements || []).map(e => num(e.id)); }
      mesEvts = (rs[0].evenements || []).filter(e => Number(e.owner_user_id) === Number(S.me.id) && (liés.includes(num(e.id)) || String(e.inscription_ouverte) !== '0'));
    } catch (e) { return showError(t, titre, e, 'Impossible de charger cette fiche', () => formulaire(++rendu, id)); }
    if (!vivant(t)) return;
    // Un événement déjà lié mais absent de ma liste (compte administrateur) reste dans la sélection.
    FI.evenements.forEach(e => { if (edition && !mesEvts.some(x => num(x.id) === num(e.id))) mesEvts.push(e); });
    mesEvts.sort((a, b) => String(b.date_evt || '').localeCompare(String(a.date_evt || '')));
    const v = k => esc(f[k] || '');
    const prive = ['prive', 'invitation'].includes(f.visibilite);
    paint(t, titre, `<div class="mfi-f" id="mfi-form">
      <div class="mfi-gerr" id="mfi-gerr" role="alert"></div>
      <label class="mfi-l" for="mfi-nom">Nom de la fiche *</label><input type="text" id="mfi-nom" maxlength="150" value="${v('nom')}" placeholder="Ex : Soirée de gala 2026"><div class="mfi-err" id="mfi-nom-e"></div>
      <label class="mfi-l" for="mfi-desc">Description <small>(facultatif)</small></label><textarea id="mfi-desc" maxlength="4000" placeholder="Présentez l’événement aux futurs inscrits">${esc(enTexte(f.description))}</textarea>
      <label class="mfi-l" for="mfi-org">Organisateur <small>(facultatif)</small></label><input type="text" id="mfi-org" maxlength="120" value="${v('organisateur')}">
      <div class="mfi-2"><div><label class="mfi-l" for="mfi-ouv">Ouverture des inscriptions</label><input type="datetime-local" id="mfi-ouv" value="${esc(dtLocal(f.date_ouverture_inscriptions))}"></div>
        <div><label class="mfi-l" for="mfi-fer">Fermeture</label><input type="datetime-local" id="mfi-fer" value="${esc(dtLocal(f.date_fermeture_inscriptions))}"></div></div>
      <label class="mfi-l">Qui peut s’inscrire ?</label>
      ${VISIBILITES.map(x => `<label class="mfi-opt${(f.visibilite || 'public') === x[0] ? ' on' : ''}"><input type="radio" name="mfi-vis" value="${x[0]}" ${(f.visibilite || 'public') === x[0] ? 'checked' : ''}><span><b>${esc(x[1])}</b><small>${esc(x[2])}</small></span></label>`).join('')}
      <div id="mfi-code-b" ${prive ? '' : 'hidden'}><label class="mfi-l" for="mfi-code">Code d’accès</label><input type="text" id="mfi-code" maxlength="40" value="${v('code_acces')}" autocomplete="off"><div class="mfi-hint">Communiquez ce code aux personnes invitées.</div></div>
      <label class="mfi-l">Contact pour les inscrits <small>(facultatif)</small></label>
      <input type="text" id="mfi-cn" maxlength="100" placeholder="Nom" value="${v('contact_nom')}" style="margin-bottom:8px"><input type="email" id="mfi-ce" maxlength="150" placeholder="E-mail" value="${v('contact_email')}" style="margin-bottom:8px"><input type="tel" id="mfi-ct" maxlength="40" placeholder="Téléphone" value="${v('contact_telephone')}">
      <label class="mfi-l">Événements liés <small>(facultatif)</small></label>
      ${mesEvts.length ? mesEvts.map(e => `<label class="mfi-opt${liés.includes(num(e.id)) ? ' on' : ''}"><input type="checkbox" class="mfi-ev" value="${num(e.id)}" ${liés.includes(num(e.id)) ? 'checked' : ''}><span><b>${esc(e.titre)}</b><small>${esc(dateCourte(e.date_evt))}${e.ville ? ' · ' + esc(e.ville) : ''}</small></span></label>`).join('') : `<div class="mfi-hint">Vous n’avez pas encore d’événement. <a href="#/mesevenements/nouveau" style="text-decoration:underline">Créer un événement</a></div>`}
      ${mesEvts.length ? '<div class="mfi-hint">Le bouton « S’inscrire » de chaque événement coché ouvrira cette fiche.</div>' : ''}
    </div>`, `<button class="btn block" id="mfi-save">${edition ? 'Enregistrer' : 'Créer la fiche'}</button>`);
    const form = $('#mfi-form');
    form.addEventListener('change', e => {
      if (e.target.matches('input[type=radio],input[type=checkbox]')) { const lab = e.target.closest('.mfi-opt'); if (e.target.type === 'radio') $$('.mfi-opt', form).forEach(o => { if (o.querySelector('input[name=mfi-vis]')) o.classList.toggle('on', o.querySelector('input').checked); }); else if (lab) lab.classList.toggle('on', e.target.checked); }
      if (e.target.name === 'mfi-vis') $('#mfi-code-b').hidden = !['prive', 'invitation'].includes(e.target.value);
    });
    $('#mfi-save').onclick = async ev => {
      const btn = ev.currentTarget, nom = $('#mfi-nom').value.trim();
      $('#mfi-gerr').textContent = ''; $('#mfi-nom-e').textContent = ''; $('#mfi-nom').removeAttribute('aria-invalid');
      if (!nom) { $('#mfi-nom-e').textContent = 'Le nom de la fiche est requis.'; $('#mfi-nom').setAttribute('aria-invalid', 'true'); $('#mfi-nom').focus(); return; }
      const vis = ($('input[name=mfi-vis]:checked', form) || {}).value || 'public';
      const code = $('#mfi-code').value.trim();
      if (['prive', 'invitation'].includes(vis) && !code) { $('#mfi-gerr').textContent = 'Indiquez un code d’accès pour une fiche privée ou sur invitation.'; return; }
      const body = {
        nom, description: enParagraphes($('#mfi-desc').value), organisateur: $('#mfi-org').value.trim(), visibilite: vis, code_acces: ['prive', 'invitation'].includes(vis) ? code : '',
        date_ouverture_inscriptions: $('#mfi-ouv').value, date_fermeture_inscriptions: $('#mfi-fer').value,
        contact_nom: $('#mfi-cn').value.trim(), contact_email: $('#mfi-ce').value.trim(), contact_telephone: $('#mfi-ct').value.trim(),
        evenement_ids: $$('.mfi-ev:checked', form).map(x => num(x.value)),
      };
      if (body.date_ouverture_inscriptions && body.date_fermeture_inscriptions && body.date_fermeture_inscriptions < body.date_ouverture_inscriptions) { $('#mfi-gerr').textContent = 'La fermeture doit être après l’ouverture.'; return; }
      bloquer(btn, true, 'Enregistrement…');
      try {
        if (edition) { await api('/api/insc/fiches/' + num(id), { method: 'PUT', body }); toast('Modifications enregistrées ✓'); location.replace('#/inscriptions/' + num(id)); }
        else { const r = await api('/api/insc/fiches', { method: 'POST', body }); toast('Fiche créée ✓ — ajoutez maintenant un billet'); location.replace('#/inscriptions/' + num(r.fiche.id) + '/billets'); }
      } catch (er) {
        bloquer(btn, false);
        if (er && er.status === 402) { A.premiumSheet(NOM); return; }
        $('#mfi-gerr').textContent = (er && er.message) || 'Enregistrement impossible.'; $('#mfi-gerr').scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
  }

  /* ============================================================
     BILLETS ET QUESTIONS
     ============================================================ */
  async function billets(t, id) {
    if (!gate(NOM)) return;
    setPane('Billets', SK);
    try { await chargerFiche(id); }
    catch (e) { return showError(t, 'Billets', e, 'Impossible de charger les billets', () => billets(++rendu, id)); }
    if (!vivant(t)) return;
    paintBillets(t);
  }
  function paintBillets(t) {
    const f = FI.fiche, l = FI.types;
    const foot = `<button class="btn block" id="mfi-add">${ic('plus', 's')} Ajouter un billet</button>`;
    const carte = x => {
      const payant = !num(x.gratuit) && num(x.prix) > 0, actif = x.actif === undefined || x.actif === null ? true : !!num(x.actif);
      const nbQ = (x.champs || []).length, ins = num(x.nb_inscrits);
      return `<div class="card pad"><div class="row" style="align-items:flex-start;gap:10px"><div class="sp" style="min-width:0"><div style="font-weight:700;font-size:16px;line-height:1.25;word-break:break-word">${esc(x.label)}</div>
        ${x.description ? `<div class="small muted" style="word-break:break-word">${esc(String(x.description).slice(0, 140))}</div>` : ''}</div>
        <span class="badge ${payant ? 'o' : 'g'}">${payant ? esc(eur(x.prix)) : 'Gratuit'}</span></div>
        <div class="tags"><span class="badge ${actif ? 'g' : ''}">${actif ? 'Ouvert' : 'Désactivé'}</span><span class="badge">${esc(x.places_max ? ins + ' / ' + num(x.places_max) + ' places' : pl(ins, 'inscrit', 'inscrits'))}</span>${num(x.liste_attente_active) ? '<span class="badge">Liste d’attente</span>' : ''}${num(x.validation_auto) === 0 ? '<span class="badge o">Validation manuelle</span>' : ''}</div>
        <div class="mfi-2" style="margin-top:12px"><button class="btn out sm" data-q="${num(x.id)}">Questions (${nbQ})</button><button class="btn out sm" data-edit="${num(x.id)}">Modifier</button></div></div>`;
    };
    paint(t, 'Billets', `<div class="small muted" style="margin:0 2px 10px;word-break:break-word">${esc(f.nom)}</div>
      ${l.length ? l.map(carte).join('') : `<div class="empty"><div class="ei">${ic('ticket', 'l')}</div><b>Aucun billet</b>Un billet décrit ce que choisit un participant : gratuit ou payant, nombre de places, questions à remplir.<br><br><button class="btn" id="mfi-quick">Ajouter un billet gratuit « Participant »</button></div>`}
      <div class="mfi-note"><b>Nom, prénom, e-mail et téléphone</b>Ces informations sont toujours demandées : inutile de les ajouter dans les questions.</div>`, foot);
    $('#mfi-add').onclick = () => feuilleBillet(t, null);
    const q = $('#mfi-quick'); if (q) q.onclick = async () => { bloquer(q, true, 'Ajout…'); try { await api('/api/insc/fiches/' + num(f.id) + '/types', { method: 'POST', body: { label: 'Participant', gratuit: true } }); toast('Billet ajouté ✓'); billets(++rendu, f.id); } catch (er) { bloquer(q, false); erreurAction(er); } };
    $$('[data-edit]').forEach(b => b.onclick = () => feuilleBillet(t, l.find(x => num(x.id) === num(b.dataset.edit))));
    $$('[data-q]').forEach(b => b.onclick = () => feuilleQuestions(t, num(b.dataset.q)));
  }
  function feuilleBillet(t, x) {
    const nouveau = !x, payant = x && !num(x.gratuit) && num(x.prix) > 0, actif = !x || x.actif === undefined || x.actif === null ? true : !!num(x.actif);
    const close = A.openSheet(`<h2 style="margin:4px 0 6px;font-size:18px">${nouveau ? 'Nouveau billet' : 'Modifier le billet'}</h2><div class="mfi-f">
      <div class="mfi-gerr" id="mfi-berr" role="alert"></div>
      <label class="mfi-l" for="mfi-bl">Nom du billet *</label><input type="text" id="mfi-bl" maxlength="80" value="${esc((x && x.label) || '')}" placeholder="Ex : Participant, Invité, VIP">
      <label class="mfi-l" for="mfi-bd">Description <small>(facultatif)</small></label><textarea id="mfi-bd" maxlength="400" style="min-height:70px">${esc((x && x.description) || '')}</textarea>
      <label class="mfi-opt${payant ? '' : ' on'}"><input type="radio" name="mfi-bg" value="g" ${payant ? '' : 'checked'}><span><b>Gratuit</b></span></label>
      <label class="mfi-opt${payant ? ' on' : ''}"><input type="radio" name="mfi-bg" value="p" ${payant ? 'checked' : ''}><span><b>Payant</b><small>Paiement en ligne par carte à l’inscription</small></span></label>
      <div id="mfi-prix-b" ${payant ? '' : 'hidden'}><label class="mfi-l" for="mfi-bp">Prix (€)</label><input type="number" id="mfi-bp" inputmode="decimal" min="0" step="0.01" value="${payant ? esc(x.prix) : ''}"></div>
      <label class="mfi-l" for="mfi-bm">Nombre de places <small>(vide = illimité)</small></label><input type="number" id="mfi-bm" inputmode="numeric" min="1" step="1" value="${x && x.places_max ? num(x.places_max) : ''}">
      <label class="mfi-opt${x && num(x.liste_attente_active) ? ' on' : ''}" style="margin-top:12px"><input type="checkbox" id="mfi-bla" ${x && num(x.liste_attente_active) ? 'checked' : ''}><span><b>Liste d’attente</b><small>Quand les places sont toutes prises, les suivants sont mis en attente.</small></span></label>
      <label class="mfi-opt${!x || num(x.validation_auto) !== 0 ? ' on' : ''}"><input type="checkbox" id="mfi-bva" ${!x || num(x.validation_auto) !== 0 ? 'checked' : ''}><span><b>Confirmation automatique</b><small>Décochez pour valider chaque inscription à la main.</small></span></label>
      ${nouveau ? '' : `<label class="mfi-opt${actif ? ' on' : ''}"><input type="checkbox" id="mfi-bac" ${actif ? 'checked' : ''}><span><b>Billet ouvert aux inscriptions</b><small>Décochez pour le désactiver sans le supprimer.</small></span></label>`}
      <div class="mfi-2"><div><label class="mfi-l" for="mfi-bo">Ouverture</label><input type="datetime-local" id="mfi-bo" value="${esc(dtLocal(x && x.date_ouverture))}"></div><div><label class="mfi-l" for="mfi-bf">Fermeture</label><input type="datetime-local" id="mfi-bf" value="${esc(dtLocal(x && x.date_fermeture))}"></div></div>
      </div>
      <button class="btn block" id="mfi-bok" style="margin-top:16px">${nouveau ? 'Ajouter le billet' : 'Enregistrer'}</button>
      ${nouveau ? '' : '<button class="btn out block" id="mfi-bdel" style="margin-top:10px;color:var(--red)">Supprimer ce billet</button>'}
      <button class="btn out block" id="mfi-bx" style="margin-top:10px">Annuler</button>`);
    const sh = $('#sheet');
    sh.onchange = e => {
      if (e.target.name === 'mfi-bg') { $('#mfi-prix-b').hidden = e.target.value !== 'p'; $$('input[name=mfi-bg]', sh).forEach(r => r.closest('.mfi-opt').classList.toggle('on', r.checked)); }
      else if (e.target.type === 'checkbox') e.target.closest('.mfi-opt').classList.toggle('on', e.target.checked);
    };
    $('#mfi-bx').onclick = close;
    $('#mfi-bok').onclick = async ev => {
      const btn = ev.currentTarget, label = $('#mfi-bl').value.trim(), err = $('#mfi-berr'); err.textContent = '';
      if (!label) { err.textContent = 'Le nom du billet est requis.'; return; }
      const pay = ($('input[name=mfi-bg]:checked', sh) || {}).value === 'p', prix = $('#mfi-bp').value;
      if (pay && !(num(prix) > 0)) { err.textContent = 'Indiquez un prix supérieur à zéro, ou choisissez « Gratuit ».'; return; }
      const pm = $('#mfi-bm').value;
      if (pm !== '' && !(parseInt(pm, 10) >= 1)) { err.textContent = 'Le nombre de places doit être d’au moins 1.'; return; }
      const body = { label, description: $('#mfi-bd').value.trim(), gratuit: !pay, prix: pay ? num(prix) : null, places_max: pm === '' ? '' : parseInt(pm, 10),
        liste_attente_active: $('#mfi-bla').checked, validation_auto: $('#mfi-bva').checked, date_ouverture: $('#mfi-bo').value, date_fermeture: $('#mfi-bf').value };
      if (!nouveau) { body.actif = $('#mfi-bac').checked ? 1 : 0; body.gratuit = pay ? 0 : 1; body.liste_attente_active = $('#mfi-bla').checked ? 1 : 0; body.validation_auto = $('#mfi-bva').checked ? 1 : 0; }
      bloquer(btn, true, 'Enregistrement…');
      try {
        if (nouveau) await api('/api/insc/fiches/' + num(FI.fiche.id) + '/types', { method: 'POST', body });
        else await api('/api/insc/types/' + num(x.id), { method: 'PUT', body });
        close(); toast(nouveau ? 'Billet ajouté ✓' : 'Billet modifié ✓'); billets(++rendu, FI.fiche.id);
      } catch (er) { bloquer(btn, false); err.textContent = (er && er.message) || 'Enregistrement impossible.'; }
    };
    const del = $('#mfi-bdel');
    if (del) del.onclick = async () => {
      close();
      if (!(await confirmer('Supprimer ce billet ?', 'Ses questions sont supprimées avec lui. S’il a déjà des inscrits, désactivez-le plutôt.', 'Supprimer', true))) return;
      try { await api('/api/insc/types/' + num(x.id), { method: 'DELETE' }); toast('Billet supprimé'); billets(++rendu, FI.fiche.id); }
      catch (er) { erreurAction(er); }
    };
  }

  /* Questions du formulaire d'un billet */
  async function feuilleQuestions(t, typeId, fermerAvant) {
    if (fermerAvant) fermerAvant();
    let x = FI.types.find(y => num(y.id) === num(typeId));
    if (!x) return;
    const champs = (x.champs || []).slice().sort((a, b) => num(a.position) - num(b.position) || num(a.id) - num(b.id));
    const lib = c => (TYPES_CHAMP.find(y => y[0] === c.type_champ) || [c.type_champ, c.type_champ])[1];
    const close = A.openSheet(`<h2 style="margin:4px 0 2px;font-size:18px">Questions — ${esc(x.label)}</h2><p class="muted small" style="margin:0 0 8px">Ce que les participants remplissent en plus de leur nom, e-mail et téléphone.</p>
      ${champs.length ? champs.map((c, i) => `<div class="mfi-q"><div class="sp"><div style="font-weight:600;word-break:break-word">${esc(c.libelle)}${num(c.obligatoire) ? ' <span style="color:var(--red)">*</span>' : ''}</div><div class="small muted">${esc(lib(c))}</div></div>
        <button data-up="${num(c.id)}" aria-label="Monter" ${i === 0 ? 'disabled style="opacity:.4"' : ''}>↑</button><button data-dn="${num(c.id)}" aria-label="Descendre" ${i === champs.length - 1 ? 'disabled style="opacity:.4"' : ''}>↓</button><button data-ed="${num(c.id)}" aria-label="Modifier">✎</button></div>`).join('') : '<div class="empty" style="padding:18px 10px"><b>Aucune question</b>Seuls nom, prénom, e-mail et téléphone sont demandés.</div>'}
      <button class="btn block" id="mfi-qadd" style="margin-top:14px">${ic('plus', 's')} Ajouter une question</button><button class="btn out block" id="mfi-qx" style="margin-top:10px">Fermer</button>`);
    $('#mfi-qx').onclick = close;
    $('#mfi-qadd').onclick = () => feuilleQuestion(t, x, null, close);
    $$('[data-ed]').forEach(b => b.onclick = () => feuilleQuestion(t, x, champs.find(c => num(c.id) === num(b.dataset.ed)), close));
    const deplacer = async (cid, sens) => {
      const i = champs.findIndex(c => num(c.id) === num(cid)), j = i + sens; if (j < 0 || j >= champs.length) return;
      const ordre = champs.slice(); const [m] = ordre.splice(i, 1); ordre.splice(j, 0, m);
      try { await Promise.all(ordre.map((c, k) => num(c.position) === k ? null : api('/api/insc/champs/' + num(c.id) + '/position', { method: 'PATCH', body: { position: k } }))); await chargerFiche(FI.fiche.id); feuilleQuestions(t, typeId, close); }
      catch (er) { erreurAction(er); }
    };
    $$('[data-up]').forEach(b => b.onclick = () => deplacer(b.dataset.up, -1));
    $$('[data-dn]').forEach(b => b.onclick = () => deplacer(b.dataset.dn, 1));
  }
  function feuilleQuestion(t, type, c, fermerListe) {
    if (fermerListe) fermerListe();
    const nouveau = !c, special = c && !TYPES_CHAMP.some(y => y[0] === c.type_champ);
    const retour = () => { chargerFiche(FI.fiche.id).then(() => feuilleQuestions(t, type.id)).catch(() => billets(++rendu, FI.fiche.id)); };
    const close = A.openSheet(`<h2 style="margin:4px 0 6px;font-size:18px">${nouveau ? 'Nouvelle question' : 'Modifier la question'}</h2><div class="mfi-f">
      <div class="mfi-gerr" id="mfi-qerr" role="alert"></div>
      <label class="mfi-l" for="mfi-ql">Question *</label><input type="text" id="mfi-ql" maxlength="160" value="${esc((c && c.libelle) || '')}" placeholder="Ex : Régime alimentaire">
      <label class="mfi-l" for="mfi-qt">Type de réponse</label>
      <select id="mfi-qt" ${nouveau ? '' : 'disabled'}>${special ? `<option>${esc(c.type_champ)}</option>` : TYPES_CHAMP.map(y => `<option value="${y[0]}" ${(c ? c.type_champ : 'texte_court') === y[0] ? 'selected' : ''}>${esc(y[1])}</option>`).join('')}</select>
      ${nouveau ? '' : `<div class="mfi-hint">${special ? 'Ce type de question se modifie sur ordinateur.' : 'Le type de réponse ne peut plus être changé : supprimez la question et recréez-la si besoin.'}</div>`}
      <div id="mfi-qo-b" ${c && AVEC_OPTIONS.includes(c.type_champ) ? '' : 'hidden'}><label class="mfi-l" for="mfi-qo">Choix proposés <small>(un par ligne)</small></label><textarea id="mfi-qo" style="min-height:90px">${esc(c ? parseOptions(c).join('\n') : '')}</textarea></div>
      <label class="mfi-l" for="mfi-qp">Texte d’exemple <small>(facultatif)</small></label><input type="text" id="mfi-qp" maxlength="120" value="${esc((c && c.placeholder) || '')}">
      <label class="mfi-l" for="mfi-qa">Aide sous la question <small>(facultatif)</small></label><input type="text" id="mfi-qa" maxlength="200" value="${esc((c && c.description_aide) || '')}">
      <label class="mfi-opt${c && num(c.obligatoire) ? ' on' : ''}" style="margin-top:14px"><input type="checkbox" id="mfi-qob" ${c && num(c.obligatoire) ? 'checked' : ''}><span><b>Réponse obligatoire</b></span></label></div>
      <button class="btn block" id="mfi-qok" style="margin-top:14px">${nouveau ? 'Ajouter la question' : 'Enregistrer'}</button>
      ${nouveau ? '' : '<button class="btn out block" id="mfi-qdel" style="margin-top:10px;color:var(--red)">Supprimer la question</button>'}
      <button class="btn out block" id="mfi-qcancel" style="margin-top:10px">Retour</button>`);
    const sh = $('#sheet');
    sh.onchange = e => {
      if (e.target.id === 'mfi-qt') $('#mfi-qo-b').hidden = !AVEC_OPTIONS.includes(e.target.value);
      else if (e.target.id === 'mfi-qob') e.target.closest('.mfi-opt').classList.toggle('on', e.target.checked);
    };
    $('#mfi-qcancel').onclick = () => { close(); retour(); };
    $('#mfi-qok').onclick = async ev => {
      const btn = ev.currentTarget, err = $('#mfi-qerr'), libelle = $('#mfi-ql').value.trim(); err.textContent = '';
      if (!libelle) { err.textContent = 'Écrivez la question.'; return; }
      const tc = nouveau ? $('#mfi-qt').value : c.type_champ;
      const options = AVEC_OPTIONS.includes(tc) ? $('#mfi-qo').value.split('\n').map(s => s.trim()).filter(Boolean) : [];
      if (AVEC_OPTIONS.includes(tc) && options.length < 2) { err.textContent = 'Proposez au moins deux choix.'; return; }
      const body = { libelle, description_aide: $('#mfi-qa').value.trim(), placeholder: $('#mfi-qp').value.trim(), obligatoire: $('#mfi-qob').checked ? 1 : 0 };
      if (!special && AVEC_OPTIONS.includes(tc)) body.options = options;
      bloquer(btn, true, 'Enregistrement…');
      try {
        if (nouveau) await api('/api/insc/types/' + num(type.id) + '/champs', { method: 'POST', body: { ...body, type_champ: tc, options } });
        else await api('/api/insc/champs/' + num(c.id), { method: 'PUT', body });
        close(); toast(nouveau ? 'Question ajoutée ✓' : 'Question modifiée ✓'); retour();
      } catch (er) { bloquer(btn, false); err.textContent = (er && er.message) || 'Enregistrement impossible.'; }
    };
    const del = $('#mfi-qdel');
    if (del) del.onclick = async () => {
      close();
      if (!(await confirmer('Supprimer cette question ?', 'Les réponses déjà données restent dans les inscriptions.', 'Supprimer', true))) { retour(); return; }
      try { await api('/api/insc/champs/' + num(c.id), { method: 'DELETE' }); toast('Question supprimée'); retour(); }
      catch (er) { erreurAction(er); retour(); }
    };
  }

  /* ============================================================
     INSCRITS
     ============================================================ */
  const IN = { fiche: null, items: [], q: '', statut: '' };
  async function inscrits(t, id) {
    if (!gate(NOM)) return;
    setPane('Inscrits', SK);
    let r, fr;
    try { [r, fr] = await Promise.all([api('/api/insc/fiches/' + num(id) + '/inscriptions'), api('/api/insc/fiches/' + num(id))]); }
    catch (e) { return showError(t, 'Inscrits', e, 'Impossible de charger les inscrits', () => inscrits(++rendu, id)); }
    if (!vivant(t)) return;
    IN.fiche = fr.fiche; IN.items = r.inscriptions || []; IN.q = ''; IN.statut = '';
    paintInscrits(t, true);
  }
  function paintInscrits(t, premier) {
    const compte = k => IN.items.filter(i => i.statut === k).length;
    const chips = [['', 'Tous', IN.items.length]].concat(Object.keys(STATUT_INS).map(k => [k, STATUT_INS[k][0], compte(k)]).filter(x => x[2] > 0));
    const ligne = i => `<a class="li" href="#" data-i="${num(i.id)}"><span class="sp"><span class="t">${esc([i.prenom, i.nom].filter(Boolean).join(' ') || '—')}</span><br><span class="d">${esc(i.type_label || '')}${i.evenement_titre ? ' · ' + esc(i.evenement_titre) : ''} · ${esc(i.reference || '')}</span></span>${badge(STATUT_INS, i.statut)}</a>`;
    const listeHtml = () => {
      const q = IN.q.trim().toLowerCase();
      const l = IN.items.filter(i => (!IN.statut || i.statut === IN.statut) && (!q || [i.nom, i.prenom, i.email, i.reference, i.telephone].join(' ').toLowerCase().includes(q)));
      return l.length ? `<div class="lst">${l.map(ligne).join('')}</div>` : `<div class="empty"><div class="ei">${ic('people', 'l')}</div><b>${IN.items.length ? 'Aucun résultat' : 'Aucune inscription pour le moment'}</b>${IN.items.length ? 'Essayez une autre recherche.' : 'Les inscriptions apparaîtront ici dès qu’une personne remplira la fiche.'}</div>`;
    };
    const lier = () => $$('#mfi-ins-l .li[data-i]').forEach(a => a.onclick = ev => { ev.preventDefault(); feuilleInscrit(t, IN.items.find(i => num(i.id) === num(a.dataset.i))); });
    const corps = `<div class="chips" id="mfi-chips">${chips.map(c => `<button class="chip${IN.statut === c[0] ? ' on' : ''}" data-s="${c[0]}">${esc(c[1])} <span class="n">${c[2]}</span></button>`).join('')}</div>
      <div class="mfi-f mfi-search"><input type="search" id="mfi-q" placeholder="Rechercher un nom, un e-mail, une référence" value="${esc(IN.q)}" autocomplete="off"></div>
      <div id="mfi-ins-l">${listeHtml()}</div>`;
    if (premier) paint(t, 'Inscrits — ' + (IN.fiche.nom || ''), corps, `<a class="btn out block" href="#/inscriptions/${num(IN.fiche.id)}">Retour à la fiche</a>`);
    else { const pb = $('#pane-body'); if (pb) { const l = $('#mfi-ins-l'); const ch = $('#mfi-chips'); if (l) l.innerHTML = listeHtml(); if (ch) ch.innerHTML = chips.map(c => `<button class="chip${IN.statut === c[0] ? ' on' : ''}" data-s="${c[0]}">${esc(c[1])} <span class="n">${c[2]}</span></button>`).join(''); } }
    $$('#mfi-chips .chip[data-s]').forEach(b => b.onclick = () => { IN.statut = b.dataset.s; paintInscrits(t, false); });
    const qi = $('#mfi-q'); if (qi) qi.oninput = () => { IN.q = qi.value; const l = $('#mfi-ins-l'); if (l) { l.innerHTML = listeHtml(); lier(); } };
    lier();
  }
  function feuilleInscrit(t, i) {
    if (!i) return;
    let rep = {}; try { rep = JSON.parse(i.reponses_json || '{}') || {}; } catch (e) {}
    const reps = Object.keys(rep).filter(k => rep[k] !== '' && rep[k] !== null && rep[k] !== undefined).slice(0, 25);
    const aff = v => Array.isArray(v) ? v.join(', ') : (typeof v === 'object' ? '' : String(v));
    const paye = { paye: 'Payé', non_paye: 'À payer', en_attente: 'Paiement en attente', echec: 'Paiement échoué', rembourse: 'Remboursé' }[i.statut_paiement];
    const choix = ['confirme', 'present', 'absent', 'liste_attente', 'inscrit', 'annule'].filter(k => k !== i.statut);
    const close = A.openSheet(`<h2 style="margin:4px 0 2px;font-size:18px;word-break:break-word">${esc([i.prenom, i.nom].filter(Boolean).join(' '))}</h2>
      <div style="margin:0 0 6px">${badge(STATUT_INS, i.statut)} ${paye ? `<span class="badge ${i.statut_paiement === 'paye' ? 'g' : 'o'}">${esc(paye)}</span>` : ''}</div>
      <dl class="mfi-dl"><dt>Billet</dt><dd>${esc(i.type_label || '—')}</dd><dt>Référence</dt><dd>${esc(i.reference || '—')}</dd>${i.evenement_titre ? `<dt>Événement</dt><dd>${esc(i.evenement_titre)}</dd>` : ''}
        ${i.email ? `<dt>E-mail</dt><dd><a href="mailto:${esc(i.email)}" style="text-decoration:underline">${esc(i.email)}</a></dd>` : ''}${i.telephone ? `<dt>Téléphone</dt><dd><a href="tel:${esc(String(i.telephone).replace(/[^\d+]/g, ''))}" style="text-decoration:underline">${esc(i.telephone)}</a></dd>` : ''}
        <dt>Inscrit le</dt><dd>${esc(dateCourte(i.created_at))}</dd>${reps.map(k => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd>${esc(aff(rep[k]))}</dd>`).join('')}</dl>
      <div class="h2" style="margin-top:6px">Changer le statut</div>
      <div class="mfi-2">${choix.map(k => `<button class="btn out sm" data-st="${k}" ${k === 'annule' ? 'style="color:var(--red)"' : ''}>${esc(STATUT_INS[k][0])}</button>`).join('')}</div>
      ${i.email ? '<button class="btn sm block" id="mfi-qr" style="margin-top:12px">Renvoyer le QR code par e-mail</button>' : ''}
      <button class="btn out block" id="mfi-ix" style="margin-top:10px">Fermer</button>`);
    $('#mfi-ix').onclick = close;
    $$('[data-st]').forEach(b => b.onclick = async () => {
      const s = b.dataset.st;
      if (s === 'annule' && !(await confirmer('Annuler cette inscription ?', 'La place est libérée. La personne n’est pas prévenue automatiquement.', 'Annuler l’inscription', true))) return;
      bloquer(b, true, '…');
      try { await api('/api/insc/inscriptions/' + num(i.id) + '/statut', { method: 'PATCH', body: { statut: s } }); i.statut = s; close(); toast('Statut mis à jour ✓'); paintInscrits(t, false); }
      catch (er) { bloquer(b, false); erreurAction(er); }
    });
    const qr = $('#mfi-qr'); if (qr) qr.onclick = async () => { bloquer(qr, true, 'Envoi…'); try { await api('/api/insc/inscriptions/' + num(i.id) + '/renvoyer-qr', { method: 'POST', body: {} }); toast('QR code renvoyé ✓'); } catch (er) { erreurAction(er); } bloquer(qr, false); };
  }

  /* ============================================================
     MESSAGE AUX INSCRITS
     ============================================================ */
  async function communiquer(t, id) {
    if (!gate(NOM)) return;
    setPane('Message aux inscrits', SK);
    let fr, hist;
    try { [fr, hist] = await Promise.all([api('/api/insc/fiches/' + num(id)), api('/api/insc/fiches/' + num(id) + '/communications').catch(() => ({ communications: [] }))]); }
    catch (e) { return showError(t, 'Message aux inscrits', e, 'Impossible de charger cette fiche', () => communiquer(++rendu, id)); }
    if (!vivant(t)) return;
    const f = fr.fiche, types = fr.types || [], H = hist.communications || [];
    paint(t, 'Message aux inscrits', `<div class="mfi-f"><div class="mfi-gerr" id="mfi-cerr" role="alert"></div>
      <div class="small muted" style="margin:0 2px;word-break:break-word">${esc(f.nom)}</div>
      <label class="mfi-l" for="mfi-cd">À qui ?</label><select id="mfi-cd"><option value="tous">Tous les inscrits</option>${types.map(x => `<option value="${esc(x.cle)}">Billet « ${esc(x.label)} »</option>`).join('')}</select>
      <label class="mfi-l">Par quel canal ?</label>
      ${[['les_deux', 'E-mail et notification', 'Recommandé'], ['email', 'E-mail seulement', ''], ['notification', 'Notification seulement', 'Pour les inscrits ayant un compte']].map((c, k) => `<label class="mfi-opt${k === 0 ? ' on' : ''}"><input type="radio" name="mfi-cc" value="${c[0]}" ${k === 0 ? 'checked' : ''}><span><b>${esc(c[1])}</b>${c[2] ? `<small>${esc(c[2])}</small>` : ''}</span></label>`).join('')}
      <label class="mfi-l" for="mfi-co">Objet <small>(facultatif)</small></label><input type="text" id="mfi-co" maxlength="150" placeholder="${esc(f.nom)} — nouvelle communication">
      <label class="mfi-l" for="mfi-cm">Message *</label><textarea id="mfi-cm" maxlength="4000" style="min-height:140px" placeholder="Bonjour {prenom}, …"></textarea>
      <div class="mfi-hint">Personnalisez avec {prenom}, {nom}, {evenement}, {type_inscription}, {date_evenement}, {lieu}.</div></div>
      ${H.length ? `<div class="h2">Messages déjà envoyés</div><div class="lst">${H.slice(0, 8).map(h => `<div class="li" style="cursor:default"><span class="sp"><span class="t">${esc(h.objet || 'Sans objet')}</span><br><span class="d">${esc(dateCourte(h.created_at))} · ${num(h.nb_email)} e-mail(s), ${num(h.nb_notif)} notification(s)</span></span></div>`).join('')}</div>` : ''}`,
      `<button class="btn block" id="mfi-csend">Envoyer le message</button>`);
    const pane = $('#pane-body');
    pane.onchange = e => { if (e.target.name === 'mfi-cc') $$('input[name=mfi-cc]', pane).forEach(r => r.closest('.mfi-opt').classList.toggle('on', r.checked)); };
    $('#mfi-csend').onclick = async ev => {
      const btn = ev.currentTarget, msg = $('#mfi-cm').value.trim(), err = $('#mfi-cerr'); err.textContent = '';
      if (!msg) { err.textContent = 'Écrivez votre message.'; $('#mfi-cm').focus(); return; }
      const dest = $('#mfi-cd').value, canal = ($('input[name=mfi-cc]:checked', pane) || {}).value || 'les_deux';
      if (!(await confirmer('Envoyer ce message ?', 'Il part immédiatement à ' + (dest === 'tous' ? 'tous les inscrits' : 'les inscrits de ce billet') + '. Vous ne pourrez pas le retirer.', 'Envoyer'))) return;
      bloquer(btn, true, 'Envoi…');
      try { const r = await api('/api/insc/fiches/' + num(id) + '/communications', { method: 'POST', body: { destinataire_type: dest, canal, objet: $('#mfi-co').value.trim(), message: msg } }); toast('Message envoyé à ' + pl(num(r.nb_destinataires), 'personne', 'personnes') + ' ✓'); communiquer(++rendu, id); }
      catch (er) { bloquer(btn, false); err.textContent = (er && er.message) || 'Envoi impossible.'; }
    };
  }

  /* ============================================================
     CONTRÔLE À L'ENTRÉE
     ============================================================ */
  async function controle(t, id) {
    if (!gate(NOM)) return;
    setPane('Contrôle à l’entrée', SK);
    let fr, lienR, stR;
    try { [fr, lienR, stR] = await Promise.all([api('/api/insc/fiches/' + num(id)), api('/api/insc/fiches/' + num(id) + '/liens-controle'), api('/api/insc/fiches/' + num(id) + '/checkin-stats').catch(() => ({ stats: null }))]); }
    catch (e) { return showError(t, 'Contrôle à l’entrée', e, 'Impossible de charger le contrôle', () => controle(++rendu, id)); }
    if (!vivant(t)) return;
    const f = fr.fiche, lien = lienR.lien, st = stR.stats || {};
    const valide = lien && lien.valide_jusqua && new Date(lien.valide_jusqua) > new Date();
    const url = lien ? lienControle(lien.token) : '';
    const NOMS = { presents_actuellement: 'Présents actuellement', entrees: 'Entrées', sorties: 'Sorties', total_inscrits: 'Inscrits', non_entres: 'Pas encore entrés' };
    const ORDRE = ['presents_actuellement', 'entrees', 'sorties', 'non_entres', 'total_inscrits'];
    const stats = Object.keys(st).filter(k => typeof st[k] === 'number' || /^\d+$/.test(String(st[k]))).sort((a, b) => (ORDRE.indexOf(a) + 1 || 99) - (ORDRE.indexOf(b) + 1 || 99));
    paint(t, 'Contrôle à l’entrée', `<div class="small muted" style="margin:0 2px 10px;word-break:break-word">${esc(f.nom)}</div>
      <div class="mfi-note"><b>Comment ça marche</b>Créez un lien de contrôle temporaire et ouvrez-le sur le téléphone de la personne qui scanne les QR codes à l’entrée. Le lien expire tout seul.</div>
      ${lien && valide ? `<div class="card pad"><div style="font-weight:700">Lien de contrôle actif</div><div class="small muted">Valable jusqu’au ${esc(new Date(lien.valide_jusqua).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }))}</div>
        <div class="mfi-link">${esc(url)}</div>
        <div class="mfi-2"><a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">Ouvrir le contrôle</a><button class="btn out sm" id="mfi-cshare">${ic('share', 's')} Partager</button></div>
        <div class="mfi-acts"><button class="btn out sm block" id="mfi-ccopy">Copier le lien</button><button class="btn out sm block" id="mfi-crev" style="color:var(--red)">Désactiver le lien</button></div></div>`
        : `<div class="card pad"><div style="font-weight:700">${lien ? 'Le dernier lien a expiré' : 'Aucun lien actif'}</div><p class="small muted" style="margin:4px 0 0">Créez un lien pour commencer à scanner.</p></div>`}
      <div class="card pad"><div style="font-weight:700;margin-bottom:6px">${lien && valide ? 'Remplacer par un nouveau lien' : 'Créer un lien de contrôle'}</div><div class="mfi-f"><label class="mfi-l" for="mfi-dur" style="margin-top:0">Durée de validité</label><select id="mfi-dur">${DUREES.map(d => `<option value="${d[0]}" ${d[0] === '24h' ? 'selected' : ''}>${esc(d[1])}</option>`).join('')}</select></div>
        <button class="btn block" id="mfi-cnew" style="margin-top:12px">Créer le lien</button>${lien && valide ? '<p class="small muted" style="margin:8px 0 0">L’ancien lien sera désactivé.</p>' : ''}</div>
      ${stats.length ? `<div class="h2">Présences</div><div class="mfi-stats" style="grid-template-columns:1fr 1fr">${stats.map(k => `<div class="mfi-stat"><b>${num(st[k])}</b><span>${esc(NOMS[k] || k.replace(/_/g, ' '))}</span></div>`).join('')}</div>` : ''}`,
      `<a class="btn out block" href="#/inscriptions/${num(f.id)}">Retour à la fiche</a>`);
    const sh = $('#mfi-cshare'); if (sh) sh.onclick = () => partager(url, 'Contrôle — ' + f.nom);
    const cp = $('#mfi-ccopy'); if (cp) cp.onclick = () => copier(url);
    const rv = $('#mfi-crev'); if (rv) rv.onclick = async () => {
      if (!(await confirmer('Désactiver le lien ?', 'Les personnes qui l’utilisent ne pourront plus scanner.', 'Désactiver', true))) return;
      try { await api('/api/insc/fiches/' + num(id) + '/liens-controle/revoquer', { method: 'POST', body: {} }); toast('Lien désactivé'); controle(++rendu, id); } catch (er) { erreurAction(er); }
    };
    $('#mfi-cnew').onclick = async ev => {
      const btn = ev.currentTarget; bloquer(btn, true, 'Création…');
      try { await api('/api/insc/fiches/' + num(id) + '/liens-controle', { method: 'POST', body: { duree: $('#mfi-dur').value } }); toast('Lien créé ✓'); controle(++rendu, id); }
      catch (er) { bloquer(btn, false); erreurAction(er); }
    };
  }
})();
