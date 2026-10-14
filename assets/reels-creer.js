/* ============================================================
   Diaspo'Actif — Création d'un Reel (2026-10-14, demande explicite)
   « Dans le même bouton, créer des Reels et en regarder, pour tous les comptes. »

   Fenêtre autonome (feuille qui monte du bas sur téléphone), au design « Nuit dorée » : choisir ou filmer une vidéo, la contrôler, écrire une
   légende, publier. La vidéo part DIRECTEMENT du navigateur vers Bunny Stream (assets/reels-upload.js) ; la publication passe ensuite par
   POST /api/fil avec la seule preuve d'envoi (guid + jeton) : c'est le serveur qui construit le média (voir server/index.js, « REEL »).
   Ouverte à tous les comptes connectés, quel que soit leur type.

   API : window.ReelsCreer = { ouvrir({ onLogin, onPublie }) }
     onLogin()      — appelée si le visiteur n'est pas connecté (téléphone : ouvre sa fenêtre de connexion) ; sinon lien vers login.html.
     onPublie(post) — appelée après la publication ({ post_id }), p. ex. pour recharger les Reels ou le profil.
   ============================================================ */
(function () {
  'use strict';
  if (window.ReelsCreer) return;
  var VERSION = '20261014a';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var CAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="13.5" height="12" rx="3.2" fill="currentColor"/><path d="M17.2 10.4l4.2-2.5a.7.7 0 0 1 1.05.6v7a.7.7 0 0 1-1.05.6l-4.2-2.5z" fill="currentColor"/></svg>';

  function css() {
    if (document.getElementById('rc-css')) return;
    var s = document.createElement('style'); s.id = 'rc-css';
    s.textContent = [
      '.rc-fond{position:fixed;inset:0;z-index:2147483200;background:rgba(3,6,14,.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit;animation:rcF .25s ease}',
      '@keyframes rcF{from{opacity:0}to{opacity:1}}@keyframes rcM{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}',
      '.rc-fen{position:relative;width:min(540px,100%);max-height:calc(100vh - 40px);overflow:auto;border-radius:26px;border:1px solid rgba(227,192,110,.4);color:#E8ECF6;box-shadow:0 40px 80px -30px #000;animation:rcM .3s ease;',
      'background:radial-gradient(420px 220px at 100% 0%,rgba(227,192,110,.18),transparent 66%),linear-gradient(160deg,#14234a 0%,#0B1226 62%);scrollbar-width:thin;scrollbar-color:rgba(227,192,110,.4) transparent;-webkit-user-select:none;user-select:none}',
      '.rc-tete{display:flex;align-items:center;gap:14px;padding:20px 20px 4px}',
      '.rc-ic{flex:none;width:48px;height:48px;border-radius:16px;display:grid;place-items:center;color:#E3C06E;background:rgba(227,192,110,.12);border:1px solid rgba(227,192,110,.45)}',
      '.rc-ic svg{width:26px;height:26px}',
      '.rc-tete h2{margin:0;flex:1;font-family:"Bodoni Moda","Didot",Georgia,serif;font-weight:500;font-size:25px;line-height:1.15;color:#fff}',
      '.rc-x{flex:none;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font-size:18px;cursor:pointer}',
      '.rc-corps{padding:6px 20px 22px;display:flex;flex-direction:column;gap:14px}',
      '.rc-p{margin:0;font-size:14.5px;line-height:1.55;color:#C7D4E8}',
      '.rc-p small{display:block;margin-top:6px;font-size:12.5px;color:#A9B4CC}',
      '.rc-choix{display:flex;flex-direction:column;gap:10px}',
      '.rc-bout{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:50px;padding:0 20px;border-radius:999px;border:0;font:inherit;font-size:15px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#F3DC9A,#B9893A);color:#1a1202;text-decoration:none}',
      '.rc-bout.sec{background:transparent;border:1px solid rgba(227,192,110,.6);color:#E3C06E}',
      '.rc-bout:disabled{opacity:.55;cursor:default}',
      '.rc-bout svg{width:20px;height:20px}',
      '.rc-fen :is(.rc-bout,.rc-x):focus-visible,.rc-fen textarea:focus-visible{outline:3px solid #E3C06E;outline-offset:2px}',
      '.rc-vid{width:100%;max-height:min(46vh,380px);border-radius:18px;background:#000;object-fit:contain}',
      '.rc-meta{display:flex;flex-wrap:wrap;gap:8px}',
      '.rc-pastille{padding:6px 12px;border-radius:999px;border:1px solid rgba(227,192,110,.4);background:rgba(255,255,255,.06);font-size:12.5px;font-weight:700;color:#F3E3B5}',
      '.rc-avis{padding:11px 14px;border-radius:14px;background:rgba(227,192,110,.1);border:1px solid rgba(227,192,110,.35);font-size:13px;line-height:1.45;color:#F3E3B5}',
      '.rc-err{padding:12px 14px;border-radius:14px;background:rgba(255,120,120,.12);border:1px solid rgba(255,120,120,.4);font-size:13.5px;line-height:1.45;color:#FFD3D3}',
      '.rc-err a{color:#E3C06E;font-weight:800}',
      '.rc-fen label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:700;letter-spacing:.04em;color:#A9B4CC;margin:0}',
      '.rc-fen textarea{width:100%;box-sizing:border-box;min-height:84px;resize:vertical;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font:inherit;font-size:15px;line-height:1.45;padding:12px 14px;color-scheme:dark;-webkit-user-select:text;user-select:text}',
      '.rc-cpt{align-self:flex-end;font-size:12px;color:#7C88A4;font-weight:600}',
      '.rc-barre{height:10px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden}',
      '.rc-barre i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#F3DC9A,#B9893A);border-radius:999px;transform:scaleX(0);transform-origin:left center;transition:transform .3s}',
      '.rc-etat{font-size:14px;font-weight:700;color:#fff;text-align:center}',
      '.rc-ok{text-align:center;padding:10px 0}',
      '.rc-ok b{display:block;font-family:"Bodoni Moda","Didot",Georgia,serif;font-weight:500;font-size:24px;color:#fff;margin-bottom:6px}',
      '@media (max-width:640px){.rc-fond{align-items:flex-end;padding:0}.rc-fen{width:100%;max-height:94vh;border-radius:26px 26px 0 0}.rc-tete h2{font-size:23px}}',
      '@media (prefers-reduced-motion:reduce){.rc-fond,.rc-fen{animation:none}.rc-barre i{transition:none}}'
    ].join('');
    document.head.appendChild(s);
  }

  function chargerEnvoi() {
    if (window.ReelsUpload) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = '/assets/reels-upload.js?v=' + VERSION; s.onload = resolve;
      s.onerror = function () { reject(new Error('Le module d’envoi des vidéos ne s’est pas chargé. Vérifiez votre connexion et réessayez.')); };
      document.head.appendChild(s);
    });
  }
  function postJson(url, corps) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Erreur ' + r.status); e.status = r.status; e.data = j; throw e; } return j; });
    });
  }

  var racine = null, precedent = null;

  function ouvrir(options) {
    options = options || {};
    css();
    if (racine) racine.remove();
    precedent = document.activeElement;
    var E = { fichier: null, diag: null, url: null, envoi: null, annule: false, occupe: false, ctrl: null };

    racine = document.createElement('div'); racine.className = 'rc-fond';
    racine.innerHTML = '<div class="rc-fen" role="dialog" aria-modal="true" aria-labelledby="rc-t"><div class="rc-tete"><span class="rc-ic">' + CAM + '</span><h2 id="rc-t">Créer un Reel</h2><button type="button" class="rc-x" aria-label="Fermer">✕</button></div><div class="rc-corps"></div></div>';
    document.body.appendChild(racine);
    var corps = racine.querySelector('.rc-corps');

    function fermer(force) {
      if (!racine) return;
      if (E.occupe && !force && !window.confirm('Votre Reel est en cours d’envoi. Annuler l’envoi ?')) return;
      if (E.ctrl) { try { E.ctrl.abort(); } catch (e) { /* déjà fini */ } }
      E.annule = true;
      if (E.url) { try { URL.revokeObjectURL(E.url); } catch (e) { /* ignoré */ } }
      document.removeEventListener('keydown', touche, true);
      racine.remove(); racine = null;
      if (precedent && precedent.focus) { try { precedent.focus(); } catch (e) { /* ignoré */ } }
    }
    function touche(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); fermer(); } }
    document.addEventListener('keydown', touche, true);
    racine.addEventListener('click', function (ev) { if (ev.target === racine) fermer(); });
    racine.querySelector('.rc-x').onclick = function () { fermer(); };
    racine.querySelector('.rc-x').focus();

    function message(html, classe) { return '<div class="' + (classe || 'rc-err') + '" role="alert">' + html + '</div>'; }

    /* ── écrans ── */
    function ecranConnexion() {
      corps.innerHTML = '<p class="rc-p">Connectez-vous pour créer un Reel : tous les comptes peuvent publier de petites vidéos.</p>'
        + '<button type="button" class="rc-bout" data-a="login">Me connecter</button>';
      corps.querySelector('[data-a="login"]').onclick = function () {
        fermer(true);
        if (typeof options.onLogin === 'function') options.onLogin(); else location.href = 'login.html';
      };
    }
    function ecranIndispo(txt) {
      corps.innerHTML = '<p class="rc-p">' + esc(txt) + '</p><button type="button" class="rc-bout sec" data-a="ferme">Fermer</button>';
      corps.querySelector('[data-a="ferme"]').onclick = function () { fermer(); };
    }
    function ecranChoix(erreur) {
      corps.innerHTML = '<p class="rc-p">Une petite vidéo de 3 à 90 secondes, idéalement verticale (comme un Reel). Elle sera visible par toute la communauté, dans les Reels et sur votre profil public.<small>Formats MP4 ou MOV.</small></p>'
        + (erreur ? message(esc(erreur)) : '')
        + '<div class="rc-choix"><button type="button" class="rc-bout" data-a="filmer">' + CAM + ' Filmer maintenant</button>'
        + '<button type="button" class="rc-bout sec" data-a="choisir">Choisir une vidéo de mon appareil</button></div>'
        + '<input type="file" id="rc-f-filmer" accept="video/*" capture="environment" hidden><input type="file" id="rc-f-choisir" accept="video/mp4,video/quicktime,.mp4,.mov" hidden>';
      var f1 = corps.querySelector('#rc-f-filmer'), f2 = corps.querySelector('#rc-f-choisir');
      corps.querySelector('[data-a="filmer"]').onclick = function () { f1.click(); };
      corps.querySelector('[data-a="choisir"]').onclick = function () { f2.click(); };
      f1.onchange = f2.onchange = function (ev) { var f = ev.target.files && ev.target.files[0]; if (f) choisir(f); };
    }
    function choisir(file) {
      corps.innerHTML = '<p class="rc-etat">Vérification de la vidéo…</p>';
      ReelsUpload.inspecter(file).then(function (diag) {
        if (!racine) return;
        if (!diag.ok) { ecranChoix(diag.erreur); return; }
        E.fichier = file; E.diag = diag;
        if (E.url) URL.revokeObjectURL(E.url);
        E.url = URL.createObjectURL(file);
        ecranPrevisu();
      }, function (e) { ecranChoix(e.message || 'Cette vidéo ne peut pas être lue.'); });
    }
    function ecranPrevisu(erreur) {
      var d = E.diag || {}, cadre = { vertical: 'Vertical', '4:5': '4:5', carre: 'Carré', horizontal: 'Horizontal' }[d.cadre] || '';
      corps.innerHTML = '<video class="rc-vid" src="' + esc(E.url) + '" controls playsinline muted preload="metadata"></video>'
        + '<div class="rc-meta">' + (d.duree ? '<span class="rc-pastille">' + Math.round(d.duree) + ' s</span>' : '') + (cadre ? '<span class="rc-pastille">' + esc(cadre) + '</span>' : '')
        + '<span class="rc-pastille">' + (E.fichier.size / 1048576 < 10 ? (E.fichier.size / 1048576).toFixed(1) : Math.round(E.fichier.size / 1048576)) + ' Mo</span></div>'
        + (d.avertissements && d.avertissements.length ? d.avertissements.map(function (a) { return message(esc(a), 'rc-avis'); }).join('') : '')
        + (erreur ? message(esc(erreur)) : '')
        + '<label for="rc-leg">Légende <small style="font-weight:500;letter-spacing:0">(facultative — vous pouvez ajouter des #mots-clés)</small></label>'
        + '<textarea id="rc-leg" maxlength="300" placeholder="Dites en quelques mots de quoi parle votre Reel…"></textarea><span class="rc-cpt" id="rc-cpt">0/300</span>'
        + '<button type="button" class="rc-bout" data-a="publier">' + CAM + ' Publier le Reel</button>'
        + '<button type="button" class="rc-bout sec" data-a="changer">Changer de vidéo</button>';
      var leg = corps.querySelector('#rc-leg'), cpt = corps.querySelector('#rc-cpt');
      if (E.legende) { leg.value = E.legende; cpt.textContent = leg.value.length + '/300'; }
      leg.oninput = function () { E.legende = leg.value; cpt.textContent = leg.value.length + '/300'; };
      corps.querySelector('[data-a="publier"]').onclick = publier;
      corps.querySelector('[data-a="changer"]').onclick = function () { E.fichier = null; E.envoi = null; ecranChoix(); };
    }
    function ecranProgres(texte, pct) {
      corps.innerHTML = '<p class="rc-etat" id="rc-et">' + esc(texte) + '</p><div class="rc-barre" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + (pct || 0) + '"><i style="transform:scaleX(' + ((pct || 0) / 100) + ')"></i></div>'
        + '<p class="rc-p" style="text-align:center">Gardez cette fenêtre ouverte jusqu’à la fin.</p>';
    }
    function majProgres(texte, pct) {
      var et = corps.querySelector('#rc-et'), b = corps.querySelector('.rc-barre');
      if (!et || !b) return ecranProgres(texte, pct);
      et.textContent = texte; b.querySelector('i').style.transform = 'scaleX(' + ((pct || 0) / 100) + ')'; b.setAttribute('aria-valuenow', pct || 0);
    }
    function ecranSucces(postId) {
      corps.innerHTML = '<div class="rc-ok"><b>Votre Reel est publié ✓</b><p class="rc-p">Il est visible dans les Reels et sur votre profil public.</p></div>'
        + '<button type="button" class="rc-bout" data-a="voir">Voir mon Reel</button><button type="button" class="rc-bout sec" data-a="ferme">Fermer</button>';
      corps.querySelector('[data-a="voir"]').onclick = function () { fermer(true); if (typeof options.onPublie === 'function') options.onPublie({ post_id: postId }); };
      corps.querySelector('[data-a="ferme"]').onclick = function () { fermer(true); if (typeof options.onPublie === 'function') options.onPublie({ post_id: postId, silencieux: true }); };
    }

    /* ── publication : envoi → traitement → enregistrement du Reel ── */
    function publier() {
      if (E.occupe) return;
      E.occupe = true; E.ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
      var legende = (E.legende || '').trim();
      var etape1 = E.envoi ? Promise.resolve(E.envoi) : (ecranProgres('Envoi de la vidéo… 0 %', 0), ReelsUpload.envoyer(E.fichier, {
        titre: legende.slice(0, 60) || 'Reel', signal: E.ctrl && E.ctrl.signal,
        onProgress: function (p) { if (racine) majProgres('Envoi de la vidéo… ' + p + ' %', p); }
      }));
      etape1.then(function (env) {
        E.envoi = env; if (E.annule) throw new Error('Envoi annulé.');
        majProgres('Préparation de la vidéo…', 100);
        return ReelsUpload.attendrePret(env.guid, env.jeton, { onEtat: function (e) { if (racine) majProgres(e.etat === 'traitement' ? 'Préparation de la vidéo… ' + Math.round(e.progression || 0) + ' %' : 'Préparation de la vidéo…', 100); } });
      }).then(function () {
        if (E.annule) throw new Error('Envoi annulé.');
        majProgres('Publication…', 100);
        return postJson('/api/fil', { reel: { guid: E.envoi.guid, jeton: E.envoi.jeton }, contenu: legende, pub_type: 'video' });
      }).then(function (r) {
        E.occupe = false;
        if (!racine) return;
        var id = r && (r.id || (r.post && r.post.id) || r.post_id);
        ecranSucces(Number(id) || null);
      }).catch(function (e) {
        E.occupe = false;
        if (!racine || E.annule) return;
        if (e && e.status === 409 && e.data && e.data.post_id) { ecranSucces(Number(e.data.post_id)); return; }   // déjà publié (double appui)
        /* La vidéo envoyée reste valable : on peut réessayer la publication sans la renvoyer. */
        ecranPrevisu((e && e.message) || 'La publication n’a pas abouti. Réessayez.');
      });
    }

    /* ── démarrage : connexion, activation de l'hébergement vidéo ── */
    corps.innerHTML = '<p class="rc-etat">Chargement…</p>';
    fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (me) {
      if (!racine) return;
      if (!me || !(me.user || me.id)) { ecranConnexion(); return; }
      return chargerEnvoi().then(function () { return ReelsUpload.config(); }).then(function (spec) {
        if (!racine) return;
        if (!spec || !spec.actif) { ecranIndispo('L’envoi de Reels sera disponible très bientôt. Merci de votre patience !'); return; }
        ecranChoix();
      });
    }).catch(function (e) { if (racine) ecranIndispo((e && e.message) || 'Impossible de préparer l’envoi pour le moment.'); });
  }

  window.ReelsCreer = { ouvrir: ouvrir };
})();
