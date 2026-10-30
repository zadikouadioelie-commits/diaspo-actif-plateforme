/* ═════════════════════════════════════════════════
   server/formation-acces.js — Lot 4 « Diaspo'Actif Formation » (2026-10-18)

   - Formateurs invités : l'administration autorise un expert (compte de n'importe quel type) à créer et animer des formations, sans qu'il soit
     Initiative Premium ni Partenaire. L'autorisation est révocable ; les formations déjà créées restent en place.
   - Aperçu gratuit : certaines leçons d'une formation payante sont offertes (formation_lecons.apercu_gratuit) ; GET /api/formations/:id/decouverte
     expose le plan complet mais le contenu de ces seules leçons, à tout visiteur — jamais celui des autres.
   - Mode de suivi de la progression (formations.suivi_mode) : auto | manuel | aucun, et l'envoi groupé « Enregistrer ma progression ».
   ═════════════════════════════════════════════════ */
"use strict";

const Droits = require("./formation-droits");
const SUIVI_MODES = ["auto", "manuel", "aucun"];

/* Un compte invité actif peut créer des formations. */
async function estInvite(db, userId) {
  if (!userId) return false;
  const r = await db.prepare("SELECT id FROM formation_formateurs_invites WHERE user_id=? AND statut='actif'").get(Number(userId));
  return !!r;
}

