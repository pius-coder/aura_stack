

import { Hono } from "hono";
import { auraBridgeRouter } from "./routes/bridge";
import { auraInternalRouter } from "./routes/internal";
import { auraFilesRouter } from "./routes/files";
import { auraHealthRouter } from "./routes/health";
import { auraHttpActionsRouter } from "./routes/http-actions";

/**
 * `createAuraHonoApp()` — single Hono app factory that exposes every Aura
 * HTTP entry point.
 *
 * Resolves Requirement 1.13, 34.1 (final wiring).
 *
 * The factory mounts five standalone routers, each implemented in its own
 * module:
 *
 *   /aura/**          → Aura_Bridge        (`routes/bridge.ts`)
 *   /aura-internal/** → Aura_Internal      (`routes/internal.ts`)
 *   /files/**         → Aura_Files         (`routes/files.ts`)
 *   /health           → Aura_Health        (`routes/health.ts`)
 *   /aura-http/**     → Aura_HttpActions   (`routes/http-actions.ts`)
 *
 * Keeping the factory in a dedicated module lets the same app instance be
 * embedded in three places without duplication:
 *
 *   1. The TanStack Start server entry (mounts `app.fetch` for Aura paths
 *      before delegating everything else to TanStack Start's renderer).
 *   2. Standalone Bun/Node servers (e.g. the broadcast worker, integration
 *      tests, CLI tools).
 *   3. Unit/integration tests that drive the app via `app.request(...)`
 *      without any network hop.
 */
export function createAuraHonoApp() {
  const app = new Hono();

  // CSRF and rate-limit middleware are scoped to the bridge router itself,
  // not applied at the top level — the internal/files/health/http-actions
  // routers have their own auth model (shared secret, public read, etc.).
  app.route("/aura", auraBridgeRouter());
  app.route("/aura-internal", auraInternalRouter());
  app.route("/files", auraFilesRouter());
  app.route("/health", auraHealthRouter());
  app.route("/aura-http", auraHttpActionsRouter());

  return app;
}

export type AuraHonoApp = ReturnType<typeof createAuraHonoApp>;
