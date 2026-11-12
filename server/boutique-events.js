/* ===========================================================
   server/boutique-events.js — Lot E1 (2026-11-12) : boutique « Créateur d'événements » sur la vraie plateforme
   ===========================================================
   Réponses validées par l'utilisateur le 2026-11-12 (« ok » aux recommandations du plan lot E) :
   - Aucune nouvelle table de billets, de paiement, de QR ni de statistiques : la boutique assemble les modules existants
     (événements, prestations, réalisations, avis, devis, partenariat, contact…) et renvoie vers les écrans de gestion existants.
   - Pas de formules Essentiel / Pro / Premium, pas de newsletter propre (le module « Newsletter » de la vitrine s'en charge, éteint par défaut),
     pas de diffusion en direct intégrée.
   Ce fichier fournit :
     1. le modèle de modules du type « events » ;
     2. le profil « organisateur / prestataire / les deux » : un RACCOURCI qui montre ou masque « Nos événements » et « Nos prestations »
        (modules « evenements », « services » et « demande_devis »). Rien de plus n'est enregistré : le profil se déduit de l'état des modules,
        donc il ne peut jamais contredire ce que la boutique affiche.
   Lancer les tests : node --test tests/boutique-events.test.js
   =========================================================== */
'use strict';

/* Rubriques de l'accueil : événements à la une, prestations, réalisations, avis, devis, partenariat, contact. Tout est modifiable ensuite
   par le propriétaire ; appliquer ce modèle ne masque jamais un module déjà actif (même règle que les autres types). */
const MODULES_EVENTS = Object.freeze({
  actifs: ['a_propos', 'evenements', 'services', 'realisations', 'avis', 'equipe', 'partenaires', 'galerie_photos',
    'demande_devis', 'demande_partenariat', 'reservation', 'contact', 'actualites', 'reseaux_sociaux'],
  optionnels: ['produits', 'documents', 'temoignages', 'galerie_videos', 'newsletter'],
});

/* Un même compte peut être organisateur, prestataire, ou les deux. */
const PROFILS = Object.freeze({
  organisateur: {
    label: 'Organisateur',
    desc: "Vous organisez des événements : la boutique met en avant vos événements et leur billetterie.",
    actifs: ['evenements'], masques: ['services', 'demande_devis'],
  },
  prestataire: {
    label: 'Prestataire',
    desc: "Vous proposez des prestations pour les événements des autres : la boutique met en avant vos prestations et les demandes de devis.",
    actifs: ['services', 'demande_devis'], masques: ['evenements'],
  },
  les_deux: {
    label: 'Les deux',
    desc: 'Vous organisez vos propres événements et vous proposez aussi des prestations.',
    actifs: ['evenements', 'services', 'demande_devis'], masques: [],
  },
});

const PROFILS_POUR_INTERFACE = Object.freeze(Object.entries(PROFILS).map(([cle, p]) => ({ cle, label: p.label, desc: p.desc })));

const actif = (modules, cle) => !!(modules && modules[cle] && modules[cle].actif);

/** Profil déduit de l'état des modules : « les_deux », « organisateur », « prestataire », ou null si ni événements ni prestations ne sont affichés. */
function profilDe(modules) {
  const evt = actif(modules, 'evenements');
  const prest = actif(modules, 'services');
  if (evt && prest) return 'les_deux';
  if (evt) return 'organisateur';
  if (prest) return 'prestataire';
  return null;
}

/** Applique un profil à une copie de l'état des modules ({ cle: { actif, ordre } }) ; ne touche à aucun autre module.
    Renvoie { modules } ou { erreur }. */
function appliquerProfil(modules, cle) {
  const p = Object.prototype.hasOwnProperty.call(PROFILS, cle) ? PROFILS[cle] : null;
  if (!p) return { erreur: "Profil inconnu : choisissez « organisateur », « prestataire » ou « les deux »." };
  const copie = {};
  for (const [k, v] of Object.entries(modules || {})) copie[k] = { ...v };
  for (const k of p.masques) if (copie[k]) copie[k].actif = false;
  for (const k of p.actifs) copie[k] = { ...(copie[k] || {}), actif: true };
  return { modules: copie };
}

module.exports = { MODULES_EVENTS, PROFILS, PROFILS_POUR_INTERFACE, profilDe, appliquerProfil };
