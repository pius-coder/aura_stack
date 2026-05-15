"use client";

import type { AuraBump, AuraEnvelope, AuraErrorEnvelope } from "@/aura/core/envelope";
import type { AuraFieldErrors } from "@/aura/core/errors";

export interface AuraClientConfig {
  basePath: string;
  csrfCookieName: string;
  csrfHeaderName: string;
}

const defaultConfig: AuraClientConfig = {
  basePath: "/aura",
  csrfCookieName: "aura_csrf",
  csrfHeaderName: "x-aura-csrf",
};

let activeConfig: AuraClientConfig = defaultConfig;

export function configureAuraClient(config: Partial<AuraClientConfig>): void {
  activeConfig = {
    ...activeConfig,
    ...config,
  };
}

export function getAuraClientConfig(): AuraClientConfig {
  return activeConfig;
}

export class AuraClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string;
  readonly fieldErrors?: AuraFieldErrors;

  constructor(error: AuraErrorEnvelope["error"]) {
    super(error.message);
    this.name = "AuraClientError";
    this.code = error.code;
    this.status = error.status;
    this.requestId = error.requestId;
    this.fieldErrors = error.fieldErrors;
  }
}

export interface CallAuraOperationOptions {
  operationName: string;
  input?: unknown;
  params?: unknown;
  signal?: AbortSignal;
}

export interface AuraOperationResult<TData> {
  data: TData;
  meta: {
    requestId: string;
    bumps: AuraBump[];
    invalidates: string[];
    refresh: boolean;
  };
}

export async function callAuraOperationWithMeta<TData = unknown>(
  options: CallAuraOperationOptions,
): Promise<AuraOperationResult<TData>> {
  const config = getAuraClientConfig();

  async function send(): Promise<{ response: Response; envelope: AuraEnvelope<TData> | null }> {
    const response = await fetch(
      operationUrl(config.basePath, options.operationName),
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          [config.csrfHeaderName]: readCookie(config.csrfCookieName) ?? "",
        },
        body: JSON.stringify({
          input: options.input,
          params: options.params,
        }),
        signal: options.signal,
      },
    );
    const envelope = (await response
      .json()
      .catch(() => null)) as AuraEnvelope<TData> | null;
    return { response, envelope };
  }

  let { response, envelope } = await send();

  // Auto-heal CSRF: if the request was rejected because the CSRF token is
  // missing/stale (e.g. server restarted with a new secret, browser still
  // holds the old cookie), refetch the manifest — which atomically reissues
  // a fresh CSRF cookie via Set-Cookie — and retry once.
  if (
    envelope &&
    !envelope.ok &&
    envelope.error.code === "FORBIDDEN" &&
    /csrf/i.test(envelope.error.message)
  ) {
    try {
      await fetch(operationUrl(config.basePath, "_manifest"), {
        method: "GET",
        credentials: "same-origin",
      });
    } catch {
      /* fall through and surface the original error */
    }
    ({ response, envelope } = await send());
  }

  if (!envelope) {
    throw new AuraClientError({
      code: "BAD_RESPONSE",
      message: "Réponse Aura invalide.",
      status: response.status,
      requestId: "unknown",
    });
  }

  if (!envelope.ok) {
    throw new AuraClientError(envelope.error);
  }

  return {
    data: envelope.data,
    meta: envelope.meta,
  };
}

export async function callAuraOperation<TData = unknown>(
  options: CallAuraOperationOptions,
): Promise<TData> {
  const result = await callAuraOperationWithMeta<TData>(options);
  return result.data;
}

export async function fetchAuraManifest<TManifest>(
  signal?: AbortSignal,
): Promise<TManifest> {
  const config = getAuraClientConfig();
  const response = await fetch(operationUrl(config.basePath, "_manifest"), {
    method: "GET",
    credentials: "same-origin",
    signal,
  });

  if (!response.ok) {
    throw new AuraClientError({
      code: "BAD_RESPONSE",
      message: "Impossible de charger le manifeste Aura.",
      status: response.status,
      requestId: response.headers.get("x-aura-request-id") ?? "unknown",
    });
  }

  return (await response.json()) as TManifest;
}

function operationUrl(basePath: string, operationName: string): string {
  const safeBasePath = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;
  const path = operationName
    .split(".")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${safeBasePath}/${path}`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}
