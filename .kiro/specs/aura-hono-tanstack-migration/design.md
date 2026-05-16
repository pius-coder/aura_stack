# Design Document

## Overview

This document describes the technical architecture for migrating the Aura framework from Next.js (App Router) to **Hono + TanStack Start**, while preserving full DX and functional parity. It resolves all open questions from the requirements phase.

### Core Architectural Principle: In-Process Server Calls

The single most important design decision: **TanStack Start server functions and route loaders invoke Aura operations in-process via direct function call — never via HTTP.**

Today, `callAuraServer()` in `call.ts` already works this way: it imports the registry, builds an `AuraContext`, and calls `operation.execute()` directly. The migration preserves this pattern exactly. The Hono HTTP layer (`/aura/*`) exists only for **browser clients** (the bridge transport). Server-side code (loaders, server functions) bypasses HTTP entirely and calls `callAuraServer()` / `runAuraServer()` as a local function import.

```
┌─────────────────────────────────────────────────────────────┐
│  TanStack Start Process (single Bun/Node process)           │
│                                                             │
│  ┌──────────────────┐    ┌──────────────────────────────┐  │
│  │  Hono HTTP Layer │    │  TanStack Start SSR/Loaders  │  │
│  │  /aura/*         │    │  route loaders, server fns   │  │
│  │  /aura-internal/*│    │                              │  │
│  │  /files/*        │    │  callAuraServer() ──────┐    │  │
│  │  /health         │    │  prefetchAuraQuery()    │    │  │
│  └────────┬─────────┘    └─────────────────────────┼────┘  │
│           │                                        │        │
│           ▼                                        ▼        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Aura Core (in-process)                              │  │
│  │  registry → runner → createAuraContext → operation    │  │
│  │  → Prisma → PostgreSQL                               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

This means:
- Zero network latency for server-side queries (loader → DB, no HTTP hop).
- Cookie mutations from `ctx.cookies.set` are applied directly to the TanStack Start response via `setCookie()` / `deleteCookie()` from `vinxi/http` (the underlying server primitives TanStack Start exposes).
- React `cache()` deduplication works identically — multiple `callAuraServer()` calls within the same render share the memoized session and query results.

---

## Design Decisions

### Decision 1: Hono App Factory (`createAuraHonoApp`)

**Resolves:** Requirement 1 (all acceptance criteria)

A single factory function creates the Hono app with all Aura routes mounted:

```typescript
// src/aura/server/hono-app.ts
import { Hono } from "hono";
import { auraBridgeRouter } from "./routes/bridge";
import { auraInternalRouter } from "./routes/internal";
import { auraFilesRouter } from "./routes/files";
import { auraHealthRouter } from "./routes/health";

