import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuthService } from "@/operations/_services/auth-service";
import { whatsAppGateway } from "@/lib/whatsapp";

const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "Numéro E.164 invalide");

export default defineOperationFn("auth.start-phone-otp")
  .mutate()
  .input(z.object({ phoneE164: phoneSchema }))
  .entities(["AuraOtpChallenge"])
  .public()
  .handler(async ({ ctx, input }) => {
    const svc = new AuthService(ctx);
    const result = await svc.startPhoneOtp({ phoneE164: input.phoneE164 });

    const gateway = whatsAppGateway();
    await gateway.sendText(
      input.phoneE164,
      `Votre code Vibe : ${result.code} — valable 10 min. Ne le partagez jamais.`,
      `otp-${result.challengeId}`,
    );

    return { ok: true, challengeId: result.challengeId };
  });
