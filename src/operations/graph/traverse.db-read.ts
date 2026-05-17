import { defineDbReadFn } from "@/aura/server/db-read";
import { z } from "zod";

export default defineDbReadFn({
  name: "graph.traverse",
  input: z.object({
    userId: z.string(),
    skills: z.array(z.string()).optional(),
    location: z.string().optional(),
    industry: z.string().optional(),
    depth: z.number().int().min(1).max(3).default(3),
    maxPaths: z.number().int().max(10000).default(10000),
  }),
  output: z.array(z.object({
    userId: z.string(),
    alias: z.string(),
    bio: z.string().nullable(),
    score: z.number(),
  })),
  async execute({ db, input }) {
    const depth = Math.min(input.depth, 3);
    const candidates = await db.$queryRawUnsafe<Array<{
      userId: string;
      alias: string;
      bio: string | null;
      score: number;
    }>>(
      `WITH RECURSIVE paths AS (
        SELECT e.id, e.user_id, 1 AS depth, e.confidence AS score
        FROM "KnowledgeEntity" e
        WHERE e.user_id != $1 AND e.status = 'ACTIVE'
          ${input.skills?.length ? `AND e.type = 'SKILL' AND e.value = ANY($2::text[])` : ""}
        UNION ALL
        SELECT te.id, te.user_id, p.depth + 1,
          p.score * r.strength * pow(0.85, p.depth) AS score
        FROM paths p
        JOIN "KnowledgeRelation" r ON r.source_id = p.id
        JOIN "KnowledgeEntity" te ON te.id = r.target_id
        WHERE p.depth < $3 AND te.status = 'ACTIVE'
      )
      SELECT DISTINCT ON (p.user_id) p.user_id,
        COALESCE(pr.alias, '') AS alias,
        pr.bio,
        MAX(p.score) AS score
      FROM paths p
      JOIN "Profile" pr ON pr.user_id = p.user_id
      WHERE pr.status = 'ACTIVE'
      GROUP BY p.user_id, pr.alias, pr.bio
      ORDER BY score DESC
      LIMIT 50`,
      input.userId,
      input.skills ?? [],
      depth,
    );
    return candidates;
  },
});
