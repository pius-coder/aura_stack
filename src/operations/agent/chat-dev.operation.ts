import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { hydrateUserContext } from "./nodes/hydration";
import { checkPersonaCompliance, FALLBACK_RESPONSE } from "./nodes/response";
import whatsappBotAgent from "@/operations/agents/whatsapp-bot.agent";

const DEV_USERS = [
  { phone: "+237612345678", name: "Alice (test)", isNew: true },
  { phone: "+237698765432", name: "Bob (test)", isNew: true },
  { phone: "+237655000111", name: "Clara (test)", isNew: true },
];

export default defineOperationFn("agent.chat-dev")
  .action()
  .input(z.object({ phoneE164: z.string(), text: z.string().min(1).max(4000) }))
  .entities(["AuraUser", "AuraPhoneIdentity", "Profile"])
  .internal()
  .handler(async ({ ctx, input }) => {
    let user = await ctx.db.auraUser.findFirst({
      where: { phoneIdentities: { some: { phoneE164: input.phoneE164 } } },
      include: { phoneIdentities: { where: { phoneE164: input.phoneE164 } } },
    });

    if (!user) {
      user = await ctx.db.auraUser.create({
        data: {
          whatsappLinked: true,
          whatsappE164: input.phoneE164,
          phoneIdentities: {
            create: {
              countryCode: input.phoneE164.slice(0, 4),
              nationalNumber: input.phoneE164.slice(4),
              phoneE164: input.phoneE164,
              verifiedAt: new Date(),
              whatsappVerifiedAt: new Date(),
            },
          },
          profile: {
            create: {
              alias: `dev-${Math.random().toString(36).slice(2, 10)}`,
              language: "FR",
              status: "ACTIVE",
            },
          },
        },
        include: { phoneIdentities: { where: { phoneE164: input.phoneE164 } }, profile: true },
      });
    }

    const userCtx = await hydrateUserContext(user.id);
    if (!userCtx) return { reply: "Compte suspendu." };

    const thread = await ctx.agent.createThread(whatsappBotAgent, { userId: user.id });
    const response = await ctx.agent.generateText(thread, { prompt: input.text });
    let reply = response.content;
    if (!checkPersonaCompliance(reply)) {
      try {
        const retry = await ctx.agent.generateText(thread, { prompt: "Reformulez en vouvoyant strictement." });
        reply = checkPersonaCompliance(retry.content) ? retry.content : FALLBACK_RESPONSE;
      } catch {
        reply = FALLBACK_RESPONSE;
      }
    }

    return { reply, userId: user.id, isNew: user.profile?.displayName ? false : true };
  });
