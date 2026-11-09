/* ═════════════════════════════════════════════════
   server/ida-demandes-createur.js — Influenceur Diaspo'Actif (IDA) : demande d'accès créateur (2026-11-09, demande explicite)

   - Le bouton « Devenir créateur » d'influenceur.html ouvre une fiche de demande (thèmes, objectif,
     autres réseaux de diffusion, métier en lien avec le journalisme) réservée aux comptes Initiative
     et Utilisateur, Premium actif (même règle que exigerPremium ailleurs sur la plateforme).
   - La demande part vers le compte Administrateur (notification + module dédié « Influenceur DA »,
     dashboard-administrateur.html#ida-demandes) : Autoriser ou Décliner, avec ou sans commentaire.
   - « Autoriser » ne débloque rien de plus pour l'instant (la rubrique elle-même est fermée, voir
     server/acces-reserve.js) : seul le statut de la demande change, pour que la personne sache où
     elle en est. Rien d'autre n'est décidé ici.
   ═════════════════════════════════════════════════ */
"use strict";

const STATUTS = ["en_attente", "autorisee", "declinee"];
/* Doit rester identique à var THEMES dans influenceur.html. */
const THEMES = ["Entrepreneuriat & Business", "Développement & Impact", "Culture & Identité", "Innovation & Technologie", "Éducation & Formation", "Diaspora & Mobilité", "Leadership & Inspiration", "Société & Citoyenneté"];
const MAX_LIENS = 5;

