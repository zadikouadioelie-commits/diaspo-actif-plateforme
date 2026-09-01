# Audit du module Business Plan — Diaspo'Actif

Date : 2026-08-31
Périmètre de la demande : cahier des charges "Évolution du module Business Plan" (35 points, transformation en « base de données stratégique intelligente du projet »).

## Constat général

**La quasi-totalité de ce cahier des charges est déjà implémentée.** Le module a été renforcé par plusieurs incréments successifs au cours des sessions précédentes et de la journée du 2026-08-31 (statut/provenance des données, système de preuves, questionnaire conditionnel, marché quantifié, plan financier détaillé, capitalisation/levée de fonds, stress test, score explicable, Business Plan Defender, génération multi-format, exports PDF/PowerPoint réels, gestion multidevise). Ce rapport documente précisément **ce qui existe déjà, où, et sous quel nom** — pour éviter toute duplication — puis identifie les écarts réels restants.

**Écart réel identifié et traité par ce chantier** : le point 27 (« Alertes de cohérence ») n'existait pas. Le Business Plan Defender (point 21) génère des *questions* à la demande (analyse manuelle, une fois lancée) ; le cahier des charges demande en plus des *contrôles arithmétiques automatiques et permanents* (ex. clients × panier ≠ CA), d'une nature différente. Implémenté dans ce chantier (voir §J).

**Écarts mineurs identifiés, hors périmètre immédiat** :
- Le champ `roi` (« Retour sur investissement attendu ») de la section `financement` est rendu par deux appels `textarea()` distincts (carte principale + carte "Stratégie de sortie") pointant vers la **même donnée** — remplir l'un écrase l'affichage de l'autre au rechargement. Corrigé dans ce chantier (renommage du second en `roi_sortie`, distinct).
- Les 4 documents `docs/business-plan-architecture.md`, `-data-model.md`, `-ai.md`, `-testing.md` demandés au point 32 ne sont pas produits en plus de celui-ci — voir §I (justification).

---

## A. Architecture actuelle

- **Frontend** : HTML/JS vanilla, pas de framework (pas de React/Vue). Un fichier par page (`business-plan.html` liste, `business-plan-edit.html` éditeur ~4650 lignes, `business-plan-view.html` consultation lecture seule).
- **Backend** : Node.js pur, serveur HTTP maison (`server/index.js`, ~38 000 lignes), deux styles de routage coexistants : `route(method, path, handler)` (framework interne) et un shim `app.get/post/put/delete` posé dessus.
- **Base de données** : SQLite en local (`server/db.js`, développement), PostgreSQL en production (`server/pg-init.js` gère la création/réparation de schéma). Pas d'ORM — requêtes préparées maison (`db.prepare(...).get/all/run`).
- **Authentification** : cookies de session maison (`getCurrentUser(req)`), pas de librairie tierce.
- **Stockage fichiers** : Bunny CDN (`server/upload.js`, `uploadToBunny()`), validation par signature de fichier (magic bytes) via `server/security.js`.
- **Génération PDF** : `html2pdf.js` (CDN, bibliothèque déjà utilisée ailleurs sur la plateforme — `cv-builder.js`), rendu client du DOM déjà affiché — pas de génération serveur (pas de Puppeteer).
- **Génération PowerPoint** : `pptxgenjs` (CDN, bundle navigateur), construite ce jour — première génération `.pptx` réelle de la plateforme.
- **Génération HTML** : `buildFinalReportHTML(format)`, assemble des blocs `frBlockXxx()` réutilisables en un document imprimable/exportable.
- **Génération CSV** : `exportFinancierCSV()` (compte de résultat uniquement).
- **Système de sauvegarde** : autosave côté client (debounce 3s après modification), `PUT /api/business-plans/:id` par section, historique de versions (`bp_versions`, snapshot complet à la demande).
- **Système de permissions** : propriétaire / collaborateur (`bp_collaborateurs`, rôles `lecteur`/`editeur`/`validateur`), vérifié à chaque route.

## B. Champs existants

Inventaire exhaustif publié séparément (artefact "Cartographie du Business Plan", 2026-08-31) : 20 sections de contenu, ~180 champs, 19 tableaux répétables, 3 blocs conditionnels, 2 niveaux de profondeur (Professionnel/Investisseur) en plus du niveau Essentiel. Ne pas dupliquer cet inventaire ici — voir l'artefact pour le détail champ par champ.

## C. Fonctionnalités déjà existantes (correspondance avec les points du cahier des charges)

