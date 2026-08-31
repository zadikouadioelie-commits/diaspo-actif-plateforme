/* ═══════════════════════════════════════════════════════════════════
   CurrencyManager — Diaspo'Actif (2026-08-31)
   Service centralisé de gestion multidevise pour le module Business Plan
   (cahier des charges "Gestion multidevise", point 23 : "Ne pas coder les
   conversions indépendamment dans chaque section. Créer un système centralisé").

   Remplace les 3 formateurs jusqu'ici indépendants et tous EUR codé en dur :
   - fmtEuro()  dans business-plan-edit.html
   - fmtMontant() dans business-plan-view.html
   - fmtEUR()   dans business-plan-dossier.html

   Principe fondamental (points 9/10 du cahier des charges) : la monnaie de
   référence est la SEULE monnaie utilisée pour les calculs internes. Les
   devises secondaires ne sont JAMAIS des valeurs stockées indépendamment —
   uniquement des conversions calculées à l'affichage, à partir du montant de
   référence et du taux figé enregistré dans le Business Plan.
   ═══════════════════════════════════════════════════════════════════ */
(function () {

  /* Liste normalisée ISO 4217 (point 3). glueCompact : accolé au multiple
     (k€, M$) sans espace pour les symboles courts type signe monétaire ;
     avec espace pour les abréviations à plusieurs lettres (k FCFA, M CHF)
     — lisibilité, pas de règle ISO officielle sur ce point. */
  const CURRENCY_LIST = [
    { code: 'EUR', nom: 'Euro',              symbole: '€',    decimales: 2, glueCompact: true },
    { code: 'USD', nom: 'Dollar américain',  symbole: '$',    decimales: 2, glueCompact: true },
    { code: 'GBP', nom: 'Livre sterling',    symbole: '£',    decimales: 2, glueCompact: true },
    { code: 'CHF', nom: 'Franc suisse',      symbole: 'CHF',  decimales: 2, glueCompact: false },
    { code: 'CAD', nom: 'Dollar canadien',   symbole: 'CA$',  decimales: 2, glueCompact: true },
    { code: 'XOF', nom: 'Franc CFA BCEAO',   symbole: 'FCFA', decimales: 0, glueCompact: false },
    { code: 'XAF', nom: 'Franc CFA BEAC',    symbole: 'FCFA', decimales: 0, glueCompact: false },
    { code: 'MAD', nom: 'Dirham marocain',   symbole: 'DH',   decimales: 2, glueCompact: false },
    { code: 'DZD', nom: 'Dinar algérien',    symbole: 'DA',   decimales: 2, glueCompact: false },
    { code: 'TND', nom: 'Dinar tunisien',    symbole: 'DT',   decimales: 3, glueCompact: false },
    { code: 'CDF', nom: 'Franc congolais',   symbole: 'FC',   decimales: 2, glueCompact: false },
    { code: 'GHS', nom: 'Cedi ghanéen',      symbole: 'GH₵',  decimales: 2, glueCompact: true },
    { code: 'NGN', nom: 'Naira nigérian',    symbole: '₦',    decimales: 2, glueCompact: true },
  ];
  /* XOF et XAF partagent le symbole FCFA (point 4) mais restent deux codes
     ISO distincts et jamais interchangeables — vérifié par validerConfig(). */

  function devise(code) {
    return CURRENCY_LIST.find(d => d.code === code) || CURRENCY_LIST[0];
  }

  /* Formatage d'un montant DÉJÀ dans sa devise cible (pas de conversion ici).
     Arrondi au nombre de décimales propre à la devise (point 11) — jamais de
     décimales flottantes résiduelles (ex. jamais "29 474 999,9999997 FCFA"). */
  function format(montant, code, opts) {
    opts = opts || {};
    if (montant === null || montant === undefined || montant === '') return '';
    const n = Number(montant);
    if (isNaN(n)) return '';
    const d = devise(code || 'EUR');
    const decimales = opts.decimales !== undefined ? opts.decimales : d.decimales;
    const nombre = n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: decimales });
    return `${nombre} ${d.symbole}`;
  }

  /* Version compacte pour graphiques (point 16 : "120 k€", "78,6 M FCFA"). */
  function formatCompact(montant, code) {
    if (montant === null || montant === undefined || montant === '') return '';
    const n = Number(montant);
    if (isNaN(n)) return '';
    const d = devise(code || 'EUR');
    const abs = Math.abs(n);
    let val = n, suffixe = '';
    if (abs >= 1000000) { val = n / 1000000; suffixe = 'M'; }
    else if (abs >= 1000) { val = n / 1000; suffixe = 'k'; }
    const nombre = val.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    if (!suffixe) return `${nombre} ${d.symbole}`;
    // point 16 du cahier des charges : "120 k€" (espace avant k€, k collé au symbole) / "78,6 M FCFA"
    // (espaces partout, FCFA se lit comme un mot) — le glue ne joue que entre le multiple et le symbole.
    return d.glueCompact ? `${nombre} ${suffixe}${d.symbole}` : `${nombre} ${suffixe} ${d.symbole}`;
  }

  /* Conversion pure : montant exprimé dans la devise de référence → devise
     secondaire, via le taux FIGÉ enregistré dans la config du plan (point 7).
     Ne recalcule jamais en sens inverse, ne stocke jamais le résultat. */
  function convertir(montantReference, taux) {
    if (montantReference === null || montantReference === undefined || montantReference === '') return null;
    const n = Number(montantReference);
    const t = Number(taux);
    if (isNaN(n) || !taux || isNaN(t) || t <= 0) return null;
    return n * t;
  }

  /* config attendue : { reference: 'EUR', secondaires: [{code:'XOF', taux:655, type:'manuel', date, source}, ...] } */
  function configParDefaut() { return { reference: 'EUR', secondaires: [] }; }

  function normaliserConfig(config) {
    if (!config || typeof config !== 'object' || !config.reference) return configParDefaut();
    return { reference: config.reference, secondaires: Array.isArray(config.secondaires) ? config.secondaires : [] };
  }

  /* Texte simple "45 000 € — 29 475 000 FCFA" (utilisé pour CSV, alt text, etc.) */
  function afficherMontant(montantReference, config, opts) {
    opts = opts || {};
    if (montantReference === null || montantReference === undefined || montantReference === '') return '';
    const c = normaliserConfig(config);
    const parts = [format(montantReference, c.reference, opts)];
    c.secondaires.forEach(sec => {
      const conv = convertir(montantReference, sec.taux);
      if (conv !== null) parts.push(format(conv, sec.code, opts));
    });
    return parts.filter(Boolean).join(opts.separateur || ' — ');
  }

  /* Rendu HTML : devise de référence visuellement dominante (point 13),
     secondaires en retrait — deux classes CSS à styler par la page hôte
     (.cm-principal / .cm-secondaire), pas de style imposé ici. */
  function afficherMontantHTML(montantReference, config, opts) {
    opts = opts || {};
    if (montantReference === null || montantReference === undefined || montantReference === '') return '';
    const c = normaliserConfig(config);
    const principal = format(montantReference, c.reference, opts);
    const secs = c.secondaires.map(sec => {
      const conv = convertir(montantReference, sec.taux);
      return conv !== null ? format(conv, sec.code, opts) : null;
    }).filter(Boolean);
    if (!secs.length) return `<span class="cm-principal">${principal}</span>`;
    return `<span class="cm-principal">${principal}</span>` + secs.map(s => `<span class="cm-secondaire">${s}</span>`).join('');
  }

  /* Validation (point 12) : devise de référence obligatoire, pas de doublon
     (référence == secondaire, ou deux secondaires identiques), max 2
     secondaires, taux strictement positifs. Retourne un tableau de messages
     d'erreur (vide = configuration valide). */
  function validerConfig(config) {
    const erreurs = [];
    if (!config || !config.reference) { erreurs.push('Monnaie de référence obligatoire.'); return erreurs; }
    if (!devise(config.reference)) erreurs.push(`Devise de référence inconnue : ${config.reference}.`);
    const secondaires = Array.isArray(config.secondaires) ? config.secondaires : [];
    if (secondaires.length > 2) erreurs.push('Maximum 2 monnaies secondaires.');
    const codes = [config.reference, ...secondaires.map(s => s.code)];
    const vus = new Set();
    for (const c of codes) {
      if (vus.has(c)) { erreurs.push('Cette devise est déjà utilisée dans ce Business Plan.'); break; }
      vus.add(c);
    }
    secondaires.forEach(s => {
      if (!s.code || !devise(s.code)) erreurs.push(`Devise secondaire invalide : ${s.code || '—'}.`);
      if (!s.taux || isNaN(Number(s.taux)) || Number(s.taux) <= 0) erreurs.push(`Taux invalide pour ${s.code || 'une devise secondaire'}.`);
    });
    return erreurs;
  }

  window.CurrencyManager = {
    LISTE: CURRENCY_LIST,
    devise,
    format,
    formatCompact,
    convertir,
    configParDefaut,
    normaliserConfig,
    afficherMontant,
    afficherMontantHTML,
    validerConfig,
  };
})();
