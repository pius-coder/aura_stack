import { describe, it, expect, vi } from "vitest";
import { ObservabilityService } from "./observability-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

describe("ObservabilityService", () => {
  it("extends AuraService", () => {
    const ctx = {} as unknown as AuraContext;
    const svc = new ObservabilityService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  describe("recordLlmCall", () => {
    it("creates AuraAIUsage record with totalTokens = input + output", async () => {
      let created: any = null;
      const ctx = {
        db: {
          auraAIUsage: {
            create: async (args: any) => { created = args.data; return { id: "usage_1", ...args.data }; },
          },
        },
      } as unknown as AuraContext;

      const svc = new ObservabilityService(ctx);
      await svc.recordLlmCall({
        agentName: "test-agent",
        userId: "user_1",
        model: "mistral-large",
        provider: "nvidia",
        inputTokens: 500,
        outputTokens: 150,
        latencyMs: 45000,
        estimatedCost: 0.02,
      });

      expect(created.agentName).toBe("test-agent");
      expect(created.userId).toBe("user_1");
      expect(created.model).toBe("mistral-large");
      expect(created.provider).toBe("nvidia");
      expect(created.inputTokens).toBe(500);
      expect(created.outputTokens).toBe(150);
      expect(created.totalTokens).toBe(650);
      expect(created.latencyMs).toBe(45000);
      expect(created.estimatedCost).toBe(0.02);
    });
  });

  describe("getBusinessMetrics", () => {
    it("returns aggregate KPIs for given period", async () => {
      const ctx = {
        db: {
          auraUser: { count: async () => 100 },
          match: {
            count: vi.fn()
              .mockResolvedValueOnce(50)  // total matches
              .mockResolvedValueOnce(30), // accepted matches
          },
          conversation: { count: async () => 20 },
          dispute: {
            count: vi.fn()
              .mockResolvedValueOnce(3)   // open
              .mockResolvedValueOnce(10), // resolved
          },
        },
      } as unknown as AuraContext;

      const svc = new ObservabilityService(ctx);
      const since = new Date("2025-01-01");
      const metrics = await svc.getBusinessMetrics(since);

      expect(metrics.activeUsers30d).toBe(100);
      expect(metrics.matchRequestsCreated).toBe(50);
      expect(metrics.acceptanceRate).toBe(0.6);
      expect(metrics.openConversations).toBe(20);
      expect(metrics.disputesOpen).toBe(3);
      expect(metrics.disputesResolved).toBe(10);
    });

    it("returns zero acceptance rate when no matches", async () => {
      const ctx = {
        db: {
          auraUser: { count: async () => 0 },
          match: {
            count: vi.fn().mockResolvedValue(0),
          },
          conversation: { count: async () => 0 },
          dispute: {
            count: vi.fn().mockResolvedValue(0),
          },
        },
      } as unknown as AuraContext;

      const svc = new ObservabilityService(ctx);
      const metrics = await svc.getBusinessMetrics(new Date());
      expect(metrics.acceptanceRate).toBe(0);
    });
  });

  describe("getAiMetrics", () => {
    it("returns token usage by model and positive rating rate", async () => {
      const ctx = {
        db: {
          $queryRawUnsafe: async () => [
            { model: "mistral-large", totalTokens: 100000n, count: 50n },
            { model: "gpt-4o-mini", totalTokens: 50000n, count: 100n },
          ],
          rating: {
            count: vi.fn()
              .mockResolvedValueOnce(80)  // high ratings
              .mockResolvedValueOnce(100), // total ratings
          },
        },
      } as unknown as AuraContext;

      const svc = new ObservabilityService(ctx);
      const metrics = await svc.getAiMetrics(new Date("2025-01-01"));

      expect(metrics.tokensByModel).toHaveLength(2);
      expect(metrics.tokensByModel[0].model).toBe("mistral-large");
      expect(metrics.positiveRatingRate).toBe(0.8);
    });

    it("returns zero positive rate when no ratings", async () => {
      const ctx = {
        db: {
          $queryRawUnsafe: async () => [],
          rating: {
            count: vi.fn().mockResolvedValue(0),
          },
        },
      } as unknown as AuraContext;

      const svc = new ObservabilityService(ctx);
      const metrics = await svc.getAiMetrics(new Date());
      expect(metrics.positiveRatingRate).toBe(0);
    });
  });
});
