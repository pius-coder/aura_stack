import { describe, it, expect, vi } from "vitest";
import { DisputeService } from "./dispute-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

describe("DisputeService", () => {
  it("extends AuraService", () => {
    const ctx = {} as unknown as AuraContext;
    const svc = new DisputeService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  describe("report", () => {
    it("throws NOT_FOUND when conversation missing", async () => {
      const ctx = {
        db: { conversation: { findUnique: async () => null } },
      } as unknown as AuraContext;
      const svc = new DisputeService(ctx);
      await expect(svc.report("conv_missing", "user_1", "spam"))
        .rejects.toThrow("Conversation introuvable");
    });

    it("throws FORBIDDEN when reporter is not participant", async () => {
      const ctx = {
        db: { conversation: { findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2", messages: [] }) } },
      } as unknown as AuraContext;
      const svc = new DisputeService(ctx);
      await expect(svc.report("c_1", "user_3", "spam"))
        .rejects.toThrow("Accès refusé");
    });

    it("creates dispute with snapshot and marks conversation as DISPUTED", async () => {
      const convMessages = [{ id: "m1", body: "hello", senderId: "user_1", createdAt: new Date() }];
      let convUpdated = false;
      let disputeCreated: any = null;

      const ctx = {
        db: {
          conversation: {
            findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2", messages: convMessages }),
            update: async () => { convUpdated = true; return {}; },
          },
          dispute: {
            create: async (args: any) => { disputeCreated = args.data; return { id: "d_1", ...args.data }; },
          },
          auraUser: {
            findUnique: async () => null,
          },
        },
        notify: {
          via: vi.fn(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
        },
      } as unknown as AuraContext;

      const svc = new DisputeService(ctx);
      const result = await svc.report("c_1", "user_1", "spam");

      expect(convUpdated).toBe(true);
      expect(disputeCreated.conversationId).toBe("c_1");
      expect(disputeCreated.reporterId).toBe("user_1");
      expect(disputeCreated.reason).toBe("spam");
      expect(disputeCreated.snapshot.messages).toEqual(convMessages);
      expect(disputeCreated.snapshot.participants).toEqual(["user_1", "user_2"]);
      expect(result.id).toBe("d_1");
    });
  });

  describe("resolve", () => {
    const baseDispute = {
      id: "d_1",
      reporterId: "user_1",
      conversation: { userAId: "user_1", userBId: "user_2" },
    };

    it("throws NOT_FOUND when dispute missing", async () => {
      const ctx = {
        db: { dispute: { findUnique: async () => null } },
      } as unknown as AuraContext;
      const svc = new DisputeService(ctx);
      await expect(svc.resolve("d_missing", "admin_1", "WARN_REPORTER"))
        .rejects.toThrow("Litige introuvable");
    });

    it("warns reporter on WARN_REPORTER decision", async () => {
      let profileUpdated = false;
      const ctx2 = {
        db: {
          dispute: {
            findUnique: async () => baseDispute,
            update: async () => ({}),
          },
          profile: {
            update: async (args: any) => {
              if (args.where.userId === "user_1") { profileUpdated = true; }
              return { warningCount: 1 };
            },
          },
          auraUser: { findUnique: async () => null },
        },
        notify: {
          via: vi.fn(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
        },
      } as unknown as AuraContext;

      const svc = new DisputeService(ctx2);
      await svc.resolve("d_1", "admin_1", "WARN_REPORTER");
      expect(profileUpdated).toBe(true);
    });

    it("suspends reported user on SUSPEND_REPORTED decision", async () => {
      let suspendedUserId: string | null = null;
      const ctx = {
        db: {
          dispute: {
            findUnique: async () => baseDispute,
            update: async () => ({}),
          },
          profile: {
            update: async (args: any) => {
              if (args.where.userId && args.data.status === "SUSPENDED") {
                suspendedUserId = args.where.userId;
              }
              return { warningCount: 0 };
            },
          },
          auraUser: { findUnique: async () => null },
        },
        notify: {
          via: vi.fn(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
        },
      } as unknown as AuraContext;

      const svc = new DisputeService(ctx);
      await svc.resolve("d_1", "admin_1", "SUSPEND_REPORTED");
      expect(suspendedUserId).toBe("user_2");
    });

    it("auto-suspends user when warningCount reaches 3", async () => {
      let suspended = false;
      const ctx = {
        db: {
          dispute: {
            findUnique: async () => baseDispute,
            update: async () => ({}),
          },
          profile: {
            update: vi.fn(async (args: any) => {
              if (args.data.status === "SUSPENDED") { suspended = true; }
              return { warningCount: 3 };
            }),
          },
          auraUser: { findUnique: async () => null },
        },
        notify: {
          via: vi.fn(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
        },
      } as unknown as AuraContext;

      const svc = new DisputeService(ctx);
      await svc.resolve("d_1", "admin_1", "WARN_REPORTER");
      expect(suspended).toBe(true);
    });

    it("updates dispute with RESOLVED status and decision", async () => {
      let disputeUpdate: any = null;
      const ctx = {
        db: {
          dispute: {
            findUnique: async () => baseDispute,
            update: async (args: any) => { disputeUpdate = args; return {}; },
          },
          profile: { update: async () => ({ warningCount: 0 }) },
          auraUser: { findUnique: async () => null },
        },
        notify: {
          via: vi.fn(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
        },
      } as unknown as AuraContext;

      const svc = new DisputeService(ctx);
      await svc.resolve("d_1", "admin_1", "WARN_BOTH", "Premier avertissement");
      expect(disputeUpdate.data.status).toBe("RESOLVED");
      expect(disputeUpdate.data.decision).toBe("WARN_BOTH");
      expect(disputeUpdate.data.resolution).toBe("Premier avertissement");
      expect(disputeUpdate.data.resolvedById).toBe("admin_1");
    });
  });
});
