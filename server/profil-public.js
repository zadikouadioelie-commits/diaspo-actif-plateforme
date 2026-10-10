/* ══════════════════════════════════════════════════════════════════════════
   server/profil-public.js — Liste de contrôle du profil public (2026-10-10, demande explicite)

   « Une liste de tous les éléments qui doivent être sur le profil public, cochés automatiquement quand ils sont
   remplis, avec un bouton pour aller les remplir : à tout moment on sait ce qui manque. »

   SOURCE UNIQUE de « qu'est-ce qu'un profil public rempli » :
   · la liste de contrôle affichée aux membres (GET /api/profil-public/checklist, assets/profil-checklist.js) ;
   · le critère « Profil public rempli » de l'indice de fiabilité (computeTrustScore) — mêmes éléments, même
     pourcentage : ce que le membre lit dans la liste est exactement ce qui compte dans son score.
   Les éléments « essentiels » viennent de server/profil-obligatoire.js (ceux dont l'obligation d'inscription dépend,
   avec leurs liens directs vers le bon formulaire) ; pour un compte utilisateur, la liste est complétée par les
   éléments du système de complétude (server/completude.js) qui n'y figuraient pas.
   ══════════════════════════════════════════════════════════════════════════ */
const ProfilObligatoire = require("./profil-obligatoire");
const Completude = require("./completude");

const ROLES = ["utilisateur", "initiative", "collectivite"];
const majuscule = s => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const rempli = v => Completude.champRempli(v);

/* Ordre d'affichage d'un compte utilisateur : l'identité d'abord, puis le parcours, puis le reste. */
const ORDRE_UTILISATEUR = ["photo", "bio", "titre_pro", "competences", "residence", "origine", "domaine",
  "experiences", "centres_interet", "publics_json", "besoins_json", "realisations_json", "services_perso", "reseaux_json", "annee_debut"];
/* Ce que chaque élément « de complément » demande, en une phrase (aide affichée sous le libellé). */
const AIDE = {
  photo: "Une photo de vous, ou le logo de la structure : on se fie davantage à un profil qui a un visage.",
  bio: "Quelques phrases pour vous présenter.", titre_pro: "Votre métier ou votre fonction, en quelques mots.",
  competences: "Au moins quelques compétences, pour être trouvé par les bonnes personnes.",
  residence: "Votre ville et votre pays de résidence.", origine: "Votre pays d'origine.", domaine: "Votre domaine d'activité principal.",
  experiences: "Vos expériences professionnelles ou bénévoles.", centres_interet: "Vos centres d'intérêt.",
  publics_json: "Les publics que vous visez ou que vous accompagnez.", besoins_json: "Ce que vous recherchez (partenaires, financement, compétences…).",
  realisations_json: "Ce que vous avez déjà réalisé.", services_perso: "Les services que vous proposez.",
  reseaux_json: "Vos pages LinkedIn, Facebook, site web…", annee_debut: "L'année où vous avez commencé votre activité.",
  description: "Ce que fait la structure, en quelques phrases.", mission: "Sa mission, sa raison d'être.", historique: "Son histoire.",
  logo_url: "Le logo de la structure.", site_web: "Son site internet.", adresse: "Son adresse.", vitrine_horaires: "Ses horaires d'ouverture.",
  vitrine_services: "Ses services ou son offre.", galerie_json: "Quelques photos de la structure ou de ses actions.",
  reseaux_sociaux: "Ses pages sur les réseaux sociaux.", annee_creation: "Son année de création.",
};

/* Liste de contrôle pour un compte. Renvoie null si le type de compte n'a pas de profil public à remplir. */
async function liste(db, user) {
  if (!user || !ROLES.includes(user.role)) return null;
  const p = await ProfilObligatoire.points(db, user);
  if (!p) return null;
  let items = p.items.map(i => ({ cle: i.cle, libelle: i.libelle, ok: !!i.ok, lien: i.lien, groupe: "essentiel" }));

  if (user.role === "utilisateur") {
    const ligne = await db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
    const dejaCouverts = new Set(["photo_url", "bio", "competences"]);
    for (const c of Completude.CRITERES.utilisateur) {
      if (c.cles.some(k => dejaCouverts.has(k))) continue;
      items.push({
        cle: c.cles[0], libelle: majuscule(c.label), ok: c.cles.some(k => rempli(ligne[k])), groupe: "complement",
        lien: `profil.html?completer=champ&champ=${encodeURIComponent(c.cles[0])}&label=${encodeURIComponent(c.label)}`,
      });
    }
    const rang = k => { const i = ORDRE_UTILISATEUR.indexOf(k); return i < 0 ? 99 : i; };
    items.sort((a, b) => rang(a.cle) - rang(b.cle));
  }
  items = items.map(i => ({ ...i, aide: AIDE[i.cle] || "" }));

  const total = items.length, remplis = items.filter(i => i.ok).length;
  const ess = items.filter(i => i.groupe === "essentiel");
  return {
    role: user.role, items, total, remplis, manquants: total - remplis,
    pct: total ? Math.round((remplis / total) * 100) : 100,
    seuil: p.seuil,
    essentiels: { total: ess.length, remplis: ess.filter(i => i.ok).length },
  };
}

module.exports = { liste };
module.exports.register = function register({ route, db, sendJSON, getCurrentUser }) {
  route("GET", "/api/profil-public/checklist", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const l = await liste(db, user);
    if (!l) return sendJSON(res, 200, { applicable: false });
    sendJSON(res, 200, { applicable: true, ...l });
  });
};
