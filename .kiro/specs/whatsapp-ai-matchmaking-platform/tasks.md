# Implementation Plan: WhatsApp AI Matchmaking Platform

Strictly based on `requirements.md` (R1-R50) and `design.md` (§ Inventaire des operations Aura, lignes 596-711).

---

## 0. Fondations — Services socles

- [x] 0.1 Créer `src/aura/server/service.ts` — classe `AuraService` exposant `this.db`, `this.user`, `this.session`, `this.agent`, `this.scheduler`, `this.storage`, `this.notify`, `this.log`, `this.audit`, `this.invalidate`, `this.paginate`, `this.runQuery`, `this.runMutation`, `this.runAction`
  - _Requirements: R40_

- [x] 0.2 Créer les 7 services de l'inventaire (design.md lignes 601-609) :
  - [x] 0.2.1 `_services/inbox-service.ts` — Couche 1 Transport WhatsApp. `processIncoming(inboxId)`, `sendMessage(phone, body)`. Gère liaison code WhatsApp.
    - _Requirements: R2, R37_
  - [x] 0.2.2 `_services/user-agent-service.ts` — Couche 2 Instance IA. `processMessage(userId, text)`, `createThread(userId)`, `detectIntent(text)`, `extractEntities(userId, text)`. Utilise `ctx.agent.generateText()`. Guardrail persona.
    - _Requirements: R11-R16_
  - [x] 0.2.3 `_services/matching-service.ts` — Couche 3 Orchestrateur Matching (v1 keyword). `findMatches(requesterId, constraints)`. Scoring + diversity 60/30/10.
    - _Requirements: R19, R20, R21_
  - [ ] 0.2.4 `_services/knowledge-graph-service.ts` — Couche 4 Knowledge Graph. `upsertEntity`, `upsertRelation`, `traverse` (CTE), `regenerateEmbedding`, `serializeEntity/parseEntity` (round-trip).
    - _Requirements: R17, R18, R19, R22, R23_
  - [x] 0.2.5 `_services/chat-service.ts` — Couche 5 Chat temps réel. `sendMessage(userId, conversationId, body)`, `markRead`. Publie `message:new` sur room `conversation:{id}`. Notifie via `ctx.notify.via("new-message")`.
    - _Requirements: R26, R27_
  - [x] 0.2.6 `_services/payment-service.ts` — Couche 6 Paiement. `initiateCheckout(userId, kind)`, `handleWebhook(provider, payload)`, `refund(paymentId)`. Utilise `PaymentProvider` interface (Fapshi/Flutterwave).
    - _Requirements: R28, R31_
  - [ ] 0.2.7 `_services/observability-service.ts` — Couche 7 Observabilité IA. `recordLlmCall(data)`, `getBusinessMetrics(since)`, `getAiMetrics(since)`.
    - _Requirements: R42_
  - [x] 0.2.8 `_services/alias-service.ts` — Génération alias `{adjectif}-{nom-commun}-{4 chiffres}` FR/EN.
    - _Requirements: R25.5_

- [x] 0.3 Créer les 7 notifications via `defineNotificationFn` (design.md lignes 684-691) :
  - [x] 0.3.1 `notifications/match-request.notification.ts` — R6.2, R16
  - [x] 0.3.2 `notifications/match-accepted.notification.ts` — R6.4, R16.2
  - [x] 0.3.3 `notifications/match-refused.notification.ts` — R16.2
  - [x] 0.3.4 `notifications/new-message.notification.ts` — R16.1
  - [x] 0.3.5 `notifications/payment-success.notification.ts` — R16.3, R31
  - [ ] 0.3.6 `notifications/warning.notification.ts` — R9.4
  - [ ] 0.3.7 `notifications/suspension.notification.ts` — R9.5

- [x] 0.4 Créer le middleware (design.md lignes 611-614) :
  - [ ] 0.4.1 `_middleware/with-region-filter.middleware.ts` — injecte `ctx.region`
  - [x] 0.4.2 `_middleware/with-active-profile.middleware.ts` — exige `profile.status = ACTIVE`
  - [x] 0.4.3 `_middleware/with-pro-quota.middleware.ts` — enforce quotas matching (R30.2)

- [x] 0.5 Supprimer `src/lib/notifications/send.ts` — helpers manuels remplacés par `defineNotificationFn`

