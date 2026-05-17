# Proposition de Refonte Aura — Architecture OOP & Services

## 1. Problèmes identifiés

### 1.1 Action operations qui utilisent `ctx.db.*` (crash à runtime)

3 operations en `.action()` accèdent directement à la BDD via `ctx.db.*` alors que le runner remplace `ctx.db` par un Proxy tombstone qui throw `"Direct DB access is forbidden in actions"`.

**Fichiers**: `process-incoming.operation.ts`, `matching/run.operation.ts`, `payments/start-checkout.operation.ts`

**Cause racine**: Les développeurs ne savent pas quel type d'operation choisir. Une operation qui fait à la fois BDD + side effects (WhatsApp, HTTP, etc.) n'a pas de type adapté — `.mutate()` interdit les side effects, `.action()` interdit la BDD directe.

### 1.2 `operationAsTool` crée un contexte frais sans session/user

```ts
// agent.ts — operationAsTool
const { createAuraContext } = await import("../create-context");
const ctx = await createAuraContext({ source: "internal" });
return op.execute({ ctx, input, params: undefined, req: undefined });
```

Le contexte créé n'a pas de `session` ni `user`. Toute operation `.auth()` appelée depuis un outil LLM throw `UNAUTHORIZED`. **Pas de contexte de l'appelant**.

### 1.3 `ctx` passé manuellement partout

Chaque handler recoit `ctx` en paramètre et doit le propager à chaque appel :
```ts
await ctx.runQuery(api.orders.getById, { id })
await ctx.runMutation(api.orders.cancel, { id })
```

Si un helper/utilitaire a besoin de `ctx`, il doit le recevoir en paramètre explicite. Pas de DI, pas de scope implicite.

### 1.4 Pas de séparation claire entre la couche "transport" et la couche "métier"

Les operations mélangent :
- Validation (Zod input)
- Logique métier (recherche, matching, notifications)
- Accès BDD (Prisma)
- Side effects (WhatsApp, HTTP)

```ts
// process-incoming.operation.ts — 4 responsabilités dans 1 handler
const inbox = await ctx.db.whatsappInbox.findUnique(...)  // DB
await gateway.sendText(...)                                  // Side effect
const thread = await ctx.agent.createThread(...)          // AI
await ctx.db.whatsappInbox.update(...)                      // DB
```

---

## 2. Proposition : Architecture OOP à 3 couches

```
┌─────────────────────────────────────────────────────────┐
│  Couche Transport (Operations Aura)                     │
│  - Reçoit la requête (HTTP, WS, cron, etc.)             │
│  - Valide l'input (Zod)                                 │
│  - Vérifie les accès (auth, rate-limit)                 │
│  - Délègue aux Services                                 │
│  - Formate la réponse                                   │
│  = defineOperationFn / defineHttpAction / defineWS      │
├─────────────────────────────────────────────────────────┤
│  Couche Métier (Services)                               │
│  - Logique métier pure                                  │
│  - Orchestre les appels BDD + side effects              │
│  - S'exécute dans un ContextScope automatique           │
│  - Injectable, testable sans ctx                        │
│  = class PaiementService, MatchingService, etc.         │
├─────────────────────────────────────────────────────────┤
│  Couche Infrastructure (Repositories, Gateways)         │
│  - Accès BDD (Prisma)                                   │
│  - Appels externes (WhatsApp, Fapshi, LLM)              │
│  - Pas de logique métier                                │
│  = class UserRepository, WhatsAppGateway, etc.          │
└─────────────────────────────────────────────────────────┘
```

### 2.1 ContextScope — Injection automatique du contexte

Au lieu de passer `ctx` manuellement, on utilise un **ContextScope** qui propage automatiquement le contexte courant via `AsyncLocalStorage` :

```ts
// src/aura/server/context-scope.ts
import { AsyncLocalStorage } from "node:async_hooks";

export const auraContextStorage = new AsyncLocalStorage<AuraContext>();

export function getCurrentContext(): AuraContext {
  const ctx = auraContextStorage.getStore();
  if (!ctx) throw new AuraError("INTERNAL_ERROR", "No active Aura context");
  return ctx;
}
```

Le runner wrappe chaque execution d'operation dans un scope :

```ts
// Dans runner.ts — avant d'appeler operation.execute()
const data = await auraContextStorage.run(ctx, () => operation.execute({ ctx, input, params, req }));
```

Ainsi, n'importe quel Service ou Repository peut récupérer le contexte courant sans le recevoir en paramètre :

```ts
class UserRepository {
  async findById(id: string) {
    const ctx = getCurrentContext();
    return ctx.db.user.findUnique({ where: { id } });
  }
}
```

### 2.2 Services — Logique métier sans dépendance directe à ctx

```ts
// src/lib/services/payment-service.ts
export class PaymentService {
  constructor(
    private repo: PaymentRepository,
    private waGateway: WhatsAppGateway,
  ) {}

  async initiateCheckout(userId: string, kind: "boost" | "badge" | "pro") {
    const ctx = getCurrentContext(); // Récupéré automatiquement
    const pricing = this.getPricing(kind);
    
    const payment = await this.repo.create(userId, kind, pricing.amount);
    
    // Appel externe via Gateway
    const result = await this.waGateway.sendText(
      ctx.user.whatsappE164!,
      `Paiement de ${pricing.amount} FCFA initié.`,
      `payment-${payment.id}`,
    );
    
    return payment;
  }

  private getPricing(kind: string) { ... }
}
```

