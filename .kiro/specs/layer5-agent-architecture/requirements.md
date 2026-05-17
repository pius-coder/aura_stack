# Requirements — Layer 5 Architecture Refactored

Basé sur l'analyse design.md vs codebase, le pattern Claude Code (1.9% AI, 98.1% infrastructure),
et la simulation utilisateur sur une semaine (Brice, électricien à Douala).

---

## Glossary mis à jour

### Acteurs (inchangé)
- **User_Standard** : Particulier ou professionnel inscrit cherchant des connexions.
- **Prestataire** : Sous-type proposant des services tarifés.
- **Admin** : Modérateur.

### Nouveaux composants

- **Orya_Instance** : Instance d'agent conversationnel dédiée à un utilisateur unique (1 par userId). State machine persistée dans `agent_states` (thread_id = userId). Contient : statut de recherche, historique, préférences apprises, mémoire utilisateur.
- **Sous_Agent_Extracteur** : Sub-agent LLM central (pas par user). Reçoit un message utilisateur, extrait les entités structurées (skills, location, besoins), les persist dans le KnowledgeGraph. Tourne en async via Bull/Redis queue.
- **Sous_Agent_Orchestrateur** : Sub-agent central (pas par user, pas de LLM). Résout les requêtes de matching via CTE + pgvector + RRF + Diversity_Mix. Tourne en async via Bull/Redis queue. Zéro LLM — pur calcul.
- **Couche_Apprentissage** : Table `agent_memory` (PK = userId). Enregistre patterns temporels, préférences implicites, comportements. Mise à jour en temps réel (compteurs) + analyse batch LLM (patterns complexes) toutes les 10 conversations.

### Nouveaux états

- **Search_Status** : `idle | searching | found | presenting | awaiting_confirm | matched | expired | failed`
- **Match_Candidate_Status** : `intro_pending | intro_accepted_a | intro_rejected | intro_expired | intro_completed`
- **WhatsApp_Window** : `open | closed`
- **Turn_Type** : `heuristic | intent_classification | extraction | matching | reply | guardrail`
- **Agent_Node** : `hydration | classify_intent | extract_entities | orchestrate_match | generate_reply | guardrail_response | learn_patterns`

### Architecture layers (refactoré)

```
LAYER 0 — Entry Points
  Webhook WhatsApp → ACK < 80ms → correlationId
  → Reply-first heuristic (< 100ms) + queue async

LAYER 1 — Transport
  WhatsAppGateway interface + BaileysGateway / WABGateway
  Gestion fenêtre 24h, templates, idempotence

LAYER 2 — Agent IA (1 par user)
  Orya_Instance : state machine + apprentissage
  Sous-agents : Extracteur (LLM) + Orchestrateur (calcul pur)
  LLM routing : heuristique → GPT-4o-mini → Mistral Large
  Reply-first : heuristique < 100ms, LLM async via queue

LAYER 2bis — Apprentissage (user memory)
  agent_memory table : patterns temporels, préférences, comportements
  Mise à jour temps réel + analyse batch LLM

LAYER 3 — Matching (refactoré)
  Orchestrateur : CTE + pgvector + RRF + Diversity_Mix
  Cache Redis TTL 60s
  Zéro LLM

LAYER 4 — Knowledge Graph (refactoré)
  upsertEntity() confidence FIX
  Entity schemas Zod discriminés
  embedding-service.ts (text-embedding-3-small, pas LLM)

LAYER 5 — Chat Temps Réel (inchangé)
LAYER 6 — Paiement (inchangé)
LAYER 7 — Observabilité (inchangé)
```

---

## Requirements — Layer 2 (Agent IA refactoré)

### AR1 — Orya_Instance par utilisateur
**User Story :** En tant que Brice, chaque fois que j'écris à Orya, mon agent me reconnaît, se souvient de ma conversation précédente et adapte ses réponses à mon profil.

