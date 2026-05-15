import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("profiles.update")
  .mutate()
  .input(z.object({
    displayName: z.string().max(80).optional(),
    bio: z.string().max(1000).optional(),
    locationLabel: z.string().optional(),
  }))
  .entities(["Profile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    return ctx.db.profile.update({ where: { userId: ctx.user.id }, data: input });
  });
