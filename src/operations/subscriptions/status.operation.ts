import { defineOperationFn } from "@/aura/server/operation";

export default defineOperationFn("subscriptions.status")
  .query()
  .entities(["Subscription"])
  .auth()
  .handler(async ({ ctx }) => {
    return ctx.db.subscription.findFirst({
      where: { userId: ctx.user.id, status: "ACTIVE", endsAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  });
