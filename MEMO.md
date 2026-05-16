# Mémo Réinitialisation — Contexte Complet

## 🎯 Le Projet

Plateforme de mise en relation WhatsApp (Orya) construite sur framework **Aura** (TanStack Start + Hono + Prisma + PostgreSQL/pgvector + WebSocket broadcast). Deux surfaces : dashboard web + bot WhatsApp avec agent IA par utilisateur, knowledge graph, matching par fusion graphe + vecteur (RRF).

## 📚 Documentation de Référence

| Quoi | Où |
|------|-----|
| Aura requirements | `.kiro/specs/aura-hono-tanstack-migration/requirements.md` |
| Aura design | `.kiro/specs/aura-hono-tanstack-migration/design.md` |
| Aura analysis (corrigé) | `.kiro/specs/aura-hono-tanstack-migration/analysis.md` |
| WhatsApp requirements | `.kiro/specs/whatsapp-ai-matchmaking-platform/requirements.md` |
| WhatsApp design | `.kiro/specs/whatsapp-ai-matchmaking-platform/design.md` |
| Plan implémentation | `.kiro/specs/whatsapp-ai-matchmaking-platform/tasks.md` |
| Docs Aura | `docs/*.md` |
| AGENTS.md (workflow) | `AGENTS.md` |

## 🔴 Erreurs Que J'ai Commises

1. **Analysis biaisée** — J'ai dit que des features n'existaient pas sans vérifier (`AuraStoredFile`, `ctx.invalidate`, `api.ts` codegen, `defineSearchIndex`, `defineVectorIndex`, `defineComponent`, `ctx.scheduler`, `ctx.storage.store/getUrl`). **Toujours vérifier le code avant d'écrire.**

2. **Mauvaises imports `@/_services/`** — J'ai utilisé `@/_services/mon-service` au lieu de `@/operations/_services/mon-service`. L'alias `@/operations` est le bon.

3. **Pattern notification** — J'ai créé `src/lib/notifications/send.ts` manuellement au lieu d'utiliser `defineNotificationFn` d'Aura. **Utiliser `defineNotificationFn("name").payload(z).handler(fn)`** et dispatcher via `ctx.notify.via("name").send(payload)`.

4. **Pattern action() cassé** — Les 3 operations en `.action()` utilisaient `ctx.db.*` et auraient crashé (le runner remplace `ctx.db` par un Proxy tombstoné pour les actions). **Solution :** `.mutate()` + service.

5. **Dev/chat widget mal conçu** — J'ai fait des tabs/sélecteur de contact. L'utilisateur voulait une **sidebar contacts type WhatsApp Web** avec création de faux comptes, discussion avec Orya, et compréhension du flux batch (pas 1 message = 1 réponse).

6. **Skip reading created files** — J'ai écrit des fichiers sans les relire ensuite. **Toujours relire après création/modification.**

## ✅ Ce Qui a Été Fait (Commits)

### Commit 1 — `18eb26e` "feat(phase1): WhatsApp link code, alias FR/EN..."
- Schema Prisma : `linkCode`, `linkCodeExpiresAt` sur `AuraPhoneIdentity` ; `whatsappLinked`, `whatsappE164` sur `AuraUser`
- `auth/generate-link-code.operation.ts`, `auth/link-whatsapp.operation.ts`
- `process-incoming.operation.ts` : détection code de liaison, blocage non-liés
- `alias.ts` : générateur FR/EN
- `lib/whatsapp/aggregator.ts` : agrégation 60s
- `lib/i18n/detect.ts`, `translations.ts`
- Notifications branchées dans match create/accept/refuse et chat send-message

### Commit 2 — `51bad52` "feat(dev): WhatsApp chat simulator widget..."
- `agent/chat-dev.operation.ts`
- `routes/dev/chat.tsx` (première version tabs)

### Commit 3 — `de6e568` "refactor(notifications): use defineNotificationFn..."

### Commit 4 — `c082e14` "feat(aura): add AuraService base class + AliasService"
- `src/aura/server/service.ts` + `service.test.ts`
- `_services/alias-service.ts` + test
- Tests notifications

