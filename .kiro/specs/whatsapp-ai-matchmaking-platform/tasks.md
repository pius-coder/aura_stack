# Implementation Plan: WhatsApp AI Matchmaking Platform

## Overview

This plan implements the WhatsApp AI Matchmaking Platform on the Aura framework. It covers all 50 requirements (R1-R50) across 7 architecture layers defined in `design.md`. The operations inventory (design.md lignes 596-711) defines every operation file and its exact path — this plan strictly follows that inventory.

## Tasks

- [x] 0. Fondations — AuraService, services, notifications, crash fixes
  - [x] 0.1 Créer `src/aura/server/service.ts` — classe AuraService avec getters pour db/user/session/agent/scheduler/storage/notify/log/audit/invalidate/paginate/runQuery/runMutation/runAction
    - _Requirements: R40_

  - [x] 0.2 Créer `src/operations/_services/inbox-service.ts` — InboxService (Couche 1 Transport WhatsApp)
    - `processIncoming(inboxId)` — traite message entrant, gère liaison code WhatsApp
    - `sendMessage(phone, body)` — envoie message via WhatsApp gateway
    - _Requirements: R2, R37_

  - [x] 0.3 Créer `src/operations/_services/user-agent-service.ts` — UserAgentService (Couche 2 Instance IA)
    - `processMessage(userId, text)` — hydrate contexte + détecte intention + génère réponse + guardrail persona
    - `createThread(userId)` — crée thread LangGraph par utilisateur
    - `detectIntent(text)` — classification LLM (chat/search_provider/search_connection/account/help)
    - Guardrail persona avec vérification vouvoiement + retry 2x + fallback
    - _Requirements: R11-R16_

  - [x] 0.4 Créer `src/operations/_services/matching-service.ts` — MatchingService (Couche 3 Orchestrateur Matching)
    - `findMatches(requesterId, constraints)` — keyword scoring + diversity 60/30/10
    - _Requirements: R19, R20, R21_

  - [x] 0.5 Créer `src/operations/_services/chat-service.ts` — ChatService (Couche 5 Chat temps réel)
    - `sendMessage(userId, conversationId, body)` — persist + room broadcast `message:new` + notification WhatsApp
    - `markRead(userId, conversationId, messageId)` — marque message comme lu
    - Publie `message:received` dans room `user:{recipientId}`
    - _Requirements: R26, R27_

  - [x] 0.6 Créer `src/operations/_services/payment-service.ts` — PaymentService (Couche 6 Paiement)
    - `initiateCheckout(userId, kind)` — initie paiement via Provider_Fapshi
    - _Requirements: R28, R31_

  - [x] 0.7 Créer `src/operations/_services/alias-service.ts` — AliasService
    - Génère alias `{adjectif}-{nom-commun}-{4 chiffres}` en FR/EN avec vérification d'unicité
    - _Requirements: R25.5_

  - [x] 0.8 Créer les 5 notifications via `defineNotificationFn`:
    - `notifications/match-request.notification.ts` — _Requirements: R6.2, R16_
    - `notifications/match-accepted.notification.ts` — _Requirements: R6.4, R16.2_
    - `notifications/match-refused.notification.ts` — _Requirements: R16.2_
    - `notifications/new-message.notification.ts` — _Requirements: R16.1_
    - `notifications/payment-success.notification.ts` — _Requirements: R16.3, R31_

  - [x] 0.9 Créer `src/operations/_middleware/with-pro-quota.middleware.ts` — 20 matchs/jour max pour free tier (R30.2)

  - [x] 0.10 Créer `src/operations/_middleware/with-active-profile.middleware.ts` — exige profile.status = ACTIVE

  - [x] 0.11 Supprimer `src/lib/notifications/send.ts` — remplacé par defineNotificationFn

  - [x] 0.12 Fixer les 3 operations utilisant `ctx.db.*` dans une `.action()` (DB proxy tombstoné)
    - `agent/process-incoming.operation.ts` → passer en `.mutate()`
    - `matching/run.operation.ts` → passer en `.mutate()`
    - `payments/start-checkout.operation.ts` → passer en `.mutate()`

  - [x] 0.13 Nettoyer `AuthUserSafe` — retirer les champs fantômes (businessName, countryId, currencyCode, onboardingCompleted, whatsappChallenge, hadWhatsapp) qui n'existent pas sur AuraUser
    - Mettre à jour `src/aura/shared/auth-types.ts` et `src/aura/server/auth/operations.ts`

