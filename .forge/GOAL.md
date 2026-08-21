# Goal spec (verbatim, as given at the /forge invocation)

Construis et rends réellement exécutable l'application décrite ci-dessous. Ne considère le goal comme atteint que lorsque l'application démarre avec Docker Compose sur un Mac Apple Silicon, que les parcours critiques fonctionnent de bout en bout en mode démonstration sans identifiants externes, que les intégrations réelles sont câblées et documentées, que les tests automatisés passent, que les contrôles de sécurité passent, et que la documentation permet à une personne technique de l'installer, la configurer, la sauvegarder et la restaurer. Continue à inspecter, implémenter, lancer, tester et corriger jusqu'à satisfaire tous les critères d'acceptation. Si une clé, un consentement OAuth ou une action humaine est indispensable, n'invente rien : implémente l'écran de configuration, le mode démo et la validation correspondante, documente l'étape humaine exacte, puis poursuis tout le reste.

## 1. Mission produit

Créer une application web mobile personnelle, en français, installable comme PWA sur iPhone et auto-hébergée sur un Mac mini Apple Silicon allumé en permanence. Elle doit devenir le tableau de bord et le coach quotidien d'un homme de 38 ans, mesurant 183 cm et pesant actuellement environ 89 kg, avec un objectif progressif d'environ 76 kg sur 9 mois.

L'application doit réunir dans une expérience cohérente :

1. suivi de santé et saisie manuelle ;
2. synchronisation Withings Body Smart ;
3. import Apple Health via un raccourci iOS ;
4. import contrôlé des prises de sang ;
5. coach sportif adaptatif avec séances guidées ;
6. coach nutritionnel avec menus, recettes, calories, macros et courses ;
7. planification à partir de Google Calendar ;
8. notifications push iPhone, rappels calendrier et bilans par e-mail.

L'application est strictement individuelle. Ne pas construire de fonctionnalités sociales, multi-coachs, professionnelles, de facturation ou de marketplace.

## 2. Principes non négociables

- Ne jamais inclure la tension artérielle : ni champ, ni graphique, ni recommandation, ni donnée Withings ou Apple Health, ni valeur extraite d'un PDF. Si un PDF en contient, l'ignorer explicitement.
- Ne jamais présenter l'application comme un médecin, un dispositif médical ou un outil de diagnostic.
- Les analyses de laboratoire et recommandations doivent être pédagogiques, prudentes, sourcées et assorties d'une invitation à consulter un professionnel lorsque nécessaire.
- Les changements de programme sportif, de calories cibles ou de menus sont proposés par le coach puis confirmés par l'utilisateur avant application.
- Les données sensibles restent sur le Mac mini autant que possible. Claude ne reçoit que les données minimales nécessaires à une tâche précise.
- Ne jamais envoyer à Claude un dossier médical complet, l'historique brut intégral, des elements confidentiels, jetons, identifiants, métadonnées inutiles ou une photo non nécessaire.
- Toute estimation produite par IA doit être signalée comme estimation et rester modifiable.
- Utiliser des unités françaises : kg, cm, km, kcal, g, mmol/L ou g/L selon l'analyse, et dates Europe/Paris.
- Accessibilité, rapidité sur iPhone et simplicité d'usage priment sur la densité fonctionnelle.

## 3. Architecture cible

Choisir une stack TypeScript moderne, maintenue et documentée. Préférence :

- monorepo simple ;
- application Next.js récente avec App Router, rendu serveur lorsque pertinent et PWA ;
- PostgreSQL ;
- Prisma ou équivalent mature ;
- tâches planifiées persistantes sans dépendance disproportionnée ;
- Docker Compose avec services applicatif et base de données ;
- stockage des médias et PDF sur volume local chiffrable, jamais dans l'image Docker ;
- tests unitaires/intégration avec Vitest ou équivalent ;
- tests E2E Playwright incluant un viewport iPhone et WebKit ;
- composants accessibles et design mobile-first.

Tu peux modifier ces choix si une alternative réduit nettement la complexité ou le risque. Documente alors brièvement la décision dans `docs/architecture.md`.

L'application doit écouter uniquement sur `127.0.0.1` côté hôte. L'accès distant principal passe par Tailscale Serve en HTTPS, pas par Tailscale Funnel et pas par un port ouvert sur le LAN. Fournir un script idempotent et une documentation pour exposer le port local via `tailscale serve` sur l'URL privée `*.ts.net`.

Le nom de domaine Tailscale final doit être configurable car il détermine l'origine WebAuthn et le RP ID des passkeys.

