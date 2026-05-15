

import { cache } from "react";
import { db } from "./db";
import type { AuraContext, AuraSource } from "./context";
import type { OperationRef } from "@/aura/core/types";
import { createAuraLogger } from "./logger";
import { createBumpStore } from "./bump";
import { createNotificationDispatcher } from "./notifications";
import { resolveSessionFromRequest } from "./auth/session";
import {
  sessionCookieName,
  isSecureCookieEnvironment,
  parseCookieHeader,
} from "./transport/cookies";
import { toPrismaJson } from "./json";
import { createAuraStorage } from "./storage";
import { createAuraScheduler } from "./scheduler";
import { createAuraAgent } from "./ai/context-binding";
import { v4 as uuidv4 } from "uuid";

/**
 * Session resolution is memoized per-request (React cache). Multiple Aura
 * operations within the same RSC render (e.g. 5 Shell components fetching
 * different queries) would otherwise re-parse the cookie, re-hash the token,
 * re-select `AuraSession join AuraUser`, and re-write `lastUsedAt` for each
 * call. With this cache, the second+ caller reuses the resolved session.
 */
const resolveSessionCached = cache(
  async (cookieHeader: string | null) => {
    if (!cookieHeader) return { session: null, user: null };
    const request = new Request("http://aura.local/session", {
      headers: { cookie: cookieHeader },
    });
    return resolveSessionFromRequest(db, request);
  },
);

export interface CreateAuraContextOptions {
  request?: Request;
  source: AuraSource;
  requestId?: string;
}

export async function createAuraContext(
  options: CreateAuraContextOptions,
): Promise<AuraContext> {
  const requestId = options.requestId ?? uuidv4();
  const log = createAuraLogger(requestId);
  const bumps = createBumpStore();
  const hasSessionCookie = options.request
    ? Boolean(parseCookieHeader(options.request.headers.get("cookie")).get(sessionCookieName()))
    : false;
  const cookieHeader = options.request?.headers.get("cookie") ?? null;
  const resolvedSession = options.request
    ? await resolveSessionCached(cookieHeader)
    : { session: null, user: null };
  const cookieMutations: AuraContext["cookies"]["set"] = [];

  if (hasSessionCookie && !resolvedSession.session) {
    cookieMutations.push({
      name: sessionCookieName(),
      value: "",
      options: {
        httpOnly: true,
        secure: isSecureCookieEnvironment(),
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      },
    });
  }

  // Lazy-loaded `runOperation` — defined here to avoid a circular import
  // with `runner.ts` which also creates contexts.
  async function runOperation<TInput, TOutput>(
    ref: OperationRef | string,
    input: TInput,
  ): Promise<TOutput> {
    const { getOperation } = await import("./registry");
    const name = typeof ref === "string" ? ref : ref._name;
    const operation = getOperation(name);
    if (!operation) {
      const { AuraError } = await import("@/aura/core/errors");
      throw new AuraError("NOT_FOUND", `Opération Aura introuvable: ${name}`);
    }

    const out = await operation.execute({
      ctx,
      input,
      params: undefined,
      req: options.request,
    });

    // Merge inner mutation/action invalidations into the outer entity set
    // (Decision 14 — invalidation propagates up through nested calls).
    if (operation.type === "mutate" || operation.type === "action") {
      for (const tag of operation.entities) {
        invalidatedEntities.add(tag);
      }
    }

    return out as TOutput;
  }

  // Tracks instance-level + type-level invalidations queued by mutations
  // and actions. Consumed by the runner / call paths via `ctx.invalidate`
  // and the operation's static `entities` list.
  const invalidatedEntities = new Set<string>();

  const ctx: AuraContext = {
    db,
    session: resolvedSession.session,
    user: resolvedSession.user,
    auth: {
      setSessionCookie(token, expiresAt) {
        cookieMutations.push({
          name: sessionCookieName(),
          value: token,
          options: {
            httpOnly: true,
            secure: isSecureCookieEnvironment(),
            sameSite: "lax",
            path: "/",
            expires: expiresAt,
          },
        });
      },
      clearSessionCookie() {
        cookieMutations.push({
          name: sessionCookieName(),
          value: "",
          options: {
            httpOnly: true,
            secure: isSecureCookieEnvironment(),
            sameSite: "lax",
            path: "/",
            maxAge: 0,
          },
        });
      },
    },
    notify: createNotificationDispatcher(() => ctx),
    bump: bumps,
    log,
    audit: {
      async record(action, metadata) {
        await db.auraAuditLog.create({
          data: {
            actorUserId: ctx.user?.id ?? null,
            action,
            operation:
              typeof metadata?.operation === "string"
                ? metadata.operation
                : null,
            requestId,
            source: options.source,
            metadata: toPrismaJson(metadata),
          },
        });
      },
    },
    requestId,
    source: options.source,
    request: {
      ip: options.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: options.request?.headers.get("user-agent") ?? undefined,
      origin: options.request?.headers.get("origin") ?? undefined,
      countryCode: options.request?.headers.get("cf-ipcountry") ?? undefined,
    },
    cookies: {
      set: cookieMutations,
    },
    storage: createAuraStorage(),
    scheduler: createAuraScheduler(db),
    agent: await createAuraAgent(),
    // Typed `api` object refs — see `core/types.ts` for the OperationRef
    // contract. String names are accepted for backward compatibility.
    runQuery: runOperation as AuraContext["runQuery"],
    runMutation: runOperation as AuraContext["runMutation"],
    runAction: runOperation as AuraContext["runAction"],
    async paginate(model, opts) {
      const { paginate: paginateFn } = await import("./pagination");
      return paginateFn(
        model as unknown as { findMany: (args: never) => Promise<unknown> },
        {
          ...opts,
          operationHash: opts.operationHash ?? "anonymous",
        },
      ) as never;
    },
    invalidate(target) {
      // Decision 16: support both type-level (`{ entity }`) and
      // instance-level (`{ entity, id }`) invalidation. We serialize as
      // `Entity` and `Entity:id` respectively so the broadcast layer
      // can pattern-match.
      if (target.id) {
        invalidatedEntities.add(`${target.entity}:${target.id}`);
      } else {
        invalidatedEntities.add(target.entity);
      }
    },
    invalidatedEntities,
    // Default `fetch` for actions (queries/mutations should not use it,
    // but exposing it on the union surface keeps the runtime simple).
    fetch: globalThis.fetch.bind(globalThis),
  };

  return ctx;
}
