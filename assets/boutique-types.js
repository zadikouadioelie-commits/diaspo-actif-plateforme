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
    "bg": "",
    "groupe": "Aucune"
  },
  {
    "id": "dore",
    "label": "Doré",
    "bg": "linear-gradient(115deg, rgba(120,80,10,.55) 0%, rgba(255,238,170,.75) 22%, rgba(185,138,46,.6) 40%, rgba(255,246,200,.8) 55%, rgba(143,100,24,.6) 75%, rgba(233,201,107,.7) 100%)",
    "groupe": "Métal et brillance"
  },
  {
    "id": "brillant",
    "label": "Brillant",
    "bg": "linear-gradient(115deg, transparent 30%, rgba(255,255,255,.85) 42%, transparent 50%, rgba(255,255,255,.5) 62%, transparent 70%) 0 0 / 250% 100%",
    "groupe": "Métal et brillance"
  },
  {
    "id": "scintillant",
    "label": "Scintillant",
    "bg": "radial-gradient(circle, #fff 2px, transparent 3px) 0 0 / 26px 22px, radial-gradient(circle, #ffe9a6 1.5px, transparent 3px) 13px 11px / 34px 30px",
    "groupe": "Métal et brillance"
  },
  {
    "id": "luisant",
    "label": "Luisant (vernis)",
    "bg": "linear-gradient(180deg, rgba(255,255,255,.75) 0%, rgba(255,255,255,.1) 46%, rgba(0,0,0,.22) 52%, rgba(0,0,0,.05) 100%)",
    "groupe": "Métal et brillance"
  },
  {
    "id": "satine",
    "label": "Satiné",
    "bg": "linear-gradient(90deg, rgba(255,255,255,.25), rgba(0,0,0,.15) 35%, rgba(255,255,255,.22) 65%, rgba(0,0,0,.12))",
    "groupe": "Métal et brillance"
  },
  {
    "id": "argent",
    "label": "Argenté",
    "groupe": "Métal et brillance",
    "bg": "linear-gradient(115deg, rgba(80,86,98,.5) 0%, rgba(245,248,252,.82) 22%, rgba(150,156,168,.55) 42%, rgba(255,255,255,.88) 58%, rgba(112,118,130,.55) 78%, rgba(225,230,238,.72) 100%)"
  },
  {
    "id": "cuivre",
    "label": "Cuivré",
    "groupe": "Métal et brillance",
    "bg": "linear-gradient(115deg, rgba(110,48,24,.55) 0%, rgba(255,196,156,.75) 24%, rgba(176,92,56,.58) 44%, rgba(255,214,180,.8) 60%, rgba(128,62,34,.58) 80%, rgba(240,170,130,.7) 100%)"
  },
  {
    "id": "bronze",
    "label": "Bronze",
    "groupe": "Métal et brillance",
    "bg": "linear-gradient(115deg, rgba(70,46,16,.6) 0%, rgba(214,170,98,.65) 26%, rgba(120,84,34,.6) 48%, rgba(232,196,130,.7) 64%, rgba(84,56,20,.6) 84%, rgba(190,146,78,.6) 100%)"
  },
  {
    "id": "nacre",
    "label": "Nacré",
    "groupe": "Métal et brillance",
    "bg": "linear-gradient(135deg, rgba(255,255,255,.62), rgba(255,214,238,.34) 30%, rgba(196,228,255,.4) 62%, rgba(255,255,255,.55))"
  },
  {
    "id": "rayures",
    "label": "Rayures obliques",
    "groupe": "Motifs",
    "bg": "repeating-linear-gradient(45deg, rgba(255,255,255,.16) 0 8px, transparent 8px 16px)"
  },
  {
    "id": "rayures-fines",
    "label": "Rayures fines",
    "groupe": "Motifs",
    "bg": "repeating-linear-gradient(90deg, rgba(255,255,255,.14) 0 2px, transparent 2px 7px)"
  },
  {
    "id": "pois",
    "label": "Pois",
    "groupe": "Motifs",
    "bg": "radial-gradient(circle, rgba(255,255,255,.3) 3px, transparent 4px) 0 0 / 18px 18px"
  },
  {
    "id": "quadrillage",
    "label": "Quadrillage",
    "groupe": "Motifs",
    "bg": "linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px) 0 0 / 14px 14px"
  },
  {
    "id": "zigzag",
    "label": "Zigzag",
    "groupe": "Motifs",
    "bg": "linear-gradient(135deg, rgba(255,255,255,.14) 25%, transparent 25%) -10px 0 / 20px 20px, linear-gradient(225deg, rgba(255,255,255,.14) 25%, transparent 25%) -10px 0 / 20px 20px, linear-gradient(315deg, rgba(0,0,0,.12) 25%, transparent 25%) 0 0 / 20px 20px, linear-gradient(45deg, rgba(0,0,0,.12) 25%, transparent 25%) 0 0 / 20px 20px"
  },
  {
    "id": "vagues",
    "label": "Vagues",
    "groupe": "Motifs",
    "bg": "radial-gradient(circle at 50% 100%, transparent 36%, rgba(255,255,255,.22) 37% 41%, transparent 42%) 0 0 / 28px 16px"
  },
  {
    "id": "cercles-wax",
    "label": "Cercles (wax)",
    "groupe": "Motifs",
    "bg": "radial-gradient(circle at 50% 50%, rgba(255,255,255,.26) 0 3px, transparent 4px 7px, rgba(255,255,255,.2) 8px 10px, transparent 11px) 0 0 / 34px 34px"
  },
  {
    "id": "lin",
    "label": "Toile de lin",
    "groupe": "Matières",
    "bg": "repeating-linear-gradient(0deg, rgba(255,255,255,.08) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,.08) 0 1px, transparent 1px 3px)"
  },
  {
    "id": "papier",
    "label": "Papier grainé",
    "groupe": "Matières",
    "bg": "radial-gradient(rgba(0,0,0,.2) .6px, transparent .9px) 0 0 / 4px 4px, radial-gradient(rgba(255,255,255,.22) .6px, transparent .9px) 2px 2px / 5px 5px"
  },
  {
    "id": "carbone",
    "label": "Carbone",
    "groupe": "Matières",
    "bg": "linear-gradient(27deg, rgba(0,0,0,.34) 5px, transparent 5px) 0 5px / 10px 10px, linear-gradient(207deg, rgba(0,0,0,.34) 5px, transparent 5px) 10px 0 / 10px 10px, linear-gradient(27deg, rgba(0,0,0,.2) 5px, transparent 5px) 0 10px / 10px 10px, linear-gradient(207deg, rgba(0,0,0,.2) 5px, transparent 5px) 10px 5px / 10px 10px"
  },
  {
    "id": "bois",
    "label": "Bois",
    "groupe": "Matières",
    "bg": "repeating-linear-gradient(90deg, rgba(60,30,10,.2) 0 2px, rgba(255,230,190,.1) 2px 6px, rgba(60,30,10,.12) 6px 7px, transparent 7px 14px)"
  },
  {
    "id": "marbre",
    "label": "Marbre",
    "groupe": "Matières",
    "bg": "radial-gradient(ellipse at 20% 30%, rgba(255,255,255,.4), transparent 45%), radial-gradient(ellipse at 80% 70%, rgba(255,255,255,.3), transparent 40%), linear-gradient(115deg, transparent 40%, rgba(255,255,255,.24) 41%, transparent 43%, transparent 60%, rgba(0,0,0,.16) 61%, transparent 63%)"
  },
  {
    "id": "velours",
    "label": "Velours",
    "groupe": "Matières",
    "bg": "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.24), transparent 62%), linear-gradient(180deg, transparent 58%, rgba(0,0,0,.32))"
  },
  {
    "id": "deg-clair-fonce",
    "label": "Clair vers foncé",
    "groupe": "Dégradés",
    "bg": "linear-gradient(180deg, rgba(255,255,255,.4), rgba(0,0,0,.3))",
    "sens": "bas"
  },
  {
    "id": "deg-diagonale",
    "label": "Diagonale lumineuse",
    "groupe": "Dégradés",
    "bg": "linear-gradient(135deg, rgba(255,255,255,.42) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,.3) 100%)",
    "sens": "diagonale"
  },
  {
    "id": "deg-horizon",
    "label": "Horizon",
    "groupe": "Dégradés",
    "bg": "linear-gradient(180deg, rgba(0,0,0,.3), rgba(0,0,0,0) 45%, rgba(255,255,255,.26))",
    "sens": "haut-bas"
  },
  {
    "id": "deg-lueur",
    "label": "Lueur d'angle",
    "groupe": "Dégradés",
    "bg": "radial-gradient(circle at 28% 20%, rgba(255,255,255,.55), rgba(255,255,255,0) 62%)",
    "sens": "lueur"
  },
  {
    "id": "deg-vignette",
    "label": "Vignette",
    "groupe": "Dégradés",
    "bg": "radial-gradient(circle at 50% 50%, rgba(255,255,255,.16), rgba(0,0,0,.42) 120%)",
    "sens": "vignette"
  },
  {
    "id": "deg-conique",
    "label": "Reflet tournant",
    "groupe": "Dégradés",
    "bg": "conic-gradient(from 200deg at 70% 30%, rgba(255,255,255,.42), rgba(0,0,0,.26), rgba(255,255,255,.42))",
    "sens": "tour"
  },
  {
    "id": "deg-aube",
    "label": "Aube (lueur chaude)",
    "groupe": "Dégradés",
    "bg": "linear-gradient(0deg, rgba(255,186,116,.55), rgba(255,255,255,0) 72%)",
    "sens": "haut"
  },
  {
    "id": "deg-crepuscule",
    "label": "Crépuscule",
    "groupe": "Dégradés",
    "bg": "linear-gradient(180deg, rgba(44,22,96,.52), rgba(255,122,92,.36))",
    "sens": "bas"
  },
  {
    "id": "deg-ocean",
    "label": "Profondeur d'océan",
    "groupe": "Dégradés",
    "bg": "linear-gradient(180deg, rgba(255,255,255,.3), rgba(0,58,140,.46))",
    "sens": "bas"
  },
  {
    "id": "deg-arcenciel",
    "label": "Arc-en-ciel doux",
    "groupe": "Dégradés",
    "bg": "linear-gradient(90deg, rgba(255,80,80,.36), rgba(255,210,70,.36), rgba(80,200,120,.36), rgba(70,140,255,.36), rgba(170,90,255,.36))",
    "sens": "droite"
  }
];
  var MAX_OPTIONS = Object.keys(TYPES).length - 1;
  return { TYPES: TYPES, TYPE_SECTIONS: TYPE_SECTIONS, TEXTURES: TEXTURES, MAX_OPTIONS: MAX_OPTIONS, MAX_COPIES: MAX_COPIES, SLOTS_DEFAULT: SLOTS_DEFAULT };
});
