# Implementation Plan: Aura Hono + TanStack Start Migration

## Overview

This plan migrates the Aura framework from Next.js to Hono + TanStack Start, adds Convex-inspired primitives (actions, scheduler, workflows, components), AI agent integration (LangChain/LangGraph), a built-in UI kit (shadcn), and strict folder conventions with kebab-case naming. Tasks are organized into phases: core infrastructure first, then enhanced primitives, then AI/UI layers, then wiring and validation.

## Tasks

- [x] 0. Project Bootstrap — Fresh TanStack Start + Hono Init
  - [x] 0.1 Archive current Next.js codebase into `tmp/legacy-aura-nextjs/`
    - Move `src/`, `next.config.*`, `next-env.d.ts`, `.next/`, `tsconfig.json`, `eslint.config.*` into `tmp/legacy-aura-nextjs/`
    - Keep `prisma/`, `.kiro/`, `.git/`, `.env*`, `package.json` at the workspace root for reference and reuse
    - Document in `tmp/legacy-aura-nextjs/README.md` that this folder is the pre-migration snapshot, not part of the build, and will be deleted at the end of the migration once parity tests pass
    - _Requirements: 15.1, 15.2_

  - [x] 0.2 Initialize a fresh TanStack Start project at the workspace root
    - Run the official TanStack Start CLI: `bunx @tanstack/cli create . --package-manager bun --framework React` (current canonical bootstrap command)
    - Configure Vite with the `bun` preset matching the deployment target
    - Verify default app boots: `bun --bun run dev` renders the TanStack Start landing page on port 3001
    - Commit the bootstrap as a single commit `chore: init tanstack start scaffold` for clean diffability
    - _Requirements: 12.1, 12.2_

  - [x] 0.3 Wire Hono into the TanStack Start server entry
    - Installed `hono@4.12.18` via `bun add hono`
    - Created `src/aura/server/hono-app.ts` exporting `createAuraHonoApp()` factory with `/health` endpoint placeholder
    - Created `src/server.ts` custom server entry that routes `/aura/**`, `/aura-internal/**`, `/files/**`, `/health` to Hono, everything else to TanStack Start
    - Verified: `curl http://localhost:3000/health` returns `ok`, `curl http://localhost:3000/` returns TanStack Start landing page
    - _Requirements: 1.13, 2.2_

  - [x] 0.4 Re-establish Prisma + database tooling in the new project
    - Created `prisma/schema.prisma` with the 11 Aura framework models (AuraUser, AuraPhoneIdentity, AuraPasswordCredential, AuraOtpChallenge, AuraSession, AuraRateLimitBucket, AuraNotification, AuraOutboxEvent, AuraJobRun, AuraAuditLog, AuraFile) — only framework-level models, business models are out of scope for this spec
    - Installed Prisma 7 deps: `@prisma/client@7.8.0`, `@prisma/adapter-pg@7.8.0`, `prisma@7.8.0`, `pg@8.20.0`, `@types/pg`, `dotenv`
    - Initialized via `bunx prisma init --datasource-provider postgresql` which created `prisma.config.ts` (Prisma 7 config-file pattern)
    - Wired `prisma generate` as a precondition of `dev` and `build` in `package.json`; added `db:generate`, `db:push`, `db:migrate`, `db:deploy`, `db:studio` scripts
    - Created local PostgreSQL `aura_stack` database, set `DATABASE_URL` in `.env`, ran `bun run db:push` — all 11 Aura tables created successfully
    - _Requirements: 3.1, 3.2, 3.3, 12.2, 15.1_

  - [x] 0.5 Recreate the canonical folder skeleton
    - Created empty directories matching Decision 25's strict folder convention with `.gitkeep` files:
      ```
      src/
      ├── operations/
      │   ├── _middleware/
      │   └── catalog/      # placeholder, deletable
      ├── aura/
      │   ├── _generated/
      │   ├── client/
      │   ├── core/
      │   ├── server/
      │   │   ├── routes/
      │   │   ├── middleware/
      │   │   ├── auth/
      │   │   ├── storage/
      │   │   └── transport/
      │   ├── shared/
      │   ├── ui/
      │   └── cli/
      └── app/             # TanStack Start routes
          └── routes/
      ```
    - Created top-level `aura.config.ts` with `defineAuraConfig({ operationsDir, generatedDir, uiDir, routesDir, enforceKebabCase })` placeholder
    - Moved existing TanStack Start routes from `src/routes/` to `src/app/routes/`, updated `src/router.tsx` to import from `./app/routeTree.gen`, and configured `tanstackStart({ router: { routesDirectory: 'app/routes', generatedRouteTree: 'app/routeTree.gen.ts' } })` in `vite.config.ts`
    - Verified end-to-end: `/` and `/about` return 200 (TanStack Start), `/health` returns `ok` (Hono in-process)
    - _Requirements: 37.1, 37.9, 38.8_

  - [x] 0.6 Restore the Aura framework code from `tmp/` into the new structure
    - Copied framework-internal files from `tmp/legacy-aura-nextjs/src/aura/` into `src/aura/`:
      - `client/` (13 files): hooks, transport, provider, guard, form, stepper, hydration-boundary, params, manifest-cache
      - `core/` (2 files): envelope, errors
      - `shared/` (6 files): manifest, auth-schemas, auth-types, notification-schemas, params, query-key
      - `cli/` (5 files): cron, doctor, make, outbox
      - `server/` (27 files): call, context, create-context, registry, runner, operation, db, bump, invalidate, crypto, json, logger, notifications, outbox, cron, rate-limit, rate-limit-common, params, hydration, manifest-injector, broadcast, storage/{filesystem, s3, index, types}, transport/{cookies, csrf, rate-limit-proxy}, auth/{session, otp, password, phone, operations, notifications}
      - `auth/components/` (3 files): country-phone-select, forms, sessions
      - `entities.ts`
    - Did NOT copy Next.js route handlers (`src/app/aura/`, `src/app/aura-internal/`, `src/app/files/`, `src/app/health/`) — replaced by Hono routers in Phase 1
    - Verified TypeScript compilation: **core framework (server/, client/, core/, shared/, cli/) compiles with 0 errors**
    - `auth/components/` has 51 errors from missing app-level dependencies (`next/link`, `sonner`, `@/components/ui/*`, `@/lib/*`) — to be addressed in Phase 4 when migrating auth UI to TanStack Start
    - Standalone Hono broadcast server (`server/broadcast.ts`) preserved as-is per Requirement 10.1
    - _Requirements: 5.1, 5.5, 5.6, 5.7, 6.1, 6.2, 9.1, 9.2, 10.1, 11.1_

  - [X] 0.7 Install all new and existing dependencies
    - Add: `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-router-devtools` (dev), `vinxi`, `vite` (dev), `@nuqs/adapters`, `hono`, `@hono/node-server` (or use `hono/bun`)
    - Add AI dependencies (deferred install — only when Phase 23 starts): `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`, `@langchain/anthropic`, `ai`
    - Remove: `next`, `eslint-config-next`, `next-env.d.ts`
    - Keep all other deps (`@tanstack/react-query`, `@prisma/*`, `zod`, `zustand`, `react-hook-form`, `nuqs`, `sonner`, all shadcn-related deps)
    - Verify `bun install` completes without errors
    - _Requirements: 12.1, 12.3, 12.4_

  - [x] 0.8 Bootstrap a non-trivial smoke route to validate the new stack
    - Add a single TanStack Start route at `src/app/routes/index.tsx` that calls `useAuraQuery(api.system.health, {})` (a temporary placeholder operation)
    - Add a temporary placeholder `src/operations/system/health.operation.ts` with a query that returns `{ ok: true, ts: Date.now() }` (validates the operations folder + `_generated/api.ts` codegen + the Hono → in-process call path)
    - Confirm hot-reload works on the operation file and the route file
    - This task validates that Hono, TanStack Start, Aura runtime, the codegen, and the folder convention all work together end-to-end before any of the deeper migration tasks begin
    - _Requirements: 1.13, 2.2, 5.5, 13.1, 24.1, 37.1_

