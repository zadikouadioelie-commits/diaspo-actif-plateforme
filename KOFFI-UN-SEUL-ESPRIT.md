# Koffi — un seul esprit (étape 2) · plan de préparation

*Rédigé le 1er novembre 2026. Rien de ce document n'est encore construit : c'est le plan, vérifié contre le code actuel. L'étape 1 (règle de compréhension commune + carte « même Koffi partout ») est livrée (commit `939790d`).*

## 1. Le constat (chiffres relevés dans le code)

Aujourd'hui Koffi est **sept programmes jumeaux** qui se ressemblent beaucoup :

| Koffi | Fichier serveur | Fichier écran | Lignes (serveur) |
|---|---|---|---|
| Tuteur (cours) | `kofi.js` | `koffi-widget.js` | 1 003 |
| Assistant du formateur | `kofi-createur.js` | `koffi-createur.js` | 747 |
| Conseiller Annuaire | `kofi-annuaire.js` | `koffi-annuaire.js` | 545 |
| Guide des événements (+ flash) | `kofi-evenements.js` | `koffi-evenements.js` | 529 |
| Assistant administrateur | `kofi-admin.js` | `koffi-admin.js` | 554 |
| Interlocuteur Business Plan | `kofi-businessplan.js` | `koffi-businessplan.js` | 371 |
| Guide de navigation | `kofi-navigation.js` | `koffi-navigation.js` | 230 |

Chacun recopie **la même chaîne de traitement** d'un message : connexion → limite de vitesse → majorité/pays → longueur → plafond du jour → ouverture de conversation → questions gratuites → crédit → historique → appel IA → refus/illisible → enregistrement → débit. Relevé : **7 appels IA**, **14 limiteurs de vitesse**, **7 réglages de longueur de message**, **8 plafonds quotidiens**, **une vingtaine de catégories de comptabilité** (`xxx_mensuel`, `xxx_achat`, `xxx_illimite`, `xxx_offert`, `xxx_refus`, `xxx_illisible`).

