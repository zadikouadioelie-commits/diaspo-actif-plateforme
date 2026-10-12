/* ============================================================
   DIASPO'ACTIF — Cartouche d'un CV partagé dans la messagerie (2026-10-12, demande explicite)
   Un CV envoyé par message arrivait comme un simple lien. Ce module le remplace par une CARTOUCHE : aperçu du CV (photo, titre, nom, résumé,
   quelques repères) et un bouton « Ouvrir le CV » (+ « Accéder aux médias » quand des médias sont liés).
   Données : GET /api/cv-public/:jeton (déjà publique, sans compte) — un CV en brouillon, désactivé ou retiré renvoie 404 : la cartouche
   l'indique au lieu de proposer un lien mort. Utilisé par messagerie.html (site) et assets/m.js (téléphone). Autonome : injecte son style.
   ============================================================ */
(function () {
  'use strict';
  if (window.CvCarte) return;
  const RE = /https?:\/\/[^\s"'<>]*cv-public\.html\?t=([\w-]{16,64})([^\s"'<>]*)/i;
  const cache = Object.create(null);   // jeton -> { ok, data } | { ok:false }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const texteBrut = h => { const t = document.createElement('template'); t.innerHTML = String(h || '').replace(/<\/(p|div|li|h[1-6])>/gi, ' ').replace(/<br\s*\/?>/gi, ' '); return (t.content.textContent || '').replace(/\s+/g, ' ').trim(); };

  function css() {
    if (document.getElementById('cvc-css')) return;
    const s = document.createElement('style'); s.id = 'cvc-css';
    s.textContent = `
.cvc{display:block;margin:8px 0 2px;max-width:320px;text-align:left;color:#0D2B4E;font-family:inherit;white-space:normal}
.cvc *{box-sizing:border-box}
.cvc-mot{margin:0 0 7px;font-size:13px;line-height:1.45;color:inherit;overflow-wrap:anywhere}
.cvc-in{background:#fff;border:1.5px solid #DCE4EF;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(13,43,78,.10)}
.cvc-band{display:flex;align-items:center;gap:8px;padding:7px 12px;background:linear-gradient(135deg,#1E4F8A,#0D2B4E);color:#fff;font-size:11.5px;font-weight:800;letter-spacing:.08em}
.cvc-band small{margin-left:auto;font-weight:600;letter-spacing:0;opacity:.85;font-size:11px}
.cvc-bd{padding:12px}
.cvc-hd{display:flex;align-items:center;gap:10px}
.cvc-ph{flex:none;width:46px;height:46px;border-radius:50%;background:#1E4F8A;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;overflow:hidden}
.cvc-ph img{width:100%;height:100%;object-fit:cover;display:block}
.cvc-t{font-weight:800;font-size:14.5px;line-height:1.25;color:#0D2B4E;overflow-wrap:anywhere}
.cvc-s{font-size:12px;color:#5b6472;margin-top:1px;overflow-wrap:anywhere}
.cvc-ap{margin:9px 0 0;font-size:12.5px;line-height:1.45;color:#0D2B4E;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cvc-ch{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}
.cvc-ch span{font-size:11px;font-weight:700;background:#E6EBFA;color:#13369C;border-radius:99px;padding:3px 9px}
.cvc-bt{display:flex;flex-direction:column;gap:6px;margin-top:11px}
.cvc-btn{display:flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 14px;border-radius:99px;background:linear-gradient(135deg,#1E4F8A,#0D2B4E);color:#fff !important;font-weight:800;font-size:13.5px;text-decoration:none !important;text-align:center}
.cvc-btn.sec{background:#fff;color:#0D2B4E !important;border:1.5px solid #DCE4EF}
.cvc-btn:hover{filter:brightness(1.08)}
.cvc-sk{padding:14px 12px;font-size:12.5px;color:#5b6472}
.cvc-ko .cvc-bd{font-size:12.5px;color:#5b6472;line-height:1.45}`;
    document.head.appendChild(s);
  }

  /* Lien de CV trouvé dans un texte : { jeton, url (tel qu'écrit), medias (vue=medias) } ou null. */
  function extraire(texte) {
    const m = RE.exec(String(texte || '')); if (!m) return null;
    return { jeton: m[1], url: m[0], medias: /[?&]vue=medias/.test(m[2] || '') };
  }
  /* Le texte du message sans la ligne du lien (« 👀 Voir le CV en ligne : … » / « ▶ Accéder aux médias : … »), pour ne pas l'afficher deux fois. */
  function sansLien(texte, url) {
    let t = String(texte || '').split(url).join('');
    t = t.replace(/^[^\S\n]*(?:👀\s*)?(?:▶\s*)?(?:Voir le CV en ligne|Accéder aux médias)\s*:?\s*$/gmi, '').replace(/\n{3,}/g, '\n\n');
    return t.trim();
  }

  function lien(jeton, medias) { return '/cv-public.html?t=' + encodeURIComponent(jeton) + (medias ? '&vue=medias' : ''); }
  const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  function carte(jeton, d, voulaitMedias, ctx) {
    ctx = ctx || {};
    const data = d.data || {}, inf = data.infos || {};
    const nom = [inf.prenom, inf.nom].filter(Boolean).join(' ');
    const generique = /^\s*(mon cv|cv)\s*$/i.test(d.titre || '');
    const titre = (!generique && d.titre) ? d.titre : (nom ? 'CV de ' + nom : 'Curriculum vitæ');
    const sous = [nom && titre !== 'CV de ' + nom ? nom : '', inf.titre_pro].filter(Boolean).join(' · ');
    const ap = texteBrut(data.resume); const court = ap.length > 220 ? ap.slice(0, ap.lastIndexOf(' ', 220) > 120 ? ap.lastIndexOf(' ', 220) : 220) + '…' : ap;
    const nbExp = (data.experiences || []).filter(e => e && (e.poste || e.entreprise)).length, nbEdu = (data.formations || []).filter(e => e && (e.diplome || e.etablissement)).length;
    const nbMed = (d.medias || []).length;
    const lieu = [inf.ville, inf.pays_residence].filter(Boolean).join(', ');
    const chips = [lieu && '📍 ' + lieu, nbExp && nbExp + (nbExp > 1 ? ' expériences' : ' expérience'), nbEdu && nbEdu + (nbEdu > 1 ? ' formations' : ' formation'), nbMed && '▶ ' + nbMed + (nbMed > 1 ? ' médias' : ' média')].filter(Boolean);
    const photo = data.photo && data.photo.show !== false && data.photo.url ? data.photo.url : '';
    const ini = (nom || titre).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'CV';
    const montrerMedias = nbMed > 0 || voulaitMedias;
    /* Petit mot d'accompagnement : qui a transmis le CV, et une invitation aimable à en prendre connaissance. */
    const exp = ctx.expediteur ? `<b>${esc(ctx.expediteur)}</b>` : 'Un membre de Diaspo’Actif';
    const duCv = nom ? (ctx.expediteur && norm(ctx.expediteur) === norm(nom) ? 'son CV' : `le CV de <b>${esc(nom)}</b>`) : 'un CV';
    const mot = ctx.moi ? `Vous avez transmis ${nom ? `le CV de <b>${esc(nom)}</b>` : 'ce CV'}. Votre correspondant peut l’ouvrir d’un simple appui.` : `${exp} vous a transmis ${duCv}. Merci d’en prendre connaissance — excellente lecture !`;
    return `<p class="cvc-mot">${mot}</p><div class="cvc-in"><div class="cvc-band"><span aria-hidden="true">📄</span><span>CV</span><small>aperçu</small></div><div class="cvc-bd">
      <div class="cvc-hd"><span class="cvc-ph">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${photo ? '' : esc(ini)}</span><div><div class="cvc-t">${esc(titre)}</div>${sous ? `<div class="cvc-s">${esc(sous)}</div>` : ''}</div></div>
      ${court ? `<p class="cvc-ap">${esc(court)}</p>` : ''}
      ${chips.length ? `<div class="cvc-ch">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      <div class="cvc-bt"><a class="cvc-btn" href="${lien(jeton, false)}" target="_blank" rel="noopener">📄 Ouvrir le CV</a>${montrerMedias ? `<a class="cvc-btn sec" href="${lien(jeton, true)}" target="_blank" rel="noopener">▶ Accéder aux médias</a>` : ''}</div></div></div>`;
  }
  const indisponible = () => `<div class="cvc-in cvc-ko"><div class="cvc-band"><span aria-hidden="true">📄</span><span>CV</span></div><div class="cvc-bd">Ce CV n’est plus disponible : son propriétaire l’a retiré, mis en brouillon ou ne le partage plus.</div></div>`;

  /* Cartouche à insérer dans la bulle : déjà garnie si le CV est connu (aucun clignotement quand la conversation se réaffiche), sinon « chargement ». */
  function html(info, ctx) {
    css(); ctx = ctx || {};
    const c = cache[info.jeton];
    const inner = c ? (c.ok ? carte(info.jeton, c.data, info.medias, ctx) : indisponible()) : '<div class="cvc-in"><div class="cvc-sk">📄 Chargement du CV…</div></div>';
    return `<div class="cvc" data-cvc="${esc(info.jeton)}" data-med="${info.medias ? 1 : 0}" data-exp="${esc(ctx.expediteur || '')}" data-moi="${ctx.moi ? 1 : 0}"${c ? ' data-ok="1"' : ''}>${inner}</div>`;
  }
  /* Garnit les cartouches encore vides sous `racine` (une requête par CV, mémorisée). */
  function hydrater(racine) {
    css();
    (racine || document).querySelectorAll('.cvc[data-cvc]:not([data-ok])').forEach(el => {
      const jeton = el.dataset.cvc, med = el.dataset.med === '1', ctx = { expediteur: el.dataset.exp || '', moi: el.dataset.moi === '1' };
      el.setAttribute('data-ok', '1');
      const peindre = () => { const c = cache[jeton]; el.innerHTML = c && c.ok ? carte(jeton, c.data, med, ctx) : indisponible(); };
      if (cache[jeton]) return peindre();
      fetch('/api/cv-public/' + encodeURIComponent(jeton), { credentials: 'include' })
        .then(r => r.ok ? r.json().then(data => ({ ok: true, data })) : { ok: false })
        .catch(() => ({ ok: false }))
        .then(res => { cache[jeton] = res; peindre(); });
    });
  }
  window.CvCarte = { extraire, sansLien, html, hydrater };
})();
