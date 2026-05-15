import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("services.list-public")
  .query()
  .input(z.object({ cursor: z.string().nullish(), numItems: z.number().int().max(50).default(20), zone: z.string().optional(), search: z.string().optional() }))
  .entities(["Service"])
  .public()
  .handler(async ({ ctx, input }) => {
    return ctx.paginate(ctx.db.service, {
      where: {
        isActive: true, deletedAt: null,
        ...(input.zone && { zone: { contains: input.zone, mode: "insensitive" as const } }),
        ...(input.search && { OR: [{ title: { contains: input.search, mode: "insensitive" as const } }, { description: { contains: input.search, mode: "insensitive" as const } }] }),
      },
      cursor: input.cursor ?? undefined,
      take: input.numItems,
      orderBy: "createdAt",
      direction: "desc",
      operationHash: "services.list-public",
    });
  });
