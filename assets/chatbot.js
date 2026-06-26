/* ================================================================
   Diaspo'Actif — Chatbot intelligent (page d'accueil)
   Architecture : 3 couches — Fondation / Valeur / Technique
   ================================================================ */
(function () {
  'use strict';

  /* ── Base de connaissances ── */
  const KB = {
    welcome: {
      text: "Bonjour ! 👋 Je suis l'assistant Diaspo'Actif.\n\nJe peux vous aider à :",
      bullets: [
        "Comprendre la vision et le projet",
        "Découvrir les comptes et accréditations",
        "Vous guider dans vos premières étapes",
      ],
      quickReplies: [
        { label: "C'est quoi Diaspo'Actif ?", intent: "fondation" },
        { label: "Quels sont les avantages ?", intent: "valeur" },
        { label: "Comment s'inscrire ?", intent: "tech_compte" },
      ],
    },

    /* ── COUCHE 1 : Fondation / Histoire ── */
    fondation: {
      text: "Diaspo'Actif est une plateforme collaborative dédiée à la diaspora africaine et à ses alliés. 🌍",
      bullets: [
        "La diaspora manque d'outils pour se coordonner et agir collectivement",
        "Des talents, des ressources et des projets existent partout — mais restent dispersés",
        "Diaspo'Actif structure un écosystème : mise en relation, visibilité, action",
      ],
      closing: "Nous fournissons les outils. La transformation appartient à la diaspora elle-même.",
      quickReplies: [
        { label: "Qui peut s'inscrire ?", intent: "qui_peut" },
        { label: "Quelles accréditations ?", intent: "accreditations" },
        { label: "Je veux créer un compte", intent: "tech_compte" },
      ],
    },

    vision: {
      text: "Notre vision : structurer un écosystème collaboratif durable pour la diaspora. 🤝",
      bullets: [
        "Connecter les initiatives, talents et ressources de la diaspora",
        "Créer des ponts entre les communautés, les territoires et les secteurs",
        "Favoriser un impact collectif mesurable et durable",
      ],
      closing: "Diaspo'Actif est un catalyseur, pas une solution magique. L'action vient de vous.",
      quickReplies: [
        { label: "Découvrir l'annuaire", action: "annuaire.html" },
        { label: "Créer un compte gratuit", action: "inscription.html" },
        { label: "En savoir plus sur les offres", intent: "valeur" },
      ],
    },

    qui_peut: {
      text: "Diaspo'Actif s'adresse à plusieurs types d'acteurs :",
      bullets: [
        "🧑 Particuliers de la diaspora — créer un profil, rejoindre des initiatives",
        "🏢 Initiatives / Associations — se référencer, accéder aux accréditations",
        "🏛️ Collectivités — institutionnelle, observatoire diaspora",
        "Tout visiteur peut explorer l'annuaire sans inscription",
      ],
      quickReplies: [
        { label: "Créer un compte gratuit", action: "inscription.html" },
        { label: "Comparer les offres", intent: "valeur" },
      ],
    },

    /* ── COUCHE 2 : Valeur / Commercial doux ── */
    valeur: {
      text: "Voici comment Diaspo'Actif s'organise :",
      bullets: [
        "✅ Compte gratuit — accès à l'annuaire, fil d'actualité, messagerie",
        "⭐ Accrédité Niveau 1 — visibilité renforcée, badge Initiative Vérifiée",
        "🏆 Accrédité Niveau 2 — accès aux appels à projets, crédibilité maximale",
        "📣 Publicité — créer et gérer vos campagnes en toute autonomie",
      ],
      closing: "Un compte accrédité permet de publier et de gérer vos campagnes sans dépendre d'un tiers.",
      quickReplies: [
        { label: "Voir les tarifs", intent: "tarifs" },
        { label: "Demander une accréditation", intent: "tech_accred" },
        { label: "Créer un compte", action: "inscription.html" },
      ],
    },

    accreditations: {
      text: "Les accréditations Diaspo'Actif attestent l'engagement et la crédibilité d'une initiative. 🏅",
      bullets: [
        "🤝 Mobilisation Active — fédère des membres actifs",
        "💡 Créateur d'Opportunités — génère des projets concrets",
        "🔭 Observatoire Diaspora — produit des analyses et rapports",
        "🏛️ Institutionnelle — partenariat officiel avec des collectivités",
        "📣 Création Publicité — autonomie de diffusion publicitaire",
      ],
      closing: "Chaque accréditation est soumise à validation par l'équipe Diaspo'Actif.",
      quickReplies: [
        { label: "Comment demander ?", intent: "tech_accred" },
        { label: "Voir les tarifs", intent: "tarifs" },
        { label: "Créer un compte", action: "inscription.html" },
      ],
    },

    tarifs: {
      text: "Les tarifs Diaspo'Actif sont transparents et accessibles :",
      bullets: [
        "🆓 Compte utilisateur — gratuit",
        "🆓 Référencement initiative — gratuit",
        "⭐ Accréditation Niveau 1 (Initiative) — à partir de 29 €/an",
        "🏆 Accréditation Niveau 2 (Partenaire) — à partir de 79 €/an",
        "📣 Accréditation Publicité — 49 €/an",
      ],
      closing: "Chaque niveau débloque des fonctionnalités supplémentaires adaptées à vos besoins.",
      quickReplies: [
        { label: "Je veux m'accréditer", intent: "tech_accred" },
        { label: "Créer mon compte d'abord", action: "inscription.html" },
      ],
    },

    publicite: {
      text: "Avec l'accréditation Création Publicité, vous gérez vos campagnes en autonomie complète. 📣",
      bullets: [
        "Créez vos visuels et définissez votre message",
        "Ciblez géographiquement et démographiquement",
        "Choisissez vos emplacements (bannière, fil d'actualité, etc.)",
        "Définissez vos périodes de diffusion",
        "Suivez les statistiques de vos campagnes",
      ],
      closing: "Chaque publicité est soumise à validation avant diffusion.",
      quickReplies: [
        { label: "Demander l'accréditation Pub", intent: "tech_accred" },
        { label: "Voir le tarif", intent: "tarifs" },
        { label: "Créer un compte", action: "inscription.html" },
      ],
    },

    /* ── COUCHE 3 : Guide technique / Action ── */
    tech_compte: {
      text: "Créer un compte Diaspo'Actif est simple et gratuit :",
      steps: [
        "Cliquez sur « S'inscrire » en haut de la page",
        "Choisissez votre type de compte (Utilisateur ou Initiative)",
        "Remplissez vos informations (nom, email, mot de passe)",
        "Validez votre email",
        "Votre compte est actif immédiatement !",
      ],
      quickReplies: [
        { label: "S'inscrire maintenant", action: "inscription.html" },
        { label: "Se connecter", action: "login.html" },
        { label: "En savoir plus sur les accréditations", intent: "accreditations" },
      ],
    },

    tech_accred: {
      text: "Pour demander une accréditation, voici les étapes :",
      steps: [
        "Créez ou connectez-vous à votre compte Initiative",
        "Accédez à votre tableau de bord",
        "Cliquez sur « Accréditations Diaspo'Actif »",
        "Choisissez le niveau souhaité et soumettez la demande",
        "L'équipe valide votre dossier sous 48h",
      ],
      quickReplies: [
        { label: "Créer un compte Initiative", action: "inscription.html" },
        { label: "Se connecter", action: "login.html" },
        { label: "Voir les tarifs", intent: "tarifs" },
      ],
    },

    tech_pub: {
      text: "Pour créer une publicité sur Diaspo'Actif :",
      steps: [
        "Obtenez l'accréditation « Création Publicité » (49 €/an)",
        "Accédez à votre dashboard → section Publicités",
        "Cliquez sur « Créer une publicité »",
        "Remplissez les 6 étapes : info, visuel, ciblage, emplacements, planning, aperçu",
        "Soumettez à validation — diffusion sous 24h après approbation",
      ],
      quickReplies: [
        { label: "Demander l'accréditation Pub", intent: "tech_accred" },
        { label: "Voir les tarifs", intent: "tarifs" },
        { label: "Se connecter", action: "login.html" },
      ],
    },

    annuaire: {
      text: "L'annuaire Diaspo'Actif référence toutes les initiatives de la diaspora. 🗂️",
      bullets: [
        "Filtrez par nationalité, origine, pays de résidence, ville",
        "Recherchez par domaine (santé, culture, technologie…)",
        "Découvrez les initiatives vérifiées et accréditées",
        "Envoyez un message directement aux porteurs de projets",
      ],
      quickReplies: [
        { label: "Ouvrir l'annuaire", action: "annuaire.html" },
        { label: "Référencer mon initiative", action: "inscription.html" },
      ],
    },

    /* ── Fallback ── */
    fallback: {
      text: "Je ne suis pas sûr de comprendre votre question. Voici ce que je peux faire :",
      quickReplies: [
        { label: "C'est quoi Diaspo'Actif ?", intent: "fondation" },
        { label: "Voir les offres et tarifs", intent: "valeur" },
        { label: "Comment s'inscrire ?", intent: "tech_compte" },
        { label: "Créer un compte", action: "inscription.html" },
      ],
    },
  };

  /* ── Contexte enrichi (mémoire admin + site diaspo-actif.com) ── */
  let _ctx = [];      // [{titre, texte}]
  let _ctxLoaded = false;

  async function loadContext() {
    try {
      const r = await fetch('/api/chatbot/context');
      if (!r.ok) return;
      const d = await r.json();
      _ctx = [
        ...(d.memories || []).map(m => ({ titre: m.titre, texte: m.contenu, priority: true })),
        ...(d.siteContent || []).map(s => ({ titre: '', texte: s, priority: false })),
      ];
    } catch (e) { /* silencieux */ }
    _ctxLoaded = true;
  }

  function searchContext(question) {
    if (!_ctx.length) return null;
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = norm(question).split(/\s+/).filter(w => w.length >= 4);
    if (!words.length) return null;

    let best = null, bestScore = 0;
    for (const entry of _ctx) {
      const haystack = norm(entry.titre + ' ' + entry.texte);
      let score = words.reduce((s, w) => s + (haystack.includes(w) ? (entry.priority ? 2 : 1) : 0), 0);
      if (score > bestScore) { bestScore = score; best = entry; }
    }
    return bestScore >= 2 ? best : null;
  }

  function renderContextHit(entry, question) {
    // Retourner les 2 phrases les plus pertinentes du texte
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = norm(question).split(/\s+/).filter(w => w.length >= 4);
    const sentences = entry.texte.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
    const ranked = sentences.map(s => ({
      s,
      score: words.reduce((n, w) => n + (norm(s).includes(w) ? 1 : 0), 0),
    })).sort((a, b) => b.score - a.score);
    const best = ranked.slice(0, 3).map(x => x.s).join(' ');
    const html = (entry.titre ? `<p><strong>${_esc(entry.titre)}</strong></p>` : '')
      + `<p>${_esc(best || entry.texte.slice(0, 300))}</p>`;
    return {
      html,
      quickReplies: [
        { label: "En savoir plus sur Diaspo'Actif", intent: 'fondation' },
        { label: 'Voir les offres et tarifs', intent: 'valeur' },
        { label: 'Créer un compte', action: 'inscription.html' },
      ],
    };
  }

  /* ── Détection d'intention ── */
  const INTENTS_MAP = [
    { intent: "fondation",   words: ["c'est quoi","diaspoactif","diaspo actif","pourquoi ce projet","origine","histoire","mission","à quoi ça sert","pour qui","c'est qui"] },
    { intent: "vision",      words: ["vision","valeurs","philosophie","catalyseur","objectif","but","ambition"] },
    { intent: "qui_peut",    words: ["qui peut","éligible","profil","utilisateur","particulier","association","collectivité","ong"] },
    { intent: "accreditations", words: ["accréditation","accrédité","niveau","badge","mobilisation","observatoire","institutionnel","créateur d'opport"] },
    { intent: "valeur",      words: ["avantage","bénéfice","différence","pourquoi payer","gratuit","abonnement","payant","comparer"] },
    { intent: "tarifs",      words: ["tarif","prix","coût","combien","€","euro","forfait"] },
    { intent: "publicite",   words: ["publicité","pub","campagne","diffusion","annonce","bannière","ciblage","visibilité"] },
    { intent: "tech_compte", words: ["s'inscrire","inscription","créer un compte","mon compte","se connecter","connexion","créer mon profil","comment créer"] },
    { intent: "tech_accred", words: ["demander une accréditation","obtenir accréditation","comment s'accréditer","soumettre","déposer"] },
    { intent: "tech_pub",    words: ["créer une publicité","créer une pub","comment créer une pub","déposer une pub","faire une pub"] },
    { intent: "annuaire",    words: ["annuaire","rechercher","trouver une initiative","lister","répertoire"] },
  ];

  function detectIntent(text) {
    const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const { intent, words } of INTENTS_MAP) {
      for (const w of words) {
        const normalized = w.normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (t.includes(normalized)) return intent;
      }
    }
    return null;
  }

  /* ── Rendu d'une réponse ── */
  function renderResponse(key) {
    const r = KB[key] || KB.fallback;
    let html = '';
    if (r.text) html += `<p>${r.text.replace(/\n/g, '<br>')}</p>`;
    if (r.bullets) {
      html += '<ul>' + r.bullets.map(b => `<li>${b}</li>`).join('') + '</ul>';
    }
    if (r.steps) {
      html += '<ol>' + r.steps.map(s => `<li>${s}</li>`).join('') + '</ol>';
    }
    if (r.closing) html += `<p class="cb-closing">${r.closing}</p>`;
    return { html, quickReplies: r.quickReplies || [] };
  }

  /* ── Construction du widget ── */
  function buildWidget() {
    /* Bouton flottant */
    const fab = document.createElement('button');
    fab.id        = 'cb-fab';
    fab.className = 'cb-fab';
    fab.setAttribute('aria-label', 'Ouvrir le chatbot');
    fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="cb-notif">1</span>`;

    /* Panneau chat */
    const panel = document.createElement('div');
    panel.id        = 'cb-panel';
    panel.className = 'cb-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Assistant Diaspo\'Actif');
    panel.innerHTML = `
      <div class="cb-header">
        <div class="cb-avatar">DA</div>
        <div class="cb-header-info">
          <strong>Assistant Diaspo'Actif</strong>
          <span class="cb-status">● En ligne</span>
        </div>
        <button class="cb-close" id="cb-close" aria-label="Fermer">✕</button>
      </div>
      <div class="cb-messages" id="cb-messages"></div>
      <div class="cb-quick" id="cb-quick"></div>
      <div class="cb-input-row">
        <input type="text" id="cb-input" placeholder="Posez votre question…" autocomplete="off" maxlength="300">
        <button id="cb-send" class="cb-send-btn" aria-label="Envoyer">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
        </button>
      </div>`;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    /* Événements */
    fab.addEventListener('click', () => togglePanel(true));
    document.getElementById('cb-close').addEventListener('click', () => togglePanel(false));
    document.getElementById('cb-send').addEventListener('click', sendMessage);
    document.getElementById('cb-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') sendMessage();
    });

    /* Message de bienvenue après 800ms */
    setTimeout(() => showWelcome(), 800);

    /* Charger le contexte enrichi en arrière-plan */
    loadContext();
  }

  let _open = false;
  function togglePanel(force) {
    _open = (force !== undefined) ? force : !_open;
    const panel = document.getElementById('cb-panel');
    const fab   = document.getElementById('cb-fab');
    panel.classList.toggle('open', _open);
    if (_open) {
      document.getElementById('cb-fab').querySelector('.cb-notif')?.remove();
      document.getElementById('cb-input').focus();
    }
  }

  /* ── Messages ── */
  function showWelcome() {
    const { html, quickReplies } = renderResponse('welcome');
    appendBotMessage(html, quickReplies);
  }

  function sendMessage() {
    const input = document.getElementById('cb-input');
    const text  = input.value.trim();
    if (!text) return;
    appendUserMessage(text);
    input.value = '';
    clearQuick();

    setTimeout(() => {
      const intent = detectIntent(text);
      if (intent) {
        const { html, quickReplies } = renderResponse(intent);
        appendBotMessage(html, quickReplies);
      } else {
        // Chercher dans le contexte enrichi (mémoire admin + site)
        const hit = searchContext(text);
        if (hit) {
          const { html, quickReplies } = renderContextHit(hit, text);
          appendBotMessage(html, quickReplies);
        } else {
          const { html, quickReplies } = renderResponse('fallback');
          appendBotMessage(html, quickReplies);
        }
      }
    }, 400);
  }

  function appendUserMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'cb-msg cb-msg-user';
    msg.textContent = text;
    getMessages().appendChild(msg);
    scrollBottom();
  }

  function appendBotMessage(html, quickReplies) {
    /* Indicateur de frappe */
    const typing = document.createElement('div');
    typing.className = 'cb-msg cb-msg-bot cb-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    getMessages().appendChild(typing);
    scrollBottom();

    setTimeout(() => {
      typing.remove();
      const msg = document.createElement('div');
      msg.className = 'cb-msg cb-msg-bot';
      msg.innerHTML = html;
      getMessages().appendChild(msg);
      scrollBottom();
      renderQuick(quickReplies);
    }, 700);
  }

  function renderQuick(replies) {
    const qEl = document.getElementById('cb-quick');
    qEl.innerHTML = '';
    if (!replies || !replies.length) return;
    replies.forEach(r => {
      const btn = document.createElement('button');
      btn.className   = 'cb-qr-btn';
      btn.textContent = r.label;
      btn.addEventListener('click', () => {
        if (r.action) {
          window.location.href = r.action;
        } else if (r.intent) {
          clearQuick();
          appendUserMessage(r.label);
          setTimeout(() => {
            const { html, quickReplies } = renderResponse(r.intent);
            appendBotMessage(html, quickReplies);
          }, 400);
        }
      });
      qEl.appendChild(btn);
    });
  }

  function clearQuick() {
    document.getElementById('cb-quick').innerHTML = '';
  }

  function getMessages() { return document.getElementById('cb-messages'); }
  function scrollBottom() {
    const el = getMessages();
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }

  /* ── Utilitaires ── */
  function _esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Styles injectés ── */
  function injectStyles() {
    const css = `
/* ── Chatbot — widget flottant ── */
.cb-fab {
  position: fixed; bottom: 28px; right: 28px; z-index: 1100;
  width: 58px; height: 58px; border-radius: 50%;
  background: var(--orange, #ff6b00); color: #fff;
  border: none; cursor: pointer; box-shadow: 0 4px 18px rgba(255,107,0,.45);
  display: flex; align-items: center; justify-content: center;
  transition: transform .2s, box-shadow .2s;
}
.cb-fab:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(255,107,0,.55); }
.cb-fab svg { width: 26px; height: 26px; }
.cb-notif {
  position: absolute; top: -2px; right: -2px;
  background: #ef4444; color: #fff; border-radius: 99px;
  font-size: 11px; font-weight: 700; padding: 1px 6px; line-height: 1.5;
}

/* ── Panneau ── */
.cb-panel {
  position: fixed; bottom: 96px; right: 28px; z-index: 1099;
  width: 360px; max-width: calc(100vw - 32px);
  background: #fff; border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0,0,0,.18);
  display: flex; flex-direction: column;
  transform: translateY(20px) scale(.95); opacity: 0;
  pointer-events: none; transition: transform .25s, opacity .25s;
  max-height: 520px;
}
.cb-panel.open { transform: none; opacity: 1; pointer-events: auto; }

/* ── Header ── */
.cb-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; background: var(--orange, #ff6b00);
  border-radius: 16px 16px 0 0; color: #fff;
}
.cb-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,.25); font-weight: 700;
  font-size: 13px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.cb-header-info { flex: 1; line-height: 1.3; }
.cb-header-info strong { font-size: 14px; }
.cb-status { font-size: 11px; opacity: .85; }
.cb-close {
  background: none; border: none; color: #fff; font-size: 18px;
  cursor: pointer; padding: 2px 6px; border-radius: 6px; line-height: 1;
  transition: background .15s;
}
.cb-close:hover { background: rgba(255,255,255,.2); }

/* ── Messages ── */
.cb-messages {
  flex: 1; overflow-y: auto; padding: 14px 12px;
  display: flex; flex-direction: column; gap: 10px;
  scroll-behavior: smooth;
}
.cb-msg {
  max-width: 86%; padding: 10px 13px; border-radius: 12px;
  font-size: 13px; line-height: 1.55;
}
.cb-msg p { margin: 0 0 6px; }
.cb-msg p:last-child { margin-bottom: 0; }
.cb-msg ul, .cb-msg ol { margin: 6px 0 0 0; padding-left: 18px; }
.cb-msg li { margin-bottom: 4px; }
.cb-msg .cb-closing { font-style: italic; color: #666; font-size: 12px; margin-top: 8px; }
.cb-msg-bot {
  background: #f3f4f6; color: #1a1a1a; border-bottom-left-radius: 4px;
  align-self: flex-start;
}
.cb-msg-user {
  background: var(--orange, #ff6b00); color: #fff;
  border-bottom-right-radius: 4px; align-self: flex-end;
}

/* ── Typing indicator ── */
.cb-typing {
  display: flex; align-items: center; gap: 5px;
  padding: 12px 16px !important;
}
.cb-typing span {
  width: 7px; height: 7px; border-radius: 50%;
  background: #999; display: inline-block;
  animation: cb-bounce .9s infinite;
}
.cb-typing span:nth-child(2) { animation-delay: .15s; }
.cb-typing span:nth-child(3) { animation-delay: .3s; }
@keyframes cb-bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
}

/* ── Quick replies ── */
.cb-quick {
  padding: 0 12px 8px; display: flex; flex-wrap: wrap; gap: 6px;
}
.cb-qr-btn {
  background: #fff; border: 1.5px solid var(--orange, #ff6b00);
  color: var(--orange, #ff6b00); border-radius: 99px;
  padding: 5px 13px; font-size: 12px; cursor: pointer;
  transition: background .15s, color .15s; white-space: nowrap;
}
.cb-qr-btn:hover { background: var(--orange, #ff6b00); color: #fff; }

/* ── Input ── */
.cb-input-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-top: 1px solid #eee;
  border-radius: 0 0 16px 16px;
}
#cb-input {
  flex: 1; border: 1.5px solid #e5e7eb; border-radius: 99px;
  padding: 8px 14px; font-size: 13px; outline: none;
  transition: border-color .15s;
}
#cb-input:focus { border-color: var(--orange, #ff6b00); }
.cb-send-btn {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--orange, #ff6b00); border: none; cursor: pointer;
  color: #fff; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: background .15s;
}
.cb-send-btn:hover { background: #e55a00; }
.cb-send-btn svg { width: 16px; height: 16px; }

/* ── Mobile ── */
@media (max-width: 480px) {
  .cb-panel { bottom: 86px; right: 12px; left: 12px; width: auto; max-height: 75vh; }
  .cb-fab { bottom: 18px; right: 18px; }
}
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ── Init ── */
  function init() {
    injectStyles();
    buildWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
