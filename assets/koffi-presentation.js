/* ═════════════════════════════════════════════════
   assets/koffi-presentation.js — PRÉSENTATION DE KOFFI À LA PREMIÈRE CONNEXION (2026-10-31)

   Demande explicite : « lors de la première connexion, élèves comme formateurs, une petite présentation de Koffi avec une mise en scène : une question posée à Koffi
   ou une demande qui lui est formulée ». C'est une scène JOUÉE (texte écrit d'avance, aucun appel à l'IA, aucun coût, rien n'est compté) :
     • élève     : il pose une question sur le cours → Koffi répond avec sa source → il demande « Que sais-tu faire ? » → réponse gratuite.
     • formateur : il demande une carte mentale pour un chapitre → Koffi PROPOSE une mission (rien n'est créé sans « Appliquer ») → « Que sais-tu faire ? » → gratuit.
   Utilisée par assets/koffi-widget.js (élève) et assets/koffi-createur.js (formateur), qui chargent ce fichier au besoin et mémorisent la fin côté serveur
   (POST /api/kofi/presentation : une fois par compte et par rôle).

   Usage : KoffiPresentation.monter(conteneur, { role: 'eleve' | 'createur', lg: 'fr' | 'en', onFin: function () {} })
   « Passer » est toujours disponible ; avec « réduire les animations » activé, tout s'affiche d'un coup.
   ═════════════════════════════════════════════════ */
