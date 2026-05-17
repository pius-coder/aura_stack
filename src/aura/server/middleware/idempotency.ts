import type { Context, MiddlewareHandler } from "hono";

const processedKeys = new Map<string, { result: unknown; expiresAt: number }>();

const TTL_MS = 60 * 60 * 1000;

export function idempotency(): MiddlewareHandler {
  return async (c: Context, next) => {
    if (c.req.method !== "POST") return next();

    const key = c.req.header("Idempotency-Key");
    if (!key) return next();

    const existing = processedKeys.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      return c.json(existing.result, 200);
    }

    await next();

    if (c.res.status >= 200 && c.res.status < 300) {
      const body = await c.res.clone().json();
      processedKeys.set(key, { result: body, expiresAt: Date.now() + TTL_MS });
    }
  };
}
