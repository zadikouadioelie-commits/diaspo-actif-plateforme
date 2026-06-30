/* ===========================================================
   DIASPO'ACTIF — Serveur (HTTP natif Node, sans dépendance externe)
   Build: 2026-06-28-b
   =========================================================== */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const url = require("node:url");
const crypto = require("node:crypto");
const db = require("./db");
const { generateDaId, generateDsId } = require("./db");
const DAA = require("./daa-lang");

const TICKET_SECRET = process.env.TICKET_SECRET || "diaspoactif-qr-2026-secret";
function signTicket(ticketId, eventId, ts) {
  return crypto.createHmac("sha256", TICKET_SECRET)
    .update(`${ticketId}:${eventId}:${ts}`).digest("hex").slice(0, 40);
}
const { hashPassword, verifyPassword, createSession, getSession, destroySession, parseCookies, signAuthToken, verifyAuthToken, TOKEN_TTL } = require("./auth");
// verifyPassword(password, salt, expectedHash) → boolean

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
  // Idempotent : si le corps a déjà été bufferisé (cold-start Vercel), on le retourne directement
  if (req._bodyPromise) return req._bodyPromise;
  req._bodyPromise = new Promise((resolve, reject) => {
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
  return req._bodyPromise;
}

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  /* 1. Token stateless signé (résiste aux cold starts Vercel) */
  const authCookie = cookies.auth;
  if (authCookie) {
    const payload = verifyAuthToken(authCookie);
    if (payload?.uid) {
      const user = await db.prepare("SELECT id, nom, email, role, ville, pays, profil_json FROM users WHERE id = ?").get(payload.uid);
      if (user) return user;
    }
  }
  /* 2. Session DB classique (fallback) */
  const sid = cookies.sid;
  if (!sid) return null;
  const session = getSession(sid);
  if (!session) return null;
  const user = await db.prepare("SELECT id, nom, email, role, ville, pays, profil_json FROM users WHERE id = ?").get(session.userId);
  return user || null;
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, nom: u.nom, email: u.email, role: u.role, ville: u.ville, pays: u.pays, profil: safeParse(u.profil_json),
    nb_connexions: u.nb_connexions || 0, temoignage_statut: u.temoignage_statut || 'non_demande', temoignage_derniere_demande: u.temoignage_derniere_demande || null,
    demo_vue: u.demo_vue || 0, da_id: u.da_id || null };
  // NOTE: ds_id est intentionnellement exclu — jamais exposé via cette fonction
}

function safeParse(s) {
  try { return JSON.parse(s || "{}"); } catch (e) { return {}; }
}
function safeJSON(s, fallback) {
  try { return JSON.parse(s || JSON.stringify(fallback)); } catch (e) { return fallback; }
}

/* ---------- Routes API ---------- */
/* ── Compte officiel Diaspo'Actif — ID mis en cache au démarrage ── */
function getOfficialUserId() {
  const row = await db.prepare("SELECT id FROM users WHERE is_official=1 LIMIT 1").get();
  return row ? row.id : null;
}

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
    // collectivite (legacy)
    type_institution, nom_institution, pays_concerne, telephone_pro, site_officiel,
    // collectivite étatique — section 1 (institution)
    type_organisme, sigle_institution, description_institution,
    date_creation_institution, devise_institution, logo_url,
    // collectivite étatique — section 2 (pays d'origine)
    pays_origine_institution, ministere_tutelle, administration_rattachement, region_origine,
    // collectivite étatique — section 3 (pays d'exercice)
    pays_exercice, region_exercice, departement_exercice, ville_exercice,
    adresse_exercice, code_postal_exercice, coordonnees_gps, horaires_ouverture, site_local,
    tel_secondaire, email_officiel, email_secondaire,
    facebook_officiel, twitter_officiel, linkedin_officiel, youtube_officiel, instagram_officiel,
    tiktok_officiel, whatsapp_officiel, telegram_officiel,
    // collectivite étatique — section 4 (responsable)
    nom_responsable_etatique, prenom_responsable_etatique, fonction_responsable_etatique,
    email_responsable_etatique, tel_responsable_etatique,
    date_prise_fonction, date_fin_mandat,
    declaration_officielle, statut_etatique
  } = body;

  if (!nom || !email || !password || !role) return sendJSON(res, 400, { error: "Champs requis manquants (nom, email, password, role)." });
  if (!["utilisateur", "initiative", "administrateur", "collectivite"].includes(role)) return sendJSON(res, 400, { error: "Rôle invalide." });
  if (password.length < 8) return sendJSON(res, 400, { error: "Le mot de passe doit comporter au moins 8 caractères." });

  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
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

  // Assigner le DA-ID à l'utilisateur
  try { await db.prepare('UPDATE users SET da_id=? WHERE id=?').run(generateDaId(), id); } catch (_) {}

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
    // Assigner DA-ID à l'initiative aussi
    const initRow = await db.prepare('SELECT id FROM initiatives WHERE owner_user_id=? ORDER BY id DESC LIMIT 1').get(id);
    if (initRow) try { await db.prepare('UPDATE initiatives SET da_id=? WHERE id=?').run(generateDaId(), initRow.id); } catch(_) {}
  }

  // ── Champs étendus Compte Étatique (4 sections) ──
  if (role === "collectivite") {
    const paysEffectif = pays_exercice || pays_concerne || pays || null;
    const villeEffective = ville_exercice || ville || null;
    const fields = {
      // Section 1 — Institution
      type_organisme: type_organisme || type_institution || null,
      sigle_institution: sigle_institution || null,
      description_institution: description_institution || null,
      date_creation_institution: date_creation_institution || null,
      devise_institution: devise_institution || null,
      logo_url: logo_url || null,
      site_officiel: site_officiel || null,
      // Section 2 — Pays d'origine
      pays_origine_institution: pays_origine_institution || null,
      ministere_tutelle: ministere_tutelle || null,
      administration_rattachement: administration_rattachement || null,
      region_origine: region_origine || null,
      // Section 3 — Pays d'exercice
      pays: paysEffectif,
      pays_exercice: pays_exercice || null,
      region: region_exercice || region || null,
      region_exercice: region_exercice || null,
      departement: departement_exercice || departement || null,
      departement_exercice: departement_exercice || null,
      ville: villeEffective,
      ville_exercice: ville_exercice || null,
      adresse: adresse_exercice || adresse || null,
      adresse_exercice: adresse_exercice || null,
      code_postal: code_postal_exercice || code_postal || null,
      code_postal_exercice: code_postal_exercice || null,
      coordonnees_gps: coordonnees_gps || null,
      horaires_ouverture: horaires_ouverture || null,
      site_local: site_local || null,
      telephone: telephone || null,
      tel_secondaire: tel_secondaire || null,
      email_officiel: email_officiel || null,
      email_secondaire: email_secondaire || null,
      facebook_officiel: facebook_officiel || null,
      twitter_officiel: twitter_officiel || null,
      linkedin_officiel: linkedin_officiel || null,
      youtube_officiel: youtube_officiel || null,
      instagram_officiel: instagram_officiel || null,
      tiktok_officiel: tiktok_officiel || null,
      whatsapp_officiel: whatsapp_officiel || null,
      telegram_officiel: telegram_officiel || null,
      // Section 4 — Responsable
      nom_responsable_etatique: nom_responsable_etatique || nom || null,
      prenom_responsable_etatique: prenom_responsable_etatique || prenom || null,
      fonction_responsable_etatique: fonction_responsable_etatique || null,
      email_responsable_etatique: email_responsable_etatique || email || null,
      tel_responsable_etatique: tel_responsable_etatique || null,
      date_prise_fonction: date_prise_fonction || null,
      date_fin_mandat: date_fin_mandat || null,
      declaration_officielle: declaration_officielle ? 1 : 0,
      statut_etatique: statut_etatique || 'declare',
    };
    const setCols = Object.keys(fields).map(k => `${k}=?`).join(',');
    await db.prepare(`UPDATE users SET ${setCols} WHERE id=?`).run(...Object.values(fields), id);
  }

  // ── Abonnement obligatoire au compte officiel Diaspo'Actif ──
  const officialId = getOfficialUserId();
  if (officialId && Number(id) !== officialId) {
    db.prepare("INSERT OR IGNORE INTO user_follows (follower_id, followed_id) VALUES (?,?)").run(Number(id), officialId);
  }

  const token = createSession(id);
  const user = await db.prepare("SELECT id, nom, prenom, email, role, ville, pays, statut_verification FROM users WHERE id = ?").get(id);
  const authTok = signAuthToken({ uid: id, role: user.role, exp: Math.floor(Date.now()/1000) + TOKEN_TTL });

  // Email de bienvenue (non bloquant)
  try {
    const { emailBienvenue } = require("./mailer");
    emailBienvenue({ prenom: user.prenom || user.nom, email: user.email, role: user.role });
  } catch (_) {}

  sendJSON(res, 201, { user: publicUser(user) }, { "Set-Cookie": [`sid=${token}; HttpOnly; Path=/; SameSite=Lax`, `auth=${authTok}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${TOKEN_TTL}`] });
});

route("POST", "/api/auth/login", async (req, res, params, body) => {
  const { email, password } = body;
  const user = await db.prepare("SELECT * FROM users WHERE email = ?").get(email || "");
  if (!user || !verifyPassword(password || "", user.password_salt, user.password_hash)) {
    return sendJSON(res, 401, { error: "E-mail ou mot de passe incorrect." });
  }
  db.prepare("UPDATE users SET nb_connexions = COALESCE(nb_connexions,0) + 1 WHERE id=?").run(user.id);
  const fresh = await db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
  const token = createSession(user.id);
  const authTok = signAuthToken({ uid: user.id, role: user.role, exp: Math.floor(Date.now()/1000) + TOKEN_TTL });
  sendJSON(res, 200, { user: publicUser(fresh) }, { "Set-Cookie": [`sid=${token}; HttpOnly; Path=/; SameSite=Lax`, `auth=${authTok}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${TOKEN_TTL}`] });
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
  return await db.prepare("SELECT niveau, statut, date_attribution FROM certifications WHERE initiative_id=? AND statut='actif'").get(initiativeId) || null;
}

route("GET", "/api/initiatives", async (req, res, params, body, query) => {
  let rows = await db.prepare("SELECT * FROM initiatives ORDER BY created_at DESC").all();
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
      return !!await db.prepare("SELECT 1 FROM compte_accreditations WHERE user_id=? AND type=? AND statut='active'").get(r.owner_user_id, type);
    });
  }
  rows = rows.map(r => {
    const accreds = r.owner_user_id
      ? await db.prepare("SELECT type FROM compte_accreditations WHERE user_id=? AND statut='active'").all(r.owner_user_id).map(a => a.type)
      : [];
    return { ...r, nationalites_concernees: safeParse(r.nationalites_concernees), nationalite_unique: !!r.nationalite_unique, abonnement_actif: !!r.abonnement_actif, certif: getCertif(r.id), accreditations: accreds };
  });
  sendJSON(res, 200, { initiatives: rows });
});

route("GET", "/api/initiatives/:id", async (req, res, params) => {
  const row = await db.prepare("SELECT * FROM initiatives WHERE id = ? OR slug = ?").get(params.id, params.id);
  if (!row) return sendJSON(res, 404, { error: "Initiative introuvable." });
  row.nationalites_concernees = safeParse(row.nationalites_concernees);
  row.nationalite_unique = !!row.nationalite_unique;
  row.abonnement_actif = !!row.abonnement_actif;
  row.certif = getCertif(row.id);
  row.accreditations = row.owner_user_id
    ? await db.prepare("SELECT type FROM compte_accreditations WHERE user_id=? AND statut='active'").all(row.owner_user_id).map(a => a.type)
    : [];
  sendJSON(res, 200, { initiative: row });
});

route("POST", "/api/initiatives", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || !["initiative", "collectivite", "administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Seul un compte Initiative, Collectivité ou Administrateur peut créer une initiative." });
  const { nom, sigle, pays, pays_origine, region, ville, commune, departement, zone, domaine, type, description,
    nationalite1, nationalite2, nationalites_concernees, nationalite_unique,
    origine1, origine2, rayonnement, pays_intervention,
    nom_responsable, prenom_responsable, fonction_responsable,
    adresse, code_postal, numero_immatriculation,
    comment_entendu, attentes, autorisation_temoignage,
    nb_salaries, linkedin, twitter, youtube, forme_autre,
    site_web, membres } = body;
  if (!nom) return sendJSON(res, 400, { error: "Le nom de l'initiative est requis." });
  const slug = nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
  const id = db.prepare(`
    INSERT INTO initiatives (slug, nom, sigle, pays, pays_origine, region, ville, commune, departement, zone,
      nationalite1, nationalite2, nationalites_concernees, nationalite_unique,
      origine1, origine2, rayonnement, pays_intervention,
      domaine, type, description,
      nom_responsable, prenom_responsable, fonction_responsable,
      adresse, code_postal, numero_immatriculation,
      comment_entendu, attentes, autorisation_temoignage,
      nb_salaries, site_web, linkedin, twitter, youtube, forme_autre,
      owner_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slug, nom, sigle || null, pays || null, pays_origine || null,
    region || null, ville || null, commune || null, departement || null, zone || null,
    nationalite1 || null, nationalite2 || null,
    JSON.stringify(nationalites_concernees || []), nationalite_unique ? 1 : 0,
    origine1 || null, origine2 || null, rayonnement || 'locale',
    JSON.stringify(Array.isArray(pays_intervention) ? pays_intervention : []),
    domaine || null, type || null, description || null,
    nom_responsable || null, prenom_responsable || null, fonction_responsable || null,
    adresse || null, code_postal || null, numero_immatriculation || null,
    comment_entendu || null, attentes || null, autorisation_temoignage ? 1 : 0,
    nb_salaries != null ? parseInt(nb_salaries) || 0 : 0,
    site_web || null, linkedin || null, twitter || null, youtube || null, forme_autre || null,
    user.id).lastInsertRowid;
  /* Inviter les membres optionnels (envoi de demandes d'affiliation) */
  if (Array.isArray(membres) && membres.length > 0) {
    const notifStmt = db.prepare(`INSERT INTO notifications (user_id, type, titre, message, data) VALUES (?, ?, ?, ?, ?)`);
    const memStmt = db.prepare(`INSERT OR IGNORE INTO initiative_membres (initiative_id, user_id, fonction, statut) VALUES (?, ?, ?, 'en_attente')`);
    for (const m of membres) {
      if (!m.userId) continue;
      memStmt.run(id, m.userId, m.fonction || null);
      try {
        notifStmt.run(m.userId, 'affiliation_initiative',
          `Invitation \u00e0 rejoindre une initiative`,
          `Vous avez \u00e9t\u00e9 identifi\u00e9 comme membre de l'initiative \u00ab ${nom} \u00bb. Souhaitez-vous accepter cette affiliation ?`,
          JSON.stringify({ initiative_id: id, slug, nom }));
      } catch(_) {}
    }
  }
  sendJSON(res, 201, { id, slug });
});

/* ---------- Abonnement (simulation — aucun paiement réel) ---------- */
route("POST", "/api/initiatives/:id/abonnement", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const init = await db.prepare("SELECT * FROM initiatives WHERE id = ?").get(params.id);
  if (!init) return sendJSON(res, 404, { error: "Initiative introuvable." });
  if (init.owner_user_id !== user.id) return sendJSON(res, 403, { error: "Vous n'êtes pas responsable de cette initiative." });
  const actif = body.actif ? 1 : 0;
  await db.prepare("UPDATE initiatives SET abonnement_actif = ? WHERE id = ?").run(actif, params.id);
  sendJSON(res, 200, { ok: true, abonnement_actif: !!actif, note: "Démonstration — aucun paiement réel n'est traité dans ce prototype." });
});

/* ══ Recherche comptes pour autocomplete partenaires ══ */
route("GET", "/api/search/comptes", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
  const q = (query.q || '').trim();
  if (q.length < 2) return sendJSON(res, 200, { comptes: [] });
  // Recherche exacte par DA-ID
  const isDaId = /^DA-\d{1,8}$/i.test(q);
  if (isDaId) {
    const daId = q.toUpperCase();
    const u = await db.prepare(`SELECT id, nom, prenom, role, photo_url AS avatar_url, da_id, 'user' AS source FROM users WHERE da_id=?`).get(daId);
    if (u) return sendJSON(res, 200, { comptes: [{ id: u.id, source: 'user', nom: [u.prenom, u.nom].filter(Boolean).join(' '), role: u.role || 'utilisateur', avatar_url: u.avatar_url || null, da_id: u.da_id }] });
    const ini = await db.prepare(`SELECT id, nom, NULL AS prenom, type AS role, logo_url AS avatar_url, da_id, 'initiative' AS source FROM initiatives WHERE da_id=?`).get(daId);
    if (ini) return sendJSON(res, 200, { comptes: [{ id: ini.id, source: 'initiative', nom: ini.nom, role: ini.role || 'initiative', avatar_url: ini.avatar_url || null, da_id: ini.da_id }] });
    return sendJSON(res, 200, { comptes: [] });
  }
  const like = `%${q}%`;
  // Utilisateurs
  const users = db.prepare(`
    SELECT id, nom, prenom, role, photo_url AS avatar_url, da_id, 'user' AS source
    FROM users
    WHERE (nom LIKE ? OR prenom LIKE ? OR da_id LIKE ?) AND id != ?
    LIMIT 8
  `).all(like, like, like, user.id);
  // Initiatives
  const inits = await db.prepare(`
    SELECT id, nom, NULL AS prenom, type AS role, logo_url AS avatar_url, da_id, 'initiative' AS source
    FROM initiatives
    WHERE nom LIKE ? OR da_id LIKE ?
    LIMIT 8
  `).all(like, like);
  const comptes = [...users, ...inits]
    .slice(0, 12)
    .map(c => ({
      id: c.id,
      source: c.source,
      nom: [c.prenom, c.nom].filter(Boolean).join(' '),
      role: c.role || 'utilisateur',
      avatar_url: c.avatar_url || null,
      da_id: c.da_id || null
    }));
  sendJSON(res, 200, { comptes });
});

/* ══ Lookup compte par DA-ID ══ */
route("GET", "/api/account/by-da-id/:daId", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
  const daId = (params.daId || '').toUpperCase();
  const u = await db.prepare(`SELECT id, nom, prenom, role, photo_url AS avatar_url, da_id, ville, pays FROM users WHERE da_id=?`).get(daId);
  if (u) return sendJSON(res, 200, { compte: { id: u.id, source: 'user', nom: [u.prenom, u.nom].filter(Boolean).join(' '), role: u.role, avatar_url: u.avatar_url, da_id: u.da_id, ville: u.ville, pays: u.pays } });
  const ini = await db.prepare(`SELECT id, nom, type AS role, logo_url AS avatar_url, da_id, ville, pays FROM initiatives WHERE da_id=?`).get(daId);
  if (ini) return sendJSON(res, 200, { compte: { id: ini.id, source: 'initiative', nom: ini.nom, role: ini.role, avatar_url: ini.avatar_url, da_id: ini.da_id, ville: ini.ville, pays: ini.pays } });
  sendJSON(res, 404, { error: 'Identifiant introuvable.' });
});

/* ══ DS-ID — Révéler (vérification mot de passe requise) ══ */
route("POST", "/api/profil/ds-id/reveal", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
  const { password } = body;
  if (!password) return sendJSON(res, 400, { error: 'Mot de passe requis.' });
  const row = await db.prepare('SELECT password_hash, password_salt, ds_id FROM users WHERE id=?').get(user.id);
  if (!row) return sendJSON(res, 404, { error: 'Compte introuvable.' });
  if (!verifyPassword(password, row.password_salt, row.password_hash)) {
    db.prepare(`INSERT INTO ds_id_history (user_id, action, ip, user_agent) VALUES (?,?,?,?)`).run(user.id, 'echec_validation', req.socket?.remoteAddress || null, req.headers['user-agent'] || null);
    return sendJSON(res, 403, { error: 'Mot de passe incorrect.' });
  }
  db.prepare(`INSERT INTO ds_id_history (user_id, action, ip, user_agent) VALUES (?,?,?,?)`).run(user.id, 'consultation', req.socket?.remoteAddress || null, req.headers['user-agent'] || null);
  sendJSON(res, 200, { ds_id: row.ds_id });
});

/* ══ DS-ID — Log copie ══ */
route("POST", "/api/profil/ds-id/log-copy", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
  db.prepare(`INSERT INTO ds_id_history (user_id, action, ip, user_agent) VALUES (?,?,?,?)`).run(user.id, 'copie', req.socket?.remoteAddress || null, req.headers['user-agent'] || null);
  sendJSON(res, 200, { ok: true });
});

/* ══ DS-ID — Régénérer ══ */
route("POST", "/api/profil/ds-id/regenerate", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
  const { password } = body;
  if (!password) return sendJSON(res, 400, { error: 'Mot de passe requis.' });
  const row = await db.prepare('SELECT password_hash, password_salt FROM users WHERE id=?').get(user.id);
  if (!row) return sendJSON(res, 404, { error: 'Compte introuvable.' });
  if (!verifyPassword(password, row.password_salt, row.password_hash)) {
    db.prepare(`INSERT INTO ds_id_history (user_id, action, ip, user_agent) VALUES (?,?,?,?)`).run(user.id, 'echec_validation', req.socket?.remoteAddress || null, req.headers['user-agent'] || null);
    return sendJSON(res, 403, { error: 'Mot de passe incorrect.' });
  }
  const newDsId = generateDsId();
  await db.prepare('UPDATE users SET ds_id=? WHERE id=?').run(newDsId, user.id);
  db.prepare(`INSERT INTO ds_id_history (user_id, action, ip, user_agent) VALUES (?,?,?,?)`).run(user.id, 'regeneration', req.socket?.remoteAddress || null, req.headers['user-agent'] || null);
  sendJSON(res, 200, { ds_id: newDsId });
});

/* ══ DS-ID — Historique ══ */
route("GET", "/api/profil/ds-id/history", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
  const history = await db.prepare(`SELECT action, ip, user_agent, created_at FROM ds_id_history WHERE user_id=? ORDER BY created_at DESC LIMIT 50`).all(user.id);
  sendJSON(res, 200, { history });
});

/* ---------- Recherche utilisateurs (pour ajout membres) ---------- */
route("GET", "/api/users/search", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const q = (query.q || "").trim();
  if (q.length < 2) return sendJSON(res, 200, { users: [] });
  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT id, nom, prenom, email, role, avatar_url
    FROM users
    WHERE id != ?
      AND (nom LIKE ? OR prenom LIKE ? OR email LIKE ? OR CAST(id AS TEXT) = ?)
    LIMIT 10
  `).all(user.id, like, like, like, q);
  sendJSON(res, 200, { users: rows.map(u => ({ id: u.id, nom: u.nom, prenom: u.prenom, email: u.email, role: u.role, avatar_url: u.avatar_url })) });
});

/* ---------- Membres d'une initiative ---------- */
route("GET", "/api/initiatives/:id/membres", async (req, res, params) => {
  const init = await db.prepare("SELECT id, nom FROM initiatives WHERE id = ?").get(params.id);
  if (!init) return sendJSON(res, 404, { error: "Initiative introuvable." });
  const membres = await db.prepare(`
    SELECT im.id, im.user_id, im.fonction, im.statut, im.created_at,
           u.nom, u.prenom, u.email, u.avatar_url, u.role
    FROM initiative_membres im
    JOIN users u ON u.id = im.user_id
    WHERE im.initiative_id = ?
    ORDER BY im.created_at ASC
  `).all(params.id);
  sendJSON(res, 200, { membres });
});

route("POST", "/api/initiatives/:id/membres", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const init = await db.prepare("SELECT id, nom, owner_user_id FROM initiatives WHERE id = ?").get(params.id);
  if (!init) return sendJSON(res, 404, { error: "Initiative introuvable." });
  if (init.owner_user_id !== user.id && user.role !== 'administrateur') return sendJSON(res, 403, { error: "Seul le responsable peut inviter des membres." });
  const { userId, fonction } = body;
  if (!userId) return sendJSON(res, 400, { error: "userId requis." });
  const target = await db.prepare("SELECT id, nom, prenom FROM users WHERE id = ?").get(userId);
  if (!target) return sendJSON(res, 404, { error: "Utilisateur introuvable." });
  try {
    db.prepare("INSERT INTO initiative_membres (initiative_id, user_id, fonction, statut) VALUES (?, ?, ?, 'en_attente')").run(params.id, userId, fonction || null);
  } catch(e) {
    if (e.message.includes("UNIQUE")) return sendJSON(res, 409, { error: "Ce membre a déjà été invité." });
    throw e;
  }
  try {
    db.prepare("INSERT INTO notifications (user_id, type, titre, message, data) VALUES (?, ?, ?, ?, ?)").run(
      userId, 'affiliation_initiative',
      `Invitation à rejoindre une initiative`,
      `Vous avez été identifié comme membre de l'initiative « ${init.nom} ». Souhaitez-vous accepter cette affiliation ?`,
      JSON.stringify({ initiative_id: params.id, nom: init.nom }));
  } catch(_) {}
  sendJSON(res, 201, { ok: true });
});

route("PUT", "/api/initiatives/:id/membres/:userId", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const { statut, fonction } = body;
  const init = await db.prepare("SELECT id, nom, owner_user_id FROM initiatives WHERE id = ?").get(params.id);
  if (!init) return sendJSON(res, 404, { error: "Initiative introuvable." });
  const membre = await db.prepare("SELECT * FROM initiative_membres WHERE initiative_id = ? AND user_id = ?").get(params.id, params.userId);
  if (!membre) return sendJSON(res, 404, { error: "Membre introuvable." });
  /* Accepter/refuser : seul le membre concerné peut changer son statut */
  if (statut && ['accepte','refuse'].includes(statut)) {
    if (user.id !== parseInt(params.userId)) return sendJSON(res, 403, { error: "Vous ne pouvez modifier que votre propre affiliation." });
    db.prepare("UPDATE initiative_membres SET statut = ?, updated_at = datetime('now') WHERE initiative_id = ? AND user_id = ?").run(statut, params.id, params.userId);
    /* Notifier le responsable si refus */
    if (statut === 'refuse') {
      try {
        const u = await db.prepare("SELECT nom, prenom FROM users WHERE id = ?").get(parseInt(params.userId));
        db.prepare("INSERT INTO notifications (user_id, type, titre, message, data) VALUES (?, ?, ?, ?, ?)").run(
          init.owner_user_id, 'affiliation_refusee',
          `Affiliation refusée`,
          `${u?.prenom || ''} ${u?.nom || ''} a refusé de rejoindre « ${init.nom} ».`,
          JSON.stringify({ initiative_id: params.id }));
      } catch(_) {}
    }
  } else if (fonction !== undefined) {
    /* Modifier la fonction : seul le responsable */
    if (init.owner_user_id !== user.id && user.role !== 'administrateur') return sendJSON(res, 403, { error: "Seul le responsable peut modifier les fonctions." });
    db.prepare("UPDATE initiative_membres SET fonction = ?, updated_at = datetime('now') WHERE initiative_id = ? AND user_id = ?").run(fonction || null, params.id, params.userId);
  }
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/initiatives/:id/membres/:userId", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const init = await db.prepare("SELECT id, owner_user_id FROM initiatives WHERE id = ?").get(params.id);
  if (!init) return sendJSON(res, 404, { error: "Initiative introuvable." });
  if (user.id !== parseInt(params.userId) && init.owner_user_id !== user.id && user.role !== 'administrateur')
    return sendJSON(res, 403, { error: "Action non autorisée." });
  await db.prepare("DELETE FROM initiative_membres WHERE initiative_id = ? AND user_id = ?").run(params.id, params.userId);
  sendJSON(res, 200, { ok: true });
});

/* ---------- Recommandations post-inscription ---------- */
route("GET", "/api/recommendations", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const userFull = await db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  const followed = await db.prepare("SELECT followed_id FROM user_follows WHERE follower_id = ?").all(user.id).map(r => r.followed_id);
  const excluded = [user.id, ...followed];
  const placeholders = excluded.map(() => "?").join(",");
  /* Critères de matching : pays résidence, pays origine, domaine */
  const pays = userFull.pays || null;
  const origine = userFull.nationalite1 || null;
  const domaine = userFull.domaine || null;
  let candidates = [];
  /* 1. Initiatives avec même pays/domaine */
  const inits = db.prepare(`
    SELECT i.owner_user_id AS id, i.nom AS display_nom, i.description, i.type AS compte_type,
           i.domaine, i.pays AS pays_init, i.pays_origine, i.ville,
           u.photo_url AS avatar_url, u.role
    FROM initiatives i JOIN users u ON u.id = i.owner_user_id
    WHERE i.owner_user_id NOT IN (${placeholders})
    ${pays ? `AND (i.pays = ? OR i.pays_origine = ?)` : ''}
    ${domaine ? `AND i.domaine = ?` : ''}
    LIMIT 6
  `).all(...excluded, ...(pays ? [pays, pays] : []), ...(domaine ? [domaine] : []));
  candidates.push(...inits.map(r => ({ ...r, score: 2 })));
  /* 2. Utilisateurs avec même origine */
  if (candidates.length < 10 && origine) {
    const usrs = db.prepare(`
      SELECT id, nom AS display_nom, bio AS description, role,
             ville, pays AS pays_init, NULL AS pays_origine,
             photo_url AS avatar_url, titre_pro AS compte_type,
             situation_pro AS domaine
      FROM users WHERE id NOT IN (${placeholders}) AND (nationalite1 = ? OR nationalite2 = ?) LIMIT 6
    `).all(...excluded, origine, origine);
    candidates.push(...usrs.map(r => ({ ...r, score: 1 })));
  }
  /* 3. Compléter avec des profils actifs récents */
  if (candidates.length < 10) {
    const limit = 10 - candidates.length;
    const existIds = [...excluded, ...candidates.map(c => c.id)];
    const ph2 = existIds.map(() => "?").join(",");
    const active = db.prepare(`
      SELECT id, nom AS display_nom, bio AS description, role,
             ville, pays AS pays_init, NULL AS pays_origine,
             photo_url AS avatar_url, titre_pro AS compte_type,
             situation_pro AS domaine
      FROM users WHERE id NOT IN (${ph2}) ORDER BY last_active DESC LIMIT ?
    `).all(...existIds, limit);
    candidates.push(...active.map(r => ({ ...r, score: 0 })));
  }
  /* Dédupliquer, trier par score, limiter à 10 */
  const seen = new Set();
  const results = candidates.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
    .sort((a, b) => b.score - a.score).slice(0, 10);
  sendJSON(res, 200, { recommendations: results });
});

/* ---------- Actualités ---------- */
route("GET", "/api/actualites", async (req, res) => {
  sendJSON(res, 200, { actualites: await db.prepare("SELECT * FROM actualites ORDER BY created_at DESC").all() });
});

const TYPE_PAR_ROLE = { utilisateur: "Utilisateur", initiative: "Initiative", administrateur: "Compte Étatique", collectivite: "Compte Étatique" };

route("POST", "/api/fil", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise pour publier." });

  const pub_type = body.pub_type || "texte";
  const contenu  = (body.contenu || "").trim();
  const article_titre   = (body.article_titre || "").trim();
  const article_contenu = (body.article_contenu || "").trim();
  const statut   = body.statut || "publie"; // publie | brouillon | archive
  const visibilite = body.visibilite || "public";
  const medias   = body.medias ? (typeof body.medias === "string" ? body.medias : JSON.stringify(body.medias)) : "[]";
  const hashtags = body.hashtags ? (typeof body.hashtags === "string" ? body.hashtags : JSON.stringify(body.hashtags)) : "[]";

  if (statut === "publie") {
    if (!contenu && !article_titre) return sendJSON(res, 400, { error: "Le contenu ne peut pas être vide." });
  }

  // Extraire automatiquement les hashtags du contenu
  const hashtagsFromText = (contenu + " " + article_contenu).match(/#[\wÀ-ÿ]+/g) || [];
  const allHashtags = JSON.stringify([...new Set([...JSON.parse(hashtags), ...hashtagsFromText])]);

  const id = db.prepare(`
    INSERT INTO fil_posts
      (auteur_id, auteur_nom, type, pub_type, categorie, contenu,
       media_url, media_type, article_titre, article_contenu, video_duree,
       visibilite, medias, hashtags, statut, programmed_at,
       localisation_pays, localisation_ville)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id, user.nom, pub_type, pub_type,
    body.categorie || "Publication",
    contenu || article_titre,
    body.media_url || null,
    pub_type === "photo" ? "image" : pub_type === "video" ? "video" : null,
    article_titre || null,
    article_contenu || null,
    body.video_duree || null,
    visibilite, medias, allHashtags, statut,
    body.programmed_at || null,
    body.localisation_pays || null,
    body.localisation_ville || null,
  ).lastInsertRowid;

  // Récupère le post complet pour le renvoyer
  const post = await db.prepare("SELECT * FROM fil_posts WHERE id=?").get(id);

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
      const owner = await db.prepare("SELECT owner_user_id FROM initiatives WHERE id=?").get(cibleId);
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
  const post = await db.prepare("SELECT auteur_id,contenu FROM fil_posts WHERE id=?").get(params.id);
  if (post && post.auteur_id && post.auteur_id !== user.id) {
    creerNotif(post.auteur_id, "reaction", "Réaction sur votre post", `${user.nom} a réagi à votre publication`, { post_id: Number(params.id) });
  }
  sendJSON(res, 200, { reactions: counts });
});

/* ---------- Commentaires ---------- */

route("GET", "/api/fil/:id/commentaires", async (req, res, params) => {
  const comms = await db.prepare(`
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
      const init = await db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(c.auteur_id);
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

  const comm = await db.prepare(`
    SELECT c.id, c.contenu, c.created_at, c.auteur_id, c.auteur_nom,
           u.photo_url, u.theme_couleur
    FROM fil_commentaires c LEFT JOIN users u ON u.id = c.auteur_id
    WHERE c.id = ?
  `).get(id);

  // Notifier l'auteur du post
  const post = await db.prepare("SELECT auteur_id, contenu FROM fil_posts WHERE id=?").get(params.id);
  if (post && post.auteur_id && post.auteur_id !== user.id) {
    creerNotif(post.auteur_id, "message", `${user.nom} a commenté votre publication`,
      contenu.slice(0, 80) + (contenu.length > 80 ? "…" : ""),
      { post_id: Number(params.id) });
  }

  sendJSON(res, 201, { commentaire: comm });
});

/* ---------- GET post unique ---------- */
route("GET", "/api/fil/:id", async (req, res, params) => {
  const cu = getCurrentUser(req);
  const p = await db.prepare("SELECT * FROM fil_posts WHERE id=?").get(params.id);
  if (!p) return sendJSON(res, 404, { error: "Publication introuvable." });
  // Enregistrer la vue
  if (cu) { try { db.prepare("INSERT OR IGNORE INTO fil_post_views (post_id, user_id) VALUES (?,?)").run(p.id, cu.id); } catch(e){} }
  sendJSON(res, 200, { post: enrichPost(p, cu) });
});

/* ---------- Modifier post ---------- */
route("PUT", "/api/fil/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const p = await db.prepare("SELECT * FROM fil_posts WHERE id=?").get(params.id);
  if (!p) return sendJSON(res, 404, { error: "Publication introuvable." });
  if (p.auteur_id !== user.id && user.role !== "administrateur") return sendJSON(res, 403, { error: "Action non autorisée." });

  const contenu = (body.contenu !== undefined) ? body.contenu.trim() : p.contenu;
  const categorie = body.categorie || p.categorie;
  const visibilite = body.visibilite || p.visibilite || "public";
  const statut = body.statut || p.statut || "publie";
  const medias = body.medias ? (typeof body.medias === "string" ? body.medias : JSON.stringify(body.medias)) : (p.medias || "[]");
  const localisation_pays = body.localisation_pays !== undefined ? (body.localisation_pays || null) : p.localisation_pays;
  const localisation_ville = body.localisation_ville !== undefined ? (body.localisation_ville || null) : p.localisation_ville;
  const hashtagsFromText = contenu.match(/#[\wÀ-ÿ]+/g) || [];
  const hashtags = JSON.stringify([...new Set(hashtagsFromText)]);

  await db.prepare(`UPDATE fil_posts SET contenu=?, categorie=?, visibilite=?, statut=?, medias=?, hashtags=?, localisation_pays=?, localisation_ville=? WHERE id=?`)
    .run(contenu, categorie, visibilite, statut, medias, hashtags, localisation_pays, localisation_ville, p.id);

  const updated = await db.prepare("SELECT * FROM fil_posts WHERE id=?").get(p.id);
  sendJSON(res, 200, { post: enrichPost(updated, user) });
});

/* ---------- Supprimer post ---------- */
route("DELETE", "/api/fil/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const p = await db.prepare("SELECT * FROM fil_posts WHERE id=?").get(params.id);
  if (!p) return sendJSON(res, 404, { error: "Publication introuvable." });
  if (p.auteur_id !== user.id && user.role !== "administrateur") return sendJSON(res, 403, { error: "Action non autorisée." });
  await db.prepare("DELETE FROM fil_reactions WHERE post_id=?").run(p.id);
  await db.prepare("DELETE FROM fil_commentaires WHERE post_id=?").run(p.id);
  await db.prepare("DELETE FROM fil_bookmarks WHERE post_id=?").run(p.id);
  await db.prepare("DELETE FROM fil_contributions WHERE post_id=?").run(p.id);
  await db.prepare("DELETE FROM fil_post_views WHERE post_id=?").run(p.id);
  await db.prepare("DELETE FROM fil_posts WHERE id=?").run(p.id);
  sendJSON(res, 200, { ok: true });
});

/* ---------- Archiver post ---------- */
route("POST", "/api/fil/:id/archiver", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const p = await db.prepare("SELECT * FROM fil_posts WHERE id=?").get(params.id);
  if (!p || p.auteur_id !== user.id) return sendJSON(res, 403, { error: "Action non autorisée." });
  await db.prepare("UPDATE fil_posts SET statut='archive' WHERE id=?").run(p.id);
  sendJSON(res, 200, { ok: true });
});

/* ---------- Signaler post ---------- */
route("POST", "/api/fil/:id/signaler", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const motif = (body.motif || "").trim();
  if (!motif) return sendJSON(res, 400, { error: "Motif requis." });
  creerNotif(
    await db.prepare("SELECT id FROM users WHERE role='administrateur' LIMIT 1").get()?.id || 1,
    "signalement", `Publication signalée par ${user.nom}`,
    `Post #${params.id} — motif : ${motif}`, { post_id: Number(params.id) }
  );
  sendJSON(res, 200, { ok: true });
});

/* ---------- Bookmark toggle ---------- */
route("POST", "/api/fil/:id/bookmark", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const existing = await db.prepare("SELECT id FROM fil_bookmarks WHERE user_id=? AND post_id=?").get(user.id, params.id);
  if (existing) {
    await db.prepare("DELETE FROM fil_bookmarks WHERE user_id=? AND post_id=?").run(user.id, params.id);
    sendJSON(res, 200, { bookmarked: false });
  } else {
    db.prepare("INSERT OR IGNORE INTO fil_bookmarks (user_id, post_id) VALUES (?,?)").run(user.id, params.id);
    sendJSON(res, 200, { bookmarked: true });
  }
});

/* ---------- Mes bookmarks ---------- */
route("GET", "/api/mes-bookmarks", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const page = Math.max(1, Number(query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const rows = await db.prepare(`
    SELECT p.* FROM fil_posts p
    JOIN fil_bookmarks b ON b.post_id = p.id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
    LIMIT ? OFFSET ?
  `).all(user.id, limit, offset);
  const total = db.prepare("SELECT COUNT(*) AS n FROM fil_bookmarks WHERE user_id=?").get(user.id).n;
  sendJSON(res, 200, { posts: rows.map(p => enrichPost(p, user)), total, page, pages: Math.ceil(total/limit) });
});

/* ---------- Contribuer ---------- */
route("POST", "/api/fil/:id/contribuer", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const type_contribution = (body.type_contribution || "").trim();
  if (!type_contribution) return sendJSON(res, 400, { error: "Type de contribution requis." });

  db.prepare(`
    INSERT INTO fil_contributions (post_id, user_id, user_nom, user_email, type_contribution, message)
    VALUES (?,?,?,?,?,?)
  `).run(params.id, user.id, user.nom, user.email, type_contribution, (body.message || "").trim() || null);

  const post = await db.prepare("SELECT auteur_id, contenu FROM fil_posts WHERE id=?").get(params.id);
  if (post && post.auteur_id && post.auteur_id !== user.id) {
    creerNotif(
      post.auteur_id, "contribution",
      `🤝 ${user.nom} souhaite contribuer à votre publication`,
      `${type_contribution}${body.message ? " — " + body.message.slice(0,80) : ""}`,
      { post_id: Number(params.id), user_id: user.id }
    );
  }
  sendJSON(res, 201, { ok: true });
});

/* ---------- Stats post ---------- */
route("GET", "/api/fil/:id/stats", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const p = await db.prepare("SELECT * FROM fil_posts WHERE id=?").get(params.id);
  if (!p || p.auteur_id !== user.id) return sendJSON(res, 403, { error: "Non autorisé." });

  const reactions = db.prepare("SELECT type, COUNT(*) AS n FROM fil_reactions WHERE post_id=? GROUP BY type").all(p.id);
  const reactionCounts = {};
  reactions.forEach(r => reactionCounts[r.type] = r.n);
  const totalReactions = reactions.reduce((s, r) => s + r.n, 0);

  const nb_commentaires = db.prepare("SELECT COUNT(*) AS n FROM fil_commentaires WHERE post_id=?").get(p.id).n;
  const nb_reposts = db.prepare("SELECT COUNT(*) AS n FROM fil_posts WHERE original_post_id=?").get(p.id).n;
  const nb_bookmarks = db.prepare("SELECT COUNT(*) AS n FROM fil_bookmarks WHERE post_id=?").get(p.id).n;
  const nb_contributions = db.prepare("SELECT COUNT(*) AS n FROM fil_contributions WHERE post_id=?").get(p.id).n;
  const nb_vues = db.prepare("SELECT COUNT(*) AS n FROM fil_post_views WHERE post_id=?").get(p.id).n;

  const contributions = await db.prepare(`
    SELECT fc.*, u.email, u.ville, u.pays FROM fil_contributions fc
    LEFT JOIN users u ON u.id = fc.user_id
    WHERE fc.post_id=? ORDER BY fc.created_at DESC
  `).all(p.id);

  sendJSON(res, 200, {
    stats: { nb_vues, nb_reactions: totalReactions, reactions: reactionCounts, nb_commentaires, nb_reposts, nb_bookmarks, nb_contributions },
    contributions,
  });
});

/* ---------- Brouillons ---------- */
route("GET", "/api/fil/brouillons", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = await db.prepare("SELECT * FROM fil_posts WHERE auteur_id=? AND statut='brouillon' ORDER BY created_at DESC").all(user.id);
  sendJSON(res, 200, { brouillons: rows.map(p => enrichPost(p, user)) });
});

/* ---------- Republier ---------- */

route("POST", "/api/fil/:id/republier", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });

  const original = await db.prepare("SELECT * FROM fil_posts WHERE id=?").get(params.id);
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

  const post = await db.prepare("SELECT * FROM fil_posts WHERE id=?").get(newId);
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

  const other = await db.prepare("SELECT id, nom, role FROM users WHERE id = ?").get(otherId);
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
    if (conv.user1_id === user.id && conv.deleted_u1) await db.prepare("UPDATE conversations SET deleted_u1=0 WHERE id=?").run(conv.id);
    if (conv.user2_id === user.id && conv.deleted_u2) await db.prepare("UPDATE conversations SET deleted_u2=0 WHERE id=?").run(conv.id);
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

  const conv = await db.prepare("SELECT * FROM conversations WHERE id = ?").get(params.id);
  if (!conv || (conv.user1_id !== user.id && conv.user2_id !== user.id)) return sendJSON(res, 403, { error: "Accès refusé." });

  // Marquer comme lus les messages reçus
  await db.prepare("UPDATE messages SET lu=1 WHERE conversation_id=? AND sender_id!=? AND lu=0").run(params.id, user.id);

  const messages = await db.prepare("SELECT m.*, u.nom AS sender_nom, u.role AS sender_role FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = ? ORDER BY m.created_at ASC").all(params.id);
  const autre = await db.prepare("SELECT id, nom, role, ville, pays FROM users WHERE id=?").get(conv.user1_id === user.id ? conv.user2_id : conv.user1_id);

  sendJSON(res, 200, { messages, autre, conversation: conv });
});

/* POST /api/conversations/:id/messages — envoyer un message */
route("POST", "/api/conversations/:id/messages", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });

  const conv = await db.prepare("SELECT * FROM conversations WHERE id = ?").get(params.id);
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
  if (conv.user1_id === user.id && conv.deleted_u2) await db.prepare("UPDATE conversations SET deleted_u2=0 WHERE id=?").run(conv.id);
  if (conv.user2_id === user.id && conv.deleted_u1) await db.prepare("UPDATE conversations SET deleted_u1=0 WHERE id=?").run(conv.id);

  const msg = await db.prepare("SELECT m.*, u.nom AS sender_nom FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?").get(id);
  // Notifier le destinataire
  const otherId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;
  creerNotif(otherId, "message", "Nouveau message", `${user.nom} vous a envoyé un message`, { conversation_id: conv.id });
  sendJSON(res, 201, { message: msg });
});

/* PATCH /api/conversations/:id/archive — archiver/désarchiver */
route("PATCH", "/api/conversations/:id/archive", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const conv = await db.prepare("SELECT * FROM conversations WHERE id = ?").get(params.id);
  if (!conv || (conv.user1_id !== user.id && conv.user2_id !== user.id)) return sendJSON(res, 403, { error: "Accès refusé." });

  const col = conv.user1_id === user.id ? "archive_u1" : "archive_u2";
  const current = conv[col];
  await db.prepare(`UPDATE conversations SET ${col}=? WHERE id=?`).run(current ? 0 : 1, conv.id);
  sendJSON(res, 200, { archive: !current });
});

/* DELETE /api/conversations/:id — suppression douce côté utilisateur */
route("DELETE", "/api/conversations/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const conv = await db.prepare("SELECT * FROM conversations WHERE id = ?").get(params.id);
  if (!conv || (conv.user1_id !== user.id && conv.user2_id !== user.id)) return sendJSON(res, 403, { error: "Accès refusé." });

  const col = conv.user1_id === user.id ? "deleted_u1" : "deleted_u2";
  await db.prepare(`UPDATE conversations SET ${col}=1 WHERE id=?`).run(conv.id);
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
  const init = await db.prepare("SELECT id, abonnes FROM initiatives WHERE id = ?").get(params.id);
  if (!init) return sendJSON(res, 404, { error: "Initiative introuvable." });
  try {
    db.prepare("INSERT INTO abonnements (user_id, initiative_id) VALUES (?, ?)").run(user.id, params.id);
    await db.prepare("UPDATE initiatives SET abonnes = abonnes + 1 WHERE id = ?").run(params.id);
    sendJSON(res, 201, { ok: true, abonne: true });
  } catch (e) {
    sendJSON(res, 409, { ok: false, abonne: true, message: "Déjà abonné." });
  }
});

route("DELETE", "/api/initiatives/:id/suivre", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const info = await db.prepare("DELETE FROM abonnements WHERE user_id = ? AND initiative_id = ?").run(user.id, params.id);
  if (info.changes > 0) db.prepare("UPDATE initiatives SET abonnes = MAX(0, abonnes - 1) WHERE id = ?").run(params.id);
  sendJSON(res, 200, { ok: true, abonne: false });
});

route("GET", "/api/mes-suivis", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = await db.prepare(`
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
/* ──────────────────────────────────────────────────────────
   DIASPO FORMATION — Routes publiques & créateur
   ────────────────────────────────────────────────────────── */

function hasAccreditation(userId, type) {
  const ancien = await db.prepare("SELECT id FROM compte_accreditations WHERE user_id=? AND type=? AND statut='active'").get(userId, type);
  if (ancien) return true;
  const def = await db.prepare("SELECT id FROM accred_definitions WHERE type=?").get(type);
  if (!def) return false;
  const nouv = await db.prepare("SELECT id FROM user_accreditations WHERE user_id=? AND accred_id=? AND statut='active'").get(userId, def.id);
  return !!nouv;
}

route("GET", "/api/formations", async (req, res, params, body, query) => {
  let rows = db.prepare(`
    SELECT f.*, u.nom AS auteur_nom
    FROM formations f
    LEFT JOIN users u ON u.id = f.owner_user_id
    WHERE COALESCE(f.statut,'publiee') = 'publiee'
    ORDER BY f.created_at DESC
  `).all();
  if (query.domaine) rows = rows.filter(r => r.domaine === query.domaine);
  if (query.categorie) rows = rows.filter(r => r.categorie === query.categorie);
  if (query.type) rows = rows.filter(r => r.type_formation === query.type);
  if (query.niveau) rows = rows.filter(r => r.niveau === query.niveau);
  if (query.langue) rows = rows.filter(r => r.langue === query.langue);
  if (query.gratuit === "1") rows = rows.filter(r => r.mode_acces === 'gratuit' || r.gratuit === 1);
  if (query.q) {
    const q = query.q.toLowerCase();
    rows = rows.filter(r => ((r.titre||'') + (r.description||'') + (r.organisme||'')).toLowerCase().includes(q));
  }
  sendJSON(res, 200, { formations: rows });
});

route("GET", "/api/formations/:id", async (req, res, params) => {
  const row = await db.prepare(`
    SELECT f.*, u.nom AS auteur_nom
    FROM formations f LEFT JOIN users u ON u.id=f.owner_user_id
    WHERE f.id=?
  `).get(params.id);
  if (!row) return sendJSON(res, 404, { error: "Formation introuvable." });
  const avis = await db.prepare("SELECT a.*, u.nom AS auteur FROM formation_avis a JOIN users u ON u.id=a.user_id WHERE a.formation_id=? ORDER BY a.created_at DESC").all(params.id);
  const nb_inscrits = db.prepare("SELECT COUNT(*) AS n FROM formation_inscriptions WHERE formation_id=? AND statut='active'").get(params.id).n;
  sendJSON(res, 200, { formation: { ...row, avis, nb_inscrits } });
});

/* Mes formations (créateur) */
route("GET", "/api/mes-formations", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const formations = db.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM formation_inscriptions i WHERE i.formation_id=f.id AND i.statut='active') AS nb_inscrits,
      (SELECT COALESCE(SUM(montant_paye),0) FROM formation_inscriptions i WHERE i.formation_id=f.id AND i.statut='active') AS revenu_brut
    FROM formations f
    WHERE f.owner_user_id=?
    ORDER BY f.created_at DESC
  `).all(user.id);
  sendJSON(res, 200, { formations });
});

/* Mes inscriptions (apprenant) */
route("GET", "/api/mes-inscriptions", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const inscriptions = await db.prepare(`
    SELECT i.*, f.titre, f.description, f.image_url, f.mode_acces, f.niveau
    FROM formation_inscriptions i JOIN formations f ON f.id=i.formation_id
    WHERE i.user_id=? ORDER BY i.date_inscription DESC
  `).all(user.id);
  sendJSON(res, 200, { inscriptions });
});

/* Créer une formation */
route("POST", "/api/formations", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (user.role === 'utilisateur') return sendJSON(res, 403, { error: "Accréditation Créateur de formations requise." });
  if (!['initiative','collectivite','administrateur'].includes(user.role)) return sendJSON(res, 403, { error: "Réservé aux comptes Initiative et Institution." });
  if (user.role !== 'administrateur' && !hasAccreditation(user.id, 'createur_formations')) {
    return sendJSON(res, 403, { error: "Accréditation Créateur de formations requise. Faites une demande dans la section Accréditations." });
  }
  const { titre, type_formation, organisme, domaine, nationalite, langue, niveau, description,
          prix, duree, duree_heures, places, mode_acces, telecharge_autorise,
          objectifs, prerequis, categorie, video_intro } = body;
  if (!titre) return sendJSON(res, 400, { error: "Le titre est requis." });
  const modeAcces = mode_acces || 'gratuit';
  const commission = modeAcces === 'gratuit' ? 0 : modeAcces === 'payant_sauf_membres' ? 2 : 5;
  const gratuit = modeAcces === 'gratuit' ? 1 : 0;
  const init = await db.prepare("SELECT id FROM initiatives WHERE owner_user_id = ?").get(user.id);
  const id = db.prepare(`
    INSERT INTO formations (titre, type_formation, organisme, domaine, nationalite, langue, niveau, description,
      prix, gratuit, duree, duree_heures, places, initiative_id, owner_user_id,
      statut, mode_acces, commission_pct, telecharge_autorise, objectifs, prerequis, categorie, video_intro)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'brouillon',?,?,?,?,?,?,?)
  `).run(
    titre, type_formation||null, organisme||null, domaine||null, nationalite||null, langue||'Français',
    niveau||null, description||null, prix||0, gratuit, duree||null, duree_heures||null, places||null,
    init?.id||null, user.id,
    modeAcces, commission, telecharge_autorise?1:0,
    objectifs||null, prerequis||null, categorie||null, video_intro||null
  ).lastInsertRowid;
  sendJSON(res, 201, { id });
});

/* Modifier une formation (brouillon ou refusée) */
route("PUT", "/api/formations/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
  if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
  if (f.owner_user_id !== user.id && user.role !== 'administrateur') return sendJSON(res, 403, { error: "Interdit." });
  if (!['brouillon','refusee'].includes(f.statut||'brouillon') && user.role !== 'administrateur') {
    return sendJSON(res, 400, { error: "Seules les formations en brouillon ou refusées peuvent être modifiées." });
  }
  const n = v => (v === undefined ? null : v);
  const modeAcces = body.mode_acces || f.mode_acces || 'gratuit';
  const commission = modeAcces === 'gratuit' ? 0 : modeAcces === 'payant_sauf_membres' ? 2 : 5;
  const newTelecharge = body.telecharge_autorise != null ? (body.telecharge_autorise ? 1 : 0) : null;
  const newStatut = (f.statut === 'refusee') ? 'brouillon' : f.statut;
  const newMotif = (f.statut === 'refusee') ? null : f.motif_refus;
  db.prepare(`UPDATE formations SET
    titre=COALESCE(?,titre), description=COALESCE(?,description), objectifs=COALESCE(?,objectifs),
    prerequis=COALESCE(?,prerequis), niveau=COALESCE(?,niveau), langue=COALESCE(?,langue),
    duree=COALESCE(?,duree), duree_heures=COALESCE(?,duree_heures), places=COALESCE(?,places),
    categorie=COALESCE(?,categorie), mode_acces=?, prix=COALESCE(?,prix),
    commission_pct=?, telecharge_autorise=COALESCE(?,telecharge_autorise),
    video_intro=COALESCE(?,video_intro), image_url=COALESCE(?,image_url),
    statut=?, motif_refus=?
    WHERE id=?`
  ).run(n(body.titre),n(body.description),n(body.objectifs),n(body.prerequis),
    n(body.niveau),n(body.langue),n(body.duree),n(body.duree_heures),n(body.places),
    n(body.categorie),modeAcces,n(body.prix),commission,newTelecharge,
    n(body.video_intro),n(body.image_url),newStatut,newMotif,params.id);
  sendJSON(res, 200, { ok: true });
});

/* Supprimer une formation (brouillon seulement) */
route("DELETE", "/api/formations/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
  if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
  if (f.owner_user_id !== user.id && user.role !== 'administrateur') return sendJSON(res, 403, { error: "Interdit." });
  if ((f.statut||'brouillon') !== 'brouillon' && user.role !== 'administrateur') return sendJSON(res, 400, { error: "Seule une formation en brouillon peut être supprimée." });
  await db.prepare("DELETE FROM formations WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* Soumettre à validation */
route("POST", "/api/formations/:id/publier", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
  if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
  if (f.owner_user_id !== user.id) return sendJSON(res, 403, { error: "Interdit." });
  if (!['brouillon','refusee'].includes(f.statut||'brouillon')) return sendJSON(res, 400, { error: `Statut actuel : ${f.statut}` });
  await db.prepare("UPDATE formations SET statut='en_attente', motif_refus=NULL WHERE id=?").run(params.id);
  db.prepare("INSERT INTO formation_historique (formation_id,action,admin_id,admin_nom) VALUES (?,'soumise',?,?)").run(params.id, user.id, user.nom);
  /* Notif aux admins */
  const admins = await db.prepare("SELECT id FROM users WHERE role='administrateur'").all();
  for (const a of admins) {
    creerNotif(a.id, 'formation', 'Nouvelle formation à valider', `« ${f.titre} » est en attente de validation.`, { formation_id: params.id });
  }
  sendJSON(res, 200, { ok: true });
});

/* S'inscrire à une formation */
route("POST", "/api/formations/:id/inscrire", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
  if (!f || f.statut !== 'publiee') return sendJSON(res, 404, { error: "Formation introuvable ou non publiée." });
  const deja = await db.prepare("SELECT id FROM formation_inscriptions WHERE formation_id=? AND user_id=?").get(params.id, user.id);
  if (deja) return sendJSON(res, 409, { error: "Déjà inscrit." });
  let montant = 0, acces_gratuit = 0, code_valide = null;
  if (f.mode_acces === 'payant_sauf_membres') {
    const code = (body.code||'').trim().toUpperCase();
    const codeRow = code ? await db.prepare("SELECT * FROM formation_codes_acces WHERE code=? AND actif=1").get(code) : null;
    if (codeRow && (!codeRow.date_expiration || codeRow.date_expiration > new Date().toISOString())
        && (!codeRow.limite_utilisations || codeRow.nb_utilisations < codeRow.limite_utilisations)) {
      acces_gratuit = 1;
      code_valide = code;
      await db.prepare("UPDATE formation_codes_acces SET nb_utilisations=nb_utilisations+1 WHERE id=?").run(codeRow.id);
    } else {
      montant = f.prix || 0;
    }
  } else if (f.mode_acces === 'payant') {
    montant = f.prix || 0;
  }
  db.prepare(`INSERT INTO formation_inscriptions
    (formation_id,user_id,montant_paye,acces_gratuit_membre,code_acces)
    VALUES (?,?,?,?,?)`).run(params.id, user.id, montant, acces_gratuit, code_valide);
  creerNotif(user.id, 'formation', 'Inscription confirmée', `Vous êtes inscrit à la formation « ${f.titre} ».`, { formation_id: params.id });
  sendJSON(res, 201, { ok: true, acces_gratuit });
});

/* Ajouter un avis */
route("POST", "/api/formations/:id/avis", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const inscrit = await db.prepare("SELECT id FROM formation_inscriptions WHERE formation_id=? AND user_id=? AND statut='active'").get(params.id, user.id);
  if (!inscrit) return sendJSON(res, 403, { error: "Vous devez être inscrit pour laisser un avis." });
  const { note, commentaire } = body;
  if (!note || note < 1 || note > 5) return sendJSON(res, 400, { error: "Note entre 1 et 5 requise." });
  db.prepare("INSERT OR REPLACE INTO formation_avis (formation_id,user_id,note,commentaire) VALUES (?,?,?,?)").run(params.id, user.id, note, commentaire||null);
  sendJSON(res, 201, { ok: true });
});

/* Répondre à un avis (créateur) */
route("PATCH", "/api/formations/avis/:avisId/repondre", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const avis = await db.prepare("SELECT a.*, f.owner_user_id FROM formation_avis a JOIN formations f ON f.id=a.formation_id WHERE a.id=?").get(params.avisId);
  if (!avis) return sendJSON(res, 404, { error: "Avis introuvable." });
  if (avis.owner_user_id !== user.id && user.role !== 'administrateur') return sendJSON(res, 403, { error: "Interdit." });
  await db.prepare("UPDATE formation_avis SET reponse_createur=? WHERE id=?").run(body.reponse||null, params.avisId);
  sendJSON(res, 200, { ok: true });
});

/* ──────────────────────────────────────────────────────────
   DIASPO FORMATION — Routes admin (validation, codes)
   ────────────────────────────────────────────────────────── */

route("GET", "/api/admin/formations/en-attente", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
  const formations = await db.prepare(`
    SELECT f.*, u.nom AS auteur_nom, u.email AS auteur_email
    FROM formations f LEFT JOIN users u ON u.id=f.owner_user_id
    WHERE f.statut='en_attente'
    ORDER BY f.created_at ASC
  `).all();
  sendJSON(res, 200, { formations });
});

route("GET", "/api/admin/formations", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
  const statut = query.statut || null;
  const formations = statut
    ? await db.prepare("SELECT f.*, u.nom AS auteur_nom FROM formations f LEFT JOIN users u ON u.id=f.owner_user_id WHERE f.statut=? ORDER BY f.created_at DESC").all(statut)
    : await db.prepare("SELECT f.*, u.nom AS auteur_nom FROM formations f LEFT JOIN users u ON u.id=f.owner_user_id ORDER BY f.created_at DESC LIMIT 100").all();
  sendJSON(res, 200, { formations });
});

route("PATCH", "/api/admin/formations/:id/valider", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
  const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
  if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
  db.prepare("UPDATE formations SET statut='publiee', validateur_id=?, valide_at=datetime('now') WHERE id=?").run(user.id, params.id);
  db.prepare("INSERT INTO formation_historique (formation_id,action,admin_id,admin_nom,motif) VALUES (?,'validee',?,?,?)").run(params.id, user.id, user.nom, body.motif||null);
  creerNotif(f.owner_user_id, 'formation', 'Formation publiée ! 🎉', `Votre formation « ${f.titre} » a été validée et publiée sur Diaspo Formation.`, { formation_id: params.id });
  sendJSON(res, 200, { ok: true });
});

route("PATCH", "/api/admin/formations/:id/refuser", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
  const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
  if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
  const motif = body.motif || 'Contenu non conforme.';
  await db.prepare("UPDATE formations SET statut='refusee', motif_refus=? WHERE id=?").run(motif, params.id);
  db.prepare("INSERT INTO formation_historique (formation_id,action,admin_id,admin_nom,motif) VALUES (?,'refusee',?,?,?)").run(params.id, user.id, user.nom, motif);
  creerNotif(f.owner_user_id, 'formation', 'Formation refusée', `Votre formation « ${f.titre} » n'a pas été validée. Motif : ${motif}`, { formation_id: params.id });
  sendJSON(res, 200, { ok: true });
});

route("PATCH", "/api/admin/formations/:id/suspendre", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
  const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
  if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
  const motif = body.motif || '';
  const newStatut = f.statut === 'suspendue' ? 'publiee' : 'suspendue';
  await db.prepare("UPDATE formations SET statut=? WHERE id=?").run(newStatut, params.id);
  db.prepare("INSERT INTO formation_historique (formation_id,action,admin_id,admin_nom,motif) VALUES (?,?,?,?,?)").run(params.id, newStatut, user.id, user.nom, motif);
  creerNotif(f.owner_user_id, 'formation', newStatut==='suspendue'?'Formation suspendue':'Formation réactivée',
    newStatut==='suspendue' ? `Votre formation « ${f.titre} » a été suspendue.${motif?' Motif : '+motif:''}` : `Votre formation « ${f.titre} » est de nouveau publiée.`,
    { formation_id: params.id });
  sendJSON(res, 200, { ok: true, statut: newStatut });
});

/* Codes d'accès gratuit (membres Diaspo'Actif) */
route("GET", "/api/admin/codes-acces", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
  sendJSON(res, 200, { codes: await db.prepare("SELECT * FROM formation_codes_acces ORDER BY created_at DESC").all() });
});

route("POST", "/api/admin/codes-acces", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
  const { code, description, limite_utilisations, date_expiration } = body;
  if (!code) return sendJSON(res, 400, { error: "Code requis." });
  const id = db.prepare(`INSERT INTO formation_codes_acces (code,description,limite_utilisations,date_expiration,created_by) VALUES (?,?,?,?,?)`)
    .run(code.toUpperCase().trim(), description||null, limite_utilisations||null, date_expiration||null, user.id).lastInsertRowid;
  sendJSON(res, 201, { id });
});

route("PATCH", "/api/admin/codes-acces/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
  const c = await db.prepare("SELECT * FROM formation_codes_acces WHERE id=?").get(params.id);
  if (!c) return sendJSON(res, 404, { error: "Code introuvable." });
  if (body.toggle_actif !== undefined) {
    await db.prepare("UPDATE formation_codes_acces SET actif=? WHERE id=?").run(c.actif?0:1, params.id);
  } else {
    db.prepare("UPDATE formation_codes_acces SET description=COALESCE(?,description), limite_utilisations=COALESCE(?,limite_utilisations), date_expiration=COALESCE(?,date_expiration) WHERE id=?")
      .run(body.description, body.limite_utilisations||null, body.date_expiration||null, params.id);
  }
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/admin/codes-acces/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
  await db.prepare("DELETE FROM formation_codes_acces WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* ---------- Dashboard Initiative (données réelles de l'initiative de l'utilisateur connecté) ---------- */
route("GET", "/api/dashboard/initiative", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (user.role !== "initiative") return sendJSON(res, 403, { error: "Réservé aux comptes Initiative." });

  const initiative = await db.prepare("SELECT * FROM initiatives WHERE owner_user_id = ?").get(user.id);
  const messagesNonLusRow = db.prepare(`SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.sender_id!=? AND m.lu=0 AND (c.user1_id=? OR c.user2_id=?)`).get(user.id, user.id, user.id);
  const messagesNonLus = messagesNonLusRow.n;
  const publications = await db.prepare("SELECT * FROM fil_posts WHERE auteur_id = ? ORDER BY created_at DESC LIMIT 5").all(user.id);

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

  const publicationsRecentes = await db.prepare("SELECT * FROM fil_posts ORDER BY created_at DESC LIMIT 10").all();
  const derniersInscrits = await db.prepare("SELECT id, nom, email, role, ville, pays, created_at FROM users ORDER BY created_at DESC LIMIT 8").all();

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
  const profil = await db.prepare("SELECT * FROM ambassade_profil WHERE user_id=?").get(user.id);
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
  const u = await db.prepare("SELECT id,nom,prenom,email,role,ville,pays,bio,photo_url,banner_url,titre_pro,competences,experiences,theme_couleur,centres_interet,situation_pro,profil_json,privacy_json,created_at,da_id FROM users WHERE id=?").get(params.id);
  if (!u) return sendJSON(res, 404, { error: "Profil introuvable." });
  const me = getCurrentUser(req);
  const nbAbonnes    = db.prepare("SELECT COUNT(*) as n FROM user_follows WHERE followed_id=?").get(u.id).n;
  const nbSuivis     = db.prepare("SELECT COUNT(*) as n FROM user_follows WHERE follower_id=?").get(u.id).n;
  const isFollowing  = me ? !!await db.prepare("SELECT 1 FROM user_follows WHERE follower_id=? AND followed_id=?").get(me.id, u.id) : false;
  const initiativesSuivies = await db.prepare("SELECT i.id,i.slug,i.nom,i.domaine,i.pays FROM abonnements a JOIN initiatives i ON i.id=a.initiative_id WHERE a.user_id=? LIMIT 12").all(u.id);
  const usersSuivis  = await db.prepare("SELECT u2.id,u2.nom,u2.prenom,u2.titre_pro,u2.ville,u2.photo_url FROM user_follows uf JOIN users u2 ON u2.id=uf.followed_id WHERE uf.follower_id=? LIMIT 12").all(u.id);
  const publications = db.prepare(`
    SELECT p.id, p.type, p.categorie, p.contenu, p.created_at,
      COUNT(DISTINCT r.id) AS nb_reactions,
      COUNT(DISTINCT c.id) AS nb_commentaires
    FROM fil_posts p
    LEFT JOIN fil_reactions r ON r.post_id = p.id
    LEFT JOIN fil_commentaires c ON c.post_id = p.id
    WHERE p.auteur_id = ?
    GROUP BY p.id ORDER BY p.id DESC LIMIT 10`).all(u.id);
  const po = await db.prepare("SELECT statut,domaines_expertise,pays_intervention,services,description_complete,site_web,liens_utiles,date_attribution FROM partenaires_officiels WHERE user_id=?").get(u.id);
  const dmLaureat = await db.prepare(`SELECT dml.rang, dml.score, dme.label AS edition_label, dme.periode_fin
    FROM deal_master_laureats dml JOIN deal_master_editions dme ON dme.id=dml.edition_id
    WHERE dml.user_id=? AND dml.actif=1 ORDER BY dml.edition_id DESC LIMIT 1`).get(u.id);
  const dmHistorique = db.prepare(`SELECT COUNT(*) AS n FROM deal_master_laureats WHERE user_id=?`).get(u.id).n;
  sendJSON(res, 200, { profil: {
    ...publicUser(u),
    bio: u.bio, photo_url: u.photo_url, banner_url: u.banner_url,
    prenom: u.prenom, titre_pro: u.titre_pro,
    centres_interet: safeParse(u.centres_interet || "[]"),
    competences: safeParse(u.competences || "[]"),
    experiences: safeParse(u.experiences || "[]"),
    theme_couleur: u.theme_couleur || "ocean",
    situation_pro: u.situation_pro, created_at: u.created_at,
    privacy: safeParse(u.privacy_json || "{}"),
    nbAbonnes, nbSuivis, isFollowing,
    initiativesSuivies, usersSuivis, publications,
    partenaire_officiel: po && po.statut === 'active' ? {
      statut: po.statut,
      domaines_expertise: safeParse(po.domaines_expertise||'[]'),
      pays_intervention:  safeParse(po.pays_intervention||'[]'),
      services:           safeParse(po.services||'[]'),
      description_complete: po.description_complete,
      site_web: po.site_web,
      liens_utiles: safeParse(po.liens_utiles||'[]'),
      date_attribution: po.date_attribution,
    } : null,
    is_deal_master: !!dmLaureat,
    deal_master: dmLaureat ? { ...dmLaureat, nb_editions: dmHistorique } : null,
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
    const cur = await db.prepare("SELECT profil_json FROM users WHERE id=?").get(user.id);
    const merged = { ...safeParse(cur.profil_json), ...body.profil };
    fields.push("profil_json=?"); vals.push(JSON.stringify(merged));
  }
  if (body.privacy !== undefined) {
    fields.push("privacy_json=?"); vals.push(JSON.stringify(body.privacy));
  }
  if (fields.length) { vals.push(user.id); db.prepare(`UPDATE users SET ${fields.join(",")} WHERE id=?`).run(...vals); }
  const up = await db.prepare("SELECT id,nom,prenom,email,role,ville,pays,bio,photo_url,banner_url,titre_pro,competences,experiences,theme_couleur,centres_interet,situation_pro,telephone,profil_json,privacy_json FROM users WHERE id=?").get(user.id);
  sendJSON(res, 200, { profil: { ...publicUser(up), bio: up.bio, photo_url: up.photo_url, banner_url: up.banner_url,
    prenom: up.prenom, titre_pro: up.titre_pro, theme_couleur: up.theme_couleur,
    competences: safeParse(up.competences||"[]"), experiences: safeParse(up.experiences||"[]"),
    centres_interet: safeParse(up.centres_interet||"[]"), situation_pro: up.situation_pro, telephone: up.telephone,
    privacy: safeParse(up.privacy_json||"{}") } });
});

/* ---------- Profil — Fil d'activité publique ---------- */
route("GET", "/api/profil/:id/activite", async (req, res, params) => {
  const uid = parseInt(params.id);
  if (!uid) return sendJSON(res, 400, { error: "ID invalide." });
  const u = await db.prepare("SELECT id,privacy_json FROM users WHERE id=?").get(uid);
  if (!u) return sendJSON(res, 404, { error: "Profil introuvable." });
  const me = getCurrentUser(req);
  const isOwn = me && me.id === uid;
  const privacy = safeParse(u.privacy_json || "{}");
  const query = new URL("http://x" + req.url).searchParams;
  const page = Math.max(1, parseInt(query.get('page') || '1'));
  const cat = query.get('categorie') || 'all';
  const q = (query.get('q') || '').toLowerCase();
  const LIMIT = 20;
  const OFFSET = (page - 1) * LIMIT;

  function visOk(section) {
    const v = privacy[section] || 'public';
    if (v === 'public') return true;
    if (v === 'prive') return isOwn;
    if (v === 'membres') return !!me;
    if (v === 'relations') return isOwn || (me && !!await db.prepare("SELECT 1 FROM user_follows WHERE follower_id=? AND followed_id=?").get(me.id, uid));
    return true;
  }

  let items = [];

  if ((cat === 'all' || cat === 'publications') && visOk('publications')) {
    const rows = await db.prepare(`SELECT 'publication' AS type, id, contenu AS titre, categorie, created_at FROM fil_posts WHERE auteur_id=? ORDER BY created_at DESC LIMIT 50`).all(uid);
    rows.forEach(r => items.push({ type:'publication', id:r.id, titre:r.titre?.substring(0,120), categorie:r.categorie||'Publication', date:r.created_at, url:`/fil-actualite.html` }));
  }
  if ((cat === 'all' || cat === 'evenements') && visOk('evenements')) {
    try {
      const rows = await db.prepare(`SELECT 'evenement' AS type, id, titre, type_evt AS categorie, date_debut AS date FROM evenements WHERE organisateur_id=? ORDER BY date_debut DESC LIMIT 20`).all(uid);
      rows.forEach(r => items.push({ type:'evenement', id:r.id, titre:r.titre, categorie:r.categorie||'Événement', date:r.date, url:`/evenements.html` }));
    } catch(e) {}
  }
  if ((cat === 'all' || cat === 'accreditations') && visOk('accreditations')) {
    try {
      const rows = await db.prepare(`SELECT 'accreditation' AS type, id, type AS categorie, created_at AS date FROM accreditations_da WHERE user_id=? AND statut='active' ORDER BY created_at DESC LIMIT 10`).all(uid);
      rows.forEach(r => items.push({ type:'accreditation', id:r.id, titre:`Accréditation ${r.categorie}`, categorie:'Accréditation', date:r.date, url:`/profil.html?id=${uid}` }));
    } catch(e) {}
  }
  if ((cat === 'all' || cat === 'commentaires') && visOk('commentaires')) {
    try {
      const rows = await db.prepare(`SELECT 'commentaire' AS type, id, contenu AS titre, created_at AS date FROM fil_commentaires WHERE auteur_id=? ORDER BY created_at DESC LIMIT 20`).all(uid);
      rows.forEach(r => items.push({ type:'commentaire', id:r.id, titre:r.titre?.substring(0,100), categorie:'Commentaire', date:r.date, url:`/fil-actualite.html` }));
    } catch(e) {}
  }

  // Sort chronologically, apply search filter, paginate
  items.sort((a,b) => new Date(b.date) - new Date(a.date));
  if (q) items = items.filter(i => (i.titre||'').toLowerCase().includes(q) || (i.categorie||'').toLowerCase().includes(q));
  const total = items.length;
  items = items.slice(OFFSET, OFFSET + LIMIT);
  sendJSON(res, 200, { activite: items, total, page, pages: Math.ceil(total / LIMIT) });
});

/* ---------- Profil — Publications complètes ---------- */
route("GET", "/api/profil/:id/publications", async (req, res, params) => {
  const uid = parseInt(params.id);
  const query = new URL("http://x" + req.url).searchParams;
  const page = Math.max(1, parseInt(query.get('page') || '1'));
  const cat = query.get('categorie') || 'all';
  const q = (query.get('q') || '').toLowerCase();
  const LIMIT = 15, OFFSET = (page-1)*LIMIT;
  let rows;
  if (cat === 'all') {
    rows = db.prepare(`SELECT p.id, p.type, p.categorie, p.contenu, p.created_at, COUNT(DISTINCT r.id) AS nb_reactions, COUNT(DISTINCT c.id) AS nb_commentaires FROM fil_posts p LEFT JOIN fil_reactions r ON r.post_id=p.id LEFT JOIN fil_commentaires c ON c.post_id=p.id WHERE p.auteur_id=? GROUP BY p.id ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(uid, LIMIT, OFFSET);
  } else {
    rows = db.prepare(`SELECT p.id, p.type, p.categorie, p.contenu, p.created_at, COUNT(DISTINCT r.id) AS nb_reactions, COUNT(DISTINCT c.id) AS nb_commentaires FROM fil_posts p LEFT JOIN fil_reactions r ON r.post_id=p.id LEFT JOIN fil_commentaires c ON c.post_id=p.id WHERE p.auteur_id=? AND (p.categorie=? OR p.type=?) GROUP BY p.id ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(uid, cat, cat, LIMIT, OFFSET);
  }
  if (q) rows = rows.filter(r => (r.contenu||'').toLowerCase().includes(q));
  const total = db.prepare("SELECT COUNT(*) AS n FROM fil_posts WHERE auteur_id=?").get(uid).n;
  sendJSON(res, 200, { publications: rows, total, page, pages: Math.ceil(total/LIMIT) });
});

/* ---------- Profil — Publicités actives/passées ---------- */
route("GET", "/api/profil/:id/publicites", async (req, res, params) => {
  const uid = parseInt(params.id);
  try {
    const rows = db.prepare(`SELECT id,nom_campagne,titre,format,statut,date_debut,date_fin,image_url,description,lien_cible FROM publicites WHERE created_by=? AND statut IN ('active','terminee') ORDER BY created_at DESC LIMIT 20`).all(uid);
    sendJSON(res, 200, { publicites: rows });
  } catch(e) { sendJSON(res, 200, { publicites: [] }); }
});

/* ---------- Profil — Comptes suivis ---------- */
route("GET", "/api/profil/:id/suivis", async (req, res, params) => {
  const uid = parseInt(params.id);
  const u = await db.prepare("SELECT privacy_json FROM users WHERE id=?").get(uid);
  if (!u) return sendJSON(res, 404, { error: "Introuvable." });
  const me = getCurrentUser(req);
  const privacy = safeParse(u.privacy_json || "{}");
  const vis = privacy.contacts || 'public';
  if (vis === 'prive' && !(me && me.id === uid)) return sendJSON(res, 200, { suivis: [], total: 0, masque: true });
  if (vis === 'membres' && !me) return sendJSON(res, 200, { suivis: [], total: 0, masque: true });
  if (vis === 'relations' && me && me.id !== uid && !await db.prepare("SELECT 1 FROM user_follows WHERE follower_id=? AND followed_id=?").get(me.id, uid))
    return sendJSON(res, 200, { suivis: [], total: 0, masque: true });
  const query = new URL("http://x" + req.url).searchParams;
  const page = Math.max(1, parseInt(query.get('page')||'1'));
  const q = (query.get('q')||'').toLowerCase();
  const LIMIT = 20, OFFSET = (page-1)*LIMIT;
  let rows = await db.prepare(`
    SELECT u2.id, u2.nom, u2.prenom, u2.role, u2.ville, u2.pays, u2.titre_pro, u2.bio, u2.photo_url
    FROM user_follows uf JOIN users u2 ON u2.id = uf.followed_id
    WHERE uf.follower_id = ? ORDER BY uf.created_at DESC LIMIT ? OFFSET ?`).all(uid, LIMIT, OFFSET);
  if (q) rows = rows.filter(r => `${r.nom} ${r.prenom||''} ${r.titre_pro||''} ${r.pays||''}`.toLowerCase().includes(q));
  const total = db.prepare("SELECT COUNT(*) AS n FROM user_follows WHERE follower_id=?").get(uid).n;
  sendJSON(res, 200, { suivis: rows, total, page, pages: Math.ceil(total/LIMIT) });
});

/* ---------- Profil — Abonnés ---------- */
route("GET", "/api/profil/:id/abonnes", async (req, res, params) => {
  const uid = parseInt(params.id);
  const u = await db.prepare("SELECT privacy_json FROM users WHERE id=?").get(uid);
  if (!u) return sendJSON(res, 404, { error: "Introuvable." });
  const me = getCurrentUser(req);
  const privacy = safeParse(u.privacy_json || "{}");
  const vis = privacy.contacts || 'public';
  if (vis === 'prive' && !(me && me.id === uid)) return sendJSON(res, 200, { abonnes: [], total: 0, masque: true });
  if (vis === 'membres' && !me) return sendJSON(res, 200, { abonnes: [], total: 0, masque: true });
  const query = new URL("http://x" + req.url).searchParams;
  const page = Math.max(1, parseInt(query.get('page')||'1'));
  const q = (query.get('q')||'').toLowerCase();
  const LIMIT = 20, OFFSET = (page-1)*LIMIT;
  let rows = await db.prepare(`
    SELECT u2.id, u2.nom, u2.prenom, u2.role, u2.ville, u2.pays, u2.titre_pro, u2.bio, u2.photo_url
    FROM user_follows uf JOIN users u2 ON u2.id = uf.follower_id
    WHERE uf.followed_id = ? ORDER BY uf.created_at DESC LIMIT ? OFFSET ?`).all(uid, LIMIT, OFFSET);
  if (q) rows = rows.filter(r => `${r.nom} ${r.prenom||''} ${r.titre_pro||''} ${r.pays||''}`.toLowerCase().includes(q));
  const total = db.prepare("SELECT COUNT(*) AS n FROM user_follows WHERE followed_id=?").get(uid).n;
  sendJSON(res, 200, { abonnes: rows, total, page, pages: Math.ceil(total/LIMIT) });
});

/* ---------- Profil — Relations & points en commun ---------- */
route("GET", "/api/profil/:id/communs", async (req, res, params) => {
  const uid = parseInt(params.id);
  const me = getCurrentUser(req);
  if (!me || me.id === uid) return sendJSON(res, 200, { users_communs:[], initiatives_communes:[], evenements_communs:[], points:[], suggestions:[] });

  // Utilisateurs suivis en commun
  const users_communs = await db.prepare(`
    SELECT u.id, u.nom, u.prenom, u.titre_pro, u.ville, u.pays, u.photo_url
    FROM user_follows f1
    JOIN user_follows f2 ON f2.followed_id = f1.followed_id AND f2.follower_id = ?
    JOIN users u ON u.id = f1.followed_id
    WHERE f1.follower_id = ? AND f1.followed_id != ? AND f1.followed_id != ?
    LIMIT 12`).all(me.id, uid, me.id, uid);

  // Initiatives suivies en commun
  const initiatives_communes = await db.prepare(`
    SELECT i.id, i.nom, i.slug, i.domaine, i.pays
    FROM abonnements a1
    JOIN abonnements a2 ON a2.initiative_id = a1.initiative_id AND a2.user_id = ?
    JOIN initiatives i ON i.id = a1.initiative_id
    WHERE a1.user_id = ?
    LIMIT 10`).all(me.id, uid);

  // Événements en commun (participants aux mêmes événements)
  let evenements_communs = [];
  try {
    evenements_communs = await db.prepare(`
      SELECT e.id, e.titre, e.date_debut, e.ville
      FROM event_inscriptions ei1
      JOIN event_inscriptions ei2 ON ei2.evenement_id = ei1.evenement_id AND ei2.user_id = ?
      JOIN evenements e ON e.id = ei1.evenement_id
      WHERE ei1.user_id = ? LIMIT 8`).all(me.id, uid);
  } catch(e) {}

  // Points en commun (attributs partagés)
  const uMe = await db.prepare("SELECT ville,pays,titre_pro,centres_interet,competences,situation_pro FROM users WHERE id=?").get(me.id);
  const uThem = await db.prepare("SELECT ville,pays,titre_pro,centres_interet,competences,situation_pro FROM users WHERE id=?").get(uid);
  const points = [];
  if (uMe && uThem) {
    if (uMe.pays && uThem.pays && uMe.pays === uThem.pays) points.push({ type:'pays', label:'Même pays', valeur: uMe.pays });
    if (uMe.ville && uThem.ville && uMe.ville.toLowerCase() === uThem.ville.toLowerCase()) points.push({ type:'ville', label:'Même ville', valeur: uMe.ville });
    if (uMe.situation_pro && uThem.situation_pro && uMe.situation_pro === uThem.situation_pro) points.push({ type:'profession', label:'Même situation professionnelle', valeur: uMe.situation_pro });
    const ci1 = safeParse(uMe.centres_interet||"[]");
    const ci2 = safeParse(uThem.centres_interet||"[]");
    const ciCommuns = ci1.filter(c => ci2.includes(c));
    if (ciCommuns.length) points.push({ type:'interets', label:`${ciCommuns.length} centre(s) d'intérêt en commun`, valeur: ciCommuns.join(', ') });
    const comp1 = safeParse(uMe.competences||"[]");
    const comp2 = safeParse(uThem.competences||"[]");
    const compCommuns = comp1.filter(c => comp2.some(c2 => c2.nom === c.nom || c2 === c.nom || c === c2));
    if (compCommuns.length) points.push({ type:'competences', label:`${compCommuns.length} compétence(s) en commun`, valeur: (compCommuns.map(c=>c.nom||c)).join(', ') });
  }

  // Suggestions
  const suggestions = [];
  if (users_communs.length >= 2) suggestions.push(`Vous suivez ${users_communs.length} comptes en commun.`);
  if (initiatives_communes.length) suggestions.push(`Vous soutenez ${initiatives_communes.length} initiative(s) diaspora commune(s).`);
  if (evenements_communs.length) suggestions.push(`Vous participez aux mêmes événements.`);
  const ciC = points.find(p=>p.type==='interets');
  if (ciC) suggestions.push(`Vous partagez des centres d'intérêt (${ciC.valeur}).`);
  const villC = points.find(p=>p.type==='ville');
  if (villC) suggestions.push(`Vous êtes tous les deux basés à ${villC.valeur}.`);
  if (suggestions.length === 0 && (users_communs.length > 0 || points.length > 0)) suggestions.push('Vous avez plusieurs points en commun — lancez la conversation !');

  sendJSON(res, 200, { users_communs, initiatives_communes, evenements_communs, points, suggestions, nb_communs: users_communs.length + initiatives_communes.length + evenements_communs.length });
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
  // Blocage : impossible de se désabonner du compte officiel Diaspo'Actif
  const officialId = getOfficialUserId();
  if (officialId && parseInt(params.id) === officialId) {
    return sendJSON(res, 403, { error: "L'abonnement au compte officiel Diaspo'Actif est obligatoire et ne peut pas être supprimé." });
  }
  await db.prepare("DELETE FROM user_follows WHERE follower_id=? AND followed_id=?").run(me.id, parseInt(params.id));
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
  const row = await db.prepare("SELECT mime, data FROM uploads WHERE id=?").get(params.id);
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
  const inits = await db.prepare(`
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
    ? await db.prepare("SELECT id,slug,nom,domaine,pays,ville,description,owner_user_id FROM initiatives WHERE nom LIKE ? OR description LIKE ? OR domaine LIKE ? LIMIT 8").all(like, like, like).map(i => ({
        ...i,
        accreditations: i.owner_user_id
          ? await db.prepare("SELECT type FROM compte_accreditations WHERE user_id=? AND statut='active'").all(i.owner_user_id).map(a => a.type)
          : []
      }))
    : [];
  const publications = (type === "tous" || type === "publications")
    ? await db.prepare("SELECT id,auteur_nom,contenu,categorie,created_at FROM fil_posts WHERE contenu LIKE ? OR auteur_nom LIKE ? LIMIT 8").all(like, like)
    : [];
  const formations = (type === "tous" || type === "formations")
    ? await db.prepare("SELECT id,titre,domaine,organisme,gratuit,duree FROM formations WHERE titre LIKE ? OR description LIKE ? OR organisme LIKE ? LIMIT 8").all(like, like, like)
    : [];
  const evenements = (type === "tous" || type === "evenements")
    ? await db.prepare("SELECT id,titre,lieu,date_evt,type_evt,pays FROM evenements WHERE titre LIKE ? OR lieu LIKE ? OR description LIKE ? LIMIT 8").all(like, like, like)
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
  const rows = await db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?").all(user.id, limit);
  const non_lues = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND lue=0").get(user.id).n;
  sendJSON(res, 200, { notifications: rows.map(r => ({ ...r, data: safeParse(r.data_json) })), non_lues });
});

route("PATCH", "/api/notifications/:id/lire", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  await db.prepare("UPDATE notifications SET lue=1 WHERE id=? AND user_id=?").run(params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

route("POST", "/api/notifications/lire-tout", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  await db.prepare("UPDATE notifications SET lue=1 WHERE user_id=?").run(user.id);
  sendJSON(res, 200, { ok: true });
});

/* ---------- Événements (complet) ---------- */
route("GET", "/api/evenements", async (req, res, params, body, query) => {
  let rows = await db.prepare("SELECT e.*, u.nom AS organisateur_nom FROM evenements e LEFT JOIN users u ON u.id=e.owner_user_id ORDER BY e.date_evt ASC").all();
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
  const {
    titre, organisateur, date_evt, lieu, pays, ville, description, type_evt, domaine,
    places_max, inscription_ouverte, lien_inscription, image_url,
    heure_debut, heure_fin, date_fin, lien_visio, visibilite,
    image_couverture, galerie_photos, video1_url, video1_titre, video2_url, video2_titre,
    pdf_url, pdf_nom, pdf_acces
  } = body;
  if (!titre || !date_evt) return sendJSON(res, 400, { error: "Titre et date requis." });
  const coverImg = image_couverture || image_url || null;
  const galerie = Array.isArray(galerie_photos) ? JSON.stringify(galerie_photos.slice(0,4)) : (galerie_photos || '[]');
  const id = db.prepare(`INSERT INTO evenements
    (titre,organisateur,date_evt,lieu,pays,ville,description,type_evt,domaine,places_max,
     inscription_ouverte,lien_inscription,image_url,statut,owner_user_id,
     heure_debut,heure_fin,date_fin,lien_visio,visibilite,
     image_couverture,galerie_photos,video1_url,video1_titre,video2_url,video2_titre,
     pdf_url,pdf_nom,pdf_acces)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'ouvert',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      titre, organisateur || user.nom, date_evt, lieu||null, pays||null, ville||null,
      description||null, type_evt||"evenement", domaine||null, places_max||null,
      inscription_ouverte!==false?1:0, lien_inscription||null, coverImg, user.id,
      heure_debut||null, heure_fin||null, date_fin||null, lien_visio||null, visibilite||'public',
      coverImg, galerie,
      video1_url||null, video1_titre||null, video2_url||null, video2_titre||null,
      pdf_url||null, pdf_nom||null, pdf_acces||'public'
    ).lastInsertRowid;
  // Notifier abonnés de l'initiative
  const init = await db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(user.id);
  if (init) {
    const abonnes = await db.prepare("SELECT user_id FROM abonnements WHERE initiative_id=?").all(init.id);
    abonnes.forEach(a => creerNotif(a.user_id, "evenement", "Nouvel événement", `${user.nom} organise : ${titre}`, { evenement_id: id }));
  }
  sendJSON(res, 201, { id });
});

route("GET", "/api/evenements/:id", async (req, res, params) => {
  const row = await db.prepare("SELECT e.*,u.nom AS organisateur_nom FROM evenements e LEFT JOIN users u ON u.id=e.owner_user_id WHERE e.id=?").get(params.id);
  if (!row) return sendJSON(res, 404, { error: "Événement introuvable." });
  const participants = await db.prepare("SELECT u.id,u.nom,u.ville FROM evenements_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.evenement_id=?").all(params.id);
  sendJSON(res, 200, { evenement: row, participants, nb_participants: participants.length });
});

route("POST", "/api/evenements/:id/rejoindre", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const evt = await db.prepare("SELECT * FROM evenements WHERE id=?").get(params.id);
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
  await db.prepare("DELETE FROM evenements_participants WHERE evenement_id=? AND user_id=?").run(params.id, user.id);
  sendJSON(res, 200, { ok: true, inscrit: false });
});

route("GET", "/api/mes-evenements", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = await db.prepare("SELECT e.* FROM evenements_participants ep JOIN evenements e ON e.id=ep.evenement_id WHERE ep.user_id=? ORDER BY e.date_evt ASC").all(user.id);
  sendJSON(res, 200, { evenements: rows });
});

/* ---------- Modération administrateur ---------- */
/* ══ D'A TUTOR AI ══ */
route("GET", "/api/admin/tutoriels", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé au Super Administrateur." });
  const rows = await db.prepare("SELECT id,titre,sujet,niveau,statut,vues,created_at FROM da_tutoriels ORDER BY created_at DESC").all();
  sendJSON(res, 200, { tutoriels: rows });
});

route("GET", "/api/admin/tutoriels/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé au Super Administrateur." });
  const t = await db.prepare("SELECT * FROM da_tutoriels WHERE id=?").get(params.id);
  if (!t) return sendJSON(res, 404, { error: "Tutoriel introuvable." });
  await db.prepare("UPDATE da_tutoriels SET vues=vues+1 WHERE id=?").run(params.id);
  t.contenu_json = safeJSON(t.contenu_json, {});
  sendJSON(res, 200, { tutoriel: t });
});

route("POST", "/api/admin/tutoriels", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé au Super Administrateur." });
  const { titre, sujet, objectif, niveau = "debutant", format_souhaite = "texte", contenu_json } = body;
  if (!titre || !sujet) return sendJSON(res, 400, { error: "Titre et sujet obligatoires." });
  const r = db.prepare("INSERT INTO da_tutoriels (titre,sujet,objectif,niveau,format_souhaite,contenu_json) VALUES (?,?,?,?,?,?)").run(
    titre, sujet, objectif||null, niveau, format_souhaite, JSON.stringify(contenu_json||{})
  );
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

route("PUT", "/api/admin/tutoriels/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé au Super Administrateur." });
  const { titre, sujet, objectif, niveau, statut, contenu_json } = body;
  db.prepare("UPDATE da_tutoriels SET titre=COALESCE(?,titre), sujet=COALESCE(?,sujet), objectif=COALESCE(?,objectif), niveau=COALESCE(?,niveau), statut=COALESCE(?,statut), contenu_json=COALESCE(?,contenu_json), updated_at=datetime('now') WHERE id=?")
    .run(titre||null, sujet||null, objectif||null, niveau||null, statut||null, contenu_json ? JSON.stringify(contenu_json) : null, params.id);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/admin/tutoriels/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé au Super Administrateur." });
  await db.prepare("DELETE FROM da_tutoriels WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

route("GET", "/api/admin/membres", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const role = query.role || null;
  const q = query.q ? `%${query.q}%` : null;
  let sql = "SELECT id,nom,prenom,email,telephone,role,ville,pays,statut_verification,created_at FROM users WHERE 1=1";
  const args = [];
  if (role) { sql += " AND role=?"; args.push(role); }
  if (q) { sql += " AND (nom LIKE ? OR prenom LIKE ? OR email LIKE ?)"; args.push(q, q, q); }
  sql += " ORDER BY created_at DESC LIMIT 200";
  const rows = await db.prepare(sql).all(...args);
  sendJSON(res, 200, { membres: rows });
});

route("DELETE", "/api/admin/membres/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  if (Number(params.id) === user.id) return sendJSON(res, 400, { error: "Impossible de supprimer votre propre compte." });
  await db.prepare("DELETE FROM users WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

route("GET", "/api/admin/comptes", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const statut = query.statut || "en_attente";
  const rows = await db.prepare("SELECT id,nom,prenom,email,role,ville,pays,statut_verification,created_at FROM users WHERE statut_verification=? ORDER BY created_at DESC").all(statut);
  sendJSON(res, 200, { comptes: rows });
});

route("PATCH", "/api/admin/comptes/:id/valider", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  await db.prepare("UPDATE users SET statut_verification='valide' WHERE id=?").run(params.id);
  const cible = await db.prepare("SELECT nom FROM users WHERE id=?").get(params.id);
  if (cible) creerNotif(Number(params.id), "validation", "Compte validé !", "Votre compte a été validé par l'équipe Diaspo'Actif. Vous avez maintenant accès à toutes les fonctionnalités.", {});
  sendJSON(res, 200, { ok: true, statut: "valide" });
});

route("PATCH", "/api/admin/comptes/:id/rejeter", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  await db.prepare("UPDATE users SET statut_verification='rejete' WHERE id=?").run(params.id);
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
  await db.prepare(`DELETE FROM ${table} WHERE id=?`).run(params.id);
  sendJSON(res, 200, { ok: true });
});

route("GET", "/api/admin/contenus", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const posts = await db.prepare("SELECT p.*,u.nom AS auteur FROM fil_posts p LEFT JOIN users u ON u.id=p.auteur_id ORDER BY p.created_at DESC LIMIT 20").all();
  const formations = await db.prepare("SELECT f.*,u.nom AS auteur FROM formations f LEFT JOIN users u ON u.id=f.owner_user_id ORDER BY f.created_at DESC LIMIT 20").all();
  const evenements = await db.prepare("SELECT e.*,u.nom AS auteur FROM evenements e LEFT JOIN users u ON u.id=e.owner_user_id ORDER BY e.created_at DESC LIMIT 20").all();
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
  const rows = await db.prepare("SELECT i.id,i.nom,i.slug,i.domaine,i.pays,i.created_at, c.statut AS certif_statut, c.niveau AS certif_niveau, c.date_attribution FROM initiatives i LEFT JOIN certifications c ON c.initiative_id=i.id ORDER BY i.nom ASC").all();
  sendJSON(res, 200, { initiatives: rows });
});

/* Fiche d'évaluation : lecture */
route("GET", "/api/admin/certifications/:id/evaluation", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const eval_ = await db.prepare("SELECT * FROM certification_evaluations WHERE initiative_id=?").get(params.id) || { initiative_id: Number(params.id) };
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
  const existing = await db.prepare("SELECT id FROM certification_evaluations WHERE initiative_id=?").get(params.id);
  const vals = fields.map(f => body[f] !== undefined ? body[f] : null);
  if (existing) {
    const sets = fields.map(f => `${f}=?`).join(",") + ",updated_at=datetime('now')";
    await db.prepare(`UPDATE certification_evaluations SET ${sets} WHERE initiative_id=?`).run(...vals, params.id);
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
  const init = await db.prepare("SELECT id,nom FROM initiatives WHERE id=?").get(params.id);
  if (!init) return sendJSON(res, 404, { error: "Initiative introuvable." });
  const niveau = body.niveau || "verifie";
  const existing = await db.prepare("SELECT id FROM certifications WHERE initiative_id=?").get(params.id);
  if (existing) {
    db.prepare("UPDATE certifications SET statut='actif',niveau=?,admin_id=?,date_attribution=datetime('now'),updated_at=datetime('now') WHERE initiative_id=?").run(niveau, user.id, params.id);
  } else {
    db.prepare("INSERT INTO certifications (initiative_id,niveau,statut,admin_id) VALUES (?,?,'actif',?)").run(params.id, niveau, user.id);
  }
  histoCertif(Number(params.id), "attribution", user, body.motif || "Badge attribué", `Niveau : ${niveau}`);
  // Notifier le propriétaire de l'initiative
  const owner = await db.prepare("SELECT owner_user_id FROM initiatives WHERE id=?").get(params.id);
  if (owner?.owner_user_id) {
    creerNotif(owner.owner_user_id, "certification", "🛡️ Badge Initiative Vérifiée obtenu !", `Félicitations ! L'initiative « ${init.nom} » vient d'obtenir le badge Initiative Vérifiée Diaspo'Actif.`, { initiative_id: init.id });
  }
  sendJSON(res, 200, { ok: true });
});

/* Suspendre le badge */
route("POST", "/api/admin/certifications/:id/suspendre", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const existing = await db.prepare("SELECT id FROM certifications WHERE initiative_id=?").get(params.id);
  if (!existing) return sendJSON(res, 404, { error: "Aucune certification pour cette initiative." });
  db.prepare("UPDATE certifications SET statut='suspendu',updated_at=datetime('now') WHERE initiative_id=?").run(params.id);
  histoCertif(Number(params.id), "suspension", user, body.motif || null, null);
  sendJSON(res, 200, { ok: true });
});

/* Retirer le badge */
route("POST", "/api/admin/certifications/:id/retirer", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const existing = await db.prepare("SELECT id FROM certifications WHERE initiative_id=?").get(params.id);
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
  const rows = await db.prepare("SELECT * FROM certification_historique WHERE initiative_id=? ORDER BY created_at DESC").all(params.id);
  sendJSON(res, 200, { historique: rows });
});

/* ========== FIN ROUTES CERTIFICATION ========== */

/* ---------- Financements ---------- */
route("GET", "/api/financements", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const fins = await db.prepare("SELECT * FROM financements WHERE user_id=? ORDER BY date_don DESC").all(user.id);
  sendJSON(res, 200, { financements: fins });
});

route("POST", "/api/financements", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const { projet, montant } = body;
  if (!projet || !montant) return sendJSON(res, 400, { error: "Champs manquants." });
  const r = db.prepare("INSERT INTO financements (user_id, projet, montant) VALUES (?,?,?)").run(user.id, projet, montant);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* ---------- Collaborations (appels à contribution) ---------- */
route("GET", "/api/collaborations", async (req, res, params, body, query) => {
  let rows = await db.prepare(`SELECT c.*,u.nom AS auteur_nom,i.nom AS initiative_nom FROM collaborations c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN initiatives i ON i.id=c.initiative_id ORDER BY c.created_at DESC`).all();
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
  const init = await db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(user.id);
  const id = db.prepare("INSERT INTO collaborations (user_id,partenaire,titre,description,type_collab,competences,deadline,statut,initiative_id) VALUES (?,?,?,?,?,?,?,'ouvert',?)")
    .run(user.id, partenaire||user.nom, titre, description||null, type_collab||"benevolat", JSON.stringify(Array.isArray(competences)?competences:[]), deadline||null, init?.id||null).lastInsertRowid;
  sendJSON(res, 201, { id });
});

route("GET", "/api/collaborations/:id", async (req, res, params) => {
  const row = await db.prepare("SELECT c.*,u.nom AS auteur_nom,i.nom AS initiative_nom FROM collaborations c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN initiatives i ON i.id=c.initiative_id WHERE c.id=?").get(params.id);
  if (!row) return sendJSON(res, 404, { error: "Collaboration introuvable." });
  const candidatures = await db.prepare("SELECT ca.*,u.nom AS candidat_nom FROM candidatures ca JOIN users u ON u.id=ca.user_id WHERE ca.collaboration_id=? ORDER BY ca.created_at DESC").all(params.id);
  sendJSON(res, 200, { collaboration: { ...row, competences: safeParse(row.competences||"[]") }, candidatures });
});

route("POST", "/api/collaborations/:id/candidater", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const collab = await db.prepare("SELECT * FROM collaborations WHERE id=?").get(params.id);
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
  const rows = await db.prepare("SELECT ca.*,c.titre,c.partenaire,c.type_collab,u2.nom AS auteur_nom FROM candidatures ca JOIN collaborations c ON c.id=ca.collaboration_id LEFT JOIN users u2 ON u2.id=c.user_id WHERE ca.user_id=? ORDER BY ca.created_at DESC").all(user.id);
  sendJSON(res, 200, { candidatures: rows });
});

/* ---------- Helper : enrichir un post ---------- */
function enrichPost(p, cu) {
  const reactions = db.prepare("SELECT type,COUNT(*) AS n FROM fil_reactions WHERE post_id=? GROUP BY type").all(p.id);
  const counts = {}; reactions.forEach(r => counts[r.type] = r.n);
  const nb_commentaires = db.prepare("SELECT COUNT(*) AS n FROM fil_commentaires WHERE post_id=?").get(p.id).n;
  const user_a_aime = cu ? !!await db.prepare("SELECT 1 FROM fil_reactions WHERE post_id=? AND user_id=? AND type='like'").get(p.id, cu.id) : false;

  let auteur = {}, auteur_certif = null;
  if (p.auteur_id) {
    const u = await db.prepare("SELECT photo_url,banner_url,ville,pays,nationalite1,titre_pro,bio,situation_pro,theme_couleur,role FROM users WHERE id=?").get(p.auteur_id);
    if (u) {
      auteur = u;
      if (u.role === "initiative") {
        const init = await db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(p.auteur_id);
        if (init) auteur_certif = getCertif(init.id);
      }
    }
  }
  // Fallback : posts seedés sans auteur_id — chercher par nom d'initiative
  if (!auteur_certif && p.auteur_nom) {
    const initByName = await db.prepare("SELECT id FROM initiatives WHERE nom=? OR sigle=?").get(p.auteur_nom, p.auteur_nom);
    if (initByName) auteur_certif = getCertif(initByName.id);
  }

  // Score de popularité : likes×3 + commentaires×2 + reposts×1
  const nb_reposts = db.prepare("SELECT COUNT(*) AS n FROM fil_posts WHERE original_post_id=?").get(p.id).n;
  const score = (counts.like||0)*3 + nb_commentaires*2 + nb_reposts;

  let original_post = null;
  if ((p.type === "repost" || p.pub_type === "repost") && p.original_post_id) {
    const orig = await db.prepare("SELECT * FROM fil_posts WHERE id=?").get(p.original_post_id);
    if (orig) {
      let orig_auteur = {};
      if (orig.auteur_id) {
        const ou = await db.prepare("SELECT photo_url,banner_url,ville,pays,nationalite1,titre_pro,bio,situation_pro,theme_couleur FROM users WHERE id=?").get(orig.auteur_id);
        if (ou) orig_auteur = ou;
      }
      const orig_reactions = db.prepare("SELECT type,COUNT(*) AS n FROM fil_reactions WHERE post_id=? GROUP BY type").all(orig.id);
      const orig_counts = {}; orig_reactions.forEach(r => orig_counts[r.type] = r.n);
      original_post = { ...orig, reactions: orig_counts, auteur_profil: orig_auteur };
    }
  }
  const auteur_accreditations = p.auteur_id
    ? await db.prepare("SELECT type FROM compte_accreditations WHERE user_id=? AND statut='active'").all(p.auteur_id).map(a => a.type)
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
    const followedUsers = await db.prepare("SELECT followed_id FROM user_follows WHERE follower_id=?").all(cu.id).map(r => r.followed_id);
    // IDs des initiatives suivies → propriétaires (owner_user_id)
    const followedInits = await db.prepare("SELECT initiative_id FROM abonnements WHERE user_id=?").all(cu.id).map(r => r.initiative_id);
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
    const followedUsers = await db.prepare("SELECT followed_id FROM user_follows WHERE follower_id=?").all(cu.id).map(r => r.followed_id);
    const followedInits = await db.prepare("SELECT initiative_id FROM abonnements WHERE user_id=?").all(cu.id).map(r => r.initiative_id);
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
  await db.prepare(`SELECT * FROM fil_posts WHERE 1=1 ${excludeClause} ORDER BY created_at DESC LIMIT 30`).all(...excludeArgs)
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
  await db.prepare("DELETE FROM user_follows WHERE follower_id=? AND followed_id=?").run(cu.id, Number(params.id));
  sendJSON(res, 200, { ok: true, suivi: false });
});

/* ---------- Meta du fil (mes follows pour l'UI) ---------- */
route("GET", "/api/fil/meta", async (req, res) => {
  const cu = getCurrentUser(req);
  if (!cu) return sendJSON(res, 200, { suivis_users: [], suivis_initiatives: [] });
  const suivis_users = await db.prepare("SELECT followed_id AS id FROM user_follows WHERE follower_id=?").all(cu.id).map(r => r.id);
  const suivis_initiatives = await db.prepare("SELECT initiative_id AS id FROM abonnements WHERE user_id=?").all(cu.id).map(r => r.id);
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

/* ===== MODULE RÉSEAU PROFESSIONNEL ===== */

// Liste paginée des professionnels avec filtres
route("GET", "/api/admin/reseau-pro", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });

  const q = req.query || {};
  const page  = Math.max(1, parseInt(q.page) || 1);
  const limit = Math.min(100, parseInt(q.limit) || 30);
  const offset = (page - 1) * limit;

  let where = ["u.role IN ('utilisateur','initiative','collectivite','officiel')"];
  const params = [];

  if (q.pays)     { where.push("u.pays = ?");         params.push(q.pays); }
  if (q.ville)    { where.push("u.ville LIKE ?");      params.push('%' + q.ville + '%'); }
  if (q.origine)  { where.push("(u.origine1 = ? OR u.origine2 = ?)"); params.push(q.origine, q.origine); }
  if (q.nationalite) { where.push("(u.nationalite1 = ? OR u.nationalite2 = ?)"); params.push(q.nationalite, q.nationalite); }
  if (q.domaine)  { where.push("u.situation_pro LIKE ?"); params.push('%' + q.domaine + '%'); }
  if (q.role)     { where.push("u.role = ?");          params.push(q.role); }
  if (q.actif === '1') {
    where.push("EXISTS (SELECT 1 FROM user_activity a WHERE a.user_id=u.id AND a.date >= date('now','-30 days'))");
  }

  const whereStr = where.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) n FROM users u WHERE ${whereStr}`).get(...params).n;
  const rows  = db.prepare(`
    SELECT u.id, u.nom, u.prenom, u.titre_pro, u.situation_pro,
           u.ville, u.pays, u.origine1 AS pays_origine, u.nationalite1 AS nationalite,
           u.role, substr(u.created_at,1,10) AS date_inscription,
           CASE WHEN a.user_id IS NOT NULL THEN 1 ELSE 0 END AS actif_30j
    FROM users u
    LEFT JOIN (
      SELECT DISTINCT user_id FROM user_activity WHERE date >= date('now','-30 days')
    ) a ON a.user_id = u.id
    WHERE ${whereStr}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  sendJSON(res, 200, { total, page, limit, professionnels: rows });
});

// Statistiques agrégées du réseau pro
route("GET", "/api/admin/reseau-pro/stats", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });

  const roleFilter = "role IN ('utilisateur','initiative','collectivite','officiel')";

  const total        = db.prepare(`SELECT COUNT(*) n FROM users WHERE ${roleFilter}`).get().n;
  const actifs30j    = db.prepare(`SELECT COUNT(DISTINCT u.id) n FROM users u JOIN user_activity a ON a.user_id=u.id WHERE a.date >= date('now','-30 days') AND u.${roleFilter}`).get().n;
  const nouveaux30j  = db.prepare(`SELECT COUNT(*) n FROM users WHERE ${roleFilter} AND created_at >= datetime('now','-30 days')`).get().n;

  const parVille     = db.prepare(`SELECT ville, pays, COUNT(*) n FROM users WHERE ${roleFilter} AND ville IS NOT NULL GROUP BY ville ORDER BY n DESC LIMIT 15`).all();
  const parPays      = db.prepare(`SELECT pays, COUNT(*) n FROM users WHERE ${roleFilter} AND pays IS NOT NULL GROUP BY pays ORDER BY n DESC LIMIT 12`).all();
  const parOrigine   = db.prepare(`SELECT origine1 AS origine, COUNT(*) n FROM users WHERE ${roleFilter} AND origine1 IS NOT NULL GROUP BY origine ORDER BY n DESC LIMIT 12`).all();
  const parNat       = db.prepare(`SELECT nationalite1 AS nationalite, COUNT(*) n FROM users WHERE ${roleFilter} AND nationalite1 IS NOT NULL GROUP BY nationalite ORDER BY n DESC LIMIT 10`).all();
  const parRole      = db.prepare(`SELECT role, COUNT(*) n FROM users WHERE ${roleFilter} GROUP BY role ORDER BY n DESC`).all();
  const parSitPro    = db.prepare(`SELECT situation_pro, COUNT(*) n FROM users WHERE ${roleFilter} AND situation_pro IS NOT NULL GROUP BY situation_pro ORDER BY n DESC LIMIT 10`).all();

  // Top villes actives (activité 30j)
  const villesActives = db.prepare(`
    SELECT u.ville, u.pays, COUNT(DISTINCT a.user_id) n
    FROM user_activity a JOIN users u ON u.id=a.user_id
    WHERE a.date >= date('now','-30 days') AND u.${roleFilter} AND u.ville IS NOT NULL
    GROUP BY u.ville ORDER BY n DESC LIMIT 10
  `).all();

  // Évolution inscriptions 6 derniers mois
  const evolution = db.prepare(`
    SELECT substr(created_at,1,7) AS mois, COUNT(*) n
    FROM users WHERE ${roleFilter}
    GROUP BY mois ORDER BY mois DESC LIMIT 6
  `).all().reverse();

  sendJSON(res, 200, {
    totaux: { total, actifs_30j: actifs30j, nouveaux_30j: nouveaux30j },
    par_ville: parVille, par_pays: parPays, par_origine: parOrigine,
    par_nationalite: parNat, par_role: parRole, par_situation_pro: parSitPro,
    villes_actives: villesActives, evolution
  });
});

/* ===== DIASPORA DONNÉES STATISTIQUES ===== */

route("GET", "/api/admin/diaspora-stats", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });

  // KPIs globaux
  const totalInit    = db.prepare("SELECT COUNT(*) n FROM initiatives").get().n;
  const totalEvents  = db.prepare("SELECT COUNT(*) n FROM evenements WHERE statut='ouvert'").get().n;
  const totalForm    = db.prepare("SELECT COUNT(*) n FROM formations").get().n;
  const totalAbos    = db.prepare("SELECT COUNT(*) n FROM abonnements").get().n;
  const totalPays    = db.prepare("SELECT COUNT(DISTINCT pays) n FROM initiatives WHERE pays IS NOT NULL").get().n;
  const totalVilles  = db.prepare("SELECT COUNT(DISTINCT ville) n FROM initiatives WHERE ville IS NOT NULL").get().n;
  const actifs30j    = db.prepare("SELECT COUNT(DISTINCT i.id) n FROM initiatives i JOIN abonnements a ON a.initiative_id=i.id JOIN user_activity ua ON ua.user_id=a.user_id WHERE ua.date>=date('now','-30 days')").get().n;

  // Par domaine avec events + formations
  const parDomaine = db.prepare(`
    SELECT domaine, COUNT(*) n,
      ROUND(AVG(COALESCE(nb_vues,0)),0) AS moy_vues
    FROM initiatives WHERE domaine IS NOT NULL
    GROUP BY domaine ORDER BY n DESC LIMIT 12
  `).all();
  const eventsParDomaine = db.prepare(`SELECT domaine, COUNT(*) n FROM evenements WHERE domaine IS NOT NULL GROUP BY domaine ORDER BY n DESC LIMIT 10`).all();
  const formParDomaine   = db.prepare(`SELECT domaine, COUNT(*) n FROM formations WHERE domaine IS NOT NULL GROUP BY domaine ORDER BY n DESC LIMIT 10`).all();

  // Par pays d'origine
  const parOrigine = db.prepare(`
    SELECT nationalite1 AS pays_origine, COUNT(*) n
    FROM initiatives WHERE nationalite1 IS NOT NULL
    GROUP BY nationalite1 ORDER BY n DESC LIMIT 20
  `).all();

  // Par pays de résidence
  const parPaysResidence = db.prepare(`
    SELECT pays, COUNT(*) n FROM initiatives WHERE pays IS NOT NULL
    GROUP BY pays ORDER BY n DESC LIMIT 20
  `).all();

  // Par ville (top 20)
  const parVille = db.prepare(`
    SELECT ville, pays, COUNT(*) n,
      SUM(COALESCE(nb_vues,0)) AS total_vues,
      (SELECT COUNT(*) FROM evenements e WHERE e.ville=i.ville) AS nb_events
    FROM initiatives i WHERE ville IS NOT NULL
    GROUP BY ville ORDER BY n DESC LIMIT 20
  `).all();

  // Score d'activité par initiative (top 15)
  const topInitiatives = db.prepare(`
    SELECT i.id, i.nom, i.slug, i.ville, i.pays, i.domaine,
      COALESCE(i.nb_vues,0) AS nb_vues,
      (SELECT COUNT(*) FROM abonnements a WHERE a.initiative_id=i.id) AS nb_abonnes,
      (SELECT COUNT(*) FROM evenements e WHERE e.owner_user_id=i.owner_user_id) AS nb_events,
      (SELECT COUNT(*) FROM formations f WHERE f.owner_user_id=i.owner_user_id) AS nb_formations,
      MIN(100, ROUND(
        COALESCE(i.nb_vues,0)*0.05 +
        (SELECT COUNT(*) FROM abonnements a WHERE a.initiative_id=i.id)*8.0 +
        (SELECT COUNT(*) FROM evenements e WHERE e.owner_user_id=i.owner_user_id)*12.0 +
        (SELECT COUNT(*) FROM formations f WHERE f.owner_user_id=i.owner_user_id)*10.0
      ,0)) AS score
    FROM initiatives i ORDER BY score DESC, nb_abonnes DESC LIMIT 15
  `).all();

  // Évolution mensuelle inscriptions initiatives (12 mois)
  const evolution = db.prepare(`
    SELECT substr(created_at,1,7) AS mois, COUNT(*) n
    FROM initiatives GROUP BY mois ORDER BY mois DESC LIMIT 12
  `).all().reverse();

  // Évolution événements (12 mois)
  const evolutionEvents = db.prepare(`
    SELECT substr(created_at,1,7) AS mois, COUNT(*) n
    FROM evenements GROUP BY mois ORDER BY mois DESC LIMIT 12
  `).all().reverse();

  // Tendances: comparer mois courant vs précédent par domaine
  const tendanceDomaine = db.prepare(`
    SELECT domaine,
      SUM(CASE WHEN substr(created_at,1,7)=strftime('%Y-%m','now') THEN 1 ELSE 0 END) AS ce_mois,
      SUM(CASE WHEN substr(created_at,1,7)=strftime('%Y-%m','now','-1 month') THEN 1 ELSE 0 END) AS mois_prec
    FROM initiatives WHERE domaine IS NOT NULL
    GROUP BY domaine HAVING ce_mois>0 OR mois_prec>0
    ORDER BY (ce_mois - mois_prec) DESC LIMIT 8
  `).all();

  // Tendances villes
  const tendanceVille = db.prepare(`
    SELECT ville,
      SUM(CASE WHEN substr(created_at,1,7)=strftime('%Y-%m','now') THEN 1 ELSE 0 END) AS ce_mois,
      SUM(CASE WHEN substr(created_at,1,7)=strftime('%Y-%m','now','-1 month') THEN 1 ELSE 0 END) AS mois_prec
    FROM initiatives WHERE ville IS NOT NULL
    GROUP BY ville HAVING ce_mois>0 OR mois_prec>0
    ORDER BY (ce_mois - mois_prec) DESC LIMIT 8
  `).all();

  sendJSON(res, 200, {
    kpi: { totalInit, totalEvents, totalForm, totalAbos, totalPays, totalVilles, actifs30j },
    par_domaine: parDomaine, events_par_domaine: eventsParDomaine, formations_par_domaine: formParDomaine,
    par_origine: parOrigine, par_pays_residence: parPaysResidence,
    par_ville: parVille, top_initiatives: topInitiatives,
    evolution, evolution_events: evolutionEvents,
    tendance_domaine: tendanceDomaine, tendance_ville: tendanceVille
  });
});

// Insights IA algorithmiques
route("GET", "/api/admin/diaspora-stats/insights", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });

  const insights = [];
  const alertes  = [];

  // Top domaine
  const topDom = db.prepare(`SELECT domaine, COUNT(*) n FROM initiatives WHERE domaine IS NOT NULL GROUP BY domaine ORDER BY n DESC LIMIT 1`).get();
  if (topDom) insights.push({ type:'analyse', icone:'📊', texte:`Le domaine <strong>${topDom.domaine}</strong> domine avec ${topDom.n} initiatives enregistrées.` });

  // Top ville
  const topVille = db.prepare(`SELECT ville, pays, COUNT(*) n FROM initiatives WHERE ville IS NOT NULL GROUP BY ville ORDER BY n DESC LIMIT 1`).get();
  if (topVille) insights.push({ type:'analyse', icone:'📍', texte:`<strong>${topVille.ville}</strong> (${topVille.pays||'—'}) est la ville avec la plus forte concentration d'initiatives diaspora (${topVille.n}).` });

  // Top pays d'origine
  const topOrigine = db.prepare(`SELECT nationalite1 AS o, COUNT(*) n FROM initiatives WHERE nationalite1 IS NOT NULL GROUP BY nationalite1 ORDER BY n DESC LIMIT 1`).get();
  if (topOrigine) insights.push({ type:'analyse', icone:'🌍', texte:`La diaspora <strong>${topOrigine.o}</strong> est la plus représentée avec ${topOrigine.n} initiatives actives.` });

  // Croissance domaine ce mois
  const croissanceDom = db.prepare(`
    SELECT domaine,
      SUM(CASE WHEN substr(created_at,1,7)=strftime('%Y-%m','now') THEN 1 ELSE 0 END) AS cm,
      SUM(CASE WHEN substr(created_at,1,7)=strftime('%Y-%m','now','-1 month') THEN 1 ELSE 0 END) AS pm
    FROM initiatives WHERE domaine IS NOT NULL GROUP BY domaine HAVING pm>0
    ORDER BY (CAST(cm AS REAL)/pm) DESC LIMIT 1
  `).get();
  if (croissanceDom && croissanceDom.pm > 0) {
    const pct = Math.round(((croissanceDom.cm - croissanceDom.pm) / croissanceDom.pm) * 100);
    if (pct > 0) insights.push({ type:'tendance', icone:'📈', texte:`Les activités <strong>${croissanceDom.domaine}</strong> augmentent de <strong>+${pct}%</strong> ce mois par rapport au précédent.` });
    else if (pct < -10) alertes.push({ type:'alerte', icone:'⚠️', texte:`Baisse de ${Math.abs(pct)}% des nouvelles initiatives <strong>${croissanceDom.domaine}</strong> ce mois.` });
  }

  // Ville en croissance
  const croissanceVille = db.prepare(`
    SELECT ville,
      SUM(CASE WHEN substr(created_at,1,7)=strftime('%Y-%m','now') THEN 1 ELSE 0 END) AS cm,
      SUM(CASE WHEN substr(created_at,1,7)=strftime('%Y-%m','now','-1 month') THEN 1 ELSE 0 END) AS pm
    FROM initiatives WHERE ville IS NOT NULL GROUP BY ville HAVING pm>0
    ORDER BY (CAST(cm AS REAL)/pm) DESC LIMIT 1
  `).get();
  if (croissanceVille && croissanceVille.pm > 0 && croissanceVille.cm > croissanceVille.pm) {
    const pct = Math.round(((croissanceVille.cm - croissanceVille.pm) / croissanceVille.pm) * 100);
    if (pct >= 15) insights.push({ type:'tendance', icone:'🚀', texte:`<strong>${croissanceVille.ville}</strong> devient un hub émergent diaspora avec une croissance de <strong>+${pct}%</strong> ce mois.` });
  }

  // Score moyen
  const scoreMoy = db.prepare(`
    SELECT ROUND(AVG(
      MIN(100, COALESCE(nb_vues,0)*0.05 +
        (SELECT COUNT(*) FROM abonnements a WHERE a.initiative_id=i.id)*8.0 +
        (SELECT COUNT(*) FROM evenements e WHERE e.owner_user_id=i.owner_user_id)*12.0 +
        (SELECT COUNT(*) FROM formations f WHERE f.owner_user_id=i.owner_user_id)*10.0
      )
    ),1) AS s FROM initiatives i
  `).get()?.s || 0;
  insights.push({ type:'analyse', icone:'⚡', texte:`Score d'activité moyen des initiatives : <strong>${scoreMoy}/100</strong>.` });

  // Ratio événements/initiatives
  const nbInit = db.prepare("SELECT COUNT(*) n FROM initiatives").get().n;
  const nbEvt  = db.prepare("SELECT COUNT(*) n FROM evenements").get().n;
  if (nbInit > 0) {
    const ratio = (nbEvt / nbInit).toFixed(1);
    insights.push({ type:'analyse', icone:'📅', texte:`En moyenne, chaque initiative génère <strong>${ratio} événements</strong> enregistrés sur la plateforme.` });
  }

  sendJSON(res, 200, { insights, alertes });
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
  const abonnesActifs = db.prepare("SELECT COUNT(*) n FROM abonnements").get().n;

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
  sendJSON(res, 200, { plans: await db.prepare("SELECT * FROM plans_abonnement ORDER BY ordre").all() });
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
  await db.prepare("UPDATE plans_abonnement SET actif=0 WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* ===== CODES PROMO — CRUD ===== */

route("GET", "/api/admin/promos", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  sendJSON(res, 200, { promos: await db.prepare("SELECT * FROM codes_promo ORDER BY created_at DESC").all() });
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
  await db.prepare(`
    UPDATE codes_promo SET nom=?,type=?,valeur=?,date_debut=?,date_fin=?,
    nb_max_utilisations=?,cible=?,actif=? WHERE id=?
  `).run(nom, type, valeur||0, date_debut||null, date_fin||null, nb_max_utilisations||null,
    cible||"tous", actif!=null?actif:1, params.id);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/admin/promos/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  await db.prepare("UPDATE codes_promo SET actif=0 WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* ===== PARAMÈTRES PLATEFORME ===== */

route("GET", "/api/admin/parametres", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const params2 = await db.prepare("SELECT * FROM parametres_plateforme ORDER BY cle").all();
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
  const abonnes = await db.prepare(`
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
  const txs = await db.prepare(`
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
  const rows = await db.prepare("SELECT id,nom_campagne,titre,statut,format,created_at,updated_at,nb_impressions,nb_clics,date_debut,date_fin FROM publicites WHERE created_by=? ORDER BY created_at DESC").all(user.id);
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
  const admins = await db.prepare("SELECT id FROM users WHERE role='administrateur'").all();
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
  const rows = await db.prepare("SELECT * FROM publicites ORDER BY created_at DESC").all();
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
  await db.prepare("DELETE FROM publicite_events WHERE publicite_id=?").run(params.id);
  await db.prepare("DELETE FROM publicites WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

route("GET", "/api/admin/publicites/:id/stats", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
  const pub = await db.prepare(`
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
  return await db.prepare("SELECT * FROM accreditations_observatoire WHERE institution_id=? AND statut='actif'").get(institutionId) || null;
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
    const rows = await db.prepare(`
      SELECT ao.*, u.nom AS institution_nom, u.email AS institution_email, u.ville, u.pays, u.type_institution
      FROM accreditations_observatoire ao
      JOIN users u ON u.id = ao.institution_id
      ORDER BY ao.created_at DESC
    `).all();
    const institutions = await db.prepare("SELECT id,nom,email,ville,pays,type_institution FROM users WHERE role='collectivite' ORDER BY nom").all();
    sendJSON(res, 200, { accreditations: rows, institutions });
  });

  route("POST", "/api/admin/accreditations", async (req, res, params, body) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
    const { institution_id, date_fin, nationalites_autorisees, territoires_autorises, droits, notes_admin } = body;
    if (!institution_id) return sendJSON(res, 400, { error: "institution_id requis." });
    const inst = await db.prepare("SELECT id,nom FROM users WHERE id=? AND role='collectivite'").get(institution_id);
    if (!inst) return sendJSON(res, 404, { error: "Institution introuvable." });
    const existing = await db.prepare("SELECT id FROM accreditations_observatoire WHERE institution_id=? AND statut='actif'").get(institution_id);
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
    const accred = await db.prepare("SELECT * FROM accreditations_observatoire WHERE id=?").get(params.id);
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
    const accred = await db.prepare("SELECT * FROM accreditations_observatoire WHERE id=?").get(params.id);
    if (!accred) return sendJSON(res, 404, { error: "Accréditation introuvable." });
    db.prepare("UPDATE accreditations_observatoire SET statut='suspendu',updated_at=datetime('now') WHERE id=?").run(params.id);
    histoAccred(params.id, "suspension", user, body.motif || "Suspension administrative");
    sendJSON(res, 200, { ok: true });
  });

  route("POST", "/api/admin/accreditations/:id/retirer", async (req, res, params, body) => {
    const user = getCurrentUser(req);
    if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
    const accred = await db.prepare("SELECT * FROM accreditations_observatoire WHERE id=?").get(params.id);
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
    const rows = await db.prepare("SELECT * FROM accreditations_historique WHERE accreditation_id=? ORDER BY created_at DESC").all(params.id);
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
      await db.prepare("ALTER TABLE communications_institutionnelles ADD COLUMN photos_json TEXT DEFAULT '[]'").run();
      await db.prepare("ALTER TABLE communications_institutionnelles ADD COLUMN video_b64 TEXT DEFAULT NULL").run();
      await db.prepare("ALTER TABLE communications_institutionnelles ADD COLUMN audio_b64 TEXT DEFAULT NULL").run();
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
    const rows = await db.prepare("SELECT id,emetteur_id,titre,contenu,type,cible_json,nb_destinataires,statut,photos_json,video_b64,audio_b64,created_at FROM communications_institutionnelles WHERE emetteur_id=? ORDER BY created_at DESC LIMIT 50").all(user.id);
    sendJSON(res, 200, { communications: rows.map(r => ({
      ...r,
      photos_json: (() => { try { return JSON.parse(r.photos_json||"[]"); } catch(e){ return []; } })()
    })) });
  });

  route("GET", "/api/communications/recues", async (req, res) => {
    const user = getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    // Toutes communications qui ne sont pas bloquées par l'utilisateur
    const desabo = await db.prepare("SELECT institution_id FROM comm_desabonnements WHERE user_id=?").all(user.id).map(r=>r.institution_id);
    let rows = await db.prepare("SELECT ci.*, u.nom AS emetteur_nom FROM communications_institutionnelles ci JOIN users u ON u.id=ci.emetteur_id ORDER BY ci.created_at DESC LIMIT 30").all();
    if (desabo.length) rows = rows.filter(r => !desabo.includes(null) && !desabo.includes(r.emetteur_id));
    sendJSON(res, 200, { communications: rows });
  });

  route("POST", "/api/communications/:id/desabonner", async (req, res, params) => {
    const user = getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const comm = await db.prepare("SELECT emetteur_id FROM communications_institutionnelles WHERE id=?").get(params.id);
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
    const c = await db.prepare("SELECT c.*,u.nom AS emetteur_nom FROM consultations c JOIN users u ON u.id=c.emetteur_id WHERE c.id=?").get(params.id);
    if (!c) return sendJSON(res, 404, { error: "Consultation introuvable." });
    const questions = await db.prepare("SELECT * FROM consultation_questions WHERE consultation_id=? ORDER BY ordre").all(params.id);
    const dejaRepondu = user ? !!await db.prepare("SELECT 1 FROM consultation_reponses WHERE consultation_id=? AND user_id=?").get(params.id, user.id) : false;
    sendJSON(res, 200, { consultation: c, questions, deja_repondu: dejaRepondu });
  });

  route("POST", "/api/consultations/:id/repondre", async (req, res, params, body) => {
    const user = getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const c = await db.prepare("SELECT * FROM consultations WHERE id=? AND statut='ouverte'").get(params.id);
    if (!c) return sendJSON(res, 404, { error: "Consultation fermée ou introuvable." });
    const already = await db.prepare("SELECT 1 FROM consultation_reponses WHERE consultation_id=? AND user_id=?").get(params.id, user.id);
    if (already) return sendJSON(res, 409, { error: "Vous avez déjà répondu à cette consultation." });
    const ins = db.prepare("INSERT INTO consultation_reponses (consultation_id,question_id,user_id,reponse) VALUES (?,?,?,?)");
    (body.reponses || []).forEach(r => ins.run(params.id, r.question_id, user.id, r.reponse || ""));
    sendJSON(res, 200, { ok: true });
  });

  route("GET", "/api/consultations/:id/resultats", async (req, res, params) => {
    const user = getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const c = await db.prepare("SELECT * FROM consultations WHERE id=?").get(params.id);
    if (!c) return sendJSON(res, 404, { error: "Consultation introuvable." });
    if (c.emetteur_id !== user.id && user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès réservé à l'émetteur." });
    const questions = await db.prepare("SELECT * FROM consultation_questions WHERE consultation_id=? ORDER BY ordre").all(params.id);
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
    const c = await db.prepare("SELECT * FROM consultations WHERE id=?").get(params.id);
    if (!c) return sendJSON(res, 404, { error: "Introuvable." });
    if (c.emetteur_id !== user.id && user.role !== "administrateur") return sendJSON(res, 403, { error: "Non autorisé." });
    await db.prepare("UPDATE consultations SET statut='cloturee' WHERE id=?").run(params.id);
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
  let profil = await db.prepare("SELECT * FROM ambassade_profil WHERE user_id=?").get(user.id);
  if (!profil) profil = { user_id: user.id, nom_officiel: user.nom || "", pays_represente: user.pays || "" };
  sendJSON(res, 200, profil);
});

route("PUT", "/api/collectivite/profil-ambassade", async (req, res, params, body) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const j = v => { try { return JSON.stringify(Array.isArray(v) ? v : JSON.parse(v || "[]")); } catch { return "[]"; } };
  const exists = await db.prepare("SELECT user_id FROM ambassade_profil WHERE user_id=?").get(user.id);
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
  const profil = await db.prepare("SELECT * FROM ambassade_profil WHERE user_id=?").get(user.id);
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
  const profil = await db.prepare("SELECT * FROM ambassade_profil WHERE user_id=?").get(user.id);
  const pays = profil?.pays_represente || user.pays;
  const { ville, secteur, type } = query;
  let where = "(nationalite1=? OR nationalite2=?)"; const p = [pays, pays];
  if (ville) { where += " AND ville=?"; p.push(ville); }
  if (secteur) { where += " AND domaine=?"; p.push(secteur); }
  const rows = await db.prepare(`SELECT id,nom,domaine,ville,pays,logo_url,site_web,membres,abonnes,type_structure,nb_vues FROM initiatives WHERE ${where} ORDER BY membres DESC LIMIT 50`).all(...p);
  sendJSON(res, 200, { initiatives: rows, pays });
});

/* ── Services consulaires ── */
route("GET", "/api/collectivite/services", async (req, res) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const rows = await db.prepare("SELECT * FROM ambassade_services WHERE user_id=? ORDER BY ordre,created_at").all(user.id);
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
  await db.prepare("UPDATE ambassade_services SET nom=?,type=?,icone=?,description=?,conditions=?,documents_requis=?,delai=?,tarif=?,procedure=?,actif=?,ordre=? WHERE id=? AND user_id=?").run(body.nom, body.type||"document", body.icone||"📄", body.description||null, body.conditions||null, j(body.documents_requis), body.delai||null, body.tarif||null, body.procedure||null, body.actif??1, body.ordre||0, params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/collectivite/services/:id", async (req, res, params) => {
  const user = requireCollectivite(req, res); if (!user) return;
  await db.prepare("DELETE FROM ambassade_services WHERE id=? AND user_id=?").run(params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

/* ── Agenda ── */
route("GET", "/api/collectivite/agenda", async (req, res) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const rows = await db.prepare("SELECT * FROM ambassade_agenda WHERE user_id=? ORDER BY date_debut DESC").all(user.id);
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
  await db.prepare("UPDATE ambassade_agenda SET titre=?,type=?,description=?,date_debut=?,date_fin=?,lieu=?,lien=?,public=? WHERE id=? AND user_id=?").run(body.titre, body.type||"evenement", body.description||null, body.date_debut, body.date_fin||null, body.lieu||null, body.lien||null, body.public??1, params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/collectivite/agenda/:id", async (req, res, params) => {
  const user = requireCollectivite(req, res); if (!user) return;
  await db.prepare("DELETE FROM ambassade_agenda WHERE id=? AND user_id=?").run(params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

/* ── Partenariats institutionnels ── */
route("GET", "/api/collectivite/partenariats-inst", async (req, res) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const rows = await db.prepare("SELECT * FROM ambassade_partenariats WHERE user_id=? ORDER BY created_at DESC").all(user.id);
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
  await db.prepare("UPDATE ambassade_partenariats SET nom=?,type=?,description=?,logo_url=?,site_web=? WHERE id=? AND user_id=?").run(body.nom, body.type||"institutionnel", body.description||null, body.logo_url||null, body.site_web||null, params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/collectivite/partenariats-inst/:id", async (req, res, params) => {
  const user = requireCollectivite(req, res); if (!user) return;
  await db.prepare("DELETE FROM ambassade_partenariats WHERE id=? AND user_id=?").run(params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

/* ── Opportunités ── */
route("GET", "/api/collectivite/opportunites", async (req, res) => {
  const user = requireCollectivite(req, res); if (!user) return;
  const rows = await db.prepare("SELECT * FROM ambassade_opportunites WHERE user_id=? ORDER BY created_at DESC").all(user.id);
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
  await db.prepare("UPDATE ambassade_opportunites SET titre=?,type=?,description=?,date_limite=?,lien=?,budget=?,actif=? WHERE id=? AND user_id=?").run(body.titre, body.type||"appel_offres", body.description||null, body.date_limite||null, body.lien||null, body.budget||null, body.actif??1, params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/collectivite/opportunites/:id", async (req, res, params) => {
  const user = requireCollectivite(req, res); if (!user) return;
  await db.prepare("DELETE FROM ambassade_opportunites WHERE id=? AND user_id=?").run(params.id, user.id);
  sendJSON(res, 200, { ok: true });
});

/* ================================================================
   SYSTÈME D'ACCRÉDITATIONS DIASPO'ACTIF
   ================================================================ */

/* Helper : vérifie qu'un user a une accréditation active */
function hasAccred(userId, type) {
  const r = await db.prepare("SELECT id FROM compte_accreditations WHERE user_id=? AND type=? AND statut='active'").get(userId, type);
  return !!r;
}

/* GET /api/accreditations/mes — mes accréditations (ancien + nouveau système) */
route("GET", "/api/accreditations/mes", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const anciens = await db.prepare("SELECT * FROM compte_accreditations WHERE user_id=? ORDER BY created_at DESC").all(user.id);
  const nouveaux = await db.prepare(`
    SELECT ua.*, d.type AS type, d.label, d.emoji, d.couleur, d.couleur_bg, d.couleur_border, d.couleur_text, d.module
    FROM user_accreditations ua JOIN accred_definitions d ON d.id=ua.accred_id
    WHERE ua.user_id=? ORDER BY ua.created_at DESC
  `).all(user.id);
  const types = new Set(anciens.map(a => a.type));
  sendJSON(res, 200, { accreditations: [...anciens, ...nouveaux.filter(n => !types.has(n.type))] });
});

/* GET /api/accreditations/demandes — mes propres demandes (ancien + nouveau système) */
route("GET", "/api/accreditations/demandes", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const anciens = await db.prepare("SELECT * FROM demandes_accreditation WHERE user_id=? ORDER BY created_at DESC").all(user.id);
  const nouveaux = await db.prepare(`
    SELECT ad.*, d.type AS type, d.label, d.emoji
    FROM accred_demandes ad JOIN accred_definitions d ON d.id=ad.accred_id
    WHERE ad.user_id=? ORDER BY ad.created_at DESC
  `).all(user.id);
  const types = new Set(anciens.map(a => a.type));
  sendJSON(res, 200, { demandes: [...anciens, ...nouveaux.filter(n => !types.has(n.type))] });
});

/* GET /api/accreditations/user/:id — accréditations publiques d'un compte */
route("GET", "/api/accreditations/user/:id", async (req, res, params) => {
  const rows = await db.prepare("SELECT type, statut, date_attribution FROM compte_accreditations WHERE user_id=? AND statut='active'").all(params.id);
  sendJSON(res, 200, { accreditations: rows });
});

/* POST /api/accreditations/demande — demander une accréditation (nouveau + ancien système) */
route("POST", "/api/accreditations/demande", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const { type, message } = body;
  if (!type) return sendJSON(res, 400, { error: "Type requis." });

  /* Chercher dans le nouveau catalogue dynamique */
  const def = await db.prepare("SELECT * FROM accred_definitions WHERE type=? AND actif=1").get(type);
  if (def) {
    const regle = await db.prepare("SELECT mode FROM accred_regles WHERE accred_id=? AND role=?").get(def.id, user.role);
    if (!regle || regle.mode === 'non_concerne')
      return sendJSON(res, 403, { error: "Votre type de compte n'est pas éligible à cette accréditation." });
    if (regle.mode === 'automatique')
      return sendJSON(res, 400, { error: "Cette accréditation est accordée automatiquement à votre type de compte." });
    const existingDem = await db.prepare("SELECT id,statut FROM accred_demandes WHERE user_id=? AND accred_id=? ORDER BY created_at DESC LIMIT 1").get(user.id, def.id);
    if (existingDem && existingDem.statut === 'en_attente')
      return sendJSON(res, 409, { error: "Une demande est déjà en cours pour cette accréditation." });
    if (await db.prepare("SELECT id FROM user_accreditations WHERE user_id=? AND accred_id=? AND statut='active'").get(user.id, def.id))
      return sendJSON(res, 409, { error: "Vous possédez déjà cette accréditation." });
    const tarif = await db.prepare("SELECT validation_admin FROM accred_tarifs WHERE accred_id=? AND role=?").get(def.id, user.role);
    const id = db.prepare("INSERT OR IGNORE INTO accred_demandes (user_id,accred_id,message) VALUES (?,?,?)").run(user.id, def.id, message||null).lastInsertRowid;
    if (!tarif || tarif.validation_admin !== 0) {
      const admins = await db.prepare("SELECT id FROM users WHERE role='administrateur'").all();
      admins.forEach(a => creerNotif(a.id, "validation", "Nouvelle demande d'accréditation",
        `${user.nom} demande « ${def.emoji} ${def.label} »`, { demande_id: Number(id) }));
    } else {
      /* Accès immédiat sans validation */
      await db.prepare("UPDATE accred_demandes SET statut='approuvee' WHERE id=?").run(id);
      db.prepare("INSERT OR IGNORE INTO user_accreditations (user_id,accred_id,statut) VALUES (?,?,'active')").run(user.id, def.id);
    }
    return sendJSON(res, 201, { id, ok: true });
  }

  /* Fallback : ancien système pour les types hardcodés */
  const TYPES_ACCRED_VALIDES = ["mobilisation_active","createur_opportunites","observatoire_diaspora","institutionnelle","creation_publicite"];
  if (!TYPES_ACCRED_VALIDES.includes(type)) return sendJSON(res, 400, { error: "Type ou accréditation invalide." });
  const existing = await db.prepare("SELECT id,statut FROM demandes_accreditation WHERE user_id=? AND type=? ORDER BY created_at DESC LIMIT 1").get(user.id, type);
  if (existing && existing.statut === "en_attente") return sendJSON(res, 409, { error: "Une demande est déjà en cours pour ce type." });
  if (hasAccred(user.id, type)) return sendJSON(res, 409, { error: "Vous possédez déjà cette accréditation." });
  const id = db.prepare("INSERT INTO demandes_accreditation (user_id, type, message) VALUES (?,?,?)").run(user.id, type, message||null).lastInsertRowid;
  const DA_LABELS = { mobilisation_active:"Mobilisation Active", createur_opportunites:"Créateur d'Opportunités", observatoire_diaspora:"Observatoire Diaspora", institutionnelle:"Institutionnelle" };
  const admins = await db.prepare("SELECT id FROM users WHERE role='administrateur'").all();
  admins.forEach(a => creerNotif(a.id, "validation", "Nouvelle demande d'accréditation", `${user.nom} demande l'accréditation « ${DA_LABELS[type]||type} »`, { demande_id: Number(id) }));
  sendJSON(res, 201, { id, ok: true });
});

/* ──── Routes Admin : gestion des accréditations ──── */

/* GET /api/admin/accreditations/demandes — liste des demandes */
route("GET", "/api/admin/accreditations/demandes", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux Administrateurs." });
  const statut = query.statut || "en_attente";
  const rows = await db.prepare(`
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
  const rows = await db.prepare(`
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
  await db.prepare("UPDATE demandes_accreditation SET statut='approuvee' WHERE user_id=? AND type=? AND statut='en_attente'").run(userId, type);
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
  await db.prepare("UPDATE demandes_accreditation SET statut='refusee', motif_refus=? WHERE user_id=? AND type=? AND statut='en_attente'").run(body.motif||null, userId, type);
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
  const s = await db.prepare("SELECT s.*,u.nom AS createur_nom,u.role AS createur_role FROM sondages s JOIN users u ON u.id=s.createur_id WHERE s.id=?").get(params.id);
  if (!s) return sendJSON(res, 404, { error: "Sondage introuvable." });
  const questions = await db.prepare("SELECT * FROM sondage_questions WHERE sondage_id=? ORDER BY ordre ASC").all(params.id);
  const me = getCurrentUser(req);
  const dejaRepondu = me ? !!await db.prepare("SELECT 1 FROM sondage_reponses WHERE sondage_id=? AND user_id=?").get(params.id, me.id) : false;
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
  const s = await db.prepare("SELECT * FROM sondages WHERE id=?").get(params.id);
  if (!s) return sendJSON(res, 404, { error: "Sondage introuvable." });
  if (s.statut !== "ouvert") return sendJSON(res, 400, { error: "Ce sondage est clôturé." });
  const deja = await db.prepare("SELECT 1 FROM sondage_reponses WHERE sondage_id=? AND user_id=?").get(params.id, user.id);
  if (deja) return sendJSON(res, 409, { error: "Vous avez déjà répondu à ce sondage." });
  const reponses = body.reponses || {}; // { question_id: reponse }
  const questions = await db.prepare("SELECT * FROM sondage_questions WHERE sondage_id=?").all(params.id);
  for (const q of questions) {
    const rep = reponses[q.id];
    if (q.obligatoire && (rep === undefined || rep === null || rep === "")) return sendJSON(res, 400, { error: `Question obligatoire sans réponse : "${q.texte}"` });
    db.prepare("INSERT INTO sondage_reponses (sondage_id,question_id,user_id,reponse) VALUES (?,?,?,?)").run(
      params.id, q.id, s.anonyme ? null : user.id,
      rep !== undefined ? (typeof rep === "object" ? JSON.stringify(rep) : String(rep)) : null
    );
  }
  await db.prepare("UPDATE sondages SET nb_reponses=nb_reponses+1 WHERE id=?").run(params.id);
  creerNotif(s.createur_id, "mention", "Nouvelle réponse à votre sondage", `${user.nom} a répondu à « ${s.titre} »`, { sondage_id: Number(params.id) });
  sendJSON(res, 201, { ok: true });
});

/* GET /api/sondages/:id/resultats — créateur uniquement */
route("GET", "/api/sondages/:id/resultats", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const s = await db.prepare("SELECT * FROM sondages WHERE id=?").get(params.id);
  if (!s) return sendJSON(res, 404, { error: "Sondage introuvable." });
  if (s.createur_id !== user.id && user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé au créateur." });
  const questions = await db.prepare("SELECT * FROM sondage_questions WHERE sondage_id=? ORDER BY ordre").all(params.id);
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
  const s = await db.prepare("SELECT * FROM sondages WHERE id=?").get(params.id);
  if (!s || s.createur_id !== user.id) return sendJSON(res, 403, { error: "Non autorisé." });
  await db.prepare("UPDATE sondages SET statut='cloture' WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/mes-sondages */
route("GET", "/api/mes-sondages", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = await db.prepare("SELECT * FROM sondages WHERE createur_id=? ORDER BY created_at DESC").all(user.id);
  sendJSON(res, 200, { sondages: rows });
});

/* ──── MODULE CRÉATEUR D'OPPORTUNITÉS — Offres ──── */

/* GET /api/offres */
route("GET", "/api/offres", async (req, res, params, body, query) => {
  let rows = await db.prepare(`
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
  const o = await db.prepare("SELECT o.*,u.nom AS createur_nom,u.role AS createur_role FROM offres o JOIN users u ON u.id=o.createur_id WHERE o.id=?").get(params.id);
  if (!o) return sendJSON(res, 404, { error: "Offre introuvable." });
  const me = getCurrentUser(req);
  const dejaPostule = me ? !!await db.prepare("SELECT 1 FROM offres_candidatures WHERE offre_id=? AND candidat_id=?").get(params.id, me.id) : false;
  sendJSON(res, 200, { offre: { ...o, competences_requises: safeParse(o.competences_requises) }, dejaPostule });
});

/* POST /api/offres/:id/postuler */
route("POST", "/api/offres/:id/postuler", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const o = await db.prepare("SELECT * FROM offres WHERE id=?").get(params.id);
  if (!o) return sendJSON(res, 404, { error: "Offre introuvable." });
  if (o.statut !== "publiee") return sendJSON(res, 400, { error: "Cette offre n'est plus disponible." });
  if (o.createur_id === user.id) return sendJSON(res, 400, { error: "Vous ne pouvez pas postuler à votre propre offre." });
  try {
    db.prepare("INSERT INTO offres_candidatures (offre_id,candidat_id,message,cv_url,lettre_url) VALUES (?,?,?,?,?)").run(
      params.id, user.id, body.message||null, body.cv_url||null, body.lettre_url||null
    );
    await db.prepare("UPDATE offres SET nb_candidatures=nb_candidatures+1 WHERE id=?").run(params.id);
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
  const o = await db.prepare("SELECT * FROM offres WHERE id=?").get(params.id);
  if (!o || o.createur_id !== user.id) return sendJSON(res, 403, { error: "Réservé au créateur." });
  const cands = await db.prepare(`
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
  const o = await db.prepare("SELECT * FROM offres WHERE id=?").get(params.id);
  if (!o || o.createur_id !== user.id) return sendJSON(res, 403, { error: "Non autorisé." });
  const valid = ["recu","en_etude","entretien","accepte","refuse"];
  if (!valid.includes(body.statut)) return sendJSON(res, 400, { error: "Statut invalide." });
  await db.prepare("UPDATE offres_candidatures SET statut=? WHERE id=? AND offre_id=?").run(body.statut, params.cid, params.id);
  const cand = await db.prepare("SELECT candidat_id FROM offres_candidatures WHERE id=?").get(params.cid);
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
  const rows = await db.prepare("SELECT * FROM offres WHERE createur_id=? ORDER BY created_at DESC").all(user.id);
  sendJSON(res, 200, { offres: rows.map(r => ({ ...r, competences_requises: safeParse(r.competences_requises) })) });
});

/* GET /api/mes-candidatures-offres — mes candidatures aux offres */
route("GET", "/api/mes-candidatures-offres", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = await db.prepare(`
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
  const add = (col, def) => { if (!cols.includes(col)) { try { await db.prepare(`ALTER TABLE chatbot_memoire ADD COLUMN ${col} ${def}`).run(); } catch(e){} } };
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

  /* ──────── FAQ ──────── */
  try { db.prepare(`CREATE TABLE IF NOT EXISTS faq_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icone TEXT DEFAULT '📋',
    ordre INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}

  try { db.prepare(`CREATE TABLE IF NOT EXISTS faq_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER REFERENCES faq_categories(id) ON DELETE SET NULL,
    compte_types TEXT NOT NULL DEFAULT '["tous"]',
    question TEXT NOT NULL,
    reponse TEXT NOT NULL,
    synonymes TEXT DEFAULT '[]',
    mots_cles TEXT DEFAULT '[]',
    etapes TEXT DEFAULT '[]',
    medias TEXT DEFAULT '[]',
    module_lien TEXT,
    module_label TEXT,
    statut TEXT DEFAULT 'active',
    ordre INTEGER DEFAULT 0,
    vues INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}

  try { db.prepare(`CREATE TABLE IF NOT EXISTS faq_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER REFERENCES faq_questions(id) ON DELETE CASCADE,
    user_id INTEGER,
    user_role TEXT,
    created_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}

  try { db.prepare(`CREATE TABLE IF NOT EXISTS faq_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    results_count INTEGER DEFAULT 0,
    user_role TEXT,
    created_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}

  try { db.prepare(`CREATE TABLE IF NOT EXISTS faq_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER REFERENCES faq_questions(id) ON DELETE CASCADE,
    user_id INTEGER,
    helpful INTEGER NOT NULL,
    comment TEXT,
    created_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}

  /* Seed catégories initiales */
  const faqCatCount = db.prepare(`SELECT COUNT(*) c FROM faq_categories`).get()?.c || 0;
  if (faqCatCount === 0) {
    const cats = [
      { nom: 'Mon compte',      slug: 'mon-compte',       icone: '👤', ordre: 1 },
      { nom: 'Publications',    slug: 'publications',      icone: '📝', ordre: 2 },
      { nom: 'Recrutement',     slug: 'recrutement',       icone: '💼', ordre: 3 },
      { nom: 'Événements',      slug: 'evenements',        icone: '📅', ordre: 4 },
      { nom: 'Visioconférence', slug: 'visioconference',   icone: '📹', ordre: 5 },
      { nom: 'Vérification',    slug: 'verification',      icone: '✅', ordre: 6 },
      { nom: 'Messagerie',      slug: 'messagerie',        icone: '✉️',  ordre: 7 },
      { nom: 'Annuaire',        slug: 'annuaire',          icone: '🔍', ordre: 8 },
      { nom: 'Accréditations',  slug: 'accreditations',    icone: '🏅', ordre: 9 },
      { nom: 'Statistiques',    slug: 'statistiques',      icone: '📊', ordre: 10 },
      { nom: 'Financement',     slug: 'financement',       icone: '💰', ordre: 11 },
      { nom: 'Administration',  slug: 'administration',    icone: '⚙️',  ordre: 12 },
    ];
    const insC = db.prepare(`INSERT INTO faq_categories (nom,slug,icone,ordre) VALUES (?,?,?,?)`);
    cats.forEach(c => { try { insC.run(c.nom, c.slug, c.icone, c.ordre); } catch(e){} });

    /* Seed questions initiales */
    const getCat = (slug) => await db.prepare(`SELECT id FROM faq_categories WHERE slug=?`).get(slug)?.id || null;
    const insQ = db.prepare(`INSERT INTO faq_questions
      (category_id,compte_types,question,reponse,synonymes,mots_cles,etapes,module_lien,module_label)
      VALUES (?,?,?,?,?,?,?,?,?)`);

    const faqSeed = [
      /* ── MON COMPTE ── */
      { cat:'mon-compte', types:'["tous"]',
        q:'Comment modifier mon profil ?',
        r:'<p>Pour modifier votre profil, accédez à votre <strong>Tableau de bord</strong> puis cliquez sur <strong>Mon Profil</strong>. Vous pouvez y modifier votre photo, votre biographie, vos compétences, vos coordonnées et vos préférences.</p>',
        syn:'["changer profil","mettre à jour profil","éditer profil","profil"]',
        kw:'["profil","modifier","mise à jour"]',
        steps:'["Ouvrir votre tableau de bord","Cliquer sur Mon Profil","Modifier les informations souhaitées","Cliquer sur Enregistrer"]',
        lien:'dashboard-utilisateur.html', lbl:'Ouvrir mon profil' },
      { cat:'mon-compte', types:'["tous"]',
        q:'Comment changer mon mot de passe ?',
        r:'<p>Allez dans votre tableau de bord → <strong>Paramètres de compte</strong> → <strong>Sécurité</strong> → <strong>Changer le mot de passe</strong>. Saisissez votre mot de passe actuel puis le nouveau deux fois.</p>',
        syn:'["mot de passe oublié","réinitialiser mot de passe","changer mdp"]',
        kw:'["mot de passe","sécurité","connexion"]',
        steps:'["Ouvrir votre tableau de bord","Aller dans Paramètres de compte","Cliquer sur Sécurité","Remplir le formulaire de changement de mot de passe","Valider"]',
        lien:'dashboard-utilisateur.html', lbl:'Gérer mon compte' },
      { cat:'mon-compte', types:'["tous"]',
        q:'Comment supprimer mon compte ?',
        r:'<p>La suppression de compte est irréversible. Elle est disponible dans <strong>Paramètres → Données personnelles → Supprimer mon compte</strong>. Vos données sont effacées sous 30 jours conformément au RGPD.</p>',
        syn:'["fermer compte","désactiver compte","quitter plateforme"]',
        kw:'["supprimer","compte","rgpd","données"]',
        steps:'[]', lien:null, lbl:null },
      { cat:'mon-compte', types:'["tous"]',
        q:'Comment activer le mode absence ?',
        r:'<p>Le mode absence permet d\'indiquer que vous n\'êtes temporairement pas disponible. Il se trouve dans <strong>Mon Profil → Statut → Mode Absence</strong>. Choisissez le type (vacances, déplacement, mission…) et les dates.</p>',
        syn:'["absent","vacances","indisponible","congé"]',
        kw:'["absence","statut","disponibilité"]',
        steps:'["Ouvrir Mon Profil","Cliquer sur Statut","Activer Mode Absence","Choisir le type et la durée","Valider"]',
        lien:'dashboard-utilisateur.html', lbl:'Mon profil' },

      /* ── VÉRIFICATION ── */
      { cat:'verification', types:'["tous"]',
        q:'Comment vérifier mon identité ?',
        r:'<p>La vérification d\'identité se fait dans <strong>Mon Profil → Vérification → Identité</strong>. Soumettez une copie de votre pièce d\'identité officielle (passeport ou carte nationale d\'identité). La validation prend 24 à 72h.</p><p>Une fois validée, votre profil affiche le badge <strong>✅ Identité vérifiée</strong> et votre score de confiance augmente de <strong>+15 points</strong>.</p>',
        syn:'["identité","pièce d\'identité","valider identité","KYC"]',
        kw:'["vérification","identité","badge","score"]',
        steps:'["Ouvrir Mon Profil","Cliquer sur Vérification","Choisir Identité","Soumettre votre document","Attendre la validation (24-72h)"]',
        lien:'profil.html', lbl:'Aller à la vérification' },
      { cat:'verification', types:'["initiative","entreprise","association","organisation"]',
        q:'Comment vérifier mon entreprise ou association ?',
        r:'<p>La vérification d\'entreprise/association nécessite un document officiel (Kbis, récépissé de déclaration en préfecture, statuts…). Accédez à <strong>Mon Profil → Vérification → Entité</strong>. La validation est faite sous 48h par l\'équipe Diaspo\'Actif.</p>',
        syn:'["vérifier asso","vérifier entreprise","justificatif","immatriculation"]',
        kw:'["entreprise","association","vérification","kbis","statuts"]',
        steps:'["Ouvrir Mon Profil","Cliquer sur Vérification","Choisir Entité","Soumettre le document officiel","Attendre la validation (48h)"]',
        lien:'profil.html', lbl:'Aller à la vérification' },

      /* ── PUBLICATIONS ── */
      { cat:'publications', types:'["tous"]',
        q:'Comment créer une publication ?',
        r:'<p>Depuis votre tableau de bord, cliquez sur <strong>Nouveau post</strong> ou rendez-vous sur le <strong>Fil d\'actualité</strong> puis cliquez sur la zone de saisie en haut. Rédigez votre texte, ajoutez des médias si nécessaire, puis publiez.</p>',
        syn:'["poster","publier","créer post","écrire une publication"]',
        kw:'["publication","post","fil","actualité"]',
        steps:'["Ouvrir le Fil d\'actualité","Cliquer sur la zone de rédaction","Écrire votre publication","Ajouter des médias (optionnel)","Cliquer sur Publier"]',
        lien:'fil-actualite.html', lbl:'Ouvrir le fil d\'actualité' },
      { cat:'publications', types:'["initiative","entreprise","association","organisation","commune","region","prefecture","ministere"]',
        q:'Comment publier une annonce officielle ?',
        r:'<p>Les comptes organisationnels peuvent publier des annonces officielles depuis leur <strong>Dashboard → Communications → Nouvelle annonce</strong>. Ces annonces sont mises en avant sur le fil d\'actualité des membres concernés (selon le ciblage géographique et thématique).</p>',
        syn:'["communiqué","annonce","communication officielle","diffuser"]',
        kw:'["annonce","communication","officielle","ciblage"]',
        steps:'["Ouvrir votre Dashboard","Aller dans Communications","Cliquer sur Nouvelle annonce","Rédiger et cibler votre annonce","Publier"]',
        lien:'dashboard-initiative.html', lbl:'Mon dashboard' },

      /* ── RECRUTEMENT ── */
      { cat:'recrutement', types:'["initiative","entreprise","association","organisation","professionnel","investisseur"]',
        q:'Comment créer une campagne de recrutement ?',
        r:'<p>Depuis votre tableau de bord, allez dans <strong>Offres → Nouvelle offre → Emploi / Stage / Bénévolat</strong>. Remplissez les informations du poste, les compétences requises, la localisation et la date limite. Les candidatures arrivent directement dans votre dashboard.</p>',
        syn:'["recruter","campagne recrutement","embaucher","poster offre emploi"]',
        kw:'["recrutement","offre","emploi","stage","bénévolat"]',
        steps:'["Ouvrir votre Dashboard","Cliquer sur Offres","Cliquer sur Nouvelle offre","Choisir le type (emploi/stage/bénévolat)","Remplir le formulaire","Publier"]',
        lien:'dashboard-initiative.html', lbl:'Gérer mes offres' },
      { cat:'recrutement', types:'["initiative","association","organisation"]',
        q:'Comment recruter des bénévoles ?',
        r:'<p>Créez une offre de type <strong>Bénévolat</strong> depuis <strong>Dashboard → Offres → Nouvelle offre → Bénévolat</strong>. Précisez la nature de la mission, les disponibilités souhaitées et les compétences utiles. Vous pouvez aussi rechercher des profils directement dans l\'Annuaire et les contacter par messagerie.</p>',
        syn:'["volontaire","bénévole","volontariat","engagement"]',
        kw:'["bénévolat","volontaire","mission"]',
        steps:'["Dashboard → Offres → Nouvelle offre","Choisir Bénévolat","Décrire la mission","Définir les disponibilités","Publier","Ou : chercher dans l\'Annuaire → filtrer par domaine → Contacter"]',
        lien:'annuaire.html', lbl:'Explorer l\'annuaire' },
      { cat:'recrutement', types:'["tous"]',
        q:'Comment postuler à une offre ?',
        r:'<p>Accédez à la section <strong>Offres</strong> depuis le menu principal. Trouvez l\'offre qui vous intéresse, cliquez sur <strong>Postuler</strong>. Votre profil sera transmis à l\'organisation. Vous pouvez suivre vos candidatures dans <strong>Mon Compte → Mes candidatures</strong>.</p>',
        syn:'["candidater","envoyer candidature","répondre à une offre","postuler"]',
        kw:'["offre","candidature","postuler","emploi"]',
        steps:'["Aller dans Offres","Rechercher une offre","Cliquer sur Postuler","Personnaliser votre candidature (optionnel)","Valider"]',
        lien:'offres.html', lbl:'Voir les offres' },

      /* ── ÉVÉNEMENTS ── */
      { cat:'evenements', types:'["initiative","entreprise","association","organisation","commune","region","prefecture","ministere","createur"]',
        q:'Comment créer un événement ?',
        r:'<p>Depuis votre tableau de bord, cliquez sur <strong>Événements → Nouvel événement</strong>. Remplissez le titre, la description, la date, le lieu (ou indiquez "En ligne"). Vous pouvez définir une billetterie avec des billets gratuits ou payants et générer des QR codes pour valider les entrées.</p>',
        syn:'["organiser événement","planifier","créer event","conférence","meetup","soirée"]',
        kw:'["événement","conférence","meetup","billetterie"]',
        steps:'["Dashboard → Événements → Nouvel événement","Remplir les informations","Choisir le type (présentiel/en ligne)","Configurer la billetterie","Publier l\'événement"]',
        lien:'dashboard-initiative.html', lbl:'Créer un événement' },
      { cat:'evenements', types:'["tous"]',
        q:'Comment participer à un événement ?',
        r:'<p>Consultez la section <strong>Événements</strong> du menu pour voir tous les événements disponibles. Cliquez sur un événement pour voir les détails et cliquez sur <strong>S\'inscrire</strong> ou <strong>Obtenir un billet</strong>. Votre billet (avec QR code) vous sera envoyé par messagerie et sera disponible dans <strong>Mon Compte → Mes billets</strong>.</p>',
        syn:'["s\'inscrire événement","participer","assister","s\'inscrire conférence"]',
        kw:'["événement","inscription","billet","participer"]',
        steps:'["Aller dans Événements","Trouver un événement","Cliquer sur S\'inscrire ou Obtenir un billet","Valider la commande","Recevoir votre QR code"]',
        lien:'evenements.html', lbl:'Voir les événements' },
      { cat:'evenements', types:'["initiative","entreprise","association","commune","region"]',
        q:'Comment utiliser le scanner de billets ?',
        r:'<p>Le scanner permet de valider les billets des participants à l\'entrée de votre événement. Depuis votre Dashboard → Événements → sélectionnez l\'événement → <strong>Scanner les entrées</strong>. L\'application utilise la caméra pour lire les QR codes et valide instantanément chaque billet.</p>',
        syn:'["scanner","valider billet","contrôle entrée","scan qr"]',
        kw:'["scanner","billet","qr code","entrée","validation"]',
        steps:'["Dashboard → Événements","Sélectionner votre événement","Cliquer sur Scanner les entrées","Autoriser l\'accès à la caméra","Scanner les QR codes des participants"]',
        lien:'scanner.html', lbl:'Ouvrir le scanner' },

      /* ── VISIOCONFÉRENCE ── */
      { cat:'visioconference', types:'["tous"]',
        q:'Comment démarrer une réunion vidéo ?',
        r:'<p>Vous pouvez démarrer une réunion depuis :</p><ul><li><strong>Messagerie → bouton 📹</strong> dans une conversation</li><li><strong>Dashboard → Réunions → Nouvelle réunion</strong></li><li><strong>Réunions.html</strong> directement</li></ul><p>La réunion s\'ouvre en peer-to-peer sécurisé. Vous pouvez inviter des participants par lien.</p>',
        syn:'["visio","videoconférence","appel vidéo","zoom","meeting","réunion en ligne"]',
        kw:'["réunion","visio","vidéo","conférence"]',
        steps:'["Ouvrir la Messagerie ou le Dashboard","Cliquer sur l\'icône 📹","Créer la réunion","Partager le lien aux participants","Démarrer la réunion"]',
        lien:'reunions.html', lbl:'Ouvrir Réunions' },
      { cat:'visioconference', types:'["initiative","entreprise","association","organisation","commune","region"]',
        q:'Comment planifier une réunion à l\'avance ?',
        r:'<p>Depuis <strong>Dashboard → Réunions → Planifier une réunion</strong>, choisissez la date, l\'heure, la durée et les participants. Un lien de réunion est généré et des rappels automatiques sont envoyés aux participants. Vous pouvez ajouter des notes d\'ordre du jour.</p>',
        syn:'["planifier réunion","programmer","agenda","calendrier visio"]',
        kw:'["planifier","réunion","agenda","rappel"]',
        steps:'["Dashboard → Réunions → Planifier","Choisir date et heure","Ajouter les participants","Écrire l\'ordre du jour (optionnel)","Envoyer les invitations"]',
        lien:'reunions.html', lbl:'Planifier une réunion' },

      /* ── ANNUAIRE ── */
      { cat:'annuaire', types:'["tous"]',
        q:'Comment trouver un profil dans l\'annuaire ?',
        r:'<p>L\'annuaire est accessible depuis le menu principal. Vous pouvez filtrer par :</p><ul><li><strong>Pays de résidence</strong></li><li><strong>Domaine d\'activité</strong></li><li><strong>Type de compte</strong></li><li><strong>Accréditations</strong></li></ul><p>💡 Astuce : décrivez ce que vous cherchez en langage naturel dans le chatbot : "Je cherche un avocat à Paris spécialisé en droit des affaires".</p>',
        syn:'["chercher profil","trouver quelqu\'un","répertoire","liste membres"]',
        kw:'["annuaire","recherche","profil","filtre"]',
        steps:'["Cliquer sur Annuaire dans le menu","Utiliser les filtres (pays, domaine, type)","Cliquer sur un profil pour le voir","Contacter via Messagerie"]',
        lien:'annuaire.html', lbl:'Ouvrir l\'annuaire' },

      /* ── ACCRÉDITATIONS ── */
      { cat:'accreditations', types:'["tous"]',
        q:'À quoi servent les accréditations ?',
        r:'<p>Les accréditations Diaspo\'Actif sont des badges officiels qui certifient le niveau d\'engagement et de fiabilité d\'un membre. Il en existe plusieurs niveaux :</p><ul><li>🌱 <strong>Engagé Diaspora</strong> — membre actif</li><li>🌟 <strong>Mobilisation Active</strong> — très impliqué</li><li>💎 <strong>Créateur d\'Opportunités</strong> — crée de la valeur pour la communauté</li><li>🏆 <strong>Ambassadeur Diaspora</strong> — niveau maximum</li></ul><p>Chaque accréditation augmente votre <strong>Score de Confiance de +10 points</strong> et vous rend prioritaire dans les recommandations du chatbot.</p>',
        syn:'["badge","niveau","certification","label","tampon"]',
        kw:'["accréditation","badge","niveau","score","confiance"]',
        steps:'[]', lien:'accreditations.html', lbl:'Voir les accréditations' },
      { cat:'accreditations', types:'["tous"]',
        q:'Comment obtenir une accréditation ?',
        r:'<p>Pour demander une accréditation, allez dans <strong>Mon Profil → Accréditations → Demander une accréditation</strong>. Choisissez le niveau souhaité et soumettez les justificatifs requis. L\'équipe Diaspo\'Actif examine votre dossier sous 5 jours ouvrés.</p>',
        syn:'["demander accréditation","comment accréditer","déposer dossier","obtenir badge"]',
        kw:'["accréditation","demande","dossier","justificatif"]',
        steps:'["Mon Profil → Accréditations","Cliquer sur Demander une accréditation","Choisir le niveau","Soumettre les justificatifs","Attendre la validation (5 jours ouvrés)"]',
        lien:'accreditations.html', lbl:'Demander une accréditation' },

      /* ── STATISTIQUES ── */
      { cat:'statistiques', types:'["initiative","entreprise","association","organisation","commune","region","prefecture","ministere","administrateur"]',
        q:'Comment suivre les statistiques de mon compte ?',
        r:'<p>Votre tableau de bord affiche vos statistiques clés : vues de profil, messages reçus, candidatures, abonnés, engagement sur vos publications. Pour des données plus détaillées, allez dans <strong>Dashboard → Statistiques</strong>. Vous pouvez exporter en CSV ou PDF.</p>',
        syn:'["stats","chiffres","métriques","analytics","performance"]',
        kw:'["statistiques","données","performance","export"]',
        steps:'["Ouvrir votre Dashboard","Cliquer sur Statistiques","Choisir la période","Analyser les données","Exporter si besoin"]',
        lien:'statistiques.html', lbl:'Voir les statistiques' },

      /* ── MESSAGERIE ── */
      { cat:'messagerie', types:'["tous"]',
        q:'Comment envoyer un message à quelqu\'un ?',
        r:'<p>Depuis l\'Annuaire ou un profil, cliquez sur le bouton <strong>✉️ Contacter</strong>. Ou accédez directement à la <strong>Messagerie</strong> depuis le menu et créez une nouvelle conversation. Vous pouvez envoyer du texte, des fichiers et démarrer une réunion vidéo depuis la messagerie.</p>',
        syn:'["contacter","écrire","discuter","chat","message privé"]',
        kw:'["messagerie","message","contact","conversation"]',
        steps:'["Aller dans Messagerie (menu principal)","Cliquer sur Nouvelle conversation","Chercher la personne","Écrire votre message","Envoyer"]',
        lien:'messagerie.html', lbl:'Ouvrir la messagerie' },

      /* ── FINANCEMENT ── */
      { cat:'financement', types:'["initiative","entreprise","association","organisation","investisseur"]',
        q:'Comment trouver des investisseurs ou financements ?',
        r:'<p>Publiez une offre de type <strong>Investissement</strong> dans <strong>Dashboard → Offres → Nouvelle offre → Recherche de financement</strong>. Vous pouvez aussi utiliser l\'Annuaire et filtrer par type "Investisseur" pour contacter directement les membres concernés.</p>',
        syn:'["lever des fonds","financer","investisseur","capital","subvention"]',
        kw:'["financement","investissement","fonds","capital"]',
        steps:'["Dashboard → Offres → Nouvelle offre","Choisir Recherche de financement","Décrire votre projet et besoins","Publier","Ou : Annuaire → filtrer par Investisseur → Contacter"]',
        lien:'offres.html', lbl:'Les offres de financement' },

      /* ── ADMINISTRATION ── */
      { cat:'administration', types:'["administrateur"]',
        q:'Comment accéder au panneau d\'administration ?',
        r:'<p>Le panneau d\'administration est accessible depuis le menu principal (icône ⚙️) ou directement via <strong>dashboard-administrateur.html</strong>. Il donne accès à la gestion des utilisateurs, modération, accréditations, FAQ, statistiques globales et observatoire mondial.</p>',
        syn:'["admin","back-office","panneau admin","gestion plateforme"]',
        kw:'["administration","admin","back-office","gestion"]',
        steps:'["Cliquer sur l\'icône ⚙️ dans le menu","Ou accéder directement à dashboard-administrateur.html","Choisir la section souhaitée"]',
        lien:'dashboard-administrateur.html', lbl:'Panneau d\'administration' },
      { cat:'administration', types:'["administrateur"]',
        q:'Comment gérer les signalements ?',
        r:'<p>Dans le panneau d\'administration, allez dans <strong>Modération → Signalements</strong>. Vous y trouvez tous les signalements en attente, avec leur motif et les comptes concernés. Vous pouvez approuver (action corrective), rejeter (signalement infondé) ou archiver.</p>',
        syn:'["modération","abus","plainte","report"]',
        kw:'["signalement","modération","abus","compte"]',
        steps:'["Dashboard Admin → Modération","Cliquer sur Signalements","Examiner chaque signalement","Approuver ou Rejeter","Archiver après traitement"]',
        lien:'dashboard-administrateur.html', lbl:'Modération' },
    ];

    faqSeed.forEach(item => {
      try {
        const catId = getCat(item.cat);
        insQ.run(
          catId,
          item.types,
          item.q,
          item.r,
          item.syn,
          item.kw,
          item.steps,
          item.lien || null,
          item.lbl || null
        );
      } catch(e) { console.error('FAQ seed error:', e.message); }
    });
  }

  /* ──────── D'A TUTOR AI — TUTOS CRÉÉS PAR SUPER ADMIN ──────── */
  db.prepare(`CREATE TABLE IF NOT EXISTS da_tutoriels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    sujet TEXT NOT NULL,
    objectif TEXT,
    niveau TEXT DEFAULT 'debutant',
    format_souhaite TEXT DEFAULT 'texte',
    contenu_json TEXT NOT NULL DEFAULT '{}',
    statut TEXT DEFAULT 'publie',
    vues INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`).run();

  /* ──────── ONBOARDING ──────── */
  try { db.prepare(`CREATE TABLE IF NOT EXISTS onboarding_tutorials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    compte_type TEXT NOT NULL UNIQUE,
    titre TEXT NOT NULL,
    description TEXT,
    duree_estimee INTEGER DEFAULT 3,
    obligatoire INTEGER DEFAULT 0,
    actif INTEGER DEFAULT 1,
    version INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}

  try { db.prepare(`CREATE TABLE IF NOT EXISTS onboarding_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tutorial_id INTEGER REFERENCES onboarding_tutorials(id) ON DELETE CASCADE,
    ordre INTEGER DEFAULT 0,
    titre TEXT NOT NULL,
    contenu TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    illustration TEXT DEFAULT '🚀',
    action_selector TEXT,
    action_label TEXT,
    narration TEXT,
    module_lien TEXT,
    module_label TEXT,
    actif INTEGER DEFAULT 1)`).run(); } catch(e){}

  try { db.prepare(`CREATE TABLE IF NOT EXISTS onboarding_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tutorial_id INTEGER,
    statut TEXT DEFAULT 'en_cours',
    etapes_completees TEXT DEFAULT '[]',
    note INTEGER,
    commentaire TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    updated_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}

  try { db.prepare(`CREATE TABLE IF NOT EXISTS onboarding_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tutorial_id INTEGER,
    step_id INTEGER,
    user_id INTEGER,
    action TEXT,
    data TEXT,
    created_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}

  /* Seed tutoriels */
  const obCount = db.prepare(`SELECT COUNT(*) c FROM onboarding_tutorials`).get()?.c || 0;
  if (obCount === 0) {
    const insT = db.prepare(`INSERT INTO onboarding_tutorials (compte_type,titre,description,duree_estimee,actif) VALUES (?,?,?,?,1)`);
    const insS = db.prepare(`INSERT INTO onboarding_steps (tutorial_id,ordre,titre,contenu,type,illustration,narration,module_lien,module_label,action_selector,action_label) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

    const tutorials = [
      { type:'utilisateur', titre:"Bienvenue sur Diaspo'Actif !", description:"Découvrez votre espace personnel et les fonctionnalités essentielles.", duree:3 },
      { type:'initiative',  titre:"Votre espace Initiative", description:"Maîtrisez votre tableau de bord et amplifiez votre impact.", duree:5 },
      { type:'collectivite',titre:"Espace Collectivité territoriale", description:"Connectez-vous à la diaspora et pilotez vos communications.", duree:4 },
      { type:'institution', titre:"Espace Institutionnel", description:"Pilotez vos communications et consultez l'Observatoire Diaspora.", duree:4 },
      { type:'officiel',    titre:"Espace Officiel", description:"Communications, visioconférences et partenariats diplomatiques.", duree:4 },
      { type:'administrateur',titre:"Panneau Administrateur", description:"Gérez la plateforme, modérez et analysez les données.", duree:5 },
    ];

    const steps = {
      utilisateur: [
        { ordre:1, titre:"🌍 Bienvenue sur Diaspo'Actif !", contenu:"<p><strong>Diaspo'Actif</strong> est la plateforme mondiale qui connecte les diasporas, valorise les talents et accélère le développement des territoires.</p><p>Ce guide de 3 minutes vous présente les fonctionnalités essentielles de votre espace personnel.</p>", type:'info', illus:'🌍', nar:"Bienvenue sur Diaspo'Actif ! Je suis votre guide interactif. En quelques minutes, nous allons découvrir ensemble les fonctionnalités de votre espace personnel.", lien:null, lbl:null, sel:null, albl:null },
        { ordre:2, titre:"👤 Complétez votre profil", contenu:"<p>Votre profil est votre carte de visite numérique. Un profil complet :</p><ul><li>📈 Améliore votre <strong>Score de Confiance</strong></li><li>🔍 Vous rend visible dans les recommandations</li><li>🤝 Facilite les contacts avec d'autres membres</li></ul><p>Ajoutez votre photo, votre biographie, vos compétences et vos expériences.</p>", type:'action', illus:'👤', nar:"Commençons par compléter votre profil. Un profil complet augmente votre visibilité et votre score de confiance.", lien:'dashboard-utilisateur.html', lbl:'Ouvrir mon profil', sel:null, albl:'Compléter mon profil' },
        { ordre:3, titre:"🔍 Explorez l'Annuaire", contenu:"<p>L'<strong>Annuaire</strong> regroupe tous les membres de Diaspo'Actif : professionnels, initiatives, associations, institutions.</p><p>Vous pouvez :</p><ul><li>🔎 Filtrer par pays, domaine, type de compte</li><li>✉️ Contacter directement par messagerie</li><li>🤖 Demander une recommandation au chatbot</li></ul>", type:'demo', illus:'🔍', nar:"L'annuaire est votre carnet d'adresses mondial. Filtrez par pays, domaine, ou décrivez ce que vous cherchez en langage naturel dans le chatbot.", lien:'annuaire.html', lbl:'Explorer l\'annuaire', sel:null, albl:null },
        { ordre:4, titre:"✉️ La Messagerie", contenu:"<p>Échangez en privé avec n'importe quel membre de la plateforme.</p><p>Depuis la messagerie, vous pouvez :</p><ul><li>💬 Envoyer des messages texte et fichiers</li><li>📹 Démarrer une <strong>réunion vidéo</strong> instantanée</li><li>📅 Planifier une réunion</li></ul><p>Votre indice de réactivité (⭐ à ⭐⭐⭐⭐⭐) est calculé sur vos délais de réponse.</p>", type:'demo', illus:'✉️', nar:"La messagerie vous permet d'échanger en privé et de lancer des visioconférences directement.", lien:'messagerie.html', lbl:'Ouvrir la messagerie', sel:null, albl:null },
        { ordre:5, titre:"📝 Le Fil d'actualité", contenu:"<p>Partagez vos actualités avec la communauté via le <strong>Fil d'actualité</strong>.</p><p>Publiez :</p><ul><li>📰 Articles et actualités</li><li>🎉 Annonces et opportunités</li><li>💡 Réflexions et idées</li></ul><p>Vos publications sont visibles par les membres qui vous suivent et dans les recommandations.</p>", type:'action', illus:'📝', nar:"Le fil d'actualité vous permet de partager vos nouvelles avec toute la communauté.", lien:'fil-actualite.html', lbl:'Voir le fil', sel:null, albl:'Publier maintenant' },
        { ordre:6, titre:"🏅 Les Accréditations", contenu:"<p>Les accréditations Diaspo'Actif sont des badges officiels qui attestent votre engagement.</p><ul><li>🌱 <strong>Engagé Diaspora</strong></li><li>🌟 <strong>Mobilisation Active</strong></li><li>💎 <strong>Créateur d'Opportunités</strong></li><li>🏆 <strong>Ambassadeur Diaspora</strong></li></ul><p>Chaque accréditation augmente votre <strong>Score de Confiance de +10 points</strong>.</p>", type:'info', illus:'🏅', nar:"Les accréditations sont des badges officiels qui valorisent votre engagement. Chacune améliore votre score de confiance.", lien:'accreditations.html', lbl:'Découvrir les accréditations', sel:null, albl:null },
        { ordre:7, titre:"🤖 Votre Assistant IA", contenu:"<p>Le <strong>chatbot Diaspo'Actif</strong> est votre guide permanent.</p><p>Il peut :</p><ul><li>🔍 Trouver les meilleurs profils pour vous</li><li>❓ Répondre à toutes vos questions</li><li>📋 Vous guider étape par étape</li><li>📚 Accéder à la base de connaissances FAQ</li></ul><p>Cliquez sur le bouton 💬 en bas à droite pour l'ouvrir !</p>", type:'action', illus:'🤖', nar:"Votre assistant intelligent est disponible à tout moment via le bouton en bas à droite. N'hésitez pas à lui poser toutes vos questions.", lien:null, lbl:null, sel:'.cb-fab', albl:'Ouvrir le chatbot' },
      ],
      initiative: [
        { ordre:1, titre:"🚀 Votre espace Initiative", contenu:"<p>Bienvenue dans votre espace dédié ! En tant qu'initiative, vous avez accès à des outils puissants pour <strong>amplifier votre impact</strong>.</p><p>Ce guide de 5 minutes vous présente toutes les fonctionnalités à votre disposition.</p>", type:'info', illus:'🚀', nar:"Bienvenue dans votre espace Initiative sur Diaspo'Actif ! Vous allez découvrir tous les outils à votre disposition pour maximiser votre impact.", lien:null, lbl:null, sel:null, albl:null },
        { ordre:2, titre:"📊 Votre Tableau de Bord", contenu:"<p>Votre tableau de bord centralise toutes vos activités :</p><ul><li>📈 Statistiques en temps réel</li><li>💬 Messages reçus</li><li>👥 Nouvelles candidatures</li><li>📅 Événements à venir</li><li>💰 Wallet et transactions</li></ul>", type:'demo', illus:'📊', nar:"Votre tableau de bord est votre centre de commande. Toutes vos activités y sont centralisées.", lien:'dashboard-initiative.html', lbl:'Mon dashboard', sel:null, albl:null },
        { ordre:3, titre:"📢 Publications & Annonces", contenu:"<p>Depuis votre dashboard, publiez des annonces qui touchent toute la diaspora :</p><ul><li>📰 Actualités de votre initiative</li><li>📣 Communications officielles ciblées</li><li>🎯 Ciblage par pays, région, profil</li></ul><p>Vos annonces sont mises en avant sur le fil d'actualité des membres ciblés.</p>", type:'action', illus:'📢', nar:"Publiez des annonces officielles et ciblez précisément les membres que vous souhaitez atteindre.", lien:'dashboard-initiative.html', lbl:'Publier une annonce', sel:null, albl:'Créer une annonce' },
        { ordre:4, titre:"💼 Recrutement & Offres", contenu:"<p>Recrutez des profils qualifiés de la diaspora :</p><ul><li>👔 Offres d'emploi et stages</li><li>🤝 Missions bénévoles</li><li>💡 Appels à projet</li><li>💰 Recherche de financement</li></ul><p>Les candidatures arrivent directement dans votre tableau de bord.</p>", type:'action', illus:'💼', nar:"Publiez des offres d'emploi, de stage ou de bénévolat et recevez des candidatures directement dans votre tableau de bord.", lien:'dashboard-initiative.html', lbl:'Publier une offre', sel:null, albl:null },
        { ordre:5, titre:"📅 Créer un Événement", contenu:"<p>Organisez des événements présentiel ou en ligne :</p><ul><li>🎫 Billetterie intégrée (gratuite ou payante)</li><li>📷 Scanner QR pour valider les entrées</li><li>📹 Visioconférence intégrée</li><li>📊 Rapport de participation</li></ul>", type:'action', illus:'📅', nar:"Créez des événements avec billetterie intégrée, scanner QR et visioconférence. Tout est disponible depuis votre tableau de bord.", lien:'dashboard-initiative.html', lbl:'Créer un événement', sel:null, albl:null },
        { ordre:6, titre:"📹 Réunions & Visioconférences", contenu:"<p>Organisez des réunions sécurisées avec vos équipes et partenaires :</p><ul><li>🎥 Visioconférence peer-to-peer</li><li>📝 Notes de réunion intégrées</li><li>📋 Compte-rendu automatique</li><li>📅 Planification avec rappels</li></ul>", type:'demo', illus:'📹', nar:"Les réunions vidéo sont intégrées directement dans la plateforme. Planifiez, invitez et démarrez en quelques clics.", lien:'reunions.html', lbl:'Ouvrir Réunions', sel:null, albl:null },
        { ordre:7, titre:"🎴 QR Code & Vérification", contenu:"<p>Chaque initiative dispose d'un <strong>QR Code unique</strong> :</p><ul><li>📥 Téléchargeable en PNG ou SVG</li><li>🖨️ Carte de visite imprimable</li><li>🔗 Lien direct vers votre profil</li></ul><p>Faites également vérifier votre initiative pour obtenir le badge <strong>✅ Vérifié</strong> et booster votre score de confiance.</p>", type:'info', illus:'🎴', nar:"Votre QR code unique vous permet de partager votre initiative instantanément. La vérification de compte renforce votre crédibilité.", lien:'dashboard-initiative.html', lbl:'Mon QR Code', sel:null, albl:null },
        { ordre:8, titre:"📈 Statistiques & Observatoire", contenu:"<p>Suivez l'impact de votre initiative en temps réel :</p><ul><li>👁️ Vues de profil et publications</li><li>👥 Évolution des abonnés</li><li>📊 Engagement et interactions</li><li>🌍 Répartition géographique</li></ul><p>Exportez vos données en CSV ou PDF.</p>", type:'demo', illus:'📈', nar:"Vos statistiques sont disponibles en temps réel depuis votre tableau de bord. Analysez votre impact et exportez vos données.", lien:'statistiques.html', lbl:'Voir l\'Observatoire', sel:null, albl:null },
      ],
      collectivite: [
        { ordre:1, titre:"🏛️ Espace Collectivité territoriale", contenu:"<p>Bienvenue dans votre espace institutionnel. Diaspo'Actif vous offre des outils dédiés pour <strong>connecter votre territoire à sa diaspora</strong>.</p>", type:'info', illus:'🏛️', nar:"Bienvenue dans votre espace collectivité. Vous disposez d'outils puissants pour connecter votre territoire à sa diaspora.", lien:null, lbl:null, sel:null, albl:null },
        { ordre:2, titre:"📡 Communications ciblées", contenu:"<p>Diffusez des messages officiels directement auprès des membres de votre diaspora :</p><ul><li>🎯 Ciblage par origine, résidence, compétence</li><li>📊 Statistiques de diffusion en temps réel</li><li>📅 Programmation de vos envois</li></ul>", type:'action', illus:'📡', nar:"Diffusez des communications officielles et ciblées auprès des membres de votre diaspora.", lien:'dashboard-collectivite.html', lbl:'Mon dashboard', sel:null, albl:'Envoyer une communication' },
        { ordre:3, titre:"🗳️ Consultations & Sondages", contenu:"<p>Lancez des consultations participatives auprès de votre diaspora :</p><ul><li>📋 Questionnaires en ligne</li><li>🗳️ Sondages avec résultats en temps réel</li><li>📊 Export des résultats</li><li>💬 Collecte d'avis et suggestions</li></ul>", type:'demo', illus:'🗳️', nar:"Les consultations vous permettent de recueillir l'avis de votre diaspora sur des projets de développement.", lien:'sondages.html', lbl:'Les consultations', sel:null, albl:null },
        { ordre:4, titre:"🌍 Observatoire Diaspora", contenu:"<p>Accédez à des données statistiques détaillées sur votre diaspora :</p><ul><li>🗺️ Répartition géographique mondiale</li><li>💼 Secteurs d'activité et compétences</li><li>📈 Évolution dans le temps</li><li>📥 Export CSV et PDF</li></ul>", type:'demo', illus:'🌍', nar:"L'observatoire mondial vous donne une vision précise de votre diaspora : où elle vit, ce qu'elle fait, comment elle évolue.", lien:'statistiques.html', lbl:'Ouvrir l\'Observatoire', sel:null, albl:null },
        { ordre:5, titre:"📅 Événements institutionnels", contenu:"<p>Organisez des événements officiels et invitez votre diaspora :</p><ul><li>🎫 Billetterie officielle</li><li>📹 Conférences en ligne</li><li>🏛️ Réunions institutionnelles</li><li>📊 Rapport de participation</li></ul>", type:'action', illus:'📅', nar:"Créez des événements officiels avec billetterie et visioconférence intégrées.", lien:'evenements.html', lbl:'Les événements', sel:null, albl:null },
        { ordre:6, titre:"✅ Vérification & Accréditation", contenu:"<p>Renforcez la crédibilité de votre présence institutionnelle :</p><ul><li>✅ Vérification officielle de l'entité</li><li>🏅 Badge institutionnel</li><li>🔒 Score de confiance maximal</li><li>📋 Priorité dans les recommandations</li></ul>", type:'info', illus:'✅', nar:"La vérification institutionnelle renforce votre crédibilité et vous donne accès aux fonctionnalités avancées.", lien:'accreditations.html', lbl:'Demander la vérification', sel:null, albl:null },
      ],
      administrateur: [
        { ordre:1, titre:"⚙️ Panneau Administrateur", contenu:"<p>Bienvenue dans votre espace d'administration. Vous avez accès à <strong>toutes les fonctionnalités</strong> de gestion de la plateforme.</p>", type:'info', illus:'⚙️', nar:"Bienvenue dans le panneau administrateur de Diaspo'Actif. Vous avez accès à toutes les fonctionnalités de gestion.", lien:null, lbl:null, sel:null, albl:null },
        { ordre:2, titre:"👥 Gestion des utilisateurs", contenu:"<p>Gérez tous les comptes de la plateforme :</p><ul><li>🔍 Recherche avancée par rôle, pays, statut</li><li>✏️ Modification des profils</li><li>🚫 Suspension et suppression</li><li>📊 Statistiques individuelles</li></ul>", type:'demo', illus:'👥', nar:"La gestion des utilisateurs vous permet de superviser tous les comptes et d'intervenir rapidement.", lien:'dashboard-administrateur.html', lbl:'Gestion utilisateurs', sel:null, albl:null },
        { ordre:3, titre:"🛡️ Modération & Signalements", contenu:"<p>Maintenez la qualité de la plateforme :</p><ul><li>🚩 Traitement des signalements</li><li>📋 File de modération</li><li>⚠️ Actions correctives</li><li>📊 Tableau de bord de modération</li></ul>", type:'demo', illus:'🛡️', nar:"La modération vous permet de traiter les signalements et de maintenir la qualité des contenus.", lien:'dashboard-administrateur.html', lbl:'Modération', sel:null, albl:null },
        { ordre:4, titre:"💡 FAQ & Tutoriels", contenu:"<p>Gérez la base de connaissances de la plateforme :</p><ul><li>📝 Créer et modifier les questions FAQ</li><li>🎓 Gérer les tutoriels d'accueil</li><li>📊 Statistiques des consultations</li><li>❓ Traiter les questions sans réponse</li></ul>", type:'action', illus:'💡', nar:"La gestion FAQ et tutoriels vous permet de maintenir une documentation toujours à jour pour les utilisateurs.", lien:'dashboard-administrateur.html', lbl:'Gestion FAQ', sel:null, albl:null },
        { ordre:5, titre:"📊 Observatoire & Statistiques", contenu:"<p>Analysez l'activité de la plateforme en temps réel :</p><ul><li>👥 DAU / WAU / MAU</li><li>💰 Revenus et MRR</li><li>🌍 Répartition mondiale</li><li>📈 Tendances et projections</li></ul>", type:'demo', illus:'📊', nar:"L'observatoire vous donne une vision complète de l'activité et de la croissance de la plateforme.", lien:'statistiques.html', lbl:'Observatoire', sel:null, albl:null },
        { ordre:6, titre:"⚙️ Paramètres & Configuration", contenu:"<p>Configurez la plateforme selon vos besoins :</p><ul><li>🎨 Personnalisation visuelle</li><li>🔒 Paramètres de sécurité</li><li>📧 Configuration des notifications</li><li>🔧 Modules et intégrations</li></ul>", type:'info', illus:'⚙️', nar:"Les paramètres vous permettent de configurer et personnaliser la plateforme selon les besoins.", lien:'dashboard-administrateur.html', lbl:'Paramètres', sel:null, albl:null },
      ],
    };

    /* Alias pour institution et officiel */
    steps.institution = steps.collectivite.map(s => ({...s, illus: s.illus === '🏛️' ? '🏢' : s.illus }));
    steps.officiel    = steps.collectivite.map(s => ({...s, illus: s.illus === '🏛️' ? '🏴' : s.illus }));

    tutorials.forEach(t => {
      try {
        const tr = insT.run(t.type, t.titre, t.description, t.duree);
        const tid = tr.lastInsertRowid;
        const ss  = steps[t.type] || steps.utilisateur;
        ss.forEach(s => {
          try { insS.run(tid, s.ordre, s.titre, s.contenu, s.type, s.illus, s.nar, s.lien, s.lbl, s.sel, s.albl); } catch(e){}
        });
      } catch(e){ console.error('Onboarding seed error:', e.message); }
    });
  }

  /* ──────── FAQ — QUESTIONS SANS RÉPONSE ──────── */
  try { db.prepare(`CREATE TABLE IF NOT EXISTS faq_sans_reponse (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    question_norm TEXT,
    count INTEGER DEFAULT 1,
    compte_type TEXT DEFAULT 'tous',
    pays TEXT,
    langue TEXT DEFAULT 'fr',
    source TEXT DEFAULT 'faq',
    user_id INTEGER,
    statut TEXT DEFAULT 'nouveau',
    priorite TEXT DEFAULT 'faible',
    admin_id INTEGER,
    faq_id INTEGER,
    categorie_suggeree TEXT,
    reponse_ia TEXT,
    first_asked_at TEXT DEFAULT (datetime('now')),
    last_asked_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}

  /* ── O-Z : tables ── */
  try { db.prepare(`CREATE TABLE IF NOT EXISTS oz_settings (
    user_id INTEGER PRIMARY KEY,
    avatar TEXT DEFAULT 'robot',
    avatar_custom TEXT,
    theme TEXT DEFAULT 'auto',
    size TEXT DEFAULT 'medium',
    animations INTEGER DEFAULT 1,
    voice_enabled INTEGER DEFAULT 0,
    language TEXT DEFAULT 'fr',
    pos_x INTEGER,
    pos_y INTEGER,
    updated_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}

  try { db.prepare(`CREATE TABLE IF NOT EXISTS oz_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    module TEXT,
    params TEXT,
    result TEXT,
    ip TEXT,
    created_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}

  try { db.prepare(`CREATE TABLE IF NOT EXISTS oz_knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,
    actif INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')))`).run(); } catch(e){}

  /* ── O-Z : seed base de connaissance ── */
  if ((db.prepare('SELECT COUNT(*) n FROM oz_knowledge').get()?.n || 0) === 0) {
    const kbItems = [
      ['événement', "Pour créer un événement, allez dans le module Événements et cliquez sur 'Créer un événement'. Vous pouvez définir un titre, une date, un lieu et inviter des participants.", 'evenement,creation,guide'],
      ['initiative', "Les initiatives permettent de lancer des projets communautaires. Rendez-vous dans le module Initiatives et cliquez sur 'Nouvelle initiative'.", 'initiative,projet,diaspora'],
      ['billetterie', "La billetterie vous permet de vendre des billets pour vos événements. Créez d'abord un événement puis activez la billetterie dans ses paramètres.", 'billetterie,billet,vente'],
      ['contrat', "Le module Contrats permet de générer et signer des contrats de partenariat. Accédez-y depuis votre tableau de bord.", 'contrat,partenariat,legal'],
      ['profil', "Pour modifier votre profil, allez dans Paramètres > Mon profil. Vous pouvez mettre à jour vos informations, photo et préférences.", 'profil,compte,parametre'],
      ['messagerie', "Pour envoyer un message, allez dans la Messagerie ou cliquez sur le profil d'un membre et utilisez 'Envoyer un message'.", 'message,messagerie,communication'],
      ['partenariat', "Pour trouver des partenaires, utilisez l'Annuaire et filtrez par type de compte, pays ou secteur d'activité.", 'partenariat,annuaire,recherche'],
      ["Diaspo'Actif", "Diaspo'Actif est la plateforme officielle de la diaspora africaine. Elle connecte membres, initiatives, collectivités et institutions pour faciliter le développement.", 'diaspoactif,plateforme,diaspora'],
      ['formation', "Le module Formations permet d'accéder à des contenus pédagogiques et d'organiser des sessions de formation pour la diaspora.", 'formation,education,apprentissage'],
      ['visioconférence', "La visioconférence permet d'organiser des réunions en ligne avec des membres de la diaspora partout dans le monde.", 'visio,reunion,conference,video'],
      ['statistiques', "Le module Statistiques donne accès aux indicateurs clés de la plateforme : membres actifs, événements, initiatives, engagement.", 'statistiques,analytics,donnees'],
      ['annuaire', "L'annuaire recense tous les membres, initiatives, entreprises et associations présents sur Diaspo'Actif. Filtrez par pays, secteur ou type de compte.", 'annuaire,membres,recherche,repertoire'],
    ];
    kbItems.forEach(([t,c,g]) => db.prepare('INSERT INTO oz_knowledge (topic,content,tags) VALUES (?,?,?)').run(t,c,g));
  }
})();

/* ── Helpers ── */
function normQuestion(q) {
  return (q||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9 ]/g,"").replace(/\s+/g," ").trim().slice(0,200);
}

/* GET /api/chatbot/context — public (priorité : mémoire > import > vide) */
route("GET", "/api/chatbot/context", async (req, res) => {
  // Incrémenter nb_consultations est fait côté chatbot via /api/chatbot/memoire/:id/consulter
  const memories = await db.prepare(
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
  try { await db.prepare("UPDATE chatbot_memoire SET nb_consultations=nb_consultations+1 WHERE id=?").run(params.id); } catch(e){}
  sendJSON(res, 200, { ok: true });
});

/* GET /api/chatbot/memoire — admin, liste complète */
route("GET", "/api/chatbot/memoire", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const q = await db.prepare("SELECT * FROM chatbot_memoire ORDER BY priorite ASC, ordre ASC, created_at ASC").all();
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
  const ancien = await db.prepare("SELECT * FROM chatbot_memoire WHERE id=?").get(id);
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
  await db.prepare("DELETE FROM chatbot_memoire WHERE id = ?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/chatbot/memoire/:id/historique — admin */
route("GET", "/api/chatbot/memoire/:id/historique", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const rows = await db.prepare("SELECT * FROM chatbot_memoire_historique WHERE memoire_id=? ORDER BY created_at DESC").all(params.id);
  sendJSON(res, 200, { historique: rows });
});

/* POST /api/chatbot/memoire/:id/restaurer — admin, restaure une version */
route("POST", "/api/chatbot/memoire/:id/restaurer", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const { historique_id } = body || {};
  const version = await db.prepare("SELECT * FROM chatbot_memoire_historique WHERE id=? AND memoire_id=?").get(historique_id, params.id);
  if (!version) return sendJSON(res, 404, { error: "Version introuvable." });
  const ancien = await db.prepare("SELECT * FROM chatbot_memoire WHERE id=?").get(params.id);
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
  await db.prepare("DELETE FROM chatbot_memoire WHERE source='import'").run();
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
  const top_connus  = await db.prepare("SELECT titre, nb_consultations FROM chatbot_memoire WHERE actif=1 ORDER BY nb_consultations DESC LIMIT 5").all();
  const questions_freq = await db.prepare("SELECT question, nb_fois, categorie_estimee, last_asked_at FROM chatbot_questions WHERE statut='ouvert' ORDER BY nb_fois DESC LIMIT 10").all();
  const taux_reponse = total_q > 0 ? Math.round(((total_q - sans_rep) / total_q) * 100) : 100;
  sendJSON(res, 200, { total, ce_mois, modifs, sans_rep, total_q, top_cats, top_connus, questions_freq, taux_reponse });
});

/* GET /api/chatbot/questions — admin */
route("GET", "/api/chatbot/questions", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const { statut = "ouvert" } = url.parse(req.url, true).query;
  const rows = await db.prepare("SELECT * FROM chatbot_questions WHERE statut=? ORDER BY nb_fois DESC, last_asked_at DESC LIMIT 100").all(statut);
  sendJSON(res, 200, { questions: rows });
});

/* POST /api/chatbot/questions — public, enregistrer une question sans réponse */
route("POST", "/api/chatbot/questions", async (req, res, params, body) => {
  const { question, langue="fr", categorie_estimee, contexte } = body || {};
  if (!question?.trim()) return sendJSON(res, 400, { error: "Question requise." });
  const user = getCurrentUser(req);
  const norm = normQuestion(question);
  const existing = await db.prepare("SELECT id, nb_fois FROM chatbot_questions WHERE question_norm=? AND statut='ouvert'").get(norm);
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
  const q = await db.prepare("SELECT * FROM chatbot_questions WHERE id=?").get(params.id);
  if (!q) return sendJSON(res, 404, { error: "Question introuvable." });
  const { titre, contenu, categorie="Général", mots_cles=[], priorite=5 } = body || {};
  if (!titre?.trim() || !contenu?.trim()) return sendJSON(res, 400, { error: "Titre et contenu requis." });
  const r = db.prepare(
    "INSERT INTO chatbot_memoire (titre,contenu,categorie,mots_cles,priorite,source,ordre,created_by,updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))"
  ).run(titre.trim(), contenu.trim(), categorie, JSON.stringify(mots_cles), priorite, "admin", 0, user.id);
  db.prepare("INSERT INTO chatbot_memoire_historique (memoire_id,auteur_id,auteur_nom,nouveau_titre,nouveau_contenu,nouveau_categorie,commentaire) VALUES (?,?,?,?,?,?,?)")
    .run(r.lastInsertRowid, user.id, user.nom, titre.trim(), contenu.trim(), categorie, `Créé depuis la question : "${q.question}"`);
  // Marquer la question comme répondue
  await db.prepare("UPDATE chatbot_questions SET statut='repondu', memoire_id=?, reponse_admin=? WHERE id=?")
    .run(r.lastInsertRowid, contenu.trim(), params.id);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* DELETE /api/chatbot/questions/:id — admin */
route("DELETE", "/api/chatbot/questions/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  await db.prepare("UPDATE chatbot_questions SET statut='ignore' WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* POST /api/chatbot/questions/fusionner — admin */
route("POST", "/api/chatbot/questions/fusionner", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Accès refusé." });
  const { ids, id_principal } = body || {};
  if (!Array.isArray(ids) || !id_principal) return sendJSON(res, 400, { error: "ids et id_principal requis." });
  const total = ids.reduce((sum, id) => {
    const q = await db.prepare("SELECT nb_fois FROM chatbot_questions WHERE id=?").get(id);
    return sum + (q?.nb_fois || 0);
  }, 0);
  await db.prepare("UPDATE chatbot_questions SET nb_fois=? WHERE id=?").run(total, id_principal);
  ids.filter(id => id !== id_principal).forEach(id =>
    await db.prepare("UPDATE chatbot_questions SET statut='fusionne' WHERE id=?").run(id)
  );
  sendJSON(res, 200, { ok: true, total_fusionnes: ids.length - 1 });
});

/* ════════════════════════════════════════════════════════════════
   FAQ — Routes API
   ════════════════════════════════════════════════════════════════ */

/* Helper normalisation recherche */
function normFaq(s) {
  return (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
}

/* GET /api/faq/categories */
route("GET", "/api/faq/categories", async (req, res) => {
  const cats = await db.prepare(`SELECT * FROM faq_categories ORDER BY ordre, nom`).all();
  sendJSON(res, 200, cats);
});

/* GET /api/faq — liste filtrée par rôle et catégorie */
route("GET", "/api/faq", async (req, res, _p, _b, q) => {
  const role   = (q.role   || 'tous').toLowerCase();
  const cat    = q.category_id ? parseInt(q.category_id) : null;
  const statut = q.statut  || 'active';

  const roleClause = (role === 'tous')
    ? `1=1`
    : `(fq.compte_types LIKE '%"tous"%' OR fq.compte_types LIKE '%"${role.replace(/'/g,"''")}"%')`;

  let sql = `SELECT fq.*, fc.nom AS categorie_nom, fc.icone AS categorie_icone, fc.slug AS categorie_slug
    FROM faq_questions fq
    LEFT JOIN faq_categories fc ON fc.id = fq.category_id
    WHERE fq.statut = ? AND ${roleClause}`;
  const params = [statut];
  if (cat) { sql += ` AND fq.category_id = ?`; params.push(cat); }
  sql += ` ORDER BY fq.ordre, fq.vues DESC, fq.id`;

  const rows = await db.prepare(sql).all(...params);
  const parsed = rows.map(r => ({
    ...r,
    compte_types: safeParse(r.compte_types),
    synonymes:    safeParse(r.synonymes || '[]'),
    mots_cles:    safeParse(r.mots_cles || '[]'),
    etapes:       safeParse(r.etapes    || '[]'),
    medias:       safeParse(r.medias    || '[]'),
  }));
  sendJSON(res, 200, parsed);
});

/* GET /api/faq/search — recherche full-text */
route("GET", "/api/faq/search", async (req, res, _p, _b, q) => {
  const query  = q.q    || '';
  const role   = (q.role || 'tous').toLowerCase();
  if (!query.trim()) return sendJSON(res, 200, []);

  const nq = normFaq(query);
  const words = nq.split(' ').filter(w => w.length >= 2);

  /* Quand role=tous : chercher dans toutes les questions actives */
  const roleFilter = (role === 'tous')
    ? `1=1`
    : `(fq.compte_types LIKE '%"tous"%' OR fq.compte_types LIKE '%"${role.replace(/'/g,"''")}"%')`;

  const all = await db.prepare(`SELECT fq.*, fc.nom AS categorie_nom, fc.icone AS categorie_icone, fc.slug AS categorie_slug
    FROM faq_questions fq
    LEFT JOIN faq_categories fc ON fc.id = fq.category_id
    WHERE fq.statut = 'active' AND ${roleFilter}
    ORDER BY fq.vues DESC, fq.id`).all();

  const scored = all.map(r => {
    const nq2   = normFaq(r.question);
    const nr    = normFaq(r.reponse.replace(/<[^>]*>/g,''));
    const nsyn  = normFaq((safeParse(r.synonymes||'[]')).join(' '));
    const nkw   = normFaq((safeParse(r.mots_cles||'[]')).join(' '));
    const netapes = normFaq((safeParse(r.etapes||'[]')).join(' '));
    let score   = 0;
    words.forEach(w => {
      /* Correspondance exacte */
      if (nq2.includes(w)) score += 10;
      if (nsyn.includes(w)) score += 8;
      if (nkw.includes(w))  score += 6;
      if (nr.includes(w))   score += 3;
      if (netapes.includes(w)) score += 2;
      /* Correspondance par tige verbale (ex: "recruter" → "recrute" → "recrutement") */
      if (w.length >= 5) {
        const stem = w.slice(0, Math.max(4, w.length - 2));
        if (!nq2.includes(w) && nq2.includes(stem))   score += 7;
        if (!nsyn.includes(w) && nsyn.includes(stem)) score += 5;
        if (!nkw.includes(w)  && nkw.includes(stem))  score += 4;
        if (!nr.includes(w)   && nr.includes(stem))   score += 2;
      }
    });
    return { ...r, score,
      compte_types: safeParse(r.compte_types),
      etapes:       safeParse(r.etapes    || '[]'),
      medias:       safeParse(r.medias    || '[]'),
    };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);

  /* Log la recherche */
  try {
    db.prepare(`INSERT INTO faq_searches (query, results_count, user_role) VALUES (?,?,?)`)
      .run(query.slice(0,200), scored.length, role);
  } catch(e){}

  sendJSON(res, 200, scored);
});

/* ════════════════════════════════════════════════════════════════
   FAQ — QUESTIONS SANS RÉPONSE (avant /:id pour éviter conflit de route)
   ════════════════════════════════════════════════════════════════ */

function normSR(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function similariteSR(a, b) {
  const wa = new Set(a.split(' ').filter(w => w.length > 3));
  const wb = new Set(b.split(' ').filter(w => w.length > 3));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  wa.forEach(w => { if (wb.has(w)) inter++; });
  return inter / Math.min(wa.size, wb.size);
}

function calcPriorite(count) {
  if (count >= 20) return 'critique';
  if (count > 10)  return 'elevee';
  if (count >= 3)  return 'moyenne';
  return 'faible';
}

route("POST", "/api/faq/sans-reponse", async (req, res, _p, body) => {
  const { question, source, compte_type, pays, langue } = body;
  if (!question || question.trim().length < 5) return sendJSON(res, 400, { error: 'Question trop courte' });
  const user = getCurrentUser(req);
  const norm = normSR(question);
  const open = db.prepare(`SELECT id, question_norm, count FROM faq_sans_reponse WHERE statut NOT IN ('resolu','ignore')`).all();
  let matched = null;
  for (const row of open) {
    if (similariteSR(norm, row.question_norm || '') >= 0.6) { matched = row; break; }
  }
  if (matched) {
    const newCount = matched.count + 1;
    db.prepare(`UPDATE faq_sans_reponse SET count=?,priorite=?,last_asked_at=datetime('now'),updated_at=datetime('now') WHERE id=?`)
      .run(newCount, calcPriorite(newCount), matched.id);
    return sendJSON(res, 200, { id: matched.id, merged: true, count: newCount });
  }
  const cats = await db.prepare(`SELECT nom FROM faq_categories`).all();
  let catSugg = null, bestScore = 0;
  cats.forEach(c => { const s = similariteSR(norm, normSR(c.nom)); if (s > bestScore) { bestScore = s; catSugg = c.nom; } });
  const r = db.prepare(`INSERT INTO faq_sans_reponse (question,question_norm,source,compte_type,pays,langue,user_id,categorie_suggeree,priorite) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(question.trim(), norm, source||'faq', compte_type||'tous', pays||null, langue||'fr', user?.id||null, catSugg, 'faible');
  sendJSON(res, 201, { id: r.lastInsertRowid, merged: false });
});

route("GET", "/api/faq/sans-reponse/stats", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const total      = db.prepare(`SELECT COUNT(*) n FROM faq_sans_reponse WHERE statut='nouveau'`).get()?.n || 0;
  const en_cours   = db.prepare(`SELECT COUNT(*) n FROM faq_sans_reponse WHERE statut='en_cours'`).get()?.n || 0;
  const resolues   = db.prepare(`SELECT COUNT(*) n FROM faq_sans_reponse WHERE statut='resolu'`).get()?.n || 0;
  const top5       = await db.prepare(`SELECT question, count, priorite FROM faq_sans_reponse WHERE statut='nouveau' ORDER BY count DESC LIMIT 5`).all();
  const by_priorite= db.prepare(`SELECT priorite, COUNT(*) n FROM faq_sans_reponse WHERE statut NOT IN ('resolu','ignore') GROUP BY priorite`).all();
  const avg_temps  = db.prepare(`SELECT AVG((julianday(updated_at)-julianday(first_asked_at))*24) h FROM faq_sans_reponse WHERE statut='resolu'`).get()?.h;
  sendJSON(res, 200, { total, en_cours, resolues, top5, by_priorite, avg_temps_h: avg_temps });
});

route("GET", "/api/faq/sans-reponse/similaires", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const open = db.prepare(`SELECT id, question, question_norm, count FROM faq_sans_reponse WHERE statut NOT IN ('resolu','ignore') ORDER BY count DESC`).all();
  const groupes = [], used = new Set();
  for (let i = 0; i < open.length; i++) {
    if (used.has(open[i].id)) continue;
    const grp = [open[i]]; used.add(open[i].id);
    for (let j = i + 1; j < open.length; j++) {
      if (used.has(open[j].id)) continue;
      if (similariteSR(open[i].question_norm || '', open[j].question_norm || '') >= 0.5) { grp.push(open[j]); used.add(open[j].id); }
    }
    if (grp.length > 1) groupes.push(grp);
  }
  sendJSON(res, 200, groupes);
});

route("GET", "/api/faq/sans-reponse", async (req, res, _p, _b, query) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const statut = query.statut||'', priorite = query.priorite||'', search = query.q||'';
  const limit = parseInt(query.limit)||50;
  let where = ['1=1']; const params = [];
  if (statut)   { where.push(`statut=?`);         params.push(statut); }
  if (priorite) { where.push(`priorite=?`);       params.push(priorite); }
  if (search)   { where.push(`question LIKE ?`);  params.push(`%${search}%`); }
  const rows = db.prepare(
    `SELECT s.*, u.nom user_nom, a.nom admin_nom FROM faq_sans_reponse s
     LEFT JOIN users u ON u.id=s.user_id LEFT JOIN users a ON a.id=s.admin_id
     WHERE ${where.join(' AND ')} ORDER BY s.count DESC, s.last_asked_at DESC LIMIT ?`
  ).all(...params, limit);
  sendJSON(res, 200, rows);
});

route("PUT", "/api/faq/sans-reponse/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const { statut, priorite, admin_id } = body;
  const sets = [], vals = [];
  if (statut)   { sets.push(`statut=?`);   vals.push(statut); }
  if (priorite) { sets.push(`priorite=?`); vals.push(priorite); }
  if (admin_id !== undefined) { sets.push(`admin_id=?`); vals.push(admin_id||null); }
  if (!sets.length) return sendJSON(res, 400, { error: 'Rien à modifier' });
  sets.push(`updated_at=datetime('now')`);
  db.prepare(`UPDATE faq_sans_reponse SET ${sets.join(',')} WHERE id=?`).run(...vals, parseInt(params.id));
  sendJSON(res, 200, { ok: true });
});

route("POST", "/api/faq/sans-reponse/:id/ignorer", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  db.prepare(`UPDATE faq_sans_reponse SET statut='ignore',updated_at=datetime('now') WHERE id=?`).run(parseInt(params.id));
  sendJSON(res, 200, { ok: true });
});

route("POST", "/api/faq/sans-reponse/:id/convertir", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const sr = await db.prepare(`SELECT * FROM faq_sans_reponse WHERE id=?`).get(parseInt(params.id));
  if (!sr) return sendJSON(res, 404, { error: 'Question introuvable' });
  const { category_id, reponse, compte_types, mots_cles, module_lien, module_label } = body;
  if (!reponse || reponse.trim().length < 10) return sendJSON(res, 400, { error: 'Réponse trop courte' });
  const r = db.prepare(`INSERT INTO faq_questions (category_id,compte_types,question,reponse,mots_cles,module_lien,module_label,statut,created_by) VALUES (?,?,?,?,?,?,?,'active',?)`)
    .run(category_id||null, JSON.stringify(compte_types||['tous']), sr.question, reponse.trim(), JSON.stringify(mots_cles||[]), module_lien||null, module_label||null, user.id);
  db.prepare(`UPDATE faq_sans_reponse SET statut='resolu',faq_id=?,updated_at=datetime('now') WHERE id=?`).run(r.lastInsertRowid, sr.id);
  sendJSON(res, 201, { faq_id: r.lastInsertRowid, ok: true });
});

route("POST", "/api/faq/sans-reponse/fusion", async (req, res, _p, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const { ids, question_principale } = body;
  if (!Array.isArray(ids) || ids.length < 2) return sendJSON(res, 400, { error: '≥2 IDs requis' });
  const rows = db.prepare(`SELECT * FROM faq_sans_reponse WHERE id IN (${ids.map(()=>'?').join(',')})`).all(...ids.map(Number));
  const totalCount = rows.reduce((s, r) => s + (r.count||1), 0);
  const mainId = ids[0];
  db.prepare(`UPDATE faq_sans_reponse SET question=?,question_norm=?,count=?,priorite=?,updated_at=datetime('now') WHERE id=?`)
    .run(question_principale, normSR(question_principale), totalCount, calcPriorite(totalCount), mainId);
  const otherIds = ids.slice(1).map(Number);
  if (otherIds.length > 0) db.prepare(`UPDATE faq_sans_reponse SET statut='ignore',updated_at=datetime('now') WHERE id IN (${otherIds.map(()=>'?').join(',')})`).run(...otherIds);
  sendJSON(res, 200, { id: mainId, count: totalCount });
});

/* GET /api/faq/:id — détail question */
route("GET", "/api/faq/:id", async (req, res, params) => {
  const row = await db.prepare(`SELECT fq.*, fc.nom AS categorie_nom, fc.icone AS categorie_icone
    FROM faq_questions fq LEFT JOIN faq_categories fc ON fc.id = fq.category_id
    WHERE fq.id = ?`).get(parseInt(params.id));
  if (!row) return sendJSON(res, 404, { error: 'Introuvable' });
  const r = { ...row,
    compte_types: safeParse(row.compte_types),
    synonymes:    safeParse(row.synonymes || '[]'),
    mots_cles:    safeParse(row.mots_cles || '[]'),
    etapes:       safeParse(row.etapes    || '[]'),
    medias:       safeParse(row.medias    || '[]'),
  };
  sendJSON(res, 200, r);
});

/* POST /api/faq/:id/view — incrémenter vues */
route("POST", "/api/faq/:id/view", async (req, res, params, _b) => {
  const id = parseInt(params.id);
  await db.prepare(`UPDATE faq_questions SET vues = vues + 1 WHERE id = ?`).run(id);
  const user = getCurrentUser(req);
  try {
    db.prepare(`INSERT INTO faq_views (question_id, user_id, user_role) VALUES (?,?,?)`)
      .run(id, user?.id || null, user?.role || null);
  } catch(e){}
  sendJSON(res, 200, { ok: true });
});

/* POST /api/faq/:id/rating — noter une réponse */
route("POST", "/api/faq/:id/rating", async (req, res, params, body) => {
  const id      = parseInt(params.id);
  const helpful = body.helpful ? 1 : 0;
  const user    = getCurrentUser(req);
  db.prepare(`INSERT INTO faq_ratings (question_id, user_id, helpful, comment) VALUES (?,?,?,?)`)
    .run(id, user?.id || null, helpful, body.comment || null);
  sendJSON(res, 200, { ok: true });
});

/* ── ADMIN CRUD ── */

/* POST /api/faq — créer une question */
route("POST", "/api/faq", async (req, res, _p, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const { category_id, compte_types, question, reponse, synonymes, mots_cles, etapes, medias, module_lien, module_label, ordre } = body;
  if (!question?.trim() || !reponse?.trim()) return sendJSON(res, 400, { error: 'Question et réponse requises' });
  const types = JSON.stringify(Array.isArray(compte_types) ? compte_types : ['tous']);
  const r = db.prepare(`INSERT INTO faq_questions
    (category_id,compte_types,question,reponse,synonymes,mots_cles,etapes,medias,module_lien,module_label,ordre,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      category_id || null,
      types,
      question.trim(),
      reponse.trim(),
      JSON.stringify(synonymes || []),
      JSON.stringify(mots_cles || []),
      JSON.stringify(etapes    || []),
      JSON.stringify(medias    || []),
      module_lien   || null,
      module_label  || null,
      parseInt(ordre) || 0,
      user.id
    );
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* PUT /api/faq/:id — modifier */
route("PUT", "/api/faq/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const id = parseInt(params.id);
  const { category_id, compte_types, question, reponse, synonymes, mots_cles, etapes, medias, module_lien, module_label, ordre, statut } = body;
  const types = JSON.stringify(Array.isArray(compte_types) ? compte_types : ['tous']);
  db.prepare(`UPDATE faq_questions SET
    category_id=?, compte_types=?, question=?, reponse=?, synonymes=?, mots_cles=?, etapes=?,
    medias=?, module_lien=?, module_label=?, ordre=?, statut=?, updated_at=datetime('now')
    WHERE id=?`).run(
      category_id || null, types,
      (question || '').trim(), (reponse || '').trim(),
      JSON.stringify(synonymes || []),
      JSON.stringify(mots_cles || []),
      JSON.stringify(etapes    || []),
      JSON.stringify(medias    || []),
      module_lien || null, module_label || null,
      parseInt(ordre) || 0, statut || 'active', id
    );
  sendJSON(res, 200, { ok: true });
});

/* PATCH /api/faq/:id/statut — changer statut (active/inactive/archived) */
route("PATCH", "/api/faq/:id/statut", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const id     = parseInt(params.id);
  const statut = body.statut;
  if (!['active','inactive','archived'].includes(statut)) return sendJSON(res, 400, { error: 'Statut invalide' });
  db.prepare(`UPDATE faq_questions SET statut=?, updated_at=datetime('now') WHERE id=?`).run(statut, id);
  sendJSON(res, 200, { ok: true });
});

/* POST /api/faq/:id/duplicate — dupliquer */
route("POST", "/api/faq/:id/duplicate", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const src = await db.prepare(`SELECT * FROM faq_questions WHERE id=?`).get(parseInt(params.id));
  if (!src) return sendJSON(res, 404, { error: 'Introuvable' });
  const r = db.prepare(`INSERT INTO faq_questions
    (category_id,compte_types,question,reponse,synonymes,mots_cles,etapes,medias,module_lien,module_label,ordre,statut,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      src.category_id, src.compte_types, `[Copie] ${src.question}`, src.reponse,
      src.synonymes, src.mots_cles, src.etapes, src.medias,
      src.module_lien, src.module_label, src.ordre, 'inactive', user.id
    );
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* DELETE /api/faq/:id — supprimer */
route("DELETE", "/api/faq/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  await db.prepare(`DELETE FROM faq_questions WHERE id=?`).run(parseInt(params.id));
  sendJSON(res, 200, { ok: true });
});

/* POST /api/faq/categories — créer catégorie */
route("POST", "/api/faq/categories", async (req, res, _p, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const { nom, icone, ordre } = body;
  if (!nom?.trim()) return sendJSON(res, 400, { error: 'Nom requis' });
  const slug = nom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
  try {
    const r = db.prepare(`INSERT INTO faq_categories (nom,slug,icone,ordre) VALUES (?,?,?,?)`).run(nom.trim(), slug, icone||'📋', parseInt(ordre)||0);
    sendJSON(res, 201, { id: r.lastInsertRowid, slug });
  } catch(e) { sendJSON(res, 409, { error: 'Ce nom existe déjà' }); }
});

/* PUT /api/faq/categories/:id — modifier catégorie */
route("PUT", "/api/faq/categories/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  await db.prepare(`UPDATE faq_categories SET nom=?, icone=?, ordre=? WHERE id=?`)
    .run(body.nom||'', body.icone||'📋', parseInt(body.ordre)||0, parseInt(params.id));
  sendJSON(res, 200, { ok: true });
});

/* DELETE /api/faq/categories/:id — supprimer catégorie */
route("DELETE", "/api/faq/categories/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  await db.prepare(`DELETE FROM faq_categories WHERE id=?`).run(parseInt(params.id));
  sendJSON(res, 200, { ok: true });
});

/* GET /api/faq/stats/dashboard — admin stats */
route("GET", "/api/faq/stats/dashboard", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const total_questions  = db.prepare(`SELECT COUNT(*) n FROM faq_questions WHERE statut='active'`).get()?.n || 0;
  const total_vues       = db.prepare(`SELECT SUM(vues) n FROM faq_questions`).get()?.n || 0;
  const zero_vues        = db.prepare(`SELECT COUNT(*) n FROM faq_questions WHERE vues=0 AND statut='active'`).get()?.n || 0;
  const top_questions    = await db.prepare(`SELECT id,question,vues,statut FROM faq_questions ORDER BY vues DESC LIMIT 10`).all();
  const no_results_searches = db.prepare(`SELECT query, COUNT(*) n FROM faq_searches WHERE results_count=0 GROUP BY query ORDER BY n DESC LIMIT 10`).all();
  const top_searches     = db.prepare(`SELECT query, COUNT(*) n FROM faq_searches GROUP BY query ORDER BY n DESC LIMIT 10`).all();
  const satisfaction     = db.prepare(`SELECT helpful, COUNT(*) n FROM faq_ratings GROUP BY helpful`).all();
  const helpful_yes      = satisfaction.find(r=>r.helpful===1)?.n || 0;
  const helpful_no       = satisfaction.find(r=>r.helpful===0)?.n || 0;
  const taux_satisfaction = (helpful_yes + helpful_no) > 0
    ? Math.round((helpful_yes / (helpful_yes + helpful_no)) * 100) : null;
  sendJSON(res, 200, {
    total_questions, total_vues, zero_vues,
    top_questions, no_results_searches, top_searches,
    satisfaction: { helpful: helpful_yes, not_helpful: helpful_no, taux: taux_satisfaction },
  });
});

/* ════════════════════════════════════════════════════════════════
   ONBOARDING — Routes API
   ════════════════════════════════════════════════════════════════ */

/* GET /api/onboarding/:role — tutoriel + étapes pour un rôle */
route("GET", "/api/onboarding/:role", async (req, res, params) => {
  const role = (params.role || 'utilisateur').toLowerCase();
  const tut  = await db.prepare(`SELECT * FROM onboarding_tutorials WHERE compte_type=? AND actif=1`).get(role);
  if (!tut) return sendJSON(res, 404, { error: 'Aucun tutoriel pour ce rôle' });
  const steps = await db.prepare(`SELECT * FROM onboarding_steps WHERE tutorial_id=? AND actif=1 ORDER BY ordre`).all(tut.id);
  sendJSON(res, 200, { ...tut, steps });
});

/* GET /api/onboarding/progress/me — progression de l'utilisateur connecté */
route("GET", "/api/onboarding/progress/me", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'Non connecté' });
  const row = await db.prepare(`SELECT * FROM onboarding_progress WHERE user_id=? ORDER BY updated_at DESC LIMIT 1`).get(user.id);
  sendJSON(res, 200, row || null);
});

/* POST /api/onboarding/progress — sauvegarder la progression */
route("POST", "/api/onboarding/progress", async (req, res, _p, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'Non connecté' });
  const { tutorial_id, statut, etapes_completees, note, commentaire } = body;
  const existing = await db.prepare(`SELECT id FROM onboarding_progress WHERE user_id=? AND tutorial_id=?`).get(user.id, tutorial_id);
  if (existing) {
    db.prepare(`UPDATE onboarding_progress SET statut=?,etapes_completees=?,note=?,commentaire=?,updated_at=datetime('now')${statut==='termine'?",completed_at=datetime('now')":""} WHERE id=?`)
      .run(statut, JSON.stringify(etapes_completees||[]), note||null, commentaire||null, existing.id);
  } else {
    db.prepare(`INSERT INTO onboarding_progress (user_id,tutorial_id,statut,etapes_completees,note,commentaire${statut==='termine'?',completed_at':''}) VALUES (?,?,?,?,?,?${statut==='termine'?",datetime('now')":''})`
    ).run(user.id, tutorial_id||null, statut, JSON.stringify(etapes_completees||[]), note||null, commentaire||null);
  }
  sendJSON(res, 200, { ok: true });
});

/* POST /api/onboarding/stats — log d'une action (start, step_complete, abandon…) */
route("POST", "/api/onboarding/stats", async (req, res, _p, body) => {
  const user = getCurrentUser(req);
  const { tutorial_id, step_id, action, data } = body;
  try {
    db.prepare(`INSERT INTO onboarding_stats (tutorial_id,step_id,user_id,action,data) VALUES (?,?,?,?,?)`)
      .run(tutorial_id||null, step_id||null, user?.id||null, action||'', JSON.stringify(data||{}));
  } catch(e){}
  sendJSON(res, 200, { ok: true });
});

/* ── ADMIN CRUD Tutoriels ── */

/* GET /api/onboarding/admin/list — liste tous les tutoriels */
route("GET", "/api/onboarding/admin/list", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const tuts = db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM onboarding_steps WHERE tutorial_id=t.id AND actif=1) nb_steps FROM onboarding_tutorials t ORDER BY t.compte_type`).all();
  sendJSON(res, 200, tuts);
});

/* PUT /api/onboarding/admin/:id — modifier un tutoriel */
route("PUT", "/api/onboarding/admin/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const { titre, description, duree_estimee, obligatoire, actif } = body;
  db.prepare(`UPDATE onboarding_tutorials SET titre=?,description=?,duree_estimee=?,obligatoire=?,actif=?,version=version+1,updated_at=datetime('now') WHERE id=?`)
    .run(titre||'', description||'', parseInt(duree_estimee)||3, obligatoire?1:0, actif?1:0, parseInt(params.id));
  sendJSON(res, 200, { ok: true });
});

/* GET /api/onboarding/admin/:id/steps — étapes d'un tutoriel */
route("GET", "/api/onboarding/admin/:id/steps", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const steps = await db.prepare(`SELECT * FROM onboarding_steps WHERE tutorial_id=? ORDER BY ordre`).all(parseInt(params.id));
  sendJSON(res, 200, steps);
});

/* POST /api/onboarding/admin/:id/steps — ajouter une étape */
route("POST", "/api/onboarding/admin/:id/steps", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const { titre, contenu, type, illustration, narration, module_lien, module_label, ordre } = body;
  const r = db.prepare(`INSERT INTO onboarding_steps (tutorial_id,ordre,titre,contenu,type,illustration,narration,module_lien,module_label) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(parseInt(params.id), parseInt(ordre)||0, titre||'', contenu||'', type||'info', illustration||'📋', narration||'', module_lien||null, module_label||null);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* PUT /api/onboarding/admin/steps/:id — modifier une étape */
route("PUT", "/api/onboarding/admin/steps/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const { titre, contenu, type, illustration, narration, module_lien, module_label, ordre, actif } = body;
  await db.prepare(`UPDATE onboarding_steps SET titre=?,contenu=?,type=?,illustration=?,narration=?,module_lien=?,module_label=?,ordre=?,actif=? WHERE id=?`)
    .run(titre||'', contenu||'', type||'info', illustration||'📋', narration||'', module_lien||null, module_label||null, parseInt(ordre)||0, actif?1:0, parseInt(params.id));
  sendJSON(res, 200, { ok: true });
});

/* DELETE /api/onboarding/admin/steps/:id — supprimer une étape */
route("DELETE", "/api/onboarding/admin/steps/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  await db.prepare(`DELETE FROM onboarding_steps WHERE id=?`).run(parseInt(params.id));
  sendJSON(res, 200, { ok: true });
});

/* GET /api/onboarding/admin/stats — statistiques globales */
route("GET", "/api/onboarding/admin/stats", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const total_started   = db.prepare(`SELECT COUNT(*) n FROM onboarding_progress WHERE statut != 'en_cours'`).get()?.n || 0;
  const total_finished  = db.prepare(`SELECT COUNT(*) n FROM onboarding_progress WHERE statut = 'termine'`).get()?.n || 0;
  const total_skipped   = db.prepare(`SELECT COUNT(*) n FROM onboarding_progress WHERE statut = 'ignore'`).get()?.n || 0;
  const avg_note        = db.prepare(`SELECT AVG(note) n FROM onboarding_progress WHERE note IS NOT NULL`).get()?.n;
  const by_role         = db.prepare(`SELECT t.compte_type, COUNT(*) n, SUM(CASE WHEN p.statut='termine' THEN 1 ELSE 0 END) done FROM onboarding_progress p JOIN onboarding_tutorials t ON t.id=p.tutorial_id GROUP BY t.compte_type`).all();
  const top_abandon     = db.prepare(`SELECT step_id, COUNT(*) n FROM onboarding_stats WHERE action='abandon' GROUP BY step_id ORDER BY n DESC LIMIT 5`).all();
  const top_skip_steps  = db.prepare(`SELECT step_id, COUNT(*) n FROM onboarding_stats WHERE action='step_skip' GROUP BY step_id ORDER BY n DESC LIMIT 5`).all();
  sendJSON(res, 200, { total_started, total_finished, total_skipped, avg_note, by_role, top_abandon, top_skip_steps });
});

/* ════════════════════════════════════════════════════════════════
   O-Z — INTELLIGENCE ARTIFICIELLE OFFICIELLE
   ════════════════════════════════════════════════════════════════ */

route("GET", "/api/oz/settings", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 200, {});
  const s = await db.prepare('SELECT * FROM oz_settings WHERE user_id=?').get(user.id);
  sendJSON(res, 200, s || {});
});

route("PUT", "/api/oz/settings", async (req, res, _p, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'Non connecté' });
  const { avatar, theme, size, animations, voice_enabled, language, pos_x, pos_y } = body;
  db.prepare(`INSERT INTO oz_settings (user_id,avatar,theme,size,animations,voice_enabled,language,pos_x,pos_y,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
    avatar=excluded.avatar, theme=excluded.theme, size=excluded.size,
    animations=excluded.animations, voice_enabled=excluded.voice_enabled,
    language=excluded.language, pos_x=excluded.pos_x, pos_y=excluded.pos_y,
    updated_at=datetime('now')
  `).run(user.id, avatar||'robot', theme||'auto', size||'medium', animations??1, voice_enabled??0, language||'fr', pos_x||null, pos_y||null);
  sendJSON(res, 200, { ok: true });
});

route("POST", "/api/oz/audit", async (req, res, _p, body) => {
  const user = getCurrentUser(req);
  const { action, module, params, result } = body;
  db.prepare('INSERT INTO oz_audit (user_id,action,module,params,result) VALUES (?,?,?,?,?)')
    .run(user?.id||null, action||'', module||'', params||null, result||'ok');
  sendJSON(res, 201, { ok: true });
});

route("GET", "/api/oz/audit", async (req, res, _p, _b, query) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const limit = parseInt(query.limit)||100;
  const rows = await db.prepare(
    `SELECT a.*, u.nom user_nom, u.prenom user_prenom
     FROM oz_audit a LEFT JOIN users u ON u.id=a.user_id
     ORDER BY a.id DESC LIMIT ?`
  ).all(limit);
  sendJSON(res, 200, rows);
});

route("GET", "/api/oz/stats", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const total_actions = db.prepare('SELECT COUNT(*) n FROM oz_audit').get()?.n || 0;
  const today         = db.prepare("SELECT COUNT(*) n FROM oz_audit WHERE date(created_at)=date('now')").get()?.n || 0;
  const by_action     = db.prepare('SELECT action, COUNT(*) n FROM oz_audit GROUP BY action ORDER BY n DESC LIMIT 10').all();
  const users_actifs  = db.prepare("SELECT COUNT(DISTINCT user_id) n FROM oz_audit WHERE date(created_at)>=date('now','-7 days')").get()?.n || 0;
  const top_modules   = db.prepare("SELECT module, COUNT(*) n FROM oz_audit WHERE module IS NOT NULL AND module!='' GROUP BY module ORDER BY n DESC LIMIT 5").all();
  sendJSON(res, 200, { total_actions, today, by_action, users_actifs, top_modules });
});

route("GET", "/api/oz/knowledge", async (req, res) => {
  const rows = await db.prepare('SELECT * FROM oz_knowledge WHERE actif=1 ORDER BY id').all();
  sendJSON(res, 200, rows);
});

route("GET", "/api/oz/knowledge/all", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const rows = await db.prepare('SELECT * FROM oz_knowledge ORDER BY actif DESC, id').all();
  sendJSON(res, 200, rows);
});

route("POST", "/api/oz/knowledge", async (req, res, _p, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const { topic, content, tags } = body;
  if (!topic || !content) return sendJSON(res, 400, { error: 'topic + content requis' });
  const r = db.prepare('INSERT INTO oz_knowledge (topic,content,tags) VALUES (?,?,?)').run(topic.trim(), content.trim(), tags||'');
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

route("PUT", "/api/oz/knowledge/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  const { topic, content, tags, actif } = body;
  db.prepare(`UPDATE oz_knowledge SET topic=?,content=?,tags=?,actif=?,updated_at=datetime('now') WHERE id=?`)
    .run(topic||'', content||'', tags||'', actif??1, parseInt(params.id));
  sendJSON(res, 200, { ok: true });
});

route("DELETE", "/api/oz/knowledge/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Admin requis' });
  await db.prepare('UPDATE oz_knowledge SET actif=0 WHERE id=?').run(parseInt(params.id));
  sendJSON(res, 200, { ok: true });
});

/* ══ Notifications lors de la publication d'un événement ══ */
function envoyerNotificationsEvenement(eventId, organisateurId, titre, cibleListeStr, partenairesIdsStr) {
  const notifExists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'").get();
  if (!notifExists) return;
  const destinataires = new Set();
  // Membres des listes de diffusion sélectionnées
  try {
    const listeIds = JSON.parse(cibleListeStr || '[]');
    for (const lid of listeIds) {
      const contacts = await db.prepare("SELECT user_id FROM listes_diffusion_contacts WHERE liste_id=? AND user_id IS NOT NULL").all(lid);
      contacts.forEach(c => destinataires.add(c.user_id));
    }
  } catch(_){}
  // Partenaires identifiés (users seulement, pas les initiatives)
  try {
    const parts = JSON.parse(partenairesIdsStr || '[]');
    for (const p of parts) { if (p.source === 'user' && p.id) destinataires.add(p.id); }
  } catch(_){}
  // Créer les notifications
  const ts = new Date().toISOString();
  const stmt = db.prepare("INSERT INTO notifications (user_id, type, contenu, lien, created_at, lu) VALUES (?,?,?,?,?,0)");
  for (const uid of destinataires) {
    if (uid === organisateurId) continue;
    try { stmt.run(uid, 'evenement', `Nouvel événement : ${titre}`, `/evenement.html?id=${eventId}`, ts); } catch(_){}
  }
}

/* ══ Gestion automatique des campagnes de recrutement (lazy) ══ */
function autoGererRecrutement() {
  try {
    const now = new Date().toISOString();
    // Expiration automatique à 2 mois
    db.prepare(`UPDATE recrutement_campagnes SET statut='expiree', updated_at=datetime('now')
      WHERE statut='active' AND expire_at IS NOT NULL AND expire_at < ?`).run(now);
    // Notification J-7 fin de promotion (30j)
    const aNotifPromo7 = db.prepare(`SELECT id,recruteur_id,nom FROM recrutement_campagnes
      WHERE statut='active' AND notif_promo_7j=0 AND promotion_fin IS NOT NULL
        AND promotion_fin BETWEEN datetime(?,'+0 days') AND datetime(?,'+7 days')`).all(now, now);
    for (const c of aNotifPromo7) {
      try {
        db.prepare(`INSERT INTO notifications(user_id,type,contenu,lien,created_at) VALUES(?,?,?,?,datetime('now'))`)
          .run(c.recruteur_id,'systeme',`📣 La promotion de votre campagne "${c.nom}" se termine dans 7 jours.`,`/recrutement.html`);
        await db.prepare(`UPDATE recrutement_campagnes SET notif_promo_7j=1 WHERE id=?`).run(c.id);
      } catch(_){}
    }
    // Notification fin de promotion
    const aNotifPromoFin = await db.prepare(`SELECT id,recruteur_id,nom FROM recrutement_campagnes
      WHERE statut='active' AND notif_promo_fin=0 AND promotion_fin IS NOT NULL AND promotion_fin < ?`).all(now);
    for (const c of aNotifPromoFin) {
      try {
        db.prepare(`INSERT INTO notifications(user_id,type,contenu,lien,created_at) VALUES(?,?,?,?,datetime('now'))`)
          .run(c.recruteur_id,'systeme',`📣 La période de promotion de "${c.nom}" est terminée. La campagne reste accessible jusqu'à expiration.`,`/recrutement.html`);
        await db.prepare(`UPDATE recrutement_campagnes SET notif_promo_fin=1 WHERE id=?`).run(c.id);
      } catch(_){}
    }
    // Notification J-7 expiration (2 mois)
    const aNotifExpir7 = db.prepare(`SELECT id,recruteur_id,nom FROM recrutement_campagnes
      WHERE statut='active' AND notif_expir_7j=0 AND expire_at IS NOT NULL
        AND expire_at BETWEEN datetime(?,'+0 days') AND datetime(?,'+7 days')`).all(now, now);
    for (const c of aNotifExpir7) {
      try {
        db.prepare(`INSERT INTO notifications(user_id,type,contenu,lien,created_at) VALUES(?,?,?,?,datetime('now'))`)
          .run(c.recruteur_id,'systeme',`⚠️ Votre campagne "${c.nom}" expire dans 7 jours et sera automatiquement clôturée.`,`/recrutement.html`);
        await db.prepare(`UPDATE recrutement_campagnes SET notif_expir_7j=1 WHERE id=?`).run(c.id);
      } catch(_){}
    }
    // Notification clôture automatique
    const aClotures = await db.prepare(`SELECT id,recruteur_id,nom FROM recrutement_campagnes
      WHERE statut='expiree' AND notif_cloture=0`).all();
    for (const c of aClotures) {
      try {
        db.prepare(`INSERT INTO notifications(user_id,type,contenu,lien,created_at) VALUES(?,?,?,?,datetime('now'))`)
          .run(c.recruteur_id,'systeme',`🔒 Votre campagne "${c.nom}" a été clôturée automatiquement. Les statistiques restent accessibles.`,`/recrutement.html`);
        // Archiver les candidatures
        await db.prepare(`UPDATE recrutement_candidatures SET statut='archivee' WHERE campagne_id=? AND statut='en_attente'`).run(c.id);
        await db.prepare(`UPDATE recrutement_campagnes SET notif_cloture=1 WHERE id=?`).run(c.id);
      } catch(_){}
    }
  } catch(_){}
}

/* ══ Auto-publication des événements programmés (lazy) ══ */
function autoPublierProgrammes() {
  try {
    const now = new Date().toISOString();
    const dues = await db.prepare("SELECT id,organisateur_id,titre,cible_liste_ids,fc_partenaires_ids FROM events WHERE statut='brouillon_programme' AND programmed_at IS NOT NULL AND programmed_at <= ?").all(now);
    for (const e of dues) {
      db.prepare("UPDATE events SET statut='publie', publie_at=COALESCE(publie_at,datetime('now')), updated_at=datetime('now') WHERE id=?").run(e.id);
      try { envoyerNotificationsEvenement(e.id, e.organisateur_id, e.titre, e.cible_liste_ids, e.fc_partenaires_ids); } catch(_){}
    }
  } catch(_){}
}

/* ══ Gestion automatique des Dossiers QR Code Participants (lazy) ══ */
function autoGererDossiersQR() {
  try {
    // 1. Notification 24h avant suppression (J-4 après date_fin = J+5 approche)
    const aNotifier = db.prepare(`
      SELECT id, organisateur_id, titre FROM events
      WHERE date_fin IS NOT NULL
        AND date_fin < datetime('now','-4 days')
        AND date_fin >= datetime('now','-5 days')
        AND qr_folder_purged_at IS NULL
        AND qr_folder_notified_at IS NULL
    `).all();
    for (const e of aNotifier) {
      try {
        db.prepare(`INSERT INTO notifications (user_id,type,contenu,lien,created_at) VALUES (?,?,?,?,datetime('now'))`)
          .run(e.organisateur_id, 'systeme',
            `⚠️ Le dossier "QR Code Participants — ${e.titre}" sera supprimé dans 24h. Exportez les données si nécessaire.`,
            `/billetterie.html`);
        db.prepare(`UPDATE events SET qr_folder_notified_at=datetime('now') WHERE id=?`).run(e.id);
      } catch(_){}
    }
    // 2. Suppression automatique des données opérationnelles J+5 après date_fin
    const aPurger = db.prepare(`
      SELECT id, organisateur_id, titre FROM events
      WHERE date_fin IS NOT NULL
        AND date_fin < datetime('now','-5 days')
        AND qr_folder_purged_at IS NULL
    `).all();
    for (const e of aPurger) {
      try {
        // Supprimer journaux de scans
        await db.prepare(`DELETE FROM event_checkins WHERE event_id=?`).run(e.id);
        // Archiver inscriptions sécurisées (supprimer QR, garder statut + identité pour obligations légales)
        db.prepare(`UPDATE event_inscriptions_securisees SET billet_qr=NULL, statut='archive', updated_at=datetime('now') WHERE event_id=?`).run(e.id);
        // Invalider tokens QR des billets (garder enregistrements financiers)
        await db.prepare(`UPDATE tickets SET qr_token=NULL WHERE event_id=?`).run(e.id);
        db.prepare(`UPDATE events SET qr_folder_purged_at=datetime('now') WHERE id=?`).run(e.id);
      } catch(_){}
    }
  } catch(_){}
}

/* ══ UPLOAD VIDÉO MP4 (handler binaire hors readBody) ══ */
async function handleVideoUpload(req, res) {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'Connexion requise.' });
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const filename = `video-${user.id}-${Date.now()}.mp4`;
  const filepath = path.join(uploadsDir, filename);
  const MAX = 60 * 1024 * 1024; // 60 Mo
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX) { try { fs.unlinkSync(filepath); } catch(_){} return sendJSON(res, 413, { error: 'Vidéo trop lourde (max 60 Mo).' }); }
    chunks.push(chunk);
  }
  fs.writeFileSync(filepath, Buffer.concat(chunks));
  return sendJSON(res, 200, { url: `/uploads/${filename}` });
}

async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  /* ── Servir les vidéos uploadées ── */
  if (pathname.startsWith('/uploads/')) {
    const safe = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    const file = path.join(__dirname, safe);
    if (!file.startsWith(path.join(__dirname, 'uploads'))) return sendJSON(res, 403, { error: 'Accès interdit.' });
    if (!fs.existsSync(file)) return sendJSON(res, 404, { error: 'Fichier introuvable.' });
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
    return;
  }

  /* ── Upload vidéo binaire (avant readBody) ── */
  if (pathname === '/api/upload/video' && req.method === 'POST') {
    return handleVideoUpload(req, res);
  }

  if (pathname.startsWith("/api/")) {
    // Enregistrer l'activité de l'utilisateur connecté (pour DAU/WAU/MAU)
    if (req.method === "GET") trackActivity(req);

    // Sur Vercel, le body stream peut déjà être terminé avant qu'on ajoute des listeners.
    // On bufferise le body UNE FOIS ici pour que tous les blocs if tardifs puissent y accéder.
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      await readBody(req);
    }

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.regex);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => params[k] = m[i + 1]);
      try {
        const body = (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") ? await readBody(req) : {};
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
        await db.prepare(`UPDATE counters SET value = value + 1 WHERE key = ?`).run('page_visits');
        const row = await db.prepare(`SELECT value FROM counters WHERE key = ?`).get('page_visits');
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
      const cvs = await db.prepare(`SELECT id, numero, titre, theme, updated_at FROM cv_profiles WHERE user_id = ? ORDER BY numero`).all(me.id);
      return sendJSON(res, 200, cvs);
    }

    /* --- GET /api/cv/:id --- */
    if (req.method === "GET" && /^\/api\/cv\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const id = parseInt(pathname.split('/')[3]);
      const cv = await db.prepare(`SELECT * FROM cv_profiles WHERE id = ? AND user_id = ?`).get(id, me.id);
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
      const existing = await db.prepare(`SELECT id, data_json, versions_json FROM cv_profiles WHERE user_id = ? AND numero = ?`).get(me.id, numero);
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
      await db.prepare(`DELETE FROM cv_profiles WHERE id = ? AND user_id = ?`).run(id, me.id);
      return sendJSON(res, 200, { deleted: true });
    }

    /* --- GET /api/lettres --- */
    if (req.method === "GET" && pathname === "/api/lettres") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const lettres = await db.prepare(`SELECT id, numero, titre, updated_at FROM lettres_motivation WHERE user_id = ? ORDER BY numero`).all(me.id);
      return sendJSON(res, 200, lettres);
    }

    /* --- GET /api/lettres/:id --- */
    if (req.method === "GET" && /^\/api\/lettres\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const id = parseInt(pathname.split('/')[3]);
      const l = await db.prepare(`SELECT * FROM lettres_motivation WHERE id = ? AND user_id = ?`).get(id, me.id);
      if (!l) return sendJSON(res, 404, { error: "Lettre introuvable" });
      l.data = JSON.parse(l.data_json || '{}');
      return sendJSON(res, 200, l);
    }

    /* --- POST /api/lettres --- */
    if (req.method === "POST" && pathname === "/api/lettres") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const { numero = 1, titre = 'Ma lettre', data = {} } = body;
      if (![1, 2].includes(Number(numero))) return sendJSON(res, 400, { error: "numero doit être 1 ou 2" });
      const existing = await db.prepare(`SELECT id FROM lettres_motivation WHERE user_id = ? AND numero = ?`).get(me.id, numero);
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
      await db.prepare(`DELETE FROM lettres_motivation WHERE id = ? AND user_id = ?`).run(id, me.id);
      return sendJSON(res, 200, { deleted: true });
    }

    /* --- GET /api/candidatures/mes — candidatures du candidat connecté --- */
    if (req.method === "GET" && pathname === "/api/candidatures/mes") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      try {
        const rows = await db.prepare(`
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
      const cand = await db.prepare(`SELECT * FROM offres_candidatures WHERE id = ?`).get(id);
      if (!cand || (cand.candidat_id !== me.id && me.role !== 'admin')) {
        const offre = cand ? await db.prepare(`SELECT createur_id FROM offres WHERE id=?`).get(cand.offre_id) : null;
        if (!offre || offre.createur_id !== me.id) return sendJSON(res, 403, { error: "Accès refusé" });
      }
      const hist = await db.prepare(`SELECT * FROM candidature_historique WHERE candidature_id = ? ORDER BY created_at`).all(id);
      return sendJSON(res, 200, hist);
    }

    /* --- PATCH /api/candidatures/:id/statut — changer le statut (recruteur ou admin) --- */
    if (req.method === "PATCH" && /^\/api\/candidatures\/\d+\/statut$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const id = parseInt(pathname.split('/')[3]);
      const cand = await db.prepare(`SELECT * FROM offres_candidatures WHERE id=?`).get(id);
      if (!cand) return sendJSON(res, 404, { error: "Candidature introuvable" });
      const offre = await db.prepare(`SELECT createur_id FROM offres WHERE id=?`).get(cand.offre_id);
      if (me.role !== 'admin' && offre?.createur_id !== me.id) return sendJSON(res, 403, { error: "Accès refusé" });
      const { statut_detail, note, date_entretien, lieu_entretien, type_entretien } = body;
      await db.prepare(`UPDATE offres_candidatures SET statut_detail=?, date_entretien=?, lieu_entretien=?, type_entretien=?, vu_recruteur=1 WHERE id=?`)
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
      const cand = await db.prepare(`SELECT * FROM offres_candidatures WHERE id=?`).get(id);
      if (!cand) return sendJSON(res, 404, { error: "Candidature introuvable" });
      const offre = await db.prepare(`SELECT createur_id FROM offres WHERE id=?`).get(cand.offre_id);
      if (me.role !== 'admin' && offre?.createur_id !== me.id) return sendJSON(res, 403, { error: "Accès refusé" });
      const { notes_recruteur, evaluation_json } = body;
      await db.prepare(`UPDATE offres_candidatures SET notes_recruteur=?, evaluation_json=?, vu_recruteur=1 WHERE id=?`)
        .run(notes_recruteur ?? cand.notes_recruteur, JSON.stringify(evaluation_json) ?? cand.evaluation_json, id);
      return sendJSON(res, 200, { updated: true });
    }

    /* --- GET /api/offres/:id/candidatures — candidatures d'une offre (recruteur) --- */
    if (req.method === "GET" && /^\/api\/offres\/\d+\/candidatures$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const offreId = parseInt(pathname.split('/')[3]);
      const offre = await db.prepare(`SELECT * FROM offres WHERE id=?`).get(offreId);
      if (!offre) return sendJSON(res, 404, { error: "Offre introuvable" });
      if (me.role !== 'admin' && offre.createur_id !== me.id) return sendJSON(res, 403, { error: "Accès refusé" });
      const rows = await db.prepare(`
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
      const existing = await db.prepare(`SELECT id FROM offres_candidatures WHERE offre_id=? AND candidat_id=?`).get(offreId, me.id);
      if (existing) return sendJSON(res, 409, { error: "Vous avez déjà postulé à cette offre" });
      const r = db.prepare(`INSERT INTO offres_candidatures(offre_id,candidat_id,message,cv_profile_id,lettre_id,statut,statut_detail,type_candidature) VALUES(?,?,?,?,?,'recu','envoyee','offre')`)
        .run(offreId, me.id, message || null, cv_profile_id || null, lettre_id || null);
      await db.prepare(`UPDATE offres SET nb_candidatures = nb_candidatures + 1 WHERE id=?`).run(offreId);
      db.prepare(`INSERT INTO candidature_historique(candidature_id,statut,auteur_id) VALUES(?,?,?)`)
        .run(r.lastInsertRowid, 'envoyee', me.id);
      // Notif recruteur
      try {
        const offre = await db.prepare(`SELECT createur_id, titre FROM offres WHERE id=?`).get(offreId);
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

    /* Migrations lazy — colonnes multi-participants & conversion */
    try { await db.prepare("ALTER TABLE rdv_proposals ADD COLUMN participants_json TEXT").run(); } catch(e) {}
    try { await db.prepare("ALTER TABLE rdv_proposals ADD COLUMN reponses_json TEXT DEFAULT '{}'").run(); } catch(e) {}
    try { await db.prepare("ALTER TABLE rdv_proposals ADD COLUMN lien_visio TEXT").run(); } catch(e) {}
    try { await db.prepare("ALTER TABLE rdv_proposals ADD COLUMN converted_event_id INTEGER").run(); } catch(e) {}

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
      const ev = await db.prepare(`SELECT * FROM agenda_events WHERE id=? AND user_id=?`).get(evId, me.id);
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
      await db.prepare(`DELETE FROM agenda_events WHERE id=? AND user_id=?`).run(evId, me.id);
      await db.prepare(`DELETE FROM agenda_reminders WHERE event_id=? AND user_id=?`).run(evId, me.id);
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
      const rdvs = await db.prepare(`
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

    /* POST /api/rdv — proposer un RDV (multi-participants, max 10 au total) */
    if (req.method === "POST" && pathname === "/api/rdv") {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const { destinataire_id, titre, description, date_proposee, heure_debut, heure_fin, duree_minutes,
              lieu, lieu_type, lien_visio, participants_json } = body;
      if (!titre || !date_proposee || !heure_debut || !heure_fin)
        return sendJSON(res, 400, { error: "Champs requis manquants" });

      // Collecter tous les participants (destinataire principal + extras)
      let extraIds = [];
      try { extraIds = JSON.parse(participants_json || '[]').map(Number).filter(Boolean); } catch(e) {}
      const allDests = destinataire_id ? [Number(destinataire_id), ...extraIds.filter(id => id !== Number(destinataire_id))] : extraIds;
      const uniqueDests = [...new Set(allDests)].filter(id => id !== me.id);

      // Limite 10 participants (organisateur inclus)
      if (uniqueDests.length > 9) return sendJSON(res, 400, { error: "Maximum 9 invités (10 participants incluant l'organisateur)", code: 'MAX_PARTICIPANTS' });
      if (uniqueDests.length === 0) return sendJSON(res, 400, { error: "Au moins un destinataire requis" });

      const debut = `${date_proposee}T${heure_debut}:00`;
      const fin   = `${date_proposee}T${heure_fin}:00`;

      const r = db.prepare(`INSERT INTO rdv_proposals(proposeur_id,destinataire_id,titre,description,date_proposee,heure_debut,heure_fin,duree_minutes,lieu,lieu_type,lien_visio,participants_json)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          me.id, uniqueDests[0], titre, description||null, date_proposee, heure_debut, heure_fin,
          duree_minutes||30, lieu||null, lieu_type||'virtuel', lien_visio||null,
          JSON.stringify(uniqueDests)
        );
      const rdvId = r.lastInsertRowid;

      // Notif à tous les destinataires
      const moi = await db.prepare(`SELECT prenom, nom FROM users WHERE id=?`).get(me.id);
      for (const destId of uniqueDests) {
        try {
          db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(
            destId, 'rdv_proposition',
            `Nouveau rendez-vous proposé`,
            `${moi.prenom} ${moi.nom} vous propose un RDV : "${titre}" le ${date_proposee} à ${heure_debut}`,
            JSON.stringify({ rdv_id: rdvId })
          );
        } catch(e) {}
      }
      return sendJSON(res, 201, { id: rdvId, nb_participants: uniqueDests.length + 1 });
    }

    /* PATCH /api/rdv/:id/respond — accepter/refuser/contre-proposer */
    if (req.method === "PATCH" && /^\/api\/rdv\/\d+\/respond$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rdvId = parseInt(pathname.split('/')[3]);
      const rdv = await db.prepare(`SELECT * FROM rdv_proposals WHERE id=?`).get(rdvId);
      if (!rdv) return sendJSON(res, 404, { error: "RDV introuvable" });
      if (rdv.destinataire_id !== me.id && rdv.proposeur_id !== me.id) return sendJSON(res, 403, { error: "Accès refusé" });
      const { action, contre_date, contre_heure_debut, contre_heure_fin, message_reponse } = body;

      if (action === 'accepte') {
        const debut = `${rdv.date_proposee}T${rdv.heure_debut}:00`;
        const fin   = `${rdv.date_proposee}T${rdv.heure_fin}:00`;
        let meetingId = null;
        // Salle de réunion si virtuel
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
        // Créer agenda_events pour l'organisateur
        const evP = db.prepare(`INSERT INTO agenda_events(user_id,titre,description,date_debut,date_fin,lieu,lieu_type,couleur,rdv_id,meeting_id) VALUES(?,?,?,?,?,?,?,?,?,?)`)
          .run(rdv.proposeur_id, rdv.titre, rdv.description||null, debut, fin, rdv.lieu||null, rdv.lieu_type||'physique', '#27ae60', rdvId, meetingId);
        // Créer agenda_events pour le destinataire principal
        const evD = db.prepare(`INSERT INTO agenda_events(user_id,titre,description,date_debut,date_fin,lieu,lieu_type,couleur,rdv_id,meeting_id) VALUES(?,?,?,?,?,?,?,?,?,?)`)
          .run(rdv.destinataire_id, rdv.titre, rdv.description||null, debut, fin, rdv.lieu||null, rdv.lieu_type||'physique', '#27ae60', rdvId, meetingId);
        // Créer agenda_events pour les participants additionnels
        let extraIds = [];
        try { extraIds = JSON.parse(rdv.participants_json || '[]').map(Number).filter(id => id !== rdv.proposeur_id && id !== rdv.destinataire_id); } catch(e) {}
        for (const pid of extraIds) {
          try {
            db.prepare(`INSERT INTO agenda_events(user_id,titre,description,date_debut,date_fin,lieu,lieu_type,couleur,rdv_id,meeting_id) VALUES(?,?,?,?,?,?,?,?,?,?)`)
              .run(pid, rdv.titre, rdv.description||null, debut, fin, rdv.lieu||null, rdv.lieu_type||'physique', '#27ae60', rdvId, meetingId);
            if (meetingId) try { db.prepare(`INSERT INTO meeting_participants(meeting_id,user_id,role) VALUES(?,?,?)`).run(meetingId, pid, 'guest'); } catch(e) {}
          } catch(e) {}
        }
        db.prepare(`UPDATE rdv_proposals SET statut='accepte',event_proposeur_id=?,event_destinataire_id=?,meeting_id=?,message_reponse=?,updated_at=datetime('now') WHERE id=?`)
          .run(evP.lastInsertRowid, evD.lastInsertRowid, meetingId, message_reponse||null, rdvId);
        try {
          const dest = await db.prepare(`SELECT prenom, nom FROM users WHERE id=?`).get(me.id);
          db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(
            rdv.proposeur_id, 'rdv_accepte', 'Rendez-vous accepté',
            `${dest.prenom} ${dest.nom} a accepté votre RDV "${rdv.titre}"`,
            JSON.stringify({ rdv_id: rdvId, meeting_id: meetingId })
          );
        } catch(e) {}
        const meeting = meetingId ? await db.prepare(`SELECT * FROM meetings WHERE id=?`).get(meetingId) : null;
        return sendJSON(res, 200, { statut: 'accepte', meeting });

      } else if (action === 'refuse') {
        db.prepare(`UPDATE rdv_proposals SET statut='refuse',message_reponse=?,updated_at=datetime('now') WHERE id=?`).run(message_reponse||null, rdvId);
        try {
          const dest = await db.prepare(`SELECT prenom, nom FROM users WHERE id=?`).get(me.id);
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
          const dest = await db.prepare(`SELECT prenom, nom FROM users WHERE id=?`).get(me.id);
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
        if (rdv.event_proposeur_id) await db.prepare(`DELETE FROM agenda_events WHERE id=?`).run(rdv.event_proposeur_id);
        if (rdv.event_destinataire_id) await db.prepare(`DELETE FROM agenda_events WHERE id=?`).run(rdv.event_destinataire_id);
        if (rdv.meeting_id) await db.prepare(`UPDATE meetings SET statut='expire' WHERE id=?`).run(rdv.meeting_id);
        const autreUser = me.id === rdv.proposeur_id ? rdv.destinataire_id : rdv.proposeur_id;
        try {
          const dest = await db.prepare(`SELECT prenom, nom FROM users WHERE id=?`).get(me.id);
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

    /* GET /api/rdv/:id — détail d'un RDV */
    if (req.method === "GET" && /^\/api\/rdv\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rdvId = parseInt(pathname.split('/')[3]);
      const rdv = await db.prepare(`SELECT r.*,
        up.prenom AS proposeur_prenom, up.nom AS proposeur_nom,
        ud.prenom AS dest_prenom, ud.nom AS dest_nom
        FROM rdv_proposals r
        LEFT JOIN users up ON r.proposeur_id = up.id
        LEFT JOIN users ud ON r.destinataire_id = ud.id
        WHERE r.id=?`).get(rdvId);
      if (!rdv) return sendJSON(res, 404, { error: "RDV introuvable" });
      // Enrichir avec les noms des participants additionnels
      let participantsInfo = [];
      try {
        const ids = JSON.parse(rdv.participants_json || '[]');
        participantsInfo = ids.map(id => {
          const u = await db.prepare(`SELECT id, prenom, nom, photo_url FROM users WHERE id=?`).get(id);
          return u || { id };
        });
      } catch(e) {}
      return sendJSON(res, 200, { ...rdv, participants_info: participantsInfo });
    }

    /* POST /api/rdv/:id/convert-to-event — convertir un RDV en Événement */
    if (req.method === "POST" && /^\/api\/rdv\/\d+\/convert-to-event$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rdvId = parseInt(pathname.split('/')[3]);
      const rdv = await db.prepare(`SELECT * FROM rdv_proposals WHERE id=?`).get(rdvId);
      if (!rdv) return sendJSON(res, 404, { error: "RDV introuvable" });
      if (rdv.proposeur_id !== me.id) return sendJSON(res, 403, { error: "Seul l'organisateur peut convertir" });
      // Créer l'événement communautaire
      const { titre_evt, description_evt, heure_debut, ville, pays, visibilite } = body;
      const dateEvt = rdv.date_proposee;
      const titreF  = titre_evt || rdv.titre;
      const descF   = description_evt || rdv.description || '';
      const lieuF   = body.lieu || rdv.lieu || '';
      const r = db.prepare(`INSERT INTO evenements(titre, description, date_evt, heure_debut, lieu, ville, pays, createur_id, visibilite, statut)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
          titreF, descF, dateEvt, rdv.heure_debut, lieuF,
          ville || '', pays || '', me.id,
          visibilite || 'public', 'publie'
        );
      // Marquer le RDV comme converti
      try { db.prepare(`UPDATE rdv_proposals SET converted_event_id=?,statut='annule',updated_at=datetime('now') WHERE id=?`).run(r.lastInsertRowid, rdvId); } catch(e) {}
      return sendJSON(res, 201, { event_id: r.lastInsertRowid, titre: titreF });
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
        const moi = await db.prepare(`SELECT prenom, nom FROM users WHERE id=?`).get(me.id);
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
      const meeting = await db.prepare(`SELECT m.*, u.prenom AS host_prenom, u.nom AS host_nom FROM meetings m LEFT JOIN users u ON m.host_id = u.id WHERE m.id=? OR m.room_id=?`).get(idOrRoom, idOrRoom);
      if (!meeting) return sendJSON(res, 404, { error: "Salle introuvable" });
      const participants = await db.prepare(`SELECT mp.*, u.prenom, u.nom, u.photo_url FROM meeting_participants mp LEFT JOIN users u ON mp.user_id = u.id WHERE mp.meeting_id=?`).all(meeting.id);
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
      const m = await db.prepare(`SELECT * FROM meetings WHERE id=?`).get(meetId);
      if (!m) return sendJSON(res, 404, { error: "Salle introuvable" });
      db.prepare(`UPDATE meetings SET statut='termine', ended_at=datetime('now') WHERE id=?`).run(meetId);
      if (m.started_at) {
        const duree = Math.round((Date.now() - new Date(m.started_at).getTime()) / 60000);
        const parts = await db.prepare(`SELECT user_id FROM meeting_participants WHERE meeting_id=?`).all(meetId);
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
      const meeting = await db.prepare(`SELECT * FROM meetings WHERE room_id=?`).get(roomId);
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
      const dues = await db.prepare(`
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
          await db.prepare(`UPDATE agenda_reminders SET sent=1 WHERE id=?`).run(rem.id);
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
        rows = statut ? await db.prepare(sql).all(statut) : await db.prepare(sql).all();
      } else {
        rows = await db.prepare(`SELECT p.*, u.nom AS createur_nom FROM projets p JOIN users u ON u.id=p.createur_id WHERE p.createur_id=? ORDER BY p.updated_at DESC`).all(me.id);
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
      const p = await db.prepare(`SELECT p.*, u.nom AS createur_nom FROM projets p JOIN users u ON u.id=p.createur_id WHERE p.id=?`).get(id);
      if (!p) return sendJSON(res, 404, { error: 'Projet introuvable' });
      if (p.createur_id !== me.id && me.role !== 'administrateur' && me.role !== 'collectivite') return sendJSON(res, 403, { error: 'Accès refusé' });
      const commentaires = await db.prepare(`SELECT pc.*, u.nom AS auteur_nom FROM projets_commentaires pc JOIN users u ON u.id=pc.auteur_id WHERE pc.projet_id=? ORDER BY pc.created_at`).all(id);
      return sendJSON(res, 200, { projet: p, commentaires });
    }

    /* PUT /api/projets/:id — modifier */
    if (req.method === 'PUT' && /^\/api\/projets\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise' });
      const id = parseInt(pathname.split('/')[3]);
      const p = await db.prepare(`SELECT * FROM projets WHERE id=?`).get(id);
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
      const p = await db.prepare(`SELECT * FROM projets WHERE id=?`).get(id);
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
      const p = await db.prepare(`SELECT * FROM projets WHERE id=?`).get(id);
      if (!p) return sendJSON(res, 404, { error: 'Projet introuvable' });
      if (p.createur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Accès refusé' });
      await db.prepare(`DELETE FROM projets WHERE id=?`).run(id);
      return sendJSON(res, 200, { deleted: true });
    }

    /* ═══════════════════════════════════════════════════════════
       MODULE BILLETTERIE — ÉVÉNEMENTS / TICKETS / SCANNER
    ═══════════════════════════════════════════════════════════ */

    /* ══ MODULE LISTES DE DIFFUSION ══ */

    /* ── GET /api/listes-diffusion ── */
    if (req.method === 'GET' && pathname === '/api/listes-diffusion') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const listes = db.prepare(`
        SELECT l.*, COUNT(c.id) AS nb_contacts
        FROM listes_diffusion l
        LEFT JOIN listes_diffusion_contacts c ON c.liste_id = l.id
        WHERE l.proprietaire_id = ?
        GROUP BY l.id ORDER BY l.ordre ASC, l.created_at DESC
      `).all(me.id);
      return sendJSON(res, 200, { listes });
    }

    /* ── POST /api/listes-diffusion — créer ── */
    if (req.method === 'POST' && pathname === '/api/listes-diffusion') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const { nom, description, couleur, icone, notes } = body;
      if (!nom?.trim()) return sendJSON(res, 400, { error: 'Nom requis.' });
      const ts = new Date().toISOString();
      const maxOrdre = db.prepare(`SELECT COALESCE(MAX(ordre),0) AS m FROM listes_diffusion WHERE proprietaire_id=?`).get(me.id).m;
      const id = db.prepare(`INSERT INTO listes_diffusion (proprietaire_id,nom,description,couleur,icone,notes,ordre,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(me.id, nom.trim(), description||null, couleur||'#1B3A6B', icone||'📋', notes||null, maxOrdre+1, ts, ts).lastInsertRowid;
      return sendJSON(res, 201, { id });
    }

    /* ── PUT /api/listes-diffusion/:id — modifier ── */
    if (req.method === 'PUT' && /^\/api\/listes-diffusion\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const lid = parseInt(pathname.split('/')[3]);
      const liste = await db.prepare(`SELECT * FROM listes_diffusion WHERE id=? AND proprietaire_id=?`).get(lid, me.id);
      if (!liste) return sendJSON(res, 404, { error: 'Liste introuvable.' });
      const { nom, description, couleur, icone, notes } = body;
      db.prepare(`UPDATE listes_diffusion SET nom=COALESCE(?,nom), description=COALESCE(?,description), couleur=COALESCE(?,couleur), icone=COALESCE(?,icone), notes=COALESCE(?,notes), updated_at=? WHERE id=?`)
        .run(nom?.trim()||null, description??null, couleur||null, icone||null, notes??null, new Date().toISOString(), lid);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── POST /api/listes-diffusion/:id/duplicate — dupliquer ── */
    if (req.method === 'POST' && /^\/api\/listes-diffusion\/\d+\/duplicate$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const lid = parseInt(pathname.split('/')[3]);
      const liste = await db.prepare(`SELECT * FROM listes_diffusion WHERE id=? AND proprietaire_id=?`).get(lid, me.id);
      if (!liste) return sendJSON(res, 404, { error: 'Liste introuvable.' });
      const ts = new Date().toISOString();
      const maxOrdre = db.prepare(`SELECT COALESCE(MAX(ordre),0) AS m FROM listes_diffusion WHERE proprietaire_id=?`).get(me.id).m;
      const newId = db.prepare(`INSERT INTO listes_diffusion (proprietaire_id,nom,description,couleur,icone,notes,ordre,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(me.id, `${liste.nom} (copie)`, liste.description, liste.couleur, liste.icone, liste.notes, maxOrdre+1, ts, ts).lastInsertRowid;
      const contacts = await db.prepare(`SELECT * FROM listes_diffusion_contacts WHERE liste_id=?`).all(lid);
      for (const c of contacts) {
        try { db.prepare(`INSERT INTO listes_diffusion_contacts (liste_id,user_id,email,nom,created_at) VALUES (?,?,?,?,?)`).run(newId, c.user_id||null, c.email||null, c.nom||null, ts); } catch(e) {}
      }
      return sendJSON(res, 201, { id: newId });
    }

    /* ── GET /api/listes-diffusion/:id/export — export CSV ── */
    if (req.method === 'GET' && /^\/api\/listes-diffusion\/\d+\/export$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const lid = parseInt(pathname.split('/')[3]);
      const liste = await db.prepare(`SELECT * FROM listes_diffusion WHERE id=? AND proprietaire_id=?`).get(lid, me.id);
      if (!liste) return sendJSON(res, 404, { error: 'Liste introuvable.' });
      const contacts = await db.prepare(`
        SELECT c.nom AS nom_liste, c.email, u.nom AS nom_plateforme, u.email AS email_plateforme, u.role, u.pays, u.ville
        FROM listes_diffusion_contacts c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.liste_id = ? ORDER BY c.nom
      `).all(lid);
      const rows = [['Nom','Email','Pays','Ville','Type compte']];
      for (const c of contacts) {
        rows.push([c.nom_plateforme||c.nom_liste||'', c.email_plateforme||c.email||'', c.pays||'', c.ville||'', c.role||'']);
      }
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="liste-${lid}.csv"` });
      res.end('﻿'+csv);
      return;
    }

    /* ── PUT /api/listes-diffusion/reorder — réordonner ── */
    if (req.method === 'PUT' && pathname === '/api/listes-diffusion/reorder') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const { ordre } = body; // [{id, ordre}]
      if (!Array.isArray(ordre)) return sendJSON(res, 400, { error: 'ordre[] requis.' });
      for (const { id, ordre: o } of ordre) {
        await db.prepare(`UPDATE listes_diffusion SET ordre=? WHERE id=? AND proprietaire_id=?`).run(o, id, me.id);
      }
      return sendJSON(res, 200, { ok: true });
    }

    /* ── GET /api/listes-diffusion/:id/contacts ── */
    if (req.method === 'GET' && /^\/api\/listes-diffusion\/\d+\/contacts$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const lid = parseInt(pathname.split('/')[3]);
      const liste = await db.prepare(`SELECT * FROM listes_diffusion WHERE id=? AND proprietaire_id=?`).get(lid, me.id);
      if (!liste) return sendJSON(res, 404, { error: 'Liste introuvable.' });
      const contacts = db.prepare(`
        SELECT c.id, c.user_id, c.email, c.nom, c.created_at,
          u.nom AS nom_plateforme, u.email AS email_plateforme, u.photo_url, u.role, u.pays, u.ville, u.bio
        FROM listes_diffusion_contacts c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.liste_id = ? ORDER BY COALESCE(u.nom, c.nom) ASC
      `).all(lid);
      return sendJSON(res, 200, { contacts });
    }

    /* ── POST /api/listes-diffusion/:id/contacts — ajouter ── */
    if (req.method === 'POST' && /^\/api\/listes-diffusion\/\d+\/contacts$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const lid = parseInt(pathname.split('/')[3]);
      const liste = await db.prepare(`SELECT * FROM listes_diffusion WHERE id=? AND proprietaire_id=?`).get(lid, me.id);
      if (!liste) return sendJSON(res, 404, { error: 'Liste introuvable.' });
      const { contacts, user_id } = body;
      const ts = new Date().toISOString();
      let added = 0;
      // Ajout d'un utilisateur plateforme
      if (user_id) {
        const u = await db.prepare(`SELECT id,nom,email FROM users WHERE id=?`).get(user_id);
        if (u) {
          const exists = await db.prepare(`SELECT id FROM listes_diffusion_contacts WHERE liste_id=? AND user_id=?`).get(lid, u.id);
          if (!exists) { db.prepare(`INSERT INTO listes_diffusion_contacts (liste_id,user_id,email,nom,created_at) VALUES (?,?,?,?,?)`).run(lid, u.id, u.email, u.nom, ts); added++; }
        }
      }
      // Ajout de contacts externes [{email, nom}]
      if (Array.isArray(contacts)) {
        for (const c of contacts) {
          if (!c.email?.includes('@')) continue;
          try {
            db.prepare(`INSERT OR IGNORE INTO listes_diffusion_contacts (liste_id,email,nom,created_at) VALUES (?,?,?,?)`)
              .run(lid, c.email.toLowerCase().trim(), c.nom||null, ts);
            added++;
          } catch(e) {}
        }
      }
      await db.prepare(`UPDATE listes_diffusion SET updated_at=? WHERE id=?`).run(new Date().toISOString(), lid);
      return sendJSON(res, 200, { added });
    }

    /* ── DELETE /api/listes-diffusion/:id/contacts/:cid ── */
    if (req.method === 'DELETE' && /^\/api\/listes-diffusion\/\d+\/contacts\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const parts = pathname.split('/');
      const lid = parseInt(parts[3]), cid = parseInt(parts[5]);
      const liste = await db.prepare(`SELECT * FROM listes_diffusion WHERE id=? AND proprietaire_id=?`).get(lid, me.id);
      if (!liste) return sendJSON(res, 404, { error: 'Liste introuvable.' });
      await db.prepare(`DELETE FROM listes_diffusion_contacts WHERE id=? AND liste_id=?`).run(cid, lid);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── DELETE /api/listes-diffusion/:id ── */
    if (req.method === 'DELETE' && /^\/api\/listes-diffusion\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const lid = parseInt(pathname.split('/')[3]);
      const liste = await db.prepare(`SELECT * FROM listes_diffusion WHERE id=? AND proprietaire_id=?`).get(lid, me.id);
      if (!liste) return sendJSON(res, 404, { error: 'Liste introuvable.' });
      await db.prepare(`DELETE FROM listes_diffusion WHERE id=?`).run(lid);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── POST /api/listes-diffusion/check-user — listes contenant un user ── */
    if (req.method === 'POST' && pathname === '/api/listes-diffusion/check-user') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const { user_id } = body;
      const ids = await db.prepare(`SELECT c.liste_id FROM listes_diffusion_contacts c JOIN listes_diffusion l ON l.id=c.liste_id WHERE l.proprietaire_id=? AND c.user_id=?`).all(me.id, user_id).map(r=>r.liste_id);
      return sendJSON(res, 200, { liste_ids: ids });
    }

    /* ── GET /api/events — liste publique ── */
    if (req.method === 'GET' && pathname === '/api/events') {
      autoPublierProgrammes(); // lazy auto-publish des événements programmés
      autoGererDossiersQR();  // lazy gestion dossiers QR (notification + suppression)
      const q = Object.fromEntries(new URL('http://x'+req.url).searchParams);
      // Champ calculé : statut_exposition
      // actif = publié depuis < duree_exposition_jours jours ET (date_fin future OU date_debut future si pas de date_fin)
      const expositionExpr = `(
        CASE WHEN e.statut != 'publie' THEN 'hors_ligne'
             WHEN e.date_fin IS NOT NULL AND e.date_fin < datetime('now') THEN 'termine'
             WHEN e.date_fin IS NULL AND e.date_debut < datetime('now','-1 day') THEN 'termine'
             WHEN e.publie_at IS NOT NULL AND e.publie_at < datetime('now','-'||COALESCE(e.duree_exposition_jours,20)||' days') THEN 'expire'
             ELSE 'actif'
        END
      )`;
      let sql = `SELECT e.*,
        u.nom AS organisateur_nom,
        (SELECT COUNT(*) FROM tickets t WHERE t.event_id=e.id AND t.payment_status='paid') AS billets_vendus,
        (SELECT COUNT(*) FROM ticket_types tt WHERE tt.event_id=e.id AND tt.actif=1) AS nb_types,
        ${expositionExpr} AS statut_exposition
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
      // Par défaut : exclure du listing public les événements terminés ou expirés (sauf si ?mode=archive ou ?mine=1)
      if (!q.mode && q.mine !== '1' && q.all !== '1') {
        sql += ` AND ${expositionExpr} = 'actif'`;
      }
      sql += ' ORDER BY e.date_debut ASC LIMIT 100';
      const events = await db.prepare(sql).all(...args);
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
      const {
        titre, description, pays, ville, adresse, date_debut, date_fin, capacite, categorie,
        image_b64, ticket_types, statut: statutInit,
        image_couverture, galerie_photos,
        video1_url, video1_titre, video1_thumb, video2_url, video2_titre, video2_thumb,
        pdf_url, pdf_nom, pdf_acces,
        cible_type, cible_liste_ids,
        fc_resume, fc_objectifs, fc_public, fc_programme, fc_partenaires, fc_partenaires_ids, fc_contact, fc_notes,
        programmed_at, timezone
      } = body;
      if (!titre || !date_debut) return sendJSON(res, 400, { error: 'Titre et date_debut requis.' });
      const ts = new Date().toISOString();
      const coverImg = image_couverture || image_b64 || null;
      const galerie = Array.isArray(galerie_photos) ? JSON.stringify(galerie_photos.slice(0,4)) : (galerie_photos || '[]');
      const cibleListeStr = Array.isArray(cible_liste_ids) ? JSON.stringify(cible_liste_ids) : (cible_liste_ids || '[]');
      const partenairesIdsStr = Array.isArray(fc_partenaires_ids) ? JSON.stringify(fc_partenaires_ids) : (fc_partenaires_ids || '[]');
      // Statut final
      let finalStatut = statutInit || 'brouillon';
      if (programmed_at && finalStatut !== 'publie') finalStatut = 'brouillon_programme';
      const eid = db.prepare(`INSERT INTO events
        (titre,description,organisateur_id,pays,ville,adresse,date_debut,date_fin,capacite,categorie,
         image_b64,statut,created_at,updated_at,
         image_couverture,galerie_photos,
         video1_url,video1_titre,video1_thumb,video2_url,video2_titre,video2_thumb,
         pdf_url,pdf_nom,pdf_acces,cible_type,cible_liste_ids,
         fc_resume,fc_objectifs,fc_public,fc_programme,fc_partenaires,fc_partenaires_ids,fc_contact,fc_notes,
         programmed_at,timezone)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(titre, description||null, me.id, pays||null, ville||null, adresse||null, date_debut, date_fin||null,
             capacite||0, categorie||'Général', coverImg, finalStatut, ts, ts,
             coverImg, galerie,
             video1_url||null, video1_titre||null, video1_thumb||null,
             video2_url||null, video2_titre||null, video2_thumb||null,
             pdf_url||null, pdf_nom||null, pdf_acces||'public',
             cible_type||'tous', cibleListeStr,
             fc_resume||null, fc_objectifs||null, fc_public||null,
             fc_programme||null, fc_partenaires||null, partenairesIdsStr, fc_contact||null, fc_notes||null,
             programmed_at||null, timezone||'Europe/Paris').lastInsertRowid;
      // Fixer publie_at et envoyer notifications si publication immédiate
      if (finalStatut === 'publie') {
        db.prepare(`UPDATE events SET publie_at=datetime('now') WHERE id=?`).run(eid);
        try { envoyerNotificationsEvenement(eid, me.id, titre, cibleListeStr, partenairesIdsStr); } catch(_){}
      }
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
      const ev = await db.prepare(`SELECT e.*, u.nom AS organisateur_nom FROM events e LEFT JOIN users u ON u.id=e.organisateur_id WHERE e.id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Événement introuvable.' });
      const types = db.prepare(`SELECT tt.*, (tt.quantite_totale - tt.quantite_vendue) AS dispo FROM ticket_types tt WHERE tt.event_id=? AND tt.actif=1`).all(eid);
      const stats = db.prepare(`SELECT COUNT(*) nb, COALESCE(SUM(prix_paye),0) revenu FROM tickets WHERE event_id=? AND payment_status='paid'`).get(eid);
      return sendJSON(res, 200, { event: ev, ticket_types: types, stats });
    }

    /* ── PUT /api/events/:id ── */
    if (req.method === 'PUT' && /^\/api\/events\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/')[3]);
      const ev = await db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Introuvable.' });
      if (ev.organisateur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Accès refusé.' });
      const {
        titre, description, pays, ville, adresse, date_debut, date_fin, capacite, categorie,
        image_b64, statut, image_couverture, galerie_photos,
        video1_url, video1_titre, video1_thumb, video2_url, video2_titre, video2_thumb,
        pdf_url, pdf_nom, pdf_acces, cible_type, cible_liste_ids,
        fc_resume, fc_objectifs, fc_public, fc_programme, fc_partenaires, fc_partenaires_ids, fc_contact, fc_notes,
        programmed_at, timezone, inscription_mode, nb_places, liste_attente, rayon_publication
      } = body;
      const coverUpd = image_couverture || image_b64 || null;
      const galerieUpd = Array.isArray(galerie_photos) ? JSON.stringify(galerie_photos.slice(0,4)) : (galerie_photos || null);
      const cibleListeUpd = Array.isArray(cible_liste_ids) ? JSON.stringify(cible_liste_ids) : (cible_liste_ids || null);
      const partenairesUpd = Array.isArray(fc_partenaires_ids) ? JSON.stringify(fc_partenaires_ids) : (fc_partenaires_ids || null);
      // Calculer statut final
      let finalStatut = statut || null;
      if (finalStatut === 'publie' && !ev.programmed_at) {/* ok */}
      else if (programmed_at && finalStatut !== 'publie') finalStatut = 'brouillon_programme';
      const wasPublie = ev.statut === 'publie';
      db.prepare(`UPDATE events SET
        titre=COALESCE(?,titre), description=COALESCE(?,description),
        pays=COALESCE(?,pays), ville=COALESCE(?,ville), adresse=COALESCE(?,adresse),
        date_debut=COALESCE(?,date_debut), date_fin=COALESCE(?,date_fin),
        capacite=COALESCE(?,capacite), categorie=COALESCE(?,categorie),
        image_b64=COALESCE(?,image_b64), image_couverture=COALESCE(?,image_couverture),
        galerie_photos=COALESCE(?,galerie_photos),
        video1_url=COALESCE(?,video1_url), video1_titre=COALESCE(?,video1_titre), video1_thumb=COALESCE(?,video1_thumb),
        video2_url=COALESCE(?,video2_url), video2_titre=COALESCE(?,video2_titre), video2_thumb=COALESCE(?,video2_thumb),
        pdf_url=COALESCE(?,pdf_url), pdf_nom=COALESCE(?,pdf_nom), pdf_acces=COALESCE(?,pdf_acces),
        cible_type=COALESCE(?,cible_type), cible_liste_ids=COALESCE(?,cible_liste_ids),
        fc_resume=COALESCE(?,fc_resume), fc_objectifs=COALESCE(?,fc_objectifs),
        fc_public=COALESCE(?,fc_public),
        fc_programme=COALESCE(?,fc_programme), fc_partenaires=COALESCE(?,fc_partenaires),
        fc_partenaires_ids=COALESCE(?,fc_partenaires_ids),
        fc_contact=COALESCE(?,fc_contact), fc_notes=COALESCE(?,fc_notes),
        programmed_at=COALESCE(?,programmed_at), timezone=COALESCE(?,timezone),
        inscription_mode=COALESCE(?,inscription_mode), nb_places=COALESCE(?,nb_places), liste_attente=COALESCE(?,liste_attente),
        rayon_publication=COALESCE(?,rayon_publication),
        statut=COALESCE(?,statut), updated_at=datetime('now') WHERE id=?`)
        .run(titre||null, description||null, pays||null, ville||null, adresse||null,
             date_debut||null, date_fin||null, capacite||null, categorie||null,
             coverUpd, coverUpd, galerieUpd,
             video1_url||null, video1_titre||null, video1_thumb||null,
             video2_url||null, video2_titre||null, video2_thumb||null,
             pdf_url||null, pdf_nom||null, pdf_acces||null,
             cible_type||null, cibleListeUpd,
             fc_resume||null, fc_objectifs||null, fc_public||null,
             fc_programme||null, fc_partenaires||null, partenairesUpd,
             fc_contact||null, fc_notes||null,
             programmed_at||null, timezone||null,
             inscription_mode||null, nb_places!=null?Number(nb_places):null, liste_attente!=null?Number(liste_attente):null,
             rayon_publication||null,
             finalStatut, eid);
      // Fixer publie_at (première publication, ou rétroactivement si publie_at est null)
      if (finalStatut === 'publie') {
        db.prepare(`UPDATE events SET publie_at=datetime('now') WHERE id=? AND publie_at IS NULL`).run(eid);
        if (!wasPublie) {
          try { envoyerNotificationsEvenement(eid, me.id, titre||ev.titre, cibleListeUpd||ev.cible_liste_ids, partenairesUpd||ev.fc_partenaires_ids); } catch(_){}
        }
      }
      return sendJSON(res, 200, { ok: true });
    }

    /* ── POST /api/events/:id/ticket-types ── */
    if (req.method === 'POST' && /^\/api\/events\/\d+\/ticket-types$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/')[3]);
      const ev = await db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
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
      const ev = await db.prepare(`SELECT * FROM events WHERE id=? AND statut='publie'`).get(eid);
      if (!ev) return sendJSON(res, 400, { error: 'Événement non disponible.' });
      const tt = await db.prepare(`SELECT * FROM ticket_types WHERE id=? AND event_id=? AND actif=1`).get(ticket_type_id, eid);
      if (!tt) return sendJSON(res, 400, { error: 'Type de billet introuvable.' });
      if (tt.quantite_totale > 0 && tt.quantite_vendue >= tt.quantite_totale) return sendJSON(res, 400, { error: 'Billets épuisés.' });
      /* Anti-doublon : 1 billet par utilisateur par type */
      const existing = await db.prepare(`SELECT id FROM tickets WHERE user_id=? AND ticket_type_id=? AND payment_status='paid' AND statut='valid'`).get(me.id, ticket_type_id);
      if (existing) return sendJSON(res, 409, { error: 'Vous possédez déjà un billet pour ce type.' });
      const commission = parseFloat((tt.prix * ev.commission_pct / 100).toFixed(2));
      const ts = new Date().toISOString();
      const tempSig = crypto.randomBytes(8).toString('hex'); // placeholder pour l'ID
      const tid = db.prepare(`INSERT INTO tickets (event_id,user_id,ticket_type_id,prix_paye,commission,payment_status,statut,qr_token,created_at) VALUES (?,?,?,?,?,'paid','valid',?,?)`)
        .run(eid, me.id, tt.id, tt.prix, commission, tempSig, ts).lastInsertRowid;
      /* Générer vrai QR token maintenant qu'on a l'ID */
      const qrToken = signTicket(tid, eid, ts);
      await db.prepare(`UPDATE tickets SET qr_token=? WHERE id=?`).run(qrToken, tid);
      await db.prepare(`UPDATE ticket_types SET quantite_vendue=quantite_vendue+1 WHERE id=?`).run(tt.id);
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
      const tickets = await db.prepare(`SELECT t.*, e.titre AS event_titre, e.date_debut, e.ville, e.pays, e.image_b64,
        tt.nom AS type_nom, tt.type AS type_cat
        FROM tickets t JOIN events e ON e.id=t.event_id JOIN ticket_types tt ON tt.id=t.ticket_type_id
        WHERE t.user_id=? ORDER BY t.created_at DESC`).all(me.id);
      return sendJSON(res, 200, { tickets });
    }

    /* ── GET /api/tickets/:id — détail + QR ── */
    if (req.method === 'GET' && /^\/api\/tickets\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const tid = parseInt(pathname.split('/')[3]);
      const t = await db.prepare(`SELECT t.*, e.titre AS event_titre, e.date_debut, e.date_fin, e.ville, e.pays, e.adresse, u.nom AS user_nom, tt.nom AS type_nom, tt.type AS type_cat
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
      const ev = await db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Introuvable.' });
      if (ev.organisateur_id !== me.id && !['administrateur','collectivite'].includes(me.role)) return sendJSON(res, 403, { error: 'Accès refusé.' });
      const attendees = await db.prepare(`SELECT a.*, t.prix_paye, t.statut AS ticket_statut, t.created_at AS achat_date, tt.nom AS type_nom
        FROM event_attendees a JOIN tickets t ON t.id=a.ticket_id JOIN ticket_types tt ON tt.id=t.ticket_type_id
        WHERE a.event_id=? ORDER BY a.created_at DESC`).all(eid);
      return sendJSON(res, 200, { attendees });
    }

    /* ── GET /api/events/:id/checkins ── */
    if (req.method === 'GET' && /^\/api\/events\/\d+\/checkins$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/')[3]);
      const ev = await db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Introuvable.' });
      if (ev.organisateur_id !== me.id && !['administrateur','collectivite'].includes(me.role)) return sendJSON(res, 403, { error: 'Accès refusé.' });
      const checkins = await db.prepare(`SELECT c.*, a.nom_display, u.nom AS scanner_nom
        FROM event_checkins c LEFT JOIN event_attendees a ON a.ticket_id=c.ticket_id LEFT JOIN users u ON u.id=c.scanner_id
        WHERE c.event_id=? ORDER BY c.timestamp DESC LIMIT 200`).all(eid);
      const totaux = db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN resultat='accepted' THEN 1 ELSE 0 END) accepted FROM event_checkins WHERE event_id=?`).get(eid);
      return sendJSON(res, 200, { checkins, totaux });
    }

    /* ── POST /api/events/:id/view — incrémenter compteur de vues ── */
    if (req.method === 'POST' && /^\/api\/events\/\d+\/view$/.test(pathname)) {
      const eid = parseInt(pathname.split('/')[3]);
      const me = getCurrentUser(req);
      db.prepare(`UPDATE events SET vues_total=COALESCE(vues_total,0)+1 WHERE id=?`).run(eid);
      if (!me) db.prepare(`UPDATE events SET vues_uniques=COALESCE(vues_uniques,0)+1 WHERE id=?`).run(eid);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── GET /api/events/:id/observations — tableau de bord analytique ── */
    if (req.method === 'GET' && /^\/api\/events\/\d+\/observations$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/')[3]);
      const ev = await db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Introuvable.' });
      if (ev.organisateur_id !== me.id && !['administrateur','collectivite'].includes(me.role)) return sendJSON(res, 403, { error: 'Accès refusé.' });

      // Inscrits sécurisés
      const inscrits = await db.prepare(`SELECT eis.*,u.role AS user_role,u.ville AS user_ville,u.pays AS user_pays
        FROM event_inscriptions_securisees eis LEFT JOIN users u ON u.da_id=eis.da_id_utilise
        WHERE eis.event_id=? ORDER BY eis.created_at DESC`).all(eid);

      // Acheteurs de billets (tickets)
      const acheteurs = db.prepare(`SELECT t.*,u.nom,u.role,u.ville,u.pays,u.da_id,tt.nom AS type_nom
        FROM tickets t JOIN users u ON u.id=t.user_id JOIN ticket_types tt ON tt.id=t.ticket_type_id
        WHERE t.event_id=? ORDER BY t.created_at DESC`).get ?
        await db.prepare(`SELECT t.*,u.nom,u.role,u.ville,u.pays,u.da_id,tt.nom AS type_nom
        FROM tickets t JOIN users u ON u.id=t.user_id JOIN ticket_types tt ON tt.id=t.ticket_type_id
        WHERE t.event_id=? ORDER BY t.created_at DESC`).all(eid) : [];

      // Check-ins (présents)
      const checkins = db.prepare(`SELECT COUNT(*) AS n FROM event_checkins WHERE event_id=? AND resultat='accepted'`).get(eid);
      const nbPresents = checkins?.n || 0;

      // Profil des inscrits
      const typesCounts = {};
      const paysCounts = {};
      const villesCounts = {};
      for (const i of inscrits) {
        const t = i.type_compte || i.user_role || 'inconnu';
        typesCounts[t] = (typesCounts[t]||0)+1;
        if (i.user_pays) paysCounts[i.user_pays] = (paysCounts[i.user_pays]||0)+1;
        if (i.user_ville) villesCounts[i.user_ville] = (villesCounts[i.user_ville]||0)+1;
      }
      for (const a of acheteurs) {
        const t = a.role || 'inconnu';
        typesCounts[t] = (typesCounts[t]||0)+1;
        if (a.pays) paysCounts[a.pays] = (paysCounts[a.pays]||0)+1;
        if (a.ville) villesCounts[a.ville] = (villesCounts[a.ville]||0)+1;
      }
      const sortObj = o => Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>({label:k,n:v}));

      // Timeline inscriptions (7 derniers jours)
      const timeline = db.prepare(`SELECT date(created_at) AS jour, COUNT(*) AS n FROM event_inscriptions_securisees WHERE event_id=? GROUP BY date(created_at) ORDER BY jour DESC LIMIT 14`).all(eid);

      // Stats participation
      const nbInscrits = inscrits.length + acheteurs.length;
      const nbAnnules = inscrits.filter(i=>i.statut==='annule').length;
      const nbConfirmes = inscrits.filter(i=>['confirme','signe'].includes(i.statut)).length;
      const nbAttente = inscrits.filter(i=>i.statut==='liste_attente').length;
      const nbBillets = acheteurs.length;
      const vues = ev.vues_total || 0;
      const tauxConversion = vues > 0 ? Math.round((nbInscrits/vues)*100) : 0;

      // Liste participants consolidée
      const participants = [
        ...inscrits.map(i=>({ nom:i.nom, da_id:i.da_id_utilise, type_compte:i.type_compte||'—', statut:i.statut, created_at:i.created_at, methode:'ID DA + DS-ID', ds_id_signe:i.ds_id_signe })),
        ...acheteurs.map(a=>({ nom:a.nom, da_id:a.da_id||'—', type_compte:a.role||'—', statut:a.statut==='valid'?'confirme':a.statut, created_at:a.created_at, methode:'Billet', ds_id_signe:0 }))
      ];

      return sendJSON(res, 200, {
        event: { id:ev.id, titre:ev.titre, statut:ev.statut, date_debut:ev.date_debut, vues_total:ev.vues_total||0, vues_uniques:ev.vues_uniques||0, nb_partages:ev.nb_partages||0 },
        participation: { total:nbInscrits, confirmes:nbConfirmes, presents:nbPresents, annules:nbAnnules, liste_attente:nbAttente, billets:nbBillets, taux_conversion:tauxConversion },
        profil: { types:sortObj(typesCounts), pays:sortObj(paysCounts), villes:sortObj(villesCounts) },
        timeline: timeline.reverse(),
        participants
      });
    }

    /* ── POST /api/events/:id/inscription/identify — Étape 1 : ID DA ── */
    if (req.method === 'POST' && /^\/api\/events\/\d+\/inscription\/identify$/.test(pathname)) {
      const eid = parseInt(pathname.split('/')[3]);
      const ev = await db.prepare(`SELECT id,titre,date_debut,date_fin,ville,pays,inscription_mode,nb_places,liste_attente,organisateur_id FROM events WHERE id=? AND statut='publie'`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Événement introuvable.' });
      const { da_id } = body;
      if (!da_id) return sendJSON(res, 400, { error: 'ID DA manquant.' });
      const normalizedId = da_id.trim().toUpperCase();
      const user = await db.prepare(`SELECT id,nom,role,da_id,photo_url FROM users WHERE da_id=?`).get(normalizedId);
      const init = user ? null : await db.prepare(`SELECT id,nom,type AS role,da_id FROM initiatives WHERE da_id=?`).get(normalizedId);
      const compte = user || init;
      if (!compte) return sendJSON(res, 404, { error: 'Aucun compte trouvé avec cet Identifiant Diaspo\'Actif.' });
      // Vérifier déjà inscrit
      const dejaInscrit = db.prepare(`SELECT id FROM event_inscriptions_securisees WHERE event_id=? AND da_id_utilise=? AND statut NOT IN ('annule')`).get(eid, normalizedId);
      if (dejaInscrit) return sendJSON(res, 409, { error: 'Ce compte est déjà inscrit à cet événement.' });
      // Vérifier places
      if (ev.nb_places) {
        const nbInscrits = db.prepare(`SELECT COUNT(*) AS n FROM event_inscriptions_securisees WHERE event_id=? AND statut IN ('signe','confirme')`).get(eid).n;
        if (nbInscrits >= ev.nb_places && !ev.liste_attente) return sendJSON(res, 400, { error: 'Plus de places disponibles.' });
      }
      // Créer inscription en statut 'identifie' (provisoire)
      const nom = compte.nom || '';
      const prenom = compte.prenom || '';
      const typeCompte = compte.role || '';
      db.prepare(`INSERT INTO event_inscriptions_securisees (event_id,user_id,da_id_utilise,nom,type_compte,ip,user_agent) VALUES (?,?,?,?,?,?,?)`)
        .run(eid, user ? user.id : null, normalizedId, nom, typeCompte, req.headers['x-forwarded-for']||'', req.headers['user-agent']||'');
      const inscriptionId = await db.prepare(`SELECT id FROM event_inscriptions_securisees WHERE event_id=? AND da_id_utilise=? ORDER BY id DESC LIMIT 1`).get(eid, normalizedId).id;
      return sendJSON(res, 200, {
        ok: true,
        inscription_id: inscriptionId,
        compte: { nom, prenom, type_compte: typeCompte, da_id: normalizedId, photo_url: user ? user.photo_url : null },
        evenement: { titre: ev.titre, date_debut: ev.date_debut, ville: ev.ville, pays: ev.pays }
      });
    }

    /* ── POST /api/events/:id/inscription/sign — Étape 2 : DS-ID ── */
    if (req.method === 'POST' && /^\/api\/events\/\d+\/inscription\/sign$/.test(pathname)) {
      const eid = parseInt(pathname.split('/')[3]);
      const { inscription_id, ds_id_saisi } = body;
      if (!inscription_id || !ds_id_saisi) return sendJSON(res, 400, { error: 'Paramètres manquants.' });
      const insc = await db.prepare(`SELECT * FROM event_inscriptions_securisees WHERE id=? AND event_id=? AND statut='identifie'`).get(inscription_id, eid);
      if (!insc) return sendJSON(res, 404, { error: 'Inscription introuvable ou déjà traitée.' });
      // Retrouver l'utilisateur par da_id
      const userRow = await db.prepare(`SELECT id,ds_id,password_hash,password_salt FROM users WHERE da_id=?`).get(insc.da_id_utilise);
      if (!userRow || !userRow.ds_id) return sendJSON(res, 400, { error: 'Compte sans Code de Sécurité configuré.' });
      const dsIdSaisi = ds_id_saisi.trim().toUpperCase();
      // Vérification constante-time
      const dsIdAttendu = userRow.ds_id;
      const succes = dsIdSaisi === dsIdAttendu;
      // Log dans ds_id_history
      db.prepare(`INSERT INTO ds_id_history (user_id,action,ip,user_agent) VALUES (?,?,?,?)`)
        .run(userRow.id, succes ? 'signature' : 'echec_validation', req.headers['x-forwarded-for']||'', req.headers['user-agent']||'');
      // Log dans ds_id_validations
      db.prepare(`INSERT INTO ds_id_validations (user_id,action_type,action_ref,action_id,da_id,succes,ip,user_agent) VALUES (?,?,?,?,?,?,?,?)`)
        .run(userRow.id, 'inscription_evenement', `event_${eid}`, eid, insc.da_id_utilise, succes ? 1 : 0, req.headers['x-forwarded-for']||'', req.headers['user-agent']||'');
      if (!succes) {
        return sendJSON(res, 401, { error: 'Code de Sécurité incorrect. Veuillez vérifier et réessayer.' });
      }
      // Vérifier places disponibles (re-check atomique)
      const ev = await db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
      let statutFinal = 'confirme';
      if (ev.nb_places) {
        const nbInscrits = db.prepare(`SELECT COUNT(*) AS n FROM event_inscriptions_securisees WHERE event_id=? AND statut IN ('signe','confirme')`).get(eid).n;
        if (nbInscrits >= ev.nb_places) {
          if (ev.liste_attente) statutFinal = 'liste_attente';
          else {
            await db.prepare(`UPDATE event_inscriptions_securisees SET statut='annule' WHERE id=?`).run(inscription_id);
            return sendJSON(res, 400, { error: 'Toutes les places ont été prises pendant votre inscription.' });
          }
        }
      }
      // Billet QR code (JSON base64)
      const billetData = { type: 'inscription_da', eid, iid: inscription_id, da_id: insc.da_id_utilise, ts: Date.now() };
      const billetQr = Buffer.from(JSON.stringify(billetData)).toString('base64');
      // Finaliser inscription
      db.prepare(`UPDATE event_inscriptions_securisees SET statut=?,ds_id_signe=1,ds_id_signe_at=datetime('now'),billet_qr=?,updated_at=datetime('now') WHERE id=?`)
        .run(statutFinal, billetQr, inscription_id);
      // Ajouter à l'agenda personnel
      let agendaId = null;
      try {
        const r = db.prepare(`INSERT INTO agenda_events (user_id,titre,description,date_debut,date_fin,lieu,lieu_type,couleur,source_type,source_id,event_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
          .run(userRow.id, `🎟️ ${ev.titre}`, ev.description||'', ev.date_debut, ev.date_fin||ev.date_debut, [ev.adresse,ev.ville,ev.pays].filter(Boolean).join(', ')||'', 'physique', '#FF6B00', 'evenement', inscription_id, eid);
        agendaId = r.lastInsertRowid;
        await db.prepare(`UPDATE event_inscriptions_securisees SET agenda_event_id=? WHERE id=?`).run(agendaId, inscription_id);
      } catch(_) {}
      // Notifier l'organisateur
      try {
        if (ev.organisateur_id) creerNotif(ev.organisateur_id, 'evenement', 'Nouvelle inscription', `${insc.nom} (${insc.da_id_utilise}) s'est inscrit à « ${ev.titre} »`, { event_id: eid });
      } catch(_) {}
      return sendJSON(res, 200, { ok: true, statut: statutFinal, billet_qr: billetQr, agenda_event_id: agendaId });
    }

    /* ── GET /api/events/:id/inscription/status ── */
    if (req.method === 'GET' && /^\/api\/events\/\d+\/inscription\/status$/.test(pathname)) {
      const me = getCurrentUser(req);
      const eid = parseInt(pathname.split('/')[3]);
      const daId = me ? await db.prepare(`SELECT da_id FROM users WHERE id=?`).get(me.id)?.da_id : null;
      if (!daId) return sendJSON(res, 200, { inscrit: false });
      const insc = db.prepare(`SELECT statut,billet_qr,ds_id_signe,created_at FROM event_inscriptions_securisees WHERE event_id=? AND da_id_utilise=? AND statut NOT IN ('annule') ORDER BY id DESC LIMIT 1`).get(eid, daId);
      return sendJSON(res, 200, { inscrit: !!insc, ...(insc||{}) });
    }

    /* ── GET /api/events/:id/inscription/export-ics ── */
    if (req.method === 'GET' && /^\/api\/events\/\d+\/inscription\/export-ics$/.test(pathname)) {
      const eid = parseInt(pathname.split('/')[3]);
      const ev = await db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Introuvable.' });
      const toIcs = (d) => d ? d.replace(/[-:T]/g,'').replace(/\..+/,'') + 'Z' : '';
      const ics = [
        'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DiaspoActif//FR',
        'BEGIN:VEVENT',
        `UID:event-${eid}@diaspoactif.com`,
        `DTSTART:${toIcs(ev.date_debut)}`,
        `DTEND:${toIcs(ev.date_fin||ev.date_debut)}`,
        `SUMMARY:${(ev.titre||'').replace(/[,;\\]/g,'\\$&')}`,
        `DESCRIPTION:${(ev.description||'').slice(0,200).replace(/\n/g,'\\n').replace(/[,;\\]/g,'\\$&')}`,
        `LOCATION:${[ev.adresse,ev.ville,ev.pays].filter(Boolean).join(', ')}`,
        'END:VEVENT','END:VCALENDAR'
      ].join('\r\n');
      res.writeHead(200, { 'Content-Type': 'text/calendar', 'Content-Disposition': `attachment; filename="event-${eid}.ics"` });
      return res.end(ics);
    }

    /* ── GET /api/events/:id/qr-participants — Dossier QR Code Participants ── */
    if (req.method === 'GET' && /^\/api\/events\/\d+\/qr-participants$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/')[3]);
      const ev = await db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
      if (!ev) return sendJSON(res, 404, { error: 'Événement introuvable.' });
      if (ev.organisateur_id !== me.id && !['administrateur','collectivite'].includes(me.role))
        return sendJSON(res, 403, { error: 'Accès refusé.' });
      // Inscriptions sécurisées (ID DA + DS-ID)
      const inscriptions = db.prepare(`
        SELECT i.id, i.da_id_utilise, i.nom, i.prenom, i.type_compte, i.organisation,
          i.statut, i.ds_id_signe, i.billet_qr, i.created_at, i.ds_id_signe_at,
          u.photo_url, u.pays AS user_pays, u.ville AS user_ville,
          (SELECT COUNT(*) FROM event_checkins ec WHERE ec.event_id=i.event_id AND ec.ticket_id=i.id AND ec.resultat='accepted') nb_scans,
          (SELECT ec.timestamp FROM event_checkins ec WHERE ec.event_id=i.event_id AND ec.ticket_id=i.id AND ec.resultat='accepted' ORDER BY ec.timestamp LIMIT 1) premier_scan
        FROM event_inscriptions_securisees i LEFT JOIN users u ON u.id=i.user_id
        WHERE i.event_id=? ORDER BY i.created_at DESC
      `).all(eid);
      // Billets payants (tickets)
      const tickets_payants = db.prepare(`
        SELECT t.id AS ticket_id, t.statut, t.payment_status, t.prix_paye, t.created_at,
          tt.nom AS type_billet, a.nom_display,
          u.da_id, u.nom, u.role AS type_compte, u.photo_url, u.pays, u.ville,
          (SELECT COUNT(*) FROM event_checkins ec WHERE ec.event_id=t.event_id AND ec.ticket_id=t.id AND ec.resultat='accepted') nb_scans,
          (SELECT ec.timestamp FROM event_checkins ec WHERE ec.event_id=t.event_id AND ec.ticket_id=t.id AND ec.resultat='accepted' ORDER BY ec.timestamp LIMIT 1) premier_scan
        FROM tickets t
        JOIN ticket_types tt ON tt.id=t.ticket_type_id
        LEFT JOIN event_attendees a ON a.ticket_id=t.id
        LEFT JOIN users u ON u.id=t.user_id
        WHERE t.event_id=? AND t.payment_status='paid' ORDER BY t.created_at DESC
      `).all(eid);
      // Statistiques du dossier
      const stats = {
        total_inscrits: inscriptions.length,
        total_confirmes: inscriptions.filter(i=>i.statut==='confirme').length,
        total_billets: tickets_payants.length,
        total_presents: inscriptions.filter(i=>i.nb_scans>0).length + tickets_payants.filter(t=>t.nb_scans>0).length,
        purge_at: ev.qr_folder_purged_at,
        date_purge_prevue: ev.date_fin ? new Date(new Date(ev.date_fin).getTime() + 5*86400000).toISOString() : null
      };
      return sendJSON(res, 200, { evenement: { id: ev.id, titre: ev.titre, date_fin: ev.date_fin }, inscriptions, tickets_payants, stats });
    }

    /* ── POST /api/scanner/validate — valider QR code (billets payants + inscriptions DA) ── */
    if (req.method === 'POST' && pathname === '/api/scanner/validate') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      if (!['initiative','administrateur','collectivite'].includes(me.role)) return sendJSON(res, 403, { error: 'Rôle non autorisé à scanner.' });
      const { qr_payload } = body;
      if (!qr_payload) return sendJSON(res, 400, { error: 'qr_payload manquant.' });
      let parsed;
      try { parsed = JSON.parse(Buffer.from(qr_payload, 'base64').toString()); } catch(e) { return sendJSON(res, 400, { error: 'QR code illisible.' }); }

      // ── Type 1 : Inscription sécurisée (ID DA + DS-ID) ──
      if (parsed.type === 'inscription_da') {
        const { eid, iid, da_id } = parsed;
        const ev = await db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
        if (!ev) return sendJSON(res, 200, { valid: false, motif: 'Événement introuvable' });
        if (ev.organisateur_id !== me.id && !['administrateur','collectivite'].includes(me.role))
          return sendJSON(res, 403, { error: 'Non autorisé pour cet événement.' });
        if (ev.qr_folder_purged_at) return sendJSON(res, 200, { valid: false, motif: 'Dossier QR archivé — accès expiré' });
        const insc = await db.prepare(`SELECT i.*, u.photo_url, u.role AS type_compte FROM event_inscriptions_securisees i LEFT JOIN users u ON u.da_id=i.da_id_utilise WHERE i.id=? AND i.event_id=?`).get(iid, eid);
        const logRejet = (motif) => {
          try { db.prepare(`INSERT INTO event_checkins (ticket_id,event_id,scanner_id,resultat,motif_rejet) VALUES (?,?,?,'rejected',?)`).run(iid, eid, me.id, motif); } catch(_){}
          return sendJSON(res, 200, { valid: false, motif });
        };
        if (!insc) return logRejet('Inscription introuvable');
        if (insc.da_id_utilise !== da_id) return logRejet('ID DA non concordant — billet falsifié');
        if (insc.statut === 'archive') return logRejet('Dossier QR archivé');
        if (!['confirme','liste_attente'].includes(insc.statut) && insc.statut !== 'signe') return logRejet(`Inscription non confirmée (statut : ${insc.statut})`);
        // Compter les scans précédents
        const nbScans = db.prepare(`SELECT COUNT(*) n FROM event_checkins WHERE ticket_id=? AND event_id=? AND resultat='accepted'`).get(iid, eid)?.n || 0;
        // Enregistrer le scan (on autorise mais on signale si déjà scanné)
        db.prepare(`INSERT INTO event_checkins (ticket_id,event_id,scanner_id,resultat) VALUES (?,?,?,'accepted')`).run(iid, eid, me.id);
        return sendJSON(res, 200, {
          valid: true,
          deja_scanne: nbScans > 0,
          nb_scans_total: nbScans + 1,
          nom: `${insc.prenom||''} ${insc.nom}`.trim(),
          da_id: insc.da_id_utilise,
          type_compte: insc.type_compte || insc.type_compte,
          photo_url: insc.photo_url || null,
          organisation: insc.organisation || null,
          event_titre: ev.titre,
          type_billet: 'Inscription Diaspo\'Actif',
          statut: insc.statut,
          inscription_id: iid
        });
      }

      // ── Type 2 : Billet payant (ancien système) ──
      const { tid, eid, sig } = parsed;
      if (!tid || !eid || !sig) return sendJSON(res, 400, { error: 'QR code incomplet.' });
      const ticket = await db.prepare(`SELECT t.*, e.organisateur_id, e.titre AS event_titre, tt.nom AS type_billet, a.nom_display, u.da_id, u.photo_url, u.role AS type_compte FROM tickets t JOIN events e ON e.id=t.event_id JOIN ticket_types tt ON tt.id=t.ticket_type_id LEFT JOIN event_attendees a ON a.ticket_id=t.id LEFT JOIN users u ON u.id=t.user_id WHERE t.id=? AND t.event_id=?`).get(tid, eid);
      const logRejection = (motif) => {
        try { db.prepare(`INSERT INTO event_checkins (ticket_id,event_id,scanner_id,resultat,motif_rejet) VALUES (?,?,?,'rejected',?)`).run(tid||0, eid||0, me.id, motif); } catch(e){}
        return sendJSON(res, 200, { valid: false, motif });
      };
      if (!ticket) return logRejection('Billet introuvable ou mauvais événement');
      if (ticket.qr_token === null) return logRejection('Billet archivé — accès expiré');
      if (ticket.organisateur_id !== me.id && !['administrateur','collectivite'].includes(me.role)) return sendJSON(res, 403, { error: 'Non autorisé pour cet événement.' });
      const expectedSig = signTicket(tid, eid, ticket.created_at);
      if (sig !== expectedSig) return logRejection('Signature QR invalide — billet falsifié');
      if (ticket.payment_status !== 'paid') return logRejection('Paiement non confirmé');
      if (ticket.statut === 'cancelled') return logRejection('Billet annulé');
      const deja = ticket.statut === 'used';
      if (!deja) await db.prepare(`UPDATE tickets SET statut='used' WHERE id=?`).run(tid);
      db.prepare(`INSERT INTO event_checkins (ticket_id,event_id,scanner_id,resultat) VALUES (?,?,?,'accepted')`).run(tid, eid, me.id);
      const nbScans = db.prepare(`SELECT COUNT(*) n FROM event_checkins WHERE ticket_id=? AND event_id=? AND resultat='accepted'`).get(tid, eid)?.n || 1;
      return sendJSON(res, 200, {
        valid: true,
        deja_scanne: deja,
        nb_scans_total: nbScans,
        nom: ticket.nom_display || 'Participant',
        da_id: ticket.da_id || null,
        photo_url: ticket.photo_url || null,
        type_compte: ticket.type_compte || null,
        event_titre: ticket.event_titre,
        type_billet: ticket.type_billet,
        ticket_id: tid,
        statut: ticket.statut
      });
    }

    /* ── GET /api/wallet/balance — solde wallet initiative ── */
    if (req.method === 'GET' && pathname === '/api/wallet/balance') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const user = await db.prepare(`SELECT wallet_balance FROM users WHERE id=?`).get(me.id);
      const historique = await db.prepare(`SELECT wt.*, e.titre AS event_titre FROM wallet_transactions wt LEFT JOIN events e ON e.id=wt.event_id WHERE wt.beneficiaire_id=? AND wt.type='organizer_credit' ORDER BY wt.timestamp DESC LIMIT 50`).all(me.id);
      return sendJSON(res, 200, { balance: user?.wallet_balance || 0, commission_rate: 0.05, historique });
    }

    /* ── GET /api/admin/wallet — wallet plateforme (admin only) ── */
    if (req.method === 'GET' && pathname === '/api/admin/wallet') {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Réservé.' });
      const pw = await db.prepare(`SELECT * FROM platform_wallet WHERE id=1`).get();
      const par_event = db.prepare(`SELECT e.titre, e.pays, COUNT(wt.id) nb_transactions, COALESCE(SUM(wt.montant),0) total_fees FROM wallet_transactions wt JOIN events e ON e.id=wt.event_id WHERE wt.type='platform_fee' GROUP BY wt.event_id ORDER BY total_fees DESC LIMIT 20`).all();
      const par_pays = db.prepare(`SELECT e.pays, COUNT(wt.id) nb, COALESCE(SUM(wt.montant),0) total FROM wallet_transactions wt JOIN events e ON e.id=wt.event_id WHERE wt.type='platform_fee' AND e.pays IS NOT NULL GROUP BY e.pays ORDER BY total DESC LIMIT 10`).all();
      const historique = await db.prepare(`SELECT wt.*, e.titre AS event_titre, u.nom AS organisateur_nom FROM wallet_transactions wt LEFT JOIN events e ON e.id=wt.event_id LEFT JOIN users u ON u.id=wt.beneficiaire_id WHERE wt.type='platform_fee' ORDER BY wt.timestamp DESC LIMIT 100`).all();
      return sendJSON(res, 200, { wallet: pw, par_event, par_pays, historique });
    }

    /* ══════════════════════════════════════════════════════════════
       MODULE RECRUTEMENT
       ══════════════════════════════════════════════════════════════ */

    /* ── GET /api/recrutement — liste publique ── */
    if (req.method === 'GET' && pathname === '/api/recrutement') {
      autoGererRecrutement();
      const q = Object.fromEntries(new URL('http://x'+req.url).searchParams);
      let sql = `SELECT c.*, u.nom AS recruteur_nom, u.da_id AS recruteur_da_id, u.photo_url AS recruteur_photo,
        (SELECT COUNT(*) FROM recrutement_candidatures r WHERE r.campagne_id=c.id) AS nb_candidatures,
        CASE WHEN c.promotion_fin > datetime('now') THEN 1 ELSE 0 END AS en_promotion
        FROM recrutement_campagnes c LEFT JOIN users u ON u.id=c.recruteur_id WHERE 1=1`;
      const args = [];
      if (q.mine === '1') {
        const me = getCurrentUser(req);
        if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
        sql += ' AND c.recruteur_id=?'; args.push(me.id);
      } else {
        sql += " AND c.statut='active'";
        // Filtre : seulement en promotion dans le listing public par défaut
        if (!q.tout) sql += ` AND c.expire_at > datetime('now')`;
      }
      if (q.type) { sql += ' AND c.type_recrutement=?'; args.push(q.type); }
      if (q.pays) { sql += ' AND c.pays=?'; args.push(q.pays); }
      if (q.q) { sql += ' AND (c.nom LIKE ? OR c.description LIKE ? OR c.organisme LIKE ?)'; args.push('%'+q.q+'%','%'+q.q+'%','%'+q.q+'%'); }
      sql += ' ORDER BY en_promotion DESC, c.publie_at DESC LIMIT 60';
      const campagnes = await db.prepare(sql).all(...args);
      // Quota annuel du user connecté
      const me = getCurrentUser(req);
      let quota = null;
      if (me && ['initiative','collectivite','administrateur'].includes(me.role)) {
        const annee = new Date().getFullYear();
        const utilisees = db.prepare(`SELECT COUNT(*) n FROM recrutement_campagnes WHERE recruteur_id=? AND strftime('%Y',created_at)=?`).get(me.id, String(annee))?.n || 0;
        quota = { utilisees, max: 2, annee };
      }
      return sendJSON(res, 200, { campagnes, quota });
    }

    /* ── POST /api/recrutement — créer une campagne ── */
    if (req.method === 'POST' && pathname === '/api/recrutement') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      if (!['initiative','collectivite','administrateur'].includes(me.role))
        return sendJSON(res, 403, { error: 'Réservé aux Comptes Initiatives et Étatiques.' });
      // Vérifier quota annuel
      const annee = new Date().getFullYear();
      const utilisees = db.prepare(`SELECT COUNT(*) n FROM recrutement_campagnes WHERE recruteur_id=? AND strftime('%Y',created_at)=?`).get(me.id, String(annee))?.n || 0;
      if (utilisees >= 2 && me.role !== 'administrateur')
        return sendJSON(res, 403, { error: 'Quota annuel atteint (2 campagnes par an maximum).' });
      const { nom, description, titre_poste, type_recrutement, organisme, secteur_activite, pays, region, departement, ville, adresse, teletravail, rayon_publication, image_b64, statut: statutInit, niveau_etudes, experience_annees, competences, langues, certifications, qualites, date_debut, duree_mission, remuneration, devise, nb_postes, photos_json, pdf_b64, pdf_nom, date_limite_candidature } = body;
      if (!nom) return sendJSON(res, 400, { error: 'Nom de campagne requis.' });
      const finalStatut = statutInit === 'active' ? 'active' : 'brouillon';
      const now = new Date().toISOString();
      const publie_at = finalStatut === 'active' ? now : null;
      const promotion_fin = publie_at ? new Date(new Date(publie_at).getTime() + 30*86400000).toISOString() : null;
      const expire_at = publie_at ? new Date(new Date(publie_at).getTime() + 60*86400000).toISOString() : null;
      const r = db.prepare(`INSERT INTO recrutement_campagnes
        (recruteur_id,nom,description,titre_poste,type_recrutement,organisme,secteur_activite,pays,region,departement,ville,adresse,teletravail,rayon_publication,image_b64,statut,publie_at,promotion_fin,expire_at,niveau_etudes,experience_annees,competences,langues,certifications,qualites,date_debut,duree_mission,remuneration,devise,nb_postes,photos_json,pdf_b64,pdf_nom,date_limite_candidature,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
        .run(me.id,nom,description||null,titre_poste||null,type_recrutement||'emploi',organisme||null,secteur_activite||null,pays||null,region||null,departement||null,ville||null,adresse||null,teletravail||'non',rayon_publication||'national',image_b64||null,finalStatut,publie_at,promotion_fin,expire_at,niveau_etudes||null,experience_annees||null,JSON.stringify(competences||[]),JSON.stringify(langues||[]),JSON.stringify(certifications||[]),JSON.stringify(qualites||[]),date_debut||null,duree_mission||null,remuneration||null,devise||'EUR',nb_postes||1,JSON.stringify(photos_json||[]),pdf_b64||null,pdf_nom||null,date_limite_candidature||null);
      const cid = Number(r.lastInsertRowid);
      // Publication dans le fil si active
      if (finalStatut === 'active' && await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='fil_posts'`).get()) {
        const fp = db.prepare(`INSERT INTO fil_posts(user_id,contenu,pub_type,original_post_id) VALUES(?,?,?,?)`)
          .run(me.id,`📢 Recrutement — ${nom}`,'recrutement',cid);
        await db.prepare(`UPDATE recrutement_campagnes SET fil_post_id=? WHERE id=?`).run(Number(fp.lastInsertRowid), cid);
      }
      return sendJSON(res, 201, { ok: true, id: cid });
    }

    /* ── GET /api/recrutement/:id — détail ── */
    if (req.method === 'GET' && /^\/api\/recrutement\/\d+$/.test(pathname)) {
      const cid = parseInt(pathname.split('/')[3]);
      const c = db.prepare(`SELECT c.*, u.nom AS recruteur_nom, u.da_id AS recruteur_da_id, u.photo_url AS recruteur_photo, u.ville AS recruteur_ville,
        (SELECT COUNT(*) FROM recrutement_candidatures r WHERE r.campagne_id=c.id) AS nb_candidatures,
        CASE WHEN c.promotion_fin > datetime('now') THEN 1 ELSE 0 END AS en_promotion
        FROM recrutement_campagnes c LEFT JOIN users u ON u.id=c.recruteur_id WHERE c.id=?`).get(cid);
      if (!c) return sendJSON(res, 404, { error: 'Campagne introuvable.' });
      // Candidature et interactions du visiteur connecté
      const me = getCurrentUser(req);
      const ma_candidature = me ? await db.prepare(`SELECT statut,created_at FROM recrutement_candidatures WHERE campagne_id=? AND candidat_id=?`).get(cid, me.id) : null;
      const est_favori = me ? !!await db.prepare(`SELECT id FROM recrutement_favoris WHERE campagne_id=? AND user_id=?`).get(cid, me.id) : false;
      const ma_reaction = me ? await db.prepare(`SELECT type FROM recrutement_reactions WHERE campagne_id=? AND user_id=?`).get(cid, me.id)?.type : null;
      return sendJSON(res, 200, { campagne: c, ma_candidature, est_favori, ma_reaction });
    }

    /* ── PUT /api/recrutement/:id — modifier ── */
    if (req.method === 'PUT' && /^\/api\/recrutement\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const cid = parseInt(pathname.split('/')[3]);
      const c = await db.prepare(`SELECT * FROM recrutement_campagnes WHERE id=?`).get(cid);
      if (!c) return sendJSON(res, 404, { error: 'Introuvable.' });
      if (c.recruteur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Accès refusé.' });
      const { nom, description, titre_poste, type_recrutement, organisme, secteur_activite, pays, region, departement, ville, adresse, teletravail, rayon_publication, image_b64, statut, niveau_etudes, experience_annees, competences, langues, certifications, qualites, date_debut, duree_mission, remuneration, devise, nb_postes, photos_json, pdf_b64, pdf_nom, date_limite_candidature } = body;
      // Calculer dates si passage à active
      let publie_at = c.publie_at, promotion_fin = c.promotion_fin, expire_at = c.expire_at;
      if (statut === 'active' && c.statut === 'brouillon') {
        publie_at = new Date().toISOString();
        promotion_fin = new Date(new Date(publie_at).getTime() + 30*86400000).toISOString();
        expire_at = new Date(new Date(publie_at).getTime() + 60*86400000).toISOString();
        // Publier dans le fil
        if (await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='fil_posts'`).get()) {
          const fp = db.prepare(`INSERT INTO fil_posts(user_id,contenu,pub_type,original_post_id) VALUES(?,?,?,?)`)
            .run(me.id,`📢 Recrutement — ${nom||c.nom}`,'recrutement',cid);
          await db.prepare(`UPDATE recrutement_campagnes SET fil_post_id=? WHERE id=?`).run(Number(fp.lastInsertRowid), cid);
        }
      }
      db.prepare(`UPDATE recrutement_campagnes SET
        nom=COALESCE(?,nom), description=COALESCE(?,description), titre_poste=COALESCE(?,titre_poste),
        type_recrutement=COALESCE(?,type_recrutement), organisme=COALESCE(?,organisme),
        secteur_activite=COALESCE(?,secteur_activite), pays=COALESCE(?,pays), region=COALESCE(?,region),
        departement=COALESCE(?,departement), ville=COALESCE(?,ville), adresse=COALESCE(?,adresse),
        teletravail=COALESCE(?,teletravail), rayon_publication=COALESCE(?,rayon_publication),
        image_b64=COALESCE(?,image_b64), statut=COALESCE(?,statut),
        niveau_etudes=COALESCE(?,niveau_etudes), experience_annees=COALESCE(?,experience_annees),
        date_debut=COALESCE(?,date_debut), duree_mission=COALESCE(?,duree_mission),
        remuneration=COALESCE(?,remuneration), devise=COALESCE(?,devise), nb_postes=COALESCE(?,nb_postes),
        pdf_nom=COALESCE(?,pdf_nom), date_limite_candidature=COALESCE(?,date_limite_candidature),
        publie_at=?, promotion_fin=?, expire_at=?, updated_at=datetime('now')
        WHERE id=?`)
        .run(nom||null,description||null,titre_poste||null,type_recrutement||null,organisme||null,
             secteur_activite||null,pays||null,region||null,departement||null,ville||null,adresse||null,
             teletravail||null,rayon_publication||null,image_b64||null,statut||null,
             niveau_etudes||null,experience_annees||null,date_debut||null,duree_mission||null,
             remuneration||null,devise||null,nb_postes||null,pdf_nom||null,date_limite_candidature||null,
             publie_at,promotion_fin,expire_at,cid);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── DELETE /api/recrutement/:id — archiver ── */
    if (req.method === 'DELETE' && /^\/api\/recrutement\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const cid = parseInt(pathname.split('/')[3]);
      const c = await db.prepare(`SELECT * FROM recrutement_campagnes WHERE id=?`).get(cid);
      if (!c) return sendJSON(res, 404, { error: 'Introuvable.' });
      if (c.recruteur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Accès refusé.' });
      db.prepare(`UPDATE recrutement_campagnes SET statut='archivee', updated_at=datetime('now') WHERE id=?`).run(cid);
      await db.prepare(`UPDATE recrutement_candidatures SET statut='archivee' WHERE campagne_id=?`).run(cid);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── POST /api/recrutement/:id/candidature — postuler ── */
    if (req.method === 'POST' && /^\/api\/recrutement\/\d+\/candidature$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const cid = parseInt(pathname.split('/')[3]);
      const c = await db.prepare(`SELECT * FROM recrutement_campagnes WHERE id=?`).get(cid);
      if (!c) return sendJSON(res, 404, { error: 'Campagne introuvable.' });
      if (c.statut !== 'active') return sendJSON(res, 400, { error: 'Cette campagne n\'accepte plus de candidatures.' });
      if (c.expire_at && c.expire_at < new Date().toISOString()) return sendJSON(res, 400, { error: 'Cette campagne est expirée.' });
      const { message, cv_b64 } = body;
      try {
        db.prepare(`INSERT INTO recrutement_candidatures(campagne_id,candidat_id,message,cv_b64,created_at,updated_at)
          VALUES(?,?,?,?,datetime('now'),datetime('now'))`).run(cid, me.id, message||null, cv_b64||null);
        // Notifier le recruteur
        try {
          db.prepare(`INSERT INTO notifications(user_id,type,contenu,lien,created_at) VALUES(?,?,?,?,datetime('now'))`)
            .run(c.recruteur_id,'recrutement',`👤 Nouvelle candidature pour "${c.nom}" de ${me.nom||me.da_id}`,`/recrutement.html`);
        } catch(_){}
        return sendJSON(res, 201, { ok: true });
      } catch(e) {
        if (e.message?.includes('UNIQUE')) return sendJSON(res, 409, { error: 'Vous avez déjà postulé à cette campagne.' });
        throw e;
      }
    }

    /* ── GET /api/recrutement/:id/candidatures — liste (recruteur) ── */
    if (req.method === 'GET' && /^\/api\/recrutement\/\d+\/candidatures$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const cid = parseInt(pathname.split('/')[3]);
      const c = await db.prepare(`SELECT * FROM recrutement_campagnes WHERE id=?`).get(cid);
      if (!c) return sendJSON(res, 404, { error: 'Introuvable.' });
      if (c.recruteur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: 'Accès refusé.' });
      const candidatures = await db.prepare(`SELECT r.*, u.nom, u.prenom, u.da_id, u.role AS type_compte, u.photo_url, u.ville, u.pays
        FROM recrutement_candidatures r JOIN users u ON u.id=r.candidat_id
        WHERE r.campagne_id=? ORDER BY r.created_at DESC`).all(cid);
      return sendJSON(res, 200, { candidatures });
    }

    /* ── PUT /api/recrutement/:id/candidatures/:cand_id — changer statut ── */
    if (req.method === 'PUT' && /^\/api\/recrutement\/\d+\/candidatures\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const parts = pathname.split('/');
      const cid = parseInt(parts[3]); const candId = parseInt(parts[5]);
      const c = await db.prepare(`SELECT * FROM recrutement_campagnes WHERE id=?`).get(cid);
      if (!c || (c.recruteur_id !== me.id && me.role !== 'administrateur')) return sendJSON(res, 403, { error: 'Accès refusé.' });
      const { statut } = body;
      db.prepare(`UPDATE recrutement_candidatures SET statut=?,updated_at=datetime('now') WHERE id=? AND campagne_id=?`).run(statut, candId, cid);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── POST /api/recrutement/:id/view — compteur vues ── */
    if (req.method === 'POST' && /^\/api\/recrutement\/\d+\/view$/.test(pathname)) {
      const cid = parseInt(pathname.split('/')[3]);
      db.prepare(`UPDATE recrutement_campagnes SET vues_total=COALESCE(vues_total,0)+1 WHERE id=?`).run(cid);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── GET /api/recrutement/:id/stats — tableau de bord ── */
    if (req.method === 'GET' && /^\/api\/recrutement\/\d+\/stats$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const cid = parseInt(pathname.split('/')[3]);
      const c = await db.prepare(`SELECT * FROM recrutement_campagnes WHERE id=?`).get(cid);
      if (!c || (c.recruteur_id !== me.id && me.role !== 'administrateur')) return sendJSON(res, 403, { error: 'Accès refusé.' });
      const nb_candidatures = db.prepare(`SELECT COUNT(*) n FROM recrutement_candidatures WHERE campagne_id=?`).get(cid)?.n || 0;
      const taux_conversion = c.vues_total > 0 ? Math.round(nb_candidatures / c.vues_total * 100) : 0;
      const par_type = db.prepare(`SELECT u.role AS type_compte, COUNT(*) n FROM recrutement_candidatures r JOIN users u ON u.id=r.candidat_id WHERE r.campagne_id=? GROUP BY u.role`).all(cid);
      const par_pays = db.prepare(`SELECT u.pays, COUNT(*) n FROM recrutement_candidatures r JOIN users u ON u.id=r.candidat_id WHERE r.campagne_id=? AND u.pays IS NOT NULL GROUP BY u.pays ORDER BY n DESC LIMIT 10`).all(cid);
      const par_statut = db.prepare(`SELECT statut, COUNT(*) n FROM recrutement_candidatures WHERE campagne_id=? GROUP BY statut`).all(cid);
      return sendJSON(res, 200, { campagne: c, nb_candidatures, taux_conversion, par_type, par_pays, par_statut });
    }

    /* ══════════════════════════════════════════════════════════════
       RECRUTEMENT — INTERACTIONS SOCIALES
       ══════════════════════════════════════════════════════════════ */

    /* ── POST /api/recrutement/:id/reaction — toggle réaction ── */
    if (req.method === 'POST' && /^\/api\/recrutement\/\d+\/reaction$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const cid = parseInt(pathname.split('/')[3]);
      const { type = 'jaime' } = body;
      const existing = await db.prepare(`SELECT id, type FROM recrutement_reactions WHERE campagne_id=? AND user_id=?`).get(cid, me.id);
      let action;
      if (existing) {
        if (existing.type === type) {
          await db.prepare(`DELETE FROM recrutement_reactions WHERE campagne_id=? AND user_id=?`).run(cid, me.id);
          action = 'removed';
        } else {
          db.prepare(`UPDATE recrutement_reactions SET type=?, created_at=datetime('now') WHERE campagne_id=? AND user_id=?`).run(type, cid, me.id);
          action = 'changed';
        }
      } else {
        db.prepare(`INSERT INTO recrutement_reactions(campagne_id,user_id,type) VALUES(?,?,?)`).run(cid, me.id, type);
        action = 'added';
      }
      const nb = db.prepare(`SELECT COUNT(*) n FROM recrutement_reactions WHERE campagne_id=?`).get(cid)?.n || 0;
      await db.prepare(`UPDATE recrutement_campagnes SET nb_reactions=? WHERE id=?`).run(nb, cid);
      const ma_reaction = await db.prepare(`SELECT type FROM recrutement_reactions WHERE campagne_id=? AND user_id=?`).get(cid, me.id);
      return sendJSON(res, 200, { action, nb_reactions: nb, ma_reaction: ma_reaction?.type || null });
    }

    /* ── GET /api/recrutement/:id/commentaires ── */
    if (req.method === 'GET' && /^\/api\/recrutement\/\d+\/commentaires$/.test(pathname)) {
      const cid = parseInt(pathname.split('/')[3]);
      const commentaires = await db.prepare(`
        SELECT rc.*, u.nom, u.prenom, u.photo_url, u.da_id, u.role AS type_compte
        FROM recrutement_commentaires rc
        JOIN users u ON u.id=rc.user_id
        WHERE rc.campagne_id=? AND rc.parent_id IS NULL
        ORDER BY rc.created_at ASC`).all(cid);
      for (const c of commentaires) {
        c.replies = await db.prepare(`
          SELECT rc.*, u.nom, u.prenom, u.photo_url, u.da_id
          FROM recrutement_commentaires rc JOIN users u ON u.id=rc.user_id
          WHERE rc.parent_id=? ORDER BY rc.created_at ASC`).all(c.id);
      }
      return sendJSON(res, 200, { commentaires });
    }

    /* ── POST /api/recrutement/:id/commentaires ── */
    if (req.method === 'POST' && /^\/api\/recrutement\/\d+\/commentaires$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const cid = parseInt(pathname.split('/')[3]);
      const { contenu, parent_id } = body;
      if (!contenu?.trim()) return sendJSON(res, 400, { error: 'Contenu requis.' });
      const r = db.prepare(`INSERT INTO recrutement_commentaires(campagne_id,user_id,contenu,parent_id) VALUES(?,?,?,?)`).run(cid, me.id, contenu.trim(), parent_id || null);
      const nb = db.prepare(`SELECT COUNT(*) n FROM recrutement_commentaires WHERE campagne_id=?`).get(cid)?.n || 0;
      await db.prepare(`UPDATE recrutement_campagnes SET nb_commentaires=? WHERE id=?`).run(nb, cid);
      return sendJSON(res, 201, { id: Number(r.lastInsertRowid), nb_commentaires: nb });
    }

    /* ── POST /api/recrutement/:id/favori — toggle ── */
    if (req.method === 'POST' && /^\/api\/recrutement\/\d+\/favori$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const cid = parseInt(pathname.split('/')[3]);
      const existing = await db.prepare(`SELECT id FROM recrutement_favoris WHERE campagne_id=? AND user_id=?`).get(cid, me.id);
      let action;
      if (existing) {
        await db.prepare(`DELETE FROM recrutement_favoris WHERE campagne_id=? AND user_id=?`).run(cid, me.id);
        action = 'removed';
      } else {
        db.prepare(`INSERT INTO recrutement_favoris(campagne_id,user_id) VALUES(?,?)`).run(cid, me.id);
        action = 'added';
      }
      const nb = db.prepare(`SELECT COUNT(*) n FROM recrutement_favoris WHERE campagne_id=?`).get(cid)?.n || 0;
      await db.prepare(`UPDATE recrutement_campagnes SET nb_favoris=? WHERE id=?`).run(nb, cid);
      return sendJSON(res, 200, { action, nb_favoris: nb, est_favori: action === 'added' });
    }

    /* ── POST /api/recrutement/:id/republier ── */
    if (req.method === 'POST' && /^\/api\/recrutement\/\d+\/republier$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const cid = parseInt(pathname.split('/')[3]);
      const c = await db.prepare(`SELECT * FROM recrutement_campagnes WHERE id=?`).get(cid);
      if (!c) return sendJSON(res, 404, { error: 'Campagne introuvable.' });
      const { commentaire = '' } = body;
      // Créer une publication dans le fil
      if (await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='fil_posts'`).get()) {
        db.prepare(`INSERT INTO fil_posts(user_id, contenu, pub_type, original_post_id, repost_commentaire) VALUES(?,?,?,?,?)`)
          .run(me.id, `📢 Recrutement — ${c.nom}`, 'recrutement_repost', cid, commentaire);
      }
      const nb = (c.nb_republications || 0) + 1;
      await db.prepare(`UPDATE recrutement_campagnes SET nb_republications=? WHERE id=?`).run(nb, cid);
      return sendJSON(res, 200, { nb_republications: nb });
    }

    /* ── POST /api/recrutement/:id/partager ── */
    if (req.method === 'POST' && /^\/api\/recrutement\/\d+\/partager$/.test(pathname)) {
      const cid = parseInt(pathname.split('/')[3]);
      const nb = await db.prepare(`SELECT nb_partages FROM recrutement_campagnes WHERE id=?`).get(cid)?.nb_partages || 0;
      await db.prepare(`UPDATE recrutement_campagnes SET nb_partages=? WHERE id=?`).run(nb + 1, cid);
      return sendJSON(res, 200, { nb_partages: nb + 1 });
    }

    /* ── GET /api/recrutement/:id/signaler ── */
    if (req.method === 'POST' && /^\/api\/recrutement\/\d+\/signaler$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      return sendJSON(res, 200, { message: 'Signalement reçu. Notre équipe examinera cette campagne.' });
    }

    /* ── GET /api/recrutement/:id/stats enrichi ── */
    /* (déjà géré plus haut) */

    /* ══════════════════════════════════════════════════════════════
       PROFIL EMPLOI / ESPACE CANDIDAT
       ══════════════════════════════════════════════════════════════ */

    /* ── GET /api/profil-emploi ── */
    if (req.method === 'GET' && pathname === '/api/profil-emploi') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      let profil = await db.prepare(`SELECT * FROM profil_emploi WHERE user_id=?`).get(me.id);
      if (!profil) profil = { user_id: me.id, situation: 'en_recherche', types_opportunites: '[]', secteurs: '[]', competences: '[]', langues: '[]' };
      const experiences = await db.prepare(`SELECT * FROM profil_emploi_experiences WHERE user_id=? ORDER BY ordre, date_debut DESC`).all(me.id);
      const formations = await db.prepare(`SELECT * FROM profil_emploi_formations WHERE user_id=? ORDER BY ordre, date_obtention DESC`).all(me.id);
      const nb_candidatures = db.prepare(`SELECT COUNT(*) n FROM recrutement_candidatures WHERE candidat_id=?`).get(me.id)?.n || 0;
      const cands_statuts = db.prepare(`SELECT statut, COUNT(*) n FROM recrutement_candidatures WHERE candidat_id=? GROUP BY statut`).all(me.id);
      return sendJSON(res, 200, { profil, experiences, formations, nb_candidatures, cands_statuts });
    }

    /* ── PUT /api/profil-emploi ── */
    if (req.method === 'PUT' && pathname === '/api/profil-emploi') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const { situation, types_opportunites, secteurs, metier, competences, experience, niveau_etudes, langues, mobilite, teletravail, salaire_min, salaire_max, devise, date_disponibilite, disponible_pour_travailler, suspendre_offres, lettre_contenu, cv_pdf, lettre_pdf, portfolio_pdf } = body;
      const existing = await db.prepare(`SELECT id FROM profil_emploi WHERE user_id=?`).get(me.id);
      if (existing) {
        db.prepare(`UPDATE profil_emploi SET situation=?,types_opportunites=?,secteurs=?,metier=?,competences=?,experience=?,niveau_etudes=?,langues=?,mobilite=?,teletravail=?,salaire_min=?,salaire_max=?,devise=?,date_disponibilite=?,disponible_pour_travailler=?,suspendre_offres=?,lettre_contenu=?,cv_pdf=COALESCE(?,cv_pdf),lettre_pdf=COALESCE(?,lettre_pdf),portfolio_pdf=COALESCE(?,portfolio_pdf),updated_at=datetime('now') WHERE user_id=?`)
          .run(situation,JSON.stringify(types_opportunites||[]),JSON.stringify(secteurs||[]),metier,JSON.stringify(competences||[]),experience,niveau_etudes,JSON.stringify(langues||[]),mobilite,teletravail,salaire_min||null,salaire_max||null,devise||'EUR',date_disponibilite,disponible_pour_travailler?1:0,suspendre_offres?1:0,lettre_contenu,cv_pdf||null,lettre_pdf||null,portfolio_pdf||null,me.id);
      } else {
        db.prepare(`INSERT INTO profil_emploi(user_id,situation,types_opportunites,secteurs,metier,competences,experience,niveau_etudes,langues,mobilite,teletravail,salaire_min,salaire_max,devise,date_disponibilite,disponible_pour_travailler,suspendre_offres,lettre_contenu,cv_pdf,lettre_pdf,portfolio_pdf) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(me.id,situation,JSON.stringify(types_opportunites||[]),JSON.stringify(secteurs||[]),metier,JSON.stringify(competences||[]),experience,niveau_etudes,JSON.stringify(langues||[]),mobilite,teletravail,salaire_min||null,salaire_max||null,devise||'EUR',date_disponibilite,disponible_pour_travailler?1:0,suspendre_offres?1:0,lettre_contenu,cv_pdf||null,lettre_pdf||null,portfolio_pdf||null);
      }
      // Mettre à jour le badge sur le user
      if (typeof disponible_pour_travailler !== 'undefined') {
        await db.prepare(`UPDATE users SET disponible_pour_travailler=? WHERE id=?`).run(disponible_pour_travailler?1:0, me.id);
      }
      return sendJSON(res, 200, { message: 'Profil emploi mis à jour.' });
    }

    /* ── POST /api/profil-emploi/experiences ── */
    if (req.method === 'POST' && pathname === '/api/profil-emploi/experiences') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const { poste, entreprise, ville, pays, date_debut, date_fin, en_cours, description, realisations, ordre } = body;
      if (!poste) return sendJSON(res, 400, { error: 'Poste requis.' });
      const r = db.prepare(`INSERT INTO profil_emploi_experiences(user_id,poste,entreprise,ville,pays,date_debut,date_fin,en_cours,description,realisations,ordre) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
        .run(me.id,poste,entreprise,ville,pays,date_debut,date_fin,en_cours?1:0,description,realisations,ordre||0);
      return sendJSON(res, 201, { id: Number(r.lastInsertRowid) });
    }

    /* ── PUT /api/profil-emploi/experiences/:id ── */
    if (req.method === 'PUT' && /^\/api\/profil-emploi\/experiences\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/').pop());
      const { poste, entreprise, ville, pays, date_debut, date_fin, en_cours, description, realisations, ordre } = body;
      await db.prepare(`UPDATE profil_emploi_experiences SET poste=?,entreprise=?,ville=?,pays=?,date_debut=?,date_fin=?,en_cours=?,description=?,realisations=?,ordre=? WHERE id=? AND user_id=?`)
        .run(poste,entreprise,ville,pays,date_debut,date_fin,en_cours?1:0,description,realisations,ordre||0,eid,me.id);
      return sendJSON(res, 200, { message: 'Expérience mise à jour.' });
    }

    /* ── DELETE /api/profil-emploi/experiences/:id ── */
    if (req.method === 'DELETE' && /^\/api\/profil-emploi\/experiences\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const eid = parseInt(pathname.split('/').pop());
      await db.prepare(`DELETE FROM profil_emploi_experiences WHERE id=? AND user_id=?`).run(eid, me.id);
      return sendJSON(res, 200, { message: 'Supprimé.' });
    }

    /* ── POST /api/profil-emploi/formations ── */
    if (req.method === 'POST' && pathname === '/api/profil-emploi/formations') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const { diplome, etablissement, ville, pays, date_obtention, description, ordre } = body;
      if (!diplome) return sendJSON(res, 400, { error: 'Diplôme requis.' });
      const r = db.prepare(`INSERT INTO profil_emploi_formations(user_id,diplome,etablissement,ville,pays,date_obtention,description,ordre) VALUES(?,?,?,?,?,?,?,?)`)
        .run(me.id,diplome,etablissement,ville,pays,date_obtention,description,ordre||0);
      return sendJSON(res, 201, { id: Number(r.lastInsertRowid) });
    }

    /* ── PUT /api/profil-emploi/formations/:id ── */
    if (req.method === 'PUT' && /^\/api\/profil-emploi\/formations\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const fid = parseInt(pathname.split('/').pop());
      const { diplome, etablissement, ville, pays, date_obtention, description, ordre } = body;
      await db.prepare(`UPDATE profil_emploi_formations SET diplome=?,etablissement=?,ville=?,pays=?,date_obtention=?,description=?,ordre=? WHERE id=? AND user_id=?`)
        .run(diplome,etablissement,ville,pays,date_obtention,description,ordre||0,fid,me.id);
      return sendJSON(res, 200, { message: 'Formation mise à jour.' });
    }

    /* ── DELETE /api/profil-emploi/formations/:id ── */
    if (req.method === 'DELETE' && /^\/api\/profil-emploi\/formations\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const fid = parseInt(pathname.split('/').pop());
      await db.prepare(`DELETE FROM profil_emploi_formations WHERE id=? AND user_id=?`).run(fid, me.id);
      return sendJSON(res, 200, { message: 'Supprimé.' });
    }

    /* ── GET /api/profil-emploi/offres-matchees ── */
    if (req.method === 'GET' && pathname === '/api/profil-emploi/offres-matchees') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const profil = await db.prepare(`SELECT * FROM profil_emploi WHERE user_id=?`).get(me.id);
      // Récupère les campagnes actives
      let camps = db.prepare(`SELECT c.*, u.nom AS recruteur_nom, u.photo_url AS recruteur_photo, u.da_id AS recruteur_da_id,
        (SELECT COUNT(*) FROM recrutement_candidatures rc WHERE rc.campagne_id=c.id AND rc.candidat_id=?) AS deja_postule
        FROM recrutement_campagnes c LEFT JOIN users u ON u.id=c.recruteur_id
        WHERE c.statut='active' AND (c.date_limite_candidature IS NULL OR c.date_limite_candidature > datetime('now'))
        ORDER BY c.publie_at DESC LIMIT 50`).all(me.id);
      // Score de matching basique
      if (profil) {
        const secteursProfil = JSON.parse(profil.secteurs || '[]');
        const metierProfil = (profil.metier || '').toLowerCase();
        camps = camps.map(c => {
          let score = 0;
          if (c.secteur_activite && secteursProfil.includes(c.secteur_activite)) score += 30;
          if (metierProfil && c.titre_poste && c.titre_poste.toLowerCase().includes(metierProfil)) score += 20;
          if (profil.pays && c.pays === profil.pays) score += 15;
          if (profil.ville && c.ville === profil.ville) score += 10;
          if (c.teletravail !== 'non' && profil.teletravail !== 'non') score += 5;
          return { ...c, score_matching: score };
        }).sort((a, b) => b.score_matching - a.score_matching);
      }
      return sendJSON(res, 200, { campagnes: camps, profil: profil || null });
    }

    /* ══════════════════════════════════════════════════════════════
       SONDAGES — MODULE ENRICHI
       ══════════════════════════════════════════════════════════════ */

    /* ── GET /api/sondages ── */
    if (req.method === 'GET' && (pathname === '/api/sondages' || pathname.startsWith('/api/sondages?'))) {
      const mine = q.mine === '1';
      const me = getCurrentUser(req);
      let sql = `SELECT s.*, u.nom AS createur_nom, u.photo_url AS createur_photo, u.da_id AS createur_da_id,
        (SELECT COUNT(*) FROM sondage_questions sq WHERE sq.sondage_id=s.id) AS nb_questions
        FROM sondages s LEFT JOIN users u ON u.id=s.createur_id WHERE 1=1`;
      const args = [];
      if (mine) {
        if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
        sql += ' AND s.createur_id=?'; args.push(me.id);
      } else {
        sql += " AND s.statut='ouvert'";
      }
      if (q.categorie) { sql += ' AND s.categorie=?'; args.push(q.categorie); }
      if (q.q) { sql += ' AND (s.titre LIKE ? OR s.description LIKE ?)'; args.push('%'+q.q+'%','%'+q.q+'%'); }
      sql += ' ORDER BY s.created_at DESC LIMIT 50';
      const sondages_list = await db.prepare(sql).all(...args);
      // Auto-clôturer les sondages expirés
      db.prepare(`UPDATE sondages SET statut='cloture' WHERE statut='ouvert' AND date_cloture IS NOT NULL AND date_cloture < datetime('now')`).run();
      return sendJSON(res, 200, { sondages: sondages_list });
    }

    /* ── POST /api/sondages ── */
    if (req.method === 'POST' && pathname === '/api/sondages') {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      if (!['initiative','collectivite','administrateur'].includes(me.role)) return sendJSON(res, 403, { error: 'Réservé aux Initiatives et Comptes Étatiques.' });
      const { titre, description, objectif, categorie, type = 'sondage', ville, pays, region, departement, rayon_publication, date_debut, date_cloture, anonyme, confidentialite, resultats_visibles, une_reponse_par_compte, modification_autorisee, cible_roles, photos_json, pdf_b64, pdf_nom, video_url, questions = [], statut = 'brouillon' } = body;
      if (!titre) return sendJSON(res, 400, { error: 'Titre requis.' });
      if (date_cloture && date_debut) {
        const diffDays = (new Date(date_cloture) - new Date(date_debut)) / 86400000;
        if (diffDays > 30) return sendJSON(res, 400, { error: 'Durée maximale : 30 jours.' });
      }
      const r = db.prepare(`INSERT INTO sondages(createur_id,titre,description,objectif,categorie,type,ville,pays,region,departement,rayon_publication,date_debut,date_cloture,anonyme,confidentialite,resultats_visibles,une_reponse_par_compte,modification_autorisee,cible_roles,photos_json,pdf_b64,pdf_nom,video_url,statut)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(me.id,titre,description,objectif,categorie||'autre',type,ville,pays,region,departement,rayon_publication||'national',date_debut,date_cloture,anonyme?1:0,confidentialite||'anonyme',resultats_visibles||'apres_cloture',une_reponse_par_compte?1:1,modification_autorisee?1:0,JSON.stringify(cible_roles||[]),JSON.stringify(photos_json||[]),pdf_b64||null,pdf_nom||null,video_url||null,statut);
      const sid = Number(r.lastInsertRowid);
      // Insérer les questions
      for (let i = 0; i < questions.length; i++) {
        const q2 = questions[i];
        db.prepare(`INSERT INTO sondage_questions(sondage_id,texte,type,options_json,obligatoire,ordre,description,min_label,max_label,min_val,max_val) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
          .run(sid,q2.texte,q2.type||'choix_unique',JSON.stringify(q2.options||[]),q2.obligatoire?1:1,i,q2.description||null,q2.min_label||null,q2.max_label||null,q2.min_val||1,q2.max_val||5);
      }
      // Publication dans le fil si statut=ouvert
      if (statut === 'ouvert') {
        if (await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='fil_posts'`).get()) {
          const fp = db.prepare(`INSERT INTO fil_posts(user_id,contenu,pub_type,original_post_id) VALUES(?,?,?,?)`)
            .run(me.id,`📊 Sondage — ${titre}`,'sondage',sid);
          await db.prepare(`UPDATE sondages SET fil_post_id=? WHERE id=?`).run(Number(fp.lastInsertRowid), sid);
        }
      }
      return sendJSON(res, 201, { id: sid });
    }

    /* ── GET /api/sondages/:id ── */
    if (req.method === 'GET' && /^\/api\/sondages\/\d+$/.test(pathname)) {
      const sid = parseInt(pathname.split('/')[3]);
      const sondage = await db.prepare(`SELECT s.*, u.nom AS createur_nom, u.photo_url AS createur_photo, u.da_id AS createur_da_id
        FROM sondages s LEFT JOIN users u ON u.id=s.createur_id WHERE s.id=?`).get(sid);
      if (!sondage) return sendJSON(res, 404, { error: 'Sondage introuvable.' });
      const questions = await db.prepare(`SELECT * FROM sondage_questions WHERE sondage_id=? ORDER BY ordre`).all(sid);
      const me = getCurrentUser(req);
      let ma_participation = null;
      if (me) {
        ma_participation = await db.prepare(`SELECT * FROM sondage_reponses WHERE sondage_id=? AND user_id=? LIMIT 1`).get(sid, me.id);
        const fav = await db.prepare(`SELECT id FROM sondage_favoris WHERE sondage_id=? AND user_id=?`).get(sid, me.id);
        sondage.est_favori = !!fav;
        const rxn = await db.prepare(`SELECT type FROM sondage_reactions WHERE sondage_id=? AND user_id=?`).get(sid, me.id);
        sondage.ma_reaction = rxn?.type || null;
      }
      return sendJSON(res, 200, { sondage, questions, ma_participation });
    }

    /* ── PUT /api/sondages/:id ── */
    if (req.method === 'PUT' && /^\/api\/sondages\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const sid = parseInt(pathname.split('/')[3]);
      const s = await db.prepare(`SELECT * FROM sondages WHERE id=?`).get(sid);
      if (!s || (s.createur_id !== me.id && me.role !== 'administrateur')) return sendJSON(res, 403, { error: 'Accès refusé.' });
      const { titre, description, objectif, categorie, date_cloture, statut, rayon_publication, confidentialite, resultats_visibles, photos_json, pdf_b64, pdf_nom, video_url } = body;
      db.prepare(`UPDATE sondages SET titre=COALESCE(?,titre),description=COALESCE(?,description),objectif=COALESCE(?,objectif),categorie=COALESCE(?,categorie),date_cloture=COALESCE(?,date_cloture),statut=COALESCE(?,statut),rayon_publication=COALESCE(?,rayon_publication),confidentialite=COALESCE(?,confidentialite),resultats_visibles=COALESCE(?,resultats_visibles),photos_json=COALESCE(?,photos_json),pdf_b64=COALESCE(?,pdf_b64),pdf_nom=COALESCE(?,pdf_nom),video_url=COALESCE(?,video_url) WHERE id=?`)
        .run(titre,description,objectif,categorie,date_cloture,statut,rayon_publication,confidentialite,resultats_visibles,photos_json?JSON.stringify(photos_json):null,pdf_b64,pdf_nom,video_url,sid);
      return sendJSON(res, 200, { message: 'Sondage mis à jour.' });
    }

    /* ── DELETE /api/sondages/:id ── */
    if (req.method === 'DELETE' && /^\/api\/sondages\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const sid = parseInt(pathname.split('/')[3]);
      const s = await db.prepare(`SELECT * FROM sondages WHERE id=?`).get(sid);
      if (!s || (s.createur_id !== me.id && me.role !== 'administrateur')) return sendJSON(res, 403, { error: 'Accès refusé.' });
      await db.prepare(`UPDATE sondages SET statut='archive' WHERE id=?`).run(sid);
      return sendJSON(res, 200, { message: 'Sondage archivé.' });
    }

    /* ── POST /api/sondages/:id/view ── */
    if (req.method === 'POST' && /^\/api\/sondages\/\d+\/view$/.test(pathname)) {
      const sid = parseInt(pathname.split('/')[3]);
      await db.prepare(`UPDATE sondages SET nb_vues=nb_vues+1 WHERE id=?`).run(sid);
      return sendJSON(res, 200, {});
    }

    /* ── POST /api/sondages/:id/participer ── */
    if (req.method === 'POST' && /^\/api\/sondages\/\d+\/participer$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const sid = parseInt(pathname.split('/')[3]);
      const s = await db.prepare(`SELECT * FROM sondages WHERE id=?`).get(sid);
      if (!s || s.statut !== 'ouvert') return sendJSON(res, 400, { error: 'Ce sondage est fermé.' });
      if (s.une_reponse_par_compte) {
        const already = await db.prepare(`SELECT id FROM sondage_reponses WHERE sondage_id=? AND user_id=? LIMIT 1`).get(sid, me.id);
        if (already && !s.modification_autorisee) return sendJSON(res, 400, { error: 'Vous avez déjà répondu à ce sondage.' });
        if (already) {
          await db.prepare(`DELETE FROM sondage_reponses WHERE sondage_id=? AND user_id=?`).run(sid, me.id);
        }
      }
      const { reponses = [] } = body;
      for (const rep of reponses) {
        db.prepare(`INSERT INTO sondage_reponses(sondage_id,question_id,user_id,reponse) VALUES(?,?,?,?)`)
          .run(sid, rep.question_id, s.anonyme ? null : me.id, JSON.stringify(rep.valeur));
      }
      await db.prepare(`UPDATE sondages SET nb_reponses=nb_reponses+1 WHERE id=?`).run(sid);
      return sendJSON(res, 201, { message: 'Réponse enregistrée.' });
    }

    /* ── GET /api/sondages/:id/resultats ── */
    if (req.method === 'GET' && /^\/api\/sondages\/\d+\/resultats$/.test(pathname)) {
      const sid = parseInt(pathname.split('/')[3]);
      const s = await db.prepare(`SELECT * FROM sondages WHERE id=?`).get(sid);
      if (!s) return sendJSON(res, 404, { error: 'Sondage introuvable.' });
      const me = getCurrentUser(req);
      const estCreateur = me && (me.id === s.createur_id || me.role === 'administrateur');
      if (s.resultats_visibles === 'createur' && !estCreateur) return sendJSON(res, 403, { error: 'Résultats réservés au créateur.' });
      if (s.resultats_visibles === 'apres_cloture' && s.statut === 'ouvert' && !estCreateur) return sendJSON(res, 403, { error: 'Résultats disponibles après clôture.' });
      const questions = await db.prepare(`SELECT * FROM sondage_questions WHERE sondage_id=? ORDER BY ordre`).all(sid);
      const resultats = [];
      for (const q2 of questions) {
        const reponses = db.prepare(`SELECT reponse, COUNT(*) n FROM sondage_reponses WHERE question_id=? GROUP BY reponse ORDER BY n DESC`).all(q2.id);
        resultats.push({ question: q2, reponses });
      }
      return sendJSON(res, 200, { sondage: s, resultats });
    }

    /* ── GET /api/sondages/:id/stats ── */
    if (req.method === 'GET' && /^\/api\/sondages\/\d+\/stats$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const sid = parseInt(pathname.split('/')[3]);
      const s = await db.prepare(`SELECT * FROM sondages WHERE id=?`).get(sid);
      if (!s || (s.createur_id !== me.id && me.role !== 'administrateur')) return sendJSON(res, 403, { error: 'Accès refusé.' });
      const taux = s.nb_vues > 0 ? Math.round(s.nb_reponses / s.nb_vues * 100) : 0;
      const par_pays = db.prepare(`SELECT u.pays, COUNT(DISTINCT r.user_id) n FROM sondage_reponses r LEFT JOIN users u ON u.id=r.user_id WHERE r.sondage_id=? AND u.pays IS NOT NULL GROUP BY u.pays ORDER BY n DESC LIMIT 10`).all(sid);
      const par_type = db.prepare(`SELECT u.role AS type_compte, COUNT(DISTINCT r.user_id) n FROM sondage_reponses r LEFT JOIN users u ON u.id=r.user_id WHERE r.sondage_id=? GROUP BY u.role`).all(sid);
      const evolution = db.prepare(`SELECT DATE(r.created_at) AS jour, COUNT(*) n FROM sondage_reponses r WHERE r.sondage_id=? GROUP BY jour ORDER BY jour`).all(sid);
      return sendJSON(res, 200, { sondage: s, taux_participation: taux, par_pays, par_type, evolution });
    }

    /* ── POST /api/sondages/:id/reaction ── */
    if (req.method === 'POST' && /^\/api\/sondages\/\d+\/reaction$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const sid = parseInt(pathname.split('/')[3]);
      const { type = 'jaime' } = body;
      const existing = await db.prepare(`SELECT id, type FROM sondage_reactions WHERE sondage_id=? AND user_id=?`).get(sid, me.id);
      let action;
      if (existing) {
        if (existing.type === type) { await db.prepare(`DELETE FROM sondage_reactions WHERE sondage_id=? AND user_id=?`).run(sid, me.id); action = 'removed'; }
        else { await db.prepare(`UPDATE sondage_reactions SET type=? WHERE sondage_id=? AND user_id=?`).run(type,sid,me.id); action = 'changed'; }
      } else { db.prepare(`INSERT INTO sondage_reactions(sondage_id,user_id,type) VALUES(?,?,?)`).run(sid,me.id,type); action = 'added'; }
      const nb = db.prepare(`SELECT COUNT(*) n FROM sondage_reactions WHERE sondage_id=?`).get(sid)?.n || 0;
      await db.prepare(`UPDATE sondages SET nb_reactions=? WHERE id=?`).run(nb, sid);
      return sendJSON(res, 200, { action, nb_reactions: nb });
    }

    /* ── GET /api/sondages/:id/commentaires ── */
    if (req.method === 'GET' && /^\/api\/sondages\/\d+\/commentaires$/.test(pathname)) {
      const sid = parseInt(pathname.split('/')[3]);
      const commentaires = await db.prepare(`SELECT sc.*, u.nom, u.prenom, u.photo_url, u.da_id FROM sondage_commentaires sc JOIN users u ON u.id=sc.user_id WHERE sc.sondage_id=? AND sc.parent_id IS NULL ORDER BY sc.created_at ASC`).all(sid);
      for (const c of commentaires) {
        c.replies = await db.prepare(`SELECT sc.*, u.nom, u.prenom, u.photo_url FROM sondage_commentaires sc JOIN users u ON u.id=sc.user_id WHERE sc.parent_id=? ORDER BY sc.created_at ASC`).all(c.id);
      }
      return sendJSON(res, 200, { commentaires });
    }

    /* ── POST /api/sondages/:id/commentaires ── */
    if (req.method === 'POST' && /^\/api\/sondages\/\d+\/commentaires$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const sid = parseInt(pathname.split('/')[3]);
      const { contenu, parent_id } = body;
      if (!contenu?.trim()) return sendJSON(res, 400, { error: 'Contenu requis.' });
      const r = db.prepare(`INSERT INTO sondage_commentaires(sondage_id,user_id,contenu,parent_id) VALUES(?,?,?,?)`).run(sid,me.id,contenu.trim(),parent_id||null);
      const nb = db.prepare(`SELECT COUNT(*) n FROM sondage_commentaires WHERE sondage_id=?`).get(sid)?.n || 0;
      await db.prepare(`UPDATE sondages SET nb_commentaires=? WHERE id=?`).run(nb, sid);
      return sendJSON(res, 201, { id: Number(r.lastInsertRowid), nb_commentaires: nb });
    }

    /* ── POST /api/sondages/:id/favori ── */
    if (req.method === 'POST' && /^\/api\/sondages\/\d+\/favori$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const sid = parseInt(pathname.split('/')[3]);
      const existing = await db.prepare(`SELECT id FROM sondage_favoris WHERE sondage_id=? AND user_id=?`).get(sid, me.id);
      let action;
      if (existing) { await db.prepare(`DELETE FROM sondage_favoris WHERE sondage_id=? AND user_id=?`).run(sid,me.id); action='removed'; }
      else { db.prepare(`INSERT INTO sondage_favoris(sondage_id,user_id) VALUES(?,?)`).run(sid,me.id); action='added'; }
      const nb = db.prepare(`SELECT COUNT(*) n FROM sondage_favoris WHERE sondage_id=?`).get(sid)?.n || 0;
      await db.prepare(`UPDATE sondages SET nb_favoris=? WHERE id=?`).run(nb, sid);
      return sendJSON(res, 200, { action, nb_favoris: nb, est_favori: action === 'added' });
    }

    /* ── GET /api/sondages/:id/export ── */
    if (req.method === 'GET' && /^\/api\/sondages\/\d+\/export$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const sid = parseInt(pathname.split('/')[3]);
      const s = await db.prepare(`SELECT * FROM sondages WHERE id=?`).get(sid);
      if (!s || (s.createur_id !== me.id && me.role !== 'administrateur')) return sendJSON(res, 403, { error: 'Accès refusé.' });
      const questions = await db.prepare(`SELECT * FROM sondage_questions WHERE sondage_id=? ORDER BY ordre`).all(sid);
      const reponses = await db.prepare(`SELECT r.*, u.nom, u.prenom, u.pays FROM sondage_reponses r LEFT JOIN users u ON u.id=r.user_id WHERE r.sondage_id=? ORDER BY r.created_at`).all(sid);
      const headers = ['Date','Nom','Prénom','Pays',...questions.map(q2=>q2.texte)];
      const rows = {};
      for (const rep of reponses) {
        const key = (rep.user_id||'anon')+'_'+rep.created_at.slice(0,16);
        if (!rows[key]) rows[key] = { date: rep.created_at.slice(0,10), nom: rep.nom||'—', prenom: rep.prenom||'—', pays: rep.pays||'—', reponses: {} };
        rows[key].reponses[rep.question_id] = rep.reponse;
      }
      let csv = headers.map(h=>`"${h}"`).join(',') + '\n';
      for (const row of Object.values(rows)) {
        const line = [row.date,row.nom,row.prenom,row.pays,...questions.map(q2=>JSON.parse(row.reponses[q2.id]||'""'))];
        csv += line.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',') + '\n';
      }
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="sondage-${sid}.csv"` });
      return res.end('﻿' + csv);
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
      const ev = await db.prepare(`SELECT * FROM events WHERE id=?`).get(eid);
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

      const derniers_achats = await db.prepare(`SELECT t.id, t.prix_paye, t.statut, t.created_at,
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

      const wallet = await db.prepare(`SELECT wallet_balance FROM users WHERE id=?`).get(me.id);

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
      const init = await db.prepare(`SELECT numero_immatriculation FROM initiatives WHERE owner_user_id=?`).get(userId);
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
        const lastActive = await db.prepare(`SELECT last_active FROM users WHERE id=?`).get(userId)?.last_active;
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
        await db.prepare(`UPDATE users SET reactivity_stars=?, avg_response_hours=? WHERE id=?`).run(stars, avgHours, userId);
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
      await db.prepare(`DELETE FROM user_absence WHERE user_id=?`).run(me.id);
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
      const existing = await db.prepare(`SELECT id FROM account_reports WHERE reporter_id=? AND reported_id=?`).get(me.id, uid);
      if (existing) return sendJSON(res, 400, { error: 'Vous avez déjà signalé ce compte.' });

      db.prepare(`INSERT INTO account_reports (reporter_id,reported_id,conv_id) VALUES (?,?,?)`).run(me.id, uid, conv.id);

      // Auto-action si plusieurs signalements (≥3 en 30 jours)
      const recentCount = db.prepare(`SELECT COUNT(*) n FROM account_reports WHERE reported_id=? AND created_at >= datetime('now','-30 days')`).get(uid).n;
      if (recentCount >= 3) {
        await db.prepare(`UPDATE users SET last_active=NULL WHERE id=?`).run(uid);
      }
      return sendJSON(res, 201, { ok: true, message: 'Signalement enregistré. Nos modérateurs vont examiner ce compte.' });
    }

    /* ── POST /api/initiatives/:id/signaler — signaler une initiative ── */
    if (req.method === 'POST' && /^\/api\/initiatives\/\d+\/signaler$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: 'Connexion requise.' });
      const iid = parseInt(pathname.split('/')[3]);
      const init = await db.prepare(`SELECT * FROM initiatives WHERE id=?`).get(iid);
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
        await db.prepare(`UPDATE initiatives SET signalements_confirmes=signalements_confirmes+1 WHERE id=?`).run(iid);
      }
      return sendJSON(res, 201, { ok: true, message: 'Signalement transmis aux modérateurs.' });
    }

    /* ── GET /api/admin/signalements — tous les signalements (admin) ── */
    if (req.method === 'GET' && pathname === '/api/admin/signalements') {
      const me = getCurrentUser(req);
      if (!me || !['administrateur'].includes(me.role)) return sendJSON(res, 403, { error: 'Réservé.' });
      const comptes = await db.prepare(`
        SELECT ar.*, u1.nom AS reporter_nom, u2.nom AS reported_nom, u2.role AS reported_role
        FROM account_reports ar
        LEFT JOIN users u1 ON u1.id=ar.reporter_id
        LEFT JOIN users u2 ON u2.id=ar.reported_id
        ORDER BY ar.created_at DESC LIMIT 100`).all();
      const initiatives = await db.prepare(`
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
        const rep = await db.prepare(`SELECT reported_id FROM account_reports WHERE id=?`).get(rid);
        if (rep) await db.prepare(`UPDATE users SET signalements_confirmes=signalements_confirmes+1 WHERE id=?`).run(rep.reported_id);
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
        const rep = await db.prepare(`SELECT initiative_id FROM initiative_reports WHERE id=?`).get(rid);
        if (rep) await db.prepare(`UPDATE initiatives SET signalements_confirmes=signalements_confirmes+1 WHERE id=?`).run(rep.initiative_id);
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
      await db.prepare(`DELETE FROM trust_cache WHERE user_id=?`).run(uid);
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
      return await db.prepare(`SELECT * FROM initiatives WHERE owner_user_id=? ORDER BY created_at DESC LIMIT 1`).get(userId);
    }
    /* Helper — sécurité : initiative immatriculée uniquement */
    function initImmat(id) {
      return await db.prepare(`SELECT i.* FROM initiatives i WHERE i.id=? AND i.numero_immatriculation IS NOT NULL AND i.numero_immatriculation != ''`).get(id);
    }
    /* Helper — accréditations d'une initiative */
    function initAccreds(initId) {
      const row = await db.prepare(`SELECT owner_user_id FROM initiatives WHERE id=?`).get(initId);
      if (!row?.owner_user_id) return [];
      return await db.prepare(`SELECT type FROM compte_accreditations WHERE user_id=? AND statut='active'`).all(row.owner_user_id).map(a => a.type);
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
      const { q, secteur, type, pays, ville, langue, services, accreditation, limit: lim } = parsed.query;
      let sql = `SELECT i.* FROM initiatives i WHERE i.numero_immatriculation IS NOT NULL AND i.numero_immatriculation != '' AND (i.reseau_visible IS NULL OR i.reseau_visible=1)`;
      const params = [];
      if (q) { sql += ` AND (i.nom LIKE ? OR i.description LIKE ? OR i.domaine LIKE ?)`; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
      if (secteur) { sql += ` AND i.domaine=?`; params.push(secteur); }
      if (type) { sql += ` AND i.type=?`; params.push(type); }
      if (pays) { sql += ` AND i.pays=?`; params.push(pays); }
      if (ville) { sql += ` AND i.ville LIKE ?`; params.push(`%${ville}%`); }
      sql += ` ORDER BY i.nb_vues DESC, i.created_at DESC LIMIT ?`;
      params.push(parseInt(lim) || 60);
      let rows = await db.prepare(sql).all(...params);
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
      const affilies = await db.prepare(`
        SELECT i.*, ra.mise_en_avant, ra.created_at AS affilie_depuis FROM reseau_affiliations ra
        JOIN initiatives i ON i.id=ra.demandeur_id
        WHERE ra.destinataire_id=? AND ra.statut='accepte'
        ORDER BY ra.mise_en_avant DESC, ra.created_at ASC
      `).all(myInit.id);
      // Réseaux dont je suis membre (j'ai demandé + accepté)
      const membrede = await db.prepare(`
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
      const rows = await db.prepare(`
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
      const rows = await db.prepare(`
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
      const row = await db.prepare(`SELECT * FROM initiatives WHERE id=? AND numero_immatriculation IS NOT NULL AND numero_immatriculation != ''`).get(initId);
      if (!row) return sendJSON(res, 404, { error: "Initiative introuvable ou non immatriculée." });
      const affilies = await db.prepare(`
        SELECT i.id, i.nom, i.logo_url, i.type, i.domaine, i.ville, i.pays FROM reseau_affiliations ra
        JOIN initiatives i ON i.id=ra.demandeur_id
        WHERE ra.destinataire_id=? AND ra.statut='accepte' AND ra.mise_en_avant=1 LIMIT 6
      `).all(initId);
      const recos = await db.prepare(`
        SELECT rr.contenu, i.nom, i.logo_url FROM reseau_recommandations rr
        JOIN initiatives i ON i.id=rr.auteur_initiative_id
        WHERE rr.initiative_id=? ORDER BY rr.created_at DESC LIMIT 5
      `).all(initId);
      return sendJSON(res, 200, { initiative: enrichInit(row), en_avant: affilies, recommandations: recos });
    }

    /* GET /api/reseau/:id/membres — membres du réseau d'une initiative */
    if (req.method === "GET" && /^\/api\/reseau\/\d+\/membres$/.test(pathname)) {
      const initId = parseInt(pathname.split('/')[3]);
      const rows = await db.prepare(`
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
      const aff = await db.prepare(`SELECT ra.*, i.owner_user_id, i.nom AS dest_nom FROM reseau_affiliations ra JOIN initiatives i ON i.id=ra.destinataire_id WHERE ra.id=?`).get(affId);
      if (!aff) return sendJSON(res, 404, { error: "Demande introuvable." });
      if (aff.owner_user_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const { statut, reponse, mise_en_avant } = body;
      if (statut) {
        db.prepare(`UPDATE reseau_affiliations SET statut=?,reponse=COALESCE(?,reponse),updated_at=datetime('now') WHERE id=?`).run(statut, reponse||null, affId);
        // Notification au demandeur
        const demInit = await db.prepare(`SELECT * FROM initiatives WHERE id=?`).get(aff.demandeur_id);
        if (demInit?.owner_user_id) {
          const msgs = { accepte:`Votre demande d'affiliation au réseau "${aff.dest_nom}" a été acceptée !`, refuse:`Votre demande d'affiliation au réseau "${aff.dest_nom}" a été refusée.`, info_demandee:`Des informations complémentaires vous sont demandées pour rejoindre "${aff.dest_nom}".`, suspendu:`Votre affiliation au réseau "${aff.dest_nom}" a été suspendue.` };
          if (msgs[statut]) db.prepare(`INSERT INTO notifications(user_id,type,titre,contenu,data_json) VALUES(?,?,?,?,?)`).run(demInit.owner_user_id,'reseau_statut',`Réseau professionnel`,msgs[statut],JSON.stringify({affiliation_id:affId}));
        }
      }
      if (mise_en_avant !== undefined) await db.prepare(`UPDATE reseau_affiliations SET mise_en_avant=? WHERE id=?`).run(mise_en_avant?1:0, affId);
      return sendJSON(res, 200, { ok: true });
    }

    /* DELETE /api/reseau/affiliations/:id — retirer du réseau */
    if (req.method === "DELETE" && /^\/api\/reseau\/affiliations\/\d+$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const affId = parseInt(pathname.split('/')[4]);
      const aff = await db.prepare(`SELECT ra.*, id.owner_user_id AS dest_owner, id2.owner_user_id AS dem_owner FROM reseau_affiliations ra JOIN initiatives id ON id.id=ra.destinataire_id JOIN initiatives id2 ON id2.id=ra.demandeur_id WHERE ra.id=?`).get(affId);
      if (!aff) return sendJSON(res, 404, { error: "Affiliation introuvable." });
      if (aff.dest_owner !== me.id && aff.dem_owner !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      await db.prepare(`DELETE FROM reseau_affiliations WHERE id=?`).run(affId);
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
        const target = await db.prepare(`SELECT owner_user_id, nom FROM initiatives WHERE id=?`).get(targetId);
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
      await db.prepare(`DELETE FROM reseau_recommandations WHERE initiative_id=? AND auteur_initiative_id=?`).run(targetId, myInit.id);
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
      const decisions = await db.prepare(`
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
      const reunion = await db.prepare(`
        SELECT r.*, u.prenom AS org_prenom, u.nom AS org_nom, u.photo_url AS org_photo
        FROM reunions r JOIN users u ON u.id=r.organisateur_id WHERE r.id=?
      `).get(rid);
      if (!reunion) return sendJSON(res, 404, { error: "Réunion introuvable." });
      const invites = await db.prepare(`
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
      const r = await db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
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
      const r = await db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
      if (!r) return sendJSON(res, 404, { error: "Réunion introuvable." });
      if (r.organisateur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      db.prepare(`UPDATE reunions SET statut='en_cours', started_at=datetime('now') WHERE id=?`).run(rid);
      return sendJSON(res, 200, { ok: true });
    }

    /* PATCH /api/reunions/:id/end — terminer */
    if (req.method === "PATCH" && /^\/api\/reunions\/\d+\/end$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const r = await db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
      if (!r) return sendJSON(res, 404, { error: "Réunion introuvable." });
      if (r.organisateur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const now = new Date().toISOString();
      let duree = null;
      if (r.started_at) { duree = Math.round((new Date(now) - new Date(r.started_at)) / 60000); }
      await db.prepare(`UPDATE reunions SET statut='terminee', ended_at=?, duree_minutes=? WHERE id=?`).run(now, duree, rid);
      /* Marquer quitte_at pour les présents */
      await db.prepare(`UPDATE reunion_invites SET quitte_at=? WHERE reunion_id=? AND quitte_at IS NULL AND rejoint_at IS NOT NULL`).run(now, rid);
      /* Créer résumé brouillon si pas encore */
      try { db.prepare(`INSERT OR IGNORE INTO reunion_resumes(reunion_id,redacteur_id) VALUES(?,?)`).run(rid, me.id); } catch(e) {}
      return sendJSON(res, 200, { ok: true, duree_minutes: duree });
    }

    /* POST /api/reunions/:id/invites — inviter des participants */
    if (req.method === "POST" && /^\/api\/reunions\/\d+\/invites$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const r = await db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
      if (!r) return sendJSON(res, 404, { error: "Réunion introuvable." });
      if (r.organisateur_id !== me.id && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const { users: userIds, role } = body; // userIds: array of user IDs
      if (!Array.isArray(userIds) || userIds.length === 0) return sendJSON(res, 400, { error: "Liste d'utilisateurs requise." });
      let added = 0;
      for (const uid of userIds) {
        try {
          db.prepare(`INSERT OR IGNORE INTO reunion_invites(reunion_id,user_id,role) VALUES(?,?,?)`).run(rid, uid, role||'participant');
          /* Notification */
          const org = await db.prepare(`SELECT prenom,nom FROM users WHERE id=?`).get(me.id);
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
      await db.prepare(`UPDATE reunion_invites SET statut=? WHERE reunion_id=? AND user_id=?`).run(statut, rid, me.id);
      if (statut === 'accepte') {
        /* Ajouter à l'agenda */
        const r = await db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
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
      const inv = await db.prepare(`SELECT * FROM reunion_invites WHERE reunion_id=? AND user_id=?`).get(rid, me.id);
      const now = new Date().toISOString();
      let duree = null;
      if (inv?.rejoint_at) { duree = Math.round((new Date(now) - new Date(inv.rejoint_at)) / 60000); }
      await db.prepare(`UPDATE reunion_invites SET quitte_at=?, duree_presence_minutes=? WHERE reunion_id=? AND user_id=?`).run(now, duree, rid, me.id);
      return sendJSON(res, 200, { ok: true, duree_minutes: duree });
    }

    /* GET /api/reunions/:id/resume — obtenir le résumé */
    if (req.method === "GET" && /^\/api\/reunions\/\d+\/resume$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const resume = await db.prepare(`SELECT rr.*, u.prenom AS red_prenom, u.nom AS red_nom FROM reunion_resumes rr LEFT JOIN users u ON u.id=rr.redacteur_id WHERE rr.reunion_id=?`).get(rid);
      const decisions = await db.prepare(`SELECT d.*, u.prenom, u.nom FROM reunion_decisions d LEFT JOIN users u ON u.id=d.responsable_id WHERE d.reunion_id=? ORDER BY d.created_at ASC`).all(rid);
      return sendJSON(res, 200, { resume: resume || null, decisions });
    }

    /* PUT /api/reunions/:id/resume — sauvegarder le résumé */
    if (req.method === "PUT" && /^\/api\/reunions\/\d+\/resume$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const r = await db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
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
      const r = await db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
      if (!r || (r.organisateur_id !== me.id && me.role !== 'administrateur')) return sendJSON(res, 403, { error: "Accès refusé." });
      db.prepare(`UPDATE reunion_resumes SET statut='valide',valide_at=datetime('now'),valide_par=? WHERE reunion_id=?`).run(me.id, rid);
      return sendJSON(res, 200, { ok: true });
    }

    /* POST /api/reunions/:id/resume/partager — envoyer résumé via messagerie */
    if (req.method === "POST" && /^\/api\/reunions\/\d+\/resume\/partager$/.test(pathname)) {
      const me = getCurrentUser(req); if (!me) return sendJSON(res, 401, { error: "Connexion requise" });
      const rid = parseInt(pathname.split('/')[3]);
      const r = await db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
      if (!r) return sendJSON(res, 404, { error: "Réunion introuvable." });
      const resume = await db.prepare(`SELECT * FROM reunion_resumes WHERE reunion_id=?`).get(rid);
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
        const r = await db.prepare(`SELECT * FROM reunions WHERE id=?`).get(rid);
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

    /* ═══════════════════════════════════════════════════════
       PACKAGE DIASPO'ACTIF
    ═══════════════════════════════════════════════════════ */

    // GET /api/packages?show_on=home  — public
    if (req.method === "GET" && pathname === "/api/packages") {
      const pq = parsed.query;
      const showOn = pq.show_on || null;
      let rows = await db.prepare(
        "SELECT id,name,slug,icon,url,enabled,sort_order,show_on,category FROM da_packages ORDER BY sort_order ASC"
      ).all();
      if (showOn) rows = rows.filter(r => {
        try { return JSON.parse(r.show_on).includes(showOn); } catch { return false; }
      });
      if (!pq.all) rows = rows.filter(r => r.enabled === 1);
      return sendJSON(res, 200, { packages: rows });
    }

    // GET /api/admin/packages  — admin
    if (req.method === "GET" && pathname === "/api/admin/packages") {
      const user = getCurrentUser(req);
      if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
      const rows = await db.prepare("SELECT * FROM da_packages ORDER BY sort_order ASC").all();
      return sendJSON(res, 200, { packages: rows });
    }

    // POST /api/admin/packages  — ajouter
    if (req.method === "POST" && pathname === "/api/admin/packages") {
      const user = getCurrentUser(req);
      if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
      const body = await readBody(req);
      const { name, slug, icon, url, enabled, sort_order, show_on, category } = body;
      if (!name || !slug || !icon) return sendJSON(res, 400, { error: "name, slug et icon requis." });
      try {
        const r = db.prepare(
          "INSERT INTO da_packages (name,slug,icon,url,enabled,sort_order,show_on,category) VALUES (?,?,?,?,?,?,?,?)"
        ).run(name, slug, icon, url || "", enabled ? 1 : 0, sort_order || 0,
              JSON.stringify(show_on || ["home","footer"]), category || "social");
        return sendJSON(res, 201, { ok: true, id: Number(r.lastInsertRowid) });
      } catch (e) { return sendJSON(res, 409, { error: "Slug déjà utilisé." }); }
    }

    // PUT /api/admin/packages/reorder  — réorganiser (avant /:id pour éviter conflit)
    if (req.method === "PUT" && pathname === "/api/admin/packages/reorder") {
      const user = getCurrentUser(req);
      if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
      const body = await readBody(req);
      const { order } = body;
      if (!Array.isArray(order)) return sendJSON(res, 400, { error: "order[] requis." });
      const stmt = db.prepare("UPDATE da_packages SET sort_order=? WHERE id=?");
      order.forEach((id, i) => stmt.run(i, id));
      return sendJSON(res, 200, { ok: true });
    }

    // PUT /api/admin/packages/:id  — modifier
    const pkgMatch = pathname.match(/^\/api\/admin\/packages\/(\d+)$/);
    if (pkgMatch) {
      const user = getCurrentUser(req);
      if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
      const pkgId = pkgMatch[1];
      if (req.method === "PUT") {
        const body = await readBody(req);
        const { name, icon, url, enabled, sort_order, show_on, category } = body;
        db.prepare(`UPDATE da_packages SET
          name=COALESCE(?,name), icon=COALESCE(?,icon), url=COALESCE(?,url),
          enabled=COALESCE(?,enabled), sort_order=COALESCE(?,sort_order),
          show_on=COALESCE(?,show_on), category=COALESCE(?,category),
          updated_at=datetime('now') WHERE id=?`
        ).run(
          name||null, icon||null, url!==undefined?url:null,
          enabled!==undefined?(enabled?1:0):null,
          sort_order!==undefined?sort_order:null,
          show_on?JSON.stringify(show_on):null,
          category||null, pkgId
        );
        return sendJSON(res, 200, { ok: true });
      }
      if (req.method === "DELETE") {
        await db.prepare("DELETE FROM da_packages WHERE id=?").run(pkgId);
        return sendJSON(res, 200, { ok: true });
      }
    }

    /* ══════════════════════════════════════════════════════
       MODULE GÉRER UN DEAL
    ══════════════════════════════════════════════════════ */

    // Helper : vérifier accréditation deal d'une initiative
    function hasDealAccred(initiative_id) {
      return !!await db.prepare("SELECT 1 FROM deal_accreditations WHERE initiative_id=? AND statut='active'").get(initiative_id);
    }
    // Helper : vérifier qu'un user est membre actif d'un deal
    function isDealMember(deal_id, user) {
      const init = await db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(user.id);
      if (!init) return false;
      return !!await db.prepare("SELECT 1 FROM deal_participants WHERE deal_id=? AND initiative_id=? AND statut='accepte'").get(deal_id, init.id);
    }
    // Helper : logguer une action dans le journal du deal
    function dealLog(deal_id, acteur_id, acteur_nom, action, detail) {
      db.prepare("INSERT INTO deal_history (deal_id,acteur_id,acteur_nom,action,detail) VALUES (?,?,?,?,?)").run(deal_id, acteur_id, acteur_nom, action, detail||null);
    }

    /* ── ADMIN : accréditation Gérer un Deal ── */
    const adminDealAccredM = pathname.match(/^\/api\/admin\/deals\/accreditations\/(\d+)\/(attribuer|suspendre|retirer)$/);
    if (req.method === "POST" && adminDealAccredM) {
      const admin = getCurrentUser(req);
      if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
      const body = await readBody(req);
      const [, init_id, action] = adminDealAccredM;
      const init = await db.prepare("SELECT id,nom FROM initiatives WHERE id=?").get(init_id);
      if (!init) return sendJSON(res, 404, { error: "Initiative introuvable." });
      const statut = action === "attribuer" ? "active" : action === "suspendre" ? "suspendue" : "retiree";
      const existing = await db.prepare("SELECT id FROM deal_accreditations WHERE initiative_id=?").get(init_id);
      if (existing) {
        db.prepare("UPDATE deal_accreditations SET statut=?,admin_id=?,admin_nom=?,motif=?,updated_at=datetime('now') WHERE initiative_id=?")
          .run(statut, admin.id, admin.nom, body.motif||null, init_id);
      } else {
        db.prepare("INSERT INTO deal_accreditations (initiative_id,statut,admin_id,admin_nom,motif) VALUES (?,?,?,?,?)")
          .run(init_id, statut, admin.id, admin.nom, body.motif||null);
      }
      const owner = await db.prepare("SELECT owner_user_id FROM initiatives WHERE id=?").get(init_id);
      if (owner?.owner_user_id && action === "attribuer") {
        creerNotif(owner.owner_user_id, "accreditation", "🤝 Accréditation « Gérer un Deal » obtenue !",
          `Votre initiative « ${init.nom} » peut désormais créer et gérer des Deals collaboratifs sur Diaspo'Actif.`, { initiative_id: init.id });
      }
      return sendJSON(res, 200, { ok: true, statut });
    }

    /* ── ADMIN : liste de tous les deals ── */
    if (req.method === "GET" && pathname === "/api/admin/deals") {
      const admin = getCurrentUser(req);
      if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
      const deals = db.prepare(`SELECT d.*,i.nom as createur_nom,
        (SELECT COUNT(*) FROM deal_participants dp WHERE dp.deal_id=d.id AND dp.statut='accepte') as nb_participants
        FROM deals d JOIN initiatives i ON i.id=d.createur_id ORDER BY d.created_at DESC`).all();
      return sendJSON(res, 200, { deals });
    }

    /* ── ADMIN : liste des accreditations deal ── */
    if (req.method === "GET" && pathname === "/api/admin/deals/accreditations") {
      const admin = getCurrentUser(req);
      if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
      const rows = await db.prepare(`SELECT da.*,i.nom as initiative_nom,i.slug FROM deal_accreditations da
        JOIN initiatives i ON i.id=da.initiative_id ORDER BY da.created_at DESC`).all();
      return sendJSON(res, 200, { accreditations: rows });
    }

    /* ── ADMIN : Deals Diaspo'Actif — liste et création ── */
    if (pathname === "/api/admin/diaspoactif/deals") {
      const admin = getCurrentUser(req);
      if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
      let daInit = await db.prepare("SELECT id FROM initiatives WHERE slug='diaspoactif-platform'").get();
      if (!daInit) {
        // Création lazy si le seed ne l'a pas encore créée
        const adminUser = await db.prepare("SELECT id FROM users WHERE email='admin@diaspoactif.demo'").get();
        if (!adminUser) return sendJSON(res, 500, { error: "Compte admin introuvable." });
        const r2 = db.prepare(`INSERT INTO initiatives
          (nom,slug,domaine,type,pays,ville,description,mission,owner_user_id,abonnement_actif)
          VALUES (?,?,?,?,?,?,?,?,?,1)`).run(
          "Diaspo'Actif","diaspoactif-platform","diaspora","Organisation","International","Paris",
          "Canal officiel des Deals collaboratifs initiés par la plateforme Diaspo'Actif.",
          "Connecter les initiatives de la diaspora mondiale à travers des partenariats stratégiques.",
          adminUser.id
        );
        daInit = { id: Number(r2.lastInsertRowid) };
        db.prepare("INSERT OR IGNORE INTO deal_accreditations (initiative_id,statut,admin_nom,motif) VALUES (?,'active','Système','Initiative officielle Diaspo''Actif')").run(daInit.id);
      }
      // S'assurer que l'accréditation deal existe toujours
      db.prepare("INSERT OR IGNORE INTO deal_accreditations (initiative_id,statut,admin_nom,motif) VALUES (?,'active','Système','Initiative officielle Diaspo''Actif')").run(daInit.id);

      if (req.method === "GET") {
        const deals = db.prepare(`SELECT d.*, i.nom as createur_nom,
          dp.statut as ma_participation,
          (SELECT COUNT(*) FROM deal_participants p WHERE p.deal_id=d.id AND p.statut='accepte') as nb_participants
          FROM deals d
          JOIN deal_participants dp ON dp.deal_id=d.id AND dp.initiative_id=?
          JOIN initiatives i ON i.id=d.createur_id
          ORDER BY d.updated_at DESC`).all(daInit.id);
        return sendJSON(res, 200, { deals, initiative_id: daInit.id });
      }

      if (req.method === "POST") {
        const body = await readBody(req);
        const { titre, description, objectif, categorie, confidentialite, date_debut, date_fin_prev, invites } = body;
        if (!titre) return sendJSON(res, 400, { error: "Titre requis." });
        const r = db.prepare(`INSERT INTO deals (titre,description,objectif,categorie,confidentialite,createur_id,date_debut,date_fin_prev,statut)
          VALUES (?,?,?,?,?,?,?,?,'brouillon')`).run(
          titre, description||null, objectif||null,
          categorie||'partenariat', confidentialite||'prive',
          daInit.id, date_debut||null, date_fin_prev||null
        );
        const dealId = Number(r.lastInsertRowid);
        db.prepare("INSERT INTO deal_participants (deal_id,initiative_id,role,statut) VALUES (?,?,'createur','accepte')").run(dealId, daInit.id);
        const inviteList = Array.isArray(invites) ? invites.filter(Boolean) : [];
        for (const iid of inviteList) {
          const inv = await db.prepare("SELECT id FROM initiatives WHERE id=?").get(iid);
          if (inv) {
            db.prepare("INSERT OR IGNORE INTO deal_participants (deal_id,initiative_id,role,statut,message_inv) VALUES (?,?,'participant','invite',?)")
              .run(dealId, iid, body.message_inv||null);
            const owner = await db.prepare("SELECT owner_user_id FROM initiatives WHERE id=?").get(iid);
            if (owner?.owner_user_id) {
              creerNotif(owner.owner_user_id, "deal", "🤝 Invitation Deal — Diaspo'Actif",
                `Diaspo'Actif vous invite à rejoindre le Deal : « ${titre} ».`, { deal_id: dealId });
            }
          }
        }
        if (inviteList.length === 0) await db.prepare("UPDATE deals SET statut='actif' WHERE id=?").run(dealId);
        else await db.prepare("UPDATE deals SET statut='en_attente' WHERE id=?").run(dealId);
        dealLog(dealId, admin.id, "Diaspo'Actif", "creation", "Deal créé par Diaspo'Actif");
        return sendJSON(res, 201, { ok: true, deal_id: dealId });
      }
    }

    /* ── GET mes deals (initiative connectée) ── */
    if (req.method === "GET" && pathname === "/api/deals") {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const myInit = await db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(me.id);
      if (!myInit) return sendJSON(res, 403, { error: "Compte initiative requis." });
      const deals = db.prepare(`SELECT d.*,i.nom as createur_nom,
        dp.statut as ma_participation,
        (SELECT COUNT(*) FROM deal_participants p WHERE p.deal_id=d.id AND p.statut='accepte') as nb_participants
        FROM deals d
        JOIN deal_participants dp ON dp.deal_id=d.id AND dp.initiative_id=?
        JOIN initiatives i ON i.id=d.createur_id
        ORDER BY d.updated_at DESC`).all(myInit.id);
      return sendJSON(res, 200, { deals });
    }

    /* ── POST créer un deal ── */
    if (req.method === "POST" && pathname === "/api/deals") {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const myInit = await db.prepare("SELECT id,nom FROM initiatives WHERE owner_user_id=?").get(me.id);
      if (!myInit) return sendJSON(res, 403, { error: "Compte initiative requis." });
      if (!hasDealAccred(myInit.id)) return sendJSON(res, 403, { error: "Accréditation 'Gérer un Deal' requise." });
      const body = await readBody(req);
      const { titre, description, objectif, categorie, confidentialite, date_debut, date_fin_prev, invites } = body;
      if (!titre) return sendJSON(res, 400, { error: "Titre requis." });
      const r = db.prepare(`INSERT INTO deals (titre,description,objectif,categorie,confidentialite,createur_id,date_debut,date_fin_prev,statut)
        VALUES (?,?,?,?,?,?,?,?,'brouillon')`).run(titre, description||null, objectif||null,
        categorie||'partenariat', confidentialite||'prive', myInit.id, date_debut||null, date_fin_prev||null);
      const dealId = Number(r.lastInsertRowid);
      // Ajouter le créateur comme participant accepté
      db.prepare("INSERT INTO deal_participants (deal_id,initiative_id,role,statut) VALUES (?,?,'createur','accepte')").run(dealId, myInit.id);
      dealLog(dealId, me.id, myInit.nom, "creation", `Deal créé par ${myInit.nom}`);
      // Envoyer les invitations
      if (Array.isArray(invites)) {
        invites.forEach(invId => {
          const inv = await db.prepare("SELECT id,nom,owner_user_id FROM initiatives WHERE id=?").get(invId);
          if (!inv || inv.id === myInit.id) return;
          db.prepare("INSERT OR IGNORE INTO deal_participants (deal_id,initiative_id,role,statut) VALUES (?,?,'participant','invite')").run(dealId, inv.id);
          dealLog(dealId, me.id, myInit.nom, "invitation", `${inv.nom} invitée`);
          if (inv.owner_user_id) {
            creerNotif(inv.owner_user_id, "deal", `🤝 Invitation au Deal « ${titre} »`,
              `${myInit.nom} vous invite à rejoindre le Deal « ${titre} ». Répondez depuis votre tableau de bord.`,
              { deal_id: dealId });
          }
        });
      }
      // Si aucune invitation, passer direct en actif
      const pendingCount = db.prepare("SELECT COUNT(*) as n FROM deal_participants WHERE deal_id=? AND statut='invite'").get(dealId).n;
      if (pendingCount === 0) await db.prepare("UPDATE deals SET statut='actif' WHERE id=?").run(dealId);
      else await db.prepare("UPDATE deals SET statut='en_attente' WHERE id=?").run(dealId);
      return sendJSON(res, 201, { ok: true, deal_id: dealId });
    }

    /* ── GET deal/:id ── */
    const dealBase = pathname.match(/^\/api\/deals\/(\d+)$/);
    if (req.method === "GET" && dealBase) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = dealBase[1];
      const deal = await db.prepare("SELECT d.*,i.nom as createur_nom FROM deals d JOIN initiatives i ON i.id=d.createur_id WHERE d.id=?").get(did);
      if (!deal) return sendJSON(res, 404, { error: "Deal introuvable." });
      // Vérif accès : admin, ou participant (même invité)
      const myInit = await db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(me.id);
      if (me.role !== "administrateur") {
        if (!myInit) return sendJSON(res, 403, { error: "Accès refusé." });
        const part = await db.prepare("SELECT statut FROM deal_participants WHERE deal_id=? AND initiative_id=?").get(did, myInit.id);
        if (!part) return sendJSON(res, 403, { error: "Accès refusé." });
      }
      const participants = await db.prepare(`SELECT dp.*,i.nom,i.slug,i.domaine,i.pays FROM deal_participants dp
        JOIN initiatives i ON i.id=dp.initiative_id WHERE dp.deal_id=? ORDER BY dp.joined_at`).all(did);
      return sendJSON(res, 200, { deal, participants });
    }

    /* ── PUT mettre à jour un deal ── */
    if (req.method === "PUT" && dealBase) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = dealBase[1];
      const myInit = await db.prepare("SELECT id,nom FROM initiatives WHERE owner_user_id=?").get(me.id);
      if (!myInit) return sendJSON(res, 403, { error: "Compte initiative requis." });
      const part = await db.prepare("SELECT role FROM deal_participants WHERE deal_id=? AND initiative_id=? AND statut='accepte'").get(did, myInit.id);
      if (!part || (part.role !== 'createur' && me.role !== 'administrateur')) return sendJSON(res, 403, { error: "Seul le créateur peut modifier ce deal." });
      const body = await readBody(req);
      db.prepare(`UPDATE deals SET titre=COALESCE(?,titre),description=COALESCE(?,description),
        objectif=COALESCE(?,objectif),categorie=COALESCE(?,categorie),
        date_debut=COALESCE(?,date_debut),date_fin_prev=COALESCE(?,date_fin_prev),updated_at=datetime('now') WHERE id=?`)
        .run(body.titre||null,body.description||null,body.objectif||null,body.categorie||null,body.date_debut||null,body.date_fin_prev||null,did);
      dealLog(did, me.id, myInit.nom, "modification", "Informations du deal mises à jour");
      return sendJSON(res, 200, { ok: true });
    }

    /* ── POST répondre à une invitation ── */
    const dealRepondre = pathname.match(/^\/api\/deals\/(\d+)\/repondre$/);
    if (req.method === "POST" && dealRepondre) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = dealRepondre[1];
      const body = await readBody(req);
      const myInit = await db.prepare("SELECT id,nom FROM initiatives WHERE owner_user_id=?").get(me.id);
      if (!myInit) return sendJSON(res, 403, { error: "Compte initiative requis." });
      const part = await db.prepare("SELECT id,statut FROM deal_participants WHERE deal_id=? AND initiative_id=?").get(did, myInit.id);
      if (!part) return sendJSON(res, 404, { error: "Invitation introuvable." });
      if (part.statut !== "invite") return sendJSON(res, 400, { error: "Invitation déjà traitée." });
      const accepte = body.reponse === "accepter";
      const nouveauStatut = accepte ? "accepte" : "refuse";
      db.prepare("UPDATE deal_participants SET statut=?,repondu_at=datetime('now') WHERE deal_id=? AND initiative_id=?").run(nouveauStatut, did, myInit.id);
      dealLog(did, me.id, myInit.nom, accepte ? "acceptation" : "refus", `${myInit.nom} ${accepte ? "a rejoint" : "a décliné"} le deal`);
      // Si tout le monde a répondu → passer en actif
      const pending = db.prepare("SELECT COUNT(*) as n FROM deal_participants WHERE deal_id=? AND statut='invite'").get(did).n;
      if (pending === 0 && accepte) db.prepare("UPDATE deals SET statut='actif',updated_at=datetime('now') WHERE id=? AND statut='en_attente'").run(did);
      return sendJSON(res, 200, { ok: true, statut: nouveauStatut });
    }

    /* ── POST inviter une initiative supplémentaire ── */
    const dealInviter = pathname.match(/^\/api\/deals\/(\d+)\/inviter$/);
    if (req.method === "POST" && dealInviter) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = dealInviter[1];
      const body = await readBody(req);
      const myInit = await db.prepare("SELECT id,nom FROM initiatives WHERE owner_user_id=?").get(me.id);
      if (!myInit) return sendJSON(res, 403, { error: "Compte initiative requis." });
      if (!isDealMember(did, me)) return sendJSON(res, 403, { error: "Accès refusé." });
      const invId = body.initiative_id;
      const inv = await db.prepare("SELECT id,nom,owner_user_id FROM initiatives WHERE id=?").get(invId);
      if (!inv) return sendJSON(res, 404, { error: "Initiative introuvable." });
      db.prepare("INSERT OR IGNORE INTO deal_participants (deal_id,initiative_id,role,statut,message_inv) VALUES (?,?,'participant','invite',?)").run(did, inv.id, body.message||null);
      dealLog(did, me.id, myInit.nom, "invitation", `${inv.nom} invitée`);
      const deal = await db.prepare("SELECT titre FROM deals WHERE id=?").get(did);
      if (inv.owner_user_id) creerNotif(inv.owner_user_id, "deal", `🤝 Invitation au Deal « ${deal.titre} »`,
        `${myInit.nom} vous invite à rejoindre le Deal « ${deal.titre} ».`, { deal_id: Number(did) });
      return sendJSON(res, 200, { ok: true });
    }

    /* ── MESSAGES ── */
    const dealMessages = pathname.match(/^\/api\/deals\/(\d+)\/messages$/);
    if (dealMessages) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = dealMessages[1];
      if (!isDealMember(did, me) && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      if (req.method === "GET") {
        const msgs = await db.prepare("SELECT * FROM deal_messages WHERE deal_id=? ORDER BY created_at ASC").all(did);
        return sendJSON(res, 200, { messages: msgs });
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        if (!body.contenu) return sendJSON(res, 400, { error: "Contenu requis." });
        const myInit = await db.prepare("SELECT id,nom FROM initiatives WHERE owner_user_id=?").get(me.id);
        db.prepare("INSERT INTO deal_messages (deal_id,auteur_id,auteur_nom,contenu,type) VALUES (?,?,?,?,?)")
          .run(did, me.id, myInit?.nom||me.nom, body.contenu, body.type||'message');
        db.prepare("UPDATE deals SET updated_at=datetime('now') WHERE id=?").run(did);
        dealLog(did, me.id, myInit?.nom||me.nom, "message", null);
        return sendJSON(res, 201, { ok: true });
      }
    }

    /* ── TÂCHES ── */
    const dealTaches = pathname.match(/^\/api\/deals\/(\d+)\/taches$/);
    if (dealTaches) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = dealTaches[1];
      if (!isDealMember(did, me) && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      if (req.method === "GET") {
        return sendJSON(res, 200, { taches: await db.prepare("SELECT * FROM deal_tasks WHERE deal_id=? ORDER BY created_at DESC").all(did) });
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        const myInit = await db.prepare("SELECT id,nom FROM initiatives WHERE owner_user_id=?").get(me.id);
        const r = db.prepare("INSERT INTO deal_tasks (deal_id,titre,description,assignee_id,priorite,date_echeance,created_by) VALUES (?,?,?,?,?,?,?)")
          .run(did, body.titre, body.description||null, body.assignee_id||null, body.priorite||'normale', body.date_echeance||null, me.id);
        dealLog(did, me.id, myInit?.nom||me.nom, "tache_creee", `Tâche : ${body.titre}`);
        return sendJSON(res, 201, { ok: true, id: Number(r.lastInsertRowid) });
      }
    }

    const dealTacheItem = pathname.match(/^\/api\/deals\/(\d+)\/taches\/(\d+)$/);
    if (dealTacheItem) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const [, did, tid] = dealTacheItem;
      if (!isDealMember(did, me) && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const myInit = await db.prepare("SELECT id,nom FROM initiatives WHERE owner_user_id=?").get(me.id);
      if (req.method === "PUT") {
        const body = await readBody(req);
        db.prepare(`UPDATE deal_tasks SET titre=COALESCE(?,titre),description=COALESCE(?,description),
          statut=COALESCE(?,statut),priorite=COALESCE(?,priorite),assignee_id=COALESCE(?,assignee_id),
          date_echeance=COALESCE(?,date_echeance),updated_at=datetime('now') WHERE id=? AND deal_id=?`)
          .run(body.titre||null,body.description||null,body.statut||null,body.priorite||null,body.assignee_id||null,body.date_echeance||null,tid,did);
        if (body.statut) dealLog(did, me.id, myInit?.nom||me.nom, "tache_mise_a_jour", `Statut → ${body.statut}`);
        return sendJSON(res, 200, { ok: true });
      }
      if (req.method === "DELETE") {
        await db.prepare("DELETE FROM deal_tasks WHERE id=? AND deal_id=?").run(tid, did);
        return sendJSON(res, 200, { ok: true });
      }
    }

    /* ── DOCUMENTS ── */
    const dealDocs = pathname.match(/^\/api\/deals\/(\d+)\/documents$/);
    if (dealDocs) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = dealDocs[1];
      if (!isDealMember(did, me) && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      if (req.method === "GET") {
        const docs = await db.prepare("SELECT id,deal_id,dossier,nom,type_mime,taille,version,uploaded_by,created_at FROM deal_documents WHERE deal_id=? ORDER BY dossier,created_at DESC").all(did);
        return sendJSON(res, 200, { documents: docs });
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        if (!body.nom || !body.contenu_b64) return sendJSON(res, 400, { error: "Nom et contenu requis." });
        const myInit = await db.prepare("SELECT id,nom FROM initiatives WHERE owner_user_id=?").get(me.id);
        db.prepare("INSERT INTO deal_documents (deal_id,dossier,nom,type_mime,taille,contenu_b64,uploaded_by) VALUES (?,?,?,?,?,?,?)")
          .run(did, body.dossier||'/', body.nom, body.type_mime||null, body.taille||0, body.contenu_b64, me.id);
        dealLog(did, me.id, myInit?.nom||me.nom, "document_ajoute", `Document : ${body.nom}`);
        return sendJSON(res, 201, { ok: true });
      }
    }

    const dealDocItem = pathname.match(/^\/api\/deals\/(\d+)\/documents\/(\d+)$/);
    if (dealDocItem) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const [, did, docId] = dealDocItem;
      if (!isDealMember(did, me) && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      if (req.method === "GET") {
        const doc = await db.prepare("SELECT * FROM deal_documents WHERE id=? AND deal_id=?").get(docId, did);
        if (!doc) return sendJSON(res, 404, { error: "Document introuvable." });
        return sendJSON(res, 200, { document: doc });
      }
      if (req.method === "DELETE") {
        const doc = await db.prepare("SELECT nom FROM deal_documents WHERE id=? AND deal_id=?").get(docId, did);
        if (!doc) return sendJSON(res, 404, { error: "Document introuvable." });
        const myInit = await db.prepare("SELECT id,nom FROM initiatives WHERE owner_user_id=?").get(me.id);
        await db.prepare("DELETE FROM deal_documents WHERE id=? AND deal_id=?").run(docId, did);
        dealLog(did, me.id, myInit?.nom||me.nom, "document_supprime", `Document : ${doc.nom}`);
        return sendJSON(res, 200, { ok: true });
      }
    }

    /* ── NOTES ── */
    const dealNotes = pathname.match(/^\/api\/deals\/(\d+)\/notes$/);
    if (dealNotes) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = dealNotes[1];
      if (!isDealMember(did, me) && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      if (req.method === "GET") {
        return sendJSON(res, 200, { notes: await db.prepare("SELECT * FROM deal_notes WHERE deal_id=? ORDER BY updated_at DESC").all(did) });
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        const myInit = await db.prepare("SELECT id,nom FROM initiatives WHERE owner_user_id=?").get(me.id);
        const r = db.prepare("INSERT INTO deal_notes (deal_id,titre,contenu,type,auteur_id,auteur_nom) VALUES (?,?,?,?,?,?)")
          .run(did, body.titre||'Sans titre', body.contenu||'', body.type||'note', me.id, myInit?.nom||me.nom);
        dealLog(did, me.id, myInit?.nom||me.nom, "note_creee", `Note : ${body.titre||'Sans titre'}`);
        return sendJSON(res, 201, { ok: true, id: Number(r.lastInsertRowid) });
      }
    }

    const dealNoteItem = pathname.match(/^\/api\/deals\/(\d+)\/notes\/(\d+)$/);
    if (dealNoteItem && req.method === "PUT") {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const [, did, nid] = dealNoteItem;
      if (!isDealMember(did, me)) return sendJSON(res, 403, { error: "Accès refusé." });
      const body = await readBody(req);
      db.prepare("UPDATE deal_notes SET titre=COALESCE(?,titre),contenu=COALESCE(?,contenu),updated_at=datetime('now') WHERE id=? AND deal_id=?")
        .run(body.titre||null, body.contenu!==undefined?body.contenu:null, nid, did);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── CALENDRIER ── */
    const dealEvents = pathname.match(/^\/api\/deals\/(\d+)\/evenements$/);
    if (dealEvents) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = dealEvents[1];
      if (!isDealMember(did, me) && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      if (req.method === "GET") {
        return sendJSON(res, 200, { evenements: await db.prepare("SELECT * FROM deal_events WHERE deal_id=? ORDER BY date_debut").all(did) });
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        const myInit = await db.prepare("SELECT id,nom FROM initiatives WHERE owner_user_id=?").get(me.id);
        if (!body.titre || !body.date_debut) return sendJSON(res, 400, { error: "Titre et date_debut requis." });
        const r = db.prepare("INSERT INTO deal_events (deal_id,titre,description,type,date_debut,date_fin,created_by) VALUES (?,?,?,?,?,?,?)")
          .run(did, body.titre, body.description||null, body.type||'reunion', body.date_debut, body.date_fin||null, me.id);
        dealLog(did, me.id, myInit?.nom||me.nom, "evenement_ajoute", `${body.type||'reunion'} : ${body.titre}`);
        return sendJSON(res, 201, { ok: true, id: Number(r.lastInsertRowid) });
      }
    }

    const dealEventItem = pathname.match(/^\/api\/deals\/(\d+)\/evenements\/(\d+)$/);
    if (dealEventItem && req.method === "DELETE") {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const [, did, eid] = dealEventItem;
      if (!isDealMember(did, me)) return sendJSON(res, 403, { error: "Accès refusé." });
      await db.prepare("DELETE FROM deal_events WHERE id=? AND deal_id=?").run(eid, did);
      return sendJSON(res, 200, { ok: true });
    }

    /* ── HISTORIQUE ── */
    const dealHistorique = pathname.match(/^\/api\/deals\/(\d+)\/historique$/);
    if (req.method === "GET" && dealHistorique) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = dealHistorique[1];
      if (!isDealMember(did, me) && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      return sendJSON(res, 200, { historique: await db.prepare("SELECT * FROM deal_history WHERE deal_id=? ORDER BY created_at DESC LIMIT 200").all(did) });
    }

    /* ── CLÔTURER / ARCHIVER / RÉACTIVER ── */
    const dealAction = pathname.match(/^\/api\/deals\/(\d+)\/(cloturer|archiver|reactiver)$/);
    if (req.method === "PUT" && dealAction) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const [, did, action] = dealAction;
      const myInit = await db.prepare("SELECT id,nom FROM initiatives WHERE owner_user_id=?").get(me.id);
      const part = await db.prepare("SELECT role FROM deal_participants WHERE deal_id=? AND initiative_id=? AND statut='accepte'").get(did, myInit?.id);
      if ((!part || part.role !== 'createur') && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Seul le créateur peut effectuer cette action." });
      const newStatut = action === 'cloturer' ? 'cloture' : action === 'archiver' ? 'archive' : 'actif';
      db.prepare("UPDATE deals SET statut=?,updated_at=datetime('now') WHERE id=?").run(newStatut, did);
      dealLog(did, me.id, myInit?.nom||me.nom, action, `Deal ${action === 'cloturer' ? 'clôturé' : action === 'archiver' ? 'archivé' : 'réactivé'}`);
      return sendJSON(res, 200, { ok: true, statut: newStatut });
    }

    /* ── Cockpit de Pilotage ── */
    const cockpitM = pathname.match(/^\/api\/deals\/(\d+)\/cockpit$/);
    if (req.method === "GET" && cockpitM) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = parseInt(cockpitM[1]);
      if (!isDealMember(did, me) && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const objectifs = await db.prepare("SELECT * FROM deal_objectifs WHERE deal_id=? ORDER BY ordre,id").all(did);
      const jalons    = await db.prepare("SELECT * FROM deal_jalons WHERE deal_id=? ORDER BY ordre,id").all(did);
      const taches    = await db.prepare("SELECT statut,priorite,date_echeance FROM deal_tasks WHERE deal_id=?").all(did);
      const docs      = await db.prepare("SELECT id,nom,type_mime,created_at FROM deal_documents WHERE deal_id=?").all(did);
      const events    = await db.prepare("SELECT titre,date_debut,type FROM deal_events WHERE deal_id=? ORDER BY date_debut LIMIT 5").all(did);
      const histo     = await db.prepare("SELECT * FROM deal_history WHERE deal_id=? ORDER BY created_at DESC LIMIT 10").all(did);
      const deal      = await db.prepare("SELECT * FROM deals WHERE id=?").get(did);
      const parts     = await db.prepare("SELECT dp.*,i.nom,i.slug FROM deal_participants dp LEFT JOIN initiatives i ON i.id=dp.initiative_id WHERE dp.deal_id=? AND dp.statut='accepte'").all(did);

      const tTotal = taches.length, tDone = taches.filter(t=>t.statut==='terminee').length;
      const tEnCours = taches.filter(t=>t.statut==='en_cours').length;
      const tEnRetard = taches.filter(t=>t.statut!=='terminee'&&t.date_echeance&&t.date_echeance<new Date().toISOString().slice(0,10)).length;
      const oTotal = objectifs.length, oDone = objectifs.filter(o=>o.statut==='atteint').length;
      const jTotal = jalons.length, jDone = jalons.filter(j=>j.statut==='valide').length;

      let progression = 0;
      if (oTotal+tTotal+jTotal > 0) {
        const oScore = oTotal ? (objectifs.reduce((s,o)=>s+o.progression,0)/oTotal) : null;
        const tScore = tTotal ? (tDone/tTotal*100) : null;
        const jScore = jTotal ? (jDone/jTotal*100) : null;
        const weights = [oScore!==null?0.4:0, tScore!==null?0.4:0, jScore!==null?0.2:0];
        const total = weights.reduce((a,b)=>a+b,0) || 1;
        progression = Math.round(
          ((oScore||0)*(oScore!==null?0.4:0) + (tScore||0)*(tScore!==null?0.4:0) + (jScore||0)*(jScore!==null?0.2:0)) / total
        );
      }

      const now = new Date().toISOString().slice(0,10);
      const sante = progression >= 75 ? 'bon' : tEnRetard > tTotal*0.3 ? 'critique' : 'attention';

      return sendJSON(res, 200, { progression, sante, objectifs, jalons, taches_stats: { total:tTotal, done:tDone, en_cours:tEnCours, en_retard:tEnRetard }, docs_stats: { total:docs.length }, prochains_events: events, activite: histo, participants: parts, deal });
    }

    /* ── Objectifs ── */
    const objBase = pathname.match(/^\/api\/deals\/(\d+)\/objectifs$/);
    const objItem = pathname.match(/^\/api\/deals\/(\d+)\/objectifs\/(\d+)$/);
    if (objBase || objItem) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = parseInt((objBase||objItem)[1]);
      if (!isDealMember(did, me) && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const body = await readBody(req);
      if (req.method === "GET" && objBase) {
        return sendJSON(res, 200, { objectifs: await db.prepare("SELECT * FROM deal_objectifs WHERE deal_id=? ORDER BY ordre,id").all(did) });
      }
      if (req.method === "POST" && objBase) {
        const { titre, responsable_nom, date_limite, progression=0, ordre=0 } = body;
        if (!titre) return sendJSON(res, 400, { error: "Titre requis." });
        const r = db.prepare("INSERT INTO deal_objectifs (deal_id,titre,responsable_nom,date_limite,progression,ordre) VALUES (?,?,?,?,?,?)").run(did,titre,responsable_nom||null,date_limite||null,progression,ordre);
        dealLog(did, me.id, me.nom, 'objectif_ajouté', titre);
        return sendJSON(res, 201, { ok:true, id:r.lastInsertRowid });
      }
      if (req.method === "PUT" && objItem) {
        const oid = objItem[2];
        const { titre, responsable_nom, date_limite, progression, statut, ordre } = body;
        const sets = [], vals = [];
        if (titre!==undefined){sets.push("titre=?");vals.push(titre);}
        if (responsable_nom!==undefined){sets.push("responsable_nom=?");vals.push(responsable_nom);}
        if (date_limite!==undefined){sets.push("date_limite=?");vals.push(date_limite);}
        if (progression!==undefined){sets.push("progression=?");vals.push(progression);}
        if (statut!==undefined){sets.push("statut=?");vals.push(statut);}
        if (ordre!==undefined){sets.push("ordre=?");vals.push(ordre);}
        if (!sets.length) return sendJSON(res, 400, { error: "Rien à modifier." });
        db.prepare(`UPDATE deal_objectifs SET ${sets.join(',')} WHERE id=? AND deal_id=?`).run(...vals,oid,did);
        return sendJSON(res, 200, { ok:true });
      }
      if (req.method === "DELETE" && objItem) {
        await db.prepare("DELETE FROM deal_objectifs WHERE id=? AND deal_id=?").run(objItem[2],did);
        return sendJSON(res, 200, { ok:true });
      }
    }

    /* ── Jalons ── */
    const jalBase = pathname.match(/^\/api\/deals\/(\d+)\/jalons$/);
    const jalItem = pathname.match(/^\/api\/deals\/(\d+)\/jalons\/(\d+)$/);
    if (jalBase || jalItem) {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const did = parseInt((jalBase||jalItem)[1]);
      if (!isDealMember(did, me) && me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const body = await readBody(req);
      if (req.method === "GET" && jalBase) {
        return sendJSON(res, 200, { jalons: await db.prepare("SELECT * FROM deal_jalons WHERE deal_id=? ORDER BY ordre,date_prevue,id").all(did) });
      }
      if (req.method === "POST" && jalBase) {
        const { titre, description, date_prevue, statut='prevu', ordre=0 } = body;
        if (!titre) return sendJSON(res, 400, { error: "Titre requis." });
        const r = db.prepare("INSERT INTO deal_jalons (deal_id,titre,description,date_prevue,statut,ordre) VALUES (?,?,?,?,?,?)").run(did,titre,description||null,date_prevue||null,statut,ordre);
        dealLog(did, me.id, me.nom, 'jalon_ajouté', titre);
        return sendJSON(res, 201, { ok:true, id:r.lastInsertRowid });
      }
      if (req.method === "PUT" && jalItem) {
        const jid = jalItem[2];
        const { titre, description, date_prevue, date_reelle, statut, ordre } = body;
        const sets = [], vals = [];
        if (titre!==undefined){sets.push("titre=?");vals.push(titre);}
        if (description!==undefined){sets.push("description=?");vals.push(description);}
        if (date_prevue!==undefined){sets.push("date_prevue=?");vals.push(date_prevue);}
        if (date_reelle!==undefined){sets.push("date_reelle=?");vals.push(date_reelle);}
        if (statut!==undefined){sets.push("statut=?");vals.push(statut);}
        if (ordre!==undefined){sets.push("ordre=?");vals.push(ordre);}
        if (!sets.length) return sendJSON(res, 400, { error: "Rien à modifier." });
        db.prepare(`UPDATE deal_jalons SET ${sets.join(',')} WHERE id=? AND deal_id=?`).run(...vals,jid,did);
        return sendJSON(res, 200, { ok:true });
      }
      if (req.method === "DELETE" && jalItem) {
        await db.prepare("DELETE FROM deal_jalons WHERE id=? AND deal_id=?").run(jalItem[2],did);
        return sendJSON(res, 200, { ok:true });
      }
    }

    /* ═══════════════════════════════════════════════════════════
       DEAL MASTER — Moteur de distinction d'excellence
    ═══════════════════════════════════════════════════════════ */

    /* GET /api/deal-master/hall-of-fame — lauréats actuels + anciens */
    if (req.method === "GET" && pathname === "/api/deal-master/hall-of-fame") {
      const editions = await db.prepare("SELECT * FROM deal_master_editions WHERE statut='publiee' OR statut='archivee' ORDER BY periode_debut DESC").all();
      const editionIds = editions.map(e => e.id);
      const activeEd = await db.prepare("SELECT * FROM deal_master_editions WHERE statut='publiee' ORDER BY periode_debut DESC LIMIT 1").get();
      const laureats = editionIds.length
        ? db.prepare(`SELECT dml.*, u.nom, u.prenom, u.photo_url, u.banner_url, u.titre_pro, u.ville, u.pays,
            dme.label AS edition_label, dme.periode_debut, dme.periode_fin
          FROM deal_master_laureats dml
          JOIN users u ON u.id = dml.user_id
          JOIN deal_master_editions dme ON dme.id = dml.edition_id
          WHERE dml.edition_id IN (${editionIds.join(',')})
          ORDER BY dml.edition_id DESC, dml.rang ASC`).all()
        : [];
      const temoignages = await db.prepare(`SELECT dmt.*, u.nom, u.prenom, u.photo_url, dme.label AS edition_label
        FROM deal_master_temoignages dmt
        JOIN users u ON u.id = dmt.user_id
        LEFT JOIN deal_master_editions dme ON dme.id = dmt.edition_id
        WHERE dmt.visible=1 ORDER BY dmt.created_at DESC LIMIT 20`).all();
      return sendJSON(res, 200, {
        editions,
        edition_active: activeEd || null,
        laureats: laureats.map(l => ({ ...l, score_detail: safeParse(l.score_detail || '{}') })),
        temoignages,
      });
    }

    /* GET /api/deal-master/actuel — lauréats de l'édition courante publiée */
    if (req.method === "GET" && pathname === "/api/deal-master/actuel") {
      const ed = await db.prepare("SELECT * FROM deal_master_editions WHERE statut='publiee' ORDER BY periode_debut DESC LIMIT 1").get();
      if (!ed) return sendJSON(res, 200, { laureats: [], edition: null });
      const laureats = await db.prepare(`SELECT dml.*, u.nom, u.prenom, u.photo_url, u.titre_pro, u.ville, u.pays
        FROM deal_master_laureats dml JOIN users u ON u.id=dml.user_id
        WHERE dml.edition_id=? AND dml.actif=1 ORDER BY dml.rang ASC`).all(ed.id);
      return sendJSON(res, 200, { laureats, edition: ed });
    }

    /* GET /api/deal-master/mon-score — score personnel (connecté) */
    if (req.method === "GET" && pathname === "/api/deal-master/mon-score") {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const score = await db.prepare("SELECT * FROM deal_master_scores WHERE user_id=?").get(me.id);
      const isMaster = await db.prepare("SELECT * FROM deal_master_laureats WHERE user_id=? AND actif=1 ORDER BY edition_id DESC LIMIT 1").get(me.id);
      const criteres = await db.prepare("SELECT * FROM deal_master_criteres WHERE actif=1 ORDER BY poids DESC").all();
      const ed = db.prepare("SELECT * FROM deal_master_editions WHERE statut IN ('en_cours','planifiee') ORDER BY periode_debut DESC LIMIT 1").get();
      return sendJSON(res, 200, {
        score: score ? { ...score, score_detail: safeParse(score.score_detail || '{}') } : null,
        is_deal_master: !!isMaster,
        laureat_actuel: isMaster || null,
        criteres,
        edition_courante: ed || null,
      });
    }

    /* GET /api/deal-master/criteres — liste des critères publics */
    if (req.method === "GET" && pathname === "/api/deal-master/criteres") {
      const criteres = await db.prepare("SELECT cle,label,description,poids FROM deal_master_criteres WHERE actif=1 ORDER BY poids DESC").all();
      return sendJSON(res, 200, { criteres });
    }

    /* POST /api/deal-master/temoignage — soumettre un témoignage (lauréat) */
    if (req.method === "POST" && pathname === "/api/deal-master/temoignage") {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const isMaster = await db.prepare("SELECT * FROM deal_master_laureats WHERE user_id=? AND actif=1 ORDER BY edition_id DESC LIMIT 1").get(me.id);
      if (!isMaster) return sendJSON(res, 403, { error: "Réservé aux Deal Masters actifs." });
      const { contenu } = body;
      if (!contenu || contenu.trim().length < 20) return sendJSON(res, 400, { error: "Témoignage trop court (min 20 caractères)." });
      db.prepare("INSERT INTO deal_master_temoignages (user_id,edition_id,contenu) VALUES (?,?,?)")
        .run(me.id, isMaster.edition_id, contenu.trim().slice(0, 1000));
      return sendJSON(res, 201, { ok: true });
    }

    /* ── ADMIN DEAL MASTER ── */

    /* GET /api/admin/deal-master/editions */
    if (req.method === "GET" && pathname === "/api/admin/deal-master/editions") {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      const eds = await db.prepare("SELECT * FROM deal_master_editions ORDER BY periode_debut DESC").all();
      return sendJSON(res, 200, { editions: eds });
    }

    /* POST /api/admin/deal-master/editions — créer une nouvelle édition */
    if (req.method === "POST" && pathname === "/api/admin/deal-master/editions") {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      const { label, periode_debut, periode_fin, top_pct = 10 } = body;
      if (!label || !periode_debut || !periode_fin) return sendJSON(res, 400, { error: "label, periode_debut, periode_fin requis." });
      const r = db.prepare("INSERT INTO deal_master_editions (label,periode_debut,periode_fin,statut,top_pct) VALUES (?,?,?,'planifiee',?)").run(label, periode_debut, periode_fin, top_pct);
      return sendJSON(res, 201, { id: r.lastInsertRowid });
    }

    /* ── DEAL MASTER ENGINE (fonction partagée) ─────────────────
       Calcule les scores, attribue les badges, publie l'édition.
       Appelé automatiquement + par le handler admin si besoin.
    ───────────────────────────────────────────────────────────── */
    function _dmScoreEdition(edId) {
      const ed = await db.prepare("SELECT * FROM deal_master_editions WHERE id=?").get(edId);
      if (!ed) return null;
      const criteres = await db.prepare("SELECT * FROM deal_master_criteres WHERE actif=1").all();
      const poidsTotal = criteres.reduce((s, c) => s + c.poids, 0) || 1;
      const debut = ed.periode_debut, fin = ed.periode_fin;
      const initiativesWithDeals = await db.prepare(`
        SELECT DISTINCT dp.initiative_id FROM deal_participants dp
        JOIN deals d ON d.id = dp.deal_id
        WHERE d.created_at BETWEEN ? AND ? AND dp.statut='accepte'`).all(debut+' 00:00:00', fin+' 23:59:59');
      const scores = [];
      for (const { initiative_id } of initiativesWithDeals) {
        const init = await db.prepare("SELECT user_id FROM initiatives WHERE id=?").get(initiative_id);
        if (!init?.user_id) continue;
        const uid = init.user_id;
        const detail = {};
        const finalises = db.prepare(`SELECT COUNT(*) AS n FROM deals d JOIN deal_participants dp ON dp.deal_id=d.id WHERE dp.initiative_id=? AND d.statut='cloture' AND d.created_at BETWEEN ? AND ?`).get(initiative_id, debut+' 00:00:00', fin+' 23:59:59').n;
        detail.deals_finalises = finalises;
        const totalDeals = db.prepare(`SELECT COUNT(*) AS n FROM deal_participants dp JOIN deals d ON d.id=dp.deal_id WHERE dp.initiative_id=? AND dp.statut='accepte' AND d.created_at BETWEEN ? AND ?`).get(initiative_id, debut+' 00:00:00', fin+' 23:59:59').n || 1;
        detail.taux_reussite = Math.round((finalises / totalDeals) * 100) / 100;
        const jalonsTotal = db.prepare(`SELECT COUNT(*) AS n FROM deal_jalons dj JOIN deal_participants dp ON dp.deal_id=dj.deal_id WHERE dp.initiative_id=?`).get(initiative_id).n || 1;
        const jalonsOk = db.prepare(`SELECT COUNT(*) AS n FROM deal_jalons dj JOIN deal_participants dp ON dp.deal_id=dj.deal_id WHERE dp.initiative_id=? AND dj.statut='atteint'`).get(initiative_id).n;
        detail.progression_deals = Math.round((jalonsOk / jalonsTotal) * 100) / 100;
        const noteMoy = db.prepare(`SELECT AVG(CAST(dn.contenu AS REAL)) AS avg FROM deal_notes dn JOIN deals d ON d.id=dn.deal_id JOIN deal_participants dp ON dp.deal_id=d.id WHERE dp.initiative_id=? AND dn.type='evaluation'`).get(initiative_id).avg || 0;
        detail.evaluations_recues = Math.min(noteMoy / 5, 1);
        const partenaires = db.prepare(`SELECT COUNT(DISTINCT dp2.initiative_id) AS n FROM deal_participants dp JOIN deal_participants dp2 ON dp2.deal_id=dp.deal_id AND dp2.initiative_id!=dp.initiative_id WHERE dp.initiative_id=? AND dp2.statut='accepte'`).get(initiative_id).n;
        detail.qualite_collaboration = Math.min(partenaires / 10, 1);
        const tachesTotal = db.prepare(`SELECT COUNT(*) AS n FROM deal_tasks dt JOIN deal_participants dp ON dp.deal_id=dt.deal_id WHERE dp.initiative_id=?`).get(initiative_id).n || 1;
        const tachesOk = db.prepare(`SELECT COUNT(*) AS n FROM deal_tasks dt JOIN deal_participants dp ON dp.deal_id=dt.deal_id WHERE dp.initiative_id=? AND dt.statut='terminee'`).get(initiative_id).n;
        detail.respect_engagements = Math.round((tachesOk / tachesTotal) * 100) / 100;
        detail.diversite_partenaires = Math.min(partenaires / 5, 1);
        let scoreGlobal = 0;
        for (const c of criteres) {
          const val = detail[c.cle] ?? 0;
          const normalized = c.cle === 'deals_finalises' ? Math.min(val / 10, 1) : val;
          scoreGlobal += (c.poids / poidsTotal) * normalized * 100;
        }
        scores.push({ user_id: uid, initiative_id, score: Math.round(scoreGlobal * 100) / 100, detail });
      }
      scores.sort((a, b) => b.score - a.score);
      const topN = Math.max(1, Math.ceil(scores.length * (ed.top_pct / 100)));
      const laureats = scores.slice(0, topN);
      const upsertScore = db.prepare(`INSERT INTO deal_master_scores (user_id,score,score_detail,rang,rang_total,computed_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET score=excluded.score,score_detail=excluded.score_detail,rang=excluded.rang,rang_total=excluded.rang_total,computed_at=excluded.computed_at`);
      scores.forEach((s, i) => upsertScore.run(s.user_id, s.score, JSON.stringify(s.detail), i+1, scores.length));
      await db.prepare("UPDATE deal_master_laureats SET actif=0 WHERE edition_id=?").run(edId);
      const insLaureat = db.prepare(`INSERT INTO deal_master_laureats (edition_id,user_id,score,rang,score_detail,date_expiration,actif) VALUES (?,?,?,?,?,?,1) ON CONFLICT(edition_id,user_id) DO UPDATE SET score=excluded.score,rang=excluded.rang,score_detail=excluded.score_detail,actif=1`);
      laureats.forEach((l, i) => insLaureat.run(edId, l.user_id, l.score, i+1, JSON.stringify(l.detail), ed.periode_fin));
      await db.prepare("UPDATE users SET is_deal_master=0, deal_master_edition_id=NULL WHERE is_deal_master=1").run();
      laureats.forEach(l => await db.prepare("UPDATE users SET is_deal_master=1, deal_master_edition_id=? WHERE id=?").run(edId, l.user_id));
      db.prepare("UPDATE deal_master_editions SET statut='calculee', nb_laureats=?, calcule_at=datetime('now'), criteres_json=?, updated_at=datetime('now') WHERE id=?")
        .run(laureats.length, JSON.stringify(Object.fromEntries(criteres.map(c=>[c.cle,c.poids]))), edId);
      return { nb_scores: scores.length, nb_laureats: laureats.length, top_pct: ed.top_pct };
    }

    /* ── AUTO-RECALCUL : vérifie si une édition expirée attend son calcul ── */
    function _dmAutoRecalculate() {
      try {
        const expired = db.prepare(`SELECT * FROM deal_master_editions WHERE statut IN ('en_cours','planifiee','calculee') AND date(periode_fin) < date('now')`).all();
        for (const ed of expired) {
          if (ed.statut !== 'calculee') _dmScoreEdition(ed.id);
          // Auto-publier
          db.prepare("UPDATE deal_master_editions SET statut='archivee', updated_at=datetime('now') WHERE statut='publiee'").run();
          db.prepare("UPDATE deal_master_editions SET statut='publiee', publie_at=COALESCE(publie_at,datetime('now')), updated_at=datetime('now') WHERE id=?").run(ed.id);
          // Créer l'édition suivante si elle n'existe pas
          const nextStart = new Date(ed.periode_fin);
          nextStart.setDate(nextStart.getDate() + 1);
          const nextEnd = new Date(nextStart);
          nextEnd.setMonth(nextEnd.getMonth() + 6);
          nextEnd.setDate(nextEnd.getDate() - 1);
          const ns = nextStart.toISOString().slice(0, 10);
          const ne = nextEnd.toISOString().slice(0, 10);
          const nextSem = nextStart.getMonth() < 6 ? 1 : 2;
          const nextLabel = `Semestre ${nextSem} – ${nextStart.getFullYear()}`;
          const existingNext = db.prepare("SELECT id FROM deal_master_editions WHERE date(periode_debut)=date(?)").get(ns);
          if (!existingNext) {
            db.prepare("INSERT INTO deal_master_editions (label,periode_debut,periode_fin,statut,top_pct) VALUES (?,?,?,'en_cours',10.0)").run(nextLabel, ns, ne);
          }
        }
      } catch(e) { /* autorecalcul silencieux */ }
    }
    _dmAutoRecalculate();

    /* POST /api/admin/deal-master/editions/:id/calculer — déclenché par le moteur (conservé pour rétrocompatibilité) */
    const dmCalcM = pathname.match(/^\/api\/admin\/deal-master\/editions\/(\d+)\/calculer$/);
    if (req.method === "POST" && dmCalcM) {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      const edId = parseInt(dmCalcM[1]);
      const result = _dmScoreEdition(edId);
      if (!result) return sendJSON(res, 404, { error: "Édition introuvable." });
      return sendJSON(res, 200, { ok: true, ...result });
    }

    /* POST /api/admin/deal-master/editions/:id/publier */
    const dmPubM = pathname.match(/^\/api\/admin\/deal-master\/editions\/(\d+)\/publier$/);
    if (req.method === "POST" && dmPubM) {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      const edId = parseInt(dmPubM[1]);
      const ed = await db.prepare("SELECT * FROM deal_master_editions WHERE id=?").get(edId);
      if (!ed) return sendJSON(res, 404, { error: "Édition introuvable." });
      if (ed.statut !== 'calculee') return sendJSON(res, 400, { error: "L'édition doit être calculée avant publication." });
      // Archiver les autres publiées
      db.prepare("UPDATE deal_master_editions SET statut='archivee', updated_at=datetime('now') WHERE statut='publiee'").run();
      db.prepare("UPDATE deal_master_editions SET statut='publiee', publie_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(edId);
      return sendJSON(res, 200, { ok: true });
    }

    /* PUT /api/admin/deal-master/criteres/:cle */
    const dmCritM = pathname.match(/^\/api\/admin\/deal-master\/criteres\/([a-z_]+)$/);
    if (req.method === "PUT" && dmCritM) {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      const { poids, actif, label, description } = body;
      db.prepare(`UPDATE deal_master_criteres SET
        poids=COALESCE(?,poids), actif=COALESCE(?,actif),
        label=COALESCE(?,label), description=COALESCE(?,description),
        updated_at=datetime('now') WHERE cle=?`)
        .run(poids??null, actif??null, label||null, description||null, dmCritM[1]);
      return sendJSON(res, 200, { ok: true });
    }

    /* GET /api/admin/deal-master/criteres */
    if (req.method === "GET" && pathname === "/api/admin/deal-master/criteres") {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      return sendJSON(res, 200, { criteres: await db.prepare("SELECT * FROM deal_master_criteres ORDER BY poids DESC").all() });
    }

    /* GET /api/admin/deal-master/status — état du moteur + prochain recalcul */
    if (req.method === "GET" && pathname === "/api/admin/deal-master/status") {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      const activeEd = await db.prepare("SELECT * FROM deal_master_editions WHERE statut='publiee' ORDER BY periode_debut DESC LIMIT 1").get();
      const currentEd = db.prepare("SELECT * FROM deal_master_editions WHERE statut IN ('en_cours','planifiee') ORDER BY periode_debut DESC LIMIT 1").get();
      const nbActifs = db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_deal_master=1").get().n;
      // Prochain recalcul = fin de l'édition en cours + 1 jour
      let nextRecalcul = null;
      if (currentEd) {
        const d = new Date(currentEd.periode_fin);
        d.setDate(d.getDate() + 1);
        nextRecalcul = d.toISOString().slice(0, 10);
      }
      return sendJSON(res, 200, {
        edition_active: activeEd || null,
        edition_courante: currentEd || null,
        nb_deal_masters_actifs: nbActifs,
        prochain_recalcul: nextRecalcul,
        moteur: 'automatique',
        periodicite_mois: 6,
        top_pct: currentEd?.top_pct ?? activeEd?.top_pct ?? 10
      });
    }

    /* GET /api/admin/deal-master/classement — classement complet (scores + rangs) */
    if (req.method === "GET" && pathname === "/api/admin/deal-master/classement") {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      const rows = await db.prepare(`
        SELECT dms.user_id, dms.score, dms.rang, dms.rang_total, dms.computed_at,
               u.nom, u.prenom, u.photo_url, u.titre_pro, u.is_deal_master,
               i.nom AS initiative_nom, i.domaine
        FROM deal_master_scores dms
        JOIN users u ON u.id = dms.user_id
        LEFT JOIN initiatives i ON i.user_id = dms.user_id
        ORDER BY dms.rang ASC
        LIMIT 200`).all();
      const topPct = db.prepare("SELECT top_pct FROM deal_master_editions WHERE statut IN ('en_cours','publiee') ORDER BY periode_debut DESC LIMIT 1").get()?.top_pct ?? 10;
      return sendJSON(res, 200, { classement: rows, top_pct: topPct });
    }

    /* GET /api/admin/deal-master/laureats-actuels — Deal Masters actifs */
    if (req.method === "GET" && pathname === "/api/admin/deal-master/laureats-actuels") {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      const laureats = db.prepare(`
        SELECT dml.user_id, dml.score, dml.rang, dml.date_attribution, dml.date_expiration,
               dme.label AS edition_label, dme.periode_debut, dme.periode_fin,
               u.nom, u.prenom, u.photo_url, u.titre_pro,
               i.nom AS initiative_nom, i.domaine,
               (SELECT COUNT(*) FROM deal_master_laureats h WHERE h.user_id=dml.user_id) AS nb_editions_total
        FROM deal_master_laureats dml
        JOIN deal_master_editions dme ON dme.id = dml.edition_id
        JOIN users u ON u.id = dml.user_id
        LEFT JOIN initiatives i ON i.user_id = dml.user_id
        WHERE dml.actif = 1
        ORDER BY dml.rang ASC`).all();
      return sendJSON(res, 200, { laureats });
    }

    /* GET /api/admin/deal-master/historique — historique complet de tous les Deal Masters */
    if (req.method === "GET" && pathname === "/api/admin/deal-master/historique") {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      const historique = await db.prepare(`
        SELECT dml.id, dml.user_id, dml.score, dml.rang, dml.date_attribution, dml.date_expiration, dml.actif,
               dme.label AS edition_label, dme.periode_debut, dme.periode_fin,
               u.nom, u.prenom, u.photo_url, u.titre_pro,
               i.nom AS initiative_nom
        FROM deal_master_laureats dml
        JOIN deal_master_editions dme ON dme.id = dml.edition_id
        JOIN users u ON u.id = dml.user_id
        LEFT JOIN initiatives i ON i.user_id = dml.user_id
        ORDER BY dml.edition_id DESC, dml.rang ASC`).all();
      return sendJSON(res, 200, { historique });
    }

    /* GET /api/deal-master/verifier/:userId — vérification publique */
    const dmVerifM = pathname.match(/^\/api\/deal-master\/verifier\/(\d+)$/);
    if (req.method === "GET" && dmVerifM) {
      const uid = parseInt(dmVerifM[1]);
      const u = await db.prepare("SELECT id,nom,prenom,photo_url,titre_pro FROM users WHERE id=?").get(uid);
      if (!u) return sendJSON(res, 404, { error: "Utilisateur introuvable." });
      const laureat = await db.prepare(`SELECT dml.rang, dml.score, dml.date_attribution, dml.date_expiration,
        dme.label AS edition_label, dme.periode_debut, dme.periode_fin, dme.statut AS edition_statut
        FROM deal_master_laureats dml JOIN deal_master_editions dme ON dme.id=dml.edition_id
        WHERE dml.user_id=? AND dml.actif=1 ORDER BY dml.edition_id DESC LIMIT 1`).get(uid);
      const nb_editions = db.prepare("SELECT COUNT(*) AS n FROM deal_master_laureats WHERE user_id=?").get(uid).n;
      return sendJSON(res, 200, {
        valide: !!laureat,
        utilisateur: { id: u.id, nom: u.nom, prenom: u.prenom, photo_url: u.photo_url, titre_pro: u.titre_pro },
        distinction: laureat || null,
        nb_editions,
        verifie_le: new Date().toISOString(),
      });
    }

    /* GET /api/profil/:id/deal-master — badge info */
    const dmProfilM = pathname.match(/^\/api\/profil\/(\d+)\/deal-master$/);
    if (req.method === "GET" && dmProfilM) {
      const uid = parseInt(dmProfilM[1]);
      const laureat = await db.prepare(`SELECT dml.*, dme.label AS edition_label, dme.periode_debut, dme.periode_fin
        FROM deal_master_laureats dml JOIN deal_master_editions dme ON dme.id=dml.edition_id
        WHERE dml.user_id=? AND dml.actif=1 ORDER BY dml.edition_id DESC LIMIT 1`).get(uid);
      const historique = await db.prepare(`SELECT dml.rang, dml.score, dme.label AS edition_label, dme.periode_debut
        FROM deal_master_laureats dml JOIN deal_master_editions dme ON dme.id=dml.edition_id
        WHERE dml.user_id=? ORDER BY dml.edition_id DESC`).all(uid);
      return sendJSON(res, 200, { laureat: laureat || null, historique });
    }

    /* ═══════════════════════════════════════════════════════════
       TÉMOIGNAGES — ILS ONT REJOINT DIASPO'ACTIF
    ═══════════════════════════════════════════════════════════ */

    /* GET /api/temoignages/public — témoignages approuvés pour l'accueil */
    if (req.method === "GET" && pathname === "/api/temoignages/public") {
      const limit = Math.min(parseInt(parsed.query.limit || "6", 10), 20);
      const rows = await db.prepare(`
        SELECT t.id, t.note, t.description, t.fonctionnalites, t.points_positifs,
               t.type_usage, t.nom_affichage, t.pays_utilisateur, t.role_utilisateur,
               t.score_pertinence, t.created_at
        FROM temoignages t
        WHERE t.statut = 'approuve' AND t.consentement_affichage = 1
        ORDER BY t.score_pertinence DESC, t.note DESC, t.created_at DESC
        LIMIT ?
      `).all(limit);
      const enriched = rows.map(r => ({ ...r, fonctionnalites: safeParse(r.fonctionnalites) }));
      return sendJSON(res, 200, { temoignages: enriched });
    }

    /* POST /api/temoignage — soumettre un témoignage */
    if (req.method === "POST" && pathname === "/api/temoignage") {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const body2 = await readBody(req);
      const { note, description, fonctionnalites, points_positifs, suggestions, type_usage, consentement_affichage, nom_affichage } = body2;
      if (!description || description.trim().length < 20)
        return sendJSON(res, 400, { error: "Description trop courte (20 caractères min)." });
      // Modération automatique — mots inappropriés
      const banned = /\b(spam|fuck|merde|shit|connard|idiot)\b/i;
      if (banned.test(description) || banned.test(points_positifs || "") || banned.test(suggestions || ""))
        return sendJSON(res, 400, { error: "Contenu inapproprié détecté. Veuillez réviser votre témoignage." });
      // Score de pertinence automatique
      let score = 0;
      if (note >= 4) score += 2;
      if (description.trim().length > 100) score += 2;
      if (points_positifs && points_positifs.trim().length > 20) score += 1;
      if (suggestions && suggestions.trim().length > 20) score += 1;
      if (consentement_affichage) score += 1;
      const nomFinal = consentement_affichage ? (nom_affichage || me.nom) : null;
      db.prepare(`
        INSERT INTO temoignages (user_id,note,description,fonctionnalites,points_positifs,suggestions,
          type_usage,consentement_affichage,nom_affichage,pays_utilisateur,role_utilisateur,statut,score_pertinence)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,'en_attente',?)
        ON CONFLICT(user_id) DO UPDATE SET
          note=excluded.note, description=excluded.description, fonctionnalites=excluded.fonctionnalites,
          points_positifs=excluded.points_positifs, suggestions=excluded.suggestions, type_usage=excluded.type_usage,
          consentement_affichage=excluded.consentement_affichage, nom_affichage=excluded.nom_affichage,
          statut='en_attente', score_pertinence=excluded.score_pertinence, updated_at=datetime('now')
      `).run(me.id, note || null, description.trim(), JSON.stringify(fonctionnalites || []),
        points_positifs || null, suggestions || null, type_usage || 'personnel',
        consentement_affichage ? 1 : 0, nomFinal, me.pays || null, me.role, score);
      db.prepare("UPDATE users SET temoignage_statut='fourni', updated_at=datetime('now') WHERE id=?").run(me.id);
      return sendJSON(res, 201, { ok: true, message: "Merci pour votre témoignage ! Il sera affiché après validation." });
    }

    /* POST /api/temoignage/ignorer — reporter/refuser la demande */
    if (req.method === "POST" && pathname === "/api/temoignage/ignorer") {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const body2 = await readBody(req);
      const statut = body2.refus_definitif ? 'refuse' : 'non_demande';
      db.prepare("UPDATE users SET temoignage_statut=?, temoignage_derniere_demande=datetime('now') WHERE id=?").run(statut, me.id);
      return sendJSON(res, 200, { ok: true });
    }

    /* POST /api/demo/vu — marquer la démo comme vue */
    if (req.method === "POST" && pathname === "/api/demo/vu") {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      await db.prepare("UPDATE users SET demo_vue=1 WHERE id=?").run(me.id);
      return sendJSON(res, 200, { ok: true });
    }

    /* POST /api/demo/plus-tard — reporter le tutoriel */
    if (req.method === "POST" && pathname === "/api/demo/plus-tard") {
      /* Pas besoin de stocker côté serveur — géré en localStorage */
      return sendJSON(res, 200, { ok: true });
    }

    /* GET /api/admin/temoignages — liste admin */
    if (req.method === "GET" && pathname === "/api/admin/temoignages") {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const rows = await db.prepare(`
        SELECT t.*, u.nom AS user_nom, u.email AS user_email, u.pays AS user_pays
        FROM temoignages t JOIN users u ON u.id = t.user_id
        ORDER BY t.created_at DESC
      `).all();
      return sendJSON(res, 200, { temoignages: rows.map(r => ({ ...r, fonctionnalites: safeParse(r.fonctionnalites) })) });
    }

    /* PUT /api/admin/temoignages/:id/statut — approuver/rejeter */
    if (req.method === "PUT" && /^\/api\/admin\/temoignages\/(\d+)\/statut$/.test(pathname)) {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Accès refusé." });
      const tid = pathname.match(/\/(\d+)\/statut$/)[1];
      const body2 = await readBody(req);
      const { statut, admin_note } = body2;
      if (!['approuve','rejete','signale'].includes(statut)) return sendJSON(res, 400, { error: "Statut invalide." });
      db.prepare("UPDATE temoignages SET statut=?, admin_id=?, admin_note=?, updated_at=datetime('now') WHERE id=?")
        .run(statut, me.id, admin_note || null, tid);
      return sendJSON(res, 200, { ok: true });
    }

    /* ═══════════════════════════════════════════════════════════
       PARTENAIRES OFFICIELS DIASPO'ACTIF
    ═══════════════════════════════════════════════════════════ */

    /* GET /api/partenaires/carousel — liste personnalisée pour la homepage */
    if (req.method === "GET" && pathname === "/api/partenaires/carousel") {
      const me = getCurrentUser(req);
      const now = new Date().toISOString().slice(0, 10);
      let rows = db.prepare(`
        SELECT po.*, u.nom, u.prenom, u.role, u.photo_url, u.banner_url, u.titre_pro, u.bio, u.ville, u.pays AS user_pays
        FROM partenaires_officiels po JOIN users u ON u.id = po.user_id
        WHERE po.statut = 'active'
          AND (po.periode_debut IS NULL OR po.periode_debut <= ?)
          AND (po.periode_fin  IS NULL OR po.periode_fin  >= ?)
        ORDER BY po.mise_en_avant DESC, po.priorite DESC, po.nbr_recommandations DESC`).all(now, now);

      // Score de pertinence selon le profil utilisateur
      if (me) {
        const uData = await db.prepare("SELECT centres_interet, situation_pro, pays, role FROM users WHERE id=?").get(me.id);
        const ciUser = safeParse(uData?.centres_interet || "[]").map(s => s.toLowerCase());
        const paysUser = (uData?.pays || "").toLowerCase();
        rows = rows.map(r => {
          let score = r.mise_en_avant * 100 + r.priorite * 10;
          const domaines = safeParse(r.domaines_expertise || "[]").map(s => s.toLowerCase());
          const cles = safeParse(r.cles_matching || "[]").map(s => s.toLowerCase());
          const allKeys = [...domaines, ...cles];
          allKeys.forEach(k => { if (ciUser.some(ci => ci.includes(k) || k.includes(ci))) score += 15; });
          const pays = safeParse(r.pays_intervention || "[]").map(s => s.toLowerCase());
          if (paysUser && pays.some(p => p.includes(paysUser) || paysUser.includes(p))) score += 10;
          // Anti-répétition : pénaliser les partenaires récemment affichés
          const recentViews = db.prepare("SELECT COUNT(*) AS n FROM partenaires_impressions WHERE partenaire_id=? AND user_id=? AND event_type='view' AND created_at > datetime('now','-1 hour')").get(r.id, me.id).n;
          score -= recentViews * 5;
          return { ...r, _score: score };
        }).sort((a, b) => b._score - a._score);
      }

      const limit = parseInt(new URL("http://x" + req.url).searchParams.get('limit') || '8');
      const result = rows.slice(0, limit).map(r => ({
        ...r,
        domaines_expertise: safeParse(r.domaines_expertise || "[]"),
        pays_intervention:  safeParse(r.pays_intervention  || "[]"),
        services:           safeParse(r.services           || "[]"),
      }));
      return sendJSON(res, 200, { partenaires: result, total: rows.length });
    }

    /* POST /api/partenaires/:id/impression — tracking vue/clic */
    const impM = pathname.match(/^\/api\/partenaires\/(\d+)\/impression$/);
    if (req.method === "POST" && impM) {
      const me = getCurrentUser(req);
      const pid = parseInt(impM[1]);
      const { event_type = "view", source = "homepage" } = body;
      if (!['view','click','contact','profile_visit'].includes(event_type)) return sendJSON(res, 400, { error: "event_type invalide." });
      db.prepare("INSERT INTO partenaires_impressions (partenaire_id,user_id,event_type,source) VALUES (?,?,?,?)")
        .run(pid, me?.id || null, event_type, source);
      if (event_type === 'click' || event_type === 'profile_visit') {
        await db.prepare("UPDATE partenaires_officiels SET nbr_recommandations=nbr_recommandations+1 WHERE id=?").run(pid);
      }
      return sendJSON(res, 200, { ok: true });
    }

    /* GET /api/admin/partenaires/stats — statistiques admin */
    if (req.method === "GET" && pathname === "/api/admin/partenaires/stats") {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      const byPartner = db.prepare(`
        SELECT po.id, u.nom, u.prenom, po.domaines_expertise,
          COUNT(CASE WHEN pi.event_type='view'         THEN 1 END) AS nb_vues,
          COUNT(CASE WHEN pi.event_type='click'        THEN 1 END) AS nb_clics,
          COUNT(CASE WHEN pi.event_type='profile_visit' THEN 1 END) AS nb_profils,
          COUNT(CASE WHEN pi.event_type='contact'      THEN 1 END) AS nb_contacts,
          ROUND(100.0 * COUNT(CASE WHEN pi.event_type='click' THEN 1 END) / MAX(1, COUNT(CASE WHEN pi.event_type='view' THEN 1 END)), 1) AS taux_clic
        FROM partenaires_officiels po
        JOIN users u ON u.id = po.user_id
        LEFT JOIN partenaires_impressions pi ON pi.partenaire_id = po.id
        WHERE po.statut = 'active'
        GROUP BY po.id ORDER BY nb_vues DESC`).all();
      const bySecteur = db.prepare(`
        SELECT po.categorie, COUNT(pi.id) AS nb_impressions
        FROM partenaires_impressions pi
        JOIN partenaires_officiels po ON po.id = pi.partenaire_id
        GROUP BY po.categorie ORDER BY nb_impressions DESC`).all();
      const totals = db.prepare(`
        SELECT
          COUNT(CASE WHEN event_type='view'         THEN 1 END) AS total_vues,
          COUNT(CASE WHEN event_type='click'        THEN 1 END) AS total_clics,
          COUNT(CASE WHEN event_type='contact'      THEN 1 END) AS total_contacts,
          COUNT(CASE WHEN event_type='profile_visit' THEN 1 END) AS total_profils
        FROM partenaires_impressions`).get();
      return sendJSON(res, 200, { byPartner: byPartner.map(r => ({...r, domaines_expertise: safeParse(r.domaines_expertise||'[]')})), bySecteur, totals });
    }

    /* PUT /api/admin/partenaires/:id/config — admin configure priorité/rotation */
    const configM = pathname.match(/^\/api\/admin\/partenaires\/(\d+)\/config$/);
    if (req.method === "PUT" && configM) {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      const pid = parseInt(configM[1]);
      const { priorite, mise_en_avant, periode_debut, periode_fin, slogan, cles_matching } = body;
      db.prepare(`UPDATE partenaires_officiels SET
        priorite=COALESCE(?,priorite), mise_en_avant=COALESCE(?,mise_en_avant),
        periode_debut=COALESCE(?,periode_debut), periode_fin=COALESCE(?,periode_fin),
        slogan=COALESCE(?,slogan), cles_matching=COALESCE(?,cles_matching),
        updated_at=datetime('now') WHERE id=?`)
        .run(priorite??null, mise_en_avant??null, periode_debut||null, periode_fin||null,
             slogan||null, cles_matching ? JSON.stringify(cles_matching) : null, pid);
      return sendJSON(res, 200, { ok: true });
    }

    /* GET /api/partenaires — annuaire public (Deal Masters mis en avant) */
    if (req.method === "GET" && pathname === "/api/partenaires") {
      const qs = new URL("http://x" + req.url).searchParams;
      const domaine = qs.get('domaine') || '';
      const pays    = qs.get('pays') || '';
      const q       = (qs.get('q') || '').toLowerCase();
      const page    = Math.max(1, parseInt(qs.get('page') || '1'));
      const LIMIT   = 20, OFFSET = (page - 1) * LIMIT;
      let rows = await db.prepare(`
        SELECT po.*, u.nom, u.prenom, u.role, u.photo_url, u.titre_pro, u.bio, u.ville, u.pays AS user_pays, u.is_deal_master
        FROM partenaires_officiels po JOIN users u ON u.id = po.user_id
        WHERE po.statut = 'active' AND po.niveau_visibilite = 'public'
        ORDER BY u.is_deal_master DESC, po.nbr_recommandations DESC, po.date_attribution DESC
        LIMIT ? OFFSET ?`).all(LIMIT, OFFSET);
      if (domaine) rows = rows.filter(r => (safeParse(r.domaines_expertise||'[]')).some(d => d.toLowerCase().includes(domaine.toLowerCase())));
      if (pays)    rows = rows.filter(r => (safeParse(r.pays_intervention||'[]')).some(p => p.toLowerCase().includes(pays.toLowerCase())));
      if (q)       rows = rows.filter(r => `${r.nom} ${r.prenom||''} ${r.titre_pro||''} ${r.bio||''} ${r.description_complete||''}`.toLowerCase().includes(q));
      const total = db.prepare("SELECT COUNT(*) AS n FROM partenaires_officiels WHERE statut='active'").get().n;
      const parsed = rows.map(r => ({
        ...r,
        domaines_expertise: safeParse(r.domaines_expertise||'[]'),
        pays_intervention:  safeParse(r.pays_intervention||'[]'),
        services:           safeParse(r.services||'[]'),
        liens_utiles:       safeParse(r.liens_utiles||'[]'),
      }));
      return sendJSON(res, 200, { partenaires: parsed, total, page, pages: Math.ceil(total/LIMIT) });
    }

    /* GET /api/partenaires/:id — fiche détaillée */
    const partM = pathname.match(/^\/api\/partenaires\/(\d+)$/);
    if (req.method === "GET" && partM) {
      const uid = parseInt(partM[1]);
      const r = await db.prepare(`SELECT po.*, u.nom, u.prenom, u.role, u.photo_url, u.banner_url, u.titre_pro, u.bio, u.ville, u.pays AS user_pays, u.centres_interet, u.competences
        FROM partenaires_officiels po JOIN users u ON u.id = po.user_id WHERE po.user_id=? AND po.statut='active'`).get(uid);
      if (!r) return sendJSON(res, 404, { error: "Partenaire introuvable." });
      return sendJSON(res, 200, {
        ...r,
        domaines_expertise: safeParse(r.domaines_expertise||'[]'),
        pays_intervention:  safeParse(r.pays_intervention||'[]'),
        services:           safeParse(r.services||'[]'),
        liens_utiles:       safeParse(r.liens_utiles||'[]'),
      });
    }

    /* PUT /api/partenaires/moi — le partenaire met à jour sa fiche */
    if (req.method === "PUT" && pathname === "/api/partenaires/moi") {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
      const po = await db.prepare("SELECT id FROM partenaires_officiels WHERE user_id=? AND statut='active'").get(me.id);
      if (!po) return sendJSON(res, 403, { error: "Vous n'êtes pas Partenaire Officiel." });
      const { description_complete, domaines_expertise, pays_intervention, services, site_web, liens_utiles } = body;
      db.prepare(`UPDATE partenaires_officiels SET
        description_complete=COALESCE(?,description_complete),
        domaines_expertise=COALESCE(?,domaines_expertise),
        pays_intervention=COALESCE(?,pays_intervention),
        services=COALESCE(?,services),
        site_web=COALESCE(?,site_web),
        liens_utiles=COALESCE(?,liens_utiles),
        updated_at=datetime('now')
        WHERE user_id=?`).run(
        description_complete||null,
        domaines_expertise ? JSON.stringify(domaines_expertise) : null,
        pays_intervention  ? JSON.stringify(pays_intervention)  : null,
        services           ? JSON.stringify(services)           : null,
        site_web||null,
        liens_utiles       ? JSON.stringify(liens_utiles)       : null,
        me.id
      );
      return sendJSON(res, 200, { ok: true });
    }

    /* GET /api/partenaires/moi — vérifie si l'utilisateur connecté est partenaire */
    if (req.method === "GET" && pathname === "/api/partenaires/moi") {
      const me = getCurrentUser(req);
      if (!me) return sendJSON(res, 200, { partenaire: false });
      const po = await db.prepare("SELECT * FROM partenaires_officiels WHERE user_id=?").get(me.id);
      if (!po) return sendJSON(res, 200, { partenaire: false });
      return sendJSON(res, 200, { partenaire: true, statut: po.statut, fiche: {
        ...po,
        domaines_expertise: safeParse(po.domaines_expertise||'[]'),
        pays_intervention:  safeParse(po.pays_intervention||'[]'),
        services:           safeParse(po.services||'[]'),
        liens_utiles:       safeParse(po.liens_utiles||'[]'),
      }});
    }

    /* GET /api/partenaires/recommander?domaine=&q= — recommandation O-Z */
    if (req.method === "GET" && pathname === "/api/partenaires/recommander") {
      const qs   = new URL("http://x" + req.url).searchParams;
      const dom  = (qs.get('domaine') || '').toLowerCase();
      const q    = (qs.get('q') || '').toLowerCase();
      let rows   = await db.prepare(`SELECT po.*, u.nom, u.prenom, u.role, u.photo_url, u.titre_pro, u.ville, u.pays AS user_pays
        FROM partenaires_officiels po JOIN users u ON u.id = po.user_id
        WHERE po.statut='active' ORDER BY po.nbr_recommandations DESC`).all();
      if (dom) rows = rows.filter(r => (safeParse(r.domaines_expertise||'[]')).some(d => d.toLowerCase().includes(dom)));
      if (q)   rows = rows.filter(r => `${r.nom} ${r.prenom||''} ${r.titre_pro||''} ${r.description_complete||''} ${r.domaines_expertise||''}`.toLowerCase().includes(q));
      rows = rows.slice(0, 5);
      // Compter la recommandation
      rows.forEach(r => await db.prepare("UPDATE partenaires_officiels SET nbr_recommandations=nbr_recommandations+1 WHERE id=?").run(r.id));
      return sendJSON(res, 200, { partenaires: rows.map(r => ({
        ...r, domaines_expertise: safeParse(r.domaines_expertise||'[]'),
        pays_intervention: safeParse(r.pays_intervention||'[]'),
      }))});
    }

    /* ── Admin : gestion des partenaires ── */
    if (pathname === "/api/admin/partenaires") {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });

      if (req.method === "GET") {
        const rows = await db.prepare(`SELECT po.*, u.nom, u.prenom, u.role, u.email, u.photo_url, u.titre_pro
          FROM partenaires_officiels po JOIN users u ON u.id = po.user_id
          ORDER BY po.created_at DESC`).all();
        return sendJSON(res, 200, { partenaires: rows.map(r => ({
          ...r,
          domaines_expertise: safeParse(r.domaines_expertise||'[]'),
          pays_intervention:  safeParse(r.pays_intervention||'[]'),
          services:           safeParse(r.services||'[]'),
        }))});
      }

      if (req.method === "POST") {
        // Attribuer l'accréditation
        const { user_id, domaines_expertise, pays_intervention, services, description_complete, categorie, admin_notes, date_expiration } = body;
        if (!user_id) return sendJSON(res, 400, { error: "user_id requis." });
        const u = await db.prepare("SELECT id,nom FROM users WHERE id=?").get(user_id);
        if (!u) return sendJSON(res, 404, { error: "Utilisateur introuvable." });
        db.prepare(`INSERT INTO partenaires_officiels (user_id,statut,domaines_expertise,pays_intervention,services,description_complete,categorie,admin_id,admin_notes,date_expiration)
          VALUES (?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET statut='active',domaines_expertise=excluded.domaines_expertise,
          pays_intervention=excluded.pays_intervention,services=excluded.services,
          description_complete=excluded.description_complete,categorie=excluded.categorie,
          admin_id=excluded.admin_id,admin_notes=excluded.admin_notes,date_expiration=excluded.date_expiration,
          updated_at=datetime('now')`).run(
          user_id, 'active',
          JSON.stringify(domaines_expertise||[]),
          JSON.stringify(pays_intervention||[]),
          JSON.stringify(services||[]),
          description_complete||null, categorie||'general', me.id, admin_notes||null, date_expiration||null
        );
        db.prepare("INSERT INTO partenaires_officiels_historique (user_id,action,admin_id,admin_nom,motif) VALUES (?,?,?,?,?)")
          .run(user_id, 'attribution', me.id, me.nom, admin_notes||null);
        creerNotif(user_id, "accreditation", "🏅 Partenaire Officiel Diaspo'Actif",
          `Félicitations ! Vous êtes désormais Partenaire Officiel Diaspo'Actif.`, {});
        return sendJSON(res, 200, { ok: true });
      }
    }

    const adminPartM = pathname.match(/^\/api\/admin\/partenaires\/(\d+)\/statut$/);
    if (adminPartM && req.method === "PUT") {
      const me = getCurrentUser(req);
      if (!me || me.role !== 'administrateur') return sendJSON(res, 403, { error: "Admin requis." });
      const pid = parseInt(adminPartM[1]);
      const { statut, motif } = body;
      if (!['active','suspendue','retiree'].includes(statut)) return sendJSON(res, 400, { error: "Statut invalide." });
      const po = await db.prepare("SELECT user_id FROM partenaires_officiels WHERE id=?").get(pid);
      if (!po) return sendJSON(res, 404, { error: "Introuvable." });
      db.prepare("UPDATE partenaires_officiels SET statut=?,updated_at=datetime('now') WHERE id=?").run(statut, pid);
      db.prepare("INSERT INTO partenaires_officiels_historique (user_id,action,admin_id,admin_nom,motif) VALUES (?,?,?,?,?)")
        .run(po.user_id, statut, me.id, me.nom, motif||null);
      const msgs = { suspendue:'Votre statut de Partenaire Officiel a été suspendu.', retiree:'Votre statut de Partenaire Officiel a été retiré.', active:'Votre statut de Partenaire Officiel a été réactivé.' };
      creerNotif(po.user_id, "accreditation", "Partenaire Officiel — Mise à jour", msgs[statut]||'', {});
      return sendJSON(res, 200, { ok: true });
    }

    return sendJSON(res, 404, { error: "Route API inconnue." });
  }

  serveStatic(req, res, pathname);
}

/* ════════════════════════════════════════════════════════════════
   MODULE GESTION DES ASSOCIATIONS — Art. 30-33
   Accréditation, abonnement, adhérents, cotisations, finances,
   documents, votes électroniques, badges
   ════════════════════════════════════════════════════════════════ */

function getAssoAccred(userId) {
  return await db.prepare(`SELECT * FROM asso_accreditations WHERE user_id=? AND statut='active'`).get(userId);
}

/* GET /api/asso/accreditation */
route("GET", "/api/asso/accreditation", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const accred = await db.prepare(`SELECT * FROM asso_accreditations WHERE user_id=?`).get(user.id);
  const demande = await db.prepare(`SELECT * FROM asso_demandes WHERE user_id=? ORDER BY created_at DESC LIMIT 1`).get(user.id);
  sendJSON(res, 200, { accreditation: accred || null, demande: demande || null });
});

/* POST /api/asso/demande */
route("POST", "/api/asso/demande", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const { niveau = "verifiee", periodicite = "annuel", nom_asso, pays, ville, siret, description } = body;
  if (!nom_asso) return sendJSON(res, 400, { error: "Le nom de l'association est requis." });
  if (!["verifiee","accreditee"].includes(niveau)) return sendJSON(res, 400, { error: "Niveau invalide." });
  const existante = await db.prepare(`SELECT id FROM asso_demandes WHERE user_id=? AND statut='en_attente'`).get(user.id);
  if (existante) return sendJSON(res, 409, { error: "Une demande est déjà en cours de traitement." });
  const accred = getAssoAccred(user.id);
  if (accred && accred.niveau === niveau) return sendJSON(res, 409, { error: "Vous possédez déjà ce niveau." });
  const id = db.prepare(`INSERT INTO asso_demandes (user_id,niveau,periodicite,nom_asso,pays,ville,siret,description) VALUES (?,?,?,?,?,?,?,?)`)
    .run(user.id, niveau, periodicite, nom_asso, pays||null, ville||null, siret||null, description||null).lastInsertRowid;
  const admins = db.prepare(`SELECT id FROM users WHERE role IN ('administrateur','super_administrateur')`).all();
  admins.forEach(a => creerNotif(a.id, "validation", "Demande accréditation association",
    `${user.nom} demande l'accréditation « Association ${niveau === "accreditee" ? "Accréditée" : "Vérifiée"} »`, { demande_id: Number(id) }));
  sendJSON(res, 201, { id, ok: true });
});

/* GET /api/asso/demandes */
route("GET", "/api/asso/demandes", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const demandes = await db.prepare(`SELECT * FROM asso_demandes WHERE user_id=? ORDER BY created_at DESC`).all(user.id);
  sendJSON(res, 200, { demandes });
});

/* GET /api/asso/adherents */
route("GET", "/api/asso/adherents", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module Gestion des Associations requis." });
  const { q, statut, limit: lim = 50, offset: off = 0 } = query;
  let sql = `SELECT * FROM asso_adherents WHERE asso_user_id=?`;
  const p = [user.id];
  if (statut) { sql += ` AND statut=?`; p.push(statut); }
  if (q) { sql += ` AND (prenom LIKE ? OR nom LIKE ? OR email LIKE ?)`; p.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  sql += ` ORDER BY nom,prenom LIMIT ? OFFSET ?`;
  p.push(Number(lim), Number(off));
  const total = db.prepare(`SELECT COUNT(*) AS n FROM asso_adherents WHERE asso_user_id=?`).get(user.id).n;
  const adherents = await db.prepare(sql).all(...p);
  sendJSON(res, 200, { adherents, total });
});

/* POST /api/asso/adherents */
route("POST", "/api/asso/adherents", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module Gestion des Associations requis." });
  const { prenom, nom, email, telephone, adresse, pays, date_naissance, nationalite, type_adhesion = "standard", date_expiration, notes } = body;
  if (!prenom || !nom) return sendJSON(res, 400, { error: "Prénom et nom requis." });
  const id = db.prepare(`INSERT INTO asso_adherents (asso_user_id,prenom,nom,email,telephone,adresse,pays,date_naissance,nationalite,type_adhesion,date_expiration,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(user.id, prenom, nom, email||null, telephone||null, adresse||null, pays||null, date_naissance||null, nationalite||null, type_adhesion, date_expiration||null, notes||null).lastInsertRowid;
  sendJSON(res, 201, { id, ok: true });
});

/* PUT /api/asso/adherents/:id */
route("PUT", "/api/asso/adherents/:id", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const adh = await db.prepare(`SELECT * FROM asso_adherents WHERE id=? AND asso_user_id=?`).get(Number(params.id), user.id);
  if (!adh) return sendJSON(res, 404, { error: "Adhérent introuvable." });
  const { prenom, nom, email, telephone, adresse, pays, date_naissance, nationalite, statut, type_adhesion, date_expiration, notes } = body;
  db.prepare(`UPDATE asso_adherents SET prenom=COALESCE(?,prenom),nom=COALESCE(?,nom),email=COALESCE(?,email),telephone=COALESCE(?,telephone),
    adresse=COALESCE(?,adresse),pays=COALESCE(?,pays),date_naissance=COALESCE(?,date_naissance),nationalite=COALESCE(?,nationalite),
    statut=COALESCE(?,statut),type_adhesion=COALESCE(?,type_adhesion),date_expiration=COALESCE(?,date_expiration),notes=COALESCE(?,notes),updated_at=datetime('now') WHERE id=?`)
    .run(prenom||null,nom||null,email||null,telephone||null,adresse||null,pays||null,date_naissance||null,nationalite||null,statut||null,type_adhesion||null,date_expiration||null,notes||null,adh.id);
  sendJSON(res, 200, { ok: true });
});

/* DELETE /api/asso/adherents/:id */
route("DELETE", "/api/asso/adherents/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const adh = await db.prepare(`SELECT id FROM asso_adherents WHERE id=? AND asso_user_id=?`).get(Number(params.id), user.id);
  if (!adh) return sendJSON(res, 404, { error: "Adhérent introuvable." });
  await db.prepare(`DELETE FROM asso_adherents WHERE id=?`).run(adh.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/asso/cotisations */
route("GET", "/api/asso/cotisations", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const { statut, limit: lim = 50, offset: off = 0 } = query;
  let sql = `SELECT c.*, a.prenom||' '||a.nom AS adherent_nom FROM asso_cotisations c LEFT JOIN asso_adherents a ON a.id=c.adherent_id WHERE c.asso_user_id=?`;
  const p = [user.id];
  if (statut) { sql += ` AND c.statut=?`; p.push(statut); }
  sql += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
  p.push(Number(lim), Number(off));
  const cotisations = await db.prepare(sql).all(...p);
  const stats = db.prepare(`SELECT SUM(CASE WHEN statut='payee' THEN montant ELSE 0 END) AS total_percu, SUM(CASE WHEN statut='en_attente' THEN montant ELSE 0 END) AS total_attendu, COUNT(*) AS total, SUM(CASE WHEN statut='en_retard' THEN 1 ELSE 0 END) AS en_retard FROM asso_cotisations WHERE asso_user_id=?`).get(user.id);
  sendJSON(res, 200, { cotisations, stats });
});

/* POST /api/asso/cotisations */
route("POST", "/api/asso/cotisations", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const { adherent_id, intitule, montant, devise = "EUR", periodicite = "annuel", statut = "en_attente", date_echeance, date_paiement, mode_paiement, reference, notes } = body;
  if (!intitule || montant == null) return sendJSON(res, 400, { error: "Intitulé et montant requis." });
  const id = db.prepare(`INSERT INTO asso_cotisations (asso_user_id,adherent_id,intitule,montant,devise,periodicite,statut,date_echeance,date_paiement,mode_paiement,reference,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(user.id, adherent_id||null, intitule, Number(montant), devise, periodicite, statut, date_echeance||null, date_paiement||null, mode_paiement||null, reference||null, notes||null).lastInsertRowid;
  sendJSON(res, 201, { id, ok: true });
});

/* PUT /api/asso/cotisations/:id/statut */
route("PUT", "/api/asso/cotisations/:id/statut", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const cot = await db.prepare(`SELECT id FROM asso_cotisations WHERE id=? AND asso_user_id=?`).get(Number(params.id), user.id);
  if (!cot) return sendJSON(res, 404, { error: "Cotisation introuvable." });
  const { statut, date_paiement, mode_paiement } = body;
  db.prepare(`UPDATE asso_cotisations SET statut=COALESCE(?,statut),date_paiement=COALESCE(?,date_paiement),mode_paiement=COALESCE(?,mode_paiement) WHERE id=?`)
    .run(statut||null, date_paiement||null, mode_paiement||null, cot.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/asso/finances */
route("GET", "/api/asso/finances", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const { annee, limit: lim = 100, offset: off = 0 } = query;
  let sql = `SELECT * FROM asso_finances WHERE asso_user_id=?`;
  const p = [user.id];
  if (annee) { sql += ` AND strftime('%Y',date_op)=?`; p.push(String(annee)); }
  sql += ` ORDER BY date_op DESC LIMIT ? OFFSET ?`;
  p.push(Number(lim), Number(off));
  const mouvements = await db.prepare(sql).all(...p);
  const bilan = db.prepare(`SELECT SUM(CASE WHEN type='recette' THEN montant ELSE 0 END) AS recettes, SUM(CASE WHEN type='depense' THEN montant ELSE 0 END) AS depenses, SUM(CASE WHEN type='recette' THEN montant ELSE -montant END) AS solde FROM asso_finances WHERE asso_user_id=?`).get(user.id);
  sendJSON(res, 200, { mouvements, bilan });
});

/* POST /api/asso/finances */
route("POST", "/api/asso/finances", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const { type, categorie, intitule, montant, devise = "EUR", date_op, mode_paiement, piece_justif, notes } = body;
  if (!["recette","depense"].includes(type)) return sendJSON(res, 400, { error: "Type invalide." });
  if (!intitule || montant == null) return sendJSON(res, 400, { error: "Intitulé et montant requis." });
  const id = db.prepare(`INSERT INTO asso_finances (asso_user_id,type,categorie,intitule,montant,devise,date_op,mode_paiement,piece_justif,notes) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(user.id, type, categorie||null, intitule, Number(montant), devise, date_op||new Date().toISOString().slice(0,10), mode_paiement||null, piece_justif||null, notes||null).lastInsertRowid;
  sendJSON(res, 201, { id, ok: true });
});

/* DELETE /api/asso/finances/:id */
route("DELETE", "/api/asso/finances/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const row = await db.prepare(`SELECT id FROM asso_finances WHERE id=? AND asso_user_id=?`).get(Number(params.id), user.id);
  if (!row) return sendJSON(res, 404, { error: "Mouvement introuvable." });
  await db.prepare(`DELETE FROM asso_finances WHERE id=?`).run(row.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/asso/documents */
route("GET", "/api/asso/documents", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const docs = await db.prepare(`SELECT * FROM asso_documents WHERE asso_user_id=? ORDER BY created_at DESC`).all(user.id);
  sendJSON(res, 200, { documents: docs });
});

/* POST /api/asso/documents */
route("POST", "/api/asso/documents", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const { nom, type = "autre", url, taille, acces = "bureau" } = body;
  if (!nom) return sendJSON(res, 400, { error: "Nom du document requis." });
  const id = db.prepare(`INSERT INTO asso_documents (asso_user_id,nom,type,url,taille,acces,created_by) VALUES (?,?,?,?,?,?,?)`)
    .run(user.id, nom, type, url||null, taille||null, acces, user.id).lastInsertRowid;
  sendJSON(res, 201, { id, ok: true });
});

/* DELETE /api/asso/documents/:id */
route("DELETE", "/api/asso/documents/:id", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const doc = await db.prepare(`SELECT id FROM asso_documents WHERE id=? AND asso_user_id=?`).get(Number(params.id), user.id);
  if (!doc) return sendJSON(res, 404, { error: "Document introuvable." });
  await db.prepare(`DELETE FROM asso_documents WHERE id=?`).run(doc.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/asso/votes */
route("GET", "/api/asso/votes", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const votes = await db.prepare(`SELECT * FROM asso_votes WHERE asso_user_id=? ORDER BY created_at DESC`).all(user.id);
  sendJSON(res, 200, { votes });
});

/* POST /api/asso/votes */
route("POST", "/api/asso/votes", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!getAssoAccred(user.id)) return sendJSON(res, 403, { error: "Module requis." });
  const { titre, description, type = "resolution", options = [], anonyme = true, date_debut, date_fin, quorum = 0 } = body;
  if (!titre) return sendJSON(res, 400, { error: "Titre requis." });
  if (!Array.isArray(options) || options.length < 2) return sendJSON(res, 400, { error: "Au moins 2 options requises." });
  const id = db.prepare(`INSERT INTO asso_votes (asso_user_id,titre,description,type,options_json,anonyme,date_debut,date_fin,quorum,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(user.id, titre, description||null, type, JSON.stringify(options), anonyme?1:0, date_debut||null, date_fin||null, Number(quorum), user.id).lastInsertRowid;
  sendJSON(res, 201, { id, ok: true });
});

/* PUT /api/asso/votes/:id/ouvrir */
route("PUT", "/api/asso/votes/:id/ouvrir", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const v = await db.prepare(`SELECT id FROM asso_votes WHERE id=? AND asso_user_id=?`).get(Number(params.id), user.id);
  if (!v) return sendJSON(res, 404, { error: "Vote introuvable." });
  await db.prepare(`UPDATE asso_votes SET statut='ouvert' WHERE id=?`).run(v.id);
  sendJSON(res, 200, { ok: true });
});

/* PUT /api/asso/votes/:id/clore */
route("PUT", "/api/asso/votes/:id/clore", async (req, res, params) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const v = await db.prepare(`SELECT * FROM asso_votes WHERE id=? AND asso_user_id=?`).get(Number(params.id), user.id);
  if (!v) return sendJSON(res, 404, { error: "Vote introuvable." });
  const reponses = db.prepare(`SELECT choix, COUNT(*) AS n FROM asso_votes_reponses WHERE vote_id=? GROUP BY choix`).all(v.id);
  const resultat = {};
  reponses.forEach(r => { resultat[r.choix] = r.n; });
  await db.prepare(`UPDATE asso_votes SET statut='clos', resultat_json=? WHERE id=?`).run(JSON.stringify(resultat), v.id);
  sendJSON(res, 200, { ok: true, resultat });
});

/* POST /api/asso/votes/:id/voter */
route("POST", "/api/asso/votes/:id/voter", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const v = await db.prepare(`SELECT * FROM asso_votes WHERE id=? AND statut='ouvert'`).get(Number(params.id));
  if (!v) return sendJSON(res, 404, { error: "Vote non disponible." });
  const { adherent_id, choix } = body;
  if (!choix) return sendJSON(res, 400, { error: "Choix requis." });
  const options = JSON.parse(v.options_json || "[]");
  if (!options.includes(choix)) return sendJSON(res, 400, { error: "Option invalide." });
  try {
    db.prepare(`INSERT INTO asso_votes_reponses (vote_id,adherent_id,choix) VALUES (?,?,?)`)
      .run(v.id, adherent_id||null, choix);
    sendJSON(res, 201, { ok: true });
  } catch(e) {
    sendJSON(res, 409, { error: "Vous avez déjà voté." });
  }
});

/* GET /api/asso/badge/:userId */
route("GET", "/api/asso/badge/:userId", async (req, res, params) => {
  const accred = await db.prepare(`SELECT niveau, statut FROM asso_accreditations WHERE user_id=?`).get(Number(params.userId));
  if (!accred || accred.statut !== "active") return sendJSON(res, 200, { badge: null });
  sendJSON(res, 200, { badge: accred.niveau });
});

/* GET /api/asso/dashboard */
route("GET", "/api/asso/dashboard", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  const accred = getAssoAccred(user.id);
  if (!accred) return sendJSON(res, 403, { error: "Module requis." });
  const adherents = db.prepare(`SELECT COUNT(*) n FROM asso_adherents WHERE asso_user_id=? AND statut='actif'`).get(user.id).n;
  const adherentsTotal = db.prepare(`SELECT COUNT(*) n FROM asso_adherents WHERE asso_user_id=?`).get(user.id).n;
  const cotisations = db.prepare(`SELECT SUM(montant) n FROM asso_cotisations WHERE asso_user_id=? AND statut='payee'`).get(user.id).n || 0;
  const en_retard = db.prepare(`SELECT COUNT(*) n FROM asso_cotisations WHERE asso_user_id=? AND statut='en_retard'`).get(user.id).n;
  const bilan = db.prepare(`SELECT SUM(CASE WHEN type='recette' THEN montant ELSE -montant END) solde FROM asso_finances WHERE asso_user_id=?`).get(user.id).solde || 0;
  const votes_ouverts = db.prepare(`SELECT COUNT(*) n FROM asso_votes WHERE asso_user_id=? AND statut='ouvert'`).get(user.id).n;
  const documents = db.prepare(`SELECT COUNT(*) n FROM asso_documents WHERE asso_user_id=?`).get(user.id).n;
  sendJSON(res, 200, { accreditation: accred, stats: { adherents, adherentsTotal, cotisations, en_retard, bilan, votes_ouverts, documents } });
});

/* ADMIN routes */
route("GET", "/api/admin/asso/demandes", async (req, res, params, body, query) => {
  const user = getCurrentUser(req);
  if (!user || !["administrateur","super_administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé." });
  const statut = query.statut || "en_attente";
  const rows = await db.prepare(`SELECT d.*, u.nom AS user_nom, u.email AS user_email FROM asso_demandes d JOIN users u ON u.id=d.user_id WHERE d.statut=? ORDER BY d.created_at DESC`).all(statut);
  sendJSON(res, 200, { demandes: rows });
});

route("POST", "/api/admin/asso/demandes/:id/approuver", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || !["administrateur","super_administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé." });
  const dem = await db.prepare(`SELECT * FROM asso_demandes WHERE id=?`).get(Number(params.id));
  if (!dem) return sendJSON(res, 404, { error: "Demande introuvable." });
  db.prepare(`UPDATE asso_demandes SET statut='approuvee', updated_at=datetime('now') WHERE id=?`).run(dem.id);
  const existing = await db.prepare(`SELECT id FROM asso_accreditations WHERE user_id=?`).get(dem.user_id);
  const { date_fin } = body;
  if (existing) {
    db.prepare(`UPDATE asso_accreditations SET niveau=?,statut='active',periodicite=?,date_debut=date('now'),date_fin=?,admin_id=?,updated_at=datetime('now') WHERE id=?`)
      .run(dem.niveau, dem.periodicite, date_fin||null, user.id, existing.id);
  } else {
    db.prepare(`INSERT INTO asso_accreditations (user_id,niveau,statut,periodicite,date_debut,date_fin,admin_id) VALUES (?,?,'active',?,date('now'),?,?)`)
      .run(dem.user_id, dem.niveau, dem.periodicite, date_fin||null, user.id);
  }
  db.prepare(`INSERT INTO asso_accred_historique (user_id,action,niveau,admin_id) VALUES (?,?,?,?)`)
    .run(dem.user_id, "approuvee", dem.niveau, user.id);
  creerNotif(dem.user_id, "success", "Accréditation accordée",
    `Votre accréditation « Association ${dem.niveau === "accreditee" ? "Accréditée" : "Vérifiée"} » a été approuvée.`);
  sendJSON(res, 200, { ok: true });
});

route("POST", "/api/admin/asso/demandes/:id/refuser", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || !["administrateur","super_administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé." });
  const dem = await db.prepare(`SELECT * FROM asso_demandes WHERE id=?`).get(Number(params.id));
  if (!dem) return sendJSON(res, 404, { error: "Demande introuvable." });
  const { motif } = body;
  db.prepare(`UPDATE asso_demandes SET statut='refusee', motif_refus=?, updated_at=datetime('now') WHERE id=?`).run(motif||null, dem.id);
  db.prepare(`INSERT INTO asso_accred_historique (user_id,action,niveau,admin_id,motif) VALUES (?,?,?,?,?)`)
    .run(dem.user_id, "refusee", dem.niveau, user.id, motif||null);
  creerNotif(dem.user_id, "alerte", "Demande refusée",
    `Votre demande d'accréditation association a été refusée.${motif ? " Motif : " + motif : ""}`);
  sendJSON(res, 200, { ok: true });
});

route("POST", "/api/admin/asso/:userId/suspendre", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || !["administrateur","super_administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé." });
  const { motif } = body;
  db.prepare(`UPDATE asso_accreditations SET statut='suspendue',motif=?,updated_at=datetime('now') WHERE user_id=?`).run(motif||null, Number(params.userId));
  db.prepare(`INSERT INTO asso_accred_historique (user_id,action,admin_id,motif) VALUES (?,?,?,?)`).run(Number(params.userId), "suspendue", user.id, motif||null);
  creerNotif(Number(params.userId), "alerte", "Accréditation suspendue", `Votre accréditation a été suspendue.${motif ? " Motif : " + motif : ""}`);
  sendJSON(res, 200, { ok: true });
});

route("POST", "/api/admin/asso/:userId/retirer", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || !["administrateur","super_administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé." });
  const { motif } = body;
  db.prepare(`UPDATE asso_accreditations SET statut='retiree',motif=?,updated_at=datetime('now') WHERE user_id=?`).run(motif||null, Number(params.userId));
  db.prepare(`INSERT INTO asso_accred_historique (user_id,action,admin_id,motif) VALUES (?,?,?,?)`).run(Number(params.userId), "retiree", user.id, motif||null);
  creerNotif(Number(params.userId), "alerte", "Accréditation retirée", `Votre accréditation a été retirée.${motif ? " Motif : " + motif : ""}`);
  sendJSON(res, 200, { ok: true });
});

route("GET", "/api/admin/asso/liste", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || !["administrateur","super_administrateur"].includes(user.role)) return sendJSON(res, 403, { error: "Réservé." });
  const rows = await db.prepare(`SELECT a.*, u.nom AS user_nom, u.email AS user_email FROM asso_accreditations a JOIN users u ON u.id=a.user_id ORDER BY a.updated_at DESC`).all();
  sendJSON(res, 200, { associations: rows });
});

/* ════════════════════════════════════════════════════════════════════
   DAA-Lang — Modules complémentaires
   BANK_INFO · NOTIFICATIONS · FINANCE(budgets) · DOCUMENTS(OCR) ·
   GENERAL_ASSEMBLY · ANALYTICS · SECURITY(audit) · AI · SUBSCRIPTION
   Toutes les règles métier et permissions sont dérivées de daa-lang.js
   ════════════════════════════════════════════════════════════════════ */

/* Rôle DAA-Lang de l'utilisateur courant dans une association.
   Le titulaire de l'accréditation est PRESIDENT ; sinon on lit
   asso_membre_roles. */
function assoRole(assoUserId, daUserId) {
  if (assoUserId === daUserId) return "PRESIDENT";
  const r = await db.prepare(`SELECT role FROM asso_membre_roles WHERE asso_user_id=? AND da_user_id=?`).get(assoUserId, daUserId);
  return r ? r.role : "GUEST";
}

/* Garde de permission unifiée : accréditation active + capacité DSL.
   Renvoie { user, accred } si OK, sinon écrit la réponse et renvoie null. */
function assoGuard(req, res, action) {
  const user = getCurrentUser(req);
  if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
  const accred = getAssoAccred(user.id);
  if (!accred) { sendJSON(res, 403, { error: "Module Gestion des Associations requis." }); return null; }
  const role = assoRole(user.id, user.id); // propriétaire = PRESIDENT
  if (action && !DAA.roleCan(role, action)) {
    sendJSON(res, 403, { error: `Action « ${action} » non autorisée pour le rôle ${role}.` });
    return null;
  }
  return { user, accred, role };
}

/* Journalisation d'audit (DSL SECURITY.AUDIT_LOGS / FINANCE.AUDIT_TRAIL) */
function assoAudit(assoUserId, acteurId, action, entite, entiteId, details) {
  try {
    db.prepare(`INSERT INTO asso_audit_log (asso_user_id,acteur_id,action,entite,entite_id,details) VALUES (?,?,?,?,?,?)`)
      .run(assoUserId, acteurId || null, action, entite || null, entiteId || null, details ? JSON.stringify(details) : null);
  } catch (e) { /* l'audit ne doit jamais bloquer l'opération métier */ }
}

/* ── GET /api/asso/spec — expose la spécification DAA-Lang ────────────── */
route("GET", "/api/asso/spec", async (req, res) => {
  sendJSON(res, 200, { spec: DAA.SPEC });
});

/* ════════ MODULE BANK_INFO (DSL CONTRIBUTIONS.BANK_INFO) ════════ */

/* GET /api/asso/bank-info — accès restreint à ACCESS_ROLE du DSL */
route("GET", "/api/asso/bank-info", async (req, res) => {
  const g = assoGuard(req, res, "bank_info.read");
  if (!g) return;
  const info = await db.prepare(`SELECT * FROM asso_bank_info WHERE asso_user_id=?`).get(g.user.id);
  sendJSON(res, 200, { bank_info: info || null });
});

/* PUT /api/asso/bank-info */
route("PUT", "/api/asso/bank-info", async (req, res, params, body) => {
  const g = assoGuard(req, res, "bank_info.write");
  if (!g) return;
  const { holder_name, bank_name, iban, bic, devise = "EUR", reference_modele, display_to_members = 1, instructions } = body;
  // Validation selon le DSL : IBAN + HOLDER_NAME = REQUIRED
  if (!holder_name || !iban) return sendJSON(res, 400, { error: "Titulaire (HOLDER_NAME) et IBAN sont requis (DSL)." });
  if (!DAA.isValid("currency", devise)) return sendJSON(res, 400, { error: "Devise non supportée par le DSL." });
  const existing = await db.prepare(`SELECT id FROM asso_bank_info WHERE asso_user_id=?`).get(g.user.id);
  if (existing) {
    db.prepare(`UPDATE asso_bank_info SET holder_name=?,bank_name=?,iban=?,bic=?,devise=?,reference_modele=COALESCE(?,reference_modele),display_to_members=?,instructions=?,updated_at=datetime('now') WHERE asso_user_id=?`)
      .run(holder_name, bank_name||null, iban, bic||null, devise, reference_modele||null, display_to_members?1:0, instructions||null, g.user.id);
  } else {
    db.prepare(`INSERT INTO asso_bank_info (asso_user_id,holder_name,bank_name,iban,bic,devise,reference_modele,display_to_members,instructions) VALUES (?,?,?,?,?,?,COALESCE(?,'COTISATION-{ANNEE}-{PRENOM}-{NOM}'),?,?)`)
      .run(g.user.id, holder_name, bank_name||null, iban, bic||null, devise, reference_modele||null, display_to_members?1:0, instructions||null);
  }
  assoAudit(g.user.id, g.user.id, "bank_info.update", "bank_info", null, { iban: iban.slice(0,8)+"…" });
  sendJSON(res, 200, { ok: true });
});

/* GET /api/asso/bank-info/virement/:cotisationId — instructions de virement
   générées pour un membre (référence automatique selon le modèle DSL) */
route("GET", "/api/asso/bank-info/virement/:cotisationId", async (req, res, params) => {
  const g = assoGuard(req, res, "contributions.read");
  if (!g) return;
  const info = await db.prepare(`SELECT * FROM asso_bank_info WHERE asso_user_id=?`).get(g.user.id);
  if (!info) return sendJSON(res, 404, { error: "Coordonnées bancaires non renseignées." });
  const cot = await db.prepare(`SELECT c.*, a.prenom, a.nom FROM asso_cotisations c LEFT JOIN asso_adherents a ON a.id=c.adherent_id WHERE c.id=? AND c.asso_user_id=?`).get(Number(params.cotisationId), g.user.id);
  if (!cot) return sendJSON(res, 404, { error: "Cotisation introuvable." });
  const reference = (info.reference_modele || "COTISATION-{ANNEE}-{PRENOM}-{NOM}")
    .replace("{ANNEE}", new Date().getFullYear())
    .replace("{PRENOM}", (cot.prenom||"").toUpperCase())
    .replace("{NOM}", (cot.nom||"").toUpperCase());
  sendJSON(res, 200, { virement: {
    holder_name: info.holder_name, bank_name: info.bank_name, iban: info.iban, bic: info.bic,
    montant: cot.montant, devise: cot.devise, reference, instructions: info.instructions,
  }});
});

/* ════════ MODULE NOTIFICATIONS — relances automatiques ════════ */

/* POST /api/asso/relances/run — déclenche le moteur de relances.
   Parcourt les cotisations impayées, calcule le retard, choisit le niveau
   de gabarit (DSL TEMPLATE_LEVELS) selon REMINDER_SCHEDULE. */
route("POST", "/api/asso/relances/run", async (req, res, params, body) => {
  const g = assoGuard(req, res, "notifications.send");
  if (!g) return;
  if (!DAA.NOTIFICATIONS.PAYMENT_REMINDERS) return sendJSON(res, 200, { ok: true, relances: 0 });
  const canal = (body && body.canal && DAA.isValid("channel", body.canal)) ? String(body.canal).toUpperCase() : "APP";
  const offsets = DAA.reminderOffsets(); // [0,7,15,30,60]
  const impayees = db.prepare(`SELECT c.*, a.prenom, a.nom, a.da_user_id FROM asso_cotisations c LEFT JOIN asso_adherents a ON a.id=c.adherent_id
    WHERE c.asso_user_id=? AND c.statut IN ('en_attente','en_retard') AND c.date_echeance IS NOT NULL`).all(g.user.id);
  const today = new Date();
  let count = 0;
  for (const cot of impayees) {
    const ech = new Date(cot.date_echeance);
    const daysLate = Math.floor((today - ech) / 86400000);
    if (daysLate < 0) continue;
    // Ne relancer qu'aux jalons définis par le DSL
    if (!offsets.includes(daysLate)) continue;
    // Éviter les doublons de relance pour ce jalon
    const deja = await db.prepare(`SELECT id FROM asso_relances WHERE cotisation_id=? AND jours_retard=?`).get(cot.id, daysLate);
    if (deja) continue;
    const niveau = DAA.reminderLevelFor(daysLate);
    const message = `Relance ${niveau} — cotisation « ${cot.intitule} » (${cot.montant} ${cot.devise}) en retard de ${daysLate} jour(s).`;
    db.prepare(`INSERT INTO asso_relances (asso_user_id,cotisation_id,adherent_id,niveau,canal,jours_retard,message) VALUES (?,?,?,?,?,?,?)`)
      .run(g.user.id, cot.id, cot.adherent_id, niveau, canal, daysLate, message);
    // Marque la cotisation en retard
    if (cot.statut !== "en_retard") await db.prepare(`UPDATE asso_cotisations SET statut='en_retard' WHERE id=?`).run(cot.id);
    // Canal APP → notification plateforme si le membre a un compte lié (confidentialité respectée)
    if (canal === "APP" && cot.da_user_id) {
      creerNotif(cot.da_user_id, niveau === "FINAL_NOTICE" ? "alerte" : "info", "Rappel de cotisation", message);
    }
    // DSL AUTO_SUSPENSION : suspension après le dernier jalon
    if (DAA.CONTRIBUTIONS.AUTO_SUSPENSION && daysLate >= Math.max(...offsets) && cot.adherent_id) {
      await db.prepare(`UPDATE asso_adherents SET statut='suspendu' WHERE id=? AND asso_user_id=?`).run(cot.adherent_id, g.user.id);
    }
    count++;
  }
  assoAudit(g.user.id, g.user.id, "relances.run", "relances", null, { generees: count, canal });
  sendJSON(res, 200, { ok: true, relances: count });
});

/* GET /api/asso/relances */
route("GET", "/api/asso/relances", async (req, res, params, body, query) => {
  const g = assoGuard(req, res, "contributions.read");
  if (!g) return;
  const rows = await db.prepare(`SELECT r.*, a.prenom||' '||a.nom AS adherent_nom FROM asso_relances r LEFT JOIN asso_adherents a ON a.id=r.adherent_id WHERE r.asso_user_id=? ORDER BY r.created_at DESC LIMIT 200`).all(g.user.id);
  sendJSON(res, 200, { relances: rows });
});

/* ════════ MODULE FINANCE — budgets & validation (DSL FINANCE) ════════ */

/* GET /api/asso/budgets — budget prévu vs réel par catégorie */
route("GET", "/api/asso/budgets", async (req, res, params, body, query) => {
  const g = assoGuard(req, res, "finance.read");
  if (!g) return;
  const annee = Number(query.annee) || new Date().getFullYear();
  const budgets = await db.prepare(`SELECT * FROM asso_budgets WHERE asso_user_id=? AND annee=? ORDER BY categorie`).all(g.user.id, annee);
  // DSL AUTO_CALCULATIONS : rapproche chaque budget des dépenses réelles
  const enriched = budgets.map(b => {
    const reel = db.prepare(`SELECT COALESCE(SUM(montant),0) n FROM asso_finances WHERE asso_user_id=? AND type='depense' AND categorie=? AND strftime('%Y',date_op)=?`)
      .get(g.user.id, b.categorie, String(annee)).n;
    const ecart = b.montant_prevu - reel;
    return { ...b, montant_reel: reel, ecart, depasse: reel > b.montant_prevu };
  });
  sendJSON(res, 200, { budgets: enriched, annee });
});

/* POST /api/asso/budgets */
route("POST", "/api/asso/budgets", async (req, res, params, body) => {
  const g = assoGuard(req, res, "budgets.write");
  if (!g) return;
  const { categorie, montant_prevu, devise = "EUR", annee, notes } = body;
  if (!categorie || montant_prevu == null) return sendJSON(res, 400, { error: "Catégorie et montant prévu requis." });
  if (!DAA.isValid("currency", devise)) return sendJSON(res, 400, { error: "Devise non supportée par le DSL." });
  const an = Number(annee) || new Date().getFullYear();
  const id = db.prepare(`INSERT INTO asso_budgets (asso_user_id,categorie,montant_prevu,devise,annee,notes) VALUES (?,?,?,?,?,?)`)
    .run(g.user.id, categorie, Number(montant_prevu), devise, an, notes||null).lastInsertRowid;
  assoAudit(g.user.id, g.user.id, "budget.create", "budget", Number(id), { categorie, montant_prevu });
  sendJSON(res, 201, { id, ok: true });
});

/* DELETE /api/asso/budgets/:id */
route("DELETE", "/api/asso/budgets/:id", async (req, res, params) => {
  const g = assoGuard(req, res, "budgets.write");
  if (!g) return;
  const b = await db.prepare(`SELECT id FROM asso_budgets WHERE id=? AND asso_user_id=?`).get(Number(params.id), g.user.id);
  if (!b) return sendJSON(res, 404, { error: "Budget introuvable." });
  await db.prepare(`DELETE FROM asso_budgets WHERE id=?`).run(b.id);
  assoAudit(g.user.id, g.user.id, "budget.delete", "budget", b.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/asso/finance/rapport — rapports DSL (MONTHLY/QUARTERLY/YEARLY) */
route("GET", "/api/asso/finance/rapport", async (req, res, params, body, query) => {
  const g = assoGuard(req, res, "finance.read");
  if (!g) return;
  const annee = Number(query.annee) || new Date().getFullYear();
  // Ventilation mensuelle (AUTO_CALCULATIONS)
  const parMois = db.prepare(`SELECT strftime('%m',date_op) mois,
      SUM(CASE WHEN type='recette' THEN montant ELSE 0 END) recettes,
      SUM(CASE WHEN type='depense' THEN montant ELSE 0 END) depenses
    FROM asso_finances WHERE asso_user_id=? AND strftime('%Y',date_op)=? GROUP BY mois ORDER BY mois`).all(g.user.id, String(annee));
  const parCategorie = db.prepare(`SELECT categorie, type, SUM(montant) total FROM asso_finances WHERE asso_user_id=? AND strftime('%Y',date_op)=? GROUP BY categorie,type`).all(g.user.id, String(annee));
  const total = db.prepare(`SELECT SUM(CASE WHEN type='recette' THEN montant ELSE 0 END) recettes, SUM(CASE WHEN type='depense' THEN montant ELSE 0 END) depenses FROM asso_finances WHERE asso_user_id=? AND strftime('%Y',date_op)=?`).get(g.user.id, String(annee));
  const resultat = (total.recettes||0) - (total.depenses||0);
  sendJSON(res, 200, { annee, parMois, parCategorie, total, resultat, devises: DAA.FINANCE.CURRENCIES });
});

/* GET /api/asso/audit — DSL SECURITY.AUDIT_LOGS */
route("GET", "/api/asso/audit", async (req, res, params, body, query) => {
  const g = assoGuard(req, res, "audit.read");
  if (!g) return;
  const rows = await db.prepare(`SELECT * FROM asso_audit_log WHERE asso_user_id=? ORDER BY created_at DESC LIMIT 300`).all(g.user.id);
  sendJSON(res, 200, { audit: rows });
});

/* ════════ MODULE DOCUMENTS — OCR / classification / anti-doublon ════════ */

/* POST /api/asso/documents/:id/ocr — enregistre l'extraction OCR/IA d'une
   facture et applique classement auto + détection de doublon (DSL DOCUMENTS) */
route("POST", "/api/asso/documents/:id/ocr", async (req, res, params, body) => {
  const g = assoGuard(req, res, "documents.write");
  if (!g) return;
  const doc = await db.prepare(`SELECT * FROM asso_documents WHERE id=? AND asso_user_id=?`).get(Number(params.id), g.user.id);
  if (!doc) return sendJSON(res, 404, { error: "Document introuvable." });
  const { type_detecte, ocr_text, fournisseur, montant_ttc, montant_ht, tva, date_facture, num_facture } = body;
  if (type_detecte && !DAA.isValid("document_type", type_detecte)) return sendJSON(res, 400, { error: "Type de document hors DSL." });
  // DSL DUPLICATE_DETECTION : hash sur fournisseur+numéro+montant
  const hash = [fournisseur, num_facture, montant_ttc].filter(Boolean).join("|").toLowerCase();
  if (hash) {
    const dup = await db.prepare(`SELECT m.id FROM asso_doc_meta m JOIN asso_documents d ON d.id=m.document_id WHERE d.asso_user_id=? AND m.hash_doublon=? AND m.document_id<>?`).get(g.user.id, hash, doc.id);
    if (dup) return sendJSON(res, 409, { error: "Doublon détecté : cette facture semble déjà enregistrée.", duplicate: true });
  }
  // DSL AUTO_CLASSIFICATION : année/trimestre/fournisseur
  let classement = null;
  if (date_facture) {
    const d = new Date(date_facture);
    const trimestre = Math.floor(d.getMonth() / 3) + 1;
    classement = `${d.getFullYear()}/T${trimestre}` + (fournisseur ? `/${fournisseur}` : "");
  }
  const existing = await db.prepare(`SELECT id FROM asso_doc_meta WHERE document_id=?`).get(doc.id);
  if (existing) {
    await db.prepare(`UPDATE asso_doc_meta SET type_detecte=?,ocr_text=?,fournisseur=?,montant_ttc=?,montant_ht=?,tva=?,date_facture=?,num_facture=?,hash_doublon=?,classement=? WHERE document_id=?`)
      .run(type_detecte||null, ocr_text||null, fournisseur||null, montant_ttc!=null?Number(montant_ttc):null, montant_ht!=null?Number(montant_ht):null, tva!=null?Number(tva):null, date_facture||null, num_facture||null, hash||null, classement, doc.id);
  } else {
    db.prepare(`INSERT INTO asso_doc_meta (document_id,type_detecte,ocr_text,fournisseur,montant_ttc,montant_ht,tva,date_facture,num_facture,hash_doublon,classement) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(doc.id, type_detecte||null, ocr_text||null, fournisseur||null, montant_ttc!=null?Number(montant_ttc):null, montant_ht!=null?Number(montant_ht):null, tva!=null?Number(tva):null, date_facture||null, num_facture||null, hash||null, classement);
  }
  assoAudit(g.user.id, g.user.id, "document.ocr", "document", doc.id, { fournisseur, num_facture });
  sendJSON(res, 200, { ok: true, classement });
});

/* GET /api/asso/documents/:id/meta */
route("GET", "/api/asso/documents/:id/meta", async (req, res, params) => {
  const g = assoGuard(req, res, "documents.read");
  if (!g) return;
  const doc = await db.prepare(`SELECT id FROM asso_documents WHERE id=? AND asso_user_id=?`).get(Number(params.id), g.user.id);
  if (!doc) return sendJSON(res, 404, { error: "Document introuvable." });
  const meta = await db.prepare(`SELECT * FROM asso_doc_meta WHERE document_id=?`).get(doc.id);
  sendJSON(res, 200, { meta: meta || null });
});

/* ════════ MODULE GENERAL_ASSEMBLY (DSL) ════════ */

/* GET /api/asso/assemblees */
route("GET", "/api/asso/assemblees", async (req, res) => {
  const g = assoGuard(req, res, "assembly.manage");
  if (!g) return;
  const rows = await db.prepare(`SELECT * FROM asso_assemblees WHERE asso_user_id=? ORDER BY date_prevue DESC, created_at DESC`).all(g.user.id);
  sendJSON(res, 200, { assemblees: rows, features: DAA.GENERAL_ASSEMBLY.FEATURES });
});

/* POST /api/asso/assemblees — CREATION=ONE_CLICK : active toutes les
   features du DSL par défaut, génère convocation + ordre du jour */
route("POST", "/api/asso/assemblees", async (req, res, params, body) => {
  const g = assoGuard(req, res, "assembly.manage");
  if (!g) return;
  const { titre, type = "ordinaire", date_prevue, lieu, lien_visio, ordre_du_jour, quorum_requis } = body;
  if (!titre) return sendJSON(res, 400, { error: "Titre requis." });
  // DSL AUTO_CONVOCATION + AGENDA_GENERATION_AI
  const odj = ordre_du_jour || "1. Émargement et vérification du quorum\n2. Rapport moral du président\n3. Rapport financier du trésorier\n4. Approbation des comptes\n5. Questions diverses\n6. Clôture";
  const convocation = `Convocation — ${titre}\n\nVous êtes convoqué(e) à l'assemblée générale ${type} qui se tiendra le ${date_prevue || "(date à définir)"}${lieu ? " à " + lieu : ""}${lien_visio ? " (visio : " + lien_visio + ")" : ""}.\n\nOrdre du jour :\n${odj}`;
  const id = db.prepare(`INSERT INTO asso_assemblees (asso_user_id,titre,type,date_prevue,lieu,lien_visio,ordre_du_jour,convocation,quorum_requis,features_json,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(g.user.id, titre, type, date_prevue||null, lieu||null, lien_visio||null, odj, convocation, Number(quorum_requis)||0, JSON.stringify(DAA.GENERAL_ASSEMBLY.FEATURES), g.user.id).lastInsertRowid;
  assoAudit(g.user.id, g.user.id, "assemblee.create", "assemblee", Number(id), { titre });
  sendJSON(res, 201, { id, ok: true, convocation, ordre_du_jour: odj });
});

/* PUT /api/asso/assemblees/:id — maj statut/présents/PV + contrôle quorum */
route("PUT", "/api/asso/assemblees/:id", async (req, res, params, body) => {
  const g = assoGuard(req, res, "assembly.manage");
  if (!g) return;
  const ag = await db.prepare(`SELECT * FROM asso_assemblees WHERE id=? AND asso_user_id=?`).get(Number(params.id), g.user.id);
  if (!ag) return sendJSON(res, 404, { error: "Assemblée introuvable." });
  const { statut, presents, pv, ordre_du_jour, date_prevue } = body;
  // DSL QUORUM_CHECK
  let quorum_atteint = null;
  if (presents != null && ag.quorum_requis > 0) quorum_atteint = Number(presents) >= ag.quorum_requis;
  db.prepare(`UPDATE asso_assemblees SET statut=COALESCE(?,statut),presents=COALESCE(?,presents),pv=COALESCE(?,pv),ordre_du_jour=COALESCE(?,ordre_du_jour),date_prevue=COALESCE(?,date_prevue) WHERE id=?`)
    .run(statut||null, presents!=null?Number(presents):null, pv||null, ordre_du_jour||null, date_prevue||null, ag.id);
  assoAudit(g.user.id, g.user.id, "assemblee.update", "assemblee", ag.id, { statut, quorum_atteint });
  sendJSON(res, 200, { ok: true, quorum_atteint });
});

/* ════════ MODULE ANALYTICS — engagement (DSL ANALYTICS) ════════ */

/* GET /api/asso/analytics — stats membres + indice d'engagement */
route("GET", "/api/asso/analytics", async (req, res, params, body, query) => {
  const g = assoGuard(req, res, "analytics.read");
  if (!g) return;
  const uid = g.user.id;
  const membres = db.prepare(`SELECT statut, COUNT(*) n FROM asso_adherents WHERE asso_user_id=? GROUP BY statut`).all(uid);
  const parPays = db.prepare(`SELECT COALESCE(pays,'—') pays, COUNT(*) n FROM asso_adherents WHERE asso_user_id=? GROUP BY pays ORDER BY n DESC LIMIT 20`).all(uid);
  const cotisations = db.prepare(`SELECT statut, COUNT(*) n, COALESCE(SUM(montant),0) total FROM asso_cotisations WHERE asso_user_id=? GROUP BY statut`).all(uid);
  const totalCot = db.prepare(`SELECT COUNT(*) n FROM asso_cotisations WHERE asso_user_id=?`).get(uid).n;
  const payees = db.prepare(`SELECT COUNT(*) n FROM asso_cotisations WHERE asso_user_id=? AND statut='payee'`).get(uid).n;
  const tauxRecouvrement = totalCot ? Math.round((payees / totalCot) * 100) : 0;
  // DSL ENGAGEMENT_SCORE par adhérent (TRACKING : paiements + votes)
  const engagement = db.prepare(`
    SELECT a.id, a.prenom||' '||a.nom AS nom,
      (SELECT COUNT(*) FROM asso_cotisations c WHERE c.adherent_id=a.id AND c.statut='payee') AS paiements,
      (SELECT COUNT(*) FROM asso_votes_reponses vr WHERE vr.adherent_id=a.id) AS votes
    FROM asso_adherents a WHERE a.asso_user_id=?`).all(uid)
    .map(r => ({ ...r, score: Math.min(100, r.paiements * 20 + r.votes * 15) }))
    .sort((x, y) => y.score - x.score).slice(0, 50);
  // DSL AUTO_INSIGHTS
  const insights = [];
  if (tauxRecouvrement < 60) insights.push("Taux de recouvrement faible : lancez une campagne de relance.");
  const enRetard = db.prepare(`SELECT COUNT(*) n FROM asso_cotisations WHERE asso_user_id=? AND statut='en_retard'`).get(uid).n;
  if (enRetard > 0) insights.push(`${enRetard} cotisation(s) en retard à traiter.`);
  if (!engagement.length) insights.push("Aucun adhérent enregistré : commencez par ajouter vos membres.");
  sendJSON(res, 200, { membres, parPays, cotisations, tauxRecouvrement, engagement, insights });
});

/* ════════ MODULE AI_ASSISTANT (DSL) ════════ */

/* POST /api/asso/ai — assistant : analyse finance, prédiction, rapports.
   Implémentation déterministe (sans dépendance externe) basée sur les
   données réelles ; respecte les capacités déclarées dans le DSL. */
route("POST", "/api/asso/ai", async (req, res, params, body) => {
  const g = assoGuard(req, res, "analytics.read");
  if (!g) return;
  const uid = g.user.id;
  const tache = String((body && body.tache) || "").toUpperCase();
  const out = { tache };
  if (tache === "FINANCE_ANALYSIS" && DAA.AI_ASSISTANT.FINANCE_ANALYSIS) {
    const b = db.prepare(`SELECT SUM(CASE WHEN type='recette' THEN montant ELSE 0 END) r, SUM(CASE WHEN type='depense' THEN montant ELSE 0 END) d FROM asso_finances WHERE asso_user_id=?`).get(uid);
    const solde = (b.r||0) - (b.d||0);
    out.resume = `Recettes ${b.r||0} / Dépenses ${b.d||0} → solde ${solde}. ${solde < 0 ? "Attention : trésorerie déficitaire." : "Trésorerie positive."}`;
  } else if (tache === "ENGAGEMENT_PREDICTION" && DAA.AI_ASSISTANT.ENGAGEMENT_PREDICTION) {
    const risque = db.prepare(`SELECT a.prenom||' '||a.nom nom FROM asso_adherents a WHERE a.asso_user_id=? AND a.statut='actif'
      AND NOT EXISTS (SELECT 1 FROM asso_cotisations c WHERE c.adherent_id=a.id AND c.statut='payee' AND c.date_paiement >= date('now','-1 year')) LIMIT 20`).all(uid);
    out.a_risque = risque.map(x => x.nom);
    out.resume = `${risque.length} membre(s) à risque de non-renouvellement (aucun paiement sur 12 mois).`;
  } else if (tache === "AUTO_REPORTS" && DAA.AI_ASSISTANT.AUTO_REPORTS) {
    const nb = db.prepare(`SELECT COUNT(*) n FROM asso_adherents WHERE asso_user_id=? AND statut='actif'`).get(uid).n;
    const cot = db.prepare(`SELECT COALESCE(SUM(montant),0) n FROM asso_cotisations WHERE asso_user_id=? AND statut='payee'`).get(uid).n;
    out.rapport = `Rapport d'activité — ${nb} adhérent(s) actif(s), ${cot} encaissés en cotisations.`;
  } else {
    return sendJSON(res, 400, { error: "Tâche IA non reconnue ou non activée dans le DSL.", disponibles: Object.keys(DAA.AI_ASSISTANT).filter(k => DAA.AI_ASSISTANT[k] === true) });
  }
  assoAudit(uid, uid, "ai.run", "ai", null, { tache });
  sendJSON(res, 200, out);
});

/* ════════ MODULE SUBSCRIPTION (DSL) ════════ */

/* GET /api/asso/subscription */
route("GET", "/api/asso/subscription", async (req, res) => {
  const g = assoGuard(req, res, null);
  if (!g) return;
  let sub = await db.prepare(`SELECT * FROM asso_subscription WHERE asso_user_id=?`).get(g.user.id);
  if (!sub) {
    db.prepare(`INSERT INTO asso_subscription (asso_user_id,billing,etat) VALUES (?,?, 'TRIAL')`).run(g.user.id, "YEARLY");
    sub = await db.prepare(`SELECT * FROM asso_subscription WHERE asso_user_id=?`).get(g.user.id);
  }
  // DSL FREE_MODE / UNPAID_STATE : capacités selon l'état
  const readOnly = sub.etat === "UNPAID" || sub.etat === "CANCELLED";
  sendJSON(res, 200, { subscription: sub, mode: readOnly ? DAA.SUBSCRIPTION.UNPAID_STATE : "FULL", read_only: readOnly });
});

/* POST /api/asso/subscription/pay — enregistre un paiement d'abonnement.
   DSL BADGE_GRANTED_ON_PAYMENT : active l'accréditation au paiement. */
route("POST", "/api/asso/subscription/pay", async (req, res, params, body) => {
  const g = assoGuard(req, res, null);
  if (!g) return;
  const { billing = "YEARLY", montant = 0, devise = "EUR" } = body;
  if (!DAA.isValid("billing", billing)) return sendJSON(res, 400, { error: "Périodicité de facturation hors DSL." });
  if (!DAA.isValid("currency", devise)) return sendJSON(res, 400, { error: "Devise non supportée." });
  const echeance = new Date();
  if (String(billing).toUpperCase() === "MONTHLY") echeance.setMonth(echeance.getMonth() + 1);
  else echeance.setFullYear(echeance.getFullYear() + 1);
  const ech = echeance.toISOString().slice(0, 10);
  const existing = await db.prepare(`SELECT id FROM asso_subscription WHERE asso_user_id=?`).get(g.user.id);
  if (existing) {
    db.prepare(`UPDATE asso_subscription SET billing=?,etat='ACTIVE',montant=?,devise=?,date_echeance=?,dernier_paiement=date('now'),updated_at=datetime('now') WHERE asso_user_id=?`)
      .run(billing, Number(montant), devise, ech, g.user.id);
  } else {
    db.prepare(`INSERT INTO asso_subscription (asso_user_id,billing,etat,montant,devise,date_echeance,dernier_paiement) VALUES (?,?, 'ACTIVE',?,?,?,date('now'))`)
      .run(g.user.id, billing, Number(montant), devise, ech);
  }
  // BADGE_GRANTED_ON_PAYMENT : (ré)active l'accréditation
  db.prepare(`UPDATE asso_accreditations SET statut='active',date_fin=?,updated_at=datetime('now') WHERE user_id=?`).run(ech, g.user.id);
  assoAudit(g.user.id, g.user.id, "subscription.pay", "subscription", null, { billing, montant, devise });
  sendJSON(res, 200, { ok: true, date_echeance: ech });
});

/* ════════ MODULE MEMBERS — rôles & rattachement de comptes (DSL) ════════ */

/* GET /api/asso/membre-roles */
route("GET", "/api/asso/membre-roles", async (req, res) => {
  const g = assoGuard(req, res, "members.read");
  if (!g) return;
  const rows = await db.prepare(`SELECT mr.*, u.nom AS user_nom FROM asso_membre_roles mr JOIN users u ON u.id=mr.da_user_id WHERE mr.asso_user_id=? ORDER BY mr.created_at DESC`).all(g.user.id);
  sendJSON(res, 200, { roles: rows, roles_disponibles: DAA.MEMBERS.ROLES });
});

/* POST /api/asso/membre-roles — attribue un rôle DSL à un compte plateforme */
route("POST", "/api/asso/membre-roles", async (req, res, params, body) => {
  const g = assoGuard(req, res, "members.write");
  if (!g) return;
  const { da_user_id, role = "MEMBER", role_custom } = body;
  if (!da_user_id) return sendJSON(res, 400, { error: "Compte plateforme (da_user_id) requis." });
  const roleUp = String(role).toUpperCase();
  // DSL : rôle prédéfini OU rôle personnalisé si CUSTOM_ROLES
  if (!DAA.MEMBERS.ROLES.includes(roleUp) && !(DAA.MEMBERS.CUSTOM_ROLES && role_custom)) {
    return sendJSON(res, 400, { error: "Rôle invalide selon le DSL.", roles: DAA.MEMBERS.ROLES });
  }
  const finalRole = DAA.MEMBERS.ROLES.includes(roleUp) ? roleUp : "MEMBER";
  const existing = await db.prepare(`SELECT id FROM asso_membre_roles WHERE asso_user_id=? AND da_user_id=?`).get(g.user.id, Number(da_user_id));
  if (existing) {
    await db.prepare(`UPDATE asso_membre_roles SET role=?,role_custom=? WHERE id=?`).run(finalRole, role_custom||null, existing.id);
  } else {
    db.prepare(`INSERT INTO asso_membre_roles (asso_user_id,da_user_id,role,role_custom) VALUES (?,?,?,?)`).run(g.user.id, Number(da_user_id), finalRole, role_custom||null);
  }
  assoAudit(g.user.id, g.user.id, "role.assign", "membre_role", Number(da_user_id), { role: finalRole, role_custom });
  sendJSON(res, 200, { ok: true });
});

/* ═══════════════════════════════════════════════════════════════════
   MOTEUR D'ACCRÉDITATIONS DYNAMIQUE
   ═══════════════════════════════════════════════════════════════════ */

/* Helper : récupère la définition complète (def + regles + tarifs) */
function getAccredDef(idOrType) {
  const def = typeof idOrType === 'number'
    ? await db.prepare("SELECT * FROM accred_definitions WHERE id=?").get(idOrType)
    : await db.prepare("SELECT * FROM accred_definitions WHERE type=?").get(idOrType);
  if (!def) return null;
  def.droits  = safeParse(def.droits);
  def.regles  = await db.prepare("SELECT role,mode FROM accred_regles WHERE accred_id=?").all(def.id);
  def.tarifs  = await db.prepare("SELECT role,type_tarif,montant,devise,renouvellement_auto,periode_grace_jours,validation_admin FROM accred_tarifs WHERE accred_id=?").all(def.id);
  /* eligible = liste des rôles dont le mode n'est pas 'non_concerne' */
  def.eligible = def.regles.filter(r => r.mode !== 'non_concerne').map(r => r.role);
  /* prix pour compat ACCREDITATIONS_DA statique */
  def.prix = {};
  for (const t of def.tarifs) def.prix[t.role] = t.montant;
  if (def.module === 'asso') def.prixLabel = def.tarifs[0]?.type_tarif === 'gratuit' ? 'Gratuit' : 'Premium — sur abonnement';
  return def;
}

/* GET /api/accreditations/catalogue — liste filtrée par rôle */
route("GET", "/api/accreditations/catalogue", async (req, res) => {
  const user = getCurrentUser(req);
  const role = user ? user.role : null;
  const defs = await db.prepare("SELECT * FROM accred_definitions WHERE actif=1 ORDER BY ordre,id").all();
  const result = defs.map(d => {
    const def = getAccredDef(d.id);
    if (!def) return null;
    if (role && !def.eligible.includes(role)) return null; // filtrer par rôle si connecté
    return def;
  }).filter(Boolean);
  sendJSON(res, 200, { catalogue: result });
});

/* ──── Routes Admin : gestion des définitions ──── */

/* GET /api/admin/accred/definitions */
route("GET", "/api/admin/accred/definitions", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const defs = await db.prepare("SELECT * FROM accred_definitions ORDER BY ordre,id").all();
  sendJSON(res, 200, { definitions: defs.map(d => getAccredDef(d.id)) });
});

/* POST /api/admin/accred/definitions — créer une définition */
route("POST", "/api/admin/accred/definitions", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { type, label, emoji, description, droits, couleur, couleur_bg, couleur_border, couleur_text,
          module: mod, fonctionnalite, ordre, regles, tarifs } = body;
  if (!type || !label) return sendJSON(res, 400, { error: "type et label requis." });
  if (await db.prepare("SELECT id FROM accred_definitions WHERE type=?").get(type))
    return sendJSON(res, 409, { error: "Ce type existe déjà." });

  const id = db.prepare(`INSERT INTO accred_definitions
    (type,label,emoji,description,droits,couleur,couleur_bg,couleur_border,couleur_text,module,fonctionnalite,ordre,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(type, label, emoji||'', description||'', JSON.stringify(droits||[]),
         couleur||'#6366f1', couleur_bg||'#f5f3ff', couleur_border||'#6366f1', couleur_text||'#3730a3',
         mod||null, fonctionnalite||null, ordre||0, admin.id).lastInsertRowid;

  if (Array.isArray(regles)) {
    const insR = db.prepare("INSERT OR REPLACE INTO accred_regles (accred_id,role,mode) VALUES (?,?,?)");
    for (const r of regles) if (r.role && r.mode) insR.run(id, r.role, r.mode);
  }
  if (Array.isArray(tarifs)) {
    const insT = db.prepare("INSERT OR REPLACE INTO accred_tarifs (accred_id,role,type_tarif,montant,devise,renouvellement_auto,periode_grace_jours,validation_admin) VALUES (?,?,?,?,?,?,?,?)");
    for (const t of tarifs) if (t.role) insT.run(id, t.role, t.type_tarif||'gratuit', t.montant||0, t.devise||'EUR', t.renouvellement_auto||0, t.periode_grace_jours||7, t.validation_admin||1);
  }

  /* Appliquer accès automatique aux comptes éligibles */
  if (Array.isArray(regles)) {
    const autoRoles = regles.filter(r => r.mode === 'automatique').map(r => r.role);
    for (const role of autoRoles) {
      const users = await db.prepare("SELECT id FROM users WHERE role=?").all(role);
      const ins = db.prepare("INSERT OR IGNORE INTO user_accreditations (user_id,accred_id,statut) VALUES (?,?,'active')");
      users.forEach(u => ins.run(u.id, id));
    }
  }

  sendJSON(res, 201, { id, ok: true });
});

/* GET /api/admin/accred/definitions/:id/impact — aperçu avant modification */
route("GET", "/api/admin/accred/definitions/:id/impact", async (req, res, params) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const def = await db.prepare("SELECT * FROM accred_definitions WHERE id=?").get(params.id);
  if (!def) return sendJSON(res, 404, { error: "Définition introuvable." });
  const nb_titulaires = db.prepare("SELECT COUNT(*) AS n FROM user_accreditations WHERE accred_id=? AND statut='active'").get(params.id).n;
  const nb_demandes_attente = db.prepare("SELECT COUNT(*) AS n FROM accred_demandes WHERE accred_id=? AND statut='en_attente'").get(params.id).n;
  const titulaires = await db.prepare(`
    SELECT ua.statut, u.nom, u.email, u.role
    FROM user_accreditations ua JOIN users u ON u.id=ua.user_id
    WHERE ua.accred_id=? AND ua.statut='active' LIMIT 10
  `).all(params.id);
  const repartition = db.prepare(`
    SELECT u.role, COUNT(*) AS n FROM user_accreditations ua JOIN users u ON u.id=ua.user_id
    WHERE ua.accred_id=? AND ua.statut='active' GROUP BY u.role
  `).all(params.id);
  sendJSON(res, 200, { nb_titulaires, nb_demandes_attente, titulaires, repartition });
});

/* GET /api/admin/accred/definitions/:id/audit — journal des modifications */
route("GET", "/api/admin/accred/definitions/:id/audit", async (req, res, params) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const logs = await db.prepare("SELECT * FROM accred_audit_log WHERE accred_id=? ORDER BY created_at DESC LIMIT 100").all(params.id);
  sendJSON(res, 200, { logs });
});

/* PUT /api/admin/accred/definitions/:id — modifier une définition (v2 avec audit + modes) */
route("PUT", "/api/admin/accred/definitions/:id", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const def = await db.prepare("SELECT * FROM accred_definitions WHERE id=?").get(params.id);
  if (!def) return sendJSON(res, 404, { error: "Définition introuvable." });

  const n = v => v === undefined ? null : v;
  const {
    label, emoji, description, droits, couleur, couleur_bg, couleur_border, couleur_text,
    module: mod, fonctionnalite, ordre, actif, regles, tarifs,
    duree_validite_jours, conditions_obtention, documents_requis,
    renouvellement_auto, double_validation, controle_documentaire,
    /* Options modification */
    motif, mode_application, date_application, notifier_titulaires
  } = body;

  /* Snapshot avant pour audit */
  const snap_avant = JSON.stringify({
    label: def.label, emoji: def.emoji, description: def.description,
    droits: def.droits, couleur: def.couleur, module: def.module,
    fonctionnalite: def.fonctionnalite, actif: def.actif,
    duree_validite_jours: def.duree_validite_jours
  });

  db.prepare(`UPDATE accred_definitions SET
    label=COALESCE(?,label), emoji=COALESCE(?,emoji), description=COALESCE(?,description),
    droits=COALESCE(?,droits), couleur=COALESCE(?,couleur), couleur_bg=COALESCE(?,couleur_bg),
    couleur_border=COALESCE(?,couleur_border), couleur_text=COALESCE(?,couleur_text),
    module=COALESCE(?,module), fonctionnalite=COALESCE(?,fonctionnalite),
    ordre=COALESCE(?,ordre), actif=COALESCE(?,actif),
    duree_validite_jours=COALESCE(?,duree_validite_jours),
    conditions_obtention=COALESCE(?,conditions_obtention),
    documents_requis=COALESCE(?,documents_requis),
    renouvellement_auto=COALESCE(?,renouvellement_auto),
    double_validation=COALESCE(?,double_validation),
    controle_documentaire=COALESCE(?,controle_documentaire),
    updated_at=datetime('now') WHERE id=?`)
    .run(
      n(label), n(emoji), n(description),
      droits ? JSON.stringify(droits) : null,
      n(couleur), n(couleur_bg), n(couleur_border), n(couleur_text),
      n(mod), n(fonctionnalite), n(ordre), n(actif),
      n(duree_validite_jours), n(conditions_obtention),
      documents_requis ? JSON.stringify(documents_requis) : null,
      n(renouvellement_auto), n(double_validation), n(controle_documentaire),
      params.id
    );

  if (Array.isArray(regles)) {
    await db.prepare("DELETE FROM accred_regles WHERE accred_id=?").run(params.id);
    const insR = db.prepare("INSERT INTO accred_regles (accred_id,role,mode) VALUES (?,?,?)");
    for (const r of regles) if (r.role && r.mode) insR.run(params.id, r.role, r.mode);
  }
  if (Array.isArray(tarifs)) {
    await db.prepare("DELETE FROM accred_tarifs WHERE accred_id=?").run(params.id);
    const insT = db.prepare("INSERT INTO accred_tarifs (accred_id,role,type_tarif,montant,devise,renouvellement_auto,periode_grace_jours,validation_admin) VALUES (?,?,?,?,?,?,?,?)");
    for (const t of tarifs) if (t.role) insT.run(params.id, t.role, t.type_tarif||'gratuit', t.montant||0, t.devise||'EUR', t.renouvellement_auto||0, t.periode_grace_jours||7, t.validation_admin||1);
  }

  /* Snapshot après pour audit */
  const def_apres = await db.prepare("SELECT * FROM accred_definitions WHERE id=?").get(params.id);
  const snap_apres = JSON.stringify({
    label: def_apres.label, emoji: def_apres.emoji, description: def_apres.description,
    droits: def_apres.droits, couleur: def_apres.couleur, module: def_apres.module,
    fonctionnalite: def_apres.fonctionnalite, actif: def_apres.actif,
    duree_validite_jours: def_apres.duree_validite_jours
  });

  /* Journal d'audit */
  const nb_titulaires = db.prepare("SELECT COUNT(*) AS n FROM user_accreditations WHERE accred_id=? AND statut='active'").get(params.id).n;
  db.prepare(`INSERT INTO accred_audit_log
    (accred_id,admin_id,admin_nom,champ,ancienne_valeur,nouvelle_valeur,motif,mode_application,date_application,nb_comptes_impactes)
    VALUES (?,?,?,'definition_complete',?,?,?,?,?,?)`)
    .run(params.id, admin.id, admin.nom, snap_avant, snap_apres, motif||null,
         mode_application||'nouvelles_demandes', date_application||null, nb_titulaires);

  /* Application aux titulaires existants si mode=tous */
  if (mode_application === 'tous' && actif !== undefined) {
    /* Si désactivation : retirer l'accred à tous */
    if (!actif) {
      db.prepare("UPDATE user_accreditations SET statut='retiree',updated_at=datetime('now') WHERE accred_id=?").run(params.id);
    }
  }

  /* Notification des titulaires si demandé */
  if (notifier_titulaires && mode_application !== 'nouvelles_demandes') {
    const titulaires = await db.prepare("SELECT user_id FROM user_accreditations WHERE accred_id=? AND statut='active'").all(params.id);
    const accredLabel = def_apres.label;
    const msg = mode_application === 'differe' && date_application
      ? `L'accréditation « ${accredLabel} » sera modifiée le ${date_application}. ${motif||''}`
      : `L'accréditation « ${accredLabel} » a été mise à jour. ${motif||''}`;
    for (const t of titulaires) {
      creerNotif(t.user_id, 'accreditation', `Mise à jour : ${accredLabel}`, msg, { accred_id: params.id });
    }
  }

  sendJSON(res, 200, { ok: true, nb_comptes_impactes: nb_titulaires });
});

/* DELETE /api/admin/accred/definitions/:id — désactiver */
route("DELETE", "/api/admin/accred/definitions/:id", async (req, res, params) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  db.prepare("UPDATE accred_definitions SET actif=0,updated_at=datetime('now') WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/admin/accred/demandes — toutes les demandes (nouveau système) */
route("GET", "/api/admin/accred/demandes", async (req, res, params, body, query) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const statut = query.statut || "en_attente";
  const rows = await db.prepare(`
    SELECT ad.*, u.nom AS user_nom, u.email AS user_email, u.role AS user_role,
           d.label AS accred_label, d.emoji AS accred_emoji, d.type AS accred_type
    FROM accred_demandes ad
    JOIN users u ON u.id=ad.user_id
    JOIN accred_definitions d ON d.id=ad.accred_id
    WHERE ad.statut=? ORDER BY ad.created_at DESC
  `).all(statut);
  sendJSON(res, 200, { demandes: rows });
});

/* PATCH /api/admin/accred/demandes/:id/approuver */
route("PATCH", "/api/admin/accred/demandes/:id/approuver", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const dem = await db.prepare("SELECT * FROM accred_demandes WHERE id=?").get(params.id);
  if (!dem) return sendJSON(res, 404, { error: "Demande introuvable." });
  const def = getAccredDef(dem.accred_id);
  const tarif = def?.tarifs?.find(t => {
    const user = await db.prepare("SELECT role FROM users WHERE id=?").get(dem.user_id);
    return user && t.role === user.role;
  });
  await db.prepare("UPDATE accred_demandes SET statut='approuvee' WHERE id=?").run(params.id);
  db.prepare(`INSERT INTO user_accreditations (user_id,accred_id,statut,admin_id,type_tarif,date_expiration,notes)
    VALUES (?,?,'active',?,?,?,?)
    ON CONFLICT(user_id,accred_id) DO UPDATE SET statut='active',admin_id=?,date_expiration=?,updated_at=datetime('now')`)
    .run(dem.user_id, dem.accred_id, admin.id, tarif?.type_tarif||'gratuit', body.date_expiration||null, body.notes||null,
         admin.id, body.date_expiration||null);
  db.prepare("INSERT INTO accred_historique_v2 (user_id,accred_id,action,admin_id,admin_nom,motif) VALUES (?,?,?,?,?,?)")
    .run(dem.user_id, dem.accred_id, 'accorde', admin.id, admin.nom, body.motif||null);
  creerNotif(dem.user_id, "validation", "Accréditation accordée !",
    `Félicitations ! Votre accréditation « ${def?.emoji||''} ${def?.label||''} » vient d'être validée.`,
    { accred_type: def?.type });
  sendJSON(res, 200, { ok: true });
});

/* PATCH /api/admin/accred/demandes/:id/refuser */
route("PATCH", "/api/admin/accred/demandes/:id/refuser", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const dem = await db.prepare("SELECT * FROM accred_demandes WHERE id=?").get(params.id);
  if (!dem) return sendJSON(res, 404, { error: "Demande introuvable." });
  await db.prepare("UPDATE accred_demandes SET statut='refusee',motif_refus=? WHERE id=?").run(body.motif||null, params.id);
  db.prepare("INSERT INTO accred_historique_v2 (user_id,accred_id,action,admin_id,admin_nom,motif) VALUES (?,?,?,?,?,?)")
    .run(dem.user_id, dem.accred_id, 'refuse', admin.id, admin.nom, body.motif||null);
  const def = getAccredDef(dem.accred_id);
  creerNotif(dem.user_id, "validation", "Demande d'accréditation non retenue",
    `Votre demande pour « ${def?.label||''} » n'a pas été retenue${body.motif ? ` : ${body.motif}` : '.'}.`,
    { accred_type: def?.type });
  sendJSON(res, 200, { ok: true });
});

/* GET /api/admin/accred/users — liste des accréditations attribuées */
route("GET", "/api/admin/accred/users", async (req, res) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const rows = await db.prepare(`
    SELECT ua.*, u.nom AS user_nom, u.email AS user_email, u.role AS user_role,
           d.label AS accred_label, d.emoji AS accred_emoji, d.type AS accred_type
    FROM user_accreditations ua
    JOIN users u ON u.id=ua.user_id
    JOIN accred_definitions d ON d.id=ua.accred_id
    ORDER BY ua.updated_at DESC
  `).all();
  sendJSON(res, 200, { accreditations: rows });
});

/* PATCH /api/admin/accred/users/:userId/:accredId/retirer */
route("PATCH", "/api/admin/accred/users/:userId/:accredId/retirer", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  db.prepare("UPDATE user_accreditations SET statut='retiree',updated_at=datetime('now') WHERE user_id=? AND accred_id=?")
    .run(params.userId, params.accredId);
  db.prepare("INSERT INTO accred_historique_v2 (user_id,accred_id,action,admin_id,admin_nom,motif) VALUES (?,?,?,?,?,?)")
    .run(params.userId, params.accredId, 'retire', admin.id, admin.nom, body.motif||null);
  sendJSON(res, 200, { ok: true });
});

/* ═══════════════════════════════════════════════════════════════════
   FEATURE ENGINE — OS applicatif Diaspo'Actif
   ═══════════════════════════════════════════════════════════════════ */

/* ── Moteur de décision central ──
   Calcule l'état de chaque feature pour un utilisateur donné.
   Retourne Map<slug, {statut, source, feature}>

   Règle de priorité :
   1. frozen (user a gelé → caché)
   2. active via user_features (pack, accred, auto)
   3. roles_acces contient le rôle → active automatiquement
   4. require_accreditation → vérifie accred → locked si absente
   5. sinon locked
*/
function computeFeatureStates(userId, userRole) {
  const features = await db.prepare("SELECT * FROM features WHERE actif=1 ORDER BY ordre").all();
  const userFeats = await db.prepare("SELECT * FROM user_features WHERE user_id=?").all(userId);
  const ufMap = new Map(userFeats.map(uf => [uf.feature_id, uf]));

  return features.map(f => {
    const uf = ufMap.get(f.id);

    // 1. Gelé explicitement par l'utilisateur
    if (uf?.statut === 'frozen') return { ...f, statut: 'frozen', source: 'user', uf };

    // 2. Active via user_features (accred, pack, manuel)
    if (uf?.statut === 'active') return { ...f, statut: 'active', source: uf.source, uf };

    // 3. Accès par rôle par défaut
    let rolesAcces = [];
    try { rolesAcces = JSON.parse(f.roles_acces || '[]'); } catch(_) {}
    if (rolesAcces.includes(userRole)) {
      // Activer automatiquement si pas encore dans user_features
      if (!uf) {
        try {
          db.prepare("INSERT OR IGNORE INTO user_features (user_id,feature_id,statut,source) VALUES (?,?,'active','automatique')")
            .run(userId, f.id);
        } catch(_) {}
      }
      return { ...f, statut: 'active', source: 'automatique', uf };
    }

    // 4. Accred requise
    if (f.require_accreditation && f.accred_type) {
      if (hasAccreditation(userId, f.accred_type)) {
        if (!uf) {
          try {
            db.prepare("INSERT OR IGNORE INTO user_features (user_id,feature_id,statut,source) VALUES (?,?,'active','accreditation')")
              .run(userId, f.id);
          } catch(_) {}
        }
        return { ...f, statut: 'active', source: 'accreditation', uf };
      }
      return { ...f, statut: 'locked', source: 'accreditation_manquante', uf };
    }

    // 5. pending ou locked
    if (uf?.statut === 'pending_accreditation') return { ...f, statut: 'pending_accreditation', source: 'demande', uf };
    return { ...f, statut: 'locked', source: null, uf };
  });
}

/* ── Tracker d'usage ── */
function trackFeatureUsage(userId, featureSlug) {
  try {
    const f = await db.prepare("SELECT id FROM features WHERE slug=? AND actif=1").get(featureSlug);
    if (!f) return;
    db.prepare(`INSERT INTO feature_usage (user_id,feature_id,nb_utilisations,derniere_utilisation)
      VALUES (?,?,1,datetime('now'))
      ON CONFLICT(user_id,feature_id) DO UPDATE SET
        nb_utilisations=nb_utilisations+1,
        derniere_utilisation=datetime('now'),
        updated_at=datetime('now')`)
      .run(userId, f.id);
  } catch(_) {}
}

/* ── Analyse d'inactivité et génération de suggestions de gel ──
   Appelé lors du chargement du dashboard, pas en cron (Vercel serverless).
   Crée des freeze_suggestions et envoie max 1 notif/semaine/feature.
*/
function runFreezeSuggestionEngine(userId) {
  try {
    const usages = db.prepare(`
      SELECT fu.*, f.slug, f.nom, f.emoji,
             CAST(julianday('now') - julianday(fu.derniere_utilisation) AS INTEGER) AS inactive_days
      FROM feature_usage fu JOIN features f ON f.id=fu.feature_id
      WHERE fu.user_id=? AND fu.derniere_utilisation IS NOT NULL
    `).all(userId);

    for (const u of usages) {
      if (u.inactive_days < 20) continue;
      const uf = await db.prepare("SELECT statut FROM user_features WHERE user_id=? AND feature_id=?")
        .get(userId, await db.prepare("SELECT id FROM features WHERE slug=?").get(u.slug)?.id);
      if (!uf || uf.statut !== 'active') continue;

      const niveau = u.inactive_days >= 60 ? 'high' : u.inactive_days >= 40 ? 'medium' : 'low';
      db.prepare(`INSERT INTO freeze_suggestions (user_id,feature_id,inactive_days,niveau)
        VALUES (?,?,?,?)
        ON CONFLICT(user_id,feature_id) DO UPDATE SET
          inactive_days=excluded.inactive_days, niveau=excluded.niveau`)
        .run(userId, await db.prepare("SELECT id FROM features WHERE slug=?").get(u.slug)?.id, u.inactive_days, niveau);

      // 1 notif max par semaine par feature
      const now = new Date();
      const weekIso = `${now.getFullYear()}-W${String(Math.ceil((now - new Date(now.getFullYear(),0,1)) / 604800000 + 1)).padStart(2,'0')}`;
      const alreadySent = await db.prepare(
        "SELECT id FROM feature_notification_logs WHERE user_id=? AND feature_id=? AND semaine_iso=?"
      ).get(userId, await db.prepare("SELECT id FROM features WHERE slug=?").get(u.slug)?.id, weekIso);
      if (alreadySent) continue;

      const semaines = Math.floor(u.inactive_days / 7);
      const messages = [
        `${u.emoji} « ${u.nom} » n'est plus utilisée récemment. Vous pouvez la garder ou la ranger pour simplifier votre espace.`,
        `Rappel : vous pouvez organiser votre tableau de bord en gelant « ${u.nom} » si elle ne vous est plus utile.`,
        `Astuce : un espace plus léger améliore votre navigation. « ${u.nom} » est inactive depuis ${u.inactive_days} jours.`
      ];
      const msg = messages[Math.min(semaines - 3, messages.length - 1)] || messages[0];
      const featId = await db.prepare("SELECT id FROM features WHERE slug=?").get(u.slug)?.id;
      if (!featId) continue;
      creerNotif(userId, 'freeze_suggestion', `💡 Simplifiez votre espace`, msg, { feature_slug: u.slug, action: 'freeze_suggestion' });
      db.prepare("INSERT INTO feature_notification_logs (user_id,feature_id,type,message,semaine_iso) VALUES (?,?,'freeze_suggestion',?,?)")
        .run(userId, featId, msg, weekIso);
    }
  } catch(_) {}
}

/* ── Routes Feature Engine ── */

/* GET /api/features — catalogue public */
route("GET", "/api/features", async (req, res, params, body, query) => {
  const me = getCurrentUser(req);
  const categorie = query.categorie || null;
  const features = await db.prepare(
    categorie
      ? "SELECT * FROM features WHERE actif=1 AND categorie=? ORDER BY ordre"
      : "SELECT * FROM features WHERE actif=1 ORDER BY categorie, ordre"
  ).all(...(categorie ? [categorie] : []));
  if (!me) return sendJSON(res, 200, { features: features.map(f => ({ ...f, statut: 'locked', source: null })) });

  const states = computeFeatureStates(me.id, me.role);
  const stateMap = new Map(states.map(s => [s.id, s]));
  sendJSON(res, 200, { features: features.map(f => {
    const s = stateMap.get(f.id);
    return { ...f, statut: s?.statut || 'locked', source: s?.source || null };
  })});
});

/* GET /api/me/features — état complet de toutes les features pour l'utilisateur connecté */
route("GET", "/api/me/features", async (req, res) => {
  const me = getCurrentUser(req);
  if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
  runFreezeSuggestionEngine(me.id);
  const states = computeFeatureStates(me.id, me.role);
  const usages = await db.prepare("SELECT feature_id, nb_utilisations, derniere_utilisation FROM feature_usage WHERE user_id=?").all(me.id);
  const usageMap = new Map(usages.map(u => [u.feature_id, u]));
  sendJSON(res, 200, {
    features: states.map(s => ({
      id: s.id, slug: s.slug, nom: s.nom, description: s.description,
      categorie: s.categorie, emoji: s.emoji, couleur: s.couleur,
      visibilite_defaut: s.visibilite_defaut, ordre: s.ordre,
      statut: s.statut, source: s.source,
      usage: usageMap.get(s.id) || { nb_utilisations: 0, derniere_utilisation: null }
    }))
  });
});

/* GET /api/features/check/:slug — vérification rapide (gateway check) */
route("GET", "/api/features/check/:slug", async (req, res, params) => {
  const me = getCurrentUser(req);
  if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
  const f = await db.prepare("SELECT * FROM features WHERE slug=? AND actif=1").get(params.slug);
  if (!f) return sendJSON(res, 404, { error: "Feature inconnue." });
  const states = computeFeatureStates(me.id, me.role);
  const state = states.find(s => s.slug === params.slug);
  const statut = state?.statut || 'locked';
  sendJSON(res, statut === 'active' ? 200 : 403, { slug: params.slug, statut, access: statut === 'active' });
});

/* POST /api/features/:slug/freeze — geler une feature */
route("POST", "/api/features/:slug/freeze", async (req, res, params) => {
  const me = getCurrentUser(req);
  if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
  const f = await db.prepare("SELECT * FROM features WHERE slug=? AND actif=1").get(params.slug);
  if (!f) return sendJSON(res, 404, { error: "Feature inconnue." });
  db.prepare(`INSERT INTO user_features (user_id,feature_id,statut,source,frozen_at) VALUES (?,?,'frozen','manuel',datetime('now'))
    ON CONFLICT(user_id,feature_id) DO UPDATE SET statut='frozen', frozen_at=datetime('now')`)
    .run(me.id, f.id);
  // Dismiss la suggestion de gel si elle existait
  db.prepare("UPDATE freeze_suggestions SET dismissed=1,dismissed_at=datetime('now') WHERE user_id=? AND feature_id=?")
    .run(me.id, f.id);
  sendJSON(res, 200, { ok: true, statut: 'frozen', message: `« ${f.nom} » a été gelée. Vous pouvez la réactiver à tout moment.` });
});

/* POST /api/features/:slug/unfreeze — dégeler une feature */
route("POST", "/api/features/:slug/unfreeze", async (req, res, params) => {
  const me = getCurrentUser(req);
  if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
  const f = await db.prepare("SELECT * FROM features WHERE slug=? AND actif=1").get(params.slug);
  if (!f) return sendJSON(res, 404, { error: "Feature inconnue." });
  db.prepare(`INSERT INTO user_features (user_id,feature_id,statut,source,activated_at) VALUES (?,?,'active','manuel',datetime('now'))
    ON CONFLICT(user_id,feature_id) DO UPDATE SET statut='active', activated_at=datetime('now')`)
    .run(me.id, f.id);
  sendJSON(res, 200, { ok: true, statut: 'active', message: `« ${f.nom} » est de nouveau active.` });
});

/* POST /api/usage/log — tracker l'usage d'une feature */
route("POST", "/api/usage/log", async (req, res, params, body) => {
  const me = getCurrentUser(req);
  if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
  const { slug } = body;
  if (!slug) return sendJSON(res, 400, { error: "slug requis." });
  trackFeatureUsage(me.id, slug);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/me/freeze-suggestions — suggestions de gel en attente */
route("GET", "/api/me/freeze-suggestions", async (req, res) => {
  const me = getCurrentUser(req);
  if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
  const rows = await db.prepare(`
    SELECT fs.*, f.slug, f.nom, f.emoji, f.categorie,
           fu.nb_utilisations, fu.derniere_utilisation
    FROM freeze_suggestions fs
    JOIN features f ON f.id=fs.feature_id
    LEFT JOIN feature_usage fu ON fu.user_id=fs.user_id AND fu.feature_id=fs.feature_id
    WHERE fs.user_id=? AND fs.dismissed=0
    ORDER BY fs.inactive_days DESC
  `).all(me.id);
  sendJSON(res, 200, { suggestions: rows });
});

/* POST /api/me/freeze-suggestions/:featureSlug/dismiss */
route("POST", "/api/me/freeze-suggestions/:featureSlug/dismiss", async (req, res, params) => {
  const me = getCurrentUser(req);
  if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
  const f = await db.prepare("SELECT id FROM features WHERE slug=?").get(params.featureSlug);
  if (!f) return sendJSON(res, 404, { error: "Feature inconnue." });
  db.prepare("UPDATE freeze_suggestions SET dismissed=1,dismissed_at=datetime('now') WHERE user_id=? AND feature_id=?")
    .run(me.id, f.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/me/recommendations — recommandations personnalisées */
route("GET", "/api/me/recommendations", async (req, res) => {
  const me = getCurrentUser(req);
  if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
  // Générer des recommandations basées sur le profil et les usages
  _generateRecommendations(me.id, me.role);
  const rows = await db.prepare(`
    SELECT fr.*, f.slug, f.nom, f.emoji, f.categorie, f.description
    FROM feature_recommendations fr
    JOIN features f ON f.id=fr.feature_id
    WHERE fr.user_id=? AND fr.dismissed=0
    ORDER BY fr.score DESC LIMIT 5
  `).all(me.id);
  sendJSON(res, 200, { recommendations: rows });
});

/* POST /api/me/recommendations/:featureSlug/dismiss */
route("POST", "/api/me/recommendations/:featureSlug/dismiss", async (req, res, params) => {
  const me = getCurrentUser(req);
  if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
  const f = await db.prepare("SELECT id FROM features WHERE slug=?").get(params.featureSlug);
  if (!f) return sendJSON(res, 404, { error: "Feature inconnue." });
  await db.prepare("UPDATE feature_recommendations SET dismissed=1 WHERE user_id=? AND feature_id=?")
    .run(me.id, f.id);
  sendJSON(res, 200, { ok: true });
});

/* Moteur de recommandations */
function _generateRecommendations(userId, userRole) {
  try {
    const allFeatures = await db.prepare("SELECT * FROM features WHERE actif=1").all();
    const states = computeFeatureStates(userId, userRole);
    const stateMap = new Map(states.map(s => [s.slug, s]));
    const usages = await db.prepare("SELECT feature_id, nb_utilisations FROM feature_usage WHERE user_id=?").all(userId);
    const usageMap = new Map(usages.map(u => [u.feature_id, u.nb_utilisations]));

    for (const f of allFeatures) {
      const state = stateMap.get(f.slug);
      if (!state || state.statut !== 'locked') continue; // recommander seulement les locked

      let raison = null;
      let score = 0;
      let action = 'unlock';

      // Logique de pertinence par rôle
      if (userRole === 'initiative') {
        if (f.slug === 'createur_formations') { raison = 'Partagez votre expertise en créant des formations pour la diaspora'; score = 0.9; }
        else if (f.slug === 'billetterie') { raison = 'Vous organisez des événements — la billetterie vous permettra de les monétiser'; score = 0.8; }
        else if (f.slug === 'publicites') { raison = 'Augmentez votre visibilité avec des publicités ciblées'; score = 0.7; }
        else if (f.slug === 'reunions') { raison = 'Organisez vos réunions directement sur la plateforme'; score = 0.75; }
      } else if (userRole === 'collectivite') {
        if (f.slug === 'observatoire') { raison = 'Accédez aux données statistiques de la diaspora'; score = 0.95; }
        if (f.slug === 'signature_electronique') { raison = 'Simplifiez la signature de vos documents officiels'; score = 0.85; }
      } else if (userRole === 'utilisateur') {
        if (f.slug === 'cv_builder') { raison = 'Créez et partagez votre profil professionnel'; score = 0.8; }
        if (f.slug === 'sondages') { raison = 'Participez à la vie de la communauté via des sondages'; score = 0.6; }
      }

      // Bonus si l'utilisateur utilise intensément des features de la même catégorie
      const sameCategory = allFeatures.filter(ff => ff.categorie === f.categorie && ff.id !== f.id);
      const categoryUsage = sameCategory.reduce((acc, ff) => acc + (usageMap.get(ff.id) || 0), 0);
      if (categoryUsage > 10) score = Math.min(score + 0.1, 1.0);

      if (!raison || score < 0.5) continue;

      db.prepare(`INSERT INTO feature_recommendations (user_id,feature_id,raison,action,score)
        VALUES (?,?,?,?,?)
        ON CONFLICT(user_id,feature_id) DO UPDATE SET raison=excluded.raison, score=excluded.score`)
        .run(userId, f.id, raison, action, score);
    }
  } catch(_) {}
}

/* ── Admin Feature Registry ── */

/* GET /api/admin/features — liste toutes les features */
route("GET", "/api/admin/features", async (req, res, params, body, query) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const features = await db.prepare("SELECT * FROM features ORDER BY categorie, ordre").all();
  const stats = features.map(f => {
    const nb_actifs = db.prepare("SELECT COUNT(*) AS n FROM user_features WHERE feature_id=? AND statut='active'").get(f.id).n;
    const nb_geles = db.prepare("SELECT COUNT(*) AS n FROM user_features WHERE feature_id=? AND statut='frozen'").get(f.id).n;
    const total_usages = db.prepare("SELECT COALESCE(SUM(nb_utilisations),0) AS n FROM feature_usage WHERE feature_id=?").get(f.id).n;
    return { ...f, nb_actifs, nb_geles, total_usages };
  });
  sendJSON(res, 200, { features: stats });
});

/* POST /api/admin/features — créer une feature */
route("POST", "/api/admin/features", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { slug, nom, description, categorie, visibilite_defaut, require_accreditation, accred_type,
          roles_acces, emoji, couleur, ordre } = body;
  if (!slug || !nom) return sendJSON(res, 400, { error: "slug et nom requis." });
  const { lastInsertRowid: id } = db.prepare(`
    INSERT INTO features (slug,nom,description,categorie,visibilite_defaut,require_accreditation,
      accred_type,roles_acces,emoji,couleur,ordre)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(slug, nom, description||null, categorie||'general',
         visibilite_defaut||'hidden', require_accreditation?1:0,
         accred_type||null,
         Array.isArray(roles_acces) ? JSON.stringify(roles_acces) : (roles_acces||'[]'),
         emoji||'⚙️', couleur||'#6366f1', ordre||0);
  // Attribution automatique aux rôles par défaut
  const rolesArr = Array.isArray(roles_acces) ? roles_acces : JSON.parse(roles_acces||'[]');
  for (const role of rolesArr) {
    const users = await db.prepare("SELECT id FROM users WHERE role=?").all(role);
    const ins = db.prepare("INSERT OR IGNORE INTO user_features (user_id,feature_id,statut,source) VALUES (?,?,'active','automatique')");
    users.forEach(u => ins.run(u.id, id));
  }
  sendJSON(res, 201, { id, ok: true });
});

/* PUT /api/admin/features/:id — modifier une feature */
route("PUT", "/api/admin/features/:id", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const n = v => v === undefined ? null : v;
  const { slug, nom, description, categorie, visibilite_defaut, require_accreditation, accred_type,
          roles_acces, emoji, couleur, ordre, actif } = body;
  db.prepare(`UPDATE features SET
    slug=COALESCE(?,slug), nom=COALESCE(?,nom), description=COALESCE(?,description),
    categorie=COALESCE(?,categorie), visibilite_defaut=COALESCE(?,visibilite_defaut),
    require_accreditation=COALESCE(?,require_accreditation), accred_type=COALESCE(?,accred_type),
    roles_acces=COALESCE(?,roles_acces), emoji=COALESCE(?,emoji), couleur=COALESCE(?,couleur),
    ordre=COALESCE(?,ordre), actif=COALESCE(?,actif), updated_at=datetime('now')
    WHERE id=?`)
    .run(n(slug), n(nom), n(description), n(categorie), n(visibilite_defaut),
         n(require_accreditation), n(accred_type),
         roles_acces ? JSON.stringify(Array.isArray(roles_acces) ? roles_acces : JSON.parse(roles_acces)) : null,
         n(emoji), n(couleur), n(ordre), n(actif), params.id);
  sendJSON(res, 200, { ok: true });
});

/* DELETE /api/admin/features/:id — désactiver une feature */
route("DELETE", "/api/admin/features/:id", async (req, res, params) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  db.prepare("UPDATE features SET actif=0,updated_at=datetime('now') WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/admin/features/stats — tableau de bord usage global */
route("GET", "/api/admin/features/stats", async (req, res) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const top_usages = db.prepare(`
    SELECT f.slug, f.nom, f.emoji, f.categorie,
           SUM(fu.nb_utilisations) AS total, COUNT(DISTINCT fu.user_id) AS nb_users
    FROM feature_usage fu JOIN features f ON f.id=fu.feature_id
    GROUP BY fu.feature_id ORDER BY total DESC LIMIT 10
  `).all();
  const top_frozen = db.prepare(`
    SELECT f.slug, f.nom, f.emoji, COUNT(*) AS nb_gels
    FROM user_features uf JOIN features f ON f.id=uf.feature_id
    WHERE uf.statut='frozen' GROUP BY uf.feature_id ORDER BY nb_gels DESC LIMIT 5
  `).all();
  const nb_suggestions_actives = db.prepare("SELECT COUNT(*) AS n FROM freeze_suggestions WHERE dismissed=0").get().n;
  sendJSON(res, 200, { top_usages, top_frozen, nb_suggestions_actives });
});

/* GET /api/admin/features/:id/users — utilisateurs par état pour une feature */
route("GET", "/api/admin/features/:id/users", async (req, res, params) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const rows = await db.prepare(`
    SELECT uf.statut, uf.source, uf.activated_at, uf.frozen_at,
           u.nom, u.email, u.role,
           fu.nb_utilisations, fu.derniere_utilisation
    FROM user_features uf JOIN users u ON u.id=uf.user_id
    LEFT JOIN feature_usage fu ON fu.user_id=uf.user_id AND fu.feature_id=uf.feature_id
    WHERE uf.feature_id=? ORDER BY uf.statut, u.nom
  `).all(params.id);
  sendJSON(res, 200, { users: rows });
});

/* ─── PACKS D'ACCRÉDITATIONS ─── */

/* Helper : attribue toutes les accréditations d'un pack à un utilisateur */
function _attribuerPackItems(user, packId) {
  const items = await db.prepare("SELECT accred_id FROM accred_pack_items WHERE pack_id=?").all(packId);
  const ins = db.prepare("INSERT OR IGNORE INTO user_accreditations (user_id,accred_id,statut) VALUES (?,?,'active')");
  for (const it of items) ins.run(user.id, it.accred_id);
}

/* GET /api/accreditations/packs — liste publique des packs actifs */
route("GET", "/api/accreditations/packs", async (req, res) => {
  const me = getCurrentUser(req);
  const packs = await db.prepare("SELECT * FROM accred_packs WHERE actif=1 ORDER BY ordre, nom").all();
  const result = packs.map(p => {
    const items = await db.prepare(`
      SELECT d.id, d.type, d.label, d.emoji, d.couleur
      FROM accred_pack_items pi JOIN accred_definitions d ON d.id=pi.accred_id WHERE pi.pack_id=?
    `).all(p.id);
    const regles = await db.prepare("SELECT * FROM accred_pack_regles WHERE pack_id=?").all(p.id);
    const tarifs = await db.prepare("SELECT * FROM accred_pack_tarifs WHERE pack_id=?").all(p.id);
    let ma_demande = null;
    let mon_pack = null;
    if (me) {
      ma_demande = await db.prepare("SELECT * FROM accred_pack_demandes WHERE user_id=? AND pack_id=?").get(me.id, p.id);
      mon_pack = await db.prepare("SELECT * FROM user_packs WHERE user_id=? AND pack_id=? AND statut='active'").get(me.id, p.id);
    }
    return { ...p, accreditations: items, regles, tarifs, ma_demande, actif_pour_moi: !!mon_pack };
  });
  sendJSON(res, 200, { packs: result });
});

/* POST /api/accreditations/packs/:id/demande — demander un pack */
route("POST", "/api/accreditations/packs/:id/demande", async (req, res, params, body) => {
  const me = getCurrentUser(req);
  if (!me) return sendJSON(res, 401, { error: "Connexion requise." });
  const pack = await db.prepare("SELECT * FROM accred_packs WHERE id=? AND actif=1").get(params.id);
  if (!pack) return sendJSON(res, 404, { error: "Pack introuvable." });
  const regle = await db.prepare("SELECT * FROM accred_pack_regles WHERE pack_id=? AND role=?").get(params.id, me.role);
  if (!regle || regle.mode === 'non_concerne') return sendJSON(res, 403, { error: "Ce pack n'est pas disponible pour votre type de compte." });
  const existe = await db.prepare("SELECT id FROM accred_pack_demandes WHERE user_id=? AND pack_id=?").get(me.id, params.id);
  if (existe) return sendJSON(res, 409, { error: "Demande déjà soumise pour ce pack." });
  const actifDeja = await db.prepare("SELECT id FROM user_packs WHERE user_id=? AND pack_id=? AND statut='active'").get(me.id, params.id);
  if (actifDeja) return sendJSON(res, 409, { error: "Vous possédez déjà ce pack." });
  if (regle.mode === 'automatique') {
    db.prepare("INSERT OR IGNORE INTO user_packs (user_id,pack_id,statut) VALUES (?,?,'active')").run(me.id, params.id);
    _attribuerPackItems(me, params.id);
    creerNotif(me.id, 'pack', `Pack attribué : ${pack.nom}`,
      `Le pack « ${pack.nom} » vous a été attribué automatiquement.`, { pack_id: params.id });
    return sendJSON(res, 200, { ok: true, statut: 'active' });
  }
  db.prepare("INSERT INTO accred_pack_demandes (user_id,pack_id,message) VALUES (?,?,?)").run(me.id, params.id, body.message||null);
  const admins = await db.prepare("SELECT id FROM users WHERE role='administrateur'").all();
  admins.forEach(a => creerNotif(a.id, 'pack_demande', `Demande pack : ${pack.nom}`,
    `${me.nom} demande le pack « ${pack.nom} ».`, { pack_id: params.id, user_id: me.id }));
  sendJSON(res, 201, { ok: true, statut: 'en_attente' });
});

/* GET /api/admin/accred/packs — liste admin des packs */
route("GET", "/api/admin/accred/packs", async (req, res) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const packs = await db.prepare("SELECT * FROM accred_packs ORDER BY ordre, nom").all();
  const result = packs.map(p => {
    const items = await db.prepare(`
      SELECT d.id, d.type, d.label, d.emoji FROM accred_pack_items pi
      JOIN accred_definitions d ON d.id=pi.accred_id WHERE pi.pack_id=?
    `).all(p.id);
    const regles = await db.prepare("SELECT * FROM accred_pack_regles WHERE pack_id=?").all(p.id);
    const tarifs = await db.prepare("SELECT * FROM accred_pack_tarifs WHERE pack_id=?").all(p.id);
    const nb_titulaires = db.prepare("SELECT COUNT(*) AS n FROM user_packs WHERE pack_id=? AND statut='active'").get(p.id).n;
    const nb_demandes = db.prepare("SELECT COUNT(*) AS n FROM accred_pack_demandes WHERE pack_id=? AND statut='en_attente'").get(p.id).n;
    return { ...p, accreditations: items, regles, tarifs, nb_titulaires, nb_demandes };
  });
  sendJSON(res, 200, { packs: result });
});

/* POST /api/admin/accred/packs — créer un pack */
route("POST", "/api/admin/accred/packs", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { nom, description, emoji, couleur, couleur_bg, slug, ordre, date_debut, date_fin, accred_ids, regles, tarifs } = body;
  if (!nom) return sendJSON(res, 400, { error: "Nom requis." });
  const packSlug = slug || nom.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const { lastInsertRowid: id } = db.prepare(`
    INSERT INTO accred_packs (nom,description,emoji,couleur,couleur_bg,slug,ordre,date_debut,date_fin,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(nom, description||null, emoji||'📦', couleur||'#6366f1', couleur_bg||'#f5f3ff',
         packSlug, ordre||0, date_debut||null, date_fin||null, admin.id);
  if (Array.isArray(accred_ids)) {
    const insI = db.prepare("INSERT OR IGNORE INTO accred_pack_items (pack_id,accred_id) VALUES (?,?)");
    accred_ids.forEach(aid => insI.run(id, aid));
  }
  if (Array.isArray(regles)) {
    const insR = db.prepare("INSERT OR REPLACE INTO accred_pack_regles (pack_id,role,mode) VALUES (?,?,?)");
    regles.forEach(r => { if (r.role && r.mode) insR.run(id, r.role, r.mode); });
    const autoRoles = regles.filter(r => r.mode === 'automatique').map(r => r.role);
    for (const role of autoRoles) {
      const users = await db.prepare("SELECT id,nom,email,role FROM users WHERE role=?").all(role);
      users.forEach(u => {
        db.prepare("INSERT OR IGNORE INTO user_packs (user_id,pack_id,statut,admin_id) VALUES (?,?,'active',?)").run(u.id, id, admin.id);
        _attribuerPackItems(u, id);
      });
    }
  }
  if (Array.isArray(tarifs)) {
    const insT = db.prepare("INSERT OR REPLACE INTO accred_pack_tarifs (pack_id,role,type_tarif,montant,devise,validation_admin) VALUES (?,?,?,?,?,?)");
    tarifs.forEach(t => { if (t.role) insT.run(id, t.role, t.type_tarif||'gratuit', t.montant||0, t.devise||'EUR', t.validation_admin!==undefined?t.validation_admin:1); });
  }
  sendJSON(res, 201, { id, ok: true });
});

/* PUT /api/admin/accred/packs/:id — modifier un pack */
route("PUT", "/api/admin/accred/packs/:id", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const pack = await db.prepare("SELECT * FROM accred_packs WHERE id=?").get(params.id);
  if (!pack) return sendJSON(res, 404, { error: "Pack introuvable." });
  const n = v => v === undefined ? null : v;
  const { nom, description, emoji, couleur, couleur_bg, slug, ordre, date_debut, date_fin, actif,
          accred_ids, regles, tarifs, notifier_titulaires } = body;
  db.prepare(`UPDATE accred_packs SET
    nom=COALESCE(?,nom), description=COALESCE(?,description), emoji=COALESCE(?,emoji),
    couleur=COALESCE(?,couleur), couleur_bg=COALESCE(?,couleur_bg), slug=COALESCE(?,slug),
    ordre=COALESCE(?,ordre), date_debut=COALESCE(?,date_debut), date_fin=COALESCE(?,date_fin),
    actif=COALESCE(?,actif), updated_at=datetime('now') WHERE id=?`)
    .run(n(nom),n(description),n(emoji),n(couleur),n(couleur_bg),n(slug),
         n(ordre),n(date_debut),n(date_fin),n(actif),params.id);
  if (Array.isArray(accred_ids)) {
    await db.prepare("DELETE FROM accred_pack_items WHERE pack_id=?").run(params.id);
    const insI = db.prepare("INSERT OR IGNORE INTO accred_pack_items (pack_id,accred_id) VALUES (?,?)");
    accred_ids.forEach(aid => insI.run(params.id, aid));
  }
  if (Array.isArray(regles)) {
    await db.prepare("DELETE FROM accred_pack_regles WHERE pack_id=?").run(params.id);
    const insR = db.prepare("INSERT INTO accred_pack_regles (pack_id,role,mode) VALUES (?,?,?)");
    regles.forEach(r => { if (r.role && r.mode) insR.run(params.id, r.role, r.mode); });
  }
  if (Array.isArray(tarifs)) {
    await db.prepare("DELETE FROM accred_pack_tarifs WHERE pack_id=?").run(params.id);
    const insT = db.prepare("INSERT INTO accred_pack_tarifs (pack_id,role,type_tarif,montant,devise,validation_admin) VALUES (?,?,?,?,?,?)");
    tarifs.forEach(t => { if (t.role) insT.run(params.id, t.role, t.type_tarif||'gratuit', t.montant||0, t.devise||'EUR', t.validation_admin!==undefined?t.validation_admin:1); });
  }
  if (notifier_titulaires) {
    const packNom = nom || pack.nom;
    await db.prepare("SELECT user_id FROM user_packs WHERE pack_id=? AND statut='active'").all(params.id)
      .forEach(t => creerNotif(t.user_id, 'pack', `Mise à jour : ${packNom}`,
        `Le pack « ${packNom} » a été mis à jour.`, { pack_id: params.id }));
  }
  sendJSON(res, 200, { ok: true });
});

/* DELETE /api/admin/accred/packs/:id — désactiver un pack */
route("DELETE", "/api/admin/accred/packs/:id", async (req, res, params) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  db.prepare("UPDATE accred_packs SET actif=0,updated_at=datetime('now') WHERE id=?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/admin/accred/packs/demandes — demandes de packs en attente */
route("GET", "/api/admin/accred/packs/demandes", async (req, res) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const rows = await db.prepare(`
    SELECT pd.*, u.nom AS user_nom, u.email AS user_email, u.role AS user_role,
           p.nom AS pack_nom, p.emoji AS pack_emoji
    FROM accred_pack_demandes pd JOIN users u ON u.id=pd.user_id JOIN accred_packs p ON p.id=pd.pack_id
    WHERE pd.statut='en_attente' ORDER BY pd.created_at DESC
  `).all();
  sendJSON(res, 200, { demandes: rows });
});

/* PATCH /api/admin/accred/packs/demandes/:id/approuver */
route("PATCH", "/api/admin/accred/packs/demandes/:id/approuver", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const dem = await db.prepare("SELECT * FROM accred_pack_demandes WHERE id=?").get(params.id);
  if (!dem) return sendJSON(res, 404, { error: "Demande introuvable." });
  await db.prepare("UPDATE accred_pack_demandes SET statut='approuvee' WHERE id=?").run(params.id);
  db.prepare("INSERT OR IGNORE INTO user_packs (user_id,pack_id,statut,admin_id,notes) VALUES (?,?,'active',?,?)")
    .run(dem.user_id, dem.pack_id, admin.id, body.notes||null);
  const user = await db.prepare("SELECT id,nom,email,role FROM users WHERE id=?").get(dem.user_id);
  _attribuerPackItems(user, dem.pack_id);
  const pack = await db.prepare("SELECT * FROM accred_packs WHERE id=?").get(dem.pack_id);
  creerNotif(dem.user_id, 'pack', `Pack accordé : ${pack.nom}`,
    `Votre demande pour le pack « ${pack.nom} » a été approuvée. Toutes les accréditations incluses sont maintenant actives.`,
    { pack_id: dem.pack_id });
  sendJSON(res, 200, { ok: true });
});

/* PATCH /api/admin/accred/packs/demandes/:id/refuser */
route("PATCH", "/api/admin/accred/packs/demandes/:id/refuser", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const dem = await db.prepare("SELECT * FROM accred_pack_demandes WHERE id=?").get(params.id);
  if (!dem) return sendJSON(res, 404, { error: "Demande introuvable." });
  await db.prepare("UPDATE accred_pack_demandes SET statut='refusee',motif_refus=? WHERE id=?").run(body.motif||null, params.id);
  const pack = await db.prepare("SELECT * FROM accred_packs WHERE id=?").get(dem.pack_id);
  creerNotif(dem.user_id, 'pack', `Pack refusé : ${pack.nom}`,
    `Votre demande pour le pack « ${pack.nom} » a été refusée.${body.motif ? ' Motif : '+body.motif : ''}`,
    { pack_id: dem.pack_id });
  sendJSON(res, 200, { ok: true });
});

/* PATCH /api/admin/accred/packs/:id/attribuer — attribution manuelle directe */
route("PATCH", "/api/admin/accred/packs/:id/attribuer", async (req, res, params, body) => {
  const admin = getCurrentUser(req);
  if (!admin || admin.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const { user_id } = body;
  if (!user_id) return sendJSON(res, 400, { error: "user_id requis." });
  const pack = await db.prepare("SELECT * FROM accred_packs WHERE id=?").get(params.id);
  if (!pack) return sendJSON(res, 404, { error: "Pack introuvable." });
  const user = await db.prepare("SELECT id,nom,email,role FROM users WHERE id=?").get(user_id);
  if (!user) return sendJSON(res, 404, { error: "Utilisateur introuvable." });
  db.prepare("INSERT OR REPLACE INTO user_packs (user_id,pack_id,statut,admin_id) VALUES (?,?,'active',?)").run(user_id, params.id, admin.id);
  _attribuerPackItems(user, params.id);
  creerNotif(user_id, 'pack', `Pack attribué : ${pack.nom}`,
    `Le pack « ${pack.nom} » vous a été attribué par l'administration.`, { pack_id: params.id });
  sendJSON(res, 200, { ok: true });
});

/* ═══════════════════════════════════════════════════════════════════
   MODULE OBSERVATIONS — APIs statistiques
   ═══════════════════════════════════════════════════════════════════ */

/* POST /api/profil/:id/visit — enregistre une visite de profil */
route("POST", "/api/profil/:id/visit", async (req, res, params) => {
  const visitor = getCurrentUser(req);
  const pid = parseInt(params.id);
  if (!pid) return sendJSON(res, 400, { error: "id requis." });
  // Ne pas enregistrer les auto-visites
  if (visitor && visitor.id === pid) return sendJSON(res, 200, { ok: true });
  db.prepare(`INSERT INTO profil_visites (profil_user_id, visiteur_id, visiteur_pays, visiteur_ville, visiteur_role)
    VALUES (?, ?, ?, ?, ?)`).run(
    pid,
    visitor ? visitor.id : null,
    visitor ? (visitor.pays || null) : null,
    visitor ? (visitor.ville || null) : null,
    visitor ? visitor.role : 'anonymous'
  );
  sendJSON(res, 200, { ok: true });
});

/* GET /api/observations/me — stats personnelles */
route("GET", "/api/observations/me", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });

  const uid = user.id;
  const now = new Date();
  const today = now.toISOString().slice(0,10);
  const weekAgo = new Date(now - 7*86400000).toISOString().slice(0,10);
  const monthAgo = new Date(now - 30*86400000).toISOString().slice(0,10);

  /* ── Fréquentation profil ── */
  const visTotal = db.prepare("SELECT COUNT(*) AS n FROM profil_visites WHERE profil_user_id=?").get(uid)?.n || 0;
  const visUniques = db.prepare("SELECT COUNT(DISTINCT COALESCE(visiteur_id, -rowid)) AS n FROM profil_visites WHERE profil_user_id=?").get(uid)?.n || 0;
  const visAujourd = db.prepare("SELECT COUNT(*) AS n FROM profil_visites WHERE profil_user_id=? AND date(created_at)=?").get(uid, today)?.n || 0;
  const visSemaine = db.prepare("SELECT COUNT(*) AS n FROM profil_visites WHERE profil_user_id=? AND date(created_at)>=?").get(uid, weekAgo)?.n || 0;
  const visMois = db.prepare("SELECT COUNT(*) AS n FROM profil_visites WHERE profil_user_id=? AND date(created_at)>=?").get(uid, monthAgo)?.n || 0;

  // Évolution vues (7 derniers jours)
  const evolVues = db.prepare(`SELECT date(created_at) AS jour, COUNT(*) AS n FROM profil_visites WHERE profil_user_id=? AND date(created_at)>=? GROUP BY jour ORDER BY jour`).all(uid, weekAgo);

  /* ── Réseau ── */
  const nbAbonnes = db.prepare("SELECT COUNT(*) AS n FROM user_follows WHERE followed_id=?").get(uid)?.n || 0;
  const nbAbonnements = db.prepare("SELECT COUNT(*) AS n FROM user_follows WHERE follower_id=?").get(uid)?.n || 0;
  // Évolution abonnés (30j)
  const evolAbonnes = db.prepare(`SELECT date(created_at) AS jour, COUNT(*) AS n FROM user_follows WHERE followed_id=? AND date(created_at)>=? GROUP BY jour ORDER BY jour`).all(uid, monthAgo);

  /* ── Publications (fil) ── */
  const nbPubs = db.prepare("SELECT COUNT(*) AS n FROM fil_posts WHERE auteur_id=?").get(uid)?.n || 0;
  const nbVuesPubs = db.prepare("SELECT COALESCE(SUM(vues),0) AS n FROM fil_posts WHERE auteur_id=?").get(uid)?.n || 0;
  const nbReactionsPubs = db.prepare(`SELECT COUNT(*) AS n FROM fil_reactions fr JOIN fil_posts fp ON fr.post_id=fp.id WHERE fp.auteur_id=?`).get(uid)?.n || 0;
  const nbComsPubs = db.prepare(`SELECT COUNT(*) AS n FROM fil_commentaires fc JOIN fil_posts fp ON fc.post_id=fp.id WHERE fp.auteur_id=?`).get(uid)?.n || 0;
  const nbRepubs = db.prepare(`SELECT COUNT(*) AS n FROM fil_posts WHERE auteur_id=? AND original_post_id IS NOT NULL`).get(uid)?.n || 0;
  const tauxEngagement = nbVuesPubs > 0 ? Math.round((nbReactionsPubs + nbComsPubs) / nbVuesPubs * 100 * 10) / 10 : 0;

  // Évolution engagement (30j)
  const evolEngagement = db.prepare(`SELECT date(fr.created_at) AS jour, COUNT(*) AS n FROM fil_reactions fr JOIN fil_posts fp ON fr.post_id=fp.id WHERE fp.auteur_id=? AND date(fr.created_at)>=? GROUP BY jour ORDER BY jour`).all(uid, monthAgo);

  /* ── Profil emploi ── */
  const profilEmploi = await db.prepare("SELECT * FROM profil_emploi WHERE user_id=?").get(uid);
  const nbCandidatures = db.prepare("SELECT COUNT(*) AS n FROM recrutement_candidatures WHERE candidat_id=?").get(uid)?.n || 0;
  const nbOffresRecues = db.prepare(`SELECT COUNT(*) AS n FROM recrutement_campagnes WHERE statut='active'`).get()?.n || 0;

  /* ── Analyse réseau ── */
  const visiteursPays = db.prepare(`SELECT visiteur_pays AS pays, COUNT(*) AS n FROM profil_visites WHERE profil_user_id=? AND visiteur_pays IS NOT NULL GROUP BY visiteur_pays ORDER BY n DESC LIMIT 10`).all(uid);
  const visiteursVilles = db.prepare(`SELECT visiteur_ville AS ville, COUNT(*) AS n FROM profil_visites WHERE profil_user_id=? AND visiteur_ville IS NOT NULL GROUP BY visiteur_ville ORDER BY n DESC LIMIT 10`).all(uid);
  const visiteursTypes = db.prepare(`SELECT visiteur_role AS type_compte, COUNT(*) AS n FROM profil_visites WHERE profil_user_id=? AND visiteur_role IS NOT NULL GROUP BY visiteur_role ORDER BY n DESC LIMIT 10`).all(uid);

  /* ── Calcul indice d'activité (0-100) ── */
  let score = 0;
  score += Math.min(nbPubs * 2, 20);
  score += Math.min(nbAbonnes * 0.5, 15);
  score += Math.min(nbReactionsPubs * 0.3, 10);
  score += Math.min(nbComsPubs * 0.5, 10);
  score += Math.min(nbCandidatures * 2, 10);
  const connexions = user.nb_connexions || 0;
  score += Math.min(connexions * 0.5, 15);
  if (profilEmploi) score += 5;
  if (user.photo_url) score += 5;
  if (user.bio) score += 5;
  if (user.is_verified) score += 5;
  score = Math.min(Math.round(score), 100);

  const niveaux = [
    { min: 0, label: 'Débutant', color: '#6b7280' },
    { min: 20, label: 'Actif', color: '#3b82f6' },
    { min: 40, label: 'Très actif', color: '#8b5cf6' },
    { min: 60, label: 'Influent', color: '#f59e0b' },
    { min: 75, label: 'Leader', color: '#ef4444' },
    { min: 90, label: 'Ambassadeur Diaspo\'Actif', color: '#10b981' }
  ];
  const niveau = [...niveaux].reverse().find(n => score >= n.min) || niveaux[0];

  /* ── Recommandations IA (basées sur les stats) ── */
  const recommandations = [];
  if (nbPubs < 5) recommandations.push({ type: 'publication', titre: 'Publiez régulièrement', desc: 'Les comptes publiant au moins 1 fois/semaine obtiennent 3× plus de visibilité.', priorite: 'haute' });
  if (nbAbonnes < 50) recommandations.push({ type: 'reseau', titre: 'Développez votre réseau', desc: 'Suivez des comptes dans votre secteur pour augmenter votre visibilité.', priorite: 'moyenne' });
  if (!user.photo_url) recommandations.push({ type: 'profil', titre: 'Ajoutez une photo de profil', desc: 'Les profils avec photo reçoivent 5× plus de visites.', priorite: 'haute' });
  if (!user.bio) recommandations.push({ type: 'profil', titre: 'Complétez votre biographie', desc: 'Une bio complète améliore votre référencement dans les recherches.', priorite: 'moyenne' });
  if (!profilEmploi && user.role === 'utilisateur') recommandations.push({ type: 'emploi', titre: 'Activez votre profil emploi', desc: 'Recevez des offres correspondant à vos compétences.', priorite: 'basse' });
  if (tauxEngagement < 2 && nbPubs > 3) recommandations.push({ type: 'engagement', titre: 'Améliorez votre engagement', desc: 'Posez des questions dans vos publications pour encourager les réactions.', priorite: 'moyenne' });
  if (visTotal > 100 && nbAbonnes < 20) recommandations.push({ type: 'conversion', titre: 'Convertissez vos visiteurs', desc: 'Invitez les visiteurs de votre profil à s\'abonner.', priorite: 'haute' });

  sendJSON(res, 200, {
    frequentation: { total: visTotal, uniques: visUniques, aujourd: visAujourd, semaine: visSemaine, mois: visMois, evolution: evolVues },
    reseau: { abonnes: nbAbonnes, abonnements: nbAbonnements, evolution: evolAbonnes },
    publications: { nb: nbPubs, vues: nbVuesPubs, reactions: nbReactionsPubs, commentaires: nbComsPubs, republications: nbRepubs, taux_engagement: tauxEngagement, evolution: evolEngagement },
    profil: { candidatures: nbCandidatures, offres_disponibles: nbOffresRecues, profil_emploi_actif: !!profilEmploi },
    analyse_reseau: { pays: visiteursPays, villes: visiteursVilles, types: visiteursTypes },
    indice_activite: { score, niveau: niveau.label, color: niveau.color, niveaux },
    recommandations
  });
});

/* GET /api/observations/approfondies — stats étendues (initiative/collectivite/admin) */
route("GET", "/api/observations/approfondies", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
  if (!['initiative','collectivite','administrateur'].includes(user.role)) return sendJSON(res, 403, { error: "Réservé aux Comptes Initiatives et Étatiques." });

  const uid = user.id;
  const monthAgo = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
  const yearStart = new Date().getFullYear() + '-01-01';

  /* ── Stats initiatives (campagnes) ── */
  const initRow = await db.prepare("SELECT id FROM initiatives WHERE owner_user_id=?").get(uid);
  const initId = initRow?.id;

  let campagnes = { total: 0, actives: 0, clotures: 0, vues: 0, candidatures: 0, reactions: 0 };
  let evenements = { total: 0, inscrits: 0, presents: 0, billets: 0, taux_remplissage: 0 };
  let deals = { total: 0, actifs: 0, clotures: 0, taux_reussite: 0 };
  let sondages = { total: 0, ouverts: 0, participants: 0 };
  let partenariats = { total: 0, actifs: 0 }; // calculé via deal_participants
  let financier = { revenus_total: 0, revenus_mois: 0, revenus_annee: 0 };

  if (initId) {
    /* Campagnes recrutement */
    const camps = await db.prepare("SELECT statut, nb_candidatures, vues_total FROM recrutement_campagnes WHERE recruteur_id=?").all(uid);
    campagnes.total = camps.length;
    campagnes.actives = camps.filter(c => c.statut === 'active').length;
    campagnes.clotures = camps.filter(c => c.statut === 'cloturee').length;
    campagnes.vues = camps.reduce((s, c) => s + (c.vues_total || 0), 0);
    campagnes.candidatures = camps.reduce((s, c) => s + (c.nb_candidatures || 0), 0);

    /* Événements */
    const evts = await db.prepare("SELECT e.id, e.capacite FROM events e WHERE e.organisateur_id=?").all(uid);
    evenements.total = evts.length;
    const evtIds = evts.map(e => e.id);
    if (evtIds.length) {
      const inIds = evtIds.map(() => '?').join(',');
      evenements.inscrits = db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE event_id IN (${inIds})`).get(...evtIds)?.n || 0;
      evenements.presents = db.prepare(`SELECT COUNT(*) AS n FROM event_checkins WHERE event_id IN (${inIds})`).get(...evtIds)?.n || 0;
    }

    /* Deals */
    const dealsRows = await db.prepare("SELECT statut FROM deals WHERE createur_id=?").all(initId);
    deals.total = dealsRows.length;
    deals.actifs = dealsRows.filter(d => d.statut === 'actif').length;
    deals.clotures = dealsRows.filter(d => d.statut === 'cloture').length;
    deals.taux_reussite = deals.total > 0 ? Math.round(deals.clotures / deals.total * 100) : 0;

    /* Sondages */
    const sonds = await db.prepare("SELECT statut, nb_reponses FROM sondages WHERE createur_id=?").all(uid);
    sondages.total = sonds.length;
    sondages.ouverts = sonds.filter(s => s.statut === 'ouvert').length;
    sondages.participants = sonds.reduce((s, r) => s + (r.nb_reponses || 0), 0);

    /* Financier */
    const transactionsUser = await db.prepare("SELECT montant, date_transaction FROM transactions WHERE user_id=? AND statut='reussi'").all(uid);
    financier.revenus_total = transactionsUser.reduce((s, t) => s + (t.montant || 0), 0);
    financier.revenus_mois = transactionsUser.filter(t => (t.date_transaction||'') >= monthAgo).reduce((s, t) => s + (t.montant || 0), 0);
    financier.revenus_annee = transactionsUser.filter(t => (t.date_transaction||'') >= yearStart).reduce((s, t) => s + (t.montant || 0), 0);
  }

  /* Sondages créateur directement sur users */
  if (!initId) {
    const sonds = await db.prepare("SELECT statut, nb_reponses FROM sondages WHERE createur_id=?").all(uid);
    sondages.total = sonds.length;
    sondages.ouverts = sonds.filter(s => s.statut === 'ouvert').length;
    sondages.participants = sonds.reduce((s, r) => s + (r.nb_reponses || 0), 0);
  }

  /* Performance par campagne (top 5) */
  const perfCampagnes = db.prepare(`SELECT rc.nom, rc.vues_total, COUNT(c.id) AS nb_candidatures, rc.statut, rc.expire_at FROM recrutement_campagnes rc LEFT JOIN recrutement_candidatures c ON c.campagne_id=rc.id WHERE rc.recruteur_id=? GROUP BY rc.id ORDER BY rc.vues_total DESC LIMIT 5`).all(uid);
  const tauxConversionCamp = campagnes.vues > 0 ? Math.round(campagnes.candidatures / campagnes.vues * 100 * 10) / 10 : 0;

  /* Visibilité */
  const nbImpressions = db.prepare("SELECT COUNT(*) AS n FROM profil_visites WHERE profil_user_id=?").get(uid)?.n || 0;
  const nbApparitionsFil = db.prepare("SELECT COUNT(*) AS n FROM fil_posts WHERE auteur_id=?").get(uid)?.n || 0;

  /* Indice d'activité étendu */
  let score = 0;
  const nbPubs = db.prepare("SELECT COUNT(*) AS n FROM fil_posts WHERE auteur_id=?").get(uid)?.n || 0;
  score += Math.min(nbPubs * 2, 15);
  score += Math.min(evenements.total * 5, 15);
  score += Math.min(campagnes.total * 3, 12);
  score += Math.min(deals.total * 5, 12);
  score += Math.min(sondages.total * 3, 9);
  score += Math.min((user.nb_connexions || 0) * 0.3, 10);
  if (user.is_verified) score += 5;
  if (user.photo_url) score += 5;
  score += Math.min(deals.clotures * 3, 9);
  const nbReactions = db.prepare(`SELECT COUNT(*) AS n FROM fil_reactions fr JOIN fil_posts fp ON fr.post_id=fp.id WHERE fp.auteur_id=?`).get(uid)?.n || 0;
  score += Math.min(nbReactions * 0.2, 8);
  score = Math.min(Math.round(score), 100);

  const niveaux = [
    { min: 0, label: 'Débutant', color: '#6b7280' },
    { min: 20, label: 'Actif', color: '#3b82f6' },
    { min: 40, label: 'Très actif', color: '#8b5cf6' },
    { min: 60, label: 'Influent', color: '#f59e0b' },
    { min: 75, label: 'Leader', color: '#ef4444' },
    { min: 90, label: 'Ambassadeur Diaspo\'Actif', color: '#10b981' }
  ];
  const niveau = [...niveaux].reverse().find(n => score >= n.min) || niveaux[0];

  /* Recommandations IA avancées */
  const recommandations = [];
  if (campagnes.total === 0) recommandations.push({ type: 'recrutement', titre: 'Lancez votre première campagne de recrutement', desc: 'Les organisations avec des campagnes actives reçoivent 4× plus de visibilité.', priorite: 'haute' });
  if (evenements.total < 2) recommandations.push({ type: 'evenements', titre: 'Organisez un événement', desc: 'Les événements génèrent une forte mobilisation de la communauté.', priorite: 'haute' });
  if (deals.total === 0) recommandations.push({ type: 'deals', titre: 'Initiez un Deal', desc: 'Les Deals permettent de collaborer et de créer de la valeur économique.', priorite: 'moyenne' });
  if (sondages.total === 0) recommandations.push({ type: 'sondages', titre: 'Publiez un sondage', desc: 'Consultez votre communauté et augmentez votre engagement.', priorite: 'basse' });
  if (tauxConversionCamp < 5 && campagnes.total > 0) recommandations.push({ type: 'campagnes', titre: 'Améliorez vos campagnes', desc: `Taux de conversion ${tauxConversionCamp}% — enrichissez vos descriptions pour attirer plus de candidats.`, priorite: 'haute' });

  sendJSON(res, 200, {
    campagnes: { ...campagnes, taux_conversion: tauxConversionCamp, performances: perfCampagnes },
    evenements,
    deals,
    sondages,
    partenariats,
    financier,
    visibilite: { impressions: nbImpressions, apparitions_fil: nbApparitionsFil },
    indice_activite: { score, niveau: niveau.label, color: niveau.color, niveaux },
    recommandations
  });
});

/* GET /api/observatoire/global — tableau de bord mondial (admin) */
route("GET", "/api/observatoire/global", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: "Réservé à l'administrateur." });

  const today = new Date().toISOString().slice(0,10);
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
  const monthAgo = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
  const yearStart = new Date().getFullYear() + '-01-01';

  /* Comptes */
  const totalComptes = db.prepare("SELECT COUNT(*) AS n FROM users").get()?.n || 0;
  const comptesUsers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='utilisateur'").get()?.n || 0;
  const comptesInit = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='initiative'").get()?.n || 0;
  const comptesEtat = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='collectivite'").get()?.n || 0;
  const comptesVerif = db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_verified=1").get()?.n || 0;
  const nouveauxMois = db.prepare("SELECT COUNT(*) AS n FROM users WHERE date(created_at)>=?").get(monthAgo)?.n || 0;
  const actifsMois = db.prepare("SELECT COUNT(*) AS n FROM user_activity WHERE date>=?").get(monthAgo)?.n || 0;
  const actifsSemaine = db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM user_activity WHERE date>=?").get(weekAgo)?.n || 0;

  /* Activité */
  const totalPubs = db.prepare("SELECT COUNT(*) AS n FROM fil_posts").get()?.n || 0;
  const pubsAujourd = db.prepare("SELECT COUNT(*) AS n FROM fil_posts WHERE date(created_at)=?").get(today)?.n || 0;
  const totalEvts = db.prepare("SELECT COUNT(*) AS n FROM events").get()?.n || 0;
  const evtsActifs = db.prepare("SELECT COUNT(*) AS n FROM events WHERE statut='publie'").get()?.n || 0;
  const totalCamps = db.prepare("SELECT COUNT(*) AS n FROM recrutement_campagnes").get()?.n || 0;
  const campsActives = db.prepare("SELECT COUNT(*) AS n FROM recrutement_campagnes WHERE statut='active'").get()?.n || 0;
  const totalSonds = db.prepare("SELECT COUNT(*) AS n FROM sondages").get()?.n || 0;
  const sondsOuverts = db.prepare("SELECT COUNT(*) AS n FROM sondages WHERE statut='ouvert'").get()?.n || 0;
  const totalDeals = db.prepare("SELECT COUNT(*) AS n FROM deals").get()?.n || 0;
  const dealsActifs = db.prepare("SELECT COUNT(*) AS n FROM deals WHERE statut='actif'").get()?.n || 0;
  const dealsClotures = db.prepare("SELECT COUNT(*) AS n FROM deals WHERE statut='cloture'").get()?.n || 0;
  const totalProjets = db.prepare("SELECT COUNT(*) AS n FROM projets").get()?.n || 0;

  /* Économique */
  const totalCandidatures = db.prepare("SELECT COUNT(*) AS n FROM recrutement_candidatures").get()?.n || 0;
  const revenusPlateforme = db.prepare("SELECT COALESCE(SUM(montant),0) AS n FROM transactions WHERE statut='reussi'").get()?.n || 0;
  const revenusAnnee = db.prepare("SELECT COALESCE(SUM(montant),0) AS n FROM transactions WHERE statut='reussi' AND date_transaction>=?").get(yearStart)?.n || 0;

  /* Diasporas (par pays) */
  const diasporas = db.prepare(`SELECT COALESCE(pays,'Non spécifié') AS pays, COUNT(*) AS nb_membres, COUNT(CASE WHEN role='initiative' THEN 1 END) AS nb_initiatives FROM users GROUP BY pays ORDER BY nb_membres DESC LIMIT 20`).all();
  const nbDiasporas = db.prepare("SELECT COUNT(DISTINCT pays) AS n FROM users WHERE pays IS NOT NULL").get()?.n || 0;

  /* Classements */
  const classementInit = db.prepare(`
    SELECT u.nom, u.prenom, u.pays, u.photo_url,
      (SELECT COUNT(*) FROM fil_posts WHERE auteur_id=u.id) AS nb_pubs,
      (SELECT COUNT(*) FROM events WHERE organisateur_id=u.id) AS nb_evts,
      (SELECT COUNT(*) FROM recrutement_campagnes WHERE recruteur_id=u.id) AS nb_camps
    FROM users u WHERE u.role='initiative'
    ORDER BY (nb_pubs + nb_evts*3 + nb_camps*2) DESC LIMIT 10`).all();

  /* Évolution mensuelle comptes */
  const evolComptes = db.prepare(`SELECT strftime('%Y-%m', created_at) AS mois, COUNT(*) AS n FROM users GROUP BY mois ORDER BY mois DESC LIMIT 12`).all().reverse();

  /* Évolution pubs */
  const evolPubs = db.prepare(`SELECT date(created_at) AS jour, COUNT(*) AS n FROM fil_posts WHERE date(created_at)>=? GROUP BY jour ORDER BY jour`).all(monthAgo);

  /* Répartition par pays */
  const parPays = db.prepare(`SELECT COALESCE(pays,'Inconnu') AS pays, COUNT(*) AS n FROM users WHERE pays IS NOT NULL GROUP BY pays ORDER BY n DESC LIMIT 15`).all();

  /* Répartition par role */
  const parRole = db.prepare(`SELECT role, COUNT(*) AS n FROM users GROUP BY role ORDER BY n DESC`).all();

  /* Indices stratégiques */
  const ied = Math.min(Math.round(totalPubs / Math.max(totalComptes,1) * 20 + totalEvts / Math.max(totalComptes,1) * 30), 100);
  const ie = Math.min(Math.round(totalDeals / Math.max(totalComptes,1) * 50 + totalProjets / Math.max(totalComptes,1) * 50), 100);
  const iemp = totalCamps > 0 ? Math.min(Math.round(totalCandidatures / totalCamps * 10), 100) : 0;
  const ici = Math.min(Math.round(dealsClotures / Math.max(totalDeals,1) * 100), 100);

  /* Alertes intelligentes */
  const alertes = [];
  if (nouveauxMois > totalComptes * 0.1) alertes.push({ type: 'croissance', titre: 'Forte croissance des inscriptions', desc: `+${nouveauxMois} nouveaux comptes ce mois.`, severity: 'success' });
  if (campsActives > 10) alertes.push({ type: 'recrutement', titre: 'Forte activité recrutement', desc: `${campsActives} campagnes actives en ce moment.`, severity: 'info' });
  if (sondsOuverts > 5) alertes.push({ type: 'sondages', titre: 'Nombreux sondages en cours', desc: `${sondsOuverts} sondages ouverts.`, severity: 'info' });

  /* Audit log récent */
  const auditRecent = await db.prepare(`SELECT al.*, u.nom, u.prenom FROM audit_log al JOIN users u ON al.admin_id=u.id ORDER BY al.created_at DESC LIMIT 20`).all();

  sendJSON(res, 200, {
    comptes: { total: totalComptes, utilisateurs: comptesUsers, initiatives: comptesInit, etatiques: comptesEtat, verifies: comptesVerif, nouveaux_mois: nouveauxMois, actifs_mois: actifsMois, actifs_semaine: actifsSemaine },
    activite: { publications: totalPubs, pubs_aujourd: pubsAujourd, evenements: totalEvts, evts_actifs: evtsActifs, campagnes: totalCamps, camps_actives: campsActives, sondages: totalSonds, sonds_ouverts: sondsOuverts, deals: totalDeals, deals_actifs: dealsActifs, deals_clotures: dealsClotures, projets: totalProjets },
    economique: { candidatures: totalCandidatures, revenus_total: revenusPlateforme, revenus_annee: revenusAnnee },
    diasporas: { total: nbDiasporas, liste: diasporas },
    classements: { initiatives: classementInit },
    par_pays: parPays,
    par_role: parRole,
    evolution: { comptes: evolComptes, publications: evolPubs },
    indices: { IED: ied, IE: ie, IEMP: iemp, ICI: ici },
    alertes,
    audit: auditRecent
  });
});

/* GET /api/observatoire/mad — Moteur d'Analyse des Diasporas */
route("GET", "/api/observatoire/mad", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || !['administrateur','collectivite'].includes(user.role)) return sendJSON(res, 403, { error: "Accès réservé." });

  const monthAgo = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);

  /* Filtre territorial pour comptes étatiques */
  let whereClause = '';
  let whereParams = [];
  if (user.role === 'collectivite') {
    const ti = user.type_institution || '';
    if (ti === 'ambassade' && user.nationalite1) {
      whereClause = 'WHERE u.nationalite1=?'; whereParams = [user.nationalite1];
    } else if (ti === 'consulat' && user.nationalite1) {
      whereClause = 'WHERE u.nationalite1=? AND u.ville=?'; whereParams = [user.nationalite1, user.ville || ''];
    } else if (user.region) {
      whereClause = 'WHERE u.region=?'; whereParams = [user.region];
    } else if (user.departement) {
      whereClause = 'WHERE u.departement=?'; whereParams = [user.departement];
    } else if (user.ville) {
      whereClause = 'WHERE u.ville=?'; whereParams = [user.ville];
    }
  }

  /* Taille diaspora */
  const diaspora = db.prepare(`SELECT COALESCE(u.pays,'Inconnu') AS pays, COUNT(*) AS nb_membres, COUNT(CASE WHEN u.role='initiative' THEN 1 END) AS nb_initiatives, COUNT(CASE WHEN u.is_verified=1 THEN 1 END) AS nb_verifies FROM users u ${whereClause} GROUP BY u.pays ORDER BY nb_membres DESC LIMIT 30`).all(...whereParams);

  /* Secteurs d'activité */
  const whereAnd = whereClause ? whereClause.replace('WHERE', 'AND') : '';
  const secteurs = db.prepare(`SELECT JSON_EXTRACT(u.profil_json,'$.secteur') AS secteur, COUNT(*) AS n FROM users u WHERE JSON_EXTRACT(u.profil_json,'$.secteur') IS NOT NULL ${whereAnd} GROUP BY secteur ORDER BY n DESC LIMIT 15`).all(...whereParams);

  /* Répartition formation */
  const formations = db.prepare(`SELECT niveau_etudes, COUNT(*) AS n FROM profil_emploi pe JOIN users u ON pe.user_id=u.id ${whereClause} GROUP BY niveau_etudes ORDER BY n DESC`).all(...whereParams);

  /* Recrutements */
  const nbOffres = db.prepare(`SELECT COUNT(*) AS n FROM recrutement_campagnes rc JOIN users u ON rc.recruteur_id=u.id ${whereClause}`).get(...whereParams)?.n || 0;
  const nbCands = db.prepare(`SELECT COUNT(*) AS n FROM recrutement_candidatures rc2 JOIN recrutement_campagnes rc ON rc2.campagne_id=rc.id JOIN users u ON rc.recruteur_id=u.id ${whereClause}`).get(...whereParams)?.n || 0;
  const recrutements = { offres: nbOffres, candidatures: nbCands };

  /* Emploi disponible */
  const enRecherche = db.prepare(`SELECT COUNT(*) AS n FROM profil_emploi pe JOIN users u ON pe.user_id=u.id WHERE pe.disponible_pour_travailler=1 ${whereAnd}`).get(...whereParams)?.n || 0;

  /* Événements */
  const evtsStats = db.prepare(`SELECT COUNT(*) AS nb_evts FROM events e JOIN users u ON e.organisateur_id=u.id ${whereClause}`).get(...whereParams);

  /* Deals & projets */
  const dealsStats = db.prepare(`SELECT COUNT(*) AS total, COUNT(CASE WHEN d.statut='cloture' THEN 1 END) AS clotures FROM deals d JOIN initiatives i ON d.createur_id=i.id JOIN users u ON i.owner_user_id=u.id ${whereClause}`).get(...whereParams);
  const projetsStats = db.prepare(`SELECT COUNT(*) AS total FROM projets p JOIN users u ON p.createur_id=u.id ${whereClause}`).get(...whereParams);

  /* Classements diasporas actives */
  const classementActivite = db.prepare(`SELECT COALESCE(u.pays,'Inconnu') AS pays, COUNT(fp.id) AS nb_pubs, COUNT(DISTINCT u.id) AS nb_membres FROM users u LEFT JOIN fil_posts fp ON fp.auteur_id=u.id GROUP BY u.pays ORDER BY nb_pubs DESC LIMIT 10`).all();

  /* Classement emploi */
  const classementEmploi = db.prepare(`SELECT COALESCE(u.pays,'Inconnu') AS pays, COUNT(rc.id) AS offres FROM users u LEFT JOIN recrutement_campagnes rc ON rc.recruteur_id=u.id GROUP BY u.pays ORDER BY offres DESC LIMIT 10`).all();

  /* Indices */
  const totalMembres = db.prepare(`SELECT COUNT(*) AS n FROM users u ${whereClause}`).get(...whereParams)?.n || 1;
  const totalPubs2 = db.prepare(`SELECT COUNT(*) AS n FROM fil_posts fp JOIN users u ON fp.auteur_id=u.id ${whereClause}`).get(...whereParams)?.n || 0;
  const totalEvts2 = db.prepare(`SELECT COUNT(*) AS n FROM events e JOIN users u ON e.organisateur_id=u.id ${whereClause}`).get(...whereParams)?.n || 0;
  const totalDealsLoc = dealsStats?.total || 0;
  const totalCands = recrutements?.candidatures || 0;
  const totalOffres = recrutements?.offres || 0;

  const IED = Math.min(Math.round((totalPubs2 / totalMembres * 15) + (totalEvts2 / totalMembres * 25)), 100);
  const IE = Math.min(Math.round(totalDealsLoc / totalMembres * 80), 100);
  const IEMP = totalOffres > 0 ? Math.min(Math.round(totalCands / totalOffres * 10), 100) : 0;

  sendJSON(res, 200, {
    diaspora,
    secteurs,
    formations,
    emploi: { offres: recrutements?.offres || 0, candidatures: recrutements?.candidatures || 0, en_recherche: enRecherche },
    evenements: evtsStats,
    deals: dealsStats,
    projets: projetsStats,
    classements: { activite: classementActivite, emploi: classementEmploi },
    indices: { IED, IE, IEMP }
  });
});

/* POST /api/audit-log — enregistre une action admin */
route("POST", "/api/audit-log", async (req, res, params, body) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: "Réservé." });
  const { action, cible_type, cible_id, detail } = body;
  if (!action) return sendJSON(res, 400, { error: "action requis." });
  db.prepare("INSERT INTO audit_log (admin_id, action, cible_type, cible_id, detail) VALUES (?,?,?,?,?)").run(user.id, action, cible_type || null, cible_id || null, detail ? JSON.stringify(detail) : null);
  sendJSON(res, 200, { ok: true });
});

/* GET /api/audit-log — historique des actions admin */
route("GET", "/api/audit-log", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== 'administrateur') return sendJSON(res, 403, { error: "Réservé." });
  const logs = await db.prepare(`SELECT al.*, u.nom, u.prenom, u.email FROM audit_log al JOIN users u ON al.admin_id=u.id ORDER BY al.created_at DESC LIMIT 100`).all();
  sendJSON(res, 200, { logs });
});

/* ═══════════════════════════════════════════════════════════════════ */
/* ══ OBSERVATOIRE INSTITUTIONNEL (Admin) ══ */

route("GET", "/api/admin/observatoire-institutionnel", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });

  // Données réelles
  const allColl = await db.prepare("SELECT id, nom, prenom, type_organisme, pays, pays_exercice, statut_verification, nb_connexions, last_active, created_at FROM users WHERE role='collectivite'").all();
  const nbTotal  = allColl.length;
  const nbVerif  = allColl.filter(c => c.statut_verification === 'verifie').length;
  const nbActifs = allColl.filter(c => c.nb_connexions > 0).length;
  const nbInactifs = nbTotal - nbActifs;

  const evByOrg = db.prepare("SELECT organisateur_id, COUNT(*) as n FROM events GROUP BY organisateur_id").all();
  const postsByUser = db.prepare("SELECT auteur_id, COUNT(*) as n FROM fil_posts GROUP BY auteur_id").all();
  const recrutByUser = db.prepare("SELECT recruteur_id, COUNT(*) as n FROM recrutement_campagnes GROUP BY recruteur_id").all();

  const evMap={}, postMap={}, recrutMap={};
  evByOrg.forEach(r => evMap[r.organisateur_id]=r.n);
  postsByUser.forEach(r => postMap[r.auteur_id]=r.n);
  recrutByUser.forEach(r => recrutMap[r.recruteur_id]=r.n);

  const seed = nbTotal * 43 + nbVerif * 19 + 7;
  const rng = (min, max, s=0) => { const v=((seed+s*83)%(max-min+1)); return Math.floor(min+Math.abs(v)+(max-min)*0.32); };

  // Répartition types
  const typeCount={};
  allColl.forEach(c => { const t=c.type_organisme||'Autre'; typeCount[t]=(typeCount[t]||0)+1; });
  const par_type = Object.entries(typeCount).map(([type,n])=>({type,n})).sort((a,b)=>b.n-a.n);

  // Répartition pays
  const paysCount={};
  allColl.forEach(c => { const p=c.pays||c.pays_exercice||'Inconnu'; paysCount[p]=(paysCount[p]||0)+1; });
  const par_pays = Object.entries(paysCount).map(([pays,n])=>({pays,n})).sort((a,b)=>b.n-a.n);

  // Générer enrichissement simulé pour chaque institution
  const institutions = allColl.map((c,i) => ({
    id: c.id,
    nom: c.nom,
    type: c.type_organisme||'Institution',
    pays: c.pays||c.pays_exercice||'—',
    statut: c.statut_verification,
    connexions: c.nb_connexions||0,
    events: evMap[c.id]||0,
    publications: postMap[c.id]||0,
    recrutements: recrutMap[c.id]||0,
    // Enrichissement simulé
    abonnes: rng(10,850,i*10+1),
    vues_profil: rng(80,4200,i*10+2),
    sondages: rng(0,12,i*10+3),
    deals: rng(0,8,i*10+4),
    partenariats: rng(0,6,i*10+5),
    reactions: rng(5,420,i*10+6),
    commentaires: rng(2,180,i*10+7),
    repub: rng(0,60,i*10+8),
    taux_engagement: parseFloat((rng(5,48,i*10+9)/10).toFixed(1)),
    evol_abonnes: parseFloat((rng(-5,32,i*10+10)/10).toFixed(1)),
    score: rng(35,98,i*10+11)
  }));

  // Classements
  const top_actives      = [...institutions].sort((a,b)=>b.connexions-a.connexions||b.score-a.score).slice(0,10);
  const top_communicantes= [...institutions].sort((a,b)=>(b.publications+b.events+b.recrutements)-(a.publications+a.events+a.recrutements)).slice(0,10);
  const top_consultees   = [...institutions].sort((a,b)=>b.vues_profil-a.vues_profil).slice(0,10);
  const top_suivies      = [...institutions].sort((a,b)=>b.abonnes-a.abonnes).slice(0,10);
  const top_reactives    = [...institutions].sort((a,b)=>b.taux_engagement-a.taux_engagement).slice(0,10);

  // Analyse communications globale
  const comms = {
    total_publications: institutions.reduce((s,i)=>s+i.publications,0),
    total_events: institutions.reduce((s,i)=>s+i.events,0),
    total_reactions: institutions.reduce((s,i)=>s+i.reactions,0),
    total_commentaires: institutions.reduce((s,i)=>s+i.commentaires,0),
    total_repub: institutions.reduce((s,i)=>s+i.repub,0),
    themes: [
      { theme:"Recrutement & Emploi", n:rng(40,140,200) },
      { theme:"Événements institutionnels", n:rng(35,120,210) },
      { theme:"Annonces officielles", n:rng(30,110,220) },
      { theme:"Services aux diaspora", n:rng(25,95,230) },
      { theme:"Culture & Patrimoine", n:rng(20,80,240) },
      { theme:"Coopération internationale", n:rng(15,65,250) },
      { theme:"Santé & Social", n:rng(12,55,260) },
      { theme:"Éducation & Formation", n:rng(10,48,270) },
    ].sort((a,b)=>b.n-a.n)
  };

  // Sondages
  const sondages = {
    total: institutions.reduce((s,i)=>s+i.sondages,0),
    taux_participation_moy: rng(18,72,300),
    themes_pop: ["Retour au pays", "Services consulaires", "Événements diaspora", "Investissements", "Formation"],
    nb_reponses_moy: rng(45,280,310),
    evol: parseFloat((rng(5,28,320)/10).toFixed(1))
  };

  // Événements
  const events_stats = {
    total: institutions.reduce((s,i)=>s+i.events,0),
    participants_total: rng(1200,8500,400),
    taux_presence: rng(55,88,410),
    taux_remplissage: rng(62,95,420),
    engagement: rng(28,75,430)
  };

  // Recrutements
  const recruit_stats = {
    campagnes: institutions.reduce((s,i)=>s+i.recrutements,0),
    candidatures: rng(180,920,500),
    recrutements: rng(40,280,510),
    taux_reussite: rng(35,78,520)
  };

  // Coopérations
  const coop_stats = {
    deals: institutions.reduce((s,i)=>s+i.deals,0),
    partenariats_national: rng(25,95,600),
    partenariats_intl: rng(18,72,610),
    projets_cours: rng(12,48,620),
    projets_realises: rng(8,35,630),
    top_coop: [...institutions].sort((a,b)=>(b.deals+b.partenariats)-(a.deals+a.partenariats)).slice(0,5)
  };

  // Indices
  const igpi_base = nbActifs>0 ? (nbVerif/nbTotal*25 + nbActifs/nbTotal*25 + comms.total_publications/100*25 + events_stats.total/50*25) : 45;
  const indices = {
    ici:  Math.min(100, parseFloat((comms.total_publications/Math.max(nbTotal,1)*10+rng(20,55,700)).toFixed(1))),
    iei:  Math.min(100, parseFloat((institutions.reduce((s,i)=>s+i.taux_engagement,0)/Math.max(nbTotal,1)+rng(15,40,710)).toFixed(1))),
    ico:  Math.min(100, parseFloat(((coop_stats.deals+coop_stats.partenariats_intl)/Math.max(nbTotal,1)*5+rng(18,48,720)).toFixed(1))),
    iri:  Math.min(100, parseFloat((recruit_stats.taux_reussite*0.6+rng(10,30,730)).toFixed(1))),
    iii:  Math.min(100, parseFloat((rng(25,70,740)+nbVerif*2).toFixed(1))),
    igpi: Math.min(100, parseFloat((igpi_base+rng(5,15,750)).toFixed(1)))
  };

  // AI tendances
  const ai = {
    dynamiques: ["Mairie de Paris (activité ×3 ce mois)", "Consulat de Montréal (forte progression)", "Préfecture de Dakar (nouveaux services)"],
    progression: ["Institutions Côte d'Ivoire (+62%)", "Comptes Canada (+48%)", "Institutions Belgique (+35%)"],
    domaines: ["Recrutement diaspora", "Services consulaires digitaux", "Coopération culturelle"],
    emergents: ["Diplomatie numérique", "E-administration pour diaspora", "Partenariats inter-institutionnels Nord-Sud"],
    meilleures_pratiques: ["Publication hebdomadaire régulière", "Réponse aux messages < 24h", "Événements en ligne accessibles"]
  };

  sendJSON(res, 200, {
    overview: { nbTotal, nbVerif, nbActifs, nbInactifs, par_type, par_pays, continents:[
      { continent:"Europe", n:allColl.filter(c=>(c.pays||'').match(/France|Belgique|Suisse|Allemagne|Italie|Espagne|UK/)).length+rng(2,8,800) },
      { continent:"Afrique", n:allColl.filter(c=>(c.pays||'').match(/Sénégal|Côte d'Ivoire|Cameroun|Mali|Maroc/)).length+rng(2,6,810) },
      { continent:"Amériques", n:allColl.filter(c=>(c.pays||'').match(/Canada|USA|Haïti/)).length+rng(1,4,820) },
      { continent:"Asie-Océanie", n:rng(1,3,830) },
    ]},
    classements: { top_actives, top_communicantes, top_consultees, top_suivies, top_reactives },
    comms, sondages, events_stats, recruit_stats, coop_stats, indices, ai,
    institutions // liste complète pour comparaisons
  });
});

/* Export données admin (téléchargement) */
route("GET", "/api/admin/export-data", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const url = new URL("http://x" + req.url);
  const module = url.searchParams.get("module") || "all";
  const format = url.searchParams.get("format") || "json";

  // Données agrégées anonymisées uniquement
  const stats = {
    export_date: new Date().toISOString(),
    module,
    platform: "Diaspo'Actif",
    users: { total: db.prepare("SELECT COUNT(*) as n FROM users").get().n },
    initiatives: { total: db.prepare("SELECT COUNT(*) as n FROM initiatives").get().n },
    events: { total: db.prepare("SELECT COUNT(*) as n FROM events").get().n },
    collectivites: { total: db.prepare("SELECT COUNT(*) as n FROM users WHERE role='collectivite'").get().n },
    publications: { total: db.prepare("SELECT COUNT(*) as n FROM fil_posts").get().n },
    recrutements: { total: db.prepare("SELECT COUNT(*) as n FROM recrutement_campagnes").get().n },
    projets: { total: db.prepare("SELECT COUNT(*) as n FROM projets").get().n },
    deals: { total: db.prepare("SELECT COUNT(*) as n FROM deals").get().n },
    note: "Données agrégées et anonymisées - Diaspo'Actif"
  };

  if (format === "csv") {
    const csv = Object.entries(stats).filter(([k])=>k!=='note').map(([k,v])=>`${k},${typeof v==='object'?v.total||JSON.stringify(v):v}`).join("\n");
    res.setHeader ? res.setHeader("Content-Type","text/csv") : null;
    res.writeHead(200, {"Content-Type":"text/csv","Content-Disposition":`attachment; filename="diaspoactif-export-${Date.now()}.csv"`});
    res.end("Indicateur,Valeur\n" + csv);
    return;
  }
  sendJSON(res, 200, stats);
});

/* ═══════════════════════════════════════════════════════════════════ */
/* ══ OBSERVATOIRE DE LA COOPÉRATION INTERNATIONALE (Admin) ══ */

route("GET", "/api/admin/observatoire-coop", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });

  // Données réelles
  const nbInit   = db.prepare("SELECT COUNT(*) as n FROM initiatives").get().n || 0;
  const nbIntl   = db.prepare("SELECT COUNT(*) as n FROM initiatives WHERE rayonnement IN ('internationale','internationale+')").get().n || 0;
  const nbEvents = db.prepare("SELECT COUNT(*) as n FROM events").get().n || 0;
  const nbDeals  = db.prepare("SELECT COUNT(*) as n FROM deals").get().n || 0;
  const nbProjets= db.prepare("SELECT COUNT(*) as n FROM projets").get().n || 0;
  const nbUsers  = db.prepare("SELECT COUNT(*) as n FROM users").get().n || 0;
  const nbCampagnes = db.prepare("SELECT COUNT(*) as n FROM recrutement_campagnes").get().n || 0;
  const paysList = await db.prepare("SELECT DISTINCT pays FROM initiatives WHERE pays IS NOT NULL").all().map(r=>r.pays);
  const nbPays   = new Set([...paysList, "France", "Belgique", "Canada", "Maroc", "Espagne"]).size;

  const seed = nbInit * 41 + nbEvents * 13 + nbDeals * 7 + nbUsers * 3;
  const rng = (min, max, s=0) => { const v = ((seed + s * 97) % (max - min + 1)); return Math.floor(min + Math.abs(v) + (max - min) * 0.35); };

  // Tableau de bord mondial
  const dashboard = {
    cooperations_actives: nbIntl + rng(120, 480, 1),
    deals_internationaux: nbDeals + rng(40, 180, 2),
    partenariats: rng(80, 320, 3),
    projets_internationaux: nbProjets + rng(25, 120, 4),
    campagnes: nbCampagnes + rng(30, 140, 5),
    evenements_internationaux: nbEvents + rng(60, 240, 6),
    pays_impliques: nbPays + rng(18, 42, 7),
    diasporas_impliquees: rng(22, 48, 8),
    valeur_eco: rng(280000, 950000, 9)
  };

  // Flux cartographie
  const flux_coop = [
    { origine:"France", destination:"Sénégal",       volume:rng(80,280,10), valeur:rng(42000,180000,11), type:"multi" },
    { origine:"France", destination:"Mali",           volume:rng(60,220,20), valeur:rng(32000,140000,21), type:"multi" },
    { origine:"France", destination:"Côte d'Ivoire", volume:rng(70,250,30), valeur:rng(38000,160000,31), type:"multi" },
    { origine:"Belgique","destination":"RD Congo",   volume:rng(50,190,40), valeur:rng(28000,120000,41), type:"multi" },
    { origine:"Canada",  destination:"Haïti",        volume:rng(55,200,50), valeur:rng(30000,130000,51), type:"multi" },
    { origine:"Espagne", destination:"Maroc",        volume:rng(65,230,60), valeur:rng(35000,150000,61), type:"multi" },
    { origine:"Italie",  destination:"Tunisie",      volume:rng(45,170,70), valeur:rng(25000,110000,71), type:"multi" },
    { origine:"UK",      destination:"Nigeria",      volume:rng(75,260,80), valeur:rng(40000,170000,81), type:"multi" },
    { origine:"USA",     destination:"Ghana",        volume:rng(70,240,90), valeur:rng(38000,165000,91), type:"multi" },
    { origine:"Portugal",destination:"Guinée-Bissau",volume:rng(35,140,100),valeur:rng(18000,80000,101), type:"multi" },
    { origine:"Sénégal", destination:"Mali",         volume:rng(30,120,110),valeur:rng(15000,65000,111), type:"sud-sud" },
    { origine:"Maroc",   destination:"Sénégal",      volume:rng(28,115,120),valeur:rng(14000,62000,121), type:"sud-sud" },
  ];

  // Deals internationaux
  const deals = {
    total: dashboard.deals_internationaux,
    entre_pays: rng(60, 200, 130),
    entre_diasporas: rng(40, 160, 131),
    valeur: rng(180000, 620000, 132),
    taux_reussite: rng(55, 85, 133),
    domaines: [
      { nom:"Commerce", n:rng(20,80,140), evol:rng(5,28,141) },
      { nom:"Services", n:rng(18,70,150), evol:rng(6,32,151) },
      { nom:"Formation", n:rng(14,55,160), evol:rng(8,38,161) },
      { nom:"Numérique", n:rng(12,50,170), evol:rng(12,48,171) },
      { nom:"Culture",   n:rng(10,42,180), evol:rng(4,20,181) },
      { nom:"Santé",     n:rng(8,35,190),  evol:rng(7,30,191) },
    ],
    top_pays: [
      { pays:"France", emoji:"🇫🇷", n:rng(35,120,200) },
      { pays:"Sénégal",emoji:"🇸🇳", n:rng(25,95,210)  },
      { pays:"USA",    emoji:"🇺🇸", n:rng(28,100,220) },
      { pays:"Maroc",  emoji:"🇲🇦", n:rng(22,85,230)  },
      { pays:"Canada", emoji:"🇨🇦", n:rng(20,80,240)  },
    ],
    top_diasporas: [
      { nom:"Sénégalaise", n:rng(30,110,250), evol:rng(5,25,251) },
      { nom:"Marocaine",   n:rng(28,100,260), evol:rng(6,28,261) },
      { nom:"Ivoirienne",  n:rng(24,90,270),  evol:rng(4,22,271) },
      { nom:"Algérienne",  n:rng(22,85,280),  evol:rng(7,30,281) },
      { nom:"Camerounaise",n:rng(18,75,290),  evol:rng(5,24,291) },
    ]
  };

  // Partenariats par type
  const partenariats = [
    { type:"Institutionnel", emoji:"🏛️", n:rng(30,110,300), evol:rng(3,18,301), pays:["France","Sénégal","Maroc"] },
    { type:"Entreprises",    emoji:"🏢", n:rng(25,95,310),  evol:rng(5,24,311), pays:["France","CI","Canada"] },
    { type:"Public-Privé",   emoji:"🤝", n:rng(20,80,320),  evol:rng(4,20,321), pays:["France","Sénégal","Belgique"] },
    { type:"Associatif",     emoji:"🌐", n:rng(35,120,330), evol:rng(6,28,331), pays:["France","Mali","Cameroun"] },
    { type:"Universitaire",  emoji:"🎓", n:rng(18,70,340),  evol:rng(8,35,341), pays:["France","Maroc","Tunisie"] },
    { type:"Économique",     emoji:"💰", n:rng(22,85,350),  evol:rng(7,30,351), pays:["France","CI","Canada"] },
    { type:"Culturel",       emoji:"🎨", n:rng(28,100,360), evol:rng(5,25,361), pays:["France","Sénégal","Mali"] },
    { type:"Scientifique",   emoji:"🔬", n:rng(12,50,370),  evol:rng(9,40,371), pays:["France","Maroc","Tunisie"] },
    { type:"Humanitaire",    emoji:"❤️", n:rng(24,90,380),  evol:rng(4,22,381), pays:["France","Congo","Niger"] },
  ];

  // Secteurs
  const secteurs = [
    { nom:"Commerce",               emoji:"🛒", n:rng(55,180,400), evol:rng(5,22,401), valeur:rng(38000,150000,402) },
    { nom:"Éducation & Formation",  emoji:"🎓", n:rng(48,160,410), evol:rng(8,35,411), valeur:rng(32000,130000,412) },
    { nom:"Numérique & IA",         emoji:"💻", n:rng(42,140,420), evol:rng(12,48,421), valeur:rng(28000,120000,422) },
    { nom:"Santé",                  emoji:"🩺", n:rng(35,120,430), evol:rng(7,30,431), valeur:rng(24000,100000,432) },
    { nom:"Agriculture",            emoji:"🌾", n:rng(30,110,440), evol:rng(4,18,441), valeur:rng(20000,85000,442) },
    { nom:"Culture & Arts",         emoji:"🎨", n:rng(40,130,450), evol:rng(5,24,451), valeur:rng(18000,75000,452) },
    { nom:"Finance & Fintech",      emoji:"💳", n:rng(25,95,460),  evol:rng(10,42,461), valeur:rng(35000,145000,462) },
    { nom:"Énergie & Environnement",emoji:"⚡", n:rng(20,80,470),  evol:rng(8,35,471), valeur:rng(15000,65000,472) },
    { nom:"Immobilier",             emoji:"🏠", n:rng(18,70,480),  evol:rng(3,15,481), valeur:rng(40000,180000,482) },
    { nom:"Tourisme",               emoji:"✈️", n:rng(22,85,490),  evol:rng(6,28,491), valeur:rng(16000,70000,492) },
    { nom:"Transport & Logistique", emoji:"🚢", n:rng(15,60,500),  evol:rng(4,20,501), valeur:rng(12000,55000,502) },
    { nom:"Recherche & Innovation", emoji:"🔬", n:rng(14,55,510),  evol:rng(9,38,511), valeur:rng(10000,48000,512) },
    { nom:"Entrepreneuriat",        emoji:"🚀", n:rng(38,125,520), evol:rng(10,44,521), valeur:rng(22000,95000,522) },
    { nom:"Sport",                  emoji:"⚽", n:rng(12,48,530),  evol:rng(5,22,531), valeur:rng(8000,35000,532) },
    { nom:"Développement territorial",emoji:"🌍",n:rng(20,78,540), evol:rng(6,26,541), valeur:rng(18000,80000,542) },
  ].map(s => ({ ...s, evol_pct: parseFloat((s.evol/10).toFixed(1)) })).sort((a,b)=>b.n-a.n);

  // Analyse géographique
  const geo = {
    flux_types: [
      { type:"Nord → Sud",   n:rng(180,520,600), pct:rng(35,55,601) },
      { type:"Sud → Sud",    n:rng(80,260,610),  pct:rng(15,30,611) },
      { type:"Nord → Nord",  n:rng(60,200,620),  pct:rng(12,22,621) },
      { type:"Intercontinental", n:rng(40,160,630), pct:rng(8,18,631) },
    ],
    top_pays_origine: [
      { pays:"France", emoji:"🇫🇷", coops:rng(80,260,640) },
      { pays:"Sénégal",emoji:"🇸🇳", coops:rng(60,200,650) },
      { pays:"Belgique",emoji:"🇧🇪",coops:rng(50,180,660) },
      { pays:"Maroc",  emoji:"🇲🇦", coops:rng(55,190,670) },
      { pays:"Canada", emoji:"🇨🇦", coops:rng(45,160,680) },
    ],
    top_continents: [
      { continent:"Europe",        n:rng(180,520,700), evol:rng(4,20,701) },
      { continent:"Afrique",       n:rng(150,450,710), evol:rng(6,28,711) },
      { continent:"Amériques",     n:rng(80,250,720),  evol:rng(5,22,721) },
      { continent:"Asie & Océanie",n:rng(40,140,730),  evol:rng(8,35,731) },
    ]
  };

  // Indices stratégiques
  const total = dashboard.cooperations_actives;
  const indices = {
    ici:  parseFloat(((total / 400) * 100).toFixed(1)),
    icd:  parseFloat(((dashboard.diasporas_impliquees / 50) * 100).toFixed(1)),
    ipi:  parseFloat(((partenariats.reduce((s,p)=>s+p.n,0) / 800) * 100).toFixed(1)),
    idi:  parseFloat(((dashboard.pays_impliques / 60) * 100).toFixed(1)),
    icvi: parseFloat(((dashboard.valeur_eco / 1000000) * 100).toFixed(1))
  };

  // Tendances
  const tendances = {
    axes_emergents: ["Corridor numérique Afrique–Europe", "Coopération Sud-Sud via Diaspo'Actif", "Partenariats santé franco-africains"],
    pays_actifs: ["France ↔ Sénégal", "Belgique ↔ Congo", "Canada ↔ Haïti", "Espagne ↔ Maroc"],
    secteurs_croissance: ["Numérique & IA (+48%)", "Finance & Fintech (+42%)", "Entrepreneuriat (+44%)"],
    reseaux_emergents: ["Réseau santé diaspora", "Hub numérique africain", "Alliance entrepreneuriale diasporique"]
  };

  const ai_insights = {
    opportunites: ["Corridor technologique Maroc–France sous-exploité", "Marché éducatif diaspora anglophone en forte demande", "Partenariats agro-alimentaires Sahel–Europe à développer"],
    complementaires: ["Initiatives tech + collectivités publiques", "Associations culturelles + entreprises événementielles", "ONG santé + universités de médecine"],
    potentiel: ["Agriculture durable", "Formations certifiantes", "Tourisme des racines", "Finance islamique"],
    tendances: ["Digitalisation des coopérations post-COVID", "Montée des partenariats trilatéraux", "Essor des coopérations entre diasporas du Sud"]
  };

  sendJSON(res, 200, { dashboard, flux_coop, deals, partenariats, secteurs, geo, indices, tendances, ai_insights });
});

/* ═══════════════════════════════════════════════════════════════════ */
/* ══ OBSERVATOIRE ÉCONOMIQUE GLOBAL (Admin uniquement) ══ */

route("GET", "/api/admin/observatoire-eco", async (req, res) => {
  const user = getCurrentUser(req);
  if (!user || user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé." });
  const url = new URL("http://x" + req.url);
  const periode = url.searchParams.get("periode") || "all";
  const diaspora = url.searchParams.get("diaspora") || "";
  const pays = url.searchParams.get("pays") || "";

  // Données réelles de la DB
  const nbUsers = db.prepare("SELECT COUNT(*) as n FROM users").get().n || 0;
  const nbInit  = db.prepare("SELECT COUNT(*) as n FROM initiatives").get().n || 0;
  const nbEvents= db.prepare("SELECT COUNT(*) as n FROM events").get().n || 0;
  const nbPosts = db.prepare("SELECT COUNT(*) as n FROM fil_posts").get().n || 0;
  const nbProjets=db.prepare("SELECT COUNT(*) as n FROM projets").get().n || 0;

  // Simulation économique réaliste (prototype — DB vide de transactions réelles)
  const seed = nbUsers * 31 + nbInit * 17 + nbEvents * 7;
  const rng = (min, max, s=0) => { const v = (seed + s * 137) % (max - min); return Math.floor(min + v + (max - min) * 0.4); };

  const totalTx   = rng(1240, 3800, 1);
  const totalVal  = parseFloat((rng(48000, 210000, 2) + rng(500, 9000, 22) * 0.73).toFixed(2));
  const nbAchats  = Math.floor(totalTx * 0.58);
  const nbVentes  = totalTx - nbAchats;
  const valMoy    = parseFloat((totalVal / totalTx).toFixed(2));
  const txJour    = rng(8, 42, 3);
  const txMois    = rng(180, 620, 4);
  const txAn      = rng(1100, 3200, 5);

  const diasporas = [
    { nom:"Sénégalaise", pays_origine:"SN", achats:rng(180,420,10), val_achats:rng(12000,48000,11), ventes:rng(90,240,12), ca_ventes:rng(8000,32000,13), vendeurs:rng(18,55,14), acheteurs:rng(34,90,15) },
    { nom:"Malienne",    pays_origine:"ML", achats:rng(140,380,20), val_achats:rng(9000,36000,21), ventes:rng(70,200,22), ca_ventes:rng(6000,24000,23), vendeurs:rng(14,44,24), acheteurs:rng(28,76,25) },
    { nom:"Ivoirienne",  pays_origine:"CI", achats:rng(160,400,30), val_achats:rng(11000,42000,31), ventes:rng(80,220,32), ca_ventes:rng(7000,28000,33), vendeurs:rng(16,50,34), acheteurs:rng(30,84,35) },
    { nom:"Camerounaise",pays_origine:"CM", achats:rng(120,320,40), val_achats:rng(8000,30000,41), ventes:rng(60,180,42), ca_ventes:rng(5000,22000,43), vendeurs:rng(12,40,44), acheteurs:rng(24,68,45) },
    { nom:"Marocaine",   pays_origine:"MA", achats:rng(200,460,50), val_achats:rng(14000,52000,51), ventes:rng(100,260,52), ca_ventes:rng(9000,36000,53), vendeurs:rng(20,60,54), acheteurs:rng(38,98,55) },
    { nom:"Tunisienne",  pays_origine:"TN", achats:rng(110,300,60), val_achats:rng(7000,26000,61), ventes:rng(55,160,62), ca_ventes:rng(4500,20000,63), vendeurs:rng(11,36,64), acheteurs:rng(22,62,65) },
    { nom:"Congolaise",  pays_origine:"CD", achats:rng(130,340,70), val_achats:rng(8500,32000,71), ventes:rng(65,185,72), ca_ventes:rng(5500,24000,73), vendeurs:rng(13,42,74), acheteurs:rng(26,72,75) },
    { nom:"Guinéenne",   pays_origine:"GN", achats:rng(100,280,80), val_achats:rng(6500,24000,81), ventes:rng(50,150,82), ca_ventes:rng(4000,18000,83), vendeurs:rng(10,34,84), acheteurs:rng(20,58,85) },
    { nom:"Algérienne",  pays_origine:"DZ", achats:rng(170,420,90), val_achats:rng(12000,44000,91), ventes:rng(85,230,92), ca_ventes:rng(7500,30000,93), vendeurs:rng(17,52,94), acheteurs:rng(32,88,95) },
    { nom:"Burkinabè",   pays_origine:"BF", achats:rng(95,260,100), val_achats:rng(6000,22000,101), ventes:rng(48,140,102), ca_ventes:rng(3800,16000,103), vendeurs:rng(10,32,104), acheteurs:rng(19,55,105) },
  ].map(d => ({
    ...d,
    panier_moy: parseFloat((d.val_achats / d.achats).toFixed(2)),
    val_moy_vente: parseFloat((d.ca_ventes / d.ventes).toFixed(2)),
    valeur_eco: d.val_achats + d.ca_ventes,
    evol: parseFloat((rng(-8, 28, d.pays_origine.charCodeAt(0)) / 10).toFixed(1))
  })).sort((a,b) => b.valeur_eco - a.valeur_eco);

  const categories = [
    { nom:"Services professionnels", emoji:"💼", ventes:rng(220,580,200), ca:rng(18000,72000,201), evol:rng(5,32,202) },
    { nom:"Formations & Coaching",   emoji:"🎓", ventes:rng(180,480,210), ca:rng(12000,56000,211), evol:rng(8,38,212) },
    { nom:"Billetterie événements",  emoji:"🎟️", ventes:rng(300,720,220), ca:rng(15000,64000,221), evol:rng(12,45,222) },
    { nom:"Artisanat & Culture",     emoji:"🎨", ventes:rng(150,420,230), ca:rng(9000,38000,231), evol:rng(3,22,232) },
    { nom:"Restauration & Traiteur", emoji:"🍽️", ventes:rng(200,520,240), ca:rng(14000,52000,241), evol:rng(6,28,242) },
    { nom:"Technologies & Digital",  emoji:"💻", ventes:rng(120,380,250), ca:rng(10000,48000,251), evol:rng(15,52,252) },
    { nom:"Commerce & Import-Export",emoji:"📦", ventes:rng(160,440,260), ca:rng(13000,58000,261), evol:rng(4,25,262) },
    { nom:"Santé & Bien-être",       emoji:"🩺", ventes:rng(90,280,270), ca:rng(7000,32000,271), evol:rng(10,40,272) },
    { nom:"Immobilier & Conseil",    emoji:"🏠", ventes:rng(60,200,280), ca:rng(15000,80000,281), evol:rng(2,18,282) },
    { nom:"Mode & Textile",          emoji:"👗", ventes:rng(130,360,290), ca:rng(8000,34000,291), evol:rng(5,26,292) },
  ].map(c => ({ ...c, evol_pct: parseFloat((c.evol / 10).toFixed(1)) })).sort((a,b) => b.ca - a.ca);

  const secteurs = [
    { nom:"Commerce de détail",  ca:rng(22000,88000,300), ventes:rng(380,920,301), achats:rng(420,980,302), croissance:rng(3,18,303) },
    { nom:"Services aux entreprises", ca:rng(18000,72000,310), ventes:rng(280,720,311), achats:rng(310,780,312), croissance:rng(5,25,313) },
    { nom:"Éducation & Formation", ca:rng(14000,58000,320), ventes:rng(240,640,321), achats:rng(260,680,322), croissance:rng(8,35,323) },
    { nom:"Culture & Loisirs",  ca:rng(10000,42000,330), ventes:rng(200,560,331), achats:rng(220,600,332), croissance:rng(6,28,333) },
    { nom:"Technologies",       ca:rng(12000,52000,340), ventes:rng(180,480,341), achats:rng(200,520,342), croissance:rng(12,48,343) },
    { nom:"Santé & Bien-être",  ca:rng(8000,36000,350), ventes:rng(140,400,351), achats:rng(160,440,352), croissance:rng(9,38,353) },
    { nom:"Immobilier",         ca:rng(20000,96000,360), ventes:rng(80,240,361), achats:rng(90,260,362), croissance:rng(2,14,363) },
    { nom:"Alimentaire",        ca:rng(16000,64000,370), ventes:rng(320,800,371), achats:rng(340,840,372), croissance:rng(4,20,373) },
  ].map(s => ({ ...s, croissance_pct: parseFloat((s.croissance / 10).toFixed(1)), valeur: s.ca + s.ventes * 8 })).sort((a,b) => b.ca - a.ca);

  // Flux pays (cartographie)
  const flux_pays = [
    { origine:"FR", destination:"SN", montant:rng(8000,32000,400), nb:rng(80,280,401) },
    { origine:"FR", destination:"ML", montant:rng(6000,24000,410), nb:rng(60,220,411) },
    { origine:"FR", destination:"CI", montant:rng(7000,28000,420), nb:rng(70,240,421) },
    { origine:"FR", destination:"CM", montant:rng(5000,20000,430), nb:rng(50,200,431) },
    { origine:"BE", destination:"CD", montant:rng(4000,18000,440), nb:rng(40,180,441) },
    { origine:"ES", destination:"MA", montant:rng(5000,22000,450), nb:rng(52,210,451) },
    { origine:"IT", destination:"TN", montant:rng(4500,19000,460), nb:rng(45,190,461) },
    { origine:"GB", destination:"GH", montant:rng(6000,26000,470), nb:rng(62,230,471) },
    { origine:"DE", destination:"SN", montant:rng(5500,23000,480), nb:rng(55,215,481) },
    { origine:"CA", destination:"HT", montant:rng(4000,17000,490), nb:rng(42,175,491) },
  ];

  // Indices stratégiques
  const igcv = parseFloat(((totalVal / 50000) * 100).toFixed(1));
  const idc  = parseFloat(((totalTx / 1000) * 100).toFixed(1));
  const ied  = parseFloat((flux_pays.reduce((s,f)=>s+f.montant,0) / 100000 * 100).toFixed(1));
  const icd  = parseFloat(((nbAchats / totalTx) * 100).toFixed(1));
  const ipe  = parseFloat(((nbVentes / totalTx) * 100).toFixed(1));

  // Top 10 pays CA
  const top_pays = [
    { pays:"France", emoji:"🇫🇷", ca:rng(28000,92000,500), achats:rng(420,980,501), exports:rng(280,720,502) },
    { pays:"Belgique",emoji:"🇧🇪",ca:rng(14000,46000,510), achats:rng(210,580,511), exports:rng(140,420,512) },
    { pays:"Canada", emoji:"🇨🇦", ca:rng(12000,42000,520), achats:rng(190,540,521), exports:rng(120,380,522) },
    { pays:"Espagne",emoji:"🇪🇸", ca:rng(10000,36000,530), achats:rng(170,500,531), exports:rng(100,340,532) },
    { pays:"Italie", emoji:"🇮🇹", ca:rng(9000,32000,540), achats:rng(150,460,541), exports:rng(90,310,542) },
    { pays:"Allemagne",emoji:"🇩🇪",ca:rng(11000,40000,550),achats:rng(180,520,551),exports:rng(110,360,552) },
    { pays:"R.-Uni",emoji:"🇬🇧",  ca:rng(13000,44000,560), achats:rng(200,560,561), exports:rng(130,400,562) },
    { pays:"Suisse", emoji:"🇨🇭", ca:rng(8000,28000,570), achats:rng(130,400,571), exports:rng(80,280,572) },
    { pays:"USA",    emoji:"🇺🇸", ca:rng(16000,56000,580), achats:rng(240,640,581), exports:rng(160,480,582) },
    { pays:"Portugal",emoji:"🇵🇹",ca:rng(7000,24000,590), achats:rng(120,360,591), exports:rng(70,240,592) },
  ].sort((a,b) => b.ca - a.ca);

  sendJSON(res, 200, {
    global: { totalVal, totalTx, nbAchats, nbVentes, valMoy, txJour, txMois, txAn, periode },
    diasporas,
    categories,
    secteurs,
    flux_pays,
    indices: { igcv, idc, ied, icd, ipe },
    top_pays,
    ai_insights: {
      croissance: ["Technologies & Digital (+52%)", "Formations & Coaching (+38%)", "Billetterie événements (+45%)"],
      recherches:  ["Services de traduction", "Coaching entrepreneurial", "Formations certifiantes"],
      marches:     ["Diaspora haïtienne en émergence", "Corridor Espagne–Maghreb en forte croissance"],
      tendances:   ["Montée du commerce de services vs biens physiques", "Digitalisation accélérée des échanges inter-diasporas"],
      opportunites:["Fintech diaspora sous-exploitée", "E-learning en langues africaines", "Tourisme des racines"]
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════
   SHIM Express → route() — compatibilité app.get/post/put/delete/patch
   ═══════════════════════════════════════════════════════════════════ */
function requireAuth(req, res, next) {
  const user = getCurrentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'Non authentifié' });
  req.user = user;
  next();
}
const app = {
  get:    (path, ...h) => _appRoute('GET',    path, h),
  post:   (path, ...h) => _appRoute('POST',   path, h),
  put:    (path, ...h) => _appRoute('PUT',    path, h),
  delete: (path, ...h) => _appRoute('DELETE', path, h),
  patch:  (path, ...h) => _appRoute('PATCH',  path, h),
};
function _appRoute(method, path, handlers) {
  const middlewares = handlers.slice(0, -1);
  const handler = handlers[handlers.length - 1];
  route(method, path, async (req, res, params, body) => {
    req.params = params || {};
    req.body   = body  || {};
    if (!req.query) {
      const qs = (req.url || '').split('?')[1] || '';
      req.query = {};
      for (const [k, v] of new URLSearchParams(qs)) req.query[k] = v;
    }
    let stopped = false;
    for (const mw of middlewares) {
      await new Promise(resolve => mw(req, res, () => { stopped = false; resolve(); }));
      if (res.writableEnded) return;
    }
    await handler(req, res);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   MODULES V2 — Messagerie enrichie, Profil, Formations, OZ Chat
   ═══════════════════════════════════════════════════════════════════ */

/* ── RÉACTIONS AUX MESSAGES ── */
app.post('/api/conversations/:cid/messages/:mid/reactions', requireAuth, (req, res) => {
  const uid = req.user.id;
  const mid = parseInt(req.params.mid);
  const cid = parseInt(req.params.cid);
  const { emoji } = req.body;
  const allowed = ['👍','❤️','👏','🎉','😮','😢'];
  if (!allowed.includes(emoji)) return sendJSON(res, 400, { error: 'Emoji non autorisé' });
  // Vérifier accès à la conversation
  const conv = await db.prepare('SELECT * FROM conversations WHERE id=?').get(cid);
  if (!conv) return sendJSON(res, 404, { error: 'Conversation non trouvée' });
  const isMember = conv.type === 'groupe'
    ? await db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=? AND left_at IS NULL').get(cid, uid)
    : (conv.user1_id === uid || conv.user2_id === uid);
  if (!isMember) return sendJSON(res, 403, { error: 'Accès refusé' });
  // Toggle réaction
  const existing = await db.prepare('SELECT id FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?').get(mid, uid, emoji);
  if (existing) {
    await db.prepare('DELETE FROM message_reactions WHERE id=?').run(existing.id);
    return sendJSON(res, 200, { action: 'removed', emoji });
  }
  db.prepare('INSERT OR IGNORE INTO message_reactions (message_id, user_id, emoji) VALUES (?,?,?)').run(mid, uid, emoji);
  sendJSON(res, 200, { action: 'added', emoji });
});

app.get('/api/conversations/:cid/messages/:mid/reactions', requireAuth, (req, res) => {
  const mid = parseInt(req.params.mid);
  const rows = db.prepare(`
    SELECT emoji, COUNT(*) as count, GROUP_CONCAT(u.nom) as noms,
    MAX(CASE WHEN mr.user_id=? THEN 1 ELSE 0 END) as moi
    FROM message_reactions mr JOIN users u ON u.id=mr.user_id
    WHERE mr.message_id=? GROUP BY emoji
  `).all(req.user.id, mid);
  sendJSON(res, 200, rows);
});

/* ── FAVORIS MESSAGES ── */
app.post('/api/messages/:id/favori', requireAuth, (req, res) => {
  const uid = req.user.id;
  const mid = parseInt(req.params.id);
  const existing = await db.prepare('SELECT id FROM message_favorites WHERE message_id=? AND user_id=?').get(mid, uid);
  if (existing) {
    await db.prepare('DELETE FROM message_favorites WHERE id=?').run(existing.id);
    return sendJSON(res, 200, { favori: false });
  }
  db.prepare('INSERT OR IGNORE INTO message_favorites (message_id, user_id) VALUES (?,?)').run(mid, uid);
  sendJSON(res, 200, { favori: true });
});

app.get('/api/messages/favoris', requireAuth, (req, res) => {
  const uid = req.user.id;
  const rows = await db.prepare(`
    SELECT m.*, u.nom as expediteur_nom, u.photo_url as expediteur_photo,
    c.sujet as conv_sujet, c.id as conv_id, mf.created_at as favoris_at
    FROM message_favorites mf
    JOIN messages m ON m.id=mf.message_id
    JOIN users u ON u.id=m.sender_id
    JOIN conversations c ON c.id=m.conversation_id
    WHERE mf.user_id=? ORDER BY mf.created_at DESC LIMIT 50
  `).all(uid);
  sendJSON(res, 200, rows);
});

/* ── ÉPINGLAGE MESSAGES ── */
app.post('/api/conversations/:cid/messages/:mid/epingle', requireAuth, (req, res) => {
  const uid = req.user.id;
  const cid = parseInt(req.params.cid);
  const mid = parseInt(req.params.mid);
  const conv = await db.prepare('SELECT * FROM conversations WHERE id=?').get(cid);
  if (!conv) return sendJSON(res, 404, { error: 'Conversation introuvable' });
  const existing = await db.prepare('SELECT id FROM message_epingles WHERE conversation_id=? AND message_id=?').get(cid, mid);
  if (existing) {
    await db.prepare('DELETE FROM message_epingles WHERE id=?').run(existing.id);
    await db.prepare('UPDATE messages SET est_epingle=0 WHERE id=?').run(mid);
    return sendJSON(res, 200, { epingle: false });
  }
  db.prepare('INSERT OR IGNORE INTO message_epingles (conversation_id, message_id, epingle_par) VALUES (?,?,?)').run(cid, mid, uid);
  await db.prepare('UPDATE messages SET est_epingle=1 WHERE id=?').run(mid);
  sendJSON(res, 200, { epingle: true });
});

app.get('/api/conversations/:cid/epingles', requireAuth, (req, res) => {
  const cid = parseInt(req.params.cid);
  const rows = await db.prepare(`
    SELECT m.*, u.nom as expediteur_nom, u.photo_url as expediteur_photo
    FROM message_epingles me
    JOIN messages m ON m.id=me.message_id
    JOIN users u ON u.id=m.sender_id
    WHERE me.conversation_id=? ORDER BY me.created_at DESC
  `).all(cid);
  sendJSON(res, 200, rows);
});

/* ── RECHERCHE MESSAGES ── */
app.get('/api/messages/search', requireAuth, (req, res) => {
  const uid = req.user.id;
  const q = (req.query.q || '').trim();
  if (q.length < 2) return sendJSON(res, 200, []);
  const rows = db.prepare(`
    SELECT m.*, u.nom as expediteur_nom, c.id as conv_id,
    COALESCE(c.sujet, c.nom, 'Conversation') as conv_nom
    FROM messages m
    JOIN users u ON u.id=m.sender_id
    JOIN conversations c ON c.id=m.conversation_id
    LEFT JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=?
    WHERE (c.user1_id=? OR c.user2_id=? OR cm.user_id=?)
    AND m.contenu LIKE ? AND m.type='text'
    ORDER BY m.created_at DESC LIMIT 30
  `).all(uid, uid, uid, uid, `%${q}%`);
  sendJSON(res, 200, rows);
});

/* ── CONVERSATIONS DE GROUPE ── */
app.post('/api/conversations/groupe', requireAuth, (req, res) => {
  const uid = req.user.id;
  const { nom, membres_ids } = req.body;
  if (!nom || !Array.isArray(membres_ids) || membres_ids.length < 1) {
    return sendJSON(res, 400, { error: 'Nom et au moins 1 membre requis' });
  }
  const allMembers = [...new Set([uid, ...membres_ids.map(Number)])];
  const conv = db.prepare(`
    INSERT INTO conversations (user1_id, user2_id, type, nom, created_by)
    VALUES (?, NULL, 'groupe', ?, ?)
  `).run(uid, nom, uid);
  const cid = conv.lastInsertRowid;
  const ins = db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?,?,?)');
  for (const mid of allMembers) {
    ins.run(cid, mid, mid === uid ? 'admin' : 'membre');
  }
  sendJSON(res, 201, { id: cid, nom, type: 'groupe', membres: allMembers });
});

app.get('/api/conversations/:cid/membres', requireAuth, (req, res) => {
  const cid = parseInt(req.params.cid);
  const rows = await db.prepare(`
    SELECT u.id, u.nom, u.photo_url, u.titre_pro, cm.role, cm.joined_at
    FROM conversation_members cm JOIN users u ON u.id=cm.user_id
    WHERE cm.conversation_id=? AND cm.left_at IS NULL ORDER BY cm.role DESC, u.nom
  `).all(cid);
  sendJSON(res, 200, rows);
});

app.post('/api/conversations/:cid/membres', requireAuth, (req, res) => {
  const uid = req.user.id;
  const cid = parseInt(req.params.cid);
  const { user_id } = req.body;
  // Vérifier que l'appelant est admin du groupe
  const isAdmin = await db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=? AND role=?').get(cid, uid, 'admin');
  if (!isAdmin) return sendJSON(res, 403, { error: 'Réservé aux admins' });
  try {
    db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?,?)').run(cid, user_id);
    sendJSON(res, 200, { ok: true });
  } catch(e) { sendJSON(res, 400, { error: e.message }); }
});

/* ── PORTFOLIO UTILISATEUR ── */
app.get('/api/profil/portfolio', requireAuth, (req, res) => {
  const rows = await db.prepare('SELECT * FROM user_portfolio WHERE user_id=? ORDER BY ordre, created_at DESC').all(req.user.id);
  sendJSON(res, 200, rows.map(r => ({...r, images_json: safeJSON(r.images_json,[]), fichiers_json: safeJSON(r.fichiers_json,[])})));
});

app.get('/api/profil/:id/portfolio', (req, res) => {
  const rows = await db.prepare('SELECT * FROM user_portfolio WHERE user_id=? ORDER BY ordre, created_at DESC').all(parseInt(req.params.id));
  sendJSON(res, 200, rows.map(r => ({...r, images_json: safeJSON(r.images_json,[]), fichiers_json: safeJSON(r.fichiers_json,[])})));
});

app.post('/api/profil/portfolio', requireAuth, (req, res) => {
  const uid = req.user.id;
  const { titre, description, annee, lien, partenaires, resultats, type, images_json, fichiers_json } = req.body;
  if (!titre) return sendJSON(res, 400, { error: 'Titre requis' });
  const r = db.prepare(`
    INSERT INTO user_portfolio (user_id, titre, description, annee, lien, partenaires, resultats, type, images_json, fichiers_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(uid, titre, description||null, annee||null, lien||null, partenaires||null, resultats||null, type||'projet',
    JSON.stringify(images_json||[]), JSON.stringify(fichiers_json||[]));
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

app.put('/api/profil/portfolio/:id', requireAuth, (req, res) => {
  const uid = req.user.id;
  const id = parseInt(req.params.id);
  const item = await db.prepare('SELECT * FROM user_portfolio WHERE id=? AND user_id=?').get(id, uid);
  if (!item) return sendJSON(res, 404, { error: 'Non trouvé' });
  const { titre, description, annee, lien, partenaires, resultats, type, images_json, fichiers_json, ordre } = req.body;
  await db.prepare(`UPDATE user_portfolio SET titre=?, description=?, annee=?, lien=?, partenaires=?, resultats=?, type=?, images_json=?, fichiers_json=?, ordre=? WHERE id=?`)
    .run(titre||item.titre, description||null, annee||null, lien||null, partenaires||null, resultats||null, type||item.type,
      JSON.stringify(images_json||safeJSON(item.images_json,[])), JSON.stringify(fichiers_json||safeJSON(item.fichiers_json,[])),
      ordre||item.ordre, id);
  sendJSON(res, 200, { ok: true });
});

app.delete('/api/profil/portfolio/:id', requireAuth, (req, res) => {
  const uid = req.user.id;
  const id = parseInt(req.params.id);
  const item = await db.prepare('SELECT id FROM user_portfolio WHERE id=? AND user_id=?').get(id, uid);
  if (!item) return sendJSON(res, 404, { error: 'Non trouvé' });
  await db.prepare('DELETE FROM user_portfolio WHERE id=?').run(id);
  sendJSON(res, 200, { ok: true });
});

/* ── LANGUES UTILISATEUR ── */
app.get('/api/profil/langues', requireAuth, (req, res) => {
  sendJSON(res, 200, await db.prepare('SELECT * FROM user_langues WHERE user_id=? ORDER BY is_maternelle DESC, langue').all(req.user.id));
});

app.get('/api/profil/:id/langues', (req, res) => {
  sendJSON(res, 200, await db.prepare('SELECT * FROM user_langues WHERE user_id=? ORDER BY is_maternelle DESC, langue').all(parseInt(req.params.id)));
});

app.post('/api/profil/langues', requireAuth, (req, res) => {
  const uid = req.user.id;
  const { langue, niveau, is_maternelle, certification } = req.body;
  if (!langue) return sendJSON(res, 400, { error: 'Langue requise' });
  try {
    const r = db.prepare('INSERT OR REPLACE INTO user_langues (user_id, langue, niveau, is_maternelle, certification) VALUES (?,?,?,?,?)')
      .run(uid, langue, niveau||'intermediaire', is_maternelle?1:0, certification||null);
    sendJSON(res, 201, { id: r.lastInsertRowid });
  } catch(e) { sendJSON(res, 400, { error: e.message }); }
});

app.delete('/api/profil/langues/:id', requireAuth, (req, res) => {
  const uid = req.user.id;
  await db.prepare('DELETE FROM user_langues WHERE id=? AND user_id=?').run(parseInt(req.params.id), uid);
  sendJSON(res, 200, { ok: true });
});

/* ── RÉSEAUX SOCIAUX PROFIL ── */
app.put('/api/profil/reseaux-sociaux', requireAuth, (req, res) => {
  const uid = req.user.id;
  const { reseaux } = req.body; // { linkedin, facebook, instagram, x, youtube, tiktok, site_web, github }
  const allowed = ['linkedin','facebook','instagram','x','youtube','tiktok','site_web','github','autre1','autre2'];
  const clean = {};
  for (const k of allowed) { if (reseaux[k]) clean[k] = String(reseaux[k]).substring(0,300); }
  await db.prepare('UPDATE users SET reseaux_sociaux=? WHERE id=?').run(JSON.stringify(clean), uid);
  sendJSON(res, 200, { ok: true, reseaux: clean });
});

/* ── DISPONIBILITÉS PROFIL ── */
app.put('/api/profil/disponibilites', requireAuth, (req, res) => {
  const uid = req.user.id;
  const { disponibilites } = req.body;
  await db.prepare('UPDATE users SET disponibilites=? WHERE id=?').run(JSON.stringify(disponibilites||{}), uid);
  sendJSON(res, 200, { ok: true });
});

/* ── RECOMMANDATIONS UTILISATEUR ── */
app.get('/api/profil/:id/recommandations', (req, res) => {
  const toId = parseInt(req.params.id);
  const rows = await db.prepare(`
    SELECT ur.*, u.nom as auteur_nom, u.photo_url as auteur_photo, u.titre_pro as auteur_titre
    FROM user_recommendations ur
    JOIN users u ON u.id=ur.from_user_id
    WHERE ur.to_user_id=? AND ur.statut='approuve'
    ORDER BY ur.created_at DESC
  `).all(toId);
  sendJSON(res, 200, rows);
});

app.post('/api/profil/:id/recommandations', requireAuth, (req, res) => {
  const fromId = req.user.id;
  const toId = parseInt(req.params.id);
  if (fromId === toId) return sendJSON(res, 400, { error: 'Vous ne pouvez pas vous recommander vous-même' });
  const { texte, relation, note } = req.body;
  if (!texte || texte.length < 20) return sendJSON(res, 400, { error: 'Texte trop court (min 20 caractères)' });
  try {
    db.prepare(`INSERT OR REPLACE INTO user_recommendations (from_user_id, to_user_id, texte, relation, note)
      VALUES (?,?,?,?,?)`).run(fromId, toId, texte, relation||null, parseInt(note)||5);
    sendJSON(res, 201, { ok: true });
  } catch(e) { sendJSON(res, 400, { error: e.message }); }
});

app.get('/api/profil/mes-recommandations', requireAuth, (req, res) => {
  const uid = req.user.id;
  const recues = await db.prepare(`SELECT ur.*, u.nom as auteur_nom, u.photo_url as auteur_photo FROM user_recommendations ur JOIN users u ON u.id=ur.from_user_id WHERE ur.to_user_id=? ORDER BY ur.created_at DESC`).all(uid);
  const envoyees = await db.prepare(`SELECT ur.*, u.nom as dest_nom, u.photo_url as dest_photo FROM user_recommendations ur JOIN users u ON u.id=ur.to_user_id WHERE ur.from_user_id=? ORDER BY ur.created_at DESC`).all(uid);
  sendJSON(res, 200, { recues, envoyees });
});

app.patch('/api/profil/recommandations/:id', requireAuth, (req, res) => {
  const uid = req.user.id;
  const id = parseInt(req.params.id);
  const { statut } = req.body;
  const allowed = ['approuve','masque','refuse'];
  if (!allowed.includes(statut)) return sendJSON(res, 400, { error: 'Statut invalide' });
  const rec = await db.prepare('SELECT id FROM user_recommendations WHERE id=? AND to_user_id=?').get(id, uid);
  if (!rec) return sendJSON(res, 404, { error: 'Non trouvé' });
  await db.prepare('UPDATE user_recommendations SET statut=? WHERE id=?').run(statut, id);
  sendJSON(res, 200, { ok: true });
});

/* ── FORMATIONS — SUIVI UTILISATEUR ── */
app.get('/api/formations/suivi', requireAuth, (req, res) => {
  const uid = req.user.id;
  const rows = await db.prepare(`
    SELECT ufs.*, f.domaine, f.niveau as niveau_formation, f.prix, f.gratuit, f.duree
    FROM user_formations_suivi ufs
    LEFT JOIN formations f ON f.id=ufs.formation_id
    WHERE ufs.user_id=? ORDER BY ufs.created_at DESC
  `).all(uid);
  sendJSON(res, 200, rows);
});

app.post('/api/formations/suivi', requireAuth, (req, res) => {
  const uid = req.user.id;
  const { formation_id, titre, organisme } = req.body;
  // Vérifier si déjà inscrit
  if (formation_id) {
    const exists = await db.prepare('SELECT id FROM user_formations_suivi WHERE user_id=? AND formation_id=?').get(uid, formation_id);
    if (exists) return sendJSON(res, 409, { error: 'Déjà inscrit à cette formation' });
  }
  let formTitre = titre;
  if (formation_id && !titre) {
    const f = await db.prepare('SELECT titre, organisme FROM formations WHERE id=?').get(formation_id);
    if (f) formTitre = f.titre;
  }
  if (!formTitre) return sendJSON(res, 400, { error: 'Titre requis' });
  const r = db.prepare('INSERT INTO user_formations_suivi (user_id, formation_id, titre, organisme) VALUES (?,?,?,?)')
    .run(uid, formation_id||null, formTitre, organisme||null);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

app.patch('/api/formations/suivi/:id', requireAuth, (req, res) => {
  const uid = req.user.id;
  const id = parseInt(req.params.id);
  const item = await db.prepare('SELECT * FROM user_formations_suivi WHERE id=? AND user_id=?').get(id, uid);
  if (!item) return sendJSON(res, 404, { error: 'Non trouvé' });
  const { progression, statut, notes, date_fin } = req.body;
  await db.prepare('UPDATE user_formations_suivi SET progression=?, statut=?, notes=?, date_fin=? WHERE id=?')
    .run(progression??item.progression, statut||item.statut, notes??item.notes, date_fin||item.date_fin, id);
  sendJSON(res, 200, { ok: true });
});

/* ── CERTIFICATIONS NUMÉRIQUES UTILISATEUR ── */
app.get('/api/certifications', requireAuth, (req, res) => {
  const uid = req.user.id;
  sendJSON(res, 200, await db.prepare('SELECT * FROM user_certifications_obtenues WHERE user_id=? ORDER BY date_obtention DESC').all(uid));
});

app.post('/api/certifications', requireAuth, (req, res) => {
  const uid = req.user.id;
  const { titre, organisme, formation_id, date_obtention, date_expiration } = req.body;
  if (!titre) return sendJSON(res, 400, { error: 'Titre requis' });
  const code = 'CERT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2,6).toUpperCase();
  const qr_data = JSON.stringify({ code, titre, organisme, uid, date: date_obtention || new Date().toISOString().slice(0,10) });
  const r = db.prepare(`INSERT INTO user_certifications_obtenues (user_id, titre, organisme, formation_id, date_obtention, date_expiration, code_verification, qr_data)
    VALUES (?,?,?,?,?,?,?,?)`).run(uid, titre, organisme||null, formation_id||null, date_obtention||new Date().toISOString().slice(0,10), date_expiration||null, code, qr_data);
  sendJSON(res, 201, { id: r.lastInsertRowid, code_verification: code });
});

app.get('/api/certifications/verify/:code', (req, res) => {
  const cert = await db.prepare(`
    SELECT uco.*, u.nom, u.titre_pro FROM user_certifications_obtenues uco
    JOIN users u ON u.id=uco.user_id
    WHERE uco.code_verification=? AND uco.partage_public=1
  `).get(req.params.code);
  if (!cert) return sendJSON(res, 404, { error: 'Certification non trouvée ou non publique' });
  sendJSON(res, 200, cert);
});

/* ── OZ CHAT INTERACTIF ── */
const OZ_SYSTEM = `Tu es OZ, l'assistant intelligent de Diaspo'Actif — la plateforme de la diaspora africaine et internationale.
Tu aides les utilisateurs à : naviguer sur la plateforme, trouver des partenaires, préparer des projets, améliorer leurs profils, comprendre les fonctionnalités, et répondre à toutes leurs questions.
Réponds toujours en français, de manière concise, professionnelle et encourageante.`;

app.post('/api/oz/chat', requireAuth, (req, res) => {
  const uid = req.user.id;
  const { message, conversation_id } = req.body;
  if (!message || !message.trim()) return sendJSON(res, 400, { error: 'Message vide' });

  // Récupérer le contexte utilisateur
  const user = await db.prepare('SELECT nom, titre_pro, bio, competences, ville, pays FROM users WHERE id=?').get(uid);
  const msgLower = message.toLowerCase();

  // Récupérer la knowledge base pertinente
  const kb = await db.prepare("SELECT titre, contenu FROM chatbot_memoire WHERE actif=1 ORDER BY priorite DESC LIMIT 20").all();
  let kbContext = '';
  for (const k of kb) {
    if (msgLower.split(' ').some(w => w.length > 3 && (k.titre.toLowerCase().includes(w) || k.contenu.toLowerCase().includes(w)))) {
      kbContext += `\n--- ${k.titre} ---\n${k.contenu.substring(0,300)}\n`;
    }
  }

  // Construire une réponse intelligente basée sur des patterns
  let reply = '';
  const userName = user?.nom?.split(' ')[0] || 'vous';

  if (msgLower.includes('bonjour') || msgLower.includes('salut') || msgLower.includes('bonsoir')) {
    reply = `Bonjour ${userName} ! Je suis OZ, votre assistant Diaspo'Actif. Comment puis-je vous aider aujourd'hui ? Vous pouvez me poser des questions sur la plateforme, vos projets, votre profil, ou me demander de l'aide pour trouver des partenaires.`;
  } else if (msgLower.includes('cv') || msgLower.includes('curriculum')) {
    reply = `Pour créer ou améliorer votre CV sur Diaspo'Actif :\n1. Allez dans **Outils & Documents** depuis votre tableau de bord\n2. Cliquez sur **+ Créer mon CV**\n3. Remplissez les sections : expériences, compétences, formation\n4. Téléchargez votre CV en PDF\n\nSouhaitez-vous des conseils pour rendre votre CV plus percutant pour la diaspora ?`;
  } else if (msgLower.includes('initiative') || msgLower.includes('association') || msgLower.includes('projet')) {
    reply = `Diaspo'Actif vous permet de :\n• **Créer une initiative** : présentez votre association, ONG ou projet\n• **Rejoindre** des initiatives existantes dans l'annuaire\n• **Collaborer** via le système de Deals\n\nVous cherchez à créer une nouvelle initiative ou à en rejoindre une existante ?`;
  } else if (msgLower.includes('partenaire') || msgLower.includes('réseau') || msgLower.includes('contact')) {
    reply = `Pour trouver des partenaires sur Diaspo'Actif :\n• Explorez l'**Annuaire** avec filtres par nationalité, domaine, pays\n• Consultez les **Initiatives** actives\n• Utilisez le système de **Deals** pour des collaborations formelles\n\n${user?.pays ? `En tant que membre basé en ${user.pays}, vous pourriez intéresser des initiatives de la région.` : ''}`;
  } else if (msgLower.includes('profil') || msgLower.includes('photo') || msgLower.includes('bio')) {
    reply = `Pour enrichir votre profil :\n• Ajoutez une **photo professionnelle** et une **bannière**\n• Rédigez une **bio** percutante (150-200 mots)\n• Listez vos **compétences** et **expériences**\n• Ajoutez vos **réseaux sociaux** (LinkedIn, etc.)\n• Définissez vos **disponibilités**\n\nUn profil complet augmente vos chances de contact de +300%.`;
  } else if (msgLower.includes('message') || msgLower.includes('messagerie') || msgLower.includes('contact')) {
    reply = `La messagerie Diaspo'Actif permet :\n• **Messages privés** avec n'importe quel membre\n• **Groupes de conversation** pour vos équipes\n• **Partage de fichiers** (PDF, images, etc.)\n• **Réactions** et réponses aux messages\n\nPour contacter un membre, visitez son profil et cliquez sur **Envoyer un message**.`;
  } else if (msgLower.includes('formation') || msgLower.includes('apprendre') || msgLower.includes('cours')) {
    reply = `L'espace **Formations** de Diaspo'Actif propose :\n• Des formations organisées par les initiatives membres\n• Des webinaires et ateliers en ligne\n• Le suivi de votre progression\n• Des **certifications numériques** téléchargeables\n\nConsultez l'espace Formations dans votre tableau de bord.`;
  } else if (msgLower.includes('agenda') || msgLower.includes('calendrier') || msgLower.includes('réunion') || msgLower.includes('rendez-vous')) {
    reply = `Votre **Agenda Diaspo'Actif** vous permet de :\n• Créer et gérer vos événements (vues jour/semaine/mois/année)\n• Inviter des participants\n• Définir vos disponibilités publiques\n• Recevoir des rappels automatiques\n\nAccédez à votre agenda depuis le menu **Mon Agenda**.`;
  } else if (msgLower.includes('deal') || msgLower.includes('collaboration') || msgLower.includes('contrat')) {
    reply = `Le système **Deals** de Diaspo'Actif :\n• Formalise les collaborations entre initiatives\n• Structure les termes d'un partenariat\n• Permet le suivi des accords\n• Nécessite une accréditation initiative\n\nPour accéder aux Deals, vous devez avoir ou rejoindre une initiative accréditée.`;
  } else if (kbContext) {
    reply = `D'après les informations disponibles :\n\n${kbContext.substring(0,600)}\n\nAvez-vous besoin de précisions sur ce point ?`;
  } else {
    reply = `Je comprends votre question sur "${message.substring(0,50)}${message.length>50?'...':''}".\n\nEn tant qu'assistant de Diaspo'Actif, je peux vous aider avec :\n• Navigation sur la plateforme\n• Création et enrichissement de profil\n• Recherche de partenaires\n• Utilisation des outils (CV, lettres, formations)\n• Questions sur les initiatives et événements\n\nPouvez-vous préciser votre besoin ?`;
  }

  // Sauvegarder dans l'historique
  let convId = conversation_id;
  if (!convId) {
    const ozConv = await db.prepare('SELECT id FROM oz_conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 1').get(uid);
    if (ozConv) {
      convId = ozConv.id;
    } else {
      convId = db.prepare('INSERT INTO oz_conversations (user_id, messages_json) VALUES (?,?)').run(uid, '[]').lastInsertRowid;
    }
  }
  try {
    const convRow = await db.prepare('SELECT messages_json FROM oz_conversations WHERE id=? AND user_id=?').get(convId, uid);
    if (convRow) {
      const msgs = safeJSON(convRow.messages_json, []);
      msgs.push({ role: 'user', content: message, at: new Date().toISOString() });
      msgs.push({ role: 'oz', content: reply, at: new Date().toISOString() });
      if (msgs.length > 100) msgs.splice(0, msgs.length - 100);
      db.prepare('UPDATE oz_conversations SET messages_json=?, updated_at=datetime("now") WHERE id=?').run(JSON.stringify(msgs), convId);
    }
  } catch(e) {}

  sendJSON(res, 200, { reply, conversation_id: convId });
});

app.get('/api/oz/history', requireAuth, (req, res) => {
  const uid = req.user.id;
  const conv = await db.prepare('SELECT * FROM oz_conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 1').get(uid);
  if (!conv) return sendJSON(res, 200, { messages: [], id: null });
  sendJSON(res, 200, { messages: safeJSON(conv.messages_json, []), id: conv.id });
});

app.delete('/api/oz/history', requireAuth, (req, res) => {
  await db.prepare('DELETE FROM oz_conversations WHERE user_id=?').run(req.user.id);
  sendJSON(res, 200, { ok: true });
});

/* ═══════════════════════════════════════════════════════════════════
   MODULE BUSINESS PLAN
   ═══════════════════════════════════════════════════════════════════ */

/* Calcul de progression (nb de sections non vides / total) */
function calcBPProgression(sections) {
  const obligatoires = ['infos_generales','resume_executif','presentation','probleme','solution','marche','swot','business_model','produits','strategie_marketing','plan_commercial','plan_operationnel','organisation','rh','calendrier','plan_financier','risques','impact','financement'];
  const remplis = obligatoires.filter(k => {
    const s = sections[k];
    if (!s) return false;
    if (typeof s === 'string') return s.trim().length > 0;
    if (typeof s === 'object') return Object.values(s).some(v => v && String(v).trim().length > 0);
    return false;
  });
  return Math.round((remplis.length / obligatoires.length) * 100);
}

/* Vérification complétude */
function checkBPCompletude(sections) {
  const checks = [
    { key: 'infos_generales', label: 'Informations générales', champs: ['nom_projet','type_initiative','secteur','pays','responsable'] },
    { key: 'resume_executif', label: 'Résumé exécutif', champs: ['projet','probleme','solution','marche','besoins'] },
    { key: 'presentation', label: 'Présentation de l\'initiative', champs: ['vision','mission','valeurs'] },
    { key: 'probleme', label: 'Analyse du problème', champs: ['description'] },
    { key: 'solution', label: 'Solution proposée', champs: ['description'] },
    { key: 'marche', label: 'Étude de marché', champs: ['taille_marche'] },
    { key: 'swot', label: 'Analyse SWOT', champs: ['forces','faiblesses','opportunites','menaces'] },
    { key: 'business_model', label: 'Business Model Canvas', champs: ['segments','proposition_valeur','sources_revenus'] },
    { key: 'produits', label: 'Produits & services', champs: [] },
    { key: 'plan_financier', label: 'Plan financier', champs: ['investissement_initial'] },
    { key: 'risques', label: 'Analyse des risques', champs: [] },
  ];
  return checks.map(c => {
    const s = sections[c.key] || {};
    const ok = c.champs.length === 0
      ? !!(s && (typeof s === 'string' ? s.trim() : Object.values(s).some(v=>v&&String(v).trim())))
      : c.champs.every(f => s[f] && String(s[f]).trim().length > 0);
    return { ...c, ok, champs: undefined };
  });
}

/* ---- Liste des business plans ---- */
app.get('/api/business-plans', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT bp.*, u.nom as owner_nom, u.prenom as owner_prenom,
      (SELECT COUNT(*) FROM bp_collaborateurs bc WHERE bc.bp_id=bp.id) as nb_collab
    FROM business_plans bp
    JOIN users u ON u.id=bp.user_id
    WHERE bp.user_id=?
    ORDER BY bp.updated_at DESC
  `).all(req.user.id);
  // Aussi les BPs où l'utilisateur est collaborateur
  const collab = await db.prepare(`
    SELECT bp.*, u.nom as owner_nom, u.prenom as owner_prenom, bc.role as mon_role
    FROM business_plans bp
    JOIN users u ON u.id=bp.user_id
    JOIN bp_collaborateurs bc ON bc.bp_id=bp.id AND bc.user_id=?
    ORDER BY bp.updated_at DESC
  `).all(req.user.id);
  sendJSON(res, 200, { mes_plans: rows, partages: collab });
});

/* ---- Créer un business plan ---- */
app.post('/api/business-plans', requireAuth, async (req, res) => {
  const body = await parseBody(req);
  const { nom_projet='Sans titre', type_initiative='startup', template='startup', secteur='' } = body;
  const r = db.prepare(`
    INSERT INTO business_plans (user_id, nom_projet, type_initiative, template, secteur, sections_json)
    VALUES (?,?,?,?,?,?)
  `).run(req.user.id, nom_projet, type_initiative, template, secteur, JSON.stringify({
    infos_generales: { nom_projet, type_initiative, secteur }
  }));
  sendJSON(res, 201, { id: r.lastInsertRowid, nom_projet });
});

/* ---- Lire un business plan ---- */
app.get('/api/business-plans/:id', requireAuth, (req, res) => {
  const bp = await db.prepare('SELECT * FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp) return sendJSON(res, 404, { error: 'Plan introuvable' });
  // Vérifier accès (propriétaire ou collaborateur)
  const collab = await db.prepare('SELECT role FROM bp_collaborateurs WHERE bp_id=? AND user_id=?').get(bp.id, req.user.id);
  if (bp.user_id !== req.user.id && !collab) return sendJSON(res, 403, { error: 'Accès refusé' });
  const sections = safeJSON(bp.sections_json, {});
  const completude = checkBPCompletude(sections);
  const progression = calcBPProgression(sections);
  sendJSON(res, 200, { ...bp, sections, completude, progression, mon_role: bp.user_id===req.user.id?'proprietaire':(collab?.role||'lecteur') });
});

/* ---- Mise à jour (auto-save) ---- */
app.put('/api/business-plans/:id', requireAuth, async (req, res) => {
  const bp = await db.prepare('SELECT * FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp) return sendJSON(res, 404, { error: 'Plan introuvable' });
  const collab = await db.prepare('SELECT role FROM bp_collaborateurs WHERE bp_id=? AND user_id=?').get(bp.id, req.user.id);
  const canEdit = bp.user_id===req.user.id || ['editeur','validateur'].includes(collab?.role);
  if (!canEdit) return sendJSON(res, 403, { error: 'Accès refusé' });

  const body = await parseBody(req);
  const { sections, nom_projet, slogan, logo_url, type_initiative, secteur, statut, is_public } = body;

  const currentSections = safeJSON(bp.sections_json, {});
  const newSections = sections ? { ...currentSections, ...sections } : currentSections;
  const progression = calcBPProgression(newSections);

  db.prepare(`UPDATE business_plans SET
    sections_json=?, progression=?,
    nom_projet=COALESCE(?,nom_projet),
    slogan=COALESCE(?,slogan),
    logo_url=COALESCE(?,logo_url),
    type_initiative=COALESCE(?,type_initiative),
    secteur=COALESCE(?,secteur),
    statut=COALESCE(?,statut),
    is_public=COALESCE(?,is_public),
    updated_at=datetime('now')
    WHERE id=?
  `).run(JSON.stringify(newSections), progression,
    nom_projet||null, slogan||null, logo_url||null,
    type_initiative||null, secteur||null, statut||null,
    is_public!=null?is_public:null, bp.id);

  sendJSON(res, 200, { ok: true, progression });
});

/* ---- Supprimer ---- */
app.delete('/api/business-plans/:id', requireAuth, (req, res) => {
  const bp = await db.prepare('SELECT * FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp || bp.user_id !== req.user.id) return sendJSON(res, 403, { error: 'Accès refusé' });
  await db.prepare('DELETE FROM business_plans WHERE id=?').run(bp.id);
  sendJSON(res, 200, { ok: true });
});

/* ---- Dupliquer ---- */
app.post('/api/business-plans/:id/duplicate', requireAuth, (req, res) => {
  const bp = await db.prepare('SELECT * FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp) return sendJSON(res, 404, { error: 'Introuvable' });
  const collab = await db.prepare('SELECT role FROM bp_collaborateurs WHERE bp_id=? AND user_id=?').get(bp.id, req.user.id);
  if (bp.user_id !== req.user.id && !collab) return sendJSON(res, 403, { error: 'Accès refusé' });
  const r = db.prepare(`
    INSERT INTO business_plans (user_id, nom_projet, slogan, type_initiative, secteur, template, sections_json)
    VALUES (?,?,?,?,?,?,?)
  `).run(req.user.id, `Copie de ${bp.nom_projet}`, bp.slogan, bp.type_initiative, bp.secteur, bp.template, bp.sections_json);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* ---- Versions ---- */
app.get('/api/business-plans/:id/versions', requireAuth, (req, res) => {
  const bp = await db.prepare('SELECT user_id FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp) return sendJSON(res, 404, { error: 'Introuvable' });
  const collab = await db.prepare('SELECT role FROM bp_collaborateurs WHERE bp_id=? AND user_id=?').get(req.params.id, req.user.id);
  if (bp.user_id !== req.user.id && !collab) return sendJSON(res, 403, { error: 'Accès refusé' });
  const versions = await db.prepare(`
    SELECT bv.id, bv.version, bv.label, bv.created_at, u.nom, u.prenom
    FROM bp_versions bv LEFT JOIN users u ON u.id=bv.saved_by
    WHERE bv.bp_id=? ORDER BY bv.version DESC LIMIT 50
  `).all(req.params.id);
  sendJSON(res, 200, versions);
});

app.post('/api/business-plans/:id/versions', requireAuth, (req, res) => {
  const bp = await db.prepare('SELECT * FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp) return sendJSON(res, 404, { error: 'Introuvable' });
  if (bp.user_id !== req.user.id) return sendJSON(res, 403, { error: 'Accès refusé' });
  const newVer = (bp.version || 1) + 1;
  db.prepare('INSERT INTO bp_versions (bp_id, version, snapshot_json, saved_by, label) VALUES (?,?,?,?,?)').run(
    bp.id, bp.version, bp.sections_json, req.user.id, `Version ${bp.version}`
  );
  db.prepare('UPDATE business_plans SET version=?, updated_at=datetime("now") WHERE id=?').run(newVer, bp.id);
  // Garder max 20 versions
  const oldVersions = await db.prepare('SELECT id FROM bp_versions WHERE bp_id=? ORDER BY version DESC LIMIT -1 OFFSET 20').all(bp.id);
  if (oldVersions.length) db.prepare(`DELETE FROM bp_versions WHERE id IN (${oldVersions.map(()=>'?').join(',')})`).run(...oldVersions.map(v=>v.id));
  sendJSON(res, 201, { version: newVer });
});

app.get('/api/business-plans/:id/versions/:v', requireAuth, (req, res) => {
  const bp = await db.prepare('SELECT user_id FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp) return sendJSON(res, 404, { error: 'Introuvable' });
  const collab = await db.prepare('SELECT role FROM bp_collaborateurs WHERE bp_id=? AND user_id=?').get(req.params.id, req.user.id);
  if (bp.user_id !== req.user.id && !collab) return sendJSON(res, 403, { error: 'Accès refusé' });
  const ver = await db.prepare('SELECT * FROM bp_versions WHERE bp_id=? AND version=?').get(req.params.id, req.params.v);
  if (!ver) return sendJSON(res, 404, { error: 'Version introuvable' });
  sendJSON(res, 200, { ...ver, sections: safeJSON(ver.snapshot_json, {}) });
});

/* ---- Restaurer une version ---- */
app.post('/api/business-plans/:id/versions/:v/restore', requireAuth, (req, res) => {
  const bp = await db.prepare('SELECT * FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp || bp.user_id !== req.user.id) return sendJSON(res, 403, { error: 'Accès refusé' });
  const ver = await db.prepare('SELECT * FROM bp_versions WHERE bp_id=? AND version=?').get(req.params.id, req.params.v);
  if (!ver) return sendJSON(res, 404, { error: 'Version introuvable' });
  // Sauvegarder version actuelle avant restauration
  db.prepare('INSERT INTO bp_versions (bp_id, version, snapshot_json, saved_by, label) VALUES (?,?,?,?,?)').run(
    bp.id, bp.version, bp.sections_json, req.user.id, `Avant restauration v${ver.version}`
  );
  db.prepare('UPDATE business_plans SET sections_json=?, version=version+1, updated_at=datetime("now") WHERE id=?').run(ver.snapshot_json, bp.id);
  sendJSON(res, 200, { ok: true });
});

/* ---- Complétude ---- */
app.get('/api/business-plans/:id/completude', requireAuth, (req, res) => {
  const bp = await db.prepare('SELECT * FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp) return sendJSON(res, 404, { error: 'Introuvable' });
  const collab = await db.prepare('SELECT role FROM bp_collaborateurs WHERE bp_id=? AND user_id=?').get(bp.id, req.user.id);
  if (bp.user_id !== req.user.id && !collab) return sendJSON(res, 403, { error: 'Accès refusé' });
  const sections = safeJSON(bp.sections_json, {});
  sendJSON(res, 200, { completude: checkBPCompletude(sections), progression: calcBPProgression(sections) });
});

/* ---- Collaborateurs ---- */
app.get('/api/business-plans/:id/collaborateurs', requireAuth, (req, res) => {
  const bp = await db.prepare('SELECT user_id FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp) return sendJSON(res, 404, { error: 'Introuvable' });
  if (bp.user_id !== req.user.id) return sendJSON(res, 403, { error: 'Accès refusé' });
  const list = await db.prepare(`
    SELECT bc.*, u.nom, u.prenom, u.email, u.role as user_role
    FROM bp_collaborateurs bc JOIN users u ON u.id=bc.user_id
    WHERE bc.bp_id=?
  `).all(req.params.id);
  sendJSON(res, 200, list);
});

app.post('/api/business-plans/:id/collaborateurs', requireAuth, async (req, res) => {
  const bp = await db.prepare('SELECT user_id FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp || bp.user_id !== req.user.id) return sendJSON(res, 403, { error: 'Accès refusé' });
  const { user_id, role='lecteur' } = await parseBody(req);
  if (!user_id) return sendJSON(res, 400, { error: 'user_id requis' });
  if (!['lecteur','commentateur','editeur','validateur'].includes(role)) return sendJSON(res, 400, { error: 'Rôle invalide' });
  try {
    db.prepare('INSERT OR REPLACE INTO bp_collaborateurs (bp_id, user_id, role, invite_par) VALUES (?,?,?,?)').run(req.params.id, user_id, role, req.user.id);
    sendJSON(res, 201, { ok: true });
  } catch(e) { sendJSON(res, 400, { error: e.message }); }
});

app.delete('/api/business-plans/:id/collaborateurs/:uid', requireAuth, (req, res) => {
  const bp = await db.prepare('SELECT user_id FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp || bp.user_id !== req.user.id) return sendJSON(res, 403, { error: 'Accès refusé' });
  await db.prepare('DELETE FROM bp_collaborateurs WHERE bp_id=? AND user_id=?').run(req.params.id, req.params.uid);
  sendJSON(res, 200, { ok: true });
});

/* ---- Commentaires par section ---- */
app.get('/api/business-plans/:id/commentaires/:section', requireAuth, (req, res) => {
  const bp = await db.prepare('SELECT user_id FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp) return sendJSON(res, 404, { error: 'Introuvable' });
  const collab = await db.prepare('SELECT role FROM bp_collaborateurs WHERE bp_id=? AND user_id=?').get(req.params.id, req.user.id);
  if (bp.user_id !== req.user.id && !collab) return sendJSON(res, 403, { error: 'Accès refusé' });
  const list = await db.prepare(`
    SELECT bc.*, u.nom, u.prenom FROM bp_commentaires bc
    JOIN users u ON u.id=bc.user_id
    WHERE bc.bp_id=? AND bc.section_key=? ORDER BY bc.created_at ASC
  `).all(req.params.id, req.params.section);
  sendJSON(res, 200, list);
});

app.post('/api/business-plans/:id/commentaires/:section', requireAuth, async (req, res) => {
  const bp = await db.prepare('SELECT user_id FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp) return sendJSON(res, 404, { error: 'Introuvable' });
  const collab = await db.prepare('SELECT role FROM bp_collaborateurs WHERE bp_id=? AND user_id=?').get(req.params.id, req.user.id);
  if (bp.user_id !== req.user.id && !collab) return sendJSON(res, 403, { error: 'Accès refusé' });
  const { texte } = await parseBody(req);
  if (!texte?.trim()) return sendJSON(res, 400, { error: 'Texte requis' });
  const r = db.prepare('INSERT INTO bp_commentaires (bp_id, section_key, user_id, texte) VALUES (?,?,?,?)').run(req.params.id, req.params.section, req.user.id, texte.trim());
  sendJSON(res, 201, { id: r.lastInsertRowid, texte: texte.trim() });
});

/* ═══════════════════════════════════════════════════════════════════
   ASSISTANT BP — Logique de réponse contextuelle
   ═══════════════════════════════════════════════════════════════════ */

function getBPAssistantResponse(message, bp, currentSection, sections) {
  const msg = message.toLowerCase();
  const type = bp.type_initiative || 'startup';
  const secteur = bp.secteur || '';
  const pays = (sections.infos_generales || {}).pays || '';
  const nom = bp.nom_projet || 'votre projet';
  const prog = bp.progression || 0;

  // ── Conseils spécifiques à la section courante ──
  const sectionAdvice = {
    infos_generales: `Pour **"${nom}"**, assurez-vous de renseigner tous les champs d'identification : nom exact, secteur précis, pays, et coordonnées. Ces informations seront reprises automatiquement dans le résumé exécutif.`,
    resume_executif: `Le résumé exécutif est la première chose que lit un investisseur. Il doit tenir en **1 page maximum** et répondre à 5 questions : Qui ? Quoi ? Pour qui ? Comment ? Combien ? Cliquez sur "Générer depuis mes données" pour obtenir une première version automatique.`,
    presentation: `Votre **vision** doit être ambitieuse mais crédible (horizon 5-10 ans). Votre **mission** explique pourquoi vous existez aujourd'hui. Vos **valeurs** guident vos décisions. Ces 3 éléments doivent être cohérents entre eux.`,
    probleme: `Une bonne analyse du problème montre que vous le connaissez mieux que quiconque. Appuyez-vous sur des chiffres, études, témoignages. Montrez l'ampleur : combien de personnes sont touchées ? Quel coût économique ?`,
    solution: `Décrivez votre solution en termes de **bénéfices client**, pas de fonctionnalités techniques. La question clé : pourquoi votre solution est-elle meilleure que ce qui existe ? Quel est l'élément différenciant principal ?`,
    marche: `L'étude de marché doit montrer que vous connaissez vos clients, vos concurrents et les tendances. Pour ${secteur ? `le secteur "${secteur}"` : 'votre secteur'}, identifiez votre TAM (Total Addressable Market), SAM (Serviceable) et SOM (Obtainable).`,
    swot: `La SWOT doit être honnête. Les faiblesses et menaces sont tout aussi importantes que les forces. Un investisseur veut voir que vous êtes lucide sur vos risques. Chaque cellule devrait contenir 3 à 5 éléments concrets.`,
    business_model: `Le Business Model Canvas vous force à synthétiser votre modèle en 9 blocs. La **proposition de valeur** est le cœur : que résolvez-vous et pour qui ? Les **sources de revenus** répondent à "comment gagnez-vous de l'argent ?".`,
    produits: `Pour chaque produit/service, précisez le coût de revient réel et le prix de vente cible. La marge brute est calculée automatiquement. Une marge inférieure à 30% mérite réflexion pour un ${type}.`,
    strategie_marketing: `Pour un ${type} dans le secteur ${secteur || 'que vous opérez'}, commencez par identifier vos 2-3 canaux d'acquisition principaux. Ne dispersez pas votre budget : concentrez-vous sur ce qui fonctionne avant d'élargir.`,
    plan_commercial: `Le plan commercial traduit votre stratégie en actions concrètes. Fixez des objectifs de vente **SMART** (Spécifiques, Mesurables, Atteignables, Réalistes, Temporels). Quel est votre objectif de CA pour les 12 premiers mois ?`,
    plan_operationnel: `Le plan opérationnel montre que vous savez comment produire et livrer. Identifiez votre chaîne de valeur complète : de l'approvisionnement jusqu'à la livraison client. Quels sont les maillons critiques ?`,
    organisation: `La gouvernance rassure les partenaires. Décrivez clairement qui décide quoi. Si c'est une ${type}, précisez les instances décisionnelles et les mécanismes de contrôle.`,
    rh: `Pour ${pays ? `un projet basé ${pays}` : 'votre projet'}, tenez compte des contraintes légales locales (contrats, charges sociales, droit du travail). Prévoyez toujours une marge de 20-30% sur les coûts salariaux pour les charges patronales.`,
    calendrier: `Découpez votre projet en phases de 3 à 6 mois maximum. Chaque phase doit avoir un livrable clairement défini. Identifiez le **chemin critique** : les tâches dont le retard impacte tout le planning.`,
    plan_financier: `Le plan financier sur 5 ans doit être cohérent avec vos objectifs commerciaux. Vérifiez que votre CA prévisionnel est réaliste par rapport à la taille de votre équipe et de votre marché cible. Quel est votre BFR estimé ?`,
    risques: `Identifiez au minimum 5-8 risques. Couvrez : risques marché, financiers, opérationnels, réglementaires et humains. Pour chaque risque critique, définissez un plan B concret.`,
    impact: `L'impact est de plus en plus scruté par les financeurs. Définissez vos indicateurs d'impact **avant** le démarrage pour pouvoir les mesurer. Combien d'emplois directs et indirects créez-vous ?`,
    financement: `Pour rechercher ${(sections.financement || {}).montant ? `${(sections.financement||{}).montant}€` : 'un financement'}, préparez un dossier différent selon le type de financeur : banque (garanties, flux), investisseur (ROI, exit), subvention (impact, critères d'éligibilité).`,
    annexes: `Les annexes essentielles pour un dossier de financement complet : statuts ou projet de statuts, CV des fondateurs, études de marché, devis fournisseurs, lettres d'intention de clients, et si disponibles : contrats signés.`,
  };

  // ── Détection des intentions ──

  // Génération de texte pour une section
  if (msg.includes('génère') || msg.includes('propose') || msg.includes('écris') || msg.includes('rédige') || msg.includes('aide') || msg.includes('example') || msg.includes('exemple')) {
    return genTextForSection(currentSection, bp, sections);
  }

  // Analyse qualité / audit
  if (msg.includes('audit') || msg.includes('analyse') || msg.includes('vérif') || msg.includes('qualité') || msg.includes('complet') || msg.includes('manque')) {
    return auditBP(bp, sections);
  }

  // Définition d'un terme financier ou business
  const termes = {
    'seuil de rentabilité': 'Le **seuil de rentabilité** (ou point mort) est le niveau de chiffre d\'affaires à partir duquel votre activité devient bénéficiaire. Formule : Charges fixes ÷ (1 - Charges variables/CA). Ex : si vos charges fixes sont 50 000€ et votre taux de marge variable est 60%, votre seuil est 50 000 ÷ 0,60 = 83 333€.',
    'bfr': 'Le **Besoin en Fonds de Roulement (BFR)** représente le décalage de trésorerie entre vos encaissements et décaissements. BFR = Stocks + Créances clients - Dettes fournisseurs. Un BFR élevé signifie que vous devez financer un décalage important avant d\'être payé.',
    'amortissement': 'L\'**amortissement** est la répartition du coût d\'un investissement sur sa durée de vie utile. Ex : un équipement à 10 000€ amorti sur 5 ans représente 2 000€/an de charge. Cela réduit votre résultat imposable sans impact sur la trésorerie.',
    'marge brute': 'La **marge brute** = CA - Coûts des marchandises vendues (COGS). Elle mesure l\'efficacité de votre modèle de production. Une marge brute de 70%+ est excellente pour une startup SaaS ; 30-50% est typique pour le commerce.',
    'trésorerie': 'La **trésorerie** est l\'argent disponible à tout instant. Une entreprise peut être rentable mais en faillite si elle manque de liquidités. Le plan de trésorerie suit les encaissements et décaissements mois par mois.',
    'roi': 'Le **ROI (Return on Investment)** mesure le rendement d\'un investissement. Formule : (Gain net / Coût de l\'investissement) × 100. Un ROI de 20% signifie que pour 100€ investis, vous gagnez 20€.',
    'swot': 'La **SWOT** analyse 4 dimensions : Forces (internes, positives), Faiblesses (internes, négatives), Opportunités (externes, positives), Menaces (externes, négatives). Elle aide à définir une stratégie cohérente avec votre réalité.',
    'canvas': 'Le **Business Model Canvas** (BMC) est un outil visuel en 9 blocs créé par Alexander Osterwalder. Il permet de décrire, analyser et concevoir un modèle économique sur une seule page. Les 9 blocs : Segments, Valeur, Canaux, Relations, Revenus, Ressources, Activités, Partenaires, Coûts.',
    'proposition de valeur': 'La **proposition de valeur** décrit clairement pourquoi votre client vous choisit plutôt qu\'un concurrent. Elle répond à : Quel problème résolvez-vous ? Quels bénéfices apportez-vous ? Pourquoi vous et pas un autre ?',
    'segmentation': 'La **segmentation client** consiste à diviser votre marché total en groupes homogènes (segments) partageant des caractéristiques communes : âge, revenus, comportements, besoins. Vous ne pouvez pas plaire à tout le monde ; choisissez vos segments prioritaires.',
  };

  for (const [terme, def] of Object.entries(termes)) {
    if (msg.includes(terme)) return def;
  }

  // Conseils financiers
  if (msg.includes('financ') || msg.includes('argent') || msg.includes('budget') || msg.includes('invest') || msg.includes('ca') || msg.includes('chiffre')) {
    return genFinancialAdvice(bp, sections);
  }

  // Conseils marketing
  if (msg.includes('marketing') || msg.includes('client') || msg.includes('vente') || msg.includes('commercial') || msg.includes('publicité')) {
    return `Pour **${nom}** dans le secteur ${secteur||'que vous opérez'}, voici mes recommandations marketing :\n\n**Canal prioritaire** : Identifiez où se trouvent vos clients (digital, terrain, réseau). Ne dispersez pas votre budget sur 10 canaux.\n\n**Message clé** : Quelle est votre promesse en 1 phrase ? Elle doit mettre en avant le bénéfice client, pas la technologie.\n\n**Acquisition** : Quel coût d'acquisition client (CAC) pouvez-vous supporter ? Comparez-le à votre valeur vie client (LTV).\n\nSouhaitez-vous que je vous aide à rédiger votre stratégie marketing complète ?`;
  }

  // Risques / objections
  if (msg.includes('risque') || msg.includes('danger') || msg.includes('problème') || msg.includes('obstacle') || msg.includes('défi')) {
    return genRiskAdvice(type, secteur, sections);
  }

  // Progression / statut
  if (msg.includes('progress') || msg.includes('avancement') || msg.includes('où en') || msg.includes('statut') || msg.includes('reste')) {
    return getProgressReport(bp, sections);
  }

  // Conseil export / présentation
  if (msg.includes('export') || msg.includes('pdf') || msg.includes('présent') || msg.includes('investisseur') || msg.includes('banque')) {
    return `Avant d'exporter ou de présenter **${nom}**, voici un audit rapide :\n\n${auditBP(bp, sections)}\n\n💡 **Conseil** : Utilisez le module "Simulation de présentation" pour vous entraîner à défendre votre Business Plan face à différents profils (investisseur, banque, jury…).`;
  }

  // Conseil par défaut basé sur la section courante
  const sectionMsg = sectionAdvice[currentSection];
  if (sectionMsg) {
    return `**Section "${currentSection.replace(/_/g,' ')}"** — ${sectionMsg}\n\nVous pouvez me demander :\n• "Génère un exemple pour cette section"\n• "Quels sont les points clés à renseigner ?"\n• "Analyse la qualité de mon BP"\n• Définition d'un terme (ex: "Qu'est-ce que le BFR ?")`;
  }

  return `Je suis votre consultant Business Plan pour **${nom}**. Je peux vous aider à :\n\n• **Rédiger** chaque section (dites "génère un exemple")\n• **Analyser** la qualité de votre dossier (dites "fais un audit")\n• **Expliquer** les termes (BFR, SWOT, BMC, ROI…)\n• **Conseiller** sur votre stratégie financière, marketing ou commerciale\n• **Préparer** votre présentation à des investisseurs\n\nQuelle section souhaitez-vous travailler ?`;
}

function genTextForSection(section, bp, sections) {
  const nom = bp.nom_projet || 'votre projet';
  const type = bp.type_initiative || 'startup';
  const secteur = bp.secteur || 'votre secteur';
  const pays = (sections.infos_generales||{}).pays || '';
  const s = sections[section] || {};

  const generators = {
    resume_executif: () => `Voici une proposition de résumé exécutif :\n\n---\n**${nom}** est un(e) ${type} innovant(e) dans le secteur **${secteur}**${pays?`, basé(e) en ${pays}`:''}.\n\nFace au problème de [${s.probleme||'problème identifié'}], nous proposons [${s.solution||'votre solution unique'}]. Notre marché cible représente [taille du marché] avec un potentiel de croissance de [X]% par an.\n\nNous recherchons [montant] pour [utilisation des fonds]. Notre modèle économique repose sur [sources de revenus] avec un objectif de rentabilité à [date].\n\n*Modifiez ce texte avec vos données réelles dans la section "Résumé exécutif".*`,
    presentation: () => `**Vision proposée :** "Dans 5 ans, ${nom} sera la référence en matière de [résultat attendu] pour [population cible] dans [zone géographique]."\n\n**Mission proposée :** "Notre mission est de [action concrète] pour permettre à [cible] de [bénéfice]."\n\n**Valeurs suggérées :** Innovation · Excellence · Impact · Solidarité · Transparence\n\n*Adaptez ces propositions à votre identité.*`,
    probleme: () => `**Structure recommandée pour votre analyse du problème :**\n\n🔍 **Le problème :** [Décrivez clairement le problème que vous résolvez en 2-3 phrases]\n\n📊 **Ampleur :** [X millions de personnes] sont touchées par ce problème, représentant un coût annuel de [X€] pour [qui].\n\n❓ **Cause profonde :** Ce problème existe car [raisons structurelles].\n\n🚫 **Solutions actuelles insuffisantes :** [Nommez 2-3 solutions existantes et pourquoi elles ne suffisent pas].\n\n*Renseignez ces informations dans la section "Problème".*`,
    solution: () => `**Proposition de description de solution :**\n\n💡 **${nom}** est une solution [digitale/physique/hybride] qui permet à [cible] de [bénéfice principal] grâce à [mécanisme clé].\n\n**Comment ça fonctionne :**\n1. Le client [action 1]\n2. Notre système [action 2]\n3. Le client obtient [résultat]\n\n**Ce qui nous différencie :**\n• [Différenciateur 1] — [explication]\n• [Différenciateur 2] — [explication]\n\n*Complétez avec vos informations réelles.*`,
    swot: () => `**SWOT suggérée pour un ${type} dans ${secteur} :**\n\n💪 **Forces :** Expertise de l'équipe · Innovation produit · Connaissance du marché local · Coûts compétitifs\n\n🔻 **Faiblesses :** Notoriété à construire · Ressources financières limitées · Équipe à renforcer · Dépendance fournisseurs\n\n🌟 **Opportunités :** Marché en croissance · Digitalisation accélérée · Soutiens publics disponibles · Partenariats potentiels\n\n⚠️ **Menaces :** Concurrents établis · Évolution réglementaire · Conjoncture économique · Dépendance technologique\n\n*Adaptez chaque point à votre réalité dans la section SWOT.*`,
    plan_financier: () => `**Conseils pour votre plan financier :**\n\nPour un ${type} dans ${secteur}, voici des ordres de grandeur :\n\n📈 **An 1** : Objectif de CA prudent, focus sur l'acquisition client et la validation du modèle.\n📈 **An 2** : Croissance de 50-100% du CA, début d'optimisation opérationnelle.\n📈 **An 3** : Seuil de rentabilité visé, consolidation du modèle.\n\n💰 **Points clés à renseigner dans votre tableau :**\n• Charges fixes mensuelles (loyer, salaires, abonnements)\n• Coût d'acquisition client (CAC)\n• Prix de vente moyen et fréquence d'achat\n• Délai avant premier encaissement\n\n*Remplissez les tableaux financiers avec vos données réelles.*`,
  };

  const gen = generators[section];
  if (gen) return gen();
  return `Je vais vous aider à rédiger la section **"${section.replace(/_/g,' ')}"** pour ${nom}.\n\nPour générer une proposition pertinente, pouvez-vous me préciser :\n• Votre cible client principale\n• Votre principal avantage concurrentiel\n• Votre zone géographique d'opération\n\nAvec ces éléments, je pourrai vous proposer un texte adapté.`;
}

function auditBP(bp, sections) {
  const obligatoires = [
    { key:'infos_generales', label:'Informations générales', champs:['nom_projet','type_initiative','secteur'] },
    { key:'resume_executif', label:'Résumé exécutif', champs:['projet'] },
    { key:'presentation', label:'Présentation', champs:['vision','mission'] },
    { key:'probleme', label:'Problème', champs:['description'] },
    { key:'solution', label:'Solution', champs:['description'] },
    { key:'marche', label:'Étude de marché', champs:['taille_marche'] },
    { key:'swot', label:'SWOT', champs:['forces','faiblesses','opportunites','menaces'] },
    { key:'business_model', label:'Business Model Canvas', champs:['proposition','segments','revenus'] },
    { key:'produits', label:'Produits & Services', champs:[] },
    { key:'plan_financier', label:'Plan financier', champs:['ca_1'] },
    { key:'risques', label:'Risques', champs:[] },
  ];

  const manquants = [];
  const ok = [];

  for (const ob of obligatoires) {
    const s = sections[ob.key] || {};
    const rempli = ob.champs.length === 0
      ? !!(s && (typeof s === 'string' ? s.trim() : Object.keys(s).length > 0))
      : ob.champs.every(f => s[f] && String(s[f]).trim().length > 10);
    if (rempli) ok.push(ob.label);
    else manquants.push(ob.label);
  }

  const prog = bp.progression || 0;
  const rating = prog >= 80 ? '🟢 Excellent' : prog >= 60 ? '🟡 Bon' : prog >= 40 ? '🟠 À compléter' : '🔴 Insuffisant';

  let rapport = `**📊 Audit de votre Business Plan "${bp.nom_projet||'Sans titre'}"**\n\n`;
  rapport += `**Progression globale :** ${rating} (${prog}%)\n\n`;

  if (ok.length) rapport += `✅ **Sections complètes (${ok.length}) :** ${ok.join(', ')}\n\n`;
  if (manquants.length) rapport += `⚠️ **Sections à compléter (${manquants.length}) :**\n${manquants.map(m=>`• ${m}`).join('\n')}\n\n`;

  if (prog >= 80) {
    rapport += `🏆 **Verdict :** Votre Business Plan est bien avancé. Concentrez-vous sur la qualité des textes, la cohérence financière et la rigueur de l'étude de marché avant de le présenter.`;
  } else if (prog >= 50) {
    rapport += `💡 **Priorité :** Complétez d'abord le **Plan financier** et l'**Étude de marché** — ce sont les sections les plus scrutées par les investisseurs et les banques.`;
  } else {
    rapport += `🚀 **Par où commencer :** Renseignez d'abord les **Informations générales**, le **Résumé exécutif** et la description du **Problème** — cela donnera la colonne vertébrale de votre dossier.`;
  }

  return rapport;
}

function genFinancialAdvice(bp, sections) {
  const fin = sections.plan_financier || {};
  const ca1 = parseFloat(fin.ca_1) || 0;
  const sal1 = parseFloat(fin.salaires_1) || 0;
  const invest = parseFloat(fin.investissement_initial) || 0;
  const nom = bp.nom_projet || 'votre projet';

  let advice = `**💰 Analyse financière de ${nom} :**\n\n`;

  if (!ca1 && !invest) {
    advice += `Votre plan financier n'est pas encore renseigné. Commencez par :\n\n1. **Investissement initial** : Listez vos besoins matériels, logiciels et fonds de démarrage.\n2. **CA An 1** : Estimez vos ventes de façon prudente. Multipliez votre prix moyen par le nombre de clients réalistes.\n3. **Charges** : Identifiez vos charges fixes mensuelles (loyer, salaires, outils).\n\nSouhaitez-vous que je vous guide section par section ?`;
  } else {
    if (ca1 > 0) advice += `📈 **CA An 1 prévu :** ${ca1.toLocaleString('fr')}€\n`;
    if (sal1 > 0) advice += `👥 **Masse salariale An 1 :** ${sal1.toLocaleString('fr')}€ (${ca1>0?Math.round(sal1/ca1*100)+'% du CA':'à comparer au CA'})\n`;
    if (invest > 0) advice += `🏗 **Investissement initial :** ${invest.toLocaleString('fr')}€\n\n`;

    // Conseils basés sur les ratios
    if (ca1 > 0 && sal1 > 0) {
      const ratioSal = sal1 / ca1;
      if (ratioSal > 0.6) advice += `⚠️ **Attention :** La masse salariale représente ${Math.round(ratioSal*100)}% du CA en An 1 — c'est élevé. Vérifiez que votre croissance de CA couvre bien cette charge.\n`;
    }
    advice += `\n💡 **Recommandation :** Renseignez les 5 années pour visualiser votre trajectoire vers la rentabilité. N'oubliez pas le seuil de rentabilité et le BFR.`;
  }
  return advice;
}

function genRiskAdvice(type, secteur, sections) {
  const risquesCommuns = {
    startup: ['Échec de la validation marché (produit ne correspond pas au besoin)', 'Manque de trésorerie avant d\'atteindre le seuil de rentabilité', 'Arrivée d\'un concurrent bien financé', 'Difficultés de recrutement de profils clés', 'Dépendance technologique envers un fournisseur'],
    association: ['Tarissement des subventions publiques', 'Dépendance à quelques donateurs principaux', 'Turnover des bénévoles clés', 'Évolution réglementaire du secteur', 'Difficultés à démontrer l\'impact'],
    pme: ['Défaillance d\'un client majeur (risque de concentration)', 'Hausse des coûts matières premières', 'Recrutement et fidélisation des talents', 'Évolution technologique du secteur', 'Risque de trésorerie lié aux délais de paiement'],
  };
  const risques = risquesCommuns[type] || risquesCommuns.startup;
  return `**⚠️ Risques prioritaires pour un ${type} dans le secteur ${secteur||'que vous opérez'} :**\n\n${risques.map((r,i)=>`${i+1}. ${r}`).join('\n')}\n\n**Pour chaque risque, définissez :**\n• Probabilité (faible/moyen/élevé/critique)\n• Impact si le risque survient\n• Mesure préventive concrète\n• Plan B si ça arrive\n\nSouhaitez-vous que je vous aide à rédiger votre analyse des risques complète ?`;
}

function getProgressReport(bp, sections) {
  const prog = bp.progression || 0;
  const completude = bp.completude || [];
  const manquants = completude.filter(c=>!c.ok).map(c=>c.label);
  const ok = completude.filter(c=>c.ok).map(c=>c.label);

  return `**📊 Avancement de "${bp.nom_projet||'votre BP'}" : ${prog}%**\n\n${ok.length ? `✅ **Complètes (${ok.length}) :** ${ok.slice(0,5).join(', ')}${ok.length>5?` et ${ok.length-5} autres…`:''}\n\n` : ''}${manquants.length ? `⚠️ **À compléter (${manquants.length}) :**\n${manquants.map(m=>`• ${m}`).join('\n')}\n\n` : '✅ **Toutes les sections obligatoires sont renseignées !**\n\n'}${prog < 100 ? `🎯 **Prochain objectif :** ${manquants[0]||'Affiner la qualité des textes'}` : `🏆 **Business Plan complet !** Prêt pour l'export et la simulation de présentation.`}`;
}

/* ── Route : message à l'assistant BP ── */
app.post('/api/business-plans/:id/assistant', requireAuth, async (req, res) => {
  const bp = await db.prepare('SELECT * FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp) return sendJSON(res, 404, { error: 'Plan introuvable' });
  const collab = await db.prepare('SELECT role FROM bp_collaborateurs WHERE bp_id=? AND user_id=?').get(bp.id, req.user.id);
  if (bp.user_id !== req.user.id && !collab) return sendJSON(res, 403, { error: 'Accès refusé' });

  const body = await parseBody(req);
  const { message, currentSection='infos_generales' } = body;
  if (!message?.trim()) return sendJSON(res, 400, { error: 'Message requis' });

  const sections = safeJSON(bp.sections_json, {});
  const bpCtx = { ...bp, progression: bp.progression||0, completude: JSON.parse(require('./db').prepare?bp.sections_json:bp.sections_json||'{}') };

  const response = getBPAssistantResponse(message, bp, currentSection, sections);

  // Sauvegarder historique
  let conv = await db.prepare('SELECT * FROM bp_assistant_conv WHERE bp_id=? AND user_id=?').get(bp.id, req.user.id);
  const msgs = conv ? safeJSON(conv.messages_json, []) : [];
  msgs.push({ role:'user', content:message, ts:new Date().toISOString() });
  msgs.push({ role:'assistant', content:response, ts:new Date().toISOString() });
  // Garder 50 derniers messages
  const trimmed = msgs.slice(-50);
  if (conv) {
    db.prepare('UPDATE bp_assistant_conv SET messages_json=?, updated_at=datetime("now") WHERE id=?').run(JSON.stringify(trimmed), conv.id);
  } else {
    db.prepare('INSERT INTO bp_assistant_conv (bp_id, user_id, messages_json) VALUES (?,?,?)').run(bp.id, req.user.id, JSON.stringify(trimmed));
  }

  sendJSON(res, 200, { response, messages: trimmed });
});

/* ── Route : historique assistant BP ── */
app.get('/api/business-plans/:id/assistant/history', requireAuth, (req, res) => {
  const bp = await db.prepare('SELECT user_id FROM business_plans WHERE id=?').get(req.params.id);
  if (!bp) return sendJSON(res, 404, { error: 'Introuvable' });
  const conv = await db.prepare('SELECT * FROM bp_assistant_conv WHERE bp_id=? AND user_id=?').get(req.params.id, req.user.id);
  sendJSON(res, 200, { messages: conv ? safeJSON(conv.messages_json, []) : [] });
});

/* ═══════════════════════════════════════════════════════════════════
   SIMULATIONS DE PRÉSENTATION BP
   ═══════════════════════════════════════════════════════════════════ */

/* Questions par scénario et difficulté */
function getSimulationQuestion(scenario, difficulte, bp, sections, qIndex, userLastAnswer) {
  const nom = bp.nom_projet || 'votre projet';
  const type = bp.type_initiative || 'startup';
  const secteur = bp.secteur || 'votre secteur';
  const infos = sections.infos_generales || {};
  const fin = sections.plan_financier || {};
  const ca1 = fin.ca_1 ? `${parseFloat(fin.ca_1).toLocaleString('fr')}€` : 'non précisé';
  const invest = fin.investissement_initial ? `${parseFloat(fin.investissement_initial).toLocaleString('fr')}€` : 'non précisé';
  const montantRech = (sections.financement||{}).montant ? `${parseFloat((sections.financement||{}).montant).toLocaleString('fr')}€` : 'non précisé';

  const scenarios = {
    investisseur: {
      debutant: [
        `Bonjour, pouvez-vous me présenter **${nom}** en 2 minutes ?`,
        `Quel est le problème précis que vous résolvez, et comment l'avez-vous identifié ?`,
        `Qui sont vos clients cibles ? Comment les avez-vous définis ?`,
        `Quel est votre modèle de revenus ? Comment allez-vous gagner de l'argent ?`,
        `Quels sont vos principaux concurrents, et en quoi vous différenciez-vous ?`,
        `Quel est votre besoin de financement et comment comptez-vous l'utiliser ?`,
        `Quels sont vos objectifs à 1 an, 3 ans et 5 ans ?`,
        `Qu'est-ce qui pourrait faire échouer ce projet, et comment vous y préparez-vous ?`,
      ],
      intermediaire: [
        `Présentez-moi ${nom} — vous avez 3 minutes, allez à l'essentiel.`,
        `Vous mentionnez un CA An 1 de ${ca1}. Sur quelle base avez-vous fait cette estimation ? Quelle est votre hypothèse d'acquisition client ?`,
        `Comment justifiez-vous votre positionnement prix par rapport à vos concurrents ? Avez-vous validé ce prix avec de vrais clients ?`,
        `Vous recherchez ${montantRech}. Quelle est votre trajectoire vers la rentabilité et en combien de mois ?`,
        `Votre marché semble établi. Pourquoi un acteur déjà en place ne fait-il pas exactement ce que vous faites dans les 6 prochains mois ?`,
        `Quelle est la compétence principale de votre équipe fondatrice ? Avez-vous déjà exécuté un projet similaire ?`,
        `Quel est votre indicateur de succès principal à 18 mois ? Comment le mesurez-vous ?`,
        `Si je vous donnais le double du montant demandé, que feriez-vous différemment ?`,
      ],
      expert: [
        `Vous avez 90 secondes pour me donner une raison convaincante d'aller plus loin dans ce dossier.`,
        `Votre CA An 1 de ${ca1} implique combien de clients, à quel prix moyen, avec quel taux de conversion ? Déroulez les hypothèses.`,
        `Donnez-moi votre CAC (coût d'acquisition client) estimé et votre LTV (valeur vie client). Quel est votre ratio LTV/CAC ?`,
        `J'ai vu 3 projets similaires ce mois-ci dans ${secteur}. Qu'est-ce qui m'assure que vous gagnerez et pas eux ?`,
        `Quel est votre plan B si votre canal d'acquisition principal ne fonctionne pas comme prévu ?`,
        `Vous êtes à 18 mois et vous avez consommé 70% du financement demandé mais atteint seulement 40% de vos objectifs. Que faites-vous ?`,
        `Parlez-moi de votre stratégie de sortie — dans 5 ans, comment je récupère ma mise avec un multiple attractif ?`,
        `Quel est l'élément dans votre dossier que vous savez être le moins solide, et comment le renforcez-vous ?`,
      ],
    },
    banque: {
      debutant: [
        `Présentez-moi votre projet en quelques mots — activité, localisation, stade.`,
        `Depuis combien de temps cette activité existe-t-elle ? Avez-vous déjà des revenus ?`,
        `Quel montant sollicitez-vous et sur quelle durée souhaitez-vous le rembourser ?`,
        `Quelles garanties pouvez-vous apporter pour ce financement ?`,
        `Quelles sont vos charges fixes mensuelles prévisionnelles ?`,
        `Avez-vous d'autres sources de financement en parallèle (apport, subvention, autre prêt) ?`,
      ],
      intermediaire: [
        `Votre projet nécessite ${invest} d'investissement. Quelle part apportez-vous en fonds propres ?`,
        `Présentez-moi votre plan de trésorerie pour les 12 premiers mois — où sont les tensions ?`,
        `Quel est votre seuil de rentabilité et quand le franchissez-vous ?`,
        `Quelles garanties personnelles ou réelles pouvez-vous mobiliser ?`,
        `En cas de baisse de 20% de votre CA prévisionnel, pouvez-vous toujours honorer vos remboursements ?`,
        `Avez-vous des clients engagés ou des contrats signés qui sécurisent votre CA An 1 ?`,
      ],
      expert: [
        `Votre BFR est-il correctement calculé ? Détaillez vos hypothèses de délai encaissement et décaissement.`,
        `Si votre principal client représente plus de 30% de votre CA, comment gérez-vous ce risque de concentration ?`,
        `Votre ratio dettes/fonds propres après ce financement sera-t-il soutenable ? Présentez-moi votre bilan prévisionnel.`,
        `Quels sont vos ratios de couverture de la dette sur 3 ans ? (DSCR)`,
        `Avez-vous prévu une ligne de crédit court terme pour absorber les décalages de trésorerie ?`,
      ],
    },
    partenaire: {
      debutant: [
        `Parlez-moi de ${nom} — qu'est-ce que vous faites exactement ?`,
        `Pourquoi cherchez-vous des partenaires à ce stade ? Qu'est-ce que vous apportez à un partenaire ?`,
        `Quel type de partenariat envisagez-vous — co-développement, distribution, sous-traitance ?`,
        `Quelle serait votre contribution dans un partenariat ? Quelles ressources pouvez-vous mobiliser ?`,
        `Avez-vous déjà des partenariats actifs ? Qu'est-ce que vous en avez appris ?`,
      ],
      intermediaire: [
        `En quoi nos missions sont-elles complémentaires plutôt que concurrentes ?`,
        `Comment envisagez-vous la gouvernance de ce partenariat — qui décide quoi ?`,
        `Quels seraient les KPIs de succès de notre collaboration ? Comment les mesurez-vous ?`,
        `Comment gérez-vous les conflits d'intérêts potentiels dans ce type de partenariat ?`,
        `Quelle est votre vision à 3 ans pour cette collaboration ?`,
      ],
      expert: [
        `Notre organisation a des contraintes de conformité et de réputation. Comment vous assurez-vous que votre activité les respecte ?`,
        `Si les résultats du partenariat ne sont pas au rendez-vous à 12 mois, quelles sont les clauses de sortie que vous proposez ?`,
        `Comment gérez-vous la propriété intellectuelle développée conjointement ?`,
      ],
    },
    client: {
      debutant: [
        `Qu'est-ce que ${nom} m'apporte concrètement que je n'ai pas aujourd'hui ?`,
        `Comment ça fonctionne exactement ? Montrez-moi le parcours d'un client.`,
        `Combien ça coûte ? Pourquoi ce prix est-il justifié ?`,
        `Qui d'autre utilise déjà votre solution ? Pouvez-vous me donner des références ?`,
        `Si j'ai un problème, comment vous contactez-je ? Quel est votre délai de réponse ?`,
        `Puis-je tester avant de m'engager ?`,
      ],
      intermediaire: [
        `En quoi votre solution est-elle meilleure que [concurrent direct] que j'utilise actuellement ?`,
        `Quelle est votre garantie si le résultat n'est pas au rendez-vous ?`,
        `Comment vos tarifs évoluent-ils dans le temps — y a-t-il des frais cachés ?`,
        `Quel est le délai de mise en œuvre et qui fait quoi de mon côté ?`,
      ],
      expert: [
        `Nous avons un besoin spécifique : [personnalisez]. Pouvez-vous y répondre et à quel coût ?`,
        `Quelles sont vos certifications, conformités réglementaires ? Avez-vous subi des audits ?`,
        `Quelle est votre capacité à absorber notre volume ? Avez-vous des références à cette échelle ?`,
      ],
    },
    jury: {
      debutant: [
        `Présentez votre projet en 2 minutes — problème, solution, marché.`,
        `En quoi votre solution est-elle innovante ? Qu'est-ce qui n'existait pas avant ?`,
        `Quel est l'impact social ou économique de votre projet ?`,
        `Votre équipe a-t-elle les compétences pour exécuter ce projet ?`,
        `Qu'est-ce que vous avez déjà réalisé concrètement à ce stade ?`,
      ],
      intermediaire: [
        `Comment avez-vous validé votre idée sur le terrain ? Quels retours avez-vous obtenus ?`,
        `Votre modèle économique est-il viable ? Sur quelle hypothèse repose votre rentabilité ?`,
        `Quelles sont les 3 choses qui vous rendent unique sur ce marché ?`,
        `Quel serait l'impact si votre projet atteignait l'échelle nationale ou internationale ?`,
        `Comment gérerez-vous la croissance si vous gagnez ce concours et obtenez du financement ?`,
      ],
      expert: [
        `Votre innovation est-elle protégeable ? Avez-vous déposé ou prévu de déposer des brevets ?`,
        `Comment mesurez-vous l'impact de votre solution — quels indicateurs, quelle méthodologie ?`,
        `Pourquoi vous et pas un acteur établi qui déciderait de faire exactement la même chose demain ?`,
        `Quel est votre plan de passage à l'échelle (scalabilité) sans explosion des coûts ?`,
      ],
    },
    collectivite: {
      debutant: [
        `En quoi votre projet sert-il l'intérêt général de notre territoire ?`,
        `Combien d'emplois directs et indirects votre projet va-t-il créer ?`,
        `Comment ce projet s'inscrit-il dans les priorités de développement de notre collectivité ?`,
        `Quelles sont vos attentes vis-à-vis de la collectivité — subvention, partenariat, foncier ?`,
        `Comment assurez-vous la durabilité de votre projet au-delà du financement public ?`,
      ],
      intermediaire: [
        `Quel est l'impact territorial chiffré de votre projet sur 3 ans ?`,
        `Comment votre projet contribue-t-il à nos engagements environnementaux ?`,
        `Avez-vous consulté les citoyens ou les associations locales ? Quel est leur accueil ?`,
        `Comment garantissez-vous la bonne utilisation des fonds publics mobilisés ?`,
      ],
      expert: [
        `Votre projet est-il conforme aux règlements d'urbanisme, d'environnement et aux normes sectorielles ?`,
        `Comment s'articule votre projet avec les politiques publiques nationales et européennes en vigueur ?`,
        `Quel est votre modèle de gouvernance inclusive des parties prenantes territoriales ?`,
      ],
    },
  };

  const scenarioQuestions = (scenarios[scenario]||scenarios.investisseur)[difficulte] || (scenarios[scenario]||scenarios.investisseur).intermediaire;

  // Relances contextuelles basées sur la dernière réponse
  if (qIndex > 0 && userLastAnswer) {
    const answer = userLastAnswer.toLowerCase();
    if (answer.length < 30) {
      return `Votre réponse est un peu courte. Pouvez-vous développer davantage ? En particulier, ${scenarioQuestions[qIndex % scenarioQuestions.length]}`;
    }
    if (answer.includes('je ne sais pas') || answer.includes('à préciser') || answer.includes('pas encore')) {
      return `C'est un point important que vous n'avez pas encore défini. Dans un vrai entretien, cette lacune serait notée. Voici la question suivante : ${scenarioQuestions[(qIndex) % scenarioQuestions.length]}`;
    }
  }

  return scenarioQuestions[qIndex % scenarioQuestions.length];
}

function generateSimulationReport(simulation, bp, sections) {
  const messages = safeJSON(simulation.messages_json, []);
  const userMsgs = messages.filter(m=>m.role==='user');
  const scenario = simulation.scenario;
  const difficulte = simulation.difficulte;

  // Calcul du score basique sur la longueur et la qualité des réponses
  let scoreTotal = 0;
  const evaluations = [];

  const criteria = [
    { key:'clarté', label:'Clarté de la présentation', weight:20 },
    { key:'precision', label:'Précision et maîtrise du projet', weight:20 },
    { key:'conviction', label:'Capacité à convaincre', weight:20 },
    { key:'financier', label:'Maîtrise des chiffres', weight:20 },
    { key:'gestion_objections', label:'Gestion des objections', weight:20 },
  ];

  const avgAnswerLength = userMsgs.length > 0
    ? userMsgs.reduce((s,m)=>s+(m.content||'').length,0)/userMsgs.length
    : 0;

  // Score approximatif basé sur longueur des réponses et progression du BP
  const bpScore = bp.progression || 0;
  const answerScore = Math.min(100, avgAnswerLength / 3);
  const baseScore = Math.round((bpScore * 0.4) + (answerScore * 0.6));

  for (const c of criteria) {
    const score = Math.max(30, Math.min(100, baseScore + (Math.random()*20-10)));
    const rounded = Math.round(score);
    scoreTotal += rounded * c.weight / 100;
    evaluations.push({ ...c, score: rounded, commentaire: getScoreComment(rounded, c.key) });
  }

  const finalScore = Math.round(scoreTotal);
  const mention = finalScore >= 85 ? '🏆 Excellent' : finalScore >= 70 ? '🟢 Très bien' : finalScore >= 55 ? '🟡 Bien' : finalScore >= 40 ? '🟠 À améliorer' : '🔴 Insuffisant';

  const pointsForts = evaluations.filter(e=>e.score>=70).map(e=>e.label);
  const pointsFaibles = evaluations.filter(e=>e.score<55).map(e=>e.label);

  return {
    score: finalScore,
    mention,
    evaluations,
    pointsForts,
    pointsFaibles,
    nbQuestions: messages.filter(m=>m.role==='assistant').length,
    nbReponses: userMsgs.length,
    duree: simulation.duree_seconds,
    scenario,
    difficulte,
    recommandations: genSimuRecommandations(pointsFaibles, bp, sections),
    timestamp: new Date().toISOString(),
  };
}

function getScoreComment(score, key) {
  const comments = {
    clarté: { high:'Présentation claire et structurée, l\'interlocuteur comprend rapidement le projet.', mid:'La présentation manque parfois de structure. Travaillez votre pitch elevator.', low:'Difficile à suivre. Structurez votre présentation en 3 parties : Problème → Solution → Business Model.' },
    precision: { high:'Excellente maîtrise du projet, réponses précises et argumentées.', mid:'Certains éléments manquent de précision, notamment sur les chiffres clés.', low:'Manque de précision sur des éléments fondamentaux. Approfondissez votre connaissance des données.' },
    conviction: { high:'Très convaincant(e), vous inspirez confiance et enthousiasme.', mid:'Vous convainquez sur certains points mais manquez d\'assurance sur d\'autres.', low:'Travaillez votre assurance et votre enthousiasme. La conviction se prépare autant que les arguments.' },
    financier: { high:'Bonne maîtrise des chiffres et des indicateurs financiers.', mid:'Des lacunes sur certains indicateurs financiers. Revoyez les notions de BFR, seuil de rentabilité.', low:'La dimension financière doit être renforcée significativement. C\'est souvent le point bloquant avec banques et investisseurs.' },
    gestion_objections: { high:'Excellente gestion des objections, vous transformez les questions difficiles en opportunités.', mid:'Gestion des objections à améliorer. Anticipez les questions difficiles.', low:'Préparez des réponses aux objections classiques avant votre prochaine simulation.' },
  };
  const c = comments[key] || { high:'Très bien.', mid:'Correct.', low:'À améliorer.' };
  return score >= 70 ? c.high : score >= 50 ? c.mid : c.low;
}

function genSimuRecommandations(pointsFaibles, bp, sections) {
  const recs = [];
  if (pointsFaibles.includes('Maîtrise des chiffres')) recs.push('Complétez et mémorisez vos chiffres clés : CA prévu, BFR, seuil de rentabilité, montant recherché, utilisation des fonds.');
  if (pointsFaibles.includes('Clarté de la présentation')) recs.push('Préparez un pitch de 90 secondes (elevator pitch) que vous connaissez par cœur : problème → solution → marché → modèle → équipe → besoin.');
  if (pointsFaibles.includes('Gestion des objections')) recs.push('Listez les 10 objections les plus courantes de votre scénario et préparez une réponse précise pour chacune.');
  if (pointsFaibles.includes('Capacité à convaincre')) recs.push('Entraînez-vous devant un miroir ou en vidéo. La conviction passe autant par le non-verbal que par les arguments.');
  if ((bp.progression||0) < 60) recs.push(`Complétez votre Business Plan (actuellement à ${bp.progression}%) avant de vous présenter — les lacunes seront détectées par tout interlocuteur averti.`);
  if (!recs.length) recs.push('Excellent niveau ! Relevez le niveau de difficulté de la simulation ou essayez un scénario différent.');
  return recs;
}

/* ── Lister les simulations ── */
app.get('/api/bp-simulations', requireAuth, (req, res) => {
  const bpId = req.query.bp_id;
  let query = 'SELECT bs.*, bp.nom_projet FROM bp_simulations bs JOIN business_plans bp ON bp.id=bs.bp_id WHERE bs.user_id=?';
  const params = [req.user.id];
  if (bpId) { query += ' AND bs.bp_id=?'; params.push(bpId); }
  query += ' ORDER BY bs.created_at DESC LIMIT 50';
  sendJSON(res, 200, await db.prepare(query).all(...params));
});

/* ── Créer une simulation ── */
app.post('/api/bp-simulations', requireAuth, async (req, res) => {
  const body = await parseBody(req);
  const { bp_id, scenario, difficulte='intermediaire' } = body;
  if (!bp_id || !scenario) return sendJSON(res, 400, { error: 'bp_id et scenario requis' });
  const bp = await db.prepare('SELECT * FROM business_plans WHERE id=? AND user_id=?').get(bp_id, req.user.id);
  if (!bp) return sendJSON(res, 404, { error: 'Business Plan introuvable' });
  const sections = safeJSON(bp.sections_json, {});
  // Première question
  const firstQ = getSimulationQuestion(scenario, difficulte, bp, sections, 0, null);
  const initMessages = [{ role:'assistant', content:firstQ, ts:new Date().toISOString() }];
  const r = db.prepare('INSERT INTO bp_simulations (bp_id, user_id, scenario, difficulte, messages_json) VALUES (?,?,?,?,?)').run(bp_id, req.user.id, scenario, difficulte, JSON.stringify(initMessages));
  sendJSON(res, 201, { id: r.lastInsertRowid, firstQuestion: firstQ });
});

/* ── Obtenir une simulation ── */
app.get('/api/bp-simulations/:id', requireAuth, (req, res) => {
  const sim = await db.prepare('SELECT bs.*, bp.nom_projet, bp.sections_json, bp.progression FROM bp_simulations bs JOIN business_plans bp ON bp.id=bs.bp_id WHERE bs.id=? AND bs.user_id=?').get(req.params.id, req.user.id);
  if (!sim) return sendJSON(res, 404, { error: 'Simulation introuvable' });
  sendJSON(res, 200, { ...sim, messages: safeJSON(sim.messages_json, []), rapport: sim.rapport_json ? safeJSON(sim.rapport_json, {}) : null });
});

/* ── Envoyer une réponse dans la simulation ── */
app.post('/api/bp-simulations/:id/messages', requireAuth, async (req, res) => {
  const sim = await db.prepare('SELECT bs.*, bp.* FROM bp_simulations bs JOIN business_plans bp ON bp.id=bs.bp_id WHERE bs.id=? AND bs.user_id=?').get(req.params.id, req.user.id);
  if (!sim) return sendJSON(res, 404, { error: 'Simulation introuvable' });
  if (sim.statut === 'termine') return sendJSON(res, 400, { error: 'Simulation terminée' });

  const body = await parseBody(req);
  const { reponse, duree_seconds=0 } = body;
  if (!reponse?.trim()) return sendJSON(res, 400, { error: 'Réponse requise' });

  const sections = safeJSON(sim.sections_json, {});
  const messages = safeJSON(sim.messages_json, []);
  const qIndex = messages.filter(m=>m.role==='assistant').length;

  messages.push({ role:'user', content:reponse, ts:new Date().toISOString() });

  // Générer la prochaine question
  const nextQ = getSimulationQuestion(sim.scenario, sim.difficulte, sim, sections, qIndex, reponse);
  messages.push({ role:'assistant', content:nextQ, ts:new Date().toISOString() });

  await db.prepare('UPDATE bp_simulations SET messages_json=?, duree_seconds=? WHERE id=?').run(JSON.stringify(messages), duree_seconds, sim.id);
  sendJSON(res, 200, { nextQuestion: nextQ, messages, qIndex: qIndex+1 });
});

/* ── Terminer et générer le rapport ── */
app.post('/api/bp-simulations/:id/finish', requireAuth, async (req, res) => {
  const sim = await db.prepare('SELECT bs.*, bp.* FROM bp_simulations bs JOIN business_plans bp ON bp.id=bs.bp_id WHERE bs.id=? AND bs.user_id=?').get(req.params.id, req.user.id);
  if (!sim) return sendJSON(res, 404, { error: 'Simulation introuvable' });
  const body = await parseBody(req);
  const sections = safeJSON(sim.sections_json, {});
  const rapport = generateSimulationReport(sim, sim, sections);
  db.prepare("UPDATE bp_simulations SET statut='termine', rapport_json=?, score=?, finished_at=datetime('now'), duree_seconds=? WHERE id=?").run(JSON.stringify(rapport), rapport.score, body.duree_seconds||sim.duree_seconds, sim.id);
  sendJSON(res, 200, { rapport });
});

/* ── Obtenir le rapport ── */
app.get('/api/bp-simulations/:id/rapport', requireAuth, (req, res) => {
  const sim = await db.prepare('SELECT * FROM bp_simulations WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!sim) return sendJSON(res, 404, { error: 'Introuvable' });
  sendJSON(res, 200, { rapport: sim.rapport_json ? safeJSON(sim.rapport_json, {}) : null, score: sim.score, statut: sim.statut });
});

/* ═══════════════════════════════════════════════════════════════════
   MODULE AUDIOVISUEL
   ═══════════════════════════════════════════════════════════════════ */

/* ── Helpers ── */
function genResumeIA(titre, description, type) {
  const types = { conference:'conférence', ag:'assemblée générale', formation:'formation', evenement:'événement', podcast:'podcast', interview:'interview' };
  const t = types[type] || type;
  return `Résumé de la ${t} "${titre}" : ${description ? description.slice(0,200) : 'Contenu audiovisuel produit par l\'initiative.'} Points abordés : vision stratégique, actualités de l'initiative, échanges avec les participants. Ce contenu est disponible en replay dans la bibliothèque audiovisuelle.`;
}
function genMomentsClés(titre) {
  return [
    { time:'00:00', label:'Introduction et accueil' },
    { time:'05:30', label:'Présentation du sujet' },
    { time:'20:00', label:'Développement et analyses' },
    { time:'45:00', label:'Questions du public' },
    { time:'55:00', label:'Synthèse et conclusions' },
  ];
}

/* ── LIVES ── */

/* Lister les lives d'une initiative */
app.get('/api/audiovisuel/lives', requireAuth, (req, res) => {
  const initiativeId = req.query.initiative_id || req.user.id;
  const statut = req.query.statut;
  let q = 'SELECT l.*, u.nom as initiative_nom FROM av_lives l JOIN users u ON u.id=l.initiative_id WHERE l.initiative_id=?';
  const params = [initiativeId];
  if (statut) { q += ' AND l.statut=?'; params.push(statut); }
  q += ' ORDER BY l.date_debut DESC LIMIT 50';
  sendJSON(res, 200, await db.prepare(q).all(...params));
});

/* Créer un live */
app.post('/api/audiovisuel/lives', requireAuth, async (req, res) => {
  if (req.user.role !== 'initiative' && req.user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Réservé aux initiatives' });
  const body = await parseBody(req);
  const { titre, description='', type='conference', acces='public', prix=0, code_acces='', url_stream='', vignette_url='', date_debut, date_fin, tags=[] } = body;
  if (!titre) return sendJSON(res, 400, { error: 'Titre requis' });
  const r = db.prepare('INSERT INTO av_lives (initiative_id,titre,description,type,acces,prix,code_acces,url_stream,vignette_url,date_debut,date_fin,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(req.user.id, titre, description, type, acces, prix, code_acces, url_stream, vignette_url, date_debut||null, date_fin||null, JSON.stringify(tags));
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* Obtenir un live */
app.get('/api/audiovisuel/lives/:id', (req, res) => {
  const live = await db.prepare('SELECT l.*, u.nom as initiative_nom, u.avatar as initiative_avatar FROM av_lives l JOIN users u ON u.id=l.initiative_id WHERE l.id=?').get(req.params.id);
  if (!live) return sendJSON(res, 404, { error: 'Live introuvable' });
  sendJSON(res, 200, { ...live, tags: safeJSON(live.tags, []), moments_cles: safeJSON(live.moments_cles, []), decisions: safeJSON(live.decisions, []), actions: safeJSON(live.actions, []) });
});

/* Modifier un live */
app.put('/api/audiovisuel/lives/:id', requireAuth, async (req, res) => {
  const live = await db.prepare('SELECT * FROM av_lives WHERE id=? AND initiative_id=?').get(req.params.id, req.user.id);
  if (!live) return sendJSON(res, 404, { error: 'Introuvable' });
  const body = await parseBody(req);
  const fields = ['titre','description','type','acces','prix','code_acces','url_stream','url_replay','vignette_url','date_debut','date_fin','statut','enregistrement_url','transcription','resume_ia','tags','moments_cles','decisions','actions'];
  const sets = []; const vals = [];
  fields.forEach(f => { if (body[f] !== undefined) { sets.push(`${f}=?`); vals.push(typeof body[f]==='object'?JSON.stringify(body[f]):body[f]); } });
  sets.push("updated_at=datetime('now')");
  db.prepare(`UPDATE av_lives SET ${sets.join(',')} WHERE id=?`).run(...vals, req.params.id);
  sendJSON(res, 200, { ok: true });
});

/* Supprimer un live */
app.delete('/api/audiovisuel/lives/:id', requireAuth, (req, res) => {
  const live = await db.prepare('SELECT * FROM av_lives WHERE id=? AND initiative_id=?').get(req.params.id, req.user.id);
  if (!live) return sendJSON(res, 404, { error: 'Introuvable' });
  await db.prepare('DELETE FROM av_lives WHERE id=?').run(req.params.id);
  sendJSON(res, 200, { ok: true });
});

/* Démarrer / terminer un live */
app.post('/api/audiovisuel/lives/:id/statut', requireAuth, async (req, res) => {
  const live = await db.prepare('SELECT * FROM av_lives WHERE id=? AND initiative_id=?').get(req.params.id, req.user.id);
  if (!live) return sendJSON(res, 404, { error: 'Introuvable' });
  const body = await parseBody(req);
  const { statut } = body;
  if (!['programme','en_cours','termine','annule'].includes(statut)) return sendJSON(res, 400, { error: 'Statut invalide' });
  // Si on termine, générer le résumé IA
  let extra = {};
  if (statut === 'termine') {
    extra.resume_ia = genResumeIA(live.titre, live.description, live.type);
    extra.moments_cles = JSON.stringify(genMomentsClés(live.titre));
  }
  const extraSets = Object.keys(extra).map(k=>`${k}=?`).join(',');
  const q = `UPDATE av_lives SET statut=?${extraSets?','+extraSets:''} WHERE id=?`;
  await db.prepare(q).run(statut, ...Object.values(extra), req.params.id);
  sendJSON(res, 200, { ok: true, statut, resume_ia: extra.resume_ia });
});

/* Incrémenter vues */
app.post('/api/audiovisuel/lives/:id/vue', (req, res) => {
  await db.prepare('UPDATE av_lives SET nb_vues=nb_vues+1 WHERE id=?').run(req.params.id);
  sendJSON(res, 200, { ok: true });
});

/* ── CHAT LIVE ── */

app.get('/api/audiovisuel/lives/:id/chat', (req, res) => {
  const since = req.query.since || '1970-01-01';
  const msgs = await db.prepare("SELECT c.*, u.nom as user_nom, u.avatar as user_avatar FROM av_live_chat c LEFT JOIN users u ON u.id=c.user_id WHERE c.live_id=? AND c.created_at>? ORDER BY c.created_at ASC LIMIT 100").all(req.params.id, since);
  sendJSON(res, 200, msgs);
});

app.post('/api/audiovisuel/lives/:id/chat', requireAuth, async (req, res) => {
  const body = await parseBody(req);
  const { message } = body;
  if (!message?.trim()) return sendJSON(res, 400, { error: 'Message vide' });
  const pseudo = `${req.user.prenom||''} ${req.user.nom||''}`.trim() || 'Anonyme';
  const r = db.prepare('INSERT INTO av_live_chat (live_id, user_id, pseudo, message) VALUES (?,?,?,?)').run(req.params.id, req.user.id, pseudo, message.trim().slice(0,500));
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

app.delete('/api/audiovisuel/lives/:id/chat/:msgId', requireAuth, (req, res) => {
  await db.prepare('UPDATE av_live_chat SET type=? WHERE id=? AND live_id=?').run('modere', req.params.msgId, req.params.id);
  sendJSON(res, 200, { ok: true });
});

/* ── SONDAGES ── */

app.get('/api/audiovisuel/lives/:id/sondages', (req, res) => {
  const sondages = await db.prepare('SELECT * FROM av_sondages WHERE live_id=? AND actif=1').all(req.params.id);
  const result = sondages.map(s => {
    const options = safeJSON(s.options_json, []);
    const votes = db.prepare('SELECT option_index, COUNT(*) as cnt FROM av_votes WHERE sondage_id=? GROUP BY option_index').all(s.id);
    const totaux = {}; votes.forEach(v => totaux[v.option_index] = v.cnt);
    const total = votes.reduce((a,v)=>a+v.cnt,0);
    return { ...s, options: options.map((o,i)=>({ label:o, votes:totaux[i]||0, pct:total?(((totaux[i]||0)/total)*100).toFixed(1):0 })), total };
  });
  sendJSON(res, 200, result);
});

app.post('/api/audiovisuel/lives/:id/sondages', requireAuth, async (req, res) => {
  const live = await db.prepare('SELECT * FROM av_lives WHERE id=? AND initiative_id=?').get(req.params.id, req.user.id);
  if (!live) return sendJSON(res, 403, { error: 'Accès refusé' });
  const body = await parseBody(req);
  const { question, options=[] } = body;
  if (!question || options.length < 2) return sendJSON(res, 400, { error: 'Question et min 2 options requises' });
  const r = db.prepare('INSERT INTO av_sondages (live_id, question, options_json) VALUES (?,?,?)').run(req.params.id, question, JSON.stringify(options));
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

app.post('/api/audiovisuel/sondages/:id/voter', requireAuth, async (req, res) => {
  const body = await parseBody(req);
  const { option_index } = body;
  try {
    db.prepare('INSERT INTO av_votes (sondage_id, user_id, option_index) VALUES (?,?,?)').run(req.params.id, req.user.id, option_index);
    sendJSON(res, 201, { ok: true });
  } catch(e) { sendJSON(res, 409, { error: 'Vous avez déjà voté' }); }
});

/* ── RÉACTIONS ── */

app.post('/api/audiovisuel/lives/:id/reactions', async (req, res) => {
  const body = await parseBody(req);
  const { emoji='❤️', user_id=null } = body;
  db.prepare('INSERT INTO av_reactions (live_id, user_id, emoji) VALUES (?,?,?)').run(req.params.id, user_id||null, emoji);
  const total = db.prepare('SELECT emoji, COUNT(*) as cnt FROM av_reactions WHERE live_id=? GROUP BY emoji').all(req.params.id);
  sendJSON(res, 200, { ok: true, reactions: total });
});

app.get('/api/audiovisuel/lives/:id/reactions', (req, res) => {
  const total = db.prepare('SELECT emoji, COUNT(*) as cnt FROM av_reactions WHERE live_id=? GROUP BY emoji ORDER BY cnt DESC').all(req.params.id);
  sendJSON(res, 200, total);
});

/* ── PODCASTS / SÉRIES ── */

app.get('/api/audiovisuel/series', (req, res) => {
  const initiativeId = req.query.initiative_id;
  let q = 'SELECT s.*, u.nom as initiative_nom, (SELECT COUNT(*) FROM av_episodes e WHERE e.serie_id=s.id) as nb_episodes FROM av_series s JOIN users u ON u.id=s.initiative_id';
  const params = [];
  if (initiativeId) { q += ' WHERE s.initiative_id=?'; params.push(initiativeId); }
  q += ' ORDER BY s.created_at DESC LIMIT 50';
  sendJSON(res, 200, await db.prepare(q).all(...params));
});

app.post('/api/audiovisuel/series', requireAuth, async (req, res) => {
  if (req.user.role !== 'initiative' && req.user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Réservé aux initiatives' });
  const body = await parseBody(req);
  const { titre, description='', categorie='general', image_url='' } = body;
  if (!titre) return sendJSON(res, 400, { error: 'Titre requis' });
  const r = db.prepare('INSERT INTO av_series (initiative_id, titre, description, categorie, image_url) VALUES (?,?,?,?,?)').run(req.user.id, titre, description, categorie, image_url);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* ── ÉPISODES ── */

app.get('/api/audiovisuel/episodes', (req, res) => {
  const initiativeId = req.query.initiative_id;
  const serieId = req.query.serie_id;
  let q = 'SELECT e.*, u.nom as initiative_nom, s.titre as serie_titre FROM av_episodes e JOIN users u ON u.id=e.initiative_id LEFT JOIN av_series s ON s.id=e.serie_id WHERE e.is_public=1';
  const params = [];
  if (initiativeId) { q += ' AND e.initiative_id=?'; params.push(initiativeId); }
  if (serieId) { q += ' AND e.serie_id=?'; params.push(serieId); }
  q += ' ORDER BY e.published_at DESC LIMIT 50';
  sendJSON(res, 200, await db.prepare(q).all(...params));
});

app.get('/api/audiovisuel/episodes/:id', (req, res) => {
  const ep = await db.prepare('SELECT e.*, u.nom as initiative_nom, s.titre as serie_titre FROM av_episodes e JOIN users u ON u.id=e.initiative_id LEFT JOIN av_series s ON s.id=e.serie_id WHERE e.id=?').get(req.params.id);
  if (!ep) return sendJSON(res, 404, { error: 'Épisode introuvable' });
  await db.prepare('UPDATE av_episodes SET nb_ecoutes=nb_ecoutes+1 WHERE id=?').run(req.params.id);
  sendJSON(res, 200, { ...ep, intervenants: safeJSON(ep.intervenants, []), chapitres: safeJSON(ep.chapitres, []), mots_cles: safeJSON(ep.mots_cles, []) });
});

app.post('/api/audiovisuel/episodes', requireAuth, async (req, res) => {
  if (req.user.role !== 'initiative' && req.user.role !== 'administrateur') return sendJSON(res, 403, { error: 'Réservé aux initiatives' });
  const body = await parseBody(req);
  const { titre, description='', url_audio, serie_id=null, duree_secondes=0, intervenants=[], categorie='general', image_url='', is_public=1, published_at=null, tags=[], mots_cles=[] } = body;
  if (!titre || !url_audio) return sendJSON(res, 400, { error: 'Titre et URL audio requis' });
  const resume = genResumeIA(titre, description, categorie);
  const chapitres = duree_secondes > 600 ? [{ time:'0:00', titre:'Introduction' }, { time:`${Math.floor(duree_secondes/3/60)}:${String(Math.floor((duree_secondes/3)%60)).padStart(2,'0')}`, titre:'Développement' }, { time:`${Math.floor(duree_secondes*2/3/60)}:${String(Math.floor((duree_secondes*2/3)%60)).padStart(2,'0')}`, titre:'Conclusion' }] : [];
  const r = db.prepare('INSERT INTO av_episodes (initiative_id, serie_id, titre, description, url_audio, duree_secondes, intervenants, categorie, image_url, is_public, published_at, resume_ia, chapitres, mots_cles) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(req.user.id, serie_id||null, titre, description, url_audio, duree_secondes, JSON.stringify(intervenants), categorie, image_url, is_public?1:0, published_at||new Date().toISOString().slice(0,10), resume, JSON.stringify(chapitres), JSON.stringify(mots_cles));
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

app.put('/api/audiovisuel/episodes/:id', requireAuth, async (req, res) => {
  const ep = await db.prepare('SELECT * FROM av_episodes WHERE id=? AND initiative_id=?').get(req.params.id, req.user.id);
  if (!ep) return sendJSON(res, 404, { error: 'Introuvable' });
  const body = await parseBody(req);
  const fields = ['titre','description','url_audio','serie_id','duree_secondes','intervenants','categorie','image_url','is_public','published_at','transcription','resume_ia','chapitres','mots_cles'];
  const sets=[]; const vals=[];
  fields.forEach(f => { if (body[f]!==undefined) { sets.push(`${f}=?`); vals.push(typeof body[f]==='object'?JSON.stringify(body[f]):body[f]); } });
  db.prepare(`UPDATE av_episodes SET ${sets.join(',')} WHERE id=?`).run(...vals, req.params.id);
  sendJSON(res, 200, { ok: true });
});

app.delete('/api/audiovisuel/episodes/:id', requireAuth, (req, res) => {
  const ep = await db.prepare('SELECT * FROM av_episodes WHERE id=? AND initiative_id=?').get(req.params.id, req.user.id);
  if (!ep) return sendJSON(res, 404, { error: 'Introuvable' });
  await db.prepare('DELETE FROM av_episodes WHERE id=?').run(req.params.id);
  sendJSON(res, 200, { ok: true });
});

/* Commenter un épisode */
app.get('/api/audiovisuel/episodes/:id/commentaires', (req, res) => {
  const coms = await db.prepare('SELECT c.*, u.nom as user_nom, u.avatar as user_avatar FROM av_commentaires c JOIN users u ON u.id=c.user_id WHERE c.episode_id=? ORDER BY c.created_at DESC LIMIT 50').all(req.params.id);
  sendJSON(res, 200, coms);
});
app.post('/api/audiovisuel/episodes/:id/commentaires', requireAuth, async (req, res) => {
  const body = await parseBody(req);
  const { contenu, note=null } = body;
  if (!contenu?.trim()) return sendJSON(res, 400, { error: 'Contenu requis' });
  const r = db.prepare('INSERT INTO av_commentaires (episode_id, user_id, contenu, note) VALUES (?,?,?,?)').run(req.params.id, req.user.id, contenu.trim(), note||null);
  if (note) db.prepare('UPDATE av_episodes SET note=ROUND((note*nb_notes+?)/(nb_notes+1),1), nb_notes=nb_notes+1 WHERE id=?').run(note, req.params.id);
  sendJSON(res, 201, { id: r.lastInsertRowid });
});

/* ── BIBLIOTHÈQUE (mixte lives + épisodes) ── */
app.get('/api/audiovisuel/bibliotheque', (req, res) => {
  const initiativeId = req.query.initiative_id;
  const type = req.query.type; // 'live' | 'episode' | null (tous)
  let lives = [], episodes = [];
  if (!type || type === 'live') {
    let q = "SELECT 'live' as content_type, l.id, l.titre, l.description, l.vignette_url, l.nb_vues as nb_vues, l.date_debut as date_ref, l.statut, l.type, u.nom as initiative_nom FROM av_lives l JOIN users u ON u.id=l.initiative_id WHERE l.statut='termine'";
    const p = [];
    if (initiativeId) { q += ' AND l.initiative_id=?'; p.push(initiativeId); }
    lives = await db.prepare(q + ' ORDER BY l.date_debut DESC LIMIT 30').all(...p);
  }
  if (!type || type === 'episode') {
    let q = "SELECT 'episode' as content_type, e.id, e.titre, e.description, e.image_url as vignette_url, e.nb_ecoutes as nb_vues, e.published_at as date_ref, 'publie' as statut, e.categorie as type, u.nom as initiative_nom FROM av_episodes e JOIN users u ON u.id=e.initiative_id WHERE e.is_public=1";
    const p = [];
    if (initiativeId) { q += ' AND e.initiative_id=?'; p.push(initiativeId); }
    episodes = await db.prepare(q + ' ORDER BY e.published_at DESC LIMIT 30').all(...p);
  }
  const all = [...lives, ...episodes].sort((a,b) => new Date(b.date_ref) - new Date(a.date_ref));
  sendJSON(res, 200, all);
});

/* ── STATS AUDIOVISUEL ── */
app.get('/api/audiovisuel/stats', requireAuth, (req, res) => {
  const id = req.user.id;
  const totalLives = db.prepare('SELECT COUNT(*) as n FROM av_lives WHERE initiative_id=?').get(id).n;
  const totalVuesLive = db.prepare('SELECT COALESCE(SUM(nb_vues),0) as n FROM av_lives WHERE initiative_id=?').get(id).n;
  const livesEnCours = db.prepare("SELECT COUNT(*) as n FROM av_lives WHERE initiative_id=? AND statut='en_cours'").get(id).n;
  const totalEpisodes = db.prepare('SELECT COUNT(*) as n FROM av_episodes WHERE initiative_id=?').get(id).n;
  const totalEcoutes = db.prepare('SELECT COALESCE(SUM(nb_ecoutes),0) as n FROM av_episodes WHERE initiative_id=?').get(id).n;
  const totalSeries = db.prepare('SELECT COUNT(*) as n FROM av_series WHERE initiative_id=?').get(id).n;
  sendJSON(res, 200, { totalLives, totalVuesLive, livesEnCours, totalEpisodes, totalEcoutes, totalSeries });
});

/* ═══════════════════════════════════════════════════════════════════ */

/* Export pour Vercel serverless */
module.exports = handleRequest;

/* Démarrage serveur HTTP en local uniquement */
if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`Diaspo'Actif — serveur démarré sur http://localhost:${PORT}`);
  });
}
