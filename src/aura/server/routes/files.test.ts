/**
 * Unit tests for the Aura Files router (`/files/*`).
 *
 * Validates Requirements 1.11, 9.3, 9.4.
 *
 * These tests drive the Hono router directly via `app.request(...)` against
 * a temporary directory populated with fixture files. `AURA_STORAGE_PATH`
 * is set to an absolute path; the router resolves it via `process.cwd()`,
 * so we point `cwd`-relative paths at the temp dir.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { auraFilesRouter } from "./files";

// ---------------------------------------------------------------------------
// Fixture setup — a temporary storage root with a few files of varying types
// ---------------------------------------------------------------------------

let storageRoot: string;
let originalCwd: string;
let originalStoragePath: string | undefined;

const cwdRoot = process.cwd();

function makeApp() {
  const app = new Hono();
  app.route("/files", auraFilesRouter());
  return app;
}

beforeAll(async () => {
  // Create a unique temp directory for the storage root.
  storageRoot = await mkdtemp(join(tmpdir(), "aura-files-test-"));

  // Populate fixtures.
  await writeFile(join(storageRoot, "hello.txt"), "hello world");
  await writeFile(
    join(storageRoot, "logo.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG header
  );
  await writeFile(join(storageRoot, "doc.pdf"), "%PDF-1.4 fake pdf");
  await writeFile(join(storageRoot, "binary.xyz"), "unknown extension");
  await mkdir(join(storageRoot, "nested"), { recursive: true });
  await writeFile(join(storageRoot, "nested", "deep.txt"), "deep");

  originalCwd = process.cwd();
  originalStoragePath = process.env.AURA_STORAGE_PATH;
});

afterAll(async () => {
  // Restore env and cwd.
  process.chdir(originalCwd);
  if (originalStoragePath === undefined) {
    delete process.env.AURA_STORAGE_PATH;
  } else {
    process.env.AURA_STORAGE_PATH = originalStoragePath;
  }
  await rm(storageRoot, { recursive: true, force: true });
});

beforeEach(() => {
  // Each test sets AURA_STORAGE_PATH relative to cwd. We use the relative
  // path from cwd so the router's `join(cwd, AURA_STORAGE_PATH)` resolves
  // back to the absolute temp directory.
  process.chdir(cwdRoot);
  process.env.AURA_STORAGE_PATH = relative(cwdRoot, storageRoot);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auraFilesRouter", () => {
  // ── Requirement 1.11 / 9.4: happy path with MIME detection ──────────────

  it("GET /files/:path returns 200 with correct MIME and cache-control for txt", async () => {
    const app = makeApp();
    const res = await app.request("/files/hello.txt");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    const text = await res.text();
    expect(text).toBe("hello world");
  });

  it("returns image/png for .png files", async () => {
    const app = makeApp();
    const res = await app.request("/files/logo.png");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
  });

  it("returns application/pdf for .pdf files", async () => {
    const app = makeApp();
    const res = await app.request("/files/doc.pdf");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("falls back to application/octet-stream for unknown extensions", async () => {
    const app = makeApp();
    const res = await app.request("/files/binary.xyz");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
  });

  it("serves nested files under sub-directories", async () => {
    const app = makeApp();
    const res = await app.request("/files/nested/deep.txt");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain");
    const text = await res.text();
    expect(text).toBe("deep");
  });

  // ── Requirement 1.11: 404 on missing file ──────────────────────────────

  it("returns 404 when the requested file does not exist", async () => {
    const app = makeApp();
    const res = await app.request("/files/does-not-exist.png");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("File not found");
  });

  // ── Requirement 9.3: path traversal rejected with 400 ───────────────────

  // Note: a literal `/files/../foo` request gets normalized by Hono's URL
  // router to `/foo` before any handler runs, so we exercise the explicit
  // `..` string check via percent-encoded slashes (`..%2F`). The path
  // delivered to the handler contains a literal `..` segment, which the
  // router rejects with HTTP 400.

  it("rejects paths with percent-encoded traversal segments with HTTP 400", async () => {
    const app = makeApp();
    const res = await app.request("/files/..%2Fetc%2Fpasswd");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid path");
  });

  it("rejects nested paths with percent-encoded traversal with HTTP 400", async () => {
    const app = makeApp();
    const res = await app.request("/files/nested/..%2F..%2Fescape.txt");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid path");
  });

  it("never serves a file from outside the storage root", async () => {
    // Encoded path that survives URL normalization and contains literal `..`.
    // The handler's explicit `..` string check rejects it before any file
    // I/O happens. The security guarantee: never HTTP 200 for an escape.
    const app = makeApp();
    const res = await app.request("/files/foo/..%2F..%2F..%2Fetc%2Fpasswd");

    expect(res.status).not.toBe(200);
    expect(res.status).toBe(400);
  });
});
