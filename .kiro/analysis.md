# Analyse d'écart — Architecture Orya

Date : 2026-05-17
Base : design.md (4140 lignes) + code existant (13 services, 89 ops registry, 212 lignes de tests)
Méthode : Comparaison ligne par ligne entre le design cible et l'implémentation actuelle.

---

## 1. Pipeline conversationnel — Graphe_Agent_User

### Design cible (§1928-2050)

Un graphe LangGraph par utilisateur avec 6 nodes exécutés séquentiellement :

```
HydrationNode → ConversationNode → ExtractionNode → MatchingIntentNode
                                                       │
                                          ┌────────────┴────────────┐
                                          │ intent=matching         │ sinon
                                          ▼                         ▼
                                    OrchestratorCallNode      ResponseNode
                                          │                         │
                                          └────────────┬────────────┘
                                                       ▼
                                                     END
```

- State persisté dans `agent_states` (PK = userId) après CHAQUE transition
- Checkpointer Postgres avec historique (`agent_state_history`)
- Cache Redis hydration (TTL 60s)
- Chaque node = étape atomique avec contrat d'entrée/sortie

### Implémentation actuelle (816 lignes, monolithe)

`UserAgentService.processTurn()` fait TOUT en une seule fonction synchrone :

```
processTurn(text)
  1. hydrateUserContext()              — DB read
  2. getOrCreateThread()               — thread Aura
  3. detectLanguage()                  — lib i18n
  4. detectSelectionNumber()           — heuristics
  5. handleSelectionIntent() SI numéro — LLM + DB write
  6. detectIntent()                    — heuristics → LLM → fallback
  7. handleMatchingIntent() SI search  — extraction LLM → MatchingService → reply
  8. generateReply() SINON             — LLM → guardrail LLM → fallback
```

### Gaps

| Aspect | Design | Code | Impact |
|--------|--------|------|--------|
| State machine | Nodes indépendants, état explicite | Tout dans une fonction, state = thread metadata | Pas de reprise, pas de debugging par node |
| Checkpoints | Après chaque node | Jamais | Pas de rejeu, tout à refaire si crash |
| OrchestratorCallNode | Timeout 5s, fallback si vide | Synchrone, pas de timeout | Bloque le thread si LLM ou matching lent |
| HydrationNode | Cache Redis 60s | DB read à chaque appel (pas de cache) | N+1 DB reads |
| Guardrail ResponseNode | 2 retry LLM + fallback prédéfini | 2 retry LLM + fallback | OK — aligné |
| Langue FR/EN | franc-min + confidence | detectLanguageDetailed() | Vérifier si compatibilité franc-min |

### Formule de renforcement confidence extraction (design §1585)

```
new_conf = 1 - (1 - existing.confidence) × (1 - raw.confidence)
```

Implémentée dans `KnowledgeGraphService.upsertEntity()` ligne 47 : `1 - (1 - existing.confidence) * (1 - 0.5)` — **mais avec 0.5 en dur au lieu de `raw.confidence`**. Le `raw.confidence` de l'extraction LLM est ignoré.

---

## 2. Orchestrateur de matching

### Design cible (§394-446, §2051-2116, §1618-1870)

Pipeline parallélisé en 5 étages :

```
ReceiveRequest → CacheLookup ─┬─ HIT ──→ Return
                               │
                               └─ MISS ──┐
                              Promise.all([GraphTraversal, EmbeddingQuery])
                                         │
                                    HybridScoring (RRF k=60)
                                         │
                                        Filter (exclusions)
                                         │
                                      Diversity_Mix (5 slots)
                                         │
                                      CacheStore (TTL 60s)
                                         │
                                       Return
```

- **GraphTraversal** : CTE récursive sur `KnowledgeEntity`/`KnowledgeRelation`, decay 0.85^depth, pénalité rated<0.3 → ×0.5, top-50
- **EmbeddingQuery** : pgvector cosine sur `GraphEmbedding` (1536d, HNSW), top-50
- **RRF** : `score(c) = 0.6/(60 + rank_graph(c)) + 0.4/(60 + rank_vector(c))`
- **Diversity_Mix** : 60% high quartile → 30% mid → 10% wildcard pondéré, max 5 profils
- **Caches**: Redis key `matching:cache:{userIdHash}:{queryHash}:{region}` TTL 60s

### Implémentation actuelle (164 lignes)

`MatchingService.runQuery()` fait du **keyword scoring** :

```
runQuery(requesterId, query, constraints)
  1. Exclure matchs récents (< 30j)
  2. WHERE isProvider=true AND status=ACTIVE
     WHERE locationLabel CONTAINS (optionnel)
  3. findMany Profile + services (take:50)
  4. Boucle for sur les 50 candidats :
     - keywordScore = 0.05 de base
     - +0.22 si location match
     - +0.24 par skill match dans title
     - +0.12 par skill match dans description
     - +0.08 si budget compatible
     - +0.06 si verified
     - Plafond à 1.0
  5. Boost slots prioritaires (top 3)
  6. Diversity maison : 60% high / 30% mid / 10% wildcard
  7. Crée matchSession
```

### Gaps

| Aspect | Design | Code | Impact |
|--------|--------|------|--------|
| Algorithme | Graph CTE traversal + pgvector | Keyword scoring | Pas de graphe utilisé |
| KnowledgeGraphService | Appelé par MatchingService | **Jamais appelé** | KnowledgeEntity/Relation = stockage mort |
| EmbeddingQuery | pgvector HNSW 1536d | **TODO** dans search-vector.action.ts | Pas de vector search |
| RRF | `0.6/(k+rank_graph) + 0.4/(k+rank_vector)` | Scores additifs plats | Pas de fusion robuste |
| Cache Redis | matching:cache TTL 60s | Aucun cache | Recalcule à chaque requête |
| K | k=60 paramétrable dans business_config | k non défini | Pas de contrôle |
| Bonus Badge_Vérifié | ×1.10 multiplicatif | +0.06 additif | Sous-impact du badge |
| Exclusion région | Oui | Non (sauf locationLabel CONTAINS) | Résultats hors zone |
| excludeFilters | match < 30j, blocked, suspended | match < 30j seulement | Pas de blocked/suspended |
| Diversity | Quartiles + wildcard pondéré | Pourcentage fixe 60/30/10 | Similaire mais moins rigoureux |
| Timeouts | Graph 800ms, Vector 300ms, fallback | Aucun timeout | Peut bloquer longtemps |

### Formules

**Design — RRF score :**
```
RRF(c) = 0.6 / (60 + rank_graph(c)) + 0.4 / (60 + rank_vector(c))
normalized(c) = RRF(c) / max(RRF)
final(c) = normalized(c) × (1.10 si is_verified sinon 1.0)
```

