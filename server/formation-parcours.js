/* ═════════════════════════════════════════════════
   server/formation-parcours.js — Lot 1 « Diaspo'Actif Formation » (2026-10-18, demande explicite)

   Une seule source de vérité, CÔTÉ SERVEUR, pour :
   - la progression de l'apprenant : activités obligatoires / facultatives (formation_lecons.obligatoire), jauge globale + jauge par chapitre,
     statut (non commencé / en cours / en attente d'évaluation / terminé) et « prochaine activité à faire » ;
   - le passage des quiz : l'apprenant ne reçoit jamais les bonnes réponses, la correction et le seuil de réussite (formation_quiz.note_minimale)
     sont appliqués ici, chaque tentative est conservée (formation_quiz_tentatives) ; une leçon de type quiz ne se valide QUE par la réussite ;
   - les documents délivrés (formation_attestations), de trois sortes bien distinctes — attestation de participation, attestation de suivi,
     certificat de réussite — émis automatiquement quand les conditions configurées sont remplies, jamais avant, et vérifiables publiquement
     par leur code (GET /api/attestations/verifier/:code → page verifier-attestation.html).

   Un document Diaspo'Actif n'est JAMAIS présenté comme un diplôme reconnu par l'État ni comme une certification professionnelle officielle.
   ═════════════════════════════════════════════════ */
"use strict";
const crypto = require("crypto");

