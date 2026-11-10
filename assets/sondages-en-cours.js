/* ============================================================
   Diaspo'Actif — Bloc « Sondage en cours » (2026-11-05)
   Affiché sur la page publique d'un événement (sondages liés à cet événement) et sur le profil public d'un compte
   (sondages que le créateur a choisi d'y afficher), et sur sa boutique ({ boutique: USER_ID }, ajouté le 2026-11-09). Participation FACULTATIVE, sans compte : un simple lien vers sondage.html.
   Jamais utilisé dans le parcours d'inscription à un événement.
   Usage : SondagesEnCours.rendre({ evenement: 12, apres: element })  ou  SondagesEnCours.rendre({ profil: 34, apres: element })
   ============================================================ */
(function (root) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function jour(s) {
    var d = new Date(String(s || '').slice(0, 10) + 'T12:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  }
  var CACHE = {};
  async function rendre(opts) {
    opts = opts || {};
    var q = opts.evenement ? 'evenement=' + encodeURIComponent(opts.evenement) : opts.profil ? 'profil=' + encodeURIComponent(opts.profil) : opts.boutique ? 'boutique=' + encodeURIComponent(opts.boutique) : '';
    if (!q || !opts.apres || !opts.apres.parentNode) return null;
    var liste, ports = [];
    /* Page qui se redessine (filtres d'une boutique…) : une seule requête par emplacement. */
    if (CACHE[q]) { liste = CACHE[q].sondages; ports = CACHE[q].portefeuilles; }
    else {
      try {
        var r = await fetch('/api/sondages-en-cours?' + q, { credentials: 'same-origin' });
        if (!r.ok) return null;
        var j = await r.json(); liste = j.sondages || []; ports = j.portefeuilles || []; CACHE[q] = { sondages: liste, portefeuilles: ports };
      } catch (e) { return null; }
    }
    if (!liste.length && !ports.length) return null;
    /* Un seul bloc par emplacement, même si la fiche est rouverte. */
    var cle = 'sec-' + (opts.evenement ? 'e' + opts.evenement : opts.boutique ? 'b' + opts.boutique : 'p' + opts.profil);
    var ancien = opts.apres.parentNode.querySelector('[data-sec="' + cle + '"]');
    if (ancien) ancien.remove();
    var bloc = document.createElement('section');
    bloc.setAttribute('data-sec', cle);
    bloc.setAttribute('aria-label', 'Sondage en cours');
    bloc.style.cssText = 'margin:14px 20px 16px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:14px;padding:14px 16px;';
    bloc.innerHTML = '<div style="font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#1d4ed8;margin-bottom:8px;">📊 Sondage en cours</div>' +
      liste.map(function (s) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:6px 0;">' +
          '<div style="min-width:0;flex:1 1 220px;"><div style="font-size:14px;font-weight:700;color:#0f172a;line-height:1.35;">' + esc(s.titre) + '</div>' +
          '<div style="font-size:12px;color:#475569;margin-top:2px;">Facultatif, sans compte' + (s.date_cloture ? ' · jusqu\'au ' + esc(jour(s.date_cloture)) : '') + '</div></div>' +
          '<a href="' + esc(s.lien) + '" style="display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border-radius:10px;background:#2563EB;color:#fff;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;">Répondre au sondage</a></div>';
      }).join('') +
      /* Portefeuilles de sondages (2026-11-10) : un bloc pour plusieurs sondages, avec titre et image de couverture. */
      ports.map(function (p) {
        return '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 0;">' +
          (p.couverture ? '<img src="' + esc(p.couverture) + '" alt="" loading="lazy" style="width:56px;height:56px;object-fit:cover;border-radius:10px;flex:none;background:#0b1530;">' : '<div aria-hidden="true" style="width:56px;height:56px;border-radius:10px;flex:none;background:linear-gradient(135deg,#0d2b4e,#16457a);display:flex;align-items:center;justify-content:center;font-size:24px;">🗂️</div>') +
          '<div style="min-width:0;flex:1 1 200px;"><div style="font-size:14px;font-weight:700;color:#0f172a;line-height:1.35;">' + esc(p.titre) + '</div>' +
          '<div style="font-size:12px;color:#475569;margin-top:2px;">Portefeuille de ' + p.nb_sondages + ' sondage' + (p.nb_sondages > 1 ? 's' : '') + (p.nb_en_cours ? ' · ' + p.nb_en_cours + ' en cours' : '') + ' · facultatif, sans compte</div></div>' +
          '<a href="' + esc(p.lien) + '" style="display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border-radius:10px;background:#2563EB;color:#fff;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;">Voir le portefeuille</a></div>';
      }).join('');
    opts.apres.parentNode.insertBefore(bloc, opts.apres.nextSibling);
    return bloc;
  }
  root.SondagesEnCours = { rendre: rendre };
})(typeof window !== 'undefined' ? window : this);
