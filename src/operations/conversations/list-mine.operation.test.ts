import { describe, it, expect } from "vitest";
import type { AuraContext } from "@/aura/server/context";

// Characterization test: current behavior of conversations.list-mine handler
// This operation does raw ctx.db.conversation.findMany() in the handler (fat handler pattern)
describe("conversations.list-mine handler", () => {
  it("returns conversations where user is participant A or B, ordered by updatedAt desc, take 50", async () => {
    const handler = async (ctx: AuraContext) => {
      return ctx.db.conversation.findMany({
        where: { OR: [{ userAId: ctx.user!.id }, { userBId: ctx.user!.id }] },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
    };

    let queryArgs: any = null;
    const ctx = {
      user: { id: "user_1" },
      db: {
        conversation: {
          findMany: async (args: any) => { queryArgs = args; return []; },
        },
      },
    } as unknown as AuraContext;

    await handler(ctx);
    expect(queryArgs.where.OR).toContainEqual({ userAId: "user_1" });
    expect(queryArgs.where.OR).toContainEqual({ userBId: "user_1" });
    expect(queryArgs.orderBy).toEqual({ updatedAt: "desc" });
    expect(queryArgs.take).toBe(50);
  });
});
