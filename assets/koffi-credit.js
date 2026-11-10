/* ═════════════════════════════════════════════════
   assets/koffi-credit.js — KOFFI : LE CRÉDIT (portefeuille unique en euros), partagé par tous les écrans Koffi (2026-10-31)
   ═════════════════════════════════════════════════
   Un SEUL solde pour tout Koffi (tuteur des formations, assistant de création, conseiller de l'Annuaire), site ET appli téléphone.
   Autonome (CSS injecté, préfixe .kcr-). Toutes les règles sont décidées par le SERVEUR (/api/kofi/portefeuille) : ici on ne fait qu'afficher et ouvrir le paiement.

   KoffiCredit.appliquer(bouton, pf, lg, cle)   → écrit le solde dans une pastille CLIQUABLE (couleur : normal / bas / épuisé / illimité)
   KoffiCredit.libelle(pf, lg)             → texte court du solde (« 0,48 € », « 12 questions offertes », « Illimité »)
   KoffiCredit.ouvrir({ lg, page, formationId, pf })   → fenêtre du crédit : solde détaillé, alerte, offres de recharge, consentement, paiement Stripe
                                              page : 'telephone' | 'annuaire' | 'evenements' | 'createur' | (rien = page de la formation) — destination connue de retour après paiement
   KoffiCredit.retourPaiement({ lg, onFin })  → à appeler au chargement d'une page : traite ?kofi=succes|annule au retour de Stripe (attend le crédit par le webhook)
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KoffiCredit) return;

  var TXT = {
    fr: {
      titre: 'Votre crédit Koffi', fermer: 'Fermer', illimite: 'Illimité', illimiteTexte: 'Votre compte n\'a aucune limite d\'utilisation de Koffi : rien n\'est décompté.',
      offerte: function (n) { return n + ' question' + (n > 1 ? 's' : '') + ' offerte' + (n > 1 ? 's' : ''); },
      approx: function (n) { return '≈ ' + n + ' question' + (n > 1 ? 's' : ''); },
      aria: function (l) { return 'Crédit Koffi : ' + l + '. Ouvrir le détail et recharger.'; }, titrePastille: 'Votre crédit Koffi — cliquez pour le détail et la recharge',
      solde: 'Solde disponible', mois: function (v, tot, date) { return 'Crédit du mois : ' + v + ' sur ' + tot + (date ? ' — renouvelé le ' + date : ''); },
      achete: function (v, date) { return 'Crédit acheté : ' + v + (date ? ' — valable jusqu\'au ' + date : ''); },
      offertes: function (r, t) { return 'Questions offertes : ' + r + ' sur ' + t + ' (elles ne sont pas renouvelées)'; },
      equiv: function (e) { return '≈ ' + e.eleve + ' questions de cours · ' + e.createur + ' messages à l\'assistant de création · ' + e.annuaire + ' recherches dans l\'Annuaire'; },
      bas: 'Crédit bas : pensez à recharger pour ne pas être interrompu.', epuise: 'Crédit épuisé : rechargez pour continuer à utiliser Koffi.',
      reserve: 'Le crédit offert du mois est momentanément suspendu. Vous pouvez recharger pour continuer.',
      sansPremium: 'Sans Premium : 15 questions offertes une seule fois, puis recharge. Le crédit offert chaque mois est réservé aux comptes Premium.',
      gratuit: 'Poser une question sur ce que sait faire Koffi est toujours gratuit.',
      rechargeTitre: 'Recharger', rechargeRegle: function (min, ratio, mois) { return 'À partir de ' + min + '. Vous payez ' + min + ' et votre compte reçoit ' + min.replace(/[\d,]+/, function (m) { return String(Math.round(parseFloat(m.replace(',', '.')) / ratio * 100) / 100).replace('.', ','); }) + ' d\'utilisation Koffi, utilisable partout dans Koffi, valable ' + mois + ' mois.'; },
      offre: function (p, c) { return 'Payer ' + p + ' → ' + c + ' d\'utilisation'; }, nonRemb: 'Achat définitif : aucun remboursement.',
      indispo: 'La recharge n\'est pas disponible pour le moment.',
      etats: { majorite: 'Confirmez d\'abord avoir 18 ans ou plus (dans la fenêtre de Koffi).', mineur: 'Koffi est réservé aux personnes de 18 ans ou plus.', pays: 'Koffi n\'est pas disponible dans votre pays pour le moment.', desactive: 'Koffi est désactivé pour le moment.', indisponible: 'Koffi est épuisé pour le moment : l\'équipe le recharge, la recharge reprend dès que possible.' },
      ouverture: 'Ouverture du paiement sécurisé…', erreur: 'Une erreur est survenue. Réessayez.', chargement: 'Chargement…', cgv: 'Conditions de vente', conf: 'Confidentialité',
      titreRecharge: function (c) { return 'Koffi — recharge de ' + c + ' d\'utilisation'; },
      retourRecu: 'Paiement reçu : votre crédit est en cours d\'ajout…', retourOk: 'Votre crédit est ajouté. Merci !', retourAttente: 'Le crédit peut prendre quelques instants : rouvrez cette page dans une minute.', retourAnnule: 'Paiement annulé : rien n\'a été débité.'
    },
    en: {
      titre: 'Your Koffi credit', fermer: 'Close', illimite: 'Unlimited', illimiteTexte: 'Your account has no limit on Koffi: nothing is deducted.',
      offerte: function (n) { return n + ' free question' + (n > 1 ? 's' : ''); },
      approx: function (n) { return '≈ ' + n + ' question' + (n > 1 ? 's' : ''); },
      aria: function (l) { return 'Koffi credit: ' + l + '. Open details and top up.'; }, titrePastille: 'Your Koffi credit — click for details and top-up',
      solde: 'Available balance', mois: function (v, tot, date) { return 'This month\'s credit: ' + v + ' of ' + tot + (date ? ' — renews on ' + date : ''); },
      achete: function (v, date) { return 'Purchased credit: ' + v + (date ? ' — valid until ' + date : ''); },
      offertes: function (r, t) { return 'Free questions: ' + r + ' of ' + t + ' (they are not renewed)'; },
      equiv: function (e) { return '≈ ' + e.eleve + ' course questions · ' + e.createur + ' course-creation messages · ' + e.annuaire + ' Directory searches'; },
      bas: 'Low credit: consider topping up so you are not interrupted.', epuise: 'Credit used up: top up to keep using Koffi.',
      reserve: 'The monthly free credit is temporarily suspended. You can top up to continue.',
      sansPremium: 'Without Premium: 15 free questions, once, then top-up. The monthly free credit is reserved for Premium accounts.',
      gratuit: 'Asking what Koffi can do is always free.',
      rechargeTitre: 'Top up', rechargeRegle: function (min, ratio, mois) { return 'From ' + min + '. You pay ' + min + ' and your account receives ' + min.replace(/[\d,.]+/, function (m) { return String(Math.round(parseFloat(m.replace(',', '.')) / ratio * 100) / 100); }) + ' of Koffi use, usable everywhere in Koffi, valid for ' + mois + ' months.'; },
      offre: function (p, c) { return 'Pay ' + p + ' → ' + c + ' of use'; }, nonRemb: 'Final purchase: no refund.',
      indispo: 'Top-up is not available at the moment.',
      etats: { majorite: 'Please first confirm you are 18 or older (in the Koffi window).', mineur: 'Koffi is reserved for people aged 18 or older.', pays: 'Koffi is not available in your country for now.', desactive: 'Koffi is turned off for now.', indisponible: 'Koffi has run out for now: the team is topping it up, and top-ups resume as soon as possible.' },
      ouverture: 'Opening secure payment…', erreur: 'Something went wrong. Please try again.', chargement: 'Loading…', cgv: 'Terms of sale', conf: 'Privacy',
      titreRecharge: function (c) { return 'Koffi — ' + c + ' of use'; },
      retourRecu: 'Payment received: your credit is being added…', retourOk: 'Your credit has been added. Thank you!', retourAttente: 'Crediting can take a moment: reopen this page in a minute.', retourAnnule: 'Payment cancelled: nothing was charged.'
    }
  };
  var CSS = [
    '.kcr-fond{position:fixed;inset:0;z-index:100000;background:rgba(6,10,20,.72);display:flex;align-items:center;justify-content:center;padding:14px;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}',
    '.kcr-carte{width:min(480px,100%);max-height:92vh;overflow:auto;box-sizing:border-box;background:#fff;color:#14213d;border-radius:18px;padding:20px 18px 16px;box-shadow:0 24px 60px rgba(0,0,0,.45);font-family:inherit;text-align:left;line-height:1.45}',
    /* Fenêtre CLAIRE ajoutée au <body> : encres posées avec !important (un thème sombre rendrait titres et textes blanc sur blanc). */
    '.kcr-carte,.kcr-carte *{box-sizing:border-box}.kcr-carte h2,.kcr-carte h3{margin:0;color:#14213d!important}.kcr-carte p,.kcr-carte li,.kcr-carte div,.kcr-carte span,.kcr-carte label{color:#14213d}',
    '.kcr-tete{display:flex;align-items:center;gap:10px;margin-bottom:10px}.kcr-tete h2{flex:1;font-size:19px;font-weight:800}',
    '.kcr-x{border:1.5px solid #cbd5e1;background:#fff;color:#14213d!important;border-radius:10px;width:36px;height:36px;font:800 16px inherit;cursor:pointer}',
    '.kcr-solde{background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:14px;padding:12px 14px;margin-bottom:10px}',
    '.kcr-solde small{display:block;color:#475569!important;font-size:12px;font-weight:700;letter-spacing:.02em;text-transform:uppercase}',
    '.kcr-solde b{display:block;font-size:30px;line-height:1.15;color:#0D2B4E!important;font-weight:900}',
    '.kcr-solde.bas b{color:#b45309!important}.kcr-solde.epuise b{color:#b91c1c!important}.kcr-solde.illimite b{color:#166534!important}',
    '.kcr-lignes{margin:0 0 10px;padding:0;list-style:none;font-size:13.5px}.kcr-lignes li{margin:3px 0;color:#334155!important}.kcr-lignes li.eq{font-size:12px;color:#64748b!important}',
    '.kcr-alerte{margin:0 0 10px;padding:9px 12px;border-radius:12px;font-size:13.5px;font-weight:700}',
    '.kcr-alerte.bas{background:#fffbeb;border:1.5px solid #fde68a;color:#92400e!important}.kcr-alerte.epuise{background:#fef2f2;border:1.5px solid #fecaca;color:#991b1b!important}.kcr-alerte.info{background:#eff6ff;border:1.5px solid #bfdbfe;color:#1e3a8a!important}',
    '.kcr-note{margin:0 0 10px;font-size:12.5px;color:#475569!important}',
    '.kcr-rech h3{font-size:15px;margin:4px 0 4px}.kcr-rech p{margin:0 0 8px;font-size:13px;color:#334155!important}',
    '.kcr-offres{display:flex;flex-direction:column;gap:8px}',
    '.kcr-offre{min-height:46px;border-radius:12px;border:1.5px solid #b84c1a;background:#fff;color:#7c2d12!important;font:800 15px inherit;font-family:inherit;cursor:pointer;padding:8px 12px;text-align:left}',
    '.kcr-offre:hover{background:#fff7ed}.kcr-offre:disabled{opacity:.5;cursor:not-allowed}.kcr-offre:focus-visible,.kcr-x:focus-visible,.kcr-lien:focus-visible{outline:2px solid #1e4f8a;outline-offset:2px}',
    '.kcr-msg{margin:8px 0 0;font-size:13px;color:#7c2d12!important;font-weight:700}',
    '.kcr-pied{margin-top:12px;display:flex;gap:14px;flex-wrap:wrap;font-size:12px}.kcr-lien{color:#1e4f8a!important;text-decoration:underline}',
    /* La pastille (posée par chaque écran Koffi) : un bouton qui ressemble à une étiquette de solde. */
    '.kcr-pastille{border:1.5px solid rgba(13,43,78,.35);background:#fff;color:#0D2B4E;border-radius:99px;padding:2px 10px;font:800 11.5px inherit;font-family:inherit;cursor:pointer;white-space:nowrap}',
    '.kcr-pastille:hover{background:#eff6ff}.kcr-pastille:focus-visible{outline:2px solid #F26422;outline-offset:2px}',
    '.kcr-pastille.kcr-bas{background:#fffbeb;border-color:#f59e0b;color:#92400e}.kcr-pastille.kcr-epuise{background:#fef2f2;border-color:#ef4444;color:#991b1b}.kcr-pastille.kcr-illimite{background:#f0fdf4;border-color:#22c55e;color:#166534}',
    '@media (prefers-reduced-motion:no-preference){.kcr-fond{animation:kcf .15s ease-out}@keyframes kcf{from{opacity:0}to{opacity:1}}}'
  ].join('\n');

  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var T = function (lg) { return TXT[lg === 'en' ? 'en' : 'fr']; };
  function css() { if (document.getElementById('kcr-css')) return; var st = document.createElement('style'); st.id = 'kcr-css'; st.textContent = CSS; document.head.appendChild(st); }
  function euros(v, lg) { var n = Math.round(Number(v) * 100) / 100; var s = (n % 1 ? n.toFixed(2) : String(n)); return lg === 'en' ? '€' + s : s.replace('.', ',') + ' €'; }
  /* Pour les petits montants (solde réel, en centièmes) : toujours 2 décimales. */
  function eurosFixes(v, lg) { var s = (Math.max(0, Number(v) || 0)).toFixed(2); return lg === 'en' ? '€' + s : s.replace('.', ',') + ' €'; }
  function date(v, lg, avecAnnee) {
    if (!v) return '';
    var d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? v + 'T12:00:00' : String(v).replace(' ', 'T') + 'Z'); if (isNaN(d)) return '';
    try {
      var s = d.toLocaleDateString(lg === 'en' ? 'en-GB' : 'fr-FR', avecAnnee ? { day: 'numeric', month: 'numeric', year: 'numeric' } : { day: 'numeric', month: 'long' });
      return lg !== 'en' && !avecAnnee ? s.replace(/^1 /, '1er ') : s;   /* « 1er décembre », pas « 1 décembre » */
    } catch (e) { return ''; }
  }
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); });
  }

  /* Niveau d'alerte du solde : illimite | epuise | bas | ok (les questions offertes comptent comme un solde utilisable). */
  function niveau(pf) {
    if (!pf) return 'ok';
    if (pf.illimite) return 'illimite';
    var off = pf.offertes && Number(pf.offertes.restantes) > 0;
    if (pf.epuise && !off) return 'epuise';
    if (pf.bas && !off) return 'bas';
    return 'ok';
  }
  /* `cle` : sorte d'usage utilisée pour estimer le nombre d'utilisations restantes (eleve | createur | annuaire ; annuaire par défaut : recherches, événements, Business Plan). */
  function libelle(pf, lg, cle) {
    var t = T(lg);
    if (!pf) return '';
    if (pf.illimite) return t.illimite;
    var off = pf.offertes && Number(pf.offertes.restantes) > 0 ? t.offerte(Number(pf.offertes.restantes)) : '';
    var eu = Number(pf.solde_eur) >= 0.01 ? eurosFixes(pf.solde_eur, lg) : '';
    /* Le nombre d'utilisations restantes est toujours visible : questions offertes en nombre, solde en euros suivi de son équivalent en questions (estimation). */
    var n = pf.equivalent ? Number(pf.equivalent[cle || 'annuaire']) : 0;
    if (eu && n >= 1) eu += ' (' + t.approx(n) + ')';
    if (off && eu) return off + ' + ' + eu;
    return off || eu || eurosFixes(0, lg);
  }
  function appliquer(el, pf, lg, cle) {
    if (!el) return;
    css();
    var l = libelle(pf, lg, cle), t = T(lg), n = niveau(pf);
    el.textContent = l; el.className = (el.className || '').replace(/\bkcr-(pastille|bas|epuise|illimite|ok)\b/g, '').trim() + ' kcr-pastille' + (n === 'ok' ? '' : ' kcr-' + n);
    el.setAttribute('aria-label', t.aria(l)); el.title = t.titrePastille; el.setAttribute('data-kc', n);
  }

  var fondOuvert = null, precedent = null;
  function fermer() {
    if (!fondOuvert) return;
    document.removeEventListener('keydown', surTouche, true);
    fondOuvert.remove(); fondOuvert = null;
    try { if (precedent && precedent.focus) precedent.focus(); } catch (e) { /* sans importance */ }
  }
  function surTouche(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); return; }
    if (e.key !== 'Tab' || !fondOuvert) return;
    var f = Array.prototype.filter.call(fondOuvert.querySelectorAll('button:not([disabled]),a[href]'), function (x) { return x.offsetParent !== null; });
    if (!f.length) return;
    var i = f.indexOf(document.activeElement), suivant = e.shiftKey ? (i <= 0 ? f[f.length - 1] : f[i - 1]) : (i === -1 || i === f.length - 1 ? f[0] : f[i + 1]);
    e.preventDefault(); suivant.focus();
  }
  function chargerConsentement() {
    if (window.FormationConsent) return Promise.resolve();
    return new Promise(function (ok) { var sc = document.createElement('script'); sc.src = '/assets/formation-achat-consent.js?v=2'; sc.onload = ok; sc.onerror = ok; document.head.appendChild(sc); });
  }

  function contenu(d, o) {
    var lg = o.lg, t = T(lg), pf = d.portefeuille || {}, rc = d.recharge || {}, rg = pf.recharge || { offres: [], min_eur: 3, ratio: 3, validite_mois: 12 };
    var n = niveau(pf), h = '';
    h += '<div class="kcr-tete"><h2 id="kcr-titre">' + t.titre + '</h2><button type="button" class="kcr-x" data-kcr-act="fermer" aria-label="' + t.fermer + '">✕</button></div>';
    h += '<div class="kcr-solde ' + n + '"><small>' + t.solde + '</small><b>' + esc(libelle(Object.assign({}, pf, { equivalent: null }), lg)) + '</b></div>';
    if (pf.illimite) { h += '<p class="kcr-note">' + t.illimiteTexte + '</p>'; }
    else {
      h += '<ul class="kcr-lignes">';
      if (pf.premium) h += '<li>' + esc(t.mois(eurosFixes(pf.mensuel_restant_eur, lg), euros(pf.mensuel_eur, lg), date(pf.renouvelle_le, lg))) + '</li>';
      if (Number(pf.achete_restant_eur) > 0) h += '<li>' + esc(t.achete(eurosFixes(pf.achete_restant_eur, lg), date(pf.achete_expire, lg, true))) + '</li>';
      if (pf.offertes) h += '<li>' + esc(t.offertes(Number(pf.offertes.restantes), Number(pf.offertes.total))) + '</li>';
      if (pf.equivalent && Number(pf.solde_eur) >= 0.01) h += '<li class="eq">' + esc(t.equiv(pf.equivalent)) + '</li>';
      h += '</ul>';
      if (n === 'epuise') h += '<div class="kcr-alerte epuise" role="status">' + t.epuise + '</div>';
      else if (n === 'bas') h += '<div class="kcr-alerte bas" role="status">' + t.bas + '</div>';
      if (pf.premium && pf.reserve_basse) h += '<div class="kcr-alerte info">' + t.reserve + '</div>';
      if (!pf.premium) h += '<p class="kcr-note">' + t.sansPremium + '</p>';
    }
    h += '<p class="kcr-note">✓ ' + t.gratuit + '</p>';
    h += '<div class="kcr-rech"><h3>' + t.rechargeTitre + '</h3>';
    if (rc.achetable === false || !(rg.offres && rg.offres.length)) {
      h += '<p>' + esc((t.etats && t.etats[d.etat]) || t.indispo) + '</p>';
    } else {
      h += '<p>' + esc(t.rechargeRegle(euros(rg.min_eur, lg), Number(rg.ratio) || 3, rg.validite_mois || 12)) + ' ' + t.nonRemb + '</p><div class="kcr-offres">';
      rg.offres.forEach(function (of) { h += '<button type="button" class="kcr-offre" data-kcr-act="payer" data-paye="' + esc(of.paye_eur) + '" data-credit="' + esc(of.credit_eur) + '">' + esc(t.offre(euros(of.paye_eur, lg), euros(of.credit_eur, lg))) + '</button>'; });
      h += '</div><div class="kcr-msg" role="status" aria-live="polite" id="kcr-msg"></div>';
    }
    h += '</div><div class="kcr-pied"><a class="kcr-lien" href="/cgv.html#koffi-non-remboursable" target="_blank" rel="noopener">' + t.cgv + '</a><a class="kcr-lien" href="/politique-confidentialite.html#koffi" target="_blank" rel="noopener">' + t.conf + '</a></div>';
    return h;
  }

  function ouvrir(o) {
    o = o || {}; o.lg = o.lg === 'en' ? 'en' : 'fr';
    css(); fermer();
    precedent = document.activeElement;
    var fond = document.createElement('div'); fond.className = 'kcr-fond';
    fond.innerHTML = '<div class="kcr-carte" role="dialog" aria-modal="true" aria-labelledby="kcr-titre"><div class="kcr-tete"><h2 id="kcr-titre">' + T(o.lg).titre + '</h2></div><p class="kcr-note" role="status">' + T(o.lg).chargement + '</p></div>';
    document.body.appendChild(fond); fondOuvert = fond;
    document.addEventListener('keydown', surTouche, true);
    fond.addEventListener('mousedown', function (e) { if (e.target === fond) fermer(); });
    var carte = fond.querySelector('.kcr-carte');
    function dessiner(d) {
      carte.innerHTML = contenu(d, o);
      var x = carte.querySelector('[data-kcr-act="fermer"]'); if (x) x.focus();
      carte.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-kcr-act]') : null; if (!b) return;
        if (b.getAttribute('data-kcr-act') === 'fermer') return fermer();
        if (b.getAttribute('data-kcr-act') === 'payer') payer(d, Number(b.getAttribute('data-paye')), Number(b.getAttribute('data-credit')), carte);
      });
    }
    function payer(d, paye, credit, carte2) {
      var t = T(o.lg), msg = carte2.querySelector('#kcr-msg');
      var boutons = carte2.querySelectorAll('.kcr-offre'); boutons.forEach(function (b) { b.disabled = true; });
      var libre = function (texte) { boutons.forEach(function (b) { b.disabled = false; }); if (msg) msg.textContent = texte || ''; };
      chargerConsentement().then(function () {
        if (!window.FormationConsent) return false;
        /* Les deux textes viennent du serveur (source unique) ; la case à cocher exigée ici est aussi exigée par le serveur (409 sans elle). */
        return window.FormationConsent.demander({ titre: t.titreRecharge(euros(credit, o.lg)), prix: paye, texte: (d.recharge || {}).texte, retractation: (d.recharge || {}).retractation });
      }).then(function (accepte) {
        if (!accepte) return libre('');
        if (msg) msg.textContent = t.ouverture;
        return api('POST', '/api/kofi/portefeuille/recharger', { montant_eur: paye, accepte_non_remboursable: true, page: o.page || undefined, formation_id: o.formationId || undefined, plan_id: o.planId || undefined }).then(function (r) {
          if (r.ok && r.data && r.data.checkout_url) { location.href = r.data.checkout_url; return; }
          libre((r.data && r.data.error) || t.erreur);
        });
      }).catch(function () { libre(t.erreur); });
    }
    return api('GET', '/api/kofi/portefeuille').then(function (r) {
      if (!fondOuvert) return;
      if (!r.ok) { carte.innerHTML = '<div class="kcr-tete"><h2 id="kcr-titre">' + T(o.lg).titre + '</h2><button type="button" class="kcr-x" data-kcr-act="fermer" aria-label="' + T(o.lg).fermer + '">✕</button></div><p class="kcr-note" role="alert">' + esc((r.data && r.data.error) || T(o.lg).erreur) + '</p>'; carte.querySelector('.kcr-x').addEventListener('click', fermer); return; }
      dessiner(r.data);
    }).catch(function () { if (fondOuvert) carte.innerHTML = '<p class="kcr-note" role="alert">' + T(o.lg).erreur + '</p>'; });
  }

  /* Retour de Stripe (?kofi=succes|annule) : le crédit arrive par le webhook, quelques secondes plus tard — on interroge l'état du DERNIER ACHAT jusqu'à le voir payé. */
  function retourPaiement(o) {
    o = o || {}; var lg = o.lg === 'en' ? 'en' : 'fr', t = T(lg);
    var p = new URLSearchParams(location.search), k = p.get('kofi'); if (!k) return false;
    try { p.delete('kofi'); var q = p.toString(); history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (e) { /* sans importance */ }
    if (k === 'annule') { if (o.onFin) o.onFin('annule', t.retourAnnule); return true; }
    if (o.onFin) o.onFin('attente', t.retourRecu);
    var essais = 0;
    (function boucle() {
      api('GET', '/api/kofi/portefeuille').then(function (r) {
        var st = r.ok && r.data && r.data.achat && r.data.achat.statut;
        if (st === 'payee' || st === 'expiree' || ++essais >= 12) { if (o.onFin) o.onFin(st === 'payee' ? 'ok' : 'tard', st === 'payee' ? t.retourOk : t.retourAttente, r.data && r.data.portefeuille); }
        else setTimeout(boucle, 2500);
      }).catch(function () { if (++essais >= 12) { if (o.onFin) o.onFin('tard', t.retourAttente); } else setTimeout(boucle, 2500); });
    })();
    return true;
  }

  window.KoffiCredit = { appliquer: appliquer, libelle: libelle, niveau: niveau, ouvrir: ouvrir, fermer: fermer, retourPaiement: retourPaiement };
})();
