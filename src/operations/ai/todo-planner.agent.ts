/**
 * AI agent: `ai.todo-planner` — decomposes a goal into actionable todos.
 *
 * Defined via `defineAgent()` per Requirement 31.1. Uses OpenRouter as the
 * LangChain chat model so any provider (OpenAI/Anthropic/Google/local) can
 * be swapped via env config alone.
 */
import { defineAgent } from "@/aura/server/ai/agent";
import { ChatOpenRouter } from "@langchain/openrouter";

export default defineAgent("ai.todo-planner", {
  model: new ChatOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    model: "openai/gpt-4o-mini",
    temperature: 0.7,
  }),
  systemPrompt: `Tu es un assistant qui décompose un objectif en tâches actionnables en français.

Quand on te donne un objectif, tu réponds UNIQUEMENT avec un objet JSON valide au format:
{"todos": [{"title": "...", "description": "...", "priority": "LOW"|"MEDIUM"|"HIGH"|"URGENT"}, ...]}

Pas de markdown, pas de commentaires, pas de texte autour — juste l'objet JSON.
Crée des tâches concrètes et claires. Les priorités reflètent l'urgence et l'importance.`,
  maxSteps: 1,
});
