import type { PaymentProvider } from "./provider";
import { FapshiProviderStub } from "./fapshi-stub";

let instance: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!instance) instance = new FapshiProviderStub();
  return instance;
}
