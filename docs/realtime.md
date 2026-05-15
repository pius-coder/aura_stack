# Realtime & invalidation

Aura's reactivity model is **entity-tagged invalidation broadcast**. It's lightweight, scales horizontally, and works the same way across same-tab, cross-tab, and cross-device.

## Concepts

- **Entity tag**: a string label declared by an operation. Conventionally a Prisma model name (`"Todo"`, `"Order"`).
- **Query entities**: declared by queries via `.entities([...])`. Lists what data the query reads.
- **Mutation entities**: declared by mutations/actions via `.entities([...])`. Lists what data the mutation writes.
- **Invalidation**: when a mutation finishes, every connected client checks whether any of its active queries shares an entity tag with the mutation, and refetches the matching ones.

## Same-tab invalidation (free, instant)

After a mutation succeeds, `useAuraMutation`'s `onSuccess` calls `queryClient.invalidateQueries({ predicate })` on the local TanStack Query cache. Predicate matches a query when:

1. The mutation's broadcast key equals the query's name, **OR**
2. The mutation's broadcast key is in the query's entity tags (from the manifest or `.entities([...])`).

No network round-trip. Fires immediately after the response.

## Cross-tab same-browser (BroadcastChannel, free, ~5 ms)

`AuraClientProvider` always mounts an `AuraRealtimeProvider` that owns a `BroadcastChannel("aura:realtime")`. After a local mutation, the client publishes a message on the channel, and every other tab's provider:

1. Deduplicates by message `id` within a 2-second window.
2. Runs the same `invalidateKeys()` predicate.
3. Refetches matching queries.

Works without any backend. No server-side broadcast required.

## Cross-device (WebSocket, ~50–150 ms)

When `VITE_AURA_WS_URL` is set, the **leader tab** of each browser holds a WebSocket to the broadcast server. Mutations in any tab/device → broadcast server → fan-out to every leader → fan-out to sibling tabs via `BroadcastChannel`.

```
Tab A (leader)  ──WS──▶ Broadcast server ──WS──▶ Tab B (leader, other browser)
                                                       │
                                                       ▼ BroadcastChannel
                                                Tab B sibling tabs
```

Leader election uses Web Locks (`navigator.locks.request("aura:ws-leader", ...)`). Only one tab per browser holds the WS, regardless of how many are open. If the leader closes, another tab acquires the lock and reconnects.

## Server-side broadcast (cron, outbox, RSC)

When a mutation runs from a non-browser source (cron, outbox, server-rendered loader), there's no client to broadcast for. The runner publishes via signed HTTP:

```
runner ──HMAC POST /invalidate──▶ Broadcast server ──WS fan-out──▶ All clients
```

The HMAC is signed with `AURA_INTERNAL_SECRET` (or `AURA_CSRF_SECRET` as fallback). The broadcast server verifies the signature and the timestamp window (60 s) before fanning out.

```ts
// src/aura/server/invalidate.ts
publishInvalidation({ keys: ["Todo", "Order"] });
```

## Invalidation flow (POST mutation from browser)

```
1. Browser   POST /aura/todos.create
2. Hono      validate CSRF, parse body
3. Runner    build ctx, validate input, run handler
4. Runner    handler returns → invalidates = [...op.entities, ...ctx.invalidatedEntities]
5. Runner    POST /invalidate (signed) → broadcast server
6. Broadcast WS fan-out to every connected leader
7. Leaders   match against TanStack Query cache, refetch
8. Leaders   relay to sibling tabs via BroadcastChannel
9. Local tab useAuraMutation.onSuccess → queryClient.invalidateQueries
              (also fires immediately, ahead of the broadcast round-trip)
```

## Instance-level invalidation

Static entity tags invalidate **all** queries reading that entity type. For finer control, use `ctx.invalidate({ entity, id })`:

```ts
.mutate()
.entities(["Order"])
.handler(async ({ ctx, input }) => {
  const order = await ctx.db.order.update({ where: { id: input.id }, data: ... });
  ctx.invalidate({ entity: "Order", id: order.id });
  return order;
});
```

This emits **both** `"Order"` (type-level) and `"Order:<id>"` (instance-level) on the broadcast. Queries can opt into instance-level matching:

```ts
useAuraQuery(api.orders.byId, {
  input: { id: orderId },
  entities: [{ entity: "Order", id: orderId }],
});
```

A list query without specific IDs still gets refetched on type-level invalidations (backward compatible).

## Tuning refetch behavior

The default `QueryClient` is configured for snappy refetch:

```ts
defaultOptions: {
  queries: {
    staleTime: 0,            // invalidated queries refetch immediately
    gcTime: 5 * 60_000,      // 5 min cache retention
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
  },
  mutations: { retry: false },
}
```

Override per-query when needed:

```ts
useAuraQuery(api.heavy.aggregation, {
  staleTime: 60_000,        // refetch at most once per minute
  refetchOnMount: false,
});
```

## Mutation refresh (router invalidate)

By default, mutations do **not** force a TanStack Router `router.invalidate()` (which would re-run every loader on the page). This avoids redundant work when client-side query invalidation has already covered the change.

Opt in per-call when a loader depends on the mutated data:

```ts
const create = useAuraMutation(api.posts.publish, { refresh: true });
```

This sets `meta.refresh = true` on the envelope, and the client calls `router.invalidate()` after the mutation succeeds.

## Deduplication

Every broadcast message carries a UUID `id`. Each client maintains a set of seen IDs with a 2-second TTL. Duplicates (same browser receiving its own message back through WebSocket → BroadcastChannel) are silently dropped.

## Failure modes

| Scenario | Effect |
|----------|--------|
| Broadcast server down | Mutations still succeed; only cross-device sync fails. Same-tab invalidation always works. Same-browser cross-tab works via BroadcastChannel. |
| WebSocket disconnect | Client reconnects with exponential backoff (1s → 2s → 4s → … → 30s cap). Missed events are not replayed. |
| Stale CSRF cookie | Transport detects FORBIDDEN response, refetches manifest (which reissues a fresh CSRF cookie via Set-Cookie), and retries the original request once. |
| HMAC signature mismatch | Broadcast server returns 403 — investigate `AURA_INTERNAL_SECRET` mismatch between app and broadcast process. |

## Performance targets

| Path | Latency |
|------|---------|
| Same-tab invalidation (TanStack Query predicate) | < 1 ms |
| Cross-tab same-browser (BroadcastChannel) | ~5 ms |
| Cross-device (WebSocket fan-out) | 50–150 ms |
| Refetch round-trip after invalidation | depends on the query — typically 50–200 ms over local DB |

To minimize total user-perceived latency: use small entity tag sets, avoid `refresh: true` unless the loader truly depends on the mutated data, and prefer short queries (cursor pagination, narrow `select`).
