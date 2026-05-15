

import { createHmac, randomUUID } from "node:crypto";
import { getAuraSecret } from "./crypto";

/**
 * Publie une invalidation signée vers le serveur broadcast Aura.
 *
 * Appelée automatiquement par le `runner`/`call` après toute mutation réussie,
 * ainsi que par les crons, outbox et webhooks — afin que tous les clients
 * connectés (WebSocket) voient l'invalidation, indépendamment de la source.
 *
 * Le broadcast server doit vérifier :
 *   1. La présence du header `x-aura-signature` (HMAC-SHA256 du body).
 *   2. Le timestamp `x-aura-timestamp` dans une fenêtre de 60 secondes.
 *   3. La signature doit correspondre à `HMAC(secret, timestamp + body)`.
 */

export interface PublishInvalidationOptions {
  keys: readonly string[];
  /** URL du serveur broadcast. Par défaut `AURA_BROADCAST_INTERNAL_URL` ou dérivé de `NEXT_PUBLIC_AURA_WS_URL`. */
  broadcastUrl?: string;
  /** Signal d'abandon pour éviter de bloquer une requête. */
  signal?: AbortSignal;
}

function resolveBroadcastHttpUrl(): string | null {
  const explicit = process.env.AURA_BROADCAST_INTERNAL_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const wsUrl = process.env.VITE_AURA_WS_URL ?? process.env.NEXT_PUBLIC_AURA_WS_URL;
  if (!wsUrl) return null;

  try {
    const parsed = new URL(wsUrl);
    const httpProtocol = parsed.protocol === "wss:" ? "https:" : "http:";
    // /ws → base. Anything else → strip last path segment.
    const base = `${httpProtocol}//${parsed.host}`;
    return base;
  } catch {
    return null;
  }
}

export function signInvalidationPayload(
  body: string,
  timestamp: string,
  secret = getAuraSecret(),
): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function publishInvalidation(
  options: PublishInvalidationOptions,
): Promise<{ ok: boolean; reason?: string }> {
  if (options.keys.length === 0) return { ok: true };

  const baseUrl = options.broadcastUrl ?? resolveBroadcastHttpUrl();
  if (!baseUrl) {
    // No broadcast server configured — silently succeed (dev/test).
    return { ok: true, reason: "broadcast-not-configured" };
  }

  const body = JSON.stringify({
    id: randomUUID(),
    keys: [...new Set(options.keys)],
  });
  const timestamp = String(Date.now());
  const signature = signInvalidationPayload(body, timestamp);

  try {
    const response = await fetch(`${baseUrl}/invalidate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-aura-timestamp": timestamp,
        "x-aura-signature": signature,
      },
      body,
      signal: options.signal,
      // Keep it snappy — broadcast must be fire-and-forget.
      keepalive: true,
    });

    if (!response.ok) {
      return { ok: false, reason: `status-${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    // Do not let broadcast failures block the caller. Log & continue.
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[aura:invalidate] broadcast publish failed:", message);
    return { ok: false, reason: message };
  }
}
