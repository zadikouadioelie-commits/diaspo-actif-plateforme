/* ═══════════════════════════════════════════════════════
   assets/tuto-partage.js — Partager un tuto vidéo (2026-10-12, demande explicite)
   « Les tutos de l'accueil : une option pour les partager directement, la cartouche telle qu'elle, avec juste le nom du compte qui
     fait le transfert — Move to Learn vous invite à voir le tuto <titre> — et une image pour que ce soit attrayant. »
   TutoPartage.ouvrir(videoId) : fenêtre avec l'aperçu de la cartouche (affiche + texte exact) et trois façons de partager :
   · publier sur le fil Diaspo'Actif (compte connecté) — POST /api/videos-tutoriels/:id/partager ;
   · WhatsApp et copie du lien (même sans compte) ; · feuille de partage native du téléphone quand elle existe.
   Chargé à la demande par dvtPartager() (assets/videos-tutoriels-public.js) : aucune page n'a besoin de l'inclure.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lienTuto = id => location.origin + '/videos-tutoriels.html?v=' + encodeURIComponent(id);
  const duree = s => { s = s | 0; return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : ''; };
  let precedentFocus = null;

  function css() {
    if (document.getElementById('tp-css')) return;
    const s = document.createElement('style'); s.id = 'tp-css';
    s.textContent = `
      .tp-voile{position:fixed;inset:0;background:rgba(10,20,40,.62);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px}
      .tp-box{background:#fff;color:#1f2937;border-radius:16px;width:100%;max-width:440px;max-height:92vh;overflow:auto;box-shadow:0 24px 70px rgba(0,0,0,.4);font-family:inherit}
      .tp-tete{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #eef0f4}
      .tp-box .tp-tete h2{margin:0;font-size:17px;color:#102A43}
      .tp-x{background:none;border:0;font-size:20px;line-height:1;cursor:pointer;color:#6b7280;padding:6px;border-radius:8px;min-width:36px;min-height:36px}
      .tp-x:hover{background:#f3f4f6}
      .tp-corps{padding:16px 18px 18px}
      .tp-carte{border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;background:#fff;margin-bottom:14px}
      .tp-img{position:relative;aspect-ratio:16/9;background:#0D2B4E;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .tp-img img{width:100%;height:100%;object-fit:cover;display:block}
      .tp-play{position:absolute;width:54px;height:54px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;padding-left:4px}
      .tp-dur{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.72);color:#fff;font-size:12px;font-weight:700;padding:2px 7px;border-radius:6px}
      .tp-txt{padding:12px 14px}
      .tp-invit{margin:0 0 4px;font-size:14.5px;line-height:1.4;font-weight:600}
      .tp-cat{font-size:12px;color:#6b7280}
      .tp-actions{display:flex;flex-direction:column;gap:9px}
      .tp-btn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:10px 14px;border-radius:12px;border:1.5px solid #d1d5db;background:#fff;color:#1f2937;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;text-decoration:none;text-align:center}
      .tp-btn:hover{background:#f9fafb}.tp-btn:focus-visible,.tp-x:focus-visible{outline:3px solid #2563EB;outline-offset:2px}
      .tp-btn.pri{background:linear-gradient(135deg,#F26422,#e0501a);border-color:transparent;color:#fff}.tp-btn.pri:hover{filter:brightness(1.06)}
      .tp-btn.wa{background:#25D366;border-color:transparent;color:#063}.tp-btn[disabled]{opacity:.6;cursor:wait}
      .tp-info{font-size:13px;color:#6b7280;margin:0 0 10px}
      .tp-ok{background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;border-radius:12px;padding:12px 14px;font-size:14px;margin-bottom:10px}
      .tp-err{background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;border-radius:12px;padding:10px 14px;font-size:13.5px;margin-bottom:10px}
      @media (prefers-reduced-motion:no-preference){.tp-box{animation:tp-in .18s ease-out}@keyframes tp-in{from{transform:translateY(12px);opacity:0}to{opacity:1}}}`;
    document.head.appendChild(s);
    /* Design « Nuit dorée » (2026-10-30) : feuille plus spécifique (#tp-voile …) qui remplace l'habillage ci-dessus ; retour arrière : retirer ces 3 lignes */
    const nd = document.createElement('link'); nd.id = 'tp-css-nd'; nd.rel = 'stylesheet'; nd.href = '/assets/tuto-partage-nuit-doree.css?v=1';
    document.head.appendChild(nd);
  }

  function fermer() {
    const v = document.getElementById('tp-voile'); if (v) v.remove();
    document.removeEventListener('keydown', surTouche, true);
    document.body.style.overflow = document.body.dataset.tpOverflow || '';
    if (precedentFocus && precedentFocus.focus) { try { precedentFocus.focus(); } catch (e) { /* élément disparu */ } }
  }
  function surTouche(e) {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); return; }
    if (e.key !== 'Tab') return;
    const f = [...document.querySelectorAll('#tp-voile button, #tp-voile a[href]')].filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const premier = f[0], dernier = f[f.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  }

  function carteHtml(c, texte) {
    return `<div class="tp-carte">
      <div class="tp-img">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : '<span style="font-size:42px">🎬</span>'}<span class="tp-play" aria-hidden="true">▶</span>${duree(c.duree_secondes) ? `<span class="tp-dur">${duree(c.duree_secondes)}</span>` : ''}</div>
      <div class="tp-txt"><p class="tp-invit">${esc(texte)}</p>${c.categorie ? `<div class="tp-cat">${esc(c.categorie)}</div>` : ''}</div></div>`;
  }

  async function ouvrir(videoId) {
    css();
    fermer();
    precedentFocus = document.activeElement;
    document.body.dataset.tpOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    const voile = document.createElement('div');
    voile.id = 'tp-voile'; voile.className = 'tp-voile';
    voile.innerHTML = `<div class="tp-box" role="dialog" aria-modal="true" aria-labelledby="tp-titre">
      <div class="tp-tete"><h2 id="tp-titre">Partager ce tuto</h2><button type="button" class="tp-x" id="tp-x" aria-label="Fermer">✕</button></div>
      <div class="tp-corps" id="tp-corps"><p class="tp-info">Chargement…</p></div></div>`;
    document.body.appendChild(voile);
    voile.addEventListener('mousedown', e => { if (e.target === voile) fermer(); });
    document.getElementById('tp-x').onclick = fermer;
    document.addEventListener('keydown', surTouche, true);
    document.getElementById('tp-x').focus();

    const corps = document.getElementById('tp-corps');
    let d;
    try {
      const r = await fetch(`/api/videos-tutoriels/${encodeURIComponent(videoId)}/partager`, { credentials: 'include' });
      d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Indisponible');
    } catch (e) { corps.innerHTML = `<div class="tp-err">${esc(e.message || 'Ce tuto n\'est pas disponible.')}</div>`; return; }

    const c = d.carte;
    let lien = lienTuto(c.id);   // devient le lien de la publication une fois le tuto publié sur le fil (aperçu image + texte sur WhatsApp)
    const texte = d.texte || `Découvrez le tuto « ${c.titre} » sur Diaspo'Actif`;
    const redirection = encodeURIComponent(location.pathname + location.search);
    corps.innerHTML = `
      ${carteHtml(c, texte)}
      <div id="tp-msg"></div>
      <div class="tp-actions">
        ${d.connecte
          ? `<button type="button" class="tp-btn pri" id="tp-fil">📰 Publier sur mon fil Diaspo'Actif</button>`
          : `<p class="tp-info" style="margin:0">Connectez-vous pour publier ce tuto sur votre fil Diaspo'Actif.</p><a class="tp-btn pri" href="login.html?redirect=${redirection}">Me connecter</a>`}
        <a class="tp-btn wa" id="tp-wa" href="https://wa.me/?text=${encodeURIComponent(texte + ' ' + lien)}" target="_blank" rel="noopener">💬 Envoyer par WhatsApp</a>
        <button type="button" class="tp-btn" id="tp-copie">🔗 Copier le lien</button>
        ${navigator.share ? '<button type="button" class="tp-btn" id="tp-natif">📤 Autres applications…</button>' : ''}
        ${d.connecte ? `<button type="button" class="tp-btn" id="tp-mail">✉️ Envoyer par e-mail (titre, affiche, durée)</button>
        <div id="tp-mailbox" hidden style="display:none;flex-direction:column;gap:9px"><input type="text" id="tp-mailin" inputmode="email" autocomplete="email" aria-label="Adresses e-mail des destinataires" placeholder="adresse@exemple.com (jusqu'à 5, séparées par une virgule)" style="width:100%;box-sizing:border-box;padding:12px;border:1.5px solid #d1d5db;border-radius:12px;font:inherit;font-size:15px"><button type="button" class="tp-btn pri" id="tp-mailgo">Envoyer l'e-mail</button></div>` : ''}
      </div>`;

    const msg = (html, cls) => { document.getElementById('tp-msg').innerHTML = html ? `<div class="${cls}" role="status">${html}</div>` : ''; };
    const copie = document.getElementById('tp-copie');
    copie.onclick = async () => {
      try { await navigator.clipboard.writeText(lien); msg('Lien copié.', 'tp-ok'); }
      catch (e) { const t = document.createElement('textarea'); t.value = lien; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); msg('Lien copié.', 'tp-ok'); } catch (x) { msg('Copie impossible : ' + esc(lien), 'tp-err'); } t.remove(); }
    };
    const natif = document.getElementById('tp-natif');
    if (natif) natif.onclick = () => navigator.share({ title: c.titre, text: texte, url: lien }).catch(() => {});
    const wa = document.getElementById('tp-wa');
    const mail = document.getElementById('tp-mail');
    if (mail) {
      mail.onclick = () => { document.getElementById('tp-mailbox').style.display = 'flex'; mail.style.display = 'none'; document.getElementById('tp-mailin').focus(); };
      const go = document.getElementById('tp-mailgo');
      go.onclick = async () => {
        go.disabled = true; go.textContent = 'Envoi…'; msg('');
        try {
          const r = await fetch(`/api/videos-tutoriels/${encodeURIComponent(c.id)}/envoyer-email`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails: document.getElementById('tp-mailin').value }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || 'Envoi impossible.');
          msg(j.envoyes > 1 ? `✅ E-mail envoyé à ${j.envoyes} personnes.` : '✅ E-mail envoyé.', 'tp-ok');
          go.textContent = '✓ Envoyé';
        } catch (e) { msg(esc(e.message), 'tp-err'); go.disabled = false; go.textContent = 'Envoyer l\'e-mail'; }
      };
    }
    const fil = document.getElementById('tp-fil');
    if (fil) fil.onclick = async () => {
      fil.disabled = true; fil.textContent = 'Publication…'; msg('');
      try {
        const r = await fetch(`/api/videos-tutoriels/${encodeURIComponent(c.id)}/partager`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Publication impossible.');
        msg(`${j.deja ? 'Vous avez déjà partagé ce tuto aujourd\'hui. ' : '✅ Tuto publié sur votre fil. '}<a href="${esc(j.lien)}" style="color:inherit;font-weight:700">Voir la publication →</a>`, 'tp-ok');
        fil.textContent = '✓ Publié sur mon fil';
        /* Le lien de la publication a un aperçu riche (affiche + texte) sur WhatsApp et les réseaux ; « &r= » rend chaque partage unique
           (WhatsApp garde pour toujours un aperçu raté par adresse exacte). */
        lien = `${location.origin}/${j.lien}&r=${Date.now().toString(36)}`;
        wa.href = 'https://wa.me/?text=' + encodeURIComponent(texte + ' ' + lien);
      } catch (e) { msg(esc(e.message), 'tp-err'); fil.disabled = false; fil.textContent = '📰 Publier sur mon fil Diaspo\'Actif'; }
    };
  }

  window.TutoPartage = { ouvrir };
})();
