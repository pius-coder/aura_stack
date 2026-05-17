STRICT RULES DOCUMENT — Aura Project Implementation
Section 1: Pipeline & Workflow Rules
Rule 1.1: Always read specs before writing code. Every task begins by reading .kiro/specs/ requirements, then design, then tasks. You must understand the R<n> requirement number and the design layer being addressed. Source: AGENTS.md § Pipeline par tâche (lines 100-116), MEMO.md §2, and design.md line 5.
Rule 1.2: Read ALL relevant existing code before editing. Before writing a single line, read:
- 
src/operations/ (all related operation files)
- 
src/aura/ (framework implementations)
- 
prisma/schema.prisma (data models)
- 
src/app/routes/ (relevant routes)
Source: AGENTS.md line 103, MEMO.md error 1-2 ("J'ai dit que X n'existait pas — FAUX, tout existait").
Rule 1.3: Read the Aura doc for the subject BEFORE implementing. Always consult docs/<subject>.md for the pattern being used (operations, services, notifications, agents, workflows, http-actions, scheduler, storage, etc.). Source: AGENTS.md line 104.
Rule 1.4: Write tests first (when applicable). Tests go in src/operations/_services/*.test.ts or src/operations/**/*.test.ts. Source: AGENTS.md line 105.
Rule 1.5: Implement following documented Aura patterns. Each artifact type has a specific pattern:
- 
Operation = thin handler using defineOperationFn (docs/operations.md)
- 
Service = extends AuraService (docs/operations.md § Service layer)
- 
Notification = defineNotificationFn (src/aura/server/notifications.ts)
- 
Agent = defineAgent (docs/ai-agents.md)
- 
Workflow = defineWorkflow (docs/workflows.md)
- 
HTTP action = defineHttpAction (docs/http-actions.md)
Source: AGENTS.md lines 106-112.
Rule 1.6: Re-read every created or modified file after writing. This is not optional. Source: AGENTS.md lines 113-114, MEMO.md error 9.
Rule 1.7: Run bun run test after every change. All tests must pass. Source: AGENTS.md lines 67-72, 115.
Rule 1.8: Run review agent before ANY commit. Use the full prompt template from AGENTS.md §12. If issues are found, fix them and re-run the review agent. Do NOT commit until the report says "ALL CLEAR — zero issues". Source: AGENTS.md lines 119-203, MEMO.md error 10.
Rule 1.9: Run bun run tsc --noEmit and fix ALL type errors before committing. Source: AGENTS.md line 147 (implied by "Re-run review agent after fixes until zero issues"), MEMO.md error 9.
Rule 1.10: Batch operations pattern. Read all files in a domain first, plan all changes, then execute. Never do one-off edits. Source: AGENTS.md line 122.
Rule 1.11: No code without specs. Always verify requirements.md and design.md before writing. Source: AGENTS.md line 120.
Section 2: AuraService Pattern Rules
Rule 2.1: Services extend AuraService. Every business logic service must extend the AuraService base class. Source: docs/operations.md lines 194-208, MEMO.md §4 (lines 89-107), src/aura/server/service.ts.
import { AuraService } from "@/aura/server/service";
import { AuraError } from "@/aura/core/errors";
export class MonService extends AuraService {
  async method(userId: string, args: Input) {
    const data = await this.db.model.findUnique({ where: { id: args.id } });
    if (!data) throw new AuraError("NOT_FOUND", "...");
    return this.db.model.create({ data: { ... } });
  }
}
Rule 2.2: Constructor takes ctx, methods take business arguments only. The AuraContext is passed to the constructor. Service methods receive only the business arguments they need — never the full ctx. Source: docs/operations.md lines 189-191, design.md lines 15-37.
// ✅ CORRECT
const svc = new MonService(ctx);
return svc.method(ctx.user.id, input.someField);
// ❌ WRONG — never pass ctx to methods
return svc.method(ctx, input);
Rule 2.3: Available this.* properties in AuraService. Source: docs/operations.md lines 211-228, src/aura/server/service.ts lines 6-24.
Property	Source	Type
this.db	ctx.db	PrismaClient
this.user	ctx.user	AuraUser
this.session	ctx.session	AuraSessionData
this.agent	ctx.agent	AuraAgent
this.scheduler	ctx.scheduler	AuraScheduler
this.storage	ctx.storage	AuraStorage
this.notify	ctx.notify	NotificationDispatcher
this.log	ctx.log	AuraLogger
this.audit	ctx.audit	AuraAuditContext
this.bump	ctx.bump	AuraBumpStore
this.requestId	ctx.requestId	string
this.source	ctx.source	AuraSource
this.auth	ctx.auth	AuraAuthContext
this.invalidate(t)	ctx.invalidate	({ entity: string; id?: string }) => void
this.paginate(m, o)	ctx.paginate	Cursor pagination
this.runQuery(r, i)	ctx.runQuery	Typed in-process call
this.runMutation(r, i)	ctx.runMutation	Typed in-process call
this.runAction(r, i)	ctx.runAction	Typed in-process call
Rule 2.4: NEVER call ctx.invalidate() in services. The .entities([...]) declaration on the operation handler handles entity invalidation automatically after mutations. Manual ctx.invalidate() in services is forbidden. Source: AGENTS.md § Principles line 134, MEMO.md error 11.
// ✅ CORRECT — entities declared on operation, not called in service
defineOperationFn("x").mutate().entities(["EntityName"]).handler(...)
// ❌ WRONG — never call this in service methods
this.invalidate({ entity: "EntityName", id: "..." });
Rule 2.5: NEVER pass ctx to business logic methods. The ctx is for the constructor only. Source: docs/operations.md lines 189-191.
Rule 2.6: Services go in src/operations/_services/. The _services/ directory is reserved. It does not contribute to operation naming. Source: docs/folder-conventions.md lines 10-12, docs/operations.md line 243.
Rule 2.7: Service composition via constructor injection. When a service depends on another service, inject it via the constructor. Source: docs/operations.md lines 231-238.
export class PaymentService extends AuraService {
  constructor(ctx: AuraContext, private userSvc: UserService) {
    super(ctx);
  }
}
Section 3: Storage API Rules
Rule 3.1: storage.store() takes ONE argument of type AuraStoreArgs. Source: src/aura/server/storage/types.ts lines 22-31.
interface AuraStoreArgs {
  data: Buffer | File | string;     // Raw bytes, Web File, or data URL
  filename: string;                  // Original filename
  contentType?: string;              // Optional content-type override
  metadata?: Record<string, unknown>;
}
Rule 3.2: storage.store() returns AuraStoredFileResult. Source: src/aura/server/storage/types.ts lines 33-38.
interface AuraStoredFileResult {
  storageId: string;    // ← THIS is what you use for getUrl()
  filename: string;
  contentType: string;
  size: number;
}
Rule 3.3: Use result.storageId — NOT result.id. The field is called storageId, not id. Source: MEMO.md error 2, confirmed by src/aura/server/storage/types.ts line 34.
// ✅ CORRECT
const stored = await ctx.storage.store({ data: file, filename: "photo.jpg" });
const url = await ctx.storage.getUrl(stored.storageId);
// ❌ WRONG — no such field
stored.id;
Rule 3.4: storage.store() call pattern — single object argument, not positional. Source: docs/storage.md lines 22-24, corrected in MEMO.md error 1.
// ✅ CORRECT
await ctx.storage.store({ data: fileBuffer, filename: "photo.jpg", contentType: "image/jpeg" });
// ❌ WRONG — two positional args
await ctx.storage.store(file, { path: "..." });
Rule 3.5: storage.getUrl() returns Promise<string> — MUST be awaited. Source: src/aura/server/storage/types.ts line 63, MEMO.md error 3.
// ✅ CORRECT
const url = await ctx.storage.getUrl(storageId);
// ❌ WRONG — returns Promise<string>, not string
const url = ctx.storage.getUrl(storageId);
Rule 3.6: storage.delete() does NOT exist — use storage.removeStoredFile(). Source: src/aura/server/storage/types.ts line 64.
await ctx.storage.removeStoredFile(storageId);
Section 4: Type Safety Rules
Rule 4.1: NO as any casts in production code. This is CRITICAL. Source: MEMO.md §8 Error 1 (line 222), AGENTS.md review checklist line 189.
// ❌ WRONG — NEVER
const x = y as any;
// ✅ CORRECT — use proper types
const x: KnownType = methodReturningKnownType();
Rule 4.2: as unknown is allowed ONLY for test mocks. Specifically as unknown as AuraContext for mock creation. Source: MEMO.md §8 (pattern from test files).
// ✅ ACCEPTABLE ONLY IN TESTS
const ctx = { db: mockDb, user: mockUser } as unknown as AuraContext;
Rule 4.3: Import paths must use @/operations/_services/name NEVER @/_services/name. Source: MEMO.md error 3, AGENTS.md review checklist line 192.
// ✅ CORRECT
import { PaymentService } from "@/operations/_services/payment-service";
// ❌ WRONG — does not resolve
import { PaymentService } from "@/_services/payment-service";
Rule 4.4: Import operation refs from @/aura/_generated/api. Source: docs/context.md lines 57-58.
import { api } from "@/aura/_generated/api";
const result = await ctx.runQuery(api.orders.getById, { id: "..." });
Rule 4.5: Never use (window as any).ENV — use declare global interface Window. Source: MEMO.md error 16.
// ✅ CORRECT
declare global {
  interface Window {
    ENV?: Record<string, string>;
  }
}
const env = window.ENV;
// ❌ WRONG
const env = (window as any).ENV;
Rule 4.6: useRef for lastEvent causes stale closure — use useState. Source: MEMO.md error 15.
// ✅ CORRECT
const [lastEvent, setLastEvent] = useState<string | null>(null);
// ❌ WRONG — always stale in callbacks
const lastEventRef = useRef<string | null>(null);
Rule 4.7: onEvent in useCallback dependency array. The onEvent callback must be in the dependency array of useCallback or useEffect. Source: MEMO.md error 14.
Section 5: AuraError Rules
Rule 5.1: Business errors MUST use AuraError, never Error. Source: MEMO.md error 6, AGENTS.md line 123, src/aura/core/errors.ts.
// ✅ CORRECT
throw new AuraError("NOT_FOUND", "Message d'erreur");
// ❌ WRONG — gives 500 without clear client message
throw new Error("Something went wrong");
Rule 5.2: Error codes and their HTTP status. Source: src/aura/core/errors.ts lines 46-74.
Code	HTTP Status	When
VALIDATION_ERROR	400	Zod validation failure
BAD_REQUEST	400	Invalid business state
UNAUTHORIZED	401	Wrong password, missing auth
SESSION_EXPIRED	401	Session expired
SESSION_REVOKED	401	Session revoked
FORBIDDEN	403	Insufficient permissions
CSRF_ERROR	403	CSRF validation failure
NOT_FOUND	404	Resource not found
CONFLICT	409	Duplicate resource
RATE_LIMITED	429	Rate limit exceeded
INTERNAL_ERROR	500	Unexpected errors (never expose details)
Rule 5.3: Wrong password/login = UNAUTHORIZED, not NOT_FOUND. Source: docs/auth.md lines 108-111.
if (!cred || !await verifyPassword(password, cred.passwordHash)) {
  throw new AuraError("UNAUTHORIZED", "Identifiants invalides.");
}
Rule 5.4: AuraError can include fieldErrors for Zod validation feedback. Source: docs/security.md lines 93-99.
throw new AuraError("VALIDATION_ERROR", "Données invalides.", {
  fieldErrors: { "email": ["Format d'email invalide"] },
});
Rule 5.5: AuraError is automatically serialized to JSON envelope. It is returned to the client with proper HTTP status. Non-AuraError exceptions result in a generic 500 response.
Section 6: Operation Handler Rules
Rule 6.1: Operations are THIN HANDLERS ONLY. An operation handler should: validate input, check auth, instantiate service, delegate business logic. Nothing more. Source: docs/operations.md lines 174-209, MEMO.md §4 (lines 92-100), design.md lines 15-27.
// ✅ CORRECT — thin handler
export default defineOperationFn("matches.create")
  .mutate()
  .input(z.object({ targetUserId: z.string() }))
  .entities(["Match"])
  .auth()
  .handler(async ({ ctx, input }) => {
    const svc = new MatchService(ctx);
    return svc.create(ctx.user.id, input.targetUserId);
  });
