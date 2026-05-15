import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { hydrateUserContext } from "./nodes/hydration";
import { checkPersonaCompliance, FALLBACK_RESPONSE } from "./nodes/response";
import { resolveUserByPhone } from "@/lib/whatsapp/resolve-user";
import { whatsAppGateway } from "@/lib/whatsapp";
import whatsappBotAgent from "@/operations/agents/whatsapp-bot.agent";

const LINK_CODE_RE = /^[A-Z0-9]{8}$/;

export default defineOperationFn("agent.process-incoming")
  .action()
  .input(z.object({ whatsappInboxId: z.string() }))
  .internal()
  .handler(async ({ ctx, input }) => {
    const inbox = await ctx.db.whatsappInbox.findUnique({ where: { id: input.whatsappInboxId } });
    if (!inbox || inbox.processedAt) return { skipped: true };

    const userId = await resolveUserByPhone(ctx.db, inbox.phoneE164);
    const gateway = whatsAppGateway();

    if (!userId) {
      await gateway.sendText(inbox.phoneE164, "Bienvenue ! Pour utiliser Orya, inscrivez-vous sur la plateforme.", `onboard-${inbox.id}`);
      await ctx.db.whatsappInbox.update({ where: { id: inbox.id }, data: { processedAt: new Date() } });
      return { onboarding: true };
    }

    const user = await ctx.db.auraUser.findUnique({ where: { id: userId }, select: { whatsappLinked: true } });

    const payload = inbox.payload as Record<string, any>;
    const messageText = payload?.data?.message?.conversation || payload?.data?.message?.extendedTextMessage?.text || "";
    if (!messageText.trim()) {
      await ctx.db.whatsappInbox.update({ where: { id: inbox.id }, data: { processedAt: new Date() } });
      return { empty: true };
    }

    // Handle link code message
    const trimmed = messageText.trim();
    if (LINK_CODE_RE.test(trimmed)) {
      const op = await ctx.call({ fn: "auth.link-whatsapp" as any, input: { phoneE164: inbox.phoneE164, linkCode: trimmed } }) as any;
      if (op.ok) {
        await gateway.sendText(inbox.phoneE164, "Votre compte est desormais lie. Bienvenue sur Orya !", `linked-${inbox.id}`);
      } else if (op.reason === "CODE_EXPIRED") {
        await gateway.sendText(inbox.phoneE164, "Ce code a expire. Generez-en un nouveau depuis votre tableau de bord.", `expired-${inbox.id}`);
      } else {
        await gateway.sendText(inbox.phoneE164, "Ce code est invalide. Veuillez verifier et reessayer.", `invalid-${inbox.id}`);
      }
      await ctx.db.whatsappInbox.update({ where: { id: inbox.id }, data: { processedAt: new Date() } });
      return { linkCodeProcessed: true };
    }

    // Block non-linked users from using the bot
    if (!user?.whatsappLinked) {
      await gateway.sendText(inbox.phoneE164, "Veuillez lier votre compte en envoyant le code affiche sur votre tableau de bord.", `unlinked-${inbox.id}`);
      await ctx.db.whatsappInbox.update({ where: { id: inbox.id }, data: { processedAt: new Date() } });
      return { unlinked: true };
    }

    const userCtx = await hydrateUserContext(userId);
    if (!userCtx) {
      await gateway.sendText(inbox.phoneE164, "Votre compte est suspendu.", `suspended-${inbox.id}`);
      await ctx.db.whatsappInbox.update({ where: { id: inbox.id }, data: { processedAt: new Date() } });
      return { suspended: true };
    }

    try {
      const thread = await ctx.agent.createThread(whatsappBotAgent, { userId });
      const response = await ctx.agent.generateText(thread, { prompt: messageText });
      let reply = response.content;
      if (!checkPersonaCompliance(reply)) {
        const retry = await ctx.agent.generateText(thread, { prompt: "Reformulez en vouvoyant strictement." });
        reply = checkPersonaCompliance(retry.content) ? retry.content : FALLBACK_RESPONSE;
      }
      await gateway.sendText(inbox.phoneE164, reply, `reply-${inbox.id}`);
    } catch {
      await gateway.sendText(inbox.phoneE164, FALLBACK_RESPONSE, `error-${inbox.id}`);
    }

    await ctx.db.whatsappInbox.update({ where: { id: inbox.id }, data: { processedAt: new Date() } });
    return { processed: true };
  });
