# Folder conventions

Aura enforces a strict folder + file-name convention. Every artifact type has a dedicated suffix, and file names are **kebab-case**. Operation names are derived literally from file paths.

## Canonical layout

```
src/operations/
├── _registry.ts                     # Auto-generated barrel
├── _services/                       # ← Business logic services (extends AuraService)
│   ├── todo-service.ts              #   NOT namespaced — _services/ is a reserved
│   ├── payment-service.ts           #   directory that doesn't create operation names
│   └── notification-service.ts
├── _middleware/                     # Reusable middleware
│   ├── with-auth.middleware.ts
│   └── with-organization.middleware.ts
├── todos/                           # Domain namespace = "todos"
│   ├── list.operation.ts            # → "todos.list" (query)
│   ├── create.operation.ts          # → "todos.create" (mutate)
│   ├── update.operation.ts          # → "todos.update" (mutate)
│   ├── delete.operation.ts          # → "todos.delete" (mutate)
│   ├── ai-generate.operation.ts     # → "todos.ai-generate" (action)
│   ├── refresh-views.cron.ts        # → cron "todos.refresh-views"
│   ├── fulfill.workflow.ts          # → workflow "todos.fulfill"
│   └── search.search.ts             # → full-text search index on Todo
├── ai/
│   ├── todo-planner.agent.ts        # → agent "ai.todo-planner"
│   └── customer-support.agent.ts
├── notifications/                   # defineNotificationFn — ne créent pas d'operation
│   ├── match-request.notification.ts
│   └── payment-success.notification.ts
├── webhooks/
│   └── stripe.http.ts               # → POST /aura-http/webhooks/stripe
└── documents/
    ├── search.search.ts
    └── embeddings.vector.ts
```

## Suffix conventions

| Suffix | Artifact | Builder | One-per-file |
|--------|----------|---------|--------------|
| `.operation.ts` | Query, mutation, or action | `defineOperationFn(name).query \| .mutate \| .action` | ✅ |
| `.middleware.ts` | Operation middleware | `defineCommonFn(name).run(fn)` | ✅ |
| `.cron.ts` | Scheduled cron job | `defineCronFn(name).schedule(expr).handler(fn)` | ✅ |
| `.workflow.ts` | Durable multi-step flow | `defineWorkflow(name).handler(fn)` | ✅ |
| `.agent.ts` | AI agent | `defineAgent(name, { ... })` | ✅ |
| `.http.ts` | Raw HTTP handler (webhook) | `defineHttpAction(path, method).handler(fn)` | ✅ |
| `.rag.ts` | RAG source declaration | `defineRAGSource(name, { ... })` | ✅ |
| `.search.ts` | Full-text search index | `defineSearchIndex(model, { ... })` | ✅ |
| `.vector.ts` | pgvector index | `defineVectorIndex(model, { ... })` | ✅ |
| `.db-read.ts` | Optimized DB read (view, raw SQL) | `defineDbReadFn({ ... })` | ✅ |
| `.component.ts` | Reusable Aura component | `defineComponent(name, { ... })` | ✅ |
| `.notification.ts` | Notification definition | `defineNotificationFn(name).payload(z).handler(fn)` | ✅ |
| `.service.ts` | Business logic service (in `_services/`) | `extends AuraService` | ✅ |

## Name derivation

```
src/operations/<dir1>/<dir2>/<file>.<suffix>.ts   →   <dir1>.<dir2>.<file>
```

Examples:

| File path | Derived name |
|-----------|--------------|
| `system/health.operation.ts` | `system.health` |
| `todos/list.operation.ts` | `todos.list` |
| `catalog/product-by-slug.operation.ts` | `catalog.product-by-slug` |
| `admin/users/ban.operation.ts` | `admin.users.ban` |
| `webhooks/stripe.http.ts` | (HTTP path: `/webhooks/stripe`) |

Subdirectories starting with `_` (e.g. `_middleware/`) are **not** treated as namespace segments — files in them are referenced by their own name only.

## Kebab-case rule

All file names must be lowercase with hyphens. The `aura:doctor` CLI flags violations.

```
✅ product-by-slug.operation.ts
✅ with-organization.middleware.ts
✅ aura-data-table.tsx
✅ customer-support.agent.ts

❌ productBySlug.operation.ts
❌ withOrganization.middleware.ts
❌ AuraDataTable.tsx
```

The dotted operation name preserves kebab-case literally:

```ts
api.catalog["product-by-slug"]   // not api.catalog.productBySlug
ctx.runQuery(api.catalog["product-by-slug"], { slug })
```

## Auto-discovery

`src/operations/_registry.ts` is the import barrel that **side-effect-imports** every artifact file at server boot. Aura's `defineOperationFn`, `defineAgent`, etc. all register themselves on import, so the registry just has to exist for them to be reachable.

You can hand-write the registry (most projects do) or generate it with the discovery scanner:

```ts
import { discoverArtifacts, generateRegistrySource } from "@/aura/server/discovery";
import { writeFileSync } from "node:fs";

const artifacts = discoverArtifacts("src/operations");
writeFileSync("src/operations/_registry.ts", generateRegistrySource(artifacts, "src/operations"));
```

## Validation

`bun aura:doctor` checks:

- ✅ Every operation name matches its derived file path
- ✅ One artifact per file (no two `defineOperationFn` calls in the same file)
- ✅ Kebab-case file names
- ✅ No files outside the canonical structure
- ✅ Registry up to date with discovered files
- ✅ `_generated/api.ts` up to date with the registry

## Why such strict conventions?

- **Predictability** — you can find any operation by its name without grep.
- **Refactor safety** — moving a file changes the operation name; the typed `api` codegen surface catches every consumer at compile time.
- **Tooling-friendly** — IDEs, linters, and CLI tools work uniformly across every Aura project.
- **No central registry to edit** — adding an operation never requires editing a central manifest by hand.
