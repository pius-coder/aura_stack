import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import { AuraError } from "@/aura/core/errors";

export default defineOperationFn("todos.update")
  .mutate()
  .input(
    z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).nullish(),
      status: z.enum(["PENDING", "IN_PROGRESS", "DONE"]).optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
      dueDate: z.string().datetime().nullish(),
    }),
  )
  .entities(["Todo"])
  .public()
  .handler(async ({ ctx, input }) => {
    const { id, dueDate, ...rest } = input;
    const existing = await ctx.db.todo.findUnique({ where: { id } });
    if (!existing) throw new AuraError("NOT_FOUND", "Tâche introuvable.");

    const todo = await ctx.db.todo.update({
      where: { id },
      data: {
        ...rest,
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      },
    });

    ctx.invalidate({ entity: "Todo", id });
    ctx.bump.success("Tâche mise à jour", todo.title);
    return todo;
  });
