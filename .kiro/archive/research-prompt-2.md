# Research Mission — Trois gaps résiduels

Ce prompt cible les 3 seuls points que les deux premières passes (11 points techniques) n'ont pas suffisamment couverts. Pour chaque point, cherche des **données de production** : EXPLAIN ANALYZE, repos open source, papiers avec formules exactes, conférence talks. Pas de généralités, pas de "on pourrait".

---

## Gap A — Benchmarks CTE PostgreSQL avec decay + pruning sur graphe social 10M+ arêtes

### Ce qu'on a déjà
- CTE récursif pattern standard (CYCLE clause PG14+, path array manuel)
- Indexation : B-tree composite sur `source_id, target_id`, `target_id, source_id`
- Benchmarks vagues : < 1M edges = < 100ms, 10M+ = 2-30s
- pgRouting, Apache AGE comme alternatives connues

### Ce qu'on cherche — Données de production exploitables

1. **EXPLAIN ANALYZE BUFFERS** sur un vrai graphe social :
   - Combien de shared hits / shared reads / temp written ?
   - Où sont les goulots : seq scan sur edges ? Hash join ? Materialisation de la working table ?
   - Est-ce que `work_mem` est le facteur limitant ?

2. **Index (to_id, type) vs (type, to_id)** :
   - Quel ordre donne le meilleur Bitmap Heap Scan pour une CTE qui alterne `to_id = id` et `type = x` ?
   - Y a-t-il un Partial Index pertinent (`WHERE strength > 0.1` ou `WHERE predicate IN (...)`) ?

3. **Pruning par score dans la CTE** :
   - Des exemples de `WHERE path_score * e.strength * POWER(0.85, depth) > 0.001` DANS la récursion ?
   - Est-ce que ça coupe la combinatoire ou Postgres matérialise quand même tous les tuples ?
   - Benchmark : pruning vs pas pruning sur le même graphe (réduction de combien de facteur ?)

4. **Conférence talks** :
   - PGConf.eu / PGConf.US / pg_day talks spécifiques sur le graph traversal dans Postgres
   - Liens vidéo + slides si possible
   - Cas d'usage : "friend-of-friend recommendation engine at scale"

5. **Test de charge** :
   - Row estimates : sur 1M / 5M / 10M / 50M edges
   - Combien de shared_buffers recommandés pour chaque palier ?
   - Est-ce que `max_recursive_iterations` existe ou est-ce implicite ?

6. **Apache AGE vs CTE pur** :
   - Cypher dans AGE => est-ce que l'optimiseur PostgreSQL choisit les mêmes index ?
   - Benchmarks comparatifs sur le même hardware (CTE SQL vs Cypher AGE)
   - Est-ce que AGE supporte `strength` weighting dans le traversal Cypher ?

---

## Gap B — Keyspace Redis pour candidate generation / matching en production

### Ce qu'on a déjà
- Structure de clés proposée (matching:results, matching:candidates, hydration:profile, etc.)
- Anti-stampede via SET NX EX + retry ou PER (Probabilistic Early Expiration)
- Invalidation via SET tracker + pipeline DEL

### Ce qu'on cherche — Architecture Redis de systèmes réels

1. **Repos open source de "candidate generation" ou "recommendation service"** :
   - N'importe quel repo GitHub qui expose un keyspace Redis pour du matching / recommendation
   - Exemples : systèmes de "people you may know", "friend recommendation", "job matching"
   - Comment nomment-ils leurs clés ? Namespace standard ?

2. **TTL strategy dans des systèmes sociaux** :
   - Pourquoi 60s vs 300s vs 3600s ?
   - Des benchmarks qui montrent le hit ratio en fonction du TTL ?
   - Invalidation proactive (write-through) vs TTL passif — quel pattern pour des profils sociaux qui changent peu ?

