# Plan d'Implémentation — WhatsApp AI Matchmaking Platform

Basé strictement sur `design.md` § "Inventaire des operations Aura" et `requirements.md`.

Légende : ✅ fait | ⏳ en cours | ❌ à faire

---

## Services (src/operations/_services/)

Design.md § "Inventaire des operations Aura" ligne 601-609.

| Service | Fichier | Couche | Statut |
|---------|---------|--------|--------|
| InboxService | `_services/inbox-service.ts` | 1. Transport WhatsApp | ✅ |
| UserAgentService | `_services/user-agent-service.ts` | 2. Instance IA | ✅ |
| MatchingService | `_services/matching-service.ts` | 3. Orchestrateur Matching | ✅ |
| KnowledgeGraphService | `_services/knowledge-graph-service.ts` | 4. Knowledge Graph | ❌ |
| ChatService | `_services/chat-service.ts` | 5. Chat temps réel | ✅ |
| PaymentService | `_services/payment-service.ts` | 6. Paiement | ✅ |
| AliasService | `_services/alias-service.ts` | Cross-cutting | ✅ |

---

## Middleware (src/operations/_middleware/)

Design.md lignes 611-614.

| Middleware | Fichier | Statut |
|-----------|---------|--------|
| with-region-filter | `_middleware/with-region-filter.middleware.ts` | ❌ |
| with-active-profile | `_middleware/with-active-profile.middleware.ts` | ❌ (existe comme `with-profile.middleware.ts` — renommer) |
| with-pro-quota | `_middleware/with-pro-quota.middleware.ts` | ✅ |

---

## Operations par domaine

Design.md lignes 616-711. Statut de chaque opération listée dans le design.

### users/ (R1, R36, R38-R40)

Design.md lignes 616-624.

| Opération | Fichier | Type | R | Statut |
|-----------|---------|------|---|--------|
| users.register | `users/register.operation.ts` | mutate, public | R1 | ❌ |
| users.verify-email | `users/verify-email.operation.ts` | mutate, public | R1 | ❌ |
| users.generate-link-code | `users/generate-link-code.operation.ts` | mutate, auth | R1.3 | ❌ (existe dans `auth/`) |
| users.set-language | `users/set-language.operation.ts` | mutate, auth | R39.2 | ❌ (existe dans `profiles/`) |
| users.set-region | `users/set-region.operation.ts` | mutate, auth | R40.1 | ❌ |
| users.consent-record | `users/consent-record.operation.ts` | mutate, auth | R1.5, R38.4 | ❌ (existe comme `profiles/set-consent`) |
| users.data-export | `users/data-export.action.ts` | action, auth | R36.5 | ❌ |
| users.data-delete | `users/data-delete.action.ts` | action, auth | R36.4 | ❌ |

### profiles/ (R3, R4)

Design.md lignes 626-630.

| Opération | Fichier | Type | R | Statut |
|-----------|---------|------|---|--------|
| profiles.upsert | `profiles/upsert.operation.ts` | mutate, auth | R3, R4 | ❌ (existe comme `update.operation.ts` — renommer) |
| profiles.upload-photo | `profiles/upload-photo.action.ts` | action, auth | R4.4 | ✅ |
| profiles.set-type | `profiles/set-type.operation.ts` | mutate, auth | R3.4 | ✅ |
| profiles.get-by-id | `profiles/get-by-id.operation.ts` | query, auth | — | ❌ (existe comme `get.operation.ts` — renommer) |

### services/ (R5, R8, R20)

Design.md lignes 632-637.

| Opération | Fichier | Type | R | Statut |
|-----------|---------|------|---|--------|
| services.create | `services/create.operation.ts` | mutate, auth | R5.1 | ✅ |
| services.update | `services/update.operation.ts` | mutate, auth | R5.1 | ✅ |
| services.deactivate | `services/deactivate.operation.ts` | mutate, auth | R5.3 | ❌ (existe comme `toggle.operation.ts` — renommer) |
| services.list-mine | `services/list-mine.operation.ts` | query, auth | R8.2 | ✅ |
| services.search | `services/search.search.ts` | defineSearchIndex | R20 | ✅ |

### matching/ (R6, R14-R15, R24)

Design.md lignes 639-646.

| Opération | Fichier | Type | R | Statut |
|-----------|---------|------|---|--------|
| matching.create-request | `matching/create-request.operation.ts` | mutate, auth | R6.3, R15.3, R24.1 | ❌ (existe comme `matches/create` — renommer) |
| matching.accept-request | `matching/accept-request.operation.ts` | mutate, auth | R6.4, R24.2 | ❌ (existe comme `matches/accept` — renommer) |
| matching.refuse-request | `matching/refuse-request.operation.ts` | mutate, auth | R24.3 | ❌ (existe comme `matches/refuse` — renommer) |
| matching.cancel-request | `matching/cancel-request.operation.ts` | mutate, auth | R6.3 | ❌ (existe comme `matches/cancel` — renommer) |
| matching.list-mine | `matching/list-mine.operation.ts` | query, auth | R6.1, R8 | ❌ (existe split incoming/outgoing — fusionner) |
| matching.orchestrator | `matching/orchestrator.action.ts` | action, internal | D24 | ❌ |
| matching.orchestrator-cache | `matching/orchestrator-cache.db-read.ts` | db-read | — | ❌ |

