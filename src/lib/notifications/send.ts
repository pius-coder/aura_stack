import { db } from "@/aura/server/db";
import { whatsAppGateway } from "@/lib/whatsapp";
import { scheduleNotification, type NotificationEvent } from "@/lib/whatsapp/aggregator";
import { t } from "@/lib/i18n/translations";

async function sendToWhatsApp(event: NotificationEvent): Promise<void> {
  const gateway = whatsAppGateway();
  try {
    await gateway.sendText(event.phoneE164, event.body, `notif-${event.category}-${event.userId}-${Date.now()}`);
  } catch {
    // Log failure, notification will be retried by the aggregator
    console.error(`Failed to send notification to ${event.phoneE164}`);
  }
}

export async function notifyMatchRequest(requesterId: string, targetId: string): Promise<void> {
  const target = await db.auraUser.findUnique({ where: { id: targetId }, select: { whatsappE164: true, profile: { select: { language: true } } } });
  if (!target?.whatsappE164) return;
  const lang = target.profile?.language ?? "FR";
  const event: NotificationEvent = {
    userId: targetId,
    phoneE164: target.whatsappE164,
    category: "match",
    title: "Nouvelle demande",
    body: t("match.new_request", lang),
  };
  scheduleNotification(event, sendToWhatsApp);
}

export async function notifyMatchAccepted(requesterId: string, requesterPhone: string, lang: "FR" | "EN"): Promise<void> {
  if (!requesterPhone) return;
  const event: NotificationEvent = {
    userId: requesterId,
    phoneE164: requesterPhone,
    category: "match",
    title: "Demande acceptée",
    body: t("match.accepted", lang),
  };
  scheduleNotification(event, sendToWhatsApp);
}

export async function notifyMatchRefused(requesterId: string, requesterPhone: string, lang: "FR" | "EN"): Promise<void> {
  if (!requesterPhone) return;
  const event: NotificationEvent = {
    userId: requesterId,
    phoneE164: requesterPhone,
    category: "match",
    title: "Demande déclinée",
    body: t("match.refused", lang),
  };
  scheduleNotification(event, sendToWhatsApp);
}

export async function notifyNewMessage(recipientId: string, conversationId: string): Promise<void> {
  const recipient = await db.auraUser.findUnique({ where: { id: recipientId }, select: { whatsappE164: true, profile: { select: { language: true } } } });
  if (!recipient?.whatsappE164) return;
  const lang = recipient.profile?.language ?? "FR";
  const event: NotificationEvent = {
    userId: recipientId,
    phoneE164: recipient.whatsappE164,
    category: "message",
    conversationId,
    title: "Nouveau message",
    body: t("message.new", lang),
  };
  scheduleNotification(event, sendToWhatsApp);
}

export async function notifyPaymentSuccess(userId: string): Promise<void> {
  const user = await db.auraUser.findUnique({ where: { id: userId }, select: { whatsappE164: true, profile: { select: { language: true } } } });
  if (!user?.whatsappE164) return;
  const lang = user.profile?.language ?? "FR";
  const event: NotificationEvent = {
    userId,
    phoneE164: user.whatsappE164,
    category: "payment",
    title: "Paiement confirmé",
    body: t("payment.success", lang),
  };
  scheduleNotification(event, sendToWhatsApp);
}
