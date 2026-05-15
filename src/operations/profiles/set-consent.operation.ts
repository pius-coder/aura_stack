import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("profiles.set-consent")
  .mutate()
  .input(
    z.object({
      privacy: z.boolean(),
      dataProcessing: z.boolean(),
      whatsappComms: z.boolean(),
    }),
  )
  .entities(["Profile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    if (!input.privacy || !input.dataProcessing || !input.whatsappComms) {
      throw new AuraError("BAD_REQUEST", "Tous les consentements sont requis.");
    }
    const now = new Date().toISOString();
    const consent = {
      privacy: { accepted: true, at: now },
      dataProcessing: { accepted: true, at: now },
      whatsappComms: { accepted: true, at: now },
    };
    const profile = await ctx.db.profile.update({
      where: { userId: ctx.user.id },
      data: { consent },
    });
    ctx.invalidate({ entity: "Profile", id: profile.id });
    return profile;
  });
