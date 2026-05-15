# Requirements Document

## Introduction

The `aura` framework is currently embedded in a Next.js 16 (App Router) project. It exposes a manifest-driven, type-safe operation system (queries and mutations) over two App Router catch-all route handlers (`/aura/[[...aura]]` and `/aura-internal/[[...aura]]`), with TanStack Query on the client, Prisma 7 as the ORM, and a separate Hono + Bun "broadcast" server already in use for cross-tab/cross-device cache invalidation.

This spec defines the migration of `aura` off Next.js as the **runtime** and the **meta-framework**, onto:

- **Runtime (HTTP layer):** Hono.js. All Aura HTTP entry points (the public bridge `/aura/*`, the internal endpoint `/aura-internal/*`, the static file server `/files/*`, and the `/health` endpoint) MUST be served by Hono handlers. The existing `src/aura/server/broadcast.ts` already runs on Hono + Bun and validates the pairing.
- **Meta-framework (React layer):** TanStack Start. RSC-equivalent server work (per-request session resolution, prefetch + dehydrate, server components, manifest injection, server-side cookies) MUST be expressed using TanStack Start's server-route + server-function primitives instead of Next.js App Router (`headers()`, `cookies()`, route handlers, `useRouter().refresh()`).
- **ORM:** Prisma. The current setup is Prisma 7 with `@prisma/adapter-pg`; the migration MUST keep Prisma as the canonical ORM, and the schema (`AuraSession`, `AuraUser`, `AuraOutboxEvent`, `AuraJobRun`, `AuraRateLimitBucket`, `AuraAuditLog`, etc.) MUST be preserved.
- **DB-side optimization layer:** A new, opt-in mechanism for declaring read-side computation that runs inside PostgreSQL (views, materialized views, SQL/PLpgSQL functions, or stored procedures) and is consumed from operations through a Prisma-typed surface. The exact mechanism is not yet decided and is captured here as a requirement to be resolved in design.

### Architectural rationale: why TanStack Start (and not "just Hono")

The user asked whether Hono _requires_ TanStack Start, or whether Next.js could keep doing the React side. Two facts drive the answer:

1. **Hono is an HTTP framework, not a React meta-framework.** It owns routing, middleware, request/response — but it does not render React, do RSC, do streaming SSR with hydration, or split client/server bundles. The current Aura stack relies on all of those (RSC `<AuraHydration>`, RSC `<AuraProviderShell>`, server-only modules, dehydrated TanStack Query state injected into the HTML, `cookies()` and `headers()` per-request).
2. **Decoupling Aura from Next.js while keeping Next.js as the React layer is contradictory.** The current Next.js coupling points (App Router catch-all route handlers, `next/headers`, `next/navigation`, `useRouter().refresh()`, `next/server` `NextRequest`/`NextResponse.cookies`, the `/files/[...path]` route) are exactly what the migration removes. Replacing only the HTTP layer with Hono while keeping Next.js as the renderer would mean running both stacks side-by-side, which is the worst of both worlds.

TanStack Start is the natural pair because:

