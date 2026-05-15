import { defineOperationFn } from "@/aura/server/operation";

export default defineOperationFn("matches.list-outgoing")
  .query()
  .entities(["Match"])
  .auth()
  .handler(async ({ ctx }) => {
    return ctx.db.match.findMany({
      where: { requesterId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { target: { select: { alias: true, bio: true, locationLabel: true } } },
    });
  });
