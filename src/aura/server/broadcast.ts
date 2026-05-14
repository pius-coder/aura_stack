/**
 * Aura Broadcast Server — Hono + Bun
 *
 * Rôle : relai pub/sub pour les invalidations Aura entre les clients
 * connectés (navigateurs/devices). Deux chemins d'émission :
 *
 *   1. WebSocket  : un client (tab A) envoie `{ type: "INVALIDATE", id, keys }`
 *                   → relai aux autres WS. BroadcastChannel gère les autres
 *                   tabs du même navigateur en local, sans round-trip réseau.
 *
 *   2. HTTP POST /invalidate : chemin serveur → serveur, signé HMAC avec
 *                   `AURA_INTERNAL_SECRET`. Utilisé par le runner Aura quand
 *                   une mutation part d'un cron, d'un outbox, d'un RSC — càd
 *                   sans client émetteur. Le body est relayé à tous les WS.
 *
 * Dev  : bun src/aura/server/broadcast.ts
 * Prod : conteneur dédié (voir Dockerfile.broadcast)
 *
 * Env vars :
 *   AURA_BROADCAST_PORT        (default: 3001)
 *   AURA_APP_URL               (default: http://localhost:3000) — CORS origin
 *   AURA_INTERNAL_SECRET       (required en prod) — HMAC pour POST /invalidate
 *   AURA_CSRF_SECRET           (fallback pour le secret HMAC)
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { upgradeWebSocket, websocket } from "hono/bun";

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.AURA_BROADCAST_PORT ?? 3001);
const APP_URL = process.env.AURA_APP_URL ?? "http://localhost:3000";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SIGNATURE_WINDOW_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CLIENTS = 10_000;

function resolveSecret(): string {
  const secret =
    process.env.AURA_INTERNAL_SECRET || process.env.AURA_CSRF_SECRET;
  if (!secret) {
    if (IS_PRODUCTION) {
      throw new Error(
        "[aura:broadcast] AURA_INTERNAL_SECRET est requis en production.",
      );
    }
    return "aura-dev-secret-change-me";
  }
  return secret;
}

const SECRET = resolveSecret();

// ─── Clients ──────────────────────────────────────────────────────────────────

interface WsClient {
  send: (data: string) => void;
  lastPong: number;
}

const clients = new Set<WsClient>();

function fanout(payload: string, except?: WsClient): number {
  let sent = 0;
  for (const client of clients) {
    if (client === except) continue;
    try {
      client.send(payload);
      sent += 1;
    } catch {
      clients.delete(client);
    }
  }
  return sent;
}

// ─── Signature HMAC ──────────────────────────────────────────────────────────

function verifySignature(
  body: string,
  timestamp: string | null,
  signature: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (!timestamp || !signature) return { ok: false, reason: "missing-headers" };

  const tsNumeric = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(tsNumeric)) {
    return { ok: false, reason: "invalid-timestamp" };
  }
  if (Math.abs(Date.now() - tsNumeric) > SIGNATURE_WINDOW_MS) {
    return { ok: false, reason: "timestamp-out-of-window" };
  }

  const expected = createHmac("sha256", SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const providedBuf = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    return { ok: false, reason: "signature-length-mismatch" };
  }
  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return { ok: false, reason: "signature-mismatch" };
  }

  return { ok: true };
}

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono();

app.use(
  "*",
  cors({
    origin: APP_URL,
    allowMethods: ["GET", "POST"],
  }),
);

app.get("/health", (c) =>
  c.json({ ok: true, clients: clients.size, uptime: process.uptime() }),
);

// ─── POST /invalidate — chemin serveur → serveur (cron/outbox/rsc) ────────────

interface InvalidatePayload {
  id?: string;
  keys?: unknown;
}

app.post("/invalidate", async (c) => {
  const raw = await c.req.text();
  const timestamp = c.req.header("x-aura-timestamp") ?? null;
  const signature = c.req.header("x-aura-signature") ?? null;

  const check = verifySignature(raw, timestamp, signature);
  if (!check.ok) {
    return c.json({ ok: false, reason: check.reason }, 403);
  }

  let parsed: InvalidatePayload;
  try {
    parsed = JSON.parse(raw) as InvalidatePayload;
  } catch {
    return c.json({ ok: false, reason: "invalid-json" }, 400);
  }

  if (
    !parsed.id ||
    typeof parsed.id !== "string" ||
    !Array.isArray(parsed.keys) ||
    parsed.keys.some((key) => typeof key !== "string")
  ) {
    return c.json({ ok: false, reason: "invalid-payload" }, 400);
  }

  const payload = JSON.stringify({
    type: "INVALIDATE",
    id: parsed.id,
    keys: parsed.keys,
  });

  const relayed = fanout(payload);
  console.log(
    `[aura:broadcast] /invalidate → ${relayed} client(s) pour [${(parsed.keys as string[]).join(", ")}]`,
  );
  return c.json({ ok: true, relayed });
});

// ─── WebSocket — chemin client → client (comportement historique) ─────────────

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen(_, ws) {
      if (clients.size >= MAX_CLIENTS) {
        try {
          ws.send(JSON.stringify({ type: "ERROR", reason: "server-full" }));
          ws.close();
        } catch {
          /* noop */
        }
        return;
      }
      const client: WsClient = {
        send: (data) => ws.send(data),
        lastPong: Date.now(),
      };
      (ws as unknown as { __client?: WsClient }).__client = client;
      clients.add(client);
      console.log(`[aura:broadcast] Client connecté (total: ${clients.size})`);
    },

    onMessage(event, ws) {
      const client = (ws as unknown as { __client?: WsClient }).__client;
      if (!client) return;

      let msg: { type?: string; id?: string; keys?: unknown };
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (msg.type === "PING") {
        client.lastPong = Date.now();
        ws.send(JSON.stringify({ type: "PONG" }));
        return;
      }

      if (msg.type === "PONG") {
        client.lastPong = Date.now();
        return;
      }

      if (
        msg.type === "INVALIDATE" &&
        typeof msg.id === "string" &&
        Array.isArray(msg.keys) &&
        msg.keys.every((key) => typeof key === "string")
      ) {
        const payload = JSON.stringify({
          type: "INVALIDATE",
          id: msg.id,
          keys: msg.keys,
        });
        const relayed = fanout(payload, client);
        console.log(
          `[aura:broadcast] WS invalidation relayée à ${relayed} client(s) pour [${(msg.keys as string[]).join(", ")}]`,
        );
      }
    },

    onClose(_, ws) {
      const client = (ws as unknown as { __client?: WsClient }).__client;
      if (client) clients.delete(client);
      console.log(
        `[aura:broadcast] Client déconnecté (total: ${clients.size})`,
      );
    },

    onError(_, ws) {
      const client = (ws as unknown as { __client?: WsClient }).__client;
      if (client) clients.delete(client);
      console.log(
        `[aura:broadcast] Client en erreur, retiré (total: ${clients.size})`,
      );
    },
  })),
);

// ─── Heartbeat ────────────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const client of clients) {
    if (now - client.lastPong > HEARTBEAT_INTERVAL_MS * 3) {
      clients.delete(client);
      continue;
    }
    try {
      client.send(JSON.stringify({ type: "PING" }));
    } catch {
      clients.delete(client);
    }
  }
}, HEARTBEAT_INTERVAL_MS);

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal: string) {
  console.log(
    `[aura:broadcast] ${signal} reçu — fermeture de ${clients.size} client(s)`,
  );
  for (const client of clients) {
    try {
      client.send(JSON.stringify({ type: "CLOSING" }));
    } catch {
      /* noop */
    }
  }
  clients.clear();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Export Bun ───────────────────────────────────────────────────────────────

export default {
  port: PORT,
  fetch: app.fetch,
  websocket,
};

console.log(
  `[aura:broadcast] HTTP  http://localhost:${PORT}/invalidate (signé HMAC)`,
);
console.log(`[aura:broadcast] WS    ws://localhost:${PORT}/ws`);
