# Documents internes de conformité — Diaspo'Actif

Document interne, **non public**, non lié depuis le site. Rédigé le 12 octobre 2026 pour
prouver la maîtrise réelle des opérations, à l'usage de l'équipe Diaspo'Actif (et le cas
échéant d'un contrôle CNIL). Chaque section décrit l'état **réel** constaté dans le code à
cette date, pas un objectif théorique — les manques sont marqués comme tels plutôt que maquillés.

---

## 1. Registre des traitements RGPD

| Traitement | Finalité | Base légale | Données | Destinataires | Durée |
|---|---|---|---|---|---|
| Création et gestion de compte | Exécution du contrat | Art. 6.1.b | Identité, e-mail, mot de passe haché, pays | Vercel, Neon | Compte actif + 3 ans après dernière connexion |
| Mise en relation entre membres | Exécution du contrat | Art. 6.1.b | Profil public, publications | Vercel, Neon | Idem |
| Nationalités (donnée sensible) | Mise en relation diaspora | Art. 9.2.a — consentement explicite | Nationalité(s) | Jamais partagée publiquement | Idem |
| Paiements Premium / boutique / cagnottes | Exécution du contrat | Art. 6.1.b | Montant, statut transaction (jamais la carte complète) | Stripe (sous-traitant paiement) | 10 ans (obligation comptable) |
| Sécurité et prévention des fraudes | Intérêt légitime | Art. 6.1.f | Logs IP, tentatives de connexion | Vercel, Neon | 12 mois (logs) |
| Envoi d'e-mails transactionnels | Exécution du contrat | Art. 6.1.b | E-mail, nom | Resend (sous-traitant e-mail) | Durée du compte |
| Statistiques de fréquentation | Intérêt légitime | Art. 6.1.f | IP hachée à sens unique, change chaque jour | Interne uniquement | 1 jour (pas de persistance identifiante) |
| Koffi, tuteur IA des formations (ajouté le 2026-10-30 ; RÉSERVÉ AUX MAJEURS : confirmation « 18 ans ou plus » datée dans `kofi_majorite`, date de naissance < 18 ans = fermé ; les mineurs se forment sans Koffi — décision « voie A », réponse « Non » à la question d'Anthropic sur les produits destinés aux moins de 18 ans ; FERMÉ HORS DES PAYS PRIS EN CHARGE par le fournisseur d'IA : liste de 185 pays relevée le 2026-10-30 sur anthropic.com/supported-countries, pays déduit de l'IP par l'hébergeur (en-tête `x-vercel-ip-country`), non stocké, pays inconnu = autorisé, interrupteur `pays_filtre_actif`, liste visible dans l'administration ; À RE-VÉRIFIER le 2026-11-12, date d'entrée en vigueur annoncée de la nouvelle politique) | Exécution du contrat (service demandé par l'élève) | Art. 6.1.b | Texte libre des questions et réponses ; envoyés au prestataire d'IA : question, 6 derniers messages, extraits du cours autorisés — JAMAIS nom, e-mail, identifiant | Anthropic, PBC (sous-traitant IA, États-Unis) ; Vercel, Neon | Conversations : 60 jours max puis purge automatique (cron `/api/cron/kofi-purge`), effacées à la suppression du compte ; recharges de crédit : 10 ans ; compteurs d'usage et solde (sans contenu) : durée du compte |
| Koffi, assistant de création des formateurs (ajouté le 2026-10-31 ; même cadre que le tuteur : majeurs, pays pris en charge, modèle verrouillé ; NE MODIFIE RIEN sans clic « Appliquer » du formateur — tables kofi_actions, kofi_dossiers) | Exécution du contrat (service demandé par le formateur) | Art. 6.1.b | Messages du formateur, textes collés pour organisation, plan de la formation (titres), extraits de ses propres leçons sur demande, noms de dossiers de discussion ; envoyés au prestataire d'IA — JAMAIS nom, e-mail, identifiant, ni donnée d'apprenant | Anthropic, PBC (sous-traitant IA, États-Unis) ; Vercel, Neon ; Bunny (image de carte mentale générée) | Conversations et missions proposées : 60 jours max puis purge automatique, effacées à la suppression du compte ; recharges de crédit : 10 ans ; compteurs d'usage et solde (sans contenu) : durée du compte |
| Koffi, conseiller de l'Annuaire (ajouté le 2026-11-01 ; même cadre que le tuteur : majeurs, pays pris en charge, modèle verrouillé ; LE MODÈLE NE VOIT AUCUN PROFIL : il transforme la demande en critères (JSON revalidé côté serveur), c'est le serveur qui cherche, calcule le pourcentage et construit les liens — conversations dans kofi_conversations/kofi_messages (marqueur ASSISTANT_ANNUAIRE), colonne `users.kofi_non_propose` ; SEULS PEUVENT ÊTRE PROPOSÉS les comptes Premium avec photo + descriptif, visibles, non supprimés/démo/mineurs, n'ayant pas coché « Ne pas être proposé par Koffi » (case par défaut décochée, page Confidentialité site + téléphone) ; RÉCIPROCITÉ : qui refuse d'être proposé ne peut pas utiliser le conseiller ; aucune décision automatisée à effet juridique ; avertissement dans la fenêtre de Koffi et sur le profil) | Exécution du contrat (service demandé par l'utilisateur) ; intérêt légitime pour la proposition des profils publics, avec droit d'opposition par la case | Art. 6.1.b / 6.1.f | Texte libre de la demande et des réponses ; envoyés au prestataire d'IA : demande et derniers messages — JAMAIS nom, e-mail, identifiant, ni aucun profil ; champs PUBLICS des profils lus par nos serveurs seulement (jamais e-mail, téléphone, adresse, date de naissance, messages) | Anthropic, PBC (sous-traitant IA, États-Unis) ; Vercel, Neon | Conversations : 60 jours max puis purge automatique, effacées à la suppression du compte ; case d'opposition : durée du compte Mode LISTE (2026-11-01) : sur demande expresse (« fais-moi la liste de… »), jusqu'à 30 profils au lieu de 5 ; mêmes règles d'éligibilité (Premium, photo, descriptif, case « ne pas être proposé » respectée), mêmes champs publics, aucun export ni téléchargement ; plafond par compte et par jour (réglage `plafond_jour_liste_annuaire`, 10 par défaut) contre le moissonnage. |
| Koffi, guide des événements (ajouté le 2026-11-01 ; même cadre que le conseiller de l'Annuaire : majeurs, pays pris en charge, modèle verrouillé ; LE MODÈLE NE VOIT AUCUN ÉVÉNEMENT NI AUCUNE DONNÉE DU PROFIL : il transforme la demande en critères (JSON revalidé côté serveur : thème, ville, pays, période, gratuit / payant, en ligne), c'est le serveur qui cherche, classe par proximité dans le temps et construit les liens ; « ma ville » / « mon pays » : la ville et le pays du profil sont lus par le serveur et JAMAIS transmis au prestataire ; seuls les événements PUBLICS À VENIR sont proposés (jamais brouillon, annulé, privé, abonnés, boutique, invitation), 8 cartes au plus ; conversations dans kofi_conversations/kofi_messages (contexte « evenements », marqueur ASSISTANT_EVENEMENTS) ; accessible aux comptes sans Premium (15 questions offertes, puis recharge) ; ne propose aucune inscription automatique ; aucune décision automatisée à effet juridique) | Exécution du contrat (service demandé par l'utilisateur) | Art. 6.1.b | Texte libre de la demande et des réponses ; envoyés au prestataire d'IA : demande, derniers messages et date du jour — JAMAIS nom, e-mail, identifiant, ville du profil, ni aucun événement ; ville / pays du profil lus par nos serveurs seulement | Anthropic, PBC (sous-traitant IA, États-Unis) ; Vercel, Neon | Conversations : 60 jours max puis purge automatique, effacées à la suppression du compte ; plafond par compte et par jour (réglage `plafond_jour_evenements`, 60 par défaut) contre l'abus |
| Koffi, assistant de l'administrateur (ajouté le 2026-11-01 ; réservé aux comptes `administrateur`, revérifié à CHAQUE appel et à chaque exécution d'une tâche) : le modèle ne reçoit que des CHIFFRES AGRÉGÉS de la plateforme (comptes, nouveaux inscrits, formations, événements… : aucun nom, aucun e-mail) et les messages de l'administrateur ; il répond en JSON revalidé côté serveur et ne peut agir que par un catalogue fermé (envoyer une notification aux membres, se rappeler quelque chose ; ouvrir un module) — jamais d'action destructive en autonomie. Chaque tâche : « Autonomie » (exécutée seule à l'heure dite, heure de Paris) ou « Je valide moi-même » (l'administrateur est prévenu dans sa cloche puis valide). Notifications aux membres : aperçu du nombre de destinataires, 1 par compte et par 24 h au plus, mêmes filtres d'audience que le module Notifications. Historique des tâches (`kofi_admin_taches`) conservé comme trace d'audit ; conversations 60 jours ; échéances traitées « en passant » (cloche des comptes connectés, ≤ 1/min) + tâche planifiée quotidienne (offre Vercel gratuite). Réglages : plafonds Budget IA (`plafond_jour_admin`). Compte illimité (rien décompté). Sous-traitant : Anthropic Ireland (même cadre que les autres surfaces Koffi). |
| Crédit d'utilisation de Koffi (ajouté le 2026-11-01 ; portefeuille unique en euros pour le tuteur, l'assistant de création et le conseiller ; crédit mensuel Premium 0,50 € non reporté ; 15 questions offertes sans Premium, une fois ; recharge minimum 3 € payés = 1 € de crédit ; crédit acheté valable 12 mois ; comptes officiel et administrateurs sans limite ; « Que sais-tu faire ? » toujours gratuit ; renonciation au droit de rétractation recueillie par case obligatoire avant chaque paiement, date + version conservées ; crédit versé UNIQUEMENT par webhook Stripe signé) | Exécution du contrat | Art. 6.1.b | Solde, lots de crédit, montant/date des recharges, version du consentement (jamais la carte) | Stripe (sous-traitant paiement) ; Vercel, Neon | Recharges : 10 ans (obligation comptable) ; solde : durée du compte |

