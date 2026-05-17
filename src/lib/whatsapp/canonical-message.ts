import { z } from "zod";

export const CanonicalWhatsAppMessageSchema = z.object({
  provider: z.enum(["evolution-api", "whatsapp-business"]).default("evolution-api"),
  providerMessageId: z.string().min(1),
  phoneE164: z.string().min(3),
  text: z.string().min(1),
});

export type CanonicalWhatsAppMessage = z.infer<
  typeof CanonicalWhatsAppMessageSchema
>;

function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const normalized = raw
    .replace(/@s\.whatsapp\.net$/, "")
    .replace(/@g\.us$/, "")
    .replace(/[^\d+]/g, "");
  if (normalized.length === 0) return null;
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

function extractText(item: Record<string, unknown>): string | null {
  const msg = item.message as Record<string, unknown> | undefined;
  const text =
    (msg?.conversation as string | undefined) ??
    ((msg?.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined) ??
    (item.text as string | undefined);
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseWhatsAppMessage(
  payload: unknown,
): CanonicalWhatsAppMessage[] {
  const canonical = CanonicalWhatsAppMessageSchema.safeParse(payload);
  if (canonical.success) return [canonical.data];

  const root =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : null;

  const rawItems = Array.isArray(root?.data)
    ? root.data
    : Array.isArray(payload)
      ? payload
      : [];

  const messages: CanonicalWhatsAppMessage[] = [];
  for (const item of rawItems) {
    const phoneE164 = normalizePhone(item?.key?.remoteJid);
    const providerMessageId =
      typeof item?.key?.id === "string" ? item.key.id : null;
    const text = extractText(item);

    if (!phoneE164 || !providerMessageId || !text) continue;
    messages.push({
      provider: "evolution-api",
      providerMessageId,
      phoneE164,
      text,
    });
  }

  return messages;
}

export function parseStoredWhatsAppMessage(
  payload: unknown,
): CanonicalWhatsAppMessage | null {
  const parsed = CanonicalWhatsAppMessageSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
