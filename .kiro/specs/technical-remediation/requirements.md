# Document de Requirements — Rémediation Technique (4 Bloquants)

**Source** : `.kiro/analysis.md` sections 1-4, 13.1-13.12
**Dépendance** : `.kiro/specs/whatsapp-ai-matchmaking-platform/requirements.md` (requirements métier existants R1-R52)
**Statut** : Phase d'implémentation, prérequis technique avant mise en production

Ces requirements couvrent les 4 bloquants identifiés dans l'analyse d'écart entre le design cible et l'implémentation actuelle. Ils sont rédigés dans le même format que les requirements métier existants (User Story + Acceptance Criteria) et s'y ajoutent comme couche technique.

---

## A. Cache Redis pour matching et hydration

### Requirement TR1 : Service de cache Redis avec anti-stampede

**User Story :** En tant qu'architecte, je veux un service Redis centralisé avec mécanisme anti-stampede, afin d'éviter les calculs redondants de matching et réduire la latence.

#### Acceptance Criteria

1. THE plateforme SHALL exposer un `RedisService extends AuraService` avec les méthodes `getCached<T>(key)`, `setCached<T>(key, value, ttlSeconds)`, `invalidateByUser(userId)`, `acquireLock(key, ttlSeconds)`.
2. THE RedisService SHALL implémenter le pattern namespace suivant :
   - `matching:results:{userId}:{queryHash}` TTL 60s
   - `matching:candidates:{userId}:{region}` TTL 120s
   - `hydration:profile:{userId}` TTL 300s
   - `session:window:{userId}:whatsapp` TTL 86400s (24h)
3. THE queryHash SHALL être calculé via HMAC-MD5 des paramètres de requête normalisés (JSON trié par clé), tronqué à 16 caractères hex.
4. THE `getCached()` SHALL implémenter un lock anti-stampede via `SET key value NX EX 10` : si le verrou est acquis, le thread calcule et stocke ; si le verrou est déjà pris, le thread attend 100ms et retente jusqu'à 5 fois avant de calculer directement.
5. THE `invalidateByUser(userId)` SHALL maintenir un SET Redis des clés indexées par userId et SHALL supprimer toutes les clés associées en une seule pipeline DEL.
6. THE RedisService SHALL être connecté via `process.env.REDIS_URL` et SHALL supporter une config locale sans Redis (fallback mémoire).
7. THE RedisService SHALL être testé avec `ioredis-mock` pour les tests unitaires et avec un conteneur Redis réel pour les tests d'intégration.

### Requirement TR2 : Cache du matching orchestré

**User Story :** En tant qu'utilisateur, je veux que les résultats de matching soient servis depuis le cache Redis quand la même requête est répétée rapidement, afin d'obtenir une réponse quasi instantanée.

#### Acceptance Criteria

1. WHEN `MatchingService.runQuery()` reçoit une requête, THE MatchingService SHALL d'abord consulter le cache Redis avec clé `matching:results:{userId}:{queryHash}`.
2. IF la clé existe dans Redis, THE MatchingService SHALL retourner les résultats cachead sans exécuter le pipeline GraphTraversal + EmbeddingQuery.
3. IF la clé n'existe pas, THE MatchingService SHALL exécuter le pipeline complet, puis stocker le résultat dans Redis avec TTL 60s avant de le retourner.
4. WHEN un profil est mis à jour (bio, skills, location, services), THE plateforme SHALL invalider via `invalidateByUser(userId)` toutes les clés de matching qui incluaient ce userId.
5. THE cache SHALL exposer une métrique de hit ratio dans l'Admin_Console.

---

## B. pgvector + Embedding Query

### Requirement TR3 : Migration embedding vers modèle dédié

**User Story :** En tant qu'architecte IA, je veux remplacer l'embedding via LLM Mistral (45s) par un modèle d'embedding dédié (< 1s), afin de rendre la branche vectorielle du matching viable.

#### Acceptance Criteria

