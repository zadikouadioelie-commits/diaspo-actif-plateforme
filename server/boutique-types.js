/* ===========================================================
   server/boutique-types.js — Lot B (2026-11-11) : les 6 types de boutique sur la VRAIE plateforme
   ===========================================================
   Source unique des types : assets/boutique-types.js (registre de la session « atelier »). Ce fichier n'en
   recopie ni libellé ni nombre : il ajoute seulement ce que la plateforme réelle exige en plus :
     - la correspondance des ANCIENS types (clés écrites en base) vers les 6 types ;
     - la liste des types que les vraies boutiques peuvent choisir aujourd'hui (ceux qui ont une page publique) ;
     - les modèles de modules des types NOUVEAUX (ecom, events, impact, finance), construits à partir des anciens ;
     - l'interrupteur de mise en service (paramètre de plateforme `boutique_types_v2_actif`, désactivé par défaut :
       tant que l'administrateur ne l'active pas, la plateforme se comporte exactement comme avant).
   Rien n'est supprimé : les anciens types restent lisibles (lot I = nettoyage, sur validation écrite).
   Lancer les tests : node --test tests/boutique-types-v2.test.js
   =========================================================== */
'use strict';

const REGISTRE = require('../assets/boutique-types.js');
const EVENTS = require('./boutique-events'); /* lot E1 : modèle de modules du type « events » */

/* Anciennes clés (colonne initiatives.vitrine_type) → clé du registre. Décision de l'utilisateur du 2026-11-11. */
const ANCIEN_VERS_NOUVEAU = Object.freeze({
  commercial: 'ecom',
  portfolio: 'portfolio',
  video: 'video',
  evenement: 'events',
  projet: 'impact',
});

/* Anciens types sans équivalent : conservés tels quels, non sélectionnables (« ancien type conservé »). */
const ANCIENS_SANS_EQUIVALENT = Object.freeze(['blog', 'createur', 'formation']);

/* Types NOUVEAUX : aucune boutique existante n'a ces clés avant la mise en service. */
const CLES_NOUVELLES = Object.freeze(['ecom', 'events', 'impact', 'finance']);

/* Types qui ont une page publique DÉDIÉE (profil-app.html : ecom → boutique.html, portfolio → portfolio.html,
   video → boutique-video.html). Les autres types s'affichent avec la présentation générale en attendant leur page (lot E). */
const PAGES_DEDIEES = Object.freeze(['ecom', 'video', 'portfolio']);

/* Types qu'une vraie boutique peut choisir aujourd'hui. « Créateur d'événements » est ouvert comme les autres types
   (décision de l'utilisateur, 2026-11-11) ; impact / finance : uniquement les administrateurs (Atelier) jusqu'à leur lot. */
const SELECTIONNABLES_PUBLIC = Object.freeze(['ecom', 'video', 'portfolio', 'events']);

/* Type nouveau → type ancien dont on reprend les modules. */
const MODELE_ANCIEN = Object.freeze({ ecom: 'commercial', events: 'evenement', impact: 'projet' });

/* « Organismes de financement » : aucun ancien modèle. Programmes → services, projets accompagnés → réalisations,
   rendez-vous → réservation. AUCUN module de dépôt de projet (lot F : un seul module, « Soumettre à Diaspo'Actif »). */
const MODULES_FINANCE = Object.freeze({
  actifs: ['a_propos', 'services', 'realisations', 'resultats_impact', 'equipe', 'partenaires', 'documents',
    'reservation', 'evenements', 'contact', 'temoignages', 'actualites'],
  optionnels: ['certifications', 'galerie_photos', 'demande_partenariat'],
});

const CLE_INTERRUPTEUR = 'boutique_types_v2_actif';

/** Clé du registre (6 types) pour n'importe quelle clé connue ; null si aucun équivalent. */
function typeCanonique(cle) {
  const c = String(cle || '');
  if (REGISTRE.TYPES[c]) return c;
  return ANCIEN_VERS_NOUVEAU[c] || null;
}

/** true pour un ancien type conservé tel quel (blog, créateur, formation). */
function estAncienSansEquivalent(cle) {
  return ANCIENS_SANS_EQUIVALENT.includes(String(cle || ''));
}

/** Types que ce compte peut choisir (administrateur : les 6 ; sinon : ceux qui ont une page publique). */
function typesSelectionnables({ estAdministrateur = false } = {}) {
  const tous = Object.keys(REGISTRE.TYPES);
  return estAdministrateur ? tous : tous.filter((c) => SELECTIONNABLES_PUBLIC.includes(c));
}

