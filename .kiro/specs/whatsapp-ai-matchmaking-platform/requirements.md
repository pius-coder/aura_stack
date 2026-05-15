# Document de Requirements

## Introduction

La **WhatsApp AI Matchmaking Platform** est une plateforme de mise en relation construite sur le framework **Aura** (TanStack Start + Hono + Prisma + PostgreSQL/pgvector + Aura Broadcast WebSocket), conçue pour structurer l'économie informelle camerounaise puis francophone d'Afrique. Elle permet à tout particulier ou professionnel de trouver un prestataire ou une connexion de confiance via **WhatsApp** en moins de trois minutes, de manière anonyme et sécurisée.

Le cœur du produit est un **système Graph RAG relationnel** : chaque conversation WhatsApp avec une instance d'agent IA dédiée alimente un knowledge graph stocké en PostgreSQL (entités `User`, `Service`, `Skill`, `Location`, `Industry`, `Need` et relations `PROVIDES`, `REQUIRES`, `LOCATED_IN`, `LOOKS_FOR`, `MATCHES`, `CONNECTED_TO`). Les requêtes de matching sont résolues par un orchestrateur séparé qui combine **traversal de graphe** (CTE récursives Postgres) et **similarité vectorielle** (pgvector) via une fusion **RRF**, avec un mécanisme de diversité pour exposer à la fois des profils très compatibles et des profils complémentaires.

La plateforme expose deux surfaces utilisateur :

1. Un **dashboard web** (TanStack Start + Aura UI Kit shadcn) pour la gestion de profil, des services, du chat temps réel anonyme (Aura broadcast WebSocket), des notations, des litiges et de l'abonnement.
2. Un **bot WhatsApp** (Baileys + Evolution API en MVP, WhatsApp Business API officielle avant production payante) où chaque utilisateur dispose de sa propre instance LangGraph (état persistant via checkpointer PostgreSQL, persona pro vouvoyante, multilingue FR/EN).

Le modèle économique est progressif : MVP gratuit (M1-6, objectif 500 prestataires actifs et 2000 users), monétisation freemium phase 2 via Fapshi (Badge Vérifié 10 000 FCFA/an, Boost 1 000 FCFA/7 jours, Abonnement Pro 3 000 FCFA/mois, MTN MoMo + Orange Money), commission 5-8% avec escrow et expansion francophone (CI, Sénégal, Burkina) en phase 3 via Flutterwave. Le présent document spécifie les requirements **métier** (parcours utilisateur, règles business, monétisation par phases) et **techniques** (intégrations WhatsApp/Fapshi/LLM, Graph RAG, performances, observabilité, conformité CEMAC) nécessaires au MVP et à son extensibilité.

## Glossary

### Acteurs

- **User_Standard** : Particulier ou professionnel inscrit cherchant des connexions, collaborateurs ou freelances. Peut envoyer des requêtes de matching et entrer en chat anonyme.
- **Prestataire** : Sous-type de User_Standard (champ `profile.type = "prestataire"`) proposant des services tarifés (artisan, freelance, professionnel). Peut être promu via Badge_Verifie, Boost ou Abonnement_Pro.
- **Admin** : Modérateur disposant d'un rôle élevé (`users.role = "admin"`) capable de lire les conversations signalées, de trancher les Disputes, de suspendre des comptes et de consulter les métriques.

### Composants applicatifs

- **Dashboard_Web** : Application TanStack Start servie par Aura, point d'entrée pour inscription, gestion de profil, services, matchings reçus, chat anonyme, notations, litiges, abonnements.
- **Bot_WhatsApp** : Surface conversationnelle exposée à chaque utilisateur lié, alimentée par une instance dédiée du Graphe_Agent_User.
- **Admin_Console** : Sous-section du Dashboard_Web réservée au rôle Admin, exposant la gestion des Disputes, suspensions et métriques business/IA.

### Système IA et matching

- **Graphe_Agent_User** : Instance LangGraph (un graphe par utilisateur) modélisant le dialogue WhatsApp avec nodes `HydrationNode → ConversationNode → ExtractionNode → MatchingIntentNode → OrchestratorCallNode → ResponseNode`. État persisté via checkpointer PostgreSQL.
- **Persona_Pro_Vouvoyante** : Persona stricte du Bot_WhatsApp : assistante IA professionnelle, vouvoiement systématique, ton neutre et professionnel, jamais de tutoiement ni de familiarité, identique en FR et EN (avec traduction culturelle équivalente : « you » formel, registre soutenu).
- **Knowledge_Graph** : Graphe relationnel stocké en PostgreSQL composé d'entités (`User`, `Service`, `Skill`, `Location`, `Industry`, `Need`) et de relations typées (`PROVIDES`, `REQUIRES`, `LOCATED_IN`, `LOOKS_FOR`, `MATCHES`, `CONNECTED_TO`).
- **Orchestrateur_Matching** : Service LangGraph indépendant aux nodes `ReceiveRequest → GraphTraversal → EmbeddingQuery → HybridScoring → Diversity → Filter → Return`. Sollicité par Graphe_Agent_User pour résoudre une requête de mise en relation.
- **Graph_Traversal** : Recherche de chemins de longueur 1 à 3 dans le Knowledge_Graph satisfaisant la requête, exécutée via CTE récursives PostgreSQL.
- **Embedding_Query** : Recherche par similarité vectorielle dans la table `graph_embeddings` via `pgvector`, exécutée via la couche vector search d'Aura.
- **Hybrid_Scoring** : Fusion des scores Graph_Traversal et Embedding_Query par algorithme **Reciprocal Rank Fusion (RRF)**.
- **Diversity_Mix** : Étape qui sélectionne un mélange de profils très compatibles et moins compatibles dans les résultats Hybrid_Scoring, garantissant la diversité des suggestions.
- **Match_Request** : Demande explicite d'entrer en contact d'un User_A vers un User_B, soumise au Double_Optin.
- **Double_Optin** : Mécanisme exigeant que User_B accepte explicitement la Match_Request de User_A avant l'ouverture d'une Conversation chiffrée et la révélation des photos.

### Communication

