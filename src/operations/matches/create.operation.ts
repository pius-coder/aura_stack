import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { MatchService } from "@/operations/_services/match-service";
import withProQuota from "@/operations/_middleware/with-pro-quota.middleware";

export default defineOperationFn("matches.create")
  .mutate()
  .input(z.object({ targetUserId: z.string(), originSessionId: z.string().optional() }))
  .entities(["Match"])
  .use(withProQuota)
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new MatchService(ctx);
    return svc.create(ctx.user.id, input.targetUserId, input.originSessionId);
  });