Source publique correspondante : [politique-confidentialite.html](politique-confidentialite.html) §2-4.
**Manque identifié :** ce tableau n'existait sous aucune forme consolidée avant ce jour — à tenir à jour à chaque nouveau traitement de données.

## 2. Registre des incidents de sécurité

Mécanisme réel en place : un journal d'erreurs et d'événements de sécurité côté serveur
(voir mémoire `project_monitoring_maison.md` — remplace Sentry, construit en interne).
Canal de signalement d'un incident : `contact@diaspoactif.com` (aucune adresse dédiée
`security@` à ce jour).
**Manque identifié :** pas de registre structuré (date, gravité, personnes concernées,
mesures prises, notification CNIL oui/non) distinct du simple journal technique — à créer
si un incident réel survient, ou en amont sous forme de modèle à remplir.

## 3. Matrice des rôles et permissions

| Rôle | Portée d'accès |
|---|---|
| `utilisateur` | Son propre profil et compte, contenus publics |
| `initiative` / `collectivite` | Idem + gestion de sa structure (vitrine, membres, événements, cagnottes) |
| `administrateur` | Supervision plateforme entière (modération, comptes, finances), actions journalisées |

Chaque route serveur sensible vérifie le rôle et/ou la propriété de la ressource côté
serveur (pas seulement côté interface) avant d'agir — vérifié par échantillonnage dans
`server/index.js` (ex. `user.role === 'administrateur' || Number(user.id) === Number(owner_user_id)`).

