/* ═════════════════════════════════════════════════
   server/kofi-navigation-pages.js — CATALOGUE FERMÉ DES PAGES QUE KOFFI PEUT MONTRER (2026-11-01)

   Koffi, guide de navigation : le modèle reçoit cette liste (clé, titre, description) et ne peut proposer QUE des clés de cette liste ; le serveur construit lui-même
   les liens. Une page qui n'est pas ici n'existe pas pour Koffi. À MODIFIER ICI quand une page est ajoutée, renommée ou retirée du site.
   - url : page du site (chemin relatif) ; tel : écran de la version téléphone (route m.html) quand il existe ; roles : comptes qui y ont accès (absent = tous les comptes connectés).
   - Les descriptions disent ce que la page PERMET (c'est ce qui sert à répondre à « où puis-je… ? ») ; ne rien y affirmer qui ne soit pas vrai dans la page.
   - Les pages d'administration sont exclues : l'administrateur a son propre assistant (server/kofi-admin.js).
   ═════════════════════════════════════════════════ */
"use strict";

const ROLE_DASHBOARD = { utilisateur: "dashboard-utilisateur.html", initiative: "dashboard-initiative.html", collectivite: "dashboard-collectivite.html", partenaire: "dashboard-partenaire.html", administrateur: "dashboard-administrateur.html", administrateur_junior: "dashboard-administrateur-junior.html" };
const SIGNAL = ["initiative", "collectivite", "administrateur", "administrateur_junior"];   /* comptes pouvant scanner des billets */