- [x] 1. Core Hono HTTP Layer and Route Modules
  - [x] 1.1 Create the Hono app factory and core types
    - Create `src/aura/server/hono-app.ts` with `createAuraHonoApp()` factory
    - Create `src/aura/core/types.ts` with `OperationRef`, context type interfaces (`AuraQueryContext`, `AuraMutationContext`, `AuraActionContext`, `BaseAuraContext`)
    - Define the `AuraCookieMutation` type for cookie serialization
    - _Requirements: 1.13, 16.1, 19.1, 19.2, 19.3_

  - [x] 1.2 Implement the Aura Bridge router (`/aura/*`)
    - Create `src/aura/server/routes/bridge.ts` as a standalone Hono router
    - Handle `POST /aura/:path{.+}` — resolve operation name by joining path segments with `.`, dispatch through `runAuraOperation`
    - Handle `GET /aura/_manifest` — return `getClientOperationManifest()` with HTTP 200
    - Handle `GET /aura/*` (anything else) — return HTTP 405 with `AuraEnvelope` error `METHOD_NOT_ALLOWED`
    - Validate `content-type: application/json` on POST, return 400 `BAD_REQUEST` if missing
    - Validate JSON body is an object, return 400 `BAD_REQUEST` if not
    - Serialize cookie mutations from `runAuraOperation` onto the Hono response via `Set-Cookie` headers
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.3 Implement the Aura Internal router (`/aura-internal/*`)
    - Create `src/aura/server/routes/internal.ts` as a standalone Hono router
    - Handle `POST /aura-internal/:path{.*}` — validate `x-aura-internal-secret` header against `AURA_INTERNAL_SECRET`
    - Return HTTP 403 `FORBIDDEN` on missing/mismatched secret
    - On valid request with `{ jobName }`, invoke `runAuraCron(jobName)` and return 200/500 based on result
    - _Requirements: 1.8, 1.9, 1.10_

  - [x] 1.4 Implement the Aura Files router (`/files/*`)
    - Create `src/aura/server/routes/files.ts` as a standalone Hono router
    - Handle `GET /files/:path{.+}` — resolve path against `AURA_STORAGE_PATH`
    - Reject path traversal (`..`) with HTTP 400
    - Return HTTP 404 when file is absent
    - Detect MIME type for known extensions (`png|jpg|jpeg|webp|gif|pdf|txt`), fallback to `application/octet-stream`
    - Set `cache-control: public, max-age=86400`
    - _Requirements: 1.11, 9.3, 9.4_

  - [x] 1.5 Implement the Aura Health router (`/health`)
    - Create `src/aura/server/routes/health.ts` as a standalone Hono router
    - Handle `GET /health` — ping Prisma with `SELECT 1`
    - Return `{ ok, uptime, timestamp, latencyMs, services: { database } }` with HTTP 200 on success, 503 on failure
    - _Requirements: 1.12_

  - [x] 1.6 Write unit tests for all Hono route modules
    - Test bridge happy path (POST operation, GET manifest, 405 on other GET)
    - Test internal secret validation (403 on bad secret, 200 on valid)
    - Test files path traversal rejection, 404, MIME detection
    - Test health probe success and failure
    - _Requirements: 1.1–1.12, 15.3_

- [x] 2. CSRF and Rate Limiting Middleware on Hono
  - [x] 2.1 Implement CSRF middleware for the bridge router
    - Create `src/aura/server/middleware/csrf.ts` as Hono middleware
    - Apply to unsafe HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) on the bridge router only
    - Verify `x-aura-csrf` header against `aura_csrf` cookie using `verifyCsrfToken` (constant-time comparison)
    - Return HTTP 403 `FORBIDDEN` on CSRF failure
    - Fail fast at server startup if `AURA_CSRF_SECRET` (or `AURA_INTERNAL_SECRET` fallback) is missing in production
    - Preserve CSRF token format: `${nonce}.${HMAC_SHA256(secret, nonce)}` with 24 random bytes base64url nonce
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 2.2 Implement rate limiting middleware for Hono
    - Create `src/aura/server/middleware/rate-limit.ts` as Hono middleware
    - Expose `takeRateLimitToken(key, limit, windowMs)` as in-memory bucket
    - Return HTTP 429 `RATE_LIMITED` when proxy-level limiter exceeds limit
    - Preserve `enforceRateLimit(db, { key, limit, windowSeconds })` DB-backed bucket semantics on `AuraRateLimitBucket`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 2.3 Write unit tests for CSRF and rate limiting middleware
    - Test CSRF token generation, verification, and rejection
    - Test rate limit token bucket behavior (allow, deny, window reset)
    - Test DB-backed rate limit enforcement
    - _Requirements: 7.1–7.5, 8.1–8.4_

- [x] 3. Checkpoint — Hono layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. TanStack Start Integration and Request Context
  - [x] 4.1 Create the TanStack Start server entry and config
    - Create `app.config.ts` with TanStack Start configuration
    - Mount the Aura Hono app (`createAuraHonoApp()`) before TanStack Start's handler
    - Configure Bun preset (or Node) and Vite integration
    - Wire `prisma generate` as a precondition of `dev` and `build`
    - _Requirements: 2.2, 12.1, 12.2_

  - [x] 4.2 Implement the request context adapter
    - Create `src/aura/server/request-context.ts`
    - Implement `getAuraRequestHeaders()` using `getEvent()` from `vinxi/http` to resolve per-request headers
    - Implement `applyAuraCookies(mutations)` using `setCookie`/`deleteCookie` from `vinxi/http`
    - _Requirements: 2.3, 2.4_

  - [X] 4.3 Update `callAuraServer` and `runAuraServer` to use the new request context
    - Modify `src/aura/server/call.ts` — replace `import { headers, cookies } from "next/headers"` with `getAuraRequestHeaders` and `applyAuraCookies`
    - Preserve React `cache()` deduplication for queries and always-execute path for mutations
    - Preserve `prefetchAuraQuery` and `<AuraHydration>` exports
    - _Requirements: 2.3, 2.4, 5.6, 5.7, 13.2, 13.5_

  - [x] 4.4 Update `createAuraContext` for per-operation-type context
    - Modify `src/aura/server/create-context.ts` — remove `import "server-only"` (Vite plugin handles it)
    - Build `AuraQueryContext` (read-only DB), `AuraMutationContext` (full DB + scheduler), `AuraActionContext` (no direct DB, runQuery/runMutation/runAction + scheduler + storage + fetch)
    - Preserve per-render React `cache()` memoization of session resolution
    - _Requirements: 6.2, 13.5, 16.2, 19.1, 19.2, 19.3_

  - [X] 4.5 Implement the Vite `server-only` enforcement plugin
    - Create a Vite plugin in the Vite config that errors when `"server-only"` is imported in a client chunk
    - Ensure any module importing `"server-only"` triggers a build error if pulled into client bundle
    - _Requirements: 2.9, 12.5_

  - [X] 4.6 Update `package.json` scripts for TanStack Start
    - Replace `next dev`/`next build`/`next start` with `vinxi dev`/`vinxi build`/`vinxi start`
    - Keep `prisma generate` as precondition of `dev` and `build`
    - Keep `aura:doctor`, `aura:cron`, `aura:outbox`, `aura:make`, `aura:broadcast` scripts
    - Remove `next`, `eslint-config-next` dependencies; keep `nuqs` (switch to `@nuqs/adapters/tanstack-router`)
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [X] 4.7 Update client hooks for TanStack Router
    - Modify `src/aura/client/hooks.ts` — replace `useRouter().refresh()` with `useRouter().invalidate()` from `@tanstack/react-router`
    - Modify `src/aura/client/provider.tsx` — remove `next/navigation` imports, use `@tanstack/react-router`
    - Modify `src/aura/client/params.ts` — switch nuqs adapter from `next` to `@nuqs/adapters/tanstack-router`
    - _Requirements: 2.7, 2.8, 5.5_

  - [X] 4.8 Update hydration and manifest injection for TanStack Start
    - Modify `src/aura/server/hydration.tsx` — preserve `<AuraHydration>` semantics (server-side prefetch → dehydrate → client `<AuraHydrationBoundary>`)
    - Preserve `<AuraProviderShell>` semantics (server-side manifest computation → client seeding)
    - Preserve `loadAuraParams` for server-side nuqs parsing on TanStack Start route loaders
    - _Requirements: 2.5, 2.6, 2.8, 13.1, 13.3_

  - [ ] 4.9 Write integration tests for TanStack Start server-side calls
    - Test `callAuraServer` resolves headers from TanStack Start request context
    - Test cookie mutations applied via vinxi/http
    - Test `router.invalidate()` triggers on `meta.refresh = true`
    - Test hydration round-trip (prefetch → dehydrate → client rehydrate)
    - _Requirements: 2.3, 2.4, 2.5, 2.7, 15.3_

