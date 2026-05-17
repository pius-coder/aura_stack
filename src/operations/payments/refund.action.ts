import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("payments.refund")
  .mutate()
  .input(z.object({ paymentId: z.string() }))
  .entities(["Payment"])
  .auth()
  .handler(async ({ ctx, input }) => {
    if (!ctx.user.isAdmin) throw new AuraError("FORBIDDEN", "Admin requis.");

    const payment = await ctx.db.payment.findUnique({ where: { id: input.paymentId } });
    if (!payment) throw new AuraError("NOT_FOUND", "Paiement introuvable.");

    return ctx.db.payment.update({
      where: { id: input.paymentId },
      data: { status: "REFUNDED" },
    });
  });
