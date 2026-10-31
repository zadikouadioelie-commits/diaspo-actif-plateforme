# Tarifs réservés aux membres d'une initiative (Formation Diaspora)

Ajouté le 2026-10-31. Complète les codes de promotion : ici rien à saisir, l'avantage est **automatique** pour les personnes affiliées.

## Pour le formateur
Trois boutons, dans l'onglet **Tarification** d'une formation (règle pour cette formation) et dans **Coupons sur toutes mes formations** du Centre de commande (règle pour toutes les formations du formateur, y compris les prochaines) :

1. **🎁 Gratuit pour les membres Diaspo'Actif** — un clic (avec confirmation : le formateur renonce à ses revenus pour ces membres).
2. **🏷️ Promotion membres Diaspo'Actif** — un pourcentage (1 à 99 %).
3. **🤝 Promotion liée à une initiative** — recherche par le nom (dès 2 lettres, suggestions avec ville et pays), puis un pourcentage **ou** la gratuité. Initiative du formateur ou n'importe quelle autre initiative visible dans l'annuaire.

Une formation peut cumuler plusieurs règles (une par initiative, 20 au plus). Une règle propre à la formation l'emporte sur la règle « toutes mes formations » pour la même initiative. Chaque règle se désactive, se réactive ou se supprime.

## Suivi de l'impact (sous chaque règle)
Personnes qui en ont profité (comptées une fois), accès gratuits ouverts, réductions accordées, encaissé, date de dernière utilisation, détail par mois. Les chiffres viennent des commandes (`coupon_source='membre'`, `coupon_id` = règle). « Ventes et revenus » ajoute le tableau « Promotions en cours (prix barré) » et les lignes « Membres X » dans « Codes de réduction et tarifs membres utilisés » (ventes payantes seulement ; les accès gratuits sont comptés dans le suivi de la règle).

## Règles (serveur : `server/formation-regles-membres.js`)
- **Affilié** = `initiative_membres.statut='accepte'`, non échu (`date_debut`/`date_fin`). Demande en attente ou refusée : aucun avantage. Vérifié à l'achat, jamais côté navigateur.
- **Pas de cumul** : la meilleure offre entre promotion en cours, code et tarif membre. Gratuit l'emporte. Un code moins bon que le tarif membre est refusé avec un message (et n'est pas consommé).
- Pourcentage : le prix calculé sur le prix catalogue ; minimum de paiement 0,50 € (Stripe). Aucun remboursement, consentement exigé pour toute somme à payer. Gratuité : accès ouvert aussitôt, sans Stripe ; la confirmation est aussi exigée côté serveur (`confirme: true`).
- La recherche d'initiatives ne propose que celles que l'annuaire montre au public ; réservée aux comptes qui ont au moins une formation.
- La personne affiliée voit son tarif sur la fiche et dans la feuille d'achat du téléphone ; les autres voient la mention « −10 % pour les membres de Segom » (fiche, carte du catalogue, téléphone).

## API
`GET/POST /api/formations/:id/regles-membres`, `PATCH/DELETE …/:regleId` ; `GET/POST/PATCH/DELETE /api/formateur/regles-membres[/:id]` ; `GET /api/formateur/initiatives-recherche?q=` ; `GET /api/formations/:id/offre` renvoie aussi `tarifs_membres` et `mon_tarif_membre` ; le catalogue ajoute `mentions_membres` à chaque formation.

## Mise en ligne
Nouvelle table `formation_regles_membres` : après le déploiement, lancer `reparerSchema()` sur Neon (avec la colonne `formation_coupons.type_code` des codes générés). Tests : `node --test tests/formation-regles-membres.test.js`.

## Points de fiabilité (2026-10-31)
Tout compte qui crée des réductions pour les membres de l'initiative officielle Diaspo'Actif (gratuité ou pourcentage, sur une formation ou sur toutes) gagne des points dans l'indice de fiabilité (`computeTrustScore`, critère `reductions_membres`) : **+2 dès la première réduction, +1 à la 5ᵉ, +2 à la 15ᵉ** (5 points au total). Une réduction visant une autre initiative ne compte pas. Les points suivent l'état réel : supprimer une règle peut faire redescendre sous un palier. Le total disponible reste **exactement 100** (membre et structure) : les 5 points sont pris sur identité (−1), profil public (−1), ancienneté (−1), rencontre (−1) et signalements (−1). Test : `tests/formation-fiabilite-reductions.test.js`.
