import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("disputes.create")
  .mutate()
  .input(z.object({ conversationId: z.string(), reason: z.string().min(1).max(500) }))
  .entities(["Dispute", "Conversation"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const conv = await ctx.db.conversation.findUnique({ where: { id: input.conversationId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    if (!conv) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
    if (conv.userAId !== ctx.user.id && conv.userBId !== ctx.user.id) throw new AuraError("FORBIDDEN", "Accès refusé.");
    const snapshot = { messages: conv.messages, participants: [conv.userAId, conv.userBId], capturedAt: new Date().toISOString() };
    await ctx.db.conversation.update({ where: { id: input.conversationId }, data: { status: "DISPUTED" } });
    return ctx.db.dispute.create({ data: { conversationId: input.conversationId, reporterId: ctx.user.id, reason: input.reason, snapshot } });
  });
