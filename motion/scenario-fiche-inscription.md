# Tuto « Créer une fiche d'inscription » — version « vente » (≈ 55 s, 1 minute maximum)

**Demande (2026-10-24) :** « un tuto de comment on fait une fiche d'inscription, et vends cette fonction très intéressante ». Le film montre donc les 3 étapes de création ET met en avant ce que la fonction apporte (gratuit / payant, places et liste d'attente, formulaire sur mesure, lien public, QR code, présences, finances, compte-rendu). Même style que les autres films (nuit + or, voix Perle, musique douce, sous-titres mot à mot).

**Statut (2026-10-25) :** RÉALISÉ. Voix Perle en une prise (57,28 s, accélérée de 6 % → 54 s, `assets/media/fiche-inscription-voix.mp3`), film de 57 s (6e film du moteur `assets/inscription-film.js`, version `fiche`), vignette `film-fiche-poster.jpg`, entrée « Vidéos Tuto » (catégorie « Événements »). Chaque étape de gestion est expliquée en quelques secondes. Écrans = maquettes HTML fictives. Texte final : voir le fichier de voix / la transcription ; ce scénario garde la première version du texte.

## 1. Données sensibles : tout est remplacé par des données fictives

Les captures montrent de vrais comptes, de vraies fiches et l'environnement du navigateur (onglets, favoris) : rien n'est repris. Les écrans sont des maquettes HTML fidèles au module, avec :

| Sur vos captures (réel) | Dans le film (fictif) |
|---|---|
| ZADI · Initiative (barre du haut) | **Kofi Mensah · Initiative** (Association Horizon Afrique) |
| Fiches « Contribuer à la vision », « Acte Fondateur » | **« Gala annuel »**, **« Journée portes ouvertes »** |
| Fiche créée « teste 1 », lien `…?slug=teste-1`, type « participants » | **« Gala annuel 2027 »**, `…?slug=gala-annuel-2027`, type « Participant » |
| Fiches reçues de « Moov To Learn International » | reçues de **« Académie Savoir Plus »** |
| Affiches et photos de personnes | couvertures illustrées neutres, sans visage ni marque |
| Onglets, favoris, extensions du navigateur | jamais montrés |

## 2. Texte de la voix (≈ 135 mots, voix Perle, ≈ 52 s) — création, liaison, création de l'événement, publication, puis survol des 14 étapes

> Organiser un événement, c'est une chose. Gérer ses inscriptions, c'en est une autre. Avec la fiche d'inscription de Diaspo'Actif, tout se règle au même endroit, en quatorze étapes.
>
> Ouvrez « Formulaires de réponse et d'inscription », puis créez votre fiche. **Un :** la vue d'ensemble. **Deux :** vos types d'inscription, gratuits ou payants. **Trois :** votre formulaire sur mesure.
>
> Reliez ensuite la fiche à un événement. Pas encore d'événement ? Créez-le d'ici : titre, date, adresse, description, puis publiez. Votre fiche est publiée en même temps, et le bouton « S'inscrire » mène directement vers elle.
>
> **Quatre :** candidature. **Cinq :** traitement. **Six :** validation. **Sept :** aperçu public. **Huit :** programme. **Neuf :** communication. **Dix :** contrôle QR. **Onze :** présences. **Douze :** finances. **Treize :** gestion. **Quatorze :** historique.
>
> Une fiche, un lien, plus de tableurs. **Créez la vôtre dès maintenant.**

**Fondé sur le fonctionnement réel :** dès qu'une fiche est liée à un événement, elle sort automatiquement du brouillon et passe en « Publiée » (règle du serveur) ; l'événement se crée depuis l'étape « Liaison à un événement » (« + Créer un nouvel événement ») puis se publie avec « Confirmer et publier ».

**Durée visée : 55 s au total (voix ≈ 52 s au plus + ouverture + fin), donc moins d'une minute.** Si la voix dépasse 54 s, je resserre le texte avant de monter le film.

