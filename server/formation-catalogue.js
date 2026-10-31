/* ═════════════════════════════════════════════════
   server/formation-catalogue.js — Formation Diaspora, lot E : CATALOGUE (2026-10-30)

   - Catégories modifiables par l'administration (table formation_categories). Le domaine d'une formation reste un TEXTE (formations.domaine) :
     renommer une catégorie réécrit ce texte sur les formations et les besoins ; la désactiver la retire de la liste de choix sans toucher
     aux formations qui l'utilisent ; la supprimer n'est possible que si plus rien ne s'en sert.
   - Enrichissement du catalogue public : nombre de modules / leçons / inscrits, prix catalogue, prix promotionnel, formateur affiché,
     mention « Populaire » (calculée, jamais saisie).
   ═════════════════════════════════════════════════ */
"use strict";

const Finances = require("./formation-finances");
const Regles = require("./formation-regles-membres");

/* Catégories d'origine (celles que proposait le formulaire du constructeur) — semées une seule fois, ensuite l'administration décide. */
const CATEGORIES_DEFAUT = [
  ["Action Sociale", "🤝"], ["Agriculture", "🌱"], ["Santé", "🩺"], ["Éducation", "🎓"], ["Technologie", "💻"],
  ["Culture", "🎭"], ["Économie", "📈"], ["Finance", "💶"], ["Droit", "⚖️"], ["Environnement", "🌍"]
];
const NOM_MAX = 60;
const POPULAIRE_MIN_INSCRITS = 3; /* en dessous, personne n'est « populaire » */
const POPULAIRE_RANG_MAX = 3;     /* les trois formations les plus suivies, à condition d'atteindre le minimum */

