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
const Droits = require("./formation-droits");

const TYPES = {
  participation: { label: "Attestation de participation", mention: "A participé à la formation" },
  suivi:         { label: "Attestation de suivi",         mention: "A suivi le parcours pédagogique" },
  reussite:      { label: "Certificat de réussite",       mention: "A réussi l'évaluation de la formation" },
};
const AVERTISSEMENT = "Document délivré par Diaspo'Actif au titre d'une formation proposée sur la plateforme. Il atteste de la participation, du suivi ou de la réussite indiqués ; ce n'est ni un diplôme reconnu par l'État ni une certification professionnelle officielle.";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const typeValide = t => (Object.prototype.hasOwnProperty.call(TYPES, t) ? t : "suivi");
/* Modèles visuels du document (lot 4) : choisis par le formateur, figés sur chaque document au moment de sa délivrance. */
const MODELES = ["classique", "moderne", "premium"];
const modeleValide = m => (MODELES.includes(m) ? m : "classique");
const MODES_SUIVI = ["auto", "manuel", "aucun"];
const MODES_DEPOT = ["non", "optionnel", "obligatoire"];
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
  let modules = await db.prepare("SELECT * FROM formation_modules WHERE formation_id=? ORDER BY ordre ASC, id ASC").all(f.id);
  /* Accès limité à des modules acquis (lot A) : seuls ceux-là entrent dans le parcours, la progression et les évaluations ; les autres sont listés à part, sans contenu. */
  const autorises = await Droits.modulesAutorises(db, inscription);
  let modules_verrouilles = [];
  if (autorises) {
    modules_verrouilles = modules.filter(m => !autorises.has(Number(m.id))).map(m => ({ id: Number(m.id), titre: m.titre, description: m.description || "", prix: Droits.prixModule(f, m), vendable_seul: !!Number(m.vendable_seul) }));
    modules = modules.filter(m => autorises.has(Number(m.id)));
  }
  let quizRows = await db.prepare("SELECT id, lecon_id, titre, type, note_minimale, correction_auto, temps_limite_min, max_tentatives, melanger, depot_fichier FROM formation_quiz WHERE formation_id=? ORDER BY ordre ASC, id ASC").all(f.id);
  if (autorises) {
    const idsLecons = new Set((await db.prepare("SELECT l.id FROM formation_lecons l JOIN formation_modules m ON m.id=l.module_id WHERE m.formation_id=?").all(f.id)).filter(l => true).map(l => Number(l.id)));
    const lecModule = {}; (await db.prepare("SELECT l.id, l.module_id FROM formation_lecons l JOIN formation_modules m ON m.id=l.module_id WHERE m.formation_id=?").all(f.id)).forEach(l => { lecModule[Number(l.id)] = Number(l.module_id); });
    quizRows = quizRows.filter(q => q.lecon_id != null && idsLecons.has(Number(q.lecon_id)) && autorises.has(lecModule[Number(q.lecon_id)]));
  }
  const termines = new Set();
  const tentativesParQuiz = {};
  if (inscription) {
    (await db.prepare("SELECT lecon_id FROM formation_lecons_progression WHERE inscription_id=? AND termine=1").all(inscription.id))
      .forEach(p => termines.add(Number(p.lecon_id)));
    (await db.prepare("SELECT quiz_id, note_pct, reussi, statut FROM formation_quiz_tentatives WHERE inscription_id=? AND COALESCE(statut,'corrige')<>'archive'").all(inscription.id)).forEach(t => {
      const k = Number(t.quiz_id);
      const e = tentativesParQuiz[k] || (tentativesParQuiz[k] = { nb: 0, meilleure: null, reussi: false, en_attente: false });
      e.nb++;
      /* Tentative en attente de correction par le formateur : ni réussie ni ratée tant qu'elle n'est pas corrigée. */
      if (t.statut === "a_corriger") { e.en_attente = true; return; }
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
          const t = tentativesParQuiz[Number(q.id)] || { nb: 0, meilleure: null, reussi: false, en_attente: false };
          l.quiz = { id: Number(q.id), titre: q.titre, type: q.type, note_minimale: nombre(q.note_minimale), correction_manuelle: Number(q.correction_auto) === 0, nb_tentatives: t.nb, meilleure_note: t.meilleure, reussi: t.reussi, en_attente: !!t.en_attente && !t.reussi,
            max_tentatives: nombre(q.max_tentatives) > 0 ? Math.floor(nombre(q.max_tentatives)) : null, temps_limite_min: nombre(q.temps_limite_min) > 0 ? Math.floor(nombre(q.temps_limite_min)) : null,
            epuise: nombre(q.max_tentatives) > 0 && t.nb >= Math.floor(nombre(q.max_tentatives)) && !t.reussi && !t.en_attente, depot_fichier: Number(q.correction_auto) === 0 ? (q.depot_fichier || "non") : "non" };
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
  if (f.suivi_mode === "aucun") statut = "libre"; /* formation sans suivi de progression (lot 4) */
  else if (!inscription) statut = "apercu";
  else if (avancement_pct >= 100) statut = (ev.reussite_requise && !ev.evaluations_ok) ? "en_attente_evaluation" : "termine";
  else if (toutes.some(l => l.obligatoire && !l.termine && l.quiz && l.quiz.en_attente) && toutes.filter(l => l.obligatoire && !l.termine).every(l => l.quiz && l.quiz.en_attente)) statut = "en_attente_evaluation";
  else if (nbTermine > 0 || Object.keys(tentativesParQuiz).length || toutes.some(l => l.termine)) statut = "en_cours";

  const suivante = toutes.find(l => l.obligatoire && !l.termine) || toutes.find(l => !l.termine) || null;
  return {
    modules, modules_verrouilles, avancement_pct, statut, nb_total: total, nb_termine: nbTermine, nb_restant: Math.max(0, total - nbTermine),
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
  /* Un accès limité à quelques modules ne donne pas droit au document de FORMATION (attestation / certificat) : il faut la formation complète. */
  if ((inscription.portee || "formation") === "modules") return null;
  const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(inscription.formation_id);
  if (!f || !Number(f.certificat_actif) || f.suivi_mode === "aucun") return null;
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
    await db.prepare(`INSERT INTO formation_attestations (code, inscription_id, formation_id, user_id, type, formation_titre, organisme, apprenant_nom, resultat_pct, modele)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(code, inscriptionId, f.id, inscription.user_id, type, f.titre, organisme, apprenant, resultat, modeleValide(f.certificat_modele));
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
  if (String(nomComplet || "").trim() === "Compte supprimé") return "Compte supprimé";
  const parts = String(nomComplet || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}
function vueAttestation(a) {
  const t = TYPES[typeValide(a.type)];
  return {
    code: a.code, type: typeValide(a.type), modele: modeleValide(a.modele), type_label: t.label, mention: t.mention, statut: a.statut || "valide",
    formation_id: Number(a.formation_id), formation_titre: a.formation_titre, organisme: a.organisme,
    date_emission: a.date_emission, resultat_pct: typeValide(a.type) === "reussite" && a.resultat_pct != null ? Number(a.resultat_pct) : null,
    avertissement: AVERTISSEMENT,
  };
}

/* ── Lot 2 : analyse pédagogique d'une formation (tableau de bord formateur) ── */
const JOURS_ABANDON = 21;
const jours = (iso) => {
  if (!iso) return null;
  const t = String(iso);
  const d = new Date(t.replace(" ", "T") + (t.length <= 19 && !/Z|\+/.test(t) ? "Z" : ""));
  return isNaN(d) ? null : Math.floor((Date.now() - d.getTime()) / 86400000);
};
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/* Par chapitre : part des apprenants qui ont terminé toutes ses activités obligatoires ; par quiz : tentatives, taux de réussite, note moyenne ;
   par apprenant : statut, jours d'inactivité, « abandon apparent » (non terminé et sans activité depuis JOURS_ABANDON jours) ; documents délivrés ; travaux à corriger. */
async function analyseFormation(db, f) {
  const inscriptions = await db.prepare("SELECT * FROM formation_inscriptions WHERE formation_id=? AND statut='active' AND COALESCE(paiement_statut,'paye')='paye'").all(f.id);
  const modules = await db.prepare("SELECT id, titre FROM formation_modules WHERE formation_id=? ORDER BY ordre ASC, id ASC").all(f.id);
  const toutes = [];
  const chapitres = [];
  for (const m of modules) {
    for (const c of await db.prepare("SELECT id, titre FROM formation_chapitres WHERE module_id=? ORDER BY ordre ASC, id ASC").all(m.id)) {
      const lecons = (await db.prepare("SELECT id, type, obligatoire FROM formation_lecons WHERE chapitre_id=? ORDER BY ordre ASC, id ASC").all(c.id))
        .map(l => ({ id: Number(l.id), type: l.type, obligatoire: l.obligatoire == null ? true : Number(l.obligatoire) !== 0 }));
      lecons.forEach(l => toutes.push(l));
      chapitres.push({ id: Number(c.id), titre: c.titre, module: m.titre, lecons });
    }
  }
  const nbOblig = toutes.filter(l => l.obligatoire).length;
  const compte = l => (nbOblig ? l.obligatoire : true);
  const ids = inscriptions.map(i => Number(i.id));
  const termines = {};   // inscription_id -> Set(lecon_id)
  const derniereDate = {}; // inscription_id -> dernière date de validation
  if (ids.length) {
    const marques = ids.map(() => "?").join(",");
    for (const r of await db.prepare(`SELECT inscription_id, lecon_id, date_completion FROM formation_lecons_progression WHERE termine=1 AND inscription_id IN (${marques})`).all(...ids)) {
      const k = Number(r.inscription_id);
      (termines[k] || (termines[k] = new Set())).add(Number(r.lecon_id));
      if (r.date_completion && (!derniereDate[k] || r.date_completion > derniereDate[k])) derniereDate[k] = r.date_completion;
    }
  }
  const chapitresStats = chapitres.map(c => {
    const req = c.lecons.filter(compte);
    const nbOk = req.length ? inscriptions.filter(i => req.every(l => (termines[Number(i.id)] || new Set()).has(l.id))).length : 0;
    return { id: c.id, titre: c.titre, module: c.module, nb_activites: req.length, nb_termine: nbOk, pct_completion: pct(nbOk, inscriptions.length) };
  });

  const quizRows = await db.prepare("SELECT id, titre, type, note_minimale, correction_auto, max_tentatives FROM formation_quiz WHERE formation_id=? ORDER BY ordre ASC, id ASC").all(f.id);
  const tent = ids.length ? await db.prepare(`SELECT inscription_id, quiz_id, note_pct, reussi, statut FROM formation_quiz_tentatives WHERE COALESCE(statut,'corrige')<>'archive' AND inscription_id IN (${ids.map(() => "?").join(",")})`).all(...ids) : [];
  const quiz = quizRows.map(q => {
    const lignes = tent.filter(t => Number(t.quiz_id) === Number(q.id));
    const parAppr = {};
    lignes.forEach(t => { const e = parAppr[t.inscription_id] || (parAppr[t.inscription_id] = { meilleure: null, reussi: false, corrigee: false }); if (t.statut === "a_corriger") return; e.corrigee = true; if (t.note_pct != null && (e.meilleure == null || Number(t.note_pct) > e.meilleure)) e.meilleure = Number(t.note_pct); if (Number(t.reussi) === 1) e.reussi = true; });
    const corriges = Object.values(parAppr).filter(e => e.corrigee);
    const notes = corriges.map(e => e.meilleure).filter(v => v != null);
    return {
      id: Number(q.id), titre: q.titre, type: q.type, seuil: nombre(q.note_minimale), correction_manuelle: Number(q.correction_auto) === 0,
      nb_apprenants: corriges.length, nb_tentatives: lignes.length, taux_reussite: pct(corriges.filter(e => e.reussi).length, corriges.length),
      note_moyenne: notes.length ? Math.round(notes.reduce((a, b) => a + b, 0) / notes.length) : null,
      a_corriger: lignes.filter(t => t.statut === "a_corriger").length,
    };
  });
  const a_corriger = quiz.reduce((a, q) => a + q.a_corriger, 0);

  const atts = await db.prepare("SELECT type, statut, inscription_id FROM formation_attestations WHERE formation_id=?").all(f.id);
  const attParInsc = {};
  atts.forEach(a => { attParInsc[Number(a.inscription_id)] = a; });
  const par_type = { participation: 0, suivi: 0, reussite: 0 };
  atts.filter(a => (a.statut || "valide") === "valide").forEach(a => { par_type[typeValide(a.type)]++; });

  let abandons = 0;
  const eleves = {};
  for (const i of inscriptions) {
    const k = Number(i.id);
    const set = termines[k] || new Set();
    const req = toutes.filter(compte);
    const ok = req.filter(l => set.has(l.id)).length;
    const avancement = req.length ? Math.round((ok / req.length) * 100) : 0;
    const derniere = derniereDate[k] || i.derniere_activite_le || i.date_inscription || i.created_at;
    const inactif = jours(derniere);
    const termine = avancement >= 100;
    const abandon = !termine && inactif != null && inactif >= JOURS_ABANDON;
    if (abandon) abandons++;
    const epuises = quizRows.filter(q => nombre(q.max_tentatives) > 0).filter(q => {
      const l = tent.filter(t => Number(t.inscription_id) === k && Number(t.quiz_id) === Number(q.id));
      return l.length >= Math.floor(nombre(q.max_tentatives)) && !l.some(t => Number(t.reussi) === 1) && !l.some(t => t.statut === "a_corriger");
    }).map(q => ({ quiz_id: Number(q.id), titre: q.titre }));
    eleves[k] = { quiz_epuises: epuises, avancement_pct: avancement, inactif_jours: inactif, abandon_apparent: abandon, attestation: attParInsc[k] ? typeValide(attParInsc[k].type) : null, attestation_statut: attParInsc[k] ? (attParInsc[k].statut || "valide") : null };
  }
  return { jours_abandon: JOURS_ABANDON, nb_inscrits: inscriptions.length, abandons, a_corriger, chapitres: chapitresStats, quiz, attestations: { total: atts.filter(a => (a.statut || "valide") === "valide").length, revoquees: atts.filter(a => (a.statut || "valide") !== "valide").length, par_type }, eleves };
}

/* Vue d'ensemble pour l'administration Diaspo'Actif. */
async function statistiquesAdmin(db) {
  const formations = await db.prepare(`SELECT f.id, f.titre, f.statut, f.mode_acces, f.prix, f.gratuit, f.owner_user_id,
    (SELECT COUNT(*) FROM formation_inscriptions i WHERE i.formation_id=f.id AND i.statut='active' AND COALESCE(i.paiement_statut,'paye')='paye') AS nb_inscrits,
    (SELECT COUNT(*) FROM formation_inscriptions i WHERE i.formation_id=f.id AND i.statut='active' AND COALESCE(i.paiement_statut,'paye')='paye' AND i.avancement_pct>=100) AS nb_termines,
    (SELECT COALESCE(SUM(i.montant_paye),0) FROM formation_inscriptions i WHERE i.formation_id=f.id AND i.statut='active' AND COALESCE(i.paiement_statut,'paye')='paye') AS revenu
    FROM formations f`).all();
  const num = v => nombre(v);
  const parStatut = {};
  formations.forEach(f => { const k = f.statut || "brouillon"; parStatut[k] = (parStatut[k] || 0) + 1; });
  const publiees = formations.filter(f => f.statut === "publiee");
  const inscrits = formations.reduce((a, f) => a + num(f.nb_inscrits), 0);
  const termines = formations.reduce((a, f) => a + num(f.nb_termines), 0);
  const gratuites = publiees.filter(f => Number(f.gratuit) === 1 || f.mode_acces === "gratuit").length;
  const atts = await db.prepare("SELECT type, statut FROM formation_attestations").all();
  const par_type = { participation: 0, suivi: 0, reussite: 0 };
  atts.filter(a => (a.statut || "valide") === "valide").forEach(a => { par_type[typeValide(a.type)]++; });
  const aCorriger = (await db.prepare("SELECT COUNT(*) AS n FROM formation_quiz_tentatives WHERE statut='a_corriger'").get() || {}).n;
  const tentatives = (await db.prepare("SELECT COUNT(*) AS n FROM formation_quiz_tentatives WHERE COALESCE(statut,'corrige')<>'archive'").get() || {}).n;
  const recentes = await db.prepare("SELECT code, type, statut, formation_titre, apprenant_nom, date_emission, organisme FROM formation_attestations ORDER BY date_emission DESC, id DESC LIMIT 25").all();
  const top = formations.filter(f => num(f.nb_inscrits) > 0).sort((a, b) => num(b.nb_inscrits) - num(a.nb_inscrits)).slice(0, 10)
    .map(f => ({ id: Number(f.id), titre: f.titre, statut: f.statut, nb_inscrits: num(f.nb_inscrits), taux_completion: pct(num(f.nb_termines), num(f.nb_inscrits)), revenu: Math.round(num(f.revenu) * 100) / 100, gratuite: Number(f.gratuit) === 1 || f.mode_acces === "gratuit" }));
  return {
    formations: { total: formations.length, par_statut: parStatut, publiees: publiees.length, publiees_gratuites: gratuites, publiees_payantes: publiees.length - gratuites },
    inscriptions: { total: inscrits, terminees: termines, taux_completion: pct(termines, inscrits) },
    revenu_total: Math.round(formations.reduce((a, f) => a + num(f.revenu), 0) * 100) / 100,
    documents: { total: par_type.participation + par_type.suivi + par_type.reussite, par_type, revoques: atts.filter(a => (a.statut || "valide") !== "valide").length },
    evaluations: { tentatives: num(tentatives), a_corriger: num(aCorriger) },
    top_formations: top,
    documents_recents: recentes.map(a => ({ code: a.code, type: typeValide(a.type), type_label: TYPES[typeValide(a.type)].label, statut: a.statut || "valide", formation_titre: a.formation_titre, organisme: a.organisme, beneficiaire: nomPublic(a.apprenant_nom), date_emission: a.date_emission })),
  };
}

module.exports = { MODELES, modeleValide, MODES_SUIVI, MODES_DEPOT, TYPES, AVERTISSEMENT, typeValide, corriger, construireParcours, evaluerAttestation, vueAttestation, nomPublic, analyseFormation, statistiquesAdmin };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, checkFormationOwner } = deps;

  async function inscriptionActive(formationId, userId) {
    await Droits.balayerExpirations(db, { userId, formationId });
    return await db.prepare("SELECT * FROM formation_inscriptions WHERE formation_id=? AND user_id=? AND statut='active' AND COALESCE(paiement_statut,'paye')='paye'").get(formationId, userId);
  }

  /* ── Lot 4 : réglages d'un quiz (tentatives limitées, temps imparti, ordre mélangé, dépôt de fichier) — appliqués ICI, jamais par le navigateur ── */
  const GRACE_SEC = 30; // marge de réseau : un envoi arrivé quelques secondes après l'échéance reste accepté
  const limiteMin = quiz => { const n = Math.floor(nombre(quiz.temps_limite_min)); return n > 0 ? n : 0; };
  const maxTent = quiz => { const n = Math.floor(nombre(quiz.max_tentatives)); return n > 0 ? n : 0; };
  const resteSec = (session, quiz) => Math.round((Date.parse(session.debut) + limiteMin(quiz) * 60000 - Date.now()) / 1000);
  const melangeTab = tab => { const a = tab.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const HOTES_FICHIERS = new Set(["diaspoactif-media.b-cdn.net"]);
  try { if (process.env.BUNNY_CDN_URL) HOTES_FICHIERS.add(new URL(process.env.BUNNY_CDN_URL).hostname); } catch (_) { /* variable absente ou mal formée : on garde l'hôte par défaut */ }
  /* Un fichier de devoir doit provenir de NOTRE stockage ET avoir été téléversé par l'apprenant lui-même (route /api/upload/document nomme le fichier « <id du compte>-<horodatage>.<ext> »). */
  function fichierAutorise(url, userId) {
    try {
      const u = new URL(String(url));
      if (u.protocol !== "https:" || !HOTES_FICHIERS.has(u.hostname)) return false;
      const m = u.pathname.match(/^\/documents\/(\d+)-\d+\.[a-z0-9]{2,5}$/i);
      return !!m && Number(m[1]) === Number(userId);
    } catch (_) { return false; }
  }
  const questionPublique = q => {
    const options = optionsDe(q);
    return { id: Number(q.id), question: q.question, type: q.type, options: q.type === "vrai_faux" && !options.length ? ["Vrai", "Faux"] : options, points: nombre(q.points) || 1, multiple: q.type === "qcm" && options.length > 0 && attenduesDe(q).length > 1 };
  };

  async function clotureHorsDelai(inscription, quiz, questions) {
    const ptsTotal = questions.reduce((a, q) => a + (nombre(q.points) || 1), 0);
    await db.prepare(`INSERT INTO formation_quiz_tentatives (inscription_id, quiz_id, note_pct, points_obtenus, points_total, reussi, nb_non_notees, reponses_json, statut)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(inscription.id, quiz.id, 0, 0, ptsTotal, 0, 0, "{}", "hors_delai");
    await db.prepare("DELETE FROM formation_quiz_sessions WHERE inscription_id=? AND quiz_id=?").run(inscription.id, quiz.id);
  }

  /* État complet d'un quiz pour un apprenant : questions SANS corrigé (ou aucune tant que le chrono n'est pas lancé), tentatives, chrono, blocage éventuel. */
  async function etatQuiz(inscription, quiz, demarrer) {
    const rows = await db.prepare("SELECT * FROM formation_quiz_questions WHERE quiz_id=? ORDER BY ordre ASC, id ASC").all(quiz.id);
    const manuel = Number(quiz.correction_auto) === 0;
    const lim = limiteMin(quiz), mx = maxTent(quiz);
    let session = lim ? await db.prepare("SELECT * FROM formation_quiz_sessions WHERE inscription_id=? AND quiz_id=?").get(inscription.id, quiz.id) : null;
    let expire = false;
    /* Temps écoulé sans envoi : la tentative est comptée (note 0) — recharger la page ne redonne pas un chronomètre neuf. */
    if (session && resteSec(session, quiz) < -GRACE_SEC) { await clotureHorsDelai(inscription, quiz, rows); session = null; expire = true; }
    const t = await db.prepare("SELECT COUNT(*) AS n, MAX(note_pct) AS meilleure, MAX(reussi) AS reussi FROM formation_quiz_tentatives WHERE inscription_id=? AND quiz_id=? AND COALESCE(statut,'corrige')<>'archive'").get(inscription.id, quiz.id);
    const derniere = await db.prepare("SELECT statut, note_pct, reussi, commentaire_formateur, corrige_le FROM formation_quiz_tentatives WHERE inscription_id=? AND quiz_id=? AND COALESCE(statut,'corrige')<>'archive' ORDER BY id DESC LIMIT 1").get(inscription.id, quiz.id);
    const nb = nombre(t && t.n), reussi = !!(t && Number(t.reussi) === 1), attente = !!(derniere && derniere.statut === "a_corriger");
    let bloque = null;
    if (attente) bloque = "en_attente";
    else if (reussi && manuel) bloque = "deja_reussi";
    else if (mx && nb >= mx && !reussi) bloque = "tentatives_epuisees";
    if (demarrer && lim && !session && !bloque && rows.length) {
      const ordre = Number(quiz.melanger) === 1 ? melangeTab(rows) : rows;
      try { await db.prepare("INSERT INTO formation_quiz_sessions (inscription_id, quiz_id, debut, ordre_json) VALUES (?,?,?,?)").run(inscription.id, quiz.id, new Date().toISOString(), JSON.stringify(ordre.map(q => Number(q.id)))); } catch (_) { /* démarrage simultané : l'autre a gagné */ }
      session = await db.prepare("SELECT * FROM formation_quiz_sessions WHERE inscription_id=? AND quiz_id=?").get(inscription.id, quiz.id);
    }
    let questions = [];
    if (!bloque && (!lim || session)) {
      let ordre = rows;
      let ids = null; try { ids = session && session.ordre_json ? JSON.parse(session.ordre_json) : null; } catch (_) { ids = null; }
      if (Array.isArray(ids)) ordre = rows.slice().sort((a, b) => { const x = ids.indexOf(Number(a.id)), y = ids.indexOf(Number(b.id)); return (x < 0 ? 1e9 : x) - (y < 0 ? 1e9 : y); });
      else if (Number(quiz.melanger) === 1) ordre = melangeTab(rows);
      questions = ordre.map(questionPublique);
    }
    return {
      quiz: { id: Number(quiz.id), titre: quiz.titre, type: quiz.type, note_minimale: nombre(quiz.note_minimale), temps_limite_min: lim || null, max_tentatives: mx || null, melanger: Number(quiz.melanger) === 1,
        depot_fichier: manuel ? (quiz.depot_fichier || "non") : "non", commentaires: quiz.commentaires_personnalises || null, correction_manuelle: manuel, nb_questions: rows.length },
      questions,
      tentatives: { nb, restantes: mx && !reussi ? Math.max(0, mx - nb) : null, meilleure_note: t && t.meilleure != null ? Number(t.meilleure) : null, reussi, en_attente: attente,
        derniere: derniere ? { statut: derniere.statut || "corrige", note_pct: derniere.note_pct != null ? Number(derniere.note_pct) : null, reussi: Number(derniere.reussi) === 1, commentaire: derniere.commentaire_formateur || null } : null },
      chrono: lim ? { minutes: lim, demarre: !!session, reste_sec: session ? Math.max(0, resteSec(session, quiz)) : null, expire_enregistre: expire } : null,
      bloque,
    };
  }

  /* GET /api/formations/:id/quiz/:quizId/passer — les questions SANS les bonnes réponses, plus l'historique des tentatives de l'apprenant. */
  route("GET", "/api/formations/:id/quiz/:quizId/passer", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const inscription = await inscriptionActive(params.id, user.id);
    if (!inscription) return sendJSON(res, 403, { error: "Vous devez être inscrit pour passer ce quiz." });
    const quiz = await db.prepare("SELECT * FROM formation_quiz WHERE id=? AND formation_id=?").get(params.quizId, params.id);
    if (!quiz) return sendJSON(res, 404, { error: "Quiz introuvable." });
    if (!(await Droits.quizPermis(db, inscription, quiz))) return sendJSON(res, 403, { error: "Ce quiz fait partie d'un module que vous n'avez pas obtenu.", code: "module_non_acquis" });
    sendJSON(res, 200, await etatQuiz(inscription, quiz, false));
  });

  /* POST /api/formations/:id/quiz/:quizId/demarrer — lance le chronomètre d'un quiz à temps imparti ; reprendre une session en cours ne remet pas le compteur à zéro. */
  route("POST", "/api/formations/:id/quiz/:quizId/demarrer", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const inscription = await inscriptionActive(params.id, user.id);
    if (!inscription) return sendJSON(res, 403, { error: "Vous devez être inscrit pour passer ce quiz." });
    const quiz = await db.prepare("SELECT * FROM formation_quiz WHERE id=? AND formation_id=?").get(params.quizId, params.id);
    if (!quiz) return sendJSON(res, 404, { error: "Quiz introuvable." });
    if (!(await Droits.quizPermis(db, inscription, quiz))) return sendJSON(res, 403, { error: "Ce quiz fait partie d'un module que vous n'avez pas obtenu.", code: "module_non_acquis" });
    if (!limiteMin(quiz)) return sendJSON(res, 400, { error: "Ce quiz n'a pas de temps imparti." });
    const etat = await etatQuiz(inscription, quiz, true);
    if (etat.bloque) return sendJSON(res, 409, { error: etat.bloque === "tentatives_epuisees" ? "Vous avez utilisé toutes vos tentatives pour ce quiz." : "Ce quiz n'est plus disponible pour le moment.", code: etat.bloque, ...etat });
    if (!etat.questions.length) return sendJSON(res, 400, { error: "Ce quiz ne contient pas encore de question." });
    sendJSON(res, 200, etat);
  });

  /* POST /api/formations/:id/quiz/:quizId/soumettre { reponses: { "<questionId>": "texte" | ["texte", …] }, fichier_url?, fichier_nom? } — correction et seuil appliqués ICI. */
  route("POST", "/api/formations/:id/quiz/:quizId/soumettre", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const limite = SEC.rateLimit(`quiz-soumettre:${user.id}`, 40, 3600000);
    if (!limite.allowed) return sendJSON(res, 429, { error: `Trop de tentatives. Réessayez dans ${limite.retryAfter}s.` });
    const inscription = await inscriptionActive(params.id, user.id);
    if (!inscription) return sendJSON(res, 403, { error: "Vous devez être inscrit pour passer ce quiz." });
    const quiz = await db.prepare("SELECT * FROM formation_quiz WHERE id=? AND formation_id=?").get(params.quizId, params.id);
    if (!quiz) return sendJSON(res, 404, { error: "Quiz introuvable." });
    if (!(await Droits.quizPermis(db, inscription, quiz))) return sendJSON(res, 403, { error: "Ce quiz fait partie d'un module que vous n'avez pas obtenu.", code: "module_non_acquis" });
    const reponses = body && typeof body.reponses === "object" && body.reponses ? body.reponses : {};
    const questions = await db.prepare("SELECT * FROM formation_quiz_questions WHERE quiz_id=? ORDER BY ordre ASC, id ASC").all(quiz.id);
    const manuel = Number(quiz.correction_auto) === 0;
    const depot = manuel ? (quiz.depot_fichier || "non") : "non";
    if (!questions.length && depot !== "obligatoire") return sendJSON(res, 400, { error: "Ce quiz ne contient pas encore de question." });

    const aggr = await db.prepare("SELECT COUNT(*) AS n, MAX(reussi) AS reussi FROM formation_quiz_tentatives WHERE inscription_id=? AND quiz_id=? AND COALESCE(statut,'corrige')<>'archive'").get(inscription.id, quiz.id);
    const nbAvant = nombre(aggr && aggr.n), dejaReussi = !!(aggr && Number(aggr.reussi) === 1);
    if (manuel) {
      const dejaAttente = await db.prepare("SELECT id FROM formation_quiz_tentatives WHERE inscription_id=? AND quiz_id=? AND statut='a_corriger'").get(inscription.id, quiz.id);
      if (dejaAttente) return sendJSON(res, 409, { error: "Votre précédente tentative est en attente de correction par le formateur.", code: "deja_en_attente" });
      if (dejaReussi) return sendJSON(res, 409, { error: "Vous avez déjà réussi cette évaluation.", code: "deja_reussi" });
    }
    const mx = maxTent(quiz);
    if (mx && nbAvant >= mx && !dejaReussi) return sendJSON(res, 403, { error: "Vous avez utilisé toutes vos tentatives pour ce quiz. Contactez le formateur si vous pensez qu'il s'agit d'une erreur.", code: "tentatives_epuisees" });

    /* Temps imparti : la session ouverte par /demarrer fait foi ; passé l'échéance (+ marge), la tentative est enregistrée « hors délai » et ne valide rien. */
    const lim = limiteMin(quiz);
    if (lim) {
      const session = await db.prepare("SELECT * FROM formation_quiz_sessions WHERE inscription_id=? AND quiz_id=?").get(inscription.id, quiz.id);
      if (!session) return sendJSON(res, 409, { error: "Ce quiz est chronométré : lancez-le d'abord avec le bouton « Commencer ».", code: "demarrage_requis" });
      if (resteSec(session, quiz) < -GRACE_SEC) {
        await clotureHorsDelai(inscription, quiz, questions);
        const fh = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
        const ph = await construireParcours(db, fh, inscription);
        return sendJSON(res, 200, { ok: true, hors_delai: true, reussi: false, note_pct: 0, seuil: nombre(quiz.note_minimale), avancement_pct: ph.avancement_pct, statut: ph.statut, attestation: null });
      }
    }

    /* Devoir avec dépôt de fichier (correction manuelle uniquement). */
    let fichierUrl = null, fichierNom = null;
    if (depot !== "non") {
      const u = String((body && body.fichier_url) || "").trim();
      if (u) {
        if (!fichierAutorise(u, user.id)) return sendJSON(res, 400, { error: "Fichier non valide : joignez-le depuis le formulaire du devoir (PDF, Word, Excel, PowerPoint ou image, 15 Mo maximum).", code: "fichier_invalide" });
        fichierUrl = u.slice(0, 500);
        fichierNom = String((body && body.fichier_nom) || "Document").trim().slice(0, 120) || "Document";
      } else if (depot === "obligatoire") return sendJSON(res, 400, { error: "Joignez votre fichier pour rendre ce devoir.", code: "fichier_requis" });
    }

    /* Quiz à CORRECTION MANUELLE (formation_quiz.correction_auto = 0) : les réponses sont enregistrées, l'activité n'est validée qu'après la note du formateur. */
    if (manuel) {
      const propres = {};
      questions.forEach(q => { const d = reponses[String(q.id)]; propres[q.id] = Array.isArray(d) ? d.slice(0, 20).map(x => String(x).slice(0, 2000)) : String(d == null ? "" : d).slice(0, 5000); });
      const ptsTotal = questions.reduce((a, q) => a + (nombre(q.points) || 1), 0);
      await db.prepare(`INSERT INTO formation_quiz_tentatives (inscription_id, quiz_id, note_pct, points_obtenus, points_total, reussi, nb_non_notees, reponses_json, statut, fichier_url, fichier_nom)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(inscription.id, quiz.id, null, 0, ptsTotal, 0, questions.length, JSON.stringify(propres).slice(0, 60000), "a_corriger", fichierUrl, fichierNom);
      if (lim) await db.prepare("DELETE FROM formation_quiz_sessions WHERE inscription_id=? AND quiz_id=?").run(inscription.id, quiz.id);
      const fm = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
      if (fm && typeof deps.creerNotif === "function" && fm.owner_user_id) {
        deps.creerNotif(fm.owner_user_id, "formation", "📝 Un travail est à corriger", `Un apprenant a rendu « ${quiz.titre} » dans la formation « ${fm.titre} ».`, { formation_id: Number(fm.id), quiz_id: Number(quiz.id) });
      }
      await db.prepare("UPDATE formation_inscriptions SET derniere_activite_le=datetime('now'), relance_inactivite_le=NULL WHERE id=?").run(inscription.id);
      const pm = await construireParcours(db, fm, inscription);
      return sendJSON(res, 200, { ok: true, en_attente_correction: true, avancement_pct: pm.avancement_pct, statut: pm.statut, attestation: null });
    }

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
    if (lim) await db.prepare("DELETE FROM formation_quiz_sessions WHERE inscription_id=? AND quiz_id=?").run(inscription.id, quiz.id);

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
      tentatives_restantes: mx && !reussi ? Math.max(0, mx - nbAvant - 1) : null,
      avancement_pct: p.avancement_pct, statut: p.statut, attestation: attestation ? vueAttestation(attestation) : null,
    });
  });

  /* POST /api/formations/:id/quiz/:quizId/reinitialiser { inscription_id } — le formateur redonne des tentatives à un apprenant qui a épuisé les siennes.
     Les anciennes tentatives sont ARCHIVÉES (conservées, mais ignorées par le décompte et la note) ; un quiz déjà réussi n'est pas concerné. */
  route("POST", "/api/formations/:id/quiz/:quizId/reinitialiser", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
    if (!checkFormationOwner(f, user)) return sendJSON(res, 403, { error: "Interdit." });
    const quiz = await db.prepare("SELECT * FROM formation_quiz WHERE id=? AND formation_id=?").get(params.quizId, params.id);
    if (!quiz) return sendJSON(res, 404, { error: "Quiz introuvable." });
    const insc = await db.prepare("SELECT * FROM formation_inscriptions WHERE id=? AND formation_id=?").get(Number(body && body.inscription_id), params.id);
    if (!insc) return sendJSON(res, 404, { error: "Inscription introuvable." });
    const reussi = await db.prepare("SELECT id FROM formation_quiz_tentatives WHERE inscription_id=? AND quiz_id=? AND reussi=1 AND COALESCE(statut,'corrige')<>'archive'").get(insc.id, quiz.id);
    if (reussi) return sendJSON(res, 409, { error: "Cet apprenant a déjà réussi ce quiz : il n'y a rien à réinitialiser." });
    const r = await db.prepare("UPDATE formation_quiz_tentatives SET statut='archive' WHERE inscription_id=? AND quiz_id=? AND COALESCE(statut,'corrige') NOT IN ('archive','a_corriger')").run(insc.id, quiz.id);
    await db.prepare("DELETE FROM formation_quiz_sessions WHERE inscription_id=? AND quiz_id=?").run(insc.id, quiz.id);
    if (typeof deps.creerNotif === "function") deps.creerNotif(insc.user_id, "formation", "🔁 Nouvelles tentatives disponibles", `Le formateur vous a redonné des tentatives pour « ${quiz.titre} » (formation « ${f.titre} »).`, { formation_id: Number(f.id), quiz_id: Number(quiz.id) });
    sendJSON(res, 200, { ok: true, archivees: Number((r && r.changes) || 0) });
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
    /* Le formateur peut retirer le QR code de la feuille (formations.certificat_qr) ; le code imprimé reste vérifiable à la main. */
    const fq = await db.prepare("SELECT certificat_qr FROM formations WHERE id=?").get(a.formation_id);
    sendJSON(res, 200, { attestation: { ...vueAttestation(a), apprenant_nom: a.apprenant_nom, qr: !fq || fq.certificat_qr == null || Number(fq.certificat_qr) !== 0 } });
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
  /* ── Lot 2 : correction manuelle des quiz par le formateur ── */

  /* GET /api/formations/:id/a-corriger — travaux en attente de correction, avec les réponses de l'apprenant en regard des questions. */
  route("GET", "/api/formations/:id/a-corriger", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
    if (!checkFormationOwner(f, user)) return sendJSON(res, 403, { error: "Interdit." });
    const rows = await db.prepare(`SELECT t.id, t.quiz_id, t.reponses_json, t.created_at, t.fichier_url, t.fichier_nom, q.titre AS quiz_titre, q.note_minimale, u.nom AS u_nom, u.prenom AS u_prenom
      FROM formation_quiz_tentatives t
      JOIN formation_quiz q ON q.id=t.quiz_id
      JOIN formation_inscriptions i ON i.id=t.inscription_id
      JOIN users u ON u.id=i.user_id
      WHERE q.formation_id=? AND t.statut='a_corriger' ORDER BY t.created_at ASC, t.id ASC`).all(params.id);
    const travaux = [];
    for (const t of rows) {
      let reps = {}; try { reps = JSON.parse(t.reponses_json || "{}") || {}; } catch (_) { reps = {}; }
      const questions = await db.prepare("SELECT * FROM formation_quiz_questions WHERE quiz_id=? ORDER BY ordre ASC, id ASC").all(t.quiz_id);
      travaux.push({
        id: Number(t.id), quiz_id: Number(t.quiz_id), quiz_titre: t.quiz_titre, seuil: nombre(t.note_minimale), soumis_le: t.created_at,
        apprenant: [t.u_prenom, t.u_nom].filter(Boolean).join(" ") || "Apprenant", fichier_url: t.fichier_url || null, fichier_nom: t.fichier_nom || null,
        reponses: questions.map(q => ({ question: q.question, type: q.type, points: nombre(q.points) || 1, reponse: reps[String(q.id)] == null ? "" : reps[String(q.id)], attendue: q.reponse_correcte ? String(q.reponse_correcte).split("|").join(" / ") : null })),
      });
    }
    sendJSON(res, 200, { travaux });
  });

  /* POST /api/formations/:id/tentatives/:tentativeId/corriger { note_pct, commentaire } — note du formateur ; même effets qu'un quiz corrigé automatiquement. */
  route("POST", "/api/formations/:id/tentatives/:tentativeId/corriger", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
    if (!checkFormationOwner(f, user)) return sendJSON(res, 403, { error: "Interdit." });
    const t = await db.prepare(`SELECT t.*, q.titre AS quiz_titre, q.lecon_id, q.note_minimale FROM formation_quiz_tentatives t JOIN formation_quiz q ON q.id=t.quiz_id
      WHERE t.id=? AND q.formation_id=?`).get(params.tentativeId, params.id);
    if (!t) return sendJSON(res, 404, { error: "Travail introuvable." });
    if (t.statut !== "a_corriger") return sendJSON(res, 409, { error: "Ce travail a déjà été corrigé." });
    const note = Number(body && body.note_pct);
    if (!Number.isFinite(note) || note < 0 || note > 100) return sendJSON(res, 400, { error: "Indiquez une note entre 0 et 100." });
    const commentaire = String((body && body.commentaire) || "").trim().slice(0, 2000);
    const reussi = note >= nombre(t.note_minimale);
    await db.prepare("UPDATE formation_quiz_tentatives SET note_pct=?, reussi=?, statut='corrige', commentaire_formateur=?, corrige_par=?, corrige_le=datetime('now') WHERE id=?")
      .run(Math.round(note * 10) / 10, reussi ? 1 : 0, commentaire || null, user.id, t.id);
    const inscription = await db.prepare("SELECT * FROM formation_inscriptions WHERE id=?").get(t.inscription_id);
    if (reussi && t.lecon_id != null) {
      const ex = await db.prepare("SELECT id FROM formation_lecons_progression WHERE inscription_id=? AND lecon_id=?").get(t.inscription_id, t.lecon_id);
      if (ex) await db.prepare("UPDATE formation_lecons_progression SET termine=1, date_completion=? WHERE id=?").run(new Date().toISOString(), ex.id);
      else await db.prepare("INSERT INTO formation_lecons_progression (inscription_id, lecon_id, termine, date_completion) VALUES (?,?,1,?)").run(t.inscription_id, t.lecon_id, new Date().toISOString());
    }
    const p = await construireParcours(db, f, inscription);
    await db.prepare("UPDATE formation_inscriptions SET avancement_pct=? WHERE id=?").run(p.avancement_pct, inscription.id);
    const attestation = await evaluerAttestation(deps, inscription.id);
    if (typeof deps.creerNotif === "function") {
      deps.creerNotif(inscription.user_id, "formation", reussi ? "✅ Votre travail a été corrigé" : "📝 Votre travail a été corrigé",
        reussi ? `« ${t.quiz_titre} » : ${Math.round(note)} % — validé.` : `« ${t.quiz_titre} » : ${Math.round(note)} % (seuil ${nombre(t.note_minimale)} %). Vous pouvez le repasser.`,
        { formation_id: Number(f.id), quiz_id: Number(t.quiz_id) });
    }
    sendJSON(res, 200, { ok: true, reussi, avancement_pct: p.avancement_pct, attestation: attestation ? vueAttestation(attestation) : null });
  });

  /* GET /api/admin/formation-stats — vue d'ensemble de la plateforme (administration). */
  route("GET", "/api/admin/formation-stats", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    if (user.role !== "administrateur") return sendJSON(res, 403, { error: "Réservé à l'administration." });
    sendJSON(res, 200, await statistiquesAdmin(db));
  });
};
