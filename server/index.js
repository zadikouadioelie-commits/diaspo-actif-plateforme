/* ===========================================================
   DIASPO'ACTIF — Serveur (HTTP natif Node, sans dépendance externe)
   =========================================================== */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const url = require("node:url");
const db = require("./db");
const { hashPassword, verifyPassword, createSession, getSession, destroySession, parseCookies } = require("./auth");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, ".."); // dossier diaspoactif-site (fichiers statiques)
const SEUIL_CONFIDENTIALITE = 10;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function send(res, status, data, headers = {}) {
  res.writeHead(status, headers);
  res.end(data);
}

function sendJSON(res, status, obj, extraHeaders = {}) {
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8", ...extraHeaders });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
    });
    req.on("error", reject);
  });
}

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const sid = cookies.sid;
  if (!sid) return null;
  const session = getSession(sid);
  if (!session) return null;
  const user = db.prepare("SELECT id, nom, email, role, ville, pays, profil_json FROM users WHERE id = ?").get(session.userId);
  return user || null;
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, nom: u.nom, email: u.email, role: u.role, ville: u.ville, pays: u.pays, profil: safeParse(u.profil_json) };
}

function safeParse(s) {
  try { return JSON.parse(s || "{}"); } catch (e) { return {}; }
}

/* ---------- Routes API ---------- */
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const regex = new RegExp("^" + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return "([^/]+)"; }) + "$");
  routes.push({ method, regex, keys, handler });
}

route("POST", "/api/auth/signup", async (req, res, params, body) => {
  const {
    nom, prenom, email, password, role,
    date_naissance, nationalite1, nationalite2, nationalite3,
    pays, ville, adresse, code_postal, telephone,
    centres_interet, situation_pro,
    // initiative
    type_org, description, domaine, objectifs,
    nom_responsable, prenom_responsable, fonction_responsable, email_responsable, tel_responsable,
    site_web, reseaux_sociaux, pays_intervention,
    // collectivite
    type_institution, nom_institution, pays_concerne,
    telephone_pro, site_officiel
  } = body;

  if (!nom || !email || !password || !role) return sendJSON(res, 400, { error: "Champs requis manquants (nom, email, password, role)." });
  if (!["utilisateur", "initiative", "administrateur", "collectivite"].includes(role)) return sendJSON(res, 400, { error: "Rôle invalide." });
  if (password.length < 8) return sendJSON(res, 400, { error: "Le mot de passe doit comporter au moins 8 caractères." });

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return sendJSON(res, 409, { error: "Un compte existe déjà avec cet e-mail." });

  const { hash, salt } = hashPassword(password);

  const statutVerif = role === "utilisateur" ? "auto" : "en_attente";

  const id = db.prepare(`
    INSERT INTO users (nom, prenom, email, password_hash, password_salt, role,
      ville, pays, adresse, code_postal, telephone, date_naissance,
      nationalite1, nationalite2, nationalite3,
      centres_interet, situation_pro, type_institution, statut_verification)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nom, prenom || null, email, hash, salt, role,
    ville || null, (role === "collectivite" ? pays_concerne : pays) || null,
    adresse || null, code_postal || null, (telephone || telephone_pro) || null,
    date_naissance || null,
    nationalite1 || null, nationalite2 || null, nationalite3 || null,
    JSON.stringify(Array.isArray(centres_interet) ? centres_interet : []),
    situation_pro || null,
    type_institution || null,
    statutVerif
  ).lastInsertRowid;

  // Pour un compte Initiative : créer l'enregistrement d'initiative associé
  if (role === "initiative") {
    const slug = nom.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + id;
    db.prepare(`
      INSERT INTO initiatives (slug, nom, type, description, domaine, objectifs,
        pays, ville, adresse, code_postal, site_web, reseaux_sociaux,
        pays_intervention, nom_responsable, prenom_responsable, fonction_responsable,
        email_responsable, tel_responsable, owner_user_id, abonnement_actif)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      slug, nom_institution || nom, type_org || null, description || null, domaine || null, objectifs || null,
      pays || null, ville || null, adresse || null, code_postal || null,
      site_web || null,
      typeof reseaux_sociaux === "object" ? JSON.stringify(reseaux_sociaux) : (reseaux_sociaux || "{}"),
      JSON.stringify(Array.isArray(pays_intervention) ? pays_intervention : []),
      nom_responsable || nom || null, prenom_responsable || prenom || null,
      fonction_responsable || null, email_responsable || email,
      tel_responsable || telephone || null,
      id
    );
  }

  const token = createSession(id);
  const user = db.prepare("SELECT id, nom, prenom, email, role, ville, pays, statut_verification FROM users WHERE id = ?").get(id);
  sendJSON(res, 201, { user: publicUser(user) }, { "Set-Cookie": `sid=${token}; HttpOnly; Path=/; SameSite=Lax` });
});

route("POST", "/api/auth/login", async (req, res, params, body) => {
  const { email, password } = body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email || "");
  if (!user || !verifyPassword(password || "", user.password_salt, user.password_hash)) {
    return sendJSON(res, 401, { error: "E-mail ou mot de passe incorrect." });
  }
  const token = createSession(user.id);
  sendJSON(res, 200, { user: publicUser(user) }, { "Set-Cookie": `sid=${token}; HttpOnly; Path=/; SameSite=Lax` });
});

route("POST", "/api/auth/logout", async (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.sid) destroySession(cookies.sid);
  sendJSON(res, 200, { ok: true }, { "Set-Cookie": "sid=; HttpOnly; Path=/; Max-Age=0" });
});

route("GET", "/api/auth/me", async (req, res) => {
  const user = getCurrentUser(req);
  sendJSON(res, 200, { user: publicUser(user) });
});

