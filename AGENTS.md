# Skill mappings - load `use` with `npx @tanstack/intent@latest load <use>`.
skills:
  - when: "Install TanStack Devtools, pick framework adapter (React/Vue/Solid/Preact), register plugins via plugins prop, configure shell (position, hotkeys, theme, hideUntilHover, requireUrlFlag, eventBusConfig). TanStackDevtools component, defaultOpen, localStorage persistence."
    use: "@tanstack/devtools#devtools-app-setup"
  - when: "Publish plugin to npm and submit to TanStack Devtools Marketplace. PluginMetadata registry format, plugin-registry.ts, pluginImport (importName, type), requires (packageName, minVersion), framework tagging, multi-framework submissions, featured plugins."
    use: "@tanstack/devtools#devtools-marketplace"
  - when: "Build devtools panel components that display emitted event data. Listen via EventClient.on(), handle theme (light/dark), use @tanstack/devtools-ui components. Plugin registration (name, render, id, defaultOpen), lifecycle (mount, activate, destroy), max 3 active plugins. Two paths: Solid.js core with devtools-ui for multi-framework support, or framework-specific panels."
    use: "@tanstack/devtools#devtools-plugin-panel"
  - when: "Handle devtools in production vs development. removeDevtoolsOnBuild, devDependency vs regular dependency, conditional imports, NoOp plugin variants for tree-shaking, non-Vite production exclusion patterns."
    use: "@tanstack/devtools#devtools-production"
  - when: "Two-way event patterns between devtools panel and application. App-to-devtools observation, devtools-to-app commands, time-travel debugging with snapshots and revert. structuredClone for snapshot safety, distinct event suffixes for observation vs commands, serializable payloads only."
    use: "@tanstack/devtools-event-client#devtools-bidirectional"
  - when: "Create typed EventClient for a library. Define event maps with typed payloads, pluginId auto-prepend namespacing, emit()/on()/onAll()/onAllPluginEvents() API. Connection lifecycle (5 retries, 300ms), event queuing, enabled/disabled state, SSR fallbacks, singleton pattern. Unique pluginId requirement to avoid event collisions."
    use: "@tanstack/devtools-event-client#devtools-event-client"
  - when: "Analyze library codebase for critical architecture and debugging points, add strategic event emissions. Identify middleware boundaries, state transitions, lifecycle hooks. Consolidate events (1 not 15), debounce high-frequency updates, DRY shared payload fields, guard emit() for production. Transparent server/client event bridging."
    use: "@tanstack/devtools-event-client#devtools-instrumentation"
  - when: "Configure @tanstack/devtools-vite for source inspection (data-tsd-source, inspectHotkey, ignore patterns), console piping (client-to-server, server-to-client, levels), enhanced logging, server event bus (port, host, HTTPS), production stripping (removeDevtoolsOnBuild), editor integration (launch-editor, custom editor.open). Must be FIRST plugin in Vite config. Vite ^6 || ^7 only."
    use: "@tanstack/devtools-vite#devtools-vite-plugin"
  - when: "Step-by-step migration from Next.js App Router to TanStack Start: route definition conversion, API mapping, server function conversion from Server Actions, middleware conversion, data fetching pattern changes."
    use: "@tanstack/react-start#lifecycle/migrate-from-nextjs"
  - when: "React bindings for TanStack Start: createStart, StartClient, StartServer, React-specific imports, re-exports from @tanstack/react-router, full project setup with React, useServerFn hook."
    use: "@tanstack/react-start#react-start"
  - when: "Implement, review, debug, and refactor TanStack Start React Server Components in React 19 apps. Use when tasks mention @tanstack/react-start/rsc, renderServerComponent, createCompositeComponent, CompositeComponent, renderToReadableStream, createFromReadableStream, createFromFetch, Composite Components, React Flight streams, loader or query owned RSC caching, router.invalidate, structuralSharing: false, selective SSR, stale names like renderRsc or .validator, or migration from Next App Router RSC patterns. Do not use for generic SSR or non-TanStack RSC frameworks except brief comparison."
    use: "@tanstack/react-start#react-start/server-components"
  - when: "Framework-agnostic core concepts for TanStack Router: route trees, createRouter, createRoute, createRootRoute, createRootRouteWithContext, addChildren, Register type declaration, route matching, route sorting, file naming conventions. Entry point for all router skills."
    use: "@tanstack/router-core#router-core"
  - when: "Route protection with beforeLoad, redirect()/throw redirect(), isRedirect helper, authenticated layout routes (_authenticated), non-redirect auth (inline login), RBAC with roles and permissions, auth provider integration (Auth0, Clerk, Supabase), router context for auth state."
    use: "@tanstack/router-core#router-core/auth-and-guards"
  - when: "Automatic code splitting (autoCodeSplitting), .lazy.tsx convention, createLazyFileRoute, createLazyRoute, lazyRouteComponent, getRouteApi for typed hooks in split files, codeSplitGroupings per-route override, splitBehavior programmatic config, critical vs non-critical properties."
    use: "@tanstack/router-core#router-core/code-splitting"
  - when: "Route loader option, loaderDeps for cache keys, staleTime/gcTime/ defaultPreloadStaleTime SWR caching, pendingComponent/pendingMs/ pendingMinMs, errorComponent/onError/onCatch, beforeLoad, router context and createRootRouteWithContext DI pattern, router.invalidate, Await component, deferred data loading with unawaited promises."
    use: "@tanstack/router-core#router-core/data-loading"
  - when: "Link component, useNavigate, Navigate component, router.navigate, ToOptions/NavigateOptions/LinkOptions, from/to relative navigation, activeOptions/activeProps, preloading (intent/viewport/render), preloadDelay, navigation blocking (useBlocker, Block), createLink, linkOptions helper, scroll restoration, MatchRoute."
    use: "@tanstack/router-core#router-core/navigation"
  - when: "notFound() function, notFoundComponent, defaultNotFoundComponent, notFoundMode (fuzzy/root), errorComponent, CatchBoundary, CatchNotFound, isNotFound, NotFoundRoute (deprecated), route masking (mask option, createRouteMask, unmaskOnReload)."
    use: "@tanstack/router-core#router-core/not-found-and-errors"
  - when: "Dynamic path segments ($paramName), splat routes ($ / _splat), optional params ({-$paramName}), prefix/suffix patterns ({$param}.ext), useParams, params.parse/stringify, pathParamsAllowedCharacters, i18n locale patterns."
    use: "@tanstack/router-core#router-core/path-params"
  - when: "validateSearch, search param validation with Zod/Valibot/ArkType adapters, fallback(), search middlewares (retainSearchParams, stripSearchParams), custom serialization (parseSearch, stringifySearch), search param inheritance, loaderDeps for cache keys, reading and writing search params."
    use: "@tanstack/router-core#router-core/search-params"
  - when: "Non-streaming and streaming SSR, RouterClient/RouterServer, renderRouterToString/renderRouterToStream, createRequestHandler, defaultRenderHandler/defaultStreamHandler, HeadContent/Scripts components, head route option (meta/links/styles/scripts), ScriptOnce, automatic loader dehydration/hydration, memory history on server, data serialization, document head management."
    use: "@tanstack/router-core#router-core/ssr"
  - when: "Full type inference philosophy (never cast, never annotate inferred values), Register module declaration, from narrowing on hooks and Link, strict:false for shared components, getRouteApi for code-split typed access, addChildren with object syntax for TS perf, LinkProps and ValidateLinkOptions type utilities, as const satisfies pattern."
    use: "@tanstack/router-core#router-core/type-safety"
  - when: "TanStack Router bundler plugin for route generation and automatic code splitting. Supports Vite, Webpack, Rspack, and esbuild. Configures autoCodeSplitting, routesDirectory, target framework, and code split groupings."
    use: "@tanstack/router-plugin#router-plugin"
  - when: "Core overview for TanStack Start: tanstackStart() Vite plugin, getRouter() factory, root route document shell (HeadContent, Scripts, Outlet), client/server entry points, routeTree.gen.ts, tsconfig configuration. Entry point for all Start skills."
    use: "@tanstack/start-client-core#start-core"
  - when: "Server-side authentication primitives for TanStack Start: session cookies (HttpOnly, Secure, SameSite, __Host- prefix), session read/issue/destroy via createServerFn and middleware, OAuth authorization-code flow with state and PKCE, password-reset enumeration defense, CSRF for non-GET RPCs, rate limiting auth endpoints, session rotation on privilege change. Pairs with router-core/auth-and-guards for the routing side."
    use: "@tanstack/start-client-core#start-core/auth-server-primitives"
  - when: "Deploy to Cloudflare Workers, Netlify, Vercel, Node.js/Docker, Bun, Railway. Selective SSR (ssr option per route), SPA mode, static prerendering, ISR with Cache-Control headers, SEO and head management."
    use: "@tanstack/start-client-core#start-core/deployment"
  - when: "Isomorphic-by-default principle, environment boundary functions (createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn), ClientOnly component, useHydrated hook, import protection, dead code elimination, environment variable safety (VITE_ prefix, process.env)."
    use: "@tanstack/start-client-core#start-core/execution-model"
  - when: "createMiddleware, request middleware (.server only), server function middleware (.client + .server), context passing via next({ context }), sendContext for client-server transfer, global middleware via createStart in src/start.ts, middleware factories, method order enforcement, fetch override precedence."
    use: "@tanstack/start-client-core#start-core/middleware"
  - when: "createServerFn (GET/POST), inputValidator (Zod or function), useServerFn hook, server context utilities (getRequest, getRequestHeader, setResponseHeader, setResponseStatus), error handling (throw errors, redirect, notFound), streaming, FormData handling, file organization (.functions.ts, .server.ts)."
    use: "@tanstack/start-client-core#start-core/server-functions"
  - when: "Server-side API endpoints using the server property on createFileRoute, HTTP method handlers (GET, POST, PUT, DELETE), createHandlers for per-handler middleware, handler context (request, params, context), request body parsing, response helpers, file naming for API routes."
    use: "@tanstack/start-client-core#start-core/server-routes"
  - when: "Server-side runtime for TanStack Start: createStartHandler, request/response utilities (getRequest, setResponseHeader, setCookie, getCookie, useSession), three-phase request handling, AsyncLocalStorage context."
    use: "@tanstack/start-server-core#start-server-core"
  - when: "Programmatic route tree building as an alternative to filesystem conventions: rootRoute, index, route, layout, physical, defineVirtualSubtreeConfig. Use with TanStack Router plugin's virtualRouteConfig option."
    use: "@tanstack/virtual-file-routes#virtual-file-routes"
