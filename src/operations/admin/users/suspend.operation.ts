import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("admin.users.suspend")
  .mutate()
  .input(z.object({ userId: z.string(), reason: z.string().min(1) }))
  .entities(["Profile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    if (!ctx.user.isAdmin) throw new AuraError("FORBIDDEN", "Admin requis.");
    return ctx.db.profile.update({ where: { userId: input.userId }, data: { status: "SUSPENDED" } });
  });
