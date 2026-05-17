# Research Mission — Méthodologies de recherche pour systèmes de matching social

Niveau méta : ne cherche pas des réponses techniques, cherche **comment les équipes produisent ces réponses**. Pour chaque point, documente le processus, les outils, les critères de décision, et les erreurs méthodologiques.

---

## Point 1 — Comment LinkedIn/Tinder/Boardy priorisent leur recherche

LinkedIn PYMK, Tinder, Boardy, Series — ils n'ont pas codé leur matching du premier coup. Comment ont-ils décidé QUOI chercher ?

- **Quand est-ce qu'une question devient "priorité de recherche" vs "on implémente direct" ?** — Critère de décision
- **Quel est le pipeline recherche → prototype → production** chez ces équipes ?
- **Quels sont leurs "research gates"** (points de non-retour où la recherche décide de l'architecture) ?
- **Qui fait la recherche ?** — Un seul chercheur, une équipe dédiée, les ingénieurs en rotation ?
- **Combien de temps dure une phase de recherche typique** avant de coder ?

Sources cibles : LinkedIn Engineering Blog posts sur leur processus, interviews de Staff Engineers (InfoQ, The Pragmatic Engineer, High Agency), Tinder Engineering blog, recsys conference keynotes.

---

## Point 2 — Revue systématique de littérature pour matching social

Quand tu dois décider entre CTE vs Neo4j vs pgvector vs RRF vs Borda count — comment fais-tu une revue qui n'est pas biaisée par ton premier résultat Google ?

- **Stratégie de recherche multi-sources** : quels mots-clés, dans quelles bases (arXiv, ACM DL, Google Scholar, S2, blog engineering) ?
- **Critères d'inclusion/exclusion** d'un papier pour matching social : quels filtres appliquer ?
- **Snowballing** (forward/backward citation tracking) — comment le faire proprement pour un sujet niche comme "RRF dans matching social bidirectionnel" ?
- **Systematic Mapping Study vs Systematic Literature Review** — quand utiliser l'un ou l'autre ?
- **Evidence等级** : comment classer la fiabilité d'une source ? (benchmark reproductible > demo paper > blog post > landing page > tweet)

Sources cibles : Kitchenham (2007) — guidelines for systematic literature review en software engineering, Petersen et al. (2008) — systematic mapping studies, exemples de SLR dans les confs recsys / SIGIR / WWW.

---

## Point 3 — Competitive analysis pour un produit non couvert (marché africain)

On a identifié que le marché africain des intros médiées par IA n'est pas couvert. Comment analyser un marché où **personne n'a encore réussi** ?

- **"Empty market" analysis** : quand aucun concurrent direct n'existe, qui sont les concurrents indirects ?
  - Indirects : WhatsApp groups (bouche à oreille), LinkedIn Premium, Facebook Groups, petites annonces (Jumia, AfriMMA)
- **Comment mesurer la demande** sans données de marché ?
  - Proxy metrics : volume de recherches Google "trouver artisan Cameroun", "mise en relation investisseur Afrique"
  - Analyse des WhatsApp groups publics (combien de messages "vous connaissez quelqu'un qui..." par jour ?)
- **Jobs to Be Done framework** appliqué au matching social : quels jobs les utilisateurs "embauchent" quand ils demandent une intro ?
- **Ries' "Leap of Faith" assumptions** : quelles sont les croyances non testées du business model Orya ?
- **Minimum Viable Research** : quel est le plus petit travail de recherche qui valide ou invalide le marché ?

Sources cibles : Christensen "Jobs to Be Done", Ries "The Lean Startup", Steve Blank "Customer Development", Momtgomery "Expanding the Market" (HBR).

---

## Point 4 — Benchmarking technique : comment comparer équitablement

Quand tu compares CTE vs pgRouting vs Neo4j ou pgvector vs Pinecone vs Qdrant, comment faire un benchmark qui n'est pas biaisé ?

- **Benchmark design** : quelles métriques (latence p50/p95/p99, throughput, rappel@k, coût $) ?
- **Hardware standardization** : comment isoler le benchmark de l'infra (même VM, même charge) ?
- **Cold start vs warm cache** : quel impact sur les chiffres et comment le documenter ?
- **Dataset représentatif** : où trouver des datasets sociaux realistes (pas des random vectors) ?
- **Reproducibility checklist** : quels paramètres absolument documenter pour qu'un autre puisse reproduire ?
  - PostgreSQL : shared_buffers, work_mem, effective_cache_size, random_page_cost, max_parallel_workers
  - pgvector : m, ef_construction, ef_search, lists, probes
  - Matériel : CPU, RAM, disk type (NVMe/SSD/HDD), filesystem
- **Common pitfalls** dans le benchmarking de matching social :
  - Benchmarker avec des données aléatoires vs réelles (les vrais embeddings ont une distribution, pas du bruit gaussien)
  - Oublier la maintenance : build time de l'index HNSW est un coût réel
  - Cross-validation : tester sur plusieurs seeds / splits

Sources cibles : ACM SIGMOD benchmark papers, Red Blue Green (Martin Fowler) sur les benchmarks, "Death by Benchmarking" (J. M. Hellerstein), PostgreSQL performance tuning wiki.

---

## Point 5 — Failure modes et anti-patterns dans la recherche produit

Quelles sont les erreurs les plus fréquentes dans la recherche pour un système de matching social ?

**Anti-pattern 1 : "Nous sommes différents"**
- Ignorer les techniques standard (CTE, embeddings, RRF) sous prétexte que "notre cas est unique"
- Combien de startups de matching ont échoué en réinventant le ranking au lieu d'utiliser XGBoost ?
- **Signal** : si ta formule de scoring n'est pas publiée dans un papier, c'est probablement faux

**Anti-pattern 2 : Over-engineering dès le premier jour**
- Commencer par un custom DNN ranker alors que 50 profils suffisent pour la phase MVP
- **Règle** : la meilleure architecture est celle que tu peux changer quand les données te contredisent
- Combien de produits de matching ont itéré sur leur algorithme après les premiers retours utilisateurs ?

**Anti-pattern 3 : Cherry-picking des benchmarks**
- "pgvector c'est < 1ms" — oui sur 58K vecteurs avec 16GB RAM. Mais sur 1M avec 1GB RAM ?
- **Règle** : toujours chercher le benchmark qui contredit ton hypothèse

**Anti-pattern 4 : Ignorer les contraintes non techniques**
- WhatsApp 24h window = contrainte architecturale plus forte que le choix entre HNSW et IVFFlat
- Marché africain = smartphones bas de gamme, coût data, coupures électriques

**Anti-pattern 5 : La recherche sans date de fin**
- La recherche peut continuer indéfiniment — à quel moment on code ?
- **Rule of thumb** : 3 sources indépendantes qui convergent = suffisant pour implémenter
- Comment fixer un "research deadline" et passer à l'execution ?

Sources cibles : "Why Startups Fail" (Tom Eisenmann), "The Lean Startup" cycle build-measure-learn, SpaceX "rapid iteration" philosophy, "Worse Is Better" (Gabriel), "The Mythical Man-Month" sur l'itération.

---

## Point 6 — Research tools et workflow pour une petite équipe

Concrètement, comment une équipe de 1-3 personnes (bootstrapped, Afrique) conduit sa recherche ?

- **Outils** :
  - Literature management : Zotero / Papers / Mendeley vs simple dossier de PDFs
  - Note-taking : Obsidian / Roam / Notion pour lier les findings entre eux ?
  - Collaborative research : comment partager les résultats sans réunions ?
- **Workflow type** :
  - J1-2 : Recherche large (10-15 sources par sujet)
  - J3-4 : Synthèse (tableau comparatif, gaps, recommandation)
  - J5 : Décision (implémenter, prototyper, ou creuser plus)
- **Comment documenter ce qu'on a appris pour qu'il soit réutilisable** (pas perdu dans un chat) ?
- **Research debt** : quand laisser des gaps non résolus pour plus tard ?
- **Fake it till you make it** : est-ce que prototyper avec une solution imparfaite (ex: heuristics à la place de pgvector) peut précéder la vraie implémentation ?

Sources cibles : "Working Backwards" (Amazon PR/FAQ process), "Shape Up" (Basecamp research phase), "Continuous Discovery Habits" (Teresa Torres), "The Knowledge Project" podcast sur les workflows de recherche.

---

## Point 7 — Validation des hypothèses de matching sans utilisateurs

Comment valider un algorithme de matching quand on n'a **aucun utilisateur** et **aucune donnée de feedback** ?

- **Simulation** :
  - Générer des profils synthétiques avec des patterns de skills/locations cohérents
  - Simuler des introductions aléatoires et mesurer la diversité du matching
  - Monte Carlo : N simulations avec seed différentes, mesurer la variance
- **Proxy metrics** :
  - Regret : combien de bons matchs l'algorithme rate-t-il ? (mesurable synthétiquement)
  - Coverage : est-ce que tous les profils ont une chance d'être matchés ?
  - Diversity : est-ce que les résultats changent quand on change la requête ?
- **A/B testing sans users** :
  - Hors ligne : replay de données historiques (si pas de dataset, créer un oracle synthétique)
  - Inter-annotateur : faire évaluer les matchs par 2-3 humains (amis/famille) et mesurer l'accord
- **Quand arrêter de simuler et lancer en production ?**
  - Critère : quand le faux positif rate est inférieur au coût d'un mauvais match humain ?

Sources cibles : Kohavi & Longbotham "Online Controlled Experiments at Scale", "Trustworthy Online Controlled Experiments" (Kohavi), simulations papers from KDD Cup, RecSys Challenge benchmarks.

---

## Règles de sortie

Pour chaque point, rends :
1. **Méthode concrète** : pas "faire une revue de littérature" mais "chercher sur arXiv avec les mots-clés X, Y, Z, filtrer par conférence A, B, C, utiliser snowballing sur les 5 papiers les plus cités"
2. **Outils précis** : noms, URLs, pourquoi celui-ci plutôt qu'un autre
3. **Exemples réels** : "LinkedIn a utilisé cette méthode pour décider X"
4. **Erreurs documentées** : "Tinder a essayé Y et ça a échoué parce que Z"
5. **Priorité** : quel point est le plus urgent pour une équipe bootstrapped en phase 0 ?
