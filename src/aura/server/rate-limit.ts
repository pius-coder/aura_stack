

import { AuraError } from "@/aura/core/errors";
import type { AuraDb } from "./db";

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowSeconds: number;
}

export async function enforceRateLimit(db: AuraDb, options: RateLimitOptions): Promise<void> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + options.windowSeconds * 1000);
  const existing = await db.auraRateLimitBucket.findUnique({
    where: { key: options.key },
  });

  if (!existing || existing.resetAt <= now) {
    await db.auraRateLimitBucket.upsert({
      where: { key: options.key },
      create: {
        key: options.key,
        count: 1,
        resetAt,
      },
      update: {
        count: 1,
        resetAt,
      },
    });
    return;
  }

  if (existing.count >= options.limit) {
    throw new AuraError("RATE_LIMITED", "Trop de tentatives. Réessayez plus tard.", {
      status: 429,
    });
  }

  await db.auraRateLimitBucket.update({
    where: { key: options.key },
    data: {
      count: { increment: 1 },
    },
  });
}
