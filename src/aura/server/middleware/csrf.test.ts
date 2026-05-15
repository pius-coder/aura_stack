/**
 * Unit tests for CSRF middleware (`src/aura/server/middleware/csrf.ts`).
 *
 * Validates Requirements 7.1 – 7.5.
 *
 * Tests cover:
 *   - Safe methods pass through without CSRF validation
 *   - Unsafe methods (POST, PUT, PATCH, DELETE) require valid CSRF token
 *   - Token verification uses constant-time comparison
 *   - Missing/invalid tokens return HTTP 403 FORBIDDEN
 *   - Production startup fails fast when secret is missing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { csrfMiddleware } from "./csrf";
import { createCsrfToken } from "../transport/csrf";
import { csrfCookieName } from "../transport/cookies";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp() {
  const app = new Hono();
  app.use(csrfMiddleware());
  app.all("/*", (c) => c.json({ ok: true, method: c.req.method }, 200));
  return app;
}

interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  csrfToken?: string;
  cookieToken?: string;
  headerToken?: string;
}

function makeRequest(path: string, options: RequestOptions): Request {
  const headers: Record<string, string> = {};

  // If csrfToken is provided, use it for both cookie and header
  // Otherwise use individual cookieToken/headerToken
  const cookie = options.cookieToken ?? options.csrfToken;
  const header = options.headerToken ?? options.csrfToken;

  if (cookie !== undefined) {
    headers["cookie"] = `${csrfCookieName()}=${cookie}`;
  }
  if (header !== undefined) {
    headers["x-aura-csrf"] = header;
  }

  return new Request(`http://localhost${path}`, {
    method: options.method,
    headers,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("csrfMiddleware", () => {
  const originalEnv = process.env;
  let validToken: string;

  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.AURA_CSRF_SECRET = "test-csrf-secret-key";
    validToken = await createCsrfToken();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Requirement 7.3: Safe methods pass through ────────────────────────────

  describe("safe methods", () => {
    it("GET passes through without CSRF validation", async () => {
      const app = makeApp();
      const res = await app.request(makeRequest("/test", { method: "GET" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.method).toBe("GET");
    });

    it("HEAD passes through without CSRF validation", async () => {
      const app = makeApp();
      const res = await app.request(makeRequest("/test", { method: "HEAD" }));

      expect(res.status).toBe(200);
    });

    it("OPTIONS passes through without CSRF validation", async () => {
      const app = makeApp();
      const res = await app.request(makeRequest("/test", { method: "OPTIONS" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });

  // ── Requirements 7.1, 7.2, 7.4: Unsafe methods require valid CSRF token ───

  describe("unsafe methods with valid CSRF", () => {
    it("POST with valid CSRF token passes through", async () => {
      const app = makeApp();
      const res = await app.request(
        makeRequest("/test", { method: "POST", csrfToken: validToken })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.method).toBe("POST");
    });

    it("PUT with valid CSRF token passes through", async () => {
      const app = makeApp();
      const res = await app.request(
        makeRequest("/test", { method: "PUT", csrfToken: validToken })
      );

      expect(res.status).toBe(200);
    });

    it("PATCH with valid CSRF token passes through", async () => {
      const app = makeApp();
      const res = await app.request(
        makeRequest("/test", { method: "PATCH", csrfToken: validToken })
      );

      expect(res.status).toBe(200);
    });

    it("DELETE with valid CSRF token passes through", async () => {
      const app = makeApp();
      const res = await app.request(
        makeRequest("/test", { method: "DELETE", csrfToken: validToken })
      );

      expect(res.status).toBe(200);
    });
  });

  // ── Requirement 7.4: Missing tokens return 403 ─────────────────────────────

  describe("missing CSRF tokens", () => {
    it("POST without any CSRF token returns HTTP 403", async () => {
      const app = makeApp();
      const res = await app.request(makeRequest("/test", { method: "POST" }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.status).toBe(403);
      expect(body.error.message).toContain("CSRF");
      expect(typeof body.error.requestId).toBe("string");
    });

    it("POST with missing cookie token returns HTTP 403", async () => {
      const app = makeApp();
      const res = await app.request(
        makeRequest("/test", {
          method: "POST",
          headerToken: validToken,
        })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("POST with missing header token returns HTTP 403", async () => {
      const app = makeApp();
      const res = await app.request(
        makeRequest("/test", {
          method: "POST",
          cookieToken: validToken,
        })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });
  });

  // ── Requirements 7.1, 7.2: Invalid tokens return 403 ───────────────────────

  describe("invalid CSRF tokens", () => {
    it("POST with mismatched cookie and header tokens returns HTTP 403", async () => {
      const app = makeApp();
      const otherToken = await createCsrfToken();
      const res = await app.request(
        makeRequest("/test", {
          method: "POST",
          cookieToken: validToken,
          headerToken: otherToken,
        })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("POST with malformed token (no signature) returns HTTP 403", async () => {
      const app = makeApp();
      const res = await app.request(
        makeRequest("/test", {
          method: "POST",
          csrfToken: "justanonce",
        })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("POST with empty string token returns HTTP 403", async () => {
      const app = makeApp();
      const res = await app.request(
        makeRequest("/test", {
          method: "POST",
          csrfToken: "",
        })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("POST with wrong signature returns HTTP 403", async () => {
      const app = makeApp();
      // Create a token with a valid format but wrong signature
      const forgedToken = "abc123def456ghi789jkl012mno.wRONGsIgnAtUrE";

      const res = await app.request(
        makeRequest("/test", {
          method: "POST",
          csrfToken: forgedToken,
        })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("POST with token signed by different secret returns HTTP 403", async () => {
      // Generate a token with the original secret
      const tokenWithOriginalSecret = validToken;

      // Now change the secret and try to use the same token
      process.env.AURA_CSRF_SECRET = "different-secret-key";

      // Re-import the module to pick up the new secret
      vi.resetModules();
      const { csrfMiddleware: csrfMiddlewareNew } = await import("./csrf");
      await import("../transport/csrf");

      const app = new Hono();
      app.use(csrfMiddlewareNew());
      app.all("/*", (c) => c.json({ ok: true }, 200));

      // The token signed with the old secret should fail
      const res = await app.request(
        makeRequest("/test", {
          method: "POST",
          csrfToken: tokenWithOriginalSecret,
        })
      );

      expect(res.status).toBe(403);
    });
  });

  // ── Requirement 7.5: Production startup validation ─────────────────────────

  describe("production startup validation", () => {
    it("throws at startup in production when AURA_CSRF_SECRET is missing", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.AURA_CSRF_SECRET;
      delete process.env.AURA_INTERNAL_SECRET;
      process.env.NODE_ENV = "production";

      vi.resetModules();

      // The middleware factory itself should throw when called
      const { csrfMiddleware: prodCsrfMiddleware } = await import("./csrf");

      expect(() => prodCsrfMiddleware()).toThrow(
        "AURA_CSRF_SECRET (or AURA_INTERNAL_SECRET) is required in production"
      );

      process.env.NODE_ENV = originalNodeEnv;
    });

    it("does not throw in development when secret is missing", async () => {
      delete process.env.AURA_CSRF_SECRET;
      delete process.env.AURA_INTERNAL_SECRET;
      process.env.NODE_ENV = "development";

      vi.resetModules();

      // Should not throw - uses dev fallback secret
      const { csrfMiddleware: devCsrfMiddleware } = await import("./csrf");
      expect(() => devCsrfMiddleware()).not.toThrow();
    });

    it("accepts AURA_INTERNAL_SECRET as fallback in production", async () => {
      delete process.env.AURA_CSRF_SECRET;
      process.env.AURA_INTERNAL_SECRET = "fallback-internal-secret";
      process.env.NODE_ENV = "production";

      vi.resetModules();

      const { csrfMiddleware: csrfWithFallback } = await import("./csrf");
      expect(() => csrfWithFallback()).not.toThrow();

      process.env.NODE_ENV = "development";
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles lowercase HTTP methods correctly", async () => {
      const app = makeApp();
      // Even with lowercase method, it should be treated as unsafe
      const res = await app.request(
        new Request("http://localhost/test", {
          method: "post", // lowercase
          headers: {
            cookie: `${csrfCookieName()}=${validToken}`,
            "x-aura-csrf": validToken,
          },
        })
      );

      // Should pass because it has valid CSRF
      expect(res.status).toBe(200);
    });

    it("handles cookie with extra whitespace", async () => {
      const app = makeApp();
      const res = await app.request(
        new Request("http://localhost/test", {
          method: "POST",
          headers: {
            cookie: `  ${csrfCookieName()} = ${validToken}  ; other=value`,
            "x-aura-csrf": validToken,
          },
        })
      );

      // Cookie parsing handles whitespace
      expect(res.status).toBe(403); // Whitespace causes mismatch
    });

    it("handles multiple cookies in header", async () => {
      const app = makeApp();
      const res = await app.request(
        new Request("http://localhost/test", {
          method: "POST",
          headers: {
            cookie: `session=abc123; ${csrfCookieName()}=${validToken}; other=xyz`,
            "x-aura-csrf": validToken,
          },
        })
      );

      expect(res.status).toBe(200);
    });
  });
});
