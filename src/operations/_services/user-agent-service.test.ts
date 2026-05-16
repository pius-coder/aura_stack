import { describe, it, expect, vi } from "vitest";
import { UserAgentService } from "./user-agent-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

vi.mock("@/operations/agents/whatsapp-bot.agent", () => ({ default: { _name: "agents.whatsapp-bot" } }));
vi.mock("@/operations/agent/nodes/hydration", () => ({
  hydrateUserContext: vi.fn(),
}));
vi.mock("@/operations/agent/nodes/response", () => ({
  checkPersonaCompliance: vi.fn(() => true),
  FALLBACK_RESPONSE: "Fallback.",
}));

describe("UserAgentService", () => {
  it("extends AuraService", () => {
    const ctx = {} as AuraContext;
    const svc = new UserAgentService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  describe("processMessage", () => {
    it("returns suspended message when hydration fails", async () => {
      const { hydrateUserContext } = await import("@/operations/agent/nodes/hydration");
      vi.mocked(hydrateUserContext).mockResolvedValue(null);

      const ctx = {} as unknown as AuraContext;
      const svc = new UserAgentService(ctx);
      const result = await svc.processMessage("user_1", "Bonjour");
      expect(result).toContain("suspendu");
    });

    it("calls agent and returns reply", async () => {
      const { hydrateUserContext } = await import("@/operations/agent/nodes/hydration");
      vi.mocked(hydrateUserContext).mockResolvedValue({
        profile: { userId: "user_1", displayName: "Test", bio: "Bio", language: "FR", isProvider: true, status: "ACTIVE", id: "prof_1", createdAt: new Date(), updatedAt: new Date(), alias: "test", consent: null, isClient: false, isVerified: false, locationLabel: null, photoFileId: null, lat: null, lng: null, ratingAvg: null, ratingCount: 0, verifiedAt: null, warningCount: 0 },
        services: [{ title: "Plomberie", priceXaf: 15000, id: "svc_1", createdAt: new Date(), updatedAt: new Date(), deletedAt: null, description: "", userId: "user_1", isActive: true, availability: "AVAILABLE", zone: null }],
      });

      let generated = false;
      const ctx = {
        agent: {
          createThread: async () => "thread_1",
          generateText: async () => {
            generated = true;
            return { content: "Je vous remercie pour votre message." };
          },
        },
      } as unknown as AuraContext;

      const svc = new UserAgentService(ctx);
      const result = await svc.processMessage("user_1", "Bonjour");
      expect(generated).toBe(true);
      expect(result).toContain("remercie");
    });
  });

  describe("detectIntent", () => {
    it("returns null on parse failure", async () => {
      const ctx = {
        agent: {
          createThread: async () => "thread_1",
          generateText: async () => ({ content: "not json" }),
        },
      } as unknown as AuraContext;
      const svc = new UserAgentService(ctx);
      const result = await svc.detectIntent("test");
      expect(result).toBeNull();
    });
  });
});
