/* ============================================================================================
   « Menu des modules » en cartes (2026-11-06, demande explicite : « modifie l'affichage des modules dans le menu en
   utilisant cette façon-là », maquette fournie ; puis : « il garde le même style d'illustration, je ne veux pas
   d'émoticône »).

   Maquette : panneau bleu nuit à bordure dorée, titre « Menu des modules » + croix, recherche, trois onglets
   (Module Standard / Module Premium / Tous les modules), puis une carte par module — icône au trait à gauche, titre en
   gras, une ligne de description, rond « ? » à droite. Les modules Premium sont des cartes dorées.

   Principe : on ne reconstruit RIEN. Chaque module reste le même <a> (mêmes écouteurs, mêmes ids, mêmes classes :
   verrou Premium, état « accréditation » vert/doré, pastilles de compteur, bouton « ? » de module-aide-ui.js,
   réorganisation par glisser de sidebar-reorder.js, recherche d'app.js). On y ajoute seulement :
     - une icône SVG (jamais d'émoji : celui du libellé est retiré, y compris le « 🔒 » posé par le tableau de bord, remplacé
       par un petit cadenas SVG),
     - une ligne de description,
     - le niveau (data-mmc-niv = premium | standard), déduit du TITRE DE GROUPE « MODULES PREMIUM » qui précède le lien,
     - les onglets, qui ne font que masquer/montrer par CSS (aucun lien n'est déplacé ni supprimé).
   Idempotent ; un MutationObserver rejoue la mise en forme quand un script réécrit un lien (ex. innerHTML = '🔒 ' + …).
   Utilisé par : dashboard-initiative / utilisateur / collectivité / partenaire (balise <script>) et par le menu ouvert « sur place »
   depuis n'importe quelle page (assets/app.js appelle window.menuModulesCartes).
   ============================================================================================ */
