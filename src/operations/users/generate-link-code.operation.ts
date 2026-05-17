import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuthService } from "@/operations/_services/auth-service";

export default defineOperationFn("users.generate-link-code")
  .mutate()
  .input(z.object({ phoneE164: z.string() }))
  .entities(["AuraPhoneIdentity"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new AuthService(ctx);
    return svc.generateLinkCode(input.phoneE164);
  });
