import { defineCommonFn } from "@/aura/server/operation";
import { AuraError } from "@/aura/core/errors";

export default defineCommonFn("withProfile").run(async ({ ctx }) => {
  if (!ctx.user) throw new AuraError("UNAUTHORIZED", "Authentification requise.");
  const profile = await ctx.db.profile.findUnique({ where: { userId: ctx.user.id } });
  if (!profile) throw new AuraError("BAD_REQUEST", "Profil introuvable. Complétez votre inscription.");
  if (profile.status === "SUSPENDED") throw new AuraError("FORBIDDEN", "Votre compte est suspendu.");
});
