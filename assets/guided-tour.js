/* ============================================================
   Diaspo'Actif — Moteur de tutoriels interactifs (Guided Tour)
   ============================================================
   Vanilla JS, aucune dependance. Concu pour etre reutilise sur
   n'importe quelle page de la plateforme : chaque tutoriel est
   une simple liste d'etapes enregistree via GuidedTour.define().

   Schema d'une etape :
   {
     id: "u-nom",                  // identifiant unique dans le tutoriel
     target: "#u-nom",             // selecteur CSS de l'element cible (ou null => bulle centree)
     title: "...",                 // titre de la bulle
     description: "..." | "<p>..</p><ul>..</ul>",  // HTML de confiance (defini par nous, jamais par l'utilisateur)
     placement: "top"|"bottom"|"left"|"right"|"center"|"auto",
     action: "click"|"input"|"change"|"check"|"continue"|"wait-visible",
     minLength: 1,                 // pour action:"input", longueur minimale avant de considerer le champ rempli
     matchField: "#u-pwd",         // pour action:"input", exige que la valeur soit egale a celle d'un autre champ (confirmation mdp)
     required: true,               // false => l'etape peut etre passee sans avoir rempli le champ
     animation: "halo"|"pulse"|"zoom"|"shake"|null,
     arrow: "top"|"bottom"|"left"|"right"|null,
     dynamicMessage: (el)=>({title, description})|null,  // recalcule le texte juste avant l'auto-avance (ex: choix conditionnel)
     skipIf: ()=>boolean,          // evalue au moment d'entrer sur l'etape ; true => on saute directement a la suivante
   }

   Persistance : localStorage["da_guided_tour"] = {tourId, stepId, ts}
   Cle separee "da_guided_tour_dismissed_<tourId>" pour ne plus proposer
   de reprise apres un "Ignorer le tutoriel" explicite.
   ============================================================ */
