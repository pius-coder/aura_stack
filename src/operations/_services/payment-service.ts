import { AuraService } from "@/aura/server/service";
import { getPaymentProvider } from "@/lib/payments/factory";
import { featureFlags } from "@/lib/feature-flags";
import { v4 as uuidv4 } from "uuid";

const PRICES = { BADGE: 10000, BOOST: 1000, PRO: 3000 } as const;

export class PaymentService extends AuraService {
  async initiateCheckout(userId: string, kind: "BADGE" | "BOOST" | "PRO") {
    if (!featureFlags.paymentsEnabled) {
      return { pending: true, message: "Activation prevue prochainement." };
    }

    const idempotencyKey = uuidv4();
    const provider = getPaymentProvider();
    const result = await provider.initiate({ userId, amountXaf: PRICES[kind], kind, idempotencyKey });

    const payment = await this.db.payment.create({
      data: { userId, provider: "fapshi", providerTransId: result.providerTransId, kind, amountXaf: PRICES[kind], status: "PENDING" },
    });

    return { checkoutUrl: result.checkoutUrl, providerTransId: result.providerTransId, paymentId: payment.id };
  }
}
