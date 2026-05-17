# Research Mission — Comment les autres utilisent les LLMs (prompting, architecture, patterns)

Pas de théorie "few-shot learning paper 2023". Cherche comment des équipes en production structurent leurs appels LLM pour des chatbots sociaux, du matching, de l'extraction — les patterns concrets, les échecs, les trade-offs.

---

## Point 1 — Architecture multi-LLM : un modèle ou plusieurs ?

**Notre approche actuelle** : un seul modèle (Mistral Large) pour tout : intent detection, extraction, reply, guardrail.

Comment font les autres ?
- Boardy / Series / Key AI : est-ce qu'ils utilisent un seul modèle ou des modèles spécialisés par tâche ?
- LinkedIn : est-ce que PYMK utilise un LLM quelque part ou juste des rankers ML traditionnels ?
- Pattern "router model" : un petit modèle rapide (GPT-4o-mini, Claude Haiku, classifieur léger) décide quelle tâche, puis un gros modèle exécute ?
- Pattern "hierarchical" : intent avec un petit modèle, extraction/reply avec un plus gros ?
- Y a-t-il des retours d'expérience sur le coût (latence + $) de chaque approche ?

---

## Point 2 — Format des prompts en production (pas des tutoriels)

**Notre approche** : concaténation de strings, un seul system prompt fixe + un user prompt dynamique.

