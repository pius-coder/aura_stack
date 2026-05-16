# Implementation Plan: WhatsApp AI Matchmaking Platform (Orya)

## Overview

This plan implements the **WhatsApp AI Matchmaking Platform** on the Aura framework (cf. `.kiro/specs/aura-hono-tanstack-migration/`). It covers all 50 requirements (R1-R50) across 7 architecture layers defined in `design.md`. Tasks strictly follow the inventory at design.md § "Inventaire des operations Aura" (lignes 596-711).

**Services layer** (`src/operations/_services/`) : chaque service `extends AuraService` et encapsule la logique métier. Les operations sont des thin handlers qui instancient le service et déléguent. (design.md § Pattern AuraService, lignes 15-37).

---

## Phase 0 — Fondations (Services socles)

### 0.1 AuraService base class

- [x] **0.1.1 Créer `src/aura/server/service.ts`** — classe `AuraService` avec getters pour `db`, `user`, `session`, `agent`, `scheduler`, `storage`, `notify`, `log`, `audit`, `invalidate`, `paginate`, `runQuery`, `runMutation`, `runAction`
  - _Design: § Pattern AuraService, design.md lignes 15-37_
  - _Requirements: R40_

### 0.2 Alias FR/EN generator

- [x] **0.2.1 Créer `src/operations/_services/alias-service.ts`** — génère alias `{adjectif}-{nom-commun}-{4 chiffres}` en FR/EN avec vérification d'unicité
  - _Design: § Couche cross-cutting, design.md ligne 609_
  - _Requirements: R25.5_

### 0.3 Notifications WhatsApp (defineNotificationFn ×7)

- [x] **0.3.1 Créer `src/operations/notifications/match-request.notification.ts`** — notification nouvelle demande de match
  - _Design: design.md lignes 684-685_
  - _Requirements: R6.2, R16_
- [x] **0.3.2 Créer `src/operations/notifications/match-accepted.notification.ts`** — notification acceptation
  - _Design: design.md ligne 686_
  - _Requirements: R6.4, R16.2_
- [x] **0.3.3 Créer `src/operations/notifications/match-refused.notification.ts`** — notification refus
  - _Design: design.md ligne 687_
  - _Requirements: R16.2_
- [x] **0.3.4 Créer `src/operations/notifications/new-message.notification.ts`** — notification nouveau message chat
  - _Design: design.md ligne 688_
  - _Requirements: R16.1_
- [x] **0.3.5 Créer `src/operations/notifications/payment-success.notification.ts`** — notification paiement réussi
  - _Design: design.md ligne 689_
  - _Requirements: R16.3, R31_
- [ ] **0.3.6 Créer `src/operations/notifications/warning.notification.ts`** — notification avertissement
  - _Design: design.md ligne 690_
  - _Requirements: R9.4_
- [ ] **0.3.7 Créer `src/operations/notifications/suspension.notification.ts`** — notification suspension
  - _Design: design.md ligne 691_
  - _Requirements: R9.5_

### 0.4 Services de base

- [x] **0.4.1 Créer `src/operations/_services/inbox-service.ts`** — Couche 1 Transport WhatsApp
  - `processIncoming(inboxId)` — traite un message entrant, détecte code liaison, hydrate contexte, génère réponse
  - `handleLinkCode(phoneE164, code)` — vérifie et lie le code WhatsApp (cherche sur `AuraUser.linkCode` puis `AuraPhoneIdentity.linkCode`)
  - _Design: § Couche 1, design.md lignes 222-248_
  - _Requirements: R2, R37_
- [x] **0.4.2 Créer `src/operations/_services/chat-service.ts`** — Couche 5 Chat Temps Réel
  - `sendMessage(userId, conversationId, body)` — persist + room broadcast + notification WhatsApp
  - `sendTyping(userId, conversationId)` — typing indicator event
  - _Design: § Couche 5, design.md lignes 472-507_
  - _Requirements: R26, R27_
- [x] **0.4.3 Créer `src/operations/_services/matching-service.ts`** — Couche 3 Orchestrateur Matching (v1 keyword)
  - `findMatches(requesterId, constraints)` — scoring keyword + diversity 60/30/10
  - _Design: § Couche 3, design.md lignes 363-417_
  - _Requirements: R19, R20, R21_