1. THE plateforme SHALL utiliser `text-embedding-3-small` (OpenAI, 1536 dimensions) comme modèle d'embedding par défaut, configurable via variable d'environnement `EMBEDDING_MODEL`.
2. WHEN `EmbeddingService.generateEmbedding(text)` est appelé, THE plateforme SHALL retourner un vecteur Float32[1536] en moins de 1 seconde pour un texte de 512 tokens.
3. THE `generateEmbedding()` SHALL mettre en cache Redis (TTL 3600s) les embeddings par hash du texte source pour éviter les appels redondants à l'API OpenAI.
4. THE `KnowledgeGraphService.regenerateEmbedding()` SHALL utiliser `EmbeddingService.generateEmbedding()` au lieu de l'appel LLM Mistral actuel.
5. THE coût par embedding SHALL être inférieur à $0.0002 (tarif OpenAI : $0.02/1M tokens).

### Requirement TR4 : Index pgvector HNSW et recherche vectorielle

**User Story :** En tant qu'architecte IA, je veux un index HNSW sur la colonne embedding des profils utilisateurs, afin d'exécuter des recherches de similarité cosine en moins de 300ms.

#### Acceptance Criteria

1. THE table `user_profiles` SHALL avoir une colonne `embedding vector(1536)` avec un index HNSW créé via :
   ```sql
   CREATE INDEX IF NOT EXISTS idx_user_profiles_embedding_hnsw
     ON user_profiles USING hnsw (embedding vector_cosine_ops)
     WITH (m = 16, ef_construction = 64);
   ```
2. THE `search-vector.action.ts` SHALL remplacer son stub `return { results: [], query: "" }` par une vraie requête pgvector cosine :
   ```sql
   SELECT user_id, embedding <=> :query_embedding AS distance
   FROM user_profiles
   WHERE status = 'active'
   ORDER BY embedding <=> :query_embedding
   LIMIT 50;
   ```
3. THE EmbeddingQuery SHALL retourner les 50 candidats les plus proches avec leur distance cosine, en moins de 300ms au 95e percentile sur 10 000 profils.
4. THE EmbeddingQuery SHALL exclure : le demandeur, les profils déjà matchés (moins 30 jours), les profils suspendus, les profils bloqués par le demandeur.
5. THE EmbeddingService SHALL exposer `findSimilar(userId, queryText, limit)` qui génère l'embedding de la requête, exécute la recherche HNSW, vérifie le cache Redis, et retourne les résultats classés.

### Requirement TR5 : Hybrid search (vector + full-text)

**User Story :** En tant qu'utilisateur, je veux que la recherche sémantique soit combinée à la recherche textuelle exacte, afin de trouver des profils même quand les termes exacts ne matchent pas.

#### Acceptance Criteria

1. THE `search-vector.action.ts` SHALL exposer une variante hybride qui combine similarité cosine et full-text search PostgreSQL :
   ```sql
   ORDER BY (0.7 * (1 - (embedding <=> :query_embedding))) +
            (0.3 * ts_rank(search_vector, plainto_tsquery(:query_text))) DESC
   ```
2. THE table `user_profiles` SHALL avoir une colonne `search_vector tsvector` indexée GIN, mise à jour automatiquement via trigger sur les champs `bio`, `skills`, `location`.
3. WHILE la colonne `search_vector` n'est pas encore disponible, THE plateforme SHALL utiliser la recherche cosine seule.

---

## C. CTE Traversal → MatchingService

### Requirement TR6 : Branchage du CTE traversal dans MatchingService

**User Story :** En tant qu'utilisateur, je veux que le matching utilise le graphe de connaissances (entités, relations) en plus des vecteurs, afin de découvrir des connexions indirectes pertinentes.

#### Acceptance Criteria

1. THE `MatchingService.runQuery()` SHALL exécuter en parallèle :
   - `KnowledgeGraphService.traverse(requesterId, constraints)` — CTE récursif depth ≤ 3, decay 0.85
   - `EmbeddingService.findSimilar(requesterId, queryText, 50)` — pgvector HNSW cosine
2. THE `traverse()` SHALL être appelé avec les paramètres : `maxDepth = 3`, `decay = 0.85`, `minScore = 0.001`, `predicates = ['PROVIDES', 'LOOKS_FOR', 'LOCATED_IN']`, `limit = 50`.
3. THE `traverse()` SHALL retourner les candidats triés par `score = (∏ strength_i) × 0.85^depth × penalty`, où `penalty = 0.5` si une relation `RATED` avec `strength < 0.3` existe dans le chemin.
4. WHEN les deux sources (CTE + pgvector) ont répondu, THE MatchingService SHALL fusionner les classements via RRF.