/* ---------- Initiatives ---------- */
route("GET", "/api/initiatives", async (req, res, params, body, query) => {
  let rows = db.prepare("SELECT * FROM initiatives ORDER BY created_at DESC").all();
  const q = (query.q || "").toLowerCase();
  if (q) rows = rows.filter(r => r.nom.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q));
  if (query.pays) rows = rows.filter(r => r.pays === query.pays);
  if (query.domaine) rows = rows.filter(r => r.domaine === query.domaine);
  if (query.type) rows = rows.filter(r => r.type === query.type);
  if (query.nationalite_unique === "1") rows = rows.filter(r => r.nationalite_unique === 1);
  rows = rows.map(r => ({ ...r, nationalites_concernees: safeParse(r.nationalites_concernees), nationalite_unique: !!r.nationalite_unique, abonnement_actif: !!r.abonnement_actif }));
  sendJSON(res, 200, { initiatives: rows });
});

route("GET", "/api/initiatives/:id", async (req, res, params) => {
  const row = db.prepare("SELECT * FROM initiatives WHERE id = ? OR slug = ?").get(params.id, params.id);
  if (!row) return sendJSON(res, 404, { error: "Initiative introuvable." });
  row.nationalites_concernees = safeParse(row.nationalites_concernees);
  row.nationalite_unique = !!row.nationalite_unique;
  row.abonnement_actif = !!row.abonnement_actif;
  sendJSON(res, 200, { initiative: row });
});

