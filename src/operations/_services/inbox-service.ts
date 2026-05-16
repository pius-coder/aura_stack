import { AuraService } from "@/aura/server/service";
import { resolveUserByPhone } from "@/lib/whatsapp/resolve-user";
import { whatsAppGateway } from "@/lib/whatsapp";
import { UserAgentService } from "./user-agent-service";

const LINK_CODE_RE = /^[A-Z0-9]{8}$/;

export class InboxService extends AuraService {

  async processIncoming(inboxId: string): Promise<{
    status: "processed" | "skipped" | "onboarding" | "suspended" | "empty" | "unlinked" | "linkCodeProcessed";
  }> {
    const inbox = await this.db.whatsappInbox.findUnique({ where: { id: inboxId } });
    if (!inbox || inbox.processedAt) return { status: "skipped" };

    const userId = await resolveUserByPhone(this.db, inbox.phoneE164);
    const gateway = whatsAppGateway();
    const markDone = () => this.db.whatsappInbox.update({ where: { id: inboxId }, data: { processedAt: new Date() } });

    if (!userId) {
      await gateway.sendText(inbox.phoneE164, "Bienvenue ! Pour utiliser Orya, inscrivez-vous sur la plateforme.", `onboard-${inboxId}`);
      await markDone();
      return { status: "onboarding" };
    }

    const user = await this.db.auraUser.findUnique({ where: { id: userId }, select: { whatsappLinked: true } });
    const text = this.extractText(inbox.payload);
    if (!text) { await markDone(); return { status: "empty" }; }

    // Link code
    if (LINK_CODE_RE.test(text)) {
      const result = await this.handleLinkCode(inbox.phoneE164, text);
      await gateway.sendText(inbox.phoneE164, result.msg, `link-${inboxId}`);
      await markDone();
      return { status: "linkCodeProcessed" };
    }

    if (!user?.whatsappLinked) {
      await gateway.sendText(inbox.phoneE164, "Veuillez lier votre compte en envoyant le code affiche sur votre tableau de bord.", `unlinked-${inboxId}`);
      await markDone();
      return { status: "unlinked" };
    }

    const userCtx = await this.hydrate(userId);
    if (!userCtx) {
      await gateway.sendText(inbox.phoneE164, "Votre compte est suspendu.", `suspended-${inboxId}`);
      await markDone();
      return { status: "suspended" };
    }

    const reply = await this.generateReply(userId, text);
    await gateway.sendText(inbox.phoneE164, reply, `reply-${inboxId}`);
    await markDone();
    return { status: "processed" };
  }

  private extractText(payload: any): string {
    return payload?.data?.message?.conversation || payload?.data?.message?.extendedTextMessage?.text || "";
  }

  private async handleLinkCode(phoneE164: string, code: string) {
    // Check AuraUser.linkCode first (email-registered users without phone identity yet)
    const user = await this.db.auraUser.findFirst({ where: { linkCode: code } });
    if (user) {
      if (!user.linkCodeExpiresAt || user.linkCodeExpiresAt < new Date()) return { msg: "Ce code a expire." };

      const existingPhone = await this.db.auraPhoneIdentity.findUnique({ where: { phoneE164 } });
      if (existingPhone && existingPhone.userId !== user.id) {
        return { msg: "Ce numero est deja lie a un autre compte." };
      }

      await this.db.auraUser.update({
        where: { id: user.id },
        data: { whatsappLinked: true, whatsappE164: phoneE164, linkCode: null, linkCodeExpiresAt: null },
      });

      // Create phone identity if not exists
      if (!existingPhone) {
        await this.db.auraPhoneIdentity.create({
          data: {
            userId: user.id,
            countryCode: `+${phoneE164.slice(0, 3)}`,
            nationalNumber: phoneE164.slice(3),
            phoneE164,
            verifiedAt: new Date(),
            whatsappVerifiedAt: new Date(),
          },
        });
      }
      return { msg: "Votre compte est desormais lie. Bienvenue sur Orya !" };
    }

    // Fallback: check AuraPhoneIdentity.linkCode (existing users with pre-linked phone)
    const identity = await this.db.auraPhoneIdentity.findFirst({ where: { linkCode: code, phoneE164 } });
    if (!identity) return { msg: "Ce code est invalide." };
    if (!identity.linkCodeExpiresAt || identity.linkCodeExpiresAt < new Date()) return { msg: "Ce code a expire." };

    await this.db.auraPhoneIdentity.update({
      where: { id: identity.id },
      data: { whatsappVerifiedAt: new Date(), linkCode: null, linkCodeExpiresAt: null },
    });
    await this.db.auraUser.update({
      where: { id: identity.userId },
      data: { whatsappLinked: true, whatsappE164: phoneE164 },
    });
    return { msg: "Votre compte est desormais lie. Bienvenue sur Orya !" };
  }

  private async hydrate(userId: string) {
    const profile = await this.db.profile.findUnique({ where: { userId } });
    if (!profile || profile.status === "SUSPENDED") return null;
    const services = await this.db.service.findMany({ where: { userId, isActive: true, deletedAt: null }, take: 10 });
    return { profile, services };
  }

  private async generateReply(userId: string, text: string) {
    try {
      const agentSvc = new UserAgentService(this.ctx);
      return await agentSvc.processMessage(userId, text);
    } catch {
      return "Je vous prie de m'excuser, je rencontre une difficulté technique. Veuillez réessayer dans un instant.";
    }
  }
}
