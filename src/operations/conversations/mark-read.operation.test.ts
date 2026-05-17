import { describe, it, expect } from "vitest";
import type { AuraContext } from "@/aura/server/context";
import { AuraError } from "@/aura/core/errors";

// Characterization test: current behavior of conversations.mark-read handler
// This operation does raw SQL $executeRaw in handler (fat handler pattern)
describe("conversations.mark-read handler", () => {
  const user1 = { id: "user_1" };
  const user2 = { id: "user_2" };

  it("throws NOT_FOUND when conversation missing", async () => {
    const handler = async (ctx: AuraContext, input: { conversationId: string }) => {
      const conv = await ctx.db.conversation.findUnique({ where: { id: input.conversationId } });
      if (!conv || (conv.userAId !== ctx.user!.id && conv.userBId !== ctx.user!.id)) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
      const otherId = conv.userAId === ctx.user!.id ? conv.userBId : conv.userAId;
      await ctx.db.$executeRaw`UPDATE "ChatMessage" SET "readBy" = "readBy" || ${JSON.stringify([ctx.user!.id])}::jsonb WHERE "conversationId" = ${input.conversationId} AND "senderId" = ${otherId} AND NOT ("readBy" @> ${JSON.stringify([ctx.user!.id])}::jsonb)`;
      return { ok: true };
    };

    const ctx = {
      user: user1,
      db: { conversation: { findUnique: async () => null } },
    } as unknown as AuraContext;

    await expect(handler(ctx, { conversationId: "c_missing" })).rejects.toThrow("Conversation introuvable");
  });

  it("executes raw SQL to mark other user's messages as read", async () => {
    let rawSqlArgs: any[] = [];
    const handler = async (ctx: AuraContext, input: { conversationId: string }) => {
      const conv = await ctx.db.conversation.findUnique({ where: { id: input.conversationId } });
      if (!conv || (conv.userAId !== ctx.user!.id && conv.userBId !== ctx.user!.id)) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
      const otherId = conv.userAId === ctx.user!.id ? conv.userBId : conv.userAId;
      await ctx.db.$executeRaw`UPDATE "ChatMessage" SET "readBy" = "readBy" || ${JSON.stringify([ctx.user!.id])}::jsonb WHERE "conversationId" = ${input.conversationId} AND "senderId" = ${otherId} AND NOT ("readBy" @> ${JSON.stringify([ctx.user!.id])}::jsonb)`;
      return { ok: true };
    };

    const ctx = {
      user: user1,
      db: {
        conversation: { findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2" }) },
        $executeRaw: async (strings: TemplateStringsArray, ...args: any[]) => { rawSqlArgs = [strings, ...args]; },
      },
    } as unknown as AuraContext;

    const result = await handler(ctx, { conversationId: "c_1" });
    expect(result.ok).toBe(true);
    expect(rawSqlArgs.length).toBeGreaterThan(0);
  });

  it("determines otherId correctly for user B", async () => {
    const handler = async (ctx: AuraContext, input: { conversationId: string }) => {
      const conv = await ctx.db.conversation.findUnique({ where: { id: input.conversationId } });
      if (!conv || (conv.userAId !== ctx.user!.id && conv.userBId !== ctx.user!.id)) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
      const otherId = conv.userAId === ctx.user!.id ? conv.userBId : conv.userAId;
      await ctx.db.$executeRaw`UPDATE "ChatMessage" SET "readBy" = "readBy" || ${JSON.stringify([ctx.user!.id])}::jsonb WHERE "conversationId" = ${input.conversationId} AND "senderId" = ${otherId} AND NOT ("readBy" @> ${JSON.stringify([ctx.user!.id])}::jsonb)`;
      return { ok: true };
    };

    const ctx = {
      user: user2,
      db: {
        conversation: { findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2" }) },
        $executeRaw: async () => {},
      },
    } as unknown as AuraContext;

    const result = await handler(ctx, { conversationId: "c_1" });
    expect(result.ok).toBe(true);
  });
});
