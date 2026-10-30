# Fichiers privés des cours et Studio sur téléphone — documentation technique (lot F, 2026-10-30)

Fichiers : `server/formation-prive.js`, `server/migrer-documents-prives.js`, `server/formation-documents.js` (lecture), `server/formation-studio.js` (lecture masquée), `server/formation-acces.js` (aperçu gratuit),
`assets/m-mod-formations.js` (téléphone), `assets/studio-render.js`, `assets/studio-engine.js`. Tests : `tests/formation-prive.test.js` (9).

## 1. Fichiers privés
**Avant :** PDF / Excel / Word / PowerPoint d'un cours sur le CDN public, nom devinable (`compte-horodatage.ext`), adresse présente dans les données de la leçon.
**Maintenant :**
- `POST /api/formateur/document-cours` (créateurs de formations seulement ; type vérifié sur les octets : PDF, Word, Excel, PowerPoint — pas d'image) :
  - avec stockage privé configuré → dépôt dans une zone Bunny SANS diffusion publique, nom aléatoire de 128 bits ; la leçon garde une référence `prive:formations/<compte>/<32 hex>.<ext>` que seul le serveur sait lire ;
  - sans stockage privé → CDN public, mais nom aléatoire (plus devinable). Réponse `{ url, prive }`.
- Lecture : uniquement par `…/lecons/:id/document/*` (accès contrôlé, voir `documents-formation.md`) ; `lireOctets` sait lire une référence privée.
- Adresses masquées pour tout autre que le propriétaire / l'administrateur : plan de la formation (`/suivre` : `contenu_url: null, a_document: 1` pour les leçons PDF et « Document »), aperçu gratuit (`/decouverte`), lecture du Studio (éléments « Document » : adresse factice `document:<élément>.<ext>`).
- Studio : l'éditeur envoie les documents (éléments « Document » et bibliothèque) vers le stockage privé ; un fichier privé ne peut servir que dans un élément « Document » ; les éléments « Fichier à télécharger » et les images restent publics.
- Bibliothèque de médias : une référence privée n'est acceptée que pour le compte qui l'a déposée.

**À faire une fois pour activer le stockage privé (action sur Bunny + Vercel) :**
1. Bunny.net → Storage → *Add Storage Zone* (ex. `diaspoactif-prive`), **sans** lui rattacher de Pull Zone (c'est ce qui la rend privée).
2. Relever son mot de passe d'écriture (*FTP & API Access* → Password).
3. Vercel → variables d'environnement : `BUNNY_PRIVATE_ZONE` = nom de la zone, `BUNNY_PRIVATE_KEY` = ce mot de passe (`BUNNY_PRIVATE_URL` en option, par défaut `https://storage.bunnycdn.com`).
4. Redéployer. Les nouveaux documents vont alors dans la zone privée.
5. Documents déjà en ligne : `node --env-file=.env server/migrer-documents-prives.js` (simulation), puis `--appliquer` (sauvegarde, copie relue, mise à jour sans écrasement) ; supprimer ensuite à la main les anciens fichiers publics (liste affichée). `--retablir <sauvegarde>` annule.

**Limites assumées :** l'élément « Fichier à télécharger » du Studio, les images, les vidéos et les présentations PowerPoint (visionneuse Microsoft, qui exige une adresse publique) restent publics ; tant que le stockage privé n'est pas configuré, la protection se limite à « adresse non livrée + nom aléatoire pour les nouveaux fichiers » (les anciens noms restent devinables côté CDN).

## 2. Studio sur téléphone
Une leçon du Studio s'affiche dans `m.html` avec le même rendu que sur ordinateur (`StudioRender.lecture`, chargé à la demande avec `studio.css`), mode structuré en colonne, mode libre mis à l'échelle de l'écran (le texte d'une page libre conçue sur 1280 px y est petit : c'est la mise en page choisie par le formateur).
- Documents PDF / Excel intégrés, vidéos suivies (morceaux de 5 s, seuil 90 %, enregistrés par le serveur), zones de validation, boutons « aller à la page », quiz rattaché à la leçon (affiché dans la page ou sous le contenu).
- Mode « automatique » : la leçon se termine seule quand toutes les pages sont vues, les zones obligatoires cochées et les vidéos demandées regardées ; modes « manuel » / « aucun » respectés.
- Aperçu gratuit : leçon repliée, montée à l'ouverture (`studio: 1` ajouté aux leçons offertes de `/decouverte`).
- Aperçu du créateur : version brouillon, sans suivi.
