/**
 * `todos.ai-generate` — uses the `ai.todo-planner` agent to break a goal
 * into actionable todos and persist them.
 *
 * Strictly follows the design contract:
 *   - Agent is declared via `defineAgent()` in its own `.agent.ts` file.
 *   - This action calls `ctx.agent.createThread()` then
 *     `ctx.agent.generateText()` (Requirements 31.3, 31.4).
 *   - Each todo is persisted via `ctx.runMutation("todos.create", ...)` so
 *     entity invalidation propagates uniformly.
 */
import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";
import todoPlannerAgent from "@/operations/ai/todo-planner.agent";
import { AuraError } from "@/aura/core/errors";

const ResponseSchema = z.object({
  todos: z.array(
    z.object({
      title: z.string(),
      description: z.string().optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    }),
  ),
});

export default defineOperationFn("todos.ai-generate")
  .action()
  .input(
    z.object({
      goal: z.string().min(1).max(500),
      count: z.number().int().min(1).max(20).default(5),
    }),
  )
  .entities(["Todo"])
  .public()
  .handler(async ({ ctx, input }) => {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new AuraError(
        "INTERNAL_ERROR",
        "OPENROUTER_API_KEY n'est pas défini.",
      );
    }

    // Spec: `ctx.agent.createThread(agentRef, { userId, metadata })`
    const thread = await ctx.agent.createThread(todoPlannerAgent, {
      userId: ctx.user?.id,
      metadata: { source: "todos.ai-generate", goal: input.goal },
    });

    // Spec: `ctx.agent.generateText(threadRef, { prompt, ... })`
    const response = await ctx.agent.generateText(thread, {
      prompt: `Objectif: ${input.goal}\n\nGénère exactement ${input.count} tâches.`,
    });

    // Parse + validate the JSON the agent returned
    const match = response.content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new AuraError(
        "INTERNAL_ERROR",
        "Réponse de l'agent invalide (JSON manquant).",
      );
    }
    const parsed = ResponseSchema.safeParse(JSON.parse(match[0]));
    if (!parsed.success) {
      throw new AuraError(
        "INTERNAL_ERROR",
        `Réponse de l'agent invalide: ${parsed.error.message}`,
      );
    }

    // Persist each todo via the standard create mutation so entity
    // invalidation propagates exactly like a manual creation.
    const created = [];
    for (const t of parsed.data.todos) {
      const todo = await ctx.runMutation("todos.create", {
        title: t.title,
        description: t.description,
        priority: t.priority,
        aiGenerated: true,
      });
      created.push(todo);
    }

    ctx.bump.success(
      "Tâches générées",
      `${created.length} tâche(s) créée(s) à partir de votre objectif.`,
    );

    return { count: created.length, todos: created };
  });
