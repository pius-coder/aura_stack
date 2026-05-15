import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("todos.toggle")
  .mutate()
  .input(z.object({ id: z.string() }))
  .entities(["Todo"])
  .public()
  .handler(async ({ ctx, input }) => {
    const existing = await ctx.db.todo.findUnique({ where: { id: input.id } });
    if (!existing) return { ok: false };
    const next = existing.status === "DONE" ? "PENDING" : "DONE";
    return ctx.db.todo.update({ where: { id: input.id }, data: { status: next } });
  });
