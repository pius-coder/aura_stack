# Plan d'Implémentation — WhatsApp AI Matchmaking Platform

## Structure

Le plan suit 7 phases ordonnées par dépendances. Chaque tâche référence les requirements (R<n>) et la section de conception (design.md §<section>). Les fichiers à créer/modifier sont listés.

---

## Phase 1 — Fondations WhatsApp & Auth

### 1.1 Liaison WhatsApp par code (R2, design.md § « Liaison numéro »)

**Description** : Générer un code de liaison de 8 caractères, l'associer au `AuraPhoneIdentity`, gérer l'expiration 30 min.

**Fichiers** :
- `src/operations/auth/generate-link-code.operation.ts` — mutation, génère code 8 alphanum, persiste sur `AuraPhoneIdentity.linkCode` + `linkCodeExpiresAt`
- `src/operations/auth/link-whatsapp.operation.ts` — mutation interne, appelée par le bot quand un message match `^[A-Z0-9]{8}$`
- `src/operations/agent/nodes/hydration.ts` — ajouter détection du code de liaison dans le flux

**Critère** : Un utilisateur inscrit voit son code dans le dashboard, l'envoie au bot WhatsApp, et son compte est lié.

---

### 1.2 Alias anonyme (R25.5, design.md non couvert)

**Description** : Générer un alias `{adjectif}-{nom}-{4chiffres}` localisé FR/EN, unique et stable par `(user_id, conversation_id)`.

**Fichiers** :
- `src/lib/alias/generator.ts` — générateur avec listes d'adjectifs et noms FR/EN
- `src/lib/alias/generator.test.ts`
- `src/operations/profiles/update.operation.ts` — ajouter génération d'alias à la création de profil
- `src/operations/matches/accept.operation.ts` — révéler nom réel + photo après acceptation

**Critère** : Tout nouveau profil reçoit un alias unique. Avant double opt-in, seul l'alias est affiché.

---

### 1.3 Notifications WhatsApp (R16, design.md § « Couche Chat »)

**Description** : Envoyer des notifications WhatsApp pour les événements : nouveau message, acceptation/refus de match, activation produit.

**Fichiers** :
- `src/operations/notifications/whatsapp-send.action.ts` — action interne, écrit dans `WhatsappOutbox`
- `src/lib/whatsapp/aggregator.ts` — agrégation 60s même conversation (R16.4)
- `src/operations/notifications/send-on-event.cron.ts` — cron qui surveille les événements et déclenche les notifications
- Modifier `src/operations/matches/accept.operation.ts` + `refuse` + `chat/send-message` + `webhooks/fapshi.http.ts` pour déclencher notifications

**Critère** : Un utilisateur reçoit une notification WhatsApp dans sa langue pour chaque événement clé (sauf désactivation explicite).

---

### 1.4 Préférence langue + détection (R12, R39, design.md § R12)

**Description** : Détecter et persister la langue préférée de l'utilisateur (FR/EN).

**Fichiers** :
- `src/lib/i18n/detect.ts` — détection de langue (FR/EN) depuis le texte
- `src/lib/i18n/translations.ts` — fichiers de traduction FR/EN pour les templates de notification et réponses bot
- `src/operations/agent/nodes/conversation.ts` — injecter la langue dans le prompt LLM
- `src/operations/profiles/set-language.operation.ts` — déjà existant, à enrichir avec auto-détection

**Critère** : Le bot détecte la langue avec confiance > 0.8 et répond dans la même langue. La langue est persistée.

---

## Phase 2 — Agent WhatsApp LangGraph complet

### 2.1 Persona guardrail avec régénération (R11, design.md § ResponseNode)

**Description** : Vérifier la conformité à la Persona_Pro_Vouvoyante et régénérer si nécessaire.

**Fichiers** :
- `src/operations/ai/persona-prompts.ts` — system prompts FR/EN, définition stricte
- `src/operations/agent/nodes/response.ts` — enrichir avec :
  - Appel LLM de validation de conformité
  - Régénération automatique jusqu'à 2 tentatives
  - Réponse de secours prédéfinie après échec