### Requirement TR7 : RRF fusion avec paramètre k configurable

**User Story :** En tant qu'architecte, je veux que les scores CTE et pgvector soient fusionnés via Reciprocal Rank Fusion, afin d'obtenir un classement robuste même si les deux sources ont des échelles de score différentes.

#### Acceptance Criteria

1. THE RRF function SHALL implémenter : `score(c) = 0.6/(k + rank_graph(c)) + 0.4/(k + rank_vector(c))`.
2. THE paramètre k SHALL être configurable dans `business_config` avec valeur par défaut `k = 60`.
3. IF un candidat est absent d'une source (rank_graph = null ou rank_vector = null), THE contribution de cette source SHALL être 0 (pas d'infini, pas de pénalité).
4. THE score RRF final SHALL être normalisé : `normalized(c) = score(c) / max(score)`.
5. THE `is_verified` SHALL appliquer un bonus multiplicatif ×1.10 au score final avant tri.
6. THE RRF SHALL exposer en sortie le score brut normalisé et les deux scores composants pour observabilité.

### Requirement TR8 : Diversity_Mix par quartiles avec Boost

**User Story :** En tant qu'utilisateur, je veux recevoir un mélange de 5 profils incluant des très compatibles et des découvertes, afin d'avoir des options variées.

#### Acceptance Criteria

1. THE Diversity_Mix SHALL traiter la liste ordonnée par score RRF et calculer les quartiles Q1, Q2, Q3.
2. THE Diversity_Mix SHALL sélectionner exactement 5 profils selon la répartition :
   - 2 profils du quartile ≥ Q3 (hautement compatibles)
   - 1 profil du quartile Q2..Q3 (compatibilité moyenne)
   - 1 profil wildcard : tirage pondéré dans la queue Q1..Q2
   - 1 profil boost : si un prestataire vérifié actif avec score ≥ Q1 existe, il occupe ce slot en priorité
3. THE Filter SHALL exclure avant la sélection : le demandeur, les profils matchés depuis moins de 30 jours, les profils suspendus, les profils bloqués.
4. THE 5 profils SHALL être retournés dans l'ordre décroissant du score RRF normalisé.
5. THE Diversity_Mix SHALL garantir qu'aucun profil identique n'apparaît deux fois.

### Requirement TR9 : Correction du bug confidence

**User Story :** En tant qu'architecte, je veux que la formule de renforcement de confiance utilise le `raw.confidence` réel de l'extraction LLM, afin que les entités extraites avec confiance élevée aient un poids proportionnel.

#### Acceptance Criteria

1. THE `KnowledgeGraphService.upsertEntity()` SHALL utiliser la formule `1 - (1 - existing.confidence) * (1 - raw.confidence)` où `raw.confidence` est la confiance fournie par l'appel d'extraction LLM.
2. THE `raw.confidence` ne SHALL PAS être remplacé par la constante `0.5` comme actuellement.
3. THE valeur de `raw.confidence` SHALL être comprise entre 0.0 et 1.0, calibrée par le prompt d'extraction.
4. THE property-based test SHALL vérifier que la formule respecte : `new_conf ∈ [0,1]`, `new_conf ≥ existing.confidence`, `new_conf ≥ raw.confidence`.

---

## D. Reply-First Asynchrone

### Requirement TR10 : Réponse heuristique immédiate

**User Story :** En tant qu'utilisateur WhatsApp, je veux recevoir un accusé de réception immédiat (< 1s) avant la réponse complète de l'agent, afin de ne pas attendre sans feedback.

#### Acceptance Criteria

1. WHEN le webhook WhatsApp reçoit un message, THE plateforme SHALL retourner un ACK HTTP 200 en moins de 80ms.
2. THE plateforme SHALL exécuter une fonction `getHeuristicReply(text)` qui retourne une réponse rapide sans appeler l'agent LLM :
   - Si `isGreeting(text)` → "Salut ! Tu cherches quelqu'un en particulier ?"
   - Si `isGoodbye(text)` → "À plus tard !"
   - Si `isSimpleSelection(text)` → "OK, je regarde ça..."
   - Sinon → null (pas de réponse heuristique)
3. SI `getHeuristicReply` retourne une réponse, THE plateforme SHALL envoyer cette réponse via WhatsApp en moins de 100ms.
4. LA réponse heuristique SHALL être envoyée avant l'envoi du job asynchrone de traitement complet.
5. THE heuristics SHALL être testées unitairement avec un jeu de 20+ messages types.

### Requirement TR11 : File d'attente Bull/Redis pour traitement asynchrone

**User Story :** En tant qu'architecte, je veux que le traitement lourd (extraction LLM, matching, génération de réponse) soit délégué à une file d'attente Bull/Redis, afin de ne pas bloquer le webhook WhatsApp.

#### Acceptance Criteria

1. THE plateforme SHALL utiliser BullMQ avec Redis comme backend de file d'attente pour les jobs de traitement asynchrones.
2. WHEN le webhook reçoit un message, THE plateforme SHALL ajouter un job `process-turn` dans la queue avec `{ userId, text, inboxId, timestamp }`.
3. THE queue SHALL être configurée avec `attempts = 3` et `backoff: { type: 'exponential', delay: 2000 }`.
4. WHEN un job `process-turn` est consommé, THE worker SHALL exécuter l'agent asynchrone complet : intent detection → extraction → matching → reply generation.
5. WHEN la réponse générée par l'agent asynchrone diffère de la réponse heuristique, THE plateforme SHALL envoyer un second message WhatsApp : correction ou confirmation.
6. THE worker SHALL vérifier que l'intention de l'utilisateur n'a pas changé depuis l'envoi du job (via `intentVersion`) ; si elle a changé, le job est ignoré.

### Requirement TR12 : Checkpoints agent après chaque node

**User Story :** En tant qu'architecte, je veux que l'état de l'agent soit persisté après chaque étape du pipeline, afin de permettre la reprise après crash et le débogage par node.

#### Acceptance Criteria

1. THE plateforme SHALL définir une interface `AgentState` avec : `userId`, `step` (enum : `hydration`, `intent`, `extraction`, `matching`, `response`, `done`), `context` (JSONB), `lastError`, `updatedAt`.
2. THE `AgentState` SHALL être persisté dans une table PostgreSQL `agent_states` avec PK = `userId`.
3. WHEN chaque node du pipeline termine son exécution, THE plateforme SHALL mettre à jour `agent_states` avec le nouveau `step`, le `context` mis à jour, et `updatedAt = now()`.
4. IF un node échoue, THE plateforme SHALL enregistrer `lastError` avec le message d'erreur et incrémenter un compteur de tentatives.
5. WHEN un job de reprise démarre, THE plateforme SHALL lire `agent_states` pour reprendre au dernier `step` complété.
6. THE table `agent_states` SHALL être protégée par un lock optimiste (row version) pour éviter les écritures concurrentes.

### Requirement TR13 : Découpage de UserAgentService en nodes indépendants

**User Story :** En tant que développeur, je veux que les 817 lignes du `UserAgentService.processTurn()` soient découpées en nodes testables individuellement, afin de pouvoir fixer, débugger et faire évoluer chaque étape séparément.

#### Acceptance Criteria

1. THE `UserAgentService.processTurn()` SHALL être décomposé en nodes indépendants :
   - `hydrationNode(userId)` : charge profil + services depuis Redis cache ou DB, retourne `{ profile, services, language }`
   - `intentNode(userId, text, context)` : détecte l'intention (chat / recherche_prestataire / recherche_connexion / gestion_compte / aide), retourne `{ intent, confidence, constraints }`
   - `extractionNode(userId, text, context)` : extrait les entités (skills, locations, services, looking_for, offering) depuis le texte via LLM, en arrière-plan
   - `matchingNode(userId, intent, constraints)` : appelle `MatchingService.runQuery()`, retourne `{ candidates }`
   - `responseNode(userId, reply)` : applique la guardrail, retourne la réponse finale formatée
