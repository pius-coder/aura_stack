import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { PaymentService } from "@/operations/_services/payment-service";

export default defineOperationFn("payments.start-checkout")
  .mutate()
  .input(z.object({ kind: z.enum(["BADGE", "BOOST", "PRO"]) }))
  .entities(["Payment"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new PaymentService(ctx);
    return svc.initiateCheckout(ctx.user.id, input.kind);
  });