- `src/operations/ai/persona-guardrail.test.ts`

**Critère** : Toute réponse contenant du tutoiement, argot, ou emoji excessif est régénérée avant envoi.

---

### 2.2 Hydratation contexte (R13, design.md § HydrationNode)

**Description** : Charger profil + services + historique à chaque tour de conversation.

**Fichiers** :
- `src/operations/agent/nodes/hydration.ts` — enrichir avec :
  - Chargement complet du profil (name, bio, skills, location, isProvider, isVerified)
  - Chargement des services actifs (max 10)
  - Chargement des dernières Match_Request (max 5)
  - Injection structurée dans l'état LangGraph

**Critère** : L'agent connaît le profil et les services de l'utilisateur dès le premier message.

---

### 2.3 Détection d'intention via LLM (R14, design.md § MatchingIntentNode)

**Description** : Classifier l'intention du message utilisateur via LLM.

**Fichiers** :
- `src/operations/agent/nodes/matching-intent.ts` — remplacer le schéma vide par :
  - Appel LLM avec classification structurée (JSON output)
  - Intentions : `chat`, `recherche_prestataire`, `recherche_connexion`, `gestion_compte`, `aide`
  - Extraction des contraintes (skills, location, industry, need, budget)
  - Seuil de confiance 0.7, demande de confirmation si en dessous
- `src/operations/ai/extraction-schemas.ts` — schémas Zod pour la sortie structurée

**Critère** : Une phrase comme « je cherche un plombier à Douala » détecte `recherche_prestataire` avec les contraintes `skill: plombier`, `location: Douala`.

---

### 2.4 Présentation textuelle des résultats (R15, design.md § R15)

**Description** : Formater les résultats du matching en message WhatsApp texte.

**Fichiers** :
- `src/lib/matching/format-results.ts` — formateur :
  - Max 5 profils avec alias, résumé, services, identifiant numéroté
  - Indication de diversité (très compatible vs complémentaire)
  - Ne jamais transmettre photo, téléphone, email
- `src/operations/agent/nodes/response.ts` — intégrer le formateur dans le flux

**Critère** : Les résultats de matching sont présentés de manière lisible et actionable dans WhatsApp.

---

### 2.5 Extraction d'entités depuis conversation (R18, design.md § ExtractionNode)

**Description** : Extraire les entités (Skill, Location, Industry, Need) et relations depuis les messages.

**Fichiers** :
- `src/operations/agent/nodes/extraction.ts` — remplacer le schéma vide par :
  - Appel LLM avec structured output pour extraire entités
  - Mapping vers les types KnowledgeEntity
  - Calcul de confidence
  - Dédoublonnage (incrémenter confidence si existe déjà)
  - Persistance via `graph/upsert-entity` + `graph/upsert-relation`

**Critère** : Après chaque conversation, de nouvelles entités/relations sont persistées dans le Knowledge Graph.

---

### 2.6 Graphe_Agent_User par utilisateur (design.md § « Instance IA »)

**Description** : Isoler l'état LangGraph par utilisateur avec checkpointer PostgreSQL.

**Fichiers** :
- `src/operations/agents/whatsapp-bot.agent.ts` — refactor pour instancier un agent par `(userId, phoneE164)`
- `src/lib/agent/factory.ts` — usine à agents : résout l'instance depuis `userId`, crée si inexistante
- `src/operations/agent/process-incoming.operation.ts` — utiliser la factory pour router le message vers la bonne instance
- Vérifier que `AuraAgentThread` est bien indexé par `(agentName, userId)` et que le checkpointer est fonctionnel

**Critère** : Chaque utilisateur a son propre thread LangGraph isolé. Les conversations parallèles ne s'entremêlent pas.

---

## Phase 3 — Matching & Graph RAG

### 3.1 CTE récursive — Graph traversal (R19, design.md § GraphTraversal)

**Description** : Implémenter le parcours de graphe via CTE récursive PostgreSQL.

