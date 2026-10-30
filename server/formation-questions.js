/* ═════════════════════════════════════════════════
   server/formation-questions.js — Formation Diaspora : QUESTIONS PRIVÉES de l'élève au formateur (2026-10-30)

   - Le formateur active ou non le canal MODULE PAR MODULE (formation_modules.questions_actives, désactivé par défaut).
   - L'élève (inscrit, avec accès à ce module) pose sa question depuis le lecteur : elle arrive dans la MESSAGERIE du formateur, dans l'onglet
     « Messages de formation » (la conversation élève ↔ formateur existante, ou une nouvelle de contexte « formation »). La question garde son lien avec
     la formation, le module et la leçon (formation_questions) ; le formateur la traite : une réponse écrite dans la conversation la marque « traitée »,
     et un bouton permet de la rouvrir ou de la clore à la main.
   - Destinataire : le propriétaire de la formation (un formateur invité qui a créé sa formation en est le propriétaire) ; à défaut, le propriétaire de l'initiative.
   - Ce n'est PAS l'espace d'échange public de la leçon (formation-echanges.js) : ici personne d'autre ne voit la question.
   ═════════════════════════════════════════════════ */
"use strict";
const Droits = require("./formation-droits");

const MAX_TEXTE = 1000;
const nettoyer = s => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\r\n/g, "\n").trim();

/* ── Fonctions appelées par les routes de messagerie (server/index.js) ── */

/* Résumé pour un compte : a-t-il des questions de formation (comme élève ou comme formateur), combien sont à traiter, et dans quelles conversations. */
async function resume(db, userId) {
  const rows = await db.prepare("SELECT conversation_id, formateur_id, statut FROM formation_questions WHERE eleve_id=? OR formateur_id=?").all(Number(userId), Number(userId));
  const convIds = new Set(rows.map(r => Number(r.conversation_id)));
  const ouvertes = {};
  let aTraiter = 0;
  rows.forEach(r => { if (Number(r.formateur_id) === Number(userId) && r.statut === "ouverte") { aTraiter++; ouvertes[Number(r.conversation_id)] = (ouvertes[Number(r.conversation_id)] || 0) + 1; } });
  return { actif: rows.length > 0, convIds, ouvertes, aTraiter };
}

/* Les questions d'une conversation, avec le contexte (formation, module, leçon), pour le panneau de la messagerie. */
async function questionsDeConversation(db, convId, userId) {
  const rows = await db.prepare(`SELECT q.id, q.statut, q.created_at, q.traitee_le, q.eleve_id, q.formateur_id, f.titre AS formation_titre, m.titre AS module_titre, l.titre AS lecon_titre, (SELECT contenu FROM messages WHERE id=q.message_id) AS contenu
    FROM formation_questions q LEFT JOIN formations f ON f.id=q.formation_id LEFT JOIN formation_modules m ON m.id=q.module_id LEFT JOIN formation_lecons l ON l.id=q.lecon_id
    WHERE q.conversation_id=? AND (q.eleve_id=? OR q.formateur_id=?) ORDER BY q.id DESC LIMIT 50`).all(Number(convId), Number(userId), Number(userId));
  return rows.map(r => ({ id: Number(r.id), statut: r.statut, date: r.created_at, traitee_le: r.traitee_le || null, formation: r.formation_titre || "Formation supprimée", module: r.module_titre || null, lecon: r.lecon_titre || null, extrait: String(r.contenu || "").split("\n\n").slice(1).join(" ").slice(0, 80),
    en_tant_que: Number(r.formateur_id) === Number(userId) ? "formateur" : "eleve" }));
}

/* Le formateur répond dans la conversation : ses questions ouvertes passent à « traitée ». Renvoie le nombre de questions closes. */
async function apresMessage(db, convId, senderId) {
  const ouvertes = await db.prepare("SELECT id FROM formation_questions WHERE conversation_id=? AND formateur_id=? AND statut='ouverte'").all(Number(convId), Number(senderId));
  if (!ouvertes.length) return 0;
  await db.prepare("UPDATE formation_questions SET statut='traitee', traitee_le=datetime('now') WHERE conversation_id=? AND formateur_id=? AND statut='ouverte'").run(Number(convId), Number(senderId));
  return ouvertes.length;
}

