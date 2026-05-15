/**
 * `auraHttpActionsRouter` — Hono mount that dispatches webhook-style
 * HTTP actions registered via `defineHttpAction`.
 *
 * Resolves: Requirement 21.2 (task 12.2).
 *
 * Mounted at a configurable prefix (default `/aura-http/`) by
 * `createAuraHonoApp`. Routes are matched by `method + path` against
 * the registry.
 */

import { Hono } from "hono";
import { listHttpActions, runHttpAction, type HttpActionDefinition } from "../http-action";
import { AuraError } from "@/aura/core/errors";

export function auraHttpActionsRouter(): Hono {
  const app = new Hono();

  // Catch-all dispatcher — Hono parses path segments in `c.req.path`.
  app.all("/*", async (c) => {
    const method = c.req.method.toUpperCase();
    const path = "/" + (c.req.path.replace(/^\//, ""));

    const action = listHttpActions().find(
      (def: HttpActionDefinition) => def.method === method && def.path === path,
    );
    if (!action) {
      return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Unknown HTTP action" } }, 404);
    }

    try {
      const response = await runHttpAction(action, c.req.raw, "bridge");
      return response;
    } catch (error) {
      if (error instanceof AuraError) {
        return c.json(
          { ok: false, error: { code: error.code, message: error.message } },
          error.status as 400 | 401 | 403 | 404 | 429 | 500,
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ ok: false, error: { code: "INTERNAL_ERROR", message } }, 500);
    }
  });

  return app;
}
