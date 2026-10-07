/* ============================================================
   Diaspo'Actif — Version téléphone : module « Mes événements » (comptes Initiative)
   Route : #/mesevenements            liste de mes événements (à venir · terminés · brouillons)
           #/mesevenements/nouveau    création (avec inscriptions ou événement flash)
           #/mesevenements/<id>       pilotage d'un événement
           #/mesevenements/<id>/inscrits   liste des inscrits
           #/mesevenements/<id>/modifier   modification des informations de base
   Mêmes routes d'API et mêmes règles que le site (evenements-app.html, dashboard-initiative.html).
   Chargé APRÈS m.js : s'appuie uniquement sur window.MApp.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast } = A;
  window.MMods = window.MMods || {};

  const NOM = 'Mes événements';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const SK = '<div class="sk skc" style="height:96px"></div><div class="sk skc" style="height:96px"></div><div class="sk skc" style="height:96px"></div>';

  /* Mêmes listes que le formulaire du site (evenements-app.html) : une seule référence, jamais une saisie libre. */
  const FORMES = [['evenement', 'Événement'], ['forum', 'Forum'], ['atelier', 'Atelier'], ['webinaire', 'Webinaire'], ['conference', 'Conférence'], ['gala', 'Gala / Soirée'], ['marche', 'Marché / Foire'], ['networking', 'Networking'], ['debat', 'Débat'], ['concours', 'Concours'], ['trophee_diaspora', 'Trophée diaspora'], ['autre', 'Autre']];
  const DOMAINES = ['Entrepreneuriat', 'Formation', 'Culture', 'Sante', 'Agriculture', 'Technologie', 'Sport', 'Action Sociale', 'Business', 'Diaspora', 'Gastronomie', 'Economique', 'Politique', 'Panafricanisme', 'Autre'];
  const DOMAINES_LIB = { Sante: 'Santé', Economique: 'Économique' };
  const ZONES = ['Ville', 'Commune', 'Département', 'Région', 'National', 'International'];
  const STATUT_FICHE = { inscrit: ['Inscrit', ''], confirme: ['Confirmé', 'g'], present: ['Présent', 'g'], absent: ['Absent', 'r'], annule: ['Annulé', 'r'], liste_attente: ['Liste d’attente', 'o'] };

  /* ---------- styles (injectés une seule fois) ---------- */
  function css() {
    if ($('#m-mod-mesevenements-css')) return;
    const s = document.createElement('style');
    s.id = 'm-mod-mesevenements-css';
    s.textContent = `
.mev-card{display:flex;align-items:center;gap:12px;padding:12px 14px}
.mev-card:active{background:rgba(13,43,78,.05)}
.mev-dt{flex:none;width:52px;text-align:center;background:#fff;border:1px solid var(--border);border-radius:12px;padding:6px 0;line-height:1.1}
.mev-dt b{display:block;font-size:20px;color:var(--navy)}
.mev-dt span{font-size:11px;font-weight:700;color:var(--orange-d);text-transform:uppercase}
.mev-dt em{display:block;font-style:normal;font-size:10.5px;color:var(--muted)}
.mev-t{font-weight:700;font-size:16px;line-height:1.25;margin-bottom:2px;word-break:break-word}
.mev-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.mev-stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px 6px;text-align:center}
.mev-stat b{display:block;font-size:20px;color:var(--navy);line-height:1.2}
.mev-stat span{font-size:12px;color:var(--muted)}
.li.mev-danger .t{color:var(--red)}
.li.mev-danger .ic{background:var(--red-l);color:var(--red)}
.mev-note{background:var(--sky-l);border-radius:12px;padding:12px 14px;font-size:13.5px;color:var(--navy);margin-bottom:12px}
.mev-note b{display:block;margin-bottom:2px}
.mev-note ul{margin:6px 0 0;padding-left:1.2em}
.mev-f label.mev-l{display:block;font-weight:700;font-size:13.5px;margin:14px 2px 5px}
.mev-f label.mev-l small{font-weight:400;color:var(--muted)}
.mev-f input[type=text],.mev-f input[type=date],.mev-f input[type=time],.mev-f input[type=number],.mev-f input[type=url],.mev-f select,.mev-f textarea{display:block;width:100%;min-width:0;min-height:46px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:#fff;font-size:16px;color:var(--text);font-family:inherit}
.mev-f textarea{min-height:120px;resize:vertical;line-height:1.4}
.mev-f [aria-invalid=true]{border-color:var(--red);background:var(--red-l)}
.mev-err{color:var(--red);font-size:13px;margin:4px 2px 0}
.mev-err:empty{display:none}
.mev-gerr{background:var(--red-l);color:var(--red);border-radius:12px;padding:10px 14px;font-weight:600;font-size:14px;margin-bottom:12px}
.mev-gerr:empty{display:none}
.mev-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mev-opt{display:flex;gap:12px;align-items:flex-start;border:1.5px solid var(--border);background:#fff;border-radius:14px;padding:12px;margin-bottom:8px;cursor:pointer}
.mev-opt.on{border-color:var(--navy2);background:var(--sky-l)}
.mev-opt input{margin:3px 0 0;width:20px;height:20px;flex:none;accent-color:var(--navy2)}
.mev-opt b{display:block;font-size:15px}
.mev-opt small{display:block;color:var(--muted);font-size:12.5px;line-height:1.3}
.mev-photo{display:flex;align-items:center;gap:12px}
.mev-photo img{width:84px;height:60px;object-fit:cover;border-radius:10px;border:1px solid var(--border)}
.mev-hint{font-size:12.5px;color:var(--muted);margin:5px 2px 0;line-height:1.35}
.mev-contact{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:4px;font-size:13.5px}
.mev-contact a{color:var(--navy2);font-weight:600;text-decoration:underline;word-break:break-all}
`;
    document.head.appendChild(s);
  }

  /* ---------- outils ---------- */
  let rendu = 0; // numéro de l'écran courant : une réponse tardive ne doit jamais écraser un autre écran
  const vivant = t => t === rendu && /^#\/mesevenements/.test(location.hash);
  const paint = (t, titre, html, foot) => { if (vivant(t)) setPane(titre, html, foot); };
  const hh = v => String(v || '').slice(0, 5);
  const lieuTexte = e => [e.ville, e.pays].filter(Boolean).join(', ') || e.lieu || '';
  const pl = (n, un, plus) => n + ' ' + (n > 1 ? plus : un);
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function estTermine(e) {
    if (e.est_termine != null) return !!e.est_termine;
    const d = String(e.date_fin || e.date_evt || '').slice(0, 10);
    return !!d && d < todayISO();
  }
  function joursAvant(dateEvt) {
    const p = A.parseDay(dateEvt); if (!p) return null;
    const n = new Date();
    return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
  }
  function statutInfo(e) {
    const s = String(e.statut || '').toLowerCase();
    if (s === 'brouillon') return { cls: 'o', label: 'Brouillon', publie: false };
    if (['ferme', 'clos'].includes(s)) return { cls: '', label: 'Fermé', publie: true };
    if (['annule', 'annulé'].includes(s)) return { cls: 'r', label: 'Annulé', publie: true };
    if (estTermine(e)) return { cls: '', label: 'Terminé', publie: true };
    if (e.statut_temporel === 'en_cours') return { cls: 'g', label: 'En cours', publie: true };
    return { cls: 'g', label: 'Publié', publie: true };
  }
  /* Règles de visibilité du site : « public » + masquer_boutique = « Événements uniquement » ;
     « boutique » = « Boutique uniquement » ; « public » seul = « Boutique et Événements ». */
  function visLabel(e) {
    const v = e.visibilite || 'public';
    if (v === 'boutique') return 'Boutique uniquement';
    if (v === 'prive') return 'Privé';
    if (v === 'abonnes') return 'Abonnés uniquement';
    return Number(e.masquer_boutique) ? 'Événements uniquement' : 'Boutique et Événements';
  }
  function partLabel(e) {
    if (e.type_participation === 'payant' || Number(e.prix_min) > 0) return 'Payant';
    if (e.type_participation === 'partiellement_payant') return 'Partiellement payant';
    return 'Gratuit';
  }
  /* « Inscrit il y a 3 h » / « Inscrit le 7 sept. » : A.ago() renvoie soit une durée courte, soit une date. */
  function depuis(prefixe, d) {
    const a = A.ago(d); if (!a) return '';
    if (/^\d+ (min|h|j)$/.test(a)) return prefixe + ' il y a ' + a;
    return a.indexOf('instant') >= 0 ? prefixe + ' à l’instant' : prefixe + ' le ' + a;
  }
  const estPlat = txt => !/<(p|br|strong|b|em|i|u|ul|ol|li|h[1-6]|blockquote|a)[\s>\/]/i.test(String(txt || ''));

  /* Accès : compte Initiative connecté, Premium non expiré. Le serveur reste le vrai verrou (402). */
  function gate(titre) {
    if (!S.me) {
      setPane(titre, A.loginCard('Connectez-vous avec votre compte Initiative pour gérer vos événements.'));
      const b = $('#go-login'); if (b) b.onclick = () => A.openLogin();
      return false;
    }
    if (S.me.role !== 'initiative') {
      setPane(titre, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Réservé aux comptes Initiative</b>La gestion d’événements est proposée aux comptes Initiative. Vous êtes connecté avec un autre type de compte : changez de compte si vous en avez un lié.<br><br><a class="btn" href="#/moi">Retour à mon espace</a></div>`);
      return false;
    }
    if (A.premiumLocked(2)) { lockPane(titre); return false; }
    return true;
  }
  function lockPane(titre) {
    setPane(titre, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Module Premium</b>Votre abonnement Premium est arrivé à expiration : vos événements sont conservés, mais leur gestion est suspendue jusqu’au renouvellement.<br><br><a class="btn" href="mon-abonnement.html">Voir mon abonnement</a></div>`);
    A.premiumSheet(NOM);
  }
  /* Erreur de chargement : 402 → feuille Premium, 401 → connexion, sinon message + Réessayer. */
  function showError(t, titre, e, titreErreur, retry) {
    if (!vivant(t)) return;
    if (e && e.status === 402) return lockPane(titre);
    if (e && e.status === 401) { S.me = null; return gate(titre); }
    setPane(titre, `<div class="empty"><div class="ei">${ic('close', 'l')}</div><b>${esc(titreErreur)}</b>${esc((e && e.message) || 'Une erreur est survenue.')}<br><br><button class="btn sm" id="mev-retry">Réessayer</button></div>`);
    $('#mev-retry').onclick = retry;
  }
  /* Erreur d'une action d'écriture. */
  function erreurAction(er) {
    if (er && er.status === 402) { A.premiumSheet(NOM); return; }
    toast((er && er.message) || 'Une erreur est survenue.', true);
  }

  /* Corps complet d'un PUT : la route du site réécrit toute la ligne (titre et date obligatoires) —
     on renvoie donc tout ce qu'elle lit, tel que stocké, pour ne perdre aucun réglage. */
  function bodyDepuis(e, over) {
    return Object.assign({
      titre: e.titre, date_evt: e.date_evt, heure_debut: e.heure_debut, heure_fin: e.heure_fin, type_evt: e.type_evt, domaine: e.domaine,
      zone_diffusion: e.zone_diffusion, type_participation: e.type_participation, ouverture_inscriptions: e.ouverture_inscriptions, statut: e.statut,
      pays: e.pays, lieu: e.lieu, ville: e.ville, lieu_gps: e.lieu_gps, origine: e.origine, description: e.description, places_max: e.places_max,
      masquer_inscrits: e.masquer_inscrits, visibilite: e.visibilite, lien_visio: e.lien_visio, whatsapp_lien: e.whatsapp_lien,
      image_couverture: e.image_couverture, image_url: e.image_url, galerie_photos: e.galerie_photos
    }, over || {});
  }

  /* Chargement commun (pilotage + inscrits) : l'événement, ses inscrits « formulaire simple » et, si une fiche
     d'inscription est liée, les inscriptions de cette fiche. Une source indisponible n'empêche pas l'écran. */
  async function charger(id) {
    const r = await api('/api/evenements/' + encodeURIComponent(id));
    const e = r.evenement || r;
    if (Number(e.owner_user_id) !== Number(S.me.id)) { const er = new Error('Cet événement n’est pas géré par votre compte.'); er.status = 403; throw er; }
    const [p, f] = await Promise.all([
      api(`/api/evenements/${encodeURIComponent(id)}/participants`).catch(er => ({ erreur: er })),
      e.fiche_id ? api(`/api/insc/fiches/${encodeURIComponent(e.fiche_id)}/inscriptions?evenement_id=${encodeURIComponent(id)}`).catch(er => ({ erreur: er })) : Promise.resolve(null)
    ]);
    return {
      e,
      simples: p.erreur ? null : (p.participants || []),
      fiche: !f || f.erreur ? null : (f.inscriptions || []).filter(i => !Number(i.archive)),
      ficheErreur: !!(f && f.erreur), simplesErreur: !!p.erreur
    };
  }
  const ficheActives = d => (d.fiche || []).filter(i => !['annule', 'liste_attente'].includes(i.statut));
  const nbPersonnes = d => (d.simples || []).reduce((n, p) => n + (Number(p.nb_personnes) || 1), 0) + ficheActives(d).length;

  /* ---------- aiguillage ---------- */
  window.MMods.mesevenements = function (b, c) {
    const t = ++rendu; css();
    if (!b) return liste(t);
    if (b === 'nouveau') return formulaire(t, null);
    if (/^\d+$/.test(b)) {
      if (c === 'inscrits') return inscrits(t, b);
      if (c === 'modifier') return formulaire(t, b);
      return pilotage(t, b);
    }
    location.replace('#/mesevenements');
  };

  /* ============================================================
     LISTE
     ============================================================ */
  const ST = { items: [], tab: '', q: '', shown: 30 };

  async function liste(t) {
    if (!gate(NOM)) return;
    setPane(NOM, SK, `<a class="btn block" href="#/mesevenements/nouveau">${ic('plus', 's')} Créer un événement</a>`);
    let r;
    try { r = await api('/api/evenements?owner=' + encodeURIComponent(S.me.id)); }
    catch (e) { return showError(t, NOM, e, 'Impossible de charger vos événements', () => liste(++rendu)); }
    if (!vivant(t)) return;
    ST.items = (r.evenements || []).filter(e => Number(e.owner_user_id) === Number(S.me.id));
    const g = groupes();
    // Premier affichage : on ouvre directement l'onglet qui contient quelque chose.
    ST.tab = g.avenir.length ? 'avenir' : g.brouillons.length ? 'brouillons' : g.termines.length ? 'termines' : 'avenir';
    ST.q = ''; ST.shown = 30;
    setPane(NOM, `<div id="mev-top"></div><div id="mev-list"></div>
      <div class="mev-note" style="margin-top:6px"><b>Billetterie et billets payants</b>Les événements avec types de billets, ventes et finances se gèrent sur ordinateur.<br><a href="dashboard-initiative.html#evenements" style="text-decoration:underline;font-weight:700">Ouvrir sur ordinateur</a></div>`,
    `<a class="btn block" href="#/mesevenements/nouveau">${ic('plus', 's')} Créer un événement</a>`);
    paintListe();
  }
  function groupes() {
    const av = [], te = [], br = [];
    ST.items.forEach(e => { if (e.statut === 'brouillon') br.push(e); else if (estTermine(e)) te.push(e); else av.push(e); });
    const d = x => String(x.date_evt || '');
    av.sort((a, b) => d(a).localeCompare(d(b)) || String(a.heure_debut || '').localeCompare(String(b.heure_debut || '')));
    te.sort((a, b) => d(b).localeCompare(d(a)));
    br.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return { avenir: av, termines: te, brouillons: br };
  }
  function paintListe() {
    const top = $('#mev-top'); if (!top) return;
    const g = groupes();
    const tabs = [['avenir', 'À venir'], ['termines', 'Terminés'], ['brouillons', 'Brouillons']];
    top.innerHTML = (ST.items.length > 5 ? `<div class="search">${ic('search', 's')}<input id="mev-q" type="search" placeholder="Rechercher dans mes événements…" aria-label="Rechercher dans mes événements" value="${esc(ST.q)}"></div>` : '') +
      `<div class="chips" role="tablist">${tabs.map(([k, l]) => `<button class="chip ${ST.tab === k ? 'on' : ''}" role="tab" aria-selected="${ST.tab === k}" data-tab="${k}">${l} <span class="n">${g[k].length}</span></button>`).join('')}</div>`;
    $$('.chip', top).forEach(b => b.onclick = () => { ST.tab = b.dataset.tab; ST.shown = 30; paintListe(); });
    const q = $('#mev-q');
    if (q) { let tm; q.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { ST.q = q.value.trim(); ST.shown = 30; paintCartes(); }, 200); }; }
    paintCartes();
  }
  function paintCartes() {
    const box = $('#mev-list'); if (!box) return;
    const g = groupes(); const q = ST.q.toLowerCase();
    const all = g[ST.tab] || [];
    const l = all.filter(e => !q || [e.titre, e.ville, e.pays, e.lieu].join(' ').toLowerCase().includes(q));
    if (!l.length) {
      const vide = !ST.items.length
        ? ['Aucun événement pour l’instant', 'Créez votre premier événement : touchez « Créer un événement » en bas de l’écran.']
        : q ? ['Aucun résultat', 'Essayez un autre mot-clé.']
          : ST.tab === 'avenir' ? ['Aucun événement à venir', 'Créez un nouvel événement ou consultez vos événements terminés.']
            : ST.tab === 'termines' ? ['Aucun événement terminé', 'Vos événements passés apparaîtront ici.']
              : ['Aucun brouillon', 'Un brouillon est un événement enregistré sans être publié : lui seul vous le voit.'];
      box.innerHTML = `<div class="empty"><div class="ei">${ic('cal', 'l')}</div><b>${vide[0]}</b>${vide[1]}</div>`;
      return;
    }
    box.innerHTML = l.slice(0, ST.shown).map(carte).join('') + (l.length > ST.shown ? `<button class="btn out block" id="mev-more">Voir plus (${l.length - ST.shown})</button>` : '');
    const m = $('#mev-more'); if (m) m.onclick = () => { ST.shown += 30; paintCartes(); };
  }
  function carte(e) {
    const p = A.parseDay(e.date_evt), st = statutInfo(e), nb = Number(e.nb_participants) || 0;
    const heure = e.heure_debut ? hh(e.heure_debut) + (e.heure_fin ? ' – ' + hh(e.heure_fin) : '') : 'Heure non précisée';
    return `<a class="card mev-card" href="#/mesevenements/${Number(e.id)}">
      <div class="mev-dt">${p ? `<b>${p.d}</b><span>${MOIS[p.m - 1]}</span>${p.y !== new Date().getFullYear() ? `<em>${p.y}</em>` : ''}` : '<b>?</b>'}</div>
      <div class="sp"><div class="mev-t">${esc(e.titre)}</div>
        <div class="meta">${ic('clock', 's')}<span class="ell">${esc(heure)}</span></div>
        <div class="meta">${ic('pin', 's')}<span class="ell">${esc(lieuTexte(e) || 'En ligne')}</span></div>
        <div class="tags"><span class="badge ${st.cls}">${esc(st.label)}</span><span class="badge">${esc(visLabel(e))}</span>${nb ? `<span class="badge">${esc(pl(nb, 'inscrit', 'inscrits'))}</span>` : ''}${e.fiche_id ? '<span class="badge">Fiche d’inscription</span>' : ''}${e.cr_statut === 'publie' ? '<span class="badge o">Compte-rendu publié</span>' : ''}</div></div>
      ${ic('chev', 's')}</a>`;
  }

  /* ============================================================
     PILOTAGE D'UN ÉVÉNEMENT
     ============================================================ */
  async function pilotage(t, id) {
    if (!gate(NOM)) return;
    setPane('Événement', SK);
    let d;
    try { d = await charger(id); }
    catch (e) {
      if (e.status === 403 || e.status === 404) { if (!vivant(t)) return; return setPane('Événement', `<div class="empty"><div class="ei">${ic('cal', 'l')}</div><b>${e.status === 404 ? 'Événement introuvable' : 'Événement non géré par ce compte'}</b>${esc(e.message)}<br><br><a class="btn" href="#/mesevenements">Mes événements</a></div>`); }
      return showError(t, 'Événement', e, 'Impossible de charger cet événement', () => pilotage(++rendu, id));
    }
    const e = d.e, st = statutInfo(e), termine = estTermine(e), brouillon = e.statut === 'brouillon';
    // Compte-rendu : uniquement utile une fois l'événement terminé.
    let cr = null, crErr = false;
    if (termine) { try { const r = await api(`/api/evenements/${encodeURIComponent(id)}/compte-rendu`); cr = r.compte_rendu || null; } catch (er) { crErr = true; } }
    if (!vivant(t)) return;

    const cov = e.image_couverture || e.image_url || '';
    const n = d.simples ? d.simples.length : 0, nf = d.fiche ? d.fiche.length : 0, nbIns = n + nf;
    const pers = nbPersonnes(d);
    const max = Number(e.places_max) || 0;
    const places = max ? (d.fiche ? `${max}` : String(Math.max(0, max - pers))) : '∞';
    const placesLib = max ? (d.fiche ? 'places prévues' : 'places libres') : 'places illimitées';
    const inconnu = d.simplesErreur;
    const j = joursAvant(e.date_evt);
    const promo = promoEtat(e, brouillon, termine, j);
    const desc = e.description ? A.strip(e.description) : '';

    const html = `${cov ? A.mediaBlock(cov, { alt: e.titre }) : ''}
      <div class="card" style="margin-top:12px"><div class="pad">
        <h2 style="margin:0 0 8px;font-size:20px;line-height:1.25;word-break:break-word">${esc(e.titre)}</h2>
        <div class="meta">${ic('cal', 's')}<span>${esc(A.dateLong(e.date_evt))}${e.date_fin && e.date_fin !== e.date_evt ? ' → ' + esc(A.dateLong(e.date_fin)) : ''}</span></div>
        ${e.heure_debut ? `<div class="meta">${ic('clock', 's')}<span>${esc(hh(e.heure_debut))}${e.heure_fin ? ' – ' + esc(hh(e.heure_fin)) : ''}</span></div>` : ''}
        <div class="meta">${ic('pin', 's')}<span>${esc([e.lieu, e.ville, e.pays].filter((v, i, a) => v && a.indexOf(v) === i).join(', ') || 'En ligne')}</span></div>
        <div class="tags"><span class="badge ${st.cls}">${esc(st.label)}</span><span class="badge">${esc(visLabel(e))}</span><span class="badge ${partLabel(e) === 'Gratuit' ? 'g' : 'o'}">${esc(partLabel(e))}</span>${Number(e.inscription_ouverte) === 0 ? '<span class="badge">Sans inscription</span>' : ''}${e.promo_lancee_at ? '<span class="badge o">Promotion lancée</span>' : ''}</div>
        ${brouillon ? '<p class="small muted" style="margin:10px 0 0">Brouillon : seul votre compte voit cet événement. Publiez-le pour le rendre visible.</p>' : ''}
        ${desc ? `<div class="small" style="margin-top:10px;white-space:pre-line;color:var(--text)">${esc(desc.length > 280 ? desc.slice(0, 280).trim() + '…' : desc)}</div>` : ''}
      </div></div>
      <div class="mev-stats">
        <div class="mev-stat"><b>${inconnu ? '–' : nbIns}</b><span>${nbIns > 1 ? 'inscriptions' : 'inscription'}</span></div>
        <div class="mev-stat"><b>${inconnu ? '–' : pers}</b><span>${pers > 1 ? 'personnes' : 'personne'}</span></div>
        <div class="mev-stat"><b>${places}</b><span>${placesLib}</span></div>
      </div>
      ${max && !d.fiche && !inconnu ? `<div class="bar" style="margin:-4px 0 12px" role="progressbar" aria-valuenow="${Math.min(100, Math.round(pers * 100 / max))}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(100, Math.round(pers * 100 / max))}%"></i></div>` : ''}
      <div class="h2" style="margin-top:6px">SUIVRE</div>
      <div class="lst">
        <a class="li" href="#/mesevenements/${Number(e.id)}/inscrits"><span class="ic">${ic('people')}</span><span class="sp"><span class="t">Voir les inscrits</span><br><span class="d">${inconnu ? 'Liste momentanément indisponible' : nbIns ? esc(pl(nbIns, 'inscription', 'inscriptions')) + ' · ' + esc(pl(pers, 'personne', 'personnes')) : 'Aucune inscription pour le moment'}</span></span><span class="ch">${ic('chev', 's')}</span></a>
        <a class="li" href="#/evenement/${Number(e.id)}"><span class="ic">${ic('cal')}</span><span class="sp"><span class="t">Voir la fiche comme un visiteur</span><br><span class="d">${brouillon ? 'Aperçu réservé à vous' : 'Ce que voient les membres'}</span></span><span class="ch">${ic('chev', 's')}</span></a>
        ${!brouillon && ['public', 'boutique'].includes(e.visibilite || 'public') ? `<button class="li" id="mev-share"><span class="ic">${ic('share')}</span><span class="sp"><span class="t">Partager l’événement</span><br><span class="d">Envoyer le lien par message ou le copier</span></span><span class="ch">${ic('chev', 's')}</span></button>` : ''}
        ${promo.html}
      </div>
      ${termine ? crSection(e, cr, crErr) : ''}
      <div class="h2">PUBLICATION</div>
      <div class="lst">
        <a class="li" href="#/mesevenements/${Number(e.id)}/modifier"><span class="ic">${ic('file')}</span><span class="sp"><span class="t">Modifier les informations</span><br><span class="d">Titre, date, lieu, places, description</span></span><span class="ch">${ic('chev', 's')}</span></a>
        <button class="li" id="mev-statut"><span class="ic">${ic(brouillon ? 'check' : 'lock')}</span><span class="sp"><span class="t">${brouillon ? 'Publier l’événement' : 'Repasser en brouillon'}</span><br><span class="d">${brouillon ? 'Le rendre visible selon sa visibilité' : 'Le retirer du public, sans rien supprimer'}</span></span><span class="ch">${ic('chev', 's')}</span></button>
        <button class="li mev-danger" id="mev-suppr"><span class="ic">${ic('close')}</span><span class="sp"><span class="t">Supprimer l’événement</span><br><span class="d">Définitif · impossible s’il y a des inscrits</span></span></button>
      </div>
      <div class="mev-note" style="margin-top:14px"><b>À finir sur ordinateur</b>Certains réglages demandent un grand écran :<ul><li>mise en forme de la description, photos et vidéos supplémentaires, documents</li><li>fiche d’inscription personnalisée, tarifs et billets</li><li>rédaction complète du compte-rendu</li></ul><a href="evenements.html#evt-${Number(e.id)}" style="text-decoration:underline;font-weight:700;display:inline-block;margin-top:6px">Ouvrir cet événement sur ordinateur</a></div>`;

    const foot = brouillon ? `<button class="btn block" id="mev-pub-foot">Publier l’événement</button>` : `<a class="btn block" href="#/mesevenements/${Number(e.id)}/inscrits">${ic('people', 's')} Voir les inscrits</a>`;
    paint(t, e.titre || 'Événement', html, foot);

    const bind = (sel, fn) => { const x = $(sel); if (x) x.onclick = fn; };
    bind('#mev-share', () => partager(e));
    bind('#mev-statut', () => changerStatut(e, brouillon));
    bind('#mev-pub-foot', () => changerStatut(e, true));
    bind('#mev-suppr', () => supprimer(e, nbIns));
    bind('#mev-promo', () => promouvoir(e));
    bind('#mev-cr-pub', () => crPublier(e, cr));
    bind('#mev-cr-depub', () => crDepublier(e));
  }

  /* Éligibilité de la promotion « J-7 » : mêmes conditions que evenements-app.html (le serveur les revérifie). */
  function promoEtat(e, brouillon, termine, j) {
    const ligne = (titre, detail, id) => `<${id ? 'button id="' + id + '"' : 'div'} class="li ${id ? '' : 'dim'}"><span class="ic">${ic('send')}</span><span class="sp"><span class="t">${titre}</span><br><span class="d">${detail}</span></span>${id ? `<span class="ch">${ic('chev', 's')}</span>` : ''}</${id ? 'button' : 'div'}>`;
    if (e.promo_lancee_at) return { html: ligne('Promotion déjà lancée', 'Utilisable une seule fois par événement', '') };
    if (brouillon || termine || (e.visibilite && e.visibilite !== 'public') || j == null) return { html: '' };
    if (j >= 1 && j <= 7) return { html: ligne(`Promouvoir (J-${j})`, 'Prévenir les membres concernés et mettre l’événement en avant', 'mev-promo') };
    if (j > 7) return { html: ligne('Promotion disponible à J-7', `Dans ${j - 7} jour${j - 7 > 1 ? 's' : ''} · prévient les membres concernés`, '') };
    return { html: '' };
  }

  async function partager(e) {
    // Même schéma de lien que le bouton « Partager » du site : ?evt=<id> + &via=<compte> + jeton anti-cache des aperçus.
    const url = location.origin + '/evenements.html?evt=' + Number(e.id) + '&via=' + Number(S.me.id) + '&r=' + Date.now().toString(36);
    try {
      if (navigator.share) await navigator.share({ title: e.titre, url });
      else { await navigator.clipboard.writeText(url); toast('Lien copié'); }
    } catch (er) {
      if (er && er.name === 'AbortError') return;
      try { await navigator.clipboard.writeText(url); toast('Lien copié'); } catch (e2) { toast('Partage impossible sur cet appareil.', true); }
    }
  }

  async function changerStatut(e, publier) {
    const msg = publier
      ? 'Publier cet événement ? Il sera visible selon la visibilité choisie (' + visLabel(e) + ').'
      : 'Repasser cet événement en brouillon ? Il disparaît du public ; les inscriptions déjà reçues sont conservées.';
    if (!confirm(msg)) return;
    const btns = $$('#mev-statut, #mev-pub-foot'); btns.forEach(b => b.disabled = true);
    try {
      await api('/api/evenements/' + Number(e.id), { method: 'PUT', body: bodyDepuis(e, { statut: publier ? 'ouvert' : 'brouillon' }) });
      toast(publier ? 'Événement publié ✓' : 'Événement repassé en brouillon');
      pilotage(++rendu, e.id);
    } catch (er) { btns.forEach(b => b.disabled = false); erreurAction(er); }
  }

  async function supprimer(e, nbIns) {
    // La suppression est refusée par le site dès qu'il y a des inscrits : on l'explique avant d'appeler.
    if (nbIns > 0) {
      const close = A.openSheet(`<h2 style="margin:4px 0 6px;font-size:18px">Suppression impossible</h2>
        <p class="muted" style="margin:0 0 14px">Cet événement compte déjà ${esc(pl(nbIns, 'inscription', 'inscriptions'))} : pour conserver l’historique, il ne peut pas être supprimé. Vous pouvez le repasser en brouillon pour le retirer du public, ou contacter l’administration.</p>
        ${e.statut === 'brouillon' ? '' : '<button class="btn block" id="mev-sh-draft">Repasser en brouillon</button>'}<button class="btn out block" id="mev-sh-close" style="margin-top:10px">Fermer</button>`);
      const c = $('#mev-sh-close'); if (c) c.onclick = close;
      const d = $('#mev-sh-draft'); if (d) d.onclick = () => { close(); changerStatut(e, false); };
      return;
    }
    if (!confirm('Supprimer définitivement « ' + e.titre + ' » ?\n\nCette action est irréversible.')) return;
    const b = $('#mev-suppr'); if (b) b.disabled = true;
    try {
      await api('/api/evenements/' + Number(e.id), { method: 'DELETE' });
      toast('Événement supprimé');
      location.replace('#/mesevenements');
    } catch (er) { if (b) b.disabled = false; erreurAction(er); }
  }

  async function promouvoir(e) {
    const b = $('#mev-promo'); if (b) b.disabled = true;
    let ap;
    try { ap = await api(`/api/evenements/${Number(e.id)}/promouvoir`); }
    catch (er) { if (b) b.disabled = false; return erreurAction(er); }
    if (b) b.disabled = false;
    if (!ap.eligible) { toast(ap.raison || 'La promotion n’est pas disponible pour cet événement.', true); return; }
    const crit = ap.criteres || {};
    const cible = crit.origines && crit.origines.length ? 'la diaspora ' + crit.origines.join(' / ') : 'toutes les diasporas';
    const nb = Number(ap.nb_cibles) || 0;
    const close = A.openSheet(`<h2 style="margin:4px 0 6px;font-size:18px">Lancer la promotion ?</h2>
      <p class="muted" style="margin:0 0 8px">Une notification sera envoyée à environ <b style="color:var(--text)">${esc(pl(nb, 'membre', 'membres'))}</b> (${esc(cible)} · zone : ${esc(crit.zone || 'National')}), et l’événement sera mis en avant dans le fil d’actualité.</p>
      <p class="muted small" style="margin:0 0 14px">Utilisable une seule fois, sans retour en arrière.</p>
      <button class="btn block" id="mev-sh-go">Lancer la promotion</button><button class="btn out block" id="mev-sh-no" style="margin-top:10px">Annuler</button>`);
    $('#mev-sh-no').onclick = close;
    $('#mev-sh-go').onclick = async () => {
      const go = $('#mev-sh-go'); go.disabled = true; go.textContent = 'Envoi…';
      try {
        const r = await api(`/api/evenements/${Number(e.id)}/promouvoir`, { method: 'POST', body: {} });
        close(); toast(`Promotion lancée : ${pl(Number(r.nb_notifications) || 0, 'membre notifié', 'membres notifiés')} ✓`);
        pilotage(++rendu, e.id);
      } catch (er) { close(); erreurAction(er); }
    };
  }

  /* ---------- compte-rendu (lecture et publication ; la rédaction reste sur ordinateur) ---------- */
  function crSection(e, cr, crErr) {
    const id = Number(e.id);
    let corps;
    if (crErr) corps = '<p class="muted small" style="margin:0">Le compte-rendu est momentanément indisponible. Réessayez dans un instant.</p>';
    else if (!cr) corps = `<p class="muted small" style="margin:0 0 12px">Aucun compte-rendu pour l’instant. Il se rédige sur ordinateur (mise en forme, sections, photos), puis vous pouvez le publier d’ici.</p>
      <a class="btn out block sm" href="compte-rendu.html?evt=${id}">Rédiger sur ordinateur ${ic('out', 's')}</a>`;
    else if (cr.statut === 'publie') corps = `<div class="row" style="margin-bottom:10px"><span class="badge g">Publié</span><span class="small muted sp">${esc(depuis('Publié', cr.published_at))}</span></div>
      <div style="font-weight:700;margin-bottom:10px;word-break:break-word">${esc(cr.titre || e.titre)}</div>
      <div class="row"><a class="btn sm sp" href="#/cr/${id}">Lire</a><button class="btn out sm sp" id="mev-cr-depub">Dépublier</button></div>`;
    else corps = `<div class="row" style="margin-bottom:10px"><span class="badge o">Brouillon</span><span class="small muted sp">Non visible des membres</span></div>
      <div style="font-weight:700;margin-bottom:10px;word-break:break-word">${esc(cr.titre || e.titre)}</div>
      <div class="row"><a class="btn out sm sp" href="#/cr/${id}">Relire</a><button class="btn sm sp" id="mev-cr-pub">Publier</button></div>
      <a class="small" href="compte-rendu.html?evt=${id}" style="display:inline-block;margin-top:10px;text-decoration:underline;color:var(--navy2);font-weight:600">Le modifier sur ordinateur</a>`;
    return `<div class="h2">COMPTE-RENDU</div><div class="card"><div class="pad">${corps}</div></div>`;
  }
  async function crPublier(e) {
    if (!confirm('Publier ce compte-rendu ?\n\nIl sera visible des membres' + ((e.visibilite || 'public') === 'public' ? ' et publié dans le fil d’actualité.' : '.'))) return;
    const b = $('#mev-cr-pub'); if (b) b.disabled = true;
    try { const r = await api(`/api/evenements/${Number(e.id)}/compte-rendu/publier`, { method: 'POST', body: {} }); toast(r.dans_le_fil ? 'Compte-rendu publié dans le fil ✓' : 'Compte-rendu publié ✓'); pilotage(++rendu, e.id); }
    catch (er) { if (b) b.disabled = false; erreurAction(er); }
  }
  async function crDepublier(e) {
    if (!confirm('Dépublier ce compte-rendu ?\n\nIl repasse en brouillon et disparaît du fil d’actualité.')) return;
    const b = $('#mev-cr-depub'); if (b) b.disabled = true;
    try { await api(`/api/evenements/${Number(e.id)}/compte-rendu/publier`, { method: 'DELETE' }); toast('Compte-rendu dépublié'); pilotage(++rendu, e.id); }
    catch (er) { if (b) b.disabled = false; erreurAction(er); }
  }

  /* ============================================================
     INSCRITS
     ============================================================ */
  const IN = { rows: [], q: '', shown: 40 };

  async function inscrits(t, id) {
    if (!gate(NOM)) return;
    setPane('Inscrits', SK);
    let d;
    try { d = await charger(id); }
    catch (e) {
      if (e.status === 403 || e.status === 404) { if (!vivant(t)) return; return setPane('Inscrits', `<div class="empty"><b>Événement indisponible</b>${esc(e.message)}<br><br><a class="btn" href="#/mesevenements">Mes événements</a></div>`); }
      return showError(t, 'Inscrits', e, 'Impossible de charger les inscrits', () => inscrits(++rendu, id));
    }
    if (!vivant(t)) return;
    const e = d.e;
    IN.rows = [
      ...(d.simples || []).map(p => ({ nom: p.nom_complet || 'Nom non renseigné', pers: Number(p.nb_personnes) || 1, email: p.email, tel: p.telephone, msg: p.message, date: p.created_at, statut: null, type: '' })),
      ...(d.fiche || []).map(i => ({ nom: [i.prenom, i.nom].filter(Boolean).join(' ') || 'Nom non renseigné', pers: 1, email: i.email, tel: i.telephone, msg: '', date: i.created_at, statut: i.statut, type: i.type_label || '' }))
    ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    IN.q = ''; IN.shown = 40;
    const actives = (d.simples || []).reduce((n, p) => n + (Number(p.nb_personnes) || 1), 0) + ficheActives(d).length;
    const html = `<div class="card"><div class="pad"><div style="font-weight:700;margin-bottom:6px;word-break:break-word">${esc(e.titre)}</div>
        <div class="row"><div class="sp"><b style="font-size:20px">${IN.rows.length}</b> <span class="muted small">${IN.rows.length > 1 ? 'inscriptions' : 'inscription'}</span></div><div><b style="font-size:20px">${actives}</b> <span class="muted small">${actives > 1 ? 'personnes' : 'personne'}</span></div></div></div></div>
      ${d.simplesErreur ? '<div class="mev-note"><b>Liste incomplète</b>Les inscriptions du formulaire simple n’ont pas pu être chargées. Réessayez dans un instant.</div>' : ''}
      ${d.ficheErreur ? '<div class="mev-note"><b>Fiche d’inscription indisponible</b>Les inscriptions de la fiche liée n’ont pas pu être chargées.</div>' : ''}
      ${e.fiche_id ? `<div class="mev-note"><b>Fiche d’inscription liée</b>Les actions sur ces inscriptions (confirmer, marquer présent, renvoyer le QR code) se font sur ordinateur.<br><a href="inscriptions-admin.html?fiche=${Number(e.fiche_id)}" style="text-decoration:underline;font-weight:700">Ouvrir la fiche sur ordinateur</a></div>` : ''}
      ${IN.rows.length > 5 ? `<div class="search">${ic('search', 's')}<input id="mev-iq" type="search" placeholder="Rechercher un nom, un e-mail, un numéro…" aria-label="Rechercher parmi les inscrits"></div>` : ''}
      <div id="mev-ilist"></div>`;
    paint(t, 'Inscrits', html);
    const q = $('#mev-iq');
    if (q) { let tm; q.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { IN.q = q.value.trim(); IN.shown = 40; paintInscrits(); }, 200); }; }
    paintInscrits();
  }
  function paintInscrits() {
    const box = $('#mev-ilist'); if (!box) return;
    const q = IN.q.toLowerCase();
    const l = IN.rows.filter(r => !q || [r.nom, r.email, r.tel, r.type].join(' ').toLowerCase().includes(q));
    if (!l.length) { box.innerHTML = IN.rows.length ? `<div class="empty"><b>Aucun résultat</b>Essayez un autre nom ou un autre e-mail.</div>` : `<div class="empty"><div class="ei">${ic('people', 'l')}</div><b>Aucune inscription pour le moment</b>Les inscriptions apparaîtront ici dès qu’un membre s’inscrira.</div>`; return; }
    box.innerHTML = l.slice(0, IN.shown).map(r => {
      const sf = r.statut ? (STATUT_FICHE[r.statut] || [r.statut, '']) : null;
      const tel = r.tel ? String(r.tel).replace(/[^\d+]/g, '') : '';
      return `<div class="card pad"><div class="row"><div class="av">${esc(A.initials(r.nom))}</div><div class="sp"><div style="font-weight:700;word-break:break-word">${esc(r.nom)}${r.pers > 1 ? ` <span class="muted small" style="font-weight:400">· ${r.pers} personnes</span>` : ''}</div>
        <div class="small muted">${esc(depuis('Inscrit', r.date))}${r.type ? ' · ' + esc(r.type) : ''}</div></div>${sf ? `<span class="badge ${sf[1]}">${esc(sf[0])}</span>` : ''}</div>
        ${r.email || tel ? `<div class="mev-contact">${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : ''}${tel ? `<a href="tel:${esc(tel)}">${esc(r.tel)}</a>` : ''}</div>` : ''}
        ${r.msg ? `<div class="small" style="margin-top:8px;padding:8px 10px;background:var(--bg);border-radius:10px;white-space:pre-line;word-break:break-word">${esc(r.msg)}</div>` : ''}</div>`;
    }).join('') + (l.length > IN.shown ? `<button class="btn out block" id="mev-imore">Voir plus (${l.length - IN.shown})</button>` : '');
    const m = $('#mev-imore'); if (m) m.onclick = () => { IN.shown += 40; paintInscrits(); };
  }

  /* ============================================================
     CRÉATION / MODIFICATION
     ============================================================ */
  let PAYS = null; // liste des pays du site (assets/data.js), lue sans charger le script
  async function chargerPays() {
    if (PAYS) return PAYS;
    try {
      const txt = await (await fetch('assets/data.js', { credentials: 'same-origin' })).text();
      const m = /const PAYS_DU_MONDE\s*=\s*(\[[\s\S]*?\])\s*(?:\.sort\(\))?\s*;/.exec(txt);
      // Le site trie sans tenir compte des accents (« Égypte » en fin de liste) : on trie à la française.
      PAYS = m ? JSON.parse(m[1]).sort((a, b) => a.localeCompare(b, 'fr')) : [];
    } catch (e) { PAYS = []; }
    return PAYS;
  }

  /* Photo : réduite dans le navigateur (≤ 1600 px, JPEG) avant l'envoi, comme le fait le site. */
  function reduirePhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve(b) : reject(new Error('Cette image ne peut pas être traitée.')), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Cette image ne peut pas être lue. Choisissez une photo JPEG, PNG ou WebP.')); };
      img.src = url;
    });
  }
  async function envoyerPhoto(blob) {
    const fd = new FormData(); fd.append('evenement', blob, 'evenement.jpg');
    let r; try { r = await fetch('/api/upload/evenement', { method: 'POST', body: fd, credentials: 'same-origin' }); }
    catch (e) { throw new Error('Connexion impossible pendant l’envoi de la photo. Vérifiez votre réseau.'); }
    let j = null; try { j = await r.json(); } catch (e) { /* réponse vide */ }
    if (!r.ok || !j || !j.url) throw Object.assign(new Error((j && j.error) || 'La photo n’a pas pu être envoyée.'), { status: r.status });
    return j.url;
  }

  const opt = (name, val, titre, aide, on) => `<label class="mev-opt ${on ? 'on' : ''}"><input type="radio" name="${name}" value="${val}" ${on ? 'checked' : ''}><span><b>${titre}</b><small>${aide}</small></span></label>`;
  const sel = (id, opts, cur, vide) => `<select id="${id}">${vide ? `<option value="">${vide}</option>` : ''}${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, DOMAINES_LIB[o] || o]; return `<option value="${esc(v)}" ${String(cur || '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;

  async function formulaire(t, id) {
    const edition = !!id; const titrePane = edition ? 'Modifier l’événement' : 'Nouvel événement';
    if (!gate(titrePane)) return;
    let e = null;
    if (edition) {
      setPane(titrePane, SK);
      try { e = (await charger(id)).e; }
      catch (er) {
        if (er.status === 403 || er.status === 404) { if (!vivant(t)) return; return setPane(titrePane, `<div class="empty"><b>Événement indisponible</b>${esc(er.message)}<br><br><a class="btn" href="#/mesevenements">Mes événements</a></div>`); }
        return showError(t, titrePane, er, 'Impossible de charger cet événement', () => formulaire(++rendu, id));
      }
      if (!vivant(t)) return;
    }
    const v = e || {};
    const plat = !e || estPlat(e.description);
    const pays = await chargerPays(); if (!vivant(t)) return;
    const zoneInit = v.zone_diffusion || '';

    const html = `<form id="mev-form" class="mev-f" novalidate autocomplete="off">
      <div class="mev-gerr" id="mev-gerr" role="alert"></div>
      ${edition ? '' : `<div class="h2" style="margin-top:2px">TYPE D’ÉVÉNEMENT</div>
        ${opt('mev-mode', 'inscriptions', 'Avec inscriptions', 'Les membres s’inscrivent depuis l’application ; vous suivez la liste des inscrits.', true)}
        ${opt('mev-mode', 'flash', 'Événement flash', 'Informatif, sans inscription : pour prévenir vite la communauté.', false)}`}
      <div class="h2">L’ESSENTIEL</div>
      <label class="mev-l" for="mev-titre">Titre *</label>
      <input type="text" id="mev-titre" maxlength="160" value="${esc(v.titre || '')}" placeholder="Ex. : Soirée de la diaspora" aria-describedby="mev-e-titre"><div class="mev-err" id="mev-e-titre" role="alert"></div>
      ${edition ? '' : `<div class="mev-2"><div><label class="mev-l" for="mev-type">Forme</label>${sel('mev-type', FORMES, 'evenement')}</div>
        <div><label class="mev-l" for="mev-domaine">Domaine</label>${sel('mev-domaine', DOMAINES, '', 'Choisir…')}</div></div>`}
      <label class="mev-l" for="mev-date">Date *</label>
      <input type="date" id="mev-date" value="${esc(String(v.date_evt || '').slice(0, 10))}" aria-describedby="mev-e-date"><div class="mev-err" id="mev-e-date" role="alert"></div>
      <div class="mev-2"><div><label class="mev-l" for="mev-hd">Début</label><input type="time" id="mev-hd" value="${esc(hh(v.heure_debut) || (edition ? '' : '09:00'))}"></div>
        <div><label class="mev-l" for="mev-hf">Fin</label><input type="time" id="mev-hf" value="${esc(hh(v.heure_fin))}"></div></div>
      <div class="h2">LIEU</div>
      <div class="mev-2"><div><label class="mev-l" for="mev-pays">Pays</label><input type="text" id="mev-pays" list="mev-pays-l" value="${esc(v.pays || '')}" placeholder="France" autocomplete="off"><datalist id="mev-pays-l">${pays.map(p => `<option value="${esc(p)}">`).join('')}</datalist></div>
        <div><label class="mev-l" for="mev-ville">Ville</label><input type="text" id="mev-ville" value="${esc(v.ville || '')}" placeholder="Paris"></div></div>
      <label class="mev-l" for="mev-lieu">Adresse ou salle</label>
      <input type="text" id="mev-lieu" value="${esc(v.lieu || '')}" placeholder="Ex. : Salle des fêtes, 12 rue…" aria-describedby="mev-e-lieu"><div class="mev-err" id="mev-e-lieu" role="alert"></div>
      <label class="mev-l" for="mev-visio">Lien de visioconférence <small>(si en ligne)</small></label>
      <input type="url" id="mev-visio" value="${esc(v.lien_visio || '')}" placeholder="https://meet.google.com/…" inputmode="url" aria-describedby="mev-e-visio"><div class="mev-err" id="mev-e-visio" role="alert"></div>
      <div class="h2">DESCRIPTION</div>
      ${plat ? `<label class="mev-l" for="mev-desc">Description * <small id="mev-cnt"></small></label>
        <textarea id="mev-desc" placeholder="Programme, objectifs, public concerné…" aria-describedby="mev-e-desc">${esc(v.description || '')}</textarea><div class="mev-err" id="mev-e-desc" role="alert"></div>`
        : `<div class="mev-note"><b>Description mise en forme</b>La description de cet événement contient une mise en forme (gras, listes, liens). Pour ne pas l’abîmer, elle se modifie sur ordinateur : elle sera conservée telle quelle.</div>`}
      <div class="h2" id="mev-h-places">PLACES</div>
      <div id="mev-b-places">
        <label class="mev-l" for="mev-places">Nombre de places <small>(vide = illimité)</small></label>
        <input type="number" id="mev-places" min="1" step="1" inputmode="numeric" value="${v.places_max ? esc(v.places_max) : ''}" placeholder="Illimitées" aria-describedby="mev-e-places"><div class="mev-err" id="mev-e-places" role="alert"></div>
      </div>
      ${edition ? `<div class="mev-note" style="margin-top:14px"><b>Visibilité : ${esc(visLabel(v))}</b>Elle se règle à la création ; pour la changer, ouvrez l’événement sur ordinateur.</div>` : `
      <div id="mev-b-part"><div class="h2">PARTICIPATION</div>
        ${opt('mev-part', 'gratuit', 'Gratuit', 'Aucune participation financière.', true)}
        ${opt('mev-part', 'partiellement_payant', 'Partiellement payant', 'Certaines places ou formules sont payantes.', false)}
        ${opt('mev-part', 'payant', 'Payant', 'Participation payante.', false)}
        <p class="mev-hint" id="mev-part-hint" hidden>Les tarifs se définissent dans la fiche d’inscription, sur ordinateur : ici, vous indiquez seulement la catégorie affichée.</p></div>
      <div class="h2">VISIBILITÉ</div>
        ${opt('mev-vis', 'both', 'Boutique et Événements', 'Visible dans le calendrier public et sur votre page boutique.', true)}
        ${opt('mev-vis', 'public', 'Événements uniquement', 'Visible dans le calendrier public, pas sur votre boutique.', false)}
        ${opt('mev-vis', 'boutique', 'Boutique uniquement', 'Visible sur votre boutique, pas dans le calendrier public.', false)}
        <p class="mev-hint">Événement privé ou réservé aux abonnés : à régler sur ordinateur.</p>
      <div class="h2">PUBLIC CIBLÉ <span style="font-weight:400">(facultatif)</span></div>
        <div class="mev-2"><div><label class="mev-l" for="mev-origine">Diaspora ciblée</label>${sel('mev-origine', pays, '', 'Toutes')}</div>
          <div><label class="mev-l" for="mev-zone">Zone de diffusion</label>${sel('mev-zone', ZONES, zoneInit, 'Non précisée')}</div></div>
        <p class="mev-hint">Sert à choisir les membres prévenus lors de la promotion de l’événement.</p>
      <div class="h2">PHOTO <span style="font-weight:400">(facultative)</span></div>
        <div class="mev-photo"><img id="mev-ph-img" alt="" hidden><div class="sp"><input type="file" id="mev-photo" accept="image/jpeg,image/png,image/webp" aria-label="Choisir une photo de couverture"><button type="button" class="btn out sm" id="mev-ph-del" hidden style="margin-top:8px">Retirer la photo</button></div></div>
        <div class="mev-err" id="mev-e-photo" role="alert"></div>
      <div id="mev-modele"></div>`}
    </form>`;

    const foot = edition
      ? `<button class="btn block" id="mev-save">Enregistrer les modifications</button>`
      : `<button class="btn out" id="mev-draft" style="flex:1">Brouillon</button><button class="btn" id="mev-pub" style="flex:2">Publier</button>`;
    setPane(titrePane, html, foot);

    const form = $('#mev-form');
    form.onsubmit = ev => ev.preventDefault();
    // Cartes à cocher : surbrillance de la carte choisie (sans dépendre de :has).
    $$('.mev-opt input', form).forEach(r => r.addEventListener('change', () => {
      $$(`.mev-opt input[name="${r.name}"]`, form).forEach(x => x.closest('.mev-opt').classList.toggle('on', x.checked));
      majMode(); }));
    const mode = () => { const c = $('input[name="mev-mode"]:checked', form); return c ? c.value : 'inscriptions'; };
    const compteur = () => { const d = $('#mev-desc'), c = $('#mev-cnt'); if (d && c) c.textContent = mode() === 'flash' ? d.value.length + '/500' : ''; };
    function majMode() {
      const flash = !edition && mode() === 'flash';
      const bp = $('#mev-b-places'), hp = $('#mev-h-places'), bpart = $('#mev-b-part'), mod = $('#mev-modele');
      if (bp) bp.hidden = flash; if (hp) hp.hidden = flash; if (bpart) bpart.hidden = flash; if (mod) mod.hidden = flash;
      const d = $('#mev-desc'); if (d) d.maxLength = flash ? 500 : 5000;
      const part = $('input[name="mev-part"]:checked', form), hint = $('#mev-part-hint');
      if (hint) hint.hidden = !part || part.value === 'gratuit';
      compteur();
    }
    const d0 = $('#mev-desc'); if (d0) d0.addEventListener('input', compteur);
    majMode();

    let photo = null; // Blob déjà réduit, envoyé seulement à la validation
    const ph = $('#mev-photo');
    if (ph) ph.onchange = async () => {
      const f = ph.files[0]; const err = $('#mev-e-photo'); err.textContent = '';
      if (!f) return;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { err.textContent = 'Format non pris en charge : choisissez une photo JPEG, PNG ou WebP.'; ph.value = ''; return; }
      if (f.size > 20 * 1024 * 1024) { err.textContent = 'Cette photo est trop lourde (20 Mo maximum).'; ph.value = ''; return; }
      try {
        photo = await reduirePhoto(f);
        if (photo.size > 5 * 1024 * 1024) { photo = null; ph.value = ''; err.textContent = 'Cette photo reste trop lourde après réduction (5 Mo maximum).'; return; }
        const im = $('#mev-ph-img'); im.src = URL.createObjectURL(photo); im.hidden = false; $('#mev-ph-del').hidden = false;
      } catch (er) { photo = null; ph.value = ''; err.textContent = er.message; }
    };
    const pd = $('#mev-ph-del'); if (pd) pd.onclick = () => { photo = null; ph.value = ''; $('#mev-ph-img').hidden = true; pd.hidden = true; };

    // Modèle standard de fiche d'inscription : proposé (et décochable) comme sur le site, jamais appliqué en silence.
    let modeleNom = null;
    if (!edition) {
      api('/api/insc/modele-standard').then(r => {
        if (!r || !r.fiche || !vivant(t)) return;
        modeleNom = r.fiche.nom; const box = $('#mev-modele'); if (!box) return;
        box.innerHTML = `<label class="mev-opt on" style="margin-top:14px"><input type="checkbox" id="mev-modele-ck" checked><span><b>Utiliser ma fiche d’inscription standard</b><small>« ${esc(r.fiche.nom)} » : une copie sera créée pour cet événement.</small></span></label>`;
        $('#mev-modele-ck').onchange = ev => ev.target.closest('.mev-opt').classList.toggle('on', ev.target.checked);
      }).catch(() => { /* facultatif */ });
    }

    const champ = id => { const x = $('#' + id); return x ? x.value.trim() : ''; };
    function erreur(id, msg) { const x = $('#mev-' + id), m = $('#mev-e-' + id); if (x) x.setAttribute('aria-invalid', 'true'); if (m) m.textContent = msg; return x; }
    function valider() {
      $$('#mev-form [aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
      $$('#mev-form .mev-err').forEach(x => { x.textContent = ''; });
      $('#mev-gerr').textContent = '';
      const flash = !edition && mode() === 'flash'; let first = null;
      const bad = (id, msg) => { const x = erreur(id, msg); if (!first) first = x; };
      if (!champ('mev-titre')) bad('titre', 'Donnez un titre à votre événement.');
      const date = champ('mev-date');
      if (!date) bad('date', 'Choisissez la date de l’événement.');
      const visio = champ('mev-visio');
      if (visio && !/^https?:\/\/\S+$/i.test(visio)) bad('visio', 'Ce lien doit commencer par https://');
      if (!champ('mev-lieu') && !champ('mev-ville') && !visio) bad('lieu', 'Indiquez l’adresse, la ville ou un lien de visioconférence.');
      const dsc = $('#mev-desc');
      if (dsc) { if (!dsc.value.trim()) bad('desc', 'Décrivez votre événement en quelques lignes.'); else if (flash && dsc.value.length > 500) bad('desc', 'Une description d’événement flash tient en 500 caractères maximum.'); }
      const pl_ = champ('mev-places');
      if (!flash && pl_ && (!/^\d+$/.test(pl_) || Number(pl_) < 1)) bad('places', 'Indiquez un nombre entier de places (1 ou plus), ou laissez vide.');
      if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (first.focus) first.focus(); $('#mev-gerr').textContent = 'Certains champs sont à corriger.'; return false; }
      return true;
    }
    // Bloque les boutons du pied pendant l'envoi ; seul le bouton touché change de libellé.
    const bloquer = (on, btn, txt) => $$('#pane-foot button').forEach(b => { b.disabled = on; if (b === btn) { if (on) { b.dataset.t = b.textContent; b.textContent = txt; } else if (b.dataset.t) b.textContent = b.dataset.t; } });

    async function enregistrer(statut, btn) {
      if (!valider()) return;
      const flash = !edition && mode() === 'flash';
      const visio = champ('mev-visio'), lieu = champ('mev-lieu'), ville = champ('mev-ville');
      let body;
      if (edition) {
        body = bodyDepuis(e, {
          titre: champ('mev-titre'), date_evt: champ('mev-date'), heure_debut: champ('mev-hd') || null, heure_fin: champ('mev-hf') || null,
          pays: champ('mev-pays') || null, ville: ville || null, lieu: lieu || ville || null, lien_visio: visio || null,
          places_max: champ('mev-places') ? Number(champ('mev-places')) : null
        });
        if ($('#mev-desc')) body.description = $('#mev-desc').value.trim();
      } else {
        const vis = $('input[name="mev-vis"]:checked', form).value;
        body = {
          titre: champ('mev-titre'), type_evt: champ('mev-type') || 'evenement', domaine: champ('mev-domaine') || null, date_evt: champ('mev-date'),
          heure_debut: champ('mev-hd') || null, heure_fin: champ('mev-hf') || null, pays: champ('mev-pays') || null, ville: ville || null,
          lieu: lieu || ville || null, lien_visio: visio || null, description: $('#mev-desc').value.trim(),
          origine: champ('mev-origine') || null, zone_diffusion: champ('mev-zone') || null,
          visibilite: vis === 'boutique' ? 'boutique' : 'public', masquer_boutique: vis === 'public',
          statut, galerie_photos: []
        };
        if (visio && !lieu && !ville) body.mode_participation = 'distanciel';
        if (flash) { body.inscription_ouverte = false; body.appliquer_fiche_standard = false; }
        else {
          body.inscription_ouverte = true;
          body.places_max = champ('mev-places') ? Number(champ('mev-places')) : null;
          body.type_participation = $('input[name="mev-part"]:checked', form).value;
          const ck = $('#mev-modele-ck'); if (modeleNom && ck) body.appliquer_fiche_standard = ck.checked;
        }
      }
      if (!edition && statut === 'ouvert' && !(await confirmerPublication(body))) return;
      bloquer(true, btn, statut === 'ouvert' && !edition ? 'Publication…' : 'Enregistrement…');
      try {
        if (!edition && photo) body.image_couverture = await envoyerPhoto(photo);
        if (edition) { await api('/api/evenements/' + Number(e.id), { method: 'PUT', body }); toast('Modifications enregistrées ✓'); if (history.length > 1) history.back(); else location.replace('#/mesevenements/' + Number(e.id)); }
        else {
          const r = await api('/api/evenements', { method: 'POST', body });
          toast(statut === 'ouvert' ? 'Événement publié ✓' : 'Brouillon enregistré ✓');
          location.replace('#/mesevenements/' + Number(r.id));
        }
      } catch (er) {
        bloquer(false, btn);
        if (er && er.status === 402) { A.premiumSheet(NOM); return; }
        const g = $('#mev-gerr'); if (g) { g.textContent = (er && er.message) || 'Enregistrement impossible.'; g.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        toast((er && er.message) || 'Enregistrement impossible.', true);
      }
    }
    // Publier prévient les abonnés de l'initiative : on récapitule avant d'envoyer.
    function confirmerPublication(b) {
      return new Promise(res => {
        const vis = b.visibilite === 'boutique' ? 'Boutique uniquement' : b.masquer_boutique ? 'Événements uniquement' : 'Boutique et Événements';
        const close = A.openSheet(`<h2 style="margin:4px 0 8px;font-size:18px">Publier cet événement ?</h2>
          <div class="lst" style="margin-bottom:12px"><div class="li" style="cursor:default"><span class="sp"><span class="t" style="word-break:break-word">${esc(b.titre)}</span><br><span class="d">${esc(A.dateLong(b.date_evt))}${b.heure_debut ? ' · ' + esc(b.heure_debut) : ''}</span><br><span class="d">${esc([b.lieu, b.pays].filter(Boolean).join(', ') || 'En ligne')} · ${esc(vis)}${b.inscription_ouverte === false ? ' · sans inscription' : ''}</span></span></div></div>
          <p class="muted small" style="margin:0 0 14px">Les personnes qui suivent votre initiative seront prévenues.</p>
          <button class="btn block" id="mev-ok">Publier maintenant</button><button class="btn out block" id="mev-ko" style="margin-top:10px">Revenir au formulaire</button>`);
        $('#mev-ok').onclick = () => { close(); res(true); };
        $('#mev-ko').onclick = () => { close(); res(false); };
      });
    }
    const click = (sel2, fn) => { const x = $(sel2); if (x) x.onclick = fn; };
    click('#mev-pub', ev => enregistrer('ouvert', ev.currentTarget));
    click('#mev-draft', ev => enregistrer('brouillon', ev.currentTarget));
    click('#mev-save', ev => enregistrer(e.statut, ev.currentTarget));
  }
})();
