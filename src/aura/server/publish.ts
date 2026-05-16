import { createHmac, randomUUID } from "node:crypto";
import { getAuraSecret } from "./crypto";

export interface PublishEventOptions {
  room: string;
  event: string;
  data?: unknown;
  broadcastUrl?: string;
}

function resolveBroadcastHttpUrl(): string | null {
  const explicit = process.env.AURA_BROADCAST_INTERNAL_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const wsUrl = process.env.VITE_AURA_WS_URL ?? process.env.NEXT_PUBLIC_AURA_WS_URL;
  if (!wsUrl) return null;
  try {
    const parsed = new URL(wsUrl);
    const httpProtocol = parsed.protocol === "wss:" ? "https:" : "http:";
    return `${httpProtocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export async function publishEvent(options: PublishEventOptions): Promise<{ ok: boolean; reason?: string }> {
  const baseUrl = options.broadcastUrl ?? resolveBroadcastHttpUrl();
  if (!baseUrl) return { ok: true, reason: "broadcast-not-configured" };

  const body = JSON.stringify({
    id: randomUUID(),
    room: options.room,
    event: options.event,
    data: options.data,
  });
  const secret = getAuraSecret();
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  try {
    const response = await fetch(`${baseUrl}/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-aura-timestamp": timestamp,
        "x-aura-signature": signature,
      },
      body,
      keepalive: true,
    });
    if (!response.ok) return { ok: false, reason: `status-${response.status}` };
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[aura:publish] failed:", message);
    return { ok: false, reason: message };
  }
}
