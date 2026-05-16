import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";
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

    const user = await this.db.auraUser.findUnique({ where: { id: userId }, select: { whatsappE164: true, profile: { select: { language: true } } } });
    if (user?.whatsappE164) {
      const lang = user.profile?.language ?? "FR";
      this.notify.via("payment-success").send({ phoneE164: user.whatsappE164, language: lang }).catch(() => {});
    }

    return { checkoutUrl: result.checkoutUrl, providerTransId: result.providerTransId, paymentId: payment.id };
  }
}
