import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { InboxService } from "@/operations/_services/inbox-service";

export default defineOperationFn("agent.process-incoming")
  .mutate()
  .input(z.object({ whatsappInboxId: z.string() }))
  .internal()
  .handler(async ({ ctx, input }) => {
    const svc = new InboxService(ctx);
    return svc.processIncoming(input.whatsappInboxId);
  });
