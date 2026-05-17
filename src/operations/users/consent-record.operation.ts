import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { ProfileService } from "@/operations/_services/profile-service";

export default defineOperationFn("users.consent-record")
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
    const svc = new ProfileService(ctx);
    return svc.setConsent(ctx.user.id, input);
  });
