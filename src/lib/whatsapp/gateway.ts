export interface WhatsAppGateway {
  sendText(to: string, body: string, idempotencyKey: string): Promise<void>;
  getInstanceState(): Promise<{ state: string }>;
}
