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
| Koffi, tuteur IA des formations (ajouté le 2026-10-30 ; RÉSERVÉ AUX MAJEURS : confirmation « 18 ans ou plus » datée dans `kofi_majorite`, date de naissance < 18 ans = fermé ; les mineurs se forment sans Koffi — décision « voie A », réponse « Non » à la question d'Anthropic sur les produits destinés aux moins de 18 ans) | Exécution du contrat (service demandé par l'élève Premium) | Art. 6.1.b | Texte libre des questions et réponses ; envoyés au prestataire d'IA : question, 6 derniers messages, extraits du cours autorisés — JAMAIS nom, e-mail, identifiant | Anthropic, PBC (sous-traitant IA, États-Unis) ; Vercel, Neon | Conversations : 60 jours max puis purge automatique (cron `/api/cron/kofi-purge`), effacées à la suppression du compte ; achats : 10 ans ; compteurs d'usage (sans contenu) : durée du compte |

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
| Anthropic, PBC | Intelligence artificielle de Koffi (modèle Haiku, appelé côté serveur uniquement ; clé `ANTHROPIC_API_KEY` jamais côté navigateur) | États-Unis | Question de l'élève, 6 derniers messages, extraits du cours auxquels il a accès ; AUCUNE donnée d'identité. Conservation chez le prestataire 30 jours par défaut puis suppression (consultation possible par Anthropic à des fins de sûreté et de sécurité), pas d'entraînement sur ces contenus (conditions commerciales). Console vérifiée le 2026-10-30 : Development Partner Program NON rejoint, « retours des utilisateurs » désactivé, HIPAA non activé — ajouté le 2026-10-30, à l'activation de Koffi |

Source publique correspondante : [politique-confidentialite.html](politique-confidentialite.html) §5 et §5 bis (Koffi), [mentions-legales.html](mentions-legales.html) (hébergement et intelligence artificielle).

## 6. Accords de traitement des données (DPA) avec les prestataires

**Manque identifié — à vérifier par l'utilisateur, hors de portée du code :** ce document ne
peut pas confirmer l'existence d'un DPA signé avec Vercel/Neon/Resend/Stripe — ce sont des
contrats externes que je n'ai pas la visibilité pour vérifier. Les quatre prestataires
proposent un DPA standard (souvent via leurs conditions générales + clauses contractuelles
types UE), généralement activable depuis le tableau de bord de chaque compte — à confirmer
et archiver une copie signée/acceptée de chacun.

**Anthropic (ajouté le 2026-10-30) :** d'après la documentation du prestataire, son accord de traitement (DPA), qui inclut les clauses contractuelles types, est automatiquement intégré à ses conditions commerciales : il suffit d'avoir accepté ces conditions à la création du compte API. **À faire par l'utilisateur à la création du compte Anthropic :** accepter les conditions commerciales (pas les conditions grand public), archiver la copie du DPA, et vérifier dans la console que le partage de données pour l'amélioration des modèles reste désactivé.

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
