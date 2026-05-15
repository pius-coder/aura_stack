import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("profiles.set-language")
  .mutate()
  .input(z.object({ language: z.enum(["FR", "EN"]) }))
  .entities(["Profile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    return ctx.db.profile.update({ where: { userId: ctx.user.id }, data: { language: input.language } });
  });
