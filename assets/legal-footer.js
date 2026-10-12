/* ═════════════════════════════════════════════════════════════════
   Pied de page légal (2026-10-12, demande explicite) — complète le pied de page de chaque page publique pour qu'il
   renvoie TOUJOURS vers : mentions légales, CGU, CGV, politique de confidentialité, cookies, charte, sécurité
   informatique et contact juridique. Un lien déjà présent n'est jamais dupliqué ; seuls les manquants sont ajoutés.
   Chargé par assets/cookies-banner.js (présent sur toutes les pages publiques).
   ═════════════════════════════════════════════════════════════════ */
(function () {
  var LIENS = [
    ['Mentions légales', 'mentions-legales.html'],
    ['CGU', 'cgu.html'],
    ['CGV', 'cgv.html'],
    ['Politique de confidentialité', 'politique-confidentialite.html'],
    ['Cookies', 'politique-confidentialite.html#cookies'],
    ['Charte', 'charte.html'],
    ['Sécurité informatique', 'securite-informatique.html'],
    ['Contact juridique', 'mailto:contact@diaspoactif.com?subject=Contact%20juridique']
  ];
  var cle = function (h) { return String(h || '').replace(/^\.?\//, '').replace(/^https?:\/\/[^/]+\/?/, '').toLowerCase(); };
  function completer(footer) {
    var liens = Array.prototype.slice.call(footer.querySelectorAll('a'));
    var presents = liens.map(function (a) { return cle(a.getAttribute('href')); });
    var manquants = LIENS.filter(function (l) { return presents.indexOf(cle(l[1])) === -1; });
    if (!manquants.length) return;
    /* Même présentation que les liens légaux déjà là : on insère après le dernier d'entre eux, sinon à la fin du pied de page. */
    var modele = liens.filter(function (a) { return /mentions-legales|cgu\.html|confidentialite|charte|securite/.test(a.getAttribute('href') || ''); }).pop();
    var parent = modele ? modele.parentNode : footer, ref = modele ? modele.nextSibling : null;
    manquants.forEach(function (l) {
      var sep = document.createTextNode(' · ');
      var a = document.createElement('a');
      a.href = l[1]; a.textContent = l[0];
      a.className = modele ? modele.className : 'footer-link';
      if (modele && modele.getAttribute('style')) a.setAttribute('style', modele.getAttribute('style'));
      parent.insertBefore(sep, ref); parent.insertBefore(a, ref);
    });
  }
  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('footer'), function (f) {
      if (f.querySelector('a[href$="cgu.html"], a[href$="mentions-legales.html"]')) completer(f);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
