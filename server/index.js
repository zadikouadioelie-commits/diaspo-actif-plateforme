/* ===========================================================
   DIASPO'ACTIF — Serveur (HTTP natif Node, sans dépendance externe)
   =========================================================== */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const url = require("node:url");
const crypto = require("node:crypto");
const db = require("./db");

const TICKET_SECRET = process.env.TICKET_SECRET || "diaspoactif-qr-2026-secret";
function signTicket(ticketId, eventId, ts) {
  return crypto.createHmac("sha256", TICKET_SECRET)
    .update(`${ticketId}:${eventId}:${ts}`).digest("hex").slice(0, 40);
}
const { hashPassword, verifyPassword, createSession, getSession, destroySession, parseCookies, signAuthToken, verifyAuthToken, TOKEN_TTL } = require("./auth");

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
  /* 1. Token stateless signé (résiste aux cold starts Vercel) */
  const authCookie = cookies.auth;
  if (authCookie) {
    const payload = verifyAuthToken(authCookie);
    if (payload?.uid) {
      const user = db.prepare("SELECT id, nom, email, role, ville, pays, profil_json FROM users WHERE id = ?").get(payload.uid);
      if (user) return user;
    }
  }
  /* 2. Session DB classique (fallback) */
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
    pays, region, departement, ville, adresse, code_postal, telephone,
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
      ville, pays, region, departement, adresse, code_postal, telephone, date_naissance,
      nationalite1, nationalite2, nationalite3,
      centres_interet, situation_pro, type_institution, statut_verification)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nom, prenom || null, email, hash, salt, role,
    ville || null, (role === "collectivite" ? pays_concerne : pays) || null,
    region || null, departement || null,
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
        pays, region, ville, adresse, code_postal, site_web, reseaux_sociaux,
        nationalite1, nationalite2,
        pays_intervention, nom_responsable, prenom_responsable, fonction_responsable,
        email_responsable, tel_responsable, owner_user_id, abonnement_actif)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      slug, nom_institution || nom, type_org || null, description || null, domaine || null, objectifs || null,
      pays || null, region || null, ville || null, adresse || null, code_postal || null,
      site_web || null,
      typeof reseaux_sociaux === "object" ? JSON.stringify(reseaux_sociaux) : (reseaux_sociaux || "{}"),
      nationalite1 || null, nationalite2 || null,
      JSON.stringify(Array.isArray(pays_intervention) ? pays_intervention : []),
      nom_responsable || nom || null, prenom_responsable || prenom || null,
      fonction_responsable || null, email_responsable || email,
      tel_responsable || telephone || null,
      id
    );
  }

  const token = createSession(id);
  const user = db.prepare("SELECT id, nom, prenom, email, role, ville, pays, statut_verification FROM users WHERE id = ?").get(id);
  const authTok = signAuthToken({ uid: id, role: user.role, exp: Math.floor(Date.now()/1000) + TOKEN_TTL });
  sendJSON(res, 201, { user: publicUser(user) }, { "Set-Cookie": [`sid=${token}; HttpOnly; Path=/; SameSite=Lax`, `auth=${authTok}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${TOKEN_TTL}`] });
});

route("POST", "/api/auth/login", async (req, res, params, body) => {
  const { email, password } = body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email || "");
  if (!user || !verifyPassword(password || "", user.password_salt, user.password_hash)) {
    return sendJSON(res, 401, { error: "E-mail ou mot de passe incorrect." });
  }
  const token = createSession(user.id);
  const authTok = signAuthToken({ uid: user.id, role: user.role, exp: Math.floor(Date.now()/1000) + TOKEN_TTL });
  sendJSON(res, 200, { user: publicUser(user) }, { "Set-Cookie": [`sid=${token}; HttpOnly; Path=/; SameSite=Lax`, `auth=${authTok}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${TOKEN_TTL}`] });
});

route("POST", "/api/auth/logout", async (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.sid) destroySession(cookies.sid);
  sendJSON(res, 200, { ok: true }, { "Set-Cookie": ["sid=; HttpOnly; Path=/; Max-Age=0", "auth=; HttpOnly; Path=/; Max-Age=0"] });
});

route("GET", "/api/auth/me", async (req, res) => {
  const user = getCurrentUser(req);
  sendJSON(res, 200, { user: publicUser(user) });
});

/* ---------- Initiatives ---------- */
/* Helper : certification d'une initiative */
function getCertif(initiativeId) {
  return db.prepare("SELECT niveau, statut, date_attribution FROM certifications WHERE initiative_id=? AND statut='actif'").get(initiativeId) || null;
}

route("GET", "/api/initiatives", async (req, res, params, body, query) => {
  let rows = db.prepare("SELECT * FROM initiatives ORDER BY created_at DESC").all();
  const q = (query.q || "").toLowerCase();
  if (q) rows = rows.filter(r => r.nom.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q));
  if (query.pays) rows = rows.filter(r => r.pays === query.pays);
  if (query.domaine) rows = rows.filter(r => r.domaine === query.domaine);
  if (query.type) rows = rows.filter(r => r.type === query.type);
  if (query.nationalite_unique === "1") rows = rows.filter(r => r.nationalite_unique === 1);
  // Filtre par accréditation DA
  if (query.accreditation) {
    const type = query.accreditation;
    rows = rows.filter(r => {
      if (!r.owner_user_id) return false;
      return !!db.prepare("SELECT 1 FROM compte_accreditations WHERE user_id=? AND type=? AND statut='active'").get(r.owner_user_id, type);
    });
  }
  rows = rows.map(r => {
    const accreds = r.owner_user_id
      ? db.prepare("SELECT type FROM compte_accreditations WHERE user_id=? AND statut='active'").all(r.owner_user_id).map(a => a.type)
      : [];
    return { ...r, nationalites_concernees: safeParse(r.nationalites_concernees), nationalite_unique: !!r.nationalite_unique, abonnement_actif: !!r.abonnement_actif, certif: getCertif(r.id), accreditations: accreds };
  });
  sendJSON(res, 200, { initiatives: rows });
});

route("GET", "/api/initiatives/:id", async (req, res, params) => {
  const row = db.prepare("SELECT * FROM initiatives WHERE id = ? OR slug = ?").get(params.id, params.id);
  if (!row) return sendJSON(res, 404, { error: "Initiative introuvable." });
  row.nationalites_concernees = safeParse(row.nationalites_concernees);
  row.nationalite_unique = !!row.nationalite_unique;
  row.abonnement_actif = !!row.abonnement_actif;
  row.certif = getCertif(row.id);
  row.accreditations = row.owner_user_id
    ? db.prepare("SELECT type FROM compte_accreditations WHERE user_id=? AND statut='active'").all(row.owner_user_id).map(a => a.type)
    : [];
  sendJSON(res, 200, { initiative: row });
});

route("POST", "/api/initiatives", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || !["initiative", "collectivite", "administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Seul un compte Initiative, Collectivité ou Administrateur peut créer une initiative." });
  const { nom, sigle, pays, region, ville, zone, domaine, type, description,
    nationalite1, nationalite2, nationalites_concernees, nationalite_unique,
    origine1, origine2, rayonnement, pays_intervention } = body;
  if (!nom || !pays) return sendJSON(res, 400, { error: "Nom et pays requis." });
  const slug = nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
  const id = db.prepare(`
    INSERT INTO initiatives (slug, nom, sigle, pays, region, ville, zone,
      nationalite1, nationalite2, nationalites_concernees, nationalite_unique,
      origine1, origine2, rayonnement, pays_intervention,
      domaine, type, description, owner_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slug, nom, sigle || null, pays, region || null, ville || null, zone || null,
    nationalite1 || null, nationalite2 || null,
    JSON.stringify(nationalites_concernees || []), nationalite_unique ? 1 : 0,
    origine1 || null, origine2 || null, rayonnement || 'locale',
    JSON.stringify(Array.isArray(pays_intervention) ? pays_intervention : []),
    domaine || null, type || null, description || null, user.id).lastInsertRowid;
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

  const pub_type = body.pub_type || "texte"; // texte | article | photo | video
  const contenu  = (body.contenu || "").trim();
  const article_titre   = (body.article_titre || "").trim();
  const article_contenu = (body.article_contenu || "").trim();

  // Validation selon le type
  if (pub_type === "texte"   && !contenu)         return sendJSON(res, 400, { error: "Le texte ne peut pas être vide." });
  if (pub_type === "article" && !article_titre)   return sendJSON(res, 400, { error: "Le titre de l'article est requis." });
  if (pub_type === "photo"   && !body.media_url)  return sendJSON(res, 400, { error: "Aucune photo sélectionnée." });
  if (pub_type === "video"   && !body.media_url)  return sendJSON(res, 400, { error: "Aucune vidéo sélectionnée." });

  // Limite 2 min pour les vidéos
  if (pub_type === "video" && body.video_duree && body.video_duree > 120)
    return sendJSON(res, 400, { error: "La vidéo dépasse 2 minutes (limite autorisée)." });

  const role_type = TYPE_PAR_ROLE[user.role] || "Utilisateur";

  const id = db.prepare(`
    INSERT INTO fil_posts
      (auteur_id, auteur_nom, type, pub_type, categorie, contenu,
       media_url, media_type, article_titre, article_contenu, video_duree)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    user.nom,
    pub_type,
    pub_type,
    body.categorie || "Publication",
    contenu || article_titre,
    body.media_url    || null,
    pub_type === "photo" ? "image" : pub_type === "video" ? "video" : null,
    article_titre     || null,
    article_contenu   || null,
    body.video_duree  || null,
  ).lastInsertRowid;

  // Récupère le post complet pour le renvoyer
  const post = db.prepare("SELECT * FROM fil_posts WHERE id=?").get(id);

  // --- Notifications de mention ---
  // Cherche tous les tokens @[Nom](u:123) et @[Nom](i:456)
  const allText = [contenu, article_titre, article_contenu].join(" ");
  const MENTION_RE = /@\[([^\]]+)\]\(([ui]):(\d+)\)/g;
  const notified = new Set(); // évite les doublons si même personne mentionnée 2x
  let m;
  // Extrait 80 premiers chars du texte visible pour la notification
  const visibleText = allText.replace(MENTION_RE, "@$1").replace(/<[^>]+>/g,"").trim();
  const extrait = visibleText.slice(0, 80) + (visibleText.length > 80 ? "…" : "");

  while ((m = MENTION_RE.exec(allText)) !== null) {
    const [, nomMentionne, kind, rawId] = m;
    const cibleId = Number(rawId);
    if (!cibleId || notified.has(`${kind}:${cibleId}`)) continue;
    notified.add(`${kind}:${cibleId}`);

    if (kind === "u") {
      // Utilisateur direct — ne pas notifier soi-même
      if (cibleId !== user.id) {
        creerNotif(
          cibleId,
          "mention",
          `${user.nom} vous a mentionné dans une publication`,
          `« ${extrait} »`,
          { post_id: Number(id) }
        );
      }
    } else if (kind === "i") {
      // Initiative — notifier le propriétaire de l'initiative
      const owner = db.prepare("SELECT owner_user_id FROM initiatives WHERE id=?").get(cibleId);
      if (owner && owner.owner_user_id && owner.owner_user_id !== user.id) {
        creerNotif(
          owner.owner_user_id,
          "mention",
          `${user.nom} a mentionné votre initiative dans une publication`,
          `« ${extrait} »`,
          { post_id: Number(id) }
        );
      }
    }
  }

  sendJSON(res, 201, { id, post });
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

/* ---------- Commentaires ---------- */

route("GET", "/api/fil/:id/commentaires", async (req, res, params) => {
  const comms = db.prepare(`
    SELECT c.id, c.contenu, c.created_at, c.auteur_id, c.auteur_nom,
           u.photo_url, u.theme_couleur, u.role
    FROM fil_commentaires c
    LEFT JOIN users u ON u.id = c.auteur_id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(params.id);
  // Ajouter la certification pour les commentaires d'initiatives
  const enriched = comms.map(c => {
    let certif = null;
    if (c.role === "initiative" && c.auteur_id) {
      const init = db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(c.auteur_id);
      if (init) certif = getCertif(init.id);
    }
    return { ...c, certif };
  });
  sendJSON(res, 200, { commentaires: enriched });
});

route("POST", "/api/fil/:id/commentaires", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const contenu = (body.contenu || "").trim();
  if (!contenu) return sendJSON(res, 400, { error: "Le commentaire ne peut pas être vide." });

  const id = db.prepare(
    "INSERT INTO fil_commentaires (post_id, auteur_id, auteur_nom, contenu) VALUES (?,?,?,?)"
  ).run(params.id, user.id, user.nom, contenu).lastInsertRowid;

  const comm = db.prepare(`
    SELECT c.id, c.contenu, c.created_at, c.auteur_id, c.auteur_nom,
           u.photo_url, u.theme_couleur
    FROM fil_commentaires c LEFT JOIN users u ON u.id = c.auteur_id
    WHERE c.id = ?
  `).get(id);

  // Notifier l'auteur du post
  const post = db.prepare("SELECT auteur_id, contenu FROM fil_posts WHERE id=?").get(params.id);
  if (post && post.auteur_id && post.auteur_id !== user.id) {
    creerNotif(post.auteur_id, "message", `${user.nom} a commenté votre publication`,
      contenu.slice(0, 80) + (contenu.length > 80 ? "…" : ""),
      { post_id: Number(params.id) });
  }

  sendJSON(res, 201, { commentaire: comm });
});

/* ---------- Republier ---------- */

route("POST", "/api/fil/:id/republier", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });

  const original = db.prepare("SELECT * FROM fil_posts WHERE id=?").get(params.id);
  if (!original) return sendJSON(res, 404, { error: "Publication introuvable." });

  const commentaire = (body.commentaire || "").trim();

  const newId = db.prepare(`
    INSERT INTO fil_posts
      (auteur_id, auteur_nom, type, pub_type, categorie, contenu, original_post_id, repost_commentaire)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    user.id, user.nom, "repost", "repost",
    original.categorie || "Republication",
    commentaire || "",
    original.id,
    commentaire || null
  ).lastInsertRowid;

  // Notifier l'auteur de l'original
  if (original.auteur_id && original.auteur_id !== user.id) {
    creerNotif(original.auteur_id, "mention",
      `${user.nom} a republié votre publication`,
      commentaire ? `« ${commentaire.slice(0,80)} »` : "Sans commentaire ajouté",
      { post_id: Number(newId) });
  }

  const post = db.prepare("SELECT * FROM fil_posts WHERE id=?").get(newId);
  sendJSON(res, 201, { id: newId, post });
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

  // Totaux globaux
  const totalUtilisateurs  = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='utilisateur'").get().n;
  const totalInitiatives   = db.prepare("SELECT COUNT(*) AS n FROM initiatives").get().n;
  const totalInstitutions  = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='collectivite'").get().n;
  const totalPublications  = db.prepare("SELECT COUNT(*) AS n FROM fil_posts").get().n;
  const totalFormations    = db.prepare("SELECT COUNT(*) AS n FROM formations").get().n;
  const totalAbonnements   = db.prepare("SELECT COUNT(*) AS n FROM abonnements").get().n;

  // Nouveaux inscrits
  const inscJour    = db.prepare("SELECT COUNT(*) AS n FROM users WHERE date(created_at)=date('now')").get().n;
  const inscSemaine = db.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at>=datetime('now','-7 days')").get().n;
  const inscMois    = db.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at>=datetime('now','-30 days')").get().n;

  // Utilisateurs actifs (DAU/WAU/MAU)
  const dau = db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM user_activity WHERE date=date('now')").get().n;
  const wau = db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM user_activity WHERE date>=date('now','-6 days')").get().n;
  const mau = db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM user_activity WHERE date>=date('now','-29 days')").get().n;

  // Tendance inscriptions : 14 derniers jours
  const tendance14j = db.prepare(`
    SELECT date(created_at) AS jour, COUNT(*) AS n FROM users
    WHERE created_at >= datetime('now','-13 days')
    GROUP BY jour ORDER BY jour ASC
  `).all();

  // Tendance activité : 14 derniers jours
  const tendanceActif14j = db.prepare(`
    SELECT date AS jour, COUNT(DISTINCT user_id) AS n FROM user_activity
    WHERE date >= date('now','-13 days')
    GROUP BY date ORDER BY date ASC
  `).all();

  // Répartition par rôle
  const parRole = db.prepare("SELECT role, COUNT(*) AS n FROM users GROUP BY role ORDER BY n DESC").all();

  // Top pays
  const topPays = db.prepare("SELECT pays, COUNT(*) AS n FROM users WHERE pays IS NOT NULL GROUP BY pays ORDER BY n DESC LIMIT 8").all();

  // ── Engagement
  const totalCommentaires = db.prepare("SELECT COUNT(*) AS n FROM fil_commentaires").get().n;
  const totalLikes    = db.prepare("SELECT COUNT(*) AS n FROM fil_reactions WHERE type='like'").get().n;
  const totalReposts  = db.prepare("SELECT COUNT(*) AS n FROM fil_reactions WHERE type IN ('repost','partage','share')").get().n;

  // Taux d'interaction moyen par publication (likes + commentaires + reposts) / nb_posts
  const tauxInteraction = totalPublications > 0
    ? ((totalLikes + totalCommentaires + totalReposts) / totalPublications).toFixed(2)
    : "0.00";

  // Temps moyen de session (secondes → minutes)
  const sessionRow = db.prepare("SELECT AVG(duree_sec) AS avg_sec, SUM(duree_sec) AS total_sec FROM user_sessions WHERE duree_sec > 30").get();
  const tempsSessionMoyenMin = sessionRow.avg_sec ? (sessionRow.avg_sec / 60).toFixed(1) : "0.0";
  const tempsSessionTotalH   = sessionRow.total_sec ? (sessionRow.total_sec / 3600).toFixed(1) : "0.0";

  // Tendance engagement 14j (publications + réactions + commentaires par jour)
  const tendanceEngagement14j = db.prepare(`
    WITH jours AS (
      SELECT date('now', '-' || d || ' days') AS jour
      FROM (SELECT 0 d UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION
            SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION
            SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13)
    )
    SELECT j.jour,
      COALESCE((SELECT COUNT(*) FROM fil_reactions r WHERE date(r.rowid, 'unixepoch') = j.jour), 0) +
      COALESCE((SELECT COUNT(*) FROM fil_commentaires c WHERE date(c.created_at) = j.jour), 0) AS interactions,
      COALESCE((SELECT COUNT(*) FROM fil_posts p WHERE date(p.created_at) = j.jour), 0) AS publications
    FROM jours j
    ORDER BY j.jour ASC
  `).all();

  // Top 5 publications les plus engageantes
  const topPosts = db.prepare(`
    SELECT p.id, p.contenu, p.auteur_nom, p.categorie,
      substr(p.created_at, 1, 10) AS date_pub,
      COUNT(DISTINCT r.id) AS nb_reactions,
      COUNT(DISTINCT c.id) AS nb_commentaires,
      (COUNT(DISTINCT r.id) * 2 + COUNT(DISTINCT c.id) * 3) AS score
    FROM fil_posts p
    LEFT JOIN fil_reactions r ON r.post_id = p.id
    LEFT JOIN fil_commentaires c ON c.post_id = p.id
    GROUP BY p.id
    ORDER BY score DESC
    LIMIT 5
  `).all();

  const publicationsRecentes = db.prepare("SELECT * FROM fil_posts ORDER BY created_at DESC LIMIT 10").all();
  const derniersInscrits = db.prepare("SELECT id, nom, email, role, ville, pays, created_at FROM users ORDER BY created_at DESC LIMIT 8").all();

  sendJSON(res, 200, {
    // Totaux
    total_utilisateurs: totalUtilisateurs,
    total_initiatives:  totalInitiatives,
    total_institutions: totalInstitutions,
    total_publications: totalPublications,
    total_formations:   totalFormations,
    total_abonnements:  totalAbonnements,
    total_collectivites: totalInstitutions,
    signalements: 3,
    // Inscriptions
    inscrits_jour:    inscJour,
    inscrits_semaine: inscSemaine,
    inscrits_mois:    inscMois,
    // Utilisateurs actifs
    dau, wau, mau,
    // Tendances
    tendance_inscriptions: tendance14j,
    tendance_actifs:       tendanceActif14j,
    // Répartition
    par_role: parRole,
    top_pays: topPays,
    // Engagement
    total_commentaires:   totalCommentaires,
    total_likes:          totalLikes,
    total_reposts:        totalReposts,
    taux_interaction:     tauxInteraction,
    temps_session_moy_min: tempsSessionMoyenMin,
    temps_session_total_h: tempsSessionTotalH,
    tendance_engagement:   tendanceEngagement14j,
    top_posts:             topPosts,
    // Listes
    publications_recentes: publicationsRecentes,
    derniers_inscrits:     derniersInscrits
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
  const profil = db.prepare("SELECT * FROM ambassade_profil WHERE user_id=?").get(user.id);
  const nbMessages = db.prepare("SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON m.conversation_id=c.id WHERE (c.user1_id=? OR c.user2_id=?) AND m.sender_id!=? AND m.lu=0").get(user.id,user.id,user.id).n;
  const nbComms = db.prepare("SELECT COUNT(*) AS n FROM communications_institutionnelles WHERE emetteur_id=?").get(user.id).n;
  const nbServices = db.prepare("SELECT COUNT(*) AS n FROM ambassade_services WHERE user_id=? AND actif=1").get(user.id).n;
  const nbAgenda = db.prepare("SELECT COUNT(*) AS n FROM ambassade_agenda WHERE user_id=? AND date_debut >= date('now')").get(user.id).n;
  const nbOpportunites = db.prepare("SELECT COUNT(*) AS n FROM ambassade_opportunites WHERE user_id=? AND actif=1").get(user.id).n;

  sendJSON(res, 200, {
    total_membres: totalMembres,
    total_initiatives: totalInitiatives,
    repartition_pays: paysRows,
    profil: profil || null,
    prive: {
      messages_non_lus: nbMessages,
      communications_envoyees: nbComms,
      services_actifs: nbServices,
      evenements_a_venir: nbAgenda,
      opportunites_actives: nbOpportunites,
    }
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

/* ---------- Profil (lecture enrichie) ---------- */
route("GET", "/api/profil/:id", async (req, res, params) => {
  const u = db.prepare("SELECT id,nom,prenom,email,role,ville,pays,bio,photo_url,banner_url,titre_pro,competences,experiences,theme_couleur,centres_interet,situation_pro,profil_json,created_at FROM users WHERE id=?").get(params.id);
  if (!u) return sendJSON(res, 404, { error: "Profil introuvable." });
  const me = getCurrentUser(req);
  const nbAbonnes    = db.prepare("SELECT COUNT(*) as n FROM user_follows WHERE followed_id=?").get(u.id).n;
  const nbSuivis     = db.prepare("SELECT COUNT(*) as n FROM user_follows WHERE follower_id=?").get(u.id).n;
  const isFollowing  = me ? !!db.prepare("SELECT 1 FROM user_follows WHERE follower_id=? AND followed_id=?").get(me.id, u.id) : false;
  const initiativesSuivies = db.prepare("SELECT i.id,i.slug,i.nom,i.domaine,i.pays FROM abonnements a JOIN initiatives i ON i.id=a.initiative_id WHERE a.user_id=? LIMIT 12").all(u.id);
  const usersSuivis  = db.prepare("SELECT u2.id,u2.nom,u2.prenom,u2.titre_pro,u2.ville,u2.photo_url FROM user_follows uf JOIN users u2 ON u2.id=uf.followed_id WHERE uf.follower_id=? LIMIT 12").all(u.id);
  const publications = db.prepare(`
    SELECT p.id, p.type, p.categorie, p.contenu, p.created_at,
      COUNT(DISTINCT r.id) AS nb_reactions,
      COUNT(DISTINCT c.id) AS nb_commentaires
    FROM fil_posts p
    LEFT JOIN fil_reactions r ON r.post_id = p.id
    LEFT JOIN fil_commentaires c ON c.post_id = p.id
    WHERE p.auteur_id = ?
    GROUP BY p.id ORDER BY p.id DESC LIMIT 10`).all(u.id);
  sendJSON(res, 200, { profil: {
    ...publicUser(u),
    bio: u.bio, photo_url: u.photo_url, banner_url: u.banner_url,
    prenom: u.prenom, titre_pro: u.titre_pro,
    centres_interet: safeParse(u.centres_interet || "[]"),
    competences: safeParse(u.competences || "[]"),
    experiences: safeParse(u.experiences || "[]"),
    theme_couleur: u.theme_couleur || "ocean",
    situation_pro: u.situation_pro, created_at: u.created_at,
    nbAbonnes, nbSuivis, isFollowing,
    initiativesSuivies, usersSuivis, publications
  }});
});

/* ---------- Profil (mise à jour étendue) ---------- */
route("PUT", "/api/profil", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const { nom, prenom, ville, pays, bio, photo_url, banner_url, titre_pro,
          centres_interet, situation_pro, telephone, competences, experiences, theme_couleur } = body;
  const fields = [], vals = [];
  if (nom)                   { fields.push("nom=?");           vals.push(nom); }
  if (prenom !== undefined)  { fields.push("prenom=?");        vals.push(prenom); }
  if (ville !== undefined)   { fields.push("ville=?");         vals.push(ville); }
  if (pays !== undefined)    { fields.push("pays=?");          vals.push(pays); }
  if (bio !== undefined)     { fields.push("bio=?");           vals.push(bio); }
  if (photo_url !== undefined)  { fields.push("photo_url=?");  vals.push(photo_url); }
  if (banner_url !== undefined) { fields.push("banner_url=?"); vals.push(banner_url); }
  if (titre_pro !== undefined)  { fields.push("titre_pro=?");  vals.push(titre_pro); }
  if (theme_couleur !== undefined) { fields.push("theme_couleur=?"); vals.push(theme_couleur); }
  if (centres_interet !== undefined) { fields.push("centres_interet=?"); vals.push(JSON.stringify(Array.isArray(centres_interet)?centres_interet:[])); }
  if (situation_pro !== undefined)   { fields.push("situation_pro=?");   vals.push(situation_pro); }
  if (telephone !== undefined)       { fields.push("telephone=?");        vals.push(telephone); }
  if (competences !== undefined)     { fields.push("competences=?");      vals.push(JSON.stringify(Array.isArray(competences)?competences:[])); }
  if (experiences !== undefined)     { fields.push("experiences=?");      vals.push(JSON.stringify(Array.isArray(experiences)?experiences:[])); }
  if (body.profil !== undefined) {
    const cur = db.prepare("SELECT profil_json FROM users WHERE id=?").get(user.id);
    const merged = { ...safeParse(cur.profil_json), ...body.profil };
    fields.push("profil_json=?"); vals.push(JSON.stringify(merged));
  }
  if (fields.length) { vals.push(user.id); db.prepare(`UPDATE users SET ${fields.join(",")} WHERE id=?`).run(...vals); }
  const up = db.prepare("SELECT id,nom,prenom,email,role,ville,pays,bio,photo_url,banner_url,titre_pro,competences,experiences,theme_couleur,centres_interet,situation_pro,telephone,profil_json FROM users WHERE id=?").get(user.id);
  sendJSON(res, 200, { profil: { ...publicUser(up), bio: up.bio, photo_url: up.photo_url, banner_url: up.banner_url,
    prenom: up.prenom, titre_pro: up.titre_pro, theme_couleur: up.theme_couleur,
    competences: safeParse(up.competences||"[]"), experiences: safeParse(up.experiences||"[]"),
    centres_interet: safeParse(up.centres_interet||"[]"), situation_pro: up.situation_pro, telephone: up.telephone } });
});

/* ---------- Suivre / ne plus suivre un utilisateur ---------- */
route("POST", "/api/users/:id/suivre", async (req, res, params) => {
  const me = getCurrentUser(req);
  if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
  if (me.id == params.id) return sendJSON(res, 400, { error: "Vous ne pouvez pas vous suivre vous-même." });
  try {
    db.prepare("INSERT OR IGNORE INTO user_follows (follower_id, followed_id) VALUES (?,?)").run(me.id, parseInt(params.id));
    const n = db.prepare("SELECT COUNT(*) as n FROM user_follows WHERE followed_id=?").get(parseInt(params.id)).n;
    sendJSON(res, 200, { ok: true, nbAbonnes: n });
  } catch(e) { sendJSON(res, 400, { error: e.message }); }
});

route("DELETE", "/api/users/:id/suivre", async (req, res, params) => {
  const me = getCurrentUser(req);
  if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
  db.prepare("DELETE FROM user_follows WHERE follower_id=? AND followed_id=?").run(me.id, parseInt(params.id));
  const n = db.prepare("SELECT COUNT(*) as n FROM user_follows WHERE followed_id=?").get(parseInt(params.id)).n;
  sendJSON(res, 200, { ok: true, nbAbonnes: n });
});

/* ---------- Upload simulé ---------- */
route("POST", "/api/upload", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });

  const { data, nom } = body; // data = "data:<mime>;base64,<b64>"
  if (!data || !data.startsWith("data:")) return sendJSON(res, 400, { error: "Données image manquantes." });

  const match = data.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return sendJSON(res, 400, { error: "Format de données invalide." });

  const mime = match[1];
  const allowed = ["image/jpeg","image/png","image/gif","image/webp","image/svg+xml"];
  if (!allowed.includes(mime)) return sendJSON(res, 400, { error: "Type de fichier non autorisé." });

  const buf = Buffer.from(match[2], "base64");
  if (buf.length > 5 * 1024 * 1024) return sendJSON(res, 400, { error: "Fichier trop volumineux (5 Mo max)." });

  const id = db.prepare("INSERT INTO uploads (user_id, nom, mime, taille, data) VALUES (?,?,?,?,?)").run(
    user.id, nom || "upload", mime, buf.length, buf
  ).lastInsertRowid;

  sendJSON(res, 200, { url: `/api/uploads/${id}`, id, nom: nom || "upload" });
});

route("GET", "/api/uploads/:id", async (req, res, params) => {
  const row = db.prepare("SELECT mime, data FROM uploads WHERE id=?").get(params.id);
  if (!row) return send(res, 404, "Not found");
  res.writeHead(200, { "Content-Type": row.mime, "Cache-Control": "public, max-age=86400" });
  res.end(row.data);
});

/* ---------- Recherche globale ---------- */
/* ---------- Autocomplete @mentions ---------- */
route("GET", "/api/mentions", async (req, res, params, body, query) => {
  const q = (query.q || "").trim();
  if (q.length < 1) return sendJSON(res, 200, { results: [] });
  const like = `%${q}%`;
  const users = db.prepare(`
    SELECT id, nom, prenom, role, ville, pays, photo_url
    FROM users WHERE (nom LIKE ? OR prenom LIKE ?) AND role != 'administrateur' LIMIT 5
  `).all(like, like);
  const inits = db.prepare(`
    SELECT id, nom, 'initiative' AS role, pays, logo_url AS photo_url
    FROM initiatives WHERE nom LIKE ? LIMIT 4
  `).all(like);
  const results = [
    ...users.map(u => ({
      id: u.id,
      nom: [u.prenom, u.nom].filter(Boolean).join(" "),
      type: "user",
      type_label: u.role === "initiative" ? "Initiative" : "Utilisateur",
      pays: u.pays || u.ville || "",
      photo_url: u.photo_url || null,
    })),
    ...inits.map(i => ({
      id: i.id,
      nom: i.nom,
      type: "initiative",
      type_label: "Initiative",
      pays: i.pays || "",
      photo_url: i.photo_url || null,
    })),
  ].slice(0, 8);
  sendJSON(res, 200, { results });
});

route("GET", "/api/recherche", async (req, res, params, body, query) => {
  const q = (query.q || "").trim();
  if (q.length < 2) return sendJSON(res, 200, { utilisateurs: [], initiatives: [], publications: [], formations: [], evenements: [] });
  const like = `%${q}%`;
  const type = query.type || "tous";

  const utilisateurs = (type === "tous" || type === "utilisateurs")
    ? db.prepare("SELECT id,nom,role,ville,pays FROM users WHERE (nom LIKE ? OR ville LIKE ?) AND role != 'administrateur' LIMIT 8").all(like, like)
    : [];
  const initiatives = (type === "tous" || type === "initiatives")
    ? db.prepare("SELECT id,slug,nom,domaine,pays,ville,description,owner_user_id FROM initiatives WHERE nom LIKE ? OR description LIKE ? OR domaine LIKE ? LIMIT 8").all(like, like, like).map(i => ({
        ...i,
        accreditations: i.owner_user_id
          ? db.prepare("SELECT type FROM compte_accreditations WHERE user_id=? AND statut='active'").all(i.owner_user_id).map(a => a.type)
          : []
      }))
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

/* ========== ROUTES CERTIFICATION ========== */

/* Helper : enregistrer une action dans l'historique */
function histoCertif(initiative_id, action, admin, motif, contenu) {
  db.prepare("INSERT INTO certification_historique (initiative_id,action,admin_id,admin_nom,motif,contenu) VALUES (?,?,?,?,?,?)")
    .run(initiative_id, action, admin.id, admin.nom, motif || null, contenu || null);
}

/* Liste toutes les initiatives avec statut certif — admin only */
route("GET", "/api/admin/certifications", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const rows = db.prepare("SELECT i.id,i.nom,i.slug,i.domaine,i.pays,i.created_at, c.statut AS certif_statut, c.niveau AS certif_niveau, c.date_attribution FROM initiatives i LEFT JOIN certifications c ON c.initiative_id=i.id ORDER BY i.nom ASC").all();
  sendJSON(res, 200, { initiatives: rows });
});

/* Fiche d'évaluation : lecture */
route("GET", "/api/admin/certifications/:id/evaluation", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const eval_ = db.prepare("SELECT * FROM certification_evaluations WHERE initiative_id=?").get(params.id) || { initiative_id: Number(params.id) };
  sendJSON(res, 200, { evaluation: eval_ });
});

/* Fiche d'évaluation : sauvegarde */
route("PUT", "/api/admin/certifications/:id/evaluation", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const fields = [
    "anciennete_score","publications_regularite","profil_completude","participation_communaute",
    "taux_reponse","delai_reponse","qualite_echanges",
    "projets_realises","actions_concretes","partenariats","emplois_crees","investissements","impacts",
    "avis_utilisateurs","recommandations","retours_experience",
    "documents_officiels","existence_legale","coordonnees_verifiees","infos_administratives",
    "entretien_realise","visioconference","rencontre_physique","visite_site",
    "verification_partenaires","verification_beneficiaires","verification_institutions",
    "notes_internes","rapport_verification"
  ];
  const existing = db.prepare("SELECT id FROM certification_evaluations WHERE initiative_id=?").get(params.id);
  const vals = fields.map(f => body[f] !== undefined ? body[f] : null);
  if (existing) {
    const sets = fields.map(f => `${f}=?`).join(",") + ",updated_at=datetime('now')";
    db.prepare(`UPDATE certification_evaluations SET ${sets} WHERE initiative_id=?`).run(...vals, params.id);
  } else {
    const cols = ["initiative_id", ...fields].join(",");
    const placeholders = ["?", ...fields.map(()=>"?")].join(",");
    db.prepare(`INSERT INTO certification_evaluations (${cols}) VALUES (${placeholders})`).run(params.id, ...vals);
  }
  histoCertif(Number(params.id), "evaluation", user, "Mise à jour de la fiche d'évaluation", null);
  sendJSON(res, 200, { ok: true });
});

/* Attribuer le badge */
route("POST", "/api/admin/certifications/:id/attribuer", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const init = db.prepare("SELECT id,nom FROM initiatives WHERE id=?").get(params.id);
  if (!init) return sendJSON(res, 404, { error: "Initiative introuvable." });
  const niveau = body.niveau || "verifie";
  const existing = db.prepare("SELECT id FROM certifications WHERE initiative_id=?").get(params.id);
  if (existing) {
    db.prepare("UPDATE certifications SET statut='actif',niveau=?,admin_id=?,date_attribution=datetime('now'),updated_at=datetime('now') WHERE initiative_id=?").run(niveau, user.id, params.id);
  } else {
    db.prepare("INSERT INTO certifications (initiative_id,niveau,statut,admin_id) VALUES (?,?,'actif',?)").run(params.id, niveau, user.id);
  }
  histoCertif(Number(params.id), "attribution", user, body.motif || "Badge attribué", `Niveau : ${niveau}`);
  // Notifier le propriétaire de l'initiative
  const owner = db.prepare("SELECT owner_user_id FROM initiatives WHERE id=?").get(params.id);
  if (owner?.owner_user_id) {
    creerNotif(owner.owner_user_id, "certification", "🛡️ Badge Initiative Vérifiée obtenu !", `Félicitations ! L'initiative « ${init.nom} » vient d'obtenir le badge Initiative Vérifiée Diaspo'Actif.`, { initiative_id: init.id });
  }
  sendJSON(res, 200, { ok: true });
});

/* Suspendre le badge */
route("POST", "/api/admin/certifications/:id/suspendre", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const existing = db.prepare("SELECT id FROM certifications WHERE initiative_id=?").get(params.id);
  if (!existing) return sendJSON(res, 404, { error: "Aucune certification pour cette initiative." });
  db.prepare("UPDATE certifications SET statut='suspendu',updated_at=datetime('now') WHERE initiative_id=?").run(params.id);
  histoCertif(Number(params.id), "suspension", user, body.motif || null, null);
  sendJSON(res, 200, { ok: true });
});

/* Retirer le badge */
route("POST", "/api/admin/certifications/:id/retirer", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const existing = db.prepare("SELECT id FROM certifications WHERE initiative_id=?").get(params.id);
  if (!existing) return sendJSON(res, 404, { error: "Aucune certification pour cette initiative." });
  db.prepare("UPDATE certifications SET statut='retire',updated_at=datetime('now') WHERE initiative_id=?").run(params.id);
  histoCertif(Number(params.id), "retrait", user, body.motif || null, null);
  sendJSON(res, 200, { ok: true });
});

/* Ajouter une note interne */
route("POST", "/api/admin/certifications/:id/note", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  if (!body.contenu) return sendJSON(res, 400, { error: "Contenu requis." });
  histoCertif(Number(params.id), "note", user, body.titre || "Note interne", body.contenu);
  sendJSON(res, 200, { ok: true });
});

/* Historique des décisions */
route("GET", "/api/admin/certifications/:id/historique", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const rows = db.prepare("SELECT * FROM certification_historique WHERE initiative_id=? ORDER BY created_at DESC").all(params.id);
  sendJSON(res, 200, { historique: rows });
});

/* ========== FIN ROUTES CERTIFICATION ========== */

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

