/**
 * Unit tests for the Aura Bridge router (`/aura/*`).
 *
 * Validates Requirements 1.1 – 1.7.
 *
 * These tests drive the Hono router directly via `app.request(...)` — no
 * network hop. `runAuraOperation` and `getClientOperationManifest` are
 * mocked so the tests stay deterministic and don't need a DB connection.
 *
 * The bridge router applies CSRF middleware to every request (Task 2.1);
 * each POST test attaches a freshly minted CSRF token via the cookie +
 * header pair so we can focus on bridge behavior. Dedicated CSRF tests
 * live in `middleware/csrf.test.ts` (Task 2.3).
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { Hono } from "hono";
import { auraBridgeRouter } from "./bridge";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../runner", () => ({
  runAuraOperation: vi.fn(),
}));

vi.mock("../registry", () => ({
  getClientOperationManifest: vi.fn(),
}));

import { runAuraOperation } from "../runner";
import { getClientOperationManifest } from "../registry";
import { createCsrfToken } from "../transport/csrf";
import { csrfCookieName } from "../transport/cookies";

const mockRunAuraOperation = vi.mocked(runAuraOperation);
const mockGetManifest = vi.mocked(getClientOperationManifest);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let csrfToken: string;

function makeApp() {
  const app = new Hono();
  app.route("/aura", auraBridgeRouter());
  return app;
}

interface PostRequestOptions {
  body?: string;
  contentType?: string | null;
  csrf?: "valid" | "missing-cookie" | "missing-header" | "absent";
}

function makePostRequest(path: string, options: PostRequestOptions = {}): Request {
  const headers: Record<string, string> = {};
  if (options.contentType !== null) {
    headers["content-type"] = options.contentType ?? "application/json";
  }

  const csrfMode = options.csrf ?? "valid";
  if (csrfMode === "valid") {
    headers["cookie"] = `${csrfCookieName()}=${csrfToken}`;
    headers["x-aura-csrf"] = csrfToken;
  } else if (csrfMode === "missing-cookie") {
    headers["x-aura-csrf"] = csrfToken;
  } else if (csrfMode === "missing-header") {
    headers["cookie"] = `${csrfCookieName()}=${csrfToken}`;
  }
  // "absent" → no CSRF cookie or header at all

  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: options.body,
  });
}

function successResult(args: { data?: unknown; cookies?: unknown[] } = {}) {
  return {
    envelope: {
      ok: true as const,
      data: args.data ?? { ok: true },
      meta: {
        requestId: "req-test",
        bumps: [],
        invalidates: [],
        refresh: false,
      },
    },
    status: 200,
    cookies: (args.cookies ?? []) as never,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Use a fixed secret in tests so the CSRF middleware can validate the
  // tokens we generate. The fallback dev secret in `transport/csrf.ts`
  // also works, but pinning it makes the test self-documenting.
  process.env.AURA_CSRF_SECRET = "test-csrf-secret-for-bridge-tests";
  csrfToken = await createCsrfToken();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auraBridgeRouter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Requirement 1.6: GET /aura/_manifest returns 200 + manifest ─────────

  it("GET /aura/_manifest returns HTTP 200 with the manifest payload", async () => {
    const manifest = {
      operations: [
        {
          name: "catalog.list",
          type: "query" as const,
          access: "public" as const,
          entities: ["Product"],
        },
      ],
    };
    mockGetManifest.mockReturnValue(manifest);

    const app = makeApp();
    const res = await app.request("/aura/_manifest");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(manifest);
    expect(mockGetManifest).toHaveBeenCalledOnce();
  });

  // ── Requirement 1.7: GET /aura/* (other than _manifest) returns 405 ─────

  it("GET /aura/anything returns HTTP 405 METHOD_NOT_ALLOWED", async () => {
    const app = makeApp();
    const res = await app.request("/aura/some/path");

    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
    expect(body.error.status).toBe(405);
    expect(typeof body.error.requestId).toBe("string");
  });

  // ── Requirement 1.3: POST without `application/json` Content-Type → 400 ─

  it("POST without application/json Content-Type returns HTTP 400", async () => {
    const app = makeApp();
    const res = await app.request(
      makePostRequest("/aura/catalog.list", {
        contentType: "text/plain",
        body: "hello",
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.status).toBe(400);
    expect(mockRunAuraOperation).not.toHaveBeenCalled();
  });

  it("POST with no Content-Type header returns HTTP 400", async () => {
    const app = makeApp();
    const res = await app.request(
      makePostRequest("/aura/catalog.list", {
        contentType: null,
        body: "{}",
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(mockRunAuraOperation).not.toHaveBeenCalled();
  });

  // ── Requirement 1.4: POST with non-object body → 400 ────────────────────

  it("POST with array body returns HTTP 400", async () => {
    const app = makeApp();
    const res = await app.request(
      makePostRequest("/aura/catalog.list", {
        body: JSON.stringify([1, 2, 3]),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(mockRunAuraOperation).not.toHaveBeenCalled();
  });

  it("POST with primitive body (string) returns HTTP 400", async () => {
    const app = makeApp();
    const res = await app.request(
      makePostRequest("/aura/catalog.list", {
        body: JSON.stringify("just a string"),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(mockRunAuraOperation).not.toHaveBeenCalled();
  });

  it("POST with malformed JSON returns HTTP 400", async () => {
    const app = makeApp();
    const res = await app.request(
      makePostRequest("/aura/catalog.list", {
        body: "not-json{{{",
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(mockRunAuraOperation).not.toHaveBeenCalled();
  });

  // ── Requirements 1.1, 1.2, 1.5: happy path POST dispatches and returns ──

  it("POST with valid JSON body dispatches to runAuraOperation and returns its envelope", async () => {
    mockRunAuraOperation.mockResolvedValue(
      successResult({ data: { ok: true, value: 42 } }) as never,
    );

    const app = makeApp();
    const res = await app.request(
      makePostRequest("/aura/catalog.list", {
        body: JSON.stringify({ input: { page: 1 }, params: { sort: "asc" } }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ ok: true, value: 42 });

    // Dispatch was called with correct args
    expect(mockRunAuraOperation).toHaveBeenCalledOnce();
    const call = mockRunAuraOperation.mock.calls[0][0];
    expect(call.operationName).toBe("catalog.list");
    expect(call.input).toEqual({ page: 1 });
    expect(call.params).toEqual({ sort: "asc" });
    expect(call.source).toBe("bridge");
    expect(call.request).toBeInstanceOf(Request);
  });

  // ── Requirement 1.2: nested operation names (a/b/c → a.b.c) ─────────────

  it("POST resolves nested path segments into dot-joined operation names", async () => {
    mockRunAuraOperation.mockResolvedValue(successResult() as never);

    const app = makeApp();
    const res = await app.request(
      makePostRequest("/aura/foo/bar/baz", {
        body: JSON.stringify({}),
      }),
    );

    expect(res.status).toBe(200);
    expect(mockRunAuraOperation).toHaveBeenCalledOnce();
    const call = mockRunAuraOperation.mock.calls[0][0];
    expect(call.operationName).toBe("foo.bar.baz");
  });

  // ── Requirement 1.5: cookie mutations are serialized as Set-Cookie ─────

  it("POST serializes cookie mutations from runAuraOperation as Set-Cookie headers", async () => {
    mockRunAuraOperation.mockResolvedValue({
      envelope: {
        ok: true,
        data: { ok: true },
        meta: { requestId: "req", bumps: [], invalidates: [], refresh: false },
      },
      status: 200,
      cookies: [
        {
          name: "aura_session",
          value: "abc123",
          options: {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            maxAge: 3600,
          },
        },
        {
          name: "aura_csrf",
          value: "csrf-token",
          options: { sameSite: "lax", path: "/" },
        },
      ],
    } as never);

    const app = makeApp();
    const res = await app.request(
      makePostRequest("/aura/auth.login", {
        body: JSON.stringify({ input: { email: "x@y.z" } }),
      }),
    );

    expect(res.status).toBe(200);

    // Hono exposes multiple Set-Cookie via `getSetCookie()` on the headers.
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : (res.headers.get("set-cookie") ?? "").split(/, (?=[^;]+=)/);

    expect(setCookies.length).toBe(2);

    const sessionCookie = setCookies.find((c) =>
      c.startsWith("aura_session="),
    );
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("aura_session=abc123");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(sessionCookie).toContain("Path=/");
    expect(sessionCookie).toContain("Max-Age=3600");

    const csrfCookie = setCookies.find((c) => c.startsWith("aura_csrf="));
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).toContain("aura_csrf=csrf-token");
    expect(csrfCookie).toContain("Path=/");
    expect(csrfCookie).toContain("SameSite=Lax");
  });

  it("POST forwards the runner's status code on errors", async () => {
    mockRunAuraOperation.mockResolvedValue({
      envelope: {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Opération introuvable",
          status: 404,
          requestId: "req",
        },
      },
      status: 404,
      cookies: [],
    } as never);

    const app = makeApp();
    const res = await app.request(
      makePostRequest("/aura/missing.op", { body: JSON.stringify({}) }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
