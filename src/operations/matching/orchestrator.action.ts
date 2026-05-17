import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { MatchingService } from "@/operations/_services/matching-service";

export default defineOperationFn("matching.orchestrator")
  .mutate()
  .input(z.object({
    requesterId: z.string(),
    query: z.string(),
    constraints: z.object({
      skills: z.array(z.string()).optional(),
      location: z.string().optional(),
      industry: z.string().optional(),
      budgetMaxXaf: z.number().optional(),
    }).optional(),
    topK: z.number().int().min(1).max(10).default(5),
  }))
  .internal()
  .handler(async ({ ctx, input }) => {
    const svc = new MatchingService(ctx);
    return svc.runQuery(input.requesterId, input.query, input.constraints, input.topK);
  });