### 2.3 L'opération devient une fine couche de transport

```ts
// src/operations/payments/start-checkout.operation.ts
const paymentService = new PaymentService(
  new PaymentRepository(),
  whatsAppGateway(),
);

export default defineOperationFn("payments.start-checkout")
  .mutate() // ou .action() — plus besoin de compromis
  .input(z.object({ kind: z.enum(["boost", "badge", "pro"]) }))
  .entities(["Payment"])
  .auth()
  .handler(async ({ ctx, input }) => {
    // L'operation ne fait que valider et déléguer
    return paymentService.initiateCheckout(ctx.user.id, input.kind);
  });
```

### 2.4 Repository — Abstraction BDD sans Prisma leak

```ts
// src/lib/repositories/payment-repository.ts
export class PaymentRepository {
  async create(userId: string, kind: string, amount: number) {
    const ctx = getCurrentContext();
    return ctx.db.payment.create({
      data: { userId, kind, amountXaf: amount, status: "PENDING" },
    });
  }
}
```

### 2.5 Agent tools avec contexte automatique

```ts
// operationAsTool utilise le ContextScope
export function operationAsTool(ref: OperationRef, opts: { description: string }) {
  return {
    name: ref._name,
    description: opts.description,
    parameters: z.record(z.unknown()),
    async execute(input: unknown) {
      const ctx = getCurrentContext(); // Récupère le contexte de l'appelant!
      const op = getOperation(ref._name);
      return op.execute({ ctx, input, params: undefined, req: undefined });
    },
  };
}
```

Plus besoin de créer un contexte frais — on utilise celui du thread LLM appelant.

### 2.6 Plus de `action` vs `mutate` — Un seul type `operation`

Le problème `action` vs `mutate` disparaît car :
- L'operation ne fait que valider et déléguer au Service
- Le Service a accès à `ctx` via `getCurrentContext()`
- Le Service peut faire BDD + side effects sans restriction
- Le runner utilise `.mutate()` par défaut (full accès)

```ts
export default defineOperationFn("agent.process-incoming")
  .mutate() // Plus de .action() problématique
  .input(z.object({ whatsappInboxId: z.string() }))
  .internal()
  .handler(async ({ ctx, input }) => {
    await inboxService.processIncoming(input.whatsappInboxId);
  });
```

---

## 3. Plan d'implémentation

### Phase 0 : ContextScope + getCurrentContext()

- Créer `src/aura/server/context-scope.ts` avec `AsyncLocalStorage`
- Ajouter `auraContextStorage.run(ctx, ...)` dans `runner.ts` autour de `operation.execute()`
- Ajouter dans `create-context.ts` et `http-action.ts`

### Phase 1 : Migrer les 3 operations critiques

1. `process-incoming.operation.ts` — `.mutate()` + Service InboxService
2. `matching/run.operation.ts` — `.mutate()` + Service MatchingService  
3. `payments/start-checkout.operation.ts` — `.mutate()` + Service PaymentService

### Phase 2 : Repository pattern

- Créer `src/lib/repositories/` avec UserRepository, MatchRepository, MessageRepository, etc.
- Extraire les appels Prisma des operations vers les repositories

### Phase 3 : Service pattern

- Créer `src/lib/services/` avec les services métier
- Les operations deviennent des thin handlers qui valident + déléguent

### Phase 4 : Fix operationAsTool

- Remplacer `createAuraContext({ source: "internal" })` par `getCurrentContext()`
- Le contexte de l'appelant est propagé aux outils LLM

### Phase 5 : Documentation

- Mettre à jour `docs/operations.md`, `docs/ai-agents.md`, `docs/architecture.md`
- Ajouter `docs/services.md` et `docs/repositories.md`

---

## 4. Bénéfices

| Problème | Solution | Avant | Après |
|----------|----------|-------|-------|
| Action utilise `ctx.db` → crash | Service + ContextScope | `.action()` avec DB interdit | `.mutate()` avec Service qui gère tout |
| Tool LLM sans contexte | `getCurrentContext()` | Contexte frais, pas de session | Contexte de l'appelant, session préservée |
| ctx passé manuellement | ContextScope (AsyncLocalStorage) | `runQuery(ctx, ...)` partout | Appels implicites dans les Services |
| Opérations trop grosses | Séparation Transport/Métier/Infra | 4 responsabilités par handler | Handler = validation + délégation |
| Testabilité faible | Services + Repositories injectables | Tester nécessite un ctx complet | Mocker le Repository, pas de ctx nécessaire |

## 5. Non-breaking

- Les operations existantes continuent de fonctionner (backward compat)
- `ctx.runQuery/runMutation/runAction` restent disponibles
- Les anciens patterns ne sont pas supprimés, juste dépréciés
- Migration progressive : on refait une opération à la fois
