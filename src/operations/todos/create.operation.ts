import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("todos.create")
  .mutate()
  .input(
    z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
      dueDate: z.string().datetime().optional(),
      aiGenerated: z.boolean().default(false),
    }),
  )
  .entities(["Todo"])
  .public()
  .handler(async ({ ctx, input }) => {
    const todo = await ctx.db.todo.create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        aiGenerated: input.aiGenerated,
      },
    });
    ctx.bump.success("Tâche créée", todo.title);
    return todo;
  });
