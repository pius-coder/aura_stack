import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("ratings.list-for-user")
  .query()
  .input(z.object({ userId: z.string() }))
  .entities(["Rating"])
  .public()
  .handler(async ({ ctx, input }) => {
    return ctx.db.rating.findMany({
      where: { rateeId: input.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, score: true, comment: true, createdAt: true },
    });
  });
