# Fin de module : carte mentale et récapitulatif PDF automatiques

Ajouté le 2026-10-31. Fonction générique : disponible pour **tout créateur de formation**.

## Pour le créateur
Constructeur de formation → onglet **Certificat** → carte **« 🗺️ Fin de module »** : deux cases, modifiables à tout moment (même formation publiée).

- **Carte mentale à la fin de chaque module** (`formations.carte_module`)
- **Récapitulatif téléchargeable (PDF) à la fin de chaque module** (`formations.recap_module`)

Rien à rédiger. Le contenu est fabriqué à partir du plan et de ce que le créateur a écrit :

| Source | Où ça apparaît |
|---|---|
| Titre et description du module | Titre et « Objectif du module » du PDF ; centre de la carte |
| Chapitres, leçons | Sections numérotées du PDF ; branches et rameaux de la carte (chaque leçon est reliée à son contenu) |
| Bloc **« À retenir »** | Points clés du PDF (4 au plus par leçon) ; rameaux de la carte (3 au plus) |
| Bloc **« Exercice »** | « À faire » dans le PDF ; note du nœud de la leçon dans la carte |

Un bloc « À retenir » ou « Exercice » se repère à son **titre** : dans une leçon texte, un paragraphe / titre qui commence par « À retenir » ou « Exercice » (le texte peut suivre sur la même ligne ou sur les lignes suivantes, listes comprises) ; dans une leçon **Studio**, un élément (titre, sous-titre, paragraphe, encadré) dont le texte commence ainsi, suivi de l'élément de texte suivant. Sans ces blocs, seuls les titres apparaissent.

Le créateur peut voir le résultat avant publication : liste des modules + boutons « Voir le récapitulatif (aperçu) » et « Voir la carte (aperçu) ».

## Pour l'apprenant
Quand il a terminé **toutes les activités obligatoires** du module, une carte « 🎓 Module terminé : vos documents » apparaît sous le module (page de suivi sur ordinateur, écran de suivi sur téléphone) : **Récapitulatif (PDF)** et **Carte mentale**. Avant, un message « 🔒 Terminez ce module… ». Sur la carte mentale (lecture seule, export PNG / PDF par le navigateur) : **« Copier dans mes cartes »** crée une copie modifiable. Une formation « sans suivi de progression » débloque tout de suite.

## Technique
- `server/formation-recap-module.js` : extraction (`lignesDeHtml`, `extraire`), `contenuModule`, `arbreCarte`, `recapPdf` (A4, générateur `pdf-simple.js`), `moduleTermine`, routes.
- Routes : `GET /api/formations/:id/fin-de-module` · `GET …/modules/:moduleId/recapitulatif.pdf` · `POST …/modules/:moduleId/carte` (crée ou met à jour la carte du module : `cartes_mentales.module_id`, propriétaire = le propriétaire de la formation, lecture par les inscrits) · `POST /api/cartes-mentales/:id/copier` · `PUT /api/formations/:id/reglages { carte_module, recap_module }`.
- Accès : propriétaire et administrateur toujours (aperçu) ; apprenant inscrit seulement une fois le module terminé et si le module fait partie de son accès (achat par module) ; sinon 403. Le récapitulatif n'est jamais stocké ; la carte est regénérée à chaque demande (reste à jour si le créateur modifie son plan).
- Limite du PDF : alphabet latin seulement (français, espagnol, anglais, portugais, allemand, italien…). Le cyrillique et le grec sont translittérés ; l'arabe, le chinois, les émojis, les flèches et les coches sortent en « ? ». La carte mentale (navigateur) n'a pas cette limite.

## Mise en ligne
Nouvelles colonnes : `formations.carte_module`, `formations.recap_module`, `cartes_mentales.module_id` → après le déploiement, lancer `reparerSchema()` sur Neon. Tests : `node --test tests/formation-recap-module.test.js`.
