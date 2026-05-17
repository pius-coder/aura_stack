import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuraContext } from "@/aura/server/context";
import { InboxService } from "./inbox-service";

const sendText = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/whatsapp", () => ({
  whatsAppGateway: vi.fn(() => ({ sendText })),
}));

vi.mock("@/lib/whatsapp/resolve-user", () => ({
  resolveUserByPhone: vi.fn(),
}));

vi.mock("@/lib/whatsapp/canonical-message", () => ({
  parseStoredWhatsAppMessage: vi.fn(),
}));

vi.mock("./user-agent-service", () => ({
  UserAgentService: vi.fn().mockImplementation(() => ({
    processMessage: vi.fn(async () => "Réponse de l'agent."),
  })),
}));

function makeCtx(overrides: Record<string, any> = {}): AuraContext {
  return {
    db: {
      whatsappInbox: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      auraUser: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      auraPhoneIdentity: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      profile: { findUnique: vi.fn() },
      service: { findMany: vi.fn() },
      ...overrides,
    },
    log: { error: vi.fn() },
  } as unknown as AuraContext;
}

function makeInbox(payload: Record<string, any> = {}, overrides: Record<string, any> = {}) {
  return { id: "inbox_1", phoneE164: "+237612345678", payload, processedAt: null, ...overrides } as any;
}

