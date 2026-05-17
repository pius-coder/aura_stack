import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";
import { z } from "zod";
import agentUser from "@/operations/ai/agent-user.agent";
import type {
  KnowledgeEntityType,
  KnowledgeRelationPredicate,
  KnowledgeSource,
} from "@/generated/prisma/enums";

const EntitySchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  status: z.string(),
  source: z.string(),
  metadata: z.any().nullable(),
  embeddingId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const RelationSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  predicate: z.string(),
  strength: z.number().min(0).max(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export class KnowledgeGraphService extends AuraService {
  async upsertEntity(
    userId: string,
    type: KnowledgeEntityType,
    value: string,
    source: KnowledgeSource = "CONVERSATION",
  ) {
    const existing = await this.db.knowledgeEntity.findFirst({
      where: { userId, type, value },
    });

    if (existing) {
      const newConfidence = 1 - (1 - existing.confidence) * (1 - 0.5);
      return this.db.knowledgeEntity.update({
        where: { id: existing.id },
        data: {
          confidence: Math.min(newConfidence, 1),
          status: newConfidence >= 0.5 ? "ACTIVE" : "PENDING_REVIEW",
        },
      });
    }

    return this.db.knowledgeEntity.create({
      data: {
        userId,
        type,
        value,
        source,
        confidence: 0.5,
        status: "ACTIVE",
      },
    });
  }

  async upsertRelation(
    sourceEntityId: string,
    targetEntityId: string,
    predicate: KnowledgeRelationPredicate,
    strength: number,
  ) {
    const [source, target] = await Promise.all([
      this.db.knowledgeEntity.findUnique({ where: { id: sourceEntityId } }),
      this.db.knowledgeEntity.findUnique({ where: { id: targetEntityId } }),
    ]);
    if (!source) throw new AuraError("NOT_FOUND", "Entité source introuvable.");
    if (!target) throw new AuraError("NOT_FOUND", "Entité cible introuvable.");

    return this.db.knowledgeRelation.upsert({
      where: {
        sourceId_targetId_predicate: {
          sourceId: sourceEntityId,
          targetId: targetEntityId,
          predicate,
        },
      },
      create: { sourceId: sourceEntityId, targetId: targetEntityId, predicate, strength },
      update: { strength },
    });
  }

  async traverse(constraints: {
    userId: string;
    skills?: string[];
    location?: string;
    industry?: string;
    depth?: number;
  }) {
    const depth = Math.min(constraints.depth ?? 3, 3);

    const candidates = await this.db.$queryRawUnsafe<Array<{
      userId: string;
      alias: string;
      bio: string | null;
      score: number;
    }>>(
      `WITH RECURSIVE paths AS (
        SELECT e.id, e.user_id, 1 AS depth, e.confidence AS score
        FROM "KnowledgeEntity" e
        WHERE e.user_id != $1 AND e.status = 'ACTIVE'
          ${constraints.skills?.length ? `AND e.type = 'SKILL' AND e.value = ANY($2::text[])` : ""}
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
      constraints.userId,
      constraints.skills ?? [],
      depth,
    );

    return candidates;
  }

  async regenerateEmbedding(entityId: string) {
    const entity = await this.db.knowledgeEntity.findUnique({
      where: { id: entityId },
      include: { embedding: true },
    });
    if (!entity) throw new AuraError("NOT_FOUND", "Entité introuvable.");

    const thread = await this.agent.createThread(agentUser, {});
    const response = await this.agent.generateText(thread, {
      prompt: `Générez un embedding textuel pour l'entité suivante:\nType: ${entity.type}\nValeur: ${entity.value}\nRetournez uniquement un tableau JSON de 1536 floats.`,
    });

    try {
      const embedding = JSON.parse(response.content);
      if (!Array.isArray(embedding) || embedding.length !== 1536) {
        throw new AuraError("VALIDATION_ERROR", "Format d'embedding invalide.");
      }

      await this.db.graphEmbedding.upsert({
        where: { entityId },
        create: { entityId, metadata: { embedding } },
        update: { metadata: { embedding } },
      });

      await this.db.knowledgeEntity.update({
        where: { id: entityId },
        data: { embeddingId: entityId },
      });
    } catch {
      await this.db.knowledgeEntity.update({
        where: { id: entityId },
        data: { status: "PENDING_REVIEW" },
      });
    }
  }

  serializeEntity(entity: unknown): string {
    return JSON.stringify(entity);
  }

  parseEntity(json: string) {
    const parsed = JSON.parse(json);
    return EntitySchema.parse(parsed);
  }

  serializeRelation(relation: unknown): string {
    return JSON.stringify(relation);
  }

  parseRelation(json: string) {
    const parsed = JSON.parse(json);
    return RelationSchema.parse(parsed);
  }
}
