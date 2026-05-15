import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("profiles.get-by-alias")
  .query()
  .input(z.object({ alias: z.string() }))
  .entities(["Profile"])
  .public()
  .handler(async ({ ctx, input }) => {
    const profile = await ctx.db.profile.findFirst({ where: { alias: input.alias } });
    if (!profile) throw new AuraError("NOT_FOUND", "Profil introuvable.");

    const services = await ctx.db.service.findMany({
      where: { userId: profile.userId, isActive: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });

    return {
      alias: profile.alias,
      bio: profile.bio,
      locationLabel: profile.locationLabel,
      language: profile.language,
      isVerified: profile.isVerified,
      ratingAvg: profile.ratingAvg,
      ratingCount: profile.ratingCount,
      services,
    };
  });