route("POST", "/api/initiatives", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || !["initiative", "collectivite", "administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Seul un compte Initiative, Collectivité ou Administrateur peut créer une initiative." });
  const { nom, sigle, pays, region, ville, zone, domaine, type, description, nationalite1, nationalite2, nationalites_concernees, nationalite_unique } = body;
  if (!nom || !pays) return sendJSON(res, 400, { error: "Nom et pays requis." });
  const slug = nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
  const id = db.prepare(`
    INSERT INTO initiatives (slug, nom, sigle, pays, region, ville, zone, nationalite1, nationalite2, nationalites_concernees, nationalite_unique, domaine, type, description, owner_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slug, nom, sigle || null, pays, region || null, ville || null, zone || null, nationalite1 || null, nationalite2 || null,
    JSON.stringify(nationalites_concernees || []), nationalite_unique ? 1 : 0, domaine || null, type || null, description || null, user.id).lastInsertRowid;
  sendJSON(res, 201, { id, slug });
});

/* ---------- Abonnement (simulation — aucun paiement réel) ---------- */
route("POST", "/api/initiatives/:id/abonnement", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const init = db.prepare("SELECT * FROM initiatives WHERE id = ?").get(params.id);
  if (!init) return sendJSON(res, 404, { error: "Initiative introuvable." });
  if (init.owner_user_id !== user.id) return sendJSON(res, 403, { error: "Vous n'êtes pas responsable de cette initiative." });
  const actif = body.actif ? 1 : 0;
  db.prepare("UPDATE initiatives SET abonnement_actif = ? WHERE id = ?").run(actif, params.id);
  sendJSON(res, 200, { ok: true, abonnement_actif: !!actif, note: "Démonstration — aucun paiement réel n'est traité dans ce prototype." });
});

/* ---------- Actualités ---------- */
route("GET", "/api/actualites", async (req, res) => {
  sendJSON(res, 200, { actualites: db.prepare("SELECT * FROM actualites ORDER BY created_at DESC").all() });
});

const TYPE_PAR_ROLE = { utilisateur: "Utilisateur", initiative: "Association", administrateur: "Institution", collectivite: "Institution" };

route("POST", "/api/fil", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise pour publier." });
  if (!body.contenu) return sendJSON(res, 400, { error: "Contenu requis." });
  const type = TYPE_PAR_ROLE[user.role] || "Utilisateur";
  const id = db.prepare("INSERT INTO fil_posts (auteur_id, auteur_nom, type, categorie, contenu) VALUES (?, ?, ?, ?, ?)")
    .run(user.id, user.nom, type, body.categorie || "Publication", body.contenu).lastInsertRowid;
  sendJSON(res, 201, { id });
});

route("POST", "/api/fil/:id/react", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const type = body.type || "like";
  try {
    db.prepare("INSERT INTO fil_reactions (post_id, user_id, type) VALUES (?, ?, ?)").run(params.id, user.id, type);
  } catch (e) { /* déjà réagi avec ce type : ignorer (contrainte UNIQUE) */ }
  const reactions = db.prepare("SELECT type, COUNT(*) AS n FROM fil_reactions WHERE post_id = ? GROUP BY type").all(params.id);
  const counts = {};
  reactions.forEach(r => counts[r.type] = r.n);
  // Notifier l'auteur du post
  const post = db.prepare("SELECT auteur_id,contenu FROM fil_posts WHERE id=?").get(params.id);
  if (post && post.auteur_id && post.auteur_id !== user.id) {
    creerNotif(post.auteur_id, "reaction", "Réaction sur votre post", `${user.nom} a réagi à votre publication`, { post_id: Number(params.id) });
  }
  sendJSON(res, 200, { reactions: counts });
});

/* ================================================================
   MESSAGERIE INTERNE UNIFIÉE
   ================================================================ */

/* Matrice d'initiation : qui peut DÉMARRER une conversation avec qui.
   Les comptes officiels (collectivite) ne peuvent pas initier avec des
   utilisateurs (personnes physiques) — ils peuvent répondre seulement
   si l'utilisateur a contacté en premier. */
const PEUT_INITIER = {
  utilisateur:   ["utilisateur", "initiative", "collectivite", "administrateur"],
  initiative:    ["utilisateur", "initiative", "collectivite", "administrateur"],
  collectivite:  ["initiative", "collectivite", "administrateur"],
  administrateur:["utilisateur", "initiative", "collectivite", "administrateur"],
};
const PEUT_CONTACTER = PEUT_INITIER;

function convAnonyme(conv, userId) {
  const isU1 = conv.user1_id === userId;
  return {
    ...conv,
    autre_id: isU1 ? conv.user2_id : conv.user1_id,
    archive: isU1 ? !!conv.archive_u1 : !!conv.archive_u2,
    deleted: isU1 ? !!conv.deleted_u1 : !!conv.deleted_u2,
  };
}

/* GET /api/conversations — liste des conversations (avec stats) */
route("GET", "/api/conversations", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });

  const filtre = query.filtre || "tous"; // tous | non_lus | archives
  const q = (query.q || "").toLowerCase();

  const rows = db.prepare(`
    SELECT c.*,
      u.nom AS avec_nom, u.role AS avec_role, u.ville AS avec_ville,
      (SELECT contenu FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS derniere,
      (SELECT type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS derniere_type,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS derniere_date,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND lu = 0) AS non_lus
    FROM conversations c
    JOIN users u ON u.id = CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END
    WHERE (c.user1_id = ? OR c.user2_id = ?)
      AND (CASE WHEN c.user1_id = ? THEN c.deleted_u1 ELSE c.deleted_u2 END) = 0
    ORDER BY COALESCE(derniere_date, c.created_at) DESC
  `).all(user.id, user.id, user.id, user.id, user.id);

  let filtered = rows.map(r => ({ ...r, archive: r.user1_id === user.id ? !!r.archive_u1 : !!r.archive_u2 }));

  if (filtre === "non_lus") filtered = filtered.filter(r => r.non_lus > 0);
  if (filtre === "archives") filtered = filtered.filter(r => r.archive);
  else if (filtre === "tous") filtered = filtered.filter(r => !r.archive);

  if (q) filtered = filtered.filter(r =>
    (r.avec_nom||"").toLowerCase().includes(q) ||
    (r.sujet||"").toLowerCase().includes(q) ||
    (r.derniere||"").toLowerCase().includes(q)
  );

  sendJSON(res, 200, { conversations: filtered });
});

/* POST /api/conversations — créer ou retrouver une conversation */
route("POST", "/api/conversations", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });

  const otherId = Number(body.user_id);
  if (!otherId || otherId === user.id) return sendJSON(res, 400, { error: "Destinataire invalide." });

  const other = db.prepare("SELECT id, nom, role FROM users WHERE id = ?").get(otherId);
  if (!other) return sendJSON(res, 404, { error: "Destinataire introuvable." });

  let conv = db.prepare("SELECT * FROM conversations WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)").get(user.id, otherId, otherId, user.id);

  // Vérification d'initiation uniquement pour les NOUVELLES conversations
  if (!conv) {
    const allowed = PEUT_INITIER[user.role] || [];
    if (!allowed.includes(other.role)) {
      const msg = user.role === "collectivite"
        ? "Les comptes officiels ne peuvent pas initier un contact avec un utilisateur. L'utilisateur doit vous contacter en premier."
        : `Votre rôle (${user.role}) ne peut pas initier une conversation avec ce type de compte (${other.role}).`;
      return sendJSON(res, 403, { error: msg });
    }
  }
  if (conv) {
    // Réactiver si supprimé côté expéditeur
    if (conv.user1_id === user.id && conv.deleted_u1) db.prepare("UPDATE conversations SET deleted_u1=0 WHERE id=?").run(conv.id);
    if (conv.user2_id === user.id && conv.deleted_u2) db.prepare("UPDATE conversations SET deleted_u2=0 WHERE id=?").run(conv.id);
  } else {
    const id = db.prepare("INSERT INTO conversations (user1_id, user2_id, sujet) VALUES (?, ?, ?)").run(user.id, otherId, body.sujet || null).lastInsertRowid;
    conv = { id };
  }
  sendJSON(res, 201, { conversation_id: conv.id });
});

/* GET /api/conversations/:id/messages — charger les messages + marquer lu */
route("GET", "/api/conversations/:id/messages", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });

  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(params.id);
  if (!conv || (conv.user1_id !== user.id && conv.user2_id !== user.id)) return sendJSON(res, 403, { error: "Accès refusé." });

  // Marquer comme lus les messages reçus
  db.prepare("UPDATE messages SET lu=1 WHERE conversation_id=? AND sender_id!=? AND lu=0").run(params.id, user.id);

  const messages = db.prepare("SELECT m.*, u.nom AS sender_nom, u.role AS sender_role FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = ? ORDER BY m.created_at ASC").all(params.id);
  const autre = db.prepare("SELECT id, nom, role, ville, pays FROM users WHERE id=?").get(conv.user1_id === user.id ? conv.user2_id : conv.user1_id);

  sendJSON(res, 200, { messages, autre, conversation: conv });
});

/* POST /api/conversations/:id/messages — envoyer un message */
route("POST", "/api/conversations/:id/messages", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });

  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(params.id);
  if (!conv || (conv.user1_id !== user.id && conv.user2_id !== user.id)) return sendJSON(res, 403, { error: "Accès refusé." });

  const contenu = (body.contenu || "").trim();
  const type = body.type || "text"; // text | file | image | link
  const fichier = body.fichier || null; // { nom, url, taille, mime }

  if (!contenu && !fichier) return sendJSON(res, 400, { error: "Message vide." });

  const id = db.prepare("INSERT INTO messages (conversation_id, sender_id, contenu, type, fichier_json) VALUES (?, ?, ?, ?, ?)").run(
    params.id, user.id, contenu || (fichier?.nom || ""), type,
    fichier ? JSON.stringify(fichier) : null
  ).lastInsertRowid;

  // Réactiver la conv si l'autre l'avait supprimée
  if (conv.user1_id === user.id && conv.deleted_u2) db.prepare("UPDATE conversations SET deleted_u2=0 WHERE id=?").run(conv.id);
  if (conv.user2_id === user.id && conv.deleted_u1) db.prepare("UPDATE conversations SET deleted_u1=0 WHERE id=?").run(conv.id);

  const msg = db.prepare("SELECT m.*, u.nom AS sender_nom FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?").get(id);
  // Notifier le destinataire
  const otherId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;
  creerNotif(otherId, "message", "Nouveau message", `${user.nom} vous a envoyé un message`, { conversation_id: conv.id });
  sendJSON(res, 201, { message: msg });
});

/* PATCH /api/conversations/:id/archive — archiver/désarchiver */
route("PATCH", "/api/conversations/:id/archive", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(params.id);
  if (!conv || (conv.user1_id !== user.id && conv.user2_id !== user.id)) return sendJSON(res, 403, { error: "Accès refusé." });

  const col = conv.user1_id === user.id ? "archive_u1" : "archive_u2";
  const current = conv[col];
  db.prepare(`UPDATE conversations SET ${col}=? WHERE id=?`).run(current ? 0 : 1, conv.id);
  sendJSON(res, 200, { archive: !current });
});

/* DELETE /api/conversations/:id — suppression douce côté utilisateur */
route("DELETE", "/api/conversations/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(params.id);
  if (!conv || (conv.user1_id !== user.id && conv.user2_id !== user.id)) return sendJSON(res, 403, { error: "Accès refusé." });

  const col = conv.user1_id === user.id ? "deleted_u1" : "deleted_u2";
  db.prepare(`UPDATE conversations SET ${col}=1 WHERE id=?`).run(conv.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/messages/non-lus — compteur global pour la topbar */
route("GET", "/api/messages/non-lus", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 200, { total: 0 });
  const r = db.prepare(`
    SELECT COUNT(*) AS n FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.sender_id != ? AND m.lu = 0
      AND (c.user1_id = ? OR c.user2_id = ?)
      AND (CASE WHEN c.user1_id = ? THEN c.deleted_u1 ELSE c.deleted_u2 END) = 0
  `).get(user.id, user.id, user.id, user.id);
  sendJSON(res, 200, { total: r.n });
});

/* GET /api/users/search?q= — chercher des utilisateurs pour démarrer une conversation */
route("GET", "/api/users/search", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });

  const q = (query.q || "").trim();
  if (q.length < 2) return sendJSON(res, 200, { users: [] });

  const allowed = PEUT_CONTACTER[user.role] || [];
  const placeholders = allowed.map(() => "?").join(",");
  if (!placeholders) return sendJSON(res, 200, { users: [] });

  const pattern = `%${q}%`;
  const results = db.prepare(`
    SELECT id, nom, role, ville, pays FROM users
    WHERE id != ? AND role IN (${placeholders})
      AND (nom LIKE ? OR email LIKE ?)
    LIMIT 10
  `).all(user.id, ...allowed, pattern, pattern);

  sendJSON(res, 200, { users: results });
});


/* ---------- Abonnements : suivre / ne plus suivre une initiative ---------- */
route("POST", "/api/initiatives/:id/suivre", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (user.role !== "utilisateur") return sendJSON(res, 403, { error: "Seuls les comptes Utilisateur peuvent suivre une initiative." });
  const init = db.prepare("SELECT id, abonnes FROM initiatives WHERE id = ?").get(params.id);
  if (!init) return sendJSON(res, 404, { error: "Initiative introuvable." });
  try {
    db.prepare("INSERT INTO abonnements (user_id, initiative_id) VALUES (?, ?)").run(user.id, params.id);
    db.prepare("UPDATE initiatives SET abonnes = abonnes + 1 WHERE id = ?").run(params.id);
    sendJSON(res, 201, { ok: true, abonne: true });
  } catch (e) {
    sendJSON(res, 409, { ok: false, abonne: true, message: "Déjà abonné." });
  }
});

route("DELETE", "/api/initiatives/:id/suivre", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const info = db.prepare("DELETE FROM abonnements WHERE user_id = ? AND initiative_id = ?").run(user.id, params.id);
  if (info.changes > 0) db.prepare("UPDATE initiatives SET abonnes = MAX(0, abonnes - 1) WHERE id = ?").run(params.id);
  sendJSON(res, 200, { ok: true, abonne: false });
});

route("GET", "/api/mes-suivis", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = db.prepare(`
    SELECT i.*, a.created_at AS suivi_depuis
    FROM abonnements a
    JOIN initiatives i ON i.id = a.initiative_id
    WHERE a.user_id = ?
    ORDER BY a.created_at DESC
  `).all(user.id);
  const mapped = rows.map(r => ({
    ...r,
    nationalites_concernees: safeParse(r.nationalites_concernees),
    nationalite_unique: !!r.nationalite_unique,
    abonnement_actif: !!r.abonnement_actif
  }));
  sendJSON(res, 200, { initiatives: mapped });
});

/* ---------- Formations ---------- */
route("GET", "/api/formations", async (req, res, params, body, query) => {
  let rows = db.prepare("SELECT * FROM formations ORDER BY created_at DESC").all();
  if (query.domaine) rows = rows.filter(r => r.domaine === query.domaine);
  if (query.type) rows = rows.filter(r => r.type_formation === query.type);
  if (query.niveau) rows = rows.filter(r => r.niveau === query.niveau);
  if (query.langue) rows = rows.filter(r => r.langue === query.langue);
  if (query.gratuit === "1") rows = rows.filter(r => r.gratuit === 1);
  if (query.q) {
    const q = query.q.toLowerCase();
    rows = rows.filter(r => (r.titre + r.description + r.organisme).toLowerCase().includes(q));
  }
  sendJSON(res, 200, { formations: rows });
});

route("GET", "/api/formations/:id", async (req, res, params) => {
  const row = db.prepare("SELECT * FROM formations WHERE id = ?").get(params.id);
  if (!row) return sendJSON(res, 404, { error: "Formation introuvable." });
  sendJSON(res, 200, { formation: row });
});

route("POST", "/api/formations", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || !["initiative", "administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé aux comptes Initiative et Administrateur." });
  const { titre, type_formation, organisme, domaine, nationalite, langue, niveau, description, prix, gratuit, duree, places } = body;
  if (!titre) return sendJSON(res, 400, { error: "Le titre est requis." });
  const init = db.prepare("SELECT id FROM initiatives WHERE owner_user_id = ?").get(user.id);
  const id = db.prepare(`
    INSERT INTO formations (titre, type_formation, organisme, domaine, nationalite, langue, niveau, description, prix, gratuit, duree, places, initiative_id, owner_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(titre, type_formation || null, organisme || null, domaine || null, nationalite || null, langue || "Français",
    niveau || null, description || null, prix || 0, gratuit ? 1 : 0, duree || null, places || null,
    init ? init.id : null, user.id).lastInsertRowid;
  sendJSON(res, 201, { id });
});

/* ---------- Dashboard Initiative (données réelles de l'initiative de l'utilisateur connecté) ---------- */
route("GET", "/api/dashboard/initiative", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (user.role !== "initiative") return sendJSON(res, 403, { error: "Réservé aux comptes Initiative." });

  const initiative = db.prepare("SELECT * FROM initiatives WHERE owner_user_id = ?").get(user.id);
  const messagesNonLusRow = db.prepare(`SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.sender_id!=? AND m.lu=0 AND (c.user1_id=? OR c.user2_id=?)`).get(user.id, user.id, user.id);
  const messagesNonLus = messagesNonLusRow.n;
  const publications = db.prepare("SELECT * FROM fil_posts WHERE auteur_id = ? ORDER BY created_at DESC LIMIT 5").all(user.id);

  sendJSON(res, 200, {
    initiative: initiative ? {
      ...initiative,
      nationalites_concernees: safeParse(initiative.nationalites_concernees),
      nationalite_unique: !!initiative.nationalite_unique,
      abonnement_actif: !!initiative.abonnement_actif
    } : null,
    messages_non_lus: messagesNonLus,
    publications_recentes: publications
  });
});

