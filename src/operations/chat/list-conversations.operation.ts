import { defineOperationFn } from "@/aura/server/operation";

export default defineOperationFn("chat.list-conversations")
  .query()
  .entities(["Conversation"])
  .auth()
  .handler(async ({ ctx }) => {
    return ctx.db.conversation.findMany({
      where: { OR: [{ userAId: ctx.user.id }, { userBId: ctx.user.id }] },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
  });
