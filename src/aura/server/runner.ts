import "server-only";

import {
  errorEnvelope,
  successEnvelope,
  type AuraEnvelope,
} from "@/aura/core/envelope";
import { AuraError, toPublicAuraError } from "@/aura/core/errors";
import { getOperation } from "./registry";
import { createAuraContext } from "./create-context";
import type { AuraContext } from "./context";
import { publishInvalidation } from "./invalidate";
import { v4 as uuidv4 } from "uuid";

export interface RunAuraOperationOptions {
  operationName: string;
  input: unknown;
  params?: unknown;
  request: Request;
  source?: "bridge" | "rsc" | "internal" | "cron" | "test";
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

  try {
    const data = (await operation.execute({
      ctx,
      input: options.input,
      params: options.params,
      req: options.request,
    })) as TData;

    const isMutation = operation.type === "mutate";
    const invalidates = isMutation ? [...operation.entities] : [];

    if (isMutation && invalidates.length > 0) {
      // L'invalidation est 100 % client : publish vers le broadcast server,
      // qui fan-out aux clients TanStack Query connectés.
      void publishInvalidation({ keys: invalidates });
    }

    return {
      envelope: successEnvelope({
        data,
        requestId: ctx.requestId,
        bumps: ctx.bump.all(),
        invalidates,
        refresh: isMutation,
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
