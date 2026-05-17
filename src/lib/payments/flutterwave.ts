import type { PaymentProvider } from "./provider";

export class FlutterwaveProvider implements PaymentProvider {
  async initiate(args: { userId: string; amountXaf: number; kind: string; idempotencyKey: string }) {
    // TODO: implement Flutterwave API integration
    return {
      checkoutUrl: `https://checkout.flutterwave.com/pay/${args.idempotencyKey}`,
      providerTransId: `fw-${args.idempotencyKey}`,
    };
  }

  async getStatus(_providerTransId: string): Promise<"PENDING" | "SUCCEEDED" | "FAILED"> {
    return "PENDING";
  }

  verifyWebhook(_rawBody: string, signature: string): boolean {
    // TODO: implement HMAC verification
    return signature.length > 0;
  }
}
