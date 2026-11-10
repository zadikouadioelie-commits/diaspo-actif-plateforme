/* ═════════════════════════════════════════════════
   assets/koffi-voix.js — COMMANDE VOCALE DE KOFFI (2026-11-10, demande explicite : « la fonction commande vocale à tous les Koffi »)
   ═════════════════════════════════════════════════
   Un seul module pour tous les Koffi (guide de navigation, assistant administrateur, événements, fiches d'inscription, Business Plan, tuteur de formation) :
   il repère leur formulaire (champ + bouton « Envoyer »), y ajoute un bouton micro, et fonctionne ainsi :
     1. On touche le micro, on PARLE ; le texte s'écrit en direct dans le champ.
     2. Dès que la phrase est finie (pause), un compte à rebours de 2 s annonce l'envoi : toucher le micro ou le champ l'annule et laisse corriger.
     3. Sans annulation, le message part comme si on avait touché « Envoyer » — Koffi répond exactement comme pour une question écrite (mêmes règles, mêmes
        garde-fous, même crédit) : la voix n'ouvre AUCUN droit de plus que le clavier.
   Reconnaissance : celle du navigateur (gratuite, aucune clé) ; le bouton n'apparaît pas si le navigateur ne la propose pas. Avant la première utilisation, une
   information claire est affichée (la voix est transcrite par le navigateur, Diaspo'Actif ne la conserve pas, seul le texte est envoyé à Koffi) et demande « OK ».
   Les Koffi de l'Annuaire et du formateur ont déjà leur propre dictée (zone de saisie longue) : ils ne sont pas touchés.
   API : KoffiVoix.brancher(formulaire) ; KoffiVoix.disponible.
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KoffiVoix) return;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { window.KoffiVoix = { disponible: false, brancher: function () {} }; return; }

  var FORMS = '.kn-form,.kad-form,.ke-form,.ki-form,.kb-form,.kf-form';
  var DELAI_ENVOI = 2000;
  var TXT = {
    fr: {
      parler: 'Parler à Koffi (commande vocale)', arreter: 'Arrêter l\'écoute',
      info: 'Commande vocale : votre voix est transcrite en texte par votre navigateur (elle peut transiter par ses serveurs) ; Diaspo\'Actif ne la conserve pas. Seul le texte est envoyé à Koffi, comme si vous l\'aviez écrit.',
      ok: 'OK, activer le micro', ecoute: 'Je vous écoute… Parlez, puis faites une pause.', envoi: 'Envoi dans 2 secondes… Touchez le micro ou le champ pour annuler.',
      annule: 'Envoi annulé. Vous pouvez corriger le texte, puis toucher « Envoyer ».', rien: 'Je n\'ai rien entendu. Touchez le micro pour réessayer.',
      refus: 'Le micro est refusé. Autorisez-le dans votre navigateur (icône à gauche de l\'adresse), puis réessayez.', erreur: 'La reconnaissance vocale est indisponible pour le moment. Écrivez votre message.',
      pret: 'Texte prêt : touchez « Envoyer ».'
    },
    en: {
      parler: 'Talk to Koffi (voice command)', arreter: 'Stop listening',
      info: 'Voice command: your voice is turned into text by your browser (it may pass through its servers); Diaspo\'Actif does not keep it. Only the text is sent to Koffi, as if you had typed it.',
      ok: 'OK, turn on the microphone', ecoute: 'Listening… Speak, then pause.', envoi: 'Sending in 2 seconds… Tap the microphone or the field to cancel.',
      annule: 'Sending cancelled. You can edit the text, then tap “Send”.', rien: 'I did not hear anything. Tap the microphone to try again.',
      refus: 'The microphone is blocked. Allow it in your browser (icon left of the address), then try again.', erreur: 'Voice recognition is unavailable right now. Please type your message.',
      pret: 'Text ready: tap “Send”.'
    }
  };

  var ICONE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/></svg>';
  var CSS = [
    '.kv-mic{flex:none;width:42px;height:42px;padding:0;border-radius:12px;border:1.5px solid #cbd5e1;background:#fff;color:#0D2B4E;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-family:inherit}',
    '.kv-mic:hover{background:#fff7ed;border-color:#F26422}.kv-mic:focus-visible{outline:3px solid #F26422;outline-offset:2px}',
    '.kv-mic.rec{background:#dc2626;border-color:#dc2626;color:#fff;animation:kvPulse 1.2s infinite}@keyframes kvPulse{50%{opacity:.7}}',
    '.kv-mic[disabled]{opacity:.5;cursor:not-allowed}',
    '.kv-st{margin:0 0 6px;font-size:12px;line-height:1.45;font-weight:700;color:#0D2B4E}.kv-st:empty{display:none}.kv-st.err{color:#b91c1c}',
    '.kv-st .kv-ok{display:block;margin-top:6px;border:0;border-radius:10px;background:#F26422;color:#fff;font:800 13px inherit;font-family:inherit;padding:8px 14px;cursor:pointer}',
    '.kv-st .kv-ok:focus-visible{outline:3px solid #0D2B4E;outline-offset:2px}',
    '@media (prefers-reduced-motion:reduce){.kv-mic.rec{animation:none}}'
  ].join('\n');

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sans importance */ } }
  function injecterCss() {
    if (document.getElementById('kv-css')) return;
    var s = document.createElement('style'); s.id = 'kv-css'; s.textContent = CSS; (document.head || document.documentElement).appendChild(s);
  }
  function langue(ta) {
    var l = String(ta.lang || (ta.closest && ta.closest('[lang]') ? ta.closest('[lang]').lang : '') || document.documentElement.lang || 'fr').toLowerCase();
    if (/^(ask|write|what)\b/i.test(ta.placeholder || '')) return 'en';   /* le tuteur de formation change de langue sans changer celle de la page */
    return l.indexOf('en') === 0 ? 'en' : 'fr';
  }

  function brancher(form) {
    if (!form || form.getAttribute('data-kv')) return;
    var ta = form.querySelector('textarea'), env = form.querySelector('button[type="submit"]');
    if (!ta || !env || !env.parentNode) return;
    form.setAttribute('data-kv', '1');
    injecterCss();

    var lg = langue(ta), T = TXT[lg];
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'kv-mic'; btn.innerHTML = ICONE;
    btn.setAttribute('aria-label', T.parler); btn.title = T.parler;
    var st = document.createElement('p'); st.className = 'kv-st'; st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'polite');
    env.parentNode.insertBefore(btn, env); form.parentNode.insertBefore(st, form);

    var rec = null, ecoute = false, abandon = false, base = '', dit = '', minuteur = null, veille = null, erreur = '';
    function dire(texte, err) { st.className = 'kv-st' + (err ? ' err' : ''); st.textContent = texte || ''; }
    function ui(on) { ecoute = on; btn.classList.toggle('rec', on); var l = on ? T.arreter : T.parler; btn.setAttribute('aria-label', l); btn.title = l; }
    function annulerEnvoi() { if (minuteur) { clearTimeout(minuteur); minuteur = null; return true; } return false; }
    function arreterEcoute(garder) {
      if (veille) { clearInterval(veille); veille = null; }
      abandon = true;
      if (rec) { try { rec.abort ? rec.abort() : rec.stop(); } catch (e) { /* déjà arrêté */ } }
      ui(false); if (!garder) dire('');
    }
    function envoyer() {
      minuteur = null; dire('');
      if (ta.disabled || env.disabled) return;
      if (form.requestSubmit) { try { form.requestSubmit(env); return; } catch (e) { /* ancien navigateur */ } }
      env.click();
    }
    function programmerEnvoi() {
      if (ta.disabled || env.disabled) { dire(T.pret); return; }
      dire(T.envoi); minuteur = setTimeout(envoyer, DELAI_ENVOI);
    }
    function demarrer() {
      annulerEnvoi(); erreur = ''; abandon = false; dit = ''; base = ta.value.trim();
      rec = new SR(); rec.lang = lg === 'en' ? 'en-US' : 'fr-FR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      rec.addEventListener('result', function (e) {
        var t = ''; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        dit = t; ta.value = (base + ' ' + t).replace(/\s+/g, ' ').trim(); ta.dispatchEvent(new Event('input', { bubbles: true }));
      });
      rec.addEventListener('error', function (e) {
        if (e.error === 'aborted') return;
        if (e.error === 'no-speech') { erreur = 'rien'; return; }
        erreur = (e.error === 'not-allowed' || e.error === 'service-not-allowed') ? 'refus' : 'erreur';
      });
      rec.addEventListener('end', function () {
        if (veille) { clearInterval(veille); veille = null; }
        ui(false);
        if (abandon) return;
        if (erreur === 'refus') { dire(T.refus, true); return; }
        if (erreur === 'erreur') { dire(T.erreur, true); return; }
        if (dit.trim()) programmerEnvoi(); else dire(T.rien, true);
      });
      try { rec.start(); ui(true); dire(T.ecoute); }
      catch (e) { ui(false); dire(T.erreur, true); return; }
      /* Le volet de Koffi se ferme pendant l'écoute : on coupe le micro (jamais d'écoute à l'insu de la personne). */
      veille = setInterval(function () { if (!form.offsetParent) arreterEcoute(false); }, 800);
    }

    btn.addEventListener('click', function () {
      if (annulerEnvoi()) { dire(T.annule); return; }
      if (ecoute) { arreterEcoute(true); return; }
      if (lsGet('kv_info_v1') !== '1') {
        st.className = 'kv-st'; st.textContent = T.info;
        var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'kv-ok'; ok.textContent = T.ok;
        ok.addEventListener('click', function () { lsSet('kv_info_v1', '1'); demarrer(); });
        st.appendChild(ok); try { ok.focus(); } catch (e) { /* sans importance */ }
        return;
      }
      demarrer();
    });
    /* Toucher le champ ou écrire annule l'envoi automatique ; envoyer à la main coupe tout. */
    ta.addEventListener('pointerdown', function () { if (annulerEnvoi()) dire(T.annule); });
    ta.addEventListener('keydown', function () { if (annulerEnvoi()) dire(T.annule); });
    form.addEventListener('submit', function () { annulerEnvoi(); if (ecoute) arreterEcoute(false); else dire(''); }, true);
  }

  function balayer() { var l = document.querySelectorAll(FORMS); for (var i = 0; i < l.length; i++) brancher(l[i]); }
  var prevu = false;
  function planifier(muts) {
    var neuf = false; for (var i = 0; i < muts.length && !neuf; i++) if (muts[i].addedNodes && muts[i].addedNodes.length) neuf = true;
    if (!neuf || prevu) return;
    /* setTimeout et non requestAnimationFrame : ce dernier ne se déclenche pas quand l'onglet est en arrière-plan. */
    prevu = true; setTimeout(function () { prevu = false; balayer(); }, 60);
  }
  balayer();
  try { new MutationObserver(planifier).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) { /* sans observateur : le balayage initial reste */ }

  window.KoffiVoix = { disponible: true, brancher: brancher };
})();
