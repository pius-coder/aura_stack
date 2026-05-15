# Operations

An **operation** is a typed, validated, authorized server function. Aura ships three primitives:

| Type | DB access | Side effects | Use case |
|------|-----------|--------------|----------|
| `.query()` | read-only proxy | none | fetching data, joins, aggregations |
| `.mutate()` | full Prisma + `$transaction` | DB writes only | create/update/delete records |
| `.action()` | none directly (must use `ctx.runQuery` / `ctx.runMutation`) | `fetch`, third-party SDKs, file I/O, AI | webhooks side-work, payments, AI |

All three share the same envelope, the same Zod input validation, the same auth gate, and the same entity invalidation surface.

## Builder API

```ts
import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("todos.list")
  .query()                          // .query | .mutate | .action
  .input(z.object({ status: z.enum(["PENDING","DONE"]).optional() }))
  .params(z.object({ /* nuqs-style search params */ }))
  .entities(["Todo"])               // tags this query reads
  .use(myMiddlewareFn)              // optional middleware chain
  .auth()                           // .auth | .public | .internal
  .handler(async ({ ctx, input, params }) => {
    return ctx.db.todo.findMany({
      where: { userId: ctx.user.id, ...(input.status && { status: input.status }) },
    });
  });
```

### Stages (in order)

1. **Type** — `.query()`, `.mutate()`, or `.action()`. Required.
2. **Schemas** — `.input(zod)` and `.params(zod)`. Optional, both default to `void`.
3. **Entities** — `.entities([...tags])`. Tags drive realtime invalidation.
4. **Middleware** — `.use(commonFn)`. Runs before the handler in declaration order.
5. **Access** — `.auth()`, `.public()`, or `.internal()`. Required.
6. **Handler** — `.handler(fn)`. Required terminal stage that registers the operation.

## Access control

| Modifier | Authentication | Bridge POST | Internal endpoint | Server call |
|----------|---------------|-------------|-------------------|-------------|
| `.public()` | not required | ✅ | ✅ | ✅ |
| `.auth()` | required (`ctx.user`/`ctx.session` non-null) | ✅ | ✅ | ✅ |
| `.internal()` | not required | ❌ (FORBIDDEN) | ✅ (with `x-aura-internal-secret`) | ✅ |

Use `.internal()` for cron jobs, outbox handlers, or any operation that should never be invoked from a browser — the bridge router rejects internal operations with `FORBIDDEN`.

## Envelope

Every operation returns an `AuraEnvelope`:

```ts
// Success
{
  ok: true,
  data: TOutput,
  meta: {
    requestId: string;
    bumps: AuraBump[];           // toasts queued via ctx.bump.*
    invalidates: string[];       // entity tags broadcast to other clients
    refresh: boolean;            // forces router.invalidate() on the client
  }
}

// Error
{
  ok: false,
  error: {
    code: AuraErrorCode;         // FORBIDDEN, VALIDATION_ERROR, NOT_FOUND, …
    message: string;
    status: number;              // HTTP status
    requestId: string;
    fieldErrors?: { [path: string]: string[] };  // populated by Zod errors
  }
}
```

The client transport unwraps `data` and throws `AuraClientError` on failure, so handlers consume `data` directly:

```tsx
const { data } = useAuraQuery(api.todos.list);
data;                  // T (TOutput) — never the envelope
```

## Common functions (middleware)

Reusable cross-cutting logic via `defineCommonFn`:

```ts
// src/operations/_middleware/with-organization.middleware.ts
import { defineCommonFn } from "@/aura/server/operation";

export default defineCommonFn("withOrganization")
  .run(async ({ ctx, params }) => {
    const orgId = (params as { orgId?: string }).orgId;
    if (!orgId) throw new AuraError("BAD_REQUEST", "Missing orgId");
    // Augment ctx — handlers can now read ctx as { ...base, organization }
  });
```

Use it on operations:

```ts
import withOrganization from "@/operations/_middleware/with-organization.middleware";

defineOperationFn("orders.list")
  .query()
  .params(z.object({ orgId: z.string() }))
  .use(withOrganization)
  .auth()
  .handler(...)
```

## Entity invalidation (Wasp-style)

Mutations and actions declare which entity tags they touch:

```ts
defineOperationFn("orders.cancel")
  .mutate()
  .entities(["Order", "Payment", "Shipment"])
  .auth()
  .handler(async ({ ctx, input }) => {
    await ctx.db.order.update({ where: { id: input.id }, data: { status: "cancelled" } });
    return { ok: true };
  });
```

After the handler returns:

1. Aura broadcasts `keys: ["Order", "Payment", "Shipment"]` to every connected client.
2. Each client's `useAuraQuery` cache is scanned: any query whose `.entities([...])` includes one of those tags is invalidated and refetches.
3. Other tabs of the same browser get the same signal via `BroadcastChannel` (no network hop).

You can also invalidate a **specific instance** from inside the handler:

```ts
.handler(async ({ ctx, input }) => {
  const order = await ctx.db.order.update({ where: { id: input.id }, data: { ... } });
  ctx.invalidate({ entity: "Order", id: order.id });  // instance-level
  return order;
});
```

See [Realtime](./realtime.md) for full invalidation semantics.

## Calling from another operation

Inside any handler, call other operations via the typed `ctx.runQuery` / `ctx.runMutation` / `ctx.runAction`:

```ts
.handler(async ({ ctx, input }) => {
  const order = await ctx.runQuery(api.orders.getById, { id: input.orderId });
  await ctx.runMutation(api.orders.markRefunded, { id: input.orderId });
  await ctx.runAction(api.notifications.send, { userId: order.userId, ... });
  return { ok: true };
});
```

These calls are **in-process** — no HTTP, no JSON serialization. Inner mutations' entity invalidations merge into the outer operation's invalidation set automatically.

String names also work for legacy / dynamic dispatch:

```ts
await ctx.runMutation("orders.markRefunded", { id });
```

## File location & naming

Operations live in `src/operations/<domain>/<name>.operation.ts`. The dotted operation name is **derived** from the file path:

| File | Operation name |
|------|----------------|
| `src/operations/system/health.operation.ts` | `system.health` |
| `src/operations/todos/list.operation.ts` | `todos.list` |
| `src/operations/admin/users/ban.operation.ts` | `admin.users.ban` |

File names must be **kebab-case** (Req 39): `product-by-slug.operation.ts` → `product-by-slug` (preserved as-is in the operation name).

See [Folder conventions](./folder-conventions.md) for the full set of suffix-based file types.