- **Conversation_Anonyme** : Conversation entre deux utilisateurs ayant validé le Double_Optin, identifiée par `conversation_id`, accessible uniquement via Dashboard_Web (room Aura broadcast WebSocket).
- **Alias** : Pseudonyme affiché à la place du vrai nom tant que les deux utilisateurs n'ont pas validé le Double_Optin (puis nom réel + photo révélés).
- **Notification_WhatsApp** : Message envoyé via Bot_WhatsApp signalant un événement (nouveau message dans Conversation_Anonyme, acceptation/refus de Match_Request, signalement de Dispute, activation d'un abonnement).

### Modération et confiance

- **Dispute** : Signalement formel d'un litige par l'un des participants d'une Conversation_Anonyme, accompagné d'un snapshot complet de la conversation au moment du signalement.
- **Avertissement** : Sanction prononcée par un Admin sur un compte (champ `profiles.warning_count`). Trois avertissements cumulés déclenchent une Suspension_Automatique.
- **Suspension_Automatique** : Bascule automatique du `profiles.status` à `suspended` lorsque `warning_count >= 3`.
- **Suspension_Manuelle** : Bascule du `profiles.status` à `suspended` par un Admin, sans seuil d'avertissements.
- **Badge_Verifie** : Statut payant (10 000 FCFA/an) acquis après vérification d'identité (selfie + CNI) qui confère la priorité dans les résultats de matching.

### Monétisation et paiement

- **Provider_Paiement** : Interface abstraite (`PaymentProvider`) implémentée par Provider_Fapshi (MVP, Cameroun) et Provider_Flutterwave (phase 3, expansion 30+ pays Afrique).
- **Provider_Fapshi** : Implémentation concrète de Provider_Paiement utilisant le SDK Fapshi Node.js, supportant MTN MoMo et Orange Money au Cameroun.
- **Provider_Flutterwave** : Implémentation concrète de Provider_Paiement utilisée à partir de la phase 3 pour l'expansion francophone (CI, Sénégal, Burkina).
- **Boost** : Mise en avant ponctuelle (1 000 FCFA / 7 jours) plaçant un Prestataire dans le top 3 des résultats Hybrid_Scoring pendant la durée active.
- **Abonnement_Pro** : Plan payant (3 000 FCFA/mois) débloquant un nombre illimité de Match_Request par jour pour un Prestataire.
- **Commission_Mission** : Prélèvement de 5 % à 8 % appliqué sur les missions déclarées en phase 3, encaissé via Escrow.
- **Escrow** : Mécanisme de séquestre des fonds entre client et Prestataire libéré après confirmation de mission, introduit en phase 3.

### Plateforme et stack

- **Aura** : Framework interne (cf. spec `aura-hono-tanstack-migration`) fournissant operations (query/mutate/action), agents (`defineAgent`), workflows durables (`defineWorkflow`), HTTP actions (`defineHttpAction`), vector search (`defineVectorIndex`), full-text search (`defineSearchIndex`), components, scheduler, file storage (`ctx.storage`), broadcast WebSocket et UI kit shadcn.
- **Evolution_API** : Couche HTTP open source au-dessus de Baileys exposant les sessions WhatsApp via webhooks et REST.
- **Baileys** : SDK officiel Node.js permettant à un compte WhatsApp non-Business d'envoyer/recevoir des messages (utilisé en MVP uniquement).
- **WhatsApp_Business_API** : API officielle WhatsApp obligatoire avant le passage en production payante (phase 2).
- **Webhook_Fapshi** : Endpoint `defineHttpAction` recevant les notifications de paiement signées par Fapshi.
- **Webhook_WhatsApp** : Endpoint `defineHttpAction` recevant les messages entrants depuis Evolution_API ou WhatsApp_Business_API.

### Conformité et réglementaire

- **CEMAC** : Communauté Économique et Monétaire d'Afrique Centrale dont la réglementation s'applique aux paiements Mobile Money au Cameroun.
- **Consentement_Explicite** : Acceptation horodatée et tracée par l'utilisateur des conditions de traitement (politique de confidentialité, partage de données dans le Knowledge_Graph, communication WhatsApp).

## Dépendances Aura

Cette feature consomme les capacités suivantes du framework Aura (cf. `.kiro/specs/aura-hono-tanstack-migration/`) :

- **Operations (`defineOperationFn`)** : queries (lecture profil, services, matchings, conversations, abonnements), mutations (création profil, services, Match_Request, messages chat, signalements, paiements), actions (appels LLM, génération embeddings, déclenchement Orchestrateur_Matching, envoi messages WhatsApp via Evolution_API).
- **Agents (`defineAgent`)** : Graphe_Agent_User par utilisateur (instance LangGraph) et Orchestrateur_Matching (LangGraph séparé), avec checkpointer PostgreSQL natif Aura.
- **Workflows durables (`defineWorkflow`)** : flux multi-étapes pour vérification d'identité Badge_Verifie, gestion d'Escrow phase 3, onboarding multi-écrans avec persistance.
- **HTTP Actions (`defineHttpAction`)** : Webhook_WhatsApp (réception messages Evolution_API/WA Business API), Webhook_Fapshi (réception paiements signés), Webhook_Flutterwave (phase 3).
- **Vector Search (`defineVectorIndex`)** : index pgvector sur `graph_embeddings.embedding` (1536 dimensions), avec filtres `user_id`, `entity_type`, `region`.
- **Full-Text Search (`defineSearchIndex`)** : index PostgreSQL `tsvector` (configuration `french` et `english`) sur `services.title`, `services.description`, `profiles.bio`, `profiles.skills`.
- **Components Aura** : `@aura/auth` (auth email/password + sessions JWT), `@aura/storage` (photos profil + selfie/CNI Badge_Verifie), `@aura/notifications` (notifications cross-device), `@aura/rate-limit` (anti-abus webhooks et matching).
- **Scheduler (`ctx.scheduler`)** : expiration automatique du Boost (7 jours), renouvellement Abonnement_Pro (mensuel), refresh des materialized views Knowledge_Graph, retry envoi WhatsApp en échec.
- **File Storage (`ctx.storage`)** : photos de profil (révélées uniquement après Double_Optin), selfie + CNI Badge_Verifie (accès Admin uniquement), snapshots de Disputes.
- **Broadcast WebSocket** : rooms `conversation:{id}` pour messages chat temps réel, rooms `user:{id}` pour notifications dashboard, room `admin:disputes` pour notifications modération.
- **UI Kit (shadcn)** : composants Aura UI Kit pour tous les écrans Dashboard_Web et Admin_Console.
- **Folder conventions kebab-case** : organisation `src/operations/{domain}/{operation-name}.ts`, `src/agents/{agent-name}.ts`, `src/workflows/{workflow-name}.ts`.
- **Auto-tracking entity invalidation** : invalidation automatique des queries TanStack Query au déclenchement d'une mutation (ex. acceptation Match_Request invalide la liste des conversations).

## Requirements

---

## A. Requirements Métier

### Requirement 1 : Inscription via dashboard web

**User Story :** En tant qu'utilisateur potentiel, je veux créer un compte sur le Dashboard_Web avec mon email et un mot de passe, afin d'accéder à la plateforme avant de lier WhatsApp.

#### Acceptance Criteria

1. WHEN un visiteur soumet le formulaire d'inscription avec email et mot de passe valides, THE Dashboard_Web SHALL créer une ligne dans `users` avec `role = "user"` et `whatsapp_linked = false`, puis ouvrir une session JWT.
2. IF l'email soumis est déjà associé à un compte existant, THEN THE Dashboard_Web SHALL répondre avec un message d'erreur localisé sans révéler l'existence du compte cible.
3. WHEN un compte vient d'être créé, THE Dashboard_Web SHALL générer un code de liaison WhatsApp unique de 8 caractères alphanumériques affiché à l'utilisateur.
4. THE Dashboard_Web SHALL exiger un mot de passe d'au moins 12 caractères contenant au minimum une lettre, un chiffre et un caractère spécial.
5. WHEN un utilisateur s'inscrit, THE Dashboard_Web SHALL recueillir le Consentement_Explicite à la politique de confidentialité, au traitement des données conversationnelles et à la communication WhatsApp avant de finaliser la création du compte.

### Requirement 2 : Liaison du compte WhatsApp

**User Story :** En tant qu'utilisateur inscrit, je veux lier mon numéro WhatsApp à mon compte en envoyant un code au Bot_WhatsApp, afin de recevoir et envoyer des messages via le bot.

#### Acceptance Criteria

1. WHEN le Bot_WhatsApp reçoit un message dont le contenu correspond à un code de liaison existant et non expiré, THE Bot_WhatsApp SHALL associer le numéro WhatsApp expéditeur au `users.id` correspondant et passer `whatsapp_linked` à `true`.
2. THE Bot_WhatsApp SHALL invalider le code de liaison après usage et fixer une expiration de 30 minutes par défaut.
3. IF le Bot_WhatsApp reçoit un code expiré ou inconnu, THEN THE Bot_WhatsApp SHALL répondre dans la langue détectée que le code est invalide et inviter l'utilisateur à en générer un nouveau dans le Dashboard_Web.
4. WHEN un numéro WhatsApp tente de se lier à un second compte alors qu'il est déjà lié, THE Bot_WhatsApp SHALL refuser la liaison et indiquer que le numéro est déjà rattaché à un compte.
5. WHEN la liaison WhatsApp est validée, THE Bot_WhatsApp SHALL envoyer un message de bienvenue présentant la Persona_Pro_Vouvoyante et les fonctionnalités disponibles.

### Requirement 3 : Choix du type de profil

**User Story :** En tant qu'utilisateur lié, je veux indiquer si mon profil est User_Standard ou Prestataire, afin que la plateforme expose les écrans et services adaptés à mon usage.

#### Acceptance Criteria

1. WHEN un utilisateur termine la liaison WhatsApp, THE Dashboard_Web SHALL afficher un écran de choix entre `User_Standard` et `Prestataire` avant l'accès au tableau de bord principal.
2. WHEN un utilisateur sélectionne `Prestataire`, THE Dashboard_Web SHALL débloquer les écrans de gestion des Services et exiger la complétion d'au moins un Service avant l'éligibilité au matching.
3. WHEN un utilisateur sélectionne `User_Standard`, THE Dashboard_Web SHALL masquer les écrans de gestion des Services tout en permettant la création de Match_Request.
4. WHERE un utilisateur souhaite changer de type, THE Dashboard_Web SHALL permettre la conversion User_Standard → Prestataire à tout moment et la conversion inverse uniquement si aucun Service actif n'existe.

### Requirement 4 : Complétion du profil

**User Story :** En tant qu'utilisateur, je veux compléter mon profil (photo, biographie, localisation, compétences) sur le Dashboard_Web, afin d'apparaître pertinent dans les résultats de matching.

#### Acceptance Criteria

1. THE Dashboard_Web SHALL exposer un écran de profil permettant la saisie de `name`, `bio`, `photo_url`, `location`, `skills`.
2. WHEN un utilisateur enregistre une modification de profil, THE Dashboard_Web SHALL persister les valeurs validées et déclencher la régénération des embeddings du Knowledge_Graph associés à ce `user_id`.
3. THE Dashboard_Web SHALL limiter `bio` à 1000 caractères et `name` à 80 caractères.
4. WHEN un utilisateur téléverse une photo de profil, THE Dashboard_Web SHALL accepter les formats `png`, `jpg`, `jpeg`, `webp` jusqu'à 5 Mo via `ctx.storage` et rejeter les autres formats avec un message explicite.
5. WHERE un utilisateur n'a pas complété `name` et `location`, THE Dashboard_Web SHALL marquer le profil comme inéligible au matching et afficher un rappel de complétion.

### Requirement 5 : Gestion des services pour les Prestataires

**User Story :** En tant que Prestataire, je veux ajouter manuellement mes services (titre, description, tarif, disponibilité, zone) sur le Dashboard_Web, afin que les utilisateurs cherchant ces services me trouvent.

#### Acceptance Criteria

1. THE Dashboard_Web SHALL permettre à un Prestataire de créer un Service avec les champs `title` (max 120 caractères), `description` (max 2000 caractères), `price` (entier positif en FCFA), `availability` (enum `available`, `busy`, `unavailable`), `zone` (chaîne texte).
2. WHEN un Service est créé ou modifié, THE Dashboard_Web SHALL déclencher l'extraction d'entités/relations alimentant le Knowledge_Graph (`Service`, `Skill`, `Industry`, `Location`) et la mise à jour des embeddings associés.
3. THE Dashboard_Web SHALL permettre à un Prestataire de désactiver ou supprimer un Service ; les Services désactivés SHALL être exclus des résultats de matching.
4. WHEN un Prestataire dépasse 50 Services actifs simultanément, THE Dashboard_Web SHALL refuser la création de nouveaux Services tant que le compte n'a pas un Abonnement_Pro actif.

### Requirement 6 : Visualisation des matchings reçus

**User Story :** En tant qu'utilisateur, je veux voir sur mon Dashboard_Web la liste des Match_Request reçues et envoyées avec leur statut, afin de gérer mes mises en relation.

#### Acceptance Criteria

1. THE Dashboard_Web SHALL afficher pour chaque utilisateur la liste des Match_Request `pending`, `accepted`, `refused` triées par `created_at` décroissant.
2. WHEN un utilisateur reçoit une nouvelle Match_Request, THE Dashboard_Web SHALL afficher un indicateur visuel non lu et envoyer une Notification_WhatsApp à l'utilisateur cible.
3. THE Dashboard_Web SHALL exposer pour chaque Match_Request reçue les actions `accepter` et `refuser`, et pour chaque Match_Request envoyée l'action `annuler` tant que le statut est `pending`.
4. WHEN une Match_Request est acceptée, THE Dashboard_Web SHALL créer une Conversation_Anonyme entre les deux utilisateurs et notifier les deux parties par Notification_WhatsApp.

### Requirement 7 : Système de notation après mission

**User Story :** En tant qu'utilisateur ayant terminé une mission via la plateforme, je veux noter mon contact, afin d'alimenter la réputation et la confiance dans le Knowledge_Graph.

#### Acceptance Criteria

1. WHEN un utilisateur clôture une Conversation_Anonyme, THE Dashboard_Web SHALL proposer aux deux participants un formulaire de notation avec `score` entier de 1 à 5 et `comment` texte optionnel (max 500 caractères).
2. THE Dashboard_Web SHALL persister chaque notation et la rendre visible sur le profil du noté sous forme de moyenne agrégée et de nombre d'avis.
3. WHEN un utilisateur reçoit une notation, THE Knowledge_Graph SHALL mettre à jour la relation `MATCHES` (ou créer une relation `RATED`) entre le noteur et le noté avec un poids dérivé du score.
4. IF un utilisateur tente de noter une Conversation_Anonyme à laquelle il n'a pas participé, THEN THE Dashboard_Web SHALL répondre avec une erreur d'autorisation.
5. THE Dashboard_Web SHALL empêcher un utilisateur de noter plus d'une fois la même Conversation_Anonyme.

### Requirement 8 : Historique des conversations

**User Story :** En tant qu'utilisateur, je veux consulter l'historique complet de mes Conversation_Anonyme, afin de retrouver des échanges passés et appuyer un éventuel litige.

#### Acceptance Criteria

1. THE Dashboard_Web SHALL exposer un écran listant toutes les Conversation_Anonyme de l'utilisateur connecté, triées par dernier message décroissant.
2. WHEN un utilisateur ouvre une Conversation_Anonyme, THE Dashboard_Web SHALL charger l'historique paginé des messages (20 par page) avec curseur opaque.
3. THE Dashboard_Web SHALL conserver tous les messages sans suppression utilisateur tant qu'aucune Dispute n'est résolue par Admin avec décision d'archivage.
4. WHERE une Conversation_Anonyme est marquée `closed`, THE Dashboard_Web SHALL la rendre lecture seule pour les deux participants.

### Requirement 9 : Signalement et gestion des litiges

**User Story :** En tant qu'utilisateur victime d'un comportement inapproprié, je veux signaler un litige depuis le chat, afin qu'un Admin tranche.

#### Acceptance Criteria

1. THE Dashboard_Web SHALL exposer dans chaque Conversation_Anonyme un bouton de signalement déclenchant la création d'une Dispute avec le `conversation_id`, l'`reporter_id`, le motif sélectionné et un snapshot complet des messages.
2. WHEN une Dispute est créée, THE Aura_Broadcast SHALL publier un événement sur la room `admin:disputes` et une Notification_WhatsApp d'accusé de réception SHALL être envoyée au `reporter_id`.
3. THE Admin_Console SHALL permettre à un Admin de lire le snapshot complet de la Dispute, d'ajouter un commentaire interne et de prononcer une décision parmi `dismiss`, `warn_reporter`, `warn_reported`, `warn_both`, `suspend_reported`, `suspend_both`.
4. WHEN un Admin prononce un avertissement, THE Dashboard_Web SHALL incrémenter `profiles.warning_count` du compte ciblé et envoyer une Notification_WhatsApp explicative au compte sanctionné.
5. WHEN `profiles.warning_count` atteint 3, THE Dashboard_Web SHALL appliquer une Suspension_Automatique en passant `profiles.status` à `suspended` et envoyer une Notification_WhatsApp détaillant la suspension.
6. THE Admin_Console SHALL permettre une Suspension_Manuelle indépendante du `warning_count` avec motif obligatoire.

### Requirement 10 : Console Admin pour modération et métriques

**User Story :** En tant qu'Admin, je veux accéder à une Admin_Console listant les Disputes en attente, les comptes suspendus et les métriques business/IA, afin de superviser la plateforme.

#### Acceptance Criteria

1. THE Admin_Console SHALL être accessible uniquement aux comptes dont `users.role = "admin"`, et toute requête d'un autre rôle SHALL retourner une erreur d'autorisation.
2. THE Admin_Console SHALL exposer un tableau des Disputes filtrable par statut (`open`, `under_review`, `resolved`).
3. THE Admin_Console SHALL afficher un tableau des comptes suspendus avec motif et date, et permettre la levée d'une suspension manuelle.
4. THE Admin_Console SHALL exposer les métriques agrégées suivantes calculées sur les 30 derniers jours : nombre d'utilisateurs actifs, nombre de Match_Request créées, taux d'acceptation, nombre de Conversation_Anonyme ouvertes, nombre de Disputes ouvertes/résolues.
5. THE Admin_Console SHALL exposer les métriques d'observabilité IA : tokens consommés par modèle, latence moyenne du Bot_WhatsApp, latence moyenne de l'Orchestrateur_Matching, taux de matchings notés positivement (>= 4/5).

---

## B. Requirements Bot WhatsApp et Persona

### Requirement 11 : Persona stricte pro vouvoyante

**User Story :** En tant qu'utilisateur, je veux interagir avec un Bot_WhatsApp adoptant systématiquement la Persona_Pro_Vouvoyante, afin que l'expérience soit professionnelle et homogène.

#### Acceptance Criteria

1. THE Graphe_Agent_User SHALL utiliser un system prompt définissant la Persona_Pro_Vouvoyante imposant le vouvoiement, un ton neutre et professionnel, et l'absence de familiarité ou d'humour personnel.
2. WHEN le Bot_WhatsApp répond en français, THE Graphe_Agent_User SHALL utiliser exclusivement la deuxième personne du pluriel (« vous », « votre », « vos ») pour s'adresser à l'utilisateur.
3. WHEN le Bot_WhatsApp répond en anglais, THE Graphe_Agent_User SHALL utiliser un registre formel équivalent (formules « please », « kindly », évitant les contractions et le slang).
4. IF un message généré contient une violation détectée de la Persona_Pro_Vouvoyante (tutoiement, argot, emoji excessif), THEN THE ResponseNode SHALL régénérer la réponse jusqu'à conformité ou, après deux échecs, retourner une réponse de secours conforme prédéfinie.
5. THE Graphe_Agent_User SHALL refuser de répondre aux requêtes hors périmètre (sujets politiques, contenus adultes, conseils médicaux/juridiques personnels) et SHALL rediriger vers les fonctionnalités de la plateforme.

### Requirement 12 : Conversation naturelle multilingue FR/EN

**User Story :** En tant qu'utilisateur, je veux dialoguer naturellement avec le Bot_WhatsApp en français ou en anglais, afin d'utiliser ma langue préférée selon ma région.

#### Acceptance Criteria

1. WHEN le Bot_WhatsApp reçoit un message, THE Graphe_Agent_User SHALL détecter automatiquement la langue (FR ou EN) avec un seuil de confiance minimum de 0.8 et SHALL répondre dans la langue détectée.
2. IF la langue détectée est ni FR ni EN, THEN THE Graphe_Agent_User SHALL répondre en français par défaut tout en informant l'utilisateur que seules ces deux langues sont supportées.
3. WHEN un utilisateur change de langue en cours de conversation, THE Graphe_Agent_User SHALL adapter sa réponse à la nouvelle langue détectée pour le tour suivant.
4. THE Graphe_Agent_User SHALL persister la langue préférée détectée dans `agent_states.state` pour servir de fallback en cas d'ambiguïté.

### Requirement 13 : Hydratation du contexte utilisateur

**User Story :** En tant qu'utilisateur du Bot_WhatsApp, je veux que l'agent connaisse mon profil et mes services dès le début d'une conversation, afin de ne pas avoir à me répéter.

#### Acceptance Criteria

1. WHEN le HydrationNode du Graphe_Agent_User démarre un tour, THE Graphe_Agent_User SHALL charger en lecture le `profiles` et l'ensemble des `services` actifs de l'utilisateur depuis le Dashboard_Web.
2. THE HydrationNode SHALL injecter ces données dans l'état LangGraph de manière structurée pour que le ConversationNode puisse y faire référence dans les réponses.
3. WHEN les données de profil ou de services changent côté Dashboard_Web, THE HydrationNode SHALL refléter la dernière version persistée à chaque nouveau tour de conversation.
4. THE Graphe_Agent_User SHALL persister son état complet via le checkpointer PostgreSQL natif Aura à chaque transition de node.

### Requirement 14 : Détection d'intention de matching

**User Story :** En tant qu'utilisateur, je veux que le Bot_WhatsApp comprenne quand je cherche un Prestataire ou une connexion, afin de déclencher automatiquement le matching.

#### Acceptance Criteria

1. WHEN le MatchingIntentNode analyse le tour courant, THE Graphe_Agent_User SHALL classifier l'intention parmi `chat`, `recherche_prestataire`, `recherche_connexion`, `gestion_compte`, `aide`.
2. WHEN l'intention détectée est `recherche_prestataire` ou `recherche_connexion`, THE Graphe_Agent_User SHALL extraire les contraintes (Skill, Location, Industry, Need, budget approximatif) et appeler l'OrchestratorCallNode avec ces contraintes.
3. IF des contraintes essentielles manquent (par exemple aucune Skill ni Industry), THEN THE Graphe_Agent_User SHALL poser une question de clarification ciblée avant d'appeler l'Orchestrateur_Matching.
4. THE Graphe_Agent_User SHALL exposer un seuil de confiance minimum de 0.7 sur la classification d'intention ; en deçà, le ConversationNode SHALL demander confirmation explicite avant de basculer vers le matching.

### Requirement 15 : Présentation textuelle des résultats de matching

**User Story :** En tant qu'utilisateur du Bot_WhatsApp, je veux recevoir les profils correspondant à ma recherche sous forme textuelle dans la conversation, afin de décider lequel contacter sans quitter WhatsApp.

#### Acceptance Criteria

1. WHEN le Bot_WhatsApp reçoit les résultats de l'Orchestrateur_Matching, THE ResponseNode SHALL formater jusqu'à 5 profils avec Alias, résumé de profil, services proposés ou besoins exprimés, et un identifiant numéroté permettant à l'utilisateur de désigner le profil souhaité.
2. THE Bot_WhatsApp SHALL présenter un mélange de profils issu du Diversity_Mix (très compatibles + complémentaires) et SHALL indiquer cette diversité à l'utilisateur.
3. WHEN un utilisateur répond avec un identifiant numéroté valide, THE Graphe_Agent_User SHALL créer une Match_Request `pending` vers le profil cible et confirmer l'envoi.
4. THE Bot_WhatsApp SHALL ne jamais transmettre via WhatsApp une photo, un numéro de téléphone, un email ou une adresse précise des profils proposés.
5. WHEN aucun profil ne satisfait la requête, THE Bot_WhatsApp SHALL répondre poliment qu'aucun résultat n'a été trouvé et proposer d'élargir les critères.

### Requirement 16 : Notifications WhatsApp d'événements plateforme

**User Story :** En tant qu'utilisateur, je veux recevoir des Notification_WhatsApp pour les événements clés (nouveau message chat web, acceptation/refus, paiement validé), afin de réagir rapidement sans surveiller le Dashboard_Web.

#### Acceptance Criteria

1. WHEN un nouveau message est posté dans une Conversation_Anonyme à laquelle l'utilisateur participe, THE Bot_WhatsApp SHALL envoyer une Notification_WhatsApp dans la langue préférée signalant le nouveau message et invitant à ouvrir le Dashboard_Web.
2. WHEN une Match_Request est acceptée ou refusée, THE Bot_WhatsApp SHALL envoyer une Notification_WhatsApp à l'émetteur dans la langue préférée.
3. WHEN un paiement est confirmé via Webhook_Fapshi, THE Bot_WhatsApp SHALL envoyer une Notification_WhatsApp confirmant l'activation du Badge_Verifie, du Boost ou de l'Abonnement_Pro.
4. THE Bot_WhatsApp SHALL agréger les Notification_WhatsApp pour un même utilisateur dans une fenêtre de 60 secondes lorsqu'elles concernent des messages d'une même Conversation_Anonyme afin d'éviter le flood.
5. IF un utilisateur a explicitement désactivé les Notification_WhatsApp dans son profil, THEN THE Bot_WhatsApp SHALL n'envoyer que les notifications obligatoires (avertissements, suspensions, paiements).

---

## C. Requirements Graph RAG (Système IA)

### Requirement 17 : Modèle de Knowledge_Graph relationnel

**User Story :** En tant qu'architecte IA, je veux que la plateforme stocke un graphe d'entités et de relations dans PostgreSQL, afin que le matching exploite la structure relationnelle au-delà du simple embedding.

#### Acceptance Criteria

1. THE Knowledge_Graph SHALL définir les types d'entités `User`, `Service`, `Skill`, `Location`, `Industry`, `Need`, chacun stocké dans la table `entities` avec `id`, `user_id`, `type`, `value`, `confidence`, `extracted_at`, `source` (`conversation` ou `dashboard`).
2. THE Knowledge_Graph SHALL définir les prédicats de relations `PROVIDES`, `REQUIRES`, `LOCATED_IN`, `LOOKS_FOR`, `MATCHES`, `CONNECTED_TO`, `RATED` stockés dans la table `relations` avec `source_entity_id`, `target_entity_id`, `predicate`, `strength` (float 0-1), `created_at`.
3. THE Knowledge_Graph SHALL imposer des contraintes d'intégrité référentielle entre `entities` et `relations` via clés étrangères PostgreSQL.
4. THE Knowledge_Graph SHALL indexer `entities.type`, `entities.user_id`, `relations.predicate`, `relations.source_entity_id`, `relations.target_entity_id` pour permettre le Graph_Traversal performant.
5. WHERE une entité est extraite avec une `confidence` inférieure à 0.5, THE Knowledge_Graph SHALL la marquer `pending_review` et l'exclure du Graph_Traversal jusqu'à validation manuelle ou renforcement par d'autres extractions.

### Requirement 18 : Extraction d'entités et de relations depuis les conversations

**User Story :** En tant qu'architecte IA, je veux que chaque tour de conversation produise des entités et relations structurées, afin que le Knowledge_Graph s'enrichisse en continu sans saisie manuelle.

#### Acceptance Criteria

1. WHEN l'ExtractionNode du Graphe_Agent_User traite un tour, THE Graphe_Agent_User SHALL extraire les entités candidates (Skill, Location, Industry, Need) à partir du message utilisateur et du contexte conversationnel.
2. THE ExtractionNode SHALL produire pour chaque entité une `confidence` calibrée et SHALL persister `source = "conversation"` et `extracted_at = now()`.
3. WHEN une entité extraite existe déjà avec la même `value` et `type` pour le `user_id`, THE ExtractionNode SHALL incrémenter sa `confidence` selon une fonction monotone bornée à 1.0 plutôt que créer un doublon.
4. THE ExtractionNode SHALL extraire les relations implicites entre entités du tour (par exemple `User PROVIDES Service` depuis « je suis plombier ») avec `strength` initiale dérivée du contexte.
5. WHERE une entité ou relation provient d'une saisie Dashboard_Web (mutation profil ou service), THE ExtractionNode SHALL persister `source = "dashboard"` et `confidence = 1.0`.
6. THE ExtractionNode SHALL générer un embedding vectoriel de dimension 1536 pour chaque nouvelle entité et la persister dans `graph_embeddings` avec metadata référencant `entity_id`, `user_id`, `entity_type`.

### Requirement 19 : Graph traversal pour matching

**User Story :** En tant qu'utilisateur en recherche, je veux que le matching exploite des chemins de relations dans le Knowledge_Graph, afin de découvrir des connexions indirectes pertinentes.

#### Acceptance Criteria

1. WHEN l'Orchestrateur_Matching reçoit une requête de matching, THE GraphTraversal SHALL explorer les chemins de longueur 1 à 3 partant des entités de la requête vers des `User` candidats via les prédicats `PROVIDES`, `REQUIRES`, `LOCATED_IN`, `LOOKS_FOR`, `MATCHES`, `CONNECTED_TO`.
2. THE GraphTraversal SHALL être implémenté via une CTE récursive PostgreSQL avec borne explicite sur la profondeur (3) et sur le nombre maximal de chemins explorés (10000).
3. THE GraphTraversal SHALL pondérer chaque chemin par le produit des `strength` des relations traversées et par un facteur de décroissance dépendant de la longueur (`decay_factor = 0.85^longueur`).
4. THE GraphTraversal SHALL retourner les candidats `User` triés par score décroissant, avec un maximum de 50 candidats par requête.
5. WHERE un chemin contient une relation `MATCHES` ou `RATED` négative, THE GraphTraversal SHALL pénaliser le score plutôt que d'exclure le candidat, afin que la pondération reste continue.

### Requirement 20 : Recherche vectorielle hybride

**User Story :** En tant qu'utilisateur en recherche, je veux que la pertinence sémantique soit prise en compte au-delà des relations explicites, afin de trouver des profils décrits différemment mais sémantiquement proches.

#### Acceptance Criteria

1. WHEN l'Orchestrateur_Matching reçoit une requête de matching, THE EmbeddingQuery SHALL générer un embedding 1536-dimensionnel de la requête et SHALL exécuter une recherche `cosine` dans `graph_embeddings` via Aura `defineVectorIndex`.
2. THE EmbeddingQuery SHALL appliquer les filtres de region/locale et exclure les profils du demandeur, des profils déjà matchés et des profils suspendus.
3. THE EmbeddingQuery SHALL retourner les 50 candidats les plus proches, avec leur distance cosine.
4. THE HybridScoring SHALL fusionner les classements GraphTraversal et EmbeddingQuery via Reciprocal Rank Fusion (RRF) avec paramètre `k = 60` par défaut.
5. THE HybridScoring SHALL exposer en sortie un score normalisé entre 0 et 1 et le détail des deux scores composants pour observabilité.

### Requirement 21 : Diversité et exclusions

**User Story :** En tant qu'utilisateur, je veux recevoir un mélange de profils très compatibles et complémentaires différents de mes choix précédents, afin de découvrir de nouveaux contacts.

#### Acceptance Criteria

1. WHEN le Diversity_Mix traite la liste HybridScoring, THE Diversity_Mix SHALL sélectionner au plus 5 profils dont au moins 2 issus du quartile supérieur du score et au moins 1 issu du quartile médian.
2. THE Filter SHALL exclure les profils du demandeur, les profils déjà notés ou matchés depuis moins de 30 jours, les profils dont `profiles.status` n'est pas `active`, et les profils dont l'utilisateur a explicitement bloqué le contact.
3. WHERE un Prestataire dispose d'un Boost actif, THE Diversity_Mix SHALL réserver une des trois premières positions de la liste finale au Prestataire boosté lorsqu'il satisfait la requête.
4. WHERE un Prestataire dispose du Badge_Verifie, THE Diversity_Mix SHALL appliquer un bonus multiplicatif de 1.10 à son score final avant tri.
5. THE Diversity_Mix SHALL garantir qu'aucun profil identique n'apparaît deux fois dans le résultat final.

### Requirement 22 : Mise à jour incrémentale du Knowledge_Graph

**User Story :** En tant qu'architecte IA, je veux que les modifications de profils, services et notations soient propagées au Knowledge_Graph en temps quasi réel, afin que le matching reflète l'état courant.

#### Acceptance Criteria

1. WHEN un Service est créé, modifié ou supprimé, THE plateforme SHALL programmer un job via `ctx.scheduler` qui met à jour les entités et relations associées dans le Knowledge_Graph.
2. WHEN un profil est modifié sur des champs `bio`, `skills`, `location`, THE plateforme SHALL régénérer les embeddings concernés dans `graph_embeddings`.
3. WHEN une notation est enregistrée, THE plateforme SHALL créer ou mettre à jour la relation `RATED` correspondante avec `strength` dérivée du score (mapping `1→0.0`, `2→0.25`, `3→0.5`, `4→0.75`, `5→1.0`).
4. THE plateforme SHALL traiter les jobs de mise à jour Knowledge_Graph dans un délai de 60 secondes en charge nominale.
5. IF la régénération d'embedding échoue, THEN THE plateforme SHALL retenter avec backoff exponentiel jusqu'à 3 fois avant de marquer l'entité `embedding_stale = true` et notifier les Admins.

### Requirement 23 : Round-trip d'extraction et de sérialisation graphe

**User Story :** En tant qu'architecte IA, je veux que le pipeline d'extraction et la sérialisation du Knowledge_Graph soient cohérents, afin que les données extraites puissent être restituées et revalidées.

#### Acceptance Criteria

1. THE plateforme SHALL exposer une fonction de sérialisation `serializeEntity(entity)` retournant un JSON canonique et une fonction de parsing `parseEntity(json)` retournant l'entité validée.
2. FOR ALL entités persistées dans `entities`, `parseEntity(serializeEntity(entity))` SHALL produire une entité équivalente (round-trip property).
3. THE plateforme SHALL exposer une fonction `serializeRelation(relation)` et `parseRelation(json)` avec la même propriété de round-trip.
4. WHEN une extraction LLM produit un JSON non conforme au schéma `parseEntity`, THE ExtractionNode SHALL invalider le tour d'extraction et SHALL réessayer avec un prompt durci jusqu'à 3 tentatives avant de logger l'échec.
5. THE plateforme SHALL exposer un export complet du sous-graphe d'un utilisateur (entités + relations + embeddings) au format JSON, conforme au RGPD/CNIL et restituant l'état exact via parse.

---

## D. Requirements Chat Anonyme et Double Opt-in

### Requirement 24 : Double opt-in obligatoire avant chat

**User Story :** En tant qu'utilisateur, je veux qu'aucune Conversation_Anonyme ne s'ouvre sans le Double_Optin des deux parties, afin de protéger ma vie privée.

#### Acceptance Criteria

1. WHEN un utilisateur User_A demande un matching avec User_B via le Bot_WhatsApp ou le Dashboard_Web, THE plateforme SHALL créer une Match_Request `pending` sans ouvrir aucune Conversation_Anonyme.
2. WHEN User_B accepte la Match_Request, THE plateforme SHALL créer la Conversation_Anonyme et notifier les deux parties.
3. IF User_B refuse la Match_Request, THEN THE plateforme SHALL clôturer la Match_Request avec statut `refused` et n'ouvrira aucune Conversation_Anonyme.
4. WHILE une Match_Request reste `pending`, THE plateforme SHALL n'autoriser aucun message direct entre User_A et User_B sur aucune surface.
5. THE plateforme SHALL purger automatiquement les Match_Request `pending` non répondues sous 14 jours en les passant à `expired`.

### Requirement 25 : Anonymat avant et après match

**User Story :** En tant qu'utilisateur, je veux conserver l'anonymat tant que le Double_Optin n'est pas validé, afin de me protéger d'usages indésirables.

#### Acceptance Criteria

1. WHILE une Match_Request est `pending`, THE plateforme SHALL afficher uniquement l'Alias du profil cible, sans nom réel, photo, numéro WhatsApp, email ou localisation précise.
2. WHEN une Match_Request est acceptée, THE Dashboard_Web SHALL révéler le nom réel et la photo de profil aux deux participants au sein de la Conversation_Anonyme uniquement.
3. THE plateforme SHALL n'exposer ni le numéro WhatsApp ni l'email à aucun utilisateur tiers, en aucune circonstance, y compris après acceptation.
4. THE Bot_WhatsApp SHALL ne jamais transmettre la photo de profil d'un autre utilisateur dans le canal WhatsApp, même après acceptation.
5. THE plateforme SHALL générer chaque Alias selon un schéma `{adjectif}-{nom-commun}-{4 chiffres}` localisé en FR ou EN, unique et stable pour le couple `(user_id, conversation_id)`.

### Requirement 26 : Chat temps réel via Aura broadcast WebSocket

**User Story :** En tant qu'utilisateur, je veux échanger en temps réel avec mon contact dans le Dashboard_Web, afin d'avoir une expérience de messagerie fluide.

#### Acceptance Criteria

1. THE Dashboard_Web SHALL utiliser exclusivement Aura broadcast WebSocket (et non Socket.io) pour la diffusion temps réel des messages de chat.
2. WHEN un utilisateur ouvre une Conversation_Anonyme, THE Dashboard_Web SHALL le faire rejoindre la room `conversation:{conversation_id}`.
3. WHEN un message est posté, THE plateforme SHALL le persister dans `messages` avant de le diffuser dans la room correspondante.
4. THE plateforme SHALL diffuser dans la room `user:{user_id}` un événement de type `message_received` pour mettre à jour les compteurs non lus du Dashboard_Web même quand la conversation n'est pas ouverte.
5. WHEN un message est diffusé, THE plateforme SHALL déclencher l'envoi d'une Notification_WhatsApp via Bot_WhatsApp selon les règles de l'Exigence 16.

### Requirement 27 : Latence et capacité du chat

**User Story :** En tant qu'utilisateur, je veux que les messages s'affichent rapidement chez mon interlocuteur, afin que la conversation reste naturelle.

#### Acceptance Criteria

1. WHEN un message est envoyé via Dashboard_Web, THE plateforme SHALL persister et diffuser le message à tous les participants connectés en moins de 500 ms en charge nominale.
2. THE plateforme SHALL accepter des messages texte jusqu'à 4000 caractères et SHALL rejeter les messages plus longs avec un code d'erreur explicite.
3. THE plateforme SHALL supporter au minimum 200 Conversation_Anonyme actives simultanées dans le MVP, sans dégradation de latence au-delà de 1 seconde au 95e percentile.
4. WHEN un participant se reconnecte, THE Dashboard_Web SHALL réafficher l'historique récent (50 derniers messages) avant le chargement à la demande des messages plus anciens.

---

## E. Requirements Paiements et Monétisation

### Requirement 28 : Provider de paiement abstrait et multi-fournisseur

**User Story :** En tant qu'architecte, je veux que les paiements passent par une interface Provider_Paiement abstraite, afin d'ajouter Flutterwave en phase 3 sans refonte.

#### Acceptance Criteria

1. THE plateforme SHALL définir une interface `PaymentProvider` exposant `initiatePayment(input)`, `verifyWebhookSignature(headers, body)`, `getPaymentStatus(transId)` et `refundPayment(transId)`.
2. THE plateforme SHALL fournir Provider_Fapshi comme implémentation concrète utilisée en phase MVP et phase 2 au Cameroun.
3. WHERE la plateforme est déployée hors Cameroun, THE plateforme SHALL sélectionner Provider_Flutterwave selon la `region` de l'utilisateur.
4. THE plateforme SHALL persister chaque paiement dans `payments` avec `provider`, `provider_trans_id`, `type` (`badge`, `boost`, `pro`, `commission`), `amount`, `currency`, `status` (`pending`, `succeeded`, `failed`, `refunded`).
5. IF aucun Provider_Paiement n'est disponible pour la région de l'utilisateur, THEN THE plateforme SHALL bloquer l'initiation et retourner un code d'erreur `PAYMENT_UNAVAILABLE`.

### Requirement 29 : Webhook Fapshi sécurisé et idempotent

**User Story :** En tant qu'opérateur plateforme, je veux que les notifications Fapshi soient vérifiées et traitées de manière idempotente, afin d'éviter les doubles activations.

#### Acceptance Criteria

1. THE Webhook_Fapshi SHALL être exposé via `defineHttpAction` au chemin `/webhooks/fapshi` et SHALL accepter uniquement la méthode POST.
2. WHEN le Webhook_Fapshi reçoit une requête, THE plateforme SHALL vérifier la signature HMAC fournie par Fapshi conformément à la spécification de Provider_Fapshi.
3. IF la signature est invalide ou absente, THEN THE Webhook_Fapshi SHALL répondre avec HTTP 401 sans modifier l'état.
4. WHEN le Webhook_Fapshi reçoit un événement `payment_succeeded`, THE plateforme SHALL mettre à jour le `payments.status` à `succeeded` et déclencher l'activation du produit (Badge_Verifie, Boost ou Abonnement_Pro).
5. WHEN le Webhook_Fapshi reçoit le même `provider_trans_id` plusieurs fois, THE plateforme SHALL appliquer la mise à jour de manière idempotente sans réactiver de produits déjà activés.
6. THE Webhook_Fapshi SHALL appliquer le rate-limiter Aura (`@aura/rate-limit`) au niveau IP et au niveau `provider_trans_id` pour bloquer les abus.

### Requirement 30 : Phase 1 MVP gratuit

**User Story :** En tant qu'utilisateur en phase MVP, je veux accéder à toutes les fonctionnalités sans paiement pendant les six premiers mois, afin que la plateforme atteigne sa masse critique.

#### Acceptance Criteria

1. WHILE la plateforme est en `BUSINESS_PHASE = "mvp"`, THE plateforme SHALL ne déclencher aucune facturation et SHALL ne pas afficher les écrans de paiement aux utilisateurs.
2. WHILE `BUSINESS_PHASE = "mvp"`, THE plateforme SHALL plafonner le nombre de Match_Request par utilisateur et par jour à 20 pour limiter les abus.
3. THE plateforme SHALL exposer un flag de configuration `BUSINESS_PHASE` modifiable par les Admins et persisté de manière auditable.

### Requirement 31 : Phase 2 — Badge Vérifié, Boost, Abonnement Pro

**User Story :** En tant que Prestataire en phase 2, je veux pouvoir acheter un Badge_Verifie, un Boost ou un Abonnement_Pro, afin d'augmenter ma visibilité et débloquer des fonctionnalités premium.

#### Acceptance Criteria

1. WHILE `BUSINESS_PHASE = "freemium"`, THE Dashboard_Web SHALL exposer les offres Badge_Verifie (10 000 FCFA/an), Boost (1 000 FCFA / 7 jours) et Abonnement_Pro (3 000 FCFA/mois).
2. WHEN un Prestataire achète un Boost, THE plateforme SHALL persister la période d'activation `starts_at` à `now()` et `ends_at` à `now() + 7 jours`.
3. WHEN un Prestataire achète l'Abonnement_Pro, THE plateforme SHALL créer une `subscriptions` avec `plan = "pro"` et `ends_at` à `now() + 30 jours`, et SHALL programmer un job de renouvellement via `ctx.scheduler`.
4. WHEN un Prestataire achète le Badge_Verifie, THE plateforme SHALL déclencher le workflow de vérification d'identité (Requirement 32) avant d'activer `profiles.is_verified = true`.
5. WHILE un Boost est actif, THE Diversity_Mix SHALL appliquer la priorité top 3 décrite dans le Requirement 21.
6. WHILE un Abonnement_Pro est actif, THE plateforme SHALL débloquer les Match_Request illimitées pour le Prestataire concerné.

### Requirement 32 : Workflow de vérification d'identité Badge Vérifié

**User Story :** En tant que Prestataire candidat au Badge_Verifie, je veux soumettre un selfie et une CNI pour vérification, afin d'obtenir le badge de confiance.

#### Acceptance Criteria

1. WHEN un Prestataire achète le Badge_Verifie, THE plateforme SHALL démarrer un `defineWorkflow` `verification.identity` avec étapes `upload_documents → review → activate_or_reject`.
2. THE workflow SHALL accepter le téléversement d'un selfie et d'une CNI via `ctx.storage` avec accès restreint au rôle Admin.
3. THE Admin_Console SHALL afficher la file d'attente des dossiers `pending_review` avec selfie et CNI.
4. WHEN un Admin approuve un dossier, THE plateforme SHALL passer `profiles.is_verified` à `true` et notifier le Prestataire par Notification_WhatsApp.
5. IF un Admin rejette un dossier, THEN THE plateforme SHALL rembourser intégralement via `PaymentProvider.refundPayment` et notifier le Prestataire avec le motif.
6. THE plateforme SHALL conserver la traçabilité du workflow (étapes, décideur, timestamps) pour audit.

### Requirement 33 : Phase 3 — Commission sur missions et Escrow

**User Story :** En tant qu'opérateur plateforme en phase 3, je veux prélever une commission sur les missions déclarées avec garantie via Escrow, afin de monétiser au volume.

#### Acceptance Criteria

1. WHILE `BUSINESS_PHASE = "commission"`, THE plateforme SHALL permettre aux participants d'une Conversation_Anonyme de déclarer une mission avec `mission_amount` (FCFA) et `commission_rate` calculée entre 5 % et 8 % selon le segment.
2. WHEN une mission est déclarée, THE plateforme SHALL initier un paiement Escrow via `PaymentProvider.initiatePayment` séquestrant `mission_amount + commission`.
3. WHEN les deux parties confirment la livraison via le Dashboard_Web, THE plateforme SHALL libérer `mission_amount` au Prestataire et conserver la commission.
4. IF un litige est déclaré pendant l'Escrow, THEN THE plateforme SHALL geler les fonds jusqu'à résolution Admin.
5. WHEN un Admin tranche un litige Escrow, THE plateforme SHALL appliquer la décision (libération totale, remboursement total ou répartition) via `PaymentProvider.refundPayment` ou paiement partiel.

### Requirement 34 : Renouvellement automatique des abonnements

**User Story :** En tant que Prestataire abonné Pro, je veux que mon abonnement se renouvelle automatiquement, afin de ne pas perdre l'accès aux Match_Request illimitées.

#### Acceptance Criteria

1. WHEN une `subscriptions` arrive à 7 jours de son `ends_at`, THE plateforme SHALL envoyer une Notification_WhatsApp et un email rappelant le renouvellement et permettant l'annulation.
2. WHEN une `subscriptions` arrive à son `ends_at` sans annulation, THE plateforme SHALL initier automatiquement un nouveau paiement via `PaymentProvider.initiatePayment`.
3. IF le paiement de renouvellement échoue, THEN THE plateforme SHALL retenter une fois sous 24h, puis passer la `subscriptions.status` à `expired` et notifier l'utilisateur.
4. WHEN un utilisateur annule explicitement son abonnement, THE plateforme SHALL conserver l'accès Pro jusqu'à `ends_at` puis basculer vers le plan gratuit.

---

## F. Requirements Sécurité, Conformité et Multi-région

### Requirement 35 : Authentification et sessions

**User Story :** En tant qu'utilisateur du Dashboard_Web, je veux que mon authentification s'appuie sur le component `@aura/auth`, afin de bénéficier des sessions sécurisées et de la protection CSRF d'Aura.

#### Acceptance Criteria

1. THE plateforme SHALL utiliser `@aura/auth` comme composant d'authentification email/password.
2. THE plateforme SHALL appliquer la protection CSRF d'Aura à toutes les mutations exposées via `/aura/*` (cf. requirements Aura existants).
3. THE plateforme SHALL forcer HTTPS en production et SHALL refuser tout cookie de session sans flag `Secure` en production.
4. WHEN un utilisateur change son mot de passe, THE plateforme SHALL incrémenter `users.session_version` pour révoquer toutes les sessions existantes.
5. THE plateforme SHALL appliquer un rate-limit de 10 tentatives de connexion par IP par 5 minutes via `@aura/rate-limit`.

### Requirement 36 : Confidentialité des données privées

**User Story :** En tant qu'utilisateur, je veux que mes données privées (photo, numéro WhatsApp, email, CNI) ne soient jamais exposées en dehors des canaux prévus, afin de préserver ma vie privée.

#### Acceptance Criteria

1. THE plateforme SHALL ne jamais exposer dans aucune réponse API publique le `users.phone`, `users.email`, `users.password_hash` ou les documents d'identité.
2. THE Bot_WhatsApp SHALL ne jamais transmettre via WhatsApp le `phone` ou l'`email` d'un autre utilisateur, en aucun contexte.
3. THE plateforme SHALL stocker les documents d'identité (selfie, CNI) via `ctx.storage` avec ACL restreinte au rôle Admin et chiffrement au repos.
4. WHEN un utilisateur supprime son compte, THE plateforme SHALL anonymiser ses données personnelles (`name`, `phone`, `email`, `photo_url`) et supprimer ses documents d'identité dans un délai de 30 jours, tout en conservant les `messages` agrégés pour les Disputes en cours.
5. THE plateforme SHALL exposer un export des données personnelles d'un utilisateur sur demande explicite, livré dans un délai de 30 jours conformément au RGPD/lois locales applicables.

### Requirement 37 : Sécurité du transport WhatsApp et migration WA Business API

**User Story :** En tant qu'opérateur, je veux que la transition de Baileys vers WhatsApp_Business_API soit sécurisée et obligatoire avant la phase 2, afin de respecter les conditions d'utilisation de WhatsApp et éviter les bannissements.

#### Acceptance Criteria

1. WHILE `BUSINESS_PHASE = "mvp"`, THE plateforme SHALL utiliser exclusivement le SDK officiel Baileys (aucun fork) couplé à Evolution_API avec un seul numéro WhatsApp.
2. THE plateforme SHALL bloquer le passage à `BUSINESS_PHASE = "freemium"` tant que l'intégration WhatsApp_Business_API n'est pas validée par les tests d'intégration end-to-end.
3. THE plateforme SHALL définir une couche `WhatsAppTransport` interface implémentée par `BaileysTransport` (MVP) et `WhatsAppBusinessTransport` (production).
4. WHEN la plateforme passe en `BUSINESS_PHASE = "freemium"`, THE plateforme SHALL utiliser exclusivement `WhatsAppBusinessTransport`.
5. THE plateforme SHALL stocker les credentials WhatsApp dans une couche secrets (variables d'environnement) jamais loguées ni exposées côté client.

### Requirement 38 : Conformité CEMAC et lois locales

**User Story :** En tant qu'opérateur juridique, je veux que la plateforme respecte la réglementation CEMAC sur les paiements Mobile Money et la protection des données au Cameroun, afin d'opérer légalement.

#### Acceptance Criteria

1. THE plateforme SHALL conserver pour chaque paiement Mobile Money les champs requis par la réglementation CEMAC (timestamp, montant, devise, identifiant de transaction provider, identifiant utilisateur, status) pendant au minimum 10 ans.
2. THE plateforme SHALL afficher une politique de confidentialité accessible avant l'inscription, listant explicitement les types de données collectées, les finalités, les durées de conservation et les destinataires.
3. WHEN un utilisateur exerce son droit d'accès, de rectification ou de suppression, THE plateforme SHALL répondre dans un délai de 30 jours et fournir un accusé de réception sous 7 jours.
4. THE plateforme SHALL exiger un Consentement_Explicite distinct pour : la communication WhatsApp, le traitement des données conversationnelles dans le Knowledge_Graph, et le partage agrégé pour des statistiques business.
5. WHERE la plateforme s'étend à un nouveau pays (CI, Sénégal, Burkina), THE plateforme SHALL adapter la politique de confidentialité aux exigences locales avant l'activation des inscriptions dans ce pays.

### Requirement 39 : Multilinguisme FR/EN du Dashboard_Web

**User Story :** En tant qu'utilisateur anglophone, je veux que le Dashboard_Web soit disponible en anglais, afin d'accéder à la plateforme depuis les zones anglophones du Cameroun.

#### Acceptance Criteria

1. THE Dashboard_Web SHALL exposer une interface intégralement traduite en français (langue par défaut) et en anglais.
2. WHEN un utilisateur sélectionne sa langue préférée dans son profil, THE Dashboard_Web SHALL persister la préférence et l'appliquer à toutes les surfaces (UI, emails, Notification_WhatsApp).
3. THE Dashboard_Web SHALL détecter la langue navigateur lors de la première visite et utiliser cette langue tant que l'utilisateur n'a pas explicitement choisi.
4. THE plateforme SHALL valider que toute clé de traduction utilisée côté UI dispose d'une valeur dans les deux locales, sous peine d'échec de build.

### Requirement 40 : Préparation à l'expansion francophone

**User Story :** En tant qu'opérateur, je veux que l'architecture soit prête pour CI, Sénégal et Burkina, afin d'activer un nouveau pays sans refonte.

#### Acceptance Criteria

1. THE plateforme SHALL persister sur chaque utilisateur un champ `region` (ISO 3166-1 alpha-2) déterminé au moment de l'inscription via la sélection pays.
2. THE Orchestrateur_Matching SHALL filtrer les candidats par `region` par défaut, avec possibilité explicite d'élargir géographiquement à la demande de l'utilisateur.
3. THE plateforme SHALL associer chaque `region` à un `Provider_Paiement` configuré (Cameroun → Fapshi, autres → Flutterwave).
4. THE plateforme SHALL associer à chaque `region` la devise locale (FCFA pour CEMAC, FCFA UEMOA pour CI/Sénégal/Burkina) et appliquer les tarifs correspondants.
5. WHERE une `region` est désactivée par configuration, THE plateforme SHALL bloquer toute inscription avec message explicite localisé.

---

## G. Requirements Performance, Observabilité IA et Plateforme

### Requirement 41 : Performance du matching

**User Story :** En tant qu'utilisateur, je veux que la réponse du Bot_WhatsApp à une requête de matching arrive en moins de 3 minutes (objectif MVP), afin que l'expérience reste fluide.

#### Acceptance Criteria

1. WHEN un utilisateur soumet une requête de matching via Bot_WhatsApp, THE plateforme SHALL retourner les résultats dans un délai de 3 minutes au 95e percentile, incluant l'extraction d'entités, le Graph_Traversal, l'EmbeddingQuery, le HybridScoring, le Diversity_Mix et la génération de la réponse.
2. THE GraphTraversal SHALL répondre en moins de 800 ms au 95e percentile pour des requêtes parcourant jusqu'à 3 niveaux et 10 000 chemins.
3. THE EmbeddingQuery SHALL répondre en moins de 300 ms au 95e percentile via l'index `defineVectorIndex` HNSW de pgvector.
4. THE plateforme SHALL implémenter un cache Redis pour les résultats d'Orchestrateur_Matching avec TTL de 60 secondes, indexé par hash `(user_id, query_hash, region)`.

### Requirement 42 : Observabilité IA — usage tokens et qualité

**User Story :** En tant qu'opérateur, je veux suivre la consommation de tokens et la qualité du matching, afin d'optimiser les coûts et la satisfaction.

#### Acceptance Criteria

1. THE plateforme SHALL logger pour chaque appel LLM le `model`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `latency_ms`, `cost_usd`, `user_id` (hashé), `node_name` (`Conversation`, `Extraction`, `MatchingIntent`, `Response`).
2. THE Admin_Console SHALL afficher la consommation agrégée par jour, par node et par modèle, avec alerte automatique au-delà d'un seuil configurable.
3. THE plateforme SHALL collecter pour chaque session de matching le `query_id`, les profils proposés, les profils sélectionnés, le score de chaque profil, et la note utilisateur ultérieure si disponible.
4. THE plateforme SHALL exposer une métrique de qualité `match_quality_score` calculée comme `notes_>=4 / notes_total` sur fenêtre 30 jours et SHALL la rendre disponible dans les métriques business.
5. THE plateforme SHALL anonymiser les `user_id` dans les logs IA via hash HMAC stable pour préserver la confidentialité tout en gardant les agrégats par utilisateur.

### Requirement 43 : Provider LLM interchangeable

**User Story :** En tant qu'architecte IA, je veux que la couche LLM soit abstraite via LangChain, afin de changer de fournisseur (OpenAI, Anthropic, Mistral, modèle local) sans modifier les nodes.

#### Acceptance Criteria

1. THE plateforme SHALL utiliser LangChain comme couche d'abstraction pour les appels LLM dans Graphe_Agent_User et Orchestrateur_Matching.
2. THE plateforme SHALL configurer le provider et le modèle par défaut via variables d'environnement (`LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`).
3. THE plateforme SHALL permettre de surcharger le provider par node (par exemple Extraction utilise un modèle bon marché et rapide, Conversation utilise un modèle plus haut de gamme).
4. THE plateforme SHALL exposer un health-check par provider configuré et SHALL basculer sur un provider de secours après 3 échecs consécutifs.
5. WHERE un provider impose des `safety filters` qui bloquent une réponse, THE Graphe_Agent_User SHALL retourner un message de secours conforme à la Persona_Pro_Vouvoyante plutôt que la réponse brute du provider.

### Requirement 44 : Rate-limiting anti-abus

**User Story :** En tant qu'opérateur, je veux limiter les abus possibles via Bot_WhatsApp, Webhook_Fapshi, Webhook_WhatsApp et matching, afin de préserver la disponibilité.

#### Acceptance Criteria

1. THE plateforme SHALL appliquer via `@aura/rate-limit` une limite de 60 messages WhatsApp par utilisateur par minute, retournant une réponse polie de pause au-delà.
2. THE plateforme SHALL appliquer une limite par IP de 100 requêtes/minute sur Webhook_Fapshi et Webhook_WhatsApp.
3. THE plateforme SHALL appliquer une limite par utilisateur de 20 requêtes de matching par jour en `BUSINESS_PHASE = "mvp"` et de 50 par jour pour les utilisateurs gratuits en `BUSINESS_PHASE = "freemium"`.
4. WHILE un Abonnement_Pro est actif, THE plateforme SHALL débloquer la limite quotidienne de Match_Request à 500/jour pour limiter encore les abus extrêmes.
5. WHEN un rate-limit est dépassé, THE plateforme SHALL répondre avec un code `RATE_LIMITED` et un délai `retry_after_seconds` indicatif.

### Requirement 45 : Déploiement et monitoring d'infrastructure

**User Story :** En tant qu'ingénieur infra, je veux un déploiement reproductible sur VPS avec monitoring de base, afin de superviser la plateforme.

#### Acceptance Criteria

1. THE plateforme SHALL exposer un endpoint `/health` géré par Aura retournant le status de PostgreSQL, Redis, Evolution_API et au moins un Provider_Paiement.
2. THE plateforme SHALL logger toutes les requêtes HTTP et tous les jobs de scheduler avec niveau, message et `correlation_id` partagé entre Webhook_WhatsApp, Graphe_Agent_User et Orchestrateur_Matching.
3. THE plateforme SHALL exposer des métriques Prometheus-compatibles pour : nombre de messages WhatsApp traités, latence Bot_WhatsApp, latence Orchestrateur_Matching, taux d'erreur Webhook_Fapshi, queue size scheduler.
4. THE plateforme SHALL être conteneurisable via Docker et déployable sur VPS Linux unique en MVP avec PostgreSQL+pgvector, Redis et Evolution_API en services adjacents.
5. THE plateforme SHALL disposer d'une procédure documentée de sauvegarde quotidienne de PostgreSQL incluant `entities`, `relations`, `graph_embeddings`, `messages`, `payments`.

### Requirement 46 : Validation et erreurs côté API

**User Story :** En tant que développeur consommant les operations Aura, je veux des messages d'erreur structurés, afin de remonter des erreurs intelligibles côté UI.

#### Acceptance Criteria

1. THE plateforme SHALL valider toutes les entrées d'operations via Zod et SHALL retourner les erreurs sous forme `AuraError("VALIDATION_ERROR", { fieldErrors })`.
2. WHEN une operation rencontre une erreur métier identifiable (Match_Request déjà existante, Service au-delà de la limite, Boost déjà actif), THE plateforme SHALL retourner un code d'erreur métier dédié plutôt que `INTERNAL_ERROR`.
3. THE plateforme SHALL ne jamais exposer dans les messages d'erreur les détails internes (stack traces, requêtes SQL, secrets) en production.
4. THE plateforme SHALL associer chaque erreur à un `requestId` UUID propagé dans les logs et dans la réponse pour faciliter le debug.

### Requirement 47 : Tests d'intégration end-to-end critiques

**User Story :** En tant qu'ingénieur QA, je veux des tests end-to-end couvrant les parcours critiques, afin de valider la non-régression avant chaque déploiement.

#### Acceptance Criteria

1. THE plateforme SHALL fournir un test e2e couvrant le parcours `inscription dashboard → liaison WhatsApp → choix prestataire → ajout service → recherche utilisateur → matching → double opt-in → premier message chat`.
2. THE plateforme SHALL fournir un test e2e couvrant `achat Badge_Verifie → upload selfie/CNI → revue Admin → activation badge → notification WhatsApp`.
3. THE plateforme SHALL fournir un test e2e couvrant `signalement Dispute → snapshot → revue Admin → avertissement → suspension après 3 avertissements`.
4. THE plateforme SHALL fournir un test e2e couvrant `paiement Fapshi → webhook signé → activation produit → idempotence webhook répété`.
5. THE plateforme SHALL exécuter les tests e2e contre une base PostgreSQL+pgvector éphémère et un mock Evolution_API et Provider_Fapshi.

### Requirement 48 : Round-trip parsing/sérialisation des messages WhatsApp

**User Story :** En tant qu'architecte, je veux garantir l'intégrité des messages WhatsApp entrants/sortants après parsing, afin que les conversions ne perdent pas d'information.

#### Acceptance Criteria

1. THE plateforme SHALL exposer `parseWhatsAppMessage(payload)` validant la charge utile Evolution_API (et WhatsApp_Business_API) et retournant un objet `WhatsAppMessage` typé.
2. THE plateforme SHALL exposer `serializeWhatsAppMessage(msg)` produisant la charge utile sortante.
3. FOR ALL `WhatsAppMessage` valides produits par `parseWhatsAppMessage`, `parseWhatsAppMessage(serializeWhatsAppMessage(msg))` SHALL produire un objet équivalent (round-trip property).
4. IF `parseWhatsAppMessage` reçoit une charge utile non conforme, THEN THE plateforme SHALL retourner une erreur structurée et SHALL ne pas modifier l'état du système.
5. THE plateforme SHALL conserver les payloads bruts entrants pendant 30 jours pour debug, en ACL restreinte aux Admins.

### Requirement 49 : Idempotence des actions critiques

**User Story :** En tant qu'utilisateur, je veux que les retries automatiques (réseau instable, retry WhatsApp) ne dupliquent pas mes Match_Request, messages chat ou paiements.

#### Acceptance Criteria

1. THE plateforme SHALL accepter un en-tête `Idempotency-Key` sur les operations `match.create`, `chat.sendMessage`, `payment.initiate` et SHALL retourner la réponse antérieure si la même clé est rejouée dans une fenêtre de 24h.
2. WHEN un Webhook_Fapshi rejoue un événement déjà traité, THE plateforme SHALL retourner HTTP 200 sans modifier l'état (cf. Exigence 29.5).
3. WHEN le Bot_WhatsApp doit envoyer une Notification_WhatsApp avec retry, THE plateforme SHALL utiliser un identifiant de message unique côté provider pour éviter les doublons côté utilisateur.

### Requirement 50 : Gestion de la diversité géographique des utilisateurs

**User Story :** En tant qu'utilisateur dans une région donnée, je veux que les résultats de matching priorisent les profils proches géographiquement par défaut, afin que les mises en relation soient pratiquement réalisables.

#### Acceptance Criteria

1. THE Orchestrateur_Matching SHALL utiliser la `region` du demandeur comme filtre primaire et la `location` (ville/zone) comme bonus de scoring (proximité = bonus multiplicatif).
2. WHEN un utilisateur précise explicitement « partout » ou « toutes régions » dans sa requête conversationnelle, THE Graphe_Agent_User SHALL signaler cette extension à l'Orchestrateur_Matching qui SHALL relâcher le filtre `region`.
3. THE plateforme SHALL ne jamais matcher un utilisateur d'une `region` dont le `Provider_Paiement` n'est pas configuré, dans les phases monétisées (`freemium` et `commission`), afin d'éviter des mises en relation non monétisables.
4. THE plateforme SHALL exposer dans le profil prestataire la zone d'intervention (`zone`) au format texte libre et l'utiliser comme entité `Location` dans le Knowledge_Graph.
