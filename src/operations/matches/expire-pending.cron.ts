import { defineOperationFn } from "@/aura/server/operation";
import { MatchService } from "@/operations/_services/match-service";

export default defineOperationFn("matches.expire-pending")
  .mutate()
  .entities(["Match"])
  .internal()
  .handler(async ({ ctx }) => {
    const svc = new MatchService(ctx);
    return svc.expirePending();
  });