/* ---------- Dashboard Administrateur ---------- */
route("GET", "/api/dashboard/administrateur", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });

  const totalUtilisateurs = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'utilisateur'").get().n;
  const totalInitiatives = db.prepare("SELECT COUNT(*) AS n FROM initiatives").get().n;
  const totalPublications = db.prepare("SELECT COUNT(*) AS n FROM fil_posts").get().n;
  const totalFormations = db.prepare("SELECT COUNT(*) AS n FROM formations").get().n;
  const totalAbonnements = db.prepare("SELECT COUNT(*) AS n FROM abonnements").get().n;
  const totalCollectivites = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'collectivite'").get().n;
  const publicationsRecentes = db.prepare("SELECT * FROM fil_posts ORDER BY created_at DESC LIMIT 10").all();
  const derniersInscrits = db.prepare("SELECT id, nom, email, role, ville, pays, created_at FROM users ORDER BY created_at DESC LIMIT 8").all();

  sendJSON(res, 200, {
    total_utilisateurs: totalUtilisateurs,
    total_initiatives: totalInitiatives,
    total_publications: totalPublications,
    total_formations: totalFormations,
    total_abonnements: totalAbonnements,
    total_collectivites: totalCollectivites,
    signalements: 3,
    publications_recentes: publicationsRecentes,
    derniers_inscrits: derniersInscrits
  });
});

