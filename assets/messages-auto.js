/* ============================================================
   Diaspo'Actif — Gestion des messages automatiques de remerciement (2026-10-14, demande explicite)
   « Dès qu'une personne adhère, s'abonne ou soutient une cagnotte, un message la remercie. Chaque initiative peut modifier ces messages,
   en créer d'autres et choisir à quoi les brancher. »

   Fenêtre autonome (feuille qui monte du bas sur téléphone), au design « Nuit dorée » : liste des modèles par situation, éditeur avec aperçu.
   API : window.MessagesAuto = { ouvrir({ onChange }) }
   Serveur : GET/POST /api/messages-auto/modeles · PUT/DELETE /api/messages-auto/modeles/:id · POST …/:id/reinitialiser (server/index.js)
   Un seul modèle actif par situation ; trois textes standard fournis d'office ; envoi uniquement aux personnes qui ont un compte.
   ============================================================ */
(function () {
  'use strict';
  if (window.MessagesAuto) return;

  var SITUATIONS = [
    { k: 'adhesion', titre: 'Adhésion', quand: 'quand une personne adhère', env: 'adhésion' },
    { k: 'abonnement', titre: 'Abonnement', quand: 'quand une personne s’abonne à votre compte', env: 'abonnement' },
    { k: 'cagnotte', titre: 'Cagnotte', quand: 'quand une personne soutient l’une de vos cagnottes', env: 'soutien' }
  ];
  var VARIABLES = [['{prenom}', 'Prénom'], ['{initiative}', 'Nom de la structure'], ['{cagnotte}', 'Nom de la cagnotte'], ['{montant}', 'Montant du don']];
  var E = { modeles: [], envois: {}, max: 12, standard: {}, initiative: '' };
  var racine = null, precedent = null, rappel = null;

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var ENVELOPPE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7.5l8.5 6 8.5-6"/></svg>';

  function api(methode, chemin, corps) {
    var init = { method: methode, credentials: 'same-origin', headers: {} };
    if (corps !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(corps); }
    return fetch(chemin, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Une erreur est survenue.'); e.status = r.status; throw e; } return j; });
    });
  }

  function css() {
    if (document.getElementById('ma-css')) return;
    var s = document.createElement('style'); s.id = 'ma-css';
    s.textContent = [
      '.ma-fond{position:fixed;inset:0;z-index:100000;background:rgba(3,6,14,.74);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit;animation:maF .25s ease}',
      '@keyframes maF{from{opacity:0}to{opacity:1}}@keyframes maM{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}',
      '.ma-fen{position:relative;width:min(620px,100%);max-height:calc(100vh - 40px);overflow:auto;border-radius:26px;border:1px solid rgba(227,192,110,.4);color:#E8ECF6;box-shadow:0 40px 80px -30px #000;animation:maM .3s ease;',
      'background:radial-gradient(420px 220px at 100% 0%,rgba(227,192,110,.18),transparent 66%),linear-gradient(160deg,#14234a 0%,#0B1226 62%);scrollbar-width:thin;scrollbar-color:rgba(227,192,110,.4) transparent}',
      '.ma-tete{display:flex;align-items:center;gap:14px;padding:22px 22px 6px}',
      '.ma-ic{flex:none;width:50px;height:50px;border-radius:16px;display:grid;place-items:center;color:#E3C06E;background:rgba(227,192,110,.12);border:1px solid rgba(227,192,110,.45)}',
      '.ma-ic svg{width:26px;height:26px}',
      '.ma-tete h2{margin:0;flex:1;font-family:"Bodoni Moda","Didot",Georgia,serif;font-weight:500;font-size:25px;line-height:1.15;color:#fff}',
      '.ma-x{flex:none;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font-size:18px;cursor:pointer}',
      '.ma-corps{padding:6px 22px 24px;display:flex;flex-direction:column;gap:16px}',
      '.ma-p{margin:0;font-size:14.5px;line-height:1.55;color:#C7D4E8}',
      '.ma-sec{display:flex;flex-direction:column;gap:10px}',
      '.ma-sec h3{margin:6px 0 0;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#E3C06E}',
      '.ma-sec .ma-quand{margin:-4px 0 2px;font-size:13px;color:#A9B4CC}',
      '.ma-carte{display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}',
      '.ma-carte.off{opacity:.6}',
      '.ma-carte .tx{flex:1;min-width:0}',
      '.ma-carte .tx b{display:block;font-size:14.5px;color:#fff;line-height:1.3}',
      '.ma-carte .tx small{display:block;margin-top:3px;font-size:12.5px;line-height:1.4;color:#A9B4CC;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.ma-pastille{display:inline-block;margin-left:6px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.04em;border:1px solid rgba(227,192,110,.5);color:#E3C06E;vertical-align:middle}',
      '.ma-inter{flex:none;position:relative;width:50px;height:30px;border-radius:999px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);cursor:pointer;padding:0;transition:background .2s}',
      '.ma-inter:after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .2s}',
      '.ma-inter[aria-checked="true"]{background:#E3C06E;border-color:#E3C06E}',
      '.ma-inter[aria-checked="true"]:after{transform:translateX(20px);background:#1a1202}',
      '.ma-bout{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 20px;border-radius:999px;border:0;font:inherit;font-size:14.5px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#F3DC9A,#B9893A);color:#1a1202}',
      '.ma-bout.ma-contour{background:transparent;border:1px solid rgba(227,192,110,.6);color:#E3C06E}',
      '.ma-bout.dang{background:transparent;border:1px solid rgba(255,120,120,.5);color:#FFB4B4}',
      '.ma-bout.pet{min-height:40px;padding:0 16px;font-size:13.5px}',
      '.ma-bout:disabled{opacity:.55;cursor:default}',
      '.ma-fen :is(.ma-bout,.ma-x,.ma-inter):focus-visible,.ma-fen :is(input,select,textarea):focus-visible{outline:3px solid #E3C06E;outline-offset:2px}',
      '.ma-form{display:flex;flex-direction:column;gap:14px}',
      '.ma-form label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:700;letter-spacing:.04em;color:#A9B4CC;margin:0}',
      'html body .ma-fen .ma-form :is(input[type=text],select,textarea){width:100%;box-sizing:border-box;border-radius:14px;border:1px solid rgba(255,255,255,.16)!important;background:#0f1a38!important;color:#fff!important;font:inherit;font-size:15px;font-weight:500;padding:12px 14px;color-scheme:dark;min-height:48px}',
      'html body .ma-fen .ma-form label{color:#A9B4CC!important}',
      'html body .ma-fen .ma-form label.ma-case{color:#E8ECF6!important}',
      'html body .ma-fen .ma-form textarea{min-height:170px;resize:vertical;line-height:1.5}',
      '.ma-vars{display:flex;flex-wrap:wrap;gap:8px}',
      '.ma-vars button{min-height:36px;padding:0 12px;border-radius:999px;border:1px solid rgba(227,192,110,.5);background:rgba(227,192,110,.1);color:#F3E3B5;font:inherit;font-size:13px;font-weight:700;cursor:pointer}',
      '.ma-apercu{padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(227,192,110,.3);font-size:14px;line-height:1.55;color:#E8ECF6;white-space:pre-wrap}',
      '.ma-apercu b{display:block;margin-bottom:6px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#E3C06E}',
      '.ma-ligne{display:flex;gap:10px;flex-wrap:wrap}',
      '.ma-case{flex-direction:row!important;align-items:center;gap:10px!important;font-size:14px!important;font-weight:600!important;letter-spacing:0!important;color:#E8ECF6!important}',
      '.ma-case input{width:22px!important;height:22px;padding:0!important;accent-color:#E3C06E}',
      '.ma-err{padding:12px 14px;border-radius:14px;background:rgba(255,120,120,.12);border:1px solid rgba(255,120,120,.4);font-size:13.5px;line-height:1.45;color:#FFD3D3}',
      '@media (max-width:640px){.ma-fond{align-items:flex-end;padding:0}.ma-fen{width:100%;max-height:94vh;border-radius:26px 26px 0 0}.ma-tete h2{font-size:23px}}',
      '@media (prefers-reduced-motion:reduce){.ma-fond,.ma-fen{animation:none}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* Même règle de remplacement que le serveur (msgAutoRendre), avec des valeurs d'exemple. */
  function rendre(contenu) {
    var ex = { prenom: 'Aminata', nom: 'Koné', initiative: E.initiative || 'votre structure', cagnotte: 'Mon projet', montant: '20 EUR' };
    return String(contenu || '').replace(/\{cagnotte_phrase\}/g, ' pour la cagnotte « ' + ex.cagnotte + ' »')
      .replace(/\{(prenom|nom|initiative|cagnotte|montant)\}/g, function (_, k) { return ex[k]; }).trim();
  }

  function fermer() {
    if (!racine) return;
    racine.remove(); racine = null;
    document.removeEventListener('keydown', touche, true);
    document.body.style.overflow = document.body.dataset.maOv || '';
    if (precedent && precedent.focus) { try { precedent.focus(); } catch (e) { /* ignoré */ } }
  }
  function touche(e) { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } }
  function corps() { return racine && racine.querySelector('.ma-corps'); }
  function titre(t) { var h = racine && racine.querySelector('#ma-t'); if (h) h.textContent = t; }
  function charger() {
    return api('GET', '/api/messages-auto/modeles').then(function (r) {
      E.modeles = r.modeles || []; E.envois = r.envois || {}; E.max = r.max || 12; E.standard = r.standard || {}; E.initiative = r.nom_initiative || '';
    });
  }
  function signaler() { if (typeof rappel === 'function') { try { rappel(); } catch (e) { /* ignoré */ } } }

  /* ── liste ── */
  function ecranListe(msg) {
    titre('Messages automatiques');
    var html = '<p class="ma-p">Un message de remerciement part tout seul dans la messagerie des personnes qui adhèrent, s’abonnent ou soutiennent une cagnotte. Il ne concerne que celles qui ont un compte Diaspo’Actif : c’est un premier contact. Vous pouvez modifier ces messages ou créer les vôtres.</p>';
    if (msg) html += '<div class="ma-err" role="alert">' + esc(msg) + '</div>';
    SITUATIONS.forEach(function (s) {
      var liste = E.modeles.filter(function (m) { return m.declencheur === s.k; });
      var n = E.envois[s.k] || 0;
      html += '<section class="ma-sec"><h3>' + esc(s.titre) + '</h3><p class="ma-quand">Envoyé ' + esc(s.quand) + (n ? ' · ' + n + ' envoyé' + (n > 1 ? 's' : '') : '') + '</p>';
      html += liste.map(function (m) {
        return '<div class="ma-carte' + (m.actif ? '' : ' off') + '"><div class="tx"><b>' + esc(m.nom) + (m.est_standard ? '<span class="ma-pastille">Standard</span>' : '') + '</b><small>' + esc(rendre(m.contenu)) + '</small></div>'
          + '<button type="button" class="ma-inter" role="switch" aria-checked="' + (m.actif ? 'true' : 'false') + '" aria-label="' + (m.actif ? 'Désactiver ce message' : 'Utiliser ce message') + '" data-a="bascule" data-id="' + m.id + '"></button>'
          + '<button type="button" class="ma-bout ma-contour pet" data-a="edite" data-id="' + m.id + '">Modifier</button></div>';
      }).join('');
      html += '</section>';
    });
    html += '<button type="button" class="ma-bout" data-a="nouveau">＋ Nouveau modèle</button>';
    corps().innerHTML = html;
  }

  /* ── éditeur ── */
  function ecranEditeur(m, erreur) {
    var nouveau = !m.id;
    titre(nouveau ? 'Nouveau modèle' : 'Modifier le message');
    var html = '<form class="ma-form" id="ma-form" novalidate>'
      + (erreur ? '<div class="ma-err" role="alert">' + esc(erreur) + '</div>' : '')
      + '<label>Nom du modèle<input type="text" name="nom" maxlength="80" value="' + esc(m.nom) + '" placeholder="Ex : Merci pour votre confiance"></label>'
      + '<label>Envoyé quand<select name="declencheur">' + SITUATIONS.map(function (s) { return '<option value="' + s.k + '"' + (m.declencheur === s.k ? ' selected' : '') + '>' + esc(s.titre + ' — ' + s.quand) + '</option>'; }).join('') + '</select></label>'
      + '<label>Votre message<textarea name="contenu" maxlength="1000" placeholder="Écrivez votre message de remerciement…">' + esc(m.contenu) + '</textarea></label>'
      + '<div class="ma-vars" aria-label="Insérer une information automatique">' + VARIABLES.map(function (v) { return '<button type="button" data-a="variable" data-v="' + esc(v[0]) + '" title="' + esc(v[1]) + '">' + esc(v[0]) + '</button>'; }).join('') + '</div>'
      + '<div class="ma-apercu" id="ma-apercu"><b>Aperçu</b><span></span></div>'
      + '<label class="ma-case"><input type="checkbox" name="actif"' + (m.actif ? ' checked' : '') + '> Utiliser ce message (il remplace celui qui est actif pour cette situation)</label>'
      + '<div class="ma-ligne"><button type="submit" class="ma-bout">Enregistrer</button><button type="button" class="ma-bout ma-contour" data-a="annule">Annuler</button>'
      + (m.est_standard ? '<button type="button" class="ma-bout ma-contour" data-a="reinit" data-id="' + m.id + '">Remettre le texte standard</button>' : '')
      + (!nouveau && !m.est_standard ? '<button type="button" class="ma-bout dang" data-a="supprime" data-id="' + m.id + '">Supprimer</button>' : '')
      + '</div></form>';
    corps().innerHTML = html;
    var f = corps().querySelector('#ma-form'), ta = f.elements.contenu;
    var maj = function () { corps().querySelector('#ma-apercu span').textContent = rendre(ta.value); };
    ta.addEventListener('input', maj); maj();
    f.elements.nom.focus();
  }

  function lireForm() {
    var f = corps().querySelector('#ma-form');
    return { nom: f.elements.nom.value.trim(), declencheur: f.elements.declencheur.value, contenu: f.elements.contenu.value, actif: !!f.elements.actif.checked };
  }

  function ouvrir(options) {
    options = options || {};
    rappel = options.onChange;
    css();
    precedent = document.activeElement;
    if (racine) racine.remove();
    racine = document.createElement('div'); racine.className = 'ma-fond';
    racine.innerHTML = '<div class="ma-fen" role="dialog" aria-modal="true" aria-labelledby="ma-t"><div class="ma-tete"><span class="ma-ic">' + ENVELOPPE + '</span><h2 id="ma-t">Messages automatiques</h2><button type="button" class="ma-x" aria-label="Fermer" data-a="ferme">✕</button></div><div class="ma-corps"><p class="ma-p">Chargement…</p></div></div>';
    document.body.appendChild(racine);
    document.body.dataset.maOv = document.body.style.overflow || ''; document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', touche, true);
    var edition = null;                                                                    /* modèle en cours d'édition, pour l'aperçu et les variables */

    racine.addEventListener('click', function (ev) {
      if (ev.target === racine) return fermer();
      var b = ev.target.closest('[data-a]'); if (!b) return;
      var a = b.dataset.a, id = Number(b.dataset.id) || 0;
      var modele = E.modeles.filter(function (m) { return m.id === id; })[0];
      if (a === 'ferme') return fermer();
      if (a === 'annule') return ecranListe();
      if (a === 'nouveau') { edition = { id: 0, nom: '', declencheur: 'adhesion', contenu: '', actif: true, est_standard: false }; return ecranEditeur(edition); }
      if (a === 'edite' && modele) { edition = modele; return ecranEditeur(modele); }
      if (a === 'variable') {
        var ta = corps().querySelector('textarea[name="contenu"]'), v = b.dataset.v, i = ta.selectionStart || ta.value.length;
        ta.value = ta.value.slice(0, i) + v + ta.value.slice(ta.selectionEnd || i); ta.focus(); ta.selectionStart = ta.selectionEnd = i + v.length; ta.dispatchEvent(new Event('input')); return;
      }
      if (a === 'bascule' && modele) {
        b.disabled = true;
        return api('PUT', '/api/messages-auto/modeles/' + id, { actif: !modele.actif }).then(charger).then(function () { signaler(); ecranListe(); }).catch(function (e) { ecranListe(e.message); });
      }
      if (a === 'reinit' && modele) {
        if (!window.confirm('Remettre le texte standard ? Votre texte actuel sera remplacé.')) return;
        return api('POST', '/api/messages-auto/modeles/' + id + '/reinitialiser').then(charger).then(function () { signaler(); ecranListe(); }).catch(function (e) { ecranEditeur(modele, e.message); });
      }
      if (a === 'supprime' && modele) {
        if (!window.confirm('Supprimer ce modèle ?')) return;
        return api('DELETE', '/api/messages-auto/modeles/' + id).then(charger).then(function () { signaler(); ecranListe(); }).catch(function (e) { ecranEditeur(modele, e.message); });
      }
    });
    racine.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var d = lireForm(), btn = ev.target.querySelector('button[type=submit]'); btn.disabled = true;
      var req = edition && edition.id ? api('PUT', '/api/messages-auto/modeles/' + edition.id, d) : api('POST', '/api/messages-auto/modeles', d);
      req.then(charger).then(function () { signaler(); ecranListe(); }).catch(function (e) {
        var cible = edition ? { id: edition.id, nom: d.nom, declencheur: d.declencheur, contenu: d.contenu, actif: d.actif, est_standard: edition.est_standard } : d;
        ecranEditeur(cible, e.message);
      });
    });

    charger().then(function () { if (racine) ecranListe(); }).catch(function (e) {
      if (!racine) return;
      corps().innerHTML = '<div class="ma-err" role="alert">' + esc(e.status === 401 ? 'Connectez-vous pour gérer vos messages automatiques.' : e.message) + '</div>';
    });
    var x = racine.querySelector('.ma-x'); if (x) x.focus();
  }

  window.MessagesAuto = { ouvrir: ouvrir };
})();