## Testing requirements

After completing any task or phase, run all tests with:
```
bun run test
```

This executes `vitest run`. Fix any failures before marking the task done or moving to the next task.

## Aura project workflow

### Documentation de référence

| Sujet | Fichier |
|-------|---------|
| Opérations (query/mutate/action) | `docs/operations.md` |
| Services métier (AuraService) | `docs/operations.md` (section "Service layer") |
| Conventions de fichiers | `docs/folder-conventions.md` |
| Notifications | `docs/operations.md` ou `src/aura/server/notifications.ts` |
| Agents IA | `docs/ai-agents.md` |
| Workflows durables | `docs/workflows.md` |
| Contexte Aura (ctx) | `docs/context.md` |
| UI Kit (shadcn) | `docs/ui-kit.md` |
| Auth (OTP, sessions) | `docs/auth.md` |
| Realtime / broadcast | `docs/realtime.md` |
| Pagination / search | `docs/pagination-search.md` |
| HTTP actions (webhooks) | `docs/http-actions.md` |
| Scheduler / cron | `docs/scheduler-cron.md` |
| Stockage fichiers | `docs/storage.md` |
| Architecture générale | `docs/architecture.md` |
| Specs Aura | `.kiro/specs/aura-hono-tanstack-migration/requirements.md` → `design.md` |
| Specs WhatsApp | `.kiro/specs/whatsapp-ai-matchmaking-platform/requirements.md` → `design.md` |

