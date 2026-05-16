import { AuraService } from "@/aura/server/service";
import whatsappBotAgent from "@/operations/agents/whatsapp-bot.agent";
import { hydrateUserContext } from "@/operations/agent/nodes/hydration";
import { checkPersonaCompliance, FALLBACK_RESPONSE } from "@/operations/agent/nodes/response";
import type { IntentResult } from "@/operations/agent/nodes/matching-intent";

export class UserAgentService extends AuraService {
  async processMessage(userId: string, text: string): Promise<string> {
    const context = await hydrateUserContext(userId);
    if (!context) return "Votre compte est suspendu. Veuillez contacter le support.";

    const lang = context.profile.language ?? "FR";
    const profileSummary = this.buildProfileSummary(context.profile, context.services);

    const intent = await this.detectIntent(text);
    if (intent?.intent === "search_provider" || intent?.intent === "search_connection") {
      return this.handleMatchingIntent(userId, text, profileSummary, lang, intent);
    }

    return this.generateReply(userId, text, profileSummary, lang);
  }

  async hydrateThread(userId: string) {
    const context = await hydrateUserContext(userId);
    if (!context) return null;

    return {
      profile: context.profile,
      services: context.services,
      summary: this.buildProfileSummary(context.profile, context.services),
    };
  }

  async detectIntent(text: string): Promise<IntentResult | null> {
    try {
      const thread = await this.agent.createThread(whatsappBotAgent, { userId: "system" });
      const response = await this.agent.generateText(thread, {
        prompt: `Classifiez l'intention de ce message. Répondez UNIQUEMENT par un JSON valide avec les champs : intent (chat|search_provider|search_connection|account|help), confidence (0-1), constraints (objet optionnel avec skills[], location, industry, budgetMaxXaf). Message : "${text}"`,
      });
      const { IntentSchema } = await import("@/operations/agent/nodes/matching-intent");
      const parsed = IntentSchema.safeParse(JSON.parse(response.content));
      if (parsed.success && parsed.data.confidence >= 0.7) return parsed.data;
      return null;
    } catch {
      return null;
    }
  }

  async extractEntities(userId: string, text: string) {
    try {
      const thread = await this.agent.createThread(whatsappBotAgent, { userId });
      const response = await this.agent.generateText(thread, {
        prompt: `Extrayez les entités du message. Répondez UNIQUEMENT par un JSON valide avec : skills[], locations[], industries[], needs[], confidence (0-1). Message : "${text}"`,
      });
      const { ExtractionSchema } = await import("@/operations/agent/nodes/extraction");
      const parsed = ExtractionSchema.safeParse(JSON.parse(response.content));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async generateReply(userId: string, text: string, contextSummary: string, lang: string): Promise<string> {
    const langInstruction = lang === "EN"
      ? "Respond in formal English (use 'please', 'kindly', no contractions)."
      : "Répondez en français en vouvoyant strictement (vous, votre, vos).";

    const thread = await this.agent.createThread(whatsappBotAgent, { userId });
    const response = await this.agent.generateText(thread, {
      prompt: `Contexte utilisateur :\n${contextSummary}\n\n${langInstruction}\n\nMessage : ${text}`,
    });

    return this.applyGuardrail(response.content, thread);
  }

  private async handleMatchingIntent(userId: string, text: string, contextSummary: string, lang: string, intent: IntentResult) {
    const constraints = intent.constraints;
    const missing: string[] = [];
    if (!constraints?.skills || constraints.skills.length === 0) missing.push("compétences recherchées");
    if (!constraints?.location) missing.push("localisation");

    if (missing.length > 0) {
      return `Je cherche des profils correspondant à votre demande. Pour affiner la recherche, pourriez-vous préciser ${
        missing.join(" et ")
      } ?`;
    }

    return this.generateReply(userId, text, contextSummary, lang);
  }

  private async applyGuardrail(content: string, thread: any): Promise<string> {
    if (checkPersonaCompliance(content)) return content;

    const englishFormal = !/\b(hey|yo|gonna|wanna|gotta|you guys|y'all)\b/i.test(content);

    for (let attempt = 0; attempt < 2; attempt++) {
      const retry = await this.agent.generateText(thread, {
        prompt: `Reformulez en vouvoyant strictement sans tutoiement ni familiarité : ${content}`,
      });
      if (checkPersonaCompliance(retry.content) && englishFormal) return retry.content;
      content = retry.content;
    }

    return FALLBACK_RESPONSE;
  }

  private buildProfileSummary(profile: any, services: any[]): string {
    const lines: string[] = [];
    lines.push(`Nom: ${profile.displayName ?? "Non renseigné"}`);
    lines.push(`Bio: ${profile.bio ?? "Non renseignée"}`);
    lines.push(`Localisation: ${profile.locationLabel ?? "Non renseignée"}`);
    lines.push(`Type: ${profile.isProvider ? "Prestataire" : "Utilisateur"}`);
    if (services.length > 0) {
      lines.push("Services proposés :");
      for (const s of services) {
        lines.push(`  - ${s.title} (${s.priceXaf} FCFA)`);
      }
    }
    return lines.join("\n");
  }
}
