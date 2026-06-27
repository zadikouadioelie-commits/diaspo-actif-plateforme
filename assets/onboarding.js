/* ====================================================
   Diaspo'Actif — Guide d'accueil interactif v1.0
   Auto-injecté depuis chatbot.js sur toutes les pages
   ==================================================== */
(function () {
  'use strict';

  /* ──────────────── CONFIG ──────────────── */
  const LS_STATUS  = r => `da_ob_status_${r}`;   // 'pending'|'done'|'skipped'|'deferred'
  const LS_STEP    = r => `da_ob_step_${r}`;
  const LS_DONE    = r => `da_ob_done_${r}`;      // JSON array of completed step IDs
  const VOICE_KEY  = 'da_ob_voice';               // 'on'|'off'
  const SPEED_KEY  = 'da_ob_speed';               // '0.8'|'1'|'1.2'|'1.5'

  let _tutorial  = null;   // { id, titre, compte_type, steps:[] }
  let _steps     = [];
  let _cur       = 0;
  let _role      = null;
  let _synth     = window.speechSynthesis || null;
  let _utt       = null;
  let _voiceOn   = localStorage.getItem(VOICE_KEY) !== 'off';
  let _speed     = parseFloat(localStorage.getItem(SPEED_KEY) || '1');
  let _actionWatcher = null;
  let _subtitleTimer = null;
  let _open      = false;

  /* ──────────────── HELPERS ──────────────── */
  function getRole() {
    /* Lire le rôle depuis la session (même logique que chatbot.js) */
    const meta = document.querySelector('meta[name="da-role"]');
    if (meta) return meta.getAttribute('content') || null;
    try {
      const jwt = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('auth='));
      if (!jwt) return null;
      const payload = JSON.parse(atob(jwt.split('=')[1].split('.')[1]));
      return payload.role || null;
    } catch (e) { return null; }
  }

  function el(tag, cls, html) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }

  function api(method, path, body) {
    return fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json()).catch(() => null);
  }

  /* ──────────────── TTS ──────────────── */
  function speak(text) {
    if (!_synth || !_voiceOn || !text) return;
    stopSpeech();
    _utt = new SpeechSynthesisUtterance(text);
    _utt.lang  = 'fr-FR';
    _utt.rate  = _speed;
    _utt.pitch = 1;
    /* Chercher une voix française */
    const voices = _synth.getVoices();
    const fr = voices.find(v => v.lang.startsWith('fr'));
    if (fr) _utt.voice = fr;
    _synth.speak(_utt);
    /* Sous-titres */
    showSubtitle(text);
  }

  function stopSpeech() {
    if (_synth) _synth.cancel();
    if (_utt) _utt = null;
    clearTimeout(_subtitleTimer);
    const sub = document.getElementById('ob-subtitle');
    if (sub) sub.style.opacity = '0';
  }

  function showSubtitle(text) {
    const sub = document.getElementById('ob-subtitle');
    if (!sub) return;
    sub.textContent = text;
    sub.style.opacity = '1';
    const ms = Math.max(3000, text.length * 60 / _speed);
    _subtitleTimer = setTimeout(() => { sub.style.opacity = '0'; }, ms);
  }

  /* ──────────────── STATISTIQUES ──────────────── */
  function logStat(action, data) {
    if (!_tutorial) return;
    api('POST', '/api/onboarding/stats', {
      tutorial_id: _tutorial.id,
      step_id: _steps[_cur]?.id || null,
      action,
      data,
    });
  }

  function saveProgress(statut) {
    if (!_tutorial) return;
    const done = JSON.parse(localStorage.getItem(LS_DONE(_role)) || '[]');
    api('POST', '/api/onboarding/progress', {
      tutorial_id: _tutorial.id,
      statut,
      etapes_completees: done,
    });
  }

  /* ──────────────── INITIALISATION ──────────────── */
  async function init() {
    /* 1. Rôle obligatoire */
    _role = getRole();
    if (!_role || _role === 'visiteur') return;

    /* 2. Vérifier localStorage d'abord (rapide) */
    const ls = localStorage.getItem(LS_STATUS(_role));
    if (ls === 'done' || ls === 'skipped') return;

    /* 3. Charger le tutoriel depuis l'API */
    _tutorial = await api('GET', `/api/onboarding/${_role}`);
    if (!_tutorial || !_tutorial.steps || _tutorial.steps.length === 0) return;

    _steps = _tutorial.steps;

    /* 4. Restaurer la progression */
    const savedStep = parseInt(localStorage.getItem(LS_STEP(_role)) || '0');
    _cur = Math.min(savedStep, _steps.length - 1);

    /* 5. Différé : ré-afficher après délai */
    if (ls === 'deferred') {
      const deferTs = parseInt(localStorage.getItem(`da_ob_defer_${_role}`) || '0');
      if (Date.now() - deferTs < 30 * 60 * 1000) return; /* < 30 min → on attend encore */
    }

    /* 6. Afficher la boîte de bienvenue après 1,5 s */
    injectStyles();
    setTimeout(showWelcomeDialog, 1500);
  }

  /* ──────────────── DIALOGUE D'ACCUEIL ──────────────── */
  function showWelcomeDialog() {
    if (_open) return;
    const bg = el('div', 'ob-welcome-bg');
    const box = el('div', 'ob-welcome-box');
    const isResume = _cur > 0;

    box.innerHTML = `
      <div class="ob-welcome-icon">${_steps[0]?.illustration || '🚀'}</div>
      <h2 class="ob-welcome-title">${isResume ? 'Reprenez votre visite guidée' : _tutorial.titre}</h2>
      <p class="ob-welcome-desc">${isResume
        ? `Vous étiez à l'étape <strong>${_cur + 1}/${_steps.length}</strong>. Continuer où vous en étiez ?`
        : (_tutorial.description || 'Découvrez les fonctionnalités en quelques minutes.')}</p>
      <div class="ob-welcome-meta">
        <span>⏱️ ~${_tutorial.duree_estimee || 3} minutes</span>
        <span>📋 ${_steps.length} étapes</span>
      </div>
      <div class="ob-welcome-btns">
        <button class="ob-btn-primary" id="ob-start">${isResume ? '▶ Reprendre' : '🚀 Commencer la visite'}</button>
        <button class="ob-btn-secondary" id="ob-defer">⏰ Plus tard</button>
        <button class="ob-btn-ghost" id="ob-skip">✕ Ignorer</button>
      </div>`;

    bg.appendChild(box);
    document.body.appendChild(bg);

    document.getElementById('ob-start').onclick  = () => { bg.remove(); openOverlay(); };
    document.getElementById('ob-defer').onclick  = () => {
      bg.remove();
      localStorage.setItem(LS_STATUS(_role), 'deferred');
      localStorage.setItem(`da_ob_defer_${_role}`, Date.now().toString());
      logStat('defer', { step: _cur });
    };
    document.getElementById('ob-skip').onclick   = () => {
      bg.remove();
      localStorage.setItem(LS_STATUS(_role), 'skipped');
      logStat('skip_welcome', {});
    };

    /* Fermer en cliquant hors de la boîte */
    bg.addEventListener('click', e => {
      if (e.target === bg) { bg.remove(); }
    });
  }

  /* ──────────────── OVERLAY PRINCIPAL ──────────────── */
  function openOverlay() {
    if (_open) return;
    _open = true;
    logStat('start', { from_step: _cur });

    const overlay = el('div', 'ob-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Guide d\'accueil interactif');
    overlay.id = 'ob-overlay';
    overlay.innerHTML = `
      <div class="ob-panel" id="ob-panel">
        <!-- Barre latérale -->
        <aside class="ob-sidebar" id="ob-sidebar" aria-label="Navigation des étapes">
          <div class="ob-sidebar-header">
            <span class="ob-logo-mini">DA</span>
            <span class="ob-sidebar-title">Guide d'accueil</span>
            <button class="ob-sidebar-toggle" id="ob-sidebar-toggle" aria-label="Masquer la barre">‹</button>
          </div>
          <ul class="ob-steps-nav" id="ob-steps-nav" role="list"></ul>
          <div class="ob-sidebar-footer">
            <button class="ob-btn-abandon" id="ob-abandon" title="Terminer et ne plus afficher">✕ Fermer</button>
          </div>
        </aside>

        <!-- Contenu principal -->
        <main class="ob-main" id="ob-main">
          <!-- Header -->
          <div class="ob-header">
            <div class="ob-progress-bar-wrap" role="progressbar" aria-valuemin="0" aria-valuemax="${_steps.length}" aria-valuenow="${_cur + 1}">
              <div class="ob-progress-bar" id="ob-progress-bar"></div>
            </div>
            <div class="ob-header-controls">
              <button class="ob-ctrl" id="ob-voice-btn" title="${_voiceOn ? 'Désactiver la narration' : 'Activer la narration'}" aria-pressed="${_voiceOn}">${_voiceOn ? '🔊' : '🔇'}</button>
              <select class="ob-ctrl-select" id="ob-speed-select" aria-label="Vitesse de narration">
                <option value="0.8" ${_speed===0.8?'selected':''}>0.8×</option>
                <option value="1"   ${_speed===1?'selected':''}>1×</option>
                <option value="1.2" ${_speed===1.2?'selected':''}>1.2×</option>
                <option value="1.5" ${_speed===1.5?'selected':''}>1.5×</option>
              </select>
              <button class="ob-ctrl" id="ob-close-btn" aria-label="Fermer le guide">✕</button>
            </div>
          </div>

          <!-- Zone de contenu -->
          <div class="ob-content" id="ob-content" aria-live="polite"></div>

          <!-- Sous-titres -->
          <div class="ob-subtitle-bar">
            <div class="ob-subtitle" id="ob-subtitle" aria-live="polite"></div>
          </div>

          <!-- Pied de page navigation -->
          <div class="ob-footer">
            <button class="ob-nav-btn" id="ob-prev" aria-label="Étape précédente">← Précédent</button>
            <span class="ob-step-counter" id="ob-step-counter" aria-live="polite"></span>
            <button class="ob-nav-btn ob-nav-primary" id="ob-next" aria-label="Étape suivante">Suivant →</button>
          </div>
        </main>
      </div>`;

    document.body.appendChild(overlay);

    /* Rendre les étapes dans la sidebar */
    buildSidebarNav();
    renderStep(_cur);

    /* Événements globaux */
    document.getElementById('ob-prev').onclick    = () => goStep(_cur - 1);
    document.getElementById('ob-next').onclick    = () => nextStep();
    document.getElementById('ob-close-btn').onclick = closeOverlay;
    document.getElementById('ob-abandon').onclick   = () => {
      if (confirm('Fermer le guide ? Il ne sera plus affiché automatiquement.')) {
        finishTutorial('ignore');
      }
    };

    document.getElementById('ob-voice-btn').onclick = () => {
      _voiceOn = !_voiceOn;
      localStorage.setItem(VOICE_KEY, _voiceOn ? 'on' : 'off');
      document.getElementById('ob-voice-btn').textContent = _voiceOn ? '🔊' : '🔇';
      document.getElementById('ob-voice-btn').setAttribute('aria-pressed', _voiceOn);
      if (!_voiceOn) stopSpeech();
    };

    document.getElementById('ob-speed-select').onchange = function () {
      _speed = parseFloat(this.value);
      localStorage.setItem(SPEED_KEY, _speed.toString());
    };

    document.getElementById('ob-sidebar-toggle').onclick = () => {
      const sb = document.getElementById('ob-sidebar');
      sb.classList.toggle('ob-sidebar-collapsed');
      document.getElementById('ob-sidebar-toggle').textContent = sb.classList.contains('ob-sidebar-collapsed') ? '›' : '‹';
    };

    /* Clavier */
    overlay.addEventListener('keydown', onKey);
    overlay.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') { closeOverlay(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nextStep(); }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); goStep(_cur - 1); }
  }

  function closeOverlay() {
    stopSpeech();
    clearActionWatcher();
    const ov = document.getElementById('ob-overlay');
    if (ov) { ov.classList.add('ob-fade-out'); setTimeout(() => ov.remove(), 300); }
    _open = false;
    logStat('close', { step: _cur });
  }

  /* ──────────────── SIDEBAR NAV ──────────────── */
  function buildSidebarNav() {
    const nav  = document.getElementById('ob-steps-nav');
    if (!nav) return;
    const done = JSON.parse(localStorage.getItem(LS_DONE(_role)) || '[]');
    nav.innerHTML = '';
    _steps.forEach((s, i) => {
      const li   = el('li', `ob-nav-item ${done.includes(s.id) ? 'ob-nav-done' : ''} ${i === _cur ? 'ob-nav-active' : ''}`);
      li.setAttribute('role', 'listitem');
      li.innerHTML = `<button class="ob-nav-step-btn" data-i="${i}" aria-current="${i===_cur?'step':'false'}">
        <span class="ob-nav-num">${done.includes(s.id) ? '✓' : i + 1}</span>
        <span class="ob-nav-lbl">${s.titre}</span>
      </button>`;
      li.querySelector('button').onclick = () => goStep(i);
      nav.appendChild(li);
    });
  }

  /* ──────────────── RENDU D'UNE ÉTAPE ──────────────── */
  function renderStep(i) {
    if (i < 0 || i >= _steps.length) return;
    _cur = i;
    clearActionWatcher();
    stopSpeech();

    const step = _steps[i];
    const done = JSON.parse(localStorage.getItem(LS_DONE(_role)) || '[]');
    const isLast = i === _steps.length - 1;

    /* Barre de progression */
    const pct = ((i) / (_steps.length - 1)) * 100;
    const bar = document.getElementById('ob-progress-bar');
    if (bar) bar.style.width = pct + '%';

    /* Compteur */
    const ctr = document.getElementById('ob-step-counter');
    if (ctr) ctr.textContent = `${i + 1} / ${_steps.length}`;

    /* Bouton suivant */
    const btnNext = document.getElementById('ob-next');
    if (btnNext) {
      btnNext.textContent = isLast ? '🏁 Terminer !' : 'Suivant →';
      btnNext.className   = 'ob-nav-btn ob-nav-primary' + (isLast ? ' ob-nav-finish' : '');
    }

    const btnPrev = document.getElementById('ob-prev');
    if (btnPrev) btnPrev.disabled = i === 0;

    /* Accessibilité : mettre à jour aria-valuenow */
    const pbar = document.querySelector('.ob-progress-bar-wrap');
    if (pbar) pbar.setAttribute('aria-valuenow', i + 1);

    /* Contenu */
    const content = document.getElementById('ob-content');
    if (!content) return;

    content.classList.add('ob-content-out');
    setTimeout(() => {
      content.innerHTML = buildStepHTML(step, done.includes(step.id));
      content.classList.remove('ob-content-out');
      content.classList.add('ob-content-in');
      setTimeout(() => content.classList.remove('ob-content-in'), 400);

      /* Bouton d'action interactif */
      if (step.type === 'action' && step.action_selector) {
        const btn = document.getElementById('ob-action-verify');
        if (btn) btn.onclick = () => startActionVerification(step);
      }
      if (step.module_lien) {
        const ln = document.getElementById('ob-module-link');
        if (ln) ln.onclick = () => { window.location.href = step.module_lien; };
      }
      if (step.module_lien) {
        const ln2 = document.getElementById('ob-action-go');
        if (ln2) ln2.onclick = () => { window.open(step.module_lien, '_blank'); };
      }

      /* Mise à jour sidebar */
      buildSidebarNav();

      /* Sauvegarde locale de l'étape en cours */
      localStorage.setItem(LS_STEP(_role), i.toString());
    }, 180);

    /* Narration après un court délai */
    setTimeout(() => speak(step.narration || step.titre), 600);

    logStat('step_view', { step_id: step.id, titre: step.titre });
  }

  function buildStepHTML(step, alreadyDone) {
    const typeLabel = { info: '📋 Information', action: '🎯 Action', demo: '👁️ Démonstration', video: '🎬 Vidéo' };
    return `
      <div class="ob-step-type-badge">${typeLabel[step.type] || '📋 Information'}</div>
      <div class="ob-illus-wrap">
        <div class="ob-illus">${step.illustration || '📋'}</div>
      </div>
      <h2 class="ob-step-title">${step.titre}</h2>
      <div class="ob-step-body">${step.contenu}</div>
      ${step.type === 'action' && step.action_selector ? `
        <div class="ob-action-zone">
          <div class="ob-action-hint">
            <strong>🎯 Action requise :</strong> ${step.action_label || 'Effectuez l\'action ci-dessous pour continuer'}
          </div>
          <button class="ob-btn-action" id="ob-action-verify">
            ${alreadyDone ? '✅ Déjà fait !' : '👆 Marquer comme fait'}
          </button>
        </div>` : ''}
      ${step.module_lien ? `
        <div class="ob-step-cta">
          <button class="ob-btn-module" id="ob-action-go">
            🔗 ${step.module_label || 'Accéder au module'}
          </button>
        </div>` : ''}
      ${alreadyDone ? '<div class="ob-step-done-banner">✅ Cette étape est complétée</div>' : ''}`;
  }

  /* ──────────────── NAVIGATION ──────────────── */
  function goStep(i) {
    if (i < 0 || i >= _steps.length) return;
    renderStep(i);
  }

  function nextStep() {
    /* Marquer l'étape courante comme complétée */
    markCurrentDone();

    if (_cur < _steps.length - 1) {
      renderStep(_cur + 1);
    } else {
      finishTutorial('termine');
    }
  }

  function markCurrentDone() {
    const step = _steps[_cur];
    if (!step) return;
    const done = JSON.parse(localStorage.getItem(LS_DONE(_role)) || '[]');
    if (!done.includes(step.id)) {
      done.push(step.id);
      localStorage.setItem(LS_DONE(_role), JSON.stringify(done));
    }
    logStat('step_complete', { step_id: step.id });
  }

  /* ──────────────── VÉRIFICATION D'ACTION ──────────────── */
  function startActionVerification(step) {
    if (!step.action_selector) { markCurrentDone(); buildSidebarNav(); return; }

    /* Fermer le guide temporairement pour laisser l'utilisateur agir */
    const overlay = document.getElementById('ob-overlay');
    if (overlay) overlay.classList.add('ob-overlay-minimized');

    const tip = el('div', 'ob-floating-tip');
    tip.innerHTML = `
      <div class="ob-tip-text">👆 ${step.action_label || 'Effectuez l\'action sur la page'}</div>
      <button class="ob-tip-cancel">Annuler</button>`;
    document.body.appendChild(tip);

    tip.querySelector('.ob-tip-cancel').onclick = () => {
      tip.remove();
      if (overlay) overlay.classList.remove('ob-overlay-minimized');
      clearActionWatcher();
    };

    /* Surveiller le clic sur le sélecteur */
    clearActionWatcher();
    const target = document.querySelector(step.action_selector);
    if (target) {
      _actionWatcher = () => {
        tip.remove();
        if (overlay) overlay.classList.remove('ob-overlay-minimized');
        markCurrentDone();
        buildSidebarNav();
        /* Feedback visuel */
        const content = document.getElementById('ob-content');
        if (content) {
          const banner = el('div', 'ob-step-done-banner', '✅ Action effectuée !');
          content.prepend(banner);
          speak('Parfait ! Étape validée.');
        }
        clearActionWatcher();
      };
      target.addEventListener('click', _actionWatcher, { once: true });
    } else {
      /* Sélecteur introuvable → accepter sans vérification */
      tip.remove();
      if (overlay) overlay.classList.remove('ob-overlay-minimized');
      markCurrentDone();
      buildSidebarNav();
    }
  }

  function clearActionWatcher() {
    if (_actionWatcher) {
      _steps.forEach(s => {
        if (s.action_selector) {
          const t = document.querySelector(s.action_selector);
          if (t) t.removeEventListener('click', _actionWatcher);
        }
      });
      _actionWatcher = null;
    }
  }

  /* ──────────────── FIN DU TUTORIEL ──────────────── */
  function finishTutorial(statut) {
    stopSpeech();
    clearActionWatcher();
    _open = false;

    localStorage.setItem(LS_STATUS(_role), statut === 'termine' ? 'done' : 'skipped');
    saveProgress(statut);
    logStat(statut === 'termine' ? 'finish' : 'abandon', { step: _cur });

    /* Notifier le chatbot */
    window._daObDone = true;
    window.dispatchEvent(new CustomEvent('da:onboarding:done', { detail: { role: _role, statut } }));

    if (statut === 'termine') {
      showCompletionScreen();
    } else {
      const ov = document.getElementById('ob-overlay');
      if (ov) { ov.classList.add('ob-fade-out'); setTimeout(() => ov.remove(), 300); }
    }
  }

  function showCompletionScreen() {
    const ov = document.getElementById('ob-overlay');
    if (!ov) return;

    const content = ov.querySelector('.ob-panel');
    if (!content) return;

    content.innerHTML = `
      <div class="ob-completion">
        <div class="ob-completion-icon">🎉</div>
        <h2>Félicitations !</h2>
        <p>Vous avez terminé votre guide d'accueil Diaspo'Actif.</p>
        <p>Vous êtes prêt·e à utiliser toutes les fonctionnalités de la plateforme.</p>
        <div class="ob-rating-zone">
          <p>Comment évaluez-vous ce guide ?</p>
          <div class="ob-stars" id="ob-stars">
            ${[1,2,3,4,5].map(n => `<button class="ob-star" data-n="${n}" aria-label="${n} étoile${n>1?'s':''}">⭐</button>`).join('')}
          </div>
          <textarea class="ob-comment" id="ob-comment" placeholder="Un commentaire ? (optionnel)" rows="3"></textarea>
        </div>
        <div class="ob-completion-btns">
          <button class="ob-btn-primary" id="ob-rate-submit">Envoyer mon avis</button>
          <button class="ob-btn-ghost"   id="ob-rate-skip">Passer</button>
        </div>
        <div class="ob-completion-links">
          <a href="faq.html">💡 Consulter la FAQ</a> ·
          <a href="annuaire.html">🔍 Explorer l'annuaire</a>
        </div>
      </div>`;

    let _rating = 0;
    const stars = ov.querySelectorAll('.ob-star');
    stars.forEach(btn => {
      btn.onclick = () => {
        _rating = parseInt(btn.getAttribute('data-n'));
        stars.forEach((b, i) => b.classList.toggle('ob-star-active', i < _rating));
      };
    });

    const submitRating = () => {
      if (_rating > 0) {
        api('POST', '/api/onboarding/progress', {
          tutorial_id: _tutorial.id,
          statut: 'termine',
          note: _rating,
          commentaire: document.getElementById('ob-comment')?.value || '',
        });
      }
      ov.classList.add('ob-fade-out');
      setTimeout(() => ov.remove(), 300);
    };

    document.getElementById('ob-rate-submit').onclick = submitRating;
    document.getElementById('ob-rate-skip').onclick   = () => {
      ov.classList.add('ob-fade-out');
      setTimeout(() => ov.remove(), 300);
    };

    speak('Félicitations ! Vous avez terminé le guide d\'accueil. Vous pouvez maintenant explorer toutes les fonctionnalités de Diaspo\'Actif.');
  }

  /* ──────────────── REPLAY depuis un bouton externe ──────────────── */
  function replayGuide() {
    if (!_tutorial) return;
    localStorage.removeItem(LS_STATUS(_role));
    localStorage.removeItem(LS_STEP(_role));
    localStorage.removeItem(LS_DONE(_role));
    _cur = 0;
    _open = false;
    const old = document.getElementById('ob-overlay');
    if (old) old.remove();
    showWelcomeDialog();
  }

  /* Exposer pour boutons "Revoir le guide" dans les dashboards */
  window.daReplayOnboarding = replayGuide;

  /* ──────────────── STYLES INJECTÉS ──────────────── */
  function injectStyles() {
    if (document.getElementById('ob-styles')) return;
    const s = document.createElement('style');
    s.id = 'ob-styles';
    s.textContent = `
