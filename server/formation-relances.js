/* ═════════════════════════════════════════════════
   server/formation-relances.js — Formation Diaspora, lot C : RELANCES PROGRAMMABLES (2026-10-30)

   - Un formateur écrit ses propres règles : « quand l'apprenant (événement) → lui envoyer ce message (canal : notification, e-mail) ».
     Cinq événements : inactivité de N jours, jamais commencé après N jours, palier de progression N %, accès qui expire dans N jours,
     formation non terminée N jours après l'inscription. Une règle vaut pour UNE formation ou pour TOUTES celles du formateur.
   - Chaque envoi est écrit dans un JOURNAL (qui, quelle règle, quel canal, réussi ou non). Le journal sert aussi de verrou : (règle, inscription, canal, rang) est
     unique, donc deux exécutions du cron ne relancent jamais deux fois la même personne pour le même rang.
   - Garde-fous : jamais plus de 2 relances par personne et par jour (toutes règles confondues) ; l'e-mail respecte le réglage « e-mails non essentiels » du compte ;
     l'apprenant peut couper les rappels d'une formation (bouton dans le lecteur ou lien de désinscription de l'e-mail) ; l'administration peut bloquer une règle abusive.
   - Les cinq relances « de base » historiques (paliers 25/50/75 %, 7 jours d'inactivité, dernière leçon) restent dans server/index.js (cron formation-relances) ;
     le formateur peut les couper formation par formation (formations.relances_defaut) et elles écrivent aussi dans le journal.
   ═════════════════════════════════════════════════ */
"use strict";

const MAX_REGLES_PAR_FORMATEUR = 20;
const MAX_RELANCES_PAR_PERSONNE_ET_PAR_JOUR = 2;
const MAX_ENVOIS_PAR_EXECUTION = 2000;
const JOUR = 86400000;

const EVENEMENTS = {
  inactivite: { label: "L'apprenant n'a rien fait depuis…", unite: "jours", min: 1, max: 365, defaut: 7,
    objet: "On vous attend sur « {formation} »", message: "Bonjour {prenom},\n\nCela fait {jours} jours que vous n'avez pas repris « {formation} ». Votre progression ({progression} %) est sauvegardée : reprenez là où vous vous êtes arrêté(e), quelques minutes suffisent." },
  jamais_commence: { label: "L'apprenant n'a encore rien commencé, {n} jours après son inscription", unite: "jours", min: 1, max: 365, defaut: 3,
    objet: "Prêt(e) à démarrer « {formation} » ?", message: "Bonjour {prenom},\n\nVous êtes inscrit(e) à « {formation} » depuis {jours} jours, mais vous n'avez pas encore commencé. La première leçon vous attend : lancez-vous !" },
  palier: { label: "L'apprenant atteint… % de progression", unite: "%", min: 1, max: 99, defaut: 50,
    objet: "Bravo, vous avancez bien !", message: "Bonjour {prenom},\n\nVous avez atteint {progression} % de « {formation} ». Continuez sur cette lancée : plus que quelques étapes." },
  avant_expiration: { label: "L'accès de l'apprenant expire dans…", unite: "jours", min: 1, max: 365, defaut: 7,
    objet: "Votre accès à « {formation} » se termine bientôt", message: "Bonjour {prenom},\n\nVotre accès à « {formation} » se termine le {expiration} (dans {jours} jours). Profitez-en pour avancer : vous en êtes à {progression} %." },
  non_terminee: { label: "L'apprenant n'a pas terminé, {n} jours après son inscription", unite: "jours", min: 1, max: 730, defaut: 30,
    objet: "Terminez « {formation} »", message: "Bonjour {prenom},\n\nVous suivez « {formation} » depuis {jours} jours et vous en êtes à {progression} %. Il reste peu de chemin avant la fin : reprenez dès aujourd'hui." },
};
/* Phrase lisible d'une règle (liste de l'administration). */
function phrase(ev, n) {
  const s = Number(n) > 1 ? "s" : "";
  return ({ inactivite: `Sans activité depuis ${n} jour${s}`, jamais_commence: `Rien commencé ${n} jour${s} après l'inscription`, palier: `A atteint ${n} % de progression`,
    avant_expiration: `Accès qui expire dans ${n} jour${s}`, non_terminee: `Pas terminé ${n} jour${s} après l'inscription` })[ev] || ev;
}
const VARIABLES = ["prenom", "nom", "formation", "progression", "jours", "expiration", "lien", "formateur"];

