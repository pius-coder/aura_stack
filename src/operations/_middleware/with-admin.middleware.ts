import { defineCommonFn } from "@/aura/server/operation";
import { AuraError } from "@/aura/core/errors";

export default defineCommonFn("withAdmin").run(async ({ ctx }) => {
  if (!ctx.user) throw new AuraError("UNAUTHORIZED", "Authentification requise.");
  if (!ctx.user.isAdmin) throw new AuraError("FORBIDDEN", "Accès réservé aux administrateurs.");
});
