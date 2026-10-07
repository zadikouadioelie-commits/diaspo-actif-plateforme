/* ============================================================
   Diaspo'Actif — Version téléphone : module « Mon abonnement »
   Équivalent de mon-abonnement.html, pensé pour le téléphone.

   Routes :  #/abonnement              état de l'abonnement, formules, paiements, dons récurrents
             #/abonnement/avantages    ce que le Premium débloque pour ce type de compte
             #/abonnement/historique   tous les paiements

   Routes API (les mêmes que le site, jamais de paiement déclenché ici) :
     GET  /api/premium/statut                         état Premium (source unique du serveur)
     GET  /api/mon-abonnement                         abonnements payés (Stripe) + historique
     GET  /api/accreditations/catalogue?forcer_type=  prix calculé pour ce compte
     GET  /api/mes-dons-recurrents                    dons récurrents aux cagnottes
     POST /api/mon-abonnement/:id/resilier | /reactiver
     POST /api/mes-dons-recurrents/:id/arreter | /reactiver
   Le paiement lui-même (Stripe) passe par premium.html : un simple lien, aucune
   écriture de paiement n'est faite depuis ce module.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast, openSheet } = A;
  window.MMods = window.MMods || {};

  /* ---------- styles (injectés une seule fois) ---------- */
  if (!document.getElementById('m-mod-abonnement-css')) {
    const st = document.createElement('style');
    st.id = 'm-mod-abonnement-css';
    st.textContent = `
      .ab-hero{border-radius:var(--r);padding:18px 16px 16px;color:#fff;background:linear-gradient(135deg,#0D2B4E,#1E4F8A);margin-bottom:12px;box-shadow:var(--shadow)}
      .ab-hero.warn{background:linear-gradient(135deg,#78350f,#B84C1A)}
      .ab-hero.bad{background:linear-gradient(135deg,#7f1d1d,#B3261E)}
      .ab-hero.off{background:linear-gradient(135deg,#3b4658,#5b6472)}
      .ab-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .ab-kick{font-size:12px;font-weight:700;letter-spacing:.03em;opacity:.9}
      .ab-pill{flex:none;font-size:12px;font-weight:800;border-radius:30px;padding:4px 12px;background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.45)}
      .ab-title{font-size:22px;font-weight:800;line-height:1.2}
      .ab-big{font-size:38px;font-weight:800;line-height:1.1;margin-top:8px}
      .ab-big small{font-size:15px;font-weight:600;opacity:.9;margin-left:4px}
      .ab-sub{margin:8px 0 0;font-size:14px;line-height:1.45;opacity:.95}
      .ab-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);padding:14px;margin-bottom:12px}
      .ab-card h3{margin:0 0 6px;font-size:16px}
      .ab-note{font-size:13px;color:var(--muted);margin:6px 0 0;line-height:1.45}
      .ab-prices{display:flex;gap:10px;margin:10px 0 4px}
      .ab-price{flex:1;border:1.5px solid var(--border);border-radius:12px;padding:10px 12px;background:var(--ivory)}
      .ab-price b{display:block;font-size:19px}
      .ab-price span{font-size:12.5px;color:var(--muted)}
      .ab-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px}
      .ab-err{color:var(--red);font-size:13px;min-height:18px;margin:6px 0 0}
      .ab-danger{background:var(--red);border-color:var(--red)}
      .ab-pay{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--border)}
      .ab-pay:last-child{border-bottom:none}
      .ab-pay .amt{font-weight:800;white-space:nowrap}
      .ab-feat h3{display:flex;align-items:center;gap:8px}
      .ab-feat ul{margin:6px 0 0;padding-left:20px}
      .ab-feat li{margin:3px 0;line-height:1.4}
      .ab-lbl{display:block;font-weight:600;font-size:14px;margin:12px 0 6px}
      .ab-ta{width:100%;min-height:84px;border:1px solid var(--border);border-radius:12px;padding:10px 12px;font-size:16px;resize:vertical;background:#fff}
      .ab-sheet-t{margin:4px 0 8px;font-size:19px}
    `;
    document.head.appendChild(st);
  }

  /* ---------- Contenu de la page « Premium » du site (assets/premium-page.js, PREMIUM_CONFIGS) ----------
     Recopié tel quel : le serveur ne fournit pas cette liste détaillée (le champ `droits` du
     catalogue est un résumé différent). Si le site change, cette liste est à resynchroniser. */
  const AVANTAGES = {
    utilisateur: {
      groupes: [
        { icon: '💼', titre: 'Carrière', items: ["Recherche d'emploi", "Recherche de stage", "Recherche d'alternance", 'Postuler directement aux offres', 'Suivi des candidatures', 'Sauvegarde des offres', 'Alertes personnalisées'] },
        { icon: '📄', titre: 'CV & Lettres de motivation', items: ['Création de CV professionnel', 'Lettres de motivation', 'Export PDF', 'Candidature en un clic', 'Gestion de plusieurs versions'] },
        { icon: '🤝', titre: 'Réseau Professionnel', items: ['Développer son réseau', 'Rechercher des partenaires', 'Créer des listes professionnelles', 'Échanger avec des professionnels', 'Développer sa visibilité'] },
        { icon: '🚀', titre: 'Business Plan IA', items: ['Création assistée par IA', 'Modification', 'Export PDF', 'Accompagnement intelligent'] },
        { icon: '🎓', titre: 'Formations Premium', items: ['Accès aux formations Premium', 'Suivi de progression', 'Certifications', 'Recommandations personnalisées'] },
        { icon: '🤖', titre: 'Assistant IA OZ', items: ['Conseils personnalisés', 'Recommandations intelligentes', 'Assistance quotidienne', 'Automatisation de certaines tâches'] }
      ],
      gratuit: ['Profil public', 'Messagerie', 'Mes Billets', 'Annuaire', 'Synchronisation réseaux sociaux', 'Centre des tutos', 'Agenda synchronisé']
    },
    initiative: {
      groupes: [
        { icon: '🏬', titre: 'Boutique & Visibilité', items: ['Boutique publique personnalisée', 'Publications mises en avant', 'Statistiques de visibilité', 'Thèmes premium'] },
        { icon: '🎫', titre: 'Cotisations & Adhésions', items: ['Formules d’adhésion illimitées', 'Encaissement des cotisations', 'Registre des membres', 'Relances automatiques'] },
        { icon: '🗳️', titre: 'Votes sécurisés', items: ['Organisation de scrutins', 'Assemblées générales', 'Émargement QR code', 'Comptes rendus automatiques'] },
        { icon: '💼', titre: 'Recrutement', items: ['Publication d’offres illimitée', 'Suivi des candidatures', 'Mise en avant des offres'] },
        { icon: '🤝', titre: 'Partenaires & Réseau', items: ['Liste de partenaires', 'Mise en relation', 'Développement de la visibilité'] },
        { icon: '🤖', titre: 'Assistant IA OZ', items: ['Conseils personnalisés', 'Analyse de votre activité', 'Automatisation de certaines tâches'] }
      ],
      gratuit: ['Profil public', 'Messagerie', 'Annuaire', 'Centre des tutos', 'Agenda synchronisé']
    }
  };
  const TYPE_ACCRED = { utilisateur: 'utilisateur_abonne', initiative: 'initiative_abonne' };

  /* ---------- utilitaires ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  /* Le panneau est partagé : si la personne est repartie ailleurs pendant un chargement,
     on n'affiche pas un écran en retard par-dessus le nouveau. */
  const ici = () => /^#\/abonnement(\/|$)/.test(location.hash);
  let jeton = 0;

  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const s = String(v).trim();
    const j = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (j) return new Date(+j[1], +j[2] - 1, +j[3]);
    /* « 2026-07-17 06:43:05 » (SQLite) est en UTC sans suffixe ; l'ISO de Stripe porte déjà son Z. */
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
    return isNaN(d) ? null : d;
  }
  const fmtDate = v => { const d = toDate(v); return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  const eur = (n, dev) => {
    n = Number(n) || 0;
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: dev || 'EUR', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n); }
    catch (e) { return n + ' ' + (dev && dev !== 'EUR' ? dev : '€'); }
  };
  const nbJours = n => (n <= 0 ? 'dernier jour' : n === 1 ? '1 jour' : n + ' jours');
  const periodicite = (interv, count) => {
    const noms = { day: ['jour', 'jours'], week: ['semaine', 'semaines'], month: ['mois', 'mois'], year: ['an', 'ans'] }[interv];
    if (!noms) return '';
    return count > 1 ? 'tous les ' + count + ' ' + noms[1] : 'par ' + noms[0];
  };
  const formule = t => (t === 'annuel' ? 'Annuelle' : t === 'mensuel' ? 'Mensuelle' : t === 'decouverte' ? 'Découverte' : '');
  const roleCle = () => (S.me && (S.me.role === 'utilisateur' || S.me.role === 'initiative')) ? S.me.role : null;

  function skeleton(titre) { setPane(titre, '<div class="sk skc" style="height:170px"></div><div class="sk skc" style="height:110px"></div><div class="sk skc" style="height:90px"></div>'); }
  function erreur(titre, e, retry) {
    setPane(titre, `<div class="empty"><div class="ei">${ic('clock', 'l')}</div><b>Impossible de charger cette page</b>${esc(e && e.message ? e.message : 'Une erreur est survenue.')}<br><br><button class="btn" id="ab-retry">Réessayer</button></div>`);
    const b = $('#ab-retry'); if (b) b.onclick = retry;
  }
  async function connecte(raison) {
    if (S.me) return true;
    const ok = await A.needLogin(raison);
    if (!ok) { location.hash = '#/moi'; return false; }
    return true;
  }

  /* ---------- chargement ---------- */
  let cache = null; // dernière lecture complète, réutilisée par les sous-écrans
  async function charger() {
    const role = roleCle();
    const typeAccred = role ? TYPE_ACCRED[role] : null;
    /* Le statut est indispensable (erreur = écran d'erreur) ; le reste dégrade proprement. */
    const [st, ab, cat, dons] = await Promise.allSettled([
      api('/api/premium/statut'),
      api('/api/mon-abonnement'),
      typeAccred ? api('/api/accreditations/catalogue?forcer_type=' + encodeURIComponent(typeAccred)) : Promise.resolve(null),
      api('/api/mes-dons-recurrents')
    ]);
    if (st.status === 'rejected') throw st.reason;
    S.premium = st.value; // garde le menu « Moi » à jour
    const def = cat.status === 'fulfilled' && cat.value ? (cat.value.catalogue || []).find(d => d.type === typeAccred) : null;
    cache = {
      st: st.value,
      abos: ab.status === 'fulfilled' ? (ab.value.abonnements || []) : null,
      paiements: ab.status === 'fulfilled' ? (ab.value.paiements || []) : null,
      tarif: def && def.tarif_calcule ? def.tarif_calcule : null,
      dons: dons.status === 'fulfilled' ? (dons.value.dons || []) : null
    };
    return cache;
  }

  /* ---------- état déduit de la réponse du serveur ---------- */
  function etat(c) {
    const st = c.st;
    if (!st.concerne) return { k: 'na' };
    if (st.statut === 'impaye') return { k: 'impaye' };
    if (st.statut === 'expire') return { k: 'expire' };
    /* Un abonnement réellement payé n'est jamais une période offerte : même critère que le serveur. */
    const paye = Number(st.montant_paye) > 0;
    return { k: paye ? 'paye' : 'decouverte', bientot: st.statut === 'bientot_expire' };
  }
  const aboActif = c => (c.abos || []).find(a => a.statut === 'active') || null;

  function hero(c) {
    const st = c.st, e = etat(c);
    const kick = '👑 Premium' + (S.me && A.ROLE_LABEL[S.me.role] ? ' · Compte ' + esc(A.ROLE_LABEL[S.me.role]) : '');
    const fin = fmtDate(st.date_expiration);
    const jr = st.jours_restants;
    let cls = '', pill = '', titre = '', gros = '', sub = '';
    if (e.k === 'na') {
      cls = 'off'; pill = 'Non concerné'; titre = 'Pas d’abonnement Premium';
      sub = 'Le Premium ne concerne pas ce type de compte. Rien n’est à payer ni à renouveler.';
    } else if (e.k === 'impaye') {
      cls = 'bad'; pill = 'Paiement refusé'; titre = 'Paiement à régulariser';
      if (jr != null) gros = `${esc(String(Math.max(0, jr)))}<small>${Math.max(0, jr) > 1 ? 'jours d’accès conservés' : 'jour d’accès conservé'}</small>`;
      sub = 'Le dernier prélèvement n’a pas abouti. Votre accès Premium est maintenu encore quelques jours : vérifiez votre moyen de paiement. Sans règlement, l’abonnement prendra fin et vous pourrez vous réabonner à tout moment.';
    } else if (e.k === 'expire') {
      cls = 'bad'; pill = 'Expiré'; titre = 'Votre Premium est expiré';
      if (st.jours_depuis_expiration > 0) gros = `${esc(String(st.jours_depuis_expiration))}<small>${st.jours_depuis_expiration > 1 ? 'jours depuis la fin' : 'jour depuis la fin'}</small>`;
      sub = (fin ? 'Il s’est terminé le ' + esc(fin) + '. ' : '') + (st.conservation_illimitee ? 'Vos contenus sont conservés et reviendront intacts dès que vous vous réabonnez.' : 'Réabonnez-vous pour retrouver vos outils Premium.');
    } else {
      const abo = aboActif(c), prog = !!(abo && abo.stripe && abo.stripe.annulation_programmee);
      const bientot = e.bientot || prog;
      cls = bientot ? 'warn' : '';
      pill = prog ? 'Résiliation programmée' : (e.bientot ? 'Bientôt terminé' : 'Actif');
      titre = e.k === 'paye' ? 'Premium actif' : 'Période de découverte';
      /* Un abonnement payant qui se renouvelle tout seul n'a pas de « compte à rebours » utile. */
      const renouvellementAuto = e.k === 'paye' && abo && abo.stripe && !prog;
      if (jr != null && !renouvellementAuto) gros = jr <= 0 ? 'Dernier jour' : esc(String(jr)) + '<small>' + (jr > 1 ? 'jours restants' : 'jour restant') + '</small>';
      if (e.k === 'paye') {
        const prochain = abo && abo.stripe && abo.stripe.periode_fin ? fmtDate(abo.stripe.periode_fin) : fin;
        if (prog) sub = 'Votre abonnement ne sera pas renouvelé. Vous gardez le Premium jusqu’au ' + esc(prochain || 'la fin de la période payée') + '.';
        else if (abo && abo.stripe && abo.stripe.periode_fin) sub = 'Renouvellement automatique : prochain prélèvement le ' + esc(prochain) + '.';
        else sub = fin ? 'Valable jusqu’au ' + esc(fin) + '.' : 'Aucune date de fin pour le moment.';
      } else {
        sub = fin ? 'Offerte jusqu’au ' + esc(fin) + '. Tous les outils Premium de votre compte sont ouverts pendant cette période.' : 'Tous les outils Premium de votre compte sont ouverts. Aucune date de fin pour le moment.';
        if (e.bientot) sub += ' Pensez à choisir une formule pour ne pas perdre l’accès.';
      }
    }
    return `<section class="ab-hero ${cls}" aria-live="polite"><div class="ab-top"><span class="ab-kick">${kick}</span><span class="ab-pill">${esc(pill)}</span></div>
      <div class="ab-title">${esc(titre)}</div>${gros ? `<div class="ab-big">${gros}</div>` : ''}<p class="ab-sub">${sub}</p></section>`;
  }

  /* Bouton principal collé en bas : seulement quand il y a vraiment quelque chose à acheter ou renouveler. */
  function pied(c) {
    const role = roleCle(), e = etat(c);
    if (!role || e.k === 'na') return '';
    const abo = aboActif(c);
    if (e.k === 'paye' && (abo || !e.bientot)) return ''; // abonnement payant en cours : rien à acheter
    if (e.k === 'impaye') return ''; // abonnement encore existant côté Stripe : rien à racheter, il faut régulariser
    const lib = e.k === 'expire' ? 'Renouveler mon Premium' : (e.bientot ? 'Prolonger mon Premium' : 'Choisir une formule Premium');
    return `<a class="btn block" href="premium.html?type=${role}">${ic('star', 's')} ${lib}</a>`;
  }

  /* ---------- écran principal ---------- */
  async function ecranPrincipal() {
    const mon = ++jeton;
    skeleton('Mon abonnement');
    if (!(await connecte('Connectez-vous pour consulter votre abonnement.'))) return;
    let c;
    try { c = await charger(); } catch (e) {
      if (mon !== jeton || !ici()) return;
      /* Session expirée : on rouvre la connexion ; après reconnexion, m.js rejoue la route tout seul. */
      if (e.status === 401) { S.me = null; await connecte('Votre session a expiré. Reconnectez-vous.'); return; }
      return erreur('Mon abonnement', e, ecranPrincipal);
    }
    if (mon !== jeton || !ici()) return;
    const role = roleCle(), e = etat(c), st = c.st;

    /* Les faits clés, en lignes libellé / valeur. */
    const lignes = [];
    lignes.push(['Type d’accès', e.k === 'paye' ? 'Abonnement payant' : e.k === 'decouverte' ? 'Période de découverte offerte' : e.k === 'impaye' ? 'Abonnement payant (paiement refusé)' : e.k === 'expire' ? 'Expiré' : 'Sans objet']);
    if (e.k !== 'na') {
      lignes.push([e.k === 'expire' ? 'Terminé le' : 'Échéance', st.date_expiration ? fmtDate(st.date_expiration) : 'Aucune date de fin']);
      if (e.k !== 'expire' && st.jours_restants != null) lignes.push(['Temps restant', nbJours(st.jours_restants)]);
    }
    const faits = `<div class="ab-card">${lignes.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>`;

    /* Prix : seulement si le serveur en a calculé un pour ce compte et que rien d'actif n'est déjà payé. */
    let formules = '';
    const abo = aboActif(c);
    if (c.tarif && role && e.k !== 'na' && !(e.k === 'paye' && abo)) {
      const t = c.tarif;
      formules = `<div class="ab-card"><h3>Formules pour votre compte</h3>
        <div class="ab-prices"><div class="ab-price"><span>Mensuelle</span><b>${esc(eur(t.montant_mensuel, t.devise))}</b><span>par mois</span></div>
        <div class="ab-price"><span>Annuelle</span><b>${esc(eur(t.montant_annuel, t.devise))}</b><span>par an</span></div></div>
        <p class="ab-note">Le choix de la formule et le paiement se font sur la page Premium du site, avec un paiement sécurisé par Stripe. Rien n’est débité depuis cet écran.</p></div>`;
    }

    /* Ce que débloque le Premium pour CE type de compte. */
    let avantages = '';
    const av = role ? AVANTAGES[role] : null;
    if (av && e.k !== 'na') {
      avantages = `<div class="ab-card"><h3>Ce que le Premium débloque</h3>
        <div class="ab-chips">${av.groupes.map(g => `<span class="badge">${esc(g.icon)} ${esc(g.titre)}</span>`).join('')}</div>
        <a class="btn out block" href="#/abonnement/avantages">Voir le détail des avantages</a></div>`;
    }

    /* Abonnements payants (Stripe) : l'autorité de la facturation. */
    let payants = '';
    if (c.abos === null) {
      payants = `<div class="ab-card"><h3>Facturation</h3><p class="ab-note">Les détails de facturation sont momentanément indisponibles.</p><button class="btn out sm" style="margin-top:10px" data-ab="recharger">Réessayer</button></div>`;
    } else if (c.abos.length) {
      payants = c.abos.map(a => {
        const s = a.stripe, prog = !!(s && s.annulation_programmee);
        const pill = prog ? ['o', 'Résiliation programmée'] : a.statut === 'active' ? ['g', 'Actif'] : a.statut === 'expiree' ? ['', 'Terminé'] : a.statut === 'suspendue' ? ['o', 'Paiement en attente'] : ['', 'Inactif'];
        const fin = s && s.periode_fin ? fmtDate(s.periode_fin) : fmtDate(a.date_expiration);
        const l = [];
        if (s && s.montant != null) l.push(['Montant', eur(s.montant, s.devise) + (s.intervalle ? ' ' + periodicite(s.intervalle, 1) : '')]);
        const f = formule(a.type_tarif); if (f) l.push(['Formule', f]);
        if (a.date_attribution) l.push(['Souscrit le', fmtDate(a.date_attribution)]);
        if (a.reduction_pct_appliquee) l.push(['Réduction appliquée', '-' + a.reduction_pct_appliquee + ' %']);
        const phrase = a.statut !== 'active' ? (fin ? 'Terminé le ' + fin + '.' : '') : prog ? 'Accès Premium jusqu’au ' + fin + ', puis non renouvelé.' : (s && s.periode_fin ? 'Prochain renouvellement le ' + fin + '.' : (fin ? 'Valable jusqu’au ' + fin + '.' : ''));
        const actions = a.statut !== 'active' ? '' : prog
          ? `<button class="btn out block" style="margin-top:12px" data-ab="reactiver" data-id="${Number(a.accred_id)}">↺ Annuler la résiliation</button>`
          : `<button class="btn out block" style="margin-top:12px;color:var(--red);border-color:var(--red)" data-ab="resilier" data-id="${Number(a.accred_id)}">Résilier mon abonnement</button>`;
        return `<div class="ab-card"><div class="row" style="margin-bottom:4px"><h3 class="sp ell" style="margin:0">${esc(a.emoji || '👑')} ${esc(a.label || 'Abonnement')}</h3><span class="badge ${pill[0]}">${esc(pill[1])}</span></div>
          ${phrase ? `<p class="ab-note" style="margin:0 0 6px">${esc(phrase)}</p>` : ''}${l.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}${actions}</div>`;
      }).join('');
    }

    /* Historique : les 3 derniers paiements ici, le reste sur un écran dédié. */
    let histo = '';
    if (c.paiements && c.paiements.length) {
      histo = `<div class="h2">DERNIERS PAIEMENTS</div><div class="ab-card" style="padding:4px 14px">${c.paiements.slice(0, 3).map(ligneP).join('')}</div>
        ${c.paiements.length > 3 ? `<a class="btn out block" href="#/abonnement/historique" style="margin-bottom:12px">Voir tous les paiements (${c.paiements.length})</a>` : ''}`;
    } else if (c.paiements) {
      histo = `<div class="h2">PAIEMENTS</div><div class="ab-card"><p class="ab-note" style="margin:0">Aucun paiement enregistré pour le moment.</p></div>`;
    }

    /* Dons récurrents (même page sur le site). */
    let dons = '';
    if (c.dons === null) {
      dons = `<div class="h2">MES DONS RÉCURRENTS</div><div class="ab-card"><p class="ab-note" style="margin:0">Vos dons récurrents sont momentanément indisponibles.</p><button class="btn out sm" style="margin-top:10px" data-ab="recharger">Réessayer</button></div>`;
    } else if (c.dons.length) {
      dons = `<div class="h2">MES DONS RÉCURRENTS</div>` + c.dons.map(d => {
        const s = d.stripe, arret = !!(s && s.annulation_programmee);
        const ok = s && s.statut_stripe === 'active';
        const pill = arret ? ['o', 'Arrêt programmé'] : ok ? ['g', 'Actif'] : ['', s && s.statut_stripe ? 'Inactif' : 'Statut inconnu'];
        const montant = s && s.montant != null ? eur(s.montant, s.devise) : eur(d.montant, d.devise);
        const per = s && s.intervalle ? periodicite(s.intervalle, s.intervalle_count || 1) : 'par mois';
        const fin = s && s.periode_fin ? fmtDate(s.periode_fin) : '';
        const phrase = arret ? 'Dernier prélèvement déjà effectué, puis arrêt le ' + fin + '.' : (fin ? 'Prochain prélèvement le ' + fin + '.' : '');
        const bouton = !s ? '' : arret
          ? `<button class="btn out block" style="margin-top:12px" data-ab="don-reactiver" data-id="${Number(d.contribution_id)}">↺ Annuler l’arrêt</button>`
          : `<button class="btn out block" style="margin-top:12px;color:var(--red);border-color:var(--red)" data-ab="don-arreter" data-id="${Number(d.contribution_id)}">Arrêter ce don</button>`;
        return `<div class="ab-card"><div class="row"><div class="sp"><h3 style="margin:0">${esc(d.cagnotte_titre || 'Cagnotte')}</h3><div class="small muted">${esc(montant)} ${esc(per)}</div></div><span class="badge ${pill[0]}">${esc(pill[1])}</span></div>
          ${phrase ? `<p class="ab-note">${esc(phrase)}</p>` : ''}${bouton}</div>`;
      }).join('');
    }

    const html = `<div id="ab-root">${hero(c)}${faits}${formules}${avantages}${payants}${histo}${dons}
      <p class="small muted" style="text-align:center;margin:14px 4px 4px">Besoin d’un autre détail ? <a href="mon-abonnement.html" style="text-decoration:underline">Ouvrir la page complète du site</a></p></div>`;
    setPane('Mon abonnement', html, pied(c));
    brancher(c);
  }

  function ligneP(p) {
    const stat = p.statut === 'paye' ? ['g', 'Payé'] : p.statut === 'en_attente' ? ['o', 'En attente'] : ['r', 'Échoué'];
    const f = formule(p.type_tarif);
    return `<div class="ab-pay"><div class="sp"><div class="ell" style="font-weight:600">${esc((p.emoji ? p.emoji + ' ' : '') + (p.label || 'Abonnement'))}</div>
      <div class="small muted">${esc(fmtDate(p.created_at))}${f ? ' · ' + esc(f) : ''}</div></div>
      <div style="text-align:right"><div class="amt">${esc(eur(p.montant, p.devise))}</div><span class="badge ${stat[0]}">${stat[1]}</span></div></div>`;
  }

  /* ---------- actions (résilier / réactiver) ---------- */
  function brancher(c) {
    const root = $('#ab-root'); if (!root) return;
    root.addEventListener('click', ev => {
      const b = ev.target.closest('[data-ab]'); if (!b) return;
      const id = Number(b.dataset.id);
      switch (b.dataset.ab) {
        case 'recharger': ecranPrincipal(); break;
        case 'resilier': feuilleResilier((c.abos || []).find(a => Number(a.accred_id) === id)); break;
        case 'reactiver': reactiver(b, '/api/mon-abonnement/' + id + '/reactiver', 'Annuler la résiliation et poursuivre votre abonnement Premium normalement ?', 'Résiliation annulée : votre abonnement continue.'); break;
        case 'don-arreter': feuilleArreterDon((c.dons || []).find(d => Number(d.contribution_id) === id)); break;
        case 'don-reactiver': reactiver(b, '/api/mes-dons-recurrents/' + id + '/reactiver', 'Annuler l’arrêt et poursuivre ce don récurrent normalement ?', 'Arrêt annulé : ce don continue.'); break;
      }
    });
  }

  async function reactiver(btn, chemin, question, succes) {
    if (!window.confirm(question)) return;
    btn.disabled = true;
    try { await api(chemin, { method: 'POST', body: {} }); toast(succes); ecranPrincipal(); }
    catch (e) { toast(e.message, true); btn.disabled = false; }
  }

  /* Feuille de confirmation commune : texte, champ facultatif, bouton rouge. */
  function feuilleConfirm(o) {
    const close = openSheet(`<h2 class="ab-sheet-t">${esc(o.titre)}</h2><p style="margin:0;line-height:1.5">${o.texteHtml}</p>
      ${o.motif ? `<label class="ab-lbl" for="ab-motif">Pourquoi partez-vous ? (facultatif, nous aide à nous améliorer)</label><textarea id="ab-motif" class="ab-ta" maxlength="500"></textarea>` : ''}
      <p id="ab-err" class="ab-err" role="alert"></p>
      <button class="btn block ab-danger" id="ab-ok">${esc(o.bouton)}</button>
      <button class="btn out block" id="ab-no" style="margin-top:10px">${esc(o.annuler)}</button>`);
    $('#ab-no').onclick = close;
    $('#ab-ok').onclick = async () => {
      const ok = $('#ab-ok'), err = $('#ab-err'); err.textContent = ''; ok.disabled = true; ok.textContent = 'Un instant…';
      try {
        await api(o.chemin, { method: 'POST', body: o.motif ? { motif: ($('#ab-motif').value || '').trim() } : {} });
        close(); toast(o.succes); ecranPrincipal();
      } catch (e) {
        err.textContent = (e.message || 'Une erreur est survenue.') + ' Vous pouvez réessayer.';
        ok.disabled = false; ok.textContent = o.bouton;
      }
    };
  }
  function feuilleResilier(a) {
    if (!a) return;
    const fin = fmtDate(a.stripe && a.stripe.periode_fin) || fmtDate(a.date_expiration) || 'la fin de la période en cours';
    feuilleConfirm({
      titre: 'Résilier mon abonnement ?', motif: true,
      texteHtml: `Vous gardez l’accès Premium jusqu’au <b>${esc(fin)}</b>, fin de la période déjà payée. Aucun remboursement au prorata, aucun autre prélèvement après cette date. Vous pourrez annuler la résiliation tant que cette date n’est pas passée.`,
      bouton: 'Résilier mon abonnement', annuler: 'Garder mon abonnement',
      chemin: '/api/mon-abonnement/' + Number(a.accred_id) + '/resilier', succes: 'Résiliation programmée.'
    });
  }
  function feuilleArreterDon(d) {
    if (!d) return;
    const fin = fmtDate(d.stripe && d.stripe.periode_fin) || 'la fin de la période en cours';
    feuilleConfirm({
      titre: 'Arrêter ce don récurrent ?', motif: false,
      texteHtml: `Le dernier prélèvement déjà effectué reste acquis. Aucun autre prélèvement après le <b>${esc(fin)}</b>. Vous pourrez annuler cet arrêt tant que cette date n’est pas passée.`,
      bouton: 'Arrêter ce don', annuler: 'Continuer ce don',
      chemin: '/api/mes-dons-recurrents/' + Number(d.contribution_id) + '/arreter', succes: 'Arrêt du don programmé.'
    });
  }

  /* ---------- sous-écran : avantages ---------- */
  async function ecranAvantages() {
    const mon = ++jeton;
    skeleton('Ce que débloque le Premium');
    if (!(await connecte('Connectez-vous pour voir les avantages de votre compte.'))) return;
    const role = roleCle();
    let c = cache;
    if (!c) { try { c = await charger(); } catch (e) { if (mon !== jeton || !ici()) return; return erreur('Ce que débloque le Premium', e, ecranAvantages); } }
    if (mon !== jeton || !ici()) return;
    const av = role ? AVANTAGES[role] : null;
    if (!av) {
      return setPane('Ce que débloque le Premium', `<div class="empty"><div class="ei">${ic('star', 'l')}</div><b>Pas de Premium pour ce compte</b>Le Premium concerne les comptes Utilisateur et Initiative.<br><br><a class="btn" href="#/abonnement">Retour à mon abonnement</a></div>`);
    }
    const e = etat(c);
    const intro = e.k === 'expire' ? 'Ces outils sont actuellement verrouillés. Renouvelez votre Premium pour les retrouver, vos contenus sont conservés.'
      : e.k === 'paye' || e.k === 'decouverte' || e.k === 'impaye' ? 'Vous bénéficiez de tous ces outils avec votre abonnement.'
      : 'Voici ce que le Premium ouvre pour votre compte.';
    const html = `<p class="muted" style="margin:2px 4px 12px">${esc(intro)}</p>
      ${av.groupes.map(g => `<div class="ab-card ab-feat"><h3><span aria-hidden="true">${esc(g.icon)}</span> ${esc(g.titre)}</h3><ul>${g.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}
      <div class="h2">TOUJOURS GRATUIT, MÊME SANS PREMIUM</div>
      <div class="ab-card"><div class="ab-chips" style="margin:0">${av.gratuit.map(i => `<span class="badge g">${ic('check', 's')} ${esc(i)}</span>`).join('')}</div></div>`;
    setPane('Ce que débloque le Premium', html, pied(c));
  }

  /* ---------- sous-écran : historique complet ---------- */
  async function ecranHistorique() {
    const mon = ++jeton;
    skeleton('Mes paiements');
    if (!(await connecte('Connectez-vous pour voir vos paiements.'))) return;
    let c = cache;
    if (!c) { try { c = await charger(); } catch (e) { if (mon !== jeton || !ici()) return; return erreur('Mes paiements', e, ecranHistorique); } }
    if (mon !== jeton || !ici()) return;
    if (!c.paiements) return erreur('Mes paiements', new Error('Les paiements sont momentanément indisponibles.'), ecranHistorique);
    if (!c.paiements.length) {
      return setPane('Mes paiements', `<div class="empty"><div class="ei">${ic('card', 'l')}</div><b>Aucun paiement</b>Vos paiements d’abonnement apparaîtront ici.<br><br><a class="btn" href="#/abonnement">Retour à mon abonnement</a></div>`);
    }
    setPane('Mes paiements', `<div class="ab-card" style="padding:4px 14px">${c.paiements.map(ligneP).join('')}</div>
      <p class="ab-note" style="text-align:center">Les 50 derniers paiements sont affichés. « En attente » signifie que le paiement n’a pas été finalisé.</p>`);
  }

  window.MMods.abonnement = function (b) {
    if (b === 'avantages') return ecranAvantages();
    if (b === 'historique') return ecranHistorique();
    cache = null; // entrée depuis le menu : on relit toujours des données fraîches
    return ecranPrincipal();
  };
})();
