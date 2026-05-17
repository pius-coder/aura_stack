import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { ProfileService } from "@/operations/_services/profile-service";

export default defineOperationFn("users.set-region")
  .mutate()
  .input(z.object({ region: z.string().min(1, "Région requise.") }))
  .entities(["Profile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new ProfileService(ctx);
    return svc.setRegion(ctx.user.id, input.region);
  });
