# Aura — Documentation

Aura is a full-stack TypeScript framework built on **Hono + TanStack Start + Prisma**, with a Convex-inspired operation system, end-to-end type safety, real-time invalidation, AI agents, and a built-in UI kit.

## Quick links

- [Getting started](./getting-started.md) — install, run, first operation
- [Architecture](./architecture.md) — Hono, TanStack Start, in-process calls
- [Operations](./operations.md) — `defineOperationFn`: queries, mutations, actions
- [Context API](./context.md) — `ctx.db`, `ctx.runMutation`, `ctx.scheduler`, `ctx.agent`, `ctx.paginate`, …
- [Typed API surface](./typed-api.md) — `api.todos.list` with full inference
- [Folder conventions](./folder-conventions.md) — `.operation.ts`, `.agent.ts`, … (kebab-case enforced)
- [Realtime & invalidation](./realtime.md) — entity tags, broadcast, BroadcastChannel
- [Auth & sessions](./auth.md) — OTP, password, phone, session lifecycle
- [Security](./security.md) — CSRF, rate-limit, secrets
- [AI agents](./ai-agents.md) — `defineAgent`, threads, tools, streaming
- [UI Kit](./ui-kit.md) — `<AuraForm>`, `<AuraDataTable>`, `<AuraAgentChat>`, …
- [Pagination & search](./pagination-search.md) — cursor-based, full-text, vector
- [HTTP actions](./http-actions.md) — webhooks, OAuth callbacks
- [Workflows](./workflows.md) — durable multi-step flows
- [Scheduler & cron](./scheduler-cron.md) — `ctx.scheduler.runAfter`, `defineCronFn`
- [Storage](./storage.md) — filesystem & S3, `ctx.storage.store()`
- [CLI tools](./cli.md) — `aura:make`, `aura:codegen`, `aura:doctor`, `aura:cron`, `aura:outbox`
- [Env vars](./env-vars.md) — full reference

## Core principles

1. **Convention over configuration.** File names map to operation names: `src/operations/todos/list.operation.ts` ↔ `todos.list`.
2. **In-process calls.** Server-side `callAuraServer()` and `ctx.runQuery()` never make HTTP hops — direct function calls in the same Bun/Node process.
3. **Type inference everywhere.** `useAuraQuery(api.todos.list)` infers `data` shape from the operation's Zod schema. No casts, no manual generics.
4. **Entity-tagged invalidation.** Mutations declare `.entities(["Todo"])`; queries that read `Todo` auto-refetch on the next broadcast.
5. **One artifact per file.** A `.operation.ts` exports exactly one operation. Auto-discovery loads the registry.
