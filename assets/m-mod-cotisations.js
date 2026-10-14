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
.mco-warn-t{color:var(--orange-d)}
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
.mco-acts{display:grid;gap:8px}
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
    if (b === 'modifier' && /^\d+$/.test(c || '')) return formNouvelle(t, Number(c));
    if (b === 'nouvel-adherent') return formAdherent(t);
    if (b === 'adherents') return adherents(t, c === 'attente' ? 'en_attente' : '');
    if (b === 'demandes') return demandes(t);
    location.replace('#/cotisations');
  };

  /* ============================================================
     TABLEAU DE BORD
     ============================================================ */
  async function accueil(t) {
    if (!gate(NOM)) return;
    setPane(NOM, SK);
    let init, stats, mem, dem, fo, gra;
    try {
      init = await chargerInit(true);
      [stats, mem, dem, fo, gra] = await Promise.all([
        api(`/api/initiatives/${Number(init.id)}/adhesion-stats`).catch(ko),
        api(`/api/initiatives/${Number(init.id)}/adhesion-membres`).catch(ko),
        api(`/api/initiatives/${Number(init.id)}/adhesion-demandes`).catch(ko),
        api(`/api/initiatives/${Number(init.id)}/adhesion-formules/gestion`).catch(ko),
        api(`/api/initiatives/${Number(init.id)}/adhesion-gratuite-auto`).catch(ko)
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
      ${carteGratuite(gra, op)}
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
        ${compte('en_attente') ? ligne('#/cotisations/adherents/attente', 'check', 'Adhérents en attente', 'À accepter ou à encaisser', `<span class="badge o">${compte('en_attente')}</span>`) : ''}
        ${ligne('#/cotisations/adherents', 'people', 'Adhérents', membres ? (membres.length ? pl(membres.length, 'adhérent enregistré', 'adhérents enregistrés') : 'Aucun adhérent pour le moment') : 'Momentanément indisponible')}
        ${ligne('#/cotisations/formules', 'card', 'Formules d’adhésion', formules ? (formules.length ? pl(actives, 'formule active', 'formules actives') + ' sur ' + formules.length : 'Aucune formule : créez la première') : 'Momentanément indisponible')}
        <button class="li" id="mco-share"><span class="ic">${ic('share')}</span><span class="sp"><span class="t">Partager le lien d’adhésion</span><br><span class="d">Envoyer le lien par message ou le copier</span></span><span class="ch">${ic('chev', 's')}</span></button>
      </div>
      <div class="mco-note" style="margin-top:14px"><b>À faire sur ordinateur</b>Ces opérations demandent un grand écran :<ul><li>importer une liste d’adhérents (Excel, Google Sheets) ou exporter le registre</li><li>délais de relance, modèles de reçu et de message</li><li>campagnes d’adhésion, journal d’audit, réglages avancés d’une formule</li></ul><a href="dashboard-initiative.html#adhesions-init" style="text-decoration:underline;font-weight:700;display:inline-block;margin-top:6px">Ouvrir sur ordinateur</a></div>
      <p class="small muted" style="margin:0 4px">Un reçu de paiement est fourni pour chaque adhésion ; Diaspo’Actif ne délivre pas de reçu fiscal officiel.</p>`;
    paint(t, NOM, html, `<button class="btn block" id="mco-share-foot">${ic('share', 's')} Partager le lien d’adhésion</button>`);

    const sw = $('#mco-sw'); if (sw) sw.onclick = () => basculer(init, sw);
    const swg = $('#mco-gr'); if (swg) swg.onclick = () => basculerGratuite(init, swg);
    const share = () => partager(lienAdhesion(init), 'Adhérer à ' + init.nom);
    const s1 = $('#mco-share'); if (s1) s1.onclick = share;
    const s2 = $('#mco-share-foot'); if (s2) s2.onclick = share;
    $$('#mco-per .chip').forEach(b => b.onclick = () => { $$('#mco-per .chip').forEach(x => x.classList.toggle('on', x === b)); evolution(t, init, Number(b.dataset.j)); });
    evolution(t, init, 30);
  }

  /* « Adhésion gratuite automatique » (2026-10-14, demande explicite : l'interrupteur existait seulement sur ordinateur) — mêmes règles et
     même route que le tableau de bord du site (PUT /api/initiatives/:id/adhesion-gratuite-auto). Associations et ONG seulement ; jamais activée
     d'office ; impossible tant que des formules d'adhésion sont actives. Activée, une adhésion gratuite de 12 mois est proposée à toute personne,
     avec ou sans compte ; l'association accepte ou refuse chaque demande. */
  function carteGratuite(g, ouvert) {
    if (!g || g.erreur || !g.type_ok) return '';
    const actif = !!g.actif, bloque = !actif && Number(g.autres_formules_actives) > 0;
    const note = (txt, cls) => `<p class="small ${cls || 'muted'}" style="margin:10px 0 0;line-height:1.45">${txt}</p>`;
    return `<div class="card" id="mco-gr-card"><div class="pad">
      <div class="row"><div class="sp"><div style="font-weight:700">🆓 Adhésion gratuite automatique</div>
        <div class="small muted" id="mco-gr-t">${actif ? 'Activée' : 'Désactivée'}</div></div>
        <button class="mco-sw" id="mco-gr" role="switch" aria-checked="${actif}" aria-label="Adhésion gratuite automatique" ${bloque ? 'disabled' : ''}><i></i></button></div>
      <p class="small muted" style="margin:8px 0 0;line-height:1.45">Si l’adhésion à votre association est gratuite, activez-la : une adhésion gratuite de 12 mois est proposée à toute personne qui souhaite adhérer, <b>avec ou sans compte Diaspo’Actif</b> (nom, prénom et e-mail suffisent). Vous acceptez ou refusez chaque demande.</p>
      ${actif ? note('✅ Activée : c’est elle que propose le bouton « Adhérer ». Pour modifier la durée, les champs ou les documents demandés, utilisez l’ordinateur.') : ''}
      ${bloque ? note('Vous avez déjà des formules d’adhésion actives : le bouton « Adhérer » propose votre adhésion officielle. L’adhésion gratuite automatique est réservée aux associations qui n’ont pas encore de formule.', 'mco-warn-t') : ''}
      ${(!actif && g.formule_id && !bloque) ? note('Désactivée : ses adhérents actuels gardent leur fiche. Vous pouvez créer de vraies formules d’adhésion.') : ''}
      ${!ouvert ? note('🔒 Vos adhésions sont fermées : personne ne peut adhérer tant qu’elles le restent (interrupteur « Adhésions ouvertes » ci-dessus).', 'mco-warn-t') : ''}
    </div></div>`;
  }
  /* Confirmation dans l'application (feuille du bas), pas la boîte de dialogue du navigateur : celle-ci est bloquée ou ignorée par certains
     navigateurs de téléphone (navigateurs intégrés aux applications, « empêcher cette page de créer des boîtes de dialogue »), et l'interrupteur
     paraissait alors ne rien faire. */
  function confirmerFeuille(titre, texte, oui) {
    return new Promise(ok => {
      let decide = false;
      const close = A.openSheet(`<h3 style="margin:0 0 8px">${titre}</h3><p class="small" style="margin:0 0 14px;line-height:1.5">${texte}</p>
        <button type="button" class="btn block" id="mco-c-oui">${oui}</button><button type="button" class="btn out block" id="mco-c-non" style="margin-top:8px">Annuler</button>`);
      const fin = v => { if (decide) return; decide = true; close(); ok(v); };
      $('#mco-c-oui').onclick = () => fin(true);
      $('#mco-c-non').onclick = () => fin(false);
    });
  }
  async function basculerGratuite(init, sw) {
    const cible = sw.getAttribute('aria-checked') !== 'true';
    const oui = await confirmerFeuille(cible ? 'Activer l’adhésion gratuite automatique ?' : 'Désactiver l’adhésion gratuite automatique ?',
      cible ? 'Une adhésion gratuite de 12 mois sera proposée à toute personne qui souhaite adhérer (avec ou sans compte Diaspo’Actif). Vous acceptez ou refusez chaque demande.'
            : 'Elle ne sera plus proposée aux nouvelles personnes. Vos adhérents actuels gardent leur fiche et leurs rappels. Vous pourrez ensuite créer de vraies formules d’adhésion.',
      cible ? 'Activer' : 'Désactiver');
    if (!oui) return;
    sw.disabled = true;
    try {
      await api(`/api/initiatives/${Number(init.id)}/adhesion-gratuite-auto`, { method: 'PUT', body: { actif: cible } });
      C.at = 0;
      toast(cible ? 'Adhésion gratuite automatique activée ✓' : 'Adhésion gratuite automatique désactivée');
      accueil(++rendu);
    } catch (er) { sw.disabled = false; erreurAction(er); }
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
          ${Number(f.est_gratuite_auto) ? '<span class="badge g">🆓 Gratuite automatique</span>' : `<button class="mco-sw" data-id="${Number(f.id)}" role="switch" aria-checked="${on}" aria-label="Formule ${esc(f.nom)} active"><i></i></button>`}</div>
        <div style="font-weight:700;margin:8px 0 2px">${esc(montantLib(f))}</div>
        ${f.description ? `<div class="small muted" style="white-space:pre-line;word-break:break-word">${esc(A.strip(f.description).slice(0, 200))}</div>` : ''}
        <div class="tags"><span class="badge ${on ? 'g' : ''}">${on ? 'Active' : 'Désactivée'}</span>${Number(f.est_officielle) ? '<span class="badge o">Adhésion officielle</span>' : ''}<span class="badge">${esc(pl(nb, 'adhérent', 'adhérents'))}</span>${places}</div>
        ${on ? `<button class="btn out sm" data-share="${Number(f.id)}" style="margin-top:12px">${ic('share', 's')} Partager cette formule</button>` : '<p class="small muted" style="margin:10px 0 0">Désactivée : elle n’est plus proposée et son lien ne fonctionne plus pour adhérer.</p>'}
        <div class="mco-2" style="margin-top:10px"><a class="btn out sm" href="#/cotisations/modifier/${Number(f.id)}">Modifier</a><button class="btn out sm" data-dup="${Number(f.id)}">Dupliquer</button></div>
        ${on && !Number(f.est_officielle) ? `<button class="btn out sm block" data-off="${Number(f.id)}" style="margin-top:8px">⭐ Définir comme adhésion officielle</button>` : ''}
        ${Number(f.est_gratuite_auto) ? '' : `<button class="btn out sm block" data-del="${Number(f.id)}" style="margin-top:8px;color:var(--red)">Supprimer</button>`}
      </div></div>`;
    };
    paint(t, 'Formules d’adhésion', `${l.map(carte).join('')}
      <div class="mco-note"><b>Réglages avancés</b>Durée personnalisée ou calendrier fixe, informations demandées aux adhérents, photo ou vidéo, délais de relance : sur ordinateur.<br><a href="dashboard-initiative.html#adhesions-init" style="text-decoration:underline;font-weight:700">Ouvrir sur ordinateur</a></div>`, foot);
    $$('.mco-sw[data-id]').forEach(b => b.onclick = () => basculerFormule(t, b, l.find(f => Number(f.id) === Number(b.dataset.id))));
    $$('[data-share]').forEach(b => b.onclick = () => { const f = l.find(x => Number(x.id) === Number(b.dataset.share)); if (f) partager(lienAdhesion(init, f.id), 'Adhésion — ' + f.nom); });
    $$('[data-dup]').forEach(b => b.onclick = () => actionFormule(b, 'dup', l));
    $$('[data-off]').forEach(b => b.onclick = () => actionFormule(b, 'off', l));
    $$('[data-del]').forEach(b => b.onclick = () => actionFormule(b, 'del', l));
  }
  /* Dupliquer (la copie est créée désactivée), définir comme adhésion officielle, supprimer. */
  async function actionFormule(btn, k, l) {
    const id = Number(btn.dataset.dup || btn.dataset.off || btn.dataset.del), f = l.find(x => Number(x.id) === id); if (!f) return;
    if (k === 'off' && !confirm('Faire de « ' + f.nom + ' » l’adhésion officielle ?\n\nLe bouton « Adhérer » de votre structure mènera directement à cette formule. L’ancienne adhésion officielle perd ce statut.')) return;
    if (k === 'del' && !confirm('Supprimer « ' + f.nom + ' » ?\n\nCette action est définitive. Une formule qui a déjà des adhérents ne peut pas être supprimée : désactivez-la plutôt.')) return;
    btn.disabled = true;
    try {
      if (k === 'dup') { await api('/api/adhesion-formules/' + id + '/dupliquer', { method: 'POST', body: {} }); toast('Formule dupliquée — la copie est désactivée'); }
      else if (k === 'off') { const r = await api('/api/adhesion-formules/' + id + '/officielle', { method: 'PUT', body: { officielle: true } }); toast(r && r.remplace ? 'Adhésion officielle remplacée ✓' : 'Adhésion officielle définie ✓'); }
      else { await api('/api/adhesion-formules/' + id, { method: 'DELETE' }); toast('Formule supprimée'); }
      C.at = 0; formules(++rendu);
    } catch (er) { btn.disabled = false; erreurAction(er); }
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
  async function formNouvelle(t, fid) {
    const titre = fid ? 'Modifier la formule' : 'Nouvelle formule';
    if (!gate(titre)) return;
    let init, f0 = null;
    if (fid) setPane(titre, SK);
    try {
      init = await chargerInit();
      if (fid) {
        f0 = ((await api(`/api/initiatives/${Number(init.id)}/adhesion-formules/gestion`)).formules || []).find(x => Number(x.id) === Number(fid));
        if (!f0) throw Object.assign(new Error('Cette formule n’existe plus.'), { status: 404 });
      }
    } catch (e) { return showError(t, titre, e, 'Impossible de charger votre initiative', () => formNouvelle(++rendu, fid)); }
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
    setPane(titre, html, `<button class="btn block" id="mco-save">${fid ? 'Enregistrer' : 'Créer la formule'}</button>`);

    const form = $('#mco-form'); form.onsubmit = ev => ev.preventDefault();
    $$('.mco-opt input', form).forEach(r => r.addEventListener('change', () => {
      $$(`.mco-opt input[name="${r.name}"]`, form).forEach(x => x.closest('.mco-opt').classList.toggle('on', x.checked));
      if (r.type === 'checkbox') r.closest('.mco-opt').classList.toggle('on', r.checked);
      majMontant(); }));
    const mt = () => { const c = $('input[name="mco-mt"]:checked', form); return c ? c.value : 'fixe'; };
    function majMontant() { const m = mt(); $('#mco-b-fixe').hidden = m !== 'fixe'; $('#mco-b-libre').hidden = m !== 'libre'; $('#mco-b-min').hidden = m !== 'minimum'; }
    majMontant();

    /* Modification : le formulaire se remplit avec la formule existante. Les réglages que ce formulaire ne montre pas
       (durée personnalisée, calendrier fixe, champs demandés, médias…) ne sont pas envoyés : le serveur les conserve. */
    const gratuiteAuto = !!(f0 && Number(f0.est_gratuite_auto));
    if (f0) {
      const set = (id, v) => { const x = $('#' + id); if (x && v != null) x.value = v; };
      set('mco-nom', f0.nom); set('mco-desc', f0.description || ''); set('mco-type', f0.type_contribution || 'cotisation_annuelle');
      const mtype = f0.montant_type || 'fixe';
      const radio = $(`input[name="mco-mt"][value="${mtype}"]`, form); if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
      set('mco-fixe', Number(f0.montant_fixe) || 0); set('mco-min', Number(f0.montant_min) || ''); set('mco-max', Number(f0.montant_max) || '');
      set('mco-places', f0.max_adherents ? Number(f0.max_adherents) : '');
      let modes = []; try { modes = JSON.parse(f0.modes_paiement_json || '[]'); } catch (e) { modes = []; }
      if (modes.length) $$('input[name="mco-mode"]', form).forEach(x => { x.checked = modes.includes(x.value); x.closest('.mco-opt').classList.toggle('on', x.checked); });
      const off = $('#mco-off'); if (off) { off.checked = !!Number(f0.est_officielle); off.closest('.mco-opt').classList.toggle('on', off.checked); }
      if (gratuiteAuto) {
        ['mco-type'].forEach(i => { const x = $('#' + i); if (x) x.disabled = true; });
        $$('input[name="mco-mt"]', form).forEach(x => { x.disabled = true; });
        const fx = $('#mco-fixe'); if (fx) fx.disabled = true;
        const note = document.createElement('div'); note.className = 'mco-note'; note.innerHTML = '<b>Adhésion gratuite automatique</b>Cette formule reste gratuite et de 12 mois par défaut : le montant et le type ne se modifient pas. Pour la fermer, utilisez l’interrupteur du tableau de bord.';
        form.insertBefore(note, form.firstChild.nextSibling);
      }
    }

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
      if (fid) {
        /* statut officiel : envoyé seulement s'il a changé (le serveur refuse de rendre officielle une formule désactivée) */
        if (!!Number(f0.est_officielle) === body.est_officielle) delete body.est_officielle;
        if (gratuiteAuto) { delete body.montant_type; delete body.montant_fixe; delete body.type_contribution; }
      }
      $$('#pane-foot button').forEach(b => { b.disabled = true; }); const txt = btn.textContent; btn.textContent = fid ? 'Enregistrement…' : 'Création…';
      try {
        if (fid) await api(`/api/adhesion-formules/${Number(fid)}`, { method: 'PUT', body });
        else await api(`/api/initiatives/${Number(init.id)}/adhesion-formules`, { method: 'POST', body });
        C.at = 0;
        toast(fid ? 'Formule modifiée ✓' : 'Formule créée ✓'); location.replace('#/cotisations/formules');
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

  async function adherents(t, filtre) {
    if (!gate(NOM)) return;
    setPane('Adhérents', SK);
    let init, m, fo;
    try {
      init = await chargerInit();
      [m, fo] = await Promise.all([api(`/api/initiatives/${Number(init.id)}/adhesion-membres`), api(`/api/initiatives/${Number(init.id)}/adhesion-formules/gestion`).catch(ko)]);
    } catch (e) { return showError(t, 'Adhérents', e, 'Impossible de charger les adhérents', () => adherents(++rendu, filtre)); }
    if (!vivant(t)) return;
    AD.init = init; AD.rows = m.membres || []; AD.f = filtre || ''; AD.q = ''; AD.shown = 40;
    AD.formules = {}; (fo.erreur ? [] : fo.formules || []).forEach(f => { AD.formules[Number(f.id)] = f; });
    if (!AD.rows.length) {
      paint(t, 'Adhérents', `<div class="empty"><div class="ei">${ic('people', 'l')}</div><b>Aucun adhérent pour le moment</b>Partagez votre lien d’adhésion : les adhérents apparaîtront ici dès leur inscription. Vous pouvez aussi ajouter un adhérent à la main.<br><br><a class="btn out" href="#/cotisations/nouvel-adherent" style="margin-right:8px">Ajouter un adhérent</a><button class="btn" id="mco-share2">${ic('share', 's')} Partager le lien d’adhésion</button></div>`);
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
    top.innerHTML = `<a class="btn out sm block" href="#/cotisations/nouvel-adherent" style="margin-bottom:10px">➕ Ajouter un adhérent</a><div class="search">${ic('search', 's')}<input id="mco-q" type="search" placeholder="Nom, e-mail, téléphone, n° d’adhérent…" aria-label="Rechercher un adhérent" value="${esc(AD.q)}"></div>
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
      <div class="h2" style="margin-top:14px">ACTIONS</div>
      <div class="mco-acts">${actionsFiche(r, f)}</div>
      <button class="btn out block" id="mco-fc" style="margin-top:8px">Fermer</button>`);
    const c = $('#mco-fc'); if (c) c.onclick = close;
    const on = (id, fn) => { const b = $('#' + id); if (b) b.onclick = () => fn(r, f, close); };
    on('mco-fk-ok', accepterFiche); on('mco-fk-no', refuserFiche); on('mco-fk-pay', paiementFiche); on('mco-fk-edit', modifierFiche);
    on('mco-fk-sus', (r2, f2, cl) => statutFiche(r2, 'suspendu', cl)); on('mco-fk-rea', (r2, f2, cl) => statutFiche(r2, 'a_jour', cl)); on('mco-fk-rad', (r2, f2, cl) => statutFiche(r2, 'radie', cl));
  }

  /* ---------- actions sur une fiche d'adhérent ---------- */
  const estGratuite = f => !!f && (Number(f.est_gratuite_auto) === 1 || (f.montant_type === 'fixe' && !(Number(f.montant_fixe) > 0)));
  function actionsFiche(r, f) {
    const a = [];
    if (r.statut === 'en_attente' && estGratuite(f)) a.push('<div class="mco-2"><button class="btn out" id="mco-fk-no">Refuser</button><button class="btn" id="mco-fk-ok">Accepter</button></div>');
    else if (r.statut !== 'radie' && !estGratuite(f)) a.push('<button class="btn block" id="mco-fk-pay">💰 Enregistrer un paiement</button>');
    a.push('<button class="btn out block" id="mco-fk-edit">Modifier la fiche</button>');
    if (r.statut === 'suspendu') a.push('<button class="btn out block" id="mco-fk-rea">Réactiver</button>');
    else if (r.statut !== 'radie') a.push('<button class="btn out block" id="mco-fk-sus">Suspendre</button>');
    if (r.statut !== 'radie') a.push('<button class="btn out block" id="mco-fk-rad" style="color:var(--red)">Radier</button>');
    return a.join('');
  }
  async function appliquer(close, fait, requete) {
    try { await requete(); close(); toast(fait); C.at = 0; adherents(++rendu, AD.f); }
    catch (er) { erreurAction(er); }
  }
  function accepterFiche(r, f, close) {
    appliquer(close, 'Adhésion acceptée ✓', () => api('/api/adhesion-membres/' + Number(r.id) + '/accepter', { method: 'POST', body: {} }));
  }
  function refuserFiche(r, f, close) {
    const motif = prompt('Motif du refus (facultatif — la personne en sera informée) :', '');
    if (motif === null) return;
    appliquer(close, 'Demande refusée', () => api('/api/adhesion-membres/' + Number(r.id) + '/refuser', { method: 'POST', body: { motif: motif.trim().slice(0, 300) } }));
  }
  async function statutFiche(r, statut, close) {
    const nm = [r.prenom, r.nom].filter(Boolean).join(' ') || 'cet adhérent';
    const txt = {
      suspendu: ['Suspendre ' + nm + ' ?', 'Son adhésion est mise en pause : il n’est plus compté parmi les adhérents à jour. Vous pourrez le réactiver.', 'Suspendre'],
      a_jour: ['Réactiver ' + nm + ' ?', 'Son adhésion redevient active.', 'Réactiver'],
      radie: ['Radier ' + nm + ' ?', 'Fin définitive de son adhésion : elle ne peut plus être réactivée depuis le téléphone.', 'Radier']
    }[statut];
    close();
    if (!(await confirmerFeuille(txt[0], txt[1], txt[2]))) return fiche(r);
    try {
      await api('/api/adhesion-membres/' + Number(r.id), { method: 'PUT', body: { statut } });
      toast({ suspendu: 'Adhérent suspendu', a_jour: 'Adhérent réactivé ✓', radie: 'Adhérent radié' }[statut]);
      C.at = 0; adherents(++rendu, AD.f);
    } catch (er) { erreurAction(er); fiche(r); }
  }
  function paiementFiche(r, f, close) {
    close();
    const fixe = f && f.montant_type === 'fixe' && Number(f.montant_fixe) > 0 ? Number(f.montant_fixe) : '';
    const fermer = A.openSheet('<h3 style="margin:0 0 4px">Enregistrer un paiement</h3><p class="small muted" style="margin:0 0 4px">Paiement reçu hors ligne (virement, espèces, etc.). L’adhérent passe « à jour », un reçu lui est envoyé et son échéance est recalculée.</p>' +
      '<div class="mco-f"><label class="mco-l" for="mco-pm">Montant reçu (' + esc((f && f.devise) || 'EUR') + ') *</label><input type="number" id="mco-pm" min="0.01" step="0.01" inputmode="decimal" value="' + fixe + '"><div class="mco-err" id="mco-pm-e" role="alert"></div>' +
      '<label class="mco-l" for="mco-pmode">Mode de paiement</label><select id="mco-pmode">' + MODES.map(([v, l]) => '<option value="' + v + '"' + (v === 'virement' ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
      '<button class="btn block" id="mco-pok" style="margin-top:14px">Enregistrer</button><button class="btn out block" id="mco-pno" style="margin-top:8px">Annuler</button>');
    $('#mco-pno').onclick = () => { fermer(); fiche(r); };
    $('#mco-pok').onclick = async ev => {
      const m = Number($('#mco-pm').value);
      if (!(m > 0)) { $('#mco-pm-e').textContent = 'Indiquez le montant reçu.'; return; }
      const b = ev.currentTarget; b.disabled = true;
      try {
        await api('/api/adhesion-membres/' + Number(r.id) + '/marquer-paye', { method: 'POST', body: { montant: m, mode_paiement: $('#mco-pmode').value } });
        fermer(); toast('Paiement enregistré ✓'); C.at = 0; adherents(++rendu, AD.f);
      } catch (er) { b.disabled = false; erreurAction(er); }
    };
  }
  function modifierFiche(r, f, close) {
    close();
    const ch = (id, lib, v, type) => '<label class="mco-l" for="' + id + '">' + lib + '</label><input type="' + (type || 'text') + '" id="' + id + '" value="' + esc(v || '') + '" maxlength="200">';
    const fermer = A.openSheet('<h3 style="margin:0 0 4px">Modifier la fiche</h3><div class="mco-f">' + ch('mco-em-nom', 'Nom *', r.nom) + ch('mco-em-prenom', 'Prénom', r.prenom) + ch('mco-em-email', 'E-mail', r.email, 'email') + ch('mco-em-tel', 'Téléphone', r.telephone, 'tel') + ch('mco-em-ville', 'Ville', r.ville) + ch('mco-em-pays', 'Pays', r.pays) +
      '<label class="mco-l" for="mco-em-obs">Observations</label><textarea id="mco-em-obs" maxlength="1000">' + esc(r.observations || '') + '</textarea><div class="mco-err" id="mco-em-e" role="alert"></div></div>' +
      '<button class="btn block" id="mco-eok" style="margin-top:14px">Enregistrer</button><button class="btn out block" id="mco-eno" style="margin-top:8px">Annuler</button>');
    $('#mco-eno').onclick = () => { fermer(); fiche(r); };
    $('#mco-eok').onclick = async ev => {
      const v = id => $('#' + id).value.trim();
      if (!v('mco-em-nom')) { $('#mco-em-e').textContent = 'Le nom est obligatoire.'; return; }
      const b = ev.currentTarget; b.disabled = true;
      try {
        await api('/api/adhesion-membres/' + Number(r.id), { method: 'PUT', body: { nom: v('mco-em-nom'), prenom: v('mco-em-prenom'), email: v('mco-em-email'), telephone: v('mco-em-tel'), ville: v('mco-em-ville'), pays: v('mco-em-pays'), observations: v('mco-em-obs') } });
        fermer(); toast('Fiche modifiée ✓'); C.at = 0; adherents(++rendu, AD.f);
      } catch (er) { b.disabled = false; erreurAction(er); }
    };
  }

  /* ---------- ajout d'un adhérent à la main ---------- */
  async function formAdherent(t) {
    const titre = 'Ajouter un adhérent';
    if (!gate(titre)) return;
    setPane(titre, SK);
    let init, fl;
    try { init = await chargerInit(); fl = (await api('/api/initiatives/' + Number(init.id) + '/adhesion-formules/gestion')).formules || []; }
    catch (e) { return showError(t, titre, e, 'Impossible de charger vos formules', () => formAdherent(++rendu)); }
    if (!vivant(t)) return;
    if (!fl.length) return paint(t, titre, '<div class="empty"><div class="ei">' + ic('card', 'l') + '</div><b>Créez d’abord une formule</b>Un adhérent est rattaché à une formule d’adhésion.<br><br><a class="btn" href="#/cotisations/formules/nouvelle">Créer une formule</a></div>');
    const defaut = (fl.find(f => Number(f.est_officielle)) || fl.find(f => Number(f.actif)) || fl[0]).id;
    const ch = (id, lib, type, extra) => '<label class="mco-l" for="' + id + '">' + lib + '</label><input type="' + (type || 'text') + '" id="' + id + '" maxlength="200" ' + (extra || '') + '>';
    const html = '<form id="mco-fa" class="mco-f" novalidate autocomplete="off"><div class="mco-gerr" id="mco-fa-g" role="alert"></div>' +
      '<label class="mco-l" for="mco-fa-f">Formule *</label><select id="mco-fa-f">' + fl.map(f => '<option value="' + Number(f.id) + '"' + (Number(f.id) === Number(defaut) ? ' selected' : '') + '>' + esc(f.nom) + '</option>').join('') + '</select>' +
      ch('mco-fa-nom', 'Nom *') + ch('mco-fa-prenom', 'Prénom') + ch('mco-fa-email', 'E-mail', 'email', 'inputmode="email"') + ch('mco-fa-tel', 'Téléphone', 'tel') + ch('mco-fa-ville', 'Ville') + ch('mco-fa-pays', 'Pays') +
      '<label class="mco-l" for="mco-fa-date">Date d’adhésion <small>(facultative)</small></label><input type="date" id="mco-fa-date">' +
      '<p class="mco-hint">Laissez vide pour une fiche « en attente de paiement ». Avec une date, l’adhésion est enregistrée comme déjà effective : elle passe « à jour » et son échéance suit la formule choisie.</p>' +
      '<div class="mco-err" id="mco-fa-e" role="alert"></div></form>';
    setPane(titre, html, '<button class="btn block" id="mco-fa-ok">Ajouter l’adhérent</button>');
    const form = $('#mco-fa'); form.onsubmit = ev => ev.preventDefault();
    $('#mco-fa-ok').onclick = async ev => {
      const v = id => $('#' + id).value.trim();
      $('#mco-fa-e').textContent = ''; $('#mco-fa-g').textContent = '';
      if (!v('mco-fa-nom')) { $('#mco-fa-e').textContent = 'Le nom est obligatoire.'; $('#mco-fa-nom').focus(); return; }
      const f = fl.find(x => Number(x.id) === Number(v('mco-fa-f'))) || {};
      const body = { formule_id: Number(v('mco-fa-f')), nom: v('mco-fa-nom'), prenom: v('mco-fa-prenom') || null, email: v('mco-fa-email') || null, telephone: v('mco-fa-tel') || null, ville: v('mco-fa-ville') || null, pays: v('mco-fa-pays') || null };
      if (v('mco-fa-date')) {
        body.date_adhesion = v('mco-fa-date');
        body.mode_validite = f.mode_validite === 'collectif' ? 'collectif' : 'individuel';
        body.duree_valeur = f.duree_valeur ? Number(f.duree_valeur) : null; body.duree_unite = f.duree_unite || 'mois'; body.duree_illimitee = !!Number(f.duree_illimitee);
        body.periode_collective_debut = f.periode_collective_debut || null; body.periode_collective_fin = f.periode_collective_fin || null;
        /* Formule sans durée propre : l'échéance suit son type (annuelle = 12 mois…), comme pour un paiement enregistré. */
        const MOIS_TYPE = { cotisation_annuelle: 12, cotisation_semestrielle: 6, cotisation_trimestrielle: 3, cotisation_mensuelle: 1 };
        if (!body.duree_valeur && !body.duree_illimitee && body.mode_validite !== 'collectif' && MOIS_TYPE[f.type_contribution]) { body.duree_valeur = MOIS_TYPE[f.type_contribution]; body.duree_unite = 'mois'; }
      }
      const b = ev.currentTarget; b.disabled = true; const txt = b.textContent; b.textContent = 'Ajout…';
      try { await api('/api/initiatives/' + Number(init.id) + '/adhesion-membres', { method: 'POST', body }); C.at = 0; toast('Adhérent ajouté ✓'); location.replace('#/cotisations/adherents'); }
      catch (er) { b.disabled = false; b.textContent = txt; if (er && er.status === 402) { A.premiumSheet(NOM); return; } $('#mco-fa-g').textContent = (er && er.message) || 'Ajout impossible.'; toast((er && er.message) || 'Ajout impossible.', true); }
    };
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
