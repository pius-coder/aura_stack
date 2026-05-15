

import type { PrismaClient } from "@/generated/prisma/client";
import type { AuraUser } from "@/generated/prisma/client";
import type { AuraBump, AuraBumpVariant } from "@/aura/core/envelope";
import type {
  AuraAuditContext,
  AuraAuthContext,
  AuraCookieMutation,
  AuraLogger,
  AuraRequestMetadata,
  AuraScheduler,
  AuraSessionData,
  AuraSource,
  OperationRef,
  InferOperationInput,
  InferOperationOutput,
  AuraAgent,
} from "@/aura/core/types";
import type { NotificationDispatcher } from "./notifications";
import type { AuraStorage } from "./storage/types";

// Re-export the cross-layer types from `@/aura/core/types` so existing
// importers of `@/aura/server/context` continue to compile.
export type {
  AuraAuditContext,
  AuraAuthContext,
  AuraCookieMutation,
  AuraLogger,
  AuraRequestMetadata,
  AuraSessionData,
  AuraSource,
};

/**
 * Cursor-based pagination helper available on every Aura context.
 *
 * Use `ctx.paginate(model, opts)` from any operation handler — no manual
 * imports, no manual cursor encoding, no manual type wrangling.
 */
export interface AuraPaginateOptions<TWhere = Record<string, unknown>> {
  where?: TWhere;
  cursor?: string | null;
  take: number;
  orderBy?: string;
  direction?: "asc" | "desc";
  /**
   * Stable hash of the operation. Used to bind a cursor to a specific
   * query so it cannot be replayed against another. Defaults to the
   * current operation's name when invoked inside a registered operation.
   */
  operationHash?: string;
}

export interface AuraPaginatedResult<T> {
  items: T[];
  cursor: string | null;
  isDone: boolean;
}

/**
 * Aggregate, server-only context exposed to operation handlers today.
 *
 * Phase 1 introduces per-primitive contexts (`AuraQueryContext`,
 * `AuraMutationContext`, `AuraActionContext`) in `@/aura/core/types`.
 * The runtime `createAuraContext` now produces a context that satisfies
 * all three at once (with a Proxy-based read-only DB swapped in for
 * queries by the runner). Existing handlers continue to consume
 * `AuraContext` as the union surface.
 */
export interface AuraContext {
  db: PrismaClient;
  session: AuraSessionData | null;
  user: AuraUser | null;
  auth: AuraAuthContext;
  notify: NotificationDispatcher;
  bump: {
    add(variant: AuraBumpVariant, title: string, description?: string): void;
    success(title: string, description?: string): void;
    info(title: string, description?: string): void;
    warning(title: string, description?: string): void;
    error(title: string, description?: string): void;
    all(): AuraBump[];
  };
  log: AuraLogger;
  audit: AuraAuditContext;
  requestId: string;
  source: AuraSource;
  request: AuraRequestMetadata;
  cookies: {
    set: AuraCookieMutation[];
  };
  storage: AuraStorage;
  scheduler: AuraScheduler;
  /** AI agent surface (Requirements 31.3, 31.4, 31.5, 35.2). */
  agent: AuraAgent;
  /**
   * Run another Aura operation in-process. Type-safe: when called with a
   * typed `OperationRef` from `_generated/api.ts`, the input is type-checked
   * against the operation's Zod input schema and the return value is the
   * operation's inferred output. String names are accepted for dynamic
   * dispatch (e.g. outbox handlers), in which case input/output fall back
   * to `unknown`.
   */
  runQuery<TRef extends OperationRef<"query">>(
    ref: TRef,
    input: InferOperationInput<TRef>,
  ): Promise<InferOperationOutput<TRef>>;
  runQuery<TInput = unknown, TOutput = unknown>(name: string, input: TInput): Promise<TOutput>;

  runMutation<TRef extends OperationRef<"mutate">>(
    ref: TRef,
    input: InferOperationInput<TRef>,
  ): Promise<InferOperationOutput<TRef>>;
  runMutation<TInput = unknown, TOutput = unknown>(name: string, input: TInput): Promise<TOutput>;

  runAction<TRef extends OperationRef<"action">>(
    ref: TRef,
    input: InferOperationInput<TRef>,
  ): Promise<InferOperationOutput<TRef>>;
  runAction<TInput = unknown, TOutput = unknown>(name: string, input: TInput): Promise<TOutput>;

  /**
   * Cursor-based pagination wired to a Prisma model delegate.
   *
   * ```ts
   * .handler(async ({ ctx, input }) => {
   *   return ctx.paginate(ctx.db.todo, {
   *     where: { status: input.status },
   *     take: input.numItems,
   *     cursor: input.cursor,
   *     orderBy: "createdAt",
   *     direction: "desc",
   *   });
   * })
   * ```
   *
   * The row type is inferred from the Prisma delegate; the result is
   * `{ items: T[], cursor: string | null, isDone: boolean }`.
   */
  paginate<TDelegate extends { findMany: (args: never) => Promise<readonly { id: string }[]> }>(
    model: TDelegate,
    opts: AuraPaginateOptions,
  ): Promise<AuraPaginatedResult<Awaited<ReturnType<TDelegate["findMany"]>>[number]>>;

  /**
   * Queue a fine-grained entity invalidation. `{ entity }` triggers a
   * type-level invalidation (every query that depends on the entity);
   * `{ entity, id }` only invalidates queries watching that instance.
   */
  invalidate(target: { entity: string; id?: string }): void;
  /** Internal — invalidations queued during this request. */
  invalidatedEntities: Set<string>;
  /** Explicit fetch surface for actions. */
  fetch: typeof globalThis.fetch;
}

export type AuthenticatedAuraContext = Omit<AuraContext, "session" | "user"> & {
  session: AuraSessionData;
  user: AuraUser;
};

export function assertAuthenticated(ctx: AuraContext): asserts ctx is AuthenticatedAuraContext {
  if (!ctx.session || !ctx.user) {
    throw new Error("Aura context is not authenticated");
  }
}