const nettoyer = s => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\r\n/g, "\n").trim();
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function ms(v) {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const s = String(v);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z").getTime() || 0;
}
const sqlDate = t => new Date(t).toISOString().slice(0, 19).replace("T", " ");
const dateFr = t => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`; };

/* Remplace {variable} ; une variable inconnue est refusée à l'enregistrement (voir lireRegle), ici elle devient vide. */
function rendre(texte, vars) {
  return String(texte || "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k])));
}
function variablesInconnues(texte) {
  const inconnues = new Set();
  String(texte || "").replace(/\{(\w+)\}/g, (_, k) => { if (!VARIABLES.includes(k)) inconnues.add(k); return ""; });
  return [...inconnues];
}

/* ── Qui est concerné par une règle, maintenant ? (ne modifie rien) ── */
const FILTRE_COMPTE = `(u.is_demo IS NULL OR u.is_demo=FALSE) AND u.nom != 'Compte supprimé' AND (u.compte_masque IS NULL OR u.compte_masque=0) AND COALESCE(u.suspendu_definitif,0)=0`;

async function candidats(db, regle, maintenant) {
  const conds = ["i.statut='active'", "COALESCE(i.paiement_statut,'paye')='paye'", "COALESCE(i.relances_off,0)=0", "f.statut='publiee'", "f.owner_user_id=?", "i.user_id<>f.owner_user_id", FILTRE_COMPTE];
  const args = [Number(regle.owner_user_id)];
  if (regle.formation_id) { conds.push("i.formation_id=?"); args.push(Number(regle.formation_id)); }
  if (regle.evenement !== "avant_expiration") conds.push("COALESCE(i.avancement_pct,0)<100");
  const rows = await db.prepare(`SELECT i.id AS inscription_id, i.user_id, i.formation_id, COALESCE(i.avancement_pct,0) AS avancement, i.derniere_activite_le, i.date_inscription,
      f.titre AS formation_titre, u.prenom, u.nom, u.email, u.notif_emails_non_essentiels,
      (SELECT COUNT(*) FROM formation_lecons_progression p WHERE p.inscription_id=i.id AND p.termine=1) AS nb_termine,
      (SELECT MIN(a.date_expiration) FROM formation_acces a WHERE a.user_id=i.user_id AND a.formation_id=i.formation_id AND a.statut='actif' AND a.date_expiration IS NOT NULL AND a.date_expiration>datetime('now')) AS expire_le
    FROM formation_inscriptions i JOIN formations f ON f.id=i.formation_id JOIN users u ON u.id=i.user_id
    WHERE ${conds.join(" AND ")}`).all(...args);
  const n = Number(regle.valeur);
  const sortie = [];
  for (const r of rows) {
    const debut = ms(r.date_inscription) || maintenant;
    const derniere = ms(r.derniere_activite_le) || debut;
    let jours = null, episode = 0, ok = false;
    switch (regle.evenement) {
      case "inactivite": jours = Math.floor((maintenant - derniere) / JOUR); ok = jours >= n; episode = derniere; break;
      case "jamais_commence": jours = Math.floor((maintenant - debut) / JOUR); ok = jours >= n && Number(r.nb_termine) === 0 && r.avancement === 0; break;
      case "palier": ok = r.avancement >= n; break;
      case "non_terminee": jours = Math.floor((maintenant - debut) / JOUR); ok = jours >= n; break;
      case "avant_expiration": { const fin = ms(r.expire_le); if (fin) { jours = Math.max(0, Math.ceil((fin - maintenant) / JOUR)); ok = fin > maintenant && fin - maintenant <= n * JOUR; } break; }
    }
    if (ok) sortie.push({ ...r, jours, debutEpisode: episode });
  }
  return sortie;
}

/* Déjà envoyé / pas encore le moment, d'après le journal de CETTE règle pour cette inscription. */
function peutRelancer(regle, lignes, debutEpisode, maintenant) {
  const dansEpisode = lignes.filter(l => ms(l.envoye_le) >= debutEpisode);
  const rangs = new Set(dansEpisode.map(l => Number(l.rang)));
  if (!rangs.size) return true;
  const repet = Number(regle.repetition_jours) || 0, max = Math.max(1, Number(regle.max_envois) || 1);
  if (!(repet > 0) || rangs.size >= max) return false;
  const dernier = Math.max(...dansEpisode.map(l => ms(l.envoye_le)));
  return maintenant - dernier >= repet * JOUR;
}

async function journalDeLaRegle(db, regleId) {
  const m = new Map();
  for (const l of await db.prepare("SELECT inscription_id, rang, envoye_le, statut, canal FROM formation_relances_journal WHERE regle_id=?").all(Number(regleId))) {
    const k = Number(l.inscription_id);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(l);
  }
  return m;
}

/* Combien de personnes seraient relancées si le cron passait maintenant (aperçu pour le formateur). */
async function concernes(db, regle, maintenant) {
  const liste = await candidats(db, regle, maintenant || Date.now());
  const histo = await journalDeLaRegle(db, regle.id);
  return liste.filter(c => peutRelancer(regle, histo.get(Number(c.inscription_id)) || [], c.debutEpisode, maintenant || Date.now()));
}

function variablesDe(c, formateurNom, origine) {
  return {
    prenom: c.prenom || c.nom || "", nom: c.nom || "", formation: c.formation_titre || "", progression: Math.round(Number(c.avancement) || 0),
    jours: c.jours == null ? "" : c.jours, expiration: c.expire_le ? dateFr(ms(c.expire_le)) : "",
    lien: `${origine}/suivre-formation.html?id=${c.formation_id}`, formateur: formateurNom || "",
  };
}

/* Corps HTML de l'e-mail : le texte du formateur échappé, un bouton, et le lien pour ne plus recevoir de rappels. */
function emailHtml({ message, lien, formation, stop }) {
  const corps = esc(message).replace(/\n{2,}/g, "</p><p style=\"margin:0 0 14px;\">").replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#0B1A33;color:#E3C06E;padding:16px 22px;font-weight:800;letter-spacing:.06em;">DIASPO'ACTIF · FORMATION</div>
    <div style="padding:22px;color:#1e293b;font-size:15px;line-height:1.6;"><p style="margin:0 0 14px;">${corps}</p>
      <p style="margin:22px 0;"><a href="${esc(lien)}" style="background:#E3C06E;color:#1a1202;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:10px;display:inline-block;">Reprendre ma formation</a></p></div>
    <div style="padding:14px 22px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.5;">Vous recevez ce message parce que vous suivez « ${esc(formation)} » sur Diaspo'Actif.
      <a href="${esc(stop)}" style="color:#64748b;">Ne plus recevoir de rappels pour cette formation</a></div></div>`;
}