- [x] **0.4.4 Créer `src/operations/_services/payment-service.ts`** — Couche 6 Paiement
  - `initiateCheckout(userId, kind)` — initie paiement via Provider_Fapshi
  - _Design: § Couche 6, design.md lignes 514-547_
  - _Requirements: R28, R31_
- [x] **0.4.5 Créer `src/operations/_services/user-agent-service.ts`** — Couche 2 Instance IA
  - `processMessage(userId, text)` — hydrate contexte + détecte intention + génère réponse + guardrail persona
  - `detectIntent(text)` — classification LLM (chat/search_provider/search_connection/account/help)
  - `extractEntities(userId, text)` — extraction entités (skills, locations, industries, needs)
  - _Design: § Couche 2, design.md lignes 309-357_
  - _Requirements: R11-R16_
- [ ] **0.4.6 Créer `src/operations/_services/knowledge-graph-service.ts`** — Couche 4 Knowledge Graph
  - `upsertEntity(userId, type, value)` — crée/met à jour entité
  - `upsertRelation(sourceId, targetId, predicate, strength)` — crée relation typée
  - `traverse(constraints)` — CTE récursive profondeur 1-3
  - `regenerateEmbedding(entityId)` — regénère embedding pgvector
  - _Design: § Couche 4, design.md lignes 423-465_
  - _Requirements: R17, R18, R19, R22_

### 0.5 Corrections des 3 actions crash

- [x] **0.5.1 Corriger `src/operations/agent/process-incoming.operation.ts`** — `.action()` → `.mutate()` pour éviter DB proxy tombstoné
  - _MEMO.md §4 « Le Problème .action() »_
- [x] **0.5.2 Corriger `src/operations/matching/run.operation.ts`** — idem
- [x] **0.5.3 Corriger `src/operations/payments/start-checkout.operation.ts`** — idem

### 0.6 Suppression helpers manuels

- [x] **0.6.1 Supprimer `src/lib/notifications/send.ts`** — remplacé par `defineNotificationFn`
  - _MEMO.md §4, « Ne PAS créer de helpers manuels »_

---

## Phase 1 — Renommage pour conformité Inventaire design.md

### 1.1 Renommer `chat/` → `conversations/`

- [ ] **1.1.1 Déplacer `src/operations/chat/send-message.operation.ts`** → `src/operations/conversations/send-message.operation.ts`
  - Mettre à jour le nom d'opération de `chat.send-message` → `conversations.send-message`
  - Mettre à jour `_registry.ts`
  - _Design: design.md lignes 648-654_
  - _Vérification: `bun run tsc --noEmit`, `bun run test`_
- [ ] **1.1.2 Déplacer `src/operations/chat/list-messages.operation.ts`** → `src/operations/conversations/messages-paginated.db-read.ts`
  - Renommer le type d'artefact en `.db-read.ts`
  - _Design: design.md ligne 654_
- [ ] **1.1.3 Déplacer `src/operations/chat/list-conversations.operation.ts`** → `src/operations/conversations/list-mine.operation.ts`
  - Renommer le nom d'opération
  - _Design: design.md ligne 649_
- [ ] **1.1.4 Déplacer `src/operations/chat/mark-read.operation.ts`** → `src/operations/conversations/mark-read.operation.ts`
  - _Design: design.md ligne 652_
- [ ] **1.1.5 Déplacer `src/operations/chat/typing.operation.ts`** → `src/operations/conversations/typing.operation.ts`
  - _Design: design.md ligne 652_

### 1.2 Renommer `matches/` → `matching/`

- [ ] **1.2.1 Déplacer `src/operations/matches/create.operation.ts`** → `src/operations/matching/create-request.operation.ts`
  - Nom d'opération: `matches.create` → `matching.create-request`
  - Ajouter `.use(withProQuota)`
  - _Design: design.md ligne 640_
  - _Requirements: R6.3, R15.3, R24.1_
