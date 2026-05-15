import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("todos.delete")
  .mutate()
  .input(z.object({ id: z.string() }))
  .entities(["Todo"])
  .public()
  .handler(async ({ ctx, input }) => {
    await ctx.db.todo.delete({ where: { id: input.id } });
    ctx.bump.success("Tâche supprimée");
    return { ok: true };
  });
