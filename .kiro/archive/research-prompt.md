# Research Mission — Deep dive point par point

Tu vas enquêter en profondeur sur des sujets techniques précis. Chaque point est indépendant. Pour chaque point, tu cherches des **détails concrets** : code, schémas d'architecture, benchmarks, papiers de recherche, posts techniques, implémentations open source. Pas de marketing, pas de landing pages.

---

## Point 1 — CTE récursif PostgreSQL pour traversal de graphe social

Trouve des **implémentations réelles** de CTE récursifs utilisés pour traverser un graphe de personnes/entités (pas un graphe générique).

- Requêtes SQL WITH RECURSIVE sur des tables `entities` / `relations` / `edges`
- Stratégies d'indexation pour accélérer le traversal (B-tree sur predicate/source_id, composite indexes)
- Benchmarks de performance : combien de nœuds/arêtes avant que ça ralentisse ?
- Alternatives : pgRouting ? graph ppath extension ?
- Patterns anti-cycle dans les CTE (pas de `cycle` clause ? détection manuelle ?)
- Décay factor et score propagation dans le CTE lui-même

---

## Point 2 — pgvector HNSW pour recherche sémantique de profils

Plonge dans pgvector appliqué au **matching de profils utilisateurs** :

- Schéma exact : `ALTER TABLE ... ADD COLUMN embedding vector(1536)` et index HNSW
- Performances HNSW vs IVFFlat sur 1K, 10K, 100K, 1M vecteurs (temps de build, temps de query, rappel)
- Choix de distance : cosine vs L2 vs inner product pour des profils sociaux
- Hybrid search patterns : comment combiner full-text search Postgres + pgvector dans une même query
- Options de fusion : RRF, cross-encoder, weighted sum ?
- Exemples réels de code (GitHub repos, blog posts)

---

## Point 3 — Reciprocal Rank Fusion (RRF) pour fusion de classements

Trouve des implémentations précises de RRF :

- Code Python ou TypeScript de la fonction RRF exacte
- Comment gérer les cas où un candidat n'apparaît que dans un seul classement (rank = +∞)
- k optimal : la littérature dit k=60 (Cormack 2009). Y a-t-il des études plus récentes ?
- RRF dans le contexte du matching social (pas search IR général)
- Implémentations dans pgvector / Elasticsearch / Vespa
- Benchmarks RRF vs autres méthodes de fusion (combSUM, combMNZ, Borda count)

---

## Point 4 — Double opt-in et anonymat dans les systèmes d'introduction

Analyse les **mécanismes techniques** du double opt-in et du masquage d'identité :

- Apple Messages for Business : comment fonctionne l'Opaque ID ? Y a-t-il des alternatives ?
- Comment Boardy/Key AI/Nesha implémentent-ils techniquement le "ne pas révéler l'email/téléphone avant consentement" ?
- Patterns de relay : proxy email (comme Airbnb/Facebook), numéro temporaire, chat in-app
- Tables SQL pour modéliser les états de consentement (pending_one, pending_both, granted, expired)
- Gestion des timeouts : si l'utilisateur B ne répond pas dans X jours, que se passe-t-il ?
- Modèle de données pour les "opt-in tokens" avec expiration

---

## Point 5 — Architecture reply-first asynchrone

Trouve des patterns où un système de messagerie répond **d'abord vite**, puis traite en arrière-plan :

- Pattern "speculative execution" ou "optimistic reply" dans les chatbots
- Comment gérer le cas où le traitement async change la réponse déjà envoyée (mise à jour, correction, follow-up)
- Webhook ACK pattern : répondre 200 immédiatement, traitement différé
- File d'attente : Bull/Redis, RabbitMQ, Kafka pour les tâches de fond
- Gestion des race conditions entre la réponse heuristique et le résultat du matching
- Exemples concrets dans des systèmes de messagerie à grande échelle (Uber, DoorDash, etc.)

---

## Point 6 — Architecture conversationnelle agent par utilisateur

Cherche des patterns où **chaque utilisateur a sa propre instance d'agent** avec mémoire persistante :

