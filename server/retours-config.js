/* ═════════════════════════════════════════════════════════════════
   server/retours-config.js — RÉGLAGES du module Retours / Réclamations / Remboursements (lot G, 2026-11-10)

   Réglages issus des questions Q1 à Q9 (voir Téléchargements\PLAN-lot-G-retours-remboursements.md, §4).
   Le 2026-11-10, l'utilisateur a VALIDÉ les recommandations de la session pour le lot G : les valeurs ci-dessous sont donc
   des décisions. Changer une valeur = changer UNE ligne.
   Autres choix validés, appliqués dans server/retours.js : litiges traités par le rôle « administrateur » (Q3) ; PayPal confirmé
   par relecture de l'état du remboursement, sans webhook (Q4) ; ligne de commande entière, sans remboursement partiel (Q5) ;
   aucune étape de retour physique (Q6) ; un refus du vendeur clôt le dossier, une nouvelle demande reste possible (Q7) ;
   vendeur sans compte retrouvé : « vérification manuelle » par l'administrateur (Q8) ; mêmes dossiers pour les contenus
   numériques et les services, avec leur règle affichée (Q9).
   ═════════════════════════════════════════════════════════════════ */
"use strict";

module.exports = {
  /* Fixé par le dossier (03-reclamations-remboursements.md §3.4) : sans réponse du vendeur, un dossier « envoyée » passe à « litige ». */
  DELAI_JOURS: 15,

  /* Fixés par le dossier (§3.2) */
  DETAIL_MIN: 20,
  DETAIL_MAX: 1000,
  PHOTO_MAX_OCTETS: 1024 * 1024,        // 1 Mo
  MESSAGE_MIN: 5,                        // réponse, motif de refus ou de décision

  MOTIFS: [
    "Article défectueux",
    "Article non conforme à la description",
    "Article abîmé à la livraison",
    "Article non reçu",
    "Changement d'avis",
  ],

  /* Q2 — En cas de remboursement, la commission de la plateforme (2 %) est-elle rendue au vendeur ?
     false = la plateforme garde sa commission (Stripe : refund_application_fee absent). Validé. */
  REMBOURSER_COMMISSION: false,

  /* Q5 — Le remboursement inclut-il les frais de livraison ? (montant_total = prix × quantité + frais de livraison.)
     true = on rembourse tout ce que le client a payé. Remboursement partiel : non géré (ligne entière). Validé. */
  INCLURE_LIVRAISON: true,

  /* Q1 — Règles de retour par catégorie. TEXTES DE LA MAQUETTE (commun.js), validés avec les recommandations du lot G.
     Elles sont affichées au client et au vendeur à titre d'information ; elles ne bloquent aucune réclamation. */
  REGLES_RETOUR: [
    { id: "vet", label: "Vêtements, pantalons, robes, manteaux", txt: "Oui, sous 14 jours." },
    { id: "chaussures", label: "Chaussures et accessoires", txt: "Oui, sous 14 jours." },
    { id: "sacs", label: "Sacs et maroquinerie", txt: "Oui, sous 14 jours." },
    { id: "electro", label: "Électroménager", txt: "Oui, sous 14 jours." },
    { id: "tech", label: "Téléphones, ordinateurs, tablettes", txt: "Oui, sous 14 jours." },
    { id: "meubles", label: "Meubles et décoration", txt: "Oui, sous 14 jours." },
    { id: "bijoux", label: "Bijoux et montres standards", txt: "Oui, sous 14 jours." },
    { id: "livres", label: "Livres papier", txt: "Oui, sous 14 jours." },
    { id: "cosm", label: "Cosmétiques non ouverts et scellés", txt: "Oui, sous 14 jours si le produit est scellé." },
    { id: "cosm_ouv", label: "Cosmétiques descellés (hygiène)", txt: "Non : produit descellé, exclu pour raisons d'hygiène." },
    { id: "sousvet", label: "Sous-vêtements descellés (hygiène)", txt: "Non : sous-vêtement descellé, exclu pour raisons d'hygiène." },
    { id: "alim", label: "Produits alimentaires périssables", txt: "Non : produit périssable." },
    { id: "fleurs", label: "Fleurs et plantes périssables", txt: "Non : fleurs et plantes périssables." },
    { id: "perso", label: "Produits fabriqués sur mesure ou personnalisés", txt: "Non : produit fabriqué sur mesure ou personnalisé." },
    { id: "solde", label: "Articles soldés ou en promotion", txt: "Oui, sous 14 jours." },
    { id: "occasion", label: "Articles d'occasion achetés à un professionnel", txt: "Oui, sous 14 jours." },
    { id: "numerique", label: "Contenu numérique (vidéo)", txt: "Non dès que le téléchargement ou la consultation a commencé, avec l'accord du client." },
    { id: "service", label: "Service sur devis", txt: "Non dès que le service a commencé, avec l'accord du client." },
  ],
};
