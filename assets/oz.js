/* assets/oz.js — O-Z, Intelligence Artificielle officielle de Diaspo'Actif */
(function () {
  'use strict';
  if (window.__OZ_LOADED) return;
  window.__OZ_LOADED = true;

  /* ══════════════════════════════════════════
     CONSTANTES
  ══════════════════════════════════════════ */
  const AVATARS = {
    robot:   { e: '🤖', label: 'O-Z Classic' },
    afrique: { e: '🌍', label: "Terre d'Afrique" },
    etoile:  { e: '⭐', label: 'Étoile' },
    femme:   { e: '👩🏾', label: 'Conseillère' },
    homme:   { e: '👨🏿', label: 'Conseiller' },
    diamant: { e: '💎', label: 'Diamant' },
  };

  const MODULES = {
    evenements:      { label: 'Événements',      url: '/evenements.html',              icon: '🎪' },
    initiatives:     { label: 'Initiatives',     url: '/initiative.html',              icon: '🚀' },
    annuaire:        { label: 'Annuaire',        url: '/annuaire.html',                icon: '📋' },
    messagerie:      { label: 'Messagerie',      url: '/messagerie.html',              icon: '💬' },
    formations:      { label: 'Formations',      url: '/formations.html',              icon: '📚' },
    faq:             { label: 'FAQ',             url: '/faq.html',                     icon: '❓' },
    actualites:      { label: 'Actualités',      url: '/fil-actualite.html',           icon: '📰' },
    recherche:       { label: 'Recherche',       url: '/recherche.html',               icon: '🔍' },
    dashboard:       { label: 'Tableau de bord', url: '/dashboard-utilisateur.html',   icon: '🏠' },
    visio:           { label: 'Visioconférence', url: '/reunions.html',                icon: '📹' },
    contrats:        { label: 'Contrats',        url: '/contrats.html',                icon: '📄' },
    billetterie:     { label: 'Billetterie',     url: '/billetterie.html',             icon: '🎟️' },
    statistiques:    { label: 'Statistiques',    url: '/statistiques.html',            icon: '📊' },
    parametres:      { label: 'Paramètres',      url: '/dashboard-utilisateur.html#profil', icon: '⚙️' },
    accreditations:  { label: 'Accréditations',  url: '/accreditations.html',          icon: '🏅' },
    cv:              { label: 'CV & Lettres',     url: '/cv-builder.html',              icon: '📝' },
    agenda:          { label: 'Agenda',          url: '/agenda.html',                  icon: '📅' },
    profil:          { label: 'Mon profil',      url: '/profil.html',                  icon: '👤' },
    reseau:          { label: 'Mon réseau',      url: '/reseau.html',                  icon: '🌐' },
    offres:          { label: 'Offres',          url: '/offres.html',                  icon: '💼' },
    sondages:        { label: 'Sondages',        url: '/sondages.html',                icon: '📊' },
    scanner:         { label: 'Scanner QR',      url: '/scanner.html',                 icon: '📷' },
    reunions:        { label: 'Réunions',        url: '/reunions.html',                icon: '🤝' },
    collaborations:  { label: 'Collaborations',  url: '/collaborations.html',          icon: '🤝' },
  };

  // Raccourci pour construire un pattern "open" multi-verbes
  const _nav = (words) => new RegExp(
    `(ouvr[ei]r?|aller?|acc[eé]der?|afficher?|montrer?|voir?|visiter?|aller\\s+(?:sur|dans|[aà])|affiche[-\\s]moi|montre[-\\s]moi|va\\s+(?:sur|dans|[aà])|d[eé]marrer?|lancer?|acc[eé]der?\\s+[aà])\\s+` + words, 'i'
  );

  const INTENTS = [
    // Salutations
    { re: /^(bonjour|salut|hello|bonsoir|coucou|hey|allo)\b/i, id: 'greet' },
    { re: /\bmerci\b/i, id: 'thanks' },
    { re: /au\s*revoir|bye|bonne\s*(soir|nuit|journée)/i, id: 'bye' },
    { re: /que\s+peux[-\s]tu\s+(faire|m[e']?aider)|tes?\s+(fonctions?|capacités?)|quoi\s+(faire|dire)/i, id: 'capabilities' },
    { re: /\baide\b|help|comment\s+(faire|utiliser?|commencer)|d[eé]buter/i, id: 'help' },
    { re: /tutoriel|guide\s+(d[e']?accueil|interactif)/i, id: 'tutorial' },
    { re: /quels?\s+(sont\s+)?mes\s+(droits?|permissions?)|que\s+puis[-\s]je\s+faire/i, id: 'my_permissions' },
    // O-Z
    { re: /personnaliser?\s+(o[-\s]?z|l[e']?avatar|ton\s+apparence)|changer?\s+(d[e']?avatar|ton\s+apparence)/i, id: 'oz_settings' },
    { re: /activer?\s+(la\s+)?voix|mode\s+vocal/i, id: 'enable_voice' },
    { re: /d[eé]sactiver?\s+(la\s+)?voix|couper?\s+(la\s+)?voix/i, id: 'disable_voice' },

    // ── Agenda : ajout avec date/heure (prioritaire sur simple nav)
    { re: /ajouter?\s+.+\s+[àa]\s+(mon\s+)?agenda|cr[eé][eé]r?\s+(un\s+)?(rendez[-\s]vous|rdv|[eé]v[eé]nement\s+agenda)|planifier\s+.+\s+(?:le\s+\d|\d)/i, id: 'agenda_add' },

    // ── Créations AVANT navigation générale
    { re: /cr[eé][eé]r?\s+(un\s+)?[eé]v[eé]nement|organiser?\s+(un[e]?\s+)?(conf[eé]rence|atelier|webinaire)|planifier\s+(une?\s+)?(?:r[eé]union|conf[eé]rence)/i, id: 'create_event' },
    { re: /cr[eé][eé]r?\s+(une?\s+)?initiative|lancer?\s+(un\s+)?projet\s+communautaire/i, id: 'create_initiative' },
    { re: /cr[eé][eé]r?\s+(une?\s+)?campagne/i, id: 'create_campaign' },
    { re: /r[eé]diger?\s+(un\s+)?article|[eé]crire?\s+(un\s+)?article|publier?\s+(un\s+)?article/i, id: 'create_article' },
    { re: /cr[eé][eé]r?\s+(une?\s+)?billett/i, id: 'create_ticket' },
    { re: /g[eé]n[eé]rer?\s+(un\s+)?contrat|cr[eé][eé]r?\s+(un\s+)?contrat|r[eé]diger?\s+(un\s+)?contrat/i, id: 'create_contract' },
    { re: /cr[eé][eé]r?\s+(un\s+)?(cv|curriculum|lettre\s+de\s+motivation)/i, id: 'create_cv' },
    { re: /cr[eé][eé]r?\s+(un\s+)?sondage|lancer?\s+(un\s+)?sondage/i, id: 'create_sondage' },
    { re: /trouver?\s+(des?\s+)?partenaires?|chercher?\s+(des?\s+)?partenaires?/i, id: 'find_partners' },
    { re: /envoyer?\s+(un\s+)?message|[eé]crire?\s+[aà]\s+\w/i, id: 'send_message' },
    { re: /newsletter/i, id: 'create_newsletter' },

    // ── Navigation : accréditations
    { re: _nav('(les?\s+)?accr[eé]ditations?|(mon\s+)?badge|ma\s+carte\s+d[e\']accr[eé]ditation'), id: 'nav_accreditations' },
    { re: /accr[eé]ditations?|accréditation/i, id: 'nav_accreditations' },

    // ── Navigation : CV & Lettres
    { re: _nav('(mes?\s+)?cvs?|(mes?\s+)?(lettres?|curriculum)'), id: 'nav_cv' },
    { re: /\bcv[\s\-]builder\b|mes\s+cvs?\b|mes?\s+lettres?\s+de\s+motivation/i, id: 'nav_cv' },

    // ── Navigation : Agenda
    { re: _nav('(mon\s+)?agenda|(mes?\s+)?rendez[-\s]vous|mes\s+[eé]v[eé]nements?\s+agenda'), id: 'nav_agenda' },
    { re: /\bagenda\b|rendez[-\s]vous|\brdv\b/i, id: 'nav_agenda' },

    // ── Navigation : Profil
    { re: _nav('(mon\s+)?profil|(ma\s+)?fiche\s+personnelle|(mon\s+)?compte'), id: 'nav_profil' },
    { re: /\bmon\s+profil\b|modifier?\s+(mon\s+)?profil/i, id: 'nav_profil' },

    // ── Navigation : Messagerie
    { re: _nav('(ma\s+|mes?\s+|la\s+)?messageries?|messages?|discussions?|conversations?'), id: 'nav_messagerie' },
    { re: /messagerie|mes\s+messages?\b|mes\s+discussions?\b|mes\s+conversations?\b/i, id: 'nav_messagerie' },

    // ── Navigation : Événements
    { re: _nav('(les?\s+)?[eé]v[eé]nements?'), id: 'nav_evenements' },

    // ── Navigation : Initiatives
    { re: _nav('(les?\s+)?initiatives?|projets?\s+communautaires?'), id: 'nav_initiatives' },

    // ── Navigation : Réseau
    { re: _nav('(mon\s+)?r[eé]seau|mes?\s+contacts?|mes?\s+connexions?'), id: 'nav_reseau' },
    { re: /mon\s+r[eé]seau\b|mes\s+contacts?\b/i, id: 'nav_reseau' },

    // ── Navigation : Offres
    { re: _nav('(les?\s+)?offres?|opportunit[eé]s?|emplois?'), id: 'nav_offres' },
    { re: /\boffres?\b|opportunit[eé]s?\b/i, id: 'nav_offres' },

    // ── Navigation : Sondages
    { re: _nav('(les?\s+)?sondages?'), id: 'nav_sondages' },
    { re: /\bsondages?\b/i, id: 'nav_sondages' },

    // ── Navigation : Réunions / Visio
    { re: _nav('(mes?\s+|les?\s+)?r[eé]unions?|conf[eé]rences?\s+vid[eé]o|visio'), id: 'nav_reunions' },
    { re: /\br[eé]unions?\b|visioconf[eé]rence|r[eé]union\s+en\s+ligne/i, id: 'nav_reunions' },

    // ── Navigation : Annuaire
    { re: _nav('(l[e\']\s*)?annuaire|membres?'), id: 'nav_annuaire' },
    { re: /\bannuaire\b/i, id: 'nav_annuaire' },

    // ── Navigation : Formations
    { re: _nav('(les?\s+)?formations?'), id: 'nav_formations' },
    { re: /\bformations?\b/i, id: 'nav_formations' },

    // ── Navigation : FAQ
    { re: _nav('(la\s+)?faq|questions?\s+fr[eé]quentes?'), id: 'nav_faq' },
    { re: /\bfaq\b|questions?\s+fr[eé]quentes?/i, id: 'nav_faq' },

    // ── Navigation : Tableau de bord
    { re: _nav('(mon\s+)?tableau\s+de\s+bord|dashboard|accueil'), id: 'nav_dashboard' },
    { re: /tableau\s+de\s+bord|dashboard/i, id: 'nav_dashboard' },

    // ── Navigation : Actualités
    { re: _nav('(les?\s+)?actualit[eé]s?|fil\s+d[e\']actualit[eé]'), id: 'nav_actualites' },
    { re: /actualit[eé]|fil\s+d[e']actualit[eé]/i, id: 'nav_actualites' },

    // ── Navigation : Contrats
    { re: _nav('(mes?\s+|les?\s+)?contrats?'), id: 'nav_contrats' },
    { re: /\bcontrats?\b/i, id: 'nav_contrats' },

    // ── Navigation : Billetterie
    { re: _nav('(la\s+)?billetteries?|billets?'), id: 'nav_billetterie' },
    { re: /\bbilletterie\b|\bbillets?\b/i, id: 'nav_billetterie' },

    // ── Navigation : Statistiques
    { re: _nav('(les?\s+)?statistiques?|stats'), id: 'nav_statistiques' },
    { re: /statistiques?|\bstats\b/i, id: 'nav_statistiques' },

    // ── Navigation : Collaborations
    { re: _nav('(mes?\s+)?collaborations?'), id: 'nav_collaborations' },
    { re: /\bcollaborations?\b/i, id: 'nav_collaborations' },

    // ── Navigation : Scanner
    { re: /scanner?\s+qr|lire\s+un\s+qr/i, id: 'nav_scanner' },

    // ── Navigation : Recherche
    { re: _nav('(la\s+)?recherche'), id: 'nav_recherche' },
    { re: /\brecherche\b/i, id: 'nav_recherche' },

    // ── Paramètres / profil
    { re: /param[eè]tres?|configuration/i, id: 'nav_parametres' },

    // ── Deals
    { re: /cr[eé][eé]r?\s+(un\s+)?deal|nouveau\s+deal|lancer?\s+(un\s+)?deal|d[eé]marrer?\s+(un\s+)?deal/i, id: 'deal_create' },
    { re: /mes?\s+deals?|ouvrir?\s+(mes?\s+)?deals?|acc[eé]der?\s+(à\s+)?(mes?\s+)?deals?|g[eé]rer?\s+(un\s+)?deal/i, id: 'deal_list' },

    // ── Partenaires Officiels
    { re: /partenaires?\s+officiels?|partenaires?\s+diaspo|trouver?\s+un\s+partenaire\s+officiel/i, id: 'partenaires_annuaire' },
    { re: /financ(er|ement|ier)\s+(mon\s+|un\s+|de\s+)?projet|bailleur|investisseur|subvention/i, id: 'partenaires_financement' },
    { re: /conseil\s+juridique|avocat|droit|assistance\s+juridique|accompagnement\s+juridique/i, id: 'partenaires_juridique' },
    { re: /formation\s+professionnelle|organisme\s+de\s+formation|certifi(er|cation)|apprendre/i, id: 'partenaires_formation' },
    { re: /immobilier|logement|investir?\s+(en\s+)?afrique|bien\s+immobilier/i, id: 'partenaires_immobilier' },
    { re: /transfert\s+d.argent|envoi\s+d.argent|remittance|virement\s+international/i, id: 'partenaires_transfert' },
    { re: /sant[eé]|m[eé]decin|clinique|pharmacie|assistance\s+m[eé]dicale/i, id: 'partenaires_sante' },
    { re: /recommand[ea]?\s+(moi|des?)\s+partenaire|quel\s+partenaire|qui\s+peut\s+m.aider/i, id: 'partenaires_recommander' },

    // ── Profil public — réseau & communs
    { re: /affiche?\s+(mes?\s+)?abonn[eé]s?\b|mes?\s+abonn[eé]s?\b|qui\s+(me\s+)?suit/i, id: 'profil_abonnes' },
    { re: /comptes?\s+que\s+je\s+suis|affiche?\s+(mes?\s+)?suivis?|qui\s+est\-ce\s+que\s+je\s+suis/i, id: 'profil_suivis' },
    { re: /relations?\s+commun|comptes?\s+(en\s+)?commun|ce\s+qu[e']on\s+a\s+en\s+commun/i, id: 'profil_communs' },
    { re: /int[eé]r[eê]ts?\s+commun|points?\s+commun|quels?\s+(sont\s+(nos?|les?)\s+)?points?\s+commun/i, id: 'profil_communs' },
    { re: /[eé]v[eé]nements?\s+commun|m[eê]mes?\s+[eé]v[eé]nements?/i, id: 'profil_communs' },

    // ── Profil public — onglets
    { re: /mes?\s+publications?\s*(profil|publiques?)?|affiche?\s+(mes?\s+)?publications?\s*profil/i, id: 'profil_publications' },
    { re: /mes?\s+publicit[eé]s?\s*(profil)?|affiche?\s+(mes?\s+)?publicit[eé]s?/i, id: 'profil_publicites' },
    { re: /mon\s+activit[eé]\s*(r[eé]cente|publique)?|affiche?\s+(mon\s+)?activit[eé]|activit[eé]\s+r[eé]cente/i, id: 'profil_activite' },
    { re: /modifier?\s+(ma\s+)?banni[eè]re|changer?\s+(ma\s+)?banni[eè]re|uploader?\s+(ma\s+)?banni[eè]re/i, id: 'profil_banner' },
    { re: /confidentialit[eé]\s*(profil)?|privacy\s*(profil)?|param[eè]tres?\s+confidentialit[eé]/i, id: 'profil_privacy' },
    { re: /mon\s+profil\s+public|voir?\s+mon\s+profil\s+public|affiche?\s+mon\s+profil/i, id: 'profil_public' },

    // ── Admin
    { re: /admin|administration|panneau\s+admin/i, id: 'nav_admin' },
  ];

  const R = {
    fr: {
      greet_day: ["Bonjour ! Je suis **O-Z**, votre assistant intelligent Diaspo'Actif. Comment puis-je vous aider aujourd'hui ?",
                  "Bonjour ! En quoi puis-je vous être utile aujourd'hui ?"],
      greet_eve: ["Bonsoir ! Je suis **O-Z**. Que puis-je faire pour vous ce soir ?"],
      thanks:    ["Avec plaisir ! N'hésitez pas si vous avez d'autres questions.", "Je suis là pour vous aider ! 😊"],
      bye:       ["À bientôt ! N'hésitez pas à faire appel à moi."],
      confused:  ["Je ne suis pas certain de comprendre. Pouvez-vous reformuler ?",
                  "Hmm, je n'ai pas bien saisi. Essayez de préciser votre demande."],
      capabilities: "Voici ce que je sais faire :\n\n• 🗺️ **Naviguer** entre tous les modules\n• 🎪 **Créer** des événements, initiatives, articles\n• 🔍 **Trouver** des partenaires et membres\n• 📄 **Générer** des contrats\n• 🎟️ **Créer** des billetteries\n• 📖 **Répondre** à vos questions sur la plateforme\n• 🎓 **Lancer** les tutoriels interactifs\n• 🔔 **Vous alerter** des opportunités pertinentes\n\nDites-moi simplement ce que vous voulez faire !",
    },
    en: {
      greet_day: ["Hello! I'm **O-Z**, your intelligent Diaspo'Actif assistant. How can I help you today?"],
      greet_eve: ["Good evening! I'm **O-Z**. What can I do for you tonight?"],
      thanks:    ["My pleasure! Don't hesitate to ask more questions."],
      bye:       ["Goodbye! Feel free to call on me anytime."],
      confused:  ["I'm not sure I understand. Could you rephrase?"],
      capabilities: "I can navigate, create events/articles, find partners, answer questions, and launch tutorials.",
    },
  };

  /* ══════════════════════════════════════════
     ÉTAT
  ══════════════════════════════════════════ */
  let _cfg = {
    avatar: 'robot', avatarCustom: null, theme: 'auto', size: 'small',
    animations: true, voiceEnabled: false, language: 'fr', posX: null, posY: null,
  };
  let _msgs = [];
  let _ctx = {};
  let _pending = null;
  let _recog = null;
  let _dragging = false;
  let _dragActive = false;
  let _dragOff = { x: 0, y: 0 };
  let _dragMoved = false;
  let _settingsOpen = false;
  let _role = null;
  let _greeted = false;
  let _proTimer = null;
  let _kb = [];

  /* ══════════════════════════════════════════
     INIT
  ══════════════════════════════════════════ */
  async function init() {
    loadLocal();
    detectRole();
    injectCSS();
    injectHTML();
    bindEvents();
    applyTheme();
    applySize();
    await Promise.all([loadServerCfg(), loadKB()]);
    scheduleProactive();
    if (!sessionStorage.getItem('oz:done')) {
      setTimeout(() => { showBadge(); sessionStorage.setItem('oz:done', '1'); }, 3500);
    }
  }

  function detectRole() {
    const meta = document.querySelector('meta[name="da-role"]');
    if (meta) { _role = meta.content; return; }
    try {
      const raw = document.cookie.split(';').find(c => c.trim().startsWith('auth='));
      if (raw) {
        const tok = raw.split('=').slice(1).join('=').trim();
        const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        _role = payload.role;
      }
    } catch(e) {}
    _role = _role || localStorage.getItem('da_last_role') || 'utilisateur';
  }

  /* ══════════════════════════════════════════
     CSS
  ══════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('oz-style')) return;
    const s = document.createElement('style');
    s.id = 'oz-style';
    s.textContent = `
#oz-root{position:relative;display:inline-flex;align-items:center;z-index:auto;user-select:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --oz-bg:#fff;--oz-text:#1a1a2e;--oz-muted:#6b7280;--oz-border:#e5e7eb;
  --oz-primary:#4a90d9;--oz-acc:#10b981;--oz-sh:0 8px 32px rgba(0,0,0,.18);--oz-r:16px;}
#oz-root.dk{--oz-bg:#1e2130;--oz-text:#f1f5f9;--oz-muted:#94a3b8;--oz-border:#334155;--oz-primary:#60a5fa;--oz-acc:#34d399;}

#oz-bubble{position:relative;width:40px;height:40px;border-radius:50%;
  background:linear-gradient(135deg,#1a1a2e 0%,#2563eb 60%,#10b981 100%);
  box-shadow:0 2px 10px rgba(37,99,235,.35);cursor:pointer;display:flex;align-items:center;justify-content:center;
  font-size:18px;border:2.5px solid #fff;transition:transform .2s,box-shadow .2s;flex-shrink:0;}
#oz-bubble:hover{transform:scale(1.08);box-shadow:0 12px 40px rgba(74,144,217,.45);}
#oz-bubble.drag{cursor:grabbing;transform:scale(1.13);}
#oz-bubble.sm{width:40px;height:40px;font-size:18px;}
#oz-bubble.lg{width:48px;height:48px;font-size:22px;}

#oz-badge{position:absolute;top:-5px;right:-5px;width:20px;height:20px;border-radius:50%;
  background:#ef4444;color:#fff;font-size:10px;font-weight:800;
  display:none;align-items:center;justify-content:center;border:2px solid #fff;
  animation:ozPop .3s ease-out;}
@keyframes ozPop{from{transform:scale(0)}to{transform:scale(1)}}

#oz-panel{position:fixed;width:360px;max-height:520px;
  --oz-bg:#fff;--oz-text:#1a1a2e;--oz-muted:#6b7280;--oz-border:#e5e7eb;
  --oz-primary:#4a90d9;--oz-acc:#10b981;--oz-sh:0 8px 32px rgba(0,0,0,.18);--oz-r:16px;
  background:#fff;
  border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.18);display:flex;flex-direction:column;
  overflow:hidden;border:1.5px solid #e5e7eb;
  opacity:0;transform:translateY(-10px) scale(.96);pointer-events:none;
  transition:opacity .22s,transform .22s;top:64px;right:8px;z-index:99999;}
#oz-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:all;}
#oz-panel.noanim{transition:none;}

#oz-hd{background:linear-gradient(135deg,#1a1a2e 0%,#2563eb 65%,#10b981 100%);
  color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px;flex-shrink:0;}
#oz-hd-av{font-size:26px;flex-shrink:0;}
#oz-hd-info{flex:1;min-width:0;}
#oz-hd-name{font-weight:800;font-size:15px;letter-spacing:.3px;}
#oz-hd-status{font-size:11px;opacity:.8;display:flex;align-items:center;gap:4px;}
#oz-hd-status::before{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:#34d399;}
#oz-hd-btns{display:flex;gap:5px;flex-shrink:0;}
#oz-hd-btns button{background:rgba(255,255,255,.15);border:none;border-radius:8px;
  color:#fff;width:30px;height:30px;cursor:pointer;font-size:13px;
  display:flex;align-items:center;justify-content:center;transition:background .15s;}
#oz-hd-btns button:hover{background:rgba(255,255,255,.3);}

#oz-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;
  gap:8px;scroll-behavior:smooth;}
#oz-msgs::-webkit-scrollbar{width:4px;}
#oz-msgs::-webkit-scrollbar-thumb{background:var(--oz-border);border-radius:2px;}

.oz-m{max-width:84%;padding:9px 13px;border-radius:14px;font-size:13px;line-height:1.6;
  color:var(--oz-text);word-break:break-word;animation:ozIn .18s ease-out;}
@keyframes ozIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.oz-m.oz{background:#f0f5ff;align-self:flex-start;border-bottom-left-radius:4px;}
.oz-m.oz strong{color:var(--oz-primary);}
.oz-m.user{background:var(--oz-primary);color:#fff;align-self:flex-end;border-bottom-right-radius:4px;}
.oz-m.sys{background:#fef9c3;align-self:center;text-align:center;font-size:11px;color:#92400e;border-radius:8px;max-width:90%;padding:6px 12px;}

.oz-card{background:var(--oz-bg);border:1.5px solid var(--oz-border);border-radius:12px;
  padding:11px;margin-top:7px;font-size:12px;color:var(--oz-text);}
.oz-card-title{font-weight:700;font-size:13px;color:var(--oz-primary);margin-bottom:5px;}
.oz-card-desc{color:var(--oz-muted);margin-bottom:9px;line-height:1.5;}
.oz-card-btns{display:flex;gap:6px;flex-wrap:wrap;}
.oz-btn{padding:6px 14px;border-radius:8px;border:none;cursor:pointer;font-size:12px;
  font-weight:600;transition:all .15s;white-space:nowrap;}
.oz-btn-p{background:var(--oz-primary);color:#fff;}.oz-btn-p:hover{filter:brightness(1.1);}
.oz-btn-s{background:var(--oz-border);color:var(--oz-text);}.oz-btn-s:hover{filter:brightness(.95);}
.oz-btn-d{background:#fee2e2;color:#dc2626;}

#oz-quick{padding:8px 12px;display:flex;gap:6px;flex-wrap:wrap;
  border-top:1px solid var(--oz-border);flex-shrink:0;}
.oz-chip{padding:5px 11px;border-radius:20px;border:1.5px solid var(--oz-border);
  background:var(--oz-bg);color:var(--oz-text);font-size:11px;cursor:pointer;
  transition:all .15s;white-space:nowrap;}
.oz-chip:hover{border-color:var(--oz-primary);color:var(--oz-primary);background:#f0f5ff;}

#oz-in-row{padding:9px 12px;display:flex;gap:7px;align-items:flex-end;
  border-top:1px solid var(--oz-border);flex-shrink:0;}
#oz-inp{flex:1;padding:8px 12px;border:1.5px solid var(--oz-border);border-radius:10px;
  font-size:13px;background:var(--oz-bg);color:var(--oz-text);outline:none;
  transition:border-color .15s;resize:none;min-height:36px;max-height:80px;font-family:inherit;overflow:auto;}
#oz-inp:focus{border-color:var(--oz-primary);}
#oz-inp::placeholder{color:var(--oz-muted);}
#oz-btn-mic,#oz-btn-send{width:36px;height:36px;border-radius:10px;border:1.5px solid var(--oz-border);
  background:var(--oz-bg);color:var(--oz-muted);cursor:pointer;font-size:16px;
  display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;}
#oz-btn-mic:hover{border-color:var(--oz-primary);color:var(--oz-primary);}
#oz-btn-mic.on{border-color:#ef4444;color:#ef4444;animation:ozPulse 1s infinite;}
@keyframes ozPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
#oz-btn-send{background:var(--oz-primary);color:#fff;border-color:var(--oz-primary);}
#oz-btn-send:hover{filter:brightness(1.1);}
#oz-btn-send:disabled{opacity:.4;cursor:not-allowed;}

#oz-typing{display:none;align-items:center;gap:4px;padding:4px 0;align-self:flex-start;}
#oz-typing.on{display:flex;}
#oz-typing span{width:7px;height:7px;border-radius:50%;background:var(--oz-primary);
  animation:ozDot 1.2s infinite;opacity:.4;}
#oz-typing span:nth-child(2){animation-delay:.2s;}
#oz-typing span:nth-child(3){animation-delay:.4s;}
@keyframes ozDot{0%,80%,100%{transform:scale(1);opacity:.4}40%{transform:scale(1.3);opacity:1}}

#oz-sp{position:absolute;background:var(--oz-bg);border-radius:var(--oz-r);
  box-shadow:var(--oz-sh);border:1.5px solid var(--oz-border);padding:18px;
  width:300px;top:56px;right:0;display:none;z-index:2;}
#oz-sp.open{display:block;}
#oz-sp h3{font-size:14px;font-weight:700;color:var(--oz-text);margin-bottom:14px;}
.oz-sl{margin-bottom:13px;}
.oz-sl-lbl{font-size:10px;font-weight:700;color:var(--oz-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;}
.oz-av-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;}
.oz-av-opt{width:38px;height:38px;border-radius:10px;border:2px solid var(--oz-border);
  display:flex;align-items:center;justify-content:center;font-size:19px;cursor:pointer;transition:all .15s;}
.oz-av-opt:hover{border-color:var(--oz-primary);}
.oz-av-opt.sel{border-color:var(--oz-primary);background:#f0f5ff;}
.oz-sel{width:100%;padding:7px 10px;border:1.5px solid var(--oz-border);
  border-radius:8px;font-size:12px;background:var(--oz-bg);color:var(--oz-text);}
.oz-tog{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--oz-text);}
.oz-sw{width:38px;height:21px;border-radius:11px;background:var(--oz-border);
  cursor:pointer;position:relative;transition:background .2s;flex-shrink:0;}
.oz-sw.on{background:var(--oz-acc);}
.oz-sw::after{content:'';position:absolute;top:2px;left:2px;width:17px;height:17px;
  border-radius:50%;background:#fff;transition:transform .2s;}
.oz-sw.on::after{transform:translateX(17px);}
.oz-sp-upload{width:100%;padding:7px;border:1.5px dashed var(--oz-border);border-radius:8px;
  font-size:11px;color:var(--oz-muted);cursor:pointer;text-align:center;transition:border-color .15s;}
.oz-sp-upload:hover{border-color:var(--oz-primary);color:var(--oz-primary);}

@media(max-width:480px){
  #oz-panel{width:calc(100vw - 20px);right:0;bottom:72px;}
  #oz-sp{width:calc(100vw - 20px);}
}`;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════
     HTML
  ══════════════════════════════════════════ */
  function injectHTML() {
    if (document.getElementById('oz-root')) return;
    const root = document.createElement('div');
    root.id = 'oz-root';
    const av = avEmoji();
    root.innerHTML = `
<div id="oz-bubble" title="O-Z — Votre assistant Diaspo'Actif">
  <span id="oz-av-icon">${av}</span>
  <span id="oz-badge"></span>
</div>

<div id="oz-panel">
  <div id="oz-hd">
    <div id="oz-hd-av">${av}</div>
    <div id="oz-hd-info">
      <div id="oz-hd-name">O-Z</div>
      <div id="oz-hd-status">En ligne · Prêt à vous aider</div>
    </div>
    <div id="oz-hd-btns">
      <button id="oz-btn-cfg" title="Personnaliser O-Z">⚙️</button>
      <button id="oz-btn-clr" title="Nouvelle conversation">🗑️</button>
      <button id="oz-btn-cls" title="Fermer">✕</button>
    </div>
  </div>
  <div id="oz-msgs">
    <div id="oz-typing"><span></span><span></span><span></span></div>
  </div>
  <div id="oz-quick"></div>
  <div id="oz-in-row">
    <textarea id="oz-inp" placeholder="Écrivez ou parlez à O-Z…" rows="1"></textarea>
    <button id="oz-btn-mic" title="Parler à O-Z">🎤</button>
    <button id="oz-btn-send" title="Envoyer">➤</button>
  </div>
</div>

<div id="oz-sp">
  <h3>⚙️ Personnaliser O-Z</h3>
  <div class="oz-sl">
    <div class="oz-sl-lbl">Avatar</div>
    <div class="oz-av-grid" id="oz-av-grid">
      ${Object.entries(AVATARS).map(([k,v])=>`<div class="oz-av-opt${k===_cfg.avatar?' sel':''}" data-av="${k}" title="${v.label}">${v.e}</div>`).join('')}
    </div>
    <label style="display:block;margin-top:8px;">
      <div class="oz-sp-upload" id="oz-av-upload-lbl">📁 Importer une image personnalisée</div>
      <input type="file" id="oz-av-file" accept="image/*" style="display:none;">
    </label>
  </div>
  <div class="oz-sl">
    <div class="oz-sl-lbl">Taille</div>
    <select class="oz-sel" id="oz-sz-sel">
      <option value="small"${_cfg.size==='small'?' selected':''}>Petit (48px)</option>
      <option value="medium"${_cfg.size==='medium'?' selected':''}>Moyen (62px)</option>
      <option value="large"${_cfg.size==='large'?' selected':''}>Grand (78px)</option>
    </select>
  </div>
  <div class="oz-sl">
    <div class="oz-sl-lbl">Thème</div>
    <select class="oz-sel" id="oz-th-sel">
      <option value="auto"${_cfg.theme==='auto'?' selected':''}>Automatique</option>
      <option value="light"${_cfg.theme==='light'?' selected':''}>Clair</option>
      <option value="dark"${_cfg.theme==='dark'?' selected':''}>Sombre</option>
    </select>
  </div>
  <div class="oz-sl">
    <div class="oz-tog"><span>🎙️ Synthèse vocale</span><div class="oz-sw${_cfg.voiceEnabled?' on':''}" id="oz-voice-sw"></div></div>
  </div>
  <div class="oz-sl">
    <div class="oz-tog"><span>✨ Animations</span><div class="oz-sw${_cfg.animations?' on':''}" id="oz-anim-sw"></div></div>
  </div>
  <button class="oz-btn oz-btn-p" style="width:100%;margin-top:4px;" onclick="window.__OZ.saveSettings()">💾 Enregistrer</button>
  <button class="oz-btn oz-btn-s" style="width:100%;margin-top:6px;" onclick="window.__OZ.closeSettings()">Fermer</button>
</div>`;

    // Extraire #oz-panel du root et l'attacher au body (pour qu'il ne soit pas clipé par la topbar)
    const panel = root.querySelector('#oz-panel');
    document.body.appendChild(root);
    if (panel) document.body.appendChild(panel);
    showQuickChips();
  }

  /* ══════════════════════════════════════════
     EVENTS
  ══════════════════════════════════════════ */
  function bindEvents() {
    // Drag via mousedown/touchstart on bubble
    document.addEventListener('mousedown',  e => { if (e.target.closest('#oz-bubble')) startDrag(e.clientX, e.clientY, e); });
    document.addEventListener('mousemove',  e => { if (_dragActive) onDrag(e.clientX, e.clientY); });
    document.addEventListener('mouseup',    ()  => { if (_dragActive) endDrag(); });
    document.addEventListener('touchstart', e => { if (e.target.closest('#oz-bubble')) startDrag(e.touches[0].clientX, e.touches[0].clientY, e); }, { passive: true });
    document.addEventListener('touchmove',  e => { if (_dragActive) { e.preventDefault(); onDrag(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
    document.addEventListener('touchend',   () => { if (_dragActive) endDrag(); });

    // Clicks
    document.addEventListener('click', e => {
      if (!_dragMoved && e.target.closest('#oz-bubble') && !e.target.closest('#oz-panel')) togglePanel();
      if (e.target.closest('#oz-btn-cls'))  closePanel();
      if (e.target.closest('#oz-btn-clr'))  clearConv();
      if (e.target.closest('#oz-btn-cfg'))  toggleSettings();
      if (e.target.closest('#oz-btn-send')) send();
      if (e.target.closest('#oz-btn-mic'))  toggleMic();

      // Avatar grid
      const av = e.target.closest('.oz-av-opt');
      if (av) { document.querySelectorAll('.oz-av-opt').forEach(o=>o.classList.remove('sel')); av.classList.add('sel'); _cfg.avatar = av.dataset.av; _cfg.avatarCustom = null; }

      // Switches
      if (e.target.closest('#oz-voice-sw')) { const t=document.getElementById('oz-voice-sw'); _cfg.voiceEnabled=!_cfg.voiceEnabled; t.classList.toggle('on',_cfg.voiceEnabled); }
      if (e.target.closest('#oz-anim-sw'))  { const t=document.getElementById('oz-anim-sw');  _cfg.animations=!_cfg.animations;     t.classList.toggle('on',_cfg.animations); }

      // Chips
      const chip = e.target.closest('.oz-chip');
      if (chip) { const inp = document.getElementById('oz-inp'); if (inp) { inp.value = chip.dataset.text; send(); } }

      // Action buttons
      const btn = e.target.closest('[data-oz]');
      if (btn) handleBtn(btn.dataset.oz, btn.dataset.p);

      // Close on outside click
      const root = document.getElementById('oz-root');
      if (root && !root.contains(e.target)) closeAll();
    });

    // Enter to send
    document.addEventListener('keydown', e => {
      if (e.target.id === 'oz-inp' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    // File upload
    document.addEventListener('change', e => {
      if (e.target.id === 'oz-sz-sel') { _cfg.size  = e.target.value; applySize(); }
      if (e.target.id === 'oz-th-sel') { _cfg.theme = e.target.value; applyTheme(); }
      if (e.target.id === 'oz-av-file') {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          _cfg.avatarCustom = ev.target.result;
          _cfg.avatar = 'custom';
          document.querySelectorAll('.oz-av-opt').forEach(o => o.classList.remove('sel'));
          updateAvatar();
          document.getElementById('oz-av-upload-lbl').textContent = '✅ ' + file.name;
        };
        reader.readAsDataURL(file);
      }
    });

    document.addEventListener('click', e => {
      if (e.target.id === 'oz-av-upload-lbl' || e.target.closest('#oz-av-upload-lbl')) {
        document.getElementById('oz-av-file')?.click();
      }
    });

    // Auto-resize textarea
    document.addEventListener('input', e => {
      if (e.target.id === 'oz-inp') { e.target.style.height='auto'; e.target.style.height=(e.target.scrollHeight)+'px'; }
    });

    // Dark mode auto
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (_cfg.theme === 'auto') applyTheme(); });
    }
  }

  /* ══════════════════════════════════════════
     DRAG
  ══════════════════════════════════════════ */
  function startDrag(cx, cy) {
    const root = document.getElementById('oz-root');
    if (!root) return;
    const rect = root.getBoundingClientRect();
    _dragOff = { x: cx - rect.left, y: cy - rect.top };
    _dragActive = true; _dragging = false; _dragMoved = false;
    document.getElementById('oz-bubble')?.classList.add('drag');
  }

  function onDrag(cx, cy) {
    // OZ est intégré dans la topbar — drag désactivé
    _dragging = true; _dragMoved = true;
  }

  function endDrag() {
    _dragging = false; _dragActive = false;
    document.getElementById('oz-bubble')?.classList.remove('drag');
    setTimeout(() => { _dragMoved = false; }, 60);
  }

  /* ══════════════════════════════════════════
     PANEL
  ══════════════════════════════════════════ */
  function togglePanel() {
    const p = document.getElementById('oz-panel');
    if (!p) return;
    p.classList.contains('open') ? closePanel() : openPanel();
  }

  function openPanel() {
    const p = document.getElementById('oz-panel');
    if (!p) return;
    if (!_cfg.animations) p.classList.add('noanim');
    p.classList.add('open');
    closeSettings();
    hideBadge();
    setTimeout(() => { document.getElementById('oz-inp')?.focus(); scrollMsgs(); }, 200);
  }

  function closePanel() { document.getElementById('oz-panel')?.classList.remove('open'); }
  function closeAll()   { closePanel(); closeSettings(); }
  function closeSettings() { _settingsOpen=false; document.getElementById('oz-sp')?.classList.remove('open'); }

  function toggleSettings() {
    _settingsOpen = !_settingsOpen;
    document.getElementById('oz-sp')?.classList.toggle('open', _settingsOpen);
    if (_settingsOpen) closePanel();
  }

  function clearConv() {
    _msgs = []; _ctx = {}; _pending = null;
    const el = document.getElementById('oz-msgs');
    if (el) el.innerHTML = '<div id="oz-typing"><span></span><span></span><span></span></div>';
    showSys('Nouvelle conversation démarrée.');
    showQuickChips();
  }

  function scrollMsgs() {
    const el = document.getElementById('oz-msgs');
    if (el) setTimeout(() => el.scrollTop = el.scrollHeight, 50);
  }

  /* ══════════════════════════════════════════
     MESSAGES
  ══════════════════════════════════════════ */
  function addMsg(role, html, card) {
    const el = document.getElementById('oz-msgs');
    if (!el) return;
    const typing = document.getElementById('oz-typing');
    const div = document.createElement('div');
    div.className = 'oz-m ' + role;
    div.innerHTML = md(html);
    if (card) {
      const c = document.createElement('div');
      c.className = 'oz-card';
      c.innerHTML = card;
      div.appendChild(c);
    }
    el.insertBefore(div, typing);
    scrollMsgs();
    _msgs.push({ role, text: html, ts: Date.now() });
    if (role === 'oz' && _cfg.voiceEnabled) speak(html.replace(/<[^>]+>/g,'').replace(/\*\*(.+?)\*\*/g,'$1'));
  }

  function showSys(text) {
    const el = document.getElementById('oz-msgs');
    if (!el) return;
    const typing = document.getElementById('oz-typing');
    const div = document.createElement('div');
    div.className = 'oz-m sys'; div.textContent = text;
    el.insertBefore(div, typing); scrollMsgs();
  }

  function showTyping(v) { document.getElementById('oz-typing')?.classList.toggle('on', v); }

  function showQuickChips() {
    const q = document.getElementById('oz-quick');
    if (!q) return;
    const chips = [
      { label: '🎪 Créer un événement', text: 'Créer un événement' },
      { label: '🔍 Trouver des partenaires', text: 'Trouver des partenaires' },
      ...(_role === 'initiative' ? [{ label: '🚀 Lancer une initiative', text: 'Créer une initiative' }] : []),
      ...(_role === 'administrateur' ? [{ label: '📊 Statistiques', text: 'Voir les statistiques' }] : []),
      { label: '❓ Aide', text: 'Que peux-tu faire ?' },
    ].slice(0, 4);
    q.innerHTML = chips.map(c => `<div class="oz-chip" data-text="${c.text}">${c.label}</div>`).join('');
  }

  function md(t) {
    return t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');
  }

  /* ══════════════════════════════════════════
     ENVOYER
  ══════════════════════════════════════════ */
  async function send() {
    const inp = document.getElementById('oz-inp');
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;
    inp.value = ''; inp.style.height = 'auto';
    addMsg('user', text);
    showTyping(true);
    await sleep(350 + Math.random() * 250);
    showTyping(false);
    await process(text);
  }

  async function process(text) {
    // Confirmation d'action en attente
    if (_pending) {
      const n = text.toLowerCase().trim();
      if (/^(oui|yes|ok|valide?r?|confirme?r?|go|d.accord|parfait|c.est bon|super)/.test(n)) {
        await execPending(); return;
      }
      if (/^(non|no|annule?r?|cancel|pas maintenant|stop)/.test(n)) {
        _pending = null;
        addMsg('oz', "✅ Action annulée. Comment puis-je vous aider autrement ?"); return;
      }
    }
    await handleIntent(detectIntent(text), text);
  }

  /* ══════════════════════════════════════════
     INTENT
  ══════════════════════════════════════════ */
  function detectIntent(text) {
    for (const { re, id } of INTENTS) if (re.test(text)) return id;
    return 'unknown';
  }

  async function handleIntent(id, text) {
    const L = getLang();

    switch (id) {
      // ── Salutations & méta
      case 'greet': {
        const h = new Date().getHours();
        const pool = h < 18 ? L.greet_day : L.greet_eve;
        const msg = pool[Math.floor(Math.random()*pool.length)];
        addMsg('oz', msg + (getRoleGreeting() ? '\n\n' + getRoleGreeting() : ''));
        showQuickChips(); break;
      }
      case 'thanks':        addMsg('oz', L.thanks[Math.floor(Math.random()*L.thanks.length)]); break;
      case 'bye':           addMsg('oz', L.bye[0]); setTimeout(closePanel, 2000); break;
      case 'capabilities':  addMsg('oz', L.capabilities); break;
      case 'my_permissions':addMsg('oz', getPermsText()); break;
      case 'help':
        addMsg('oz', "Dites-moi simplement ce que vous voulez faire :\n\n• « **Ouvre mes messages** »\n• « **Ouvre les accréditations** »\n• « **Crée un événement** »\n• « **Ajoute une réunion à mon agenda le 15/03 à 14h** »\n• « **Montre-moi mes CV** »\n• « **Va dans l'annuaire** »\n\nJ'exécute directement — pas besoin de cliquer !");
        break;
      case 'tutorial':
        addMsg('oz', '🎓 Lancement du guide interactif...');
        setTimeout(() => { if (typeof window.daReplayOnboarding === 'function') window.daReplayOnboarding(); else window.location.href = '/dashboard-utilisateur.html'; }, 500);
        break;
      case 'oz_settings': addMsg('oz', '⚙️ Voici vos options de personnalisation !'); toggleSettings(); break;
      case 'enable_voice':
        _cfg.voiceEnabled = true;
        document.getElementById('oz-voice-sw')?.classList.add('on');
        addMsg('oz','🎙️ Synthèse vocale activée !'); speak('Synthèse vocale activée.'); break;
      case 'disable_voice':
        _cfg.voiceEnabled = false;
        document.getElementById('oz-voice-sw')?.classList.remove('on');
        stopSpeech(); addMsg('oz','🔇 Synthèse vocale désactivée.'); break;

      // ── Agenda : création avec date
      case 'agenda_add': await agendaAdd(text); break;

      // ── Actions directes (navigation immédiate vers le formulaire)
      case 'create_event':      await execAction('create_event');      break;
      case 'create_initiative': await execAction('create_initiative'); break;
      case 'create_campaign':   await execAction('create_campaign');   break;
      case 'create_article':    await execAction('create_article');    break;
      case 'create_ticket':     await execAction('create_ticket');     break;
      case 'create_contract':   await execAction('create_contract');   break;
      case 'create_newsletter': await execAction('create_newsletter'); break;
      case 'create_cv':         await execAction('create_cv');         break;
      case 'create_sondage':    await execAction('create_sondage');    break;
      case 'find_partners':     await execAction('find_partners');     break;
      case 'send_message':      await execAction('send_message');      break;

      // ── Navigation directe (tous les modules)
      case 'nav_evenements':     await navTo('evenements');     break;
      case 'nav_initiatives':    await navTo('initiatives');    break;
      case 'nav_messagerie':     await navTo('messagerie');     break;
      case 'nav_annuaire':       await navTo('annuaire');       break;
      case 'nav_formations':     await navTo('formations');     break;
      case 'nav_faq':            await navTo('faq');            break;
      case 'nav_actualites':     await navTo('actualites');     break;
      case 'nav_reunions':       await navTo('reunions');       break;
      case 'nav_visio':          await navTo('reunions');       break;
      case 'nav_contrats':       await navTo('contrats');       break;
      case 'nav_billetterie':    await navTo('billetterie');    break;
      case 'nav_statistiques':   await navTo('statistiques');   break;
      case 'nav_recherche':      await navTo('recherche');      break;
      case 'nav_dashboard':      await navTo('dashboard');      break;
      case 'nav_accreditations': await navTo('accreditations'); break;
      case 'nav_cv':             await navTo('cv');             break;
      case 'nav_agenda':         await navTo('agenda');         break;
      case 'nav_profil':         await navTo('profil');         break;
      case 'nav_reseau':         await navTo('reseau');         break;
      case 'nav_offres':         await navTo('offres');         break;
      case 'nav_sondages':       await navTo('sondages');       break;
      case 'nav_collaborations': await navTo('collaborations'); break;
      case 'nav_scanner':        await navTo('scanner');        break;
      case 'nav_parametres':     await navTo('profil');         break;
      case 'nav_admin':
        addMsg('oz', '⚙️ J\'ouvre l\'administration...');
        await audit('navigate', 'admin');
        setTimeout(() => { window.location.href = '/dashboard-administrateur.html'; }, 500);
        break;

      // ── Profil public — onglets
      // ── Partenaires Officiels
      case 'partenaires_annuaire':
        addMsg('oz', '🏅 J\'ouvre l\'annuaire des Partenaires Officiels Diaspo\'Actif…');
        setTimeout(() => { window.location.href = '/partenaires.html'; }, 400); break;

      case 'partenaires_financement':
      case 'partenaires_juridique':
      case 'partenaires_formation':
      case 'partenaires_immobilier':
      case 'partenaires_transfert':
      case 'partenaires_sante':
      case 'partenaires_recommander': {
        const domMap = {
          partenaires_financement: 'financement',
          partenaires_juridique:   'juridique',
          partenaires_formation:   'formation',
          partenaires_immobilier:  'immobilier',
          partenaires_transfert:   'transfert',
          partenaires_sante:       'santé',
          partenaires_recommander: '',
        };
        const domaine = domMap[intent] || '';
        addMsg('oz', `⏳ Diaspo'Actif recherche les Partenaires Officiels${domaine ? ` spécialisés en **${domaine}**` : ''}…`);
        try {
          const data = await fetch(`/api/partenaires/recommander?domaine=${encodeURIComponent(domaine)}`).then(r => r.json());
          const partners = data.partenaires || [];
          if (!partners.length) {
            addMsg('oz', `Aucun Partenaire Officiel trouvé pour ce domaine. Consultez l'[annuaire complet](/partenaires.html).`);
          } else {
            let msg = `🏅 **Diaspo'Actif vous recommande en priorité ses Partenaires Officiels${domaine ? ` spécialisés en ${domaine}` : ''} :**\n\n`;
            partners.forEach(p => {
              const nom = [p.prenom, p.nom].filter(Boolean).join(' ') || p.nom;
              const doms = (p.domaines_expertise||[]).slice(0,2).join(', ');
              msg += `• **${nom}**${doms ? ` — ${doms}` : ''}${p.user_pays ? ` · ${p.user_pays}` : ''}\n`;
            });
            msg += `\n[Voir tous les partenaires →](/partenaires.html)`;
            addMsg('oz', msg);
          }
        } catch(e) {
          addMsg('oz', `Consultez l'[annuaire des Partenaires Officiels](/partenaires.html) pour trouver des experts de confiance.`);
        }
        break;
      }

      case 'profil_abonnes':
        addMsg('oz', '❤️ J\'ouvre la liste de vos abonnés…');
        setTimeout(() => { const u = window._CU; window.location.href = `/profil.html?id=${u?.id||''}#tab-abonnes`; }, 400); break;
      case 'profil_suivis':
        addMsg('oz', '👥 J\'ouvre la liste des comptes que vous suivez…');
        setTimeout(() => { const u = window._CU; window.location.href = `/profil.html?id=${u?.id||''}#tab-suivis`; }, 400); break;
      case 'profil_communs': {
        const profilMatch = window.location.pathname.includes('/profil.html');
        if (profilMatch) {
          addMsg('oz', '🤝 J\'ouvre l\'onglet "En commun" pour ce profil…');
          if (window.switchProfileTab) { switchProfileTab('communs'); }
          else window.location.hash = '#tab-communs';
        } else {
          addMsg('oz', '🤝 Naviguez d\'abord sur un profil pour voir vos relations en commun.');
        }
        break;
      }
      case 'profil_publications':
        addMsg('oz', '📝 J\'ouvre l\'onglet Publications de votre profil…');
        setTimeout(() => { const u = window._CU; window.location.href = `/profil.html?id=${u?.id||''}#tab-publications`; }, 400); break;
      case 'profil_publicites':
        addMsg('oz', '📣 J\'ouvre l\'onglet Publicités de votre profil…');
        setTimeout(() => { const u = window._CU; window.location.href = `/profil.html?id=${u?.id||''}#tab-publicites`; }, 400); break;
      case 'profil_activite':
        addMsg('oz', '⚡ J\'ouvre votre fil d\'activité publique…');
        setTimeout(() => { const u = window._CU; window.location.href = `/profil.html?id=${u?.id||''}#tab-activite`; }, 400); break;
      case 'profil_banner':
        addMsg('oz', '🖼️ Pour modifier votre bannière, ouvrez votre profil et survolez la bannière pour voir le bouton "Changer la bannière".');
        setTimeout(() => { const u = window._CU; window.location.href = `/profil.html?id=${u?.id||''}`; }, 600); break;
      case 'profil_privacy':
        addMsg('oz', '🔒 J\'ouvre les paramètres de confidentialité de votre profil…');
        setTimeout(() => { const u = window._CU; window.location.href = `/profil.html?id=${u?.id||''}#tab-confidentialite`; }, 400); break;
      case 'profil_public':
        addMsg('oz', '👤 J\'ouvre votre profil public…');
        setTimeout(() => { const u = window._CU; window.location.href = `/profil.html?id=${u?.id||''}`; }, 400); break;

      // ── Deals
      case 'deal_create':
      case 'deal_list': {
        try {
          const me = await fetch('/api/auth/me', {credentials:'include'}).then(r=>r.json());
          if (!me?.user) { addMsg('oz', '🔒 Vous devez être connecté pour accéder aux Deals.'); break; }
          if (me.user.role !== 'initiative') {
            addMsg('oz', 'ℹ️ La fonctionnalité **Gérer un Deal** est réservée aux comptes Initiative disposant de l\'accréditation correspondante.\n\nSouhaitez-vous en savoir plus sur les accréditations Diaspo\'Actif ?');
            break;
          }
          const accr = await fetch('/api/initiatives/mes', {credentials:'include'}).then(r=>r.json()).catch(()=>null);
          const initId = accr?.[0]?.id;
          if (initId) {
            const hasDeal = await fetch(`/api/admin/deals/accreditations`, {credentials:'include'}).then(r=>r.json()).catch(()=>null);
            const accredited = hasDeal?.accreditations?.some?.(a => a.initiative_id === initId && a.statut === 'active');
            if (!accredited) {
              addMsg('oz', '🤝 Cette fonctionnalité nécessite l\'accréditation **« Gérer un Deal »**.\n\nSeuls les comptes Initiative accrédités par Diaspo\'Actif peuvent créer, gérer ou rejoindre un Deal.\n\nSouhaitez-vous consulter les conditions d\'obtention ou déposer une demande ?');
              break;
            }
          }
          addMsg('oz', '🤝 J\'ouvre votre espace Deals...');
          setTimeout(() => { window.location.href = '/dashboard-initiative.html#deals'; }, 500);
        } catch(e) {
          addMsg('oz', '🤝 J\'ouvre votre espace Deals...');
          setTimeout(() => { window.location.href = '/dashboard-initiative.html#deals'; }, 500);
        }
        break;
      }

      // ── Fallback : KB puis confusion
      default: {
        const kb = await queryKB(text);
        if (kb) { addMsg('oz', kb); }
        else {
          addMsg('oz', L.confused[Math.floor(Math.random()*L.confused.length)] +
            '\n\nExemples de commandes :\n• « **Ouvre les accréditations** »\n• « **Ouvre mes messages** »\n• « **Montre-moi mon agenda** »\n• « **Crée un événement** »');
          logUnanswered(text);
        }
      }
    }
  }

  /* Navigation IMMÉDIATE — pas de bouton intermédiaire */
  async function navTo(key) {
    const m = MODULES[key];
    if (!m) return;
    // Si on est déjà sur la page, juste fermer le panel
    if (window.location.pathname === m.url || window.location.href.endsWith(m.url)) {
      addMsg('oz', `${m.icon} Vous êtes déjà sur **${m.label}**.`);
      return;
    }
    addMsg('oz', `${m.icon} J'ouvre **${m.label}**...`);
    await audit('navigate', key);
    setTimeout(() => { window.location.href = m.url; }, 500);
  }

  /* Actions directes — navigation immédiate vers le formulaire */
  const ACTION_DEFS = {
    create_event:      { msg: "🎪 J'ouvre le formulaire de création d'événement...",        url: '/evenements.html' },
    create_initiative: { msg: "🚀 J'ouvre le module Initiatives...",                        url: '/initiative.html' },
    create_campaign:   { msg: "📣 J'ouvre le module Initiatives pour votre campagne...",    url: '/initiative.html' },
    create_article:    { msg: "📝 J'ouvre le fil d'actualité pour rédiger votre article...",url: '/fil-actualite.html' },
    create_ticket:     { msg: "🎟️ J'ouvre la Billetterie...",                              url: '/billetterie.html' },
    create_contract:   { msg: "📄 J'ouvre le module Contrats...",                           url: '/contrats.html' },
    create_newsletter: { msg: "📧 J'ouvre la Messagerie pour votre newsletter...",          url: '/messagerie.html' },
    create_cv:         { msg: "📝 J'ouvre le CV Builder...",                               url: '/cv-builder.html' },
    create_sondage:    { msg: "📊 J'ouvre les Sondages...",                                url: '/sondages.html' },
    find_partners:     { msg: "🔍 J'ouvre l'Annuaire pour trouver des partenaires...",     url: '/annuaire.html' },
    send_message:      { msg: "💬 J'ouvre la Messagerie...",                               url: '/messagerie.html' },
  };

  async function execAction(key) {
    const def = ACTION_DEFS[key];
    if (!def) { addMsg('oz', "Cette fonctionnalité arrive bientôt ! 🚀"); return; }
    addMsg('oz', def.msg);
    await audit('action', key);
    setTimeout(() => { window.location.href = def.url; }, 500);
  }

  /* Ajout agenda via API si date/heure détectée */
  async function agendaAdd(text) {
    // Extraction : titre, date, heure
    const dateM = text.match(/(?:le\s+)?(\d{1,2})[\/\-\s](\d{1,2})(?:[\/\-\s](\d{2,4}))?/);
    const timeM  = text.match(/[àa]\s*(\d{1,2})[h:]\s*(\d{0,2})/i);
    // Titre : tout ce qui est entre "Ajoute" et "à mon agenda" ou avant "le [date]"
    const titleM = text.match(/ajouter?\s+"?([^"]+?)"?\s+[àa]\s+(?:mon\s+)?agenda/i)
                || text.match(/ajouter?\s+"?([^"]+?)"?\s+le\s+\d/i)
                || text.match(/cr[eé][eé]r?\s+(?:un\s+)?rendez[-\s]vous\s+"?([^"]+?)"?\s/i);

    if (!dateM) {
      // Pas de date fournie : ouvrir l'agenda
      addMsg('oz', "📅 J'ouvre votre agenda. Précisez la date pour que je crée directement le rendez-vous.");
      await audit('navigate', 'agenda');
      setTimeout(() => { window.location.href = MODULES.agenda.url; }, 500);
      return;
    }

    const titre = titleM?.[1]?.trim() || 'Nouveau rendez-vous';
    const jour = dateM[1].padStart(2,'0');
    const mois = dateM[2].padStart(2,'0');
    const annee = dateM[3] ? (dateM[3].length===2 ? '20'+dateM[3] : dateM[3]) : new Date().getFullYear();
    const heure = timeM ? timeM[1].padStart(2,'0') : '09';
    const min   = timeM ? (timeM[2]||'00').padStart(2,'0') : '00';
    const dateStr = `${annee}-${mois}-${jour}T${heure}:${min}`;

    addMsg('oz', `📅 Création : **${titre}** le ${jour}/${mois}/${annee} à ${heure}h${min}...`);
    try {
      const r = await fetch('/api/agenda', {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ titre, date_debut: dateStr, date_fin: dateStr, type:'rdv' })
      });
      if (r.ok) {
        addMsg('oz', `✅ Rendez-vous **"${titre}"** ajouté à votre agenda pour le ${jour}/${mois}/${annee} à ${heure}h${min}.`);
        await audit('action', 'agenda_add', { titre, date: dateStr }, 'ok');
      } else {
        addMsg('oz', `📅 Je vous emmène sur l'agenda pour créer ce rendez-vous.`);
        setTimeout(() => { window.location.href = MODULES.agenda.url; }, 500);
      }
    } catch(e) {
      addMsg('oz', `📅 Je vous emmène sur l'agenda.`);
      setTimeout(() => { window.location.href = MODULES.agenda.url; }, 500);
    }
  }

  async function execPending() {
    if (!_pending) return;
    const p = _pending; _pending = null;
    if (p.fn) { await p.fn(); return; }
    if (p.url) {
      addMsg('oz', '✅ Parfait !');
      await audit('navigate', p.url);
      setTimeout(() => window.location.href = p.url, 400);
    }
  }

  async function handleBtn(action, param) {
    if (action === 'nav' && param) {
      addMsg('oz', '🚀 J\'y vais...');
      await audit('navigate', param);
      setTimeout(() => window.location.href = param, 500);
    } else if (action === 'tutorial') {
      if (typeof window.daReplayOnboarding === 'function') window.daReplayOnboarding();
      else window.location.href = '/dashboard-utilisateur.html';
      closePanel();
    } else if (action === 'cancel') {
      _pending = null;
      addMsg('oz', '✅ Annulé. Que puis-je faire d\'autre ?');
    }
  }

  /* ══════════════════════════════════════════
     BASE DE CONNAISSANCE
  ══════════════════════════════════════════ */
  async function loadKB() {
    try {
      const r = await fetch('/api/oz/knowledge', { credentials: 'include' });
      if (r.ok) _kb = await r.json().catch(()=>[]);
    } catch(e) {}
  }

  async function queryKB(text) {
    const norm = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    const words = norm.split(/\s+/).filter(w=>w.length>3);

    // KB interne
    let best=null, bestN=0;
    for (const item of _kb) {
      const hay = ((item.topic||'')+' '+(item.content||'')+' '+(item.tags||'')).toLowerCase();
      const n = words.filter(w=>hay.includes(w)).length;
      if (n>bestN) { bestN=n; best=item; }
    }
    if (best && bestN >= 2) return '📚 ' + best.content;

    // FAQ search
    try {
      const r = await fetch(`/api/faq/search?q=${encodeURIComponent(text)}&role=${_role||'tous'}`, { credentials:'include' });
      if (r.ok) {
        const res = await r.json();
        if (Array.isArray(res) && res.length) {
          const top = res[0];
          return `📚 **${top.question}**\n\n${top.reponse}${top.module_lien?'\n\n→ '+top.module_lien:''}`;
        }
      }
    } catch(e){}

    // Log comme question sans réponse
    logUnanswered(text);
    return null;
  }

  function logUnanswered(question) {
    try {
      fetch('/api/faq/sans-reponse', {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ question, source:'oz', compte_type:_role||'tous', langue:navigator.language?.slice(0,2)||'fr' })
      }).catch(()=>{});
    } catch(e){}
  }

  /* ══════════════════════════════════════════
     PROACTIF
  ══════════════════════════════════════════ */
  function scheduleProactive() {
    clearTimeout(_proTimer);
    const reset = () => { clearTimeout(_proTimer); _proTimer = setTimeout(proactive, 90000); };
    document.addEventListener('mousemove', reset, { passive:true });
    document.addEventListener('keydown',   reset, { passive:true });
    _proTimer = setTimeout(proactive, 90000);
  }

  function proactive() {
    if (document.getElementById('oz-panel')?.classList.contains('open')) return;
    showBadge();
    const tips = getProTips();
    if (tips.length) { _ctx.proTip = tips[Math.floor(Math.random()*tips.length)]; }
  }

  function getProTips() {
    const path = window.location.pathname;
    const tips = ['Avez-vous mis à jour votre profil récemment ?', 'Consultez les dernières opportunités disponibles !'];
    if (path.includes('evenement')) tips.unshift('Vous pouvez activer la billetterie pour vos événements.');
    if (path.includes('annuaire'))  tips.unshift('Filtrez par pays ou secteur pour trouver les meilleurs partenaires.');
    return tips;
  }

  /* ══════════════════════════════════════════
     TTS / STT
  ══════════════════════════════════════════ */
  function speak(text) {
    if (!_cfg.voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = navigator.language || 'fr-FR'; u.rate = 1;
    window.speechSynthesis.speak(u);
  }

  function stopSpeech() { window.speechSynthesis?.cancel(); }

  function toggleMic() {
    const btn = document.getElementById('oz-btn-mic');
    if (!btn) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { addMsg('oz', '🎤 La reconnaissance vocale nécessite Chrome ou Edge.'); return; }
    if (_recog) { _recog.stop(); return; }
    _recog = new SR();
    _recog.lang = navigator.language || 'fr-FR';
    _recog.continuous = false; _recog.interimResults = false;
    _recog.onstart  = () => btn.classList.add('on');
    _recog.onend    = () => { btn.classList.remove('on'); _recog = null; };
    _recog.onerror  = () => { btn.classList.remove('on'); _recog = null; };
    _recog.onresult = e => {
      const t = e.results[0][0].transcript;
      const inp = document.getElementById('oz-inp');
      if (inp) { inp.value = t; send(); }
    };
    _recog.start(); openPanel();
  }

  /* ══════════════════════════════════════════
     SALUTATION & RÔLE
  ══════════════════════════════════════════ */
  function getRoleGreeting() {
    const map = {
      initiative:     "Je vois que vous gérez une initiative ! Je peux vous aider à créer des événements, recruter des membres et promouvoir vos projets.",
      collectivite:   "Je vois que vous représentez une collectivité. Je peux vous aider à gérer vos services, partenariats et opportunités.",
      institution:    "Je vois que vous représentez une institution. Je suis là pour faciliter vos interactions avec la diaspora.",
      officiel:       "Je vois que vous avez un compte officiel. Je peux vous aider à gérer votre présence sur la plateforme.",
      administrateur: "⚙️ **Mode administrateur** actif. Je peux vous aider à gérer la plateforme et analyser les statistiques.",
    };
    return map[_role] || '';
  }

  function getPermsText() {
    const map = {
      utilisateur:    "En tant qu'**utilisateur**, vous pouvez :\n• Créer et rejoindre des événements\n• Suivre des initiatives et membres\n• Envoyer des messages\n• Participer aux discussions",
      initiative:     "En tant que **porteur d'initiative**, vous pouvez :\n• Créer des événements et initiatives\n• Publier des articles et campagnes\n• Recruter des membres\n• Créer des billetteries",
      collectivite:   "En tant que **collectivité**, vous pouvez :\n• Gérer des services et partenariats\n• Publier des opportunités\n• Organiser des réunions officielles\n• Accéder aux statistiques territoriales",
      administrateur: "En tant qu'**administrateur**, vous avez accès à tout :\n• Gestion des utilisateurs et contenus\n• Modération et statistiques complètes\n• Configuration de la plateforme\n• Gestion de O-Z",
    };
    return map[_role] || "Consultez votre profil pour voir vos permissions détaillées.";
  }

  /* ══════════════════════════════════════════
     AUDIT
  ══════════════════════════════════════════ */
  async function audit(action, module, params, result) {
    try {
      await fetch('/api/oz/audit', {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action, module, params: params||null, result: result||'ok' })
      });
    } catch(e){}
  }

  /* ══════════════════════════════════════════
     SETTINGS
  ══════════════════════════════════════════ */
  function loadLocal() {
    try { const s=localStorage.getItem('da_oz'); if(s) Object.assign(_cfg, JSON.parse(s)); } catch(e){}
  }

  function saveLocal() {
    try { localStorage.setItem('da_oz', JSON.stringify(_cfg)); } catch(e){}
  }

  async function loadServerCfg() {
    try {
      const r = await fetch('/api/oz/settings', { credentials:'include' });
      if (!r.ok) return;
      const s = await r.json();
      if (!s || s.error) return;
      if (s.avatar)       _cfg.avatar       = s.avatar;
      if (s.theme)        _cfg.theme        = s.theme;
      if (s.size)         _cfg.size         = s.size;
      if (s.animations !== undefined) _cfg.animations  = !!s.animations;
      if (s.voice_enabled !== undefined) _cfg.voiceEnabled = !!s.voice_enabled;
      if (s.language)     _cfg.language     = s.language;
      // pos_x / pos_y ignorés — OZ est intégré dans la topbar
      // Re-apply
      applyTheme(); applySize(); updateAvatar();
    } catch(e){}
  }

  async function saveServerCfg() {
    try {
      await fetch('/api/oz/settings', {
        method:'PUT', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          avatar: _cfg.avatar, theme: _cfg.theme, size: _cfg.size,
          animations: _cfg.animations?1:0, voice_enabled: _cfg.voiceEnabled?1:0,
          language: _cfg.language, pos_x: _cfg.posX||null, pos_y: _cfg.posY||null,
        })
      });
    } catch(e){}
  }

  function saveSettings() {
    _cfg.size  = document.getElementById('oz-sz-sel')?.value  || _cfg.size;
    _cfg.theme = document.getElementById('oz-th-sel')?.value  || _cfg.theme;
    saveLocal(); saveServerCfg(); applyTheme(); applySize(); updateAvatar();
    closeSettings(); openPanel();
    addMsg('oz', '✅ Vos préférences ont été enregistrées !');
  }

  /* ══════════════════════════════════════════
     THEME / SIZE / AVATAR
  ══════════════════════════════════════════ */
  function applyTheme() {
    const root = document.getElementById('oz-root');
    if (!root) return;
    const dark = _cfg.theme==='dark' || (_cfg.theme==='auto' && window.matchMedia('(prefers-color-scheme:dark)').matches);
    root.classList.toggle('dk', dark);
  }

  function applySize() {
    const b = document.getElementById('oz-bubble');
    if (!b) return;
    b.classList.remove('sm','lg');
    if (_cfg.size==='small') b.classList.add('sm');
    if (_cfg.size==='large') b.classList.add('lg');
  }

  function updateAvatar() {
    const e = avEmoji();
    const i = document.getElementById('oz-av-icon');
    const h = document.getElementById('oz-hd-av');
    if (i) i.textContent = e;
    if (h) h.textContent = e;
  }

  function avEmoji() {
    if (_cfg.avatarCustom) return `<img src="${_cfg.avatarCustom}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="O-Z">`;
    return AVATARS[_cfg.avatar]?.e || '🤖';
  }

  /* ══════════════════════════════════════════
     BADGE
  ══════════════════════════════════════════ */
  function showBadge() {
    const b = document.getElementById('oz-badge');
    if (b && !document.getElementById('oz-panel')?.classList.contains('open')) {
      b.textContent='!'; b.style.display='flex';
    }
  }

  function hideBadge() {
    const b = document.getElementById('oz-badge');
    if (b) b.style.display='none';
  }

  /* ══════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════ */
  function getLang() { return R[_cfg.language] || R.fr; }
  function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

  /* ══════════════════════════════════════════
     API PUBLIQUE
  ══════════════════════════════════════════ */
  window.__OZ = {
    open:          openPanel,
    close:         closePanel,
    say:           (msg) => { openPanel(); addMsg('oz', msg); },
    ask:           (msg) => { openPanel(); addMsg('oz', msg); },
    saveSettings,
    closeSettings,
    getRole:       () => _role,
    setRole:       (r) => { _role = r; showQuickChips(); },
  };

  // Démarrage
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
