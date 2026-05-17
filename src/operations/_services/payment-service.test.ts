import { describe, it, expect, vi } from "vitest";
import { PaymentService } from "./payment-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

vi.mock("@/lib/payments/factory", () => ({
  getPaymentProvider: vi.fn(() => ({
    initiate: vi.fn(async () => ({
      providerTransId: "tx_1",
      checkoutUrl: "https://checkout.test/pay",
    })),
  })),
}));

vi.mock("@/lib/feature-flags", () => ({
  featureFlags: { paymentsEnabled: true },
}));

describe("PaymentService", () => {
  it("extends AuraService", () => {
    const ctx = {} as unknown as AuraContext;
    const svc = new PaymentService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  describe("initiateCheckout", () => {
    it("returns pending message when payments disabled", async () => {
      const ff = await import("@/lib/feature-flags");
      vi.mocked(ff.featureFlags).paymentsEnabled = false;

      const ctx = {} as unknown as AuraContext;
      const svc = new PaymentService(ctx);
      const result = await svc.initiateCheckout("user_1", "BOOST");
      expect(result.pending).toBe(true);
      expect(result.message).toContain("prochainement");

      vi.mocked(ff.featureFlags).paymentsEnabled = true;
    });

    it("creates payment record and returns checkout info", async () => {
      let createdPayment: any = null;
      const ctx = {
        db: {
          payment: {
            create: async (args: any) => { createdPayment = args.data; return { id: "pay_1", ...args.data }; },
          },
        },
      } as unknown as AuraContext;

      const svc = new PaymentService(ctx);
      const result = await svc.initiateCheckout("user_1", "BADGE");

      expect(result.checkoutUrl).toBe("https://checkout.test/pay");
      expect(result.providerTransId).toBe("tx_1");
      expect(result.paymentId).toBe("pay_1");
      expect(createdPayment.kind).toBe("BADGE");
      expect(createdPayment.amountXaf).toBe(10000);
      expect(createdPayment.status).toBe("PENDING");
    });

    it("uses correct prices per kind", async () => {
      const kinds = [
        { kind: "BADGE", price: 10000 },
        { kind: "BOOST", price: 1000 },
        { kind: "PRO", price: 3000 },
      ] as const;

      for (const { kind, price } of kinds) {
        let createdPayment: any = null;
        const ctx = {
          db: {
            payment: { create: async (args: any) => { createdPayment = args.data; return { id: "pay_1" }; } },
          },
        } as unknown as AuraContext;

        const svc = new PaymentService(ctx);
        await svc.initiateCheckout("user_1", kind);
        expect(createdPayment.amountXaf).toBe(price);
      }
    });
  });
});
