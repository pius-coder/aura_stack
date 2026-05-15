import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("matching.run")
  .action()
  .input(z.object({
    requesterId: z.string(),
    query: z.string(),
    constraints: z.object({
      skills: z.array(z.string()).optional(),
      location: z.string().optional(),
      industry: z.string().optional(),
      budgetMaxXaf: z.number().optional(),
    }).optional(),
    topK: z.number().int().min(1).max(10).default(5),
  }))
  .internal()
  .handler(async ({ ctx, input }) => {
    // V1: simple DB-based matching (no pgvector yet)
    const where: Record<string, any> = {
      isProvider: true,
      status: "ACTIVE",
      userId: { not: input.requesterId },
    };
    if (input.constraints?.location) {
      where.locationLabel = { contains: input.constraints.location, mode: "insensitive" };
    }

    const candidates = await ctx.db.profile.findMany({
      where,
      include: { services: { where: { isActive: true, deletedAt: null } } },
      take: 50,
    });

    // Score: simple keyword match on services
    const queryLower = input.query.toLowerCase();
    const scored = candidates.map((p) => {
      let score = 0.1;
      for (const svc of p.services) {
        if (svc.title.toLowerCase().includes(queryLower)) score += 0.5;
        if (svc.description.toLowerCase().includes(queryLower)) score += 0.3;
      }
      if (p.isVerified) score *= 1.1;
      return { ...p, score: Math.min(score, 1) };
    }).sort((a, b) => b.score - a.score);

    // Diversity: 60% top, 30% mid, 10% random
    const top = scored.slice(0, Math.ceil(input.topK * 0.6));
    const mid = scored.slice(10, 25).slice(0, Math.ceil(input.topK * 0.3));
    const rest = scored.slice(25).slice(0, 1);
    const results = [...top, ...mid, ...rest].slice(0, input.topK);

    // Log session
    const session = await ctx.db.matchSession.create({
      data: { requesterId: input.requesterId, query: input.query, intent: "search_provider", fusedTopN: results.map((r) => ({ userId: r.userId, alias: r.alias, score: r.score })), latencyMs: 0 },
    });

    return {
      matchSessionId: session.id,
      profiles: results.map((r) => ({
        userId: r.userId,
        alias: r.alias,
        displayName: r.alias, // masked
        bio: r.bio,
        services: r.services.map((s) => ({ title: s.title, priceXaf: s.priceXaf })),
        score: r.score,
      })),
    };
  });
