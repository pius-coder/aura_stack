import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";
import { resolveUserByPhone } from "@/lib/whatsapp/resolve-user";
import { whatsAppGateway } from "@/lib/whatsapp";
import { parseStoredWhatsAppMessage } from "@/lib/whatsapp/canonical-message";
import { UserAgentService } from "./user-agent-service";

const LINK_CODE_RE = /^[A-Z0-9]{8}$/;

export class InboxService extends AuraService {

  async processIncoming(inboxId: string): Promise<{
    status: "processed" | "skipped" | "onboarding" | "suspended" | "empty" | "unlinked" | "linkCodeProcessed";
  }> {
    const inbox = await this.db.whatsappInbox.findUnique({ where: { id: inboxId } });
    if (!inbox || inbox.processedAt) return { status: "skipped" };

    const gateway = whatsAppGateway();
    const markDone = () => this.db.whatsappInbox.update({ where: { id: inboxId }, data: { processedAt: new Date() } });
    const canonical = parseStoredWhatsAppMessage(inbox.payload);
    const text = this.extractText(canonical, inbox.payload);
    if (!text) {
      await markDone();
      return { status: "empty" };
    }

    const phoneE164 = canonical?.phoneE164 ?? inbox.phoneE164;

    if (LINK_CODE_RE.test(text)) {
      const result = await this.handleLinkCode(phoneE164, text);
      await gateway.sendText(phoneE164, result.msg, `link-${inboxId}`);
      await markDone();
      return { status: "linkCodeProcessed" };
    }

    const userId = await resolveUserByPhone(this.db, phoneE164);

    if (!userId) {
      await gateway.sendText(phoneE164, "Bienvenue ! Pour utiliser Orya, inscrivez-vous sur la plateforme.", `onboard-${inboxId}`);
      await markDone();
      return { status: "onboarding" };
    }

    const user = await this.db.auraUser.findUnique({ where: { id: userId }, select: { whatsappLinked: true } });

    if (!user?.whatsappLinked) {
      await gateway.sendText(phoneE164, "Veuillez lier votre compte en envoyant le code affiche sur votre tableau de bord.", `unlinked-${inboxId}`);
      await markDone();
      return { status: "unlinked" };
    }

    const userCtx = await this.hydrate(userId);
    if (!userCtx) {
      await gateway.sendText(phoneE164, "Votre compte est suspendu.", `suspended-${inboxId}`);
      await markDone();
      return { status: "suspended" };
    }

    const reply = await this.generateReply(userId, text);
    await gateway.sendText(phoneE164, reply, `reply-${inboxId}`);
    await markDone();
    return { status: "processed" };
  }

  private extractText(
    canonical: { text: string } | null,
    payload: unknown,
  ): string {
    if (canonical?.text) return canonical.text.trim();

    const legacy =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : null;
    const text =
      typeof legacy?.text === "string"
        ? legacy.text
        : typeof legacy?.data === "object" &&
            legacy.data !== null &&
            typeof (legacy.data as Record<string, unknown>).message === "object"
          ? (
              ((legacy.data as Record<string, unknown>).message as Record<string, unknown>)
                .conversation ??
              (((legacy.data as Record<string, unknown>).message as Record<string, unknown>)
                .extendedTextMessage as Record<string, unknown> | undefined)
                ?.text
            )
          : "";

    return typeof text === "string" ? text.trim() : "";
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
            countryCode: phoneE164.slice(0, 4),
            nationalNumber: phoneE164.slice(4),
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
    } catch (error) {
      this.log.error("whatsapp inbox reply failed", {
        inboxUserId: userId,
        error: String(error),
      });
      if (error instanceof AuraError && error.code === "RATE_LIMITED") {
        return "Je recois beaucoup de demandes en ce moment. Merci de patienter quelques instants avant de reessayer.";
      }
      return "Je vous prie de m'excuser, je rencontre une difficulte technique. Veuillez reessayer dans un instant.";
    }
  }
}
