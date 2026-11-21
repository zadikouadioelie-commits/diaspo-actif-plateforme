/* ═══════════════════════════════════════════════════════
   assets/cr-rappel-carte.js — Cartouche « Faites le compte-rendu de votre événement » (2026-11-21, demande explicite)

   « Ne pas faire uniquement une notification : faire réellement apparaître une cartouche, à la prochaine connexion, avec un bouton Ignorer,
     me le rappeler plus tard ou ne plus afficher. Nous vous invitons à faire le compte rendu de tel événement ou de tel événement. »

   Une seule cartouche pour le site (assets/app.js) et le téléphone (assets/m.js) : les deux appellent DACrRappel.demarrer() une fois la personne
   connectée. Les données et les règles viennent du serveur (server/cr-rappel.js) : GET /api/cr-rappel = événements à proposer maintenant ;
   POST /api/cr-rappel/action = « plus_tard » (rappel dans 3 jours) ou « ne_plus_afficher » (plus aucun rappel pour ces événements).
   « Ignorer » est local au navigateur : fermée pour la session, la cartouche revient à la prochaine connexion.
   Jamais affichée sur la connexion, l'inscription ni l'écran du compte-rendu lui-même, ni dans un cadre incorporé.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.DACrRappel) return;

  const CLE_IGNORE = 'da_cr_rappel_ignore';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lire = () => { try { return sessionStorage.getItem(CLE_IGNORE) === '1'; } catch (e) { return false; } };
  const ecrire = () => { try { sessionStorage.setItem(CLE_IGNORE, '1'); } catch (e) { /* stockage indisponible : la cartouche reviendra à la page suivante, sans gravité */ } };

  const SVG_DOC = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>';
  const SVG_FLECHE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

  const CSS = `
.crr-fond{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,13,30,.72);animation:crr-fondu .3s ease-out}
.crr-carte{position:relative;width:100%;max-width:460px;max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;padding:24px 22px 18px;border-radius:20px;color:#fff;text-align:left;
  background:linear-gradient(180deg,#14305a 0%,#0D2B4E 45%,#0B1226 100%);border:1px solid rgba(227,192,110,.55);box-shadow:0 24px 60px -12px rgba(0,0,0,.65);animation:crr-monte .35s cubic-bezier(.2,.8,.2,1)}
.crr-ico{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:rgba(227,192,110,.14);border:1px solid rgba(227,192,110,.45);color:#E3C06E}
.crr-titre{margin:14px 0 6px;font-size:21px;line-height:1.2;font-weight:800;color:#fff;font-family:inherit}
.crr-texte{margin:0 0 14px;font-size:15px;line-height:1.5;color:#b9c7e0}
.crr-liste{list-style:none;margin:0 0 16px;padding:0;display:flex;flex-direction:column;gap:8px}
.crr-ligne{display:flex;align-items:center;gap:10px;min-height:52px;padding:10px 12px;border-radius:14px;text-decoration:none;color:#fff;background:rgba(255,255,255,.07);border:1px solid rgba(127,166,224,.32)}
.crr-ligne:hover,.crr-ligne:focus-visible{background:rgba(255,255,255,.12);border-color:#E3C06E;outline:none}
.crr-ligne b{display:block;font-size:15px;line-height:1.3;font-weight:700;overflow-wrap:anywhere}
.crr-ligne small{display:block;margin-top:2px;font-size:12.5px;color:#b9c7e0}
.crr-ligne .crr-aller{flex:none;display:inline-flex;align-items:center;gap:1px;white-space:nowrap;margin-left:auto;padding:7px 8px 7px 11px;border-radius:10px;font-size:13px;font-weight:800;color:#1a1202;background:var(--nd-degore,#E3C06E)}
.crr-ligne .crr-aller svg{margin-left:2px}
.crr-actions{display:flex;flex-direction:column;gap:8px}
.crr-b{min-height:46px;padding:10px 14px;border-radius:12px;font:inherit;font-size:15px;font-weight:700;cursor:pointer;color:#fff;background:transparent;border:1.5px solid rgba(127,166,224,.55)}
.crr-b:hover,.crr-b:focus-visible{border-color:#E3C06E;outline:none}
.crr-b[disabled]{opacity:.6;cursor:default}
.crr-b.crr-doux{border-color:transparent;color:#b9c7e0;font-weight:600}
.crr-rang{display:flex;gap:8px}
.crr-rang .crr-b{flex:1;min-width:0}
.crr-aide{margin:12px 0 0;font-size:12.5px;line-height:1.45;color:#b9c7e0}
.crr-err{margin:10px 0 0;font-size:13.5px;color:#fff;background:rgba(220,38,38,.28);border:1px solid #dc2626;border-radius:10px;padding:8px 10px}
.crr-ok{margin:6px 0 4px;font-size:16px;font-weight:700;color:#E3C06E}
@keyframes crr-fondu{from{opacity:0}to{opacity:1}}
@keyframes crr-monte{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@media (max-width:520px){.crr-fond{align-items:flex-end;padding:10px}.crr-carte{padding:20px 16px 14px}.crr-rang{flex-direction:column}}
@media (prefers-reduced-motion:reduce){.crr-fond,.crr-carte{animation:none}}`;

  function styles() {
    if (document.getElementById('crr-style')) return;
    const s = document.createElement('style'); s.id = 'crr-style'; s.textContent = CSS; document.head.appendChild(s);
  }

  function dateLisible(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); if (!m) return '';
    try { return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }); } catch (e) { return ''; }
  }

  async function appeler(methode, chemin, corps) {
    const opts = { method: methode, headers: {}, credentials: 'same-origin' };
    if (corps !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(corps); }
    const r = await fetch('/api' + chemin, opts);
    let data = {}; try { data = await r.json(); } catch (e) { /* réponse vide */ }
    if (!r.ok) throw Object.assign(new Error(data.error || 'Erreur serveur'), { status: r.status });
    return data;
  }

  function afficher(evenements, reportJours) {
    styles();
    const un = evenements.length === 1;
    const ids = evenements.map(e => e.id);
    const lignes = evenements.map(e => {
      const d = dateLisible(e.date);
      return `<li><a class="crr-ligne" href="${esc(e.lien)}" data-crr-lien><span><b>${esc(e.titre)}</b><small>${d ? esc(d) : ''}${d && e.brouillon ? ' · ' : ''}${e.brouillon ? 'brouillon commencé' : ''}</small></span><span class="crr-aller">${e.brouillon ? 'Terminer' : 'Rédiger'}${SVG_FLECHE}</span></a></li>`;
    }).join('');
    const fond = document.createElement('div');
    fond.className = 'crr-fond'; fond.id = 'cr-rappel';
    fond.setAttribute('role', 'dialog'); fond.setAttribute('aria-modal', 'true'); fond.setAttribute('aria-labelledby', 'crr-titre');
    fond.innerHTML = `<div class="crr-carte">
      <div class="crr-ico">${SVG_DOC}</div>
      <h2 class="crr-titre" id="crr-titre">${un ? 'Racontez votre événement' : 'Racontez vos événements'}</h2>
      <p class="crr-texte">${un
        ? 'Nous vous invitons à faire le compte-rendu de cet événement : informer, remercier, garder une trace.'
        : 'Nous vous invitons à faire le compte-rendu de l’un de ces événements, ou de chacun d’eux : informer, remercier, garder une trace.'}</p>
      <ul class="crr-liste">${lignes}</ul>
      <div class="crr-actions" id="crr-actions">
        <div class="crr-rang"><button type="button" class="crr-b" data-crr="plus_tard">Me le rappeler plus tard</button><button type="button" class="crr-b" data-crr="ignorer">Ignorer</button></div>
        <button type="button" class="crr-b crr-doux" data-crr="ne_plus_afficher">Ne plus afficher</button>
      </div>
      <p class="crr-aide" id="crr-aide">« Plus tard » : la cartouche revient dans ${reportJours || 3} jours. « Ignorer » : elle revient à votre prochaine connexion. « Ne plus afficher » : plus aucun rappel pour ${un ? 'cet événement' : 'ces événements'}.</p>
    </div>`;
    document.body.appendChild(fond);
    const carte = fond.querySelector('.crr-carte');
    const fermer = () => { document.removeEventListener('keydown', touche); fond.remove(); };
    const ignorer = () => { ecrire(); fermer(); };
    function touche(e) {
      if (e.key === 'Escape') { ignorer(); return; }
      if (e.key !== 'Tab') return;
      const f = [...carte.querySelectorAll('a[href],button:not([disabled])')]; if (!f.length) return;
      const premier = f[0], dernier = f[f.length - 1];
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    }
    document.addEventListener('keydown', touche);
    /* Aller rédiger : la cartouche ne doit pas se redresser devant la personne à son retour dans la session. */
    carte.querySelectorAll('[data-crr-lien]').forEach(a => a.addEventListener('click', ecrire));
    carte.querySelector('[data-crr="ignorer"]').addEventListener('click', ignorer);
    carte.querySelectorAll('[data-crr="plus_tard"],[data-crr="ne_plus_afficher"]').forEach(b => b.addEventListener('click', async () => {
      const action = b.getAttribute('data-crr');
      carte.querySelectorAll('button').forEach(x => { x.disabled = true; });
      const ancienne = carte.querySelector('.crr-err'); if (ancienne) ancienne.remove();
      try {
        await appeler('POST', '/cr-rappel/action', { action, evenement_ids: ids });
        ecrire();
        carte.innerHTML = `<div class="crr-ico">${SVG_DOC}</div><p class="crr-ok" role="status">${action === 'plus_tard'
          ? `C’est noté : je vous le rappellerai dans ${reportJours || 3} jours.`
          : `C’est noté : plus aucun rappel pour ${un ? 'cet événement' : 'ces événements'}.`}</p>`;
        setTimeout(fermer, 2200);
      } catch (e) {
        carte.querySelectorAll('button').forEach(x => { x.disabled = false; });
        const m = document.createElement('p'); m.className = 'crr-err'; m.setAttribute('role', 'alert');
        m.textContent = 'Votre choix n’a pas pu être enregistré. Vérifiez votre connexion et réessayez.';
        carte.querySelector('#crr-aide').before(m);
      }
    }));
    const premierLien = carte.querySelector('a.crr-ligne'); if (premierLien) premierLien.focus({ preventScroll: true });
  }

  let enCours = false;
  async function demarrer() {
    if (enCours || window.top !== window) return;
    if (/(^|\/)(login|inscription|compte-rendu)(\.html)?$/.test(location.pathname)) return;
    if (document.getElementById('cr-rappel') || lire()) return;
    enCours = true;
    try {
      /* Une autre fenêtre d'accueil (relance du profil public…) est déjà ouverte : on laisse la personne la traiter, la cartouche viendra à la page suivante. */
      await new Promise(r => setTimeout(r, 1400));
      if (document.getElementById('rp-overlay') || document.getElementById('cr-rappel') || lire()) return;
      let d; try { d = await appeler('GET', '/cr-rappel'); } catch (e) { return; }
      if (!d || !Array.isArray(d.evenements) || !d.evenements.length) return;
      if (document.getElementById('rp-overlay')) return;
      afficher(d.evenements, d.report_jours);
    } finally { enCours = false; }
  }

  window.DACrRappel = { demarrer };
})();
