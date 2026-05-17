import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("conversations.mark-read")
  .mutate()
  .input(z.object({ conversationId: z.string() }))
  .entities(["ChatMessage"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const conv = await ctx.db.conversation.findUnique({ where: { id: input.conversationId } });
    if (!conv || (conv.userAId !== ctx.user.id && conv.userBId !== ctx.user.id)) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
    // Mark all unread messages from the other user as read
    const otherId = conv.userAId === ctx.user.id ? conv.userBId : conv.userAId;
    await ctx.db.$executeRaw`UPDATE "ChatMessage" SET "readBy" = "readBy" || ${JSON.stringify([ctx.user.id])}::jsonb WHERE "conversationId" = ${input.conversationId} AND "senderId" = ${otherId} AND NOT ("readBy" @> ${JSON.stringify([ctx.user.id])}::jsonb)`;
    return { ok: true };
  });
