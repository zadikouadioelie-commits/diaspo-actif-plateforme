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

const RAY_ICON = {locale:'📍', régionale:'🗺️', nationale:'🏳️', internationale:'🌐'};
const RAY_LABEL = {locale:'Locale', régionale:'Régionale', nationale:'Nationale', internationale:'Internationale'};

function renderInitiativeCard(it){
  const badge   = DOMAIN_BADGE[it.domaine] || {bg:'#1B3A6B', label:(it.domaine||'INITIATIVE').toUpperCase()};
  const seed    = encodeURIComponent(it.slug || it.nom || 'init');
  const photo   = `https://picsum.photos/seed/${seed}/400/240`;
  const loc     = [it.ville, it.pays].filter(Boolean).join(', ') || '—';
  const nats    = [it.nationalite1, it.nationalite2].filter(Boolean).join(' • ') || '—';
  const origs   = [it.origine1, it.origine2].filter(Boolean).join(' • ');
  const ray     = it.rayonnement || '';
  const rayHtml = ray ? `<span class="ann-ray-badge ann-ray-${ray}">${RAY_ICON[ray]||'🌐'} ${RAY_LABEL[ray]||ray}</span>` : '';
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
      <div class="ann-card-meta-row">
        <span class="ann-card-loc">📍 ${loc}</span>
        ${rayHtml}
      </div>
      ${origs ? `<div class="ann-card-origs">🌍 <strong>Origines :</strong> ${origs}</div>` : ''}
      <div class="ann-card-nats">🏛 <strong>Nationalités :</strong> ${nats}</div>
      ${desc ? `<div class="ann-card-desc">${desc}</div>` : ''}
      <div class="ann-card-foot">
        ${membres}
        <span class="ann-arrow">→</span>
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

  /* Nationalités */
  populateSelect("f-pays",    [...new Set(ALL.map(i=>i.nationalite1).filter(Boolean))].sort());
  populateSelect("f-nat2",    [...new Set(ALL.map(i=>i.nationalite2).filter(Boolean))].sort());
  /* Origines */
  const toutesOrigines = [...new Set([
    ...ALL.map(i=>i.origine1), ...ALL.map(i=>i.origine2)
  ].filter(Boolean))].sort();
  populateSelect("f-orig1", toutesOrigines);
  populateSelect("f-orig2", toutesOrigines);
  /* Localisation */
  populateSelect("f-pays-res",[...new Set(ALL.map(i=>i.pays).filter(Boolean))].sort());
  populateSelect("f-region",  [...new Set(ALL.map(i=>i.region).filter(Boolean))].sort());
  populateSelect("f-ville",   [...new Set(ALL.map(i=>i.ville).filter(Boolean))].sort());
  /* Domaine + Type */
  populateSelect("f-domaine", [...new Set(ALL.map(i=>i.domaine).filter(Boolean))].sort());
  populateSelect("f-type",    [...new Set(ALL.map(i=>i.type).filter(Boolean))].sort());

  function sel(id){ return (document.getElementById(id)||{}).value || ""; }

  function apply(){
    const q          = sel("f-q").toLowerCase();
    const nat1       = sel("f-pays");
    const nat2       = sel("f-nat2");
    const orig1      = sel("f-orig1");
    const orig2      = sel("f-orig2");
    const paysRes    = sel("f-pays-res");
    const region     = sel("f-region");
    const ville      = sel("f-ville");
    const ray        = sel("f-ray");
    const dom        = sel("f-domaine");
    const type       = sel("f-type");
    const uniqueOnly = document.getElementById("f-unique")?.checked || false;

    const filtered = ALL.filter(it=>{
      if(q && !it.nom.toLowerCase().includes(q) && !(it.description||"").toLowerCase().includes(q)) return false;
      /* Nationalités — cherche dans nat1 OU nat2 */
      if(nat1 && it.nationalite1 !== nat1 && it.nationalite2 !== nat1) return false;
      if(nat2 && it.nationalite1 !== nat2 && it.nationalite2 !== nat2) return false;
      /* Origines — cherche dans origine1 OU origine2 */
      if(orig1 && it.origine1 !== orig1 && it.origine2 !== orig1) return false;
      if(orig2 && it.origine1 !== orig2 && it.origine2 !== orig2) return false;
      /* Localisation combinable */
      if(paysRes && it.pays !== paysRes) return false;
      if(region  && it.region !== region) return false;
      if(ville   && it.ville !== ville) return false;
      /* Rayonnement */
      if(ray && it.rayonnement !== ray) return false;
      if(dom  && it.domaine !== dom) return false;
      if(type && it.type !== type) return false;
      if(uniqueOnly && !it.nationalite_unique) return false;
      return true;
    });

    document.getElementById("result-count").textContent = filtered.length;
    list.innerHTML = filtered.length
      ? filtered.map(renderInitiativeCard).join("")
      : `<div class="empty" style="grid-column:1/-1;padding:40px;text-align:center;color:var(--muted);">Aucune initiative ne correspond à ces critères.</div>`;
  }

  ["f-q","f-pays","f-nat2","f-orig1","f-orig2","f-pays-res","f-region","f-ville","f-ray","f-domaine","f-type"].forEach(id=>{
    const el = document.getElementById(id);
    if(el){ el.addEventListener("input", apply); el.addEventListener("change", apply); }
  });
  document.getElementById("f-unique")?.addEventListener("change", apply);
  document.getElementById("btn-search")?.addEventListener("click", apply);
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
function _renderLoc(el, l){
  if(!el) return;
  el.innerHTML = `
    <div class="tags" style="margin-bottom:10px;">
      <span class="tag">📍 Pays : ${l.pays||'—'}</span>
      <span class="tag">📍 Région : ${l.region||'—'}</span>
      <span class="tag">📍 Ville : ${l.ville||'—'}</span>
      <span class="tag">📍 Code postal : ${l.code_postal||'—'}</span>
    </div>
    <p style="color:var(--muted);font-size:12.5px;">🔒 Confidentialité : ${l.visibilite||'Non définie'}. Vous contrôlez la visibilité dans vos paramètres.</p>`;
}
function _renderNats(el, nats){
  if(!el) return;
  if(!nats||!nats.length){ el.innerHTML='<p style="color:var(--muted);font-size:13px;">Aucune nationalité déclarée.</p>'; return; }
  el.innerHTML = nats.map(n=>`
    <div class="nat-card">
      <div class="nat-flag">🌍</div>
      <div class="meta"><h4>${n.pays}</h4><p>Justificatif : ${n.document}</p></div>
      <span class="statut-pill ${n.statut&&n.statut.includes('Vérifiée')?'statut-verifiee':'statut-attente'}">${n.statut}</span>
    </div>`).join("");
}
async function initDashboardUtilisateur(){
  /* — Chargement des données réelles via l'API — */
  let locData = (typeof UTILISATEUR_PROFIL!=="undefined") ? UTILISATEUR_PROFIL.localisation : {};
  let natsData = (typeof UTILISATEUR_PROFIL!=="undefined") ? UTILISATEUR_PROFIL.nationalites : [];
  try {
    const me = await fetchCurrentUser();
    if(me){
      const titleEl = document.getElementById("dash-title");
      if(titleEl) titleEl.textContent = `Tableau de bord de ${me.nom}`;
      const profilR = await api("GET", `/profil/${me.id}`);
      if(profilR.profil?.profil?.localisation) locData = profilR.profil.profil.localisation;
      if(profilR.profil?.profil?.nationalites) natsData = profilR.profil.profil.nationalites;
    }
  } catch(e){}

  /* — Localisation — */
  const locEl = document.getElementById("dv-localisation");
  _renderLoc(locEl, locData);
  const btnLoc = document.getElementById("btn-edit-loc");
  if(btnLoc){
    btnLoc.onclick = ()=>{
      if(btnLoc.dataset.open==="1"){ _renderLoc(locEl, locData); btnLoc.textContent="Modifier ma localisation"; btnLoc.dataset.open=""; return; }
      btnLoc.dataset.open="1"; btnLoc.textContent="✕ Fermer";
      const inp = (id,label,val,ph)=>`<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">${label}</label><input id="${id}" type="text" value="${val||''}" placeholder="${ph}" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;padding:0 10px;font-family:inherit;font-size:13px;box-sizing:border-box;"></div>`;
      locEl.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
        ${inp("loc-ville","Ville",locData.ville,"Toulouse")}
        ${inp("loc-region","Région",locData.region,"Occitanie")}
        ${inp("loc-pays","Pays",locData.pays,"France")}
        ${inp("loc-cp","Code postal",locData.code_postal,"31000")}
      </div>
      <div style="margin-top:10px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Visibilité</label>
        <select id="loc-vis" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;padding:0 10px;font-family:inherit;font-size:13px;">
          <option ${(locData.visibilite||"").includes("institutions")?"selected":""}>Visible par les institutions et les initiatives suivies</option>
          <option ${(locData.visibilite||"").includes("Publi")?"selected":""}>Publique</option>
          <option ${(locData.visibilite||"").includes("Privée")?"selected":""}>Privée (uniquement moi)</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button id="loc-save" class="btn btn-sm" style="background:var(--orange);color:#fff;">Enregistrer</button>
        <button id="loc-cancel" class="btn btn-outline btn-sm">Annuler</button>
      </div>
      <p id="loc-msg" style="display:none;margin-top:8px;font-size:13px;"></p>`;
      document.getElementById("loc-save").onclick=async()=>{
        const msg=document.getElementById("loc-msg");
        const nl={ville:document.getElementById("loc-ville").value.trim(),region:document.getElementById("loc-region").value.trim(),pays:document.getElementById("loc-pays").value.trim(),code_postal:document.getElementById("loc-cp").value.trim(),visibilite:document.getElementById("loc-vis").value};
        try{ await api("PUT","/profil",{ville:nl.ville,pays:nl.pays,profil:{localisation:nl}}); Object.assign(locData,nl); _renderLoc(locEl,locData); btnLoc.textContent="Modifier ma localisation"; btnLoc.dataset.open=""; }
        catch(e){ msg.style.cssText="display:block;color:red;"; msg.textContent="Erreur lors de la sauvegarde."; }
      };
      document.getElementById("loc-cancel").onclick=()=>{ _renderLoc(locEl,locData); btnLoc.textContent="Modifier ma localisation"; btnLoc.dataset.open=""; };
    };
  }

  /* — Nationalités — */
  const natEl = document.getElementById("dv-nationalites");
  _renderNats(natEl, natsData);
  const btnNat = document.getElementById("btn-add-nat");
  if(btnNat){
    btnNat.onclick=()=>{
      const existing=document.getElementById("nat-form-inline");
      if(existing){ existing.remove(); btnNat.textContent="+ Ajouter un justificatif"; return; }
      btnNat.textContent="✕ Fermer";
      const form=document.createElement("div"); form.id="nat-form-inline";
      form.style.cssText="margin-top:12px;padding:14px;background:#f8faff;border:1px solid var(--border);border-radius:8px;";
      form.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Pays de nationalité</label><input id="nat-pays" type="text" placeholder="ex : Sénégal" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;padding:0 10px;font-family:inherit;font-size:13px;box-sizing:border-box;"></div>
        <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Type de justificatif</label>
          <select id="nat-doc" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;padding:0 10px;font-family:inherit;font-size:13px;">
            <option>Carte Nationale d'Identité</option><option>Passeport</option><option>Certificat de nationalité</option>
          </select></div>
      </div>
      <p style="font-size:12px;color:var(--muted);margin:0 0 10px;">📎 Déclaration simulée — en production un justificatif numérique serait requis.</p>
      <div style="display:flex;gap:8px;"><button id="nat-save" class="btn btn-sm" style="background:var(--orange);color:#fff;">Déclarer</button><button id="nat-cancel" class="btn btn-outline btn-sm">Annuler</button></div>
      <p id="nat-msg" style="display:none;margin-top:8px;font-size:13px;"></p>`;
      btnNat.after(form);
      document.getElementById("nat-save").onclick=async()=>{
        const pays=document.getElementById("nat-pays").value.trim();
        const msg=document.getElementById("nat-msg");
        if(!pays){ msg.style.cssText="display:block;color:red;"; msg.textContent="Veuillez saisir un pays."; return; }
        const newNat={pays,document:document.getElementById("nat-doc").value,statut:"En attente de vérification"};
        const updated=[...natsData,newNat];
        try{ await api("PUT","/profil",{profil:{nationalites:updated}}); natsData.push(newNat); _renderNats(natEl,natsData); form.remove(); btnNat.textContent="+ Ajouter un justificatif"; }
        catch(e){ msg.style.cssText="display:block;color:red;"; msg.textContent="Erreur lors de la sauvegarde."; }
      };
      document.getElementById("nat-cancel").onclick=()=>{ form.remove(); btnNat.textContent="+ Ajouter un justificatif"; };
    };
  }

  /* — Financements (données démo) — */
  const fin = document.getElementById("dv-financements");
  if(fin && typeof MES_FINANCEMENTS!=="undefined"){
    fin.innerHTML = MES_FINANCEMENTS.map(f=>`
      <div class="flex-between" style="padding:10px 0;border-bottom:1px solid var(--border);">
        <span>💚 ${f.campagne}</span>
        <span style="color:var(--orange);font-weight:700;">${f.montant} €</span>
        <span style="color:var(--muted);font-size:12px;">${f.date}</span>
      </div>`).join("");
  }

  /* — Collaborations (données démo) — */
  const collab = document.getElementById("dv-collaborations");
  if(collab && typeof MES_COLLABORATIONS!=="undefined"){
    collab.innerHTML = MES_COLLABORATIONS.map(c=>`
      <div class="init-card" style="margin-bottom:10px;">
        <div class="init-logo">${initials(c.titre)}</div>
        <div class="meta"><h4>${c.titre}</h4><p>${c.role} · avec ${c.avec}</p></div>
        <span class="tag">${c.statut}</span>
      </div>`).join("");
  }

  /* — Recherches (données démo) — */
  const rl = document.getElementById("dv-recherches");
  if(rl && typeof RECHERCHES!=="undefined"){
    rl.innerHTML = RECHERCHES.map(r=>`
      <div class="flex-between" style="padding:12px 0;border-bottom:1px solid var(--border);">
        <span>🔍 Recherche : ${r.requete}</span>
        <span style="color:var(--muted);font-size:12.5px;">${r.date}</span>
      </div>`).join("");
  }

  /* — Conversations (API) — */
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
    } catch(e){ /* serveur indisponible */ }
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
/* ================================================================
   SYSTÈME @MENTIONS — Autocomplete universel + rendu cliquable
   ================================================================ */

/* Styles injectés une seule fois */
(function injectMentionStyles(){
  if(document.getElementById("mention-style")) return;
  const s = document.createElement("style");
  s.id = "mention-style";
  s.textContent = `
.mention-dropdown {
  position:fixed; z-index:99999;
  background:#fff; border:1px solid #E5E7EB; border-radius:12px;
  box-shadow:0 8px 30px rgba(0,0,0,.14);
  min-width:300px; max-height:260px; overflow-y:auto;
  animation:mentionIn .12s ease;
}
@keyframes mentionIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }
.mention-item {
  display:flex; align-items:center; gap:12px;
  padding:10px 14px; cursor:pointer; transition:background .12s;
}
.mention-item:hover, .mention-item.active { background:#EEF2FF; }
.mention-item:not(:last-child) { border-bottom:1px solid #F3F4F6; }
.mi-av { width:38px; height:38px; border-radius:50%; flex-shrink:0; overflow:hidden; }
.mi-av.initiative { border-radius:8px; }
.mi-nom { font-size:13px; font-weight:700; color:#0D1B2A; }
.mi-sub { font-size:11px; color:#9CA3AF; margin-top:2px; }
.mi-badge {
  margin-left:auto; font-size:10px; font-weight:800; padding:2px 8px;
  border-radius:99px; white-space:nowrap;
}
.mi-badge.user { background:#EEF2FF; color:#4338CA; }
.mi-badge.initiative { background:#ECFDF5; color:#059669; }
a.mention-link {
  color:#4338CA; font-weight:700; text-decoration:none;
  border-radius:3px; padding:0 1px;
}
a.mention-link:hover { text-decoration:underline; }
  `;
  document.head.appendChild(s);
})();

class MentionPicker {
  constructor(textarea) {
    this.ta        = textarea;
    this.dropdown  = null;
    this.results   = [];
    this.activeIdx = 0;
    this.triggerPos = -1;
    this._debounce  = null;
    this._bind();
  }

  _bind() {
    this.ta.addEventListener("input",   () => this._onInput());
    this.ta.addEventListener("keydown", e  => this._onKey(e));
    this.ta.addEventListener("blur",    () => setTimeout(() => this._close(), 150));
  }

  _onInput() {
    const val  = this.ta.value;
    const pos  = this.ta.selectionStart;
    const before = val.slice(0, pos);
    // Capture @ + word chars (lettres, chiffres, accents, tirets)
    const m = before.match(/@([\wÀ-ž-]{1,40})$/);
    if (m) {
      this.triggerPos = before.lastIndexOf("@");
      clearTimeout(this._debounce);
      this._debounce = setTimeout(() => this._search(m[1]), 200);
    } else {
      this._close();
    }
  }

  async _search(q) {
    try {
      const r = await api("GET", `/mentions?q=${encodeURIComponent(q)}`);
      this.results   = r.results || [];
      this.activeIdx = 0;
      if (this.results.length) this._show();
      else this._close();
    } catch { this._close(); }
  }

  _show() {
    this._close();
    const rect = this.ta.getBoundingClientRect();
    const div  = document.createElement("div");
    div.className = "mention-dropdown";
    // Position sous le textarea (fixed = relatif au viewport, pas au document)
    const top  = rect.bottom + 4;
    const left = rect.left;
    div.style.top  = top  + "px";
    div.style.left = left + "px";
    // Corrige si dépasse à droite
    div.style.maxWidth = Math.min(360, window.innerWidth - left - 12) + "px";

    this.results.forEach((r, i) => {
      const item = document.createElement("div");
      item.className = "mention-item" + (i === 0 ? " active" : "");
      const avHtml = r.photo_url
        ? `<img src="${r.photo_url}" alt="${r.nom}" style="width:38px;height:38px;object-fit:cover;border-radius:${r.type==="initiative"?"8px":"50%"};">`
        : photoAvatar(r.nom, 38, r.type === "initiative" ? "initiative" : "user");
      item.innerHTML = `
        <div class="mi-av ${r.type === "initiative" ? "initiative" : ""}">${avHtml}</div>
        <div style="flex:1;min-width:0;">
          <div class="mi-nom">${_escM(r.nom)}</div>
          <div class="mi-sub">📍 ${_escM(r.pays || "—")}</div>
        </div>
        <span class="mi-badge ${r.type}">${r.type === "initiative" ? "Initiative" : _escM(r.type_label)}</span>`;
      item.addEventListener("mouseenter", () => { this.activeIdx = i; this._highlight(); });
      item.addEventListener("mousedown",  e => { e.preventDefault(); this._select(i); });
      div.appendChild(item);
    });

    document.body.appendChild(div);
    this.dropdown = div;
  }

  _highlight() {
    if (!this.dropdown) return;
    [...this.dropdown.children].forEach((el, i) => {
      el.classList.toggle("active", i === this.activeIdx);
    });
  }

  _onKey(e) {
    if (!this.dropdown) return;
    if (e.key === "ArrowDown")  { e.preventDefault(); this.activeIdx = Math.min(this.activeIdx + 1, this.results.length - 1); this._highlight(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); this.activeIdx = Math.max(this.activeIdx - 1, 0); this._highlight(); }
    else if (e.key === "Enter" || e.key === "Tab") { if (this.results.length) { e.preventDefault(); this._select(this.activeIdx); } }
    else if (e.key === "Escape") { this._close(); }
  }

  _select(idx) {
    const r = this.results[idx];
    if (!r) return;
    const val    = this.ta.value;
    const pos    = this.ta.selectionStart;
    const before = val.slice(0, this.triggerPos);
    const after  = val.slice(pos);
    const token  = `@[${r.nom}](${r.type === "initiative" ? "i" : "u"}:${r.id}) `;
    this.ta.value = before + token + after;
    const newPos  = before.length + token.length;
    this.ta.setSelectionRange(newPos, newPos);
    this.ta.dispatchEvent(new Event("input", { bubbles: true }));
    this._close();
  }

  _close() {
    if (this.dropdown) { this.dropdown.remove(); this.dropdown = null; }
    // Ne pas vider this.results ici — _show() lit results juste après _close()
  }

  destroy() { this._close(); }
}

/* Mini-escape pour le HTML des items du dropdown (pas XSS-critique mais propre) */
function _escM(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* Transforme @[Nom](u:1) ou @[Nom](i:5) en <a> cliquable */
function renderMentions(rawText) {
  const parts = [];
  let last = 0;
  const re  = /@\[([^\]]+)\]\(([ui]):(\d+)\)/g;
  let m;
  while ((m = re.exec(rawText)) !== null) {
    // Échappe le texte avant la mention
    if (m.index > last) parts.push(_escTxt(rawText.slice(last, m.index)));
    const nom  = m[1], type = m[2], id = m[3];
    const href = type === "i" ? `initiative.html?id=${id}` : `profil.html?id=${id}`;
    parts.push(`<a href="${href}" class="mention-link">@${_escM(nom)}</a>`);
    last = m.index + m[0].length;
  }
  if (last < rawText.length) parts.push(_escTxt(rawText.slice(last)));
  return parts.join("");
}

/* Échappe le texte ordinaire (préserve les sauts de ligne → <br>) */
function _escTxt(s) {
  return String(s||"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")
    .replace(/\n/g,"<br>");
}

/* ================================================================
   FIL D'ACTUALITÉ — Compositeur riche + rendu enrichi
   ================================================================ */
async function initFilActualite(){
  const el = document.getElementById("feed-list");
  if(!el) return;

  const CATS = ["Diaspora","Entrepreneuriat","Investissement","Culture","Initiatives citoyennes","Formation","Santé","Technologie","Agriculture","Autre"];
  const TYPE_ICONS = { texte:"📝", article:"📰", photo:"📷", video:"🎥" };
  let posts = [];
  let currentFilter = "Tous";
  let me = null;

  // --- CHARGEMENT INITIAL ---
  try {
    [{ posts }, me] = await Promise.all([
      api("GET","/fil"),
      fetchCurrentUser().catch(()=>null)
    ]);
  } catch(e) {
    el.innerHTML = `<div class="empty">Impossible de contacter le serveur.</div>`;
    return;
  }

  // ============================================================
  // COMPOSITEUR RICHE
  // ============================================================
  const pubBox = document.getElementById("fil-publish");
  if(pubBox){
    if(!me){
      pubBox.innerHTML = `<div class="notice" style="margin:0;">
        <a href="login.html">Connectez-vous</a> pour publier sur le fil.
      </div>`;
    } else {
      // Inject composer styles once
      if(!document.getElementById("composer-style")){
        const st = document.createElement("style");
        st.id = "composer-style";
        st.textContent = `
.composer { background:#fff; border-radius:14px; overflow:hidden; }
.composer-trigger {
  display:flex; align-items:center; gap:12px;
  padding:14px 16px; cursor:pointer;
}
.composer-trigger .ct-av {
  width:42px; height:42px; border-radius:50%; flex-shrink:0; overflow:hidden;
}
.composer-trigger .ct-ph {
  flex:1; background:#F3F4F6; border-radius:99px; padding:10px 16px;
  font-size:14px; color:#9CA3AF; border:1px solid #E5E7EB;
  cursor:pointer; text-align:left; transition:border-color .2s;
}
.composer-trigger .ct-ph:hover { border-color:#6B7280; }
.composer-type-bar {
  display:flex; border-top:1px solid #F3F4F6; padding:4px 8px;
}
.ctype-btn {
  flex:1; display:flex; align-items:center; justify-content:center; gap:5px;
  padding:9px 4px; border:none; background:none; cursor:pointer;
  font-size:12px; font-weight:700; color:#6B7280; border-radius:8px;
  transition:all .18s;
}
.ctype-btn:hover, .ctype-btn.active { background:#EEF2FF; color:#4338CA; }

/* Formulaire plein */
.composer-form {
  padding:16px; border-top:1px solid #F3F4F6; display:none;
}
.composer-form.open { display:block; }
.composer-head {
  display:flex; align-items:center; gap:10px; margin-bottom:12px;
}
.composer-head .ch-av { width:40px; height:40px; border-radius:50%; flex-shrink:0; overflow:hidden; }
.composer-head .ch-name { font-weight:700; font-size:14px; }
.composer-head .ch-cat select {
  margin-left:8px; font-size:12px; border:1px solid #E5E7EB;
  border-radius:6px; padding:4px 8px; background:#F9FAFB;
}
.comp-ta {
  width:100%; box-sizing:border-box; border:none; font-size:15px;
  font-family:inherit; line-height:1.6; resize:none; outline:none;
  min-height:80px; color:#111827; background:transparent;
}
.article-titre-inp {
  width:100%; box-sizing:border-box; font-size:18px; font-weight:700;
  border:none; border-bottom:2px solid #E5E7EB; outline:none; padding:4px 0;
  margin-bottom:12px; font-family:inherit; color:#111827; background:transparent;
}
.article-titre-inp::placeholder { color:#D1D5DB; }
.comp-media-zone {
  border:2px dashed #E5E7EB; border-radius:10px; padding:28px;
  text-align:center; cursor:pointer; transition:all .2s; margin-bottom:12px;
  position:relative;
}
.comp-media-zone:hover { border-color:#4338CA; background:#EEF2FF; }
.comp-media-zone input[type=file] {
  position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%;
}
.comp-media-zone .mz-icon { font-size:32px; margin-bottom:8px; display:block; }
.comp-media-zone .mz-label { font-size:13px; color:#6B7280; }
.comp-preview { margin-bottom:12px; position:relative; }
.comp-preview img, .comp-preview video {
  width:100%; max-height:360px; object-fit:cover; border-radius:10px; display:block;
}
.comp-preview .prev-del {
  position:absolute; top:8px; right:8px; background:rgba(0,0,0,.5); color:#fff;
  border:none; border-radius:50%; width:28px; height:28px; cursor:pointer;
  font-size:14px; display:flex; align-items:center; justify-content:center;
}
.comp-video-info {
  background:#F0FDF4; border:1px solid #BBF7D0; border-radius:8px;
  padding:10px 14px; margin-bottom:12px; font-size:13px; color:#15803D;
}
.comp-video-err {
  background:#FEF2F2; border:1px solid #FECACA; border-radius:8px;
  padding:10px 14px; margin-bottom:12px; font-size:13px; color:#DC2626;
}
.composer-actions {
  display:flex; align-items:center; justify-content:space-between;
  padding-top:12px; border-top:1px solid #F3F4F6; margin-top:12px;
}
.comp-charcount { font-size:12px; color:#9CA3AF; }
.comp-charcount.warn { color:#F59E0B; }
.comp-charcount.over { color:#EF4444; }
.btn-publish {
  background:#4338CA; color:#fff; border:none; border-radius:8px;
  padding:9px 24px; font-size:14px; font-weight:700; cursor:pointer;
  transition:background .18s;
}
.btn-publish:hover { background:#3730A3; }
.btn-publish:disabled { background:#C7D2FE; cursor:not-allowed; }
.comp-cancel {
  background:none; border:1px solid #E5E7EB; border-radius:8px;
  padding:9px 14px; font-size:13px; cursor:pointer; color:#6B7280;
}
/* POST CARDS RICHES */
.feed-post { background:#fff; border-radius:14px; margin-bottom:14px; overflow:hidden; border:1px solid #E5E7EB; }
.fp-head { display:flex; align-items:flex-start; gap:12px; padding:14px 16px 10px; }
.fp-av { width:44px; height:44px; border-radius:50%; flex-shrink:0; overflow:hidden; }
.fp-meta { flex:1; min-width:0; }
.fp-nom { font-weight:700; font-size:14px; color:#0D1B2A; }
.fp-sub { font-size:12px; color:#9CA3AF; margin-top:2px; }
.fp-cat { background:#EEF2FF; color:#4338CA; border-radius:99px; padding:3px 10px; font-size:11px; font-weight:700; white-space:nowrap; }
.fp-body { padding:0 16px 12px; }
.fp-text { font-size:14px; color:#374151; line-height:1.65; white-space:pre-wrap; margin:0 0 10px; }
.fp-img { width:100%; max-height:420px; object-fit:cover; display:block; margin-bottom:2px; }
.fp-video { width:100%; max-height:420px; border-radius:0; display:block; background:#000; }
.fp-article-titre { font-size:18px; font-weight:800; color:#0D1B2A; margin:0 0 8px; line-height:1.3; }
.fp-article-body { font-size:14px; color:#374151; line-height:1.7; white-space:pre-wrap; }
.fp-article-more { color:#4338CA; font-size:13px; font-weight:700; cursor:pointer; margin-top:6px; display:inline-block; }
.fp-stats { padding:6px 16px; font-size:12px; color:#9CA3AF; display:flex; gap:14px; border-top:1px solid #F3F4F6; }
.fp-actions { display:flex; border-top:1px solid #F3F4F6; }
.fp-btn {
  flex:1; display:flex; align-items:center; justify-content:center; gap:5px;
  padding:10px 4px; font-size:13px; font-weight:600; color:#6B7280;
  background:none; border:none; cursor:pointer; border-radius:0; transition:all .18s;
}
.fp-btn:hover { background:#F9FAFB; color:#4338CA; }
.fp-btn.liked { color:#EF4444; }
.fp-btn.saved  { color:#F59E0B; }
        `;
        document.head.appendChild(st);
      }

      let currentType = "texte";
      let mediaDataUrl = null;
      let mediaFile    = null;
      let videoDuree   = null;
      let videoErreur  = false;
      const MAX_CHARS  = 3000;
      let _mentionPicker = null;

      pubBox.innerHTML = `
<div class="composer card">
  <div class="composer-trigger">
    <div class="ct-av">${photoAvatar(me.nom, 42)}</div>
    <button class="ct-ph" id="comp-open-btn">Que souhaitez-vous partager ?</button>
  </div>
  <div class="composer-type-bar">
    <button class="ctype-btn active" data-t="texte">📝 Texte</button>
    <button class="ctype-btn" data-t="article">📰 Article</button>
    <button class="ctype-btn" data-t="photo">📷 Photo</button>
    <button class="ctype-btn" data-t="video">🎥 Vidéo</button>
  </div>
  <div class="composer-form" id="comp-form">
    <div class="composer-head">
      <div class="ch-av">${photoAvatar(me.nom, 40)}</div>
      <div>
        <div class="ch-name">${me.nom}</div>
        <div class="ch-cat">
          Catégorie :
          <select id="comp-cat">
            ${CATS.map(c=>`<option value="${c}">${c}</option>`).join("")}
          </select>
        </div>
      </div>
    </div>
    <div id="comp-article-titre-wrap" style="display:none">
      <input class="article-titre-inp" id="comp-article-titre" placeholder="Titre de votre article…" maxlength="200">
    </div>
    <textarea class="comp-ta" id="comp-ta" placeholder="Exprimez-vous…" maxlength="${MAX_CHARS}"></textarea>
    <div id="comp-media-wrap"></div>
    <div class="composer-actions">
      <div class="comp-charcount" id="comp-cc">0 / ${MAX_CHARS}</div>
      <div style="display:flex;gap:8px;">
        <button class="comp-cancel" id="comp-cancel">Annuler</button>
        <button class="btn-publish" id="comp-submit" disabled>Publier</button>
      </div>
    </div>
  </div>
</div>`;

      function attachMentionPicker() {
        if (_mentionPicker) _mentionPicker.destroy();
        const ta = document.getElementById("comp-ta");
        if (ta) _mentionPicker = new MentionPicker(ta);
      }

      function switchType(t) {
        currentType  = t;
        mediaDataUrl = null; mediaFile = null; videoDuree = null; videoErreur = false;
        pubBox.querySelectorAll(".ctype-btn").forEach(b=>b.classList.toggle("active", b.dataset.t===t));
        document.getElementById("comp-form").classList.add("open");
        const articleWrap = document.getElementById("comp-article-titre-wrap");
        articleWrap.style.display = t==="article" ? "block" : "none";
        document.getElementById("comp-ta").placeholder =
          t==="texte"   ? "Partagez une idée… Tapez @ pour mentionner quelqu'un (max 3 000 car.)" :
          t==="article" ? "Rédigez le corps de votre article ici… Tapez @ pour mentionner" :
          t==="photo"   ? "Décrivez votre photo… Tapez @ pour mentionner (facultatif)" :
                          "Décrivez votre vidéo… Tapez @ pour mentionner (facultatif)";
        renderMediaZone();
        checkSubmit();
        attachMentionPicker();
      }

      function renderMediaZone() {
        const wrap = document.getElementById("comp-media-wrap");
        if(currentType === "texte" || currentType === "article") { wrap.innerHTML=""; return; }
        if(mediaDataUrl) {
          wrap.innerHTML = `<div class="comp-preview">
            ${currentType==="photo"
              ? `<img src="${mediaDataUrl}" alt="Aperçu">`
              : `<video src="${mediaDataUrl}" controls class="fp-video" style="border-radius:10px;"></video>`}
            <button class="prev-del" onclick="clearMedia()">✕</button>
          </div>
          ${videoDuree ? `<div class="comp-video-info">✅ Durée : ${Math.floor(videoDuree/60)}min ${Math.round(videoDuree%60)}s — dans la limite autorisée (2 min)</div>` : ""}
          ${videoErreur ? `<div class="comp-video-err">⛔ Vidéo trop longue — maximum 2 minutes autorisé</div>` : ""}`;
        } else {
          const accept = currentType==="photo" ? "image/*" : "video/*";
          const icon   = currentType==="photo" ? "📷" : "🎥";
          const label  = currentType==="photo" ? "Cliquez ou glissez une photo (JPG, PNG, GIF, WebP)" : "Cliquez ou glissez une vidéo (MP4, WebM — max 2 min)";
          wrap.innerHTML = `<div class="comp-media-zone" id="comp-dropzone">
            <input type="file" accept="${accept}" id="comp-file-inp">
            <span class="mz-icon">${icon}</span>
            <div class="mz-label">${label}</div>
          </div>`;
          document.getElementById("comp-file-inp").addEventListener("change", handleFileSelect);
        }
      }

      window.clearMedia = function() {
        mediaDataUrl=null; mediaFile=null; videoDuree=null; videoErreur=false;
        renderMediaZone(); checkSubmit();
      };

      function handleFileSelect(e) {
        const file = e.target.files[0];
        if(!file) return;
        mediaFile = file;
        const reader = new FileReader();
        reader.onload = ev => {
          mediaDataUrl = ev.target.result;
          if(currentType==="video") {
            const vid = document.createElement("video");
            vid.src = mediaDataUrl;
            vid.addEventListener("loadedmetadata", () => {
              videoDuree = vid.duration;
              videoErreur = vid.duration > 120;
              renderMediaZone(); checkSubmit();
            });
          } else {
            renderMediaZone(); checkSubmit();
          }
        };
        reader.readAsDataURL(file);
      }

      function checkSubmit() {
        const ta    = document.getElementById("comp-ta");
        const titre = document.getElementById("comp-article-titre");
        const btn   = document.getElementById("comp-submit");
        const cc    = document.getElementById("comp-cc");
        const len   = (ta?.value||"").length;
        if(cc){ cc.textContent=`${len} / ${MAX_CHARS}`; cc.className="comp-charcount"+(len>MAX_CHARS*0.9?" warn":"")+(len>MAX_CHARS?" over":""); }
        let ok = false;
        if(currentType==="texte")   ok = len > 0 && len <= MAX_CHARS;
        if(currentType==="article") ok = (titre?.value||"").trim().length > 0;
        if(currentType==="photo")   ok = !!mediaDataUrl;
        if(currentType==="video")   ok = !!mediaDataUrl && !videoErreur;
        if(btn) btn.disabled = !ok;
      }

      document.getElementById("comp-ta")?.addEventListener("input", checkSubmit);
      document.getElementById("comp-article-titre")?.addEventListener("input", checkSubmit);

      document.getElementById("comp-open-btn")?.addEventListener("click", ()=>{
        document.getElementById("comp-form").classList.add("open");
        const ta = document.getElementById("comp-ta");
        ta.focus();
        attachMentionPicker();
      });

      pubBox.querySelectorAll(".ctype-btn").forEach(b=>{
        b.addEventListener("click", ()=>switchType(b.dataset.t));
      });

      document.getElementById("comp-cancel")?.addEventListener("click", ()=>{
        document.getElementById("comp-form").classList.remove("open");
        document.getElementById("comp-ta").value="";
        if(document.getElementById("comp-article-titre")) document.getElementById("comp-article-titre").value="";
        mediaDataUrl=null; mediaFile=null; videoDuree=null; videoErreur=false;
        renderMediaZone(); checkSubmit();
      });

      document.getElementById("comp-submit")?.addEventListener("click", async ()=>{
        const btn  = document.getElementById("comp-submit");
        const ta   = document.getElementById("comp-ta");
        const cat  = document.getElementById("comp-cat").value;
        const titre = (document.getElementById("comp-article-titre")?.value||"").trim();
        btn.disabled=true; btn.textContent="Publication…";

        const payload = {
          pub_type: currentType,
          categorie: cat,
          contenu: ta.value.trim(),
        };
        if(currentType==="article"){ payload.article_titre=titre; payload.article_contenu=ta.value.trim(); }
        if(currentType==="photo" && mediaDataUrl)  payload.media_url = mediaDataUrl;
        if(currentType==="video" && mediaDataUrl){ payload.media_url=mediaDataUrl; payload.video_duree=Math.round(videoDuree); }

        try {
          const res = await api("POST","/fil", payload);
          // Prépend le nouveau post
          if(res.post){
            const np = { ...res.post, reactions:{} };
            posts.unshift(np);
          }
          // Reset
          ta.value="";
          if(document.getElementById("comp-article-titre")) document.getElementById("comp-article-titre").value="";
          mediaDataUrl=null; mediaFile=null; videoDuree=null; videoErreur=false;
          document.getElementById("comp-form").classList.remove("open");
          renderMediaZone();
          render(currentFilter);
        } catch(err){
          alert(err.message||"Erreur lors de la publication.");
        } finally {
          btn.disabled=false; btn.textContent="Publier";
        }
      });
    }
  }

  // ============================================================
  // RENDU DES POSTS
  // ============================================================
  function fmtDate(str){
    try{ return new Date(str.replace(" ","T")+"Z").toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}); }
    catch{ return str||""; }
  }

  function escH(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function renderPost(p){
    const likes   = (p.reactions&&p.reactions.like)||0;
    const typeIcon = TYPE_ICONS[p.pub_type||p.type] || "📝";

    let mediaHtml = "";
    if(p.media_type==="image" && p.media_url)
      mediaHtml = `<img class="fp-img" src="${escH(p.media_url)}" alt="Photo" loading="lazy">`;
    else if(p.media_type==="video" && p.media_url)
      mediaHtml = `<video class="fp-video" src="${escH(p.media_url)}" controls preload="metadata" style="margin-bottom:2px;"></video>`;

    let bodyHtml = "";
    if(p.pub_type==="article" && p.article_titre){
      const body    = p.article_contenu || p.contenu || "";
      const preview = body.length > 300 ? body.slice(0,300)+"…" : body;
      bodyHtml = `
        <h3 class="fp-article-titre">${escH(p.article_titre)}</h3>
        <div class="fp-article-body" id="art-body-${p.id}">${renderMentions(preview)}</div>
        ${body.length>300?`<span class="fp-article-more" onclick="expandArticleMention(${p.id},this,${JSON.stringify(body)})">Lire la suite →</span>`:""}`;
    } else {
      const text    = p.contenu || "";
      const preview = text.length > 400 ? text.slice(0,400)+"…" : text;
      bodyHtml = `<div class="fp-text">${renderMentions(preview)}${text.length>400?`<span class="fp-article-more" onclick="expandTextMention(${p.id},this,${JSON.stringify(text)})"> Lire la suite →</span>`:""}</div>`;
    }

    return `<div class="feed-post" id="fp-${p.id}">
      <div class="fp-head">
        <div class="fp-av">${photoAvatar(p.auteur_nom||"?",44)}</div>
        <div class="fp-meta">
          <div class="fp-nom">${escH(p.auteur_nom||"Anonyme")}</div>
          <div class="fp-sub">${typeIcon} ${p.pub_type||p.type||"Publication"} · ${fmtDate(p.created_at)}</div>
        </div>
        <span class="fp-cat">${escH(p.categorie||"")}</span>
      </div>
      ${mediaHtml ? `<div>${mediaHtml}</div>` : ""}
      <div class="fp-body">${bodyHtml}</div>
      <div class="fp-stats">
        <span id="fp-likes-${p.id}">❤️ ${likes}</span>
        <span>💬 ${Math.floor(Math.random()*8)} commentaires</span>
      </div>
      <div class="fp-actions">
        <button class="fp-btn feed-react" data-id="${p.id}" data-likes="${likes}">❤️ J'aime</button>
        <button class="fp-btn">💬 Commenter</button>
        <button class="fp-btn" onclick="navigator.clipboard&&navigator.clipboard.writeText(location.href)">↗️ Partager</button>
        <button class="fp-btn" onclick="this.classList.toggle('saved');this.textContent=this.classList.contains('saved')?'🔖 Enregistré':'🔖 Enregistrer'">🔖 Enregistrer</button>
      </div>
    </div>`;
  }

  window.expandArticleMention = function(id,btn,raw){
    const el2=document.getElementById("art-body-"+id);
    if(el2){ el2.innerHTML=renderMentions(raw); btn.remove(); }
  };
  window.expandTextMention = function(id,btn,raw){
    const p=btn.closest(".fp-text");
    if(p){ p.innerHTML=renderMentions(raw); }
  };

  function render(filterType){
    currentFilter = filterType||"Tous";
    const items = currentFilter!=="Tous" ? posts.filter(p=>{
      const t = (p.pub_type||p.type||"").toLowerCase();
      const filterMap = { "utilisateur":"texte","association":"article","entreprise":"photo","institution":"video" };
      return t === (filterMap[currentFilter.toLowerCase()]||currentFilter.toLowerCase());
    }) : posts;
    el.innerHTML = items.length
      ? items.map(renderPost).join("")
      : `<div class="empty">Aucune publication pour ce filtre.</div>`;

    el.querySelectorAll(".feed-react").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        if(!me){ alert("Connectez-vous pour réagir."); return; }
        btn.classList.toggle("liked");
        const base = parseInt(btn.dataset.likes)||0;
        const inc  = btn.classList.contains("liked") ? 1 : 0;
        const stat = document.getElementById("fp-likes-"+btn.dataset.id);
        if(stat) stat.textContent = `❤️ ${base + inc}`;
        try { await api("POST",`/fil/${btn.dataset.id}/react`,{type:"like"}); } catch{}
      });
    });
  }

  const bar = document.getElementById("feed-filter-bar");
  if(bar){
    bar.querySelectorAll("button").forEach(b=>{
      b.addEventListener("click",()=>{
        bar.querySelectorAll("button").forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        render(b.dataset.type);
      });
    });
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
