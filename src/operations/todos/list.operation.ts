import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("todos.list")
  .query()
  .input(
    z.object({
      status: z.enum(["PENDING", "IN_PROGRESS", "DONE"]).optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
      cursor: z.string().nullish(),
      numItems: z.number().int().positive().max(100).default(20),
      search: z.string().optional(),
    }),
  )
  .entities(["Todo"])
  .public()
  .handler(async ({ ctx, input }) => {
    return ctx.paginate(ctx.db.todo, {
      where: {
        ...(input.status && { status: input.status }),
        ...(input.priority && { priority: input.priority }),
        ...(input.search && {
          OR: [
            { title: { contains: input.search, mode: "insensitive" as const } },
            { description: { contains: input.search, mode: "insensitive" as const } },
          ],
        }),
      },
      cursor: input.cursor ?? undefined,
      take: input.numItems,
      orderBy: "createdAt",
      direction: "desc",
      operationHash: "todos.list",
    });
  });
