import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("chat.list-messages")
  .query()
  .input(z.object({ conversationId: z.string(), cursor: z.string().nullish(), numItems: z.number().int().max(50).default(20) }))
  .entities(["ChatMessage"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const conv = await ctx.db.conversation.findUnique({ where: { id: input.conversationId } });
    if (!conv) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
    if (conv.userAId !== ctx.user.id && conv.userBId !== ctx.user.id) throw new AuraError("FORBIDDEN", "Accès refusé.");
    return ctx.paginate(ctx.db.chatMessage, {
      where: { conversationId: input.conversationId },
      cursor: input.cursor ?? undefined,
      take: input.numItems,
      orderBy: "createdAt",
      direction: "desc",
      operationHash: "chat.list-messages",
    });
  });
