

import { Hono } from "hono";
import { db } from "@/aura/server/db";

/**
 * `auraHealthRouter` — standalone Hono router for `GET /health`.
 *
 * Resolves Requirement 1.12.
 *
 * Pings Prisma with `SELECT 1` and returns:
 *   { ok, uptime, timestamp, latencyMs, services: { database: { status, latencyMs } } }
 *
 * HTTP 200 when the DB ping succeeds, HTTP 503 when it throws.
 */
export function auraHealthRouter() {
  const router = new Hono();

  router.get("/", async (c) => {
    const start = performance.now();
    let dbOk = false;
    let dbLatencyMs = 0;

    try {
      await db.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    } finally {
      dbLatencyMs = Math.round(performance.now() - start);
    }

    const body = {
      ok: dbOk,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      latencyMs: dbLatencyMs,
      services: {
        database: {
          status: dbOk ? ("ok" as const) : ("error" as const),
          latencyMs: dbLatencyMs,
        },
      },
    };

    return c.json(body, dbOk ? 200 : 503);
  });

  return router;
}