- [X] 5. Checkpoint — TanStack Start integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [X] 6. Auth Subsystem Migration
  - [X] 6.1 Migrate auth session resolution to Hono/TanStack Start
    - Update `resolveSessionFromRequest` to use `getAuraRequestHeaders()` instead of `next/headers`
    - Preserve `createSession`, `revokeCurrentSession`, `revokeAllUserSessions` semantics
    - Preserve per-render React `cache()` memoization of session resolution
    - Preserve session cookie settings: `httpOnly`, `secure` (driven by `NODE_ENV`), `sameSite=lax`, `path=/`, `expires`
    - Preserve CSRF cookie settings: non-`httpOnly`, `secure` (driven by `NODE_ENV`), `sameSite=lax`, `path=/`, `expires`
    - _Requirements: 6.1, 6.2, 6.9, 6.10_

  - [X] 6.2 Preserve auth session validation logic
    - Preserve: delete-cookie mutation when session cookie doesn't resolve to a live `AuraSession`
    - Preserve: fire-and-forget `lastUsedAt` update when session older than 60 seconds
    - Preserve: `SESSION_EXPIRED` error on expired session
    - Preserve: `SESSION_REVOKED` error on disabled/deleted user or `sessionVersion` mismatch
    - Preserve OTP, password, and phone authentication operations in `server/auth/operations.ts`
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [X] 6.3 Write unit tests for auth session resolution on Hono
    - Test session resolution from request headers
    - Test session revocation scenarios (expired, version mismatch, disabled user)
    - Test cookie mutation on invalid session
    - _Requirements: 6.1–6.10, 15.3_

- [X] 7. Operation System Enhancements (Action Primitive)
  - [X] 7.1 Extend the operation builder with `.action()` type
    - Modify `src/aura/server/operation.ts` — add `.action()` as third type alongside `.query()` and `.mutate()`
    - Ensure `defineOperationFn(name).action().input(z).handler(fn)` is valid
    - Actions declare `.entities([...])` for invalidation (same as mutations)
    - Actions support `.auth()`, `.public()`, `.internal()` access control
    - _Requirements: 16.1, 16.7, 16.8_

  - [X] 7.2 Implement `AuraActionContext` (no direct DB, side-effect capable)
    - Create context type where actions DO NOT include a transactional Prisma client
    - Provide `ctx.runQuery(ref, input)`, `ctx.runMutation(ref, input)`, `ctx.runAction(ref, input)` for in-process calls
    - Provide `ctx.fetch` (explicit fetch), `ctx.storage` (file storage), `ctx.scheduler`
    - _Requirements: 16.2, 16.3, 16.4, 19.3_

  - [X] 7.3 Implement read-only Prisma client proxy for queries
    - Create `src/aura/server/db-readonly.ts` — Proxy wrapper on PrismaClient
    - Allow only: `findMany`, `findFirst`, `findUnique`, `count`, `aggregate`, `groupBy`, `$queryRaw`
    - Throw `AuraError("INTERNAL_ERROR", "Write operations are forbidden in queries")` on write attempts
    - _Requirements: 19.1, 19.4_

  - [X] 7.4 Update the runner to build per-type contexts
    - Modify `src/aura/server/runner.ts` — detect operation type (query/mutate/action)
    - Build `AuraQueryContext` for queries (read-only DB)
    - Build `AuraMutationContext` for mutations (full DB + scheduler)
    - Build `AuraActionContext` for actions (no direct DB, runQuery/runMutation/runAction)
    - Actions served via `POST /aura/:path` same as mutations
    - _Requirements: 16.5, 16.6, 16.9, 19.1, 19.2, 19.3_

  - [X] 7.5 Write unit tests for action primitive and read-only enforcement
    - Test action handler can call runQuery/runMutation
    - Test action handler cannot access DB directly
    - Test query handler cannot write to DB (proxy throws)
    - Test action errors return same AuraEnvelope shape as mutations
    - _Requirements: 16.1–16.10, 19.1–19.4_

- [x] 8. Typed Function References and API Object
  - [x] 8.1 Implement the typed `api` object generation
    - Create `src/aura/cli/codegen.ts` — scans registry, emits `src/aura/_generated/api.ts`
    - Generate typed `OperationRef` objects with `_name` and `_type` fields
    - Support dot-notation namespacing (`api.catalog.productBySlug`)
    - Ensure `InferOperationInput<typeof api.X.Y>` and `InferOperationOutput<typeof api.X.Y>` resolve correctly
    - _Requirements: 24.1, 24.2, 24.3, 24.4_

  - [x] 8.2 Implement `ctx.runQuery`, `ctx.runMutation`, `ctx.runAction` with typed refs
    - Accept both `OperationRef` and string name (backward compatible)
    - Execute in-process with same `AuraContext` (sharing session, request metadata) but fresh `requestId`
    - Merge entity invalidations from inner mutations into outer operation's invalidation set
    - Type-check input argument against referenced operation's Zod input schema at TypeScript level
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [ ] 8.3 Integrate codegen into `aura:make` CLI and Vite dev plugin
    - Extend `aura:make` to regenerate `_generated/api.ts` after scaffolding new operations
    - Add optional Vite plugin that watches registry for changes during dev and regenerates
    - _Requirements: 24.2, 37.5_

  - [ ] 8.4 Write unit tests for typed function references
    - Test type-safe invocation via `ctx.runQuery(api.X.Y, input)`
    - Test backward compatibility with string names
    - Test invalidation merging from inner mutations
    - _Requirements: 17.1–17.5, 24.1–24.5_

