import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuthService } from "@/operations/_services/auth-service";

const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "Numéro E.164 invalide");

export default defineOperationFn("auth.verify-phone-otp")
  .mutate()
  .input(z.object({
    phoneE164: phoneSchema,
    code: z.string().min(6).max(8),
    challengeId: z.string(),
  }))
  .entities(["AuraUser", "AuraPhoneIdentity", "AuraSession", "Profile"])
  .public()
  .handler(async ({ ctx, input }) => {
    const svc = new AuthService(ctx);
    return svc.verifyPhoneOtp(input);
  });