**Design — Score de chemin CTE :**
```
score(path) = (∏ strength_i) × 0.85^depth × penalty
penalty = 0.5 si ∃ rated avec strength < 0.3, sinon 1.0
```

**Code actuel — Score :**
```
keywordScore = 0.05
             + (0.22 si location match)
             + Σ(0.24 par skill title + 0.12 par skill description + 0.05 par bio)
             + (0.08 si budget ≤ max)
             + (0.06 si verified)
score = min(keywordScore, 1.0)   ← plafond additif, pas multiplicatif
```

---

## 3. Knowledge Graph

### Design cible (§452-497, §1419-1923)

- `KnowledgeEntity` : types `USER | SERVICE | SKILL | LOCATION | INDUSTRY | NEED`
- `KnowledgeRelation` : prédicats `PROVIDES | REQUIRES | LOCATED_IN | LOOKS_FOR | MATCHES | CONNECTED_TO | RATED`
- `GraphEmbedding` : pgvector(1536), HNSW index
- Extraction LLM structured output → persistence async
- Embedding généré via `text-embedding-3-small` (OpenAI)

### Implémentation actuelle (194 lignes)

`KnowledgeGraphService` :
- `upsertEntity()` — OK (mais bug confidence = 0.5 hardcodé au lieu de raw)
- `upsertRelation()` — OK
- `traverse()` — Fait un CTE récursif correct (lignes 104-138) mais **n'est jamais appelé** par MatchingService
- `regenerateEmbedding()` — Génère embedding via **LLM Mistral Large** (pas OpenAI embedding) → coûteux, lent, pas fiable
- `querySimilar()` — N'existe PAS

### Gaps

| Aspect | Design | Code | Impact |
|--------|--------|------|--------|
| Embedding model | text-embedding-3-small (1536d) | LLM Mistral Large | 45s/génération au lieu de <1s |
| pgvector column | `embedding vector(1536)` | `metadata: Json` avec `{embedding: [...]}` | Pas d'index HNSW, pas de cosine query |
| querySimilar() | SQL `<=>` avec HNSW | N'existe pas | Branche vectorielle absente |
| Extraction → embedding | Async via scheduler | Sync dans regenerateEmbedding() | Bloque le thread |
| Entity schemas Zod | Discriminated union par type | EntitySchema générique | Pas de validation par type |

---

## 4. Entry points et flux

### Webhook WhatsApp (design §2282-2407)

```
POST /webhooks/whatsapp → validation HMAC → parse → idempotence → scheduler process-incoming → ACK 200 (< 200ms)
```

### InboxService actuel (163 lignes)

```
processIncoming(inboxId)
  1. findUnique inbox
  2. parseStoredWhatsAppMessage
  3. extractText()
  4. SI linkCode → handleLinkCode() + sendText()
  5. SINON resolveUserByPhone()
  6. SI pas user → sendText(onboarding)
  7. SI pas whatsappLinked → sendText(unlinked)
  8. hydrate()
  9. SI pas hydrate → sendText(suspended)
  10. generateReply(userId, text) → UserAgentService.processMessage()
  11. sendText(reply)
  12. markDone()
```

### Gaps

| Aspect | Design | Code | Impact |
|--------|--------|------|--------|
| Correlation ID | UUID v7 propagé | Aucun | Pas de tracing |
| Reply-first | Heuristique rapide → ACK → async | Synchrone (90s latence) | WhatsApp timeout après ~30s |
| Scheduler | `runAfter(0, api.ai.process-incoming)` | Synchrone direct | Boucle dans webhook context |
| Process incoming worker | runGraphe_Agent_User(state) | Appel synchrone à processMessage | Pas de reprise possible |
| WhatsApp gateway abstraction | BaileysGateway / WABGateway | whatsAppGateway() | Vérifier si l'interface existe |

---

## 5. Tests

### Couverture actuelle

| Fichier | Lignes | Tests | Couverture |
|---------|--------|-------|------------|
| user-agent-service.test.ts | 88 | 3 cas (suspended, reply, intent fallback) | Minimum |
| inbox-service.test.ts | 85 | 1 cas (link code) | Très faible |
| match-service.test.ts | 100 | — | — |
| profile-service.test.ts | — | — | — |
| service-service.test.ts | — | — | — |
| auth-service.test.ts | — | — | — |
| alias-service.test.ts | — | — | — |

**Aucun test pour :**
- MatchingService (keyword scoring)
- KnowledgeGraphService (traverse, upsert, embedding)
- DevLabService (chat, getState)
- ChatService (sendMessage, markRead)
- Les nodes du pipeline (hydration, guardrail, extraction)
- Les heuristics (detectSelectionNumber, extractConstraints, detectIntent)

### Tests requis par le design

§ Correctness Properties (100+ propriétés formelles) dont :
- Propriété 15 : CTE depth ≤ 3, maxPaths ≤ 10000, prédicats enum
- Propriété 16 : score = (∏ strength) × 0.85^n × penalty
- Propriété 19 : RRF formule exacte, k=60
- Propriété 21 : Diversity_Mix composition par quartile
- Propriété 22 : Exclusions appliquées

---

## 6. Prompts

### État actuel

| Prompt | Fichier | Statut |
|--------|---------|--------|
| persona.ts | 30 lignes | Réécrit (Orya = personne/amie, pas assistant) |
| reply.ts | 100+ lignes | Réécrit (naturel, pas concis) |
| intent.ts | ~50 lignes | Réécrit (descriptions claires des intents) |
| extraction.ts | ~50 lignes | Réécrit (cherche/propose, pas matching constraints) |

### Gaps

- Pas de prompt pour le **guardrail judge** (prévu dans design §2196-2206 mais pas implémenté)
- Pas de prompt pour **OrchestratorCallNode** fallback
- Les prompts ne sont pas versionnés avec tests de régression (design §57)
- `buildPersonaSystemPrompt` existe dans persona.ts mais `buildPersonaSystemPrompt` est aussi appelé dans `agent-user.agent.ts` ligne 13

---

## 7. Calcul de latence

### Chaîne actuelle (synchrone)

```
processTurn:
  hydration:           ~10-20ms (DB read)
  detectLanguage:      ~1ms (franc-min)
  detectIntent:        ~500ms-45s (heuristics + LLM Mistral)
  extractEntities:     ~500ms-45s × 3 retry max (LLM Mistral)
  MatchingService:     ~50-200ms (keyword scoring DB)
  generateReply:       ~500ms-45s (LLM Mistral)
  guardrail:           ~500ms-45s × 2 retry max (LLM Mistral)
TOTAL:                 ~2s à ~180s (pire cas: 45s × 5 appels LLM = 225s)
```

### Chaîne design cible (async + parallèle)

