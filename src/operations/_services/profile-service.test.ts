import { describe, it, expect, vi } from "vitest";
import { ProfileService } from "./profile-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

describe("ProfileService", () => {
  it("extends AuraService", () => {
    const ctx = {} as AuraContext;
    const svc = new ProfileService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  describe("getProfile", () => {
    it("returns null when profile not found", async () => {
      const ctx = { db: { profile: { findUnique: async () => null } } } as unknown as AuraContext;
      const svc = new ProfileService(ctx);
      const result = await svc.getProfile("user_1");
      expect(result).toBeNull();
    });

    it("returns profile with service count and rating", async () => {
      const ctx = {
        db: {
          profile: { findUnique: async () => ({ id: "prof_1", userId: "user_1", displayName: "Test", alias: "rapide-renard" }) },
          service: { count: async () => 3 },
          rating: { aggregate: async () => ({ _avg: { score: 4.2 }, _count: 10 }) },
        },
      } as unknown as AuraContext;
      const svc = new ProfileService(ctx);
      const result = await svc.getProfile("user_1");
      expect(result?.serviceCount).toBe(3);
      expect(result?.ratingAvg).toBe(4.2);
      expect(result?.ratingCount).toBe(10);
    });
  });

  describe("updateProfile", () => {
    it("updates profile fields", async () => {
      const ctx = {
        db: { profile: { update: async () => ({ id: "prof_1", displayName: "New Name" }) } },
        scheduler: { runAfter: vi.fn() },
      } as unknown as AuraContext;
      const svc = new ProfileService(ctx);
      const result = await svc.updateProfile("user_1", { displayName: "New Name" });
      expect(result.displayName).toBe("New Name");
    });

    it("rejects bio over 1000 chars", async () => {
      const ctx = {} as unknown as AuraContext;
      const svc = new ProfileService(ctx);
      await expect(svc.updateProfile("user_1", { bio: "x".repeat(1001) })).rejects.toThrow("1000 caractères");
    });

    it("rejects displayName over 80 chars", async () => {
      const ctx = {} as unknown as AuraContext;
      const svc = new ProfileService(ctx);
      await expect(svc.updateProfile("user_1", { displayName: "x".repeat(81) })).rejects.toThrow("80 caractères");
    });
  });

  describe("setType", () => {
    it("sets provider type", async () => {
      const ctx = {
        db: {
          profile: { findUnique: async () => ({ id: "prof_1", isProvider: false }), update: async (args: any) => args.data },
        },
      } as unknown as AuraContext;
      const svc = new ProfileService(ctx);
      const result = await svc.setType("user_1", "prestataire");
      expect(result.isProvider).toBe(true);
    });

    it("blocks conversion to standard when active services exist", async () => {
      const ctx = {
        db: {
          profile: { findUnique: async () => ({ id: "prof_1", isProvider: true }) },
          service: { count: async () => 2 },
        },
      } as unknown as AuraContext;
      const svc = new ProfileService(ctx);
      await expect(svc.setType("user_1", "standard")).rejects.toThrow("services actifs");
    });
  });

  describe("canMatch", () => {
    it("returns eligible when profile is complete", async () => {
      const ctx = {
        db: { profile: { findUnique: async () => ({ status: "ACTIVE", displayName: "Test", locationLabel: "Douala" }) } },
      } as unknown as AuraContext;
      const svc = new ProfileService(ctx);
      const result = await svc.canMatch("user_1");
      expect(result.eligible).toBe(true);
    });

    it("returns ineligible when name missing", async () => {
      const ctx = {
        db: { profile: { findUnique: async () => ({ status: "ACTIVE", displayName: null, locationLabel: "Douala" }) } },
      } as unknown as AuraContext;
      const svc = new ProfileService(ctx);
      const result = await svc.canMatch("user_1");
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("INCOMPLETE_PROFILE");
    });
  });

  describe("canUploadPhoto", () => {
    it("accepts valid image types", async () => {
      const ctx = {} as AuraContext;
      const svc = new ProfileService(ctx);
      expect(await svc.canUploadPhoto("image/png", 1024)).toBe(true);
      expect(await svc.canUploadPhoto("image/jpeg", 1024)).toBe(true);
      expect(await svc.canUploadPhoto("image/gif", 1024)).toBe(false);
      expect(await svc.canUploadPhoto("image/png", 6 * 1024 * 1024)).toBe(false);
    });
  });
});