// ❌ WRONG — business logic in handler
export default defineOperationFn("matches.create")
  .mutate()
  .handler(async ({ ctx, input }) => {
    // DO NOT put DB queries or business logic here
    const existing = await ctx.db.match.findFirst({ ... });
    if (existing) throw new AuraError("CONFLICT", "...");
    return ctx.db.match.create({ ... });
  });
Rule 6.2: .entities([...]) for entity invalidation — NEVER call ctx.invalidate() manually in the operation handler. Source: docs/operations.md lines 118-148, AGENTS.md line 134.
Rule 6.3: .mutate() gives full DB access. .action() has a TOMBSTONED DB proxy. Never use ctx.db.* inside an .action() — it will crash. Source: MEMO.md §4 (lines 157-161, heading "Le Problème .action()"), docs/context.md lines 31-33, docs/security.md lines 109-111.
// ✅ CORRECT — use .mutate() for operations that need DB access
defineOperationFn("x").mutate().handler(async ({ ctx }) => {
  return ctx.db.model.create({ ... });
});
// ❌ WRONG — ctx.db throws in .action()
defineOperationFn("x").action().handler(async ({ ctx }) => {
  return ctx.db.model.create({ ... }); // CRASHES
});
// ✅ CORRECT — use ctx.runQuery/runMutation in .action()
defineOperationFn("x").action().handler(async ({ ctx }) => {
  return ctx.runMutation(api.model.create, { ... });
});
Rule 6.4: Use .action() only for side-effect-only operations. Actions are for webhooks, file uploads, payments, AI calls — anything that does external I/O but no direct DB access. Source: docs/operations.md lines 7-10.
Rule 6.5: All operations must be registered in _registry.ts. Missing registry imports cause operations to never be registered. Source: MEMO.md error 7, docs/folder-conventions.md lines 99-109.
Rule 6.6: Operation handler builder stages must be in order. Required: .query()/.mutate()/.action() → .input(zod) (optional) → .entities([tags]) (optional) → .use(middleware) (optional) → .auth()/.public()/.internal() (required) → .handler(fn) (terminal). Source: docs/operations.md lines 33-40.
Rule 6.7: Use .public() for unauthenticated endpoints, .auth() for authenticated, .internal() for cron/internal only. Source: docs/operations.md lines 42-50.
Section 7: Notification Rules
Rule 7.1: Always use defineNotificationFn, never manual helpers. Source: MEMO.md error 4, AGENTS.md line 125.
// ✅ CORRECT
export default defineNotificationFn("match-request")
  .payload(z.object({ phoneE164: z.string(), language: z.string() }))
  .handler(async ({ payload }) => {
    await gateway.sendText(payload.phoneE164, "Message", `key-${Date.now()}`);
  });