- [ ] **1.2.2 Déplacer `src/operations/matches/accept.operation.ts`** → `src/operations/matching/accept-request.operation.ts`
  - Nom d'opération: `matches.accept` → `matching.accept-request`
  - _Design: design.md ligne 641_
  - _Requirements: R6.4, R24.2_
- [ ] **1.2.3 Déplacer `src/operations/matches/refuse.operation.ts`** → `src/operations/matching/refuse-request.operation.ts`
  - _Design: design.md ligne 642_
  - _Requirements: R24.3_
- [ ] **1.2.4 Déplacer `src/operations/matches/cancel.operation.ts`** → `src/operations/matching/cancel-request.operation.ts`
  - _Design: design.md ligne 643_
  - _Requirements: R6.3_
- [ ] **1.2.5 Fusionner `matches/list-incoming.operation.ts` + `matches/list-outgoing.operation.ts`** → `src/operations/matching/list-mine.operation.ts`
  - Opération unifiée retournant à la fois les requêtes reçues et envoyées
  - Exposer uniquement `{ alias }` pour les matchs en attente (R25.1)
  - _Design: design.md ligne 644_
  - _Requirements: R6.1, R8, R25.1_
- [ ] **1.2.6 Déplacer `src/operations/matches/expire-pending.cron.ts`** → `src/operations/matching/expire-pending.cron.ts`
  - _Design: design.md ligne 646_

### 1.3 Déplacer ops utilisateur dans `users/`

- [ ] **1.3.1 Déplacer `src/operations/auth/generate-link-code.operation.ts`** → `src/operations/users/generate-link-code.operation.ts`
  - _Design: design.md lignes 616-624_
  - _Requirements: R1.3_
- [ ] **1.3.2 Déplacer `src/operations/profile/set-language.operation.ts`** → `src/operations/users/set-language.operation.ts`
  - _Design: design.md ligne 620_
  - _Requirements: R39.2_
- [ ] **1.3.3 Déplacer `src/operations/profile/set-consent.operation.ts`** → `src/operations/users/consent-record.operation.ts`
  - Renommer le nom d'opération
  - _Design: design.md ligne 622_
  - _Requirements: R1.5, R38.4_

### 1.4 Renommer ops profil

- [ ] **1.4.1 Renommer `src/operations/profiles/update.operation.ts`** → `src/operations/profiles/upsert.operation.ts`
  - Nom d'opération: `profiles.update` → `profiles.upsert`
  - _Design: design.md ligne 627_
  - _Requirements: R3, R4_
- [ ] **1.4.2 Renommer `src/operations/profiles/get.operation.ts`** → `src/operations/profiles/get-by-id.operation.ts`
  - _Design: design.md ligne 630_

### 1.5 Renommer ops services

- [ ] **1.5.1 Renommer `src/operations/services/toggle.operation.ts`** → `src/operations/services/deactivate.operation.ts`
  - Nom d'opération: `services.toggle` → `services.deactivate`
  - Comportement: ne désactive que (ne réactive pas)
  - _Design: design.md ligne 635_
  - _Requirements: R5.3_

### 1.6 Renommer autres artefacts

- [ ] **1.6.1 Renommer `src/operations/_middleware/with-profile.middleware.ts`** → `src/operations/_middleware/with-active-profile.middleware.ts`
  - _Design: design.md ligne 613_
- [ ] **1.6.2 Déplacer `src/operations/agents/whatsapp-bot.agent.ts`** → `src/operations/ai/agent-user.agent.ts`
  - _Design: design.md ligne 709_
- [ ] **1.6.3 Déplacer `src/operations/agent/nodes/`** → `src/operations/ai/nodes/`
  - hydration.ts, response.ts, matching-intent.ts, extraction.ts
  - _Design: design.md lignes 708-711_

### 1.7 Mettre à jour `_registry.ts`

- [ ] **1.7.1 Régénérer `src/operations/_registry.ts`** après tous les déplacements/renommages
  - Vérifier que chaque export correspond au nouveau chemin
  - Supprimer les anciennes entrées
  - _Vérification: `bun run tsc --noEmit`, `bun run test`_

---

## Phase 2 — Opérations manquantes (Design > Code)

