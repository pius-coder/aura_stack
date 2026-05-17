# Research Mission — Benchmark des 15 requirements techniques

Pour chaque requirement TR1-TR15, cherche comment **d'autres équipes en production** résolvent le même problème. Pas de théorie — des vrais choix d'architecture, des retours d'expérience, des chiffres.

---

## TR1 — Cache Redis avec anti-stampede

**Notre spec** : `getCached()` avec lock `SET NX EX 10`, retry 5× × 100ms, TTL 60s pour matching, invalidation par SET tracking.

Que font les autres ?
- Comment Instagram/Facebook gère le cache stampede sur les recommandations sociales ?
- `SET NX` est-il le meilleur pattern ou utilisent-ils autre chose (MULTI/WATCH, Redlock, Lua scripts) ?
- Y a-t-il un pattern "probabilistic early expiration" (Vattani et al. PVLDB) utilisé en prod ?
- Quelle est la vraie latence d'un aller-retour Redis pour une clé de 1KB ? 10KB ?
- Comment les équipes reco gèrent l'invalidation quand "trop de clés dépendent du même userId" ?
- RedisJSON vs raw string pour stocker des résultats structurés ?

---

## TR2 — Cache du matching orchestré

**Notre spec** : lookup `matching:results:{userId}:{queryHash}` avant tout calcul, TTL 60s.

Que font les autres ?
- Quel TTL utilisent les systèmes de "people you may know" ou de recommandation ?
- Comment calculent-ils le queryHash ? (normalisation, tolérance aux petites variations)
- Est-ce que le cache est "write-through" (invalidation sur update profil) ou "write-behind" ?
- Que font-ils quand le cache est chaud mais le profil a changé il y a 30s ?
- Y a-t-il un pattern "stale-while-revalidate" pour le matching social (servir du cache même périmé, recalcul en arrière-plan) ?

---

## TR3 — Migration embedding vers modèle dédié

**Notre spec** : `text-embedding-3-small` (OpenAI, 1536d, < 1s, < $0.0002/call), cache Redis des embeddings par hash.

Que font les autres ?
- Quelle est la vraie différence de qualité entre `text-embedding-3-small` et `text-embedding-3-large` pour du profil matching (pas du search document) ?
- Des équipes utilisent-elles un modèle open source (BGE, E5, Instructor) hébergé localement plutôt qu'OpenAI ? Pourquoi ?
- Comment gèrent-ils la mise à jour des embeddings quand un profil change (régénération différée, batch overnight, instant) ?
- Quel est le coût réel (pas la doc OpenAI) de `text-embedding-3-small` pour 10K / 100K / 1M embeddings ?
- Y a-t-il des benchmarks de embedding quality sur des données de matching social en français ?

---

## TR4 — Index pgvector HNSW

**Notre spec** : `vector(1536)`, HNSW `m=16, ef_construction=64`, cosine, `<=>` query, timeout 300ms, 50 résultats.

