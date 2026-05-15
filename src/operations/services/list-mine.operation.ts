import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("services.list-mine")
  .query()
  .input(
    z.object({
      cursor: z.string().nullish(),
      numItems: z.number().int().positive().max(50).default(20),
    }),
  )
  .entities(["Service"])
  .auth()
  .handler(async ({ ctx, input }) => {
    return ctx.paginate(ctx.db.service, {
      where: { userId: ctx.user.id, deletedAt: null },
      cursor: input.cursor ?? undefined,
      take: input.numItems,
      orderBy: "createdAt",
      direction: "desc",
      operationHash: "services.list-mine",
    });
  });
