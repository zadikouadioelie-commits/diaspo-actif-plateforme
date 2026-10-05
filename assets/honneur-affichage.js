/* Comptes à l'honneur — affichage public (2026-10-05) : mur d'honneur (accueil, annuaire), cadre doré
   et badge « Co-créateur actif » sur les cartes de l'annuaire, coup de pouce côté administrateur.
   Public = noms, types, photos et badges uniquement : aucun point, pourcentage ni classement. */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function css() {
    if (document.getElementById('honneur-aff-css')) return;
    const l = document.createElement('link'); l.id = 'honneur-aff-css'; l.rel = 'stylesheet'; l.href = 'assets/annonce-officielle.css?v=1'; document.head.appendChild(l);
    const s = document.createElement('style'); s.id = 'honneur-aff-css2';
    s.textContent = `
    .hn-mur{max-width:1200px;margin:18px auto;padding:0 24px}
    .hn-mur h2{font-size:20px;margin:0 0 4px}.hn-mur .hn-sub{font-size:13px;color:var(--muted,#5B6B82);margin:0 0 12px}
    .hn-mur-grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}
    .hn-mur a.ao-gold{text-decoration:none;display:block}
    .hn-mur .ao-gold-in{padding:16px 10px 14px;text-align:center}
    .hn-mur .ao-av{overflow:hidden}.hn-mur .ao-av img{width:100%;height:100%;object-fit:cover}
    .hn-mur .nm{font-weight:700;font-size:14.5px}.hn-mur .sb{font-size:12px;color:#A9B6C9}
    .hn-badge-co{display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,#FFF8E1,#FDECB4);color:#7A5200;border:1.5px solid #E3B84A;border-radius:99px;padding:2px 9px;font-size:10.5px;font-weight:800;margin:2px 0}
    .ann-card.hn-or{box-shadow:0 0 0 3px #E7B93C,0 8px 26px rgba(242,201,76,.35);border-color:#E7B93C}
    .hn-or-chip{display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,#E7B93C,#FFE27A);color:#3b2a00;border-radius:99px;padding:3px 10px;font-size:10.5px;font-weight:800;margin:2px 0}
    @media(max-width:600px){.hn-mur{padding:0 16px}}`;
    document.head.appendChild(s);
  }
  let _cache = null;
  async function donnees() {
    if (_cache) return _cache;
    _cache = Promise.all([
      fetch('/api/honneur/laureats', { credentials: 'include' }).then(r => r.json()).catch(() => ({ laureats: [] })),
      fetch('/api/honneur/co-createurs', { credentials: 'include' }).then(r => r.json()).catch(() => ({ initiative_ids: [], user_ids: [] })),
    ]).then(([l, c]) => ({ laureats: l.laureats || [], cycle: l.cycle || null, coUsers: new Set((c.user_ids || []).map(Number)), coInits: new Set((c.initiative_ids || []).map(Number)) }));
    return _cache;
  }
  const initiales = n => String(n).split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  /* Mur d'honneur : rien n'est affiché tant qu'aucun cycle n'a été clôturé avec des lauréats. */
  async function mur(elId, opts) {
    opts = opts || {};
    const el = document.getElementById(elId); if (!el) return;
    const d = await donnees();
    if (!d.laureats.length) { el.style.display = 'none'; return; }
    css();
    const fin = d.cycle && d.cycle.affiche_jusqu_au ? new Date(d.cycle.affiche_jusqu_au + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : '';
    const tri = d.laureats.slice().sort((a, b) => (a.categorie === b.categorie ? 0 : a.categorie === 'initiative' ? -1 : 1));
    el.innerHTML = '<div class="hn-mur"><h2>🏆 Comptes à l\'honneur</h2><p class="hn-sub">Mis à l\'honneur pour leur activité sur Diaspo\'Actif' + (fin ? ' jusqu\'à la prochaine remise, en ' + esc(fin) : '') + '. Merci pour votre engagement.</p><div class="hn-mur-grille">'
      + tri.map(l => '<a class="ao-gold" href="' + esc(l.profil_url) + '"><div class="ao-gold-in"><div class="ao-av' + (l.categorie === 'initiative' ? ' sq' : '') + '">' + (l.photo_url ? '<img src="' + esc(l.photo_url) + '" alt="" loading="lazy" onerror="this.remove()">' : esc(initiales(l.nom))) + '</div><div class="nm">' + esc(l.nom) + '</div><div class="sb">' + (l.categorie === 'initiative' ? 'Initiative' : 'Membre') + (l.ville ? ' · ' + esc(l.ville) : '') + '</div></div></a>').join('')
      + '</div></div>';
    el.style.display = 'block';
  }

  /* Annuaire : cadre doré + badge sur les cartes déjà rendues (et celles ajoutées après filtrage). */
  async function decorerAnnuaire(listeId) {
    const liste = document.getElementById(listeId); if (!liste) return;
    const d = await donnees();
    const lauUsers = new Set(d.laureats.map(l => Number(l.user_id)));
    if (!lauUsers.size && !d.coUsers.size) return;
    css();
    const passe = () => liste.querySelectorAll('.ann-card:not([data-hn])').forEach(carte => {
      carte.setAttribute('data-hn', '1');
      const a = carte.querySelector('a[href*="profil.html?id="]'); const m = a && a.getAttribute('href').match(/profil\.html\?id=(\d+)/);
      const uid = m ? Number(m[1]) : null; if (!uid) return;
      const titre = carte.querySelector('.ann-card-title'); if (!titre) return;
      let html = '';
      if (lauUsers.has(uid)) { carte.classList.add('hn-or'); html += '<span class="hn-or-chip">🏆 À l\'honneur</span> '; }
      if (d.coUsers.has(uid)) html += '<span class="hn-badge-co" title="Compte distingué pour son implication dans la vie de la plateforme">✦ Co-créateur actif</span>';
      if (html) titre.insertAdjacentHTML('afterend', '<div>' + html + '</div>');
    });
    passe(); new MutationObserver(passe).observe(liste, { childList: true });
  }

  window.HonneurAffichage = { css, donnees, mur, decorerAnnuaire };
})();
