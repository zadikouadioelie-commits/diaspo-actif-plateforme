/* ============================================================
   Diaspo'Actif — Envoi des vidéos de REELS (2026-10-13)
   La vidéo ne passe PAS par notre serveur (limite de 4,5 Mo de l'hébergeur) : elle part directement du navigateur vers Bunny Stream,
   par morceaux de 8 Mo, avec reprise automatique en cas de coupure réseau (protocole TUS). Le serveur ne fait qu'ouvrir l'envoi,
   puis contrôle la durée et les dimensions réelles — voir server/reels-upload.js (règles, activation, schéma).

   Utilisation (écran de création d'un reel) :
     const spec = await ReelsUpload.config();                       // { actif, duree_max, taille_max_mo, ... }
     const diag = await ReelsUpload.inspecter(file);                // { ok, erreur?, avertissements[], duree, largeur, hauteur, cadre }
     const env  = await ReelsUpload.envoyer(file, { titre, onProgress: pct => … });   // { guid, jeton }
     const pret = await ReelsUpload.attendrePret(env.guid, env.jeton, { onEtat: e => … });  // { urls:{hls,mp4,miniature,apercu}, duree, … }
     // ou tout d'un coup :  ReelsUpload.publier(file, { titre, onProgress, onEtat })
   Erreurs : toujours des Error dont le message est lisible tel quel par l'utilisateur ; err.code === 'reels_inactif' si l'hébergement
   des vidéos n'est pas encore activé.
   ============================================================ */
