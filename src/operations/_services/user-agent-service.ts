import { z } from "zod";
import { AuraService } from "@/aura/server/service";
import whatsappBotAgent from "@/operations/ai/agent-user.agent";
import { hydrateUserContext } from "@/operations/ai/nodes/hydration";
import {
  FALLBACK_RESPONSE,
  checkPersonaCompliance,
  getPersonaViolations,
} from "@/operations/ai/nodes/response";
import {
  detectIntentHeuristically,
  detectSelectionNumber,
  extractConstraintsHeuristically,
} from "@/operations/ai/heuristics";
import {
  OryaExtractionPayloadSchema,
  OryaIntentSchema,
  OryaSelectionContextSchema,
  OryaTurnResultSchema,
  type OryaExtractionPayload,
  type OryaIntent,
  type OryaSelectionContext,
  type OryaTurnResult,
} from "@/operations/ai/orya-contracts";
import { detectLanguageDetailed } from "@/lib/i18n/detect";
import { MatchingService } from "./matching-service";
import { MatchService } from "./match-service";
import { KnowledgeGraphService } from "./knowledge-graph-service";
import {
  buildClarificationReply,
  buildExtractionPrompt,
  buildGuardrailRewritePrompt,
  buildIntentPrompt,
  buildMatchPresentationReply,
  buildReplyPrompt,
  buildSelectionConfirmationReply,
  buildSelectionRetryReply,
} from "@/prompts/orya";

const NonSelectionIntentSchema = z.enum([
  "chat",
  "search_provider",
  "search_connection",
  "account",
  "help",
]);

const IntentPayloadSchema = z.object({
  intent: NonSelectionIntentSchema,
  confidence: z.number().min(0).max(1),
  constraints: OryaExtractionPayloadSchema.partial().optional(),
});

const ThreadStateSchema = z.object({
  lastLanguage: z.enum(["FR", "EN"]).optional(),
  lastIntent: OryaIntentSchema.optional(),
  selectionContext: OryaSelectionContextSchema.optional(),
});

type ThreadState = z.infer<typeof ThreadStateSchema>;

export interface TraceStep {
  step: string;
  input: string;
  output: string;
  durationMs: number;
  error?: string;
}

export class UserAgentService extends AuraService {
  async processMessage(
    userId: string,
    text: string,
    trace?: TraceStep[],
  ): Promise<string> {
    const turn = await this.processTurn(userId, text, trace);
    return turn.reply;
  }