## 4. Procédure de création et suppression des comptes administrateurs

**État réel :** il n'existe **aucune route ni interface** pour promouvoir un compte au rôle
`administrateur` — l'inscription publique bloque explicitement ce rôle. La promotion se fait
**uniquement par modification manuelle directe en base de données** par la personne ayant
accès à Neon/la base de production. Il n'y a donc pas de procédure formalisée à proprement
parler, juste une contrainte technique (impossible par l'interface).
**Manque identifié :** aucune traçabilité automatique de *qui* a promu *quel* compte et
*quand* — seule la trace Neon (si activée) en garderait l'historique. À documenter en
pratique (qui a les accès Neon, sous quelle procédure) plutôt qu'en code.

## 5. Inventaire des prestataires et sous-traitants

| Prestataire | Rôle | Localisation | Données concernées |
|---|---|---|---|
| Vercel Inc. | Hébergement du site et de l'application | États-Unis | Toutes (infrastructure) |
| Neon Inc. | Base de données PostgreSQL | États-Unis (région US East) | Toutes (stockage) |
| Resend Inc. | Envoi d'e-mails transactionnels | États-Unis | E-mail, nom, contenu du message envoyé |
| Stripe | Paiements (Premium, boutique, cagnottes) | États-Unis / international | Données de paiement (jamais la carte complète côté Diaspo'Actif) |
| PayPal | Paiements (en préparation, pas encore en production) | International | — (pas encore utilisé) |
| Bunny.net | CDN / stockage des fichiers déposés (photos, logos, documents, médias) | International (diffusion par point de présence le plus proche) | Fichiers uploadés par les utilisateurs — ajouté le 2026-10-12, oublié jusque-là |
| Anthropic Ireland, Limited (contractant pour un client de l'EEE selon le préambule des conditions commerciales ; Anthropic, PBC hors EEE) | Intelligence artificielle de Koffi (modèle Haiku, appelé côté serveur uniquement ; clé `ANTHROPIC_API_KEY` jamais côté navigateur) | Irlande (contractant) ; lieu exact du traitement non précisé dans les conditions ni dans le DPA — transferts hors UE encadrés par les clauses contractuelles types (décision d'exécution (UE) 2021/914) ; liste des sous-traitants ultérieurs consultée le 2026-10-30 sur trust.anthropic.com/subprocessors (22 entrées) : infrastructure cloud Google Cloud, Amazon Web Services, Microsoft Azure (« Worldwide »), CDN Cloudflare (« Worldwide, local au client »), facturation Stripe (États-Unis), support Intercom (États-Unis) / Nutun (Afrique du Sud) / Boldr (Canada), communications Twilio, Iterable, analyse d'erreurs Sentry, lutte contre la fraude Sift, Arkose Labs, hCaptcha (États-Unis ou monde) ; autres produits non utilisés ici (recherche web, voix, vérification d'identité grand public, offre gouvernementale). Page JavaScript : bouton « Subscribe to updates » pour être prévenu des changements (à faire avec contact@diaspoactif.com) | Question de l'élève, 6 derniers messages, extraits du cours auxquels il a accès ; AUCUNE donnée d'identité. Conservation chez le prestataire 30 jours par défaut puis suppression (consultation possible par Anthropic à des fins de sûreté et de sécurité), pas d'entraînement sur ces contenus (conditions commerciales). Console vérifiée le 2026-10-30 : Development Partner Program NON rejoint, « retours des utilisateurs » désactivé, HIPAA non activé — ajouté le 2026-10-30, à l'activation de Koffi |

Source publique correspondante : [politique-confidentialite.html](politique-confidentialite.html) §5 et §5 bis (Koffi), [mentions-legales.html](mentions-legales.html) (hébergement et intelligence artificielle).

## 6. Accords de traitement des données (DPA) avec les prestataires

**Manque identifié — à vérifier par l'utilisateur, hors de portée du code :** ce document ne
peut pas confirmer l'existence d'un DPA signé avec Vercel/Neon/Resend/Stripe — ce sont des
contrats externes que je n'ai pas la visibilité pour vérifier. Les quatre prestataires
proposent un DPA standard (souvent via leurs conditions générales + clauses contractuelles
types UE), généralement activable depuis le tableau de bord de chaque compte — à confirmer
et archiver une copie signée/acceptée de chacun.

**Anthropic (ajouté le 2026-10-30 ; vérifié sur les pages officielles le même jour — conditions commerciales du 17 juin 2025, DPA du 24 février 2025) :** le DPA est « incorporé par référence » aux conditions commerciales (section C) : aucune signature séparée, mais l'archiver (page anthropic.com/legal/data-processing-addendum, bouton « Download PDF »). Le client est responsable de traitement, Anthropic sous-traitant ; l'importateur de données est l'entité Anthropic qui a signé le contrat (Anthropic Ireland, Limited pour l'EEE) ; sous-traitants ultérieurs autorisés de façon générale, information préalable raisonnable, opposition possible sous 15 jours ; notification d'une violation sous 48 h ; suppression sous 30 jours après la fin du contrat. Obligation du client (D.3) : informer les utilisateurs que les réponses ne doivent pas être crues sans vérification — fait (fenêtre d'information de Koffi, CGU art. 46 bis). Détail d'origine : d'après la documentation du prestataire, son accord de traitement (DPA), qui inclut les clauses contractuelles types, est automatiquement intégré à ses conditions commerciales : il suffit d'avoir accepté ces conditions à la création du compte API. **À faire par l'utilisateur à la création du compte Anthropic :** accepter les conditions commerciales (pas les conditions grand public), archiver la copie du DPA, et vérifier dans la console que le partage de données pour l'amélioration des modèles reste désactivé.