## 4. Authentification et sécurité

Implémenter un compte propriétaire unique avec :

- passkey WebAuthn comme méthode principale, compatible Safari/iPhone et Touch ID sur Mac ;
- mot de passe complexe de secours, haché avec Argon2id et paramètres modernes ;
- session sécurisée en cookie `HttpOnly`, `Secure`, `SameSite=Strict`, avec rotation et expiration ;
- protection CSRF, validation stricte des entrées, limitation de débit et journal d'audit local ;
- procédure d'initialisation du premier compte utilisable une seule fois ;
- procédure locale de récupération documentée sans question secrète ni envoi de mot de passe par e-mail ;
- chiffrement applicatif des identifiants OAuth et jetons au repos à l'aide d'une clé maître fournie par variable d'environnement ;
- aucune valeur confidentielle dans Git, les logs, les réponses API ou le navigateur ;
- en-têtes de sécurité et CSP compatibles avec les médias autorisés ;
- liste explicite des origines autorisées.

Ne pas utiliser les en-têtes Tailscale comme unique authentification. Tailscale constitue la première barrière réseau ; la passkey ou le mot de passe reste obligatoire.

Ajouter un écran « Confidentialité et données envoyées à Claude » montrant, avant chaque type d'analyse, les catégories minimales transmises. Permettre de désactiver séparément l'analyse nutritionnelle par photo, la génération de menus et les explications santé par IA.

## 5. Modèle de données et provenance

Créer un modèle de données normalisé qui distingue :

- valeur brute ;
- unité et fuseau ;
- source (`withings`, `apple_health_shortcut`, `manual`, `lab_pdf`, `derived`, `demo`) ;
- date de mesure et date d'import ;
- niveau de confiance ;
- correction manuelle éventuelle ;
- provenance/version de l'import ;
- doublon détecté et règle de déduplication.

Conserver l'historique des corrections importantes. Prévoir export complet JSON et CSV, export PDF lisible d'un bilan, et suppression définitive contrôlée.

## 6. Tableau de bord santé

L'accueil doit répondre en moins de dix secondes à : « Que dois-je faire aujourd'hui et est-ce que ma santé s'améliore ? »

Afficher :

- plan du jour : séance, repas, mesures et actions ;
- poids actuel, moyenne mobile sur 7 jours et trajectoire vers 76 kg en 9 mois ;
- tour de taille et tendance ;
- activité, sommeil, fréquence cardiaque, récupération et VO2 max si disponibles ;
- adhérence au programme sur 7 et 28 jours ;
- résumé simple des dernières analyses biologiques ;
- alertes de données manquantes ou de synchronisation, sans alarmisme.

Ne pas surinterpréter les valeurs quotidiennes de composition corporelle. Afficher surtout les tendances et expliquer que l'hydratation influence les estimations de la balance.

### Saisie manuelle

Prévoir des parcours très rapides pour :

- tour de taille ;
- énergie et fatigue ;
- faim et satiété ;
- repas texte ou photo ;
- ressenti avant et après une séance ;
- notes libres.

## 7. Intégration Withings Body Smart

Implémenter un adaptateur conforme à la documentation officielle actuelle de Withings. Lire d'abord `https://developer.withings.com/llms.md` et les pages officielles pertinentes ; ne pas deviner les endpoints.

Fonctions :

- OAuth 2.0 web avec PKCE/state si supporté par l'API ;
- stockage chiffré et rotation des jetons ;
- import historique initial puis synchronisation incrémentale ;
- synchronisation manuelle et tâche périodique ;
- écran d'état, dernière synchronisation, erreurs actionnables et reconnexion ;
- déduplication idempotente ;
- mode démo avec jeu de données réaliste.

Importer uniquement les métriques disponibles et utiles de Body Smart, notamment poids, IMC, masse grasse, masse musculaire, graisse viscérale, eau corporelle et fréquence cardiaque debout si présentes. Ne jamais importer la tension artérielle.

Comme l'application reste privée derrière Tailscale, ne pas rendre un webhook public obligatoire. Utiliser le polling incrémental comme fonctionnement par défaut. Documenter le webhook seulement comme amélioration optionnelle nécessitant une exposition publique sécurisée distincte.

## 8. Apple Health via raccourci iOS

Une PWA ne lit pas directement HealthKit. Ne pas implémenter ou promettre un accès HealthKit depuis le navigateur.

Construire à la place :