/* ---------- Helper : enrichir un post ---------- */
function enrichPost(p, cu) {
  const reactions = db.prepare("SELECT type,COUNT(*) AS n FROM fil_reactions WHERE post_id=? GROUP BY type").all(p.id);
  const counts = {}; reactions.forEach(r => counts[r.type] = r.n);
  const nb_commentaires = db.prepare("SELECT COUNT(*) AS n FROM fil_commentaires WHERE post_id=?").get(p.id).n;
  const user_a_aime = cu ? !!db.prepare("SELECT 1 FROM fil_reactions WHERE post_id=? AND user_id=? AND type='like'").get(p.id, cu.id) : false;

  let auteur = {}, auteur_certif = null;
  if (p.auteur_id) {
    const u = db.prepare("SELECT photo_url,banner_url,ville,pays,nationalite1,titre_pro,bio,situation_pro,theme_couleur,role FROM users WHERE id=?").get(p.auteur_id);
    if (u) {
      auteur = u;
      if (u.role === "initiative") {
        const init = db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(p.auteur_id);
        if (init) auteur_certif = getCertif(init.id);
      }
    }
  }
  // Fallback : posts seedés sans auteur_id — chercher par nom d'initiative
  if (!auteur_certif && p.auteur_nom) {
    const initByName = db.prepare("SELECT id FROM initiatives WHERE nom=? OR sigle=?").get(p.auteur_nom, p.auteur_nom);
    if (initByName) auteur_certif = getCertif(initByName.id);
  }

  // Score de popularité : likes×3 + commentaires×2 + reposts×1
  const nb_reposts = db.prepare("SELECT COUNT(*) AS n FROM fil_posts WHERE original_post_id=?").get(p.id).n;
  const score = (counts.like||0)*3 + nb_commentaires*2 + nb_reposts;

  let original_post = null;
  if ((p.type === "repost" || p.pub_type === "repost") && p.original_post_id) {
    const orig = db.prepare("SELECT * FROM fil_posts WHERE id=?").get(p.original_post_id);
    if (orig) {
      let orig_auteur = {};
      if (orig.auteur_id) {
        const ou = db.prepare("SELECT photo_url,banner_url,ville,pays,nationalite1,titre_pro,bio,situation_pro,theme_couleur FROM users WHERE id=?").get(orig.auteur_id);
        if (ou) orig_auteur = ou;
      }
      const orig_reactions = db.prepare("SELECT type,COUNT(*) AS n FROM fil_reactions WHERE post_id=? GROUP BY type").all(orig.id);
      const orig_counts = {}; orig_reactions.forEach(r => orig_counts[r.type] = r.n);
      original_post = { ...orig, reactions: orig_counts, auteur_profil: orig_auteur };
    }
  }
  const auteur_accreditations = p.auteur_id
    ? db.prepare("SELECT type FROM compte_accreditations WHERE user_id=? AND statut='active'").all(p.auteur_id).map(a => a.type)
    : [];
  return { ...p, reactions: counts, nb_commentaires, user_a_aime, auteur_profil: auteur, auteur_certif, auteur_accreditations, score, original_post };
}

/* ---------- Fil intelligent ---------- */
route("GET", "/api/fil", async (req, res, params, body, query) => {
  const cu = getCurrentUser(req);
  const mode  = query.mode  || "tous";   // suivis | populaires | articles | tous
  const page  = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Number(query.limit) || 20, 50);
  const offset = (page - 1) * limit;

  // ─── MODE SUIVIS ───────────────────────────────────────────────────────────
  if (mode === "suivis" && cu) {
    // IDs des utilisateurs suivis
    const followedUsers = db.prepare("SELECT followed_id FROM user_follows WHERE follower_id=?").all(cu.id).map(r => r.followed_id);
    // IDs des initiatives suivies → propriétaires (owner_user_id)
    const followedInits = db.prepare("SELECT initiative_id FROM abonnements WHERE user_id=?").all(cu.id).map(r => r.initiative_id);
    const initAuthorIds = followedInits.length
      ? db.prepare(`SELECT owner_user_id AS id FROM initiatives WHERE id IN (${followedInits.map(()=>"?").join(",")}) AND owner_user_id IS NOT NULL`).all(...followedInits).map(r => r.id)
      : [];
    const allIds = [...new Set([...followedUsers, ...initAuthorIds])];

    if (!allIds.length) {
      return sendJSON(res, 200, { posts: [], total: 0, page, pages: 0, mode, conseil: "Suivez des personnes et des initiatives pour voir leurs publications ici." });
    }
    const placeholders = allIds.map(()=>"?").join(",");
    const total = db.prepare(`SELECT COUNT(*) AS n FROM fil_posts WHERE auteur_id IN (${placeholders})`).get(...allIds).n;
    const posts = db.prepare(`SELECT * FROM fil_posts WHERE auteur_id IN (${placeholders}) ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...allIds, limit, offset);
    return sendJSON(res, 200, { posts: posts.map(p => ({ ...enrichPost(p, cu), source: "suivi" })), total, page, pages: Math.ceil(total/limit), mode });
  }

  // ─── MODE POPULAIRES ───────────────────────────────────────────────────────
  if (mode === "populaires") {
    // Fenêtre 30 jours, score = likes×3 + commentaires×2 + reposts
    const since = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,19).replace("T"," ");
    const posts = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM fil_reactions r WHERE r.post_id=p.id AND r.type='like')*3 +
        (SELECT COUNT(*) FROM fil_commentaires c WHERE c.post_id=p.id)*2 +
        (SELECT COUNT(*) FROM fil_posts rp WHERE rp.original_post_id=p.id) AS score_calc
      FROM fil_posts p
      WHERE p.created_at >= ? AND (p.pub_type IS NULL OR p.pub_type != 'repost') AND (p.type IS NULL OR p.type != 'repost')
      ORDER BY score_calc DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(since, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM fil_posts WHERE created_at >= ? AND (pub_type IS NULL OR pub_type != 'repost')`).get(since).n;
    return sendJSON(res, 200, { posts: posts.map(p => ({ ...enrichPost(p, cu), source: "populaire" })), total, page, pages: Math.ceil(total/limit), mode });
  }

  // ─── MODE ARTICLES MIS EN AVANT ────────────────────────────────────────────
  if (mode === "articles") {
    const posts = db.prepare(`
      SELECT * FROM fil_posts
      WHERE (pub_type='article' OR type='article')
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset);
    const total = db.prepare("SELECT COUNT(*) AS n FROM fil_posts WHERE pub_type='article' OR type='article'").get().n;
    return sendJSON(res, 200, { posts: posts.map(p => ({ ...enrichPost(p, cu), source: "article" })), total, page, pages: Math.ceil(total/limit), mode });
  }

  // ─── MODE TOUS (fil global enrichi) ────────────────────────────────────────
  // Algorithme : suivis en premier, puis populaires, puis reste chronologique
  let orderedIds = new Set();
  const allPosts = [];

  if (cu) {
    // 1) Posts des profils/initiatives suivis (récents d'abord)
    const followedUsers = db.prepare("SELECT followed_id FROM user_follows WHERE follower_id=?").all(cu.id).map(r => r.followed_id);
    const followedInits = db.prepare("SELECT initiative_id FROM abonnements WHERE user_id=?").all(cu.id).map(r => r.initiative_id);
    const initOwners = followedInits.length
      ? db.prepare(`SELECT owner_user_id AS id FROM initiatives WHERE id IN (${followedInits.map(()=>"?").join(",")}) AND owner_user_id IS NOT NULL`).all(...followedInits).map(r => r.id)
      : [];
    const followedAll = [...new Set([...followedUsers, ...initOwners])];
    if (followedAll.length) {
      const ph = followedAll.map(()=>"?").join(",");
      db.prepare(`SELECT * FROM fil_posts WHERE auteur_id IN (${ph}) ORDER BY created_at DESC LIMIT 10`).all(...followedAll)
        .forEach(p => { if(!orderedIds.has(p.id)){ orderedIds.add(p.id); allPosts.push({ ...p, source:"suivi" }); } });
    }
  }

  // 2) Posts populaires récents (30j)
  const since = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,19).replace("T"," ");
  db.prepare(`
    SELECT p.* FROM fil_posts p
    WHERE p.created_at >= ? AND (p.pub_type IS NULL OR p.pub_type != 'repost')
    ORDER BY (SELECT COUNT(*) FROM fil_reactions r WHERE r.post_id=p.id)*3 +
             (SELECT COUNT(*) FROM fil_commentaires c WHERE c.post_id=p.id)*2 DESC,
             p.created_at DESC
    LIMIT 10
  `).all(since).forEach(p => { if(!orderedIds.has(p.id)){ orderedIds.add(p.id); allPosts.push({ ...p, source:"populaire" }); } });

  // 3) Articles récents mis en avant
  db.prepare(`SELECT * FROM fil_posts WHERE (pub_type='article' OR type='article') ORDER BY created_at DESC LIMIT 5`).all()
    .forEach(p => { if(!orderedIds.has(p.id)){ orderedIds.add(p.id); allPosts.push({ ...p, source:"article" }); } });

  // 4) Reste chronologique
  const excludeClause = orderedIds.size ? `AND id NOT IN (${[...orderedIds].map(()=>"?").join(",")})` : "";
  const excludeArgs = orderedIds.size ? [...orderedIds] : [];
  db.prepare(`SELECT * FROM fil_posts WHERE 1=1 ${excludeClause} ORDER BY created_at DESC LIMIT 30`).all(...excludeArgs)
    .forEach(p => { if(!orderedIds.has(p.id)){ orderedIds.add(p.id); allPosts.push({ ...p, source:"global" }); } });

  // Pagination sur le résultat fusionné
  const total = allPosts.length;
  const paginated = allPosts.slice(offset, offset + limit);
  sendJSON(res, 200, { posts: paginated.map(p => enrichPost(p, cu)), total, page, pages: Math.ceil(total/limit), mode });
});

/* ---------- Follow / Unfollow utilisateur ---------- */
route("POST", "/api/follow/:id", async (req, res, params) => {
  const cu = getCurrentUser(req);
  if (!cu) return sendJSON(res, 401, { error: "Connexion requise." });
  const targetId = Number(params.id);
  if (targetId === cu.id) return sendJSON(res, 400, { error: "Vous ne pouvez pas vous suivre vous-même." });
  try {
    db.prepare("INSERT INTO user_follows (follower_id, followed_id) VALUES (?,?)").run(cu.id, targetId);
    creerNotif(targetId, "abonnement", `${cu.nom} vous suit maintenant`, "", { user_id: cu.id });
  } catch(e) { /* déjà suivi */ }
  sendJSON(res, 200, { ok: true, suivi: true });
});

route("DELETE", "/api/follow/:id", async (req, res, params) => {
  const cu = getCurrentUser(req);
  if (!cu) return sendJSON(res, 401, { error: "Connexion requise." });
  db.prepare("DELETE FROM user_follows WHERE follower_id=? AND followed_id=?").run(cu.id, Number(params.id));
  sendJSON(res, 200, { ok: true, suivi: false });
});

/* ---------- Meta du fil (mes follows pour l'UI) ---------- */
route("GET", "/api/fil/meta", async (req, res) => {
  const cu = getCurrentUser(req);
  if (!cu) return sendJSON(res, 200, { suivis_users: [], suivis_initiatives: [] });
  const suivis_users = db.prepare("SELECT followed_id AS id FROM user_follows WHERE follower_id=?").all(cu.id).map(r => r.id);
  const suivis_initiatives = db.prepare("SELECT initiative_id AS id FROM abonnements WHERE user_id=?").all(cu.id).map(r => r.id);
  sendJSON(res, 200, { suivis_users, suivis_initiatives });
});

/* ---------- Profils à découvrir dans le fil ---------- */
route("GET", "/api/fil/profiles", async (req, res, params, body, query) => {
  const cu = getCurrentUser(req);
  // Exclure l'utilisateur connecté, retourner 8 profils enrichis
  const users = db.prepare(`
    SELECT id, nom, prenom, photo_url, banner_url, ville, pays,
           nationalite1, nationalite2, titre_pro, bio, situation_pro, theme_couleur, role
    FROM users
    WHERE role IN ('utilisateur','initiative')
    ${cu ? "AND id != " + cu.id : ""}
    ORDER BY created_at DESC
    LIMIT 8
  `).all();
  sendJSON(res, 200, { profiles: users });
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
/* ===== MODULE RÉSEAU & DIASPORA ===== */

route("GET", "/api/admin/reseau", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });

  const parPays     = db.prepare("SELECT pays, COUNT(*) n FROM users WHERE pays IS NOT NULL GROUP BY pays ORDER BY n DESC LIMIT 12").all();
  const parNat1     = db.prepare("SELECT nationalite1 AS nat, COUNT(*) n FROM users WHERE nationalite1 IS NOT NULL GROUP BY nat ORDER BY n DESC LIMIT 10").all();
  const parNat2     = db.prepare("SELECT nationalite2 AS nat, COUNT(*) n FROM users WHERE nationalite2 IS NOT NULL GROUP BY nat ORDER BY n DESC LIMIT 8").all();
  const parOrig1    = db.prepare("SELECT origine1 AS orig, COUNT(*) n FROM users WHERE origine1 IS NOT NULL GROUP BY orig ORDER BY n DESC LIMIT 10").all();
  const parVille    = db.prepare("SELECT ville, pays, COUNT(*) n FROM users WHERE ville IS NOT NULL GROUP BY ville ORDER BY n DESC LIMIT 10").all();

  // Top pays actifs = pays avec le plus d'activité (user_activity JOIN users)
  const paysActifs  = db.prepare(`
    SELECT u.pays, COUNT(DISTINCT a.user_id) n
    FROM user_activity a JOIN users u ON u.id=a.user_id
    WHERE a.date >= date('now','-30 days') AND u.pays IS NOT NULL
    GROUP BY u.pays ORDER BY n DESC LIMIT 8
  `).all();

  // Croissance internationale : nombre de pays distincts avec inscrits ce mois
  const paysNouveaux = db.prepare(`
    SELECT COUNT(DISTINCT pays) n FROM users
    WHERE pays IS NOT NULL AND created_at >= datetime('now','-30 days')
  `).get().n;

  sendJSON(res, 200, { par_pays: parPays, par_nationalite: parNat1, par_nationalite2: parNat2,
    par_origine: parOrig1, par_ville: parVille, pays_actifs: paysActifs,
    pays_nouveaux_mois: paysNouveaux });
});

/* ===== MODULE CONTENU ===== */

route("GET", "/api/admin/contenu", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });

  // Publications les plus engageantes (vue simulée = score engagement)
  const topPublications = db.prepare(`
    SELECT p.id, p.contenu, p.auteur_nom, p.categorie, substr(p.created_at,1,10) AS date_pub,
      COUNT(DISTINCT r.id) AS nb_reactions, COUNT(DISTINCT c.id) AS nb_commentaires,
      (COUNT(DISTINCT r.id) * 2 + COUNT(DISTINCT c.id) * 3) AS score
    FROM fil_posts p
    LEFT JOIN fil_reactions r ON r.post_id = p.id
    LEFT JOIN fil_commentaires c ON c.post_id = p.id
    GROUP BY p.id ORDER BY score DESC LIMIT 10
  `).all();

  // Articles les plus partagés
  const topArticles = db.prepare(`
    SELECT p.id, p.contenu, p.auteur_nom, substr(p.created_at,1,10) AS date_pub,
      COUNT(DISTINCT r.id) AS nb_reposts
    FROM fil_posts p
    LEFT JOIN fil_reactions r ON r.post_id = p.id AND r.type IN ('repost','partage')
    WHERE p.categorie = 'article' OR p.type = 'article'
    GROUP BY p.id ORDER BY nb_reposts DESC LIMIT 8
  `).all();

  // Initiatives les plus consultées (par nb_vues ou score engagement)
  const topInitiatives = db.prepare(`
    SELECT i.id, i.nom, i.ville, i.pays, i.domaine, COALESCE(i.nb_vues,0) AS nb_vues,
      (SELECT COUNT(*) FROM user_follows f WHERE f.followed_id = u.id) AS nb_abonnes
    FROM initiatives i
    LEFT JOIN users u ON u.role='initiative' AND u.nom=i.nom
    ORDER BY nb_vues DESC, nb_abonnes DESC LIMIT 8
  `).all();

  // Utilisateurs les plus influents
  const topInfluents = db.prepare(`
    SELECT u.id, u.nom, u.role, u.pays,
      COUNT(DISTINCT p.id) AS nb_posts,
      SUM(COALESCE(sub.nb_react,0)) AS nb_reactions_recues,
      (SELECT COUNT(*) FROM user_follows f WHERE f.followed_id = u.id) AS nb_abonnes,
      (COUNT(DISTINCT p.id)*2 + SUM(COALESCE(sub.nb_react,0))*3 + (SELECT COUNT(*) FROM user_follows f WHERE f.followed_id=u.id)*5) AS score
    FROM users u
    LEFT JOIN fil_posts p ON p.auteur_id = u.id
    LEFT JOIN (SELECT post_id, COUNT(*) nb_react FROM fil_reactions GROUP BY post_id) sub ON sub.post_id = p.id
    WHERE u.role IN ('utilisateur','initiative')
    GROUP BY u.id ORDER BY score DESC LIMIT 8
  `).all();

  // Types de contenu les plus performants
  const parCategorie = db.prepare(`
    SELECT p.categorie, COUNT(DISTINCT p.id) AS nb_posts,
      AVG(sub.score) AS score_moy
    FROM fil_posts p
    LEFT JOIN (
      SELECT post_id,
        COUNT(DISTINCT r.id)*2 + COUNT(DISTINCT c.id)*3 AS score
      FROM fil_posts pp
      LEFT JOIN fil_reactions r ON r.post_id = pp.id
      LEFT JOIN fil_commentaires c ON c.post_id = pp.id
      GROUP BY pp.id
    ) sub ON sub.post_id = p.id
    WHERE p.categorie IS NOT NULL
    GROUP BY p.categorie ORDER BY score_moy DESC
  `).all();

  sendJSON(res, 200, { top_publications: topPublications, top_articles: topArticles,
    top_initiatives: topInitiatives, top_influents: topInfluents, par_categorie: parCategorie });
});

/* ===== MODULE FINANCES ===== */

route("GET", "/api/admin/finances", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });

  // Abonnés actifs (abonnements table)
  const abonnesActifs = db.prepare("SELECT COUNT(*) n FROM abonnements WHERE statut='actif'").get().n;

  // Transactions du mois courant
  const txMois = db.prepare(`
    SELECT type, statut, SUM(montant) total, COUNT(*) nb
    FROM transactions
    WHERE date_transaction >= datetime('now','-30 days')
    GROUP BY type, statut
  `).all();

  // MRR = revenus abonnements réussis du mois en cours
  const mrrRow = db.prepare(`
    SELECT COALESCE(SUM(montant),0) mrr FROM transactions
    WHERE type='abonnement' AND statut='reussi'
      AND date_transaction >= datetime('now','-30 days')
  `).get();
  const mrr = mrrRow.mrr;
  const arr = Math.round(mrr * 12 * 100) / 100;

  // Revenus par source
  const parSource = db.prepare(`
    SELECT type, COALESCE(SUM(CASE WHEN statut='reussi' THEN montant ELSE 0 END),0) AS total,
      COUNT(CASE WHEN statut='reussi' THEN 1 END) AS nb_reussis,
      COUNT(CASE WHEN statut='echoue' THEN 1 END) AS nb_echoues
    FROM transactions
    WHERE date_transaction >= datetime('now','-30 days')
    GROUP BY type
  `).all();

  // Tendance revenus 30 jours
  const tendance30j = db.prepare(`
    SELECT date(date_transaction) jour, SUM(CASE WHEN statut='reussi' THEN montant ELSE 0 END) revenu,
      COUNT(CASE WHEN statut='reussi' THEN 1 END) nb_ventes
    FROM transactions
    WHERE date_transaction >= datetime('now','-29 days')
    GROUP BY date(date_transaction) ORDER BY jour ASC
  `).all();

  // Paiements réussis / échoués / remboursements
  const paiementsStatuts = db.prepare(`
    SELECT statut, COUNT(*) nb, COALESCE(SUM(montant),0) total
    FROM transactions GROUP BY statut
  `).all();

  // Top clients (utilisateurs avec le plus de dépenses)
  const topClients = db.prepare(`
    SELECT u.nom, u.role, u.pays, COUNT(t.id) nb_achats,
      SUM(t.montant) total_depense
    FROM transactions t JOIN users u ON u.id = t.user_id
    WHERE t.statut='reussi'
    GROUP BY t.user_id ORDER BY total_depense DESC LIMIT 5
  `).all();

  // Taux de conversion (abonnés / total utilisateurs)
  const totalUtilisateurs = db.prepare("SELECT COUNT(*) n FROM users WHERE role IN ('utilisateur','initiative')").get().n;
  const tauxConversion = totalUtilisateurs > 0 ? ((abonnesActifs / totalUtilisateurs) * 100).toFixed(1) : "0.0";

  // Ventes du jour
  const venteJour = db.prepare(`
    SELECT COUNT(*) nb, COALESCE(SUM(montant),0) total
    FROM transactions WHERE statut='reussi' AND date(date_transaction)=date('now')
  `).get();

  // Plans — performance
  const parPlan = db.prepare(`
    SELECT p.nom, p.prix_mensuel, p.prix_annuel,
      COUNT(t.id) AS nb_ventes,
      COALESCE(SUM(CASE WHEN t.statut='reussi' THEN t.montant ELSE 0 END),0) AS revenu
    FROM plans_abonnement p
    LEFT JOIN transactions t ON t.plan_id = p.id AND t.date_transaction >= datetime('now','-30 days')
    GROUP BY p.id ORDER BY revenu DESC
  `).all();

  sendJSON(res, 200, {
    simulation: true,
    abonnes_actifs: abonnesActifs,
    mrr, arr,
    taux_conversion: tauxConversion,
    par_source: parSource,
    tendance_30j: tendance30j,
    paiements_statuts: paiementsStatuts,
    top_clients: topClients,
    vente_jour: venteJour,
    par_plan: parPlan
  });
});

/* ===== PLANS D'ABONNEMENT — CRUD ===== */

route("GET", "/api/admin/plans", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  sendJSON(res, 200, { plans: db.prepare("SELECT * FROM plans_abonnement ORDER BY ordre").all() });
});

route("POST", "/api/admin/plans", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { nom, description, prix_mensuel, prix_annuel, cible, avantages } = body;
  if (!nom) return sendJSON(res, 400, { error: "Nom requis." });
  const id = db.prepare(`
    INSERT INTO plans_abonnement (nom, description, prix_mensuel, prix_annuel, cible, avantages)
    VALUES (?,?,?,?,?,?)
  `).run(nom, description||null, prix_mensuel||0, prix_annuel||0, cible||"tous",
    JSON.stringify(avantages||{})).lastInsertRowid;
  sendJSON(res, 201, { id });
});

route("PUT", "/api/admin/plans/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { nom, description, prix_mensuel, prix_annuel, cible, avantages, actif } = body;
  db.prepare(`
    UPDATE plans_abonnement SET nom=?,description=?,prix_mensuel=?,prix_annuel=?,cible=?,avantages=?,
    actif=?,updated_at=datetime('now') WHERE id=?
  `).run(nom, description||null, prix_mensuel||0, prix_annuel||0, cible||"tous",
    JSON.stringify(avantages||{}), actif!=null?actif:1, params.id);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/admin/plans/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  db.prepare("UPDATE plans_abonnement SET actif=0 WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* ===== CODES PROMO — CRUD ===== */

route("GET", "/api/admin/promos", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  sendJSON(res, 200, { promos: db.prepare("SELECT * FROM codes_promo ORDER BY created_at DESC").all() });
});

route("POST", "/api/admin/promos", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { nom, code, type, valeur, date_debut, date_fin, nb_max_utilisations, cible } = body;
  if (!nom || !code || !type) return sendJSON(res, 400, { error: "Nom, code et type requis." });
  const id = db.prepare(`
    INSERT INTO codes_promo (nom, code, type, valeur, date_debut, date_fin, nb_max_utilisations, cible, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(nom, code.toUpperCase(), type, valeur||0, date_debut||null, date_fin||null,
    nb_max_utilisations||null, cible||"tous", user.id).lastInsertRowid;
  sendJSON(res, 201, { id });
});

route("PUT", "/api/admin/promos/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { nom, type, valeur, date_debut, date_fin, nb_max_utilisations, cible, actif } = body;
  db.prepare(`
    UPDATE codes_promo SET nom=?,type=?,valeur=?,date_debut=?,date_fin=?,
    nb_max_utilisations=?,cible=?,actif=? WHERE id=?
  `).run(nom, type, valeur||0, date_debut||null, date_fin||null, nb_max_utilisations||null,
    cible||"tous", actif!=null?actif:1, params.id);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/admin/promos/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  db.prepare("UPDATE codes_promo SET actif=0 WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* ===== PARAMÈTRES PLATEFORME ===== */

route("GET", "/api/admin/parametres", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const params2 = db.prepare("SELECT * FROM parametres_plateforme ORDER BY cle").all();
  const obj = {};
  params2.forEach(p => { obj[p.cle] = { valeur: p.valeur, type: p.type, description: p.description }; });
  sendJSON(res, 200, { parametres: obj });
});

route("PUT", "/api/admin/parametres", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const updates = body.updates || {};
  const stmt = db.prepare(`
    INSERT INTO parametres_plateforme (cle, valeur, updated_at, updated_by)
    VALUES (?,?,datetime('now'),?)
    ON CONFLICT(cle) DO UPDATE SET valeur=excluded.valeur, updated_at=excluded.updated_at, updated_by=excluded.updated_by
  `);
  Object.entries(updates).forEach(([k, v]) => stmt.run(k, String(v), user.id));
  sendJSON(res, 200, { ok: true });
});

/* ===== ABONNÉS — LISTE DÉTAILLÉE ===== */

route("GET", "/api/admin/abonnes", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const abonnes = db.prepare(`
    SELECT a.id, a.user_id, u.nom, u.email, u.role, u.pays,
      a.plan, a.statut, a.date_debut, a.date_fin, a.created_at
    FROM abonnements a LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC LIMIT 50
  `).all();
  // Taux de renouvellement simulé
  const totalExpires = db.prepare("SELECT COUNT(*) n FROM abonnements WHERE statut='expire'").get().n;
  const totalRenouveles = db.prepare("SELECT COUNT(*) n FROM abonnements WHERE statut='actif' AND date_debut > date('now','-60 days')").get().n;
  const tauxRenouvellement = (totalExpires + totalRenouveles) > 0
    ? ((totalRenouveles / (totalExpires + totalRenouveles)) * 100).toFixed(1)
    : "0.0";
  sendJSON(res, 200, { abonnes, taux_renouvellement: tauxRenouvellement, total_expires: totalExpires });
});

/* ===== TRANSACTIONS — LISTE ===== */

route("GET", "/api/admin/transactions", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const txs = db.prepare(`
    SELECT t.*, u.nom AS user_nom, p.nom AS plan_nom
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN plans_abonnement p ON p.id = t.plan_id
    ORDER BY t.date_transaction DESC LIMIT 100
  `).all();
  sendJSON(res, 200, { transactions: txs });
});

/* ===== RÉTENTION ===== */

route("GET", "/api/admin/retention", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });

  // Rétention J+7 : inscrits il y a 7–14 jours ET actifs dans les 7 derniers jours
  const cohortJ7 = db.prepare(`
    SELECT COUNT(*) n FROM users WHERE created_at BETWEEN datetime('now','-14 days') AND datetime('now','-7 days')
  `).get().n;
  const retentionJ7 = db.prepare(`
    SELECT COUNT(DISTINCT u.id) n FROM users u
    JOIN user_activity a ON a.user_id=u.id
    WHERE u.created_at BETWEEN datetime('now','-14 days') AND datetime('now','-7 days')
      AND a.date >= date('now','-7 days')
  `).get().n;

  // Rétention J+30 : inscrits il y a 30–60 jours ET actifs dans les 30 derniers jours
  const cohortJ30 = db.prepare(`
    SELECT COUNT(*) n FROM users WHERE created_at BETWEEN datetime('now','-60 days') AND datetime('now','-30 days')
  `).get().n;
  const retentionJ30 = db.prepare(`
    SELECT COUNT(DISTINCT u.id) n FROM users u
    JOIN user_activity a ON a.user_id=u.id
    WHERE u.created_at BETWEEN datetime('now','-60 days') AND datetime('now','-30 days')
      AND a.date >= date('now','-30 days')
  `).get().n;

  // Rétention J+90 : inscrits il y a 90–180 jours ET actifs dans les 90 derniers jours
  const cohortJ90 = db.prepare(`
    SELECT COUNT(*) n FROM users WHERE created_at BETWEEN datetime('now','-180 days') AND datetime('now','-90 days')
  `).get().n;
  const retentionJ90 = db.prepare(`
    SELECT COUNT(DISTINCT u.id) n FROM users u
    JOIN user_activity a ON a.user_id=u.id
    WHERE u.created_at BETWEEN datetime('now','-180 days') AND datetime('now','-90 days')
      AND a.date >= date('now','-90 days')
  `).get().n;

  const pct = (n, total) => total > 0 ? ((n/total)*100).toFixed(1) : "—";

  sendJSON(res, 200, {
    j7:  { cohorte: cohortJ7,  actifs: retentionJ7,  taux: pct(retentionJ7, cohortJ7) },
    j30: { cohorte: cohortJ30, actifs: retentionJ30, taux: pct(retentionJ30, cohortJ30) },
    j90: { cohorte: cohortJ90, actifs: retentionJ90, taux: pct(retentionJ90, cohortJ90) },
  });
});

/* ===== HEARTBEAT SESSION (temps passé sur la plateforme) ===== */

route("POST", "/api/session/heartbeat", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 200, { ok: false });
  const secs = Math.min(Math.max(parseInt(body.secs) || 30, 1), 120);
  db.prepare(`
    INSERT INTO user_sessions (user_id, date, duree_sec) VALUES (?, date('now'), ?)
    ON CONFLICT(user_id, date) DO UPDATE SET duree_sec = duree_sec + excluded.duree_sec
  `).run(user.id, secs);
  // Aussi tracer l'activité du jour
  db.prepare("INSERT OR IGNORE INTO user_activity (user_id, date) VALUES (?, date('now'))").run(user.id);
  sendJSON(res, 200, { ok: true });
});

/* ===== MODULE PUBLICITÉS ===== */

/* Helper : vérifie si un tableau de ciblage accepte une valeur (vide = tous) */
function pubCibleMatch(cibleJson, valeurs) {
  const cible = safeParse(cibleJson);
  if (!Array.isArray(cible) || cible.length === 0) return true;
  if (!valeurs) return false;
  const vals = Array.isArray(valeurs) ? valeurs : [valeurs];
  return cible.some(c => vals.some(v => v && v.toLowerCase() === c.toLowerCase()));
}

/* Servir une publicité adaptée à l'utilisateur courant */
/* GET /api/publicites/mes — publicités soumises par l'initiative connectée */
route("GET", "/api/publicites/mes", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = db.prepare("SELECT id,nom_campagne,titre,statut,format,created_at,updated_at,nb_impressions,nb_clics,date_debut,date_fin FROM publicites WHERE created_by=? ORDER BY created_at DESC").all(user.id);
  sendJSON(res, 200, { publicites: rows });
});

/* POST /api/publicites — soumettre une publicité (requiert accréditation creation_publicite) */
route("POST", "/api/publicites", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!hasAccred(user.id, "creation_publicite")) return sendJSON(res, 403, { error: "Accréditation « Création de Publicité » requise pour soumettre une publicité." });
  const b = _pubBody(body);
  b.statut = "en_attente"; // toujours en attente de validation admin
  b.type_sponsor = "initiative";
  b.priorite = 2;
  if (!b.titre && !b.nom_campagne) return sendJSON(res, 400, { error: "Titre requis." });
  if (!b.annonceur) b.annonceur = user.nom;
  const id = db.prepare(`
    INSERT INTO publicites (
      nom_campagne,reference_interne,annonceur,categorie,type_sponsor,sponsor_id,
      format,statut,priorite,
      titre,sous_titre,description_courte,description_detaillee,description,
      logo_annonceur,image_url,galerie_images,video_url,
      bouton_action,lien_url,lien_texte,lien_type,lien_interne_id,lien_site,
      contact_telephone,contact_whatsapp,contact_email,contact_adresse,
      reseaux_sociaux,moyens_paiement,
      zone_geo,cible_continents,cible_pays,cible_regions,cible_villes,cible_pays_residence,
      cible_roles,cible_nationalites,cible_origines,cible_interets,
      emplacements,max_affichages_user,max_affichages_jour,max_clics,
      date_debut,date_fin,heure_debut,heure_fin,
      notes_admin,created_by
    ) VALUES (${",?".repeat(50).slice(1)})
  `).run(
    b.nom_campagne,b.reference_interne,b.annonceur,b.categorie,b.type_sponsor,b.sponsor_id,
    b.format,b.statut,b.priorite,
    b.titre,b.sous_titre,b.description_courte,b.description_detaillee,b.description,
    b.logo_annonceur,b.image_url,b.galerie_images,b.video_url,
    b.bouton_action,b.lien_url,b.lien_texte,b.lien_type,b.lien_interne_id,b.lien_site,
    b.contact_telephone,b.contact_whatsapp,b.contact_email,b.contact_adresse,
    b.reseaux_sociaux,b.moyens_paiement,
    b.zone_geo,b.cible_continents,b.cible_pays,b.cible_regions,b.cible_villes,b.cible_pays_residence,
    b.cible_roles,b.cible_nationalites,b.cible_origines,b.cible_interets,
    b.emplacements,b.max_affichages_user,b.max_affichages_jour,b.max_clics,
    b.date_debut,b.date_fin,b.heure_debut,b.heure_fin,
    null,user.id
  ).lastInsertRowid;
  // Notifier les admins
  const admins = db.prepare("SELECT id FROM users WHERE role='administrateur'").all();
  admins.forEach(a => creerNotif(a.id, "validation", "Nouvelle publicité soumise", `${user.nom} a soumis une publicité « ${b.titre||b.nom_campagne} » en attente de validation.`, { publicite_id: Number(id) }));
  sendJSON(res, 201, { id, ok: true });
});

route("GET", "/api/publicites/servir", async (req, res, params, body, query) => {
  const format = query.format || "banniere";
  const user = getCurrentUser(req);
  const now = new Date().toISOString().slice(0, 10);

  const candidates = db.prepare(`
    SELECT * FROM publicites
    WHERE statut = 'active'
      AND format = ?
      AND (date_debut IS NULL OR date_debut <= ?)
      AND (date_fin IS NULL OR date_fin >= ?)
    ORDER BY priorite DESC, RANDOM()
  `).all(format, now, now);

  let pub = null;
  for (const p of candidates) {
    if (user) {
      if (!pubCibleMatch(p.cible_pays, user.pays)) continue;
      if (!pubCibleMatch(p.cible_roles, user.role)) continue;
      const profil = safeParse(user.profil_json || "{}");
      const nats = [user.nationalite1, user.nationalite2].filter(Boolean);
      if (!pubCibleMatch(p.cible_nationalites, nats.length ? nats : null)) continue;
    } else {
      if (!pubCibleMatch(p.cible_roles, null)) continue;
    }
    pub = p;
    break;
  }

  if (!pub) return sendJSON(res, 200, { pub: null });

  // Enregistrer l'impression
  db.prepare("INSERT INTO publicite_events (publicite_id,type,user_id,user_pays,user_ville) VALUES (?,?,?,?,?)")
    .run(pub.id, "impression", user?.id || null, user?.pays || null, user?.ville || null);
  db.prepare("UPDATE publicites SET nb_impressions=nb_impressions+1,updated_at=datetime('now') WHERE id=?").run(pub.id);

  sendJSON(res, 200, { pub: {
    id: pub.id, titre: pub.titre, description: pub.description,
    image_url: pub.image_url, lien_url: pub.lien_url, lien_texte: pub.lien_texte,
    annonceur: pub.annonceur, format: pub.format, priorite: pub.priorite
  }});
});

/* Enregistrer un clic */
route("POST", "/api/publicites/:id/clic", async (req, res, params) => {
  const user = getCurrentUser(req);
  db.prepare("INSERT INTO publicite_events (publicite_id,type,user_id,user_pays,user_ville) VALUES (?,?,?,?,?)")
    .run(params.id, "clic", user?.id || null, user?.pays || null, user?.ville || null);
  db.prepare("UPDATE publicites SET nb_clics=nb_clics+1,updated_at=datetime('now') WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* ---- Admin : CRUD publicités ---- */
route("GET", "/api/admin/publicites", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
  const rows = db.prepare("SELECT * FROM publicites ORDER BY created_at DESC").all();
  sendJSON(res, 200, { publicites: rows });
});

function _pubBody(body) {
  const j = (v, def="[]") => { try { return JSON.stringify(Array.isArray(v) ? v : JSON.parse(v||def)); } catch { return def; } };
  const jo = (v) => { try { return JSON.stringify(typeof v==="object"&&!Array.isArray(v) ? v : JSON.parse(v||"{}")); } catch { return "{}"; } };
  return {
    nom_campagne: body.nom_campagne||null,
    reference_interne: body.reference_interne||null,
    annonceur: body.annonceur,
    categorie: body.categorie||"general",
    type_sponsor: body.type_sponsor||"partenaire",
    sponsor_id: body.sponsor_id||null,
    format: body.format||"banniere",
    statut: body.statut||"brouillon",
    priorite: parseInt(body.priorite)||2,
    titre: body.titre,
    sous_titre: body.sous_titre||null,
    description_courte: body.description_courte||null,
    description_detaillee: body.description_detaillee||null,
    description: body.description||body.description_courte||null,
    logo_annonceur: body.logo_annonceur||null,
    image_url: body.image_url||null,
    galerie_images: j(body.galerie_images),
    video_url: body.video_url||null,
    bouton_action: body.bouton_action||body.lien_texte||"En savoir plus",
    lien_url: body.lien_url||body.lien_site||null,
    lien_texte: body.lien_texte||body.bouton_action||"En savoir plus",
    lien_type: body.lien_type||"externe",
    lien_interne_id: body.lien_interne_id||null,
    lien_site: body.lien_site||null,
    contact_telephone: body.contact_telephone||null,
    contact_whatsapp: body.contact_whatsapp||null,
    contact_email: body.contact_email||null,
    contact_adresse: body.contact_adresse||null,
    reseaux_sociaux: jo(body.reseaux_sociaux),
    moyens_paiement: j(body.moyens_paiement),
    zone_geo: body.zone_geo||"monde",
    cible_continents: j(body.cible_continents),
    cible_pays: j(body.cible_pays),
    cible_regions: j(body.cible_regions),
    cible_villes: j(body.cible_villes),
    cible_pays_residence: j(body.cible_pays_residence),
    cible_roles: j(body.cible_roles),
    cible_nationalites: j(body.cible_nationalites),
    cible_origines: j(body.cible_origines),
    cible_interets: j(body.cible_interets),
    emplacements: j(body.emplacements, '["fil"]'),
    max_affichages_user: parseInt(body.max_affichages_user)||0,
    max_affichages_jour: parseInt(body.max_affichages_jour)||0,
    max_clics: parseInt(body.max_clics)||0,
    date_debut: body.date_debut||null,
    date_fin: body.date_fin||null,
    heure_debut: body.heure_debut||null,
    heure_fin: body.heure_fin||null,
    notes_admin: body.notes_admin||null,
  };
}

route("POST", "/api/admin/publicites", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
  const b = _pubBody(body);
  if (!b.titre || !b.annonceur) return sendJSON(res, 400, { error: "titre et annonceur requis." });
  const id = db.prepare(`
    INSERT INTO publicites (
      nom_campagne,reference_interne,annonceur,categorie,type_sponsor,sponsor_id,
      format,statut,priorite,
      titre,sous_titre,description_courte,description_detaillee,description,
      logo_annonceur,image_url,galerie_images,video_url,
      bouton_action,lien_url,lien_texte,lien_type,lien_interne_id,lien_site,
      contact_telephone,contact_whatsapp,contact_email,contact_adresse,
      reseaux_sociaux,moyens_paiement,
      zone_geo,cible_continents,cible_pays,cible_regions,cible_villes,cible_pays_residence,
      cible_roles,cible_nationalites,cible_origines,cible_interets,
      emplacements,max_affichages_user,max_affichages_jour,max_clics,
      date_debut,date_fin,heure_debut,heure_fin,
      notes_admin,created_by
    ) VALUES (${",?".repeat(50).slice(1)})
  `).run(
    b.nom_campagne,b.reference_interne,b.annonceur,b.categorie,b.type_sponsor,b.sponsor_id,
    b.format,b.statut,b.priorite,
    b.titre,b.sous_titre,b.description_courte,b.description_detaillee,b.description,
    b.logo_annonceur,b.image_url,b.galerie_images,b.video_url,
    b.bouton_action,b.lien_url,b.lien_texte,b.lien_type,b.lien_interne_id,b.lien_site,
    b.contact_telephone,b.contact_whatsapp,b.contact_email,b.contact_adresse,
    b.reseaux_sociaux,b.moyens_paiement,
    b.zone_geo,b.cible_continents,b.cible_pays,b.cible_regions,b.cible_villes,b.cible_pays_residence,
    b.cible_roles,b.cible_nationalites,b.cible_origines,b.cible_interets,
    b.emplacements,b.max_affichages_user,b.max_affichages_jour,b.max_clics,
    b.date_debut,b.date_fin,b.heure_debut,b.heure_fin,
    b.notes_admin,user.id
  ).lastInsertRowid;
  sendJSON(res, 201, { id });
});

route("PUT", "/api/admin/publicites/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
  const b = _pubBody(body);
  db.prepare(`
    UPDATE publicites SET
      nom_campagne=?,reference_interne=?,annonceur=?,categorie=?,type_sponsor=?,sponsor_id=?,
      format=?,statut=?,priorite=?,
      titre=?,sous_titre=?,description_courte=?,description_detaillee=?,description=?,
      logo_annonceur=?,image_url=?,galerie_images=?,video_url=?,
      bouton_action=?,lien_url=?,lien_texte=?,lien_type=?,lien_interne_id=?,lien_site=?,
      contact_telephone=?,contact_whatsapp=?,contact_email=?,contact_adresse=?,
      reseaux_sociaux=?,moyens_paiement=?,
      zone_geo=?,cible_continents=?,cible_pays=?,cible_regions=?,cible_villes=?,cible_pays_residence=?,
      cible_roles=?,cible_nationalites=?,cible_origines=?,cible_interets=?,
      emplacements=?,max_affichages_user=?,max_affichages_jour=?,max_clics=?,
      date_debut=?,date_fin=?,heure_debut=?,heure_fin=?,
      notes_admin=?,updated_at=datetime('now')
    WHERE id=?
  `).run(
    b.nom_campagne,b.reference_interne,b.annonceur,b.categorie,b.type_sponsor,b.sponsor_id,
    b.format,b.statut,b.priorite,
    b.titre,b.sous_titre,b.description_courte,b.description_detaillee,b.description,
    b.logo_annonceur,b.image_url,b.galerie_images,b.video_url,
    b.bouton_action,b.lien_url,b.lien_texte,b.lien_type,b.lien_interne_id,b.lien_site,
    b.contact_telephone,b.contact_whatsapp,b.contact_email,b.contact_adresse,
    b.reseaux_sociaux,b.moyens_paiement,
    b.zone_geo,b.cible_continents,b.cible_pays,b.cible_regions,b.cible_villes,b.cible_pays_residence,
    b.cible_roles,b.cible_nationalites,b.cible_origines,b.cible_interets,
    b.emplacements,b.max_affichages_user,b.max_affichages_jour,b.max_clics,
    b.date_debut,b.date_fin,b.heure_debut,b.heure_fin,
    b.notes_admin, params.id
  );
  sendJSON(res, 200, { ok: true });
});

