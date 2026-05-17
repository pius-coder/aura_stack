import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { KnowledgeGraphService } from "@/operations/_services/knowledge-graph-service";

export default defineOperationFn("graph.upsert-relation")
  .mutate()
  .input(z.object({
    sourceEntityId: z.string(),
    targetEntityId: z.string(),
    predicate: z.enum(["PROVIDES", "REQUIRES", "LOCATED_IN", "LOOKS_FOR", "MATCHES", "CONNECTED_TO", "RATED"]),
    strength: z.number().min(0).max(1),
  }))
  .entities(["KnowledgeRelation"])
  .internal()
  .handler(async ({ ctx, input }) => {
    const svc = new KnowledgeGraphService(ctx);
    return svc.upsertRelation(input.sourceEntityId, input.targetEntityId, input.predicate, input.strength);
  });