**Acceptance Criteria :**
- AR1.1 : Chaque userId a sa propre instance Orya, chargée depuis `agent_states` au moment du message
- AR1.2 : L'état inclut : `search_status`, `current_session`, `history` (10-20 derniers messages), `preferences`, `learning_patterns`
- AR1.3 : Après chaque turn, l'état est persisté dans `agent_states`
- AR1.4 : Un utilisateur ne peut pas voir ni impacter l'état d'un autre utilisateur
- AR1.5 : L'instance scale via checkpoints Postgres (thread_id = userId), pas via processus séparés

### AR2 — Reply-first asynchrone
**User Story :** En tant que Brice, quand j'envoie un message à Orya, je reçois une réponse immédiate (< 1s) même si la recherche ou l'extraction prend du temps.

**Acceptance Criteria :**
- AR2.1 : 100% des messages reçoivent une réponse heuristique < 100ms (sauf premier message d'onboarding)
- AR2.2 : Le traitement lourd (extraction LLM, matching) est délégué à la queue Bull/Redis
- AR2.3 : La réponse heuristique confirme la réception et indique l'action en cours : "Je note votre demande. Je cherche pour vous."
- AR2.4 : Si le résultat async arrive après la réponse heuristique, Orya peut envoyer un message de suivi : "J'ai trouvé des résultats pour votre recherche."
- AR2.5 : En cas de résultat async qui contredit la réponse heuristique, Orya envoie un message de correction : "Je pensais avoir trouvé, mais finalement..."

### AR3 — Heuristic engine (0% LLM)
**User Story :** En tant que système, 80% des messages utilisateur ne nécessitent pas de LLM et sont traités par des règles déterministes.

**Acceptance Criteria :**
- AR3.1 : Heuristic engine traite les patterns suivants sans LLM :
  - Salutations : "Bonjour", "Salut", "Hello"
  - Status check : "T'as trouvé ?", "Tu as trouvé ?", "Des nouvelles ?"
  - Confirmations : "Oui", "OK", "D'accord"
  - Refus : "Non", "Pas maintenant", "Laisse tomber"
  - Remerciements : "Merci", "Merci beaucoup"
- AR3.2 : Heuristic engine lit `search_status` depuis `agent_states` pour répondre à "T'as trouvé ?"
- AR3.3 : Si heuristic match avec confiance > 0.9, la réponse est envoyée SANS appel LLM
- AR3.4 : Si aucun heuristic match, fallback vers intent classification (GPT-4o-mini)

### AR4 — Intent classification (GPT-4o-mini)
**User Story :** En tant que système, je classifie l'intention de l'utilisateur avec un modèle rapide et bon marché avant de décider de la suite.

**Acceptance Criteria :**
- AR4.1 : Intent classifier utilise GPT-4o-mini (pas Mistral Large)
- AR4.2 : Latence cible < 1s
- AR4.3 : Coût cible < $0.0005 par classification
- AR4.4 : Intents supportés : `chat | search_provider | search_collaborator | account | help | selection | referral`
- AR4.5 : Retourne `{ intent, confidence, constraints? }` structuré
- AR4.6 : Si confidence < 0.6, fallback vers `chat` (intent par défaut)

### AR5 — Entity extraction (GPT-4o-mini, async)
**User Story :** En tant que système, j'extrais les entités (skills, location, besoins) du message utilisateur pour enrichir le graphe, sans bloquer la réponse.

**Acceptance Criteria :**
- AR5.1 : Entity extractor tourne en async via Bull/Redis queue (pas synchrone)
- AR5.2 : Utilise GPT-4o-mini (pas Mistral Large)
- AR5.3 : Extrait : `{ skills: string[], locations: string[], industries: string[], needs: string[], offerings: string[], confidence: number }`
- AR5.4 : Après extraction, persist via KnowledgeGraphService.upsertEntity() AVEC `raw.confidence` (pas 0.5 hardcodé)
- AR5.5 : Si l'extraction est ambiguë (confidence < 0.4), Orya peut demander clarification au prochain turn
- AR5.6 : Maximum 1 extraction par message utilisateur (pas de retry 3×)

### AR6 — Reply generation (Mistral Large, rare)
**User Story :** En tant que Brice, quand ma demande nécessite une réponse personnalisée, Orya utilise le meilleur modèle disponible.

**Acceptance Criteria :**
- AR6.1 : Reply generator n'est appelé QUE si heuristic + intent classification ne suffisent pas
- AR6.2 : Pour les réponses simples (confirmation, status update), pas de LLM du tout
- AR6.3 : Utilise Mistral Large via NVIDIA (modèle existant)
- AR6.4 : Prompt system inclut : connaissances activité, statut recherche actuel, préférences apprises, historique récent
- AR6.5 : Retourne `{ reply, guardrailPassed }`

### AR7 — Guardrail (regex + rewrite LLM)
**User Story :** En tant que système, je garantis qu'Orya reste dans son rôle professionnel et respecte les règles de sécurité.

**Acceptance Criteria :**
- AR7.1 : Guardrail regex détecte : PII (téléphone, email, adresse), contenu interdit, hors périmètre
- AR7.2 : Si regex match → rejeter la réponse, générer une réponse de sécurité (pas de LLM)
- AR7.3 : Si pas de regex match → LLM judge (GPT-4o-mini) vérifie la conformité persona
- AR7.4 : 2 retry max pour le LLM judge, puis fallback réponse prédéfinie

### AR8 — State machine formelle
**User Story :** En tant que système, l'état de l'agent est explicite, traçable et récupérable en cas de crash.

**Acceptance Criteria :**
- AR8.1 : `agent_states` table avec PK = userId
- AR8.2 : Colonnes : `userId, status, currentNode, search_status, language, region, lastActivityAt, state JSONB, memory JSONB`
- AR8.3 : Transitions d'état enregistrées dans `agent_state_history`
- AR8.4 : Après chaque turn : UPDATE agent_states + INSERT agent_state_history
- AR8.5 : Si crash pendant un turn, le prochain message charge l'état précédent et reprend
- AR8.6 : Si le turn précédent était "extraction en cours" et que l'extraction n'a pas abouti → retry

---

## Requirements — Layer 2bis (Apprentissage)

### AM1 — User memory persistant
**User Story :** En tant que Brice, plus j'utilise Orya, mieux il me connaît et adapte ses réponses à mes habitudes.

**Acceptance Criteria :**
- AM1.1 : Table `agent_memory` (PK = userId), mise à jour après chaque message
- AM1.2 : Champs temps réel : `peak_hours INT[]`, `avg_response_ms INT`, `total_conversations INT`, `last_activity_at TIMESTAMP`
- AM1.3 : Champs préférences : `preferred_skills JSONB`, `preferred_locations JSONB`, `rejected_skills JSONB`, `price_sensitivity FLOAT`
- AM1.4 : Champs patterns : `communication_style TEXT`, `frustration_threshold INT`, `response_time_avg INT`

### AM2 — Apprentissage temps réel
**User Story :** En tant que système, j'apprends les patterns simples de l'utilisateur sans appeler le LLM.

**Acceptance Criteria :**
- AM2.1 : Après chaque message, mettre à jour `peak_hours` (heure du message), `avg_response_ms` (temps depuis dernier message)
- AM2.2 : Après chaque match accepté, incrémenter `preferred_skills[skill]`
- AM2.3 : Après chaque match refusé, incrémenter `rejected_skills[skill]`
- AM2.4 : Si l'utilisateur n'a pas écrit depuis plus de 24h, noter dans `sleep_patterns`
- AM2.5 : Si l'utilisateur exprime de la frustration (mots-clés : "nul", "trouvé rien", "ça marche pas"), enregistrer timestamp

### AM3 — Apprentissage batch LLM
**User Story :** En tant que système, toutes les 10 conversations, j'analyse les patterns complexes de l'utilisateur pour mieux le servir.

**Acceptance Criteria :**
- AM3.1 : Toutes les 10 conversations, déclencher une analyse LLM (GPT-4o-mini)
- AM3.2 : L'analyse prend en entrée : les 10 derniers messages, les matchs acceptés/refusés, les préférences actuelles
- AM3.3 : L'analyse produit : `{ communication_style, preferred_topics, avoided_topics, best_hours, suggestions }`
- AM3.4 : Les résultats sont persistés dans `agent_memory`
- AM3.5 : L'analyse est asynchrone (queue Bull/Redis) — ne bloque pas la réponse

### AM4 — Adaptation comportementale
**User Story :** En tant que Brice, Orya adapte son ton et ses horaires de notification à mes habitudes.

**Acceptance Criteria :**
- AM4.1 : Les notifications de matching sont envoyées pendant les `peak_hours` de l'utilisateur
- AM4.2 : Si l'utilisateur préfère les messages courts (patterns détectés), Orya limite ses réponses à 2-3 phrases
- AM4.3 : Si frustration détectée récemment (< 24h), Orya propose des actions proactives : "Je peux élargir la recherche si vous voulez"
- AM4.4 : Si l'utilisateur est en "searching" depuis plus de 3 jours sans résultat, Orya envoie un update proactif (sans attendre que l'utilisateur demande)

