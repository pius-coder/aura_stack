import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("payments.get-status")
  .query()
  .input(z.object({ paymentId: z.string() }))
  .entities(["Payment"])
  .auth()
  .handler(async ({ ctx, input }) => {
    return ctx.db.payment.findFirst({ where: { id: input.paymentId, userId: ctx.user.id } });
  });
