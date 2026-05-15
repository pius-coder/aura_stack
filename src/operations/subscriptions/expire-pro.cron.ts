import { defineCronFn } from "@/aura/server/cron";

export default defineCronFn("subscriptions.expire-pro")
  .schedule("0 * * * *")
  .handler(async (ctx) => {
    await ctx.db.subscription.updateMany({
      where: { status: "ACTIVE", endsAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
  });
