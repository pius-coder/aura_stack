import { defineOperationFn } from "@/aura/server/operation";

export default defineOperationFn("matches.list-incoming")
  .query()
  .entities(["Match"])
  .auth()
  .handler(async ({ ctx }) => {
    return ctx.db.match.findMany({
      where: { targetId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { requester: { select: { alias: true, bio: true, locationLabel: true } } },
    });
  });
