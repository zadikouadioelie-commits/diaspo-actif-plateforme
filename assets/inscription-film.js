/* ═══════════════════════════════════════════════════════════════════════════
   FILM « CRÉER SON COMPTE SUR DIASPO'ACTIF » (2026-10-09, demande explicite)
   Motion design de ~55 s : voix (assets/media/inscription-voix.mp3, voix « Perle » ElevenLabs), musique douce
   générée par code (Web Audio), sous-titres synchronisés, 6 scènes. Scénario : motion/scenario-inscription.md.

   PRINCIPE : tout l'écran est une FONCTION DU TEMPS (rendre(a)). Pas de keyframes CSS : on peut donc mettre en pause,
   avancer, reculer ou sauter à n'importe quel instant sans jamais se désynchroniser de la voix, qui sert d'horloge.
   Les temps ci-dessous (en secondes d'AUDIO) viennent de la mesure des silences de la narration réelle.

   Usage : InscriptionFilm.ouvrir()   — à appeler depuis un clic (le navigateur n'autorise le son qu'après un geste).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.InscriptionFilm) return;

  const VOIX = 'assets/media/inscription-voix.mp3?v=1';
  const LEAD = 1.5;          // silence musical avant la voix
  const FIN = 54.6;          // durée totale du film (temps film)
  const W = 1280, H = 720;   // scène virtuelle, mise à l'échelle par CSS

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const E = {
    out: t => 1 - Math.pow(1 - t, 3),
    inout: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    lin: t => t,
  };
  /* progression de a entre a0 et a1, adoucie par e */
  const P = (a, a0, a1, e) => (e || E.out)(clamp((a - a0) / (a1 - a0)));
  const tape = (txt, a, a0, a1) => txt.slice(0, Math.round(txt.length * clamp((a - a0) / (a1 - a0))));
  const fmt = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  /* Sous-titres (temps audio) — limites mesurées sur la voix réelle. */
  const CAPS = [
    [0.0, 7.7, "Bienvenue sur Diaspo'Actif, la plateforme mondiale qui connecte les diasporas, valorise les talents et accélère le développement des territoires."],
    [8.22, 11.82, "Créer votre compte prend quelques minutes."],
    [12.12, 14.84, "Choisissez d'abord votre profil : utilisateur, initiative ou collectivité."],
    [15.22, 19.12, "Indiquez vos origines, votre pays de résidence et votre domaine d'activité."],
    [19.48, 24.52, "Ajoutez une photo et une courte biographie : elles rendent votre profil humain et facilitent les rencontres."],
    [24.96, 28.12, "Confirmez votre adresse e-mail, puis complétez votre profil public."],
    [28.54, 31.32, "Une jauge suit votre progression, étape par étape."],
    [31.84, 40.54, "Votre profil est prêt : explorez l'annuaire, rejoignez des événements, soutenez des projets, ouvrez votre boutique et échangez avec la communauté."],
    [40.9, 43.04, "Diaspo'Actif : rejoignez le réseau, et passez à l'action."],
    [43.36, 45.12, "Créez votre compte dès maintenant."],
  ];
  /* Bornes de scènes (temps audio) — sert aussi au mode « réduire les animations » (image fixe par scène). */
  const SCENES = [[-LEAD, 8.0], [8.0, 15.0], [15.0, 24.7], [24.7, 31.6], [31.6, 40.7], [40.7, FIN - LEAD]];

  const CSS = `
.fi-ov{position:fixed;inset:0;z-index:100000;background:rgba(3,10,26,.9);display:flex;align-items:center;justify-content:center;padding:12px;animation:fi-in .25s ease-out;font-family:'Segoe UI',system-ui,-apple-system,Roboto,sans-serif}
@keyframes fi-in{from{opacity:0}to{opacity:1}}
.fi-box{width:min(960px,100%);display:flex;flex-direction:column;gap:10px;max-height:100%}
.fi-top{display:flex;justify-content:space-between;align-items:center;color:#fff;font-size:13px;gap:8px}
.fi-titre{font-weight:800;letter-spacing:.06em;color:#F2C94C}
.fi-btn{border:none!important;border-radius:999px!important;padding:8px 14px!important;min-height:0!important;height:auto!important;width:auto!important;line-height:1.2!important;background:rgba(255,255,255,.14);color:#fff!important;font-weight:700!important;font-size:13px!important;cursor:pointer;font-family:inherit!important;white-space:nowrap}
.fi-btn:hover,.fi-btn:focus-visible{background:rgba(255,255,255,.28);outline:none}
.fi-btn.or{background:#F26422!important}.fi-btn.or:hover{background:#d9541a!important}
.fi-win{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:16px;background:#0B2A5B;box-shadow:0 20px 60px rgba(0,0,0,.55),0 0 0 2px rgba(226,169,41,.55)}
.fi-stage{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;overflow:hidden;color:#fff}
.fi-stage *{box-sizing:border-box}
.fi-bg{position:absolute;inset:0;background:radial-gradient(90% 75% at 12% 0%,rgba(60,130,215,.75) 0%,rgba(60,130,215,0) 58%),radial-gradient(70% 60% at 100% 100%,rgba(226,169,41,.38) 0%,rgba(226,169,41,0) 62%),linear-gradient(160deg,#0f3a7c 0%,#0B2A5B 46%,#061633 100%)}
.fi-blob{position:absolute;width:620px;height:620px;border-radius:50%;filter:blur(80px);opacity:.34}
.fi-blob.b1{background:#3b8be8;left:-180px;top:-220px}.fi-blob.b2{background:#E2A929;right:-240px;bottom:-300px;opacity:.26}
.fi-part{position:absolute;left:0;top:0;width:5px;height:5px;border-radius:50%;background:#F8DA7A}
.fi-abs{position:absolute;left:0;top:0;will-change:transform,opacity}
.fi-globe{position:absolute;left:0;top:0;overflow:visible}
.gold{background:linear-gradient(180deg,#FDEBA8 0%,#E8B22E 52%,#B67E14 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
.fi-welc{font-family:'Cinzel','Georgia','Times New Roman',serif;font-size:62px;font-weight:800;letter-spacing:.2em;white-space:nowrap;text-shadow:0 4px 22px rgba(0,0,0,.35)}
.fi-tag{font-family:'Cinzel','Georgia',serif;font-size:21px;letter-spacing:.34em;color:#F2C94C;white-space:nowrap;font-weight:600}
.fi-logo{width:350px;height:350px;border-radius:50%;filter:drop-shadow(0 12px 30px rgba(0,0,0,.5)) drop-shadow(0 0 28px rgba(248,218,122,.45))}
.fi-head{display:flex;align-items:center;gap:12px;font-size:28px;font-weight:800;white-space:nowrap}
.fi-head img{width:56px;height:56px;border-radius:50%;object-fit:contain;background:#fff;box-shadow:0 0 0 3px #E2A929}
.fi-head i{font-style:normal;color:#F26422}
.fi-type{width:300px;height:330px;border-radius:26px;padding:20px 22px;background:linear-gradient(165deg,#15428a,#0a2556);border:3px solid #E2A929;text-align:center;box-shadow:0 14px 40px rgba(0,0,0,.4)}
.fi-ring{width:124px;height:124px;margin:10px auto 0;border-radius:50%;border:3px solid #E2A929;background:radial-gradient(circle,#1d57ad,#0B2A5B);display:flex;align-items:center;justify-content:center;font-size:62px;box-shadow:0 0 0 6px rgba(226,169,41,.18)}
.fi-type h4{margin:16px 0 8px;font-family:'Cinzel','Georgia',serif;font-size:32px;font-weight:800;letter-spacing:.04em}
.fi-type p{margin:0;font-size:19px;color:#cfe0ff;line-height:1.35}
.fi-card{border-radius:26px;border:5px solid transparent;background:linear-gradient(160deg,#ffffff,#eaf2ff) padding-box,linear-gradient(135deg,#FDEBA8,#E2A929 50%,#B67E14) border-box;color:#0B2A5B;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.fi-form{width:820px;height:420px;padding:26px 32px}
.fi-form h5{margin:0 0 18px;font-size:26px;font-weight:800;display:flex;align-items:center;gap:10px;font-family:'Cinzel','Georgia',serif;letter-spacing:.03em}
.fi-form h5 span{font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;font-weight:700;background:#fff1c9;color:#8a5a00;border-radius:999px;padding:5px 12px;letter-spacing:0;border:2px solid #E2A929}
.fi-cols{display:flex;gap:30px}
.fi-col{flex:1;min-width:0}
.fi-fl{margin-bottom:14px}
.fi-fl label{display:block;font-size:15px;font-weight:700;color:#4b6a93;margin-bottom:5px}
.fi-fl .v{height:50px;border-radius:12px;border:2px solid #c7d7ee;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font-size:21px;font-weight:600}
.fi-fl .ok{color:#16a34a;font-weight:800;font-size:24px}
.fi-av{width:116px;height:116px;border-radius:50%;border:4px dashed #9db8dd;display:flex;align-items:center;justify-content:center;font-size:44px;color:#9db8dd;margin:0 auto 14px;background:#fff;position:relative}
.fi-av.set{border:4px solid #fff;box-shadow:0 0 0 5px #0B2A5B,0 0 0 9px #E2A929}
.fi-av .ph{position:absolute;inset:0;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 50% 38%,#f2c9a0 0 22%,transparent 23%),radial-gradient(ellipse at 50% 100%,#1565C0 0 46%,transparent 47%),linear-gradient(160deg,#7cc0ff,#1565C0)}
.fi-bio{height:150px;border-radius:12px;border:2px solid #c7d7ee;background:#fff;padding:10px 12px;font-size:17px;line-height:1.4;font-weight:500;color:#1e3a5f}
.fi-bio small{display:block;font-size:13px;font-weight:800;color:#8a5a00;margin-bottom:4px;letter-spacing:.06em}
.fi-prof{width:610px;height:430px;padding:24px 30px}
.fi-prof .id{display:flex;align-items:center;gap:16px;margin-bottom:16px}
.fi-prof .id .a{width:68px;height:68px;border-radius:50%;box-shadow:0 0 0 3px #fff,0 0 0 6px #0B2A5B,0 0 0 9px #E2A929;background:radial-gradient(circle at 50% 38%,#f2c9a0 0 22%,transparent 23%),radial-gradient(ellipse at 50% 100%,#1565C0 0 46%,transparent 47%),linear-gradient(160deg,#7cc0ff,#1565C0)}
.fi-prof .id b{font-size:26px;display:block;font-family:'Cinzel','Georgia',serif}.fi-prof .id span{font-size:16px;color:#4b6a93;font-weight:600}
.fi-gt{display:flex;justify-content:space-between;font-weight:800;font-size:19px;margin-bottom:8px}
.fi-bar{height:20px;border-radius:999px;background:#e6edf8;overflow:hidden;border:2px solid #d4e3fb}
.fi-bar i{display:block;height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#E2A929,#FDEBA8 60%,#E2A929)}
.fi-ck{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;margin-top:20px}
.fi-ck div{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:12px;background:#f1f6ff;border:2px solid #d4e3fb;font-size:18px;font-weight:700;color:#7f97b8}
.fi-ck div.on{background:#ecfdf5;border-color:#86efac;color:#15803d}
.fi-ck div b{width:26px;height:26px;border-radius:50%;border:2px solid #b7c9e4;display:flex;align-items:center;justify-content:center;font-size:15px;color:transparent;flex:none}
.fi-ck div.on b{background:#16a34a;border-color:#16a34a;color:#fff}
.fi-env{width:240px;height:190px}
.fi-envl{font-size:22px;font-weight:800;text-align:center;color:#FDEBA8;margin-top:10px;white-space:nowrap;font-family:'Cinzel','Georgia',serif}
.fi-past{width:170px;height:170px;border-radius:50%;background:radial-gradient(circle at 50% 38%,#f2c9a0 0 20%,transparent 21%),radial-gradient(ellipse at 50% 100%,#1565C0 0 46%,transparent 47%),linear-gradient(160deg,#7cc0ff,#1565C0);box-shadow:0 0 0 6px #fff,0 0 0 11px #0B2A5B,0 0 0 16px #E2A929,0 0 70px rgba(248,218,122,.6)}
.fi-pn{font-size:28px;font-weight:800;text-align:center;white-space:nowrap;font-family:'Cinzel','Georgia',serif}
.fi-sat{width:200px;padding:14px 10px 16px;border-radius:22px;background:linear-gradient(165deg,#15428a,#0a2556);border:3px solid #E2A929;text-align:center;box-shadow:0 12px 30px rgba(0,0,0,.4)}
.fi-sat .e{width:76px;height:76px;margin:0 auto;border-radius:50%;border:3px solid #E2A929;background:radial-gradient(circle,#1d57ad,#0B2A5B);display:flex;align-items:center;justify-content:center;font-size:38px}
.fi-sat b{display:block;font-size:22px;margin-top:8px;font-family:'Cinzel','Georgia',serif;letter-spacing:.03em}
.fi-big{font-family:'Cinzel','Georgia',serif;font-size:64px;font-weight:800;text-align:center;white-space:nowrap;letter-spacing:.02em;text-shadow:0 4px 30px rgba(0,0,0,.45)}
.fi-script{font-family:'Caveat','Segoe Script','Brush Script MT',cursive;font-size:50px;font-weight:700;color:#fff;white-space:nowrap;text-align:center;text-shadow:0 3px 18px rgba(0,0,0,.4)}
.fi-sub{font-size:28px;color:#dbe8ff;text-align:center;white-space:nowrap}
.fi-cta{display:inline-block;padding:18px 44px;border-radius:999px;background:linear-gradient(135deg,#F26422,#ff8a4c);color:#fff;font-size:30px;font-weight:800;box-shadow:0 12px 40px rgba(242,100,34,.55),0 0 0 4px rgba(253,235,168,.7);white-space:nowrap}
.fi-url{font-family:'Cinzel','Georgia',serif;font-size:24px;letter-spacing:.2em;color:#F2C94C;font-weight:700;white-space:nowrap}
.fi-motto{font-family:'Caveat','Segoe Script','Brush Script MT',cursive;font-size:34px;font-weight:700;color:#FDEBA8;white-space:nowrap}
.fi-cap{min-height:62px;display:grid;place-items:center;text-align:center;color:#fff;font-size:clamp(15px,2.3vw,21px);line-height:1.4;padding:8px 14px;border-radius:12px;background:rgba(3,10,26,.55);border-top:2px solid rgba(226,169,41,.7)}
.fi-cap p{margin:0;max-width:100%}.fi-cap span{opacity:.5;transition:opacity .12s}.fi-cap span.on{opacity:1}
.fi-ctl{display:flex;align-items:center;gap:10px;color:#fff;font-size:13px}
.fi-ctl .t{min-width:78px;text-align:center;font-variant-numeric:tabular-nums}
.fi-prog{position:relative;flex:1;min-width:0;height:26px;cursor:pointer;touch-action:none;display:flex;align-items:center}
.fi-prog:before{content:"";position:absolute;left:0;right:0;height:6px;border-radius:3px;background:rgba(255,255,255,.35)}
.fi-prog i{position:absolute;left:0;height:6px;border-radius:3px;background:linear-gradient(90deg,#E2A929,#F26422);width:0}
.fi-prog b{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#F26422;border:2px solid #fff;left:0}
.fi-prog:focus-visible{outline:2px solid #fff;outline-offset:2px}
@media (max-width:640px){.fi-titre{display:none!important}.fi-top{justify-content:flex-end}}
@media (prefers-reduced-motion:reduce){.fi-ov{animation:none}}
`;

  /* ── Formes dessinées : Afrique stylisée (lissée), lauriers ── */
  const AFR_PTS = [[60, 30], [100, 22], [140, 28], [170, 38], [200, 40], [215, 55], [225, 80], [238, 102], [252, 112], [245, 132], [225, 150], [215, 175], [205, 205], [190, 235], [170, 250], [150, 255], [130, 240], [118, 215], [115, 190], [105, 170], [85, 160], [60, 160], [40, 150], [28, 135], [18, 110], [22, 80], [40, 55]].map(p => [p[0] - 130, p[1] - 140]);
  function lisse(pts) {
    const n = pts.length; let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d + 'Z';
  }
  function laurier(miroir) {
    /* Branche de laurier : une tige courbe et des paires de feuilles dorées le long de la tige. */
    const P = t => { const u = 1 - t; return [u * u * 150 + 2 * u * t * 40 + t * t * 70, u * u * 300 + 2 * u * t * 150 + t * t * 30]; };
    const feuilles = [];
    for (let i = 1; i <= 9; i++) {
      const t = i / 10, p = P(t), q = P(t + 0.02), ang = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI;
      const s = 1.15 - t * 0.45;
      [-42, 42].forEach(off => feuilles.push(`<ellipse cx="${(p[0] + (off < 0 ? -1 : 1) * 6).toFixed(1)}" cy="${p[1].toFixed(1)}" rx="${(30 * s).toFixed(1)}" ry="${(10.5 * s).toFixed(1)}" transform="rotate(${(ang + off).toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}) translate(${(26 * s).toFixed(1)} 0)" fill="url(#fiGold)" stroke="#8a5a00" stroke-opacity=".45" stroke-width="1"/>`));
    }
    const s0 = P(0), s1 = P(1);
    return `<svg width="220" height="320" viewBox="0 0 220 320" aria-hidden="true" style="${miroir ? 'transform:scaleX(-1);' : ''}overflow:visible"><path d="M${s0[0]} ${s0[1]} Q40 150 ${s1[0]} ${s1[1]}" fill="none" stroke="#C99A2E" stroke-width="4" stroke-linecap="round"/>${feuilles.join('')}</svg>`;
  }

  /* ── Construction du décor (une seule fois par ouverture) ── */
  const STAGE_HTML = `
<div class="fi-bg"></div>
<div class="fi-blob b1" data-r="b1"></div><div class="fi-blob b2" data-r="b2"></div>
<div data-r="parts"></div>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="fiGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FDEBA8"/><stop offset=".5" stop-color="#E8B22E"/><stop offset="1" stop-color="#B67E14"/></linearGradient>
</defs></svg>
<svg class="fi-globe" data-r="swoosh" viewBox="0 0 1280 720" width="1280" height="720" aria-hidden="true"><path d="M1280 0 L1280 170 C1210 100 1130 40 1040 0 Z" fill="url(#fiGold)" opacity=".95"/><path d="M1280 0 L1280 120 C1225 70 1165 28 1100 0 Z" fill="#0B2A5B" opacity=".9"/></svg>
<svg class="fi-globe" data-r="rub" viewBox="0 0 1280 720" width="1280" height="720" aria-hidden="true">
  <path d="M0 650 C 300 612, 640 700, 1280 640 L1280 720 L0 720 Z" fill="#061633" opacity=".94"/>
  <path d="M0 650 C 300 612, 640 700, 1280 640" fill="none" stroke="url(#fiGold)" stroke-width="5"/>
  <path d="M0 662 C 300 624, 640 712, 1280 652" fill="none" stroke="#1B7F3B" stroke-width="3" opacity=".9"/>
</svg>
<div class="fi-abs fi-motto" data-r="motto">Rassembler · Mobiliser · Impacter</div>
<svg class="fi-globe" data-r="globe" viewBox="-200 -200 400 400" width="400" height="400" aria-hidden="true">
  <defs><radialGradient id="fiGl" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#3a8be8" stop-opacity=".6"/><stop offset="1" stop-color="#0b2a55" stop-opacity=".2"/></radialGradient>
    <filter id="fiGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <circle r="150" fill="url(#fiGl)" stroke="#8cc4ff" stroke-width="2.5"/>
  <g data-r="mer" fill="none" stroke="#8cc4ff" stroke-width="1.3" stroke-opacity=".4"></g>
  <g data-r="par" stroke="#8cc4ff" stroke-width="1.3" stroke-opacity=".35"></g>
  <path d="${lisse(AFR_PTS)}" fill="url(#fiGold)" fill-opacity=".92" stroke="#FFF6D6" stroke-opacity=".7" stroke-width="2" filter="url(#fiGlow)" data-r="afr"/>
  <g data-r="arcs" fill="none" stroke-linecap="round"></g>
  <g data-r="nodes"></g>
</svg>
<img class="fi-abs fi-logo" data-r="logo" src="assets/media/logo-film.webp" alt="">
<div class="fi-abs fi-welc gold" data-r="welc">BIENVENUE</div>
<div class="fi-abs fi-tag" data-r="tag">PLATEFORME · RÉSEAU · OPPORTUNITÉS</div>
<div class="fi-abs fi-head" data-r="head"><img src="assets/media/logo-film.webp" alt=""><span>Diaspo<i>'</i>Actif</span></div>

<div class="fi-abs fi-type" data-r="c0"><div class="fi-ring">👤</div><h4>Utilisateur</h4><p>Je rejoins le réseau en tant que membre</p></div>
<div class="fi-abs fi-type" data-r="c1"><div class="fi-ring">🤝</div><h4>Initiative</h4><p>Mon association, mon entreprise, mon projet</p></div>
<div class="fi-abs fi-type" data-r="c2"><div class="fi-ring">🏛️</div><h4>Collectivité</h4><p>Mon institution, mon territoire</p></div>

<div class="fi-abs fi-card fi-form" data-r="form">
  <h5>Créer mon compte <span>Utilisateur</span></h5>
  <div class="fi-cols">
    <div class="fi-col">
      <div class="fi-fl"><label>Pays d'origine</label><div class="v"><span data-r="v0"></span><span class="ok" data-r="k0">✓</span></div></div>
      <div class="fi-fl"><label>Pays de résidence</label><div class="v"><span data-r="v1"></span><span class="ok" data-r="k1">✓</span></div></div>
      <div class="fi-fl"><label>Domaine d'activité</label><div class="v"><span data-r="v2"></span><span class="ok" data-r="k2">✓</span></div></div>
    </div>
    <div class="fi-col">
      <div class="fi-av" data-r="av">📷<div class="ph" data-r="ph"></div></div>
      <div class="fi-bio"><small>BIOGRAPHIE</small><span data-r="bio"></span></div>
    </div>
  </div>
</div>

<div class="fi-abs" data-r="env"><svg class="fi-env" viewBox="0 0 240 190" aria-hidden="true">
  <rect x="10" y="50" width="220" height="130" rx="14" fill="#eef4ff" stroke="#E2A929" stroke-width="4"/>
  <path d="M10 64 L120 140 L230 64" fill="none" stroke="#9db8dd" stroke-width="4"/>
  <g data-r="flap" style="transform-origin:120px 50px"><path d="M10 50 L120 120 L230 50 Z" fill="#dfeafc" stroke="#E2A929" stroke-width="4"/></g>
  <circle data-r="envok" cx="198" cy="52" r="28" fill="#16a34a" stroke="#fff" stroke-width="4"/><path data-r="envck" d="M184 52 L194 63 L214 40" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg><div class="fi-envl" data-r="envl">E-mail confirmé</div></div>

<div class="fi-abs fi-card fi-prof" data-r="prof">
  <div class="id"><div class="a"></div><div><b>Aminata K.</b><span>Utilisateur · Lille, France</span></div></div>
  <div class="fi-gt"><span>État de votre profil</span><span data-r="pct">17 %</span></div>
  <div class="fi-bar"><i data-r="bar"></i></div>
  <div class="fi-ck" data-r="ck">
    <div data-k="res"><b>✓</b>Résidence</div><div data-k="pho"><b>✓</b>Photo</div>
    <div data-k="bio"><b>✓</b>Biographie</div><div data-k="com"><b>✓</b>Compétences</div>
    <div data-k="ori"><b>✓</b>Origine</div><div data-k="dom"><b>✓</b>Domaine d'activité</div>
  </div>
</div>
<div data-r="burst"></div>

<svg class="fi-globe" data-r="lines" viewBox="0 0 1280 720" width="1280" height="720" aria-hidden="true" style="left:0;top:0"></svg>
<div class="fi-abs fi-past" data-r="past"></div><div class="fi-abs fi-pn" data-r="pn">Aminata K.</div>
<div class="fi-abs fi-sat" data-r="s0"><div class="e">📖</div><b>Annuaire</b></div>
<div class="fi-abs fi-sat" data-r="s1"><div class="e">📅</div><b>Événements</b></div>
<div class="fi-abs fi-sat" data-r="s2"><div class="e">💚</div><b>Soutenir</b></div>
<div class="fi-abs fi-sat" data-r="s3"><div class="e">🛍️</div><b>Boutique</b></div>
<div class="fi-abs fi-sat" data-r="s4"><div class="e">💬</div><b>Communauté</b></div>

<div class="fi-abs" data-r="lauG">${laurier(false)}</div><div class="fi-abs" data-r="lauD">${laurier(true)}</div>
<div class="fi-abs fi-big" data-r="t1">Rejoignez le <span class="gold">réseau</span></div>
<div class="fi-abs fi-script" data-r="t0">Ensemble, révélons les talents de notre diaspora !</div>
<div class="fi-abs fi-sub" data-r="t2">Créez votre compte dès maintenant</div>
<div class="fi-abs" data-r="t3"><span class="fi-cta">Créer mon compte</span></div>
<div class="fi-abs fi-url" data-r="t4">DIASPOACTIF.COM</div>
<div class="fi-abs" data-r="fade" style="width:${W}px;height:${H}px;background:#061633;opacity:0"></div>`;

  /* Globe : réseau de points sur l'Afrique et l'Europe, liaisons (coordonnées dans le globe, centre 0,0). */
  const NODES = [[-70, -105], [65, -92], [-108, -58], [70, -25], [-80, 10], [-50, 12], [-15, 45], [55, 25], [20, 95], [-20, -135], [-45, -128]];
  const LIENS = [[9, 0], [9, 2], [9, 4], [9, 6], [9, 1], [10, 5], [10, 7], [4, 5], [6, 8], [3, 1], [7, 6]];

  /* Effets sonores : [temps audio, type]. */
  const SFX = [[16.5, 'clic'], [17.6, 'clic'], [18.9, 'clic'], [20.55, 'pop'], [27.4, 'pop'], [28.7, 'tic'], [29.0, 'tic'], [29.5, 'tic'], [30.0, 'tic'], [30.5, 'tic'], [31.0, 'tic'], [31.05, 'chime'],
    [33.95, 'pop'], [35.3, 'pop'], [37.0, 'pop'], [38.4, 'pop'], [39.9, 'pop'], [43.4, 'chime']];

  /* ── État du film ── */
  let ov = null, R = {}, audio = null, ctx = null, master = null, rafId = 0, tickId = 0;
  let enCours = false, tFilm = 0, tMur = 0, muet = false, prochainPas = 0, capIdx = -1, dernierA = -9, finie = false, calme = false;
  let capsEls = [];

  /* ── Musique générée : accords D – A – Bm – G, 96 pulsations/min, nappe + basse + arpège doux ── */
  const PAS = 60 / 96 / 2;
  const ACCORDS = [
    { b: 73.42, n: [293.66, 369.99, 440.0] }, { b: 55.0, n: [220.0, 277.18, 329.63] },
    { b: 61.74, n: [246.94, 293.66, 369.99] }, { b: 49.0, n: [196.0, 246.94, 293.66] },
  ];
  const ARP = [0, 1, 2, 1, 0, 1, 2, 1];
  function volMusique(a) {
    if (a < 0) return 0.95;                                  // introduction musicale
    if (a < 45.3) return a > 31.5 && a < 41 ? 0.5 : 0.34;    // sous la voix, léger crescendo à la scène 5
    const k = clamp((a - 45.3) / 1.2);                       // la voix s'arrête : la musique s'ouvre
    const fin = 1 - clamp((a - 51.6) / 1.5);
    return lerp(0.34, 0.95, k) * fin;
  }
  function note(f, quand, dur, type, gain, att, filtre) {
    const o = ctx.createOscillator(), g = ctx.createGain(), flt = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = f; flt.type = 'lowpass'; flt.frequency.value = filtre || 1800;
    g.gain.setValueAtTime(0.0001, quand);
    g.gain.exponentialRampToValueAtTime(gain, quand + att);
    g.gain.exponentialRampToValueAtTime(0.0001, quand + dur);
    o.connect(flt); flt.connect(g); g.connect(master);
    o.start(quand); o.stop(quand + dur + 0.05);
  }
  function planifierMusique(a) {
    if (!ctx || muet) return;
    const now = ctx.currentTime;
    while (prochainPas < a + 0.3) {
      const quand = now + Math.max(0, prochainPas - a);
      const n = Math.round(prochainPas / PAS);
      const idx = ((n % 32) + 32) % 32, ac = ACCORDS[Math.floor(idx / 8) % 4], p = idx % 8;
      if (p === 0) {
        ac.n.forEach(f => note(f, quand, PAS * 8.4, 'triangle', 0.05, 0.7, 1300));
        note(ac.b, quand, PAS * 7.5, 'sine', 0.13, 0.15, 400);
      }
      note(ac.n[ARP[p]] * 2, quand, PAS * 2.2, 'sine', p % 2 ? 0.035 : 0.06, 0.012, 2600);
      prochainPas += PAS;
    }
    master.gain.setTargetAtTime(volMusique(a) * 0.5, now, 0.2);
  }
  function bruit(type) {
    if (!ctx || muet) return;
    const now = ctx.currentTime;
    if (type === 'clic') note(1180, now, 0.12, 'sine', 0.16, 0.004, 4000);
    else if (type === 'tic') note(880, now, 0.16, 'triangle', 0.14, 0.004, 3500);
    else if (type === 'pop') { note(520, now, 0.2, 'sine', 0.16, 0.006, 3000); note(780, now + 0.05, 0.2, 'sine', 0.1, 0.006, 3000); }
    else if (type === 'chime') [784, 988, 1319].forEach((f, i) => note(f, now + i * 0.09, 0.9, 'sine', 0.16, 0.01, 5000));
  }

  /* ── Rendu : tout l'écran en fonction du temps audio a ── */
  const place = (el, x, y, s, op, rot) => {
    if (!el) return;
    el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${s == null ? 1 : s})${rot ? ` rotate(${rot}deg)` : ''}`;
    el.style.opacity = op == null ? 1 : clamp(op);
  };
  const vue = (lat, lon, rot, r) => {
    const la = lat * Math.PI / 180, lo = lon * Math.PI / 180 - rot;
    return { x: r * Math.cos(la) * Math.sin(lo), y: -r * Math.sin(la), z: Math.cos(la) * Math.cos(lo) };
  };

  function rendre(av) {
    /* « Réduire les animations » : on montre l'état FINAL de la scène en cours (images fixes), la voix continue. */
    let a = av;
    if (calme) { const s = SCENES.find(x => av >= x[0] && av < x[1]) || SCENES[SCENES.length - 1]; a = s[1] - 0.02; }

    /* Fond vivant + décor fixe (ruban de pied avec la devise, angle doré) */
    R.b1.style.transform = `translate(${Math.sin(a * .2) * 60}px,${Math.cos(a * .17) * 40}px)`;
    R.b2.style.transform = `translate(${Math.cos(a * .15) * -70}px,${Math.sin(a * .21) * -50}px)`;
    R.pa.forEach((e, i) => {
      const sx = (i * 197.3) % W, sy = (i * 83.7) % H, v = 8 + (i % 5) * 4;
      e.el.style.transform = `translate(${(sx + Math.sin(a * .3 + i) * 30) % W}px,${((sy - a * v) % H + H) % H}px)`;
      e.el.style.opacity = .25 + .35 * Math.abs(Math.sin(a * .8 + i));
    });
    const dec = P(a, -1.2, -0.3);
    R.rub.style.opacity = dec; R.swoosh.style.opacity = dec * 0.9;
    place(R.motto, 640, 690, 1, dec * 0.95);

    /* Globe-réseau sur l'Afrique : à gauche → coin → fond de la scène finale */
    const g1 = P(a, 6.7, 8.0, E.inout), g2 = P(a, 39.9, 41.4, E.inout);
    const gx = a < 20 ? lerp(430, 92, g1) : lerp(92, 640, g2);
    const gy = a < 20 ? lerp(350, 78, g1) : lerp(78, 330, g2);
    const gs = a < 20 ? lerp(1.15, 0.27, g1) : lerp(0.27, 1.4, g2);
    const gop = a < 20 ? 1 : lerp(1, 0.45, g2);
    place(R.globe, gx, gy, gs, gop * P(a, -1.2, -0.2));
    const rot = a * 0.33, rr = 150;
    R.mer.forEach((m, i) => { m.setAttribute('rx', Math.abs(rr * Math.sin(i * Math.PI / 6 - rot * 0.5)).toFixed(1)); });
    R.afr.setAttribute('transform', `scale(${(1 + 0.012 * Math.sin(a * 1.1)).toFixed(4)})`);
    R.nd.forEach((c, i) => {
      const n = NODES[i], ap = P(a, 0.2 + i * 0.12, 0.8 + i * 0.12, E.back);
      c.setAttribute('cx', n[0]); c.setAttribute('cy', n[1]);
      c.setAttribute('r', (5.5 * ap * (1 + 0.28 * Math.sin(a * 2.4 + i))).toFixed(1));
      c.setAttribute('fill-opacity', clamp(ap).toFixed(2));
    });
    R.ar.forEach((pt, k) => {
      const A = NODES[LIENS[k][0]], B = NODES[LIENS[k][1]], f = 1.3;
      pt.setAttribute('d', `M${A[0]} ${A[1]} Q${(((A[0] + B[0]) / 2) * f).toFixed(1)} ${(((A[1] + B[1]) / 2) * f).toFixed(1)} ${B[0]} ${B[1]}`);
      pt.setAttribute('stroke-dashoffset', (1 - P(a, 0.9 + k * 0.28, 1.9 + k * 0.28, E.inout)).toFixed(3));
      pt.setAttribute('stroke-opacity', '0.92');
    });

    /* Scène 1 : bienvenue, logo en grand, devise de la plateforme */
    place(R.welc, 640, 98, 1, P(a, 0.2, 1.2) * (1 - P(a, 6.6, 7.4)));
    place(R.logo, 850, 345, lerp(0.55, 1, P(a, 2.0, 3.4, E.back)), P(a, 2.0, 3.0) * (1 - P(a, 6.6, 7.4)));
    place(R.tag, 640, 585, 1, P(a, 4.0, 5.0) * (1 - P(a, 6.6, 7.4)));
    place(R.head, 300, 78, 1, P(a, 7.4, 8.4) * (1 - P(a, 40.0, 40.8)));

    /* Scène 2 : trois profils */
    const enter = [8.3, 8.6, 8.9], cue = [13.35, 13.83, 14.36];
    const xs = [330, 640, 950];
    [0, 1, 2].forEach(i => {
      const e = P(a, enter[i], enter[i] + 0.7, E.back);
      const lum = P(a, cue[i] - 0.25, cue[i] + 0.15) * (1 - P(a, cue[i] + 0.45, cue[i] + 0.75));
      let op = P(a, enter[i], enter[i] + 0.5), x = xs[i], s = lerp(0.9, 1, e) * (1 + 0.07 * lum), y = lerp(470, 370, e);
      if (i !== 0) { const go = P(a, 14.6, 15.4, E.inout); op *= 1 - go; x += (i === 1 ? 60 : -60) * go; }
      else { const up = P(a, 14.6, 15.4, E.inout); x = lerp(x, 640, up); s *= 1 + 0.25 * up; op *= 1 - P(a, 15.2, 15.7); }
      const el = R['c' + i];
      place(el, x, y, s, a < 8.2 || a > 15.8 ? 0 : op);
      el.style.borderColor = lum > 0.05 ? `rgb(${Math.round(lerp(226, 255, lum))},${Math.round(lerp(169, 235, lum))},${Math.round(lerp(41, 168, lum))})` : '#E2A929';
      el.style.boxShadow = `0 14px 40px rgba(0,0,0,.4),0 0 ${lum * 55}px rgba(253,235,168,${lum * 0.75})`;
    });

    /* Scène 3 : formulaire */
    const f = P(a, 15.0, 15.8, E.back) * (1 - P(a, 24.5, 25.2));
    place(R.form, 640, 372, lerp(0.88, 1, P(a, 15.0, 15.8, E.back)), (a < 14.9 || a > 25.3) ? 0 : f);
    const vals = ["Côte d'Ivoire", 'France', 'Entrepreneuriat'], t0s = [15.7, 16.85, 18.0];
    [0, 1, 2].forEach(i => {
      R['v' + i].textContent = tape(vals[i], a, t0s[i], t0s[i] + 0.8);
      R['k' + i].style.opacity = P(a, t0s[i] + 0.85, t0s[i] + 1.05);
    });
    const phoP = P(a, 20.4, 21.0, E.back);
    R.ph.style.transform = `scale(${phoP})`; R.ph.style.opacity = phoP > 0 ? 1 : 0;
    R.av.classList.toggle('set', phoP > 0.5);
    R.bio.textContent = tape("Passionnée d'entrepreneuriat, je cherche des partenaires pour un projet agricole en Côte d'Ivoire.", a, 21.2, 24.2);

    /* Scène 4 : e-mail + profil */
    place(R.env, 330, 350, lerp(0.7, 1, P(a, 25.1, 25.9, E.back)), P(a, 25.1, 25.7) * (1 - P(a, 31.2, 31.8)) * (a > 25 && a < 32 ? 1 : 0));
    R.flap.style.transform = `rotateX(${lerp(0, 175, P(a, 26.2, 27.0, E.inout))}deg)`;
    const eo = P(a, 27.3, 27.8, E.back);
    R.envok.style.transform = `scale(${eo})`; R.envok.style.transformOrigin = '198px 52px'; R.envck.style.opacity = eo > 0.2 ? 1 : 0;
    R.envl.style.opacity = P(a, 27.4, 27.9);
    place(R.prof, 880, 380, lerp(0.88, 1, P(a, 25.4, 26.2, E.back)), (a < 25.3 || a > 32.0) ? 0 : P(a, 25.3, 26.0) * (1 - P(a, 31.4, 32.0)));
    const ckT = { res: -1, pho: 28.9, bio: 29.4, com: 29.9, ori: 30.4, dom: 30.9 };
    let nOn = 0;
    R.ckEls.forEach(d => { const on = a >= (ckT[d.dataset.k] ?? 99) && (ckT[d.dataset.k] >= 0 || a >= 28.6); d.classList.toggle('on', on); if (on) nOn++; });
    const pct = Math.round(nOn / 6 * 100);
    R.pct.textContent = pct + ' %';
    R.bar.style.width = pct + '%'; R.bar.style.transition = calme ? 'none' : 'width .45s ease';

    /* Éclats dorés à 100 % */
    const bs = P(a, 31.0, 31.9, E.lin);
    R.burst.innerHTML = a > 31.0 && a < 32.0 ? Array.from({ length: 16 }, (_, i) => {
      const an = i / 16 * Math.PI * 2, d = 40 + bs * 190;
      return `<i style="position:absolute;left:${880 + Math.cos(an) * d}px;top:${380 + Math.sin(an) * d * .8}px;width:11px;height:11px;border-radius:50%;background:${i % 3 === 0 ? '#F26422' : '#F8DA7A'};opacity:${1 - bs}"></i>`;
    }).join('') : '';

    /* Scène 5 : le profil et ses usages */
    const inS5 = a > 31.4 && a < 40.9;
    const pIn = P(a, 31.8, 32.6, E.back), pOut = P(a, 40.0, 40.8);
    place(R.past, 640, 355, lerp(0.5, 1, pIn), inS5 ? pIn * (1 - pOut) : 0);
    place(R.pn, 640, 478, 1, inS5 ? P(a, 32.2, 32.9) * (1 - pOut) : 0);
    const sc = [33.95, 35.3, 37.0, 38.4, 39.9];
    const ln = [];
    sc.forEach((tc, i) => {
      const an = (-90 + i * 72) * Math.PI / 180 + (calme ? 0 : Math.sin(a * 0.4) * 0.06);
      const x = 640 + Math.cos(an) * 410, y = 355 + Math.sin(an) * 232;
      const e = P(a, tc - 0.55, tc + 0.15, E.back);
      place(R['s' + i], lerp(640, x, e), lerp(355, y, e), lerp(0.4, 1, e), inS5 ? e * (1 - pOut) : 0);
      if (inS5 && e > 0) ln.push(`<line x1="640" y1="355" x2="${lerp(640, x, e).toFixed(1)}" y2="${lerp(355, y, e).toFixed(1)}" stroke="#E2A929" stroke-width="3.5" stroke-opacity="${(0.75 * (1 - pOut)).toFixed(2)}" stroke-dasharray="9 8"/>`);
    });
    R.lines.innerHTML = ln.join('');

    /* Scène 6 : appel à l'action (lauriers, devise, bouton) */
    const fin6 = P(a, 40.7, 41.6), on6 = a > 40.6 ? 1 : 0;
    place(R.t1, 640, 240, lerp(0.92, 1, fin6), fin6 * on6);
    const lau = P(a, 41.2, 42.4, E.back);
    place(R.lauG, 150, 250, 0.62 * lerp(0.7, 1, lau), P(a, 41.2, 42.2) * on6);
    place(R.lauD, 1130, 250, 0.62 * lerp(0.7, 1, lau), P(a, 41.2, 42.2) * on6);
    place(R.t0, 640, 328, 1, P(a, 41.7, 42.8) * on6);
    place(R.t2, 640, 396, 1, P(a, 43.3, 44.0) * on6);
    const pulse = 1 + 0.045 * Math.sin(Math.max(0, a - 44) * 4.2);
    place(R.t3, 640, 490, lerp(0.8, 1, P(a, 43.5, 44.2, E.back)) * (calme ? 1 : pulse), P(a, 43.5, 44.1) * on6);
    place(R.t4, 640, 590, 1, P(a, 44.4, 45.4) * on6);
    R.fade.style.left = '0'; R.fade.style.top = '0'; R.fade.style.transform = '';
    R.fade.style.opacity = clamp((a - (FIN - LEAD - 1.1)) / 1.1);
  }

  /* ── Sous-titres ── */
  function majCaption(a) {
    let idx = -1;
    for (let i = 0; i < CAPS.length; i++) if (a >= CAPS[i][0] - 0.05 && a <= CAPS[i][1] + 0.4) { idx = i; break; }
    if (idx !== capIdx) {
      capIdx = idx;
      if (idx < 0) { R.cap.textContent = ''; capsEls = []; }
      else {
        R.cap.innerHTML = '<p>' + CAPS[idx][2].split(' ').map(w => '<span>' + w.replace(/</g, '&lt;') + '</span>').join(' ') + '</p>';
        capsEls = [...R.cap.querySelectorAll('span')];
      }
    }
    if (idx >= 0) {
      const [c0, c1] = CAPS[idx], pr = clamp((a - c0) / (c1 - c0)) * capsEls.length;
      capsEls.forEach((s, i) => s.classList.toggle('on', i < pr + 0.6));
    }
  }

  /* ── Boucle principale ── */
  function echelle() {
    const w = R.win.clientWidth; R.stage.style.transform = `scale(${w / W})`;
  }
  function temps() { return tFilm; }
  function boucle() {
    rafId = requestAnimationFrame(boucle);
    const now = performance.now();
    if (enCours) {
      if (audio && !audio.paused && audio.readyState >= 2 && tFilm >= LEAD - 0.05) tFilm = audio.currentTime + LEAD;
      else if (tFilm >= LEAD && audio && audio.readyState < 3 && !finie) { /* la voix charge : on attend, l'horloge s'arrête */ tMur = now; }
      else tFilm += (now - tMur) / 1000;
      tMur = now;
      if (audio && audio.paused && tFilm >= LEAD && tFilm < LEAD + 45.1 && audio.readyState >= 2) {
        audio.currentTime = Math.max(0, tFilm - LEAD); const pr = audio.play(); if (pr && pr.catch) pr.catch(() => {});
      }
      if (tFilm >= FIN) { tFilm = FIN; terminer(); }
    }
    const a = tFilm - LEAD;
    SFX.forEach(s => { if (enCours && s[0] > dernierA && s[0] <= a && s[0] - dernierA < 0.5) bruit(s[1]); });
    dernierA = a;
    rendre(a); majCaption(a);
    { const pc = (tFilm / FIN * 100).toFixed(2) + '%'; R.progf.style.width = pc; R.progb.style.left = pc; R.prog.setAttribute('aria-valuenow', String(Math.round(tFilm / FIN * 100))); } R.temps.textContent = fmt(tFilm) + ' / ' + fmt(FIN);
  }
  function tickMusique() { if (enCours) planifierMusique(tFilm - LEAD); }

  function lecture() {
    if (finie) { aller(0); finie = false; }
    enCours = true; tMur = performance.now();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    prochainPas = Math.ceil((tFilm - LEAD) / PAS) * PAS;
    if (audio && tFilm >= LEAD) { audio.currentTime = Math.max(0, tFilm - LEAD); const pr = audio.play(); if (pr && pr.catch) pr.catch(() => {}); }
    R.play.textContent = '⏸ Pause';
  }
  function pause() {
    enCours = false; if (audio) audio.pause(); R.play.textContent = '▶ Lecture';
    if (master && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }
  function aller(t) {
    tFilm = clamp(t, 0, FIN); dernierA = tFilm - LEAD; capIdx = -2;
    if (audio) { audio.pause(); audio.currentTime = Math.max(0, tFilm - LEAD); }
    prochainPas = Math.ceil((tFilm - LEAD) / PAS) * PAS;
    if (enCours && audio && tFilm >= LEAD) { const pr = audio.play(); if (pr && pr.catch) pr.catch(() => {}); }
    tMur = performance.now();
  }
  function terminer() {
    enCours = false; finie = true; if (audio) audio.pause(); R.play.textContent = '↻ Revoir';
    if (master && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  }
  function basculerSon() {
    muet = !muet; if (audio) audio.muted = muet; R.son.textContent = muet ? '🔇 Son coupé' : '🔊 Son';
    if (master && ctx) master.gain.setTargetAtTime(muet ? 0 : volMusique(tFilm - LEAD) * 0.5, ctx.currentTime, 0.05);
  }
  function clavier(e) {
    if (!ov) return;
    if (e.key === 'Escape') { e.preventDefault(); fermer(); }
    else if (e.key === ' ' && document.activeElement.tagName !== 'BUTTON' && document.activeElement.tagName !== 'A') { e.preventDefault(); enCours ? pause() : lecture(); }
    else if (e.key === 'ArrowRight') aller(tFilm + 5);
    else if (e.key === 'ArrowLeft') aller(tFilm - 5);
  }

  function ouvrir(options) {
    if (ov) return;
    options = options || {};
    if (!document.getElementById('fi-css')) { const st = document.createElement('style'); st.id = 'fi-css'; st.textContent = CSS; document.head.appendChild(st); }
    if (!document.getElementById('fi-fonts')) { const l = document.createElement('link'); l.id = 'fi-fonts'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Cinzel:wght@600;800&display=swap'; document.head.appendChild(l); }
    calme = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    ov = document.createElement('div');
    ov.className = 'fi-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', "Film : créer son compte sur Diaspo'Actif");
    const surInscription = /(^|\/)inscription(\.html)?$/.test(location.pathname);
    ov.innerHTML = `<div class="fi-box">
      <div class="fi-top"><span class="fi-titre">▶ COMMENT ÇA MARCHE · 55 s</span><span style="display:flex;gap:8px"><button class="fi-btn or" data-r="cta" type="button">Créer mon compte</button><button class="fi-btn" data-r="fermer" type="button" aria-label="Fermer le film">✕ Fermer</button></span></div>
      <div class="fi-win" data-r="win"><div class="fi-stage" data-r="stage">${STAGE_HTML}</div></div>
      <div class="fi-cap" data-r="cap" aria-live="off"></div>
      <div class="fi-ctl"><button class="fi-btn" data-r="play" type="button">▶ Lecture</button><button class="fi-btn" data-r="son" type="button">🔊 Son</button>
        <div class="fi-prog" data-r="prog" role="slider" tabindex="0" aria-label="Position dans le film" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-r="progf"></i><b data-r="progb"></b></div><span class="t" data-r="temps">0:00 / 0:54</span></div></div>`;
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    R = {};
    ov.querySelectorAll('[data-r]').forEach(el => { R[el.dataset.r] = el; });
    /* éléments multiples */
    R.parts = ov.querySelector('[data-r="parts"]');
    R.pa = Array.from({ length: 36 }, () => { const el = document.createElement('i'); el.className = 'fi-part'; R.parts.appendChild(el); return { el }; });
    R.mer = Array.from({ length: 6 }, () => { const e = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse'); e.setAttribute('ry', 150); return e; });
    const gMer = ov.querySelector('[data-r="mer"]'); R.mer.forEach(e => gMer.appendChild(e));
    const gPar = ov.querySelector('[data-r="par"]');
    [-60, -30, 0, 30, 60].forEach(lat => { const y = -150 * Math.sin(lat * Math.PI / 180), x = 150 * Math.cos(lat * Math.PI / 180); const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.setAttribute('x1', -x); l.setAttribute('x2', x); l.setAttribute('y1', y); l.setAttribute('y2', y); gPar.appendChild(l); });
    const gNodes = ov.querySelector('[data-r="nodes"]'); R.nd = NODES.map(() => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('fill', '#FFF1B8'); gNodes.appendChild(c); return c; });
    const gArcs = ov.querySelector('[data-r="arcs"]'); R.ar = LIENS.map((_, i) => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('pathLength', '1'); p.setAttribute('stroke-dasharray', '1'); p.setAttribute('stroke', i % 2 ? '#9fd0ff' : '#FFE7A0'); p.setAttribute('stroke-width', '2.4'); gArcs.appendChild(p); return p; });
    R.ckEls = [...ov.querySelectorAll('[data-r="ck"] > div')];
    echelle(); window.addEventListener('resize', echelle);
    document.addEventListener('keydown', clavier);

    audio = new Audio(VOIX); audio.preload = 'auto'; audio.muted = muet;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); }
    tFilm = 0; dernierA = -LEAD; capIdx = -2; finie = false; muet = false; R._pctAff = 0;
    R.fermer.addEventListener('click', fermer);
    R.play.addEventListener('click', () => { enCours ? pause() : lecture(); });
    R.son.addEventListener('click', basculerSon);
    {
      const depuis = e => { const r = R.prog.getBoundingClientRect(); aller(clamp((e.clientX - r.left) / r.width) * FIN); };
      let glisse = false;
      R.prog.addEventListener('pointerdown', e => { glisse = true; try { R.prog.setPointerCapture(e.pointerId); } catch (x) { /* sans capture */ } depuis(e); });
      R.prog.addEventListener('pointermove', e => { if (glisse) depuis(e); });
      R.prog.addEventListener('pointerup', () => { glisse = false; });
      R.prog.addEventListener('pointercancel', () => { glisse = false; });
    }
    R.cta.addEventListener('click', () => { if (surInscription) fermer(); else window.location.href = 'inscription.html'; });
    ov.addEventListener('click', e => { if (e.target === ov) fermer(); });
    rafId = requestAnimationFrame(boucle); tickId = setInterval(tickMusique, 90);
    if (options.auto !== false) lecture();
    R.fermer.focus();
  }
  function fermer() {
    if (!ov) return;
    cancelAnimationFrame(rafId); clearInterval(tickId);
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
    if (ctx) { try { ctx.close(); } catch (e) { /* déjà fermé */ } ctx = null; master = null; }
    window.removeEventListener('resize', echelle); document.removeEventListener('keydown', clavier);
    ov.remove(); ov = null; R = {}; enCours = false; document.body.style.overflow = '';
  }

  window.InscriptionFilm = { ouvrir, fermer, aller: t => aller(t), pause, lecture, etat: () => ({ tFilm, enCours, finie, voix: audio ? { pause: audio.paused, t: audio.currentTime, pret: audio.readyState, dur: audio.duration, muet: audio.muted } : null, son: ctx ? ctx.state : null }), FIN, LEAD };
})();
