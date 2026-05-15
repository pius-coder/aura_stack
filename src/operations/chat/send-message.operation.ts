import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("chat.send-message")
  .mutate()
  .input(z.object({ conversationId: z.string(), body: z.string().min(1).max(4000) }))
  .entities(["ChatMessage", "Conversation"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const conv = await ctx.db.conversation.findUnique({ where: { id: input.conversationId } });
    if (!conv) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
    if (conv.userAId !== ctx.user.id && conv.userBId !== ctx.user.id) throw new AuraError("FORBIDDEN", "Accès refusé.");
    if (conv.status !== "OPEN") throw new AuraError("BAD_REQUEST", "Conversation fermée.");
    return ctx.db.chatMessage.create({
      data: { conversationId: input.conversationId, senderId: ctx.user.id, body: input.body },
    });
  });
