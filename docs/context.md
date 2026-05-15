# Context API (`ctx`)

Every operation handler receives `ctx`, the per-request context. It carries the database, the resolved session, the in-process call surface, the scheduler, the agent, and request-scoped helpers.

## Quick reference

| Property | Type | Available in | Description |
|----------|------|--------------|-------------|
| `ctx.db` | `PrismaClient` | mutate (full) / query (read-only proxy) / action (forbidden) | Database access |
| `ctx.session` | `AuraSessionData \| null` | all | Resolved session row |
| `ctx.user` | `AuraUser \| null` | all | Resolved user row |
| `ctx.auth` | `AuraAuthContext` | all | Set/clear session cookies |
| `ctx.notify` | `NotificationDispatcher` | all | Queue notifications |
| `ctx.bump` | `AuraBumpStore` | all | Queue toasts (returned in envelope) |
| `ctx.log` | `AuraLogger` | all | Request-scoped structured logging |
| `ctx.audit` | `AuraAuditContext` | all | Persist audit log entries |
| `ctx.requestId` | `string` | all | UUID per request |
| `ctx.source` | `"bridge" \| "rsc" \| "internal" \| "cron" \| "scheduler" \| "test"` | all | Where the call came from |
| `ctx.request` | `AuraRequestMetadata` | all | IP, user-agent, origin, country |
| `ctx.cookies.set` | `AuraCookieMutation[]` | all | Queued cookie writes |
| `ctx.storage` | `AuraStorage` | all | File storage facade |
| `ctx.scheduler` | `AuraScheduler` | mutate / action | Schedule operations |
| `ctx.agent` | `AuraAgent` | all | AI agents |
| `ctx.runQuery` | `(ref, input) → Promise<T>` | all | Call another query |
| `ctx.runMutation` | `(ref, input) → Promise<T>` | all | Call another mutation |
| `ctx.runAction` | `(ref, input) → Promise<T>` | all | Call another action |
| `ctx.paginate` | `(model, opts) → PaginatedResult` | all | Cursor pagination helper |
| `ctx.invalidate` | `({ entity, id? }) → void` | mutate / action | Queue an extra invalidation |
| `ctx.fetch` | `typeof fetch` | action | Outbound HTTP (explicit surface) |

## `ctx.db`

The Prisma client. The runner swaps in a **read-only proxy** for queries — calls like `ctx.db.todo.create()` from inside a `.query()` handler throw `AuraError("INTERNAL_ERROR")` at runtime.

```ts
.query()
.handler(async ({ ctx }) => {
  return ctx.db.todo.findMany({ where: { userId: ctx.user.id } });
})

.mutate()
.handler(async ({ ctx, input }) => {
  return ctx.db.$transaction(async (tx) => {
    const order = await tx.order.create({ data: input });
    await tx.orderEvent.create({ data: { orderId: order.id, type: "created" } });
    return order;
  });
})
```

Actions get a tombstoned `db` that throws on every property — they must go through `ctx.runQuery` / `ctx.runMutation`.

## `ctx.runQuery` / `ctx.runMutation` / `ctx.runAction`

Call any registered operation in-process, with full type safety when given a typed `OperationRef`:

```ts
import { api } from "@/aura/_generated/api";

const product = await ctx.runQuery(api.catalog.productBySlug, { slug: "widget" });
//      ^? typed as the handler's return value

await ctx.runMutation(api.orders.markRefunded, { id: orderId });
await ctx.runAction(api.notifications.send, { userId, channel: "email" });
```

Inner mutation invalidations merge into the outer operation's invalidation set automatically.

## `ctx.bump.*` — server-side toasts

Queue toasts that are auto-displayed by `<AuraBumpToaster>`:

```ts
.handler(async ({ ctx }) => {
  await ctx.db.todo.create({ data: { ... } });
  ctx.bump.success("Tâche créée", "La tâche a été ajoutée à votre liste.");
  ctx.bump.warning("Quota presque atteint", "Il vous reste 3 tâches gratuites.");
  // Available variants: success | error | info | warning
})
```

Mount the toaster once in your root layout:

```tsx
import { AuraBumpToaster } from "@/aura/ui";
<AuraBumpToaster />
```

## `ctx.invalidate({ entity, id? })`

Queue an additional entity invalidation that fires after the handler returns. Useful when the static `.entities([...])` declaration isn't precise enough:

```ts
.mutate()
.entities(["Order"])
.handler(async ({ ctx, input }) => {
  const order = await ctx.db.order.update({ where: { id: input.id }, data: { ... } });
  // Type-level: `.entities(["Order"])` invalidates ALL order queries.
  // Instance-level: only queries watching THIS specific order refetch.
  ctx.invalidate({ entity: "Order", id: order.id });
  return order;
});
```

Client side, `useAuraQuery(api.orders.byId, { id })` can declare `entities: [{ entity: "Order", id }]` to opt into instance-level matching.

## `ctx.scheduler`

Schedule another operation to run later. See [Scheduler & cron](./scheduler-cron.md).

```ts
const jobId = await ctx.scheduler.runAfter(
  5 * 60 * 1000,                 // 5 minutes
  api.emails.sendReminder,        // typed ref
  { orderId: order.id },          // typed input
);

await ctx.scheduler.cancel(jobId);
```

## `ctx.agent`

Talk to a registered AI agent. See [AI agents](./ai-agents.md).

```ts
const thread = await ctx.agent.createThread(supportAgent, { userId: ctx.user.id });
const response = await ctx.agent.generateText(thread, { prompt: "How do I cancel?" });
ctx.bump.info(response.content);
```

## `ctx.paginate`

Cursor-based pagination helper. Returns `{ items, cursor, isDone }`:

```ts
.query()
.input(z.object({
  cursor: z.string().nullish(),
  numItems: z.number().int().positive().max(100).default(20),
}))
.handler(async ({ ctx, input }) => {
  return ctx.paginate(ctx.db.todo, {
    where: { userId: ctx.user.id },
    cursor: input.cursor ?? undefined,
    take: input.numItems,
    orderBy: "createdAt",
    direction: "desc",
    operationHash: "todos.list",  // binds cursor to this operation
  });
});
```

Cursors are HMAC-signed — they can't be forged or replayed against a different operation.

## `ctx.storage`

File storage facade backed by filesystem (dev) or S3 (prod). See [Storage](./storage.md).

```ts
const storageId = await ctx.storage.store(file, { filename: file.name });
const url = ctx.storage.getUrl(storageId);
await ctx.storage.delete(storageId);
```

## `ctx.notify`

Queue a notification (persisted in `AuraOutboxEvent`, processed by `aura:outbox`):

```ts
await ctx.notify.via("email").send({ to: "user@example.com", template: "welcome" });
```

## `ctx.audit`

Persist a row in `AuraAuditLog`:

```ts
await ctx.audit.record("orders.cancel", { orderId, reason: input.reason });
```

## `ctx.fetch` (action only)

Explicit `fetch` surface — actions are the only place where outbound HTTP is allowed:

```ts
.action()
.handler(async ({ ctx }) => {
  const res = await ctx.fetch("https://api.stripe.com/v1/charges", { ... });
  return res.json();
});
```

## Per-render deduplication (RSC)

When multiple components within the same React render call `callAuraServer({ operationName: "X", input })` with the same args, the runner uses React's `cache()` to execute the underlying handler **once** and share the result. Session resolution is similarly memoized — N components → 1 cookie parse, 1 DB lookup.
