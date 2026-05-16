import { describe, it, expect } from "vitest";
import { ServiceService } from "./service-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

describe("ServiceService", () => {
  it("extends AuraService", () => {
    const ctx = {} as AuraContext;
    const svc = new ServiceService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  describe("create", () => {
    it("creates a service", async () => {
      let created = false;
      const ctx = {
        db: {
          service: {
            count: async () => 0,
            create: async (args: any) => { created = true; return { id: "svc_1", ...args.data }; },
          },
          profile: { findUnique: async () => ({ isProvider: false }), update: async () => ({}) },
          subscription: { findFirst: async () => null },
        },
      } as unknown as AuraContext;
      const svc = new ServiceService(ctx);
      const result = await svc.create("user_1", { title: "Plomberie", description: "Travaux plomberie", priceXaf: 15000 });
      expect(created).toBe(true);
    });

    it("rejects over 50 active services without Pro", async () => {
      const ctx = {
        db: {
          service: { count: async () => 50 },
          subscription: { findFirst: async () => null },
        },
      } as unknown as AuraContext;
      const svc = new ServiceService(ctx);
      await expect(svc.create("user_1", { title: "Extra", description: "Desc", priceXaf: 1000 })).rejects.toThrow("50 services");
    });

    it("allows over 50 services with Pro subscription", async () => {
      const ctx = {
        db: {
          service: { count: async () => 50, create: async (args: any) => ({ id: "svc_1", ...args.data }) },
          profile: { findUnique: async () => ({ isProvider: true }) },
          subscription: { findFirst: async () => ({ plan: "PRO", status: "ACTIVE" }) },
        },
      } as unknown as AuraContext;
      const svc = new ServiceService(ctx);
      const result = await svc.create("user_1", { title: "Extra Pro", description: "Desc", priceXaf: 1000 });
      expect(result.id).toBe("svc_1");
    });

    it("auto-sets isProvider on profile", async () => {
      let updatedProvider = false;
      const ctx = {
        db: {
          service: { count: async () => 0, create: async (args: any) => ({ id: "svc_1", ...args.data }) },
          profile: {
            findUnique: async () => ({ isProvider: false }),
            update: async (args: any) => { updatedProvider = args.data.isProvider; },
          },
          subscription: { findFirst: async () => null },
        },
      } as unknown as AuraContext;
      const svc = new ServiceService(ctx);
      await svc.create("user_1", { title: "Test", description: "Desc", priceXaf: 5000 });
      expect(updatedProvider).toBe(true);
    });
  });

  describe("update", () => {
    it("updates own service", async () => {
      const ctx = {
        db: {
          service: { findUnique: async () => ({ id: "svc_1", userId: "user_1" }), update: async (args: any) => args.data },
        },
      } as unknown as AuraContext;
      const svc = new ServiceService(ctx);
      const result = await svc.update("user_1", "svc_1", { title: "Updated" });
      expect(result.title).toBe("Updated");
    });

    it("rejects update of another user's service", async () => {
      const ctx = {
        db: { service: { findUnique: async () => ({ id: "svc_1", userId: "user_2" }) } },
      } as unknown as AuraContext;
      const svc = new ServiceService(ctx);
      await expect(svc.update("user_1", "svc_1", { title: "Hack" })).rejects.toThrow("Service introuvable");
    });
  });

  describe("delete", () => {
    it("soft-deletes own service", async () => {
      let deletedAt = false;
      const ctx = {
        db: {
          service: { findUnique: async () => ({ id: "svc_1", userId: "user_1" }), update: async (args: any) => { deletedAt = !!args.data.deletedAt; } },
        },
      } as unknown as AuraContext;
      const svc = new ServiceService(ctx);
      const result = await svc.delete("user_1", "svc_1");
      expect(result.ok).toBe(true);
      expect(deletedAt).toBe(true);
    });
  });
});
