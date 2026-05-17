import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { MatchService } from "@/operations/_services/match-service";

export default defineOperationFn("matching.accept-request")
  .mutate()
  .input(z.object({ matchId: z.string() }))
  .entities(["Match", "Conversation"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new MatchService(ctx);
    return svc.accept(ctx.user.id, input.matchId);
  });
