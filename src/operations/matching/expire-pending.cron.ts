import { defineCronFn } from "@/aura/server/cron";
import { MatchService } from "@/operations/_services/match-service";

export default defineCronFn("matching.expire-pending")
  .schedule("0 6 * * *")
  .handler(async (ctx) => {
    const svc = new MatchService(ctx);
    await svc.expirePending();
  });