```
HydrationNode:         ~5ms (cache Redis)
ConversationNode:      ~45s (1 LLM) ← seul goulet d'étranglement
ExtractionNode:        async (scheduler, pas bloquant)
MatchingIntentNode:    heuristics (1ms) ou LLM classificur léger
OrchestratorCallNode:  ~800ms-1.5s (parallèle Graph + Vector)
ResponseNode:          guardrail regex (1ms)
TOTAL visible:         ~45s (1 LLM) mais réponse heuristique en <100ms
```

---

## 8. Registre et opérations manquantes

### Design liste 60+ opérations (§629-751)

**Implémentées dans _registry.ts** : ~40 (dont plusieurs TODO/stubs)

**Manquantes ou incomplètes** (design.md lignes 645-751) :
- `matching.orchestrator-cache.db-read` — stub seulement (ligne 82 import)
- `graph.search-vector.action` — TODO retourne `{ results: [] }`
- `graph.upsert-entity.operation` — existe mais pas testé
- `graph.upsert-relation.operation` — existe mais pas testé
- `ai.orchestrator-matching.workflow` — inexistant
- `workflows/verify-identity`, `escrow-lifecycle`, `data-export`, `data-delete` — inexistants
- `ratings/submit.operation` — inexistant (design §685-687)
- `payments/refund.action` — inexistant
- `notifications/match-request` — existe (ligne 86)

---

---

## 10. Benchmark externe — Systèmes existants d'intros médiées par agent IA

Source : Rapport de recherche agent (2026-05-17, v2). 6 systèmes avec preuves techniques primaires + 5 longue traîne + 3 patterns architecturaux documentés.

### 10.1 Inventaire des systèmes

#### 10.1.1 Boardy — "AI Superconnector" (LinkedIn + WhatsApp + appel vocal IA)

| Aspect | Boardy |
|--------|--------|
| Canal | LinkedIn DM, WhatsApp Business, appel vocal IA |
| Activation | Appel vocal IA obligatoire (filtre anti-drive-by) |
| Matching | Non documenté publiquement (ni graphe/embeddings/heuristiques) |
| Double opt-in | Explicite : email partagé seulement après accord mutuel ; téléphone partagé si thread WhatsApp ouvert |
| Stack connu | OpenAI + Anthropic (fournisseurs LLM), PostHog (analytics), Google Calendar (OAuth scopes free/busy) |
| Visibilité pré-consent | Profil LinkedIn public visible (pas de masquage total) |
| Rétention | Profil conservé 2 ans après suppression ; communications 3 ans |

**Forces** : Activation gate (qualité), double opt-in concret, scheduling intégré.
**Faiblesses** : Matching opaque, pas d'anonymat total avant consentement (LinkedIn visible).

#### 10.1.2 Series.so — Réseau social IA natif iMessage

| Aspect | Series.so |
|--------|-----------|
| Canal | iMessage (numéro USA), web/app en support |
| Activation | Texte au numéro → registration (nom, âge, téléphone, localisation, photo, description) |
| Matching | "Shares" (carrousels) d'autres utilisateurs cherchant des connexions similaires ; group chats par centres d'intérêt |
| Anonymat | Pas clairement spécifié (ToS ne détaille pas de gate de partage) |
| Stack connu | iMessage comme canal principal (infrastructure propriétaire), LLM pour parsing et routage |
| Funding | $5.1M pre-seed, 1.2M messages, fondateurs étudiants Yale |
| Modèle data | Input/Output utilisés pour améliorer le service sauf opt-out |

**Forces** : Zéro friction (texte un numéro), expérience conversationnelle, validation marché (82% rétention J+30).
**Faiblesses** : iMessage pas disponible en Afrique, dépendance Apple, modèle consentement opaque.

#### 10.1.3 Key AI (Handshake + Kai) — Intros multi-hop avec consentement

| Aspect | Key AI |
|--------|--------|
| Canal | Slack, WhatsApp, LinkedIn (connecteurs déclarés) |
| Matching | Graphe de connaissance ("warm paths"), recherche + orchestration + mémoire |
| Double opt-in | Oui : "Kai finds the connector, drafts the request, both parties consent" |
| Stack connu | PostHog, Microsoft Clarity, Google Analytics, DataDog, OpenAI, Firebase, Stripe, Google Cloud + Gemini |
| Type | People↔People, People↔Opportunity, People↔Event |
| Modèle | "Connector" intermédiaire (User A → Connector → User B) |

**Forces** : Multi-hop explicite, connecteurs multi-canal, consentement comme feature centrale.
**Faiblesses** : Code du "warm path strength" non public, pas de détails ranking.

#### 10.1.4 Boomerang (Rudy) — Agent d'intros chaudes B2B (Slack/Salesforce/Gong)

| Aspect | Boomerang |
|--------|-----------|
| Canal | Slack DM, Salesforce, Gong |
| Matching | Graphe de relations scoré (CRM + calendriers + transcripts appels + signaux publics : alumni, travail) |
| Routing | Preference-aware (deal size, cadence, type de demande) |
| Human-in-loop | Draft → review → send ; escalation manager si inaction |
| Cible | GTM/revenue teams (intros chaudes pour sales) |

**Forces** : Sources de données explicites (CRM, calendrier, transcripts), préférences, escalade.
**Faiblesses** : Contexte entreprise (pas social général), matching non publié.

#### 10.1.5 Agent Analog — Concierge SMS événementiel avec intros

| Aspect | Agent Analog |
|--------|-------------|
| Canal | SMS |
| Matching | Base de connaissance dynamique personnalisée par rôle/préférences |
| Double opt-in | "Both parties consent before any information is shared" |
| Cible | Conférences, événements VIP, brand activations |

**Forces** : Double opt-in explicite, matching contextuel événementiel.
**Faiblesses** : Matching non documenté (graphe ? embeddings ?), niche événementiel.

#### 10.1.6 Nesha — Intros double opt-in pour portfolios VC/accélérateur

| Aspect | Nesha |
|--------|-------|
| Canal | Email (inbox-native) |
| Matching | Graphe de synergies privé du portfolio |
| Double opt-in | "Pre-consent + DOI" — on demande aux deux côtés d'abord |
| Cible | VC platform teams, accélérateurs |
| Dashboard | Taux DOI, time-to-intro, pipeline influencé |

**Forces** : Opérationnalisation du double opt-in à l'échelle portfolio, tracking attribution.
**Faiblesses** : Matching signals non documentés.

#### 10.1.7 Longue traîne (marketing surface, peu de technique)

| Produit | URL | Claims |
|---------|-----|--------|
| SuperConnector.social | superconnector.social | LinkedIn CSV → AI matching + double opt-in |
| Fluum | fluum.ai | Warm double opt-in introductions |
| SeekConnect.ai | seekconnect.ai | Consent-based introductions, privacy boundaries |
| XHuman | xhuman.com | AI agent qui source + outreach + facilite |
| Luella.ai | luella.ai/superconnector | Warm introductions + double opt-in |

