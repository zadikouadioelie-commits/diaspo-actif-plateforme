/* ════════════════════════════════════════════════════════════════════════════════════════════
   Message sécurisé — interface partagée site (messagerie.html) + téléphone (assets/m.js).  2026-11-01
   Serveur : server/message-securise.js (le texte n'est remis qu'après saisie du DS-ID du destinataire, pendant 2 minutes, puis détruit).

   Ce fichier fournit :
   • brancherComposeur(...)  — bouton « cadenas » + bandeau dans la zone d'écriture, et envoi (envoyer) ;
   • ligneSite / ligneTel    — la carte du message dans la conversation (fermé / en lecture / détruit, vue du destinataire ou de l'expéditeur) ;
   • lier(racine, apres)     — clic sur « Ouvrir » : avertissement → saisie du DS-ID → lecture avec décompte ;
   • les 4 protections dissuasives de la lecture (aucune n'est infaillible : une page web ne peut pas empêcher une capture d'écran) :
       1. le texte disparaît dès que la fenêtre perd le focus ou que l'onglet est caché ;
       2. clic droit, sélection, copier, glisser et impression désactivés sur le message ;
       3. touche Impr écran / outils de capture (Win+Maj+S, Cmd+Maj+3/4/5) : texte masqué sur-le-champ ;
       4. filigrane (nom, date, heure, n° du message) sur le texte — une capture diffusée porte le nom de son auteur ; si on le retire, la lecture s'interrompt.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.MessageSecurise) return;

  var ICONE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  var fmtDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function quand(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    var jour = function (x) { return x.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }); };
    return jour(d) === jour(new Date()) ? fmtHeure.format(d) : fmtDate.format(d);
  }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function appel(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) { var e = new Error(d.error || 'Une erreur est survenue.'); e.status = r.status; e.data = d; throw e; }
          return d;
        });
      });
  }

  /* ── Feuille de style (une seule fois) ─────────────────────────────────────────────────── */
  function css() {
    if (document.getElementById('ms-css')) return;
    var s = document.createElement('style'); s.id = 'ms-css';
    s.textContent = [
      ':root{--ms-encre:#0D2B4E;--ms-encre2:#17406F;--ms-orange:#F26422;--ms-or:#E9B44C;--ms-papier:#F5F7FB;--ms-bord:#D5DDEA;--ms-ok:#1F7A52;--ms-alerte:#B3261E;}',
      /* Zone d'écriture */
      '.ms-bouton{width:34px;height:34px;border:none;background:var(--surface2,#eef2f7);border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:var(--ms-encre);transition:background .15s,color .15s;flex-shrink:0;}',
      '.ms-bouton:hover{background:#fde9dc;}',
      /* !important : le thème « Nuit dorée » restyle .msg-action-btn avec une spécificité plus forte, et l'état activé doit se voir. */
      'button.ms-bouton[aria-pressed="true"]{background:var(--ms-or)!important;color:var(--ms-encre)!important;box-shadow:0 0 0 2px var(--ms-orange);}',
      '.ms-bouton:focus-visible,.ms-voile button:focus-visible,.ms-voile input:focus-visible,.ms-ouvrir:focus-visible{outline:3px solid var(--ms-orange);outline-offset:2px;}',
      '.ms-tel .ms-bouton{width:44px;height:44px;border-radius:50%;}',
      '.ms-bandeau{display:flex;gap:10px;align-items:flex-start;margin:0 0 8px;padding:10px 12px;border-radius:10px;background:var(--ms-encre);color:#fff;font-size:12.5px;line-height:1.45;}',
      '.ms-bandeau[hidden]{display:none;}',
      '.ms-bandeau svg{color:var(--ms-or);flex-shrink:0;margin-top:1px;}',
      '.ms-bandeau button{margin-left:auto;background:none;border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;min-height:32px;white-space:nowrap;}',
      /* Carte dans la conversation */
      '.ms-carte{display:flex;gap:12px;align-items:flex-start;max-width:340px;padding:12px 14px;border-radius:14px;background:var(--ms-encre);color:#fff;font-size:13px;line-height:1.45;box-shadow:0 1px 2px rgba(13,43,78,.25);}',
      '.ms-carte .ms-pastille{width:36px;height:36px;border-radius:50%;background:rgba(233,180,76,.16);color:var(--ms-or);display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
      '.ms-carte b{display:block;font-size:13.5px;margin-bottom:2px;}',
      '.ms-carte .ms-detail{display:block;opacity:.82;font-size:12.5px;}',
      '.ms-carte .ms-heure{display:block;margin-top:6px;font-size:10.5px;opacity:.6;}',
      '.ms-carte.ms-detruit{background:#E9EDF3;color:#4A5B72;box-shadow:none;border:1px dashed #B8C3D4;}',
      '.ms-carte.ms-detruit .ms-pastille{background:#D6DDE8;color:#6A7B93;}',
      '.ms-carte.ms-ouvert{background:var(--ms-encre2);}',
      '.ms-ouvrir{margin-top:10px;display:flex;width:fit-content;align-items:center;gap:8px;min-height:44px;padding:0 16px;border:none;border-radius:999px;background:var(--ms-orange);color:#fff;font-weight:700;font-size:13px;cursor:pointer;}',
      '.ms-ouvrir:hover{filter:brightness(1.08);}',
      '.ms-b{background:transparent!important;box-shadow:none!important;border:0!important;padding:0!important;}',
      /* Fenêtres */
      '.ms-voile{position:fixed;inset:0;z-index:2147483000;background:rgba(7,22,41,.9);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;font-family:inherit;-webkit-text-size-adjust:100%;}',
      '.ms-panneau{background:#fff;color:var(--ms-encre);width:100%;max-width:480px;border-radius:18px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.45);}',
      /* Le thème « Nuit dorée » colore titres, champs et boutons en clair : la fenêtre est une carte blanche, ses couleurs sont donc imposées. */
      '.ms-panneau h2,.ms-panneau p,.ms-panneau label,.ms-panneau span,.ms-panneau .ms-encart{color:var(--ms-encre)!important;}',
      '.ms-panneau .ms-erreur{color:var(--ms-alerte)!important;}',
      '.ms-panneau .ms-lien{color:var(--ms-encre2)!important;}',
      '.ms-panneau .ms-btn{background:#fff!important;color:var(--ms-encre)!important;border:1px solid var(--ms-bord)!important;}',
      '.ms-panneau .ms-btn.ms-principal{background:var(--ms-orange)!important;color:#fff!important;border-color:var(--ms-orange)!important;}',
      '.ms-panneau .ms-champ input{background:#fff!important;color:var(--ms-encre)!important;border:2px solid var(--ms-bord)!important;}',
      '.ms-lecture,.ms-lecture .ms-zone,.ms-lecture .ms-texte,.ms-lecture .ms-pied small{color:var(--ms-encre)!important;}',
      '.ms-lecture .ms-entete,.ms-lecture .ms-entete .ms-de{color:#fff!important;}',
      '.ms-lecture .ms-compte{color:var(--ms-or)!important;} .ms-lecture .ms-compte.ms-presque{color:#FF8A5C!important;} .ms-lecture .ms-compte.ms-fin{color:#FF5A4F!important;}',
      '.ms-lecture .ms-btn{background:#fff!important;color:var(--ms-encre)!important;border:1px solid var(--ms-bord)!important;}',
      '.ms-lecture .ms-masque-msg{color:var(--ms-encre)!important;background:var(--ms-papier)!important;}',
      '.ms-carte,.ms-carte b,.ms-carte .ms-detail{color:#fff!important;}',
      '.ms-carte.ms-detruit,.ms-carte.ms-detruit b,.ms-carte.ms-detruit .ms-detail{color:#4A5B72!important;}',
      '.ms-bandeau,.ms-bandeau div,.ms-bandeau b{color:#fff!important;}',
      '.ms-panneau h2{margin:0 0 6px;font-size:19px;line-height:1.25;display:flex;gap:10px;align-items:center;}',
      '.ms-panneau h2 svg{color:var(--ms-orange);}',
      '.ms-panneau p{margin:10px 0;font-size:14.5px;line-height:1.55;}',
      '.ms-encart{background:var(--ms-papier);border:1px solid var(--ms-bord);border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5;}',
      '.ms-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap;}',
      '.ms-btn{min-height:46px;padding:0 20px;border-radius:12px;border:1px solid var(--ms-bord);background:#fff;color:var(--ms-encre);font-weight:700;font-size:14px;cursor:pointer;}',
      '.ms-btn.ms-principal{background:var(--ms-orange);border-color:var(--ms-orange);color:#fff;}',
      '.ms-btn:disabled{opacity:.55;cursor:not-allowed;}',
      '.ms-champ{display:block;margin-top:14px;}',
      '.ms-champ span{display:block;font-size:13px;font-weight:700;margin-bottom:6px;}',
      '.ms-champ input{width:100%;box-sizing:border-box;min-height:50px;border:2px solid var(--ms-bord);border-radius:12px;padding:0 14px;font-size:18px;letter-spacing:.14em;font-family:ui-monospace,Menlo,Consolas,monospace;text-transform:uppercase;color:var(--ms-encre);background:#fff;}',
      '.ms-champ input.ms-cache-saisie{-webkit-text-security:disc;text-security:disc;}',
      '.ms-champ input:focus{border-color:var(--ms-encre);outline:none;}',
      '.ms-lien{background:none;border:none;color:var(--ms-encre2);text-decoration:underline;cursor:pointer;font-size:13px;padding:8px 0;min-height:36px;}',
      '.ms-erreur{margin:10px 0 0;color:var(--ms-alerte);font-size:13.5px;font-weight:600;min-height:1.2em;}',
      /* Lecture */
      '.ms-lecture{background:#fff;color:var(--ms-encre);width:100%;max-width:560px;border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5);}',
      '.ms-lecture:focus,.ms-panneau:focus{outline:none;}',
      '.ms-entete{background:var(--ms-encre);color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px;}',
      '.ms-entete svg{color:var(--ms-or);flex-shrink:0;}',
      '.ms-entete .ms-de{flex:1;min-width:0;font-size:13.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.ms-compte{font-variant-numeric:tabular-nums;font-size:22px;font-weight:800;letter-spacing:.02em;color:var(--ms-or);}',
      '.ms-compte.ms-presque{color:#FF8A5C;} .ms-compte.ms-fin{color:#FF5A4F;}',
      '.ms-barre{height:5px;background:rgba(13,43,78,.12);}',
      '.ms-barre i{display:block;height:100%;width:100%;background:var(--ms-or);transform-origin:left;}',
      '.ms-barre.ms-presque i{background:#FF8A5C;} .ms-barre.ms-fin i{background:#E5483B;}',
      '.ms-zone{position:relative;min-height:170px;padding:20px 20px 18px;}',
      '.ms-texte{font-size:17px;line-height:1.65;white-space:pre-wrap;word-break:break-word;position:relative;z-index:1;}',
      '.ms-filigrane{position:absolute;inset:0;z-index:2;pointer-events:none;background-repeat:repeat;}',
      '.ms-masque-msg{position:absolute;inset:0;z-index:3;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;background:var(--ms-papier);font-weight:700;font-size:15px;line-height:1.5;}',
      '.ms-lecture.ms-masque .ms-texte{visibility:hidden;}',
      '.ms-lecture.ms-masque .ms-masque-msg{display:flex;}',
      '.ms-pied{padding:12px 16px 16px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-top:1px solid var(--ms-bord);background:var(--ms-papier);}',
      '.ms-pied small{font-size:12px;color:#51627B;line-height:1.4;flex:1 1 180px;}',
      '.ms-voile,.ms-voile *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}',
      '.ms-voile input{-webkit-user-select:text;user-select:text;}',
      '.ms-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}',
      '@media (prefers-reduced-motion:no-preference){.ms-voile{animation:ms-in .18s ease-out;}@keyframes ms-in{from{opacity:0}to{opacity:1}}}',
      '@media print{.ms-voile *{display:none!important;}.ms-voile::after{content:"Impression impossible pour un message sécurisé.";display:block;padding:40px;font-size:18px;color:#000;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ── Zone d'écriture : cadenas + bandeau ──────────────────────────────────────────────── */
  var etat = { actif: false };
  var ctl = null;
  function brancherComposeur(o) {
    css();
    var bouton = o.bouton, bandeau = o.bandeau, envoi = o.envoi;
    var libelleOrigine = envoi ? envoi.textContent : '';
    bouton.type = 'button';
    bouton.classList.add('ms-bouton');
    bouton.innerHTML = ICONE;
    bouton.setAttribute('aria-label', 'Message sécurisé');
    bouton.setAttribute('title', 'Message sécurisé : lisible 2 minutes après la saisie du DS-ID du destinataire, puis détruit');
    bandeau.className = 'ms-bandeau';
    bandeau.hidden = true;
    bandeau.setAttribute('role', 'status');
    bandeau.innerHTML = ICONE + '<div><b>Message sécurisé.</b> Votre correspondant devra saisir son DS-ID. Le texte sera lisible 2 minutes, puis détruit. Texte seulement, sans pièce jointe.</div><button type="button">Annuler</button>';
    function appliquer(actif) {
      etat.actif = !!actif;
      bouton.setAttribute('aria-pressed', etat.actif ? 'true' : 'false');
      bandeau.hidden = !etat.actif;
      if (envoi && libelleOrigine && !o.garderLibelle) envoi.textContent = etat.actif ? 'Envoyer sécurisé' : libelleOrigine;
      if (o.apresChangement) o.apresChangement(etat.actif);
    }
    bouton.addEventListener('click', function () { appliquer(!etat.actif); if (etat.actif && o.champ) o.champ.focus(); });
    bandeau.querySelector('button').addEventListener('click', function () { appliquer(false); });
    ctl = { actif: function () { return etat.actif; }, reinitialiser: function () { appliquer(false); } };
    return ctl;
  }
  function actif() { return etat.actif; }

  function envoyer(convId, texte) {
    return appel('POST', '/api/conversations/' + encodeURIComponent(convId) + '/messages-securises', { contenu: texte });
  }

  /* ── La carte dans la conversation ────────────────────────────────────────────────────── */
  function carteHtml(m, moi, nom, heure) {
    var s = m.securise || { statut: 'ferme' };
    var detail, titre, action = '';
    if (moi) {
      if (s.statut === 'detruit') { titre = 'Message sécurisé détruit'; detail = s.ouvert_le ? 'Ouvert à ' + quand(s.ouvert_le) + ', puis détruit.' : 'Détruit sans avoir été ouvert.'; }
      else if (s.statut === 'ouvert') { titre = 'Message sécurisé en lecture'; detail = 'Ouvert à ' + quand(s.ouvert_le) + '. Il va être détruit.'; }
      else { titre = 'Message sécurisé envoyé'; detail = 'Pas encore ouvert. Votre correspondant doit saisir son DS-ID.'; }
    } else if (s.statut === 'detruit') {
      titre = 'Message détruit'; detail = s.ouvert_le ? 'Ce message a été lu, puis détruit.' : 'Ce message n’a pas été ouvert et a été détruit.';
    } else if (s.statut === 'ouvert') {
      titre = 'Lecture en cours'; detail = 'Vous l’avez ouvert à ' + quand(s.ouvert_le) + '. Il sera bientôt détruit.';
      action = '<button type="button" class="ms-ouvrir" data-ms-act="ouvrir" data-ms-id="' + esc(m.id) + '" data-ms-de="' + esc(nom) + '">' + ICONE + 'Reprendre la lecture</button>';
    } else {
      titre = 'Message sécurisé'; detail = 'Saisissez votre DS-ID pour le lire. Il restera visible 2 minutes, puis sera détruit.';
      action = '<button type="button" class="ms-ouvrir" data-ms-act="ouvrir" data-ms-id="' + esc(m.id) + '" data-ms-de="' + esc(nom) + '">' + ICONE + 'Ouvrir le message</button>';
    }
    return '<div class="ms-carte ms-' + esc(s.statut) + '" data-ms-carte="' + esc(m.id) + '"><span class="ms-pastille">' + ICONE + '</span><div><b>' + esc(titre) + '</b><span class="ms-detail">' + esc(detail) + '</span>' + action + '<span class="ms-heure">' + esc(heure || '') + '</span></div></div>';
  }
  /* Site : une rangée complète, avec les mêmes classes que les bulles ordinaires (h = { avatarLetter, timeLabel } de messagerie.html). */
  function ligneSite(m, isMe, nom, h) {
    css();
    var av = '<div class="bubble-avatar">' + h.avatarLetter(nom) + '</div>';
    return '<div class="bubble-row ' + (isMe ? 'me' : '') + '" id="msg-' + esc(m.id) + '" style="position:relative;">' + (!isMe ? av : '')
      + '<div class="bubble-col" style="' + (isMe ? 'align-items:flex-end' : 'align-items:flex-start') + ';">' + carteHtml(m, isMe, nom, h.timeLabel(m.created_at)) + '</div>' + (isMe ? av : '') + '</div>';
  }
  /* Téléphone : une bulle .b sans habillage, qui garde l'alignement entrant / sortant. */
  function ligneTel(m, mine, nom, heure) {
    css();
    return '<div class="b ms-b ' + (mine ? 'out' : 'in') + '">' + carteHtml(m, mine, nom, heure) + '</div>';
  }
  /* Signature des états : permet de redessiner une conversation quand un message passe de « fermé » à « détruit ». */
  function signature(msgs) {
    return (msgs || []).filter(function (m) { return m.type === 'securise'; }).map(function (m) { return m.id + ':' + ((m.securise || {}).statut || '?'); }).join('|');
  }

  /* opts.lienDsId : où la personne retrouve son DS-ID (par défaut la page Confidentialité du site ; sur téléphone : m.html#/confidentialite). */
  function lier(racine, apres, opts) {
    css();
    racine._msApres = apres;
    racine._msOpts = opts || racine._msOpts || {};
    if (racine._msLie) return;
    racine._msLie = true;
    racine.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-ms-act="ouvrir"]') : null;
      if (!b || !racine.contains(b)) return;
      ouvrir(b.getAttribute('data-ms-id'), { nom: b.getAttribute('data-ms-de'), lienDsId: racine._msOpts.lienDsId, apres: function () { if (racine._msApres) racine._msApres(); } });
    });
  }

  /* ── Parcours d'ouverture : avertissement → DS-ID → lecture ───────────────────────────── */
  var ouverture = null;   // une seule fenêtre à la fois
  function ouvrir(id, opts) {
    css();
    if (ouverture) return;
    opts = opts || {};
    var voile = document.createElement('div');
    voile.className = 'ms-voile';
    voile.setAttribute('role', 'dialog'); voile.setAttribute('aria-modal', 'true');
    var precedent = document.activeElement;
    var nettoyages = [];
    var fini = false;
    ouverture = voile;
    document.body.appendChild(voile);
    var overflowAvant = document.body.style.overflow; document.body.style.overflow = 'hidden';

    function fermer() {
      if (fini) return; fini = true;
      nettoyages.forEach(function (f) { try { f(); } catch (e) { /* nettoyage best-effort */ } });
      voile.innerHTML = '';                       // le texte quitte le DOM
      if (voile.parentNode) voile.parentNode.removeChild(voile);
      document.body.style.overflow = overflowAvant;
      ouverture = null;
      if (precedent && precedent.focus) { try { precedent.focus(); } catch (e) { /* élément disparu */ } }
      if (opts.apres) opts.apres();
    }
    function ecouter(cible, evt, fn, opt) { cible.addEventListener(evt, fn, opt); nettoyages.push(function () { cible.removeEventListener(evt, fn, opt); }); }
    function piege(e) {   // Tab reste dans la fenêtre
      if (e.key !== 'Tab') return;
      var f = voile.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]');
      if (!f.length) return;
      var premier = f[0], dernier = f[f.length - 1];
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    }
    ecouter(voile, 'keydown', piege);

    /* Étape 1 — avertissement */
    function etapePret() {
      voile.innerHTML = '<div class="ms-panneau" tabindex="-1"><h2 id="ms-titre">' + ICONE + 'Avant d’ouvrir ce message</h2>'
        + '<p><b>Prenez toutes vos dispositions.</b> Dès que vous aurez saisi votre DS-ID, ce message restera visible <b>2 minutes</b>. Passé ce délai, il sera <b>détruit définitivement</b> : impossible de le relire.</p>'
        + '<div class="ms-encart">Préparez de quoi noter si besoin. Les captures d’écran sont déconseillées : le message affiche votre nom, la date et l’heure.</div>'
        + '<div class="ms-actions"><button type="button" class="ms-btn" data-a="annuler">Plus tard</button><button type="button" class="ms-btn ms-principal" data-a="pret">Je suis prêt(e)</button></div></div>';
      voile.setAttribute('aria-labelledby', 'ms-titre');
      voile.querySelector('[data-a="annuler"]').onclick = fermer;
      voile.querySelector('[data-a="pret"]').onclick = etapeCode;
      voile.querySelector('[data-a="pret"]').focus();
    }
    ecouter(document, 'keydown', function (e) { if (e.key === 'Escape' && !voile.querySelector('.ms-lecture')) fermer(); });

    /* Étape 2 — DS-ID */
    function etapeCode() {
      voile.innerHTML = '<div class="ms-panneau" tabindex="-1"><h2 id="ms-titre">' + ICONE + 'Saisissez votre DS-ID</h2>'
        + '<p>Votre Code de Sécurité Diaspo’Actif (DS-ID) prouve que c’est bien vous. Le temps de lecture démarre dès qu’il est validé.</p>'
        + '<label class="ms-champ"><span>Votre DS-ID</span><input type="text" class="ms-cache-saisie" id="ms-code" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" aria-describedby="ms-err"></label>'
        + '<button type="button" class="ms-lien" data-a="voir" aria-pressed="false">Afficher ce que je tape</button>'
        + '<p class="ms-erreur" id="ms-err" role="alert"></p>'
        + '<a class="ms-lien" href="' + esc(opts.lienDsId || '/confidentialite.html') + '" target="_blank" rel="noopener">Où trouver mon DS-ID ?</a>'
        + '<div class="ms-actions"><button type="button" class="ms-btn" data-a="annuler">Annuler</button><button type="button" class="ms-btn ms-principal" data-a="valider">Lire le message</button></div></div>';
      var champ = voile.querySelector('#ms-code'), err = voile.querySelector('#ms-err'), ok = voile.querySelector('[data-a="valider"]');
      voile.querySelector('[data-a="annuler"]').onclick = fermer;
      voile.querySelector('[data-a="voir"]').onclick = function (e) {
        var masque = champ.classList.toggle('ms-cache-saisie'); e.currentTarget.setAttribute('aria-pressed', masque ? 'false' : 'true');
        e.currentTarget.textContent = masque ? 'Afficher ce que je tape' : 'Masquer ce que je tape';
      };
      function valider() {
        var code = champ.value.trim();
        if (!code) { err.textContent = 'Saisissez votre DS-ID.'; champ.focus(); return; }
        ok.disabled = true; ok.textContent = 'Vérification…'; err.textContent = '';
        appel('POST', '/api/messages-securises/' + encodeURIComponent(id) + '/ouvrir', { ds_id: code })
          .then(function (r) { champ.value = ''; etapeLecture(r); })
          .catch(function (e) {
            ok.disabled = false; ok.textContent = 'Lire le message';
            if (e.status === 410) { etapeFin('Ce message a déjà été détruit.'); return; }
            if (e.status === 409 && e.data && e.data.ds_id_absent) { err.textContent = e.message; return; }
            err.textContent = e.message; champ.value = ''; champ.focus();
          });
      }
      ok.onclick = valider;
      champ.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); valider(); } });
      champ.focus();
    }

    function etapeFin(texte) {
      voile.innerHTML = '<div class="ms-panneau" tabindex="-1"><h2 id="ms-titre">' + ICONE + 'Message détruit</h2><p>' + esc(texte) + '</p><div class="ms-actions"><button type="button" class="ms-btn ms-principal" data-a="ok">Fermer</button></div></div>';
      voile.setAttribute('aria-labelledby', 'ms-titre');
      voile.querySelector('[data-a="ok"]').onclick = fermer; voile.querySelector('[data-a="ok"]').focus();
    }

    /* Étape 3 — lecture */
    function etapeLecture(r) {
      var fin = performance.now() + r.secondes_restantes * 1000, total = Math.max(r.secondes_restantes, 1) * 1000;
      voile.innerHTML = '<div class="ms-lecture" tabindex="-1"><div class="ms-entete">' + ICONE
        + '<div class="ms-de" id="ms-titre">Message sécurisé' + (opts.nom ? ' · ' + esc(opts.nom) : '') + '</div><div class="ms-compte" id="ms-compte" aria-hidden="true">' + mmss(r.secondes_restantes) + '</div></div>'
        + '<div class="ms-barre" id="ms-barre"><i></i></div>'
        + '<div class="ms-zone"><div class="ms-texte" id="ms-texte"></div><div class="ms-filigrane" id="ms-fili"></div><div class="ms-masque-msg" id="ms-masque"></div></div>'
        + '<div class="ms-pied"><small>Ce message sera détruit à la fin du décompte. Il est fait pour être lu, pas conservé.</small><button type="button" class="ms-btn" data-a="detruire">Terminer et détruire</button><button type="button" class="ms-btn" data-a="fermer">Masquer</button></div>'
        + '<div class="ms-sr" id="ms-live" role="status" aria-live="polite"></div></div>';
      voile.setAttribute('aria-labelledby', 'ms-titre');
      var lecture = voile.querySelector('.ms-lecture'), texte = voile.querySelector('#ms-texte'), fili = voile.querySelector('#ms-fili'),
        masqueMsg = voile.querySelector('#ms-masque'), compte = voile.querySelector('#ms-compte'), barre = voile.querySelector('#ms-barre'), live = voile.querySelector('#ms-live');
      texte.textContent = r.contenu;

      /* 4. Filigrane : nom · date · heure · n° du message, en diagonale, sur toute la zone de texte. */
      var motif = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="150"><text x="200" y="80" text-anchor="middle" transform="rotate(-18 200 75)" font-family="Arial,sans-serif" font-size="12.5" font-weight="700" fill="#0D2B4E" fill-opacity="0.22">' + esc(r.filigrane) + '</text></svg>';
      fili.style.backgroundImage = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(motif) + '")';

      var interrompu = false;
      function interrompre(msg) {
        if (interrompu) return; interrompu = true;
        texte.textContent = '';
        lecture.classList.add('ms-masque'); masqueMsg.textContent = msg;
        var bd = voile.querySelector('[data-a="detruire"]'); if (bd) bd.textContent = 'Détruire le message';
      }
      /* Le filigrane doit rester présent et visible : retiré, caché ou rendu transparent → la lecture s'interrompt. */
      function verifierFiligrane() {
        if (interrompu || !voile.contains(lecture)) return;   // l'écran de lecture a été remplacé (fin, fermeture) : rien à surveiller
        var f = voile.querySelector('#ms-fili');
        if (!f || !lecture.contains(f)) return interrompre('Lecture interrompue : le filigrane a été retiré.');
        var cs = getComputedStyle(f);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.9 || cs.backgroundImage === 'none') interrompre('Lecture interrompue : le filigrane a été masqué.');
      }
      if (window.MutationObserver) {
        var obs = new MutationObserver(verifierFiligrane);
        obs.observe(lecture, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
        nettoyages.push(function () { obs.disconnect(); });
      }

      /* 1. Fenêtre inactive : le texte disparaît. */
      var masqueTimer = null;
      function masquer(msg, dureeMs) {
        if (interrompu) return;
        lecture.classList.add('ms-masque'); masqueMsg.textContent = msg;
        clearTimeout(masqueTimer);
        if (dureeMs) masqueTimer = setTimeout(demasquer, dureeMs);
      }
      function demasquer() {
        if (interrompu || document.hidden || (document.hasFocus && !document.hasFocus())) return;
        lecture.classList.remove('ms-masque');
      }
      nettoyages.push(function () { clearTimeout(masqueTimer); });
      ecouter(window, 'blur', function () { clearTimeout(masqueTimer); masquer('Fenêtre inactive : le message est masqué. Revenez sur cette fenêtre pour le lire (le décompte continue).'); });
      ecouter(window, 'focus', function () { masqueTimer = setTimeout(demasquer, 250); });
      ecouter(document, 'visibilitychange', function () { if (document.hidden) masquer('Onglet caché : le message est masqué.'); else masqueTimer = setTimeout(demasquer, 250); });
      ecouter(window, 'pagehide', function () { masquer('Message masqué.'); });
      if (document.hidden || (document.hasFocus && !document.hasFocus())) masquer('Fenêtre inactive : cliquez ici pour lire le message.');
      /* Un clic volontaire de la personne sur le message masqué le ré-affiche (elle a manifestement la fenêtre au premier plan). */
      ecouter(voile, 'click', function () { if (lecture.classList.contains('ms-masque') && !interrompu) { clearTimeout(masqueTimer); lecture.classList.remove('ms-masque'); } });

      /* 2. Clic droit, sélection, copie, glisser, impression. */
      ['contextmenu', 'selectstart', 'copy', 'cut', 'dragstart'].forEach(function (evt) { ecouter(voile, evt, function (e) { if (!/INPUT/.test((e.target || {}).tagName || '')) e.preventDefault(); }); });
      ecouter(window, 'beforeprint', function () { masquer('Impression impossible pour un message sécurisé.', 3000); });
      ecouter(window, 'keydown', function (e) {
        var k = (e.key || '').toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && (k === 'p' || k === 's' || k === 'c' || k === 'a' || k === 'x')) { e.preventDefault(); if (k === 'p') masquer('Impression impossible pour un message sécurisé.', 3000); }
      }, true);

      /* 3. Touche Impr écran et raccourcis de capture : masqué sur-le-champ. */
      function capture(e) {
        var k = e.key || '', c = e.code || '';
        var maj = e.shiftKey, meta = e.metaKey;
        var estCapture = k === 'PrintScreen' || c === 'PrintScreen' || k === 'Snapshot'
          || (meta && maj && (k.toLowerCase() === 's' || k === '3' || k === '4' || k === '5' || k === '#' || k === '$' || k === '%'))
          || (e.ctrlKey && maj && k.toLowerCase() === 's');
        if (!estCapture) return;
        masquer('Capture d’écran détectée : le message est masqué. Il porte votre nom.', 4000);
        try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(' ').catch(function () { /* refusé : sans importance */ }); } catch (er) { /* pas de presse-papiers */ }
      }
      ecouter(window, 'keydown', capture, true);
      ecouter(window, 'keyup', capture, true);

      /* Décompte (horloge du navigateur uniquement pour l'affichage : c'est le serveur qui détruit). */
      var derniereAnnonce = null;
      var tic = setInterval(function () {
        var reste = Math.max(0, fin - performance.now());
        compte.textContent = mmss(reste / 1000);
        barre.firstElementChild.style.transform = 'scaleX(' + Math.max(0, reste / total) + ')';
        var presque = reste <= 30000, finale = reste <= 10000;
        compte.className = 'ms-compte' + (finale ? ' ms-fin' : presque ? ' ms-presque' : '');
        barre.className = 'ms-barre' + (finale ? ' ms-fin' : presque ? ' ms-presque' : '');
        var annonce = reste <= 10000 ? '10' : reste <= 30000 ? '30' : reste <= 60000 ? '60' : null;
        if (annonce && annonce !== derniereAnnonce) { derniereAnnonce = annonce; live.textContent = 'Il reste moins de ' + annonce + ' secondes.'; }
        verifierFiligrane();
        if (reste <= 0) { clearInterval(tic); detruit('Le temps est écoulé : ce message est détruit.'); }
      }, 250);
      nettoyages.push(function () { clearInterval(tic); });

      function detruit(msg) { texte.textContent = ''; etapeFin(msg); }
      voile.querySelector('[data-a="detruire"]').onclick = function () {
        var b = this; b.disabled = true;
        appel('POST', '/api/messages-securises/' + encodeURIComponent(id) + '/detruire').then(function () { clearInterval(tic); detruit('Le message a été détruit.'); })
          .catch(function (e) { b.disabled = false; interrompre(e.message); });
      };
      voile.querySelector('[data-a="fermer"]').onclick = fermer;   // masque seulement : il reste lisible jusqu'à la fin des 2 minutes
      lecture.focus();
    }

    /* Un message déjà « en lecture » ou « fermé » passe par l'avertissement puis le DS-ID, comme à la première fois. */
    etapePret();
  }

  window.MessageSecurise = { brancherComposeur: brancherComposeur, actif: actif, envoyer: envoyer, ligneSite: ligneSite, ligneTel: ligneTel, lier: lier, ouvrir: ouvrir, signature: signature, css: css, ICONE: ICONE };
})();