- [x] 9. Scheduler Primitive (`ctx.scheduler`)
  - [x] 9.1 Implement the `AuraScheduler` class
    - Create `src/aura/server/scheduler.ts`
    - Implement `ctx.scheduler.runAfter(delayMs, operationRef, input)` — inserts `AuraJobRun` row with `status=PENDING`, `runAt = now + delayMs`
    - Implement `ctx.scheduler.runAt(timestamp, operationRef, input)` — inserts `AuraJobRun` row with `runAt = timestamp`
    - Implement `ctx.scheduler.cancel(scheduledId)` — marks job as `CANCELLED` if not yet started
    - Return `scheduledId` (the `AuraJobRun.id`) from runAfter/runAt
    - _Requirements: 18.1, 18.2, 18.3, 18.7, 18.8_

  - [x] 9.2 Extend the outbox processor to handle scheduled jobs
    - Modify `src/aura/server/outbox.ts` — pick up `AuraJobRun` rows with `status=PENDING AND runAt <= now()`
    - Execute via `runAuraOperation` with `source: "scheduler"`
    - Guarantee at-least-once delivery: job stays `RUNNING` past `lockedUntil` on crash, gets retried
    - Support queries, mutations, and actions as scheduled operations
    - _Requirements: 18.4, 18.5, 18.6_

  - [x] 9.3 Update Prisma schema for scheduler fields
    - Ensure `AuraJobRun` model has: `id`, `operationName`, `input` (Json), `status` (PENDING/RUNNING/SUCCEEDED/FAILED/CANCELLED), `runAt`, `startedAt`, `completedAt`, `attempts`, `maxAttempts`, `lastError`, `lockedUntil`, `createdAt`
    - Run `prisma migrate dev` to apply schema changes
    - _Requirements: 18.3_

  - [ ] 9.4 Write unit tests for scheduler
    - Test `runAfter` creates job with correct `runAt`
    - Test `runAt` creates job with exact timestamp
    - Test `cancel` marks job as CANCELLED
    - Test outbox processor picks up due jobs and executes them
    - _Requirements: 18.1–18.8_

- [ ] 10. Checkpoint — Core primitives complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. DB-Optimized Reads (Prisma Views + Typed Wrapper)
  - [x] 11.1 Implement `defineDbReadFn` typed wrapper
    - Create `src/aura/server/db-read.ts`
    - Accept `name`, `input` (Zod schema), `output` (Zod schema), `execute` function
    - Execute through Prisma client from `server/db.ts` (same connection pooling)
    - Validate output against Zod schema, throw `AuraError("INTERNAL_ERROR")` on validation failure
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 11.2 Document and scaffold Prisma view declaration pattern
    - Create example migration SQL for a view (`CREATE OR REPLACE VIEW`)
    - Add corresponding `view` block in `schema.prisma`
    - Document materialized view refresh via Aura cron job
    - Ensure `prisma migrate deploy` provisions views in every environment
    - _Requirements: 4.4, 4.5, 4.6_

  - [ ] 11.3 Write unit tests for `defineDbReadFn`
    - Test successful execution with valid input/output
    - Test output validation failure throws `INTERNAL_ERROR`
    - Test execution uses the shared Prisma instance
    - _Requirements: 4.1–4.5_

- [x] 12. HTTP Actions (Webhooks/Callbacks)
  - [x] 12.1 Implement `defineHttpAction` builder
    - Create `src/aura/server/http-action.ts`
    - Provide `defineHttpAction(path, method).public().csrf(false).handler(fn)` API
    - Handler receives `(ctx: AuraContext, request: Request)` and returns `Response`
    - Support `.auth()`, `.public()`, `.internal()` access control
    - Support `.csrf(true|false)` builder method (default: false for webhooks)
    - _Requirements: 21.1, 21.3, 21.4, 21.5_

  - [x] 12.2 Mount HTTP actions on the Hono app
    - Create `src/aura/server/routes/http-actions.ts`
    - Mount all registered HTTP actions under configurable prefix (default: `/aura-http/`)
    - Provide same `AuraContext` to HTTP action handlers
    - _Requirements: 21.2, 21.3_

  - [ ] 12.3 Write unit tests for HTTP actions
    - Test webhook handler receives raw Request and returns Response
    - Test CSRF opt-out works for webhooks
    - Test auth enforcement on HTTP actions
    - _Requirements: 21.1–21.5_

- [x] 13. Enhanced Entity Invalidation (Instance-Level)
  - [x] 13.1 Extend invalidation payload to support instance-level targeting
    - Modify `src/aura/server/invalidate.ts` — support `keys: Array<string | { entity: string, id: string }>`
    - Implement `ctx.invalidate({ entity: "Order", id: orderId })` in mutation/action handlers
    - Broadcast payload: `{ type: "INVALIDATE", id, keys: ["Order", { entity: "Order", id: "order-123" }] }`
    - _Requirements: 22.1, 22.2, 22.3_

  - [x] 13.2 Update client-side invalidation matching
    - Modify `src/aura/client/provider.tsx` — match instance-level invalidation against queries with specific entity IDs
    - Update `useAuraQuery` to support optional `entities` option for instance-level matching
    - Fall back to type-level matching when query doesn't declare specific IDs (backward compatible)
    - _Requirements: 22.4, 22.5_

  - [ ] 13.3 Write unit tests for enhanced entity invalidation
    - Test type-level invalidation (all queries for entity type refetch)
    - Test instance-level invalidation (only queries watching specific ID refetch)
    - Test backward compatibility (queries without specific IDs still work)
    - _Requirements: 22.1–22.5_

- [x] 14. Enhanced File Storage (`ctx.storage` + `AuraStoredFile`)
  - [x] 14.1 Create `AuraStoredFile` Prisma model and update storage API
    - Add `AuraStoredFile` model to Prisma schema: `id`, `filename`, `contentType`, `size`, `path`, `driver`, `uploadedBy`, `createdAt`
    - Run `prisma migrate dev` to apply schema changes
    - Implement `ctx.storage.store(file, metadata)` — uploads file, creates `AuraStoredFile` row, returns `storageId`
    - Implement `ctx.storage.getUrl(storageId)` — returns serving URL `/files/{storageId}/{filename}`
    - Implement `ctx.storage.delete(storageId)` — removes file and `AuraStoredFile` row
    - _Requirements: 23.1, 23.2, 23.3, 23.4_

  - [ ] 14.2 Update files router to resolve via `AuraStoredFile`
    - Modify `src/aura/server/routes/files.ts` — resolve `storageId` to physical path via `AuraStoredFile` lookup
    - Serve from configured driver (filesystem or S3)
    - _Requirements: 23.5_

  - [ ] 14.3 Write unit tests for enhanced file storage
    - Test store → getUrl → serve round-trip
    - Test delete removes file and DB record
    - Test path traversal still rejected
    - _Requirements: 23.1–23.5_

- [ ] 15. Checkpoint — Enhanced primitives complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Cursor-Based Pagination
  - [x] 16.1 Implement `.paginate()` modifier and `ctx.paginate` helper
    - Extend operation builder with `.paginate({ orderBy, direction })` modifier
    - Implement `ctx.paginate(model, { where, cursor, take })` helper that returns `{ items, cursor, isDone }`
    - Encode cursor as `base64url(JSON.stringify({ id, sort }))` with HMAC validation to prevent forgery
    - Validate cursor belongs to same query (operation name + params hash)
    - _Requirements: 25.1, 25.2, 25.3, 25.6, 25.7_

  - [x] 16.2 Implement `useAuraPaginatedQuery` client hook
    - Create hook that manages cursor state and supports infinite scroll (`loadMore()`)
    - Integrate with TanStack Query's `useInfiniteQuery` using cursor as `pageParam`
    - Support forward pagination; optionally backward pagination via `{ cursor, direction: "next" | "prev" }`
    - _Requirements: 25.4, 25.5_

  - [ ] 16.3 Write unit tests for cursor-based pagination
    - Test cursor encoding/decoding round-trip
    - Test HMAC validation rejects forged cursors
    - Test forward pagination returns correct pages
    - Test `isDone` is true when no more results
    - _Requirements: 25.1–25.7_

