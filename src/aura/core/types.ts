/**
 * Aura core types.
 *
 * Pure, side-effect-free type definitions shared by both the server runtime
 * and the client transport. This module MUST NOT import any server-only
 * runtime modules; only `import type` references are permitted so that the
 * file is safe to bundle into a client chunk.
 */

import type { PrismaClient, AuraUser } from "@/generated/prisma/client";
import type { AuraBump, AuraBumpVariant } from "@/aura/core/envelope";
import type { AuraStorage } from "@/aura/server/storage/types";
import type { NotificationDispatcher } from "@/aura/server/notifications";

// ---------------------------------------------------------------------------
// Operation references (typed `api` object surface — see Decision 14)
// ---------------------------------------------------------------------------

export type OperationType = "query" | "mutate" | "action";

/**
 * A typed reference to a registered Aura operation. The runtime fields
 * (`_name`, `_type`) are used by `ctx.runQuery` / `ctx.runMutation` /
 * `ctx.runAction` to resolve the operation; the phantom `_input` / `_output`
 * carry the inferred Zod input/output types so that
 * `InferOperationInput<typeof api.X.Y>` resolves precisely.
 */
export interface OperationRef<
  TType extends OperationType = OperationType,
  TInput = unknown,
  TOutput = unknown,
> {
  readonly _name: string;
  readonly _type: TType;
  readonly _input?: TInput;
  readonly _output?: TOutput;
}

export type InferOperationInput<T> = T extends { _input?: infer TInput }
  ? TInput
  : never;

export type InferOperationOutput<T> = T extends { _output?: infer TOutput }
  ? TOutput
  : never;

// ---------------------------------------------------------------------------
// Cookie serialization contract (consumed by the bridge router and the
// TanStack Start request-context adapter)
// ---------------------------------------------------------------------------

/**
 * A queued cookie write produced by an operation handler (via
 * `ctx.auth.setSessionCookie` / `ctx.auth.clearSessionCookie`, or by the
 * session resolver when it detects a stale cookie). The bridge router
 * serializes these as `Set-Cookie` headers; the in-process server-call path
 * applies them via the TanStack Start cookie API.
 */
export interface AuraCookieMutation {
  name: string;
  value: string;
  options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
    maxAge?: number;
    expires?: Date;
  };
}

// ---------------------------------------------------------------------------
// Per-operation-type context surfaces (Decision 12: three function types)
// ---------------------------------------------------------------------------

export type AuraSource = "bridge" | "rsc" | "cron" | "internal" | "scheduler" | "test";

export interface AuraSessionData {
  id: string;
  userId: string;
  expiresAt: Date;
  sessionVersion: number;
}

export interface AuraLogger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export interface AuraAuthContext {
  setSessionCookie(token: string, expiresAt: Date): void;
  clearSessionCookie(): void;
}

export interface AuraAuditContext {
  record(action: string, metadata?: Record<string, unknown>): Promise<void>;
}

export interface AuraBumpStore {
  add(variant: AuraBumpVariant, title: string, description?: string): void;
  success(title: string, description?: string): void;
  info(title: string, description?: string): void;
  warning(title: string, description?: string): void;
  error(title: string, description?: string): void;
  all(): AuraBump[];
}

export interface AuraRequestMetadata {
  ip?: string;
  userAgent?: string;
  origin?: string;
  countryCode?: string;
}

/**
 * Read-only Prisma client surface used by query handlers.
 *
 * At the type level, this currently aliases the full `PrismaClient`. The
 * runtime Proxy that throws `AuraError("INTERNAL_ERROR", ...)` on write
 * methods, plus a precise structural type that excludes write methods at
 * compile time, is implemented in task 7.3 (`server/db-readonly.ts`).
 */
export type PrismaReadOnlyClient = PrismaClient;

/**
 * Scheduler primitive (Decision 13). The runtime implementation lives in
 * task 9.1 (`server/scheduler.ts`); this type captures the contract.
 */
export interface AuraScheduler {
  /**
   * Schedule an operation to run after `delayMs` milliseconds. Returns the
   * `AuraJobRun.id` usable for cancellation.
   */
  runAfter<TInput>(
    delayMs: number,
    ref: OperationRef<OperationType, TInput, unknown>,
    input: TInput,
  ): Promise<string>;
  /**
   * Schedule an operation to run at a specific timestamp. Returns the
   * `AuraJobRun.id` usable for cancellation.
   */
  runAt<TInput>(
    timestamp: Date,
    ref: OperationRef<OperationType, TInput, unknown>,
    input: TInput,
  ): Promise<string>;
  /** Mark a pending scheduled job as `CANCELLED` if it has not yet started. */
  cancel(scheduledId: string): Promise<void>;
}