- LangGraph checkpoints : comment ça marche avec PostgreSQL comme back-end ?
- Thread_id par user_id : modélisation, persistence, récupération
- Combien d'agents peuvent tourner en parallèle ? (1 agent/user = 10K agents pour 10K users)
- Gestion du contexte : comment tronquer l'historique sans perdre l'information utile ?
- Cost modeling : combien coûte le checkpoint par tour ? (stockage, I/O, latence)
- Alternatives à LangGraph : AWS Step Functions, Temporal, custom state machine en Postgres

---

## Point 7 — Machine d'état WhatsApp (24h window, templates, états)

Analyse l'impact de la **WhatsApp Business Messaging Policy** sur l'architecture :

- Implémentations de state machines pour gérer `open_window` vs `template_mode`
- Comment les BSP (360dialog, WATI, Gupshup) gèrent-ils la fenêtre 24h ?
- Gestion des templates approuvés : cache, fallback, langues
- Modèle de données pour les `whatsapp_templates` avec paramètres dynamiques
- Que se passe-t-il si la fenêtre expire pendant qu'un agent prépare une réponse ?
- Stratégies de "keep-alive" (messages proactifs avec template)
- Coûts : combien coûte un message template vs un message dans la fenêtre ?

---

## Point 8 — Multi-stage ranking pipeline pour matching social

Documente le pipeline complet d'un système de recommandation sociale :

- LinkedIn PYMK multi-stage funnel (déjà partiellement connu) — entre dans les détails des features utilisées à chaque étage
- XGBoost vs DNN pour le light ranker vs rich ranker — quelles features passent à quel niveau ?
- Comment gérer la "cold start" pour les nouveaux utilisateurs ?
- Diversity / fairness constraints dans le re-ranker (MMR, DP, calibrations)
- Métriques : Recall@k, NDCG, Reciprocal rank, User-side coverage
- Implémentations open source de re-rankers (Google's tensorflow ranking, etc.)

---

## Point 9 — Extraction d'entités depuis conversation pour graphe de connaissances

Trouve des patterns d'**extraction structurée** depuis des conversations :

- LLM structured output (OpenAI function calling, LangChain with_structured_output)
- Schémas Zod / Pydantic pour les entités extraites (skills, locations, services)
- Comment gérer la déduplication : fuzzy matching, normalisation, synonymes
- Renforcement de confiance : formules `1 - (1-a)(1-b)` vs moyenne vs max
- Extraction async : scheduler après la réponse, pas avant
- Rate limiting et coût : combien d'appels LLM par extraction ? Combien ça coûte ?
- Feedback loop : comment les vrais matchs renforcent la confiance des entités extraites ?

---

## Point 10 — Cache Redis pour matching et hydration

Trouve des patterns de caching pour un système de matching social :

- Structure des clés Redis : `matching:cache:{userId}:{queryHash}:{region}` — exemples réels
- TTL : pourquoi 60s pour le matching ? 60s pour l'hydration ?
- Invalidation : quand un profil est mis à jour, comment invalider le cache ?
- Cache stampede : que faire si 10 requêtes identiques arrivent simultanément ?
- Redis vs PostgreSQL UNLOGGED table vs in-memory du process
- Benchmarks : latence Redis < 1ms vs lecture DB ~10ms, combien de requêtes sauvées ?

---

## Point 11 — Scoring de graphe relationnel

Creuse les **formules exactes** de scoring utilisées dans les graphes sociaux :

- LinkedIn : comment calculent-ils le "warm path strength" entre deux personnes ?
- PageRank personnalisé sur un graphe social : formules, implémentations
- Score de chemin : produit des strengths × decay^depth — y a-t-il d'autres formules ?
- Edge strength : comment estimer la force d'une relation ? (fréquence communication, récence, type relation)
- Implémentations en SQL pur (pas de bibliothèque graphe)
- Benchmarks : CTE vs pgRouting vs Neo4j pour le même calcul

---

## Pour chaque point, livre :

1. **Liens concrets** (URLs) vers : code source, blog post, papier, doc technique, vidéo
2. **Extraits de code ou schémas** si trouvables
3. **Chiffres précis** (latence, coût, scale, rappel)
4. **Trade-offs** identifiés par les auteurs
5. **Ce qui n'est pas documenté** (gaps que même les experts n'ont pas couverts)

Priorise les sources techniques (GitHub, blog engineering, papers) sur le marketing.
