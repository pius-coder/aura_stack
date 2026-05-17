import { defineAgent } from "@/aura/server/ai/agent";
import { ChatOpenAI } from "@langchain/openai";
import { buildPersonaSystemPrompt } from "@/prompts/orya";

export default defineAgent("ai.agent-user", {
  model: new ChatOpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    model: "mistralai/mistral-large-3-675b-instruct-2512",
    temperature: 0.15,
    maxTokens: 2048,
    configuration: { baseURL: "https://integrate.api.nvidia.com/v1" },
  }),
  systemPrompt: buildPersonaSystemPrompt(),
  maxSteps: 4,
});
