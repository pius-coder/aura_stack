import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { hydrateUserContext } from "./nodes/hydration";
import { checkPersonaCompliance, FALLBACK_RESPONSE } from "./nodes/response";
import { resolveUserByPhone } from "@/lib/whatsapp/resolve-user";
import { whatsAppGateway } from "@/lib/whatsapp";
import whatsappBotAgent from "@/operations/agents/whatsapp-bot.agent";

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
      await gateway.sendText(inbox.phoneE164, "Bienvenue ! Pour utiliser Vibe, inscrivez-vous sur la plateforme.", `onboard-${inbox.id}`);
      await ctx.db.whatsappInbox.update({ where: { id: inbox.id }, data: { processedAt: new Date() } });
      return { onboarding: true };
    }

    const userCtx = await hydrateUserContext(userId);
    if (!userCtx) {
      await gateway.sendText(inbox.phoneE164, "Votre compte est suspendu.", `suspended-${inbox.id}`);
      await ctx.db.whatsappInbox.update({ where: { id: inbox.id }, data: { processedAt: new Date() } });
      return { suspended: true };
    }

    const payload = inbox.payload as Record<string, any>;
    const messageText = payload?.data?.message?.conversation || payload?.data?.message?.extendedTextMessage?.text || "";
    if (!messageText.trim()) {
      await ctx.db.whatsappInbox.update({ where: { id: inbox.id }, data: { processedAt: new Date() } });
      return { empty: true };
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