**Fichiers** :
- `src/operations/graph/traverse.db-read.ts` — requête SQL :
```sql
WITH RECURSIVE paths AS (
  -- Seed: entités correspondant aux contraintes de la requête
  SELECT e.id AS start_id, r.target_entity_id AS entity_id, r.strength AS score, 1 AS depth
  FROM entities e
  JOIN relations r ON r.source_entity_id = e.id
  WHERE e.user_id = $requesterId AND e.type IN ($skills, $industry, ...)
  
  UNION ALL
  
  -- Récurrence: chemins de longueur 1-3
  SELECT p.start_id, r.target_entity_id, p.score * r.strength * 0.85, p.depth + 1
  FROM paths p
  JOIN relations r ON r.source_entity_id = p.entity_id
  WHERE p.depth < 3
)
SELECT entity_id, MAX(score) AS score
FROM paths
WHERE depth <= 3
GROUP BY entity_id
ORDER BY score DESC
LIMIT 50;
```
- Indexer `entities(user_id, type)`, `relations(predicate, source_entity_id)`, `relations(predicate, target_entity_id)`

**Critère** : Une requête de matching retourne jusqu'à 50 candidats avec score de chemin en < 800 ms.

---

### 3.2 Recherche vectorielle hybride — pgvector (R20, design.md § EmbeddingQuery)

**Description** : Implémenter la recherche vectorielle et fusion RRF.

**Fichiers** :
- `src/operations/graph/search-vector.action.ts` — action interne :
  - Générer embedding 1536d de la requête via LLM
  - Exécuter `SELECT * FROM graph_embeddings ORDER BY embedding <=> $1 LIMIT 50`
  - Appliquer filtres (region, status, exclusion de soi-même)
- `src/operations/matching/run.operation.ts` — remplacer le keyword matching par :
  - Paralléliser GraphTraversal + EmbeddingQuery (Promise.all)
  - Fusion RRF avec k=60
  - Appliquer bonus Badge_Verifie (×1.10)
  - Appliquer priorité Boost (top 3)
- `src/lib/matching/rrf.ts` — implémentation RRF
- Migration pgvector : ajouter index HNSW sur `graph_embeddings.embedding`

**Critère** : Le matching combine signaux graphe + vecteur avec score RRF normalisé entre 0 et 1.

---

### 3.3 Diversity_Mix (R21, design.md § Diversity)

**Description** : Mélanger profils très compatibles et complémentaires.

**Fichiers** :
- `src/lib/matching/diversity.ts` — implémentation :
  - Trier par score décroissant
  - Quartile supérieur → 60% des sélections
  - Quartile médian → 30%
  - Quartile inférieur → 10% (wildcard)
  - Priorité Boost: réserver position 1-3 si actif
  - Bonus Badge_Verifie: multiplier score ×1.10
  - Garantir pas de doublon
- `src/operations/matching/run.operation.ts` — intégrer Diversity_Mix

**Critère** : Les résultats contiennent un mélange de profils très pertinents et de profils complémentaires inattendus.

---

### 3.4 Operations CRUD Knowledge Graph (R17, R22, R23)

**Description** : Implémenter les opérations de base du Knowledge Graph.

**Fichiers** :
- `src/operations/graph/upsert-entity.operation.ts` — upsert avec déduplication par `(user_id, type, value)`
- `src/operations/graph/upsert-relation.operation.ts` — upsert relation avec calcul de strength
- `src/operations/embeddings/regenerate.operation.ts` — remplacer le stub : générer embedding LLM, persister dans `graph_embeddings`
- `src/lib/graph/serialize.ts` — fonctions `serializeEntity`/`parseEntity`/`serializeRelation`/`parseRelation` avec round-trip property
- `src/lib/graph/serialize.test.ts`

**Critère** : Toute entité/relation peut être sérialisée en JSON et désérialisée sans perte.

---

### 3.5 Mise à jour incrémentale du KG (R22, design.md § R22)

**Description** : Propager les modifications profil/service au Knowledge Graph.