route("POST", "/api/admin/publicites/:id/statut", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
  const { statut, refus_motif } = body;
  const valides = ["brouillon","en_attente","active","suspendue","terminee","refusee","pausee","expiree"];
  if (!valides.includes(statut)) return sendJSON(res, 400, { error: "Statut invalide." });
  const extra = statut === "active"
    ? ", validated_by=?, validated_at=datetime('now')"
    : statut === "refusee" ? ", refus_motif=?" : "";
  const args = [statut];
  if (statut === "active") args.push(user.id);
  else if (statut === "refusee") args.push(refus_motif||null);
  args.push(params.id);
  db.prepare(`UPDATE publicites SET statut=?,updated_at=datetime('now')${extra} WHERE id=?`).run(...args);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/admin/publicites/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
  db.prepare("DELETE FROM publicite_events WHERE publicite_id=?").run(params.id);
  db.prepare("DELETE FROM publicites WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

route("GET", "/api/admin/publicites/:id/stats", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
  const pub = db.prepare(`
    SELECT id,titre,annonceur,statut,nb_impressions,nb_clics,nb_portee,nb_partages,nb_enregistrements,nb_contacts,nb_messages
    FROM publicites WHERE id=?
  `).get(params.id);
  if (!pub) return sendJSON(res, 404, { error: "Publicité introuvable." });
  const parPays = db.prepare(`
    SELECT user_pays AS pays, COUNT(*) AS n FROM publicite_events
    WHERE publicite_id=? AND type='impression' AND user_pays IS NOT NULL
    GROUP BY user_pays ORDER BY n DESC LIMIT 10
  `).all(params.id);
  const parJour = db.prepare(`
    SELECT date(created_at) AS jour,
      SUM(CASE WHEN type='impression' THEN 1 ELSE 0 END) AS impressions,
      SUM(CASE WHEN type='clic' THEN 1 ELSE 0 END) AS clics
    FROM publicite_events WHERE publicite_id=?
    GROUP BY jour ORDER BY jour DESC LIMIT 30
  `).all(params.id);
  const parNationalite = db.prepare(`
    SELECT user_nationalite AS nationalite, COUNT(*) AS n FROM publicite_events
    WHERE publicite_id=? AND type='impression' AND user_nationalite IS NOT NULL
    GROUP BY user_nationalite ORDER BY n DESC LIMIT 10
  `).all(params.id);
  const parRole = db.prepare(`
    SELECT user_role AS role, COUNT(*) AS n FROM publicite_events
    WHERE publicite_id=? AND type='impression' AND user_role IS NOT NULL
    GROUP BY user_role ORDER BY n DESC
  `).all(params.id);
  const ctr = pub.nb_impressions > 0 ? ((pub.nb_clics / pub.nb_impressions) * 100).toFixed(2) : "0.00";
  sendJSON(res, 200, { pub, ctr, par_pays: parPays, par_jour: parJour, par_nationalite: parNationalite, par_role: parRole });
});

/* ===== MODULE INSTITUTIONS & OBSERVATOIRE ===== */

/* Helper : accréditation active d'une institution */
function getAccred(institutionId) {
  return db.prepare("SELECT * FROM accreditations_observatoire WHERE institution_id=? AND statut='actif'").get(institutionId) || null;
}

/* Helper : construit la clause WHERE pour filtrer users selon le périmètre de l'accréditation */
function buildObsWhere(accred, tableAlias = "u") {
  const nats = safeParse(accred.nationalites_autorisees);
  const terrs = safeParse(accred.territoires_autorises);
  const conds = [];
  const params = [];

  if (nats.length > 0) {
    const ph = nats.map(() => "?").join(",");
    conds.push(`(${tableAlias}.nationalite1 IN (${ph}) OR ${tableAlias}.nationalite2 IN (${ph}) OR ${tableAlias}.nationalite3 IN (${ph}))`);
    params.push(...nats, ...nats, ...nats);
  }
  if (terrs.length > 0) {
    const terrConds = terrs.map(t => {
      if (t.ville) { params.push(t.pays, t.region, t.ville); return `(${tableAlias}.pays=? AND ${tableAlias}.region=? AND ${tableAlias}.ville=?)`; }
      if (t.region) { params.push(t.pays, t.region); return `(${tableAlias}.pays=? AND ${tableAlias}.region=?)`; }
      params.push(t.pays); return `(${tableAlias}.pays=?)`;
    });
    conds.push(`(${terrConds.join(" OR ")})`);
  }
  const where = conds.length ? "AND " + conds.join(" AND ") : "";
  return { where, params };
}

/* Helper : historique accréditation */
function histoAccred(accredId, action, admin, details) {
  db.prepare("INSERT INTO accreditations_historique (accreditation_id,action,admin_id,admin_nom,details) VALUES (?,?,?,?,?)")
    .run(accredId, action, admin.id, admin.nom, details || null);
  db.prepare("UPDATE accreditations_observatoire SET updated_at=datetime('now') WHERE id=?").run(accredId);
}

/* ===========================
   ADMIN — Accréditations Observatoire
=========================== */
route("GET", "/api/admin/accreditations", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
    const rows = db.prepare(`
      SELECT ao.*, u.nom AS institution_nom, u.email AS institution_email, u.ville, u.pays, u.type_institution
      FROM accreditations_observatoire ao
      JOIN users u ON u.id = ao.institution_id
      ORDER BY ao.created_at DESC
    `).all();
    const institutions = db.prepare("SELECT id,nom,email,ville,pays,type_institution FROM users WHERE role='collectivite' ORDER BY nom").all();
    sendJSON(res, 200, { accreditations: rows, institutions });
  });

  route("POST", "/api/admin/accreditations", async (req, res, params, body) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
    const { institution_id, date_fin, nationalites_autorisees, territoires_autorises, droits, notes_admin } = body;
    if (!institution_id) return sendJSON(res, 400, { error: "institution_id requis." });
    const inst = db.prepare("SELECT id,nom FROM users WHERE id=? AND role='collectivite'").get(institution_id);
    if (!inst) return sendJSON(res, 404, { error: "Institution introuvable." });
    const existing = db.prepare("SELECT id FROM accreditations_observatoire WHERE institution_id=? AND statut='actif'").get(institution_id);
    if (existing) return sendJSON(res, 409, { error: "Cette institution possède déjà une accréditation active." });
    const id = db.prepare(`INSERT INTO accreditations_observatoire (institution_id,date_fin,nationalites_autorisees,territoires_autorises,droits,notes_admin)
      VALUES (?,?,?,?,?,?)`).run(institution_id, date_fin||null,
      JSON.stringify(nationalites_autorisees||[]), JSON.stringify(territoires_autorises||[]),
      JSON.stringify(droits||{}), notes_admin||null).lastInsertRowid;
    histoAccred(id, "creation", user, `Accréditation créée pour ${inst.nom}`);
    creerNotif(institution_id, "accreditation", "🏛️ Accréditation Observatoire obtenue",
      "Vous avez reçu l'accréditation Observatoire Diaspora Diaspo'Actif. Accédez à votre tableau de bord pour consulter les statistiques.");
    sendJSON(res, 201, { id });
  });

  route("PUT", "/api/admin/accreditations/:id", async (req, res, params, body) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
    const accred = db.prepare("SELECT * FROM accreditations_observatoire WHERE id=?").get(params.id);
    if (!accred) return sendJSON(res, 404, { error: "Accréditation introuvable." });
    const { date_fin, nationalites_autorisees, territoires_autorises, droits, notes_admin } = body;
    db.prepare(`UPDATE accreditations_observatoire SET date_fin=?,nationalites_autorisees=?,territoires_autorises=?,droits=?,notes_admin=?,updated_at=datetime('now') WHERE id=?`)
      .run(date_fin||null, JSON.stringify(nationalites_autorisees||[]), JSON.stringify(territoires_autorises||[]),
        JSON.stringify(droits||{}), notes_admin||null, params.id);
    histoAccred(params.id, "modification", user, "Périmètre et droits mis à jour");
    sendJSON(res, 200, { ok: true });
  });

  route("POST", "/api/admin/accreditations/:id/suspendre", async (req, res, params, body) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
    const accred = db.prepare("SELECT * FROM accreditations_observatoire WHERE id=?").get(params.id);
    if (!accred) return sendJSON(res, 404, { error: "Accréditation introuvable." });
    db.prepare("UPDATE accreditations_observatoire SET statut='suspendu',updated_at=datetime('now') WHERE id=?").run(params.id);
    histoAccred(params.id, "suspension", user, body.motif || "Suspension administrative");
    sendJSON(res, 200, { ok: true });
  });

  route("POST", "/api/admin/accreditations/:id/retirer", async (req, res, params, body) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
    const accred = db.prepare("SELECT * FROM accreditations_observatoire WHERE id=?").get(params.id);
    if (!accred) return sendJSON(res, 404, { error: "Accréditation introuvable." });
    db.prepare("UPDATE accreditations_observatoire SET statut='retire',updated_at=datetime('now') WHERE id=?").run(params.id);
    histoAccred(params.id, "retrait", user, body.motif || "Retrait définitif");
    sendJSON(res, 200, { ok: true });
  });

  route("POST", "/api/admin/accreditations/:id/reactiver", async (req, res, params, body) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
    db.prepare("UPDATE accreditations_observatoire SET statut='actif',updated_at=datetime('now') WHERE id=?").run(params.id);
    histoAccred(params.id, "reactivation", user, body.motif || "Réactivation");
    sendJSON(res, 200, { ok: true });
  });

  route("GET", "/api/admin/accreditations/:id/historique", async (req, res, params) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
    const rows = db.prepare("SELECT * FROM accreditations_historique WHERE accreditation_id=? ORDER BY created_at DESC").all(params.id);
    sendJSON(res, 200, { historique: rows });
  });

  /* ===========================
     OBSERVATOIRE — Stats accréditées (collectivite uniquement)
  =========================== */
  route("GET", "/api/observatoire/statut", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "collectivite") return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const accred = getAccred(user.id);
    if (!accred) return sendJSON(res, 200, { accreditee: false });
    sendJSON(res, 200, {
      accreditee: true,
      accreditation: {
        id: accred.id, statut: accred.statut,
        date_debut: accred.date_debut, date_fin: accred.date_fin,
        nationalites_autorisees: safeParse(accred.nationalites_autorisees),
        territoires_autorises: safeParse(accred.territoires_autorises),
        droits: safeParse(accred.droits),
      }
    });
  });

  route("GET", "/api/observatoire/vue-generale", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "collectivite") return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const accred = getAccred(user.id);
    if (!accred) return sendJSON(res, 403, { error: "Accréditation Observatoire requise." });
    const { where, params: p } = buildObsWhere(accred);
    const totalMembres = db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE role='utilisateur' ${where}`).get(...p).n;
    const totalInitiatives = db.prepare(`SELECT COUNT(*) AS n FROM initiatives i WHERE 1=1 ${where.replace(/u\./g,"i.")}`).get(...p).n;
    const totalPays = db.prepare(`SELECT COUNT(DISTINCT u.pays) AS n FROM users u WHERE role='utilisateur' AND u.pays IS NOT NULL ${where}`).get(...p).n;
    const totalAssociations = db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE role='initiative' ${where}`).get(...p).n;
    sendJSON(res, 200, {
      seuil_confidentialite: SEUIL_CONFIDENTIALITE,
      total_membres: totalMembres >= SEUIL_CONFIDENTIALITE ? totalMembres : null,
      total_initiatives: totalInitiatives,
      total_pays: totalPays,
      total_associations: totalAssociations,
    });
  });

  route("GET", "/api/observatoire/geographie", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "collectivite") return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const accred = getAccred(user.id);
    if (!accred) return sendJSON(res, 403, { error: "Accréditation requise." });
    const { where, params: p } = buildObsWhere(accred);
    const parPays = db.prepare(`SELECT u.pays, COUNT(*) AS n FROM users u WHERE role='utilisateur' AND u.pays IS NOT NULL ${where} GROUP BY u.pays ORDER BY n DESC LIMIT 30`).all(...p);
    const parRegion = db.prepare(`SELECT u.region, u.pays, COUNT(*) AS n FROM users u WHERE role='utilisateur' AND u.region IS NOT NULL ${where} GROUP BY u.region, u.pays ORDER BY n DESC LIMIT 20`).all(...p);
    const parVille = db.prepare(`SELECT u.ville, u.pays, COUNT(*) AS n FROM users u WHERE role='utilisateur' AND u.ville IS NOT NULL ${where} GROUP BY u.ville, u.pays ORDER BY n DESC LIMIT 20`).all(...p);
    const mask = n => n >= SEUIL_CONFIDENTIALITE ? n : null;
    sendJSON(res, 200, {
      par_pays: parPays.map(r => ({ ...r, n: mask(r.n) })).filter(r => r.n),
      par_region: parRegion.map(r => ({ ...r, n: mask(r.n) })).filter(r => r.n),
      par_ville: parVille.map(r => ({ ...r, n: mask(r.n) })).filter(r => r.n),
    });
  });

  route("GET", "/api/observatoire/competences", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "collectivite") return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const accred = getAccred(user.id);
    if (!accred) return sendJSON(res, 403, { error: "Accréditation requise." });
    const { where, params: p } = buildObsWhere(accred);
    const rows = db.prepare(`SELECT u.situation_pro, COUNT(*) AS n FROM users u WHERE role='utilisateur' AND u.situation_pro IS NOT NULL ${where} GROUP BY u.situation_pro ORDER BY n DESC`).all(...p);
    const mask = n => n >= SEUIL_CONFIDENTIALITE ? n : null;
    sendJSON(res, 200, { competences: rows.map(r => ({ label: r.situation_pro, n: mask(r.n) })).filter(r => r.n) });
  });

  route("GET", "/api/observatoire/secteurs", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "collectivite") return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const accred = getAccred(user.id);
    if (!accred) return sendJSON(res, 403, { error: "Accréditation requise." });
    const { where, params: p } = buildObsWhere(accred);
    const rows = db.prepare(`SELECT i.domaine, COUNT(*) AS n FROM initiatives i WHERE i.domaine IS NOT NULL GROUP BY i.domaine ORDER BY n DESC`).all();
    const mask = n => n >= SEUIL_CONFIDENTIALITE ? n : null;
    sendJSON(res, 200, { secteurs: rows.map(r => ({ label: r.domaine, n: r.n })) });
  });

  route("GET", "/api/observatoire/initiatives-stats", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "collectivite") return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const accred = getAccred(user.id);
    if (!accred) return sendJSON(res, 403, { error: "Accréditation requise." });
    const nats = safeParse(accred.nationalites_autorisees);
    const terrs = safeParse(accred.territoires_autorises);
    let conds = []; const p = [];
    if (nats.length) { const ph = nats.map(()=>"?").join(","); conds.push(`(i.nationalite1 IN (${ph}) OR i.nationalite2 IN (${ph}))`); p.push(...nats,...nats); }
    if (terrs.length) { const tc = terrs.map(t => { if(t.ville){p.push(t.pays,t.region,t.ville);return`(i.pays=? AND i.region=? AND i.ville=?)`;}if(t.region){p.push(t.pays,t.region);return`(i.pays=? AND i.region=?)`;}p.push(t.pays);return`(i.pays=?)`;});conds.push(`(${tc.join(" OR ")})`); }
    const where = conds.length ? "AND "+conds.join(" AND ") : "";
    const parDomaine = db.prepare(`SELECT domaine, COUNT(*) AS n, SUM(membres) AS total_membres, SUM(vues) AS total_vues FROM initiatives i WHERE 1=1 ${where} GROUP BY domaine ORDER BY n DESC`).all(...p);
    const parPays = db.prepare(`SELECT pays, COUNT(*) AS n FROM initiatives i WHERE pays IS NOT NULL ${where} GROUP BY pays ORDER BY n DESC LIMIT 15`).all(...p);
    const total = db.prepare(`SELECT COUNT(*) AS n, SUM(membres) AS membres, SUM(abonnes) AS abonnes FROM initiatives i WHERE 1=1 ${where}`).get(...p);
    sendJSON(res, 200, { total, par_domaine: parDomaine, par_pays: parPays });
  });

  route("GET", "/api/observatoire/investissements", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "collectivite") return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const accred = getAccred(user.id);
    if (!accred) return sendJSON(res, 403, { error: "Accréditation requise." });
    // Offres de type investissement
    const parType = db.prepare(`SELECT type, COUNT(*) AS n FROM offres WHERE type IN ('investissement','financement','incubation','acceleration') GROUP BY type ORDER BY n DESC`).all();
    const parSecteur = db.prepare(`SELECT secteur, COUNT(*) AS n FROM offres WHERE secteur IS NOT NULL AND type IN ('investissement','financement') GROUP BY secteur ORDER BY n DESC LIMIT 10`).all();
    const parPays = db.prepare(`SELECT pays, COUNT(*) AS n FROM offres WHERE pays IS NOT NULL AND type='investissement' GROUP BY pays ORDER BY n DESC LIMIT 10`).all();
    const totalMontant = db.prepare(`SELECT SUM(salaire_min) AS min, SUM(salaire_max) AS max FROM offres WHERE type='investissement'`).get();
    sendJSON(res, 200, {
      par_type: parType,
      par_secteur: parSecteur.map(r => ({ ...r, label: r.secteur })),
      par_pays: parPays.map(r => ({ ...r, label: r.pays })),
      montants: { min: totalMontant?.min || 0, max: totalMontant?.max || 0 },
    });
  });

  route("GET", "/api/observatoire/emploi", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "collectivite") return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const accred = getAccred(user.id);
    if (!accred) return sendJSON(res, 403, { error: "Accréditation requise." });
    const parType = db.prepare(`SELECT type, COUNT(*) AS n FROM offres WHERE type IN ('emploi','stage','mission','contrat') GROUP BY type ORDER BY n DESC`).all();
    const parSecteur = db.prepare(`SELECT secteur, COUNT(*) AS n FROM offres WHERE secteur IS NOT NULL AND type IN ('emploi','stage','mission','contrat') GROUP BY secteur ORDER BY n DESC LIMIT 10`).all();
    const parPays = db.prepare(`SELECT pays, COUNT(*) AS n FROM offres WHERE pays IS NOT NULL AND type IN ('emploi','stage','mission','contrat') GROUP BY pays ORDER BY n DESC LIMIT 10`).all();
    const parMois = db.prepare(`SELECT strftime('%Y-%m', created_at) AS mois, COUNT(*) AS n FROM offres WHERE type IN ('emploi','stage','mission','contrat') AND created_at >= datetime('now','-12 months') GROUP BY mois ORDER BY mois`).all();
    const totalCandidatures = db.prepare(`SELECT COUNT(*) AS n FROM offres_candidatures`).get().n;
    sendJSON(res, 200, {
      par_type: parType.map(r => ({ ...r, label: r.type })),
      par_secteur: parSecteur.map(r => ({ ...r, label: r.secteur })),
      par_pays: parPays.map(r => ({ ...r, label: r.pays })),
      par_mois: parMois,
      total_candidatures: totalCandidatures,
    });
  });

  route("GET", "/api/observatoire/associations", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "collectivite") return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const accred = getAccred(user.id);
    if (!accred) return sendJSON(res, 403, { error: "Accréditation requise." });
    const { where, params: p } = buildObsWhere(accred);
    const parDomaine = db.prepare(`SELECT i.domaine, COUNT(*) AS n FROM initiatives i WHERE i.type_structure IN ('association','fondation','collectif') ${where.replace(/u\./g,"i.")} GROUP BY i.domaine ORDER BY n DESC LIMIT 15`).all(...p);
    const parPays = db.prepare(`SELECT i.pays, COUNT(*) AS n FROM initiatives i WHERE i.type_structure IN ('association','fondation','collectif') AND i.pays IS NOT NULL ${where.replace(/u\./g,"i.")} GROUP BY i.pays ORDER BY n DESC LIMIT 15`).all(...p);
    const total = db.prepare(`SELECT COUNT(*) AS n, SUM(membres) AS membres FROM initiatives i WHERE i.type_structure IN ('association','fondation','collectif') ${where.replace(/u\./g,"i.")}`).get(...p);
    const mask = n => n >= SEUIL_CONFIDENTIALITE ? n : null;
    sendJSON(res, 200, {
      total: { n: total?.n || 0, membres: mask(total?.membres) },
      par_domaine: parDomaine.map(r => ({ ...r, label: r.domaine })),
      par_pays: parPays.map(r => ({ ...r, label: r.pays })),
    });
  });

  route("GET", "/api/observatoire/export-csv", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "collectivite") return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const accred = getAccred(user.id);
    if (!accred) return sendJSON(res, 403, { error: "Accréditation requise." });
    const { where, params: p } = buildObsWhere(accred);
    const geo = db.prepare(`SELECT u.pays, u.ville, COUNT(*) AS n FROM users u WHERE role='utilisateur' AND u.pays IS NOT NULL ${where} GROUP BY u.pays, u.ville ORDER BY n DESC`).all(...p);
    const comp = db.prepare(`SELECT u.situation_pro, COUNT(*) AS n FROM users u WHERE role='utilisateur' AND u.situation_pro IS NOT NULL ${where} GROUP BY u.situation_pro ORDER BY n DESC`).all(...p);
    // Build CSV
    const lines = ["Type,Catégorie,Valeur,Nombre"];
    geo.forEach(r => r.n >= SEUIL_CONFIDENTIALITE && lines.push(`Géographie,${r.pays},${r.ville||''},${r.n}`));
    comp.forEach(r => r.n >= SEUIL_CONFIDENTIALITE && lines.push(`Compétences,,${r.situation_pro},${r.n}`));
    const csv = lines.join("\r\n");
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="observatoire-${new Date().toISOString().slice(0,10)}.csv"`,
    });
    res.end("﻿" + csv); // BOM pour Excel
  });

  /* ===========================
     RAPPORTS AUTOMATIQUES OBSERVATOIRE
  =========================== */
  route("GET", "/api/observatoire/rapport", async (req, res, params, body, query) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "collectivite") return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const accred = getAccred(user.id);
    if (!accred) return sendJSON(res, 403, { error: "Accréditation requise." });
    const { where, params: p } = buildObsWhere(accred);
    const periode = query.periode || "mensuel";
    const dateRef = periodo => {
      if (periodo === "mensuel") return "datetime('now','-1 month')";
      if (periodo === "trimestriel") return "datetime('now','-3 months')";
      return "datetime('now','-1 year')";
    };
    const dr = dateRef(periode);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE role='utilisateur' ${where}`).get(...p);
    const nouveaux = db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE role='utilisateur' AND u.created_at >= ${dr} ${where}`).get(...p);
    const initiatives = db.prepare(`SELECT COUNT(*) AS n FROM initiatives i WHERE 1=1 ${where.replace(/u\./g,"i.")}`).get(...p);
    const nouvInits = db.prepare(`SELECT COUNT(*) AS n FROM initiatives i WHERE i.created_at >= ${dr} ${where.replace(/u\./g,"i.")}`).get(...p);
    const consultations = db.prepare(`SELECT COUNT(*) AS n FROM consultations WHERE emetteur_id=? AND created_at >= ${dr}`).get(user.id).n;
    const reponses = db.prepare(`SELECT COUNT(*) AS n FROM consultation_reponses cr JOIN consultations c ON c.id=cr.consultation_id WHERE c.emetteur_id=? AND cr.created_at >= ${dr}`).get(user.id).n;
    sendJSON(res, 200, {
      periode,
      date_rapport: new Date().toISOString(),
      institution: { id: user.id, nom: user.nom },
      accreditation: {
        date_fin: accred.date_fin,
        nationalites: safeParse(accred.nationalites_autorisees),
        territoires: safeParse(accred.territoires_autorises),
      },
      membres: { total: total.n, nouveaux: nouveaux.n },
      initiatives: { total: initiatives.n, nouvelles: nouvInits.n },
      consultations: { lancees: consultations, reponses },
    });
  });

  /* ===========================
     COMMUNICATIONS INSTITUTIONNELLES
  =========================== */
  route("POST", "/api/communications", async (req, res, params, body) => {
    const user = getCurrentUser(req);
    if (!user || !["collectivite","administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé aux collectivités et administrateurs." });
    const { titre, contenu, type, cible, photos_json, video_b64, audio_b64 } = body;
    if (!titre || !contenu) return sendJSON(res, 400, { error: "titre et contenu requis." });
    // Valider médias
    const photos = Array.isArray(photos_json) ? photos_json.slice(0, 4) : [];
    for (const p of photos) {
      if (typeof p !== "string" || !p.startsWith("data:image/")) return sendJSON(res, 400, { error: "Format photo invalide." });
    }
    if (video_b64 && !video_b64.startsWith("data:video/")) return sendJSON(res, 400, { error: "Format vidéo invalide." });
    if (audio_b64 && !audio_b64.startsWith("data:audio/")) return sendJSON(res, 400, { error: "Format audio invalide." });
    // Compter les destinataires potentiels
    let nb = 0;
    try {
      const c = cible || {};
      let conds = [`role IN ('utilisateur','initiative')`];
      const p = [];
      if (c.pays?.length) { const ph = c.pays.map(()=>"?").join(","); conds.push(`pays IN (${ph})`); p.push(...c.pays); }
      if (c.villes?.length) { const ph = c.villes.map(()=>"?").join(","); conds.push(`ville IN (${ph})`); p.push(...c.villes); }
      if (c.nationalites?.length) { const ph = c.nationalites.map(()=>"?").join(","); conds.push(`(nationalite1 IN (${ph}) OR nationalite2 IN (${ph}))`); p.push(...c.nationalites,...c.nationalites); }
      nb = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE ${conds.join(" AND ")}`).get(...p).n;
    } catch(e) { nb = 0; }
    // Alter table si colonnes manquantes (migration SQLite)
    try {
      db.prepare("ALTER TABLE communications_institutionnelles ADD COLUMN photos_json TEXT DEFAULT '[]'").run();
      db.prepare("ALTER TABLE communications_institutionnelles ADD COLUMN video_b64 TEXT DEFAULT NULL").run();
      db.prepare("ALTER TABLE communications_institutionnelles ADD COLUMN audio_b64 TEXT DEFAULT NULL").run();
    } catch(e) {} // colonnes déjà présentes
    const id = db.prepare(
      "INSERT INTO communications_institutionnelles (emetteur_id,titre,contenu,type,cible_json,nb_destinataires,photos_json,video_b64,audio_b64) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(user.id, titre, contenu, type||"info", JSON.stringify(cible||{}), nb,
          JSON.stringify(photos), video_b64||null, audio_b64||null).lastInsertRowid;
    // Publication sur le fil (sans médias lourds)
    try {
      db.prepare("INSERT INTO fil_posts (auteur_id,auteur_nom,type,categorie,contenu) VALUES (?,?,?,?,?)")
        .run(user.id, user.nom, "institutionnel", type||"info", `**${titre}**\n\n${contenu}`);
    } catch(e) {}
    sendJSON(res, 201, { id, nb_destinataires: nb });
  });

  route("GET", "/api/communications", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || !["collectivite","administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const rows = db.prepare("SELECT id,emetteur_id,titre,contenu,type,cible_json,nb_destinataires,statut,photos_json,video_b64,audio_b64,created_at FROM communications_institutionnelles WHERE emetteur_id=? ORDER BY created_at DESC LIMIT 50").all(user.id);
    sendJSON(res, 200, { communications: rows.map(r => ({
      ...r,
      photos_json: (() => { try { return JSON.parse(r.photos_json||"[]"); } catch(e){ return []; } })()
    })) });
  });

  route("GET", "/api/communications/recues", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    // Toutes communications qui ne sont pas bloquées par l'utilisateur
    const desabo = db.prepare("SELECT institution_id FROM comm_desabonnements WHERE user_id=?").all(user.id).map(r=>r.institution_id);
    let rows = db.prepare("SELECT ci.*, u.nom AS emetteur_nom FROM communications_institutionnelles ci JOIN users u ON u.id=ci.emetteur_id ORDER BY ci.created_at DESC LIMIT 30").all();
    if (desabo.length) rows = rows.filter(r => !desabo.includes(null) && !desabo.includes(r.emetteur_id));
    sendJSON(res, 200, { communications: rows });
  });

  route("POST", "/api/communications/:id/desabonner", async (req, res, params) => {
    const user = getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const comm = db.prepare("SELECT emetteur_id FROM communications_institutionnelles WHERE id=?").get(params.id);
    if (!comm) return sendJSON(res, 404, { error: "Communication introuvable." });
    try {
      db.prepare("INSERT OR IGNORE INTO comm_desabonnements (user_id,institution_id) VALUES (?,?)").run(user.id, comm.emetteur_id);
    } catch(e) {}
    sendJSON(res, 200, { ok: true });
  });

  /* ===========================
     CONSULTATIONS ET SONDAGES
  =========================== */
  route("POST", "/api/consultations", async (req, res, params, body) => {
    const user = getCurrentUser(req);
    if (!user || !["collectivite","administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const { titre, description, type, date_cloture, cible, questions, statut } = body;
    if (!titre) return sendJSON(res, 400, { error: "titre requis." });
    const id = db.prepare("INSERT INTO consultations (emetteur_id,titre,description,type,statut,date_cloture,cible_json) VALUES (?,?,?,?,?,?,?)")
      .run(user.id, titre, description||null, type||"sondage", statut||"ouverte", date_cloture||null, JSON.stringify(cible||{})).lastInsertRowid;
    if (questions?.length) {
      const ins = db.prepare("INSERT INTO consultation_questions (consultation_id,texte,type,options_json,ordre) VALUES (?,?,?,?,?)");
      questions.forEach((q, i) => ins.run(id, q.texte, q.type||"texte_libre", JSON.stringify(q.options||[]), i));
    }
    sendJSON(res, 201, { id });
  });

  route("GET", "/api/consultations", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    let rows;
    if (["collectivite","administrateur"].includes(user.role)) {
      rows = db.prepare("SELECT c.*,(SELECT COUNT(*) FROM consultation_reponses WHERE consultation_id=c.id) AS nb_reponses FROM consultations c WHERE emetteur_id=? ORDER BY created_at DESC").all(user.id);
    } else {
      rows = db.prepare("SELECT c.*,u.nom AS emetteur_nom,(SELECT COUNT(*) FROM consultation_reponses WHERE consultation_id=c.id) AS nb_reponses FROM consultations c JOIN users u ON u.id=c.emetteur_id WHERE c.statut='ouverte' ORDER BY c.created_at DESC LIMIT 20").all();
    }
    sendJSON(res, 200, { consultations: rows });
  });

  route("GET", "/api/consultations/:id", async (req, res, params) => {
    const user = getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const c = db.prepare("SELECT c.*,u.nom AS emetteur_nom FROM consultations c JOIN users u ON u.id=c.emetteur_id WHERE c.id=?").get(params.id);
    if (!c) return sendJSON(res, 404, { error: "Consultation introuvable." });
    const questions = db.prepare("SELECT * FROM consultation_questions WHERE consultation_id=? ORDER BY ordre").all(params.id);
    const dejaRepondu = user ? !!db.prepare("SELECT 1 FROM consultation_reponses WHERE consultation_id=? AND user_id=?").get(params.id, user.id) : false;
    sendJSON(res, 200, { consultation: c, questions, deja_repondu: dejaRepondu });
  });

  route("POST", "/api/consultations/:id/repondre", async (req, res, params, body) => {
    const user = getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const c = db.prepare("SELECT * FROM consultations WHERE id=? AND statut='ouverte'").get(params.id);
    if (!c) return sendJSON(res, 404, { error: "Consultation fermée ou introuvable." });
    const already = db.prepare("SELECT 1 FROM consultation_reponses WHERE consultation_id=? AND user_id=?").get(params.id, user.id);
    if (already) return sendJSON(res, 409, { error: "Vous avez déjà répondu à cette consultation." });
    const ins = db.prepare("INSERT INTO consultation_reponses (consultation_id,question_id,user_id,reponse) VALUES (?,?,?,?)");
    (body.reponses || []).forEach(r => ins.run(params.id, r.question_id, user.id, r.reponse || ""));
    sendJSON(res, 200, { ok: true });
  });

  route("GET", "/api/consultations/:id/resultats", async (req, res, params) => {
    const user = getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const c = db.prepare("SELECT * FROM consultations WHERE id=?").get(params.id);
    if (!c) return sendJSON(res, 404, { error: "Consultation introuvable." });
    if (c.emetteur_id !== user.id && user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès réservé à l'émetteur." });
    const questions = db.prepare("SELECT * FROM consultation_questions WHERE consultation_id=? ORDER BY ordre").all(params.id);
    const nb_repondants = db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM consultation_reponses WHERE consultation_id=?").get(params.id).n;
    const resultats = questions.map(q => {
      const reps = db.prepare("SELECT reponse, COUNT(*) AS n FROM consultation_reponses WHERE question_id=? GROUP BY reponse ORDER BY n DESC").all(q.id);
      return { question: q, nb_reponses: reps.reduce((a,r)=>a+r.n,0), repartition: reps };
    });
    sendJSON(res, 200, { consultation: c, nb_repondants, resultats });
  });

  route("POST", "/api/consultations/:id/cloturer", async (req, res, params) => {
    const user = getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const c = db.prepare("SELECT * FROM consultations WHERE id=?").get(params.id);
    if (!c) return sendJSON(res, 404, { error: "Introuvable." });
    if (c.emetteur_id !== user.id && user.role !== "administrateur") return sendJSON(res, 403, { error: "Non autorisé." });
    db.prepare("UPDATE consultations SET statut='cloturee' WHERE id=?").run(params.id);
    sendJSON(res, 200, { ok: true });
  });

/* ============================================================
   MODULE AMBASSADE / COLLECTIVITÉ
   ============================================================ */

function requireCollectivite(req, res) {
  const user = getCurrentUser(req);
  if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
  if (user.role !== "collectivite") { sendJSON(res, 403, { error: "Réservé aux collectivités." }); return null; }
  return user;
}

/* ── Profil ambassade ── */
route("GET", "/api/collectivite/profil-ambassade", async (req, res) => {
  const user = requireCollectivite(req, res); if (!user) return;
  let profil = db.prepare("SELECT * FROM ambassade_profil WHERE user_id=?").get(user.id);
  if (!profil) profil = { user_id: user.id, nom_officiel: user.nom || "", pays_represente: user.pays || "" };
  sendJSON(res, 200, profil);
});

route("PUT", "/api/collectivite/profil-ambassade", async (req, res, params, body) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const j = v => { try { return JSON.stringify(Array.isArray(v) ? v : JSON.parse(v || "[]")); } catch { return "[]"; } };
  const exists = db.prepare("SELECT user_id FROM ambassade_profil WHERE user_id=?").get(user.id);
  const data = {
    nom_officiel: body.nom_officiel || null,
    pays_represente: body.pays_represente || null,
    ambassadeur: body.ambassadeur || null,
    adresse: body.adresse || null,
    telephone: body.telephone || null,
    email_officiel: body.email_officiel || null,
    site_web: body.site_web || null,
    horaires: body.horaires || null,
    zone_pays: j(body.zone_pays),
    zone_regions: j(body.zone_regions),
    zone_villes: j(body.zone_villes),
    consulats: j(body.consulats),
    logo_url: body.logo_url || null,
    photo_couverture: body.photo_couverture || null,
    description: body.description || null,
  };
  if (exists) {
    db.prepare(`UPDATE ambassade_profil SET nom_officiel=?,pays_represente=?,ambassadeur=?,adresse=?,telephone=?,email_officiel=?,site_web=?,horaires=?,zone_pays=?,zone_regions=?,zone_villes=?,consulats=?,logo_url=?,photo_couverture=?,description=?,updated_at=datetime('now') WHERE user_id=?`).run(...Object.values(data), user.id);
  } else {
    db.prepare(`INSERT INTO ambassade_profil(nom_officiel,pays_represente,ambassadeur,adresse,telephone,email_officiel,site_web,horaires,zone_pays,zone_regions,zone_villes,consulats,logo_url,photo_couverture,description,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(data), user.id);
  }
  sendJSON(res, 200, { ok: true });
});

/* ── Stats diaspora (agrégées, selon pays_represente) ── */
route("GET", "/api/collectivite/stats-diaspora", async (req, res) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const profil = db.prepare("SELECT * FROM ambassade_profil WHERE user_id=?").get(user.id);
  const pays = profil?.pays_represente || user.pays;
  const SEUIL = 10;
  const mask = n => n >= SEUIL ? n : null;
  const ressortissants = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='utilisateur' AND (nationalite1=? OR nationalite2=?)").get(pays, pays).n;
  const parVille = db.prepare("SELECT ville, COUNT(*) AS n FROM users WHERE role='utilisateur' AND ville IS NOT NULL AND (nationalite1=? OR nationalite2=?) GROUP BY ville ORDER BY n DESC LIMIT 20").all(pays, pays).map(r=>({...r, n: mask(r.n)})).filter(r=>r.n);
  const parRegion = db.prepare("SELECT pays AS region, COUNT(*) AS n FROM users WHERE role='utilisateur' AND (nationalite1=? OR nationalite2=?) AND pays IS NOT NULL GROUP BY pays ORDER BY n DESC LIMIT 15").all(pays, pays).map(r=>({...r, n: mask(r.n)})).filter(r=>r.n);
  const initiatives = db.prepare("SELECT COUNT(*) AS n FROM initiatives WHERE nationalite1=? OR nationalite2=?").get(pays, pays).n;
  const associations = db.prepare("SELECT COUNT(*) AS n FROM initiatives WHERE (nationalite1=? OR nationalite2=?) AND domaine='associatif'").get(pays, pays).n;
  const entreprises = db.prepare("SELECT COUNT(*) AS n FROM initiatives WHERE (nationalite1=? OR nationalite2=?) AND domaine IN ('commerce','finance','tech','industrie')").get(pays, pays).n;
  const experts = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='utilisateur' AND (nationalite1=? OR nationalite2=?) AND titre_pro IS NOT NULL").get(pays, pays).n;
  sendJSON(res, 200, {
    pays, seuil: SEUIL,
    ressortissants: mask(ressortissants),
    initiatives: mask(initiatives),
    associations: mask(associations),
    entreprises: mask(entreprises),
    experts: mask(experts),
    par_ville: parVille,
    par_region: parRegion,
  });
});

/* ── Espace Diaspora (initiatives filtrées) ── */
route("GET", "/api/collectivite/diaspora-membres", async (req, res, params, body, query) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const profil = db.prepare("SELECT * FROM ambassade_profil WHERE user_id=?").get(user.id);
  const pays = profil?.pays_represente || user.pays;
  const { ville, secteur, type } = query;
  let where = "(nationalite1=? OR nationalite2=?)"; const p = [pays, pays];
  if (ville) { where += " AND ville=?"; p.push(ville); }
  if (secteur) { where += " AND domaine=?"; p.push(secteur); }
  const rows = db.prepare(`SELECT id,nom,domaine,ville,pays,logo_url,site_web,membres,abonnes,type_structure,nb_vues FROM initiatives WHERE ${where} ORDER BY membres DESC LIMIT 50`).all(...p);
  sendJSON(res, 200, { initiatives: rows, pays });
});

/* ── Services consulaires ── */
route("GET", "/api/collectivite/services", async (req, res) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const rows = db.prepare("SELECT * FROM ambassade_services WHERE user_id=? ORDER BY ordre,created_at").all(user.id);
  sendJSON(res, 200, { services: rows });
});

route("POST", "/api/collectivite/services", async (req, res, params, body) => {
  const user = requireCollectivite(req, res); if (!user) return;
  if (!body.nom) return sendJSON(res, 400, { error: "Nom requis." });
  const j = v => { try { return JSON.stringify(Array.isArray(v) ? v : JSON.parse(v || "[]")); } catch { return "[]"; } };
  const r = db.prepare("INSERT INTO ambassade_services(user_id,nom,type,icone,description,conditions,documents_requis,delai,tarif,procedure,ordre) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(user.id, body.nom, body.type||"document", body.icone||"📄", body.description||null, body.conditions||null, j(body.documents_requis), body.delai||null, body.tarif||null, body.procedure||null, body.ordre||0);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

route("PUT", "/api/collectivite/services/:id", async (req, res, params, body) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const j = v => { try { return JSON.stringify(Array.isArray(v) ? v : JSON.parse(v || "[]")); } catch { return "[]"; } };
  db.prepare("UPDATE ambassade_services SET nom=?,type=?,icone=?,description=?,conditions=?,documents_requis=?,delai=?,tarif=?,procedure=?,actif=?,ordre=? WHERE id=? AND user_id=?").run(body.nom, body.type||"document", body.icone||"📄", body.description||null, body.conditions||null, j(body.documents_requis), body.delai||null, body.tarif||null, body.procedure||null, body.actif??1, body.ordre||0, params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/collectivite/services/:id", async (req, res, params) => {
  const user = requireCollectivite(req, res); if (!user) return;
  db.prepare("DELETE FROM ambassade_services WHERE id=? AND user_id=?").run(params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

/* ── Agenda ── */
route("GET", "/api/collectivite/agenda", async (req, res) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const rows = db.prepare("SELECT * FROM ambassade_agenda WHERE user_id=? ORDER BY date_debut DESC").all(user.id);
  sendJSON(res, 200, { agenda: rows });
});

route("POST", "/api/collectivite/agenda", async (req, res, params, body) => {
  const user = requireCollectivite(req, res); if (!user) return;
  if (!body.titre || !body.date_debut) return sendJSON(res, 400, { error: "Titre et date requis." });
  const r = db.prepare("INSERT INTO ambassade_agenda(user_id,titre,type,description,date_debut,date_fin,lieu,lien,public) VALUES(?,?,?,?,?,?,?,?,?)").run(user.id, body.titre, body.type||"evenement", body.description||null, body.date_debut, body.date_fin||null, body.lieu||null, body.lien||null, body.public??1);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

route("PUT", "/api/collectivite/agenda/:id", async (req, res, params, body) => {
  const user = requireCollectivite(req, res); if (!user) return;
  db.prepare("UPDATE ambassade_agenda SET titre=?,type=?,description=?,date_debut=?,date_fin=?,lieu=?,lien=?,public=? WHERE id=? AND user_id=?").run(body.titre, body.type||"evenement", body.description||null, body.date_debut, body.date_fin||null, body.lieu||null, body.lien||null, body.public??1, params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/collectivite/agenda/:id", async (req, res, params) => {
  const user = requireCollectivite(req, res); if (!user) return;
  db.prepare("DELETE FROM ambassade_agenda WHERE id=? AND user_id=?").run(params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

/* ── Partenariats institutionnels ── */
route("GET", "/api/collectivite/partenariats-inst", async (req, res) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const rows = db.prepare("SELECT * FROM ambassade_partenariats WHERE user_id=? ORDER BY created_at DESC").all(user.id);
  sendJSON(res, 200, { partenariats: rows });
});

route("POST", "/api/collectivite/partenariats-inst", async (req, res, params, body) => {
  const user = requireCollectivite(req, res); if (!user) return;
  if (!body.nom) return sendJSON(res, 400, { error: "Nom requis." });
  const r = db.prepare("INSERT INTO ambassade_partenariats(user_id,nom,type,description,logo_url,site_web) VALUES(?,?,?,?,?,?)").run(user.id, body.nom, body.type||"institutionnel", body.description||null, body.logo_url||null, body.site_web||null);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

route("PUT", "/api/collectivite/partenariats-inst/:id", async (req, res, params, body) => {
  const user = requireCollectivite(req, res); if (!user) return;
  db.prepare("UPDATE ambassade_partenariats SET nom=?,type=?,description=?,logo_url=?,site_web=? WHERE id=? AND user_id=?").run(body.nom, body.type||"institutionnel", body.description||null, body.logo_url||null, body.site_web||null, params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/collectivite/partenariats-inst/:id", async (req, res, params) => {
  const user = requireCollectivite(req, res); if (!user) return;
  db.prepare("DELETE FROM ambassade_partenariats WHERE id=? AND user_id=?").run(params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

/* ── Opportunités ── */
route("GET", "/api/collectivite/opportunites", async (req, res) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const rows = db.prepare("SELECT * FROM ambassade_opportunites WHERE user_id=? ORDER BY created_at DESC").all(user.id);
  sendJSON(res, 200, { opportunites: rows });
});

route("POST", "/api/collectivite/opportunites", async (req, res, params, body) => {
  const user = requireCollectivite(req, res); if (!user) return;
  if (!body.titre) return sendJSON(res, 400, { error: "Titre requis." });
  const r = db.prepare("INSERT INTO ambassade_opportunites(user_id,titre,type,description,date_limite,lien,budget) VALUES(?,?,?,?,?,?,?)").run(user.id, body.titre, body.type||"appel_offres", body.description||null, body.date_limite||null, body.lien||null, body.budget||null);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

route("PUT", "/api/collectivite/opportunites/:id", async (req, res, params, body) => {
  const user = requireCollectivite(req, res); if (!user) return;
  db.prepare("UPDATE ambassade_opportunites SET titre=?,type=?,description=?,date_limite=?,lien=?,budget=?,actif=? WHERE id=? AND user_id=?").run(body.titre, body.type||"appel_offres", body.description||null, body.date_limite||null, body.lien||null, body.budget||null, body.actif??1, params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/collectivite/opportunites/:id", async (req, res, params) => {
  const user = requireCollectivite(req, res); if (!user) return;
  db.prepare("DELETE FROM ambassade_opportunites WHERE id=? AND user_id=?").run(params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

/* ================================================================
   SYSTÈME D'ACCRÉDITATIONS DIASPO'ACTIF
   ================================================================ */

/* Helper : vérifie qu'un user a une accréditation active */
function hasAccred(userId, type) {
  const r = db.prepare("SELECT id FROM compte_accreditations WHERE user_id=? AND type=? AND statut='active'").get(userId, type);
  return !!r;
}

/* GET /api/accreditations/mes — mes accréditations */
route("GET", "/api/accreditations/mes", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = db.prepare("SELECT * FROM compte_accreditations WHERE user_id=? ORDER BY created_at DESC").all(user.id);
  sendJSON(res, 200, { accreditations: rows });
});

/* GET /api/accreditations/demandes — mes propres demandes */
route("GET", "/api/accreditations/demandes", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = db.prepare("SELECT * FROM demandes_accreditation WHERE user_id=? ORDER BY created_at DESC").all(user.id);
  sendJSON(res, 200, { demandes: rows });
});

/* GET /api/accreditations/user/:id — accréditations publiques d'un compte */
route("GET", "/api/accreditations/user/:id", async (req, res, params) => {
  const rows = db.prepare("SELECT type, statut, date_attribution FROM compte_accreditations WHERE user_id=? AND statut='active'").all(params.id);
  sendJSON(res, 200, { accreditations: rows });
});

/* POST /api/accreditations/demande — demander une accréditation */
route("POST", "/api/accreditations/demande", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const { type, message } = body;
  const TYPES_ACCRED_VALIDES = ["mobilisation_active","createur_opportunites","observatoire_diaspora","institutionnelle","creation_publicite"];
  if (!TYPES_ACCRED_VALIDES.includes(type)) return sendJSON(res, 400, { error: "Type invalide." });
  const existing = db.prepare("SELECT id,statut FROM demandes_accreditation WHERE user_id=? AND type=? ORDER BY created_at DESC LIMIT 1").get(user.id, type);
  if (existing && existing.statut === "en_attente") return sendJSON(res, 409, { error: "Une demande est déjà en cours pour ce type." });
  if (hasAccred(user.id, type)) return sendJSON(res, 409, { error: "Vous possédez déjà cette accréditation." });
  const id = db.prepare("INSERT INTO demandes_accreditation (user_id, type, message) VALUES (?,?,?)").run(user.id, type, message||null).lastInsertRowid;
  const DA_LABELS = { mobilisation_active:"Mobilisation Active", createur_opportunites:"Créateur d'Opportunités", observatoire_diaspora:"Observatoire Diaspora", institutionnelle:"Institutionnelle" };
  const admins = db.prepare("SELECT id FROM users WHERE role='administrateur'").all();
  admins.forEach(a => creerNotif(a.id, "validation", "Nouvelle demande d'accréditation", `${user.nom} demande l'accréditation « ${DA_LABELS[type]||type} »`, { demande_id: Number(id) }));
  sendJSON(res, 201, { id, ok: true });
});

/* ──── Routes Admin : gestion des accréditations ──── */

/* GET /api/admin/accreditations/demandes — liste des demandes */
route("GET", "/api/admin/accreditations/demandes", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const statut = query.statut || "en_attente";
  const rows = db.prepare(`
    SELECT d.*, u.nom AS user_nom, u.email AS user_email, u.role AS user_role, u.ville AS user_ville
    FROM demandes_accreditation d JOIN users u ON u.id=d.user_id
    WHERE d.statut=? ORDER BY d.created_at DESC
  `).all(statut);
  sendJSON(res, 200, { demandes: rows });
});

/* GET /api/admin/accreditations — liste de tous les comptes accrédités */
route("GET", "/api/admin/accreditations", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const rows = db.prepare(`
    SELECT ca.*, u.nom AS user_nom, u.email AS user_email, u.role AS user_role
    FROM compte_accreditations ca JOIN users u ON u.id=ca.user_id
    ORDER BY ca.updated_at DESC
  `).all();
  sendJSON(res, 200, { accreditations: rows });
});

/* PATCH /api/admin/accreditations/:userId/:type/accorder */
route("PATCH", "/api/admin/accreditations/:userId/:type/accorder", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { userId, type } = params;
  const TYPES_DA = ["mobilisation_active","createur_opportunites","observatoire_diaspora","institutionnelle","creation_publicite"];
  if (!TYPES_DA.includes(type)) return sendJSON(res, 400, { error: "Type invalide." });
  db.prepare(`INSERT INTO compte_accreditations (user_id,type,statut,admin_id,frais_acces,notes,date_expiration)
    VALUES (?,?,'active',?,?,?,?)
    ON CONFLICT(user_id,type) DO UPDATE SET statut='active',admin_id=?,frais_acces=?,notes=?,date_expiration=?,updated_at=datetime('now')`
  ).run(userId, type, admin.id, body.frais_acces||0, body.notes||null, body.date_expiration||null,
        admin.id, body.frais_acces||0, body.notes||null, body.date_expiration||null);
  // Mettre à jour la demande si elle existe
  db.prepare("UPDATE demandes_accreditation SET statut='approuvee' WHERE user_id=? AND type=? AND statut='en_attente'").run(userId, type);
  db.prepare("INSERT INTO accreditations_da_historique (user_id,type,action,admin_id,admin_nom,motif,frais_acces) VALUES (?,?,?,?,?,?,?)").run(userId, type, "accorde", admin.id, admin.nom, body.motif||null, body.frais_acces||0);
  const DA_LBL = { mobilisation_active:"Mobilisation Active 📢", createur_opportunites:"Créateur d'Opportunités 💼", observatoire_diaspora:"Observatoire Diaspora 📊", institutionnelle:"Institutionnelle 🏛️", creation_publicite:"Création de Publicité 📣" };
  const label = DA_LBL[type] || type;
  creerNotif(Number(userId), "validation", "Accréditation accordée !", `Félicitations ! Votre accréditation « ${label} » vient d'être validée par l'équipe Diaspo'Actif.`, { type });
  sendJSON(res, 200, { ok: true });
});

