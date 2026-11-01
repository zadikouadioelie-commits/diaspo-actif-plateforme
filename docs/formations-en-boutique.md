# Vendre une formation sur sa boutique (2026-11-01)

## Ce que ça fait
Chaque formation publiée a un interrupteur **« Vendre cette formation sur ma boutique »** (Espace Formateur → Mes formations). **Désactivé par défaut.**
Quand il est activé, la boutique de l'initiative affiche, en tête, une bande **« Formations créées par <nom de l'initiative> »** : couverture, badge « Formation », mention « Gratuit », prix (prix barré si promotion). Un clic mène à la fiche de la formation (`formation-fiche.html?id=…`), avec le bouton d'achat ; après paiement l'accès est donné automatiquement, comme dans le catalogue (codes de promotion, tarifs membres, liste d'attente inchangés).

## Principes
- **Pas de copie** : la bande lit les formations en direct (prix, titre, couverture, statut). Aucune ligne n'est créée dans `produits_vitrine` : la limite de produits ne s'applique pas.
- Le titre porte toujours le nom de l'initiative de la boutique, jamais celui de la personne qui gère le compte.
- Seul le compte propriétaire (ou l'administration) peut activer l'interrupteur, côté serveur. Conditions : formation **publiée**, **ouverte à tous** (pas réservée à une liste), compte ayant une **initiative**. Désactiver reste toujours possible.
- Si la formation cesse d'être publiée (ou devient réservée à une liste), elle disparaît de la bande ; l'interrupteur reste mémorisé et elle revient une fois republiée.
- Vitrine inactive : le public ne voit pas la bande (comme les produits) ; le propriétaire la voit.
- L'ancien module « Formations » de la boutique (liste de toutes les formations publiées du compte) ne répète pas celles de la bande ; s'il ne reste rien, il disparaît.

## API
- `GET /api/initiatives/:id/formations-boutique` (public) → `{ nom, titre, formations: [...] }` (titre vide s'il n'y en a aucune).
- `PUT /api/formations/:id/boutique` `{ actif: true|false }` → `{ ok, en_boutique, boutique_visible }`.

## Mise en ligne
Nouvelle colonne `formations.en_boutique` (0 par défaut) : après le déploiement, lancer `reparerSchema()` sur Neon. Tests : `node --test tests/formation-boutique.test.js`.

## Où c'est affiché
Site : `profil-app.html` (`bandeFormationsHtml`, section `#pv-formations-boutique`, entrée « Formations » du menu de la boutique). Téléphone : `assets/m-mod-boutique.js` (bande défilante, clic → `#/formations/<id>`). Interrupteur : `formations.html` (`.mf-boutique`). Serveur : `server/formation-boutique.js`.
