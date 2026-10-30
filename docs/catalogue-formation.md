# Catalogue, catégories, certificats en PDF — documentation technique (lot E, 2026-10-30)

Fichiers : `server/formation-catalogue.js`, `server/qr-code.js`, `server/pdf-simple.js`, `server/pdf-metrics.js`, `server/formation-certificat-pdf.js`,
`assets/catalogue-formations.css`, `initFormations()` dans `assets/app.js`. Tests : `tests/formation-catalogue.test.js`, `tests/formation-certificat-pdf.test.js`.

## 1. Catégories modifiables (table `formation_categories`)
`formations.domaine` reste un TEXTE ; la table fournit la liste de choix, l'ordre et l'icône. Semée au premier appel avec les dix catégories d'origine.
- `GET /api/formation-categories` (public, actives) · `GET /api/admin/formation-categories` (toutes).
- Administrateur : `POST` (créer), `PATCH /:id` (nom, icône, actif), `PUT /ordre` ({ ids }), `DELETE /:id`.
- Renommer réécrit `formations.domaine` et `formation_besoins.domaine`. Désactiver retire du choix sans toucher aux formations. Supprimer est refusé (409) tant qu'une formation s'en sert.
- Création / modification d'une formation : catégorie refusée (400) si elle n'est pas proposée — sauf si c'est déjà celle de la formation.
- Interface : onglet « 🏷️ Catégories » de la section Formation du tableau de bord administrateur ; liste de choix du constructeur alimentée par l'API (repli : les dix choix d'origine).

## 2. Catalogue
`GET /api/formations` ajoute à chaque ligne : `nb_modules`, `nb_lecons`, `nb_inscrits`, `prix_catalogue`, `promo_pct`, `prix_final`, `formateur_affiche`, `populaire`, `note_moyenne`, `nb_avis`.
`GET /api/formations/:id` ajoute `prix_catalogue`, `promo_pct`, `prix_final` (même calcul que le paiement : `FormationFinances.prixFormation`).
« Populaire » est CALCULÉ : les 3 formations les plus suivies, à condition d'avoir au moins 3 participants actifs. Interface : bandeau héros (globe doré), pastilles de catégories avec effectif, tri (récentes, plus suivies,
mieux notées, prix ↑↓, titre), filtres type / niveau / gratuites, recherche sans accents (titre, mots-clés, formateur…), lien direct `formations.html?categorie=…&q=…`. Téléphone : prix barré + promotion sur les cartes, la fiche et la feuille de paiement.

## 3. Tableau de bord du formateur filtrable
`GET /api/mes-formations/dashboard?formation_id=&statut=&domaine=&du=&au=` : les chiffres portent sur les formations retenues ; la période (`du`, `au` inclus) porte sur la date d'inscription des apprenants. Filtres illisibles ignorés.
Interface : barre de filtres du Centre de commande (formations.html) qui agit aussi sur la liste « Mes formations » (formation, statut, catégorie, titre).

## 4. Certificat en PDF
`GET /api/attestations/mon/:code/pdf` (titulaire ou administrateur ; 20 téléchargements / 10 min) — trois modèles (classique, moderne, premium), filigrane « RÉVOQUÉ », QR code vers la page de vérification (retiré si le formateur a désactivé `certificat_qr`, le code reste imprimé).
Aucune bibliothèque : `pdf-simple.js` écrit le PDF (polices standard Helvetica/Times en WinAnsi, largeurs AFM dans `pdf-metrics.js`, généré une fois depuis les tables de pdf.js), `qr-code.js` produit le QR (mode octets, niveau M, versions 1-10 ; matrices identiques à qrcodejs, vérifié dans un navigateur).
Limites : pas d'image (le logo n'est pas repris, la marque est écrite en texte) ; alphabet latin (WinAnsi) — un nom hors de cet alphabet s'affiche avec des « ? ».
Boutons « ⬇ PDF » : page du document, liste des certifications, lecteur de formation, téléphone.

## 5. Téléphone : documents
Les leçons PDF / « Document » de `m.html` chargent à la demande `assets/doc-viewer.{js,css}` et affichent la visionneuse intégrée (même contrôle d'accès que sur ordinateur) ; le lien de téléchargement reste le repli si le script ne se charge pas.
Dans l'aperçu gratuit, une leçon repliée n'est montée qu'à l'ouverture. Le Studio (pages libres) n'est pas encore rendu sur téléphone.

## Noms et lettres hors WinAnsi sur le certificat PDF (lot H, 2026-10-30)

Le PDF utilise les polices standard (alphabet WinAnsi/cp1252). Les lettres que cet alphabet ne connaît pas sont désormais **ramenées à la lettre proche** au lieu d'un « ? » : alphabets africains (Ɛ→E, Ɔ→O, Ŋ→N, Ɓ→B, Ɗ→D, ɣ→g…), Europe centrale (Ł→L, Ř→R, Ć→C…), traits d'union insécables et signe moins (→ « - »), accents écrits en deux caractères (recomposés). Les accents combinants isolés sont ignorés.
**Limite connue :** les autres alphabets (arabe, cyrillique, chinois…) donnent encore un « ? » par lettre dans le PDF ; la page imprimable et la page de vérification, elles, affichent le nom exact. Les écrire dans le PDF demanderait d'intégrer une police (TrueType) au fichier.