Que font les autres ?
- Comment dimensionner `m` et `ef_construction` pour un profil social (10K-100K vecteurs) ?
- Quelle est la vraie latence d'une requête HNSW avec filtre WHERE (status, region) en plus du `<=>` ?
- Est-ce que le `hnsw.ef_search` est réglé dynamiquement ou en global ?
- Comment les équipes gèrent la réindexation quand les embeddings changent (re-création d'index vs incrémental) ?
- Y a-t-il des retours d'expérience de production avec pgvector 0.8.0 `relaxed_order` iterative scanning ?
- Quel impact de la fragmentation de l'index HNSW après des INSERT/UPDATE fréquents ?

---

## TR5 — Hybrid search (vector + full-text)

**Notre spec** : `0.7 * (1 - cosine_distance) + 0.3 * ts_rank`, index GIN sur `search_vector`.

Que font les autres ?
- Quels poids (0.7/0.3) utilisent les systèmes de recherche sociale pour vector vs keyword ?
- Y a-t-il des benchmarks qui comparent weighted sum vs RRF pour hybride vectoriel ?
- Comment gèrent les requêtes où soit le vectoriel soit le textuel est très bon mais pas les deux ?
- Le fait d'avoir un index GIN + un index HNSW sur la même table pose-t-il des problèmes de performance en écriture ?
- Y a-t-il un pattern "retrieval d'abord, re-rank après" (cheap recall d'abord, cross-encoder ou LLM ensuite) ?

---

## TR6 — CTE traversal dans MatchingService

**Notre spec** : `Promise.all([traverse(), findSimilar()])`, depth ≤ 3, decay 0.85, top 50 par source.

Que font les autres ?
- Est-ce que les équipes reco font vraiment le graph traversal et le vector search en parallèle ou séquentiellement ?
- Comment implémentent-ils le timeout sur le CTE (PostgreSQL `statement_timeout` par requête) ?
- Que font-ils si le CTE prend plus de 1s (fallback sur le vectoriel seul, cache, service degradation) ?
- Y a-t-il des retours d'expérience de production sur le `Promise.all` avec une source lente et une rapide ?
- Comment gèrent la fusion quand une source retourne 0 résultats ?

---

## TR7 — RRF fusion avec k paramétrable

**Notre spec** : `score = 0.6/(k + rank_graph) + 0.4/(k + rank_vector)`, k=60, normalisation, bonus verified ×1.10.

Que font les autres ?
- Quel est le vrai k optimal observé en production pour du matching social ?
- Y a-t-il des implémentations qui rendent k dynamique (basé sur le nombre de candidats, la variance des rangs) ?
- Comment les équipes reco gèrent le "poids" entre deux sources (0.6/0.4 ici) ? Est-il calibré sur des données ou arbitraire ?
- Y a-t-il des alternatives à RRF utilisées en production pour fusionner graph + vector (pas dans les papiers, dans le code réel) ?
- Le bonus `is_verified × 1.10` est-il un pattern commun ou est-ce géré différemment (boost de position, filtre prioritaire) ?

---

## TR8 — Diversity_Mix par quartiles

**Notre spec** : quartiles Q1-Q3, 2 high + 1 mid + 1 wildcard + 1 boost, exactement 5 profils.

Que font les autres ?
- LinkedIn, Tinder, Netflix — comment implémentent-ils la diversité dans les recommandations sociales ?
- Le Maximal Marginal Relevance (MMR) est-il utilisé en production ou juste dans les papiers ?
- Y a-t-il des patterns de "diversity without sacrificing relevance" avec des métriques publiées ?
- Comment gèrent-ils le cas où le top quartile n'a que 3 profils (moins de 5 requis) ?
- Est-ce que la diversité est implémentée dans le ranker ou dans un layer séparé ?

---

## TR9 — Correction du bug confidence

**Notre spec** : `new_conf = 1 - (1 - conf_a) * (1 - conf_b)`, utiliser `raw.confidence` au lieu de 0.5 hardcodé.

Que font les autres ?
- Quelle formule de combinaison de confiance est utilisée en production pour les extractions LLM répétées ?
- Y a-t-il un pattern de "confidence decay" (baisser la confiance si l'info n'est pas confirmée dans X jours) ?
- Comment les systèmes de knowledge graph gèrent les contradictions (extraction dit "plombier" une fois, "électricien" ensuite) ?

---

## TR10 — Réponse heuristique immédiate

**Notre spec** : `getHeuristicReply()` basée sur regex/simple patterns, < 100ms, 20+ messages types.

Que font les autres ?
- Comment les chatbots WhatsApp (Rappi, Uber, N二十六) gèrent le premier accusé de réception ?
- Y a-t-il des patterns de "acknowledgment message + real reply" dans des systèmes à grande échelle ?
- Quelle est la vraie latence acceptable pour un accusé de réception WhatsApp avant que l'utilisateur renvoie ?
- Comment font Boardy et Series pour le premier message ?

---

## TR11 — File d'attente Bull/Redis pour traitement asynchrone

**Notre spec** : BullMQ, attempts=3, backoff exponential 2s, vérification intentVersion.

Que font les autres ?
- BullMQ vs RabbitMQ vs Kafka pour une petite équipe bootstrapped ?
- Comment gèrent les jobs qui prennent 45s (LLM) sans bloquer les workers ?
- Y a-t-il un pattern de "priority queue" (les messages récents passent avant) ?
- Comment détecter un worker frozen / dead et relancer le job ?

---

## TR12 — Checkpoints agent après chaque node

**Notre spec** : table `agent_states` (PK=userId), step enum, context JSONB, lock optimiste.

Que font les autres ?
- Quelle est l'approche de LangGraph pour les checkpoints en production (taille, coût, fréquence) ?
- Combien de startups utilisent LangGraph checkpoints vs leur propre state machine Postgres ?
- Y a-t-il des benchmarks de lecture/écriture JSONB sur une table de checkpoints à 10K+ users actifs ?

---

## TR13 — Découpage UserAgentService en nodes

**Notre spec** : 6 nodes indépendants (hydration, intent, extraction, matching, response), contrat entrée/sortie typé.

Que font les autres ?
- Comment LinkedIn/Tinder structurent leur pipeline agent pour les interactions utilisateur ?
- Y a-t-il des patterns de "node DAG" vs "linear pipeline" pour les chatbots ?
- Comment gèrent l'observabilité par node dans un pipeline multi-LLM ?

---

## TR14 — Caractérisation du code existant

**Notre spec** : 15-20 tests sur MatchingService, graphe synthétique pour traverse, capture oracle.

Que font les autres ?
- Quel est le pattern de "characterization testing" dans les équipes qui refactor du code ML/social ?
- Y a-t-il des outils spécifiques (approval tests, snapshot testing) pour ce genre de refactoring ?
- Comment les équipes reco valident qu'un nouveau ranker est meilleur que l'ancien sans A/B test ?

---

## TR15 — Tests property-based pour formules mathématiques

**Notre spec** : fast-check, propriétés sur RRF (∈ [0,1], stabilité k ∈ [20,100]), scoring CTE, Diversity_Mix.

Que font les autres ?
- Est-ce que les équipes reco utilisent du property-based testing en production ou juste des tests unitaires ?
- Y a-t-il des bibliothèques spécifiques pour tester des rankers (propriétés comme "ordre monotone", "pas de perte") ?
- Quelles sont les propriétés les plus utiles (celles qui ont vraiment trouvé des bugs) dans des systèmes similaires ?

---

## Règles

Pour chaque requirement :
1. ✅ **Trouvé** — lien + extrait + chiffre
2. ⚠️ **Partiel** — tendance ou logique déduite mais pas de source directe
3. ❌ **Pas de source** — aucun retour d'expérience public trouvé

Priorise les sources : blog engineering (LinkedIn, Uber, Airbnb, Instagram, Tinder) > conf talks (RecSys, KDD) > papiers avec code > GitHub > papiers seuls.
