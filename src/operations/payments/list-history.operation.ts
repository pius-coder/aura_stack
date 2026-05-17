import { defineOperationFn } from "@/aura/server/operation";

export default defineOperationFn("payments.list-history")
  .query()
  .entities(["Payment"])
  .auth()
  .handler(async ({ ctx }) => {
    return ctx.db.payment.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });
