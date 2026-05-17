# Plan d'implémentation — Résolution des 4 bloquants

## Ordre et dépendances

```
Phase 0 ─── Tests de caractérisation (code existant)
              │
              ▼
Phase 1 ─── Cache Redis (prérequis : aucun)
              │
              ▼
Phase 2 ─── pgvector + search-vector (prérequis : Redis pour cache des embeddings)
              │
              ▼
Phase 3 ─── CTE traversal → MatchingService (prérequis : pgvector pour RRF)
              │
              ▼
Phase 4 ─── Reply-first + UserAgentService asynchrone (prérequis : Redis, matching, pgvector)
```

---

## Phase 0 — Tests de caractérisation (Semaine 1, ~3 jours)

### 0.1 MatchingService.runQuery()
- 15-20 characterization tests sur les 164 lignes actuelles
- Cas : location match, skills, verified, budget, exclusions
- Objectif : savoir ce que le code actuel retourne pour pouvoir comparer après refactoring

### 0.2 KnowledgeGraphService.traverse()
- Tester le CTE récursif actuel (lignes 104-138) sur un petit graphe synthétique
- Propriétés : depth ≤ 3, score ∈ [0,1], pas de cycles infinis

### 0.3 UserAgentService.processTurn()
- Caractériser les 817 lignes : quel est l'output pour chaque intent connu
- Capture des réponses LLM pour régression après refactoring

### 0.4 Bug confidence #1
- Tester que `upsertEntity()` utilise bien `raw.confidence` au lieu de `0.5` hardcodé
- Fix + test TDD

### Outils
- `bun test --run` pour Jest
- `fast-check` pour property-based tests (RRF, CTE scoring, Diversity)
- Caractérisation : d'abord `test.each` avec entrées connues, capture output

### Critère de succès
- 40+ tests qui passent
- Bug confidence #1 fixé

---

## Phase 1 — Cache Redis (Semaine 1-2, ~2 jours)

### 1.1 Dépendance Redis
```
bun add ioredis
```

### 1.2 RedisService
Fichier : `src/operations/_services/redis-service.ts`
Clés :
- `matching:results:{userId}:{queryHash}` TTL 60s
- `matching:candidates:{userId}:{region}` TTL 120s
- `hydration:profile:{userId}` TTL 300s
- `session:window:{userId}:whatsapp` TTL 86400s

### 1.3 Anti-stampede
- Pattern lock `SET key NX EX 10` dans `getCached()`
- Si lock failed → attendre 100ms + retry (max 5)

### 1.4 Tests
- TDD sur les opérations Redis (get/set/invalidate/lock)
- Mock ioredis avec `ioredis-mock`

---

## Phase 2 — pgvector + search-vector (Semaine 2-3, ~3 jours)

### 2.1 Schéma SQL
```sql
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS idx_user_profiles_embedding_hnsw
  ON user_profiles USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### 2.2 EmbeddingService
Fichier : `src/operations/_services/embedding-service.ts`
- `generateEmbedding(text)` → OpenAI `text-embedding-3-small` (< 1s), cache Redis TTL 3600s
- `generateProfileEmbedding(userId)` → concatène profile + bio + skills, persiste dans `user_profiles.embedding`
- `findSimilar(userId, query, limit)` → cache → MISS → pgvector cosine → cache

### 2.3 Refactor search-vector.action.ts
Remplacer le stub `return { results: [], query: "" }` par une vraie query pgvector HNSW cosine.

### 2.4 Migration OpenAI embedding
Changer LLM Mistral → `text-embedding-3-small` dans `KnowledgeGraphService.regenerateEmbedding()`

### 2.5 Hybrid search
Ajouter dans `search-vector.action.ts` :
```sql
ORDER BY (0.7 * (1 - (embedding <=> :query_embedding))) +
  (0.3 * ts_rank(search_vector, plainto_tsquery(:query_text))) DESC
```

---

## Phase 3 — CTE traversal → MatchingService (Semaine 3-4, ~4 jours)

### 3.1 Refactor MatchingService.runQuery()
Pipeline :
```
runQuery(requesterId, queryConstraints)
  1. Cache lookup Redis
  2. HIT → return
  3. MISS →
     Promise.all([
       graphTraversal() : CTE depth ≤ 3, decay 0.85, penalty
       vectorSearch()   : pgvector HNSW cosine
     ])
  4. RRF fusion (k=60)
  5. Filter : exclusions, blocked, suspended
  6. Diversity_Mix (5 slots)
  7. Cache store Redis
  8. Return top-5
