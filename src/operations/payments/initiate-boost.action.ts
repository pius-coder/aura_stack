import { defineOperationFn } from "@/aura/server/operation";
import { PaymentService } from "@/operations/_services/payment-service";

export default defineOperationFn("payments.initiate-boost")
  .mutate()
  .entities(["Payment", "BoostSlot"])
  .auth()
  .handler(async ({ ctx }) => {
    const svc = new PaymentService(ctx);
    return svc.initiateCheckout(ctx.user.id, "BOOST");
  });
