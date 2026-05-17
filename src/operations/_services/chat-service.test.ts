import { describe, it, expect, vi } from "vitest";
import { ChatService } from "./chat-service";
import { AuraService } from "@/aura/server/service";
import type { AuraContext } from "@/aura/server/context";

vi.mock("@/aura/server/publish", () => ({
  publishEvent: vi.fn(),
}));

vi.mock("@/lib/whatsapp/aggregator", () => ({
  scheduleNotification: vi.fn((_event, cb) => cb(_event)),
}));

describe("ChatService", () => {
  it("extends AuraService", () => {
    const ctx = {} as unknown as AuraContext;
    const svc = new ChatService(ctx);
    expect(svc).toBeInstanceOf(AuraService);
  });

  describe("sendMessage", () => {
    it("throws NOT_FOUND when conversation missing", async () => {
      const ctx = {
        db: { conversation: { findUnique: async () => null } },
      } as unknown as AuraContext;
      const svc = new ChatService(ctx);
      await expect(svc.sendMessage("user_1", "conv_missing", "hello"))
        .rejects.toThrow("Conversation introuvable");
    });

    it("throws FORBIDDEN when user is not participant", async () => {
      const ctx = {
        db: { conversation: { findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2", status: "OPEN" }) } },
      } as unknown as AuraContext;
      const svc = new ChatService(ctx);
      await expect(svc.sendMessage("user_3", "c_1", "hello"))
        .rejects.toThrow("Acces refuse");
    });

    it("throws BAD_REQUEST when conversation is closed", async () => {
      const ctx = {
        db: { conversation: { findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2", status: "CLOSED" }) } },
      } as unknown as AuraContext;
      const svc = new ChatService(ctx);
      await expect(svc.sendMessage("user_1", "c_1", "hello"))
        .rejects.toThrow("Conversation fermee");
    });

    it("throws VALIDATION_ERROR when body exceeds 4000 chars", async () => {
      const ctx = {
        db: { conversation: { findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2", status: "OPEN" }) } },
      } as unknown as AuraContext;
      const svc = new ChatService(ctx);
      await expect(svc.sendMessage("user_1", "c_1", "x".repeat(4001)))
        .rejects.toThrow("4000 caracteres");
    });

    it("creates message, broadcasts events, and schedules notification", async () => {
      const { publishEvent } = await import("@/aura/server/publish");
      const { scheduleNotification } = await import("@/lib/whatsapp/aggregator");

      let createdMsg: any = null;
      const ctx = {
        db: {
          conversation: {
            findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2", status: "OPEN" }),
          },
          chatMessage: {
            create: async (args: any) => { createdMsg = args.data; return { id: "msg_1", ...args.data, createdAt: new Date() }; },
          },
          auraUser: {
            findUnique: async () => ({ id: "user_2", whatsappE164: "+237600000002", profile: { language: "EN" } }),
          },
        },
        notify: {
          via: vi.fn(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
        },
      } as unknown as AuraContext;

      const svc = new ChatService(ctx);
      const result = await svc.sendMessage("user_1", "c_1", "Hello!");

      expect(result.id).toBe("msg_1");
      expect(createdMsg).toEqual({ conversationId: "c_1", senderId: "user_1", body: "Hello!" });

      expect(publishEvent).toHaveBeenCalledWith({
        room: "conversation:c_1",
        event: "message:new",
        data: expect.objectContaining({ id: "msg_1", senderId: "user_1", body: "Hello!" }),
      });
      expect(publishEvent).toHaveBeenCalledWith({
        room: "user:user_2",
        event: "message:received",
        data: { conversationId: "c_1", messageId: "msg_1" },
      });
      expect(scheduleNotification).toHaveBeenCalled();
    });

    it("skips notification when recipient has no whatsappE164", async () => {
      const { scheduleNotification } = await import("@/lib/whatsapp/aggregator");

      const ctx = {
        db: {
          conversation: { findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2", status: "OPEN" }) },
          chatMessage: { create: async (args: any) => ({ id: "msg_1", ...args.data, createdAt: new Date() }) },
          auraUser: { findUnique: async () => ({ id: "user_2", whatsappE164: null }) },
        },
        notify: { via: vi.fn() },
      } as unknown as AuraContext;

      const svc = new ChatService(ctx);
      await svc.sendMessage("user_1", "c_1", "Hello!");
      expect(scheduleNotification).toHaveBeenCalled();
    });
  });

  describe("close", () => {
    it("closes an open conversation", async () => {
      let updated: any = null;
      const ctx = {
        db: {
          conversation: {
            findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2", status: "OPEN" }),
            update: async (args: any) => { updated = args; return { ...args.data }; },
          },
        },
      } as unknown as AuraContext;
      const svc = new ChatService(ctx);
      await svc.close("user_1", "c_1");
      expect(updated!.data.status).toBe("CLOSED");
    });

    it("throws NOT_FOUND when conversation missing", async () => {
      const ctx = {
        db: { conversation: { findUnique: async () => null } },
      } as unknown as AuraContext;
      const svc = new ChatService(ctx);
      await expect(svc.close("user_1", "c_missing")).rejects.toThrow("Conversation introuvable");
    });

    it("throws FORBIDDEN when user is not participant", async () => {
      const ctx = {
        db: { conversation: { findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2", status: "OPEN" }) } },
      } as unknown as AuraContext;
      const svc = new ChatService(ctx);
      await expect(svc.close("user_3", "c_1")).rejects.toThrow("participant");
    });
  });

  describe("sendTyping", () => {
    it("broadcasts typing event for participant", async () => {
      const { publishEvent } = await import("@/aura/server/publish");
      const ctx = {
        db: {
          conversation: { findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2", status: "OPEN" }) },
        },
      } as unknown as AuraContext;
      const svc = new ChatService(ctx);
      await svc.sendTyping("user_1", "c_1");
      expect(publishEvent).toHaveBeenCalledWith({
        room: "conversation:c_1",
        event: "typing",
        data: { userId: "user_1" },
      });
    });

    it("throws when conversation is closed", async () => {
      const ctx = {
        db: { conversation: { findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2", status: "CLOSED" }) } },
      } as unknown as AuraContext;
      const svc = new ChatService(ctx);
      await expect(svc.sendTyping("user_1", "c_1")).rejects.toThrow("Conversation fermee");
    });
  });
});
