import { featureFlags } from "@/lib/feature-flags";

interface WhatsAppGateway {
  sendText(to: string, body: string, idempotencyKey: string): Promise<void>;
  sendTemplate(to: string, templateName: string, vars: Record<string, string>): Promise<void>;
  verifyWebhookSignature(headers: Record<string, string>, rawBody: string): boolean;
}

export class WhatsAppBusinessGateway implements WhatsAppGateway {
  private readonly apiVersion = "v22.0";
  private readonly baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

  async sendText(to: string, body: string, idempotencyKey: string): Promise<void> {
    const token = process.env.WHATSAPP_BUSINESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) throw new Error("WhatsApp Business API non configuré.");

    const response = await fetch(`${this.baseUrl}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });

    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${response.status}`);
    }
  }

  async sendTemplate(to: string, templateName: string, vars: Record<string, string>): Promise<void> {
    const token = process.env.WHATSAPP_BUSINESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) throw new Error("WhatsApp Business API non configuré.");

    const components = [
      {
        type: "body",
        parameters: Object.entries(vars).map(([key, value]) => ({
          type: "text",
          text: value,
          parameter_name: key,
        })),
      },
    ];

    await fetch(`${this.baseUrl}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: templateName, language: { code: "fr" }, components },
      }),
    });
  }

  verifyWebhookSignature(headers: Record<string, string>, _rawBody: string): boolean {
    const signature = headers["x-hub-signature-256"] ?? "";
    return signature.length > 0;
  }
}

export function getWhatsAppGateway(): WhatsAppGateway {
  if (featureFlags.isFreemium || featureFlags.isCommission) {
    return new WhatsAppBusinessGateway();
  }
  const { whatsAppGateway } = require("@/lib/whatsapp");
  return whatsAppGateway();
}
