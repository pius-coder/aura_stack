import { describe, it, expect, vi } from "vitest";
import { UserAgentService } from "./user-agent-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

vi.mock("@/operations/ai/agent-user.agent", () => ({ default: { _name: "ai.agent-user" } }));
vi.mock("@/operations/ai/nodes/hydration", () => ({
  hydrateUserContext: vi.fn(),
}));
vi.mock("@/operations/ai/nodes/response", () => ({
  checkPersonaCompliance: vi.fn(() => true),
  getPersonaViolations: vi.fn(() => []),
  FALLBACK_RESPONSE: "Fallback.",
}));

describe("UserAgentService", () => {
  it("extends AuraService", () => {
    const ctx = {} as unknown as AuraContext;
    const svc = new UserAgentService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  describe("processMessage", () => {
    it("returns suspended message when hydration fails", async () => {
      const { hydrateUserContext } = await import("@/operations/ai/nodes/hydration");
      vi.mocked(hydrateUserContext).mockResolvedValue(null);

      const ctx = {} as unknown as AuraContext;
      const svc = new UserAgentService(ctx);
      const result = await svc.processMessage("user_1", "Bonjour");
      expect(result).toContain("suspendu");
    });

    it("calls agent and returns reply", async () => {
      const { hydrateUserContext } = await import("@/operations/ai/nodes/hydration");
      vi.mocked(hydrateUserContext).mockResolvedValue({
        profile: { userId: "user_1", displayName: "Test", bio: "Bio", language: "FR", isProvider: true, status: "ACTIVE", id: "prof_1", createdAt: new Date(), updatedAt: new Date(), alias: "test", consent: null, isClient: false, isVerified: false, locationLabel: null, photoFileId: null, lat: null, lng: null, ratingAvg: null, ratingCount: 0, verifiedAt: null, warningCount: 0 },
        services: [{ title: "Plomberie", priceXaf: 15000, id: "svc_1", createdAt: new Date(), updatedAt: new Date(), deletedAt: null, description: "", userId: "user_1", isActive: true, availability: "AVAILABLE", zone: null }],
      });

      let generated = false;
      const ctx = {
        db: {
          auraAgentThread: {
            findFirst: vi.fn().mockResolvedValue({ id: "thread_1" }),
            findUnique: vi.fn().mockResolvedValue({ metadata: {} }),
            update: vi.fn().mockResolvedValue({}),
          },
          profile: {
            update: vi.fn().mockResolvedValue({}),
          },
        },
        agent: {
          createThread: vi.fn(async () => ({ _id: "thread_1", _agentName: "ai.agent-user" })),
          generateText: vi
            .fn()
            .mockResolvedValueOnce({
              content: '{"intent":"chat","confidence":0.91}',
            })
            .mockImplementation(async () => {
              generated = true;
              return { content: "Je vous remercie pour votre message." };
            }),
        },
      } as unknown as AuraContext;

      const svc = new UserAgentService(ctx);
      const result = await svc.processMessage("user_1", "Bonjour");
      expect(generated).toBe(true);
      expect(result).toContain("remercie");
    });
  });

  describe("detectIntent", () => {
    it("falls back to heuristics on parse failure", async () => {
      const ctx = {
        agent: {
          createThread: async () => ({ _id: "thread_1", _agentName: "ai.agent-user" }),
          generateText: async () => ({ content: "not json" }),
        },
      } as unknown as AuraContext;
      const svc = new UserAgentService(ctx);
      const result = await svc.detectIntent("bonjour", "FR", false);
      expect(result.intent).toBe("chat");
      expect(result.confidence).toBeGreaterThan(0);
    });
  });
});
