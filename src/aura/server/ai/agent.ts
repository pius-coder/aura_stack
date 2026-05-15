/**
 * AI Agent framework — `defineAgent`, thread management, tool calling, streaming.
 * Resolves: Requirements 31.1–31.10, 32.1–32.6, 33.1–33.6, 35.1–35.5 (Task 23).
 *
 * Built on LangChain JS for model abstraction and tool execution.
 * Streaming uses the Aura broadcast WebSocket (not HTTP streaming).
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { db } from "../db";
import type { AuraDb } from "../db";
import { publishInvalidation } from "../invalidate";
import { v4 as uuidv4 } from "uuid";
import { toPrismaJson } from "../json";
import type { OperationRef } from "@/aura/core/types";

// ─── Types ───

export interface AgentToolDef {
  name: string;
  description: string;
  parameters: z.ZodType;
  execute: (input: unknown) => Promise<unknown>;
  requiresApproval?: boolean;
}

export interface AgentRAGConfig {
  sources: string[];
  topK?: number;
  strategy?: "vector" | "text" | "hybrid";
}

export interface AgentDefinition {
  readonly __auraAgent: true;
  readonly name: string;
  /** Alias of `name` — satisfies the `AgentRef` contract on `ctx.agent.*`. */
  readonly _name: string;
  readonly model: BaseChatModel;
  readonly systemPrompt: string;
  readonly tools: AgentToolDef[];
  readonly maxSteps: number;
  readonly rag?: AgentRAGConfig;
}

export interface DefineAgentOptions {
  model: BaseChatModel;
  systemPrompt: string;
  tools?: AgentToolDef[];
  maxSteps?: number;
  rag?: AgentRAGConfig;
}

// ─── Registry ───

const agentRegistry = new Map<string, AgentDefinition>();

export function defineAgent(name: string, options: DefineAgentOptions): AgentDefinition {
  const def: AgentDefinition = {
    __auraAgent: true,
    name,
    _name: name,
    model: options.model,
    systemPrompt: options.systemPrompt,
    tools: options.tools ?? [],
    maxSteps: options.maxSteps ?? 10,
    rag: options.rag,
  };
  agentRegistry.set(name, def);
  return def;
}

export function getAgent(name: string): AgentDefinition | null {
  return agentRegistry.get(name) ?? null;
}

export function listAgents(): AgentDefinition[] {
  return [...agentRegistry.values()];
}

// ─── Thread Management ───

export async function createThread(
  agentName: string,
  opts: { userId?: string; title?: string; metadata?: Record<string, unknown> } = {},
  prisma: AuraDb = db,
): Promise<string> {
  const thread = await prisma.auraAgentThread.create({
    data: {
      id: uuidv4(),
      agentName,
      userId: opts.userId ?? null,
      title: opts.title ?? null,
      metadata: opts.metadata ? toPrismaJson(opts.metadata) : undefined,
    },
  });
  return thread.id;
}

export async function getThreadMessages(
  threadId: string,
  opts: { limit?: number } = {},
  prisma: AuraDb = db,
) {
  return prisma.auraAgentMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take: opts.limit,
  });
}

// ─── Tool Conversion ───

/**
 * Convert an Aura operation ref into an AgentToolDef.
 * The `.asTool()` modifier on operations calls this.
 */
export function operationAsTool(
  ref: OperationRef,
  opts: { description: string; requiresApproval?: boolean },
): AgentToolDef {
  return {
    name: ref._name,
    description: opts.description,
    parameters: z.record(z.unknown()), // Runtime: actual schema resolved from registry
    requiresApproval: opts.requiresApproval,
    async execute(input) {
      // In-process call through the registry
      const { getOperation } = await import("../registry");
      const op = getOperation(ref._name);
      if (!op) throw new Error(`Operation not found: ${ref._name}`);
      const { createAuraContext } = await import("../create-context");
      const ctx = await createAuraContext({ source: "internal", requestId: uuidv4() });
      return op.execute({ ctx, input, params: undefined, req: undefined });
    },
  };
}

