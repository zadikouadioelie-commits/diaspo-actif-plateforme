/* ============================================================
   Diaspo'Actif — Bloc « Sondage en cours » (2026-11-05)
   Affiché sur la page publique d'un événement (sondages liés à cet événement) et sur le profil public d'un compte
   (sondages que le créateur a choisi d'y afficher). Participation FACULTATIVE, sans compte : un simple lien vers sondage.html.
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
  async function rendre(opts) {
    opts = opts || {};
    var q = opts.evenement ? 'evenement=' + encodeURIComponent(opts.evenement) : opts.profil ? 'profil=' + encodeURIComponent(opts.profil) : '';
    if (!q || !opts.apres || !opts.apres.parentNode) return null;
    var liste;
    try {
      var r = await fetch('/api/sondages-en-cours?' + q, { credentials: 'same-origin' });
      if (!r.ok) return null;
      liste = (await r.json()).sondages || [];
    } catch (e) { return null; }
    if (!liste.length) return null;
    /* Un seul bloc par emplacement, même si la fiche est rouverte. */
    var cle = 'sec-' + (opts.evenement ? 'e' + opts.evenement : 'p' + opts.profil);
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
      }).join('');
    opts.apres.parentNode.insertBefore(bloc, opts.apres.nextSibling);
    return bloc;
  }
  root.SondagesEnCours = { rendre: rendre };
})(typeof window !== 'undefined' ? window : this);
