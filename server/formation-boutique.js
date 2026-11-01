/* ═════════════════════════════════════════════════
   server/formation-boutique.js — Formation Diaspora : « Vendre cette formation sur ma boutique » (2026-11-01)

   - formations.en_boutique (0 par défaut) : interrupteur du propriétaire. Aucune formation n'apparaît en boutique sans qu'il l'ait demandé.
   - La boutique d'une initiative affiche une BANDE « Formations créées par <nom de l'initiative> » : elle LIT les formations
     (pas de copie dans produits_vitrine) → prix, titre, couverture et statut y sont toujours à jour, et la limite de produits ne s'applique pas.
   - Le clic mène à la fiche de la formation : l'achat, les codes de promotion, les tarifs membres et l'accès automatique sont ceux du catalogue.
   - Seul le compte propriétaire (ou l'administration) peut activer l'interrupteur, et seulement pour une formation publiée, ouverte à tous.
     Le désactiver est toujours possible. Si la formation cesse d'être publiée, elle disparaît de la bande sans toucher à l'interrupteur.
   ═════════════════════════════════════════════════ */
"use strict";

const Catalogue = require("./formation-catalogue");

/* Une formation est vendable en boutique si elle est publiée et ouverte à tous (pas réservée à une liste de personnes). */
const publiee = f => String(f.statut || "publiee") === "publiee";
const ouverteATous = f => !f.acces_type || f.acces_type === "public";

/* La vitrine (et donc sa boutique) n'est visible du public que si elle est active ; sinon seul son propriétaire et l'administration la voient
   (même règle que GET /api/initiatives/:id/produits). */
async function initiativeDuCompte(db, ownerId) {
  return (await db.prepare("SELECT id, nom, vitrine_active, owner_user_id FROM initiatives WHERE owner_user_id=? ORDER BY id ASC LIMIT 1").get(Number(ownerId))) || null;
}

/* Les formations de la bande, déjà enrichies pour dessiner les cartes. `proprietaire` : même visibilité que le public, rien de plus. */
async function formationsDeLaBande(db, ownerId) {
  const lignes = await db.prepare(`
    SELECT f.*, u.nom AS auteur_nom
    FROM formations f LEFT JOIN users u ON u.id = f.owner_user_id
    WHERE f.owner_user_id = ? AND COALESCE(f.en_boutique, 0) = 1
      AND COALESCE(f.statut, 'publiee') = 'publiee'
      AND (f.acces_type IS NULL OR f.acces_type = 'public')
    ORDER BY f.created_at DESC, f.id DESC`).all(Number(ownerId));
  const enrichies = await Catalogue.enrichir(db, lignes);
  return enrichies.map(f => ({
    id: Number(f.id),
    titre: f.titre,
    sous_titre: f.sous_titre || "",
    image_url: f.image_url || f.banniere_url || f.logo_url || "",
    type_formation: f.type_formation || "",
    domaine: f.domaine || "",
    duree: f.duree || "",
    niveau: f.niveau || "",
    devise: f.devise || "EUR",
    gratuit: (f.mode_acces === "gratuit" || Number(f.gratuit) === 1 || Number(f.prix_final) <= 0) ? 1 : 0,
    prix_catalogue: f.prix_catalogue,
    prix_final: f.prix_final,
    promo_pct: f.promo_pct,
    nb_inscrits: f.nb_inscrits,
    nb_modules: f.nb_modules,
    note_moyenne: f.note_moyenne,
    nb_avis: f.nb_avis,
    mentions_membres: f.mentions_membres || [],
    auteur: f.formateur_affiche || f.organisme || ""
  }));
}

module.exports = { formationsDeLaBande, publiee, ouverteATous, initiativeDuCompte };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser } = deps;

  /* PUBLIC — la bande d'une boutique. Toujours le nom du compte propriétaire dans le titre (jamais un nom saisi à la main). */
  route("GET", "/api/initiatives/:id/formations-boutique", async (req, res, params) => {
    const init = await db.prepare("SELECT id, nom, vitrine_active, owner_user_id FROM initiatives WHERE id=?").get(params.id);
    if (!init) return sendJSON(res, 404, { error: "Boutique introuvable." });
    const me = await getCurrentUser(req);
    const proprietaire = !!me && Number(me.id) === Number(init.owner_user_id);
    const admin = !!me && me.role === "administrateur";
    if (Number(init.vitrine_active) !== 1 && !proprietaire && !admin) return sendJSON(res, 200, { formations: [], titre: "", nom: init.nom });
    const nom = init.nom; /* le nom de l'initiative dont on regarde la boutique, jamais celui de la personne qui la gère */
    const formations = await formationsDeLaBande(db, init.owner_user_id);
    sendJSON(res, 200, { nom, titre: formations.length ? `Formations créées par ${nom}` : "", formations });
  });

  /* PROPRIÉTAIRE — activer / désactiver « Vendre sur ma boutique ». */
  route("PUT", "/api/formations/:id/boutique", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const f = await db.prepare("SELECT id, titre, owner_user_id, statut, acces_type, en_boutique FROM formations WHERE id=?").get(params.id);
    if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
    if (Number(f.owner_user_id) !== Number(user.id) && user.role !== "administrateur") return sendJSON(res, 403, { error: "Seul le compte propriétaire de la formation peut la proposer en boutique." });
    const actif = body && (body.actif === true || body.actif === 1 || body.actif === "1" || body.actif === "true");
    const init = await initiativeDuCompte(db, f.owner_user_id);
    if (actif) {
      if (!init) return sendJSON(res, 400, { error: "Seuls les comptes Initiative ont une boutique : cette formation ne peut pas y être proposée." });
      if (!publiee(f)) return sendJSON(res, 400, { error: "Publiez d’abord la formation : seule une formation publiée peut être vendue en boutique." });
      if (!ouverteATous(f)) return sendJSON(res, 400, { error: "Cette formation est réservée à une liste de personnes : elle ne peut pas être affichée au public dans la boutique." });
    }
    await db.prepare("UPDATE formations SET en_boutique=? WHERE id=?").run(actif ? 1 : 0, params.id);
    sendJSON(res, 200, { ok: true, en_boutique: actif ? 1 : 0, boutique_visible: !!init && Number(init.vitrine_active) === 1 });
  });
};
