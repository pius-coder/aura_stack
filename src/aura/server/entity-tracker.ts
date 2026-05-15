/**
 * Auto-tracking entity invalidation — Prisma Proxy.
 * Resolves: Requirements 30.2–30.4 (Task 21).
 *
 * Wraps a PrismaClient in a Proxy that records which models are read/written.
 * After the handler completes, the tracked models are merged into the
 * invalidation set automatically.
 */

import type { PrismaClient } from "@/generated/prisma/client";

export interface EntityTracker {
  /** Models that were read during this request. */
  reads: Set<string>;
  /** Models that were written during this request. */
  writes: Set<string>;
}

const WRITE_METHODS = new Set([
  "create", "createMany", "createManyAndReturn",
  "update", "updateMany", "updateManyAndReturn",
  "upsert", "delete", "deleteMany",
]);

const READ_METHODS = new Set([
  "findMany", "findFirst", "findFirstOrThrow",
  "findUnique", "findUniqueOrThrow",
  "count", "aggregate", "groupBy",
]);

/**
 * Create a tracked Prisma client that records entity reads/writes.
 * The tracker is populated as operations execute.
 */
export function createTrackedPrismaClient(
  client: PrismaClient,
): { client: PrismaClient; tracker: EntityTracker } {
  const tracker: EntityTracker = { reads: new Set(), writes: new Set() };

  const proxy = new Proxy(client, {
    get(target, prop) {
      const value = (target as unknown as Record<string | symbol, unknown>)[prop];

      // Only intercept model delegates (lowercase first char, not $ prefixed)
      if (typeof prop !== "string" || prop.startsWith("$") || prop.startsWith("_")) {
        return value;
      }

      // Check if it's a model delegate (has findMany)
      if (value && typeof value === "object" && "findMany" in (value as object)) {
        const modelName = capitalize(prop);
        return new Proxy(value as object, {
          get(modelTarget, methodProp) {
            const method = (modelTarget as Record<string | symbol, unknown>)[methodProp];
            if (typeof method !== "function") return method;

            if (typeof methodProp === "string") {
              if (WRITE_METHODS.has(methodProp)) {
                return (...args: unknown[]) => {
                  tracker.writes.add(modelName);
                  return (method as Function).apply(modelTarget, args);
                };
              }
              if (READ_METHODS.has(methodProp)) {
                return (...args: unknown[]) => {
                  tracker.reads.add(modelName);
                  return (method as Function).apply(modelTarget, args);
                };
              }
            }
            return typeof method === "function" ? method.bind(modelTarget) : method;
          },
        });
      }

      return value;
    },
  });

  return { client: proxy as PrismaClient, tracker };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
