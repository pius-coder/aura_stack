import { defineHttpAction } from '@/aura/server/http-action';
import { createHmac } from "node:crypto";
import { api } from "@/aura/_generated/api";
import { parseWhatsAppMessage } from "@/lib/whatsapp/canonical-message";

function verifyHmac(headers: Record<string, string>, rawBody: string): boolean {
  const signature = headers["x-evolution-signature"] ?? "";
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!secret) return true;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return signature === expected;
}

// Single handler for all Evolution API events (with or without webhook_by_events)
export default defineHttpAction('/webhooks/whatsapp', 'POST')
  .public()
  .csrf(false)
  .handler(async (ctx, request) => {
    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    for (const [k, v] of request.headers.entries()) headers[k] = v;

    if (!verifyHmac(headers, rawBody)) {
      return new Response('Invalid signature', { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event ?? headers["x-evolution-event"] ?? "messages.upsert";

    if (eventType === "connection.update" || eventType === "CONNECTION_UPDATE") {
      const state = payload.instance?.state ?? payload.state ?? "unknown";
      void ctx.db.whatsappInbox.create({
        data: {
          providerMessageId: `conn-${Date.now()}`,
          phoneE164: "system",
          direction: "IN",
          payload: { event: "connection.update", state },
        },
      }).catch(() => {});
      return new Response('ok', { status: 200 });
    }

    if (eventType === "qrcode.updated" || eventType === "QRCODE_UPDATED") {
      return new Response('ok', { status: 200 });
    }

    const messages = parseWhatsAppMessage(payload);
    const results: Array<{ msgId: string; new: boolean }> = [];

    for (const message of messages) {
      const existing = await ctx.db.whatsappInbox.findUnique({
        where: { providerMessageId: message.providerMessageId },
      });
      if (existing) {
        results.push({ msgId: message.providerMessageId, new: false });
        continue;
      }
      const created = await ctx.db.whatsappInbox.create({
        data: {
          providerMessageId: message.providerMessageId,
          phoneE164: message.phoneE164,
          direction: "IN",
          payload: message,
        },
      });
      ctx.scheduler
        .runAfter(0, api.agent["process-incoming"], { whatsappInboxId: created.id })
        .catch(() => {});
      results.push({ msgId: message.providerMessageId, new: true });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, messages: results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