## 7. Procédure de gestion des demandes RGPD (droit d'accès, rectification, suppression…)

**État réel :** une seule voie d'entrée aujourd'hui — l'utilisateur écrit à
`contact@diaspoactif.com` ; traitement manuel par l'équipe, engagement de réponse sous
30 jours (voir politique de confidentialité §9). La suppression de compte a par ailleurs un
parcours semi-automatisé : `DELETE /api/auth/account` masque immédiatement le compte, la
suppression RGPD définitive (cascade réelle sur toutes les tables) passe par une demande
admin-médiée avec délai de grâce (voir mémoire `project_captcha_delete_account.md`).
**Manque identifié :** pas de procédure interne écrite étape par étape pour traiter une
demande d'accès/rectification/portabilité reçue par e-mail — seule la suppression a un vrai
flux technique.

## 8. Plan de sauvegarde et de reprise après incident

**État réel, documenté publiquement aussi** (voir [securite-informatique.html](securite-informatique.html) §4) :
exports de sauvegarde de la base via `server/backup.js`, déclenchés **manuellement**,
aucune automatisation planifiée, aucun test de restauration formalisé, aucun objectif de
reprise (RTO) ni de perte de données admissible (RPO) défini à ce jour. Décision prise le
2026-10-12 par l'utilisateur de ne pas automatiser pour l'instant.
**Manque identifié :** RTO/RPO à définir et automatisation à construire si/quand décidé.

