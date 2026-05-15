import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { enforceRateLimit } from "@/aura/server/rate-limit";
import { createOtpChallenge } from "@/aura/server/auth/otp";
import { AuraOtpPurpose } from "@/generated/prisma/enums";
import { whatsAppGateway } from "@/lib/whatsapp";

const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "Numéro E.164 invalide");

export default defineOperationFn("auth.start-phone-otp")
  .mutate()
  .input(z.object({ phoneE164: phoneSchema }))
  .entities(["AuraOtpChallenge"])
  .public()
  .handler(async ({ ctx, input }) => {
    await enforceRateLimit(ctx.db, {
      key: `otp:request:${input.phoneE164}`,
      limit: 3,
      windowSeconds: 900,
    });

    const challenge = await createOtpChallenge({
      db: ctx.db,
      phoneE164: input.phoneE164,
      purpose: AuraOtpPurpose.LOGIN_PHONE,
    });

    // Send OTP via WhatsApp
    const gateway = whatsAppGateway();
    await gateway.sendText(
      input.phoneE164,
      `Votre code Vibe : ${challenge.code} — valable 10 min. Ne le partagez jamais.`,
      `otp-${challenge.challengeId}`,
    );

    return { ok: true, challengeId: challenge.challengeId };
  });
