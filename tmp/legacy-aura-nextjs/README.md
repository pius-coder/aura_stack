# Legacy Aura Next.js Snapshot

This folder is the **pre-migration snapshot** of the Aura framework as it ran on Next.js 16 (App Router). It exists for one reason only: to be a reference while task `0.6` (and any other phase task that needs to copy framework code) ports files into the fresh TanStack Start + Hono structure under `src/`.

## What is in here

Captured during task `0.1` of `.kiro/specs/aura-hono-tanstack-migration/tasks.md`:

- `src/` — the entire Next.js source tree, including:
  - `src/app/` — the Next.js App Router routes, with the catch-all handlers `app/aura/[[...aura]]/route.ts`, `app/aura-internal/[[...aura]]/route.ts`, the `app/files/[...path]/route.ts` static file server, and the `app/health/route.ts` probe. These four route handlers are explicitly **not** ported by task `0.6` — they are replaced by Hono routers in Phase 1.
  - `src/aura/` — the Aura framework internals (`client/`, `core/`, `server/`, `shared/`, `cli/`). These **are** ported back into `src/aura/` by task `0.6`, preserving the subfolder layout. The standalone Hono broadcast server (`src/aura/server/broadcast.ts`) is preserved as-is per Requirement 10.1.
  - `src/operations/` (if present at archive time) and any application-level code that lived under `src/`.
- `next-env.d.ts` — Next.js TypeScript ambient declarations. Not ported.
- `tsconfig.json` — the Next.js-flavored TypeScript config. Not ported as-is; the new TanStack Start scaffold (task `0.2`) will generate its own.

The task `0.1` move list also names `next.config.*`, `.next/`, and `eslint.config.*`. These were not present at the workspace root when the snapshot was taken (no Next.js build had been run, and no project-level eslint or next config file existed), so there is nothing to capture for them. If they reappear before the migration is complete, move them into this folder.

## What is *not* in here (kept at the workspace root)

The following are intentionally **kept at the workspace root** for reuse by the new TanStack Start project:

- `prisma/` — the Prisma schema and migration history. Preserved per Requirement 3.2 and 15.1; copied into the new project by task `0.4`. (Not present at the time of this snapshot — to be added when database tooling is wired in.)
- `.kiro/` — specs, steering, and Kiro project metadata.
- `.git/` — the git repository.
- `.env*` — environment files. (Not present at the time of this snapshot.)
- `package.json` — the existing dependency manifest. Used as a reference for what to keep, add, and remove during task `0.7`.

## This folder is not part of the build

- It is **not** imported, bundled, or compiled by the new TanStack Start project.
- It is **not** referenced by `tsconfig.json`, `vite.config.*`, or any runtime entry point.
- It exists purely as a read-only reference for the migration tasks under `.kiro/specs/aura-hono-tanstack-migration/tasks.md`.

If you find yourself reaching into this folder from runtime code, that is a bug — copy what you need into `src/` instead and update the relevant migration task.

## When this folder gets deleted

Per the migration plan, this folder is **deleted at the end of the migration once parity tests pass** (the parity test plan defined in Requirement 15.3, covering: bridge happy path, manifest GET, internal cron secret check, CSRF unsafe-method check, session resolution + revocation, mutation invalidation broadcast, hydration round-trip, file serving with traversal protection, and the health probe).

Until then, treat it as immutable: do **not** edit files in here, do **not** rename them, and do **not** add new files. If something needs to change, change it in the new `src/` and leave the snapshot alone.
