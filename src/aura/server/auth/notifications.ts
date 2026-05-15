

import { AuraError } from "@/aura/core/errors";
import { defineNotificationFn } from "../notifications";
import { toPrismaJson } from "../json";
import { authPhoneOtpNotificationSchema } from "@/aura/shared/notification-schemas";

export const authPhoneOtpNotification = defineNotificationFn("auth.phoneOtp")
  .payload(authPhoneOtpNotificationSchema)
  .handler(async ({ ctx, payload }) => {
    await deliverOtp(ctx, payload);

    await ctx.db.auraNotification.create({
      data: {
        name: "auth.phoneOtp",
        title: "Code de verification Aura",
        body: `Un code de verification Aura a ete envoye. Il expire a ${new Date(payload.expiresAt).toLocaleTimeString()}.`,
        payload: toPrismaJson({
          phoneE164: payload.phoneE164,
          purpose: payload.purpose,
          expiresAt: payload.expiresAt,
          codeStored: false,
        }),
      },
    });
  });

async function deliverOtp(
  ctx: Parameters<typeof authPhoneOtpNotification.handler>[0]["ctx"],
  payload: Parameters<typeof authPhoneOtpNotification.handler>[0]["payload"],
): Promise<void> {
  const webhookUrl = process.env.AURA_OTP_WEBHOOK_URL;
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.AURA_OTP_WEBHOOK_SECRET
          ? { authorization: `Bearer ${process.env.AURA_OTP_WEBHOOK_SECRET}` }
          : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      ctx.log.error("Aura OTP webhook delivery failed", {
        phoneE164: payload.phoneE164,
        purpose: payload.purpose,
        status: response.status,
      });
      throw new AuraError(
        "INTERNAL_ERROR",
        "Impossible d'envoyer le code de verification.",
        {
          expose: false,
        },
      );
    }
    return;
  }

  // Try WhatsApp OTP first
  try {
    await ctx.notify.via("whatsapp.otp").send({
      phoneE164: payload.phoneE164,
      code: payload.code,
      purpose: payload.purpose,
      expiresAt: payload.expiresAt,
    });
    ctx.log.info("WhatsApp OTP delivered", {
      phoneE164: payload.phoneE164,
      purpose: payload.purpose,
    });
    return;
  } catch (error) {
    ctx.log.warn("WhatsApp OTP delivery failed, falling back", {
      phoneE164: payload.phoneE164,
      purpose: payload.purpose,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.AURA_ALLOW_CONSOLE_OTP_IN_PROD !== "true"
  ) {
    ctx.log.error("Aura OTP provider missing in production", {
      phoneE164: payload.phoneE164,
      purpose: payload.purpose,
    });
    throw new AuraError("INTERNAL_ERROR", "Provider OTP non configure.", {
      expose: false,
    });
  }

  ctx.log.warn("Aura console OTP delivery is active", {
    phoneE164: payload.phoneE164,
    purpose: payload.purpose,
    code: payload.code,
    expiresAt: payload.expiresAt,
    productionOverride: process.env.NODE_ENV === "production",
  });
}