### conversations/ (R8, R26-R27)

Design.md lignes 648-654.

| Opération | Fichier | Type | R | Statut |
|-----------|---------|------|---|--------|
| conversations.list-mine | `conversations/list-mine.operation.ts` | query, auth | R8.1 | ❌ (existe comme `chat/list-conversations`) |
| conversations.get-by-id | `conversations/get-by-id.operation.ts` | query, auth | R8.2 | ❌ |
| conversations.send-message | `conversations/send-message.operation.ts` | mutate, auth | R26.3, R27 | ❌ (existe comme `chat/send-message` — renommer) |
| conversations.mark-read | `conversations/mark-read.operation.ts` | mutate, auth | — | ❌ (existe comme `chat/mark-read`) |
| conversations.close | `conversations/close.operation.ts` | mutate, auth | R8.4 | ❌ |
| conversations.messages-paginated | `conversations/messages-paginated.db-read.ts` | db-read | R8.2 | ❌ (existe comme `chat/list-messages`) |

### ratings/ (R7)

Design.md lignes 656-658.

| Opération | Fichier | Type | R | Statut |
|-----------|---------|------|---|--------|
| ratings.submit | `ratings/submit.operation.ts` | mutate, auth | R7.1, R7.5 | ❌ (existe comme `ratings/create`) |
| ratings.stats-by-user | `ratings/stats-by-user.db-read.ts` | db-read | R7.2 | ❌ (existe comme `ratings/list-for-user`) |

### disputes/ (R9-R10)

Design.md lignes 660-664.

| Opération | Fichier | Type | R | Statut |
|-----------|---------|------|---|--------|
| disputes.report | `disputes/report.operation.ts` | mutate, auth | R9.1 | ❌ (existe comme `disputes/create`) |
| disputes.list-pending | `disputes/list-pending.operation.ts` | query, admin | R10.2 | ❌ |
| disputes.resolve | `disputes/resolve.operation.ts` | mutate, admin | R9.3 | ✅ |
| disputes.snapshot-builder | `disputes/snapshot-builder.action.ts` | action, internal | R9.1 | ❌ |

### admin/ (R10)

Design.md lignes 666-670.

| Opération | Fichier | Type | R | Statut |
|-----------|---------|------|---|--------|
| admin.suspend-user | `admin/suspend-user.operation.ts` | mutate, admin | R9.6 | ✅ |
| admin.unsuspend-user | `admin/unsuspend-user.operation.ts` | mutate, admin | R10.3 | ✅ |
| admin.metrics-business | `admin/metrics-business.operation.ts` | query, admin | R10.4 | ❌ |
| admin.metrics-ai | `admin/metrics-ai.operation.ts` | query, admin | R10.5, R42 | ❌ |

### payments/ (R28-R34)

Design.md lignes 672-677.

| Opération | Fichier | Type | R | Statut |
|-----------|---------|------|---|--------|
| payments.initiate-badge | `payments/initiate-badge.action.ts` | action, auth | R31.1 | ❌ |
| payments.initiate-boost | `payments/initiate-boost.action.ts` | action, auth | R31.2 | ❌ |
| payments.initiate-pro | `payments/initiate-pro.action.ts` | action, auth | R31.3 | ❌ |
| payments.refund | `payments/refund.action.ts` | action, admin | R32.5, R33.5 | ❌ |
| payments.list-history | `payments/list-history.operation.ts` | query, auth | — | ❌ (existe comme `payments/get-status`) |

### subscriptions/ (R34)

Design.md lignes 679-682.

| Opération | Fichier | Type | R | Statut |
|-----------|---------|------|---|--------|
| subscriptions.status | `subscriptions/status.operation.ts` | query, auth | — | ❌ |
| subscriptions.cancel | `subscriptions/cancel.operation.ts` | mutate, auth | R34.4 | ❌ |
| subscriptions.renew-charge | `subscriptions/renew-charge.cron.ts` | cron | R34.2 | ❌ |

### notifications/ (R6, R9, R16)

Design.md lignes 684-693.

