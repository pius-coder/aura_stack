# AI agents

Aura's AI layer is built on **LangChain JS** (model abstraction, tools) and **LangGraph JS** (multi-step workflows), with Aura providing persistence (`AuraAgentThread`, `AuraAgentMessage`, `AuraAIUsage`), tool wiring through operations, streaming via the broadcast WebSocket, and rate-limited usage tracking.

## Models

| Model | Role |
|-------|------|
| `AuraAgentThread` | A conversation. `agentName`, `userId`, `title`, `status`. |
| `AuraAgentMessage` | One message in a thread. `role` (`user`/`assistant`/`tool`/`system`), `content`, `toolCalls`, `toolResults`, `metadata`. |
| `AuraAIUsage` | Per-call usage row. `model`, `provider`, `inputTokens`, `outputTokens`, `latencyMs`, `estimatedCost`. |

## Defining an agent

Agents live in `src/operations/<namespace>/<name>.agent.ts` and use `defineAgent`:

```ts
// src/operations/ai/customer-support.agent.ts
import { defineAgent } from "@/aura/server/ai/agent";
import { ChatOpenAI } from "@langchain/openai";
import { api } from "@/aura/_generated/api";

export default defineAgent("ai.customer-support", {
  model: new ChatOpenAI({ model: "gpt-4o", temperature: 0.7 }),
  systemPrompt: "You are a helpful support agent for our e-commerce platform.",
  maxSteps: 10,
  tools: [
    // Aura operations as tools (see below)
  ],
});
```

The default export is a typed `AgentDefinition` that satisfies `AgentRef` — it can be passed directly to `ctx.agent.createThread(agentRef, ...)`.

### Provider switching

Swap the LangChain model class to switch providers:

```ts
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenRouter } from "@langchain/openrouter";

// OpenAI
new ChatOpenAI({ model: "gpt-4o" })

// Anthropic
new ChatAnthropic({ model: "claude-3-5-sonnet-20241022" })

// Any model via OpenRouter
new ChatOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY!, model: "anthropic/claude-3.5-sonnet" })
```

## Calling an agent

From any operation handler, use `ctx.agent`:

```ts
import { defineOperationFn } from "@/aura/server/operation";
import supportAgent from "@/operations/ai/customer-support.agent";

export default defineOperationFn("support.ask")
  .action()
  .input(z.object({ question: z.string() }))
  .auth()
  .handler(async ({ ctx, input }) => {
    // 1. Create or reuse a thread
    const thread = await ctx.agent.createThread(supportAgent, {
      userId: ctx.user.id,
      metadata: { source: "support.ask" },
    });

    // 2. Send the prompt — generateText handles tool calls, history, persistence
    const response = await ctx.agent.generateText(thread, {
      prompt: input.question,
    });

    return { content: response.content, threadId: thread._id };
  });
```

The agent runtime:

1. Persists the user message in `AuraAgentMessage`.
2. Loads the last 50 messages of the thread as context.
3. Invokes the LangChain model with bound tools.
4. If the model calls tools, executes them, persists the call + result, and re-invokes with the tool result. Loop up to `maxSteps`.
5. Persists the final assistant message.
6. Records usage in `AuraAIUsage`.

## Tools as Aura operations

Wrap any operation as a tool the LLM can call. Tools are added to the agent's `tools` array:

```ts
import { api } from "@/aura/_generated/api";
import type { AgentToolDef } from "@/aura/server/ai/agent";
import { z } from "zod";

const lookupOrderTool: AgentToolDef = {
  name: "lookup-order",
  description: "Look up an order by ID",
  parameters: z.object({ orderId: z.string() }),
  async execute(input) {
    // Calls into the operation registry — runs in a fresh AuraContext
    const { getOperation } = await import("@/aura/server/registry");
    const op = getOperation("orders.getById");
    if (!op) throw new Error("orders.getById not registered");
    const { createAuraContext } = await import("@/aura/server/create-context");
    const ctx = await createAuraContext({ source: "internal" });
    return op.execute({ ctx, input, params: undefined, req: undefined });
  },
};
```

The LLM sees the tool's `name`, `description`, and JSON-schema-converted Zod parameters. When it calls the tool, the result is serialized to JSON, fed back as a `ToolMessage`, and persisted alongside the call.

For shortcut: `operationAsTool(api.orders.getById, { description: "..." })` (in `agent.ts`) wraps an `OperationRef` into an `AgentToolDef` automatically.

## Streaming

`ctx.agent.streamText` streams tokens via the Aura broadcast WebSocket. Multiple clients subscribed to the same thread receive deltas in real time:

```ts
.handler(async ({ ctx, input }) => {
  const thread = await ctx.agent.createThread(supportAgent, { userId: ctx.user.id });
  await ctx.agent.streamText(thread, {
    prompt: input.question,
    onDelta: (delta) => ctx.log.info("delta", { len: delta.length }),
  });
  return { threadId: thread._id };
});
```

Client-side, `useAuraAgentStream(threadId)` listens for `__agent_stream:` keys on the BroadcastChannel and exposes `{ isStreaming, streamingContent }`:

```tsx
const { isStreaming, streamingContent } = useAuraAgentStream(threadId);
const { data: messages } = useAuraAgentThread(threadId);
```

`<AuraAgentChat>` (in `@/aura/ui`) wraps both into a complete chat UI:

```tsx
import { AuraAgentChat } from "@/aura/ui";

<AuraAgentChat agentName="ai.customer-support" threadId={threadId} />
```

## Usage tracking

Every LLM call writes to `AuraAIUsage` with input/output tokens, latency, and model. Query stats via `ctx.agent.getUsage()`:

```ts
const usage = await ctx.agent.getUsage({
  userId: ctx.user.id,
  agentName: "ai.customer-support",
  since: new Date(Date.now() - 30 * 86_400_000),  // last 30 days
});
// { totalCalls, inputTokens, outputTokens, totalTokens }
```

Wire this into your billing or rate-limit logic to enforce per-user token budgets.

## Cost estimation

`estimatedCost` on `AuraAIUsage` is null by default. Populate it via a per-model cost table in your code if you need accurate billing — Aura doesn't ship a built-in pricing catalog (LLM prices change too often).

## Folder convention

| File | Suffix | Registry export |
|------|--------|-----------------|
| `src/operations/ai/customer-support.agent.ts` | `.agent.ts` | yes |
| `src/operations/ai/todo-planner.agent.ts` | `.agent.ts` | yes |

Agents auto-register on import via `defineAgent`. Add them to `_registry.ts` so they're loaded at server boot:

```ts
export { default as ai_todoPlanner } from "./ai/todo-planner.agent";
```

## Generate one with the CLI

```bash
bun aura:make agent customer-support
```

Creates `src/operations/ai/customer-support.agent.ts` with a stub.
