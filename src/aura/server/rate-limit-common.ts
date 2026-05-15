

import { defineCommonFn } from "@/aura/server/operation";
import { enforceRateLimit } from "./rate-limit";

export interface RateLimitCommonOptions {
  key: string;
  limit: number;
  windowSeconds: number;
}

export const rateLimit = (options: RateLimitCommonOptions) =>
  defineCommonFn("rateLimit").run(async ({ ctx }) => {
    await enforceRateLimit(ctx.db, {
      key: options.key,
      limit: options.limit,
      windowSeconds: options.windowSeconds,
    });
  });
