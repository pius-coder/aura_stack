export function parseCookieHeader(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) continue;
    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

export function sessionCookieName(): string {
  return process.env.AURA_SESSION_COOKIE_NAME || "aura_session";
}

export function csrfCookieName(): string {
  return process.env.AURA_CSRF_COOKIE_NAME || "aura_csrf";
}

export function isSecureCookieEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}
