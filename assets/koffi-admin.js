/* ═════════════════════════════════════════════════
   assets/koffi-admin.js — KOFFI, ASSISTANT DE L'ADMINISTRATEUR : bouton flottant + fenêtre de discussion (2026-11-01)
   ═════════════════════════════════════════════════
   Autonome (CSS injecté, préfixe .kad-) : KoffiAdmin.monter()
   L'administrateur parle à Koffi : questions de chiffres, « ouvre-moi tel module », préparation d'une notification aux membres, rappels, et tâches
   PROGRAMMÉES à une heure donnée (heure de Paris). Pour chaque tâche, l'administrateur choisit :
     🤖 Autonomie     — Koffi l'exécute seul à l'heure dite, sans validation ;
     ✋ Je valide      — Koffi prépare, l'administrateur est prévenu à l'heure dite (cloche) et valide lui-même.
   Toutes les règles (rôle administrateur, aperçu des destinataires, plafond de 24 h, revalidation à l'exécution) sont décidées par le SERVEUR
   (/api/kofi/admin/*) : ici on n'affiche que ce qu'il renvoie. Rien n'apparaît pour un compte qui n'est pas administrateur (le serveur répond 401/403).
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KoffiAdmin) return;

  var T = {
    nom: 'Koffi', sous: 'Assistant de l\'administrateur', ouvrir: 'Demander à Koffi', fermer: 'Fermer', nouvelle: 'Nouvelle discussion', taches: 'Mes tâches programmées',
    supprimer: 'Supprimer cette conversation', confirmSuppr: 'Supprimer cette conversation ? Les tâches déjà créées restent dans « Mes tâches ».',
    placeholder: 'Que puis-je faire pour vous ?', envoyer: 'Envoyer', reflechit: 'Koffi réfléchit…',
    accueil: 'Bonjour ! Je suis Koffi, votre assistant. Je peux vous donner les chiffres de la plateforme, vous ouvrir un module, préparer une notification aux membres ou vous rappeler quelque chose — tout de suite ou à l\'heure que vous voulez. Pour chaque tâche, vous choisissez : j\'agis seul (Autonomie) ou je prépare et c\'est vous qui validez.',
    suggestions: ['Que sais-tu faire ?', 'Combien de nouveaux comptes cette semaine ?', 'Ouvre-moi Budget IA', 'Rappelle-moi demain à 8 h de vérifier les paiements'],
    info1: 'Koffi ne lit que des chiffres globaux de la plateforme (aucun nom, aucun e-mail) et vos propres messages. Il ne peut agir que par les actions prévues ci-dessous, et chacune est contrôlée par le serveur.',
    info2: 'Une notification aux membres est toujours prévisualisée (nombre de destinataires) ; chaque compte en reçoit au plus une par 24 h. Vous choisissez à chaque fois : Autonomie (Koffi envoie seul à l\'heure dite) ou Je valide (vous validez vous-même).',
    info3: 'Vos messages sont envoyés à notre prestataire d\'intelligence artificielle, Anthropic Ireland (transferts possibles hors de l\'Union européenne). Ne saisissez pas de données personnelles de membres. Les conversations sont conservées 60 jours ; l\'historique des tâches est conservé comme trace.',
    compris: 'J\'ai compris', maintenant: 'Maintenant', programmer: 'Programmer', quand: 'Jour et heure (heure de Paris)', exec: '✅ Exécuter maintenant', valider: '✅ Valider et exécuter', annuler: 'Annuler la tâche',
    auto: '🤖 Autonomie', moi: '✋ Je valide moi-même', autoAide: 'Koffi l\'exécutera seul à l\'heure dite.', moiAide: 'Vous serez prévenu à l\'heure dite et vous validerez.',
    voirModule: 'Ouvrir', moduleIntrouvable: 'Je ne retrouve pas ce module dans le menu de cette page.', aucuneTache: 'Aucune tâche pour le moment.', retour: '← Retour à la discussion',
    majTitre: 'Koffi est réservé aux personnes majeures', majTexte: 'Pour utiliser Koffi, confirmez que vous avez 18 ans ou plus.', majCase: 'Je confirme avoir 18 ans ou plus', majBtn: 'Confirmer',
    pays: 'Koffi n\'est pas disponible dans votre pays pour le moment.', mineur: 'Koffi est réservé aux personnes de 18 ans ou plus.', desactive: 'Koffi est désactivé pour le moment.', indisponible: 'Koffi est momentanément indisponible. Réessayez un peu plus tard.',
    erreur: 'Une erreur est survenue. Réessayez.', trop: 'Doucement : patientez quelques secondes avant le message suivant.', heureManquante: 'Choisissez le jour et l\'heure.',
    statuts: { proposee: 'À décider', a_valider: '✋ À valider', planifiee: '🤖 Programmée (autonome)', planifiee_validation: '✋ Programmée (vous validez)', en_cours: '⏳ En cours', executee: '✅ Exécutée', echec: '⚠️ Échec', annulee: 'Annulée' }
  };

  var CSS = [
    '.kad-root,.kad-root *{box-sizing:border-box}',
    '.kad-root{position:fixed;right:22px;bottom:22px;z-index:9000;font-family:inherit;color:#0f172a;line-height:1.45}',
    '.kad-btn{position:relative;display:flex;align-items:center;gap:10px;border:0;cursor:pointer;background:#0D2B4E;color:#fff;border-radius:999px;padding:5px 18px 5px 5px;box-shadow:0 8px 26px rgba(13,43,78,.38),0 0 0 2px #F26422;font:700 14px/1.2 inherit;font-family:inherit}',
    '.kad-btn:hover{transform:translateY(-1px)}.kad-btn:focus-visible{outline:3px solid #F26422;outline-offset:3px}',
    '.kad-btn img{width:46px;height:46px;border-radius:50%;display:block;background:#fff}',
    '.kad-badge{position:absolute;top:-6px;right:-4px;min-width:22px;height:22px;border-radius:99px;background:#dc2626;color:#fff;font:800 12px/22px inherit;font-family:inherit;text-align:center;padding:0 6px;box-shadow:0 0 0 2px #fff}',
    '.kad-panel{position:fixed;right:18px;bottom:18px;width:420px;max-width:calc(100vw - 24px);height:min(700px,calc(100vh - 36px));background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(2,12,27,.45),0 0 0 1px rgba(13,43,78,.15);display:none;flex-direction:column;overflow:hidden;color:#0f172a;text-align:left}',
    '.kad-root.open .kad-panel{display:flex}.kad-root.open .kad-btn{display:none}',
    '.kad-head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#0D2B4E;flex:none}',
    '.kad-head img{width:42px;height:42px;border-radius:50%;background:#fff;flex:none}',
    '.kad-t{flex:1;min-width:0}.kad-t b{display:block;font-size:16px;color:#fff}.kad-t span{display:block;font-size:11.5px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.kad-t .kad-credit{margin-top:3px;max-width:100%;overflow:hidden;text-overflow:ellipsis}',
    '.kad-ic{position:relative;border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:9px;min-width:34px;height:34px;cursor:pointer;font:700 14px inherit;font-family:inherit;padding:0 8px}',
    '.kad-ic:hover{background:rgba(255,255,255,.24)}.kad-ic:focus-visible{outline:2px solid #F26422}',
    '.kad-ic .kad-badge{top:-7px;right:-6px;min-width:18px;height:18px;font-size:11px;line-height:18px}',
    '.kad-body{flex:1;overflow-y:auto;padding:14px;background:#f1f5f9;display:flex;flex-direction:column;gap:10px}',
    '.kad-msg{max-width:92%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}',
    '.kad-msg.u{align-self:flex-end;background:#0D2B4E;color:#fff;border-bottom-right-radius:4px}',
    '.kad-msg.a{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-bottom-left-radius:4px}',
    '.kad-note{margin-top:6px;font-size:11.5px;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:5px 8px;white-space:normal;font-weight:700}',
    '.kad-typing{align-self:flex-start;color:#475569;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:8px 12px}',
    '.kad-sug{display:flex;flex-wrap:wrap;gap:6px}.kad-sug button{background:#fff;border:1px solid #cbd5e1;border-radius:99px;padding:6px 11px;font-size:12.5px;cursor:pointer;color:#0D2B4E;text-align:left;font-family:inherit}',
    '.kad-sug button:hover{background:#fff7ed;border-color:#F26422}',
    '.kad-go{align-self:flex-start;border:0;background:#F26422;color:#fff;font:800 13.5px inherit;font-family:inherit;border-radius:10px;padding:8px 14px;cursor:pointer}',
    '.kad-tache{align-self:stretch;background:#fff;border:1.5px solid #cbd5e1;border-radius:14px;padding:12px;font-size:13.5px}',
    '.kad-tache.risque{border-color:#F26422}.kad-tache h5{margin:0 0 4px;font-size:14px;color:#0D2B4E}',
    '.kad-chip{display:inline-block;font-size:11.5px;font-weight:800;border-radius:99px;padding:2px 9px;background:#e2e8f0;color:#334155;margin-bottom:6px}',
    '.kad-chip.ok{background:#dcfce7;color:#166534}.kad-chip.ko{background:#fee2e2;color:#991b1b}.kad-chip.att{background:#fff3e6;color:#9a3412}',
    '.kad-tache p{margin:4px 0;color:#0f172a;white-space:pre-wrap;overflow-wrap:anywhere}.kad-tache small{display:block;color:#475569;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.kad-choix{display:flex;gap:6px;margin:10px 0 6px}.kad-choix button{flex:1;border:1.5px solid #cbd5e1;background:#fff;border-radius:10px;padding:7px 4px;font:700 13px inherit;font-family:inherit;cursor:pointer;color:#0D2B4E}',
    '.kad-choix button[aria-pressed="true"]{border-color:#F26422;background:#F26422;color:#fff}',
    '.kad-quand{display:block;width:100%;margin:6px 0;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font:14px inherit;font-family:inherit;background:#fff;color:#0f172a}',
    '.kad-quand-l{display:block;font-size:12px;color:#475569;font-weight:700}',
    '.kad-modes{display:flex;flex-direction:column;gap:6px;margin-top:6px}',
    '.kad-cta{display:inline-block;border:0;background:#F26422;color:#fff;font-weight:800;padding:9px 14px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:13.5px;text-align:left}',
    '.kad-cta.sec{background:#fff;color:#0D2B4E;border:1.5px solid #0D2B4E}.kad-cta.neutre{background:#fff;color:#64748b;border:1px solid #cbd5e1;font-weight:700}.kad-cta[disabled]{opacity:.55;cursor:not-allowed}',
    '.kad-cta small{display:block;font-weight:600;font-size:11.5px;opacity:.9;margin-top:1px}',
    '.kad-cta:focus-visible,.kad-go:focus-visible,.kad-choix button:focus-visible{outline:3px solid #0D2B4E;outline-offset:2px}',
    '.kad-err{color:#991b1b;font-size:12.5px;font-weight:700;margin-top:6px}',
    '.kad-foot{flex:none;background:#fff;border-top:1px solid #e2e8f0;padding:8px 10px 10px}',
    '.kad-form{display:flex;gap:8px;align-items:flex-end}',
    '.kad-form textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:12px;padding:9px 11px;font:14px/1.4 inherit;font-family:inherit;max-height:110px;min-height:42px;background:#fff;color:#0f172a}',
    '.kad-form textarea:focus{outline:2px solid #F26422;border-color:#F26422}',
    '.kad-send{border:0;background:#F26422;color:#fff;border-radius:12px;height:42px;padding:0 16px;font:800 14px inherit;font-family:inherit;cursor:pointer}.kad-send:disabled{opacity:.5;cursor:not-allowed}',
    '.kad-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;font-size:13.5px;line-height:1.55;color:#0f172a}',
    '.kad-card h4{margin:0 0 6px;font-size:15px;color:#0D2B4E}.kad-card p{margin:0 0 8px}.kad-card ul{margin:8px 0 12px;padding-left:18px}.kad-card li{margin:4px 0}',
    '@media (max-width:560px){.kad-root{right:10px;bottom:calc(10px + env(safe-area-inset-bottom))}.kad-btn .kad-lib{display:none}.kad-btn{padding:4px}.kad-panel{right:0;bottom:0;left:0;width:100%;max-width:none;height:85vh;height:85dvh;border-radius:16px 16px 0 0}.kad-form textarea,.kad-quand{font-size:16px}}',
    '@media (prefers-reduced-motion:no-preference){.kad-btn{transition:transform .15s}}'
  ].join('\n');

  var S = { etat: null, conv: null, msgs: [], taches: [], vue: 'discussion', root: null, occupe: false, minuteur: null };
  var ecouteEchap = false;
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var $ = function (sel) { return S.root.querySelector(sel); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sans importance */ } }
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); });
  }
  function chargerScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (ok) { var sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = ok; document.head.appendChild(sc); });
  }
  function toast(msg) { if (typeof window.showToast === 'function') window.showToast(msg); else window.alert(msg); }

  /* Heure de Paris au format « AAAA-MM-JJTHH:MM » (valeur d'un champ datetime-local), décalée de plus_min minutes. */
  function parisMaintenant(plusMin) {
    var d = new Date(Date.now() + (plusMin || 0) * 60000), p = {};
    new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
  }

  /* ── Crédit : pastille de l'en-tête (un administrateur est illimité : « Illimité ») ── */
  function majMeta() {
    var p = $('.kad-credit'), e = S.etat, pf = e && e.portefeuille;
    if (!p) return;
    p.style.display = pf && window.KoffiCredit ? '' : 'none';
    if (pf && window.KoffiCredit) window.KoffiCredit.appliquer(p, pf, 'fr');
  }
  function majBadge() {
    var n = S.etat ? Number(S.etat.a_valider) || 0 : 0;
    ['.kad-btn', '.kad-ic[data-a="taches"]'].forEach(function (sel) {
      var h = $(sel); if (!h) return;
      var b = h.querySelector('.kad-badge');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'kad-badge'; b.setAttribute('aria-hidden', 'true'); h.appendChild(b); }
      b.textContent = n > 9 ? '9+' : String(n);
    });
    var bt = $('.kad-btn'); if (bt) bt.setAttribute('aria-label', T.ouvrir + (n ? ' — ' + n + ' tâche' + (n > 1 ? 's' : '') + ' à valider' : ''));
  }

  /* ── Ouvrir un module du tableau de bord ── */
  function ouvrirModule(id) {
    var lien = null;
    document.querySelectorAll('a[data-section]').forEach(function (a) { if (!lien && a.getAttribute('data-section') === id) lien = a; });
    if (!lien) { toast(T.moduleIntrouvable); return; }
    if (window.innerWidth <= 560) fermerPanneau();
    lien.click();
    try { lien.scrollIntoView({ block: 'nearest' }); } catch (e) { /* sans importance */ }
  }

  /* ── Cartes de tâches ── */
  function classeStatut(s) { return s === 'executee' ? 'ok' : s === 'echec' ? 'ko' : (s === 'a_valider' || s === 'planifiee' || s === 'planifiee_validation') ? 'att' : ''; }
  function resumeResultat(t) {
    var r = t.resultat || {};
    if (t.statut === 'echec') return t.erreur || 'La tâche n\'a pas pu aboutir.';
    if (t.statut === 'en_cours') return 'Envoi en cours' + (r.envoyes != null ? ' : ' + r.envoyes + ' compte(s) déjà notifié(s), le reste suit.' : '.');
    if (t.statut !== 'executee') return '';
    if (t.type === 'envoyer_notification') return 'Notification envoyée à ' + (r.envoyes != null ? r.envoyes : '?') + ' compte' + (r.envoyes > 1 ? 's' : '') + '.';
    if (t.type === 'rappel') return 'Rappel envoyé dans votre cloche.';
    return 'Tâche exécutée.';
  }
  function carteTache(t) {
    var d = document.createElement('div'); d.className = 'kad-tache' + (t.risque && t.risque !== 'aucun' ? ' risque' : ''); d.setAttribute('data-tache', t.id);
    var statut = T.statuts[t.statut] || t.statut;
    var quand = t.quand_paris && (t.statut === 'planifiee' || t.statut === 'planifiee_validation') ? ' — ' + t.quand_paris : '';
    d.innerHTML = '<span class="kad-chip ' + classeStatut(t.statut) + '">' + esc(statut + quand) + '</span><h5>' + esc(t.libelle) + '</h5>' +
      (t.resume ? '<p>' + esc(t.resume) + '</p>' : '') + (t.detail ? '<small>' + esc(t.detail) + '</small>' : '') +
      (resumeResultat(t) ? '<small>' + esc(resumeResultat(t)) + '</small>' : '') + '<div class="kad-err" role="alert" hidden></div>';
    var zone = document.createElement('div'); d.appendChild(zone);
    if (t.statut === 'proposee') zone.appendChild(formulaireDecision(t, d));
    else if (t.statut === 'a_valider') {
      zone.appendChild(bouton(T.valider, function () { decider(t, { mode: 'a_valider' }, d); }));
      zone.appendChild(document.createTextNode(' ')); zone.appendChild(bouton(T.annuler, function () { annuler(t, d); }, 'neutre'));
    } else if (t.statut === 'planifiee' || t.statut === 'planifiee_validation') zone.appendChild(bouton(T.annuler, function () { annuler(t, d); }, 'neutre'));
    return d;
  }
  function bouton(texte, fn, style, aide) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'kad-cta' + (style ? ' ' + style : '');
    b.innerHTML = esc(texte) + (aide ? '<small>' + esc(aide) + '</small>' : ''); b.addEventListener('click', fn); return b;
  }
  /* Maintenant → un seul bouton ; Programmer → jour/heure puis le choix « Autonomie » / « Je valide moi-même ». */
  function formulaireDecision(t, carte) {
    var f = document.createElement('div'), prog = false;
    var choix = document.createElement('div'); choix.className = 'kad-choix';
    var bM = document.createElement('button'), bP = document.createElement('button');
    bM.type = bP.type = 'button'; bM.textContent = T.maintenant; bP.textContent = T.programmer;
    choix.appendChild(bM); choix.appendChild(bP); f.appendChild(choix);
    var zone = document.createElement('div'); f.appendChild(zone);
    function dessiner() {
      bM.setAttribute('aria-pressed', String(!prog)); bP.setAttribute('aria-pressed', String(prog)); zone.innerHTML = '';
      if (!prog) { zone.appendChild(bouton(T.exec, function () { decider(t, { mode: 'a_valider' }, carte); })); zone.appendChild(document.createTextNode(' ')); zone.appendChild(bouton(T.annuler, function () { annuler(t, carte); }, 'neutre')); return; }
      var l = document.createElement('label'); l.className = 'kad-quand-l'; l.textContent = T.quand;
      var inp = document.createElement('input'); inp.type = 'datetime-local'; inp.className = 'kad-quand'; inp.min = parisMaintenant(1); inp.value = t.quand_saisie || parisMaintenant(60);
      l.appendChild(inp); zone.appendChild(l);
      var m = document.createElement('div'); m.className = 'kad-modes';
      var vers = function (mode) { return function () { if (!inp.value) { afficherErreur(carte, T.heureManquante); return; } decider(t, { mode: mode, quand: inp.value.replace('T', ' ') }, carte); }; };
      var ba = bouton(T.auto, vers('autonome'), 'sec', T.autoAide); if (!t.autonomie_possible) { ba.disabled = true; ba.title = 'Cette action ne peut pas être exécutée sans votre validation.'; }
      m.appendChild(ba); m.appendChild(bouton(T.moi, vers('a_valider'), 'sec', T.moiAide)); m.appendChild(bouton(T.annuler, function () { annuler(t, carte); }, 'neutre'));
      zone.appendChild(m);
    }
    bM.addEventListener('click', function () { prog = false; dessiner(); }); bP.addEventListener('click', function () { prog = true; dessiner(); });
    dessiner(); return f;
  }
  function afficherErreur(carte, msg) { var e = carte.querySelector('.kad-err'); if (!e) return; e.textContent = msg; e.hidden = !msg; }
  function remplacerTache(t) {
    S.taches = S.taches.map(function (x) { return Number(x.id) === Number(t.id) ? t : x; });
    if (!S.taches.some(function (x) { return Number(x.id) === Number(t.id); })) S.taches.unshift(t);
    S.msgs.forEach(function (m) { if (m.taches) m.taches = m.taches.map(function (x) { return Number(x.id) === Number(t.id) ? t : x; }); });
    if (S.etat) S.etat.a_valider = S.taches.filter(function (x) { return x.statut === 'a_valider'; }).length;
    majBadge();
  }
  function decider(t, corps, carte) {
    if (S.occupe) return; S.occupe = true; afficherErreur(carte, '');
    api('POST', '/api/kofi/admin/taches/' + t.id + '/decider', corps).then(function (r) {
      S.occupe = false;
      if (r.ok && r.data.tache) { remplacerTache(r.data.tache); carte.replaceWith(carteTache(r.data.tache)); return; }
      if (r.data && r.data.tache) { remplacerTache(r.data.tache); carte.replaceWith(carteTache(r.data.tache)); return; }
      afficherErreur(carte, (r.data && r.data.error) || T.erreur);
    }).catch(function () { S.occupe = false; afficherErreur(carte, T.erreur); });
  }
  function annuler(t, carte) {
    if (S.occupe) return; S.occupe = true;
    api('POST', '/api/kofi/admin/taches/' + t.id + '/annuler').then(function (r) {
      S.occupe = false;
      if (r.ok) { var t2 = Object.assign({}, t, { statut: 'annulee', quand_paris: null }); remplacerTache(t2); carte.replaceWith(carteTache(t2)); return; }
      afficherErreur(carte, (r.data && r.data.error) || T.erreur);
    }).catch(function () { S.occupe = false; afficherErreur(carte, T.erreur); });
  }

  /* ── Messages ── */
  function ajouterMessage(m) {
    var corps = $('.kad-body');
    var el = document.createElement('div'); el.className = 'kad-msg ' + (m.role === 'user' ? 'u' : 'a'); el.textContent = m.contenu;
    if (m.gratuit) { var n = document.createElement('div'); n.className = 'kad-note'; n.textContent = '✓ Question sur Koffi : gratuite.'; el.appendChild(n); }
    corps.appendChild(el);
    if (m.role !== 'user') {
      if (m.ouvrir && m.ouvrir.section) { var g = document.createElement('button'); g.type = 'button'; g.className = 'kad-go'; g.textContent = '➜ ' + T.voirModule + ' « ' + (m.ouvrir.libelle || m.ouvrir.section) + ' »'; g.addEventListener('click', function () { ouvrirModule(m.ouvrir.section); }); corps.appendChild(g); }
      (m.taches || []).forEach(function (t) { corps.appendChild(carteTache(t)); });
    }
    corps.scrollTop = corps.scrollHeight;
    return el;
  }

  function carte(titre, texte, boutons) {
    var d = document.createElement('div'); d.className = 'kad-card'; d.innerHTML = '<h4>' + esc(titre) + '</h4><p>' + esc(texte) + '</p>';
    (boutons || []).forEach(function (b) { d.appendChild(b); }); return d;
  }
  function carteInfo() {
    var d = document.createElement('div'); d.className = 'kad-card';
    d.innerHTML = '<h4>Koffi, assistant de l\'administrateur</h4><ul><li>' + esc(T.info1) + '</li><li>' + esc(T.info2) + '</li><li>' + esc(T.info3) + '</li></ul>';
    d.appendChild(bouton(T.compris, function () { lsSet('koffi_admin_info_v1', '1'); construireCorps(); })); return d;
  }
  function carteMajorite() {
    var d = carte(T.majTitre, T.majTexte);
    var l = document.createElement('label'); l.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:12px 0 0;cursor:pointer';
    l.innerHTML = '<input type="checkbox" style="margin-top:3px"><span>' + esc(T.majCase) + '</span>';
    var b = bouton(T.majBtn, function () {
      if (S.occupe || !l.querySelector('input').checked) return; S.occupe = true;
      api('POST', '/api/kofi/majorite', { confirme: true }).then(function () { S.occupe = false; return chargerEtat().then(construireCorps); }).catch(function () { S.occupe = false; });
    }); b.disabled = true; b.style.marginTop = '12px';
    l.querySelector('input').addEventListener('change', function (ev) { b.disabled = !ev.target.checked; });
    d.appendChild(l); d.appendChild(b); return d;
  }

  function construireCorps() {
    var body = $('.kad-body'); body.innerHTML = '';
    var foot = $('.kad-foot'), e = S.etat, ta = $('.kad-form textarea');
    foot.style.display = ''; ta.disabled = false; $('.kad-send').disabled = false; majMeta(); majBadge();
    $('[data-a="nouvelle"]').style.display = $('[data-a="supprimer"]').style.display = S.vue === 'discussion' ? '' : 'none';
    if (!e) { body.appendChild(carte('Koffi', T.indisponible)); foot.style.display = 'none'; return; }
    var st = e.etat;
    if (st === 'majorite') { body.appendChild(carteMajorite()); foot.style.display = 'none'; return; }
    if (st === 'mineur' || st === 'pays' || st === 'desactive' || st === 'indisponible') { body.appendChild(carte('Koffi', T[st])); foot.style.display = 'none'; return; }
    if (S.vue === 'taches') {
      foot.style.display = 'none';
      var ret = bouton(T.retour, function () { S.vue = 'discussion'; construireCorps(); }, 'neutre'); ret.style.alignSelf = 'flex-start'; body.appendChild(ret);
      var titre = document.createElement('h4'); titre.style.cssText = 'margin:2px 0;color:#0D2B4E;font-size:15px'; titre.textContent = T.taches; body.appendChild(titre);
      if (!S.taches.length) { var v = document.createElement('div'); v.className = 'kad-card'; v.textContent = T.aucuneTache; body.appendChild(v); }
      S.taches.forEach(function (t) { body.appendChild(carteTache(t)); });
      return;
    }
    if (!lsGet('koffi_admin_info_v1')) { body.appendChild(carteInfo()); foot.style.display = 'none'; return; }
    S.msgs.forEach(ajouterMessage);
    if (!S.msgs.length) {
      ajouterMessage({ role: 'assistant', contenu: T.accueil });
      var s = document.createElement('div'); s.className = 'kad-sug';
      T.suggestions.forEach(function (x) { var b = document.createElement('button'); b.type = 'button'; b.textContent = x; b.addEventListener('click', function () { ta.value = x; envoyer(); }); s.appendChild(b); });
      body.appendChild(s);
    }
    body.scrollTop = body.scrollHeight;
  }

  function traduireUI() {
    $('.kad-t b').textContent = T.nom; $('.kad-t span').textContent = T.sous;
    $('.kad-btn span.kad-lib').textContent = T.nom; $('.kad-btn').title = T.ouvrir;
    $('[data-a="fermer"]').setAttribute('aria-label', T.fermer); $('[data-a="fermer"]').title = T.fermer;
    $('[data-a="nouvelle"]').title = T.nouvelle; $('[data-a="nouvelle"]').setAttribute('aria-label', T.nouvelle);
    $('[data-a="supprimer"]').title = T.supprimer; $('[data-a="supprimer"]').setAttribute('aria-label', T.supprimer);
    $('[data-a="taches"]').title = T.taches; $('[data-a="taches"]').setAttribute('aria-label', T.taches);
    $('.kad-form textarea').placeholder = T.placeholder; $('.kad-send').textContent = T.envoyer;
  }

  function chargerEtat() {
    return api('GET', '/api/kofi/admin/etat').then(function (r) {
      if (r.ok) { S.etat = r.data; S.conv = r.data.conversation ? r.data.conversation.id : null; S.msgs = r.data.conversation ? r.data.conversation.messages : []; S.taches = r.data.taches || []; }
      return r;
    });
  }
  function ouvrirPanneau() {
    S.root.classList.add('open'); S.vue = 'discussion';
    chargerEtat().then(function () { construireCorps(); var ta = $('.kad-form textarea'); if (ta && !ta.disabled && $('.kad-foot').style.display !== 'none' && window.innerWidth > 560) ta.focus(); });
  }
  function fermerPanneau() { S.root.classList.remove('open'); var b = $('.kad-btn'); if (b) b.focus(); }

  function envoyer() {
    if (S.occupe) return;
    var ta = $('.kad-form textarea'); var texte = ta.value.trim(); if (!texte || ta.disabled) return;
    var max = S.etat && S.etat.max_message; if (max && texte.length > max) { ajouterMessage({ role: 'assistant', contenu: 'Message trop long (' + max + ' caractères au maximum).' }); return; }
    S.occupe = true; $('.kad-send').disabled = true;
    var corps = $('.kad-body');
    if (!S.msgs.length) corps.innerHTML = '';
    var mu = { role: 'user', contenu: texte }; S.msgs.push(mu); ajouterMessage(mu);
    ta.value = ''; ta.style.height = 'auto';
    var att = document.createElement('div'); att.className = 'kad-typing'; att.setAttribute('role', 'status'); att.textContent = T.reflechit; corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    api('POST', '/api/kofi/admin/messages', { texte: texte, conversation_id: S.conv || undefined }).then(function (r) {
      att.remove();
      if (r.ok) {
        S.conv = r.data.conversation_id; S.msgs.push(r.data.message); ajouterMessage(r.data.message);
        (r.data.message.taches || []).forEach(remplacerTache);
        if (S.etat && r.data.portefeuille) S.etat.portefeuille = r.data.portefeuille;
        majMeta();
        if (r.data.message.ouvrir && r.data.message.ouvrir.section && /^je vous ouvre/i.test(r.data.message.contenu)) { /* le bouton « Ouvrir » est affiché ; pas d'ouverture surprise */ }
      } else {
        S.msgs.pop();
        var code = r.data && r.data.code;
        if (code === 'majorite_requise' || code === 'mineur' || code === 'pays_non_pris_en_charge') chargerEtat().then(construireCorps);
        else ajouterMessage({ role: 'assistant', contenu: (r.data && r.data.error) || (r.status === 429 ? T.trop : T.erreur) });
      }
    }).catch(function () { att.remove(); S.msgs.pop(); ajouterMessage({ role: 'assistant', contenu: T.erreur }); })
      .then(function () { S.occupe = false; var ok = S.etat && S.etat.etat === 'utilisable'; $('.kad-send').disabled = !ok; if (ok) ta.focus(); });
  }

  /* Pastille « à valider » : un rafraîchissement discret toutes les 60 s, seulement quand l'onglet est visible. */
  function surveiller() {
    if (S.minuteur) return;
    S.minuteur = setInterval(function () {
      if (document.hidden || !S.root || S.occupe) return;
      api('GET', '/api/kofi/admin/etat').then(function (r) {
        if (!r.ok || !S.root) return;
        var avant = {}; S.taches.forEach(function (x) { avant[x.id] = x.statut; });
        S.etat = r.data; S.taches = r.data.taches || [];
        majBadge();
        if (!S.root.classList.contains('open')) return;
        if (S.vue === 'taches') return construireCorps();
        /* Discussion ouverte : les cartes dont l'état a changé (exécutée à l'heure dite, à valider…) se mettent à jour sur place. */
        S.taches.forEach(function (t) {
          if (avant[t.id] === t.statut) return;
          S.msgs.forEach(function (m) { if (m.taches) m.taches = m.taches.map(function (x) { return Number(x.id) === Number(t.id) ? t : x; }); });
          var el = S.root.querySelector('[data-tache="' + t.id + '"]'); if (el && !S.occupe) el.replaceWith(carteTache(t));
        });
      });
    }, 60000);
  }

  function construire() {
    if (!document.getElementById('kad-style')) { var st = document.createElement('style'); st.id = 'kad-style'; st.textContent = CSS; document.head.appendChild(st); }
    var root = document.createElement('div'); root.className = 'kad-root'; root.setAttribute('data-koffi-admin', '1');
    root.innerHTML =
      '<button type="button" class="kad-btn" data-a="ouvrir"><img src="/assets/koffi-avatar-96.webp" width="46" height="46" alt=""><span class="kad-lib"></span></button>' +
      '<section class="kad-panel" role="dialog" aria-label="Koffi, assistant de l\'administrateur" aria-modal="false">' +
        '<div class="kad-head"><img src="/assets/koffi-avatar-96.webp" width="42" height="42" alt=""><div class="kad-t"><b></b><span></span><button type="button" class="kad-credit" data-a="credit" style="display:none"></button></div>' +
          '<button type="button" class="kad-ic" data-a="taches">📋</button><button type="button" class="kad-ic" data-a="nouvelle">＋</button><button type="button" class="kad-ic" data-a="supprimer">🗑</button><button type="button" class="kad-ic" data-a="fermer">✕</button></div>' +
        '<div class="kad-body" aria-live="polite"></div>' +
        '<div class="kad-foot"><form class="kad-form"><textarea rows="1" maxlength="2000" aria-label="Votre message à Koffi"></textarea><button type="submit" class="kad-send"></button></form></div>' +
      '</section>';
    document.body.appendChild(root); S.root = root;
    root.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-a]') : null; if (!t) return;
      var act = t.getAttribute('data-a');
      if (act === 'ouvrir') return ouvrirPanneau();
      if (act === 'fermer') return fermerPanneau();
      if (act === 'credit') { if (window.KoffiCredit) window.KoffiCredit.ouvrir({ lg: 'fr' }); return; }
      if (act === 'taches') { S.vue = S.vue === 'taches' ? 'discussion' : 'taches'; return chargerEtat().then(construireCorps); }
      if (act === 'nouvelle') { S.conv = null; S.msgs = []; S.vue = 'discussion'; return construireCorps(); }
      if (act === 'supprimer') {
        if (!S.conv) return; if (!window.confirm(T.confirmSuppr)) return;
        return api('DELETE', '/api/kofi/admin/conversations/' + S.conv).then(function () { S.conv = null; S.msgs = []; construireCorps(); });
      }
    });
    root.querySelector('.kad-form').addEventListener('submit', function (ev) { ev.preventDefault(); envoyer(); });
    var ta = root.querySelector('.kad-form textarea');
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); envoyer(); } });
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px'; });
    if (!ecouteEchap) { ecouteEchap = true; document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && S.root && S.root.classList.contains('open') && !document.querySelector('.kcr-fond')) fermerPanneau(); }); }
  }

  window.KoffiAdmin = {
    /* Monte le bouton SEULEMENT pour un administrateur connecté (le serveur répond 401/403 aux autres : rien n'apparaît). */
    monter: function () {
      if (S.root) return;
      return Promise.all([chargerEtat(), chargerScript('/assets/koffi-credit.js?v=3', function () { return !!window.KoffiCredit; })]).then(function (rs) {
        if (!rs[0].ok || S.root) return;
        construire(); traduireUI(); majMeta(); majBadge(); surveiller();
      });
    },
    ouvrirModule: ouvrirModule,
    estMonte: function () { return !!S.root; }
  };
})();