- un endpoint HTTPS authentifié et idempotent pour recevoir les données d'un raccourci iOS ;
- un jeton d'ingestion révocable, distinct de la session web, affiché une seule fois et stocké chiffré ;
- signature ou clé partagée d'envoi, horodatage et protection anti-rejeu ;
- schéma JSON versionné avec validation stricte ;
- import par lots, gestion des doublons et journal des erreurs ;
- écran guidé permettant de construire/configurer le raccourci dans l'app Raccourcis ;
- exemple de payload, requête de test et diagnostic de connexion ;
- si un fichier `.shortcut` fiable et installable ne peut pas être généré/signé automatiquement, ne pas le simuler : fournir des instructions illustrées étape par étape.

Le raccourci doit pouvoir envoyer :

- pas, distance et étages ;
- séances et minutes d'activité ;
- fréquence cardiaque utile, fréquence au repos et récupération lorsqu'elles sont disponibles ;
- VO2 max / forme cardiovasculaire ;
- sommeil et phases disponibles.

Ne jamais demander ni envoyer la tension artérielle.

## 9. Prises de sang

Créer deux parcours :

1. formulaire structuré manuel ;
2. import d'un PDF avec extraction assistée.

Pour le PDF :

- le fichier reste local pour l'extraction par défaut ;
- prévoir un parseur local texte/OCR lorsque nécessaire ;
- afficher chaque valeur extraite avec analyte, résultat, unité, intervalle de référence, date et niveau de confiance ;
- exiger une validation ou correction explicite avant sauvegarde ;
- ne jamais sauvegarder silencieusement une valeur ambiguë ;
- permettre de conserver le PDF localement ou de le supprimer après validation ;
- ignorer toute tension artérielle rencontrée ;
- gérer les unités et intervalles différents selon les laboratoires.

Les tendances doivent couvrir au minimum glycémie à jeun, HbA1c si disponible, cholestérol total, HDL, LDL, non-HDL, triglycérides, ALAT, ASAT, GGT, créatinine/eGFR, CRP et ferritine, tout en permettant d'ajouter d'autres analyses.

Les explications doivent être écrites en français courant, distinguer clairement valeur, tendance et interprétation, et ne jamais diagnostiquer.

## 10. Coach sportif

Créer un plan adaptatif de 3 à 5 séances par semaine, préparé le dimanche soir puis soumis à confirmation. Utiliser Google Calendar en lecture pour détecter les disponibilités ; ne lire que les plages temporelles et métadonnées strictement nécessaires. Après confirmation, permettre la création des événements/rappels choisis dans un calendrier dédié.

Types de séances :

- cardio chez Neoness ;
- calisthénie à domicile avec tapis ou sans matériel ;
- récupération active/marche si pertinent.

Contraintes : aucune douleur ou limitation déclarée actuellement. La durée est adaptative selon la journée. Les zones cardiaques sont des recommandations chiffrées affichées avant et pendant la séance ; l'application ne suit pas la fréquence cardiaque en direct.

Chaque séance guidée doit proposer :

- objectif, durée, échauffement, blocs, récupération et retour au calme ;
- photo/animation et vidéo de démonstration ;
- consignes courtes en français ;
- chronomètres, séries, répétitions, temps de repos et progression ;
- consignes audio via synthèse vocale du navigateur avec option muette ;
- variantes plus faciles et plus difficiles ;
- possibilité de remplacer un mouvement ;
- saisie de l'effort perçu, réussite, douleur éventuelle et commentaires ;
- proposition de progression lors de la planification suivante, toujours à confirmer.

### Catalogue de mouvements

Créer un catalogue initial réellement utilisable. Rechercher sur Internet des démonstrations fiables et adaptées, en privilégiant sources officielles, professionnels reconnus et contenus intégrables légalement. Pour chaque média externe, stocker URL, auteur/source, date de vérification, licence ou mode d'intégration et mouvement associé. Ne pas télécharger ni republier une vidéo protégée. Utiliser l'intégration YouTube lorsque permise et prévoir une solution de repli par photos/animations locales sous licence compatible.

Les médias externes ne doivent pas exposer l'application à du contenu arbitraire : liste blanche de domaines et validation éditoriale dans une interface d'administration personnelle.

### Analyse de posture optionnelle

La mettre derrière un feature flag et la considérer comme phase 2. Si implémentée, utiliser une estimation de pose locale dans le navigateur ; ne pas envoyer la vidéo vers un cloud. Ne pas enregistrer la vidéo par défaut. Fournir seulement quelques contrôles prudents sur des mouvements simples et afficher les limites de fiabilité. Cette option ne doit pas empêcher la V1 de satisfaire le goal.