Quels patterns utilisent les autres ?
- **System prompt seul vs system + user + few-shot + chain-of-thought** : quelles combinaisons pour quel usage ?
- **Structured output** : OpenAI `strict: true`, Pydantic/Zod schema — est-ce que les équipes l'utilisent en prod ou préfèrent parser le JSON brut après coup ?
- **Markdown vs XML vs JSON dans le prompt** : quel format les équipes reco utilisent pour délimiter les sections (context, history, instruction) ?
- **Dynamic system prompt** : est-ce que le system prompt change à chaque tour (enrichi avec l'historique, les entités extraites) ou est-il fixe ?
- **Context window management** : que font-ils quand l'historique dépasse la fenêtre du modèle ? (RAG, summarization, sliding window, troncature)
- **Versioning des prompts** : comment les équipes reco versionnent et déploient les changements de prompt ?

---

## Point 3 — Intent detection : classification LLM vs classifieur dédié

**Notre approche** : LLM avec `buildIntentPrompt()` qui demande du JSON.

Comment font les autres ?
- Les chatbots sociaux en production utilisent-ils un LLM pour l'intent ou un classifieur traditionnel (régression logistique, small BERT, XGBoost sur features textuelles) ?
- Y a-t-il des benchmarks de latence/coût/précision : LLM vs small model vs règles ?
- **Few-shot dynamique** : injecter les N exemples les plus similaires dans le prompt plutôt qu'un jeu fixe — est-ce que c'est fait en production ?
- **Confidence thresholding** : en dessous de combien de confiance faut-il demander confirmation ? (0.7 ? 0.9 ? ça change selon le contexte ?)
- **Fallback** : si le LLM retourne du JSON invalide, les équipes tentent un reparsing, un retry, ou un fallback "chat" ?

---

## Point 4 — Extraction depuis conversation

**Notre approche** : LLM avec `buildExtractionPrompt()`, 3 retries max, persistence dans KnowledgeEntity/Relation.

Comment font les autres ?
- **Extraction par message individuel vs batch de messages** : est-ce que les équipes extraient tour par tour ou regroupent N messages pour économiser des appels ?
- **Incremental knowledge** : comment évitent-elles la redite (extraire la même entité 10 fois dans une conversation) ?
- **Confidence calibration** : les extractions LLM sont-elles calibrées (une confiance de 0.8 = vraiment 80% de chances d'être correct) ou juste une estimate non calibrée ?
- **Entity dedup + merge** : comment les équipes reco lient "plombier" → "plumbing" → "canalisations" dans le même graphe ?
- **Feedback loop** : est-ce que les extractions sont renforcées par les vrais matchs (si l'utilisateur accepte une intro, booster la confiance) ?

---

## Point 5 — Guardrail et safety

**Notre approche** : LLM qui réécrit la réponse si elle viole la persona (2 retries, fallback prédéfini).

Comment font les autres ?
- **Guardrail LLM vs guardrail regex/règles** : est-ce que les équipes reco utilisent un LLM séparé pour la guardrail ou un classifieur dédié (LlamaGuard, ShieldGemma) ?
- **Retry budget** : combien de retries avant de donner une réponse de secours ? (2 ? 3 ? 0 — on filtre avant plutôt qu'après ?)
- **Pattern "input guardrail + output guardrail"** : est-ce que les équipes filtrent en entrée ET en sortie ?
- **Persona enforcement** : comment s'assurer que le LLM garde un ton cohérent sans sur-corriger ?
- **Cost of guardrail** : est-ce que le coût du guardrail (un appel LLM supplémentaire) est jugé acceptable ou cherchent-ils des alternatives moins chères ?

---

## Point 6 — Streaming et latence

**Notre approche** : synchrone, attend la réponse complète avant d'envoyer.

Comment font les autres ?
- **Streaming** : est-ce que les chatbots WhatsApp/ iMessage stream la réponse token par token ou envoient le texte complet ?
- **Premier token vs dernier token** : quelle est la latence perçue par l'utilisateur ?
- **Speculative decoding** : est-ce que les équipes reco utilisent des techniques pour accélérer l'inférence en prod ?
- **Cache de réponses** : est-ce que les réponses fréquentes (ex: "je cherche quelqu'un qui...") sont cachées ?

---

## Point 7 — Évaluation des prompts (pas "LLM-as-judge" théorique)

Comment les équipes reco évaluent-elles leurs prompts en production ?
- **Golden dataset** : combien de paires (input → output attendu) pour valider un changement de prompt ? (10 ? 100 ? 1000 ?)
- **LLM-as-judge** : est-ce que c'est utilisé en production ou juste dans les papiers ? Quel modèle pour le judge ? Comment éviter le biais du judge ?
- **A/B testing des prompts** : comment déploient-ils un changement de prompt sans risquer une régression ?
- **Diffing sémantique** : est-ce que les équipes comparent la sortie de deux prompts automatiquement ou manuellement ?
- **Prompt management tools** : LangSmith, Weave, HoneyHive, PromptLayer — est-ce que les équipes reco les utilisent ou juste git + fichier texte ?

---

## Point 8 — Coût et optimisation

| Tâche | Notre coût actuel (Mistral Large via NVIDIA) | Coût optimal estimé |
|-------|----------------------------------------------|---------------------|
| Intent detection | ~45s, ~$0.02 | GPT-4o-mini : < 1s, ~$0.0002 |
| Extraction (×3) | ~135s, ~$0.06 | GPT-4o-mini : < 3s, ~$0.0006 |
| Reply | ~45s, ~$0.02 | GPT-4o : < 3s, ~$0.005 |
| Guardrail (×2) | ~90s, ~$0.04 | Classifieur : < 10ms, ~$0 |
| Embedding | ~45s, ~$0.02 | text-embedding-3-small : < 1s, ~$0.0001 |

Que font les autres pour réduire les coûts LLM sans sacrifier la qualité ?
- **Caching sémantique** (retourner la même réponse pour des messages similaires) ?
- **Routing automatique** (petit modèle pour les tâches simples, gros pour les complexes) ?
- **Batch processing** (agréger les extractions/embeddings) ?
- **Fallback progression** (essayer un petit modèle, si confiance < seuil → gros modèle) ?
- **Combien dépensent Boardy/Series par conversation ?** (même un ordre de grandeur aiderait)

---

## Point 9 — Gestion de l'historique conversationnel

**Notre approche** : pas de gestion explicite — l'agent reçoit le message courant + contexte summary.

Comment font les autres ?
- **Summary + last N messages** : combien de messages gardent-ils dans le contexte avant de résumer ?
- **Compression progressive** : résument-ils l'historique tous les X tours ou quand le contexte approche la limite ?
- **Token budget par section** : allouent-ils un nombre max de tokens pour l'historique, le profil, les résultats de matching ?
- **Entity memory** : extraient-ils les entités importantes dans une mémoire séparée (pas dans le prompt conversationnel) ?
- **Expiration de la mémoire** : combien de temps gardent-ils le contexte d'une conversation WhatsApp ?

---

## Règles

Priorité aux sources :
1. Blog engineering (LinkedIn, Uber, Airbnb, Intercom, Zendesk, TikTok)
2. Conférences (RecSys, KDD, NeurIPS LLM deployments track, AI Engineer Summit)
3. Papiers avec code et benchmarks reproductibles
4. GitHub repos de chatbots en production

Pour chaque point, rends :
- Les patterns réels (pas les tutoriels "comment prompt")
- Les échecs documentés (changements qui ont empiré les métriques)
- Les chiffres (latence, coût, précision)
- Les noms d'équipes / produits qui utilisent chaque pattern
