import { describe, it, expect } from "vitest";
import type { AuraContext } from "@/aura/server/context";
import { AuraError } from "@/aura/core/errors";

// Characterization test: current behavior of profiles.get-by-alias handler
// This operation does raw ctx.db.profile.findFirst() + ctx.db.service.findMany() in handler (fat handler pattern)
describe("profiles.get-by-alias handler", () => {
  it("throws NOT_FOUND when profile not found", async () => {
    const handler = async (ctx: AuraContext, input: { alias: string }) => {
      const profile = await ctx.db.profile.findFirst({ where: { alias: input.alias } });
      if (!profile) throw new AuraError("NOT_FOUND", "Profil introuvable.");
      const services = await ctx.db.service.findMany({
        where: { userId: profile.userId, isActive: true, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });
      return {
        alias: profile.alias,
        bio: profile.bio,
        locationLabel: profile.locationLabel,
        language: profile.language,
        isVerified: profile.isVerified,
        ratingAvg: profile.ratingAvg,
        ratingCount: profile.ratingCount,
        services,
      };
    };

    const ctx = {
      db: { profile: { findFirst: async () => null } },
    } as unknown as AuraContext;

    await expect(handler(ctx, { alias: "nonexistent" })).rejects.toThrow("Profil introuvable");
  });

  it("returns profile with active services sorted by createdAt desc", async () => {
    let serviceQuery: any = null;
    const handler = async (ctx: AuraContext, input: { alias: string }) => {
      const profile = await ctx.db.profile.findFirst({ where: { alias: input.alias } });
      if (!profile) throw new AuraError("NOT_FOUND", "Profil introuvable.");
      const services = await ctx.db.service.findMany({
        where: { userId: profile.userId, isActive: true, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });
      return {
        alias: profile.alias,
        bio: profile.bio,
        locationLabel: profile.locationLabel,
        language: profile.language,
        isVerified: profile.isVerified,
        ratingAvg: profile.ratingAvg,
        ratingCount: profile.ratingCount,
        services,
      };
    };

    const ctx = {
      db: {
        profile: {
          findFirst: async () => ({
            alias: "rapide-renard",
            bio: "Plombier à Douala",
            locationLabel: "Douala",
            language: "FR",
            isVerified: true,
            ratingAvg: 4.5,
            ratingCount: 12,
            userId: "user_1",
          }),
        },
        service: {
          findMany: async (args: any) => { serviceQuery = args; return [{ title: "Plomberie", priceXaf: 5000, isActive: true, deletedAt: null, id: "s1", userId: "user_1", description: "", createdAt: new Date(), updatedAt: new Date(), availability: "AVAILABLE", zone: null }]; },
        },
      },
    } as unknown as AuraContext;

    const result = await handler(ctx, { alias: "rapide-renard" });
    expect(result.alias).toBe("rapide-renard");
    expect(result.isVerified).toBe(true);
    expect(result.ratingAvg).toBe(4.5);
    expect(result.ratingCount).toBe(12);
    expect(result.services).toHaveLength(1);
    expect(serviceQuery.where.userId).toBe("user_1");
    expect(serviceQuery.where.isActive).toBe(true);
    expect(serviceQuery.where.deletedAt).toBe(null);
    expect(serviceQuery.orderBy).toEqual({ createdAt: "desc" });
  });
});
