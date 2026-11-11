/* ============================================================================================
   Menu des modules du compte Administrateur : quatre catégories en onglets (2026-11-11, demande explicite :
   « dans le menu du compte administrateur, crée 4 catégories de modules comme pour les autres comptes : modules d'analyse,
   de réponses à une demande, de création et de modération »).

   Les autres comptes ont des onglets (Module Standard / Premium / Tous les modules, assets/menu-modules-cartes.js). Ici, mêmes codes
   visuels (bleu nuit, bordure et bouton dorés), mais les onglets sont les quatre usages d'un administrateur :
     Analyse                  — consulter, mesurer, suivre (tableaux de bord, observatoires, finances, journaux)
     Réponses aux demandes    — traiter ce que les membres demandent (accréditations, vérifications, support, suppressions...)
     Création                 — produire et configurer (formations, publications, boutiques, partenaires, paramètres...)
     Modération               — contrôler (modération, avis, règles de contact, conformité, accès délégué)
   + « Tous les modules » (comportement d'avant : tout le menu, avec ses anciens titres de groupe).

   Principe : RIEN n'est déplacé ni supprimé. Chaque lien reçoit seulement data-adm-cat ; l'onglet actif ne fait que masquer par CSS
   les liens des autres catégories (et les anciens titres de groupe, qui n'ont plus de sens dans une vue par catégorie).
   Un module absent de la table ci-dessous n'a pas d'attribut → il reste visible dans TOUS les onglets (jamais perdu).
   Pour ranger un module autrement : le déplacer d'une liste à l'autre ci-dessous, c'est tout.
   Retour arrière : retirer la balise <script> de dashboard-administrateur.html.
   ============================================================================================ */