---

### 10.2 Patterns architecturaux — Ce que l'industrie fait vraiment

#### Pattern 1 — Génération de candidats multi-canal (graphe + embeddings + heuristiques)

Source primaire : **LinkedIn PYMK** (blog engineering, multi-stage funnel documenté).

```
LinkedIn PYMK — Candidate Generation (L0) :
  ├── Graph-based     : random walks N-hop, Personalized PageRank
  ├── Embedding-based : dot-product entre learned embeddings
  └── Heuristics      : recent interactions, profile searches, notifications

  → Agrégation des top candidats de CHAQUE source → pool unique pour ranking
```

Ce pattern est aussi décrit par :
- **Neo4j** : hybrid search combinant lexical + semantic + structural, fusion via RRF/WRRF
- **pgvector** : full-text search Postgres + vector search, fusion via RRF ou cross-encoder

**Mapping à Orya** : Ce pattern = exactement ce que notre design prévoit (CTE traversal + pgvector query → RRF fusion). Le code actuel n'a que l'équivalent le plus basique des heuristiques.

#### Pattern 2 — Pipeline ranking multi-étages (recall → precision → re-rank)

```
1. Retrieval broad  ── Graph traversal N-hop + Vector ANN + Keyword
2. Filtering        ── Actif, région, pas bloqué, consent eligible
3. Ranker           ── ML (XGBoost/DNN) combine retrieval scores + features
4. Re-rank / fusion ── RRF blend + fairness constraints + diversity
```

Ce pattern est **le standard** pour le matching social à l'échelle (LinkedIn, Tinder, recommandation produits).

#### Pattern 3 — Recommandation réciproque (two-sided)

"Introduire A à B" n'est pas un problème de recommandation classique. C'est **réciproque** : B doit aussi vouloir A, et les deux ont une attention limitée.

- **Pizzato et al.** : framework formel des "people-to-people recommenders" comme problèmes réciproques
- **Chen et al.** : field experiment sur dating apps — modèles de matching pour réduire l'inégalité
- **Boardy/Nesha** : implémentent la réciprocité via double opt-in opérationnel (pas algorithmique)

**Pour Orya** : Le design a le double opt-in, mais n'a pas de modèle de "congestion" (éviter de surcharger les profils populaires). Le Diversity_Mix est une première étape.

---

### 10.3 Anonymat et double opt-in — Ce qui existe

| Système | Visibilité pré-consent | Gate de partage | Masquage technique |
|---------|----------------------|-----------------|---------------------|
| Boardy | LinkedIn public | Opt-in mutuel explicite | Email caché, téléphone caché |
| Key AI | Inconnu | Consent flow connector→recipient | Non documenté |
| Agent Analog | Non partagé | "Both parties consent" | Non documenté |
| Nesha | Non partagé | Pre-consent + DOI | Email-native |
| **Apple Messages for Business** | Opaque ID (pas de téléphone/email) | N/A (B2C) | Opaque ID par relation user↔business |

**Apple Opaque ID** : modèle de référence pour l'anonymat technique :
- Apple fournit un **Opaque ID** unique par relation user↔business
- Le business ne reçoit **jamais** le téléphone ou l'email
- Si l'utilisateur supprime le thread, le business ne peut plus re-contacter

---

### 10.4 Contraintes WhatsApp qui façonnent l'architecture

La **WhatsApp Business Messaging Policy** impose des règles qui forcent une machine d'état explicite :

| Règle | Impact |
|-------|--------|
| 24h window | Réponse libre seulement dans les 24h après le dernier message user |
| Templates approuvés | Hors 24h fenêtre, seuls les templates Meta-approuvés sont autorisés |
| Opt-in obligatoire | Nécessité de gérer un état "consent given" avant tout envoi |

→ Un agent WhatsApp sérieux doit modéliser : `open_window` vs `template_mode`, `awaiting_consent` vs `intro_pending` vs `handoff`. C'est une machine d'état, pas une simple boucle LLM.

**Orya actuel** : InboxService fait déjà la différence onboarding/linké/suspendu, mais n'a pas de machine d'état formelle pour les fenêtres 24h.

---

### 10.5 State management et mémoire agent — Checkpoints LangGraph

LangGraph (représentatif des frameworks agents modernes) :

```
thread_id → séquence de checkpoints (snapshots du state)
└── checkpointer (Postgres, SQLite, etc.) → reprise, debugging, replay
```

Ce pattern est **exactement** ce que le design Orya prévoit avec `agent_states` (PK = user_id, checkpoints après chaque node). Le code actuel n'a rien de cela.

---

### 10.6 Positionnement compétitif — Marché des intros médiées par IA

| Produit | Canal | Marché | Agent IA | Graphe | Double opt-in | Anonymat pré-consent | Stack public | Funding | Scale |
|---------|-------|--------|----------|--------|---------------|---------------------|--------------|---------|-------|
| Series.so | iMessage (USA) | US/campus (750+ campuses) | Oui | Non documenté | Flou | Chat relay (numéro caché) | Propriétaire | $5.1M pre-seed | 32K msgs, 82% rétention D30 |
| Boardy | LinkedIn/WhatsApp/ Voice | US global | Oui | Réseau fermé | Oui (email relay) | LinkedIn visible | OpenAI + Anthropic, PostHog, Google Calendar | $11M (3+8) | 150K intros, 55K followers |
| Key AI | Slack/WhatsApp/LinkedIn | Communautés | Oui | Graphe "warm paths" | Oui (connector→recipient) | Non documenté | Google Cloud + Gemini, OpenAI, Stripe, Firebase | Non public | Non public |
| Boomerang (Rudy) | Slack/Salesforce/Gong | B2B revenue | Oui | Graphe scoré (CRM + calendrier + transcripts) | HITL draft→review→send | Non applicable | Propriétaire | Non public | Non public |
| Agent Analog | SMS | Événements VIP | Oui | Non documenté | Oui (both parties consent) | Non documenté | Propriétaire | Non public | Non public |
| Nesha | Email | VC portfolios | Non (moteur) | Graphe synergies | Pre-consent + DOI | Email-native | Propriétaire | Non public | Dashboard attribution |
| Butterflies | Twitter/X feed | Général | Oui (AI = social entity) | N/A | N/A | N/A | Propriétaire | Non public | Non public |
| SocialAI | In-app | Général | Oui (AI followers) | N/A | N/A | N/A | Propriétaire | Non public | Non public |
| **Orya (cible)** | **WhatsApp + web** | **Afrique/PME** | **Oui** | **CTE + pgvector** | **Oui (Opaque ID relay)** | **Opaque IDs (Apple pattern)** | **Mistral + OpenAI + pgvector** | **Bootstrapped** | **—** |