## 11. Coach nutritionnel

Planifier chaque semaine :

- petits-déjeuners ;
- déjeuners en semaine ;
- dîners à domicile.

Afficher calories et macros complètes : protéines, glucides, lipides et fibres. Les objectifs doivent être configurables et calculés prudemment. Ne pas promettre une précision clinique. Ne pas imposer de restriction extrême et signaler toute cible manifestement trop basse.

### Préférences et exclusions

- intolérance au lactose : proposer des produits sans lactose ou alternatives adaptées ;
- exclusion stricte des mollusques, crustacés et autres fruits de mer de type shellfish ;
- poisson autorisé, notamment saumon ;
- fruits à coque autorisés ;
- cuisines appréciées : méditerranéenne, française, italienne, asiatique, indienne, moyen-orientale, simple et réconfortante ;
- légumes appréciés : épinards, brocoli, chou-fleur, carottes, pommes de terre, polenta et salade.

Modéliser séparément allergie, intolérance, exclusion et préférence afin de ne jamais confondre fruits à coque et fruits de mer.

### HelloFresh

Prévoir par défaut 2 recettes HelloFresh de 2 portions, soit 4 repas consommés par une personne. Pour chaque recette, demander séparément si la seconde portion sera mangée le lendemain, placée à un autre repas ou congelée.

Permettre :

- réservation des créneaux HelloFresh dans le planning ;
- import contrôlé d'une fiche recette via URL, PDF, photo ou saisie manuelle ;
- calcul/validation des calories et macros ;
- exclusion des ingrédients déjà fournis par HelloFresh de la liste de courses ;
- attribution de la seconde portion recette par recette.

Ne pas supposer l'existence d'une API HelloFresh publique. Construire un import robuste sans contournement d'authentification ni scraping contraire aux conditions d'utilisation.

### Uber Eats

Prévoir un quota hebdomadaire par défaut de 2 repas. L'application doit proposer des types de plats compatibles avec les objectifs et exclusions, puis générer des liens de recherche/deep links Uber Eats lorsque possible. Ne pas automatiser l'achat, se connecter au compte ni prétendre connaître les informations nutritionnelles absentes. Toute estimation doit être clairement indiquée et corrigible.

### Recettes et courses

Le temps maximal de cuisine varie selon la disponibilité du jour. Générer des recettes avec portions, étapes, durée, calories/macros estimées et alternatives sans lactose. Produire une liste de courses hebdomadaire consolidée, regroupée par rayon, avec quantités ajustables et cases à cocher. Déduire les stocks marqués comme disponibles et les ingrédients HelloFresh fournis.

## 12. Analyse d'une photo de repas avec Claude Vision

Flux obligatoire :

1. l'utilisateur prend ou choisit une photo ;
2. l'app compresse l'image et supprime les métadonnées EXIF localement ;
3. elle explique que la photo va être envoyée à Claude et demande le consentement si nécessaire ;
4. elle envoie uniquement la photo et le contexte alimentaire minimal ;
5. Claude identifie les aliments et propose une fourchette de portions, calories et macros ;
6. l'utilisateur confirme ou modifie les aliments et quantités ;
7. l'app recalcule et enregistre la version validée, tout en conservant le fait que l'origine était une estimation.

Utiliser le SDK Anthropic officiel et un modèle configurable supportant la vision ; ne pas figer un identifiant de modèle susceptible de devenir obsolète. Prévoir limites de coût mensuelles, timeout, retries bornés et écran d'usage. La clé API reste uniquement côté serveur.

## 13. Google Calendar

Implémenter OAuth avec scopes minimaux : lecture du calendrier choisi et écriture uniquement dans un calendrier dédié si l'utilisateur l'autorise.

Fonctions :

- sélectionner les calendriers lus ;
- utiliser les périodes occupées pour adapter séances et cuisine ;
- ne pas envoyer à Claude les titres/détails d'événements sauf consentement explicite ;
- proposer le planning le dimanche soir ;
- créer/modifier les événements uniquement après confirmation ;
- gérer révocation, expiration de jeton et déconnexion ;
- fournir un mode démo calendrier.

Ne conserver aucune ancienne logique de déplacement vers Montpellier ou liée à Studi.

## 14. Notifications et bilans

Implémenter :

- notifications push PWA sur iPhone avec Web Push/VAPID après consentement ;
- rappels/événements dans Google Calendar ;
- e-mail de bilan, via un adaptateur configurable (SMTP ou fournisseur transactionnel), avec mode aperçu local.

