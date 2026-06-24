/* ===========================================================
   DIASPO'ACTIF — Logique du prototype
   Backend réel branché via l'API /api/* (Node + SQLite).
   Les modules paiement réel restent simulés (aucune transaction réelle).
   =========================================================== */

/* ---------- Client API ---------- */
const API_BASE = "/api";
async function api(method, path, body) {
  const opts = { method, headers: {}, credentials: "same-origin" };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API_BASE + path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) { /* réponse vide */ }
  if (!res.ok) throw Object.assign(new Error(data.error || "Erreur serveur"), { status: res.status, data });
  return data;
}

let CURRENT_USER = null;
async function fetchCurrentUser() {
  try {
    const r = await api("GET", "/auth/me");
    CURRENT_USER = r.user;
    return r.user;
  } catch (e) {
    CURRENT_USER = null;
    return null;
  }
}

const ROLE_DASHBOARD = { utilisateur: "dashboard-utilisateur.html", initiative: "dashboard-initiative.html", administrateur: "dashboard-administrateur.html", collectivite: "dashboard-collectivite.html" };
const ROLE_LABEL_FR = { utilisateur: "Utilisateur", initiative: "Initiative", administrateur: "Administrateur", collectivite: "Collectivité" };

/* ---------- Avatars photo (DiceBear) ---------- */
function photoAvatar(name, size=48, type='user') {
  const seed = encodeURIComponent((name||'?').trim());
  const url = type === 'initiative'
    ? `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=1B3A6B,1565C0,24487E&fontColor=ffffff&fontSize=38`
    : `https://api.dicebear.com/7.x/lorelei/svg?seed=${seed}&backgroundColor=E8F1FC,dde3ec`;
  return `<img src="${url}" alt="${name||'?'}" style="width:${size}px;height:${size}px;border-radius:50%;display:block;object-fit:cover;" loading="lazy">`;
}
function avatarDiv(name, size=48, type='user', extraStyle='') {
  return `<div class="init-logo" style="width:${size}px;height:${size}px;${extraStyle}">${photoAvatar(name, size, type)}</div>`;
}

