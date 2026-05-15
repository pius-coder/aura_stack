/**
 * Unit tests for the Aura Health router (`/health`).
 *
 * Validates Requirement 1.12.
 *
 * The Prisma client is mocked so the tests don't require a live DB. The
 * mock simulates two scenarios:
 *
 *   1. `db.$queryRaw` resolves → HTTP 200 + services.database.status = "ok"
 *   2. `db.$queryRaw` rejects  → HTTP 503 + services.database.status = "error"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mock the shared Prisma client. The factory creates a fresh `vi.fn()` so
// each test can override the implementation without sharing state.
// ---------------------------------------------------------------------------
vi.mock("../db", () => ({
  db: {
    $queryRaw: vi.fn(),
  },
}));

import { auraHealthRouter } from "./health";
import { db } from "../db";

const mockQueryRaw = vi.mocked(db.$queryRaw);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp() {
  const app = new Hono();
  app.route("/health", auraHealthRouter());
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auraHealthRouter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Requirement 1.12: 200 + ok body when DB ping succeeds ──────────────

  it("returns HTTP 200 with services.database.status === 'ok' when ping succeeds", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const app = makeApp();
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.services.database.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.timestamp).toBe("string");
    expect(typeof body.latencyMs).toBe("number");
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof body.services.database.latencyMs).toBe("number");
    expect(body.services.database.latencyMs).toBeGreaterThanOrEqual(0);

    expect(mockQueryRaw).toHaveBeenCalledOnce();
  });

  // ── Requirement 1.12: 503 + error body when DB ping fails ──────────────

  it("returns HTTP 503 with services.database.status === 'error' when ping throws", async () => {
    mockQueryRaw.mockRejectedValue(new Error("connection refused"));

    const app = makeApp();
    const res = await app.request("/health");

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.services.database.status).toBe("error");
    expect(typeof body.latencyMs).toBe("number");
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("includes a non-negative latencyMs even when the ping fails", async () => {
    mockQueryRaw.mockRejectedValue(new Error("timeout"));

    const app = makeApp();
    const res = await app.request("/health");

    const body = await res.json();
    expect(body.services.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(body.services.database.latencyMs)).toBe(true);
  });

  it("returns a valid ISO 8601 timestamp", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const app = makeApp();
    const res = await app.request("/health");

    const body = await res.json();
    // `new Date(iso).toISOString() === iso` → valid ISO string round-trips
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
