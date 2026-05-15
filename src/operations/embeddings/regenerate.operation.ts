import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("embeddings.regenerate")
  .action()
  .input(z.object({ userId: z.string() }))
  .internal()
  .handler(async ({ ctx, input }) => {
    // TODO: Generate embedding via OpenAI text-embedding-3-small when pgvector is installed
    // For now, just log that regeneration was requested
    ctx.log.info("embeddings.regenerate requested", { userId: input.userId });
    return { ok: true, stub: true };
  });
