/* Événements : répartition En cours / À venir / Terminés (2026-10-04, demande explicite).
   Source de vérité = evt.statut_temporel calculé par le serveur (heure de Paris, voir
   statutTemporelEvenement dans server/index.js) ; le calcul local ne sert que de repli si
   le champ est absent. Partagé par evenements-app.html et la vitrine (profil-app.html) pour
   que les deux se comportent exactement pareil. */
window.EvtTemporel = (function () {
  const LIBELLES = { en_cours: '🔴 En cours', a_venir: '📅 À venir', termine: '🏁 Terminés' };
  const LIBELLE_FUSION = { a_venir: '📅 À venir et en cours', termine: '🏁 Terminés' };
  const rappels = {};

  (function css() {
    if (document.getElementById('evt-temporel-css')) return;
    const s = document.createElement('style');
    s.id = 'evt-temporel-css';
    s.textContent = `
      .evt-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px}
      .evt-tab{border:1px solid var(--border,#E3DDD8);background:var(--card,#fff);color:var(--muted,#6b7280);border-radius:99px;padding:6px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
      .evt-tab:hover{border-color:#2F6BED;color:#2F6BED}
      .evt-tab.actif{background:#2F6BED;border-color:#2F6BED;color:#fff}
      .evt-tab .n{margin-left:5px;opacity:.8;font-weight:600}
      .evt-badge-statut{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:99px;margin-left:6px;vertical-align:middle}
      .evt-badge-statut.termine{background:#E5E7EB;color:#374151}
      .evt-badge-statut.en_cours{background:#FEE2E2;color:#B91C1C}
      .evt-card-termine .evt-img{filter:grayscale(1);opacity:.6}
      .evt-card-termine .evt-title,.evt-card-termine .evt-meta,.evt-card-termine .evt-body > p{opacity:.65}
      .evt-card-termine .evt-date{color:#6B7280}
      .evt-plus{display:block;margin:16px auto 0;border:1px solid var(--border,#E3DDD8);background:var(--card,#fff);color:#2F6BED;border-radius:99px;padding:8px 20px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
    `;
    document.head.appendChild(s);
  })();

  function cleLocale(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function statut(e) {
    if (e && e.statut_temporel) return e.statut_temporel;
    const debut = String((e && (e.date_evt || e.date_debut || e.date)) || '').slice(0, 10);
    const fin = String((e && (e.date_fin || e.fin)) || '').slice(0, 10) || debut;
    if (!debut && !fin) return 'a_venir';
    const auj = cleLocale(new Date());
    if ((fin || debut) < auj) return 'termine';
    if (debut && debut <= auj) return 'en_cours';
    return 'a_venir';
  }

  /* Clé de tri = JOUR DE DÉBUT puis heure (jamais la date de création, ni la date de fin d'un
     événement sur plusieurs jours). Heure normalisée sur 2 chiffres pour que « 9:00 » passe
     avant « 10:00 » ; un événement sans date est classé en dernier. */
  function cleTri(e) {
    const brut = String(e.date_evt || e.date_debut || e.date || '');
    const jour = brut.slice(0, 10);
    if (!jour) return '9999-99-99 99:99';
    const m = String(e.heure_debut || e.heure || '').match(/(\d{1,2})[:h](\d{2})/) || brut.slice(11, 16).match(/(\d{1,2}):(\d{2})/);
    return jour + ' ' + (m ? m[1].padStart(2, '0') + ':' + m[2] : '00:00');
  }

  /* fusion=true : « En cours » est regroupé avec « À venir » (vitrine, place limitée) —
     chaque carte garde son badge « En cours » pour rester repérable. */
  function repartir(liste, fusion) {
    const g = { en_cours: [], a_venir: [], termine: [] };
    (liste || []).forEach(e => g[statut(e)].push(e));
    g.en_cours.sort((a, b) => cleTri(a).localeCompare(cleTri(b)));
    g.a_venir.sort((a, b) => cleTri(a).localeCompare(cleTri(b)));
    g.termine.sort((a, b) => cleTri(b).localeCompare(cleTri(a)));
    if (fusion) { g.a_venir = [...g.en_cours, ...g.a_venir]; g.en_cours = []; }
    return g;
  }

  function ongletsDispo(g) {
    return ['en_cours', 'a_venir', 'termine'].filter(k => g[k].length);
  }

  /* À venir par défaut ; si vide, ce qui existe. Un onglet choisi puis vidé retombe aussi ici. */
  function ongletActif(g, demande) {
    if (demande && g[demande] && g[demande].length) return demande;
    return ['a_venir', 'en_cours', 'termine'].find(k => g[k].length) || 'a_venir';
  }

  /* HTML de la barre d'onglets ; vide quand elle n'apporterait rien (un seul onglet « à venir »). */
  function barre(cle, g, actif, fusion, surChoix) {
    rappels[cle] = surChoix;
    const dispo = ongletsDispo(g);
    if (dispo.length < 2 && (dispo[0] || 'a_venir') !== 'termine') return '';
    const lib = fusion ? LIBELLE_FUSION : LIBELLES;
    return '<div class="evt-tabs" role="tablist">' + dispo.map(k =>
      '<button type="button" role="tab" aria-selected="' + (k === actif) + '" class="evt-tab' + (k === actif ? ' actif' : '') +
      '" onclick="EvtTemporel.choisir(\'' + cle + '\',\'' + k + '\')">' + lib[k] + '<span class="n">' + g[k].length + '</span></button>'
    ).join('') + '</div>';
  }

  function choisir(cle, onglet) { if (rappels[cle]) rappels[cle](onglet); }

  function badge(e) {
    const st = statut(e);
    if (st === 'termine') return '<span class="evt-badge-statut termine">Terminé</span>';
    if (st === 'en_cours') return '<span class="evt-badge-statut en_cours">En cours</span>';
    return '';
  }

  return { statut, repartir, ongletActif, barre, choisir, badge };
})();
