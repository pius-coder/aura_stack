import { AuraService } from "@/aura/server/service";

export interface MatchConstraint {
  skills?: string[];
  location?: string;
  industry?: string;
  budgetMaxXaf?: number;
}

export class MatchingService extends AuraService {
  async runQuery(requesterId: string, query: string, constraints?: MatchConstraint, topK = 5) {
    const where: Record<string, any> = {
      isProvider: true,
      status: "ACTIVE",
      userId: { not: requesterId },
    };
    if (constraints?.location) {
      where.locationLabel = { contains: constraints.location, mode: "insensitive" };
    }

    const candidates = await this.db.profile.findMany({
      where,
      include: { services: { where: { isActive: true, deletedAt: null } } },
      take: 50,
    });

    const queryLower = query.toLowerCase();
    const scored = candidates.map((p) => {
      let score = 0.1;
      for (const svc of p.services) {
        if (svc.title.toLowerCase().includes(queryLower)) score += 0.5;
        if (svc.description?.toLowerCase().includes(queryLower)) score += 0.3;
      }
      if (p.isVerified) score *= 1.1;
      return { ...p, score: Math.min(score, 1) };
    }).sort((a, b) => b.score - a.score);

    const top = scored.slice(0, Math.ceil(topK * 0.6));
    const mid = scored.slice(10, 25).slice(0, Math.ceil(topK * 0.3));
    const rest = scored.slice(25).slice(0, 1);
    const results = [...top, ...mid, ...rest].slice(0, topK);

    const session = await this.db.matchSession.create({
      data: {
        requesterId,
        query,
        intent: "search_provider",
        fusedTopN: results.map((r) => ({ userId: r.userId, alias: r.alias, score: r.score })),
        latencyMs: 0,
      },
    });

    return {
      matchSessionId: session.id,
      profiles: results.map((r) => ({
        userId: r.userId,
        alias: r.alias,
        displayName: r.alias,
        bio: r.bio,
        services: r.services.map((s: any) => ({ title: s.title, priceXaf: s.priceXaf })),
        score: r.score,
      })),
    };
  }
}
