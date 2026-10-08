/* Prototype de carte de membre (2026-10-08, demande explicite) — bibliothèque partagée.
   Une association téléverse sa maquette de carte (recto et/ou verso) et indique où écrire le prénom et le nom ;
   chaque adhérent voit ensuite SA carte (son prénom, son nom) avec le message de remise. Aucune image n'est
   enregistrée par adhérent : le visuel est composé à l'affichage, à partir du prototype de la formule.

   CarteProto.html(proto, prenom, nom)      -> bloc « Merci » + faces de la carte, pour un adhérent
   CarteProto.ajusterChamps(racine)         -> réduit un nom trop long jusqu'à ce qu'il tienne dans sa zone
   CarteProto.ouvrirEditeur(proto, options) -> fenêtre d'édition (options.upload(file) -> url ; options.onSave(proto|null))
   CarteProto.detecter(img)                 -> { prenom, nom } en % de l'image (cases claires, puis texte reconnu) */
(function (root) {
  'use strict';

  var MESSAGE_DEFAUT = 'Votre carte de membre vous sera envoyée par voie postale dans les plus brefs délais.';
  var ZONES_DEFAUT = { prenom: { x: 28, y: 38, w: 44, h: 9 }, nom: { x: 28, y: 52, w: 44, h: 9 } };
  var LABELS = { prenom: 'Prénom', nom: 'Nom' };

  var CSS = '' +
    '.cpx-bloc{max-width:900px;margin:0 auto 28px;}' +
    '.cpx-merci{background:linear-gradient(135deg,#fff7ed,#ffedd5);border:1px solid #fdba74;border-radius:14px;padding:18px 20px;margin-bottom:18px;color:#431407;}' +
    '.cpx-merci h3{margin:0 0 8px;font-size:18px;color:#9a3412;}.cpx-merci p{margin:0 0 8px;font-size:14px;line-height:1.55;}.cpx-merci p:last-child{margin-bottom:0;}' +
    '.cpx-faces{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;}' +
    '.cpx-card{position:relative;border-radius:3.2% / 5.8%;overflow:hidden;box-shadow:0 10px 28px rgba(43,22,8,.35);container-type:inline-size;background:#2b1608;}' +
    '.cpx-card img{display:block;width:100%;height:100%;object-fit:cover;}' +
    '.cpx-champ{position:absolute;display:flex;align-items:center;box-sizing:border-box;padding:0 1.8cqw;font-family:Georgia,"Times New Roman",serif;font-weight:700;font-size:3.6cqw;white-space:nowrap;overflow:hidden;}' +
    '.cpx-legende{margin:8px 0 0;font-size:12px;color:#6b7280;text-align:center;}' +
    /* éditeur */
    '.cpx-ov{position:fixed;inset:0;background:rgba(13,27,42,.62);z-index:10050;display:flex;align-items:center;justify-content:center;padding:14px;}' +
    '.cpx-box{background:#fff;border-radius:16px;max-width:980px;width:100%;max-height:94vh;overflow:auto;padding:22px;box-sizing:border-box;color:#0f172a;}' +
    '.cpx-box h2{margin:0 0 6px;font-size:18px;}.cpx-aide{font-size:12.5px;color:#64748b;line-height:1.55;margin:0 0 14px;}' +
    '.cpx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;}' +
    '.cpx-face{border:1.5px solid #e2e8f0;border-radius:12px;padding:12px;}.cpx-face h3{margin:0 0 8px;font-size:14px;}' +
    '.cpx-stage{position:relative;width:100%;background:#f1f5f9;border-radius:8px;overflow:hidden;container-type:inline-size;touch-action:none;user-select:none;}' +
    '.cpx-stage img{display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;}' +
    '.cpx-vide{display:flex;align-items:center;justify-content:center;aspect-ratio:1.586;color:#94a3b8;font-size:13px;text-align:center;padding:10px;}' +
    '.cpx-zone{position:absolute;box-sizing:border-box;border:2px dashed #2563eb;background:rgba(37,99,235,.14);border-radius:4px;cursor:move;display:flex;align-items:center;padding:0 1.8cqw;font-family:Georgia,"Times New Roman",serif;font-weight:700;font-size:3.6cqw;white-space:nowrap;overflow:hidden;}' +
    '.cpx-zone .cpx-tag{position:absolute;top:-1px;left:-1px;background:#2563eb;color:#fff;font:700 9px/1 system-ui,sans-serif;padding:2px 4px;border-radius:0 0 4px 0;}' +
    '.cpx-zone .cpx-poign{position:absolute;right:0;bottom:0;width:14px;height:14px;background:#2563eb;cursor:nwse-resize;border-radius:4px 0 0 0;}' +
    '.cpx-zone .cpx-act{position:absolute;top:0;right:0;display:flex;gap:2px;}' +
    '.cpx-zone .cpx-act button{border:none;background:#0f172a;color:#fff;font-size:10px;line-height:1;padding:3px 5px;cursor:pointer;border-radius:0 0 0 4px;}' +
    '@media (hover:hover){.cpx-zone .cpx-tag,.cpx-zone .cpx-act,.cpx-zone .cpx-poign{opacity:0;transition:opacity .12s;}.cpx-zone:hover .cpx-tag,.cpx-zone:hover .cpx-act,.cpx-zone:hover .cpx-poign{opacity:1;}}' +
    '.cpx-ligne{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px;}' +
    '.cpx-btn{border:1.5px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:9px;padding:6px 11px;font-size:12.5px;font-weight:700;cursor:pointer;}' +
    '.cpx-btn:hover{background:#f8fafc;}.cpx-btn.cpx-prim{background:#2563eb;border-color:#2563eb;color:#fff;}.cpx-btn.cpx-dng{color:#b91c1c;border-color:#fecaca;}' +
    '.cpx-statut{font-size:12px;color:#475569;margin-top:6px;min-height:16px;}.cpx-statut.cpx-ok{color:#047857;}.cpx-statut.cpx-ko{color:#b45309;}' +
    '.cpx-champ-txt{width:100%;box-sizing:border-box;border:1.5px solid #cbd5e1;border-radius:9px;padding:8px 10px;font:inherit;font-size:13px;}' +
    '.cpx-pied{display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;margin-top:16px;}';

  function injecterCss() {
    if (document.getElementById('cpx-css')) return;
    var s = document.createElement('style'); s.id = 'cpx-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pct(n) { return Math.round(n * 100) / 100; }

  /* ───────────── Affichage pour un adhérent ───────────── */
  function faceHtml(face, prenom, nom, alt) {
    var champ = function (k, txt) {
      var z = face.champs && face.champs[k];
      if (!z || !txt) return '';
      return '<div class="cpx-champ" data-fit style="left:' + z.x + '%;top:' + z.y + '%;width:' + z.w + '%;height:' + z.h + '%;color:' + esc(z.couleur || '#111111') + ';">' + esc(txt) + '</div>';
    };
    return '<div><div class="cpx-card" style="aspect-ratio:' + (Number(face.ratio) || 1.586) + ';"><img src="' + esc(face.url) + '" alt="' + esc(alt) + '" loading="lazy">' +
      champ('prenom', prenom) + champ('nom', nom) + '</div></div>';
  }
  function html(proto, prenom, nom) {
    injecterCss();
    if (!proto || (!proto.recto && !proto.verso)) return '';
    var msg = proto.message ? esc(proto.message) : esc(MESSAGE_DEFAUT);
    return '<div class="cpx-bloc"><div class="cpx-merci"><h3>🎉 Merci pour votre adhésion !</h3><p>' + msg + '</p>' +
      '<p>Voici un aperçu de la carte que vous allez recevoir, à votre nom.</p></div>' +
      '<div class="cpx-faces">' +
      (proto.recto ? faceHtml(proto.recto, prenom, nom, 'Carte de membre — recto') : '') +
      (proto.verso ? faceHtml(proto.verso, prenom, nom, 'Carte de membre — verso') : '') +
      '</div><p class="cpx-legende">Aperçu : la carte imprimée peut légèrement différer.</p></div>';
  }
  function ajusterChamps(racine) {
    (racine || document).querySelectorAll('.cpx-champ[data-fit],.cpx-zone[data-fit]').forEach(function (el) {
      el.style.fontSize = '';
      var t = parseFloat(getComputedStyle(el).fontSize) || 16;
      while (el.scrollWidth > el.clientWidth && t > 7) { t -= 1; el.style.fontSize = t + 'px'; }
    });
  }

  /* ───────────── Détection automatique des zones ───────────── */
  function chargerImage(src, cors) {
    return new Promise(function (ok, ko) {
      var i = new Image(); if (cors) i.crossOrigin = 'anonymous';
      i.onload = function () { ok(i); }; i.onerror = function () { ko(new Error('Image illisible')); }; i.src = src;
    });
  }
  /* 1) Cases claires et rectangulaires (le cas d'une carte avec des cases blanches à remplir). */
  function detecterBoites(img) {
    var W = 320, H = Math.max(2, Math.round(W * img.naturalHeight / img.naturalWidth));
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, W, H);
    var d = ctx.getImageData(0, 0, W, H).data; // lève une SecurityError si l'image vient d'un autre domaine sans CORS
    var clair = new Uint8Array(W * H), i, j;
    for (i = 0, j = 0; j < W * H; i += 4, j++) {
      var r = d[i], g = d[i + 1], b = d[i + 2], lum = 0.299 * r + 0.587 * g + 0.114 * b;
      clair[j] = (lum >= 215 && Math.max(r, g, b) - Math.min(r, g, b) < 45) ? 1 : 0;
    }
    var vu = new Uint8Array(W * H), pile = new Int32Array(W * H), res = [];
    for (var s = 0; s < W * H; s++) {
      if (!clair[s] || vu[s]) continue;
      var sp = 0, aire = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
      pile[sp++] = s; vu[s] = 1;
      while (sp) {
        var p = pile[--sp], px = p % W, py = (p / W) | 0; aire++;
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
        if (px > 0 && clair[p - 1] && !vu[p - 1]) { vu[p - 1] = 1; pile[sp++] = p - 1; }
        if (px < W - 1 && clair[p + 1] && !vu[p + 1]) { vu[p + 1] = 1; pile[sp++] = p + 1; }
        if (py > 0 && clair[p - W] && !vu[p - W]) { vu[p - W] = 1; pile[sp++] = p - W; }
        if (py < H - 1 && clair[p + W] && !vu[p + W]) { vu[p + W] = 1; pile[sp++] = p + W; }
      }
      var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (x0 <= 1 || y0 <= 1 || x1 >= W - 2 || y1 >= H - 2) continue;      // fond blanc de la page
      if (aire < W * H * 0.004) continue;                                    // bruit
      if (bw / W < 0.14 || bw / W > 0.85 || bh / H < 0.03 || bh / H > 0.2) continue;
      if (bw / bh < 2.2) continue;                                           // une case de saisie est large et basse
      if (aire / (bw * bh) < 0.75) continue;                                 // pas assez rectangulaire
      var ix = bw * 0.02, iy = bh * 0.08;                                    // petite marge intérieure
      res.push({ x: pct((x0 + ix) / W * 100), y: pct((y0 + iy) / H * 100), w: pct((bw - 2 * ix) / W * 100), h: pct((bh - 2 * iy) / H * 100) });
    }
    return res.sort(function (a, b) { return a.y - b.y; });
  }
  /* 2) Texte « Nom » / « Prénom » imprimé sur la carte (lecture de texte dans le navigateur, gratuite, chargée à la demande). */
  function chargerTesseract() {
    if (root.Tesseract) return Promise.resolve();
    return new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = function () { ok(); }; s.onerror = function () { ko(new Error('Lecture de texte indisponible')); };
      document.head.appendChild(s);
    });
  }
  async function detecterTexte(img) {
    await chargerTesseract();
    var W = Math.min(1400, img.naturalWidth), H = Math.round(W * img.naturalHeight / img.naturalWidth);
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').drawImage(img, 0, 0, W, H);
    /* Données de langue servies par jsDelivr (déjà autorisé par la politique de sécurité du site). */
    var worker = await root.Tesseract.createWorker('fra', 1, { langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/fra/4.0.0_best_int' }), out = {};
    try {
      var data = (await worker.recognize(cv)).data;
      (data.words || []).forEach(function (w) {
        var n = String(w.text || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
        var k = n === 'nom' ? 'nom' : (n === 'prenom' || n === 'prenoms') ? 'prenom' : null;
        if (!k || out[k]) return;
        var b = w.bbox, h = b.y1 - b.y0, x = b.x1 / W * 100 + 1.2, wv = Math.min(48, 100 - x - 4);
        if (wv < 12) return;
        out[k] = { x: pct(x), y: pct((b.y0 - h * 0.2) / H * 100), w: pct(wv), h: pct(h * 1.55 / H * 100) };
      });
    } finally { try { await worker.terminate(); } catch (e) { } }
    return out;
  }
  /* Résultat : { zones: {prenom,nom}, source: 'cases'|'texte'|'defaut' } */
  async function detecter(img) {
    var boites = [];
    try { boites = detecterBoites(img); } catch (e) { boites = []; }
    if (boites.length >= 2) return { zones: { prenom: boites[0], nom: boites[1] }, source: 'cases' };
    var texte = {};
    try { texte = await detecterTexte(img); } catch (e) { texte = {}; }
    if (texte.prenom || texte.nom) {
      var z = { prenom: texte.prenom || null, nom: texte.nom || null };
      if (boites.length === 1) { if (!z.nom) z.nom = boites[0]; else if (!z.prenom) z.prenom = boites[0]; }
      return { zones: z, source: 'texte' };
    }
    if (boites.length === 1) return { zones: { prenom: null, nom: boites[0] }, source: 'cases' };
    return { zones: { prenom: Object.assign({}, ZONES_DEFAUT.prenom), nom: Object.assign({}, ZONES_DEFAUT.nom) }, source: 'defaut' };
  }
  /* Couleur de texte lisible sur la zone (clair sur fond sombre, sombre sur fond clair). */
  function couleurPour(img, z) {
    try {
      var W = 200, H = Math.max(2, Math.round(W * img.naturalHeight / img.naturalWidth));
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, W, H);
      var x = Math.max(0, Math.floor(z.x / 100 * W)), y = Math.max(0, Math.floor(z.y / 100 * H));
      var w = Math.max(1, Math.min(W - x, Math.floor(z.w / 100 * W))), h = Math.max(1, Math.min(H - y, Math.floor(z.h / 100 * H)));
      var d = ctx.getImageData(x, y, w, h).data, t = 0, n = 0;
      for (var i = 0; i < d.length; i += 4) { t += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
      return (t / n) < 140 ? '#ffffff' : '#111111';
    } catch (e) { return '#111111'; }
  }

  /* ───────────── Éditeur ───────────── */
  function ouvrirEditeur(initial, options) {
    options = options || {};
    injecterCss();
    var etat = JSON.parse(JSON.stringify(initial || {}));
    ['recto', 'verso'].forEach(function (f) { if (etat[f] && !etat[f].champs) etat[f].champs = {}; });
    var local = { recto: null, verso: null };      // images locales (accès pixels sans CORS)
    var exemple = { prenom: 'Aminata', nom: 'Koné' };

    var ov = document.createElement('div'); ov.className = 'cpx-ov';
    ov.innerHTML = '<div class="cpx-box">' +
      '<h2>🪪 Prototype de la carte de membre</h2>' +
      '<p class="cpx-aide">Téléversez la maquette de votre carte (recto et/ou verso). Les zones <b>Prénom</b> et <b>Nom</b> sont repérées automatiquement : déplacez-les ou redimensionnez-les à la souris si besoin. Chaque adhérent verra ensuite <b>sa</b> carte avec son prénom et son nom.</p>' +
      '<div class="cpx-grid" id="cpx-faces"></div>' +
      '<div style="margin-top:14px;"><label style="font-size:12px;font-weight:700;">Message de remise affiché à l\'adhérent</label>' +
      '<textarea id="cpx-msg" class="cpx-champ-txt" rows="2" maxlength="400"></textarea>' +
      '<div class="cpx-aide" style="margin:4px 0 0;">Texte par défaut : « ' + esc(MESSAGE_DEFAUT) + ' » — laissez vide pour le conserver.</div></div>' +
      '<div class="cpx-ligne" style="margin-top:12px;"><span style="font-size:12px;color:#475569;">Exemple affiché dans les zones :</span>' +
      '<input id="cpx-ex-prenom" class="cpx-champ-txt" style="width:140px;" value="Aminata" maxlength="30"><input id="cpx-ex-nom" class="cpx-champ-txt" style="width:140px;" value="Koné" maxlength="30"></div>' +
      '<div class="cpx-pied"><div><button type="button" class="cpx-btn cpx-dng" id="cpx-suppr">🗑️ Supprimer le prototype</button></div>' +
      '<div style="display:flex;gap:8px;"><button type="button" class="cpx-btn" id="cpx-annuler">Annuler</button><button type="button" class="cpx-btn cpx-prim" id="cpx-ok">✅ Enregistrer le prototype</button></div></div>' +
      '</div>';
    document.body.appendChild(ov);
    var $ = function (s) { return ov.querySelector(s); };
    $('#cpx-msg').value = etat.message || '';

    function zoneHtml(side, k) {
      var z = etat[side].champs[k]; if (!z) return '';
      return '<div class="cpx-zone" data-fit data-side="' + side + '" data-k="' + k + '" style="left:' + z.x + '%;top:' + z.y + '%;width:' + z.w + '%;height:' + z.h + '%;color:' + esc(z.couleur || '#111111') + ';">' +
        '<span class="cpx-tag">' + LABELS[k] + '</span>' + esc(exemple[k]) +
        '<span class="cpx-act"><button type="button" data-act="couleur" title="Inverser la couleur du texte">◐</button><button type="button" data-act="suppr" title="Retirer cette zone">✕</button></span>' +
        '<span class="cpx-poign"></span></div>';
    }
    function rendreFace(side) {
      var cont = $('#cpx-face-' + side), f = etat[side];
      var titre = side === 'recto' ? 'Recto' : 'Verso';
      cont.innerHTML = '<h3>' + titre + '</h3>' +
        (f ? '<div class="cpx-stage" style="aspect-ratio:' + (Number(f.ratio) || 1.586) + ';"><img src="' + esc(local[side] ? local[side].src : f.url) + '" alt="">' + zoneHtml(side, 'prenom') + zoneHtml(side, 'nom') + '</div>'
           : '<div class="cpx-stage"><div class="cpx-vide">Aucune image — téléversez la maquette du ' + titre.toLowerCase() + ' de la carte (facultatif)</div></div>') +
        '<div class="cpx-ligne"><label class="cpx-btn" style="display:inline-block;">📷 ' + (f ? 'Remplacer' : 'Choisir') + ' l\'image<input type="file" accept="image/jpeg,image/png,image/webp" data-file="' + side + '" style="display:none;"></label>' +
        (f ? '<button type="button" class="cpx-btn" data-detect="' + side + '">🔍 Détecter les zones</button>' +
             '<button type="button" class="cpx-btn" data-add="' + side + ':prenom"' + (f.champs.prenom ? ' disabled' : '') + '>➕ Prénom</button>' +
             '<button type="button" class="cpx-btn" data-add="' + side + ':nom"' + (f.champs.nom ? ' disabled' : '') + '>➕ Nom</button>' +
             '<button type="button" class="cpx-btn cpx-dng" data-retire="' + side + '">Retirer</button>' : '') + '</div>' +
        '<div class="cpx-statut" id="cpx-st-' + side + '"></div>';
      ajusterChamps(cont);
    }
    function statut(side, msg, cls) { var e = $('#cpx-st-' + side); if (e) { e.textContent = msg || ''; e.className = 'cpx-statut ' + (cls || ''); } }
    function rendreTout() {
      $('#cpx-faces').innerHTML = '<div class="cpx-face" id="cpx-face-recto"></div><div class="cpx-face" id="cpx-face-verso"></div>';
      rendreFace('recto'); rendreFace('verso');
    }
    rendreTout();

    async function imageDe(side) {
      if (local[side]) return local[side];
      return chargerImage(etat[side].url, true);   // nécessite un CORS correct du CDN ; sinon repli silencieux
    }
    function recolorer(side, img) {
      ['prenom', 'nom'].forEach(function (k) { var z = etat[side].champs[k]; if (z && img) z.couleur = couleurPour(img, z); });
    }
    async function detecterFace(side) {
      statut(side, '⏳ Analyse de la carte…');
      var img; try { img = await imageDe(side); } catch (e) { statut(side, 'Détection impossible sur cette image : placez les zones à la main (➕ Prénom / ➕ Nom).', 'cpx-ko'); return; }
      var r = await detecter(img);
      etat[side].champs = {};
      ['prenom', 'nom'].forEach(function (k) { if (r.zones[k]) etat[side].champs[k] = Object.assign({}, r.zones[k]); });
      recolorer(side, img);
      rendreFace(side);
      var n = Object.keys(etat[side].champs).length;
      statut(side, r.source === 'cases' ? '✅ ' + n + ' zone' + (n > 1 ? 's' : '') + ' repérée' + (n > 1 ? 's' : '') + ' (cases vides). Ajustez-les si besoin.'
        : r.source === 'texte' ? '✅ Zones placées à droite des mots « Nom » / « Prénom » repérés. Ajustez-les si besoin.'
        : 'Aucun emplacement reconnu : zones proposées au centre — déplacez-les sur les cases de votre carte.', r.source === 'defaut' ? 'cpx-ko' : 'cpx-ok');
    }

    ov.addEventListener('change', async function (e) {
      var inp = e.target.closest('input[data-file]'); if (!inp || !inp.files[0]) return;
      var side = inp.getAttribute('data-file'), file = inp.files[0];
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { statut(side, 'Format non supporté (JPG, PNG ou WebP).', 'cpx-ko'); return; }
      statut(side, '⏳ Envoi de l\'image…');
      try {
        var obj = URL.createObjectURL(file), img = await chargerImage(obj, false);
        var url = await (options.upload ? options.upload(file) : Promise.reject(new Error('Envoi indisponible')));
        local[side] = img;
        etat[side] = { url: url, ratio: pct(img.naturalWidth / img.naturalHeight), champs: {} };
        rendreFace(side);
        await detecterFace(side);
      } catch (err) { statut(side, 'Erreur : ' + (err.message || err), 'cpx-ko'); }
    });
    ov.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-detect]'))) { detecterFace(b.getAttribute('data-detect')); return; }
      if ((b = e.target.closest('[data-add]'))) {
        var p = b.getAttribute('data-add').split(':'), side = p[0], k = p[1];
        etat[side].champs[k] = Object.assign({}, ZONES_DEFAUT[k]);
        var done = function (img) { recolorer(side, img); rendreFace(side); };
        imageDe(side).then(done, function () { rendreFace(side); }); return;
      }
      if ((b = e.target.closest('[data-retire]'))) { var s2 = b.getAttribute('data-retire'); etat[s2] = null; local[s2] = null; rendreFace(s2); return; }
      if ((b = e.target.closest('[data-act]'))) {
        var zone = b.closest('.cpx-zone'), sd = zone.getAttribute('data-side'), kk = zone.getAttribute('data-k');
        if (b.getAttribute('data-act') === 'suppr') delete etat[sd].champs[kk];
        else etat[sd].champs[kk].couleur = (etat[sd].champs[kk].couleur === '#ffffff') ? '#111111' : '#ffffff';
        rendreFace(sd); return;
      }
    });
    /* Déplacer / redimensionner une zone (souris et tactile). */
    var drag = null;
    ov.addEventListener('pointerdown', function (e) {
      var zone = e.target.closest('.cpx-zone'); if (!zone || e.target.closest('[data-act]')) return;
      var stage = zone.parentElement, r = stage.getBoundingClientRect(), side = zone.getAttribute('data-side'), k = zone.getAttribute('data-k');
      var z = etat[side].champs[k];
      drag = { zone: zone, side: side, k: k, r: r, mode: e.target.classList.contains('cpx-poign') ? 'taille' : 'deplace', sx: e.clientX, sy: e.clientY, z0: Object.assign({}, z) };
      zone.setPointerCapture && zone.setPointerCapture(e.pointerId); e.preventDefault();
    });
    ov.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = (e.clientX - drag.sx) / drag.r.width * 100, dy = (e.clientY - drag.sy) / drag.r.height * 100, z = etat[drag.side].champs[drag.k], z0 = drag.z0;
      if (drag.mode === 'deplace') { z.x = pct(Math.min(100 - z0.w, Math.max(0, z0.x + dx))); z.y = pct(Math.min(100 - z0.h, Math.max(0, z0.y + dy))); }
      else { z.w = pct(Math.min(100 - z0.x, Math.max(6, z0.w + dx))); z.h = pct(Math.min(100 - z0.y, Math.max(2.5, z0.h + dy))); }
      drag.zone.style.left = z.x + '%'; drag.zone.style.top = z.y + '%'; drag.zone.style.width = z.w + '%'; drag.zone.style.height = z.h + '%';
      ajusterChamps(drag.zone.parentElement);
    });
    function finDrag() {
      if (!drag) return;
      var d = drag; drag = null;
      imageDe(d.side).then(function (img) { var z = etat[d.side].champs[d.k]; if (z) { z.couleur = couleurPour(img, z); d.zone.style.color = z.couleur; } }, function () { });
    }
    ov.addEventListener('pointerup', finDrag); ov.addEventListener('pointercancel', finDrag);

    ['prenom', 'nom'].forEach(function (k) {
      $('#cpx-ex-' + k).addEventListener('input', function (e) { exemple[k] = e.target.value || LABELS[k]; rendreTout(); });
    });
    function fermer() { ov.remove(); }
    $('#cpx-annuler').onclick = fermer;
    $('#cpx-suppr').onclick = function () { if (confirm('Supprimer le prototype de carte de cette formule ?')) { fermer(); options.onSave && options.onSave(null); } };
    $('#cpx-ok').onclick = function () {
      if (!etat.recto && !etat.verso) { statut('recto', 'Ajoutez au moins une image (recto ou verso).', 'cpx-ko'); return; }
      var out = { message: ($('#cpx-msg').value || '').trim().slice(0, 400) || null };
      ['recto', 'verso'].forEach(function (s) { out[s] = etat[s] ? { url: etat[s].url, ratio: etat[s].ratio, champs: etat[s].champs } : null; });
      fermer(); options.onSave && options.onSave(out);
    };
  }

  root.CarteProto = { html: html, ajusterChamps: ajusterChamps, ouvrirEditeur: ouvrirEditeur, detecter: detecter, detecterBoites: detecterBoites, MESSAGE_DEFAUT: MESSAGE_DEFAUT };
})(window);
