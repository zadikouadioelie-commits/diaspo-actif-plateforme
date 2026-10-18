/* Dossier investisseur — gabarit « Nuit dorée » (PROPOSITION 2026-10-12).
   S'ajoute à la liste des gabarits de business-plan-dossier.html (premium, corporate, moderne, impact, finance) : même structure de pages,
   couverture et chapitres nuit avec lueur dorée, pages sur papier ivoire, bronze doré à la place de l'orange. Les couleurs servent aussi
   à l'export PowerPoint (la page lit ACTIVE_TPL). Les autres gabarits ne changent pas. Chargé APRÈS le script de la page. */
(function () {
  if (typeof TEMPLATES === 'undefined') return;
  TEMPLATES.nuit_doree = {
    label: '✨ Nuit dorée — prestige',
    navy: '#0B1226', orange: '#8A6A2C', blue: '#3F5FA8',
    paper: '#FBF8EF', ink: '#101827', inkSoft: '#4A5468', line: '#E3DAC0',
    cover: 'dark',
    coverBg: 'radial-gradient(ellipse 900px 520px at 88% 0%, rgba(227,192,110,.22), transparent 60%), radial-gradient(ellipse 760px 520px at 0% 100%, rgba(63,123,255,.16), transparent 60%), linear-gradient(165deg,#060A14 0%,#0B1226 100%)'
  };
  /* La page n'applique que des couleurs : on note le gabarit actif sur <html> pour que la feuille de style puisse y poser les titres en Bodoni. */
  if (typeof applyTemplate === 'function' && !applyTemplate.__nd) {
    const appliquer = applyTemplate;
    window.applyTemplate = function (key) { document.documentElement.setAttribute('data-dp-tpl', key); return appliquer.apply(this, arguments); };
    window.applyTemplate.__nd = true;
  }
})();
