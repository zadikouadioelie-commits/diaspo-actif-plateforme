/* ═════════════════════════════════════════════════
   server/formation-demandes-formateur.js — Module « Création de formation » : demande d'accès formateur (2026-10-31)

   - Seul un compte INITIATIVE peut demander à devenir formateur : un compte Utilisateur n'a pas d'onglet formateur et la route le refuse.
   - La demande avertit les administrateurs (notification = la petite cloche) et apparaît dans leur module « Demandes de compte formateur ».
   - L'administrateur accepte ou refuse, SANS motif. Accepter ouvre le droit de créer des formations en réutilisant les formateurs invités
     (formation_formateurs_invites, voir formation-acces.js) : toutes les règles existantes de création s'appliquent donc sans rien changer.
   - Les règles de prix (payant / gratuit) viendront ensuite : rien n'est décidé ici.
   ═════════════════════════════════════════════════ */
"use strict";

const Acces = require("./formation-acces");

const STATUTS = ["en_attente", "acceptee", "refusee"];

module.exports = { STATUTS };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, creerNotif, nomCompteAffichage } = deps;

  async function estAdmin(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    if (user.role !== "administrateur") { sendJSON(res, 403, { error: "Réservé à l'administration." }); return null; }
    return user;
  }

  /* Ce compte peut-il déjà créer des formations, et à quel titre ? (même logique que GET /api/formateur/statut) */
  async function sourceFormateur(user) {
    if (user.role === "administrateur") return "administration";
    if (user.role === "partenaire") return "partenaire";
    if (user.role === "initiative") return Acces.accesFormateurInitiative(db, user.id);
    if (await Acces.estInvite(db, user.id)) return "invite";
    return null;
  }

  /* GET /api/formateur/demande — l'état de ce compte vis-à-vis de l'espace formateur (pilote l'onglet « Formateur ») */
  route("GET", "/api/formateur/demande", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const eligible = user.role === "initiative";
    const source = eligible ? await sourceFormateur(user) : null;
    const d = eligible ? await db.prepare("SELECT id, statut, created_at, decide_le FROM formation_demandes_formateur WHERE user_id=? ORDER BY id DESC LIMIT 1").get(Number(user.id)) : null;
    sendJSON(res, 200, {
      role: user.role, eligible, peut_creer: !!source, source,
      demande: d ? { id: Number(d.id), statut: d.statut, cree_le: d.created_at, decide_le: d.decide_le || null } : null,
    });
  });

  /* POST /api/formateur/demande — « Demander à devenir formateur » */
  route("POST", "/api/formateur/demande", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    if (user.role !== "initiative") return sendJSON(res, 403, { error: "L'espace formateur est réservé aux comptes Initiative." });
    if (await sourceFormateur(user)) return sendJSON(res, 409, { error: "Votre compte peut déjà créer des formations." });
    const ouverte = await db.prepare("SELECT id FROM formation_demandes_formateur WHERE user_id=? AND statut='en_attente'").get(Number(user.id));
    if (ouverte) return sendJSON(res, 409, { error: "Votre demande est déjà en attente de réponse." });
    const r = await db.prepare("INSERT INTO formation_demandes_formateur (user_id) VALUES (?)").run(Number(user.id));
    const id = Number(r && (r.lastInsertRowid || r.lastID || r.id)) || null;
    const nom = (await nomCompteAffichage(user.id)) || [user.prenom, user.nom].filter(Boolean).join(" ") || "Un compte Initiative";
    const admins = await db.prepare("SELECT id FROM users WHERE role='administrateur'").all();
    for (const a of admins) {
      await creerNotif(a.id, "formation_demande_formateur", "🎓 Demande de compte formateur",
        `${nom} demande l'accès au module Création de formation (compte formateur).`, { lien: "dashboard-administrateur.html#demandes-formateur", demande_id_formateur: id });
    }
    sendJSON(res, 201, { ok: true, id });
  });

  /* GET /api/admin/demandes-formateur?statut=en_attente|acceptee|refusee|toutes */
  route("GET", "/api/admin/demandes-formateur", async (req, res, params, body, query) => {
    if (!(await estAdmin(req, res))) return;
    const statut = String((query && query.statut) || "en_attente");
    const filtre = STATUTS.includes(statut) ? " WHERE d.statut=?" : "";
    const rows = await db.prepare(`SELECT d.id, d.user_id, d.statut, d.created_at, d.decide_le, u.nom, u.prenom, u.email, u.role
      FROM formation_demandes_formateur d LEFT JOIN users u ON u.id=d.user_id${filtre} ORDER BY d.id DESC LIMIT 300`).all(...(filtre ? [statut] : []));
    const demandes = [];
    for (const r of rows) {
      demandes.push({
        id: Number(r.id), user_id: Number(r.user_id), statut: r.statut, cree_le: r.created_at, decide_le: r.decide_le || null,
        nom: (await nomCompteAffichage(r.user_id)) || [r.prenom, r.nom].filter(Boolean).join(" ") || "Compte supprimé",
        email: r.email || null,
      });
    }
    const n = await db.prepare("SELECT COUNT(*) AS n FROM formation_demandes_formateur WHERE statut='en_attente'").get();
    sendJSON(res, 200, { demandes, nb_en_attente: Number(n && n.n) || 0 });
  });

  /* POST /api/admin/demandes-formateur/:id/accepter | /refuser — sans motif */
  async function decider(req, res, params, accepter) {
    const admin = await estAdmin(req, res); if (!admin) return;
    const d = await db.prepare("SELECT * FROM formation_demandes_formateur WHERE id=?").get(Number(params.id));
    if (!d) return sendJSON(res, 404, { error: "Demande introuvable." });
    if (d.statut !== "en_attente") return sendJSON(res, 409, { error: "Cette demande a déjà reçu une réponse." });
    if (accepter) {
      const ex = await db.prepare("SELECT * FROM formation_formateurs_invites WHERE user_id=?").get(Number(d.user_id));
      if (ex) await db.prepare("UPDATE formation_formateurs_invites SET statut='actif', motif=?, invite_par=?, revoque_le=NULL WHERE id=?").run("Demande de compte formateur acceptée", admin.id, ex.id);
      else await db.prepare("INSERT INTO formation_formateurs_invites (user_id, invite_par, motif) VALUES (?,?,?)").run(Number(d.user_id), admin.id, "Demande de compte formateur acceptée");
    }
    await db.prepare("UPDATE formation_demandes_formateur SET statut=?, decide_le=datetime('now'), decide_par=? WHERE id=?").run(accepter ? "acceptee" : "refusee", admin.id, Number(d.id));
    await creerNotif(d.user_id, "formation_formateur_reponse",
      accepter ? "🎓 Vous êtes formateur" : "Demande de compte formateur",
      accepter ? "Diaspo'Actif a accepté votre demande : le module « Création de formation » est ouvert, vous pouvez créer des formations."
               : "Diaspo'Actif n'a pas retenu votre demande de compte formateur.",
      { lien: "dashboard-initiative.html#formations-gestion" });
    sendJSON(res, 200, { ok: true, statut: accepter ? "acceptee" : "refusee" });
  }
  route("POST", "/api/admin/demandes-formateur/:id/accepter", (req, res, params) => decider(req, res, params, true));
  route("POST", "/api/admin/demandes-formateur/:id/refuser", (req, res, params) => decider(req, res, params, false));
};
