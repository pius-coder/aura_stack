import { defineNotificationFn } from "@/aura/server/notifications";
import { z } from "zod";
import { whatsAppGateway } from "@/lib/whatsapp";
import { t } from "@/lib/i18n/translations";

const SuspensionPayload = z.object({
  phoneE164: z.string(),
  reason: z.string(),
  language: z.enum(["FR", "EN"]).default("FR"),
});

export default defineNotificationFn("suspension")
  .payload(SuspensionPayload)
  .handler(async ({ payload }) => {
    const gateway = whatsAppGateway();
    await gateway.sendText(
      payload.phoneE164,
      t("suspension.notice", payload.language).replace("{reason}", payload.reason),
      `notif-susp-${Date.now()}`,
    );
  });
