

import {
  errorEnvelope,
  successEnvelope,
  type AuraEnvelope,
} from "@/aura/core/envelope";
import { AuraError, toPublicAuraError } from "@/aura/core/errors";
import { getOperation } from "./registry";
import { createAuraContext } from "./create-context";
import { createReadOnlyDb } from "./db-readonly";
import type { AuraContext } from "./context";
import { publishInvalidation } from "./invalidate";
import { v4 as uuidv4 } from "uuid";

export interface RunAuraOperationOptions {
  operationName: string;
  input: unknown;
  params?: unknown;
  request: Request;
  source?: "bridge" | "rsc" | "internal" | "cron" | "scheduler" | "test";
}

export async function runAuraOperation<TData = unknown>(
  options: RunAuraOperationOptions,
): Promise<{
  envelope: AuraEnvelope<TData>;
  status: number;
  cookies: Awaited<ReturnType<typeof createAuraContext>>["cookies"]["set"];
}> {
  const operation = getOperation(options.operationName);
  const requestId = uuidv4();
  let ctx: AuraContext;
  try {
    ctx = await createAuraContext({
      request: options.request,
      source: options.source ?? "bridge",
      requestId,
    });
  } catch (error) {
    const auraError = toPublicAuraError(error);
    console.error("[aura] createAuraContext failed:", error);
    return {
      envelope: errorEnvelope({ error: auraError, requestId }),
      status: auraError.status,
      cookies: [],
    };
  }

  if (!operation) {
    const error = new AuraError(
      "NOT_FOUND",
      `Opération Aura introuvable: ${options.operationName}`,
    );
    return {
      envelope: errorEnvelope({ error, requestId: ctx.requestId }),
      status: error.status,
      cookies: ctx.cookies.set,
    };
  }

  if (
    operation.access === "internal" &&
    (options.source ?? "bridge") === "bridge"
  ) {
    const error = new AuraError("FORBIDDEN", "Cette opération est interne.");
    return {
      envelope: errorEnvelope({ error, requestId: ctx.requestId }),
      status: error.status,
      cookies: ctx.cookies.set,
    };
  }

  // Per-type context narrowing (Decision 12, task 7.4):
  //   - queries get a Proxy-wrapped read-only db
  //   - mutations get the full db
  //   - actions get a tombstoned db that throws on every property
  const handlerCtx = withTypedDb(ctx, operation.type);

  try {
    const data = (await operation.execute({
      ctx: handlerCtx,
      input: options.input,
      params: options.params,
      req: options.request,
    })) as TData;

    const isMutating = operation.type === "mutate" || operation.type === "action";
    // Static entities declared on the operation + dynamic invalidations
    // queued via `ctx.invalidate(...)` during the handler execution.
    const invalidates = isMutating
      ? [...new Set([...operation.entities, ...ctx.invalidatedEntities])]
      : [];

    if (isMutating && invalidates.length > 0) {
      void publishInvalidation({ keys: invalidates });
    }

    return {
      envelope: successEnvelope({
        data,
        requestId: ctx.requestId,
        bumps: ctx.bump.all(),
        invalidates,
        // refresh forces `router.invalidate()` which re-runs every loader on
        // the page — heavy and almost always redundant with TanStack Query
        // invalidation that already happens client-side. Leave it OFF by
        // default; callers can opt-in by setting `refresh: true` in
        // `useAuraMutation` options.
        refresh: false,
      }),
      status: 200,
      cookies: ctx.cookies.set,
    };
  } catch (error) {
    const auraError = toPublicAuraError(error);
    if (!(error instanceof AuraError)) {
      ctx.log.error("Unhandled Aura operation error", {
        operation: operation.name,
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
      });
    }

    return {
      envelope: errorEnvelope({ error: auraError, requestId: ctx.requestId }),
      status: auraError.status,
      cookies: ctx.cookies.set,
    };
  }
}

/**
 * Narrow a base context to the per-operation-type surface required by the
 * design (Decision 12). Queries see a read-only DB Proxy; actions cannot
 * access the DB directly (they must go through `runQuery`/`runMutation`).
 */
function withTypedDb(ctx: AuraContext, type: "query" | "mutate" | "action"): AuraContext {
  if (type === "query") {
    return { ...ctx, db: createReadOnlyDb(ctx.db) };
  }
  if (type === "action") {
    return {
      ...ctx,
      db: new Proxy({} as AuraContext["db"], {
        get(_, prop) {
          throw new AuraError(
            "INTERNAL_ERROR",
            `Direct DB access is forbidden in actions (attempted: ${String(prop)}). Use ctx.runQuery / ctx.runMutation instead.`,
          );
        },
      }),
    };
  }
  return ctx;
}
