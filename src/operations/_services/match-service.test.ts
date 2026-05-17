import { describe, it, expect } from "vitest";
import { MatchService } from "./match-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

describe("MatchService", () => {
  it("extends AuraService", () => {
    const ctx = {} as AuraContext;
    const svc = new MatchService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  describe("create", () => {
    it("rejects self-match", async () => {
      const ctx = {} as unknown as AuraContext;
      const svc = new MatchService(ctx);
      await expect(svc.create("user_1", "user_1")).rejects.toThrow("vous-même");
    });

    it("rejects duplicate pending match", async () => {
      const ctx = {
        db: { match: { findFirst: async () => ({ id: "existing" }) } },
      } as unknown as AuraContext;
      const svc = new MatchService(ctx);
      await expect(svc.create("user_1", "user_2")).rejects.toThrow("existe déjà");
    });

    it("creates match and notifies target", async () => {
      let notified = false;
      const ctx = {
        db: {
          match: {
            findFirst: async () => null,
            create: async (args: any) => ({ id: "match_1", ...args.data }),
          },
          auraUser: { findUnique: async () => ({ whatsappE164: "+237600000001", profile: { language: "FR" } }) },
        },
        notify: { via: () => ({ send: async () => { notified = true; } }) },
      } as unknown as AuraContext;
      const svc = new MatchService(ctx);
      const result = await svc.create("user_1", "user_2");
      expect(result.id).toBe("match_1");
      expect(notified).toBe(true);
    });
  });

  describe("accept", () => {
    it("accepts pending match and creates conversation", async () => {
      let conversationCreated = false;
      const ctx = {
        db: {
          match: {
            findUnique: async () => ({ id: "match_1", requesterId: "user_1", targetId: "user_2", status: "PENDING" }),
            update: async () => ({}),
          },
          conversation: { create: async () => { conversationCreated = true; } },
          auraUser: { findUnique: async () => null },
        },
        notify: { via: () => ({ send: async () => {} }) },
      } as unknown as AuraContext;
      const svc = new MatchService(ctx);
      const result = await svc.accept("user_2", "match_1");
      expect(result.ok).toBe(true);
      expect(conversationCreated).toBe(true);
    });

    it("rejects non-pending match", async () => {
      const ctx = {
        db: { match: { findUnique: async () => ({ id: "match_1", targetId: "user_2", status: "REFUSED" }) } },
      } as unknown as AuraContext;
      const svc = new MatchService(ctx);
      await expect(svc.accept("user_2", "match_1")).rejects.toThrow("plus en attente");
    });
  });

  describe("refuse", () => {
    it("refuses pending match", async () => {
      let statusUpdated = false;
      const ctx = {
        db: {
          match: {
            findUnique: async () => ({ id: "match_1", requesterId: "user_1", targetId: "user_2", status: "PENDING" }),
            update: async (args: any) => { statusUpdated = args.data.status === "REFUSED"; },
          },
          auraUser: { findUnique: async () => null },
        },
        notify: { via: () => ({ send: async () => {} }) },
      } as unknown as AuraContext;
      const svc = new MatchService(ctx);
      await svc.refuse("user_2", "match_1");
      expect(statusUpdated).toBe(true);
    });
  });

  describe("cancel", () => {
    it("cancels own pending match", async () => {
      const ctx = {
        db: {
          match: {
            findUnique: async () => ({ id: "match_1", requesterId: "user_1", targetId: "user_2", status: "PENDING" }),
            update: async () => ({ status: "CANCELLED" }),
          },
        },
      } as unknown as AuraContext;
      const svc = new MatchService(ctx);
      const result = await svc.cancel("user_1", "match_1");
      expect(result.status).toBe("CANCELLED");
    });
  });

  describe("expirePending", () => {
    it("expires old pending matches", async () => {
      const ctx = {
        db: { match: { updateMany: async () => ({ count: 3 }) } },
      } as unknown as AuraContext;
      const svc = new MatchService(ctx);
      const result = await svc.expirePending();
      expect(result.expired).toBe(3);
    });
  });
});
