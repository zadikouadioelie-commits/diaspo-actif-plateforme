/* ===========================================================
   DIASPO'ACTIF — Logique du prototype
   Backend réel branché via l'API /api/* (Node + SQLite).
   Les modules paiement réel restent simulés (aucune transaction réelle).
   =========================================================== */

/* ---------- PWA — enregistrement du Service Worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

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
const ROLE_LABEL_FR = { utilisateur: "Utilisateur", initiative: "Initiative", administrateur: "Super Administrateur", collectivite: "Collectivité" };

/* ---------- Utilitaires globaux ---------- */
function escH(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* ========== BADGE INITIATIVE VÉRIFIÉE ========== */
const CERTIF_NIVEAUX = {
  verifie:    { icon: "🛡️", label: "Initiative Vérifiée", cls: "certif-verifie" },
  reference:  { icon: "⭐", label: "Initiative de Référence", cls: "certif-reference" },
  partenaire: { icon: "🤝", label: "Partenaire Certifié", cls: "certif-partenaire" },
};

/* Retourne le HTML du badge (cliquable → modale d'info) */
function badgeCertif(certif, opts = {}) {
  if (!certif || certif.statut !== "actif") return "";
  const n = CERTIF_NIVEAUX[certif.niveau] || CERTIF_NIVEAUX.verifie;
  const size = opts.small ? "certif-badge-sm" : "";
  return `<button class="certif-badge ${n.cls} ${size}" onclick="event.stopPropagation();showCertifModal('${certif.niveau}')" title="${n.label} Diaspo'Actif">${n.icon} ${n.label} <span class="certif-da">Diaspo'Actif</span></button>`;
}

/* Modale d'information du badge */
window.showCertifModal = function(niveau) {
  const n = CERTIF_NIVEAUX[niveau] || CERTIF_NIVEAUX.verifie;
  const existing = document.getElementById("certif-modal-overlay");
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.id = "certif-modal-overlay";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:440px;">
      <button class="modal-close" onclick="document.getElementById('certif-modal-overlay').remove()">✕</button>
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:48px;margin-bottom:8px;">${n.icon}</div>
        <div class="certif-badge ${n.cls}" style="font-size:15px;padding:6px 16px;cursor:default;display:inline-flex;">${n.icon} ${n.label} <span class="certif-da">Diaspo'Actif</span></div>
      </div>
      <p style="font-size:14px;line-height:1.7;color:var(--text);margin:0;">
        Cette initiative a fait l'objet d'un processus de vérification réalisé par <strong>Diaspo'Actif</strong> portant notamment sur son <strong>activité</strong>, sa <strong>réactivité</strong>, ses <strong>réalisations</strong>, ses <strong>témoignages</strong> et différents éléments de contrôle jugés nécessaires.
      </p>
      <p style="font-size:12px;color:var(--muted);margin:12px 0 0;line-height:1.6;">
        Ce badge est attribué exclusivement par l'équipe Diaspo'Actif, sans aucune contrepartie financière. Il peut être suspendu ou retiré à tout moment.
      </p>
    </div>`;
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

/* Injection CSS du badge */
(function injectCertifCSS() {
  const s = document.createElement("style");
  s.textContent = `
    .certif-badge {
      display:inline-flex;align-items:center;gap:5px;border:none;
      border-radius:20px;font-size:12px;font-weight:700;
      padding:3px 10px;cursor:pointer;transition:opacity .15s;
      white-space:nowrap;line-height:1.4;
    }
    .certif-badge:hover { opacity:.82; }
    .certif-verifie   { background:#E0F2FE;color:#0369A1; }
    .certif-reference { background:#FEF9C3;color:#A16207; }
    .certif-partenaire{ background:#F0FDF4;color:#166534; }
    .certif-badge-sm  { font-size:10.5px;padding:2px 7px; }
    .certif-da { font-weight:400;opacity:.75;font-size:.9em; }
    /* Annuaire : badge overlay sur la carte */
    .ann-certif-wrap { position:absolute;bottom:8px;left:8px;z-index:2; }
  `;
  document.head.appendChild(s);
})();
/* ========== FIN BADGE ========== */

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

/* Styles du dropdown notifications (injectés une seule fois) */
function injectNotifStyles() {
  if (document.getElementById("notif-dropdown-style")) return;
  const st = document.createElement("style");
  st.id = "notif-dropdown-style";
  st.textContent = `
.notif-bell-wrap { position:relative; display:inline-flex; }
.notif-bell-btn {
  background:none; border:none; cursor:pointer; padding:6px 8px;
  border-radius:8px; color:var(--navy); line-height:1;
  display:flex; align-items:center; position:relative;
  transition:background .15s;
}
.notif-bell-btn:hover { background:#F3F4F6; }
.notif-badge {
  position:absolute; top:-4px; right:-4px;
  background:#EF4444; color:#fff; border-radius:50%;
  min-width:17px; height:17px; font-size:10px; font-weight:800;
  display:none; align-items:center; justify-content:center; padding:0 3px;
  border:2px solid #fff;
}
.notif-badge.show { display:flex; }
.notif-dropdown {
  position:absolute; top:calc(100% + 8px); right:0;
  width:340px; background:#fff; border:1px solid #E5E7EB;
  border-radius:14px; box-shadow:0 8px 32px rgba(0,0,0,.14);
  z-index:9999; overflow:hidden; display:none;
}
.notif-dropdown.open { display:block; }
.notif-dd-head {
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; border-bottom:1px solid #F3F4F6;
}
.notif-dd-title { font-size:14px; font-weight:800; color:#0D1B2A; }
.notif-dd-markall {
  font-size:11.5px; color:#4338CA; cursor:pointer; font-weight:600;
  background:none; border:none; padding:0;
}
.notif-dd-markall:hover { text-decoration:underline; }
.notif-list { max-height:360px; overflow-y:auto; }
.notif-item {
  display:flex; gap:11px; padding:12px 16px; cursor:pointer;
  border-bottom:1px solid #F9FAFB; transition:background .13s;
  text-decoration:none; color:inherit;
}
.notif-item:hover { background:#F9FAFB; }
.notif-item.unread { background:#EEF2FF; }
.notif-item.unread:hover { background:#E0E7FF; }
.notif-icon {
  width:36px; height:36px; border-radius:50%; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-size:17px; background:#F3F4F6;
}
.notif-icon.mention { background:#EEF2FF; }
.notif-icon.reaction { background:#FEF2F2; }
.notif-icon.message  { background:#F0FDF4; }
.notif-icon.evenement { background:#FFF7ED; }
.notif-icon.validation { background:#F0FDF4; }
.notif-content { flex:1; min-width:0; }
.notif-titre { font-size:13px; font-weight:700; color:#0D1B2A; line-height:1.3; margin-bottom:2px; }
.notif-contenu { font-size:12px; color:#6B7280; line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.notif-date { font-size:11px; color:#9CA3AF; margin-top:3px; }
.notif-unread-dot { width:8px; height:8px; border-radius:50%; background:#4338CA; flex-shrink:0; margin-top:4px; }
.notif-empty { text-align:center; padding:28px 16px; color:#9CA3AF; font-size:13px; }
.notif-dd-footer { border-top:1px solid #F3F4F6; text-align:center; padding:10px; }
.notif-dd-footer a { font-size:12.5px; color:#4338CA; font-weight:700; text-decoration:none; }
.notif-dd-footer a:hover { text-decoration:underline; }
  `;
  document.head.appendChild(st);
}

const NOTIF_ICONS = {
  mention:    "🔔",
  reaction:   "❤️",
  message:    "💬",
  evenement:  "📅",
  validation: "✅",
  abonnement: "⭐",
  reunion_invite: "📹",
};

function notifUrl(n) {
  const d = (typeof n.data === "object" ? n.data : null) || {};
  if (d.post_id)          return `fil-actualite.html#fp-${d.post_id}`;
  if (d.conversation_id)  return `messagerie.html?conv=${d.conversation_id}`;
  if (d.evenement_id)     return `evenements.html#evt-${d.evenement_id}`;
  if (d.reunion_id)       return `reunions.html?reunion=${d.reunion_id}`;
  return "#";
}

function renderNotifItem(n) {
  const icon  = NOTIF_ICONS[n.type] || "🔔";
  const url   = notifUrl(n);
  const unread = !n.lue;
  return `<a href="${url}" class="notif-item${unread ? " unread" : ""}" data-notif-id="${n.id}" onclick="markNotifRead(${n.id})">
    <div class="notif-icon ${n.type}">${icon}</div>
    <div class="notif-content">
      <div class="notif-titre">${escapeHtml(n.titre || "")}</div>
      <div class="notif-contenu">${escapeHtml(n.contenu || "")}</div>
      <div class="notif-date">${fmtDateGlobal(n.created_at)}</div>
    </div>
    ${unread ? `<div class="notif-unread-dot"></div>` : ""}
  </a>`;
}

function escapeHtml(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function fmtDateGlobal(str){ try{ return new Date(str.replace(" ","T")+"Z").toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}); } catch{ return str||""; } }

window.markNotifRead = async function(id) {
  try { await api("PATCH", `/notifications/${id}/lire`); } catch{}
  const item = document.querySelector(`.notif-item[data-notif-id="${id}"]`);
  if (item) { item.classList.remove("unread"); item.querySelector(".notif-unread-dot")?.remove(); }
};

window.markAllNotifsRead = async function() {
  try { await api("POST", "/notifications/lire-tout"); } catch{}
  document.querySelectorAll(".notif-item.unread").forEach(el => {
    el.classList.remove("unread");
    el.querySelector(".notif-unread-dot")?.remove();
  });
  const badge = document.getElementById("notif-badge");
  if (badge) badge.classList.remove("show");
};

async function openNotifDropdown(btn) {
  const dd = document.getElementById("notif-dropdown");
  if (!dd) return;
  const isOpen = dd.classList.contains("open");
  // Ferme tous les dropdowns ouverts
  document.querySelectorAll(".notif-dropdown.open").forEach(el => el.classList.remove("open"));
  if (isOpen) return;
  dd.classList.add("open");
  dd.innerHTML = `<div class="notif-dd-head"><span class="notif-dd-title">Notifications</span></div>
    <div class="notif-list"><div class="notif-empty">Chargement…</div></div>`;
  try {
    const data = await api("GET", "/notifications?limit=20");
    const items = data.notifications || [];
    dd.innerHTML = `
      <div class="notif-dd-head">
        <span class="notif-dd-title">Notifications</span>
        <button class="notif-dd-markall" onclick="markAllNotifsRead()">Tout marquer comme lu</button>
      </div>
      <div class="notif-list">
        ${items.length ? items.map(renderNotifItem).join("") : `<div class="notif-empty">Aucune notification</div>`}
      </div>
      <div class="notif-dd-footer"><a href="#">Voir tout →</a></div>`;
    // MAJ badge
    const nb = document.getElementById("notif-badge");
    if (nb) { nb.classList.remove("show"); }
  } catch { dd.innerHTML = `<div class="notif-empty">Erreur de chargement.</div>`; }
}

// Ferme le dropdown au clic extérieur
document.addEventListener("click", e => {
  if (!e.target.closest(".notif-bell-wrap")) {
    document.querySelectorAll(".notif-dropdown.open").forEach(el => el.classList.remove("open"));
  }
});

/* ---------- Bandeau de rappel : vérification d'adresse e-mail ---------- */
function showEmailVerifBanner(user) {
  if (!user || user.email_verifie) return;
  const dismissKey = "da_verif_banner_dismiss";
  const dismissedAt = Number(localStorage.getItem(dismissKey) || 0);
  if (Date.now() - dismissedAt < 6 * 3600000) return; // re-proposer après 6h
  if (document.getElementById("email-verif-banner")) return;

  const bar = document.createElement("div");
  bar.id = "email-verif-banner";
  bar.style.cssText = "position:sticky;top:0;z-index:900;background:#FEF3C7;color:#92400E;padding:10px 16px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;";
  bar.innerHTML = `
    <span>✉️ Confirmez votre adresse e-mail pour sécuriser votre compte.</span>
    <button id="verif-resend-btn" style="background:#92400E;color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;cursor:pointer;">Renvoyer l'e-mail</button>
    <button id="verif-dismiss-btn" style="background:none;border:none;color:#92400E;font-size:16px;cursor:pointer;line-height:1;">✕</button>`;
  document.body.prepend(bar);

  document.getElementById("verif-dismiss-btn").onclick = () => {
    localStorage.setItem(dismissKey, String(Date.now()));
    bar.remove();
  };
  document.getElementById("verif-resend-btn").onclick = async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = "Envoi…";
    try {
      const r = await api("POST", "/auth/resend-verification");
      btn.textContent = r.deja_verifie ? "Déjà vérifié ✓" : "Envoyé ✓";
    } catch (err) {
      btn.textContent = "Réessayer";
      btn.disabled = false;
    }
  };
}

async function applyAuthState() {
  const el = document.getElementById("auth-area");
  if (!el) return;
  const user = await fetchCurrentUser();
  if (user) {
    injectNotifStyles();
    el.innerHTML = `
      <a href="messagerie.html" class="user-chip" style="text-decoration:none;position:relative;" title="Messagerie">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span id="msg-topbar-badge" style="display:none;position:absolute;top:-6px;right:-8px;background:var(--orange);color:#fff;border-radius:50%;width:16px;height:16px;font-size:10px;font-weight:700;align-items:center;justify-content:center;"></span>
      </a>
      <div class="notif-bell-wrap">
        <button class="notif-bell-btn" id="notif-bell-btn" title="Notifications" onclick="openNotifDropdown(this)">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span class="notif-badge" id="notif-badge"></span>
        </button>
        <div class="notif-dropdown" id="notif-dropdown"></div>
      </div>
      <a href="${ROLE_DASHBOARD[user.role] || '#'}" class="user-chip" style="text-decoration:none;">
        <div class="avatar">${photoAvatar(user.nom, 30)}</div> ${user.nom}
      </a>
      <span class="role-tag">${ROLE_LABEL_FR[user.role] || user.role}</span>
      <a href="tutoriels.html" class="da-revoir-btn" id="demo-revoir-btn" title="Centre des tutos — Tutoriels interactifs">📚 Centre des tutos</a>
      <a href="#" id="logout-link" class="btn btn-sm btn-outline">Déconnexion</a>`;
    const logout = document.getElementById("logout-link");
    if (logout) logout.addEventListener("click", async (e) => {
      e.preventDefault();
      try { await api("POST", "/auth/logout"); } catch (err) { /* ignore */ }
      window.location.href = "index.html";
    });
    // Démo : vérifier si on doit déclencher le tour guidé
    if (window.DADemo) DADemo.checkUser(user);
    // Charger le nombre de messages non lus + notifications non lues
    try {
      const [msgs, notifs] = await Promise.all([
        api("GET", "/messages/non-lus").catch(()=>({total:0})),
        api("GET", "/notifications?limit=1").catch(()=>({non_lues:0}))
      ]);
      updateTopbarBadge(msgs.total);
      const nb = document.getElementById("notif-badge");
      if (nb && notifs.non_lues > 0) {
        nb.textContent = notifs.non_lues > 9 ? "9+" : notifs.non_lues;
        nb.classList.add("show");
      }
    } catch (e) { /* silencieux */ }
    showEmailVerifBanner(user);
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

  const certifBadgeHtml = it.certif ? `<div class="ann-certif-wrap">${badgeCertif(it.certif, { small: true })}</div>` : "";
  const partenaireOfficielBadge = it.partenaire_officiel
    ? `<div style="margin-bottom:6px;"><a href="partenaires.html" style="display:inline-flex;align-items:center;gap:4px;background:#eff6ff;color:#1e40af;border:1.5px solid #bfdbfe;border-radius:99px;padding:3px 10px;font-size:10.5px;font-weight:800;text-decoration:none;" onclick="event.stopPropagation()">🏅 Partenaire Officiel Diaspo'Actif</a></div>`
    : '';
  const accredBadges = (it.accreditations||[]).map(a =>
    a === 'mobilisation_active'
      ? '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;">📢 Mobilisation</span>'
      : '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#dbeafe;color:#1e40af;border:1px solid #3b82f6;">💼 Opportunités</span>'
  ).join(' ');

  const initHref = `initiative.html?id=${encodeURIComponent(it.slug || it.id)}`;
  const profilHref = it.owner_user_id ? `profil.html?id=${encodeURIComponent(it.owner_user_id)}` : initHref;
  const vitrineHref = it.owner_user_id ? `profil.html?id=${encodeURIComponent(it.owner_user_id)}&vitrine=1` : null;
  const vitrineBtn = (it.vitrine_active && vitrineHref)
    ? `<a href="${vitrineHref}" class="ann-card-btn ann-card-btn-vitrine" onclick="event.stopPropagation()">🏬 Voir la vitrine</a>` : '';

  return `
  <div class="ann-card" onclick="window.location.href='${initHref}'" style="cursor:pointer;">
    <div class="ann-card-photo" style="position:relative;">
      <img src="${photo}" alt="${it.nom}" loading="lazy" onerror="this.src='https://picsum.photos/seed/${it.id||0}/400/240'">
      <span class="ann-cat-badge" style="background:${badge.bg};">${badge.label}</span>
      ${it.type ? `<span class="ann-type-badge">${it.type}</span>` : ''}
      ${certifBadgeHtml}
    </div>
    <div class="ann-card-body">
      <div class="ann-card-title">${it.nom}</div>
      <div class="ann-card-meta-row">
        <span class="ann-card-loc">📍 ${loc}</span>
        ${rayHtml}
      </div>
      ${origs ? `<div class="ann-card-origs">🌍 <strong>Origines :</strong> ${origs}</div>` : ''}
      <div class="ann-card-nats">🏛 <strong>Nationalités :</strong> ${nats}</div>
      ${partenaireOfficielBadge}
      ${desc ? `<div class="ann-card-desc">${desc}</div>` : ''}
      ${accredBadges ? `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">${accredBadges}</div>` : ''}
      <div class="ann-card-foot" style="flex-wrap:wrap;gap:6px;">
        ${membres}
        <a href="${profilHref}" class="ann-card-btn" onclick="event.stopPropagation()">👁 Voir le profil</a>
        ${vitrineBtn}
        ${it.owner_user_id ? `<button type="button" class="ann-card-btn" onclick="event.stopPropagation(); openAnnuaireEvents(${it.owner_user_id}, ${JSON.stringify(it.nom||'').replace(/"/g,'&quot;')})">📅 S'inscrire à un événement</button>` : ''}
      </div>
    </div>
  </div>`;
}

/* ══ Inscription à un événement depuis l'annuaire (simulation complète) ══ */
async function openAnnuaireEvents(ownerId, initNom){
  if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER) { window.location.href = 'login.html'; return; }

  // Overlay
  let ov = document.getElementById('ann-evt-overlay');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'ann-evt-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(13,27,42,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:40px 14px;';
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  ov.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:560px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;">
    <div style="background:#0D1B2A;color:#fff;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;">
      <div><div style="font-size:16px;font-weight:800;">📅 Événements ${initNom ? '· '+initNom : ''}</div>
      <div style="font-size:12px;opacity:.8;margin-top:2px;">Inscrivez-vous en un clic</div></div>
      <button onclick="document.getElementById('ann-evt-overlay').remove()" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;">×</button>
    </div>
    <div id="ann-evt-body" style="padding:18px 22px;max-height:60vh;overflow-y:auto;">
      <div style="text-align:center;color:#6B7280;padding:24px;">Chargement des événements…</div>
    </div>
  </div>`;
  document.body.appendChild(ov);

  const body = ov.querySelector('#ann-evt-body');
  try {
    const [evR, mesR] = await Promise.all([ api('GET','/evenements'), api('GET','/mes-evenements').catch(()=>({evenements:[]})) ]);
    const inscrits = new Set((mesR.evenements||[]).map(e=>e.id));
    const evts = (evR.evenements||[]).filter(e => Number(e.owner_user_id) === Number(ownerId) && e.date_evt >= new Date().toISOString().slice(0,10));
    if (!evts.length) {
      body.innerHTML = `<div style="text-align:center;color:#6B7280;padding:24px;">Aucun événement à venir pour cette initiative.</div>`;
      return;
    }
    body.innerHTML = evts.map(e => annEvtRow(e, inscrits.has(e.id))).join('');
  } catch (e) {
    body.innerHTML = `<div style="color:#D33;padding:16px;">Erreur : ${e.message}</div>`;
  }
}

function annEvtRow(e, inscrit){
  const dt = e.date_evt ? new Date(e.date_evt).toLocaleDateString('fr',{weekday:'short',day:'2-digit',month:'long',year:'numeric'}) : '';
  const lieu = [e.ville, e.pays].filter(Boolean).join(', ');
  const btn = inscrit
    ? `<button disabled style="background:#DCFCE7;color:#166534;border:none;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:700;">✓ Inscrit</button>`
    : `<button onclick="annInscrire(${e.id}, this)" style="background:#FF6B00;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer;">S'inscrire</button>`;
  return `<div id="ann-evt-${e.id}" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #F1F5F9;">
    <div style="min-width:0;">
      <div style="font-size:14px;font-weight:700;color:#0D1B2A;">${(e.titre||'').replace(/</g,'&lt;')}</div>
      <div style="font-size:12px;color:#6B7280;margin-top:3px;">📆 ${dt}${lieu ? ' · 📍 '+lieu.replace(/</g,'&lt;') : ''}${e.heure_debut ? ' · '+e.heure_debut : ''}</div>
    </div>
    <div style="flex-shrink:0;">${btn}</div>
  </div>`;
}

async function annInscrire(id, btn){
  // Validation par le Code de Sécurité Diaspo'Actif (DS-ID)
  const dsId = prompt("🔐 Pour valider votre inscription, saisissez votre Code de Sécurité Diaspo'Actif (DS-ID).\n(À générer/retrouver dans Confidentialité.)");
  if (dsId === null) return;               // annulé
  if (!dsId.trim()) { alert('Le Code de Sécurité (DS-ID) est requis.'); return; }
  btn.disabled = true; btn.textContent = '…';
  try {
    await api('POST', '/evenements/'+id+'/rejoindre', { ds_id: dsId.trim() });
    const cell = btn.parentElement;
    cell.innerHTML = `<button disabled style="background:#DCFCE7;color:#166534;border:none;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:700;">✓ Inscrit</button>`;
    if (typeof showToast === 'function') showToast('✅ Inscription confirmée !');
  } catch (e) {
    btn.disabled = false; btn.textContent = "S'inscrire";
    alert(e.message || 'Erreur lors de l\'inscription.');
  }
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
    list.innerHTML = `<div class="empty">Impossible de contacter le serveur Diaspo'Actif.</div>`;
    return;
  }

  /* État des filtres */
  const state = { typeOrg: "", paysRes: "", paysOrig: "", ville: "", nom: "", prenom: "" };
  let USERS_CACHE = null;

  /* Normalisation */
  const norm = s => (s||"").toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g,"");

  function renderPersonCard(u) {
    const loc = [u.ville, u.pays].filter(Boolean).join(', ') || '—';
    const profilHref = `profil.html?id=${encodeURIComponent(u.id)}`;
    return `
    <div class="ann-card" onclick="window.location.href='${profilHref}'" style="cursor:pointer;">
      <div class="ann-card-photo" style="position:relative;display:flex;align-items:center;justify-content:center;background:#f1f5f9;">
        ${photoAvatar([u.prenom,u.nom].filter(Boolean).join(' ')||u.nom, 96, 'user')}
        <span class="ann-cat-badge" style="background:#1B3A6B;">UTILISATEUR</span>
      </div>
      <div class="ann-card-body">
        <div class="ann-card-title">${[u.prenom, u.nom].filter(Boolean).join(' ')}</div>
        <div class="ann-card-meta-row"><span class="ann-card-loc">📍 ${loc}</span></div>
        ${u.titre_pro ? `<div class="ann-card-desc">${u.titre_pro}</div>` : ''}
        <div class="ann-card-foot">
          <a href="${profilHref}" class="ann-card-btn" onclick="event.stopPropagation()">👁 Voir le profil</a>
        </div>
      </div>
    </div>`;
  }

  /* ── Rendu des chips filtres actifs ── */
  function renderChips() {
    const bar = document.getElementById("active-filters-bar");
    if (!bar) return;
    const labels = {
      typeOrg:  "Type",
      paysRes:  "Résidence",
      paysOrig: "Origine",
      ville:    "Ville",
      nom:      "Nom",
      prenom:   "Prénom",
    };
    const active = Object.entries(state).filter(([,v]) => v);
    bar.style.display = active.length ? "flex" : "none";
    bar.innerHTML = active.length
      ? active.map(([k, v]) =>
          `<span class="ann-chip">${labels[k]} : ${v}
            <button class="ann-chip-remove" onclick="annRemoveFilter('${k}')" title="Retirer ce filtre">✕</button>
          </span>`
        ).join("") +
        `<span style="font-size:12px;color:var(--muted);margin-left:4px;">${filtered_count} résultat${filtered_count!==1?"s":""}</span>`
      : "";
  }

  let filtered_count = ALL.length;

  /* ── Appliquer les filtres ── */
  async function apply() {
    const prenomGroup = document.getElementById("f-prenom-group");
    if (prenomGroup) prenomGroup.style.display = state.typeOrg === "Utilisateurs" ? "" : "none";

    if (state.typeOrg === "Utilisateurs") {
      if (!USERS_CACHE) {
        try { const r = await api("GET", "/annuaire/utilisateurs"); USERS_CACHE = r.users || []; }
        catch(e) { USERS_CACHE = []; }
      }
      const filtered = USERS_CACHE.filter(u => {
        if (state.nom && !norm(u.nom||"").includes(norm(state.nom))) return false;
        if (state.prenom && !norm(u.prenom||"").includes(norm(state.prenom))) return false;
        if (state.ville && !norm(u.ville||"").includes(norm(state.ville))) return false;
        return true;
      });
      filtered_count = filtered.length;
      document.getElementById("result-count").textContent = filtered.length;
      list.innerHTML = filtered.length
        ? filtered.map(renderPersonCard).join("")
        : `<div class="empty" style="grid-column:1/-1;padding:40px;text-align:center;color:var(--muted);">
            <div style="font-size:2rem;margin-bottom:12px;">🔍</div>
            <p style="font-weight:700;margin-bottom:6px;">Aucun utilisateur trouvé</p>
            <p style="font-size:.88rem;">Essayez avec d'autres filtres ou <button onclick="annResetFilters()" style="background:none;border:none;color:var(--orange);cursor:pointer;font-weight:700;text-decoration:underline;">réinitialisez la recherche</button>.</p>
          </div>`;
      renderChips();
      return;
    }

    const filtered = ALL.filter(it => {
      const villeParts = (it.ville||"").split(",");
      const itVille    = norm(villeParts[0]);
      const itPaysRes  = norm(villeParts.length > 1 ? villeParts[villeParts.length-1] : "");
      const itPaysOrig = norm(it.pays||"") || norm(it.nationalite1||"");

      if (state.typeOrg && norm(it.type||"") !== norm(state.typeOrg)) return false;
      if (state.paysRes && !itPaysRes.includes(norm(state.paysRes))) return false;
      if (state.paysOrig && !itPaysOrig.includes(norm(state.paysOrig))
          && !norm(it.nationalite2||"").includes(norm(state.paysOrig))
          && !norm(it.origine1||"").includes(norm(state.paysOrig))
          && !norm(it.origine2||"").includes(norm(state.paysOrig))) return false;
      if (state.ville && !itVille.includes(norm(state.ville))) return false;
      if (state.nom && !norm(it.nom||"").includes(norm(state.nom))) return false;
      return true;
    });

    filtered_count = filtered.length;
    document.getElementById("result-count").textContent = filtered.length;
    list.innerHTML = filtered.length
      ? filtered.map(renderInitiativeCard).join("")
      : `<div class="empty" style="grid-column:1/-1;padding:40px;text-align:center;color:var(--muted);">
          <div style="font-size:2rem;margin-bottom:12px;">🔍</div>
          <p style="font-weight:700;margin-bottom:6px;">Aucune initiative trouvée</p>
          <p style="font-size:.88rem;">Essayez avec d'autres filtres ou <button onclick="annResetFilters()" style="background:none;border:none;color:var(--orange);cursor:pointer;font-weight:700;text-decoration:underline;">réinitialisez la recherche</button>.</p>
        </div>`;
    renderChips();
  }

  /* ── Exposer reset et removeFilter globalement ── */
  window.annResetFilters = function() {
    state.typeOrg = state.paysRes = state.paysOrig = state.ville = state.nom = state.prenom = "";
    const typeEl = document.getElementById("f-type-org");
    if (typeEl) typeEl.value = "";
    const villeEl = document.getElementById("f-ville-simple");
    if (villeEl) villeEl.value = "";
    const nomEl = document.getElementById("f-nom-simple");
    if (nomEl) nomEl.value = "";
    const prenomEl = document.getElementById("f-prenom-simple");
    if (prenomEl) prenomEl.value = "";
    // Reset GeoAutocomplete (vider le champ input visible)
    ["f-pays-res","f-pays-orig"].forEach(id => {
      const wrap = document.getElementById(id);
      if (wrap) { const inp = wrap.querySelector("input"); if (inp) inp.value = ""; }
    });
    apply();
  };

  window.annRemoveFilter = function(key) {
    state[key] = "";
    if (key === "typeOrg") { const el = document.getElementById("f-type-org"); if(el) el.value = ""; }
    if (key === "ville")   { const el = document.getElementById("f-ville-simple"); if(el) el.value = ""; }
    if (key === "nom")     { const el = document.getElementById("f-nom-simple"); if(el) el.value = ""; }
    if (key === "prenom")  { const el = document.getElementById("f-prenom-simple"); if(el) el.value = ""; }
    if (key === "paysRes") {
      const wrap = document.getElementById("f-pays-res");
      if (wrap) { const inp = wrap.querySelector("input"); if(inp) inp.value = ""; }
    }
    if (key === "paysOrig") {
      const wrap = document.getElementById("f-pays-orig");
      if (wrap) { const inp = wrap.querySelector("input"); if(inp) inp.value = ""; }
    }
    apply();
  };

  /* ── Type d'organisme ── */
  const typeEl = document.getElementById("f-type-org");
  if (typeEl) typeEl.addEventListener("change", () => { state.typeOrg = typeEl.value; apply(); });

  /* ── Ville (texte libre, debounce) ── */
  let _villeTimer;
  const villeEl = document.getElementById("f-ville-simple");
  if (villeEl) villeEl.addEventListener("input", () => {
    clearTimeout(_villeTimer);
    _villeTimer = setTimeout(() => { state.ville = villeEl.value.trim(); apply(); }, 300);
  });

  /* ── Nom (texte libre, debounce) ── */
  let _nomTimer;
  const nomEl = document.getElementById("f-nom-simple");
  if (nomEl) nomEl.addEventListener("input", () => {
    clearTimeout(_nomTimer);
    _nomTimer = setTimeout(() => { state.nom = nomEl.value.trim(); apply(); }, 300);
  });

  /* ── Prénom (texte libre, debounce, uniquement visible en mode Utilisateurs) ── */
  let _prenomTimer;
  const prenomEl = document.getElementById("f-prenom-simple");
  if (prenomEl) prenomEl.addEventListener("input", () => {
    clearTimeout(_prenomTimer);
    _prenomTimer = setTimeout(() => { state.prenom = prenomEl.value.trim(); apply(); }, 300);
  });

  /* ── Bouton reset ── */
  document.getElementById("btn-reset-filters")?.addEventListener("click", window.annResetFilters);

  /* ── GeoAutocomplete (pays résidence + pays origine) ── */
  if (typeof GeoAutocomplete !== "undefined") {
    const prAnchor = document.getElementById("f-pays-res");
    if (prAnchor) new GeoAutocomplete(prAnchor, {
      id: "f-pays-res",
      placeholder: "Ex : France, Sénégal…",
      getList: () => geoGetCountries(),
      onSelect: v => { state.paysRes = v; apply(); },
    });

    const poAnchor = document.getElementById("f-pays-orig");
    if (poAnchor) new GeoAutocomplete(poAnchor, {
      id: "f-pays-orig",
      placeholder: "Ex : Côte d'Ivoire…",
      getList: () => geoGetCountries(),
      onSelect: v => { state.paysOrig = v; apply(); },
    });
  }

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
/* ==============================================================
   INTERACTIONS SOCIALES — J'aime / Commenter / Partager / Republier
   ============================================================== */

window.toggleLike = async function(btn){
  const postId = btn.dataset.id;
  if(!postId){ alert("Connectez-vous pour réagir."); return; }
  const wasLiked = btn.classList.contains("liked");
  btn.classList.toggle("liked");
  const countEl = btn.querySelector(".like-count");
  const statEl  = document.getElementById("fp-likes-"+postId);
  const cur = parseInt(countEl?.textContent)||0;
  const next = wasLiked ? Math.max(0, cur-1) : cur+1;
  if(countEl) countEl.textContent = next;
  if(statEl)  statEl.textContent  = `❤️ ${next} J'aime`;
  btn.firstChild.textContent = wasLiked ? "🤍" : "❤️";
  btn.dataset.likes = next;
  try { await api("POST", `/fil/${postId}/react`, { type:"like" }); } catch{}
};

window.toggleComments = async function(postId, triggerBtn){
  const section = document.getElementById("cmt-section-"+postId);
  if(!section) return;
  if(section.style.display !== "none"){
    section.style.display = "none";
    return;
  }
  section.style.display = "block";
  section.innerHTML = `<div style="padding:12px;color:#9CA3AF;font-size:13px;">Chargement…</div>`;
  try {
    const data = await api("GET", `/fil/${postId}/commentaires`);
    renderCommentsSection(postId, data.commentaires || []);
  } catch(e){
    section.innerHTML = `<div style="padding:12px;color:#EF4444;">Erreur de chargement.</div>`;
  }
};

function renderCommentsSection(postId, commentaires){
  const section = document.getElementById("cmt-section-"+postId);
  if(!section) return;
  const cmtsHtml = commentaires.map(c => {
    const av = c.photo_url
      ? `<img src="${escH(c.photo_url)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`
      : photoAvatar(c.auteur_nom||"?", 32);
    return `<div class="cmt-item">
      <div class="cmt-av">${av}</div>
      <div class="cmt-bubble">
        <strong class="cmt-nom">${escH(c.auteur_nom||"Anonyme")}</strong>${c.certif ? " " + badgeCertif(c.certif, { small: true }) : ""}
        <span class="cmt-date">${fmtDateGlobal(c.created_at)}</span>
        <div class="cmt-text">${escH(c.contenu)}</div>
      </div>
    </div>`;
  }).join("");

  section.innerHTML = `
    <div class="cmt-list">${cmtsHtml || '<div class="cmt-empty">Soyez le premier à commenter…</div>'}</div>
    <div class="cmt-form">
      <textarea class="cmt-input" id="cmt-inp-${postId}" placeholder="Écrire un commentaire…" rows="2"></textarea>
      <button class="cmt-send" onclick="submitComment(${postId})">Publier</button>
    </div>`;

  // Autofocus
  const inp = document.getElementById("cmt-inp-"+postId);
  if(inp) setTimeout(()=>inp.focus(), 50);
}

window.submitComment = async function(postId){
  const inp = document.getElementById("cmt-inp-"+postId);
  if(!inp) return;
  const text = inp.value.trim();
  if(!text) return;
  inp.disabled = true;
  try {
    const data = await api("POST", `/fil/${postId}/commentaires`, { contenu: text });
    inp.value = "";
    // Met à jour le compteur
    const countEl = document.getElementById("cmt-count-"+postId);
    if(countEl) countEl.textContent = parseInt(countEl.textContent||"0")+1;
    // Recharge la section
    const fresh = await api("GET", `/fil/${postId}/commentaires`);
    renderCommentsSection(postId, fresh.commentaires||[]);
  } catch(e){
    alert("Erreur lors de la publication du commentaire.");
  } finally {
    if(inp) inp.disabled = false;
  }
};

window.openShareModal = function(postId){
  const existing = document.getElementById("share-modal");
  if(existing) existing.remove();
  const url = `${location.origin}/fil-actualite.html#fp-${postId}`;
  const modal = document.createElement("div");
  modal.id = "share-modal";
  modal.className = "social-modal-overlay";
  modal.innerHTML = `
    <div class="social-modal">
      <button class="social-modal-close" onclick="document.getElementById('share-modal').remove()">✕</button>
      <h3>Partager cette publication</h3>
      <div class="share-url-box">
        <input type="text" id="share-url-inp" value="${escH(url)}" readonly>
        <button onclick="navigator.clipboard.writeText('${escH(url)}').then(()=>{document.getElementById('share-copied').style.display='inline'})">Copier</button>
      </div>
      <span id="share-copied" style="display:none;color:#10B981;font-size:13px;">✓ Lien copié !</span>
      <div class="share-btns">
        <a class="share-btn share-wa" href="https://wa.me/?text=${encodeURIComponent('Découvrez cette publication Diaspo\'Actif : '+url)}" target="_blank" rel="noopener">
          WhatsApp
        </a>
        <a class="share-btn share-li" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}" target="_blank" rel="noopener">
          LinkedIn
        </a>
        <a class="share-btn share-tw" href="https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Publication sur Diaspo\'Actif')}" target="_blank" rel="noopener">
          Twitter / X
        </a>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if(e.target===modal) modal.remove(); });
};

window.openRepostModal = function(postId){
  const existing = document.getElementById("repost-modal");
  if(existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = "repost-modal";
  modal.className = "social-modal-overlay";
  modal.innerHTML = `
    <div class="social-modal">
      <button class="social-modal-close" onclick="document.getElementById('repost-modal').remove()">✕</button>
      <h3>🔁 Republier</h3>
      <p style="font-size:13px;color:#6B7280;margin:0 0 12px;">La publication réapparaîtra dans votre fil avec votre commentaire.</p>
      <textarea id="repost-comment-inp" class="cmt-input" placeholder="Ajouter un commentaire (optionnel)…" rows="3" style="width:100%;"></textarea>
      <div style="display:flex;gap:10px;margin-top:12px;">
        <button class="cmt-send" style="flex:1;" onclick="submitRepost(${postId})">Republier</button>
        <button class="fp-btn" style="flex:0 0 auto;padding:8px 16px;" onclick="document.getElementById('repost-modal').remove()">Annuler</button>
      </div>
      <div id="repost-feedback" style="margin-top:8px;font-size:13px;"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if(e.target===modal) modal.remove(); });
  setTimeout(()=>{ const t=document.getElementById("repost-comment-inp"); if(t) t.focus(); }, 50);
};

window.submitRepost = async function(postId){
  const inp = document.getElementById("repost-comment-inp");
  const fb  = document.getElementById("repost-feedback");
  const commentaire = inp ? inp.value.trim() : "";
  if(fb) fb.innerHTML = `<span style="color:#6B7280;">Publication en cours…</span>`;
  try {
    await api("POST", `/fil/${postId}/republier`, { commentaire });
    if(fb) fb.innerHTML = `<span style="color:#10B981;">✓ Republié ! La publication apparaît maintenant dans votre fil.</span>`;
    setTimeout(()=>{ document.getElementById("repost-modal")?.remove(); }, 1500);
  } catch(e){
    if(fb) fb.innerHTML = `<span style="color:#EF4444;">Erreur lors de la republication.</span>`;
  }
};

async function initFilActualite(){
  const el = document.getElementById("feed-list");
  if(!el) return;
  // Si posts.js est chargé, il gère le fil — on cède la place
  if(window.Posts) return;

  const CATS = ["Diaspora","Entrepreneuriat","Investissement","Culture","Initiatives citoyennes","Formation","Santé","Technologie","Agriculture","Autre"];
  const TYPE_ICONS = { texte:"📝", article:"📰", photo:"📷", video:"🎥" };
  let posts = [];
  let currentFilter = "Tous";
  let me = null;

  // --- CHARGEMENT INITIAL ---
  let filMeta = { suivis_users: [], suivis_initiatives: [] };
  try {
    [{ posts }, me, filMeta] = await Promise.all([
      api("GET","/fil?mode=tous"),
      fetchCurrentUser().catch(()=>null),
      api("GET","/fil/meta").catch(()=>({ suivis_users:[], suivis_initiatives:[] }))
    ]);
  } catch(e) {
    el.innerHTML = `<div class="empty">Impossible de contacter le serveur.</div>`;
    return;
  }
  let suivis_users = new Set(filMeta.suivis_users||[]);
  let suivis_initiatives = new Set(filMeta.suivis_initiatives||[]);

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
/* Commentaires */
.fp-comments-section { border-top:1px solid #F3F4F6; }
.cmt-list { padding:12px 16px 4px; display:flex; flex-direction:column; gap:10px; }
.cmt-empty { font-size:13px; color:#9CA3AF; font-style:italic; }
.cmt-item { display:flex; gap:10px; align-items:flex-start; }
.cmt-av { flex-shrink:0; }
.cmt-bubble { background:#F9FAFB; border-radius:12px; padding:8px 12px; flex:1; }
.cmt-nom { font-size:13px; color:#111827; }
.cmt-date { font-size:11px; color:#9CA3AF; margin-left:8px; }
.cmt-text { font-size:13px; color:#374151; margin-top:3px; white-space:pre-wrap; }
.cmt-form { display:flex; gap:8px; align-items:flex-end; padding:8px 16px 12px; }
.cmt-input { flex:1; border:1px solid #E5E7EB; border-radius:10px; padding:8px 12px; font-size:13px; resize:none; font-family:inherit; }
.cmt-input:focus { outline:none; border-color:#4338CA; }
.cmt-send { background:#4338CA; color:#fff; border:none; border-radius:10px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; }
.cmt-send:hover { background:#3730A3; }
/* Modals Partager / Republier */
.social-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:9000; display:flex; align-items:center; justify-content:center; padding:16px; }
.social-modal { background:#fff; border-radius:16px; padding:24px; width:100%; max-width:420px; position:relative; box-shadow:0 20px 60px rgba(0,0,0,.2); }
.social-modal h3 { margin:0 0 12px; font-size:17px; color:#111827; }
.social-modal-close { position:absolute; top:14px; right:14px; background:none; border:none; font-size:18px; cursor:pointer; color:#6B7280; line-height:1; }
.share-url-box { display:flex; gap:8px; margin-bottom:6px; }
.share-url-box input { flex:1; border:1px solid #E5E7EB; border-radius:8px; padding:7px 10px; font-size:12px; color:#374151; }
.share-url-box button { background:#4338CA; color:#fff; border:none; border-radius:8px; padding:7px 14px; font-size:13px; font-weight:600; cursor:pointer; }
.share-btns { display:flex; gap:10px; margin-top:14px; }
.share-btn { flex:1; text-align:center; padding:10px 6px; border-radius:10px; font-size:13px; font-weight:600; text-decoration:none; }
.share-wa { background:#25D366; color:#fff; }
.share-li { background:#0077B5; color:#fff; }
.share-tw { background:#1DA1F2; color:#fff; }
/* Badges source */
.fp-source-badge { font-size:10.5px; font-weight:700; border-radius:20px; padding:2px 8px; display:inline-flex; align-items:center; gap:3px; }
.fp-src-suivi   { background:#EEF2FF; color:#4338CA; }
.fp-src-pop     { background:#FEF3C7; color:#D97706; }
.fp-src-art     { background:#F0FDF4; color:#059669; }
.fp-author-banner { position:relative; }
.fp-author-banner .fp-source-badge { position:absolute; top:8px; right:12px; }
/* Bouton Suivre */
.fp-follow-btn {
  font-size:12px; font-weight:700; padding:4px 12px; border-radius:99px; cursor:pointer;
  border:1.5px solid #4338CA; background:transparent; color:#4338CA; transition:all .18s;
  white-space:nowrap;
}
.fp-follow-btn:hover { background:#4338CA; color:#fff; }
.fp-follow-btn.following { background:#F3F4F6; border-color:#D1D5DB; color:#6B7280; }
.fp-follow-btn.following:hover { background:#FEE2E2; border-color:#EF4444; color:#EF4444; }
.fp-head-right { display:flex; flex-direction:column; align-items:flex-end; gap:6px; flex-shrink:0; }
.fp-repost-header { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
/* Conseil fil vide */
.fil-conseil { background:#EEF2FF; border-radius:12px; padding:20px 24px; font-size:14px; color:#4338CA; text-align:center; margin:16px 0; }
/* Repost */
.fp-repost { border-left:3px solid #4338CA; }
.fp-repost-header { padding:10px 16px 4px; font-size:13px; color:#6B7280; display:flex; align-items:center; gap:8px; }
.fp-repost-comment { padding:6px 16px 10px; font-size:14px; color:#111827; white-space:pre-wrap; }
.fp-repost-card { margin:0 12px 12px; border:1px solid #E5E7EB; border-radius:12px; overflow:hidden; }
.fp-stats-orig { border-top:none; padding:4px 12px 8px; font-size:12px; }
.fp-stat-cmts { cursor:pointer; }
.fp-stat-cmts:hover { color:#4338CA; }
/* Bannière auteur + localisation */
.fp-author-banner {
  height:72px; width:100%; position:relative; flex-shrink:0;
}
.fp-type-badge {
  position:absolute; bottom:8px; left:14px;
  background:rgba(0,0,0,.38); color:#fff; border-radius:20px;
  padding:2px 10px; font-size:11px; font-weight:700; backdrop-filter:blur(4px);
}
.fp-av-link { display:block; flex-shrink:0; }
.fp-nom-link { color:#0D1B2A; text-decoration:none; }
.fp-nom-link:hover { text-decoration:underline; }
.fp-titre-pro { font-size:12px; color:#6B7280; margin-top:1px; }
.fp-sub-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:4px; }
.fp-loc, .fp-orig, .fp-date { font-size:11.5px; color:#9CA3AF; }
.fp-loc { color:#374151; font-weight:500; }
.fp-orig { color:#059669; font-weight:500; }
.fp-author-bio { font-size:12.5px; color:#6B7280; padding:0 16px 8px; font-style:italic; line-height:1.5; }
.fp-bio-snippet { /* inline within fp-author-bio */ }
/* Widget Profils à découvrir */
.pdc-wrapper { background:#fff; border-radius:14px; border:1px solid #E5E7EB; margin-bottom:16px; overflow:hidden; }
.pdc-header { display:flex; align-items:baseline; justify-content:space-between; padding:14px 16px 10px; border-bottom:1px solid #F3F4F6; }
.pdc-title { font-size:14px; font-weight:800; color:#0D1B2A; }
.pdc-sub { font-size:11.5px; color:#9CA3AF; }
.pdc-scroll { display:flex; gap:12px; overflow-x:auto; padding:14px 14px 16px; scroll-snap-type:x mandatory; scrollbar-width:thin; }
.pdc-scroll::-webkit-scrollbar { height:4px; }
.pdc-scroll::-webkit-scrollbar-thumb { background:#E5E7EB; border-radius:4px; }
.pdc-card { flex:0 0 200px; scroll-snap-align:start; border:1px solid #F3F4F6; border-radius:12px; overflow:hidden; background:#FAFAFA; transition:box-shadow .18s; }
.pdc-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.1); }
.pdc-banner { height:80px; width:100%; }
.pdc-av { margin:-28px auto 0; width:56px; height:56px; border-radius:50%; overflow:hidden; border:3px solid #fff; display:flex; align-items:center; justify-content:center; background:#E5E7EB; position:relative; z-index:1; }
.pdc-av img { width:100%; height:100%; object-fit:cover; }
.pdc-body { padding:10px 12px 14px; text-align:center; }
.pdc-nom { display:block; font-weight:700; font-size:13.5px; color:#0D1B2A; text-decoration:none; margin-bottom:2px; }
.pdc-nom:hover { text-decoration:underline; }
.pdc-titre { font-size:11.5px; color:#6B7280; margin-bottom:4px; }
.pdc-loc { font-size:11px; color:#374151; font-weight:500; margin-bottom:2px; }
.pdc-orig { font-size:11px; color:#059669; font-weight:600; margin-bottom:6px; }
.pdc-bio { font-size:11.5px; color:#6B7280; line-height:1.45; margin-bottom:8px; text-align:left; }
.pdc-btn { display:block; background:#4338CA; color:#fff; border-radius:8px; padding:6px 0; font-size:12px; font-weight:700; text-align:center; text-decoration:none; transition:background .18s; }
.pdc-btn:hover { background:#3730A3; }
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
        try {
          if((currentType==="photo"||currentType==="video") && mediaDataUrl) {
            const ext = mediaFile?.name?.split(".").pop() || (currentType==="video"?"mp4":"jpg");
            const up = await api("POST","/upload",{ data: mediaDataUrl, nom: mediaFile?.name || `media.${ext}` });
            payload.media_url = up.url;
            if(currentType==="video") payload.video_duree = Math.round(videoDuree);
          }
        } catch(upErr) { /* si upload échoue, on envoie sans media */ }

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

  // Palettes banner par thème (ou fallback selon nom)
  const THEME_BANNERS = {
    ocean:  "linear-gradient(135deg,#1a6985 0%,#2ab7ca 100%)",
    foret:  "linear-gradient(135deg,#2d6a4f 0%,#74c69d 100%)",
    soleil: "linear-gradient(135deg,#e07b00 0%,#ffd166 100%)",
    violet: "linear-gradient(135deg,#5a2d82 0%,#c77dff 100%)",
    terre:  "linear-gradient(135deg,#7b3f00 0%,#c8903f 100%)",
    nuit:   "linear-gradient(135deg,#1a1a2e 0%,#4a4e8c 100%)",
  };
  function themeGradient(theme, nom){
    if(THEME_BANNERS[theme]) return THEME_BANNERS[theme];
    // Fallback déterministe basé sur initiale
    const idx = (nom||"?").charCodeAt(0) % Object.keys(THEME_BANNERS).length;
    return Object.values(THEME_BANNERS)[idx];
  }

  function buildAuthorHeader(p, opts = {}){
    const { compact = false } = opts;
    const prof   = p.auteur_profil || {};
    const nom    = p.auteur_nom || "Anonyme";
    const banner = prof.banner_url
      ? `url('${escH(prof.banner_url)}') center/cover no-repeat`
      : themeGradient(prof.theme_couleur, nom);
    const sz     = compact ? 38 : 52;
    const avHtml = prof.photo_url
      ? `<img src="${escH(prof.photo_url)}" alt="${escH(nom)}" style="width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;border:3px solid #fff;">`
      : photoAvatar(nom, sz);
    const locParts  = [prof.ville, prof.pays].filter(Boolean);
    const locHtml   = locParts.length ? `<span class="fp-loc">📍 ${escH(locParts.join(", "))}</span>` : "";
    const origHtml  = prof.nationalite1 ? `<span class="fp-orig">🌍 ${escH(prof.nationalite1)}</span>` : "";
    const titreHtml = !compact && (prof.titre_pro || prof.situation_pro)
      ? `<div class="fp-titre-pro">${escH(prof.titre_pro || prof.situation_pro)}</div>` : "";
    const bioHtml   = !compact && prof.bio
      ? `<div class="fp-bio-snippet">${escH(prof.bio.slice(0,100))}${prof.bio.length>100?"…":""}</div>` : "";
    const typeIcon  = TYPE_ICONS[p.pub_type||p.type] || "📝";
    const typeLabel = escH(p.pub_type||p.type||"Publication");

    return { banner, avHtml, locHtml, origHtml, titreHtml, bioHtml, nom, typeIcon, typeLabel };
  }

  function buildPostBody(p){
    let mediaHtml = "";
    if(p.media_type==="image" && p.media_url)
      mediaHtml = `<img class="fp-img" src="${escH(p.media_url)}" alt="Photo" loading="lazy">`;
    else if(p.media_type==="video" && p.media_url)
      mediaHtml = `<video class="fp-video" src="${escH(p.media_url)}" controls preload="metadata"></video>`;

    let bodyHtml = "";
    if((p.pub_type==="article"||p.type==="article") && p.article_titre){
      const txt     = p.article_contenu || p.contenu || "";
      const preview = txt.length > 300 ? txt.slice(0,300)+"…" : txt;
      bodyHtml = `<h3 class="fp-article-titre">${escH(p.article_titre)}</h3>
        <div class="fp-article-body" id="art-body-${p.id}">${renderMentions(preview)}</div>
        ${txt.length>300?`<span class="fp-article-more" onclick="expandArticleMention(${p.id},this,${JSON.stringify(txt)})">Lire la suite →</span>`:""}`;
    } else {
      const text    = p.contenu || "";
      const preview = text.length > 400 ? text.slice(0,400)+"…" : text;
      bodyHtml = `<div class="fp-text">${renderMentions(preview)}${text.length>400?`<span class="fp-article-more" onclick="expandTextMention(${p.id},this,${JSON.stringify(text)})"> Lire la suite →</span>`:""}</div>`;
    }
    return { mediaHtml, bodyHtml };
  }

  function sourceBadge(source){
    if(source==="suivi")     return `<span class="fp-source-badge fp-src-suivi">👥 Suivi</span>`;
    if(source==="populaire") return `<span class="fp-source-badge fp-src-pop">🔥 Populaire</span>`;
    if(source==="article")   return `<span class="fp-source-badge fp-src-art">📰 À la une</span>`;
    return "";
  }

  function followBtn(auteurId, opts){
    if(!opts?.me || auteurId === opts?.me?.id || !auteurId) return "";
    const isSuivi = opts?.suivis_users?.has(auteurId);
    return `<button class="fp-follow-btn${isSuivi?" following":""}" data-user-id="${auteurId}">${isSuivi?"✓ Suivi":"+ Suivre"}</button>`;
  }

  function renderPost(p, opts){
    const isRepost = (p.pub_type === "repost" || p.type === "repost");

    // --- Repost : affichage dédié ---
    if(isRepost && p.original_post){
      const nom    = p.auteur_nom || "Anonyme";
      const av     = (p.auteur_profil||{}).photo_url
        ? `<img src="${escH(p.auteur_profil.photo_url)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;vertical-align:middle;">`
        : photoAvatar(nom, 28);
      const { banner, avHtml, locHtml, origHtml, titreHtml, typeIcon, typeLabel, bioHtml } = buildAuthorHeader(p.original_post);
      const orig = p.original_post;
      const { mediaHtml, bodyHtml } = buildPostBody(orig);
      const origNom    = orig.auteur_nom || "Anonyme";
      const origLikes  = (orig.reactions&&orig.reactions.like)||0;

      return `<div class="feed-post fp-repost" id="fp-${p.id}">
        <div class="fp-repost-header">
          ${sourceBadge(p.source)}
          ${av} <strong>${escH(nom)}</strong> a republié · <span class="fp-date">${fmtDate(p.created_at)}</span>
          ${followBtn(p.auteur_id, opts)}
        </div>
        ${p.repost_commentaire ? `<div class="fp-repost-comment">${escH(p.repost_commentaire)}</div>` : ""}
        <div class="fp-repost-card">
          <div class="fp-author-banner" style="background:${banner};">
            <span class="fp-type-badge">${typeIcon} ${typeLabel}</span>
          </div>
          <div class="fp-head">
            <a href="profil.html?id=${orig.auteur_id||''}" class="fp-av-link">${avHtml}</a>
            <div class="fp-meta">
              <div class="fp-nom"><a href="profil.html?id=${orig.auteur_id||''}" class="fp-nom-link">${escH(origNom)}</a></div>
              ${titreHtml}
              <div class="fp-sub-row">${locHtml}${origHtml}<span class="fp-date">🕐 ${fmtDate(orig.created_at)}</span></div>
            </div>
            <span class="fp-cat">${escH(orig.categorie||"")}</span>
          </div>
          ${bioHtml ? `<div class="fp-author-bio">${bioHtml}</div>` : ""}
          ${mediaHtml ? `<div>${mediaHtml}</div>` : ""}
          <div class="fp-body">${bodyHtml}</div>
          <div class="fp-stats fp-stats-orig">
            <span>❤️ ${origLikes} J'aime</span>
          </div>
        </div>
        <div class="fp-actions">
          <button class="fp-btn feed-react${p.user_a_aime?" liked":""}" data-id="${p.id}" data-likes="${(p.reactions&&p.reactions.like)||0}" onclick="toggleLike(this)">
            ${p.user_a_aime?"❤️":"🤍"} <span class="like-count">${(p.reactions&&p.reactions.like)||0}</span>
          </button>
          <button class="fp-btn" onclick="toggleComments(${p.id},this)">💬 <span id="cmt-count-${p.id}">${p.nb_commentaires||0}</span></button>
          <button class="fp-btn" onclick="openShareModal(${p.id})">↗️ Partager</button>
          <button class="fp-btn" onclick="openRepostModal(${p.id})">🔁 Republier</button>
        </div>
        <div class="fp-comments-section" id="cmt-section-${p.id}" style="display:none;"></div>
      </div>`;
    }

    // --- Post normal ---
    const likes  = (p.reactions&&p.reactions.like)||0;
    const nbCmts = p.nb_commentaires || 0;
    const { banner, avHtml, locHtml, origHtml, titreHtml, bioHtml, nom, typeIcon, typeLabel } = buildAuthorHeader(p);
    const { mediaHtml, bodyHtml } = buildPostBody(p);
    const postCertifBadge = p.auteur_certif ? badgeCertif(p.auteur_certif, { small: true }) : "";
    const postAccredBadges = (p.auteur_accreditations||[]).map(a =>
      a === 'mobilisation_active'
        ? `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;border-radius:99px;font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;">📢</span>`
        : `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;border-radius:99px;font-size:10px;font-weight:700;background:#dbeafe;color:#1e40af;border:1px solid #3b82f6;">💼</span>`
    ).join(" ");

    return `<div class="feed-post" id="fp-${p.id}">
      <div class="fp-author-banner" style="background:${banner};">
        <span class="fp-type-badge">${typeIcon} ${typeLabel}</span>
        ${sourceBadge(p.source)}
      </div>
      <div class="fp-head">
        <a href="profil.html?id=${p.auteur_id||''}" class="fp-av-link">${avHtml}</a>
        <div class="fp-meta">
          <div class="fp-nom"><a href="profil.html?id=${p.auteur_id||''}" class="fp-nom-link">${escH(nom)}</a>${postCertifBadge ? " " + postCertifBadge : ""}${postAccredBadges ? " " + postAccredBadges : ""}</div>
          ${titreHtml}
          <div class="fp-sub-row">${locHtml}${origHtml}<span class="fp-date">🕐 ${fmtDate(p.created_at)}</span></div>
        </div>
        <div class="fp-head-right">
          <span class="fp-cat">${escH(p.categorie||"")}</span>
          ${followBtn(p.auteur_id, opts)}
        </div>
      </div>
      ${bioHtml ? `<div class="fp-author-bio">${bioHtml}</div>` : ""}
      ${mediaHtml ? `<div>${mediaHtml}</div>` : ""}
      <div class="fp-body">${bodyHtml}</div>
      <div class="fp-stats">
        <span id="fp-likes-${p.id}">❤️ ${likes} J'aime</span>
        <span class="fp-stat-cmts" onclick="toggleComments(${p.id},null)" style="cursor:pointer;">💬 <span id="cmt-count-${p.id}">${nbCmts}</span> commentaire${nbCmts!==1?"s":""}</span>
      </div>
      <div class="fp-actions">
        <button class="fp-btn feed-react${p.user_a_aime?" liked":""}" data-id="${p.id}" data-likes="${likes}" onclick="toggleLike(this)">
          ${p.user_a_aime?"❤️":"🤍"} <span class="like-count">${likes}</span>
        </button>
        <button class="fp-btn" onclick="toggleComments(${p.id},this)">💬 Commenter</button>
        <button class="fp-btn" onclick="openShareModal(${p.id})">↗️ Partager</button>
        <button class="fp-btn" onclick="openRepostModal(${p.id})">🔁 Republier</button>
      </div>
      <div class="fp-comments-section" id="cmt-section-${p.id}" style="display:none;"></div>
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

  // Profils fictifs riches pour remplir le widget même sur DB vide
  const DEMO_PROFILES = [
    { id:null, nom:"Amara Diallo", titre_pro:"Entrepreneur · Fintech", ville:"Paris", pays:"France",
      nationalite1:"Guinéenne", bio:"Fondateur de PayDiaspo, solution de transfert d'argent dédiée aux diasporas africaines.",
      theme_couleur:"ocean", banner_url:"https://picsum.photos/seed/amara2026/400/120", photo_url:null },
    { id:null, nom:"Fatou Sène", titre_pro:"Médecin · Santé publique", ville:"Lyon", pays:"France",
      nationalite1:"Sénégalaise", bio:"Coordinatrice du programme Santé Diaspora — accès aux soins pour les migrants.",
      theme_couleur:"foret", banner_url:"https://picsum.photos/seed/fatou2026/400/120", photo_url:null },
    { id:null, nom:"Kofi Mensah", titre_pro:"Ingénieur logiciel · Tech4Africa", ville:"Londres", pays:"Royaume-Uni",
      nationalite1:"Ghanéenne", bio:"Développe des outils numériques pour connecter la diaspora ghanéenne aux opportunités locales.",
      theme_couleur:"violet", banner_url:"https://picsum.photos/seed/kofi2026/400/120", photo_url:null },
    { id:null, nom:"Marie-Claire Nkosi", titre_pro:"Enseignante · Éducation", ville:"Bruxelles", pays:"Belgique",
      nationalite1:"Congolaise (RDC)", bio:"Militante pour l'accès à l'éducation bilingue et la valorisation des cultures africaines en Europe.",
      theme_couleur:"soleil", banner_url:"https://picsum.photos/seed/marie2026/400/120", photo_url:null },
    { id:null, nom:"Ibrahim Touré", titre_pro:"Agriculteur · Agri-Tech", ville:"Marseille", pays:"France",
      nationalite1:"Malienne", bio:"Développe des coopératives agricoles reliant les producteurs maliens à la diaspora européenne.",
      theme_couleur:"terre", banner_url:"https://picsum.photos/seed/ibrahim2026/400/120", photo_url:null },
    { id:null, nom:"Awa Camara", titre_pro:"Juriste · Droits des migrants", ville:"Berlin", pays:"Allemagne",
      nationalite1:"Burkinabè", bio:"Avocate spécialisée en droit de l'immigration et accès aux droits pour les diasporas africaines.",
      theme_couleur:"nuit", banner_url:"https://picsum.photos/seed/awa2026/400/120", photo_url:null },
  ];

  function renderProfileCard(u){
    const nom    = u.nom || "Profil";
    const banner = u.banner_url
      ? `url('${u.banner_url}') center/cover no-repeat`
      : themeGradient(u.theme_couleur, nom);
    const avHtml = u.photo_url
      ? `<img src="${escH(u.photo_url)}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid #fff;" alt="${escH(nom)}">`
      : photoAvatar(nom, 64);
    const profUrl = u.id ? `profil.html?id=${u.id}` : "#";
    return `<div class="pdc-card">
      <div class="pdc-banner" style="background:${banner};"></div>
      <div class="pdc-av">${avHtml}</div>
      <div class="pdc-body">
        <a href="${profUrl}" class="pdc-nom">${escH(nom)}</a>
        ${u.titre_pro ? `<div class="pdc-titre">${escH(u.titre_pro)}</div>` : ""}
        ${u.ville||u.pays ? `<div class="pdc-loc">📍 ${escH([u.ville,u.pays].filter(Boolean).join(", "))}</div>` : ""}
        ${u.nationalite1 ? `<div class="pdc-orig">🌍 ${escH(u.nationalite1)}</div>` : ""}
        ${u.bio ? `<div class="pdc-bio">${escH(u.bio.slice(0,90))}${u.bio.length>90?"…":""}</div>` : ""}
        <a href="${profUrl}" class="pdc-btn">Voir le profil</a>
      </div>
    </div>`;
  }

  async function buildProfilesWidget(){
    let profiles = DEMO_PROFILES;
    try {
      const data = await api("GET", "/fil/profiles");
      if(data.profiles && data.profiles.length) {
        // Fusionner: vrais profils d'abord, puis compléter avec DEMO_PROFILES
        const real = data.profiles.filter(u => u.ville || u.pays || u.nationalite1 || u.bio);
        profiles = [...real, ...DEMO_PROFILES].slice(0, 6);
      }
    } catch{}
    return `<div class="pdc-wrapper">
      <div class="pdc-header">
        <span class="pdc-title">👥 Profils à découvrir</span>
        <span class="pdc-sub">Membres actifs de la diaspora</span>
      </div>
      <div class="pdc-scroll">${profiles.map(renderProfileCard).join("")}</div>
    </div>`;
  }

  // Modes du fil → boutons filtres
  const MODE_MAP = {
    "Tous":       "tous",
    "Suivis":     "suivis",
    "Populaires": "populaires",
    "Articles":   "articles",
    "Texte":      "texte",
    "Photos":     "photos",
    "Vidéos":     "videos",
  };

  async function loadMode(mode){
    el.innerHTML = `<div class="empty" style="padding:32px;text-align:center;">Chargement…</div>`;
    try {
      // Modes filtrés côté serveur
      if(["suivis","populaires","articles"].includes(mode)){
        const data = await api("GET", `/fil?mode=${mode}`);
        posts = data.posts || [];
        if(data.conseil){
          el.innerHTML = `<div class="fil-conseil">${escH(data.conseil)}</div>`;
          return;
        }
      } else if(mode !== "tous"){
        // Filtres locaux sur les posts déjà chargés (texte/photos/videos)
        const typeMap = { texte:"texte", photos:"photo", videos:"video" };
        const t = typeMap[mode]||mode;
        posts = posts.filter(p => (p.pub_type||p.type||"").toLowerCase() === t);
      }
      render();
    } catch(e){
      el.innerHTML = `<div class="empty">Erreur de chargement.</div>`;
    }
  }

  // Cache des partenaires pour le fil
  let _poFeedCache = null;
  async function getPoFeed() {
    if (_poFeedCache !== null) return _poFeedCache;
    try {
      const d = await fetch('/api/partenaires/carousel?limit=6', { credentials:'include' }).then(r=>r.json());
      _poFeedCache = d.partenaires || [];
    } catch(e) { _poFeedCache = []; }
    return _poFeedCache;
  }

  function renderPoSponsoredPost(p) {
    const nom = [p.prenom, p.nom].filter(Boolean).join(' ') || p.nom || '—';
    const domaines = (p.domaines_expertise || []).slice(0,2).join(' · ');
    const desc = p.slogan || p.description_complete || p.bio || '';
    return `<div class="po-feed-card" onclick="window.location.href='profil.html?id=${p.user_id}';fetch('/api/partenaires/${p.id}/impression',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_type:'profile_visit',source:'feed'})})">
      <div class="po-feed-header">
        <div class="po-feed-avatar">${p.photo_url?`<img src="${p.photo_url}" alt="${nom}">`:(nom.charAt(0)||'?').toUpperCase()}</div>
        <div class="po-feed-meta">
          <div class="po-feed-nom">${nom} <span class="po-feed-badge">🏅 Partenaire Officiel Diaspo'Actif</span></div>
          ${domaines?`<div class="po-feed-dom">${domaines}</div>`:''}
        </div>
        <span class="po-feed-sponsored">Recommandé</span>
      </div>
      ${p.banner_url?`<div style="height:140px;overflow:hidden;border-radius:8px;margin:10px 0;"><img src="${p.banner_url}" style="width:100%;height:100%;object-fit:cover;" alt=""></div>`:''}
      ${desc?`<div class="po-feed-desc">${desc.slice(0,200)}${desc.length>200?'…':''}</div>`:''}
      <div class="po-feed-actions" onclick="event.stopPropagation()">
        <a href="profil.html?id=${p.user_id}" class="po-feed-btn-primary" onclick="fetch('/api/partenaires/${p.id}/impression',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_type:'click',source:'feed'})})">Découvrir →</a>
        <a href="messagerie.html?user=${p.user_id}" class="po-feed-btn-secondary" onclick="fetch('/api/partenaires/${p.id}/impression',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_type:'contact',source:'feed'})})">💬 Contacter</a>
      </div>
    </div>`;
  }

  function render(){
    if(!posts.length){
      el.innerHTML = `<div class="empty">Aucune publication pour ce fil.</div>`;
      return;
    }
    const INSERT_AT = 3;
    const PO_EVERY  = 8; // injecter 1 post sponsorisé toutes les 8 publications
    let html = "";
    let poIdx = 0;
    posts.forEach((p, i) => {
      html += renderPost(p, { suivis_users, me });
      if(i === INSERT_AT - 1) html += `<div id="profiles-widget-slot"></div>`;
      // Injection post sponsorisé
      if(i > 0 && (i + 1) % PO_EVERY === 0) html += `<div class="po-feed-slot" data-po-idx="${poIdx++}"></div>`;
    });
    if(posts.length < INSERT_AT) html += `<div id="profiles-widget-slot"></div>`;
    el.innerHTML = html;

    const slot = document.getElementById("profiles-widget-slot");
    if(slot) buildProfilesWidget().then(html => { slot.outerHTML = html; });

    // Remplir les slots partenaires
    getPoFeed().then(partners => {
      if (!partners.length) return;
      document.querySelectorAll('.po-feed-slot').forEach(slot => {
        const idx = parseInt(slot.dataset.poIdx || 0);
        const p = partners[idx % partners.length];
        if (p) { slot.outerHTML = renderPoSponsoredPost(p); }
      });
    });
  }

  const bar = document.getElementById("feed-filter-bar");
  if(bar){
    bar.querySelectorAll("button").forEach(b=>{
      b.addEventListener("click", async ()=>{
        bar.querySelectorAll("button").forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        const mode = MODE_MAP[b.dataset.type] || b.dataset.type || "tous";
        currentFilter = mode;
        // Recharger depuis serveur si nécessaire
        if(["suivis","populaires","articles"].includes(mode)){
          await loadMode(mode);
        } else if(mode === "tous"){
          const data = await api("GET", "/fil?mode=tous").catch(()=>({ posts:[] }));
          posts = data.posts || [];
          render();
        } else {
          // filtre local sur pub_type
          const typeMap = { texte:"texte", photos:"photo", videos:"video" };
          const t = typeMap[mode]||mode;
          const data = await api("GET", "/fil?mode=tous").catch(()=>({ posts:[] }));
          posts = (data.posts||[]).filter(p => (p.pub_type||p.type||"").toLowerCase() === t);
          render();
        }
      });
    });
  }

  // Bouton Suivre/Ne plus suivre sur les posts (délégation d'événement)
  el.addEventListener("click", async e => {
    const btn = e.target.closest(".fp-follow-btn");
    if(!btn) return;
    if(!me){ alert("Connectez-vous pour suivre."); return; }
    const userId = Number(btn.dataset.userId);
    const isFollowing = suivis_users.has(userId);
    try {
      if(isFollowing){
        await api("DELETE", `/follow/${userId}`);
        suivis_users.delete(userId);
        btn.textContent = "+ Suivre";
        btn.classList.remove("following");
      } else {
        await api("POST", `/follow/${userId}`);
        suivis_users.add(userId);
        btn.textContent = "✓ Suivi";
        btn.classList.add("following");
      }
    } catch(e){ console.error(e); }
  });

  render();
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

/* ---------- Régie publicitaire : diffusion d'une publicité approuvée sur un emplacement ---------- */
function trackAdClic(id){ fetch(`/api/ads/${id}/clic`, { method:"POST" }).catch(()=>{}); }

async function renderAdSlot(containerId, emplacement){
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    const r = await fetch(`/api/ads/servir?emplacement=${emplacement}`).then(x => x.json());
    if (!r.ad) { el.style.display = "none"; return; }
    const ad = r.ad;
    const clic = `onclick="trackAdClic(${ad.id})"`;
    el.innerHTML = `<div style="display:flex;align-items:center;gap:14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;">
      ${ad.media_type === "video"
        ? `<video src="${ad.media_url}" style="width:88px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;" muted autoplay loop playsinline></video>`
        : `<img src="${ad.media_url}" alt="" style="width:88px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;">`}
      <div style="flex:1;min-width:0;">
        <div style="font-size:10px;color:var(--muted);letter-spacing:.4px;text-transform:uppercase;margin-bottom:3px;">Sponsorisé</div>
        <div style="font-weight:700;font-size:14px;margin-bottom:2px;">${ad.titre}</div>
        ${ad.description ? `<div style="font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ad.description}</div>` : ""}
      </div>
      ${ad.lien_url ? `<a href="${ad.lien_url}" target="_blank" rel="noopener sponsored" class="btn btn-orange" style="flex-shrink:0;font-size:13px;" ${clic}>${ad.cta}</a>` : ""}
    </div>`;
    el.style.display = "";
  } catch(e) { el.style.display = "none"; }
}

function renderAllAdSlots(){
  document.querySelectorAll("[data-ad-emplacement]").forEach(el=>{
    if (el.id) renderAdSlot(el.id, el.dataset.adEmplacement);
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
  renderAllAdSlots();
  applyTranslations();

  // ── Sidebar mobile : hamburger toggle ──
  (function initSidebarMobile() {
    const toggle   = document.getElementById("sidebar-toggle");
    const close    = document.getElementById("sidebar-close");
    const backdrop = document.getElementById("sidebar-backdrop");
    const sidebar  = document.getElementById("sidebar");
    if (!toggle || !sidebar) return;

    function openSidebar() {
      sidebar.classList.add("open");
      backdrop.classList.add("open");
      document.body.style.overflow = "hidden";
    }
    function closeSidebar() {
      sidebar.classList.remove("open");
      backdrop.classList.remove("open");
      document.body.style.overflow = "";
    }

    toggle.addEventListener("click", openSidebar);
    if (close)    close.addEventListener("click", closeSidebar);
    if (backdrop) backdrop.addEventListener("click", closeSidebar);

    // Fermer automatiquement quand on clique un lien dans la sidebar
    sidebar.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => {
        if (window.innerWidth <= 768) closeSidebar();
      });
    });

    // Fermer avec Échap
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closeSidebar();
    });
  })();

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

  // ── Heartbeat session : envoie 30s toutes les 30s si connecté
  (function startHeartbeat() {
    const beat = () => fetch("/api/session/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secs: 30 })
    }).catch(() => {});
    // Premier battement après 10s pour laisser la page se charger
    setTimeout(beat, 10000);
    setInterval(beat, 30000);
  })();

  // ── O-Z : chargement automatique sur toutes les pages
  if (!window.__OZ_LOADED && !document.getElementById('oz-root')) {
    const _ozS = document.createElement('script');
    _ozS.src = '/assets/oz.js?v=76';
    _ozS.defer = true;
    document.head.appendChild(_ozS);
  }

  // ── Intégrer OZ + Chatbot dans la topbar (même ligne que le sélecteur de langue)
  function _insertIaSlots() {
    if (document.getElementById('ia-slots')) return;
    var tbr = document.querySelector('.topbar-right');
    if (!tbr) return;
    var slots = document.createElement('div');
    slots.id = 'ia-slots';
    slots.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';
    var auth = document.getElementById('auth-area');
    tbr.insertBefore(slots, auth || null);
  }

  function _moveToSlots() {
    _insertIaSlots();
    var slots = document.getElementById('ia-slots');
    if (!slots) return;
    // Chatbot FAB
    var fab = document.getElementById('cb-fab');
    if (fab && fab.parentElement !== slots) {
      fab.style.cssText = 'position:relative;';
      slots.appendChild(fab);
    }
    // OZ root
    var ozRoot = document.getElementById('oz-root');
    if (ozRoot && ozRoot.parentElement !== slots) {
      ozRoot.style.position = 'relative';
      ozRoot.style.top = ''; ozRoot.style.left = '';
      slots.appendChild(ozRoot);
    }
  }

  // Attendre que OZ et chatbot soient chargés
  _insertIaSlots();
  setTimeout(_moveToSlots, 900);
  setTimeout(_moveToSlots, 1800);
});

/* ── Bouton « Trouvez la perle rare » — inséré dans la barre de navigation de toutes les pages
   (accueil public + bandeau après connexion), à côté du bouton Formations. ── */
(function insertPerleRare(){
  function run(){
    document.querySelectorAll('nav.nav').forEach(function(nav){
      if(nav.querySelector('.nav-perle')) return;
      var a=document.createElement('a');
      a.href='annuaire.html';
      a.className='nav-perle';
      a.textContent='💎 Trouvez la perle rare';
      a.title='Découvrez les talents et initiatives de la diaspora';
      a.style.cssText='background:linear-gradient(90deg,#7c3aed,#db2777);color:#fff !important;padding:5px 12px;border-radius:8px;font-weight:700;';
      var form=nav.querySelector('a[href="formations.html"]');
      if(form) form.insertAdjacentElement('afterend', a);
      else nav.appendChild(a);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  setTimeout(run, 600);
})();
