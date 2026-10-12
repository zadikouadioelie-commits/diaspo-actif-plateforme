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

  const LEAD = 1.5;          // silence musical avant la voix
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
  const CAPS_COURT = [
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
  const SCENES_COURT = [[-LEAD, 8.0], [8.0, 15.0], [15.0, 24.7], [24.7, 31.6], [31.6, 40.7], [40.7, 54.6 - LEAD]];

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
.fi-legend{display:flex;align-items:center;gap:9px;font-size:19px;color:#dbe8ff;white-space:nowrap;font-weight:600}
.fi-legend i{display:inline-block;width:14px;height:14px;border-radius:50%;box-shadow:0 0 10px currentColor}
.fi-logo{width:350px;height:350px;border-radius:50%;filter:drop-shadow(0 12px 30px rgba(0,0,0,.5)) drop-shadow(0 0 28px rgba(248,218,122,.45))}
.fi-head{display:flex;align-items:center;gap:12px;font-size:28px;font-weight:800;white-space:nowrap}
.fi-head img{width:56px;height:56px;border-radius:50%;object-fit:contain;background:#fff;box-shadow:0 0 0 3px #E2A929}
.fi-head i{font-style:normal;color:#F26422}
.fi-pill{display:inline-block;margin-top:12px;padding:5px 14px;border-radius:999px;background:rgba(255,255,255,.14);border:2px solid rgba(226,169,41,.75);font-size:15px;font-weight:700;color:#FDEBA8}
.fi-pill.soon{border-color:rgba(255,255,255,.4);color:#cfe0ff;font-size:13px}
.fi-steps{display:flex;align-items:flex-start;width:620px}
.fi-st{display:flex;flex-direction:column;align-items:center;gap:6px;width:170px;font-size:15px;color:#cfe0ff;font-weight:600}
.fi-st b{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.5);font-size:18px}
.fi-st.on b{background:linear-gradient(135deg,#f59e0b,#ea580c);border-color:#FDEBA8;color:#fff;box-shadow:0 0 18px rgba(245,158,11,.6)}
.fi-st.done b{background:#16a34a;border-color:#86efac;color:#fff}
.fi-st.on,.fi-st.done{color:#fff}
.fi-sl{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.32);margin-top:19px}
.fi-fbot{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:10px;padding-top:12px;border-top:2px solid #e3ecfa}
.fi-chk{display:flex;align-items:center;gap:10px;font-size:15px;color:#33527d;font-weight:600}
.fi-chk b{width:26px;height:26px;flex:none;border-radius:6px;border:2px solid #d97706;display:flex;align-items:center;justify-content:center;color:transparent;background:#fff;font-size:17px}
.fi-chk b.on{background:#16a34a;border-color:#16a34a;color:#fff}
.fi-chk u{color:#2563eb}
.fi-subb{padding:12px 20px;border-radius:12px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-weight:800;font-size:16px;box-shadow:0 6px 16px rgba(37,99,235,.35);white-space:nowrap}
.fi-type{width:300px;height:350px;border-radius:26px;padding:20px 22px;background:linear-gradient(165deg,#15428a,#0a2556);border:3px solid #E2A929;text-align:center;box-shadow:0 14px 40px rgba(0,0,0,.4)}
.fi-ring{width:124px;height:124px;margin:10px auto 0;border-radius:50%;border:3px solid #E2A929;background:radial-gradient(circle,#1d57ad,#0B2A5B);display:flex;align-items:center;justify-content:center;font-size:62px;box-shadow:0 0 0 6px rgba(226,169,41,.18)}
.fi-type h4{margin:16px 0 8px;font-family:'Cinzel','Georgia',serif;font-size:32px;font-weight:800;letter-spacing:.04em}
.fi-type p{margin:0;font-size:18px;color:#cfe0ff;line-height:1.35}
.fi-card{border-radius:26px;border:5px solid transparent;background:linear-gradient(160deg,#ffffff,#eaf2ff) padding-box,linear-gradient(135deg,#FDEBA8,#E2A929 50%,#B67E14) border-box;color:#0B2A5B;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.fi-form{width:820px;height:450px;padding:24px 32px}
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
.fi-sat .e{width:76px;height:76px;margin:0 auto;border-radius:20px;border:3px solid rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center;font-size:38px;box-shadow:0 6px 16px rgba(0,0,0,.35)}
.fi-sat b{display:block;font-size:22px;margin-top:8px;font-family:'Cinzel','Georgia',serif;letter-spacing:.03em}
.fi-big{font-family:'Cinzel','Georgia',serif;font-size:64px;font-weight:800;text-align:center;white-space:nowrap;letter-spacing:.02em;text-shadow:0 4px 30px rgba(0,0,0,.45)}
.fi-script{font-family:'Caveat','Segoe Script','Brush Script MT',cursive;font-size:50px;font-weight:700;color:#fff;white-space:nowrap;text-align:center;text-shadow:0 3px 18px rgba(0,0,0,.4)}
.fi-sub{font-size:28px;color:#dbe8ff;text-align:center;white-space:nowrap}
.fi-cta{display:inline-block;padding:18px 44px;border-radius:999px;background:linear-gradient(135deg,#f59e0b,#ea580c);color:#fff;font-size:30px;font-weight:800;box-shadow:0 12px 40px rgba(242,100,34,.55),0 0 0 4px rgba(253,235,168,.7);white-space:nowrap}
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
.fi-sect{font-size:14px;font-weight:800;letter-spacing:.12em;color:#2563eb;margin:0 0 12px;border-bottom:2px solid #e3ecfa;padding-bottom:6px}
.fi-sect small{font-size:11px;color:#8a5a00;margin-left:6px;letter-spacing:.06em}
.fi-fl.soft .v{color:#a9b9d3;font-weight:500;background:#f5f8fd;border-style:dashed}
.fi-fl .v.sel:after{content:"▾";color:#6b82a8;font-size:18px;margin-left:8px}
.fi-note{margin-top:8px;padding:9px 12px;border-radius:10px;background:#eef5ff;border:2px solid #cfe0fb;font-size:14px;color:#33527d;font-weight:600;line-height:1.35}
.fi-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.fi-chip{padding:7px 12px;border-radius:999px;border:2px solid #c7d7ee;background:#fff;font-size:15px;font-weight:700;color:#33527d}
.fi-chip.on{background:#fff4d6;border-color:#E2A929;color:#8a5a00;box-shadow:0 0 0 3px rgba(226,169,41,.25)}
.fi-badge{display:inline-block;margin-left:8px;padding:3px 10px;border-radius:999px;background:#F26422;color:#fff;font-size:12px;font-weight:800;letter-spacing:.06em;vertical-align:middle}
.fi-map{width:100%;height:240px;border-radius:14px;background:linear-gradient(160deg,#0f3a7c,#061633);position:relative;overflow:hidden;border:2px solid #E2A929}
.fi-map svg{position:absolute;inset:0}
.fi-maplab{position:absolute;left:0;right:0;bottom:8px;text-align:center;font-size:15px;font-weight:700;color:#FDEBA8}
.fi-pw{height:50px;border-radius:12px;border:2px solid #c7d7ee;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font-size:24px;letter-spacing:.2em;font-weight:800;color:#0B2A5B}
.fi-str{height:10px;border-radius:999px;background:#e6edf8;overflow:hidden;margin-top:8px}
.fi-str i{display:block;height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#f59e0b,#16a34a)}
.fi-pill2{display:inline-block;margin-top:10px;padding:5px 12px;border-radius:999px;background:#ecfdf5;border:2px solid #86efac;color:#15803d;font-size:14px;font-weight:800}
.fi-chk u.hl{background:#fff4d6;border-radius:4px;padding:0 3px;outline:2px solid #E2A929}
/* ── Tuto « Événements flash » ── */
.ff-steps{display:flex;align-items:flex-start;width:900px}
.ff-steps .fi-st{width:150px}
.ff-title{font-family:'Cinzel','Georgia',serif;font-size:74px;font-weight:800;letter-spacing:.12em;white-space:nowrap;text-shadow:0 4px 26px rgba(0,0,0,.4)}
.ff-title span{display:inline-block;margin-right:14px;filter:drop-shadow(0 0 18px rgba(255,190,40,.8))}
.ff-demo{position:relative;display:inline-flex;align-items:center;gap:20px;padding:14px 30px;border-radius:999px;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.35);font-size:30px;font-weight:800;color:#dbe8ff;white-space:nowrap}
.ff-demo .b{padding:10px 26px;border-radius:12px;background:#2563eb;color:#fff;font-size:26px;position:relative}
.ff-demo .st{position:absolute;left:24px;right:auto;top:50%;height:6px;width:210px;margin-top:-3px;border-radius:3px;background:#ef4444;transform-origin:0 50%;transform:scaleX(0);box-shadow:0 0 14px rgba(239,68,68,.8)}
.ff-demo em{font-style:normal;color:#FDEBA8}
.ff-mini{width:400px;height:215px;padding:16px 20px;border-radius:22px;background:linear-gradient(165deg,#15428a,#0a2556);border:3px solid #E2A929;box-shadow:0 14px 40px rgba(0,0,0,.4)}
.ff-mini-t{font-size:15px;font-weight:800;letter-spacing:.16em;color:#F2C94C}
.ff-org{display:flex;align-items:center;gap:12px;margin:12px 0 8px;font-size:21px;font-weight:700}
.ff-org img{width:44px;height:44px;border-radius:50%;background:#fff;object-fit:contain;box-shadow:0 0 0 3px #E2A929}
.ff-org b{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#6366f1);display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 0 0 3px #E2A929}
.ff-mini-n{font-family:'Cinzel','Georgia',serif;font-size:27px;font-weight:800;line-height:1.15}
.ff-mini-d{margin-top:8px;font-size:17px;color:#cfe0ff;font-weight:600}
.ff-flash{display:inline-block;margin-top:10px;padding:4px 14px;border-radius:999px;background:#16a34a;color:#fff;font-size:14px;font-weight:800;letter-spacing:.08em}
.ff-pill{display:inline-block;padding:12px 26px;border-radius:999px;background:rgba(255,255,255,.14);border:2px solid rgba(226,169,41,.8);font-size:25px;font-weight:700;color:#FDEBA8;white-space:nowrap}
.ff-bar{width:1020px;height:92px;border-radius:20px;background:linear-gradient(180deg,#0f2a52,#0a1d3b);border:3px solid #E2A929;display:flex;align-items:center;gap:22px;padding:0 24px;box-shadow:0 18px 50px rgba(0,0,0,.5);font-size:21px;font-weight:700;color:#dbe8ff}
.ff-bar img{width:54px;height:54px;border-radius:50%;background:#fff;object-fit:contain}
.ff-bar .lg{font-family:'Cinzel','Georgia',serif;font-weight:800;color:#fff;letter-spacing:.06em;font-size:24px}
.ff-bar .nv{display:flex;gap:20px;margin-left:12px}
.ff-bar .ch{margin-left:auto;display:flex;align-items:center;gap:12px;padding:8px 18px;border-radius:999px;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.3);color:#fff;white-space:nowrap}
.ff-bar .ch b{display:block;font-size:19px}.ff-bar .ch span{font-size:14px;padding:2px 10px;border-radius:999px;background:#1d4ed8;color:#fff}
.ff-bar .ch i{width:12px;height:12px;border-radius:50%;background:#22c55e;box-shadow:0 0 10px #22c55e}
.ff-page{width:1040px;height:400px}
.ff-ph{position:absolute;left:24px;top:22px;font-family:'Cinzel','Georgia',serif;font-size:34px;font-weight:800}
.ff-ps{position:absolute;left:24px;top:76px;font-size:18px;color:#4b6a93;font-weight:600}
.ff-b{position:absolute;height:58px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:800;white-space:nowrap;border:2px solid #c7d7ee;background:#fff;color:#0B2A5B}
.ff-b.green{background:#4ade80;border-color:#22c55e;color:#0a3d1c}
.ff-b.blue{background:#2563eb;border-color:#1d4ed8;color:#fff}
.ff-q{position:absolute;width:46px;height:46px;margin-top:6px;border-radius:50%;background:#16a34a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px}
.ff-sk{position:absolute;width:300px;height:110px;border-radius:14px;background:#eef4ff;border:2px solid #d4e3fb}
.ff-call{padding:8px 18px;border-radius:999px;background:#fff4d6;border:2px solid #E2A929;color:#8a5a00;font-size:19px;font-weight:800;white-space:nowrap}
.ff-cur{filter:drop-shadow(0 3px 5px rgba(0,0,0,.5))}
.ff-fm{width:1040px;height:470px;padding:22px 30px}
.ff-fm h5{margin:0 0 14px;font-size:25px;font-weight:800;display:flex;align-items:center;gap:10px;font-family:'Cinzel','Georgia',serif}
.ff-fm h5 span{font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;font-weight:700;background:#dcfce7;color:#15803d;border-radius:999px;padding:5px 12px;border:2px solid #86efac}
.ff-fm .fi-fl{margin-bottom:10px}.ff-fm .fi-fl label{font-size:14px;margin-bottom:3px}
.ff-fm .fi-fl .v{height:44px;font-size:19px}
.ff-row2{display:flex;gap:14px}.ff-row2>div{flex:1}
.ff-glow{box-shadow:0 0 0 4px rgba(226,169,41,.45);border-radius:12px}
.ff-ph2{display:flex;gap:12px;margin-bottom:10px}
.ff-tile{width:120px;height:78px;border-radius:12px;border:3px dashed #9db8dd;background:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;color:#9db8dd;position:relative;overflow:hidden}
.ff-tile i{position:absolute;inset:0;opacity:0}
.ff-t1 i{background:linear-gradient(135deg,#f59e0b,#c2410c 60%,#7c2d12)}.ff-t2 i{background:linear-gradient(135deg,#0ea5e9,#1d4ed8 60%,#312e81)}
.ff-rad{display:flex;align-items:center;gap:12px;padding:8px 14px;border-radius:12px;border:2px solid #c7d7ee;background:#fff;font-size:17px;font-weight:700;margin-bottom:8px}
.ff-rad b{width:22px;height:22px;border-radius:50%;border:3px solid #9db8dd;flex:none;display:block;background:#fff}
.ff-rad.on{border-color:#E2A929;background:#fff8e1}.ff-rad.on b{border-color:#d97706;background:radial-gradient(circle,#d97706 0 45%,#fff 50%)}
.ff-rad.pk{box-shadow:0 0 0 4px rgba(226,169,41,.45)}
.ff-rec{width:790px;height:455px;padding:0;overflow:hidden}
.ff-aff{height:125px;background:linear-gradient(120deg,#0B2A5B 0%,#1d57ad 45%,#c2410c 100%);display:flex;align-items:center;justify-content:center;font-family:'Cinzel','Georgia',serif;font-size:30px;font-weight:800;color:#fff;letter-spacing:.06em;text-align:center;line-height:1.2;padding:0 40px}
.ff-rl{padding:12px 30px 0;font-size:19px;line-height:1.5;font-weight:600;color:#1e3a5f}
.ff-rl b{color:#8a5a00}
.ff-rn{margin:10px 30px 0;padding:9px 14px;border-radius:10px;background:#eef5ff;border:2px solid #cfe0fb;font-size:16px;color:#33527d;font-weight:700}
.ff-rb{display:flex;justify-content:space-between;align-items:center;padding:14px 30px 0}
.ff-bt{padding:12px 24px;border-radius:12px;font-size:19px;font-weight:800;white-space:nowrap}
.ff-bt.o{background:#fff;border:2px solid #c7d7ee;color:#33527d}
.ff-bt.p{background:linear-gradient(135deg,#FDEBA8,#E2A929 60%,#B67E14);color:#3a2600;box-shadow:0 8px 20px rgba(226,169,41,.45)}
.ff-lst{width:620px;height:340px;padding:0;overflow:hidden;background:linear-gradient(160deg,#f0fdf4,#dcfce7) padding-box,linear-gradient(135deg,#86efac,#16a34a) border-box}
.ff-lst .ban{height:120px;background:linear-gradient(120deg,#0B2A5B 0%,#1d57ad 45%,#c2410c 100%);display:flex;align-items:center;justify-content:center;font-family:'Cinzel','Georgia',serif;font-size:26px;font-weight:800;color:#fff}
.ff-lst .bd{padding:14px 26px}
.ff-lst .dt{font-size:16px;font-weight:800;color:#15803d;letter-spacing:.05em}
.ff-lst .tt{font-family:'Cinzel','Georgia',serif;font-size:27px;font-weight:800;margin:4px 0 6px}
.ff-lst .ch{display:flex;gap:8px;align-items:center;margin-bottom:12px;font-size:16px;font-weight:700;color:#33527d}
.ff-lst .ch em{font-style:normal;padding:3px 12px;border-radius:999px;background:#fff;border:2px solid #c7d7ee}
.ff-lst .ch em.fl{background:#4ade80;border-color:#22c55e;color:#0a3d1c}
.ff-lst .bs{display:flex;gap:10px}
.ff-lst .bs span{padding:10px 20px;border-radius:12px;background:#fff;border:2px solid #c7d7ee;font-size:17px;font-weight:800;color:#2563eb}
.ff-lst .bs span.in{color:#0f766e;background:#ecfeff;border-color:#99f6e4}
.ff-toast{padding:14px 28px;border-radius:14px;background:#16a34a;color:#fff;font-size:24px;font-weight:800;box-shadow:0 12px 36px rgba(22,163,74,.5);white-space:nowrap}
@media (max-width:640px){.fi-titre{display:none!important}.fi-top{justify-content:flex-end}}
@media (prefers-reduced-motion:reduce){.fi-ov{animation:none}}
`;

  /* ── Formes dessinées : lauriers ── */
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
<img class="fi-abs fi-logo" data-r="logo" src="assets/media/logo-film.webp" alt="">
<div class="fi-abs fi-welc gold" data-r="welc">BIENVENUE</div>
<div class="fi-abs fi-tag" data-r="tag">PLATEFORME · RÉSEAU · OPPORTUNITÉS</div>
<div class="fi-abs fi-head" data-r="head"><img src="assets/media/logo-film.webp" alt=""><span>Diaspo<i>'</i>Actif</span></div>

<div class="fi-abs fi-steps" data-r="steps"><div class="fi-st" data-s="0"><b>1</b><span>Type de compte</span></div><i class="fi-sl"></i><div class="fi-st" data-s="1"><b>2</b><span>Informations</span></div><i class="fi-sl"></i><div class="fi-st" data-s="2"><b>3</b><span>Confirmation</span></div></div>
<div class="fi-abs fi-type" data-r="c0"><div class="fi-ring">👤</div><h4>Utilisateur</h4><p>Personne physique, particulier membre de la diaspora</p><span class="fi-pill">Gratuit</span></div>
<div class="fi-abs fi-type" data-r="c1"><div class="fi-ring">🤝</div><h4>Initiative</h4><p>Association, ONG, entreprise, startup, projet collectif</p><span class="fi-pill">Gratuit</span></div>
<div class="fi-abs fi-type" data-r="c2"><div class="fi-ring">🏛️</div><h4>Collectivité</h4><p>Ambassade, mairie, région, agence publique</p><span class="fi-pill soon">Compte étatique · bientôt disponible</span></div>

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
  <div class="fi-fbot"><div class="fi-chk"><b data-r="chk">✓</b><span>J'ai lu et j'accepte la <u>Charte</u> et les <u>CGU</u></span></div><div class="fi-subb" data-r="subb">Créer mon compte utilisateur</div></div>
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
<!-- ── Écrans de la version complète (invisibles tant que le film court tourne) ── -->
<div class="fi-abs fi-card fi-form" data-r="fA" style="opacity:0">
  <h5>Créer mon compte <span>Utilisateur</span></h5>
  <div class="fi-cols">
    <div class="fi-col"><div class="fi-sect">IDENTITÉ</div>
      <div class="fi-fl"><label>Nom *</label><div class="v"><span data-r="a0"></span><span class="ok" data-r="ak0">✓</span></div></div>
      <div class="fi-fl"><label>Prénom *</label><div class="v"><span data-r="a1"></span><span class="ok" data-r="ak1">✓</span></div></div>
      <div class="fi-fl"><label>Date de naissance *</label><div class="v"><span data-r="a2"></span><span class="ok" data-r="ak2">✓</span></div></div>
    </div>
    <div class="fi-col" data-r="anat"><div class="fi-sect">NATIONALITÉS <small>FACULTATIF</small></div>
      <div class="fi-fl soft"><label>Nationalité 1</label><div class="v">Française (facultatif)</div></div>
      <div class="fi-fl soft"><label>Nationalité 2</label><div class="v">Sénégalaise (opt.)</div></div>
      <div class="fi-note">Information publique et facultative : le réseau fonctionne sans elle.</div>
    </div>
  </div>
</div>

<div class="fi-abs fi-card fi-form" data-r="fB" style="opacity:0">
  <h5>Créer mon compte <span>Utilisateur</span></h5>
  <div class="fi-cols">
    <div class="fi-col"><div class="fi-sect">PAYS D'ORIGINE · RÉSIDENCE</div>
      <div class="fi-fl"><label>Pays d'origine *</label><div class="v"><span data-r="q0"></span><span class="ok" data-r="qk0">✓</span></div></div>
      <div class="fi-fl"><label>Pays de résidence *</label><div class="v"><span data-r="q1"></span><span class="ok" data-r="qk1">✓</span></div></div>
      <div class="fi-fl"><label>Domaine d'activité *</label><div class="v sel"><span data-r="q2"></span><span class="ok" data-r="qk2">✓</span></div></div>
    </div>
    <div class="fi-col"><div class="fi-sect">VOTRE DIASPORA VOUS RETROUVE</div>
      <div class="fi-map"><svg viewBox="0 0 300 240" aria-hidden="true">
        <path data-r="marc" d="M104 156 Q40 100 142 54" fill="none" stroke="#FFE7A0" stroke-width="3" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
        <circle data-r="mdo" cx="104" cy="156" r="9" fill="#FFA928" stroke="#fff" stroke-width="3"/>
        <circle data-r="mdb" cx="142" cy="54" r="9" fill="#5aaeff" stroke="#fff" stroke-width="3"/>
        <text x="118" y="176" fill="#FFE7A0" font-size="13" font-weight="700" data-r="mlo">Côte d'Ivoire</text>
        <text x="156" y="48" fill="#bfe0ff" font-size="13" font-weight="700" data-r="mlb">France</text>
      </svg></div>
    </div>
  </div>
</div>

<div class="fi-abs fi-card fi-form" data-r="fC" style="opacity:0">
  <h5>Créer mon compte <span>Utilisateur</span></h5>
  <div class="fi-cols">
    <div class="fi-col"><div class="fi-sect">PROFIL PUBLIC <small>FACULTATIF</small></div>
      <div style="font-size:14px;color:#4b6a93;font-weight:700;margin-bottom:6px">Publics qui vous concernent</div>
      <div class="fi-chips" data-r="chipsA"><span class="fi-chip">Diaspora</span><span class="fi-chip">Entrepreneurs</span><span class="fi-chip">Étudiants</span><span class="fi-chip">Associations</span></div>
      <div style="font-size:14px;color:#4b6a93;font-weight:700;margin-bottom:6px">Vous recherchez</div>
      <div class="fi-chips" data-r="chipsB"><span class="fi-chip">Un emploi</span><span class="fi-chip">Des partenaires</span><span class="fi-chip">Des investisseurs</span><span class="fi-chip">Du mentorat</span></div>
    </div>
    <div class="fi-col">
      <div class="fi-av" data-r="cav">📷<div class="ph" data-r="cph"></div></div>
      <div style="text-align:center;margin:-6px 0 8px;height:22px"><span class="fi-badge" data-r="cb2" style="opacity:0">PHOTO OBLIGATOIRE</span></div>
      <div class="fi-bio" style="height:118px"><small>BIOGRAPHIE <span class="fi-badge" data-r="cb1" style="opacity:0">OBLIGATOIRE</span></small><span data-r="cbio"></span></div>
    </div>
  </div>
</div>

<div class="fi-abs fi-card fi-form" data-r="fD" style="opacity:0">
  <h5>Créer mon compte <span>Utilisateur</span></h5>
  <div class="fi-cols">
    <div class="fi-col"><div class="fi-sect">SÉCURITÉ</div>
      <div class="fi-fl"><label>Mot de passe *</label><div class="fi-pw"><span data-r="pw0"></span><span class="ok" style="font-size:24px;color:#16a34a;letter-spacing:0" data-r="pk0">✓</span></div>
        <div class="fi-str"><i data-r="pstr"></i></div><span class="fi-pill2" data-r="ppill" style="opacity:0">✓ 8 caractères minimum</span></div>
      <div class="fi-fl"><label>Confirmer *</label><div class="fi-pw"><span data-r="pw1"></span><span class="ok" style="font-size:24px;color:#16a34a;letter-spacing:0" data-r="pk1">✓</span></div></div>
    </div>
    <div class="fi-col" style="display:flex;flex-direction:column;justify-content:center;gap:16px">
      <div class="fi-note" style="background:#fff8ec;border-color:#f3d29a;font-size:16px;padding:14px"><div class="fi-chk" style="align-items:flex-start"><b data-r="dchk">✓</b><span>J'ai lu et j'accepte la <u data-r="dcharte">Charte Institutionnelle</u> ainsi que les <u data-r="dcgu">Conditions Générales d'Utilisation</u>. Cet engagement est obligatoire pour créer un compte.</span></div></div>
      <div class="fi-subb" data-r="dsubb" style="text-align:center;font-size:19px;padding:16px">Créer mon compte utilisateur</div>
    </div>
  </div>
</div>
<div data-r="burst"></div>

<svg class="fi-globe" data-r="lines" viewBox="0 0 1280 720" width="1280" height="720" aria-hidden="true" style="left:0;top:0"></svg>
<div class="fi-abs fi-past" data-r="past"></div><div class="fi-abs fi-pn" data-r="pn">Aminata K.</div>
<div class="fi-abs fi-sat" data-r="s0"><div class="e" style="background:linear-gradient(135deg,#2563eb,#4f8bff)">📖</div><b>Annuaire</b></div>
<div class="fi-abs fi-sat" data-r="s1"><div class="e" style="background:linear-gradient(135deg,#f59e0b,#f97316)">📅</div><b>Événements</b></div>
<div class="fi-abs fi-sat" data-r="s2"><div class="e" style="background:linear-gradient(135deg,#10b981,#34d399)">💚</div><b>Soutenir</b></div>
<div class="fi-abs fi-sat" data-r="s3"><div class="e" style="background:linear-gradient(135deg,#06b6d4,#38d4ee)">🛍️</div><b>Boutique</b></div>
<div class="fi-abs fi-sat" data-r="s4"><div class="e" style="background:linear-gradient(135deg,#8b5cf6,#a78bfa)">💬</div><b>Communauté</b></div>

<div class="fi-abs" data-r="lauG">${laurier(false)}</div><div class="fi-abs" data-r="lauD">${laurier(true)}</div>
<div class="fi-abs fi-big" data-r="t1">Rejoignez le <span class="gold">réseau</span></div>
<div class="fi-abs fi-script" data-r="t0">Ensemble, révélons les talents de notre diaspora !</div>
<div class="fi-abs fi-sub" data-r="t2">Créez votre compte dès maintenant</div>
<div class="fi-abs" data-r="t3"><span class="fi-cta">Créer mon compte</span></div>
<div class="fi-abs fi-url" data-r="t4">DIASPOACTIF.COM</div>
<div class="fi-abs" data-r="fade" style="width:${W}px;height:${H}px;background:#061633;opacity:0"></div>`;

  /* Effets sonores : [temps audio, type]. */
  const SFX_COURT = [[16.5, 'clic'], [17.6, 'clic'], [18.9, 'clic'], [20.55, 'pop'], [27.4, 'pop'], [28.7, 'tic'], [29.0, 'tic'], [29.5, 'tic'], [30.0, 'tic'], [30.5, 'tic'], [31.0, 'tic'], [31.05, 'chime'],
    [33.95, 'pop'], [35.3, 'pop'], [37.0, 'pop'], [38.4, 'pop'], [39.9, 'pop'], [43.4, 'chime']];

  /* ── Les deux films : même moteur, voix / sous-titres / effets / durée propres à chacun ── */
  const FILMS = {
    court: { id: 'court', etiquette: '55 s', voix: 'assets/media/inscription-voix.mp3?v=1', fin: 54.6, dvoix: 45.12, caps: CAPS_COURT, scenes: SCENES_COURT, sfx: SFX_COURT, swell: [31.5, 41] },
    long: { id: 'long', etiquette: '1 min 27', voix: 'assets/media/inscription-voix-long.mp3?v=1', fin: 87.0, dvoix: 79.36, caps: null, scenes: null, sfx: null, swell: [66.5, 74.5] },
  };
  let FILM = FILMS.long;

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
    if (a < FILM.dvoix + 0.2) return a > FILM.swell[0] && a < FILM.swell[1] ? 0.5 : 0.34;    // sous la voix, léger crescendo avant la fin
    const k = clamp((a - FILM.dvoix - 0.2) / 1.2);                       // la voix s'arrête : la musique s'ouvre
    const fin = 1 - clamp((a - (FILM.fin - LEAD - 1.5)) / 1.5);
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

  function rendreCourt(av) {
    /* « Réduire les animations » : on montre l'état FINAL de la scène en cours (images fixes), la voix continue. */
    let a = av;
    if (calme) { const s = FILM.scenes.find(x => av >= x[0] && av < x[1]) || FILM.scenes[FILM.scenes.length - 1]; a = s[1] - 0.02; }

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

    /* Scène 1 : bienvenue, logo en grand, devise de la plateforme */
    place(R.welc, 640, 98, 1, P(a, 0.2, 1.2) * (1 - P(a, 6.6, 7.4)));
    place(R.logo, 640, 340, lerp(0.6, 1.12, P(a, 2.0, 3.4, E.back)), P(a, 2.0, 3.0) * (1 - P(a, 6.6, 7.4)));
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
      place(el, x, y, s, a < 8.2 || a > 15.8 ? 0 : (i === 2 ? op * 0.8 : op));
      el.style.borderColor = lum > 0.05 ? `rgb(${Math.round(lerp(226, 255, lum))},${Math.round(lerp(169, 235, lum))},${Math.round(lerp(41, 168, lum))})` : '#E2A929';
      el.style.boxShadow = `0 14px 40px rgba(0,0,0,.4),0 0 ${lum * 55}px rgba(253,235,168,${lum * 0.75})`;
    });

    /* Étapes du vrai parcours : Type de compte · Informations · Confirmation */
    const etat = [a < 15.0 ? 'on' : 'done', a < 15.0 ? '' : a < 25.0 ? 'on' : 'done', a < 25.0 ? '' : a < 28.0 ? 'on' : 'done'];
    R.stEls.forEach((el, i) => { el.className = 'fi-st ' + etat[i]; el.querySelector('b').textContent = etat[i] === 'done' ? '✓' : String(i + 1); });
    place(R.steps, 640, 128, 1, P(a, 8.5, 9.3) * (1 - P(a, 31.0, 31.6)) * (a > 8.4 ? 1 : 0));

    /* Scène 3 : formulaire */
    const f = P(a, 15.0, 15.8, E.back) * (1 - P(a, 24.5, 25.2));
    place(R.form, 640, 386, lerp(0.88, 1, P(a, 15.0, 15.8, E.back)), (a < 14.9 || a > 25.3) ? 0 : f);
    R.chk.classList.toggle('on', a >= 23.4);
    const clic = P(a, 24.3, 24.45, E.lin) * (1 - P(a, 24.45, 24.7, E.lin));
    R.subb.style.transform = `scale(${1 - 0.05 * clic})`; R.subb.style.boxShadow = clic > 0.05 ? `0 0 ${10 + 26 * clic}px rgba(245,158,11,${0.9 * clic})` : '';
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
    R.fade.style.opacity = clamp((a - (FILM.fin - LEAD - 1.1)) / 1.1);
  }

  /* ═════ FILM COMPLET (≈ 1 min 30) : tutoriel pas à pas, calé mot à mot sur la voix (transcription horodatée) ═════ */
  const CAPS_LONG = [
    [0.0, 4.24, "Bienvenue sur Diaspo'Actif, la plateforme qui connecte les diasporas."],
    [4.29, 8.64, "Voyons ensemble, étape par étape, comment créer votre compte utilisateur."],
    [8.72, 10.88, "Étape un : le type de compte."],
    [11.0, 14.16, "Utilisateur, pour un particulier membre de la diaspora."],
    [14.28, 18.64, "Initiative, pour une association, une entreprise ou un projet collectif."],
    [18.68, 20.56, "Les comptes étatiques arrivent bientôt."],
    [20.64, 22.72, "Étape deux : vos informations."],
    [22.76, 26.32, "Renseignez votre nom, votre prénom et votre date de naissance."],
    [26.36, 28.4, "Les nationalités sont facultatives."],
    [28.48, 35.31, "Indiquez ensuite votre pays d'origine et votre pays de résidence : c'est grâce à eux que les membres de votre diaspora vous retrouvent."],
    [35.33, 37.6, "Puis choisissez votre domaine d'activité."],
    [37.64, 40.8, "Précisez les publics qui vous concernent et ce que vous recherchez."],
    [40.84, 46.96, "Puis rédigez une courte biographie et ajoutez votre photo de profil : ces deux éléments sont obligatoires."],
    [47.04, 54.4, "Choisissez un mot de passe d'au moins huit caractères, acceptez la charte et les conditions d'utilisation, puis cliquez sur Créer mon compte."],
    [54.48, 59.28, "Étape trois : confirmez votre adresse e-mail grâce au lien reçu dans votre boîte de réception."],
    [59.44, 60.93, "Votre compte est créé !"],
    [60.99, 63.2, "Une jauge indique l'état de votre profil."],
    [63.28, 66.64, "Complétez-le jusqu'à cent pour cent pour être mieux repéré dans le réseau."],
    [66.68, 74.08, "Vous pouvez alors explorer l'annuaire, rejoindre des événements, soutenir des projets, ouvrir votre boutique et échanger avec la communauté."],
    [74.12, 77.52, "Diaspo'Actif : rejoignez le réseau, et passez à l'action."],
    [77.56, 79.36, "Créez votre compte dès maintenant."],
  ];
  const FIN_LONG = 87.0;
  const SCENES_LONG = [[-LEAD, 8.7], [8.7, 20.6], [20.6, 28.4], [28.4, 37.6], [37.6, 47.0], [47.0, 54.4], [54.4, 60.95], [60.95, 66.7], [66.7, 74.1], [74.1, FIN_LONG - LEAD]];
  const SFX_LONG = [[24.1, 'clic'], [24.9, 'clic'], [26.4, 'clic'], [30.4, 'clic'], [31.8, 'clic'], [37.1, 'clic'], [38.5, 'pop'], [39.0, 'pop'], [40.4, 'pop'], [40.8, 'pop'], [44.2, 'pop'], [48.1, 'tic'], [49.4, 'tic'],
    [50.5, 'clic'], [53.6, 'pop'], [59.5, 'pop'], [60.5, 'chime'], [63.5, 'tic'], [63.85, 'tic'], [64.2, 'tic'], [64.5, 'tic'], [64.8, 'tic'], [64.85, 'chime'], [68.2, 'pop'], [69.6, 'pop'], [70.9, 'pop'], [72.0, 'pop'], [73.55, 'pop'], [77.9, 'chime']];

  function rendreLong(av) {
    let a = av;
    if (calme) { const s = FILM.scenes.find(x => av >= x[0] && av < x[1]) || FILM.scenes[FILM.scenes.length - 1]; a = s[1] - 0.02; }

    /* Fond vivant + décor fixe */
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

    /* Scène 1 : bienvenue */
    const s1out = 1 - P(a, 7.0, 7.8);
    place(R.welc, 640, 98, 1, P(a, 0.2, 1.2) * s1out);
    place(R.logo, 640, 340, lerp(0.6, 1.12, P(a, 2.0, 3.4, E.back)), P(a, 2.0, 3.0) * s1out);
    place(R.tag, 640, 585, 1, P(a, 4.3, 5.3) * s1out);
    place(R.head, 300, 78, 1, P(a, 7.8, 8.8) * (1 - P(a, 73.8, 74.4)));

    /* Étapes du vrai parcours */
    const etat = [a < 20.5 ? 'on' : 'done', a < 20.5 ? '' : a < 54.4 ? 'on' : 'done', a < 54.4 ? '' : a < 60.9 ? 'on' : 'done'];
    R.stEls.forEach((el, i) => { el.className = 'fi-st ' + etat[i]; el.querySelector('b').textContent = etat[i] === 'done' ? '✓' : String(i + 1); });
    place(R.steps, 640, 128, 1, P(a, 8.7, 9.4) * (1 - P(a, 66.4, 67.0)) * (a > 8.6 ? 1 : 0));

    /* Scène 2 : le type de compte (étape 1) */
    const enter = [8.9, 9.2, 9.5], xs = [330, 640, 950];
    const win = [[11.0, 14.16], [14.28, 18.64], [18.68, 20.56]];
    [0, 1, 2].forEach(i => {
      const e = P(a, enter[i], enter[i] + 0.7, E.back);
      const lum = P(a, win[i][0] - 0.1, win[i][0] + 0.25) * (1 - P(a, win[i][1] - 0.15, win[i][1] + 0.25));
      const op = P(a, enter[i], enter[i] + 0.5) * (1 - P(a, 20.2, 20.9));
      const el = R['c' + i];
      place(el, xs[i], lerp(470, 370, e), lerp(0.9, 1, e) * (1 + 0.07 * lum), a < 8.8 || a > 21 ? 0 : (i === 2 ? op * 0.82 : op));
      el.style.borderColor = lum > 0.05 ? `rgb(${Math.round(lerp(226, 255, lum))},${Math.round(lerp(169, 235, lum))},${Math.round(lerp(41, 168, lum))})` : '#E2A929';
      el.style.boxShadow = `0 14px 40px rgba(0,0,0,.4),0 0 ${lum * 55}px rgba(253,235,168,${lum * 0.75})`;
    });

    R.form.style.opacity = 0; // formulaire de la version courte : jamais affiché ici
    /* Cartes de saisie : fondu enchaîné d'un formulaire au suivant */
    const carte = (el, a0, a1, b0, b1) => place(el, 640, 386, lerp(0.9, 1, P(a, a0, a1 + 0.4, E.back)), (a < a0 - 0.1 || a > b1 + 0.1) ? 0 : P(a, a0, a1) * (1 - P(a, b0, b1)));
    const champ = (pre, i, txt, t0, t1) => { R[pre + i].textContent = tape(txt, a, t0, t1); R[pre + 'k' + i].style.opacity = P(a, t1 + 0.05, t1 + 0.25); };

    /* Scène 3 : identité et nationalités (étape 2) */
    carte(R.fA, 20.5, 21.2, 28.3, 28.9);
    champ('a', 0, 'Kouadio', 23.55, 24.0); champ('a', 1, 'Aminata', 24.3, 24.8); champ('a', 2, '12/03/1992', 25.25, 26.2);
    const glow = P(a, 26.4, 26.9) * (1 - P(a, 28.0, 28.4));
    R.anat.style.transform = `scale(${1 + 0.025 * glow})`; R.anat.style.opacity = lerp(0.55, 1, P(a, 26.3, 26.9));

    /* Scène 4 : origine, résidence, domaine, et la carte qui relie la diaspora */
    carte(R.fB, 28.3, 28.9, 37.5, 38.1);
    champ('q', 0, "Côte d'Ivoire", 29.6, 30.3); champ('q', 1, 'France', 30.8, 31.5); champ('q', 2, 'Entrepreneuriat', 35.8, 36.9);
    const mp = P(a, 31.6, 32.2);
    R.marc.parentNode.parentNode.style.opacity = mp;
    R.marc.setAttribute('stroke-dashoffset', (1 - P(a, 32.2, 34.4, E.inout)).toFixed(3));
    const pul = 1 + 0.25 * Math.sin(a * 5);
    R.mdo.setAttribute('r', (9 * pul).toFixed(1)); R.mdb.setAttribute('r', (9 * (a > 34.2 ? pul : 1)).toFixed(1));

    /* Scène 5 : profil public, biographie et photo obligatoires */
    carte(R.fC, 37.5, 38.1, 46.9, 47.5);
    const chips = [[R.chipsA, 1, 38.5], [R.chipsA, 0, 39.0], [R.chipsB, 1, 40.35], [R.chipsB, 3, 40.75]];
    [R.chipsA, R.chipsB].forEach(g => [...g.children].forEach(c => c.classList.remove('on')));
    chips.forEach(([g, i, t]) => { if (a >= t) g.children[i].classList.add('on'); });
    R.cbio.textContent = tape("Passionnée d'entrepreneuriat, je cherche des partenaires pour un projet agricole en Côte d'Ivoire.", a, 41.3, 45.6);
    R.cb1.style.opacity = P(a, 42.3, 42.8) ; R.cb1.style.transform = `scale(${1 + 0.12 * Math.sin(Math.max(0, a - 46) * 9) * P(a, 46, 46.2)})`;
    const cphoto = P(a, 43.9, 44.5, E.back);
    R.cph.style.transform = `scale(${cphoto})`; R.cph.style.opacity = cphoto > 0 ? 1 : 0; R.cav.classList.toggle('set', cphoto > 0.5);
    R.cb2.style.opacity = P(a, 44.9, 45.4);

    /* Scène 6 : mot de passe, charte, bouton */
    carte(R.fD, 46.9, 47.5, 54.3, 54.9);
    R.pw0.textContent = tape('••••••••', a, 47.6, 48.2); R.pk0.style.opacity = P(a, 48.3, 48.5);
    R.pstr.style.width = (P(a, 47.6, 49.4, E.lin) * 100).toFixed(0) + '%';
    R.ppill.style.opacity = P(a, 48.5, 48.9);
    R.pw1.textContent = tape('••••••••', a, 48.8, 49.4); R.pk1.style.opacity = P(a, 49.5, 49.7);
    R.dchk.classList.toggle('on', a >= 50.2);
    R.dcharte.classList.toggle('hl', a >= 50.1 && a < 50.7); R.dcgu.classList.toggle('hl', a >= 50.7 && a < 52.2);
    const clic = P(a, 53.3, 53.5, E.lin) * (1 - P(a, 53.5, 53.9, E.lin));
    R.dsubb.style.transform = `scale(${1 - 0.05 * clic})`; R.dsubb.style.boxShadow = clic > 0.05 ? `0 0 ${10 + 26 * clic}px rgba(245,158,11,${0.9 * clic})` : '';

    /* Scène 7 : l'e-mail de confirmation (étape 3) */
    place(R.env, 640, 370, lerp(0.8, 1.2, P(a, 54.6, 55.5, E.back)), P(a, 54.6, 55.3) * (1 - P(a, 60.7, 61.2)) * (a > 54.5 && a < 61.3 ? 1 : 0));
    R.flap.style.transform = `rotateX(${lerp(0, 175, P(a, 57.2, 58.0, E.inout))}deg)`;
    const eo = P(a, 59.45, 59.95, E.back);
    R.envok.style.transform = `scale(${eo})`; R.envok.style.transformOrigin = '198px 52px'; R.envck.style.opacity = eo > 0.2 ? 1 : 0;
    R.envl.style.opacity = P(a, 59.5, 60.0);
    const bs1 = P(a, 59.5, 60.5, E.lin);
    R.burst.innerHTML = a > 59.5 && a < 60.6 ? Array.from({ length: 16 }, (_, i) => { const an = i / 16 * Math.PI * 2, d = 40 + bs1 * 210; return `<i style="position:absolute;left:${640 + Math.cos(an) * d}px;top:${370 + Math.sin(an) * d * .75}px;width:11px;height:11px;border-radius:50%;background:${i % 3 === 0 ? '#F26422' : '#F8DA7A'};opacity:${1 - bs1}"></i>`; }).join('') : '';

    /* Scène 8 : la jauge d'état de profil */
    place(R.prof, 640, 385, lerp(0.88, 1, P(a, 61.0, 61.8, E.back)), (a < 60.9 || a > 67.0) ? 0 : P(a, 61.0, 61.6) * (1 - P(a, 66.3, 66.9)));
    const ckT = { res: -1, pho: 63.4, bio: 63.8, com: 64.15, ori: 64.45, dom: 64.75 };
    let nOn = 0;
    R.ckEls.forEach(d => { const on = a >= (ckT[d.dataset.k] ?? 99) && (ckT[d.dataset.k] >= 0 || a >= 61.4); d.classList.toggle('on', on); if (on) nOn++; });
    const pct = Math.round(nOn / 6 * 100);
    R.pct.textContent = pct + ' %'; R.bar.style.width = pct + '%'; R.bar.style.transition = calme ? 'none' : 'width .45s ease';

    /* Scène 9 : ce que l'on peut faire ensuite */
    const inS9 = a > 66.5 && a < 74.5, pIn = P(a, 66.8, 67.6, E.back), pOut = P(a, 73.9, 74.5);
    place(R.past, 640, 355, lerp(0.5, 1, pIn), inS9 ? pIn * (1 - pOut) : 0);
    place(R.pn, 640, 478, 1, inS9 ? P(a, 67.2, 67.9) * (1 - pOut) : 0);
    const ln = [], sc = [68.0, 69.45, 70.75, 71.85, 73.4];
    sc.forEach((tc, i) => {
      const an = (-90 + i * 72) * Math.PI / 180 + (calme ? 0 : Math.sin(a * 0.4) * 0.06), x = 640 + Math.cos(an) * 410, y = 355 + Math.sin(an) * 232;
      const e = P(a, tc - 0.6, tc + 0.15, E.back);
      place(R['s' + i], lerp(640, x, e), lerp(355, y, e), lerp(0.4, 1, e), inS9 ? e * (1 - pOut) : 0);
      if (inS9 && e > 0) ln.push(`<line x1="640" y1="355" x2="${lerp(640, x, e).toFixed(1)}" y2="${lerp(355, y, e).toFixed(1)}" stroke="#E2A929" stroke-width="3.5" stroke-opacity="${(0.75 * (1 - pOut)).toFixed(2)}" stroke-dasharray="9 8"/>`);
    });
    R.lines.innerHTML = ln.join('');

    /* Scène 10 : appel à l'action */
    const fin6 = P(a, 74.1, 75.0), on6 = a > 74.0 ? 1 : 0, lau = P(a, 74.6, 75.8, E.back);
    place(R.t1, 640, 240, lerp(0.92, 1, fin6), fin6 * on6);
    place(R.lauG, 150, 250, 0.62 * lerp(0.7, 1, lau), P(a, 74.6, 75.6) * on6);
    place(R.lauD, 1130, 250, 0.62 * lerp(0.7, 1, lau), P(a, 74.6, 75.6) * on6);
    place(R.t0, 640, 328, 1, P(a, 75.6, 76.6) * on6);
    place(R.t2, 640, 396, 1, P(a, 77.5, 78.2) * on6);
    place(R.t3, 640, 490, lerp(0.8, 1, P(a, 77.8, 78.5, E.back)) * (calme ? 1 : 1 + 0.045 * Math.sin(Math.max(0, a - 78.5) * 4.2)), P(a, 77.8, 78.4) * on6);
    place(R.t4, 640, 590, 1, P(a, 78.6, 79.6) * on6);
    R.fade.style.left = '0'; R.fade.style.top = '0'; R.fade.style.transform = '';
    R.fade.style.opacity = clamp((a - (FILM.fin - LEAD - 1.1)) / 1.1);
  }

  FILMS.long.caps = CAPS_LONG; FILMS.long.scenes = SCENES_LONG; FILMS.long.sfx = SFX_LONG;

  /* ═══ Tuto « Événements flash » (2026-10-12) : décor, sous-titres, effets, scènes ═══ */
  const STAGE_FLASH_HTML = `
<div class="fi-bg"></div>
<div class="fi-blob b1" data-r="b1"></div><div class="fi-blob b2" data-r="b2"></div>
<div data-r="parts"></div>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="fiGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FDEBA8"/><stop offset=".5" stop-color="#E8B22E"/><stop offset="1" stop-color="#B67E14"/></linearGradient>
</defs></svg>
<svg class="fi-globe" data-r="rub" viewBox="0 0 1280 720" width="1280" height="720" aria-hidden="true">
  <path d="M0 650 C 300 612, 640 700, 1280 640 L1280 720 L0 720 Z" fill="#061633" opacity=".94"/>
  <path d="M0 650 C 300 612, 640 700, 1280 640" fill="none" stroke="url(#fiGold)" stroke-width="5"/>
  <path d="M0 662 C 300 624, 640 712, 1280 652" fill="none" stroke="#1B7F3B" stroke-width="3" opacity=".9"/>
</svg>
<div class="fi-abs fi-motto" data-r="motto">Rassembler · Mobiliser · Impacter</div>
<div class="fi-abs fi-head" data-r="head"><img src="assets/media/logo-film.webp" alt=""><span>Diaspo<i>'</i>Actif</span></div>

<div class="fi-abs ff-title gold" data-r="ft"><span>⚡</span>ÉVÉNEMENT FLASH</div>
<div class="fi-abs fi-tag" data-r="fsub">UNE ANNONCE · SANS INSCRIPTION</div>
<div class="fi-abs ff-demo" data-r="fdemo"><span class="b">S'inscrire</span><i class="st" data-r="fstrike"></i><em>aucune inscription</em></div>
<div class="fi-abs ff-mini" data-r="fc0"><div class="ff-mini-t">VOTRE ÉVÉNEMENT</div><div class="ff-org"><img src="assets/media/logo-film.webp" alt=""><span>Diaspo'Actif</span></div><div class="ff-mini-n">Forum de la diaspora</div><div class="ff-mini-d">📅 Sam. 7 novembre · Toulouse</div><span class="ff-flash">⚡ FLASH</span></div>
<div class="fi-abs ff-mini" data-r="fc1"><div class="ff-mini-t">ÉVÉNEMENT RELAYÉ</div><div class="ff-org"><b>AT</b><span>Association Les Tisserands</span></div><div class="ff-mini-n">Festival des cultures</div><div class="ff-mini-d">📅 Sam. 14 novembre · Lyon</div><span class="ff-flash">⚡ FLASH</span></div>
<div class="fi-abs ff-pill" data-r="fbell">🔔 La diaspora est informée</div>

<div class="fi-abs ff-steps" data-r="steps"><div class="fi-st" data-s="0"><b>1</b><span>Connexion</span></div><i class="fi-sl"></i><div class="fi-st" data-s="1"><b>2</b><span>Événements</span></div><i class="fi-sl"></i><div class="fi-st" data-s="2"><b>3</b><span>Informations</span></div><i class="fi-sl"></i><div class="fi-st" data-s="3"><b>4</b><span>Récapitulatif</span></div><i class="fi-sl"></i><div class="fi-st" data-s="4"><b>5</b><span>Publication</span></div></div>

<div class="fi-abs ff-bar" data-r="fbar"><img src="assets/media/logo-film.webp" alt=""><span class="lg">DIASPO'ACTIF</span><span class="nv"><span>Accueil</span><span>Annuaire</span><span>Boutiques</span><span>Événements</span></span><span class="ch" data-r="fchip"><i></i><span><b>ZADI</b><span>Initiative</span></span></span></div>
<div class="fi-abs ff-pill" data-r="fconn">Connecté avec votre compte Initiative</div>

<div class="fi-abs fi-card ff-page" data-r="fev">
  <div class="ff-ph">📅 Événements Diaspo'Actif</div><div class="ff-ps">Tous les événements présents sur la plateforme, réunis au même endroit.</div>
  <div class="ff-b" style="left:24px;top:150px;width:190px">🔔 Alertes</div>
  <div class="ff-b" style="left:226px;top:150px;width:196px">📅 Calendrier</div>
  <div class="ff-b green" data-r="fbtn" style="left:434px;top:150px;width:210px">⚡ Événement flash</div>
  <div class="ff-q" style="left:652px;top:150px">?</div>
  <div class="ff-b blue" data-r="fcreate" style="left:716px;top:150px;width:250px">📣 Créer un événement</div>
  <div class="ff-sk" style="left:24px;top:250px"></div><div class="ff-sk" style="left:340px;top:250px"></div><div class="ff-sk" style="left:656px;top:250px"></div>
</div>
<div class="fi-abs ff-call" data-r="fcall">avec des inscriptions</div>
<svg class="fi-abs ff-cur" data-r="fcur" width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.6 L11 13.5 L18 13.5 Z" fill="#fff" stroke="#0B2A5B" stroke-width="1.5" stroke-linejoin="round"/></svg>

<div class="fi-abs fi-card ff-fm" data-r="fform">
  <h5>⚡ Événement flash <span>Sans inscription</span></h5>
  <div class="fi-cols">
    <div class="fi-col">
      <div class="fi-fl"><label>TITRE *</label><div class="v"><span data-r="x0"></span><span class="ok" data-r="k0">✓</span></div></div>
      <div class="ff-row2"><div class="fi-fl"><label>DATE *</label><div class="v"><span data-r="x1"></span><span class="ok" data-r="k1">✓</span></div></div><div class="fi-fl"><label>HEURE DE DÉBUT</label><div class="v">09:00</div></div></div>
      <div class="fi-fl"><label>ADRESSE DE L'ÉVÉNEMENT *</label><div class="v"><span data-r="x2"></span><span class="ok" data-r="k2">✓</span></div></div>
      <div class="fi-fl"><label>DESCRIPTION *</label><div class="fi-bio" style="height:96px;font-size:17px"><span data-r="x3"></span></div></div>
    </div>
    <div class="fi-col">
      <div class="fi-fl"><label>PHOTOS</label><div class="ff-ph2"><div class="ff-tile ff-t1">📷<i data-r="p1"></i></div><div class="ff-tile ff-t2">📷<i data-r="p2"></i></div></div></div>
      <div class="fi-fl" data-r="forga"><label>ORGANISATEUR (SI CE N'EST PAS VOUS) · LOGO</label><div class="ff-row2" style="align-items:center"><div class="v" style="flex:3;height:44px;border-radius:12px;border:2px solid #c7d7ee;background:#fff;padding:0 14px;display:flex;align-items:center;font-size:19px;font-weight:600"><span data-r="x4"></span></div><div class="ff-tile" style="flex:none;width:64px;height:64px;border-radius:50%;font-size:22px">🏷️<i data-r="lg" style="background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-style:normal;font-size:20px">AT</i></div></div></div>
      <div class="fi-fl"><label>VISIBILITÉ</label>
        <div class="ff-rad" data-r="r0"><b></b><span>🌍🛍 Calendrier public ET boutique</span></div>
        <div class="ff-rad" data-r="r1"><b></b><span>🌍 Calendrier public uniquement</span></div>
        <div class="ff-rad" data-r="r2"><b></b><span>🛍 Page boutique uniquement</span></div>
      </div>
    </div>
  </div>
</div>

<div class="fi-abs fi-card ff-rec" data-r="frec">
  <div class="ff-aff">FORUM DE LA DIASPORA<br>SAMEDI 7 NOVEMBRE · TOULOUSE</div>
  <div class="ff-rl"><b>Titre :</b> Forum de la diaspora d'Occitanie<br><b>Date :</b> samedi 7 novembre 2026 à 09:00<br><b>Adresse :</b> 153 avenue de Lardenne, Toulouse<br><b>Organisateur :</b> Association Les Tisserands<br><b>Visible :</b> 🌍🛍 calendrier public et boutique</div>
  <div class="ff-rn">ℹ️ Événement informatif — aucune inscription ne sera proposée.</div>
  <div class="ff-rb"><span class="ff-bt o" data-r="fmod">← Modifier</span><span class="ff-bt p" data-r="fconf">✅ Confirmer et publier</span></div>
</div>
<div class="fi-abs ff-toast" data-r="ftoast">✅ Événement publié</div>
<div class="fi-abs fi-card ff-lst" data-r="flist">
  <div class="ban">FORUM DE LA DIASPORA</div>
  <div class="bd"><div class="dt">SAMEDI 7 NOVEMBRE 2026 · 09:00</div><div class="tt">Forum de la diaspora d'Occitanie</div>
    <div class="ch"><em>Gratuit</em><em class="fl" data-r="fbadge">⚡ Flash</em><em>0 inscrit</em></div>
    <div class="bs"><span>Voir</span><span>Partager</span><span class="in">Informatif</span></div></div>
</div>
<div class="fi-abs ff-pill" data-r="fnoins">Pas de bouton « S'inscrire »</div>

<div class="fi-abs" data-r="lauG">${laurier(false)}</div><div class="fi-abs" data-r="lauD">${laurier(true)}</div>
<div class="fi-abs fi-logo" data-r="logoF" style="width:230px;height:230px;margin:0"><img src="assets/media/logo-film.webp" alt="" style="width:100%;height:100%;border-radius:50%"></div>
<div class="fi-abs fi-big" data-r="t1">Informez la <span class="gold">diaspora</span></div>
<div class="fi-abs fi-script" data-r="t0">en un instant</div>
<div class="fi-abs" data-r="t3"><span class="fi-cta">Publier un événement flash</span></div>
<div class="fi-abs fi-url" data-r="t4">DIASPOACTIF.COM</div>
<div class="fi-abs" data-r="fade" style="width:${W}px;height:${H}px;background:#061633;opacity:0"></div>`;

  const CAPS_FLASH = [
    [0.0, 2.4, "Un événement à annoncer, sans inscription ?"],
    [2.5, 6.6, "Utilisez l'événement flash : une annonce publiée en quelques secondes."],
    [6.6, 11.2, "Pour vos événements, ou pour relayer celui d'un autre organisateur et informer la diaspora."],
    [11.5, 14.8, "Un : connectez-vous avec votre compte Initiative."],
    [14.76, 18.9, "Deux : dans l'espace Événements, cliquez sur le bouton vert « Événement flash »."],
    [19.1, 22.7, "Avec des inscriptions ? Choisissez plutôt « Créer un événement »."],
    [22.7, 27.9, "Trois : renseignez le titre, la date, l'adresse, la description et vos photos."],
    [27.9, 30.95, "Autre organisateur ? Ajoutez son nom et son logo."],
    [30.96, 35.05, "Choisissez la visibilité : calendrier public, boutique, ou les deux."],
    [35.08, 39.2, "Quatre : vérifiez le récapitulatif, vous pouvez encore modifier."],
    [39.2, 41.5, "Cinq : confirmez et publiez !"],
    [41.5, 45.7, "L'annonce apparaît aussitôt, avec son badge « Flash », sans inscription."],
    [45.7, 49.3, "Diaspo'Actif : informez la diaspora, en un instant."],
  ];
  const SCENES_FLASH = [[-LEAD, 11.4], [11.4, 14.9], [14.9, 22.7], [22.7, 35.1], [35.1, 39.4], [39.4, 45.6], [45.6, 54.0 - LEAD]];
  const SFX_FLASH = [[2.2, 'clic'], [6.7, 'pop'], [8.1, 'pop'], [10.0, 'pop'], [13.45, 'chime'], [18.4, 'clic'], [21.0, 'pop'], [24.55, 'tic'], [25.25, 'tic'], [26.0, 'tic'], [26.8, 'tic'],
    [27.6, 'pop'], [30.2, 'pop'], [32.5, 'clic'], [33.7, 'clic'], [34.6, 'clic'], [37.4, 'pop'], [40.65, 'clic'], [41.3, 'chime'], [43.6, 'pop'], [45.7, 'chime']];

  function rendreFlash(av) {
    let a = av;
    if (calme) { const s = FILM.scenes.find(x => av >= x[0] && av < x[1]) || FILM.scenes[FILM.scenes.length - 1]; a = s[1] - 0.02; }
    const w = (a0, a1, f) => P(a, a0, a0 + (f || 0.5)) * (1 - P(a, a1 - (f || 0.5), a1));   // fenêtre de visibilité (fondu entrant / sortant)
    const pic = (a0, a1) => P(a, a0, a0 + 0.25, E.lin) * (1 - P(a, a1 - 0.25, a1, E.lin));   // impulsion lumineuse

    R.b1.style.transform = `translate(${Math.sin(a * .2) * 60}px,${Math.cos(a * .17) * 40}px)`;
    R.b2.style.transform = `translate(${Math.cos(a * .15) * -70}px,${Math.sin(a * .21) * -50}px)`;
    R.pa.forEach((e, i) => {
      const sx = (i * 197.3) % W, sy = (i * 83.7) % H, v = 8 + (i % 5) * 4;
      e.el.style.transform = `translate(${(sx + Math.sin(a * .3 + i) * 30) % W}px,${((sy - a * v) % H + H) % H}px)`;
      e.el.style.opacity = .25 + .35 * Math.abs(Math.sin(a * .8 + i));
    });
    const dec = P(a, -1.2, -0.3);
    R.rub.style.opacity = dec * (1 - P(a, 45.4, 46.2));
    place(R.motto, 640, 690, 1, dec * 0.95 * (1 - P(a, 45.4, 46.2)));
    place(R.head, 300, 62, 1, P(a, 11.0, 11.9) * (1 - P(a, 45.4, 46.2)));

    /* Scène 1 : « Événement flash » — une annonce, sans inscription ; pour soi ou pour relayer un événement d'autrui */
    place(R.ft, 640, 150, lerp(0.9, 1, P(a, 0.2, 1.4, E.back)), P(a, 0.2, 1.2) * (1 - P(a, 10.6, 11.4)));
    place(R.fsub, 640, 232, 1, P(a, 3.9, 4.9) * (1 - P(a, 10.6, 11.4)));
    place(R.fdemo, 640, 345, lerp(0.85, 1, P(a, 1.4, 2.2, E.back)), P(a, 1.4, 2.0) * (1 - P(a, 5.4, 6.0)));
    R.fstrike.style.transform = `scaleX(${P(a, 2.1, 2.9, E.inout)})`;
    [[R.fc0, 400, 6.5, 6.88, 7.6], [R.fc1, 880, 7.9, 8.8, 9.75]].forEach(([el, x, t0, c0, c1]) => {
      const e = P(a, t0, t0 + 0.7, E.back), lum = pic(c0, c1);
      place(el, x, lerp(560, 500, e), lerp(0.88, 1, e) * (1 + 0.05 * lum), P(a, t0, t0 + 0.5) * (1 - P(a, 10.7, 11.4)));
      el.style.borderColor = lum > 0.05 ? '#FDEBA8' : '#E2A929';
      el.style.boxShadow = `0 14px 40px rgba(0,0,0,.4),0 0 ${lum * 50}px rgba(253,235,168,${lum * 0.7})`;
    });
    place(R.fbell, 640, 372, lerp(0.85, 1, P(a, 9.85, 10.5, E.back)), P(a, 9.85, 10.4) * (1 - P(a, 10.8, 11.4)));

    /* Suivi des 5 étapes */
    const idx = a < 14.9 ? 0 : a < 22.7 ? 1 : a < 35.1 ? 2 : a < 39.4 ? 3 : 4;
    R.stEls.forEach((el, i) => { const st = i < idx ? 'done' : i === idx ? (a >= 45.6 ? 'done' : 'on') : ''; el.className = 'fi-st ' + st; el.querySelector('b').textContent = st === 'done' ? '✓' : String(i + 1); });
    place(R.steps, 640, 140, 1, P(a, 11.3, 12.0) * (1 - P(a, 45.0, 45.7)) * (a > 11.2 ? 1 : 0));

    /* Scène 2 (étape 1) : barre du site, compte Initiative connecté */
    place(R.fbar, 640, 330, lerp(0.94, 1, P(a, 11.7, 12.6)), P(a, 11.7, 12.4) * (1 - P(a, 14.5, 15.1)));
    const lc = pic(13.5, 14.8);
    R.fchip.style.boxShadow = `0 0 ${lc * 34}px rgba(253,235,168,${lc * 0.9})`; R.fchip.style.borderColor = lc > 0.05 ? '#FDEBA8' : 'rgba(255,255,255,.3)';
    place(R.fconn, 640, 440, lerp(0.9, 1, P(a, 13.4, 14.0, E.back)), P(a, 13.4, 14.0) * (1 - P(a, 14.5, 15.1)));

    /* Scène 3 (étape 2) : page Événements, bouton vert « Événement flash » ; « Créer un événement » = avec inscriptions */
    place(R.fev, 640, 415, lerp(0.9, 0.95, P(a, 15.0, 15.9)), P(a, 15.0, 15.7) * (1 - P(a, 22.3, 22.9)));
    const gf = pic(17.0, 18.95), gc = pic(20.4, 22.6);
    R.fbtn.style.boxShadow = gf > 0.05 ? `0 0 ${gf * 40}px rgba(74,222,128,${gf})` : ''; R.fbtn.style.transform = `scale(${1 + 0.06 * gf - 0.07 * P(a, 18.3, 18.4, E.lin) * (1 - P(a, 18.5, 18.7, E.lin))})`;
    R.fcreate.style.boxShadow = gc > 0.05 ? `0 0 ${gc * 40}px rgba(96,165,250,${gc})` : ''; R.fcreate.style.transform = `scale(${1 + 0.05 * gc})`;
    place(R.fcall, 945, 338, lerp(0.9, 1, P(a, 19.2, 19.8, E.back)), P(a, 19.2, 19.8) * (1 - P(a, 22.2, 22.8)));
    { const m = P(a, 16.2, 18.2, E.inout);
      place(R.fcur, lerp(930, 660, m) + 12, lerp(590, 387, m) + 14, 1, P(a, 16.0, 16.5) * (1 - P(a, 18.9, 19.4)) * (a > 15.9 ? 1 : 0)); }

    /* Scène 4 (étape 3) : le formulaire se remplit */
    place(R.fform, 640, 425, lerp(0.85, 0.9, P(a, 22.8, 23.6, E.back)), P(a, 22.8, 23.5) * (1 - P(a, 34.7, 35.3)));
    R.x0.textContent = tape("Forum de la diaspora d'Occitanie", a, 23.7, 24.55); R.k0.style.opacity = a >= 24.6 ? 1 : 0;
    R.x1.textContent = tape('07/11/2026', a, 24.7, 25.25); R.k1.style.opacity = a >= 25.3 ? 1 : 0;
    R.x2.textContent = tape('153 avenue de Lardenne, Toulouse', a, 25.35, 26.0); R.k2.style.opacity = a >= 26.05 ? 1 : 0;
    R.x3.textContent = tape("Rencontre ouverte à toute la diaspora. Entrée libre.", a, 26.2, 26.85);
    R.p1.style.opacity = P(a, 27.3, 27.6); R.p2.style.opacity = P(a, 27.55, 27.85);
    const go = pic(27.95, 30.95);
    R.forga.className = 'fi-fl' + (go > 0.05 ? ' ff-glow' : ''); R.forga.style.padding = '6px'; R.forga.style.margin = '-6px -6px 4px';
    R.x4.textContent = tape('Association Les Tisserands', a, 29.15, 30.1); R.lg.style.opacity = P(a, 30.1, 30.8);
    const sel = a >= 34.6 ? 0 : -1, pk = a >= 34.6 ? 0 : a >= 33.7 ? 2 : a >= 32.5 ? 1 : -1;
    [0, 1, 2].forEach(i => { R['r' + i].className = 'ff-rad' + (i === sel ? ' on' : '') + (i === pk && a < 34.9 ? ' pk' : ''); });

    /* Scène 5 (étape 4) : récapitulatif puis clic sur « Confirmer et publier » */
    place(R.frec, 640, 425, lerp(0.9, 0.93, P(a, 35.3, 36.1, E.back)), P(a, 35.3, 36.0) * (1 - P(a, 40.9, 41.4)));
    const pm = pic(37.4, 39.15), pcf = pic(39.8, 40.65);
    R.fmod.style.boxShadow = pm > 0.05 ? `0 0 ${pm * 26}px rgba(96,165,250,${pm})` : ''; R.fmod.style.transform = `scale(${1 + 0.07 * pm})`;
    R.fconf.style.boxShadow = `0 8px 20px rgba(226,169,41,.45)${pcf > 0.05 ? `,0 0 ${pcf * 40}px rgba(253,235,168,${pcf})` : ''}`;
    R.fconf.style.transform = `scale(${1 + 0.06 * pcf - 0.08 * P(a, 40.55, 40.65, E.lin) * (1 - P(a, 40.75, 40.95, E.lin))})`;

    /* Scène 6 (étape 5) : l'annonce apparaît dans la liste, badge Flash, pas de bouton « S'inscrire » */
    place(R.ftoast, 640, 218, lerp(0.85, 1, P(a, 41.0, 41.6, E.back)), P(a, 41.0, 41.5) * (1 - P(a, 44.0, 44.6)));
    place(R.flist, 640, 440, lerp(0.9, 1, P(a, 41.3, 42.1, E.back)), P(a, 41.3, 42.0) * (1 - P(a, 45.1, 45.7)));
    const bf = pic(43.4, 44.6);
    R.fbadge.style.boxShadow = bf > 0.05 ? `0 0 ${bf * 26}px rgba(74,222,128,${bf})` : ''; R.fbadge.style.transform = `scale(${1 + 0.18 * bf})`;
    place(R.fnoins, 640, 218, lerp(0.9, 1, P(a, 44.6, 45.1, E.back)), P(a, 44.6, 45.0) * (1 - P(a, 45.2, 45.7)));

    /* Scène 7 : conclusion */
    const fin = P(a, 45.7, 46.6);
    place(R.lauG, 250, 330, 1, fin * 0.9); place(R.lauD, 1030, 330, 1, fin * 0.9);
    place(R.logoF, 640, 205, lerp(0.7, 1, P(a, 45.8, 46.8, E.back)), fin);
    place(R.t1, 640, 395, 1, P(a, 46.6, 47.4)); place(R.t0, 640, 470, 1, P(a, 47.4, 48.3));
    place(R.t3, 640, 560, lerp(0.9, 1, P(a, 48.6, 49.3, E.back)) * (1 + 0.04 * Math.sin(a * 5) * P(a, 49.3, 50)), P(a, 48.6, 49.3));
    place(R.t4, 640, 612, 1, P(a, 49.4, 50.2));
    R.fade.style.opacity = P(a, 52.0, 52.5);
  }

  FILMS.flash = { id: 'flash', stage: 'flash', etiquette: '55 s', titre: 'TUTO · ÉVÉNEMENTS FLASH', aria: "Tuto vidéo : publier un événement flash sur Diaspo'Actif", cta: { label: 'Publier un événement flash', href: 'evenements.html' }, voix: 'assets/media/evenement-flash-voix.mp3?v=1', fin: 54.0, dvoix: 49.2, caps: CAPS_FLASH, scenes: SCENES_FLASH, sfx: SFX_FLASH, swell: [35, 46] };
  function rendre(av) { return FILM.id === 'long' ? rendreLong(av) : FILM.id === 'flash' ? rendreFlash(av) : rendreCourt(av); }

  /* ── Sous-titres ── */
  function majCaption(a) {
    let idx = -1;
    const CAPS = FILM.caps;
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
  /* Horloge du film : la voix est la référence. Séparée du dessin pour que le temps, les effets sonores et la
     musique continuent de suivre la voix même quand le navigateur suspend les animations (onglet en arrière-plan). */
  let dernierRaf = 0;
  function horloge() {
    const now = performance.now();
    if (enCours) {
      if (audio && !audio.paused && audio.readyState >= 2 && tFilm >= LEAD - 0.05) tFilm = audio.currentTime + LEAD;
      else if (tFilm >= LEAD && audio && audio.readyState < 3 && !finie) { /* la voix charge : on attend, l'horloge s'arrête */ tMur = now; }
      else tFilm += (now - tMur) / 1000;
      tMur = now;
      if (audio && audio.paused && tFilm >= LEAD && tFilm < LEAD + FILM.dvoix - 0.02 && audio.readyState >= 2) {
        audio.currentTime = Math.max(0, tFilm - LEAD); const pr = audio.play(); if (pr && pr.catch) pr.catch(() => {});
      }
      if (tFilm >= FILM.fin) { tFilm = FILM.fin; terminer(); }
    }
    const a = tFilm - LEAD;
    FILM.sfx.forEach(s => { if (enCours && s[0] > dernierA && s[0] <= a && s[0] - dernierA < 0.5) bruit(s[1]); });
    dernierA = a;
    return a;
  }
  function boucle() {
    rafId = requestAnimationFrame(boucle);
    dernierRaf = performance.now();
    const a = horloge();
    rendre(a); majCaption(a);
    { const pc = (tFilm / FILM.fin * 100).toFixed(2) + '%'; R.progf.style.width = pc; R.progb.style.left = pc; R.prog.setAttribute('aria-valuenow', String(Math.round(tFilm / FILM.fin * 100))); } R.temps.textContent = fmt(tFilm) + ' / ' + fmt(FILM.fin);
  }
  function tickMusique() {
    if (!enCours) return;
    if (performance.now() - dernierRaf > 300) horloge(); // animations suspendues : l'horloge continue sans elles
    planifierMusique(tFilm - LEAD);
  }

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
    tFilm = clamp(t, 0, FILM.fin); dernierA = tFilm - LEAD; capIdx = -2;
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
    FILM = options.version === 'court' ? FILMS.court : options.version === 'flash' ? FILMS.flash : FILMS.long;
    if (!document.getElementById('fi-css')) { const st = document.createElement('style'); st.id = 'fi-css'; st.textContent = CSS; document.head.appendChild(st); }
    if (!document.getElementById('fi-fonts')) { const l = document.createElement('link'); l.id = 'fi-fonts'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Cinzel:wght@600;800&display=swap'; document.head.appendChild(l); }
    calme = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    ov = document.createElement('div');
    ov.className = 'fi-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', FILM.aria || "Film : créer son compte sur Diaspo'Actif");
    const surInscription = /(^|\/)inscription(\.html)?$/.test(location.pathname);
    ov.innerHTML = `<div class="fi-box">
      <div class="fi-top"><span class="fi-titre">▶ ${FILM.titre || 'COMMENT ÇA MARCHE'} · ${FILM.etiquette}</span><span style="display:flex;gap:8px"><button class="fi-btn or" data-r="cta" type="button">${FILM.cta ? FILM.cta.label : 'Créer mon compte'}</button><button class="fi-btn" data-r="fermer" type="button" aria-label="Fermer le film">✕ Fermer</button></span></div>
      <div class="fi-win" data-r="win"><div class="fi-stage" data-r="stage">${FILM.stage === 'flash' ? STAGE_FLASH_HTML : STAGE_HTML}</div></div>
      <div class="fi-cap" data-r="cap" aria-live="off"></div>
      <div class="fi-ctl"><button class="fi-btn" data-r="play" type="button">▶ Lecture</button><button class="fi-btn" data-r="son" type="button">🔊 Son</button>
        <div class="fi-prog" data-r="prog" role="slider" tabindex="0" aria-label="Position dans le film" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-r="progf"></i><b data-r="progb"></b></div><span class="t" data-r="temps">0:00 / ${fmt(FILM.fin)}</span></div></div>`;
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    R = {};
    ov.querySelectorAll('[data-r]').forEach(el => { R[el.dataset.r] = el; });
    /* éléments multiples */
    R.parts = ov.querySelector('[data-r="parts"]');
    R.pa = Array.from({ length: 36 }, () => { const el = document.createElement('i'); el.className = 'fi-part'; R.parts.appendChild(el); return { el }; });
    R.ckEls = [...ov.querySelectorAll('[data-r="ck"] > div')]; R.stEls = [...ov.querySelectorAll('.fi-st')];
    echelle(); window.addEventListener('resize', echelle);
    document.addEventListener('keydown', clavier);

    audio = new Audio(); audio.preload = 'auto'; audio.muted = muet;
    /* La voix est chargée ENTIÈREMENT (≈ 1 Mo) avant d'être jouée : on peut alors sauter à n'importe quel instant
       sans dépendre du serveur (lecture par plages d'octets absente de certains serveurs). Tant qu'elle n'est pas
       prête, l'horloge du film s'arrête au début de la voix. */
    { const courant = audio; fetch(FILM.voix).then(r => r.blob()).then(b => { if (audio === courant) { courant.dataset.url = URL.createObjectURL(b); courant.src = courant.dataset.url; } }).catch(() => { if (audio === courant) courant.src = FILM.voix; }); }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); }
    tFilm = 0; dernierA = -LEAD; capIdx = -2; finie = false; muet = false; R._pctAff = 0;
    R.fermer.addEventListener('click', fermer);
    R.play.addEventListener('click', () => { enCours ? pause() : lecture(); });
    R.son.addEventListener('click', basculerSon);
    {
      const depuis = e => { const r = R.prog.getBoundingClientRect(); aller(clamp((e.clientX - r.left) / r.width) * FILM.fin); };
      let glisse = false;
      R.prog.addEventListener('pointerdown', e => { glisse = true; try { R.prog.setPointerCapture(e.pointerId); } catch (x) { /* sans capture */ } depuis(e); });
      R.prog.addEventListener('pointermove', e => { if (glisse) depuis(e); });
      R.prog.addEventListener('pointerup', () => { glisse = false; });
      R.prog.addEventListener('pointercancel', () => { glisse = false; });
    }
    R.cta.addEventListener('click', () => { if (FILM.cta) { if (location.pathname.split('/').pop() === FILM.cta.href) fermer(); else window.location.href = FILM.cta.href; } else if (surInscription) fermer(); else window.location.href = 'inscription.html'; });
    ov.addEventListener('click', e => { if (e.target === ov) fermer(); });
    rafId = requestAnimationFrame(boucle); tickId = setInterval(tickMusique, 90);
    if (options.auto !== false) lecture();
    R.fermer.focus();
  }
  function fermer() {
    if (!ov) return;
    cancelAnimationFrame(rafId); clearInterval(tickId);
    if (audio) { audio.pause(); if (audio.dataset.url) URL.revokeObjectURL(audio.dataset.url); audio.removeAttribute('src'); audio = null; }
    if (ctx) { try { ctx.close(); } catch (e) { /* déjà fermé */ } ctx = null; master = null; }
    window.removeEventListener('resize', echelle); document.removeEventListener('keydown', clavier);
    ov.remove(); ov = null; R = {}; enCours = false; document.body.style.overflow = '';
  }

  window.InscriptionFilm = { ouvrir, fermer, dessiner: t => { if (!ov) return; const a = t - LEAD; rendre(a); majCaption(a); }, aller: t => aller(t), pause, lecture, etat: () => ({ film: FILM.id, tFilm, enCours, finie, voix: audio ? { pause: audio.paused, t: audio.currentTime, pret: audio.readyState, dur: audio.duration, muet: audio.muted } : null, son: ctx ? ctx.state : null }), get FIN() { return FILM.fin; }, LEAD };
})();