- [x] 17. Full-Text Search (PostgreSQL tsvector)
  - [x] 17.1 Implement `defineSearchIndex` declaration
    - Create `src/aura/server/search.ts` (or appropriate location under operations conventions)
    - Accept `model`, `fields`, `filterFields`, `language` configuration
    - Generate migration SQL: `ALTER TABLE ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (...) STORED` + GIN index
    - _Requirements: 26.1, 26.4, 26.5_

  - [x] 17.2 Implement `ctx.db.search(model, { query, filter, limit })` API
    - Execute `SELECT *, ts_rank(search_vector, plainto_tsquery(...)) as score` via `$queryRaw`
    - Support filtering by additional fields alongside search
    - Return `{ items, scores }` ordered by relevance
    - _Requirements: 26.2, 26.3, 26.6_

  - [ ] 17.3 Write unit tests for full-text search
    - Test search returns ranked results
    - Test filtering alongside search
    - Test empty query returns no results
    - _Requirements: 26.1–26.6_

- [x] 18. Vector Search (pgvector)
  - [x] 18.1 Implement `defineVectorIndex` declaration
    - Create vector index declaration accepting `model`, `vectorField`, `dimensions`, `filterFields`, `indexType` (hnsw/ivfflat)
    - Generate migration SQL: `CREATE EXTENSION IF NOT EXISTS vector`, `ALTER TABLE ADD COLUMN embedding vector(N)`, `CREATE INDEX USING hnsw/ivfflat`
    - _Requirements: 27.1, 27.4, 27.5_

  - [x] 18.2 Implement `ctx.db.vectorSearch(model, { vector, limit, filter })` API
    - Execute cosine similarity search via `$queryRaw` with pgvector operators
    - Validate query vector dimensionality at runtime
    - Support filtering by additional fields
    - Return `{ items, distances }`
    - _Requirements: 27.2, 27.3, 27.6_

  - [ ] 18.3 Write unit tests for vector search
    - Test vector search returns nearest neighbors
    - Test dimensionality validation rejects wrong-size vectors
    - Test filtering alongside vector search
    - _Requirements: 27.1–27.7_

- [ ] 19. Aura Components Architecture
  - [ ] 19.1 Implement `defineComponent` API
    - Create `src/aura/core/component.ts`
    - Accept `name`, `schema` (models), `operations`, `config`, `exports`
    - Support component-scoped Prisma client (data isolation via namespaced models)
    - Provide `ctx.runComponent(componentRef, operationName, input)` for application code to call component operations
    - _Requirements: 28.1, 28.2, 28.3_

  - [ ] 19.2 Implement component installation mechanism
    - Extend `aura:make` or create `aura:install` CLI command
    - Add component's schema to `schema.prisma`, register operations, create config entry
    - Allow components to declare cron jobs, scheduled functions, HTTP actions
    - _Requirements: 28.4, 28.5, 28.6_

  - [ ] 19.3 Extract auth subsystem as `@aura/auth` component
    - Refactor `server/auth/*` into a component using `defineComponent("auth", ...)`
    - Expose login, register, logout as component operations
    - Demonstrate the component pattern with a real, working component
    - _Requirements: 28.7_

  - [ ] 19.4 Write unit tests for component architecture
    - Test component data isolation (cannot access component tables directly)
    - Test `ctx.runComponent` invokes component operations correctly
    - Test component configuration options
    - _Requirements: 28.1–28.7_

- [x] 20. Durable Workflows
  - [x] 20.1 Implement `defineWorkflow` API and workflow runner
    - Create `src/aura/server/workflow.ts`
    - Provide `defineWorkflow(name).input(z).handler(fn)` API
    - Implement `ctx.step(name, fn)` — persists result before proceeding, skips on replay
    - Implement `ctx.sleep(ms)` — schedules workflow resume after delay
    - Support conditional branching and parallel steps
    - _Requirements: 29.1, 29.3, 29.4, 29.5, 29.8_

  - [x] 20.2 Create `AuraWorkflowRun` Prisma model and persistence
    - Add model: `id`, `workflowName`, `input` (Json), `status` (PENDING/RUNNING/COMPLETED/FAILED/CANCELLED), `currentStep`, `completedSteps` (Json array), `error`, `startedAt`, `completedAt`, `createdAt`
    - Run `prisma migrate dev` to apply schema changes
    - On crash recovery, resume from last completed step (load results from `completedSteps`)
    - _Requirements: 29.2, 29.4_

  - [ ] 20.3 Implement workflow cancellation and status querying
    - Provide `ctx.workflow.cancel(workflowRunId)` — marks as CANCELLED
    - Expose workflow status (pending, running, completed, failed, cancelled) queryable from operations
    - _Requirements: 29.6, 29.7_

  - [ ] 20.4 Write unit tests for durable workflows
    - Test multi-step workflow completes successfully
    - Test crash recovery resumes from last completed step
    - Test workflow cancellation
    - Test sleep/delay between steps
    - _Requirements: 29.1–29.8_

- [x] 21. Auto-Tracking Entity Invalidation
  - [x] 21.1 Implement Prisma Proxy for auto-tracking writes in mutations
    - Wrap Prisma client in a Proxy that tracks which tables are written to during a mutation
    - After handler completes, automatically add tracked table names to invalidation set
    - Explicit `.entities([...])` always takes precedence over auto-tracking
    - Make auto-tracking opt-in via `autoTrackEntities: true` in `aura.config.ts`
    - _Requirements: 30.2, 30.3, 30.4_

  - [x] 21.2 Implement auto-tracking for query entity registration
    - Track which tables are read during query execution
    - Populate manifest's entity mapping automatically
    - Provide `staleTime` configuration per query for refetch aggressiveness
    - _Requirements: 30.1, 30.5_

  - [ ] 21.3 Write unit tests for auto-tracking
    - Test mutation auto-tracks written tables
    - Test query auto-tracks read tables
    - Test explicit `.entities()` overrides auto-tracking
    - _Requirements: 30.1–30.6_

