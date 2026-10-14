/* ============================================================
   Diaspo'Actif — Lecture des tutos vidéo (2026-10-14, demande explicite)
   Commun à la page du site (assets/videos-tutoriels-public.js) et à la version téléphone (assets/m.js).

   Comportement voulu pour TOUS les tutos (YouTube, fichier vidéo, film animé de la plateforme) :
   - la lecture démarre automatiquement dès l'ouverture du lien ;
   - si le navigateur refuse le démarrage AVEC le son (cas courant à l'arrivée par un lien partagé, et toujours sur iPhone), la
     vidéo démarre sans le son avec un grand bouton « 🔊 Activer le son » ;
   - à la fin, un écran propose « 🏠 Accueil » et « Créer mon compte » (pour un compte déjà connecté : « Voir les autres tutos »),
     pour que la personne reste dans l'écosystème Diaspo'Actif ; un lien « Revoir la vidéo » est aussi proposé.

   API :  TutoLecture.monter(zone, video, options)      — monte le lecteur d'un tuto dans `zone` (YouTube, fichier ou film)
          TutoLecture.ouvrirFilm(version, options)      — ouvre un film animé (depuis une carte) avec l'écran de fin
          TutoLecture.versionFilm(url)                  — 'court' | 'flash' | 'telephone' | 'businessplan' | 'long' d'après l'adresse du film
   options : { accueil, inscription, autres, connecte (booléen ou fonction/promesse) }
   ============================================================ */