### Pipeline par tâche

Chaque tâche suit cet ordre strict :

1. **Lire les specs** — `.kiro/specs/aura-hono-tanstack-migration/` (requirements → design) ET `.kiro/specs/whatsapp-ai-matchmaking-platform/` (requirements → design). Comprendre le `R<n>` et la couche design concernée.
2. **Lire le code existant** — `src/operations/`, `src/aura/`, `prisma/schema.prisma`, `src/app/routes/`. Lire TOUS les fichiers pertinents avant d'écrire une ligne.
3. **Lire la doc Aura** — `docs/<sujet>.md` pour comprendre le pattern à utiliser (opération, service, notification, agent, etc.).
4. **Écrire les tests d'abord** (si applicable) — dans `src/operations/_services/*.test.ts` ou `src/operations/**/*.test.ts`.
5. **Implémenter** — suivre les patterns Aura documentés :
   - Opération = thin handler (voir `docs/operations.md`)
   - Service = `extends AuraService` (voir `docs/operations.md` § Service layer)
   - Notification = `defineNotificationFn` (voir `src/aura/server/notifications.ts`)
   - Agent = `defineAgent` (voir `docs/ai-agents.md`)
   - Workflow = `defineWorkflow` (voir `docs/workflows.md`)
   - HTTP action = `defineHttpAction` (voir `docs/http-actions.md`)
