import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";
import type { DisputeDecision } from "@/generated/prisma/enums";

export class DisputeService extends AuraService {
  async report(conversationId: string, reporterId: string, reason: string) {
    const conv = await this.db.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conv) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
    if (conv.userAId !== reporterId && conv.userBId !== reporterId) {
      throw new AuraError("FORBIDDEN", "Accès refusé.");
    }

    const snapshot = { messages: conv.messages, participants: [conv.userAId, conv.userBId], capturedAt: new Date().toISOString() };
    await this.db.conversation.update({ where: { id: conversationId }, data: { status: "DISPUTED" } });

    const dispute = await this.db.dispute.create({
      data: { conversationId, reporterId, reason, snapshot },
    });

    const reporter = await this.db.auraUser.findUnique({ where: { id: reporterId }, select: { whatsappE164: true, profile: { select: { language: true } } } });
    if (reporter?.whatsappE164) {
      this.notify.via("warning").send({ phoneE164: reporter.whatsappE164, warningCount: 0, reason: "dispute_reported", language: reporter.profile?.language ?? "FR" }).catch(() => {});
    }

    return dispute;
  }

  async resolve(disputeId: string, adminId: string, decision: string, internalNote?: string) {
    const dispute = await this.db.dispute.findUnique({
      where: { id: disputeId },
      include: { conversation: true },
    });
    if (!dispute) throw new AuraError("NOT_FOUND", "Litige introuvable.");

    const warnUser = async (userId: string) => {
      const p = await this.db.profile.update({ where: { userId }, data: { warningCount: { increment: 1 } } });
      const user = await this.db.auraUser.findUnique({ where: { id: userId }, select: { whatsappE164: true, profile: { select: { language: true } } } });
      if (user?.whatsappE164) {
        this.notify.via("warning").send({ phoneE164: user.whatsappE164, warningCount: p.warningCount, reason: decision, language: user.profile?.language ?? "FR" }).catch(() => {});
      }
      if (p.warningCount >= 3) {
        await this.db.profile.update({ where: { userId }, data: { status: "SUSPENDED" } });
        if (user?.whatsappE164) {
          this.notify.via("suspension").send({ phoneE164: user.whatsappE164, reason: "3 avertissements accumulés.", language: user.profile?.language ?? "FR" }).catch(() => {});
        }
      }
    };

    const suspendUser = async (userId: string) => {
      await this.db.profile.update({ where: { userId }, data: { status: "SUSPENDED" } });
      const user = await this.db.auraUser.findUnique({ where: { id: userId }, select: { whatsappE164: true, profile: { select: { language: true } } } });
      if (user?.whatsappE164) {
        this.notify.via("suspension").send({ phoneE164: user.whatsappE164, reason: decision, language: user.profile?.language ?? "FR" }).catch(() => {});
      }
    };

    if (decision === "WARN_REPORTER" || decision === "WARN_BOTH") await warnUser(dispute.reporterId);
    if (decision === "WARN_REPORTED" || decision === "WARN_BOTH") {
      const reportedId = dispute.conversation.userAId === dispute.reporterId ? dispute.conversation.userBId : dispute.conversation.userAId;
      await warnUser(reportedId);
    }
    if (decision === "SUSPEND_REPORTED") {
      const reportedId = dispute.conversation.userAId === dispute.reporterId ? dispute.conversation.userBId : dispute.conversation.userAId;
      await suspendUser(reportedId);
    }
    if (decision === "SUSPEND_BOTH") {
      await suspendUser(dispute.reporterId);
      const reportedId = dispute.conversation.userAId === dispute.reporterId ? dispute.conversation.userBId : dispute.conversation.userAId;
      await suspendUser(reportedId);
    }

    return this.db.dispute.update({
      where: { id: disputeId },
      data: { status: "RESOLVED", decision: decision as DisputeDecision, resolution: internalNote, resolvedById: adminId },
    });
  }
}
