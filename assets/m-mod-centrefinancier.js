/* ============================================================
   Diaspo'Actif — Version téléphone : module « Centre Financier » (comptes Initiative)
   Équivalent de centre-financier.html, pensé pour le téléphone.

   Routes :  #/centrefinancier            mes revenus (solde retirable, périodes, transactions)
             #/centrefinancier/comptes    comptes de réception (Stripe Connect)
             #/centrefinancier/retrait    effectuer un retrait + historique des retraits
             #/centrefinancier/moyens     cartes enregistrées (lister, supprimer)
             #/centrefinancier/reglages   devise, virements automatiques, notifications

   Mêmes routes d'API et mêmes règles que le site :
     GET    /api/wallet/centre-financier        vue consolidée (solde, réserve, revenus, historique, Connect, réglages, retraits)
     POST   /api/wallet/withdraw                retrait réel vers le compte Stripe Connect
     PUT    /api/wallet/settings                préférences financières
     POST   /api/initiatives/:id/connect/onboard  ouverture de l'onboarding Stripe (redirection)
     GET    /api/paiement/moyens                cartes enregistrées
     DELETE /api/paiement/moyens/:id            supprimer une carte
   Le retrait déplace de l'argent réel : il passe par une feuille de confirmation (le site n'en a pas).
   Chargé APRÈS m.js : s'appuie uniquement sur window.MApp.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast, openSheet } = A;
  window.MMods = window.MMods || {};

  const NOM = 'Centre Financier';
  const $ = (s, r) => (r || document).querySelector(s);
  const ici = () => /^#\/centrefinancier(\/|$)/.test(location.hash);
  let jeton = 0;
  let D = null; // dernière lecture de /api/wallet/centre-financier, réutilisée d'un onglet à l'autre

  const ONGLETS = [['revenus', 'Revenus', ''], ['comptes', 'Comptes', 'comptes'], ['retrait', 'Retrait', 'retrait'], ['moyens', 'Cartes', 'moyens'], ['reglages', 'Réglages', 'reglages']];

  /* ---------- styles (injectés une seule fois) ---------- */
  if (!document.getElementById('m-mod-centrefinancier-css')) {
    const st = document.createElement('style');
    st.id = 'm-mod-centrefinancier-css';
    st.textContent = `
      .cf-tabs{display:flex;gap:6px;overflow-x:auto;margin:0 -2px 12px;padding:2px;scrollbar-width:none}
      .cf-tabs::-webkit-scrollbar{display:none}
      .cf-tabs a{flex:none;padding:9px 14px;min-height:40px;display:flex;align-items:center;border-radius:20px;border:1.5px solid var(--border);background:var(--card);color:var(--text);font-weight:700;font-size:14px;text-decoration:none}
      .cf-tabs a.on{background:var(--navy);border-color:var(--navy);color:#fff}
      /* Thème « Nuit dorée » : --navy y devient l'encre claire, la pastille active reprend celle des .chip.on du thème (dégradé or, texte sombre). */
      html body.nd .cf-tabs a.on{background:var(--nd-degore);border-color:transparent;color:#1a1202}
      .cf-sec{background:#FEF3C7;color:#78350F;border-radius:12px;padding:11px 13px;font-size:13px;line-height:1.45;margin-bottom:12px}
      .cf-hero{border-radius:var(--r);padding:18px 16px 14px;color:#fff;background:linear-gradient(135deg,#0D2B4E,#1E4F8A);margin-bottom:12px;box-shadow:var(--shadow)}
      .cf-hero .k{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.85}
      .cf-hero .big{font-size:38px;font-weight:800;line-height:1.1;margin-top:6px}
      .cf-hero .s{font-size:13px;line-height:1.45;opacity:.9;margin-top:6px}
      .cf-kpis{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
      .cf-kpi{background:rgba(255,255,255,.12);border-radius:12px;padding:10px;text-align:center}
      .cf-kpi b{display:block;font-size:17px}
      .cf-kpi span{font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.8}
      .cf-kpi.w{grid-column:1 / -1}
      .cf-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);padding:14px;margin-bottom:12px}
      .cf-card h3{margin:0 0 6px;font-size:16px}
      .cf-note{font-size:13px;color:var(--muted);margin:6px 0 0;line-height:1.45}
      .cf-tx{display:flex;gap:10px;align-items:flex-start;padding:11px 0;border-bottom:1px solid var(--border)}
      .cf-tx:last-child{border-bottom:none}
      .cf-tx .net{font-weight:800;color:var(--green);white-space:nowrap;text-align:right}
      .cf-tx .net small{display:block;font-weight:400;color:var(--muted);font-size:12px}
      .cf-f label{display:block;font-weight:700;font-size:13.5px;margin:14px 2px 5px}
      .cf-f input[type=text],.cf-f input[type=number],.cf-f select{display:block;width:100%;min-width:0;min-height:46px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:#fff;font-size:16px;color:var(--text);font-family:inherit}
      .cf-err{color:var(--red);font-size:13px;min-height:18px;margin:6px 2px 0}
      .cf-danger{background:var(--red);border-color:var(--red)}
      .cf-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}
      .cf-row:last-child{border-bottom:none}
      .cf-sw{flex:none;position:relative;width:54px;height:44px;display:flex;align-items:center;justify-content:center;background:none;border:0;padding:0}
      .cf-sw i{display:block;width:50px;height:30px;border-radius:15px;background:#B8C4D6;position:relative;transition:background .15s}
      .cf-sw i::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .15s}
      .cf-sw[aria-checked=true] i{background:var(--green)}
      .cf-sw[aria-checked=true] i::after{transform:translateX(20px)}
      .cf-sheet-t{margin:4px 0 8px;font-size:19px}
    `;
    document.head.appendChild(st);
  }

  /* ---------- utilitaires ---------- */
  const eur = n => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  /* « 2026-07-17 06:43:05 » (SQLite) est en UTC sans suffixe ; l'ISO de Stripe/Postgres porte déjà son fuseau. */
  function dateHeure(v) {
    if (!v) return '';
    let s = String(v).trim().replace(/(\.\d{3})\d+/, '$1').replace(/(:\d{2}(?:\.\d+)?)([+-]\d{2})$/, '$1$2:00');
    const d = new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') : s.replace(' ', 'T') + 'Z');
    return isNaN(d) ? '' : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  }
  const STATUTS = {
    valide: ['g', 'Validé'], traite: ['g', 'Traité'], active: ['g', 'Actif'],
    en_attente: ['o', 'En attente'], demande: ['o', 'Demandé'], pending: ['o', 'En attente'],
    rembourse: ['r', 'Remboursé'], annule: ['r', 'Annulé'], echoue: ['r', 'Échoué'], rejected: ['r', 'Refusé']
  };
  const pastille = s => { const x = STATUTS[s] || ['', String(s || '—')]; return `<span class="badge ${x[0]}">${esc(x[1])}</span>`; };
  const MODULES = { billetterie: 'Billetterie', cagnottes: 'Cagnottes' };

  function skeleton() { setPane(NOM, '<div class="sk skc" style="height:190px"></div><div class="sk skc" style="height:110px"></div><div class="sk skc" style="height:110px"></div>'); }
  function erreur(e, retry) {
    setPane(NOM, `<div class="empty"><div class="ei">${ic('clock', 'l')}</div><b>Impossible de charger le Centre Financier</b>${esc(e && e.message ? e.message : 'Une erreur est survenue.')}<br><br><button class="btn" id="cf-retry">Réessayer</button></div>`);
    const b = $('#cf-retry'); if (b) b.onclick = retry;
  }
  async function connecte() {
    if (S.me) return true;
    const ok = await A.needLogin('Connectez-vous pour consulter votre Centre Financier.');
    if (!ok) { location.hash = '#/moi'; return false; }
    return true;
  }
  function entete(actif) {
    return `<div class="cf-tabs" role="tablist">${ONGLETS.map(([k, lib, h]) => `<a role="tab" aria-selected="${k === actif}" class="${k === actif ? 'on' : ''}" href="#/centrefinancier${h ? '/' + h : ''}">${lib}</a>`).join('')}</div>`;
  }
  const soldeRetirable = d => (d.solde_disponible != null ? d.solde_disponible : d.balance) || 0;

  /* ---------- chargement + aiguillage ---------- */
  async function afficher(onglet, rechargerDonnees) {
    const mon = ++jeton;
    skeleton();
    if (!(await connecte())) return;
    if (rechargerDonnees || !D) {
      try { D = await api('/api/wallet/centre-financier'); }
      catch (e) {
        if (mon !== jeton || !ici()) return;
        if (e.status === 401) { S.me = null; await connecte(); return; }
        return erreur(e, () => afficher(onglet, true));
      }
    }
    if (mon !== jeton || !ici()) return;
    if (onglet === 'comptes') return ecranComptes();
    if (onglet === 'retrait') return ecranRetrait();
    if (onglet === 'moyens') return ecranMoyens(mon);
    if (onglet === 'reglages') return ecranReglages();
    return ecranRevenus();
  }

  /* ---------- Revenus ---------- */
  function ecranRevenus() {
    const d = D, r = d.revenus || {};
    const hist = d.historique || [];
    const lignes = hist.map(h => {
      const src = (h.source_label || '—') + (h.payeur_nom ? ' · ' + h.payeur_nom : '');
      return `<div class="cf-tx"><div class="sp"><div class="ell" style="font-weight:600">${esc(src)}</div>
        <div class="small muted">${esc(dateHeure(h.date))} · ${esc(MODULES[h.module] || h.module || '—')}</div>
        <div class="small muted">Brut ${esc(eur(h.montant_brut))} · commission −${esc(eur(h.commission))}</div></div>
        <div><div class="net">${esc(eur(h.montant_net))}<small>net</small></div><div style="text-align:right;margin-top:4px">${pastille(h.statut)}</div></div></div>`;
    }).join('');
    const html = `${entete('revenus')}
      <div class="cf-sec">🔒 <b>Sécurité :</b> Diaspo’Actif ne stocke jamais vos coordonnées bancaires. Toutes les connexions et tous les virements passent par Stripe, prestataire de paiement certifié. Seuls le statut et les montants transitent sur nos serveurs.</div>
      <section class="cf-hero"><div class="k">Solde retirable</div><div class="big">${esc(eur(soldeRetirable(d)))}</div>
        <div class="s">Commission Diaspo’Actif : ${Math.round((d.commission_rate || 0) * 100)} %, prélevée automatiquement.</div>
        ${d.solde_en_reserve > 0 ? `<div class="s">+ ${esc(eur(d.solde_en_reserve))} en réserve de sécurité : devient retirable ${esc(String(d.reserve_jours))} jours après réception.</div>` : ''}
        <div class="cf-kpis">
          <div class="cf-kpi"><b>${esc(eur(r.aujourdhui))}</b><span>Aujourd’hui</span></div>
          <div class="cf-kpi"><b>${esc(eur(r.semaine))}</b><span>Cette semaine</span></div>
          <div class="cf-kpi"><b>${esc(eur(r.mois))}</b><span>Ce mois</span></div>
          <div class="cf-kpi"><b>${esc(eur(r.annee))}</b><span>Cette année</span></div>
          <div class="cf-kpi w"><b>${esc(eur(r.cumule))}</b><span>Total cumulé</span></div>
        </div></section>
      <div class="h2">HISTORIQUE DES TRANSACTIONS</div>
      ${hist.length ? `<div class="cf-card" style="padding:4px 14px">${lignes}</div>` : `<div class="empty"><div class="ei">${ic('card', 'l')}</div><b>Aucune transaction</b>Les paiements reçus apparaîtront ici.</div>`}`;
    setPane(NOM, html);
  }

  /* ---------- Comptes de réception ---------- */
  function ecranComptes() {
    const c = D.connect;
    const bloc = c ? (() => {
      const act = !!c.payouts_enabled;
      return `<div class="row" style="margin-bottom:8px"><div class="sp"><b>${esc(c.initiative_nom)}</b><div class="small muted">Statut Stripe : ${pastille(c.statut)}</div></div></div>
        <div class="small" style="margin-bottom:12px">${act ? '✅ Virements activés' : '⏳ Virements non encore activés'}</div>
        <button class="btn block" id="cf-connect" data-id="${Number(c.initiative_id)}">${c.connecte ? 'Gérer / compléter mon compte' : 'Connecter Stripe'}</button>
        <p id="cf-cerr" class="cf-err" role="alert"></p>`;
    })() : `<p class="cf-note" style="margin:0">Vous devez posséder une initiative pour connecter un compte de réception.</p><a class="btn out block" style="margin-top:12px" href="#/moi">Retour à mon espace</a>`;
    setPane(NOM, `${entete('comptes')}
      <div class="cf-card"><h3>💼 Stripe Connect</h3>${bloc}</div>
      <div class="cf-card"><h3>Autres prestataires</h3><p class="cf-note" style="margin:0 0 10px">Non connectés pour l’instant : l’architecture est prête à les accueillir dès que les intégrations officielles seront disponibles.</p>
        <div class="cf-row" style="opacity:.65"><span class="sp">💳 PayPal</span><span class="badge o">Bientôt disponible</span></div></div>`);
    const b = $('#cf-connect');
    if (b) b.onclick = async () => {
      const err = $('#cf-cerr'); err.textContent = ''; b.disabled = true; b.textContent = 'Ouverture de Stripe…';
      try {
        const r = await api('/api/initiatives/' + Number(b.dataset.id) + '/connect/onboard', { method: 'POST', body: {} });
        if (r && r.url) { window.location.href = r.url; return; }
        throw new Error('Stripe n’a pas renvoyé de lien.');
      } catch (e) { err.textContent = (e.message || 'Erreur Stripe Connect.') + ' Vous pouvez réessayer.'; b.disabled = false; b.textContent = c.connecte ? 'Gérer / compléter mon compte' : 'Connecter Stripe'; }
    };
  }

  /* ---------- Retrait ---------- */
  function ecranRetrait() {
    const d = D, solde = soldeRetirable(d);
    const peut = !!(d.connect && d.connect.payouts_enabled);
    const retraits = d.retraits || [];
    const formulaire = !peut
      ? `<div class="empty" style="padding:8px 0"><b>Retrait pas encore possible</b>${!d.connect ? 'Connectez d’abord votre initiative à Stripe (onglet « Comptes »).' : 'Votre compte Stripe doit être entièrement activé (virements) avant de pouvoir retirer des fonds.'}</div>
         <a class="btn out block" href="#/centrefinancier/comptes">Aller aux comptes de réception</a>`
      : `<div class="cf-f"><label for="cf-montant">Montant à retirer (€)</label>
         <input type="number" id="cf-montant" inputmode="decimal" min="0" max="${esc(String(solde))}" step="0.01" placeholder="0,00" autocomplete="off"></div>
         <p id="cf-rerr" class="cf-err" role="alert"></p>
         <button class="btn block" id="cf-retirer">Retirer ce montant</button>
         <button class="btn out block" id="cf-tout" style="margin-top:10px"${solde > 0 ? '' : ' disabled'}>Retirer tout le solde retirable</button>
         <p class="cf-note">Virement Stripe réel, délai estimé 2 à 7 jours ouvrés selon le pays. Aucun frais Diaspo’Actif supplémentaire sur le retrait.</p>`;
    const histo = retraits.length
      ? `<div class="cf-card" style="padding:4px 14px">${retraits.map(r => `<div class="cf-tx"><div class="sp"><div style="font-weight:700">${esc(eur(r.montant))}</div><div class="small muted">${esc(dateHeure(r.created_at))}</div>
          ${r.erreur_msg ? `<div class="small" style="color:var(--red)">${esc(r.erreur_msg)}</div>` : r.stripe_transfer_id ? `<div class="small muted ell">${esc(r.stripe_transfer_id)}</div>` : ''}</div>${pastille(r.statut)}</div>`).join('')}</div>`
      : `<div class="empty"><div class="ei">${ic('clock', 'l')}</div><b>Aucun retrait</b>Vos retraits apparaîtront ici.</div>`;
    setPane(NOM, `${entete('retrait')}
      <div class="cf-card"><h3>Demander un retrait</h3>
        <div class="kv"><span>Solde retirable</span><span><b>${esc(eur(solde))}</b></span></div>
        ${d.solde_en_reserve > 0 ? `<div class="kv"><span>En réserve (${esc(String(d.reserve_jours))} jours)</span><span>${esc(eur(d.solde_en_reserve))}</span></div>` : ''}
        ${formulaire}</div>
      <div class="h2">HISTORIQUE DES RETRAITS</div>${histo}`);
    const b1 = $('#cf-retirer'), b2 = $('#cf-tout');
    if (b1) b1.onclick = () => {
      const v = parseFloat(String($('#cf-montant').value).replace(',', '.'));
      const err = $('#cf-rerr');
      if (!(v > 0)) { err.textContent = 'Indiquez un montant valide.'; return; }
      if (v > solde + 0.001) { err.textContent = 'Ce montant dépasse votre solde retirable (' + eur(solde) + ').'; return; }
      err.textContent = ''; confirmerRetrait(Math.round(v * 100) / 100);
    };
    if (b2) b2.onclick = () => confirmerRetrait(solde);
  }

  /* Un retrait est un virement réel : on demande toujours confirmation avant d'envoyer. */
  function confirmerRetrait(montant) {
    const close = openSheet(`<h2 class="cf-sheet-t">Confirmer le retrait ?</h2>
      <p style="margin:0;line-height:1.5">Vous allez retirer <b>${esc(eur(montant))}</b> vers votre compte Stripe Connect. C’est un virement réel, délai estimé 2 à 7 jours ouvrés.</p>
      <p id="cf-serr" class="cf-err" role="alert"></p>
      <button class="btn block" id="cf-ok">Confirmer le retrait de ${esc(eur(montant))}</button>
      <button class="btn out block" id="cf-no" style="margin-top:10px">Annuler</button>`);
    $('#cf-no').onclick = close;
    $('#cf-ok').onclick = async () => {
      const ok = $('#cf-ok'), err = $('#cf-serr'); err.textContent = ''; ok.disabled = true; ok.textContent = 'Un instant…';
      try {
        const r = await api('/api/wallet/withdraw', { method: 'POST', body: { montant } });
        close(); toast('Retrait traité' + (r && r.stripe_transfer_id ? ' (réf. ' + r.stripe_transfer_id + ')' : '') + '.');
        afficher('retrait', true);
      } catch (e) { err.textContent = (e.message || 'Erreur lors du retrait.') + ' Aucun montant n’a été débité si le message indique un refus.'; ok.disabled = false; ok.textContent = 'Confirmer le retrait de ' + eur(montant); }
    };
  }

  /* ---------- Moyens de paiement (cartes) ---------- */
  const MARQUES = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover' };
  async function ecranMoyens(mon) {
    let moyens;
    try { moyens = (await api('/api/paiement/moyens')).moyens || []; }
    catch (e) { if (mon !== jeton || !ici()) return; return erreur(e, () => afficher('moyens', false)); }
    if (mon !== jeton || !ici()) return;
    const liste = moyens.length
      ? `<div class="cf-card" style="padding:4px 14px">${moyens.map(m => `<div class="cf-row"><span class="ic" style="flex:none">${ic('card')}</span><div class="sp"><div style="font-weight:600">${esc(MARQUES[m.brand] || m.brand)} •••• ${esc(m.last4)}</div>
          <div class="small muted">Expire ${esc(String(m.exp_month).padStart(2, '0'))}/${esc(String(m.exp_year).slice(-2))}${m.defaut ? ' · par défaut' : ''}</div></div>
          <button class="btn out sm" style="color:var(--red);border-color:var(--red)" data-sup="${esc(m.id)}" aria-label="Supprimer la carte ${esc(m.last4)}">${ic('trash', 's')}</button></div>`).join('')}</div>`
      : `<div class="empty"><div class="ei">${ic('card', 'l')}</div><b>Aucune carte enregistrée</b>Une carte s’enregistre volontairement lors d’un achat (boutique, billetterie, adhésion).</div>`;
    setPane(NOM, `${entete('moyens')}<p class="cf-note" style="margin:0 2px 12px">Cartes enregistrées volontairement lors d’un achat, pour accélérer vos prochains paiements.</p>${liste}`);
    document.querySelectorAll('[data-sup]').forEach(b => b.onclick = () => {
      const id = b.dataset.sup;
      const close = openSheet(`<h2 class="cf-sheet-t">Supprimer cette carte ?</h2><p style="margin:0;line-height:1.5">Elle ne sera plus proposée pour vos prochains paiements. Vous pourrez la réenregistrer lors d’un prochain achat.</p>
        <p id="cf-serr" class="cf-err" role="alert"></p><button class="btn block cf-danger" id="cf-ok">Supprimer la carte</button><button class="btn out block" id="cf-no" style="margin-top:10px">Garder la carte</button>`);
      $('#cf-no').onclick = close;
      $('#cf-ok').onclick = async () => {
        const ok = $('#cf-ok'), err = $('#cf-serr'); err.textContent = ''; ok.disabled = true; ok.textContent = 'Un instant…';
        try { await api('/api/paiement/moyens/' + encodeURIComponent(id), { method: 'DELETE' }); close(); toast('Carte supprimée.'); afficher('moyens', false); }
        catch (e) { err.textContent = (e.message || 'Une erreur est survenue.') + ' Vous pouvez réessayer.'; ok.disabled = false; ok.textContent = 'Supprimer la carte'; }
      };
    });
  }

  /* ---------- Réglages ---------- */
  function ecranReglages() {
    const s = D.settings || {};
    const opt = (v, lib, cur) => `<option value="${v}"${cur === v ? ' selected' : ''}>${lib}</option>`;
    setPane(NOM, `${entete('reglages')}
      <div class="cf-card cf-f">
        <label for="cf-devise" style="margin-top:0">Devise préférée</label>
        <select id="cf-devise">${['EUR', 'USD', 'GBP', 'XOF', 'MAD', 'CAD'].map(c => opt(c, c, s.devise_preferee || 'EUR')).join('')}</select>
        <label for="cf-freq">Fréquence des virements automatiques</label>
        <select id="cf-freq">${opt('manuel', 'Manuel (je demande moi-même)', s.frequence_auto || 'manuel')}${opt('hebdomadaire', 'Hebdomadaire', s.frequence_auto)}${opt('mensuel', 'Mensuel', s.frequence_auto)}</select>
        <label for="cf-seuil">Seuil minimum avant transfert automatique (€)</label>
        <input type="number" id="cf-seuil" inputmode="decimal" min="0" step="1" value="${esc(String(s.seuil_auto || 0))}">
        <div class="cf-row" style="margin-top:8px"><span class="sp" style="font-weight:700;font-size:13.5px" id="cf-notif-l">Notifications de paiement</span>
          <button type="button" class="cf-sw" role="switch" id="cf-notif" aria-labelledby="cf-notif-l" aria-checked="${s.notifications ? 'true' : 'false'}"><i></i></button></div>
      </div>
      <p id="cf-gerr" class="cf-err" role="alert"></p>
      <button class="btn block" id="cf-save">${ic('check', 's')} Enregistrer</button>`);
    const sw = $('#cf-notif'); sw.onclick = () => sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    const b = $('#cf-save');
    b.onclick = async () => {
      const err = $('#cf-gerr'); err.textContent = ''; b.disabled = true;
      const corps = { devise_preferee: $('#cf-devise').value, frequence_auto: $('#cf-freq').value, seuil_auto: parseFloat($('#cf-seuil').value) || 0, notifications: sw.getAttribute('aria-checked') === 'true' };
      try { await api('/api/wallet/settings', { method: 'PUT', body: corps }); D.settings = Object.assign({}, D.settings, corps, { notifications: corps.notifications ? 1 : 0 }); toast('Préférences enregistrées.'); }
      catch (e) { err.textContent = (e.message || 'Enregistrement impossible.') + ' Vous pouvez réessayer.'; }
      b.disabled = false;
    };
  }

  window.MMods.centrefinancier = function (b) {
    /* Entrée depuis le menu (aucun sous-écran) : on relit toujours des données fraîches. */
    const onglet = ['comptes', 'retrait', 'moyens', 'reglages'].includes(b) ? b : 'revenus';
    return afficher(onglet, !b || !D);
  };
})();
