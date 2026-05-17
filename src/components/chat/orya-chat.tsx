import { useState, useRef, useEffect } from "react";
import { useAuraMutation } from "@/aura/client";
import { api } from "@/aura/_generated/api";
import { Send, Bot, User } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: Date;
}

interface OryaChatProps {
  hasNoType?: boolean;
}

export function OryaChat({}: OryaChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Bonjour ! Je suis Orya, votre assistante de mise en relation.\n\nPosez-moi une question ou dites-moi ce que vous cherchez, je suis là pour vous guider.",
      time: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chat = useAuraMutation(api.agent["chat-with-orya"], {
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `orya-${Date.now()}`,
          role: "assistant",
          text: data.reply,
          time: new Date(),
        },
      ]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || chat.isPending) return;
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", text, time: new Date() },
    ]);
    setInput("");
    chat.mutate({ text });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                msg.role === "user"
                  ? "bg-blue-500"
                  : "bg-slate-100 ring-1 ring-slate-200"
              }`}
            >
              {msg.role === "user" ? (
                <User className="h-3.5 w-3.5 text-white" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-blue-600" />
              )}
            </div>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-500 text-white rounded-tr-sm"
                  : "bg-white border border-slate-100 text-slate-800 rounded-tl-sm shadow-sm"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}

        {chat.isPending && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200">
              <Bot className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-white border border-slate-100 px-4 py-2.5 shadow-sm">
              <div className="flex gap-1">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:0.1s]" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-100 bg-white px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Discutez avec Orya..."
            maxLength={4000}
            className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
          />
          <button
            type="submit"
            disabled={!input.trim() || chat.isPending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white disabled:opacity-40 transition-opacity"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
