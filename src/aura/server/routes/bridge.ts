

import { Hono, type Context } from "hono";
import { errorEnvelope } from "@/aura/core/envelope";
import { AuraError } from "@/aura/core/errors";
import { csrfMiddleware } from "@/aura/server/middleware/csrf";
import { getClientOperationManifest } from "@/aura/server/registry";
import { runAuraOperation } from "@/aura/server/runner";
import type { AuraCookieMutation } from "@/aura/core/types";
import { csrfCookieName, parseCookieHeader, isSecureCookieEnvironment } from "@/aura/server/transport/cookies";
import { createCsrfToken, verifyCsrfToken } from "@/aura/server/transport/csrf";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a single `AuraCookieMutation` into a `Set-Cookie` header string.
 * Matches the semantics used by the legacy Next.js bridge route.
 */
function serializeCookie(mutation: AuraCookieMutation): string {
  const parts: string[] = [`${encodeURIComponent(mutation.name)}=${encodeURIComponent(mutation.value)}`];

  if (mutation.options.path !== undefined) {
    parts.push(`Path=${mutation.options.path}`);
  }

  if (mutation.options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (mutation.options.secure) {
    parts.push("Secure");
  }

  if (mutation.options.sameSite) {
    const sameSiteMap = { lax: "Lax", strict: "Strict", none: "None" } as const;
    parts.push(`SameSite=${sameSiteMap[mutation.options.sameSite]}`);
  }

  if (mutation.options.maxAge !== undefined) {
    parts.push(`Max-Age=${mutation.options.maxAge}`);
  }

  if (mutation.options.expires !== undefined) {
    parts.push(`Expires=${mutation.options.expires.toUTCString()}`);
  }

  return parts.join("; ");
}

/**
 * Apply cookie mutations from `runAuraOperation` onto the Hono response by
 * appending `Set-Cookie` headers. Hono supports multiple `Set-Cookie` headers
 * via `c.header("Set-Cookie", value, { append: true })`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyCookieMutations(c: Context<any, any, any>, cookies: AuraCookieMutation[]): void {
  for (const mutation of cookies) {
    c.header("Set-Cookie", serializeCookie(mutation), { append: true });
  }
}

/**
 * Build a minimal `AuraErrorEnvelope` JSON response without going through
 * `runAuraOperation` (used for pre-dispatch validation errors).
 */
function jsonError(args: {
  code: string;
  message: string;
  status: number;
  requestId?: string;
}) {
  const requestId = args.requestId ?? uuidv4();
  return {
    ok: false as const,
    error: {
      code: args.code,
      message: args.message,
      status: args.status,
      requestId,
    },
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * `auraBridgeRouter()` — standalone Hono router for the public Aura bridge.
 *
 * Mounted at `/aura` in `createAuraHonoApp()`.
 *
 * Routes:
 *   GET  /aura/_manifest  → `getClientOperationManifest()` (HTTP 200)
 *   POST /aura/:path{.+}  → dispatch through `runAuraOperation`
 *   GET  /aura/*          → HTTP 405 METHOD_NOT_ALLOWED
 *
 * Resolves Requirements 1.1 – 1.7.
 *
 * CSRF protection (Requirements 7.1 – 7.5) is enforced by `csrfMiddleware()`
 * mounted below — applied to every method on the router, but the middleware
 * itself short-circuits only on unsafe methods (`POST`, `PUT`, `PATCH`,
 * `DELETE`). Safe methods (`GET`, `HEAD`, `OPTIONS`) pass through.
 */
export function auraBridgeRouter(): Hono {
  const router = new Hono();

  // Requirements 7.1 – 7.5: CSRF guard. Mounted before any route so the
  // middleware sees every request hitting `/aura/**`. Internally the
  // middleware skips safe methods, so `GET /_manifest` is unaffected.
  router.use("/*", csrfMiddleware());

  // -------------------------------------------------------------------------
  // GET /aura/_manifest
  // Requirement 1.6: respond with HTTP 200 and `getClientOperationManifest()`.
  //
  // Side-effect: bootstrap a CSRF cookie if the request doesn't carry one
  // yet. The client always fetches the manifest before issuing any
  // operation, so this is the natural seam to install the token. The
  // cookie is non-HttpOnly so the client transport can echo it back as
  // the `x-aura-csrf` header on unsafe requests.
  // -------------------------------------------------------------------------
  router.get("/_manifest", async (c) => {
    const cookies = parseCookieHeader(c.req.header("cookie") ?? null);
    const existing = cookies.get(csrfCookieName());
    // Self-heal: reissue when missing OR when HMAC verification fails
    // (e.g. stale cookie from a previous dev run signed with a different
    // secret). Otherwise the user would be permanently stuck behind a
    // CSRF wall on every POST until they manually clear cookies.
    const needsReissue = !existing || !(await verifyCsrfToken(existing));
    if (needsReissue) {
      const token = await createCsrfToken();
      const cookie: AuraCookieMutation = {
        name: csrfCookieName(),
        value: token,
        options: {
          httpOnly: false,
          secure: isSecureCookieEnvironment(),
          sameSite: "lax",
          path: "/",
          // 30-day rolling lifetime — refreshed on every login.
          maxAge: 60 * 60 * 24 * 30,
        },
      };
      applyCookieMutations(c, [cookie]);
    }
    return c.json(getClientOperationManifest(), 200);
  });

  // -------------------------------------------------------------------------
  // POST /aura/:path{.+}
  // Requirements 1.1, 1.2, 1.3, 1.4, 1.5.
  // -------------------------------------------------------------------------
  router.post("/:path{.+}", async (c) => {
    // Requirement 1.3: validate Content-Type: application/json
    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return c.json(
        jsonError({
          code: "BAD_REQUEST",
          message: "Content-Type application/json requis.",
          status: 400,
        }),
        400,
      );
    }

    // Requirement 1.4: validate JSON body is an object (not array, not primitive)
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(
        jsonError({
          code: "BAD_REQUEST",
          message: "Payload JSON Aura invalide.",
          status: 400,
        }),
        400,
      );
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return c.json(
        jsonError({
          code: "BAD_REQUEST",
          message: "Payload JSON Aura invalide.",
          status: 400,
        }),
        400,
      );
    }

    // Requirement 1.2: resolve operation name by joining path segments with "."
    const rawPath = c.req.param("path");
    const operationName = rawPath.split("/").join(".");

    // Requirement 1.2: dispatch through `runAuraOperation`
    const body = payload as Record<string, unknown>;
    const result = await runAuraOperation({
      operationName,
      input: "input" in body ? body.input : undefined,
      params: "params" in body ? body.params : undefined,
      request: c.req.raw,
      source: "bridge",
    });

    // Requirement 1.5: serialize cookie mutations as Set-Cookie headers
    applyCookieMutations(c, result.cookies);

    return c.json(result.envelope, result.status as 200);
  });

  // -------------------------------------------------------------------------
  // GET /aura/* (anything other than /_manifest)
  // Requirement 1.7: respond with HTTP 405 METHOD_NOT_ALLOWED.
  // -------------------------------------------------------------------------
  router.get("/*", (c) => {
    const requestId = uuidv4();
    const error = new AuraError(
      "METHOD_NOT_ALLOWED",
      "Les opérations Aura passent par POST. GET est réservé au manifeste client.",
    );
    return c.json(
      errorEnvelope({ error, requestId }),
      405,
    );
  });

  return router;
}
