import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("ratings.create")
  .mutate()
  .input(z.object({ conversationId: z.string(), score: z.number().int().min(1).max(5), comment: z.string().max(500).optional() }))
  .entities(["Rating", "Profile"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const conv = await ctx.db.conversation.findUnique({ where: { id: input.conversationId } });
    if (!conv) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
    if (conv.userAId !== ctx.user.id && conv.userBId !== ctx.user.id) throw new AuraError("FORBIDDEN", "Accès refusé.");
    const rateeId = conv.userAId === ctx.user.id ? conv.userBId : conv.userAId;
    const existing = await ctx.db.rating.findUnique({ where: { conversationId_raterId: { conversationId: input.conversationId, raterId: ctx.user.id } } });
    if (existing) throw new AuraError("BAD_REQUEST", "Vous avez déjà noté cette conversation.");
    const rating = await ctx.db.rating.create({ data: { conversationId: input.conversationId, raterId: ctx.user.id, rateeId, score: input.score, comment: input.comment } });
    // Update denormalized avg
    const agg = await ctx.db.rating.aggregate({ where: { rateeId }, _avg: { score: true }, _count: true });
    await ctx.db.profile.update({ where: { userId: rateeId }, data: { ratingAvg: agg._avg.score, ratingCount: agg._count } });
    return rating;
  });
