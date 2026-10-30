# Documents PDF et Excel dans les cours — documentation technique

Dernière mise à jour : 2026-10-30. Fichiers : `server/formation-documents.js` (accès, octets, routes), `server/xlsx-lecteur.js` (lecteur de classeurs .xlsx),
`assets/doc-viewer.js` + `assets/doc-viewer.css` (visionneuses), tests `tests/formation-documents.test.js`, `tests/xlsx-lecteur.test.js`, fabrique de fichiers
de test `tests/_documents-fabrique.js` (xlsx et PDF écrits à la main : aucun fichier tiers).

## 1. Ce que voit le formateur

Pour une leçon de type **PDF** ou **Document (téléchargement)**, et pour l'élément **Document** du Studio :

| Réglage | Effet |
|---|---|
| « Afficher directement dans le cours » (`doc_integre` / `props.integre`) | le document est lisible dans la page dès l'ouverture, sans clic sur une pièce jointe |
| « Autoriser le téléchargement » (`telechargement_autorise` / `props.telechargeable`) | un bouton ⬇ apparaît ; sans lui, aucun téléchargement n'est servi |
| « Hauteur d'affichage » (`doc_hauteur` / `props.hauteur`, 200–1600 px, 640 par défaut) | taille de la visionneuse |

Les deux premiers se cumulent. Sans réglage explicite, un PDF s'affiche dans la page ; un autre fichier reste une pièce jointe. L'**emplacement** dans le chapitre est celui de la
leçon (on la déplace avant ou après une autre) ; dans le Studio c'est la position de l'élément dans la page.

## 2. Parcours d'un document

Le navigateur **ne reçoit jamais l'adresse brute** du fichier pour le lire. Tout passe par `GET /api/formations/:id/lecons/:leconId/document/…` (`?element=ID` pour le Studio,
`&brouillon=1` réservé au propriétaire) :

| Route | Rôle |
|---|---|
| `/infos` | famille (pdf / excel / xlsm / autre ; `format: "xls"` signale un ancien classeur lu comme un classeur), intégré, téléchargeable, hauteur, erreur éventuelle |
| `/fichier` | le PDF, en entier ou par morceaux (`Range`) — seulement si l'affichage intégré est activé (ou aperçu du propriétaire) |
| `/classeur` | liste des feuilles, styles, limites d'affichage (jamais les cellules) |
| `/feuille?feuille=i&debut=r&n=100` | une fenêtre de lignes (500 au plus) : valeurs formatées, formules, cellules fusionnées, largeurs |
| `/telecharger` | le fichier en pièce jointe — seulement si le formateur l'autorise (le propriétaire récupère toujours le sien) |

