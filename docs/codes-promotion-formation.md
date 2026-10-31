# Codes de promotion générés en un clic (Formation Diaspora)

Ajouté le 2026-10-31. Complète les coupons saisis à la main (lot B) : aucun nouveau système, les mêmes règles de vente.

## Pour le formateur
Onglet **Tarification** d'une formation → panneau « ⚡ Générer un code de promotion » :

- **Code individuel** : une seule utilisation, une seule personne. On peut en générer jusqu'à **50 d'un coup** (copie groupée ou export `.csv`).
- **Code collectif** : plusieurs personnes. Le formateur écrit le **nombre de personnes** (2 ou plus) ou coche **Illimité**.
- **Réduction** : pourcentage (1 à 100 %, 100 % = formation offerte) ou montant fixe en euros.
- **Date limite** facultative.
- Le code (`TITR-7K3Q-9XM2`, sans I, L, O, 0, 1) est **enregistré dès sa création** ; chaque ligne de la liste a un bouton **📋 Copier**. Les états : « en attente » (jamais utilisé), « utilisé 3 / 25 », « épuisé », « désactivé », « expiré ».
- Chaque personne ne peut utiliser un même code **qu'une fois**.

## Règles de calcul (serveur, `server/formation-finances.js`)
- `POST /api/formations/:id/coupons/generer` — `{ type: 'individuel'|'collectif', type_reduction, reduction_pct | montant_fixe, quantite (1-50, individuel), max_personnes | illimite (collectif), date_fin }`. Réservé au propriétaire (ou administrateur) ; 30 générations / 10 min.
- Colonne `formation_coupons.type_code` : `'individuel'`, `'collectif'`, ou `NULL` pour un coupon saisi à la main. Individuel = `max_utilisations 1` ; collectif = `max_utilisations N` ou `NULL` (illimité) ; `max_par_utilisateur 1` dans les deux cas.
- **Pas de cumul avec la promotion** : un code généré s'applique au prix catalogue, et la **meilleure des deux offres** l'emporte. Si la promotion en cours est déjà plus avantageuse, le code est refusé avec un message clair (et n'est pas consommé). Les coupons saisis à la main gardent leur comportement d'origine (cumul).
- Le contrôle à l'achat (limite, date, désactivation, prix minimum 0,50 €, aucun remboursement) est celui des coupons existants (`evaluerCoupon`).

## Mise en ligne
Nouvelle colonne : après le déploiement, lancer `reparerSchema()` sur la base Neon (`formation_coupons.type_code`). Tant que ce n'est pas fait, la génération échoue en production.

Tests : `node --test tests/formation-codes-generes.test.js`.
