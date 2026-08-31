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

  /* Liste normalisée ISO 4217 -- TOUTES les monnaies couvertes par la source de taux de marché
     (server/index.js, GET /api/devises/taux -- open.er-api.com, 166 devises), pas seulement un
     sous-ensemble africain/occidental (demande explicite du 2026-08-31 : "permet le choix sur
     toutes les monnaies du monde"). Exclus volontairement : XDR (unité de compte du FMI, pas une
     monnaie que quiconque facture) et CLF (unité indexée chilienne, idem) -- ni l'une ni l'autre
     n'est une monnaie réellement utilisable dans un Business Plan.
     glueCompact : accolé au multiple (k€, M$) sans espace pour les symboles courts type signe
     monétaire ; avec espace pour les abréviations à plusieurs lettres (k FCFA) -- lisibilité,
     pas de règle ISO officielle sur ce point (par défaut false si absent).
     populaire : remontées en tête de la liste de sélection (bpDeviseOptions) -- les devises déjà
     couvertes avant cet élargissement, pour ne pas dégrader l'usage courant au milieu de 166
     options. */
  const CURRENCY_LIST = [
    { code: 'EUR', nom: 'Euro',                              symbole: '€',    decimales: 2, glueCompact: true,  populaire: true },
    { code: 'USD', nom: 'Dollar américain',                  symbole: '$',    decimales: 2, glueCompact: true,  populaire: true },
    { code: 'GBP', nom: 'Livre sterling',                    symbole: '£',    decimales: 2, glueCompact: true,  populaire: true },
    { code: 'CHF', nom: 'Franc suisse',                      symbole: 'CHF',  decimales: 2, glueCompact: false, populaire: true },
    { code: 'CAD', nom: 'Dollar canadien',                   symbole: 'CA$',  decimales: 2, glueCompact: true,  populaire: true },
    { code: 'XOF', nom: 'Franc CFA BCEAO',                   symbole: 'FCFA', decimales: 0, glueCompact: false, populaire: true },
    { code: 'XAF', nom: 'Franc CFA BEAC',                    symbole: 'FCFA', decimales: 0, glueCompact: false, populaire: true },
    { code: 'MAD', nom: 'Dirham marocain',                   symbole: 'DH',   decimales: 2, glueCompact: false, populaire: true },
    { code: 'DZD', nom: 'Dinar algérien',                    symbole: 'DA',   decimales: 2, glueCompact: false, populaire: true },
    { code: 'TND', nom: 'Dinar tunisien',                    symbole: 'DT',   decimales: 3, glueCompact: false, populaire: true },
    { code: 'CDF', nom: 'Franc congolais',                   symbole: 'FC',   decimales: 2, glueCompact: false, populaire: true },
    { code: 'GHS', nom: 'Cedi ghanéen',                      symbole: 'GH₵',  decimales: 2, glueCompact: true,  populaire: true },
    { code: 'NGN', nom: 'Naira nigérian',                    symbole: '₦',    decimales: 2, glueCompact: true,  populaire: true },
    { code: 'CNY', nom: 'Yuan chinois',                      symbole: '¥',    decimales: 2, glueCompact: true,  populaire: true },
    { code: 'AED', nom: 'Dirham des Émirats arabes unis',    symbole: 'AED',  decimales: 2 },
    { code: 'AFN', nom: 'Afghani afghan',                    symbole: '؋',    decimales: 2 },
    { code: 'ALL', nom: 'Lek albanais',                      symbole: 'L',    decimales: 2 },
    { code: 'AMD', nom: 'Dram arménien',                     symbole: '֏',    decimales: 2 },
    { code: 'ANG', nom: 'Florin antillais',                  symbole: 'ƒ',    decimales: 2 },
    { code: 'AOA', nom: 'Kwanza angolais',                   symbole: 'Kz',   decimales: 2 },
    { code: 'ARS', nom: 'Peso argentin',                     symbole: '$',    decimales: 2 },
    { code: 'AUD', nom: 'Dollar australien',                 symbole: 'A$',   decimales: 2, glueCompact: true },
    { code: 'AWG', nom: 'Florin arubais',                    symbole: 'ƒ',    decimales: 2 },
    { code: 'AZN', nom: 'Manat azerbaïdjanais',               symbole: '₼',    decimales: 2 },
    { code: 'BAM', nom: 'Mark convertible de Bosnie-Herzégovine', symbole: 'KM', decimales: 2 },
    { code: 'BBD', nom: 'Dollar barbadien',                  symbole: 'Bds$', decimales: 2 },
    { code: 'BDT', nom: 'Taka bangladais',                   symbole: '৳',    decimales: 2 },
    { code: 'BGN', nom: 'Lev bulgare',                       symbole: 'лв',   decimales: 2 },
    { code: 'BHD', nom: 'Dinar bahreïni',                    symbole: 'BD',   decimales: 3 },
    { code: 'BIF', nom: 'Franc burundais',                   symbole: 'FBu',  decimales: 0 },
    { code: 'BMD', nom: 'Dollar bermudien',                  symbole: 'BD$',  decimales: 2 },
    { code: 'BND', nom: 'Dollar de Brunei',                  symbole: 'B$',   decimales: 2 },
    { code: 'BOB', nom: 'Boliviano bolivien',                symbole: 'Bs',   decimales: 2 },
    { code: 'BRL', nom: 'Real brésilien',                    symbole: 'R$',   decimales: 2 },
    { code: 'BSD', nom: 'Dollar bahaméen',                   symbole: 'B$',   decimales: 2 },
    { code: 'BTN', nom: 'Ngultrum bhoutanais',                symbole: 'Nu.',  decimales: 2 },
    { code: 'BWP', nom: 'Pula botswanais',                   symbole: 'P',    decimales: 2 },
    { code: 'BYN', nom: 'Rouble biélorusse',                  symbole: 'Br',   decimales: 2 },
    { code: 'BZD', nom: 'Dollar bélizien',                    symbole: 'BZ$',  decimales: 2 },
    { code: 'CLP', nom: 'Peso chilien',                      symbole: '$',    decimales: 0 },
    { code: 'CNH', nom: 'Yuan chinois (offshore)',           symbole: '¥',    decimales: 2 },
    { code: 'COP', nom: 'Peso colombien',                    symbole: '$',    decimales: 2 },
    { code: 'CRC', nom: 'Colón costaricien',                 symbole: '₡',    decimales: 2 },
    { code: 'CUP', nom: 'Peso cubain',                       symbole: '$',    decimales: 2 },
    { code: 'CVE', nom: 'Escudo capverdien',                 symbole: '$',    decimales: 2 },
    { code: 'CZK', nom: 'Couronne tchèque',                  symbole: 'Kč',   decimales: 2 },
    { code: 'DJF', nom: 'Franc djiboutien',                  symbole: 'Fdj',  decimales: 0 },
    { code: 'DKK', nom: 'Couronne danoise',                  symbole: 'kr',   decimales: 2 },
    { code: 'DOP', nom: 'Peso dominicain',                   symbole: 'RD$',  decimales: 2 },
    { code: 'EGP', nom: 'Livre égyptienne',                  symbole: 'E£',   decimales: 2 },
    { code: 'ERN', nom: 'Nakfa érythréen',                    symbole: 'Nfk',  decimales: 2 },
    { code: 'ETB', nom: 'Birr éthiopien',                     symbole: 'Br',   decimales: 2 },
    { code: 'FJD', nom: 'Dollar fidjien',                    symbole: 'FJ$',  decimales: 2 },
    { code: 'FKP', nom: 'Livre des îles Falkland',           symbole: '£',    decimales: 2 },
    { code: 'FOK', nom: 'Couronne féroïenne',                 symbole: 'kr',   decimales: 2 },
    { code: 'GEL', nom: 'Lari géorgien',                     symbole: '₾',    decimales: 2 },
    { code: 'GGP', nom: 'Livre de Guernesey',                symbole: '£',    decimales: 2 },
    { code: 'GIP', nom: 'Livre de Gibraltar',                symbole: '£',    decimales: 2 },
    { code: 'GMD', nom: 'Dalasi gambien',                    symbole: 'D',    decimales: 2 },
    { code: 'GNF', nom: 'Franc guinéen',                     symbole: 'FG',   decimales: 0 },
    { code: 'GTQ', nom: 'Quetzal guatémaltèque',              symbole: 'Q',    decimales: 2 },
    { code: 'GYD', nom: 'Dollar guyanien',                   symbole: 'G$',   decimales: 2 },
    { code: 'HKD', nom: 'Dollar de Hong Kong',                symbole: 'HK$',  decimales: 2 },
    { code: 'HNL', nom: 'Lempira hondurien',                  symbole: 'L',    decimales: 2 },
    { code: 'HRK', nom: 'Kuna croate',                       symbole: 'kn',   decimales: 2 },
    { code: 'HTG', nom: 'Gourde haïtienne',                   symbole: 'G',    decimales: 2 },
    { code: 'HUF', nom: 'Forint hongrois',                   symbole: 'Ft',   decimales: 2 },
    { code: 'IDR', nom: 'Roupie indonésienne',                symbole: 'Rp',   decimales: 2 },
    { code: 'ILS', nom: 'Shekel israélien',                  symbole: '₪',    decimales: 2 },
    { code: 'IMP', nom: "Livre de l'île de Man",             symbole: '£',    decimales: 2 },
    { code: 'INR', nom: 'Roupie indienne',                   symbole: '₹',    decimales: 2, glueCompact: true },
    { code: 'IQD', nom: 'Dinar irakien',                     symbole: 'ID',   decimales: 3 },
    { code: 'IRR', nom: 'Rial iranien',                      symbole: '﷼',    decimales: 2 },
    { code: 'ISK', nom: 'Couronne islandaise',                symbole: 'kr',   decimales: 0 },
    { code: 'JEP', nom: 'Livre de Jersey',                   symbole: '£',    decimales: 2 },
    { code: 'JMD', nom: 'Dollar jamaïcain',                   symbole: 'J$',   decimales: 2 },
    { code: 'JOD', nom: 'Dinar jordanien',                   symbole: 'JD',   decimales: 3 },
    { code: 'JPY', nom: 'Yen japonais',                      symbole: '¥',    decimales: 0, glueCompact: true },
    { code: 'KES', nom: 'Shilling kényan',                    symbole: 'KSh',  decimales: 2 },
    { code: 'KGS', nom: 'Som kirghize',                      symbole: 'som',  decimales: 2 },
    { code: 'KHR', nom: 'Riel cambodgien',                   symbole: '៛',    decimales: 2 },
    { code: 'KID', nom: 'Dollar de Kiribati',                symbole: '$',    decimales: 2 },
    { code: 'KMF', nom: 'Franc comorien',                    symbole: 'CF',   decimales: 0 },
    { code: 'KRW', nom: 'Won sud-coréen',                    symbole: '₩',    decimales: 0, glueCompact: true },
    { code: 'KWD', nom: 'Dinar koweïtien',                    symbole: 'KD',   decimales: 3 },
    { code: 'KYD', nom: 'Dollar des îles Caïmans',            symbole: 'CI$',  decimales: 2 },
    { code: 'KZT', nom: 'Tenge kazakh',                      symbole: '₸',    decimales: 2 },
    { code: 'LAK', nom: 'Kip laotien',                       symbole: '₭',    decimales: 2 },
    { code: 'LBP', nom: 'Livre libanaise',                   symbole: 'L£',   decimales: 2 },
    { code: 'LKR', nom: 'Roupie srilankaise',                 symbole: '₨',    decimales: 2 },
    { code: 'LRD', nom: 'Dollar libérien',                    symbole: 'L$',   decimales: 2 },
    { code: 'LSL', nom: 'Loti lesothan',                     symbole: 'L',    decimales: 2 },
    { code: 'LYD', nom: 'Dinar libyen',                      symbole: 'LD',   decimales: 3 },
    { code: 'MDL', nom: 'Leu moldave',                       symbole: 'L',    decimales: 2 },
    { code: 'MGA', nom: 'Ariary malgache',                   symbole: 'Ar',   decimales: 2 },
    { code: 'MKD', nom: 'Denar macédonien',                   symbole: 'ден',  decimales: 2 },
    { code: 'MMK', nom: 'Kyat birman',                       symbole: 'K',    decimales: 2 },
    { code: 'MNT', nom: 'Tugrik mongol',                     symbole: '₮',    decimales: 2 },
    { code: 'MOP', nom: 'Pataca macanaise',                   symbole: 'MOP$', decimales: 2 },
    { code: 'MRU', nom: 'Ouguiya mauritanien',                symbole: 'UM',   decimales: 2 },
    { code: 'MUR', nom: 'Roupie mauricienne',                 symbole: '₨',    decimales: 2 },
    { code: 'MVR', nom: 'Rufiyaa maldivienne',                symbole: 'Rf',   decimales: 2 },
    { code: 'MWK', nom: 'Kwacha malawite',                    symbole: 'MK',   decimales: 2 },
    { code: 'MXN', nom: 'Peso mexicain',                     symbole: '$',    decimales: 2 },
    { code: 'MYR', nom: 'Ringgit malaisien',                  symbole: 'RM',   decimales: 2 },
    { code: 'MZN', nom: 'Metical mozambicain',                symbole: 'MT',   decimales: 2 },
    { code: 'NAD', nom: 'Dollar namibien',                    symbole: 'N$',   decimales: 2 },
    { code: 'NIO', nom: 'Córdoba nicaraguayen',               symbole: 'C$',   decimales: 2 },
    { code: 'NOK', nom: 'Couronne norvégienne',               symbole: 'kr',   decimales: 2 },
    { code: 'NPR', nom: 'Roupie népalaise',                   symbole: '₨',    decimales: 2 },
    { code: 'NZD', nom: 'Dollar néo-zélandais',               symbole: 'NZ$',  decimales: 2, glueCompact: true },
    { code: 'OMR', nom: 'Rial omanais',                      symbole: 'OMR',  decimales: 3 },
    { code: 'PAB', nom: 'Balboa panaméen',                    symbole: 'B/.',  decimales: 2 },
    { code: 'PEN', nom: 'Sol péruvien',                      symbole: 'S/',   decimales: 2 },
    { code: 'PGK', nom: 'Kina papouasien',                    symbole: 'K',    decimales: 2 },
    { code: 'PHP', nom: 'Peso philippin',                    symbole: '₱',    decimales: 2 },
    { code: 'PKR', nom: 'Roupie pakistanaise',                symbole: '₨',    decimales: 2 },
    { code: 'PLN', nom: 'Zloty polonais',                    symbole: 'zł',   decimales: 2 },
    { code: 'PYG', nom: 'Guarani paraguayen',                 symbole: '₲',    decimales: 0 },
    { code: 'QAR', nom: 'Riyal qatari',                      symbole: 'QR',   decimales: 2 },
    { code: 'RON', nom: 'Leu roumain',                       symbole: 'lei',  decimales: 2 },
    { code: 'RSD', nom: 'Dinar serbe',                       symbole: 'дин',  decimales: 2 },
    { code: 'RUB', nom: 'Rouble russe',                      symbole: '₽',    decimales: 2 },
    { code: 'RWF', nom: 'Franc rwandais',                    symbole: 'FRw',  decimales: 0 },
    { code: 'SAR', nom: 'Riyal saoudien',                    symbole: 'SR',   decimales: 2 },
    { code: 'SBD', nom: 'Dollar des îles Salomon',            symbole: 'SI$',  decimales: 2 },
    { code: 'SCR', nom: 'Roupie seychelloise',                symbole: '₨',    decimales: 2 },
    { code: 'SDG', nom: 'Livre soudanaise',                  symbole: 'SDG',  decimales: 2 },
    { code: 'SEK', nom: 'Couronne suédoise',                  symbole: 'kr',   decimales: 2 },
    { code: 'SGD', nom: 'Dollar de Singapour',                symbole: 'S$',   decimales: 2 },
    { code: 'SHP', nom: 'Livre de Sainte-Hélène',             symbole: '£',    decimales: 2 },
    { code: 'SLE', nom: 'Leone sierra-léonais',               symbole: 'Le',   decimales: 2 },
    { code: 'SLL', nom: 'Leone sierra-léonais (ancien)',      symbole: 'Le',   decimales: 2 },
    { code: 'SOS', nom: 'Shilling somalien',                  symbole: 'Sh',   decimales: 2 },
    { code: 'SRD', nom: 'Dollar surinamais',                  symbole: 'Sr$',  decimales: 2 },
    { code: 'SSP', nom: 'Livre sud-soudanaise',               symbole: 'SSP',  decimales: 2 },
    { code: 'STN', nom: 'Dobra santoméen',                    symbole: 'Db',   decimales: 2 },
    { code: 'SYP', nom: 'Livre syrienne',                    symbole: 'LS',   decimales: 2 },
    { code: 'SZL', nom: 'Lilangeni swazi',                    symbole: 'L',    decimales: 2 },
    { code: 'THB', nom: 'Baht thaïlandais',                   symbole: '฿',    decimales: 2 },
    { code: 'TJS', nom: 'Somoni tadjik',                     symbole: 'SM',   decimales: 2 },
    { code: 'TMT', nom: 'Manat turkmène',                    symbole: 'm',    decimales: 2 },
    { code: 'TOP', nom: "Pa'anga tongan",                    symbole: 'T$',   decimales: 2 },
    { code: 'TRY', nom: 'Livre turque',                      symbole: '₺',    decimales: 2 },
    { code: 'TTD', nom: 'Dollar de Trinité-et-Tobago',        symbole: 'TT$',  decimales: 2 },
    { code: 'TVD', nom: 'Dollar tuvaluan',                    symbole: '$',    decimales: 2 },
    { code: 'TWD', nom: 'Dollar taïwanais',                   symbole: 'NT$',  decimales: 2 },
    { code: 'TZS', nom: 'Shilling tanzanien',                 symbole: 'TSh',  decimales: 2 },
    { code: 'UAH', nom: 'Hryvnia ukrainienne',                symbole: '₴',    decimales: 2 },
    { code: 'UGX', nom: 'Shilling ougandais',                 symbole: 'USh',  decimales: 0 },
    { code: 'UYU', nom: 'Peso uruguayen',                    symbole: '$U',   decimales: 2 },
    { code: 'UZS', nom: 'Sum ouzbek',                        symbole: "so'm", decimales: 2 },
    { code: 'VES', nom: 'Bolívar vénézuélien',                symbole: 'Bs',   decimales: 2 },
    { code: 'VND', nom: 'Dong vietnamien',                   symbole: '₫',    decimales: 0 },
    { code: 'VUV', nom: 'Vatu vanuatuan',                    symbole: 'VT',   decimales: 0 },
    { code: 'WST', nom: 'Tala samoan',                       symbole: 'WS$',  decimales: 2 },
    { code: 'XCD', nom: 'Dollar des Caraïbes orientales',     symbole: 'EC$',  decimales: 2 },
    { code: 'XCG', nom: 'Florin caribéen',                   symbole: 'ƒ',    decimales: 2 },
    { code: 'XPF', nom: 'Franc CFP',                         symbole: 'F',    decimales: 0 },
    { code: 'YER', nom: 'Rial yéménite',                     symbole: '﷼',    decimales: 2 },
    { code: 'ZAR', nom: 'Rand sud-africain',                  symbole: 'R',    decimales: 2 },
    { code: 'ZMW', nom: 'Kwacha zambien',                    symbole: 'ZK',   decimales: 2 },
    { code: 'ZWG', nom: 'ZiG zimbabwéen',                     symbole: 'ZiG',  decimales: 2 },
    { code: 'ZWL', nom: 'Dollar zimbabwéen',                  symbole: 'Z$',   decimales: 2 },
  ];
  /* XOF et XAF partagent le symbole FCFA (point 4) mais restent deux codes
     ISO distincts et jamais interchangeables — vérifié par validerConfig().
     Leur taux face à l'EUR est en réalité une parité FIXE garantie par le Trésor français
     (1 EUR = 655,957 XOF/XAF, inchangée depuis 1999) -- gérée à part dans le calcul du taux de
     marché (voir server/index.js, GET /api/devises/taux) plutôt qu'interrogée à une API externe
     qui ne ferait que réafficher cette même constante avec un bruit d'arrondi. */

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