module.exports = { STATUTS, THEMES };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, creerNotif, nomCompteAffichage, exigerPremium } = deps;

  async function estAdmin(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    if (user.role !== "administrateur") { sendJSON(res, 403, { error: "Réservé à l'administration." }); return null; }
    return user;
  }

  function parseJson(s, repli) { try { const v = JSON.parse(s || "null"); return v == null ? repli : v; } catch (e) { return repli; } }

  function formatDemande(d) {
    return {
      id: Number(d.id), statut: d.statut,
      themes: parseJson(d.themes_json, []), objectif: d.objectif || "",
      autres_reseaux: !!d.autres_reseaux, liens: parseJson(d.liens_json, []),
      metier_journalisme: !!d.metier_journalisme, metier_precision: d.metier_precision || "",
      commentaire_admin: d.commentaire_admin || null,
      cree_le: d.created_at, decide_le: d.decide_le || null,
    };
  }

  /* GET /api/ida/demande — état de ce compte vis-à-vis du bouton « Devenir créateur » (rôle, Premium, demande en cours). */
  route("GET", "/api/ida/demande", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const role_ok = ["initiative", "utilisateur"].includes(user.role);
    let premium_actif = false;
    if (role_ok) {
      const st = await deps.getPremiumStatut(user.id, user.role);
      premium_actif = !st.concerne || st.actif;
    }
    const d = await db.prepare("SELECT * FROM ida_demandes_createur WHERE user_id=? ORDER BY id DESC LIMIT 1").get(Number(user.id));
    sendJSON(res, 200, { role_ok, premium_actif, demande: d ? formatDemande(d) : null });
  });

  /* POST /api/ida/demande — dépose (ou met à jour, tant qu'en attente) la fiche de demande. */
  route("POST", "/api/ida/demande", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    if (!["initiative", "utilisateur"].includes(user.role)) return sendJSON(res, 403, { error: "Devenir créateur Influenceur Diaspo'Actif est réservé aux comptes Initiative et Utilisateur." });
    if (!(await exigerPremium(user, res, "ida"))) return;

    const themes = Array.isArray(body.themes) ? body.themes.filter(t => THEMES.includes(t)) : [];
    if (!themes.length) return sendJSON(res, 400, { error: "Choisissez au moins un thème dans la liste proposée." });
    const objectif = String(body.objectif || "").trim().slice(0, 2000);
    if (!objectif) return sendJSON(res, 400, { error: "L'objectif est requis." });
    const autresReseaux = !!body.autres_reseaux;
    let liens = [];
    if (autresReseaux) {
      liens = (Array.isArray(body.liens) ? body.liens : []).map(l => String(l || "").trim()).filter(Boolean).slice(0, MAX_LIENS);
      if (!liens.length) return sendJSON(res, 400, { error: "Ajoutez au moins un lien, ou indiquez que vous n'avez pas d'autres réseaux de diffusion." });
      for (const l of liens) { if (!/^https?:\/\/\S+$/i.test(l)) return sendJSON(res, 400, { error: "Chaque lien doit être une adresse complète commençant par http:// ou https://." }); }
    }
    const metierJournalisme = !!body.metier_journalisme;
    const metierPrecision = metierJournalisme ? String(body.metier_precision || "").trim().slice(0, 300) : null;
    if (metierJournalisme && !metierPrecision) return sendJSON(res, 400, { error: "Précisez votre métier en lien avec le journalisme." });

    const existante = await db.prepare("SELECT id FROM ida_demandes_createur WHERE user_id=? AND statut='en_attente'").get(Number(user.id));
    const valeurs = [JSON.stringify(themes), objectif, autresReseaux ? 1 : 0, JSON.stringify(liens), metierJournalisme ? 1 : 0, metierPrecision];
    let id;
    if (existante) {
      id = Number(existante.id);
      await db.prepare(`UPDATE ida_demandes_createur SET themes_json=?, objectif=?, autres_reseaux=?, liens_json=?, metier_journalisme=?, metier_precision=? WHERE id=?`)
        .run(...valeurs, id);
    } else {
      const r = await db.prepare(`INSERT INTO ida_demandes_createur (user_id, themes_json, objectif, autres_reseaux, liens_json, metier_journalisme, metier_precision) VALUES (?,?,?,?,?,?,?)`)
        .run(Number(user.id), ...valeurs);
      id = Number(r && (r.lastInsertRowid || r.lastID || r.id)) || null;
      const nom = (await nomCompteAffichage(user.id)) || [user.prenom, user.nom].filter(Boolean).join(" ") || "Un compte";
      const admins = await db.prepare("SELECT id FROM users WHERE role='administrateur'").all();
      for (const a of admins) {
        await creerNotif(a.id, "ida_demande_createur", "🎙️ Demande créateur Influenceur DA",
          `${nom} demande à devenir créateur sur Influenceur Diaspo'Actif.`, { lien: "dashboard-administrateur.html#ida-demandes" });
      }
    }
    sendJSON(res, existante ? 200 : 201, { ok: true, id });
  });

  /* GET /api/admin/ida-demandes?statut=en_attente|autorisee|declinee|toutes */
  route("GET", "/api/admin/ida-demandes", async (req, res, params, body, query) => {
    if (!(await estAdmin(req, res))) return;
    const statut = String((query && query.statut) || "en_attente");
    const filtre = STATUTS.includes(statut) ? " WHERE d.statut=?" : "";
    const rows = await db.prepare(`SELECT d.*, u.nom, u.prenom, u.email, u.role
      FROM ida_demandes_createur d LEFT JOIN users u ON u.id=d.user_id${filtre} ORDER BY d.id DESC LIMIT 300`).all(...(filtre ? [statut] : []));
    const demandes = [];
    for (const r of rows) {
      demandes.push(Object.assign(formatDemande(r), {
        user_id: Number(r.user_id),
        nom: (await nomCompteAffichage(r.user_id)) || [r.prenom, r.nom].filter(Boolean).join(" ") || "Compte supprimé",
        email: r.email || null, role: r.role,
      }));
    }
    const n = await db.prepare("SELECT COUNT(*) AS n FROM ida_demandes_createur WHERE statut='en_attente'").get();
    sendJSON(res, 200, { demandes, nb_en_attente: Number(n && n.n) || 0 });
  });

  /* POST /api/admin/ida-demandes/:id/autoriser | /decliner — body { commentaire } facultatif dans les deux cas. */
  async function decider(req, res, params, body, autoriser) {
    const admin = await estAdmin(req, res); if (!admin) return;
    const d = await db.prepare("SELECT * FROM ida_demandes_createur WHERE id=?").get(Number(params.id));
    if (!d) return sendJSON(res, 404, { error: "Demande introuvable." });
    if (d.statut !== "en_attente") return sendJSON(res, 409, { error: "Cette demande a déjà reçu une réponse." });
    const commentaire = String((body && body.commentaire) || "").trim().slice(0, 1000) || null;
    await db.prepare("UPDATE ida_demandes_createur SET statut=?, commentaire_admin=?, decide_le=datetime('now'), decide_par=? WHERE id=?")
      .run(autoriser ? "autorisee" : "declinee", commentaire, admin.id, Number(d.id));
    await creerNotif(d.user_id, "ida_demande_reponse",
      autoriser ? "🎙️ Créateur Influenceur DA autorisé" : "Demande créateur Influenceur DA",
      (autoriser ? "Diaspo'Actif a autorisé votre demande pour devenir créateur sur Influenceur Diaspo'Actif." : "Diaspo'Actif n'a pas retenu votre demande pour devenir créateur sur Influenceur Diaspo'Actif.")
        + (commentaire ? " Commentaire : " + commentaire : ""),
      { lien: "influenceur.html" });
    sendJSON(res, 200, { ok: true, statut: autoriser ? "autorisee" : "declinee" });
  }
  route("POST", "/api/admin/ida-demandes/:id/autoriser", (req, res, params, body) => decider(req, res, params, body, true));
  route("POST", "/api/admin/ida-demandes/:id/decliner", (req, res, params, body) => decider(req, res, params, body, false));
};
