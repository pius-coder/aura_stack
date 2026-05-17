import { defineCommonFn } from "@/aura/server/operation";
import { AuraError } from "@/aura/core/errors";

export default defineCommonFn("withRegionFilter").run(async ({ ctx }) => {
  if (!ctx.user) throw new AuraError("UNAUTHORIZED", "Authentification requise.");
  const profile = await ctx.db.profile.findUnique({
    where: { userId: ctx.user.id },
    select: { locationLabel: true },
  });
  if (!profile?.locationLabel) {
    throw new AuraError("BAD_REQUEST", "Veuillez définir votre région dans votre profil.");
  }
});