**Fichiers** :
- `src/operations/services/create.operation.ts` — ajouter déclenchement de `graph/upsert-entity` + `embeddings/regenerate`
- `src/operations/services/update.operation.ts` — idem
- `src/operations/services/delete.operation.ts` — idem
- `src/operations/profiles/update.operation.ts` — idem pour bio, skills, location
- `src/operations/ratings/create.operation.ts` — créer/mettre à jour relation `RATED` avec strength dérivée du score
- `src/cron/refresh-views.cron.ts` — refresh materialized views (horaire)

**Critère** : Une modification de profil est reflétée dans le Knowledge Graph en < 60s.

---

## Phase 4 — Chat Temps Réel

### 4.1 WebSocket broadcast branché au chat (R26, design.md § « Couche Chat »)

**Description** : Brancher le broadcast Aura aux routes de chat pour le temps réel.

**Fichiers** :
- `src/operations/chat/send-message.operation.ts` — après persistance, diffuser via broadcast WS :
  - `room:conversation:{conversationId}` → event `message:new`
  - `room:user:{recipientId}` → event `unread:new`
- `src/operations/chat/list-conversations.operation.ts` — diffuser `presence:online` à l'ouverture
- `src/app/routes/app/chat/index.tsx` — souscrire à la room WebSocket, mise à jour temps réel
- Ajouter gestion des événements `presence:typing`, `message:read`

**Critère** : Un message envoyé apparaît chez le destinataire en < 500 ms sans reload.

---

### 4.2 Pagination curseur (R8.2, R27)

**Description** : Pagination curseur pour l'historique des messages (20 par page).

**Fichiers** :
- `src/operations/chat/list-messages.operation.ts` — remplacer offset par pagination curseur (clé composite `(conversation_id, created_at, id)`)
- `src/lib/pagination/cursor.ts` — helpers curseur opaque base64

**Critère** : L'historique se charge 20 messages à la fois avec curseur, pas de saut si nouveau message inséré.

---

## Phase 5 — Paiements & Monétisation

### 5.1 Quotas phase MVP (R30, design.md § R30)

**Description** : Limiter à 20 Match_Request/jour en phase MVP.

**Fichiers** :
- `src/lib/feature-flags.ts` — ajouter `BUSINESS_PHASE` avec valeurs `mvp | freemium | commission`
- `src/operations/_middleware/with-pro-quota.middleware.ts` — middleware qui compte les Match_Request du jour et refuse si >= 20
- `src/operations/matches/create.operation.ts` — appliquer le middleware
- Portail Admin pour changer `BUSINESS_PHASE` de manière auditée

**Critère** : En phase MVP, un utilisateur ne peut pas créer plus de 20 Match_Request par jour.

---

### 5.2 Abonnement Pro — auto-renouvellement (R34, design.md § R34)

**Description** : Renouvellement automatique avec notification 7 jours avant.

**Fichiers** :
- `src/operations/subscriptions/status.operation.ts` — query statut abonnement
- `src/operations/subscriptions/cancel.operation.ts` — mutation annulation
- `src/operations/subscriptions/renew-charge.cron.ts` — cron quotidien :
  - Détecte abonnements expirant dans 7 jours → notification
  - Détecte abonnements expirés → tente recharge via PaymentProvider
- Modifier `src/operations/webhooks/fapshi.http.ts` — activation abonnement après paiement

**Critère** : Un abonnement Pro se renouvelle automatiquement ; notification 7 jours avant.

---

### 5.3 Workflow vérification d'identité (R32, design.md § R32)

**Description** : Workflow durable pour le Badge Vérifié (upload → review → activate/reject).

**Fichiers** :
- `src/operations/workflows/verify-identity.workflow.ts` — workflow avec étapes :
  1. `upload_documents` — selfie + CNI via `ctx.storage`
  2. `review` — Admin examine dans Admin_Console
  3. `activate_or_reject` — active `Profile.isVerified` ou rembourse
- `src/app/routes/admin/verifications.tsx` — file d'attente des dossiers
- `src/operations/admin/verify-identity.operation.ts` — approuver/rejeter

