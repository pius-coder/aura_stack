import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("services.toggle")
  .mutate()
  .input(z.object({ id: z.string() }))
  .entities(["Service"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = await ctx.db.service.findUnique({ where: { id: input.id } });
    if (!svc || svc.userId !== ctx.user.id) throw new AuraError("NOT_FOUND", "Service introuvable.");

    return ctx.db.service.update({ where: { id: input.id }, data: { isActive: !svc.isActive } });
  });
