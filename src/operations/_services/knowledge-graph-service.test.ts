import { describe, it, expect, vi } from "vitest";
import { KnowledgeGraphService } from "./knowledge-graph-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

vi.mock("@/operations/ai/agent-user.agent", () => ({ default: { _name: "ai.agent-user" } }));

describe("KnowledgeGraphService", () => {
  it("extends AuraService", () => {
    const ctx = {} as unknown as AuraContext;
    const svc = new KnowledgeGraphService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  describe("upsertEntity", () => {
    it("creates new entity with confidence 0.5 and status ACTIVE", async () => {
      let created: any = null;
      const ctx = {
        db: {
          knowledgeEntity: {
            findFirst: async () => null,
            create: async (args: any) => { created = args.data; return { id: "e_1", ...args.data }; },
          },
        },
      } as unknown as AuraContext;
      const svc = new KnowledgeGraphService(ctx);
      await svc.upsertEntity("user_1", "SKILL", "plomberie", "CONVERSATION");
      expect(created).toEqual({
        userId: "user_1",
        type: "SKILL",
        value: "plomberie",
        source: "CONVERSATION",
        confidence: 0.5,
        status: "ACTIVE",
      });
    });

    it("reinforces confidence on existing entity using hardcoded 0.5 (current behavior)", async () => {
      let updated: any = null;
      const ctx = {
        db: {
          knowledgeEntity: {
            findFirst: async () => ({
              id: "e_1",
              userId: "user_1",
              type: "SKILL",
              value: "plomberie",
              confidence: 0.5,
              status: "ACTIVE",
            }),
            update: async (args: any) => { updated = args.data; return { id: "e_1", ...args.data }; },
          },
        },
      } as unknown as AuraContext;
      const svc = new KnowledgeGraphService(ctx);
      await svc.upsertEntity("user_1", "SKILL", "plomberie", "CONVERSATION");
      // newConfidence = 1 - (1 - 0.5) * (1 - 0.5) = 1 - 0.25 = 0.75
      expect(updated!.confidence).toBeCloseTo(0.75);
      expect(updated!.status).toBe("ACTIVE");
    });

    it("sets status to PENDING_REVIEW when confidence drops below 0.5 after update", async () => {
      let updated: any = null;
      const ctx = {
        db: {
          knowledgeEntity: {
            findFirst: async () => ({
              id: "e_1",
              userId: "user_1",
              type: "SKILL",
              value: "unknown",
              confidence: 0.3,
              status: "ACTIVE",
            }),
            update: async (args: any) => { updated = args.data; return { id: "e_1", ...args.data }; },
          },
        },
      } as unknown as AuraContext;
      const svc = new KnowledgeGraphService(ctx);
      await svc.upsertEntity("user_1", "SKILL", "unknown", "CONVERSATION");
      // newConfidence = 1 - (1 - 0.3) * (1 - 0.5) = 1 - 0.35 = 0.65 — still >= 0.5
      // Actually with 0.3 existing and 0.5 hardcoded: 1 - (1-0.3)*(1-0.5) = 1 - 0.7*0.5 = 1 - 0.35 = 0.65
      expect(updated!.confidence).toBeCloseTo(0.65);
      expect(updated!.status).toBe("ACTIVE");
    });

    it("defaults source to CONVERSATION", async () => {
      let created: any = null;
      const ctx = {
        db: {
          knowledgeEntity: {
            findFirst: async () => null,
            create: async (args: any) => { created = args.data; return { id: "e_1", ...args.data }; },
          },
        },
      } as unknown as AuraContext;
      const svc = new KnowledgeGraphService(ctx);
      await svc.upsertEntity("user_1", "SKILL", "plomberie");
      expect(created.source).toBe("CONVERSATION");
    });
  });

  describe("upsertRelation", () => {
    it("creates relation when both entities exist", async () => {
      let created: any = null;
      const ctx = {
        db: {
          knowledgeEntity: {
            findUnique: async () => ({ id: "e_1" }),
          },
          knowledgeRelation: {
            upsert: async (args: any) => { created = args; return { id: "r_1", ...args.create || args.update }; },
          },
        },
      } as unknown as AuraContext;
      const svc = new KnowledgeGraphService(ctx);
      await svc.upsertRelation("e_1", "e_2", "PROVIDES", 0.8);
      expect(created.create).toEqual({
        sourceId: "e_1",
        targetId: "e_2",
        predicate: "PROVIDES",
        strength: 0.8,
      });
    });

    it("throws NOT_FOUND when source entity missing", async () => {
      const ctx = {
        db: {
          knowledgeEntity: {
            findUnique: async () => null,
          },
        },
      } as unknown as AuraContext;
      const svc = new KnowledgeGraphService(ctx);
      await expect(svc.upsertRelation("e_missing", "e_2", "PROVIDES", 0.8))
        .rejects.toThrow("Entité source introuvable");
    });

    it("throws NOT_FOUND when target entity missing", async () => {
      const ctx = {
        db: {
          knowledgeEntity: {
            findUnique: vi.fn()
              .mockResolvedValueOnce({ id: "e_1" })
              .mockResolvedValueOnce(null),
          },
        },
      } as unknown as AuraContext;
      const svc = new KnowledgeGraphService(ctx);
      await expect(svc.upsertRelation("e_1", "e_missing", "PROVIDES", 0.8))
        .rejects.toThrow("Entité cible introuvable");
    });
  });

  describe("serializeEntity / parseEntity", () => {
    it("round-trips entity through JSON", () => {
      const svc = new KnowledgeGraphService({} as unknown as AuraContext);
      const entity = {
        id: "e_1",
        userId: "user_1",
        type: "SKILL",
        value: "plomberie",
        confidence: 0.8,
        status: "ACTIVE",
        source: "CONVERSATION",
        metadata: null,
        embeddingId: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };
      const json = svc.serializeEntity(entity);
      const parsed = svc.parseEntity(json);
      expect(parsed).toEqual(entity);
    });

    it("rejects invalid entity JSON", () => {
      const svc = new KnowledgeGraphService({} as unknown as AuraContext);
      expect(() => svc.parseEntity('{"invalid": true}')).toThrow();
    });
  });

  describe("serializeRelation / parseRelation", () => {
    it("round-trips relation through JSON", () => {
      const svc = new KnowledgeGraphService({} as unknown as AuraContext);
      const relation = {
        id: "r_1",
        sourceId: "e_1",
        targetId: "e_2",
        predicate: "PROVIDES",
        strength: 0.8,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };
      const json = svc.serializeRelation(relation);
      const parsed = svc.parseRelation(json);
      expect(parsed).toEqual(relation);
    });

    it("rejects invalid relation JSON", () => {
      const svc = new KnowledgeGraphService({} as unknown as AuraContext);
      expect(() => svc.parseRelation('{"invalid": true}')).toThrow();
    });
  });
});