const PAGES = [
  { cle: "accueil", icone: "🏠", titre: "Accueil", url: "index.html", tel: "#/accueil", desc: "Page d'accueil du portail : présentation de Diaspo'Actif et accès aux grandes rubriques." },
  { cle: "tableau_de_bord", icone: "📊", titre: "Mon tableau de bord", url: "@tableau_de_bord", tel: "#/moi", desc: "Votre espace personnel selon votre type de compte : vos modules, vos statistiques et les outils de votre compte." },
  { cle: "mon_profil", icone: "👤", titre: "Mon profil public", url: "@mon_profil", tel: "#/moi", desc: "Votre fiche publique, telle que les autres membres la voient : photo, présentation, bannière, informations visibles. C'est ici que vous la complétez et la modifiez." },
  { cle: "parametres", icone: "⚙️", titre: "Paramètres du compte", url: "parametres-compte.html", tel: "#/moi", desc: "Modifier votre nom, votre domaine d'activité, votre adresse e-mail, votre mot de passe et vos notifications ; supprimer ou masquer votre compte." },
  { cle: "confidentialite", icone: "🔒", titre: "Confidentialité des données", url: "confidentialite.html", tel: "#/confidentialite", desc: "Choisir ce qui est visible par les autres (informations publiques, réservées aux membres, privées), refuser d'être proposé par Koffi, gérer vos données." },
  { cle: "comptes_lies", icone: "🔗", titre: "Liaison de comptes", url: "comptes-lies.html", desc: "Lier plusieurs de vos comptes Diaspo'Actif pour passer de l'un à l'autre sans vous reconnecter, et bénéficier de la réduction Premium sur les comptes liés." },
  { cle: "messagerie", icone: "💬", titre: "Messagerie", url: "messagerie.html", tel: "#/messages", desc: "Vos conversations privées avec les autres membres : lire, répondre, écrire à quelqu'un." },
  { cle: "fil", icone: "📰", titre: "Fil d'actualité", url: "fil-actualite.html", tel: "#/fil", desc: "Les publications de la communauté ; c'est ici que vous publiez, commentez et réagissez." },
  { cle: "projets_diasporas", icone: "🌍", titre: "Projets diasporas (actualités)", url: "actualites.html", tel: "#/actualites", desc: "Actualités et projets portés par les diasporas." },
  { cle: "annuaire", icone: "🔍", titre: "Annuaire", url: "annuaire.html", tel: "#/annuaire", desc: "Trouver des comptes (personnes, initiatives, collectivités) par nom, domaine, pays ou ville ; Koffi, le conseiller de l'Annuaire, aide à chercher par description de besoin." },
  { cle: "boutiques", icone: "🏪", titre: "Boutiques", url: "vitrines.html", tel: "#/boutiques", desc: "Découvrir les boutiques et vitrines des entreprises, associations et projets de la diaspora, et y acheter produits et services." },
  { cle: "panier", icone: "🛒", titre: "Mon panier", url: "panier.html", desc: "Les articles que vous avez ajoutés depuis les boutiques ; valider votre commande." },
  { cle: "mes_devis", icone: "📩", titre: "Mes demandes de devis", url: "mes-devis.html", desc: "Suivre les demandes de devis envoyées aux boutiques et les réponses reçues." },
  { cle: "evenements", icone: "📅", titre: "Événements", url: "evenements.html", tel: "#/evenements", desc: "Tous les événements publics de la plateforme avec filtres (pays, ville, date, domaine, forme, gratuit/payant) ; créer un événement (bouton « Créer un événement »), publier un événement flash, retrouver un brouillon, ouvrir le calendrier diaspora ; Koffi y aide à trouver des événements." },
  { cle: "mes_inscriptions_evenements", icone: "✅", titre: "Mes inscriptions aux événements", url: "mes-inscriptions-evt.html", desc: "Les événements auxquels vous êtes inscrit(e) et vos inscriptions en cours." },
  { cle: "mes_billets", icone: "🎟️", titre: "Mes billets", url: "mes-billets.html", tel: "#/billets", desc: "Vos billets d'événements avec leur code QR à présenter à l'entrée." },
  { cle: "billetterie", icone: "🎫", titre: "Billetterie", url: "billetterie.html", desc: "La billetterie des événements : billets et ventes." },
  { cle: "scanner_billets", icone: "📷", titre: "Scanner les billets", url: "scanner.html", roles: SIGNAL, desc: "Contrôler les billets à l'entrée d'un événement en scannant leur code QR (comptes initiative, collectivité ou administration)." },
  { cle: "programmation", icone: "🔔", titre: "Programmation d'alertes", url: "programmation.html", desc: "Être prévenu(e) des événements qui vous intéressent : choisir ses alertes et ses rappels." },
  { cle: "agenda", icone: "🗓️", titre: "Mon Agenda", url: "agenda.html", tel: "#/agenda", desc: "Votre agenda personnel : rendez-vous privés, rappels et événements auxquels vous participez." },
  { cle: "compte_rendu", icone: "📝", titre: "Compte-rendu d'événement", url: "compte-rendu-app.html", desc: "Rédiger et envoyer le compte-rendu d'un événement que vous avez organisé." },
  { cle: "cagnottes", icone: "💝", titre: "Cagnottes", url: "cagnottes.html", tel: "#/cagnottes", desc: "Soutenir les projets de la diaspora en contribuant à leurs collectes de fonds ; créer ou suivre une cagnotte." },
  { cle: "adhesions", icone: "🤝", titre: "Cotisations et adhésions", url: "adhesions.html", tel: "#/cotisations", desc: "Adhérer à une organisation, payer une cotisation et suivre ses adhésions." },
  { cle: "centre_financier", icone: "💰", titre: "Centre Financier", url: "centre-financier.html", tel: "#/centrefinancier", desc: "Le Centre Financier de votre compte : paiements, encaissements et suivi financier." },
  { cle: "moyens_paiement", icone: "💳", titre: "Mes moyens de paiement", url: "mes-paiements.html", desc: "Gérer les moyens de paiement enregistrés sur votre compte." },
  { cle: "premium", icone: "⭐", titre: "Premium", url: "premium.html", desc: "Découvrir l'offre Premium (avantages, tarifs) et y souscrire." },
  { cle: "mon_abonnement", icone: "👑", titre: "Mon abonnement", url: "mon-abonnement.html", tel: "#/abonnement", desc: "Voir l'état de votre abonnement Premium, sa date d'échéance, le renouveler ou le gérer." },
  { cle: "parrainage", icone: "🎁", titre: "Parrainage et invitations", url: "parrainage.html", tel: "#/parrainage", desc: "Inviter des proches à rejoindre Diaspo'Actif et suivre vos parrainages." },
  { cle: "formations", icone: "🎓", titre: "Formations en ligne", url: "formations.html", tel: "#/formations", desc: "Le catalogue des formations de Diaspo'Actif : s'inscrire, suivre une formation, retrouver ses certificats ; Koffi, le tuteur, répond aux questions dans chaque formation." },
  { cle: "creer_formation", icone: "🧑‍🏫", titre: "Studio de création de formation", url: "formations.html#espace-formateur", page: "formation-studio.html", desc: "Créer et publier une formation (modules, leçons, évaluations, certificat), avec l'aide de Koffi : ouvre l'Espace Formateur, d'où l'on crée une formation puis où l'on ouvre le Studio sur une leçon ; réservé aux comptes autorisés à créer des formations." },
  { cle: "attestation", icone: "📜", titre: "Mon attestation", url: "attestation.html", desc: "Consulter votre attestation Diaspo'Actif." },
  { cle: "business_plan", icone: "📋", titre: "Business Plans", url: "business-plan.html", tel: "#/businessplan", desc: "Créer, écrire et améliorer votre business plan rubrique par rubrique ; dans l'éditeur, Koffi peut jouer l'investisseur, le banquier ou le client pour vous faire répéter." },
  { cle: "cv", icone: "📄", titre: "Créer mon CV", url: "cv-builder.html", tel: "#/cvlettres", desc: "Construire et télécharger son CV (modèles, médias, partage par lien ou code QR)." },
  { cle: "lettre_motivation", icone: "✉️", titre: "Lettre de motivation", url: "lettre-builder.html", tel: "#/cvlettres", desc: "Rédiger une lettre de motivation." },
  { cle: "dossiers_candidatures", icone: "🗂️", titre: "Dossiers de candidatures", url: "dossiers-candidatures.html", desc: "Regrouper CV, lettres et pièces pour une candidature et les suivre." },
  { cle: "emplois_stages", icone: "💼", titre: "Emploi et stages", url: "emplois-stages.html", desc: "Rechercher des offres d'emploi et de stage." },
  { cle: "recrutement", icone: "🧲", titre: "Recrutement", url: "recrutement.html", desc: "Le module de recrutement : offres et candidatures." },
  { cle: "offres", icone: "🧭", titre: "Offres et opportunités", url: "offres.html", desc: "Les offres et opportunités proposées par la communauté." },
  { cle: "reseau_pro", icone: "🌐", titre: "Réseau professionnel", url: "reseau.html", tel: "#/reseaupro", desc: "Le réseau professionnel : suivre des abonnés et des abonnements, retrouver des contacts d'affaires." },
  { cle: "mon_associe", icone: "💎", titre: "Mon Associé", url: "mon-associe.html", tel: "#/associe", desc: "Annonces et profils pour trouver un associé ; publication et candidatures réservées aux comptes Initiative et Collectivité Premium, consultation libre pour tous." },
  { cle: "collaborations", icone: "🤲", titre: "Appels à contribution", url: "collaborations.html", desc: "Bénévoles, partenaires, cofinanceurs : rejoindre des projets de la diaspora ou lancer un appel." },
  { cle: "sondages", icone: "📊", titre: "Sondages", url: "sondages.html", desc: "Répondre aux sondages de la communauté." },
  { cle: "votes", icone: "🗳️", titre: "Votes sécurisés", url: "votes.html", desc: "Participer aux scrutins et votes en ligne." },
  { cle: "partenaires", icone: "🏅", titre: "Partenaires officiels", url: "partenaires.html", desc: "Les organisations, entreprises et institutions reconnues comme partenaires de Diaspo'Actif." },
  { cle: "recherche", icone: "🔎", titre: "Recherche sur tout Diaspo'Actif", url: "recherche.html", desc: "Une recherche générale dans les comptes, événements, publications et autres contenus de la plateforme." },
  { cle: "tutoriels", icone: "📚", titre: "Centre des tutos", url: "tutoriels.html", desc: "Les guides pas à pas pour apprendre à utiliser chaque module de la plateforme." },
  { cle: "videos_tutoriels", icone: "🎬", titre: "Vidéos tutoriels", url: "videos-tutoriels-app.html", tel: "#/videos", desc: "Les vidéos « Comment ça marche » pour découvrir les modules." },
  { cle: "faq", icone: "💡", titre: "FAQ et base de connaissances", url: "faq.html", desc: "Les réponses aux questions fréquentes sur le fonctionnement de la plateforme." },
  { cle: "support", icone: "🛟", titre: "Support Pilote (assistance)", url: "support-pilote.html", desc: "Demander une assistance à l'équipe de Diaspo'Actif." },
  { cle: "avis", icone: "⭐", titre: "Donner son avis", url: "avis.html", desc: "Partager votre expérience et vos suggestions." },
  { cle: "site_vitrine", icone: "🌐", titre: "Site Diaspo'Actif (vitrine)", url: "site-vitrine.html", desc: "Le site de présentation de Diaspo'Actif : qui nous sommes, nos actions, nos rapports." },
  { cle: "cgu", icone: "⚖️", titre: "Conditions générales d'utilisation", url: "cgu.html", desc: "Les règles d'utilisation de la plateforme." },
  { cle: "cgv", icone: "🧾", titre: "Conditions générales de vente", url: "cgv.html", desc: "Les conditions des achats et abonnements, y compris les recharges Koffi et l'absence de remboursement." },
  { cle: "politique_confidentialite", icone: "🛡️", titre: "Politique de confidentialité", url: "politique-confidentialite.html", desc: "Comment vos données personnelles sont traitées, y compris par Koffi, et comment exercer vos droits." },
];