(function () {
  'use strict';
  if (window.TutoLecture) return;

  const FILM_SCRIPT = '/assets/inscription-film.js?v=18';
  const CSS = `
.tl-zone{position:relative;width:100%;background:#000;overflow:hidden}
.tl-zone>iframe,.tl-zone>video{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;object-fit:contain}
.tl-son{position:absolute;left:12px;bottom:12px;z-index:4;display:flex;align-items:center;gap:8px;border:0;border-radius:30px;padding:10px 16px;background:#F5D061;color:#0D2B4E;font:inherit;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.45)}
.tl-son:focus-visible,.tl-b:focus-visible,.tl-rev:focus-visible{outline:3px solid #fff;outline-offset:2px}
.tl-film{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;padding:0;cursor:pointer;background:#0D2B4E}
.tl-film img{width:100%;height:100%;object-fit:cover;display:block}
.tl-film .tl-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.tl-film .tl-play i{width:72px;height:72px;border-radius:50%;background:rgba(242,100,34,.95);color:#fff;font-size:30px;display:flex;align-items:center;justify-content:center;font-style:normal;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.tl-fin{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,18,36,.92);color:#fff;font-family:inherit;text-align:center}
.tl-fin.tl-fixe{position:fixed;z-index:2147483000;background:rgba(6,18,36,.95)}
.tl-fin-c{width:100%;max-width:360px;display:flex;flex-direction:column;align-items:stretch;gap:10px}
.tl-fin-t{font-size:20px;font-weight:800;line-height:1.3}
.tl-fin-s{margin:0 0 6px;font-size:14px;line-height:1.45;color:rgba(255,255,255,.82)}
.tl-b{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:30px;padding:0 20px;font:inherit;font-size:16px;font-weight:800;text-decoration:none;cursor:pointer;border:2px solid transparent;-webkit-tap-highlight-color:transparent}
.tl-b1{background:transparent;color:#fff;border-color:rgba(255,255,255,.55)}
.tl-b2{background:linear-gradient(135deg,#F7E08A,#E0AE24);color:#0D2B4E}
.tl-rev{margin-top:2px;background:none;border:0;color:rgba(255,255,255,.8);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer;padding:8px}
@media (max-height:420px){.tl-fin-t{font-size:16px}.tl-fin-s{display:none}.tl-b{min-height:40px}}
`;
  const cssOk = () => { if (document.getElementById('tl-css')) return; const st = document.createElement('style'); st.id = 'tl-css'; st.textContent = CSS; document.head.appendChild(st); };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ytId = url => { const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/); return m ? m[1] : null; };
  const estIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const versionFilm = url => url === 'inscription-court' ? 'court' : url === 'evenement-flash' ? 'flash' : url === 'telephone-initiative' ? 'telephone' : url === 'business-plan' ? 'businessplan' : 'long';
  const vers = (fn, ...a) => { try { return Promise.resolve(typeof fn === 'function' ? fn(...a) : fn); } catch (e) { return Promise.resolve(false); } };

  /* ---------- écran de fin ---------- */
  async function ecranFin(parent, o, revoir, fixe, auClic) {
    if (!parent || (parent.__tlFin && document.body.contains(parent.__tlFin))) return;
    cssOk(); o = o || {};
    /* Zone vidéo trop petite pour l'écran de fin (téléphone) : il s'affiche alors en plein écran. */
    const plein = !!fixe || (parent.clientHeight > 0 && parent.clientHeight < 340);
    const connecte = !!(await vers(o.connecte));
    const el = document.createElement('div');
    el.className = 'tl-fin' + (plein ? ' tl-fixe' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Fin de la vidéo');
    el.innerHTML = `<div class="tl-fin-c">
      <div class="tl-fin-t">Merci d’avoir regardé !</div>
      <p class="tl-fin-s">${connecte ? 'Continuez à découvrir Diaspo’Actif.' : 'Rejoignez la communauté Diaspo’Actif.'}</p>
      <a class="tl-b tl-b1" href="${esc(o.accueil || 'index.html')}">🏠 Accueil</a>
      ${connecte ? `<a class="tl-b tl-b2" href="${esc(o.autres || 'videos-tutoriels.html')}">▶ Voir les autres tutos</a>` : `<a class="tl-b tl-b2" href="${esc(o.inscription || 'inscription.html')}">Créer mon compte</a>`}
      ${revoir ? '<button type="button" class="tl-rev">↻ Revoir la vidéo</button>' : ''}</div>`;
    (plein ? document.body : parent).appendChild(el); parent.__tlFin = el;
    /* Un clic sur « Accueil » / « Autres tutos » (liens internes à la page) ou un changement de page retire l'écran. */
    el.querySelectorAll('a').forEach(l => l.addEventListener('click', () => { try { if (auClic) auClic(); } catch (e) { /* sans conséquence */ } setTimeout(() => el.remove(), 0); }));
    window.addEventListener('hashchange', () => el.remove(), { once: true });
    const r = el.querySelector('.tl-rev'); if (r) r.onclick = () => { el.remove(); try { revoir(); } catch (e) { /* sans conséquence */ } };
    try { el.querySelector('.tl-b2').focus(); } catch (e) { /* sans conséquence */ }
  }

  function boutonSon(zone, activer) {
    if (zone.querySelector(':scope > .tl-son')) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tl-son'; b.textContent = '🔊 Activer le son';
    b.onclick = () => { try { activer(); } catch (e) { /* sans conséquence */ } b.remove(); };
    zone.appendChild(b);
  }

  /* ---------- YouTube ---------- */
  function monterYoutube(zone, id, v, o) {
    let muet = estIos(), demarre = false, ecoute = false, fini = false, tPlay = null, tHello = null, nbHello = 0;
    const iframe = document.createElement('iframe');
    iframe.title = v.titre || 'Tuto vidéo'; iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen'); iframe.setAttribute('allowfullscreen', '');
    const adresse = sans => `https://www.youtube.com/embed/${id}?autoplay=1&mute=${sans ? 1 : 0}&rel=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
    const commande = (func, args) => { try { iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [] }), '*'); } catch (e) { /* lecteur pas prêt */ } };
    const salut = () => { try { iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch (e) { /* lecteur pas prêt */ } };
    const surMessage = ev => {
      if (!document.body.contains(iframe)) { window.removeEventListener('message', surMessage); clearTimeout(tPlay); clearInterval(tHello); return; }
      if (ev.source !== iframe.contentWindow) return;
      let d = ev.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
      if (!d) return;
      const st = d.event === 'onStateChange' ? d.info : (d.event === 'infoDelivery' && d.info && typeof d.info.playerState === 'number' ? d.info.playerState : null);
      if (st === null || st === undefined) return;
      if (!ecoute) {
        ecoute = true; clearInterval(tHello);
        /* Premier signe de vie du lecteur : s'il n'est pas en lecture 3 s plus tard, le démarrage avec le son a été refusé → sans le son. */
        if (!muet) tPlay = setTimeout(() => { if (!demarre && !muet) passerMuet(); }, 3000);
      }
      if (st === 1) { demarre = true; clearTimeout(tPlay); }
      if (st === 0 && !fini) { fini = true; ecranFin(zone, o, revoir); }
    };
    const proposerSon = () => boutonSon(zone, () => { commande('unMute'); commande('playVideo'); });
    const lancer = () => {
      fini = false; demarre = false; ecoute = false; nbHello = 0;
      iframe.src = adresse(muet);
      if (muet) proposerSon();
      clearInterval(tHello); tHello = setInterval(() => { if (++nbHello > 20) clearInterval(tHello); else salut(); }, 500);
      clearTimeout(tPlay);
    };
    /* Démarrage refusé avec le son : on relance sans le son, avec le bouton pour le remettre. */
    const passerMuet = () => { muet = true; clearTimeout(tPlay); lancer(); };
    const revoir = () => { if (zone.__tlFin) zone.__tlFin.remove(); lancer(); };
    window.addEventListener('message', surMessage);
    iframe.addEventListener('load', salut);
    zone.appendChild(iframe); lancer();
  }

  /* ---------- fichier vidéo ---------- */
  function monterFichier(zone, v, o) {
    const vid = document.createElement('video');
    vid.src = v.url; vid.controls = true; vid.preload = 'auto'; vid.setAttribute('playsinline', ''); vid.autoplay = true;
    if (v.miniature_url) vid.poster = v.miniature_url;
    zone.appendChild(vid);
    const lancer = () => {
      const p = vid.play();
      if (p && p.catch) p.catch(() => {
        vid.muted = true; const p2 = vid.play(); if (p2 && p2.catch) p2.catch(() => { /* il touchera lecture */ });
        boutonSon(zone, () => { vid.muted = false; vid.play(); });
      });
    };
    vid.addEventListener('ended', () => ecranFin(zone, o, () => { vid.currentTime = 0; lancer(); }));
    lancer();
  }

  /* ---------- film animé de la plateforme ---------- */
  let promesseFilm = null;
  function chargerFilm() {
    if (window.InscriptionFilm) return Promise.resolve();
    if (!promesseFilm) promesseFilm = new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = FILM_SCRIPT; sc.onload = ok; sc.onerror = () => { promesseFilm = null; ko(new Error('chargement du film')); }; document.head.appendChild(sc); });
    return promesseFilm;
  }
  async function ouvrirFilm(version, o) {
    try {
      await chargerFilm();
      const lancer = () => window.InscriptionFilm.ouvrir({ version: version || 'long', onFin: () => ecranFin(document.body, o, () => { try { window.InscriptionFilm.lecture(); } catch (e) { /* film fermé */ } }, true, () => { try { window.InscriptionFilm.fermer(); } catch (e) { /* déjà fermé */ } }) });
      lancer();
    } catch (e) { window.location.href = version === 'flash' ? 'evenements.html' : version === 'telephone' ? 'm.html' : version === 'businessplan' ? 'business-plan.html' : 'inscription.html'; }
  }
  function monterFilm(zone, v, o) {
    const version = versionFilm(v.url);
    zone.innerHTML = `<button type="button" class="tl-film" aria-label="Lancer le film : ${esc(v.titre)}"><img src="${esc(v.miniature_url || '/assets/media/film-inscription-poster.jpg')}" alt=""><span class="tl-play"><i>▶</i></span></button>`;
    zone.querySelector('.tl-film').onclick = e => { e.preventDefault(); ouvrirFilm(version, o); };
    ouvrirFilm(version, o);
  }

  /* ---------- point d'entrée ---------- */
  function monter(zone, v, o) {
    if (!zone || !v) return;
    cssOk(); o = o || {};
    zone.classList.add('tl-zone'); zone.innerHTML = '';
    /* La taille vient du conteneur (.dvt-player, .vwrap) ; sans format défini, on prend du 16/9. */
    if (getComputedStyle(zone).aspectRatio === 'auto') zone.style.aspectRatio = '16 / 9';
    if (v.type_source === 'film') return monterFilm(zone, v, o);
    const id = v.type_source === 'youtube' ? ytId(v.url) : null;
    if (id) return monterYoutube(zone, id, v, o);
    return monterFichier(zone, v, o);
  }

  window.TutoLecture = { monter, ouvrirFilm, versionFilm, ecranFin };
})();
