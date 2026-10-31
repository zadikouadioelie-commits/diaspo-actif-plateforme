/* ═════════════════════════════════════════════════
   server/formation-echanges.js — Lot 4 « Diaspo'Actif Formation » (2026-10-18) : espace d'échange d'une formation

   Questions posées sous une leçon (ou sur la formation entière), réponses du formateur et des autres apprenants, signalement, modération.
   - Qui peut lire et écrire : les apprenants inscrits (paiement validé), le formateur de la formation, l'administration. Personne d'autre.
   - Les apprenants apparaissent sous « Prénom N. » (comme sur la page de vérification des documents) ; le formateur est reconnaissable à son badge.
   - Signalement : un compte ne signale un message qu'une fois ; à 3 signalements distincts, le message est masqué automatiquement en attendant le formateur.
   - Modération (formateur ou administration) : masquer / réafficher / supprimer. Un message masqué n'est lisible que par les modérateurs.
   - Espace privé (2026-10-31) : des THÈMES (message racine avec titre, hors leçon) que tout inscrit peut ouvrir ; chaque réponse prévient les personnes déjà intervenues
     dans le thème ; formation_discussion_vus garde le dernier message lu par personne (pastille « nouveau »).
   - Notifications utiles seulement : le formateur est prévenu d'une nouvelle QUESTION (pas de chaque réponse entre apprenants), l'auteur d'une question
     est prévenu quand quelqu'un lui répond, le formateur est prévenu d'un signalement.
   ═════════════════════════════════════════════════ */
"use strict";

const SEUIL_MASQUAGE_AUTO = 3;
const LONGUEUR_MAX = 2000;

