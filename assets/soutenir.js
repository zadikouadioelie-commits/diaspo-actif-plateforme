/* ── Bouton « Soutenir » partagé — Diaspo'Actif (2026-10-07, demande explicite) ──
   Une cartouche qui rassemble TOUS les chemins pour soutenir une initiative avec de l'argent
   (dons/cagnottes, adhésion, boutique, billets d'événements) et laisse la personne choisir où
   elle veut le mettre. Posé sur les cartes de l'annuaire et sur le profil visiteur.

   - Soutenir.buttonHtml(ownerUserId, { cls, nom }) : bouton MASQUÉ par défaut ; jamais de
     bouton mort — il n'est révélé que si le serveur confirme au moins un chemin ouvert.
   - Soutenir.hydrate(racine) : UNE requête groupée (GET /api/soutenir-lot) pour tous les
     boutons de la page (même leçon que DonBanner.renderLot : une requête par carte a déjà
     saturé le rate-limit en 429).
   - Soutenir.open(ownerUserId, nom) : charge le détail (GET /api/soutenir/:ownerUserId) et
     affiche la cartouche. Les règles d'éligibilité vivent côté serveur (chargerSoutiens). */
window.Soutenir = (function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function injecterStyles() {
    if (document.getElementById('soutenir-styles')) return;
    const st = document.createElement('style');
    st.id = 'soutenir-styles';
    st.textContent = `
      .soutenir-btn[hidden] { display:none !important; }
      .soutenir-btn { background:#16A34A; color:#fff; border:none; grid-column:1 / -1; justify-content:center; cursor:pointer; }
      .soutenir-btn:hover { background:#15803D; }
      .soutenir-btn:focus-visible { outline:3px solid #86EFAC; outline-offset:2px; }
      .pvz-btn.soutenir-btn { border:1px solid #16A34A; display:inline-flex; }
      .pvz-btn.soutenir-btn[hidden] { display:none !important; }

      .so-overlay { position:fixed; inset:0; background:rgba(13,27,42,.6); z-index:10000; display:flex; align-items:center; justify-content:center; padding:16px; }
      .so-dialog { background:#fff; color:#0D1B2A; border-radius:18px; width:100%; max-width:520px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 70px rgba(0,0,0,.35); animation:so-in .2s ease-out; }
      @keyframes so-in { from { opacity:0; transform:translateY(12px) scale(.98); } to { opacity:1; transform:none; } }
      .so-head { background:#0D1B2A; color:#fff; padding:18px 20px; display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .so-head h2 { margin:0; font-size:17px; font-weight:800; line-height:1.3; }
      .so-head p { margin:4px 0 0; font-size:12.5px; opacity:.85; }
      .so-close { flex-shrink:0; width:44px; height:44px; margin:-6px -8px 0 0; background:none; border:none; color:#fff; font-size:26px; line-height:1; cursor:pointer; border-radius:10px; }
      .so-close:hover { background:rgba(255,255,255,.12); }
      .so-close:focus-visible, .so-choice:focus-visible { outline:3px solid #F97316; outline-offset:2px; }
      .so-body { padding:6px 18px 18px; overflow-y:auto; -webkit-overflow-scrolling:touch; }
      .so-section { margin-top:16px; }
      .so-section h3 { margin:0 0 8px; font-size:12px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:#475569; }
      .so-choice { display:flex; align-items:center; gap:12px; width:100%; box-sizing:border-box; min-height:56px; padding:12px 14px; margin-bottom:8px; background:#fff; border:1.5px solid #E2E8F0; border-radius:14px; color:inherit; text-decoration:none; text-align:left; font:inherit; cursor:pointer; transition:border-color .15s, background .15s; }
      .so-choice:hover { border-color:#16A34A; background:#F0FDF4; }
      .so-ico { flex-shrink:0; width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; background:#F0FDF4; }
      .so-txt { flex:1; min-width:0; }
      .so-titre { font-size:14px; font-weight:700; line-height:1.3; overflow-wrap:anywhere; }
      .so-desc { font-size:12.5px; color:#475569; margin-top:2px; line-height:1.4; }
      .so-tag { display:inline-block; font-size:11px; font-weight:700; padding:2px 8px; border-radius:99px; background:#DCFCE7; color:#166534; margin-top:5px; margin-right:4px; }
      .so-tag.o { background:#FFEDD5; color:#9A3412; }
      .so-tag.b { background:#DBEAFE; color:#1E40AF; }
      .so-go { flex-shrink:0; font-size:20px; color:#16A34A; font-weight:700; }
      .so-bar { height:7px; border-radius:99px; background:#E2E8F0; margin-top:8px; overflow:hidden; }
      .so-bar > i { display:block; height:100%; background:#16A34A; border-radius:99px; }
      .so-state { padding:28px 8px; text-align:center; color:#475569; font-size:14px; }
      .so-more { display:block; text-align:center; font-size:13px; font-weight:700; color:#15803D; padding:8px; text-decoration:underline; }
      @media (max-width:560px) {
        .so-overlay { align-items:flex-end; padding:0; }
        .so-dialog { max-width:none; border-radius:18px 18px 0 0; max-height:92vh; }
      }
      @media (prefers-reduced-motion:reduce) { .so-dialog { animation:none; } .so-choice { transition:none; } }
    `;
    document.head.appendChild(st);
  }
  injecterStyles();

  function buttonHtml(ownerUserId, opts) {
    opts = opts || {};
    const id = Number(ownerUserId);
    if (!id) return '';
    return `<button type="button" class="${esc(opts.cls || '')} soutenir-btn" data-soutenir-owner="${id}" data-soutenir-nom="${esc(opts.nom || '')}" hidden aria-haspopup="dialog" onclick="event.stopPropagation(); Soutenir.open(${id}, this.dataset.soutenirNom)">💚 Soutenir</button>`;
  }

  async function hydrate(racine) {
    racine = racine || document;
    const boutons = [...racine.querySelectorAll('button[data-soutenir-owner][hidden]')];
    const ids = [...new Set(boutons.map(b => b.dataset.soutenirOwner))];
    if (!ids.length) return;
    let soutiens = {};
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const r = await fetch(`/api/soutenir-lot?owner_user_ids=${ids.slice(i, i + 100).join(',')}`);
        Object.assign(soutiens, (await r.json()).soutiens || {});
      }
    } catch (e) { return; }
    boutons.forEach(b => { if (soutiens[b.dataset.soutenirOwner]) b.hidden = false; });
  }

  function montant(n, devise) {
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise || 'EUR', maximumFractionDigits: 0 }).format(Number(n) || 0); }
    catch (e) { return `${Math.round(Number(n) || 0)} ${esc(devise || '€')}`; }
  }
  function dateCourte(d) {
    try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); } catch (e) { return ''; }
  }

  function choix(href, ico, titre, desc, tags, extra, onclick) {
    const contenu = `<span class="so-ico" aria-hidden="true">${ico}</span>
      <span class="so-txt"><span class="so-titre">${esc(titre)}</span>${desc ? `<span class="so-desc" style="display:block;">${esc(desc)}</span>` : ''}${tags || ''}${extra || ''}</span>
      <span class="so-go" aria-hidden="true">›</span>`;
    return href
      ? `<a class="so-choice" href="${href}">${contenu}</a>`
      : `<button type="button" class="so-choice" onclick="${onclick}">${contenu}</button>`;
  }

  function sectionDons(d, ownerId) {
    if (!d.dons || !d.dons.length) return '';
    const lignes = d.dons.slice(0, 5).map(c => {
      const href = `cagnotte.html?slug=${encodeURIComponent(c.slug)}`;
      if (c.type_don === 'recurrent') {
        return choix(href, '🔁', c.titre, 'Un geste régulier qui permet à l\'initiative de planifier ses actions.', `<span class="so-tag">Don récurrent${c.recurrence_periodicite ? ' · ' + esc(c.recurrence_periodicite) : ''}</span>`);
      }
      if (c.type_don === 'occasionnel') {
        return choix(href, '💝', c.titre, c.description ? String(c.description).slice(0, 110) : 'Un don en une seule fois, du montant de votre choix.', '<span class="so-tag">Don ponctuel</span>');
      }
      const pct = c.pourcentage != null ? Math.max(0, Math.min(100, Number(c.pourcentage))) : null;
      const barre = pct != null
        ? `<span class="so-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Avancement de la cagnotte"><i style="width:${pct}%"></i></span>
           <span class="so-desc" style="display:block;">${montant(c.montant_collecte, c.devise)} collectés sur ${montant(c.objectif_montant, c.devise)} (${pct} %)</span>`
        : `<span class="so-desc" style="display:block;">${montant(c.montant_collecte, c.devise)} collectés</span>`;
      const fin = c.date_fin ? `<span class="so-tag o">Jusqu'au ${esc(dateCourte(c.date_fin))}</span>` : '';
      return choix(href, '🎯', c.titre, c.description ? String(c.description).slice(0, 110) : '', `<span class="so-tag">Cagnotte</span>${fin}`, barre);
    }).join('');
    const plus = d.dons.length > 5 ? `<a class="so-more" href="cagnottes.html?owner=${encodeURIComponent(ownerId)}">Voir toutes les cagnottes (${d.dons.length})</a>` : '';
    return `<div class="so-section"><h3>Faire un don</h3>${lignes}${plus}</div>`;
  }

  function sectionAutres(d, ownerId) {
    let h = '';
    /* Autres adhésions seulement (2026-10-08, demande explicite) : l'adhésion à l'initiative elle-même
       n'est proposée que par le bouton « Adhérer à l'initiative » — jamais ici. */
    if (d.adhesions && d.adhesions.length && d.initiative) {
      const lignes = d.adhesions.slice(0, 6).map(f => {
        const prix = f.montant_type === 'libre' ? 'Montant libre'
          : f.montant_type === 'minimum' || f.montant_type === 'min' ? (Number(f.montant_min) > 0 ? 'Dès ' + montant(f.montant_min, f.devise) : 'Montant libre')
          : (Number(f.montant_fixe) > 0 ? montant(f.montant_fixe, f.devise) : 'Gratuit');
        return choix(`adhesions.html?initiative=${encodeURIComponent(d.initiative.id)}&formule=${encodeURIComponent(f.id)}`, f.icone || '🎫', f.nom,
          f.description ? String(f.description).replace(/<[^>]*>/g, ' ').slice(0, 110) : 'Une autre manière de rejoindre et de soutenir la structure.',
          `<span class="so-tag b">${esc(prix)}</span>`);
      }).join('');
      h += `<div class="so-section"><h3>Adhésions</h3>${lignes}</div>`;
    }
    if (d.boutique) {
      h += `<div class="so-section"><h3>Acheter</h3>${choix(`profil.html?id=${encodeURIComponent(ownerId)}&vitrine=1`, '🏬', 'Visiter la boutique',
        'Chaque achat finance directement l\'initiative.', `<span class="so-tag b">${Number(d.boutique.nb_produits)} produit${d.boutique.nb_produits > 1 ? 's' : ''}</span>`)}</div>`;
    }
    if (d.evenements && d.evenements.length) {
      const lignes = d.evenements.slice(0, 3).map(e => {
        const prix = e.participation === 'gratuit' ? '<span class="so-tag">Gratuit</span>'
          : `<span class="so-tag o">${e.participation === 'partiellement_payant' ? 'Partiellement payant' : 'Billet payant'}${e.prix_min > 0 ? ' · dès ' + montant(e.prix_min, 'EUR') : ''}</span>`;
        const lieu = [e.ville, e.pays].filter(Boolean).join(', ');
        return choix(`evenements.html#evt-${Number(e.id)}`, '🎟️', e.titre, `${dateCourte(e.date_evt)}${lieu ? ' · ' + lieu : ''}`, prix);
      }).join('');
      const reste = (d.nb_evenements || 0) - 3;
      const plus = reste > 0 ? `<a class="so-more" href="profil.html?id=${encodeURIComponent(ownerId)}&vitrine=1">Voir les ${reste} autre${reste > 1 ? 's' : ''} événement${reste > 1 ? 's' : ''}</a>` : '';
      h += `<div class="so-section"><h3>Billets &amp; événements</h3>${lignes}${plus}</div>`;
    }
    return h;
  }

  let precedentFocus = null;
  function fermer() {
    const ov = document.getElementById('so-overlay');
    if (ov) ov.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', surClavier, true);
    if (precedentFocus && precedentFocus.focus) { try { precedentFocus.focus(); } catch (e) {} }
  }
  function surClavier(e) {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); return; }
    if (e.key !== 'Tab') return;
    const f = [...document.querySelectorAll('#so-overlay a[href], #so-overlay button')].filter(x => !x.disabled);
    if (!f.length) return;
    const premier = f[0], dernier = f[f.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  }

  async function open(ownerUserId, nom) {
    const id = Number(ownerUserId);
    if (!id) return;
    injecterStyles();
    fermer();
    precedentFocus = document.activeElement;
    const ov = document.createElement('div');
    ov.id = 'so-overlay';
    ov.className = 'so-overlay';
    ov.addEventListener('click', e => { if (e.target === ov) fermer(); });
    ov.innerHTML = `<div class="so-dialog" role="dialog" aria-modal="true" aria-labelledby="so-titre-dlg">
      <div class="so-head">
        <div><h2 id="so-titre-dlg">💚 Soutenir ${esc(nom || 'cette initiative')}</h2><p>Choisissez où vous souhaitez mettre votre argent.</p></div>
        <button type="button" class="so-close" aria-label="Fermer" onclick="Soutenir.close()">×</button>
      </div>
      <div class="so-body" id="so-body" aria-live="polite"><div class="so-state">Chargement…</div></div>
    </div>`;
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', surClavier, true);
    ov.querySelector('.so-close').focus();
    const corps = ov.querySelector('#so-body');
    try {
      const r = await fetch(`/api/soutenir/${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      const html = sectionDons(d, id) + sectionAutres(d, id);
      corps.innerHTML = html || '<div class="so-state">Cette initiative n\'a pas encore ouvert de moyen de soutien. Vous pouvez en attendant la suivre ou la contacter.</div>';
      if (d.initiative && d.initiative.nom && !nom) document.getElementById('so-titre-dlg').textContent = '💚 Soutenir ' + d.initiative.nom;
    } catch (e) {
      corps.innerHTML = `<div class="so-state">Impossible de charger les moyens de soutien pour le moment.<br><button type="button" class="so-choice" style="justify-content:center;margin-top:12px;" onclick="Soutenir.open(${id}, ${JSON.stringify(nom || '').replace(/"/g, '&quot;')})">Réessayer</button></div>`;
    }
  }

  return { buttonHtml, hydrate, open, close: fermer };
})();
