/**
 * `<AuraAgentChat>` — AI agent chat UI with streaming, tool calls, approvals.
 * Resolves: Requirement 38.3.
 */
"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { useAuraAgentThread, useAuraAgentStream, useAuraAgentSend } from "@/aura/client/agent";
import { Card, CardContent, CardHeader, CardTitle } from "@/aura/ui/card";
import { Input } from "@/aura/ui/input";
import { Button } from "@/aura/ui/button";
import { Avatar, AvatarFallback } from "@/aura/ui/avatar";
import { ScrollArea } from "@/aura/ui/scroll-area";
import { Badge } from "@/aura/ui/badge";
import { cn } from "@/lib/utils";

export interface AuraAgentChatProps {
  agentName: string;
  threadId: string;
  title?: string;
  placeholder?: string;
  showToolCalls?: boolean;
  showSources?: boolean;
  emptyState?: ReactNode;
  className?: string;
}

export function AuraAgentChat({
  agentName,
  threadId,
  title = "Assistant",
  placeholder = "Posez votre question...",
  showToolCalls = true,
  showSources: _showSources = false,
  emptyState,
  className,
}: AuraAgentChatProps) {
  const { data: messages = [] } = useAuraAgentThread(threadId);
  const { isStreaming, streamingContent } = useAuraAgentStream(threadId);
  const { mutate: send, isPending } = useAuraAgentSend(agentName);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    send({ threadId, prompt: input, stream: true });
    setInput("");
  };

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 py-4">
          {messages.length === 0 && !isStreaming ? (
            emptyState ?? (
              <div className="text-muted-foreground py-12 text-center text-sm">
                Posez votre première question.
              </div>
            )
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} showToolCalls={showToolCalls} />
              ))}
              {isStreaming && streamingContent && (
                <MessageBubble
                  message={{
                    id: "streaming",
                    threadId,
                    role: "assistant",
                    content: streamingContent,
                    createdAt: new Date().toISOString(),
                  }}
                  isStreaming
                  showToolCalls={false}
                />
              )}
              <div ref={scrollRef} />
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <form onSubmit={handleSubmit} className="border-t p-3">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            disabled={isPending || isStreaming}
            className="flex-1"
          />
          <Button type="submit" disabled={isPending || isStreaming || !input.trim()}>
            Envoyer
          </Button>
        </div>
      </form>
    </Card>
  );
}

interface MessageBubbleProps {
  message: {
    id: string;
    threadId: string;
    role: "user" | "assistant" | "tool" | "system";
    content: string;
    toolCalls?: Array<{ id: string; name: string; args: unknown }>;
    createdAt: string;
  };
  isStreaming?: boolean;
  showToolCalls?: boolean;
}

function MessageBubble({ message, isStreaming, showToolCalls }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  if (isTool && !showToolCalls) return null;

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <Avatar className="size-8 shrink-0">
        <AvatarFallback>{isUser ? "U" : isTool ? "🔧" : "🤖"}</AvatarFallback>
      </Avatar>
      <div className={cn("max-w-[80%] space-y-1", isUser && "items-end")}>
        {isTool && (
          <Badge variant="secondary" className="text-[10px]">
            Outil
          </Badge>
        )}
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : isTool
                ? "bg-muted text-muted-foreground font-mono text-xs"
                : "bg-muted",
          )}
        >
          {message.content}
          {isStreaming && <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current" />}
        </div>
        {showToolCalls && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="text-muted-foreground space-y-0.5 text-xs">
            {message.toolCalls.map((tc) => (
              <div key={tc.id}>
                → <code>{tc.name}</code>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
