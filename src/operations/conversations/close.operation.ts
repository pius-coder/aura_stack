import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { ChatService } from "@/operations/_services/chat-service";

export default defineOperationFn("conversations.close")
  .mutate()
  .input(z.object({ conversationId: z.string() }))
  .entities(["Conversation"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new ChatService(ctx);
    return svc.close(ctx.user.id, input.conversationId);
  });
