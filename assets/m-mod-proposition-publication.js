/* ============================================================
   Diaspo'Actif — Version téléphone : publication préparée automatiquement (2026-11-12, demande explicite)
   Pendant de la carte du site (assets/app.js, proposerPublicationAuto) : le serveur (server/proposition-publication.js) prépare un texte
   — nom, présentation ou descriptif, mention « disponible pour des rencontres et du networking » — et compte 2 propositions au plus.
   Ici, la proposition s'affiche dans une fenêtre du bas d'écran avec trois boutons : Publier (bordeaux), Modifier (contour doré),
   Reporter (vert). Rien n'est publié sans le clic « Publier » (POST /api/fil, comme le composeur de l'appli).

   Chargé AVANT m.js (comme notif-invite.js) : m.js appelle window.MPropPub.proposer(S.me) à la fin de loadMe(), parfois avant que les
   autres scripts différés soient exécutés. window.MApp n'est lu qu'au moment de l'appel.
   GET /api/fil/proposition → { a_proposer, texte, numero, max } ; POST /api/fil/proposition/reporter.
   Le décompte se fait côté serveur à l'AFFICHAGE : si une autre fenêtre est ouverte (invitation aux notifications…), on attend qu'elle se ferme.
   ============================================================ */
(function () {
  'use strict';
  if (window.MPropPub) return;

  function css() {
    if (document.getElementById('m-proppub-css')) return;
    const s = document.createElement('style');
    s.id = 'm-proppub-css';
    s.textContent = `
      .ppm{background:#0A1B3C;color:#E4E9F6;border:1px solid #B7791F;border-radius:16px;padding:14px 14px 12px}
      .ppm-t{color:#F2B33D;font-weight:800;font-size:17px;margin:0 0 4px}
      .ppm-s{color:#B8C2DC;font-size:13px;line-height:1.45;margin:0 0 10px}
      .ppm-txt{white-space:pre-wrap;word-break:break-word;background:rgba(255,255,255,.07);border:1px solid rgba(242,179,61,.3);border-radius:12px;padding:10px 12px;margin:0 0 12px;color:#fff;font-size:15px;line-height:1.5;max-height:38vh;overflow:auto}
      textarea.ppm-txt{display:block;width:100%;box-sizing:border-box;min-height:34vh;font:inherit;font-size:16px;resize:vertical;background:#13264F !important;color:#fff !important;border:1px solid rgba(242,179,61,.55) !important;border-radius:12px !important;caret-color:#F2B33D}
      .ppm-act{display:flex;flex-direction:column;gap:8px}
      .ppm-b{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:30px;font:inherit;font-weight:800;font-size:16px;cursor:pointer;border:2px solid transparent;padding:0 16px}
      .ppm-b:disabled{opacity:.55}
      .ppm-b:focus-visible{outline:3px solid #F2B33D;outline-offset:2px}
      .ppm-pub{background:#8B1E3F;border-color:#8B1E3F;color:#fff}
      .ppm-mod{background:transparent;border-color:#F2B33D;color:#F2B33D}
      .ppm-rep{background:#1F7A46;border-color:#1F7A46;color:#fff}
      .ppm-err{color:#FFB4B4;font-size:13px;margin:8px 0 0;min-height:1em}`;
    document.head.appendChild(s);
  }

  function afficher(A, r, cle) {
    css();
    const esc = A.esc;
    const fin = () => { try { sessionStorage.setItem(cle, 'non'); } catch (e) { /* ignoré */ } };
    const close = A.openSheet(`<div class="ppm" id="ppm">
      <h2 class="ppm-t">✍️ Votre publication est prête</h2>
      <p class="ppm-s">Proposition ${Number(r.numero) || 1} sur ${Number(r.max) || 2} — rien n’est publié sans votre accord. Vous pouvez la modifier avant de la publier sur le fil d’actualité.</p>
      <div class="ppm-txt" id="ppm-txt">${esc(r.texte)}</div>
      <div class="ppm-act">
        <button type="button" class="ppm-b ppm-pub" id="ppm-pub">Publier</button>
        <button type="button" class="ppm-b ppm-mod" id="ppm-mod">Modifier</button>
        <button type="button" class="ppm-b ppm-rep" id="ppm-rep">Reporter</button>
      </div>
      <p class="ppm-err" id="ppm-err" role="alert"></p></div>`);
    const $ = id => document.getElementById(id);
    let zone = $('ppm-txt');
    const bPub = $('ppm-pub'), bMod = $('ppm-mod'), bRep = $('ppm-rep'), err = $('ppm-err');
    const verrou = v => { bPub.disabled = bMod.disabled = bRep.disabled = v; };
    const texte = () => (zone.tagName === 'TEXTAREA' ? zone.value : r.texte).trim();

    bMod.onclick = () => {
      if (zone.tagName === 'TEXTAREA') { zone.focus(); return; }
      const ta = document.createElement('textarea');
      ta.id = 'ppm-txt'; ta.className = 'ppm-txt'; ta.value = r.texte; ta.maxLength = 3000;
      ta.setAttribute('aria-label', 'Texte de la publication');
      zone.replaceWith(ta); zone = ta; ta.focus();
      bMod.textContent = 'Modification en cours'; bMod.disabled = true;
    };
    bRep.onclick = async () => {
      verrou(true);
      try { await A.api('/api/fil/proposition/reporter', { method: 'POST', body: {} }); } catch (e) { /* sans gravité : elle reviendra */ }
      fin(); close(); A.toast('Reporté : on vous la reproposera plus tard.');
    };
    bPub.onclick = async () => {
      const t = texte();
      if (!t) { err.textContent = 'Le texte est vide : écrivez quelque chose avant de publier.'; return; }
      verrou(true); err.textContent = '';
      bPub.textContent = 'Publication…';
      try {
        await A.api('/api/fil', { method: 'POST', body: { contenu: t, categorie: 'Publication', pub_type: 'texte', visibilite: 'public' } });
        if (A.S && A.S.me) A.S.me.a_publie = true;
        fin(); close(); A.toast('Publié ✓');
        if (typeof A.refreshTab === 'function') A.refreshTab('accueil');
      } catch (e) {
        verrou(false); if (zone.tagName === 'TEXTAREA') bMod.disabled = true;
        bPub.textContent = 'Publier';
        err.textContent = (e && e.message) || 'La publication n’a pas pu être envoyée. Réessayez.';
      }
    };
  }

  function proposer(me) {
    if (!me || me.a_publie) return;
    const cle = 'da_prop_pub_' + (me.nb_connexions || 0);
    try { if (sessionStorage.getItem(cle) === 'non') return; } catch (e) { /* stockage indisponible : on demande au serveur */ }
    setTimeout(async () => {
      const A = window.MApp;
      if (!A || !A.S || !A.S.me || A.S.me.id !== me.id) return; // le compte a changé entre-temps
      let r;
      try { r = await A.api('/api/fil/proposition'); } catch (e) { return; } // jamais bloquant
      if (!r || !r.a_proposer) { try { sessionStorage.setItem(cle, 'non'); } catch (e) { /* ignoré */ } return; }
      let essais = 0;
      const montrer = () => {
        const sh = document.getElementById('sheet');
        if (sh && !sh.hidden) { if (++essais <= 8) setTimeout(montrer, 3000); return; } // une autre fenêtre est ouverte : on attend
        if (!A.S.me || A.S.me.id !== me.id) return;
        afficher(A, r, cle);
      };
      montrer();
    }, 2500);
  }

  window.MPropPub = { proposer };
})();
