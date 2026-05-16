import { defineNotificationFn } from "@/aura/server/notifications";
import { z } from "zod";
import { whatsAppGateway } from "@/lib/whatsapp";
import { t } from "@/lib/i18n/translations";

export default defineNotificationFn("match-refused")
  .payload(z.object({ phoneE164: z.string(), language: z.enum(["FR", "EN"]).default("FR") }))
  .handler(async ({ payload }) => {
    const gateway = whatsAppGateway();
    await gateway.sendText(payload.phoneE164, t("match.refused", payload.language), `notif-match-no-${Date.now()}`);
  });
