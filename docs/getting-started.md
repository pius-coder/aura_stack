# Getting started

## Prerequisites

- **Bun** ≥ 1.2 (`curl -fsSL https://bun.sh/install | bash`)
- **PostgreSQL** ≥ 14 running locally (or accessible URL)
- **Node.js** ≥ 20 (Bun is preferred, Node works for the build target)

## Install

```bash
bun install
```

## Configure environment

Create `.env` at the project root:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/aura_stack?schema=public"
AURA_INTERNAL_SECRET="<run: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\">"
AURA_CSRF_SECRET="<run the same command again>"
AURA_BROADCAST_PORT=3001
AURA_APP_URL="http://localhost:3000"
AURA_BROADCAST_INTERNAL_URL="http://localhost:3001"
VITE_AURA_WS_URL="ws://localhost:3001/ws"
AURA_STORAGE_DRIVER="filesystem"
AURA_STORAGE_PATH="./uploads"
# Optional — enables AI features
OPENROUTER_API_KEY="sk-or-..."
```

See [Env vars](./env-vars.md) for the full list.

## Push the schema

```bash
bun run db:push
```

## Run dev (Vite + broadcast in parallel)

```bash
bun --bun run dev
```

This launches:

- `vite dev` on `http://localhost:3000` (Vite + TanStack Start + Hono)
- `bun src/aura/server/broadcast.ts` on `http://localhost:3001` (WebSocket + HTTP `/invalidate`)

Both run concurrently via the `dev` npm script.

## Your first operation

```bash
bun aura:make operation todos.create --type mutate
```

Creates `src/operations/todos/create.operation.ts`. Edit the handler:

```ts
import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("todos.create")
  .mutate()
  .input(z.object({
    title: z.string().min(1),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  }))
  .entities(["Todo"])
  .public()
  .handler(async ({ ctx, input }) => {
    const todo = await ctx.db.todo.create({ data: input });
    ctx.bump.success("Tâche créée", todo.title);
    return todo;
  });
```

Add it to `src/operations/_registry.ts`:

```ts
export { default as todos_create } from "./todos/create.operation";
```

Re-generate the typed API:

```bash
bun run aura:codegen
```

## Use it from a route

```tsx
// src/app/routes/todos.tsx
import { useAuraMutation } from "@/aura/client";
import { api } from "@/aura/_generated/api";

const create = useAuraMutation(api.todos.create);
//      ^? data is fully typed from the operation handler
create.mutate({ title: "Acheter du pain" });
```

Done — the mutation is type-safe end-to-end, broadcasts entity invalidation, and shows a `success` toast through `<AuraBumpToaster>`.

## Build for production

```bash
bun run build
bun run preview     # local preview
```

## Tests

```bash
bun run test         # vitest run
```