describe("InboxService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processIncoming", () => {
    it("returns skipped when inbox already processed", async () => {
      const ctx = makeCtx();
      vi.mocked(ctx.db.whatsappInbox.findUnique).mockResolvedValue(makeInbox({}, { processedAt: new Date() }));
      const svc = new InboxService(ctx);
      const result = await svc.processIncoming("inbox_1");
      expect(result.status).toBe("skipped");
    });

    it("returns skipped when inbox not found", async () => {
      const ctx = makeCtx();
      vi.mocked(ctx.db.whatsappInbox.findUnique).mockResolvedValue(null);
      const svc = new InboxService(ctx);
      const result = await svc.processIncoming("inbox_1");
      expect(result.status).toBe("skipped");
    });

    it("returns empty when no text extracted", async () => {
      const { parseStoredWhatsAppMessage } = await import("@/lib/whatsapp/canonical-message");
      vi.mocked(parseStoredWhatsAppMessage).mockReturnValue(null);

      const ctx = makeCtx();
      vi.mocked(ctx.db.whatsappInbox.findUnique).mockResolvedValue(makeInbox({}));
      const svc = new InboxService(ctx);
      const result = await svc.processIncoming("inbox_1");
      expect(result.status).toBe("empty");
    });

    it("returns onboarding when user not resolved", async () => {
      const { parseStoredWhatsAppMessage } = await import("@/lib/whatsapp/canonical-message");
      vi.mocked(parseStoredWhatsAppMessage).mockReturnValue({ provider: "evolution-api", providerMessageId: "msg_1", phoneE164: "+237612345678", text: "Bonjour" });
      const { resolveUserByPhone } = await import("@/lib/whatsapp/resolve-user");
      vi.mocked(resolveUserByPhone).mockResolvedValue(null);

      const ctx = makeCtx();
      vi.mocked(ctx.db.whatsappInbox.findUnique).mockResolvedValue(makeInbox({}));
      const svc = new InboxService(ctx);
      const result = await svc.processIncoming("inbox_1");
      expect(result.status).toBe("onboarding");
      expect(sendText).toHaveBeenCalledWith("+237612345678", expect.stringContaining("Bienvenue"), expect.any(String));
    });

    it("returns unlinked when whatsappLinked is false", async () => {
      const { parseStoredWhatsAppMessage } = await import("@/lib/whatsapp/canonical-message");
      vi.mocked(parseStoredWhatsAppMessage).mockReturnValue({ provider: "evolution-api", providerMessageId: "msg_1", phoneE164: "+237612345678", text: "Bonjour" });
      const { resolveUserByPhone } = await import("@/lib/whatsapp/resolve-user");
      vi.mocked(resolveUserByPhone).mockResolvedValue("user_1");

      const ctx = makeCtx();
      vi.mocked(ctx.db.whatsappInbox.findUnique).mockResolvedValue(makeInbox({}));
      vi.mocked(ctx.db.auraUser.findUnique).mockResolvedValue({ id: "user_1", whatsappLinked: false } as any);
      const svc = new InboxService(ctx);
      const result = await svc.processIncoming("inbox_1");
      expect(result.status).toBe("unlinked");
    });

    it("returns suspended when hydration returns null", async () => {
      const { parseStoredWhatsAppMessage } = await import("@/lib/whatsapp/canonical-message");
      vi.mocked(parseStoredWhatsAppMessage).mockReturnValue({ provider: "evolution-api", providerMessageId: "msg_1", phoneE164: "+237612345678", text: "Bonjour" });
      const { resolveUserByPhone } = await import("@/lib/whatsapp/resolve-user");
      vi.mocked(resolveUserByPhone).mockResolvedValue("user_1");

      const ctx = makeCtx();
      vi.mocked(ctx.db.whatsappInbox.findUnique).mockResolvedValue(makeInbox({}));
      vi.mocked(ctx.db.auraUser.findUnique).mockResolvedValue({ id: "user_1", whatsappLinked: true } as any);
      vi.mocked(ctx.db.profile.findUnique).mockResolvedValue(null);
      const svc = new InboxService(ctx);
      const result = await svc.processIncoming("inbox_1");
      expect(result.status).toBe("suspended");
    });

    it("returns processed when agent reply succeeds", async () => {
      const { parseStoredWhatsAppMessage } = await import("@/lib/whatsapp/canonical-message");
      vi.mocked(parseStoredWhatsAppMessage).mockReturnValue({ provider: "evolution-api", providerMessageId: "msg_1", phoneE164: "+237612345678", text: "Bonjour" });
      const { resolveUserByPhone } = await import("@/lib/whatsapp/resolve-user");
      vi.mocked(resolveUserByPhone).mockResolvedValue("user_1");

      const ctx = makeCtx();
      vi.mocked(ctx.db.whatsappInbox.findUnique).mockResolvedValue(makeInbox({}));
      vi.mocked(ctx.db.auraUser.findUnique).mockResolvedValue({ id: "user_1", whatsappLinked: true } as any);
      vi.mocked(ctx.db.profile.findUnique).mockResolvedValue({ id: "prof_1", userId: "user_1", status: "ACTIVE" } as any);
      vi.mocked(ctx.db.service.findMany).mockResolvedValue([]);
      const svc = new InboxService(ctx);
      const result = await svc.processIncoming("inbox_1");
      expect(result.status).toBe("processed");
    });

    it("processes link code before phone-based user resolution", async () => {
      const { parseStoredWhatsAppMessage } = await import("@/lib/whatsapp/canonical-message");
      vi.mocked(parseStoredWhatsAppMessage).mockReturnValue({ provider: "evolution-api", providerMessageId: "msg_1", phoneE164: "+237612345678", text: "ABCD1234" });

      const ctx = makeCtx();
      vi.mocked(ctx.db.whatsappInbox.findUnique).mockResolvedValue(makeInbox({}));
      vi.mocked(ctx.db.auraUser.findFirst).mockResolvedValue({ id: "user_1", linkCode: "ABCD1234", linkCodeExpiresAt: new Date(Date.now() + 60_000) } as any);
      vi.mocked(ctx.db.auraPhoneIdentity.findUnique).mockResolvedValue(null);
      const svc = new InboxService(ctx);
      const result = await svc.processIncoming("inbox_1");
      expect(result.status).toBe("linkCodeProcessed");
      expect(ctx.db.auraUser.update).toHaveBeenCalled();
      expect(ctx.db.auraPhoneIdentity.create).toHaveBeenCalled();
    });
  });

  describe("link code edge cases", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("rejects expired link code from auraUser", async () => {
      const { parseStoredWhatsAppMessage } = await import("@/lib/whatsapp/canonical-message");
      vi.mocked(parseStoredWhatsAppMessage).mockReturnValue({ provider: "evolution-api", providerMessageId: "msg_1", phoneE164: "+237612345678", text: "EXPIRED1" });

      const ctx = makeCtx();
      vi.mocked(ctx.db.whatsappInbox.findUnique).mockResolvedValue(makeInbox({}, { id: "inbox_2" }));
      vi.mocked(ctx.db.auraUser.findFirst).mockResolvedValue({ id: "user_1", linkCode: "EXPIRED1", linkCodeExpiresAt: new Date(Date.now() - 60_000) } as any);
      const svc = new InboxService(ctx);
      const result = await svc.processIncoming("inbox_2");
      expect(result.status).toBe("linkCodeProcessed");
      expect(sendText).toHaveBeenCalledWith("+237612345678", expect.stringContaining("expire"), expect.any(String));
    });

    it("rejects link code already linked to another phone", async () => {
      const { parseStoredWhatsAppMessage } = await import("@/lib/whatsapp/canonical-message");
      vi.mocked(parseStoredWhatsAppMessage).mockReturnValue({ provider: "evolution-api", providerMessageId: "msg_1", phoneE164: "+237612345678", text: "CONFLCT1" });

      const ctx = makeCtx();
      vi.mocked(ctx.db.whatsappInbox.findUnique).mockResolvedValue(makeInbox({}, { id: "inbox_3" }));
      vi.mocked(ctx.db.auraUser.findFirst).mockResolvedValue({ id: "user_1", linkCode: "CONFLCT1", linkCodeExpiresAt: new Date(Date.now() + 60_000) } as any);
      vi.mocked(ctx.db.auraPhoneIdentity.findUnique).mockResolvedValue({ userId: "user_2" } as any);
      const svc = new InboxService(ctx);
      const result = await svc.processIncoming("inbox_3");
      expect(result.status).toBe("linkCodeProcessed");
      expect(sendText).toHaveBeenCalledWith("+237612345678", expect.stringContaining("deja lie"), expect.any(String));
    });

    it("uses AuraPhoneIdentity linkCode fallback when AuraUser linkCode not found", async () => {
      const { parseStoredWhatsAppMessage } = await import("@/lib/whatsapp/canonical-message");
      vi.mocked(parseStoredWhatsAppMessage).mockReturnValue({ provider: "evolution-api", providerMessageId: "msg_1", phoneE164: "+237612345678", text: "FALLBCK1" });

      const ctx = makeCtx();
      vi.mocked(ctx.db.whatsappInbox.findUnique).mockResolvedValue(makeInbox({}, { id: "inbox_4" }));
      vi.mocked(ctx.db.auraUser.findFirst).mockResolvedValue(null);
      vi.mocked(ctx.db.auraPhoneIdentity.findFirst).mockResolvedValue({ id: "pi_1", userId: "user_1", linkCode: "FALLBCK1", linkCodeExpiresAt: new Date(Date.now() + 60_000) } as any);
      const svc = new InboxService(ctx);
      const result = await svc.processIncoming("inbox_4");
      expect(result.status).toBe("linkCodeProcessed");
      expect(sendText).toHaveBeenCalledWith("+237612345678", expect.stringContaining("Bienvenue"), expect.any(String));
    });
  });
});