### 2.1 `users/`

- [ ] **2.1.1 Créer `src/operations/users/register.operation.ts`** — inscription email+password
  - `defineOperationFn("users.register").mutate().input(z).entities(["AuraUser", "Profile"]).public()`
  - Valider password: 12+ chars, lettre + chiffre + spécial (R1.4)
  - Générer code liaison 8 alphanum, persister sur `AuraUser.linkCode` (R1.3)
  - Répondre message générique si email existe déjà (R1.2)
  - Collecter consent avant finalisation (R1.5)
  - _Design: design.md ligne 617_
  - _Requirements: R1, R2_
- [ ] **2.1.2 Créer `src/operations/users/verify-email.operation.ts`** — vérification email
  - `defineOperationFn("users.verify-email").mutate().public()`
  - _Design: design.md ligne 618_
  - _Requirements: R1_
- [ ] **2.1.3 Créer `src/operations/users/set-region.operation.ts`** — région utilisateur
  - `defineOperationFn("users.set-region").mutate().auth()`
  - _Design: design.md ligne 621_
  - _Requirements: R40.1_
- [ ] **2.1.4 Créer `src/operations/users/data-export.action.ts`** — export RGPD
  - `defineOperationFn("users.data-export").action().auth()`
  - _Design: design.md ligne 623_
  - _Requirements: R36.5_
- [ ] **2.1.5 Créer `src/operations/users/data-delete.action.ts`** — suppression compte
  - `defineOperationFn("users.data-delete").action().auth()`
  - _Design: design.md ligne 624_
  - _Requirements: R36.4_

### 2.2 `conversations/`

- [ ] **2.2.1 Créer `src/operations/conversations/close.operation.ts`** — fermer conversation
  - `defineOperationFn("conversations.close").mutate().auth()`
  - Marquer `conversation.status = CLOSED`, passage en lecture seule
  - _Design: design.md ligne 653_
  - _Requirements: R8.4_

### 2.3 `matching/`

- [ ] **2.3.1 Créer `src/operations/matching/orchestrator.action.ts`** — invoque LangGraph Orchestrateur_Matching
  - `defineOperationFn("matching.orchestrator").action().internal()`
  - _Design: design.md ligne 645_
- [ ] **2.3.2 Créer `src/operations/matching/orchestrator-cache.db-read.ts`** — cache Redis
  - _Design: design.md ligne 646_

### 2.4 `disputes/`

- [ ] **2.4.1 Créer `src/operations/disputes/report.operation.ts`** — signaler litige
  - `defineOperationFn("disputes.report").mutate().auth()`
  - Prend snapshot complet des messages (R9.1)
  - Publie événement sur room `admin:disputes`
  - _Design: design.md ligne 661_
  - _Requirements: R9.1, R9.2_
- [ ] **2.4.2 Créer `src/operations/disputes/list-pending.operation.ts`** — lister litiges en attente
  - `defineOperationFn("disputes.list-pending").query().auth().admin()`
  - _Design: design.md ligne 662_
  - _Requirements: R10.2_
- [ ] **2.4.3 Créer `src/operations/disputes/snapshot-builder.action.ts`** — capture snapshot
  - `defineOperationFn("disputes.snapshot-builder").action().internal()`
  - _Design: design.md ligne 664_
  - _Requirements: R9.1_

### 2.5 `admin/`

- [ ] **2.5.1 Créer `src/operations/admin/metrics-business.operation.ts`** — métriques business 30j
  - `defineOperationFn("admin.metrics-business").query().admin()`
  - Inclure: users actifs, matchs créés, taux acceptation, conversations ouvertes, disputes
  - _Design: design.md ligne 669_
  - _Requirements: R10.4_
- [ ] **2.5.2 Créer `src/operations/admin/metrics-ai.operation.ts`** — métriques IA
  - `defineOperationFn("admin.metrics-ai").query().admin()`
  - Inclure: tokens consommés, latence bot, latence orchestrateur, taux matchs notés >= 4/5
  - _Design: design.md ligne 670_
  - _Requirements: R10.5, R42_

### 2.6 `payments/`

