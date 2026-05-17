import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { MatchService } from "@/operations/_services/match-service";

export default defineOperationFn("matching.cancel-request")
  .mutate()
  .input(z.object({ matchId: z.string() }))
  .entities(["Match"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new MatchService(ctx);
    return svc.cancel(ctx.user.id, input.matchId);
  });