- [ ] 22. Checkpoint — Advanced features complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 23. AI Agent Framework (LangChain/LangGraph)
  - [x] 23.1 Create AI agent Prisma models and core types
    - Add `AuraAgentThread` model: `id`, `agentName`, `userId`, `title`, `metadata`, `status`, `createdAt`, `updatedAt`
    - Add `AuraAgentMessage` model: `id`, `threadId`, `role`, `content`, `toolCalls`, `toolResults`, `metadata`, `createdAt`
    - Add `AuraAIUsage` model: `id`, `agentName`, `threadId`, `userId`, `model`, `provider`, `inputTokens`, `outputTokens`, `totalTokens`, `latencyMs`, `estimatedCost`, `createdAt`
    - Run `prisma migrate dev` to apply schema changes
    - _Requirements: 31.2, 35.1_

  - [x] 23.2 Implement `defineAgent` API
    - Create `src/aura/server/ai/agent.ts`
    - Accept `name`, `model` (LangChain ChatModel), `systemPrompt`, `tools`, `maxSteps`, `rag` config
    - Integrate with `@langchain/core` for model abstraction
    - Support multiple providers (OpenAI, Anthropic, Google) via LangChain model classes
    - _Requirements: 31.1, 31.7_

  - [x] 23.3 Implement thread management and message persistence
    - Implement `ctx.agent.createThread(agentRef, { userId, metadata })` — creates `AuraAgentThread` row
    - Implement `ctx.agent.generateText(threadRef, { prompt, tools?, maxSteps? })` — sends prompt + history to LLM, executes tool calls, persists all messages
    - Automatically inject thread message history as context with configurable window management (last N messages, token budget)
    - _Requirements: 31.3, 31.4, 31.9_

  - [x] 23.4 Implement AI streaming via WebSocket broadcast
    - Implement `ctx.agent.streamText(threadRef, { prompt, tools?, maxSteps? })` — streams token-by-token
    - Broadcast token deltas via Aura broadcast WebSocket: `{ type: "AGENT_STREAM", threadId, messageId, delta, done }`
    - Persist final complete message in `AuraAgentMessage` once streaming is done
    - Support multiple clients subscribing to same thread simultaneously
    - Handle reconnection: send accumulated content so far + remaining deltas
    - Support streaming structured objects (JSON, tool call progress)
    - _Requirements: 31.5, 33.1, 33.2, 33.3, 33.4, 33.5_

  - [ ] 23.5 Implement tools as Aura operations (`.asTool()`)
    - Add `.asTool({ description })` modifier on any operation — converts to LangChain `StructuredTool`
    - Auto-convert Zod input schema to LLM tool parameters
    - Execute underlying operation with agent's context (session, permissions)
    - Serialize tool call results back to LLM as JSON, persist in thread
    - Support inline tool definitions (not backed by an operation)
    - _Requirements: 32.1, 32.2, 32.3, 32.6_

  - [ ] 23.6 Implement human-in-the-loop tool approval
    - Add `.requiresApproval()` modifier on tools
    - Pause agent when approval-required tool is called, persist `tool_approval_pending` message
    - Client sees pending approval via `useAuraAgentThread`
    - Resume agent from saved state on human approve/reject
    - _Requirements: 32.4, 32.5_

  - [ ] 23.7 Implement LangGraph integration for complex agent workflows
    - Create `src/aura/server/ai/workflow.ts` — `defineAgentWorkflow` wrapping LangGraph `StateGraph`
    - Use Aura's Prisma-backed persistence instead of LangGraph's MemorySaver
    - Support multi-agent patterns: agents can delegate via `ctx.agent.handoff(otherAgentRef, threadRef, { prompt })`
    - _Requirements: 31.8, 31.10_

  - [ ] 23.8 Implement RAG integration
    - Create `src/aura/server/ai/rag.ts` — `defineRAGSource(name, { model, fields, embeddingModel, chunkStrategy })`
    - Auto-generate and store embeddings on document create/update via outbox job
    - Perform hybrid search (vector + full-text) on configured RAG sources during agent generation
    - Support configurable retrieval strategies: vector-only, text-only, hybrid (RRF fusion)
    - Track which documents were used as context (stored in message metadata)
    - Integrate with vector search (Requirement 27) and full-text search (Requirement 26) infrastructure
    - _Requirements: 34.1, 34.2, 34.3, 34.4, 34.5, 34.6_

  - [x] 23.9 Implement AI usage tracking and rate limiting
    - Record every LLM call in `AuraAIUsage` model with tokens, latency, cost
    - Implement `ctx.agent.getUsage({ userId?, agentName?, since? })` for querying statistics
    - Integrate with Aura rate limiting for per-user token budgets
    - Throw `AuraError("RATE_LIMITED", "AI token budget exceeded")` before calling LLM when budget exceeded
    - Support configurable cost estimation per model
    - _Requirements: 35.1, 35.2, 35.3, 35.4, 35.5_

  - [x] 23.10 Implement client-side AI hooks
    - Create `useAuraAgentThread(threadId)` — reactively displays messages, streaming tokens, pending approvals
    - Create `useAuraAgentStream(threadId)` — manages streaming state, exposes `{ messages, isStreaming, streamingContent }`
    - _Requirements: 32.5, 33.6_

  - [ ] 23.11 Write unit tests for AI agent framework
    - Test agent creation and thread management
    - Test tool execution with operation context
    - Test streaming broadcasts token deltas
    - Test human-in-the-loop pause/resume
    - Test usage tracking records tokens
    - Test rate limiting blocks over-budget calls
    - _Requirements: 31.1–31.10, 32.1–32.6, 33.1–33.6, 34.1–34.6, 35.1–35.5_

- [ ] 24. AI Agent Playground (Dev-Only)
  - [ ] 24.1 Implement `/aura-playground` dev-only route
    - Create a TanStack Start route at `/aura-playground` (only mounted when `NODE_ENV !== "production"`)
    - Render chat UI for testing any registered agent
    - Display tool calls, tool results, and intermediate reasoning steps
    - Support replaying a thread from a specific message
    - _Requirements: 36.1, 36.2, 36.5_

  - [ ] 24.2 Integrate agent debugging into `aura:doctor`
    - Validate agent configurations: model API keys present, tools resolvable
    - Provide `rawRequestResponseHandler` callback on agents for logging full LLM request/response
    - _Requirements: 36.3, 36.4_

- [ ] 25. Checkpoint — AI framework complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 26. Strict Folder Conventions and CLI Enforcement
  - [x] 26.1 Implement auto-discovery and registration system
    - Create glob-based scanner for `src/operations/**/*.{operation,middleware,cron,workflow,agent,http,rag,search,vector,db-read,component}.ts`
    - Import, validate (correct export shape, name matches path), and register each discovered file
    - Auto-generate `src/operations/_registry.ts` for production builds (tree-shaking friendly)
    - Enforce one artifact per file (one `defineOperationFn` call per `.operation.ts`)
    - _Requirements: 37.5, 37.6, 37.8_

  - [x] 26.2 Implement name-to-path mapping and validation
    - Derive operation name from file path: `src/operations/catalog/product-by-slug.operation.ts` → `catalog.product-by-slug`
    - Support nested namespaces: `src/operations/admin/users/ban.operation.ts` → `admin.users.ban`
    - Validate at startup that operation names match file paths
    - Emit warnings for misplaced files (files outside canonical structure)
    - _Requirements: 37.2, 37.4, 37.7_

  - [x] 26.3 Enhance `aura:make` CLI for all artifact types
    - Support: `aura:make operation <name> --type query|mutate|action`
    - Support: `aura:make middleware <name>`
    - Support: `aura:make cron <name> --schedule "<expr>"`
    - Support: `aura:make workflow <name>`
    - Support: `aura:make agent <name>`
    - Support: `aura:make http <path> --method POST`
    - Support: `aura:make rag <name> --model <Model>`
    - Support: `aura:make search <model>`
    - Support: `aura:make vector <model> --dimensions <n>`
    - Support: `aura:make db-read <name>`
    - Support: `aura:make component <name>`
    - Support: `aura:make ui <component-name>`
    - Generate boilerplate with correct imports, types, and structure (compiles without edits)
    - _Requirements: 37.3, 37.10_

  - [ ] 26.4 Create `aura.config.ts` configuration file
    - Implement `defineAuraConfig` with: `operationsDir`, `autoTrackEntities`, `strictMode`, `ai`, `storage` options
    - Support configurable root directory (default: `src/operations/`)
    - Strict mode: fail startup if any file violates conventions (default: true in prod)
    - _Requirements: 37.9_

  - [ ] 26.5 Write unit tests for folder conventions
    - Test auto-discovery finds all artifact types
    - Test name-to-path mapping is correct
    - Test validation rejects misplaced files
    - Test one-per-file enforcement
    - _Requirements: 37.1–37.10_

