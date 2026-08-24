/* ===========================================================
   PWA — service worker, balises manquantes et bannière "Installer l'app",
   pour les pages qui ne chargent pas assets/app.js (2026-08-24).

   Extrait volontairement d'assets/app.js plutôt que d'y faire pointer ces
   pages : app.js déclenche aussi des logiques pensées pour les pages
   connectées avec topbar (badges de messages/notifications, bouton Premium,
   tour guidé démo…) qui supposeraient des éléments absents ici (#notif-badge,
   #premium-topbar-btn…) et qui n'ont de toute façon aucun sens sur une page
   vitrine publique. Ce fichier ne reprend QUE la partie PWA, à l'identique
   (mêmes fonctions, même comportement, même endpoint /auth/pwa-prompt-preference)
   pour rester cohérent avec le reste du site. */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

(function injectPwaHeadTags() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const l = document.createElement('link'); l.rel = 'manifest'; l.href = '/manifest.json';
    document.head.appendChild(l);
  }
  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const l = document.createElement('link'); l.rel = 'apple-touch-icon'; l.href = '/assets/logo.png';
    document.head.appendChild(l);
  }
  [
    ['apple-mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-title', "Diaspo'Actif"],
    ['apple-mobile-web-app-status-bar-style', 'default'],
  ].forEach(([name, content]) => {
    if (document.querySelector(`meta[name="${name}"]`)) return;
    const m = document.createElement('meta'); m.name = name; m.content = content;
    document.head.appendChild(m);
  });
})();

let _pwaDeferredPrompt = null;
let _pwaCurrentUser = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _pwaDeferredPrompt = e;
  maybeShowPwaInstallBanner(_pwaCurrentUser);
});
window.addEventListener('appinstalled', () => { _pwaDeferredPrompt = null; });

/* Client API minimal (identique à celui d'app.js) — pas de dépendance croisée
   pour garder ce fichier utilisable seul. */
async function pwaApi(method, path, body) {
  const opts = { method, headers: {}, credentials: "same-origin" };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch("/api" + path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) { /* réponse vide */ }
  if (!res.ok) throw Object.assign(new Error(data.error || "Erreur serveur"), { status: res.status, data });
  return data;
}

function pwaIsStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function pwaIsIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function pwaIsIOSSafari() {
  return pwaIsIOS() && /Safari/.test(navigator.userAgent)
    && !/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\//.test(navigator.userAgent);
}
function showPwaInstallBanner(user) {
  _pwaCurrentUser = user;
  maybeShowPwaInstallBanner(user);
}
function maybeShowPwaInstallBanner(user) {
  if (!user || pwaIsStandalone() || user.pwa_prompt_dismiss) return;
  const n = user.nb_connexions || 0;
  if (n < 1 || (n - 1) % 3 !== 0) return; // occurrences : connexions 1, 4, 7, 10…
  if (document.getElementById('pwa-install-banner')) return;
  const flagKey = 'da_pwa_banner_shown_' + n;
  if (sessionStorage.getItem(flagKey)) return;

  const isIOS = pwaIsIOS();
  const isIOSSafari = isIOS && pwaIsIOSSafari();
  const canAndroidPrompt = !isIOS && !!_pwaDeferredPrompt;
  if (!isIOS && !canAndroidPrompt) return;

  let bodyHtml;
  if (canAndroidPrompt) {
    bodyHtml = `<span>📲 Installez Diaspo'Actif sur votre écran d'accueil pour y accéder en un clic.</span>
      <button id="pwa-install-btn" type="button" style="background:#fff;color:#F26422;border:none;border-radius:6px;padding:5px 14px;font-size:12px;font-weight:700;cursor:pointer;">Installer</button>`;
  } else if (isIOSSafari) {
    bodyHtml = `<span>📲 Installez Diaspo'Actif sur votre écran d'accueil : appuyez sur <strong>Partager</strong> <span style="font-size:15px;">📤</span> puis <strong>« Sur l'écran d'accueil »</strong>.</span>`;
  } else {
    bodyHtml = `<span>📲 Pour installer Diaspo'Actif sur votre écran d'accueil, ouvrez ce lien dans <strong>Safari</strong>.</span>`;
  }

  const occurrence = Math.floor((n - 1) / 3) + 1;
  const showNeverBtn = occurrence >= 3;
  sessionStorage.setItem(flagKey, '1');

  const bar = document.createElement('div');
  bar.id = 'pwa-install-banner';
  bar.style.cssText = "position:sticky;top:0;z-index:45;background:#F26422;color:#fff;padding:10px 16px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;";
  bar.innerHTML = `
    ${bodyHtml}
    ${showNeverBtn ? `<button id="pwa-never-btn" type="button" style="background:none;border:1.5px solid rgba(255,255,255,.7);color:#fff;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;cursor:pointer;">Ne plus afficher</button>` : ''}
    <button id="pwa-dismiss-btn" type="button" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;">✕</button>`;
  document.body.prepend(bar);

  document.getElementById('pwa-dismiss-btn').onclick = () => bar.remove();

  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.onclick = async () => {
      if (!_pwaDeferredPrompt) { bar.remove(); return; }
      installBtn.disabled = true;
      const prompt = _pwaDeferredPrompt;
      _pwaDeferredPrompt = null;
      prompt.prompt();
      try { await prompt.userChoice; } catch (e) { /* ignoré */ }
      bar.remove();
    };
  }

  const neverBtn = document.getElementById('pwa-never-btn');
  if (neverBtn) {
    neverBtn.onclick = async () => {
      neverBtn.disabled = true;
      try {
        await pwaApi('PATCH', '/auth/pwa-prompt-preference', { dismiss: true });
        if (_pwaCurrentUser) _pwaCurrentUser.pwa_prompt_dismiss = true;
        bar.innerHTML = `<span>✅ Cette proposition ne sera plus affichée. Si vous changez d'avis, vous la retrouverez dans <strong>Confidentialité</strong>.</span>`;
        setTimeout(() => bar.remove(), 4500);
      } catch (e) {
        neverBtn.disabled = false;
      }
    };
  }
}

/* Déclencheur : contrairement à app.js (où showPwaInstallBanner() est appelé au sein
   d'une fonction déjà déclenchée pour toute autre raison sur les pages connectées),
   ici on va chercher l'utilisateur courant nous-mêmes — silencieux et sans effet si
   personne n'est connecté (page publique, cas normal). */
pwaApi('GET', '/auth/me').then(r => showPwaInstallBanner(r.user)).catch(() => {});
