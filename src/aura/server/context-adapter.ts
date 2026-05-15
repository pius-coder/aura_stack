

import {
  getRequestHeaders,
  getRequest,
  setCookie,
  deleteCookie,
  getRequestIP,
} from "@tanstack/start-server-core";
import type { AuraCookieMutation } from "@/aura/core/types";

/**
 * Request Context Adapter for TanStack Start
 *
 * This module provides the adapter layer that allows TanStack Start server-side
 * code (server functions, route loaders) to call Aura operations in-process
 * without HTTP round-trips.
 *
 * Resolves: Requirement 2.3, 2.4
 * Implements: Design Decision 3 (Server-Side Calls Without HTTP)
 */

/**
 * Get the per-request headers from the TanStack Start request context.
 *
 * This replaces the Next.js pattern of `await headers()` from `next/headers`.
 * The headers are obtained from the current H3 event via TanStack Start's
 * request context (AsyncLocalStorage under the hood).
 *
 * @returns Headers object for the current request
 */
export function getAuraRequestHeaders(): Headers {
  const typedHeaders = getRequestHeaders();
  // Convert TypedHeaders to a standard Headers object
  const headers = new Headers();

  // Iterate over all headers and append them
  for (const [key, value] of Object.entries(typedHeaders)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      } else {
        headers.set(key, value);
      }
    }
  }

  return headers;
}

/**
 * Get the raw Request object from the TanStack Start context.
 *
 * This is useful when you need access to the full request object, not just
 * the headers (e.g., for constructing a Request to pass to createAuraContext).
 *
 * @returns The current Request object
 */
export function getAuraRequest(): Request {
  return getRequest();
}

/**
 * Get the client IP address from the request context.
 *
 * Uses the X-Forwarded-For header if available and trusted.
 *
 * @param options - Configuration options
 * @param options.xForwardedFor - Whether to trust X-Forwarded-For header
 * @returns The client IP address or undefined
 */
export function getAuraRequestIP(options?: { xForwardedFor?: boolean }): string | undefined {
  return getRequestIP(options);
}

/**
 * Apply cookie mutations to the response.
 *
 * This replaces the Next.js pattern of `(await cookies()).set(...)` and
 * `(await cookies()).delete(...)`. The mutations are applied directly to
 * the TanStack Start response via the H3 event.
 *
 * @param mutations - Array of cookie mutations to apply
 */
export function applyAuraCookies(mutations: AuraCookieMutation[]): void {
  for (const mutation of mutations) {
    const options = {
      httpOnly: mutation.options.httpOnly,
      secure: mutation.options.secure,
      sameSite: mutation.options.sameSite as "lax" | "strict" | "none" | undefined,
      path: mutation.options.path,
      maxAge: mutation.options.maxAge,
      expires: mutation.options.expires,
    };

    if (mutation.options.maxAge === 0) {
      // maxAge: 0 signals cookie deletion
      deleteCookie(mutation.name, options);
    } else {
      setCookie(mutation.name, mutation.value, options);
    }
  }
}

/**
 * Create a Request object suitable for Aura context creation.
 *
 * This constructs a synthetic Request with the headers from the current
 * TanStack Start request context. The URL is synthetic (aura://internal)
 * since Aura operations don't actually route by URL.
 *
 * @param additionalHeaders - Optional additional headers to include
 * @returns A Request object with the current request headers
 */
export function createAuraRequest(additionalHeaders?: HeadersInit): Request {
  const headers = getAuraRequestHeaders();

  // Merge in any additional headers
  if (additionalHeaders) {
    const additional = new Headers(additionalHeaders);
    for (const [key, value] of additional.entries()) {
      headers.set(key, value);
    }
  }

  return new Request("aura://internal", {
    headers,
  });
}

/**
 * Extract request metadata from the current TanStack Start context.
 *
 * Gathers IP, user agent, origin, and country code from the request headers.
 *
 * @returns AuraRequestMetadata object
 */
export function getAuraRequestMetadata(): {
  ip?: string;
  userAgent?: string;
  origin?: string;
  countryCode?: string;
} {
  const headers = getAuraRequestHeaders();
  const ip = getRequestIP({ xForwardedFor: true });

  return {
    ip,
    userAgent: headers.get("user-agent") ?? undefined,
    origin: headers.get("origin") ?? undefined,
    countryCode: headers.get("cf-ipcountry") ?? undefined,
  };
}
