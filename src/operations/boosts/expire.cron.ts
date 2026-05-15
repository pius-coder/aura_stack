import { defineCronFn } from "@/aura/server/cron";

export default defineCronFn("boosts.expire")
  .schedule("0 * * * *")
  .handler(async (ctx) => {
    await ctx.db.boostSlot.updateMany({
      where: { status: "ACTIVE", endsAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
  });
