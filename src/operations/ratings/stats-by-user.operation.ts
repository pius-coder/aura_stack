import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("ratings.stats-by-user")
  .query()
  .input(z.object({ userId: z.string() }))
  .entities(["Rating"])
  .auth()
  .handler(async ({ ctx, input }) => {
    return ctx.db.rating.findMany({
      where: { rateeId: input.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, score: true, comment: true, createdAt: true },
    });
  });
