/* ═══════════════════════════════════════════════════════
   assets/telecharger-app.js — « Télécharger Diaspo'Actif » (2026-10-13, demande explicite)
   « Dans le menu des modules, un bouton télécharger Diaspo'Actif qui permet d'avoir un raccourci sur l'écran du téléphone ou de l'ordinateur. »

   Le raccourci est l'installation de l'application web (PWA : manifest.json / manifest-m.json) :
   · navigateur qui propose l'installation (Chrome, Edge, Android) → un clic, la fenêtre native du navigateur s'ouvre ;
   · sinon → un guide adapté à l'appareil (iPhone/iPad Safari, Android, Chrome/Edge/Safari/Firefox sur ordinateur) ;
   · ordinateur → en plus, un petit fichier raccourci à télécharger (Windows .url, Mac .webloc, Linux .desktop) qui ouvre Diaspo'Actif d'un double-clic.
   Chargé à la demande par les boutons (assets/app.js pour le menu du site, assets/m.js pour la version téléphone) : aucune page n'a besoin de l'inclure.
   L'événement « beforeinstallprompt » arrive très tôt : il est capturé par app.js (_pwaDeferredPrompt) ou m.js (window.__daInvite) et repris ici.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.DAInstall) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let invite = window.__daInvite || null;
  try { if (!invite && typeof _pwaDeferredPrompt !== 'undefined' && _pwaDeferredPrompt) invite = _pwaDeferredPrompt; } catch (e) { /* variable absente */ }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); invite = e; window.__daInvite = e; });
  window.addEventListener('appinstalled', () => { invite = null; window.__daInvite = null; });
  let precedentFocus = null;

  const estInstallee = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };

  function plateforme() {
    const ua = navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
    const android = /Android/i.test(ua);
    const edge = /Edg\//.test(ua), firefox = /Firefox|FxiOS/.test(ua), samsung = /SamsungBrowser/.test(ua);
    const chrome = /Chrome|CriOS/.test(ua) && !edge && !samsung;
    const safari = /Safari/.test(ua) && !/Chrome|CriOS|Edg|FxiOS|OPR|Firefox|SamsungBrowser/.test(ua);
    const os = ios ? 'ios' : android ? 'android' : /Windows/.test(ua) ? 'windows' : /Macintosh/.test(ua) ? 'mac' : /Linux|X11|CrOS/.test(ua) ? 'linux' : 'autre';
    const nav = firefox ? 'firefox' : edge ? 'edge' : samsung ? 'samsung' : chrome ? 'chrome' : safari ? 'safari' : 'autre';
    return { os, nav, mobile: ios || android };
  }

  /* Étapes d'installation selon l'appareil — texte simple, l'utilisateur n'a rien à deviner. */
  function guide(p) {
    if (p.os === 'ios') {
      return {
        titre: 'Sur votre iPhone ou iPad',
        etapes: p.nav === 'safari'
          ? ['Touchez le bouton <b>Partager</b> (le carré avec une flèche vers le haut, en bas de l\'écran).', 'Faites défiler le menu puis touchez <b>« Sur l\'écran d\'accueil »</b>.', 'Touchez <b>« Ajouter »</b> : l\'icône Diaspo\'Actif apparaît sur votre écran.']
          : ['Touchez le bouton <b>Partager</b> de votre navigateur (carré avec une flèche).', 'Touchez <b>« Sur l\'écran d\'accueil »</b>, puis <b>« Ajouter »</b>.', 'Si cette option n\'apparaît pas, ouvrez cette page dans <b>Safari</b> et recommencez.'],
      };
    }
    if (p.os === 'android') {
      return {
        titre: 'Sur votre téléphone Android',
        etapes: p.nav === 'firefox'
          ? ['Touchez le menu <b>⋮</b> de Firefox.', 'Touchez <b>« Installer »</b> (ou « Ajouter à l\'écran d\'accueil »).', 'Confirmez : l\'icône Diaspo\'Actif apparaît sur votre écran.']
          : ['Touchez le menu <b>⋮</b> de votre navigateur (en haut à droite).', 'Touchez <b>« Installer l\'application »</b> (ou « Ajouter à l\'écran d\'accueil »).', 'Confirmez : l\'icône Diaspo\'Actif apparaît sur votre écran.'],
      };
    }
    if (p.nav === 'chrome' || p.nav === 'edge') {
      return { titre: 'Sur votre ordinateur', etapes: ['Cliquez sur l\'icône <b>d\'installation</b> (un écran avec une flèche) à droite de la barre d\'adresse.', 'Ou ouvrez le menu <b>⋮</b> → <b>« ' + (p.nav === 'edge' ? 'Applications → Installer ce site comme application' : 'Enregistrer et partager → Installer Diaspo\'Actif') + ' »</b>.', 'Confirmez : Diaspo\'Actif s\'ouvre dans sa propre fenêtre et reçoit une icône sur votre bureau ou dans votre menu.'] };
    }
    if (p.nav === 'safari') {
      return { titre: 'Sur votre Mac', etapes: ['Dans la barre de menus de Safari, ouvrez <b>Fichier</b>.', 'Choisissez <b>« Ajouter au Dock »</b>.', 'Diaspo\'Actif apparaît dans votre Dock comme une application.'] };
    }
    return { titre: 'Sur votre ordinateur', etapes: ['Votre navigateur ne propose pas l\'installation automatique.', 'Téléchargez le <b>raccourci</b> ci-dessous, puis placez-le sur votre bureau : un double-clic ouvre Diaspo\'Actif.', 'Vous pouvez aussi utiliser Chrome ou Edge pour installer l\'application en un clic.'] };
  }

  /* Petit fichier raccourci (ordinateur) : double-clic → ouvre Diaspo'Actif dans le navigateur par défaut. */
  function fichierRaccourci(os) {
    const url = location.origin + '/';
    if (os === 'mac') return { nom: "Diaspo'Actif.webloc", mime: 'application/octet-stream', texte: '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>URL</key><string>' + url + '</string></dict></plist>\n' };
    if (os === 'linux') return { nom: 'DiaspoActif.desktop', mime: 'application/x-desktop', texte: '[Desktop Entry]\nVersion=1.0\nType=Link\nName=Diaspo\'Actif\nComment=La plateforme de la diaspora\nURL=' + url + '\nIcon=text-html\n' };
    return { nom: "Diaspo'Actif.url", mime: 'application/octet-stream', texte: '[InternetShortcut]\r\nURL=' + url + '\r\n' };
  }
  function telechargerRaccourci(os) {
    const f = fichierRaccourci(os);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([f.texte], { type: f.mime }));
    a.download = f.nom; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function css() {
    if (document.getElementById('dai-css')) return;
    const s = document.createElement('style'); s.id = 'dai-css';
    s.textContent = `
      .dai-voile{position:fixed;inset:0;background:rgba(10,20,40,.62);z-index:10060;display:flex;align-items:center;justify-content:center;padding:16px}
      .dai-box{background:#fff;color:#1f2937;border-radius:16px;width:100%;max-width:440px;max-height:92vh;overflow:auto;box-shadow:0 24px 70px rgba(0,0,0,.4);font-family:inherit}
      .dai-tete{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #eef0f4}
      .dai-box .dai-tete h2{margin:0;font-size:17px;color:#102A43}
      .dai-x{background:none;border:0;font-size:20px;line-height:1;cursor:pointer;color:#6b7280;padding:6px;border-radius:8px;min-width:36px;min-height:36px}
      .dai-x:hover{background:#f3f4f6}
      .dai-corps{padding:16px 18px 18px}
      .dai-logo{display:flex;align-items:center;gap:12px;margin-bottom:12px}
      .dai-logo img{width:56px;height:56px;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.18);background:#fff}
      .dai-logo p{margin:0;font-size:14px;line-height:1.4;color:#374151}
      .dai-h{margin:14px 0 6px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:#6b7280}
      .dai-etapes{margin:0 0 4px;padding-left:20px;font-size:14.5px;line-height:1.5;color:#1f2937}.dai-etapes li{margin-bottom:6px}
      .dai-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:46px;margin-top:10px;padding:10px 14px;border-radius:12px;border:1.5px solid #d1d5db;background:#fff;color:#1f2937;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;text-decoration:none;text-align:center}
      .dai-btn:hover{background:#f9fafb}.dai-btn:focus-visible,.dai-x:focus-visible{outline:3px solid #2563EB;outline-offset:2px}
      .dai-btn.pri{background:linear-gradient(135deg,#F59E0B,#E2A929);border-color:transparent;color:#1A2332}.dai-btn.pri:hover{filter:brightness(1.06)}
      .dai-note{font-size:12.5px;color:#6b7280;margin:8px 0 0}
      .dai-alerte{background:#fff7ed;border:1px solid #fdba74;color:#9a3412;border-radius:12px;padding:10px 14px;font-size:13.5px;line-height:1.45;margin:0 0 12px}
      .dai-ok{background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;border-radius:12px;padding:10px 14px;font-size:14px;margin-top:10px}
      @media (prefers-reduced-motion:no-preference){.dai-box{animation:dai-in .18s ease-out}@keyframes dai-in{from{transform:translateY(12px);opacity:0}to{opacity:1}}}`;
    document.head.appendChild(s);
  }

  function fermer() {
    const v = document.getElementById('dai-voile'); if (v) v.remove();
    document.removeEventListener('keydown', surTouche, true);
    document.body.style.overflow = document.body.dataset.daiOverflow || '';
    if (precedentFocus && precedentFocus.focus) { try { precedentFocus.focus(); } catch (e) { /* élément disparu */ } }
  }
  function surTouche(e) {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); return; }
    if (e.key !== 'Tab') return;
    const f = [...document.querySelectorAll('#dai-voile button, #dai-voile a[href]')].filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const premier = f[0], dernier = f[f.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  }

  /* Enregistre le service worker « réseau uniquement » (sw.js, déjà utilisé par le site) : certains navigateurs n'ouvrent l'installation en un clic qu'avec lui. */
  function preparer() { try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); } catch (e) { /* pas de service worker */ } }

  async function installerDirect() {
    const e = invite; invite = null; window.__daInvite = null;
    try {
      await e.prompt();
      const c = await e.userChoice;
      return !!(c && c.outcome);   // « accepted » ou « dismissed » : l'utilisateur a répondu dans la fenêtre du navigateur
    } catch (err) { return false; }
  }

  /* Navigateur intégré d'une application (WhatsApp, Facebook, Instagram, TikTok…) : il ne sait pas installer ; il faut ouvrir le site dans le vrai navigateur. */
  const navigateurIntegre = () => /FBAN|FBAV|FB_IAB|Instagram|TikTok|Snapchat|MicroMessenger|Line\/|; wv\)|GSA\//.test(navigator.userAgent || '');

  function ouvrirGuide() {
    css(); fermer();
    precedentFocus = document.activeElement;
    document.body.dataset.daiOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    const p = plateforme(), g = guide(p);
    const voile = document.createElement('div');
    voile.id = 'dai-voile'; voile.className = 'dai-voile';
    voile.innerHTML = `<div class="dai-box" role="dialog" aria-modal="true" aria-labelledby="dai-titre">
      <div class="dai-tete"><h2 id="dai-titre">Télécharger Diaspo'Actif</h2><button type="button" class="dai-x" id="dai-x" aria-label="Fermer">✕</button></div>
      <div class="dai-corps">
        <div class="dai-logo"><img src="/assets/logo.png" alt=""><p>Ajoutez Diaspo'Actif à l'écran d'accueil de votre téléphone ou au bureau de votre ordinateur : l'application s'ouvre en un geste, en plein écran.</p></div>
        ${navigateurIntegre() ? `<div class="dai-alerte">⚠️ Vous êtes dans le navigateur intégré d'une application (WhatsApp, Facebook…). Il ne peut pas installer Diaspo'Actif : touchez le menu <b>⋮</b> puis <b>« Ouvrir dans le navigateur »</b> (ou « Ouvrir avec Chrome »), puis recommencez.</div>` : ''}
        ${invite ? `<button type="button" class="dai-btn pri" id="dai-direct">📲 Installer maintenant</button><p class="dai-note">Votre navigateur va vous demander de confirmer : touchez « Installer ».</p>` : ''}
        <div class="dai-h">${invite ? 'Ou à la main' : esc(g.titre)}</div>
        ${invite ? `<div class="dai-h" style="margin-top:0;text-transform:none;letter-spacing:0;font-size:13px">${esc(g.titre)}</div>` : ''}
        <ol class="dai-etapes">${g.etapes.map(e => `<li>${e}</li>`).join('')}</ol>
        ${p.mobile ? '' : `<div class="dai-h">Ou un raccourci à poser sur le bureau</div><button type="button" class="dai-btn pri" id="dai-fichier">⬇️ Télécharger le raccourci</button><p class="dai-note">Un petit fichier « ${esc(fichierRaccourci(p.os).nom)} » : placez-le sur votre bureau, un double-clic ouvre Diaspo'Actif.</p>`}
        <div id="dai-msg" role="status"></div>
        <button type="button" class="dai-btn" id="dai-fermer">Fermer</button>
      </div></div>`;
    document.body.appendChild(voile);
    voile.addEventListener('mousedown', e => { if (e.target === voile) fermer(); });
    document.getElementById('dai-x').onclick = fermer;
    document.getElementById('dai-fermer').onclick = fermer;
    const f = document.getElementById('dai-fichier');
    if (f) f.onclick = () => { telechargerRaccourci(p.os); document.getElementById('dai-msg').innerHTML = '<div class="dai-ok">✅ Raccourci téléchargé : retrouvez-le dans vos téléchargements et déposez-le sur votre bureau.</div>'; };
    const direct = document.getElementById('dai-direct');
    if (direct) direct.onclick = async () => {
      direct.disabled = true; direct.textContent = 'Ouverture de la fenêtre du navigateur…';
      const e = invite; invite = null; window.__daInvite = null;   // une invite ne sert qu'une fois
      const m = document.getElementById('dai-msg');
      try {
        await e.prompt();
        const c = await e.userChoice;
        if (c && c.outcome === 'accepted') { direct.style.display = 'none'; m.innerHTML = '<div class="dai-ok">✅ Installation lancée : l\'icône Diaspo\'Actif arrive sur votre écran d\'accueil dans un instant.</div>'; }
        else { direct.style.display = 'none'; m.innerHTML = '<div class="dai-ok" style="background:#fff7ed;border-color:#fdba74;color:#9a3412">Vous avez fermé la fenêtre d\'installation. Pour recommencer, suivez les étapes ci-dessous.</div>'; }
      } catch (err) { direct.style.display = 'none'; m.innerHTML = '<div class="dai-ok" style="background:#fff7ed;border-color:#fdba74;color:#9a3412">L\'installation en un geste n\'est pas disponible ici. Suivez les étapes ci-dessous.</div>'; }
    };
    document.addEventListener('keydown', surTouche, true);
    (direct || f || document.getElementById('dai-fermer')).focus();
  }

  /* Point d'entrée des boutons : installation native en un clic si le navigateur l'offre, sinon le guide. */
  async function ouvrir() {
    preparer();
    if (estInstallee()) { css(); ouvrirGuide(); document.getElementById('dai-msg').innerHTML = '<div class="dai-ok">Diaspo\'Actif est déjà installée sur cet appareil.</div>'; return; }
    ouvrirGuide();   // toujours une fenêtre visible (l'installation en un geste s'y déclenche par un bouton : jamais de toucher « sans effet »)
  }

  window.DAInstall = { ouvrir, estInstallee, plateforme };
})();