| Notification | Fichier | R | Statut |
|-------------|---------|---|--------|
| match-request | `notifications/match-request.notification.ts` | R6.2, R16 | ✅ |
| match-accepted | `notifications/match-accepted.notification.ts` | R6.4, R16.2 | ✅ |
| match-refused | `notifications/match-refused.notification.ts` | R16.2 | ✅ |
| new-message | `notifications/new-message.notification.ts` | R16.1 | ✅ |
| payment-success | `notifications/payment-success.notification.ts` | R16.3, R31 | ✅ |
| warning | `notifications/warning.notification.ts` | R9.4 | ❌ |
| suspension | `notifications/suspension.notification.ts` | R9.5 | ❌ |

### graph/ (R17-R23)

Design.md lignes 695-701.

| Opération | Fichier | Type | R | Statut |
|-----------|---------|------|---|--------|
| graph.upsert-entity | `graph/upsert-entity.operation.ts` | mutate, internal | R17, R18 | ❌ |
| graph.upsert-relation | `graph/upsert-relation.operation.ts` | mutate, internal | R17.2 | ❌ |
| graph.regenerate-embedding | `graph/regenerate-embedding.action.ts` | action, internal | R22.2 | ❌ |
| graph.traverse | `graph/traverse.db-read.ts` | db-read | R19.2 | ❌ |
| graph.search-vector | `graph/search-vector.action.ts` | action, internal | R20.1 | ❌ |
| graph.refresh-views | `graph/refresh-views.cron.ts` | cron | — | ❌ |

### webhooks/

Design.md lignes 703-706.

| Webhook | Fichier | Type | R | Statut |
|---------|---------|------|---|--------|
| webhook whatsapp | `webhooks/whatsapp.http.ts` | defineHttpAction POST | R29 | ✅ (existe comme `.http`) |
| webhook fapshi | `webhooks/fapshi.http.ts` | defineHttpAction POST | R29 | ✅ (existe comme `.http`) |
| webhook flutterwave | `webhooks/flutterwave.http.ts` | defineHttpAction POST | — | ❌ |

### ai/ (R11-R16)

Design.md lignes 708+.

| Fichier | R | Statut |
|---------|---|--------|
| `ai/agent-user.agent.ts` (Graphe_Agent_User) | R11-R16 | ❌ (existe comme `agents/whatsapp-bot.agent` — renommer) |
| `ai/orchestrator-matching.workflow.ts` | D24 | ❌ |
| `ai/persona-prompts.ts` | R11 | ❌ |

---

## Phases d'implémentation

Basées sur les écarts design.md vs code actuel.

### Phase A — Renommage pour conformité design.md

Corriger tous les noms de fichiers/opérations pour coller à l'inventaire design.md.

| Action | De → Vers | Impact |
|--------|----------|--------|
| Renommer | `chat/` → `conversations/` | 5 fichiers |
| Renommer | `matches/` → `matching/` | 7 fichiers |
| Renommer | `auth/` ops → `users/` | 3 fichiers |
| Renommer | `profiles/update` → `profiles/upsert` | + registry |
| Renommer | `profiles/get` → `profiles/get-by-id` | + registry |
| Renommer | `services/toggle` → `services/deactivate` | + registry |
| Renommer | `with-profile.middleware` → `with-active-profile.middleware` | + registry |
| Renommer | `agents/whatsapp-bot.agent` → `ai/agent-user.agent` | + registry |
| Fusionner | `matches/list-incoming` + `matches/list-outgoing` → `matching/list-mine` | |
| Déplacer | `auth/generate-link-code` → `users/generate-link-code` | |
| Déplacer | `profiles/set-language` → `users/set-language` | |
| Déplacer | `profiles/set-consent` → `users/consent-record` | |

### Phase B — Ops manquantes design.md

Créer les opérations listées dans le design mais absentes du code.

| Domaine | Ops à créer |
|---------|-------------|
| users/ | register, verify-email, set-region, data-export, data-delete |
| conversations/ | get-by-id, close, messages-paginated |
| matching/ | orchestrator, orchestrator-cache |
| disputes/ | report, list-pending, snapshot-builder |
| admin/ | metrics-business, metrics-ai |
| payments/ | initiate-badge, initiate-boost, initiate-pro, refund |
| subscriptions/ | status, cancel, renew-charge |
| notifications/ | warning, suspension |
| graph/ | upsert-entity, upsert-relation, regenerate-embedding, traverse, search-vector, refresh-views |

### Phase C — Services manquants

| Service | Priorité |
|---------|----------|
| KnowledgeGraphService | Haute (Couche 4) |
| ObservabilityService | Basse (Couche 7) |

---

## Ordre d'exécution recommandé

```
Phase A ─── Renommage conformité design.md ─── 1 jour
     │
Phase B ─── Ops manquantes ─── 2 semaines
     │
Phase C ─── KnowledgeGraphService + Graph RAG ─── 2 semaines
     │
Phase D ─── Admin/Modération + Paiements ─── 2 semaines
     │
Phase E ─── Qualité/Déploiement ─── 1 semaine
```