  async processMessageWithTrace(
    userId: string,
    text: string,
  ): Promise<OryaTurnResult & { trace: TraceStep[] }> {
    const trace: TraceStep[] = [];
    const turn = await this.processTurn(userId, text, trace);
    return { ...turn, trace };
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

  async processTurn(
    userId: string,
    text: string,
    trace?: TraceStep[],
  ): Promise<OryaTurnResult> {
    const normalizedText = text.trim();
    const hydrationStartedAt = Date.now();
    const context = await hydrateUserContext(userId);

    if (!context) {
      return {
        reply: "Votre compte est suspendu. Veuillez contacter le support.",
        language: "FR",
        intent: "account",
        action: "unsupported",
      };
    }

    const thread = await this.getOrCreateThread(userId);
    const threadState = await this.getThreadState(thread._id);

    const detected = detectLanguageDetailed(normalizedText);
    const language =
      detected.language === "UNKNOWN"
        ? threadState.lastLanguage ?? context.profile.language ?? "FR"
        : detected.language;
    await this.persistLanguage(context.profile.userId, context.profile.language, language);

    const profileSummary = this.buildProfileSummary(
      context.profile,
      context.services,
    );

    trace?.push({
      step: "HydrationNode",
      input: `userId:${userId}`,
      output: `lang:${language} services:${context.services.length}`,
      durationMs: Date.now() - hydrationStartedAt,
    });

    const selectionRank = detectSelectionNumber(
      normalizedText,
      threadState.selectionContext?.options.length ?? 0,
    );
    if (selectionRank) {
      const turn = await this.handleSelectionIntent({
        userId,
        language,
        selectionRank,
        threadId: thread._id,
        selectionContext: threadState.selectionContext,
        trace,
      });
      return OryaTurnResultSchema.parse(turn);
    }

    const intentStartedAt = Date.now();
    const intent = await this.detectIntent(
      normalizedText,
      language,
      Boolean(threadState.selectionContext),
      trace,
    );
    trace?.push({
      step: "MatchingIntentNode",
      input: normalizedText.slice(0, 120),
      output: `${intent.intent} (${intent.confidence.toFixed(2)})`,
      durationMs: Date.now() - intentStartedAt,
    });

    if (intent.intent === "search_provider" || intent.intent === "search_connection") {
      const turn = await this.handleMatchingIntent({
        userId,
        language,
        text: normalizedText,
        contextSummary: profileSummary,
        threadId: thread._id,
        intent: intent.intent,
        intentConstraints: intent.constraints,
        trace,
      });
      return OryaTurnResultSchema.parse(turn);
    }

    const reply = await this.generateReply(
      thread,
      language,
      profileSummary,
      normalizedText,
      context.profile.isProvider,
      trace,
    );

    await this.saveThreadState(thread._id, {
      ...threadState,
      lastIntent: intent.intent,
      lastLanguage: language,
      selectionContext: undefined,
    });

    return OryaTurnResultSchema.parse({
      reply,
      language,
      intent: intent.intent,
      action: intent.intent === "account" || intent.intent === "help"
        ? "chat_reply"
        : "chat_reply",
    });
  }

  async detectIntent(
    text: string,
    language: "FR" | "EN",
    hasSelectionContext: boolean,
    trace?: TraceStep[],
  ): Promise<{
    intent: Exclude<OryaIntent, "selection">;
    confidence: number;
    constraints?: Partial<OryaExtractionPayload>;
  }> {
    const heuristic = detectIntentHeuristically({ text, hasSelectionContext });
    if (heuristic.intent !== "selection" && heuristic.confidence >= 0.88) {
      return {
        intent: heuristic.intent,
        confidence: heuristic.confidence,
        constraints: heuristic.constraints,
      };
    }

    const startedAt = Date.now();
    try {
      const thread = await this.agent.createThread(whatsappBotAgent, {
        userId: "system",
      });
      const response = await this.agent.generateText(thread, {
        prompt: buildIntentPrompt(text, language),
      });

      trace?.push({
        step: "detectIntent.LLM",
        input: text.slice(0, 120),
        output: response.content.slice(0, 200),
        durationMs: Date.now() - startedAt,
      });

      const parsed = IntentPayloadSchema.safeParse(
        this.parseJsonPayload(response.content),
      );
      if (parsed.success && parsed.data.confidence >= 0.7) {
        return parsed.data;
      }
    } catch (error) {
      trace?.push({
        step: "detectIntent.LLM",
        input: text.slice(0, 120),
        output: "heuristic fallback",
        durationMs: Date.now() - startedAt,
        error: String(error),
      });
    }

    return {
      intent:
        heuristic.intent === "selection" ? "chat" : heuristic.intent,
      confidence: heuristic.confidence,
      constraints: heuristic.constraints,
    };
  }

  async extractEntities(
    threadId: string,
    text: string,
    language: "FR" | "EN",
    contextSummary: string,
    trace?: TraceStep[],
  ): Promise<OryaExtractionPayload> {
    const heuristic = extractConstraintsHeuristically(text);
    const thread = { _id: threadId, _agentName: whatsappBotAgent._name } as const;

    for (let attempt = 0; attempt < 3; attempt++) {
      const startedAt = Date.now();
      try {
        const response = await this.agent.generateText(thread, {
          prompt: buildExtractionPrompt(text, contextSummary, language),
        });
        trace?.push({
          step: `ExtractionNode.LLM#${attempt + 1}`,
          input: text.slice(0, 120),
          output: response.content.slice(0, 200),
          durationMs: Date.now() - startedAt,
        });

        const parsed = OryaExtractionPayloadSchema.safeParse(
          this.parseJsonPayload(response.content),
        );
        if (parsed.success) {
          return this.mergeExtraction(heuristic, parsed.data);
        }
      } catch (error) {
        trace?.push({
          step: `ExtractionNode.LLM#${attempt + 1}`,
          input: text.slice(0, 120),
          output: "heuristic fallback",
          durationMs: Date.now() - startedAt,
          error: String(error),
        });
      }
    }

    return heuristic;
  }

  private async handleMatchingIntent(args: {
    userId: string;
    language: "FR" | "EN";
    text: string;
    contextSummary: string;
    threadId: string;
    intent: "search_provider" | "search_connection";
    intentConstraints?: Partial<OryaExtractionPayload>;
    trace?: TraceStep[];
  }): Promise<OryaTurnResult> {
    const extraction = await this.extractEntities(
      args.threadId,
      args.text,
      args.language,
      args.contextSummary,
      args.trace,
    );

    await this.persistExtraction(args.userId, extraction);

    const merged = this.mergeExtraction(extraction, args.intentConstraints);
    const missing = this.getMissingMatchingFields(merged, args.language);
    if (missing.length > 0) {
      args.trace?.push({
        step: "OrchestratorCallNode",
        input: args.intent,
        output: `missing:${missing.join(",")}`,
        durationMs: 0,
      });

      await this.saveThreadState(args.threadId, {
        lastIntent: args.intent,
        lastLanguage: args.language,
        selectionContext: undefined,
      });

      return {
        reply: buildClarificationReply(args.language, missing),
        language: args.language,
        intent: args.intent,
        action: "clarify",
        extraction: merged,
      };
    }

    const startedAt = Date.now();
    const matchingService = new MatchingService(this.ctx);
    const result = await matchingService.runQuery(
      args.userId,
      args.text,
      {
        skills: merged.skills,
        location: merged.location,
        industry: merged.industry,
        budgetMaxXaf: merged.budgetMaxXaf,
      },
      5,
    );

    const matches = result.profiles.map((profile, index) => ({
      rank: index + 1,
      userId: profile.userId,
      alias: profile.alias ?? profile.displayName ?? `profil-${index + 1}`,
      summary: this.buildMatchSummary(profile),
      reason: this.buildMatchReason(profile, merged, args.language),
      score: profile.score,
    }));

    args.trace?.push({
      step: "OrchestratorCallNode",
      input: args.text.slice(0, 120),
      output: `candidates:${matches.length}`,
      durationMs: Date.now() - startedAt,
    });

    if (matches.length === 0) {
      await this.saveThreadState(args.threadId, {
        lastIntent: args.intent,
        lastLanguage: args.language,
        selectionContext: undefined,
      });

      return {
        reply:
          args.language === "EN"
            ? "I did not find a suitable profile yet. Please broaden the service, city, or budget criteria and I will try again."
            : "Je n'ai pas encore trouve de profil pertinent. Vous pouvez elargir le service, la ville ou le budget, et je relancerai la recherche.",
        language: args.language,
        intent: args.intent,
        action: "clarify",
        extraction: merged,
      };
    }

    const selectionContext: OryaSelectionContext = {
      requesterId: args.userId,
      query: args.text,
      matchSessionId: result.matchSessionId,
      options: matches,
      constraints: merged,
    };

    await this.saveThreadState(args.threadId, {
      lastIntent: args.intent,
      lastLanguage: args.language,
      selectionContext,
    });

    return {
      reply: buildMatchPresentationReply({
        language: args.language,
        query: args.text,
        matches,
        extraction: merged,
      }),
      language: args.language,
      intent: args.intent,
      action: "present_matches",
      extraction: merged,
      selectionContext,
      matchSessionId: result.matchSessionId,
    };
  }

  private async handleSelectionIntent(args: {
    userId: string;
    language: "FR" | "EN";
    selectionRank: number;
    threadId: string;
    selectionContext?: OryaSelectionContext;
    trace?: TraceStep[];
  }): Promise<OryaTurnResult> {
    if (!args.selectionContext) {
      return {
        reply:
          args.language === "EN"
            ? "Please describe what kind of person or provider you need, and I will prepare a shortlist."
            : "Expliquez-moi la personne ou le prestataire que vous cherchez, et je preparerai une courte selection.",
        language: args.language,
        intent: "chat",
        action: "clarify",
      };
    }

    const selected =
      args.selectionContext.options[args.selectionRank - 1] ?? null;
    if (!selected) {
      return {
        reply: buildSelectionRetryReply(
          args.language,
          args.selectionContext.options.length,
        ),
        language: args.language,
        intent: "selection",
        action: "clarify",
        selectionContext: args.selectionContext,
      };
    }

    const startedAt = Date.now();
    const matchService = new MatchService(this.ctx);
    await matchService.create(
      args.userId,
      selected.userId,
      args.selectionContext.matchSessionId,
    );

    await this.saveThreadState(args.threadId, {
      lastIntent: "selection",
      lastLanguage: args.language,
      selectionContext: undefined,
    });

    args.trace?.push({
      step: "SelectionNode",
      input: `rank:${args.selectionRank}`,
      output: `match:${selected.userId}`,
      durationMs: Date.now() - startedAt,
    });

    return {
      reply: buildSelectionConfirmationReply(args.language, selected.alias),
      language: args.language,
      intent: "selection",
      action: "create_match_request",
      selectionContext: args.selectionContext,
      matchSessionId: args.selectionContext.matchSessionId,
    };
  }

  private async generateReply(
    thread: { _id: string; _agentName: string },
    language: "FR" | "EN",
    contextSummary: string,
    text: string,
    isProvider: boolean,
    trace?: TraceStep[],
  ): Promise<string> {
    const startedAt = Date.now();
    try {
      const response = await this.agent.generateText(thread, {
        prompt: buildReplyPrompt({
          language,
          contextSummary,
          userMessage: text,
        }),
      });

      trace?.push({
        step: "ConversationNode.LLM",
        input: text.slice(0, 120),
        output: response.content.slice(0, 200),
        durationMs: Date.now() - startedAt,
      });

      return this.applyGuardrail(language, response.content, thread, trace);
    } catch (error) {
      trace?.push({
        step: "ConversationNode.LLM",
        input: text.slice(0, 120),
        output: "rule-based fallback",
        durationMs: Date.now() - startedAt,
        error: String(error),
      });
      return this.buildRuleBasedReply(text, language, isProvider);
    }
  }

  private async applyGuardrail(
    language: "FR" | "EN",
    content: string,
    thread: { _id: string; _agentName: string },
    trace?: TraceStep[],
  ): Promise<string> {
    if (checkPersonaCompliance(content)) return content;

    const startedAt = Date.now();
    let current = content;

    for (let attempt = 0; attempt < 2; attempt++) {
      const violations = getPersonaViolations(current);
      try {
        const retry = await this.agent.generateText(thread, {
          prompt: buildGuardrailRewritePrompt(
            language,
            current,
            violations.join(",") || "persona",
          ),
        });
        current = retry.content;
        if (checkPersonaCompliance(current)) {
          trace?.push({
            step: "ResponseNode.guardrail",
            input: content.slice(0, 100),
            output: current.slice(0, 200),
            durationMs: Date.now() - startedAt,
          });
          return current;
        }
      } catch (error) {
        trace?.push({
          step: "ResponseNode.guardrail",
          input: content.slice(0, 100),
          output: "fallback",
          durationMs: Date.now() - startedAt,
          error: String(error),
        });
        break;
      }
    }

    trace?.push({
      step: "ResponseNode.guardrail",
      input: "failed",
      output: FALLBACK_RESPONSE,
      durationMs: Date.now() - startedAt,
      error: "guardrail_fallback",
    });
    return FALLBACK_RESPONSE;
  }

  private buildProfileSummary(profile: any, services: any[]): string {
    const lines: string[] = [];
    lines.push(`Nom: ${profile.displayName ?? "Non renseigne"}`);
    lines.push(`Bio: ${profile.bio ?? "Non renseignee"}`);
    lines.push(`Localisation: ${profile.locationLabel ?? "Non renseignee"}`);
    if (services.length > 0) {
      lines.push("Ce que cette personne propose :");
      for (const service of services) {
        lines.push(`  - ${service.title} (${service.priceXaf} FCFA)`);
      }
    }
    return lines.join("\n");
  }

  private buildMatchSummary(profile: {
    bio?: string | null;
    services?: Array<{ title: string; priceXaf?: number | null }>;
  }): string {
    const firstService = profile.services?.[0];
    if (firstService?.priceXaf) {
      return `${firstService.title} - a partir de ${firstService.priceXaf} FCFA`;
    }
    if (firstService) return firstService.title;
    return profile.bio ?? "Profil disponible pour une mise en relation";
  }

  private buildMatchReason(
    profile: {
      services?: Array<{ title: string }>;
    },
    extraction: OryaExtractionPayload,
    language: "FR" | "EN",
  ): string {
    const skill = extraction.skills[0] ?? extraction.needs[0];
    const location = extraction.location;
    const matchingService = profile.services?.find((service) =>
      skill
        ? service.title.toLowerCase().includes(skill.toLowerCase())
        : false,
    );

    if (language === "EN") {
      return [
        skill
          ? `Matches the need for ${matchingService?.title ?? skill}`
          : "Relevant profile",
        location ? `in ${location}` : null,
      ]
        .filter(Boolean)
        .join(" ");
    }

    return [
      skill
        ? `Correspond au besoin ${matchingService?.title ?? skill}`
        : "Profil pertinent",
      location ? `a ${location}` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  private buildRuleBasedReply(
    text: string,
    language: "FR" | "EN",
    isProvider: boolean,
  ) {
    const lower = text.toLowerCase();

    if (/\b(bonjour|salut|hello|hi)\b/i.test(lower)) {
      return language === "EN"
        ? "Hello. I am Orya. Tell me what kind of person or provider you need, and I will guide you."
        : "Bonjour. Je suis Orya. Dites-moi le type de personne ou de prestataire que vous cherchez, et je vous guiderai.";
    }

    if (/\b(match|matching|contact|rencontre|conversation)\b/i.test(lower)) {
      return language === "EN"
        ? "I can help you shortlist profiles, send a match request, and open a private conversation once both sides agree."
        : "Je peux vous aider a selectionner des profils, envoyer une demande de mise en relation, puis ouvrir une conversation privee quand les deux parties sont d'accord.";
    }

    if (/\b(service|prestataire|provider|offre)\b/i.test(lower)) {
      return isProvider
        ? "Vous pouvez decrire votre service, votre ville et votre tarif. Je m'en servirai pour mieux vous positionner dans les recherches."
        : language === "EN"
          ? "Describe the service you need, your city, and your budget if you have one."
          : "Decrivez le service dont vous avez besoin, votre ville et votre budget si vous en avez un.";
    }

    return language === "EN"
      ? "Please tell me what you need, where you need it, and any useful budget or context."
      : "Expliquez-moi ce dont vous avez besoin, ou vous en avez besoin, et tout budget ou contexte utile.";
  }

  private mergeExtraction(
    base: Partial<OryaExtractionPayload>,
    extra?: Partial<OryaExtractionPayload>,
  ): OryaExtractionPayload {
    return OryaExtractionPayloadSchema.parse({
      skills: [...(base.skills ?? []), ...(extra?.skills ?? [])],
      needs: [...(base.needs ?? []), ...(extra?.needs ?? [])],
      location: extra?.location ?? base.location,
      industry: extra?.industry ?? base.industry,
      budgetMaxXaf: extra?.budgetMaxXaf ?? base.budgetMaxXaf,
      confidence: Math.max(base.confidence ?? 0, extra?.confidence ?? 0),
    });
  }

  private getMissingMatchingFields(
    extraction: OryaExtractionPayload,
    language: "FR" | "EN",
  ): string[] {
    const missing: string[] = [];
    if (extraction.skills.length === 0 && extraction.needs.length === 0) {
      missing.push(
        language === "EN"
          ? "the service or need"
          : "le service ou le besoin",
      );
    }
    if (!extraction.location) {
      missing.push(language === "EN" ? "the area or city" : "la ville ou la zone");
    }
    return missing;
  }

  private async persistExtraction(
    userId: string,
    extraction: OryaExtractionPayload,
  ) {
    if (extraction.confidence < 0.5) return;

    const graphService = new KnowledgeGraphService(this.ctx);
    for (const skill of extraction.skills) {
      await graphService.upsertEntity(userId, "SKILL", skill, "CONVERSATION");
    }
    for (const need of extraction.needs) {
      await graphService.upsertEntity(userId, "NEED", need, "CONVERSATION");
    }
    if (extraction.location) {
      await graphService.upsertEntity(
        userId,
        "LOCATION",
        extraction.location,
        "CONVERSATION",
      );
    }
    if (extraction.industry) {
      await graphService.upsertEntity(
        userId,
        "INDUSTRY",
        extraction.industry,
        "CONVERSATION",
      );
    }
  }

  private async getOrCreateThread(userId: string) {
    const existing = await this.db.auraAgentThread.findFirst({
      where: {
        userId,
        agentName: whatsappBotAgent._name,
        status: "ACTIVE",
      },
      orderBy: { updatedAt: "desc" },
    });

    if (existing) {
      return {
        _id: existing.id,
        _agentName: whatsappBotAgent._name,
      } as const;
    }

    return this.agent.createThread(whatsappBotAgent, {
      userId,
      title: "Orya conversation",
      metadata: {},
    });
  }

  private async getThreadState(threadId: string): Promise<ThreadState> {
    const thread = await this.db.auraAgentThread.findUnique({
      where: { id: threadId },
      select: { metadata: true },
    });
    const parsed = ThreadStateSchema.safeParse(thread?.metadata ?? {});
    return parsed.success ? parsed.data : {};
  }

  private async saveThreadState(threadId: string, state: ThreadState) {
    await this.db.auraAgentThread.update({
      where: { id: threadId },
      data: {
        metadata: {
          ...state,
          selectionContext: state.selectionContext ?? null,
        },
      },
    });
  }

  private async persistLanguage(
    userId: string,
    current: "FR" | "EN",
    next: "FR" | "EN",
  ) {
    if (current === next) return;
    await this.db.profile.update({
      where: { userId },
      data: { language: next },
    });
  }

  private parseJsonPayload(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      const fenced = raw.match(/```json\s*([\s\S]+?)```/i) ?? raw.match(/```([\s\S]+?)```/);
      if (fenced) return JSON.parse(fenced[1].trim());
      throw new Error("Invalid JSON payload");
    }
  }
}