2. CHAQUE node SHALL avoir un contrat d'entrée/sortie clair (type TypeScript) et être testable indépendamment.
3. CHAQUE node SHALL être une fonction pure ou une méthode de service avec ses propres tests unitaires.
4. L'orchestrateur (`UserAgentService` principal) SHALL appeler les nodes séquentiellement et gérer les erreurs par node (retry, fallback, échec).
5. LE découpage SHALL préserver le comportement actuel caractérisé par les tests de Phase 0.

---

## E. Tests et Validation

### Requirement TR14 : Caractérisation du code existant avant refactoring

**User Story :** En tant que développeur, je veux capturer le comportement actuel de MatchingService, KnowledgeGraphService et UserAgentService avant de les refactorer, afin de détecter toute régression.

#### Acceptance Criteria

1. THE plateforme SHALL fournir 15-20 tests de caractérisation sur `MatchingService.runQuery()` couvrant : matching par location, par skills, profil verified, budget compatible, exclusions récentes, absence de résultats.
2. THE plateforme SHALL fournir des tests de caractérisation sur `KnowledgeGraphService.traverse()` sur un graphe synthétique de 10 entités/relations, vérifiant : profondeur ≤ 3, score dans [0,1], pas de cycle infini.
3. THE plateforme SHALL fournir des tests de caractérisation sur `UserAgentService.processTurn()` pour chaque intent connu (chat, recherche_prestataire, recherche_connexion, gestion_compte).
4. CHAQUE test de caractérisation SHALL capture la sortie actuelle comme oracle, et SHALL échouer si la sortie change après refactoring (changement intentionnel = mise à jour manuelle de l'oracle).

### Requirement TR15 : Tests property-based pour formules mathématiques

**User Story :** En tant que développeur, je veux des tests property-based pour RRF, scoring CTE, Diversity_Mix et confiance, afin de garantir les invariants mathématiques du design.

#### Acceptance Criteria

1. THE plateforme SHALL utiliser `fast-check` pour les tests property-based.
2. THE RRF property tests SHALL vérifier :
   - `rrf_score ∈ [0, 1]` après normalisation
   - `graphRank < vectorRank` ⇒ la contribution du graphe est supérieure (poids 0.6 > 0.4)
   - k ∈ [20, 100] produit des classements stables (Spearman > 0.95)
3. THE CTE scoring property tests SHALL vérifier :
   - `score ∈ [0, 1]` pour toute combinaison de strengths
   - `depth ≤ 3` toujours respecté
   - `penalty = 0.5` appliqué si relation `RATED < 0.3` dans le chemin
4. THE Diversity_Mix property tests SHALL vérifier :
   - exactement 5 résultats retournés
   - au moins 2 profils du quartile ≥ Q3
   - au moins 1 profil du quartile Q2..Q3
   - wildcard toujours présent
5. THE confidence formula property tests SHALL vérifier :
   - `new_conf ∈ [conf_a, 1]` et `new_conf ∈ [conf_b, 1]`
   - `new_conf ≤ conf_a + conf_b` (pas de double comptage)

---

## F. Dépendances entre requirements

```
TR14 (caractérisation)
  │
  ▼
TR1, TR2 (Redis) ──────────────────────────────┐
  │                                              │
  ▼                                              │
TR3, TR4, TR5 (pgvector + embedding) ───────────┤
  │                                              │
  ▼                                              ▼
TR6, TR7, TR8, TR9 (CTE → MatchingService) ──► RRF fusion
  │                                              │
  ▼                                              ▼
TR10, TR11, TR12, TR13 (Reply-first + nodes) ──► production
```

---

## G. Critères de succès (Definition of Done)

1. TR1-TR15 : tous les acceptance criteria validés par des tests automatisés.
2. `bun run test` : 100+ tests passant (caractérisation + TDD + property-based).
3. `bun run tsc --noEmit` : zéro erreur TypeScript.
4. Latence matching e2e : < 1.5s au p95 (orchestrateur seul, sans LLM conversationnel).
5. `search-vector.action.ts` ne retourne plus `[]` mais des résultats réels.
6. `KnowledgeGraphService.traverse()` est appelé par `MatchingService.runQuery()`.
7. Bug confidence #1 corrigé : `raw.confidence` utilisé au lieu de `0.5`.
8. Aucun `as any` dans le code produit.
