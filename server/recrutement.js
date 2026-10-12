/* ═══════════════════════════════════════════════════════
   server/recrutement.js — Dossiers de recrutement (2026-10-12, demande explicite)

   Un compte qui reçoit un CV (lien public, cartouche de messagerie) peut, depuis la page du CV :
     • le NOTER de 0 à 10 et lui donner un verdict : Candidat idéal (vert) / Candidat intéressant (orange) / Ne correspond pas (rouge) ;
     • le COMMENTER ;
     • l'ENREGISTRER dans un DOSSIER de candidatures (ex. « Candidature — Poste de manager principal ») : le CV est COPIÉ
       (snapshot) avec ses médias, donc il reste consultable avec toutes ses notes même si son propriétaire le retire ensuite ;
     • le REPARTAGER (autre compte Diaspo'Actif, e-mail ou WhatsApp) avec ou sans ses notes.
   Chaque dossier a ses statistiques (répartition des verdicts, histogramme des notes, classement, moyenne, tendance).
   Tout est PRIVÉ au compte qui évalue : chaque requête filtre sur user_id. Tables : voir server/db.js (recrut_*).
   Enregistré par registerRecrutement() depuis server/index.js.
   ═══════════════════════════════════════════════════════ */
const SEC = require("./security");
const { sendEmail } = require("./mailer");
const CvExtras = require("./cv-extras");

const SITE = (process.env.PUBLIC_BASE_URL || "https://diaspoactif.com").replace(/\/+$/, "");
const VERDICTS = { ideal: "Candidat idéal", interessant: "Candidat intéressant", non: "Ne correspond pas" };
const MAX_DOSSIERS = 50;
const MAX_CANDIDATS_PAR_DOSSIER = 300;
const MAX_COMMENTAIRE = 2000;
const MAX_EMAILS_PAR_JOUR = 8;

