/* ═══════════════════════════════════════════════════════════════════════════
   CARTE DU MONDE ANIMÉE — moteur partagé (2026-10-09)
   Copie fidèle de la section « 1. Carte monde animée » de index.html (199 capitales, contours réels des
   continents via world-atlas, arcs à comètes aller/retour, villes qui pulsent), rendue paramétrable pour
   la vitrine : window.carteMondeAnimee('id-du-canvas', { couleurs:{…}, largeurAuto:true, centreLon:10 }).
   Nécessite d3 et topojson-client (chargés en différé par la page ; le tracé des continents les attend).
   À terme, index.html pourra charger ce fichier au lieu de sa copie en ligne.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  function demarrer(canvasId, opts) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    /* Projection équirectangulaire sur viewport [-95°..60°lon, 72°..-42°lat].
       W/H = taille CSS réelle du canvas, recalculée à chaque redimensionnement (voir resize()
       plus bas). Avant ce correctif, la projection utilisait la résolution interne fixe du
       canvas (640×400, cf. attributs HTML) alors que le CSS l'affiche en 100%/100% d'une
       bannière bien plus large : le navigateur ré-étirait ensuite l'image déjà dessinée,
       déformant la carte et décalant les villes (ex. Kinshasa) visuellement vers l'est par
       rapport à leurs coordonnées réelles. Dessiner directement à la taille CSS réelle
       supprime cette double déformation. */
    let W = canvas.clientWidth || 640, H = canvas.clientHeight || 400;
    const VP = Object.assign({ lonMin: -95, lonMax: 60, latMax: 72, latMin: -42 }, opts.viewport || {});
    const COUL = Object.assign({ origine: '#F59E0B', residence: '#4A90D9', fondA: '#060e1a', fondB: '#0c2444', grille: 'rgba(74,144,217,0.05)', terreRemplissage: 'rgba(96,160,230,0.26)', terreContour: 'rgba(170,210,255,0.62)', etiquette: 'rgba(255,255,255,0.7)', arcs: ['#4A90D9', '#7B61FF', '#4ACFD9', '#F59E0B'] }, opts.couleurs || {});
    /* Cadrage : si opts.largeurAuto, la plage de longitudes suit le format du canvas (carte non déformée). */
    function cadrer() {
      if (!opts.largeurAuto || !W || !H) return;
      const span = Math.min(355, (VP.latMax - VP.latMin) * W / H);
      const c = opts.centreLon != null ? opts.centreLon : 10;
      VP.lonMin = c - span / 2; VP.lonMax = c + span / 2;
    }
    function proj(lat, lon) {
      const x = ((lon - VP.lonMin) / (VP.lonMax - VP.lonMin)) * W;
      const y = ((VP.latMax - lat) / (VP.latMax - VP.latMin)) * H;
      return [x, y];
    }

    /* Toutes les capitales du monde (199) — demandé le 2026-08-19 : la carte précédente ne
       montrait qu'une vingtaine de villes choisies à la main. 'orig' = pays d'origine de la
       diaspora (Afrique, point orange, légende "Pays d'origine") ; 'dest' = reste du monde
       (point bleu, légende "Pays de résidence") — mêmes couleurs qu'avant, seule la liste
       s'est élargie. 'major' = les quelques villes qui gardent une étiquette de texte
       (sinon 199 étiquettes rendraient la carte illisible). */
    const CITIES = [
      /* Pays d'origine de la diaspora (Afrique) */
      { lat:36.75, lon:3.06, name:'Alger', type:'orig', r:3 },
      { lat:-8.84, lon:13.23, name:'Luanda', type:'orig', r:3 },
      { lat:6.50, lon:2.60, name:'Porto-Novo', type:'orig', r:3 },
      { lat:-24.63, lon:25.90, name:'Gaborone', type:'orig', r:3 },
      { lat:12.37, lon:-1.53, name:'Ouagadougou', type:'orig', r:3 },
      { lat:-3.43, lon:29.93, name:'Gitega', type:'orig', r:3 },
      { lat:14.93, lon:-23.51, name:'Praia', type:'orig', r:3 },
      { lat:3.87, lon:11.52, name:'Yaoundé', type:'orig', r:8, major:true },
      { lat:4.37, lon:18.58, name:'Bangui', type:'orig', r:3 },
      { lat:12.11, lon:15.03, name:'N\'Djamena', type:'orig', r:3 },
      { lat:-11.70, lon:43.26, name:'Moroni', type:'orig', r:3 },
      { lat:-4.26, lon:15.28, name:'Brazzaville', type:'orig', r:3 },
      { lat:-4.32, lon:15.31, name:'Kinshasa', type:'orig', r:8, major:true },
      { lat:5.30, lon:-4.00, name:'Abidjan', type:'orig', r:8, major:true },
      { lat:11.59, lon:43.15, name:'Djibouti', type:'orig', r:3 },
      { lat:30.04, lon:31.24, name:'Le Caire', type:'orig', r:8, major:true },
      { lat:3.75, lon:8.78, name:'Malabo', type:'orig', r:3 },
      { lat:15.34, lon:38.93, name:'Asmara', type:'orig', r:3 },
      { lat:-26.32, lon:31.13, name:'Mbabane', type:'orig', r:3 },
      { lat:9.03, lon:38.74, name:'Addis-Abeba', type:'orig', r:3 },
      { lat:0.42, lon:9.45, name:'Libreville', type:'orig', r:3 },
      { lat:13.45, lon:-16.58, name:'Banjul', type:'orig', r:3 },
      { lat:5.60, lon:-0.19, name:'Accra', type:'orig', r:3 },
      { lat:9.51, lon:-13.71, name:'Conakry', type:'orig', r:8, major:true },
      { lat:11.86, lon:-15.60, name:'Bissau', type:'orig', r:3 },
      { lat:-1.29, lon:36.82, name:'Nairobi', type:'orig', r:8, major:true },
      { lat:-29.32, lon:27.48, name:'Maseru', type:'orig', r:3 },
      { lat:6.30, lon:-10.80, name:'Monrovia', type:'orig', r:3 },
      { lat:32.89, lon:13.19, name:'Tripoli', type:'orig', r:3 },
      { lat:-18.88, lon:47.51, name:'Antananarivo', type:'orig', r:3 },
      { lat:-13.98, lon:33.79, name:'Lilongwe', type:'orig', r:3 },
      { lat:12.65, lon:-8.00, name:'Bamako', type:'orig', r:8, major:true },
      { lat:18.09, lon:-15.98, name:'Nouakchott', type:'orig', r:3 },
      { lat:-20.16, lon:57.50, name:'Port-Louis', type:'orig', r:3 },
      { lat:34.02, lon:-6.83, name:'Rabat', type:'orig', r:8, major:true },
      { lat:-25.97, lon:32.57, name:'Maputo', type:'orig', r:3 },
      { lat:-22.57, lon:17.08, name:'Windhoek', type:'orig', r:3 },
      { lat:13.51, lon:2.11, name:'Niamey', type:'orig', r:3 },
      { lat:9.08, lon:7.40, name:'Abuja', type:'orig', r:8, major:true },
      { lat:-1.94, lon:30.06, name:'Kigali', type:'orig', r:3 },
      { lat:0.34, lon:6.73, name:'São Tomé', type:'orig', r:3 },
      { lat:14.72, lon:-17.47, name:'Dakar', type:'orig', r:8, major:true },
      { lat:-4.62, lon:55.45, name:'Victoria', type:'orig', r:3 },
      { lat:8.48, lon:-13.23, name:'Freetown', type:'orig', r:3 },
      { lat:2.05, lon:45.32, name:'Mogadiscio', type:'orig', r:3 },
      { lat:-25.75, lon:28.19, name:'Pretoria', type:'orig', r:3 },
      { lat:4.85, lon:31.58, name:'Djouba', type:'orig', r:3 },
      { lat:15.50, lon:32.56, name:'Khartoum', type:'orig', r:3 },
      { lat:-6.16, lon:35.75, name:'Dodoma', type:'orig', r:3 },
      { lat:6.13, lon:1.22, name:'Lomé', type:'orig', r:8, major:true },
      { lat:36.81, lon:10.18, name:'Tunis', type:'orig', r:8, major:true },
      { lat:0.31, lon:32.58, name:'Kampala', type:'orig', r:3 },
      { lat:-15.39, lon:28.32, name:'Lusaka', type:'orig', r:3 },
      { lat:-17.83, lon:31.05, name:'Harare', type:'orig', r:3 },
      /* Reste du monde (Europe, Amériques, Asie, Océanie) */
      { lat:41.33, lon:19.82, name:'Tirana', type:'dest', r:3 },
      { lat:42.51, lon:1.52, name:'Andorre-la-Vieille', type:'dest', r:3 },
      { lat:48.21, lon:16.37, name:'Vienne', type:'dest', r:3 },
      { lat:53.90, lon:27.57, name:'Minsk', type:'dest', r:3 },
      { lat:50.85, lon:4.35, name:'Bruxelles', type:'dest', r:8, major:true },
      { lat:43.86, lon:18.41, name:'Sarajevo', type:'dest', r:3 },
      { lat:42.70, lon:23.32, name:'Sofia', type:'dest', r:3 },
      { lat:45.81, lon:15.98, name:'Zagreb', type:'dest', r:3 },
      { lat:35.19, lon:33.38, name:'Nicosie', type:'dest', r:3 },
      { lat:50.08, lon:14.44, name:'Prague', type:'dest', r:3 },
      { lat:55.68, lon:12.57, name:'Copenhague', type:'dest', r:3 },
      { lat:59.44, lon:24.75, name:'Tallinn', type:'dest', r:3 },
      { lat:60.17, lon:24.94, name:'Helsinki', type:'dest', r:3 },
      { lat:48.86, lon:2.35, name:'Paris', type:'dest', r:8, major:true },
      { lat:52.52, lon:13.40, name:'Berlin', type:'dest', r:8, major:true },
      { lat:37.98, lon:23.73, name:'Athènes', type:'dest', r:3 },
      { lat:47.50, lon:19.04, name:'Budapest', type:'dest', r:3 },
      { lat:64.15, lon:-21.94, name:'Reykjavik', type:'dest', r:3 },
      { lat:53.35, lon:-6.26, name:'Dublin', type:'dest', r:3 },
      { lat:41.90, lon:12.50, name:'Rome', type:'dest', r:8, major:true },
      { lat:42.67, lon:21.17, name:'Pristina', type:'dest', r:3 },
      { lat:56.95, lon:24.11, name:'Riga', type:'dest', r:3 },
      { lat:47.14, lon:9.52, name:'Vaduz', type:'dest', r:3 },
      { lat:54.69, lon:25.28, name:'Vilnius', type:'dest', r:3 },
      { lat:49.61, lon:6.13, name:'Luxembourg', type:'dest', r:3 },
      { lat:35.90, lon:14.51, name:'La Valette', type:'dest', r:3 },
      { lat:47.01, lon:28.86, name:'Chișinău', type:'dest', r:3 },
      { lat:43.73, lon:7.42, name:'Monaco', type:'dest', r:3 },
      { lat:42.44, lon:19.26, name:'Podgorica', type:'dest', r:3 },
      { lat:52.37, lon:4.90, name:'Amsterdam', type:'dest', r:3 },
      { lat:42.00, lon:21.43, name:'Skopje', type:'dest', r:3 },
      { lat:59.91, lon:10.75, name:'Oslo', type:'dest', r:3 },
      { lat:52.23, lon:21.01, name:'Varsovie', type:'dest', r:3 },
      { lat:38.72, lon:-9.14, name:'Lisbonne', type:'dest', r:3 },
      { lat:44.43, lon:26.10, name:'Bucarest', type:'dest', r:3 },
      { lat:55.76, lon:37.62, name:'Moscou', type:'dest', r:3 },
      { lat:43.94, lon:12.45, name:'Saint-Marin', type:'dest', r:3 },
      { lat:44.79, lon:20.45, name:'Belgrade', type:'dest', r:3 },
      { lat:48.15, lon:17.11, name:'Bratislava', type:'dest', r:3 },
      { lat:46.06, lon:14.51, name:'Ljubljana', type:'dest', r:3 },
      { lat:40.42, lon:-3.70, name:'Madrid', type:'dest', r:8, major:true },
      { lat:59.33, lon:18.07, name:'Stockholm', type:'dest', r:3 },
      { lat:46.95, lon:7.45, name:'Berne', type:'dest', r:3 },
      { lat:50.45, lon:30.52, name:'Kiev', type:'dest', r:3 },
      { lat:51.51, lon:-0.13, name:'Londres', type:'dest', r:8, major:true },
      { lat:17.12, lon:-61.85, name:'Saint-Jean\'s', type:'dest', r:3 },
      { lat:-34.60, lon:-58.38, name:'Buenos Aires', type:'dest', r:3 },
      { lat:25.05, lon:-77.36, name:'Nassau', type:'dest', r:3 },
      { lat:13.10, lon:-59.62, name:'Bridgetown', type:'dest', r:3 },
      { lat:17.25, lon:-88.77, name:'Belmopan', type:'dest', r:3 },
      { lat:-16.50, lon:-68.15, name:'La Paz', type:'dest', r:3 },
      { lat:-15.78, lon:-47.93, name:'Brasilia', type:'dest', r:3 },
      { lat:45.42, lon:-75.70, name:'Ottawa', type:'dest', r:3 },
      { lat:43.70, lon:-79.40, name:'Toronto', type:'dest', r:8, major:true },
      { lat:45.50, lon:-73.60, name:'Montréal', type:'dest', r:8, major:true },
      { lat:-33.45, lon:-70.67, name:'Santiago', type:'dest', r:3 },
      { lat:4.71, lon:-74.07, name:'Bogota', type:'dest', r:3 },
      { lat:9.93, lon:-84.08, name:'San José', type:'dest', r:3 },
      { lat:23.13, lon:-82.38, name:'La Havane', type:'dest', r:3 },
      { lat:15.30, lon:-61.39, name:'Roseau', type:'dest', r:3 },
      { lat:18.49, lon:-69.89, name:'Saint-Domingue', type:'dest', r:3 },
      { lat:-0.23, lon:-78.52, name:'Quito', type:'dest', r:3 },
      { lat:13.69, lon:-89.22, name:'San Salvador', type:'dest', r:3 },
      { lat:12.06, lon:-61.75, name:'Saint-Georges', type:'dest', r:3 },
      { lat:14.63, lon:-90.51, name:'Guatemala', type:'dest', r:3 },
      { lat:6.80, lon:-58.16, name:'Georgetown', type:'dest', r:3 },
      { lat:18.59, lon:-72.31, name:'Port-au-Prince', type:'dest', r:3 },
      { lat:14.07, lon:-87.19, name:'Tegucigalpa', type:'dest', r:3 },
      { lat:17.97, lon:-76.79, name:'Kingston', type:'dest', r:3 },
      { lat:19.43, lon:-99.13, name:'Mexico', type:'dest', r:3 },
      { lat:12.11, lon:-86.24, name:'Managua', type:'dest', r:3 },
      { lat:8.99, lon:-79.52, name:'Panama', type:'dest', r:3 },
      { lat:-25.30, lon:-57.64, name:'Asuncion', type:'dest', r:3 },
      { lat:-12.05, lon:-77.04, name:'Lima', type:'dest', r:3 },
      { lat:17.30, lon:-62.73, name:'Basseterre', type:'dest', r:3 },
      { lat:14.01, lon:-60.99, name:'Castries', type:'dest', r:3 },
      { lat:13.16, lon:-61.22, name:'Kingstown', type:'dest', r:3 },
      { lat:5.87, lon:-55.17, name:'Paramaribo', type:'dest', r:3 },
      { lat:10.65, lon:-61.52, name:'Port-d-Espagne', type:'dest', r:3 },
      { lat:38.90, lon:-77.04, name:'Washington', type:'dest', r:8, major:true },
      { lat:40.70, lon:-74.00, name:'New York', type:'dest', r:8, major:true },
      { lat:-34.90, lon:-56.16, name:'Montevideo', type:'dest', r:3 },
      { lat:10.49, lon:-66.88, name:'Caracas', type:'dest', r:3 },
      { lat:34.56, lon:69.21, name:'Kaboul', type:'dest', r:3 },
      { lat:40.18, lon:44.51, name:'Erevan', type:'dest', r:3 },
      { lat:40.41, lon:49.87, name:'Bakou', type:'dest', r:3 },
      { lat:26.23, lon:50.59, name:'Manama', type:'dest', r:3 },
      { lat:23.81, lon:90.41, name:'Dacca', type:'dest', r:3 },
      { lat:27.47, lon:89.64, name:'Thimphu', type:'dest', r:3 },
      { lat:4.94, lon:114.94, name:'Bandar Seri Begawan', type:'dest', r:3 },
      { lat:11.56, lon:104.92, name:'Phnom Penh', type:'dest', r:3 },
      { lat:39.90, lon:116.41, name:'Pékin', type:'dest', r:8, major:true },
      { lat:41.72, lon:44.79, name:'Tbilissi', type:'dest', r:3 },
      { lat:28.61, lon:77.21, name:'New Delhi', type:'dest', r:8, major:true },
      { lat:-6.21, lon:106.85, name:'Jakarta', type:'dest', r:3 },
      { lat:35.69, lon:51.39, name:'Téhéran', type:'dest', r:3 },
      { lat:33.31, lon:44.36, name:'Bagdad', type:'dest', r:3 },
      { lat:31.77, lon:35.21, name:'Jérusalem', type:'dest', r:3 },
      { lat:35.68, lon:139.65, name:'Tokyo', type:'dest', r:8, major:true },
      { lat:31.95, lon:35.93, name:'Amman', type:'dest', r:3 },
      { lat:51.17, lon:71.45, name:'Astana', type:'dest', r:3 },
      { lat:29.38, lon:47.99, name:'Koweït', type:'dest', r:3 },
      { lat:42.87, lon:74.59, name:'Bichkek', type:'dest', r:3 },
      { lat:17.97, lon:102.60, name:'Vientiane', type:'dest', r:3 },
      { lat:33.89, lon:35.50, name:'Beyrouth', type:'dest', r:3 },
      { lat:3.14, lon:101.69, name:'Kuala Lumpur', type:'dest', r:3 },
      { lat:4.17, lon:73.51, name:'Malé', type:'dest', r:3 },
      { lat:47.89, lon:106.91, name:'Oulan-Bator', type:'dest', r:3 },
      { lat:19.76, lon:96.08, name:'Naypyidaw', type:'dest', r:3 },
      { lat:27.72, lon:85.32, name:'Katmandou', type:'dest', r:3 },
      { lat:39.02, lon:125.75, name:'Pyongyang', type:'dest', r:3 },
      { lat:23.59, lon:58.41, name:'Mascate', type:'dest', r:3 },
      { lat:33.68, lon:73.05, name:'Islamabad', type:'dest', r:3 },
      { lat:31.90, lon:35.20, name:'Ramallah', type:'dest', r:3 },
      { lat:14.60, lon:120.98, name:'Manille', type:'dest', r:3 },
      { lat:25.29, lon:51.53, name:'Doha', type:'dest', r:3 },
      { lat:24.71, lon:46.68, name:'Riyad', type:'dest', r:3 },
      { lat:1.35, lon:103.82, name:'Singapour', type:'dest', r:3 },
      { lat:37.57, lon:126.98, name:'Séoul', type:'dest', r:3 },
      { lat:6.93, lon:79.85, name:'Colombo', type:'dest', r:3 },
      { lat:33.51, lon:36.28, name:'Damas', type:'dest', r:3 },
      { lat:25.03, lon:121.57, name:'Taipei', type:'dest', r:3 },
      { lat:38.56, lon:68.79, name:'Douchanbé', type:'dest', r:3 },
      { lat:13.76, lon:100.50, name:'Bangkok', type:'dest', r:3 },
      { lat:-8.56, lon:125.57, name:'Dili', type:'dest', r:3 },
      { lat:39.93, lon:32.86, name:'Ankara', type:'dest', r:3 },
      { lat:37.95, lon:58.38, name:'Achgabat', type:'dest', r:3 },
      { lat:24.45, lon:54.38, name:'Abou Dabi', type:'dest', r:8, major:true },
      { lat:41.30, lon:69.24, name:'Tachkent', type:'dest', r:3 },
      { lat:21.03, lon:105.85, name:'Hanoï', type:'dest', r:3 },
      { lat:15.37, lon:44.19, name:'Sana\'a', type:'dest', r:3 },
      { lat:-35.28, lon:149.13, name:'Canberra', type:'dest', r:3 },
      { lat:-18.14, lon:178.44, name:'Suva', type:'dest', r:3 },
      { lat:1.45, lon:173.02, name:'Tarawa', type:'dest', r:3 },
      { lat:7.09, lon:171.38, name:'Majuro', type:'dest', r:3 },
      { lat:6.92, lon:158.16, name:'Palikir', type:'dest', r:3 },
      { lat:-0.55, lon:166.92, name:'Yaren', type:'dest', r:3 },
      { lat:-41.29, lon:174.78, name:'Wellington', type:'dest', r:3 },
      { lat:7.50, lon:134.62, name:'Ngerulmud', type:'dest', r:3 },
      { lat:-9.44, lon:147.18, name:'Port Moresby', type:'dest', r:3 },
      { lat:-13.83, lon:-171.76, name:'Apia', type:'dest', r:3 },
      { lat:-9.43, lon:159.95, name:'Honiara', type:'dest', r:3 },
      { lat:-21.14, lon:-175.20, name:'Nuku\'alofa', type:'dest', r:3 },
      { lat:-8.52, lon:179.20, name:'Funafuti', type:'dest', r:3 },
      { lat:-17.73, lon:168.32, name:'Port-Vila', type:'dest', r:3 },
    ];

    const PALETTE = COUL.arcs;
    /* Connexions générées à chaque chargement de page — mouvement "dans tous les sens" entre
       capitales du monde entier (demandé le 2026-08-19), pas seulement Afrique→Occident comme
       avant : chaque capitale d'origine (diaspora) se relie à 1-2 capitales tirées au hasard
       n'importe où sur la carte, complété par des liaisons entièrement aléatoires entre deux
       capitales quelconques pour que des mouvements partent aussi depuis le reste du monde.
       Couleurs : cycle sur la même palette qu'avant (aucune couleur nouvelle introduite). */
    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    const origIdx = [], allIdx = [];
    CITIES.forEach((c, i) => { allIdx.push(i); if (c.type === 'orig') origIdx.push(i); });
    const CONNS = [];
    origIdx.forEach(oi => {
      const picks = shuffle(allIdx.filter(i => i !== oi)).slice(0, 1 + Math.floor(Math.random() * 2));
      picks.forEach(ti => CONNS.push({ f: oi, t: ti, c: PALETTE[Math.floor(Math.random() * PALETTE.length)] }));
    });
    for (let i = 0; i < 30; i++) {
      const a = allIdx[Math.floor(Math.random() * allIdx.length)];
      const b = allIdx[Math.floor(Math.random() * allIdx.length)];
      if (a !== b) CONNS.push({ f: a, t: b, c: PALETTE[Math.floor(Math.random() * PALETTE.length)] });
    }
    if (CONNS.length > 130) CONNS.length = 130; // garde-fou performance/lisibilité

    const arcProg = CONNS.map((_, i) => ({
      p: i / CONNS.length,
      spd: 0.0015 + (i % 5) * 0.0003,
      trail: [],
      /* Second point animé : même trajet, sens inverse (retour), déphasé pour ne pas se superposer au premier */
      pRev: (i / CONNS.length + 0.5) % 1,
      trailRev: [],
    }));

    /* --- Contours réels des continents (remplace l'ancien nuage de points approximatif) ---
       world-atlas (topojson, CDN jsdelivr déjà autorisé en script-src — connect-src élargi
       pour ce fetch, voir server/security.js) donne les vraies formes des continents. Rendu
       une fois par redimensionnement sur un canvas hors écran (un geoPath complet coûterait
       cher à recalculer 60 fois par seconde), puis simplement recopié (drawImage) dans la
       boucle d'animation. Si le chargement échoue (réseau coupé, CDN indisponible), les
       dots/lignes continuent de s'animer sans contours de continents plutôt que de tout
       casser — dégradation silencieuse assumée pour un élément décoratif de la page d'accueil. */
    let landFeature = null;
    let continentsCanvas = null;
    function renderContinents() {
      if (!landFeature || !window.d3 || !W || !H) return;
      if (!continentsCanvas) continentsCanvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      continentsCanvas.width = Math.round(W * dpr);
      continentsCanvas.height = Math.round(H * dpr);
      const cctx = continentsCanvas.getContext('2d');
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* Cadre large (toute la bande de la vitrine) : un contour qui franchit le méridien ±180° (Tchoukotka, Fidji…)
       tracerait une ligne horizontale d'un bord à l'autre. On coupe le tracé quand la longitude saute de plus de 180°. */
    const transform = d3.geoTransform({
      lineStart() { this._pl = null; this.stream.lineStart(); },
      point(lon, lat) {
        if (this._pl != null && Math.abs(lon - this._pl) > 180) { this.stream.lineEnd(); this.stream.lineStart(); }
        this._pl = lon;
        const [x, y] = proj(lat, lon);
        this.stream.point(x, y);
      },
    });
      const path = d3.geoPath(transform).context(cctx);
      cctx.beginPath();
      path(landFeature);
      /* Contraste relevé (2026-09-21, signalé "les continents ne sont pas distinguables") :
         le remplissage à 0.11 et le contour à 0.30 se fondaient presque dans le dégradé de
         fond (#060e1a → #0c2444), lui aussi dans les bleus sombres — les silhouettes des
         continents disparaissaient derrière la grille et les points/connexions. */
      cctx.fillStyle = COUL.terreRemplissage;
      cctx.fill();
      cctx.strokeStyle = COUL.terreContour;
      cctx.lineWidth = 1.1;
      cctx.stroke();
    }
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')
      .then(r => r.json())
      .then(topo => {
        const attendre = () => { if (window.topojson && window.d3) { landFeature = topojson.feature(topo, topo.objects.land); renderContinents(); } else setTimeout(attendre, 150); };
        attendre();
      })
      .catch(() => { /* dégradation silencieuse, voir commentaire ci-dessus */ });

    /* Redimensionne le buffer du canvas à sa taille CSS réelle (× devicePixelRatio pour rester
       net) et recalcule toutes les positions projetées. Appelé une fois au chargement, puis à
       chaque redimensionnement de fenêtre. */
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      W = canvas.clientWidth || W;
      H = canvas.clientHeight || H;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cadrer();
      CITIES.forEach(c => { c.pos = proj(c.lat, c.lon); });
      renderContinents();
    }
    /* Constaté en production (2026-08-15) : un seul appel initial + ResizeObserver ne suffisaient
       pas — le tout premier appel pouvait capturer une taille transitoire (chargement des
       polices/feuilles de style pas encore terminé) et rien ne la corrigeait ensuite, y compris
       avec l'observer en place. Filet de sécurité à plusieurs niveaux, chacun couvrant une cause
       possible : immédiat, prochaine frame, chargement complet de la page, délai de secours —
       puis l'observer prend le relais pour tout changement réel ultérieur. */
    resize();
    requestAnimationFrame(resize);
    if (document.readyState === 'complete') requestAnimationFrame(resize);
    else window.addEventListener('load', () => requestAnimationFrame(resize), { once: true });
    setTimeout(resize, 500);
    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(canvas);
    } else {
      window.addEventListener('resize', resize);
    }

    function draw(ts) {
      ctx.clearRect(0, 0, W, H);

      /* Fond dégradé */
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, COUL.fondA);
      bg.addColorStop(1, COUL.fondB);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      /* Grille lat/lon */
      ctx.strokeStyle = COUL.grille;
      ctx.lineWidth = 0.5;
      for (let lat = VP.latMin; lat <= VP.latMax; lat += 15) {
        const [, y] = proj(lat, VP.lonMin);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      for (let lon = VP.lonMin; lon <= VP.lonMax; lon += 15) {
        const [x] = proj(0, lon);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }

      /* Continents réels (silhouette pré-rendue, voir renderContinents() ci-dessus) */
      if (continentsCanvas) ctx.drawImage(continentsCanvas, 0, 0, W, H);

      /* Connexions + dot animé */
      CONNS.forEach((conn, i) => {
        const from = CITIES[conn.f].pos;
        const to   = CITIES[conn.t].pos;
        const t    = arcProg[i].p;

        const mx = (from[0] + to[0]) / 2;
        const dy = Math.abs(to[0] - from[0]) * 0.35;
        const my = Math.min(from[1], to[1]) - dy;

        ctx.beginPath();
        ctx.moveTo(from[0], from[1]);
        ctx.quadraticCurveTo(mx, my, to[0], to[1]);
        ctx.strokeStyle = conn.c + '28';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        /* Dot animé avec traînée comète (direction origine→accueil) */
        const bx = (1-t)*(1-t)*from[0] + 2*(1-t)*t*mx + t*t*to[0];
        const by = (1-t)*(1-t)*from[1] + 2*(1-t)*t*my + t*t*to[1];

        /* Traînée : positions précédentes avec opacité décroissante */
        const trail = arcProg[i].trail;
        trail.forEach((pos, ti) => {
          const ratio = (ti + 1) / trail.length;
          const alpha = Math.floor(ratio * 140).toString(16).padStart(2,'0');
          const r = 1.2 + ratio * 1.4;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.fillStyle = conn.c + alpha;
          ctx.fill();
        });

        /* Tête lumineuse */
        ctx.shadowColor = conn.c;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx, by, 2, 0, Math.PI * 2);
        ctx.fillStyle = conn.c;
        ctx.fill();
        ctx.shadowBlur = 0;

        /* Mise à jour traînée */
        const nextP = (arcProg[i].p + arcProg[i].spd) % 1;
        if (nextP < arcProg[i].p) trail.length = 0; /* reset au cycle */
        trail.push({x: bx, y: by});
        if (trail.length > 8) trail.shift();
        arcProg[i].p = nextP;

        /* Second point animé : trajet retour (accueil→origine), même courbe parcourue en sens inverse */
        const tr = 1 - arcProg[i].pRev;
        const rx = (1-tr)*(1-tr)*from[0] + 2*(1-tr)*tr*mx + tr*tr*to[0];
        const ry = (1-tr)*(1-tr)*from[1] + 2*(1-tr)*tr*my + tr*tr*to[1];

        const trailRev = arcProg[i].trailRev;
        trailRev.forEach((pos, ti) => {
          const ratio = (ti + 1) / trailRev.length;
          const alpha = Math.floor(ratio * 140).toString(16).padStart(2,'0');
          const r = 1.2 + ratio * 1.4;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.fillStyle = conn.c + alpha;
          ctx.fill();
        });

        ctx.shadowColor = conn.c;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(rx, ry, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rx, ry, 2, 0, Math.PI * 2);
        ctx.fillStyle = conn.c;
        ctx.fill();
        ctx.shadowBlur = 0;

        const nextPRev = (arcProg[i].pRev + arcProg[i].spd) % 1;
        if (nextPRev < arcProg[i].pRev) trailRev.length = 0;
        trailRev.push({x: rx, y: ry});
        if (trailRev.length > 8) trailRev.shift();
        arcProg[i].pRev = nextPRev;
      });

      /* Villes */
      const now = Date.now();
      CITIES.forEach((city, i) => {
        const [x, y] = city.pos;
        const pulse = 0.65 + 0.35 * Math.sin(now * 0.0018 + i * 0.8);

        const isDest = city.type === 'dest';
        const col = isDest ? COUL.residence : COUL.origine;

        ctx.shadowColor = col;
        ctx.shadowBlur = city.major ? 18 : 8;
        ctx.beginPath();
        ctx.arc(x, y, city.r * 0.5 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = col + (isDest ? 'cc' : 'dd');
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(x, y, city.r * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = col + '55';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (city.major) {
          ctx.font = '10px Inter, system-ui, sans-serif';
          ctx.fillStyle = COUL.etiquette;
          ctx.fillText(city.name, x + city.r + 4, y + 4);
        }
      });

      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }
  window.carteMondeAnimee = function (canvasId, opts) { demarrer(canvasId, opts || {}); };
})();
