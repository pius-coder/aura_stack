/**
 * Unit tests for rate limiting middleware (`src/aura/server/middleware/rate-limit.ts`).
 *
 * Validates Requirements 8.1 – 8.4.
 *
 * Tests cover:
 *   - Token bucket behavior (allow within limit, deny over limit)
 *   - Window reset behavior
 *   - Rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After)
 *   - HTTP 429 response with RATE_LIMITED error code
 *   - Custom key derivation
 *   - Edge cases (exact limit boundary, concurrent requests)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import {
  rateLimitMiddleware,
  type RateLimitMiddlewareOptions,
} from "./rate-limit";
import {
  takeRateLimitToken,
  type RateLimitResult,
} from "../transport/rate-limit-proxy";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the rate limit proxy to control token bucket behavior in tests
vi.mock("../transport/rate-limit-proxy", () => ({
  takeRateLimitToken: vi.fn(),
}));

const mockTakeRateLimitToken = vi.mocked(takeRateLimitToken);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(options: Partial<RateLimitMiddlewareOptions> = {}) {
  const defaultOptions: RateLimitMiddlewareOptions = {
    key: (c) => c.req.header("x-client-id") ?? "anonymous",
    limit: 10,
    windowMs: 60_000,
    ...options,
  };

  const app = new Hono();
  app.use(rateLimitMiddleware(defaultOptions));
  app.all("/*", (c) => c.json({ ok: true, method: c.req.method }, 200));
  return app;
}

function mockAllowed(remaining: number, resetAt: number): RateLimitResult {
  return { allowed: true, remaining, resetAt };
}

function mockDenied(resetAt: number): RateLimitResult {
  return { allowed: false, remaining: 0, resetAt };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rateLimitMiddleware", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Requirement 8.2: Allow within limit ────────────────────────────────────

  describe("requests within limit", () => {
    it("allows request when bucket has tokens available", async () => {
      const resetAt = Date.now() + 60_000;
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(9, resetAt));

      const app = makeApp({ limit: 10 });
      const res = await app.request(
        new Request("http://localhost/test", {
          method: "GET",
          headers: { "x-client-id": "client-1" },
        })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("passes through to next middleware when allowed", async () => {
      const resetAt = Date.now() + 60_000;
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(5, resetAt));

      const app = makeApp();
      const res = await app.request(
        new Request("http://localhost/test", {
          method: "POST",
          headers: { "x-client-id": "client-1" },
        })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });

  // ── Requirement 8.3: HTTP 429 when over limit ──────────────────────────────

  describe("requests over limit", () => {
    it("returns HTTP 429 when bucket is exhausted", async () => {
      const resetAt = Date.now() + 30_000;
      mockTakeRateLimitToken.mockReturnValue(mockDenied(resetAt));

      const app = makeApp({ limit: 10 });
      const res = await app.request(
        new Request("http://localhost/test", {
          method: "GET",
          headers: { "x-client-id": "client-1" },
        })
      );

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(body.error.status).toBe(429);
      expect(body.error.message).toContain("Réessayez");
      expect(typeof body.error.requestId).toBe("string");
    });

    it("includes custom message when provided", async () => {
      const resetAt = Date.now() + 30_000;
      mockTakeRateLimitToken.mockReturnValue(mockDenied(resetAt));

      const app = makeApp({
        limit: 10,
        message: "Custom rate limit message",
      });
      const res = await app.request(
        new Request("http://localhost/test", {
          method: "GET",
          headers: { "x-client-id": "client-1" },
        })
      );

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error.message).toBe("Custom rate limit message");
    });

    it("does not call next middleware when denied", async () => {
      const resetAt = Date.now() + 30_000;
      mockTakeRateLimitToken.mockReturnValue(mockDenied(resetAt));

      const handler = vi.fn().mockReturnValue(new Response("ok"));

      const app = new Hono();
      app.use(
        rateLimitMiddleware({
          key: () => "test-key",
          limit: 5,
          windowMs: 60_000,
        })
      );
      app.get("/test", handler);

      await app.request(
        new Request("http://localhost/test", { method: "GET" })
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── Rate limit headers ────────────────────────────────────────────────────

  describe("rate limit headers", () => {
    it("sets X-RateLimit-Limit header", async () => {
      const resetAt = Date.now() + 60_000;
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(9, resetAt));

      const app = makeApp({ limit: 25 });
      const res = await app.request(
        new Request("http://localhost/test", { method: "GET" })
      );

      expect(res.headers.get("x-ratelimit-limit")).toBe("25");
    });

    it("sets X-RateLimit-Remaining header", async () => {
      const resetAt = Date.now() + 60_000;
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(7, resetAt));

      const app = makeApp({ limit: 10 });
      const res = await app.request(
        new Request("http://localhost/test", { method: "GET" })
      );

      expect(res.headers.get("x-ratelimit-remaining")).toBe("7");
    });

    it("sets X-RateLimit-Remaining to 0 when bucket exhausted", async () => {
      const resetAt = Date.now() + 30_000;
      mockTakeRateLimitToken.mockReturnValue(mockDenied(resetAt));

      const app = makeApp({ limit: 10 });
      const res = await app.request(
        new Request("http://localhost/test", { method: "GET" })
      );

      expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
    });

    it("sets X-RateLimit-Reset header in seconds", async () => {
      const resetAtMs = Date.now() + 90_000; // 90 seconds from now
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(5, resetAtMs));

      const app = makeApp();
      const res = await app.request(
        new Request("http://localhost/test", { method: "GET" })
      );

      const resetHeader = res.headers.get("x-ratelimit-reset");
      expect(resetHeader).toBeDefined();
      // The header is the absolute timestamp in seconds (epoch)
      const resetSeconds = parseInt(resetHeader!, 10);
      // Verify it's a valid Unix timestamp in the future
      const nowSeconds = Math.ceil(Date.now() / 1000);
      expect(resetSeconds).toBeGreaterThan(nowSeconds + 85);
      expect(resetSeconds).toBeLessThanOrEqual(nowSeconds + 95);
    });

    it("sets Retry-After header when denied", async () => {
      const resetAt = Date.now() + 45_000; // 45 seconds from now
      mockTakeRateLimitToken.mockReturnValue(mockDenied(resetAt));

      const app = makeApp();
      const res = await app.request(
        new Request("http://localhost/test", { method: "GET" })
      );

      const retryAfter = res.headers.get("retry-after");
      expect(retryAfter).toBeDefined();
      const retrySeconds = parseInt(retryAfter!, 10);
      expect(retrySeconds).toBeGreaterThan(0);
      expect(retrySeconds).toBeLessThanOrEqual(46);
    });

    it("ensures Retry-After is at least 1 second", async () => {
      const resetAt = Date.now() + 500; // Very close to now
      mockTakeRateLimitToken.mockReturnValue(mockDenied(resetAt));

      const app = makeApp();
      const res = await app.request(
        new Request("http://localhost/test", { method: "GET" })
      );

      const retryAfter = res.headers.get("retry-after");
      expect(parseInt(retryAfter!, 10)).toBeGreaterThanOrEqual(1);
    });

    it("sets headers on both allowed and denied responses", async () => {
      const resetAtAllowed = Date.now() + 60_000;
      const resetAtDenied = Date.now() + 30_000;

      mockTakeRateLimitToken.mockReturnValueOnce(mockAllowed(5, resetAtAllowed));
      mockTakeRateLimitToken.mockReturnValueOnce(mockDenied(resetAtDenied));

      const app = makeApp({ limit: 10 });

      // First request allowed
      const res1 = await app.request(
        new Request("http://localhost/test", { method: "GET" })
      );
      expect(res1.headers.get("x-ratelimit-limit")).toBe("10");
      expect(res1.headers.get("x-ratelimit-remaining")).toBe("5");

      // Second request denied
      const res2 = await app.request(
        new Request("http://localhost/test", { method: "GET" })
      );
      expect(res2.headers.get("x-ratelimit-limit")).toBe("10");
      expect(res2.headers.get("x-ratelimit-remaining")).toBe("0");
      expect(res2.headers.get("retry-after")).toBeDefined();
    });
  });

  // ── Custom key derivation ─────────────────────────────────────────────────

  describe("custom key derivation", () => {
    it("uses custom key function for bucket key", async () => {
      const resetAt = Date.now() + 60_000;
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(9, resetAt));

      const keyFn = vi.fn().mockReturnValue("user-123");
      const app = makeApp({ key: keyFn });

      await app.request(
        new Request("http://localhost/test", {
          method: "GET",
          headers: { "x-user-id": "user-123" },
        })
      );

      expect(keyFn).toHaveBeenCalled();
      // Verify takeRateLimitToken was called with the derived key
      expect(mockTakeRateLimitToken).toHaveBeenCalledWith(
        "user-123",
        expect.any(Number),
        expect.any(Number)
      );
    });

    it("scopes rate limits by different keys", async () => {
      const resetAt = Date.now() + 60_000;
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(5, resetAt));

      const app = makeApp({
        key: (c) => c.req.header("x-client-id") ?? "anonymous",
      });

      // Request from client-1
      await app.request(
        new Request("http://localhost/test", {
          method: "GET",
          headers: { "x-client-id": "client-1" },
        })
      );

      // Request from client-2
      await app.request(
        new Request("http://localhost/test", {
          method: "GET",
          headers: { "x-client-id": "client-2" },
        })
      );

      // Each client should get their own bucket (called with different keys)
      expect(mockTakeRateLimitToken).toHaveBeenCalledTimes(2);
      expect(mockTakeRateLimitToken).toHaveBeenNthCalledWith(
        1,
        "client-1",
        expect.any(Number),
        expect.any(Number)
      );
      expect(mockTakeRateLimitToken).toHaveBeenNthCalledWith(
        2,
        "client-2",
        expect.any(Number),
        expect.any(Number)
      );
    });

    it("supports IP-based key derivation", async () => {
      const resetAt = Date.now() + 60_000;
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(5, resetAt));

      const app = makeApp({
        key: (c) => c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      });

      await app.request(
        new Request("http://localhost/test", {
          method: "GET",
          headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1" },
        })
      );

      expect(mockTakeRateLimitToken).toHaveBeenCalledWith(
        "192.168.1.1",
        expect.any(Number),
        expect.any(Number)
      );
    });

    it("supports composite keys", async () => {
      const resetAt = Date.now() + 60_000;
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(5, resetAt));

      const app = makeApp({
        key: (c) => {
          const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
          const route = c.req.path;
          return `${ip}:${route}`;
        },
        limit: 5,
      });

      await app.request(
        new Request("http://localhost/api/bridge", {
          method: "POST",
          headers: { "x-forwarded-for": "192.168.1.1" },
        })
      );

      expect(mockTakeRateLimitToken).toHaveBeenCalledWith(
        "192.168.1.1:/api/bridge",
        5,
        expect.any(Number)
      );
    });
  });

  // ── Configuration options ─────────────────────────────────────────────────

  describe("configuration options", () => {
    it("passes limit to takeRateLimitToken", async () => {
      const resetAt = Date.now() + 60_000;
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(99, resetAt));

      const app = makeApp({ limit: 100 });

      await app.request(new Request("http://localhost/test", { method: "GET" }));

      expect(mockTakeRateLimitToken).toHaveBeenCalledWith(
        expect.any(String),
        100,
        expect.any(Number)
      );
    });

    it("passes windowMs to takeRateLimitToken", async () => {
      const resetAt = Date.now() + 120_000;
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(5, resetAt));

      const app = makeApp({ windowMs: 120_000 }); // 2 minutes

      await app.request(new Request("http://localhost/test", { method: "GET" }));

      expect(mockTakeRateLimitToken).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        120_000
      );
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles remaining going negative (clamped to 0)", async () => {
      const resetAt = Date.now() + 60_000;
      // Simulate the proxy returning negative remaining (edge case)
      mockTakeRateLimitToken.mockReturnValue({ allowed: true, remaining: -1, resetAt });

      const app = makeApp();
      const res = await app.request(
        new Request("http://localhost/test", { method: "GET" })
      );

      // Remaining should be clamped to 0
      expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
    });

    it("handles concurrent requests to same bucket", async () => {
      const resetAt = Date.now() + 60_000;
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(5, resetAt));

      const app = makeApp({ key: () => "shared-key" });

      // Make 3 concurrent requests
      const requests = await Promise.all([
        app.request(new Request("http://localhost/test", { method: "GET" })),
        app.request(new Request("http://localhost/test", { method: "GET" })),
        app.request(new Request("http://localhost/test", { method: "GET" })),
      ]);

      // All should succeed (mock always allows)
      expect(requests.every((r) => r.status === 200)).toBe(true);
      expect(mockTakeRateLimitToken).toHaveBeenCalledTimes(3);
    });

    it("handles request with no custom headers", async () => {
      const resetAt = Date.now() + 60_000;
      mockTakeRateLimitToken.mockReturnValue(mockAllowed(5, resetAt));

      const app = makeApp(); // Uses "anonymous" as default key

      const res = await app.request(
        new Request("http://localhost/test", { method: "GET" })
      );

      expect(res.status).toBe(200);
      expect(mockTakeRateLimitToken).toHaveBeenCalledWith(
        "anonymous",
        expect.any(Number),
        expect.any(Number)
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Unit tests for the takeRateLimitToken function (re-exported from proxy)
// These tests verify the actual bucket logic, not just the middleware
// ---------------------------------------------------------------------------

describe("takeRateLimitToken (in-memory bucket)", () => {
  // Use vi.importActual at the top level with proper typing
  // Note: We skip these tests when mocked because the mock takes precedence
  // These are integration tests that should be run separately or after unmocking

  it("allows first request in new bucket", async () => {
    // Re-import the actual module for this test
    vi.doUnmock("../transport/rate-limit-proxy");
    const { takeRateLimitToken: realImpl } = await import(
      "../transport/rate-limit-proxy"
    );

    const key = `test-bucket-${Date.now()}-${Math.random()}`;
    const result = realImpl(key, 10, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  it("denies request after limit reached", async () => {
    vi.doUnmock("../transport/rate-limit-proxy");
    const { takeRateLimitToken: realImpl } = await import(
      "../transport/rate-limit-proxy"
    );

    const key = `test-bucket-exhaust-${Date.now()}-${Math.random()}`;
    const limit = 3;

    // Use up all tokens
    realImpl(key, limit, 60_000);
    realImpl(key, limit, 60_000);
    realImpl(key, limit, 60_000);

    // Next request should be denied
    const result = realImpl(key, limit, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets bucket after window expires", async () => {
    vi.doUnmock("../transport/rate-limit-proxy");
    const { takeRateLimitToken: realImpl } = await import(
      "../transport/rate-limit-proxy"
    );

    const key = `test-bucket-reset-${Date.now()}-${Math.random()}`;
    const windowMs = 100; // Very short window for testing

    // Use up all tokens
    realImpl(key, 2, windowMs);
    realImpl(key, 2, windowMs);

    // Should be denied immediately
    const denied = realImpl(key, 2, windowMs);
    expect(denied.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should be allowed again with new bucket
    const allowed = realImpl(key, 2, windowMs);
    expect(allowed.allowed).toBe(true);
    expect(allowed.remaining).toBe(1);
  });
});
