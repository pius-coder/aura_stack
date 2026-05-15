import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { randomBytes } from "node:crypto";

const CODE_LENGTH = 8;
const CODE_EXPIRY_MINUTES = 30;

function generateLinkCode(): string {
  return randomBytes(6)
    .toString("base64url")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);
}

export default defineOperationFn("auth.generate-link-code")
  .mutate()
  .input(z.object({ phoneE164: z.string() }))
  .entities(["AuraPhoneIdentity"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const identity = await ctx.db.auraPhoneIdentity.findUnique({
      where: { phoneE164: input.phoneE164, userId: ctx.user.id },
    });
    if (!identity) return { error: "PHONE_NOT_FOUND" as const };

    const code = generateLinkCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    await ctx.db.auraPhoneIdentity.update({
      where: { id: identity.id },
      data: { linkCode: code, linkCodeExpiresAt: expiresAt },
    });

    return { code, expiresAt: expiresAt.toISOString() };
  });