- [ ] **2.6.1 Créer `src/operations/payments/initiate-badge.action.ts`** — acheter Badge Vérifié
  - `defineOperationFn("payments.initiate-badge").action().auth()`
  - 10 000 FCFA/an
  - _Design: design.md ligne 673_
  - _Requirements: R31.1_
- [ ] **2.6.2 Créer `src/operations/payments/initiate-boost.action.ts`** — acheter Boost
  - `defineOperationFn("payments.initiate-boost").action().auth()`
  - 1 000 FCFA / 7 jours
  - _Design: design.md ligne 674_
  - _Requirements: R31.2_
- [ ] **2.6.3 Créer `src/operations/payments/initiate-pro.action.ts`** — acheter Abonnement Pro
  - `defineOperationFn("payments.initiate-pro").action().auth()`
  - 3 000 FCFA/mois
  - _Design: design.md ligne 675_
  - _Requirements: R31.3_
- [ ] **2.6.4 Créer `src/operations/payments/refund.action.ts`** — remboursement
  - `defineOperationFn("payments.refund").action().admin()`
  - _Design: design.md ligne 676_
  - _Requirements: R32.5, R33.5_

### 2.7 `subscriptions/`

- [ ] **2.7.1 Créer `src/operations/subscriptions/status.operation.ts`** — statut abonnement
  - `defineOperationFn("subscriptions.status").query().auth()`
  - _Design: design.md ligne 680_
- [ ] **2.7.2 Créer `src/operations/subscriptions/cancel.operation.ts`** — annuler abonnement
  - `defineOperationFn("subscriptions.cancel").mutate().auth()`
  - _Design: design.md ligne 681_
  - _Requirements: R34.4_
- [ ] **2.7.3 Créer `src/operations/subscriptions/renew-charge.cron.ts`** — renouvellement auto
  - `defineOperationFn("subscriptions.renew-charge").action().internal()`
  - Planifié via `ctx.scheduler.runAt(endsAt - 7j)`
  - _Design: design.md ligne 682_
  - _Requirements: R34.2_

---

## Phase 3 — Graph RAG IA (R17-R23)

### 3.1 Modèle de données Knowledge Graph

- [ ] **3.1.1 Ajouter les modèles Prisma** — `entities`, `relations`, `graph_embeddings`
  - `entities`: id, user_id, type, value, confidence, status, source, embedding_id, created_at
  - `relations`: id, source_entity_id, target_entity_id, predicate, strength, source, created_at
  - `graph_embeddings`: id, entity_id FK, embedding vector(1536), metadata jsonb, updated_at
  - Index: HNSW sur embedding (cosine_ops), GIN sur metadata
  - _Design: § Couche 4, design.md lignes 430-465_
  - _Requirements: R17_
- [ ] **3.1.2 Créer la migration Prisma** — `bun prisma migrate dev --name add-graph-tables`

### 3.2 KnowledgeGraphService

- [ ] **3.2.1 Implémenter `src/operations/_services/knowledge-graph-service.ts`**
  - `upsertEntity(userId, type, value, confidence, source)` — upsert avec incrémentation de confidence sur doublon (R18.3)
  - `upsertRelation(sourceEntityId, targetEntityId, predicate, strength)` — valide contrainte FK (R17.3)
  - `traverse(constraints)` — CTE récursive profondeur 1-3, max 10000 chemins, decay 0.85^longueur (R19.2-4)
  - `regenerateEmbedding(entityId)` — génère embedding 1536d, met à jour `graph_embeddings` (R18.6)
  - `serializeEntity(entity)` / `parseEntity(json)` — round-trip property (R23.1-2)
  - `serializeRelation(relation)` / `parseRelation(json)` — round-trip property (R23.3)
  - _Design: § Couche 4, design.md lignes 423-465_
  - _Requirements: R17, R18, R19, R22, R23_

### 3.3 Opérations Graph

- [ ] **3.3.1 Créer `src/operations/graph/upsert-entity.operation.ts`**
  - `defineOperationFn("graph.upsert-entity").mutate().internal()`
  - _Design: design.md ligne 696_
  - _Requirements: R17, R18_
