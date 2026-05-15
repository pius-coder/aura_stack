# Typed API surface

Aura ships a generated `api` object that gives end-to-end type safety: full autocomplete on operation paths, type-checked input arguments, and inferred output types — no manual generics, no `as never` casts.

## Where does it come from?

`src/aura/_generated/api.ts` is **auto-generated** by the `aura:codegen` CLI from the files in `src/operations/`. It scans every `.operation.ts`, builds a nested object mirroring the dotted operation namespace, and emits a typed `OperationRef<TType, TInput, TOutput>` for each one.

```ts
// Auto-generated — do not edit.
import type { OperationRef, InferOperationInput, InferOperationOutput } from "@/aura/core/types";

export const api = {
  todos: {
    list: { _name: "todos.list", _type: "query" } as OperationRef<
      "query",
      InferOperationInput<typeof import("../../operations/todos/list.operation")["default"]>,
      InferOperationOutput<typeof import("../../operations/todos/list.operation")["default"]>
    >,
    create: { _name: "todos.create", _type: "mutate" } as OperationRef<"mutate", ...>,
    "ai-generate": { _name: "todos.ai-generate", _type: "action" } as OperationRef<"action", ...>,
  },
} as const;
```

## Regenerating

After adding, renaming, or deleting an operation:

```bash
bun run aura:codegen
```

This rewrites `_generated/api.ts` based on the current `src/operations/` tree and the registry's exports.

## Using in client code

```tsx
import { useAuraQuery, useAuraMutation } from "@/aura/client";
import { api } from "@/aura/_generated/api";

function Page() {
  // data is typed from the operation's handler return type.
  const { data, isLoading } = useAuraQuery(api.todos.list, {
    input: { numItems: 20 },
    //       ^? typed: { status?: …; cursor?: string|null; numItems: number; search?: string }
  });

  // mutate is typed from the operation's input schema.
  const create = useAuraMutation(api.todos.create);
  create.mutate({
    title: "x",          // ✅
    priority: "HIGH",    // ✅
    aiGenerated: false,  // ✅
    fakeField: 1,        // ❌ TypeScript error
  });

  return <ul>{data?.items.map((t) => <li key={t.id}>{t.title}</li>)}</ul>;
  //                  ^? items: Todo[] (from list.operation.ts handler)
}
```

## Using in operations (server-side)

Inside any handler, `ctx.runQuery` / `ctx.runMutation` / `ctx.runAction` accept either a typed `OperationRef` from the `api` object or a string name:

```ts
import { api } from "@/aura/_generated/api";

.handler(async ({ ctx }) => {
  // Typed
  const order = await ctx.runQuery(api.orders.getById, { id: "ord_123" });
  //      ^? typed Order

  // Legacy string (escape hatch for dynamic dispatch)
  const order2 = await ctx.runQuery("orders.getById", { id: "ord_123" });
  //      ^? unknown
});
```

## Type helpers

```ts
import type { InferOperationInput, InferOperationOutput } from "@/aura/core/types";
import { api } from "@/aura/_generated/api";

type ListInput = InferOperationInput<typeof api.todos.list>;
//   { status?: "PENDING" | "IN_PROGRESS" | "DONE"; cursor?: string | null; numItems?: number; search?: string }

type ListOutput = InferOperationOutput<typeof api.todos.list>;
//   { items: Todo[]; cursor: string | null; isDone: boolean }
```

These work on both `OperationRef` (the `api` object entries) and `AuraOperation` (the default export of an `.operation.ts` file).

## How inference works

The codegen emits **structural** type assertions using `import("...")["default"]` — TypeScript resolves the type lazily without bundling the operation's runtime module into the generated file. Both `OperationRef` and `AuraOperation` carry phantom `_input?` / `_output?` fields, so a single `T extends { _input?: infer TInput }` matches either shape.

This means:

- The generated file has no runtime imports of operation modules — it stays in client bundles for free.
- Renaming a Zod schema field is reflected in `useAuraQuery` autocomplete on the next save (TypeScript-driven, no codegen rerun needed for type changes).
- Adding a new operation requires running `aura:codegen` once to add it to the `api` tree.

## Editor integration

Most editors with TypeScript LSP support will:

- Autocomplete `api.<namespace>.<operation>` as you type.
- Show the operation type (`query` / `mutate` / `action`) in the hover.
- Type-check the input argument and surface field errors in the gutter.
- Jump-to-definition into the corresponding `.operation.ts` file.

## Convention: kebab-case operation names

File name → operation name mapping is **literal**:

| File | Operation name |
|------|----------------|
| `todos/list.operation.ts` | `todos.list` |
| `catalog/product-by-slug.operation.ts` | `catalog.product-by-slug` |
| `admin/users/ban.operation.ts` | `admin.users.ban` |

The codegen handles kebab keys gracefully — `api.todos["ai-generate"]` works since `ai-generate` isn't a valid identifier.