## 3. Découpage image — « bien rodé » : chaque écran s'allume au mot de la voix (temps recalés sur la transcription horodatée)

| # | Temps | Voix | Écran |
|---|-------|------|-------|
| 1 | 0:00–0:11 | Accroche, « quatorze étapes » | Titre « La fiche d'inscription » ; une pile d'inscriptions éparpillées qui se range en une fiche ; la barre des 14 étapes apparaît |
| 2 | 0:11–0:22 | Menu, création, étapes 1, 2, 3 | Menu des modules : « Formulaires de réponse et d'inscription » s'illumine ; « + Créer une fiche d'inscription », nom « Gala annuel 2027 » ; 1 : vue d'ensemble ; 2 : type « Participant », payant 20 € ; 3 : champs du formulaire |
| 3 | 0:22–0:35 | Liaison, création de l'événement, publication | Cadre violet « Liaison à un événement » → « + Créer un nouvel événement » ; formulaire de l'événement (titre, date, adresse, description) se remplit ; « Confirmer et publier » ; la pastille de la fiche passe de « Brouillon » à « Publiée » ; l'aperçu public avec le bouton « S'inscrire » |
| 4 | 0:35–0:47 | Étapes 4 à 14 | La barre des 14 étapes se parcourt de gauche à droite, une vignette par étape (Candidature, Traitement, Validation, Aperçu public, Programme, Communication, Contrôle QR, Présences, Finances, Gestion, Historique), chacune éclairée exactement au mot cité |
| 5 | 0:47–0:54 | Conclusion | « Une fiche, un lien » : logo, bouton « Créer ma fiche » ; « Créez la vôtre dès maintenant » |

## 4. Fonctions vues sur les captures, utilisables pour « vendre »

- **Création guidée en 3 étapes**, brouillon enregistrable à tout moment, **aperçu exactement tel que le verra un visiteur**.
- **Types d'inscription** gratuits ou payants, tarif, places, **liste d'attente**, **validation automatique ou manuelle**, période d'inscription propre à chaque type.
- **Formulaire sur mesure** : catégories (Identité, Contact, Profession, Diaspora, Événement, Médias, Personnalisé), **options payantes, sondage, candidature, liens utiles, commentaire libre, dons/cagnotte**.
- **Lien public** à copier, **lien de parrainage** pour les visiteurs sans compte, **liaison à un événement** (le bouton « S'inscrire » pointe vers la fiche).
- **Gestion après création (14 étapes)** : Candidature, Traitement des candidatures, Validation, Aperçu public, Programme (déroulé + pièce jointe, pré-remplit le compte-rendu), Communication, **Contrôle QR**, **Présences**, **Finances**, Gestion d'inscription, Historique.
- **Outils de confort** : Dupliquer, **Importer des inscrits**, Appliquer comme modèle standard, **partage d'une fiche entre organisateurs**, partenaires & sponsors par défaut.

## 5. Réalisation prévue

- **Images :** maquettes HTML (cadre d'écran d'ordinateur comme le tuto flash), données fictives, halos dorés, pastilles d'explication.
- **Voix :** Perle, **une seule prise** (≈ 700 crédits), puis transcription horodatée gratuite pour caler les écrans.
- **Intégration (après votre validation sur le lien) :** film du moteur `assets/inscription-film.js`, entrée « Vidéos Tuto » (catégorie « Événements »).

## 6. Points à valider

1. Le texte de la voix (ton « vente », promesses citées : paiements en ligne, liste d'attente, QR code, présences, finances).
2. Les noms fictifs.
3. Titre proposé : « Créer une fiche d'inscription : tout gérer au même endroit ».

## Remarque de relecture (hors tuto)

Pour ajouter un type d'inscription, le module ouvre des boîtes du navigateur (« diaspoactif.com indique : Nom du type d'inscription… », « Prix en euros ») : peu soignées. Dans le film je montrerais une vraie fenêtre ; je peux aussi remplacer ces boîtes dans le module si vous le souhaitez.
