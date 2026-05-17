import { defineOperationFn } from "@/aura/server/operation";
import { MatchService } from "@/operations/_services/match-service";

export default defineOperationFn("matching.list-mine")
  .query()
  .entities(["Match"])
  .auth()
  .handler(async ({ ctx }) => {
    const svc = new MatchService(ctx);
    return svc.listMine(ctx.user.id);
  });
