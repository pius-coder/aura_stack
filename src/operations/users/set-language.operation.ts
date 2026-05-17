import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { ProfileService } from "@/operations/_services/profile-service";

export default defineOperationFn("users.set-language")
  .mutate()
  .input(z.object({ language: z.enum(["FR", "EN"]) }))
  .entities(["Profile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new ProfileService(ctx);
    return svc.setLanguage(ctx.user.id, input.language);
  });
