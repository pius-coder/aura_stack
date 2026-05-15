import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("services.create")
  .mutate()
  .input(
    z.object({
      title: z.string().min(1).max(120),
      description: z.string().min(1).max(2000),
      priceXaf: z.number().int().positive(),
      availability: z.enum(["AVAILABLE", "BUSY", "UNAVAILABLE"]).default("AVAILABLE"),
      zone: z.string().max(80).optional(),
    }),
  )
  .entities(["Service", "Profile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const count = await ctx.db.service.count({ where: { userId: ctx.user.id, deletedAt: null } });
    if (count >= 50) throw new AuraError("BAD_REQUEST", "Limite de 50 services atteinte.");

    const service = await ctx.db.service.create({
      data: {
        userId: ctx.user.id,
        title: input.title,
        description: input.description,
        priceXaf: input.priceXaf,
        availability: input.availability,
        zone: input.zone,
      },
    });

    const profile = await ctx.db.profile.findUnique({ where: { userId: ctx.user.id } });
    if (profile && !profile.isProvider) {
      await ctx.db.profile.update({ where: { userId: ctx.user.id }, data: { isProvider: true } });
    }

    return service;
  });
