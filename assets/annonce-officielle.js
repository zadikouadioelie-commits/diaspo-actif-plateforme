/* Annonces officielles Diaspo'Actif (2026-10-05) — rendu partagé : bandeau d'accueil, carte du fil,
   décompte, « Voir plus » (exemples d'esthétique + vocabulaire) et agrandissement de l'affiche.
   Les données viennent de GET /api/annonces-officielles/actives (ou de post.annonce dans le fil). */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function css() {
    if (document.getElementById('annonce-officielle-css')) return;
    const l = document.createElement('link'); l.id = 'annonce-officielle-css'; l.rel = 'stylesheet'; l.href = 'assets/annonce-officielle.css?v=1';
    document.head.appendChild(l);
  }
  function etincelles(n) {
    let h = '';
    for (let i = 0; i < n; i++) h += '<i class="ao-spk" style="left:' + (6 + Math.random() * 86).toFixed(0) + '%;top:' + (4 + Math.random() * 88).toFixed(0) + '%;animation-delay:' + (Math.random() * 2.8).toFixed(2) + 's;width:' + (8 + Math.random() * 7).toFixed(0) + 'px;height:' + (8 + Math.random() * 7).toFixed(0) + 'px"></i>';
    return h;
  }
  function decompteHtml(cible) {
    if (!cible) return '';
    return '<div class="ao-cd" data-ao-cd="' + esc(cible) + '" aria-label="Décompte avant le premier cycle"></div>';
  }
  function tick() {
    document.querySelectorAll('[data-ao-cd]').forEach(el => {
      const t = new Date(el.getAttribute('data-ao-cd') + 'T00:00:00');
      const ms = Math.max(0, t - new Date());
      const j = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
      const p = n => String(n).padStart(2, '0');
      el.innerHTML = '<div><b>' + j + '</b><span>jours</span></div><div><b>' + p(h) + '</b><span>heures</span></div><div><b>' + p(m) + '</b><span>min</span></div><div><b>' + p(s) + '</b><span>sec</span></div>';
    });
  }
  let timer = null;
  function demarrerTick() { tick(); if (!timer) timer = setInterval(tick, 1000); }

  function voirPlusHtml(a) {
    const vp = a.voir_plus || { exemples: [], vocabulaire: [] };
    const ini = n => String(n).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return '<div class="ao-lbl">Exemple : à quoi ressemblent les comptes à l\'honneur</div><div class="ao-ex">'
      + (vp.exemples || []).map(x => '<div class="ao-gold"><div class="ao-gold-in">' + etincelles(4) + '<div class="ao-av' + (x.type === 'initiative' ? ' sq' : '') + '">' + esc(ini(x.nom)) + '</div><div class="nm">' + esc(x.nom) + '</div><div class="sb">' + (x.type === 'initiative' ? 'Initiative' : 'Membre') + (x.ville ? ' · ' + esc(x.ville) : '') + '</div><span class="chip">🎁 Mois offert</span></div></div>').join('')
      + '</div><p class="ao-note">Comptes fictifs, à titre d\'illustration. Aucun point ni pourcentage n\'est jamais affiché publiquement.</p>'
      + '<div class="ao-lbl">Le vocabulaire</div><div class="ao-gl">' + (vp.vocabulaire || []).map(v => '<div><b>' + esc(v.terme) + '</b>' + esc(v.def) + '</div>').join('') + '</div>';
  }
  function basculerVoirPlus(btn) {
    const zone = btn.closest('.ao-body').querySelector('.ao-vp');
    const ouvert = zone.classList.toggle('on');
    btn.textContent = ouvert ? 'Voir moins ▴' : 'Voir plus ▾';
    btn.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
  }
  function agrandir(url) {
    const o = document.createElement('div'); o.className = 'ao-lbx';
    o.innerHTML = '<div role="img" aria-label="Affiche du Trophée de la Diaspora" style="background-image:url(\'' + esc(url) + '\')"></div><button aria-label="Fermer">✕</button>';
    const fermer = () => { o.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') fermer(); };
    o.addEventListener('click', fermer); document.addEventListener('keydown', onKey); document.body.appendChild(o);
  }

  /* Bloc d'annonce (même rendu à l'accueil et dans le fil). */
  function bloc(a, opts) {
    opts = opts || {};
    const lien = a.evenement_id ? 'evenements.html?evt=' + a.evenement_id : 'fil-actualite.html';
    const img = a.image_url ? '<button type="button" class="ao-art" style="background-image:url(\'' + esc(a.image_url) + '\')" aria-label="Agrandir l\'affiche" onclick="AnnonceOff.agrandir(\'' + esc(a.image_url) + '\')"></button>' : '';
    return '<div class="ao-gold"><div class="ao-gold-in">' + etincelles(opts.compact ? 5 : 8) + '<div class="ao-feat">' + img
      + '<div class="ao-body"><span class="ao-tag">✦ Annonce officielle · Diaspo\'Actif</span>'
      + '<' + (opts.h || 'h2') + '>' + esc(a.titre) + '</' + (opts.h || 'h2') + '>'
      + (a.accroche ? '<p>' + esc(a.accroche) + '</p>' : '')
      + decompteHtml(a.decompte_cible)
      + '<div class="ao-btns"><a class="ao-btn pri" href="' + esc(lien) + '">Découvrir le programme</a><button type="button" class="ao-btn" aria-expanded="false" onclick="AnnonceOff.voirPlus(this)">Voir plus ▾</button></div>'
      + '<div class="ao-vp">' + voirPlusHtml(a) + '</div></div></div></div></div>';
  }

  /* Bandeau d'accueil : charge les annonces actives et remplit #ao-band. */
  async function bandeauAccueil(conteneurId) {
    const el = document.getElementById(conteneurId || 'ao-band'); if (!el) return;
    try {
      const r = await fetch('/api/annonces-officielles/actives', { credentials: 'include' }).then(x => x.json());
      const a = (r.annonces || []).find(x => { try { return !sessionStorage.getItem('ao_ferme_' + x.id); } catch (_) { return true; } });
      if (!a) return;
      css();
      el.innerHTML = '<div class="ao-wrap"><button type="button" class="ao-close" aria-label="Masquer cette annonce" title="Masquer pour cette session" onclick="AnnonceOff.fermer(' + a.id + ')">✕</button>' + bloc(a) + '</div>';
      el.style.display = 'block'; demarrerTick();
    } catch (_) { /* l'annonce est facultative : ne jamais gêner la page d'accueil */ }
  }
  function fermer(id) { try { sessionStorage.setItem('ao_ferme_' + id, '1'); } catch (_) {} const el = document.getElementById('ao-band'); if (el) el.style.display = 'none'; }

  window.AnnonceOff = { css, bloc, voirPlus: basculerVoirPlus, agrandir, bandeauAccueil, fermer, demarrerTick, tick };
})();