- [ ] **3.3.2 Créer `src/operations/graph/upsert-relation.operation.ts`**
  - `defineOperationFn("graph.upsert-relation").mutate().internal()`
  - _Design: design.md ligne 697_
  - _Requirements: R17.2_
- [ ] **3.3.3 Créer `src/operations/graph/regenerate-embedding.action.ts`**
  - `defineOperationFn("graph.regenerate-embedding").action().internal()`
  - Retry 3x avec backoff exponentiel (R22.5)
  - _Design: design.md ligne 698_
  - _Requirements: R22.2_
- [ ] **3.3.4 Créer `src/operations/graph/traverse.db-read.ts`**
  - CTE récursive PostgreSQL, max depth 3, max paths 10000
  - Pondération: produit des strength × decay 0.85^profondeur (R19.3)
  - Pénaliser relations MATCHES/RATED négatives (R19.5)
  - _Design: design.md ligne 699_
  - _Requirements: R19_
- [ ] **3.3.5 Créer `src/operations/graph/search-vector.action.ts`**
  - Embedding 1536d → recherche cosine via `defineVectorIndex`
  - Filtres: region, exclure demandeur, exclus déjà matchés < 30j, exclus suspendus
  - Top 50 candidats (R20.3)
  - _Design: design.md ligne 700_
  - _Requirements: R20.1-3_
- [ ] **3.3.6 Créer `src/operations/graph/refresh-views.cron.ts`**
  - Refresh materialized views quotidien
  - _Design: design.md ligne 701_

### 3.4 RRF + Diversity (Dans MatchingService)

- [ ] **3.4.1 Implémenter RRF fusion** — `lib/matching/rrf.ts`
  - `rrf(rankA[], rankB[], k=60)` → score normalisé 0-1 (R20.4)
  - Exposer scores composants pour observabilité (R20.5)
  - _Design: § Couche 3, design.md lignes 400-401_
  - _Requirements: R20.4-5_
- [ ] **3.4.2 Implémenter Diversity Mix 60/30/10** — Dans MatchingService
  - 60% quartile supérieur, 30% quartile médian, 10% wildcard (R21.1)
  - Slot top 3 réservé aux Boost actifs (R21.3)
  - Bonus ×1.10 pour Badge Vérifié (R21.4)
  - Exclusion: soi-même, déjà matché < 30j, suspendu, bloqué (R21.2)
  - _Design: § Couche 3, design.md lignes 403-409_
  - _Requirements: R21_

### 3.5 Scheduler pour mises à jour KG

- [ ] **3.5.1 Ajouter `ctx.scheduler.runAfter` dans `ProfileService.updateProfile`** — régénère embeddings 5s après modif profil
  - _Requirements: R22.1_
- [ ] **3.5.2 Ajouter `ctx.scheduler.runAfter` dans `ServiceService.create/update/delete`** — met à jour entités KG
  - _Requirements: R22.1_

---

## Phase 4 — Admin & Modération (R9-R10)

### 4.1 DisputeService

- [ ] **4.1.1 Créer `src/operations/_services/dispute-service.ts`**
  - `report(conversationId, reporterId, reason)` — snapshot + création dispute + notification + room admin:disputes
  - `resolve(disputeId, decision)` — warn/suspend/both, incrémente warning_count, suspension auto si >= 3
  - _Requirements: R9_

### 4.2 Admin middleware

- [ ] **4.2.1 Créer `src/operations/_middleware/with-admin.middleware.ts`** — vérifie `users.role = "admin"`
  - _Requirements: R10.1_

### 4.3 Dashboard Admin

- [ ] **4.3.1 Mettre à jour `src/app/routes/admin/index.tsx`** — intégrer métriques Recharts
  - Tokens/jour, coût USD/jour, latence p50/p95/p99, qualité match, disputes ouvertes/résolues
  - _Design: § Couche 7, design.md lignes 581-587_
  - _Requirements: R10.4-5_

---

## Phase 5 — Paiements & Monétisation (R28-R34)

### 5.1 Workflow vérification identité

