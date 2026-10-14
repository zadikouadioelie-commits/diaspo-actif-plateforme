# Tuto « Diaspo'Actif sur téléphone — compte Initiative » — première proposition (≈ 55 s)

**But :** montrer en moins d'une minute ce qu'une initiative voit et peut faire depuis l'application Diaspo'Actif sur son téléphone : les boutons rapides du haut, les tutoriels, le menu des modules (dont les modules Premium), le changement de compte, les notifications, les messages et la barre d'onglets du bas. Même style que les autres films (nuit + or, voix Perle, musique douce, sous-titres mot à mot).

**Statut (2026-10-14) :** RÉALISÉ. Texte validé, voix Perle prise 1 (39,5 s, `assets/media/telephone-initiative-voix.mp3`), film de 43 s (4e film du moteur `assets/inscription-film.js`, version `telephone`), vignette `film-telephone-poster.jpg`, entrée « Vidéos Tuto » (catégorie « Bien démarrer »). Les écrans du téléphone sont des maquettes HTML fidèles à l'application, construites avec des données 100 % fictives (aucune capture réelle).

## 1. Données sensibles : tout est remplacé par des données fictives

Les captures reçues montrent de vrais comptes : elles ne seront JAMAIS utilisées telles quelles. Le film est tourné sur l'application réelle, avec un **compte de démonstration** (données fictives), et chaque nom ci-dessous est remplacé avant l'enregistrement.

| Sur vos captures (réel) | Dans le film (fictif) |
|---|---|
| Diaspo'Actif Officiel (initiative, logo) | **Association Horizon Afrique** (logo neutre) |
| Ondet ZADI (responsable / utilisateur / « Ondet Ondet ») | **Kofi Mensah** |
| Anaëlle ZADI | **Awa Diallo** |
| Admin Administrateur | **Admin Démo** |
| Deborah NIABA | **Mariam Traoré** |
| AM XPERTIVES | **Atelier Soleil** |
| LEQUIPE iT | **Collectif Baobab** |
| Moov To Learn International | **Académie Savoir Plus** |
| Fiches « INSCRIPTION », « TROPHEE NGOVU » | **« Gala annuel »**, **« Trophée du mérite »** |
| Photos de profil des personnes | silhouettes / initiales neutres |

Aussi masqués : adresses e-mail, numéros de téléphone, montants réels, photos de visages, et le bandeau « TEST PRIVÉ » de l'environnement local. Les tutoriels vidéo et l'interface (boutons, menus) sont publics : ils restent tels quels.

## 2. Texte de la voix (≈ 105 mots, voix Perle)

> Voici Diaspo'Actif sur votre téléphone, avec un compte Initiative.
>
> **En haut**, quatre boutons rapides : le menu doré, pour tous vos modules ; le changement de compte ; le panier ; et la cloche des notifications.
>
> **À l'accueil**, des tutoriels vidéo pour apprendre en quelques minutes.
>
> **Dans le menu**, vos modules Premium brillent en or : événements, cotisations, boutique, cagnottes, business plans. En dessous, vos outils, et votre compte.
>
> **Besoin d'un autre compte ?** Un geste, et vous basculez.
>
> **Notifications et messages** : tout est regroupé, classiques ou automatiques.
>
> **Et en bas**, sept onglets pour aller à l'essentiel.
>
> Diaspo'Actif : votre initiative, dans votre poche.

## 3. Découpage image (temps indicatifs, recalés sur la voix réelle)

| # | Temps | Voix | Écran (application réelle, compte de démonstration) |
|---|-------|------|-----------------------------------------------------|
| 1 | 0:00–0:05 | Introduction | Titre « Diaspo'Actif sur téléphone · compte Initiative » ; le téléphone entre à l'écran sur l'accueil |
| 2 | 0:05–0:15 | Quatre boutons rapides | Barre du haut : un halo doré passe successivement sur **Menu**, **⇄ changer de compte**, **🛒 panier**, **🔔 cloche** ; une pastille de texte accompagne chaque bouton |
| 3 | 0:15–0:21 | Accueil et tutoriels | Défilement doux : carte « Tutoriels vidéo », vignettes, durée, bouton Partager |
| 4 | 0:21–0:33 | Menu des modules | Ouverture du menu : le groupe **MODULES PREMIUM** en or (couronnes), puis défilement vers « Outils » et « Mon compte » |
| 5 | 0:33–0:38 | Changer de compte | La feuille « Changer de compte » : Association Horizon Afrique (Actif), deux comptes utilisateur, bouton « Basculer » en surbrillance |
| 6 | 0:38–0:45 | Notifications et messages | Liste des notifications (données fictives), puis Messages avec les onglets « Classiques / Automatiques » |
| 7 | 0:45–0:51 | Barre d'onglets | Les 7 onglets s'allument tour à tour : Accueil, Événements, Annuaire, Messages, Boutiques, Moi, Actualités |
| 8 | 0:51–0:56 | Conclusion | Logo Diaspo'Actif + « Votre initiative, dans votre poche » + bouton « Découvrir l'application » |

## 4. Réalisation prévue

- **Images :** enregistrées sur la vraie application (m.html) en 390 × 800, avec le compte de démonstration ; les noms sont remplacés avant chaque prise (voir tableau), le bandeau de test est masqué. Les écrans sont ensuite mis en scène dans le même moteur que les autres films (`assets/inscription-film.js`, écran = fonction du temps de la voix) : cadre de téléphone, halos dorés, pastilles d'explication, sous-titres.
- **Voix :** Perle (ElevenLabs, eleven_v4), puis transcription horodatée (Scribe, gratuite) pour caler chaque écran sur les mots.
- **Intégration (après validation) :** une vidéo de la rubrique « Vidéos Tuto » (type film, catégorie « Bien démarrer »), carte sur l'accueil et dans l'actualité, comme les trois films précédents.
- **Variante possible :** une version courte de 30 s (étapes 2, 4 et 7 seulement) pour le partage sur WhatsApp.

## 5. Points à valider

1. Le texte de la voix et l'ordre des écrans.
2. Les noms fictifs du tableau (ou d'autres noms à votre goût).
3. Titre du film et catégorie (« Bien démarrer » proposé).