```

### 3.2 Brancher KnowledgeGraphService.traverse()
Le CTE existe (lignes 104-138) mais jamais appelé. Le brancher dans `runQuery()`.

### 3.3 RRF fusion
```typescript
function rrfScore(graphRank: number | null, vectorRank: number | null, k = 60): number {
  let score = 0;
  if (graphRank !== null) score += 0.6 / (k + graphRank);
  if (vectorRank !== null) score += 0.4 / (k + vectorRank);
  return score;
}
```

### 3.4 Diversity_Mix
Quartiles exacts du design (§1818) : 2 high, 1 mid, 1 wildcard, 1 boost.

### 3.5 Tests (TDD strict — formules mathématiques)
Property-based (`fast-check`) :
- `rrf_score ∈ [0, 1]` (normalisé)
- `graphRank < vectorRank ⇒ graph contribue plus` (poids 0.6 > 0.4)
- `traverse profondeur ≤ 3`
- `diversity retourne exactement 5 résultats`

---

## Phase 4 — Reply-first + UserAgentService asynchrone (Semaine 4-6, ~6 jours)

### 4.1 Webhook ACK immédiat
Dans `InboxService.processIncoming()` :
```typescript
res.status(200).json({ status: 'ok' });  // ACK < 80ms
const heuristic = getHeuristicReply(text);
if (heuristic) await sendMessage(userId, heuristic);  // < 100ms
await matchingQueue.add('process-turn', { userId, text, inboxId });
```

### 4.2 Queue Bull/Redis
Worker avec retry exponentiel (3 tentatives).

### 4.3 Restructuration UserAgentService
Découpage en nodes indépendants :
```
hydrationNode(userId)       → cache Redis + DB fallback
intentNode(userId, text)    → heuristics + LLM léger
extractionNode(userId, text) → async (scheduler)
matchingNode(userId, intent) → MatchingService.runQuery()
responseNode(userId, reply)  → guardrail + reply
```

### 4.4 Checkpoints
Table `agent_states` (PK = userId) dans PostgreSQL, checkpoint après chaque node.

### 4.5 Heuristic reply
Réponses rapides sans LLM :
```typescript
function getHeuristicReply(text: string): string | null {
  if (isGreeting(text)) return "Salut ! Tu cherches quelqu'un en particulier ?";
  if (isGoodbye(text)) return "À plus tard !";
  if (isSimpleSelection(text)) return "OK, je regarde ça...";
  return null;
}
```

### 4.6 Race condition
Si résultat async arrive mais l'utilisateur a changé d'intention → ignorer.

---

## Calendrier

| Phase | Durée | Dépend de | Tests |
|-------|-------|-----------|-------|
| 0. Tests caractérisation | 3 jours | — | 40+ characterization |
| 1. Cache Redis | 2 jours | Phase 0 | TDD Redis |
| 2. pgvector + embedding | 3 jours | Phase 1 | TDD + intégration |
| 3. CTE + MatchingService | 4 jours | Phase 2 | TDD strict + property-based |
| 4. Reply-first + agent | 6 jours | Phases 1,2,3 | TDD + intégration |

**Total : ~18 jours ouvrés** (~3.5 semaines).

---

## Exclusions volontaires

- LangGraph : trop d'overhead pour phase 1 → state machine custom Postgres, migration possible plus tard
- DNN ranker : phase 2+, RRF + Diversity suffisent pour MVP
- Guardrail judge LLM : dépendant reply-first, à ajouter dans responseNode
- correlationId : transversal, à faire pendant Phase 4

## Risques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| OpenAI API key pas dispo | Haute | Bloque Phase 2 | Fallback Mistral pour embedding (lent) |
| pgvector pas dispo en prod | Moyenne | Bloque Phase 2 | Fallback cosine en mémoire applicative |
| Redis pas dispo | Basse | Bloque Phases 1,4 | Bull peut utiliser PG backend |
| Temps CTE > 1.5s cible | Moyenne | Dégradation | Pruning agressif dans la CTE |
