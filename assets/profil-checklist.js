/* ══════════════════════════════════════════════════════════════════════════
   assets/profil-checklist.js — « Mon profil public » : la liste de tout ce qui doit y figurer (2026-10-10)

   Chaque élément est coché automatiquement quand il est rempli ; chaque élément manquant porte un bouton qui mène
   DIRECTEMENT au bon formulaire. Données : GET /api/profil-public/checklist (server/profil-public.js) — la même liste
   que celle du critère « Profil public rempli » de l'indice de fiabilité.

   Usage :  <div data-profil-checklist></div>          (affichage automatique)
            ProfilChecklist.render(conteneur, { replie: true })
   Se rafraîchit seul au retour sur la page (après avoir rempli un champ ailleurs).
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLE_MASQUE = 'pc_masquer_remplis';
  const lire = () => { try { return localStorage.getItem(CLE_MASQUE) === '1'; } catch (e) { return false; } };
  const ecrire = v => { try { localStorage.setItem(CLE_MASQUE, v ? '1' : '0'); } catch (e) {} };

  const CSS = `
.pc-card{background:var(--surface,#fff);border:1px solid var(--border,#E2E8F0);border-radius:14px;padding:16px;font-family:inherit;color:var(--text,#102A43)}
.pc-tete{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.pc-titre{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#64748b)}
.pc-badge{font-size:12px;font-weight:800;padding:3px 11px;border-radius:99px}
.pc-badge.manque{background:#FFF4DB;color:#8A4B00;border:1px solid #F2D58A}.pc-badge.complet{background:#DCFCE7;color:#166534;border:1px solid #BBF7D0}
.pc-resume{font-size:13px;margin:0 0 8px;color:var(--text,#102A43)}
.pc-barre{height:8px;background:#EEF2F7;border-radius:99px;overflow:hidden;margin-bottom:12px}
.pc-barre>span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#F26422,#22C55E);transition:width .5s}
.pc-cta{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 16px;border-radius:10px;background:var(--orange,#F26422);color:#fff;font-weight:800;font-size:14px;text-decoration:none;margin-bottom:12px;max-width:100%}
.pc-cta:hover{filter:brightness(.93)}
.pc-groupe{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;margin:12px 0 6px}
.pc-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.pc-it{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:10px;border:1px solid #E2E8F0;background:#F8FAFC}
.pc-it.manque{background:#FFFBEB;border-color:#FDE68A}
.pc-it.ok{background:#F6FBF8;border-color:#C7EBD5}
.pc-ic{flex:none;width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:900}
.pc-it.ok .pc-ic{background:#22C55E;color:#fff}.pc-it.manque .pc-ic{background:#fff;border:2px solid #F59E0B;color:#B45309}
.pc-txt{flex:1;min-width:0}.pc-lib{font-size:13.5px;font-weight:700}.pc-it.ok .pc-lib{color:#166534;font-weight:600}
.pc-aide{font-size:12px;color:var(--muted,#64748b);margin-top:1px;line-height:1.4}
.pc-btn{flex:none;display:inline-flex;align-items:center;min-height:36px;padding:0 13px;border-radius:9px;background:var(--navy,#0D2B4E);color:#fff;font-weight:700;font-size:12.5px;text-decoration:none;white-space:nowrap}
.pc-btn:hover{filter:brightness(1.15)}
.pc-fait{flex:none;font-size:12px;font-weight:700;color:#166534}
.pc-bascule{margin-top:12px;background:none;border:1px solid var(--border,#CBD5E1);border-radius:9px;min-height:40px;padding:0 13px;font-size:12.5px;font-weight:700;color:var(--text,#102A43);cursor:pointer;font-family:inherit}
.pc-bascule:hover{background:#F1F5F9}
.pc-erreur,.pc-chargement{font-size:12.5px;color:var(--muted,#64748b);padding:6px 0}
.pc-card :focus-visible{outline:3px solid #0D2B4E;outline-offset:2px}
@media (max-width:520px){.pc-it{flex-wrap:wrap}.pc-btn{width:100%;justify-content:center;min-height:44px}}
@media (prefers-reduced-motion:reduce){.pc-barre>span{transition:none}}`;
  function injecterCSS() {
    if (document.getElementById('pc-style')) return;
    const s = document.createElement('style'); s.id = 'pc-style'; s.textContent = CSS; document.head.appendChild(s);
  }

  function ligne(i) {
    if (i.ok) return `<li class="pc-it ok"><span class="pc-ic" aria-hidden="true">✔</span><div class="pc-txt"><div class="pc-lib">${esc(i.libelle)}</div></div><span class="pc-fait">Renseigné</span></li>`;
    return `<li class="pc-it manque"><span class="pc-ic" aria-hidden="true">○</span><div class="pc-txt"><div class="pc-lib">${esc(i.libelle)} <span class="sr-only" style="position:absolute;left:-9999px">— à compléter</span></div>${i.aide ? `<div class="pc-aide">${esc(i.aide)}</div>` : ''}</div><a class="pc-btn" href="${esc(i.lien)}">Remplir →</a></li>`;
  }

  async function render(conteneur, opts) {
    opts = opts || {};
    if (!conteneur) return;
    injecterCSS();
    if (!conteneur.dataset.pcPret) conteneur.innerHTML = '<div class="pc-card"><div class="pc-chargement">Chargement de votre profil public…</div></div>';
    let d;
    try {
      const r = await fetch('/api/profil-public/checklist', { credentials: 'include' });
      if (r.status === 401) { conteneur.innerHTML = ''; return; }
      d = await r.json();
    } catch (e) { conteneur.innerHTML = '<div class="pc-card"><div class="pc-erreur">Impossible de charger la liste de votre profil public pour le moment.</div></div>'; return; }
    if (!d || !d.applicable) { conteneur.innerHTML = ''; return; }
    conteneur.dataset.pcPret = '1';

    const masquer = lire();
    const items = d.items || [];
    const manquants = items.filter(i => !i.ok);
    const complet = manquants.length === 0;
    const prochain = manquants.find(i => i.groupe === 'essentiel') || manquants[0];
    const groupes = [['essentiel', d.role === 'utilisateur' ? 'L’essentiel' : null], ['complement', 'Pour aller plus loin']]
      .map(([g, titre]) => ({ g, titre, items: items.filter(i => (i.groupe || 'essentiel') === g) })).filter(x => x.items.length);

    const bloc = x => {
      const vus = masquer ? x.items.filter(i => !i.ok) : x.items;
      if (!vus.length) return '';
      const fait = x.items.filter(i => i.ok).length;
      return `${x.titre ? `<div class="pc-groupe">${esc(x.titre)} · ${fait}/${x.items.length}</div>` : ''}<ul class="pc-liste">${vus.map(ligne).join('')}</ul>`;
    };

    conteneur.innerHTML = `<section class="pc-card" aria-label="Mon profil public">
      <div class="pc-tete"><span class="pc-titre">📋 Mon profil public</span>
        <span class="pc-badge ${complet ? 'complet' : 'manque'}">${complet ? '✔ Profil complet' : `${manquants.length} élément${manquants.length > 1 ? 's' : ''} à renseigner`}</span></div>
      <p class="pc-resume">${complet ? 'Tout est renseigné : votre profil public est complet.' : `<strong>${d.remplis}</strong> élément${d.remplis > 1 ? 's' : ''} sur <strong>${d.total}</strong> renseigné${d.remplis > 1 ? 's' : ''} (${d.pct} %).`}</p>
      <div class="pc-barre" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${d.pct}" aria-label="Profil public rempli à ${d.pct} %"><span style="width:${d.pct}%"></span></div>
      ${prochain ? `<a class="pc-cta" href="${esc(prochain.lien)}">Compléter : ${esc(prochain.libelle.replace(/^(Votre|Le|La|Les|Vos) /i, ''))} →</a>` : ''}
      ${groupes.map(bloc).join('')}
      ${(!complet && d.remplis > 0) ? `<button type="button" class="pc-bascule" id="pc-bascule">${masquer ? 'Afficher aussi ce qui est déjà rempli' : 'Masquer ce qui est déjà rempli'}</button>` : ''}
    </section>`;
    const b = conteneur.querySelector('#pc-bascule');
    if (b) b.onclick = () => { ecrire(!masquer); render(conteneur, opts); };
  }

  function autoInit() { document.querySelectorAll('[data-profil-checklist]').forEach(el => render(el)); }
  /* Retour sur la page (onglet réactivé, bouton « précédent ») : un champ vient peut-être d'être rempli ailleurs. */
  const rafraichir = () => document.querySelectorAll('[data-profil-checklist]').forEach(el => { if (el.dataset.pcPret) render(el); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) rafraichir(); });
  window.addEventListener('pageshow', e => { if (e.persisted) rafraichir(); });

  window.ProfilChecklist = { render, autoInit };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit); else autoInit();
})();
