import { AuraService } from "@/aura/server/service";

interface LlmCallData {
  agentName: string;
  userId?: string;
  threadId?: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCost?: number;
  correlationId?: string;
}

export class ObservabilityService extends AuraService {
  async recordLlmCall(data: LlmCallData) {
    return this.db.auraAIUsage.create({
      data: {
        agentName: data.agentName,
        userId: data.userId,
        threadId: data.threadId,
        model: data.model,
        provider: data.provider,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        totalTokens: data.inputTokens + data.outputTokens,
        latencyMs: data.latencyMs,
        estimatedCost: data.estimatedCost,
      },
    });
  }

  async getBusinessMetrics(since: Date) {
    const [activeUsers, totalMatches, acceptedMatches, openConversations, openDisputes, resolvedDisputes] = await Promise.all([
      this.db.auraUser.count({ where: { createdAt: { gte: since }, deletedAt: null } }),
      this.db.match.count({ where: { createdAt: { gte: since } } }),
      this.db.match.count({ where: { status: "ACCEPTED", createdAt: { gte: since } } }),
      this.db.conversation.count({ where: { status: "OPEN" } }),
      this.db.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
      this.db.dispute.count({ where: { status: "RESOLVED" } }),
    ]);

    return {
      activeUsers30d: activeUsers,
      matchRequestsCreated: totalMatches,
      acceptanceRate: totalMatches > 0 ? acceptedMatches / totalMatches : 0,
      openConversations,
      disputesOpen: openDisputes,
      disputesResolved: resolvedDisputes,
    };
  }

  async getAiMetrics(since: Date) {
    const usageByModel = await this.db.$queryRawUnsafe<Array<{ model: string; totalTokens: bigint; count: bigint }>>(
      `SELECT model, SUM("totalTokens") as "totalTokens", COUNT(*) as count FROM "AuraAIUsage" WHERE "createdAt" >= $1 GROUP BY model`,
      since,
    );

    const [highRatings, totalRatings] = await Promise.all([
      this.db.rating.count({ where: { score: { gte: 4 }, createdAt: { gte: since } } }),
      this.db.rating.count({ where: { createdAt: { gte: since } } }),
    ]);

    return {
      tokensByModel: usageByModel,
      positiveRatingRate: totalRatings > 0 ? highRatings / totalRatings : 0,
    };
  }
}
