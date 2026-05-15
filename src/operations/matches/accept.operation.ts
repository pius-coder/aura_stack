import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("matches.accept")
  .mutate()
  .input(z.object({ matchId: z.string() }))
  .entities(["Match", "Conversation"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const match = await ctx.db.match.findUnique({ where: { id: input.matchId } });
    if (!match || match.targetId !== ctx.user.id) throw new AuraError("NOT_FOUND", "Match introuvable.");
    if (match.status !== "PENDING") throw new AuraError("BAD_REQUEST", "Ce match n'est plus en attente.");

    const updated = await ctx.db.match.update({ where: { id: input.matchId }, data: { status: "ACCEPTED" } });
    const [userA, userB] = [match.requesterId, match.targetId].sort();
    await ctx.db.conversation.create({ data: { userAId: userA, userBId: userB, matchId: match.id } });
    return updated;
  });
