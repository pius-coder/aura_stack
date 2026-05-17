import { defineNotificationFn } from "@/aura/server/notifications";
import { z } from "zod";
import { whatsAppGateway } from "@/lib/whatsapp";
import { t } from "@/lib/i18n/translations";

const PhonePayload = z.object({
  phoneE164: z.string(),
  language: z.enum(["FR", "EN"]).default("FR"),
});

export default defineNotificationFn("match-request")
  .payload(PhonePayload)
  .handler(async ({ payload }) => {
    const gateway = whatsAppGateway();
    await gateway.sendText(payload.phoneE164, t("match.new_request", payload.language), `notif-match-req-${Date.now()}`);
  });
