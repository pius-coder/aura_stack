import { defineOperationFn } from "@/aura/server/operation";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("admin.metrics-ai")
  .query()
  .entities(["AuraAIUsage", "Rating"])
  .auth()
  .handler(async ({ ctx }) => {
    if (!ctx.user.isAdmin) throw new AuraError("FORBIDDEN", "Admin requis.");

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [usageByModel, highRatings, totalRatings] = await Promise.all([
      ctx.db.$queryRawUnsafe<Array<{ model: string; totalTokens: bigint; count: bigint }>>(
        `SELECT model, SUM("totalTokens") as "totalTokens", COUNT(*) as count FROM "AuraAIUsage" WHERE "createdAt" >= $1 GROUP BY model`,
        since,
      ),
      ctx.db.rating.count({ where: { score: { gte: 4 }, createdAt: { gte: since } } }),
      ctx.db.rating.count({ where: { createdAt: { gte: since } } }),
    ]);

    return {
      tokensByModel: usageByModel,
      positiveRatingRate: totalRatings > 0 ? highRatings / totalRatings : 0,
    };
  });