---

## Requirements — Layer 3 (Orchestrateur Matching refactoré)

### AM1 — CTE traversal effectif
**User Story :** En tant que système, le matching utilise le graphe relationnel via CTE récursif PostgreSQL.

**Acceptance Criteria :**
- AM1.1 : `KnowledgeGraphService.traverse()` est appelé par l'Orchestrateur (plus jamais ignoré)
- AM1.2 : Profondeur max = 3
- AM1.3 : Score de chemin = `(∏ strength_i) × 0.85^depth`, pénalité ×0.5 si rated < 0.3
- AM1.4 : Top 50 candidats
- AM1.5 : Timeout 800ms (si dépassé → fallback vector seul)

### AM2 — pgvector HNSW query
**User Story :** En tant que système, la recherche vectorielle remplace le LLM pour les embeddings.

**Acceptance Criteria :**
- AM2.1 : `graph/search-vector.action.ts` implémenté (plus de TODO stub)
- AM2.2 : Index HNSW (m=16, ef_construction=64) sur la colonne embedding
- AM2.3 : Cosine distance via `<=>` operator
- AM2.4 : Top 50 résultats
- AM2.5 : Timeout 300ms
- AM2.6 : `regenerateEmbedding()` utilise `text-embedding-3-small`, pas Mistral Large

