/* Registre des types de boutique — SOURCE UNIQUE (2026-11-10).
   Reprend la liste TYPES / TYPE_SECTIONS validée dans la maquette moteur-boutique.html.
   Règle du dossier : ajouter un type = une entrée dans TYPES + une entrée dans TYPE_SECTIONS, rien d'autre.
   MAX_OPTIONS est CALCULÉ (nombre de types − 1), jamais écrit à la main.
   Fichier UMD : chargé par une page (window.BOUTIQUE_TYPES) ou par Node (createRequire). */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === "object" && module.exports) module.exports = api; else racine.BOUTIQUE_TYPES = api;
})(typeof self !== "undefined" ? self : this, function () {
  var MAX_COPIES = 3;      // duplications possibles d'une même option
  var SLOTS_DEFAULT = 4;   // emplacements par cartouche (renouvelables)
  var TYPES = {
  "ecom": {
    "label": "Boutique Traditionnelle",
    "desc": "Catalogue, fiches produits, panier",
    "items": "Produit",
    "what": "Une boutique en ligne classique : un catalogue de produits avec photos, prix et stock, un panier et une commande payée en ligne. Elle sert à vendre en quantité, avec gestion des livraisons.",
    "who": "Vendeurs de produits physiques ou numériques en série : vêtements, épicerie, cosmétiques, artisanat vendu en quantité, produits à expédier partout.",
    "contains": "Des fiches produits (photos, description, variantes, prix) ; des catégories ; des promotions ; un panier ; le suivi des commandes et des expéditions.",
    "exemple": "/exemples-boutiques/boutique.html?type=ecom"
  },
  "video": {
    "label": "Boutique Vidéo",
    "desc": "Vidéos courtes avec produits ou prestations associés",
    "items": "Vidéo",
    "what": "Une boutique où l'on montre ses produits, ses services ou son savoir-faire à travers des vidéos courtes. Le visiteur regarde la vidéo, puis achète directement le produit ou le service présenté.",
    "who": "Créateurs de contenu, marques de beauté, de cuisine ou d'artisanat qui veulent montrer le geste, les coulisses ou l'utilisation d'un produit, coachs et formateurs qui vendent des vidéos ou des formations en ligne.",
    "contains": "Des vidéos avec leur durée, leur prix et un bouton « Ajouter au panier » ; des produits liés à chaque vidéo ; des rubriques (à la une, nouveautés, offres) ; un panier pour acheter plusieurs éléments.",
    "exemple": "/exemples-boutiques/video.html"
  },
  "portfolio": {
    "label": "Portfolio",
    "desc": "Galeries de réalisations et références",
    "items": "Réalisation",
    "what": "Une vitrine de vos réalisations : galeries de travaux, références et compétences. Le visiteur n'achète pas forcément sur place : il découvre votre travail, puis vous contacte pour un devis ou une collaboration.",
    "who": "Photographes, graphistes, designers, vidéastes, artisans du bâtiment, freelances qui vendent un travail sur mesure.",
    "contains": "Une galerie de réalisations avec description et date ; des études de cas ; des avis clients ; un formulaire de demande de devis ou de contact.",
    "exemple": "/exemples-boutiques/portfolio.html"
  },
  "events": {
    "label": "Créateur d'événements",
    "desc": "Agenda, événements, inscriptions et billetterie",
    "items": "Événement",
    "what": "Un espace pour présenter et vendre vos événements : date, lieu, programme, billets et inscriptions. Le visiteur réserve sa place directement dans la boutique.",
    "who": "Organisateurs de festivals, forums, formations en présentiel, soirées, rencontres communautaires ou de la diaspora.",
    "contains": "Des fiches événements (date, lieu, programme) ; une billetterie avec des types de billets ; des inscriptions ; un agenda ; des rappels avant l'événement.",
    "exemple": "/exemples-boutiques/evenements.html"
  },
  "impact": {
    "label": "Projet Impact",
    "desc": "Projets, objectifs, besoins et soutiens (paiements possibles)",
    "items": "Projet",
    "what": "Une vitrine d'un projet à impact social, solidaire ou environnemental. On y explique les objectifs, les besoins, les étapes et les partenaires, et le public peut soutenir le projet (don, achat solidaire, participation).",
    "who": "Associations, coopératives, projets de développement (agriculture, éducation, santé), collectifs qui cherchent des soutiens, des financements ou des partenaires.",
    "contains": "La présentation du projet ; des objectifs chiffrés ; les étapes et l'avancement ; les partenaires ; un appel à soutien avec paiement possible.",
    "exemple": "/exemples-boutiques/boutique.html?type=impact"
  },
  "finance": {
    "label": "Organismes de financement",
    "desc": "Programmes, critères, projets accompagnés et prise de rendez-vous",
    "items": "Programme",
    "what": "La vitrine d'un organisme de financement, banque, microfinance ou investisseur : ses programmes ouverts, ses critères d'éligibilité et les projets qu'il a accompagnés. Tout dépôt de projet passe par Soumettre à Diaspo'Actif.",
    "who": "Banques, organismes de microfinance, fonds d'investissement, partenaires financiers qui proposent des crédits, garanties ou programmes d'accompagnement.",
    "contains": "Des programmes avec critères et montants d'exemple ; les projets accompagnés (résultats déclarés ou vérifiés) ; des rendez-vous, des inscriptions et une newsletter. Aucun formulaire de dépôt de projet.",
    "exemple": "/exemples-boutiques/boutique.html?type=finance"
  }
};
  var TYPE_SECTIONS = {
  "video": [
    "Vidéos à la une",
    "Nouveautés vidéos"
  ],
  "ecom": [
    "Nos produits",
    "Nouveautés",
    "Promotions"
  ],
  "portfolio": [
    "Notre portfolio",
    "Projets récents"
  ],
  "events": [
    "Nos prochains événements"
  ],
  "impact": [
    "Nos projets à impact"
  ],
  "finance": [
    "Programmes ouverts",
    "Projets accompagnés"
  ]
};
  var TEXTURES = [
  {
    "id": "uni",
    "label": "Uni (aucune texture)",
    "bg": ""
  },
  {
    "id": "dore",
    "label": "Doré",
    "bg": "linear-gradient(115deg, rgba(120,80,10,.55) 0%, rgba(255,238,170,.75) 22%, rgba(185,138,46,.6) 40%, rgba(255,246,200,.8) 55%, rgba(143,100,24,.6) 75%, rgba(233,201,107,.7) 100%)"
  },
  {
    "id": "brillant",
    "label": "Brillant",
    "bg": "linear-gradient(115deg, transparent 30%, rgba(255,255,255,.85) 42%, transparent 50%, rgba(255,255,255,.5) 62%, transparent 70%) 0 0 / 250% 100%"
  },
  {
    "id": "scintillant",
    "label": "Scintillant",
    "bg": "radial-gradient(circle, #fff 2px, transparent 3px) 0 0 / 26px 22px, radial-gradient(circle, #ffe9a6 1.5px, transparent 3px) 13px 11px / 34px 30px"
  },
  {
    "id": "luisant",
    "label": "Luisant (vernis)",
    "bg": "linear-gradient(180deg, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 46%, rgba(0,0,0,.22) 52%, rgba(0,0,0,.05) 100%)"
  },
  {
    "id": "satine",
    "label": "Satiné",
    "bg": "linear-gradient(90deg, rgba(255,255,255,.25), rgba(0,0,0,.15) 35%, rgba(255,255,255,.22) 65%, rgba(0,0,0,.12))"
  }
];
  var MAX_OPTIONS = Object.keys(TYPES).length - 1;
  return { TYPES: TYPES, TYPE_SECTIONS: TYPE_SECTIONS, TEXTURES: TEXTURES, MAX_OPTIONS: MAX_OPTIONS, MAX_COPIES: MAX_COPIES, SLOTS_DEFAULT: SLOTS_DEFAULT };
});
