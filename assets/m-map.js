/* ============================================================
   Diaspo'Actif — carte animée des déplacements des diasporas (version téléphone)
   Reprise à l'identique de l'accueil du site (index.html, « Carte monde animée ») : mêmes capitales, mêmes couleurs,
   même fond dégradé, mêmes liaisons animées et mêmes contours de continents (world-atlas).
   Différences voulues pour le téléphone : moins de liaisons (fluidité, batterie), animation suspendue quand la
   carte n'est pas visible, contours dessinés sans d3 (topojson-client seul, beaucoup plus léger à télécharger).
   ============================================================ */
(function () {
  'use strict';

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

  const PALETTE = ['#4A90D9', '#7B61FF', '#4ACFD9', '#F59E0B'];
  const VP = { lonMin: -95, lonMax: 60, latMax: 72, latMin: -42 };
  const MAX_CONNS = 70;
  let landFeature = null, landLoading = false, landWaiters = [];

  /* Contours réels des continents : chargés une seule fois pour toutes les cartes de la page. */
  function loadLand(cb) {
    if (landFeature) { cb(); return; }
    landWaiters.push(cb);
    if (landLoading) return;
    landLoading = true;
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')
      .then(r => r.json())
      .then(topo => {
        const go = tries => {
          if (window.topojson) { landFeature = window.topojson.feature(topo, topo.objects.land); landWaiters.splice(0).forEach(f => f()); }
          else if (tries < 40) setTimeout(() => go(tries + 1), 150);
        };
        go(0);
      })
      .catch(() => { /* dégradation silencieuse : points et liaisons s'animent sans contours, comme sur le site */ });
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* Monte la carte dans un <canvas> (dimensionné en CSS). Renvoie une fonction stop(). */
  function mount(canvas) {
    if (!canvas || !canvas.getContext) return function () { };
    const ctx = canvas.getContext('2d');
    let W = canvas.clientWidth || 340, H = canvas.clientHeight || 230, stopped = false, continentsCanvas = null;
    const proj = (lat, lon) => [((lon - VP.lonMin) / (VP.lonMax - VP.lonMin)) * W, ((VP.latMax - lat) / (VP.latMax - VP.latMin)) * H];

    /* Liaisons générées à chaque affichage : chaque capitale d'origine se relie à 1-2 capitales n'importe où, plus des liaisons libres. */
    const origIdx = [], allIdx = [];
    CITIES.forEach((c, i) => { allIdx.push(i); if (c.type === 'orig') origIdx.push(i); });
    const CONNS = [];
    origIdx.forEach(oi => {
      shuffle(allIdx.filter(i => i !== oi)).slice(0, 1 + Math.floor(Math.random() * 2)).forEach(ti => CONNS.push({ f: oi, t: ti, c: PALETTE[Math.floor(Math.random() * PALETTE.length)] }));
    });
    for (let i = 0; i < 30; i++) {
      const a = allIdx[Math.floor(Math.random() * allIdx.length)], b = allIdx[Math.floor(Math.random() * allIdx.length)];
      if (a !== b) CONNS.push({ f: a, t: b, c: PALETTE[Math.floor(Math.random() * PALETTE.length)] });
    }
    const conns = shuffle(CONNS).slice(0, MAX_CONNS);
    const arcProg = conns.map((_, i) => ({ p: i / conns.length, spd: 0.0015 + (i % 5) * 0.0003, trail: [], pRev: (i / conns.length + 0.5) % 1, trailRev: [] }));

    function renderContinents() {
      if (!landFeature || !W || !H) return;
      if (!continentsCanvas) continentsCanvas = document.createElement('canvas');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      continentsCanvas.width = Math.round(W * dpr); continentsCanvas.height = Math.round(H * dpr);
      const c = continentsCanvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.beginPath();
      /* topojson.feature() renvoie ici une FeatureCollection : on rassemble les polygones de toutes ses entités. */
      const geoms = landFeature.type === 'FeatureCollection' ? landFeature.features.map(f => f.geometry) : [landFeature.type === 'Feature' ? landFeature.geometry : landFeature];
      const list = geoms.flatMap(g => !g ? [] : g.type === 'MultiPolygon' ? g.coordinates : (g.type === 'Polygon' ? [g.coordinates] : []));
      /* Pas d'Antarctique (hors cadre) ; un saut de plus de 180° de longitude (ligne de changement de date) coupe le tracé au lieu de tirer un trait à travers toute la carte. */
      list.forEach(poly => poly.forEach(ring => {
        if (ring.some(pt => pt[1] < -58)) return;
        let prev = null;
        ring.forEach(pt => { const p = proj(pt[1], pt[0]); if (prev === null || Math.abs(pt[0] - prev) > 180) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]); prev = pt[0]; });
        c.closePath();
      }));
      c.fillStyle = 'rgba(96,160,230,0.26)'; c.fill();
      c.strokeStyle = 'rgba(170,210,255,0.62)'; c.lineWidth = 1.1; c.stroke();
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth || W; H = canvas.clientHeight || H;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      CITIES.forEach(c => { c.pos = proj(c.lat, c.lon); });
      renderContinents();
    }
    resize(); requestAnimationFrame(resize); setTimeout(resize, 500);
    if (window.ResizeObserver) new ResizeObserver(() => { if (canvas.clientWidth) resize(); }).observe(canvas); else window.addEventListener('resize', resize);
    loadLand(renderContinents);

    function draw() {
      if (stopped || !canvas.isConnected) return;
      /* Onglet masqué, carte hors de l'écran du téléphone ou page en arrière-plan : on ne dessine pas (batterie). */
      if (document.hidden || canvas.offsetParent === null) { setTimeout(() => requestAnimationFrame(draw), 400); return; }
      const r = canvas.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) { setTimeout(() => requestAnimationFrame(draw), 250); return; }

      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#060e1a'); bg.addColorStop(1, '#0c2444');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(74,144,217,0.05)'; ctx.lineWidth = 0.5;
      for (let lat = VP.latMin; lat <= VP.latMax; lat += 15) { const y = proj(lat, VP.lonMin)[1]; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      for (let lon = VP.lonMin; lon <= VP.lonMax; lon += 15) { const x = proj(0, lon)[0]; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }

      if (continentsCanvas) ctx.drawImage(continentsCanvas, 0, 0, W, H);

      conns.forEach((conn, i) => {
        const from = CITIES[conn.f].pos, to = CITIES[conn.t].pos, t = arcProg[i].p;
        const mx = (from[0] + to[0]) / 2, dy = Math.abs(to[0] - from[0]) * 0.35, my = Math.min(from[1], to[1]) - dy;
        ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.quadraticCurveTo(mx, my, to[0], to[1]);
        ctx.strokeStyle = conn.c + '28'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([]);

        const bx = (1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * mx + t * t * to[0];
        const by = (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * my + t * t * to[1];
        const trail = arcProg[i].trail;
        trail.forEach((pos, ti) => {
          const ratio = (ti + 1) / trail.length, alpha = Math.floor(ratio * 140).toString(16).padStart(2, '0');
          ctx.beginPath(); ctx.arc(pos.x, pos.y, 1.2 + ratio * 1.4, 0, Math.PI * 2); ctx.fillStyle = conn.c + alpha; ctx.fill();
        });
        ctx.shadowColor = conn.c; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI * 2); ctx.fillStyle = conn.c; ctx.fill();
        ctx.shadowBlur = 0;
        const nextP = (arcProg[i].p + arcProg[i].spd) % 1;
        if (nextP < arcProg[i].p) trail.length = 0;
        trail.push({ x: bx, y: by }); if (trail.length > 8) trail.shift();
        arcProg[i].p = nextP;

        /* point retour : même courbe parcourue en sens inverse */
        const tr = 1 - arcProg[i].pRev;
        const rx = (1 - tr) * (1 - tr) * from[0] + 2 * (1 - tr) * tr * mx + tr * tr * to[0];
        const ry = (1 - tr) * (1 - tr) * from[1] + 2 * (1 - tr) * tr * my + tr * tr * to[1];
        const trailRev = arcProg[i].trailRev;
        trailRev.forEach((pos, ti) => {
          const ratio = (ti + 1) / trailRev.length, alpha = Math.floor(ratio * 140).toString(16).padStart(2, '0');
          ctx.beginPath(); ctx.arc(pos.x, pos.y, 1.2 + ratio * 1.4, 0, Math.PI * 2); ctx.fillStyle = conn.c + alpha; ctx.fill();
        });
        ctx.shadowColor = conn.c; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(rx, ry, 3, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.beginPath(); ctx.arc(rx, ry, 2, 0, Math.PI * 2); ctx.fillStyle = conn.c; ctx.fill();
        ctx.shadowBlur = 0;
        const nextPRev = (arcProg[i].pRev + arcProg[i].spd) % 1;
        if (nextPRev < arcProg[i].pRev) trailRev.length = 0;
        trailRev.push({ x: rx, y: ry }); if (trailRev.length > 8) trailRev.shift();
        arcProg[i].pRev = nextPRev;
      });

      const now = Date.now();
      CITIES.forEach((city, i) => {
        const x = city.pos[0], y = city.pos[1], pulse = 0.65 + 0.35 * Math.sin(now * 0.0018 + i * 0.8);
        const isDest = city.type === 'dest', col = isDest ? '#4A90D9' : '#F59E0B';
        ctx.shadowColor = col; ctx.shadowBlur = city.major ? 18 : 8;
        ctx.beginPath(); ctx.arc(x, y, city.r * 0.5 * pulse, 0, Math.PI * 2); ctx.fillStyle = col + (isDest ? 'cc' : 'dd'); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(x, y, city.r * pulse, 0, Math.PI * 2); ctx.strokeStyle = col + '55'; ctx.lineWidth = 1.5; ctx.stroke();
        if (city.major && W > 300) { ctx.font = '9px Inter, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(city.name, x + city.r + 3, y + 3); }
      });
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    return function stop() { stopped = true; };
  }

  window.MMap = { mount };
})();
