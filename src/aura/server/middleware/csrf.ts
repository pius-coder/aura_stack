

import type { MiddlewareHandler } from "hono";
import { v4 as uuidv4 } from "uuid";

import { errorEnvelope } from "@/aura/core/envelope";
import { AuraError } from "@/aura/core/errors";
import { csrfCookieName, parseCookieHeader } from "@/aura/server/transport/cookies";
import {
  csrfHeaderName,
  isUnsafeMethod,
  verifyCsrfToken,
} from "@/aura/server/transport/csrf";

/**
 * `csrfMiddleware()` — Hono middleware enforcing CSRF protection on unsafe
 * HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`).
 *
 * Resolves Requirements 7.1 – 7.5.
 *
 * Contract:
 *
 *   • Safe methods (`GET`, `HEAD`, `OPTIONS`) pass through untouched
 *     (Requirement 7.3, by exclusion).
 *
 *   • For unsafe methods, the request must carry both:
 *       - the `aura_csrf` cookie (non-`HttpOnly`, set by the auth subsystem
 *         when a session is created — see `server/auth/session.ts`), and
 *       - the `x-aura-csrf` header (echoed by the client transport from the
 *         cookie value — see `client/transport.ts`).
 *
 *   • The two values must be equal AND verify against the HMAC signature
 *     embedded in the token (`${nonce}.${HMAC_SHA256(secret, nonce)}`),
 *     using the constant-time comparison provided by `verifyCsrfToken`
 *     (Requirements 7.1, 7.2).
 *
 *   • On any CSRF failure, the middleware short-circuits with HTTP 403 and
 *     a standard `AuraEnvelope` error of code `FORBIDDEN` (Requirement 7.4).
 *
 *   • In production (`NODE_ENV === "production"`), the middleware fails fast
 *     at server startup — i.e. when `csrfMiddleware()` is called from the
 *     bridge router factory — if neither `AURA_CSRF_SECRET` nor the
 *     `AURA_INTERNAL_SECRET` fallback is configured (Requirement 7.5).
 *
 * The token format and verification logic live in `transport/csrf.ts` and
 * are reused as-is — this middleware is only the HTTP plumbing.
 */
export function csrfMiddleware(): MiddlewareHandler {
  // Requirement 7.5 — fail fast at startup if the signing secret is missing
  // in production. We don't rely on `csrfSecret()` throwing lazily inside
  // `verifyCsrfToken`, because that would defer the failure to the first
  // request rather than catching it at boot.
  if (process.env.NODE_ENV === "production") {
    if (!process.env.AURA_CSRF_SECRET && !process.env.AURA_INTERNAL_SECRET) {
      throw new Error(
        "[aura] AURA_CSRF_SECRET (or AURA_INTERNAL_SECRET) is required in production.",
      );
    }
  }

  return async (c, next) => {
    // Safe methods (GET, HEAD, OPTIONS) are not subject to CSRF checks.
    if (!isUnsafeMethod(c.req.method)) {
      return next();
    }

    const cookies = parseCookieHeader(c.req.header("cookie") ?? null);
    const cookieToken = cookies.get(csrfCookieName());
    const headerToken = c.req.header(csrfHeaderName());

    const valid =
      Boolean(cookieToken) &&
      Boolean(headerToken) &&
      cookieToken === headerToken &&
      (await verifyCsrfToken(headerToken));

    if (!valid) {
      const requestId = uuidv4();
      const error = new AuraError(
        "FORBIDDEN",
        "Protection CSRF invalide.",
      );
      return c.json(errorEnvelope({ error, requestId }), 403);
    }

    return next();
  };
}