### AM3 — RRF fusion
**User Story :** En tant que système, la fusion des scores CTE et vector se fait via Reciprocal Rank Fusion.

**Acceptance Criteria :**
- AM3.1 : `score(c) = 0.6/(k + rank_graph(c)) + 0.4/(k + rank_vector(c))`
- AM3.2 : k = 60
- AM3.3 : Candidat absent d'une source = contribution 0
- AM3.4 : Normalisation : `normalized(c) = score(c) / max(score)`
- AM3.5 : Bonus vérifié : `final(c) = normalized(c) × 1.10`

### AM4 — Diversity_Mix par quartiles
**User Story :** En tant que Brice, je vois un mélange de profils très compatibles et d'autres moins évidents.

**Acceptance Criteria :**
- AM4.1 : Quartiles Q1 (25%), Q2 (50%), Q3 (75%) de la liste scorée
- AM4.2 : 2 profils du quartile ≥ Q3 (high compatibility)
- AM4.3 : 1 profil du quartile Q2-Q3 (mid)
- AM4.4 : 1 profil tirage pondéré Q1-Q2 (wildcard)
- AM4.5 : 1 profil boost (si actif et score ≥ Q1)
- AM4.6 : Exactement 5 profils, sans doublon
- AM4.7 : Si pas assez de profils dans un quartile, prendre du quartile inférieur

### AM5 — Cache Redis
**User Story :** En tant que système, les résultats de matching sont cachés pour éviter les recalculs.

**Acceptance Criteria :**
- AM5.1 : Clé : `matching:cache:{userIdHash}:{queryHash}:{region}`
- AM5.2 : TTL : 60s
- AM5.3 : Anti-stampede : `SET NX EX 10`, retry 5× × 100ms
- AM5.4 : Invalidation : suppression des clés matching:cache:* contenant le userId mis à jour
- AM5.5 : `queryHash = MD5(JSON.stringify(query_params, sort_keys=True))[:16]`

