import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("matches.create")
  .mutate()
  .input(z.object({ targetUserId: z.string(), originSessionId: z.string().optional() }))
  .entities(["Match"])
  .auth()
  .handler(async ({ ctx, input }) => {
    if (input.targetUserId === ctx.user.id) throw new AuraError("BAD_REQUEST", "Impossible de vous matcher vous-même.");
    const existing = await ctx.db.match.findFirst({
      where: { requesterId: ctx.user.id, targetId: input.targetUserId, status: { in: ["PENDING", "ACCEPTED"] } },
    });
    if (existing) throw new AuraError("BAD_REQUEST", "Une demande existe déjà.");
    return ctx.db.match.create({
      data: { requesterId: ctx.user.id, targetId: input.targetUserId, originSessionId: input.originSessionId },
    });
  });
