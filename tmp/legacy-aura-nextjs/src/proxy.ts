import { NextResponse, type NextRequest } from "next/server";
import {
  createCsrfToken,
  csrfHeaderName,
  getCsrfCookieName,
  isUnsafeMethod,
  verifyCsrfToken,
} from "@/aura/server/transport/csrf";
import {
  parseCookieHeader,
  sessionCookieName,
} from "@/aura/server/transport/cookies";
import { takeRateLimitToken } from "@/aura/server/transport/rate-limit-proxy";
import { v4 as uuidv4 } from "uuid";

const protectedPrefixes = [
  "/dashboard",
  "/account",
  "/mes-demandes",
  "/demande",
  "/demande/nouvelle",
  "/transit",
  "/onboarding",
  "/compte",
  "/notifications",
];
const authPages = ["/login", "/register", "/verify-phone", "/reset-password"];

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ─── Origin allowlist ────────────────────────────────────────────────────────

function trustedOrigins(request: NextRequest): { has(origin: string | null): boolean } {
  const origins = new Set<string>([request.nextUrl.origin]);
  const hostnames = new Set<string>([request.nextUrl.hostname]);

  function addOrigin(url: string) {
    origins.add(url);
    try {
      hostnames.add(new URL(url).hostname);
    } catch {
      /* ignore invalid URLs */
    }
  }

  function addHostname(host: string) {
    hostnames.add(host);
  }

  if (process.env.AURA_APP_URL) addOrigin(process.env.AURA_APP_URL);

  if (process.env.AURA_ALLOWED_ORIGINS) {
    for (const raw of process.env.AURA_ALLOWED_ORIGINS.split(",")) {
      const value = raw.trim();
      if (!value) continue;
      if (value.startsWith("http://") || value.startsWith("https://")) {
        addOrigin(value);
      } else {
        addHostname(value);
      }
    }
  }

  return {
    has(origin: string | null) {
      if (!origin) return false;
      if (origins.has(origin)) return true;
      try {
        if (hostnames.has(new URL(origin).hostname)) return true;
      } catch {
        return false;
      }
      const requestHost = request.headers.get("host");
      if (requestHost) {
        try {
          const originHost = new URL(origin).hostname;
          if (
            requestHost === originHost ||
            requestHost.startsWith(originHost + ":")
          ) {
            return true;
          }
        } catch {
          return false;
        }
      }
      return false;
    },
  };
}

function isProtectedPath(pathname: string): boolean {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthPage(pathname: string): boolean {
  return authPages.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

async function ensureCsrfCookie(
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  const cookieName = getCsrfCookieName();
  const existing = request.cookies.get(cookieName)?.value;
  if (existing && (await verifyCsrfToken(existing))) return;

  response.cookies.set(cookieName, await createCsrfToken(), {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/",
  });
}

function jsonReject(message: string, status = 403) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: status === 403 ? "FORBIDDEN" : status === 429 ? "RATE_LIMITED" : "BAD_REQUEST",
        message,
        status,
        requestId: uuidv4(),
      },
    },
    { status },
  );
}

