/* ============================================================
   Diaspo'Actif — Version téléphone : module « Cotisations et adhésions » (comptes Initiative)
   Route : #/cotisations                    tableau de bord (chiffres, interrupteur, accès rapides)
           #/cotisations/formules           formules d'adhésion (activer / désactiver, partager)
           #/cotisations/formules/nouvelle  création simple d'une formule
           #/cotisations/adherents          registre des adhérents (statut, recherche)
           #/cotisations/demandes           demandes d'adhésion à accepter ou refuser
   Mêmes routes d'API et mêmes règles que la section « Cotisations & Adhésions » de dashboard-initiative.html.
   Chargé APRÈS m.js : s'appuie uniquement sur window.MApp.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast } = A;
  window.MMods = window.MMods || {};

  const NOM = 'Cotisations et adhésions';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const SK = '<div class="sk skc" style="height:96px"></div><div class="sk skc" style="height:96px"></div><div class="sk skc" style="height:96px"></div>';

  /* Libellés repris tels quels du tableau de bord du site. */
  const TYPES = [['cotisation_annuelle', 'Cotisation annuelle'], ['cotisation_semestrielle', 'Cotisation semestrielle'], ['cotisation_trimestrielle', 'Cotisation trimestrielle'], ['cotisation_mensuelle', 'Cotisation mensuelle'], ['adhesion_unique', 'Adhésion unique'], ['don_libre', 'Don libre'], ['don_ponctuel', 'Don ponctuel'], ['participation_projet', 'Participation à un projet'], ['contribution_exceptionnelle', 'Contribution exceptionnelle'], ['autre', 'Autre']];
  const TYPE_LIB = Object.fromEntries(TYPES);
  const STATUTS = { a_jour: ['À jour', 'g'], en_attente: ['En attente', 'o'], non_a_jour: ['Non à jour', 'r'], suspendu: ['Suspendu', ''], radie: ['Radié', 'r'] };
  const BADGES = { fondateur: 'Fondateur', bienfaiteur: 'Bienfaiteur', donateur: 'Donateur', ambassadeur: 'Ambassadeur', grand_mecene: 'Grand mécène' };
  const MODES = [['carte', 'Carte bancaire'], ['paypal', 'PayPal'], ['virement', 'Virement']];

  function css() {
    if ($('#m-mod-cotisations-css')) return;
    const s = document.createElement('style');
    s.id = 'm-mod-cotisations-css';
    s.textContent = `
.mco-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.mco-stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 10px;text-align:center}
.mco-stat b{display:block;font-size:22px;line-height:1.2;color:var(--navy)}
.mco-stat span{font-size:12.5px;color:var(--muted)}
.mco-sw{flex:none;position:relative;width:54px;height:44px;display:flex;align-items:center;justify-content:center}
.mco-sw i{display:block;width:50px;height:30px;border-radius:15px;background:#B8C4D6;position:relative;transition:background .15s}
.mco-sw i::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .15s}
.mco-sw[aria-checked=true] i{background:var(--green)}
.mco-sw[aria-checked=true] i::after{transform:translateX(20px)}
.mco-sw[disabled]{opacity:.55}
.mco-note{background:var(--sky-l);border-radius:12px;padding:12px 14px;font-size:13.5px;color:var(--navy);margin-bottom:12px}
.mco-note b{display:block;margin-bottom:2px}
.mco-note ul{margin:6px 0 0;padding-left:1.2em}
.mco-warn{background:var(--orange-l);color:var(--orange-d)}
.mco-f label.mco-l{display:block;font-weight:700;font-size:13.5px;margin:14px 2px 5px}
.mco-f label.mco-l small{font-weight:400;color:var(--muted)}
.mco-f input[type=text],.mco-f input[type=number],.mco-f select,.mco-f textarea{display:block;width:100%;min-width:0;min-height:46px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:#fff;font-size:16px;color:var(--text);font-family:inherit}
.mco-f textarea{min-height:96px;resize:vertical;line-height:1.4}
.mco-f [aria-invalid=true]{border-color:var(--red);background:var(--red-l)}
.mco-err{color:var(--red);font-size:13px;margin:4px 2px 0}
.mco-err:empty{display:none}
.mco-gerr{background:var(--red-l);color:var(--red);border-radius:12px;padding:10px 14px;font-weight:600;font-size:14px;margin-bottom:12px}
.mco-gerr:empty{display:none}
.mco-opt{display:flex;gap:12px;align-items:flex-start;border:1.5px solid var(--border);background:#fff;border-radius:14px;padding:12px;margin-bottom:8px;cursor:pointer}
.mco-opt.on{border-color:var(--navy2);background:var(--sky-l)}
.mco-opt input{margin:3px 0 0;width:20px;height:20px;flex:none;accent-color:var(--navy2)}
.mco-opt b{display:block;font-size:15px}
.mco-opt small{display:block;color:var(--muted);font-size:12.5px;line-height:1.3}
.mco-hint{font-size:12.5px;color:var(--muted);margin:5px 2px 0;line-height:1.35}
.mco-fcard .pad{padding-bottom:12px}
.mco-contact{display:flex;flex-wrap:wrap;gap:6px 14px;margin:6px 0 4px;font-size:14px}
.mco-contact a{color:var(--navy2);font-weight:600;text-decoration:underline;word-break:break-all}
.mco-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
`;
    document.head.appendChild(s);
  }

  /* ---------- outils ---------- */
  let rendu = 0; // une réponse tardive ne doit jamais écraser un autre écran
  const vivant = t => t === rendu && /^#\/cotisations/.test(location.hash);
  const paint = (t, titre, html, foot) => { if (vivant(t)) setPane(titre, html, foot); };
  const pl = (n, un, plus) => n + ' ' + (n > 1 ? plus : un);
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function dateCourte(s) { const p = A.parseDay(s); return p ? p.d + ' ' + MOIS[p.m - 1] + ' ' + p.y : ''; }
  /* « il y a 3 h » / « le 7 sept. » : A.ago() renvoie soit une durée courte, soit une date. */
  function depuis(prefixe, d) {
    const a = A.ago(d); if (!a) return '';
    if (/^\d+ (min|h|j)$/.test(a)) return prefixe + ' il y a ' + a;
    return a.indexOf('instant') >= 0 ? prefixe + ' à l’instant' : prefixe + ' le ' + a;
  }
  function eur(n, dev) {
    const v = Number(n) || 0;
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: dev || 'EUR', minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v); }
    catch (e) { return v + ' ' + (dev || '€'); }
  }
  const ouvertes = i => i.adhesions_ouvertes == null ? true : !!i.adhesions_ouvertes; // vide = ouvert, comme le serveur
  const estAsso = i => ['Association', 'ONG'].includes(i.type);
  const lienAdhesion = (i, formuleId) => location.origin + '/adhesions.html?initiative=' + Number(i.id) + (formuleId ? '&formule=' + Number(formuleId) : '');
  function montantLib(f) {
    const d = f.devise || 'EUR';
    if (f.montant_type === 'libre') return 'Montant libre' + (Number(f.montant_max) ? ' (max ' + eur(f.montant_max, d) + ')' : '');
    if (f.montant_type === 'minimum') return 'À partir de ' + eur(f.montant_min, d);
    return Number(f.montant_fixe) > 0 ? eur(f.montant_fixe, d) : 'Gratuit';
  }

  function gate(titre) {
    if (!S.me) {
      setPane(titre, A.loginCard('Connectez-vous avec votre compte Initiative pour gérer vos cotisations et adhésions.'));
      const b = $('#go-login'); if (b) b.onclick = () => A.openLogin();
      return false;
    }
    if (S.me.role !== 'initiative') {
      setPane(titre, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Réservé aux comptes Initiative</b>Les cotisations et adhésions sont gérées depuis un compte Initiative. Changez de compte si vous en avez un lié.<br><br><a class="btn" href="#/moi">Retour à mon espace</a></div>`);
      return false;
    }
    if (A.premiumLocked(2)) { lockPane(titre); return false; }
    return true;
  }
  function lockPane(titre) {
    setPane(titre, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Module Premium</b>Votre abonnement Premium est arrivé à expiration : vos formules et vos adhérents sont conservés, mais leur gestion est suspendue jusqu’au renouvellement.<br><br><a class="btn" href="mon-abonnement.html">Voir mon abonnement</a></div>`);
    A.premiumSheet(NOM);
  }
  function showError(t, titre, e, titreErreur, retry) {
    if (!vivant(t)) return;
    if (e && e.status === 402) return lockPane(titre);
    if (e && e.status === 401) { S.me = null; return gate(titre); }
    if (e && e.noInit) {
      return setPane(titre, `<div class="empty"><div class="ei">${ic('people', 'l')}</div><b>Aucune initiative rattachée</b>Ce module s’appuie sur la fiche de votre initiative. Créez-la d’abord depuis votre tableau de bord sur ordinateur.<br><br><a class="btn" href="dashboard-initiative.html">Ouvrir sur ordinateur</a></div>`);
    }
    setPane(titre, `<div class="empty"><div class="ei">${ic('close', 'l')}</div><b>${esc(titreErreur)}</b>${esc((e && e.message) || 'Une erreur est survenue.')}<br><br><button class="btn sm" id="mco-retry">Réessayer</button></div>`);
    $('#mco-retry').onclick = retry;
  }
  function erreurAction(er) {
    if (er && er.status === 402) { A.premiumSheet(NOM); return; }
    toast((er && er.message) || 'Une erreur est survenue.', true);
  }
  const ko = er => ({ erreur: er }); // une source en échec n'empêche pas l'écran de s'afficher

  /* L'initiative du compte connecté (id, nom, type, adhésions ouvertes), gardée 30 s. */
  const C = { init: null, at: 0, uid: null };
  async function chargerInit(force) {
    if (!force && C.init && C.uid === S.me.id && Date.now() - C.at < 30000) return C.init;
    const r = await api('/api/mon-initiative');
    if (!r.initiative) { const er = new Error('Aucune initiative n’est rattachée à ce compte.'); er.noInit = true; throw er; }
    C.init = r.initiative; C.at = Date.now(); C.uid = S.me.id;
    return C.init;
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
  window.MMods.cotisations = function (b, c) {
    const t = ++rendu; css();
    if (!b) return accueil(t);
    if (b === 'formules') return c === 'nouvelle' ? formNouvelle(t) : formules(t);
    if (b === 'adherents') return adherents(t);
    if (b === 'demandes') return demandes(t);
    location.replace('#/cotisations');
  };

  /* ============================================================
     TABLEAU DE BORD
     ============================================================ */
  async function accueil(t) {
    if (!gate(NOM)) return;
    setPane(NOM, SK);
    let init, stats, mem, dem, fo;
    try {
      init = await chargerInit(true);
      [stats, mem, dem, fo] = await Promise.all([
        api(`/api/initiatives/${Number(init.id)}/adhesion-stats`).catch(ko),
        api(`/api/initiatives/${Number(init.id)}/adhesion-membres`).catch(ko),
        api(`/api/initiatives/${Number(init.id)}/adhesion-demandes`).catch(ko),
        api(`/api/initiatives/${Number(init.id)}/adhesion-formules/gestion`).catch(ko)
      ]);
    } catch (e) { return showError(t, NOM, e, 'Impossible de charger vos adhésions', () => accueil(++rendu)); }
    if (!vivant(t)) return;
    const l402 = [stats, mem, dem, fo].find(x => x.erreur && x.erreur.status === 402);
    if (l402) return lockPane(NOM);

    const membres = mem.erreur ? null : (mem.membres || []);
    const compte = k => membres ? membres.filter(m => m.statut === k).length : null;
    const formules = fo.erreur ? null : (fo.formules || []);
    const actives = formules ? formules.filter(f => Number(f.actif)).length : null;
    const attente = dem.erreur ? null : (dem.demandes || []).filter(d => d.statut === 'en_attente').length;
    const v = x => x == null ? '–' : x;
    const op = ouvertes(init);
    const cell = (val, lib) => `<div class="mco-stat"><b>${val}</b><span>${lib}</span></div>`;
    const ligne = (href, icone, titre, detail, extra) => `<a class="li" href="${href}"><span class="ic">${ic(icone)}</span><span class="sp"><span class="t">${titre}</span> ${extra || ''}<br><span class="d">${detail}</span></span><span class="ch">${ic('chev', 's')}</span></a>`;

    const html = `<div class="card"><div class="pad">
        <div class="small muted" style="margin-bottom:2px">Adhésions de</div>
        <h2 style="margin:0 0 10px;font-size:20px;line-height:1.25;word-break:break-word">${esc(init.nom)}</h2>
        <div class="row"><div class="sp"><div style="font-weight:700" id="mco-op-t">${op ? 'Adhésions ouvertes' : 'Adhésions fermées'}</div>
          <div class="small muted" id="mco-op-d">${op ? 'Le bouton « Adhérer » est visible partout sur Diaspo’Actif.' : 'Le bouton « Adhérer » est masqué ; aucune nouvelle adhésion possible.'}</div></div>
          <button class="mco-sw" id="mco-sw" role="switch" aria-checked="${op}" aria-label="Adhésions ouvertes"><i></i></button></div>
      </div></div>
      ${!estAsso(init) ? `<div class="mco-note"><b>Structure de type « ${esc(init.type || 'non précisé')} »</b>Le bouton public « Adhérer » et les demandes d’adhésion simples sont réservés aux associations et ONG. Vos formules restent utilisables en partageant leur lien.</div>` : ''}
      ${actives === 0 ? `<div class="mco-note mco-warn"><b>Aucune formule active</b>Créez ou activez une formule pour que les personnes puissent adhérer.</div>` : ''}
      <div class="mco-stats">
        ${cell(stats.erreur ? v(membres && membres.length) : stats.adherents, (stats.erreur ? membres && membres.length : stats.adherents) > 1 ? 'adhérents' : 'adhérent')}
        ${cell(stats.erreur ? v(compte('a_jour')) : stats.a_jour, 'à jour')}
        ${cell(v(compte('en_attente')), 'en attente')}
        ${cell(stats.erreur ? v(compte('non_a_jour')) : stats.en_retard, 'non à jour')}
        ${cell(stats.erreur ? '–' : eur(stats.montant_collecte), 'cotisations encaissées')}
        ${cell(stats.erreur ? '–' : eur(stats.paiements_attendus), 'à encaisser')}
      </div>
      ${stats.erreur ? '<p class="small muted" style="margin:-4px 4px 12px">Certains chiffres sont momentanément indisponibles.</p>' : ''}
      <div class="card"><div class="pad"><div class="row" style="margin-bottom:8px"><b class="sp">Évolution</b>
        <div class="chips" style="padding:0;margin:0" id="mco-per">${[[7, '7 j'], [30, '30 j'], [90, '3 mois'], [365, '1 an']].map(([j, l]) => `<button class="chip ${j === 30 ? 'on' : ''}" data-j="${j}" style="min-height:36px;padding:6px 12px">${l}</button>`).join('')}</div></div>
        <div id="mco-evo" class="small muted">Chargement…</div></div></div>
      <div class="h2">GÉRER</div>
      <div class="lst">
        ${ligne('#/cotisations/demandes', 'check', 'Demandes d’adhésion', attente == null ? 'Momentanément indisponible' : attente ? pl(attente, 'demande à traiter', 'demandes à traiter') : 'Aucune demande en attente', attente ? `<span class="badge o">${attente}</span>` : '')}
        ${ligne('#/cotisations/adherents', 'people', 'Adhérents', membres ? (membres.length ? pl(membres.length, 'adhérent enregistré', 'adhérents enregistrés') : 'Aucun adhérent pour le moment') : 'Momentanément indisponible')}
        ${ligne('#/cotisations/formules', 'card', 'Formules d’adhésion', formules ? (formules.length ? pl(actives, 'formule active', 'formules actives') + ' sur ' + formules.length : 'Aucune formule : créez la première') : 'Momentanément indisponible')}
        <button class="li" id="mco-share"><span class="ic">${ic('share')}</span><span class="sp"><span class="t">Partager le lien d’adhésion</span><br><span class="d">Envoyer le lien par message ou le copier</span></span><span class="ch">${ic('chev', 's')}</span></button>
      </div>
      <div class="mco-note" style="margin-top:14px"><b>À faire sur ordinateur</b>Ces opérations demandent un grand écran :<ul><li>enregistrer un paiement reçu, suspendre ou radier un adhérent</li><li>importer ou exporter les adhérents, ajouter un adhérent à la main</li><li>délais de relance, modèles de reçu et de message</li><li>campagnes d’adhésion, journal d’audit, modification complète d’une formule</li></ul><a href="dashboard-initiative.html#adhesions-init" style="text-decoration:underline;font-weight:700;display:inline-block;margin-top:6px">Ouvrir sur ordinateur</a></div>
      <p class="small muted" style="margin:0 4px">Un reçu de paiement est fourni pour chaque adhésion ; Diaspo’Actif ne délivre pas de reçu fiscal officiel.</p>`;
    paint(t, NOM, html, `<button class="btn block" id="mco-share-foot">${ic('share', 's')} Partager le lien d’adhésion</button>`);

    const sw = $('#mco-sw'); if (sw) sw.onclick = () => basculer(init, sw);
    const share = () => partager(lienAdhesion(init), 'Adhérer à ' + init.nom);
    const s1 = $('#mco-share'); if (s1) s1.onclick = share;
    const s2 = $('#mco-share-foot'); if (s2) s2.onclick = share;
    $$('#mco-per .chip').forEach(b => b.onclick = () => { $$('#mco-per .chip').forEach(x => x.classList.toggle('on', x === b)); evolution(t, init, Number(b.dataset.j)); });
    evolution(t, init, 30);
  }

  /* Interrupteur « adhésions ouvertes » : le serveur masque ou rend le bouton « Adhérer » partout. */
  async function basculer(init, sw) {
    const cible = sw.getAttribute('aria-checked') !== 'true';
    if (!cible && !confirm('Fermer les adhésions ?\n\nLe bouton « Adhérer » disparaît partout sur Diaspo’Actif et personne ne peut plus adhérer. Les membres actuels gardent leur adhésion.')) return;
    sw.disabled = true;
    try {
      await api(`/api/initiatives/${Number(init.id)}/adhesions-ouvertes`, { method: 'PUT', body: { ouvertes: cible } });
      init.adhesions_ouvertes = cible ? 1 : 0; C.at = 0;
      toast(cible ? 'Adhésions ouvertes ✓' : 'Adhésions fermées');
      accueil(++rendu);
    } catch (er) { sw.disabled = false; erreurAction(er); }
  }

  /* Série quotidienne → totaux sur la période (nouveaux adhérents, montants encaissés). */
  let evoTok = 0;
  async function evolution(t, init, jours) {
    const box = $('#mco-evo'); if (!box) return;
    const tok = ++evoTok; box.textContent = 'Chargement…';
    try {
      const r = await api(`/api/initiatives/${Number(init.id)}/adhesion-evolution?periode=${jours}`);
      if (!vivant(t) || tok !== evoTok) return;
      const ev = r.evolution || [];
      const nouveaux = ev.reduce((n, x) => n + (Number(x.nouveaux) || 0), 0), montant = ev.reduce((n, x) => n + (Number(x.montant) || 0), 0);
      const b = $('#mco-evo'); if (!b) return;
      b.className = ''; b.innerHTML = `<div class="row"><div class="sp"><b style="font-size:20px">${nouveaux}</b><div class="small muted">${nouveaux > 1 ? 'nouveaux adhérents' : 'nouvel adhérent'}</div></div><div class="sp"><b style="font-size:20px">${esc(eur(montant))}</b><div class="small muted">encaissés</div></div></div>`;
    } catch (er) {
      const b = $('#mco-evo'); if (!b || tok !== evoTok) return;
      b.textContent = er && er.status === 402 ? 'Disponible avec un abonnement Premium actif.' : 'Évolution momentanément indisponible.';
    }
  }

  /* ============================================================
     FORMULES
     ============================================================ */
  async function formules(t) {
    if (!gate(NOM)) return;
    setPane('Formules d’adhésion', SK);
    let init, r;
    try { init = await chargerInit(); r = await api(`/api/initiatives/${Number(init.id)}/adhesion-formules/gestion`); }
    catch (e) { return showError(t, 'Formules d’adhésion', e, 'Impossible de charger les formules', () => formules(++rendu)); }
    if (!vivant(t)) return;
    const l = r.formules || [];
    const foot = `<a class="btn block" href="#/cotisations/formules/nouvelle">${ic('plus', 's')} Créer une formule</a>`;
    if (!l.length) return paint(t, 'Formules d’adhésion', `<div class="empty"><div class="ei">${ic('card', 'l')}</div><b>Aucune formule pour le moment</b>Une formule décrit ce que paient vos adhérents (montant, durée). Créez la première pour pouvoir partager votre lien d’adhésion.</div>`, foot);
    const carte = f => {
      const on = !!Number(f.actif), nb = Number(f.nb_adherents_actifs) || 0;
      const places = f.max_adherents ? (Number(f.places_restantes) <= 0 ? '<span class="badge r">Complet</span>' : `<span class="badge">${esc(pl(Number(f.places_restantes), 'place restante', 'places restantes'))}</span>`) : '';
      return `<div class="card mco-fcard"><div class="pad">
        <div class="row" style="align-items:flex-start"><div class="sp"><div style="font-weight:700;font-size:16px;line-height:1.25;word-break:break-word">${esc(f.nom)}</div>
          <div class="small muted">${esc(TYPE_LIB[f.type_contribution] || f.type_contribution || '')}</div></div>
          <button class="mco-sw" data-id="${Number(f.id)}" role="switch" aria-checked="${on}" aria-label="Formule ${esc(f.nom)} active"><i></i></button></div>
        <div style="font-weight:700;margin:8px 0 2px">${esc(montantLib(f))}</div>
        ${f.description ? `<div class="small muted" style="white-space:pre-line;word-break:break-word">${esc(A.strip(f.description).slice(0, 200))}</div>` : ''}
        <div class="tags"><span class="badge ${on ? 'g' : ''}">${on ? 'Active' : 'Désactivée'}</span>${Number(f.est_officielle) ? '<span class="badge o">Adhésion officielle</span>' : ''}<span class="badge">${esc(pl(nb, 'adhérent', 'adhérents'))}</span>${places}</div>
        ${on ? `<button class="btn out sm" data-share="${Number(f.id)}" style="margin-top:12px">${ic('share', 's')} Partager cette formule</button>` : '<p class="small muted" style="margin:10px 0 0">Désactivée : elle n’est plus proposée et son lien ne fonctionne plus pour adhérer.</p>'}
      </div></div>`;
    };
    paint(t, 'Formules d’adhésion', `${l.map(carte).join('')}
      <div class="mco-note"><b>Modifier une formule</b>Durée, calendrier fixe, informations demandées, photo ou vidéo, duplication et suppression se font sur ordinateur.<br><a href="dashboard-initiative.html#adhesions-init" style="text-decoration:underline;font-weight:700">Ouvrir sur ordinateur</a></div>`, foot);
    $$('.mco-sw[data-id]').forEach(b => b.onclick = () => basculerFormule(t, b, l.find(f => Number(f.id) === Number(b.dataset.id))));
    $$('[data-share]').forEach(b => b.onclick = () => { const f = l.find(x => Number(x.id) === Number(b.dataset.share)); if (f) partager(lienAdhesion(init, f.id), 'Adhésion — ' + f.nom); });
  }
  async function basculerFormule(t, sw, f) {
    if (!f) return;
    const cible = sw.getAttribute('aria-checked') !== 'true';
    if (!cible && !confirm('Désactiver « ' + f.nom + ' » ?\n\nElle ne sera plus proposée aux nouveaux adhérents. Les adhérents existants ne sont pas touchés.')) return;
    sw.disabled = true;
    try {
      await api(`/api/adhesion-formules/${Number(f.id)}/toggle-actif`, { method: 'PUT', body: { actif: cible } });
      toast(cible ? 'Formule activée ✓' : 'Formule désactivée');
      formules(++rendu);
    } catch (er) { sw.disabled = false; erreurAction(er); }
  }

  /* ---------- création simple d'une formule ---------- */
  const opt = (name, val, titre, aide, on) => `<label class="mco-opt ${on ? 'on' : ''}"><input type="radio" name="${name}" value="${val}" ${on ? 'checked' : ''}><span><b>${titre}</b><small>${aide}</small></span></label>`;
  async function formNouvelle(t) {
    const titre = 'Nouvelle formule';
    if (!gate(titre)) return;
    let init;
    try { init = await chargerInit(); } catch (e) { return showError(t, titre, e, 'Impossible de charger votre initiative', () => formNouvelle(++rendu)); }
    if (!vivant(t)) return;
    const html = `<form id="mco-form" class="mco-f" novalidate autocomplete="off">
      <div class="mco-gerr" id="mco-gerr" role="alert"></div>
      <label class="mco-l" for="mco-nom">Nom de la formule *</label>
      <input type="text" id="mco-nom" maxlength="120" placeholder="Ex. : Adhésion membre actif" aria-describedby="mco-e-nom"><div class="mco-err" id="mco-e-nom" role="alert"></div>
      <label class="mco-l" for="mco-desc">Description <small>(facultative)</small></label>
      <textarea id="mco-desc" placeholder="Ce que comprend cette adhésion…"></textarea>
      <label class="mco-l" for="mco-type">Type</label>
      <select id="mco-type">${TYPES.map(([v, l]) => `<option value="${v}" ${v === 'cotisation_annuelle' ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <p class="mco-hint">La durée de validité suit le type choisi (une cotisation annuelle dure 12 mois). Pour une durée personnalisée ou un calendrier fixe, utilisez l’ordinateur.</p>
      <div class="h2">MONTANT</div>
      ${opt('mco-mt', 'fixe', 'Montant fixe', 'Chaque adhérent paie le même montant.', true)}
      ${opt('mco-mt', 'libre', 'Montant libre', 'L’adhérent choisit ce qu’il donne.', false)}
      ${opt('mco-mt', 'minimum', 'Montant minimum', 'L’adhérent paie au moins un minimum.', false)}
      <div id="mco-b-fixe"><label class="mco-l" for="mco-fixe">Montant (€) *</label>
        <input type="number" id="mco-fixe" min="0" step="0.01" inputmode="decimal" placeholder="Ex. : 30" aria-describedby="mco-e-fixe"><div class="mco-err" id="mco-e-fixe" role="alert"></div>
        <p class="mco-hint">Indiquez 0 pour une adhésion gratuite.</p></div>
      <div id="mco-b-libre" hidden><label class="mco-l" for="mco-max">Montant maximum (€) <small>(facultatif)</small></label>
        <input type="number" id="mco-max" min="1" step="0.01" inputmode="decimal" aria-describedby="mco-e-max"><div class="mco-err" id="mco-e-max" role="alert"></div></div>
      <div id="mco-b-min" hidden><label class="mco-l" for="mco-min">Montant minimum (€) *</label>
        <input type="number" id="mco-min" min="1" step="0.01" inputmode="decimal" aria-describedby="mco-e-min"><div class="mco-err" id="mco-e-min" role="alert"></div></div>
      <div class="h2">PAIEMENT</div>
      ${MODES.map(([v, l], i) => `<label class="mco-opt ${i === 0 ? 'on' : ''}"><input type="checkbox" name="mco-mode" value="${v}" ${i === 0 ? 'checked' : ''}><span><b>${l}</b></span></label>`).join('')}
      <div class="mco-err" id="mco-e-modes" role="alert"></div>
      <label class="mco-l" for="mco-places">Nombre de places <small>(vide = illimité)</small></label>
      <input type="number" id="mco-places" min="1" step="1" inputmode="numeric" placeholder="Illimitées" aria-describedby="mco-e-places"><div class="mco-err" id="mco-e-places" role="alert"></div>
      <div class="h2">ADHÉSION OFFICIELLE</div>
      <label class="mco-opt"><input type="checkbox" id="mco-off"><span><b>Formule officielle de ${esc(init.nom)}</b><small>Le bouton public « Adhérer » mène directement à cette formule. Une seule formule peut l’être : choisir celle-ci retire ce statut à l’ancienne.</small></span></label>
    </form>`;
    setPane(titre, html, `<button class="btn block" id="mco-save">Créer la formule</button>`);

    const form = $('#mco-form'); form.onsubmit = ev => ev.preventDefault();
    $$('.mco-opt input', form).forEach(r => r.addEventListener('change', () => {
      $$(`.mco-opt input[name="${r.name}"]`, form).forEach(x => x.closest('.mco-opt').classList.toggle('on', x.checked));
      if (r.type === 'checkbox') r.closest('.mco-opt').classList.toggle('on', r.checked);
      majMontant(); }));
    const mt = () => { const c = $('input[name="mco-mt"]:checked', form); return c ? c.value : 'fixe'; };
    function majMontant() { const m = mt(); $('#mco-b-fixe').hidden = m !== 'fixe'; $('#mco-b-libre').hidden = m !== 'libre'; $('#mco-b-min').hidden = m !== 'minimum'; }
    majMontant();

    const val = id => { const x = $('#' + id); return x ? x.value.trim() : ''; };
    const err = (id, msg) => { const x = $('#mco-' + id), m = $('#mco-e-' + id); if (x) x.setAttribute('aria-invalid', 'true'); if (m) m.textContent = msg; return x; };
    function valider() {
      $$('#mco-form [aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
      $$('#mco-form .mco-err').forEach(x => { x.textContent = ''; }); $('#mco-gerr').textContent = '';
      let first = null; const bad = (id, msg) => { const x = err(id, msg); if (!first) first = x; };
      const m = mt();
      if (!val('mco-nom')) bad('nom', 'Donnez un nom à la formule.');
      if (m === 'fixe' && (val('mco-fixe') === '' || isNaN(Number(val('mco-fixe'))) || Number(val('mco-fixe')) < 0)) bad('fixe', 'Indiquez le montant (0 pour une adhésion gratuite).');
      if (m === 'minimum' && (!(Number(val('mco-min')) > 0))) bad('min', 'Indiquez le montant minimum.');
      if (m === 'libre' && val('mco-max') !== '' && !(Number(val('mco-max')) > 0)) bad('max', 'Le montant maximum doit être supérieur à 0, ou laissé vide.');
      if (val('mco-places') !== '' && (!/^\d+$/.test(val('mco-places')) || Number(val('mco-places')) < 1)) bad('places', 'Indiquez un nombre entier de places (1 ou plus), ou laissez vide.');
      if (!$$('input[name="mco-mode"]:checked', form).length && $$('input[name="mco-mode"]', form).length) { const mm = $('#mco-e-modes'); if (mm) mm.textContent = 'Choisissez au moins un moyen de paiement.'; if (!first) first = mm; }
      if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (first.focus) first.focus(); $('#mco-gerr').textContent = 'Certains champs sont à corriger.'; return false; }
      return true;
    }
    $('#mco-save').onclick = async ev => {
      if (!valider()) return;
      const btn = ev.currentTarget, m = mt();
      const modes = $$('input[name="mco-mode"]:checked', form).map(x => x.value);
      const body = { nom: val('mco-nom'), description: val('mco-desc') || null, type_contribution: val('mco-type') || 'cotisation_annuelle', montant_type: m, modes_paiement: modes.length ? modes : ['carte'], max_adherents: val('mco-places') ? Number(val('mco-places')) : null, est_officielle: !!($('#mco-off') && $('#mco-off').checked) };
      if (m === 'fixe') body.montant_fixe = Number(val('mco-fixe'));
      if (m === 'minimum') body.montant_min = Number(val('mco-min'));
      if (m === 'libre' && val('mco-max')) body.montant_max = Number(val('mco-max'));
      $$('#pane-foot button').forEach(b => { b.disabled = true; }); const txt = btn.textContent; btn.textContent = 'Création…';
      try {
        await api(`/api/initiatives/${Number(init.id)}/adhesion-formules`, { method: 'POST', body });
        toast('Formule créée ✓'); location.replace('#/cotisations/formules');
      } catch (er) {
        $$('#pane-foot button').forEach(b => { b.disabled = false; }); btn.textContent = txt;
        if (er && er.status === 402) { A.premiumSheet(NOM); return; }
        const g = $('#mco-gerr'); if (g) { g.textContent = (er && er.message) || 'Création impossible.'; g.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        toast((er && er.message) || 'Création impossible.', true);
      }
    };
  }

  /* ============================================================
     ADHÉRENTS
     ============================================================ */
  const AD = { rows: [], formules: {}, init: null, f: '', q: '', shown: 40 };

  async function adherents(t) {
    if (!gate(NOM)) return;
    setPane('Adhérents', SK);
    let init, m, fo;
    try {
      init = await chargerInit();
      [m, fo] = await Promise.all([api(`/api/initiatives/${Number(init.id)}/adhesion-membres`), api(`/api/initiatives/${Number(init.id)}/adhesion-formules/gestion`).catch(ko)]);
    } catch (e) { return showError(t, 'Adhérents', e, 'Impossible de charger les adhérents', () => adherents(++rendu)); }
    if (!vivant(t)) return;
    AD.init = init; AD.rows = m.membres || []; AD.f = ''; AD.q = ''; AD.shown = 40;
    AD.formules = {}; (fo.erreur ? [] : fo.formules || []).forEach(f => { AD.formules[Number(f.id)] = f; });
    if (!AD.rows.length) {
      paint(t, 'Adhérents', `<div class="empty"><div class="ei">${ic('people', 'l')}</div><b>Aucun adhérent pour le moment</b>Partagez votre lien d’adhésion : les adhérents apparaîtront ici dès leur inscription. Vous pouvez aussi en ajouter à la main sur ordinateur.<br><br><button class="btn" id="mco-share2">${ic('share', 's')} Partager le lien d’adhésion</button></div>`);
      const sh = $('#mco-share2'); if (sh) sh.onclick = () => partager(lienAdhesion(init), 'Adhérer à ' + init.nom);
      return;
    }
    paint(t, 'Adhérents', `<div id="mco-atop"></div><div id="mco-alist"></div>`);
    paintAdherents();
  }
  function compteStatuts() {
    const c = { '': AD.rows.length };
    AD.rows.forEach(r => { c[r.statut] = (c[r.statut] || 0) + 1; });
    return c;
  }
  function paintAdherents() {
    const top = $('#mco-atop'); if (!top) return;
    const c = compteStatuts();
    const tabs = [['', 'Tous'], ['a_jour', 'À jour'], ['en_attente', 'En attente'], ['non_a_jour', 'Non à jour'], ['suspendu', 'Suspendus'], ['radie', 'Radiés']].filter(([k]) => k === '' || c[k]);
    top.innerHTML = `<div class="search">${ic('search', 's')}<input id="mco-q" type="search" placeholder="Nom, e-mail, téléphone, n° d’adhérent…" aria-label="Rechercher un adhérent" value="${esc(AD.q)}"></div>
      <div class="chips" role="tablist">${tabs.map(([k, l]) => `<button class="chip ${AD.f === k ? 'on' : ''}" role="tab" aria-selected="${AD.f === k}" data-k="${k}">${l} <span class="n">${c[k] || 0}</span></button>`).join('')}</div>`;
    $$('.chip', top).forEach(b => b.onclick = () => { AD.f = b.dataset.k; AD.shown = 40; paintAdherents(); });
    const q = $('#mco-q');
    if (q) { let tm; q.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { AD.q = q.value.trim(); AD.shown = 40; paintListeAd(); }, 200); }; }
    paintListeAd();
  }
  function paintListeAd() {
    const box = $('#mco-alist'); if (!box) return;
    const q = AD.q.toLowerCase(), id = Number(AD.init.id);
    const l = AD.rows.filter(r => (!AD.f || r.statut === AD.f) && (!q || [r.nom, r.prenom, r.email, r.telephone, `adh-${id}-${r.id}`].join(' ').toLowerCase().includes(q)));
    if (!l.length) { box.innerHTML = `<div class="empty"><b>Aucun résultat</b>Essayez un autre nom ou un autre filtre.</div>`; return; }
    box.innerHTML = `<div class="lst">${l.slice(0, AD.shown).map(r => {
      const nm = [r.prenom, r.nom].filter(Boolean).join(' ') || 'Adhérent', st = STATUTS[r.statut] || [r.statut, ''];
      const f = AD.formules[Number(r.formule_id)];
      return `<button class="li" data-id="${Number(r.id)}"><div class="av">${esc(A.initials(nm))}</div><span class="sp"><span class="t ell" style="display:block">${esc(nm)}</span><span class="d ell" style="display:block">${esc(f ? f.nom : 'Formule supprimée')}${r.date_expiration ? ' · jusqu’au ' + esc(dateCourte(r.date_expiration)) : ''}</span></span><span class="badge ${st[1]}">${esc(st[0])}</span></button>`;
    }).join('')}</div>${l.length > AD.shown ? `<button class="btn out block" id="mco-amore" style="margin-top:10px">Voir plus (${l.length - AD.shown})</button>` : ''}`;
    $$('#mco-alist .li').forEach(b => b.onclick = () => fiche(AD.rows.find(r => Number(r.id) === Number(b.dataset.id))));
    const mo = $('#mco-amore'); if (mo) mo.onclick = () => { AD.shown += 40; paintListeAd(); };
  }
  function fiche(r) {
    if (!r) return;
    const nm = [r.prenom, r.nom].filter(Boolean).join(' ') || 'Adhérent', st = STATUTS[r.statut] || [r.statut, ''], f = AD.formules[Number(r.formule_id)];
    const tel = r.telephone ? String(r.telephone).replace(/[^\d+]/g, '') : '';
    const badges = (Array.isArray(r.badges_json) ? r.badges_json : []).map(b => BADGES[b] || b);
    const lieu = [r.ville, r.pays].filter(Boolean).join(', ');
    const kv = (k, v) => v ? `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>` : '';
    const close = A.openSheet(`<div class="row" style="margin-bottom:10px"><div class="av big">${r.photo_url ? `<img src="${A.attrUrl(r.photo_url)}" alt="" onerror="this.remove()">` : esc(A.initials(nm))}</div><div class="sp"><div style="font-weight:700;font-size:18px;line-height:1.25;word-break:break-word">${esc(nm)}</div><div class="tags" style="margin:4px 0 0"><span class="badge ${st[1]}">${esc(st[0])}</span>${r.linked_user_id ? '<span class="badge g">Compte Diaspo’Actif</span>' : '<span class="badge">Sans compte</span>'}</div></div></div>
      ${r.email || tel ? `<div class="mco-contact">${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : ''}${tel ? `<a href="tel:${esc(tel)}">${esc(r.telephone)}</a>` : ''}</div>` : '<p class="small muted" style="margin:0">Aucune coordonnée enregistrée.</p>'}
      <div style="margin-top:8px">${kv('Numéro d’adhérent', 'ADH-' + Number(AD.init.id) + '-' + Number(r.id))}${kv('Formule', f ? f.nom : '')}${kv('Adhésion depuis le', dateCourte(r.date_adhesion))}${kv('Valable jusqu’au', dateCourte(r.date_expiration))}${kv('Montant payé', r.montant_paye ? eur(r.montant_paye, f && f.devise) : '')}${kv('Mode de paiement', r.mode_paiement ? ({ carte: 'Carte bancaire', paypal: 'PayPal', virement: 'Virement' }[r.mode_paiement] || r.mode_paiement) : '')}${kv('Ville', lieu)}${kv('Distinctions', badges.join(', '))}${kv('Observations', r.observations ? A.strip(r.observations) : '')}</div>
      ${r.linked_user_id ? `<a class="btn out block" style="margin-top:12px" href="profil.html?id=${Number(r.linked_user_id)}">Voir son profil ${ic('out', 's')}</a>` : ''}
      <p class="small muted" style="margin:12px 2px 10px">Enregistrer un paiement, suspendre ou radier : à faire sur ordinateur.</p>
      <button class="btn out block" id="mco-fc">Fermer</button>`);
    const c = $('#mco-fc'); if (c) c.onclick = close;
  }

  /* ============================================================
     DEMANDES D'ADHÉSION (demande simple, sans paiement)
     ============================================================ */
  async function demandes(t) {
    if (!gate(NOM)) return;
    setPane('Demandes d’adhésion', SK);
    let init, r;
    try { init = await chargerInit(); r = await api(`/api/initiatives/${Number(init.id)}/adhesion-demandes`); }
    catch (e) { return showError(t, 'Demandes d’adhésion', e, 'Impossible de charger les demandes', () => demandes(++rendu)); }
    if (!vivant(t)) return;
    const tous = r.demandes || [];
    const att = tous.filter(d => d.statut === 'en_attente'), fait = tous.filter(d => d.statut !== 'en_attente');
    const nomD = d => [d.prenom, d.nom].filter(Boolean).join(' ') || 'Membre';
    const carte = (d, actions) => `<div class="card pad"><div class="row"><div class="av">${d.photo_url ? `<img src="${A.attrUrl(d.photo_url)}" alt="" onerror="this.remove()">` : esc(A.initials(nomD(d)))}</div><div class="sp"><div style="font-weight:700;word-break:break-word">${esc(nomD(d))}</div>
        <div class="small muted">${esc([d.ville, d.pays].filter(Boolean).join(', '))}${d.created_at ? (d.ville || d.pays ? ' · ' : '') + esc(depuis('demande', d.created_at)) : ''}</div></div>${actions ? '' : `<span class="badge ${d.statut === 'acceptee' ? 'g' : 'r'}">${d.statut === 'acceptee' ? 'Acceptée' : 'Refusée'}</span>`}</div>
        ${d.email ? `<div class="mco-contact"><a href="mailto:${esc(d.email)}">${esc(d.email)}</a></div>` : ''}
        ${actions ? `<div class="row" style="margin-top:10px"><button class="btn out sm sp" data-no="${Number(d.id)}">Refuser</button><button class="btn sm sp" data-ok="${Number(d.id)}">Accepter</button></div>` : ''}
        <a class="small" href="profil.html?id=${Number(d.user_id)}" style="display:inline-block;margin-top:8px;text-decoration:underline;color:var(--navy2);font-weight:600">Voir le profil</a></div>`;
    const html = `${att.length ? att.map(d => carte(d, true)).join('') : `<div class="empty"><div class="ei">${ic('check', 'l')}</div><b>Aucune demande en attente</b>${estAsso(init) ? 'Les demandes d’adhésion simples de vos visiteurs apparaîtront ici.' : 'Les demandes simples d’adhésion ne concernent que les associations et ONG.'}</div>`}
      ${fait.length ? `<div class="h2">DÉJÀ TRAITÉES</div>${fait.map(d => carte(d, false)).join('')}` : ''}`;
    paint(t, 'Demandes d’adhésion', html);
    $$('[data-ok]').forEach(b => b.onclick = () => traiter(b, 'acceptee'));
    $$('[data-no]').forEach(b => b.onclick = () => traiter(b, 'refusee'));
  }
  async function traiter(btn, statut) {
    const id = Number(btn.dataset.ok || btn.dataset.no);
    if (statut === 'refusee' && !confirm('Refuser cette demande d’adhésion ?\n\nLa personne en sera prévenue ; elle pourra redéposer une demande.')) return;
    $$('[data-ok],[data-no]', btn.parentNode).forEach(b => { b.disabled = true; });
    try {
      await api(`/api/adhesion-demandes/${id}`, { method: 'PATCH', body: { statut } });
      toast(statut === 'acceptee' ? 'Demande acceptée ✓' : 'Demande refusée');
      demandes(++rendu);
    } catch (er) { $$('[data-ok],[data-no]', btn.parentNode).forEach(b => { b.disabled = false; }); erreurAction(er); }
  }
})();