function toLangChainTool(def: AgentToolDef): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: def.name,
    description: def.description,
    schema: def.parameters instanceof z.ZodType ? def.parameters : z.record(z.unknown()),
    func: async (input) => {
      const result = await def.execute(input);
      return JSON.stringify(result);
    },
  });
}

// ─── Generate Text (non-streaming) ───

export interface GenerateTextOptions {
  threadId: string;
  prompt: string;
  userId?: string;
  maxSteps?: number;
}

export async function generateText(
  agentName: string,
  options: GenerateTextOptions,
  prisma: AuraDb = db,
): Promise<{ content: string; messageId: string; usage?: { inputTokens: number; outputTokens: number } }> {
  const agent = agentRegistry.get(agentName);
  if (!agent) throw new Error(`Agent not found: ${agentName}`);

  // Persist user message
  await prisma.auraAgentMessage.create({
    data: { id: uuidv4(), threadId: options.threadId, role: "user", content: options.prompt },
  });

  // Load thread history
  const history = await getThreadMessages(options.threadId, { limit: 50 }, prisma);
  const messages: BaseMessage[] = [
    new SystemMessage(agent.systemPrompt),
    ...history.map((m) => {
      if (m.role === "user") return new HumanMessage(m.content);
      if (m.role === "assistant") return new AIMessage(m.content);
      if (m.role === "tool") return new ToolMessage({ content: m.content, tool_call_id: m.id });
      return new HumanMessage(m.content);
    }),
  ];

  // Invoke model with tools
  const tools = agent.tools.map(toLangChainTool);
  const maxSteps = options.maxSteps ?? agent.maxSteps;
  let response: BaseMessage;
  let totalInput = 0;
  let totalOutput = 0;

  // Simple tool loop (up to maxSteps)
  for (let step = 0; step < maxSteps; step++) {
    const modelWithTools = tools.length > 0 && typeof (agent.model as { bindTools?: unknown }).bindTools === "function"
      ? ((agent.model as unknown as { bindTools: (t: unknown[]) => BaseChatModel }).bindTools(tools))
      : agent.model;

    response = await modelWithTools.invoke(messages);
    messages.push(response);

    // Track usage if available
    const usageMeta = (response as unknown as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
    if (usageMeta) {
      totalInput += usageMeta.input_tokens ?? 0;
      totalOutput += usageMeta.output_tokens ?? 0;
    }

    // Check for tool calls
    const toolCalls = (response as AIMessage).tool_calls;
    if (!toolCalls || toolCalls.length === 0) break;

    // Execute tool calls
    for (const tc of toolCalls) {
      const toolDef = agent.tools.find((t) => t.name === tc.name);
      if (!toolDef) {
        messages.push(new ToolMessage({ content: `Tool not found: ${tc.name}`, tool_call_id: tc.id! }));
        continue;
      }

      // Human-in-the-loop check
      if (toolDef.requiresApproval) {
        await prisma.auraAgentMessage.create({
          data: {
            id: uuidv4(),
            threadId: options.threadId,
            role: "tool",
            content: `[APPROVAL_REQUIRED] Tool: ${tc.name}, Args: ${JSON.stringify(tc.args)}`,
            toolCalls: toPrismaJson([{ id: tc.id, name: tc.name, args: tc.args }]),
            metadata: toPrismaJson({ status: "pending_approval" }),
          },
        });
        // Return early — agent pauses until approval
        const msgId = uuidv4();
        await prisma.auraAgentMessage.create({
          data: { id: msgId, threadId: options.threadId, role: "assistant", content: `En attente d'approbation pour l'action: ${tc.name}` },
        });
        return { content: `En attente d'approbation pour l'action: ${tc.name}`, messageId: msgId };
      }

      const result = await toolDef.execute(tc.args);
      messages.push(new ToolMessage({ content: JSON.stringify(result), tool_call_id: tc.id! }));

      // Persist tool call + result
      await prisma.auraAgentMessage.create({
        data: {
          id: uuidv4(),
          threadId: options.threadId,
          role: "tool",
          content: JSON.stringify(result),
          toolCalls: toPrismaJson([{ id: tc.id, name: tc.name, args: tc.args }]),
          toolResults: toPrismaJson([{ id: tc.id, result }]),
        },
      });
    }
  }

  // Persist assistant response
  const content = typeof response!.content === "string" ? response!.content : JSON.stringify(response!.content);
  const messageId = uuidv4();
  await prisma.auraAgentMessage.create({
    data: { id: messageId, threadId: options.threadId, role: "assistant", content },
  });

  // Record usage
  if (totalInput > 0 || totalOutput > 0) {
    await prisma.auraAIUsage.create({
      data: {
        id: uuidv4(),
        agentName,
        threadId: options.threadId,
        userId: options.userId ?? null,
        model: agent.model.getName?.() ?? "unknown",
        provider: "langchain",
        inputTokens: totalInput,
        outputTokens: totalOutput,
        totalTokens: totalInput + totalOutput,
        latencyMs: 0, // TODO: measure
        estimatedCost: null,
      },
    });
  }

  return { content, messageId, usage: { inputTokens: totalInput, outputTokens: totalOutput } };
}

// ─── Stream Text (via WebSocket broadcast) ───

export interface StreamTextOptions extends GenerateTextOptions {
  onDelta?: (delta: string) => void;
}

export async function streamText(
  agentName: string,
  options: StreamTextOptions,
  prisma: AuraDb = db,
): Promise<{ content: string; messageId: string }> {
  const agent = agentRegistry.get(agentName);
  if (!agent) throw new Error(`Agent not found: ${agentName}`);

  // Persist user message
  await prisma.auraAgentMessage.create({
    data: { id: uuidv4(), threadId: options.threadId, role: "user", content: options.prompt },
  });

  // Load history
  const history = await getThreadMessages(options.threadId, { limit: 50 }, prisma);
  const messages: BaseMessage[] = [
    new SystemMessage(agent.systemPrompt),
    ...history.map((m) => {
      if (m.role === "user") return new HumanMessage(m.content);
      if (m.role === "assistant") return new AIMessage(m.content);
      return new HumanMessage(m.content);
    }),
  ];

  const messageId = uuidv4();
  let fullContent = "";

  // Stream from model
  const stream = await agent.model.stream(messages);
  for await (const chunk of stream) {
    const delta = typeof chunk.content === "string" ? chunk.content : "";
    if (delta) {
      fullContent += delta;
      options.onDelta?.(delta);

      // Broadcast delta via WebSocket
      void publishInvalidation({
        keys: [`__agent_stream:${options.threadId}:${messageId}:${delta}`],
      });
    }
  }

  // Broadcast done signal
  void publishInvalidation({
    keys: [`__agent_stream_done:${options.threadId}:${messageId}`],
  });

  // Persist final message
  await prisma.auraAgentMessage.create({
    data: { id: messageId, threadId: options.threadId, role: "assistant", content: fullContent },
  });

  return { content: fullContent, messageId };
}

// ─── Usage Tracking ───

export async function getAgentUsage(
  opts: { userId?: string; agentName?: string; since?: Date } = {},
  prisma: AuraDb = db,
) {
  const where: Record<string, unknown> = {};
  if (opts.userId) where.userId = opts.userId;
  if (opts.agentName) where.agentName = opts.agentName;
  if (opts.since) where.createdAt = { gte: opts.since };

  const usage = await prisma.auraAIUsage.aggregate({
    where,
    _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
    _count: true,
  });

  return {
    totalCalls: usage._count,
    inputTokens: usage._sum.inputTokens ?? 0,
    outputTokens: usage._sum.outputTokens ?? 0,
    totalTokens: usage._sum.totalTokens ?? 0,
  };
}