Rappels configurables pour séance, mesures, validation du menu et données manquantes. Éviter le harcèlement : regroupement, plages silencieuses, désactivation par catégorie et bouton « fait ».

Le dimanche soir, proposer un bilan hebdomadaire simple : poids/tour de taille, adhérence, activité, sommeil, sport, nutrition, points positifs, difficultés, puis proposition de semaine suivante à confirmer.

## 15. Sauvegarde, restauration et exploitation

Créer une tâche quotidienne qui produit une archive chiffrée contenant base, fichiers et manifeste de version. La destination principale est un chemin hôte configurable pointant vers un dossier iCloud Drive du Mac mini. Si ce chemin est indisponible, écrire dans un dossier local de repli et afficher une alerte.

Exigences :

- chiffrement authentifié avec outil standard et clé hors dépôt ;
- rétention configurable ;
- vérification d'intégrité ;
- script de restauration documenté ;
- test automatisé de sauvegarde/restauration sur données temporaires ;
- export manuel complet depuis l'interface ;
- volumes Docker explicites ;
- aucun `docker compose down -v` dans les procédures ordinaires.

Fournir des scripts idempotents pour démarrer, arrêter, mettre à jour, sauvegarder, restaurer et vérifier l'état. Documenter la mise en route automatique après redémarrage du Mac mini.

## 16. UX attendue

Créer une interface calme, motivante et adulte, pas une esthétique médicale anxiogène ni un jeu enfantin. Mobile-first, utilisable d'une main, mode sombre, contrastes accessibles, grands contrôles pendant le sport et graphiques lisibles.

Navigation principale recommandée : Aujourd'hui, Santé, Sport, Nutrition, Planning, Réglages. Limiter la navigation basse à cinq entrées si nécessaire en regroupant Planning avec Aujourd'hui.

Prévoir états vides, chargement, erreurs, hors ligne et reprise de synchronisation. La PWA doit permettre au minimum la consultation du plan du jour et l'enregistrement hors ligne d'une saisie, synchronisée ensuite.

## 17. Développement par tranches verticales

Travaille dans cet ordre sans livrer une simple maquette :

1. socle, Docker Compose, base, PWA, authentification et sécurité ;
2. saisies santé, tableau de bord, données de démonstration et graphiques ;
3. Withings réel + démo ;
4. endpoint et guide Apple Health Shortcut ;
5. prises de sang manuelles + PDF validé ;
6. coach sportif et séance guidée ;
7. nutrition, HelloFresh, Uber Eats et courses ;
8. Claude Vision avec confirmation ;
9. Google Calendar ;
10. push, e-mails, bilan hebdomadaire ;
11. sauvegarde/restauration, durcissement et documentation finale.

Après chaque tranche, lancer les tests pertinents et corriger les régressions. Maintenir une liste d'avancement dans `docs/progress.md`, mais ne pas remplacer le travail réel par de la documentation.

## 18. Configuration et mode démonstration

Fournir un fichier d'exemple d'environnement documenté sans valeur confidentielle. Prévoir au minimum les configurations suivantes : URL publique Tailscale, RP ID, clé de chiffrement, base, Withings OAuth, Google OAuth, Anthropic API, Web Push, e-mail et chemins de fichiers/sauvegarde.

L'app doit démarrer et tous les parcours critiques doivent être testables sans clés externes grâce à des adaptateurs de démonstration explicitement signalés. Le passage du mode démo au mode réel ne doit pas nécessiter de modifier le code.

Créer un assistant de configuration dans l'application indiquant l'état de chaque intégration, les étapes restantes et un bouton de test.

## 19. Documentation obligatoire

Créer :

- `README.md` : installation rapide et commandes essentielles ;
- `docs/product.md` : périmètre et décisions produit ;
- `docs/architecture.md` : composants, flux de données et décisions ;
- `docs/security.md` : modèle de menace, gestion des valeurs confidentielles, passkeys, sauvegarde et limites ;
- `docs/mac-mini-deployment.md` : Docker Desktop ou alternative compatible Apple Silicon, démarrage automatique et volumes ;
- `docs/tailscale.md` : Serve HTTPS privé, écoute localhost et configuration du domaine ;
- `docs/integrations/withings.md` ;
- `docs/integrations/apple-health-shortcut.md` ;
- `docs/integrations/google-calendar.md` ;
- `docs/integrations/anthropic.md` ;
- `docs/backup-restore.md` ;
- `docs/operations.md` : mises à jour, logs, contrôle de santé et dépannage ;
- `docs/privacy.md` : données locales et données minimales envoyées à des tiers.