/* ── Onboarding Welcome ── */
.ob-welcome-bg {
  position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:99990;
  display:flex; align-items:center; justify-content:center;
  animation:ob-fade-in .25s ease;
}
.ob-welcome-box {
  background:#fff; border-radius:20px; padding:36px 32px; max-width:440px; width:90%;
  text-align:center; box-shadow:0 24px 80px rgba(0,0,0,.18); position:relative;
}
.ob-welcome-icon { font-size:52px; margin-bottom:8px; }
.ob-welcome-title { font-size:1.5rem; font-weight:700; color:#1a1a2e; margin:0 0 10px; }
.ob-welcome-desc  { color:#555; font-size:.95rem; margin:0 0 14px; line-height:1.5; }
.ob-welcome-meta  { display:flex; justify-content:center; gap:20px; color:#888; font-size:.85rem; margin-bottom:24px; }
.ob-welcome-btns  { display:flex; flex-direction:column; gap:10px; }
.ob-btn-primary   { background:var(--primary,#2563eb); color:#fff; border:none; border-radius:10px;
  padding:12px 24px; font-size:1rem; font-weight:600; cursor:pointer; transition:background .2s; }
.ob-btn-primary:hover { background:var(--primary-dark,#1d4ed8); }
.ob-btn-secondary { background:#f0f4ff; color:var(--primary,#2563eb); border:2px solid var(--primary,#2563eb);
  border-radius:10px; padding:10px; font-size:.95rem; cursor:pointer; }
.ob-btn-ghost     { background:none; border:none; color:#999; font-size:.85rem; cursor:pointer; }

/* ── Overlay principal ── */
.ob-overlay {
  position:fixed; inset:0; background:rgba(0,0,0,.65); z-index:99991;
  display:flex; align-items:center; justify-content:center;
  animation:ob-fade-in .3s ease;
}
.ob-overlay.ob-fade-out { animation:ob-fade-out .3s ease forwards; }
.ob-overlay.ob-overlay-minimized { transform:translateY(90vh); transition:transform .4s; }

.ob-panel {
  display:flex; background:#fff; border-radius:20px; overflow:hidden;
  width:min(900px,96vw); height:min(640px,92vh);
  box-shadow:0 32px 100px rgba(0,0,0,.25);
}

/* ── Sidebar ── */
.ob-sidebar {
  width:220px; flex-shrink:0; background:#f8faff; border-right:1px solid #e5e7eb;
  display:flex; flex-direction:column; transition:width .3s;
}
.ob-sidebar.ob-sidebar-collapsed { width:48px; }
.ob-sidebar-header {
  display:flex; align-items:center; gap:8px; padding:16px 12px;
  border-bottom:1px solid #e5e7eb;
}
.ob-logo-mini {
  width:28px; height:28px; background:var(--primary,#2563eb); color:#fff;
  border-radius:6px; display:flex; align-items:center; justify-content:center;
  font-weight:800; font-size:.75rem; flex-shrink:0;
}
.ob-sidebar-title { font-size:.8rem; font-weight:600; color:#374151; white-space:nowrap; overflow:hidden; }
.ob-sidebar.ob-sidebar-collapsed .ob-sidebar-title { display:none; }
.ob-sidebar-toggle {
  margin-left:auto; background:none; border:none; cursor:pointer; color:#6b7280; font-size:1rem; padding:2px;
}
.ob-steps-nav { list-style:none; margin:0; padding:8px 0; overflow-y:auto; flex:1; }
.ob-nav-item { margin:2px 8px; border-radius:8px; }
.ob-nav-item.ob-nav-active { background:#e8f0fe; }
.ob-nav-item.ob-nav-done .ob-nav-num { background:#16a34a; color:#fff; }
.ob-nav-step-btn {
  width:100%; background:none; border:none; display:flex; align-items:center;
  gap:8px; padding:8px 10px; cursor:pointer; text-align:left; border-radius:8px;
}
.ob-nav-step-btn:hover { background:#f0f4ff; }
.ob-nav-num {
  width:22px; height:22px; border-radius:50%; background:#e5e7eb; color:#374151;
  font-size:.72rem; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.ob-nav-lbl { font-size:.78rem; color:#374151; line-height:1.3; }
.ob-sidebar.ob-sidebar-collapsed .ob-nav-lbl { display:none; }
.ob-sidebar.ob-sidebar-collapsed .ob-nav-item { margin:2px 4px; }
.ob-sidebar-footer { padding:12px; border-top:1px solid #e5e7eb; }
.ob-btn-abandon {
  background:none; border:none; color:#9ca3af; font-size:.78rem; cursor:pointer; width:100%; text-align:center;
}
.ob-btn-abandon:hover { color:#ef4444; }
.ob-sidebar.ob-sidebar-collapsed .ob-btn-abandon { font-size:.65rem; }

/* ── Main ── */
.ob-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
.ob-header { padding:12px 20px; border-bottom:1px solid #f0f0f0; display:flex; align-items:center; gap:12px; }
.ob-progress-bar-wrap { flex:1; height:6px; background:#e5e7eb; border-radius:3px; overflow:hidden; }
.ob-progress-bar { height:100%; background:var(--primary,#2563eb); border-radius:3px; transition:width .5s ease; }
.ob-header-controls { display:flex; align-items:center; gap:8px; }
.ob-ctrl {
  background:none; border:1px solid #e5e7eb; border-radius:8px; padding:4px 8px;
  cursor:pointer; font-size:1rem; color:#374151;
}
.ob-ctrl:hover { background:#f0f4ff; }
.ob-ctrl-select { border:1px solid #e5e7eb; border-radius:8px; padding:4px 6px; font-size:.8rem; cursor:pointer; }

/* ── Content ── */
.ob-content {
  flex:1; overflow-y:auto; padding:28px 36px;
  transition:opacity .18s, transform .18s;
}
.ob-content-out { opacity:0; transform:translateX(20px); }
.ob-content-in  { animation:ob-slide-in .3s ease; }
@keyframes ob-slide-in { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:none; } }

.ob-step-type-badge {
  display:inline-block; background:#f0f4ff; color:var(--primary,#2563eb);
  border-radius:20px; padding:3px 12px; font-size:.75rem; font-weight:600; margin-bottom:14px;
}
.ob-illus-wrap { text-align:center; margin-bottom:16px; }
.ob-illus {
  font-size:64px; display:inline-block;
  animation:ob-bounce .6s ease;
}
@keyframes ob-bounce { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
.ob-step-title { font-size:1.35rem; font-weight:700; color:#1a1a2e; margin:0 0 14px; }
.ob-step-body  { font-size:.95rem; color:#374151; line-height:1.7; }
.ob-step-body ul { padding-left:18px; }
.ob-step-body li { margin-bottom:6px; }
.ob-step-body strong { color:#1a1a2e; }

.ob-action-zone {
  margin-top:20px; background:#fffbeb; border:2px dashed #fbbf24; border-radius:12px; padding:16px;
}
.ob-action-hint { font-size:.9rem; color:#92400e; margin-bottom:12px; }
.ob-btn-action {
  background:var(--primary,#2563eb); color:#fff; border:none; border-radius:10px;
  padding:10px 22px; font-size:.95rem; cursor:pointer;
}
.ob-step-cta { margin-top:20px; }
.ob-btn-module {
  background:#f0fdf4; color:#15803d; border:2px solid #86efac; border-radius:10px;
  padding:10px 20px; font-size:.9rem; cursor:pointer;
}
.ob-btn-module:hover { background:#dcfce7; }
.ob-step-done-banner {
  margin-top:14px; background:#f0fdf4; color:#15803d; border-radius:8px;
  padding:10px 16px; font-size:.9rem; font-weight:600;
}

/* ── Sous-titres ── */
.ob-subtitle-bar { padding:0 20px 6px; min-height:36px; }
.ob-subtitle {
  font-size:.82rem; color:#6b7280; font-style:italic; text-align:center;
  transition:opacity .4s; opacity:0;
}

/* ── Footer navigation ── */
.ob-footer {
  padding:14px 20px; border-top:1px solid #f0f0f0;
  display:flex; align-items:center; gap:12px;
}
.ob-nav-btn {
  background:#f3f4f6; border:none; border-radius:10px; padding:10px 20px;
  font-size:.9rem; cursor:pointer; color:#374151;
}
.ob-nav-btn:hover:not(:disabled) { background:#e5e7eb; }
.ob-nav-btn:disabled { opacity:.35; cursor:not-allowed; }
.ob-nav-primary { background:var(--primary,#2563eb); color:#fff; }
.ob-nav-primary:hover:not(:disabled) { background:var(--primary-dark,#1d4ed8); }
.ob-nav-finish  { background:#16a34a; }
.ob-nav-finish:hover { background:#15803d; }
.ob-step-counter { flex:1; text-align:center; font-size:.85rem; color:#9ca3af; }

/* ── Floating tip ── */
.ob-floating-tip {
  position:fixed; bottom:90px; right:24px; z-index:99995;
  background:#1a1a2e; color:#fff; border-radius:14px; padding:14px 18px;
  box-shadow:0 8px 30px rgba(0,0,0,.3); max-width:280px;
  animation:ob-fade-in .25s ease;
}
.ob-tip-text { font-size:.9rem; margin-bottom:10px; }
.ob-tip-cancel {
  background:rgba(255,255,255,.15); border:none; color:#fff; border-radius:8px;
  padding:6px 14px; font-size:.82rem; cursor:pointer; width:100%;
}

/* ── Écran de fin ── */
.ob-completion {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  height:100%; padding:32px; text-align:center; gap:12px;
}
.ob-completion-icon { font-size:64px; animation:ob-bounce .8s ease; }
.ob-completion h2   { font-size:1.6rem; font-weight:700; color:#1a1a2e; margin:0; }
.ob-completion p    { color:#555; font-size:.95rem; margin:0; }
.ob-rating-zone     { width:100%; max-width:360px; }
.ob-stars           { display:flex; justify-content:center; gap:8px; margin:10px 0; }
.ob-star            { background:none; border:none; font-size:1.8rem; cursor:pointer; opacity:.4; transition:opacity .15s; }
.ob-star-active, .ob-star:hover { opacity:1; }
.ob-comment         { width:100%; border:1px solid #e5e7eb; border-radius:10px; padding:10px; font-size:.9rem; resize:none; }
.ob-completion-btns { display:flex; gap:12px; margin-top:4px; }
.ob-completion-links { font-size:.85rem; color:#6b7280; }
.ob-completion-links a { color:var(--primary,#2563eb); text-decoration:none; }

/* ── Animations globales ── */
@keyframes ob-fade-in  { from { opacity:0; transform:scale(.97); } to { opacity:1; transform:scale(1); } }
@keyframes ob-fade-out { from { opacity:1; } to { opacity:0; transform:scale(.97); } }

/* ── Responsive ── */
@media(max-width:640px) {
  .ob-panel  { flex-direction:column; border-radius:16px 16px 0 0; height:95vh; }
  .ob-sidebar { width:100%; height:auto; border-right:none; border-bottom:1px solid #e5e7eb; }
  .ob-steps-nav { display:flex; flex-direction:row; overflow-x:auto; padding:4px 8px; }
  .ob-nav-item { margin:0 2px; }
  .ob-nav-lbl { display:none; }
  .ob-sidebar-title, .ob-sidebar-toggle, .ob-sidebar-footer { display:none; }
  .ob-content { padding:16px 20px; }
}`;
    document.head.appendChild(s);
  }

  /* ──────────────── DÉMARRAGE ──────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    /* Délai pour laisser la page et le chatbot s'initialiser */
    setTimeout(init, 300);
  }

})();