/* PATCH /api/admin/accreditations/:userId/:type/refuser */
route("PATCH", "/api/admin/accreditations/:userId/:type/refuser", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { userId, type } = params;
  db.prepare("UPDATE demandes_accreditation SET statut='refusee', motif_refus=? WHERE user_id=? AND type=? AND statut='en_attente'").run(body.motif||null, userId, type);
  db.prepare("INSERT INTO accreditations_da_historique (user_id,type,action,admin_id,admin_nom,motif) VALUES (?,?,?,?,?,?)").run(userId, type, "refuse", admin.id, admin.nom, body.motif||null);
  creerNotif(Number(userId), "validation", "Demande d'accréditation non retenue", `Votre demande d'accréditation n'a pas été retenue${body.motif?` : ${body.motif}`:". Contactez-nous pour plus d'informations."}.`, { type });
  sendJSON(res, 200, { ok: true });
});

/* PATCH /api/admin/accreditations/:userId/:type/suspendre */
route("PATCH", "/api/admin/accreditations/:userId/:type/suspendre", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { userId, type } = params;
  db.prepare("UPDATE compte_accreditations SET statut='suspendue', updated_at=datetime('now') WHERE user_id=? AND type=?").run(userId, type);
  db.prepare("INSERT INTO accreditations_da_historique (user_id,type,action,admin_id,admin_nom,motif) VALUES (?,?,?,?,?,?)").run(userId, type, "suspendu", admin.id, admin.nom, body.motif||null);
  creerNotif(Number(userId), "validation", "Accréditation suspendue", `Votre accréditation a été suspendue temporairement${body.motif?` : ${body.motif}`:"."}.`, { type });
  sendJSON(res, 200, { ok: true });
});

/* PATCH /api/admin/accreditations/:userId/:type/retirer */
route("PATCH", "/api/admin/accreditations/:userId/:type/retirer", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { userId, type } = params;
  db.prepare("UPDATE compte_accreditations SET statut='retiree', updated_at=datetime('now') WHERE user_id=? AND type=?").run(userId, type);
  db.prepare("INSERT INTO accreditations_da_historique (user_id,type,action,admin_id,admin_nom,motif) VALUES (?,?,?,?,?,?)").run(userId, type, "retire", admin.id, admin.nom, body.motif||null);
  creerNotif(Number(userId), "validation", "Accréditation retirée", `Votre accréditation a été définitivement retirée${body.motif?` : ${body.motif}`:"."}.`, { type });
  sendJSON(res, 200, { ok: true });
});

/* PATCH /api/admin/accreditations/:userId/:type/reactiver */
route("PATCH", "/api/admin/accreditations/:userId/:type/reactiver", async (req, res, params) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { userId, type } = params;
  db.prepare("UPDATE compte_accreditations SET statut='active', updated_at=datetime('now') WHERE user_id=? AND type=?").run(userId, type);
  db.prepare("INSERT INTO accreditations_da_historique (user_id,type,action,admin_id,admin_nom) VALUES (?,?,?,?,?)").run(userId, type, "reactiver", admin.id, admin.nom);
  creerNotif(Number(userId), "validation", "Accréditation réactivée", "Votre accréditation a été réactivée.", { type });
  sendJSON(res, 200, { ok: true });
});

/* ──── MODULE MOBILISATION ACTIVE — Sondages & Consultations ──── */

/* GET /api/sondages */
route("GET", "/api/sondages", async (req, res, params, body, query) => {
  let rows = db.prepare(`
    SELECT s.*, u.nom AS createur_nom, u.role AS createur_role
    FROM sondages s JOIN users u ON u.id=s.createur_id
    WHERE s.statut IN ('ouvert','cloture')
    ORDER BY s.created_at DESC
  `).all();
  if (query.type) rows = rows.filter(r => r.type === query.type);
  if (query.statut) rows = rows.filter(r => r.statut === query.statut);
  if (query.q) { const q = query.q.toLowerCase(); rows = rows.filter(r => (r.titre+r.description||"").toLowerCase().includes(q)); }
  rows = rows.map(r => ({ ...r, cible_roles: safeParse(r.cible_roles), cible_pays: safeParse(r.cible_pays) }));
  sendJSON(res, 200, { sondages: rows });
});

/* POST /api/sondages */
route("POST", "/api/sondages", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!hasAccred(user.id, "mobilisation_active")) return sendJSON(res, 403, { error: "Accréditation « Mobilisation Active » requise." });
  const { titre, description, type, sous_type, anonyme, cible_roles, cible_pays, date_cloture, questions } = body;
  if (!titre) return sendJSON(res, 400, { error: "Titre requis." });
  if (!questions || !questions.length) return sendJSON(res, 400, { error: "Au moins une question requise." });
  const id = db.prepare(`INSERT INTO sondages (createur_id,titre,description,type,sous_type,statut,anonyme,cible_roles,cible_pays,date_cloture)
    VALUES (?,?,?,?,?,'ouvert',?,?,?,?)`).run(
    user.id, titre, description||null, type||"sondage", sous_type||null, anonyme?1:0,
    JSON.stringify(Array.isArray(cible_roles)?cible_roles:[]),
    JSON.stringify(Array.isArray(cible_pays)?cible_pays:[]),
    date_cloture||null
  ).lastInsertRowid;
  questions.forEach((q, i) => {
    db.prepare("INSERT INTO sondage_questions (sondage_id,texte,type,options_json,obligatoire,ordre) VALUES (?,?,?,?,?,?)").run(
      id, q.texte, q.type||"choix_unique",
      JSON.stringify(Array.isArray(q.options)?q.options:[]),
      q.obligatoire!==false?1:0, i
    );
  });
  sendJSON(res, 201, { id });
});

/* GET /api/sondages/:id */
route("GET", "/api/sondages/:id", async (req, res, params) => {
  const s = db.prepare("SELECT s.*,u.nom AS createur_nom,u.role AS createur_role FROM sondages s JOIN users u ON u.id=s.createur_id WHERE s.id=?").get(params.id);
  if (!s) return sendJSON(res, 404, { error: "Sondage introuvable." });
  const questions = db.prepare("SELECT * FROM sondage_questions WHERE sondage_id=? ORDER BY ordre ASC").all(params.id);
  const me = getCurrentUser(req);
  const dejaRepondu = me ? !!db.prepare("SELECT 1 FROM sondage_reponses WHERE sondage_id=? AND user_id=?").get(params.id, me.id) : false;
  sendJSON(res, 200, {
    sondage: { ...s, cible_roles: safeParse(s.cible_roles), cible_pays: safeParse(s.cible_pays) },
    questions: questions.map(q => ({ ...q, options: safeParse(q.options_json) })),
    dejaRepondu
  });
});

/* POST /api/sondages/:id/repondre */
route("POST", "/api/sondages/:id/repondre", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const s = db.prepare("SELECT * FROM sondages WHERE id=?").get(params.id);
  if (!s) return sendJSON(res, 404, { error: "Sondage introuvable." });
  if (s.statut !== "ouvert") return sendJSON(res, 400, { error: "Ce sondage est clôturé." });
  const deja = db.prepare("SELECT 1 FROM sondage_reponses WHERE sondage_id=? AND user_id=?").get(params.id, user.id);
  if (deja) return sendJSON(res, 409, { error: "Vous avez déjà répondu à ce sondage." });
  const reponses = body.reponses || {}; // { question_id: reponse }
  const questions = db.prepare("SELECT * FROM sondage_questions WHERE sondage_id=?").all(params.id);
  for (const q of questions) {
    const rep = reponses[q.id];
    if (q.obligatoire && (rep === undefined || rep === null || rep === "")) return sendJSON(res, 400, { error: `Question obligatoire sans réponse : "${q.texte}"` });
    db.prepare("INSERT INTO sondage_reponses (sondage_id,question_id,user_id,reponse) VALUES (?,?,?,?)").run(
      params.id, q.id, s.anonyme ? null : user.id,
      rep !== undefined ? (typeof rep === "object" ? JSON.stringify(rep) : String(rep)) : null
    );
  }
  db.prepare("UPDATE sondages SET nb_reponses=nb_reponses+1 WHERE id=?").run(params.id);
  creerNotif(s.createur_id, "mention", "Nouvelle réponse à votre sondage", `${user.nom} a répondu à « ${s.titre} »`, { sondage_id: Number(params.id) });
  sendJSON(res, 201, { ok: true });
});

/* GET /api/sondages/:id/resultats — créateur uniquement */
route("GET", "/api/sondages/:id/resultats", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const s = db.prepare("SELECT * FROM sondages WHERE id=?").get(params.id);
  if (!s) return sendJSON(res, 404, { error: "Sondage introuvable." });
  if (s.createur_id !== user.id && user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé au créateur." });
  const questions = db.prepare("SELECT * FROM sondage_questions WHERE sondage_id=? ORDER BY ordre").all(params.id);
  const resultats = questions.map(q => {
    const reps = db.prepare("SELECT reponse, COUNT(*) AS n FROM sondage_reponses WHERE question_id=? GROUP BY reponse").all(q.id);
    return { question: q.texte, type: q.type, options: safeParse(q.options_json), reponses: reps };
  });
  // Stats géographiques des répondants
  const repartition_pays = db.prepare(
    "SELECT u.pays, COUNT(DISTINCT sr.user_id) AS n FROM sondage_reponses sr JOIN users u ON u.id=sr.user_id WHERE sr.sondage_id=? AND u.pays IS NOT NULL GROUP BY u.pays ORDER BY n DESC LIMIT 10"
  ).all(params.id);
  const nb_repondants = db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM sondage_reponses WHERE sondage_id=?").get(params.id).n;
  const taux_participation = s.cible_roles
    ? (() => {
        const cibles = safeParse(s.cible_roles);
        const total = Array.isArray(cibles) && cibles.length
          ? db.prepare("SELECT COUNT(*) AS n FROM users WHERE role IN (" + cibles.map(()=>"?").join(",") + ")").get(...cibles).n
          : db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
        return total > 0 ? Math.round((nb_repondants / total) * 100) : 0;
      })()
    : 0;
  sendJSON(res, 200, { sondage: s, resultats, nb_reponses: s.nb_reponses, nb_repondants, taux_participation, repartition_pays });
});

/* PATCH /api/sondages/:id/cloturer */
route("PATCH", "/api/sondages/:id/cloturer", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const s = db.prepare("SELECT * FROM sondages WHERE id=?").get(params.id);
  if (!s || s.createur_id !== user.id) return sendJSON(res, 403, { error: "Non autorisé." });
  db.prepare("UPDATE sondages SET statut='cloture' WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/mes-sondages */
route("GET", "/api/mes-sondages", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = db.prepare("SELECT * FROM sondages WHERE createur_id=? ORDER BY created_at DESC").all(user.id);
  sendJSON(res, 200, { sondages: rows });
});

/* ──── MODULE CRÉATEUR D'OPPORTUNITÉS — Offres ──── */

/* GET /api/offres */
route("GET", "/api/offres", async (req, res, params, body, query) => {
  let rows = db.prepare(`
    SELECT o.*, u.nom AS createur_nom, u.role AS createur_role
    FROM offres o JOIN users u ON u.id=o.createur_id
    WHERE o.statut='publiee'
    ORDER BY o.created_at DESC
  `).all();
  if (query.type) rows = rows.filter(r => r.type === query.type);
  if (query.pays) rows = rows.filter(r => r.pays === query.pays);
  if (query.q) { const q = query.q.toLowerCase(); rows = rows.filter(r => (r.titre+(r.description||"")).toLowerCase().includes(q)); }
  rows = rows.map(r => ({ ...r, competences_requises: safeParse(r.competences_requises) }));
  sendJSON(res, 200, { offres: rows });
});

/* POST /api/offres */
route("POST", "/api/offres", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!hasAccred(user.id, "createur_opportunites")) return sendJSON(res, 403, { error: "Accréditation « Créateur d'Opportunités » requise." });
  const { titre, type, description, competences_requises, localisation, pays, remuneration, date_limite, nb_postes } = body;
  if (!titre) return sendJSON(res, 400, { error: "Titre requis." });
  const id = db.prepare(`INSERT INTO offres (createur_id,titre,type,description,competences_requises,localisation,pays,remuneration,date_limite,nb_postes)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    user.id, titre, type||"emploi", description||null,
    JSON.stringify(Array.isArray(competences_requises)?competences_requises:[]),
    localisation||null, pays||null, remuneration||null, date_limite||null, nb_postes||1
  ).lastInsertRowid;
  sendJSON(res, 201, { id });
});

/* GET /api/offres/:id */
route("GET", "/api/offres/:id", async (req, res, params) => {
  const o = db.prepare("SELECT o.*,u.nom AS createur_nom,u.role AS createur_role FROM offres o JOIN users u ON u.id=o.createur_id WHERE o.id=?").get(params.id);
  if (!o) return sendJSON(res, 404, { error: "Offre introuvable." });
  const me = getCurrentUser(req);
  const dejaPostule = me ? !!db.prepare("SELECT 1 FROM offres_candidatures WHERE offre_id=? AND candidat_id=?").get(params.id, me.id) : false;
  sendJSON(res, 200, { offre: { ...o, competences_requises: safeParse(o.competences_requises) }, dejaPostule });
});

/* POST /api/offres/:id/postuler */
route("POST", "/api/offres/:id/postuler", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const o = db.prepare("SELECT * FROM offres WHERE id=?").get(params.id);
  if (!o) return sendJSON(res, 404, { error: "Offre introuvable." });
  if (o.statut !== "publiee") return sendJSON(res, 400, { error: "Cette offre n'est plus disponible." });
  if (o.createur_id === user.id) return sendJSON(res, 400, { error: "Vous ne pouvez pas postuler à votre propre offre." });
  try {
    db.prepare("INSERT INTO offres_candidatures (offre_id,candidat_id,message,cv_url,lettre_url) VALUES (?,?,?,?,?)").run(
      params.id, user.id, body.message||null, body.cv_url||null, body.lettre_url||null
    );
    db.prepare("UPDATE offres SET nb_candidatures=nb_candidatures+1 WHERE id=?").run(params.id);
    creerNotif(o.createur_id, "mention", "Nouvelle candidature", `${user.nom} a postulé à « ${o.titre} »`, { offre_id: Number(params.id) });
    sendJSON(res, 201, { ok: true });
  } catch(e) {
    sendJSON(res, 409, { error: "Vous avez déjà postulé à cette offre." });
  }
});

/* GET /api/offres/:id/candidatures — créateur uniquement */
route("GET", "/api/offres/:id/candidatures", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const o = db.prepare("SELECT * FROM offres WHERE id=?").get(params.id);
  if (!o || o.createur_id !== user.id) return sendJSON(res, 403, { error: "Réservé au créateur." });
  const cands = db.prepare(`
    SELECT oc.*, u.nom AS candidat_nom, u.email AS candidat_email, u.ville AS candidat_ville, u.pays AS candidat_pays
    FROM offres_candidatures oc JOIN users u ON u.id=oc.candidat_id
    WHERE oc.offre_id=? ORDER BY oc.created_at DESC
  `).all(params.id);
  sendJSON(res, 200, { candidatures: cands, offre: o });
});

/* PATCH /api/offres/:id/candidatures/:cid */
route("PATCH", "/api/offres/:id/candidatures/:cid", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const o = db.prepare("SELECT * FROM offres WHERE id=?").get(params.id);
  if (!o || o.createur_id !== user.id) return sendJSON(res, 403, { error: "Non autorisé." });
  const valid = ["recu","en_etude","entretien","accepte","refuse"];
  if (!valid.includes(body.statut)) return sendJSON(res, 400, { error: "Statut invalide." });
  db.prepare("UPDATE offres_candidatures SET statut=? WHERE id=? AND offre_id=?").run(body.statut, params.cid, params.id);
  const cand = db.prepare("SELECT candidat_id FROM offres_candidatures WHERE id=?").get(params.cid);
  if (cand) {
    const labels = { en_etude:"en cours d'étude", entretien:"retenue pour entretien", accepte:"acceptée ✅", refuse:"non retenue" };
    creerNotif(cand.candidat_id, "validation", "Mise à jour de votre candidature", `Votre candidature pour « ${o.titre} » est ${labels[body.statut]||body.statut}.`, { offre_id: Number(params.id) });
  }
  sendJSON(res, 200, { ok: true });
});

/* GET /api/mes-offres */
route("GET", "/api/mes-offres", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = db.prepare("SELECT * FROM offres WHERE createur_id=? ORDER BY created_at DESC").all(user.id);
  sendJSON(res, 200, { offres: rows.map(r => ({ ...r, competences_requises: safeParse(r.competences_requises) })) });
});

/* GET /api/mes-candidatures-offres — mes candidatures aux offres */
route("GET", "/api/mes-candidatures-offres", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = db.prepare(`
    SELECT oc.*, o.titre AS offre_titre, o.type AS offre_type, u.nom AS createur_nom
    FROM offres_candidatures oc
    JOIN offres o ON o.id=oc.offre_id
    JOIN users u ON u.id=o.createur_id
    WHERE oc.candidat_id=? ORDER BY oc.created_at DESC
  `).all(user.id);
  sendJSON(res, 200, { candidatures: rows });
});

/* ================================================================= */

const _trackStmt = db.prepare(
  "INSERT OR IGNORE INTO user_activity (user_id, date) VALUES (?, date('now'))"
);
function trackActivity(req) {
  try { const u = getCurrentUser(req); if (u) _trackStmt.run(u.id); } catch {}
}

/* ── Géographie mondiale — proxy CountriesNow API ── */
const _geoCache = {};
async function geoFetch(path, body = null) {
  const key = path + (body || "");
  if (_geoCache[key]) return _geoCache[key];
  const opts = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body }
    : { method: "GET" };
  const r = await fetch("https://countriesnow.space/api/v0.1/" + path, opts);
  const d = await r.json();
  if (!d.error) _geoCache[key] = d;
  return d;
}

const _restCountriesCache = {};
route("GET", "/api/geo/countries", async (req, res, params, body, query) => {
  const lang = (query.lang || "fr").slice(0, 5).toLowerCase();
  const cacheKey = "countries_" + lang;
  if (!_restCountriesCache[cacheKey]) {
    try {
      const r = await fetch("https://restcountries.com/v3.1/all?fields=name,translations");
      const data = await r.json();
      const countries = [];
      const map = {};
      const LANG_CODE = { fr: "fra", es: "spa", pt: "por", de: "deu", ar: "ara", zh: "zho" };
      const code = LANG_CODE[lang] || null;
      for (const c of data) {
        const enName = c.name?.common || "";
        const localName = (code && c.translations?.[code]?.common) || enName;
        if (localName) { countries.push(localName); map[localName] = enName; }
      }
      countries.sort((a, b) => a.localeCompare(b, lang));
      _restCountriesCache[cacheKey] = { countries, map };
    } catch (e) {
      const d = await geoFetch("countries");
      const countries = (d.data || []).map(c => c.country).sort((a, b) => a.localeCompare(b));
      _restCountriesCache[cacheKey] = { countries, map: {} };
    }
  }
  sendJSON(res, 200, _restCountriesCache[cacheKey]);
});

function _toEnCountry(localName, lang) {
  const code = "countries_" + (lang || "fr");
  const map = (_restCountriesCache[code] || {}).map || {};
  return map[localName] || localName;
}

route("GET", "/api/geo/states", async (req, res, params, body, query) => {
  const lang    = (query.lang || "fr").slice(0, 5).toLowerCase();
  const country = _toEnCountry((query.country || "").trim(), lang);
  if (!country) return sendJSON(res, 400, { error: "Paramètre country requis." });
  try {
    const d = await geoFetch("countries/states", JSON.stringify({ country }));
    const states = ((d.data || {}).states || []).map(s => s.name).sort((a, b) => a.localeCompare(b, lang));
    sendJSON(res, 200, { states });
  } catch (e) {
    sendJSON(res, 502, { error: "Service géographique indisponible." });
  }
});

route("GET", "/api/geo/cities", async (req, res, params, body, query) => {
  const lang    = (query.lang || "fr").slice(0, 5).toLowerCase();
  const country = _toEnCountry((query.country || "").trim(), lang);
  const state   = (query.state || "").trim();
  if (!country) return sendJSON(res, 400, { error: "Paramètre country requis." });
  try {
    let cities;
    if (state) {
      const d = await geoFetch("countries/state/cities", JSON.stringify({ country, state }));
      cities = (d.data || []);
    } else {
      const d = await geoFetch("countries/cities", JSON.stringify({ country }));
      cities = (d.data || []);
    }
    sendJSON(res, 200, { cities: cities.sort((a, b) => a.localeCompare(b, lang)) });
  } catch (e) {
    sendJSON(res, 502, { error: "Service géographique indisponible." });
  }
});

/* ══════════════════════════════════════════════════════════════
   CHATBOT — Mémoire admin + contenu site diaspo-actif.com
   ══════════════════════════════════════════════════════════════ */

let _siteCache = { data: null, ts: 0 };
const SITE_TTL = 12 * 3600 * 1000; // 12h

async function scrapeSite() {
  if (_siteCache.data && Date.now() - _siteCache.ts < SITE_TTL) return _siteCache.data;
  try {
    const r = await fetch("https://www.diaspo-actif.com/", { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await r.text();
    const HTML_ENTITIES = {
      "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#039;":"'","&apos;":"'",
      "&agrave;":"à","&aacute;":"á","&acirc;":"â","&atilde;":"ã","&auml;":"ä","&aring;":"å","&aelig;":"æ",
      "&ccedil;":"ç","&egrave;":"è","&eacute;":"é","&ecirc;":"ê","&euml;":"ë",
      "&igrave;":"ì","&iacute;":"í","&icirc;":"î","&iuml;":"ï",
      "&ograve;":"ò","&oacute;":"ó","&ocirc;":"ô","&otilde;":"õ","&ouml;":"ö",
      "&ugrave;":"ù","&uacute;":"ú","&ucirc;":"û","&uuml;":"ü",
      "&ntilde;":"ñ","&Agrave;":"À","&Aacute;":"Á","&Acirc;":"Â","&Eacute;":"É","&Egrave;":"È",
      "&Ecirc;":"Ê","&Icirc;":"Î","&Ocirc;":"Ô","&Ugrave;":"Ù","&Ucirc;":"Û","&Uuml;":"Ü",
      "&laquo;":"«","&raquo;":"»","&nbsp;":" ","&mdash;":"—","&ndash;":"–","&hellip;":"…",
      "&euro;":"€","&rsquo;":"’","&lsquo;":"‘","&ldquo;":"“","&rdquo;":"”",
    };
    const decodeEntities = s => s
      .replace(/&[a-zA-Z]+;/g, m => HTML_ENTITIES[m.toLowerCase()] || m)
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    const clean = decodeEntities(html
      .replace(/<(script|style|nav|footer|iframe)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    const sentences = clean.split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 50 && s.length < 600 && /[a-zà-ü]/i.test(s));
    _siteCache = { data: sentences, ts: Date.now() };
    return sentences;
  } catch (e) {
    return _siteCache.data || [];
  }
}

/* ── Migration colonnes chatbot (exécutée une seule fois au démarrage) ── */
(function migrateChatbot() {
  const cols = db.prepare("PRAGMA table_info(chatbot_memoire)").all().map(c => c.name);
  const add = (col, def) => { if (!cols.includes(col)) { try { db.prepare(`ALTER TABLE chatbot_memoire ADD COLUMN ${col} ${def}`).run(); } catch(e){} } };
  add("categorie", "TEXT DEFAULT 'Général'");
  add("mots_cles", "TEXT DEFAULT '[]'");
  add("priorite",  "INTEGER DEFAULT 5");
  add("liens_json","TEXT DEFAULT '[]'");
  add("source",    "TEXT DEFAULT 'admin'");
  add("actif",     "INTEGER DEFAULT 1");
  add("nb_consultations","INTEGER DEFAULT 0");
  add("created_by","INTEGER");
  add("updated_at","TEXT DEFAULT (datetime('now'))");
  // Tables annexes
  try { db.prepare(`CREATE TABLE IF NOT EXISTS chatbot_memoire_historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT, memoire_id INTEGER NOT NULL,
    auteur_id INTEGER, auteur_nom TEXT,
    ancien_titre TEXT, nouveau_titre TEXT,
    ancien_contenu TEXT, nouveau_contenu TEXT,
    ancien_categorie TEXT, nouveau_categorie TEXT,
    commentaire TEXT, created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(memoire_id) REFERENCES chatbot_memoire(id) ON DELETE CASCADE)`).run(); } catch(e){}
  try { db.prepare(`CREATE TABLE IF NOT EXISTS chatbot_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL,
    question_norm TEXT NOT NULL, nb_fois INTEGER DEFAULT 1,
    langue TEXT DEFAULT 'fr', categorie_estimee TEXT,
    utilisateur_id INTEGER, contexte TEXT,
    statut TEXT DEFAULT 'ouvert', memoire_id INTEGER,
    reponse_admin TEXT,
    first_asked_at TEXT DEFAULT (datetime('now')),
    last_asked_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}
})();