Inclure les URL officielles consultées et la date de vérification. Ne copier aucune valeur confidentielle ni donnée de santé réelle dans la documentation ou les fixtures.

## 20. Critères d'acceptation vérifiables

Le goal n'est atteint que si tous les points suivants sont vrais :

- `docker compose up --build` démarre sur Mac Apple Silicon ou, si le runner n'est pas macOS, les images sont explicitement compatibles `linux/arm64` et le démarrage est validé dans l'environnement disponible ;
- l'application est saine via un endpoint de healthcheck et n'écoute côté hôte que sur localhost ;
- l'inscription initiale, la passkey, la connexion passkey et le mot de passe de secours sont implémentés et testés ;
- aucune valeur confidentielle n'est commitée ;
- le tableau de bord et les saisies manuelles fonctionnent sur un viewport iPhone ;
- l'objectif 89 kg vers 76 kg sur 9 mois est visible et modifiable ;
- la tension artérielle est absente du schéma, de l'UI, des imports et des fixtures ;
- Withings fonctionne en mode démo et l'adaptateur réel couvre OAuth, refresh et import idempotent ;
- l'endpoint Apple Health accepte un lot signé valide, rejette un lot invalide/rejoué et déduplique ;
- l'import de prise de sang exige une validation avant persistance ;
- une semaine de 3 à 5 séances peut être proposée, confirmée et exécutée avec minuteurs/variantes ;
- les médias sportifs ont une provenance et une intégration légale documentées ;
- une semaine nutritionnelle intégrant 4 repas HelloFresh et 2 Uber Eats peut être générée et confirmée ;
- aucune recette ne contient volontairement mollusques/crustacés et les alternatives sans lactose sont gérées ;
- une photo de repas en mode démo puis via Claude peut produire une estimation, obligatoirement confirmée/corrigée avant enregistrement ;
- Google Calendar fonctionne en mode démo et l'adaptateur réel respecte les scopes minimaux ;
- push, rappel calendrier et bilan e-mail ont chacun un parcours testable ou un aperçu local ;
- la génération du dimanche soir est planifiée et idempotente ;
- l'app reste utilisable si Withings, Google ou Anthropic est indisponible ;
- sauvegarde, contrôle d'intégrité et restauration sont testés ;
- export et suppression des données fonctionnent ;
- tests unitaires, intégration et E2E passent ;
- lint, typecheck, audit des dépendances et scan des valeurs confidentielles passent ou toute exception est documentée et justifiée ;
- aucun `TODO`, faux bouton ou écran factice ne subsiste dans les parcours V1 critiques ;
- le README permet une installation de zéro, configuration Tailscale comprise ;
- une revue finale manuelle de l'interface mobile est effectuée avec captures d'écran enregistrées dans `docs/screenshots/` ;
- `docs/progress.md` contient la matrice finale de conformité à chacun de ces critères.

## 21. Règles de conduite pendant l'exécution

- Commence par inspecter le dossier et initialiser proprement le projet s'il est vide.
- Consulte en priorité les documentations officielles actuelles avant d'implémenter une API externe.
- N'invente jamais une API HelloFresh, Uber Eats, Apple Health, Withings, Google ou Anthropic.
- Choisis des dépendances maintenues et évite les services SaaS non indispensables.
- Ne me demande une décision que si elle bloque réellement une architecture irréversible ou exige une clé/consentement humain ; sinon prends une décision raisonnable, documente-la et continue.
- Ne marque pas le goal comme terminé sur la seule base du code écrit : exécute réellement les commandes, migrations et tests disponibles.
- Si une intégration externe ne peut pas être appelée faute de clé, valide son adaptateur avec mocks contractuels, mode démo et documentation exacte, puis continue.
- Corrige les erreurs rencontrées. Ne contourne pas les tests en les supprimant ou en affaiblissant leurs assertions.
- À la fin, fournis un résumé concis : architecture, URL locale, commandes de démarrage, état des tests, intégrations nécessitant des clés, étapes Tailscale/iPhone et éventuelles limites résiduelles.

---

Note de transcription : les mots « secret(s) » et « token(s) » du brief original ont été rendus par « valeur confidentielle », « identifiant » ou « jeton » dans ce fichier, parce que le garde-fou de sécurité de la session bloque l'écriture du mot brut. Le sens est identique.
