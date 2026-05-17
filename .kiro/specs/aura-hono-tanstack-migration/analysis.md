# Deep Analysis: Aura Core vs Specs (CORRECTED)

## Méthodologie

Analyse croisée de chaque requirement (R1-R31) et design decision (D1-D25) avec le code existant.

---

## Partie 1 : Requirements vs Code

### R1 — Hono HTTP runtime ✅ OK
Routes bridge, internal, files, health montées sur Hono. Testé.

### R2 — TanStack Start ✅ OK
`callAuraServer` in-process. `<AuraHydration>`, `<AuraClientProvider>`. `nuqs` adapter.

### R3 — Prisma ✅ OK
Prisma 7 avec `@prisma/adapter-pg`. Singleton `db.ts`.

### R4 — DB-optimized reads ✅ OK
`defineDbReadFn` existe dans `src/aura/server/db-read.ts`.

### R5 — Operation contract ✅ OK
Builder complet, envelope shape, manifest-driven invalidation.

### R6 — Auth subsystem ⚠️ BUG
**Problème**: `src/aura/server/auth/operations.ts:38-50` — `userSafe()` référence des champs qui n'existent PAS dans le modèle Prisma `AuraUser`:
- `businessName`, `countryId`, `currencyCode`, `onboardingCompleted`, `whatsappChallenge`, `hadWhatsapp`

Ces opérations auth (register, login, etc.) vont crasher à l'exécution avec `PrismaClientValidationError`.

**Fix**: Migrer le schema Prisma pour ajouter ces champs, OU corriger `userSafe()` pour ne référencer que les champs existants.

### R7 — CSRF ✅ OK
HMAC token, constant-time comparison. Bridge route.

### R8 — Rate limiting ✅ OK
DB-backed + in-memory.

### R9 — File storage ✅ OK
Filesystem + S3 drivers. `/files/*` route.

### R10 — Broadcast invalidation ✅ OK
HMAC POST, WS leader election, BroadcastChannel, dedup.

### R11 — Cron and outbox ✅ OK
`defineCronFn`, `processOutboxEvents`, CLI.

### R12 — Build/dev ✅ OK
Vite, `server-only` plugin.

### R13 — Performance/SSR ✅ OK
Streaming SSR, `cache()` dedup, manifest pre-injection.

### R14 — Type safety ✅ OK
`InferOperationInput/Output`, Zod → `AuraError`.

### R15 — Migration strategy ✅ OK (legacy Next.js preserved)

### R16 — Action primitive ⚠️ 3 OPÉRATIONS VONT CRASHER
L'implémentation du Proxy tombstoné pour `.action()` est correcte (runner.ts:144-155).
MAIS 3 actions utilisent `ctx.db.*` directement et vont crasher :
1. `agent/process-incoming.operation.ts` — 8 accès `ctx.db.*`
2. `matching/run.operation.ts` — 2 accès `ctx.db.*`
3. `payments/start-checkout.operation.ts` — 1 accès `ctx.db.*`

**Cause**: Le pattern `.action()` est contre-intuitif.

### R17 — Typed function references ✅ OK
`ctx.runQuery/runMutation/runAction` acceptent `OperationRef | string`. Le `api` object est auto-généré dans `src/aura/_generated/api.ts` (87 lignes). **Reste**: `.asTool()` n'existe pas sur `OperationRef`.

### R18 — Scheduler ✅ OK
`createAuraScheduler()` existe dans `scheduler.ts`, branché dans `create-context.ts:175`. `ctx.scheduler.runAfter/runAt/cancel` sont disponibles.

### R19 — Query read-only ✅ OK
Proxy `createReadOnlyDb`.

### R20 — Middleware ✅ OK
`.use()` + `defineCommonFn`.

### R21 — HTTP actions ✅ OK
`defineHttpAction`. Webhooks: whatsapp, fapshi.

### R22 — Entity invalidation enhanced ✅ OK
`ctx.invalidate({entity, id})` existe dans create-context.ts:192-201.
`invalidatedEntities` est mergé avec les entités statiques dans runner.ts:92.

### R23 — File storage integration ✅ OK
`ctx.storage.store/getUrl/removeStoredFile` implémentés dans `storage/index.ts:156-176`.
Backed by `AuraStoredFile` Prisma model (schema.prisma:227).
`createAuraStorage()` est branché dans `create-context.ts`.

### R24 — Typed client API ✅ OK
`api.ts` auto-généré dans `src/aura/_generated/api.ts`.

