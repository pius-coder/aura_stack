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
  system: {
    health: { _name: "system.health", _type: "query" } as OperationRef<"query", InferOperationInput<typeof import("../../operations/system/health.operation")["default"]>, InferOperationOutput<typeof import("../../operations/system/health.operation")["default"]>>,
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
