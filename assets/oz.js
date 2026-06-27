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
    evenements:   { label: 'Événements',   url: '/evenements.html',           icon: '🎪' },
    initiatives:  { label: 'Initiatives',  url: '/initiatives.html',          icon: '🚀' },
    annuaire:     { label: 'Annuaire',     url: '/annuaire.html',             icon: '📋' },
    messagerie:   { label: 'Messagerie',   url: '/messagerie.html',           icon: '💬' },
    formations:   { label: 'Formations',   url: '/formations.html',           icon: '📚' },
    faq:          { label: 'FAQ',          url: '/faq.html',                  icon: '❓' },
    actualites:   { label: 'Actualités',   url: '/fil-actualite.html',        icon: '📰' },
    recherche:    { label: 'Recherche',    url: '/recherche.html',            icon: '🔍' },
    dashboard:    { label: 'Tableau de bord', url: '/dashboard-utilisateur.html', icon: '🏠' },
    visio:        { label: 'Visioconférence', url: '/visioconference.html',   icon: '📹' },
    contrats:     { label: 'Contrats',     url: '/contrats.html',             icon: '📄' },
    billetterie:  { label: 'Billetterie',  url: '/billetterie.html',          icon: '🎟️' },
    statistiques: { label: 'Statistiques', url: '/statistiques.html',         icon: '📊' },
    parametres:   { label: 'Paramètres',   url: '/parametre.html',            icon: '⚙️' },
  };

  const INTENTS = [
    // Salutations (prioritaires)
    { re: /^(bonjour|salut|hello|bonsoir|coucou|hey|allo)/i, id: 'greet' },
    { re: /merci/i, id: 'thanks' },
    { re: /au\s*revoir|bye|bonne\s*(soir|nuit|journée)/i, id: 'bye' },
    { re: /que\s+peux[-\s]tu\s+(faire|m[e']?aider)|tes?\s+(fonctions?|capacités?)|quoi\s+(faire|dire)/i, id: 'capabilities' },
    { re: /aide|help|comment\s+(faire|utiliser?|commencer)|d[eé]buter/i, id: 'help' },
    { re: /tutoriel|guide\s+(d[e']?accueil|interactif)/i, id: 'tutorial' },
    { re: /quels?\s+(sont\s+)?mes\s+(droits?|permissions?)|que\s+puis[-\s]je\s+faire/i, id: 'my_permissions' },
    // O-Z
    { re: /personnaliser?\s+(o[-\s]?z|ton\s+apparence|l[e']?avatar)|changer?\s+(d[e']?avatar|ton\s+apparence)/i, id: 'oz_settings' },
    { re: /activer?\s+(la\s+)?voix|mode\s+vocal/i, id: 'enable_voice' },
    { re: /d[eé]sactiver?\s+(la\s+)?voix|couper?\s+(la\s+)?voix/i, id: 'disable_voice' },
    // Actions spécifiques AVANT navigation générale
    { re: /cr[eé][eé]r?\s+(un\s+)?[eé]v[eé]nement|organiser?\s+(un[e]?\s+)?(r[eé]union|conf[eé]rence|atelier|webinaire)|planifier\s+(une?\s+)?r[eé]union/i, id: 'create_event' },
    { re: /cr[eé][eé]r?\s+(une?\s+)?initiative|lancer?\s+(un\s+)?projet/i, id: 'create_initiative' },
    { re: /cr[eé][eé]r?\s+(une?\s+)?campagne/i, id: 'create_campaign' },
    { re: /r[eé]diger?\s+(un\s+)?article|[eé]crire?\s+(un\s+)?article|publier?\s+(un\s+)?article/i, id: 'create_article' },
    { re: /cr[eé][eé]r?\s+(une?\s+)?billett/i, id: 'create_ticket' },
    { re: /g[eé]n[eé]rer?\s+(un\s+)?contrat|cr[eé][eé]r?\s+(un\s+)?contrat|r[eé]diger?\s+(un\s+)?contrat/i, id: 'create_contract' },
    { re: /trouver?\s+(des?\s+)?partenaires?|chercher?\s+(des?\s+)?partenaires?/i, id: 'find_partners' },
    { re: /envoyer?\s+(un\s+)?message\s+[aà]/i, id: 'send_message' },
    { re: /newsletter/i, id: 'create_newsletter' },
    // Navigation (après les actions spécifiques)
    { re: /ouvr[ei]r?\s+(les?\s+)?[eé]v[eé]nements?|aller?\s+(aux?\s+)?[eé]v[eé]nements?/i, id: 'nav_evenements' },
    { re: /ouvr[ei]r?\s+(les?\s+)?initiatives?|aller?\s+(aux?\s+)?initiatives?/i, id: 'nav_initiatives' },
    { re: /messagerie/i, id: 'nav_messagerie' },
    { re: /annuaire|membres?/i, id: 'nav_annuaire' },
    { re: /formation/i, id: 'nav_formations' },
    { re: /faq|question\s+fr[eé]quente/i, id: 'nav_faq' },
    { re: /tableau\s+de\s+bord|dashboard/i, id: 'nav_dashboard' },
    { re: /actualit[eé]|fil\s+d[e']actualit[eé]/i, id: 'nav_actualites' },
    { re: /visio|conf[eé]rence\s+vid[eé]o|r[eé]union\s+en\s+ligne/i, id: 'nav_visio' },
    { re: /contrat/i, id: 'nav_contrats' },
    { re: /billett/i, id: 'nav_billetterie' },
    { re: /statistique|stats\b/i, id: 'nav_statistiques' },
    { re: /param[eè]tre|configuration|profil/i, id: 'nav_parametres' },
    { re: /recherche/i, id: 'nav_recherche' },
    { re: /[eé]v[eé]nement/i, id: 'nav_evenements' },
    { re: /initiative|projet/i, id: 'nav_initiatives' },
    // Admin
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
#oz-root{position:fixed;z-index:99999;user-select:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --oz-bg:#fff;--oz-text:#1a1a2e;--oz-muted:#6b7280;--oz-border:#e5e7eb;
  --oz-primary:#4a90d9;--oz-acc:#10b981;--oz-sh:0 8px 32px rgba(0,0,0,.18);--oz-r:16px;}
#oz-root.dk{--oz-bg:#1e2130;--oz-text:#f1f5f9;--oz-muted:#94a3b8;--oz-border:#334155;--oz-primary:#60a5fa;--oz-acc:#34d399;}

#oz-bubble{position:absolute;width:62px;height:62px;border-radius:50%;
  background:linear-gradient(135deg,#1a1a2e 0%,#2563eb 60%,#10b981 100%);
  box-shadow:var(--oz-sh);cursor:grab;display:flex;align-items:center;justify-content:center;
  font-size:28px;border:3px solid #fff;transition:transform .2s,box-shadow .2s;flex-shrink:0;}
#oz-bubble:hover{transform:scale(1.08);box-shadow:0 12px 40px rgba(74,144,217,.45);}
#oz-bubble.drag{cursor:grabbing;transform:scale(1.13);}
#oz-bubble.sm{width:48px;height:48px;font-size:20px;}
#oz-bubble.lg{width:78px;height:78px;font-size:36px;}

#oz-badge{position:absolute;top:-5px;right:-5px;width:20px;height:20px;border-radius:50%;
  background:#ef4444;color:#fff;font-size:10px;font-weight:800;
  display:none;align-items:center;justify-content:center;border:2px solid #fff;
  animation:ozPop .3s ease-out;}
@keyframes ozPop{from{transform:scale(0)}to{transform:scale(1)}}

#oz-panel{position:absolute;width:360px;max-height:520px;background:var(--oz-bg);
  border-radius:var(--oz-r);box-shadow:var(--oz-sh);display:flex;flex-direction:column;
  overflow:hidden;border:1.5px solid var(--oz-border);
  opacity:0;transform:translateY(-10px) scale(.96);pointer-events:none;
  transition:opacity .22s,transform .22s;top:56px;right:0;}
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

    // Position — défaut : haut droite
    const px = _cfg.posX ?? (window.innerWidth  - 66);
    const py = _cfg.posY ?? 16;
    root.style.left = Math.max(0, Math.min(px, window.innerWidth  - 60)) + 'px';
    root.style.top  = Math.max(0, Math.min(py, window.innerHeight - 60)) + 'px';

    document.body.appendChild(root);
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
    const root = document.getElementById('oz-root');
    if (!root) return;
    _dragging = true; _dragMoved = true;
    const x = Math.max(0, Math.min(window.innerWidth  - root.offsetWidth,  cx - _dragOff.x));
    const y = Math.max(0, Math.min(window.innerHeight - root.offsetHeight, cy - _dragOff.y));
    root.style.left = x + 'px';
    root.style.top  = y + 'px';
  }

  function endDrag() {
    _dragging = false; _dragActive = false;
    document.getElementById('oz-bubble')?.classList.remove('drag');
    const root = document.getElementById('oz-root');
    if (!root) return;
    _cfg.posX = parseInt(root.style.left);
    _cfg.posY = parseInt(root.style.top);
    saveLocal();
    clearTimeout(window._ozPosSave);
    window._ozPosSave = setTimeout(saveServerCfg, 1500);
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
      case 'greet': {
        const h = new Date().getHours();
        const pool = h < 18 ? L.greet_day : L.greet_eve;
        const msg = pool[Math.floor(Math.random()*pool.length)];
        addMsg('oz', msg + (getRoleGreeting() ? '\n\n' + getRoleGreeting() : ''));
        showQuickChips(); break;
      }
      case 'thanks': addMsg('oz', L.thanks[Math.floor(Math.random()*L.thanks.length)]); break;
      case 'bye':    addMsg('oz', L.bye[0]); setTimeout(closePanel, 2000); break;
      case 'capabilities': addMsg('oz', L.capabilities); break;
      case 'my_permissions': addMsg('oz', getPermsText()); break;

      case 'help':
        addMsg('oz', "Je suis là pour vous aider ! Voici ce que vous pouvez me demander :\n\n• **Créer** un événement, une initiative, un article\n• **Trouver** des partenaires ou membres\n• **Naviguer** vers n'importe quel module\n• **Lancer** les tutoriels d'accueil\n• **Répondre** à vos questions\n\nSouhaitez-vous que je lance le guide d'accueil ?",
          `<div class="oz-card-title">Premiers pas</div><div class="oz-card-btns">
            <button class="oz-btn oz-btn-p" data-oz="tutorial">🎓 Lancer le tutoriel</button>
            <button class="oz-btn oz-btn-s" data-oz="nav" data-p="/faq.html">❓ FAQ</button>
          </div>`);
        break;

      case 'tutorial':
        addMsg('oz', '🎓 Lancement du guide interactif...');
        setTimeout(() => { if (typeof window.daReplayOnboarding === 'function') window.daReplayOnboarding(); else window.location.href = '/dashboard-utilisateur.html'; }, 600);
        break;

      case 'oz_settings': addMsg('oz', '⚙️ Voici vos options de personnalisation !'); toggleSettings(); break;
      case 'enable_voice':  _cfg.voiceEnabled=true;  document.getElementById('oz-voice-sw')?.classList.add('on');    addMsg('oz','🎙️ Synthèse vocale activée !'); speak('Synthèse vocale activée.'); break;
      case 'disable_voice': _cfg.voiceEnabled=false; document.getElementById('oz-voice-sw')?.classList.remove('on'); stopSpeech(); addMsg('oz','🔇 Synthèse vocale désactivée.'); break;

      // Navigation directe
      case 'nav_evenements':   navTo('evenements');   break;
      case 'nav_initiatives':  navTo('initiatives');  break;
      case 'nav_messagerie':   navTo('messagerie');   break;
      case 'nav_annuaire':     navTo('annuaire');     break;
      case 'nav_formations':   navTo('formations');   break;
      case 'nav_faq':          navTo('faq');          break;
      case 'nav_actualites':   navTo('actualites');   break;
      case 'nav_visio':        navTo('visio');        break;
      case 'nav_contrats':     navTo('contrats');     break;
      case 'nav_billetterie':  navTo('billetterie');  break;
      case 'nav_statistiques': navTo('statistiques'); break;
      case 'nav_parametres':   navTo('parametres');   break;
      case 'nav_recherche':    navTo('recherche');    break;
      case 'nav_dashboard':    navTo('dashboard');    break;
      case 'nav_admin':
        addMsg('oz', "⚙️ Je vous emmène sur le panneau d'administration.",
          `<div class="oz-card-btns"><button class="oz-btn oz-btn-p" data-oz="nav" data-p="/dashboard-administrateur.html">⚙️ Administration</button></div>`);
        break;

      // Créations
      case 'create_event':    proposeAction('create_event',    text); break;
      case 'create_initiative': proposeAction('create_initiative', text); break;
      case 'create_campaign': proposeAction('create_campaign', text); break;
      case 'create_article':  proposeAction('create_article',  text); break;
      case 'create_ticket':   proposeAction('create_ticket',   text); break;
      case 'create_contract': proposeAction('create_contract', text); break;
      case 'create_newsletter': proposeAction('create_newsletter', text); break;
      case 'find_partners':   proposeAction('find_partners',   text); break;
      case 'send_message':    navTo('messagerie'); break;

      default: {
        const kb = await queryKB(text);
        if (kb) { addMsg('oz', kb); }
        else {
          addMsg('oz', L.confused[Math.floor(Math.random()*L.confused.length)] +
            '\n\nEssayez par exemple :\n• « **Créer un événement** »\n• « **Trouver des partenaires** »\n• « **Comment utiliser la plateforme ?** »');
        }
      }
    }
  }

  function navTo(key) {
    const m = MODULES[key];
    if (!m) return;
    addMsg('oz', `${m.icon} Je vous emmène sur **${m.label}**.`,
      `<div class="oz-card-btns"><button class="oz-btn oz-btn-p" data-oz="nav" data-p="${m.url}">${m.icon} Ouvrir ${m.label}</button></div>`);
  }

  const ACTION_DEFS = {
    create_event:      { title:'🎪 Créer un événement',         desc:"Je vais vous emmener sur le module Événements. Vous pourrez définir le titre, la date, le lieu et inviter des participants.",            url:'/evenements.html' },
    create_initiative: { title:'🚀 Créer une initiative',       desc:"Lancez un projet communautaire via le module Initiatives. Recrutez des membres et gérez vos objectifs.",                               url:'/initiatives.html' },
    create_campaign:   { title:'📣 Créer une campagne',         desc:"Créez une campagne de recrutement ou de communication via le module Initiatives.",                                                     url:'/initiatives.html' },
    create_article:    { title:'📝 Rédiger un article',         desc:"Publiez un article sur le fil d'actualité pour partager vos news et projets.",                                                        url:'/fil-actualite.html' },
    create_ticket:     { title:'🎟️ Créer une billetterie',     desc:"Configurez la vente de billets pour votre événement via le module Billetterie.",                                                      url:'/billetterie.html' },
    create_contract:   { title:'📄 Générer un contrat',         desc:"Créez et signez un contrat de partenariat officiel via le module Contrats.",                                                          url:'/contrats.html' },
    create_newsletter: { title:'📧 Préparer une newsletter',    desc:"Rédigez et envoyez une newsletter à votre communauté.",                                                                               url:'/messagerie.html' },
    find_partners:     { title:'🔍 Trouver des partenaires',    desc:"Je vais ouvrir l'Annuaire avec les filtres adaptés pour identifier des partenaires, entreprises ou associations.",                   url:'/annuaire.html' },
  };

  function proposeAction(key, originalText) {
    const def = ACTION_DEFS[key];
    if (!def) { addMsg('oz', "Cette fonctionnalité arrive bientôt ! 🚀"); return; }
    _pending = { url: def.url };
    addMsg('oz', `✅ ${def.title}\n\n${def.desc}\n\n**Voulez-vous que je vous y emmène maintenant ?**`,
      `<div class="oz-card-btns">
        <button class="oz-btn oz-btn-p" data-oz="nav" data-p="${def.url}">→ ${def.title}</button>
        <button class="oz-btn oz-btn-s" data-oz="cancel">✕ Annuler</button>
      </div>`);
  }

  async function execPending() {
    if (!_pending) return;
    const url = _pending.url; _pending = null;
    addMsg('oz', '🚀 Parfait ! Je vous emmène...');
    await audit('navigate', url);
    setTimeout(() => window.location.href = url, 600);
  }

  async function handleBtn(action, param) {
    if (action === 'nav' && param) {
      addMsg('oz', '🚀 Je vous emmène... À tout de suite !');
      await audit('navigate', param);
      setTimeout(() => window.location.href = param, 650);
    } else if (action === 'tutorial') {
      if (typeof window.daReplayOnboarding === 'function') window.daReplayOnboarding();
      else window.location.href = '/dashboard-utilisateur.html';
      closePanel();
    } else if (action === 'cancel') {
      _pending = null;
      addMsg('oz', '✅ Annulé. Comment puis-je vous aider autrement ?');
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
      if (s.pos_x)        _cfg.posX         = s.pos_x;
      if (s.pos_y)        _cfg.posY         = s.pos_y;
      // Re-apply
      applyTheme(); applySize(); updateAvatar();
      const root = document.getElementById('oz-root');
      if (root && s.pos_x) {
        root.style.left = Math.min(s.pos_x, window.innerWidth-80)  + 'px';
        root.style.top  = Math.min(s.pos_y, window.innerHeight-80) + 'px';
      }
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
