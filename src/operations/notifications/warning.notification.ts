import { defineNotificationFn } from "@/aura/server/notifications";
import { z } from "zod";
import { whatsAppGateway } from "@/lib/whatsapp";
import { t } from "@/lib/i18n/translations";

const WarningPayload = z.object({
  phoneE164: z.string(),
  warningCount: z.number(),
  reason: z.string(),
  language: z.enum(["FR", "EN"]).default("FR"),
});

export default defineNotificationFn("warning")
  .payload(WarningPayload)
  .handler(async ({ payload }) => {
    const gateway = whatsAppGateway();
    await gateway.sendText(
      payload.phoneE164,
      t("warning.received", payload.language).replace("{count}", String(payload.warningCount)).replace("{reason}", payload.reason),
      `notif-warn-${Date.now()}`,
    );
  });
