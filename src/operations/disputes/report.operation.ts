import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { DisputeService } from "@/operations/_services/dispute-service";

export default defineOperationFn("disputes.report")
  .mutate()
  .input(z.object({ conversationId: z.string(), reason: z.string().min(1).max(500) }))
  .entities(["Dispute", "Conversation"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new DisputeService(ctx);
    return svc.report(input.conversationId, ctx.user.id, input.reason);
  });