- [x] 0.6 Fixer les 3 actions qui utilisent `ctx.db.*` (DB proxy tombstoné) :
  - [x] 0.6.1 `agent/process-incoming.operation.ts` — `.action()` → `.mutate()`
  - [x] 0.6.2 `matching/run.operation.ts` — `.action()` → `.mutate()`
  - [x] 0.6.3 `payments/start-checkout.operation.ts` — `.action()` → `.mutate()`

- [x] 0.7 Nettoyer `AuthUserSafe` — retirer les champs fantômes (`businessName`, `countryId`, `currencyCode`, `onboardingCompleted`, `whatsappChallenge`, `hadWhatsapp`) qui n'existent pas sur `AuraUser`

---

## 1. Conformité design.md — Renommage des fichiers au nom exact de l'inventaire (lignes 616-711)

- [ ] 1.1 Déplacer les ops `users/` (design.md lignes 616-624) :
  - [ ] 1.1.1 `auth/generate-link-code.operation.ts` → `users/generate-link-code.operation.ts` (R1.3)
  - [ ] 1.1.2 `profiles/set-language.operation.ts` → `users/set-language.operation.ts` (R39.2)
  - [ ] 1.1.3 `profiles/set-consent.operation.ts` → `users/consent-record.operation.ts` (R1.5, R38.4)
  - [ ] 1.1.4 Renommer le nom d'opération dans chaque fichier (ex: `profiles.set-language` → `users.set-language`)

- [ ] 1.2 Renommer les ops `profiles/` (design.md lignes 626-630) :
  - [ ] 1.2.1 `profiles/update.operation.ts` → `profiles/upsert.operation.ts` (R3, R4)
  - [ ] 1.2.2 `profiles/get.operation.ts` → `profiles/get-by-id.operation.ts`

- [ ] 1.3 Renommer les ops `services/` (design.md lignes 632-637) :
  - [ ] 1.3.1 `services/toggle.operation.ts` → `services/deactivate.operation.ts` (R5.3)

- [ ] 1.4 Déplacer les ops `matching/` (design.md lignes 639-646) :
  - [ ] 1.4.1 `matches/create.operation.ts` → `matching/create-request.operation.ts` (R6.3, R15.3, R24.1)
  - [ ] 1.4.2 `matches/accept.operation.ts` → `matching/accept-request.operation.ts` (R6.4, R24.2)
  - [ ] 1.4.3 `matches/refuse.operation.ts` → `matching/refuse-request.operation.ts` (R24.3)
  - [ ] 1.4.4 `matches/cancel.operation.ts` → `matching/cancel-request.operation.ts` (R6.3)
  - [ ] 1.4.5 Fusionner `matches/list-incoming` + `matches/list-outgoing` → `matching/list-mine.operation.ts` (R6.1, R8)
  - [ ] 1.4.6 `matches/expire-pending.cron.ts` → `matching/expire-pending.cron.ts` (R24.5)

- [ ] 1.5 Déplacer les ops `conversations/` (design.md lignes 648-654) :
  - [ ] 1.5.1 `chat/send-message.operation.ts` → `conversations/send-message.operation.ts` (R26.3, R27)
  - [ ] 1.5.2 `chat/list-messages.operation.ts` → `conversations/messages-paginated.db-read.ts` (R8.2)
  - [ ] 1.5.3 `chat/list-conversations.operation.ts` → `conversations/list-mine.operation.ts` (R8.1)
  - [ ] 1.5.4 `chat/mark-read.operation.ts` → `conversations/mark-read.operation.ts`
  - [ ] 1.5.5 `chat/typing.operation.ts` → `conversations/typing.operation.ts`

- [ ] 1.6 Déplacer les ops `ratings/` (design.md lignes 656-658) :
  - [ ] 1.6.1 `ratings/create.operation.ts` → `ratings/submit.operation.ts` (R7.1, R7.5)
  - [ ] 1.6.2 `ratings/list-for-user.operation.ts` → `ratings/stats-by-user.db-read.ts` (R7.2)

- [ ] 1.7 Déplacer les ops `disputes/` (design.md lignes 660-664) :
  - [ ] 1.7.1 `disputes/create.operation.ts` → `disputes/report.operation.ts` (R9.1)

- [ ] 1.8 Déplacer les ops `payments/` (design.md lignes 672-677) :
  - [ ] 1.8.1 `payments/get-status.operation.ts` → `payments/list-history.operation.ts`

- [ ] 1.9 Renommer middleware et agents :
  - [ ] 1.9.1 `_middleware/with-profile.middleware.ts` → `_middleware/with-active-profile.middleware.ts`
  - [ ] 1.9.2 `agents/whatsapp-bot.agent.ts` → `ai/agent-user.agent.ts`
  - [ ] 1.9.3 `agent/nodes/` → `ai/nodes/` (hydration.ts, response.ts, matching-intent.ts, extraction.ts)