### Commit 5 — `4c71181` "feat(services): InboxService + AliasService tests"
- `_services/inbox-service.ts` + test
- Refactor `process-incoming.operation.ts` → utilise InboxService

### Commit 6 — `1ce40dc` "feat(services): MatchingService, PaymentService, ChatService..."
- `_services/matching-service.ts` (keyword scoring + diversity 60/30/10)
- `_services/payment-service.ts` (Fapshi)
- `_services/chat-service.ts` (AuraError)
- Fix matching/run, start-checkout → `.mutate()` + service
- `new-message.notification.ts`, `payment-success.notification.ts`
- dev/chat route update

### Commit 7 — `320f1b3` "docs: update AGENTS.md, operations.md, folder-conventions.md"

## 📁 Fichiers Clés Modifiés/Créés

```
src/aura/server/service.ts              ← AuraService base class
src/aura/server/service.test.ts
src/operations/_services/               ← Tous les services
  ├── inbox-service.ts + test
  ├── alias-service.ts + test
  ├── matching-service.ts
  ├── chat-service.ts
  └── payment-service.ts
src/operations/notifications/           ← Notifications
  ├── match-request.notification.ts
  ├── match-accepted.notification.ts
  ├── match-refused.notification.ts
  ├── new-message.notification.ts
  └── payment-success.notification.ts
src/operations/_registry.ts              ← Side-effect imports notifs
src/operations/agent/
  ├── process-incoming.operation.ts      ← Refactored → InboxService
  └── chat-dev.operation.ts
src/operations/matches/
  ├── create.operation.ts                ← ctx.notify.via()
  ├── accept.operation.ts
  └── refuse.operation.ts
src/operations/chat/
  └── send-message.operation.ts
src/operations/matching/
  └── run.operation.ts                   ← Fix .mutate() + MatchingService
src/operations/payments/
  └── start-checkout.operation.ts        ← Fix .mutate() + PaymentService
prisma/schema.prisma                     ← Nouveaux champs linkCode etc.
```

## 🎯 Patterns Aura à Utiliser

### Opération = Thin Handler
```ts
export default defineOperationFn("x")
  .mutate()
  .input(z.object({...}))
  .entities(["Entity"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new MonService(ctx);  // ctx passé au constructeur
    return svc.method(input);          // plus de ctx dans la logique
  });
```

### Service = Logique Métier
```ts
export class MonService extends AuraService {
  async method(input: Input) {
    const data = await this.db.model.findUnique({ where: { id: input.id } });
    if (!data) throw new AuraError("NOT_FOUND", "Introuvable.");
    return this.db.model.create({ data: input });
  }
}
```

### Notification
```ts
export default defineNotificationFn("nom")
  .payload(z.object({ phoneE164: z.string() }))
  .handler(async ({ payload }) => {
    const gateway = whatsAppGateway();
    await gateway.sendText(payload.phoneE164, "Message", `id-${Date.now()}`);
  });
// Dispatch :
ctx.notify.via("nom").send(payload).catch(() => {});
```

### Erreurs
```ts
throw new AuraError("CODE", "Message");  // Client voit l'erreur
ctx.log.error("detail", { extra });      // Dev seulement
```
**Jamais** `throw new Error("message")` — ça donne un 500 sans message clair.

## 📋 Plan d'Implémentation Restant

Voir `.kiro/specs/whatsapp-ai-matchmaking-platform/tasks.md` (9 phases). Priorité :
1. `_services/auth-service.ts` (R1 auth téléphone)
2. `_services/profile-service.ts` (R3-R4 profil)
3. UserAgentService + agent IA par utilisateur (Phase 3)
4. WebSocket rooms pour chat temps réel (Phase 4)
5. KnowledgeGraphService + CTE traversal (Phase 5)
6. Admin/Observability (Phase 6-7)
7. Tests E2E, déploiement (Phase 8)

## 🔧 Commandes

```bash
bun run test              # Lancer les tests (vitest)
bun run dev               # Lancer le serveur de dev
bun src/aura/cli/cron.ts  # Lancer le worker cron
```
