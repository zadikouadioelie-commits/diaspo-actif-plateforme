# Film « Créer son compte sur Diaspo'Actif » — scénario (55 secondes)

**But :** expliquer l'inscription à quelqu'un qui découvre la plateforme, avec une voix, une musique douce et des animations. Même film sur ordinateur et téléphone (format 16/9 qui s'adapte, sous-titres toujours affichés).

**Style :** bleu nuit `#0D2B4E`, bleu vif `#1565C0`, orange `#F26422`, fond sombre dégradé, formes rondes, mouvements doux (ease-out, 0,4 à 0,8 s). Aucune image de banque : tout est dessiné en vectoriel, comme les cartes de la plateforme.

**Voix :** Perle (ElevenLabs, français standard, chaleureuse et claire) — rythme posé, sourire dans la voix. Alternative : Sylvestre (voix masculine, calme). Texte ≈ 116 mots.

**Musique :** nappe douce générée par code (accords ouverts, pulsation lente à 96 battements/min, montée progressive jusqu'à la scène 5, résolution à la fin). Volume bas pendant la voix, qui reste toujours au premier plan.

| # | Temps | Ce qu'on entend (voix) | Ce qu'on voit |
|---|-------|------------------------|---------------|
| 1 | 0:00–0:08 | « Bienvenue sur Diaspo'Actif, la plateforme mondiale qui connecte les diasporas, valorise les talents et accélère le développement des territoires. » | Fond nuit. Des points lumineux apparaissent aux quatre coins d'un globe filaire qui tourne lentement. Des arcs lumineux relient les points entre eux (connexions). Le logo Diaspo'Actif se dessine au centre, puis le globe se réduit en haut à gauche. |
| 2 | 0:08–0:17 | « Créer votre compte prend quelques minutes. Choisissez d'abord votre profil : utilisateur, initiative ou collectivité. » | Trois cartes arrondies glissent depuis le bas : 👤 Utilisateur, 🤝 Initiative, 🏛 Collectivité. Chacune s'illumine quand son nom est prononcé. La carte « Utilisateur » reste et grossit. |
| 3 | 0:17–0:28 | « Indiquez vos origines, votre pays de résidence et votre domaine d'activité. Ajoutez une photo et une courte biographie : elles rendent votre profil humain et facilitent les rencontres. » | La carte devient un formulaire. Les champs se remplissent tout seuls un par un (Pays d'origine, Résidence, Domaine d'activité) avec un petit « clic » à chaque validation. Un avatar vide se transforme en photo (cercle qui se remplit), puis la biographie s'écrit lettre par lettre. |
| 4 | 0:28–0:37 | « Confirmez votre adresse e-mail, puis complétez votre profil public. Une jauge suit votre progression, étape par étape. » | Une enveloppe s'ouvre et un ✅ apparaît. La carte devient une fiche de profil. Une jauge « État de votre profil » monte de 17 % à 100 % par paliers, chaque ligne de la liste se coche. |
| 5 | 0:37–0:47 | « Votre profil est prêt : explorez l'annuaire, rejoignez des événements, soutenez des projets, ouvrez votre boutique et échangez avec la communauté. » | La fiche se réduit en pastille ; autour d'elle quatre icônes éclosent au rythme de la voix : 📖 Annuaire, 📅 Événements, 💚 Soutenir, 🛍 Boutique, puis une bulle 💬 Messages. Des fils de lumière relient la pastille à chacune. La musique atteint son sommet. |
| 6 | 0:47–0:55 | « Diaspo'Actif : rejoignez le réseau, et passez à l'action. Créez votre compte dès maintenant. » | Tout se rassemble en globe lumineux. Texte : **Rejoignez le réseau**. Bouton orange « Créer mon compte » qui pulse doucement. Le logo et l'adresse du site restent affichés jusqu'à la fin de la musique. |

## Détails de réalisation
- **Sous-titres** affichés en bas, synchronisés mot à mot avec la voix ; fond translucide pour rester lisibles sur n'importe quelle scène.
- **Contrôles :** bouton lecture/pause, bouton son (muet par défaut sur téléphone tant qu'on n'a pas touché l'écran, comme l'imposent les navigateurs), barre de progression, « Passer » et « Créer mon compte » toujours accessibles.
- **Accessibilité :** si la personne a choisi « réduire les animations », le film devient une suite d'images fixes avec la voix.
- **Où il apparaît :** un bouton « ▶ Voir comment ça marche (55 s) » sur la page d'inscription, qui ouvre le film dans une fenêtre ; réutilisable sur l'accueil.
- **Poids :** animation en code (quelques Ko) + un seul fichier voix (~600 Ko en MP3). Pas de vidéo lourde.
- **Fichiers :** `motion/inscription-film.html` (film), `assets/media/inscription-voix.mp3` (voix), `assets/inscription-film.js` (lecteur réutilisable).

## Étapes
1. Valider le texte ci-dessus (rien n'est dépensé tant que le texte n'est pas figé).
2. Générer la voix avec Perle (quelques crédits ElevenLabs, estimation affichée avant), écouter, ajuster le rythme.
3. Construire les 6 scènes, caler les durées sur la voix réelle, ajouter la musique.
4. Tester dans le navigateur (ordinateur et téléphone), puis ajouter le bouton sur la page d'inscription.
5. Commit local ; mise en ligne seulement sur ton ordre (push groupé).

---

# Version complète « tutoriel » — 1 min 27 (voix de 79 s)

Voix : Perle (ElevenLabs), `assets/media/inscription-voix-long.mp3`. Les temps de chaque mot viennent de la transcription horodatée de la voix (gratuite) : tout est calé à la seconde près. Si la voix est régénérée, relancer cette mesure.

| Temps | Voix | Écran |
|-------|------|-------|
| 0:00–0:08 | Bienvenue sur Diaspo'Actif, la plateforme qui connecte les diasporas. Voyons ensemble, étape par étape, comment créer votre compte utilisateur. | Logo, globe-réseau doré, devise |
| 0:08–0:20 | **Étape un** : le type de compte. Utilisateur… Initiative… Les comptes étatiques arrivent bientôt. | Les 3 cartes du vrai site, chacune s'illumine quand on la nomme ; étapes 1-2-3 en haut |
| 0:20–0:28 | **Étape deux** : vos informations. Nom, prénom, date de naissance. Les nationalités sont facultatives. | Formulaire « Identité » qui se remplit ; colonne « Nationalités · facultatif » |
| 0:28–0:37 | Pays d'origine et de résidence : c'est grâce à eux que les membres de votre diaspora vous retrouvent. Puis le domaine d'activité. | Champs + mini-carte : point orange (origine) relié en pointillé au point bleu (résidence) |
| 0:37–0:47 | Les publics qui vous concernent, ce que vous recherchez, courte biographie, photo de profil : ces deux éléments sont obligatoires. | Puces sélectionnées, biographie qui s'écrit, photo, pastilles « OBLIGATOIRE » |
| 0:47–0:54 | Mot de passe d'au moins huit caractères, charte et conditions, puis « Créer mon compte ». | Mot de passe (jauge), case de la charte, bouton qui s'enfonce |
| 0:54–1:00 | **Étape trois** : confirmez votre adresse e-mail grâce au lien reçu. Votre compte est créé ! | Enveloppe qui s'ouvre, ✅, éclats dorés |
| 1:00–1:07 | Une jauge indique l'état de votre profil. Complétez-le jusqu'à cent pour cent. | Jauge 17 % → 100 %, liste cochée |
| 1:07–1:15 | Explorez l'annuaire, rejoignez des événements, soutenez des projets, ouvrez votre boutique, échangez. | Profil au centre, 5 rubriques colorées |
| 1:15–1:27 | Diaspo'Actif : rejoignez le réseau, et passez à l'action. Créez votre compte dès maintenant. | Lauriers, slogan, bouton orange |

Le lecteur choisit le film : `InscriptionFilm.ouvrir()` (complet, par défaut) ou `InscriptionFilm.ouvrir({version:'court'})` (55 s). La voix est chargée entièrement avant lecture (saut à n'importe quel instant fiable) et l'horloge suit la voix même si le navigateur suspend les animations.
