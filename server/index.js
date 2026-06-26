/* ===========================================================
   DIASPO'ACTIF — Serveur (HTTP natif Node, sans dépendance externe)
   =========================================================== */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const url = require("node:url");
const db = require("./db");
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
  const publications = db.prepare("SELECT id,type,categorie,contenu,created_at FROM fil_posts WHERE auteur_id=? ORDER BY id DESC LIMIT 5").all(u.id);
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

  /* ===========================
     COMMUNICATIONS INSTITUTIONNELLES
  =========================== */
  route("POST", "/api/communications", async (req, res, params, body) => {
    const user = getCurrentUser(req);
    if (!user || !["collectivite","administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé aux collectivités et administrateurs." });
    const { titre, contenu, type, cible } = body;
    if (!titre || !contenu) return sendJSON(res, 400, { error: "titre et contenu requis." });
    // Compter les destinataires potentiels (membres non désabonnés)
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
    const id = db.prepare("INSERT INTO communications_institutionnelles (emetteur_id,titre,contenu,type,cible_json,nb_destinataires) VALUES (?,?,?,?,?,?)")
      .run(user.id, titre, contenu, type||"info", JSON.stringify(cible||{}), nb).lastInsertRowid;
    // Publication aussi sur le fil
    try {
      db.prepare("INSERT INTO fil_posts (auteur_id,auteur_nom,type,categorie,contenu) VALUES (?,?,?,?,?)")
        .run(user.id, user.nom, "institutionnel", type||"info", `**${titre}**\n\n${contenu}`);
    } catch(e) {}
    sendJSON(res, 201, { id, nb_destinataires: nb });
  });

  route("GET", "/api/communications", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user || !["collectivite","administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé aux collectivités." });
    const rows = db.prepare("SELECT * FROM communications_institutionnelles WHERE emetteur_id=? ORDER BY created_at DESC LIMIT 50").all(user.id);
    sendJSON(res, 200, { communications: rows });
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

/* GET /api/chatbot/context — public */
route("GET", "/api/chatbot/context", async (req, res) => {
  const memories = db.prepare("SELECT id, titre, contenu, ordre FROM chatbot_memoire ORDER BY ordre ASC, created_at ASC").all();
  const siteContent = await scrapeSite();
  sendJSON(res, 200, { memories, siteContent });
});

/* GET /api/chatbot/memoire — admin */
route("GET", "/api/chatbot/memoire", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const rows = db.prepare("SELECT * FROM chatbot_memoire ORDER BY ordre ASC, created_at ASC").all();
  sendJSON(res, 200, { memoires: rows });
});

/* POST /api/chatbot/memoire — admin */
route("POST", "/api/chatbot/memoire", async (req, res, params, body) => {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const { titre, contenu, ordre = 0 } = body || {};
  if (!titre?.trim() || !contenu?.trim()) return sendJSON(res, 400, { error: "Titre et contenu requis." });
  const r = db.prepare("INSERT INTO chatbot_memoire (titre, contenu, ordre) VALUES (?, ?, ?)").run(titre.trim(), contenu.trim(), ordre);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* PUT /api/chatbot/memoire/:id — admin */
route("PUT", "/api/chatbot/memoire/:id", async (req, res, params, body) => {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const { titre, contenu, ordre } = body || {};
  db.prepare("UPDATE chatbot_memoire SET titre=COALESCE(?,titre), contenu=COALESCE(?,contenu), ordre=COALESCE(?,ordre) WHERE id=?")
    .run(titre||null, contenu||null, ordre!=null?ordre:null, params.id);
  sendJSON(res, 200, { ok: true });
});

/* DELETE /api/chatbot/memoire/:id — admin */
route("DELETE", "/api/chatbot/memoire/:id", async (req, res, params) => {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  db.prepare("DELETE FROM chatbot_memoire WHERE id = ?").run(params.id);
  sendJSON(res, 200, { ok: true });
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
      return sendJSON(res, 200, cv);
    }

    /* --- POST /api/cv — créer ou mettre à jour un CV (upsert par numero) --- */
    if (req.method === "POST" && pathname === "/api/cv") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const { numero = 1, titre = 'Mon CV', theme = 'bleu', data = {} } = body;
      if (![1, 2].includes(Number(numero))) return sendJSON(res, 400, { error: "numero doit être 1 ou 2" });
      const existing = db.prepare(`SELECT id FROM cv_profiles WHERE user_id = ? AND numero = ?`).get(me.id, numero);
      if (existing) {
        db.prepare(`UPDATE cv_profiles SET titre=?, theme=?, data_json=?, updated_at=datetime('now') WHERE id=?`)
          .run(titre, theme, JSON.stringify(data), existing.id);
        return sendJSON(res, 200, { id: existing.id, saved: true });
      } else {
        const r = db.prepare(`INSERT INTO cv_profiles(user_id,numero,titre,theme,data_json) VALUES(?,?,?,?,?)`)
          .run(me.id, numero, titre, theme, JSON.stringify(data));
        return sendJSON(res, 201, { id: r.lastInsertRowid, saved: true });
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
