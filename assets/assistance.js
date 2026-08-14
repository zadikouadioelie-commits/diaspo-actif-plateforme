/* ═══════════════════════════════════════════════════════════════════════
   SUPPORT PILOTE — script client site-wide (membre)
   Chargé dynamiquement sur TOUTES les pages via assets/app.js (comme O-Z /
   support-technique) : un membre doit pouvoir être notifié qu'un administrateur
   a accepté sa demande, où qu'il navigue sur la plateforme, pas seulement sur
   support-pilote.html.

   Portée du "contrôle" : UNIQUEMENT les pages Diaspo'Actif. Ce script exécute les
   actions relayées par l'administrateur (clic/saisie) sur le VRAI DOM de la page
   courante, avec la session réelle du membre — jamais sur le reste de son
   ordinateur, jamais avec les identifiants de l'administrateur. Consentement
   explicite requis à chaque étape (mot de passe + motif à la demande, clic
   "Accepter" sous 10 min) et bouton "Arrêter" toujours visible côté membre.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__ASSISTANCE_LOADED) return;
  window.__ASSISTANCE_LOADED = true;

  const AS = {
    sessionId: null,
    statut: null,
    idleTimer: null,     // veille : GET mon-statut toutes les ~25s
    countdownTimer: null,
    pushTimer: null,     // ACTIVE : pousse un instantané toutes les ~2s
    actionsTimer: null,  // ACTIVE : récupère les actions à exécuter toutes les ~1s
  };

  function asParseUtc(str) {
    // Colonnes *_at au format "YYYY-MM-DD HH:MM:SS" (UTC, sans indicateur de fuseau) — ne
    // jamais faire new Date(str) directement, réinterprété comme heure LOCALE (bug déjà
    // rencontré et documenté sur ce projet, ex. tgMaintenant côté serveur).
    return new Date(String(str || "").replace(" ", "T") + "Z");
  }
  function asRemainingSec(str) {
    return Math.max(0, Math.round((asParseUtc(str).getTime() - Date.now()) / 1000));
  }
  function asFmtMmSs(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function asStopFast() {
    clearInterval(AS.pushTimer); AS.pushTimer = null;
    clearInterval(AS.actionsTimer); AS.actionsTimer = null;
    clearInterval(AS.countdownTimer); AS.countdownTimer = null;
  }

  function asHideBanner() {
    const b = document.getElementById("as-banner");
    if (b) b.remove();
  }

  function asShowBanner(html) {
    let b = document.getElementById("as-banner");
    if (!b) {
      b = document.createElement("div");
      b.id = "as-banner";
      // Même z-index que les bandeaux sticky existants (showEmailVerifBanner) : sous la
      // topbar (z-index 50) pour ne jamais bloquer la navigation.
      b.style.cssText = "position:sticky;top:0;z-index:45;padding:10px 16px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;text-align:center;";
      document.body.prepend(b);
    }
    b.innerHTML = html;
  }

  /* ── Capture de l'écran courant (mirroring) ── */
  function asCaptureSnapshot() {
    try {
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll("script").forEach(el => el.remove());
      clone.querySelectorAll("#as-banner").forEach(el => el.remove()); // pas la peine de mirroir notre propre bandeau
      // cloneNode ne recopie pas les valeurs saisies (.value) dans les attributs HTML des
      // champs — sans ça le miroir afficherait des formulaires vides. Les deux listes
      // (originale/clone) restent dans le même ordre, c'est une copie structurelle pure.
      const originaux = document.querySelectorAll("input,textarea,select");
      const clones = clone.querySelectorAll("input,textarea,select");
      originaux.forEach((el, i) => {
        const c = clones[i];
        if (!c) return;
        if (el.tagName === "SELECT") c.setAttribute("value", el.value);
        else if (el.type === "checkbox" || el.type === "radio") { if (el.checked) c.setAttribute("checked", "checked"); }
        else c.setAttribute("value", el.value);
      });
      return clone.outerHTML;
    } catch (e) { return ""; }
  }

  async function asPousserEtat() {
    if (!AS.sessionId || document.hidden) return;
    try {
      const r = await api("POST", `/assistance/${AS.sessionId}/etat`, { url: location.pathname + location.search, html: asCaptureSnapshot() });
      if (r.statut !== "ACTIVE") asRafraichir();
    } catch (e) { /* silencieux : un raté ponctuel ne doit jamais interrompre la session */ }
  }

  /* Exécute les commandes envoyées par l'administrateur — toujours dans les limites
     strictes suivantes : même origine uniquement (contrôlé aussi côté serveur), échec
     silencieux si l'élément ciblé n'existe plus (jamais bloquant), et toujours avec la
     session/les droits réels du membre — l'administrateur n'obtient jamais son mot de passe
     ni son cookie de session. */
  async function asRecupererActions() {
    if (!AS.sessionId || document.hidden) return;
    let data;
    try { data = await api("GET", `/assistance/${AS.sessionId}/actions`); } catch (e) { return; }
    if (data.statut !== "ACTIVE") { asRafraichir(); return; }
    for (const a of (data.actions || [])) {
      try {
        if (a.type === "navigate") {
          if (a.valeur) { location.href = a.valeur; return; } // page va se recharger, on s'arrête là
        } else {
          const el = a.selecteur ? document.querySelector(a.selecteur) : null;
          if (el) {
            if (a.type === "click") el.click();
            else if (a.type === "input") {
              el.focus();
              el.value = a.valeur != null ? a.valeur : "";
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            } else if (a.type === "submit") {
              if (el.requestSubmit) el.requestSubmit(); else el.submit();
            }
          }
        }
      } catch (e) { /* une action qui échoue ne doit jamais casser la session */ }
      try { await api("POST", `/assistance/${AS.sessionId}/actions/${a.id}/ack`); } catch (e) {}
    }
  }

  window.assistanceEtendre = async function (minutes) {
    if (!AS.sessionId) return;
    try {
      await api("POST", `/assistance/${AS.sessionId}/etendre`, { minutes });
      if (typeof showToast === "function") showToast(`✅ Session prolongée de ${minutes} min.`);
      asRafraichir();
    } catch (e) { alert(e.message || "Impossible de prolonger la session."); }
  };

  window.assistanceArreter = async function () {
    if (!AS.sessionId) return;
    if (!confirm("Mettre fin à la session d'assistance maintenant ?")) return;
    try { await api("POST", `/assistance/${AS.sessionId}/terminer`); } catch (e) {}
    asRafraichir();
  };

  window.assistanceAccepter = async function () {
    if (!AS.sessionId) return;
    try {
      await api("POST", `/assistance/${AS.sessionId}/accepter`);
      asRafraichir();
    } catch (e) { alert(e.message || "Impossible d'accepter la demande."); }
  };

  window.assistanceRefuser = async function () {
    if (!AS.sessionId) return;
    try { await api("POST", `/assistance/${AS.sessionId}/refuser`); } catch (e) {}
    asRafraichir();
  };

  window.assistanceAnnuler = async function () {
    if (!AS.sessionId) return;
    if (!confirm("Annuler votre demande d'assistance ?")) return;
    try { await api("POST", `/assistance/${AS.sessionId}/terminer`); } catch (e) {}
    asRafraichir();
  };

  function asRenderEnAttente() {
    asStopFast();
    asShowBanner(`
      <span>🕐 Votre demande d'assistance est en attente d'un administrateur.</span>
      <button onclick="assistanceAnnuler()" style="background:none;border:1px solid currentColor;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;cursor:pointer;">Annuler</button>
    `);
    const b = document.getElementById("as-banner");
    b.style.background = "#EFF6FF"; b.style.color = "#1e3a5f";
  }

  function asRenderNotifie() {
    asStopFast();
    function tick() {
      const sec = asRemainingSec(AS.notifExpiresAt);
      const cnt = document.getElementById("as-countdown");
      if (cnt) cnt.textContent = asFmtMmSs(sec);
      if (sec <= 0) asRafraichir();
    }
    asShowBanner(`
      <span>🖥️ Un administrateur peut vous assister maintenant. Accepter le partage d'écran ?</span>
      <span id="as-countdown" style="font-variant-numeric:tabular-nums;font-weight:800;"></span>
      <button onclick="assistanceAccepter()" style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:12.5px;font-weight:800;cursor:pointer;">✅ Accepter</button>
      <button onclick="assistanceRefuser()" style="background:none;border:1px solid currentColor;border-radius:6px;padding:5px 14px;font-size:12.5px;font-weight:700;cursor:pointer;">Refuser</button>
    `);
    const b = document.getElementById("as-banner");
    b.style.background = "#FEF3C7"; b.style.color = "#92400E";
    tick();
    AS.countdownTimer = setInterval(tick, 1000);
  }

  function asRenderActive() {
    function tick() {
      const sec = asRemainingSec(AS.sessionExpiresAt);
      const cnt = document.getElementById("as-countdown");
      if (cnt) cnt.textContent = asFmtMmSs(sec);
      if (sec <= 0) asRafraichir();
    }
    asShowBanner(`
      <span>🔴 Session d'assistance en cours — un administrateur voit votre écran et peut agir pour vous, uniquement sur Diaspo'Actif.</span>
      <span id="as-countdown" style="font-variant-numeric:tabular-nums;font-weight:800;"></span>
      <button onclick="assistanceEtendre(5)" style="background:none;border:1px solid currentColor;border-radius:6px;padding:5px 12px;font-size:12.5px;font-weight:700;cursor:pointer;">+5 min</button>
      <button onclick="assistanceEtendre(10)" style="background:none;border:1px solid currentColor;border-radius:6px;padding:5px 12px;font-size:12.5px;font-weight:700;cursor:pointer;">+10 min</button>
      <button onclick="assistanceArreter()" style="background:#dc2626;color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:12.5px;font-weight:800;cursor:pointer;">⏹️ Arrêter</button>
    `);
    const b = document.getElementById("as-banner");
    b.style.background = "#FEE2E2"; b.style.color = "#991B1B";
    tick();
    AS.countdownTimer = setInterval(tick, 1000);

    if (!AS.pushTimer) {
      asPousserEtat();
      AS.pushTimer = setInterval(asPousserEtat, 2000);
    }
    if (!AS.actionsTimer) {
      asRecupererActions();
      AS.actionsTimer = setInterval(asRecupererActions, 1000);
    }
  }

  async function asRafraichir() {
    let data;
    try { data = await api("GET", "/assistance/mon-statut"); } catch (e) { return; }
    const s = data.session;
    if (!s) {
      AS.sessionId = null; AS.statut = null;
      asStopFast(); asHideBanner();
      return;
    }
    AS.sessionId = s.id; AS.statut = s.statut;
    AS.notifExpiresAt = s.notif_expires_at; AS.sessionExpiresAt = s.session_expires_at;
    if (s.statut === "EN_ATTENTE") asRenderEnAttente();
    else if (s.statut === "NOTIFIE") asRenderNotifie();
    else if (s.statut === "ACTIVE") asRenderActive();
    else { asStopFast(); asHideBanner(); }
  }

  /* ── Veille : poll léger sur toutes les pages, pause si l'onglet est caché ── */
  function asDemarrerVeille() {
    clearInterval(AS.idleTimer);
    AS.idleTimer = setInterval(() => { if (!document.hidden) asRafraichir(); }, 25000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) asRafraichir(); });
  window.addEventListener("beforeunload", () => { clearInterval(AS.idleTimer); asStopFast(); });

  (async function init() {
    // CURRENT_USER est déclaré avec `let` au top-level de app.js — un script classique
    // (pas un module), donc ce binding n'est PAS une propriété de `window` : il faut le
    // référencer directement par son nom, jamais via window.CURRENT_USER (toujours undefined).
    // Et CURRENT_USER vaut `null` (pas `undefined`) tant qu'il n'est pas chargé — bien
    // distinguer "pas encore chargé" (null) de "non déclaré" (undefined, script pas prêt).
    let me = (typeof CURRENT_USER !== "undefined") ? CURRENT_USER : null;
    if (!me && typeof fetchCurrentUser === "function") me = await fetchCurrentUser().catch(() => null);
    if (!me) return; // visiteur non connecté : rien à faire
    await asRafraichir();
    asDemarrerVeille();
  })();
})();
