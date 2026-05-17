import { defineOperationFn } from "@/aura/server/operation";

export default defineOperationFn("users.data-delete")
  .mutate()
  .entities(["AuraUser", "Profile", "Service", "Match", "Conversation", "ChatMessage", "Rating", "Dispute", "KnowledgeEntity", "KnowledgeRelation", "Payment", "BoostSlot", "Subscription"])
  .auth()
  .handler(async ({ ctx }) => {
    const userId = ctx.user.id;

    await ctx.db.$transaction([
      ctx.db.knowledgeRelation.deleteMany({ where: { OR: [{ sourceEntity: { userId } }, { targetEntity: { userId } }] } }),
      ctx.db.knowledgeEntity.deleteMany({ where: { userId } }),
      ctx.db.rating.deleteMany({ where: { OR: [{ raterId: userId }, { rateeId: userId }] } }),
      ctx.db.dispute.deleteMany({ where: { reporterId: userId } }),
      ctx.db.chatMessage.deleteMany({ where: { conversation: { OR: [{ userAId: userId }, { userBId: userId }] } } }),
      ctx.db.conversation.deleteMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] } }),
      ctx.db.match.deleteMany({ where: { OR: [{ requesterId: userId }, { targetId: userId }] } }),
      ctx.db.service.deleteMany({ where: { userId } }),
      ctx.db.boostSlot.deleteMany({ where: { userId } }),
      ctx.db.subscription.deleteMany({ where: { userId } }),
      ctx.db.payment.deleteMany({ where: { userId } }),
      ctx.db.profile.delete({ where: { userId } }),
      ctx.db.auraUser.update({ where: { id: userId }, data: { deletedAt: new Date(), email: null, whatsappE164: null } }),
    ]);

    void ctx.audit.record("user.delete", { operation: "user.delete", userId });
    ctx.bump.success("Compte supprimé", "Toutes vos données ont été effacées.");

    return { ok: true };
  });
