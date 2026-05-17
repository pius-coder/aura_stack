import { defineOperationFn } from "@/aura/server/operation";

export default defineOperationFn("users.data-export")
  .query()
  .entities(["AuraUser", "Profile", "ChatMessage", "Match", "Rating", "KnowledgeEntity", "KnowledgeRelation"])
  .auth()
  .handler(async ({ ctx }) => {
    const userId = ctx.user.id;

    const [profile, services, matches, conversations, ratings, entities, relations] = await Promise.all([
      ctx.db.profile.findUnique({ where: { userId } }),
      ctx.db.service.findMany({ where: { userId, deletedAt: null } }),
      ctx.db.match.findMany({
        where: { OR: [{ requesterId: userId }, { targetId: userId }] },
      }),
      ctx.db.conversation.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      }),
      ctx.db.rating.findMany({
        where: { OR: [{ raterId: userId }, { rateeId: userId }] },
      }),
      ctx.db.knowledgeEntity.findMany({ where: { userId } }),
      ctx.db.knowledgeRelation.findMany({
        where: {
          OR: [
            { sourceEntity: { userId } },
            { targetEntity: { userId } },
          ],
        },
      }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      userId,
      profile,
      services,
      matches,
      conversations: conversations.map(c => ({
        ...c,
        messages: c.messages.length,
      })),
      ratings,
      knowledgeEntities: entities,
      knowledgeRelations: relations,
    };

    return exportData;
  });
