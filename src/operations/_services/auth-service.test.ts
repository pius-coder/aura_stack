import { describe, it, expect, vi } from "vitest";
import { AuthService } from "./auth-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

vi.mock("@/aura/server/auth/password", () => ({
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
  verifyPassword: vi.fn(async (p: string, hash?: string) => hash === `hashed:${p}`),
}));

vi.mock("@/aura/server/auth/session", () => ({
  createSession: vi.fn(async () => {}),
  revokeAllUserSessions: vi.fn(async () => {}),
}));

vi.mock("@/aura/server/auth/otp", () => ({
  createOtpChallenge: vi.fn(async (args: any) => ({
    challengeId: `ch_${args.phoneE164}`,
    code: "12345678",
    expiresAt: new Date(Date.now() + 600000),
  })),
  consumeOtpChallenge: vi.fn(async (args: any) => ({
    userId: `user_for_${args.challengeId}`,
    phoneE164: "+237600000001",
  })),
}));

vi.mock("@/aura/server/auth/phone", () => ({
  normalizePhone: vi.fn((args: any) => ({
    countryCode: "+237",
    nationalNumber: "600000001",
    phoneE164: args.countryCode === "+237" ? "+237600000001" : "+33600000001",
  })),
}));

vi.mock("@/aura/server/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => {}),
}));

describe("AuthService", () => {
  it("extends AuraService", () => {
    const ctx = {} as AuraContext;
    const svc = new AuthService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  describe("register", () => {
    it("creates user with email and password", async () => {
      const ctx = {
        db: {
          auraUser: {
            findUnique: async () => null,
            create: async (args: any) => ({
              id: "user_1",
              email: args.data.email,
              displayName: args.data.displayName,
              profile: { id: "prof_1", alias: "rapide-renard-1234" },
            }),
          },
          profile: { findUnique: async () => null, create: async (d: any) => d },
        },
        bump: { success: vi.fn() },
        audit: { record: vi.fn() },
        auth: { setSessionCookie: vi.fn() },
        cookies: { set: [] },
        request: { ip: "127.0.0.1" },
      } as unknown as AuraContext;

      const svc = new AuthService(ctx);
      const result = await svc.register({ email: "test@orya.com", password: "Str0ng!Pass12", displayName: "Test User" });

      expect(result.userId).toBe("user_1");
      expect(result.email).toBe("test@orya.com");
      expect(result.linkCode).toBeDefined();
      expect(result.linkCode).toHaveLength(8);
    });

    it("throws CONFLICT on duplicate email", async () => {
      const ctx = {
        db: { auraUser: { findUnique: async () => ({ id: "existing" }) } },
        bump: { success: vi.fn() },
        audit: { record: vi.fn() },
      } as unknown as AuraContext;

      const svc = new AuthService(ctx);
      await expect(svc.register({ email: "dup@orya.com", password: "Str0ng!Pass12" })).rejects.toThrow("Email ou mot de passe invalide.");
    });
  });

  describe("login", () => {
    it("authenticates with valid phone + password", async () => {
      const ctx = {
        db: {
          auraPhoneIdentity: {
            findUnique: async () => ({
              phoneE164: "+237600000001",
              verifiedAt: null,
              id: "identity_1",
              userId: "user_1",
              user: { id: "user_1", disabledAt: null, deletedAt: null, passwordCredential: { passwordHash: "hashed:str0ngpass" } },
            }),
            update: async () => ({}),
          },
        },
        bump: { success: vi.fn() },
        audit: { record: vi.fn() },
        auth: { setSessionCookie: vi.fn() },
        cookies: { set: [] },
        request: { ip: "127.0.0.1" },
      } as unknown as AuraContext;

      const svc = new AuthService(ctx);
      const result = await svc.login({ countryCode: "+237", phoneNumber: "600000001", password: "str0ngpass" });
      expect(result.userId).toBe("user_1");
    });

    it("throws UNAUTHORIZED on wrong password", async () => {
      const ctx = {
        db: {
          auraPhoneIdentity: {
            findUnique: async () => ({
              phoneE164: "+237600000001",
              verifiedAt: null,
              id: "identity_1",
              userId: "user_1",
              user: { id: "user_1", disabledAt: null, deletedAt: null, passwordCredential: { passwordHash: "hashed:realpass" } },
            }),
            update: async () => ({}),
          },
        },
        bump: { success: vi.fn() },
        audit: { record: vi.fn() },
        request: { ip: "127.0.0.1" },
      } as unknown as AuraContext;

      const svc = new AuthService(ctx);
      await expect(svc.login({ countryCode: "+237", phoneNumber: "600000001", password: "wrongpass" })).rejects.toThrow("Identifiants invalides.");
    });
  });

  describe("startPhoneOtp", () => {
    it("creates OTP challenge and returns code", async () => {
      const ctx = {
        db: {},
        request: { ip: "127.0.0.1" },
      } as unknown as AuraContext;

      const svc = new AuthService(ctx);
      const result = await svc.startPhoneOtp({ phoneE164: "+237600000001" });
      expect(result.challengeId).toBe("ch_+237600000001");
      expect(result.code).toBe("12345678");
    });
  });

  describe("generateLinkCode", () => {
    it("generates 8-char alphanumeric code", async () => {
      let updated = false;
      const ctx = {
        db: { auraPhoneIdentity: { updateMany: async () => { updated = true; } } },
        user: { id: "user_1" },
      } as unknown as AuraContext;

      const svc = new AuthService(ctx);
      const result = await svc.generateLinkCode("+237600000001");
      expect(result.code).toHaveLength(8);
      expect(result.code).toMatch(/^[A-Z0-9]+$/);
      expect(updated).toBe(true);
    });
  });
});
