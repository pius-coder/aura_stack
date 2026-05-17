import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { KnowledgeGraphService } from "@/operations/_services/knowledge-graph-service";

export default defineOperationFn("graph.upsert-entity")
  .mutate()
  .input(z.object({
    userId: z.string(),
    type: z.enum(["SKILL", "LOCATION", "INDUSTRY", "NEED", "SERVICE", "USER"]),
    value: z.string(),
    source: z.enum(["CONVERSATION", "DASHBOARD"]).default("CONVERSATION"),
  }))
  .entities(["KnowledgeEntity"])
  .internal()
  .handler(async ({ ctx, input }) => {
    const svc = new KnowledgeGraphService(ctx);
    return svc.upsertEntity(input.userId, input.type, input.value, input.source);
  });
