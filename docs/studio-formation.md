# Studio de création de formations — documentation technique

Dernière mise à jour : 2026-10-30 (Formation Diaspora, lot D). Fichiers : `formation-studio.html` (éditeur), `assets/studio-engine.js` (éditeur),
`assets/studio-render.js` (rendu partagé éditeur / aperçu / lecteur), `assets/studio.css`, `server/formation-studio.js` (API), tests dans
`tests/formation-studio.test.js` et `tests/formation-studio-video.test.js`.

## 1. Principe

Une **leçon** de formation peut être un « module studio » (`formation_lecons.studio = 1`). Son contenu est **un document JSON** :

```json
{ "mode": "libre | structure",
  "pages": [ { "id": "p_ab12", "titre": "", "fond": "#fff",
               "elements": [ { "id": "e_xy98", "type": "image", "x": 60, "y": 130, "w": 360, "h": 202, "z": 1, "locked": false,
                               "props": { "url": "https://…", "crop": { "x": 10, "y": 5, "w": 70, "h": 60, "ratio": 1.867 } } } ] } ] }
```

- **mode « libre »** : chaque élément est posé en `x / y / w / h` (pixels) sur une page de 1280 × 720 (la page s'allonge avec le contenu, 6000 px au plus).
- **mode « structure »** : les éléments s'empilent dans l'ordre du tableau (largeur de lecture 860 px) ; `x / y` sont ignorés. Passer d'un mode à l'autre ne perd rien.
- Types d'éléments : `titre`, `soustitre`, `paragraphe`, `citation`, `encadre`, `image`, `video`, `audio`, `separateur`, `lien`, `bouton`, `fichier`, `document`, `tableau`, `validation`, `quiz`.
- Limites : 60 pages, 200 éléments par page, 900 Ko de JSON.

## 2. Sécurité : le navigateur n'est jamais une source de confiance

Tout document reçu (`PUT`) passe par `nettoyerDoc()` (`server/formation-studio.js`) : types connus seulement, nombres bornés, couleurs `#rgb/#rrggbb`, HTML riche
en liste blanche (`SEC.sanitizeRichHtml`), **adresses `https` uniquement** (les liens `http` sont acceptés pour les liens et boutons seulement), identifiants
re-générés s'ils sont invalides ou en double. Ce que le serveur renvoie après sauvegarde est la version nettoyée : l'éditeur la reprend.

## 3. Brouillon, versions, publication

| Table | Rôle |
|---|---|
| `formation_studio_docs` | le **brouillon** courant d'une leçon ; `rev` = compteur de révision, `publiee_version` = version lue par les apprenants |
| `formation_studio_versions` | l'historique : points de restauration (60 derniers) et versions publiées (jamais effacées) |
| `formation_studio_video` | suivi de visionnage des vidéos, par apprenant (voir § 6) |
| `formation_medias` | la bibliothèque de médias du formateur |

- **Sauvegarde automatique** : `PUT …/studio { mode, pages, rev }`. Si `rev` n'est pas celui de la base → **409 `conflit`** (autre onglet / autre appareil).
- **Publier** : `POST …/studio/publier` fige le brouillon en nouvelle version publiée après contrôle des éléments obligatoires (image sans fichier, bouton sans destination…).
- **Les apprenants lisent seulement la version publiée** (`GET …/studio/lecture`). Modifier le brouillon n'affecte ni leur lecture ni leur progression.
- Dépublier, restaurer une version : `POST …/depublier`, `POST …/versions/:n/restaurer`.

## 4. Éditeur (`studio-engine.js`)

- Glisser-déposer HTML5 depuis la bibliothèque d'outils, **événements pointeur** pour le déplacement / redimensionnement (souris, stylet, doigt).
- Aimantation (bords, centres), repères, zoom 20–300 %, annuler / rétablir (80 niveaux), copier / coller, verrouillage, alignement, ordre d'affichage.
- **Sélection par rectangle** (mode libre, souris ou stylet) : glisser sur le fond de la page ; Maj ajoute à la sélection. Au doigt, le glissement sur le fond fait défiler la zone (le rectangle n'existe pas au tactile).
- **Recadrage précis d'une image** : bouton « ✂ Recadrer… » du panneau Propriétés. Le fichier d'origine n'est jamais modifié ; on mémorise la partie visible
  `props.crop = { x, y, w, h, ratio }` (en % de l'image d'origine ; `ratio` = largeur / hauteur de la partie, en pixels). Rapports imposables : libre, 1:1, 4:3, 16:9, 3:4, « comme l'image ».
  Au rendu, l'image est positionnée dans un cadre de ce rapport : **jamais déformée** (voir `.st-crop`, `studio.css`). En mode libre, la hauteur de l'élément est ajustée au rapport.
  « Image entière » retire le recadrage.
- Aperçu ordinateur / tablette / smartphone ; mode tactile : le panneau d'outils devient un tiroir, les poignées grossissent (`@media (pointer: coarse)`).

## 5. Médias

- Images : compressées dans le navigateur (1600 px), envoyées sur le CDN du site ; 4 Mo au plus (l'hébergeur du site refuse au-delà de 4,5 Mo par requête).
- Documents : PDF, Word, Excel, PowerPoint ; PDF et images s'affichent dans la page, les autres sont des cartes à télécharger.
- **Vidéos : envoi direct navigateur → hébergeur vidéo** (Bunny Stream, protocole TUS, `assets/reels-upload.js`, usage `formation`) : MP4 / MOV, 1 h et 1 Go au plus.
  Actif seulement si `BUNNY_STREAM_*` est configuré. Le serveur ne reçoit jamais le fichier : il vérifie ensuite `guid + jeton` et construit lui-même l'adresse.
- **Audio : adresse https seulement.** L'hébergeur vidéo ne prend pas l'audio seul, et le circuit d'envoi de documents n'accepte pas ce format ; un envoi d'audio demanderait
  un nouveau contrôle des octets côté serveur (`server/security.js`) et un nouvel espace de stockage — non fait.

## 6. Suivi de visionnage des vidéos

Option de l'élément vidéo : **« Exiger le visionnage (90 %) pour valider la leçon »** (`props.exiger`). Uniquement pour un fichier lu par la page (le serveur force
`exiger = false` pour YouTube, qu'on ne peut pas suivre sans l'API du lecteur).

1. **Le navigateur** découpe la vidéo en morceaux de 5 s (1000 morceaux au plus) et ne coche un morceau que lorsqu'il est **lu en continu** : un saut dans la vidéo ne compte pas.
   Envoi vers le serveur toutes les 10 s, à la pause, à la fin, et dès que 90 % sont atteints. La lecture reprend là où l'apprenant s'était arrêté.
2. **Le serveur** (`PUT …/studio/video/:elementId { segments, position, duree }`) vérifie l'inscription, le droit sur le module, que l'élément existe bien dans la **version publiée**,
   fusionne (OU) avec ce qui était déjà vu — rien ne se perd — et calcule le pourcentage.
3. **La validation de la leçon est refusée** (`409 video_requise`) tant qu'une vidéo exigée est sous 90 %, par les deux chemins : `POST …/lecons/:id/progression` et `POST …/progression-lot` (mode manuel).
4. Le lecteur ne déclenche la validation automatique qu'une fois le serveur d'accord (`srv`), pour éviter une validation refusée par un enregistrement encore en vol.

Limite assumée : le suivi décourage de sauter la vidéo ; il n'arrête pas quelqu'un qui forgerait ses propres requêtes (le navigateur est le témoin du visionnage).
L'administrateur ou le propriétaire de la formation qui lit la leçon ne reçoit pas de reprise de lecture (les états sont réservés aux apprenants).

## 7. Activités évaluées (quiz, questionnaire, exercice)

Une **seule** activité par leçon (`formation_quiz.lecon_id`), éditée depuis le Studio (`…/studio/activite`, `…/studio/activite/questions`) et corrigée par le serveur ; le corrigé et
l'explication ne sont révélés qu'après réussite. Une leçon qui porte une activité ne se valide que par la réussite (`409 quiz_requis` sinon).

## 8. Test sur écran tactile

Vérifié en émulation tactile dans Edge (événements `touchStart / touchMove / touchEnd` réels envoyés par le protocole DevTools) : sélection au toucher, déplacement d'un élément,
redimensionnement par une poignée, recadrage d'une image au doigt. **Pas encore essayé sur une vraie tablette ou un vrai téléphone** : à faire avant de présenter l'éditeur comme « tactile ».
Points à surveiller sur un vrai appareil : défilement de la zone de travail (`touch-action: pan-x pan-y` sur la zone, `none` sur les éléments en mode libre),
taille des poignées (20 px en mode tactile), clavier virtuel pendant l'édition d'un texte.

## 9. Lancer les tests

```bash
node --test tests/formation-studio.test.js tests/formation-studio-video.test.js
```

Chaque test démarre un vrai serveur sur une **copie isolée** de la base de développement (`tests/_formation-harness.js`) ; aucune clé de service réelle n'est utilisée.

## Pages libres sur téléphone (lot H, 2026-10-30)

Une page en **mode libre** est dessinée pour 1280 px de large. Sur un écran de moins de 720 px, la lecture (`StudioRender.lecture`, partagée par suivre-formation.html, l'aperçu et m.html) ne la réduit plus à l'échelle (texte illisible) : elle la remet **en colonne**, dans l'ordre de lecture (de haut en bas ; les éléments à moins de 40 px d'écart vertical forment une rangée lue de gauche à droite).

- Les tailles de texte sont réduites (48 px → 32 px, jamais sous 15 px) ; les boutons prennent toute la largeur ; images, vidéos, quiz, validations et documents gardent leur comportement (mêmes `data-id`, donc suivi des vidéos et cases à cocher inchangés).
- Un bouton « Voir la mise en page d'origine » (visible seulement sur écran étroit) revient à la page réduite ; « Affichage adapté au téléphone » repasse en colonne.
- Le passage d'un mode à l'autre se fait aussi quand la fenêtre change de largeur (tablette qu'on tourne) ; la page courante est redessinée, les validations déjà cochées sont conservées.
- Ordinateur et mode « structuré » : aucun changement.