### AM6 — Matching idle + callback
**User Story :** En tant que Brice, si aucun résultat n'est trouvé, Orya garde ma recherche active et me prévient quand quelqu'un de pertinent apparaît.

**Acceptance Criteria :**
- AM6.1 : Si l'Orchestrateur ne trouve rien → search_status = "idle" (pas "failed")
- AM6.2 : Orya répond : "Je n'ai pas trouvé pour l'instant, mais je garde votre recherche active. Dès que quelqu'un se signale, je vous préviens."
- AM6.3 : L'Orchestrateur reste "abonné" aux nouvelles entrées du graphe
- AM6.4 : Quand un nouveau profil match → callback → Orya notifie l'utilisateur
- AM6.5 : Après 7 jours sans résultat → search_status = "expired", Orya propose de relancer

---

## Requirements — Interface Web + Cartes + Auth

### AW1 — Cartes swipeables (web)
**User Story :** En tant que Brice, quand Orya trouve des résultats, je peux voir les profils sous forme de cartes que je peux swiper (comme Series.so).

**Acceptance Criteria :**
- AW1.1 : Orya envoie un lien : `https://orya.app/matches/{JWT_TOKEN}`
- AW1.2 : Le JWT contient : `{ userId, sessionId, exp: 24h, iat, nonce }`, signé HMAC-SHA256
- AW1.3 : La page web affiche des cartes : alias, bio, skills, localisation (pas de photo ni nom réel)
- AW1.4 : Swipe right → "Intéressé !" → double opt-in déclenché
- AW1.5 : Swipe left → carte suivante
- AW1.6 : Fallback texte si pas de web : Orya présente les profils un par un par message WhatsApp
- AW1.7 : "Suivant" (si texte) → prochain candidat
- AW1.8 : "Stop" (si texte) → arrêter la présentation

### AW2 — Auth web via WhatsApp
**User Story :** En tant que Brice, je clique sur le lien Orya dans WhatsApp et je suis automatiquement connecté sur le web.

**Acceptance Criteria :**
- AW2.1 : Le lien `https://orya.app/matches/{JWT}` est envoyé via WhatsApp
- AW2.2 : Au clic, le JWT est validé côté serveur
- AW2.3 : Si JWT valide → session web créée automatiquement (sans mot de passe)
- AW2.4 : Si JWT invalide/expiré → redirection vers login web normal
- AW2.5 : Le JWT est "one-time use" pour l'authentification (une fois la session créée, le JWT est marqué utilisé)
- AW2.6 : Le lien expire après 24h

### AW3 — wa.me link avec code embedded
**User Story :** En tant que nouveau user, je reçois un wa.me link d'Orya qui pré-remplit mon code de connexion.

**Acceptance Criteria :**
- AW3.1 : Format : `wa.me/237XXXXXXXXX?text=orya-ABCD1234`
- AW3.2 : L'utilisateur clique → WhatsApp s'ouvre avec le message "orya-ABCD1234" pré-rempli
- AW3.3 : Envoyant ce message → Orya reconnaît le code de parrainage/onboarding → crée le profil
- AW3.4 : Utilisé pour : onboarding, parrainage, referral

---

## Requirements — Ton et Persona

### AP1 — Ton "vous" amical
**User Story :** En tant que Brice, Orya me vouvoie mais avec un ton chaleureux et professionnel.

**Acceptance Criteria :**
- AP1.1 : Orya utilise "vous" dans TOUS les messages, jamais "tu"
- AP1.2 : Le ton est professionnel mais chaleureux : "Je cherche pour vous", "Je vous tiens au courant"
- AP1.3 : Pas de verlan, pas d'argot, pas de "frère", "mec", "pote"
- AP1.4 : Le système de prompt enforce ce ton via instruction explicite + examples

---

## Architecture — 1.9% AI vs 98.1% Infrastructure

Ce requirements document est conçu pour que le code AI (appels LLM) représente exactement 1.9% du code total,
conformément au pattern Claude Code.

### Ce qui EST AI (doit être < 2% du code)