/* ---------- Dashboard Collectivité ---------- */
route("GET", "/api/dashboard/collectivite", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (user.role !== "collectivite") return sendJSON(res, 403, { error: "Réservé aux Collectivités." });

  const totalMembres = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role IN ('utilisateur', 'initiative')").get().n;
  const totalInitiatives = db.prepare("SELECT COUNT(*) AS n FROM initiatives").get().n;
  const paysRows = db.prepare("SELECT pays, COUNT(*) AS n FROM users WHERE role = 'utilisateur' AND pays IS NOT NULL GROUP BY pays ORDER BY n DESC LIMIT 10").all();

  sendJSON(res, 200, {
    total_membres: totalMembres,
    total_initiatives: totalInitiatives,
    repartition_pays: paysRows
  });
});

/* ---------- Observatoire statistique (agrégé, anonymisé) ---------- */
route("GET", "/api/observatoire", async (req, res, params, body, query) => {
  const nationalite = query.nationalite || null;
  let rows = db.prepare("SELECT pays, ville, COUNT(*) AS n FROM users WHERE role = 'utilisateur' GROUP BY pays, ville").all();
  rows = rows.filter(r => r.pays);
  const mask = (n) => n < SEUIL_CONFIDENTIALITE ? null : n;
  const parPays = {};
  rows.forEach(r => {
    if (!parPays[r.pays]) parPays[r.pays] = { pays: r.pays, membres: 0, villes: [] };
    parPays[r.pays].membres += r.n;
    if (r.ville) parPays[r.pays].villes.push({ ville: r.ville, membres: mask(r.n) });
  });
  Object.values(parPays).forEach(p => p.membres = mask(p.membres));
  const totalMembres = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'utilisateur'").get().n;
  sendJSON(res, 200, { nationalite, seuil_confidentialite: SEUIL_CONFIDENTIALITE, total_membres: totalMembres, par_pays: Object.values(parPays) });
});

/* ---------- Profil (mise à jour étendue) ---------- */
route("PUT", "/api/profil", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const { nom, prenom, ville, pays, bio, photo_url, centres_interet, situation_pro, telephone } = body;
  const fields = [];
  const vals = [];
  if (nom) { fields.push("nom=?"); vals.push(nom); }
  if (prenom !== undefined) { fields.push("prenom=?"); vals.push(prenom); }
  if (ville !== undefined) { fields.push("ville=?"); vals.push(ville); }
  if (pays !== undefined) { fields.push("pays=?"); vals.push(pays); }
  if (bio !== undefined) { fields.push("bio=?"); vals.push(bio); }
  if (photo_url !== undefined) { fields.push("photo_url=?"); vals.push(photo_url); }
  if (centres_interet !== undefined) { fields.push("centres_interet=?"); vals.push(JSON.stringify(Array.isArray(centres_interet) ? centres_interet : [])); }
  if (situation_pro !== undefined) { fields.push("situation_pro=?"); vals.push(situation_pro); }
  if (telephone !== undefined) { fields.push("telephone=?"); vals.push(telephone); }
  if (body.profil !== undefined) {
    const current = db.prepare("SELECT profil_json FROM users WHERE id=?").get(user.id);
    const merged = { ...safeParse(current.profil_json), ...body.profil };
    fields.push("profil_json=?"); vals.push(JSON.stringify(merged));
  }
  if (fields.length) { vals.push(user.id); db.prepare(`UPDATE users SET ${fields.join(",")} WHERE id=?`).run(...vals); }
  const updated = db.prepare("SELECT id,nom,prenom,email,role,ville,pays,bio,photo_url,centres_interet,situation_pro,telephone,profil_json FROM users WHERE id=?").get(user.id);
  sendJSON(res, 200, { profil: { ...publicUser(updated), bio: updated.bio, photo_url: updated.photo_url, prenom: updated.prenom, centres_interet: safeParse(updated.centres_interet), situation_pro: updated.situation_pro, telephone: updated.telephone } });
});