const nettoyerNom = s => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, NOM_MAX);
/* Une icône = un ou deux symboles (émoji) : on garde les 8 premiers caractères visibles, sans balisage. */
const nettoyerIcone = s => Array.from(String(s == null ? "" : s).replace(/[\u0000-\u001f<>&"']/g, "").trim()).slice(0, 4).join("");
const cle = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

let semees = false;
/* Sème les catégories d'origine si la table est vide (appel paresseux : fonctionne pareil en SQLite et en Postgres). */
async function assurerCategories(db) {
  if (semees) return;
  const n = (await db.prepare("SELECT COUNT(*) AS n FROM formation_categories").get())?.n || 0;
  if (!Number(n)) {
    let ordre = 1;
    for (const [nom, icone] of CATEGORIES_DEFAUT) {
      try { await db.prepare("INSERT INTO formation_categories (nom, icone, ordre, actif) VALUES (?,?,?,1)").run(nom, icone, ordre++); } catch (_) { /* déjà semée par un autre appel */ }
    }
  }
  semees = true;
}

async function lireCategories(db, { tout = false } = {}) {
  await assurerCategories(db);
  const lignes = await db.prepare(`
    SELECT c.id, c.nom, c.icone, c.ordre, c.actif,
      (SELECT COUNT(*) FROM formations f WHERE f.domaine = c.nom) AS nb_formations,
      (SELECT COUNT(*) FROM formations f WHERE f.domaine = c.nom AND COALESCE(f.statut,'publiee')='publiee') AS nb_publiees
    FROM formation_categories c
    ${tout ? "" : "WHERE c.actif = 1"}
    ORDER BY c.ordre ASC, c.id ASC`).all();
  return lignes.map(l => ({ ...l, actif: Number(l.actif) ? 1 : 0, nb_formations: Number(l.nb_formations) || 0, nb_publiees: Number(l.nb_publiees) || 0 }));
}

/* Le domaine envoyé par un formateur est accepté s'il est vide, s'il désigne une catégorie active, ou s'il est celui que la formation a déjà
   (une catégorie désactivée plus tard ne bloque pas la modification d'une formation qui l'utilise). */
async function domaineAccepte(db, domaine, actuel) {
  const d = nettoyerNom(domaine);
  if (!d) return true;
  if (actuel && cle(actuel) === cle(d)) return true;
  const liste = await lireCategories(db);
  return liste.some(c => cle(c.nom) === cle(d));
}

/* ── Auteur d'une formation (décision du 2026-10-31) ──
   L'auteur affiché est TOUJOURS le compte propriétaire : le nom de la structure pour une initiative, une collectivité ou l'administration,
   « prénom nom » pour un particulier. Jamais le nom de la personne qui gère le compte d'une initiative, et jamais un nom saisi à la main :
   sinon n'importe qui pourrait publier une formation au nom d'un autre. Même règle que nomCompteAffichage() de server/index.js. */
function nomDeCompte(u, nomInitiative) {
  if (!u) return "";
  if (u.role === "initiative" && nomInitiative) return nomInitiative;
  if ((u.role === "collectivite" || u.role === "administrateur") && u.nom_institution) return u.nom_institution;
  return [u.prenom, u.nom].filter(Boolean).join(" ") || u.nom || "";
}
async function nomsAuteurs(db, ownerIds) {
  const ids = [...new Set((ownerIds || []).map(Number).filter(n => Number.isFinite(n) && n > 0))];
  const noms = new Map();
  if (!ids.length) return noms;
  const marques = ids.map(() => "?").join(",");
  const users = await db.prepare(`SELECT id, nom, prenom, role, nom_institution FROM users WHERE id IN (${marques})`).all(...ids);
  const inits = new Map((await db.prepare(`SELECT owner_user_id, nom FROM initiatives WHERE owner_user_id IN (${marques})`).all(...ids)).map(i => [Number(i.owner_user_id), i.nom]));
  for (const u of users) noms.set(Number(u.id), nomDeCompte(u, inits.get(Number(u.id))));
  return noms;
}
async function nomAuteur(db, ownerId) { return (await nomsAuteurs(db, [ownerId])).get(Number(ownerId)) || ""; }
/* Remplace, sur une ligne de formation, tous les champs qui désignent « qui l'a faite » par le nom du compte propriétaire. */
function imposerAuteur(row, nom) {
  if (!row || !nom) return row;
  return { ...row, auteur_nom: nom, organisme: nom, formateur_nom: nom, formateur_organisation: nom, formateur_affiche: nom };
}

/* Ajoute à chaque formation du catalogue ce que la carte affiche (une seule requête groupée par information). */
async function enrichir(db, rows) {
  if (!rows.length) return rows;
  const ids = rows.map(r => Number(r.id)).filter(Number.isFinite);
  const marques = ids.map(() => "?").join(",");
  const parId = (lignes, champ) => { const m = new Map(); for (const l of lignes) m.set(Number(l.formation_id), Number(l[champ]) || 0); return m; };
  const modules = parId(await db.prepare(`SELECT formation_id, COUNT(*) AS n FROM formation_modules WHERE formation_id IN (${marques}) GROUP BY formation_id`).all(...ids), "n");
  const lecons = parId(await db.prepare(`SELECT m.formation_id AS formation_id, COUNT(*) AS n FROM formation_lecons l JOIN formation_modules m ON m.id=l.module_id WHERE m.formation_id IN (${marques}) GROUP BY m.formation_id`).all(...ids), "n");
  const inscrits = parId(await db.prepare(`SELECT formation_id, COUNT(*) AS n FROM formation_inscriptions WHERE formation_id IN (${marques}) AND statut='active' GROUP BY formation_id`).all(...ids), "n");
  const notes = new Map();
  for (const l of await db.prepare(`SELECT formation_id, AVG(note) AS moy, COUNT(*) AS n FROM formation_avis WHERE formation_id IN (${marques}) GROUP BY formation_id`).all(...ids)) {
    notes.set(Number(l.formation_id), { moy: Math.round((Number(l.moy) || 0) * 10) / 10, n: Number(l.n) || 0 });
  }
  const classement = [...inscrits.entries()].filter(([, n]) => n >= POPULAIRE_MIN_INSCRITS).sort((a, b) => b[1] - a[1]).slice(0, POPULAIRE_RANG_MAX).map(([id]) => id);
  const auteurs = await nomsAuteurs(db, rows.map(r => r.owner_user_id));
  const mentions = await Regles.mentionsPourFormations(db, rows);
  return rows.map(r => {
    const id = Number(r.id);
    const p = Finances.prixFormation(r);
    const note = notes.get(id);
    return {
      ...r,
      nb_modules: modules.get(id) || 0, nb_lecons: lecons.get(id) || 0, nb_inscrits: inscrits.get(id) || 0,
      prix_catalogue: p.catalogue, promo_pct: p.promo_pct, prix_final: p.prix,
      ...imposerAuteur({}, auteurs.get(Number(r.owner_user_id)) || r.auteur_nom || r.organisme || ""),
      populaire: classement.includes(id) ? 1 : 0,
      mentions_membres: mentions.get(id) || [],
      note_moyenne: note ? note.moy : null, nb_avis: note ? note.n : 0
    };
  });
}

module.exports = { nomDeCompte, nomsAuteurs, nomAuteur, imposerAuteur, CATEGORIES_DEFAUT, assurerCategories, lireCategories, domaineAccepte, enrichir, nettoyerNom, nettoyerIcone };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser } = deps;
  const exigerAdmin = async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    if (user.role !== "administrateur") { sendJSON(res, 403, { error: "Réservé aux administrateurs." }); return null; }
    return user;
  };

  /* Liste publique : catégories actives, dans l'ordre choisi par l'administration. */
  route("GET", "/api/formation-categories", async (req, res) => {
    sendJSON(res, 200, { categories: await lireCategories(db) });
  });

  /* Administration : toutes les catégories, actives ou non. */
  route("GET", "/api/admin/formation-categories", async (req, res) => {
    if (!await exigerAdmin(req, res)) return;
    sendJSON(res, 200, { categories: await lireCategories(db, { tout: true }) });
  });

  route("POST", "/api/admin/formation-categories", async (req, res, params, body) => {
    if (!await exigerAdmin(req, res)) return;
    await assurerCategories(db);
    const nom = nettoyerNom(body?.nom);
    if (nom.length < 2) return sendJSON(res, 400, { error: "Le nom de la catégorie doit contenir au moins 2 caractères." });
    const existantes = await db.prepare("SELECT id, nom FROM formation_categories").all();
    if (existantes.some(c => cle(c.nom) === cle(nom))) return sendJSON(res, 409, { error: "Une catégorie porte déjà ce nom." });
    const max = (await db.prepare("SELECT COALESCE(MAX(ordre),0) AS m FROM formation_categories").get())?.m || 0;
    await db.prepare("INSERT INTO formation_categories (nom, icone, ordre, actif) VALUES (?,?,?,1)").run(nom, nettoyerIcone(body?.icone) || "📚", Number(max) + 1);
    sendJSON(res, 201, { categories: await lireCategories(db, { tout: true }) });
  });

  /* Renommer, changer l'icône, activer / désactiver. Le renommage suit les formations et les besoins qui portaient l'ancien nom. */
  route("PATCH", "/api/admin/formation-categories/:id", async (req, res, params, body) => {
    if (!await exigerAdmin(req, res)) return;
    const c = await db.prepare("SELECT * FROM formation_categories WHERE id=?").get(Number(params.id));
    if (!c) return sendJSON(res, 404, { error: "Catégorie introuvable." });
    let nom = c.nom;
    if (body && body.nom !== undefined) {
      nom = nettoyerNom(body.nom);
      if (nom.length < 2) return sendJSON(res, 400, { error: "Le nom de la catégorie doit contenir au moins 2 caractères." });
      const autres = await db.prepare("SELECT id, nom FROM formation_categories WHERE id<>?").all(c.id);
      if (autres.some(a => cle(a.nom) === cle(nom))) return sendJSON(res, 409, { error: "Une catégorie porte déjà ce nom." });
    }
    const icone = body && body.icone !== undefined ? (nettoyerIcone(body.icone) || c.icone || "📚") : c.icone;
    const actif = body && body.actif !== undefined ? (body.actif ? 1 : 0) : (Number(c.actif) ? 1 : 0);
    await db.prepare("UPDATE formation_categories SET nom=?, icone=?, actif=? WHERE id=?").run(nom, icone, actif, c.id);
    if (nom !== c.nom) {
      await db.prepare("UPDATE formations SET domaine=? WHERE domaine=?").run(nom, c.nom);
      try { await db.prepare("UPDATE formation_besoins SET domaine=? WHERE domaine=?").run(nom, c.nom); } catch (_) { /* table des besoins absente : rien à suivre */ }
    }
    sendJSON(res, 200, { categories: await lireCategories(db, { tout: true }) });
  });

  /* Nouvel ordre d'affichage : { ids: [3,1,2,…] } — toute catégorie omise passe après celles qui sont citées, dans son ordre actuel. */
  route("PUT", "/api/admin/formation-categories/ordre", async (req, res, params, body) => {
    if (!await exigerAdmin(req, res)) return;
    await assurerCategories(db);
    const demandes = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
    const toutes = await db.prepare("SELECT id FROM formation_categories ORDER BY ordre ASC, id ASC").all();
    const connues = new Set(toutes.map(t => Number(t.id)));
    const suite = [];
    const vues = new Set();
    for (const id of demandes) if (connues.has(id) && !vues.has(id)) { vues.add(id); suite.push(id); }
    for (const t of toutes) if (!vues.has(Number(t.id))) suite.push(Number(t.id));
    let ordre = 1;
    for (const id of suite) await db.prepare("UPDATE formation_categories SET ordre=? WHERE id=?").run(ordre++, id);
    sendJSON(res, 200, { categories: await lireCategories(db, { tout: true }) });
  });

  /* Suppression : refusée tant qu'une formation s'en sert (on propose de la désactiver). */
  route("DELETE", "/api/admin/formation-categories/:id", async (req, res, params) => {
    if (!await exigerAdmin(req, res)) return;
    const c = await db.prepare("SELECT * FROM formation_categories WHERE id=?").get(Number(params.id));
    if (!c) return sendJSON(res, 404, { error: "Catégorie introuvable." });
    const n = (await db.prepare("SELECT COUNT(*) AS n FROM formations WHERE domaine=?").get(c.nom))?.n || 0;
    if (Number(n) > 0) return sendJSON(res, 409, { error: `${n} formation(s) utilisent encore cette catégorie : désactivez-la plutôt que de la supprimer.`, nb_formations: Number(n) });
    await db.prepare("DELETE FROM formation_categories WHERE id=?").run(c.id);
    sendJSON(res, 200, { categories: await lireCategories(db, { tout: true }) });
  });
};
