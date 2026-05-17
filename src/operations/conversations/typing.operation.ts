import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { ChatService } from "@/operations/_services/chat-service";

export default defineOperationFn("conversations.typing")
  .mutate()
  .input(z.object({ conversationId: z.string() }))
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new ChatService(ctx);
    await svc.sendTyping(ctx.user.id, input.conversationId);
    return { ok: true };
  });