route("GET", "/api/profil/:id", async (req, res, params) => {
  const u = db.prepare("SELECT id,nom,prenom,email,role,ville,pays,bio,photo_url,centres_interet,situation_pro,profil_json,created_at FROM users WHERE id=?").get(params.id);
  if (!u) return sendJSON(res, 404, { error: "Profil introuvable." });
  sendJSON(res, 200, { profil: { ...publicUser(u), bio: u.bio, photo_url: u.photo_url, prenom: u.prenom, centres_interet: safeParse(u.centres_interet || "[]"), situation_pro: u.situation_pro, created_at: u.created_at } });
});

/* ---------- Upload simulé ---------- */
route("POST", "/api/upload", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const ext = (body.nom || "file.jpg").split(".").pop().toLowerCase();
  const fakeUrl = `/assets/uploads/demo-${Date.now()}.${ext}`;
  sendJSON(res, 200, { url: fakeUrl, nom: body.nom, note: "Prototype — upload simulé, aucun fichier réel stocké." });
});

/* ---------- Recherche globale ---------- */
route("GET", "/api/recherche", async (req, res, params, body, query) => {
  const q = (query.q || "").trim();
  if (q.length < 2) return sendJSON(res, 200, { utilisateurs: [], initiatives: [], publications: [], formations: [], evenements: [] });
  const like = `%${q}%`;
  const type = query.type || "tous";

  const utilisateurs = (type === "tous" || type === "utilisateurs")
    ? db.prepare("SELECT id,nom,role,ville,pays FROM users WHERE (nom LIKE ? OR ville LIKE ?) AND role != 'administrateur' LIMIT 8").all(like, like)
    : [];
  const initiatives = (type === "tous" || type === "initiatives")
    ? db.prepare("SELECT id,slug,nom,domaine,pays,ville,description FROM initiatives WHERE nom LIKE ? OR description LIKE ? OR domaine LIKE ? LIMIT 8").all(like, like, like)
    : [];
  const publications = (type === "tous" || type === "publications")
    ? db.prepare("SELECT id,auteur_nom,contenu,categorie,created_at FROM fil_posts WHERE contenu LIKE ? OR auteur_nom LIKE ? LIMIT 8").all(like, like)
    : [];
  const formations = (type === "tous" || type === "formations")
    ? db.prepare("SELECT id,titre,domaine,organisme,gratuit,duree FROM formations WHERE titre LIKE ? OR description LIKE ? OR organisme LIKE ? LIMIT 8").all(like, like, like)
    : [];
  const evenements = (type === "tous" || type === "evenements")
    ? db.prepare("SELECT id,titre,lieu,date_evt,type_evt,pays FROM evenements WHERE titre LIKE ? OR lieu LIKE ? OR description LIKE ? LIMIT 8").all(like, like, like)
    : [];

  sendJSON(res, 200, { q, utilisateurs, initiatives, publications, formations, evenements });
});

/* ---------- Notifications ---------- */
function creerNotif(userId, type, titre, contenu, data = {}) {
  try {
    db.prepare("INSERT INTO notifications (user_id,type,titre,contenu,data_json) VALUES (?,?,?,?,?)").run(userId, type, titre, contenu, JSON.stringify(data));
  } catch (e) { /* silencieux */ }
}

route("GET", "/api/notifications", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const limit = Math.min(Number(query.limit) || 20, 50);
  const rows = db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?").all(user.id, limit);
  const non_lues = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND lue=0").get(user.id).n;
  sendJSON(res, 200, { notifications: rows.map(r => ({ ...r, data: safeParse(r.data_json) })), non_lues });
});

