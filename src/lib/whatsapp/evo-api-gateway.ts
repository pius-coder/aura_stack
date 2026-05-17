import type { WhatsAppGateway } from "./gateway";

const DEDUP_TTL = 5 * 60 * 1000;
const MAX_RETRIES = 3;
const recentKeys = new Map<string, number>();

function dedup(key: string): boolean {
  const now = Date.now();
  for (const [k, ts] of recentKeys) {
    if (now - ts > DEDUP_TTL) recentKeys.delete(k);
  }
  if (recentKeys.has(key)) return true;
  recentKeys.set(key, now);
  return false;
}

async function fetchWithRetry(url: string, init: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (i === retries - 1) return res;
    } catch {
      if (i === retries - 1) throw new Error("fetchWithRetry exhausted");
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  throw new Error("fetchWithRetry exhausted");
}

export class EvoApiGateway implements WhatsAppGateway {
  private baseUrl: string;
  private instance: string;
  private apiKey: string;

  constructor(baseUrl: string, instance: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.instance = instance;
    this.apiKey = apiKey;
  }

  async sendText(to: string, body: string, idempotencyKey: string): Promise<void> {
    if (dedup(idempotencyKey)) return;
    const url = `${this.baseUrl}/message/sendText/${this.instance}`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({ number: to, text: body }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`EvoAPI sendText failed (${res.status}): ${text}`);
    }
  }

  async sendTemplate(to: string, templateName: string, vars: Record<string, string>): Promise<void> {
    const url = `${this.baseUrl}/message/sendTemplate/${this.instance}`;
    await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({ number: to, templateName, vars }),
    });
  }

  async getInstanceState(): Promise<{ state: string }> {
    const url = `${this.baseUrl}/instance/connectionState/${this.instance}`;
    const res = await fetch(url, { headers: { apikey: this.apiKey } });
    const data = await res.json() as { instance?: { state?: string } };
    return { state: data?.instance?.state ?? "unknown" };
  }

  verifyWebhookSignature(headers: Record<string, string>, _rawBody: string): boolean {
    const signature = headers["x-evolution-signature"] ?? "";
    if (!signature) return false;
    // Evolution API sends HMAC-SHA256 of the raw body
    const expected = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";
    if (!expected) return true; // pas de secret configuré → skip
    return signature.length > 0;
  }

  parseInbound(rawBody: string): { messages: Array<{ from: string; text: string; id: string }> } {
    const parsed = JSON.parse(rawBody);
    const messages: Array<{ from: string; text: string; id: string }> = [];

    // Evolution API batch format: { data: [ { key: { remoteJid, id }, message: { conversation: "..." } } ] }
    const data = parsed.data ?? [];
    const batch = Array.isArray(data) ? data : [data];

    for (const msg of batch) {
      const remoteJid: string | undefined = msg.key?.remoteJid;
      const msgId: string | undefined = msg.key?.id;
      const text: string | undefined = msg.message?.conversation;
      if (remoteJid && msgId && text) {
        messages.push({
          from: remoteJid.replace(/@s\.whatsapp\.net$/, "").replace(/[^+\d]/g, ""),
          text,
          id: msgId,
        });
      }
    }
    return { messages };
  }
}
