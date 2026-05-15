import { defineOperationFn } from "@/aura/server/operation";

export default defineOperationFn("profiles.get")
  .query()
  .entities(["Profile"])
  .auth()
  .handler(async ({ ctx }) => {
    const profile = await ctx.db.profile.findUnique({ where: { userId: ctx.user.id } });
    if (!profile) return null;
    const [serviceCount, ratingAgg] = await Promise.all([
      ctx.db.service.count({ where: { userId: ctx.user.id, deletedAt: null, isActive: true } }),
      ctx.db.rating.aggregate({ where: { rateeId: ctx.user.id }, _avg: { score: true }, _count: true }),
    ]);
    return { ...profile, serviceCount, ratingAvg: ratingAgg._avg.score, ratingCount: ratingAgg._count };
  });