| Point du cahier des charges | État | Où dans le code |
|---|---|---|
| 4. Statuts DECLARED/DOCUMENTED/EXTERNAL_SOURCE/ASSUMPTION/TO_VERIFY | ✅ Existe, 5 mêmes états sous d'autres noms | Table `bp_provenance` (`declare`/`justifie`/`verifie`/`estimation`/`a_confirmer`), widget `provenanceWidget()` sur ~15 champs sensibles (business-plan-edit.html) |
| 5. Système de preuves (fichier, catégorie, association à une donnée) | ✅ Existe | Table `bp_documents` (bp_id, section_key, field_key nullable, catégorie CHECK 13 valeurs, nom, url_bunny, type_mime) + « Bibliothèque de justificatifs » (annexes) |
| 6. Validation, Traction & Preuves (champs conditionnels) | ✅ Existe intégralement, mêmes champs | `renderTractionCard()` dans `presentation`, niveau Professionnel |
| 7. Questions conditionnelles (revenus/levée/salariés/brevet/export/subvention/production) | 🟡 Existe partiellement — 3 conditions sur secteur/type (numérique, association/ONG, agriculture), pas les 7 citées en exemple | `bpAppliquerConditionnels()`, classes `bp-conditionnel-*` |
| 8. TAM/SAM/SOM, territoire, source, méthode, niveau de confiance | ✅ TAM/SAM/SOM + provenance existent ; territoire/année de référence/méthode dédiés non séparés (regroupés dans les champs texte existants) | `marche.tam/sam/som` niveau Professionnel |
| 9. Validation client (entretiens, tests, taux de conversion...) | ✅ Existe, champs équivalents dans `probleme` (ampleur chiffrée, résultats d'entretiens) et `solution` (maturité & tests) | niveau Professionnel/Investisseur |
| 10. Plan financier par produit (prix × volume × fréquence, formule affichée) | ✅ Existe | `produits.etude_prix[]` + `bpAfficherSuggestionCA()` (suggestion de CA avec bouton "Utiliser pour l'An 1", jamais un écrasement silencieux) |
| 11. Hypothèses financières (valeur/source/justification/confiance/preuve) | 🟡 Existe via le système de provenance générique (§4), pas une structure dédiée "hypothèse" séparée | `bp_provenance` |
| 12. Charges fixes/variables détaillées | ✅ Existe | `plan_financier.charges_detaillees[]` (poste, type fixe/variable, montant annuel) |
| 13. BFR (délais, stock, créances/dettes, calcul auto) | ✅ Existe | `plan_financier.bfr` + champs délais paiement/stock (texte libre, pas de calcul auto — voir §E) |
| 14. Dettes (mensualité/intérêts/capital restant dû calculés) | ✅ Existe | `plan_financier.dettes[]` + `bpCalcInteretsParAnnee()` |
| 15. Immobilisations (amortissement calculé) | ✅ Existe | `plan_financier.immobilisations_liste[]` + `bpCalcAmortissementAnnuel()` |
| 16. Capitalisation (capital, parts, fondateurs, investisseurs) | ✅ Existe | `financement` niveau Investisseur (nb_parts_actions, valeur_nominale, pct_fondateur1/2...) |
| 17. Levée de fonds + simulation de dilution | ✅ Existe | `financement.montant/valorisation_avant/apres` + `bpCalcDilution()` |
| 18. Financement (besoins min/idéal/max, scénarios 50/100/150%) | ✅ Existe intégralement | `financement.montant_minimum_necessaire/ideal/maximum` + `bpCalcScenariosFinancement()` |
| 19. Test de résistance (prudent/réaliste/optimiste) | ✅ Existe | `bpLancerTestResistance()` |
| 20. Business Plan Score explicable, 11 sous-scores, points forts/faibles/manquants, 5 actions prioritaires | ✅ Existe intégralement, mêmes 11 sous-scores demandés | `computeBPScore()` (server/index.js), avertissement "pas une notation financière" déjà présent |
| 21. Business Plan Defender (rôle investisseur critique, questions) | ✅ Existe, moteur à règles déterministe (pas de LLM — aucune intégration IA générative n'existe sur la plateforme) | `analyserBPDefender()`, 10 vérifications, réponses enregistrables |
| 22. Impact (bénéficiaires, emplois, indicateurs) | ✅ Existe | `impact.beneficiaires_directs/indirects`, `emplois_directs/indirects`, `indicateurs[]` |
| 23. Calendrier (phases + jalons prédéfinis) | ✅ Existe | `calendrier.phases[]` + bouton "jalons prédéfinis" (8 jalons Idée→Expansion) |
| 24. Plusieurs types de documents depuis une même base | ✅ Existe, 7 formats demandés = 7 formats existants | `FR_FORMATS` (classique, bancaire, investisseur, subvention, partenaire, pitch_deck, executive_summary) |
| 25. Interface (progression, sous-sections, conditionnel, autosave, aide, calculs, alertes, complétude) | ✅ Existe pour l'essentiel ; "alertes" = le point 27, seul écart réel | — |
| 26. Tableau de bord (% par section, priorités) | ✅ Existe (score par sous-thème + actions prioritaires), rendu visuel à vérifier au prochain incrément UI | `computeBPScore()`, section "Vérification complétude" |
| 27. Alertes de cohérence automatiques | ❌ N'existait pas — implémenté dans ce chantier | voir §J |
| 28. Génération PDF (lisible, hiérarchisé, adapté au destinataire) | ✅ Existe + renforcé ce jour (vrai fichier PDF téléchargeable, pas juste impression) | `frExportPDF()`, `bpvExportPDF()` (html2pdf.js) |
| 29. Rétrocompatibilité | ✅ Discipline suivie sur tout le chantier (colonnes nullables, `MIGRATIONS` additive, jamais de suppression) | — |

## D. Champs réutilisés (pas de duplication)

Le pattern de statut de donnée (`bp_provenance`) et le système de justificatifs (`bp_documents`) couvrent déjà les points 4-5 sous une forme fonctionnellement équivalente — **aucune nouvelle table créée pour cela**, conformément à la règle de priorité du cahier des charges (« réutilise un champ existant plutôt que d'en dupliquer un »).

## E. Nouveaux champs jugés nécessaires (non ajoutés à ce stade)

- Calcul automatique du BFR (point 13) : les composantes existent (délais, stock) mais restent des champs texte libre, pas de formule appliquée. Non traité ici — nécessiterait de transformer des champs texte en champs numériques structurés, un changement plus large que le périmètre "alertes" de ce chantier, à planifier séparément si souhaité.
- Structure "hypothèse" dédiée distincte du système de provenance générique (point 11) : jugé redondant avec `bp_provenance` existant — pas de nouvelle table recommandée.

## F. Nouvelles tables nécessaires

**Aucune.** Toutes les tables nécessaires à ce chantier existent déjà (`bp_provenance`, `bp_documents`, `bp_defender_rapports`, `bp_taux_historique`, `bp_versions`). Le point 27 est implémenté en calcul pur (côté client, à partir des données déjà chargées), sans nouvelle persistance.

## G. Relations nécessaires

Aucune nouvelle relation — les alertes de cohérence (§J) lisent les sections déjà chargées en mémoire (`sections`), aucune nouvelle jointure serveur.

## H. Migration nécessaire

Aucune migration de schéma pour ce chantier.

## I. Risques de régression

- Renommer le champ dupliqué `roi` → `roi_sortie` (voir constat) : risque nul pour les BP existants, la carte "Stratégie de sortie" était en pratique toujours vide dans les BP créés avant cette correction (elle affichait la valeur de l'autre champ) — aucune perte de donnée réelle possible.
- Nouvelles alertes de cohérence : purement calculées à l'affichage, jamais persistées, aucun risque sur les données existantes.

## J. Plan d'implémentation (ce chantier)

1. **Alertes de cohérence (point 27)** — nouvelle fonction cliente `bpDetecterIncoherences(sections)`, appelée dans la section "Vérification complétude" à côté du score explicable. 5 contrôles conformes aux exemples du cahier des charges :
   - CA prévisionnel élevé vs capacité commerciale du funnel insuffisante.
   - Marge déclarée (étude de prix) vs marge réellement calculée sur le compte de résultat An 1.
   - Clients × panier moyen (plan commercial) vs CA An 1 déclaré.
   - Montant de financement recherché vs besoin réel (investissement initial + BFR estimé).
   - Pourcentage de capital proposé déclaré vs dilution réellement calculée (montant/valorisation après).
   Chaque alerte est explicable : elle affiche les deux valeurs comparées et pourquoi l'écart est signalé (jamais un simple "erreur" opaque).
2. **Correction du champ `roi` dupliqué** — renommage du second en `roi_sortie` avec son propre libellé.
3. Vérification par exécution réelle (plan de test avec incohérences volontaires, confirmation que chaque alerte se déclenche et s'efface quand la donnée redevient cohérente).

## Documents non produits à ce stade

Les fichiers `docs/business-plan-architecture.md`, `docs/business-plan-data-model.md`, `docs/business-plan-ai.md`, `docs/business-plan-testing.md` demandés au point 32 ne sont pas créés en plus de cet audit : le §A ci-dessus couvre l'architecture, l'inventaire de champs (§B, artefact séparé) couvre le modèle de données, et la logique IA (Defender, Score) est déjà documentée en commentaires directement dans `server/index.js` aux emplacements cités en §C.

> **Correction (2026-09-01)** : la phrase initiale de cette section affirmait qu'« aucun framework de tests n'existe dans ce dépôt » — **c'était faux**, trouvé en ajoutant la suite de tests du §K ci-dessous. Il existe bien un dossier `tests/` avec 2 suites existantes (`admin-junior.test.js`, `parrainage-initiative.test.js`, toutes deux `node:test`) et un script `npm test` déjà défini dans `package.json`. L'audit initial ne l'avait pas trouvé faute d'avoir cherché plus loin que `package.json`'s dépendances déclarées. Voir §K pour la suite de tests ajoutée pour ce module suivant cette même convention.

---

## K. Consolidation (2026-09-01, suite à l'audit ci-dessus)

Quatre chantiers de consolidation identifiés et traités, sur demande explicite après un retour honnête sur les points faibles du module (au-delà du strict cahier des charges) :

1. **Cohérence des données** — `assets/business-plan-calc.js` (nouveau module partagé) : `detecterIncoherences()` étendu de 4 à 7 contrôles, dont 3 structurels nouveaux (immobilisations détaillées vs total Matériel+Véhicules, dettes détaillées vs poste Banque, **Ressources vs Emplois du plan de financement** — exactement le type d'écart trouvé et corrigé à la main le 2026-08-31 sur l'exemple publié).
2. **Tests automatisés** — `tests/business-plan-calc.test.js` (30 tests, `node:test`, rejoint la suite existante). Couvre toutes les fonctions de calcul pures extraites : amortissement, intérêts, dilution, scénarios de financement, BFR, alertes de cohérence.
3. **Fin de la duplication client/serveur** — `assets/currency-manager.js` rendu `require()`-able (UMD) ; `server/index.js` charge désormais ce module au lieu de maintenir sa propre copie de la liste de devises (`DEVISES_VALIDES_BP`, 164 entrées recopiées à la main jusqu'ici).
4. **BFR réellement calculé** — `BPCalc.calcBFR()` (formule normative : stock moyen + créances clients − dettes fournisseurs, à partir de 3 champs déjà numériques). **Bug trouvé au passage** : le ratio BFR/CA du tableau de bord (`calcRatios()`) lisait `parseFloat(sections.plan_financier.bfr)` — un champ de texte libre — et retombait donc systématiquement sur 0/NaN pour toute saisie normale ; le ratio affichait silencieusement "0.0%" (toujours au vert) sur n'importe quel plan rempli. Corrigé pour utiliser le vrai calcul.

**Effet de bord trouvé en marge (sans rapport avec le Business Plan)** : en testant la nouvelle suite, `node --test` lancé sans argument (auto-découverte, différent de `npm test`) a balayé `server/seed-comptes-test.js` — un script d'exécution manuelle (pas une suite de tests) qui écrit de vrais comptes en base, dont un mot de passe administrateur en dur, à cause de son nom de fichier terminant en `-test.js`. Aucune donnée touchée (vérifié : `DATABASE_URL` n'était pas défini dans l'environnement au moment des essais), mais le risque était réel si l'environnement avait été différent. Renommé en `server/seed-comptes.js` pour rendre la classe de risque impossible.

## L. Provenance étendue (2026-09-01, 5ᵉ chantier de consolidation)

Le 5ᵉ point identifié lors du retour honnête sur le module (« le système de preuves/provenance est réel mais superficiel — ~15 champs sur 180 ») a été traité : 6 nouveaux champs scalaires à fort enjeu couverts par `provenanceWidget()`, portant le total de 17 à 23 :
- `business_model.cac` et `business_model.ltv` (Unit Economics — les deux chiffres les plus scrutés par un investisseur, souvent des estimations)
- `plan_commercial.ca_par_commercial`
- `impact.beneficiaires_directs` et `impact.beneficiaires_indirects` (complètent `emplois_directs`, déjà couvert)
- `financement.montant_ideal_financement` (complète `montant`, déjà couvert)

**Choix de périmètre assumé** : les champs des tableaux répétables (`ca_1`..`ca_5` du compte de résultat, postes RH, immobilisations détaillées) n'ont **pas** reçu de badge. `provenanceWidget()` est conçu pour un champ scalaire dans une grille `.fg` (label + badge côte à côte) ; l'insérer dans une cellule `<td>` du tableau du compte de résultat (5 colonnes déjà serrées) aurait dégradé la lisibilité — exactement ce que le chantier suivant (§M, visuel du rendu document) cherche à améliorer, pas à contredire. Étendre la provenance aux tableaux répétables demanderait un widget par ligne, une évolution distincte non traitée ici.

Vérifié par exécution réelle : les 6 badges confirmés affichés sur un plan de test, cycle complet POST/GET `/api/business-plans/:id/provenance` confirmé (statut, source, méthode persistés et relus correctement). Plan de test supprimé après vérification.