- [ ] 1. Renommage pour conformité à l'inventaire design.md (lignes 616-711)
  - [ ] 1.1 Déplacer dans `users/` :
    - `auth/generate-link-code.operation.ts` → `users/generate-link-code.operation.ts` — _Requirements: R1.3_
    - `profiles/set-language.operation.ts` → `users/set-language.operation.ts` — _Requirements: R39.2_
    - `profiles/set-consent.operation.ts` → `users/consent-record.operation.ts` — _Requirements: R1.5, R38.4_

  - [ ] 1.2 Renommer dans `profiles/` :
    - `profiles/update.operation.ts` → `profiles/upsert.operation.ts` — _Requirements: R3, R4_
    - `profiles/get.operation.ts` → `profiles/get-by-id.operation.ts`

  - [ ] 1.3 Renommer dans `services/` :
    - `services/toggle.operation.ts` → `services/deactivate.operation.ts` — _Requirements: R5.3_

  - [ ] 1.4 Déplacer dans `matching/` :
    - `matches/create.operation.ts` → `matching/create-request.operation.ts` — _Requirements: R6.3, R15.3, R24.1_
    - `matches/accept.operation.ts` → `matching/accept-request.operation.ts` — _Requirements: R6.4, R24.2_
    - `matches/refuse.operation.ts` → `matching/refuse-request.operation.ts` — _Requirements: R24.3_
    - `matches/cancel.operation.ts` → `matching/cancel-request.operation.ts` — _Requirements: R6.3_
    - Fusionner `matches/list-incoming` + `matches/list-outgoing` → `matching/list-mine.operation.ts` — _Requirements: R6.1, R8_
    - `matches/expire-pending.cron.ts` → `matching/expire-pending.cron.ts` — _Requirements: R24.5_

  - [ ] 1.5 Déplacer dans `conversations/` :
    - `chat/send-message.operation.ts` → `conversations/send-message.operation.ts` — _Requirements: R26.3, R27_
    - `chat/list-messages.operation.ts` → `conversations/messages-paginated.db-read.ts` — _Requirements: R8.2_
    - `chat/list-conversations.operation.ts` → `conversations/list-mine.operation.ts` — _Requirements: R8.1_
    - `chat/mark-read.operation.ts` → `conversations/mark-read.operation.ts`
    - `chat/typing.operation.ts` → `conversations/typing.operation.ts`

  - [ ] 1.6 Déplacer dans `ratings/` :
    - `ratings/create.operation.ts` → `ratings/submit.operation.ts` — _Requirements: R7.1, R7.5_
    - `ratings/list-for-user.operation.ts` → `ratings/stats-by-user.db-read.ts` — _Requirements: R7.2_

  - [ ] 1.7 Déplacer dans `disputes/` :
    - `disputes/create.operation.ts` → `disputes/report.operation.ts` — _Requirements: R9.1_

  - [ ] 1.8 Déplacer dans `payments/` :
    - `payments/get-status.operation.ts` → `payments/list-history.operation.ts`

  - [ ] 1.9 Renommer middleware et agents :
    - `_middleware/with-profile.middleware.ts` → `_middleware/with-active-profile.middleware.ts`
    - `agents/whatsapp-bot.agent.ts` → `ai/agent-user.agent.ts`
    - `agent/nodes/*` → `ai/nodes/` (hydration.ts, response.ts, matching-intent.ts, extraction.ts)

  - [ ] 1.10 Régénérer `src/operations/_registry.ts` après tous les renommages