module.exports = { SUIVI_MODES, estInvite };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, checkFormationOwner, FormationParcours } = deps;
  const exiger = deps.exigerPremium;

  async function estAdmin(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    if (user.role !== "administrateur") { sendJSON(res, 403, { error: "Réservé à l'administration." }); return null; }
    return user;
  }

  /* ── Formateurs invités ── */

  /* GET /api/formateur/statut — ce compte peut-il créer des formations, et à quel titre ? (pilote l'affichage de l'Espace Formateur) */
  route("GET", "/api/formateur/statut", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    let source = null;
    if (user.role === "administrateur") source = "administration";
    else if (user.role === "partenaire") source = "partenaire";
    else if (await estInvite(db, user.id)) source = "invite";
    else if (user.role === "initiative" && await deps.hasAccreditation(user.id, "initiative_abonne")) source = "initiative_premium";
    sendJSON(res, 200, { peut_creer: !!source, source, role: user.role, premium_requis: user.role === "initiative" && !source });
  });

  route("GET", "/api/admin/formateurs-invites", async (req, res) => {
    if (!(await estAdmin(req, res))) return;
    const rows = await db.prepare(`SELECT fi.id, fi.user_id, fi.motif, fi.statut, fi.created_at, fi.revoque_le, u.nom, u.prenom, u.email, u.role,
      (SELECT COUNT(*) FROM formations f WHERE f.owner_user_id=fi.user_id) AS nb_formations
      FROM formation_formateurs_invites fi LEFT JOIN users u ON u.id=fi.user_id ORDER BY fi.id DESC`).all();
    sendJSON(res, 200, { invites: rows.map(r => ({ id: Number(r.id), user_id: Number(r.user_id), nom: [r.prenom, r.nom].filter(Boolean).join(" ") || "Compte supprimé", email: r.email || null, role: r.role || null,
      motif: r.motif || null, statut: r.statut, cree_le: r.created_at, revoque_le: r.revoque_le || null, nb_formations: Number(r.nb_formations) || 0 })) });
  });

  /* POST /api/admin/formateurs-invites { identifiant: e-mail ou numéro de compte, motif } */
  route("POST", "/api/admin/formateurs-invites", async (req, res, params, body) => {
    const admin = await estAdmin(req, res); if (!admin) return;
    const ident = String((body && body.identifiant) || "").trim();
    if (!ident) return sendJSON(res, 400, { error: "Indiquez l'e-mail ou le numéro du compte à inviter." });
    const u = /^\d+$/.test(ident)
      ? await db.prepare("SELECT id, nom, prenom, email, role FROM users WHERE id=?").get(Number(ident))
      : await db.prepare("SELECT id, nom, prenom, email, role FROM users WHERE LOWER(email)=LOWER(?)").get(ident);
    if (!u || u.nom === "Compte supprimé") return sendJSON(res, 404, { error: "Aucun compte actif ne correspond." });
    if (u.role === "administrateur" || u.role === "partenaire") return sendJSON(res, 400, { error: "Ce compte peut déjà créer des formations." });
    const motif = String((body && body.motif) || "").trim().slice(0, 300) || null;
    const ex = await db.prepare("SELECT * FROM formation_formateurs_invites WHERE user_id=?").get(Number(u.id));
    if (ex && ex.statut === "actif") return sendJSON(res, 409, { error: "Ce compte est déjà formateur invité." });
    if (ex) await db.prepare("UPDATE formation_formateurs_invites SET statut='actif', motif=?, invite_par=?, revoque_le=NULL WHERE id=?").run(motif, admin.id, ex.id);
    else await db.prepare("INSERT INTO formation_formateurs_invites (user_id, invite_par, motif) VALUES (?,?,?)").run(Number(u.id), admin.id, motif);
    if (typeof deps.creerNotif === "function") deps.creerNotif(u.id, "formation", "🎓 Vous êtes invité(e) comme formateur", "L'équipe Diaspo'Actif vous autorise à créer et animer des formations : ouvrez la page Formations, onglet « Espace Formateur ».", {});
    sendJSON(res, 201, { ok: true, user_id: Number(u.id), nom: [u.prenom, u.nom].filter(Boolean).join(" ") });
  });

  route("DELETE", "/api/admin/formateurs-invites/:userId", async (req, res, params) => {
    if (!(await estAdmin(req, res))) return;
    const ex = await db.prepare("SELECT * FROM formation_formateurs_invites WHERE user_id=? AND statut='actif'").get(Number(params.userId));
    if (!ex) return sendJSON(res, 404, { error: "Aucun formateur invité actif pour ce compte." });
    await db.prepare("UPDATE formation_formateurs_invites SET statut='revoque', revoque_le=datetime('now') WHERE id=?").run(ex.id);
    sendJSON(res, 200, { ok: true });
  });

  /* ── Mode de suivi de la progression ── */

  /* PUT /api/formations/:id/reglages { suivi_mode } */
  route("PUT", "/api/formations/:id/reglages", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
    if (!checkFormationOwner(f, user)) return sendJSON(res, 403, { error: "Interdit." });
    if (!(await exiger(user, res, "formations"))) return;
    /* Durée d'accès des apprenants (jours ; vide = illimitée) : réglable à tout moment, elle ne s'applique qu'aux accès ouverts ensuite. */
    if (body && body.duree_acces_jours !== undefined && body.suivi_mode === undefined) {
      const brut = body.duree_acces_jours;
      const j = brut === null || brut === "" ? null : Math.floor(Number(brut));
      if (j !== null && (!Number.isFinite(j) || j < 1 || j > 3650)) return sendJSON(res, 400, { error: "La durée d'accès doit être comprise entre 1 et 3650 jours (ou vide pour un accès illimité)." });
      await db.prepare("UPDATE formations SET duree_acces_jours=? WHERE id=?").run(j, params.id);
      return sendJSON(res, 200, { ok: true, duree_acces_jours: j });
    }
    if (!["brouillon", "refusee"].includes(f.statut || "brouillon") && user.role !== "administrateur") return sendJSON(res, 400, { error: "Le mode de suivi ne se change que sur une formation en brouillon ou refusée : des apprenants peuvent déjà la suivre." });
    const mode = String((body && body.suivi_mode) || "");
    if (!SUIVI_MODES.includes(mode)) return sendJSON(res, 400, { error: "Mode de suivi inconnu (auto, manuel ou aucun)." });
    if (mode === "aucun") {
      if (Number(f.certificat_actif)) return sendJSON(res, 400, { error: "Sans suivi de progression, aucun document ne peut être délivré : désactivez d'abord l'attestation / le certificat (onglet « Certificat »).", code: "certificat_actif" });
      const nbQuiz = Number((await db.prepare("SELECT COUNT(*) AS n FROM formation_quiz WHERE formation_id=?").get(params.id) || {}).n) || 0;
      if (nbQuiz) return sendJSON(res, 400, { error: "Cette formation contient des quiz : ils valident la progression, ils sont incompatibles avec l'absence de suivi.", code: "quiz_presents" });
    }
    await db.prepare("UPDATE formations SET suivi_mode=? WHERE id=?").run(mode, params.id);
    sendJSON(res, 200, { ok: true, suivi_mode: mode });
  });

  /* POST /api/formations/:id/progression-lot { lecons: [{ id, termine }] } — mode « manuel » : l'apprenant coche, puis enregistre d'un seul geste. */
  route("POST", "/api/formations/:id/progression-lot", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const lim = SEC.rateLimit(`progression-lot:${user.id}`, 60, 600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop d'enregistrements. Réessayez dans ${lim.retryAfter}s.` });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
    await Droits.balayerExpirations(db, { userId: user.id, formationId: f.id });
    const inscription = await db.prepare("SELECT * FROM formation_inscriptions WHERE formation_id=? AND user_id=? AND statut='active' AND COALESCE(paiement_statut,'paye')<>'en_attente'").get(params.id, user.id);
    if (!inscription) return sendJSON(res, 403, { error: "Vous devez être inscrit pour suivre cette formation." });
    if (f.suivi_mode === "aucun") return sendJSON(res, 409, { error: "Cette formation n'enregistre pas de progression.", code: "suivi_desactive" });
    const liste = Array.isArray(body && body.lecons) ? body.lecons.slice(0, 300) : [];
    const autorises = await Droits.modulesAutorises(db, inscription);
    const valides = new Set((await db.prepare("SELECT l.id, l.module_id FROM formation_lecons l JOIN formation_modules m ON m.id=l.module_id WHERE m.formation_id=?").all(params.id)).filter(l => !autorises || autorises.has(Number(l.module_id))).map(l => Number(l.id)));
    const quizLecons = new Set((await db.prepare("SELECT lecon_id FROM formation_quiz WHERE formation_id=? AND lecon_id IS NOT NULL").all(params.id)).map(q => Number(q.lecon_id)));
    let appliquees = 0, ignorees = 0; const refusees = [];
    for (const e of liste) {
      const id = Number(e && e.id), termine = e && e.termine ? 1 : 0;
      if (!valides.has(id)) { ignorees++; continue; }
      if (termine && quizLecons.has(id)) { refusees.push(id); continue; }
      /* Studio : une vidéo « à regarder » doit avoir été regardée avant de valider la leçon (même règle que la validation à l'unité). */
      if (termine && (await require("./formation-studio").videosManquantes(id, user.id)).length) { refusees.push(id); continue; }
      const ex = await db.prepare("SELECT id FROM formation_lecons_progression WHERE inscription_id=? AND lecon_id=?").get(inscription.id, id);
      if (ex) await db.prepare("UPDATE formation_lecons_progression SET termine=?, date_completion=? WHERE id=?").run(termine, termine ? new Date().toISOString() : null, ex.id);
      else await db.prepare("INSERT INTO formation_lecons_progression (inscription_id, lecon_id, termine, date_completion) VALUES (?,?,?,?)").run(inscription.id, id, termine, termine ? new Date().toISOString() : null);
      appliquees++;
    }
    const parcours = await FormationParcours.construireParcours(db, f, inscription);
    await db.prepare("UPDATE formation_inscriptions SET avancement_pct=?, derniere_activite_le=datetime('now'), relance_inactivite_le=NULL WHERE id=?").run(parcours.avancement_pct, inscription.id);
    const att = await FormationParcours.evaluerAttestation({ db, creerNotif: deps.creerNotif, nomCompteAffichage: deps.nomCompteAffichage }, inscription.id);
    sendJSON(res, 200, { ok: true, appliquees, ignorees, refusees, avancement_pct: parcours.avancement_pct, statut: parcours.statut, prochaine_lecon_id: parcours.prochaine_lecon_id, attestation: att ? FormationParcours.vueAttestation(att) : null });
  });

  /* ── Aperçu gratuit ── */

  /* GET /api/formations/:id/decouverte — plan de la formation + contenu des SEULES leçons offertes. Public (aucune donnée personnelle), limité par IP. */
  route("GET", "/api/formations/:id/decouverte", async (req, res, params) => {
    const lim = SEC.rateLimit(`formation-decouverte:${SEC.clientIp(req)}`, 120, 600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop de requêtes. Réessayez dans ${lim.retryAfter}s.` });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f || (f.statut || "brouillon") !== "publiee") return sendJSON(res, 404, { error: "Formation introuvable ou non publiée." });
    if (f.acces_type && f.acces_type !== "public") return sendJSON(res, 403, { error: "Cette formation est réservée à des invités : l'aperçu n'est pas disponible." });
    const modules = await db.prepare("SELECT id, titre, ordre FROM formation_modules WHERE formation_id=? ORDER BY ordre ASC, id ASC").all(params.id);
    let nbApercu = 0, nbLecons = 0;
    for (const m of modules) {
      m.chapitres = await db.prepare("SELECT id, titre, ordre FROM formation_chapitres WHERE module_id=? ORDER BY ordre ASC, id ASC").all(m.id);
      for (const c of m.chapitres) {
        const lecons = await db.prepare("SELECT * FROM formation_lecons WHERE chapitre_id=? ORDER BY ordre ASC, id ASC").all(c.id);
        c.lecons = lecons.map(l => {
          nbLecons++;
          const offerte = Number(l.apercu_gratuit) === 1 && l.type !== "quiz";
          if (offerte) nbApercu++;
          const base = { id: Number(l.id), titre: l.titre, type: l.type, duree_minutes: l.duree_minutes || null, apercu_gratuit: offerte };
          /* Contenu : uniquement pour une leçon offerte. */
          return offerte ? { ...base, description: l.description || null, contenu_url: l.contenu_url || null, contenu_texte: l.contenu_texte || null } : base;
        });
      }
    }
    sendJSON(res, 200, {
      formation: { id: Number(f.id), titre: f.titre, organisme: f.organisme || null, mode_acces: f.mode_acces, gratuit: Number(f.gratuit) === 1, prix: f.prix, devise: f.devise || "EUR" },
      modules, nb_lecons: nbLecons, nb_apercu: nbApercu,
    });
  });
};
