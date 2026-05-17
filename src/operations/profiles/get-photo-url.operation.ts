import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("profiles.get-photo-url")
  .query()
  .input(z.object({ storageId: z.string() }))
  .auth()
  .handler(async ({ ctx, input }) => {
    const url = await ctx.storage.getUrl(input.storageId);
    return { url };
  });