export function createAuraHonoApp() {
  const app = new Hono();
  app.route("/aura", auraBridgeRouter());
  app.route("/aura-internal", auraInternalRouter());
  app.route("/files", auraFilesRouter());
  app.route("/health", auraHealthRouter());
  return app;
}
```

Each router is a standalone Hono instance. The bridge router handles:
- `POST /aura/:path{.+}` → resolve operation name (path segments joined by `.`), run through `runAuraOperation`, serialize cookies via `c.header("Set-Cookie", ...)`.
- `GET /aura/_manifest` → return `getClientOperationManifest()`.
- `GET /aura/*` (anything else) → 405.

The CSRF middleware is applied to the bridge router only (unsafe methods).

### Decision 2: TanStack Start Integration

**Resolves:** Requirement 2, Requirement 12

TanStack Start uses Hono as its server adapter. The server entry mounts the Aura Hono app **before** TanStack Start's handler:

```typescript
// app.config.ts (TanStack Start config)
import { defineConfig } from "@tanstack/react-start/config";
import { createAuraHonoApp } from "./src/aura/server/hono-app";

export default defineConfig({
  server: {
    preset: "bun", // or "node"
    hooks: {
      "app:created"(app) {
        // Mount Aura routes on the underlying Hono/Nitro app
        const auraApp = createAuraHonoApp();
        app.use("/aura/**", auraApp.fetch);
        app.use("/aura-internal/**", auraApp.fetch);
        app.use("/files/**", auraApp.fetch);
        app.use("/health", auraApp.fetch);
      },
    },
  },
});
```

> **Note:** The exact integration API depends on TanStack Start's server customization surface (Nitro-based or raw Hono). The design accommodates both — if TanStack Start exposes a raw Hono app, we mount directly; if it uses Nitro, we use Nitro's `defineEventHandler` wrapping Hono's `app.fetch`.

### Decision 3: Server-Side Calls Without HTTP (In-Process)

**Resolves:** Requirement 2.3, 2.4, 5.7, 13.2, the user's explicit request

`callAuraServer()` and `runAuraServer()` remain direct function calls. The migration changes only how they obtain the per-request context:

| Concern | Next.js (today) | TanStack Start (target) |
|---------|-----------------|------------------------|
| Get request headers | `await headers()` from `next/headers` | `getRequestHeaders()` from `vinxi/http` or passed explicitly from the loader's `context.request` |
| Write cookies | `(await cookies()).set(...)` from `next/headers` | `setCookie(event, ...)` / `deleteCookie(event, ...)` from `vinxi/http`, or `useServerFn` response headers |
| Invalidate route | `useRouter().refresh()` | `router.invalidate()` from `@tanstack/react-router` |
| React cache() | Works (React 19 `cache()`) | Works identically (React 19 `cache()`) |

The key abstraction: a thin **request context adapter** that `callAuraServer` uses:

```typescript
// src/aura/server/request-context.ts
import { getEvent } from "vinxi/http";

export function getAuraRequestHeaders(): Headers {
  const event = getEvent(); // Nitro/vinxi H3 event
  return new Headers(event.node.req.headers as Record<string, string>);
}

export function applyAuraCookies(mutations: AuraCookieMutation[]): void {
  const event = getEvent();
  for (const m of mutations) {
    if (m.options.maxAge === 0) {
      deleteCookie(event, m.name, m.options);
    } else {
      setCookie(event, m.name, m.value, m.options);
    }
  }
}
```

`callAuraServer` calls `getAuraRequestHeaders()` instead of `await headers()`, and `applyAuraCookies(ctx.cookies.set)` instead of the Next.js cookies store. **No HTTP call is made.**

### Decision 4: DB-Optimized Reads via Prisma Views + Typed Wrapper

**Resolves:** Requirement 4, Open Question 1

**Chosen mechanism: Prisma `view` blocks (primary) + `$queryRaw` with typed wrapper (escape hatch).**

Rationale:
- Prisma's `view` preview feature (stable since Prisma 5.x, fully supported in 7.x) lets you declare a SQL view as a `view` block in `schema.prisma`. It's queried like a model (`db.myView.findMany()`), giving full type safety with zero runtime overhead.
- Views are declared in Prisma migrations via custom SQL (`CREATE OR REPLACE VIEW ...`), so `prisma migrate deploy` provisions them everywhere.
- For cases where a view is insufficient (e.g., parameterized functions), a typed `$queryRaw` wrapper provides the escape hatch.

```typescript
// src/aura/server/db-read.ts
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { AuraError } from "@/aura/core/errors";

interface DbReadDefinition<TInput, TOutput> {
  name: string;
  input: z.ZodType<TInput>;
  output: z.ZodType<TOutput>;
  execute: (db: PrismaClient, input: TInput) => Promise<unknown>;
}

export function defineDbReadFn<TInput, TOutput>(
  def: DbReadDefinition<TInput, TOutput>,
) {
  return {
    name: def.name,
    async run(db: PrismaClient, rawInput: unknown): Promise<TOutput> {
      const input = def.input.parse(rawInput);
      const raw = await def.execute(db, input);
      const result = def.output.safeParse(raw);
      if (!result.success) {
        throw new AuraError("INTERNAL_ERROR",
          `DB read "${def.name}" output validation failed: ${result.error.message}`);
      }
      return result.data;
    },
  };
}
```

**View declaration in migrations:**

```sql
-- prisma/migrations/XXXX_add_order_summary_view/migration.sql
CREATE OR REPLACE VIEW "OrderSummaryView" AS
SELECT
  o.id,
  o."customerId",
  COUNT(oi.id) AS "itemCount",
  SUM(oi.quantity * oi."unitPrice") AS "totalAmount"
FROM "Order" o
LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
GROUP BY o.id;
```

```prisma
// schema.prisma
view OrderSummaryView {
  id          String @id
  customerId  String
  itemCount   Int
  totalAmount Decimal
}
```

**Materialized view refresh:** Exposed as an Aura cron job:

```typescript
defineCronFn("db.refreshOrderSummary")
  .schedule("0 */5 * * * *") // every 5 minutes
  .handler(async (ctx) => {
    await ctx.db.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY "OrderSummaryMat"`;
  });
```

### Decision 5: TanStack Start Cookie API

**Resolves:** Open Question 2

TanStack Start runs on Vinxi (Nitro under the hood). The cookie API is:

```typescript
import { setCookie, deleteCookie, getCookie } from "vinxi/http";
```

These operate on the H3 event object, which is available in:
- Route loaders via `getEvent()`
- Server functions via `getEvent()`
- Middleware via the event parameter

The equivalence to Next.js:
- `(await cookies()).set(name, value, opts)` → `setCookie(getEvent(), name, value, opts)`
- `(await cookies()).delete(name)` → `deleteCookie(getEvent(), name)`
- `(await cookies()).get(name)` → `getCookie(getEvent(), name)`

### Decision 6: `useRouter().refresh()` Replacement

**Resolves:** Open Question 3

TanStack Router provides `router.invalidate()` which re-runs all active route loaders. This is the direct equivalent of Next.js `router.refresh()`.

In `useAuraMutation`, when `envelope.meta.refresh === true`:

```typescript
// Before (Next.js):
const router = useRouter();
if (envelope.meta.refresh) router.refresh();

// After (TanStack Start):
const router = useRouter();
if (envelope.meta.refresh) router.invalidate();
```

### Decision 7: Vite + `server-only` Enforcement

**Resolves:** Open Question 4

Vite does not natively understand the `server-only` package. We use a Vite plugin:

```typescript
// vite.config.ts plugin
function serverOnlyPlugin(): Plugin {
  return {
    name: "aura-server-only",
    resolveId(id, importer, options) {
      if (id === "server-only" && !options?.ssr) {
        this.error(
          `"server-only" module imported in client bundle from ${importer}. ` +
          `This module must only be used in server code.`
        );
      }
      return null;
    },
  };
}
```

TanStack Start's Vite config already splits server/client bundles. The plugin ensures any `import "server-only"` in a client chunk fails the build.

### Decision 8: Next.js Dependencies Removal

**Resolves:** Open Question 5

Packages to **remove**:
- `next` — replaced by TanStack Start
- `eslint-config-next` — replaced by a generic ESLint flat config
- `next-themes` — replaced by a Vite-compatible theme solution (e.g., `next-themes` actually works without Next.js since v0.4, or we use a minimal cookie-based theme toggle)

Packages to **keep**:
- `nuqs` — supports TanStack Router natively (v2.x has a `@nuqs/adapters/tanstack-router` adapter)

### Decision 9: File Serving Strategy

**Resolves:** Open Question 6

`/files/*` stays a **raw Hono handler** mounted in `createAuraHonoApp()`. It does not go through TanStack Start's renderer — it's a pure static file response with MIME detection and cache headers. This keeps it fast and avoids SSR overhead for binary responses.

### Decision 10: Reactive Model — Entity Invalidation (Not Live Queries)

**Resolves:** Open Question 7

**Decision: Keep entity-invalidation broadcast.** Do not implement Convex-style live queries.

Rationale:
- Convex live queries require the server to track every active subscription, diff results on every write, and push deltas. This is a fundamentally different architecture (event-sourced, server-push) that conflicts with Prisma's request/response model.
- Aura's entity-invalidation is lightweight: mutations declare which entity tags they touch, the broadcast server fans out "refetch these tags", and TanStack Query handles the refetch. This gives eventual consistency with minimal server state.
- The DB_Optimized_Read mechanism (views) further reduces refetch cost — when a client refetches after invalidation, the query hits a pre-computed view, not a complex aggregation.
- Trade-off accepted: ~100-500ms latency between mutation and other clients seeing the update (broadcast + refetch), vs Convex's ~50ms (server push). Acceptable for this use case.

### Decision 11: Typed Client API — Module Augmentation (Current Pattern)

**Resolves:** Open Question 8

**Decision: Keep the current module-augmentation pattern** (`OperationsType` interface augmented by the registry file). No codegen step.

Rationale:
- The current pattern already provides full IDE inference of input/output types.
- Adding a codegen step introduces a build dependency and a "stale types" failure mode.
- If a codegen approach is desired later, it can be added as an optional enhancement without breaking the augmentation pattern.

### Decision 12: Action Primitive — Three Function Types (Convex Model)

**Resolves:** Requirement 16, Open Question 9

Aura adopts Convex's three-primitive model: **query**, **mutation**, **action**.

```typescript
// Operation builder — three types
defineOperationFn("payments.processRefund")
  .action()                    // ← NEW third type
  .input(z.object({ orderId: z.string(), reason: z.string() }))
  .entities(["Order", "Payment"])
  .auth()
  .handler(async (ctx, { input }) => {
    // Actions CAN do side effects
    const order = await ctx.runQuery(api.orders.getById, { id: input.orderId });
    const refund = await stripe.refunds.create({ payment_intent: order.paymentIntentId });
    await ctx.runMutation(api.orders.markRefunded, { id: input.orderId, refundId: refund.id });
    await ctx.notify.send(order.userId, "refund_processed", { orderId: input.orderId });
    return { refundId: refund.id };
  });
```

**Context types per primitive:**

```typescript
// Query context — read-only DB, no side effects
interface AuraQueryContext extends BaseAuraContext {
  db: PrismaReadOnlyClient; // findMany, findFirst, findUnique, count, aggregate, groupBy, $queryRaw
  runQuery: <T>(ref: OperationRef<"query", TInput, T>, input: TInput) => Promise<T>;
}

// Mutation context — full DB access, transactional, no external side effects
interface AuraMutationContext extends BaseAuraContext {
  db: PrismaClient; // full read/write including $transaction
  runQuery: <T>(ref: OperationRef<"query", TInput, T>, input: TInput) => Promise<T>;
  runMutation: <T>(ref: OperationRef<"mutate", TInput, T>, input: TInput) => Promise<T>;
  scheduler: AuraScheduler;
  invalidate: (target: { entity: string; id?: string }) => void;
}

// Action context — no direct DB, can call queries/mutations, can do side effects
interface AuraActionContext extends BaseAuraContext {
  runQuery: <T>(ref: OperationRef<"query", TInput, T>, input: TInput) => Promise<T>;
  runMutation: <T>(ref: OperationRef<"mutate", TInput, T>, input: TInput) => Promise<T>;
  runAction: <T>(ref: OperationRef<"action", TInput, T>, input: TInput) => Promise<T>;
  scheduler: AuraScheduler;
  storage: AuraStorage;
  fetch: typeof globalThis.fetch; // explicit — actions own their side effects
}
```

**Runtime enforcement:** If a query handler somehow obtains a write method (via type assertion), a Proxy wrapper on the DB client throws `AuraError("INTERNAL_ERROR", "Write operations are forbidden in queries")`.

**Bridge routing:** Actions are served via `POST /aura/:path` just like mutations. The runner checks `operation.type` and builds the appropriate context. The client uses `useAuraMutation` for actions (same fire-and-forget semantics) or a dedicated `useAuraAction` hook if distinct loading states are needed.

### Decision 13: Scheduler — At-Least-Once with `ctx.scheduler`

**Resolves:** Requirement 18, Open Question 10

**Decision: At-least-once delivery.** Handlers MUST be idempotent.

The scheduler is a first-class API on the mutation and action context:

```typescript
// Inside a mutation or action handler:
const jobId = await ctx.scheduler.runAfter(5 * 60 * 1000, api.emails.sendReceipt, {
  orderId: order.id,
  email: user.email,
});

// Or at a specific time:
await ctx.scheduler.runAt(new Date("2025-01-15T09:00:00Z"), api.reports.generateMonthly, {
  month: "2024-12",
});

// Cancel if needed:
await ctx.scheduler.cancel(jobId);
```

**Implementation:** `ctx.scheduler.runAfter` inserts an `AuraJobRun` row:

```prisma
model AuraJobRun {
  id            String   @id @default(uuid())
  operationName String
  input         Json
  status        String   @default("PENDING") // PENDING, RUNNING, SUCCEEDED, FAILED, CANCELLED
  runAt         DateTime
  startedAt     DateTime?
  completedAt   DateTime?
  attempts      Int      @default(0)
  maxAttempts   Int      @default(3)
  lastError     String?
  lockedUntil   DateTime?
  createdAt     DateTime @default(now())
}
```

The existing outbox processor is extended to also pick up `AuraJobRun` rows with `status=PENDING AND runAt <= now()`. Execution calls `runAuraOperation` with `source: "scheduler"`.

Rationale for at-least-once:
- Simpler implementation: no deduplication keys needed.
- Crash recovery: if process dies mid-execution, job stays `RUNNING` past `lockedUntil`, gets retried.
- Handlers that need exactly-once can implement their own idempotency key (e.g., check if email already sent before sending).

### Decision 14: Typed Function References (`api` Object)

**Resolves:** Requirement 17, Requirement 24, Open Question 8

**Decision: Module augmentation + generated `api` namespace object.**

The `aura:make` CLI (already exists) is extended to also emit a typed `api` object:

```typescript
// src/aura/_generated/api.ts (auto-generated by `aura:make` or a Vite plugin)
import type { OperationRef } from "@/aura/core/types";

export const api = {
  catalog: {
    productBySlug: { _name: "catalog.productBySlug", _type: "query" } as OperationRef<"query", { slug: string }, Product>,
    createProduct: { _name: "catalog.createProduct", _type: "mutate" } as OperationRef<"mutate", CreateProductInput, Product>,
  },
  payments: {
    processRefund: { _name: "payments.processRefund", _type: "action" } as OperationRef<"action", RefundInput, RefundResult>,
  },
} as const;
```

Usage:
```typescript
// Client
const { data } = useAuraQuery(api.catalog.productBySlug, { slug: "widget" });
//                            ^ autocomplete on api.catalog.*
//                                                          ^ type-checked input

// Server (inside another operation)
const product = await ctx.runQuery(api.catalog.productBySlug, { slug });
```

**Backward compatibility:** String-name usage still works:
```typescript
useAuraQuery("catalog.productBySlug", { slug: "widget" }); // still valid, less type-safe
```

The generation runs as part of `aura:make` (which already scaffolds operations) and optionally as a Vite plugin that watches the registry for changes during dev.

### Decision 15: HTTP Actions (Webhooks/Callbacks)

**Resolves:** Requirement 21

Raw HTTP handlers for webhooks, OAuth callbacks, etc.:

```typescript
// src/operations/webhooks/stripe.http.ts
import { defineHttpAction } from "@/aura/server/http-action";

export const stripeWebhook = defineHttpAction("/webhooks/stripe", "POST")
  .public()
  .csrf(false) // webhooks don't send CSRF tokens
  .handler(async (ctx, request) => {
    const sig = request.headers.get("stripe-signature");
    const event = stripe.webhooks.constructEvent(await request.text(), sig, secret);
    
    await ctx.runMutation(api.payments.handleWebhook, { event });
    
    return new Response("ok", { status: 200 });
  });
```

Mounted at `/aura-http/webhooks/stripe`. The prefix `/aura-http/` is configurable. HTTP actions get the same `AuraContext` (minus the operation-specific fields) and can call queries/mutations internally.

### Decision 16: Fine-Grained Entity Invalidation

**Resolves:** Requirement 22

Extend the invalidation system to support instance-level targeting:

```typescript
// In a mutation handler:
handler(async (ctx, { input }) => {
  const order = await ctx.db.order.update({ where: { id: input.orderId }, data: { status: "shipped" } });
  
  // Instance-level: only queries watching THIS specific order refetch
  ctx.invalidate({ entity: "Order", id: order.id });
  
  // Type-level (existing): ALL order queries refetch
  // (happens automatically via .entities(["Order"]) on the operation definition)
  
  return order;
});
```

Broadcast payload becomes:
```json
{ "type": "INVALIDATE", "id": "msg-uuid", "keys": ["Order", { "entity": "Order", "id": "order-123" }] }
```

Client matching logic:
```typescript
// useAuraQuery with entity watching
useAuraQuery(api.orders.getById, { id: orderId }, {
  entities: [{ entity: "Order", id: orderId }], // only refetch when THIS order changes
});

// useAuraQuery without specific ID (existing behavior)
useAuraQuery(api.orders.list, {}, {
  entities: ["Order"], // refetch on ANY order change
});
```

### Decision 17: Enhanced File Storage (`ctx.storage`)

**Resolves:** Requirement 23

First-class file storage in the operation system:

```typescript
// In an action handler:
handler(async (ctx, { input }) => {
  const storageId = await ctx.storage.store(input.file, {
    filename: input.file.name,
    contentType: input.file.type,
  });
  
  await ctx.runMutation(api.products.setImage, {
    productId: input.productId,
    imageStorageId: storageId,
  });
  
  return { url: ctx.storage.getUrl(storageId) };
});
```

New Prisma model:
```prisma
model AuraStoredFile {
  id          String   @id @default(uuid())
  filename    String
  contentType String
  size        Int
  path        String   // physical path or S3 key
  driver      String   @default("filesystem") // "filesystem" | "s3"
  uploadedBy  String?  // userId
  createdAt   DateTime @default(now())
}
```

The `/files/:storageId/:filename` route resolves via `AuraStoredFile` lookup, then serves from the configured driver.

### Decision 18: Cursor-Based Pagination

**Resolves:** Requirement 25

Built on top of Prisma's `cursor` pagination with an opaque cursor encoding:

```typescript
// Operation definition
defineOperationFn("orders.list")
  .query()
  .input(z.object({
    status: z.enum(["pending", "shipped"]).optional(),
    cursor: z.string().optional(),
    numItems: z.number().default(20),
  }))
  .paginate({ orderBy: "createdAt", direction: "desc" }) // ← pagination modifier
  .entities(["Order"])
  .auth()
  .handler(async (ctx, { input }) => {
    // Handler receives a paginated context helper
    return ctx.paginate(ctx.db.order, {
      where: input.status ? { status: input.status } : undefined,
      cursor: input.cursor,
      take: input.numItems,
    });
    // Returns: { items: Order[], cursor: string | null, isDone: boolean }
  });
```

**Cursor encoding:** `base64url(JSON.stringify({ id: lastItem.id, sort: lastItem[orderByField] }))`. Validated with an HMAC to prevent forgery.

**Client hook:**
```typescript
const { items, loadMore, isLoading, isDone } = useAuraPaginatedQuery(
  api.orders.list,
  { status: "pending", numItems: 20 }
);
// loadMore() fetches next page, appends to items
```

Internally uses TanStack Query's `useInfiniteQuery` with the cursor as `pageParam`.

### Decision 19: Full-Text Search via PostgreSQL

**Resolves:** Requirement 26

Leverages PostgreSQL's native `tsvector`/`tsquery` (no external service needed):

```typescript
// Declaration
defineSearchIndex("Product", {
  fields: ["name", "description"], // fields to index
  filterFields: ["categoryId", "status"], // filterable alongside search
  language: "french", // PostgreSQL text search config
});
```

Generates a migration:
```sql
ALTER TABLE "Product" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('french', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('french', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX "Product_search_idx" ON "Product" USING GIN ("search_vector");
```

Usage in operations:
```typescript
const results = await ctx.db.search("Product", {
  query: "chaussure running",
  filter: { categoryId: "cat-123" },
  limit: 20,
});
// Returns: { items: Product[], scores: number[] }
```

Under the hood: `SELECT *, ts_rank(search_vector, plainto_tsquery('french', $1)) as score FROM "Product" WHERE search_vector @@ plainto_tsquery('french', $1) AND "categoryId" = $2 ORDER BY score DESC LIMIT $3`.

### Decision 20: Vector Search via pgvector

**Resolves:** Requirement 27

Uses PostgreSQL's `pgvector` extension for embedding storage and similarity search:

```typescript
// Declaration
defineVectorIndex("Document", {
  vectorField: "embedding", // Float[] column
  dimensions: 1536, // OpenAI ada-002
  filterFields: ["workspaceId", "type"],
  indexType: "hnsw", // or "ivfflat"
});
```

Generates a migration:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "Document" ADD COLUMN "embedding" vector(1536);
CREATE INDEX "Document_embedding_idx" ON "Document"
  USING hnsw ("embedding" vector_cosine_ops);
```

Usage:
```typescript
// From an action (like Convex — vector search is expensive, better in actions)
const results = await ctx.db.vectorSearch("Document", {
  vector: await getEmbedding(query), // number[1536]
  limit: 10,
  filter: { workspaceId: ctx.user.workspaceId },
});
// Returns: { items: Document[], distances: number[] }
```

**Design choice:** Vector search is available from both queries and actions, but the docs recommend actions for heavy embedding generation + search workflows.

### Decision 21: Aura Components Architecture

**Resolves:** Requirement 28

Components are npm-installable packages that bundle schema + operations + config:

```typescript
// @aura/auth component (built-in)
import { defineComponent } from "@/aura/core/component";

export const AuraAuthComponent = defineComponent("auth", {
  schema: {
    // Prisma model definitions (added to schema.prisma via aura:install)
    models: ["AuraUser", "AuraSession"],
  },
  operations: {
    "auth.login": loginOperation,
    "auth.register": registerOperation,
    "auth.logout": logoutOperation,
  },
  config: {
    sessionDuration: { type: "string", default: "7d" },
    otpLength: { type: "number", default: 6 },
  },
});
```

**Installation:** `npx aura install @aura/auth` adds models to `schema.prisma`, registers operations, and creates a config entry.

**Data isolation:** Components access their own models through a scoped Prisma client. Application code calls component operations via `ctx.runComponent(authComponent, "auth.login", input)` — never directly accessing component tables.

**First-party components planned:**
- `@aura/auth` — existing auth subsystem, extracted
- `@aura/rate-limit` — existing rate limiter, extracted
- `@aura/notifications` — existing notification dispatcher, extracted
- `@aura/storage` — existing file storage, extracted

### Decision 22: Durable Workflows

**Resolves:** Requirement 29

Multi-step workflows that persist state across process restarts:

```typescript
import { defineWorkflow } from "@/aura/server/workflow";

export const orderFulfillment = defineWorkflow("orders.fulfill")
  .input(z.object({ orderId: z.string() }))
  .handler(async (ctx, { input }) => {
    // Step 1: Validate inventory
    const inventory = await ctx.step("check-inventory", () =>
      ctx.runQuery(api.inventory.check, { orderId: input.orderId })
    );

    if (!inventory.available) {
      await ctx.step("notify-backorder", () =>
        ctx.runAction(api.notifications.sendBackorder, { orderId: input.orderId })
      );
      return { status: "backordered" };
    }

    // Step 2: Charge payment
    const payment = await ctx.step("charge-payment", () =>
      ctx.runAction(api.payments.charge, { orderId: input.orderId })
    );

    // Step 3: Wait 1 hour then send shipping notification
    await ctx.sleep(60 * 60 * 1000);

    // Step 4: Create shipment
    await ctx.step("create-shipment", () =>
      ctx.runAction(api.shipping.createLabel, { orderId: input.orderId })
    );

    return { status: "fulfilled", trackingId: payment.trackingId };
  });
```

**Persistence model:**
```prisma
model AuraWorkflowRun {
  id            String   @id @default(uuid())
  workflowName  String
  input         Json
  status        String   @default("PENDING") // PENDING, RUNNING, COMPLETED, FAILED, CANCELLED
  currentStep   String?
  completedSteps Json    @default("[]") // Array of { name, result, completedAt }
  error         String?
  startedAt     DateTime?
  completedAt   DateTime?
  createdAt     DateTime @default(now())
}
```

Each `ctx.step()` persists its result before proceeding. On crash recovery, the workflow resumes from the last completed step, skipping already-done steps (their results are loaded from `completedSteps`).

### Decision 23: Auto-Tracking Entity Invalidation

**Resolves:** Requirement 30

Enhance the existing entity-invalidation to reduce manual wiring:

**For mutations:** Wrap the Prisma client in a Proxy that tracks which tables are written to during a mutation. After the handler completes, automatically add those table names to the invalidation set.

```typescript
// Before (manual):
defineOperationFn("orders.ship").mutate().entities(["Order", "Shipment"]).handler(...)

// After (auto-tracked, no .entities() needed):
defineOperationFn("orders.ship").mutate().handler(async (ctx, { input }) => {
  await ctx.db.order.update(...);    // auto-tracks "Order"
  await ctx.db.shipment.create(...); // auto-tracks "Shipment"
  // Invalidation for ["Order", "Shipment"] is automatic
});
```

**For queries:** Similarly, track which tables are read. This populates the manifest's entity mapping automatically.

**Override:** Explicit `.entities([...])` always takes precedence over auto-tracking. Auto-tracking is opt-in via a config flag (`autoTrackEntities: true` in aura config) to avoid breaking existing code.

### Decision 24: AI Agent Framework — LangChain/LangGraph Native

**Resolves:** Requirements 31-36

Aura's AI layer is built on **LangChain JS** (model abstraction, tools, chains) and **LangGraph JS** (stateful agent workflows), with Aura providing the persistence, streaming, and integration layer.

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│  Aura AI Layer                                              │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ defineAgent() │  │ Agent Thread │  │ Agent Streaming  │ │
│  │ model, tools, │  │ persistence  │  │ via WS broadcast │ │
│  │ prompt, RAG   │  │ (Prisma)     │  │ (existing infra) │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ │
│         │                  │                    │           │
│         ▼                  ▼                    ▼           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  LangChain JS / LangGraph JS                         │  │
│  │  - ChatModel (OpenAI, Anthropic, Google, local)      │  │
│  │  - StructuredTool (Aura operations as tools)         │  │
│  │  - StateGraph (multi-step workflows)                 │  │
│  │  - MemorySaver → Aura Prisma persistence             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Agent definition:**

```typescript
import { defineAgent } from "@/aura/server/ai/agent";
import { ChatOpenAI } from "@langchain/openai";

export const supportAgent = defineAgent("support", {
  model: new ChatOpenAI({ model: "gpt-4o", temperature: 0.7 }),
  systemPrompt: "You are a helpful customer support agent for our e-commerce platform.",
  tools: [
    api.orders.getById.asTool({ description: "Look up an order by ID" }),
    api.orders.list.asTool({ description: "List orders for the current user" }),
    api.orders.cancel.asTool({ description: "Cancel an order" }).requiresApproval(),
    api.shipping.getStatus.asTool({ description: "Get shipping status" }),
  ],
  maxSteps: 10,
  rag: {
    sources: ["helpArticles", "productDocs"],
    topK: 5,
    strategy: "hybrid", // vector + full-text with RRF fusion
  },
});
```

**Thread management (Prisma models):**

```prisma
model AuraAgentThread {
  id        String   @id @default(uuid())
  agentName String
  userId    String?
  title     String?
  metadata  Json?
  status    String   @default("active") // active, archived, locked
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages  AuraAgentMessage[]
}

model AuraAgentMessage {
  id          String   @id @default(uuid())
  threadId    String
  thread      AuraAgentThread @relation(fields: [threadId], references: [id])
  role        String   // "user", "assistant", "tool", "system"
  content     String?
  toolCalls   Json?    // Array of { id, name, args }
  toolResults Json?    // Array of { id, result }
  metadata    Json?    // { model, tokens, ragSources, etc. }
  createdAt   DateTime @default(now())
}

model AuraAIUsage {
  id           String   @id @default(uuid())
  agentName    String
  threadId     String?
  userId       String?
  model        String
  provider     String
  inputTokens  Int
  outputTokens Int
  totalTokens  Int
  latencyMs    Int
  estimatedCost Float?
  createdAt    DateTime @default(now())
}
```

**Streaming via WebSocket (not HTTP):**

Unlike traditional HTTP streaming, Aura streams AI responses through the existing broadcast WebSocket. This means:
- Multiple clients see the same stream simultaneously
- Stream survives network interruptions (reconnect gets accumulated content)
- No special HTTP streaming infrastructure needed

```typescript
// Server-side (inside an action):
const stream = await ctx.agent.streamText(threadRef, {
  prompt: userMessage,
});

// Internally, each token delta is broadcast:
// { type: "AGENT_STREAM", threadId, messageId, delta: "Hello", done: false }
// { type: "AGENT_STREAM", threadId, messageId, delta: " world", done: false }
// { type: "AGENT_STREAM", threadId, messageId, delta: "", done: true }

// Client-side:
const { messages, isStreaming, streamingContent } = useAuraAgentStream(threadId);
```

**LangGraph integration for complex workflows:**

```typescript
import { defineAgentWorkflow } from "@/aura/server/ai/workflow";
import { StateGraph } from "@langchain/langgraph";

export const researchAgent = defineAgentWorkflow("research", {
  graph: new StateGraph({ channels: { query: null, results: null, answer: null } })
    .addNode("search", searchNode)
    .addNode("analyze", analyzeNode)
    .addNode("synthesize", synthesizeNode)
    .addEdge("search", "analyze")
    .addEdge("analyze", "synthesize")
    .compile(),
  persistence: "aura", // Use Aura's Prisma-backed persistence instead of LangGraph's MemorySaver
});
```

**Tools as operations:**

```typescript
// Any operation can become a tool:
const orderLookupTool = api.orders.getById.asTool({
  description: "Look up order details by order ID",
});

// This auto-generates the LangChain StructuredTool:
// - name: "orders.getById"
// - description: "Look up order details by order ID"
// - schema: (from the operation's Zod input schema)
// - func: calls the operation in-process with agent's context
```

**Human-in-the-loop:**

```typescript
api.orders.cancel.asTool({ description: "Cancel an order" }).requiresApproval();

// When the LLM calls this tool:
// 1. A message with type "tool_approval_pending" is persisted
// 2. The agent pauses (workflow state saved)
// 3. Client sees a pending approval via useAuraAgentThread
// 4. Human approves/rejects
// 5. Agent resumes from saved state
```

**RAG integration:**

```typescript
defineRAGSource("helpArticles", {
  model: "HelpArticle",
  fields: ["title", "content"],
  embeddingModel: new OpenAIEmbeddings({ model: "text-embedding-3-small" }),
  chunkStrategy: { type: "recursive", chunkSize: 1000, overlap: 200 },
});

// Auto-generates embeddings on create/update via outbox job
// Stored in the same table with a vector column (pgvector)
// Retrieved via hybrid search (vector + full-text) during agent generation
```

**Dependencies added:**
- `@langchain/core` — base abstractions (models, tools, messages)
- `@langchain/openai` — OpenAI models (optional, user installs per provider)
- `@langchain/anthropic` — Anthropic models (optional)
- `@langchain/langgraph` — stateful agent workflows
- `ai` — Vercel AI SDK (optional, for compatibility with `streamText` patterns)

---

## Module Structure (Post-Migration)

```
src/aura/
├── client/                    # Client-side (unchanged API surface)
│   ├── index.ts               # Re-exports all client hooks
│   ├── hooks.ts               # useAuraQuery, useAuraMutation, etc.
│   ├── provider.tsx           # AuraClientProvider (WebSocket, manifest)
│   ├── hydration-boundary.tsx # AuraHydrationBoundary
│   ├── form.ts                # useAuraForm, useStepperForm
│   ├── guard.tsx              # AuraGuard
│   ├── params.ts              # useAuraParams (nuqs adapter)
│   ├── stepper.ts             # useStepperForm
│   ├── transport.ts           # fetch wrapper for bridge calls
│   └── manifest-cache.ts      # Client manifest store
├── core/
│   ├── envelope.ts            # AuraEnvelope types
│   └── errors.ts              # AuraError, error codes
├── server/
│   ├── hono-app.ts            # createAuraHonoApp() factory [NEW]
│   ├── routes/                # Hono route modules [NEW]
│   │   ├── bridge.ts          # /aura/* POST + manifest GET
│   │   ├── internal.ts        # /aura-internal/* POST
│   │   ├── files.ts           # /files/* GET
│   │   └── health.ts          # /health GET
│   ├── middleware/            # Hono middleware [NEW]
│   │   ├── csrf.ts            # CSRF verification for bridge
│   │   └── rate-limit.ts     # In-memory rate limiter
│   ├── request-context.ts     # getAuraRequestHeaders(), applyAuraCookies() [NEW]
│   ├── call.ts                # callAuraServer, runAuraServer (updated imports)
│   ├── runner.ts              # runAuraOperation (unchanged logic)
│   ├── create-context.ts      # createAuraContext (remove "server-only" → use vite plugin)
│   ├── registry.ts            # Operation registry (unchanged)
│   ├── operation.ts           # defineOperationFn (unchanged)
│   ├── db.ts                  # Prisma singleton (unchanged)
│   ├── db-read.ts             # defineDbReadFn [NEW]
│   ├── hydration.tsx          # AuraHydration, prefetchAuraQuery (updated imports)
│   ├── invalidate.ts          # publishInvalidation (unchanged)
│   ├── broadcast.ts           # Standalone broadcast server (unchanged)
│   ├── cron.ts                # defineCronFn, runAuraCron (unchanged)
│   ├── outbox.ts              # processOutboxEvents (unchanged)
│   ├── auth/                  # Auth subsystem (unchanged logic)
│   ├── storage/               # File storage drivers (unchanged)
│   └── transport/
│       ├── cookies.ts         # Cookie helpers (updated for vinxi/http)
│       ├── csrf.ts            # CSRF token generation/verification (unchanged logic)
│       └── rate-limit-proxy.ts # In-memory rate limiter (unchanged logic)
├── shared/
│   ├── manifest.ts            # Manifest types
│   ├── query-key.ts           # auraQueryKey helper
│   ├── params.ts              # Param schemas
│   └── auth-schemas.ts        # Auth Zod schemas
└── cli/                       # CLI tools (unchanged)
    ├── cron.ts
    ├── outbox.ts
    ├── doctor.ts
    └── make.ts
```

## Module Structure (Post-Migration — Enhanced)

## Decision 25: Strict Folder Convention and CLI-Enforced Structure

**Resolves:** Requirement 37

### Canonical Application Structure

Every Aura project follows this strict layout. **All files are generated via `aura:make` — never created manually.**

```
src/
├── operations/                          # ← ALL backend logic lives here
│   ├── _registry.ts                     # Auto-generated: imports all discovered artifacts
│   ├── _middleware/                     # Global middleware (applied to all operations)
│   │   ├── with-auth.middleware.ts      # Auth check middleware
│   │   ├── with-rate-limit.middleware.ts # Rate limit middleware
│   │   └── with-organization.middleware.ts
│   ├── catalog/                         # Domain namespace: "catalog"
│   │   ├── product-by-slug.operation.ts # → operation name: "catalog.product-by-slug" (query)
│   │   ├── product-list.operation.ts    # → operation name: "catalog.product-list" (query)
│   │   ├── create-product.operation.ts  # → operation name: "catalog.create-product" (mutate)
│   │   ├── import-products.operation.ts # → operation name: "catalog.import-products" (action)
│   │   └── refresh-catalog.cron.ts      # → cron name: "catalog.refresh-catalog"
│   ├── orders/                          # Domain namespace: "orders"
│   │   ├── get-by-id.operation.ts       # → "orders.get-by-id" (query)
│   │   ├── create.operation.ts          # → "orders.create" (mutate)
│   │   ├── cancel.operation.ts          # → "orders.cancel" (mutate)
│   │   ├── process-refund.operation.ts  # → "orders.process-refund" (action)
│   │   ├── fulfill.workflow.ts          # → workflow: "orders.fulfill"
│   │   ├── summary.db-read.ts          # → DB read: "orders.summary"
│   │   └── search.search.ts            # → search index on Order model
│   ├── payments/
│   │   ├── charge.operation.ts          # → "payments.charge" (action)
│   │   └── stripe.http.ts              # → HTTP action: POST /aura-http/payments/stripe
│   ├── ai/                              # AI agents namespace
│   │   ├── customer-support.agent.ts    # → agent: "ai.customer-support"
│   │   ├── research.agent.ts           # → agent: "ai.research"
│   │   └── help-articles.rag.ts        # → RAG source: "help-articles"
│   ├── notifications/
│   │   ├── send.operation.ts            # → "notifications.send" (action)
│   │   └── process-outbox.cron.ts       # → cron: "notifications.process-outbox"
│   └── documents/
│       ├── upload.operation.ts          # → "documents.upload" (action)
│       ├── search.operation.ts          # → "documents.search" (query)
│       └── embeddings.vector.ts         # → vector index on Document model
├── aura/                                # ← Aura framework internals (DO NOT EDIT)
│   ├── _generated/
│   │   └── api.ts                       # Typed API object (auto-generated)
│   ├── client/                          # Client hooks and providers
│   ├── core/                            # Envelope, errors, types
│   ├── server/                          # Server runtime (hono, runner, context, etc.)
│   ├── shared/                          # Shared types between client/server
│   ├── ui/                              # Built-in UI kit (shadcn-based) [NEW]
│   └── cli/                             # CLI tools
└── app/                                 # ← TanStack Start routes (UI layer)
    ├── routes/
    ├── components/
    └── ...
```

### File Suffix Rules

| Suffix | Purpose | CLI command | One-per-file |
|--------|---------|-------------|--------------|
| `.operation.ts` | Query, mutation, or action | `aura:make operation <name> --type query\|mutate\|action` | ✅ Yes |
| `.middleware.ts` | Reusable operation middleware | `aura:make middleware <name>` | ✅ Yes |
| `.cron.ts` | Cron job definition | `aura:make cron <name> --schedule "<expr>"` | ✅ Yes |
| `.workflow.ts` | Durable workflow | `aura:make workflow <name>` | ✅ Yes |
| `.agent.ts` | AI agent definition | `aura:make agent <name>` | ✅ Yes |
| `.http.ts` | HTTP action (webhook) | `aura:make http <path> --method POST` | ✅ Yes |
| `.rag.ts` | RAG source definition | `aura:make rag <name> --model <Model>` | ✅ Yes |
| `.search.ts` | Full-text search index | `aura:make search <model>` | ✅ Yes |
| `.vector.ts` | Vector index | `aura:make vector <model> --dimensions <n>` | ✅ Yes |
| `.db-read.ts` | DB-optimized read (view/function) | `aura:make db-read <name>` | ✅ Yes |
| `.component.ts` | Component definition | `aura:make component <name>` | ✅ Yes |

### Name-to-Path Mapping (Enforced)

The operation name is derived from the file path:

```
src/operations/catalog/productBySlug.operation.ts
              └─────┘ └────────────┘
              namespace  operationName
              
→ Full name: "catalog.productBySlug"
```

Nested namespaces are supported:
```
src/operations/admin/users/ban.operation.ts → "admin.users.ban"
```

### Auto-Discovery and Registration

At startup (and during dev via Vite plugin), Aura scans `src/operations/**/*.{operation,middleware,cron,workflow,agent,http,rag,search,vector,db-read,component}.ts` using glob patterns. Each discovered file is:

1. Imported dynamically
2. Validated (correct export shape, name matches path)
3. Registered in the operation registry

The `_registry.ts` file is auto-generated for production builds (tree-shaking friendly):

```typescript
// src/operations/_registry.ts (AUTO-GENERATED — DO NOT EDIT)
export { default as catalog_productBySlug } from "./catalog/productBySlug.operation";
export { default as catalog_createProduct } from "./catalog/createProduct.operation";
export { default as orders_getById } from "./orders/getById.operation";
// ... all discovered artifacts
```

### CLI Generation Examples

```bash
# Generate a query operation
$ bun aura:make operation catalog.product-by-slug --type query

# Creates: src/operations/catalog/product-by-slug.operation.ts
# ┌─────────────────────────────────────────────────────────────┐
# │ import { defineOperationFn } from "@/aura/server/operation"; │
# │ import { z } from "zod";                                     │
# │                                                               │
# │ export default defineOperationFn("catalog.product-by-slug")   │
# │   .query()                                                    │
# │   .input(z.object({                                           │
# │     // TODO: define input schema                              │
# │   }))                                                         │
# │   .entities(["Product"])                                      │
# │   .auth()                                                     │
# │   .handler(async (ctx, { input }) => {                        │
# │     // TODO: implement                                        │
# │   });                                                         │
# └─────────────────────────────────────────────────────────────┘

# Generate a middleware
$ bun aura:make middleware with-organization

# Creates: src/operations/_middleware/with-organization.middleware.ts

# Generate an AI agent
$ bun aura:make agent customer-support

# Creates: src/operations/ai/customer-support.agent.ts

# Generate a cron
$ bun aura:make cron catalog.refresh-views --schedule "0 */5 * * *"

# Creates: src/operations/catalog/refresh-views.cron.ts

# Generate a UI component
$ bun aura:make ui order-summary-card

# Creates: src/aura/ui/order-summary-card.tsx
```

### Validation (`aura:doctor`)

```bash
$ bun aura:doctor

✓ 23 operations discovered (12 queries, 8 mutations, 3 actions)
✓ 4 middleware registered
✓ 3 cron jobs registered
✓ 2 agents registered
✓ 1 workflow registered
✓ All operation names match file paths
✓ No files outside canonical structure
✓ _registry.ts is up to date
✓ _generated/api.ts is up to date
✗ WARNING: src/operations/legacy/old-handler.ts has no recognized suffix
```

### `aura.config.ts`

```typescript
import { defineAuraConfig } from "@/aura/core/config";

export default defineAuraConfig({
  // Root directory for operations (default: "src/operations")
  operationsDir: "src/operations",
  
  // Auto-track entities from DB reads/writes (default: false)
  autoTrackEntities: true,
  
  // Strict mode: fail startup if any file violates conventions (default: true in prod)
  strictMode: process.env.NODE_ENV === "production",
  
  // AI configuration
  ai: {
    defaultModel: "gpt-4o",
    defaultEmbeddingModel: "text-embedding-3-small",
  },
  
  // Storage
  storage: {
    driver: process.env.AURA_STORAGE_DRIVER ?? "filesystem",
    path: process.env.AURA_STORAGE_PATH ?? "./uploads",
  },
});
```

---

### Decision 26: Built-in UI Kit (shadcn-based, kebab-case)

**Resolves:** Requirements 38, 39

Aura ships a set of high-level composite components in `src/aura/ui/` that accelerate SaaS development. Every component is built exclusively on shadcn/ui primitives + Tailwind CSS.

**Naming convention: kebab-case everywhere.**

All files in the project use kebab-case — no camelCase, no PascalCase in file names:
```
✅ product-by-slug.operation.ts
✅ with-organization.middleware.ts
✅ aura-data-table.tsx
✅ customer-support.agent.ts

❌ productBySlug.operation.ts
❌ withOrganization.middleware.ts
❌ AuraDataTable.tsx
```

**Operation name mapping:**
```
src/operations/catalog/product-by-slug.operation.ts
→ operation name: "catalog.product-by-slug"
```

**UI Kit architecture:**

```
src/aura/ui/
├── aura-data-table.tsx        # Server-paginated table ← useAuraPaginatedQuery
├── aura-form.tsx              # Auto-form from Zod schema ← useAuraForm
├── aura-form-field.tsx        # Field renderer (text, select, date, file...)
├── aura-bump-toaster.tsx      # Sonner toasts from ctx.bump.*
├── aura-auth-card.tsx         # Login/register/OTP/password flows
├── aura-guard-view.tsx        # Auth guard wrapper (loading/unauthorized)
├── aura-confirm-dialog.tsx    # Destructive action confirmation
├── aura-file-upload.tsx       # Drag-and-drop → ctx.storage.store
├── aura-search-input.tsx      # Debounced search → full-text query
├── aura-empty-state.tsx       # Empty state placeholder
├── aura-error-boundary.tsx    # AuraClientError display
├── aura-loading-skeleton.tsx  # Skeleton loaders
├── aura-agent-chat.tsx        # AI agent thread UI (streaming, tools, approvals)
├── aura-settings-layout.tsx   # Settings page layout (sidebar + content)
├── aura-dashboard-shell.tsx   # Dashboard layout (nav + header + content)
└── index.ts                   # Re-exports all components
```

**Key component: `<AuraBumpToaster>`**

Wires server-side bumps to client toasts automatically:

```typescript
// Server (in a mutation handler):
ctx.bump.success("Commande créée", "La commande #1234 a été enregistrée.");

// Client (in the envelope response):
// envelope.meta.bumps = [{ variant: "success", title: "Commande créée", description: "..." }]

// <AuraBumpToaster> (mounted once in the root layout):
// Automatically calls sonner's toast() for each bump in the mutation response.
```

```tsx
// src/aura/ui/aura-bump-toaster.tsx
"use client";
import { toast } from "sonner";
import { useEffect } from "react";
import { useAuraBumps } from "@/aura/client";

export function AuraBumpToaster() {
  const bumps = useAuraBumps(); // reads from last mutation response
  
  useEffect(() => {
    for (const bump of bumps) {
      toast[bump.variant](bump.title, { description: bump.description });
    }
  }, [bumps]);
  
  return null; // Sonner's <Toaster> is mounted separately
}
```

**Key component: `<AuraDataTable>`**

Zero-config data table from an operation:

```tsx
import { AuraDataTable } from "@/aura/ui";
import { api } from "@/aura/_generated/api";

export function OrdersPage() {
  return (
    <AuraDataTable
      query={api.orders.list}
      columns={[
        { key: "id", label: "ID" },
        { key: "status", label: "Statut", filterable: true },
        { key: "total", label: "Total", sortable: true, format: "currency" },
        { key: "created-at", label: "Date", sortable: true, format: "relative" },
      ]}
      searchable={{ placeholder: "Rechercher une commande..." }}
      actions={[
        { label: "Voir", href: (row) => `/orders/${row.id}` },
        { label: "Annuler", mutation: api.orders.cancel, confirm: true, variant: "destructive" },
      ]}
      empty={{ title: "Aucune commande", description: "Les commandes apparaîtront ici." }}
    />
  );
}
```

Internally uses `useAuraPaginatedQuery` + shadcn `<Table>` + `<Pagination>` + `<Input>` for search + `<Select>` for filters.

**Key component: `<AuraForm>`**

Auto-generates a form from a Zod schema:

```tsx
import { AuraForm } from "@/aura/ui";
import { api } from "@/aura/_generated/api";

export function CreateProductForm() {
  return (
    <AuraForm
      mutation={api.catalog.create-product}
      fields={[
        { name: "name", label: "Nom du produit" },
        { name: "price", label: "Prix", type: "number" },
        { name: "category", label: "Catégorie", type: "select", options: categories },
        { name: "image", label: "Image", type: "file" },
      ]}
      onSuccess={(data) => router.navigate({ to: `/products/${data.id}` })}
      submitLabel="Créer le produit"
    />
  );
}
```

Internally uses `useAuraForm` (react-hook-form + Zod resolver) + shadcn form components.

**Key component: `<AuraAgentChat>`**

Full AI chat UI with streaming, tool calls, and human-in-the-loop:

```tsx
import { AuraAgentChat } from "@/aura/ui";

export function SupportPage() {
  return (
    <AuraAgentChat
      agent={api.ai.customer-support}
      thread-id={threadId}
      placeholder="Posez votre question..."
      show-tool-calls
      show-sources // RAG attribution
    />
  );
}
```

---

## Aura Framework Internals (src/aura/)

The framework code itself (not application code) lives in `src/aura/`:

```
src/aura/
├── _generated/                # Auto-generated typed API [NEW]
│   └── api.ts                 # Typed operation references (api.catalog.productBySlug)
├── client/                    # Client-side (enhanced API surface)
│   ├── index.ts               # Re-exports all client hooks
│   ├── hooks.ts               # useAuraQuery, useAuraMutation, useAuraAction
│   ├── provider.tsx           # AuraClientProvider (WebSocket, manifest)
│   ├── hydration-boundary.tsx # AuraHydrationBoundary
│   ├── form.ts                # useAuraForm, useStepperForm
│   ├── guard.tsx              # AuraGuard
│   ├── params.ts              # useAuraParams (nuqs adapter)
│   ├── stepper.ts             # useStepperForm
│   ├── transport.ts           # fetch wrapper for bridge calls
│   └── manifest-cache.ts      # Client manifest store
├── core/
│   ├── envelope.ts            # AuraEnvelope types
│   ├── errors.ts              # AuraError, error codes
│   └── types.ts               # OperationRef, context types [NEW]
├── server/
│   ├── hono-app.ts            # createAuraHonoApp() factory [NEW]
│   ├── routes/                # Hono route modules [NEW]
│   │   ├── bridge.ts          # /aura/* POST + manifest GET
│   │   ├── internal.ts        # /aura-internal/* POST
│   │   ├── files.ts           # /files/* GET
│   │   ├── health.ts          # /health GET
│   │   └── http-actions.ts    # /aura-http/* (webhooks, callbacks) [NEW]
│   ├── middleware/            # Hono middleware [NEW]
│   │   ├── csrf.ts            # CSRF verification for bridge
│   │   └── rate-limit.ts     # In-memory rate limiter
│   ├── request-context.ts     # getAuraRequestHeaders(), applyAuraCookies() [NEW]
│   ├── call.ts                # callAuraServer, runAuraServer (updated imports)
│   ├── runner.ts              # runAuraOperation (enhanced: query/mutate/action contexts)
│   ├── create-context.ts      # createAuraContext (context per operation type) [ENHANCED]
│   ├── registry.ts            # Operation registry (enhanced: actions, http-actions)
│   ├── operation.ts           # defineOperationFn (enhanced: .action()) [ENHANCED]
│   ├── http-action.ts         # defineHttpAction [NEW]
│   ├── scheduler.ts           # AuraScheduler (ctx.scheduler.runAfter/runAt/cancel) [NEW]
│   ├── db.ts                  # Prisma singleton (unchanged)
│   ├── db-read.ts             # defineDbReadFn [NEW]
│   ├── db-readonly.ts         # PrismaReadOnlyClient proxy [NEW]
│   ├── hydration.tsx          # AuraHydration, prefetchAuraQuery (updated imports)
│   ├── invalidate.ts          # publishInvalidation (enhanced: instance-level) [ENHANCED]
│   ├── broadcast.ts           # Standalone broadcast server (unchanged)
│   ├── cron.ts                # defineCronFn, runAuraCron (unchanged)
│   ├── outbox.ts              # processOutboxEvents + scheduled jobs [ENHANCED]
│   ├── auth/                  # Auth subsystem (unchanged logic)
│   ├── storage/               # File storage drivers (enhanced: AuraStoredFile) [ENHANCED]
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── filesystem.ts
│   │   └── s3.ts
│   └── transport/
│       ├── cookies.ts         # Cookie helpers (updated for vinxi/http)
│       ├── csrf.ts            # CSRF token generation/verification (unchanged logic)
│       └── rate-limit-proxy.ts # In-memory rate limiter (unchanged logic)
├── shared/
│   ├── manifest.ts            # Manifest types (enhanced: actions)
│   ├── query-key.ts           # auraQueryKey helper
│   ├── params.ts              # Param schemas
│   └── auth-schemas.ts        # Auth Zod schemas
└── cli/                       # CLI tools (enhanced)
    ├── cron.ts
    ├── outbox.ts
    ├── doctor.ts
    ├── make.ts                # Enhanced: generates _generated/api.ts
    └── codegen.ts             # API type generation [NEW]
```

## Key Files Changed

| File | Change |
|------|--------|
| `server/call.ts` | Replace `import { headers, cookies } from "next/headers"` with `import { getAuraRequestHeaders, applyAuraCookies } from "./request-context"` |
| `server/create-context.ts` | Remove `import "server-only"` (Vite plugin handles it). Build context per operation type (query/mutate/action). |
| `server/runner.ts` | Enhanced: detect operation type, build appropriate context (read-only DB for queries, full DB for mutations, no DB for actions). |
| `server/operation.ts` | Enhanced: add `.action()` builder method, typed context per operation type. |
| `server/registry.ts` | Enhanced: register actions and HTTP actions alongside queries/mutations. |
| `server/hydration.tsx` | No changes — `QueryClient`, `dehydrate`, `AuraHydrationBoundary` all framework-agnostic. |
| `server/invalidate.ts` | Enhanced: support instance-level invalidation `{ entity, id }` alongside type-level `string`. |
| `server/outbox.ts` | Enhanced: also process scheduled jobs (`AuraJobRun` with `runAt`). |
| `client/hooks.ts` | Replace `useRouter().refresh()` with `useRouter().invalidate()`. Add `useAuraAction`. |
| `client/provider.tsx` | Remove `next/navigation` imports. Use `@tanstack/react-router`. Enhanced invalidation matching (instance-level). |
| `client/params.ts` | Switch nuqs adapter from `next` to `@nuqs/adapters/tanstack-router`. |

## Package.json Scripts (Post-Migration)

```json
{
  "scripts": {
    "dev": "prisma generate && vinxi dev",
    "build": "prisma generate && vinxi build",
    "start": "vinxi start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:studio": "prisma studio",
    "aura:doctor": "bun src/aura/cli/doctor.ts",
    "aura:cron": "bun src/aura/cli/cron.ts",
    "aura:outbox": "bun src/aura/cli/outbox.ts",
    "aura:make": "bun src/aura/cli/make.ts",
    "aura:broadcast": "bun src/aura/server/broadcast.ts"
  }
}
```

## Dependencies Changes

**Add:**
- `@tanstack/react-start` — meta-framework
- `@tanstack/react-router` — file-based routing
- `@tanstack/react-router-devtools` (dev)
- `vinxi` — server runtime (comes with TanStack Start)
- `@nuqs/adapters` — nuqs TanStack Router adapter
- `vite` (dev) — build tool

**Remove:**
- `next`
- `eslint-config-next`
- `next-env.d.ts`

**Keep:**
- `hono` — already present, now used for all Aura HTTP routes
- `@tanstack/react-query` — unchanged
- `@prisma/client`, `@prisma/adapter-pg`, `prisma` — unchanged
- `zod`, `zustand`, `react-hook-form`, `nuqs` — unchanged
- All UI libraries (shadcn, lucide, etc.) — unchanged

## Migration Sequence

1. **Phase 1 — Hono routes:** Create `createAuraHonoApp()` and the four route modules. Test standalone with Bun (no TanStack Start yet).
2. **Phase 2 — TanStack Start scaffold:** Initialize TanStack Start project, configure Vite, mount Hono app in server entry.
3. **Phase 3 — Server-side adapter:** Create `request-context.ts`, update `call.ts` and `create-context.ts` to use vinxi/http primitives.
4. **Phase 4 — Client migration:** Update hooks to use `@tanstack/react-router`, switch nuqs adapter, update provider.
5. **Phase 5 — DB-Optimized Reads:** Implement `defineDbReadFn`, add example view migration.
6. **Phase 6 — Parity tests:** Run the test plan from Requirement 15.
7. **Phase 7 — Cleanup:** Remove Next.js dependencies, delete `src/app/` directory, update CI.

## Testing Strategy

Parity tests use Hono's `app.request()` test helper (no real HTTP server needed):

```typescript
import { createAuraHonoApp } from "@/aura/server/hono-app";

const app = createAuraHonoApp();

test("bridge POST returns envelope", async () => {
  const res = await app.request("/aura/todo.list", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-aura-csrf": validToken },
    body: JSON.stringify({ input: {} }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
});
```

This validates the Hono layer in isolation. Integration tests with TanStack Start use Playwright for full SSR + hydration round-trips.

---

## Decision 26: AuraService — OOP Business Logic Layer

**Resolves:** Requirement 40

### Problem

Operation handlers mix validation (Zod), business logic, DB access, and side effects. `.action()` handlers crash when they touch `ctx.db.*` (tombstoned Proxy). `operationAsTool` creates a fresh context losing session/user. Business logic is not reusable or testable without mounting the full Aura context.

### Design

A base class `AuraService` that receives `AuraContext` once at construction and exposes every Aura capability through `this.*`:

```typescript
// src/aura/server/service.ts
import type { AuraContext } from "./context";

export class AuraService {
  constructor(protected ctx: AuraContext) {}

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

### Usage pattern

```typescript
// — Operation (thin transport layer) —
defineOperationFn("payments.start-checkout")
  .mutate()
  .input(z.object({ kind: z.enum(["boost", "badge", "pro"]) }))
  .entities(["Payment"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new PaymentService(ctx);
    return svc.initiate(ctx.user.id, input.kind);
  });

// — Service (business logic) —
class PaymentService extends AuraService {
  async initiate(userId: string, kind: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    const pricing = this.getPricing(kind);
    // Direct DB access — no conflict with .action() vs .mutate()
    const payment = await this.db.payment.create({
      data: { userId, kind, amountXaf: pricing.amount, status: "PENDING" },
    });
    // Side effects via this.runMutation, this.agent, etc.
    await this.runMutation("notifications.send", { userId, message: "..." });
    return payment;
  }
}
```

### How it resolves issues

| Issue | Before | After |
|-------|--------|-------|
| 3 actions crash on `ctx.db.*` | `.action()` → tombstoned Proxy → throw | `.mutate()` + Service → `this.db` full access |
| `operationAsTool` loses session | Fresh context via `createAuraContext({source:"internal"})` | Service constructor receives the caller's `ctx` → session/user preserved |
| Logic not testable | Must mock entire `AuraContext` | Mock `AuraService` or pass a test context |
| Mixed responsibilities | Handler = validation + DB + side effects | Handler = validation only. Service = business logic |

### Folder convention

Services live in `src/operations/_services/` and follow the same namespace convention as operations:

```
src/operations/_services/
├── payment-service.ts
├── matching-service.ts
├── inbox-service.ts
├── chat-service.ts
├── notification-service.ts
├── graph/
│   ├── knowledge-graph-service.ts
│   └── embedding-service.ts
└── agent/
    ├── user-agent-service.ts
    └── orchestrator-service.ts
```

Services can compose:
```typescript
class PaymentService extends AuraService {
  constructor(ctx: AuraContext, private notificationService: NotificationService) {
    super(ctx);
  }
}
```

### Relationship to other Aura patterns

- **Operations** remain the public API boundary (validation, auth, entities, envelope).
- **Services** encapsulate business logic and call operations via `this.runQuery/runMutation`.
- **Repositories** (optional) encapsulate Prisma queries, called by services.
- **Agents** receive services as tool callbacks, inheriting the calling user's context.

### Backward compatibility

Existing operations that use `ctx.db.*` directly continue to work — the Service pattern is additive, not a replacement. Operations can be migrated one by one at the developer's pace.
