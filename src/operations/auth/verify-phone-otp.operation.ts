import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { enforceRateLimit } from "@/aura/server/rate-limit";
import { consumeOtpChallenge } from "@/aura/server/auth/otp";
import { createSession } from "@/aura/server/auth/session";
import { AuraOtpPurpose } from "@/generated/prisma/enums";
import { generateAlias } from "@/lib/alias";

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
    await enforceRateLimit(ctx.db, {
      key: `otp:verify:${input.challengeId}`,
      limit: 5,
      windowSeconds: 900,
    });

    const result = await consumeOtpChallenge({
      db: ctx.db,
      challengeId: input.challengeId,
      code: input.code,
      purpose: AuraOtpPurpose.LOGIN_PHONE,
    });

    // Find or create user by phone
    let phoneIdentity = await ctx.db.auraPhoneIdentity.findUnique({
      where: { phoneE164: result.phoneE164 },
      include: { user: true },
    });

    let isNewUser = false;

    if (!phoneIdentity) {
      // First login — create user + phone identity + profile
      const user = await ctx.db.auraUser.create({ data: {} });
      phoneIdentity = await ctx.db.auraPhoneIdentity.create({
        data: {
          userId: user.id,
          countryCode: result.phoneE164.slice(0, 4),
          nationalNumber: result.phoneE164.slice(4),
          phoneE164: result.phoneE164,
          verifiedAt: new Date(),
          whatsappVerifiedAt: new Date(),
        },
        include: { user: true },
      });

      // Create minimal profile with alias
      let alias = generateAlias();
      // Ensure uniqueness (retry up to 5 times)
      for (let i = 0; i < 5; i++) {
        const exists = await ctx.db.profile.findUnique({ where: { alias } });
        if (!exists) break;
        alias = generateAlias();
      }
      await ctx.db.profile.create({
        data: { userId: user.id, alias, language: "FR", status: "ACTIVE" },
      });
      isNewUser = true;
    } else {
      // Update verification timestamps
      if (!phoneIdentity.verifiedAt || !phoneIdentity.whatsappVerifiedAt) {
        await ctx.db.auraPhoneIdentity.update({
          where: { id: phoneIdentity.id },
          data: { verifiedAt: new Date(), whatsappVerifiedAt: new Date() },
        });
      }
    }

    await createSession(ctx, phoneIdentity.userId);

    const profile = await ctx.db.profile.findUnique({ where: { userId: phoneIdentity.userId } });

    return {
      userId: phoneIdentity.userId,
      isNewUser,
      hasProfile: !!(profile?.displayName),
    };
  });
