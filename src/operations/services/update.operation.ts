import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("services.update")
  .mutate()
  .input(
    z.object({
      id: z.string(),
      title: z.string().min(1).max(120).optional(),
      description: z.string().max(2000).optional(),
      priceXaf: z.number().int().positive().optional(),
      availability: z.enum(["AVAILABLE", "BUSY", "UNAVAILABLE"]).optional(),
      zone: z.string().max(80).optional(),
    }),
  )
  .entities(["Service"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = await ctx.db.service.findUnique({ where: { id: input.id } });
    if (!svc || svc.userId !== ctx.user.id) throw new AuraError("NOT_FOUND", "Service introuvable.");

    const { id, ...data } = input;
    return ctx.db.service.update({ where: { id }, data });
  });
