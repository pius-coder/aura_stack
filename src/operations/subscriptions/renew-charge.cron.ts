import { defineCronFn } from "@/aura/server/cron";

export default defineCronFn("subscriptions.renew-charge")
  .schedule("0 2 * * *")
  .handler(async (ctx) => {
    await ctx.db.subscription.findMany({
      where: {
        status: "ACTIVE",
        endsAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    // TODO: attempt auto-renewal when payment provider supports recurring charges
  });
