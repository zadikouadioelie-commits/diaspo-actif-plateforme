# Diaspo'Actif — Backend

Backend réel du prototype Diaspo'Actif : authentification, base de données SQLite et API REST. Aucune dépendance externe n'est requise (Node.js 22+ seulement — utilise le module intégré `node:sqlite`).

## Démarrage

```bash
cd server
node seed.js     # initialise la base et crée les comptes de démonstration (une seule fois)
node index.js    # démarre le serveur sur http://localhost:3000
```

Ouvrez ensuite **http://localhost:3000** dans votre navigateur — tout le site (accueil, annuaire, messagerie, fil d'actualité, tableaux de bord, etc.) y est servi.

## Comptes de démonstration

Mot de passe pour tous : **Demo1234!**

| Rôle | E-mail |
|---|---|
| Utilisateur (profil simple) | jean@diaspoactif.demo |
| Utilisateur (profil complet) | ynouss@diaspoactif.demo |
| Initiative | contact@aito.diaspoactif.demo |
| Officiel | officiel@diaspoactif.demo |
| Institutionnel | consulat.senegal@diaspoactif.demo |

Vous pouvez aussi créer un nouveau compte via la page **Inscription**.

## Ce qui est réellement fonctionnel

- Inscription / connexion / déconnexion (mots de passe hachés, sessions sécurisées)
- Annuaire des initiatives (lecture en base, création via l'API pour les comptes Initiative/Institutionnel)
- Messagerie interne (conversations et messages réellement persistés)
- Fil d'actualité (publications et réactions réelles, liées au compte connecté)
- Profil utilisateur (lecture depuis la base ; modèle générique acceptant un profil simple ou complet)

## Ce qui reste simulé (par sécurité / par choix de prototype)

- L'abonnement Initiative (50 €/an) et le module de paiement événementiel : aucune transaction réelle n'est traitée.
- La vérification des justificatifs de nationalité (CNI/passeport) : aucun contrôle d'identité réel.
- L'observatoire statistique institutionnel et les publicités : données illustratives fixes.

## Limites connues (prototype, pas un produit en production)

- Les sessions sont conservées en mémoire : elles sont perdues si le serveur redémarre.
- Aucune protection CSRF, aucune limite de débit (rate limiting), aucun envoi d'e-mail réel (vérification de compte, mot de passe oublié).
- La base est un simple fichier SQLite (`server/diaspoactif.db`) : suffisant pour une démo, pas pour une mise en production à grande échelle.

## Réinitialiser les données

```bash
rm server/diaspoactif.db
node server/seed.js
```
