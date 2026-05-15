export interface PaymentProvider {
  initiate(args: { userId: string; amountXaf: number; kind: string; idempotencyKey: string }): Promise<{ checkoutUrl: string; providerTransId: string }>;
  getStatus(providerTransId: string): Promise<"PENDING" | "SUCCEEDED" | "FAILED">;
  verifyWebhook(rawBody: string, signature: string): boolean;
}