3. **Cache stampede chiffré** :
   - Simulations de stampede sur un système de matching
   - Combien de requests simultanées avant que ça devienne un problème ?
   - ProtonRank / Facebook TAO / Twitter Manhattan — comment ils gèrent ça à l'échelle ?

4. **Redis vs alternative in-process (caffeine, go-cache)** :
   - Pourquoi Redis plutôt qu'un cache local shared-nothing ?
   - Quel surcoût réseau pour un cache Redis localhost vs mémoire partagée ?
   - Cas où les gens ont abandonné Redis pour un cache local (et pourquoi)

5. **Sérialisation** :
   - MessagePack vs JSON vs protobuf pour stocker des résultats de matching dans Redis
   - Benchmarks taille / vitesse sur des structures matching typiques (liste de users avec scores)
   - Est-ce que RedisJSON vs raw string change la donne ?

---

## Gap C — Warm path scoring / relationship strength sur graphe social

### Ce qu'on a déjà
- Personalized PageRank : `PPR(t|s) = (1-α) × Σ PPR(n|s)/deg(n) + α`
- Path score : `∏ strength_i × decay^depth`
- Edge strength heuristics : message → +0.1, intro acceptée → +0.2, time-decay × 0.99/jour
- LinkedIn publie l'utilisation de PPR mais PAS la formule exacte de "warm path strength"

### Ce qu'on cherche — Formules et implémentations validées

1. **Link prediction sur graphe social** :
   - Papiers avec formules exactes de "relationship strength" entre deux personnes
   - Pas "neural graph neural networks" — des formules interprétables, utilisables en SQL
   - Adamic/Adar, Jaccard coefficient, preferential attachment, Katz index — applicables à notre cas ?
   - Benchmark : quelle formule correlate le mieux avec une introduction acceptée ou rejetée ?

2. **Edge strength à partir de signaux réels** :
   - Formules qui combinent : fréquence de messages, récence, durée de la relation, type (ami/travail/famille)
   - Exemples : score = w₁ × recency_score + w₂ × frequency_score + w₃ × duration_score
   - Poids w₁, w₂, w₃ calibrés sur des données réelles — y a-t-il des papiers qui publient ces poids ?
   - Time-decay functions : exp(-λt) vs power law (1/t^α) vs linear — quelle courbe pour quel type de relation ?

3. **Two-sided exposure / congestion** :
   - Modèles qui évitent de surcharger les profils populaires (trop d'intros vers la même personne)
   - Papiers de "reciprocal recommendation" avec contrainte d'attention
   - Pizzato et al. (2010) — y a-t-il des implémentations récentes (2022-2026) ?
   - Comment LinkedIn/Tinder gèrent le "top 1% reçoit 99% des requests" ?

4. **Implémentations SQL pures des formules ci-dessus** :
   - Katz index en SQL WITH RECURSIVE ?
   - Adamic/Adar en SQL simple ?
   - Benchmaps CTE vs couche applicative pour ces calculs

5. **Validation empirique** :
   - Si tu trouves un dataset public de graphe social avec des "successful introductions" (accept/reject)
   - Benchmark des formules ci-dessus sur ce dataset
   - Quelle métrique : precision@k, recall@k, NDCG pour ce type de problème ?

---

## Règles

- **Pour chaque sous-point**, rends-toi compte si tu as trouvé quelque chose de concret (code, benchmark, paper, data) ou si c'est un trou
- **Priorise les sources techniques** : GitHub, arXiv, conférence talks, blog engineering, data challenges (KDD Cup, RecSys)
- **Si tu trouves un repo GitHub**, donne le lien exact et le fichier pertinent
- **Si tu trouves un papier**, donne le titre, année, lien arXiv
- **Si une question n'a pas de réponse publique**, dis-le franchement — c'est l'info la plus utile

Format de sortie : par gap, par sous-point, avec 🔗 lien quand applicable, et une ✅ "trouvé" / ❌ "pas de source publique" / ⚠️ "partiel".