/* ── Helpers ── */
function normQuestion(q) {
  return (q||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9 ]/g,"").replace(/\s+/g," ").trim().slice(0,200);
}

/* GET /api/chatbot/context — public (priorité : mémoire > import > vide) */
route("GET", "/api/chatbot/context", async (req, res) => {
  // Incrémenter nb_consultations est fait côté chatbot via /api/chatbot/memoire/:id/consulter
  const memories = db.prepare(
    "SELECT id, titre, contenu, categorie, mots_cles, priorite, source, actif FROM chatbot_memoire WHERE actif=1 ORDER BY priorite ASC, ordre ASC, created_at ASC"
  ).all().map(m => ({ ...m, mots_cles: (() => { try { return JSON.parse(m.mots_cles||"[]"); } catch(e){ return []; } })() }));

  // Contenu importé depuis le site (source='import') déjà dans la table, sinon scrape live
  const importedInDb = memories.filter(m => m.source === "import");
  let siteContent = [];
  if (importedInDb.length === 0) {
    // Scrape live seulement si pas encore importé
    siteContent = await scrapeSite();
  }
  sendJSON(res, 200, { memories, siteContent, imported_in_db: importedInDb.length > 0 });
});

/* POST /api/chatbot/memoire/:id/consulter — public, incrémente le compteur */
route("POST", "/api/chatbot/memoire/:id/consulter", async (req, res, params) => {
  try { db.prepare("UPDATE chatbot_memoire SET nb_consultations=nb_consultations+1 WHERE id=?").run(params.id); } catch(e){}
  sendJSON(res, 200, { ok: true });
});

/* GET /api/chatbot/memoire — admin, liste complète */
route("GET", "/api/chatbot/memoire", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const q = db.prepare("SELECT * FROM chatbot_memoire ORDER BY priorite ASC, ordre ASC, created_at ASC").all();
  sendJSON(res, 200, { memoires: q.map(m => ({
    ...m,
    mots_cles: (() => { try { return JSON.parse(m.mots_cles||"[]"); } catch(e){ return []; } })(),
    liens_json: (() => { try { return JSON.parse(m.liens_json||"[]"); } catch(e){ return []; } })(),
  })) });
});

/* POST /api/chatbot/memoire — admin, créer */
route("POST", "/api/chatbot/memoire", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const { titre, contenu, categorie="Général", mots_cles=[], priorite=5, liens_json=[], ordre=0 } = body || {};
  if (!titre?.trim() || !contenu?.trim()) return sendJSON(res, 400, { error: "Titre et contenu requis." });
  const r = db.prepare(
    "INSERT INTO chatbot_memoire (titre,contenu,categorie,mots_cles,priorite,liens_json,source,ordre,created_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))"
  ).run(titre.trim(), contenu.trim(), categorie, JSON.stringify(mots_cles), priorite, JSON.stringify(liens_json), "admin", ordre, user.id);
  // Historique
  db.prepare("INSERT INTO chatbot_memoire_historique (memoire_id,auteur_id,auteur_nom,nouveau_titre,nouveau_contenu,nouveau_categorie,commentaire) VALUES (?,?,?,?,?,?,?)")
    .run(r.lastInsertRowid, user.id, user.nom, titre.trim(), contenu.trim(), categorie, "Création");
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* PUT /api/chatbot/memoire/:id — admin, modifier */
route("PUT", "/api/chatbot/memoire/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const id = params.id;
  const ancien = db.prepare("SELECT * FROM chatbot_memoire WHERE id=?").get(id);
  if (!ancien) return sendJSON(res, 404, { error: "Connaissance introuvable." });
  const { titre, contenu, categorie, mots_cles, priorite, liens_json, ordre, actif, commentaire } = body || {};
  db.prepare(`UPDATE chatbot_memoire SET
    titre=COALESCE(?,titre), contenu=COALESCE(?,contenu),
    categorie=COALESCE(?,categorie), mots_cles=COALESCE(?,mots_cles),
    priorite=COALESCE(?,priorite), liens_json=COALESCE(?,liens_json),
    ordre=COALESCE(?,ordre), actif=COALESCE(?,actif),
    updated_at=datetime('now') WHERE id=?`)
    .run(titre||null, contenu||null, categorie||null,
         mots_cles!=null?JSON.stringify(mots_cles):null,
         priorite!=null?priorite:null,
         liens_json!=null?JSON.stringify(liens_json):null,
         ordre!=null?ordre:null, actif!=null?actif:null, id);
  // Historique si contenu ou titre modifié
  if ((titre && titre !== ancien.titre) || (contenu && contenu !== ancien.contenu) || (categorie && categorie !== ancien.categorie)) {
    db.prepare("INSERT INTO chatbot_memoire_historique (memoire_id,auteur_id,auteur_nom,ancien_titre,nouveau_titre,ancien_contenu,nouveau_contenu,ancien_categorie,nouveau_categorie,commentaire) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(id, user.id, user.nom, ancien.titre, titre||ancien.titre, ancien.contenu, contenu||ancien.contenu, ancien.categorie, categorie||ancien.categorie, commentaire||"Modification");
  }
  sendJSON(res, 200, { ok: true });
});

/* DELETE /api/chatbot/memoire/:id — admin */
route("DELETE", "/api/chatbot/memoire/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  db.prepare("DELETE FROM chatbot_memoire WHERE id = ?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/chatbot/memoire/:id/historique — admin */
route("GET", "/api/chatbot/memoire/:id/historique", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const rows = db.prepare("SELECT * FROM chatbot_memoire_historique WHERE memoire_id=? ORDER BY created_at DESC").all(params.id);
  sendJSON(res, 200, { historique: rows });
});

/* POST /api/chatbot/memoire/:id/restaurer — admin, restaure une version */
route("POST", "/api/chatbot/memoire/:id/restaurer", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const { historique_id } = body || {};
  const version = db.prepare("SELECT * FROM chatbot_memoire_historique WHERE id=? AND memoire_id=?").get(historique_id, params.id);
  if (!version) return sendJSON(res, 404, { error: "Version introuvable." });
  const ancien = db.prepare("SELECT * FROM chatbot_memoire WHERE id=?").get(params.id);
  db.prepare("UPDATE chatbot_memoire SET titre=?,contenu=?,categorie=?,updated_at=datetime('now') WHERE id=?")
    .run(version.ancien_titre||ancien.titre, version.ancien_contenu||ancien.contenu, version.ancien_categorie||ancien.categorie, params.id);
  db.prepare("INSERT INTO chatbot_memoire_historique (memoire_id,auteur_id,auteur_nom,ancien_titre,nouveau_titre,ancien_contenu,nouveau_contenu,ancien_categorie,nouveau_categorie,commentaire) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(params.id, user.id, user.nom, ancien.titre, version.ancien_titre, ancien.contenu, version.ancien_contenu, ancien.categorie, version.ancien_categorie, `Restauration vers version du ${version.created_at}`);
  sendJSON(res, 200, { ok: true });
});

/* POST /api/chatbot/importer-site — admin, snapshot permanent du site */
route("POST", "/api/chatbot/importer-site", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const sentences = await scrapeSite();
  if (!sentences.length) return sendJSON(res, 502, { error: "Site inaccessible ou vide." });
  // Supprimer les anciennes entrées importées
  db.prepare("DELETE FROM chatbot_memoire WHERE source='import'").run();
  // Insérer les nouvelles
  const insert = db.prepare("INSERT INTO chatbot_memoire (titre,contenu,categorie,source,priorite,ordre,created_by,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))");
  let count = 0;
  sentences.forEach((s, i) => {
    if (s.length > 30) {
      insert.run("Contenu importé #" + (i+1), s, "Import site", "import", 8, 100+i, user.id);
      count++;
    }
  });
  sendJSON(res, 200, { imported: count, message: `${count} extraits importés définitivement depuis diaspo-actif.com` });
});

/* GET /api/chatbot/stats — admin */
route("GET", "/api/chatbot/stats", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const total       = db.prepare("SELECT COUNT(*) n FROM chatbot_memoire WHERE actif=1").get().n;
  const ce_mois     = db.prepare("SELECT COUNT(*) n FROM chatbot_memoire WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now') AND actif=1").get().n;
  const modifs      = db.prepare("SELECT COUNT(*) n FROM chatbot_memoire_historique").get().n;
  const sans_rep    = db.prepare("SELECT COUNT(*) n FROM chatbot_questions WHERE statut='ouvert'").get().n;
  const total_q     = db.prepare("SELECT COUNT(*) n FROM chatbot_questions").get().n;
  const top_cats    = db.prepare("SELECT categorie, COUNT(*) n FROM chatbot_memoire WHERE actif=1 GROUP BY categorie ORDER BY n DESC LIMIT 5").all();
  const top_connus  = db.prepare("SELECT titre, nb_consultations FROM chatbot_memoire WHERE actif=1 ORDER BY nb_consultations DESC LIMIT 5").all();
  const questions_freq = db.prepare("SELECT question, nb_fois, categorie_estimee, last_asked_at FROM chatbot_questions WHERE statut='ouvert' ORDER BY nb_fois DESC LIMIT 10").all();
  const taux_reponse = total_q > 0 ? Math.round(((total_q - sans_rep) / total_q) * 100) : 100;
  sendJSON(res, 200, { total, ce_mois, modifs, sans_rep, total_q, top_cats, top_connus, questions_freq, taux_reponse });
});

/* GET /api/chatbot/questions — admin */
route("GET", "/api/chatbot/questions", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const { statut = "ouvert" } = url.parse(req.url, true).query;
  const rows = db.prepare("SELECT * FROM chatbot_questions WHERE statut=? ORDER BY nb_fois DESC, last_asked_at DESC LIMIT 100").all(statut);
  sendJSON(res, 200, { questions: rows });
});

