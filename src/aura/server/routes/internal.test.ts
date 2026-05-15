/**
 * Unit tests for the Aura Internal router (`/aura-internal/*`).
 *
 * Validates Requirements 1.8, 1.9, 1.10.
 *
 * These tests drive the Hono router directly via `app.request(...)` — no
 * network hop, no DB connection required for the secret-validation path.
 * The `runAuraCron` function is mocked so the tests remain fast and
 * deterministic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { auraInternalRouter } from "./internal";

// ---------------------------------------------------------------------------
// Mock runAuraCron so tests don't need a real DB
// ---------------------------------------------------------------------------
vi.mock("../cron", () => ({
  runAuraCron: vi.fn(),
}));

import { runAuraCron } from "../cron";
const mockRunAuraCron = vi.mocked(runAuraCron);

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------
function makeApp() {
  const app = new Hono();
  app.route("/aura-internal", auraInternalRouter());
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_SECRET = "test-internal-secret-abc123";

function makeRequest(
  path: string,
  options: {
    secret?: string;
    body?: unknown;
  } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.secret !== undefined) {
    headers["x-aura-internal-secret"] = options.secret;
  }

  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auraInternalRouter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.AURA_INTERNAL_SECRET = VALID_SECRET;
  });

  // ── Requirement 1.9: 403 on missing/mismatched secret ──────────────────

  it("returns 403 FORBIDDEN when x-aura-internal-secret header is missing", async () => {
    const app = makeApp();
    const res = await app.request(
      makeRequest("/aura-internal/run", { body: { jobName: "test.job" } }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.status).toBe(403);
    expect(typeof body.error.requestId).toBe("string");
  });

  it("returns 403 FORBIDDEN when x-aura-internal-secret header is wrong", async () => {
    const app = makeApp();
    const res = await app.request(
      makeRequest("/aura-internal/run", {
        secret: "wrong-secret",
        body: { jobName: "test.job" },
      }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 403 FORBIDDEN when AURA_INTERNAL_SECRET env var is not set", async () => {
    delete process.env.AURA_INTERNAL_SECRET;
    const app = makeApp();
    const res = await app.request(
      makeRequest("/aura-internal/run", {
        secret: VALID_SECRET,
        body: { jobName: "test.job" },
      }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  // ── Requirement 1.8: route accepts POST /aura-internal/:path{.*} ────────

  it("accepts requests at any sub-path (catch-all)", async () => {
    mockRunAuraCron.mockResolvedValue({
      status: "succeeded",
      startedAt: new Date(),
      finishedAt: new Date(),
    });

    const app = makeApp();
    const res = await app.request(
      makeRequest("/aura-internal/some/nested/path", {
        secret: VALID_SECRET,
        body: { jobName: "test.job" },
      }),
    );

    expect(res.status).toBe(200);
  });

  // ── Requirement 1.10: 200 on succeeded, 500 on failed ──────────────────

  it("returns 200 and ok:true when runAuraCron succeeds", async () => {
    const startedAt = new Date("2025-01-01T00:00:00Z");
    const finishedAt = new Date("2025-01-01T00:00:01Z");
    mockRunAuraCron.mockResolvedValue({
      status: "succeeded",
      startedAt,
      finishedAt,
    });

    const app = makeApp();
    const res = await app.request(
      makeRequest("/aura-internal/run", {
        secret: VALID_SECRET,
        body: { jobName: "my.cron.job" },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.status).toBe("succeeded");
    expect(mockRunAuraCron).toHaveBeenCalledWith("my.cron.job");
  });

  it("returns 500 and ok:false when runAuraCron fails", async () => {
    const startedAt = new Date("2025-01-01T00:00:00Z");
    const finishedAt = new Date("2025-01-01T00:00:01Z");
    mockRunAuraCron.mockResolvedValue({
      status: "failed",
      error: "Job exploded",
      startedAt,
      finishedAt,
    });

    const app = makeApp();
    const res = await app.request(
      makeRequest("/aura-internal/run", {
        secret: VALID_SECRET,
        body: { jobName: "failing.job" },
      }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.result.status).toBe("failed");
    expect(body.result.error).toBe("Job exploded");
    expect(mockRunAuraCron).toHaveBeenCalledWith("failing.job");
  });

  // ── Body validation ─────────────────────────────────────────────────────

  it("returns 400 BAD_REQUEST when body is missing jobName", async () => {
    const app = makeApp();
    const res = await app.request(
      makeRequest("/aura-internal/run", {
        secret: VALID_SECRET,
        body: { notJobName: "oops" },
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("returns 400 BAD_REQUEST when body is not an object", async () => {
    const app = makeApp();
    const res = await app.request(
      new Request("http://localhost/aura-internal/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-aura-internal-secret": VALID_SECRET,
        },
        body: JSON.stringify("just a string"),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("returns 400 BAD_REQUEST when body is invalid JSON", async () => {
    const app = makeApp();
    const res = await app.request(
      new Request("http://localhost/aura-internal/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-aura-internal-secret": VALID_SECRET,
        },
        body: "not-json{{{",
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  // ── Timing-safe comparison ──────────────────────────────────────────────

  it("rejects a secret that is a prefix of the real secret", async () => {
    const app = makeApp();
    const res = await app.request(
      makeRequest("/aura-internal/run", {
        // Shorter than VALID_SECRET — length mismatch should reject
        secret: VALID_SECRET.slice(0, -1),
        body: { jobName: "test.job" },
      }),
    );

    expect(res.status).toBe(403);
  });

  it("rejects a secret that is a superset of the real secret", async () => {
    const app = makeApp();
    const res = await app.request(
      makeRequest("/aura-internal/run", {
        // Longer than VALID_SECRET — length mismatch should reject
        secret: VALID_SECRET + "x",
        body: { jobName: "test.job" },
      }),
    );

    expect(res.status).toBe(403);
  });
});
