/**
 * Cursor-based pagination — `ctx.paginate` helper + cursor encoding.
 * Resolves: Requirements 25.1–25.7 (Task 16).
 */

import { createHmac } from "node:crypto";
import { AuraError } from "@/aura/core/errors";

const CURSOR_SECRET = process.env.AURA_CSRF_SECRET ?? process.env.AURA_INTERNAL_SECRET ?? "dev-cursor-key";

export interface PaginateOptions {
  where?: Record<string, unknown>;
  cursor?: string | null;
  take: number;
  orderBy?: string;
  direction?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  items: T[];
  cursor: string | null;
  isDone: boolean;
}

function signCursor(payload: string): string {
  return createHmac("sha256", CURSOR_SECRET).update(payload).digest("base64url");
}

export function encodeCursor(data: { id: string; operationHash: string }): string {
  const payload = JSON.stringify(data);
  const sig = signCursor(payload);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function decodeCursor(cursor: string, operationHash: string): { id: string } {
  let raw: string;
  try {
    raw = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new AuraError("BAD_REQUEST", "Curseur invalide.");
  }

  const dotIdx = raw.lastIndexOf(".");
  if (dotIdx === -1) throw new AuraError("BAD_REQUEST", "Curseur invalide.");

  const payload = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);

  if (signCursor(payload) !== sig) {
    throw new AuraError("BAD_REQUEST", "Curseur invalide (signature).");
  }

  let parsed: { id: string; operationHash: string };
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new AuraError("BAD_REQUEST", "Curseur invalide (format).");
  }

  if (parsed.operationHash !== operationHash) {
    throw new AuraError("BAD_REQUEST", "Curseur invalide (opération différente).");
  }

  return { id: parsed.id };
}

/**
 * Generic paginate helper usable from operation handlers.
 * Works with any Prisma model delegate that has `findMany` + `id` field.
 */
export async function paginate<T extends { id: string }>(
  // Prisma model delegates have complex generics; we accept any callable
  // findMany surface here and let the runtime do the heavy lifting.
  model: { findMany: (args: never) => Promise<unknown> } | { findMany: (...args: unknown[]) => Promise<unknown> },
  opts: PaginateOptions & { operationHash: string },
): Promise<PaginatedResult<T>> {
  const { where, cursor, take, orderBy = "createdAt", direction = "desc", operationHash } = opts;

  const findArgs: Record<string, unknown> = {
    where,
    take: take + 1, // fetch one extra to detect if there's a next page
    orderBy: { [orderBy]: direction },
  };

  if (cursor) {
    const decoded = decodeCursor(cursor, operationHash);
    findArgs.cursor = { id: decoded.id };
    findArgs.skip = 1; // skip the cursor item itself
  }

  const rows = (await (model as { findMany: (a: unknown) => Promise<unknown[]> }).findMany(findArgs)) as T[];
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  const lastItem = items[items.length - 1];

  return {
    items,
    cursor: hasMore && lastItem
      ? encodeCursor({ id: lastItem.id, operationHash })
      : null,
    isDone: !hasMore,
  };
}
