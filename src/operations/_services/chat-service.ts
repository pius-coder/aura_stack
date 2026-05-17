import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";
import { publishEvent } from "@/aura/server/publish";
import { scheduleNotification } from "@/lib/whatsapp/aggregator";

export class ChatService extends AuraService {
  async sendMessage(userId: string, conversationId: string, body: string) {
    const conv = await this.db.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
    if (conv.userAId !== userId && conv.userBId !== userId) throw new AuraError("FORBIDDEN", "Acces refuse.");
    if (conv.status !== "OPEN") throw new AuraError("BAD_REQUEST", "Conversation fermee.");
    if (body.length > 4000) throw new AuraError("VALIDATION_ERROR", "Message trop long (max 4000 caracteres).");

    const msg = await this.db.chatMessage.create({
      data: { conversationId, senderId: userId, body },
    });

    const recipientId = conv.userAId === userId ? conv.userBId : conv.userAId;
    const recipient = await this.db.auraUser.findUnique({
      where: { id: recipientId },
      select: { whatsappE164: true, profile: { select: { language: true } } },
    });

    void publishEvent({
      room: `conversation:${conversationId}`,
      event: "message:new",
      data: { id: msg.id, senderId: userId, body, createdAt: msg.createdAt.toISOString() },
    });

    void publishEvent({
      room: `user:${recipientId}`,
      event: "message:received",
      data: { conversationId, messageId: msg.id },
    });

    if (recipient?.whatsappE164) {
      const lang = recipient.profile?.language ?? "FR";
      scheduleNotification(
        {
          userId: recipientId,
          phoneE164: recipient.whatsappE164,
          category: "message",
          conversationId,
          title: "new-message",
          body,
        },
        async (event) => {
          await this.notify
            .via("new-message")
            .send({
              phoneE164: event.phoneE164,
              language: lang,
            })
            .catch(() => {});
        },
      );
    }

    return msg;
  }

  async close(userId: string, conversationId: string) {
    const conv = await this.db.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
    if (conv.userAId !== userId && conv.userBId !== userId) throw new AuraError("FORBIDDEN", "Vous n'êtes pas participant.");

    return this.db.conversation.update({
      where: { id: conversationId },
      data: { status: "CLOSED" },
    });
  }

  async sendTyping(userId: string, conversationId: string) {
    const conv = await this.db.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
    if (conv.userAId !== userId && conv.userBId !== userId) throw new AuraError("FORBIDDEN", "Acces refuse.");
    if (conv.status !== "OPEN") throw new AuraError("BAD_REQUEST", "Conversation fermee.");

    void publishEvent({
      room: `conversation:${conversationId}`,
      event: "typing",
      data: { userId },
    });
  }
}