(function () {
  'use strict';
  const TAILLE_MORCEAU = 8 * 1024 * 1024;
  const attendre = ms => new Promise(r => setTimeout(r, ms));

  async function api(methode, url, corps) {
    const r = await fetch(url, { method: methode, credentials: 'include', headers: corps ? { 'Content-Type': 'application/json' } : undefined, body: corps ? JSON.stringify(corps) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Erreur ' + r.status); e.code = j.code; e.status = r.status; throw e; }
    return j;
  }

  /* usage « evenement » (2026-10-28) : vidéo courte d'un événement, 2 minutes maximum — les règles viennent du serveur (jamais choisies par la page). */
  const _config = {};
  function config(usage) { const k = usage || 'reel'; return _config[k] || (_config[k] = api('GET', '/api/reels/config' + (usage ? '?usage=' + encodeURIComponent(usage) : '')).catch(e => { delete _config[k]; throw e; })); }

  const cadreDe = (l, h) => { if (!l || !h) return null; const r = l / h; return r < 0.7 ? 'vertical' : r < 0.9 ? '4:5' : r <= 1.15 ? 'carre' : 'horizontal'; };

  /* Lit durée et dimensions dans le navigateur. Impossible pour certains codecs (ex. HEVC dans Chrome) : on laisse alors passer,
     le serveur mesure de toute façon la vidéo réelle après l'envoi. */
  function lireMetadonnees(file) {
    return new Promise(resolve => {
      const v = document.createElement('video'), url = URL.createObjectURL(file);
      const fin = res => { clearTimeout(t); URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); resolve(res); };
      const t = setTimeout(() => fin(null), 8000);
      v.preload = 'metadata'; v.muted = true; v.playsInline = true;
      v.onloadedmetadata = () => fin({ duree: Number.isFinite(v.duration) ? v.duration : 0, largeur: v.videoWidth, hauteur: v.videoHeight });
      v.onerror = () => fin(null);
      v.src = url;
    });
  }

  async function inspecter(file, usage) {
    const spec = await config(usage);
    const ext = (String(file.name || '').split('.').pop() || '').toLowerCase();
    const typeOk = spec.formats.includes(String(file.type || '').toLowerCase()) || (!file.type && spec.extensions.includes(ext));
    if (!typeOk) return { ok: false, erreur: 'Format non pris en charge. Utilisez une vidéo MP4 ou MOV.' };
    if (file.size > spec.taille_max_octets) return { ok: false, erreur: `Fichier trop volumineux (${Math.round(file.size / 1048576)} Mo, maximum ${spec.taille_max_mo} Mo). ${usage === 'evenement' ? 'Réduisez la définition (720p suffit) ou la durée de la vidéo.' : 'Exportez la vidéo en 1080×1920 : un reel de 90 s dépasse rarement 150 Mo.'}` };
    const m = await lireMetadonnees(file), avert = [];
    if (!m) return { ok: true, avertissements: ['Aperçu impossible sur cet appareil : la durée sera contrôlée après l’envoi.'], duree: null };
    const d = Math.round(m.duree * 10) / 10, cadre = cadreDe(m.largeur, m.hauteur);
    if (d > spec.duree_max + 0.5) return { ok: false, erreur: `Vidéo trop longue : ${Math.round(d)} s (maximum ${spec.duree_max} s).`, duree: d };
    if (d && d < spec.duree_min) return { ok: false, erreur: `Vidéo trop courte : ${d} s (minimum ${spec.duree_min} s).`, duree: d };
    if (Math.min(m.largeur, m.hauteur) < spec.cote_min_px) return { ok: false, erreur: `Définition trop faible (${m.largeur}×${m.hauteur}). Minimum ${spec.cote_min_px} px sur le plus petit côté.` };
    if (usage !== 'evenement' && cadre && cadre !== 'vertical') avert.push('Cadre ' + (cadre === 'horizontal' ? 'horizontal' : cadre === 'carre' ? 'carré' : '4:5') + ' : un cadre vertical 9:16 (1080×1920) remplit tout l’écran du téléphone.');
    return { ok: true, avertissements: avert, duree: d, largeur: m.largeur, hauteur: m.hauteur, cadre };
  }

  const b64 = s => btoa(unescape(encodeURIComponent(String(s))));

  /* Envoi TUS par morceaux, avec reprise : en cas d'échec réseau on redemande à Bunny où il en est (HEAD) puis on repart de là. */
  async function envoyerTus(file, tus, onProgress, signal) {
    const meta = Object.entries(tus.metadonnees).map(([k, v]) => k + ' ' + b64(v)).join(',');
    const base = { 'Tus-Resumable': '1.0.0', ...tus.entetes };
    const cr = await fetch(tus.endpoint, { method: 'POST', headers: { ...base, 'Upload-Length': String(file.size), 'Upload-Metadata': meta }, signal });
    if (!cr.ok) throw new Error('Envoi refusé par l’hébergeur vidéo (' + cr.status + ').');
    const loc = cr.headers.get('Location'); if (!loc) throw new Error('Réponse inattendue de l’hébergeur vidéo.');
    const cible = new URL(loc, tus.endpoint).toString();
    let offset = 0, essais = 0;
    while (offset < file.size) {
      if (signal && signal.aborted) throw new Error('Envoi annulé.');
      const morceau = file.slice(offset, Math.min(offset + TAILLE_MORCEAU, file.size));
      try {
        const r = await fetch(cible, { method: 'PATCH', headers: { ...base, 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': String(offset) }, body: morceau, signal });
        if (!r.ok) throw new Error('PATCH ' + r.status);
        offset = Number(r.headers.get('Upload-Offset')) || offset + morceau.size; essais = 0;
        if (onProgress) onProgress(Math.min(100, Math.round(offset * 100 / file.size)));
      } catch (e) {
        if ((signal && signal.aborted) || ++essais > 6) throw new Error('Connexion interrompue pendant l’envoi. Réessayez : la vidéo repartira du début.');
        await attendre(Math.min(15000, 1000 * 2 ** essais));
        try { const h = await fetch(cible, { method: 'HEAD', headers: base, signal }); const o = Number(h.headers.get('Upload-Offset')); if (h.ok && Number.isFinite(o)) offset = o; } catch (e2) { /* on retentera */ }
      }
    }
  }

  async function envoyer(file, opts) {
    opts = opts || {};
    const diag = await inspecter(file, opts.usage); if (!diag.ok) throw new Error(diag.erreur);
    const s = await api('POST', '/api/reels/upload-session', { titre: opts.titre || 'Reel', taille: file.size, type: file.type || 'video/mp4', usage: opts.usage });
    try { await envoyerTus(file, s.tus, opts.onProgress, opts.signal); }
    catch (e) { api('POST', '/api/reels/upload/' + s.guid + '/annuler', { jeton: s.jeton }).catch(() => {}); throw e; }
    return { guid: s.guid, jeton: s.jeton, diagnostic: diag };
  }

  /* Interroge le serveur jusqu'à ce que la vidéo soit lisible (ou refusée). Un reel court est prêt en quelques secondes à 1-2 minutes. */
  async function attendrePret(guid, jeton, opts) {
    opts = opts || {}; const fin = Date.now() + (opts.delaiMax || 10 * 60 * 1000);
    for (;;) {
      const e = await api('GET', '/api/reels/upload/' + guid + '/statut?jeton=' + encodeURIComponent(jeton) + (opts.usage ? '&usage=' + encodeURIComponent(opts.usage) : ''));
      if (opts.onEtat) opts.onEtat(e);
      if (e.etat === 'pret') return e;
      if (e.etat === 'refuse' || e.etat === 'erreur') throw new Error(e.erreur || 'La vidéo n’a pas pu être traitée.');
      if (Date.now() > fin) throw new Error('Le traitement de la vidéo prend plus de temps que prévu. Elle apparaîtra dès qu’elle sera prête.');
      await attendre(2500);
    }
  }

  const annuler = (guid, jeton) => api('POST', '/api/reels/upload/' + guid + '/annuler', { jeton });
  async function publier(file, opts) { const env = await envoyer(file, opts); return attendrePret(env.guid, env.jeton, opts); }

  window.ReelsUpload = { config, inspecter, envoyer, attendrePret, annuler, publier };
})();