Rule 7.2: Dispatch via ctx.notify.via("name").send(payload).catch(() => {}). The .catch(() => {}) is required for fire-and-forget dispatch. Source: MEMO.md line 153, docs/operations.md line 205.
await ctx.notify.via("match-request").send({ phoneE164, language }).catch(() => {});
Rule 7.3: Notification files MUST be side-effect imported in _registry.ts. Without this, hasNotification() returns false and the dispatch throws INTERNAL_ERROR. Source: MEMO.md error 7.
// In _registry.ts:
import "./notifications/match-request.notification";
import "./notifications/match-accepted.notification";
// etc.
Rule 7.4: Test files must import notification .notification.ts files explicitly. Source: MEMO.md error 8.
Rule 7.5: Notification files go in src/operations/notifications/. The suffix is .notification.ts. Source: docs/folder-conventions.md lines 29-31.
Section 8: Test Rules
Rule 8.1: Mock AuraContext with as unknown as AuraContext. Source: MEMO.md (test patterns).
const mockDb = { match: { findUnique: vi.fn(), create: vi.fn() } };
const ctx = { db: mockDb, user: { id: "user-1" }, /* ... */ } as unknown as AuraContext;
Rule 8.2: Mock only the DB methods the service uses. Don't mock the entire PrismaClient.
Rule 8.3: Import notification files explicitly in test files. Source: MEMO.md error 8.
Rule 8.4: Test both happy path AND error paths. Every error condition in the service should have a corresponding test case.
Rule 8.5: Test persona guardrail retry and fallback paths. For agents using persona guardrails, test the retry logic (2 attempts) and the fallback response.
Rule 8.6: Property-based tests for algorithms. RRF, graph traversal, entity round-trip, and diversity mix should have property-based tests using fast-check. Source: tasks.md lines 484-489, design.md R47.
Section 9: Review & Commit Rules
Rule 9.1: Run the review agent with the FULL prompt template before every commit. Source: AGENTS.md lines 149-203, MEMO.md error 10.
Rule 9.2: The review agent prompt template must include: Source: AGENTS.md §12.
1. 
Specs references with line numbers
2. 
Docs references
3. 
Framework implementation files
4. 
Files to review (full paths)
5. 
The 13-point checklist:
 1. 