- [ ] 2. Création des opérations listées dans l'inventaire design.md mais absentes du code
  - [ ] 2.1 Créer `users/register.operation.ts` (mutate, public) — R1
    - Inscription email + password avec whatsapp_linked = false
    - Code liaison 8 alphanum persistant sur AuraUser.linkCode
    - Password 12+ chars avec lettre + chiffre + spécial
    - Message générique si email existe déjà (ne pas révéler)
    - Consentement avant finalisation
    - _Requirements: R1_

  - [ ] 2.2 Créer `users/verify-email.operation.ts` (mutate, public) — R1
    - _Requirements: R1_

  - [ ] 2.3 Créer `users/set-region.operation.ts` (mutate, auth) — R40.1
    - _Requirements: R40.1_

  - [ ] 2.4 Créer `users/data-export.action.ts` (action, auth) — R36.5
    - _Requirements: R36.5_

  - [ ] 2.5 Créer `users/data-delete.action.ts` (action, auth) — R36.4
    - _Requirements: R36.4_

  - [ ] 2.6 Créer `conversations/close.operation.ts` (mutate, auth) — R8.4
    - _Requirements: R8.4_

  - [ ] 2.7 Créer `matching/orchestrator.action.ts` (action, internal) — invoque LangGraph Orchestrateur_Matching

  - [ ] 2.8 Créer `matching/orchestrator-cache.db-read.ts` — vue cache (user_id, query_hash, ttl)

  - [ ] 2.9 Créer `disputes/list-pending.operation.ts` (query, admin) — R10.2
    - _Requirements: R10.2_

  - [ ] 2.10 Créer `disputes/snapshot-builder.action.ts` (action, internal) — R9.1
    - _Requirements: R9.1_

  - [ ] 2.11 Créer `admin/metrics-business.operation.ts` (query, admin) — R10.4
    - Users actifs, matchs créés, taux acceptation, conversations, disputes (rolling 30j)
    - _Requirements: R10.4_

  - [ ] 2.12 Créer `admin/metrics-ai.operation.ts` (query, admin) — R10.5, R42
    - Tokens consommés, latence bot, latence orchestrateur, taux matchs >= 4/5
    - _Requirements: R10.5, R42_

  - [ ] 2.13 Créer `payments/initiate-badge.action.ts` (action, auth) — Badge Vérifié 10 000 FCFA/an
    - _Requirements: R31.1_

  - [ ] 2.14 Créer `payments/initiate-boost.action.ts` (action, auth) — Boost 1 000 FCFA/7j
    - _Requirements: R31.2_

  - [ ] 2.15 Créer `payments/initiate-pro.action.ts` (action, auth) — Abonnement Pro 3 000 FCFA/mois
    - _Requirements: R31.3_

  - [ ] 2.16 Créer `payments/refund.action.ts` (action, admin) — R32.5, R33.5
    - _Requirements: R32.5, R33.5_

  - [ ] 2.17 Créer `subscriptions/status.operation.ts` (query, auth)

  - [ ] 2.18 Créer `subscriptions/cancel.operation.ts` (mutate, auth) — R34.4
    - _Requirements: R34.4_

  - [ ] 2.19 Créer `subscriptions/renew-charge.cron.ts` (cron) — renouvellement auto
    - _Requirements: R34.2_

  - [ ] 2.20 Créer `notifications/warning.notification.ts` — R9.4
    - _Requirements: R9.4_

  - [ ] 2.21 Créer `notifications/suspension.notification.ts` — R9.5
    - _Requirements: R9.5_

  - [ ] 2.22 Créer `_middleware/with-region-filter.middleware.ts` — injecte ctx.region

