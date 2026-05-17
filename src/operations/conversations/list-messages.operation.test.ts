import { describe, it, expect } from "vitest";
import type { AuraContext } from "@/aura/server/context";
import { AuraError } from "@/aura/core/errors";

// Characterization test: current behavior of conversations.list-messages handler
// This operation does raw DB lookup + auth check in handler (fat handler pattern)
describe("conversations.list-messages handler", () => {
  const user = { id: "user_1" };
  const user3 = { id: "user_3" };

  it("throws NOT_FOUND when conversation missing", async () => {
    const handler = async (ctx: AuraContext, input: { conversationId: string; cursor?: string | null; numItems?: number }) => {
      const conv = await ctx.db.conversation.findUnique({ where: { id: input.conversationId } });
      if (!conv) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
      if (conv.userAId !== ctx.user!.id && conv.userBId !== ctx.user!.id) throw new AuraError("FORBIDDEN", "Accès refusé.");
      return ctx.paginate(ctx.db.chatMessage, {
        where: { conversationId: input.conversationId },
        cursor: input.cursor ?? undefined,
        take: input.numItems ?? 20,
        orderBy: "createdAt",
        direction: "desc",
        operationHash: "conversations.list-messages",
      });
    };

    const ctx = {
      user,
      db: { conversation: { findUnique: async () => null } },
    } as unknown as AuraContext;

    await expect(handler(ctx, { conversationId: "c_missing" })).rejects.toThrow("Conversation introuvable");
  });

  it("throws FORBIDDEN when user is not participant", async () => {
    const handler = async (ctx: AuraContext, input: { conversationId: string; cursor?: string | null; numItems?: number }) => {
      const conv = await ctx.db.conversation.findUnique({ where: { id: input.conversationId } });
      if (!conv) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
      if (conv.userAId !== ctx.user!.id && conv.userBId !== ctx.user!.id) throw new AuraError("FORBIDDEN", "Accès refusé.");
      return ctx.paginate(ctx.db.chatMessage, {
        where: { conversationId: input.conversationId },
        cursor: input.cursor ?? undefined,
        take: input.numItems ?? 20,
        orderBy: "createdAt",
        direction: "desc",
        operationHash: "conversations.list-messages",
      });
    };

    const ctx = {
      user: user3,
      db: { conversation: { findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2" }) } },
    } as unknown as AuraContext;

    await expect(handler(ctx, { conversationId: "c_1" })).rejects.toThrow("Accès refusé");
  });

  it("returns paginated messages with default numItems=20", async () => {
    let paginateArgs: any = null;
    const handler = async (ctx: AuraContext, input: { conversationId: string; cursor?: string | null; numItems?: number }) => {
      const conv = await ctx.db.conversation.findUnique({ where: { id: input.conversationId } });
      if (!conv) throw new AuraError("NOT_FOUND", "Conversation introuvable.");
      if (conv.userAId !== ctx.user!.id && conv.userBId !== ctx.user!.id) throw new AuraError("FORBIDDEN", "Accès refusé.");
      return ctx.paginate(ctx.db.chatMessage, {
        where: { conversationId: input.conversationId },
        cursor: input.cursor ?? undefined,
        take: input.numItems ?? 20,
        orderBy: "createdAt",
        direction: "desc",
        operationHash: "conversations.list-messages",
      });
    };

    const ctx = {
      user,
      db: { conversation: { findUnique: async () => ({ id: "c_1", userAId: "user_1", userBId: "user_2" }) } },
      paginate: async (_model: any, opts: any) => { paginateArgs = opts; return { items: [], cursor: null }; },
    } as unknown as AuraContext;

    await handler(ctx, { conversationId: "c_1" });
    expect(paginateArgs.where).toEqual({ conversationId: "c_1" });
    expect(paginateArgs.take).toBe(20);
    expect(paginateArgs.orderBy).toBe("createdAt");
    expect(paginateArgs.direction).toBe("desc");
  });
});
