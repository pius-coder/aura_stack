import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { DevLabService } from "@/operations/_services/dev-lab-service";

export default defineOperationFn("agent.dev-lab-state")
  .mutate()
  .input(z.object({ phoneE164: z.string() }))
  .entities(["AuraUser", "AuraPhoneIdentity", "Profile", "Service", "Match", "Conversation", "ChatMessage"])
  .public()
  .handler(async ({ ctx, input }) => {
    const svc = new DevLabService(ctx);
    return svc.getState(input.phoneE164);
  });
