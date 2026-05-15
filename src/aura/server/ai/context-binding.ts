/**
 * `createAuraAgent()` — factory that returns the `ctx.agent` surface.
 *
 * Wraps the registry-backed free functions in `agent.ts` (createThread,
 * generateText, streamText, getAgentUsage) into the typed `AuraAgent`
 * interface defined in `core/types.ts` (Requirements 31.3, 31.4, 31.5,
 * 35.2).
 */

import type { AuraAgent, AgentRef, AgentThreadRef } from "@/aura/core/types";
import { AuraError } from "@/aura/core/errors";
import {
  createThread,
  generateText,
  streamText,
  getAgent,
  getAgentUsage,
} from "./agent";

export async function createAuraAgent(): Promise<AuraAgent> {
  return {
    async createThread(ref: AgentRef, opts = {}) {
      // Validate the agent is registered before creating a thread.
      if (!getAgent(ref._name)) {
        throw new AuraError("NOT_FOUND", `Agent introuvable: ${ref._name}`);
      }
      const id = await createThread(ref._name, opts);
      return { _id: id, _agentName: ref._name } as AgentThreadRef;
    },

    async generateText(thread, opts) {
      const result = await generateText(thread._agentName, {
        threadId: thread._id,
        prompt: opts.prompt,
        maxSteps: opts.maxSteps,
      });
      return { content: result.content, messageId: result.messageId };
    },

    async streamText(thread, opts) {
      const result = await streamText(thread._agentName, {
        threadId: thread._id,
        prompt: opts.prompt,
        maxSteps: opts.maxSteps,
        onDelta: opts.onDelta,
      });
      return { content: result.content, messageId: result.messageId };
    },

    async getUsage(opts = {}) {
      return getAgentUsage(opts);
    },
  };
}
