/* ============================================================
   DIASPO'ACTIF — Tour de démonstration interactif
   - Déclenché à la 1ère connexion (nb_connexions === 1)
   - Réactivable via bouton "Revoir la démo" dans la barre
   ============================================================ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     TUTORIEL PAR RÔLE — centré sur le profil & le tableau de bord
     Chaque rôle a ses propres étapes adaptées à ses fonctionnalités
     ══════════════════════════════════════════════════════════ */

  const STEPS_PAR_ROLE = {

    /* ─── UTILISATEUR ─── */
    utilisateur: [
      {
        el: null, pos: 'center',
        titre: "👋 Bienvenue sur Diaspo'Actif !",
        desc: "Ce tutoriel vous guide pas à pas dans votre espace personnel. Découvrez tout ce que vous pouvez faire avec votre compte Membre.",
        badge: "Membre · Tutoriel de prise en main"
      },
      {
        el: '.user-chip, #nav-user-chip, .avatar',
        pos: 'bottom',
        titre: "🪪 Votre profil public",
        desc: "Cliquez sur votre nom pour accéder à votre profil. Ajoutez une photo, une biographie, votre titre professionnel et vos domaines d'expertise. Un profil complet est 5× plus visible dans l'annuaire.",
        lien: { href: 'profil.html', label: 'Compléter mon profil' }
      },
      {
        el: null, pos: 'center',
        titre: "🌍 Localisation & Nationalités",
        desc: "Dans votre profil, renseignez votre localisation et vos nationalités. Ces informations permettent aux initiatives de vous trouver et de vous proposer des opportunités ciblées.",
        lien: { href: 'profil.html', label: 'Voir mon profil' }
      },
      {
        el: 'a[href="fil-actualite.html"]',
        pos: 'bottom',
        titre: "📰 Le Fil d'actualité",
        desc: "Publiez des actualités, partagez vos réussites, commentez et réagissez aux posts de la communauté. Votre activité renforce votre visibilité sur la plateforme.",
        lien: { href: 'fil-actualite.html', label: 'Ouvrir le Fil' }
      },
      {
        el: 'a[href="messagerie.html"]',
        pos: 'bottom',
        titre: "💬 Messagerie privée",
        desc: "Contactez directement n'importe quel membre, initiative ou partenaire. Depuis l'annuaire ou un profil, cliquez sur « Contacter » pour démarrer une conversation.",
        lien: { href: 'messagerie.html', label: 'Ouvrir la messagerie' }
      },
      {
        el: 'a[href="offres.html"], a[href="deals.html"], a[href="fil-actualite.html"]',
        pos: 'bottom',
        titre: "🤝 Les Deals & Opportunités",
        desc: "Explorez les offres de collaboration publiées par les initiatives : bénévolat, emploi, partenariat. Vous pouvez aussi proposer votre aide ou vos compétences.",
        lien: { href: 'offres.html', label: 'Voir les opportunités' }
      },
      {
        el: '#oz-fab, .oz-fab, #chatbot-fab',
        pos: 'top',
        titre: "🤖 O-Z, votre assistant personnel",
        desc: "O-Z est disponible 24h/24. Posez-lui n'importe quelle question : trouver une initiative, comprendre une fonctionnalité, obtenir de l'aide. Cliquez sur l'icône en bas à droite.",
      },
      {
        el: null, pos: 'center', cta: 'utilisateur',
        titre: "✅ Vous êtes prêt à rejoindre la communauté !",
        desc: "Commencez par compléter votre profil pour être trouvé par les initiatives et d'autres membres de la diaspora."
      }
    ],

    /* ─── INITIATIVE ─── */
    initiative: [
      {
        el: null, pos: 'center',
        titre: "🌱 Bienvenue sur Diaspo'Actif !",
        desc: "Ce tutoriel vous guide dans la gestion de votre initiative. Découvrez comment maximiser votre visibilité et trouver des collaborateurs dans la diaspora mondiale.",
        badge: "Initiative · Tutoriel de prise en main"
      },
      {
        el: 'a[href="dashboard-initiative.html"]',
        pos: 'bottom',
        titre: "⚙️ Votre tableau de bord",
        desc: "C'est votre centre de contrôle : modifiez les informations de votre initiative, gérez vos publications, suivez vos statistiques de vues et d'interactions.",
        lien: { href: 'dashboard-initiative.html', label: 'Ouvrir mon tableau de bord' }
      },
      {
        el: null, pos: 'center',
        titre: "📋 Votre fiche initiative",
        desc: "Renseignez le nom, la description, les domaines d'action, les pays d'intervention et les objectifs de votre initiative. Plus votre fiche est complète, plus vous apparaissez dans les recherches.",
        lien: { href: 'dashboard-initiative.html', label: 'Compléter ma fiche' }
      },
      {
        el: 'a[href="offres.html"], a[href="deals.html"]',
        pos: 'bottom',
        titre: "📢 Publier des offres & opportunités",
        desc: "Diffusez vos appels à bénévoles, vos offres d'emploi, vos appels à partenariat. Les membres de la diaspora reçoivent des notifications selon leurs compétences.",
        lien: { href: 'offres.html', label: 'Créer une offre' }
      },
      {
        el: 'a[href="evenements.html"]',
        pos: 'bottom',
        titre: "📅 Gérer vos événements",
        desc: "Organisez des webinaires, des ateliers, des rencontres. Vos événements apparaissent dans le calendrier diaspora et sont promus auprès des membres de vos pays cibles.",
        lien: { href: 'evenements.html', label: 'Créer un événement' }
      },
      {
        el: 'a[href="messagerie.html"]',
        pos: 'bottom',
        titre: "💬 Messagerie & Candidatures",
        desc: "Recevez et répondez aux candidatures et messages directement dans la messagerie. Gardez un fil de discussion avec chaque candidat ou partenaire.",
        lien: { href: 'messagerie.html', label: 'Ouvrir la messagerie' }
      },
      {
        el: '#oz-fab, .oz-fab, #chatbot-fab',
        pos: 'top',
        titre: "🤖 O-Z — votre assistant",
        desc: "O-Z peut vous aider à rédiger vos offres, trouver des profils correspondant à vos besoins et répondre à vos questions sur la plateforme. Disponible à tout moment.",
      },
      {
        el: null, pos: 'center', cta: 'initiative',
        titre: "✅ Votre initiative est prête à rayonner !",
        desc: "Commencez par compléter votre fiche initiative pour apparaître dans l'annuaire et attirer vos premiers collaborateurs."
      }
    ],

    /* ─── ADMINISTRATEUR ─── */
    administrateur: [
      {
        el: null, pos: 'center',
        titre: "⚙️ Bienvenue Administrateur !",
        desc: "Ce tutoriel présente les outils de gestion et de modération de la plateforme Diaspo'Actif. Vous avez accès à l'ensemble des fonctions d'administration.",
        badge: "Administrateur · Tutoriel de prise en main"
      },
      {
        el: 'a[href="dashboard-administrateur.html"]',
        pos: 'bottom',
        titre: "🖥️ Votre Dashboard",
        desc: "Le tableau de bord centralise toutes vos actions : statistiques globales, modération, gestion des utilisateurs, partenaires officiels, Deal Master et paramètres système.",
        lien: { href: 'dashboard-administrateur.html', label: 'Ouvrir le Dashboard' }
      },
      {
        el: null, pos: 'center',
        titre: "👥 Gestion des utilisateurs",
        desc: "Depuis le Dashboard › Utilisateurs : consultez les profils, vérifiez les comptes, suspendez ou supprimez des membres. Vous pouvez aussi changer le rôle d'un utilisateur.",
        lien: { href: 'dashboard-administrateur.html#utilisateurs', label: 'Gérer les utilisateurs' }
      },
      {
        el: null, pos: 'center',
        titre: "🏅 Partenaires Officiels",
        desc: "Depuis le Dashboard › Partenaires : attribuez ou retirez le statut Partenaire Officiel, configurez la visibilité, le niveau de priorité et les domaines d'expertise affichés.",
        lien: { href: 'dashboard-administrateur.html#partenaires', label: 'Gérer les partenaires' }
      },
      {
        el: null, pos: 'center',
        titre: "🤝 Deal Master",
        desc: "Supervisez et validez les Deals proposés par les initiatives. Vous pouvez modérer les contenus, gérer les litiges et configurer les règles de la marketplace.",
        lien: { href: 'dashboard-administrateur.html#deals', label: 'Voir les Deals' }
      },
      {
        el: null, pos: 'center',
        titre: "💬 Modération des Témoignages",
        desc: "Approuvez ou refusez les témoignages soumis par les membres avant leur publication sur la page d'accueil. Un score de pertinence automatique vous aide à prioriser.",
        lien: { href: 'dashboard-administrateur.html#temoignages', label: 'Modérer les témoignages' }
      },
      {
        el: '#oz-fab, .oz-fab, #chatbot-fab',
        pos: 'top',
        titre: "🤖 O-Z — assistant admin",
        desc: "O-Z peut rechercher des utilisateurs, vérifier des statistiques ou répondre à vos questions sur la configuration de la plateforme.",
      },
      {
        el: null, pos: 'center', cta: 'administrateur',
        titre: "✅ Vous avez les clés de la plateforme !",
        desc: "Commencez par le Dashboard pour avoir une vue d'ensemble de l'activité en cours."
      }
    ],

    /* ─── COLLECTIVITÉ ─── */
    collectivite: [
      {
        el: null, pos: 'center',
        titre: "🏛️ Bienvenue dans votre espace institutionnel !",
        desc: "Ce tutoriel présente les fonctionnalités réservées aux collectivités et institutions partenaires de Diaspo'Actif.",
        badge: "Collectivité · Tutoriel de prise en main"
      },
      {
        el: 'a[href="dashboard-collectivite.html"], a[href="dashboard-institutionnel.html"]',
        pos: 'bottom',
        titre: "📊 Votre tableau de bord",
        desc: "Accédez aux statistiques de la diaspora sur vos territoires cibles, aux indicateurs d'engagement et aux rapports d'activité générés automatiquement.",
        lien: { href: 'dashboard-collectivite.html', label: 'Ouvrir mon tableau de bord' }
      },
      {
        el: null, pos: 'center',
        titre: "🌍 Votre profil institutionnel",
        desc: "Renseignez les services proposés, vos territoires d'action, vos programmes d'accueil et de soutien à la diaspora. Ces informations sont affichées dans l'annuaire public.",
        lien: { href: 'dashboard-collectivite.html', label: 'Compléter mon profil' }
      },
      {
        el: null, pos: 'center',
        titre: "📡 Observatoire Diaspora",
        desc: "Analysez les données agrégées de la diaspora : origines, compétences, secteurs d'activité. Ces données anonymisées vous aident à cibler vos politiques d'engagement.",
        lien: { href: 'statistiques.html', label: "Voir l'observatoire" }
      },
      {
        el: 'a[href="sondages.html"]',
        pos: 'bottom',
        titre: "🗳️ Consultations & Sondages",
        desc: "Lancez des consultations auprès des membres de la diaspora sur vos projets, vos politiques territoriales ou vos besoins en compétences spécifiques.",
        lien: { href: 'sondages.html', label: 'Créer un sondage' }
      },
      {
        el: 'a[href="messagerie.html"]',
        pos: 'bottom',
        titre: "💬 Messagerie institutionnelle",
        desc: "Communiquez directement avec les initiatives et les membres influents de la diaspora pour construire des partenariats durables.",
        lien: { href: 'messagerie.html', label: 'Ouvrir la messagerie' }
      },
      {
        el: '#oz-fab, .oz-fab, #chatbot-fab',
        pos: 'top',
        titre: "🤖 O-Z — votre assistant",
        desc: "O-Z peut vous aider à trouver des profils diaspora selon vos critères, générer des résumés de données et répondre à vos questions sur la plateforme.",
      },
      {
        el: null, pos: 'center', cta: 'collectivite',
        titre: "✅ Votre espace institutionnel est actif !",
        desc: "Commencez par compléter votre profil collectivité pour être visible dans l'annuaire et démarrer vos premières consultations."
      }
    ]
  };

  /* Fallback si rôle inconnu */
  STEPS_PAR_ROLE.default = STEPS_PAR_ROLE.utilisateur;

  const CTA_PAR_ROLE = {
    utilisateur:    [{ href:'profil.html',            label:'✏️ Compléter mon profil' }, { href:'annuaire.html',    label:'🔍 Explorer l\'annuaire' }],
    initiative:     [{ href:'dashboard-initiative.html', label:'⚙️ Mon tableau de bord' }, { href:'offres.html',      label:'📢 Créer une offre' }],
    administrateur: [{ href:'dashboard-administrateur.html', label:'🖥️ Ouvrir le Dashboard' }, { href:'annuaire.html',    label:'👥 Voir les membres' }],
    collectivite:   [{ href:'dashboard-collectivite.html',   label:'📊 Mon tableau de bord' }, { href:'sondages.html',    label:'🗳️ Créer un sondage' }]
  };

  function buildSteps(role) {
    return STEPS_PAR_ROLE[role] || STEPS_PAR_ROLE.default;
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
      #da-demo-progress{text-align:center;margin-bottom:12px;}
      #da-demo-badge{display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;margin-bottom:10px;letter-spacing:.3px;}
      #da-demo-title{font-size:16px;font-weight:900;color:#0D1B2A;margin:0 0 8px;line-height:1.3;}
      #da-demo-desc{font-size:13px;color:#475569;line-height:1.65;margin:0 0 10px;}
      #da-demo-lien-wrap{margin-bottom:8px;}
      #da-demo-lien{display:inline-flex;align-items:center;gap:6px;background:#f8fafc;border:1.5px solid #e2e8f0;color:#1e3a8a;border-radius:8px;padding:7px 13px;font-size:12px;font-weight:700;text-decoration:none;transition:background .15s;}
      #da-demo-lien:hover{background:#eff6ff;}
      #da-demo-cta-block{margin-bottom:10px;display:flex;flex-wrap:wrap;gap:8px;}
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
        <div id="da-demo-badge" style="display:none;"></div>
        <h3 id="da-demo-title"></h3>
        <p id="da-demo-desc"></p>
        <div id="da-demo-lien-wrap" style="display:none;">
          <a id="da-demo-lien" href="#" target="_self">🔗 Voir cette fonctionnalité</a>
        </div>
        <div id="da-demo-cta-block" style="display:none;"></div>
        <div id="da-demo-nav">
          <button id="da-demo-skip">Passer</button>
          <div class="da-nav-btns">
            <button id="da-demo-prev" style="display:none;">← Préc.</button>
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

    const badgeEl  = document.getElementById('da-demo-badge');
    const lienWrap = document.getElementById('da-demo-lien-wrap');
    const lienEl   = document.getElementById('da-demo-lien');

    function render() {
      const step = steps[cur];

      /* Points de progression */
      progEl.innerHTML = steps.map((_,i) =>
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 3px;background:${i===cur?'#1e3a8a':'#cbd5e1'};transition:background .2s;"></span>`
      ).join('');

      /* Badge rôle (1ère étape seulement) */
      if (step.badge) { badgeEl.textContent = step.badge; badgeEl.style.display = 'inline-block'; }
      else            { badgeEl.style.display = 'none'; }

      titleEl.textContent = step.titre;
      descEl.textContent  = step.desc;

      /* Lien contextuel par étape */
      if (step.lien) {
        lienEl.href        = step.lien.href;
        lienEl.textContent = '→ ' + step.lien.label;
        lienWrap.style.display = 'block';
      } else {
        lienWrap.style.display = 'none';
      }

      /* CTA finale (boutons de démarrage) */
      if (step.cta) {
        const ctaBtns = CTA_PAR_ROLE[step.cta] || CTA_PAR_ROLE.utilisateur;
        ctaEl.innerHTML = ctaBtns.map((b, i) =>
          `<a href="${b.href}" class="da-cta-btn ${i===0?'da-cta-primary':'da-cta-secondary'}">${b.label}</a>`
        ).join('');
        ctaEl.style.display = 'flex';
      } else {
        ctaEl.style.display = 'none';
      }

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
