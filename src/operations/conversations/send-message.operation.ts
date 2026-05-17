import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { ChatService } from "@/operations/_services/chat-service";

export default defineOperationFn("conversations.send-message")
  .mutate()
  .input(z.object({ conversationId: z.string(), body: z.string().min(1).max(4000) }))
  .entities(["ChatMessage", "Conversation"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new ChatService(ctx);
    return svc.sendMessage(ctx.user.id, input.conversationId, input.body);
  });
