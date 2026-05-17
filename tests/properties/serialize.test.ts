import { describe, it, expect } from "vitest";
import { z } from "zod";

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

function serializeEntity(entity: unknown): string {
  return JSON.stringify(entity);
}

function parseEntity(json: string) {
  return EntitySchema.parse(JSON.parse(json));
}

function serializeRelation(relation: unknown): string {
  return JSON.stringify(relation);
}

function parseRelation(json: string) {
  return RelationSchema.parse(JSON.parse(json));
}

describe("Entity round-trip", () => {
  const sampleEntity = {
    id: "ent_1",
    userId: "user_1",
    type: "SKILL",
    value: "Plomberie",
    confidence: 0.8,
    status: "ACTIVE",
    source: "CONVERSATION",
    metadata: null,
    embeddingId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("parseEntity(serializeEntity(e)) === e", () => {
    const serialized = serializeEntity(sampleEntity);
    const parsed = parseEntity(serialized);
    expect(parsed.id).toBe(sampleEntity.id);
    expect(parsed.type).toBe(sampleEntity.type);
    expect(parsed.value).toBe(sampleEntity.value);
    expect(parsed.confidence).toBe(sampleEntity.confidence);
  });

  it("rejects invalid entity", () => {
    expect(() => parseEntity(JSON.stringify({ id: "bad" }))).toThrow();
  });
});

describe("Relation round-trip", () => {
  const sampleRelation = {
    id: "rel_1",
    sourceId: "ent_1",
    targetId: "ent_2",
    predicate: "PROVIDES",
    strength: 0.9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("parseRelation(serializeRelation(r)) === r", () => {
    const serialized = serializeRelation(sampleRelation);
    const parsed = parseRelation(serialized);
    expect(parsed.predicate).toBe(sampleRelation.predicate);
    expect(parsed.strength).toBe(sampleRelation.strength);
  });
});
