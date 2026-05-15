

import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain",
};

/**
 * `auraFilesRouter()` — Hono router for `GET /files/:path{.+}`.
 *
 * Resolves Requirements 1.11, 9.3, 9.4, 23.5 (task 14.2).
 *
 * Two serving modes coexist for backward compatibility:
 *   1. `GET /files/:storageId/:filename` — resolves through the
 *      `AuraStoredFile` table when the first segment is a CUID-shaped id,
 *      and the second segment matches the stored `filename`. This is the
 *      `ctx.storage.store` / `ctx.storage.getUrl` path (Decision 17).
 *   2. `GET /files/<any-path>` — legacy free-path serving relative to
 *      `AURA_STORAGE_PATH`. Path traversal segments are rejected.
 *
 * Both modes set `cache-control: public, max-age=86400`.
 */
export function auraFilesRouter() {
  const router = new Hono();

  router.get("/:path{.+}", async (c) => {
    const rawPath = c.req.param("path");

    if (rawPath.includes("..")) {
      return c.json({ ok: false, error: "Invalid path" }, 400);
    }

    // Mode 1: AuraStoredFile lookup. Recognize the URL shape
    // `:storageId/:filename` where storageId looks like a CUID.
    const storedHit = await tryResolveStoredFile(rawPath);
    if (storedHit) {
      return new Response(new Uint8Array(storedHit.bytes), {
        headers: {
          "content-type": storedHit.contentType,
          "cache-control": "public, max-age=86400",
        },
      });
    }

    // Mode 2: legacy free-path serving.
    const storagePath = process.env.AURA_STORAGE_PATH || "storage/files";
    const base = join(process.cwd(), storagePath);
    const filePath = join(base, rawPath);

    if (!filePath.startsWith(base + "/") && filePath !== base) {
      return c.json({ ok: false, error: "Invalid path" }, 400);
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(filePath);
    } catch {
      return c.json({ ok: false, error: "File not found" }, 404);
    }

    const ext = rawPath.split(".").pop()?.toLowerCase() ?? "";
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    return new Response(new Uint8Array(fileBuffer), {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400",
      },
    });
  });

  return router;
}

async function tryResolveStoredFile(rawPath: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const segments = rawPath.split("/");
  if (segments.length < 2) return null;
  const [storageId] = segments;
  // CUID2 / cuid is roughly [a-z0-9]{20,}; we just check shape conservatively.
  if (!/^[a-z0-9]{20,}$/i.test(storageId)) return null;

  // Lazy DB import — keeps this router usable in tests that don't set
  // DATABASE_URL when the request doesn't actually hit a stored file.
  let db: typeof import("@/aura/server/db")["db"];
  try {
    ({ db } = await import("@/aura/server/db"));
  } catch {
    return null;
  }

  const row = await db.auraStoredFile.findUnique({ where: { id: storageId } });
  if (!row) return null;

  const storagePath = process.env.AURA_STORAGE_PATH || "storage/files";
  const base = join(process.cwd(), storagePath);
  const target = join(base, row.path);
  if (!target.startsWith(base + "/") && target !== base) return null;

  try {
    const bytes = await readFile(target);
    return { bytes, contentType: row.contentType };
  } catch {
    return null;
  }
}