route("PATCH", "/api/notifications/:id/lire", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  db.prepare("UPDATE notifications SET lue=1 WHERE id=? AND user_id=?").run(params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

route("POST", "/api/notifications/lire-tout", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  db.prepare("UPDATE notifications SET lue=1 WHERE user_id=?").run(user.id);
  sendJSON(res, 200, { ok: true });
});

/* ---------- Événements (complet) ---------- */
route("GET", "/api/evenements", async (req, res, params, body, query) => {
  let rows = db.prepare("SELECT e.*, u.nom AS organisateur_nom FROM evenements e LEFT JOIN users u ON u.id=e.owner_user_id ORDER BY e.date_evt ASC").all();
  if (query.domaine) rows = rows.filter(r => r.domaine === query.domaine);
  if (query.pays) rows = rows.filter(r => r.pays === query.pays);
  if (query.type) rows = rows.filter(r => r.type_evt === query.type);
  if (query.q) { const q = query.q.toLowerCase(); rows = rows.filter(r => (r.titre+r.lieu+r.description||"").toLowerCase().includes(q)); }
  const withCounts = rows.map(r => ({ ...r, nb_participants: db.prepare("SELECT COUNT(*) AS n FROM evenements_participants WHERE evenement_id=?").get(r.id)?.n || 0 }));
  sendJSON(res, 200, { evenements: withCounts });
});

route("POST", "/api/evenements", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || !["initiative","administrateur","collectivite"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé aux comptes Initiative, Collectivité et Administrateur." });
  const { titre, organisateur, date_evt, lieu, pays, ville, description, type_evt, domaine, places_max, inscription_ouverte, lien_inscription, image_url } = body;
  if (!titre || !date_evt) return sendJSON(res, 400, { error: "Titre et date requis." });
  const id = db.prepare(`INSERT INTO evenements (titre,organisateur,date_evt,lieu,pays,ville,description,type_evt,domaine,places_max,inscription_ouverte,lien_inscription,image_url,statut,owner_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'ouvert',?)`)
    .run(titre, organisateur || user.nom, date_evt, lieu||null, pays||null, ville||null, description||null, type_evt||"evenement", domaine||null, places_max||null, inscription_ouverte!==false?1:0, lien_inscription||null, image_url||null, user.id).lastInsertRowid;
  // Notifier abonnés de l'initiative
  const init = db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(user.id);
  if (init) {
    const abonnes = db.prepare("SELECT user_id FROM abonnements WHERE initiative_id=?").all(init.id);
    abonnes.forEach(a => creerNotif(a.user_id, "evenement", "Nouvel événement", `${user.nom} organise : ${titre}`, { evenement_id: id }));
  }
  sendJSON(res, 201, { id });
});

route("GET", "/api/evenements/:id", async (req, res, params) => {
  const row = db.prepare("SELECT e.*,u.nom AS organisateur_nom FROM evenements e LEFT JOIN users u ON u.id=e.owner_user_id WHERE e.id=?").get(params.id);
  if (!row) return sendJSON(res, 404, { error: "Événement introuvable." });
  const participants = db.prepare("SELECT u.id,u.nom,u.ville FROM evenements_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.evenement_id=?").all(params.id);
  sendJSON(res, 200, { evenement: row, participants, nb_participants: participants.length });
});

route("POST", "/api/evenements/:id/rejoindre", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const evt = db.prepare("SELECT * FROM evenements WHERE id=?").get(params.id);
  if (!evt) return sendJSON(res, 404, { error: "Événement introuvable." });
  if (!evt.inscription_ouverte) return sendJSON(res, 400, { error: "Les inscriptions sont fermées." });
  if (evt.places_max) {
    const nb = db.prepare("SELECT COUNT(*) AS n FROM evenements_participants WHERE evenement_id=?").get(params.id).n;
    if (nb >= evt.places_max) return sendJSON(res, 400, { error: "Plus de places disponibles." });
  }
  try {
    db.prepare("INSERT INTO evenements_participants (evenement_id,user_id) VALUES (?,?)").run(params.id, user.id);
    if (evt.owner_user_id && evt.owner_user_id !== user.id) creerNotif(evt.owner_user_id, "evenement", "Nouvelle inscription", `${user.nom} s'est inscrit à « ${evt.titre} »`, { evenement_id: evt.id });
    sendJSON(res, 201, { ok: true, inscrit: true });
  } catch(e) { sendJSON(res, 409, { ok: false, inscrit: true, message: "Déjà inscrit." }); }
});

route("DELETE", "/api/evenements/:id/quitter", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  db.prepare("DELETE FROM evenements_participants WHERE evenement_id=? AND user_id=?").run(params.id, user.id);
  sendJSON(res, 200, { ok: true, inscrit: false });
});

route("GET", "/api/mes-evenements", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = db.prepare("SELECT e.* FROM evenements_participants ep JOIN evenements e ON e.id=ep.evenement_id WHERE ep.user_id=? ORDER BY e.date_evt ASC").all(user.id);
  sendJSON(res, 200, { evenements: rows });
});

/* ---------- Modération administrateur ---------- */
route("GET", "/api/admin/comptes", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const statut = query.statut || "en_attente";
  const rows = db.prepare("SELECT id,nom,prenom,email,role,ville,pays,statut_verification,created_at FROM users WHERE statut_verification=? ORDER BY created_at DESC").all(statut);
  sendJSON(res, 200, { comptes: rows });
});

route("PATCH", "/api/admin/comptes/:id/valider", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  db.prepare("UPDATE users SET statut_verification='valide' WHERE id=?").run(params.id);
  const cible = db.prepare("SELECT nom FROM users WHERE id=?").get(params.id);
  if (cible) creerNotif(Number(params.id), "validation", "Compte validé !", "Votre compte a été validé par l'équipe Diaspo'Actif. Vous avez maintenant accès à toutes les fonctionnalités.", {});
  sendJSON(res, 200, { ok: true, statut: "valide" });
});

route("PATCH", "/api/admin/comptes/:id/rejeter", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  db.prepare("UPDATE users SET statut_verification='rejete' WHERE id=?").run(params.id);
  const motif = body.motif || "Documents insuffisants";
  creerNotif(Number(params.id), "validation", "Demande non retenue", `Votre demande n'a pas pu être validée : ${motif}. Contactez-nous pour plus d'informations.`, { motif });
  sendJSON(res, 200, { ok: true, statut: "rejete" });
});

route("DELETE", "/api/admin/contenu/:type/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const tables = { post: "fil_posts", formation: "formations", evenement: "evenements" };
  const table = tables[params.type];
  if (!table) return sendJSON(res, 400, { error: "Type de contenu invalide." });
  db.prepare(`DELETE FROM ${table} WHERE id=?`).run(params.id);
  sendJSON(res, 200, { ok: true });
});

route("GET", "/api/admin/contenus", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const posts = db.prepare("SELECT p.*,u.nom AS auteur FROM fil_posts p LEFT JOIN users u ON u.id=p.auteur_id ORDER BY p.created_at DESC LIMIT 20").all();
  const formations = db.prepare("SELECT f.*,u.nom AS auteur FROM formations f LEFT JOIN users u ON u.id=f.owner_user_id ORDER BY f.created_at DESC LIMIT 20").all();
  const evenements = db.prepare("SELECT e.*,u.nom AS auteur FROM evenements e LEFT JOIN users u ON u.id=e.owner_user_id ORDER BY e.created_at DESC LIMIT 20").all();
  sendJSON(res, 200, { posts, formations, evenements });
});