## 9. Registre des demandes de modération et de signalement

**État réel :** les signalements sont déjà stockés en base de façon structurée —
`vitrine_avis_signalements` (avis), le système de signalement général de contenus/comptes
(`assets/signalement.js` côté client, voir mémoire `project_monitoring_maison.md` : "la
modération signalements existait déjà"), avec statut, motif, auteur du signalement. C'est
donc déjà, de fait, un registre — mais interrogeable uniquement par requête technique, pas
sous forme de rapport consolidé exportable pour un contrôle externe.
**Manque identifié :** pas d'export/rapport périodique prêt à présenter (nombre de
signalements, délai moyen de traitement, décisions prises) — à construire si besoin réel.

## 10. Plan de réponse aux incidents

**État réel :** couvert au niveau *obligation légale* pour les violations de données
(notification CNIL sous 72h, voir [politique-confidentialite.html](politique-confidentialite.html) §8),
et au niveau *canal de signalement* (contact@diaspoactif.com, voir point 2 ci-dessus).
**Manque identifié :** pas de plan écrit étape par étape (qui fait quoi, dans quel ordre,
avec quels modèles de communication) au-delà de l'obligation CNIL elle-même.

## 11. Inventaire des données et de leurs durées de conservation

Déjà publié et exact : [politique-confidentialite.html](politique-confidentialite.html) §4
(compte actif : durée d'utilisation + 3 ans ; compte supprimé : 30 jours ; logs : 12 mois ;
messages privés : jusqu'à suppression par les parties ; facturation : 10 ans ; conversations Koffi : 60 jours max).
Rien à ajouter ici — ce point est déjà couvert publiquement ET correspond à l'état réel du code.

## 12. Procédure de contrôle des accès et de revue des permissions

**État réel :** le contrôle d'accès est vérifié *à chaque requête* côté serveur (voir point 3,
matrice des rôles) — c'est un contrôle continu et automatique, pas une revue périodique
manuelle. Il n'existe pas de revue périodique documentée (ex. trimestrielle) de la liste des
comptes administrateurs ou de leurs accès Neon/Vercel/GitHub.
**Manque identifié :** pas de revue périodique formalisée des accès aux outils
d'infrastructure (Neon, Vercel, GitHub, Resend, Stripe) — à instaurer si l'équipe grandit
au-delà d'une seule personne ayant ces accès.

---

**Résumé des vrais manques (hors ce qui est déjà couvert par le code ou les pages publiques) :**
traçabilité des promotions admin (point 4), confirmation des DPA signés avec les 4
prestataires (point 6), procédure RGPD écrite étape par étape (point 7), RTO/RPO de
sauvegarde (point 8), export/rapport de modération (point 9), plan de réponse aux incidents
écrit (point 10), revue périodique des accès infrastructure (point 12). Aucun de ces points
n'est bloquant pour fonctionner aujourd'hui — ce sont des formalisations à faire au fur et à
mesure que l'équipe et le volume grandissent.
