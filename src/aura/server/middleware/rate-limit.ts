

import type { Context, MiddlewareHandler } from "hono";
import { v4 as uuidv4 } from "uuid";

import { errorEnvelope } from "@/aura/core/envelope";
import { AuraError } from "@/aura/core/errors";

// Re-export the in-memory bucket primitive so that callers can import it
// from the canonical middleware module rather than reaching into the
// legacy transport layer. The implementation lives in
// `server/transport/rate-limit-proxy.ts` and is reused as-is — do NOT
// duplicate the bucket logic here.
export {
  takeRateLimitToken,
  type RateLimitResult,
} from "@/aura/server/transport/rate-limit-proxy";

// Re-export the DB-backed enforcement helper so the rate-limit story is
// expressed by a single module surface. The implementation in
// `server/rate-limit.ts` (operating on `AuraRateLimitBucket`) is left
// untouched per task 2.2 — this is just a convenience re-export.
export { enforceRateLimit, type RateLimitOptions } from "@/aura/server/rate-limit";

import { takeRateLimitToken } from "@/aura/server/transport/rate-limit-proxy";

/**
 * Configuration for the Hono `rateLimitMiddleware` factory.
 *
 * The bucket key is derived per-request via `key(c)` so that callers can
 * scope by client IP, authenticated user id, route prefix, or any
 * composite. `limit` and `windowMs` follow the same semantics as
 * `takeRateLimitToken`: at most `limit` permits per `windowMs` rolling
 * window before the bucket starts rejecting requests with HTTP 429.
 */
export interface RateLimitMiddlewareOptions {
  /**
   * Resolves the bucket key from the request. Returning the same key for
   * two requests means they share a quota.
   */
  key: (c: Context) => string;
  /** Maximum number of permitted requests inside the window. */
  limit: number;
  /** Rolling window length in milliseconds. */
  windowMs: number;
  /**
   * Optional message override on rejection. Defaults to a generic French
   * message that matches the rest of the Aura error surface.
   */
  message?: string;
}

/**
 * `rateLimitMiddleware(options)` — Hono middleware factory that enforces
 * the in-memory proxy-level rate limit (see `takeRateLimitToken`).
 *
 * Resolves Requirements 8.2 and 8.3.
 *
 * Behaviour:
 *
 *   • On every request, derive the bucket key via `options.key(c)`.
 *   • Call `takeRateLimitToken(key, limit, windowMs)`.
 *   • If `allowed`, decorate the response with `X-RateLimit-*` headers
 *     and call `next()`.
 *   • If denied, short-circuit with HTTP 429 and an `AuraEnvelope` error
 *     of code `RATE_LIMITED` (matching the legacy proxy behaviour from
 *     `tmp/legacy-aura-nextjs/src/proxy.ts`).
 *
 * The middleware is intentionally *not* mounted globally by this module
 * — it is exported as a factory so that the auth subsystem (and other
 * future consumers) can wire it onto specific routes with the right
 * key-derivation strategy. Wiring is performed in follow-up tasks (e.g.
 * the auth migration in Phase 6).
 *
 * Example (NOT used in this task — for documentation only):
 *
 *   ```ts
 *   const ipLimiter = rateLimitMiddleware({
 *     key: (c) => `bridge:${c.req.header("x-forwarded-for") ?? "anon"}`,
 *     limit: 60,
 *     windowMs: 60_000,
 *   });
 *   app.use("/aura/*", ipLimiter);
 *   ```
 */
export function rateLimitMiddleware(
  options: RateLimitMiddlewareOptions,
): MiddlewareHandler {
  const { limit, windowMs, message } = options;

  return async function rateLimit(c, next) {
    const bucketKey = options.key(c);
    const result = takeRateLimitToken(bucketKey, limit, windowMs);

    // Always advertise the limit and reset window so well-behaved clients
    // can self-throttle. `resetAt` is a Unix epoch in milliseconds; we
    // expose it in seconds as is conventional for `X-RateLimit-Reset`.
    const resetAtSeconds = Math.ceil(result.resetAt / 1000);
    c.res.headers.set("x-ratelimit-limit", String(limit));
    c.res.headers.set(
      "x-ratelimit-remaining",
      String(Math.max(0, result.remaining)),
    );
    c.res.headers.set("x-ratelimit-reset", String(resetAtSeconds));

    if (result.allowed) {
      await next();
      return;
    }

    // ── Denied — return AuraEnvelope error with code RATE_LIMITED ────────
    const requestId = uuidv4();
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.resetAt - Date.now()) / 1000),
    );
    c.res.headers.set("retry-after", String(retryAfterSeconds));

    const error = new AuraError(
      "RATE_LIMITED",
      message ?? "Trop de requêtes. Réessayez plus tard.",
      { status: 429 },
    );
    return c.json(errorEnvelope({ error, requestId }), 429);
  };
}
