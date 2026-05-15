import type { PaymentProvider } from "./provider";
import { featureFlags } from "@/lib/feature-flags";

export class FapshiProviderStub implements PaymentProvider {
  async initiate(args: { userId: string; amountXaf: number; kind: string; idempotencyKey: string }) {
    if (!featureFlags.paymentsEnabled) {
      throw new Error("Les paiements ne sont pas encore actifs.");
    }
    const providerTransId = `fapshi_stub_${args.idempotencyKey}`;
    return { checkoutUrl: `https://fapshi.com/pay/${providerTransId}`, providerTransId };
  }

  async getStatus(_providerTransId: string) {
    return "PENDING" as const;
  }

  verifyWebhook(_rawBody: string, signature: string): boolean {
    return signature === process.env.FAPSHI_WEBHOOK_SECRET;
  }
}