No as any casts
 2. 
AuraError > Error for business errors
 3. 
AuraService pattern — services extends AuraService, operations thin handlers
 4. 
Import paths use @/operations/_services/name
 5. 
No manual ctx.invalidate() in services
 6. 
storage.store takes single AuraStoreArgs
 7. 
storage.getUrl returns Promise<string> (must await)
 8. 
All operations registered in _registry.ts
 9. 
Follows design.md naming (Inventaire des operations)
10. 
Requirements compliance (acceptance criteria)
11. 
ctx.notify.via() uses .catch(() => {}) fire-and-forget
12. 
R1-R5 / R6/R24/R25 / R11-R16 / R26-R27 compliance as applicable
13. 
No throw new Error(...) without AuraError
Rule 9.3: Re-run the review agent after fixes until zero issues. Do NOT commit after the first pass if issues remain. Keep fixing and re-running until "ALL CLEAR — zero issues". Source: AGENTS.md line 147.
Rule 9.4: Run bun run tsc --noEmit and fix ALL errors before committing. TypeScript errors must be zero. Source: MEMO.md error 9, AGENTS.md line 147 (implied).
Rule 9.5: Run bun run test — ALL tests must pass before committing. Source: AGENTS.md lines 67-72.
Rule 9.6: Commit message format: clear scope + summary. Source: AGENTS.md line 116.
feat(scope): description
// or
fix(scope): description
// or
refactor(scope): description
Section 10: Common Mistakes Encyclopedia
Mistake 1: Wrong storage API — two positional args instead of single AuraStoreArgs.
- 
When: Calling ctx.storage.store(file, { path: "..." })
- 
Fix: ctx.storage.store({ data: fileBuffer, filename: "photo.jpg", contentType: "image/jpeg" })
- 
Source: MEMO.md error 1, src/aura/server/storage/types.ts lines 22-31
Mistake 2: Wrong field name — stored.id instead of stored.storageId.
- 
When: Accessing stored.id on the result from storage.store()
- 
Fix: Use stored.storageId
- 
Source: MEMO.md error 2, src/aura/server/storage/types.ts line 34
Mistake 3: Missing await on getUrl().
- 
When: const url = ctx.storage.getUrl(storageId) without await
- 
Fix: const url = await ctx.storage.getUrl(storageId)
- 
Source: MEMO.md error 3, src/aura/server/storage/types.ts line 63
Mistake 4: Private/public method name collision (generateLinkCode).
- 
When: A private helper method has the same name as a public method in the same service
- 
Fix: Prefix private method with underscore or use distinct names (e.g., makeLinkCode for private, generateLinkCode for public)
- 
Source: MEMO.md §4 (line 4 in the table)
Mistake 5: as any casts in production code.
- 
When: Using as any to bypass TypeScript type checking in business logic or services
- 
Fix: Properly type all variables; never use as any in production code
- 
Source: MEMO.md error 1 in §8 (line 222), AGENTS.md line 189
Mistake 6: Business logic in operation handlers instead of services.
- 
When: Putting DB queries, validation, and side effects directly in the .handler() body
- 
Fix: Operations are thin handlers — delegate to a service via new Service(ctx).method(args)
- 
Source: MEMO.md §4 (lines 92-100), docs/operations.md lines 174-209
Mistake 7: Missing registry imports for operations and notifications.
- 
When: Creating new operations or notifications without adding side-effect imports to _registry.ts
- 
Fix: Add import "./notifications/name.notification" or export { default as ns_op } from "./ns/op.operation" to _registry.ts
- 
Source: MEMO.md error 7
Mistake 8: Not running the review agent before committing.
- 
When: Committing without running the review agent first
- 
Fix: Always run the review agent with the full prompt template before any commit
- 
Source: MEMO.md error 10, AGENTS.md §12
Mistake 9: Not running bun run tsc --noEmit before committing.
- 
When: Committing with TypeScript errors
- 
Fix: Always run bun run tsc --noEmit and fix all errors first
- 
Source: MEMO.md error 9
Mistake 10: Phantom fields in types that don't exist on the model.
- 
When: Referencing businessName, countryId, currencyCode on AuraUser — these fields do not exist on the model
- 
Fix: Remove phantom fields from type definitions and code; only use fields that actually exist on prisma/schema.prisma models
- 
Source: MEMO.md §3 (lines 75-76), tasks.md lines 82-84
Mistake 11: ctx.invalidate() called from services.
- 
When: Calling this.invalidate() or ctx.invalidate() inside a service method
- 
Fix: The .entities([...]) on the operation handler handles this automatically. Remove manual invalidation from services.
- 
Source: MEMO.md error 11, AGENTS.md line 134
Mistake 12: Using .mutate() for operations that do no DB writes.
- 
When: Using .mutate() on an operation that only reads data or does external side effects
- 
Fix: Use .query() for reads, .action() for side-effect-only operations, .mutate() only when writing to DB
- 
Source: MEMO.md (referenced: "Typing.operation with .mutate() — causes spurious INVALIDATE, should use .action()")
Mistake 13: Chat messages not published to WebSocket room.
- 
When: A send-message operation returns the message but doesn't broadcast to the room
- 
Fix: Delegate to ChatService which handles publishEvent to room conversation:{id} and user:{recipientId}
- 
Source: MEMO.md error 13, docs/realtime.md
Mistake 14: onEvent callback not in useCallback dependency array.
- 
When: Using a callback from props/state inside useEffect or useCallback without listing it as a dependency
- 
Fix: Include the callback in the dependency array or use a ref pattern
- 
Source: MEMO.md error 14
Mistake 15: Using useRef for lastEvent — always stale.
- 
When: Storing the last received event in a useRef and reading it inside callbacks
- 
Fix: Use useState for values that need to trigger re-renders or be read in callbacks
- 
Source: MEMO.md error 15
Mistake 16: (window as any).ENV — pollutes global.
- 
When: Accessing environment variables via (window as any).ENV
- 
Fix: Use declare global { interface Window { ENV?: Record<string, string> } } then window.ENV
- 
Source: MEMO.md error 16
Mistake 17: Manually creating notification helpers instead of using defineNotificationFn.
- 
When: Creating files like src/lib/notifications/send.ts with manual helper functions
- 
Fix: Delete manual helpers, use defineNotificationFn with .payload(z).handler(fn)
- 
Source: MEMO.md error 4
Mistake 18: Not reading all existing code before making assertions about features.
- 
When: Stating that features don't exist without verifying the codebase first
- 
Fix: Grep/read the actual code before stating anything about feature existence
- 
Source: MEMO.md §3 (lines 56-69) — the most critical error
Mistake 19: Using .action() with ctx.db.* — DB proxy is tombstoned.
- 
When: Using ctx.db.model.create() inside an .action() handler
- 
Fix: Either use .mutate() (full DB access) or use ctx.runQuery/runMutation from within the action
- 
Source: MEMO.md error 5, docs/context.md lines 51-52
Mistake 20: Wrong import path @/_services/ instead of @/operations/_services/.
- 
When: Importing from @/_services/payment-service
- 
Fix: Use @/operations/_services/payment-service
- 
Source: MEMO.md error 3
Section 11: File & Naming Conventions
Rule 11.1: All files use kebab-case. No camelCase, PascalCase, or snake_case for file names. Source: docs/folder-conventions.md lines 76-88.
// ✅ CORRECT
product-by-slug.operation.ts
with-organization.middleware.ts
customer-support.agent.ts
// ❌ WRONG
productBySlug.operation.ts
withOrganization.middleware.ts
CustomerSupport.agent.ts
Rule 11.2: Suffix mapping for artifact types. Source: docs/folder-conventions.md lines 41-54.
Suffix	Artifact	Builder
.operation.ts	Query, mutation, action	defineOperationFn(name)
.service.ts	Business service (in _services/)	extends AuraService
.middleware.ts	Operation middleware	defineCommonFn(name)
.cron.ts	Scheduled cron job	defineCronFn(name)
.workflow.ts	Durable workflow	defineWorkflow(name)
.agent.ts	AI agent	defineAgent(name, {...})
.http.ts	Raw HTTP handler	defineHttpAction(path, method)
.rag.ts	RAG source	defineRAGSource(name, {...})
.search.ts	Full-text search index	defineSearchIndex(model, {...})
.vector.ts	pgvector index	defineVectorIndex(model, {...})
.db-read.ts	Optimized DB read	defineDbReadFn({...})
.component.ts	Aura component	defineComponent(name, {...})
.notification.ts	Notification definition	defineNotificationFn(name)
Rule 11.3: Operation name derivation from file path. Source: docs/folder-conventions.md lines 59-72.
src/operations/<dir1>/<dir2>/<file>.<suffix>.ts   →   <dir1>.<dir2>.<file>
Examples:
File path	Derived name
system/health.operation.ts	system.health
todos/list.operation.ts	todos.list
admin/users/ban.operation.ts	admin.users.ban
webhooks/stripe.http.ts	HTTP path: /webhooks/stripe
Rule 11.4: Directories starting with _ are NOT namespace segments. Source: docs/folder-conventions.md lines 73-74.
- 
_services/ — reserved for business logic services, does NOT contribute to operation names
- 
_middleware/ — reserved for middleware, does NOT contribute to operation names
Rule 11.5: The dotted operation name with kebab-case preserves hyphens. Source: docs/folder-conventions.md lines 90-95.
api.catalog["product-by-slug"]   // NOT api.catalog.productBySlug
ctx.runQuery(api.catalog["product-by-slug"], { slug })
Rule 11.6: One artifact per file. No two defineOperationFn calls in the same file. Source: docs/folder-conventions.md line 117.
Rule 11.7: UI components go in src/components/<feature>/. Not in src/aura/ui/ (that's for Aura framework internals). Source: MEMO.md §8 error 15 (lines 274-289).
src/components/chat/
├── chat-sidebar.tsx
├── chat-conversation.tsx
├── chat-message.tsx
└── chat-input.tsx
src/components/contacts/
├── contact-list.tsx
└── contact-card.tsx
Rule 11.8: Services directory structure. Source: design.md lines 600-610.
src/operations/
├── _services/                      # Business logic services (AuraService)
│   ├── inbox-service.ts            # Couche 1 — Transport WhatsApp
│   ├── user-agent-service.ts       # Couche 2 — Graphe_Agent_User
│   ├── matching-service.ts         # Couche 3 — Orchestrateur Matching
│   ├── knowledge-graph-service.ts  # Couche 4 — Knowledge Graph
│   ├── chat-service.ts             # Couche 5 — Chat temps réel
│   ├── payment-service.ts          # Couche 6 — Paiement
│   └── alias-service.ts            # Génération d'alias
├── _middleware/
├── users/
├── profiles/
├── services/
├── matching/
├── conversations/
├── ratings/
├── disputes/
├── admin/
├── payments/
├── subscriptions/
├── notifications/
├── graph/
├── webhooks/
├── ai/
├── workflows/
└── analytics/
Section 12: Additional Context Rules
Rule 12.1: Use .auth.setSessionCookie() and .auth.clearSessionCookie() for session management in operations. Source: docs/auth.md lines 52-60.
import { createSession } from "@/aura/server/auth/session";
const { token, expiresAt } = await createSession(ctx.db, user.id);
ctx.auth.setSessionCookie(token, expiresAt);
Rule 12.2: Use enforceRateLimit for cross-process rate limiting. Source: docs/security.md lines 39-49, src/aura/server/rate-limit.ts.
import { enforceRateLimit } from "@/aura/server/rate-limit";
await enforceRateLimit(ctx.db, {
  key: `otp:request:${input.phone}`,
  limit: 5,
  windowSeconds: 60 * 15,  // 5 per 15 minutes
});
Rule 12.3: Use ctx.scheduler.runAfter / runAt / cancel for one-off scheduled jobs. Source: docs/scheduler-cron.md lines 14-46, src/aura/server/scheduler.ts.
const jobId = await ctx.scheduler.runAfter(
  5 * 60 * 1000,
  api.emails.sendReminder,
  { orderId: order.id },
);
Rule 12.4: Use startWorkflow to start a durable workflow. Source: docs/workflows.md lines 47-57.
import { startWorkflow } from "@/aura/server/workflow";
const runId = await startWorkflow("orders.fulfill", input, ctx.db);
Rule 12.5: Use defineHttpAction for webhooks, NOT operations. Webhooks need raw request/response access. Source: docs/http-actions.md lines 111-120.
export default defineHttpAction("/webhooks/stripe", "POST")
  .public()
  .csrf(false)
  .handler(async (ctx, request) => {
    const sig = request.headers.get("stripe-signature");
    const body = await request.text();
    // ...
    return new Response("ok", { status: 200 });
  });
Rule 12.6: Use ctx.paginate(model, opts) for cursor-based pagination. Source: docs/pagination-search.md lines 15-37.
return ctx.paginate(ctx.db.todo, {
  where: { userId: ctx.user.id },
  cursor: input.cursor ?? undefined,
  take: input.numItems,
  orderBy: "createdAt",
  direction: "desc",
  operationHash: "todos.list",
});
Rule 12.7: Use publishEvent for broadcasting to WS rooms. Source: src/aura/server/publish.ts, src/aura/server/broadcast.ts (POST /publish endpoint).
import { publishEvent } from "@/aura/server/publish";
void publishEvent({
  room: `conversation:${conversationId}`,
  event: "message:new",
  data: { id: msg.id, senderId: userId, body },
});
Rule 12.8: Use ctx.bump.success/error/info/warning for server-side toasts. Source: docs/context.md lines 70-79.
ctx.bump.success("Tâche créée", "Description optionnelle");
ctx.bump.warning("Quota presque atteint", "Il vous reste 3 tâches gratuites.");
Rule 12.9: All Prisma models use cuid() for IDs. Exceptions: agent_states uses userId as PK. Source: design.md line 844.
Rule 12.10: Business phase management via business_config table and BUSINESS_PHASE flag. Source: requirements.md R30, R31, design.md lines 1323-1328.
Rule 12.11: The WhatsAppGateway interface abstracts Evolution_API (MVP) and WhatsApp Business API (production). Selected at runtime based on BUSINESS_PHASE. Source: requirements.md R37, design.md lines 727-755.
Rule 12.12: The PaymentProvider interface abstracts Fapshi (MVP/phase 2) and Flutterwave (phase 3). Selected by region. Source: requirements.md R28, design.md lines 757-772.
Rule 12.13: WebSocket rooms convention. Source: design.md lines 478-483, docs/realtime.md.
- 
conversation:{conversationId} — chat messages
- 
user:{userId} — non-read counters, presence events
- 
admin:disputes — moderation alerts
Rule 12.14: Agent streaming uses ctx.agent.streamText, not raw publishEvent hacks. Source: docs/ai-agents.md lines 120-131, MEMO.md §3 line 79 (error 5: __agent_stream: hack should not be used).