function nomCourt(u) {
  if (!u) return "Compte supprimé";
  const nom = String(u.nom || "").trim(), prenom = String(u.prenom || "").trim();
  if (nom === "Compte supprimé" || prenom === "Compte supprimé") return "Compte supprimé";
  if (prenom && nom) return `${prenom} ${nom.charAt(0).toUpperCase()}.`;
  return prenom || nom || "Participant";
}

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, checkFormationOwner } = deps;

  /* Accès à l'espace d'échange d'une formation : { f, moderateur, inscrit } ou null (la réponse d'erreur est déjà envoyée). */
  async function acces(req, res, formationId) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(formationId);
    if (!f) { sendJSON(res, 404, { error: "Formation introuvable." }); return null; }
    const moderateur = !!checkFormationOwner(f, user);
    const insc = await db.prepare("SELECT id FROM formation_inscriptions WHERE formation_id=? AND user_id=? AND statut='active' AND COALESCE(paiement_statut,'paye')='paye'").get(formationId, user.id);
    if (!moderateur && !insc) { sendJSON(res, 403, { error: "Réservé aux apprenants inscrits à cette formation." }); return null; }
    return { user, f, moderateur, inscrit: !!insc };
  }

  const vue = (m, a, auteurs) => {
    const masque = (m.statut || "visible") !== "visible";
    const cache = masque && !a.moderateur;
    const u = auteurs[Number(m.user_id)];
    const estFormateur = m.role === "formateur";
    return {
      id: Number(m.id), lecon_id: m.lecon_id != null ? Number(m.lecon_id) : null, parent_id: m.parent_id != null ? Number(m.parent_id) : null,
      titre: m.titre || null, role: estFormateur ? "formateur" : "apprenant", auteur: nomCourt(u), est_moi: Number(m.user_id) === Number(a.user.id),
      contenu: cache ? "Ce message a été masqué par la modération." : m.contenu, masque, resolue: Number(m.resolue) === 1,
      nb_signalements: a.moderateur ? Number(m.nb_signalements) || 0 : undefined, created_at: m.created_at,
    };
  };

  /* GET /api/formations/:id/discussions?lecon_id=<id> | general — fils de discussion (questions + réponses). Sans lecon_id : toute la formation. */
  route("GET", "/api/formations/:id/discussions", async (req, res, params, body, query) => {
    const a = await acces(req, res, params.id); if (!a) return;
    const q = query || {};
    let sql = "SELECT * FROM formation_discussions WHERE formation_id=?";
    const args = [Number(params.id)];
    if (q.theme_id != null && q.theme_id !== "") { sql += " AND (id=? OR parent_id=?)"; args.push(Number(q.theme_id), Number(q.theme_id)); }
    else if (q.lecon_id === "general") sql += " AND lecon_id IS NULL AND titre IS NULL";
    else if (q.lecon_id != null && q.lecon_id !== "") { sql += " AND (lecon_id=? OR parent_id IN (SELECT id FROM formation_discussions WHERE lecon_id=?))"; args.push(Number(q.lecon_id), Number(q.lecon_id)); }
    sql += " ORDER BY id ASC LIMIT 1000";
    const lignes = await db.prepare(sql).all(...args);
    const ids = [...new Set(lignes.map(m => Number(m.user_id)))];
    const auteurs = {};
    if (ids.length) (await db.prepare(`SELECT id, nom, prenom FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids)).forEach(u => { auteurs[Number(u.id)] = u; });
    const racines = lignes.filter(m => m.parent_id == null);
    const fils = racines.map(r => ({ ...vue(r, a, auteurs), reponses: lignes.filter(x => Number(x.parent_id) === Number(r.id)).map(x => vue(x, a, auteurs)) }));
    /* Les plus récentes d'abord ; les questions encore sans réponse du formateur remontent pour le formateur. */
    fils.sort((x, y) => y.id - x.id);
    const resume = a.moderateur ? {
      a_repondre: fils.filter(t => !t.masque && !t.resolue && t.role === "apprenant" && !t.reponses.some(r => r.role === "formateur")).length,
      masques: lignes.filter(m => (m.statut || "visible") !== "visible").length,
    } : undefined;
    /* Ouvrir un thème = le marquer lu pour cette personne (efface la pastille « nouveau »). */
    if (q.theme_id != null && q.theme_id !== "" && lignes.length) await marquerVu(a.user.id, Number(q.theme_id), Math.max(...lignes.map(m => Number(m.id))));
    sendJSON(res, 200, { fils, moderateur: a.moderateur, resume });
  });

  async function marquerVu(userId, themeId, jusquaId) {
    await db.prepare("DELETE FROM formation_discussion_vus WHERE user_id=? AND discussion_id=?").run(Number(userId), Number(themeId));
    await db.prepare("INSERT INTO formation_discussion_vus (user_id, discussion_id, vu_jusqu_id) VALUES (?,?,?)").run(Number(userId), Number(themeId), Number(jusquaId));
  }

  /* GET /api/formations/:id/themes — thèmes de l'espace privé (les plus actifs d'abord) avec, pour la personne connectée, le nombre de messages non lus. */
  route("GET", "/api/formations/:id/themes", async (req, res, params) => {
    const a = await acces(req, res, params.id); if (!a) return;
    const racines = await db.prepare("SELECT * FROM formation_discussions WHERE formation_id=? AND parent_id IS NULL AND titre IS NOT NULL ORDER BY id ASC LIMIT 1000").all(Number(params.id));
    const idsRacines = racines.map(t => Number(t.id));
    const reponses = idsRacines.length ? await db.prepare(`SELECT * FROM formation_discussions WHERE parent_id IN (${idsRacines.map(() => "?").join(",")}) ORDER BY id ASC LIMIT 5000`).all(...idsRacines) : [];
    const visible = m => (m.statut || "visible") === "visible" || a.moderateur;
    const vus = {};
    (await db.prepare("SELECT discussion_id, vu_jusqu_id FROM formation_discussion_vus WHERE user_id=?").all(a.user.id)).forEach(v => { vus[Number(v.discussion_id)] = Number(v.vu_jusqu_id); });
    const ids = [...new Set([...racines, ...reponses].map(m => Number(m.user_id)))];
    const auteurs = {};
    if (ids.length) (await db.prepare(`SELECT id, nom, prenom FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids)).forEach(u => { auteurs[Number(u.id)] = u; });
    const themes = racines.filter(visible).map(t => {
      const msgs = [t, ...reponses.filter(x => Number(x.parent_id) === Number(t.id))].filter(visible);
      const vuJusqua = vus[Number(t.id)] || 0;
      return {
        id: Number(t.id), titre: t.titre, auteur: nomCourt(auteurs[Number(t.user_id)]), role: t.role === "formateur" ? "formateur" : "apprenant", est_moi: Number(t.user_id) === Number(a.user.id),
        nb_reponses: msgs.length - 1, derniere_id: Math.max(...msgs.map(x => Number(x.id))), created_at: t.created_at, masque: (t.statut || "visible") !== "visible",
        nouveaux: msgs.filter(x => Number(x.id) > vuJusqua && Number(x.user_id) !== Number(a.user.id)).length,
      };
    }).sort((x, y) => y.derniere_id - x.derniere_id);
    const nb = await db.prepare("SELECT COUNT(*) AS n FROM formation_inscriptions WHERE formation_id=? AND statut='active' AND COALESCE(paiement_statut,'paye')='paye'").get(Number(params.id));
    sendJSON(res, 200, { themes, nb_membres: Number(nb && nb.n) || 0, non_lus: themes.filter(t => t.nouveaux > 0).length, moderateur: a.moderateur });
  });

  /* GET /api/formations/:id/discussions-resume — compteurs pour le tableau de bord du formateur (toute la formation). */
  route("GET", "/api/formations/:id/discussions-resume", async (req, res, params) => {
    const a = await acces(req, res, params.id); if (!a) return;
    if (!a.moderateur) return sendJSON(res, 403, { error: "Réservé au formateur." });
    const r = await db.prepare(`SELECT COUNT(*) AS n FROM formation_discussions d WHERE d.formation_id=? AND d.parent_id IS NULL AND d.role='apprenant' AND d.statut='visible' AND COALESCE(d.resolue,0)=0
      AND NOT EXISTS (SELECT 1 FROM formation_discussions x WHERE x.parent_id=d.id AND x.role='formateur')`).get(Number(params.id));
    const m = await db.prepare("SELECT COUNT(*) AS n FROM formation_discussions WHERE formation_id=? AND statut<>'visible'").get(Number(params.id));
    sendJSON(res, 200, { a_repondre: Number(r && r.n) || 0, masques: Number(m && m.n) || 0 });
  });

  /* POST /api/formations/:id/discussions { contenu, lecon_id?, parent_id? } */
  route("POST", "/api/formations/:id/discussions", async (req, res, params, body) => {
    const a = await acces(req, res, params.id); if (!a) return;
    const lim = SEC.rateLimit(`formation-echange:${a.user.id}`, 20, 600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop de messages. Réessayez dans ${lim.retryAfter}s.` });
    const contenu = String((body && body.contenu) || "").replace(/\r\n/g, "\n").trim();
    if (contenu.length < 2) return sendJSON(res, 400, { error: "Écrivez votre message." });
    if (contenu.length > LONGUEUR_MAX) return sendJSON(res, 400, { error: `Message trop long (${LONGUEUR_MAX} caractères maximum).` });
    let parent = null, leconId = null;
    const titre = String((body && body.titre) || "").replace(/\s+/g, " ").trim();
    if (titre && body.parent_id != null && body.parent_id !== "") return sendJSON(res, 400, { error: "Une réponse n'a pas de titre." });
    if (titre && (titre.length < 3 || titre.length > 120)) return sendJSON(res, 400, { error: "Le titre du thème doit faire entre 3 et 120 caractères." });
    if (body && body.parent_id != null && body.parent_id !== "") {
      parent = await db.prepare("SELECT * FROM formation_discussions WHERE id=? AND formation_id=?").get(Number(body.parent_id), Number(params.id));
      if (!parent || parent.parent_id != null) return sendJSON(res, 404, { error: "Question introuvable." });
      if ((parent.statut || "visible") !== "visible" && !a.moderateur) return sendJSON(res, 403, { error: "Cette discussion est masquée." });
      leconId = parent.lecon_id != null ? Number(parent.lecon_id) : null;
    } else if (body && body.lecon_id != null && body.lecon_id !== "") {
      const l = await db.prepare(`SELECT l.id FROM formation_lecons l JOIN formation_modules m ON m.id=l.module_id WHERE l.id=? AND m.formation_id=?`).get(Number(body.lecon_id), Number(params.id));
      if (!l) return sendJSON(res, 404, { error: "Leçon introuvable dans cette formation." });
      leconId = Number(l.id);
    }
    const role = a.moderateur ? "formateur" : "apprenant";
    if (titre) leconId = null; /* un thème appartient à la formation entière, jamais à une leçon */
    const r = await db.prepare("INSERT INTO formation_discussions (formation_id, lecon_id, user_id, parent_id, role, contenu, titre) VALUES (?,?,?,?,?,?,?)")
      .run(Number(params.id), leconId, a.user.id, parent ? Number(parent.id) : null, role, contenu, titre || null);
    const id = Number(r.lastInsertRowid);
    const note = typeof deps.creerNotif === "function" ? deps.creerNotif : null;
    if (note) {
      const meta = { formation_id: Number(a.f.id), discussion_id: parent ? Number(parent.id) : id };
      if (titre || (parent && parent.titre)) meta.lien = `suivre-formation.html?id=${Number(a.f.id)}&espace=${meta.discussion_id}`; /* la notification ouvre directement le thème */
      if (!parent && role === "apprenant" && a.f.owner_user_id) note(a.f.owner_user_id, "formation", titre ? "💬 Nouveau thème dans l'espace privé de votre formation" : "💬 Nouvelle question dans votre formation", titre ? `Thème « ${titre} » dans « ${a.f.titre} ».` : `Une question a été posée dans « ${a.f.titre} ».`, meta);
      if (parent && parent.titre) {
        /* Thème de l'espace privé : toutes les personnes qui y ont écrit sont prévenues d'une nouvelle réponse (sauf l'auteur de celle-ci). */
        const participants = new Set([Number(parent.user_id), ...(await db.prepare("SELECT DISTINCT user_id FROM formation_discussions WHERE parent_id=?").all(Number(parent.id))).map(x => Number(x.user_id))]);
        participants.delete(Number(a.user.id));
        for (const uid of participants) note(uid, "formation", `💬 Nouvelle réponse dans le thème « ${String(parent.titre).slice(0, 60)} »`, `Espace privé de « ${a.f.titre} ».`, meta);
      } else if (parent && Number(parent.user_id) !== Number(a.user.id)) note(parent.user_id, "formation", role === "formateur" ? "💬 Le formateur a répondu à votre question" : "💬 On a répondu à votre question", `Dans « ${a.f.titre} ».`, meta);
    }
    await marquerVu(a.user.id, parent ? Number(parent.id) : id, id);
    sendJSON(res, 201, { ok: true, id });
  });

  async function chargerMessage(res, a, formationId, msgId) {
    const m = await db.prepare("SELECT * FROM formation_discussions WHERE id=? AND formation_id=?").get(Number(msgId), Number(formationId));
    if (!m) { sendJSON(res, 404, { error: "Message introuvable." }); return null; }
    return m;
  }

  /* POST …/:msgId/resolue { resolue } — l'auteur de la question ou un modérateur la marque comme résolue. */
  route("POST", "/api/formations/:id/discussions/:msgId/resolue", async (req, res, params, body) => {
    const a = await acces(req, res, params.id); if (!a) return;
    const m = await chargerMessage(res, a, params.id, params.msgId); if (!m) return;
    if (m.parent_id != null) return sendJSON(res, 400, { error: "Seule une question peut être marquée comme résolue." });
    if (!a.moderateur && Number(m.user_id) !== Number(a.user.id)) return sendJSON(res, 403, { error: "Interdit." });
    await db.prepare("UPDATE formation_discussions SET resolue=? WHERE id=?").run(body && body.resolue === false ? 0 : 1, m.id);
    sendJSON(res, 200, { ok: true });
  });

  /* POST …/:msgId/signaler { motif } — une seule fois par compte ; masquage automatique au seuil. */
  route("POST", "/api/formations/:id/discussions/:msgId/signaler", async (req, res, params, body) => {
    const a = await acces(req, res, params.id); if (!a) return;
    const lim = SEC.rateLimit(`formation-signal:${a.user.id}`, 15, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop de signalements. Réessayez dans ${lim.retryAfter}s.` });
    const m = await chargerMessage(res, a, params.id, params.msgId); if (!m) return;
    if (Number(m.user_id) === Number(a.user.id)) return sendJSON(res, 400, { error: "Vous ne pouvez pas signaler votre propre message." });
    const deja = await db.prepare("SELECT id FROM formation_discussion_signalements WHERE discussion_id=? AND user_id=?").get(m.id, a.user.id);
    if (deja) return sendJSON(res, 409, { error: "Vous avez déjà signalé ce message." });
    await db.prepare("INSERT INTO formation_discussion_signalements (discussion_id, user_id, motif) VALUES (?,?,?)").run(m.id, a.user.id, String((body && body.motif) || "").trim().slice(0, 300) || null);
    const nb = Number((await db.prepare("SELECT COUNT(*) AS n FROM formation_discussion_signalements WHERE discussion_id=?").get(m.id) || {}).n) || 1;
    await db.prepare("UPDATE formation_discussions SET nb_signalements=? WHERE id=?").run(nb, m.id);
    let masque = (m.statut || "visible") !== "visible";
    if (nb >= SEUIL_MASQUAGE_AUTO && !masque) { await db.prepare("UPDATE formation_discussions SET statut='masque' WHERE id=?").run(m.id); masque = true; }
    if (typeof deps.creerNotif === "function" && a.f.owner_user_id && Number(a.f.owner_user_id) !== Number(a.user.id)) {
      deps.creerNotif(a.f.owner_user_id, "formation", "🚩 Un message a été signalé", `Un message de l'espace d'échange de « ${a.f.titre} » a été signalé${masque ? " et masqué automatiquement" : ""}. Vous pouvez le modérer depuis la formation.`, { formation_id: Number(a.f.id), discussion_id: Number(m.id) });
    }
    sendJSON(res, 200, { ok: true, masque });
  });

  /* POST …/:msgId/moderer { action: masquer | afficher | supprimer } — formateur ou administration. */
  route("POST", "/api/formations/:id/discussions/:msgId/moderer", async (req, res, params, body) => {
    const a = await acces(req, res, params.id); if (!a) return;
    if (!a.moderateur) return sendJSON(res, 403, { error: "Réservé au formateur et à l'administration." });
    const m = await chargerMessage(res, a, params.id, params.msgId); if (!m) return;
    const action = String((body && body.action) || "");
    if (action === "masquer") await db.prepare("UPDATE formation_discussions SET statut='masque' WHERE id=?").run(m.id);
    else if (action === "afficher") { await db.prepare("UPDATE formation_discussions SET statut='visible', nb_signalements=0 WHERE id=?").run(m.id); await db.prepare("DELETE FROM formation_discussion_signalements WHERE discussion_id=?").run(m.id); }
    else if (action === "supprimer") await supprimer(m);
    else return sendJSON(res, 400, { error: "Action inconnue (masquer, afficher ou supprimer)." });
    sendJSON(res, 200, { ok: true });
  });

  async function supprimer(m) {
    const enfants = (await db.prepare("SELECT id FROM formation_discussions WHERE parent_id=?").all(m.id)).map(x => Number(x.id));
    for (const id of [...enfants, Number(m.id)]) {
      await db.prepare("DELETE FROM formation_discussion_signalements WHERE discussion_id=?").run(id);
      await db.prepare("DELETE FROM formation_discussion_vus WHERE discussion_id=?").run(id);
      await db.prepare("DELETE FROM formation_discussions WHERE id=?").run(id);
    }
  }

  /* DELETE …/:msgId — l'auteur retire son propre message (une question retirée emporte ses réponses). */
  route("DELETE", "/api/formations/:id/discussions/:msgId", async (req, res, params) => {
    const a = await acces(req, res, params.id); if (!a) return;
    const m = await chargerMessage(res, a, params.id, params.msgId); if (!m) return;
    if (Number(m.user_id) !== Number(a.user.id) && !a.moderateur) return sendJSON(res, 403, { error: "Interdit." });
    await supprimer(m);
    sendJSON(res, 200, { ok: true });
  });
};