const TYPES = {
  participation: { label: "Attestation de participation", mention: "A participé à la formation" },
  suivi:         { label: "Attestation de suivi",         mention: "A suivi le parcours pédagogique" },
  reussite:      { label: "Certificat de réussite",       mention: "A réussi l'évaluation de la formation" },
};
const AVERTISSEMENT = "Document délivré par Diaspo'Actif au titre d'une formation proposée sur la plateforme. Il atteste de la participation, du suivi ou de la réussite indiqués ; ce n'est ni un diplôme reconnu par l'État ni une certification professionnelle officielle.";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const typeValide = t => (Object.prototype.hasOwnProperty.call(TYPES, t) ? t : "suivi");
const nombre = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function codeAttestation() {
  let s = "";
  for (let i = 0; i < 12; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `DA-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

/* ── Correction d'une réponse (serveur uniquement) ── */
function normaliser(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?;:]+$/g, "").trim();
}
function optionsDe(q) {
  try { const o = JSON.parse(q.options_json || "null"); return Array.isArray(o) ? o.map(String).filter(x => x.trim()) : []; } catch (_) { return []; }
}
function attenduesDe(q) { return String(q.reponse_correcte || "").split("|").map(normaliser).filter(Boolean); }
/* Retourne { note:false } si la question n'a pas de réponse de référence (réponse libre : non notée),
   sinon { note:true, ok } — QCM à choix : tout l'ensemble des bonnes réponses ; sinon : une des réponses acceptées (séparées par « | »). */
function corriger(q, reponse) {
  const attendues = attenduesDe(q);
  if (!attendues.length) return { note: false };
  let donnees = (Array.isArray(reponse) ? reponse : [reponse]).map(normaliser).filter(Boolean);
  let ok;
  if (q.type === "qcm" && optionsDe(q).length) {
    donnees = [...new Set(donnees)];
    ok = donnees.length === attendues.length && attendues.every(a => donnees.includes(a));
  } else {
    ok = donnees.length > 0 && attendues.includes(donnees[0]);
  }
  return { note: true, ok: !!ok };
}

/* ── Parcours d'un apprenant ── */
async function construireParcours(db, f, inscription) {
  const modules = await db.prepare("SELECT * FROM formation_modules WHERE formation_id=? ORDER BY ordre ASC, id ASC").all(f.id);
  const quizRows = await db.prepare("SELECT id, lecon_id, titre, type, note_minimale FROM formation_quiz WHERE formation_id=? ORDER BY ordre ASC, id ASC").all(f.id);
  const termines = new Set();
  const tentativesParQuiz = {};
  if (inscription) {
    (await db.prepare("SELECT lecon_id FROM formation_lecons_progression WHERE inscription_id=? AND termine=1").all(inscription.id))
      .forEach(p => termines.add(Number(p.lecon_id)));
    (await db.prepare("SELECT quiz_id, note_pct, reussi FROM formation_quiz_tentatives WHERE inscription_id=?").all(inscription.id)).forEach(t => {
      const k = Number(t.quiz_id);
      const e = tentativesParQuiz[k] || (tentativesParQuiz[k] = { nb: 0, meilleure: null, reussi: false });
      e.nb++;
      if (t.note_pct != null && (e.meilleure == null || Number(t.note_pct) > e.meilleure)) e.meilleure = Number(t.note_pct);
      if (Number(t.reussi) === 1) e.reussi = true;
    });
  }
  const quizParLecon = {};
  quizRows.forEach(q => { if (q.lecon_id != null) quizParLecon[Number(q.lecon_id)] = q; });

  const toutes = [];
  for (const m of modules) {
    m.chapitres = await db.prepare("SELECT * FROM formation_chapitres WHERE module_id=? ORDER BY ordre ASC, id ASC").all(m.id);
    for (const c of m.chapitres) {
      c.lecons = await db.prepare("SELECT * FROM formation_lecons WHERE chapitre_id=? ORDER BY ordre ASC, id ASC").all(c.id);
      c.lecons.forEach(l => {
        l.termine = termines.has(Number(l.id));
        l.obligatoire = l.obligatoire == null ? true : Number(l.obligatoire) !== 0;
        const q = quizParLecon[Number(l.id)];
        if (q) {
          const t = tentativesParQuiz[Number(q.id)] || { nb: 0, meilleure: null, reussi: false };
          l.quiz = { id: Number(q.id), titre: q.titre, type: q.type, note_minimale: nombre(q.note_minimale), nb_tentatives: t.nb, meilleure_note: t.meilleure, reussi: t.reussi };
        }
        toutes.push(l);
      });
    }
  }
  /* Une formation sans aucune leçon marquée obligatoire (ancien contenu, ou toutes décochées) compte toutes ses leçons : pas de division par zéro. */
  const nbOblig = toutes.filter(l => l.obligatoire).length;
  const compte = l => (nbOblig ? l.obligatoire : true);
  for (const m of modules) {
    for (const c of m.chapitres) {
      const retenues = c.lecons.filter(compte);
      const nbTot = retenues.length, nbOk = retenues.filter(l => l.termine).length;
      c.stats = { total: nbTot, termine: nbOk, pct: nbTot ? Math.round((nbOk / nbTot) * 100) : (c.lecons.length ? 100 : 0), total_lecons: c.lecons.length };
    }
  }
  const retenues = toutes.filter(compte);
  const total = retenues.length, nbTermine = retenues.filter(l => l.termine).length;
  const avancement_pct = total ? Math.round((nbTermine / total) * 100) : 0;
  const chapitres = modules.flatMap(m => m.chapitres);
  const chapitres_termines = chapitres.filter(c => c.stats.total > 0 && c.stats.termine >= c.stats.total).length;

  const ev = evaluerConditions({ f, avancement_pct, total, nbTermine, toutes, quizRows, tentativesParQuiz });
  let statut = "non_commence";
  if (!inscription) statut = "apercu";
  else if (avancement_pct >= 100) statut = (ev.reussite_requise && !ev.evaluations_ok) ? "en_attente_evaluation" : "termine";
  else if (nbTermine > 0 || Object.keys(tentativesParQuiz).length || toutes.some(l => l.termine)) statut = "en_cours";

  const suivante = toutes.find(l => l.obligatoire && !l.termine) || toutes.find(l => !l.termine) || null;
  return {
    modules, avancement_pct, statut, nb_total: total, nb_termine: nbTermine, nb_restant: Math.max(0, total - nbTermine),
    chapitres_total: chapitres.length, chapitres_termines,
    prochaine_lecon_id: suivante ? Number(suivante.id) : null,
    resultat_pct: ev.resultat_pct, conditions: ev.conditions, conditions_ok: ev.ok, quiz: quizRows,
  };
}

/* Conditions d'obtention du document configuré par le formateur (formations.certificat_type). */
function evaluerConditions({ f, avancement_pct, total, nbTermine, toutes, quizRows, tentativesParQuiz }) {
  const type = typeValide(f.certificat_type);
  /* Quiz « notés » = ceux qu'il faut réussir. Un quiz dont aucune question n'a de réponse de référence est un simple exercice (validé à l'envoi) : sans note. */
  const reussis = quizRows.filter(q => (tentativesParQuiz[Number(q.id)] || {}).reussi);
  const notes = quizRows.map(q => (tentativesParQuiz[Number(q.id)] || {}).meilleure).filter(v => v != null);
  const resultat_pct = notes.length ? Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) / 10 : null;
  const evaluations_ok = quizRows.length > 0 && reussis.length === quizRows.length;
  const conditions = [];
  let ok;
  if (type === "participation") {
    const commence = toutes.some(l => l.termine);
    conditions.push({ libelle: "Commencer la formation (au moins une activité terminée)", ok: commence });
    ok = commence;
  } else {
    const fini = total > 0 && avancement_pct >= 100;
    conditions.push({ libelle: `Terminer toutes les activités obligatoires (${nbTermine}/${total})`, ok: fini });
    ok = fini;
    if (type === "reussite") {
      conditions.push({ libelle: quizRows.length ? `Réussir les évaluations (${reussis.length}/${quizRows.length}), seuil fixé par le formateur` : "Aucune évaluation n'est encore définie par le formateur", ok: evaluations_ok });
      ok = ok && evaluations_ok;
    }
  }
  return { ok: !!ok, conditions, resultat_pct, evaluations_ok, reussite_requise: type === "reussite" };
}

/* Délivre le document si — et seulement si — le formateur l'a activé et que toutes les conditions sont remplies. Idempotent (une par inscription). */
async function evaluerAttestation(deps, inscriptionId) {
  const { db, creerNotif } = deps;
  const inscription = await db.prepare("SELECT * FROM formation_inscriptions WHERE id=?").get(inscriptionId);
  if (!inscription || inscription.statut !== "active" || inscription.paiement_statut === "en_attente" || inscription.paiement_statut === "echoue") return null;
  const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(inscription.formation_id);
  if (!f || !Number(f.certificat_actif)) return null;
  const deja = await db.prepare("SELECT * FROM formation_attestations WHERE inscription_id=?").get(inscriptionId);
  if (deja) return deja;
  const p = await construireParcours(db, f, inscription);
  if (!p.conditions_ok) return null;
  const type = typeValide(f.certificat_type);
  const u = await db.prepare("SELECT nom, prenom FROM users WHERE id=?").get(inscription.user_id);
  const apprenant = [u && u.prenom, u && u.nom].filter(Boolean).join(" ") || "Apprenant";
  const organisme = f.organisme || (await nomOrganisme(deps, f)) || "Diaspo'Actif";
  let code = codeAttestation();
  for (let i = 0; i < 5 && await db.prepare("SELECT 1 FROM formation_attestations WHERE code=?").get(code); i++) code = codeAttestation();
  const resultat = type === "reussite" ? p.resultat_pct : null;
  try {
    await db.prepare(`INSERT INTO formation_attestations (code, inscription_id, formation_id, user_id, type, formation_titre, organisme, apprenant_nom, resultat_pct)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(code, inscriptionId, f.id, inscription.user_id, type, f.titre, organisme, apprenant, resultat);
  } catch (e) {
    /* Deux validations simultanées : l'autre a gagné (UNIQUE inscription_id) — on renvoie celle qui existe. */
    return await db.prepare("SELECT * FROM formation_attestations WHERE inscription_id=?").get(inscriptionId);
  }
  if (typeof creerNotif === "function") {
    creerNotif(inscription.user_id, "formation", `🎓 ${TYPES[type].label} disponible`, `Votre ${TYPES[type].label.toLowerCase()} pour « ${f.titre} » est prêt(e) : consultez-le et imprimez-le depuis « Mes certifications ».`, { formation_id: Number(f.id), code });
  }
  return await db.prepare("SELECT * FROM formation_attestations WHERE inscription_id=?").get(inscriptionId);
}
async function nomOrganisme(deps, f) {
  try { return f.owner_user_id && deps.nomCompteAffichage ? await deps.nomCompteAffichage(f.owner_user_id) : ""; } catch (_) { return ""; }
}

