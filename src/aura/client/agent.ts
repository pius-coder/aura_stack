/**
 * Client-side AI agent hooks.
 * Resolves: Requirements 32.5, 33.6 (Task 23.10).
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { callAuraOperation } from "./transport";

export interface AgentMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolCalls?: Array<{ id: string; name: string; args: unknown }>;
  toolResults?: Array<{ id: string; result: unknown }>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export function useAuraAgentThread(threadId: string | null) {
  return useQuery<AgentMessage[]>({
    queryKey: ["aura-agent-thread", threadId],
    queryFn: async () => {
      if (!threadId) return [];
      return callAuraOperation<AgentMessage[]>({
        operationName: "ai.get-thread-messages",
        input: { threadId },
      });
    },
    enabled: !!threadId,
    refetchInterval: 2000,
  });
}

export function useAuraAgentStream(threadId: string | null) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!threadId) return;

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "INVALIDATE" && data.keys) {
          for (const key of data.keys) {
            if (typeof key === "string") {
              if (key.startsWith(`__agent_stream:${threadId}:`)) {
                const parts = key.split(":");
                const delta = parts.slice(3).join(":");
                setIsStreaming(true);
                setStreamingContent((prev) => prev + delta);
              }
              if (key.startsWith(`__agent_stream_done:${threadId}:`)) {
                setIsStreaming(false);
                setStreamingContent("");
                queryClient.invalidateQueries({ queryKey: ["aura-agent-thread", threadId] });
              }
            }
          }
        }
      } catch { /* ignore parse errors */ }
    };

    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel("aura:realtime");
    bc.addEventListener("message", handler);
    return () => {
      bc.removeEventListener("message", handler);
      bc.close();
    };
  }, [threadId, queryClient]);

  return { isStreaming, streamingContent };
}

export function useAuraAgentSend(agentName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (opts: { threadId: string; prompt: string; stream?: boolean }) => {
      return callAuraOperation({
        operationName: "ai.send-message",
        input: {
          agentName,
          threadId: opts.threadId,
          prompt: opts.prompt,
          stream: opts.stream ?? false,
        },
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["aura-agent-thread", variables.threadId] });
    },
  });
}