const parCle = new Map(PAGES.map(p => [p.cle, p]));
const CLES = PAGES.map(p => p.cle);

/* Résout les adresses dépendant du compte (« @… ») et retire les pages que le rôle n'a pas. Renvoie des objets { cle, icone, titre, desc, url, tel }. */
function pagesPour(user) {
  const role = String((user && user.role) || "");
  const id = Number(user && user.id) || 0;
  const url = p => {
    if (p.url === "@tableau_de_bord") return ROLE_DASHBOARD[role] || "index.html";
    if (p.url === "@mon_profil") return role === "collectivite" ? `profil-collectivite.html?id=${id}` : (role === "administrateur" || role === "administrateur_junior") ? (ROLE_DASHBOARD[role] || "index.html") : `profil.html?id=${id}`;
    return p.url;
  };
  return PAGES.filter(p => !p.roles || p.roles.includes(role)).map(p => ({ cle: p.cle, icone: p.icone, titre: p.titre, desc: p.desc, url: url(p), tel: p.tel || null }));
}

/* Page où se trouve la personne (chemin envoyé par le navigateur) → entrée du catalogue, ou null. Seul le nom du fichier compte : jamais d'adresse libre. */
function pageActuelle(chemin) {
  const f = String(chemin || "").split(/[?#]/)[0].split("/").pop().toLowerCase();
  if (!/^[a-z0-9-]+\.html$/.test(f)) return null;
  const nom = f.replace(/-app\.html$/, ".html");
  for (const p of PAGES) { const u = String(p.page || p.url).split(/[?#]/)[0]; if (u === f || u === nom) return p; }
  if (Object.values(ROLE_DASHBOARD).includes(f)) return parCle.get("tableau_de_bord");
  if (f === "profil.html" || f === "profil-app.html" || f === "profil-collectivite.html") return parCle.get("mon_profil");
  return null;
}

module.exports = { PAGES, CLES, ROLE_DASHBOARD, pagesPour, pageActuelle, parCle };
