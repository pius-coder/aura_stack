import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { DevLabService } from "@/operations/_services/dev-lab-service";

export default defineOperationFn("agent.dev-lab-match-action")
  .mutate()
  .input(
    z.object({
      phoneE164: z.string(),
      matchId: z.string(),
      action: z.enum(["accept", "refuse", "cancel"]),
    }),
  )
  .entities(["Match", "Conversation"])
  .public()
  .handler(async ({ ctx, input }) => {
    const svc = new DevLabService(ctx);
    return svc.actOnMatch(input.phoneE164, input.matchId, input.action);
  });