(function (global) {
  "use strict";

  var STORAGE_KEY = "da_guided_tour";
  var DISMISS_PREFIX = "da_guided_tour_dismissed_";
  var REGISTRY = {};

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    var cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    return true;
  }
  function isMobile() { return window.innerWidth < 640; }

  /* Attend qu'un element existe ET soit visible — reutilise pour :
     - passer d'un pane a l'autre au sein d'une meme page (SPA)
     - reprendre apres un vrai rechargement de page (le DOM se reconstruit)
     setTimeout plutot que requestAnimationFrame : un onglet en arriere-plan
     (ou un contexte de previsualisation non compose) peut suspendre rAF
     indefiniment, mais les timers continuent de s'executer. */
  function waitForVisible(selector, timeoutMs, cb) {
    var start = Date.now();
    var timeout = timeoutMs || 8000;
    (function poll() {
      var el = qs(selector);
      if (el && isVisible(el)) return cb(el);
      if (Date.now() - start > timeout) return cb(null);
      setTimeout(poll, 60);
    })();
  }

  /* Force un reflow puis applique la classe : garantit le declenchement de la
     transition CSS meme quand requestAnimationFrame est suspendu (onglet en
     arriere-plan, previsualisation non compose…). */
  function revealNow(el, cls) {
    if (!el) return;
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function svgArrow() {
    return '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v15" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6 13l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function svgCheck() {
    return '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#16A34A"/><path d="M7 12.5l3 3 7-7" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /* ---------------------------------------------------------
     Confettis : petit systeme canvas maison, leger et discret
     --------------------------------------------------------- */
  function burstConfetti() {
    var canvas = document.createElement("canvas");
    canvas.className = "gt-confetti-canvas";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var colors = ["#2563EB", "#F2662B", "#16A34A", "#F2B705", "#8B5CF6"];
    var pieces = [];
    var count = isMobile() ? 60 : 110;
    for (var i = 0; i < count; i++) {
      pieces.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 120,
        y: canvas.height * 0.32 + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 7,
        vy: -Math.random() * 7 - 3,
        size: 5 + Math.random() * 5,
        color: colors[i % colors.length],
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.3,
        life: 0,
      });
    }
    var gravity = 0.18;
    var frame = 0;
    var maxFrames = 130;
    function tick() {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(function (p) {
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - frame / maxFrames);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (frame < maxFrames) requestAnimationFrame(tick);
      else canvas.remove();
    }
    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------
     Classe principale
     --------------------------------------------------------- */
  function GuidedTour() {
    this.active = false;
    this.tourId = null;
    this.steps = [];
    this.stepIndex = 0;
    this.meta = {};
    this._cleanup = [];
    this._satisfied = false;
    this._advanceTimer = null;
    this._buildDom();
    this._bindGlobalKeys();
    window.addEventListener("resize", this._onResize.bind(this));
    window.addEventListener("scroll", this._onResize.bind(this), true);
  }

  GuidedTour.prototype._buildDom = function () {
    this.overlay = document.createElement("div");
    this.overlay.className = "gt-overlay";
    this.overlay.setAttribute("aria-hidden", "true");

    this.spotlight = document.createElement("div");
    this.spotlight.className = "gt-spotlight";

    this.arrow = document.createElement("div");
    this.arrow.className = "gt-arrow";
    this.arrow.innerHTML = svgArrow();

    this.tooltip = document.createElement("div");
    this.tooltip.className = "gt-tooltip";
    this.tooltip.setAttribute("role", "dialog");
    this.tooltip.setAttribute("aria-live", "polite");
    this.tooltip.tabIndex = -1;

    this.progressbar = document.createElement("div");
    this.progressbar.className = "gt-progressbar";
    this.progressbar.innerHTML =
      '<div class="gt-pb-label"><strong class="gt-pb-title"></strong><br><span class="gt-pb-step"></span></div>' +
      '<div class="gt-pb-dots"></div>' +
      '<button type="button" class="gt-btn gt-btn-ghost gt-pb-quit">Quitter</button>';

    this.resumeBanner = document.createElement("div");
    this.resumeBanner.className = "gt-resume-banner";
  };

  GuidedTour.prototype._bindGlobalKeys = function () {
    var self = this;
    document.addEventListener("keydown", function (e) {
      if (!self.active) return;
      if (e.key === "Escape") { self.pause(); }
    });
  };

  GuidedTour.prototype._onResize = function () {
    if (this.active) this._positionAll();
  };

  /* ---------------------------------------------------------
     Cycle de vie
     --------------------------------------------------------- */
  GuidedTour.prototype.start = function (tourId, opts) {
    opts = opts || {};
    var def = REGISTRY[tourId];
    if (!def) { console.warn("[GuidedTour] tutoriel inconnu :", tourId); return; }
    this.active = true;
    this.tourId = tourId;
    this.steps = def.steps;
    this.meta = def.meta || {};
    localStorage.removeItem(DISMISS_PREFIX + tourId);

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.spotlight);
    document.body.appendChild(this.arrow);
    document.body.appendChild(this.tooltip);
    document.body.appendChild(this.progressbar);
    this._hideResumeBanner();

    var qOn = this.progressbar.querySelector(".gt-pb-quit");
    var self = this;
    qOn.onclick = function () { self.pause(); };
    revealNow(this.progressbar, "gt-shown");

    /* On reprend TOUJOURS depuis la premiere etape, jamais en sautant directement a l'etape
       sauvegardee : apres un rechargement de page, l'etat reel du DOM (pane active, section
       affichee…) peut avoir ete reinitialise, et sauter droit sur un champ invisible laisserait
       le moteur attendre en silence, sans aucune bulle a l'ecran, pendant plusieurs secondes.
       Les skipIf de chaque etape se chargent de faire avancer automatiquement jusqu'au point
       reellement atteignable dans l'etat courant de la page — c'est le mecanisme prevu pour ca,
       aussi bien pour une reprise apres simple fermeture (meme page) qu'apres un vrai rechargement. */
    this._goToStep(0);
  };

  GuidedTour.prototype.pause = function () {
    if (!this.active) return;
    this._saveProgress();
    this._teardownStepListeners();
    this.active = false;
    this._removeDom();
  };

  GuidedTour.prototype.skip = function () {
    if (!this.active) return;
    localStorage.setItem(DISMISS_PREFIX + this.tourId, "1");
    localStorage.removeItem(STORAGE_KEY);
    this._teardownStepListeners();
    this.active = false;
    this._removeDom();
  };

  GuidedTour.prototype._removeDom = function () {
    [this.overlay, this.spotlight, this.arrow, this.tooltip, this.progressbar].forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    this.progressbar.classList.remove("gt-shown");
    if (this._advanceTimer) { clearTimeout(this._advanceTimer); this._advanceTimer = null; }
  };

  GuidedTour.prototype._saveProgress = function () {
    var step = this.steps[this.stepIndex];
    if (!step) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tourId: this.tourId, stepId: step.id, ts: Date.now() }));
    } catch (e) { /* stockage indisponible : le tutoriel reste utilisable, juste sans reprise */ }
  };

  GuidedTour.prototype.next = function () {
    if (this.stepIndex < this.steps.length - 1) this._goToStep(this.stepIndex + 1);
    else this._finish();
  };
  GuidedTour.prototype.prev = function () {
    if (this.stepIndex > 0) this._goToStep(this.stepIndex - 1);
  };

  /* ---------------------------------------------------------
     Rendu d'une etape
     --------------------------------------------------------- */
  GuidedTour.prototype._goToStep = function (index) {
    this._teardownStepListeners();
    this.stepIndex = index;
    var step = this.steps[index];
    if (!step) return this._finish();

    if (typeof step.skipIf === "function") {
      var shouldSkip = false;
      try { shouldSkip = !!step.skipIf(); } catch (e) {}
      if (shouldSkip) {
        if (index < this.steps.length - 1) return this._goToStep(index + 1);
        return this._finish();
      }
    }

    this._saveProgress();
    this._satisfied = (step.action === "continue");

    var self = this;
    var selector = step.target;
    if (!selector) { this._renderStep(step, null); return; }

    waitForVisible(selector, 9000, function (el) {
      if (!self.active) return;
      if (!el) { self._renderStep(step, null); return; }
      if (isMobile()) {
        // Laisse le temps au scroll fluide d'amener le champ a l'ecran avant de poser la bulle dessus.
        try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
        setTimeout(function () { self._renderStep(step, el); }, 260);
      } else {
        // Rendu synchrone : evite toute fenetre de course entre l'attachement de l'ecouteur
        // d'action et un clic reel qui suivrait immediatement l'etape precedente.
        self._renderStep(step, el);
      }
    });
  };

  GuidedTour.prototype._renderStep = function (step, el) {
    this._currentEl = el;
    this._renderProgressBar(step);
    this._positionAll();
    this._renderTooltip(step, el);
    this._attachActionListener(step, el);
  };

  GuidedTour.prototype._renderProgressBar = function (step) {
    var total = this.steps.length;
    var titleEl = this.progressbar.querySelector(".gt-pb-title");
    var stepEl = this.progressbar.querySelector(".gt-pb-step");
    titleEl.textContent = this.meta.title || "Tutoriel";
    stepEl.textContent = "Étape " + (this.stepIndex + 1) + " / " + total;
    var dotsWrap = this.progressbar.querySelector(".gt-pb-dots");
    dotsWrap.innerHTML = "";
    for (var i = 0; i < total; i++) {
      var d = document.createElement("span");
      d.className = "gt-pb-dot" + (i < this.stepIndex ? " gt-done" : "") + (i === this.stepIndex ? " gt-current" : "");
      dotsWrap.appendChild(d);
    }
  };

  GuidedTour.prototype._positionAll = function () {
    var step = this.steps[this.stepIndex];
    var el = this._currentEl;
    if (!el) {
      this.overlay.classList.add("gt-noclip");
      this.spotlight.style.opacity = "0";
      this.arrow.style.opacity = "0";
      this._positionTooltip(step, null);
      return;
    }
    this.overlay.classList.remove("gt-noclip");
    var pad = 8;
    var r = el.getBoundingClientRect();
    var x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad);
    var w = r.width + pad * 2, h = r.height + pad * 2;
    var vw = window.innerWidth, vh = window.innerHeight;
    this.overlay.style.clipPath =
      "polygon(0% 0%, 0% 100%, " + x + "px 100%, " + x + "px " + y + "px, " +
      (x + w) + "px " + y + "px, " + (x + w) + "px " + (y + h) + "px, " +
      x + "px " + (y + h) + "px, " + x + "px 100%, 100% 100%, 100% 0%)";

    this.spotlight.style.opacity = "1";
    this.spotlight.style.top = y + "px";
    this.spotlight.style.left = x + "px";
    this.spotlight.style.width = w + "px";
    this.spotlight.style.height = h + "px";
    this.spotlight.className = "gt-spotlight" + (step.animation ? " gt-anim-" + step.animation : "");

    if (step.arrow) {
      this.arrow.style.opacity = "1";
      this.arrow.className = "gt-arrow gt-arrow-" + step.arrow;
      var ax = x + w / 2 - 17, ay = y;
      if (step.arrow === "bottom") { ax = x + w / 2 - 17; ay = y - 44; }
      else if (step.arrow === "top") { ax = x + w / 2 - 17; ay = y + h + 10; }
      else if (step.arrow === "left") { ax = x + w + 10; ay = y + h / 2 - 17; }
      else if (step.arrow === "right") { ax = x - 44; ay = y + h / 2 - 17; }
      this.arrow.style.left = Math.max(4, Math.min(vw - 38, ax)) + "px";
      this.arrow.style.top = Math.max(4, Math.min(vh - 38, ay)) + "px";
    } else {
      this.arrow.style.opacity = "0";
    }

    this._positionTooltip(step, { x: x, y: y, w: w, h: h });
  };

  GuidedTour.prototype._positionTooltip = function (step, rect) {
    var tt = this.tooltip;
    var mobile = isMobile();
    var placement = step.placement || "auto";

    if (!rect || placement === "center" || mobile) {
      tt.classList.toggle("gt-center", !mobile && (!rect || placement === "center"));
      if (mobile) { tt.style.top = ""; tt.style.left = ""; }
      return;
    }
    tt.classList.remove("gt-center");

    var margin = 16;
    var vw = window.innerWidth, vh = window.innerHeight;
    var ttRect = tt.getBoundingClientRect();
    var tw = ttRect.width || 340, th = ttRect.height || 160;

    var order = [placement, "bottom", "top", "right", "left"];
    var chosen = placement === "auto" ? "bottom" : placement;
    var top, left;

    function compute(p) {
      switch (p) {
        case "top": return { top: rect.y - th - margin, left: rect.x + rect.w / 2 - tw / 2 };
        case "bottom": return { top: rect.y + rect.h + margin, left: rect.x + rect.w / 2 - tw / 2 };
        case "left": return { top: rect.y + rect.h / 2 - th / 2, left: rect.x - tw - margin };
        case "right": return { top: rect.y + rect.h / 2 - th / 2, left: rect.x + rect.w + margin };
        default: return { top: rect.y + rect.h + margin, left: rect.x };
      }
    }
    var pos = compute(chosen);
    if (pos.top < 8 || pos.top + th > vh - 8) {
      var alt = chosen === "top" ? "bottom" : chosen === "bottom" ? "top" : chosen;
      var altPos = compute(alt);
      if (altPos.top >= 8 && altPos.top + th <= vh - 8) { pos = altPos; chosen = alt; }
    }
    pos.left = Math.max(margin, Math.min(vw - tw - margin, pos.left));
    pos.top = Math.max(margin, Math.min(vh - th - margin, pos.top));

    tt.style.top = pos.top + "px";
    tt.style.left = pos.left + "px";
  };

  GuidedTour.prototype._renderTooltip = function (step, el) {
    var self = this;
    var content = (typeof step.dynamicMessage === "function" && el) ? null : null;
    var title = step.title, description = step.description;

    var isFirst = this.stepIndex === 0;
    var isLast = this.stepIndex === this.steps.length - 1;
    var isPureInfo = step.action === "continue";

    this.tooltip.innerHTML =
      '<div class="gt-tt-head"><h3 class="gt-tt-title"></h3>' +
      '<button type="button" class="gt-tt-close" aria-label="Fermer le tutoriel">&times;</button></div>' +
      '<div class="gt-tt-body"></div>' +
      '<div class="gt-tt-check"><span></span><span class="gt-tt-check-label"></span></div>' +
      '<div class="gt-tt-waiting"><span class="gt-dotpulse"></span><span>En attente de votre action…</span></div>' +
      '<div class="gt-tt-foot">' +
      '<button type="button" class="gt-tt-skip">Ignorer le tutoriel</button>' +
      '<div class="gt-tt-nav">' +
      '<button type="button" class="gt-btn gt-btn-ghost gt-tt-prev">Précédent</button>' +
      '<button type="button" class="gt-btn gt-btn-primary gt-tt-next">' + (isLast ? "Terminer" : "Suivant") + "</button>" +
      "</div></div>";

    this.tooltip.querySelector(".gt-tt-title").textContent = title;
    this.tooltip.querySelector(".gt-tt-body").innerHTML = description;
    this.tooltip.querySelector(".gt-tt-check span:last-child").textContent = "Parfait !";
    this.tooltip.querySelector(".gt-tt-check span:first-child").innerHTML = svgCheck();

    var prevBtn = this.tooltip.querySelector(".gt-tt-prev");
    var nextBtn = this.tooltip.querySelector(".gt-tt-next");
    var skipBtn = this.tooltip.querySelector(".gt-tt-skip");
    var closeBtn = this.tooltip.querySelector(".gt-tt-close");
    var waitingEl = this.tooltip.querySelector(".gt-tt-waiting");

    prevBtn.disabled = isFirst;
    prevBtn.onclick = function () { self.prev(); };
    skipBtn.onclick = function () { self.skip(); };
    closeBtn.onclick = function () { self.pause(); };

    var stepRequiresAction = step.action && step.action !== "continue";
    var canAdvanceNow = !stepRequiresAction || step.required === false;
    nextBtn.disabled = stepRequiresAction && step.required !== false;
    waitingEl.style.display = stepRequiresAction && step.required !== false ? "flex" : "none";
    nextBtn.onclick = function () {
      if (nextBtn.disabled) return;
      self.next();
    };

    revealNow(this.tooltip, "gt-visible");
    this._positionAll();
    try { this.tooltip.focus({ preventScroll: true }); } catch (e) {}
  };

  /* ---------------------------------------------------------
     Ecoute de l'action reelle demandee par l'etape
     --------------------------------------------------------- */
  GuidedTour.prototype._teardownStepListeners = function () {
    (this._cleanup || []).forEach(function (fn) { try { fn(); } catch (e) {} });
    this._cleanup = [];
  };

  GuidedTour.prototype._markSatisfied = function (step) {
    var self = this;
    if (this._satisfied) return;
    this._satisfied = true;
    var nextBtn = this.tooltip.querySelector(".gt-tt-next");
    var waitingEl = this.tooltip.querySelector(".gt-tt-waiting");
    var checkEl = this.tooltip.querySelector(".gt-tt-check");
    if (nextBtn) nextBtn.disabled = false;
    if (waitingEl) waitingEl.style.display = "none";
    if (checkEl && step.action !== "click") { checkEl.classList.add("gt-show"); }

    if (typeof step.dynamicMessage === "function" && this._currentEl) {
      var patch = null;
      try { patch = step.dynamicMessage(this._currentEl); } catch (e) {}
      if (patch) {
        if (patch.title) this.tooltip.querySelector(".gt-tt-title").textContent = patch.title;
        if (patch.description) this.tooltip.querySelector(".gt-tt-body").innerHTML = patch.description;
      }
    }

    var delay = step.action === "click" ? 350 : 750;
    this._advanceTimer = setTimeout(function () {
      if (self.active && self.steps[self.stepIndex] === step) self.next();
    }, delay);
  };

  GuidedTour.prototype._attachActionListener = function (step, el) {
    var self = this;
    if (!el || !step.action || step.action === "continue") return;

    var handler;
    var evtName;
    if (step.action === "click") {
      evtName = "click";
      handler = function () { self._markSatisfied(step); };
    } else if (step.action === "check") {
      evtName = "change";
      handler = function () { if (el.checked) self._markSatisfied(step); };
    } else if (step.action === "change") {
      evtName = "change";
      handler = function () { if (el.value && el.value.trim() !== "") self._markSatisfied(step); };
    } else if (step.action === "input") {
      evtName = "input";
      handler = function () {
        var v = (el.value || "").trim();
        var minLen = step.minLength || 1;
        if (v.length < minLen) return;
        if (step.matchField) {
          var other = qs(step.matchField);
          if (!other || other.value !== el.value) return;
        }
        self._markSatisfied(step);
      };
    } else if (step.action === "wait-visible") {
      // Deja gere par waitForVisible en amont : on considere l'etape satisfaite des l'affichage.
      this._markSatisfied(step);
      return;
    }

    if (!handler) return;
    el.addEventListener(evtName, handler);
    this._cleanup.push(function () { el.removeEventListener(evtName, handler); });

    // Si le champ etait deja rempli (retour en arriere, brouillon restaure…), on le detecte tout de suite.
    if (step.action === "input" && (el.value || "").trim().length >= (step.minLength || 1)) {
      if (!step.matchField || (qs(step.matchField) && qs(step.matchField).value === el.value)) {
        setTimeout(function () { self._markSatisfied(step); }, 50);
      }
    }
    if (step.action === "check" && el.checked) setTimeout(function () { self._markSatisfied(step); }, 50);
    if (step.action === "change" && el.value && el.value.trim() !== "") setTimeout(function () { self._markSatisfied(step); }, 50);
  };

  /* Clic en dehors de la cible pendant qu'une action est attendue : on ne bloque pas
     la page (l'utilisateur reste libre), on donne juste un signal visuel discret. */
  GuidedTour.prototype._nudge = function () {
    this.overlay.classList.remove("gt-overlay-nudge");
    void this.overlay.offsetWidth;
    this.overlay.classList.add("gt-overlay-nudge");
    this.spotlight.classList.add("gt-anim-shake");
    setTimeout(function () {}, 10);
  };

  GuidedTour.prototype._finish = function () {
    var self = this;
    localStorage.removeItem(STORAGE_KEY);
    this._teardownStepListeners();
    this.active = false;
    this._removeDom();

    var fin = this.meta.finale || {};
    var el = document.createElement("div");
    el.className = "gt-finale";
    el.innerHTML =
      '<div class="gt-finale-icon">' + (fin.icon || "🎉") + "</div>" +
      "<h3>" + (fin.title || "Bravo !") + "</h3>" +
      "<p>" + (fin.message || "") + "</p>" +
      (fin.list ? "<ul>" + fin.list.map(function (li) { return "<li>" + li + "</li>"; }).join("") + "</ul>" : "") +
      '<button type="button" class="gt-btn gt-btn-primary" style="width:100%;">' + (fin.cta || "Fermer") + "</button>";
    document.body.appendChild(el);
    if (!fin.list) burstConfetti();
    revealNow(el, "gt-visible");
    el.querySelector("button").onclick = function () { el.remove(); };
  };

  GuidedTour.prototype._hideResumeBanner = function () {
    if (this.resumeBanner.parentNode) this.resumeBanner.parentNode.removeChild(this.resumeBanner);
  };

  /* ---------------------------------------------------------
     Reprise apres fermeture / rechargement de page
     --------------------------------------------------------- */
  GuidedTour.prototype.checkResume = function () {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || !data.tourId || !REGISTRY[data.tourId]) return;
    if (localStorage.getItem(DISMISS_PREFIX + data.tourId)) return;

    var def = REGISTRY[data.tourId];
    var self = this;
    document.body.appendChild(this.resumeBanner);
    this.resumeBanner.innerHTML =
      "<span>Vous avez un tutoriel « " + (def.meta.title || "Tutoriel") + " » en cours. Voulez-vous le reprendre ?</span>" +
      '<button type="button" class="gt-btn gt-btn-ghost gt-resume-dismiss">Non merci</button>' +
      '<button type="button" class="gt-btn gt-btn-primary gt-resume-continue">Reprendre</button>';
    revealNow(this.resumeBanner, "gt-visible");

    this.resumeBanner.querySelector(".gt-resume-dismiss").onclick = function () {
      localStorage.removeItem(STORAGE_KEY);
      self.resumeBanner.classList.remove("gt-visible");
      setTimeout(function () { self._hideResumeBanner(); }, 250);
    };
    this.resumeBanner.querySelector(".gt-resume-continue").onclick = function () {
      self.resumeBanner.classList.remove("gt-visible");
      setTimeout(function () { self._hideResumeBanner(); }, 250);
      self.start(data.tourId, { resumeStepId: data.stepId });
    };
  };

  /* ---------------------------------------------------------
     API statique
     --------------------------------------------------------- */
  GuidedTour.define = function (tourId, steps, meta) {
    REGISTRY[tourId] = { steps: steps, meta: meta || {} };
  };
  GuidedTour.instance = function () {
    if (!global.__daGuidedTourInstance) global.__daGuidedTourInstance = new GuidedTour();
    return global.__daGuidedTourInstance;
  };
  GuidedTour.start = function (tourId, opts) { GuidedTour.instance().start(tourId, opts); };
  GuidedTour.checkResume = function () { GuidedTour.instance().checkResume(); };

  global.GuidedTour = GuidedTour;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { GuidedTour.checkResume(); });
  } else {
    GuidedTour.checkResume();
  }
})(window);
