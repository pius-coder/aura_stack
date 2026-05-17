import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuraMutation, useAuraQuery } from "@/aura/client";

export const Route = createFileRoute("/dev/chat")({
  component: DevChatPage,
});

const DEFAULT_PHONE = "+237612345678";

type TraceStep = {
  step: string;
  input: string;
  output: string;
  durationMs: number;
  error?: string;
};

type ChatMutationResult = {
  reply: string;
  userId: string;
  phoneE164: string;
  intent: string;
  action?: string;
  language: "FR" | "EN";
  pipelineTrace: TraceStep[];
};

type DevLabState = {
  contacts: Array<{
    userId: string;
    phoneE164: string;
    alias: string;
    displayName: string;
    locationLabel: string | null;
  }>;
  activeProfile: {
    userId: string;
    phoneE164: string;
    alias: string;
    displayName: string | null;
    bio: string | null;
    locationLabel: string | null;
    language: "FR" | "EN";
    isProvider: boolean;
    isClient: boolean;
    services: Array<{
      id: string;
      title: string;
      priceXaf: number;
      zone: string | null;
    }>;
  };
  matches: Array<{
    id: string;
    status: string;
    createdAt: string;
    isIncoming: boolean;
    counterpart: {
      userId: string;
      alias: string;
      displayName: string | null;
    };
    conversationId: string | null;
  }>;
  conversations: Array<{
    id: string;
    status: string;
    createdAt: string;
    counterpart: {
      userId: string;
      alias: string;
      displayName: string | null;
    };
    messages: Array<{
      id: string;
      body: string;
      senderId: string;
      createdAt: string;
      direction: "in" | "out";
    }>;
  }>;
  events: Array<{
    id: string;
    createdAt: string;
    title: string;
    body: string;
  }>;
};

type LabChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: string;
  trace?: TraceStep[];
  meta?: string;
};

function initialTranscript(): LabChatMessage[] {
  return [
    {
      id: "welcome",
      role: "assistant",
      text: "Bonjour. Je suis Orya. Dites-moi la personne ou le prestataire que vous cherchez, et je vous guiderai.",
      time: formatClock(new Date().toISOString()),
    },
  ];
}

