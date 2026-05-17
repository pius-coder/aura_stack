import { defineOperationFn } from "@/aura/server/operation";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("subscriptions.cancel")
  .mutate()
  .entities(["Subscription"])
  .auth()
  .handler(async ({ ctx }) => {
    const sub = await ctx.db.subscription.findFirst({
      where: { userId: ctx.user.id, status: "ACTIVE", endsAt: { gt: new Date() } },
    });
    if (!sub) throw new AuraError("NOT_FOUND", "Aucun abonnement actif.");
    return ctx.db.subscription.update({
      where: { id: sub.id },
      data: { status: "CANCELLED" },
    });
  });
