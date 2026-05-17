// AUTO-GENERATED — do not edit by hand.
// Re-run `bun run aura:codegen` (or `bun src/aura/cli/codegen.ts`) to refresh.
//
// Typed surface for every registered Aura operation. Use
// `api.namespace.operation` with `useAuraQuery`, `useAuraMutation`,
// or `ctx.runQuery / runMutation / runAction` for full inference of
// inputs and outputs.

import type { OperationRef, InferOperationInput, InferOperationOutput } from "@/aura/core/types";

export const api = {
  auth: {
    "start-phone-otp": { _name: "auth.start-phone-otp", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/auth/start-phone-otp.operation")["default"]>, InferOperationOutput<typeof import("../../operations/auth/start-phone-otp.operation")["default"]>>,
    "link-whatsapp": { _name: "auth.link-whatsapp", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/auth/link-whatsapp.operation")["default"]>, InferOperationOutput<typeof import("../../operations/auth/link-whatsapp.operation")["default"]>>,
    "verify-phone-otp": { _name: "auth.verify-phone-otp", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/auth/verify-phone-otp.operation")["default"]>, InferOperationOutput<typeof import("../../operations/auth/verify-phone-otp.operation")["default"]>>,
    "vibe-logout": { _name: "auth.vibe-logout", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/auth/vibe-logout.operation")["default"]>, InferOperationOutput<typeof import("../../operations/auth/vibe-logout.operation")["default"]>>,
    "set-password": { _name: "auth.set-password", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/auth/set-password.operation")["default"]>, InferOperationOutput<typeof import("../../operations/auth/set-password.operation")["default"]>>,
    login: { _name: "auth.login", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/auth/login.operation")["default"]>, InferOperationOutput<typeof import("../../operations/auth/login.operation")["default"]>>,
    "vibe-me": { _name: "auth.vibe-me", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/auth/vibe-me.operation")["default"]>, InferOperationOutput<typeof import("../../operations/auth/vibe-me.operation")["default"]>>,
  },
  services: {
    "list-public": { _name: "services.list-public", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/services/list-public.operation")["default"]>, InferOperationOutput<typeof import("../../operations/services/list-public.operation")["default"]>>,
    create: { _name: "services.create", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/services/create.operation")["default"]>, InferOperationOutput<typeof import("../../operations/services/create.operation")["default"]>>,
    delete: { _name: "services.delete", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/services/delete.operation")["default"]>, InferOperationOutput<typeof import("../../operations/services/delete.operation")["default"]>>,
    deactivate: { _name: "services.deactivate", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/services/deactivate.operation")["default"]>, InferOperationOutput<typeof import("../../operations/services/deactivate.operation")["default"]>>,
    update: { _name: "services.update", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/services/update.operation")["default"]>, InferOperationOutput<typeof import("../../operations/services/update.operation")["default"]>>,
    "list-mine": { _name: "services.list-mine", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/services/list-mine.operation")["default"]>, InferOperationOutput<typeof import("../../operations/services/list-mine.operation")["default"]>>,
  },
  agent: {
    "chat-dev": { _name: "agent.chat-dev", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/agent/chat-dev.operation")["default"]>, InferOperationOutput<typeof import("../../operations/agent/chat-dev.operation")["default"]>>,
    "process-incoming": { _name: "agent.process-incoming", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/agent/process-incoming.operation")["default"]>, InferOperationOutput<typeof import("../../operations/agent/process-incoming.operation")["default"]>>,
    "chat-with-orya": { _name: "agent.chat-with-orya", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/agent/chat-with-orya.operation")["default"]>, InferOperationOutput<typeof import("../../operations/agent/chat-with-orya.operation")["default"]>>,
  },
  system: {
    health: { _name: "system.health", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/system/health.operation")["default"]>, InferOperationOutput<typeof import("../../operations/system/health.operation")["default"]>>,
  },
  graph: {
    "regenerate-embedding": { _name: "graph.regenerate-embedding", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/graph/regenerate-embedding.operation")["default"]>, InferOperationOutput<typeof import("../../operations/graph/regenerate-embedding.operation")["default"]>>,
    "upsert-entity": { _name: "graph.upsert-entity", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/graph/upsert-entity.operation")["default"]>, InferOperationOutput<typeof import("../../operations/graph/upsert-entity.operation")["default"]>>,
    "upsert-relation": { _name: "graph.upsert-relation", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/graph/upsert-relation.operation")["default"]>, InferOperationOutput<typeof import("../../operations/graph/upsert-relation.operation")["default"]>>,
  },
  matching: {
    "accept-request": { _name: "matching.accept-request", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/matching/accept-request.operation")["default"]>, InferOperationOutput<typeof import("../../operations/matching/accept-request.operation")["default"]>>,
    "refuse-request": { _name: "matching.refuse-request", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/matching/refuse-request.operation")["default"]>, InferOperationOutput<typeof import("../../operations/matching/refuse-request.operation")["default"]>>,
    "create-request": { _name: "matching.create-request", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/matching/create-request.operation")["default"]>, InferOperationOutput<typeof import("../../operations/matching/create-request.operation")["default"]>>,
    run: { _name: "matching.run", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/matching/run.operation")["default"]>, InferOperationOutput<typeof import("../../operations/matching/run.operation")["default"]>>,
    "cancel-request": { _name: "matching.cancel-request", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/matching/cancel-request.operation")["default"]>, InferOperationOutput<typeof import("../../operations/matching/cancel-request.operation")["default"]>>,
    "list-mine": { _name: "matching.list-mine", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/matching/list-mine.operation")["default"]>, InferOperationOutput<typeof import("../../operations/matching/list-mine.operation")["default"]>>,
  },
  embeddings: {
    regenerate: { _name: "embeddings.regenerate", _type: "action" } as OperationRef<"action", InferOperationInput<typeof import("../../operations/embeddings/regenerate.operation")["default"]>, InferOperationOutput<typeof import("../../operations/embeddings/regenerate.operation")["default"]>>,
  },
  profiles: {
    "set-type": { _name: "profiles.set-type", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/profiles/set-type.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/set-type.operation")["default"]>>,
    "get-by-id": { _name: "profiles.get-by-id", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/profiles/get-by-id.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/get-by-id.operation")["default"]>>,
    "get-by-alias": { _name: "profiles.get-by-alias", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/profiles/get-by-alias.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/get-by-alias.operation")["default"]>>,
    upsert: { _name: "profiles.upsert", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/profiles/upsert.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/upsert.operation")["default"]>>,
    "get-photo-url": { _name: "profiles.get-photo-url", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/profiles/get-photo-url.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/get-photo-url.operation")["default"]>>,
  },
  subscriptions: {
    status: { _name: "subscriptions.status", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/subscriptions/status.operation")["default"]>, InferOperationOutput<typeof import("../../operations/subscriptions/status.operation")["default"]>>,
    cancel: { _name: "subscriptions.cancel", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/subscriptions/cancel.operation")["default"]>, InferOperationOutput<typeof import("../../operations/subscriptions/cancel.operation")["default"]>>,
  },
  payments: {
    "start-checkout": { _name: "payments.start-checkout", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/payments/start-checkout.operation")["default"]>, InferOperationOutput<typeof import("../../operations/payments/start-checkout.operation")["default"]>>,
    "list-history": { _name: "payments.list-history", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/payments/list-history.operation")["default"]>, InferOperationOutput<typeof import("../../operations/payments/list-history.operation")["default"]>>,
  },
  users: {
    "consent-record": { _name: "users.consent-record", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/users/consent-record.operation")["default"]>, InferOperationOutput<typeof import("../../operations/users/consent-record.operation")["default"]>>,
    "generate-link-code": { _name: "users.generate-link-code", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/users/generate-link-code.operation")["default"]>, InferOperationOutput<typeof import("../../operations/users/generate-link-code.operation")["default"]>>,
    "verify-email": { _name: "users.verify-email", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/users/verify-email.operation")["default"]>, InferOperationOutput<typeof import("../../operations/users/verify-email.operation")["default"]>>,
    register: { _name: "users.register", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/users/register.operation")["default"]>, InferOperationOutput<typeof import("../../operations/users/register.operation")["default"]>>,
    "set-language": { _name: "users.set-language", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/users/set-language.operation")["default"]>, InferOperationOutput<typeof import("../../operations/users/set-language.operation")["default"]>>,
    "set-region": { _name: "users.set-region", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/users/set-region.operation")["default"]>, InferOperationOutput<typeof import("../../operations/users/set-region.operation")["default"]>>,
  },
  admin: {
    "metrics-ai": { _name: "admin.metrics-ai", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/admin/metrics-ai.operation")["default"]>, InferOperationOutput<typeof import("../../operations/admin/metrics-ai.operation")["default"]>>,
    "metrics-business": { _name: "admin.metrics-business", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/admin/metrics-business.operation")["default"]>, InferOperationOutput<typeof import("../../operations/admin/metrics-business.operation")["default"]>>,
    users: {
      suspend: { _name: "admin.users.suspend", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/admin/users/suspend.operation")["default"]>, InferOperationOutput<typeof import("../../operations/admin/users/suspend.operation")["default"]>>,
      reactivate: { _name: "admin.users.reactivate", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/admin/users/reactivate.operation")["default"]>, InferOperationOutput<typeof import("../../operations/admin/users/reactivate.operation")["default"]>>,
    },
  },
  conversations: {
    "list-messages": { _name: "conversations.list-messages", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/conversations/list-messages.operation")["default"]>, InferOperationOutput<typeof import("../../operations/conversations/list-messages.operation")["default"]>>,
    close: { _name: "conversations.close", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/conversations/close.operation")["default"]>, InferOperationOutput<typeof import("../../operations/conversations/close.operation")["default"]>>,
    typing: { _name: "conversations.typing", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/conversations/typing.operation")["default"]>, InferOperationOutput<typeof import("../../operations/conversations/typing.operation")["default"]>>,
    "send-message": { _name: "conversations.send-message", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/conversations/send-message.operation")["default"]>, InferOperationOutput<typeof import("../../operations/conversations/send-message.operation")["default"]>>,
    "mark-read": { _name: "conversations.mark-read", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/conversations/mark-read.operation")["default"]>, InferOperationOutput<typeof import("../../operations/conversations/mark-read.operation")["default"]>>,
    "list-mine": { _name: "conversations.list-mine", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/conversations/list-mine.operation")["default"]>, InferOperationOutput<typeof import("../../operations/conversations/list-mine.operation")["default"]>>,
  },
  ratings: {
    "stats-by-user": { _name: "ratings.stats-by-user", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/ratings/stats-by-user.operation")["default"]>, InferOperationOutput<typeof import("../../operations/ratings/stats-by-user.operation")["default"]>>,
    submit: { _name: "ratings.submit", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/ratings/submit.operation")["default"]>, InferOperationOutput<typeof import("../../operations/ratings/submit.operation")["default"]>>,
  },
  disputes: {
    report: { _name: "disputes.report", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/disputes/report.operation")["default"]>, InferOperationOutput<typeof import("../../operations/disputes/report.operation")["default"]>>,
    "list-pending": { _name: "disputes.list-pending", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/disputes/list-pending.operation")["default"]>, InferOperationOutput<typeof import("../../operations/disputes/list-pending.operation")["default"]>>,
    resolve: { _name: "disputes.resolve", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/disputes/resolve.operation")["default"]>, InferOperationOutput<typeof import("../../operations/disputes/resolve.operation")["default"]>>,
  },
} as const;