6. **Lire le fichier créé** — toujours lire le fichier après l'avoir écrit pour vérifier.
7. **Lire les fichiers modifiés** — toujours relire les fichiers après les avoir modifiés.
8. **Tests** — `bun run test` (tous verts).
9. **Commit** — message clair avec scope et résumé.

### Principes

1. **Jamais de code sans specs** — toujours vérifier le requirements.md et design.md avant d'écrire.
2. **Jamais de modification sans lecture** — toujours lire TOUS les fichiers concernés avant d'éditer.
3. **Batch operations** — lire d'abord tous les fichiers du domaine, planifier les changements, puis exécuter.
4. **AuraError > Error** — toutes les erreurs métier sont `throw new AuraError("CODE", "message")`. Pas de `throw new Error(...)`.
5. **AuraService > handlers nus** — la logique métier va dans `src/operations/_services/*.ts`, pas dans le handler.
6. **defineNotificationFn > helpers manuels** — les notifications sont déclarées via `defineNotificationFn`.
7. **Pattern operation** (voir `docs/operations.md`) :
```ts
import { defineOperationFn } from "@/aura/server/operation";
import { MonService } from "@/operations/_services/mon-service";
export default defineOperationFn("domaine.action").mutate().input(z).entities([...]).auth().handler(async ({ctx, input}) => {
  return new MonService(ctx).method(input);
});
```
8. **Entity invalidation** — ne PAS appeler `ctx.invalidate()` dans les services. Le framework invalide automatiquement toutes les entités listées dans `.entities([...])` après chaque mutation.
9. **Pattern service** (voir `docs/operations.md` § Service layer) :
```ts
import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";
export class MonService extends AuraService {
  async method(input: Input) {
    const data = await this.db.model.findUnique(...);
    if (!data) throw new AuraError("NOT_FOUND", "...");
    return this.db.model.create(...);
  }
}
```
10. **Re-run review agent after fixes until zero issues** — après chaque série de correctifs, relancer l'agent de review. Tant qu'il reste des issues, corriger et re-relancer. Ne commiter qu'après un rapport "ALL CLEAR — zero issues".
11. **Tests** — tests unitaires pour les services, tests d'intégration pour les operations, property-based tests pour les algorithmes (RRF, traversal, round-trip).
12. **Review agent prompt template** — utiliser ce prompt pour vérifier le code contre les specs avant chaque commit :
```
Review ALL created/modified files against specs and docs.

## Specs references:
- R<n>: .kiro/specs/whatsapp-ai-matchmaking-platform/requirements.md lignes <xxx-yyy>
- Design couche <n>: .kiro/specs/whatsapp-ai-matchmaking-platform/design.md lignes <xxx-yyy>

## Docs:
- docs/operations.md (thin handlers, service layer)
- docs/auth.md (OTP, sessions)
- docs/storage.md (store/getUrl)
- docs/folder-conventions.md
- docs/ai-agents.md
- docs/realtime.md
- docs/workflows.md
- docs/http-actions.md
- docs/scheduler-cron.md
- docs/pagination-search.md
- docs/ui-kit.md
- docs/context.md
- docs/architecture.md
- docs/security.md
- MEMO.md (errors to avoid)
- AGENTS.md (principes)

## Framework implementations:
- src/aura/server/service.ts
- src/aura/server/storage/types.ts
- src/aura/core/errors.ts
- src/aura/server/rate-limit.ts
- src/aura/server/scheduler.ts
- src/aura/server/notifications.ts
- src/aura/server/broadcast.ts
- src/aura/server/invalidate.ts

## Files to review:
- <full paths>

## Checklist per file:
1. No as any casts
2. AuraError > Error for business errors
3. AuraService pattern — services extends AuraService, operations thin handlers (`new Service(ctx).method(args)`)
4. Import paths use @/operations/_services/name (not @/_services/)
5. No manual ctx.invalidate() in services (`.entities()` handles it)
6. storage.store takes single AuraStoreArgs `{data, filename, contentType}`, returns `{storageId,...}`
7. storage.getUrl returns Promise<string> (must await)
8. All operations registered in _registry.ts
9. Follows design.md naming (Inventaire des operations Aura section)
10. Requirements compliance (acceptance criteria)
11. ctx.notify.via() uses .catch(() => {}) fire-and-forget
12. R1-R5 / R6/R24/R25 / R11-R16 / R26-R27 compliance as applicable
13. No throw new Error(...) without AuraError

Report ALL issues with full path and line numbers. After fixes, re-run until "ALL CLEAR — zero issues".
```
<!-- intent-skills:end -->