- [ ] 1.10 Régénérer `_registry.ts` après tous les renommages

---

## 2. Création des opérations manquantes dans l'inventaire design.md

- [ ] 2.1 `users/register.operation.ts` (mutate, public) — R1
  - Email + password, whatsapp_linked = false, session JWT (R1.1)
  - Message générique si email existe (R1.2)
  - Code liaison 8 alphanum persistant (R1.3)
  - Password 12+ chars lettre+chiffre+spécial (R1.4)
  - Consentement avant finalisation (R1.5)
  
- [ ] 2.2 `users/verify-email.operation.ts` (mutate, public) — R1
  
- [ ] 2.3 `users/set-region.operation.ts` (mutate, auth) — R40.1
  
- [ ] 2.4 `users/data-export.action.ts` (action, auth) — R36.5
  
- [ ] 2.5 `users/data-delete.action.ts` (action, auth) — R36.4

- [ ] 2.6 `profiles/upload-photo.action.ts` (action, auth) — R4.4 ✅ (existe déjà)

- [ ] 2.7 `profiles/set-type.operation.ts` (mutate, auth) — R3.4 ✅ (existe déjà)

- [ ] 2.8 `services/search.search.ts` (defineSearchIndex) — R20 ✅ (existe déjà)

- [ ] 2.9 `matching/orchestrator.action.ts` (action, internal) — invoque LangGraph Orchestrateur_Matching
  
- [ ] 2.10 `matching/orchestrator-cache.db-read.ts` — vue cache (user_id, query_hash, ttl)

- [ ] 2.11 `conversations/close.operation.ts` (mutate, auth) — R8.4

- [ ] 2.12 `disputes/list-pending.operation.ts` (query, admin) — R10.2

- [ ] 2.13 `disputes/snapshot-builder.action.ts` (action, internal) — R9.1

- [ ] 2.14 `admin/metrics-business.operation.ts` (query, admin) — R10.4
  - Users actifs, matchs créés, taux acceptation, conversations, disputes (30j)
  
- [ ] 2.15 `admin/metrics-ai.operation.ts` (query, admin) — R10.5, R42
  - Tokens, latence bot, latence orchestrateur, taux matchs >= 4/5

- [ ] 2.16 `payments/initiate-badge.action.ts` (action, auth) — R31.1 (10 000 FCFA/an)

- [ ] 2.17 `payments/initiate-boost.action.ts` (action, auth) — R31.2 (1 000 FCFA/7j)

- [ ] 2.18 `payments/initiate-pro.action.ts` (action, auth) — R31.3 (3 000 FCFA/mois)

- [ ] 2.19 `payments/refund.action.ts` (action, admin) — R32.5, R33.5

- [ ] 2.20 `subscriptions/status.operation.ts` (query, auth)

- [ ] 2.21 `subscriptions/cancel.operation.ts` (mutate, auth) — R34.4

- [ ] 2.22 `subscriptions/renew-charge.cron.ts` (cron) — R34.2

---

## 3. Graph RAG IA (R17-R23)

- [ ] 3.1 Ajouter les modèles Prisma (design.md § Couche 4, lignes 430-465) :
  - [ ] 3.1.1 `entities` — id, user_id, type (User|Service|Skill|Location|Industry|Need), value, confidence, status, source, embedding_id, created_at
  - [ ] 3.1.2 `relations` — id, source_entity_id FK, target_entity_id FK, predicate (PROVIDES|REQUIRES|LOCATED_IN|LOOKS_FOR|MATCHES|CONNECTED_TO|RATED), strength, source, created_at
  - [ ] 3.1.3 `graph_embeddings` — id, entity_id FK, embedding vector(1536), metadata jsonb, updated_at
  - [ ] 3.1.4 Index HNSW sur embedding (cosine_ops), GIN sur metadata, index sur entities.type/user_id, relations.predicate/source_entity_id/target_entity_id (R17.4)

