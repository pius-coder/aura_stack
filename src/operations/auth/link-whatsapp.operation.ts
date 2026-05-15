import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("auth.link-whatsapp")
  .mutate()
  .input(z.object({ phoneE164: z.string(), linkCode: z.string().length(8) }))
  .entities(["AuraPhoneIdentity", "AuraUser"])
  .internal()
  .handler(async ({ ctx, input }) => {
    const identity = await ctx.db.auraPhoneIdentity.findFirst({
      where: { linkCode: input.linkCode, phoneE164: input.phoneE164 },
    });
    if (!identity) return { ok: false, reason: "INVALID_CODE" as const };

    if (!identity.linkCodeExpiresAt || identity.linkCodeExpiresAt < new Date()) {
      return { ok: false, reason: "CODE_EXPIRED" as const };
    }

    const now = new Date();
    await ctx.db.auraPhoneIdentity.update({
      where: { id: identity.id },
      data: { whatsappVerifiedAt: now, linkCode: null, linkCodeExpiresAt: null },
    });
    await ctx.db.auraUser.update({
      where: { id: identity.userId },
      data: { whatsappLinked: true, whatsappE164: input.phoneE164 },
    });

    return { ok: true, userId: identity.userId };
  });
