import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("disputes.snapshot-builder")
  .mutate()
  .input(z.object({ conversationId: z.string(), disputeId: z.string() }))
  .internal()
  .handler(async ({ ctx, input }) => {
    const messages = await ctx.db.chatMessage.findMany({
      where: { conversationId: input.conversationId },
      orderBy: { createdAt: "asc" },
    });

    const snapshot = { messages, capturedAt: new Date().toISOString() };
    const stored = await ctx.storage.store({
      data: JSON.stringify(snapshot),
      filename: `dispute-${input.disputeId}-snapshot.json`,
      contentType: "application/json",
    });

    return { storageId: stored.storageId };
  });