Conséquences réelles : chaque amélioration (comme l'étape 1) doit être refaite sept fois ; un oubli crée un Koffi « moins intelligent » que les autres ; le même bug d'argent ou de droit peut exister à sept endroits.

Ce qui est **déjà commun** : le crédit unique (portefeuille), la majorité, l'IA (`kofi-ia.js`), la règle de compréhension, la carte des compétences, l'identité visuelle.

## 2. La cible

> **Un Koffi : un noyau + des compétences branchées. Le lieu (la page) décide ce qu'il peut faire ; le serveur décide toujours de ce qu'il a le droit de faire.**

```
            ┌────────────── NOYAU KOFFI (une seule fois) ──────────────┐
 personne → │ sécurité · majorité · pays · crédit · plafonds · historique │ → IA
            │ compréhension du sens · routage vers une compétence       │
            └─────┬───────┬───────┬───────┬───────┬───────┬─────────────┘
              Cours  Créer   Annuaire Événements Business  Navigation  Admin
              (tuteur) (formation)       (+ flash)  Plan
```

**Une compétence** = un petit module qui déclare seulement ce qui lui est propre :
1. où elle est disponible (pages) et **qui y a droit** (rôle, Premium, propriétaire du plan, formation achetée…) ;
2. son bloc de consignes (court) ;
3. les **actions** que le modèle peut demander (`chercher`, `flash`, `proposer_mission`…), chacune avec sa validation et son exécution **côté serveur** ;
4. comment afficher ses résultats (cartes d'événements, comptes, aperçu, tâches…).

Le modèle ne voit toujours **aucune donnée** : il renvoie des critères, le serveur cherche, calcule, vérifie les droits et affiche — comme aujourd'hui.

## 3. Décisions prises (pour avancer sans vous solliciter)

1. **Une seule voix, un seul portefeuille, une seule compréhension** — oui, partout (déjà le cas pour le crédit).
2. **Le prompt n'est jamais « tout Koffi »** : mesuré, les consignes actuelles pèsent ~1 300 jetons (Annuaire), ~2 000 (Événements), ~1 400 (Admin), ~1 250 (Business Plan), ~2 700 (Créateur). Tout réunir ferait **> 8 000 jetons par message** : plus cher et plus confus. On charge **les compétences du lieu courant + la carte des autres** (~400 jetons).
3. **Passage d'un lieu à l'autre** : si la demande relève d'une autre compétence, Koffi l'**explique et propose un bouton « Y aller »** (action `aller`). Plus tard (phase 4), les compétences **en lecture seule et non sensibles** (chercher des comptes, chercher des événements) pourront s'exécuter depuis n'importe quelle page.
4. **Les portées sensibles restent cloisonnées** : tuteur (la formation de la page, « porte fermée » des modules non achetés), Business Plan (consentement par plan), administrateur (rôle admin seul). Leur contenu n'entre **jamais** dans l'historique envoyé à l'IA depuis un autre lieu.
5. **Une conversation par « fil »** : fils ouverts (Annuaire, Événements, Navigation) fusionnés en un seul fil « Koffi » par personne ; fils à portée (cours, création, Business Plan, admin) conservés séparés. Les anciennes conversations restent lisibles.
7. **Interdits absolus (règle du propriétaire, 2026-11-01), déjà en place et à conserver dans le noyau** : Koffi n'a **jamais** accès au mot de passe, au code secret, au code de connexion multiple, ni aux **messages sécurisés** (nouveau type de message, en cours de création dans une autre session). Trois protections indépendantes (`server/kofi-interdits.js`) : (a) aucune table ni colonne de secret n'est lisible par un module Koffi — `tests/kofi-interdits.test.js` lit le code source et échoue dès qu'un module Koffi cite une table du type `*secur*`, `*secret*`, `multi_connexion`, `connexions`, `appareil*`, `token`… (les futures tables de messages sécurisés sont couvertes d'avance) ; (b) tout texte est masqué avant la base et avant l'IA (point de passage unique `IA.repondre`) ; (c) consigne dans chaque prompt. Une compétence « messages sécurisés » ne sera **jamais** ajoutée à Koffi : pas de lecture, pas de résumé, pas de recherche.
8. **Koffi ne fait jamais plus que le titulaire du compte (règle du propriétaire, 2026-11-01).** Koffi agit comme un **délégué** : il appelle les MÊMES routes que l'écran, avec la session de la personne (`appelerRoute`), donc avec exactement les mêmes droits, quotas, abonnements et contrôles. Un compte utilisateur, Initiative ou Collectivité ne peut jamais, par Koffi, faire ce que son compte ne lui permet pas. Conséquences : (a) **le Koffi de l'administrateur reste un Koffi totalement séparé** (`kofi-admin.js`, routes `/api/kofi/admin/*`, rôle vérifié côté serveur) — ce n'est **jamais** une compétence du Koffi unique, et la carte commune ne le mentionne plus ; (b) chaque compétence ordinaire exécute une **liste blanche de routes** (créer un événement, créer une fiche d'inscription, lier une fiche à un événement, rédiger/publier/programmer une publication, etc.) sous les droits de la personne ; (c) tout ce qui est publié, envoyé ou payé exige la **confirmation explicite** de la personne ; (d) interdits : secrets (point 7), paiements/achats à la place de la personne, suppression de compte, changement de rôle ou d'abonnement, et toute fonction d'administration. Garde-fou : `tests/kofi-prerogatives.test.js` (aucun prompt ordinaire ne cite l'administration, la consigne PRÉROGATIVES est partout, routes admin gardées par le rôle).
6. **Déploiement progressif et réversible** : interrupteur `KOFFI_UNIQUE` (administrateur d'abord, puis tous). Les anciens écrans/routes restent en place jusqu'à validation.

## 4. Les phases (chacune livrable seule, tests verts à chaque fin)

| Phase | Contenu | Visible pour l'utilisateur ? | Risque | Effort |
|---|---|---|---|---|
| **1. Noyau** | Extraire la chaîne commune dans `server/kofi-noyau.js` ; migrer **un module à la fois** (navigation → événements → annuaire → Business Plan → admin → créateur → tuteur), mêmes routes, mêmes réponses | Non | Moyen (argent/droits) — filet : les 12 suites de tests Koffi existantes doivent passer **sans modification** | 1 longue session |
| **2. Registre de compétences** | Chaque module devient une compétence (`droits`, `consignes`, `actions`, `rendu`) ; constructeur de prompt « lieu + carte » ; nouveau point d'entrée unique `POST /api/kofi/messages` derrière `KOFFI_UNIQUE` | Non (admin seul) | Moyen | 1 session |
| **3. Écran unique** | `assets/koffi.js` : une bulle, un panneau, des « rendus » enregistrés par compétence ; site + téléphone (`m-mod-koffi.js`) ; liste des conversations unifiée | Oui (même visage, mêmes écrans) | Faible à moyen (téléphone) | 1–2 sessions |
| **4. Compétences croisées** | `aller` + exécution inter-pages des compétences lecture seule | Oui | Faible | 1 session |
| **5. Nettoyage** | Retrait des anciennes routes/écrans, une seule section de confidentialité, mise à jour des CGU | Non | Faible | ½ session |

**Garde-fous constants** : un module par commit ; aucun push sans votre accord ; `reparerSchema()` seulement si une table change (la phase 2 peut s'en passer : le champ `contexte` existe déjà) ; relecture de `git show HEAD:fichier` avant chaque commit (dépôt partagé).

## 5. Points de vigilance (déjà repérés)

- **Comptabilité** : les écrans « Budget IA » de l'administrateur lisent les catégories `xxx_mensuel / achat / illimite / offert`. Le noyau doit **continuer à écrire les mêmes catégories** (ou on migre les lectures en même temps).
- **Réglages** : 7 réglages de longueur et 8 plafonds du jour existent dans l'administration — on les garde (une valeur par compétence), on n'en supprime aucun sans demande.
- **Fuite entre lieux** : l'historique envoyé à l'IA est filtré par lieu (point 4 ci-dessus) ; un test dédié l'impose.
- **Coût** : mesurer les jetons d'entrée par compétence avant/après ; objectif ≤ +400 jetons par message (la carte).
- **Dépôt partagé** : d'autres sessions modifient `index.js`, `m.html`, `m-mod-koffi.js` ; commits isolés par index temporaire (méthode habituelle).
- **Compréhension du tuteur** : la recherche dans le cours reste lexicale ; une réécriture sémantique de la requête (appel IA court) est un bon complément, à décider après la phase 2.

## 6. Ce que je vous propose maintenant

Je lance la **phase 1 sur le module le plus simple (navigation)** pour valider la méthode et les tests, puis j'enchaîne module par module, sans changement visible. Vous gardez la main : rien n'est poussé, et chaque module migré est un commit séparé, annulable.

*Questions de fond (j'ai tranché par défaut, dites-moi si vous voulez autre chose)* : (a) historique partagé entre lieux → **non** par défaut (cloisonné) ; (b) un seul fil ouvert « Koffi » pour Annuaire/Événements/Navigation → **oui** ; (c) exécution inter-pages → **lecture seule d'abord**.
