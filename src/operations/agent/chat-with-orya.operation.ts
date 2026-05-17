import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { UserAgentService } from "@/operations/_services/user-agent-service";

export default defineOperationFn("agent.chat-with-orya")
  .mutate()
  .input(z.object({ text: z.string().min(1).max(4000) }))
  .entities(["Match", "Conversation", "ChatMessage", "Profile", "Service"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new UserAgentService(ctx);
    const turn = await svc.processTurn(ctx.user.id, input.text);
    return {
      reply: turn.reply,
      intent: turn.intent,
      action: turn.action,
      language: turn.language,
      extraction: turn.extraction,
      matchSessionId: turn.matchSessionId,
    };
  });
