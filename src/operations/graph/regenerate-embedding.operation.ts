import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { KnowledgeGraphService } from "@/operations/_services/knowledge-graph-service";

export default defineOperationFn("graph.regenerate-embedding")
  .mutate()
  .input(z.object({ entityId: z.string() }))
  .entities(["GraphEmbedding", "KnowledgeEntity"])
  .internal()
  .handler(async ({ ctx, input }) => {
    const svc = new KnowledgeGraphService(ctx);
    await svc.regenerateEmbedding(input.entityId);
    return { ok: true };
  });