- [x] 27. Naming Convention Enforcement (Kebab-Case)
  - [x] 27.1 Enforce kebab-case in `aura:make` generation
    - All generated file names use kebab-case: `product-by-slug.operation.ts`, `with-organization.middleware.ts`
    - Map kebab-case file names to dot-notation operation names: `catalog/product-by-slug.operation.ts` → `catalog.product-by-slug`
    - _Requirements: 39.1, 39.2_

  - [ ] 27.2 Create ESLint rule for kebab-case file names
    - Implement `aura/kebab-case-files` ESLint rule
    - Flag any file in `src/operations/` or `src/aura/ui/` that does not follow kebab-case
    - _Requirements: 39.3_

  - [ ] 27.3 Integrate naming validation into `aura:doctor`
    - Validate naming conventions and emit errors for non-compliant files
    - Enforce kebab-case for TanStack Start route files
    - _Requirements: 39.4, 39.5_

  - [ ] 27.4 Write unit tests for kebab-case enforcement
    - Test ESLint rule flags non-kebab-case files
    - Test `aura:doctor` reports naming violations
    - Test `aura:make` generates kebab-case file names
    - _Requirements: 39.1–39.5_

- [x] 28. Built-in UI Kit (shadcn-based)
  - [x] 28.1 Create core UI component infrastructure
    - Create `src/aura/ui/index.ts` re-exporting all components
    - Set up shadcn/ui theming system (CSS variables) for light/dark and brand colors
    - Ensure all components use kebab-case file names
    - _Requirements: 38.1, 38.6, 38.8_

  - [ ] 28.2 Implement `<AuraBumpToaster>` component
    - Create `src/aura/ui/aura-bump-toaster.tsx`
    - Wire server-side bumps (`ctx.bump.success(...)`, `ctx.bump.error(...)`) to sonner toasts
    - Automatically display bumps from `AuraEnvelope.meta.bumps` after every mutation response
    - _Requirements: 38.3, 38.4_

  - [ ] 28.3 Implement `<AuraDataTable>` component
    - Create `src/aura/ui/aura-data-table.tsx`
    - Server-paginated, sortable, filterable data table wired to `useAuraPaginatedQuery`
    - Support column definitions derived from Zod schemas
    - Support `searchable`, `sortable`, `actions` (with confirm dialog for destructive actions)
    - Built on shadcn `<Table>` + `<Pagination>` + `<Input>` + `<Select>`
    - _Requirements: 38.3, 38.10_

  - [ ] 28.4 Implement `<AuraForm>` and `<AuraFormField>` components
    - Create `src/aura/ui/aura-form.tsx` and `src/aura/ui/aura-form-field.tsx`
    - Auto-generate form from Zod schema, wired to `useAuraForm` / `useAuraMutation`
    - Field renderer supports: text, number, select, date, file, etc. driven by Zod type
    - Built on react-hook-form + Zod resolver + shadcn form components
    - _Requirements: 38.3_

  - [ ] 28.5 Implement remaining UI components
    - Create `src/aura/ui/aura-auth-card.tsx` — login/register/OTP/password/phone flows
    - Create `src/aura/ui/aura-guard-view.tsx` — loading/unauthorized states
    - Create `src/aura/ui/aura-confirm-dialog.tsx` — destructive action confirmation
    - Create `src/aura/ui/aura-file-upload.tsx` — drag-and-drop → `ctx.storage.store`
    - Create `src/aura/ui/aura-search-input.tsx` — debounced search → full-text query
    - Create `src/aura/ui/aura-empty-state.tsx` — empty state placeholder
    - Create `src/aura/ui/aura-error-boundary.tsx` — `AuraClientError` display
    - Create `src/aura/ui/aura-loading-skeleton.tsx` — skeleton loaders
    - Create `src/aura/ui/aura-settings-layout.tsx` — sidebar + content settings layout
    - Create `src/aura/ui/aura-dashboard-shell.tsx` — dashboard layout (nav + header + content)
    - _Requirements: 38.3_

  - [ ] 28.6 Implement `<AuraAgentChat>` component
    - Create `src/aura/ui/aura-agent-chat.tsx`
    - Full AI chat UI with streaming, tool calls, human-in-the-loop approvals
    - Support `show-tool-calls`, `show-sources` (RAG attribution) props
    - Wire to `useAuraAgentStream` and `useAuraAgentThread`
    - _Requirements: 38.3_

  - [ ] 28.7 Add `aura:make ui` CLI command
    - Scaffold new custom UI component in `src/aura/ui/` with kebab-case naming
    - Generate boilerplate with correct imports and shadcn primitives
    - _Requirements: 38.7_

  - [ ] 28.8 Write unit tests for UI components
    - Test `<AuraBumpToaster>` renders toasts from bumps
    - Test `<AuraDataTable>` renders columns and handles pagination
    - Test `<AuraForm>` generates fields from Zod schema
    - Test all components respect theme CSS variables
    - _Requirements: 38.1–38.10_

- [ ] 29. Checkpoint — UI kit and folder conventions complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 30. Operation Middleware Preservation and Enhancement
  - [ ] 30.1 Preserve and enhance `.use()` middleware chain
    - Ensure existing `.use(middlewareFn)` chain on operation builder is preserved
    - Middleware can short-circuit by throwing `AuraError`
    - Middleware can augment context (e.g., `withOrganization` adds `ctx.organization`)
    - Type the augmented context so handler receives union of base + middleware-added fields
    - Run middleware in declaration order (left to right)
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [ ] 30.2 Write unit tests for operation middleware
    - Test middleware runs in order
    - Test middleware can short-circuit with AuraError
    - Test middleware augments context for handler
    - _Requirements: 20.1–20.5_

- [ ] 31. Operation Contract Preservation (DX Parity)
  - [ ] 31.1 Verify and preserve all operation builder APIs
    - Preserve `defineOperationFn(name).query()|mutate()` builder with `.input()`, `.params()`, `.entities()`, `.use()`, `.auth()|.public()|.internal()`, `.handler()`
    - Preserve `defineCommonFn(name).run(fn)` API (common functions run in registration order)
    - Preserve name regex `^[a-zA-Z][a-zA-Z0-9_.-]*$`
    - _Requirements: 5.1, 5.2_

  - [ ] 31.2 Verify and preserve envelope and error contracts
    - Preserve `AuraEnvelope` shape on success and error
    - Preserve all `AuraError` codes
    - Preserve `AuraClientError` shape on client
    - Preserve Zod validation error with field paths joined by `.`
    - _Requirements: 5.3, 5.4, 14.3, 14.4_

  - [ ] 31.3 Verify and preserve client hook exports
    - Preserve all client exports: `useAuraQuery`, `useAuraMutation`, `useAuraManifest`, `useAuraBroadcast`, `useAuraForm`, `useStepperForm`, `useAuraParams`, `AuraGuard`, `AuraClientProvider`, `AuraHydrationBoundary`
    - Preserve `prefetchAuraQuery`, `<AuraHydration>`, `callAuraServer`, `runAuraServer` server exports
    - Preserve `InferOperationInput<T>`, `InferOperationOutput<T>`, `auraQueryKey(name, input, params)`
    - _Requirements: 5.5, 5.6, 5.7, 14.1, 14.2_

  - [ ] 31.4 Verify and preserve manifest-driven entity invalidation
    - Queries register entities via manifest, mutations declare entities at definition time
    - `useAuraMutation` invalidates client queries whose entities intersect with mutation's entities
    - Mutation completion publishes HMAC-signed invalidation to Aura_Broadcast_Server
    - _Requirements: 5.8, 5.9, 10.1, 10.2, 10.3_

  - [ ] 31.5 Verify and preserve broadcast client behavior
    - Leader tab election via Web Locks (`aura:ws-leader`)
    - Leader holds WebSocket, other tabs receive via `BroadcastChannel("aura:realtime")`
    - Invalidation deduplication within 2-second window using message `id`
    - _Requirements: 10.4, 10.5, 10.6_

  - [ ] 31.6 Write integration tests for operation contract parity
    - Test full bridge round-trip (client POST → operation → envelope response)
    - Test manifest-driven invalidation flow
    - Test broadcast invalidation end-to-end
    - _Requirements: 5.1–5.9, 10.1–10.6, 15.3_

