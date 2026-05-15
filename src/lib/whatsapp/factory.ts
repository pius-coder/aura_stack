import type { WhatsAppGateway } from "./gateway";
import { EvoApiGateway } from "./evo-api-gateway";

let instance: WhatsAppGateway | null = null;

export function whatsAppGateway(): WhatsAppGateway {
  if (!instance) {
    const baseUrl = process.env.EVOLUTION_API_BASE_URL;
    const instanceId = process.env.EVOLUTION_API_INSTANCE_ID;
    const apiKey = process.env.EVOLUTION_API_KEY;
    if (!baseUrl || !instanceId || !apiKey) {
      throw new Error("Missing EVOLUTION_API_* env vars");
    }
    instance = new EvoApiGateway(baseUrl, instanceId, apiKey);
  }
  return instance;
}