function lienDesinscription(origine, signAuthToken, inscriptionId, userId) {
  const t = signAuthToken({ k: "relances_off", i: Number(inscriptionId), u: Number(userId), exp: Math.floor(Date.now() / 1000) + 400 * 86400 });
  return `${origine}/api/relances-formation/stop?t=${encodeURIComponent(t)}`;
}

/* ── Exécution : appelée par le cron quotidien, ou pour une seule règle (tests) ── */
async function executer({ db, creerNotif, sendEmail, signAuthToken, origine, maintenant, regleId }) {
  const now = maintenant || Date.now();
  const bilan = { regles: 0, concernes: 0, notifs: 0, emails: 0, echecs: 0, ignores: 0, plafonnes: 0 };
  const regles = await db.prepare(`SELECT r.*, u.prenom AS formateur_prenom, u.nom AS formateur_nom FROM formation_relances_regles r JOIN users u ON u.id=r.owner_user_id
    WHERE r.actif=1 AND COALESCE(r.bloque_admin,0)=0 ${regleId ? "AND r.id=?" : ""} ORDER BY r.id`).all(...(regleId ? [Number(regleId)] : []));
  const aujourdhui = sqlDate(now - (now % JOUR));
  const deJour = new Map();
  for (const l of await db.prepare("SELECT user_id, regle_id, inscription_id, rang FROM formation_relances_journal WHERE envoye_le>=? AND statut<>'echec'").all(aujourdhui)) {
    const k = Number(l.user_id);
    if (!deJour.has(k)) deJour.set(k, new Set());
    deJour.get(k).add(`${l.regle_id}-${l.inscription_id}-${l.rang}`);
  }
  let envois = 0;
  for (const regle of regles) {
    bilan.regles++;
    const liste = await candidats(db, regle, now);
    const histo = await journalDeLaRegle(db, regle.id);
    for (const c of liste) {
      const lignes = histo.get(Number(c.inscription_id)) || [];
      if (!peutRelancer(regle, lignes, c.debutEpisode, now)) continue;
      bilan.concernes++;
      if (envois >= MAX_ENVOIS_PAR_EXECUTION) { bilan.plafonnes++; continue; }
      const deLaPersonne = deJour.get(Number(c.user_id)) || new Set();
      if (deLaPersonne.size >= MAX_RELANCES_PAR_PERSONNE_ET_PAR_JOUR) { bilan.plafonnes++; continue; }
      const rang = lignes.reduce((m, l) => Math.max(m, Number(l.rang) || 0), 0) + 1;
      const vars = variablesDe(c, [regle.formateur_prenom, regle.formateur_nom].filter(Boolean).join(" "), origine);
      const message = rendre(regle.message, vars), objet = rendre(regle.objet || EVENEMENTS[regle.evenement].objet, vars);
      const consigner = async (canal, statut, erreur) => {
        try {
          await db.prepare("INSERT INTO formation_relances_journal (regle_id, libelle, formation_id, inscription_id, user_id, canal, statut, erreur, rang) VALUES (?,?,?,?,?,?,?,?,?)")
            .run(regle.id, regle.nom, c.formation_id, c.inscription_id, c.user_id, canal, statut, erreur || null, rang);
          return true;
        } catch (e) { return false; /* déjà consigné par une exécution simultanée : on n'envoie pas deux fois */ }
      };
      let envoye = false;
      if (Number(regle.canal_notif)) {
        if (await consigner("notif", "envoye")) {
          await creerNotif(c.user_id, "formation_relance", objet.slice(0, 150), message.slice(0, 600), { formation_id: c.formation_id, inscription_id: c.inscription_id, regle_id: regle.id });
          bilan.notifs++; envoye = true;
        }
      }
      if (Number(regle.canal_email)) {
        const prefOff = c.notif_emails_non_essentiels != null && !Number(c.notif_emails_non_essentiels);
        if (prefOff || !c.email) { if (await consigner("email", "ignore", prefOff ? "A désactivé les e-mails non essentiels" : "Aucune adresse e-mail")) bilan.ignores++; }
        else if (await consigner("email", "envoye")) {
          let r;
          try { r = await sendEmail({ to: c.email, subject: objet.slice(0, 150), html: emailHtml({ message, lien: vars.lien, formation: c.formation_titre, stop: lienDesinscription(origine, signAuthToken, c.inscription_id, c.user_id) }) }); }
          catch (e) { r = { ok: false, error: e.message }; }
          if (r && r.ok) { bilan.emails++; envoye = true; }
          else {
            await db.prepare("UPDATE formation_relances_journal SET statut='echec', erreur=? WHERE regle_id=? AND inscription_id=? AND canal='email' AND rang=?")
              .run(String((r && (r.reason || (r.error && (r.error.message || r.error)))) || "Envoi impossible").slice(0, 200), regle.id, c.inscription_id, rang);
            bilan.echecs++;
          }
        }
      }
      if (envoye) { envois++; deLaPersonne.add(`${regle.id}-${c.inscription_id}-${rang}`); deJour.set(Number(c.user_id), deLaPersonne); }
    }
  }
  return bilan;
}

