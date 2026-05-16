import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";
import { publishEvent } from "@/aura/server/publish";

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
      this.notify.via("new-message").send({ phoneE164: recipient.whatsappE164, language: lang }).catch(() => {});
    }

    return msg;
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