**Critère** : Un prestataire achète le badge, upload ses documents, un admin approuve, le profil est vérifié.

---

## Phase 6 — Admin & Observabilité

### 6.1 Métriques business (R10.4, design.md § « Couche Observabilité »)

**Description** : Dashboard Admin avec métriques agrégées 30 jours.

**Fichiers** :
- `src/operations/admin/metrics-business.operation.ts` — query agrégée :
  - Utilisateurs actifs (30j)
  - Match_Request créées
  - Taux d'acceptation
  - Conversations ouvertes
  - Disputes ouvertes/résolues
- `src/app/routes/admin/index.tsx` — afficher les métriques (Recharts)

**Critère** : L'Admin_Console affiche des chiffres réels, pas des `--`.

---

### 6.2 Métriques IA (R10.5, R42, design.md § R42)

**Description** : Dashboard des métriques d'observabilité IA.

**Fichiers** :
- `src/operations/admin/metrics-ai.operation.ts` — query agrégée depuis `AuraAIUsage` + `MatchSession` :
  - Tokens consommés par modèle
  - Latence moyenne Bot_WhatsApp
  - Latence moyenne Orchestrateur_Matching
  - Taux de matchings notés ≥ 4/5
- `src/app/routes/admin/index.tsx` — graphiques Recharts

**Critère** : L'Admin voit la consommation LLM, les latences et la qualité du matching.

---

### 6.3 Idempotence (R49, design.md non couvert explicitement)

**Description** : Implémenter l'en-tête `Idempotency-Key` sur les mutations sensibles.

**Fichiers** :
- `src/aura/server/middleware/idempotency.ts` — middleware qui :
  - Vérifie `Idempotency-Key` header
  - Cache Redis avec TTL 24h
  - Retourne la réponse mise en cache si déjà traitée
- Appliquer sur : `matches/create`, `payments/start-checkout`, `ratings/create`, `disputes/create`

**Critère** : Une double soumission de paiement ou de match request ne crée pas de doublon.

---

## Phase 7 — Tests & Qualité

### 7.1 Tests unitaires — Core Graph RAG

**Fichiers** :
- `src/lib/matching/rrf.test.ts` — fusion RRF
- `src/lib/matching/diversity.test.ts` — diversity mix
- `src/lib/graph/serialize.test.ts` — round-trip
- `src/operations/graph/traverse.db-read.test.ts` — CTE (via base de test pg)
- `src/lib/alias/generator.test.ts` — alias

### 7.2 Tests d'intégration — Operations

**Fichiers** :
- `src/operations/matching/run.test.ts` — matching complet
- `src/operations/chat/send-message.test.ts` — message + broadcast
- `src/operations/webhooks/fapshi.http.test.ts` — webhook fapshi

### 7.3 Tests E2E (R47)

**Fichiers** :
- `e2e/whatsapp-matching.spec.ts` — parcours complet : liaison → profil → matching → chat
- `e2e/payment-badge.spec.ts` — achat badge → vérification → activation

---

## Ordre d'Exécution Recommandé

```
Phase 1 (Fondations WhatsApp)
  └─ 1.1 → 1.2 → 1.3 → 1.4
        │
Phase 2 (Agent WhatsApp complet)
  └─ 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6
        │
Phase 3 (Matching & Graph RAG) ← CŒUR DU PRODUIT
  └─ 3.1 → 3.2 → 3.3 → 3.4 → 3.5
        │
Phase 4 (Chat Temps Réel)
  └─ 4.1 → 4.2
        │
Phase 5 (Paiements)
  └─ 5.1 → 5.2 → 5.3
        │
Phase 6 (Admin & Observabilité)
  └─ 6.1 → 6.2 → 6.3
        │
Phase 7 (Tests)
  └─ 7.1 → 7.2 → 7.3
```

Chaque phase produit des features livrables et testables indépendamment. Les phases 1-4 constituent le MVP fonctionnel. Les phases 5-7 sont la monétisation et la robustesse.