/** Ajoute à VITRINE_TEMPLATES les modèles des types nouveaux (sans toucher aux anciens) ; renvoie les clés ajoutées.
    `modulesRegistry` : VITRINE_MODULES_REGISTRY — un module inconnu est écarté plutôt que de casser une boutique. */
function ajouterTemplatesV2(templates, modulesRegistry) {
  const connus = (liste) => (liste || []).filter((m) => modulesRegistry[m]);
  const ajoutes = [];
  for (const cle of CLES_NOUVELLES) {
    if (templates[cle]) continue;
    const t = REGISTRE.TYPES[cle];
    const base = cle === 'finance' ? MODULES_FINANCE : cle === 'events' ? EVENTS.MODULES_EVENTS : (templates[MODELE_ANCIEN[cle]] || { actifs: [], optionnels: [] });
    templates[cle] = { label: t.label, pour: t.who, actifs: connus(base.actifs), optionnels: connus(base.optionnels), v2: true };
    ajoutes.push(cle);
  }
  /* Les types qui gardent leur clé reprennent le libellé du registre (sans émoticône) pour le nouvel écran. */
  for (const cle of ['video', 'portfolio']) if (templates[cle]) templates[cle].label_v2 = REGISTRE.TYPES[cle].label;
  return ajoutes;
}

/** Contrôle côté SERVEUR des options d'une boutique (dossier 05 §3, lot B4) : au plus MAX_OPTIONS (= types − 1, calculé par le
    registre) options distinctes, jusqu'à MAX_COPIES copies chacune, jamais le type principal. Le Bonus n'est PAS une option :
    il ne figure pas ici et ne compte donc pas dans la limite. Renvoie { options } normalisées ou { erreur }. */
function validerOptions(options, typePrincipal, { estAdministrateur = false } = {}) {
  if (!Array.isArray(options)) return { erreur: 'Les options doivent être une liste.' };
  const principal = typeCanonique(typePrincipal);
  if (!principal) return { erreur: 'Choisissez d\'abord un type principal parmi les types proposés.' };
  const permis = new Set(typesSelectionnables({ estAdministrateur }));
  const vus = new Set();
  const propres = [];
  for (const brut of options) {
    const type = typeCanonique(brut && typeof brut === 'object' ? brut.type : brut);
    if (!type) return { erreur: 'Type d\'option inconnu.' };
    if (type === principal) return { erreur: 'Le type principal ne peut pas être aussi une option.' };
    if (!permis.has(type)) return { erreur: 'Ce type ne peut pas être ajouté en option pour le moment.' };
    if (vus.has(type)) return { erreur: 'Une même option ne figure qu\'une fois : utilisez le nombre de copies.' };
    const copies = brut && typeof brut === 'object' && brut.copies !== undefined ? Number(brut.copies) : 1;
    if (!Number.isInteger(copies) || copies < 1) return { erreur: 'Nombre de copies invalide.' };
    if (copies > REGISTRE.MAX_COPIES) return { erreur: 'Une option peut avoir au plus ' + REGISTRE.MAX_COPIES + ' copies.' };
    vus.add(type);
    propres.push({ type, copies });
  }
  if (propres.length > REGISTRE.MAX_OPTIONS) return { erreur: 'Une boutique a au plus ' + REGISTRE.MAX_OPTIONS + ' options (nombre de types moins un).' };
  return { options: propres };
}

/** Description des types pour l'interface (un seul appel) : tout vient du registre, rien n'est écrit à la main. */
function descriptionPourInterface({ actif, estAdministrateur }) {
  const selectionnables = new Set(typesSelectionnables({ estAdministrateur }));
  return {
    actif: !!actif,
    max_options: REGISTRE.MAX_OPTIONS,
    max_copies: REGISTRE.MAX_COPIES,
    ancien_vers_nouveau: ANCIEN_VERS_NOUVEAU,
    anciens_sans_equivalent: ANCIENS_SANS_EQUIVALENT,
    types: Object.entries(REGISTRE.TYPES).map(([cle, t]) => ({
      cle, label: t.label, desc: t.desc, items: t.items, what: t.what, who: t.who, contains: t.contains,
      exemple: t.exemple || null, selectionnable: selectionnables.has(cle), page_dediee: PAGES_DEDIEES.includes(cle),
    })),
  };
}

module.exports = {
  REGISTRE, ANCIEN_VERS_NOUVEAU, ANCIENS_SANS_EQUIVALENT, CLES_NOUVELLES, SELECTIONNABLES_PUBLIC, PAGES_DEDIEES, CLE_INTERRUPTEUR,
  typeCanonique, estAncienSansEquivalent, typesSelectionnables, ajouterTemplatesV2, descriptionPourInterface, validerOptions,
};