const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const texte = (v, max) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, max);
const json = (s, repli) => { try { return JSON.parse(s || ""); } catch (e) { return repli; } };
const noteValide = v => { if (v === null || v === "" || v === undefined) return null; const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 10 ? n : undefined; };
const verdictValide = v => { if (v === null || v === "" || v === undefined) return null; return Object.prototype.hasOwnProperty.call(VERDICTS, v) ? v : undefined; };
const brut = h => String(h || "").replace(/<\/(p|div|li|h[1-6])>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/* Statistiques d'un dossier : répartition des verdicts, histogramme des notes (0 à 10), moyenne, médiane, classement, tendance. */
function statistiques(cands) {
  const histo = Array(11).fill(0), verdicts = { ideal: 0, interessant: 0, non: 0, sans: 0 }, notes = [];
  for (const c of cands) {
    if (c.note !== null && c.note !== undefined) { histo[Number(c.note)]++; notes.push(Number(c.note)); }
    verdicts[c.verdict && verdicts[c.verdict] !== undefined ? c.verdict : "sans"]++;
  }
  const somme = notes.reduce((a, b) => a + b, 0);
  const tri = notes.slice().sort((a, b) => a - b);
  const mediane = tri.length ? (tri.length % 2 ? tri[(tri.length - 1) / 2] : (tri[tri.length / 2 - 1] + tri[tri.length / 2]) / 2) : null;
  const classement = cands.filter(c => c.note !== null && c.note !== undefined).sort((a, b) => Number(b.note) - Number(a.note)).slice(0, 12)
    .map(c => ({ id: Number(c.id), nom: c.nom, note: Number(c.note), verdict: c.verdict || null }));
  /* Tendance : moyenne des notes les plus récentes comparée à celle des plus anciennes (par date d'enregistrement), à partir de 4 notes. */
  let tendance = null;
  const datees = cands.filter(c => c.note !== null && c.note !== undefined).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  if (datees.length >= 4) {
    const m = Math.floor(datees.length / 2), moy = l => l.reduce((a, c) => a + Number(c.note), 0) / l.length;
    const delta = moy(datees.slice(m)) - moy(datees.slice(0, m));
    tendance = { sens: delta > 0.4 ? "hausse" : delta < -0.4 ? "baisse" : "stable", ecart: Math.round(delta * 10) / 10 };
  }
  /* Évolution : moyenne cumulée des notes au fil des enregistrements (une valeur par jour). */
  const evolution = []; let cumul = 0, n = 0;
  for (const c of datees) {
    cumul += Number(c.note); n++;
    const jour = String(c.created_at || "").slice(0, 10);
    const point = { date: jour, moyenne: Math.round((cumul / n) * 10) / 10, n };
    if (evolution.length && evolution[evolution.length - 1].date === jour) evolution[evolution.length - 1] = point; else evolution.push(point);
  }
  return {
    total: cands.length, notes: notes.length, histogramme: histo, verdicts,
    moyenne: notes.length ? Math.round((somme / notes.length) * 10) / 10 : null, mediane,
    meilleur: classement[0] || null, classement, tendance, evolution,
  };
}

module.exports.statistiques = statistiques;
module.exports.VERDICTS = VERDICTS;

module.exports.registerRecrutement = function registerRecrutement(deps) {
  const { route, db, sendJSON, getCurrentUser, nomCompteAffichage } = deps;

  const connecte = async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    return user;
  };
  const dossierDe = (user, id) => db.prepare("SELECT * FROM recrut_dossiers WHERE id=? AND user_id=?").get(id, user.id);
  const candidatDe = (user, id) => db.prepare("SELECT * FROM recrut_candidats WHERE id=? AND user_id=?").get(id, user.id);
  const toucher = id => db.prepare("UPDATE recrut_dossiers SET updated_at=datetime('now') WHERE id=?").run(id);

  /* Résumé d'une ligne de candidat (liste d'un dossier) : jamais le CV entier. */
  async function lignesCandidats(cands) {
    const ids = cands.map(c => Number(c.id));
    const nbCom = {};
    if (ids.length) {
      const rows = await db.prepare(`SELECT candidat_id, COUNT(*) AS n FROM recrut_commentaires WHERE candidat_id IN (${ids.map(() => "?").join(",")}) GROUP BY candidat_id`).all(...ids);
      rows.forEach(r => { nbCom[Number(r.candidat_id)] = Number(r.n); });
    }
    return cands.map(c => {
      const snap = json(c.snapshot_json, {}); const photo = snap.data && snap.data.photo && snap.data.photo.show !== false ? snap.data.photo.url || "" : "";
      return { id: Number(c.id), dossier_id: Number(c.dossier_id), nom: c.nom || "Candidat", titre_pro: c.titre_pro || "", titre_cv: c.titre_cv || "", note: c.note === null || c.note === undefined ? null : Number(c.note),
        verdict: c.verdict || null, nb_commentaires: nbCom[Number(c.id)] || 0, cree_le: c.created_at, mis_a_jour: c.updated_at, jeton: c.cv_jeton || null, photo: /^(https?:\/\/|data:image\/)/i.test(photo) ? photo : "" };
    });
  }

  /* ───────────── Dossiers ───────────── */
  route("GET", "/api/recrutement/dossiers", async (req, res) => {
    const user = await connecte(req, res); if (!user) return;
    const dossiers = await db.prepare("SELECT * FROM recrut_dossiers WHERE user_id=? ORDER BY updated_at DESC, id DESC").all(user.id);
    const cands = await db.prepare("SELECT id, dossier_id, nom, note, verdict, created_at FROM recrut_candidats WHERE user_id=?").all(user.id);
    sendJSON(res, 200, { dossiers: dossiers.map(d => {
      const st = statistiques(cands.filter(c => Number(c.dossier_id) === Number(d.id)));
      return { id: Number(d.id), titre: d.titre, description: d.description || "", cree_le: d.created_at, mis_a_jour: d.updated_at, total: st.total, notes: st.notes, moyenne: st.moyenne, verdicts: st.verdicts, meilleur: st.meilleur };
    }), max: MAX_DOSSIERS });
  });

  route("POST", "/api/recrutement/dossiers", async (req, res, params, body) => {
    const user = await connecte(req, res); if (!user) return;
    const titre = texte(body && body.titre, 120);
    if (titre.length < 3) return sendJSON(res, 400, { error: "Donnez un titre au dossier (3 caractères au moins), par exemple « Candidature — Poste de manager principal »." });
    const n = Number((await db.prepare("SELECT COUNT(*) AS n FROM recrut_dossiers WHERE user_id=?").get(user.id))?.n) || 0;
    if (n >= MAX_DOSSIERS) return sendJSON(res, 400, { error: `Limite de ${MAX_DOSSIERS} dossiers atteinte : supprimez-en un avant d'en créer un nouveau.` });
    const id = Number((await db.prepare("INSERT INTO recrut_dossiers (user_id, titre, description) VALUES (?,?,?)").run(user.id, titre, texte(body && body.description, 500) || null)).lastInsertRowid);
    sendJSON(res, 201, { id, titre });
  });

  route("PUT", "/api/recrutement/dossiers/:id", async (req, res, params, body) => {
    const user = await connecte(req, res); if (!user) return;
    const d = await dossierDe(user, params.id); if (!d) return sendJSON(res, 404, { error: "Dossier introuvable." });
    const titre = body && typeof body.titre === "string" ? texte(body.titre, 120) : d.titre;
    if (titre.length < 3) return sendJSON(res, 400, { error: "Le titre du dossier doit comporter 3 caractères au moins." });
    const description = body && typeof body.description === "string" ? texte(body.description, 500) : d.description;
    await db.prepare("UPDATE recrut_dossiers SET titre=?, description=?, updated_at=datetime('now') WHERE id=?").run(titre, description || null, d.id);
    sendJSON(res, 200, { ok: true });
  });

  route("DELETE", "/api/recrutement/dossiers/:id", async (req, res, params) => {
    const user = await connecte(req, res); if (!user) return;
    const d = await dossierDe(user, params.id); if (!d) return sendJSON(res, 404, { error: "Dossier introuvable." });
    const cands = await db.prepare("SELECT id FROM recrut_candidats WHERE dossier_id=?").all(d.id);
    for (const c of cands) await db.prepare("DELETE FROM recrut_commentaires WHERE candidat_id=?").run(c.id);
    await db.prepare("DELETE FROM recrut_candidats WHERE dossier_id=?").run(d.id);
    await db.prepare("DELETE FROM recrut_dossiers WHERE id=?").run(d.id);
    sendJSON(res, 200, { deleted: true });
  });

  /* Un dossier, ses candidats (notés, classés) et ses statistiques pour les diagrammes. */
  route("GET", "/api/recrutement/dossiers/:id", async (req, res, params) => {
    const user = await connecte(req, res); if (!user) return;
    const d = await dossierDe(user, params.id); if (!d) return sendJSON(res, 404, { error: "Dossier introuvable." });
    const cands = await db.prepare("SELECT * FROM recrut_candidats WHERE dossier_id=? AND user_id=? ORDER BY (note IS NULL), note DESC, updated_at DESC").all(d.id, user.id);
    sendJSON(res, 200, { dossier: { id: Number(d.id), titre: d.titre, description: d.description || "", cree_le: d.created_at, mis_a_jour: d.updated_at },
      candidats: await lignesCandidats(cands), stats: statistiques(cands) });
  });

  /* ───────────── Évaluer un CV depuis sa page publique ───────────── */
  /* Ce que ce compte a déjà fait de ce CV (pour préremplir le panneau) + la liste de ses dossiers. */
  route("GET", "/api/recrutement/jeton/:jeton", async (req, res, params) => {
    const user = await connecte(req, res); if (!user) return;
    const jeton = String(params.jeton || "");
    const dossiers = await db.prepare("SELECT id, titre FROM recrut_dossiers WHERE user_id=? ORDER BY updated_at DESC, id DESC").all(user.id);
    const deja = await db.prepare(`SELECT c.id, c.dossier_id, c.note, c.verdict, d.titre AS dossier_titre,
        (SELECT COUNT(*) FROM recrut_commentaires k WHERE k.candidat_id=c.id) AS nb_commentaires
      FROM recrut_candidats c JOIN recrut_dossiers d ON d.id=c.dossier_id WHERE c.user_id=? AND c.cv_jeton=? ORDER BY c.updated_at DESC`).all(user.id, jeton);
    sendJSON(res, 200, { dossiers: dossiers.map(d => ({ id: Number(d.id), titre: d.titre })),
      evaluations: deja.map(c => ({ id: Number(c.id), dossier_id: Number(c.dossier_id), dossier_titre: c.dossier_titre, note: c.note === null ? null : Number(c.note), verdict: c.verdict || null, nb_commentaires: Number(c.nb_commentaires) || 0 })) });
  });

  /* Enregistre (ou met à jour) l'évaluation d'un CV dans un dossier, existant ou à créer. Le CV est copié. */
  route("POST", "/api/recrutement/evaluations", async (req, res, params, body) => {
    const user = await connecte(req, res); if (!user) return;
    const lim = SEC.rateLimit(`recrut-eval:${user.id}`, 90, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Un peu de patience : réessayez dans ${lim.retryAfter}s.` });
    const jeton = String(body && body.jeton || "");
    const note = noteValide(body && body.note); if (note === undefined) return sendJSON(res, 400, { error: "La note doit être un nombre entier de 0 à 10." });
    const verdict = verdictValide(body && body.verdict); if (verdict === undefined) return sendJSON(res, 400, { error: "Verdict inconnu." });
    const commentaire = texte(body && body.commentaire, MAX_COMMENTAIRE);
    const pub = await CvExtras.lireCVPublicParJeton(db, jeton);
    if (!pub) return sendJSON(res, 404, { error: "Ce CV n'est plus disponible : il ne peut plus être enregistré." });
    if (Number(pub.cv.user_id) === Number(user.id)) return sendJSON(res, 400, { error: "C'est votre propre CV : il ne s'évalue pas." });

    let dossier;
    if (body && body.dossier_id) {
      dossier = await dossierDe(user, body.dossier_id);
      if (!dossier) return sendJSON(res, 404, { error: "Dossier introuvable." });
    } else {
      const titre = texte(body && body.nouveau_dossier, 120);
      if (titre.length < 3) return sendJSON(res, 400, { error: "Choisissez un dossier, ou donnez un titre au nouveau dossier (3 caractères au moins)." });
      const n = Number((await db.prepare("SELECT COUNT(*) AS n FROM recrut_dossiers WHERE user_id=?").get(user.id))?.n) || 0;
      if (n >= MAX_DOSSIERS) return sendJSON(res, 400, { error: `Limite de ${MAX_DOSSIERS} dossiers atteinte.` });
      const id = Number((await db.prepare("INSERT INTO recrut_dossiers (user_id, titre) VALUES (?,?)").run(user.id, titre)).lastInsertRowid);
      dossier = { id, titre };
    }
    const inf = (pub.data && pub.data.infos) || {};
    const nom = [inf.prenom, inf.nom].filter(Boolean).join(" ") || pub.titre;
    const snapshot = JSON.stringify({ titre: pub.titre, theme: pub.theme, numero: pub.numero, data: pub.data, medias: pub.medias, enregistre_le: new Date().toISOString() });
    let cand = await db.prepare("SELECT * FROM recrut_candidats WHERE dossier_id=? AND cv_jeton=? AND user_id=?").get(dossier.id, jeton, user.id);
    if (cand) {
      /* Déjà dans ce dossier : on met à jour ce qui est fourni (note, verdict) et on rafraîchit la copie du CV. */
      await db.prepare("UPDATE recrut_candidats SET note=?, verdict=?, nom=?, titre_pro=?, titre_cv=?, snapshot_json=?, updated_at=datetime('now') WHERE id=?")
        .run(body && "note" in body ? note : cand.note, body && "verdict" in body ? verdict : cand.verdict, nom, inf.titre_pro || null, pub.titre, snapshot, cand.id);
    } else {
      const total = Number((await db.prepare("SELECT COUNT(*) AS n FROM recrut_candidats WHERE dossier_id=?").get(dossier.id))?.n) || 0;
      if (total >= MAX_CANDIDATS_PAR_DOSSIER) return sendJSON(res, 400, { error: `Ce dossier contient déjà ${MAX_CANDIDATS_PAR_DOSSIER} CV.` });
      const id = Number((await db.prepare(`INSERT INTO recrut_candidats (dossier_id, user_id, cv_jeton, cv_user_id, nom, titre_pro, titre_cv, snapshot_json, note, verdict)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(dossier.id, user.id, jeton, pub.cv.user_id, nom, inf.titre_pro || null, pub.titre, snapshot, note, verdict)).lastInsertRowid);
      cand = { id };
    }
    if (commentaire) await db.prepare("INSERT INTO recrut_commentaires (candidat_id, user_id, texte) VALUES (?,?,?)").run(cand.id, user.id, commentaire);
    await toucher(dossier.id);
    sendJSON(res, 200, { ok: true, candidat_id: Number(cand.id), dossier_id: Number(dossier.id), dossier_titre: dossier.titre });
  });

  /* ───────────── Fiche d'un candidat ───────────── */
  route("GET", "/api/recrutement/candidats/:id", async (req, res, params) => {
    const user = await connecte(req, res); if (!user) return;
    const c = await candidatDe(user, params.id); if (!c) return sendJSON(res, 404, { error: "Candidat introuvable." });
    const d = await db.prepare("SELECT id, titre FROM recrut_dossiers WHERE id=?").get(c.dossier_id);
    const dossiers = await db.prepare("SELECT id, titre FROM recrut_dossiers WHERE user_id=? ORDER BY updated_at DESC, id DESC").all(user.id);
    const coms = await db.prepare("SELECT id, texte, created_at FROM recrut_commentaires WHERE candidat_id=? ORDER BY id DESC").all(c.id);
    const snap = json(c.snapshot_json, {});
    const encore = !!(c.cv_jeton && await CvExtras.lireCVPublicParJeton(db, c.cv_jeton));
    sendJSON(res, 200, { candidat: { id: Number(c.id), nom: c.nom, titre_pro: c.titre_pro || "", titre_cv: c.titre_cv || "", note: c.note === null ? null : Number(c.note), verdict: c.verdict || null,
        cree_le: c.created_at, mis_a_jour: c.updated_at, jeton: c.cv_jeton || null, cv_en_ligne: encore },
      dossier: d ? { id: Number(d.id), titre: d.titre } : null, dossiers: dossiers.map(x => ({ id: Number(x.id), titre: x.titre })),
      commentaires: coms.map(k => ({ id: Number(k.id), texte: k.texte, cree_le: k.created_at })),
      cv: { titre: snap.titre || c.titre_cv || "CV", theme: snap.theme || "bleu", data: snap.data || {}, medias: snap.medias || [] } });
  });

  route("PATCH", "/api/recrutement/candidats/:id", async (req, res, params, body) => {
    const user = await connecte(req, res); if (!user) return;
    const c = await candidatDe(user, params.id); if (!c) return sendJSON(res, 404, { error: "Candidat introuvable." });
    let note = c.note, verdict = c.verdict, dossierId = Number(c.dossier_id);
    if (body && "note" in body) { const n = noteValide(body.note); if (n === undefined) return sendJSON(res, 400, { error: "La note doit être un nombre entier de 0 à 10." }); note = n; }
    if (body && "verdict" in body) { const v = verdictValide(body.verdict); if (v === undefined) return sendJSON(res, 400, { error: "Verdict inconnu." }); verdict = v; }
    if (body && body.dossier_id && Number(body.dossier_id) !== dossierId) {
      const cible = await dossierDe(user, body.dossier_id); if (!cible) return sendJSON(res, 404, { error: "Dossier de destination introuvable." });
      const doublon = c.cv_jeton ? await db.prepare("SELECT id FROM recrut_candidats WHERE dossier_id=? AND cv_jeton=? AND id<>?").get(cible.id, c.cv_jeton, c.id) : null;
      if (doublon) return sendJSON(res, 409, { error: "Ce CV est déjà dans ce dossier." });
      dossierId = Number(cible.id); await toucher(cible.id);
    }
    await db.prepare("UPDATE recrut_candidats SET note=?, verdict=?, dossier_id=?, updated_at=datetime('now') WHERE id=?").run(note, verdict, dossierId, c.id);
    await toucher(dossierId);
    sendJSON(res, 200, { ok: true });
  });

  route("DELETE", "/api/recrutement/candidats/:id", async (req, res, params) => {
    const user = await connecte(req, res); if (!user) return;
    const c = await candidatDe(user, params.id); if (!c) return sendJSON(res, 404, { error: "Candidat introuvable." });
    await db.prepare("DELETE FROM recrut_commentaires WHERE candidat_id=?").run(c.id);
    await db.prepare("DELETE FROM recrut_candidats WHERE id=?").run(c.id);
    await toucher(c.dossier_id);
    sendJSON(res, 200, { deleted: true });
  });

  route("POST", "/api/recrutement/candidats/:id/commentaires", async (req, res, params, body) => {
    const user = await connecte(req, res); if (!user) return;
    const c = await candidatDe(user, params.id); if (!c) return sendJSON(res, 404, { error: "Candidat introuvable." });
    const t = texte(body && body.texte, MAX_COMMENTAIRE);
    if (t.length < 2) return sendJSON(res, 400, { error: "Écrivez votre commentaire." });
    const n = Number((await db.prepare("SELECT COUNT(*) AS n FROM recrut_commentaires WHERE candidat_id=?").get(c.id))?.n) || 0;
    if (n >= 100) return sendJSON(res, 400, { error: "Limite de 100 commentaires par candidat atteinte." });
    const id = Number((await db.prepare("INSERT INTO recrut_commentaires (candidat_id, user_id, texte) VALUES (?,?,?)").run(c.id, user.id, t)).lastInsertRowid);
    await toucher(c.dossier_id);
    sendJSON(res, 201, { id });
  });

  route("DELETE", "/api/recrutement/commentaires/:id", async (req, res, params) => {
    const user = await connecte(req, res); if (!user) return;
    const k = await db.prepare("SELECT id, candidat_id FROM recrut_commentaires WHERE id=? AND user_id=?").get(params.id, user.id);
    if (!k) return sendJSON(res, 404, { error: "Commentaire introuvable." });
    await db.prepare("DELETE FROM recrut_commentaires WHERE id=?").run(k.id);
    sendJSON(res, 200, { deleted: true });
  });

  /* ───────────── Repartager un CV (avec ou sans notes) ───────────── */
  async function composerPartage(user, c, { avecNotes, message }) {
    const coms = avecNotes ? await db.prepare("SELECT texte FROM recrut_commentaires WHERE candidat_id=? ORDER BY id ASC").all(c.id) : [];
    const encore = !!(c.cv_jeton && await CvExtras.lireCVPublicParJeton(db, c.cv_jeton));
    const lien = encore ? CvExtras.lienPublicCV(c.cv_jeton) : "";
    const moi = (await nomCompteAffichage(user.id)) || "un membre de Diaspo'Actif";
    const snap = json(c.snapshot_json, {}); const inf = (snap.data && snap.data.infos) || {};
    const lignes = [];
    if (message) lignes.push(message, "");
    lignes.push(`CV de ${c.nom || "candidat"}${c.titre_pro ? " — " + c.titre_pro : ""}`);
    if (lien) lignes.push(`👀 Voir le CV en ligne : ${lien}`);
    if (avecNotes && (c.note !== null || c.verdict || coms.length)) {
      lignes.push("", `📝 Appréciation de ${moi} :`);
      if (c.note !== null && c.note !== undefined) lignes.push(`Note : ${c.note}/10`);
      if (c.verdict) lignes.push(`Verdict : ${VERDICTS[c.verdict]}`);
      if (coms.length) { lignes.push("Commentaires :"); coms.forEach(k => lignes.push("• " + String(k.texte).replace(/\n+/g, " "))); }
    }
    return { texte: lignes.join("\n"), lien, disponible: encore, expediteur: moi, resume: brut(snap.data && snap.data.resume).slice(0, 300), titre_pro: inf.titre_pro || "", coms: coms.map(k => k.texte) };
  }

  /* Texte prêt à envoyer (messagerie Diaspo'Actif, WhatsApp, copie) : le client l'envoie par ses propres canaux. */
  route("GET", "/api/recrutement/candidats/:id/texte-partage", async (req, res, params, body, query) => {
    const user = await connecte(req, res); if (!user) return;
    const c = await candidatDe(user, params.id); if (!c) return sendJSON(res, 404, { error: "Candidat introuvable." });
    const r = await composerPartage(user, c, { avecNotes: String(query && query.avec_notes) === "1", message: texte(query && query.message, 600) });
    sendJSON(res, 200, { texte: r.texte, lien: r.lien, disponible: r.disponible });
  });

  /* Envoi par e-mail à une adresse extérieure à la plateforme. */
  route("POST", "/api/recrutement/candidats/:id/partager-email", async (req, res, params, body) => {
    const user = await connecte(req, res); if (!user) return;
    if (user.email_verifie != null && !Number(user.email_verifie)) return sendJSON(res, 403, { error: "Confirmez d'abord votre adresse e-mail pour pouvoir envoyer un CV par e-mail." });
    const c = await candidatDe(user, params.id); if (!c) return sendJSON(res, 404, { error: "Candidat introuvable." });
    const email = SEC.normalizeEmail((body && body.email) || "");
    if (!email || !SEC.isValidEmail(email)) return sendJSON(res, 400, { error: "Adresse e-mail du destinataire invalide." });
    const deja = Number((await db.prepare("SELECT COUNT(*) n FROM cv_partages WHERE user_id=? AND canal='email' AND created_at >= datetime('now','-1 day')").get(user.id))?.n) || 0;
    if (deja >= MAX_EMAILS_PAR_JOUR) return sendJSON(res, 429, { error: `Limite de ${MAX_EMAILS_PAR_JOUR} CV envoyés par e-mail par jour atteinte.` });
    const lim = SEC.rateLimit(`recrut-mail:${user.id}`, 5, 10 * 60000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Un peu de patience : réessayez dans ${lim.retryAfter}s.` });
    const avecNotes = !!(body && body.avec_notes);
    const message = texte(body && body.message, 600);
    const r0 = await composerPartage(user, c, { avecNotes, message: "" });
    const bouton = (href, t) => `<a href="${esc(href)}" style="display:inline-block;margin:6px 6px 0 0;padding:12px 22px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;background:#0D2B4E;color:#fff;">${esc(t)}</a>`;
    const notesHtml = avecNotes && (c.note !== null || c.verdict || r0.coms.length)
      ? `<div style="margin:16px 0 0;padding:12px 14px;border:1px solid #dfe6f0;border-radius:10px;background:#f8fafd;">
          <div style="font-weight:700;margin-bottom:6px;">📝 Appréciation de ${esc(r0.expediteur)}</div>
          ${c.note !== null ? `<div>Note : <b>${Number(c.note)}/10</b></div>` : ""}
          ${c.verdict ? `<div>Verdict : <b>${esc(VERDICTS[c.verdict])}</b></div>` : ""}
          ${r0.coms.length ? `<ul style="margin:8px 0 0;padding-left:18px;">${r0.coms.map(t => `<li>${esc(String(t).replace(/\n+/g, " "))}</li>`).join("")}</ul>` : ""}
        </div>` : "";
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2b4a;line-height:1.55;">
      <h2 style="margin:0 0 10px;font-size:20px;">${esc(r0.expediteur)} vous transmet le CV de ${esc(c.nom || "un candidat")}</h2>
      ${message ? `<p style="margin:0 0 14px;padding:10px 14px;background:#f3f6fb;border-radius:8px;white-space:pre-wrap;">${esc(message)}</p>` : ""}
      <p style="margin:0 0 6px;">Merci d'en prendre connaissance — excellente lecture.</p>
      ${r0.titre_pro ? `<p style="margin:0 0 6px;font-weight:700;">${esc(r0.titre_pro)}</p>` : ""}
      ${r0.resume ? `<p style="margin:0 0 12px;color:#52606d;">${esc(r0.resume)}${r0.resume.length >= 300 ? "…" : ""}</p>` : ""}
      <div>${r0.lien ? bouton(r0.lien, "Ouvrir le CV") : `<span style="color:#8a97a8;font-size:13px;">Le CV n'est plus consultable en ligne : le résumé ci-dessus est ce qui a été conservé.</span>`}</div>
      ${notesHtml}
      <p style="margin:22px 0 0;font-size:12px;color:#8a97a8;">Envoyé via Diaspo'Actif au nom de ${esc(r0.expediteur)}. Les appréciations sont personnelles : merci de ne pas les diffuser.</p>
    </div>`;
    const r = await sendEmail({ to: email, subject: `${r0.expediteur} vous transmet le CV de ${c.nom || "un candidat"}`, html, replyTo: user.email || undefined });
    if (!r.ok) return sendJSON(res, 502, { error: r.reason === "no_key" ? "L'envoi d'e-mails n'est pas disponible pour le moment." : "L'e-mail n'a pas pu être envoyé. Réessayez plus tard." });
    await db.prepare("INSERT INTO cv_partages (user_id, cv_numero, canal, destinataire) VALUES (?,?,?,?)").run(user.id, null, "email", email);
    sendJSON(res, 200, { ok: true });
  });
};
