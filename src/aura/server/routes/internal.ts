

import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { runAuraCron } from "../cron";

/**
 * `auraInternalRouter()` — Hono router for the Aura internal endpoint.
 *
 * Resolves Requirements 1.8, 1.9, 1.10.
 *
 * Accepts `POST /aura-internal/:path{.*}` (the path segment is ignored —
 * the legacy Next.js route used a catch-all `[[...aura]]` but the only
 * meaningful field is the JSON body's `jobName`).
 *
 * Security: the `x-aura-internal-secret` header is compared against
 * `AURA_INTERNAL_SECRET` using `timingSafeEqual` (constant-time, prevents
 * timing attacks — Decision 1 in design.md).
 *
 * Response shape on error: `AuraErrorEnvelope`
 *   `{ ok: false, error: { code, message, status, requestId } }`
 */
export function auraInternalRouter(): Hono {
  const router = new Hono();

  router.post("/:path{.*}", async (c) => {
    const requestId = uuidv4();

    // ── 1. Validate the internal secret ──────────────────────────────────
    if (!verifyInternalSecret(c.req.header("x-aura-internal-secret"))) {
      return c.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Secret interne invalide.",
            status: 403,
            requestId,
          },
        },
        403,
      );
    }

    // ── 2. Parse the request body ─────────────────────────────────────────
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(
        {
          ok: false,
          error: {
            code: "BAD_REQUEST",
            message: "Corps de requête JSON invalide.",
            status: 400,
            requestId,
          },
        },
        400,
      );
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      !("jobName" in payload) ||
      typeof (payload as Record<string, unknown>).jobName !== "string"
    ) {
      return c.json(
        {
          ok: false,
          error: {
            code: "BAD_REQUEST",
            message: "jobName requis.",
            status: 400,
            requestId,
          },
        },
        400,
      );
    }

    const { jobName } = payload as { jobName: string };

    // ── 3. Run the cron job ───────────────────────────────────────────────
    const result = await runAuraCron(jobName);

    return c.json(
      {
        ok: result.status === "succeeded",
        result,
      },
      result.status === "succeeded" ? 200 : 500,
    );
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Constant-time comparison of the provided header value against
 * `AURA_INTERNAL_SECRET`. Returns `false` if the env var is not set or if
 * the header is missing/mismatched.
 */
function verifyInternalSecret(headerValue: string | undefined): boolean {
  const secret = process.env.AURA_INTERNAL_SECRET;
  if (!secret || !headerValue) return false;

  try {
    const secretBuf = Buffer.from(secret, "utf8");
    const headerBuf = Buffer.from(headerValue, "utf8");

    // timingSafeEqual requires same-length buffers; length mismatch is itself
    // a safe early-return (no timing information leaks from the length check
    // because the length of the secret is not sensitive — it's a fixed env var).
    if (secretBuf.length !== headerBuf.length) return false;

    return timingSafeEqual(secretBuf, headerBuf);
  } catch {
    return false;
  }
}