(function () {
  'use strict';
  if (window.__admCategories) return;
  window.__admCategories = true;

  const CATEGORIES = [
    ['analyse', 'Analyse', "Consulter, mesurer et suivre l'activité de la plateforme"],
    ['demandes', 'Réponses aux demandes', 'Traiter les demandes des membres'],
    ['creation', 'Création', 'Créer et configurer contenus, offres et réglages'],
    ['moderation', 'Modération', 'Contrôler les contenus, les accès et la conformité']
  ];

  /* Clé d'un module = son data-section, ou le nom de la page pour les liens vers un autre fichier. */
  const RANGEMENT = {
    analyse: [
      'vue-ensemble', 'reseau', 'retention', 'avancement-criteres', 'analytics-trafic', 'error-logs', 'initiatives',
      'membres', 'reseau-pro', 'diaspora-stats', 'obs-eco', 'obs-coop', 'obs-instit', 'revenus-diaspora',
      'cartographie-competences', 'obs-recensement', 'finances', 'ventes', 'oz-admin', 'origines', 'social-sync',
      'paiements-admin.html'
    ],
    demandes: [
      'accreditations', 'certifications', 'verifications-organisation', 'demandes-formateur', 'demandes-passage', 'ida-demandes',
      'rencontres', 'suppression-comptes', 'messages-techniques', 'support-pilote', 'faq-sr', 'partenariat-admin',
      'projets-evaluation.html'
    ],
    creation: [
      'formations', 'onboarding', 'videos-tutoriels', 'faq', 'chatbot', 'kofi-budget', 'partenaires-admin', 'packages', 'deals-admin',
      'diaspoactif-deals', 'parametres', 'billetterie', 'parrainage-admin', 'liens-adherents', 'contenu', 'communication',
      'publications', 'notifications-admin', 'ads', 'administrateurs-junior',
      'espace-simulation.html', 'atelier-boutiques.html', 'comptes-lies.html', 'comptes-lies-admin.html'
    ],
    moderation: [
      'moderation', 'avis-moderation', 'temoignages-admin', 'regles-contact', 'conformite', 'acces-delegue-admin'
    ]
  };
  const CAT_DE = {};
  Object.keys(RANGEMENT).forEach(c => RANGEMENT[c].forEach(k => { CAT_DE[k] = c; }));

  const CLE_MEMO = 'da_admin_cat';
  const HORS_MODULE = '.sb-search-results,.sb-install-group,.sb-bandeau-group,.sbp-cadre,.sb-reorder-toggle';

  function cleDuLien(a) {
    if (a.dataset.section) return a.dataset.section;
    const h = (a.getAttribute('href') || '').split('#')[0].split('?')[0];
    return h.split('/').pop();
  }

  function css() {
    if (document.getElementById('adm-cat-css')) return;
    const st = document.createElement('style');
    st.id = 'adm-cat-css';
    const S = 'html body .sidebar[data-adm-actif]';
    const regles = [
      /* Vue par catégorie : on masque les modules des autres catégories et les anciens titres de groupe */
      ...CATEGORIES.map(([c]) => S + '[data-adm-actif="' + c + '"] a[data-adm-cat]:not([data-adm-cat="' + c + '"]){display:none!important}'),
      S + ':not([data-adm-actif="tous"]) .sb-group-lbl[data-adm-grp]{display:none!important}',
      /* Onglets — mêmes codes que menu-modules-cartes.js (bleu nuit, or) */
      /* Deux colonnes : le tiroir fait ~220 px, quatre onglets en ligne écrasaient « Réponses aux demandes » */
      '.adm-cats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:4px;margin:8px 10px 6px;border:1px solid rgba(232,185,35,.4);border-radius:12px;background:rgba(255,255,255,.04)}',
      '.adm-cat{min-width:0;min-height:40px;padding:5px 6px;border:0;border-radius:9px;background:transparent;color:rgba(255,255,255,.82);font:700 12px/1.15 inherit;font-family:inherit;text-align:center;cursor:pointer;transition:background .2s,color .2s;overflow-wrap:anywhere}',
      '.adm-cat:hover{background:rgba(232,185,35,.14);color:#fff}',
      '.adm-cat[aria-selected="true"]{background:linear-gradient(135deg,#F6C453,#C99A1E);color:#1f1500}',
      '.adm-cat:focus-visible,.adm-tous:focus-visible{outline:2px solid #fff;outline-offset:2px}',
      '.adm-tous{grid-column:1/-1;min-height:34px;padding:4px 8px;border:1px solid rgba(232,185,35,.35);border-radius:9px;background:transparent;color:rgba(255,255,255,.82);font:700 12px/1.15 inherit;font-family:inherit;cursor:pointer;transition:background .2s,color .2s}',
      '.adm-tous:hover{background:rgba(232,185,35,.14);color:#fff}',
      '.adm-tous[aria-selected="true"]{background:linear-gradient(135deg,#F6C453,#C99A1E);color:#1f1500;border-color:transparent}',
      '@media (prefers-reduced-motion:reduce){.adm-cat,.adm-tous{transition:none}}'
    ];
    st.textContent = regles.join('\n');
    document.head.appendChild(st);
  }

  function marquer(sb) {
    sb.querySelectorAll('a').forEach(a => {
      if (a.closest(HORS_MODULE) || a.id === 'sidebar-close' || a.classList.contains('sb-standalone')) return;
      const c = CAT_DE[cleDuLien(a)];
      if (c) { if (a.dataset.admCat !== c) a.dataset.admCat = c; }
    });
    sb.querySelectorAll('.sb-group-lbl').forEach(l => {
      if (l.closest(HORS_MODULE)) return;
      if (!l.hasAttribute('data-adm-grp')) l.setAttribute('data-adm-grp', '1');
    });
  }

  function choisir(sb, cle, memoriser) {
    sb.setAttribute('data-adm-actif', cle);
    const barre = sb.querySelector('.adm-cats');
    if (barre) {
      barre.querySelectorAll('[data-cat]').forEach(b => {
        const on = b.dataset.cat === cle;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      /* Le titre de l'onglet est aussi son explication (lecteurs d'écran, infobulle) */
      barre.querySelectorAll('.adm-cat').forEach(b => { const c = CATEGORIES.find(x => x[0] === b.dataset.cat); if (c) b.title = c[2]; });
    }
    if (memoriser) {
      try { localStorage.setItem(CLE_MEMO, cle); } catch (e) { /* mémoire indisponible : sans conséquence */ }
      sb.scrollTop = 0;
    }
  }

  function barre(sb) {
    let b = sb.querySelector('.adm-cats');
    if (!b) {
      b = document.createElement('div');
      b.className = 'adm-cats';
      b.setAttribute('role', 'tablist');
      b.setAttribute('aria-label', 'Catégories de modules');
      CATEGORIES.forEach(([cle, lib]) => {
        const bt = document.createElement('button');
        bt.type = 'button'; bt.className = 'adm-cat'; bt.dataset.cat = cle; bt.setAttribute('role', 'tab'); bt.textContent = lib;
        bt.addEventListener('click', () => choisir(sb, cle, true));
        b.appendChild(bt);
      });
      const tous = document.createElement('button');
      tous.type = 'button'; tous.className = 'adm-tous'; tous.dataset.cat = 'tous'; tous.setAttribute('role', 'tab'); tous.textContent = 'Tous les modules';
      tous.addEventListener('click', () => choisir(sb, 'tous', true));
      b.appendChild(tous);
    }
    /* Place : juste sous la recherche (sinon sous le titre) — dans l'en-tête collant quand il existe. */
    const ancre = sb.querySelector('.sb-search-wrap') || sb.querySelector('.brand');
    if (ancre && b.previousElementSibling !== ancre) ancre.insertAdjacentElement('afterend', b);
    else if (!ancre && !b.parentNode) sb.insertBefore(b, sb.firstChild);
    return b;
  }

  function monter(sb) {
    css();
    marquer(sb);
    barre(sb);
    if (!sb.hasAttribute('data-adm-actif')) {
      let memo = null; try { memo = localStorage.getItem(CLE_MEMO); } catch (e) { /* mémoire indisponible */ }
      choisir(sb, CATEGORIES.some(c => c[0] === memo) ? memo : 'tous', false);
    }
  }

  function init() {
    const sb = document.querySelector('aside.sidebar[data-full-menu]');
    if (!sb) return;
    monter(sb);
    if (sb._admObs) return;
    let attente = 0;
    sb._admObs = new MutationObserver(() => {
      if (attente) return;
      attente = setTimeout(() => {
        attente = 0;
        sb._admObs.disconnect();
        try { monter(sb); } finally { sb._admObs.observe(sb, { childList: true, subtree: true }); }
      }, 120);
    });
    sb._admObs.observe(sb, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('load', () => setTimeout(init, 500));
})();
