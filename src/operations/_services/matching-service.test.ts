import { describe, it, expect } from "vitest";
import { MatchingService } from "./matching-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

// Pure helper tests — characterize current keyword scoring behavior
describe("MatchingService helpers", () => {
  it("extends AuraService", () => {
    const ctx = {} as unknown as AuraContext;
    const svc = new MatchingService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });
});

describe("runQuery", () => {
  it("returns empty profiles when no candidates exist", async () => {
    const ctx = {
      db: {
        match: { findMany: async () => [] },
        profile: { findMany: async () => [] },
        boostSlot: { findMany: async () => [] },
        matchSession: { create: async (args: any) => ({ id: "session_1", ...args.data }) },
      },
    } as unknown as AuraContext;
    const svc = new MatchingService(ctx);
    const result = await svc.runQuery("user_1", "plombier");
    expect(result.matchSessionId).toBe("session_1");
    expect(result.profiles).toEqual([]);
  });

  it("excludes requester from results", async () => {
    const ctx = {
      db: {
        match: { findMany: async () => [] },
        profile: {
          findMany: async (args: any) => {
            expect(args.where.userId.notIn).toContain("user_1");
            return [
              { id: "p1", userId: "user_2", alias: "test", bio: "plombier", locationLabel: null, services: [], isVerified: false, isProvider: true, status: "ACTIVE", displayName: "test", language: "FR", consent: null, isClient: false, lat: null, lng: null, photoFileId: null, ratingAvg: null, ratingCount: 0, createdAt: new Date(), updatedAt: new Date(), verifiedAt: null, warningCount: 0 },
            ];
          },
        },
        boostSlot: { findMany: async () => [] },
        matchSession: { create: async (args: any) => ({ id: "s_1", ...args.data }) },
      },
    } as unknown as AuraContext;
    const svc = new MatchingService(ctx);
    const result = await svc.runQuery("user_1", "plombier");
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0].userId).toBe("user_2");
  });

  it("excludes recent matches within 30 days", async () => {
    const ctx = {
      db: {
        match: {
          findMany: async () => [
            { requesterId: "user_1", targetId: "user_2" },
          ],
        },
        profile: {
          findMany: async (args: any) => {
            expect(args.where.userId.notIn).toContain("user_2");
            return [
              { id: "p1", userId: "user_3", alias: "test", bio: "plombier", locationLabel: null, services: [], isVerified: false, isProvider: true, status: "ACTIVE", displayName: "test", language: "FR", consent: null, isClient: false, lat: null, lng: null, photoFileId: null, ratingAvg: null, ratingCount: 0, createdAt: new Date(), updatedAt: new Date(), verifiedAt: null, warningCount: 0 },
            ];
          },
        },
        boostSlot: { findMany: async () => [] },
        matchSession: { create: async (args: any) => ({ id: "s_1", ...args.data }) },
      },
    } as unknown as AuraContext;
    const svc = new MatchingService(ctx);
    const result = await svc.runQuery("user_1", "plombier");
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0].userId).toBe("user_3");
  });

  it("filters by location constraint", async () => {
    const ctx = {
      db: {
        match: { findMany: async () => [] },
        profile: {
          findMany: async (args: any) => {
            expect(args.where.locationLabel).toEqual({ contains: "Douala", mode: "insensitive" });
            return [
              { id: "p1", userId: "user_2", alias: "test", bio: "plombier", locationLabel: "Douala", services: [], isVerified: false, isProvider: true, status: "ACTIVE", displayName: "test", language: "FR", consent: null, isClient: false, lat: null, lng: null, photoFileId: null, ratingAvg: null, ratingCount: 0, createdAt: new Date(), updatedAt: new Date(), verifiedAt: null, warningCount: 0 },
            ];
          },
        },
        boostSlot: { findMany: async () => [] },
        matchSession: { create: async (args: any) => ({ id: "s_1", ...args.data }) },
      },
    } as unknown as AuraContext;
    const svc = new MatchingService(ctx);
    const result = await svc.runQuery("user_1", "plombier", { location: "Douala" });
    expect(result.profiles).toHaveLength(1);
  });

  it("computes base score from keyword matches", async () => {
    const ctx = {
      db: {
        match: { findMany: async () => [] },
        profile: {
          findMany: async () => [
            { id: "p1", userId: "user_2", alias: "rene", bio: "expert en plombier", locationLabel: "Douala", services: [{ title: "Plombier", description: "plombier", priceXaf: 5000, isActive: true, deletedAt: null, id: "s1", userId: "user_2", createdAt: new Date(), updatedAt: new Date(), availability: "AVAILABLE", zone: null }], isVerified: true, isProvider: true, status: "ACTIVE", displayName: "René", language: "FR", consent: null, isClient: false, lat: null, lng: null, photoFileId: null, ratingAvg: null, ratingCount: 0, createdAt: new Date(), updatedAt: new Date(), verifiedAt: null, warningCount: 0 },
          ],
        },
        boostSlot: { findMany: async () => [] },
        matchSession: { create: async (args: any) => ({ id: "s_1", ...args.data }) },
      },
    } as unknown as AuraContext;
    const svc = new MatchingService(ctx);
    const result = await svc.runQuery("user_1", "plombier");
    const profile = result.profiles[0];
    // Title "plombier" matches query "plombier" → +0.24, matchedSkillCount=1
    // Skills bonus does NOT apply because constraints.skills is undefined
    // Verified → +0.06
    // Score = 0.05 + 0.24 + 0.06 = 0.35
    expect(profile.score).toBeGreaterThanOrEqual(0.35);
    expect(profile.score).toBeLessThanOrEqual(1);
  });

  it("caps score at 1.0", async () => {
    const ctx = {
      db: {
        match: { findMany: async () => [] },
        profile: {
          findMany: async () => [
            { id: "p1", userId: "user_2", alias: "rene", bio: "plombier electricien menage", locationLabel: "Douala", services: Array.from({ length: 10 }, (_, i) => ({ title: "Plomberie", description: "plombier electricien", priceXaf: 5000, isActive: true, deletedAt: null, id: `s${i}`, userId: "user_2", createdAt: new Date(), updatedAt: new Date(), availability: "AVAILABLE", zone: null })), isVerified: true, isProvider: true, status: "ACTIVE", displayName: "René", language: "FR", consent: null, isClient: false, lat: null, lng: null, photoFileId: null, ratingAvg: null, ratingCount: 0, createdAt: new Date(), updatedAt: new Date(), verifiedAt: null, warningCount: 0 },
          ],
        },
        boostSlot: { findMany: async () => [] },
        matchSession: { create: async (args: any) => ({ id: "s_1", ...args.data }) },
      },
    } as unknown as AuraContext;
    const svc = new MatchingService(ctx);
    const result = await svc.runQuery("user_1", "plombier");
    expect(result.profiles[0].score).toBeLessThanOrEqual(1);
  });

  it("boosts verified profiles by 0.06", async () => {
    const ctx = {
      db: {
        match: { findMany: async () => [] },
        profile: {
          findMany: async () => [
            { id: "p1", userId: "user_2", alias: "a", bio: "plombier", locationLabel: null, services: [{ title: "Plomberie", description: "", priceXaf: 0, isActive: true, deletedAt: null, id: "s1", userId: "user_2", createdAt: new Date(), updatedAt: new Date(), availability: "AVAILABLE", zone: null }], isVerified: true, isProvider: true, status: "ACTIVE", displayName: "A", language: "FR", consent: null, isClient: false, lat: null, lng: null, photoFileId: null, ratingAvg: null, ratingCount: 0, createdAt: new Date(), updatedAt: new Date(), verifiedAt: null, warningCount: 0 },
            { id: "p2", userId: "user_3", alias: "b", bio: "plombier", locationLabel: null, services: [{ title: "Plomberie", description: "", priceXaf: 0, isActive: true, deletedAt: null, id: "s2", userId: "user_3", createdAt: new Date(), updatedAt: new Date(), availability: "AVAILABLE", zone: null }], isVerified: false, isProvider: true, status: "ACTIVE", displayName: "B", language: "FR", consent: null, isClient: false, lat: null, lng: null, photoFileId: null, ratingAvg: null, ratingCount: 0, createdAt: new Date(), updatedAt: new Date(), verifiedAt: null, warningCount: 0 },
          ],
        },
        boostSlot: { findMany: async () => [] },
        matchSession: { create: async (args: any) => ({ id: "s_1", ...args.data }) },
      },
    } as unknown as AuraContext;
    const svc = new MatchingService(ctx);
    const result = await svc.runQuery("user_1", "plombier");
    expect(result.profiles[0].score).toBeGreaterThan(result.profiles[1].score);
    // verified gets +0.06, so difference should be ~0.06
    expect(result.profiles[0].score - result.profiles[1].score).toBeCloseTo(0.06, 1);
  });

  it("places boosted profiles first (up to 3)", async () => {
    const ctx = {
      db: {
        match: { findMany: async () => [] },
        profile: {
          findMany: async () => [
            { id: "p1", userId: "user_2", alias: "a", bio: "plombier", locationLabel: null, services: [], isVerified: false, isProvider: true, status: "ACTIVE", displayName: "A", language: "FR", consent: null, isClient: false, lat: null, lng: null, photoFileId: null, ratingAvg: null, ratingCount: 0, createdAt: new Date(), updatedAt: new Date(), verifiedAt: null, warningCount: 0 },
            { id: "p2", userId: "user_3", alias: "b", bio: "plombier", locationLabel: null, services: [], isVerified: false, isProvider: true, status: "ACTIVE", displayName: "B", language: "FR", consent: null, isClient: false, lat: null, lng: null, photoFileId: null, ratingAvg: null, ratingCount: 0, createdAt: new Date(), updatedAt: new Date(), verifiedAt: null, warningCount: 0 },
          ],
        },
        boostSlot: { findMany: async () => [{ userId: "user_2" }] },
        matchSession: { create: async (args: any) => ({ id: "s_1", ...args.data }) },
      },
    } as unknown as AuraContext;
    const svc = new MatchingService(ctx);
    const result = await svc.runQuery("user_1", "plombier");
    expect(result.profiles[0].userId).toBe("user_2");
  });

  it("applies budget constraint bonus when service priceXaf <= budgetMaxXaf", async () => {
    const ctx = {
      db: {
        match: { findMany: async () => [] },
        profile: {
          findMany: async () => [
            { id: "p1", userId: "user_2", alias: "rene", bio: "electricien", locationLabel: null, services: [{ title: "Service", description: "electricien", priceXaf: 5000, isActive: true, deletedAt: null, id: "s1", userId: "user_2", createdAt: new Date(), updatedAt: new Date(), availability: "AVAILABLE", zone: null }], isVerified: false, isProvider: true, status: "ACTIVE", displayName: "René", language: "FR", consent: null, isClient: false, lat: null, lng: null, photoFileId: null, ratingAvg: null, ratingCount: 0, createdAt: new Date(), updatedAt: new Date(), verifiedAt: null, warningCount: 0 },
          ],
        },
        boostSlot: { findMany: async () => [] },
        matchSession: { create: async (args: any) => ({ id: "s_1", ...args.data }) },
      },
    } as unknown as AuraContext;
    const svc = new MatchingService(ctx);
    const result = await svc.runQuery("user_1", "electricien", { budgetMaxXaf: 10000 });
    const scores = result.profiles.map(p => p.score);
    // Query "electricien": title "Service" no match, description "electricien" → +0.12
    // Budget bonus +0.08, no verified
    // Score = 0.05 + 0.12 + 0.08 = 0.25
    expect(scores[0]).toBeGreaterThanOrEqual(0.25);
  });

  it("creates matchSession with fusedTopN", async () => {
    let createdSession: any = null;
    const ctx = {
      db: {
        match: { findMany: async () => [] },
        profile: {
          findMany: async () => [
            { id: "p1", userId: "user_2", alias: "rene", bio: "plombier", locationLabel: null, services: [], isVerified: false, isProvider: true, status: "ACTIVE", displayName: "René", language: "FR", consent: null, isClient: false, lat: null, lng: null, photoFileId: null, ratingAvg: null, ratingCount: 0, createdAt: new Date(), updatedAt: new Date(), verifiedAt: null, warningCount: 0 },
          ],
        },
        boostSlot: { findMany: async () => [] },
        matchSession: { create: async (args: any) => { createdSession = args.data; return { id: "s_1", ...args.data }; } },
      },
    } as unknown as AuraContext;
    const svc = new MatchingService(ctx);
    await svc.runQuery("user_1", "plombier");
    expect(createdSession).not.toBeNull();
    expect(createdSession.requesterId).toBe("user_1");
    expect(createdSession.query).toBe("plombier");
    expect(createdSession.intent).toBe("search_provider");
    expect(createdSession.fusedTopN).toHaveLength(1);
    expect(createdSession.fusedTopN[0].userId).toBe("user_2");
  });
});
