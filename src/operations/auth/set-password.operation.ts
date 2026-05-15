import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { hashPassword } from "@/aura/server/auth/password";

export default defineOperationFn("auth.set-password")
  .mutate()
  .input(z.object({ password: z.string().min(8).max(128) }))
  .entities(["AuraPasswordCredential"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const hash = await hashPassword(input.password);
    await ctx.db.auraPasswordCredential.upsert({
      where: { userId: ctx.user.id },
      create: { userId: ctx.user.id, passwordHash: hash },
      update: { passwordHash: hash },
    });
    return { ok: true };
  });