**Notre avantage distinctif** : Marché africain non couvert (WhatsApp > iMessage, artisans/PME), approche hybride graphe+vecteur documentée (LinkedIn pattern), modèle économique adapté (Fapshi/Orange Money).

---

### 10.7 Ce que personne n'a (encore) — Gaps de marché

1. **Aucun système** ne combine tout : agent IA dans WhatsApp + matching par graphe relationnel + anonymat total + marché africain
2. **Aucun système** ne fait du reply-first asynchrone (réponse heuristique immédiate, extraction/matching en arrière-plan) — pourtant nécessaire pour les contraintes WhatsApp (24h window)
3. **Aucun système** ne publie son pipeline de ranking complet (LinkedIn s'en approche mais ne donne pas les formules exactes)
4. **Aucun système** n'adresse le marché des "artisans/PME africains" avec matching par graphe de confiance locale
5. **Aucune plateforme** n'a de documentation technique publique sur son algorithme de matching — Boardy, Series, Key AI, Boomerang : tous opaques. Notre design est le seul documenté publiquement (formules CTE, RRF, Diversity_Mix).

Series.so a levé $5.1M, Boardy $11M, Key AI est financé — le marché est validé. Il ne manque que **l'exécution** sur le segment africain.

---

## 11. Conclusions

### Ce qui marche déjà (ne pas casser)
- **MatchService** (create, accept, refuse, cancel) — fonctionnel, notifications WhatsApp OK
- **ChatService** (sendMessage, markRead) — fonctionnel avec WebSocket broadcast
- **InboxService** — link code flow OK, routing phone→user OK
- **KnowledgeGraphService.upsertEntity/upsertRelation** — OK (modulo bug confidence)
- **agent-user.agent.ts** — définition Mistral Large OK (même si lent)
- **orya-contracts.ts** — contrats métier OK
- **Prompts persona/reply/intent/extraction** — réécrits, alignés concept Orya
- **Registry** — 40+ opérations enregistrées

### Ce qu'il faut restructurer (les 4 bloquants)
1. **MatchingService** : keyword scoring → graph traversal CTE + RRF + Diversity
2. **search-vector.action.ts** : TODO → pgvector HNSW cosine query
3. **UserAgentService** : monolithe synchrone → reply-first + nodes séparés + checkpoints
4. **Cache** : rien → Redis hydration + matching

### Ce qu'il faut ajouter
- Tests (propriétés formelles du design §3540+)
- correlationId tracing
- Guardrail judge LLM prompt
- Orchestrateur_Matching workflow séparé

### Ce qui peut attendre
- Embedding model (changer Mistral → text-embedding-3-small) = dépendant de l'API key OpenAI
- pgvector migration SQL = dépendant de l'infra PostgreSQL
- Geosharding = pas avant scale massif
- Rich Ranker DNN = phase 2+

---

## 12. Annexe — Formules et constantes

### RRF (design §1752)
```
RRF(c) = 0.6 / (60 + rank_graph(c)) + 0.4 / (60 + rank_vector(c))
normalized(c) = RRF(c) / max(RRF)
final(c) = normalized(c) × (1.10 si is_verified)
```

### Score CTE (design §1660)
```
score(path) = (∏ strength_i) × 0.85^depth
penalty = 0.5 si ∃ rated(strength < 0.3)
```

### Renforcement confidence (design §1585)
```
new_conf = 1 - (1 - existing.confidence) × (1 - raw.confidence)
```
⚠️ Code actuel : `1 - (1 - existing.confidence) * (1 - 0.5)` → raw.confidence ignoré

### Diversity_Mix (design §1818)
```
quartiles = Q1, Q2, Q3 de la liste score normalized
boost  : 1 slot (si actif + normalized ≥ Q1)
high   : 2 slots du quartile ≥ Q3
mid    : 1 slot du quartile Q2..Q3
wildcard : 1 slot tirage pondéré queue Q1..Q2
```

### Cibles latence (design §3119)
| Mesure | p95 cible |
|--------|-----------|
| GraphTraversal | < 800 ms |
| EmbeddingQuery | < 300 ms |
| Orchestrateur total | < 1.5 s |
| Bot e2e (reply-first) | < 100 ms (heuristic) / < 3 min (async LLM) |

### Bloquants (empêchent le fonctionnement prévu)

1. **MatchingService fait du keyword scoring, pas du graph traversal** — le KnowledgeGraphService.traverse() existe mais n'est jamais appelé. KnowledgeEntity/KnowledgeRelation = stockage mort.
2. **EmbeddingQuery == TODO** — la branche vectorielle entière n'existe pas. search-vector.action.ts retourne `[]`.
3. **UserAgentService monolithe synchrone** — pas de reply-first, pas de checkpoints, pas de reprise. Latence 90s+.
4. **Aucun cache** — pas de Redis, pas de cache hydration, pas de cache matching.

### Importants (dégradent significativement)

5. **Tests quasi inexistants** — 4 tests pour 13 services. Aucun test sur le matching, le graphe, l'orchestrateur.
6. **Embedding via LLM Mistral** — 45s au lieu de <1s par embedding. Devrait être text-embedding-3-small.
7. **Pas de correlationId** — pas de tracing de bout en bout, impossible de debugger un tour.

### Mineurs (détail mais à corriger)

8. `confidence` dans upsertEntity : `0.5` hardcodé au lieu du `raw.confidence` de l'extraction.
9. `graph.search-vector.action` : enregistré comme operation mais retourne `{ results: [], query: "" }`.
10. `matching.orchestrator-cache.db-read` : enregistré comme db-read mais pas connecté.

---

## 13. Research Deep Dive — Synthèse des 11 points techniques

Source : Deux rapports de recherche distincts (2026-05-17). Chaque point couvre : liens concrets → extraits de code → benchmarks → trade-offs → gaps documentés.

---

### 13.1 CTE récursif PostgreSQL pour traversal de graphe social

**Patterns réels :**
- CTE sur tables `nodes(id, name)` + `edges(from_id, to_id, type, details)` — structure exacte de `KnowledgeEntity`/`KnowledgeRelation` dans le code Orya
- Déduction standard via `UNION ALL` + clause `CYCLE id SET is_cycle USING path` (PG14+) — doc officielle PostgreSQL
- Anti-cycle manuel (pre-14) : `NOT e.target_id = ANY(sp.visited)` dans la récursion

**Indexation requise :**
```sql
CREATE INDEX idx_edges_source ON edges(source_id, target_id);
CREATE INDEX idx_edges_target ON edges(target_id, source_id);
CREATE INDEX idx_edges_strength ON edges(strength) WHERE strength > 0.1;  -- pour pruning précoce
```

**Benchmarks :**
- < 1M arêtes, depth ≤ 3, avec index B-tree : < 100ms
- 10M+ arêtes : 2–30s selon sélectivité — nécessite pruning par `score > threshold`
- 75M rows (Alibaba) : solutions spécialisées nécessaires (ex: graph ppath)
- Alternative Apache AGE : extension PostgreSQL qui permet Cypher (moins performant que Neo4j, mais zéro sync inter-DB)

**Décay factor dans CTE :**
```sql
path_score * e.strength * POWER(0.85, sp.depth) AS new_path_score
```
Pattern standard mais **aucun benchmark public** du decay factor intégré dans une CTE sur graphe social.

> **Impact Orya** : Le CTE récursif actuel dans `KnowledgeGraphService.traverse()` (lignes 104-138) est correct. Ce qui manque : les index ci-dessus, le pruning par score, et le branchement à MatchingService. Pour < 1M relations (prévisible en phase 1-2), PostgreSQL CTE suffit. Apache AGE envisageable en phase 3+ si > 10M.

---

### 13.2 pgvector HNSW pour recherche sémantique de profils

**Schéma exact :**
```sql
ALTER TABLE user_profiles ADD COLUMN embedding vector(1536);
CREATE INDEX ON user_profiles USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Performances HNSW vs IVFFlat (AWS benchmark, ~58K vecteurs) :**
| Métrique | HNSW | IVFFlat | Seq scan |
|---|---|---|---|
| Build time | ~30s (pgvector 0.6.0) | ~15s | N/A |
| Query latence | ~1.5ms | ~2.4ms | ~650ms |
| Rappel | ~99% | ~95% | 100% |
| Mémoire | ~6KB/vecteur 1536d | ~6KB/vecteur | — |

**pgvector 0.8.0** : iterative scanning en mode `relaxed_order` — priorise la vitesse (~95-99% qualité), réduit significativement la latence.

**Float16** : `halfvec(768)` consomme 50% mémoire en moins, précision quasi identique.

**Hybrid search (pgvector + full-text) :**
```sql
SELECT p.user_id, p.embedding <=> :q_emb AS dist,
  ts_rank(p.search_vector, plainto_tsquery(:text)) AS txt_rank
FROM user_profiles p
ORDER BY (0.7 * (1 - dist)) + (0.3 * txt_rank) DESC LIMIT 20;
```

**Coûts mémoire (production, 50M produits × 1536d) :** ~300GB pour les vecteurs, ×2-3 pour l'index HNSW = ~1TB RAM optimal.

> **Impact Orya** : Remplacer `LLM Mistral → text-embedding-3-small` divise le coût par ~1000 et réduit la latence de 45s à < 1s. Float16 = option immédiate. Le mode `relaxed_order` de pgvector 0.8.0 est pertinent pour le matching social où un rappel parfait n'est pas critique.

---

### 13.3 Reciprocal Rank Fusion (RRF)

**Formule exacte :**
```
RRF_score(d) = Σ 1 / (k + rank_q(d))
k = 60  (Cormack SIGIR 2009, optimum plat dans [20, 100])
```

**Implémentation Python :**
```python
def rrf_fuse(ranked_lists, k=60):
    score = defaultdict(float)
    for lst in ranked_lists:
        for i, cid in enumerate(lst, start=1):
            score[cid] += 1.0 / (k + i)
    return dict(score)
```
Candidat absent = contribution 0 (pas d'infini, pas de pénalité).

**Adoption industrielle :** Elasticsearch (`rrf` retriever), OpenSearch (normalization-processor), Weaviate, Qdrant, Azure AI Search — tous utilisent RRF par défaut.

**RRF vs alternatives :**
- **CombSUM** : nécessite normalisation inter-système fragile (BM25 ≠ cosine)
- **CombMNZ** : booste les docs trouvés par N systèmes, mais même problème de normalisation
- **Borda count** : sensible aux longueurs de listes inégales
- **Cross-encoder** : meilleure qualité finale mais O(n) appels LLM → prohibitif pour matching temps réel

> **Gap documenté** : Aucune étude publiée sur RRF spécifiquement appliqué au **matching social bidirectionnel** (vs IR unilatéral). Le k optimum n'a pas été ré-étudié depuis 2009 dans le contexte des embeddings LLM modernes.

---

### 13.4 Double opt-in et anonymat

**Architecture technique :**

**Modèle de données SQL (consentement) :**
```sql
CREATE TYPE intro_status AS ENUM (
  'proposed', 'notified_a', 'accepted_a', 'accepted_both',
  'rejected_a', 'rejected_b', 'expired', 'revealed'
);
CREATE TABLE introductions (
  id UUID PRIMARY KEY,
  requester_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  status intro_status NOT NULL DEFAULT 'proposed',
  opt_in_token_a VARCHAR(64),
  opt_in_token_b VARCHAR(64),
  token_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '72 hours',
  ...
);
```

**Mécanismes de relay documentés :**
1. **Apple Opaque ID** (Apple Business Chat) : identifiant unique par relation user↔business, le business ne reçoit jamais le téléphone/email — c'est le pattern cible d'Orya
2. **Twilio Proxy** : numéros temporaires bridgés ($0.01/min + $0.005/SMS)
3. **Relay email** (pattern Airbnb) : alias `thread+token@relay.domain` forwardé, email réel révélé seulement à l'état `granted`

**Boardy** : email est le médium de révélation finale — adresses partagées seulement après double opt-in
**Series** : AI chat = relay d'anonymat (numéro personnel jamais exposé)

> **Gap** : Aucune documentation publique de comment Boardy ou Series implémentent techniquement leurs relays. Apple Business Chat impose des restrictions sur les messages proactifs (opt-in HSM requis — voir 13.7).

---

### 13.5 Architecture reply-first asynchrone

**Pattern fondamental (Slack/Twilio/WhatsApp) :**

```
Webhook → ACK 200 OK (< 200ms) → Reply heuristique immédiat → Enqueue job → Worker async → Résultat final
```

**Backend queue : Bull/Redis :**
```typescript
const matchingQueue = new Queue('matching', { connection: redisClient });
// Handler : ACK immédiat
res.status(200).json({ status: 'ok' });
await sendMessage(userId, "🔍 Je cherche...");
await matchingQueue.add('find-match', { userId, message });
```

**Contraintes webhook réelles :**
- Slack Events API : timeout > 3s = failure
- Twilio : erreur 50076 si processing > 5s
- WhatsApp/360dialog : "webhook must respond quickly (max latency 80ms)" + retry exponentiel jusqu'à 7 jours

**Race condition :** Si résultat async contredit la réponse heuristique → pattern *Correction Message* ("Attends—j'ai trouvé quelqu'un") ou *Speculative with Confidence* ("J'ai peut-être quelqu'un, laisse-moi confirmer...")

**Exemples réels :** Uber (dispatch : heuristique 200ms → confirmation 2s), DoorDash (ACK immédiat → attribution Kafka → Flink → callback)

> **Gap** : Aucune plateforme d'intros IA (Boardy, Series) ne documente publiquement son pattern de gestion de latence. Orya serait le premier à implémenter et documenter du reply-first asynchrone.

---

### 13.6 Agent par utilisateur — LangGraph checkpoints

**LangGraph avec PostgreSQL :**
```python
from langgraph.checkpoint.postgres import PostgresSaver

checkpointer = PostgresSaver.from_conn_string(DATABASE_URL)
graph = builder.compile(checkpointer=checkpointer)
config = {"configurable": {"thread_id": user_id}}
result = graph.ainvoke({"messages": [msg]}, config=config)
```

**Tables créées :**
- `checkpoints(thread_id, checkpoint_ns, checkpoint_id, checkpoint JSONB, metadata JSONB)`
- `checkpoint_writes(thread_id, checkpoint_ns, checkpoint_id, task_id, channel, value BYTEA)`

**Scalabilité :** 10K users = 10K lignes dans `checkpoints`, pas 10K processus. Chargement à la demande depuis Postgres. Lecture/écriture JSONB ≈ 2–5ms.

**Alternatives comparées :**
| Framework | Avantage | Inconvénient |
|---|---|---|
| LangGraph | Natif LangChain, checkpoint PG natif | Overhead si graph simple |
| Temporal | Durable execution, retry natif | Complexe à déployer |
| AWS Step Functions | Managed, durable | Vendor lock-in, ~100ms/step |
| Custom PG | Contrôle total | À coder |

> **Gap** : Aucun benchmark public de LangGraph à 10K+ agents. Pas de "cost model" publié ($ / checkpoint / turn). La troncature optimale pour agents longue durée n'est pas standardisée.

---

### 13.7 Machine d'état WhatsApp (24h window)

**Règles Meta :**
- Messages libres : seulement dans les 24h suivant le dernier message entrant
- Hors fenêtre : templates pré-approuvés uniquement (catégories MARKETING, UTILITY, AUTHENTICATION)
- "mixed utility+marketing" → classé comme MARKETING

**State machine TypeScript (pattern documenté) :**
```typescript
type WindowState = 'open' | 'closed';
class WhatsAppWindowManager {
  async sendMessage(userId, content) {
    const window = await getWindow(userId);
    if (window.state === 'open' && window.expiresAt > now) {
      await client.sendFreeText(userId, content.text);
    } else {
      const template = this.selectTemplate(content);
      if (!template) { await queueForLater(userId, content); return; }
      await client.sendTemplate(userId, template);
    }
  }
  onInboundMessage(userId) {
    updateWindow(userId, { state: 'open', expiresAt: Date.now() + 24h });
  }
}
```

**Coûts (2024-2025, Afrique) :**
| Type | Coût estimé |
|---|---|
| Service (dans fenêtre) | ~$0.005–0.010/msg |
| Utility template | ~$0.015–0.025/msg |
| Marketing template | ~$0.025–0.040/msg |

**BSP (Business Solution Providers) :** 360dialog (API native Meta), WATI (no-code+API, populaire Afrique), Gupshup (multi-langue Asie/Afrique), Twilio (SLA fort, plus cher)

> **Gap critique** : Aucun BSP ne documente le cas exact "fenêtre expire pendant que l'agent prépare sa réponse" — il faut l'implémenter via une state machine (pattern ci-dessus). Aucune plateforme d'intros IA africaine documentée.

---

### 13.8 Multi-stage ranking pipeline (LinkedIn PYMK)

**Pipeline LinkedIn documenté (engineering blog + arXiv) :**
1. **Candidate Generation** : 10K candidats — graph N-hop + Personalized PageRank + embeddings + heuristiques
2. **Light Ranker** : top 500 — XGBoost (features : connexions communes, même entreprise/école, recency, profile completeness, response rate)
3. **Rich Ranker** : top 50 — DNN 2-4 couches (embeddings profil, historique interactions, signaux temporels)
4. **Diversity** : MMR (Maximal Marginal Relevance)

**Budget latence LinkedIn Feed :** ~2000 candidats extraits de "hundreds of millions" en "few milliseconds".

**Cold start stratégies :**
| Stratégie | Description |
|---|---|
| Content-based | Embedding profil → similarité |
| Social graph seed | Import contacts téléphoniques |
| Géolocalisation | Personnes dans la même zone |
| Onboarding questions | Collecte explicite des besoins (Boardy voice) |
| Exploration vs Exploitation | Over-index diversité pendant les N premières semaines |

> **Gap** : LinkedIn ne publie pas les features exactes du light/rich ranker PYMK, ni les métriques Recall@k/NDCG spécifiques. Aucune plateforme d'intros IA ne publie son pipeline de ranking complet.

---

### 13.9 Extraction d'entités depuis conversation

**Structured output avec Pydantic :**
```python
class UserEntityExtraction(BaseModel):
    skills: List[Skill] = []
    locations: List[Location] = []
    services: List[Service] = []
    looking_for: Optional[str] = None
    offering: Optional[str] = None

structured_llm = llm.with_structured_output(UserEntityExtraction)
result = await structured_llm.ainvoke([...])
```

**Déduplication :** fuzzy matching via `thefuzz` (`fuzz.token_sort_ratio > 80`) associé à un dictionnaire d'aliases (`"plombier" → "plumbing"`, etc.)

**Renforcement de confiance (formule exacte) :**
```python
new_conf = 1 - (1 - conf_a) * (1 - conf_b)  # Design §1585
```
Combiné : si `conf_a = 0.7` et `conf_b = 0.6` → `1 - 0.3 × 0.4 = 0.88`. Plus conservative que max(0.7, 0.6) = 0.7, plus informative que moyenne = 0.65.

**Coûts LLM par extraction :**
| Modèle | Coût/1K tokens | Coût typique/extraction |
|---|---|---|
| GPT-4o | $5/$15 | ~$0.003–0.005 |
| GPT-4o-mini | $0.15/$0.60 | ~$0.0001–0.0002 |
| Claude 3 Haiku | $0.25/$1.25 | ~$0.0002 |

→ Recommandation : **GPT-4o-mini** pour extraction async (coût ×25 vs GPT-4o, qualité suffisante).

**Feedback loop :** Quand une introduction réussit → booster `confidence = LEAST(1.0, confidence + 0.1)` sur les entités impliquées.

---

### 13.10 Cache Redis pour matching et hydration

**Structure de clés (pattern déduit, pas sourcé d'une prod) :**
```
matching:results:{userId}:{queryHash}      TTL 60s
matching:candidates:{userId}:{region}      TTL 120s
hydration:profile:{userId}                 TTL 300s
session:window:{userId}:whatsapp           TTL 86400s (24h)
agent:state:{userId}:current               TTL 3600s
```

`queryHash = MD5(json.dumps(query_params, sort_keys=True))[:16]`

**Anti-stampede :** Acquisition de lock via `SET key NX EX 10`, puis soit attendre (retry récursif), soit Probabilistic Early Expiration (recompute probabilistiquement avant expiration réelle).

**Invalidation :** Quand un profil est mis à jour, supprimer `hydration:profile:{userId}` + toutes les clés `matching:*` indexées. Pattern recommandé : SET Redis pour tracker quelles clés contiennent un userId donné.

**Benchmarks Redis vs PostgreSQL :**
| Opération | Redis | PostgreSQL UNLOGGED | PostgreSQL normal |
|---|---|---|---|
| GET simple | < 1ms | 5–15ms | 5–15ms |
| Write | < 1ms | 2–10ms | 5–20ms |

Pour une requête de matching coûtant 200ms DB, un cache Redis TTL 60s supporte **jusqu'à 200 req/min sur la même query** avec un seul calcul.

---

### 13.11 Scoring de graphe relationnel

**Path score (design §1660) :**
```
path_score = s₁ × s₂ × ... × s_d × 0.85^(d-1)
```

**Personalized PageRank (PPR) :**
```
PPR(t|s) = (1-α) × Σ PPR(neighbor|s) / degree(neighbor) + α × 1_{t=s}
```
Avec α = 0.15 (damping factor). Implémentation SQL pure via CTE ou itération puissance en Python.

**Edge strength estimation :**
| Signal | Mise à jour |
|---|---|
| Message échangé | `strength = LEAST(1, strength + 0.1)` |
| Introduction acceptée | `strength = LEAST(1, strength + 0.2)` |
| Décroissance temporelle | `strength × EXP(-0.01 × jours_sans_contact)` |

**Comparaison CTE vs pgRouting vs Neo4j :**
| Critère | PostgreSQL CTE | Apache AGE (Cypher/PG) | Neo4j |
|---|---|---|---|
| Setup | Aucun (natif) | Extension PG | Déploiement séparé |
| Traversal depth-3, 100K | 50–500ms | 10–100ms | 1–5ms |
| Traversal depth-3, 10M | 2–30s (sans pruning) | 200ms–2s | 5–50ms |
| Scoring personnalisé | Flexible (SQL) | Flexible (Cypher) | Flexible (Cypher) |
| ACID | ✅ | ✅ | ✅ (Enterprise) |
| Coût | $0 | $0 | $10K+/an |

> **Recommandation Orya** : Pour < 5M edges et depth ≤ 3, PostgreSQL CTE suffit. Apache AGE (Cypher sur PostgreSQL) possible si le graphe dépasse 10M. Neo4j non nécessaire avant scale massif.

---

### 13.12 Architecture cible — Assemblage des patterns validés

```
User (WhatsApp)
  │
  ▼
[Webhook Gateway 360dialog]
  ACK < 80ms │  Idempotence key
  ▼
[Reply-First Pattern]
  ├── 1. Heuristic reply (< 100ms)
  └── 2. Bull/Redis Queue → Async Worker
        │
  ┌─────┴──────┐
  │             │
  ▼             ▼
[Agent turn]    [Entity Extraction]
(thread_id=      GPT-4o-mini →
 userId)         Pydantic → PG
  │             
  ▼
[Orchestrateur Matching]
  ├── Cache Redis lookup (TTL 60s)
  └── MISS →
       Promise.all([
         CTE traversal (PG, depth ≤ 3, decay 0.85),
         pgvector HNSW (1536d, cosine)
       ])
       → RRF fusion (k=60)
       → Diversity_Mix (5 slots)
       → Cache store Redis
  │
  ▼
[Double Opt-In State Machine]
  proposed → notified_a → accepted_a → notified_b → accepted_both → revealed
  │  Timeout 72h → expired
  ▼
[Relay Layer]
  Opaque ID (Apple pattern) / Twilio Proxy / In-app chat
  ▼
[WhatsApp template or free text]
  selon open_window / template_mode
```

### 13.13 Synthèse — Confiance par point

| Point | Confiance source | Gaps restants | Priorité Orya |
|---|---|---|---|
| 1. CTE traversal | Élevée — doc PG, exemples réels, patterns d'index | Benchmarks CTE+decay social manquent | **Bloquant** — brancher traverse() → MatchingService |
| 2. pgvector HNSW | Élevée — AWS bench, pgvector doc, float16, 0.8.0 | Pas de bench "profils sociaux" | **Bloquant** — implémenter search-vector |
| 3. RRF | Élevée — Cormack paper, Elastic/Vespa/OpenSearch prod | k optimum pas ré-étudié depuis 2009 (ère LLM) | **Important** — formule déjà dans le design |
| 4. Double opt-in | Moyenne — Apple Opaque ID documenté, Boardy/Series opaque | Relay technique de Boardy/Series non documenté | **Important** — implémenter state machine |
| 5. Reply-first | Élevée — Slack/Twilio contraintes doc, Uber/DoorDash pattern | Aucune plateforme d'intros ne le documente | **Bloquant** — solution à la latence 90s |
| 6. Agent/user | Moyenne — LangGraph PG doc, mais scale non bench | Pas de cost model ou bench 10K+ agents | **Important** — UserAgentService → LangGraph |
| 7. WhatsApp 24h | Élevée — 360dialog, Meta doc | Fenêtre expire pendant réponse = non doc par BSP | **Important** — state machine à coder |
| 8. Ranking pipeline | Élevée — LinkedIn PYMK blog + arXiv | Features exactes light/rich ranker non publiées | **Faible** — phase 2+ (DNN) |
| 9. Extraction entités | Élevée — OpenAI structured output, coûts précis | Entity linking complet non documenté | **Important** — async extraction |
| 10. Cache Redis | Moyenne — patterns Redis standards, benchs génériques | Keyspace matching prod non documenté | **Bloquant** — aucun cache aujourd'hui |
| 11. Scoring graphe | Élevée — PPR connu, LinkedIn publie son usage | LinkedIn warm path formula exacte pas publiée | **Important** — CTE scoring déjà dans design |

### 13.14 Recommandations — Next research steps

Les 3 gaps les plus bloquants à creuser en priorité :

1. **Benchmarks CTE avec decay** : Chercher des posts `EXPLAIN (ANALYZE, BUFFERS)` sur graphes 10M+ arêtes, comparer index `(to_id, type)` vs `(type, to_id)` — idéalement conférence PostgreSQL (PGConf, pg_day)
2. **Redis keyspace matching prod** : Chercher des repos open-source de "candidate generation service" qui exposent leur keyspace Redis — ou benchmarker soi-même
3. **Warm path scoring LinkedIn** : Littérature "relationship strength prediction" + "link prediction on social graphs" + "two-sided exposure constraints"