| Composant | LLM | % du code total | Usage |
|-----------|-----|-----------------|-------|
| Intent classifier | GPT-4o-mini | ~0.3% | Classification d'intention |
| Entity extractor | GPT-4o-mini | ~0.3% | Extraction d'entités structurées |
| Reply generator | Mistral Large | ~0.5% | Réponse personnalisée (rare) |
| Guardrail judge | GPT-4o-mini | ~0.3% | Vérification conformité persona |
| Pattern analyzer (batch) | GPT-4o-mini | ~0.3% | Analyse patterns complexes |
| Prompts | — | ~0.2% | Templates string |

### Ce qui N'est PAS AI (98.1% du code)

| Couche | % | Pourquoi pas AI |
|--------|---|----------------|
| State machine | ~15% | Transitions, status, checkpoints |
| Heuristic engine | ~5% | Regex, règles, lookup |
| Queue async | ~10% | Bull/Redis workers |
| Matching engine | ~10% | CTE + Vector + RRF (maths pures) |
| Knowledge Graph | ~8% | CRUD, CTE, sérialisation |
| Auth/Session | ~10% | JWT, OTP, sessions |
| Transport WhatsApp | ~8% | Gateway, templates, fenêtre 24h |
| Chat temps réel | ~5% | WebSocket, broadcast |
| Paiement | ~5% | Factory, providers, webhooks |
| Observabilité | ~3% | Métriques, tracking |
| Tests | ~10% | Characterization + TDD |
| Hooks/Middleware | ~2% | Rate limiting, permissions |
| Registry/Config | ~2% | Enregistrement, config |
| Divers | ~5.1% | Utilitaires, helpers |

---

## Contrats d'interface entre couches

### L2 → L2bis (Orya → Apprentissage)
```
Orya → updateMemory(userId, event: MessageEvent | MatchEvent | FrustrationEvent)
Apprentissage → getPreferences(userId): UserPreferences
Apprentissage → shouldNotify(userId): boolean
```

### L2 → Sous-Agent Extracteur
```
Orya → entityExtract(userId, text, language, context): JobId
Extracteur → callback(jobId, { entities, confidence })
```

### L2 → Sous-Agent Orchestrateur
```
Orya → orchestrateMatch(userId, query, constraints, sessionId): JobId
Orchestrateur → callback(jobId, { candidates, status, fallbackUsed? })
```

### L2 → Layer 1 (Transport)
```
Orya → sendReply(userId, reply, correlationId): void
Transport → onInboundMessage(userId, text, correlationId): void
```

### L2 → Layer 3 (Matching)
```
Orya → runQuery(requesterId, query, constraints): MatchSession
Matching → getStatus(requesterId, sessionId): SearchStatus
```

### L2 → Layer 4 (Knowledge Graph)
```
Orya → upsertEntity(userId, type, value, source, confidence): Entity
Orya → upsertRelation(sourceId, targetId, predicate, strength): Relation
```

---

## Priorités d'implémentation

### Phase 1 — Extraire l'AI de Layer 2 (actuel user-agent-service.ts)
1. Créer `orya-agent-service.ts` — state machine + status + transitions
2. Créer `intent.classifier.ts` — intent LLM + heuristic fallback
3. Créer `entity.extractor.ts` — extraction LLM async
4. Créer `reply.generator.ts` — reply LLM + guardrail
5. Supprimer les 816 lignes de user-agent-service.ts

### Phase 2 — Nettoyer Layer 4
1. Fix bug confidence (0.5 → raw.confidence) dans `knowledge-graph-service.ts`
2. Créer `embedding-service.ts` (text-embedding-3-small)
3. Remplacer regenerateEmbedding() LLM → embedding service

### Phase 3 — Implémenter Layer 3
1. Brancher `KnowledgeGraphService.traverse()` dans l'Orchestrateur
2. Implémenter `search-vector.action.ts` (pgvector HNSW)
3. Implémenter RRF fusion + Diversity_Mix
4. Ajouter cache Redis

### Phase 4 — Couche apprentissage + interface web
1. Créer `user-memory-service.ts` + table `agent_memory`
2. Apprentissage temps réel (compteurs) + batch (LLM)
3. Cartes web + JWT auth + wa.me links
