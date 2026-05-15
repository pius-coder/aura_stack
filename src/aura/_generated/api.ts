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
  system: {
    health: { _name: "system.health", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/system/health.operation")["default"]>, InferOperationOutput<typeof import("../../operations/system/health.operation")["default"]>>,
  },
  profiles: {
    "set-consent": { _name: "profiles.set-consent", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/profiles/set-consent.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/set-consent.operation")["default"]>>,
    "get-by-alias": { _name: "profiles.get-by-alias", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/profiles/get-by-alias.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/get-by-alias.operation")["default"]>>,
    get: { _name: "profiles.get", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/profiles/get.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/get.operation")["default"]>>,
    "set-language": { _name: "profiles.set-language", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/profiles/set-language.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/set-language.operation")["default"]>>,
    update: { _name: "profiles.update", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/profiles/update.operation")["default"]>, InferOperationOutput<typeof import("../../operations/profiles/update.operation")["default"]>>,
  },
  todos: {
    "ai-generate": { _name: "todos.ai-generate", _type: "action" } as OperationRef<"action", InferOperationInput<typeof import("../../operations/todos/ai-generate.operation")["default"]>, InferOperationOutput<typeof import("../../operations/todos/ai-generate.operation")["default"]>>,
    toggle: { _name: "todos.toggle", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/todos/toggle.operation")["default"]>, InferOperationOutput<typeof import("../../operations/todos/toggle.operation")["default"]>>,
    create: { _name: "todos.create", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/todos/create.operation")["default"]>, InferOperationOutput<typeof import("../../operations/todos/create.operation")["default"]>>,
    delete: { _name: "todos.delete", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/todos/delete.operation")["default"]>, InferOperationOutput<typeof import("../../operations/todos/delete.operation")["default"]>>,
    list: { _name: "todos.list", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/todos/list.operation")["default"]>, InferOperationOutput<typeof import("../../operations/todos/list.operation")["default"]>>,
    update: { _name: "todos.update", _type: "mutate" } as OperationRef<"mutate", InferOperationInput<typeof import("../../operations/todos/update.operation")["default"]>, InferOperationOutput<typeof import("../../operations/todos/update.operation")["default"]>>,
  },
} as const;
