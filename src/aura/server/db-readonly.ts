/**
 * Read-only Prisma client proxy used by query operations.
 *
 * Resolves: Requirements 19.1, 19.4 — query handlers receive a Prisma client
 * that throws `AuraError("INTERNAL_ERROR")` on any write method, so a
 * misbehaving query cannot mutate the database.
 *
 * The whitelist mirrors Prisma's read-only delegate API: `findMany`,
 * `findFirst`, `findUnique`, `findUniqueOrThrow`, `findFirstOrThrow`,
 * `count`, `aggregate`, `groupBy`. Raw SELECT (`$queryRaw`,
 * `$queryRawUnsafe`) is allowed; raw mutations (`$executeRaw*`) are not.
 *
 * Implementation notes
 * --------------------
 * - We can't strip writes via TypeScript alone (Prisma generates the
 *   delegate types per-model), so the runtime guard via `Proxy` is the
 *   real enforcement. The exported type is still `PrismaClient` so
 *   handler signatures stay stable.
 * - The Proxy is placed on the top-level client and on each model
 *   delegate. We don't attempt to wrap nested types (e.g. transactions
 *   would be ill-defined here anyway — a query has no transaction).
 */

import type { PrismaClient } from "@/generated/prisma/client";
import { AuraError } from "@/aura/core/errors";

const READ_METHODS = new Set([
  "findMany",
  "findFirst",
  "findUnique",
  "findUniqueOrThrow",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

const TOP_LEVEL_ALLOWED = new Set([
  "$queryRaw",
  "$queryRawUnsafe",
  "$on",
  "$use",
  "$extends",
  "$disconnect",
  "$connect",
]);

const TOP_LEVEL_FORBIDDEN = new Set([
  "$executeRaw",
  "$executeRawUnsafe",
  "$transaction",
]);

function denyWrite(model: string, method: string): never {
  throw new AuraError(
    "INTERNAL_ERROR",
    `Write operations are forbidden in queries (attempted: ${model}.${method}).`,
  );
}

function wrapDelegate(modelName: string, delegate: object): object {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      if (typeof prop !== "string") {
        return Reflect.get(target, prop, receiver);
      }
      if (READ_METHODS.has(prop)) {
        return Reflect.get(target, prop, receiver);
      }
      // Skip non-method props (e.g. `name`, internal symbols)
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return () => denyWrite(modelName, prop);
    },
  });
}

/**
 * Wrap a `PrismaClient` instance so that writes throw at runtime. The
 * returned value is typed as `PrismaClient` for handler ergonomics, but
 * write methods (`create`, `update`, `delete`, `upsert`, `*Many`,
 * `$executeRaw*`, `$transaction`) throw an `AuraError("INTERNAL_ERROR")`.
 */
export function createReadOnlyDb(client: PrismaClient): PrismaClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (typeof prop !== "string") {
        return Reflect.get(target, prop, receiver);
      }

      if (TOP_LEVEL_FORBIDDEN.has(prop)) {
        return () => denyWrite("$root", prop);
      }
      if (TOP_LEVEL_ALLOWED.has(prop)) {
        return Reflect.get(target, prop, receiver);
      }

      const raw = Reflect.get(target, prop, receiver);
      // Model delegates are objects with their own methods. Bare model
      // delegates start with a lowercase letter (e.g. `auraUser`).
      if (raw && typeof raw === "object" && /^[a-z]/.test(prop)) {
        return wrapDelegate(prop, raw);
      }
      return raw;
    },
  }) as PrismaClient;
}
