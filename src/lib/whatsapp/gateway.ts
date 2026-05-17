export interface WhatsAppGateway {
  sendText(to: string, body: string, idempotencyKey: string): Promise<void>;
  sendTemplate(to: string, templateName: string, vars: Record<string, string>): Promise<void>;
  getInstanceState(): Promise<{ state: string }>;
  verifyWebhookSignature(headers: Record<string, string>, rawBody: string): boolean;
  parseInbound(rawBody: string): { messages: Array<{ from: string; text: string; id: string }> };
}
