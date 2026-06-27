/* ============================================================
   DIASPO'ACTIF — Tour de démonstration interactif
   - Déclenché à la 1ère connexion (nb_connexions === 1)
   - Réactivable via bouton "Revoir la démo" dans la barre
   ============================================================ */
(function () {
  'use strict';

  /* ── Étapes communes à tous les rôles ── */
  const STEPS_COMMUN = [
    {
      el: null,
      titre: "🎉 Bienvenue sur Diaspo'Actif !",
      desc: "En quelques étapes, découvrez comment utiliser la plateforme pour connecter vos projets, valoriser vos talents et renforcer votre réseau diaspora partout dans le monde.",
      pos: 'center'
    },
    {
      el: 'a[href="annuaire.html"]',
      titre: "🔍 L'Annuaire mondial",
      desc: "Trouvez des initiatives, des profils et des organisations de la diaspora dans plus de 28 pays. Filtrez par domaine, nationalité ou localisation.",
      pos: 'bottom'
    },
    {
      el: 'a[href="fil-actualite.html"]',
      titre: "📰 Le Fil d'actualité",
      desc: "Suivez les publications des membres, partagez vos actualités, réagissez et commentez. C'est le cœur de la communauté Diaspo'Actif.",
      pos: 'bottom'
    },
    {
      el: 'a[href="evenements.html"]',
      titre: "📅 Événements & Formations",
      desc: "Découvrez les événements diaspora près de chez vous et les formations disponibles. Participez, organisez, apprenez.",
      pos: 'bottom'
    },
    {
      el: '#oz-fab, .oz-fab, [id*="chatbot-fab"], button[onclick*="oz"], #chatbot-fab',
      titre: "🤖 O-Z, votre assistant",
      desc: "O-Z répond à toutes vos questions, vous aide à trouver des membres, des opportunités et à naviguer. Cliquez sur l'icône en bas à droite pour l'ouvrir.",
      pos: 'top'
    }
  ];

  /* ── Étapes spécifiques par rôle ── */
  const STEPS_ROLE = {
    utilisateur: {
      el: 'a[href="messagerie.html"]',
      titre: "💬 La Messagerie",
      desc: "Contactez directement n'importe quel membre, initiative ou partenaire. Collaborez, négociez et construisez vos projets en privé.",
      pos: 'bottom'
    },
    initiative: {
      el: null,
      titre: "🌱 Gérez votre initiative",
      desc: "En tant qu'initiative, publiez des opportunités, recrutez des bénévoles, organisez des événements et proposez des Deals de collaboration. Votre tableau de bord vous attend.",
      pos: 'center'
    },
    administrateur: {
      el: 'a[href="dashboard-administrateur.html"]',
      titre: "⚙️ Votre dashboard admin",
      desc: "Accédez au tableau de bord pour modérer la plateforme, gérer les utilisateurs, les Partenaires Officiels, le Deal Master et les paramètres globaux.",
      pos: 'bottom'
    },
    collectivite: {
      el: null,
      titre: "🏛️ Espace institutionnel",
      desc: "En tant que collectivité, accédez à l'Observatoire Diaspora pour analyser les données, diffuser des communications officielles et lancer des consultations ciblées.",
      pos: 'center'
    }
  };

  const STEP_FINAL = {
    el: null,
    titre: "✅ Vous êtes prêt !",
    desc: "Votre compte est actif. Complétez votre profil pour être visible par la communauté, puis commencez à explorer et à collaborer.",
    pos: 'center',
    cta: true
  };

  function buildSteps(role) {
    const steps = [...STEPS_COMMUN];
    if (STEPS_ROLE[role]) steps.push(STEPS_ROLE[role]);
    steps.push(STEP_FINAL);
    return steps;
  }

  /* ── CSS injecté une seule fois ── */
  function injectStyles() {
    if (document.getElementById('da-demo-style')) return;
    const s = document.createElement('style');
    s.id = 'da-demo-style';
    s.textContent = `
      #da-demo-overlay{display:none;position:fixed;inset:0;z-index:99997;pointer-events:none;}
      #da-demo-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99997;pointer-events:all;}
      #da-demo-spotlight{
        position:fixed;border-radius:10px;z-index:99998;pointer-events:none;
        box-shadow:0 0 0 4px rgba(59,130,246,.6),0 0 0 9999px rgba(0,0,0,.65);
        transition:all .35s cubic-bezier(.4,0,.2,1);
      }
      #da-demo-card{
        position:fixed;background:#fff;border-radius:18px;padding:26px 24px 20px;width:340px;
        box-shadow:0 24px 80px rgba(0,0,0,.28);z-index:99999;pointer-events:all;
        transition:top .35s cubic-bezier(.4,0,.2,1),left .35s cubic-bezier(.4,0,.2,1),bottom .35s cubic-bezier(.4,0,.2,1);
      }
      #da-demo-progress{text-align:center;margin-bottom:14px;}
      #da-demo-title{font-size:16px;font-weight:900;color:#0D1B2A;margin:0 0 8px;line-height:1.3;}
      #da-demo-desc{font-size:13px;color:#475569;line-height:1.65;margin:0 0 12px;}
      #da-demo-cta-block{margin-bottom:12px;display:flex;flex-wrap:wrap;gap:8px;}
      .da-cta-btn{display:inline-block;border-radius:9px;padding:9px 16px;font-size:12px;font-weight:700;text-decoration:none;border:none;cursor:pointer;}
      .da-cta-primary{background:#1e3a8a;color:#fff;}
      .da-cta-secondary{background:#f0fdf4;color:#15803d;border:1.5px solid #bbf7d0;}
      #da-demo-nav{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #f1f5f9;}
      #da-demo-skip{background:none;border:none;color:#94a3b8;font-size:12px;cursor:pointer;text-decoration:underline;padding:0;}
      #da-demo-skip:hover{color:#64748b;}
      .da-nav-btns{display:flex;gap:8px;}
      #da-demo-prev,#da-demo-next{border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;transition:background .15s;}
      #da-demo-prev{background:#f1f5f9;color:#475569;}
      #da-demo-prev:hover{background:#e2e8f0;}
      #da-demo-next{background:#1e3a8a;color:#fff;}
      #da-demo-next:hover{background:#1e40af;}
      .da-revoir-btn{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.25);color:#fff;border-radius:8px;padding:5px 11px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;transition:background .15s;}
      .da-revoir-btn:hover{background:rgba(255,255,255,.2);}
    `;
    document.head.appendChild(s);
  }

  /* ── Construire le DOM overlay ── */
  function buildOverlay() {
    const existing = document.getElementById('da-demo-overlay');
    if (existing) existing.remove();
    const wrap = document.createElement('div');
    wrap.id = 'da-demo-overlay';
    wrap.innerHTML = `
      <div id="da-demo-backdrop"></div>
      <div id="da-demo-spotlight"></div>
      <div id="da-demo-card">
        <div id="da-demo-progress"></div>
        <h3 id="da-demo-title"></h3>
        <p id="da-demo-desc"></p>
        <div id="da-demo-cta-block" style="display:none;">
          <a href="profil.html" class="da-cta-btn da-cta-primary">✏️ Compléter mon profil</a>
          <a href="annuaire.html" class="da-cta-btn da-cta-secondary">🔍 Explorer l'annuaire</a>
        </div>
        <div id="da-demo-nav">
          <button id="da-demo-skip">Passer la démo</button>
          <div class="da-nav-btns">
            <button id="da-demo-prev" style="display:none;">← Précédent</button>
            <button id="da-demo-next">Suivant →</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    return wrap;
  }

  /* ── Trouver l'élément cible ── */
  function findEl(selector) {
    if (!selector) return null;
    for (const sel of selector.split(',').map(s => s.trim())) {
      try { const el = document.querySelector(sel); if (el) return el; } catch(e) {}
    }
    return null;
  }

  /* ── Positionner la card ── */
  function positionCard(card, targetEl, pos) {
    card.style.transform = 'none';
    card.style.top = card.style.left = card.style.bottom = card.style.right = 'auto';
    if (!targetEl || pos === 'center') {
      card.style.top  = '50%';
      card.style.left = '50%';
      card.style.transform = 'translate(-50%,-50%)';
      return;
    }
    const r = targetEl.getBoundingClientRect();
    const cw = 340, ch = 220;
    const lft = Math.max(10, Math.min(r.left, window.innerWidth - cw - 10));
    if (pos === 'bottom' && r.bottom + ch + 16 < window.innerHeight) {
      card.style.top  = (r.bottom + 12) + 'px';
      card.style.left = lft + 'px';
    } else {
      card.style.bottom = (window.innerHeight - r.top + 12) + 'px';
      card.style.left   = lft + 'px';
    }
  }

  /* ── Spotlight ── */
  function spotlight(sp, targetEl) {
    if (!targetEl) { sp.style.display = 'none'; return; }
    const r = targetEl.getBoundingClientRect(), p = 8;
    Object.assign(sp.style, {
      display: 'block',
      left:   (r.left - p) + 'px',
      top:    (r.top  - p) + 'px',
      width:  (r.width  + p*2) + 'px',
      height: (r.height + p*2) + 'px'
    });
  }

  /* ── Lancer le tour ── */
  function launch(role) {
    injectStyles();
    const steps   = buildSteps(role || 'utilisateur');
    const overlay = buildOverlay();
    const card    = document.getElementById('da-demo-card');
    const sp      = document.getElementById('da-demo-spotlight');
    const titleEl = document.getElementById('da-demo-title');
    const descEl  = document.getElementById('da-demo-desc');
    const progEl  = document.getElementById('da-demo-progress');
    const ctaEl   = document.getElementById('da-demo-cta-block');
    const nextBtn = document.getElementById('da-demo-next');
    const prevBtn = document.getElementById('da-demo-prev');
    const skipBtn = document.getElementById('da-demo-skip');
    let cur = 0;

    function render() {
      const step = steps[cur];
      progEl.innerHTML = steps.map((_,i) =>
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 3px;background:${i===cur?'#1e3a8a':'#cbd5e1'};transition:background .2s;"></span>`
      ).join('');
      titleEl.textContent = step.titre;
      descEl.textContent  = step.desc;
      ctaEl.style.display = step.cta ? 'flex' : 'none';
      prevBtn.style.display = cur > 0 ? 'inline-block' : 'none';
      skipBtn.style.display = cur === steps.length-1 ? 'none' : 'inline-block';
      nextBtn.textContent   = cur === steps.length-1 ? 'Terminer ✓' : 'Suivant →';
      const targetEl = findEl(step.el);
      spotlight(sp, targetEl);
      positionCard(card, targetEl, step.pos);
      if (targetEl) targetEl.scrollIntoView({ behavior:'smooth', block:'center', inline:'nearest' });
    }

    function finish() {
      overlay.style.display = 'none';
      overlay.remove();
      fetch('/api/demo/vu', { method:'POST', credentials:'include' }).catch(()=>{});
      localStorage.setItem('da_demo_vu', '1');
    }

    nextBtn.addEventListener('click', () => { if (cur === steps.length-1) finish(); else { cur++; render(); } });
    prevBtn.addEventListener('click', () => { if (cur > 0) { cur--; render(); } });
    skipBtn.addEventListener('click', finish);
    document.getElementById('da-demo-backdrop').addEventListener('click', finish);

    overlay.style.display = 'block';
    render();
  }

  /* ── API publique ── */
  window.DADemo = {
    launch,
    /* Appelé depuis app.js avec l'objet user déjà chargé */
    checkUser(user) {
      if (!user) return;
      if (user.demo_vue) { localStorage.setItem('da_demo_vu','1'); return; }
      if (localStorage.getItem('da_demo_vu') === '1') return;
      if (user.nb_connexions === 1) {
        setTimeout(() => launch(user.role), 1800);
      }
    }
  };
})();