**Contrôle d'accès** : identique à la lecture du cours (propriétaire / administrateur ; apprenant inscrit ayant le droit sur le module — `Droits.leconPermise` ; leçon offerte en aperçu gratuit d'une formation publique).
**Vrai type** : déterminé sur les premiers octets (`%PDF-`, `PK…`, signature OLE), jamais d'après l'extension. **Hôtes** : seuls `*.b-cdn.net`, l'hôte du site et le dossier `/uploads` sont appelés
(pas d'adresse choisie à la volée → pas de SSRF), HTTPS obligatoire, aucune redirection suivie, délai de 15 s. **Taille** : 12 Mo lus au plus ; un PDF de plus de 4,4 Mo n'est pas servi par morceaux
(limite d'une réponse de l'hébergeur du site, 4,5 Mo). Les réponses sont `private` et `nosniff` ; le PDF est servi avec `Content-Security-Policy: sandbox`.

## 3. PDF (InlinePDFViewer)

PDF.js 3.11.174, chargé **à la demande** depuis cdnjs avec contrôle d'intégrité (SRI) — déjà autorisé par la politique de sécurité du site (`script-src`, `worker-src blob:`).
`isEvalSupported: false`, aucun script du PDF n'est exécuté. Fonctions : défilement continu (les pages proches de l'écran sont dessinées, les lointaines libérées), pages précédente / suivante, saisie d'un numéro,
zoom 50–400 % et « ajuster à la largeur », recherche de texte (PDF à texte sélectionnable) avec résultats et surlignage, plein écran (API plein écran, sinon recouvrement de l'écran sur iPhone), couche de texte sélectionnable,
adaptation aux téléphones (barre à boutons agrandis, zone qui garde le défilement tactile). Un PDF protégé par mot de passe ou invalide affiche un message clair (et le téléchargement si autorisé).

## 4. Excel (InlineExcelViewer + `xlsx-lecteur.js`)

Le serveur ouvre l'archive .xlsx (zlib de Node), lit feuilles, chaînes partagées, formules (avec leur dernière valeur calculée), cellules fusionnées, largeurs de colonnes, formats de nombres et de dates
(séparateurs français, pourcentages, devises, dates, heures), et styles simples (gras, italique, couleur du texte, fond, alignement, retour à la ligne). Le navigateur charge **100 lignes à la fois**, la suite
au défilement ; un clic sur une cellule montre son adresse, sa formule et sa valeur (barre de formule, lecture seule). Onglets de feuilles, taille du texte A− / A+, plein écran, téléchargement si autorisé.

**Limites assumées** (affichées dans la visionneuse, bouton ⓘ) : formules **non recalculées** ; graphiques, images, formes, tableaux croisés dynamiques et mises en forme conditionnelles non dessinés ;
couleurs de thème et bordures non reprises ; feuilles masquées non montrées ; **.xls (Excel 97-2003) lu par server/xls-lecteur.js** : valeurs, résultats enregistrés des formules **et leur texte** quand il est courant (lot J : server/xls-formules.js ; noms définis, fonctions récentes et matrices en ligne : valeur seule, jamais un texte approximatif), formats de nombres et de dates, gras, italique, alignement, fusions, largeurs, lignes et feuilles masquées — sans couleurs ni bordures ; les .xls protégés par mot de passe ou d'avant Excel 97 sont refusés avec un message clair ; **.xlsm refusé** — les macros ne sont jamais lues ni exécutées
(un classeur à macros renommé en .xlsx est refusé sur son contenu). Défenses : nombre d'entrées, taille décompressée par entrée (60 Mo) et au total (200 Mo), 600 000 cellules au plus, 200 colonnes au plus.

## 5. Interface avec l'assistant pédagogique (Koffi)

Côté navigateur (`assets/doc-viewer.js`) :
- événement `document` **`diaspo:document-contexte`**, détail `{ type: 'pdf'|'excel', nom, page, pages, recherche?, selection? }` ou
  `{ type: 'excel', nom, feuille, cellule, valeur, formule? }` — émis à chaque changement de page, de cellule ou de sélection de texte ;
- `DocViewer.contexte()` renvoie le dernier contexte ; `DocViewer.aller({ page, recherche })` ou `DocViewer.aller({ feuille, cellule })` ouvre l'emplacement voulu ;
- tout lien portant `data-doc-aller="p:3"`, `"p:3:mot"`, `"c:Prévisions!B12"` ou `"c:B12"` déplace la visionneuse concernée sans quitter la page (à utiliser dans les réponses de l'assistant).

Côté serveur : `require('./formation-documents').texteDeDocument(lecon, doc, elementId, hote, maxCar)` renvoie, pour un classeur, le texte « Feuille / B12 = valeur [formule : =B10-B11] » (borné) ;
pour un PDF, `{ type: 'pdf', url }` : le PDF se lit nativement côté assistant (pages numérotées). **Le contrôle d'accès reste à la charge de l'appelant** (réutiliser `Droits.leconPermise`).
Exemple : « Explique-moi comment est calculé le bénéfice net » → le texte exporté contient `B4 = 30 000,00 € [formule : =B2-B3]` ; l'assistant répond en renvoyant vers `c:Prévisions!B4`.

## 6. Ce qui n'est pas fait

- Texte des formules des anciens **.xls** employant des noms définis, des fonctions récentes (_xlfn) ou des matrices en ligne (seule leur dernière valeur est montrée) ; la table des fonctions de server/xls-formules.js ne contient que des index certains.
- **Fichiers vraiment privés** : l'adresse du fichier reste publique sur l'hébergeur pour qui la connaît (et reste présente dans les données de la leçon, dont dépend la version téléphone).
  Une protection complète demande un stockage privé avec adresses signées.
- Version **téléphone** (`assets/m-mod-formations.js`) : non adaptée (lot E).
- PDF numérisés (images) : affichés, mais non cherchables (pas d'OCR).