- [ ] 3. Knowledge Graph (R17-R23)
  - [ ] 3.1 Ajouter les modèles Prisma (design.md § Couche 4)
    - `entities` — id, user_id, type, value, confidence, status, source, embedding_id, created_at
    - `relations` — id, source_entity_id FK, target_entity_id FK, predicate, strength, source, created_at
    - `graph_embeddings` — id, entity_id FK, embedding vector(1536), metadata jsonb, updated_at
    - Index HNSW sur embedding, GIN sur metadata, index sur entities.type/user_id, relations.predicate
    - _Requirements: R17_

  - [ ] 3.2 Créer `_services/knowledge-graph-service.ts`
    - `upsertEntity(userId, type, value)` — incrémente confidence sur doublon — _R17, R18_
    - `upsertRelation(sourceId, targetId, predicate, strength)` — _R17.2_
    - `traverse(constraints)` — CTE récursive depth 1-3, max 10000, decay 0.85^depth — _R19_
    - `regenerateEmbedding(entityId)` — 1536d, retry 3x backoff — _R22_
    - `serializeEntity/parseEntity`, `serializeRelation/parseRelation` — round-trip — _R23_

  - [ ] 3.3 Créer les operations `graph/` (design.md lignes 695-701)
    - `graph/upsert-entity.operation.ts` (mutate, internal) — _R17, R18_
    - `graph/upsert-relation.operation.ts` (mutate, internal) — _R17.2_
    - `graph/regenerate-embedding.action.ts` (action, internal) — _R22.2_
    - `graph/traverse.db-read.ts` — CTE récursive — _R19_
    - `graph/search-vector.action.ts` (action, internal) — cosine via defineVectorIndex — _R20.1-3_
    - `graph/refresh-views.cron.ts` — materialized views

  - [ ] 3.4 Implémenter RRF + Diversity dans MatchingService
    - RRF fusion (k=60) — `lib/matching/rrf.ts` — _R20.4-5_
    - Diversity Mix 60/30/10 — _R21.1_
    - Boost priorité top 3 — _R21.3_
    - Badge Vérifié bonus ×1.10 — _R21.4_
    - Filtre exclusions (30j, suspendu, bloqué, soi-même) — _R21.2_

  - [ ] 3.5 Ajouter `ctx.scheduler.runAfter` dans ProfileService et ServiceService pour déclencher mise à jour KG
    - _Requirements: R22.1_

- [ ] 4. Admin & Modération (R9-R10)
  - [ ] 4.1 Créer `_services/dispute-service.ts`
    - `report(conversationId, reporterId, reason)` — snapshot + room admin:disputes + Notification_WhatsApp — _R9.1-2_
    - `resolve(disputeId, decision)` — warn/suspend, incrémente warning_count, suspension auto si >= 3 — _R9.3-5_
    - _Requirements: R9_

  - [ ] 4.2 Créer `_middleware/with-admin.middleware.ts` — vérifie role admin — _R10.1_

- [ ] 5. Paiements & Monétisation (R28-R34)
  - [ ] 5.1 Créer `workflows/verify-identity.workflow.ts` — upload selfie+CNI → review → activate/reject — _R32_
    - _Requirements: R32_

  - [ ] 5.2 Créer `workflows/escrow-lifecycle.workflow.ts` — séquestre mission → livraison → libération — _R33_
    - _Requirements: R33_

  - [ ] 5.3 Implémenter `lib/feature-flags.ts` — BUSINESS_PHASE (mvp/freemium/commission)
    - MVP: pas de paiement, 20 matchs/jour max — _R30_

  - [ ] 5.4 Créer `_services/observability-service.ts` — Couche 7
    - `recordLlmCall(data)`, `getBusinessMetrics(since)`, `getAiMetrics(since)` — _R42_

  - [ ] 5.5 Créer `lib/payments/flutterwave.ts` — Provider Flutterwave phase 3 — _R28_

- [ ] 6. Infrastructure & Déploiement (R41-R50)
  - [ ] 6.1 Property-based tests (fast-check) dans `tests/properties/` — RRF, traversal, round-trip, Diversity — _R47_

  - [ ] 6.2 Docker compose — aura-app, postgres (pgvector), redis, evolution-api, grafana — _R45_

  - [ ] 6.3 Endpoint `/metrics` sur broadcast server — Prometheus — _R45.3_

  - [ ] 6.4 Idempotency middleware — Idempotency-Key sur mutations POST — _R49_

  - [ ] 6.5 WhatsApp Business API gateway — `lib/whatsapp/business-gateway.ts` — _R37_