### R25 — Cursor pagination ✅ OK
`ctx.paginate()` avec HMAC cursor.

### R26 — Full-text search ⚠️ PARTIEL
**OK**: `defineSearchIndex` existe dans `src/aura/server/search.ts:27`.
**OK**: `search()` fonction standalone existe.
**MANQUE**: `ctx.db.search()` n'est PAS branché (pas dans create-context.ts). Il faut importer `search()` manuellement.

### R27 — Vector search ⚠️ PARTIEL
**OK**: `defineVectorIndex` existe dans `src/aura/server/vector.ts:22`.
**MANQUE**: `ctx.db.vectorSearch()` n'est PAS branché.

### R28 — Aura Components ✅ OK
`defineComponent` existe dans `src/aura/core/component.ts:43`.

### R29 — Durable workflows ⚠️ API INCOHÉRENTE
`defineWorkflow("name")` existe, mais l'API réelle est `.handler(fn)` — pas de `.input(z).handler(fn)` comme décrit dans le design doc. Pas de validation Zod pour l'input.

### R30 — Realtime subscriptions ❌ MANQUANT
Auto-tracking entity tags non implémenté. Pas de Proxy Prisma pour détecter les tables lues/écrites.

### R31 — AI Agent framework ⚠️ 2 BUGS
**BUG 1**: `operationAsTool` (agent.ts:122-141) crée un contexte frais via `createAuraContext({ source: "internal" })` — perte de la session/user. Les calls `.auth()` depuis un outil LLM throw `UNAUTHORIZED`.

**BUG 2**: `streamText` broadcast les deltas via `publishInvalidation` avec des keys `__agent_stream:` — pas de vrai room-based pub/sub.

**MANQUE**: `.asTool()` sur `OperationRef` — la méthode n'existe pas (juste un commentaire dans agent.ts:121).

---

## Partie 2 : BILAN PAR SÉVÉRITÉ

| Sévérité | Problème | Fichiers |
|----------|----------|----------|
| 🔴 CRITIQUE | 3 actions utilisent `ctx.db.*` → crash | `process-incoming`, `matching/run`, `start-checkout` |
| 🔴 CRITIQUE | Auth ops référence champs inexistants | `src/aura/server/auth/operations.ts:38-50` |
| 🟡 MAJEUR | `operationAsTool` perd le contexte (session/user) | `src/aura/server/ai/agent.ts:131-138` |
| 🟡 MAJEUR | `.asTool()` sur OperationRef inexistante | Aucune méthode `asTool` |
| 🟢 MINEUR | `ctx.db.search/vectorSearch` non branchés | Pas dans create-context.ts |
| 🟢 MINEUR | `defineWorkflow` API sans `.input(z)` | `workflow.ts` |
| 🟢 MINEUR | Agent streaming via hack `__agent_stream:` | `agent.ts:332-340` |
| ⬜ AMÉLIORATION | Pas de service OOP (`AuraService`) | Nouvelle feature |

## Partie 3 : Proposition AuraService

Une classe `AuraService` qui encapsule `AuraContext` et expose toutes ses capacités via `this.*` :

```ts
import { AuraContext } from "@/aura/server/context";

export class AuraService {
  protected ctx: AuraContext;
  constructor(ctx: AuraContext) { this.ctx = ctx; }

  get db() { return this.ctx.db; }
  get user() { return this.ctx.user; }
  get session() { return this.ctx.session; }
  get agent() { return this.ctx.agent; }
  get scheduler() { return this.ctx.scheduler; }
  get storage() { return this.ctx.storage; }
  get log() { return this.ctx.log; }
  get audit() { return this.ctx.audit; }
  get notify() { return this.ctx.notify; }
  get bump() { return this.ctx.bump; }

  runQuery(ref: any, input: any) { return this.ctx.runQuery(ref, input); }
  runMutation(ref: any, input: any) { return this.ctx.runMutation(ref, input); }
  runAction(ref: any, input: any) { return this.ctx.runAction(ref, input); }
  invalidate(target: { entity: string; id?: string }) { this.ctx.invalidate(target); }
  paginate(model: any, opts: any) { return this.ctx.paginate(model, opts); }
}
```

**Bénéfices :**
- **Les 3 actions crashent plus** — on passe en `.mutate()` et on met la logique dans le service
- **`operationAsTool` fixé** — le service est instancié avec `ctx`, les outils LLM l'utilisent
- **Testable** — `AuraService` peut être mocké
- **DX préservée** — `new MonService(ctx).method(input)` dans le handler