/* Badge de messages non lus dans la topbar */
function updateTopbarBadge(count) {
  const badge = document.getElementById("msg-topbar-badge");
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? "9+" : count;
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

async function applyAuthState() {
  const el = document.getElementById("auth-area");
  if (!el) return;
  const user = await fetchCurrentUser();
  if (user) {
    el.innerHTML = `
      <a href="messagerie.html" class="user-chip" style="text-decoration:none;position:relative;" title="Messagerie">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span id="msg-topbar-badge" style="display:none;position:absolute;top:-6px;right:-8px;background:var(--orange);color:#fff;border-radius:50%;width:16px;height:16px;font-size:10px;font-weight:700;align-items:center;justify-content:center;"></span>
      </a>
      <a href="${ROLE_DASHBOARD[user.role] || '#'}" class="user-chip" style="text-decoration:none;">
        <div class="avatar">${photoAvatar(user.nom, 30)}</div> ${user.nom}
      </a>
      <span class="role-tag">${ROLE_LABEL_FR[user.role] || user.role}</span>
      <a href="#" id="logout-link" class="btn btn-sm btn-outline">Déconnexion</a>`;
    const logout = document.getElementById("logout-link");
    if (logout) logout.addEventListener("click", async (e) => {
      e.preventDefault();
      try { await api("POST", "/auth/logout"); } catch (err) { /* ignore */ }
      window.location.href = "index.html";
    });
    // Charger le nombre de messages non lus + notifications
    try {
      const [msgs, notifs] = await Promise.all([
        api("GET", "/messages/non-lus").catch(()=>({total:0})),
        api("GET", "/notifications?limit=5").catch(()=>({non_lues:0}))
      ]);
      updateTopbarBadge(msgs.total + (notifs.non_lues||0));
    } catch (e) { /* silencieux */ }
  } else {
    el.innerHTML = `
      <a href="login.html" class="btn btn-sm btn-outline">Se connecter</a>
      <a href="inscription.html" class="btn btn-sm btn-orange">S'inscrire</a>`;
  }
}

/* ---------- Système multilingue (démo front-end) ---------- */
function getLang(){ return localStorage.getItem("da_lang") || "fr"; }
function setLang(lang){
  localStorage.setItem("da_lang", lang);
  applyTranslations();
}
function applyTranslations(){
  const lang = getLang();
  const sel = document.getElementById("lang-select");
  if(sel) sel.value = lang;

  if(typeof NAV_LABELS !== "undefined"){
    const map = { "index.html":"accueil", "annuaire.html":"annuaire", "fil-actualite.html":"fil", "actualites.html":"actualites", "evenements.html":"evenements" };
    document.querySelectorAll(".nav a").forEach(a=>{
      const href = (a.getAttribute("href")||"").split("?")[0];
      const key = map[href];
      if(key && NAV_LABELS[lang] && NAV_LABELS[lang][key]) a.textContent = NAV_LABELS[lang][key];
    });
  }
  if(typeof FOOTER_TEXT !== "undefined"){
    const f = document.getElementById("footer-text");
    if(f && FOOTER_TEXT[lang]) f.textContent = FOOTER_TEXT[lang];
  }
}
function initLangSelector(){
  const sel = document.getElementById("lang-select");
  if(!sel || typeof LANGUES === "undefined") return;
  sel.innerHTML = LANGUES.map(l=>`<option value="${l.code}">${l.label}</option>`).join("");
  sel.value = getLang();
  sel.addEventListener("change", ()=> setLang(sel.value));
}

/* ---------- Badge couleur selon le type d'organisation ---------- */
function badgeClass(type){
  const map = { "Association":"badge-asso","ONG":"badge-ong","Entreprise":"badge-ent","Fondation":"badge-fond","Coopérative":"badge-coop" };
  return map[type] || "badge-asso";
}
function initials(nom){
  return (nom || "?").split(" ").filter(w=>w.length>2).slice(0,2).map(w=>w[0]).join("").toUpperCase() || (nom||"?")[0].toUpperCase();
}

/* ---------- Carte-réseau mondiale (SVG abstrait, sans backend de cartographie) ---------- */
function renderNetwork(containerId, items){
  const el = document.getElementById(containerId);
  if(!el) return;
  const w = 1000, h = 400;
  const pts = items.map(it=>{
    const x = ((it.lon + 20) / 60) * w * 0.9 + w*0.05;
    const y = h - (((it.lat + 15) / 75) * h * 0.85 + h*0.08);
    return {...it, x, y};
  });
  let links = "";
  for(let i=0;i<pts.length;i++){
    const a = pts[i], b = pts[(i+2)%pts.length];
    const mx = (a.x+b.x)/2, my = Math.min(a.y,b.y)-40;
    links += `<path class="link" d="M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}" />`;
  }
  let bgDots = "";
  for(let i=0;i<26;i++){
    const x = 40 + (i*37)%920;
    const y = 30 + ((i*53)%330);
    bgDots += `<circle class="dot dim" cx="${x}" cy="${y}" r="2.2"></circle>`;
  }
  let mainDots = "";
  pts.forEach(p=>{
    mainDots += `<circle class="dot" cx="${p.x}" cy="${p.y}" r="5" data-tip="${p.nom} (${p.pays})"></circle>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${links}${bgDots}${mainDots}</svg>`;
}

/* ---------- Annuaire : rendu + filtres (branché sur l'API) ---------- */
/* Couleurs par domaine pour les badges cartes */
const DOMAIN_BADGE = {
  'Environnement':  {bg:'#2E7D52', label:'ENVIRONNEMENT'},
  'Agriculture':    {bg:'#558B2F', label:'AGRICULTURE'},
  'Education':      {bg:'#1565C0', label:'EDUCATION'},
  'Sante':          {bg:'#00838F', label:'SANTÉ'},
  'Action Sociale': {bg:'#AD1457', label:'ACTION SOCIALE'},
  'Technologie':    {bg:'#4527A0', label:'INNOVATION'},
  'Culture':        {bg:'#6A1B9A', label:'CULTURE'},
  'Entrepreneuriat':{bg:'#E65100', label:'ENTREPRENEURIAT'},
  'Finance':        {bg:'#1B5E20', label:'FINANCE'},
  'Droit':          {bg:'#37474F', label:'DROIT'},
};

function renderInitiativeCard(it){
  const badge   = DOMAIN_BADGE[it.domaine] || {bg:'#1B3A6B', label:(it.domaine||'INITIATIVE').toUpperCase()};
  const seed    = encodeURIComponent(it.slug || it.nom || 'init');
  const photo   = `https://picsum.photos/seed/${seed}/400/240`;
  /* Localisation opérationnelle : ville + région (sans nationalité) */
  const loc     = [it.ville, it.region || it.pays].filter(Boolean).join(', ') || '—';
  /* Nationalité(s) de la diaspora concernée — info clé de la plateforme */
  const nats    = [it.nationalite1, it.nationalite2].filter(Boolean).join(' / ') || '—';
  const desc    = it.description || it.mission || '';
  const membres = it.membres ? `<span class="ann-membres">👥 ${it.membres}</span>` : '';

  return `
  <a class="ann-card" href="initiative.html?id=${encodeURIComponent(it.slug || it.id)}">
    <div class="ann-card-photo">
      <img src="${photo}" alt="${it.nom}" loading="lazy" onerror="this.src='https://picsum.photos/seed/${it.id||0}/400/240'">
      <span class="ann-cat-badge" style="background:${badge.bg};">${badge.label}</span>
      ${it.type ? `<span class="ann-type-badge">${it.type}</span>` : ''}
    </div>
    <div class="ann-card-body">
      <div class="ann-card-title">${it.nom}</div>
      <div class="ann-card-nat">🌍 ${nats}</div>
      ${desc ? `<div class="ann-card-desc">${desc}</div>` : ''}
      <div class="ann-card-foot">
        <span class="ann-location">📍 ${loc}</span>
        <div style="display:flex;align-items:center;gap:8px">${membres}<span class="ann-arrow">→</span></div>
      </div>
    </div>
  </a>`;
}

function populateSelect(id, values){
  const sel = document.getElementById(id);
  if(!sel) return;
  values.forEach(v=>{
    const opt = document.createElement("option");
    opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
}

async function initAnnuaire(){
  const list = document.getElementById("init-list");
  if(!list) return;

  let ALL = [];
  try {
    const r = await api("GET", "/initiatives");
    ALL = r.initiatives;
  } catch (e) {
    list.innerHTML = `<div class="empty">Impossible de contacter le serveur Diaspo'Actif. Vérifiez qu'il est démarré (voir README du dossier server/).</div>`;
    return;
  }

  populateSelect("f-pays", [...new Set(ALL.map(i=>i.nationalite1).filter(Boolean))].sort());
  populateSelect("f-nat2", [...new Set(ALL.map(i=>i.nationalite2).filter(Boolean))].sort());
  populateSelect("f-domaine", [...new Set(ALL.map(i=>i.domaine).filter(Boolean))].sort());
  populateSelect("f-type", [...new Set(ALL.map(i=>i.type).filter(Boolean))].sort());

  function apply(){
    const q = (document.getElementById("f-q").value || "").toLowerCase();
    const pays = document.getElementById("f-pays").value;
    const nat2 = document.getElementById("f-nat2").value;
    const dom = document.getElementById("f-domaine").value;
    const type = document.getElementById("f-type").value;
    const uniqueOnly = document.getElementById("f-unique") ? document.getElementById("f-unique").checked : false;

    const filtered = ALL.filter(it=>{
      if(q && !it.nom.toLowerCase().includes(q)) return false;
      if(pays && it.nationalite1 !== pays) return false;
      if(nat2 && it.nationalite2 !== nat2) return false;
      if(dom && it.domaine !== dom) return false;
      if(type && it.type !== type) return false;
      if(uniqueOnly && !it.nationalite_unique) return false;
      return true;
    });

    document.getElementById("result-count").textContent = filtered.length;
    list.innerHTML = filtered.length
      ? filtered.map(renderInitiativeCard).join("")
      : `<div class="empty">Aucune initiative ne correspond à ces critères.</div>`;
  }

  ["f-q","f-pays","f-nat2","f-domaine","f-type"].forEach(id=>{
    document.getElementById(id).addEventListener("input", apply);
    document.getElementById(id).addEventListener("change", apply);
  });
  if(document.getElementById("f-unique")){
    document.getElementById("f-unique").addEventListener("change", apply);
  }
  document.getElementById("btn-search").addEventListener("click", apply);
  apply();
}

/* ---------- Fiche initiative (branchée sur l'API) ---------- */
async function initFicheInitiative(){
  const box = document.getElementById("fiche-initiative");
  if(!box) return;
  const params = new URLSearchParams(window.location.search);
  const idParam = params.get("id");
  let it;
  try {
    const r = await api("GET", "/initiatives/" + encodeURIComponent(idParam));
    it = r.initiative;
  } catch (e) {
    box.innerHTML = `<div class="empty">Initiative introuvable.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="profile-card">
      <div class="profile-cover"></div>
      <div class="profile-head">
        <div class="init-logo" style="width:64px;height:64px;">${photoAvatar(it.nom, 64, 'initiative')}</div>
        <div style="flex:1;">
          <div class="flex-between">
            <div>
              <h2 style="margin:0;">${it.nom}</h2>
              <p style="color:var(--muted);margin:2px 0 0;">${it.ville || ""} · ${it.region || ""} · ${it.zone || ""}</p>
            </div>
            <div style="display:flex;gap:10px;">
              ${it.owner_user_id
                ? `<a class="btn btn-orange" href="messagerie.html?with=${it.owner_user_id}">Contacter via la plateforme</a>`
                : `<button class="btn btn-orange" disabled title="Aucun responsable assigné pour cette initiative démo">Contacter via la plateforme</button>`}
              <button class="btn btn-outline">S'abonner</button>
            </div>
          </div>
        </div>
      </div>
      <div style="padding:0 22px 22px;">
        <div class="tags" style="margin-bottom:14px;">
          <span class="tag">🌍 Nationalité 1 : ${it.nationalite1 || "—"}</span>
          <span class="tag">🌍 Nationalité 2 : ${it.nationalite2 || "—"}</span>
          <span class="tag">${it.domaine || ""}</span>
          <span class="badge ${badgeClass(it.type)}">${it.type || ""}</span>
          ${it.nationalite_unique ? `<span class="badge badge-unique">Réservée à une nationalité unique</span>` : ``}
        </div>
        <div class="tags" style="margin-bottom:14px;">
          ${(it.nationalites_concernees||[]).map(n=>`<span class="tag">👥 ${n}</span>`).join("")}
        </div>
        <p>${it.description || ""}</p>
        <div class="stat-row" style="margin-top:18px;">
          <div class="stat-card"><div class="num">${it.membres || 0}</div><div class="label">Membres du réseau</div></div>
          <div class="stat-card"><div class="num">${it.abonnes || 0}</div><div class="label">Abonnés</div></div>
          <div class="stat-card"><div class="num">${it.vues || 0}</div><div class="label">Vues du profil</div></div>
        </div>
      </div>
    </div>
    <div class="notice">🔒 Échange sécurisé sur Diaspo'Actif. Les numéros de téléphone ne sont jamais publics ; toute interaction doit transiter par la messagerie interne.</div>
  `;
}

/* ---------- Messagerie — widget compact pour les dashboards ---------- */
async function initMessagerie(){
  // Panneau compact dans dashboard-utilisateur (aperçu conversations)
  const cv = document.getElementById("dv-conversations");
  if(cv){
    try {
      const me = await fetchCurrentUser();
      if(!me){
        cv.innerHTML = `<div class="notice" style="margin:0;">Connectez-vous pour voir vos conversations.</div>`;
        return;
      }
      const r = await api("GET", "/conversations?filtre=tous");
      const convs = r.conversations || [];
      if(!convs.length){
        cv.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:8px 0;">Aucune conversation pour le moment. <a href="messagerie.html" style="color:var(--orange);">Démarrer</a></div>`;
        return;
      }
      cv.innerHTML = convs.slice(0,4).map(c=>`
        <a href="messagerie.html" style="text-decoration:none;display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);align-items:center;">
          <div class="avatar" style="flex-shrink:0;width:36px;height:36px;">${photoAvatar(c.avec_nom||'?', 36)}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13px;${c.non_lus>0?'color:var(--orange);':''}">${c.avec_nom||"Utilisateur"} ${c.non_lus>0?`<span style="background:var(--orange);color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;">${c.non_lus}</span>`:''}</div>
            <div style="font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.derniere||"Nouvelle conversation"}</div>
          </div>
        </a>`).join("") +
        `<div style="margin-top:10px;"><a href="messagerie.html" class="btn btn-sm btn-outline" style="width:100%;text-align:center;">Voir toutes les conversations →</a></div>`;
    } catch(e) {
      cv.innerHTML = `<div class="notice" style="margin:0;">Impossible de charger les messages.</div>`;
    }
    return;
  }

  // Ancienne page messagerie (chat-list), redirige vers la nouvelle
  const list = document.getElementById("chat-list");
  if(list){
    list.closest(".chat-wrap")?.closest("main")?.insertAdjacentHTML("afterbegin",
      `<div class="notice">La messagerie a été mise à jour. <a href="messagerie.html${window.location.search}">Accéder à la messagerie →</a></div>`
    );
  }
}

/* Fonction globale pour ouvrir une conversation depuis n'importe quelle page */
function ouvrirMessagerie(userId) {
  window.location.href = `messagerie.html?with=${userId}`;
}

/* ---------- Tableau de bord utilisateur ---------- */
async function initDashboardUtilisateur(){
  const rl = document.getElementById("dv-recherches");
  if(rl && typeof RECHERCHES !== "undefined"){
    rl.innerHTML = RECHERCHES.map(r=>`
      <div class="flex-between" style="padding:12px 0;border-bottom:1px solid var(--border);">
        <span>🔍 Recherche : ${r.requete}</span>
        <span style="color:var(--muted);font-size:12.5px;">${r.date}</span>
      </div>`).join("");
  }
  const nat = document.getElementById("dv-nationalites");
  if(nat && typeof UTILISATEUR_PROFIL !== "undefined"){
    nat.innerHTML = UTILISATEUR_PROFIL.nationalites.map(n=>`
      <div class="nat-card">
        <div class="nat-flag">🌍</div>
        <div class="meta">
          <h4>${n.pays}</h4>
          <p>Justificatif fourni : ${n.document}</p>
        </div>
        <span class="statut-pill ${n.statut.includes('Vérifiée') ? 'statut-verifiee' : 'statut-attente'}">${n.statut}</span>
      </div>`).join("");
  }
  const loc = document.getElementById("dv-localisation");
  if(loc && typeof UTILISATEUR_PROFIL !== "undefined"){
    const l = UTILISATEUR_PROFIL.localisation;
    loc.innerHTML = `
      <div class="tags" style="margin-bottom:10px;">
        <span class="tag">📍 Pays : ${l.pays}</span>
        <span class="tag">📍 Région : ${l.region}</span>
        <span class="tag">📍 Ville : ${l.ville}</span>
        <span class="tag">📍 Code postal : ${l.code_postal}</span>
      </div>
      <p style="color:var(--muted);font-size:12.5px;">🔒 Confidentialité : ${l.visibilite}. Vous contrôlez la visibilité de votre localisation dans vos paramètres.</p>`;
  }
  const fin = document.getElementById("dv-financements");
  if(fin && typeof MES_FINANCEMENTS !== "undefined"){
    fin.innerHTML = MES_FINANCEMENTS.map(f=>`
      <div class="flex-between" style="padding:10px 0;border-bottom:1px solid var(--border);">
        <span>💚 ${f.campagne}</span>
        <span style="color:var(--orange);font-weight:700;">${f.montant} €</span>
        <span style="color:var(--muted);font-size:12px;">${f.date}</span>
      </div>`).join("");
  }
  const collab = document.getElementById("dv-collaborations");
  if(collab && typeof MES_COLLABORATIONS !== "undefined"){
    collab.innerHTML = MES_COLLABORATIONS.map(c=>`
      <div class="init-card" style="margin-bottom:10px;">
        <div class="init-logo">${initials(c.titre)}</div>
        <div class="meta"><h4>${c.titre}</h4><p>${c.role} · avec ${c.avec}</p></div>
        <span class="tag">${c.statut}</span>
      </div>`).join("");
  }

  const cv = document.getElementById("dv-conversations");
  if(cv){
    try {
      const me = await fetchCurrentUser();
      if(!me){
        cv.innerHTML = `<div class="notice" style="margin:0;">Connectez-vous pour voir vos conversations.</div>`;
      } else {
        const r = await api("GET", "/conversations");
        cv.innerHTML = r.conversations.length ? r.conversations.map(c=>`
          <a class="init-card" href="messagerie.html?conv=${c.id}" style="margin-bottom:10px;">
            <div class="init-logo">${photoAvatar(c.avec_nom||'?', 48)}</div>
            <div class="meta"><h4>${c.avec_nom || "Utilisateur"}</h4><p>${c.derniere || "Nouvelle conversation"}</p></div>
          </a>`).join("") : `<div class="empty">Aucune conversation pour le moment.</div>`;
      }
    } catch (e) { /* serveur indisponible : section laissée vide */ }
  }
}

/* ---------- Actualités / Événements ---------- */
function initActualites(){
  const el = document.getElementById("actu-list");
  if(!el || typeof ACTUALITES === "undefined") return;
  el.innerHTML = ACTUALITES.map(a=>`
    <div class="card" style="margin-bottom:14px;">
      <div class="flex-between">
        <h3>${a.titre}</h3>
        <span style="color:var(--muted);font-size:12px;">${a.date}</span>
      </div>
      <p>${a.resume}</p>
      <p style="margin-top:8px;color:var(--orange);font-weight:700;font-size:12.5px;">${a.source}</p>
    </div>`).join("");
}
function initEvenements(){
  const el = document.getElementById("evt-list");
  if(!el || typeof EVENEMENTS === "undefined") return;
  el.innerHTML = EVENEMENTS.map(e=>`
    <div class="timeline-item">
      <div class="date-chip"><div>${e.date.split(" ")[0]}</div><span>${e.date.split(" ")[1]}</span></div>
      <div class="card" style="flex:1;">
        <div class="flex-between">
          <div>
            <h3 style="margin:0 0 4px;">${e.titre}</h3>
            <p style="margin:0;">${e.organisateur} · ${e.lieu}</p>
          </div>
          <span class="tag">${e.statut}</span>
        </div>
      </div>
    </div>`).join("");
}

/* ---------- Fil d'actualité global (branché sur l'API) ---------- */
async function initFilActualite(){
  const el = document.getElementById("feed-list");
  if(!el) return;

  let posts = [];
  try {
    const r = await api("GET", "/fil");
    posts = r.posts;
  } catch (e) {
    el.innerHTML = `<div class="empty">Impossible de contacter le serveur Diaspo'Actif.</div>`;
    return;
  }

  function countReactions(p){
    return Object.values(p.reactions || {}).reduce((a,b)=>a+b, 0);
  }

  let currentFilter = "Tous";

  function render(filterType){
    currentFilter = filterType || "Tous";
    const items = currentFilter !== "Tous" ? posts.filter(p=>p.type === currentFilter) : posts;
    el.innerHTML = items.length ? items.map(p=>`
      <div class="feed-post">
        <div class="feed-head">
          <div class="init-logo">${photoAvatar(p.auteur_nom || '?', 48)}</div>
          <div class="meta">
            <h4>${p.auteur_nom || "Anonyme"}</h4>
            <div class="sub-meta">${p.type || ""} · ${new Date(p.created_at.replace(" ","T")+"Z").toLocaleString('fr-FR')}</div>
          </div>
          <span class="feed-cat">${p.categorie || ""}</span>
        </div>
        <div class="feed-body">${p.contenu}</div>
        <div class="feed-actions">
          <span class="feed-react" data-id="${p.id}" style="cursor:pointer;">👍 Réagir (${countReactions(p)})</span>
          <span>💬 Commenter</span>
          <span>🔁 Partager</span>
          <span>🔖 Enregistrer</span>
          <span>🚩 Signaler</span>
        </div>
      </div>`).join("") : `<div class="empty">Aucune publication pour ce filtre.</div>`;

    el.querySelectorAll(".feed-react").forEach(s=>{
      s.addEventListener("click", async ()=>{
        try {
          const r = await api("POST", `/fil/${s.dataset.id}/react`, { type: "like" });
          const post = posts.find(p=>String(p.id)===s.dataset.id);
          if(post) post.reactions = r.reactions;
          render(currentFilter);
        } catch (e) {
          alert("Connectez-vous pour réagir aux publications.");
        }
      });
    });
  }

  const bar = document.getElementById("feed-filter-bar");
  if(bar){
    bar.querySelectorAll("button").forEach(b=>{
      b.addEventListener("click", ()=>{
        bar.querySelectorAll("button").forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        render(b.dataset.type);
      });
    });
  }

  const pubBox = document.getElementById("fil-publish");
  if(pubBox){
    const me = await fetchCurrentUser();
    if(me){
      pubBox.innerHTML = `
        <textarea id="fil-new-content" placeholder="Partager une actualité, une opportunité, un appel à projets..." style="width:100%;min-height:70px;border-radius:10px;border:1px solid var(--border);padding:10px;font-family:inherit;"></textarea>
        <button class="btn btn-orange" id="fil-publish-btn" style="margin-top:8px;">Publier</button>`;
      document.getElementById("fil-publish-btn").addEventListener("click", async ()=>{
        const ta = document.getElementById("fil-new-content");
        if(!ta.value.trim()) return;
        await api("POST", "/fil", { contenu: ta.value.trim(), categorie: "Publication" });
        ta.value = "";
        const r = await api("GET", "/fil");
        posts = r.posts;
        render(currentFilter);
      });
    } else {
      pubBox.innerHTML = `<div class="notice" style="margin:0;">Vous devez être <a href="login.html">connecté</a> pour publier sur le fil d'actualité.</div>`;
    }
  }

  render("Tous");
}

/* ---------- Financements participatifs en cours ---------- */
function initCampagnes(){
  const el = document.getElementById("campagnes-list");
  if(!el || typeof CAMPAGNES_FINANCEMENT === "undefined") return;
  el.innerHTML = CAMPAGNES_FINANCEMENT.map(c=>{
    const pct = Math.min(100, Math.round((c.collecte / c.recherche) * 100));
    return `
    <div class="card" style="margin-bottom:14px;">
      <div class="flex-between">
        <h3 style="margin:0;">${c.projet}</h3>
        <span class="tag">${c.jours_restants} j restants</span>
      </div>
      <p style="margin:4px 0 10px;">Porté par ${c.porteur}</p>
      <div style="background:var(--bg);border-radius:20px;height:10px;overflow:hidden;margin-bottom:8px;">
        <div style="background:var(--orange);height:100%;width:${pct}%;"></div>
      </div>
      <div class="flex-between" style="font-size:12.5px;color:var(--muted);margin-bottom:10px;">
        <span><strong style="color:var(--navy);">${c.collecte.toLocaleString('fr-FR')} €</strong> collectés sur ${c.recherche.toLocaleString('fr-FR')} € (${pct}%)</span>
        <span>${c.contributeurs} contributeurs</span>
      </div>
      <button class="btn btn-orange btn-block">Contribuer</button>
    </div>`;
  }).join("");
}

/* ---------- Projets Diaspo'Actif en cours ---------- */
function initProjetsDiaspoActif(){
  const el = document.getElementById("projets-list");
  if(!el || typeof PROJETS_DIASPOACTIF === "undefined") return;
  el.innerHTML = PROJETS_DIASPOACTIF.map(p=>`
    <div class="card" style="margin-bottom:14px;">
      <div class="flex-between">
        <h3 style="margin:0;">${p.nom}</h3>
        <span class="feed-cat">${p.categorie}</span>
      </div>
      <div style="background:var(--bg);border-radius:20px;height:10px;overflow:hidden;margin:10px 0 6px;">
        <div style="background:var(--green);height:100%;width:${p.avancement}%;"></div>
      </div>
      <p style="margin:0 0 8px;font-size:12.5px;color:var(--muted);">Avancement : ${p.avancement}%</p>
      <p style="margin:0 0 8px;"><strong>Partenaires :</strong> ${p.partenaires.join(", ")}</p>
      <p style="margin:0;color:var(--muted);">${p.besoins}</p>
    </div>`).join("");
}

/* ---------- Publicité (démo, données fictives, géolocalisée) ---------- */
function renderAd(containerId, idx){
  const el = document.getElementById(containerId);
  if(!el || typeof PUBLICITES === "undefined") return;
  const ad = PUBLICITES[idx % PUBLICITES.length];
  const ville = (typeof UTILISATEUR_PROFIL !== "undefined" && UTILISATEUR_PROFIL.localisation) ? UTILISATEUR_PROFIL.localisation.ville : null;
  el.innerHTML = `
    <div class="ad-icon" style="background:${ad.couleur};">${ad.icone}</div>
    <div class="ad-body">
      <span class="ad-tag">Publicité${ville ? " · ciblée pour "+ville : ""}</span>
      <h4>${ad.marque}</h4>
      <p>${ad.accroche}</p>
    </div>
    <button class="btn btn-sm btn-outline">${ad.cta}</button>
  `;
  el.className = "ad-banner";
}
function renderAllAds(){
  document.querySelectorAll("[data-ad-slot]").forEach(el=>{
    renderAd(el.id, parseInt(el.dataset.adSlot, 10) || 0);
  });
}

/* ---------- Niveaux de confidentialité des données ---------- */
function initConfidentialite(){
  const el = document.getElementById("conf-list");
  if(!el || typeof CONFIDENTIALITE_NIVEAUX === "undefined") return;
  el.innerHTML = CONFIDENTIALITE_NIVEAUX.map(n => `
    <div class="conf-card ${n.classe}">
      <div class="conf-icon">${n.icone}</div>
      <h3>${n.niveau}</h3>
      <p>${n.description}</p>
      <ul>${n.champs.map(c => `<li>${c}</li>`).join("")}</ul>
    </div>`).join("");
}

/* ---------- Observatoire statistique de la diaspora (institutions) ---------- */
function initObservatoire(){
  const el = document.getElementById("observatoire-pays");
  if(!el || typeof OBSERVATOIRE_DIASPORA === "undefined") return;
  const seuil = SEUIL_CONFIDENTIALITE_OBSERVATOIRE;
  const maskOrShow = (n) => n < seuil ? `&lt; ${seuil} (masqué pour confidentialité)` : n.toLocaleString('fr-FR');

  const o = OBSERVATOIRE_DIASPORA;
  document.getElementById("observatoire-total").textContent = o.total.toLocaleString('fr-FR');
  document.getElementById("observatoire-porteurs").textContent = o.porteurs_projets.toLocaleString('fr-FR');
  document.getElementById("observatoire-entrepreneurs").textContent = o.entrepreneurs.toLocaleString('fr-FR');
  document.getElementById("observatoire-investisseurs").textContent = o.investisseurs.toLocaleString('fr-FR');
  document.getElementById("observatoire-etudiants").textContent = o.etudiants.toLocaleString('fr-FR');

  el.innerHTML = o.par_pays.map(p => `
    <div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border);">
      <strong>${p.pays}</strong>
      <span>${maskOrShow(p.membres)} membres</span>
    </div>
    ${p.villes.map(v => `
      <div class="flex-between" style="padding:4px 0 4px 18px;color:var(--muted);font-size:12.5px;">
        <span>↳ ${v.ville}</span>
        <span>${maskOrShow(v.membres)}</span>
      </div>`).join("")}
  `).join("");

  function renderBars(containerId, items, labelKey){
    const c = document.getElementById(containerId);
    if(!c) return;
    const max = Math.max(...items.map(i=>i.membres));
    c.innerHTML = items.map(i => `
      <div style="margin-bottom:8px;">
        <div class="flex-between" style="font-size:12.5px;margin-bottom:3px;"><span>${i[labelKey]}</span><span>${maskOrShow(i.membres)}</span></div>
        <div style="background:var(--bg);border-radius:20px;height:8px;overflow:hidden;">
          <div style="background:var(--orange);height:100%;width:${Math.round((i.membres/max)*100)}%;"></div>
        </div>
      </div>`).join("");
  }
  renderBars("observatoire-secteur", o.par_secteur, "secteur");
  renderBars("observatoire-age", o.par_age, "tranche");
  renderBars("observatoire-etudes", o.par_niveau_etudes, "niveau");
}

/* ---------- Aperçu agrégé d'un envoi ciblé (institutions, démo) ---------- */
function initApercuCiblage(){
  const el = document.getElementById("apercu-ciblage");
  if(!el || typeof ENVOI_CIBLE_EXEMPLE === "undefined") return;
  const e = ENVOI_CIBLE_EXEMPLE;
  el.innerHTML = `
    <div class="stat-card"><div class="num">${e.destinataires}</div><div class="label">Destinataires correspondant aux critères</div></div>
    <div class="stat-card"><div class="num">${e.taux_ouverture}%</div><div class="label">Taux d'ouverture</div></div>
    <div class="stat-card"><div class="num">${e.taux_participation}%</div><div class="label">Taux de participation</div></div>
    <div class="stat-card"><div class="num">${e.reponses}</div><div class="label">Réponses obtenues</div></div>
  `;
}

/* ---------- Profil Utilisateur consolidé (rendu générique, sections optionnelles) ---------- */
function renderProfilUtilisateur(vm){
  const el = document.getElementById("profil-page");
  if(!el || !vm) return;

  const tagList = (arr) => (arr||[]).map(x => `<span class="tag">${x}</span>`).join("");
  const champList = (arr) => `<ul style="margin:8px 0 0;padding-left:18px;color:var(--muted);font-size:13px;">${(arr||[]).map(x=>`<li>${x}</li>`).join("")}</ul>`;

  const sections = [];

  sections.push(`
    <div class="card" style="margin-bottom:20px;">
      <div class="flex-between" style="align-items:flex-start;flex-wrap:wrap;gap:14px;">
        <div style="display:flex;gap:14px;align-items:center;">
          <div class="avatar" style="width:64px;height:64px;font-size:22px;">${photoAvatar(vm.nom, 64)}</div>
          <div>
            <h2 style="margin:0 0 4px;">${vm.nom} ${vm.verifie ? '<span class="tag" style="background:#E7F4EE;color:var(--green);border-color:#cdeede;">✅ Profil vérifié</span>' : ''}</h2>
            <p style="margin:0;color:var(--muted);">${vm.statut_professionnel || ""}${vm.ville ? " · "+vm.ville : ""}</p>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-outline">Envoyer un message</button>
          <button class="btn btn-sm btn-outline">Collaborer</button>
          <button class="btn btn-sm btn-outline">Suivre</button>
        </div>
      </div>
      <div class="notice" style="margin-top:14px;">⚠️ Les nationalités déclarées ne sont pas affichées publiquement.</div>
    </div>`);

  if(vm.profession){
    const pr = vm.profession;
    sections.push(`
    <div class="card" style="margin-bottom:20px;">
      <h3>Profil professionnel</h3>
      <div class="grid grid-2" style="margin-top:10px;">
        ${pr.situation ? `<p><strong>Situation :</strong> ${pr.situation}</p>` : ""}
        ${pr.niveau_etudes ? `<p><strong>Niveau d'études :</strong> ${pr.niveau_etudes}</p>` : ""}
        ${pr.secteur ? `<p><strong>Secteur d'activité :</strong> ${pr.secteur}</p>` : ""}
        ${pr.linkedin ? `<p><strong>LinkedIn :</strong> ${pr.linkedin}</p>` : ""}
        ${pr.entreprise ? `<p><strong>Entreprise :</strong> ${pr.entreprise}</p>` : ""}
        ${pr.pays_siege ? `<p><strong>Pays du siège social :</strong> ${pr.pays_siege}</p>` : ""}
        ${pr.activite_pays_origine ? `<p><strong>Activité dans le pays d'origine :</strong> ${pr.activite_pays_origine}</p>` : ""}
      </div>
      ${pr.recherche ? `<p style="margin-top:10px;"><strong>Recherche actuellement :</strong></p><div style="margin-top:6px;">${tagList(pr.recherche)}</div>` : ""}
    </div>`);
  }

  if(vm.projet){
    const pj = vm.projet;
    sections.push(`
    <div class="card" style="margin-bottom:20px;">
      <h3>Projets & initiatives</h3>
      ${pj.presentation ? `<p style="margin-top:8px;">${pj.presentation}</p>` : ""}
      <div class="grid grid-2" style="margin-top:10px;">
        ${pj.secteurs ? `<p><strong>Secteurs concernés :</strong> ${pj.secteurs.join(", ")}</p>` : ""}
        ${pj.localisation ? `<p><strong>Localisation de l'initiative :</strong> ${pj.localisation}</p>` : ""}
        ${pj.nationalite_unique !== undefined ? `<p><strong>Option Nationalité Unique :</strong> ${pj.nationalite_unique ? "☑ Oui" : "☐ Non"}</p>` : ""}
        ${pj.nationalite_ciblee ? `<p><strong>Nationalité ciblée :</strong> ${pj.nationalite_ciblee} <span style="color:var(--muted);font-size:11.5px;">(non visible publiquement, sert au ciblage)</span></p>` : ""}
        ${pj.emplois_envisages ? `<p><strong>Emplois envisagés :</strong> ${pj.emplois_envisages}</p>` : ""}
        ${pj.investissement_previsionnel ? `<p><strong>Investissement prévisionnel :</strong> ${pj.investissement_previsionnel}</p>` : ""}
        ${pj.financement_recherche ? `<p><strong>Financement recherché :</strong> ${pj.financement_recherche}</p>` : ""}
      </div>
      ${pj.stade ? `<p style="margin-top:10px;"><strong>Stade d'avancement :</strong></p><div style="margin-top:6px;">${tagList(pj.stade)}</div>` : ""}
      ${pj.moyens_paiement ? `<p style="margin-top:10px;"><strong>Moyens de paiement acceptés :</strong></p><div style="margin-top:6px;">${tagList(pj.moyens_paiement)}</div>` : ""}
      ${pj.impact ? `
      <div class="stat-row" style="margin-top:16px;">
        <div class="stat-card"><div class="num">${pj.impact.emplois_prevus}</div><div class="label">Emplois prévus</div></div>
        <div class="stat-card"><div class="num">${pj.impact.pays_cible}</div><div class="label">Pays ciblé</div></div>
        <div class="stat-card"><div class="num">${pj.impact.investissement_estime}</div><div class="label">Investissement estimé</div></div>
      </div>` : ""}
    </div>`);
  }

  if(vm.motivations || vm.attentes){
    sections.push(`
    <div class="card" style="margin-bottom:20px;">
      <h3>Motivations & attentes</h3>
      <div class="grid grid-2" style="margin-top:10px;">
        <div><p style="font-weight:700;font-size:13px;">Motivations</p>${champList(vm.motivations)}</div>
        <div><p style="font-weight:700;font-size:13px;">Attentes</p>${champList(vm.attentes)}</div>
      </div>
    </div>`);
  }

  if(vm.nationalites || vm.localisation){
    sections.push(`
    <div class="card" style="margin-bottom:20px;">
      <h3>Localisation & nationalités déclarées</h3>
      ${vm.localisation ? `<div class="tags" style="margin:10px 0;">
        <span class="tag">📍 ${vm.localisation.ville || ""}</span>
        <span class="tag">📍 ${vm.localisation.region || ""}</span>
        <span class="tag">📍 ${vm.localisation.pays || ""}</span>
      </div>` : ""}
      ${vm.nationalites ? vm.nationalites.map(n=>`
        <div class="nat-card">
          <div class="nat-flag">🌍</div>
          <div class="meta"><h4>${n.pays}</h4><p>Justificatif : ${n.document}</p></div>
          <span class="statut-pill ${n.statut.includes('Vérifiée') ? 'statut-verifiee' : 'statut-attente'}">${n.statut}</span>
        </div>`).join("") : ""}
    </div>`);
  }

  if(vm.activite){
    const ac = vm.activite;
    const badgeInfo = (typeof BADGES_ENGAGEMENT !== "undefined" && BADGES_ENGAGEMENT.find(b => b.niveau === ac.badge)) || { icone: "🥉", label: "Contributeur Bronze" };
    sections.push(`
    <div class="card" style="margin-bottom:20px;">
      <h3>Activité Diaspo'Actif</h3>
      <div class="stat-row" style="margin-top:10px;">
        <div class="stat-card"><div class="num">${ac.finance_projets ?? 0}</div><div class="label">Projets financés</div></div>
        <div class="stat-card"><div class="num">${ac.finance_montant ?? "0 €"}</div><div class="label">Total investi</div></div>
        <div class="stat-card"><div class="num">${ac.collaborations_cours ?? 0}</div><div class="label">Collaborations en cours</div></div>
        <div class="stat-card"><div class="num">${ac.reseau_contacts ?? 0}</div><div class="label">Contacts dans le réseau</div></div>
      </div>
      ${ac.evenements ? `<p style="margin-top:14px;"><strong>Événements suivis :</strong></p><div style="margin-top:6px;">${tagList(ac.evenements)}</div>` : ""}
      <div class="flex-between" style="margin-top:16px;background:var(--bg);border-radius:12px;padding:12px 16px;">
        <span style="font-weight:700;">Badge d'engagement</span>
        <span class="badge badge-instit" style="font-size:13px;">${badgeInfo.icone} ${badgeInfo.label}</span>
      </div>
    </div>`);
  }

  sections.push(`
    <div class="card" style="margin-bottom:20px;">
      <h3>Fil d'actualité personnalisé</h3>
      <p>Le fil affiche les publications publiques de la plateforme, celles des membres suivis et des collaborations en cours, les opportunités liées aux centres d'intérêt, les projets financés ou suivis, ainsi que les événements géolocalisés.</p>
      <p style="margin-top:10px;"><strong>Personnalisation progressive :</strong> l'algorithme prend en compte la ville de résidence, les centres d'intérêt, les secteurs d'activité, les projets suivis et les interactions réalisées.</p>
      <div class="notice" style="margin-top:12px;">⚠️ Les publications institutionnelles ciblées selon une nationalité sont distribuées automatiquement aux membres concernés mais n'indiquent jamais les nationalités détenues par les utilisateurs.</div>
    </div>`);

  sections.push(`<div class="card" style="margin-bottom:20px;" id="profil-confidentialite"></div>`);

  sections.push(`
    <div class="card">
      <h3>📊 Observatoire de la diaspora (institutionnel)</h3>
      <p>Les comptes institutionnels disposent d'un tableau de bord statistique exclusivement agrégé et anonymisé — aucune identité individuelle n'est communiquée.</p>
      <div id="profil-observatoire-resume" style="margin-top:12px;"></div>
      <a href="dashboard-institutionnel.html#observatoire" class="btn btn-sm btn-outline" style="margin-top:14px;">Voir le tableau complet →</a>
    </div>`);

  el.innerHTML = sections.join("");

  if(typeof CONFIDENTIALITE_NIVEAUX !== "undefined"){
    document.getElementById("profil-confidentialite").innerHTML = `
      <h3>Vérifications & confidentialité</h3>
      <div class="grid grid-3" style="margin-top:10px;">
        ${CONFIDENTIALITE_NIVEAUX.map(n => `
          <div class="conf-card ${n.classe}">
            <div class="conf-icon">${n.icone}</div>
            <h3>${n.niveau}</h3>
            <p>${n.description}</p>
            <ul>${n.champs.map(c => `<li>${c}</li>`).join("")}</ul>
          </div>`).join("")}
      </div>`;
  }

  if(typeof OBSERVATOIRE_DIASPORA !== "undefined"){
    const o = OBSERVATOIRE_DIASPORA;
    const top = o.par_pays.slice(0,3);
    document.getElementById("profil-observatoire-resume").innerHTML = `
      <div class="stat-row">
        ${top.map(t => `<div class="stat-card"><div class="num">${t.membres.toLocaleString('fr-FR')}</div><div class="label">${o.nationalite} en ${t.pays}</div></div>`).join("")}
      </div>`;
  }
}

function buildProfilViewModel(u){
  const pr = u.profil || {};
  return {
    nom: pr.nom || u.nom,
    statut_professionnel: pr.statut_professionnel || (pr.profession && pr.profession.situation) || ROLE_LABEL_FR[u.role] || u.role,
    ville: pr.ville || u.ville || "",
    verifie: pr.verifie !== undefined ? pr.verifie : true,
    profession: pr.profession || null,
    projet: pr.projet || null,
    motivations: pr.motivations || null,
    attentes: pr.attentes || null,
    activite: pr.activite || null,
    nationalites: pr.nationalites || null,
    localisation: pr.localisation || null
  };
}

async function initProfilUtilisateur(){
  const el = document.getElementById("profil-page");
  if(!el) return;

  const params = new URLSearchParams(window.location.search);
  let targetId = params.get("id");

  try {
    if(!targetId){
      const me = await fetchCurrentUser();
      if(!me){
        el.innerHTML = `<div class="notice">Vous devez être <a href="login.html">connecté</a> pour voir votre profil. Vous pouvez aussi consulter un profil existant via <code>?id=&lt;identifiant&gt;</code>.</div>`;
        return;
      }
      targetId = me.id;
    }
    const r = await api("GET", "/profil/" + targetId);
    renderProfilUtilisateur(buildProfilViewModel(r.profil));
  } catch (e) {
    el.innerHTML = `<div class="empty">Profil introuvable ou serveur indisponible.</div>`;
  }
}

/* ---------- Formations (catalogue, branché API) ---------- */
async function initFormations() {
  const grid = document.getElementById("formations-grid");
  const count = document.getElementById("formations-count");
  if (!grid) return;

  let all = [];
  try {
    const r = await api("GET", "/formations");
    all = r.formations;
  } catch (e) {
    grid.innerHTML = `<div class="empty">Impossible de charger les formations.</div>`;
    return;
  }

  function renderCard(f) {
    return `
    <div class="card formation-card" style="margin-bottom:16px;">
      <div class="flex-between" style="align-items:flex-start;flex-wrap:wrap;gap:8px;">
        <div style="flex:1;">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;">
            <span class="feed-cat">${f.type_formation || "Formation"}</span>
            ${f.gratuit ? `<span class="badge badge-asso">Gratuite</span>` : `<span class="badge badge-ent">${(f.prix||0).toFixed(0)} €</span>`}
            ${f.niveau ? `<span class="tag">${f.niveau}</span>` : ""}
          </div>
          <h3 style="margin:0 0 4px;">${f.titre}</h3>
          <p style="margin:0;color:var(--muted);font-size:13px;">${f.organisme || ""} ${f.domaine ? "· " + f.domaine : ""} ${f.langue ? "· " + f.langue : ""}</p>
        </div>
      </div>
      ${f.description ? `<p style="margin:10px 0 0;font-size:13.5px;">${f.description}</p>` : ""}
      <div class="tags" style="margin-top:10px;">
        ${f.duree ? `<span class="tag">⏱ ${f.duree}</span>` : ""}
        ${f.places ? `<span class="tag">👥 ${f.places} places</span>` : ""}
        ${f.nationalite && f.nationalite !== "Toutes nationalités" ? `<span class="tag">🌍 ${f.nationalite}</span>` : ""}
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button class="btn btn-orange btn-sm btn-inscrire" data-id="${f.id}" data-titre="${f.titre}">S'inscrire</button>
        <button class="btn btn-outline btn-sm">En savoir plus</button>
      </div>
    </div>`;
  }

  function apply() {
    const q = (document.getElementById("f-form-q")?.value || "").toLowerCase();
    const dom = document.getElementById("f-form-domaine")?.value || "";
    const type = document.getElementById("f-form-type")?.value || "";
    const niv = document.getElementById("f-form-niveau")?.value || "";
    const gratOnly = document.getElementById("f-form-gratuit")?.checked || false;

    const filtered = all.filter(f => {
      if (q && !(f.titre + (f.description || "") + (f.organisme || "")).toLowerCase().includes(q)) return false;
      if (dom && f.domaine !== dom) return false;
      if (type && f.type_formation !== type) return false;
      if (niv && f.niveau !== niv) return false;
      if (gratOnly && !f.gratuit) return false;
      return true;
    });

    if (count) count.textContent = filtered.length;
    grid.innerHTML = filtered.length
      ? filtered.map(renderCard).join("")
      : `<div class="empty">Aucune formation ne correspond à ces critères.</div>`;

    grid.querySelectorAll(".btn-inscrire").forEach(btn => {
      btn.addEventListener("click", async () => {
        const me = await fetchCurrentUser();
        if (!me) { alert("Connectez-vous pour vous inscrire à une formation."); return; }
        btn.textContent = "✓ Inscrit !";
        btn.disabled = true;
        btn.classList.remove("btn-orange");
        btn.classList.add("btn-outline");
      });
    });
  }

  // Peupler filtres
  const domainesSet = [...new Set(all.map(f => f.domaine).filter(Boolean))].sort();
  const typesSet = [...new Set(all.map(f => f.type_formation).filter(Boolean))].sort();
  const niveauxSet = [...new Set(all.map(f => f.niveau).filter(Boolean))];
  const selDom = document.getElementById("f-form-domaine");
  const selType = document.getElementById("f-form-type");
  const selNiv = document.getElementById("f-form-niveau");
  if (selDom) domainesSet.forEach(d => { const o = document.createElement("option"); o.value = d; o.textContent = d; selDom.appendChild(o); });
  if (selType) typesSet.forEach(t => { const o = document.createElement("option"); o.value = t; o.textContent = t; selType.appendChild(o); });
  if (selNiv) niveauxSet.forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = n; selNiv.appendChild(o); });

  ["f-form-q","f-form-domaine","f-form-type","f-form-niveau"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener("input", apply); el.addEventListener("change", apply); }
  });
  const gratEl = document.getElementById("f-form-gratuit");
  if (gratEl) gratEl.addEventListener("change", apply);
  const btnSearch = document.getElementById("btn-form-search");
  if (btnSearch) btnSearch.addEventListener("click", apply);

  apply();
}

document.addEventListener("DOMContentLoaded", ()=>{
  applyAuthState();
  initLangSelector();
  initAnnuaire();
  initFicheInitiative();
  initMessagerie();
  initDashboardUtilisateur();
  initActualites();
  initEvenements();
  initFilActualite();
  initCampagnes();
  initProjetsDiaspoActif();
  initConfidentialite();
  initObservatoire();
  initApercuCiblage();
  initProfilUtilisateur();
  initFormations();
  renderAllAds();
  applyTranslations();

  // Barre de recherche globale dans la topbar (si présente)
  const searchInput = document.getElementById("global-search");
  if(searchInput) {
    searchInput.addEventListener("keydown", e => {
      if(e.key === "Enter" && searchInput.value.trim().length >= 2) {
        window.location.href = "recherche.html?q=" + encodeURIComponent(searchInput.value.trim());
      }
    });
  }

  // PWA Service Worker
  if("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(()=>{});
  }
});