- [ ] 32. Cron, Outbox, and CLI Parity
  - [ ] 32.1 Verify and preserve cron and outbox semantics
    - Preserve `defineCronFn(name).schedule(expr).handler(fn)` and `runAuraCron(name)`
    - Preserve `AuraJobRun` recording with `status ∈ {RUNNING, SUCCEEDED, FAILED}`
    - Preserve `processOutboxEvents(batchSize)` semantics (lock, batch, retry, backoff)
    - _Requirements: 11.1, 11.2_

  - [ ] 32.2 Verify and preserve CLI entry points
    - Preserve `bun src/aura/cli/cron.ts`, `bun src/aura/cli/outbox.ts`, `bun src/aura/cli/doctor.ts`, `bun src/aura/cli/make.ts`
    - CLI cron calls Aura_Internal_Endpoint with `x-aura-internal-secret` header
    - Update imports only if underlying module paths changed
    - _Requirements: 11.3, 11.4_

  - [ ] 32.3 Write unit tests for cron and outbox
    - Test cron job execution and `AuraJobRun` recording
    - Test outbox processing with retry and backoff
    - Test CLI triggers internal endpoint correctly
    - _Requirements: 11.1–11.4_

- [ ] 33. File Storage and Broadcast Parity
  - [ ] 33.1 Verify and preserve file storage drivers
    - Preserve `getStorageDriver` and `createAuraStorage` selecting driver from `AURA_STORAGE_DRIVER`
    - Preserve `filesystemDriver` and `s3Driver` upload/delete contracts
    - _Requirements: 9.1, 9.2_

  - [ ] 33.2 Verify and preserve Prisma schema and migration history
    - Preserve all existing Prisma models (`AuraUser`, `AuraSession`, `AuraJobRun`, `AuraOutboxEvent`, `AuraRateLimitBucket`, `AuraAuditLog`, etc.)
    - No destructive schema changes; new models are additive
    - Preserve `prisma generate` step and global `auraPrisma` singleton pattern for hot reload
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 15.1_

- [ ] 34. Final Integration and Wiring
  - [ ] 34.1 Wire all components together in `createAuraHonoApp`
    - Mount bridge, internal, files, health, and http-actions routers
    - Apply CSRF middleware to bridge router
    - Apply rate limiting middleware
    - Ensure single Hono app instance embeddable in TanStack Start, standalone Bun/Node, and tests
    - _Requirements: 1.13_

  - [ ] 34.2 Remove all Next.js-specific imports and dependencies
    - Remove every import of `next/headers`, `next/navigation`, `next/server`
    - Remove `next`, `eslint-config-next` from `package.json`
    - Replace `next-themes` with Vite-compatible theme solution
    - Verify no residual `next/*` imports in application code
    - _Requirements: 2.1, 12.4_

  - [ ] 34.3 Verify streaming SSR and performance parity
    - Confirm TanStack Start renders initial HTML on server
    - Confirm dehydrated TanStack Query state injected into response
    - Confirm per-render query deduplication (N components → 1 handler execution)
    - Confirm manifest pre-injection (first invalidation matches by entity tag without manifest fetch)
    - _Requirements: 13.1, 13.2, 13.3_

  - [ ] 34.4 Write parity test suite
    - Bridge happy path (POST operation, response envelope)
    - Manifest GET returns correct operation list
    - Internal cron secret check (403 on bad, 200 on valid)
    - CSRF unsafe-method check (403 on missing token)
    - Session resolution + revocation scenarios
    - Mutation invalidation broadcast
    - Hydration round-trip (server prefetch → client rehydrate)
    - File serving with traversal protection
    - Health probe (200 on DB up, 503 on DB down)
    - _Requirements: 15.2, 15.3, 15.4_

- [ ] 35. Final Checkpoint — Full migration complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at natural phase boundaries
- The design uses TypeScript throughout — no language selection needed
- Property-based tests are not included as the design document does not contain a "Correctness Properties" section; unit and integration tests are used instead
- The migration preserves backward compatibility: string-name operation usage still works alongside typed `api` object
- New Prisma models (`AuraStoredFile`, `AuraWorkflowRun`, `AuraAgentThread`, `AuraAgentMessage`, `AuraAIUsage`) are additive — no destructive schema changes
- Auto-tracking entity invalidation is opt-in via config to avoid breaking existing code

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5"] },
    { "id": 2, "tasks": ["1.6", "2.1", "2.2"] },
    { "id": 3, "tasks": ["2.3", "4.1", "4.2"] },
    { "id": 4, "tasks": ["4.3", "4.4", "4.5", "4.6"] },
    { "id": 5, "tasks": ["4.7", "4.8"] },
    { "id": 6, "tasks": ["4.9", "6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3"] },
    { "id": 8, "tasks": ["7.1", "7.3"] },
    { "id": 9, "tasks": ["7.2", "7.4"] },
    { "id": 10, "tasks": ["7.5", "8.1"] },
    { "id": 11, "tasks": ["8.2", "8.3", "9.3"] },
    { "id": 12, "tasks": ["8.4", "9.1"] },
    { "id": 13, "tasks": ["9.2", "9.4"] },
    { "id": 14, "tasks": ["11.1", "11.2", "12.1"] },
    { "id": 15, "tasks": ["11.3", "12.2", "13.1"] },
    { "id": 16, "tasks": ["12.3", "13.2", "14.1"] },
    { "id": 17, "tasks": ["13.3", "14.2"] },
    { "id": 18, "tasks": ["14.3", "16.1"] },
    { "id": 19, "tasks": ["16.2", "16.3", "17.1"] },
    { "id": 20, "tasks": ["17.2", "17.3", "18.1"] },
    { "id": 21, "tasks": ["18.2", "18.3", "19.1"] },
    { "id": 22, "tasks": ["19.2", "19.3", "19.4"] },
    { "id": 23, "tasks": ["20.1", "20.2"] },
    { "id": 24, "tasks": ["20.3", "20.4", "21.1"] },
    { "id": 25, "tasks": ["21.2", "21.3"] },
    { "id": 26, "tasks": ["23.1"] },
    { "id": 27, "tasks": ["23.2", "23.3"] },
    { "id": 28, "tasks": ["23.4", "23.5"] },
    { "id": 29, "tasks": ["23.6", "23.7", "23.8"] },
    { "id": 30, "tasks": ["23.9", "23.10"] },
    { "id": 31, "tasks": ["23.11", "24.1", "24.2"] },
    { "id": 32, "tasks": ["26.1", "26.2"] },
    { "id": 33, "tasks": ["26.3", "26.4"] },
    { "id": 34, "tasks": ["26.5", "27.1"] },
    { "id": 35, "tasks": ["27.2", "27.3", "27.4"] },
    { "id": 36, "tasks": ["28.1", "28.2"] },
    { "id": 37, "tasks": ["28.3", "28.4"] },
    { "id": 38, "tasks": ["28.5", "28.6", "28.7"] },
    { "id": 39, "tasks": ["28.8", "30.1"] },
    { "id": 40, "tasks": ["30.2", "31.1", "31.2"] },
    { "id": 41, "tasks": ["31.3", "31.4", "31.5"] },
    { "id": 42, "tasks": ["31.6", "32.1", "33.1"] },
    { "id": 43, "tasks": ["32.2", "32.3", "33.2"] },
    { "id": 44, "tasks": ["34.1", "34.2"] },
    { "id": 45, "tasks": ["34.3", "34.4"] }
  ]
}
```
