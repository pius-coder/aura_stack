import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { ProfileService } from "@/operations/_services/profile-service";

export default defineOperationFn("profiles.upsert")
  .mutate()
  .input(z.object({
    displayName: z.string().max(80).optional(),
    bio: z.string().max(1000).optional(),
    locationLabel: z.string().optional(),
  }))
  .entities(["Profile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new ProfileService(ctx);
    return svc.updateProfile(ctx.user.id, input);
  });