- [ ] 3.2 Créer `src/operations/graph/` (design.md lignes 695-701) :
  - [ ] 3.2.1 `graph/upsert-entity.operation.ts` (mutate, internal) — R17, R18
  - [ ] 3.2.2 `graph/upsert-relation.operation.ts` (mutate, internal) — R17.2
  - [ ] 3.2.3 `graph/regenerate-embedding.action.ts` (action, internal) — 1536d, retry 3x backoff — R22.2, R22.5
  - [ ] 3.2.4 `graph/traverse.db-read.ts` — CTE récursive depth 1-3, max 10000 paths, decay 0.85^depth — R19
  - [ ] 3.2.5 `graph/search-vector.action.ts` (action, internal) — cosine via `defineVectorIndex`, filtres region/exclusions — R20.1-3
  - [ ] 3.2.6 `graph/refresh-views.cron.ts` — refresh materialized views

- [ ] 3.3 Implémenter RRF + Diversity dans MatchingService :
  - [ ] 3.3.1 RRF fusion (k=60) — `lib/matching/rrf.ts` — R20.4-5
  - [ ] 3.3.2 Diversity Mix 60/30/10 — R21.1
  - [ ] 3.3.3 Boost top 3 — R21.3
  - [ ] 3.3.4 Badge ×1.10 — R21.4
  - [ ] 3.3.5 Filtre exclusions (30j, suspendu, bloqué, soi-même) — R21.2

- [ ] 3.4 Ajouter `ctx.scheduler.runAfter` dans les services pour déclencher mise à jour KG :
  - [ ] 3.4.1 `ProfileService.updateProfile` → régénère embedding (R22.1)
  - [ ] 3.4.2 `ServiceService.create/update/delete` → met à jour entités KG (R22.1)

---

## 4. Admin & Modération (R9-R10)

- [ ] 4.1 Créer `src/operations/_services/dispute-service.ts` :
  - [ ] `report(conversationId, reporterId, reason)` — snapshot + notification room `admin:disputes` + Notification_WhatsApp (R9.1-2)
  - [ ] `resolve(disputeId, decision)` — warn/suspend/both, incrémente warning_count, suspension auto si >= 3 (R9.3-5)

- [ ] 4.2 Créer `src/operations/_middleware/with-admin.middleware.ts` — vérifie `users.role = "admin"` (R10.1)

- [ ] 4.3 Routes Admin (existantes : `src/app/routes/admin/`) :
  - [ ] Intégrer métriques Recharts (tokens, latence, qualité match, disputes)
  - _Requirements: R10.4-5_

---

## 5. Paiements & Monétisation (R28-R34)

- [ ] 5.1 Créer `src/workflows/verify-identity.workflow.ts` :
  - Étapes: upload_documents → review → activate_or_reject
  - Selfie + CNI via ctx.storage (accès Admin)
  - Remboursement sur rejet (R32.5)
  - _Requirements: R32_

- [ ] 5.2 Créer `src/workflows/escrow-lifecycle.workflow.ts` :
  - Déclaration mission → séquestre → confirmation → libération
  - Gel fonds si litige (R33.4)
  - _Requirements: R33_

- [ ] 5.3 Implémenter `src/lib/feature-flags.ts` :
  - `BUSINESS_PHASE`: mvp | freemium | commission (R30.3)
  - MVP: pas de paiement, 20 matchs/jour max (R30.1-2)

- [ ] 5.4 Créer `src/lib/payments/flutterwave.ts` — Provider Flutterwave (phase 3) — R28

---

## 6. Infrastructure & Déploiement (R41-R50)

- [ ] 6.1 Tests :
  - [ ] 6.1.1 Property-based tests (fast-check) dans `tests/properties/` — RRF, traversal, round-trip serialize, Diversity Mix — R47
  - [ ] 6.1.2 Tests d'intégration pour disputes, paiements, KG

- [ ] 6.2 Docker compose : aura-app, postgres (pgvector), redis, evolution-api, grafana — R45

- [ ] 6.3 Endpoint `/metrics` sur broadcast server + Prometheus metrics — R45.3

- [ ] 6.4 Idempotency middleware — `Idempotency-Key` sur mutations POST — R49

- [ ] 6.5 WhatsApp Business API gateway — `lib/whatsapp/business-gateway.ts` — R37

---

## Ordre d'exécution

```
Phase 0 — ✅ Fondations (AuraService, 6/7 services, 5/7 notifications, fix crashes)
Phase 1 — ⏳ Renommage conformité inventaire design.md
Phase 2 — ❌ Opérations manquantes (15 ops à créer)
Phase 3 — ❌ Graph RAG IA (KG service, CTE, RRF, Diversity)
Phase 4 — ❌ Admin & Modération (DisputeService, métriques)
Phase 5 — ❌ Paiements & Monétisation (workflows, feature flags)
Phase 6 — ❌ Infrastructure & Déploiement (tests, docker, metrics)
```
