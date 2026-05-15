import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";
import { notifyMatchRefused } from "@/lib/notifications/send";

export default defineOperationFn("matches.refuse")
  .mutate()
  .input(z.object({ matchId: z.string() }))
  .entities(["Match"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const match = await ctx.db.match.findUnique({ where: { id: input.matchId } });
    if (!match || match.targetId !== ctx.user.id) throw new AuraError("NOT_FOUND", "Match introuvable.");
    if (match.status !== "PENDING") throw new AuraError("BAD_REQUEST", "Ce match n'est plus en attente.");
    await ctx.db.match.update({ where: { id: input.matchId }, data: { status: "REFUSED" } });

    const requester = await ctx.db.auraUser.findUnique({ where: { id: match.requesterId }, select: { whatsappE164: true, profile: { select: { language: true } } } });
    if (requester?.whatsappE164) {
      const lang = requester.profile?.language ?? "FR";
      await notifyMatchRefused(match.requesterId, requester.whatsappE164, lang).catch(() => {});
    }

    return { ok: true };
  });
