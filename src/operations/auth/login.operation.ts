import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { normalizePhone } from "@/aura/server/auth/phone";
import { verifyPassword } from "@/aura/server/auth/password";
import { createSession } from "@/aura/server/auth/session";
import { enforceRateLimit } from "@/aura/server/rate-limit";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("auth.login")
  .mutate()
  .input(z.object({
    countryCode: z.string(),
    phoneNumber: z.string(),
    password: z.string(),
  }))
  .entities(["AuraUser", "AuraSession"])
  .public()
  .handler(async ({ ctx, input }) => {
    const phone = normalizePhone({ countryCode: input.countryCode, phoneNumber: input.phoneNumber });

    await enforceRateLimit(ctx.db, {
      key: `auth:login:${phone.phoneE164}`,
      limit: 8,
      windowSeconds: 900,
    });

    const identity = await ctx.db.auraPhoneIdentity.findUnique({
      where: { phoneE164: phone.phoneE164 },
      include: { user: { include: { passwordCredential: true } } },
    });

    const valid = await verifyPassword(
      input.password,
      identity?.user?.passwordCredential?.passwordHash,
    );

    if (!identity || !valid || identity.user.disabledAt || identity.user.deletedAt) {
      throw new AuraError("UNAUTHORIZED", "Identifiants invalides.");
    }

    await createSession(ctx, identity.userId);
    return { ok: true };
  });