/* Trace d'une relance « de base » (cron de server/index.js) dans le même journal. */
async function journaliserDefaut(db, insc, libelle) {
  try {
    const r = await db.prepare("SELECT COALESCE(MAX(rang),0) AS m FROM formation_relances_journal WHERE regle_id=0 AND inscription_id=?").get(Number(insc.id));
    await db.prepare("INSERT INTO formation_relances_journal (regle_id, libelle, formation_id, inscription_id, user_id, canal, statut, rang) VALUES (0,?,?,?,?,'notif','envoye',?)")
      .run(libelle, Number(insc.formation_id), Number(insc.id), Number(insc.user_id), (Number(r && r.m) || 0) + 1);
  } catch (_) { /* le journal ne doit jamais empêcher une relance */ }
}

module.exports = { EVENEMENTS, VARIABLES, MAX_REGLES_PAR_FORMATEUR, MAX_RELANCES_PAR_PERSONNE_ET_PAR_JOUR, rendre, variablesInconnues, candidats, concernes, peutRelancer, emailHtml, lienDesinscription, executer, journaliserDefaut };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, exigerPremium, creerNotif, getOrigin, signAuthToken, verifyAuthToken } = deps;
  const R = module.exports;
  const estAdmin = u => u && u.role === "administrateur";

  /* Une règle : champs validés. Renvoie { err } ou { v }. */
  async function lireRegle(body, user) {
    const b = body || {};
    const nom = nettoyer(b.nom).slice(0, 80);
    if (!nom) return { err: "Donnez un nom à cette relance." };
    const ev = EVENEMENTS[b.evenement];
    if (!ev) return { err: "Choisissez l'événement qui déclenche la relance." };
    const valeur = Math.floor(Number(b.valeur));
    if (!(valeur >= ev.min && valeur <= ev.max)) return { err: `La valeur doit être comprise entre ${ev.min} et ${ev.max} ${ev.unite}.` };
    const notif = b.canal_notif ? 1 : 0, email = b.canal_email ? 1 : 0;
    if (!notif && !email) return { err: "Choisissez au moins un canal : notification ou e-mail." };
    const message = nettoyer(b.message);
    if (message.length < 5) return { err: "Écrivez le message de la relance." };
    if (message.length > 1500) return { err: "Le message est trop long (1 500 caractères au maximum)." };
    const objet = nettoyer(b.objet).slice(0, 150);
    for (const [champ, t] of [["objet", objet], ["message", message]]) {
      const inc = variablesInconnues(t);
      if (inc.length) return { err: `Variable inconnue dans le ${champ} : {${inc[0]}}. Disponibles : ${VARIABLES.map(x => "{" + x + "}").join(", ")}.` };
    }
    if (email && !objet) return { err: "Un e-mail a besoin d'un objet." };
    const repet = b.repetition_jours === "" || b.repetition_jours == null ? 0 : Math.floor(Number(b.repetition_jours));
    if (!(repet >= 0 && repet <= 365)) return { err: "La répétition doit être comprise entre 0 (une seule fois) et 365 jours." };
    let max = b.max_envois === "" || b.max_envois == null ? 1 : Math.floor(Number(b.max_envois));
    if (!(max >= 1 && max <= 10)) return { err: "Le nombre d'envois maximum doit être compris entre 1 et 10." };
    if (!repet) max = 1;
    let formationId = null;
    if (b.formation_id) {
      const f = await db.prepare("SELECT id, owner_user_id FROM formations WHERE id=?").get(Number(b.formation_id));
      if (!f || (Number(f.owner_user_id) !== Number(user.id) && !estAdmin(user))) return { err: "Formation introuvable parmi les vôtres." };
      formationId = Number(f.id);
    }
    return { v: { nom, evenement: b.evenement, valeur, notif, email, message, objet, repet, max, formationId } };
  }

  async function formateurPremium(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    if (!(await exigerPremium(user, res, "formations"))) return null;
    /* Réservé aux formateurs : un compte qui n'a créé aucune formation n'a personne à relancer. */
    if (!estAdmin(user)) {
      const n = await db.prepare("SELECT COUNT(*) AS n FROM formations WHERE owner_user_id=?").get(user.id);
      if (!Number(n && n.n)) { sendJSON(res, 403, { error: "Les relances sont réservées aux formateurs." }); return null; }
    }
    return user;
  }
  async function maRegle(user, id) {
    return await db.prepare("SELECT * FROM formation_relances_regles WHERE id=? AND owner_user_id=?").get(Number(id), Number(user.id));
  }

  /* ── Mes règles + réglages de base de mes formations ── */
  route("GET", "/api/formateur/relances", async (req, res) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const since = sqlDate(Date.now() - 30 * JOUR);
    const regles = await db.prepare("SELECT * FROM formation_relances_regles WHERE owner_user_id=? ORDER BY id DESC").all(user.id);
    const stats = {};
    for (const s of await db.prepare(`SELECT j.regle_id, j.statut, COUNT(*) AS n FROM formation_relances_journal j JOIN formation_relances_regles r ON r.id=j.regle_id
        WHERE r.owner_user_id=? AND j.envoye_le>=? GROUP BY j.regle_id, j.statut`).all(user.id, since)) {
      const k = Number(s.regle_id); stats[k] = stats[k] || { envoye: 0, echec: 0, ignore: 0 }; stats[k][s.statut] = Number(s.n);
    }
    const formations = await db.prepare("SELECT id, titre, statut, COALESCE(relances_defaut,1) AS relances_defaut FROM formations WHERE owner_user_id=? ORDER BY titre").all(user.id);
    sendJSON(res, 200, {
      regles: regles.map(r => ({ ...r, stats30j: stats[Number(r.id)] || { envoye: 0, echec: 0, ignore: 0 } })), formations: formations.map(f => ({ ...f, relances_defaut: !!Number(f.relances_defaut) })),
      evenements: EVENEMENTS, variables: VARIABLES, max_regles: MAX_REGLES_PAR_FORMATEUR, plafond_jour: MAX_RELANCES_PAR_PERSONNE_ET_PAR_JOUR,
    });
  });

  route("POST", "/api/formateur/relances", async (req, res, params, body) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const nb = await db.prepare("SELECT COUNT(*) AS n FROM formation_relances_regles WHERE owner_user_id=?").get(user.id);
    if (Number(nb && nb.n) >= MAX_REGLES_PAR_FORMATEUR) return sendJSON(res, 400, { error: `Vous avez atteint la limite de ${MAX_REGLES_PAR_FORMATEUR} relances. Supprimez-en une pour en créer une nouvelle.` });
    const { err, v } = await lireRegle(body, user); if (err) return sendJSON(res, 400, { error: err });
    const r = await db.prepare(`INSERT INTO formation_relances_regles (owner_user_id, formation_id, nom, evenement, valeur, canal_notif, canal_email, objet, message, repetition_jours, max_envois) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(user.id, v.formationId, v.nom, v.evenement, v.valeur, v.notif, v.email, v.objet || null, v.message, v.repet, v.max);
    sendJSON(res, 201, { id: Number(r.lastInsertRowid) });
  });

  route("PUT", "/api/formateur/relances/:id", async (req, res, params, body) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const r = await maRegle(user, params.id); if (!r) return sendJSON(res, 404, { error: "Relance introuvable." });
    if (Number(r.bloque_admin)) return sendJSON(res, 403, { error: "Cette relance a été suspendue par l'administration : elle ne peut pas être modifiée." });
    const { err, v } = await lireRegle(body, user); if (err) return sendJSON(res, 400, { error: err });
    await db.prepare(`UPDATE formation_relances_regles SET formation_id=?, nom=?, evenement=?, valeur=?, canal_notif=?, canal_email=?, objet=?, message=?, repetition_jours=?, max_envois=?, updated_at=datetime('now') WHERE id=?`)
      .run(v.formationId, v.nom, v.evenement, v.valeur, v.notif, v.email, v.objet || null, v.message, v.repet, v.max, r.id);
    sendJSON(res, 200, { ok: true });
  });

  route("PATCH", "/api/formateur/relances/:id", async (req, res, params, body) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const r = await maRegle(user, params.id); if (!r) return sendJSON(res, 404, { error: "Relance introuvable." });
    if (Number(r.bloque_admin)) return sendJSON(res, 403, { error: "Cette relance a été suspendue par l'administration." });
    const actif = body && body.actif ? 1 : 0;
    await db.prepare("UPDATE formation_relances_regles SET actif=? WHERE id=?").run(actif, r.id);
    sendJSON(res, 200, { ok: true, actif: !!actif });
  });

  route("DELETE", "/api/formateur/relances/:id", async (req, res, params) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const r = await maRegle(user, params.id); if (!r) return sendJSON(res, 404, { error: "Relance introuvable." });
    await db.prepare("DELETE FROM formation_relances_regles WHERE id=?").run(r.id); /* le journal garde le nom de la règle */
    sendJSON(res, 200, { ok: true });
  });

  /* Qui serait relancé si le cron passait maintenant ? */
  route("GET", "/api/formateur/relances/:id/concernes", async (req, res, params) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const r = await maRegle(user, params.id); if (!r) return sendJSON(res, 404, { error: "Relance introuvable." });
    const liste = await R.concernes(db, r, Date.now());
    sendJSON(res, 200, { nb: liste.length, apercu: liste.slice(0, 20).map(c => ({ nom: [c.prenom, c.nom].filter(Boolean).join(" "), formation: c.formation_titre, progression: Math.round(c.avancement), jours: c.jours })) });
  });

  /* Texte rendu avec des valeurs d'exemple (aperçu avant d'enregistrer) */
  route("POST", "/api/formateur/relances/apercu", async (req, res, params, body) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const exemple = { prenom: "Aminata", nom: "Diallo", formation: "Entrepreneuriat international", progression: 40, jours: 7, expiration: dateFr(Date.now() + 7 * JOUR), lien: `${getOrigin(req)}/suivre-formation.html?id=1`, formateur: [user.prenom, user.nom].filter(Boolean).join(" ") };
    const inc = variablesInconnues((body && body.objet) || "").concat(variablesInconnues((body && body.message) || ""));
    sendJSON(res, 200, { objet: rendre(nettoyer(body && body.objet), exemple), message: rendre(nettoyer(body && body.message), exemple), variables_inconnues: [...new Set(inc)] });
  });

  /* M'envoyer un essai (à moi seul ; non consigné dans le journal) */
  route("POST", "/api/formateur/relances/:id/test", async (req, res, params) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const lim = SEC.rateLimit(`relance-test:${user.id}`, 6, 600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop d'essais. Réessayez dans ${lim.retryAfter}s.` });
    const r = await maRegle(user, params.id); if (!r) return sendJSON(res, 404, { error: "Relance introuvable." });
    const f = r.formation_id ? await db.prepare("SELECT id, titre FROM formations WHERE id=?").get(r.formation_id) : await db.prepare("SELECT id, titre FROM formations WHERE owner_user_id=? ORDER BY id DESC LIMIT 1").get(user.id);
    const origine = getOrigin(req);
    const vars = { prenom: user.prenom || user.nom || "", nom: user.nom || "", formation: f ? f.titre : "Ma formation", progression: 40, jours: Number(r.valeur) || 7, expiration: dateFr(Date.now() + 7 * JOUR),
      lien: f ? `${origine}/suivre-formation.html?id=${f.id}` : `${origine}/formations.html`, formateur: [user.prenom, user.nom].filter(Boolean).join(" ") };
    const message = "[Essai] " + rendre(r.message, vars), objet = "[Essai] " + rendre(r.objet || EVENEMENTS[r.evenement].objet, vars);
    const envoye = [];
    if (Number(r.canal_notif)) { await creerNotif(user.id, "formation_relance", objet.slice(0, 150), message.slice(0, 600), { essai: true }); envoye.push("notification"); }
    if (Number(r.canal_email)) {
      if (!user.email) return sendJSON(res, 400, { error: "Votre compte n'a pas d'adresse e-mail." });
      const e = await require("./mailer").sendEmail({ to: user.email, subject: objet.slice(0, 150), html: emailHtml({ message, lien: vars.lien, formation: vars.formation, stop: `${origine}/formations.html` }) });
      if (e && e.ok) envoye.push("e-mail"); else if (e && e.reason === "no_key") return sendJSON(res, 200, { ok: true, envoye, avertissement: "L'envoi d'e-mails n'est pas configuré sur cette installation." }); else return sendJSON(res, 502, { error: "L'e-mail d'essai n'a pas pu partir. Réessayez plus tard." });
    }
    sendJSON(res, 200, { ok: true, envoye });
  });

  /* Journal des relances de mes formations (règles personnelles ET relances de base) */
  route("GET", "/api/formateur/relances/journal", async (req, res, params, body, query) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const q = query || {};
    const conds = ["f.owner_user_id=?"], args = [user.id];
    if (q.formation_id) { conds.push("j.formation_id=?"); args.push(Number(q.formation_id)); }
    if (q.regle_id !== undefined && q.regle_id !== "") { conds.push("j.regle_id=?"); args.push(Number(q.regle_id)); }
    if (["envoye", "echec", "ignore"].includes(q.statut)) { conds.push("j.statut=?"); args.push(q.statut); }
    const limite = Math.min(200, Math.max(1, Number(q.limite) || 50)), decalage = Math.max(0, Number(q.decalage) || 0);
    const lignes = await db.prepare(`SELECT j.id, j.regle_id, j.libelle, j.canal, j.statut, j.erreur, j.envoye_le, f.titre AS formation, u.prenom, u.nom
      FROM formation_relances_journal j JOIN formations f ON f.id=j.formation_id LEFT JOIN users u ON u.id=j.user_id WHERE ${conds.join(" AND ")} ORDER BY j.id DESC LIMIT ${limite} OFFSET ${decalage}`).all(...args);
    const total = await db.prepare(`SELECT COUNT(*) AS n FROM formation_relances_journal j JOIN formations f ON f.id=j.formation_id WHERE ${conds.join(" AND ")}`).get(...args);
    sendJSON(res, 200, { total: Number(total && total.n) || 0, lignes: lignes.map(l => ({ id: Number(l.id), regle_id: Number(l.regle_id), regle: l.libelle || "—", canal: l.canal, statut: l.statut, erreur: l.erreur || "", date: l.envoye_le, formation: l.formation, apprenant: [l.prenom, l.nom].filter(Boolean).join(" ") || "—" })) });
  });

  /* Couper / rétablir les relances de base d'une formation */
  route("PATCH", "/api/formations/:id/relances-defaut", async (req, res, params, body) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const f = await db.prepare("SELECT id, owner_user_id FROM formations WHERE id=?").get(Number(params.id));
    if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
    if (Number(f.owner_user_id) !== Number(user.id) && !estAdmin(user)) return sendJSON(res, 403, { error: "Interdit." });
    const actif = body && body.actif ? 1 : 0;
    await db.prepare("UPDATE formations SET relances_defaut=? WHERE id=?").run(actif, f.id);
    sendJSON(res, 200, { ok: true, relances_defaut: !!actif });
  });

  /* ── Apprenant : couper / rétablir les rappels d'une formation ── */
  route("GET", "/api/formations/:id/relances/etat", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const i = await db.prepare("SELECT COALESCE(relances_off,0) AS off FROM formation_inscriptions WHERE formation_id=? AND user_id=?").get(Number(params.id), user.id);
    sendJSON(res, 200, { inscrit: !!i, off: !!(i && Number(i.off)) });
  });
  route("POST", "/api/formations/:id/relances/silence", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const i = await db.prepare("SELECT id FROM formation_inscriptions WHERE formation_id=? AND user_id=?").get(Number(params.id), user.id);
    if (!i) return sendJSON(res, 404, { error: "Vous n'êtes pas inscrit à cette formation." });
    const off = body && body.off ? 1 : 0;
    await db.prepare("UPDATE formation_inscriptions SET relances_off=? WHERE id=?").run(off, i.id);
    sendJSON(res, 200, { ok: true, off: !!off });
  });

  /* Lien de l'e-mail : sans connexion, signé, valable plus d'un an. */
  route("GET", "/api/relances-formation/stop", async (req, res, params, body, query) => {
    const lim = SEC.rateLimit(`relance-stop:${SEC.clientIp(req)}`, 30, 600000);
    const page = (titre, txt) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titre)}</title><body style="font-family:Arial,sans-serif;background:#0B1226;color:#E8ECF6;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;"><div style="max-width:440px;padding:28px;text-align:center;"><h1 style="font-size:20px;color:#E3C06E;">${esc(titre)}</h1><p style="line-height:1.6;">${esc(txt)}</p><p><a href="/formations.html" style="color:#E3C06E;">Retour aux formations</a></p></div></body>`); };
    if (!lim.allowed) return page("Trop de demandes", "Réessayez dans quelques minutes.");
    const p = verifyAuthToken(String((query && query.t) || ""));
    if (!p || p.k !== "relances_off" || !p.i || !p.u) return page("Lien invalide", "Ce lien n'est pas valable ou a expiré. Vous pouvez aussi couper les rappels depuis la page de la formation.");
    const r = await db.prepare("UPDATE formation_inscriptions SET relances_off=1 WHERE id=? AND user_id=?").run(Number(p.i), Number(p.u));
    if (!r || !Number(r.changes)) return page("Formation introuvable", "Votre inscription n'a pas été retrouvée.");
    page("C'est noté", "Vous ne recevrez plus de rappels pour cette formation. Vous pouvez les rétablir à tout moment depuis la page de la formation.");
  });

  /* ── Administration : vue d'ensemble et blocage d'une règle abusive ── */
  route("GET", "/api/admin/formations/relances", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!estAdmin(user)) return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
    const since = sqlDate(Date.now() - 30 * JOUR);
    const parStatut = await db.prepare("SELECT canal, statut, COUNT(*) AS n FROM formation_relances_journal WHERE envoye_le>=? GROUP BY canal, statut").all(since);
    const regles = await db.prepare(`SELECT r.id, r.nom, r.evenement, r.valeur, r.canal_notif, r.canal_email, r.actif, COALESCE(r.bloque_admin,0) AS bloque_admin, r.motif_admin, u.nom AS formateur,
        (SELECT COUNT(*) FROM formation_relances_journal j WHERE j.regle_id=r.id AND j.envoye_le>=?) AS envois30j
      FROM formation_relances_regles r LEFT JOIN users u ON u.id=r.owner_user_id ORDER BY envois30j DESC, r.id DESC LIMIT 100`).all(since);
    const parFormateur = await db.prepare(`SELECT u.nom AS formateur, COUNT(*) AS n FROM formation_relances_journal j JOIN formations f ON f.id=j.formation_id LEFT JOIN users u ON u.id=f.owner_user_id WHERE j.envoye_le>=? GROUP BY u.nom ORDER BY n DESC LIMIT 15`).all(since);
    const coupes = await db.prepare("SELECT COUNT(*) AS n FROM formation_inscriptions WHERE COALESCE(relances_off,0)=1").get();
    sendJSON(res, 200, {
      par_statut: parStatut.map(s => ({ canal: s.canal, statut: s.statut, n: Number(s.n) })), par_formateur: parFormateur.map(x => ({ formateur: x.formateur || "—", n: Number(x.n) })),
      regles: regles.map(r => ({ ...r, id: Number(r.id), actif: !!Number(r.actif), bloque_admin: !!Number(r.bloque_admin), envois30j: Number(r.envois30j) || 0, evenement_label: phrase(r.evenement, r.valeur) })),
      apprenants_ayant_coupe: Number(coupes && coupes.n) || 0, plafond_jour: MAX_RELANCES_PAR_PERSONNE_ET_PAR_JOUR,
    });
  });
  route("PATCH", "/api/admin/formations/relances/:id", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!estAdmin(user)) return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
    const r = await db.prepare("SELECT id FROM formation_relances_regles WHERE id=?").get(Number(params.id));
    if (!r) return sendJSON(res, 404, { error: "Relance introuvable." });
    const bloque = body && body.bloque ? 1 : 0;
    const motif = bloque ? (nettoyer(body && body.motif).slice(0, 300) || "Suspendue par l'administration") : null;
    await db.prepare("UPDATE formation_relances_regles SET bloque_admin=?, motif_admin=? WHERE id=?").run(bloque, motif, r.id);
    sendJSON(res, 200, { ok: true, bloque: !!bloque });
  });
};