module.exports = { resume, questionsDeConversation, apresMessage, MAX_TEXTE };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, creerNotif, nomCompteAffichage, contactBloque } = deps;

  /* POST /api/formations/:id/modules/:moduleId/question { texte, lecon_id? } */
  route("POST", "/api/formations/:id/modules/:moduleId/question", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const lim = SEC.rateLimit(`formation-question:${user.id}`, 10, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Vous avez posé beaucoup de questions en peu de temps. Réessayez dans ${Math.ceil(lim.retryAfter / 60)} min.` });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f || f.statut !== "publiee") return sendJSON(res, 404, { error: "Formation introuvable." });
    const module = await db.prepare("SELECT * FROM formation_modules WHERE id=? AND formation_id=?").get(params.moduleId, f.id);
    if (!module) return sendJSON(res, 404, { error: "Module introuvable." });
    /* Interrupteur du formateur : vérifié ICI, jamais seulement par l'affichage du bouton. */
    if (!Number(module.questions_actives)) return sendJSON(res, 403, { error: "Le formateur n'a pas activé les questions sur ce module.", code: "questions_desactivees" });
    let formateurId = f.owner_user_id ? Number(f.owner_user_id) : null;
    if (!formateurId && f.initiative_id) { const ini = await db.prepare("SELECT owner_user_id FROM initiatives WHERE id=?").get(f.initiative_id); formateurId = ini && ini.owner_user_id ? Number(ini.owner_user_id) : null; }
    if (!formateurId) return sendJSON(res, 409, { error: "Cette formation n'a pas de formateur joignable pour le moment." });
    if (Number(user.id) === formateurId) return sendJSON(res, 400, { error: "Vous êtes le formateur de cette formation : répondez aux questions depuis la messagerie." });
    /* L'élève doit avoir accès à CE module (inscription active et payée, module obtenu). */
    await Droits.balayerExpirations(db, { userId: user.id, formationId: f.id });
    const insc = await db.prepare("SELECT * FROM formation_inscriptions WHERE formation_id=? AND user_id=? AND statut='active' AND COALESCE(paiement_statut,'paye')='paye'").get(f.id, user.id);
    const autorises = insc ? await Droits.modulesAutorises(db, insc) : null;
    if (!insc || (autorises && !autorises.has(Number(module.id)))) return sendJSON(res, 403, { error: "Vous devez avoir accès à ce module pour poser une question." });
    const texte = nettoyer(body && body.texte);
    if (texte.length < 5) return sendJSON(res, 400, { error: "Écrivez votre question (5 caractères au minimum)." });
    if (texte.length > MAX_TEXTE) return sendJSON(res, 400, { error: `Votre question est trop longue (${MAX_TEXTE} caractères au maximum).` });
    let lecon = null;
    if (body && body.lecon_id) lecon = await db.prepare("SELECT id, titre FROM formation_lecons WHERE id=? AND module_id=?").get(body.lecon_id, module.id);
    if (await contactBloque(user.id, formateurId)) return sendJSON(res, 403, { error: "Aucun échange n'est possible avec ce formateur.", code: "contact_bloque" });
    /* Anti-doublon : la même question envoyée deux fois de suite (double clic, retour arrière). */
    const doublon = await db.prepare("SELECT q.id FROM formation_questions q JOIN messages m ON m.id=q.message_id WHERE q.eleve_id=? AND q.module_id=? AND m.contenu LIKE ? AND q.created_at > datetime('now','-10 minutes')").get(user.id, module.id, "%" + texte.slice(0, 80).replace(/[%_]/g, "") + "%");
    if (doublon) return sendJSON(res, 409, { error: "Cette question vient déjà d'être envoyée au formateur." });

    /* La conversation élève ↔ formateur : celle qui existe déjà, sinon une nouvelle de contexte « formation » (canal ouvert sans demande de contact préalable). */
    let conv = await db.prepare("SELECT * FROM conversations WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)").get(user.id, formateurId, formateurId, user.id);
    if (!conv) {
      const id = (await db.prepare("INSERT INTO conversations (user1_id, user2_id, sujet, contexte) VALUES (?,?,?,'formation')").run(user.id, formateurId, "Questions de formation")).lastInsertRowid;
      conv = { id, user1_id: user.id, user2_id: formateurId };
    } else {
      /* Elle réapparaît chez les deux si l'un l'avait supprimée ou archivée. */
      await db.prepare("UPDATE conversations SET deleted_u1=0, deleted_u2=0, archive_u1=0, archive_u2=0 WHERE id=?").run(conv.id);
    }
    const entete = `🎓 Question — ${f.titre} › ${module.titre}${lecon ? " › " + lecon.titre : ""}`;
    const mid = (await db.prepare("INSERT INTO messages (conversation_id, sender_id, contenu, type) VALUES (?,?,?,'text')").run(conv.id, user.id, entete + "\n\n" + texte)).lastInsertRowid;
    const qid = (await db.prepare("INSERT INTO formation_questions (formation_id, module_id, lecon_id, eleve_id, formateur_id, conversation_id, message_id) VALUES (?,?,?,?,?,?,?)")
      .run(f.id, module.id, lecon ? lecon.id : null, user.id, formateurId, conv.id, mid)).lastInsertRowid;
    creerNotif(formateurId, "message", "🎓 Question d'un élève", `${await nomCompteAffichage(user.id)} pose une question sur « ${module.titre} » (${f.titre}).`, { conversation_id: conv.id, formation_id: f.id });
    sendJSON(res, 201, { ok: true, question_id: Number(qid), conversation_id: Number(conv.id), formateur_id: formateurId });
  });

  /* PATCH /api/formation-questions/:id { statut: "traitee" | "ouverte" } — le formateur clôt ou rouvre une question à la main. */
  route("PATCH", "/api/formation-questions/:id", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const q = await db.prepare("SELECT * FROM formation_questions WHERE id=?").get(params.id);
    if (!q || Number(q.formateur_id) !== Number(user.id)) return sendJSON(res, 404, { error: "Question introuvable." });
    const statut = body && body.statut;
    if (statut !== "traitee" && statut !== "ouverte") return sendJSON(res, 400, { error: "Statut inconnu (traitee ou ouverte)." });
    await db.prepare("UPDATE formation_questions SET statut=?, traitee_le=CASE WHEN ?='traitee' THEN datetime('now') ELSE NULL END WHERE id=?").run(statut, statut, q.id);
    sendJSON(res, 200, { ok: true, statut });
  });
};
