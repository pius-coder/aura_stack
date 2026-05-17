import { defineOperationFn } from "@/aura/server/operation";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("admin.metrics-business")
  .query()
  .entities(["AuraUser", "Match", "Conversation", "Dispute"])
  .auth()
  .handler(async ({ ctx }) => {
    if (!ctx.user.isAdmin) throw new AuraError("FORBIDDEN", "Admin requis.");

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [activeUsers, totalMatches, acceptedMatches, openConversations, openDisputes, resolvedDisputes] = await Promise.all([
      ctx.db.auraUser.count({ where: { createdAt: { gte: since }, deletedAt: null } }),
      ctx.db.match.count({ where: { createdAt: { gte: since } } }),
      ctx.db.match.count({ where: { status: "ACCEPTED", createdAt: { gte: since } } }),
      ctx.db.conversation.count({ where: { status: "OPEN" } }),
      ctx.db.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
      ctx.db.dispute.count({ where: { status: "RESOLVED" } }),
    ]);

    return {
      activeUsers30d: activeUsers,
      matchRequestsCreated: totalMatches,
      acceptanceRate: totalMatches > 0 ? acceptedMatches / totalMatches : 0,
      openConversations,
      disputesOpen: openDisputes,
      disputesResolved: resolvedDisputes,
    };
  });