// ─── CSP nonce ───────────────────────────────────────────────────────────────

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildCsp(nonce: string): string {
  const connectSources = [
    "'self'",
    "https://api.mapbox.com",
    "https://events.mapbox.com",
  ];

  const wsUrl = process.env.NEXT_PUBLIC_AURA_WS_URL;
  if (wsUrl) {
    try {
      const parsed = new URL(wsUrl);
      connectSources.push(`${parsed.protocol}//${parsed.host}`);
    } catch {
      /* invalid URL — skip */
    }
  }

  // In dev, Turbopack/Next HMR needs 'unsafe-eval' and 'unsafe-inline'. In
  // prod, we rely on nonces + 'strict-dynamic' to allow only explicitly
  // authorized scripts loaded by a nonce-bearing script. The `style-src`
  // remains 'unsafe-inline' due to Tailwind + shadcn inlining styles.
  const scriptSrc = IS_PRODUCTION
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' https:`
    : `'self' 'unsafe-inline' 'unsafe-eval' blob:`;

  // Dev: ws: allowed for HMR
  const devConnect = IS_PRODUCTION ? "" : " ws: wss:";

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://*.tiles.mapbox.com https://api.mapbox.com https://placehold.co`,
    `connect-src ${connectSources.join(" ")}${devConnect}`,
    `worker-src 'self' blob:`,
    `font-src 'self' data:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    IS_PRODUCTION ? "upgrade-insecure-requests" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

function applySecurityHeaders(
  response: NextResponse,
  nonce: string,
): void {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self), payment=()",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");

  if (IS_PRODUCTION) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  response.headers.set("x-nonce", nonce);
}

// ─── Rate limiting ───────────────────────────────────────────────────────────

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

const RATE_API_LIMIT = Number(process.env.AURA_RATE_API_LIMIT ?? 200);
const RATE_API_WINDOW_MS = 60_000;
const RATE_MANIFEST_LIMIT = 30;
const RATE_MANIFEST_WINDOW_MS = 60_000;

function enforceProxyRateLimit(
  request: NextRequest,
): { allowed: true } | { allowed: false; response: NextResponse } {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/aura")) return { allowed: true };

  const ip = clientIp(request);
  const isManifest = pathname.endsWith("/_manifest");
  const key = `${isManifest ? "manifest" : "api"}:${ip}`;
  const { allowed, resetAt, remaining } = takeRateLimitToken(
    key,
    isManifest ? RATE_MANIFEST_LIMIT : RATE_API_LIMIT,
    isManifest ? RATE_MANIFEST_WINDOW_MS : RATE_API_WINDOW_MS,
  );

  if (!allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    const response = jsonReject(
      "Trop de requêtes. Réessayez dans quelques instants.",
      429,
    );
    response.headers.set("Retry-After", String(retryAfterSec));
    response.headers.set("X-RateLimit-Reset", String(resetAt));
    response.headers.set("X-RateLimit-Remaining", "0");
    return { allowed: false, response };
  }

  return { allowed: true };
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const nonce = generateNonce();

  // Rate limit first — cheapest rejection.
  const limit = enforceProxyRateLimit(request);
  if (!limit.allowed) {
    applySecurityHeaders(limit.response, nonce);
    return limit.response;
  }

  // Forward the nonce to RSC via request headers so layouts can read it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-aura-request-id", uuidv4());
  applySecurityHeaders(response, nonce);

  // CSRF guard on Aura unsafe-methods.
  if (pathname.startsWith("/api/aura") && isUnsafeMethod(request.method)) {
    const origin = request.headers.get("origin");
    if (!origin || !trustedOrigins(request).has(origin)) {
      return applyHeadersCopy(jsonReject("Origine non autorisée."), response);
    }

    const cookies = parseCookieHeader(request.headers.get("cookie"));
    const csrfCookie = cookies.get(getCsrfCookieName());
    const csrfHeader = request.headers.get(csrfHeaderName());

    if (
      !csrfCookie ||
      !csrfHeader ||
      csrfCookie !== csrfHeader ||
      !(await verifyCsrfToken(csrfHeader))
    ) {
      return applyHeadersCopy(jsonReject("Protection CSRF invalide."), response);
    }
  }

  const hasSessionCookie = Boolean(
    request.cookies.get(sessionCookieName())?.value,
  );

  // Protect private paths: if no session cookie, send to login.
  if (isProtectedPath(pathname) && !hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the intended destination so login can redirect back.
    loginUrl.searchParams.set("redirect", pathname + (request.nextUrl.search || ""));
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user hitting an auth page: redirect to dashboard.
  //
  // The cookie is trusted here at the transport layer — its cryptographic
  // validation and session-state check happen in the page handlers. If the
  // cookie is stale, the page will surface the proper auth error and clear
  // the cookie; at that point a second visit will fall through cleanly.
  if (isAuthPage(pathname) && hasSessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  await ensureCsrfCookie(request, response);
  return response;
}

function applyHeadersCopy(target: NextResponse, source: NextResponse): NextResponse {
  for (const [key, value] of source.headers.entries()) {
    if (!target.headers.has(key)) target.headers.set(key, value);
  }
  return target;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp)$).*)",
  ],
};
