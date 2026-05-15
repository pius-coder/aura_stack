

import type { Prisma } from "@/generated/prisma/client";

/**
 * Converts arbitrary Aura metadata into a Prisma JSON-safe value.
 *
 * Aura metadata is intentionally ergonomic at call sites (`Record<string, unknown>`),
 * but Prisma JSON inputs require values that are already JSON-compatible. This helper
 * keeps that boundary explicit and prevents accidental persistence of unserializable
 * values such as functions, symbols, bigint values, or Error instances.
 */
export function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;

  try {
    const serialized = JSON.stringify(value, jsonReplacer);
    if (!serialized) return undefined;

    const parsed = JSON.parse(serialized) as unknown;
    if (parsed === null) return undefined;

    return parsed as Prisma.InputJsonValue;
  } catch {
    return {
      serializationError: "Aura metadata could not be serialized safely.",
    } as Prisma.InputJsonValue;
  }
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: process.env.NODE_ENV !== "production" ? value.stack : undefined,
    };
  }

  return value;
}