function DevChatPage() {
  const [activePhone, setActivePhone] = useState(DEFAULT_PHONE);
  const [draft, setDraft] = useState("");
  const [conversationDraft, setConversationDraft] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [messagesByPhone, setMessagesByPhone] = useState<
    Record<string, LabChatMessage[]>
  >({
    [DEFAULT_PHONE]: initialTranscript(),
  });

  const stateQuery = useAuraQuery<DevLabState>("agent.dev-lab-state", {
    input: { phoneE164: activePhone },
    enabled: Boolean(activePhone),
    refetchInterval: 3000,
  });

  const chatMutation = useAuraMutation<
    { phoneE164: string; text: string },
    ChatMutationResult
  >("agent.chat-dev", {
    onSuccess: (data, variables) => {
      appendMessage(variables.phoneE164, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.reply,
        time: formatClock(new Date().toISOString()),
        trace: data.pipelineTrace,
        meta: [data.language, data.intent, data.action].filter(Boolean).join(" · "),
      });
      void stateQuery.refetch();
    },
  });

  const matchActionMutation = useAuraMutation<
    { phoneE164: string; matchId: string; action: "accept" | "refuse" | "cancel" },
    { ok: true } | { id: string; status: string }
  >("agent.dev-lab-match-action", {
    onSuccess: async () => {
      await stateQuery.refetch();
    },
  });

  const sendConversationMutation = useAuraMutation<
    { phoneE164: string; conversationId: string; body: string },
    { id: string }
  >("agent.dev-lab-send-conversation", {
    onSuccess: async () => {
      setConversationDraft("");
      await stateQuery.refetch();
    },
  });

  useEffect(() => {
    const contacts = stateQuery.data?.contacts ?? [];
    if (contacts.length === 0) return;
    const exists = contacts.some((contact) => contact.phoneE164 === activePhone);
    if (!exists) {
      setActivePhone(contacts[0].phoneE164);
    }
  }, [activePhone, stateQuery.data?.contacts]);

  useEffect(() => {
    const conversations = stateQuery.data?.conversations ?? [];
    if (conversations.length === 0) {
      setSelectedConversationId(null);
      return;
    }
    const exists = conversations.some(
      (conversation) => conversation.id === selectedConversationId,
    );
    if (!exists) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [selectedConversationId, stateQuery.data?.conversations]);

  const activeMessages = messagesByPhone[activePhone] ?? initialTranscript();
  const activeConversation =
    stateQuery.data?.conversations.find(
      (conversation) => conversation.id === selectedConversationId,
    ) ?? null;

  function appendMessage(phoneE164: string, message: LabChatMessage) {
    setMessagesByPhone((current) => ({
      ...current,
      [phoneE164]: [...(current[phoneE164] ?? initialTranscript()), message],
    }));
  }

  function handleSendToOrya() {
    const text = draft.trim();
    if (!text || chatMutation.isPending) return;

    appendMessage(activePhone, {
      id: crypto.randomUUID(),
      role: "user",
      text,
      time: formatClock(new Date().toISOString()),
    });
    setDraft("");
    chatMutation.mutate({ phoneE164: activePhone, text });
  }

  function handleSendConversation() {
    const body = conversationDraft.trim();
    if (!body || !activeConversation || sendConversationMutation.isPending) return;

    sendConversationMutation.mutate({
      phoneE164: activePhone,
      conversationId: activeConversation.id,
      body,
    });
  }

  return (
    <div className="min-h-screen bg-[#f7f3ea] text-slate-900">
      <div className="mx-auto flex max-w-[1600px] gap-4 px-4 py-4 lg:h-screen lg:py-6">
        <aside className="w-full rounded-[28px] border border-slate-200 bg-white shadow-sm lg:w-80 lg:flex-none">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Orya Lab
            </p>
            <h1 className="mt-1 text-xl font-semibold">
              Sandbox conversationnel
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Six profils seedes, un pipeline unique, et un dashboard vivant.
            </p>
          </div>

          <div className="space-y-2 p-3">
            {(stateQuery.data?.contacts ?? []).map((contact) => {
              const active = contact.phoneE164 === activePhone;
              return (
                <button
                  key={contact.phoneE164}
                  type="button"
                  onClick={() => setActivePhone(contact.phoneE164)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {contact.displayName}
                      </p>
                      <p className="text-xs text-slate-500">@{contact.alias}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                      {contact.locationLabel ?? "Cameroun"}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    {contact.phoneE164}
                  </p>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-[760px] flex-1 flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-[#efeae2] shadow-sm">
          <div className="flex items-center justify-between border-b border-black/5 bg-white px-5 py-4">
            <div>
              <p className="text-sm font-semibold">
                {stateQuery.data?.activeProfile.displayName ?? "Profil actif"}
              </p>
              <p className="text-xs text-slate-500">
                Simulation WhatsApp · {stateQuery.data?.activeProfile.phoneE164 ?? activePhone}
              </p>
            </div>
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
              {chatMutation.isPending ? "Orya reflechit..." : "Pipeline unifie actif"}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5">
            <div className="mb-4 text-center">
              <span className="inline-flex rounded-full bg-white/90 px-3 py-1 text-[11px] text-slate-500 shadow-sm">
                Testez le parcours: recherche, selection numerotee, match, acceptation, conversation.
              </span>
            </div>

            {activeMessages.map((message) => (
              <div
                key={message.id}
                className={`mb-3 flex flex-col ${
                  message.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[82%] rounded-[22px] px-4 py-3 shadow-sm ${
                    message.role === "user"
                      ? "rounded-br-md bg-[#d9fdd3]"
                      : "rounded-bl-md bg-white"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                    {message.text}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-4 text-[10px] text-slate-400">
                    <span>{message.time}</span>
                    {message.meta ? <span>{message.meta}</span> : null}
                  </div>
                </div>
                {message.trace?.length ? <TracePanel trace={message.trace} /> : null}
              </div>
            ))}

            {chatMutation.isPending ? (
              <div className="flex justify-start">
                <div className="rounded-[22px] rounded-bl-md bg-white px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:0.12s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:0.24s]" />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-black/5 bg-white px-4 py-4">
            <div className="flex items-center gap-3">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSendToOrya();
                  }
                }}
                placeholder='Essayez: "Je cherche un plombier a Douala" puis repondez "1"'
                className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm outline-none transition focus:border-emerald-300 focus:bg-white"
              />
              <button
                type="button"
                onClick={handleSendToOrya}
                disabled={!draft.trim() || chatMutation.isPending}
                className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Envoyer
              </button>
            </div>
          </div>
        </section>

        <aside className="w-full rounded-[28px] border border-slate-200 bg-white shadow-sm lg:w-[430px] lg:flex-none">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Dashboard State
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {stateQuery.data?.activeProfile.displayName ?? "Chargement..."}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {stateQuery.data?.activeProfile.bio ?? "Profil de simulation"}
            </p>
          </div>

          <div className="max-h-[calc(100vh-7rem)] space-y-5 overflow-y-auto p-5">
            <section className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Profil et services</p>
                  <p className="text-xs text-slate-500">
                    {stateQuery.data?.activeProfile.locationLabel ?? "Zone non renseignee"} ·{" "}
                    {stateQuery.data?.activeProfile.language ?? "FR"}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-slate-600">
                  {stateQuery.data?.activeProfile.isProvider ? "Prestataire" : "Utilisateur"}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {(stateQuery.data?.activeProfile.services ?? []).map((service) => (
                  <div key={service.id} className="rounded-2xl bg-white px-3 py-2">
                    <p className="text-sm font-medium">{service.title}</p>
                    <p className="text-xs text-slate-500">
                      {formatMoney(service.priceXaf)}{service.zone ? ` · ${service.zone}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Demandes de match</h3>
                <span className="text-xs text-slate-400">
                  {stateQuery.data?.matches.length ?? 0} au total
                </span>
              </div>
              <div className="space-y-2">
                {(stateQuery.data?.matches ?? []).map((match) => (
                  <div key={match.id} className="rounded-2xl border border-slate-200 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {match.isIncoming ? "Recue de" : "Envoyee a"} {match.counterpart.alias}
                        </p>
                        <p className="text-xs text-slate-500">
                          {match.counterpart.displayName ?? "Profil"} · {formatClock(match.createdAt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                        {match.status}
                      </span>
                    </div>

                    {match.status === "PENDING" ? (
                      <div className="mt-3 flex gap-2">
                        {match.isIncoming ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                matchActionMutation.mutate({
                                  phoneE164: activePhone,
                                  matchId: match.id,
                                  action: "accept",
                                })
                              }
                              className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white"
                            >
                              Accepter
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                matchActionMutation.mutate({
                                  phoneE164: activePhone,
                                  matchId: match.id,
                                  action: "refuse",
                                })
                              }
                              className="rounded-full bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700"
                            >
                              Refuser
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              matchActionMutation.mutate({
                                phoneE164: activePhone,
                                matchId: match.id,
                                action: "cancel",
                              })
                            }
                            className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
                          >
                            Annuler
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}

                {stateQuery.data?.matches.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-400">
                    Aucune demande pour ce profil.
                  </div>
                ) : null}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Conversations anonymes</h3>
                <span className="text-xs text-slate-400">
                  {stateQuery.data?.conversations.length ?? 0}
                </span>
              </div>

              <div className="space-y-2">
                {(stateQuery.data?.conversations ?? []).map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      selectedConversationId === conversation.id
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">
                        {conversation.counterpart.alias}
                      </p>
                      <span className="text-[10px] text-slate-400">
                        {conversation.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {conversation.messages.at(-1)?.body ?? "Conversation ouverte"}
                    </p>
                  </button>
                ))}
              </div>

              {activeConversation ? (
                <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {activeConversation.counterpart.alias}
                      </p>
                      <p className="text-xs text-slate-500">
                        Conversation #{activeConversation.id.slice(0, 8)}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] text-slate-600">
                      {activeConversation.status}
                    </span>
                  </div>

                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {activeConversation.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.direction === "out" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                            message.direction === "out"
                              ? "bg-[#d9fdd3]"
                              : "bg-white"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{message.body}</p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {formatClock(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input
                      value={conversationDraft}
                      onChange={(event) => setConversationDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          handleSendConversation();
                        }
                      }}
                      placeholder="Envoyer un message dans la conversation..."
                      className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-blue-300"
                    />
                    <button
                      type="button"
                      onClick={handleSendConversation}
                      disabled={
                        !conversationDraft.trim() || sendConversationMutation.isPending
                      }
                      className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                      Envoyer
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Derniers evenements</h3>
                {stateQuery.isFetching ? (
                  <span className="text-xs text-slate-400">Sync...</span>
                ) : null}
              </div>
              <div className="space-y-2">
                {(stateQuery.data?.events ?? []).map((event) => (
                  <div key={event.id} className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{event.title}</p>
                      <span className="text-[10px] text-slate-400">
                        {formatClock(event.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{event.body}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TracePanel({ trace }: { trace: TraceStep[] }) {
  const [open, setOpen] = useState(false);
  const total = trace.reduce((sum, step) => sum + step.durationMs, 0);

  return (
    <div className="mt-1 w-full max-w-[82%]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-full px-2 py-1 text-[10px] font-mono text-slate-400 transition hover:bg-white/70"
      >
        Pipeline · {trace.length} steps · {total}ms
      </button>
      {open ? (
        <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-[11px] font-mono text-slate-600 shadow-sm">
          {trace.map((step) => (
            <div key={`${step.step}-${step.durationMs}-${step.output}`} className="mb-2 last:mb-0">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{step.step}</span>
                <span className="text-slate-400">{step.durationMs}ms</span>
              </div>
              <p className="mt-1 text-slate-500">{truncate(step.output, 180)}</p>
              {step.error ? (
                <p className="mt-1 text-rose-500">{step.error}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatClock(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(amountXaf: number) {
  return `${amountXaf.toLocaleString("fr-FR")} FCFA`;
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
