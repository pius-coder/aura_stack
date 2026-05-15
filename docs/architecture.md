# Architecture

## Stack

| Layer | Technology |
|-------|-----------|
| HTTP runtime | **Hono** (`hono@4.x`) |
| React meta-framework | **TanStack Start** + **Vite** |
| ORM | **Prisma 7** + `@prisma/adapter-pg` |
| Client cache | **TanStack Query 5** |
| Auth & sessions | Aura built-in (cookies, OTP, password, phone) |
| AI | **LangChain JS** + **LangGraph** + OpenRouter/OpenAI/Anthropic |
| Realtime | Hono + Bun WebSocket broadcast server |

## Single-process model

```
┌─────────────────────────────────────────────────────────────┐
│  TanStack Start Process (Bun, port 3000)                    │
│                                                             │
│  ┌──────────────────┐    ┌──────────────────────────────┐  │
│  │  Hono HTTP Layer │    │  TanStack Start SSR/Loaders  │  │
│  │  /aura/*         │    │  route loaders, server fns   │  │
│  │  /aura-internal/*│    │                              │  │
│  │  /files/*        │    │  callAuraServer() ──────┐    │  │
│  │  /health         │    │  prefetchAuraQuery()    │    │  │
│  │  /aura-http/*    │    │                         │    │  │
│  └────────┬─────────┘    └─────────────────────────┼────┘  │
│           │                                        │        │
│           ▼                                        ▼        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Aura Core (in-process)                              │  │
│  │  registry → runner → createAuraContext → operation   │  │
│  │  → Prisma → PostgreSQL                               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

           ▲   HTTP                  ▲ WebSocket
           │                         │
┌──────────┴──────┐         ┌────────┴───────────────────────┐
│ Browser (POST   │         │  Aura Broadcast Server         │
│ /aura/*)        │         │  (Hono + Bun, port 3001)       │
│                 │         │  /invalidate (HMAC POST)       │
│                 │         │  /ws (WebSocket fan-out)       │
└─────────────────┘         └────────────────────────────────┘
```

The Aura core lives in-process: `callAuraServer()` and `ctx.runQuery()` invoke operations as direct function calls — no network hop, no HTTP overhead. The Hono `/aura/*` routes exist only for **browser clients** that speak the bridge protocol.

## Request lifecycle

### Client-driven (browser POST → operation)

1. Browser `fetch("/aura/todos.create", { method: "POST", body: { input } })`
2. Hono **bridge router** validates Content-Type, body shape, CSRF token.
3. Bridge calls `runAuraOperation({ operationName, input, request })`.
4. Runner builds an `AuraContext` (session resolution memoized via `cache()`), validates `input` against the Zod schema, applies CSRF + access control.
5. Operation handler runs.
6. Runner publishes entity invalidation to the broadcast server (HMAC-signed POST `/invalidate`) when the operation is a mutation/action.
7. Bridge serializes envelope + cookie mutations, returns JSON.

### Server-driven (loader / RSC → operation)

1. TanStack Start route loader calls `callAuraServer({ operationName, input })`.
2. `callAuraServer` resolves request headers via `getAuraRequestHeaders()` (TanStack Start's `getEvent()` from `vinxi/http`) — no HTTP request is made.
3. The runner executes the operation in the same process, sharing the request's session and `cache()` deduplication.
4. Cookie mutations are applied to the response via `setCookie/deleteCookie`.

## Folder layout

```
src/
├── aura/                      # Framework internals
│   ├── _generated/api.ts      # Auto-generated typed `api` object
│   ├── core/                  # Cross-layer types (envelope, errors, types)
│   ├── client/                # React hooks, transport, provider
│   ├── server/                # Runner, registry, context, Hono routes, AI
│   ├── shared/                # Manifest, query keys
│   ├── ui/                    # shadcn-based built-in components
│   └── cli/                   # make, codegen, doctor, cron, outbox
├── operations/                # ALL backend logic lives here
│   ├── _registry.ts           # Auto-generated import barrel
│   ├── _middleware/           # Reusable middleware
│   ├── todos/                 # Domain namespace
│   │   ├── list.operation.ts
│   │   ├── create.operation.ts
│   │   └── ...
│   └── ai/
│       └── todo-planner.agent.ts
├── app/routes/                # TanStack Start routes
├── lib/utils.ts               # `cn()` for shadcn
├── server.ts                  # Custom server entry: routes /aura/* to Hono
├── client.tsx                 # Client entry
└── styles.css                 # Tailwind + theme tokens
```

## Why two processes (app + broadcast)?

The broadcast server is **stateful** (holds WebSocket connections to every connected tab/device). Keeping it as a separate Bun process means:

- Hot reload of the app doesn't drop WebSocket clients.
- Horizontal scale: app pods are stateless; broadcast can run as a single sticky pod or a clustered Redis-fronted service.
- Mutations from any source (cron job, outbox, webhook, RSC, browser POST) reach the broadcast via signed HTTP, so all paths converge.

In dev, both run via `concurrently` from a single `bun run dev`.
