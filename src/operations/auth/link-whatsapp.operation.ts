import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuthService } from "@/operations/_services/auth-service";

export default defineOperationFn("auth.link-whatsapp")
  .mutate()
  .input(z.object({ phoneE164: z.string(), linkCode: z.string().length(8) }))
  .entities(["AuraPhoneIdentity", "AuraUser"])
  .internal()
  .handler(async ({ ctx, input }) => {
    const svc = new AuthService(ctx);
    return svc.linkWhatsApp(input.phoneE164, input.linkCode);
  });
