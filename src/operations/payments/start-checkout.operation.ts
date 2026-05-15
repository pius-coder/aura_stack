import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { featureFlags } from "@/lib/feature-flags";
import { getPaymentProvider } from "@/lib/payments/factory";
import { v4 as uuidv4 } from "uuid";

const PRICES = { BADGE: 10000, BOOST: 1000, PRO: 3000 } as const;

export default defineOperationFn("payments.start-checkout")
  .action()
  .input(z.object({ kind: z.enum(["BADGE", "BOOST", "PRO"]) }))
  .entities(["Payment"])
  .auth()
  .handler(async ({ ctx, input }) => {
    if (!featureFlags.paymentsEnabled) {
      return { pending: true, message: "Activation prévue prochainement." };
    }
    const idempotencyKey = uuidv4();
    const provider = getPaymentProvider();
    const result = await provider.initiate({ userId: ctx.user.id, amountXaf: PRICES[input.kind], kind: input.kind, idempotencyKey });
    await ctx.db.payment.create({
      data: { userId: ctx.user.id, provider: "fapshi", providerTransId: result.providerTransId, kind: input.kind, amountXaf: PRICES[input.kind], status: "PENDING" },
    });
    return { checkoutUrl: result.checkoutUrl, providerTransId: result.providerTransId };
  });
