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
    "verify-phone-otp": { _name: "auth.verify-phone-otp", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/auth/verify-phone-otp.operation")["default"]>, InferOperationOutput<typeof import("../../operations/auth/verify-phone-otp.operation")["default"]>>,
    "vibe-logout": { _name: "auth.vibe-logout", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/auth/vibe-logout.operation")["default"]>, InferOperationOutput<typeof import("../../operations/auth/vibe-logout.operation")["default"]>>,
    "vibe-me": { _name: "auth.vibe-me", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/auth/vibe-me.operation")["default"]>, InferOperationOutput<typeof import("../../operations/auth/vibe-me.operation")["default"]>>,
  },
  services: {
    toggle: { _name: "services.toggle", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/services/toggle.operation")["default"]>, InferOperationOutput<typeof import("../../operations/services/toggle.operation")["default"]>>,
    create: { _name: "services.create", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/services/create.operation")["default"]>, InferOperationOutput<typeof import("../../operations/services/create.operation")["default"]>>,
    delete: { _name: "services.delete", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/services/delete.operation")["default"]>, InferOperationOutput<typeof import("../../operations/services/delete.operation")["default"]>>,
    update: { _name: "services.update", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/services/update.operation")["default"]>, InferOperationOutput<typeof import("../../operations/services/update.operation")["default"]>>,
    "list-mine": { _name: "services.list-mine", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/services/list-mine.operation")["default"]>, InferOperationOutput<typeof import("../../operations/services/list-mine.operation")["default"]>>,
  },
  matches: {
    refuse: { _name: "matches.refuse", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/matches/refuse.operation")["default"]>, InferOperationOutput<typeof import("../../operations/matches/refuse.operation")["default"]>>,
    accept: { _name: "matches.accept", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/matches/accept.operation")["default"]>, InferOperationOutput<typeof import("../../operations/matches/accept.operation")["default"]>>,
    "list-incoming": { _name: "matches.list-incoming", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/matches/list-incoming.operation")["default"]>, InferOperationOutput<typeof import("../../operations/matches/list-incoming.operation")["default"]>>,
    create: { _name: "matches.create", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/matches/create.operation")["default"]>, InferOperationOutput<typeof import("../../operations/matches/create.operation")["default"]>>,
  },
  agent: {
    "process-incoming": { _name: "agent.process-incoming", _type: "action" } as OperationRef<"action", InferOperationInput<typeof import("../../operations/agent/process-incoming.operation")["default"]>, InferOperationOutput<typeof import("../../operations/agent/process-incoming.operation")["default"]>>,
  },
  system: {
    health: { _name: "system.health", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/system/health.operation")["default"]>, InferOperationOutput<typeof import("../../operations/system/health.operation")["default"]>>,
  },
  matching: {
    run: { _name: "matching.run", _type: "action" } as OperationRef<"action", InferOperationInput<typeof import("../../operations/matching/run.operation")["default"]>, InferOperationOutput<typeof import("../../operations/matching/run.operation")["default"]>>,
  },
  profiles: {
    "set-consent": { _name: "profiles.set-consent", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/profiles/set-consent.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/set-consent.operation")["default"]>>,
    "get-by-alias": { _name: "profiles.get-by-alias", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/profiles/get-by-alias.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/get-by-alias.operation")["default"]>>,
    get: { _name: "profiles.get", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/profiles/get.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/get.operation")["default"]>>,
    "set-language": { _name: "profiles.set-language", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/profiles/set-language.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/set-language.operation")["default"]>>,
    update: { _name: "profiles.update", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/profiles/update.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/update.operation")["default"]>>,
  },
  payments: {
    "start-checkout": { _name: "payments.start-checkout", _type: "action" } as OperationRef<"action", InferOperationInput<typeof import("../../operations/payments/start-checkout.operation")["default"]>, InferOperationOutput<typeof import("../../operations/payments/start-checkout.operation")["default"]>>,
    "get-status": { _name: "payments.get-status", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/payments/get-status.operation")["default"]>, InferOperationOutput<typeof import("../../operations/payments/get-status.operation")["default"]>>,
  },
  todos: {
    "ai-generate": { _name: "todos.ai-generate", _type: "action" } as OperationRef<"action", InferOperationInput<typeof import("../../operations/todos/ai-generate.operation")["default"]>, InferOperationOutput<typeof import("../../operations/todos/ai-generate.operation")["default"]>>,
    toggle: { _name: "todos.toggle", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/todos/toggle.operation")["default"]>, InferOperationOutput<typeof import("../../operations/todos/toggle.operation")["default"]>>,
    create: { _name: "todos.create", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/todos/create.operation")["default"]>, InferOperationOutput<typeof import("../../operations/todos/create.operation")["default"]>>,
    delete: { _name: "todos.delete", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/todos/delete.operation")["default"]>, InferOperationOutput<typeof import("../../operations/todos/delete.operation")["default"]>>,
    list: { _name: "todos.list", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/todos/list.operation")["default"]>, InferOperationOutput<typeof import("../../operations/todos/list.operation")["default"]>>,
    update: { _name: "todos.update", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/todos/update.operation")["default"]>, InferOperationOutput<typeof import("../../operations/todos/update.operation")["default"]>>,
  },
  admin: {
    users: {
      suspend: { _name: "admin.users.suspend", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/admin/users/suspend.operation")["default"]>, InferOperationOutput<typeof import("../../operations/admin/users/suspend.operation")["default"]>>,
      reactivate: { _name: "admin.users.reactivate", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/admin/users/reactivate.operation")["default"]>, InferOperationOutput<typeof import("../../operations/admin/users/reactivate.operation")["default"]>>,
    },
  },
  chat: {
    "list-messages": { _name: "chat.list-messages", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/chat/list-messages.operation")["default"]>, InferOperationOutput<typeof import("../../operations/chat/list-messages.operation")["default"]>>,
    "list-conversations": { _name: "chat.list-conversations", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/chat/list-conversations.operation")["default"]>, InferOperationOutput<typeof import("../../operations/chat/list-conversations.operation")["default"]>>,
    "send-message": { _name: "chat.send-message", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/chat/send-message.operation")["default"]>, InferOperationOutput<typeof import("../../operations/chat/send-message.operation")["default"]>>,
  },
  ratings: {
    create: { _name: "ratings.create", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/ratings/create.operation")["default"]>, InferOperationOutput<typeof import("../../operations/ratings/create.operation")["default"]>>,
  },
  disputes: {
    create: { _name: "disputes.create", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/disputes/create.operation")["default"]>, InferOperationOutput<typeof import("../../operations/disputes/create.operation")["default"]>>,
    resolve: { _name: "disputes.resolve", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/disputes/resolve.operation")["default"]>, InferOperationOutput<typeof import("../../operations/disputes/resolve.operation")["default"]>>,
  },
} as const;
