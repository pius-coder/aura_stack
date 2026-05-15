import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { AuraUser } from "@/generated/prisma/client";
import type { AuraBump, AuraBumpVariant } from "@/aura/core/envelope";
import type { NotificationDispatcher } from "./notifications";
import type { AuraStorage } from "./storage/types";

export type AuraSource = "bridge" | "rsc" | "cron" | "internal" | "test";

export interface AuraSessionData {
  id: string;
  userId: string;
  expiresAt: Date;
  sessionVersion: number;
}

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
  request: {
    ip?: string;
    userAgent?: string;
    origin?: string;
    countryCode?: string;
  };
  cookies: {
    set: AuraCookieMutation[];
  };
  storage: AuraStorage;
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