/**
 * Agent reference — opaque handle to a registered AI agent (Requirement 31.1).
 * Returned by `defineAgent()` and consumed by `ctx.agent.createThread()`.
 */
export interface AgentRef {
  readonly _name: string;
  readonly __auraAgent: true;
}

/**
 * Thread reference — opaque handle to an `AuraAgentThread` row.
 */
export interface AgentThreadRef {
  readonly _id: string;
  readonly _agentName: string;
}

/**
 * Aura agent surface (Requirements 31.3, 31.4, 31.5, 35.2). The runtime
 * implementation lives in `server/ai/agent.ts`; this captures the contract
 * exposed on `AuraContext.agent`.
 */
export interface AuraAgent {
  /** Start a new conversation thread for an agent. */
  createThread(
    ref: AgentRef,
    opts?: { userId?: string; title?: string; metadata?: Record<string, unknown> },
  ): Promise<AgentThreadRef>;

  /**
   * Send a prompt + thread history to the LLM, execute tool calls, and
   * persist every message. Returns the final assistant content.
   */
  generateText(
    thread: AgentThreadRef,
    opts: { prompt: string; maxSteps?: number },
  ): Promise<{ content: string; messageId: string }>;

  /**
   * Stream tokens to connected clients via the Aura broadcast WebSocket.
   * Persists the final complete message in `AuraAgentMessage`.
   */
  streamText(
    thread: AgentThreadRef,
    opts: { prompt: string; maxSteps?: number; onDelta?: (delta: string) => void },
  ): Promise<{ content: string; messageId: string }>;

  /** Query usage statistics (tokens, calls). */
  getUsage(opts?: {
    userId?: string;
    agentName?: string;
    since?: Date;
  }): Promise<{
    totalCalls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
}

/**
 * Fields shared by every operation type. Per-primitive contexts narrow the
 * DB surface and add type-specific helpers (run-* methods, scheduler,
 * storage, fetch).
 */
export interface BaseAuraContext {
  session: AuraSessionData | null;
  user: AuraUser | null;
  auth: AuraAuthContext;
  notify: NotificationDispatcher;
  bump: AuraBumpStore;
  log: AuraLogger;
  audit: AuraAuditContext;
  requestId: string;
  source: AuraSource;
  request: AuraRequestMetadata;
  cookies: {
    set: AuraCookieMutation[];
  };
}

/**
 * Query context — read-only DB, no side effects, no scheduler. Queries are
 * cached by TanStack Query and may be deduplicated within a single render,
 * so they MUST be free of observable side effects.
 */
export interface AuraQueryContext extends BaseAuraContext {
  db: PrismaReadOnlyClient;
  runQuery<TRef extends OperationRef<"query">>(
    ref: TRef,
    input: InferOperationInput<TRef>,
  ): Promise<InferOperationOutput<TRef>>;
}

/**
 * Mutation context — full Prisma access (including `$transaction`), scheduler,
 * fine-grained `invalidate`. Mutations may not perform external I/O (no
 * `fetch`, no third-party SDKs); use `.action()` for that.
 */
export interface AuraMutationContext extends BaseAuraContext {
  db: PrismaClient;
  runQuery<TRef extends OperationRef<"query">>(
    ref: TRef,
    input: InferOperationInput<TRef>,
  ): Promise<InferOperationOutput<TRef>>;
  runMutation<TRef extends OperationRef<"mutate">>(
    ref: TRef,
    input: InferOperationInput<TRef>,
  ): Promise<InferOperationOutput<TRef>>;
  scheduler: AuraScheduler;
  /**
   * Fine-grained entity invalidation (Decision 16). Pass an entity tag for
   * type-level invalidation, or `{ entity, id }` to invalidate only queries
   * watching a specific instance.
   */
  invalidate(target: { entity: string; id?: string }): void;
}

/**
 * Action context — no direct DB access (must go through runQuery/runMutation),
 * scheduler, file storage, explicit `fetch` for third-party I/O. Actions own
 * their side effects and are the boundary at which the framework crosses into
 * non-transactional territory.
 */
export interface AuraActionContext extends BaseAuraContext {
  runQuery<TRef extends OperationRef<"query">>(
    ref: TRef,
    input: InferOperationInput<TRef>,
  ): Promise<InferOperationOutput<TRef>>;
  runMutation<TRef extends OperationRef<"mutate">>(
    ref: TRef,
    input: InferOperationInput<TRef>,
  ): Promise<InferOperationOutput<TRef>>;
  runAction<TRef extends OperationRef<"action">>(
    ref: TRef,
    input: InferOperationInput<TRef>,
  ): Promise<InferOperationOutput<TRef>>;
  scheduler: AuraScheduler;
  storage: AuraStorage;
  /** Explicit fetch surface — actions own their external I/O. */
  fetch: typeof globalThis.fetch;
}