(function () {
  if (window.menuModulesCartes) return;

  /* ── Icônes : un seul langage visuel (trait 1,8, extrémités arrondies, 24×24), jamais d'émoji ───────────────────────── */
  const ICONES = {
    couches: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
    document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/>',
    calendrier: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    livre: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    diplome: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/><path d="M22 10v6"/>',
    dossier: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    cible: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    bouclier: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    groupe: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    lien: '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><path d="M8 12h8"/>',
    reseau: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8"/>',
    mallette: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    reglages: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
    carte: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    porte_voix: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    vote: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    billet: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    sac: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    pieces: '<circle cx="8" cy="8" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.4 18"/><path d="M7 6h1v4"/>',
    portefeuille: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    barres: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    personne: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    bulle: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    courrier: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    repere: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    cloche: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    cadenas: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    ecran: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    cadeau: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    couronne: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7z"/><path d="M5 20h14"/>',
    medaille: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13.9 17 22l-5-3-5 3 1.5-8.1"/>',
    liste: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    loupe: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    boussole: '<circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z"/>',
    ampoule: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5A5.8 5.8 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>',
    grille: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    maison: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    immeuble: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    etoile: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    courbe: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    bouee: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.9 4.9 4.2 4.2M14.9 14.9l4.2 4.2M14.9 9.1l4.2-4.2M9.1 14.9l-4.2 4.2"/>',
    lecture: '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/>',
    horloge: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    avion: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    journal: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>',
    etincelle: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
    jauge: '<path d="m12 14 4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
    corbeille: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    synchro: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h2a4 4 0 0 0 4-4 10 10 0 0 0-10-11z"/>',
    colis: '<path d="m7.5 4.3 9 5.2"/><path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    euro: '<path d="M4 10h12M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"/>',
    panier: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    identite: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M13 10h5M13 14h4"/>',
    valide: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    oeil: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    cle: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    partage: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    telecharger: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    sortie: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'
  };

  /* ── Catalogue : première règle qui correspond au libellé (sans émoji, sans accent, en minuscules) ──────────────────────
     [expression, icône, description d'une ligne]. Un module absent d'ici reçoit l'icône « grille » et aucune description. */
  const REGLES = [
    [/formulaires?/, 'document', "Créer et gérer vos formulaires (adhésion, entrée, projet...)"],
    [/crm partage/, 'groupe', "Contacts partagés avec vos initiatives"],
    [/^crm$/, 'groupe', "Suivre vos contacts et vos relations"],
    [/module paiements?$|^paiements?$/, 'carte', "Encaisser et suivre vos paiements"],
    [/creation de formation/, 'diplome', "Créer, diffuser et suivre des formations en ligne"],
    [/suivi de formation/, 'livre', "Suivre votre progression en formation"],
    [/catalogue formations|^formations$/, 'livre', "Découvrir et suivre les formations"],
    [/publicites?$/, 'porte_voix', "Promouvoir vos actions auprès de la communauté"],
    [/mes evenements|^evenements?$/, 'calendrier', "Organiser, promouvoir et gérer vos événements"],
    [/business plans?/, 'liste', "Construire et partager vos business plans"],
    [/cotisations/, 'identite', "Gérer les cotisations et adhésions de vos membres"],
    [/votes? securises?/, 'vote', "Organiser des scrutins sécurisés"],
    [/billetterie/, 'billet', "Vendre vos billets et contrôler les entrées"],
    [/messages de la boutique/, 'sac', "Répondre aux messages de vos clients"],
    [/recherche d'emploi/, 'mallette', "Trouver et suivre des offres d'emploi et de stage"],
    [/emplois?/, 'mallette', "Publier et suivre vos offres d'emploi et de stage"],
    [/cv, lettres/, 'document', "Préparer et suivre vos candidatures"],
    [/candidatures/, 'liste', "Examiner les candidatures reçues"],
    [/centre financier/, 'portefeuille', "Suivre vos finances et vos revenus"],
    [/parametres? boutique/, 'reglages', "Configurer votre vitrine et votre boutique"],
    [/cagnottes?/, 'pieces', "Collecter des dons et lancer des cagnottes"],
    [/recensement/, 'liste', "Recenser les membres de votre communauté"],
    [/maracana/, 'cible', "Suivre vos projets, indicateurs et performances"],
    [/accreditation asso/, 'medaille', "Faire reconnaître votre association"],
    [/accreditations? da/, 'medaille', "Obtenir et suivre vos accréditations Diaspo'Actif"],
    [/^accreditations?$/, 'bouclier', "Gérer les habilitations, attestations et certificats"],
    [/mon profil public/, 'personne', "Présenter votre profil à la communauté"],
    [/indice de fiabilite/, 'jauge', "Mesurer et améliorer votre fiabilité"],
    [/confidentialite/, 'cadenas', "Choisir ce que les autres peuvent voir"],
    [/liaison de comptes|comptes? lies/, 'lien', "Relier vos comptes et réduire vos frais"],
    [/support pilote/, 'ecran', "Être accompagné par un conseiller"],
    [/programmation/, 'horloge', "Planifier vos publications et envois"],
    [/mon abonnement/, 'couronne', "Gérer votre abonnement Premium"],
    [/parrainage/, 'cadeau', "Inviter vos proches et gagner des avantages"],
    [/tableau de bord/, 'grille', "Vue d'ensemble de votre activité"],
    [/accueil/, 'maison', "Revenir à la page d'accueil"],
    [/ma fiche initiative/, 'immeuble', "Présenter votre initiative"],
    [/publications?/, 'journal', "Publier vos actualités"],
    [/avancement/, 'courbe', "Suivre la progression de votre initiative"],
    [/soumettre/, 'avion', "Proposer votre initiative à Diaspo'Actif"],
    [/zones? d'action/, 'repere', "Définir vos zones d'intervention"],
    [/stats|impact/, 'barres', "Mesurer votre impact"],
    [/messages?$|messagerie|communications?$/, 'bulle', "Échanger avec la communauté"],
    [/liste des partenaires/, 'groupe', "Retrouver vos partenaires"],
    [/partenariats?/, 'lien', "Gérer vos partenaires et collaborations"],
    [/mon agenda/, 'calendrier', "Organiser vos rendez-vous et événements"],
    [/reseau pro/, 'reseau', "Développer votre réseau professionnel"],
    [/sondages?/, 'barres', "Consulter et lancer des sondages"],
    [/evaluation de projet/, 'liste', "Déposer, suivre et évaluer vos projets"],
    [/mes projets|projets transmis/, 'dossier', "Suivre vos projets"],
    [/expansion/, 'grille', "Ajouter de nouveaux modules à votre espace"],
    [/documents?/, 'dossier', "Centraliser et partager vos documents"],
    [/initiatives? a valider/, 'valide', "Valider les initiatives de votre territoire"],
    [/initiatives? validees/, 'valide', "Consulter les initiatives validées"],
    [/identite territoriale/, 'identite', "Gérer l'identité de votre territoire"],
    [/oz |intelligence/, 'etincelle', "Analyses et aide à la décision"],
    [/observatoire/, 'globe', "Suivre les données de votre territoire"],
    [/opportunites/, 'ampoule', "Repérer des opportunités stratégiques"],
    [/consultations?/, 'liste', "Consulter les acteurs de votre territoire"],
    [/mes billets/, 'billet', "Retrouver vos billets d'événements"],
    [/demandes de devis/, 'courrier', "Suivre vos demandes de devis"],
    [/centre des tutos/, 'lecture', "Apprendre à utiliser la plateforme"],
    [/parcourir les initiatives/, 'loupe', "Découvrir les initiatives"],
    [/ma localisation/, 'repere', "Préciser votre lieu de résidence"],
    [/mes statistiques/, 'barres', "Suivre votre activité"],
    [/apparence/, 'palette', "Personnaliser l'affichage"],
    [/mes droits/, 'bouclier', "Connaître et exercer vos droits"],
    [/mon activite/, 'horloge', "Retrouver votre historique"],
    [/support technique/, 'bouee', "Contacter l'équipe technique"]
  ];

  const RE_EMOJI = /^[\s\p{Extended_Pictographic}\p{Emoji_Modifier}‍️⃣]+/u;
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').toLowerCase().trim();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (nom, taille) => '<svg class="mmc-svg" viewBox="0 0 24 24" width="' + (taille || 28) + '" height="' + (taille || 28) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONES[nom] || ICONES.grille) + '</svg>';
  const uri = nom => 'url("data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#F2C94C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONES[nom] + '</svg>') + '")';

  /* ── Feuille de style (injectée une fois). Préfixe à poids élevé : les feuilles « Nuit dorée » et design-upgrade posent
     leurs couleurs en !important sur .sidebar a. AUCUN « display » n'est posé sur les liens : le tableau de bord masque
     certains modules (display:none en ligne ou !important) et doit pouvoir continuer à le faire. ───────────────────────── */
  function injecterCss() {
    if (document.getElementById('mmc-css')) return;
    const P = 'html body .sidebar.mmc:not(#mmc-x)';
    const st = document.createElement('style'); st.id = 'mmc-css';
    st.textContent = [
      /* Pages sans la feuille de base du tiroir (styles.v2.css : agenda, profil…) — le menu ouvert « sur place » s'y affichait en bas de page,
         non positionné (bug réel constaté 2026-11-06). Posé seulement quand le tiroir n'est pas déjà positionné (voir monter()). */
      P + '.mmc-autonome{position:fixed;top:0;left:0;bottom:0;width:min(380px,100%);height:100dvh;overflow-y:auto;overflow-x:hidden;z-index:200;transform:translateX(-100%);transition:transform .3s cubic-bezier(.4,0,.2,1)}',
      P + '.mmc-autonome.open{transform:translateX(0)}',
      'html body .sidebar-backdrop.open:not(#mmc-x){position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:199;display:block}',
      /* Panneau */
      P + '{background:#0B2240!important;padding-top:0!important;padding-left:14px!important;padding-right:14px!important;border:1px solid rgba(232,185,35,.55)!important;box-shadow:0 0 0 1px rgba(232,185,35,.12),6px 0 30px rgba(0,0,0,.45)!important;scrollbar-color:rgba(232,185,35,.45) transparent}',
      '@media (min-width:1024px){' + P + '{width:380px!important;border-radius:0 18px 18px 0}}',
      '@media (max-width:1023px){' + P + '{border-width:0 0 0 0!important}}',
      /* En-tête : titre, croix, recherche, onglets */
      P + ' .sb-sticky-header{margin:0 -14px 10px!important;padding:18px 14px 10px!important;background:#0B2240!important;border-bottom:1px solid rgba(232,185,35,.18)}',
      P + ' .brand{display:block!important;position:relative;margin:0 0 14px!important;padding:2px 52px 0 40px!important;min-height:30px;line-height:28px;font-size:20px!important;font-weight:800!important;color:#fff!important;text-transform:lowercase;letter-spacing:0}',
      P + ' .brand::first-letter{text-transform:uppercase}',
      P + ' .brand::before{content:"";position:absolute;left:0;top:1px;width:28px;height:28px;background:' + uri('couches') + ' center/contain no-repeat}',
      P + ' .sidebar-close{position:absolute!important;top:14px!important;right:14px!important;margin:0!important;width:36px!important;height:36px!important;min-height:0!important;padding:0!important;border-radius:50%!important;border:1.5px solid rgba(232,185,35,.75)!important;background:transparent!important;color:#F2C94C!important;display:flex!important;align-items:center;justify-content:center;cursor:pointer;z-index:30}',
      P + ' .sidebar-close:hover{background:rgba(232,185,35,.16)!important}',
      P + ' .sidebar-close:focus-visible,' + P + ' .mmc-tab:focus-visible,' + P + ' a.mmc-carte:focus-visible,' + P + ' .module-aide-btn:focus-visible{outline:2px solid #fff!important;outline-offset:2px}',
      P + ' .sb-search-wrap{padding:0 0 12px!important}',
      P + ' #sb-search-input{background-color:rgba(255,255,255,.06)!important;background-image:' + uri('loupe') + '!important;background-repeat:no-repeat!important;background-position:14px 50%!important;background-size:18px!important;color:#fff!important;border:1px solid rgba(232,185,35,.5)!important;border-radius:12px!important;padding:12px 14px 12px 44px!important;min-height:46px;font-size:15px!important;font-weight:500!important}',
      P + ' #sb-search-input::placeholder{color:rgba(255,255,255,.62)!important}',
      P + ' #sb-search-input:focus{outline:2px solid #F2C94C!important;outline-offset:1px}',
      P + ' .mmc-tabs{display:flex;gap:4px;padding:4px;margin:0 0 2px;border:1px solid rgba(232,185,35,.4);border-radius:12px;background:rgba(255,255,255,.04)}',
      P + ' .mmc-tab{flex:1 1 0;min-width:0;min-height:44px;padding:6px 4px;border:0;border-radius:9px;background:transparent;color:rgba(255,255,255,.8);font:700 13px/1.15 inherit;font-family:inherit;text-align:center;cursor:pointer;transition:background .2s,color .2s}',
      P + ' .mmc-tab:hover{background:rgba(232,185,35,.14);color:#fff}',
      P + ' .mmc-tab[aria-selected="true"]{background:linear-gradient(135deg,#F6C453,#C99A1E);color:#1f1500}',
      /* Onglets : on masque seulement, rien n'est déplacé */
      P + '[data-mmc-tab="premium"] a[data-mmc-niv="standard"],' + P + '[data-mmc-tab="standard"] a[data-mmc-niv="premium"]{display:none!important}',
      P + '[data-mmc-tab="premium"] .sb-group-lbl[data-mmc-niv],' + P + '[data-mmc-tab="standard"] .sb-group-lbl[data-mmc-niv="premium"]{display:none!important}',
      /* Mode « catégories » (tiroir Administrateur : data-mmc-cats) : les onglets sont des catégories, un lien d'une autre catégorie est masqué
         (classe posée par choisir()), et les anciens titres de groupe n'ont plus de sens. Un lien sans catégorie reste visible partout. */
      P + ' a.mmc-hors{display:none!important}',
      P + '[data-mmc-cats] .sb-group-lbl[data-mmc-niv]{display:none!important}',
      /* En-tête en colonne : titre, recherche, onglets, puis les boutons « Partager / Télécharger » (insérés plus tard par app.js, au même endroit que la recherche) */
      P + ' .sb-sticky-header{display:flex!important;flex-direction:column}',
      P + ' .sb-sticky-header>.brand{order:1}' + P + ' .sb-sticky-header>.sb-search-wrap{order:2}' + P + ' .sb-sticky-header>.mmc-tabs{order:3}' + P + ' .sb-sticky-header>.sb-install-group{order:4}' + P + ' .sb-sticky-header>.sb-bandeau-group{order:5}',
      P + ' .sb-install-group{display:flex;gap:6px;margin:8px 0 12px}',
      /* Liens de pied (Support technique, Déconnexion) : pas de display posé ici — le tableau de bord peut les masquer */
      P + ' a.mmc-pied{justify-content:center;min-height:48px;margin:10px 0 6px!important;padding:10px 14px!important;border-radius:14px!important;border:1px solid rgba(232,185,35,.5)!important;background:transparent!important;color:#F2C94C!important;font-size:14px!important;font-weight:700!important;text-decoration:none!important}',
      P + ' a.mmc-pied.mmc-sortie{border-color:rgba(255,140,140,.55)!important;color:#FFB4B4!important}',
      P + ' .sb-install-group a{flex:1 1 0;min-width:0;justify-content:center;gap:7px;font-size:12.5px;font-weight:800}',
      P + ' .mmc-ico-mini{flex:none;display:inline-flex;align-items:center}',
      P + ' .sb-reorder-toggle{display:block!important;width:100%!important;margin:12px 0 6px!important;min-height:44px;border-radius:12px!important;border:1px dashed rgba(232,185,35,.5)!important;background:transparent!important;color:rgba(255,255,255,.8)!important;font-weight:700!important;cursor:pointer}',
      /* La cartouche dorée à couronne (sidebar-premium-cadre.js) est remplacée par les cartes dorées elles-mêmes */
      P + ' .sbp-cadre{display:none!important}',
      /* Titres de groupe */
      P + ' .sb-group-lbl[data-mmc-niv]{margin:18px 4px 8px!important;padding:0!important;font-size:11px!important;font-weight:800!important;letter-spacing:.16em!important;color:#F2C94C!important;opacity:.9}',
      /* Carte */
      P + ' a.mmc-carte{position:relative;align-items:center;gap:14px;min-height:68px;margin:0 0 10px!important;padding:12px 14px!important;border-radius:16px!important;border:1px solid rgba(232,185,35,.38)!important;background:linear-gradient(135deg,#17406f,#0F3059)!important;color:#fff!important;font-size:15px!important;font-weight:800!important;line-height:1.25;text-decoration:none;transition:transform .18s,filter .18s,box-shadow .18s}',
      P + ' a.mmc-carte:hover{filter:brightness(1.1);transform:translateY(-1px)}',
      P + ' a.mmc-carte.active{box-shadow:0 0 0 2px #0B2240,0 0 0 4px #F2C94C!important}',
      P + ' a.mmc-carte[data-mmc-niv="premium"]:not(.accred-lien){background:linear-gradient(135deg,#F6C453 0%,#DDA830 55%,#BC8814 100%)!important;border-color:rgba(255,243,191,.7)!important;color:#1f1500!important;box-shadow:0 4px 14px rgba(0,0,0,.28)}',
      P + ' a.mmc-carte[data-mmc-niv="premium"]:not(.accred-lien):hover{filter:brightness(1.06)}',
      P + ' a.mmc-carte[data-mmc-niv="premium"]:not(.accred-lien).active{box-shadow:0 0 0 2px #0B2240,0 0 0 4px #fff!important}',
      P + ' .mmc-ico{position:relative;flex:none;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;color:#F2C94C;background:rgba(255,255,255,.06)}',
      P + ' a.mmc-carte[data-mmc-niv="premium"]:not(.accred-lien) .mmc-ico{color:#10294a;background:rgba(255,255,255,.22)}',
      P + ' .mmc-svg{display:block}',
      P + ' a.mmc-verrou .mmc-ico::after{content:"";position:absolute;right:-5px;bottom:-5px;width:18px;height:18px;border-radius:50%;border:1px solid #F2C94C;background:#0B2240 ' + uri('cadenas') + ' center/10px no-repeat}',
      P + ' .mmc-txt{flex:1 1 auto;min-width:0;display:block}',
      P + ' .mmc-titre{display:block;font-size:15px;font-weight:800;overflow-wrap:anywhere}',
      P + ' .mmc-desc{display:block;margin-top:3px;font-size:12px;font-weight:500;line-height:1.35;opacity:.86;overflow-wrap:anywhere}',
      P + ' a.mmc-carte[data-mmc-niv="premium"]:not(.accred-lien) .mmc-desc{color:#2b1d00;opacity:1}',
      P + ' a.mmc-carte .pill{flex:none;margin-left:6px!important}',
      P + ' .module-aide-btn{flex:none!important;width:30px!important;height:30px!important;margin-left:6px!important;border-radius:50%!important;font-size:15px!important;font-weight:800!important;background:#F2C94C!important;color:#0B2240!important;box-shadow:none!important}',
      P + ' a.mmc-carte[data-mmc-niv="premium"]:not(.accred-lien) .module-aide-btn{background:#6b4a06!important;color:#FFE9A8!important}',
      P + ' .module-aide-btn:hover{filter:brightness(1.15)}',
      P + ' .sb-drag-handle{position:absolute;left:3px;top:50%;transform:translateY(-50%);margin:0!important}',
      '@media (prefers-reduced-motion:reduce){' + P + ' a.mmc-carte,' + P + ' .mmc-tab{transition:none}' + P + ' a.mmc-carte:hover{transform:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ── Un lien de module → carte ──────────────────────────────────────────────────────────────────────────────────────── */
  function sansEmoji(noeud) {
    // Retire l'émoji de tête d'un nœud texte ; renvoie le texte restant.
    const v = noeud.nodeValue || '';
    const n = v.replace(RE_EMOJI, '');
    if (n !== v) noeud.nodeValue = n;
    return n;
  }
  function exclu(a) {
    if (a.id === 'sidebar-close' || a.id === 'da-sidebar-logout') return true;
    if (a.classList.contains('sb-standalone') || a.classList.contains('assist-hub-hidden')) return true;
    if (a.closest('.sb-bandeau-group,.sb-install-group,.sb-search-wrap,.sb-search-results,.sbp-cadre')) return true;
    return /d[eé]connexion/i.test(a.textContent || '');
  }
  function decorerLien(a, niveau) {
    a.dataset.mmcNiv = niveau;
    const deja = a.querySelector(':scope > .mmc-txt');
    // Texte direct restant (ex. « 🔒 » ajouté ensuite par le tableau de bord) : on retire l'émoji, on garde l'état « verrouillé ».
    const directs = Array.from(a.childNodes).filter(n => n.nodeType === 3);
    if (deja) {
      directs.forEach(n => {
        if (/\u{1F512}/u.test(n.nodeValue || '')) a.classList.add('mmc-verrou');
        if (!sansEmoji(n).trim()) n.remove();
      });
      return;
    }
    const brut = directs.map(n => n.nodeValue).join(' ');
    if (/\u{1F512}/u.test(brut)) a.classList.add('mmc-verrou');
    const titre = brut.replace(/[\s\p{Extended_Pictographic}\p{Emoji_Modifier}‍️⃣]+/gu, ' ').replace(/\s+/g, ' ').trim()
      || brut.replace(RE_EMOJI, '').replace(/\s+/g, ' ').trim();
    if (!titre) return; // lien sans libellé direct : on n'y touche pas
    // Titre débarrassé de tout émoji (un émoji au milieu d'un libellé est rare ; seuls ceux de tête sont retirés, comme avant).
    const propre = directs.map(n => n.nodeValue).join(' ').replace(RE_EMOJI, '').replace(/\s+/g, ' ').trim() || titre;
    directs.forEach(n => n.remove());
    const cle = norm(propre);
    const regle = REGLES.find(r => r[0].test(cle));
    // Une page peut imposer icône et description d'un module (data-mmc-icone / data-mmc-desc) : le tiroir Administrateur le fait,
    // ses modules n'ont pas le même sens que ceux des autres comptes (ex. « Formations » = créer, pas suivre).
    const nomIcone = a.dataset.mmcIcone || (regle ? regle[1] : 'grille');
    const desc = a.dataset.mmcDesc || (regle && regle[2]) || '';
    const ico = document.createElement('span'); ico.className = 'mmc-ico'; ico.innerHTML = svg(nomIcone);
    const txt = document.createElement('span'); txt.className = 'mmc-txt';
    txt.innerHTML = '<span class="mmc-titre">' + esc(propre) + '</span>' + (desc ? '<span class="mmc-desc">' + esc(desc) + '</span>' : '');
    const poignee = a.querySelector(':scope > .sb-drag-handle');
    const ref = poignee ? poignee.nextSibling : a.firstChild;
    a.insertBefore(txt, ref);
    a.insertBefore(ico, txt);
    a.classList.add('mmc-carte');
  }

  /* ── Menu entier ───────────────────────────────────────────────────────────────────────────────────────────────────── */
  function parcourir(sb) {
    let niveau = 'standard', premium = 0, standard = 0;
    sb.querySelectorAll('.sb-group-lbl, a').forEach(el => {
      if (el.classList.contains('sb-group-lbl')) {
        if (el.closest('.sb-bandeau-group,.sb-install-group')) return;
        niveau = /premium/i.test(el.textContent) ? 'premium' : 'standard';
        el.dataset.mmcNiv = niveau;
        Array.from(el.childNodes).filter(n => n.nodeType === 3).forEach(sansEmoji);
        return;
      }
      if (exclu(el)) return;
      decorerLien(el, niveau);
      if (el.classList.contains('mmc-carte')) { if (niveau === 'premium') premium++; else standard++; }
    });
    return { premium, standard };
  }

  /* Boutons d'action du menu (pas des modules) : mêmes règles — aucun émoji, icône SVG à la place ; « Réorganiser » descend en pied de liste. */
  function actions(sb) {
    sb.querySelectorAll('.sb-install-group a, .sb-bandeau-group a, .sb-bandeau-group .sb-group-lbl').forEach(el => {
      Array.from(el.childNodes).filter(n => n.nodeType === 3).forEach(sansEmoji);
    });
    [['sb-partage', 'partage'], ['sb-install', 'telecharger']].forEach(([id, nom]) => {
      const a = sb.querySelector('#' + id);
      if (a && !a.querySelector('.mmc-ico-mini')) {
        const s = document.createElement('span'); s.className = 'mmc-ico-mini'; s.innerHTML = svg(nom, 18);
        a.insertBefore(s, a.firstChild);
      }
    });
    // Liens de pied (Support technique, Déconnexion) : pas des modules, mais ils portaient eux aussi un émoji → icône SVG.
    sb.querySelectorAll('a').forEach(a => {
      if (a.closest('.sb-bandeau-group,.sb-install-group,.sb-search-wrap,.sb-search-results,.sbp-cadre') || a.id === 'sidebar-close') return;
      if (a.classList.contains('mmc-carte') || a.querySelector('.mmc-ico-mini')) return;
      const sortie = /d[eé]connexion/i.test(a.textContent || ''), support = a.classList.contains('sb-standalone') || /support technique/i.test(a.textContent || '');
      if (!sortie && !support) return;
      Array.from(a.childNodes).filter(n => n.nodeType === 3).forEach(sansEmoji);
      a.classList.add('mmc-pied'); if (sortie) a.classList.add('mmc-sortie');
      const s = document.createElement('span'); s.className = 'mmc-ico-mini'; s.style.marginRight = '8px'; s.innerHTML = svg(sortie ? 'sortie' : 'bouee', 18);
      const poignee = a.querySelector(':scope > .sb-drag-handle');
      a.insertBefore(s, poignee ? poignee.nextSibling : a.firstChild);
    });
    // Pied de liste : « Réorganiser » puis (téléphone seulement) le groupe « Bandeau » (Messages, Notifications, langue). Ni l'un ni
    // l'autre n'a à occuper l'en-tête collant — sur téléphone il dépassait la moitié de l'écran.
    const pied = sb.querySelector('a.sb-standalone, #da-sidebar-logout');
    const poser = el => { if (pied && pied.parentNode) pied.parentNode.insertBefore(el, pied); else sb.appendChild(el); };
    const rb = sb.querySelector('.sb-reorder-toggle');
    if (rb && !rb.dataset.mmcPlace) { rb.dataset.mmcPlace = '1'; poser(rb); }
    const bd = sb.querySelector('.sb-bandeau-group');
    if (bd && !bd.dataset.mmcPlace) { bd.dataset.mmcPlace = '1'; poser(bd); }
  }

  function monter(sb) {
    if (!sb || sb.nodeType !== 1) return;
    injecterCss();
    sb.classList.add('mmc');
    if (getComputedStyle(sb).position === 'static') sb.classList.add('mmc-autonome');
    // En-tête collant : le vrai tiroir en a un ; le menu ouvert « sur place » n'a que des enfants à plat → on le fabrique.
    let entete = sb.querySelector('.sb-sticky-header');
    if (!entete) {
      entete = document.createElement('div'); entete.className = 'sb-sticky-header';
      entete.style.cssText = 'position:sticky;top:0;z-index:20;';
      sb.insertBefore(entete, sb.firstChild);
      ['.sidebar-close', '.brand', '.sb-search-wrap'].forEach(s => { const e = sb.querySelector(s); if (e && e.parentNode === sb) entete.appendChild(e); });
    }
    // Croix en SVG (le × texte n'a pas la finesse de la maquette) ; le libellé d'accessibilité reste.
    const croix = sb.querySelector('.sidebar-close');
    if (croix && !croix.querySelector('svg')) {
      croix.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      if (!croix.getAttribute('aria-label')) croix.setAttribute('aria-label', 'Fermer le menu des modules');
    }
    const champ = sb.querySelector('#sb-search-input');
    if (champ) { champ.placeholder = 'Rechercher un module...'; champ.setAttribute('aria-label', 'Rechercher un module'); }

    const n = parcourir(sb);
    actions(sb);

    // Onglets : Standard / Premium / Tous (seulement s'il y a des modules des deux niveaux) — ou, si la page déclare data-mmc-cats
    // (JSON [[clé, libellé], …]), ses propres catégories (tiroir Administrateur : Analyse, Demandes, Création, Modération).
    let onglets = sb.querySelector('.mmc-tabs');
    const cats = categories(sb);
    if (cats || (n.premium && n.standard)) {
      if (!onglets) {
        onglets = document.createElement('div'); onglets.className = 'mmc-tabs'; onglets.setAttribute('role', 'tablist'); onglets.setAttribute('aria-label', cats ? 'Catégories de modules' : 'Type de modules');
        (cats || [['standard', 'Module Standard'], ['premium', 'Module Premium'], ['tous', 'Tous les modules']]).forEach(([cle, lib]) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'mmc-tab'; b.dataset.tab = cle; b.setAttribute('role', 'tab'); b.textContent = lib;
          b.addEventListener('click', () => choisir(sb, cle, true));
          onglets.appendChild(b);
        });
        const recherche = entete.querySelector('.sb-search-wrap');
        if (recherche && recherche.parentNode === entete) recherche.insertAdjacentElement('afterend', onglets);
        else entete.appendChild(onglets);
        let memo = null; try { memo = localStorage.getItem(cleMemo(sb)); } catch (e) { /* mémoire indisponible */ }
        const permis = cats ? cats.map(c => c[0]) : ['standard', 'premium', 'tous'];
        choisir(sb, permis.includes(memo) ? memo : (cats ? cats[0][0] : 'premium'), false);
      }
      if (cats) masquerHorsCategorie(sb); // liens ajoutés/réécrits depuis : on réapplique la catégorie courante
    } else {
      if (onglets) onglets.remove();
      sb.dataset.mmcTab = 'tous';
    }

    if (!sb._mmcObs) {
      let attente = 0;
      const rejouer = () => {
        if (attente) return;
        attente = setTimeout(() => {
          attente = 0;
          sb._mmcObs.disconnect();
          try { monter(sb); } finally { sb._mmcObs.observe(sb, { childList: true, subtree: true }); }
        }, 80);
      };
      sb._mmcObs = new MutationObserver(rejouer);
      sb._mmcObs.observe(sb, { childList: true, subtree: true });
    }
  }

  /* Catégories déclarées par la page (data-mmc-cats = JSON [[clé, libellé], …]) ; null = onglets Standard/Premium habituels. */
  function categories(sb) {
    if (!sb.dataset.mmcCats) return null;
    try {
      const l = JSON.parse(sb.dataset.mmcCats);
      return Array.isArray(l) && l.length && l.every(c => Array.isArray(c) && c.length >= 2) ? l : null;
    } catch (e) { return null; }
  }
  // Mémoire d'onglet distincte en mode catégories : les clés Standard/Premium des autres comptes n'ont rien à y faire.
  function cleMemo(sb) { return sb.dataset.mmcCats ? 'da_mmc_onglet_cat' : 'da_mmc_onglet'; }
  function masquerHorsCategorie(sb) {
    const cle = sb.dataset.mmcTab;
    sb.querySelectorAll('a.mmc-carte').forEach(a => { a.classList.toggle('mmc-hors', !!a.dataset.mmcCat && a.dataset.mmcCat !== cle); });
  }

  function choisir(sb, cle, memoriser) {
    sb.dataset.mmcTab = cle;
    sb.querySelectorAll('.mmc-tab').forEach(b => { const on = b.dataset.tab === cle; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    if (categories(sb)) masquerHorsCategorie(sb);
    if (memoriser) {
      try { localStorage.setItem(cleMemo(sb), cle); } catch (e) { /* mémoire indisponible */ }
      sb.scrollTop = 0;
    }
  }

  window.menuModulesCartes = monter;

  // Tiroir du tableau de bord : on s'y monte seul (le menu ouvert « sur place » est monté par app.js)
  function auto() {
    document.querySelectorAll('aside.sidebar[data-full-menu]').forEach(monter);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
  window.addEventListener('load', () => setTimeout(auto, 400));
})();
