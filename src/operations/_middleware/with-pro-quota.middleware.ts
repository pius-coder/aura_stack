import { defineCommonFn } from "@/aura/server/operation";
import { AuraError } from "@/aura/core/errors";

const MAX_MATCHES_PER_DAY_FREE = 20;

export default defineCommonFn("withProQuota").run(async ({ ctx }) => {
  if (!ctx.user) throw new AuraError("UNAUTHORIZED", "Authentification requise.");

  // Check Pro subscription
  const pro = await ctx.db.subscription.findFirst({
    where: { userId: ctx.user.id, plan: "PRO", status: "ACTIVE", endsAt: { gt: new Date() } },
  });
  if (pro) return; // Pro users have unlimited

  // Check daily match quota
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMatches = await ctx.db.match.count({
    where: {
      OR: [{ requesterId: ctx.user.id }, { targetId: ctx.user.id }],
      createdAt: { gte: today },
    },
  });
  if (todayMatches >= MAX_MATCHES_PER_DAY_FREE) {
    throw new AuraError("BAD_REQUEST", `Limite de ${MAX_MATCHES_PER_DAY_FREE} matchs par jour atteinte.`);
  }
});
