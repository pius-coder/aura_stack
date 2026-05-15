# CLI tools

Aura ships a small set of CLI scripts under `bun aura:*`. All are pure Bun scripts in `src/aura/cli/`.

## `aura:make` — scaffold artifacts

Generate any Aura artifact with the right suffix, location, and boilerplate.

```bash
# Operations
bun aura:make operation todos.list --type query
bun aura:make operation todos.create --type mutate
bun aura:make operation payments.charge --type action

# Middleware
bun aura:make middleware with-organization

# Cron
bun aura:make cron analytics.daily --schedule "0 0 * * *"

# Workflow
bun aura:make workflow orders.fulfill

# AI agent
bun aura:make agent customer-support

# HTTP action / webhook
bun aura:make http webhooks/stripe --method POST

# Search index
bun aura:make search Product

# Vector index
bun aura:make vector Document --dimensions 1536

# DB-optimized read
bun aura:make db-read orders.summary

# UI component
bun aura:make ui aura-order-card
```

Every generated file:
- Lives in the correct folder per [conventions](./folder-conventions.md).
- Uses kebab-case naming.
- Has correct imports, types, and stub structure (compiles without edits).

## `aura:codegen` — regenerate `_generated/api.ts`

```bash
bun run aura:codegen
```

Scans `src/operations/` for `*.operation.ts` files, builds a nested `api` object, and writes `src/aura/_generated/api.ts`. Run after adding/renaming/deleting operations.

The codegen is **type-only** — it doesn't import operation runtime modules into the generated file, so the file stays in client bundles for free.

## `aura:doctor` — sanity check

```bash
bun aura:doctor
```

Validates:

- Every operation file has a registered name matching its file path.
- One artifact per file (no two `defineOperationFn` calls in one file).
- Kebab-case file names.
- No orphaned files (`.ts` files in `src/operations/` without a recognized suffix).
- `_registry.ts` includes every discovered file.
- `_generated/api.ts` is up to date.
- AI agents have their model API keys configured.
- Required env vars are present (database URL, secrets, etc.).

Output:

```
✓ 23 operations discovered (12 queries, 8 mutations, 3 actions)
✓ 4 middleware registered
✓ 3 cron jobs registered
✓ 2 agents registered
✓ All operation names match file paths
✗ WARNING: src/operations/legacy/old-handler.ts has no recognized suffix
```

## `aura:cron` — trigger a cron job

```bash
bun aura:cron run notifications.process-outbox
```

POSTs to `/aura-internal/runJob` with the `x-aura-internal-secret` header and the job name. The internal endpoint dispatches to `runAuraCron(name)` and returns the result.

Use in `crontab` or Kubernetes `CronJob`:

```cron
*/5 * * * * cd /app && bun aura:cron run notifications.process-outbox
```

## `aura:outbox` — process outbox events

```bash
bun aura:outbox
```

One-shot pass that:

1. Picks up to 100 `AuraOutboxEvent` rows with `status="PENDING"` and `nextRunAt <= now()`.
2. Locks each (`lockedAt` set, `status="PROCESSING"`).
3. Dispatches to the corresponding notification handler.
4. On success → `status="SUCCEEDED"`.
5. On failure → exponential backoff, retry up to `maxAttempts`.

Wrap in a loop in production:

```bash
while true; do bun aura:outbox; sleep 5; done
```

Or use `src/aura/server/scheduler-runner.ts` which combines outbox + scheduled `AuraJobRun` processing.

## `aura:broadcast` — run the broadcast server

```bash
bun aura:broadcast
```

Starts the Hono + Bun WebSocket broadcast server on `AURA_BROADCAST_PORT` (default 3001). Used by:

- `publishInvalidation()` (HMAC-signed POST `/invalidate`)
- Browser clients (WebSocket `/ws`)

Already wired into `bun run dev` via `concurrently`, so you don't normally invoke it directly in dev.

## NPM scripts (composite)

| Script | What it runs |
|--------|--------------|
| `bun run dev` | Vite + broadcast in parallel |
| `bun run dev:vite` | Vite only |
| `bun run build` | `prisma generate && vite build` |
| `bun run preview` | `vite preview` |
| `bun run test` | `vitest run` |
| `bun run db:generate` | `prisma generate` |
| `bun run db:push` | Push schema to DB without migration |
| `bun run db:migrate` | Create + apply a migration |
| `bun run db:deploy` | Apply pending migrations (production) |
| `bun run db:studio` | Open Prisma Studio |

## Scripted workflows

### Add a new feature module

```bash
bun aura:make operation orders.list --type query
bun aura:make operation orders.create --type mutate
bun aura:make operation orders.cancel --type mutate
# Edit the generated files
# Add them to src/operations/_registry.ts
bun run aura:codegen
bun aura:doctor    # verify everything is clean
bun run test
```

### Add a webhook

```bash
bun aura:make http webhooks/stripe --method POST
# Edit the handler
# Register the file in _registry.ts so it auto-mounts
bun run aura:doctor
```
