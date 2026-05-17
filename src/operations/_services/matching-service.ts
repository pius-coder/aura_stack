import { AuraService } from "@/aura/server/service";

export interface MatchConstraint {
  skills?: string[];
  location?: string;
  industry?: string;
  budgetMaxXaf?: number;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function buildSearchTerms(query: string, constraints?: MatchConstraint): string[] {
  const queryTerms = normalizeText(query)
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3)
    .filter((term) => !["je", "qui", "pour", "avec", "dans", "the", "and", "need", "cherche"].includes(term));

  return unique([
    ...(constraints?.skills ?? []).map(normalizeText),
    ...(constraints?.industry ? [normalizeText(constraints.industry)] : []),
    ...queryTerms,
  ]).filter((term) => term.length > 0);
}

export class MatchingService extends AuraService {
  async runQuery(requesterId: string, query: string, constraints?: MatchConstraint, topK = 5) {
    const excludedUserIds = new Set<string>([requesterId]);

    const recentMatches = await this.db.match.findMany({
      where: {
        OR: [{ requesterId }, { targetId: requesterId }],
        status: { in: ["ACCEPTED", "PENDING", "REFUSED"] },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: { requesterId: true, targetId: true },
    });

    for (const m of recentMatches) {
      if (m.requesterId !== requesterId) excludedUserIds.add(m.requesterId);
      if (m.targetId !== requesterId) excludedUserIds.add(m.targetId);
    }

    const where: Parameters<typeof this.db.profile.findMany>[0] extends { where?: infer W } ? W : Record<string, unknown> = {
      isProvider: true,
      status: "ACTIVE",
      userId: { notIn: Array.from(excludedUserIds) },
    };
    if (constraints?.location) {
      where.locationLabel = { contains: constraints.location, mode: "insensitive" };
    }

    const candidates = await this.db.profile.findMany({
      where,
      include: { services: { where: { isActive: true, deletedAt: null } } },
      take: 50,
    });

    const searchTerms = buildSearchTerms(query, constraints);
    const normalizedLocation = normalizeText(constraints?.location);
    const scored = candidates.map((p) => {
      let keywordScore = 0.05;
      const profileBio = normalizeText(p.bio);
      const profileLocation = normalizeText(p.locationLabel);
      let matchedSkillCount = 0;

      if (normalizedLocation && profileLocation.includes(normalizedLocation)) {
        keywordScore += 0.22;
      }

      for (const svc of p.services) {
        const title = normalizeText(svc.title);
        const description = normalizeText(svc.description);

        for (const term of searchTerms) {
          if (title.includes(term)) {
            keywordScore += 0.24;
            matchedSkillCount += 1;
            continue;
          }
          if (description.includes(term)) {
            keywordScore += 0.12;
            continue;
          }
          if (profileBio.includes(term)) {
            keywordScore += 0.05;
          }
        }

        if (
          typeof constraints?.budgetMaxXaf === "number" &&
          svc.priceXaf > 0 &&
          svc.priceXaf <= constraints.budgetMaxXaf
        ) {
          keywordScore += 0.08;
        }
      }

      if (constraints?.skills?.length && matchedSkillCount > 0) {
        keywordScore += Math.min(0.25, matchedSkillCount * 0.08);
      }

      if (p.isVerified) keywordScore += 0.06;

      return { ...p, score: Math.min(keywordScore, 1) };
    }).sort((a, b) => b.score - a.score);

    const boostSlots = new Set<string>();
    const activeBoosts = await this.db.boostSlot.findMany({
      where: { status: "ACTIVE", startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
      select: { userId: true },
    });
    for (const b of activeBoosts) boostSlots.add(b.userId);

    const finalList: Array<typeof scored[number]> = [];
    const usedIds = new Set<string>();

    for (const c of scored) {
      if (boostSlots.has(c.userId) && finalList.length < 3) {
        finalList.push(c);
        usedIds.add(c.userId);
      }
    }

    const sorted = scored.filter((c) => !usedIds.has(c.userId));
    const highEnd = sorted.slice(0, Math.ceil(sorted.length * 0.6)).slice(0, Math.ceil(topK * 0.6));
    const mid = sorted.slice(Math.floor(sorted.length * 0.3), Math.floor(sorted.length * 0.7)).slice(0, Math.ceil(topK * 0.3));
    const wildcard = sorted.slice(-1).slice(0, 1);

    const results = [...finalList, ...highEnd, ...mid, ...wildcard]
      .filter((c, i, arr) => arr.findIndex((x) => x.userId === c.userId) === i)
      .slice(0, topK);

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
        services: r.services.map((s) => ({ title: s.title, priceXaf: s.priceXaf })),
        score: r.score,
      })),
    };
  }
}
