import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("matches.cancel")
  .mutate()
  .input(z.object({ matchId: z.string() }))
  .entities(["Match"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const match = await ctx.db.match.findUnique({ where: { id: input.matchId } });
    if (!match || match.requesterId !== ctx.user.id) throw new AuraError("NOT_FOUND", "Match introuvable.");
    if (match.status !== "PENDING") throw new AuraError("BAD_REQUEST", "Seuls les matchs en attente peuvent être annulés.");
    return ctx.db.match.update({ where: { id: input.matchId }, data: { status: "CANCELLED" } });
  });
