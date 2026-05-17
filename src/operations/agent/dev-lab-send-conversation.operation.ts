import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { DevLabService } from "@/operations/_services/dev-lab-service";

export default defineOperationFn("agent.dev-lab-send-conversation")
  .mutate()
  .input(
    z.object({
      phoneE164: z.string(),
      conversationId: z.string(),
      body: z.string().min(1).max(4000),
    }),
  )
  .entities(["ChatMessage", "Conversation"])
  .public()
  .handler(async ({ ctx, input }) => {
    const svc = new DevLabService(ctx);
    return svc.sendConversationMessage(
      input.phoneE164,
      input.conversationId,
      input.body,
    );
  });