- [ ] **5.1.1 Créer `src/workflows/verify-identity.workflow.ts`**
  - Étapes: upload_documents → review → activate_or_reject
  - Upload selfie + CNI via `ctx.storage` (accès Admin only)
  - Remboursement sur rejet (R32.5)
  - _Requirements: R32_

### 5.2 Escrow phase 3

- [ ] **5.2.1 Créer `src/workflows/escrow-lifecycle.workflow.ts`**
  - Déclaration mission → séquestre → confirmation livraison → libération
  - Gel des fonds si litige (R33.4)
  - _Requirements: R33_

### 5.3 Feature flags BUSINESS_PHASE

- [ ] **5.3.1 Implémenter `src/lib/feature-flags.ts`**
  - Flag `BUSINESS_PHASE`: mvp | freemium | commission
  - MVP: pas de facturation, 20 matchs/jour max (R30)
  - Freemium: active Badge/Boost/Pro (R31)
  - _Requirements: R30_

### 5.4 ObservabilityService

- [ ] **5.4.1 Créer `src/operations/_services/observability-service.ts`** — Couche 7
  - `recordLlmCall(data)` — trace chaque appel LLM
  - `getBusinessMetrics(since)` — agrégats business 30j
  - `getAiMetrics(since)` — métriques IA
  - _Design: § Couche 7, design.md lignes 552-587_
  - _Requirements: R42_

---

## Phase 6 — Qualité & Déploiement (R41-R50)

### 6.1 Tests

- [ ] **6.1.1 Property-based tests (fast-check)** — `tests/properties/`
  - Round-trip serializeEntity/parseEntity (R23)
  - RRF scoring, Diversity Mix, CTE traversal
  - _Requirements: R47_
- [ ] **6.1.2 Tests d'intégration** — `src/operations/**/*.test.ts` existants + couverture disputes/paiements/KG

### 6.2 Docker compose

- [ ] **6.2.1 Créer `docker-compose.yml`**
  - Services: aura-app, postgres (pgvector), redis, evolution-api, grafana (optionnel)
  - _Requirements: R45_

### 6.3 Prometheus metrics

- [ ] **6.3.1 Ajouter endpoint `/metrics`** sur le broadcast server
  - Métriques: messages WhatsApp, latences, tokens LLM, outbox queue
  - _Design: § Couche 7, design.md lignes 572-579_
  - _Requirements: R45.3_

### 6.4 Idempotency middleware

- [ ] **6.4.1 Créer `src/aura/server/middleware/idempotency.ts`**
  - Vérifie header `Idempotency-Key` sur mutations POST
  - Retourne résultat précédent si déjà traité
  - _Requirements: R49_

### 6.5 WhatsApp Business API gateway

- [ ] **6.5.1 Créer `src/lib/whatsapp/business-gateway.ts`**
  - Implémente interface `WhatsAppGateway` via Meta Graph API v22
  - Bascule via `BUSINESS_PHASE` (R37)
  - _Requirements: R37_

---

## Ordre d'exécution

```
Phase 0 — Fondations ✅ (AuraService, 5 services, notifications, fix crashes)
     │
Phase 1 — Renommage conformité design.md ⏳ (~1 jour)
     │   chat/ → conversations/, matches/ → matching/,
     │   users/, profiles/upsert, services/deactivate
     │
Phase 2 — Opérations manquantes ❌ (~2 sem)
     │   users/register, conversations/close, matching/orchestrator,
     │   disputes/, admin/metrics, payments/, subscriptions/
     │
Phase 3 — Graph RAG IA ❌ (~3 sem)
     │   KnowledgeGraphService, CTE, embeddings, RRF, Diversity
     │
Phase 4 — Admin & Modération ❌ (~1 sem)
     │   DisputeService, admin middleware, dashboard metrics
     │
Phase 5 — Paiements & Monétisation ❌ (~2 sem)
     │   Workflows vérification/escrow, feature flags,
     │   ObservabilityService, Flutterwave provider
     │
Phase 6 — Qualité & Déploiement ❌ (~2 sem)
     │   Property tests, Docker compose, Prometheus,
     │   idempotency, WhatsApp Business API gateway
```

**Total estimé : ~11 semaines** pour livrer le MVP complet (Phases 0-6).
