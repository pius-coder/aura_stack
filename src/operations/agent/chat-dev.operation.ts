import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { DevLabService } from "@/operations/_services/dev-lab-service";

export default defineOperationFn("agent.chat-dev")
  .mutate()
  .input(z.object({ phoneE164: z.string(), text: z.string().min(1).max(4000) }))
  .entities(["AuraUser", "AuraPhoneIdentity", "Profile", "Service", "Match", "Conversation", "ChatMessage"])
  .public()
  .handler(async ({ ctx, input }) => {
    const svc = new DevLabService(ctx);
    return svc.chat(input.phoneE164, input.text);
  });
