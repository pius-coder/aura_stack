

import { cache } from "react";
import { errorEnvelope, successEnvelope, type AuraEnvelope } from "@/aura/core/envelope";
import { AuraError, toPublicAuraError } from "@/aura/core/errors";
import "@/aura.registry";
import { createAuraContext } from "./create-context";
import { getOperation } from "./registry";
import { publishInvalidation } from "./invalidate";
import {
  getAuraRequestHeaders,
  applyAuraCookies,
  createAuraRequest,
} from "./context-adapter";
import type { AuraSource } from "./context";
import { v4 as uuidv4 } from "uuid";

export interface CallAuraServerOptions {
  operationName: string;
  input?: unknown;
  params?: unknown;
  source?: AuraSource;
}

export async function callAuraServer<TData = unknown>(
  options: CallAuraServerOptions,
): Promise<TData> {
  const envelope = await runAuraServer<TData>(options);
  if (envelope.ok) return envelope.data;

  throw new AuraError(envelope.error.code as never, envelope.error.message, {
    status: envelope.error.status,
    fieldErrors: envelope.error.fieldErrors,
  });
}

/**
 * React cache() deduplicates query calls within a single RSC render.
 *
 * Without this, a page that mounts 5 `<Shell>` components each fetching the
 * same Aura query (e.g. 5 Home*Shell all asking for `catalog.homeData`) would
 * hit the DB 5 times. With cache(), the first call executes and the next 4
 * return the same resolved promise.
 *
 * Only applies to queries. Mutations MUST always execute and never be cached.
 */
const runQueryCached = cache(
  async <TData>(
    stableKey: string,
    options: CallAuraServerOptions,
    requestHeaders?: Headers,
  ): Promise<AuraEnvelope<TData>> => {
    void stableKey; // consumed by cache() as part of the memoization key
    return runAuraServerUncached<TData>(options, requestHeaders);
  },
);

function stableKeyFor(options: CallAuraServerOptions): string {
  return JSON.stringify({
    n: options.operationName,
    i: options.input ?? null,
    p: options.params ?? null,
    s: options.source ?? "rsc",
  });
}

export async function runAuraServer<TData = unknown>(
  options: CallAuraServerOptions,
  requestHeaders?: Headers,
): Promise<AuraEnvelope<TData>> {
  const operation = getOperation(options.operationName);

  // Dedupe queries within a render; always execute mutations.
  if (operation && operation.type === "query") {
    return runQueryCached<TData>(stableKeyFor(options), options, requestHeaders);
  }

  return runAuraServerUncached<TData>(options, requestHeaders);
}

async function runAuraServerUncached<TData = unknown>(
  options: CallAuraServerOptions,
  requestHeaders?: Headers,
): Promise<AuraEnvelope<TData>> {
  const operation = getOperation(options.operationName);

  if (!operation) {
    return errorEnvelope({
      error: new AuraError("NOT_FOUND", `Opération Aura introuvable: ${options.operationName}`),
      requestId: "unknown",
    });
  }

  if (operation.access === "internal" && options.source !== "internal") {
    return errorEnvelope({
      error: new AuraError("FORBIDDEN", "Cette opération est interne."),
      requestId: "unknown",
    });
  }

  const resolvedHeaders: Headers = requestHeaders ?? getAuraRequestHeaders();
  const requestId = uuidv4();
  const request = requestHeaders
    ? new Request("http://aura.local/rsc", { headers: resolvedHeaders })
    : createAuraRequest();

  const ctx = await createAuraContext({
    request,
    source: options.source ?? "rsc",
    requestId,
  });

  try {
    const data = (await operation.execute({
      ctx,
      input: options.input,
      params: options.params,
      req: request,
    })) as TData;

    const isMutating = operation.type === "mutate" || operation.type === "action";
    const invalidates = isMutating
      ? [...new Set([...operation.entities, ...ctx.invalidatedEntities])]
      : [];

    // Apply any cookie mutations queued by the operation (session clear,
    // CSRF rotation, …). TanStack Start allows cookie writes via setCookie
    // from @tanstack/start-server-core, which we expose through the
    // context-adapter module.
    if (ctx.cookies.set.length > 0) {
      applyAuraCookies(ctx.cookies.set);
    }

    if (isMutating && invalidates.length > 0) {
      void publishInvalidation({ keys: invalidates });
    }

    return successEnvelope({
      data,
      requestId,
      bumps: ctx.bump.all(),
      invalidates,
      refresh: isMutating,
    });
  } catch (error) {
    // Even on error we might need to clear an invalid session cookie.
    if (ctx.cookies.set.length > 0) {
      applyAuraCookies(ctx.cookies.set);
    }
    return errorEnvelope({
      error: toPublicAuraError(error),
      requestId,
    });
  }
}