/* Prénom + initiale du nom : la page publique de vérification n'expose pas l'identité complète. */
function nomPublic(nomComplet) {
  const parts = String(nomComplet || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}
function vueAttestation(a) {
  const t = TYPES[typeValide(a.type)];
  return {
    code: a.code, type: typeValide(a.type), type_label: t.label, mention: t.mention, statut: a.statut || "valide",
    formation_id: Number(a.formation_id), formation_titre: a.formation_titre, organisme: a.organisme,
    date_emission: a.date_emission, resultat_pct: typeValide(a.type) === "reussite" && a.resultat_pct != null ? Number(a.resultat_pct) : null,
    avertissement: AVERTISSEMENT,
  };
}

module.exports = { TYPES, AVERTISSEMENT, typeValide, corriger, construireParcours, evaluerAttestation, vueAttestation, nomPublic };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, checkFormationOwner } = deps;

  async function inscriptionActive(formationId, userId) {
    return await db.prepare("SELECT * FROM formation_inscriptions WHERE formation_id=? AND user_id=? AND statut='active' AND COALESCE(paiement_statut,'paye')='paye'").get(formationId, userId);
  }

  /* GET /api/formations/:id/quiz/:quizId/passer — les questions SANS les bonnes réponses, plus l'historique des tentatives de l'apprenant. */
  route("GET", "/api/formations/:id/quiz/:quizId/passer", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const inscription = await inscriptionActive(params.id, user.id);
    if (!inscription) return sendJSON(res, 403, { error: "Vous devez être inscrit pour passer ce quiz." });
    const quiz = await db.prepare("SELECT * FROM formation_quiz WHERE id=? AND formation_id=?").get(params.quizId, params.id);
    if (!quiz) return sendJSON(res, 404, { error: "Quiz introuvable." });
    const questions = (await db.prepare("SELECT * FROM formation_quiz_questions WHERE quiz_id=? ORDER BY ordre ASC, id ASC").all(quiz.id)).map(q => {
      const options = optionsDe(q);
      return { id: Number(q.id), question: q.question, type: q.type, options: q.type === "vrai_faux" && !options.length ? ["Vrai", "Faux"] : options, points: nombre(q.points) || 1, multiple: q.type === "qcm" && options.length > 0 && attenduesDe(q).length > 1 };
    });
    const t = await db.prepare("SELECT COUNT(*) AS n, MAX(note_pct) AS meilleure, MAX(reussi) AS reussi FROM formation_quiz_tentatives WHERE inscription_id=? AND quiz_id=?").get(inscription.id, quiz.id);
    sendJSON(res, 200, {
      quiz: { id: Number(quiz.id), titre: quiz.titre, type: quiz.type, note_minimale: nombre(quiz.note_minimale), temps_limite_min: quiz.temps_limite_min || null, commentaires: quiz.commentaires_personnalises || null },
      questions, tentatives: { nb: nombre(t && t.n), meilleure_note: t && t.meilleure != null ? Number(t.meilleure) : null, reussi: !!(t && Number(t.reussi) === 1) },
    });
  });

  /* POST /api/formations/:id/quiz/:quizId/soumettre { reponses: { "<questionId>": "texte" | ["texte", …] } } — correction et seuil appliqués ICI. */
  route("POST", "/api/formations/:id/quiz/:quizId/soumettre", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const limite = SEC.rateLimit(`quiz-soumettre:${user.id}`, 40, 3600000);
    if (!limite.allowed) return sendJSON(res, 429, { error: `Trop de tentatives. Réessayez dans ${limite.retryAfter}s.` });
    const inscription = await inscriptionActive(params.id, user.id);
    if (!inscription) return sendJSON(res, 403, { error: "Vous devez être inscrit pour passer ce quiz." });
    const quiz = await db.prepare("SELECT * FROM formation_quiz WHERE id=? AND formation_id=?").get(params.quizId, params.id);
    if (!quiz) return sendJSON(res, 404, { error: "Quiz introuvable." });
    const reponses = body && typeof body.reponses === "object" && body.reponses ? body.reponses : {};
    const questions = await db.prepare("SELECT * FROM formation_quiz_questions WHERE quiz_id=? ORDER BY ordre ASC, id ASC").all(quiz.id);
    if (!questions.length) return sendJSON(res, 400, { error: "Ce quiz ne contient pas encore de question." });

    let total = 0, obtenus = 0, nonNotees = 0;
    const detail = [];
    for (const q of questions) {
      const pts = nombre(q.points) || 1;
      const donnee = reponses[String(q.id)];
      const r = corriger(q, donnee == null ? "" : (Array.isArray(donnee) ? donnee.slice(0, 20).map(x => String(x).slice(0, 500)) : String(donnee).slice(0, 1000)));
      if (!r.note) { nonNotees++; detail.push({ question_id: Number(q.id), note: false }); continue; }
      total += pts; if (r.ok) obtenus += pts;
      detail.push({ question_id: Number(q.id), note: true, correct: r.ok, bonne_reponse: null });
    }
    const note = total > 0 ? Math.round((obtenus / total) * 1000) / 10 : null;
    const reussi = total > 0 ? note >= nombre(quiz.note_minimale) : true;
    await db.prepare(`INSERT INTO formation_quiz_tentatives (inscription_id, quiz_id, note_pct, points_obtenus, points_total, reussi, nb_non_notees, reponses_json)
      VALUES (?,?,?,?,?,?,?,?)`).run(inscription.id, quiz.id, note, obtenus, total, reussi ? 1 : 0, nonNotees, JSON.stringify(reponses).slice(0, 20000));

    if (reussi) {
      /* Réussir le quiz valide la leçon qui le porte. */
      if (quiz.lecon_id != null) {
        const ex = await db.prepare("SELECT id FROM formation_lecons_progression WHERE inscription_id=? AND lecon_id=?").get(inscription.id, quiz.lecon_id);
        if (ex) await db.prepare("UPDATE formation_lecons_progression SET termine=1, date_completion=? WHERE id=?").run(new Date().toISOString(), ex.id);
        else await db.prepare("INSERT INTO formation_lecons_progression (inscription_id, lecon_id, termine, date_completion) VALUES (?,?,1,?)").run(inscription.id, quiz.lecon_id, new Date().toISOString());
      }
      /* Le corrigé n'est révélé qu'une fois le quiz réussi : une tentative ratée ne donne pas les réponses à la suivante. */
      detail.forEach(d => {
        if (!d.note) return;
        const q = questions.find(x => Number(x.id) === d.question_id);
        d.bonne_reponse = String(q.reponse_correcte || "").split("|").map(s => s.trim()).filter(Boolean).join(" / ");
      });
    }
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    const p = await construireParcours(db, f, inscription);
    await db.prepare("UPDATE formation_inscriptions SET avancement_pct=?, derniere_activite_le=datetime('now'), relance_inactivite_le=NULL WHERE id=?").run(p.avancement_pct, inscription.id);
    const attestation = await evaluerAttestation(deps, inscription.id);
    sendJSON(res, 200, {
      ok: true, note_pct: note, reussi, seuil: nombre(quiz.note_minimale), points_obtenus: obtenus, points_total: total, nb_non_notees: nonNotees,
      detail, commentaires: quiz.commentaires_personnalises || null,
      avancement_pct: p.avancement_pct, statut: p.statut, attestation: attestation ? vueAttestation(attestation) : null,
    });
  });

  /* GET /api/mes-attestations — les documents délivrés au compte connecté. */
  route("GET", "/api/mes-attestations", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const rows = await db.prepare("SELECT * FROM formation_attestations WHERE user_id=? ORDER BY date_emission DESC, id DESC").all(user.id);
    sendJSON(res, 200, { attestations: rows.map(vueAttestation) });
  });

  /* GET /api/attestations/mon/:code — le document complet, pour son titulaire (page imprimable attestation.html). */
  route("GET", "/api/attestations/mon/:code", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const a = await db.prepare("SELECT * FROM formation_attestations WHERE code=?").get(String(params.code || "").toUpperCase());
    if (!a || (Number(a.user_id) !== Number(user.id) && user.role !== "administrateur")) return sendJSON(res, 404, { error: "Document introuvable." });
    sendJSON(res, 200, { attestation: { ...vueAttestation(a), apprenant_nom: a.apprenant_nom } });
  });

  /* GET /api/attestations/verifier/:code — PUBLIC : confirme l'authenticité d'un document sans exposer de donnée personnelle superflue
     (prénom + initiale du nom, jamais d'e-mail ni d'identifiant interne). Limité par IP contre l'énumération des codes. */
  route("GET", "/api/attestations/verifier/:code", async (req, res, params) => {
    const limite = SEC.rateLimit(`attestation-verif:${SEC.clientIp(req)}`, 60, 600000);
    if (!limite.allowed) return sendJSON(res, 429, { error: `Trop de vérifications. Réessayez dans ${limite.retryAfter}s.` });
    const code = String(params.code || "").trim().toUpperCase().slice(0, 40);
    const a = code ? await db.prepare("SELECT * FROM formation_attestations WHERE code=?").get(code) : null;
    if (a) {
      return sendJSON(res, 200, { trouve: true, origine: "diaspoactif", ...vueAttestation(a), beneficiaire: nomPublic(a.apprenant_nom), valide: (a.statut || "valide") === "valide" });
    }
    /* Ancien système : certification déclarée par le membre lui-même (jamais délivrée par la plateforme) — signalée comme telle, et seulement si le membre l'a rendue publique. */
    const d = code ? await db.prepare(`SELECT uco.titre, uco.organisme, uco.date_obtention, u.nom, u.prenom FROM user_certifications_obtenues uco
      JOIN users u ON u.id=uco.user_id WHERE uco.code_verification=? AND uco.partage_public=1`).get(code) : null;
    if (d) {
      return sendJSON(res, 200, { trouve: true, origine: "declaree", valide: true, formation_titre: d.titre, organisme: d.organisme || null, date_emission: d.date_obtention,
        beneficiaire: nomPublic([d.prenom, d.nom].filter(Boolean).join(" ")), type_label: "Certification déclarée par le membre",
        mention: "Cette mention a été saisie par le titulaire lui-même : elle n'a pas été délivrée ni contrôlée par Diaspo'Actif.", avertissement: AVERTISSEMENT });
    }
    sendJSON(res, 404, { trouve: false, error: "Aucun document ne correspond à ce code." });
  });

  /* POST /api/attestations/:code/revoquer { motif } — formateur de la formation ou administrateur (erreur d'émission, fraude…) : le document reste vérifiable mais « révoqué ». */
  route("POST", "/api/attestations/:code/revoquer", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const a = await db.prepare("SELECT * FROM formation_attestations WHERE code=?").get(String(params.code || "").toUpperCase());
    if (!a) return sendJSON(res, 404, { error: "Document introuvable." });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(a.formation_id);
    if (!checkFormationOwner(f, user)) return sendJSON(res, 403, { error: "Interdit." });
    const motif = String((body && body.motif) || "").trim().slice(0, 500);
    if (!motif) return sendJSON(res, 400, { error: "Indiquez le motif de la révocation." });
    await db.prepare("UPDATE formation_attestations SET statut='revoque', motif_revocation=? WHERE id=?").run(motif, a.id);
    sendJSON(res, 200, { ok: true });
  });
};
