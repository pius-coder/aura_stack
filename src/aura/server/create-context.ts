import "server-only";

import { cache } from "react";
import { db } from "./db";
import type { AuraContext, AuraSource } from "./context";
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
  };

  return ctx;
}