/* POST /api/chatbot/questions — public, enregistrer une question sans réponse */
route("POST", "/api/chatbot/questions", async (req, res, params, body) => {
  const { question, langue="fr", categorie_estimee, contexte } = body || {};
  if (!question?.trim()) return sendJSON(res, 400, { error: "Question requise." });
  const user = getCurrentUser(req);
  const norm = normQuestion(question);
  const existing = db.prepare("SELECT id, nb_fois FROM chatbot_questions WHERE question_norm=? AND statut='ouvert'").get(norm);
  if (existing) {
    db.prepare("UPDATE chatbot_questions SET nb_fois=nb_fois+1, last_asked_at=datetime('now') WHERE id=?").run(existing.id);
    return sendJSON(res, 200, { id: existing.id, incremented: true });
  }
  const r = db.prepare(
    "INSERT INTO chatbot_questions (question,question_norm,langue,categorie_estimee,utilisateur_id,contexte) VALUES (?,?,?,?,?,?)"
  ).run(question.trim(), norm, langue, categorie_estimee||null, user?.id||null, contexte||null);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* PUT /api/chatbot/questions/:id — admin, répondre / changer statut */
route("PUT", "/api/chatbot/questions/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const { reponse_admin, statut } = body || {};
  db.prepare("UPDATE chatbot_questions SET reponse_admin=COALESCE(?,reponse_admin), statut=COALESCE(?,statut) WHERE id=?")
    .run(reponse_admin||null, statut||null, params.id);
  sendJSON(res, 200, { ok: true });
});

/* POST /api/chatbot/questions/:id/convertir — admin, convertit en connaissance */
route("POST", "/api/chatbot/questions/:id/convertir", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const q = db.prepare("SELECT * FROM chatbot_questions WHERE id=?").get(params.id);
  if (!q) return sendJSON(res, 404, { error: "Question introuvable." });
  const { titre, contenu, categorie="Général", mots_cles=[], priorite=5 } = body || {};
  if (!titre?.trim() || !contenu?.trim()) return sendJSON(res, 400, { error: "Titre et contenu requis." });
  const r = db.prepare(
    "INSERT INTO chatbot_memoire (titre,contenu,categorie,mots_cles,priorite,source,ordre,created_by,updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))"
  ).run(titre.trim(), contenu.trim(), categorie, JSON.stringify(mots_cles), priorite, "admin", 0, user.id);
  db.prepare("INSERT INTO chatbot_memoire_historique (memoire_id,auteur_id,auteur_nom,nouveau_titre,nouveau_contenu,nouveau_categorie,commentaire) VALUES (?,?,?,?,?,?,?)")
    .run(r.lastInsertRowid, user.id, user.nom, titre.trim(), contenu.trim(), categorie, `Créé depuis la question : "${q.question}"`);
  // Marquer la question comme répondue
  db.prepare("UPDATE chatbot_questions SET statut='repondu', memoire_id=?, reponse_admin=? WHERE id=?")
    .run(r.lastInsertRowid, contenu.trim(), params.id);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* DELETE /api/chatbot/questions/:id — admin */
route("DELETE", "/api/chatbot/questions/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  db.prepare("UPDATE chatbot_questions SET statut='ignore' WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* POST /api/chatbot/questions/fusionner — admin */
route("POST", "/api/chatbot/questions/fusionner", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const { ids, id_principal } = body || {};
  if (!Array.isArray(ids) || !id_principal) return sendJSON(res, 400, { error: "ids et id_principal requis." });
  const total = ids.reduce((sum, id) => {
    const q = db.prepare("SELECT nb_fois FROM chatbot_questions WHERE id=?").get(id);
    return sum + (q?.nb_fois || 0);
  }, 0);
  db.prepare("UPDATE chatbot_questions SET nb_fois=? WHERE id=?").run(total, id_principal);
  ids.filter(id => id !== id_principal).forEach(id =>
    db.prepare("UPDATE chatbot_questions SET statut='fusionne' WHERE id=?").run(id)
  );
  sendJSON(res, 200, { ok: true, total_fusionnes: ids.length - 1 });
});

async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  if (pathname.startsWith("/api/")) {
    // Enregistrer l'activité de l'utilisateur connecté (pour DAU/WAU/MAU)
    if (req.method === "GET") trackActivity(req);

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
    /* ---- GET /api/visits — compteur cumulatif de visites ---- */
    if (req.method === "GET" && pathname === "/api/visits") {
      try {
        db.exec(`CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)`);
        db.prepare(`INSERT OR IGNORE INTO counters (key, value) VALUES (?, ?)`).run('page_visits', 0);
        db.prepare(`UPDATE counters SET value = value + 1 WHERE key = ?`).run('page_visits');
        const row = db.prepare(`SELECT value FROM counters WHERE key = ?`).get('page_visits');
        return sendJSON(res, 200, { count: row ? row.value : 1 });
      } catch (e) {
        console.error('visits error:', e);
        return sendJSON(res, 200, { count: 0 });
      }
    }

    /* ---- GET /api/stats — statistiques agrégées publiques ---- */
    if (req.method === "GET" && pathname === "/api/stats") {
      try {
        const membres = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'utilisateur'`).get().n;
        const initiatives = db.prepare(`SELECT COUNT(*) AS n FROM initiatives`).get().n;
        const pays = db.prepare(`SELECT COUNT(DISTINCT pays) AS n FROM initiatives WHERE pays IS NOT NULL`).get().n;
        return sendJSON(res, 200, { membres, initiatives, pays });
      } catch (e) {
        return sendJSON(res, 200, { membres: 0, initiatives: 0, pays: 0 });
      }
    }

    /* ============================================================
       MODULE CV & LETTRES DE MOTIVATION
    ============================================================ */
    let body = {};
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      try { body = await readBody(req); } catch(e) {}
    }

    /* --- GET /api/cv — liste CVs de l'utilisateur connecté --- */
    if (req.method === "GET" && pathname === "/api/cv") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const cvs = db.prepare(`SELECT id, numero, titre, theme, updated_at FROM cv_profiles WHERE user_id = ? ORDER BY numero`).all(me.id);
      return sendJSON(res, 200, cvs);
    }

    /* --- GET /api/cv/:id --- */
    if (req.method === "GET" && /^\/api\/cv\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const id = parseInt(pathname.split('/')[3]);
      const cv = db.prepare(`SELECT * FROM cv_profiles WHERE id = ? AND user_id = ?`).get(id, me.id);
      if (!cv) return sendJSON(res, 404, { error: "CV introuvable" });
      cv.data = JSON.parse(cv.data_json || '{}');
      cv.versions = JSON.parse(cv.versions_json || '[]');
      return sendJSON(res, 200, cv);
    }

    /* --- POST /api/cv — créer ou mettre à jour un CV (upsert par numero) --- */
    if (req.method === "POST" && pathname === "/api/cv") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const { numero = 1, titre = 'Mon CV', theme = 'bleu', data = {}, save_version = false } = body;
      if (![1, 2].includes(Number(numero))) return sendJSON(res, 400, { error: "numero doit être 1 ou 2" });
      const existing = db.prepare(`SELECT id, data_json, versions_json FROM cv_profiles WHERE user_id = ? AND numero = ?`).get(me.id, numero);
      if (existing) {
        let versions = JSON.parse(existing.versions_json || '[]');
        let version_saved = false;
        if (save_version) {
          versions.unshift({ saved_at: new Date().toISOString(), data: JSON.parse(existing.data_json || '{}') });
          if (versions.length > 10) versions = versions.slice(0, 10);
          version_saved = true;
        }
        db.prepare(`UPDATE cv_profiles SET titre=?, theme=?, data_json=?, versions_json=?, updated_at=datetime('now') WHERE id=?`)
          .run(titre, theme, JSON.stringify(data), JSON.stringify(versions), existing.id);
        return sendJSON(res, 200, { id: existing.id, saved: true, version_saved, versions });
      } else {
        const r = db.prepare(`INSERT INTO cv_profiles(user_id,numero,titre,theme,data_json,versions_json) VALUES(?,?,?,?,?,?)`)
          .run(me.id, numero, titre, theme, JSON.stringify(data), '[]');
        return sendJSON(res, 201, { id: r.lastInsertRowid, saved: true, versions: [] });
      }
    }

    /* --- DELETE /api/cv/:id --- */
    if (req.method === "DELETE" && /^\/api\/cv\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const id = parseInt(pathname.split('/')[3]);
      db.prepare(`DELETE FROM cv_profiles WHERE id = ? AND user_id = ?`).run(id, me.id);
      return sendJSON(res, 200, { deleted: true });
    }

    /* --- GET /api/lettres --- */
    if (req.method === "GET" && pathname === "/api/lettres") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const lettres = db.prepare(`SELECT id, numero, titre, updated_at FROM lettres_motivation WHERE user_id = ? ORDER BY numero`).all(me.id);
      return sendJSON(res, 200, lettres);
    }

    /* --- GET /api/lettres/:id --- */
    if (req.method === "GET" && /^\/api\/lettres\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const id = parseInt(pathname.split('/')[3]);
      const l = db.prepare(`SELECT * FROM lettres_motivation WHERE id = ? AND user_id = ?`).get(id, me.id);
      if (!l) return sendJSON(res, 404, { error: "Lettre introuvable" });
      l.data = JSON.parse(l.data_json || '{}');
      return sendJSON(res, 200, l);
    }

    /* --- POST /api/lettres --- */
    if (req.method === "POST" && pathname === "/api/lettres") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const { numero = 1, titre = 'Ma lettre', data = {} } = body;
      if (![1, 2].includes(Number(numero))) return sendJSON(res, 400, { error: "numero doit être 1 ou 2" });
      const existing = db.prepare(`SELECT id FROM lettres_motivation WHERE user_id = ? AND numero = ?`).get(me.id, numero);
      if (existing) {
        db.prepare(`UPDATE lettres_motivation SET titre=?, data_json=?, updated_at=datetime('now') WHERE id=?`)
          .run(titre, JSON.stringify(data), existing.id);
        return sendJSON(res, 200, { id: existing.id, saved: true });
      } else {
        const r = db.prepare(`INSERT INTO lettres_motivation(user_id,numero,titre,data_json) VALUES(?,?,?,?)`)
          .run(me.id, numero, titre, JSON.stringify(data));
        return sendJSON(res, 201, { id: r.lastInsertRowid, saved: true });
      }
    }

    /* --- DELETE /api/lettres/:id --- */
    if (req.method === "DELETE" && /^\/api\/lettres\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const id = parseInt(pathname.split('/')[3]);
      db.prepare(`DELETE FROM lettres_motivation WHERE id = ? AND user_id = ?`).run(id, me.id);
      return sendJSON(res, 200, { deleted: true });
    }

    /* --- GET /api/candidatures/mes — candidatures du candidat connecté --- */
    if (req.method === "GET" && pathname === "/api/candidatures/mes") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      try {
        const rows = db.prepare(`
          SELECT oc.id, oc.offre_id, oc.candidat_id, oc.message, oc.statut, oc.created_at,
                 oc.cv_profile_id, oc.lettre_id, oc.statut_detail, oc.vu_recruteur,
                 o.titre AS offre_titre, o.localisation, o.pays,
                 cv.titre AS cv_titre, cv.numero AS cv_numero,
                 lm.titre AS lettre_titre, lm.numero AS lettre_numero
          FROM offres_candidatures oc
          LEFT JOIN offres o ON oc.offre_id = o.id
          LEFT JOIN cv_profiles cv ON oc.cv_profile_id = cv.id
          LEFT JOIN lettres_motivation lm ON oc.lettre_id = lm.id
          WHERE oc.candidat_id = ?
          ORDER BY oc.created_at DESC
        `).all(me.id);
        return sendJSON(res, 200, rows);
      } catch(e) {
        console.error('candidatures/mes error:', e.message);
        return sendJSON(res, 500, { error: e.message });
      }
    }

    /* --- GET /api/candidatures/:id/historique --- */
    if (req.method === "GET" && /^\/api\/candidatures\/\d+\/historique$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const id = parseInt(pathname.split('/')[3]);
      const cand = db.prepare(`SELECT * FROM offres_candidatures WHERE id = ?`).get(id);
      if (!cand || (cand.candidat_id !== me.id && me.role !== 'admin')) {
        const offre = cand ? db.prepare(`SELECT createur_id FROM offres WHERE id=?`).get(cand.offre_id) : null;
        if (!offre || offre.createur_id !== me.id) return sendJSON(res, 403, { error: "Accès refusé" });
      }
      const hist = db.prepare(`SELECT * FROM candidature_historique WHERE candidature_id = ? ORDER BY created_at`).all(id);
      return sendJSON(res, 200, hist);
    }

    /* --- PATCH /api/candidatures/:id/statut — changer le statut (recruteur ou admin) --- */
    if (req.method === "PATCH" && /^\/api\/candidatures\/\d+\/statut$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const id = parseInt(pathname.split('/')[3]);
      const cand = db.prepare(`SELECT * FROM offres_candidatures WHERE id=?`).get(id);
      if (!cand) return sendJSON(res, 404, { error: "Candidature introuvable" });
      const offre = db.prepare(`SELECT createur_id FROM offres WHERE id=?`).get(cand.offre_id);
      if (me.role !== 'admin' && offre?.createur_id !== me.id) return sendJSON(res, 403, { error: "Accès refusé" });
      const { statut_detail, note, date_entretien, lieu_entretien, type_entretien } = body;
      db.prepare(`UPDATE offres_candidatures SET statut_detail=?, date_entretien=?, lieu_entretien=?, type_entretien=?, vu_recruteur=1 WHERE id=?`)
        .run(statut_detail || cand.statut_detail, date_entretien || cand.date_entretien, lieu_entretien || cand.lieu_entretien, type_entretien || cand.type_entretien, id);
      db.prepare(`INSERT INTO candidature_historique(candidature_id,statut,note,auteur_id) VALUES(?,?,?,?)`)
        .run(id, statut_detail, note || null, me.id);
      // Notif candidat
      try {
        db.prepare(`INSERT INTO notifications(user_id,type,titre,message,lien) VALUES(?,?,?,?,?)`)
          .run(cand.candidat_id, 'candidature', 'Mise à jour candidature', `Votre candidature a été mise à jour : ${statut_detail}`, `/dashboard-utilisateur.html#candidatures`);
      } catch(e) {}
      return sendJSON(res, 200, { updated: true });
    }

    /* --- PATCH /api/candidatures/:id/recruteur — notes & évaluation recruteur --- */
    if (req.method === "PATCH" && /^\/api\/candidatures\/\d+\/recruteur$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const id = parseInt(pathname.split('/')[3]);
      const cand = db.prepare(`SELECT * FROM offres_candidatures WHERE id=?`).get(id);
      if (!cand) return sendJSON(res, 404, { error: "Candidature introuvable" });
      const offre = db.prepare(`SELECT createur_id FROM offres WHERE id=?`).get(cand.offre_id);
      if (me.role !== 'admin' && offre?.createur_id !== me.id) return sendJSON(res, 403, { error: "Accès refusé" });
      const { notes_recruteur, evaluation_json } = body;
      db.prepare(`UPDATE offres_candidatures SET notes_recruteur=?, evaluation_json=?, vu_recruteur=1 WHERE id=?`)
        .run(notes_recruteur ?? cand.notes_recruteur, JSON.stringify(evaluation_json) ?? cand.evaluation_json, id);
      return sendJSON(res, 200, { updated: true });
    }

    /* --- GET /api/offres/:id/candidatures — candidatures d'une offre (recruteur) --- */
    if (req.method === "GET" && /^\/api\/offres\/\d+\/candidatures$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const offreId = parseInt(pathname.split('/')[3]);
      const offre = db.prepare(`SELECT * FROM offres WHERE id=?`).get(offreId);
      if (!offre) return sendJSON(res, 404, { error: "Offre introuvable" });
      if (me.role !== 'admin' && offre.createur_id !== me.id) return sendJSON(res, 403, { error: "Accès refusé" });
      const rows = db.prepare(`
        SELECT oc.*,
               u.nom, u.prenom, u.email, u.photo_url, u.pays AS candidat_pays, u.titre_pro,
               cv.titre AS cv_titre, cv.data_json AS cv_data, cv.theme AS cv_theme,
               lm.titre AS lettre_titre, lm.data_json AS lettre_data
        FROM offres_candidatures oc
        LEFT JOIN users u ON oc.candidat_id = u.id
        LEFT JOIN cv_profiles cv ON oc.cv_profile_id = cv.id
        LEFT JOIN lettres_motivation lm ON oc.lettre_id = lm.id
        WHERE oc.offre_id = ?
        ORDER BY oc.created_at DESC
      `).all(offreId);
      return sendJSON(res, 200, rows);
    }

    /* --- POST /api/offres/:id/postuler — postuler avec CV+LM --- */
    if (req.method === "POST" && /^\/api\/offres\/\d+\/postuler$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const offreId = parseInt(pathname.split('/')[3]);
      const { message, cv_profile_id, lettre_id } = body;
      const existing = db.prepare(`SELECT id FROM offres_candidatures WHERE offre_id=? AND candidat_id=?`).get(offreId, me.id);
      if (existing) return sendJSON(res, 409, { error: "Vous avez déjà postulé à cette offre" });
      const r = db.prepare(`INSERT INTO offres_candidatures(offre_id,candidat_id,message,cv_profile_id,lettre_id,statut,statut_detail,type_candidature) VALUES(?,?,?,?,?,'recu','envoyee','offre')`)
        .run(offreId, me.id, message || null, cv_profile_id || null, lettre_id || null);
      db.prepare(`UPDATE offres SET nb_candidatures = nb_candidatures + 1 WHERE id=?`).run(offreId);
      db.prepare(`INSERT INTO candidature_historique(candidature_id,statut,auteur_id) VALUES(?,?,?)`)
        .run(r.lastInsertRowid, 'envoyee', me.id);
      // Notif recruteur
      try {
        const offre = db.prepare(`SELECT createur_id, titre FROM offres WHERE id=?`).get(offreId);
        db.prepare(`INSERT INTO notifications(user_id,type,titre,message,lien) VALUES(?,?,?,?,?)`)
          .run(offre.createur_id, 'candidature', 'Nouvelle candidature', `Nouvelle candidature reçue pour "${offre.titre}"`, `/dashboard-initiative.html#candidatures`);
      } catch(e) {}
      return sendJSON(res, 201, { id: r.lastInsertRowid, success: true });
    }

    /* ================================================================
       AGENDA PERSONNEL
    ================================================================ */
    const crypto = require("node:crypto");
    const genId = (n=16) => crypto.randomBytes(n).toString("hex");

    /* GET /api/agenda/events — événements de l'utilisateur (avec range dates) */
    if (req.method === "GET" && pathname === "/api/agenda/events") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const p = new URLSearchParams(parsed.search || "");
      const from = p.get("from") || new Date(Date.now() - 30*24*3600000).toISOString().slice(0,10);
      const to   = p.get("to")   || new Date(Date.now() + 60*24*3600000).toISOString().slice(0,10);
      const events = db.prepare(`
        SELECT e.*, u.prenom, u.nom FROM agenda_events e
        LEFT JOIN users u ON e.user_id = u.id
        WHERE e.user_id = ? AND date(e.date_debut) >= ? AND date(e.date_debut) <= ?
        ORDER BY e.date_debut ASC
      `).all(me.id, from, to);
      return sendJSON(res, 200, events);
    }

    /* POST /api/agenda/events */
    if (req.method === "POST" && pathname === "/api/agenda/events") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const { titre, description, date_debut, date_fin, lieu, lieu_type, couleur, notes_privees, all_day, rdv_id, meeting_id } = body;
      if (!titre || !date_debut || !date_fin) return sendJSON(res, 400, { error: "Champs requis manquants" });
      const r = db.prepare(`INSERT INTO agenda_events(user_id,titre,description,date_debut,date_fin,lieu,lieu_type,couleur,notes_privees,all_day,rdv_id,meeting_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(me.id, titre, description||null, date_debut, date_fin, lieu||null, lieu_type||'physique', couleur||'#4a90d9', notes_privees||null, all_day?1:0, rdv_id||null, meeting_id||null);
      // Créer rappels
      try {
        const evDate = new Date(date_debut);
        const reminders = [
          { type: '24h', ms: 24*3600*1000 },
          { type: '1h',  ms: 3600*1000 },
          { type: '15m', ms: 15*60*1000 }
        ];
        for (const rem of reminders) {
          const remAt = new Date(evDate.getTime() - rem.ms).toISOString();
          if (new Date(remAt) > new Date()) {
            db.prepare(`INSERT INTO agenda_reminders(user_id,event_id,remind_at,type) VALUES(?,?,?,?)`)
              .run(me.id, r.lastInsertRowid, remAt, rem.type);
          }
        }
      } catch(e) {}
      return sendJSON(res, 201, { id: r.lastInsertRowid });
    }

    /* PUT /api/agenda/events/:id */
    if (req.method === "PUT" && /^\/api\/agenda\/events\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const evId = parseInt(pathname.split('/')[4]);
      const ev = db.prepare(`SELECT * FROM agenda_events WHERE id=? AND user_id=?`).get(evId, me.id);
      if (!ev) return sendJSON(res, 404, { error: "Événement introuvable" });
      const { titre, description, date_debut, date_fin, lieu, lieu_type, couleur, notes_privees, all_day } = body;
      db.prepare(`UPDATE agenda_events SET titre=?,description=?,date_debut=?,date_fin=?,lieu=?,lieu_type=?,couleur=?,notes_privees=?,all_day=?,updated_at=datetime('now') WHERE id=?`)
        .run(titre||ev.titre, description??ev.description, date_debut||ev.date_debut, date_fin||ev.date_fin, lieu??ev.lieu, lieu_type||ev.lieu_type, couleur||ev.couleur, notes_privees??ev.notes_privees, all_day?1:0, evId);
      return sendJSON(res, 200, { updated: true });
    }

    /* DELETE /api/agenda/events/:id */
    if (req.method === "DELETE" && /^\/api\/agenda\/events\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const evId = parseInt(pathname.split('/')[4]);
      db.prepare(`DELETE FROM agenda_events WHERE id=? AND user_id=?`).run(evId, me.id);
      db.prepare(`DELETE FROM agenda_reminders WHERE event_id=? AND user_id=?`).run(evId, me.id);
      return sendJSON(res, 200, { deleted: true });
    }

    /* GET /api/agenda/availability — vérifier dispo d'un user sur un créneau */
    if (req.method === "GET" && pathname === "/api/agenda/availability") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const p = new URLSearchParams(parsed.search || "");
      const userId = parseInt(p.get("user_id") || me.id);
      const debut  = p.get("debut");
      const fin    = p.get("fin");
      if (!debut || !fin) return sendJSON(res, 400, { error: "debut et fin requis" });
      // Chercher conflits
      const conflits = db.prepare(`
        SELECT id, titre, date_debut, date_fin FROM agenda_events
        WHERE user_id=? AND NOT (date_fin <= ? OR date_debut >= ?)
      `).all(userId, debut, fin);
      const libre = conflits.length === 0;
      // Si occupé, suggérer créneaux libres autour
      let suggestions = [];
      if (!libre) {
        const dureeMs = new Date(fin) - new Date(debut);
        const bases = [-2,-1,1,2,3,4].map(h => new Date(new Date(debut).getTime() + h*3600000));
        for (const base of bases) {
          const s = base.toISOString();
          const e = new Date(base.getTime() + dureeMs).toISOString();
          const c = db.prepare(`SELECT id FROM agenda_events WHERE user_id=? AND NOT (date_fin <= ? OR date_debut >= ?)`).all(userId, s, e);
          if (c.length === 0) suggestions.push({ debut: s, fin: e });
          if (suggestions.length >= 3) break;
        }
      }
      return sendJSON(res, 200, { libre, conflits, suggestions });
    }

    /* ================================================================
       RENDEZ-VOUS (PROPOSITIONS)
    ================================================================ */

    /* GET /api/rdv — mes RDV */
    if (req.method === "GET" && pathname === "/api/rdv") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rdvs = db.prepare(`
        SELECT r.*,
          up.prenom AS proposeur_prenom, up.nom AS proposeur_nom, up.photo_url AS proposeur_photo,
          ud.prenom AS dest_prenom, ud.nom AS dest_nom, ud.photo_url AS dest_photo
        FROM rdv_proposals r
        LEFT JOIN users up ON r.proposeur_id = up.id
        LEFT JOIN users ud ON r.destinataire_id = ud.id
        WHERE r.proposeur_id=? OR r.destinataire_id=?
        ORDER BY r.created_at DESC
      `).all(me.id, me.id);
      return sendJSON(res, 200, rdvs);
    }

    /* POST /api/rdv — proposer un RDV */
    if (req.method === "POST" && pathname === "/api/rdv") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const { destinataire_id, titre, description, date_proposee, heure_debut, heure_fin, duree_minutes, lieu, lieu_type } = body;
      if (!destinataire_id || !titre || !date_proposee || !heure_debut || !heure_fin)
        return sendJSON(res, 400, { error: "Champs requis manquants" });
      // Vérif dispo des deux
      const debut = `${date_proposee}T${heure_debut}:00`;
      const fin   = `${date_proposee}T${heure_fin}:00`;
      const conflitProposeur = db.prepare(`SELECT id FROM agenda_events WHERE user_id=? AND NOT (date_fin <= ? OR date_debut >= ?)`).all(me.id, debut, fin);
      const conflitDest = db.prepare(`SELECT id FROM agenda_events WHERE user_id=? AND NOT (date_fin <= ? OR date_debut >= ?)`).all(destinataire_id, debut, fin);
      if (conflitProposeur.length > 0) return sendJSON(res, 409, { error: "Vous avez déjà un événement sur ce créneau", who: 'proposeur' });
      if (conflitDest.length > 0) return sendJSON(res, 409, { error: "Le destinataire a déjà un événement sur ce créneau", who: 'destinataire' });
      const r = db.prepare(`INSERT INTO rdv_proposals(proposeur_id,destinataire_id,titre,description,date_proposee,heure_debut,heure_fin,duree_minutes,lieu,lieu_type)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(me.id, destinataire_id, titre, description||null, date_proposee, heure_debut, heure_fin, duree_minutes||30, lieu||null, lieu_type||'virtuel');
      // Notif destinataire
      const moi = db.prepare(`SELECT prenom, nom FROM users WHERE id=?`).get(me.id);
      try {
        db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(
          destinataire_id, 'rdv_proposition',
          `Nouveau rendez-vous proposé`,
          `${moi.prenom} ${moi.nom} vous propose un RDV : "${titre}" le ${date_proposee} à ${heure_debut}`,
          JSON.stringify({ rdv_id: r.lastInsertRowid })
        );
      } catch(e) {}
      return sendJSON(res, 201, { id: r.lastInsertRowid });
    }

    /* PATCH /api/rdv/:id/respond — accepter/refuser/contre-proposer */
    if (req.method === "PATCH" && /^\/api\/rdv\/\d+\/respond$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rdvId = parseInt(pathname.split('/')[3]);
      const rdv = db.prepare(`SELECT * FROM rdv_proposals WHERE id=?`).get(rdvId);
      if (!rdv) return sendJSON(res, 404, { error: "RDV introuvable" });
      if (rdv.destinataire_id !== me.id && rdv.proposeur_id !== me.id) return sendJSON(res, 403, { error: "Accès refusé" });
      const { action, contre_date, contre_heure_debut, contre_heure_fin, message_reponse } = body;

      if (action === 'accepte') {
        // Créer les événements dans les deux agendas
        const debut = `${rdv.date_proposee}T${rdv.heure_debut}:00`;
        const fin   = `${rdv.date_proposee}T${rdv.heure_fin}:00`;
        let meetingId = null;
        // Créer salle de réunion si virtuel
        if (rdv.lieu_type === 'virtuel' || !rdv.lieu) {
          const roomId = genId(12);
          const tokenHost  = genId(16);
          const tokenGuest = genId(16);
          const mr = db.prepare(`INSERT INTO meetings(room_id,token_host,token_guest,titre,host_id,rdv_id,duree_max_minutes) VALUES(?,?,?,?,?,?,40)`)
            .run(roomId, tokenHost, tokenGuest, rdv.titre, rdv.proposeur_id, rdvId);
          meetingId = mr.lastInsertRowid;
          db.prepare(`INSERT INTO meeting_participants(meeting_id,user_id,role) VALUES(?,?,?)`).run(meetingId, rdv.proposeur_id, 'host');
          try { db.prepare(`INSERT INTO meeting_participants(meeting_id,user_id,role) VALUES(?,?,?)`).run(meetingId, rdv.destinataire_id, 'guest'); } catch(e) {}
        }
        const evP = db.prepare(`INSERT INTO agenda_events(user_id,titre,description,date_debut,date_fin,lieu,lieu_type,couleur,rdv_id,meeting_id) VALUES(?,?,?,?,?,?,?,?,?,?)`)
          .run(rdv.proposeur_id, rdv.titre, rdv.description||null, debut, fin, rdv.lieu||null, rdv.lieu_type||'physique', '#27ae60', rdvId, meetingId);
        const evD = db.prepare(`INSERT INTO agenda_events(user_id,titre,description,date_debut,date_fin,lieu,lieu_type,couleur,rdv_id,meeting_id) VALUES(?,?,?,?,?,?,?,?,?,?)`)
          .run(rdv.destinataire_id, rdv.titre, rdv.description||null, debut, fin, rdv.lieu||null, rdv.lieu_type||'physique', '#27ae60', rdvId, meetingId);
        db.prepare(`UPDATE rdv_proposals SET statut='accepte',event_proposeur_id=?,event_destinataire_id=?,meeting_id=?,message_reponse=?,updated_at=datetime('now') WHERE id=?`)
          .run(evP.lastInsertRowid, evD.lastInsertRowid, meetingId, message_reponse||null, rdvId);
        // Notif proposeur
        try {
          const dest = db.prepare(`SELECT prenom, nom FROM users WHERE id=?`).get(me.id);
          db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(
            rdv.proposeur_id, 'rdv_accepte', 'Rendez-vous accepté',
            `${dest.prenom} ${dest.nom} a accepté votre RDV "${rdv.titre}"`,
            JSON.stringify({ rdv_id: rdvId, meeting_id: meetingId })
          );
        } catch(e) {}
        const meeting = meetingId ? db.prepare(`SELECT * FROM meetings WHERE id=?`).get(meetingId) : null;
        return sendJSON(res, 200, { statut: 'accepte', meeting });

      } else if (action === 'refuse') {
        db.prepare(`UPDATE rdv_proposals SET statut='refuse',message_reponse=?,updated_at=datetime('now') WHERE id=?`).run(message_reponse||null, rdvId);
        try {
          const dest = db.prepare(`SELECT prenom, nom FROM users WHERE id=?`).get(me.id);
          db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(
            rdv.proposeur_id, 'rdv_refuse', 'Rendez-vous refusé',
            `${dest.prenom} ${dest.nom} a refusé votre RDV "${rdv.titre}"`,
            JSON.stringify({ rdv_id: rdvId })
          );
        } catch(e) {}
        return sendJSON(res, 200, { statut: 'refuse' });

      } else if (action === 'contre_proposition') {
        if (!contre_date || !contre_heure_debut || !contre_heure_fin)
          return sendJSON(res, 400, { error: "Nouvelle date/heure requise" });
        db.prepare(`UPDATE rdv_proposals SET statut='contre_proposition',contre_date=?,contre_heure_debut=?,contre_heure_fin=?,message_reponse=?,updated_at=datetime('now') WHERE id=?`)
          .run(contre_date, contre_heure_debut, contre_heure_fin, message_reponse||null, rdvId);
        try {
          const dest = db.prepare(`SELECT prenom, nom FROM users WHERE id=?`).get(me.id);
          db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(
            rdv.proposeur_id, 'rdv_contre_prop', 'Contre-proposition de RDV',
            `${dest.prenom} ${dest.nom} propose une autre date pour "${rdv.titre}" : ${contre_date} à ${contre_heure_debut}`,
            JSON.stringify({ rdv_id: rdvId })
          );
        } catch(e) {}
        return sendJSON(res, 200, { statut: 'contre_proposition' });

      } else if (action === 'annule') {
        db.prepare(`UPDATE rdv_proposals SET statut='annule',message_reponse=?,updated_at=datetime('now') WHERE id=?`).run(message_reponse||null, rdvId);
        // Supprimer les événements liés
        if (rdv.event_proposeur_id) db.prepare(`DELETE FROM agenda_events WHERE id=?`).run(rdv.event_proposeur_id);
        if (rdv.event_destinataire_id) db.prepare(`DELETE FROM agenda_events WHERE id=?`).run(rdv.event_destinataire_id);
        if (rdv.meeting_id) db.prepare(`UPDATE meetings SET statut='expire' WHERE id=?`).run(rdv.meeting_id);
        const autreUser = me.id === rdv.proposeur_id ? rdv.destinataire_id : rdv.proposeur_id;
        try {
          const dest = db.prepare(`SELECT prenom, nom FROM users WHERE id=?`).get(me.id);
          db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(
            autreUser, 'rdv_annule', 'Rendez-vous annulé',
            `${dest.prenom} ${dest.nom} a annulé le RDV "${rdv.titre}"`,
            JSON.stringify({ rdv_id: rdvId })
          );
        } catch(e) {}
        return sendJSON(res, 200, { statut: 'annule' });
      }
      return sendJSON(res, 400, { error: "Action inconnue" });
    }

    /* ================================================================
       MEETINGS (VISIOCONFÉRENCE)
    ================================================================ */

    /* POST /api/meetings — créer une salle de réunion directe */
    if (req.method === "POST" && pathname === "/api/meetings") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const { titre, destinataire_id, rdv_id } = body;
      const roomId = genId(12);
      const tokenHost  = genId(16);
      const tokenGuest = genId(16);
      const r = db.prepare(`INSERT INTO meetings(room_id,token_host,token_guest,titre,host_id,rdv_id,duree_max_minutes) VALUES(?,?,?,?,?,?,40)`)
        .run(roomId, tokenHost, tokenGuest, titre||'Réunion', me.id, rdv_id||null);
      db.prepare(`INSERT INTO meeting_participants(meeting_id,user_id,role) VALUES(?,?,?)`).run(r.lastInsertRowid, me.id, 'host');
      if (destinataire_id) {
        try { db.prepare(`INSERT INTO meeting_participants(meeting_id,user_id,role) VALUES(?,?,?)`).run(r.lastInsertRowid, destinataire_id, 'guest'); } catch(e) {}
        const moi = db.prepare(`SELECT prenom, nom FROM users WHERE id=?`).get(me.id);
        try {
          db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(
            destinataire_id, 'meeting_invite', 'Invitation à une réunion',
            `${moi.prenom} ${moi.nom} vous invite à rejoindre une réunion : "${titre||'Réunion'}"`,
            JSON.stringify({ meeting_id: r.lastInsertRowid, room_id: roomId, token: tokenGuest })
          );
        } catch(e) {}
      }
      return sendJSON(res, 201, { id: r.lastInsertRowid, room_id: roomId, token_host: tokenHost, token_guest: tokenGuest });
    }

    /* GET /api/meetings/:id — infos salle (par id ou room_id) */
    if (req.method === "GET" && /^\/api\/meetings\/[^/]+$/.test(pathname)) {
      const idOrRoom = pathname.split('/')[3];
      const meeting = db.prepare(`SELECT m.*, u.prenom AS host_prenom, u.nom AS host_nom FROM meetings m LEFT JOIN users u ON m.host_id = u.id WHERE m.id=? OR m.room_id=?`).get(idOrRoom, idOrRoom);
      if (!meeting) return sendJSON(res, 404, { error: "Salle introuvable" });
      const participants = db.prepare(`SELECT mp.*, u.prenom, u.nom, u.photo_url FROM meeting_participants mp LEFT JOIN users u ON mp.user_id = u.id WHERE mp.meeting_id=?`).all(meeting.id);
      return sendJSON(res, 200, { ...meeting, participants });
    }

    /* PATCH /api/meetings/:id/start — démarrer la réunion */
    if (req.method === "PATCH" && /^\/api\/meetings\/\d+\/start$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const meetId = parseInt(pathname.split('/')[3]);
      db.prepare(`UPDATE meetings SET statut='actif', started_at=datetime('now') WHERE id=? AND host_id=?`).run(meetId, me.id);
      return sendJSON(res, 200, { started: true });
    }

    /* PATCH /api/meetings/:id/end — terminer la réunion */
    if (req.method === "PATCH" && /^\/api\/meetings\/\d+\/end$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const meetId = parseInt(pathname.split('/')[3]);
      const m = db.prepare(`SELECT * FROM meetings WHERE id=?`).get(meetId);
      if (!m) return sendJSON(res, 404, { error: "Salle introuvable" });
      db.prepare(`UPDATE meetings SET statut='termine', ended_at=datetime('now') WHERE id=?`).run(meetId);
      if (m.started_at) {
        const duree = Math.round((Date.now() - new Date(m.started_at).getTime()) / 60000);
        const parts = db.prepare(`SELECT user_id FROM meeting_participants WHERE meeting_id=?`).all(meetId);
        for (const p of parts) {
          try { db.prepare(`INSERT INTO meeting_history(meeting_id,user_id,duree_effective_minutes,statut) VALUES(?,?,?,?)`).run(meetId, p.user_id, duree, 'termine'); } catch(e) {}
        }
      }
      return sendJSON(res, 200, { ended: true });
    }

    /* POST /api/meetings/:room_id/signal — envoyer signal WebRTC */
    if (req.method === "POST" && /^\/api\/meetings\/[^/]+\/signal$/.test(pathname)) {
      const roomId = pathname.split('/')[3];
      const { from_peer, to_peer, type, data } = body;
      if (!from_peer || !type || !data) return sendJSON(res, 400, { error: "Manque from_peer/type/data" });
      db.prepare(`INSERT INTO meeting_signals(room_id,from_peer,to_peer,type,data) VALUES(?,?,?,?,?)`)
        .run(roomId, from_peer, to_peer||null, type, JSON.stringify(data));
      // Purger les vieux signaux (>5 min)
      try { db.prepare(`DELETE FROM meeting_signals WHERE room_id=? AND datetime(created_at) < datetime('now','-5 minutes')`).run(roomId); } catch(e) {}
      return sendJSON(res, 200, { sent: true });
    }

    /* GET /api/meetings/:room_id/signal — polling signaux WebRTC */
    if (req.method === "GET" && /^\/api\/meetings\/[^/]+\/signal$/.test(pathname)) {
      const roomId = pathname.split('/')[3];
      const p = new URLSearchParams(parsed.search || "");
      const peer = p.get("peer");
      const after = parseInt(p.get("after") || "0");
      const signals = db.prepare(`
        SELECT * FROM meeting_signals
        WHERE room_id=? AND id > ? AND consumed=0
        AND (to_peer IS NULL OR to_peer=?)
        ORDER BY id ASC LIMIT 50
      `).all(roomId, after, peer||'');
      // Marquer comme consommés pour ce peer
      if (signals.length > 0 && peer) {
        const ids = signals.map(s=>s.id).join(',');
        try { db.prepare(`UPDATE meeting_signals SET consumed=1 WHERE id IN (${ids}) AND (to_peer=? OR to_peer IS NULL)`).run(peer); } catch(e) {}
      }
      return sendJSON(res, 200, signals.map(s => ({ ...s, data: JSON.parse(s.data) })));
    }

    /* GET /api/meetings/:room_id/validate-token — vérifier accès */
    if (req.method === "GET" && /^\/api\/meetings\/[^/]+\/validate-token$/.test(pathname)) {
      const roomId = pathname.split('/')[3];
      const p = new URLSearchParams(parsed.search || "");
      const token = p.get("token");
      const meeting = db.prepare(`SELECT * FROM meetings WHERE room_id=?`).get(roomId);
      if (!meeting) return sendJSON(res, 404, { error: "Salle introuvable" });
      if (meeting.statut === 'termine') return sendJSON(res, 410, { error: "Réunion terminée" });
      if (token !== meeting.token_host && token !== meeting.token_guest) return sendJSON(res, 403, { error: "Token invalide" });
      const role = token === meeting.token_host ? 'host' : 'guest';
      return sendJSON(res, 200, { valid: true, role, meeting: { id: meeting.id, room_id: meeting.room_id, titre: meeting.titre, duree_max_minutes: meeting.duree_max_minutes, statut: meeting.statut, started_at: meeting.started_at } });
    }

    /* GET /api/agenda/reminders — check & envoyer rappels dus */
    if (req.method === "GET" && pathname === "/api/agenda/reminders") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const now = new Date().toISOString();
      const dues = db.prepare(`
        SELECT r.*, e.titre, e.date_debut FROM agenda_reminders r
        LEFT JOIN agenda_events e ON r.event_id = e.id
        WHERE r.user_id=? AND r.sent=0 AND r.remind_at <= ?
      `).all(me.id, now);
      for (const rem of dues) {
        try {
          db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(
            me.id, 'agenda_rappel',
            `Rappel : ${rem.titre}`,
            `Votre événement "${rem.titre}" commence dans ${rem.type === '24h' ? '24 heures' : rem.type === '1h' ? '1 heure' : '15 minutes'}`,
            JSON.stringify({ event_id: rem.event_id })
          );
          db.prepare(`UPDATE agenda_reminders SET sent=1 WHERE id=?`).run(rem.id);
        } catch(e) {}
      }
      return sendJSON(res, 200, { reminders_sent: dues.length });
    }

    /* ============================================================
       MODULE PROJETS — cycle de vie (brouillon→en_attente→verification→validation→execution→evaluation→termine|rejete)
    ============================================================ */
    const STATUTS_PROJETS = ['brouillon','en_attente','verification','validation','execution','evaluation','termine','rejete'];
    const STATUT_TRANSITIONS = {
      brouillon:    ['en_attente'],
      en_attente:   ['verification','rejete'],
      verification: ['validation','rejete'],
      validation:   ['execution','rejete'],
      execution:    ['evaluation'],
      evaluation:   ['termine'],
      termine:      [],
      rejete:       ['en_attente']
    };

    /* GET /api/projets — liste selon rôle */
    if (req.method === 'GET' && pathname === '/api/projets') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise' });
      const q = parsed.query;
      let rows;
      if (me.role === 'administrateur' || me.role === 'collectivite') {
        const statut = q.statut || null;
        const sql = statut
          ? `SELECT p.*, u.nom AS createur_nom, u.role AS createur_role FROM projets p JOIN users u ON u.id=p.createur_id WHERE p.statut=? ORDER BY p.updated_at DESC`
          : `SELECT p.*, u.nom AS createur_nom, u.role AS createur_role FROM projets p JOIN users u ON u.id=p.createur_id ORDER BY p.updated_at DESC`;
        rows = statut ? db.prepare(sql).all(statut) : db.prepare(sql).all();
      } else {
        rows = db.prepare(`SELECT p.*, u.nom AS createur_nom FROM projets p JOIN users u ON u.id=p.createur_id WHERE p.createur_id=? ORDER BY p.updated_at DESC`).all(me.id);
      }
      return sendJSON(res, 200, { projets: rows });
    }

    /* POST /api/projets — créer */
    if (req.method === 'POST' && pathname === '/api/projets') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise' });
      const { titre, description, type, categorie, pays, region, ville, budget_estime, date_debut, date_fin, tags } = body;
      if (!titre) return sendJSON(res, 400, { error: 'Titre obligatoire' });
      const r = db.prepare(`INSERT INTO projets (titre,description,type,categorie,pays,region,ville,budget_estime,date_debut,date_fin,tags,createur_id,statut) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'brouillon')`)
        .run(titre, description||null, type||'projet', categorie||'Général', pays||null, region||null, ville||null, budget_estime||null, date_debut||null, date_fin||null, JSON.stringify(tags||[]), me.id);
      return sendJSON(res, 201, { id: r.lastInsertRowid });
    }

    /* GET /api/projets/stats — stats cockpit */
    if (req.method === 'GET' && pathname === '/api/projets/stats') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise' });
      let stats;
      if (me.role === 'administrateur' || me.role === 'collectivite') {
        const total = db.prepare(`SELECT COUNT(*) AS n FROM projets`).get().n;
        const en_attente = db.prepare(`SELECT COUNT(*) AS n FROM projets WHERE statut='en_attente'`).get().n;
        const validation = db.prepare(`SELECT COUNT(*) AS n FROM projets WHERE statut='validation'`).get().n;
        const execution = db.prepare(`SELECT COUNT(*) AS n FROM projets WHERE statut='execution'`).get().n;
        const termine = db.prepare(`SELECT COUNT(*) AS n FROM projets WHERE statut='termine'`).get().n;
        const rejete = db.prepare(`SELECT COUNT(*) AS n FROM projets WHERE statut='rejete'`).get().n;
        stats = { total, en_attente, validation, execution, termine, rejete };
      } else {
        const mes = db.prepare(`SELECT statut, COUNT(*) AS n FROM projets WHERE createur_id=? GROUP BY statut`).all(me.id);
        stats = { total: 0, brouillon: 0, en_attente: 0, execution: 0, termine: 0 };
        mes.forEach(r => { stats[r.statut] = r.n; stats.total += r.n; });
      }
      return sendJSON(res, 200, stats);
    }

    /* GET /api/projets/:id */
    if (req.method === 'GET' && /^\/api\/projets\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise' });
      const id = parseInt(pathname.split('/')[3]);
      const p = db.prepare(`SELECT p.*, u.nom AS createur_nom FROM projets p JOIN users u ON u.id=p.createur_id WHERE p.id=?`).get(id);
      if (!p) return sendJSON(res, 404, { error: 'Projet introuvable' });
      if (p.createur_id !== me.id && me.role !== 'administrateur' && me.role !== 'collectivite') return sendJSON(res, 403, { error: 'Accès refusé' });
      const commentaires = db.prepare(`SELECT pc.*, u.nom AS auteur_nom FROM projets_commentaires pc JOIN users u ON u.id=pc.auteur_id WHERE pc.projet_id=? ORDER BY pc.created_at`).all(id);
      return sendJSON(res, 200, { projet: p, commentaires });
    }

    /* PUT /api/projets/:id — modifier */
    if (req.method === 'PUT' && /^\/api\/projets\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise' });
      const id = parseInt(pathname.split('/')[3]);
      const p = db.prepare(`SELECT * FROM projets WHERE id=?`).get(id);
      if (!p) return sendJSON(res, 404, { error: 'Projet introuvable' });
      if (p.createur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Accès refusé' });
      const { titre, description, type, categorie, pays, region, ville, budget_estime, date_debut, date_fin, tags } = body;
      db.prepare(`UPDATE projets SET titre=?,description=?,type=?,categorie=?,pays=?,region=?,ville=?,budget_estime=?,date_debut=?,date_fin=?,tags=?,updated_at=datetime('now') WHERE id=?`)
        .run(titre||p.titre, description??p.description, type||p.type, categorie||p.categorie, pays??p.pays, region??p.region, ville??p.ville, budget_estime??p.budget_estime, date_debut??p.date_debut, date_fin??p.date_fin, JSON.stringify(tags||JSON.parse(p.tags||'[]')), id);
      return sendJSON(res, 200, { updated: true });
    }

    /* PUT /api/projets/:id/statut — transition lifecycle */
    if (req.method === 'PUT' && /^\/api\/projets\/\d+\/statut$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise' });
      const id = parseInt(pathname.split('/')[3]);
      const p = db.prepare(`SELECT * FROM projets WHERE id=?`).get(id);
      if (!p) return sendJSON(res, 404, { error: 'Projet introuvable' });
      const { statut, commentaire, motif_rejet } = body;
      if (!STATUTS_PROJETS.includes(statut)) return sendJSON(res, 400, { error: 'Statut invalide' });
      const allowed = STATUT_TRANSITIONS[p.statut] || [];
      const isOwner = p.createur_id === me.id;
      const isValidator = me.role === 'administrateur' || me.role === 'collectivite';
      if (!isValidator && !(isOwner && statut === 'en_attente' && p.statut === 'brouillon')) {
        if (!allowed.includes(statut)) return sendJSON(res, 403, { error: 'Transition non autorisée' });
        if (!isValidator) return sendJSON(res, 403, { error: 'Action réservée aux validateurs' });
      }
      db.prepare(`UPDATE projets SET statut=?,motif_rejet=?,validateur_id=?,date_validation=datetime('now'),updated_at=datetime('now') WHERE id=?`)
        .run(statut, motif_rejet||null, isValidator ? me.id : null, id);
      if (commentaire) {
        db.prepare(`INSERT INTO projets_commentaires (projet_id,auteur_id,contenu,type) VALUES (?,?,?,?)`)
          .run(id, me.id, commentaire, statut === 'rejete' ? 'rejet' : 'validation');
      }
      return sendJSON(res, 200, { updated: true, statut });
    }

    /* POST /api/projets/:id/commentaires */
    if (req.method === 'POST' && /^\/api\/projets\/\d+\/commentaires$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise' });
      const id = parseInt(pathname.split('/')[3]);
      const { contenu } = body;
      if (!contenu) return sendJSON(res, 400, { error: 'Contenu obligatoire' });
      db.prepare(`INSERT INTO projets_commentaires (projet_id,auteur_id,contenu) VALUES (?,?,?)`).run(id, me.id, contenu);
      return sendJSON(res, 201, { ok: true });
    }

    /* DELETE /api/projets/:id */
    if (req.method === 'DELETE' && /^\/api\/projets\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise' });
      const id = parseInt(pathname.split('/')[3]);
      const p = db.prepare(`SELECT * FROM projets WHERE id=?`).get(id);
      if (!p) return sendJSON(res, 404, { error: 'Projet introuvable' });
      if (p.createur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Accès refusé' });
      db.prepare(`DELETE FROM projets WHERE id=?`).run(id);
      return sendJSON(res, 200, { deleted: true });
    }

    /* ═══════════════════════════════════════════════════════════
       MODULE BILLETTERIE — ÉVÉNEMENTS / TICKETS / SCANNER
    ═══════════════════════════════════════════════════════════ */

    /* ── GET /api/events — liste publique ── */
    if (req.method === 'GET' && pathname === '/api/events') {
      const q = Object.fromEntries(new URL('http://x'+req.url).searchParams);
      let sql = `SELECT e.*, u.nom AS organisateur_nom,
        (SELECT COUNT(*) FROM tickets t WHERE t.event_id=e.id AND t.payment_status='paid') AS billets_vendus,
        (SELECT COUNT(*) FROM ticket_types tt WHERE tt.event_id=e.id AND tt.actif=1) AS nb_types
        FROM events e LEFT JOIN users u ON u.id=e.organisateur_id WHERE 1=1`;
      const args = [];
      if (q.statut) { sql += ' AND e.statut=?'; args.push(q.statut); }
      else { sql += " AND e.statut IN ('publie','ferme')"; }
      if (q.pays) { sql += ' AND e.pays=?'; args.push(q.pays); }
      if (q.categorie) { sql += ' AND e.categorie=?'; args.push(q.categorie); }
      if (q.organisateur_id) { sql += ' AND e.organisateur_id=?'; args.push(q.organisateur_id); }
      if (q.all === '1') { sql = sql.replace("AND e.statut IN ('publie','ferme')", ''); }
      if (q.mine === '1') {
        const me = getCurrentUser(req);
        if (me) { sql += ' AND e.organisateur_id=?'; args.push(me.id); sql = sql.replace("AND e.statut IN ('publie','ferme')", ''); }
      }
      sql += ' ORDER BY e.date_debut ASC LIMIT 100';
      const events = db.prepare(sql).all(...args);
      return sendJSON(res, 200, { events });
    }

    /* ── GET /api/events/stats — admin stats globales ── */
    if (req.method === 'GET' && pathname === '/api/events/stats') {
      const me = getCurrentUser(req);
      if (!me || !['administrateur','collectivite'].includes(me.role)) return sendJSON(res, 403, { error: 'Réservé.' });
      const total_events = db.prepare("SELECT COUNT(*) n FROM events").get().n;
      const publies = db.prepare("SELECT COUNT(*) n FROM events WHERE statut='publie'").get().n;
      const total_tickets = db.prepare("SELECT COUNT(*) n FROM tickets WHERE payment_status='paid'").get().n;
      const revenu_total = db.prepare("SELECT COALESCE(SUM(prix_paye),0) n FROM tickets WHERE payment_status='paid'").get().n;
      const commission_total = db.prepare("SELECT COALESCE(SUM(commission),0) n FROM tickets WHERE payment_status='paid'").get().n;
      const par_pays = db.prepare(`SELECT pays, COUNT(*) n FROM events WHERE pays IS NOT NULL GROUP BY pays ORDER BY n DESC LIMIT 10`).all();
      const top_events = db.prepare(`SELECT e.titre, COUNT(t.id) nb_billets, COALESCE(SUM(t.prix_paye),0) revenu
        FROM events e LEFT JOIN tickets t ON t.event_id=e.id AND t.payment_status='paid'
        GROUP BY e.id ORDER BY revenu DESC LIMIT 10`).all();
      return sendJSON(res, 200, { total_events, publies, total_tickets, revenu_total, commission_total, par_pays, top_events });
    }

    /* ── POST /api/events — créer un événement ── */
    if (req.method === 'POST' && pathname === '/api/events') {
      const me = getCurrentUser(req);
      if (!me || !['initiative','administrateur'].includes(me.role)) return sendJSON(res, 403, { error: 'Réservé aux initiatives.' });
      const { titre, description, pays, ville, adresse, date_debut, date_fin, capacite, categorie, image_b64, ticket_types } = body;
      if (!titre || !date_debut) return sendJSON(res, 400, { error: 'Titre et date_debut requis.' });
      const ts = new Date().toISOString();
      const eid = db.prepare(`INSERT INTO events (titre,description,organisateur_id,pays,ville,adresse,date_debut,date_fin,capacite,categorie,image_b64,statut,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,'brouillon',?,?)`)
        .run(titre, description||null, me.id, pays||null, ville||null, adresse||null, date_debut, date_fin||null, capacite||0, categorie||'Général', image_b64||null, ts, ts).lastInsertRowid;
      if (Array.isArray(ticket_types)) {
        for (const tt of ticket_types) {
          if (!tt.nom || tt.prix == null) continue;
          db.prepare(`INSERT INTO ticket_types (event_id,nom,description,prix,quantite_totale,type) VALUES (?,?,?,?,?,?)`)
            .run(eid, tt.nom, tt.description||null, parseFloat(tt.prix)||0, parseInt(tt.quantite)||100, tt.type||'standard');
        }
      }
      return sendJSON(res, 201, { id: eid });
    }

    /* ── GET /api/events/:id ── */
    if (req.method === 'GET' && /^\/api\/events\/\d+$/.test(pathname)) {
      const eid = parseInt(pathname.split('/')[3]);
      const ev = db.prepare(`SELECT e.*, u.nom AS organisateur_nom FROM events e LEFT JOIN users u ON u.id=e.organisateur_id WHERE e.id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Événement introuvable.' });
      const types = db.prepare(`SELECT tt.*, (tt.quantite_totale - tt.quantite_vendue) AS dispo FROM ticket_types tt WHERE tt.event_id=? AND tt.actif=1`).all(eid);
      const stats = db.prepare(`SELECT COUNT(*) nb, COALESCE(SUM(prix_paye),0) revenu FROM tickets WHERE event_id=? AND payment_status='paid'`).get(eid);
      return sendJSON(res, 200, { event: ev, ticket_types: types, stats });
    }

    /* ── PUT /api/events/:id ── */
    if (req.method === 'PUT' && /^\/api\/events\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/')[3]);
      const ev = db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Introuvable.' });
      if (ev.organisateur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Accès refusé.' });
      const { titre, description, pays, ville, adresse, date_debut, date_fin, capacite, categorie, image_b64, statut } = body;
      db.prepare(`UPDATE events SET titre=COALESCE(?,titre), description=COALESCE(?,description), pays=COALESCE(?,pays), ville=COALESCE(?,ville), adresse=COALESCE(?,adresse), date_debut=COALESCE(?,date_debut), date_fin=COALESCE(?,date_fin), capacite=COALESCE(?,capacite), categorie=COALESCE(?,categorie), image_b64=COALESCE(?,image_b64), statut=COALESCE(?,statut), updated_at=datetime('now') WHERE id=?`)
        .run(titre||null, description||null, pays||null, ville||null, adresse||null, date_debut||null, date_fin||null, capacite||null, categorie||null, image_b64||null, statut||null, eid);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── POST /api/events/:id/ticket-types ── */
    if (req.method === 'POST' && /^\/api\/events\/\d+\/ticket-types$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/')[3]);
      const ev = db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Introuvable.' });
      if (ev.organisateur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Accès refusé.' });
      const { nom, description: desc, prix, quantite, type } = body;
      if (!nom || prix == null) return sendJSON(res, 400, { error: 'Nom et prix requis.' });
      const id = db.prepare(`INSERT INTO ticket_types (event_id,nom,description,prix,quantite_totale,type) VALUES (?,?,?,?,?,?)`)
        .run(eid, nom, desc||null, parseFloat(prix)||0, parseInt(quantite)||100, type||'standard').lastInsertRowid;
      return sendJSON(res, 201, { id });
    }

    /* ── POST /api/events/:id/buy — achat billet ── */
    if (req.method === 'POST' && /^\/api\/events\/\d+\/buy$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/')[3]);
      const { ticket_type_id } = body;
      if (!ticket_type_id) return sendJSON(res, 400, { error: 'ticket_type_id requis.' });
      const ev = db.prepare(`SELECT * FROM events WHERE id=? AND statut='publie'`).get(eid);
      if (!ev) return sendJSON(res, 400, { error: 'Événement non disponible.' });
      const tt = db.prepare(`SELECT * FROM ticket_types WHERE id=? AND event_id=? AND actif=1`).get(ticket_type_id, eid);
      if (!tt) return sendJSON(res, 400, { error: 'Type de billet introuvable.' });
      if (tt.quantite_totale > 0 && tt.quantite_vendue >= tt.quantite_totale) return sendJSON(res, 400, { error: 'Billets épuisés.' });
      /* Anti-doublon : 1 billet par utilisateur par type */
      const existing = db.prepare(`SELECT id FROM tickets WHERE user_id=? AND ticket_type_id=? AND payment_status='paid' AND statut='valid'`).get(me.id, ticket_type_id);
      if (existing) return sendJSON(res, 409, { error: 'Vous possédez déjà un billet pour ce type.' });
      const commission = parseFloat((tt.prix * ev.commission_pct / 100).toFixed(2));
      const ts = new Date().toISOString();
      const tempSig = crypto.randomBytes(8).toString('hex'); // placeholder pour l'ID
      const tid = db.prepare(`INSERT INTO tickets (event_id,user_id,ticket_type_id,prix_paye,commission,payment_status,statut,qr_token,created_at) VALUES (?,?,?,?,?,'paid','valid',?,?)`)
        .run(eid, me.id, tt.id, tt.prix, commission, tempSig, ts).lastInsertRowid;
      /* Générer vrai QR token maintenant qu'on a l'ID */
      const qrToken = signTicket(tid, eid, ts);
      db.prepare(`UPDATE tickets SET qr_token=? WHERE id=?`).run(qrToken, tid);
      db.prepare(`UPDATE ticket_types SET quantite_vendue=quantite_vendue+1 WHERE id=?`).run(tt.id);
      /* Enregistrement participant (immuable) */
      db.prepare(`INSERT OR IGNORE INTO event_attendees (ticket_id,event_id,user_id,nom_display,pays) VALUES (?,?,?,?,?)`)
        .run(tid, eid, me.id, me.nom, me.pays||null);
      /* ── SPLIT AUTOMATIQUE : 5% plateforme / 95% initiative ── */
      const COMMISSION_RATE = 0.05;
      const platform_fee    = parseFloat((tt.prix * COMMISSION_RATE).toFixed(2));
      const organizer_amount = parseFloat((tt.prix - platform_fee).toFixed(2));

      /* Ledger immuable — 2 lignes : une pour la plateforme, une pour l'initiative */
      const walletBase = { ticket_id: tid, event_id: eid, commission_rate: COMMISSION_RATE, prix_billet: tt.prix, platform_fee, organizer_amount };
      db.prepare(`INSERT INTO wallet_transactions (ticket_id,event_id,type,beneficiaire_id,montant,commission_rate,prix_billet,platform_fee,organizer_amount) VALUES (?,?,'platform_fee',NULL,?,?,?,?,?)`)
        .run(tid, eid, platform_fee, COMMISSION_RATE, tt.prix, platform_fee, organizer_amount);
      db.prepare(`INSERT INTO wallet_transactions (ticket_id,event_id,type,beneficiaire_id,montant,commission_rate,prix_billet,platform_fee,organizer_amount) VALUES (?,?,'organizer_credit',?,?,?,?,?,?)`)
        .run(tid, eid, ev.organisateur_id, organizer_amount, COMMISSION_RATE, tt.prix, platform_fee, organizer_amount);

      /* Créditer wallet initiative (+95%) */
      db.prepare(`UPDATE users SET wallet_balance = COALESCE(wallet_balance,0) + ? WHERE id = ?`).run(organizer_amount, ev.organisateur_id);

      /* Créditer platform_wallet (+5%) */
      db.prepare(`UPDATE platform_wallet SET total_commissions = total_commissions + ?, total_transactions = total_transactions + 1, updated_at = datetime('now') WHERE id = 1`).run(platform_fee);

      /* Transaction financière (audit) */
      try {
        db.prepare(`INSERT INTO transactions (user_id,type,montant,statut,description,date_transaction) VALUES (?,'billet_evenement',?,?,'reussi',?)`)
          .run(me.id, tt.prix, 'billet_evenement', ts);
      } catch(e) { /* table transactions peut avoir schema différent */ }

      return sendJSON(res, 201, { ticket_id: tid, qr_token: qrToken, prix: tt.prix, platform_fee, organizer_amount });
    }

    /* ── GET /api/tickets/mes — mes billets ── */
    if (req.method === 'GET' && pathname === '/api/tickets/mes') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const tickets = db.prepare(`SELECT t.*, e.titre AS event_titre, e.date_debut, e.ville, e.pays, e.image_b64,
        tt.nom AS type_nom, tt.type AS type_cat
        FROM tickets t JOIN events e ON e.id=t.event_id JOIN ticket_types tt ON tt.id=t.ticket_type_id
        WHERE t.user_id=? ORDER BY t.created_at DESC`).all(me.id);
      return sendJSON(res, 200, { tickets });
    }

    /* ── GET /api/tickets/:id — détail + QR ── */
    if (req.method === 'GET' && /^\/api\/tickets\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const tid = parseInt(pathname.split('/')[3]);
      const t = db.prepare(`SELECT t.*, e.titre AS event_titre, e.date_debut, e.date_fin, e.ville, e.pays, e.adresse, u.nom AS user_nom, tt.nom AS type_nom, tt.type AS type_cat
        FROM tickets t JOIN events e ON e.id=t.event_id JOIN ticket_types tt ON tt.id=t.ticket_type_id JOIN users u ON u.id=t.user_id WHERE t.id=?`).get(tid);
      if (!t) return sendJSON(res, 404, { error: 'Billet introuvable.' });
      if (t.user_id !== me.id && !['administrateur','collectivite'].includes(me.role)) return sendJSON(res, 403, { error: 'Accès refusé.' });
      /* Payload QR encodé en base64 pour le frontend */
      const qrPayload = Buffer.from(JSON.stringify({ tid, eid: t.event_id, sig: t.qr_token })).toString('base64');
      return sendJSON(res, 200, { ticket: t, qr_payload: qrPayload });
    }

    /* ── GET /api/events/:id/attendees ── */
    if (req.method === 'GET' && /^\/api\/events\/\d+\/attendees$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/')[3]);
      const ev = db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Introuvable.' });
      if (ev.organisateur_id !== me.id && !['administrateur','collectivite'].includes(me.role)) return sendJSON(res, 403, { error: 'Accès refusé.' });
      const attendees = db.prepare(`SELECT a.*, t.prix_paye, t.statut AS ticket_statut, t.created_at AS achat_date, tt.nom AS type_nom
        FROM event_attendees a JOIN tickets t ON t.id=a.ticket_id JOIN ticket_types tt ON tt.id=t.ticket_type_id
        WHERE a.event_id=? ORDER BY a.created_at DESC`).all(eid);
      return sendJSON(res, 200, { attendees });
    }

    /* ── GET /api/events/:id/checkins ── */
    if (req.method === 'GET' && /^\/api\/events\/\d+\/checkins$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/')[3]);
      const ev = db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Introuvable.' });
      if (ev.organisateur_id !== me.id && !['administrateur','collectivite'].includes(me.role)) return sendJSON(res, 403, { error: 'Accès refusé.' });
      const checkins = db.prepare(`SELECT c.*, a.nom_display, u.nom AS scanner_nom
        FROM event_checkins c LEFT JOIN event_attendees a ON a.ticket_id=c.ticket_id LEFT JOIN users u ON u.id=c.scanner_id
        WHERE c.event_id=? ORDER BY c.timestamp DESC LIMIT 200`).all(eid);
      const totaux = db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN resultat='accepted' THEN 1 ELSE 0 END) accepted FROM event_checkins WHERE event_id=?`).get(eid);
      return sendJSON(res, 200, { checkins, totaux });
    }

    /* ── POST /api/scanner/validate — valider QR code ── */
    if (req.method === 'POST' && pathname === '/api/scanner/validate') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      if (!['initiative','administrateur','collectivite'].includes(me.role)) return sendJSON(res, 403, { error: 'Rôle non autorisé à scanner.' });
      const { qr_payload } = body;
      if (!qr_payload) return sendJSON(res, 400, { error: 'qr_payload manquant.' });
      let parsed;
      try { parsed = JSON.parse(Buffer.from(qr_payload, 'base64').toString()); } catch(e) { return sendJSON(res, 400, { error: 'QR code illisible.' }); }
      const { tid, eid, sig } = parsed;
      if (!tid || !eid || !sig) return sendJSON(res, 400, { error: 'QR code incomplet.' });
      const ticket = db.prepare(`SELECT t.*, e.organisateur_id FROM tickets t JOIN events e ON e.id=t.event_id WHERE t.id=? AND t.event_id=?`).get(tid, eid);

      const logRejection = (motif) => {
        try { db.prepare(`INSERT INTO event_checkins (ticket_id,event_id,scanner_id,resultat,motif_rejet) VALUES (?,?,?,'rejected',?)`).run(tid||0, eid||0, me.id, motif); } catch(e){}
        return sendJSON(res, 200, { valid: false, motif });
      };

      if (!ticket) return logRejection('Billet introuvable ou mauvais événement');
      /* Vérifier autorisation scanner : organisateur ou admin */
      if (ticket.organisateur_id !== me.id && !['administrateur','collectivite'].includes(me.role)) return sendJSON(res, 403, { error: 'Non autorisé pour cet événement.' });
      /* Vérifier signature HMAC */
      const expectedSig = signTicket(tid, eid, ticket.created_at);
      if (sig !== expectedSig) return logRejection('Signature QR invalide — billet falsifié');
      if (ticket.payment_status !== 'paid') return logRejection('Paiement non confirmé');
      if (ticket.statut === 'used') return logRejection('Billet déjà utilisé');
      if (ticket.statut === 'cancelled') return logRejection('Billet annulé');
      /* ✅ Valide — marquer comme utilisé + log immuable */
      db.prepare(`UPDATE tickets SET statut='used' WHERE id=?`).run(tid);
      db.prepare(`INSERT INTO event_checkins (ticket_id,event_id,scanner_id,resultat) VALUES (?,?,?,'accepted')`).run(tid, eid, me.id);
      const attendee = db.prepare(`SELECT nom_display FROM event_attendees WHERE ticket_id=?`).get(tid);
      return sendJSON(res, 200, { valid: true, nom: attendee?.nom_display || 'Participant', ticket_id: tid });
    }

    /* ── GET /api/wallet/balance — solde wallet initiative ── */
    if (req.method === 'GET' && pathname === '/api/wallet/balance') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const user = db.prepare(`SELECT wallet_balance FROM users WHERE id=?`).get(me.id);
      const historique = db.prepare(`SELECT wt.*, e.titre AS event_titre FROM wallet_transactions wt LEFT JOIN events e ON e.id=wt.event_id WHERE wt.beneficiaire_id=? AND wt.type='organizer_credit' ORDER BY wt.timestamp DESC LIMIT 50`).all(me.id);
      return sendJSON(res, 200, { balance: user?.wallet_balance || 0, commission_rate: 0.05, historique });
    }

    /* ── GET /api/admin/wallet — wallet plateforme (admin only) ── */
    if (req.method === 'GET' && pathname === '/api/admin/wallet') {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Réservé.' });
      const pw = db.prepare(`SELECT * FROM platform_wallet WHERE id=1`).get();
      const par_event = db.prepare(`SELECT e.titre, e.pays, COUNT(wt.id) nb_transactions, COALESCE(SUM(wt.montant),0) total_fees FROM wallet_transactions wt JOIN events e ON e.id=wt.event_id WHERE wt.type='platform_fee' GROUP BY wt.event_id ORDER BY total_fees DESC LIMIT 20`).all();
      const par_pays = db.prepare(`SELECT e.pays, COUNT(wt.id) nb, COALESCE(SUM(wt.montant),0) total FROM wallet_transactions wt JOIN events e ON e.id=wt.event_id WHERE wt.type='platform_fee' AND e.pays IS NOT NULL GROUP BY e.pays ORDER BY total DESC LIMIT 10`).all();
      const historique = db.prepare(`SELECT wt.*, e.titre AS event_titre, u.nom AS organisateur_nom FROM wallet_transactions wt LEFT JOIN events e ON e.id=wt.event_id LEFT JOIN users u ON u.id=wt.beneficiaire_id WHERE wt.type='platform_fee' ORDER BY wt.timestamp DESC LIMIT 100`).all();
      return sendJSON(res, 200, { wallet: pw, par_event, par_pays, historique });
    }

    /* ── GET /api/admin/events ── */
    if (req.method === 'GET' && pathname === '/api/admin/events') {
      const me = getCurrentUser(req);
      if (!me || !['administrateur'].includes(me.role)) return sendJSON(res, 403, { error: 'Réservé.' });
      const events = db.prepare(`SELECT e.*, u.nom AS organisateur_nom,
        (SELECT COUNT(*) FROM tickets t WHERE t.event_id=e.id AND t.payment_status='paid') nb_billets,
        (SELECT COALESCE(SUM(prix_paye),0) FROM tickets t WHERE t.event_id=e.id AND t.payment_status='paid') revenu
        FROM events e LEFT JOIN users u ON u.id=e.organisateur_id ORDER BY e.created_at DESC LIMIT 200`).all();
      return sendJSON(res, 200, { events });
    }

    /* ── GET /api/events/:id/financier — tableau de bord financier d'un événement ── */
    if (req.method === 'GET' && /^\/api\/events\/\d+\/financier$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/')[3]);
      const ev = db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Événement introuvable.' });
      if (ev.organisateur_id !== me.id && !['administrateur','collectivite'].includes(me.role))
        return sendJSON(res, 403, { error: 'Accès refusé.' });

      const kpis = db.prepare(`SELECT
        COUNT(*) AS nb_billets,
        COALESCE(SUM(prix_paye),0) AS ca_brut,
        COALESCE(SUM(commission),0) AS total_commission,
        COALESCE(SUM(prix_paye - commission),0) AS revenu_net,
        SUM(CASE WHEN statut='valid' THEN 1 ELSE 0 END) AS billets_valides,
        SUM(CASE WHEN statut='used'  THEN 1 ELSE 0 END) AS billets_utilises,
        SUM(CASE WHEN statut='cancelled' THEN 1 ELSE 0 END) AS billets_annules
        FROM tickets WHERE event_id=? AND payment_status='paid'`).get(eid);

      const par_type = db.prepare(`SELECT tt.nom, tt.type, COUNT(t.id) AS nb_vendus,
        COALESCE(SUM(t.prix_paye),0) AS ca, tt.prix, tt.quantite, tt.quantite_vendue
        FROM ticket_types tt LEFT JOIN tickets t ON t.ticket_type_id=tt.id AND t.payment_status='paid'
        WHERE tt.event_id=? GROUP BY tt.id ORDER BY ca DESC`).all(eid);

      const par_jour = db.prepare(`SELECT DATE(created_at) AS jour, COUNT(*) AS nb,
        COALESCE(SUM(prix_paye),0) AS ca
        FROM tickets WHERE event_id=? AND payment_status='paid'
        GROUP BY DATE(created_at) ORDER BY jour ASC`).all(eid);

      const checkins = db.prepare(`SELECT COUNT(*) total,
        SUM(CASE WHEN resultat='accepted' THEN 1 ELSE 0 END) accepted
        FROM event_checkins WHERE event_id=?`).get(eid);

      const derniers_achats = db.prepare(`SELECT t.id, t.prix_paye, t.statut, t.created_at,
        u.nom AS acheteur, tt.nom AS type_nom
        FROM tickets t JOIN users u ON u.id=t.user_id JOIN ticket_types tt ON tt.id=t.ticket_type_id
        WHERE t.event_id=? AND t.payment_status='paid' ORDER BY t.created_at DESC LIMIT 20`).all(eid);

      return sendJSON(res, 200, { event: ev, kpis, par_type, par_jour, checkins, derniers_achats });
    }

    /* ── GET /api/dashboard/financier — tableau de bord global billetterie (initiative) ── */
    if (req.method === 'GET' && pathname === '/api/dashboard/financier') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });

      const events = db.prepare(`SELECT e.id, e.titre, e.date_debut, e.statut, e.pays, e.ville,
        (SELECT COUNT(*) FROM tickets t WHERE t.event_id=e.id AND t.payment_status='paid') AS nb_billets,
        (SELECT COALESCE(SUM(prix_paye),0) FROM tickets t WHERE t.event_id=e.id AND t.payment_status='paid') AS ca_brut,
        (SELECT COALESCE(SUM(prix_paye-commission),0) FROM tickets t WHERE t.event_id=e.id AND t.payment_status='paid') AS revenu_net,
        (SELECT COUNT(*) FROM event_checkins c WHERE c.event_id=e.id AND c.resultat='accepted') AS nb_entrees
        FROM events e WHERE e.organisateur_id=? ORDER BY e.date_debut DESC LIMIT 50`).all(me.id);

      const totaux = events.reduce((a, e) => ({
        nb_billets: a.nb_billets + (e.nb_billets||0),
        ca_brut: a.ca_brut + (e.ca_brut||0),
        revenu_net: a.revenu_net + (e.revenu_net||0),
        nb_entrees: a.nb_entrees + (e.nb_entrees||0),
      }), { nb_billets:0, ca_brut:0, revenu_net:0, nb_entrees:0 });

      const wallet = db.prepare(`SELECT wallet_balance FROM users WHERE id=?`).get(me.id);

      const par_mois = db.prepare(`SELECT strftime('%Y-%m', t.created_at) AS mois,
        COUNT(*) AS nb, COALESCE(SUM(prix_paye),0) AS ca
        FROM tickets t JOIN events e ON e.id=t.event_id
        WHERE e.organisateur_id=? AND t.payment_status='paid'
        GROUP BY mois ORDER BY mois DESC LIMIT 12`).all(me.id);

      return sendJSON(res, 200, { events, totaux, wallet_balance: wallet?.wallet_balance||0, par_mois });
    }

    /* ============================================================
       TRUST SCORE · RÉACTIVITÉ · ABSENCE · SIGNALEMENTS
    ============================================================ */

    /* ── Calcul du Trust Score (fonction partagée) ── */
    function computeTrustScore(userId) {
      const user = db.prepare(`SELECT *,
        CAST((julianday('now') - julianday(COALESCE(created_at,datetime('now')))) / 30 AS INTEGER) AS months_old
        FROM users WHERE id=?`).get(userId);
      if (!user) return { score: 0, detail: [], label: 'Inconnu' };

      const detail = [];
      let total = 0;

      // Ancienneté max 15 pts (1 pt/mois)
      const anciennete = Math.min(15, user.months_old || 0);
      if (anciennete > 0) detail.push({ icon:'🕐', label:`Ancienneté : ${user.months_old} mois`, pts: anciennete, max: 15 });

      // Vérifications identité
      if (user.is_verified || user.identite_verifiee) { total += 15; detail.push({ icon:'✅', label:'Identité vérifiée', pts:15, max:15 }); }
      if (user.documents_verifies)  { total += 10; detail.push({ icon:'📄', label:'Documents vérifiés', pts:10, max:10 }); }
      if (user.diplomes_verifies)   { total += 10; detail.push({ icon:'🎓', label:'Diplômes vérifiés', pts:10, max:10 }); }
      if (user.entreprise_verifiee) { total += 8;  detail.push({ icon:'🏢', label:'Entreprise vérifiée', pts:8, max:8 }); }
      total += anciennete;

      // Accréditations DA max 20 pts
      const nbAccred = db.prepare(`SELECT COUNT(*) n FROM compte_accreditations WHERE user_id=? AND statut='active'`).get(userId)?.n || 0;
      const accredPts = Math.min(20, nbAccred * 10);
      if (accredPts > 0) detail.push({ icon:'🏅', label:`${nbAccred} accréditation(s) Diaspo'Actif`, pts: accredPts, max:20 });
      total += accredPts;

      // Initiative immatriculée 8 pts
      const init = db.prepare(`SELECT numero_immatriculation FROM initiatives WHERE owner_user_id=?`).get(userId);
      if (init?.numero_immatriculation) { total += 8; detail.push({ icon:'🏛️', label:'Initiative officiellement immatriculée', pts:8, max:8 }); }

      // Activité plateforme max 10 pts
      const nbPosts = db.prepare(`SELECT COUNT(*) n FROM fil_posts WHERE auteur_id=?`).get(userId)?.n || 0;
      const nbCollabs = db.prepare(`SELECT COUNT(*) n FROM candidatures WHERE user_id=? AND statut IN ('retenu','accepte')`).get(userId)?.n || 0;
      const nbFollowers = db.prepare(`SELECT COUNT(*) n FROM user_follows WHERE followed_id=?`).get(userId)?.n || 0;
      const activPts = Math.min(10, Math.floor(nbPosts/5) + nbCollabs * 2 + Math.floor(nbFollowers/10));
      if (activPts > 0) detail.push({ icon:'📊', label:`Activité : ${nbPosts} publications, ${nbFollowers} abonnés`, pts: activPts, max:10 });
      total += activPts;

      // Profil complet max 6 pts
      let complete = 0;
      if (user.photo_url)              complete++;
      if (user.bio?.length > 60)       complete += 2;
      if (user.titre_pro)              complete++;
      if (user.competences?.length > 5) complete++;
      if (user.ville)                  complete++;
      const completePts = Math.min(6, complete);
      if (completePts > 0) detail.push({ icon:'👤', label:'Profil complet', pts: completePts, max:6 });
      total += completePts;

      // Absence de signalements 5 pts
      const nbSignal = user.signalements_confirmes || 0;
      if (nbSignal === 0) { total += 5; detail.push({ icon:'✅', label:'Aucun signalement confirmé', pts:5, max:5 }); }
      else                detail.push({ icon:'⚠️', label:`${nbSignal} signalement(s) confirmé(s)`, pts:0, max:5, warning:true });

      const score = Math.min(100, Math.round(total));
      const label = score >= 90 ? 'Excellent' : score >= 75 ? 'Élevé' : score >= 50 ? 'Moyen' : 'Faible';
      const color = score >= 90 ? '#10b981' : score >= 75 ? '#f59e0b' : score >= 50 ? '#6366f1' : '#ef4444';

      // Mise en cache
      try {
        db.prepare(`INSERT OR REPLACE INTO trust_cache (user_id,score,detail_json,label,computed_at) VALUES (?,?,?,?,datetime('now'))`)
          .run(userId, score, JSON.stringify(detail), label);
        db.prepare(`UPDATE users SET trust_score=?, trust_computed_at=datetime('now') WHERE id=?`).run(score, userId);
      } catch(e){}

      return { score, detail, label, color };
    }

    /* ── Calcul Réactivité (fonction partagée) ── */
    function computeReactivity(userId) {
      const msgs = db.prepare(`
        SELECT m.auteur_id, m.created_at, m.conversation_id
        FROM messages m
        JOIN conversations c ON c.id=m.conversation_id
        WHERE (c.user1_id=? OR c.user2_id=?) AND m.created_at >= datetime('now','-90 days')
        ORDER BY m.conversation_id, m.created_at ASC
      `).all(userId, userId);

      if (!msgs.length) {
        const lastActive = db.prepare(`SELECT last_active FROM users WHERE id=?`).get(userId)?.last_active;
        return { stars: 0, label: 'Aucune donnée disponible', avg_hours: null, lastActive };
      }

      // Regrouper par conversation
      const convs = {};
      msgs.forEach(m => { (convs[m.conversation_id] = convs[m.conversation_id]||[]).push(m); });

      const responseTimes = [];
      let unanswered = 0;
      const now = Date.now();

      for (const msgList of Object.values(convs)) {
        for (let i = 0; i < msgList.length - 1; i++) {
          const curr = msgList[i], next = msgList[i+1];
          if (curr.auteur_id !== userId && next.auteur_id === userId) {
            const h = (new Date(next.created_at) - new Date(curr.created_at)) / 3600000;
            if (h >= 0 && h < 720) responseTimes.push(h);
          }
        }
        const last = msgList[msgList.length - 1];
        if (last.auteur_id !== userId) {
          const daysOld = (now - new Date(last.created_at)) / 86400000;
          if (daysOld > 5) unanswered++;
        }
      }

      const avgHours = responseTimes.length
        ? responseTimes.reduce((s,t) => s+t, 0) / responseTimes.length
        : null;

      let stars, label;
      if (avgHours === null) { stars = 3; label = 'Données limitées'; }
      else if (avgHours < 2)  { stars = 5; label = 'Répond généralement en moins de 2 heures'; }
      else if (avgHours < 12) { stars = 5; label = 'Répond généralement en moins de 12 heures'; }
      else if (avgHours < 24) { stars = 4; label = 'Répond généralement sous 24 heures'; }
      else if (avgHours < 72) { stars = 3; label = `Répond généralement en 1 à 3 jours`; }
      else                    { stars = 2; label = `Réactivité moyenne : ${Math.round((avgHours||0)/24)} jours`; }

      if (unanswered >= 3) stars = Math.max(1, stars - 1);

      // Maj en base
      try {
        db.prepare(`UPDATE users SET reactivity_stars=?, avg_response_hours=? WHERE id=?`).run(stars, avgHours, userId);
      } catch(e){}

      return { stars, label, avg_hours: avgHours, unanswered };
    }

    /* ── GET /api/users/:id/trust-score ── */
    if (req.method === 'GET' && /^\/api\/users\/\d+\/trust-score$/.test(pathname)) {
      const uid = parseInt(pathname.split('/')[3]);
      // Check cache (5 minutes)
      const cached = db.prepare(`SELECT * FROM trust_cache WHERE user_id=? AND computed_at >= datetime('now','-5 minutes')`).get(uid);
      if (cached) {
        return sendJSON(res, 200, { score: cached.score, detail: JSON.parse(cached.detail_json||'[]'), label: cached.label });
      }
      const result = computeTrustScore(uid);
      const reactivity = computeReactivity(uid);
      return sendJSON(res, 200, { ...result, reactivity });
    }

    /* ── GET /api/users/:id/absence — mode absence public ── */
    if (req.method === 'GET' && /^\/api\/users\/\d+\/absence$/.test(pathname)) {
      const uid = parseInt(pathname.split('/')[3]);
      const absence = db.prepare(`SELECT * FROM user_absence WHERE user_id=? AND (fin IS NULL OR fin >= date('now'))`).get(uid);
      return sendJSON(res, 200, { absence: absence || null });
    }

    /* ── PUT /api/users/me/absence — activer mode absence ── */
    if (req.method === 'PUT' && pathname === '/api/users/me/absence') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const { mode, fin, message } = body;
      const MODES = ['vacances','deplacement','indisponible','mission','conge','autre'];
      if (!MODES.includes(mode)) return sendJSON(res, 400, { error: 'Mode invalide.' });
      db.prepare(`INSERT OR REPLACE INTO user_absence (user_id,mode,debut,fin,message,updated_at) VALUES (?,?,date('now'),?,?,datetime('now'))`)
        .run(me.id, mode, fin||null, message||null);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── DELETE /api/users/me/absence — désactiver mode absence ── */
    if (req.method === 'DELETE' && pathname === '/api/users/me/absence') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      db.prepare(`DELETE FROM user_absence WHERE user_id=?`).run(me.id);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── POST /api/users/:id/signaler — signaler compte inactif ── */
    if (req.method === 'POST' && /^\/api\/users\/\d+\/signaler$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const uid = parseInt(pathname.split('/')[3]);
      if (uid === me.id) return sendJSON(res, 400, { error: 'Vous ne pouvez pas vous signaler vous-même.' });

      // Vérif : mode absence actif ?
      const absence = db.prepare(`SELECT id FROM user_absence WHERE user_id=? AND (fin IS NULL OR fin >= date('now'))`).get(uid);
      if (absence) return sendJSON(res, 400, { error: 'Cet utilisateur est en mode absence. Aucun signalement possible.' });

      // Vérif : une conversation existe avec un message non répondu depuis 14 jours
      const conv = db.prepare(`
        SELECT c.id, MAX(m.created_at) AS last_from_me
        FROM conversations c
        JOIN messages m ON m.conversation_id=c.id
        WHERE ((c.user1_id=? AND c.user2_id=?) OR (c.user1_id=? AND c.user2_id=?))
          AND m.auteur_id=?
          AND m.created_at <= datetime('now','-14 days')
        HAVING last_from_me IS NOT NULL
      `).get(me.id, uid, uid, me.id, me.id);

      if (!conv) return sendJSON(res, 400, { error: 'Condition non remplie : vous devez avoir envoyé un message il y a au moins 14 jours sans réponse.' });

      // Vérif : pas déjà signalé
      const existing = db.prepare(`SELECT id FROM account_reports WHERE reporter_id=? AND reported_id=?`).get(me.id, uid);
      if (existing) return sendJSON(res, 400, { error: 'Vous avez déjà signalé ce compte.' });

      db.prepare(`INSERT INTO account_reports (reporter_id,reported_id,conv_id) VALUES (?,?,?)`).run(me.id, uid, conv.id);

      // Auto-action si plusieurs signalements (≥3 en 30 jours)
      const recentCount = db.prepare(`SELECT COUNT(*) n FROM account_reports WHERE reported_id=? AND created_at >= datetime('now','-30 days')`).get(uid).n;
      if (recentCount >= 3) {
        db.prepare(`UPDATE users SET last_active=NULL WHERE id=?`).run(uid);
      }
      return sendJSON(res, 201, { ok: true, message: 'Signalement enregistré. Nos modérateurs vont examiner ce compte.' });
    }

    /* ── POST /api/initiatives/:id/signaler — signaler une initiative ── */
    if (req.method === 'POST' && /^\/api\/initiatives\/\d+\/signaler$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const iid = parseInt(pathname.split('/')[3]);
      const init = db.prepare(`SELECT * FROM initiatives WHERE id=?`).get(iid);
      if (!init) return sendJSON(res, 404, { error: 'Initiative introuvable.' });
      if (init.owner_user_id === me.id) return sendJSON(res, 400, { error: 'Vous ne pouvez pas signaler votre propre initiative.' });

      const MOTIFS_VALIDES = [
        'Suspicion d\'escroquerie','Faux documents','Informations mensongères',
        'Collecte de fonds suspecte','Usurpation d\'identité','Contenu illégal',
        'Discours haineux','Spam','Publicité abusive',
        'Violation des règles Diaspo\'Actif','Conflit d\'intérêt non déclaré','Autre'
      ];
      const { motif, description, preuves } = body;
      if (!MOTIFS_VALIDES.includes(motif)) return sendJSON(res, 400, { error: 'Motif invalide.' });

      // Anti-doublon dans les 30 jours
      const existing = db.prepare(`SELECT id FROM initiative_reports WHERE reporter_id=? AND initiative_id=? AND created_at >= datetime('now','-30 days')`).get(me.id, iid);
      if (existing) return sendJSON(res, 400, { error: 'Vous avez déjà signalé cette initiative récemment.' });

      db.prepare(`INSERT INTO initiative_reports (reporter_id,initiative_id,motif,description,preuves) VALUES (?,?,?,?,?)`)
        .run(me.id, iid, motif, description||null, JSON.stringify(preuves||[]));

      // Auto-compteur
      const nbRep = db.prepare(`SELECT COUNT(*) n FROM initiative_reports WHERE initiative_id=? AND statut IN ('en_attente','en_cours')`).get(iid).n;
      if (nbRep >= 5) {
        db.prepare(`UPDATE initiatives SET signalements_confirmes=signalements_confirmes+1 WHERE id=?`).run(iid);
      }
      return sendJSON(res, 201, { ok: true, message: 'Signalement transmis aux modérateurs.' });
    }

    /* ── GET /api/admin/signalements — tous les signalements (admin) ── */
    if (req.method === 'GET' && pathname === '/api/admin/signalements') {
      const me = getCurrentUser(req);
      if (!me || !['administrateur'].includes(me.role)) return sendJSON(res, 403, { error: 'Réservé.' });
      const comptes = db.prepare(`
        SELECT ar.*, u1.nom AS reporter_nom, u2.nom AS reported_nom, u2.role AS reported_role
        FROM account_reports ar
        LEFT JOIN users u1 ON u1.id=ar.reporter_id
        LEFT JOIN users u2 ON u2.id=ar.reported_id
        ORDER BY ar.created_at DESC LIMIT 100`).all();
      const initiatives = db.prepare(`
        SELECT ir.*, u.nom AS reporter_nom, i.nom AS init_nom
        FROM initiative_reports ir
        LEFT JOIN users u ON u.id=ir.reporter_id
        LEFT JOIN initiatives i ON i.id=ir.initiative_id
        ORDER BY ir.created_at DESC LIMIT 100`).all();
      const stats = {
        comptes_en_attente: comptes.filter(r=>r.statut==='en_attente').length,
        init_en_attente: initiatives.filter(r=>r.statut==='en_attente').length,
      };
      return sendJSON(res, 200, { comptes, initiatives, stats });
    }

    /* ── PATCH /api/admin/signalements/compte/:id — modérer signalement compte ── */
    if (req.method === 'PATCH' && /^\/api\/admin\/signalements\/compte\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Réservé.' });
      const rid = parseInt(pathname.split('/')[5]);
      const { action, note } = body;
      const ACTIONS = ['classe','rappel_envoye','masque','resolu'];
      if (!ACTIONS.includes(action)) return sendJSON(res, 400, { error: 'Action invalide.' });
      db.prepare(`UPDATE account_reports SET statut=?,admin_id=?,admin_note=?,updated_at=datetime('now') WHERE id=?`)
        .run(action, me.id, note||null, rid);
      db.prepare(`INSERT INTO report_history (report_type,report_id,admin_id,admin_nom,action,note) VALUES ('account',?,?,?,?,?)`)
        .run(rid, me.id, me.nom, action, note||null);
      // Si masqué : incrémenter signalements_confirmes
      if (action === 'masque') {
        const rep = db.prepare(`SELECT reported_id FROM account_reports WHERE id=?`).get(rid);
        if (rep) db.prepare(`UPDATE users SET signalements_confirmes=signalements_confirmes+1 WHERE id=?`).run(rep.reported_id);
      }
      return sendJSON(res, 200, { ok: true });
    }

    /* ── PATCH /api/admin/signalements/initiative/:id — modérer signalement initiative ── */
    if (req.method === 'PATCH' && /^\/api\/admin\/signalements\/initiative\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Réservé.' });
      const rid = parseInt(pathname.split('/')[5]);
      const { action, note } = body;
      const ACTIONS_INIT = ['classe','en_cours','suspendu','masque','transmis'];
      if (!ACTIONS_INIT.includes(action)) return sendJSON(res, 400, { error: 'Action invalide.' });
      db.prepare(`UPDATE initiative_reports SET statut=?,admin_id=?,admin_note=?,admin_action=?,updated_at=datetime('now') WHERE id=?`)
        .run(action, me.id, note||null, action, rid);
      db.prepare(`INSERT INTO report_history (report_type,report_id,admin_id,admin_nom,action,note) VALUES ('initiative',?,?,?,?,?)`)
        .run(rid, me.id, me.nom, action, note||null);
      if (action === 'suspendu' || action === 'masque') {
        const rep = db.prepare(`SELECT initiative_id FROM initiative_reports WHERE id=?`).get(rid);
        if (rep) db.prepare(`UPDATE initiatives SET signalements_confirmes=signalements_confirmes+1 WHERE id=?`).run(rep.initiative_id);
      }
      return sendJSON(res, 200, { ok: true });
    }

    /* ── PATCH /api/admin/users/:id/verify — vérifier un compte (admin) ── */
    if (req.method === 'PATCH' && /^\/api\/admin\/users\/\d+\/verify$/.test(pathname)) {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Réservé.' });
      const uid = parseInt(pathname.split('/')[4]);
      const { identite_verifiee, documents_verifies, diplomes_verifies, entreprise_verifiee, is_verified } = body;
      const fields = [];
      if (identite_verifiee !== undefined) { fields.push(`identite_verifiee=${identite_verifiee?1:0}`); }
      if (documents_verifies !== undefined) { fields.push(`documents_verifies=${documents_verifies?1:0}`); }
      if (diplomes_verifies !== undefined) { fields.push(`diplomes_verifies=${diplomes_verifies?1:0}`); }
      if (entreprise_verifiee !== undefined) { fields.push(`entreprise_verifiee=${entreprise_verifiee?1:0}`); }
      if (is_verified !== undefined) { fields.push(`is_verified=${is_verified?1:0}`); }
      if (!fields.length) return sendJSON(res, 400, { error: 'Aucun champ fourni.' });
      db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=?`).run(uid);
      // Invalider le cache trust score
      db.prepare(`DELETE FROM trust_cache WHERE user_id=?`).run(uid);
      return sendJSON(res, 200, { ok: true });
    }

    /* ============================================================
       MODULE STATISTIQUES MONDIAL — Observatoire Diaspo'Actif
    ============================================================ */

    if (req.method === 'GET' && pathname === '/api/stats') {
      const me = getCurrentUser(req);
      const p = q.period || 'all';   // today|week|month|year|all
      const paysFilt = q.pays || null;
      const contFilt = q.continent || null;
      const roleFilt = q.role || null;

      // Plage temporelle
      function since(period) {
        if (period === 'today')  return `AND created_at >= datetime('now','start of day')`;
        if (period === 'week')   return `AND created_at >= datetime('now','-7 days')`;
        if (period === 'month')  return `AND created_at >= datetime('now','start of month')`;
        if (period === 'year')   return `AND created_at >= datetime('now','start of year')`;
        return '';
      }
      const sw = since(p);

      const fPays = paysFilt ? `AND pays=?` : '';
      const fPaysArg = paysFilt ? [paysFilt] : [];

      try {
        // ── Membres par rôle ──
        const roles = db.prepare(`
          SELECT role, COUNT(*) n FROM users
          WHERE role NOT IN ('administrateur') ${fPays} ${sw.replace('created_at','created_at')}
          GROUP BY role
        `).all(...fPaysArg);
        const byRole = {};
        roles.forEach(r => byRole[r.role] = r.n);
        const totalMembres = roles.reduce((s,r)=>s+r.n,0);

        // ── Vérifications ──
        const verified = db.prepare(`SELECT COUNT(*) n FROM users WHERE is_verified=1 ${fPays} ${sw}`).get(...fPaysArg).n;
        const docsVerif = db.prepare(`SELECT COUNT(*) n FROM users WHERE documents_verifies=1 ${fPays}`).get(...fPaysArg).n;

        // ── Géographie ──
        const countryRows = db.prepare(`
          SELECT pays, COUNT(*) n FROM users
          WHERE pays IS NOT NULL AND pays!='' AND role NOT IN ('administrateur')
          ${fPays} GROUP BY pays ORDER BY n DESC LIMIT 50
        `).all(...fPaysArg);
        const nbPays = db.prepare(`SELECT COUNT(DISTINCT pays) n FROM users WHERE pays IS NOT NULL AND pays!=''`).get().n;
        const nbVilles = db.prepare(`SELECT COUNT(DISTINCT ville) n FROM users WHERE ville IS NOT NULL AND ville!=''`).get().n;
        const nbRegions = db.prepare(`SELECT COUNT(DISTINCT region) n FROM users WHERE region IS NOT NULL AND region!=''`).get().n;

        // Continents mapping simplifié
        const CONTINENTS = {
          'France':'Europe','Belgique':'Europe','Suisse':'Europe','Luxembourg':'Europe','Allemagne':'Europe',
          'Italie':'Europe','Espagne':'Europe','Portugal':'Europe','Royaume-Uni':'Europe','Pays-Bas':'Europe',
          'Canada':'Amérique du Nord','États-Unis':'Amérique du Nord','Mexique':'Amérique du Nord',
          'Brésil':'Amérique du Sud','Argentine':'Amérique du Sud','Colombie':'Amérique du Sud',
          'Côte d\'Ivoire':'Afrique','Sénégal':'Afrique','Cameroun':'Afrique','Mali':'Afrique',
          'Burkina Faso':'Afrique','Guinée':'Afrique','Bénin':'Afrique','Togo':'Afrique',
          'Congo':'Afrique','RDC':'Afrique','Gabon':'Afrique','Maroc':'Afrique',
          'Algérie':'Afrique','Tunisie':'Afrique','Égypte':'Afrique','Nigéria':'Afrique',
          'Ghana':'Afrique','Kenya':'Afrique','Éthiopie':'Afrique','Sénégal':'Afrique',
          'Chine':'Asie','Japon':'Asie','Inde':'Asie','Vietnam':'Asie','Thaïlande':'Asie',
          'Australie':'Océanie','Nouvelle-Zélande':'Océanie',
        };
        const continentMap = {};
        countryRows.forEach(r => {
          const c = CONTINENTS[r.pays] || 'Autre';
          continentMap[c] = (continentMap[c] || 0) + r.n;
        });

        // ── Compétences & métiers ──
        const titres = db.prepare(`
          SELECT titre_pro, COUNT(*) n FROM users
          WHERE titre_pro IS NOT NULL AND titre_pro!=''
          GROUP BY titre_pro ORDER BY n DESC LIMIT 20
        `).all();
        const secteurs = db.prepare(`
          SELECT secteur, COUNT(*) n FROM initiatives
          WHERE secteur IS NOT NULL AND secteur!=''
          GROUP BY secteur ORDER BY n DESC LIMIT 15
        `).all();
        const nbMetiers = db.prepare(`SELECT COUNT(DISTINCT titre_pro) n FROM users WHERE titre_pro IS NOT NULL AND titre_pro!=''`).get().n;

        // ── Activité plateforme ──
        const now_str = "datetime('now')";
        const actStats = {
          connexions_jour:  db.prepare(`SELECT COUNT(*) n FROM users WHERE last_active >= datetime('now','start of day')`).get().n,
          connexions_semaine: db.prepare(`SELECT COUNT(*) n FROM users WHERE last_active >= datetime('now','-7 days')`).get().n,
          nouveaux_membres: db.prepare(`SELECT COUNT(*) n FROM users WHERE created_at >= datetime('now','-30 days')`).get().n,
          messages:         db.prepare(`SELECT COUNT(*) n FROM messages ${sw?'WHERE 1=1 '+sw:''}`).get().n,
          evenements:       db.prepare(`SELECT COUNT(*) n FROM evenements ${sw?'WHERE 1=1 '+sw:''}`).get().n,
          billets_vendus:   db.prepare(`SELECT COUNT(*) n FROM event_tickets WHERE statut IN ('paye','valide') ${sw}`).get().n,
          qr_codes:         db.prepare(`SELECT COUNT(*) n FROM event_tickets ${sw?'WHERE 1=1 '+sw:''}`).get().n,
          initiatives_pub:  db.prepare(`SELECT COUNT(*) n FROM initiatives WHERE statut='publiee' ${sw}`).get().n,
          reunions:         db.prepare(`SELECT COUNT(*) n FROM reunions ${sw?'WHERE 1=1 '+sw:''}`).get().n,
          resumes_ia:       db.prepare(`SELECT COUNT(*) n FROM reunions WHERE resume_ai IS NOT NULL AND resume_ai!='' ${sw}`).get().n,
          candidatures:     db.prepare(`SELECT COUNT(*) n FROM candidatures ${sw?'WHERE 1=1 '+sw:''}`).get().n,
          collaborations:   db.prepare(`SELECT COUNT(*) n FROM collaborations ${sw?'WHERE 1=1 '+sw:''}`).get().n,
          posts:            db.prepare(`SELECT COUNT(*) n FROM fil_posts ${sw?'WHERE 1=1 '+sw:''}`).get().n,
          accreditations:   db.prepare(`SELECT COUNT(*) n FROM compte_accreditations WHERE statut='active' ${sw}`).get().n,
        };

        // Évolution membres par mois (12 derniers mois)
        const evolutionMois = db.prepare(`
          SELECT strftime('%Y-%m', created_at) AS mois, COUNT(*) n
          FROM users WHERE created_at >= datetime('now','-12 months') AND role NOT IN ('administrateur')
          GROUP BY mois ORDER BY mois ASC
        `).all();

        // ── Emploi & opportunités ──
        const emploiStats = {
          offres_emploi:    db.prepare(`SELECT COUNT(*) n FROM offres_emploi`).get()?.n ?? 0,
          candidatures:     actStats.candidatures,
          collaborations:   actStats.collaborations,
        };

        // ── Indicateurs de confiance ──
        const trustStats = {
          verified,
          docs_verifies:    docsVerif,
          pct_verified:     totalMembres > 0 ? Math.round(verified * 100 / totalMembres) : 0,
          score_moyen:      db.prepare(`SELECT AVG(trust_score) avg FROM users WHERE trust_score > 0`).get()?.avg?.toFixed(1) ?? 0,
          reactivity_moy:   db.prepare(`SELECT AVG(reactivity_stars) avg FROM users WHERE reactivity_stars > 0`).get()?.avg?.toFixed(1) ?? 0,
          actifs_30j:       db.prepare(`SELECT COUNT(*) n FROM users WHERE last_active >= datetime('now','-30 days')`).get().n,
          absents:          db.prepare(`SELECT COUNT(*) n FROM user_absence WHERE fin IS NULL OR fin >= date('now')`).get().n,
          suspendus:        db.prepare(`SELECT COUNT(*) n FROM account_reports WHERE statut='masque'`).get().n,
          accrédités:       db.prepare(`SELECT COUNT(DISTINCT user_id) n FROM compte_accreditations WHERE statut='active'`).get().n,
        };

        // ── Stats IA ──
        const iaStats = {
          recommandations: db.prepare(`SELECT COUNT(*) n FROM chatbot_history WHERE type='recommend'`).get()?.n ?? 0,
          recherches: db.prepare(`SELECT COUNT(*) n FROM chatbot_history`).get()?.n ?? 0,
        };

        // ── Top villes ──
        const topVilles = db.prepare(`
          SELECT ville, COUNT(*) n FROM users WHERE ville IS NOT NULL AND ville!=''
          AND role NOT IN ('administrateur') GROUP BY ville ORDER BY n DESC LIMIT 20
        `).all();

        return sendJSON(res, 200, {
          general: { totalMembres, byRole, verified, pct_verified: trustStats.pct_verified },
          geo: { nbPays, nbVilles, nbRegions, byCountry: countryRows, byCont: continentMap, topVilles },
          competences: { nbMetiers, topTitres: titres, topSecteurs: secteurs },
          activite: actStats,
          evolution: evolutionMois,
          emploi: emploiStats,
          confiance: trustStats,
          ia: iaStats,
          meta: { period: p, generated_at: new Date().toISOString() }
        });
      } catch(e) {
        return sendJSON(res, 500, { error: e.message });
      }
    }

    /* ============================================================
       CHATBOT — MOTEUR DE RECOMMANDATION INTELLIGENT
       Scoring multi-critères, NLP léger, respect confidentialité
    ============================================================ */

    if (req.method === 'POST' && pathname === '/api/chatbot/recommend') {
      const { query = '', limit = 4 } = body;
      if (!query.trim()) return sendJSON(res, 400, { error: 'query requis' });

      /* ── NLP : normalisation + extraction d'entités ── */
      const norm = s => (s||'').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g,'')
        .replace(/['']/g,"'");
      const q = norm(query);

      // Extraction localisation (ville après preposition)
      const villeRx = /(?:^|\s)(?:a|à|en|au|aux|dans|de|du)\s+([a-z][a-z\-]{1,25}(?:\s[a-z][a-z\-]{1,20})?)/g;
      let villeQ = null;
      let m;
      while ((m = villeRx.exec(q)) !== null) { villeQ = m[1].trim(); }

      // Pays connus (mapping)
      const PAYS_MAP = {'france':'France','cote d\'ivoire':'Côte d\'Ivoire','cote ivoire':'Côte d\'Ivoire','senegal':'Sénégal','cameroun':'Cameroun','mali':'Mali','burkina':'Burkina Faso','guinee':'Guinée','togo':'Togo','benin':'Bénin','niger':'Niger','belgique':'Belgique','suisse':'Suisse','canada':'Canada','etats-unis':'États-Unis','usa':'États-Unis','maroc':'Maroc','algerie':'Algérie','tunisie':'Tunisie','congo':'Congo','rdc':'RDC','gabon':'Gabon','madagascar':'Madagascar','mauritanie':'Mauritanie','rwanda':'Rwanda','angola':'Angola','mozambique':'Mozambique','ethiopie':'Éthiopie','kenya':'Kenya','ghana':'Ghana','nigeria':'Nigéria','afrique du sud':'Afrique du Sud'};
      let paysQ = null;
      for (const [k,v] of Object.entries(PAYS_MAP)) { if (q.includes(k)) { paysQ = v; break; } }

      // Langues
      const LANG_DETECT = [['français','francoph','french'],['anglais','angloph','english'],['arabe','arabic'],['portugais','portuguese'],['espagnol','spanish','hispanoph'],['wolof'],['bambara'],['mandingue'],['haoussa','hausa'],['peul','fula'],['swahili'],['lingala'],['mooré']];
      const langues = LANG_DETECT
        .filter(variants => variants.some(k => q.includes(k)))
        .map(variants => variants[0]);

      // Mots-clés nettoyés (sans stopwords)
      const STOPS = new Set(['je','tu','il','nous','vous','ils','cherche','cherches','cherchent','trouve','trouver','besoin','dun','dune','des','les','une','qui','que','quoi','pour','avec','dans','sur','par','est','sont','dont','mais','aussi','alors','votre','notre','mon','ma','mes','ses','son','quel','quelle','comment','quand','lieu','autre','autres','celui','celle','parle','parles','parler','peut','pouvez','avoir','faire','bien','tres','plus','moins','trop','assez','tout','tous','toute','toutes','aucun','aucune']);
      const keywords = q.split(/[\s,;.!?()\[\]'"\/\\]+/)
        .map(w => w.replace(/^(d|l|j|n|m|s|c|qu)['']/i,''))
        .filter(w => w.length >= 3 && !STOPS.has(w) && !/^\d+$/.test(w));

      /* ── Requête DB — candidats ── */
      const me = getCurrentUser(req);
      const currentUserId = me?.id || 0;

      const candidates = db.prepare(`
        SELECT u.id, u.nom, u.prenom, u.role, u.pays, u.ville, u.bio, u.titre_pro,
          u.competences, u.photo_url, u.experiences,
          u.is_verified, u.identite_verifiee, u.documents_verifies, u.diplomes_verifies,
          u.trust_score, u.reactivity_stars, u.signalements_confirmes,
          i.id AS init_id, i.nom AS init_nom, i.secteur, i.services, i.langues AS init_langues,
          i.numero_immatriculation, i.taille_structure,
          (SELECT COUNT(*) FROM compte_accreditations ca WHERE ca.user_id=u.id AND ca.statut='active') AS nb_accreds,
          (SELECT COUNT(*) FROM user_follows uf WHERE uf.following_id=u.id) AS nb_followers,
          (SELECT COUNT(*) FROM fil_posts fp WHERE fp.auteur_id=u.id) AS nb_posts,
          (SELECT COUNT(*) FROM collaborations co WHERE co.user_id=u.id) AS nb_collabs,
          CASE WHEN ua.user_id IS NOT NULL THEN 1 ELSE 0 END AS en_absence
        FROM users u
        LEFT JOIN initiatives i ON i.owner_user_id=u.id
        LEFT JOIN user_absence ua ON ua.user_id=u.id AND (ua.fin IS NULL OR ua.fin >= date('now'))
        WHERE u.role NOT IN ('administrateur')
          AND u.id != ?
          AND (u.signalements_confirmes IS NULL OR u.signalements_confirmes < 3)
        LIMIT 800
      `).all(currentUserId);

      /* ── Scoring multi-critères ── */
      function scoreProfile(u) {
        let score = 0;
        const haystack = norm([
          u.nom, u.prenom, u.titre_pro, u.bio,
          u.competences, u.init_nom, u.secteur, u.services,
          u.experiences
        ].join(' '));

        // Keyword matching (pondéré selon la position dans les champs importants)
        const titleHay = norm((u.titre_pro||'') + ' ' + (u.init_nom||'') + ' ' + (u.secteur||''));
        for (const kw of keywords) {
          if (titleHay.includes(kw)) score += 35;         // profession / titre : fort signal
          else if (haystack.includes(kw)) score += 18;    // bio / compétences
        }

        // Localisation
        if (villeQ) {
          const villeNorm = norm(u.ville||'');
          if (villeNorm === villeQ) score += 40;
          else if (villeNorm.includes(villeQ) || villeQ.includes(villeNorm)) score += 25;
        }
        if (paysQ && u.pays === paysQ) score += 20;

        // Langues
        const uLang = norm((u.init_langues||'[]') + ' ' + (u.bio||'') + ' ' + (u.competences||''));
        for (const lang of langues) { if (uLang.includes(lang)) score += 15; }

        // Signaux de confiance (boost) — COMPTES VÉRIFIÉS EN PRIORITÉ
        if (u.is_verified || u.identite_verifiee) score += 30; // priorité absolue
        if (u.documents_verifies) score += 15;
        if (u.diplomes_verifies)  score += 12;
        if (u.nb_accreds > 0) score += 25;
        if (u.numero_immatriculation) score += 12;
        // Réactivité
        if (u.reactivity_stars >= 5) score += 10;
        else if (u.reactivity_stars >= 4) score += 6;
        else if (u.reactivity_stars >= 3) score += 3;
        // Trust score cumulatif
        if (u.trust_score >= 90) score += 15;
        else if (u.trust_score >= 75) score += 8;
        else if (u.trust_score >= 50) score += 3;
        // Malus absence / signalements
        if (u.en_absence) score -= 20;
        if (u.signalements_confirmes > 0) score -= 10 * u.signalements_confirmes;
        // Activité
        if (u.nb_followers > 10) score += 12;
        else if (u.nb_followers > 2) score += 6;
        if (u.photo_url) score += 5;
        if (u.bio && u.bio.length > 80) score += 6;
        if (u.nb_posts > 5) score += 5;
        if (u.nb_collabs > 0) score += 8;

        // Bonus par rôle
        const roleBonus = { initiative: 6, collectivite: 8, institution: 8 };
        score += roleBonus[u.role] || 0;

        return score;
      }

      const scored = candidates
        .map(u => ({ ...u, _score: scoreProfile(u) }))
        .filter(u => u._score > 0)
        .sort((a,b) => b._score - a._score)
        .slice(0, Math.min(limit, 4));

      if (!scored.length) {
        return sendJSON(res, 200, { profiles: [], query_info: { keywords, villeQ, paysQ, langues } });
      }

      /* ── Construction des profils enrichis ── */
      const topScore = scored[0]._score;
      const ROLE_LABELS = { utilisateur:'Membre', initiative:'Initiative', collectivite:'Collectivité', institution:'Institution', administrateur:'Admin' };
      const profiles = scored.map((u, idx) => {
        // Génération de l'explication
        const reasons = [];
        const titleHay = norm((u.titre_pro||'')+' '+(u.init_nom||'')+' '+(u.secteur||'')+' '+(u.bio||''));
        const matchedKws = keywords.filter(k => titleHay.includes(k));
        if (matchedKws.length) {
          const proper = matchedKws.map(k => k.charAt(0).toUpperCase()+k.slice(1));
          reasons.push(`Spécialisé en ${proper.join(', ')}`);
        }
        if (villeQ && norm(u.ville||'').includes(villeQ)) reasons.push(`Basé à ${u.ville}`);
        if (paysQ && u.pays === paysQ && !reasons.some(r=>r.includes('Basé'))) reasons.push(`En ${u.pays}`);
        const uLang = norm(u.init_langues||'');
        const matchedLangs = langues.filter(l => uLang.includes(l));
        if (matchedLangs.length) reasons.push(`Parle ${matchedLangs.join(', ')}`);
        if (u.is_verified || u.identite_verifiee) reasons.unshift('✅ Compte vérifié Diaspo\'Actif');
        if (u.documents_verifies) reasons.push('📄 Documents vérifiés');
        if (u.diplomes_verifies) reasons.push('🎓 Diplômes vérifiés');
        if (u.nb_accreds > 0) reasons.push(`🏅 ${u.nb_accreds} accréditation(s) Diaspo'Actif`);
        if (u.numero_immatriculation) reasons.push('🏛️ Initiative officiellement immatriculée');
        if (u.reactivity_stars >= 4) reasons.push('⚡ Très réactif');
        if (u.nb_followers > 10) reasons.push(`${u.nb_followers} abonnés sur la plateforme`);
        if (u.nb_collabs > 0) reasons.push(`${u.nb_collabs} collaboration(s) réalisée(s)`);
        if (!reasons.length) reasons.push('Profil actif correspondant à votre recherche');

        // Compatibilité en % (normalisée sur 95% max pour les suivants)
        const compat = idx === 0
          ? Math.min(99, Math.max(70, Math.round((u._score / Math.max(topScore,1)) * 99)))
          : Math.min(96, Math.max(60, Math.round((u._score / Math.max(topScore,1)) * 96)));

        return {
          id: u.id,
          nom: u.nom || '',
          prenom: u.prenom || '',
          role: u.role || 'utilisateur',
          role_label: ROLE_LABELS[u.role] || 'Membre',
          titre_pro: u.titre_pro || u.init_nom || u.secteur || '',
          organisation: u.init_nom || '',
          pays: u.pays || '',
          ville: u.ville || '',
          bio: (u.bio || '').slice(0, 140),
          photo_url: u.photo_url || null,
          nb_accreds: u.nb_accreds || 0,
          nb_followers: u.nb_followers || 0,
          immatricule: !!u.numero_immatriculation,
          nb_posts: u.nb_posts || 0,
          compatibilite: compat,
          explication: reasons.join('. ') + '.',
          rank: idx + 1,
        };
      });

      return sendJSON(res, 200, { profiles, query_info: { keywords, villeQ, paysQ, langues, total_candidates: candidates.length } });
    }

    /* ============================================================
       MODULE RÉSEAU PROFESSIONNEL — Annuaires des Initiatives
       RÈGLE FONDAMENTALE : uniquement role='initiative' + immatriculées
    ============================================================ */

    /* Helper — récupère l'initiative de l'utilisateur connecté */
    function getMyInit(userId) {
      return db.prepare(`SELECT * FROM initiatives WHERE owner_user_id=? ORDER BY created_at DESC LIMIT 1`).get(userId);
    }
    /* Helper — sécurité : initiative immatriculée uniquement */
    function initImmat(id) {
      return db.prepare(`SELECT i.* FROM initiatives i WHERE i.id=? AND i.numero_immatriculation IS NOT NULL AND i.numero_immatriculation != ''`).get(id);
    }
    /* Helper — accréditations d'une initiative */
    function initAccreds(initId) {
      const row = db.prepare(`SELECT owner_user_id FROM initiatives WHERE id=?`).get(initId);
      if (!row?.owner_user_id) return [];
      return db.prepare(`SELECT type FROM compte_accreditations WHERE user_id=? AND statut='active'`).all(row.owner_user_id).map(a => a.type);
    }
    /* Helper — nb recommandations */
    function countRecos(initId) {
      return db.prepare(`SELECT COUNT(*) as c FROM reseau_recommandations WHERE initiative_id=?`).get(initId)?.c || 0;
    }
    /* Helper — enrichir fiche init pour le réseau */
    function enrichInit(row) {
      if (!row) return null;
      return {
        ...row,
        services: safeParse(row.services) || [],
        langues: safeParse(row.langues) || [],
        nationalites_concernees: safeParse(row.nationalites_concernees) || [],
        accreditations: initAccreds(row.id),
        nb_recommandations: countRecos(row.id),
        nb_affiliations: db.prepare(`SELECT COUNT(*) as c FROM reseau_affiliations WHERE destinataire_id=? AND statut='accepte'`).get(row.id)?.c || 0,
      };
    }

    /* GET /api/reseau — recherche d'initiatives immatriculées */
    if (req.method === "GET" && pathname === "/api/reseau") {
      const { q, secteur, type, pays, ville, langue, services, accreditation, limit: lim } = qs;
      let sql = `SELECT i.* FROM initiatives i WHERE i.numero_immatriculation IS NOT NULL AND i.numero_immatriculation != '' AND (i.reseau_visible IS NULL OR i.reseau_visible=1)`;
      const params = [];
      if (q) { sql += ` AND (i.nom LIKE ? OR i.description LIKE ? OR i.domaine LIKE ?)`; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
      if (secteur) { sql += ` AND i.domaine=?`; params.push(secteur); }
      if (type) { sql += ` AND i.type=?`; params.push(type); }
      if (pays) { sql += ` AND i.pays=?`; params.push(pays); }
      if (ville) { sql += ` AND i.ville LIKE ?`; params.push(`%${ville}%`); }
      sql += ` ORDER BY i.nb_vues DESC, i.created_at DESC LIMIT ?`;
      params.push(parseInt(lim) || 60);
      let rows = db.prepare(sql).all(...params);
      // Filtre langue/services côté JS (stockés JSON)
      if (langue) rows = rows.filter(r => { try{return JSON.parse(r.langues||'[]').includes(langue);}catch{return false;} });
      if (services) rows = rows.filter(r => { try{return JSON.parse(r.services||'[]').some(s=>s.toLowerCase().includes(services.toLowerCase()));}catch{return false;} });
      if (accreditation) {
        rows = rows.filter(r => initAccreds(r.id).includes(accreditation));
      }
      return sendJSON(res, 200, { initiatives: rows.map(enrichInit) });
    }

    /* GET /api/reseau/me — mon réseau (initiative connectée) */
    if (req.method === "GET" && pathname === "/api/reseau/me") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const myInit = getMyInit(me.id);
      if (!myInit) return sendJSON(res, 404, { error: "Aucune initiative associée à ce compte." });
      // Affiliations acceptées (réseaux où je suis membre)
      const affilies = db.prepare(`
        SELECT i.*, ra.mise_en_avant, ra.created_at AS affilie_depuis FROM reseau_affiliations ra
        JOIN initiatives i ON i.id=ra.demandeur_id
        WHERE ra.destinataire_id=? AND ra.statut='accepte'
        ORDER BY ra.mise_en_avant DESC, ra.created_at ASC
      `).all(myInit.id);
      // Réseaux dont je suis membre (j'ai demandé + accepté)
      const membrede = db.prepare(`
        SELECT i.*, ra.statut, ra.created_at AS affilie_depuis FROM reseau_affiliations ra
        JOIN initiatives i ON i.id=ra.destinataire_id
        WHERE ra.demandeur_id=? AND ra.statut='accepte'
        ORDER BY i.nom ASC
      `).all(myInit.id);
      return sendJSON(res, 200, {
        moi: enrichInit(myInit),
        mon_reseau: affilies.map(r => ({ ...enrichInit(r), mise_en_avant: r.mise_en_avant })),
        membre_de: membrede.map(enrichInit),
      });
    }

    /* GET /api/reseau/me/demandes — demandes reçues */
    if (req.method === "GET" && pathname === "/api/reseau/me/demandes") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const myInit = getMyInit(me.id);
      if (!myInit) return sendJSON(res, 404, { error: "Aucune initiative." });
      const rows = db.prepare(`
        SELECT ra.*, i.nom, i.logo_url, i.type, i.domaine, i.ville, i.pays, i.numero_immatriculation, i.description
        FROM reseau_affiliations ra JOIN initiatives i ON i.id=ra.demandeur_id
        WHERE ra.destinataire_id=?
        ORDER BY CASE ra.statut WHEN 'en_attente' THEN 0 WHEN 'info_demandee' THEN 1 ELSE 2 END, ra.updated_at DESC
      `).all(myInit.id);
      return sendJSON(res, 200, { demandes: rows, init_id: myInit.id });
    }

    /* GET /api/reseau/me/envoyees — mes demandes envoyées */
    if (req.method === "GET" && pathname === "/api/reseau/me/envoyees") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const myInit = getMyInit(me.id);
      if (!myInit) return sendJSON(res, 404, { error: "Aucune initiative." });
      const rows = db.prepare(`
        SELECT ra.*, i.nom, i.logo_url, i.type, i.domaine, i.ville, i.pays
        FROM reseau_affiliations ra JOIN initiatives i ON i.id=ra.destinataire_id
        WHERE ra.demandeur_id=? ORDER BY ra.updated_at DESC
      `).all(myInit.id);
      return sendJSON(res, 200, { envoyees: rows });
    }

    /* GET /api/reseau/me/stats — statistiques de mon réseau */
    if (req.method === "GET" && pathname === "/api/reseau/me/stats") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const myInit = getMyInit(me.id);
      if (!myInit) return sendJSON(res, 404, { error: "Aucune initiative." });
      const total = db.prepare(`SELECT COUNT(*) as c FROM reseau_affiliations WHERE destinataire_id=? AND statut='accepte'`).get(myInit.id)?.c || 0;
      const enAttente = db.prepare(`SELECT COUNT(*) as c FROM reseau_affiliations WHERE destinataire_id=? AND statut='en_attente'`).get(myInit.id)?.c || 0;
      const recos = countRecos(myInit.id);
      const membreDe = db.prepare(`SELECT COUNT(*) as c FROM reseau_affiliations WHERE demandeur_id=? AND statut='accepte'`).get(myInit.id)?.c || 0;
      const parPays = db.prepare(`
        SELECT i.pays, COUNT(*) as nb FROM reseau_affiliations ra
        JOIN initiatives i ON i.id=ra.demandeur_id
        WHERE ra.destinataire_id=? AND ra.statut='accepte' GROUP BY i.pays ORDER BY nb DESC LIMIT 10
      `).all(myInit.id);
      const parSecteur = db.prepare(`
        SELECT i.domaine, COUNT(*) as nb FROM reseau_affiliations ra
        JOIN initiatives i ON i.id=ra.demandeur_id
        WHERE ra.destinataire_id=? AND ra.statut='accepte' GROUP BY i.domaine ORDER BY nb DESC LIMIT 10
      `).all(myInit.id);
      return sendJSON(res, 200, { total, enAttente, recos, membreDe, parPays, parSecteur });
    }

    /* GET /api/reseau/:id — fiche publique d'une initiative */
    if (req.method === "GET" && /^\/api\/reseau\/\d+$/.test(pathname)) {
      const initId = parseInt(pathname.split('/')[3]);
      const row = db.prepare(`SELECT * FROM initiatives WHERE id=? AND numero_immatriculation IS NOT NULL AND numero_immatriculation != ''`).get(initId);
      if (!row) return sendJSON(res, 404, { error: "Initiative introuvable ou non immatriculée." });
      const affilies = db.prepare(`
        SELECT i.id, i.nom, i.logo_url, i.type, i.domaine, i.ville, i.pays FROM reseau_affiliations ra
        JOIN initiatives i ON i.id=ra.demandeur_id
        WHERE ra.destinataire_id=? AND ra.statut='accepte' AND ra.mise_en_avant=1 LIMIT 6
      `).all(initId);
      const recos = db.prepare(`
        SELECT rr.contenu, i.nom, i.logo_url FROM reseau_recommandations rr
        JOIN initiatives i ON i.id=rr.auteur_initiative_id
        WHERE rr.initiative_id=? ORDER BY rr.created_at DESC LIMIT 5
      `).all(initId);
      return sendJSON(res, 200, { initiative: enrichInit(row), en_avant: affilies, recommandations: recos });
    }

    /* GET /api/reseau/:id/membres — membres du réseau d'une initiative */
    if (req.method === "GET" && /^\/api\/reseau\/\d+\/membres$/.test(pathname)) {
      const initId = parseInt(pathname.split('/')[3]);
      const rows = db.prepare(`
        SELECT i.*, ra.mise_en_avant FROM reseau_affiliations ra
        JOIN initiatives i ON i.id=ra.demandeur_id
        WHERE ra.destinataire_id=? AND ra.statut='accepte'
        ORDER BY ra.mise_en_avant DESC, i.nom ASC
      `).all(initId);
      return sendJSON(res, 200, { membres: rows.map(r => ({ ...enrichInit(r), mise_en_avant: r.mise_en_avant })) });
    }

    /* POST /api/reseau/:id/affiliation — demander une affiliation */
    if (req.method === "POST" && /^\/api\/reseau\/\d+\/affiliation$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const destId = parseInt(pathname.split('/')[3]);
      const myInit = getMyInit(me.id);
      if (!myInit) return sendJSON(res, 400, { error: "Vous devez avoir une initiative pour faire une demande." });
      if (!myInit.numero_immatriculation) return sendJSON(res, 400, { error: "Votre initiative doit avoir un numéro d'immatriculation pour rejoindre un réseau." });
      if (myInit.id === destId) return sendJSON(res, 400, { error: "Vous ne pouvez pas vous affilier à votre propre réseau." });
      const dest = initImmat(destId);
      if (!dest) return sendJSON(res, 404, { error: "Initiative destinataire introuvable ou non immatriculée." });
      const { message } = body;
      try {
        const r = db.prepare(`INSERT INTO reseau_affiliations(demandeur_id,destinataire_id,message) VALUES(?,?,?)`).run(myInit.id, destId, message||null);
        // Notification au destinataire
        db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(
          dest.owner_user_id, 'reseau_affiliation',
          `Nouvelle demande d'affiliation`,
          `"${myInit.nom}" souhaite rejoindre votre Réseau Professionnel`,
          JSON.stringify({ affiliation_id: r.lastInsertRowid, init_id: myInit.id })
        );
        return sendJSON(res, 201, { id: r.lastInsertRowid });
      } catch(e) {
        if (e.message?.includes('UNIQUE')) return sendJSON(res, 409, { error: "Une demande existe déjà pour ce réseau." });
        throw e;
      }
    }

    /* PATCH /api/reseau/affiliations/:id — traiter une demande */
    if (req.method === "PATCH" && /^\/api\/reseau\/affiliations\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const affId = parseInt(pathname.split('/')[4]);
      const aff = db.prepare(`SELECT ra.*, i.owner_user_id, i.nom AS dest_nom FROM reseau_affiliations ra JOIN initiatives i ON i.id=ra.destinataire_id WHERE ra.id=?`).get(affId);
      if (!aff) return sendJSON(res, 404, { error: "Demande introuvable." });
      if (aff.owner_user_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const { statut, reponse, mise_en_avant } = body;
      if (statut) {
        db.prepare(`UPDATE reseau_affiliations SET statut=?,reponse=COALESCE(?,reponse),updated_at=datetime('now') WHERE id=?`).run(statut, reponse||null, affId);
        // Notification au demandeur
        const demInit = db.prepare(`SELECT * FROM initiatives WHERE id=?`).get(aff.demandeur_id);
        if (demInit?.owner_user_id) {
          const msgs = { accepte:`Votre demande d'affiliation au réseau "${aff.dest_nom}" a été acceptée !`, refuse:`Votre demande d'affiliation au réseau "${aff.dest_nom}" a été refusée.`, info_demandee:`Des informations complémentaires vous sont demandées pour rejoindre "${aff.dest_nom}".`, suspendu:`Votre affiliation au réseau "${aff.dest_nom}" a été suspendue.` };
          if (msgs[statut]) db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(demInit.owner_user_id,'reseau_statut',`Réseau professionnel`,msgs[statut],JSON.stringify({affiliation_id:affId}));
        }
      }
      if (mise_en_avant !== undefined) db.prepare(`UPDATE reseau_affiliations SET mise_en_avant=? WHERE id=?`).run(mise_en_avant?1:0, affId);
      return sendJSON(res, 200, { ok: true });
    }

    /* DELETE /api/reseau/affiliations/:id — retirer du réseau */
    if (req.method === "DELETE" && /^\/api\/reseau\/affiliations\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const affId = parseInt(pathname.split('/')[4]);
      const aff = db.prepare(`SELECT ra.*, id.owner_user_id AS dest_owner, id2.owner_user_id AS dem_owner FROM reseau_affiliations ra JOIN initiatives id ON id.id=ra.destinataire_id JOIN initiatives id2 ON id2.id=ra.demandeur_id WHERE ra.id=?`).get(affId);
      if (!aff) return sendJSON(res, 404, { error: "Affiliation introuvable." });
      if (aff.dest_owner !== me.id && aff.dem_owner !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      db.prepare(`DELETE FROM reseau_affiliations WHERE id=?`).run(affId);
      return sendJSON(res, 200, { ok: true });
    }

    /* POST /api/reseau/:id/recommander — recommander une initiative */
    if (req.method === "POST" && /^\/api\/reseau\/\d+\/recommander$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const targetId = parseInt(pathname.split('/')[3]);
      const myInit = getMyInit(me.id);
      if (!myInit?.numero_immatriculation) return sendJSON(res, 400, { error: "Votre initiative doit être immatriculée pour recommander." });
      if (myInit.id === targetId) return sendJSON(res, 400, { error: "Impossible de se recommander soi-même." });
      const { contenu } = body;
      try {
        db.prepare(`INSERT INTO reseau_recommandations(initiative_id,auteur_initiative_id,contenu) VALUES(?,?,?)`).run(targetId, myInit.id, contenu||null);
        const target = db.prepare(`SELECT owner_user_id, nom FROM initiatives WHERE id=?`).get(targetId);
        if (target?.owner_user_id) db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(target.owner_user_id,'reseau_reco',`Nouvelle recommandation`,`"${myInit.nom}" a recommandé votre initiative.`,JSON.stringify({init_id:targetId}));
        return sendJSON(res, 201, { ok: true });
      } catch(e) {
        if (e.message?.includes('UNIQUE')) return sendJSON(res, 409, { error: "Vous avez déjà recommandé cette initiative." });
        throw e;
      }
    }

    /* DELETE /api/reseau/:id/recommander — retirer sa recommandation */
    if (req.method === "DELETE" && /^\/api\/reseau\/\d+\/recommander$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const targetId = parseInt(pathname.split('/')[3]);
      const myInit = getMyInit(me.id);
      if (!myInit) return sendJSON(res, 400, { error: "Aucune initiative." });
      db.prepare(`DELETE FROM reseau_recommandations WHERE initiative_id=? AND auteur_initiative_id=?`).run(targetId, myInit.id);
      return sendJSON(res, 200, { ok: true });
    }

    /* PATCH /api/reseau/me/profil — enrichir le profil réseau */
    if (req.method === "PATCH" && pathname === "/api/reseau/me/profil") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const myInit = getMyInit(me.id);
      if (!myInit) return sendJSON(res, 404, { error: "Aucune initiative." });
      const { numero_immatriculation, pays_immatriculation, taille_structure, annee_creation, services, langues, reseau_visible, accepte_messages } = body;
      db.prepare(`UPDATE initiatives SET
        numero_immatriculation=COALESCE(?,numero_immatriculation),
        pays_immatriculation=COALESCE(?,pays_immatriculation),
        taille_structure=COALESCE(?,taille_structure),
        annee_creation=COALESCE(?,annee_creation),
        services=COALESCE(?,services),
        langues=COALESCE(?,langues),
        reseau_visible=COALESCE(?,reseau_visible),
        accepte_messages=COALESCE(?,accepte_messages)
        WHERE id=?`).run(
        numero_immatriculation||null, pays_immatriculation||null,
        taille_structure||null, annee_creation||null,
        services!==undefined?JSON.stringify(services):null,
        langues!==undefined?JSON.stringify(langues):null,
        reseau_visible!==undefined?(reseau_visible?1:0):null,
        accepte_messages!==undefined?(accepte_messages?1:0):null,
        myInit.id
      );
      return sendJSON(res, 200, { ok: true });
    }

    /* ============================================================
       MODULE RÉUNIONS COLLABORATIVES
    ============================================================ */

    /* POST /api/reunions — créer une réunion */
    if (req.method === "POST" && pathname === "/api/reunions") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const { titre, description, type, acces, date_debut, date_fin, ordre_du_jour, enregistrement_active } = body;
      if (!titre || !date_debut) return sendJSON(res, 400, { error: "Titre et date de début requis." });
      const jitsi_room = `diaspoactif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const r = db.prepare(`INSERT INTO reunions(titre,description,type,acces,date_debut,date_fin,ordre_du_jour,enregistrement_active,jitsi_room,organisateur_id)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
        titre.trim(), description||null, type||'reunion', acces||'prive',
        date_debut, date_fin||null, ordre_du_jour||null, enregistrement_active?1:0, jitsi_room, me.id
      );
      /* L'organisateur est invité comme coorganisateur + accepté */
      db.prepare(`INSERT OR IGNORE INTO reunion_invites(reunion_id,user_id,role,statut) VALUES(?,?,?,?)`).run(r.lastInsertRowid, me.id, 'coorganisateur', 'accepte');
      return sendJSON(res, 201, { id: r.lastInsertRowid, jitsi_room });
    }

    /* GET /api/reunions — liste des réunions */
    if (req.method === "GET" && pathname === "/api/reunions") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const { statut, search, role } = qs;
      let where = `WHERE (r.organisateur_id=? OR ri.user_id=?)`;
      const params = [me.id, me.id];
      if (statut) { where += ` AND r.statut=?`; params.push(statut); }
      if (search) { where += ` AND (r.titre LIKE ? OR r.description LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
      const rows = db.prepare(`
        SELECT DISTINCT r.*, u.prenom AS org_prenom, u.nom AS org_nom, u.photo_url AS org_photo,
          ri2.statut AS mon_statut, ri2.role AS mon_role,
          (SELECT COUNT(*) FROM reunion_invites WHERE reunion_id=r.id AND statut='accepte') AS nb_participants
        FROM reunions r
        LEFT JOIN reunion_invites ri ON ri.reunion_id=r.id AND ri.user_id=?
        LEFT JOIN reunion_invites ri2 ON ri2.reunion_id=r.id AND ri2.user_id=?
        JOIN users u ON u.id=r.organisateur_id
        ${where}
        ORDER BY r.date_debut DESC LIMIT 100
      `).all(me.id, me.id, ...params);
      return sendJSON(res, 200, { reunions: rows });
    }

    /* GET /api/reunions/decisions — toutes mes décisions */
    if (req.method === "GET" && pathname === "/api/reunions/decisions") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const decisions = db.prepare(`
        SELECT d.*, r.titre AS reunion_titre, r.date_debut, u.prenom, u.nom, u.photo_url
        FROM reunion_decisions d
        JOIN reunions r ON r.id=d.reunion_id
        LEFT JOIN users u ON u.id=d.responsable_id
        WHERE d.responsable_id=? OR r.organisateur_id=?
        ORDER BY d.echeance ASC, d.created_at DESC LIMIT 200
      `).all(me.id, me.id);
      return sendJSON(res, 200, { decisions });
    }

    /* GET /api/reunions/:id — détail réunion */
    if (req.method === "GET" && /^\/api\/reunions\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const reunion = db.prepare(`
        SELECT r.*, u.prenom AS org_prenom, u.nom AS org_nom, u.photo_url AS org_photo
        FROM reunions r JOIN users u ON u.id=r.organisateur_id WHERE r.id=?
      `).get(rid);
      if (!reunion) return sendJSON(res, 404, { error: "Réunion introuvable." });
      const invites = db.prepare(`
        SELECT ri.*, u.prenom, u.nom, u.photo_url, u.role AS user_role
        FROM reunion_invites ri JOIN users u ON u.id=ri.user_id WHERE ri.reunion_id=?
        ORDER BY ri.role DESC, u.prenom ASC
      `).all(rid);
      const myInvite = invites.find(i => i.user_id === me.id);
      const canAccess = reunion.organisateur_id === me.id || myInvite || me.role === 'administrateur';
      if (!canAccess) return sendJSON(res, 403, { error: "Accès refusé." });
      return sendJSON(res, 200, { reunion, invites, myInvite: myInvite || null });
    }

    /* PATCH /api/reunions/:id — modifier */
    if (req.method === "PATCH" && /^\/api\/reunions\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const r = db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
      if (!r) return sendJSON(res, 404, { error: "Réunion introuvable." });
      if (r.organisateur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const { titre, description, date_debut, date_fin, ordre_du_jour, statut } = body;
      db.prepare(`UPDATE reunions SET titre=COALESCE(?,titre),description=COALESCE(?,description),date_debut=COALESCE(?,date_debut),date_fin=COALESCE(?,date_fin),ordre_du_jour=COALESCE(?,ordre_du_jour),statut=COALESCE(?,statut) WHERE id=?`)
        .run(titre||null, description||null, date_debut||null, date_fin||null, ordre_du_jour||null, statut||null, rid);
      return sendJSON(res, 200, { ok: true });
    }

    /* PATCH /api/reunions/:id/start — démarrer */
    if (req.method === "PATCH" && /^\/api\/reunions\/\d+\/start$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const r = db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
      if (!r) return sendJSON(res, 404, { error: "Réunion introuvable." });
      if (r.organisateur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      db.prepare(`UPDATE reunions SET statut='en_cours', started_at=datetime('now') WHERE id=?`).run(rid);
      return sendJSON(res, 200, { ok: true });
    }

    /* PATCH /api/reunions/:id/end — terminer */
    if (req.method === "PATCH" && /^\/api\/reunions\/\d+\/end$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const r = db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
      if (!r) return sendJSON(res, 404, { error: "Réunion introuvable." });
      if (r.organisateur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const now = new Date().toISOString();
      let duree = null;
      if (r.started_at) { duree = Math.round((new Date(now) - new Date(r.started_at)) / 60000); }
      db.prepare(`UPDATE reunions SET statut='terminee', ended_at=?, duree_minutes=? WHERE id=?`).run(now, duree, rid);
      /* Marquer quitte_at pour les présents */
      db.prepare(`UPDATE reunion_invites SET quitte_at=? WHERE reunion_id=? AND quitte_at IS NULL AND rejoint_at IS NOT NULL`).run(now, rid);
      /* Créer résumé brouillon si pas encore */
      try { db.prepare(`INSERT OR IGNORE INTO reunion_resumes(reunion_id,redacteur_id) VALUES(?,?)`).run(rid, me.id); } catch(e) {}
      return sendJSON(res, 200, { ok: true, duree_minutes: duree });
    }

    /* POST /api/reunions/:id/invites — inviter des participants */
    if (req.method === "POST" && /^\/api\/reunions\/\d+\/invites$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const r = db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
      if (!r) return sendJSON(res, 404, { error: "Réunion introuvable." });
      if (r.organisateur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const { users: userIds, role } = body; // userIds: array of user IDs
      if (!Array.isArray(userIds) || userIds.length === 0) return sendJSON(res, 400, { error: "Liste d'utilisateurs requise." });
      let added = 0;
      for (const uid of userIds) {
        try {
          db.prepare(`INSERT OR IGNORE INTO reunion_invites(reunion_id,user_id,role) VALUES(?,?,?)`).run(rid, uid, role||'participant');
          /* Notification */
          const org = db.prepare(`SELECT prenom,nom FROM users WHERE id=?`).get(me.id);
          db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(
            uid, 'reunion_invite', `Invitation à une réunion`,
            `${org?.prenom||''} ${org?.nom||''} vous invite à "${r.titre}"`,
            JSON.stringify({ reunion_id: rid })
          );
          added++;
        } catch(e) {}
      }
      return sendJSON(res, 200, { added });
    }

    /* PATCH /api/reunions/:id/invites/me — accepter ou refuser */
    if (req.method === "PATCH" && /^\/api\/reunions\/\d+\/invites\/me$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const { statut } = body;
      if (!['accepte','refuse'].includes(statut)) return sendJSON(res, 400, { error: "Statut invalide." });
      db.prepare(`UPDATE reunion_invites SET statut=? WHERE reunion_id=? AND user_id=?`).run(statut, rid, me.id);
      if (statut === 'accepte') {
        /* Ajouter à l'agenda */
        const r = db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
        if (r) {
          try {
            db.prepare(`INSERT OR IGNORE INTO agenda_events(user_id,titre,description,date_debut,date_fin,couleur,type,source_id,source_type)
              VALUES(?,?,?,?,?,?,?,?,?)`).run(
              me.id, `📹 ${r.titre}`, r.description||`Réunion ${r.type}`,
              r.date_debut, r.date_fin||r.date_debut, '#7c3aed', 'reunion', rid, 'reunion'
            );
          } catch(e) {}
        }
      }
      return sendJSON(res, 200, { ok: true });
    }

    /* POST /api/reunions/:id/presence — pointer arrivée */
    if (req.method === "POST" && /^\/api\/reunions\/\d+\/presence$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      db.prepare(`UPDATE reunion_invites SET rejoint_at=COALESCE(rejoint_at,datetime('now')),statut='accepte' WHERE reunion_id=? AND user_id=?`).run(rid, me.id);
      return sendJSON(res, 200, { ok: true });
    }

    /* PATCH /api/reunions/:id/presence — pointer départ */
    if (req.method === "PATCH" && /^\/api\/reunions\/\d+\/presence$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const inv = db.prepare(`SELECT * FROM reunion_invites WHERE reunion_id=? AND user_id=?`).get(rid, me.id);
      const now = new Date().toISOString();
      let duree = null;
      if (inv?.rejoint_at) { duree = Math.round((new Date(now) - new Date(inv.rejoint_at)) / 60000); }
      db.prepare(`UPDATE reunion_invites SET quitte_at=?, duree_presence_minutes=? WHERE reunion_id=? AND user_id=?`).run(now, duree, rid, me.id);
      return sendJSON(res, 200, { ok: true, duree_minutes: duree });
    }

    /* GET /api/reunions/:id/resume — obtenir le résumé */
    if (req.method === "GET" && /^\/api\/reunions\/\d+\/resume$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const resume = db.prepare(`SELECT rr.*, u.prenom AS red_prenom, u.nom AS red_nom FROM reunion_resumes rr LEFT JOIN users u ON u.id=rr.redacteur_id WHERE rr.reunion_id=?`).get(rid);
      const decisions = db.prepare(`SELECT d.*, u.prenom, u.nom FROM reunion_decisions d LEFT JOIN users u ON u.id=d.responsable_id WHERE d.reunion_id=? ORDER BY d.created_at ASC`).all(rid);
      return sendJSON(res, 200, { resume: resume || null, decisions });
    }

    /* PUT /api/reunions/:id/resume — sauvegarder le résumé */
    if (req.method === "PUT" && /^\/api\/reunions\/\d+\/resume$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const r = db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
      if (!r) return sendJSON(res, 404, { error: "Réunion introuvable." });
      const canEdit = r.organisateur_id === me.id || me.role === 'administrateur';
      if (!canEdit) return sendJSON(res, 403, { error: "Accès refusé." });
      const { sujets, decisions: decisionsData, actions, notes } = body;
      db.prepare(`INSERT INTO reunion_resumes(reunion_id,redacteur_id,sujets,decisions,actions,notes,updated_at)
        VALUES(?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(reunion_id) DO UPDATE SET sujets=excluded.sujets,decisions=excluded.decisions,actions=excluded.actions,notes=excluded.notes,redacteur_id=excluded.redacteur_id,updated_at=datetime('now')
      `).run(rid, me.id, JSON.stringify(sujets||[]), JSON.stringify(decisionsData||[]), JSON.stringify(actions||[]), notes||null);
      return sendJSON(res, 200, { ok: true });
    }

    /* PATCH /api/reunions/:id/resume/valider — valider le résumé */
    if (req.method === "PATCH" && /^\/api\/reunions\/\d+\/resume\/valider$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const r = db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
      if (!r || (r.organisateur_id !== me.id && me.role !== 'administrateur')) return sendJSON(res, 403, { error: "Accès refusé." });
      db.prepare(`UPDATE reunion_resumes SET statut='valide',valide_at=datetime('now'),valide_par=? WHERE reunion_id=?`).run(me.id, rid);
      return sendJSON(res, 200, { ok: true });
    }

    /* POST /api/reunions/:id/resume/partager — envoyer résumé via messagerie */
    if (req.method === "POST" && /^\/api\/reunions\/\d+\/resume\/partager$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const r = db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
      if (!r) return sendJSON(res, 404, { error: "Réunion introuvable." });
      const resume = db.prepare(`SELECT * FROM reunion_resumes WHERE reunion_id=?`).get(rid);
      const { user_ids } = body; // array of user IDs to send to
      if (!Array.isArray(user_ids) || user_ids.length === 0) return sendJSON(res, 400, { error: "Destinataires requis." });
      const contenu = `📋 Résumé de réunion : **${r.titre}**\n\nDate : ${r.date_debut ? r.date_debut.slice(0,10) : '—'}\n\n${resume?.notes || 'Aucune note.'}\n\n_Consultez le résumé complet sur Diaspo'Actif_`;
      let sent = 0;
      for (const uid of user_ids) {
        try {
          db.prepare(`INSERT INTO messages(expediteur_id,destinataire_id,contenu) VALUES(?,?,?)`).run(me.id, uid, contenu);
          sent++;
        } catch(e) {}
      }
      return sendJSON(res, 200, { sent });
    }

    /* POST /api/reunions/:id/decisions — ajouter une décision */
    if (req.method === "POST" && /^\/api\/reunions\/\d+\/decisions$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const { titre, description, responsable_id, type_suivi, echeance } = body;
      if (!titre) return sendJSON(res, 400, { error: "Titre requis." });
      const d = db.prepare(`INSERT INTO reunion_decisions(reunion_id,titre,description,responsable_id,type_suivi,echeance) VALUES(?,?,?,?,?,?)`)
        .run(rid, titre.trim(), description||null, responsable_id||null, type_suivi||'action', echeance||null);
      if (responsable_id) {
        const r = db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
        try {
          db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(
            responsable_id, 'reunion_decision', `Action assignée`,
            `Vous avez été désigné responsable de : "${titre}" (réunion "${r?.titre||'—'}")`,
            JSON.stringify({ reunion_id: rid, decision_id: d.lastInsertRowid })
          );
          if (echeance) {
            db.prepare(`INSERT OR IGNORE INTO agenda_events(user_id,titre,date_debut,couleur,type) VALUES(?,?,?,?,?)`).run(
              responsable_id, `✅ ${titre}`, echeance.slice(0,10), '#10b981', 'tache'
            );
          }
        } catch(e) {}
      }
      return sendJSON(res, 201, { id: d.lastInsertRowid });
    }

    /* PATCH /api/decisions/:id — modifier statut d'une décision */
    if (req.method === "PATCH" && /^\/api\/decisions\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const did = parseInt(pathname.split('/')[3]);
      const { statut, echeance } = body;
      db.prepare(`UPDATE reunion_decisions SET statut=COALESCE(?,statut),echeance=COALESCE(?,echeance) WHERE id=?`).run(statut||null, echeance||null, did);
      return sendJSON(res, 200, { ok: true });
    }

    /* GET /api/reunions/search — recherche avancée */
    if (req.method === "GET" && pathname === "/api/reunions/search") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const { q } = qs;
      if (!q) return sendJSON(res, 200, { reunions: [] });
      const rows = db.prepare(`
        SELECT DISTINCT r.*, u.prenom AS org_prenom, u.nom AS org_nom
        FROM reunions r
        LEFT JOIN reunion_invites ri ON ri.reunion_id=r.id
        LEFT JOIN reunion_resumes rr ON rr.reunion_id=r.id
        JOIN users u ON u.id=r.organisateur_id
        WHERE (r.organisateur_id=? OR ri.user_id=?)
          AND (r.titre LIKE ? OR r.description LIKE ? OR rr.notes LIKE ?)
        ORDER BY r.date_debut DESC LIMIT 50
      `).all(me.id, me.id, `%${q}%`, `%${q}%`, `%${q}%`);
      return sendJSON(res, 200, { reunions: rows });
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
