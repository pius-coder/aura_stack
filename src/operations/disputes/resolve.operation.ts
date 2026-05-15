import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("disputes.resolve")
  .mutate()
  .input(z.object({
    disputeId: z.string(),
    decision: z.enum(["DISMISS", "WARN_REPORTER", "WARN_REPORTED", "WARN_BOTH", "SUSPEND_REPORTED", "SUSPEND_BOTH"]),
    internalNote: z.string().optional(),
  }))
  .entities(["Dispute", "Profile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    if (!ctx.user.isAdmin) throw new AuraError("FORBIDDEN", "Accès admin requis.");
    const dispute = await ctx.db.dispute.findUnique({ where: { id: input.disputeId }, include: { conversation: true } });
    if (!dispute) throw new AuraError("NOT_FOUND", "Litige introuvable.");

    const warnUser = async (userId: string) => {
      const p = await ctx.db.profile.update({ where: { userId }, data: { warningCount: { increment: 1 } } });
      if (p.warningCount >= 3) await ctx.db.profile.update({ where: { userId }, data: { status: "SUSPENDED" } });
    };

    if (input.decision === "WARN_REPORTER" || input.decision === "WARN_BOTH") await warnUser(dispute.reporterId);
    if (input.decision === "WARN_REPORTED" || input.decision === "WARN_BOTH") {
      const reportedId = dispute.conversation.userAId === dispute.reporterId ? dispute.conversation.userBId : dispute.conversation.userAId;
      await warnUser(reportedId);
    }
    if (input.decision === "SUSPEND_REPORTED") {
      const reportedId = dispute.conversation.userAId === dispute.reporterId ? dispute.conversation.userBId : dispute.conversation.userAId;
      await ctx.db.profile.update({ where: { userId: reportedId }, data: { status: "SUSPENDED" } });
    }
    if (input.decision === "SUSPEND_BOTH") {
      await ctx.db.profile.update({ where: { userId: dispute.reporterId }, data: { status: "SUSPENDED" } });
      const reportedId = dispute.conversation.userAId === dispute.reporterId ? dispute.conversation.userBId : dispute.conversation.userAId;
      await ctx.db.profile.update({ where: { userId: reportedId }, data: { status: "SUSPENDED" } });
    }

    return ctx.db.dispute.update({ where: { id: input.disputeId }, data: { status: "RESOLVED", decision: input.decision, resolution: input.internalNote, resolvedById: ctx.user.id } });
  });