- It is a Vite-based React meta-framework that integrates natively with Hono as the underlying server (TanStack Start's server entry exposes a Hono-compatible handler), so the same Hono app serves Aura's bridge, internal, files, health, _and_ TanStack Start's SSR/streaming/hydration.
- It uses TanStack Query out of the box for server-side prefetch + client hydration, which is exactly the contract Aura already depends on (`<AuraHydration>` + `<AuraHydrationBoundary>` + `dehydrate`/`HydrationBoundary`).
- It exposes per-request server context (cookies, headers, request) via server functions and route loaders, which directly replaces `next/headers` `cookies()`/`headers()` and Next.js Route Handlers with no semantic loss.
- It does not impose its own router on the API surface — Aura's HTTP routes can stay raw Hono routes.

This document therefore treats "Hono" and "TanStack Start" as a single coherent target stack, not two independent choices.

### Migration scope

Functional parity MUST be preserved for every Aura subsystem currently shipping:

- Operation registry, runner, manifest (`registry.ts`, `runner.ts`, `operation.ts`, `shared/manifest.ts`).
- Bridge transport (`/aura/*` POST + `/aura/_manifest` GET).
- Internal cron transport (`/aura-internal/*` POST gated by `AURA_INTERNAL_SECRET`).
- RSC server-call path (`call.ts`) with per-render query deduplication and queued cookie mutations.
- Hydration boundary + manifest injection (`hydration.tsx`, `manifest-injector.tsx`, `client/hydration-boundary.tsx`, `client/provider.tsx`).
- Auth subsystem (OTP, password, phone, sessions in `server/auth/*`).
- File storage (filesystem + S3 drivers in `server/storage/*`) and the `/files/*` HTTP serving route.
- Broadcast invalidation (HMAC-signed POST to the Hono broadcast server + WebSocket fan-out).
- Cron jobs and the outbox processor (`server/cron.ts`, `server/outbox.ts`, CLI in `cli/cron.ts`, `cli/outbox.ts`).
- Rate limiting (DB-backed `enforceRateLimit` + the proxy-level in-memory bucket in `transport/rate-limit-proxy.ts`).
- CSRF (HMAC-signed token in cookie + header in `transport/csrf.ts`).
- Cookie helpers (`transport/cookies.ts`).
- Client hooks (`useAuraQuery`, `useAuraMutation`, `useAuraManifest`, `useAuraForm`, `useStepperForm`, `useAuraParams`, `AuraGuard`, `useAuraBroadcast`).
- `nuqs` search-params loading on the server (`server/params.ts`) and client (`client/params.ts`).

## Glossary

- **Aura**: The internal framework located in `src/aura/`, providing typed operations, hydration, auth, storage, broadcast, cron, and outbox.
- **Aura_Bridge**: The public HTTP entry point that accepts client POSTs of `{ input, params }` for an operation name and serves the public manifest on GET. Currently `/aura/[[...aura]]/route.ts`.
- **Aura_Internal_Endpoint**: The internal HTTP entry point gated by `AURA_INTERNAL_SECRET`, used to trigger cron jobs from the CLI/scheduler. Currently `/aura-internal/[[...aura]]/route.ts`.
- **Aura_Files_Endpoint**: The HTTP entry point serving uploaded files (filesystem driver) at `/files/[...path]`.
- **Aura_Health_Endpoint**: The HTTP entry point at `/health` returning DB ping + uptime.
- **Aura_Broadcast_Server**: The standalone Hono + Bun pub/sub server in `src/aura/server/broadcast.ts` that fans out invalidations to connected WebSocket clients. Already on Hono — out of scope for the runtime swap, but its HMAC-signed POST contract MUST be preserved.
- **Aura_Operation**: A typed unit defined via `defineOperationFn(name).query()|mutate().input(zod).params(zod).entities([...]).use(...).auth()|public()|internal().handler(fn)`.
- **Aura_Manifest**: The serialized list of public operations (name, type, access, entities) consumed by the client to drive cache invalidation by entity tag.
- **Aura_Context**: The per-request object built by `createAuraContext` providing `db`, `session`, `user`, `auth`, `notify`, `bump`, `log`, `audit`, `request`, `cookies.set`, `storage`.
- **Aura_Hydration**: The RSC component that runs a server-side prefetch into a fresh `QueryClient`, dehydrates it, and renders an `AuraHydrationBoundary` to rehydrate the client cache.
- **Hono**: The HTTP framework (`hono@4.x`) the migration targets for all Aura HTTP routes.
- **TanStack_Start**: The React meta-framework the migration targets for SSR, route loaders, server functions, and Hono integration.
- **TanStack_Query**: The client-side cache library (`@tanstack/react-query@5.x`) Aura uses today and continues to use.
- **Prisma**: The ORM (`@prisma/client@7.x`) used by Aura, configured with `@prisma/adapter-pg` against PostgreSQL.
- **DB_Optimized_Read**: A read whose execution is delegated to PostgreSQL via a view, materialized view, function, or stored procedure, declared once and consumed from an Aura operation through Prisma in a typed manner. The concrete declaration mechanism (raw SQL migration + `$queryRaw`, Prisma generator, view-as-model, etc.) is the design problem this spec opens.
- **EARS**: Easy Approach to Requirements Syntax, the format used in this document.

## Requirements

### Requirement 1: Hono as the Aura HTTP runtime

**User Story:** As an Aura framework maintainer, I want every Aura HTTP entry point to run on Hono, so that Aura is no longer coupled to Next.js Route Handlers and can be embedded in any Hono-compatible host (Bun, Node, Deno, edge runtimes).

#### Acceptance Criteria

1. THE Aura SHALL expose Aura_Bridge as a Hono router that accepts `POST /aura/:operationPath{.+}` and `GET /aura/_manifest`.
2. WHEN a `POST` request is received on Aura_Bridge with a non-empty operation path, THE Aura SHALL resolve the operation name by joining the path segments with `.` and dispatch it through `runAuraOperation`.
3. WHEN a `POST` request is received on Aura_Bridge with content-type other than `application/json`, THE Aura SHALL respond with HTTP 400 and an `AuraEnvelope` error of code `BAD_REQUEST`.
4. WHEN a `POST` request is received on Aura_Bridge with a JSON body that is not an object, THE Aura SHALL respond with HTTP 400 and an `AuraEnvelope` error of code `BAD_REQUEST`.
5. WHEN `runAuraOperation` returns cookie mutations, THE Aura SHALL serialize each mutation onto the Hono response using `Set-Cookie` headers that match the existing semantics (`httpOnly`, `secure`, `sameSite`, `path`, `expires`, `maxAge`).
6. WHEN a `GET` request is received at `/aura/_manifest`, THE Aura SHALL respond with HTTP 200 and the JSON returned by `getClientOperationManifest()`.
7. WHEN a `GET` request is received at any other Aura_Bridge path, THE Aura SHALL respond with HTTP 405 and an `AuraEnvelope` error of code `METHOD_NOT_ALLOWED`.
8. THE Aura SHALL expose Aura_Internal_Endpoint as a Hono route accepting `POST /aura-internal/:path{.*}`.
9. IF a request to Aura_Internal_Endpoint is missing or has a mismatched `x-aura-internal-secret` header relative to `AURA_INTERNAL_SECRET`, THEN THE Aura SHALL respond with HTTP 403 and an `AuraEnvelope` error of code `FORBIDDEN`.
10. WHEN a valid request to Aura_Internal_Endpoint carries `{ jobName: string }`, THE Aura SHALL invoke `runAuraCron(jobName)` and respond with HTTP 200 on `succeeded` and HTTP 500 on `failed`.
11. THE Aura SHALL expose Aura_Files_Endpoint as a Hono route at `GET /files/:path{.+}` that resolves the path against `AURA_STORAGE_PATH`, rejects path traversal with HTTP 400, returns HTTP 404 when the file is absent, and otherwise returns the file body with the same content-type detection rules as today (`png|jpg|jpeg|webp|gif|pdf|txt`) plus `cache-control: public, max-age=86400`.
12. THE Aura SHALL expose Aura_Health_Endpoint as a Hono route at `GET /health` that pings Prisma with `SELECT 1` and returns the existing payload `{ ok, uptime, timestamp, latencyMs, services.database }`, with HTTP status 200 when the ping succeeds and 503 when it fails.
13. THE Aura SHALL provide a single Hono app factory (e.g. `createAuraHonoApp()`) that mounts Aura_Bridge, Aura_Internal_Endpoint, Aura_Files_Endpoint, and Aura_Health_Endpoint, so that the same app instance can be embedded in TanStack Start's server entry, in standalone Bun/Node servers, and in tests.

### Requirement 2: TanStack Start as the React meta-framework

**User Story:** As an Aura application developer, I want Aura's RSC-equivalent surfaces (hydration, manifest injection, server-side operation calls, server-side params loading) to run on TanStack Start, so that the React layer is consistent with the Hono runtime and free of Next.js-specific imports.

#### Acceptance Criteria

1. THE Aura SHALL replace every import of `next/headers`, `next/navigation`, `next/server`, `next/server.NextRequest`, and `next/server.NextResponse` with TanStack Start equivalents (server function context, route loader context, raw `Request`/`Response`, or Hono helpers as appropriate).
2. THE Aura SHALL provide a TanStack Start server entry that mounts the Hono app from Requirement 1.12 and delegates SSR/streaming for non-Aura routes to TanStack Start's renderer.
3. WHEN `callAuraServer` is invoked from a TanStack Start server function or route loader, THE Aura SHALL resolve the per-request `Headers` from the TanStack Start request context instead of `next/headers.headers()`.
4. WHEN `callAuraServer` runs a mutation that produces cookie mutations, THE Aura SHALL apply those cookies through the TanStack Start cookie API rather than `next/headers.cookies()`.
5. THE Aura SHALL preserve `<AuraHydration>` semantics: a server-side prefetch into a fresh `QueryClient`, `dehydrate(queryClient)`, and a client `<AuraHydrationBoundary>` reading the dehydrated state.
6. THE Aura SHALL preserve `<AuraProviderShell>` semantics: server-side computation of `getClientOperationManifest()` followed by client-side seeding of the manifest cache before the first render.
7. THE Aura SHALL replace `useRouter().refresh()` (used by `useAuraMutation` after mutations whose envelope sets `meta.refresh = true`) with a TanStack Start equivalent that invalidates the active route's loader data.
8. THE Aura SHALL preserve `loadAuraParams` semantics for server-side `nuqs` parsing on TanStack Start route loaders, accepting either an awaited or pending search-params object.
9. WHERE Vite is the build tool used by TanStack Start, THE Aura SHALL preserve the `server-only` import barrier so that any module currently importing `"server-only"` cannot be bundled into a client chunk.

### Requirement 3: Prisma as the ORM and Postgres as the database

**User Story:** As an Aura framework maintainer, I want to keep Prisma as the single ORM, so that the schema, the typed client, and the existing operations continue to work without rewrites.

#### Acceptance Criteria

1. THE Aura SHALL keep `@prisma/client` and `@prisma/adapter-pg` as the database access layer and continue to instantiate the client through the singleton in `server/db.ts` against `DATABASE_URL`.
2. THE Aura SHALL preserve the existing Prisma models referenced by aura (`AuraUser`, `AuraSession`, `AuraJobRun`, `AuraOutboxEvent`, `AuraRateLimitBucket`, `AuraAuditLog`, and any other model the codebase depends on) without renaming or restructuring them.
3. THE Aura SHALL keep the existing `prisma generate` step in the build/dev pipeline of the new TanStack Start project.
4. WHEN running outside production, THE Aura SHALL keep the global `auraPrisma` singleton pattern that prevents connection-pool exhaustion under hot reload.

### Requirement 4: DB-side optimized reads via Prisma

**User Story:** As an Aura application developer, I want to declare expensive read-side computation as a Postgres view, materialized view, or function and consume it from an Aura operation through Prisma, so that I can push hot paths into the database where the planner and indexes outperform application-side aggregation.

> _Open design question — flagged for the design phase:_ The exact mechanism is not yet chosen. Candidates include:
>
> 1. **SQL views modeled as Prisma `view` blocks** (Prisma `views` preview feature, queried like a model).
> 2. **PLpgSQL functions exposed via `db.$queryRaw`/`$queryRawUnsafe`** with a typed wrapper.
> 3. **Materialized views** with a refresh job driven by Aura cron.
> 4. **Stored procedures** invoked via `db.$executeRaw` for write-heavy aggregations.
>
> Requirement 4 captures the contract; the design will pick one (or a small composition) and document the trade-offs.

#### Acceptance Criteria

1. THE Aura SHALL provide a typed mechanism, named `defineDbReadFn` (or equivalent — final name decided in design), for declaring a DB_Optimized_Read with a name, a Zod input schema, a Zod output schema, and a SQL or Prisma-view binding.
2. THE Aura SHALL execute every DB_Optimized_Read through the Prisma client returned by `server/db.ts`, so that the existing connection pooling, instrumentation, and adapter configuration apply uniformly.
3. WHEN an Aura_Operation invokes a DB_Optimized_Read, THE Aura SHALL pass the Aura_Context's Prisma instance, return data validated against the output schema, and surface validation failures as `AuraError` with code `INTERNAL_ERROR`.
4. THE Aura SHALL provide a way to declare DB-side artifacts (views, materialized views, functions, procedures) as part of the Prisma migration history, so that `prisma migrate deploy` provisions them in every environment.
5. WHERE a DB_Optimized_Read targets a materialized view, THE Aura SHALL provide a refresh entry point usable from an Aura cron or outbox job.
6. THE Aura SHALL document, in the design phase, the rationale for picking the chosen mechanism (raw SQL vs Prisma views vs functions vs procedures) including: type safety, migration story, refresh story for materialized views, and Prisma support level.

### Requirement 5: Operation contract preservation (DX parity)

**User Story:** As an Aura application developer, I want the operation builder API and the client hooks to behave identically after the migration, so that no application code beyond import paths changes.

#### Acceptance Criteria

1. THE Aura SHALL preserve the `defineOperationFn(name).query()|mutate()` builder, including `.input()`, `.params()`, `.entities()`, `.use()`, `.auth() | .public() | .internal()`, and `.handler()` stages, with the same name regex `^[a-zA-Z][a-zA-Z0-9_.-]*$`.
2. THE Aura SHALL preserve the `defineCommonFn(name).run(fn)` API and run common functions in registration order before the operation handler.
3. THE Aura SHALL preserve `AuraEnvelope` shape on success (`{ ok: true, data, meta: { requestId, bumps, invalidates, refresh } }`) and on error (`{ ok: false, error: { code, message, status, requestId, fieldErrors? } }`).
4. THE Aura SHALL preserve `AuraError` codes used today (`NOT_FOUND`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, `FORBIDDEN`, `UNAUTHORIZED`, `VALIDATION_ERROR`, `RATE_LIMITED`, `SESSION_EXPIRED`, `SESSION_REVOKED`, `INTERNAL_ERROR`, `BAD_RESPONSE`).
5. THE Aura SHALL preserve `useAuraQuery`, `useAuraMutation`, `useAuraManifest`, `useAuraBroadcast`, `useAuraForm`, `useStepperForm`, `useAuraParams`, `AuraGuard`, `AuraClientProvider`, `AuraHydrationBoundary` exports from `@/aura/client`.
6. THE Aura SHALL preserve `prefetchAuraQuery` and `<AuraHydration>` exports from `@/aura/server`, returning the same dehydrated query keys (`auraQueryKey(name, input, params)`).
7. THE Aura SHALL preserve `callAuraServer` and `runAuraServer` server-side entry points, including the React `cache()` deduplication for queries and the always-execute path for mutations.
8. THE Aura SHALL preserve manifest-driven entity invalidation: queries register their entities via the manifest, mutations declare entities at definition time, and `useAuraMutation` invalidates client queries whose entities intersect with the mutation's entities or with explicit `invalidate` keys.
9. WHEN a mutation completes, THE Aura SHALL publish an HMAC-signed invalidation to Aura_Broadcast_Server using the existing `publishInvalidation` contract (`x-aura-timestamp`, `x-aura-signature`, body `{ id, keys }`).

### Requirement 6: Auth subsystem parity

**User Story:** As an Aura application developer, I want session, OTP, password, and phone authentication to work after the migration without changing my call sites, so that production users keep their sessions and flows.

#### Acceptance Criteria

1. THE Aura SHALL preserve `resolveSessionFromRequest`, `createSession`, `revokeCurrentSession`, and `revokeAllUserSessions` semantics.
2. THE Aura SHALL preserve the per-render React `cache()` memoization of session resolution in `createAuraContext`.
3. WHEN a request carries a session cookie that does not resolve to a live `AuraSession`, THE Aura SHALL queue a delete-cookie mutation on `ctx.cookies.set`.
4. WHEN a session is older than 60 seconds since `lastUsedAt`, THE Aura SHALL fire-and-forget update `lastUsedAt` to throttle write amplification.
5. IF a session is expired at request time, THEN THE Aura SHALL revoke the session and respond with `AuraError` code `SESSION_EXPIRED`.
6. IF a session's user is disabled or deleted, THEN THE Aura SHALL respond with `AuraError` code `SESSION_REVOKED`.
7. IF a session's `sessionVersion` does not match the user's current `sessionVersion`, THEN THE Aura SHALL revoke the session and respond with `AuraError` code `SESSION_REVOKED`.
8. THE Aura SHALL preserve the OTP, password, and phone authentication operations defined in `server/auth/operations.ts`.
9. THE Aura SHALL set the session cookie as `httpOnly`, with `secure` driven by `NODE_ENV === "production"`, `sameSite=lax`, `path=/`, and `expires` equal to the session expiry.
10. THE Aura SHALL set the CSRF cookie as non-`httpOnly`, with `secure` driven by `NODE_ENV === "production"`, `sameSite=lax`, `path=/`, and `expires` equal to the session expiry.

### Requirement 7: CSRF protection parity on Hono

**User Story:** As a security stakeholder, I want CSRF protection to keep the same threat model after migrating to Hono, so that unsafe HTTP methods continue to require a valid HMAC-signed token.

#### Acceptance Criteria

1. THE Aura SHALL preserve the CSRF token format `${nonce}.${HMAC_SHA256(secret, nonce)}` with `nonce` being 24 random bytes encoded as base64url.
2. THE Aura SHALL preserve `verifyCsrfToken` constant-time comparison.
3. WHEN an unsafe HTTP method (`POST`, `PUT`, `PATCH`, `DELETE`) is received on Aura_Bridge, THE Aura SHALL require the request header `x-aura-csrf` to verify against the `aura_csrf` cookie via `verifyCsrfToken`.
4. IF the CSRF check fails on an unsafe Aura_Bridge request, THEN THE Aura SHALL respond with HTTP 403 and `AuraError` code `FORBIDDEN`.
5. IF `AURA_CSRF_SECRET` (or `AURA_INTERNAL_SECRET` as a fallback) is missing in production, THEN THE Aura SHALL fail fast at server startup.

### Requirement 8: Rate limiting parity on Hono

**User Story:** As a platform operator, I want both the proxy-level and DB-backed rate limiters to keep working under Hono, so that abusive clients are throttled the same way.

#### Acceptance Criteria

1. THE Aura SHALL expose `enforceRateLimit(db, { key, limit, windowSeconds })` with the same DB-backed bucket semantics on `AuraRateLimitBucket`.
2. THE Aura SHALL expose `takeRateLimitToken(key, limit, windowMs)` as an in-memory bucket usable from Hono middleware.
3. WHEN the proxy-level limiter exceeds its limit, THE Aura SHALL respond with HTTP 429 and `AuraError` code `RATE_LIMITED`.
4. WHEN `enforceRateLimit` exceeds its limit, THE Aura SHALL throw `AuraError("RATE_LIMITED", …, { status: 429 })`.

### Requirement 9: File storage parity

**User Story:** As an Aura application developer, I want filesystem and S3 storage drivers to keep working after the migration, so that uploads and the `/files/*` route continue to function.

#### Acceptance Criteria

1. THE Aura SHALL preserve `getStorageDriver` and `createAuraStorage` and continue to select the driver from `AURA_STORAGE_DRIVER` (defaulting to `filesystem`).
2. THE Aura SHALL preserve the `filesystemDriver` and `s3Driver` upload/delete contracts.
3. WHEN a file is requested through Aura_Files_Endpoint, THE Aura SHALL reject any path that escapes the configured `AURA_STORAGE_PATH` directory with HTTP 400.
4. THE Aura SHALL serve known media extensions (`png`, `jpg`, `jpeg`, `webp`, `gif`, `pdf`, `txt`) with their MIME type and fall back to `application/octet-stream` otherwise.

### Requirement 10: Broadcast invalidation parity

**User Story:** As an Aura application developer, I want client invalidation to keep working across tabs, browsers, and devices after the migration, so that cache coherence is preserved.

#### Acceptance Criteria

1. THE Aura SHALL keep Aura_Broadcast_Server running on Hono + Bun (no rewrite needed).
2. WHEN an Aura mutation completes successfully, THE Aura SHALL POST a signed payload to Aura_Broadcast_Server with headers `x-aura-timestamp`, `x-aura-signature`, body `{ id, keys }`.
3. WHEN Aura_Broadcast_Server receives a valid signed POST `/invalidate`, THE Aura SHALL fan out a `{ type: "INVALIDATE", id, keys }` message to every connected WebSocket client except the originator.
4. WHEN `AuraClientProvider` mounts and `wsUrl` is configured, THE Aura SHALL elect a leader tab via Web Locks (lock name `aura:ws-leader`) and have the leader hold the WebSocket while other tabs receive invalidations through `BroadcastChannel("aura:realtime")`.
5. WHEN a client receives an invalidation, THE Aura SHALL invalidate every TanStack Query whose `query.queryKey[1]` or `query.meta.entities` intersects with the broadcast keys.
6. THE Aura SHALL deduplicate invalidations within a 2-second window using the message `id`.

### Requirement 11: Cron and outbox parity

**User Story:** As a platform operator, I want cron and outbox processors to keep running after the migration, so that scheduled work and asynchronous notifications continue to ship.

#### Acceptance Criteria

1. THE Aura SHALL preserve `defineCronFn(name).schedule(expr).handler(fn)` and `runAuraCron(name)`, recording every run in `AuraJobRun` with `status ∈ {RUNNING, SUCCEEDED, FAILED}`.
2. THE Aura SHALL preserve `processOutboxEvents(batchSize)` semantics: lock under `OUTBOX_LOCK_SECONDS=60`, process up to `batchSize=100` rows ordered by `createdAt`, retry with exponential backoff capped at 60 minutes, and mark `FAILED` after `maxAttempts`.
3. THE Aura SHALL preserve the CLI entry points `bun src/aura/cli/cron.ts`, `bun src/aura/cli/outbox.ts`, `bun src/aura/cli/doctor.ts`, `bun src/aura/cli/make.ts`.
4. WHEN the CLI cron triggers a job, THE Aura SHALL call Aura_Internal_Endpoint with the `x-aura-internal-secret` header set to `AURA_INTERNAL_SECRET`.

### Requirement 12: Build, dev, and bundling on Vite/TanStack Start

**User Story:** As an Aura application developer, I want `npm run dev`, `npm run build`, and `npm run start` to drive the new TanStack Start project, so that the existing developer workflow keeps working.

#### Acceptance Criteria

1. THE Aura SHALL update `package.json` scripts so that `dev`, `build`, and `start` invoke TanStack Start's CLI (Vite-based) instead of `next dev`/`next build`/`next start`.
2. THE Aura SHALL keep `prisma generate` as a precondition of `dev` and `build`.
3. THE Aura SHALL keep `aura:doctor`, `aura:cron`, `aura:outbox`, `aura:make`, and `aura:broadcast` scripts working, and update them only if their underlying module imports change.
4. THE Aura SHALL remove `next`, `next-themes`-on-`next/navigation`, and `eslint-config-next` if they are no longer used by application code, or keep them only when a non-Aura dependency justifies it (decided in design).
5. WHERE TanStack Start uses Vite, THE Aura SHALL configure the `server-only` package so that any module importing it triggers a build error if pulled into a client chunk.

### Requirement 13: Performance and SSR parity

**User Story:** As an Aura end user, I want the migrated application to render and hydrate at least as fast as today, so that I do not experience regressions.

#### Acceptance Criteria

1. THE Aura SHALL preserve streaming SSR: TanStack Start MUST render the initial HTML on the server, dehydrate the prefetched TanStack Query state into the response, and hand it to the client `<HydrationBoundary>`.
2. THE Aura SHALL preserve per-render query deduplication so that N components requesting the same `(operationName, input, params)` execute the underlying handler exactly once.
3. THE Aura SHALL preserve the manifest pre-injection so that the first invalidation arriving over WebSocket can match by entity tag without waiting for a manifest fetch.
4. WHERE a DB_Optimized_Read replaces an application-side aggregation, THE Aura SHALL document the expected speedup (e.g. measured `EXPLAIN ANALYZE` against the old path) in the design phase.
5. THE Aura SHALL keep the React `cache()` deduplication of session resolution within a single render.

### Requirement 14: Type safety end-to-end

**User Story:** As an Aura application developer, I want operation inputs, outputs, and DB_Optimized_Read schemas to remain fully type-safe end-to-end, so that the IDE catches contract drift at edit time.

#### Acceptance Criteria

1. THE Aura SHALL preserve `InferOperationInput<T>` and `InferOperationOutput<T>` helpers.
2. THE Aura SHALL preserve `auraQueryKey(name, input, params)` shape for use in both client hooks and `prefetchAuraQuery`.
3. THE Aura SHALL preserve `AuraClientError` shape on the client (`code`, `status`, `requestId`, `fieldErrors`).
4. WHEN a Zod input or params parse fails, THE Aura SHALL throw `AuraError("VALIDATION_ERROR", …, { fieldErrors })` with field paths joined by `.`.
5. THE Aura SHALL produce a typed Prisma view binding (or equivalent) for every DB_Optimized_Read, so that the operation handler consumes a typed result rather than `unknown`.

### Requirement 15: Migration strategy and rollback safety

**User Story:** As a platform operator, I want the migration to be reversible until cutover, so that we can roll back to the Next.js stack if a regression is discovered late.

#### Acceptance Criteria

1. THE Aura SHALL preserve the existing Prisma schema and migration history without destructive changes.
2. WHILE the migration is in progress, THE Aura SHALL keep the existing Next.js entry points (`/aura`, `/aura-internal`, `/files`, `/health`) functional in a feature branch until the new Hono entry points pass parity tests.
3. THE Aura SHALL provide a parity test plan covering: bridge happy path, manifest GET, internal cron secret check, CSRF unsafe-method check, session resolution + revocation, mutation invalidation broadcast, hydration round-trip, file serving with traversal protection, health probe.
4. IF a parity test fails, THEN THE Aura SHALL block cutover until the failure is fixed or explicitly accepted.

### Requirement 16: Action primitive (Convex-inspired)

**User Story:** As an Aura application developer, I want a third operation type `action()` for side-effectful work (external API calls, email sending, file uploads, webhooks), so that I can clearly separate pure data operations from effectful ones and get appropriate type-level guardrails.

#### Acceptance Criteria

1. THE Aura SHALL extend the operation builder with `.action()` as a third type alongside `.query()` and `.mutate()`, so that `defineOperationFn(name).action().input(z).handler(fn)` is valid.
2. THE Aura SHALL provide an `AuraActionContext` to action handlers that DOES NOT include a transactional Prisma client — actions MUST NOT run inside a DB transaction.
3. THE Aura SHALL allow action handlers to call mutations and queries internally via `ctx.runMutation(name, input)` and `ctx.runQuery(name, input)`, executing them as in-process function calls (not HTTP).
4. THE Aura SHALL allow action handlers to perform arbitrary side effects: HTTP fetch, file I/O, email sending, third-party SDK calls.
5. THE Aura SHALL NOT cache action results in TanStack Query — actions are fire-and-forget or return a one-shot result.
6. THE Aura SHALL expose actions through Aura_Bridge via `POST /aura/:actionPath` with the same envelope format as mutations.
7. THE Aura SHALL allow actions to declare `.entities([...])` for invalidation, triggering broadcast invalidation on success (same as mutations).
8. THE Aura SHALL allow actions to be `.auth()`, `.public()`, or `.internal()` with the same access control semantics as queries and mutations.
9. IF an action handler throws, THEN THE Aura SHALL return an `AuraEnvelope` error with the same shape as mutation errors.
10. THE Aura SHALL provide `useAuraAction` client hook (or reuse `useAuraMutation` with type discrimination) that calls actions through the bridge and handles invalidation.

### Requirement 17: Convex-style function references and internal calls

**User Story:** As an Aura application developer, I want to reference operations by typed function reference (not just string name) when calling them from other operations, so that refactoring is safe and the compiler catches broken references.

#### Acceptance Criteria

1. THE Aura SHALL provide a mechanism for obtaining a typed reference to a registered operation, usable in `ctx.runMutation(ref, input)` and `ctx.runQuery(ref, input)` and `ctx.runAction(ref, input)`.
2. WHEN an operation is called via `ctx.runQuery(ref, input)`, THE Aura SHALL execute it in-process with the same `AuraContext` (sharing session, request metadata) but with a fresh `requestId`.
3. WHEN an operation is called via `ctx.runMutation(ref, input)`, THE Aura SHALL execute it in-process, and any entity invalidations from the inner mutation SHALL be merged into the outer operation's invalidation set.
4. THE Aura SHALL type-check the input argument against the referenced operation's Zod input schema at the TypeScript level, so that passing wrong input is a compile error.
5. THE Aura SHALL preserve the string-name calling convention as a fallback for dynamic dispatch (e.g., outbox event handlers that store operation names in the DB).

### Requirement 18: Scheduled functions (Convex-inspired `ctx.scheduler`)

**User Story:** As an Aura application developer, I want to schedule an operation to run after a delay or at a specific time from within any operation handler, so that I can defer work (send email in 5 minutes, retry payment in 1 hour) without managing cron expressions.

#### Acceptance Criteria

1. THE Aura SHALL provide `ctx.scheduler.runAfter(delayMs, operationRef, input)` that schedules the referenced operation to execute after `delayMs` milliseconds.
2. THE Aura SHALL provide `ctx.scheduler.runAt(timestamp, operationRef, input)` that schedules the referenced operation to execute at the given `Date`.
3. THE Aura SHALL persist each scheduled invocation as an `AuraJobRun` row with `status=PENDING`, `runAt`, `operationName`, and serialized `input`.
4. THE Aura SHALL process pending scheduled jobs via the existing outbox/cron processor, picking up jobs whose `runAt <= now()` and executing them through `runAuraOperation` with `source: "scheduler"`.
5. THE Aura SHALL guarantee **at-least-once** delivery: if the process crashes mid-execution, the job remains `RUNNING` and is retried after `OUTBOX_LOCK_SECONDS`.
6. THE Aura SHALL allow scheduled operations to be queries, mutations, or actions — the scheduler does not restrict the operation type.
7. THE Aura SHALL return a `scheduledId` (the `AuraJobRun.id`) from `ctx.scheduler.runAfter` / `ctx.scheduler.runAt`, usable for cancellation.
8. THE Aura SHALL provide `ctx.scheduler.cancel(scheduledId)` that marks the job as `CANCELLED` if it has not yet started.

### Requirement 19: Query read-only enforcement

**User Story:** As an Aura framework maintainer, I want queries to be provably read-only at the type level, so that developers cannot accidentally write to the database from a query handler.

#### Acceptance Criteria

1. THE Aura SHALL provide an `AuraQueryContext` type for query handlers whose `db` field is a read-only Prisma client (only `findMany`, `findFirst`, `findUnique`, `count`, `aggregate`, `groupBy`, `$queryRaw` — no `create`, `update`, `delete`, `upsert`, `$executeRaw`, `$transaction`).
2. THE Aura SHALL provide an `AuraMutationContext` type for mutation handlers with full Prisma read/write access including `$transaction`.
3. THE Aura SHALL provide an `AuraActionContext` type for action handlers with NO direct Prisma access (must go through `ctx.runQuery` / `ctx.runMutation`), OR with read-only access only (decided in design).
4. IF a query handler attempts a write operation at runtime (e.g., via type assertion bypass), THEN THE Aura SHALL throw `AuraError("INTERNAL_ERROR", "Write operations are forbidden in queries")`.

### Requirement 20: Operation middleware (Convex-inspired)

**User Story:** As an Aura application developer, I want to compose reusable middleware that runs before operation handlers (auth checks, rate limiting, input transforms), so that cross-cutting concerns are DRY.

#### Acceptance Criteria

1. THE Aura SHALL preserve the existing `.use(middlewareFn)` chain on the operation builder.
2. THE Aura SHALL allow middleware to short-circuit by throwing `AuraError` (e.g., a rate-limit middleware throws `RATE_LIMITED`).
3. THE Aura SHALL allow middleware to augment the context (e.g., a `withOrganization` middleware resolves the org from params and adds `ctx.organization`).
4. THE Aura SHALL type the augmented context so that the handler receives the union of the base context and all middleware-added fields.
5. THE Aura SHALL run middleware in declaration order (left to right in the `.use()` chain), then run the handler.

### Requirement 21: Convex-style HTTP actions (raw HTTP handlers)

**User Story:** As an Aura application developer, I want to define raw HTTP handlers (webhooks, OAuth callbacks, file upload endpoints) that live alongside Aura operations and share the same context/auth infrastructure, so that I don't need to write separate Hono routes for every webhook.

#### Acceptance Criteria

1. THE Aura SHALL provide `defineHttpAction(path, method).handler(fn)` for declaring raw HTTP handlers that receive `(ctx: AuraContext, request: Request) => Response | Promise<Response>`.
2. THE Aura SHALL mount all registered HTTP actions on the Hono app under a configurable prefix (default: `/aura-http/`).
3. THE Aura SHALL provide the same `AuraContext` (session, db, auth, storage, etc.) to HTTP action handlers.
4. THE Aura SHALL allow HTTP actions to opt into or out of CSRF protection via a `.csrf(true|false)` builder method (default: false for webhooks).
5. THE Aura SHALL allow HTTP actions to be `.auth()`, `.public()`, or `.internal()`.

### Requirement 22: Entity-based reactive invalidation (enhanced)

**User Story:** As an Aura application developer, I want fine-grained entity invalidation where mutations can declare exactly which entity IDs changed (not just entity types), so that only queries watching those specific IDs refetch.

#### Acceptance Criteria

1. THE Aura SHALL extend the invalidation payload from `keys: string[]` (entity type names) to `keys: Array<string | { entity: string, id: string }>` supporting both type-level and instance-level invalidation.
2. WHEN a mutation declares `.entities(["Order"])` and the handler returns, THE Aura SHALL broadcast `keys: ["Order"]` (type-level, all Order queries refetch).
3. WHEN a mutation uses `ctx.invalidate({ entity: "Order", id: orderId })` inside the handler, THE Aura SHALL broadcast `keys: [{ entity: "Order", id: orderId }]` (instance-level, only queries watching that specific order refetch).
4. THE Aura SHALL update `useAuraQuery` to support an optional `entities` option that declares which entity types/IDs the query watches, enabling instance-level matching.
5. THE Aura SHALL fall back to type-level matching when a query does not declare specific IDs (backward compatible).

### Requirement 23: Convex-style file storage integration

**User Story:** As an Aura application developer, I want file uploads and downloads to be first-class in the operation system (like Convex's `storage.store()` / `storage.getUrl()`), so that I can reference stored files by ID in my data model.

#### Acceptance Criteria

1. THE Aura SHALL provide `ctx.storage.store(file: File | Blob | Buffer, metadata?: { filename, contentType })` that uploads the file and returns a `storageId: string`.
2. THE Aura SHALL provide `ctx.storage.getUrl(storageId)` that returns the serving URL for the file (e.g., `/files/{storageId}/{filename}`).
3. THE Aura SHALL provide `ctx.storage.delete(storageId)` that removes the file from storage.
4. THE Aura SHALL store file metadata (storageId, filename, contentType, size, uploadedAt, uploadedBy) in a Prisma model `AuraStoredFile`.
5. THE Aura SHALL serve stored files through Aura_Files_Endpoint, resolving `storageId` to the physical path via `AuraStoredFile`.

### Requirement 24: Typed client API surface (Convex-inspired `api` object)

**User Story:** As an Aura application developer, I want a fully typed `api` object (like Convex's generated `api.ts`) that gives me autocomplete and type inference when calling operations from the client or from other operations, so that I never pass wrong operation names or inputs.

#### Acceptance Criteria

1. THE Aura SHALL provide a typed API surface where `useAuraQuery(api.catalog.productBySlug, { slug })` gives full autocomplete on the operation path and type-checks the input.
2. THE Aura SHALL support the typed API surface via either module augmentation (current pattern enhanced) or a codegen step (`aura:codegen` CLI) — mechanism decided in design.
3. THE Aura SHALL ensure that `InferOperationInput<typeof api.catalog.productBySlug>` and `InferOperationOutput<typeof api.catalog.productBySlug>` resolve correctly.
4. THE Aura SHALL support dot-notation namespacing in the API object (e.g., `api.catalog.productBySlug` maps to operation name `"catalog.productBySlug"`).
5. THE Aura SHALL preserve backward compatibility with string-name usage (`useAuraQuery("catalog.productBySlug", { slug })`) for gradual adoption.

### Requirement 25: Cursor-based pagination (Convex-inspired)

**User Story:** As an Aura application developer, I want a built-in cursor-based pagination system for queries, so that I can efficiently paginate large datasets without offset-based performance degradation.

#### Acceptance Criteria

1. THE Aura SHALL provide a `.paginate()` modifier on the query builder that enables cursor-based pagination for a query operation.
2. WHEN a paginated query is called with `{ cursor?: string, numItems: number }`, THE Aura SHALL return `{ items: T[], cursor: string | null, isDone: boolean }`.
3. THE Aura SHALL encode the cursor as an opaque string (base64-encoded JSON of the last row's sort key) so that clients cannot forge or manipulate cursors.
4. THE Aura SHALL support forward pagination (next page) and optionally backward pagination (previous page) via `{ cursor, direction: "next" | "prev" }`.
5. THE Aura SHALL provide a `useAuraPaginatedQuery` client hook that manages cursor state, supports infinite scroll (`loadMore()`), and integrates with TanStack Query's `useInfiniteQuery`.
6. THE Aura SHALL allow paginated queries to declare a sort order (e.g., `.orderBy("createdAt", "desc")`) that determines the cursor field.
7. THE Aura SHALL validate that the cursor belongs to the same query (operation name + params hash) to prevent cursor reuse across different queries.

### Requirement 26: Full-text search (Convex-inspired)

**User Story:** As an Aura application developer, I want to declare full-text search indexes on my data and query them from operations, so that I can build search features without an external search service.

#### Acceptance Criteria

1. THE Aura SHALL provide a mechanism to declare full-text search indexes on Prisma models, backed by PostgreSQL's built-in `tsvector`/`tsquery` full-text search or `pg_trgm` trigram indexes.
2. THE Aura SHALL provide a `ctx.db.search(model, { query: string, fields: string[], filter?: ... })` API that executes a full-text search and returns ranked results.
3. THE Aura SHALL support filtering search results by additional fields (e.g., search products where `category = "electronics"`).
4. THE Aura SHALL declare search indexes as part of the Prisma migration history (custom SQL in migrations) so that `prisma migrate deploy` provisions them.
5. THE Aura SHALL provide a `defineSearchIndex(model, { fields, filterFields })` declaration that generates the appropriate migration SQL and typed query helpers.
6. THE Aura SHALL return search results with a relevance score, ordered by relevance by default.

### Requirement 27: Vector search (Convex-inspired, for AI/RAG)

**User Story:** As an Aura application developer, I want to store vector embeddings and perform similarity search, so that I can build AI-powered features (RAG, recommendations, semantic search) without an external vector database.

#### Acceptance Criteria

1. THE Aura SHALL provide a mechanism to declare vector indexes on Prisma models, backed by PostgreSQL's `pgvector` extension.
2. THE Aura SHALL provide a `ctx.db.vectorSearch(model, { vector: number[], limit: number, filter?: ... })` API that returns the nearest neighbors by cosine similarity (or configurable distance metric).
3. THE Aura SHALL support filtering vector search results by additional fields.
4. THE Aura SHALL declare vector indexes as part of the Prisma migration history (custom SQL: `CREATE INDEX ... USING ivfflat/hnsw`).
5. THE Aura SHALL provide a `defineVectorIndex(model, { vectorField, dimensions, filterFields })` declaration.
6. THE Aura SHALL validate that the query vector has the correct dimensionality at runtime.
7. THE Aura SHALL support vector search from actions only (like Convex), or from queries with a performance warning — decided in design.

### Requirement 28: Aura Components (Convex-inspired modular backend)

**User Story:** As an Aura ecosystem developer, I want to package reusable backend modules (auth, rate limiting, notifications, payments) as self-contained components with their own schema, operations, and data isolation, so that I can share and reuse backend logic across projects.

#### Acceptance Criteria

1. THE Aura SHALL provide a `defineComponent(name, { schema, operations, exports })` API for declaring a self-contained backend module.
2. THE Aura SHALL isolate component data: a component's Prisma models are namespaced (e.g., prefixed with `Component_`) and cannot be directly accessed by application code.
3. THE Aura SHALL allow components to expose a public API (exported operations) that application code can call via `ctx.runComponent(componentRef, operationName, input)`.
4. THE Aura SHALL allow components to declare their own cron jobs, scheduled functions, and HTTP actions.
5. THE Aura SHALL provide an installation mechanism (`aura:install <component>`) that adds the component's schema to the Prisma schema and registers its operations.
6. THE Aura SHALL allow components to declare configuration options (e.g., `AuraAuthComponent({ sessionDuration: "7d" })`).
7. THE Aura SHALL ship the existing auth subsystem (`server/auth/*`) as the first built-in component (`@aura/auth`), demonstrating the pattern.

### Requirement 29: Durable workflows (Convex-inspired)

**User Story:** As an Aura application developer, I want to define multi-step durable workflows that survive process restarts, so that I can orchestrate complex business processes (order fulfillment, onboarding sequences, payment retries) reliably.

#### Acceptance Criteria

1. THE Aura SHALL provide a `defineWorkflow(name).steps([...]).handler(fn)` API for declaring a multi-step durable workflow.
2. THE Aura SHALL persist workflow state (current step, intermediate results, retry count) in an `AuraWorkflowRun` Prisma model.
3. WHEN a workflow step completes, THE Aura SHALL advance to the next step and persist the result before proceeding.
4. IF a process crashes mid-workflow, THEN THE Aura SHALL resume from the last completed step on restart (not re-execute completed steps).
5. THE Aura SHALL support conditional branching (`if/else`), parallel steps (`Promise.all`-style), and sleep/delay between steps.
6. THE Aura SHALL support workflow cancellation via `ctx.workflow.cancel(workflowRunId)`.
7. THE Aura SHALL expose workflow status (pending, running, completed, failed, cancelled) queryable from operations.
8. THE Aura SHALL allow each workflow step to be a query, mutation, or action invocation.

### Requirement 30: Realtime subscriptions (enhanced entity-invalidation)

**User Story:** As an Aura application developer, I want queries to automatically refetch when their underlying data changes, with minimal latency and no manual invalidation wiring, so that my UI stays in sync like Convex's reactive queries.

#### Acceptance Criteria

1. THE Aura SHALL preserve the existing entity-invalidation broadcast model as the primary reactivity mechanism.
2. THE Aura SHALL automatically derive entity tags from query operations that use `ctx.db` reads, so that developers don't need to manually declare `.entities([...])` on queries (opt-in auto-tracking).
3. WHEN a mutation writes to a table, THE Aura SHALL automatically broadcast invalidation for that table's entity tag without requiring the developer to manually declare `.entities([...])` on the mutation (opt-in auto-tracking).
4. THE Aura SHALL allow developers to override auto-tracking with explicit `.entities([...])` declarations for fine-grained control.
5. THE Aura SHALL provide a `staleTime` configuration per query that controls how aggressively the client refetches after invalidation (leveraging TanStack Query's built-in staleTime).
6. THE Aura SHALL document the latency trade-off vs Convex's live queries: Aura uses invalidation + refetch (~100-500ms) vs Convex's server-push (~50ms), and explain when each model is appropriate.

### Requirement 31: AI Agent framework (Convex Agent-inspired, LangChain/LangGraph native)

**User Story:** As an Aura application developer, I want a built-in AI agent framework with persistent threads, message history, tool calling, and streaming, so that I can build AI-powered features (chatbots, assistants, multi-agent workflows) using LangChain/LangGraph without managing the infrastructure myself.

#### Acceptance Criteria

1. THE Aura SHALL provide a `defineAgent(name, { model, systemPrompt, tools, maxSteps })` API for declaring an AI agent with its LLM configuration, system prompt, and available tools.
2. THE Aura SHALL persist agent conversations in an `AuraAgentThread` model (id, title, metadata, createdAt, userId) and an `AuraAgentMessage` model (id, threadId, role, content, toolCalls, toolResults, metadata, createdAt).
3. THE Aura SHALL provide `ctx.agent.createThread(agentRef, { userId, metadata })` to start a new conversation thread.
4. THE Aura SHALL provide `ctx.agent.generateText(threadRef, { prompt, tools?, maxSteps? })` that sends the prompt + thread history to the LLM, executes tool calls, and persists all messages.
5. THE Aura SHALL provide `ctx.agent.streamText(threadRef, { prompt, tools?, maxSteps? })` that streams the LLM response token-by-token to connected clients via the Aura broadcast WebSocket.
6. THE Aura SHALL support **tool definitions** where each tool is an Aura operation (query, mutation, or action) that the LLM can invoke, with Zod schemas automatically converted to the LLM's tool format.
7. THE Aura SHALL integrate with **LangChain JS** (`@langchain/core`, `@langchain/openai`, `@langchain/anthropic`, etc.) for model abstraction, so that switching between OpenAI, Anthropic, Google, or local models requires only a config change.
8. THE Aura SHALL integrate with **LangGraph JS** (`@langchain/langgraph`) for complex multi-step agent workflows (state machines, conditional branching, human-in-the-loop).
9. THE Aura SHALL automatically inject thread message history as context when calling the LLM, with configurable context window management (last N messages, token budget, or summarization).
10. THE Aura SHALL support **multi-agent** patterns: multiple agents can respond in the same thread, and agents can delegate to other agents via `ctx.agent.handoff(otherAgentRef, threadRef, { prompt })`.

### Requirement 32: AI Agent tools as Aura operations

**User Story:** As an Aura application developer, I want to expose my existing Aura operations (queries, mutations, actions) as tools that AI agents can call, so that agents can read and write application data through the same typed, validated, authorized API as human users.

#### Acceptance Criteria

1. THE Aura SHALL provide a `.asTool({ description })` modifier on any operation that converts it into an LLM-callable tool with the operation's Zod input schema as the tool's parameters.
2. WHEN an agent calls a tool, THE Aura SHALL execute the underlying operation with the agent's context (session, permissions), enforcing the same auth rules as a human caller.
3. THE Aura SHALL serialize tool call results back to the LLM as JSON, and persist both the tool call and its result as messages in the thread.
4. THE Aura SHALL support **human-in-the-loop** tool approval: certain tools can be marked `.requiresApproval()`, pausing the agent until a human approves or rejects the tool call.
5. THE Aura SHALL provide a client-side hook `useAuraAgentThread(threadId)` that reactively displays messages (including streaming tokens) and pending tool approvals.
6. THE Aura SHALL allow tools to be defined inline (not backed by an operation) for simple cases: `{ name, description, parameters: z.object(...), execute: async (input) => result }`.

### Requirement 33: AI streaming via WebSocket (not HTTP streaming)

**User Story:** As an Aura application developer, I want AI agent responses to stream via the existing Aura WebSocket broadcast infrastructure (not HTTP streaming), so that multiple clients can see the same streaming response in real-time and the stream survives network interruptions.

#### Acceptance Criteria

1. WHEN an agent streams a response, THE Aura SHALL broadcast token deltas via the Aura broadcast WebSocket as `{ type: "AGENT_STREAM", threadId, messageId, delta: string, done: boolean }`.
2. THE Aura SHALL persist the final complete message in `AuraAgentMessage` once streaming is done.
3. THE Aura SHALL support multiple clients subscribing to the same thread's stream simultaneously (e.g., user on phone and desktop both see tokens appear).
4. IF a client disconnects and reconnects mid-stream, THEN THE Aura SHALL send the accumulated content so far (from the persisted partial message) followed by remaining deltas.
5. THE Aura SHALL support streaming structured objects (not just text) for use cases like streaming JSON, tool call progress, or step-by-step reasoning.
6. THE Aura SHALL provide a `useAuraAgentStream(threadId)` client hook that manages the streaming state and exposes `{ messages, isStreaming, streamingContent }`.

### Requirement 34: AI RAG (Retrieval-Augmented Generation) integration

**User Story:** As an Aura application developer, I want agents to automatically retrieve relevant context from my application data (via vector search and full-text search) before generating responses, so that agents give accurate, grounded answers.

#### Acceptance Criteria

1. THE Aura SHALL provide a `defineRAGSource(name, { model, fields, embeddingModel, chunkStrategy })` API for declaring a data source that should be indexed for RAG.
2. THE Aura SHALL automatically generate and store embeddings when documents are created or updated (via an outbox job or a mutation hook).
3. WHEN an agent generates a response, THE Aura SHALL optionally perform a hybrid search (vector + full-text) on configured RAG sources and inject the top-K results as context.
4. THE Aura SHALL support configurable retrieval strategies: vector-only, text-only, hybrid (RRF fusion), with per-agent or per-thread configuration.
5. THE Aura SHALL integrate with the vector search (Requirement 27) and full-text search (Requirement 26) infrastructure — no separate indexing system.
6. THE Aura SHALL track which documents were used as context for each response (stored in message metadata) for attribution and debugging.

### Requirement 35: AI usage tracking and rate limiting

**User Story:** As a platform operator, I want to track AI token usage per user, per agent, and per model, and enforce rate limits, so that I can manage costs and prevent abuse.

#### Acceptance Criteria

1. THE Aura SHALL record every LLM call in an `AuraAIUsage` model with: agentName, threadId, userId, model, provider, inputTokens, outputTokens, totalTokens, latencyMs, cost (estimated), createdAt.
2. THE Aura SHALL provide `ctx.agent.getUsage({ userId?, agentName?, since? })` for querying usage statistics.
3. THE Aura SHALL integrate with Aura's rate limiting (Requirement 8) to enforce per-user token budgets (e.g., max 100K tokens/day per user).
4. IF a user exceeds their AI rate limit, THEN THE Aura SHALL throw `AuraError("RATE_LIMITED", "AI token budget exceeded")` before calling the LLM.
5. THE Aura SHALL support configurable cost estimation per model (e.g., GPT-4o = $2.50/1M input tokens) for budget tracking.

### Requirement 36: AI Agent playground and debugging

**User Story:** As an Aura application developer, I want a built-in playground UI and debugging tools for testing agents, so that I can iterate on prompts, tools, and workflows without deploying to production.

#### Acceptance Criteria

1. THE Aura SHALL provide a `/aura-playground` route (dev-only) that renders a chat UI for testing any registered agent.
2. THE Aura SHALL display tool calls, tool results, and intermediate reasoning steps in the playground UI.
3. THE Aura SHALL provide a `rawRequestResponseHandler` callback on agents for logging the full LLM request/response for debugging.
4. THE Aura SHALL integrate with the Aura doctor CLI (`aura:doctor`) to validate agent configurations (model API keys present, tools resolvable, etc.).
5. THE Aura SHALL support replaying a thread from a specific message (for debugging branching behavior).

### Requirement 37: Strict folder conventions and CLI-enforced file structure

**User Story:** As an Aura application developer, I want a strict, enforced folder convention for operations, middleware, agents, workflows, crons, and all other Aura artifacts, so that every project has a consistent architecture and files are always generated via CLI (never manually created in wrong locations).

#### Acceptance Criteria

1. THE Aura SHALL enforce a canonical folder structure under `src/operations/` (or configurable root) where each artifact type lives in a dedicated location with a mandatory file suffix:
   - `.operation.ts` — operations (queries, mutations, actions)
   - `.middleware.ts` — operation middleware
   - `.cron.ts` — cron job definitions
   - `.workflow.ts` — durable workflow definitions
   - `.agent.ts` — AI agent definitions
   - `.http.ts` — HTTP action definitions (webhooks)
   - `.rag.ts` — RAG source definitions
   - `.search.ts` — search index definitions
   - `.vector.ts` — vector index definitions
   - `.component.ts` — component definitions
   - `.db-read.ts` — DB-optimized read definitions
2. THE Aura SHALL organize operations by domain namespace using folders (e.g., `src/operations/catalog/productBySlug.operation.ts` maps to operation name `catalog.productBySlug`).
3. THE Aura SHALL provide `aura:make` CLI commands for generating every artifact type with the correct file suffix and location:
   - `aura:make operation catalog.productBySlug --type query`
   - `aura:make operation orders.create --type mutate`
   - `aura:make operation payments.processRefund --type action`
   - `aura:make middleware withOrganization`
   - `aura:make cron db.refreshViews --schedule "0 */5 * * *"`
   - `aura:make workflow orders.fulfill`
   - `aura:make agent support`
   - `aura:make http webhooks/stripe --method POST`
   - `aura:make rag helpArticles --model HelpArticle`
4. THE Aura SHALL validate at startup (and via `aura:doctor`) that no operation/middleware/cron/agent file exists outside the canonical folder structure, and emit warnings for misplaced files.
5. THE Aura SHALL auto-discover and register all files matching the suffix conventions (e.g., all `*.operation.ts` files are auto-registered without manual imports in a central registry file).
6. THE Aura SHALL enforce that each `.operation.ts` file exports exactly one operation (one `defineOperationFn(...)` call), preventing multi-operation files that become hard to navigate.
7. THE Aura SHALL enforce that operation names match their file path (e.g., `src/operations/catalog/productBySlug.operation.ts` MUST export an operation named `catalog.productBySlug`), validated at startup and by `aura:doctor`.
8. THE Aura SHALL provide a `_registry.ts` auto-generated file (like `_generated/api.ts`) that imports all discovered operations, middleware, crons, agents, etc., so that the developer never manually maintains import lists.
9. THE Aura SHALL support a configurable root directory (default: `src/operations/`) via `aura.config.ts` for projects that prefer a different layout.
10. THE Aura SHALL generate boilerplate with correct imports, types, and structure — the generated file MUST compile without edits (only the handler body needs implementation).

### Requirement 38: Built-in UI kit (shadcn-based, kebab-case naming)

**User Story:** As an Aura application developer, I want a set of pre-built, high-level UI components built exclusively on shadcn/ui primitives, so that I can ship SaaS features (data tables, forms, auth pages, dashboards, settings panels) in minutes instead of hours.

#### Acceptance Criteria

1. THE Aura SHALL provide a `@/aura/ui` package of pre-built composite components built exclusively on shadcn/ui primitives (Button, Dialog, Card, Table, Input, Select, etc.) and Tailwind CSS.
2. THE Aura SHALL use **kebab-case** for all file names and component exports (e.g., `aura-data-table.tsx`, `aura-form-field.tsx`, `aura-auth-card.tsx`) — never camelCase or PascalCase in file names.
3. THE Aura SHALL provide the following built-in UI components (minimum set):
   - `<AuraDataTable>` — server-paginated, sortable, filterable data table wired to `useAuraPaginatedQuery`
   - `<AuraForm>` — auto-generated form from a Zod schema, wired to `useAuraForm` / `useAuraMutation`
   - `<AuraFormField>` — individual field renderer (text, number, select, date, file, etc.) driven by Zod type
   - `<AuraBumpToaster>` — toast/notification renderer that consumes `bumps` from `AuraEnvelope.meta.bumps` via sonner
   - `<AuraAuthCard>` — login/register/forgot-password card with OTP, password, and phone flows
   - `<AuraGuardView>` — page wrapper that shows loading/unauthorized states based on `AuraGuard`
   - `<AuraConfirmDialog>` — confirmation dialog for destructive actions (wired to mutations)
   - `<AuraFileUpload>` — drag-and-drop file upload wired to `ctx.storage.store`
   - `<AuraSearchInput>` — debounced search input wired to full-text search queries
   - `<AuraEmptyState>` — empty state placeholder with icon, title, description, and action button
   - `<AuraErrorBoundary>` — error boundary that displays `AuraClientError` in a user-friendly card
   - `<AuraLoadingSkeleton>` — skeleton loader matching the shape of common layouts
   - `<AuraAgentChat>` — chat UI for AI agent threads (messages, streaming, tool calls, approvals)
   - `<AuraSettingsLayout>` — sidebar + content settings page layout
   - `<AuraDashboardShell>` — dashboard layout with sidebar nav, header, and content area
4. THE Aura SHALL wire `<AuraBumpToaster>` to automatically display server-side bumps (`ctx.bump.success(...)`, `ctx.bump.error(...)`) as sonner toasts on the client after every mutation response.
5. THE Aura SHALL make every UI component fully customizable via props, className overrides, and render props (slot pattern), so that developers can override any part without forking.
6. THE Aura SHALL use the shadcn/ui theming system (CSS variables) so that all Aura UI components respect the application's theme (light/dark, brand colors).
7. THE Aura SHALL provide a `aura:make ui <component-name>` CLI command that scaffolds a new custom UI component in the correct location with the correct naming convention.
8. THE Aura SHALL organize UI components in `src/aura/ui/` with kebab-case file names:
   ```
   src/aura/ui/
   ├── aura-data-table.tsx
   ├── aura-form.tsx
   ├── aura-form-field.tsx
   ├── aura-bump-toaster.tsx
   ├── aura-auth-card.tsx
   ├── aura-guard-view.tsx
   ├── aura-confirm-dialog.tsx
   ├── aura-file-upload.tsx
   ├── aura-search-input.tsx
   ├── aura-empty-state.tsx
   ├── aura-error-boundary.tsx
   ├── aura-loading-skeleton.tsx
   ├── aura-agent-chat.tsx
   ├── aura-settings-layout.tsx
   ├── aura-dashboard-shell.tsx
   └── index.ts
   ```
9. THE Aura SHALL enforce kebab-case naming convention for ALL files in the project (operations, components, routes, etc.) — validated by `aura:doctor` and ESLint rule.
10. THE Aura SHALL provide `<AuraDataTable>` with built-in column definitions derived from Zod schemas, so that a table for an entity can be rendered with minimal configuration:
    ```tsx
    <AuraDataTable
      query={api.orders.list}
      columns={["id", "status", "total", "createdAt"]}
      searchable
      sortable
      actions={[
        { label: "Cancel", mutation: api.orders.cancel, confirm: true },
      ]}
    />
    ```

### Requirement 39: Naming convention enforcement (kebab-case everywhere)

**User Story:** As an Aura application developer, I want a single, consistent naming convention (kebab-case) enforced across all file names in the project, so that the codebase is predictable and grep-friendly.

#### Acceptance Criteria

1. THE Aura SHALL enforce kebab-case for all file names generated by `aura:make`:
   - Operations: `product-by-slug.operation.ts` (not `productBySlug.operation.ts`)
   - Middleware: `with-organization.middleware.ts`
   - Crons: `refresh-catalog.cron.ts`
   - Agents: `customer-support.agent.ts`
   - UI: `aura-data-table.tsx`
2. THE Aura SHALL map kebab-case file names to dot-notation operation names:
   - `src/operations/catalog/product-by-slug.operation.ts` → operation name: `catalog.product-by-slug`
3. THE Aura SHALL provide an ESLint rule (`aura/kebab-case-files`) that flags any file in `src/operations/` or `src/aura/ui/` that does not follow kebab-case.
4. THE Aura SHALL validate naming conventions via `aura:doctor` and emit errors for non-compliant files.
5. THE Aura SHALL use kebab-case for TanStack Start route files (e.g., `routes/orders/$order-id.tsx`).

## Open questions to resolve in design

1. **DB_Optimized_Read mechanism (Requirement 4):** Prisma `views`, raw SQL via `$queryRaw`, PLpgSQL functions, materialized views, or a composition. Pick one primary mechanism and document the rationale.
2. **TanStack Start cookie API:** Confirm the exact API used to apply queued cookie mutations from `ctx.cookies.set` on a server function response, and document the equivalence to Next.js's `cookies()` store.
3. **`useRouter().refresh()` replacement:** Decide between TanStack Start router invalidation, route loader re-run, or a noop when no loader is active.
4. **Vite + `server-only` enforcement:** Confirm the Vite plugin / build-time guard that fails the build when a `server-only` module reaches a client chunk.
5. **Next.js dependencies removal:** Audit application code (outside `src/aura/`) for residual `next/*` imports; decide whether they migrate, are replaced, or block the migration.
6. **File serving in TanStack Start:** Decide whether the `/files/*` route stays a raw Hono handler (recommended) or becomes a TanStack Start server route.
7. **Reactive subscription model (Requirements 10 and 16):** Convex's headline feature is "queries are reactive by default; subscribing a query returns a live result that updates as underlying data changes." Aura today is reactive only via mutation-driven entity invalidation broadcast over WebSocket. Decide between (a) Convex-style **live queries** (server pushes the new query result on data change) and (b) the current **entity-invalidation broadcast** (server pushes "refetch this tag", client refetches through TanStack Query). Default proposed: **keep entity-invalidation**, document the trade-off vs Convex's live queries (latency, server cost, fan-out semantics, fit with DB_Optimized_Read).
8. **Codegen vs module augmentation for the typed client API surface (Requirement 24):** Decide between keeping the current string-name + `OperationsType` module-augmentation pattern, shipping a `aura:codegen` CLI emitting `_generated/api.ts`, or supporting both. The chosen mechanism MUST give end-to-end inference of input and output types in the IDE without manual generics.
9. **Action primitive isolation (Requirement 16):** Decide how to forbid Prisma transaction usage at the type level inside `action()` handlers, e.g. by giving `action()` a distinct context type whose `db` field is omitted or replaced with a non-transactional client.
10. **Scheduler durability semantics (Requirement 18):** Decide between **at-least-once** delivery (simpler, requires handler idempotency) and **exactly-once** delivery (harder, requires deduplication keys persisted alongside `AuraJobRun`). Document the chosen guarantee and the failure modes it implies for `ctx.scheduler.runAfter`.
