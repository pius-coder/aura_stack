

import type { AuraContext, AuraSessionData } from "../context";
import type { AuraDb } from "../db";
import { hashToken, randomToken, sha256 } from "../crypto";
import { createCsrfToken } from "../transport/csrf";
import {
  parseCookieHeader,
  sessionCookieName,
  csrfCookieName,
  isSecureCookieEnvironment,
} from "../transport/cookies";
import { AuraError } from "@/aura/core/errors";

const SESSION_TTL_DAYS = 30;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

export interface ResolvedSession {
  session: AuraSessionData | null;
  user: Awaited<ReturnType<AuraDb["auraUser"]["findUnique"]>> | null;
}

export async function resolveSessionFromRequest(
  db: AuraDb,
  request: Request,
): Promise<ResolvedSession> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies.get(sessionCookieName());
  if (!token) return { session: null, user: null };

  const tokenHash = hashToken(token);
  const storedSession = await db.auraSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!storedSession || storedSession.revokedAt)
    return { session: null, user: null };

  const now = new Date();
  if (storedSession.expiresAt <= now) {
    await db.auraSession.update({
      where: { id: storedSession.id },
      data: { revokedAt: now },
    });
    throw new AuraError("SESSION_EXPIRED", "La session a expiré.");
  }

  if (storedSession.user.disabledAt || storedSession.user.deletedAt) {
    throw new AuraError("SESSION_REVOKED", "Le compte n’est plus actif.");
  }

  if (storedSession.sessionVersion !== storedSession.user.sessionVersion) {
    await db.auraSession.update({
      where: { id: storedSession.id },
      data: { revokedAt: now },
    });
    throw new AuraError("SESSION_REVOKED", "La session n’est plus valide.");
  }

  // Throttle `lastUsedAt` writes: only bump if the previous timestamp is
  // older than 60 seconds. A write per request is a major perf drag
  // (every Aura call becomes 2 DB round-trips) and has no UX value.
  const lastUsedAtMs = storedSession.lastUsedAt?.getTime() ?? 0;
  const THROTTLE_MS = 60_000;
  if (now.getTime() - lastUsedAtMs > THROTTLE_MS) {
    // Fire and forget; failure to bump lastUsedAt should not fail the request.
    void db.auraSession
      .update({
        where: { id: storedSession.id },
        data: { lastUsedAt: now },
      })
      .catch(() => {
        /* non-critical */
      });
  }

  return {
    session: {
      id: storedSession.id,
      userId: storedSession.userId,
      expiresAt: storedSession.expiresAt,
      sessionVersion: storedSession.sessionVersion,
    },
    user: storedSession.user,
  };
}

export async function createSession(
  ctx: AuraContext,
  userId: string,
): Promise<void> {
  const token = randomToken(32);
  const csrfToken = await createCsrfToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const user = await ctx.db.auraUser.findUnique({ where: { id: userId } });

  if (!user || user.disabledAt || user.deletedAt) {
    throw new AuraError("UNAUTHORIZED", "Compte indisponible.");
  }

  await ctx.db.auraSession.create({
    data: {
      tokenHash: hashToken(token),
      csrfTokenHash: sha256(csrfToken),
      userId,
      expiresAt,
      sessionVersion: user.sessionVersion,
      userAgentHash: ctx.request.userAgent
        ? sha256(ctx.request.userAgent)
        : null,
      ipHash: ctx.request.ip ? sha256(ctx.request.ip) : null,
    },
  });

  ctx.auth.setSessionCookie(token, expiresAt);
  ctx.cookies.set.push({
    name: csrfCookieName(),
    value: csrfToken,
    options: {
      httpOnly: false,
      secure: isSecureCookieEnvironment(),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
      expires: expiresAt,
    },
  });
}

export async function revokeCurrentSession(ctx: AuraContext): Promise<void> {
  if (ctx.session) {
    await ctx.db.auraSession.update({
      where: { id: ctx.session.id },
      data: { revokedAt: new Date() },
    });
  }
  ctx.auth.clearSessionCookie();
}

export async function revokeAllUserSessions(
  db: AuraDb,
  userId: string,
): Promise<void> {
  await db.auraSession.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}