(function () {
  if (window.KoffiPresentation) return;

  var TXT = {
    fr: {
      titre: 'Présentation de Koffi', passer: 'Passer', revoir: 'Revoir', exemple: 'Exemple de conversation — pour vous montrer, rien n\'est réel ici',
      bonjour: 'Bonjour, je suis Koffi 👋',
      eleveSous: 'Votre tuteur pour cette formation. Regardez comment je travaille.',
      eleveQ1: 'Peux-tu m\'expliquer ce chapitre en deux phrases ?',
      eleveR1: 'Bien sûr ! D\'après votre cours : on commence par poser les bases, puis on les applique pas à pas. [1]',
      eleveSrc: 'Module 1 › Chapitre 2 › Leçon 1',
      eleveQ2: 'Que sais-tu faire ?',
      eleveR2: 'Je réponds à vos questions sur le cours en citant la source, j\'explique autrement, je résume la leçon en cours et je vous aide à réviser — en français ou en anglais. Demandez-moi, je vous dis tout.',
      eleveGratuit: '✓ Une question sur Koffi est gratuite : elle ne compte pas dans vos questions.',
      eleveFinTitre: 'À vous de jouer !', eleveFinTexte: 'Posez votre première question quand vous voulez. Pour tout savoir sur ce que je sais faire, écrivez-moi : « Que sais-tu faire ? »', eleveCta: 'Poser ma première question',
      creaSous: 'Votre assistant de création de formation. Regardez comment je travaille.',
      creaQ1: 'Crée une carte mentale du module 1 et intègre-la au chapitre 3.',
      creaR1: 'Avec plaisir ! Voici ma proposition. Rien ne sera créé tant que vous n\'aurez pas cliqué « Appliquer ».',
      creaMission: '🧠 Carte mentale du module 1', creaMissionSous: 'Intégrée au chapitre 3 sous forme de leçon facultative', creaAppliquer: 'Appliquer', creaAnnuler: 'Annuler',
      creaQ2: 'Que sais-tu faire ?',
      creaR2: 'Je vous guide dans tous les outils de l\'éditeur, je propose de créer modules, chapitres, leçons et cartes mentales, et j\'organise un long texte collé en chapitres sans changer un mot. Demandez-moi la liste complète quand vous voulez.',
      creaGratuit: '✓ Une question sur Koffi est gratuite : elle ne compte pas dans vos messages.',
      creaFinTitre: 'À vous de jouer !', creaFinTexte: 'Décrivez-moi votre formation ou donnez-moi une petite mission. Pour tout savoir sur ce que je sais faire, écrivez-moi : « Que sais-tu faire ? »', creaCta: 'Commencer',
    },
    /* Conseiller d'orientation de l'Annuaire (français seulement) : trois profils FICTIFS avec leur pourcentage de correspondance — rien de réel, aucun appel. */
    an: {
      anSous: 'Votre conseiller de l\'Annuaire. Regardez comment je trouve le bon interlocuteur.',
      anQ1: 'Je cherche une avocate en droit des affaires, à Abidjan.',
      anR1: 'Voici trois profils qui correspondent. Cliquez sur celui qui vous intéresse pour ouvrir son profil public. Pour affiner, précisez le type de profil (personne, initiative, collectivité).',
      anP: [['Profil fictif A', 'Avocate · Abidjan, Côte d\'Ivoire', '94 %'], ['Profil fictif B', 'Cabinet juridique · Abidjan, Côte d\'Ivoire', '81 %'], ['Profil fictif C', 'Juriste d\'entreprise · Dakar, Sénégal', '63 %']],
      anQ2: 'Que sais-tu faire ?',
      anR2: 'Je vous aide à trouver, dans l\'Annuaire, des personnes, des initiatives ou des collectivités qui correspondent à votre besoin, avec un pourcentage de correspondance. Je ne propose que des comptes Premium qui ont une photo et un descriptif, et qui acceptent d\'être proposés. Demandez-moi autant de fois que vous voulez ce que je sais faire : c\'est gratuit.',
      anGratuit: '✓ Une question sur Koffi est gratuite : elle ne compte pas dans votre crédit.',
      anFinTitre: 'À vous de jouer !', anFinTexte: 'Décrivez ce que vous cherchez (un métier, un domaine, une ville…). Pour tout savoir sur ce que je sais faire, écrivez-moi : « Que sais-tu faire ? »', anCta: 'Lancer ma recherche'
    },
    en: {
      titre: 'Meet Koffi', passer: 'Skip', revoir: 'Replay', exemple: 'Sample conversation — just to show you, nothing here is real',
      bonjour: 'Hello, I\'m Koffi 👋',
      eleveSous: 'Your tutor for this course. Watch how I work.',
      eleveQ1: 'Can you explain this chapter in two sentences?',
      eleveR1: 'Of course! According to your course: we start by laying the foundations, then apply them step by step. [1]',
      eleveSrc: 'Module 1 › Chapter 2 › Lesson 1',
      eleveQ2: 'What can you do?',
      eleveR2: 'I answer your questions about the course and cite the source, explain things another way, summarise the lesson you are on and help you revise — in French or English. Just ask me, I will tell you everything.',
      eleveGratuit: '✓ A question about Koffi is free: it does not use any of your questions.',
      eleveFinTitre: 'Your turn!', eleveFinTexte: 'Ask your first question whenever you like. To learn everything I can do, write: “What can you do?”', eleveCta: 'Ask my first question',
    }
  };

  var CSS = [
    '.kp-root,.kp-root *{box-sizing:border-box}',
    '.kp-root{display:flex;flex-direction:column;gap:10px;font-family:inherit;color:#0f172a}',
    '.kp-tete{display:flex;align-items:center;gap:10px}',
    '.kp-tete img{width:52px;height:52px;border-radius:50%;background:#fff;flex:none;border:2px solid #F26422}',
    '.kp-tete b{display:block;font-size:16px;color:#0D2B4E;line-height:1.25}.kp-tete span{display:block;font-size:12.5px;color:#475569;line-height:1.35}',
    '.kp-tag{align-self:flex-start;font-size:10.5px;font-weight:800;color:#475569;background:#e2e8f0;border-radius:99px;padding:2px 10px}',
    '.kp-scene{display:flex;flex-direction:column;gap:8px;border:1px dashed #94a3b8;border-radius:14px;background:#f8fafc;padding:12px;min-height:150px}',
    '.kp-m{max-width:94%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.5;overflow-wrap:anywhere;animation:kp-ap .28s ease both}',
    '.kp-m.u{align-self:flex-end;background:#0D2B4E;color:#fff;border-bottom-right-radius:4px}',
    '.kp-m.a{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-bottom-left-radius:4px}',
    '.kp-ref{display:inline-block;min-width:18px;padding:0 5px;margin:0 1px;border-radius:6px;background:#fff3e6;color:#c2410c;font-weight:800;font-size:12px;text-align:center;border:1px solid #fdba74}',
    '.kp-src{margin-top:7px;padding-top:7px;border-top:1px dashed #cbd5e1;font-size:12px;color:#475569}.kp-src u{color:#0D2B4E}',
    '.kp-pts{align-self:flex-start;display:inline-flex;gap:4px;padding:10px 14px;border-radius:14px;background:#fff;border:1px solid #e2e8f0}',
    '.kp-pts i{width:7px;height:7px;border-radius:50%;background:#94a3b8;animation:kp-pt 1s infinite ease-in-out}.kp-pts i:nth-child(2){animation-delay:.15s}.kp-pts i:nth-child(3){animation-delay:.3s}',
    '.kp-mission{align-self:flex-start;max-width:94%;border:1.5px solid #fdba74;background:#fff7ed;border-radius:12px;padding:10px 12px;animation:kp-ap .28s ease both}',
    '.kp-mission b{display:block;font-size:13.5px;color:#7c2d12}.kp-mission span{display:block;font-size:12px;color:#9a3412;margin:2px 0 8px}',
    '.kp-mission div{display:flex;gap:8px}.kp-mission em{font-style:normal;font-size:12px;font-weight:800;border-radius:8px;padding:5px 12px}',
    '.kp-mission em.ok{background:#F26422;color:#fff}.kp-mission em.ko{background:#fff;color:#9a3412;border:1px solid #fdba74}',
    '.kp-props{align-self:stretch;display:flex;flex-direction:column;gap:6px;animation:kp-ap .28s ease both}',
    '.kp-prop{display:flex;align-items:center;gap:10px;border:1px solid #e2e8f0;background:#fff;border-radius:12px;padding:8px 10px}',
    '.kp-pct{flex:none;min-width:48px;text-align:center;font-weight:900;font-size:14px;color:#9a3412;background:#fff3e6;border:1px solid #fdba74;border-radius:99px;padding:3px 8px}',
    '.kp-prop-t b{display:block;font-size:13.5px;color:#0D2B4E}.kp-prop-t small{display:block;font-size:12px;color:#475569}',
    '.kp-gratuit{align-self:flex-start;max-width:94%;font-size:12px;font-weight:700;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:6px 10px;animation:kp-ap .28s ease both}',
    '.kp-fin{border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:14px;animation:kp-ap .28s ease both}',
    '.kp-fin h4{margin:0 0 6px;font-size:15px;color:#0D2B4E}.kp-fin p{margin:0 0 12px;font-size:13.5px;line-height:1.55}',
    '.kp-btns{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
    '.kp-cta{border:0;background:#F26422;color:#fff;font:800 14px inherit;font-family:inherit;padding:10px 18px;border-radius:10px;cursor:pointer}',
    '.kp-lien{border:0;background:none;color:#b84c1a;text-decoration:underline;font:700 13px inherit;font-family:inherit;cursor:pointer;padding:6px 4px}',
    '.kp-cta:focus-visible,.kp-lien:focus-visible{outline:3px solid #0D2B4E;outline-offset:2px}',
    '.kp-bas{display:flex;justify-content:flex-end}',
    '@keyframes kp-ap{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '@keyframes kp-pt{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}',
    '@media (prefers-reduced-motion:reduce){.kp-m,.kp-mission,.kp-props,.kp-gratuit,.kp-fin{animation:none}.kp-pts i{animation:none;opacity:.6}}'
  ].join('\n');

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function style() { if (document.getElementById('kp-style')) return; var s = document.createElement('style'); s.id = 'kp-style'; s.textContent = CSS; document.head.appendChild(s); }
  function sansAnimation() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }

  /* Le scénario : une suite d'étapes {t: type, …} jouées dans l'ordre. */
  function scenario(role, T) {
    if (role === 'createur') return [
      { t: 'u', texte: T.creaQ1 }, { t: 'a', texte: T.creaR1 }, { t: 'mission' },
      { t: 'u', texte: T.creaQ2 }, { t: 'a', texte: T.creaR2 }, { t: 'gratuit', texte: T.creaGratuit },
    ];
    if (role === 'annuaire') return [
      { t: 'u', texte: T.anQ1 }, { t: 'a', texte: T.anR1 }, { t: 'props' },
      { t: 'u', texte: T.anQ2 }, { t: 'a', texte: T.anR2 }, { t: 'gratuit', texte: T.anGratuit },
    ];
    return [
      { t: 'u', texte: T.eleveQ1 }, { t: 'a', texte: T.eleveR1, src: true },
      { t: 'u', texte: T.eleveQ2 }, { t: 'a', texte: T.eleveR2 }, { t: 'gratuit', texte: T.eleveGratuit },
    ];
  }

  function monter(conteneur, o) {
    o = o || {}; style();
    var role = o.role === 'createur' ? 'createur' : (o.role === 'annuaire' ? 'annuaire' : 'eleve');
    var T = role === 'annuaire' ? Object.assign({}, TXT.fr, TXT.an) : TXT[o.lg === 'en' && role === 'eleve' ? 'en' : 'fr'];
    var etapes = scenario(role, T);
    var cle = role === 'createur' ? 'crea' : (role === 'annuaire' ? 'an' : 'eleve');
    var root = document.createElement('section'); root.className = 'kp-root'; root.setAttribute('aria-label', T.titre);
    root.innerHTML =
      '<div class="kp-tete"><img src="/assets/koffi-avatar-96.webp" alt="" onerror="this.style.display=\'none\'"><div><b>' + esc(T.bonjour) + '</b><span>' + esc(T[cle + 'Sous']) + '</span></div></div>' +
      '<span class="kp-tag">' + esc(T.exemple) + '</span>' +
      '<div class="kp-scene" aria-live="polite"></div>' +
      '<div class="kp-bas"><button type="button" class="kp-lien" data-a="passer">' + esc(T.passer) + '</button></div>';
    conteneur.appendChild(root);
    var scene = root.querySelector('.kp-scene'), bas = root.querySelector('.kp-bas');
    var minuteur = null, jeton = 0, termine = false;

    function vivant() { return root.isConnected; }
    function pause(ms, suite, mon) { minuteur = setTimeout(function () { if (vivant() && mon === jeton) suite(); }, ms); }
    function descendre() { var p = root.parentNode; if (p && p.scrollHeight > p.clientHeight) p.scrollTop = p.scrollHeight; }

    function bulle(etape, instantane) {
      var d = document.createElement('div');
      if (etape.t === 'u') { d.className = 'kp-m u'; d.textContent = etape.texte; }
      else if (etape.t === 'a') {
        d.className = 'kp-m a';
        d.innerHTML = esc(etape.texte).replace(/\[1\]/g, '<span class="kp-ref">1</span>') + (etape.src ? '<div class="kp-src"><b>' + 'Sources' + '</b><div>[1] <u>' + esc(T.eleveSrc) + '</u></div></div>' : '');
      } else if (etape.t === 'mission') {
        d.className = 'kp-mission'; d.setAttribute('aria-hidden', 'true');
        d.innerHTML = '<b>' + esc(T.creaMission) + '</b><span>' + esc(T.creaMissionSous) + '</span><div><em class="ok">' + esc(T.creaAppliquer) + '</em><em class="ko">' + esc(T.creaAnnuler) + '</em></div>';
      } else if (etape.t === 'props') {
        d.className = 'kp-props'; d.setAttribute('aria-hidden', 'true');
        d.innerHTML = T.anP.map(function (p) { return '<div class="kp-prop"><span class="kp-pct">' + esc(p[2]) + '</span><span class="kp-prop-t"><b>' + esc(p[0]) + '</b><small>' + esc(p[1]) + '</small></span></div>'; }).join('');
      } else if (etape.t === 'gratuit') { d.className = 'kp-gratuit'; d.textContent = etape.texte; }
      scene.appendChild(d); descendre();
      return d;
    }

    function fin() {
      if (termine) return; termine = true; jeton++;
      clearTimeout(minuteur);
      scene.innerHTML = ''; etapes.forEach(function (e) { bulle(e, true); });
      root.querySelectorAll('.kp-m,.kp-mission,.kp-props,.kp-gratuit').forEach(function (n) { n.style.animation = 'none'; });
      bas.innerHTML = '';
      var f = document.createElement('div'); f.className = 'kp-fin';
      f.innerHTML = '<h4>' + esc(T[cle + 'FinTitre']) + '</h4><p>' + esc(T[cle + 'FinTexte']) + '</p><div class="kp-btns"><button type="button" class="kp-cta" data-a="fin">' + esc(T[cle + 'Cta']) + '</button><button type="button" class="kp-lien" data-a="revoir">' + esc(T.revoir) + '</button></div>';
      root.appendChild(f); descendre();
      var b = f.querySelector('[data-a="fin"]'); if (b && !sansAnimation()) { try { b.focus({ preventScroll: true }); } catch (e) { /* sans importance */ } }
    }

    function jouer(i, mon) {
      if (!vivant() || mon !== jeton) return;
      if (i >= etapes.length) { pause(900, fin, mon); return; }
      var e = etapes[i];
      if (e.t === 'u') {
        /* La question « se tape » lettre par lettre. */
        var d = document.createElement('div'); d.className = 'kp-m u'; scene.appendChild(d); var n = 0, texte = e.texte;
        (function taper() {
          if (!vivant() || mon !== jeton) return;
          n += 2; d.textContent = texte.slice(0, n); descendre();
          if (n < texte.length) minuteur = setTimeout(taper, 32); else pause(450, function () { jouer(i + 1, mon); }, mon);
        })();
      } else if (e.t === 'a') {
        /* Koffi « réfléchit » (trois points) puis répond. */
        var pts = document.createElement('div'); pts.className = 'kp-pts'; pts.innerHTML = '<i></i><i></i><i></i>'; scene.appendChild(pts); descendre();
        pause(900, function () { pts.remove(); bulle(e); pause(e.src ? 1300 : 1100, function () { jouer(i + 1, mon); }, mon); }, mon);
      } else {
        bulle(e); pause(e.t === 'mission' ? 1500 : 1100, function () { jouer(i + 1, mon); }, mon);
      }
    }

    function demarrer() {
      termine = false; jeton++; clearTimeout(minuteur); scene.innerHTML = '';
      var f = root.querySelector('.kp-fin'); if (f) f.remove();
      bas.innerHTML = '<button type="button" class="kp-lien" data-a="passer">' + esc(T.passer) + '</button>';
      if (sansAnimation()) { fin(); return; }
      var mon = jeton; pause(500, function () { jouer(0, mon); }, mon);
    }

    root.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-a]') : null; if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'passer') fin();
      else if (a === 'revoir') demarrer();
      else if (a === 'fin') { jeton++; clearTimeout(minuteur); if (typeof o.onFin === 'function') o.onFin(); }
    });
    demarrer();
    return { arreter: function () { jeton++; clearTimeout(minuteur); if (root.parentNode) root.parentNode.removeChild(root); } };
  }

  window.KoffiPresentation = { monter: monter };
})();