/* ---------- Collaborations (appels à contribution) ---------- */
route("GET", "/api/collaborations", async (req, res, params, body, query) => {
  let rows = db.prepare(`SELECT c.*,u.nom AS auteur_nom,i.nom AS initiative_nom FROM collaborations c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN initiatives i ON i.id=c.initiative_id ORDER BY c.created_at DESC`).all();
  if (query.type) rows = rows.filter(r => r.type_collab === query.type);
  if (query.statut) rows = rows.filter(r => r.statut === query.statut); else rows = rows.filter(r => (r.statut||"ouvert") === "ouvert");
  if (query.q) { const q = query.q.toLowerCase(); rows = rows.filter(r => ((r.titre||"")+(r.description||"")).toLowerCase().includes(q)); }
  const withCounts = rows.map(r => ({ ...r, nb_candidatures: db.prepare("SELECT COUNT(*) AS n FROM candidatures WHERE collaboration_id=?").get(r.id)?.n || 0, competences: safeParse(r.competences || "[]") }));
  sendJSON(res, 200, { collaborations: withCounts });
});

route("POST", "/api/collaborations", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || !["initiative","administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé aux comptes Initiative et Administrateur." });
  const { titre, partenaire, description, type_collab, competences, deadline } = body;
  if (!titre) return sendJSON(res, 400, { error: "Titre requis." });
  const init = db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(user.id);
  const id = db.prepare("INSERT INTO collaborations (user_id,partenaire,titre,description,type_collab,competences,deadline,statut,initiative_id) VALUES (?,?,?,?,?,?,?,'ouvert',?)")
    .run(user.id, partenaire||user.nom, titre, description||null, type_collab||"benevolat", JSON.stringify(Array.isArray(competences)?competences:[]), deadline||null, init?.id||null).lastInsertRowid;
  sendJSON(res, 201, { id });
});

route("GET", "/api/collaborations/:id", async (req, res, params) => {
  const row = db.prepare("SELECT c.*,u.nom AS auteur_nom,i.nom AS initiative_nom FROM collaborations c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN initiatives i ON i.id=c.initiative_id WHERE c.id=?").get(params.id);
  if (!row) return sendJSON(res, 404, { error: "Collaboration introuvable." });
  const candidatures = db.prepare("SELECT ca.*,u.nom AS candidat_nom FROM candidatures ca JOIN users u ON u.id=ca.user_id WHERE ca.collaboration_id=? ORDER BY ca.created_at DESC").all(params.id);
  sendJSON(res, 200, { collaboration: { ...row, competences: safeParse(row.competences||"[]") }, candidatures });
});

route("POST", "/api/collaborations/:id/candidater", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const collab = db.prepare("SELECT * FROM collaborations WHERE id=?").get(params.id);
  if (!collab) return sendJSON(res, 404, { error: "Collaboration introuvable." });
  if (collab.user_id === user.id) return sendJSON(res, 400, { error: "Vous ne pouvez pas candidater à votre propre appel." });
  try {
    db.prepare("INSERT INTO candidatures (collaboration_id,user_id,message) VALUES (?,?,?)").run(params.id, user.id, body.message||null);
    creerNotif(collab.user_id, "candidature", "Nouvelle candidature", `${user.nom} a postulé à votre appel « ${collab.titre||collab.partenaire} »`, { collaboration_id: collab.id, candidat_id: user.id });
    sendJSON(res, 201, { ok: true });
  } catch(e) { sendJSON(res, 409, { ok: false, message: "Vous avez déjà candidaté." }); }
});

route("GET", "/api/mes-candidatures", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = db.prepare("SELECT ca.*,c.titre,c.partenaire,c.type_collab,u2.nom AS auteur_nom FROM candidatures ca JOIN collaborations c ON c.id=ca.collaboration_id LEFT JOIN users u2 ON u2.id=c.user_id WHERE ca.user_id=? ORDER BY ca.created_at DESC").all(user.id);
  sendJSON(res, 200, { candidatures: rows });
});

/* ---------- Fil paginé ---------- */
route("GET", "/api/fil", async (req, res, params, body, query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Number(query.limit) || 20, 50);
  const offset = (page - 1) * limit;
  const total = db.prepare("SELECT COUNT(*) AS n FROM fil_posts").get().n;
  const posts = db.prepare("SELECT * FROM fil_posts ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset);
  const withReactions = posts.map(p => {
    const reactions = db.prepare("SELECT type,COUNT(*) AS n FROM fil_reactions WHERE post_id=? GROUP BY type").all(p.id);
    const counts = {}; reactions.forEach(r => counts[r.type]=r.n);
    return { ...p, reactions: counts };
  });
  sendJSON(res, 200, { posts: withReactions, total, page, pages: Math.ceil(total/limit) });
});

/* ---------- Static file server (frontend existant) ---------- */
function serveStatic(req, res, pathname) {
  let filePath = path.join(ROOT, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(ROOT)) return send(res, 403, "Forbidden");
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "Not found");
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ================================================================
   HANDLER PRINCIPAL (utilisé en local ET en Vercel serverless)
   ================================================================ */
async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  if (pathname.startsWith("/api/")) {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.regex);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => params[k] = m[i + 1]);
      try {
        const body = (req.method === "POST" || req.method === "PUT") ? await readBody(req) : {};
        await r.handler(req, res, params, body, parsed.query);
      } catch (e) {
        console.error(e);
        sendJSON(res, 500, { error: "Erreur serveur." });
      }
      return;
    }
    return sendJSON(res, 404, { error: "Route API inconnue." });
  }

  serveStatic(req, res, pathname);
}

/* Export pour Vercel serverless */
module.exports = handleRequest;

/* Démarrage serveur HTTP en local uniquement */
if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`Diaspo'Actif — serveur démarré sur http://localhost:${PORT}`);
  });
}
