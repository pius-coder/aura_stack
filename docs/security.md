# Security

Aura ships with security defaults that are safe-by-default and require zero configuration in dev. Production deployments must set strong secrets explicitly.

## CSRF protection

Aura uses a **double-submit cookie** pattern with HMAC verification:

1. Server issues `aura_csrf` cookie (non-HttpOnly) on the first manifest fetch (`GET /aura/_manifest`).
2. Client transport reads the cookie via `document.cookie` and echoes it as the `x-aura-csrf` header on every unsafe request (`POST`, `PUT`, `PATCH`, `DELETE`).
3. CSRF middleware on the bridge router validates: cookie exists, header exists, both equal, AND HMAC signature on the value is valid.
4. On failure → 403 `FORBIDDEN`.

**Token format**: `${nonce}.${HMAC_SHA256(secret, nonce)}` where `nonce` is 24 random bytes base64url-encoded.

**Auto-healing**: if the manifest endpoint sees an existing cookie that fails HMAC verification (e.g. the secret rotated across server restarts), it reissues a fresh cookie via `Set-Cookie`. Combined with the client transport's auto-retry on `FORBIDDEN`, dev secret rotation never breaks user flow.

**Production requirement**: `AURA_CSRF_SECRET` (or `AURA_INTERNAL_SECRET` as fallback) **must** be set. The middleware fails fast at boot if missing in production.

## Rate limiting

Two complementary mechanisms:

### In-memory bucket (per-process)

```ts
import { takeRateLimitToken } from "@/aura/server/rate-limit-common";

// Allow at most 100 calls per minute under this key
if (!takeRateLimitToken(`bridge:${ctx.request.ip}`, 100, 60_000)) {
  throw new AuraError("RATE_LIMITED", "Too many requests.");
}
```

Used as Hono middleware on the bridge router for proxy-level throttling (cheap, no DB hit).

### DB-backed bucket (cross-process)

```ts
import { enforceRateLimit } from "@/aura/server/rate-limit";

await enforceRateLimit(ctx.db, {
  key: `otp:request:${input.phone}`,
  limit: 5,
  windowSeconds: 60 * 15,    // 5 per 15 minutes
});
```

Uses `AuraRateLimitBucket` row, fixed-window counter. Survives process restarts and works across replicas.

Combine both: use DB-backed for sensitive flows (OTP, login attempts, password reset) and in-memory for general API throttling.

## Secrets

| Variable | Purpose | Required in prod | Dev fallback |
|----------|---------|-----------------|--------------|
| `AURA_INTERNAL_SECRET` | HMAC for `/invalidate` POST, internal endpoint header | ✅ | `aura-dev-secret-change-me` |
| `AURA_CSRF_SECRET` | HMAC for CSRF tokens (falls back to `AURA_INTERNAL_SECRET`) | ✅ | `aura-dev-csrf-secret` |
| `DATABASE_URL` | Postgres connection string | ✅ | — |

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Cookie attributes

| Cookie | HttpOnly | Secure | SameSite | Path |
|--------|----------|--------|----------|------|
| `aura_session` | ✅ | prod only | `lax` | `/` |
| `aura_csrf` | ❌ | prod only | `lax` | `/` |

`Secure` is enabled when `NODE_ENV === "production"`. `SameSite=lax` is the right balance — cookies are sent on top-level navigations (so OAuth redirects work) but not on cross-origin POSTs.

## Internal endpoint guard

`/aura-internal/*` requires `x-aura-internal-secret: $AURA_INTERNAL_SECRET`. Without it → 403. Used by the cron CLI to trigger jobs:

```bash
curl -X POST http://localhost:3000/aura-internal/runJob \
  -H "x-aura-internal-secret: $AURA_INTERNAL_SECRET" \
  -d '{"jobName":"emails.process-outbox"}'
```

## File serving

`/files/:path{.+}` resolves the requested path against `AURA_STORAGE_PATH`. Path traversal (`..`, encoded `..`) is rejected with HTTP 400. MIME type is detected from extension; unknown types fall back to `application/octet-stream`. Cache-Control: `public, max-age=86400`.

When using S3 driver (`AURA_STORAGE_DRIVER=s3`), files are not served by Aura — clients hit pre-signed URLs from `ctx.storage.getUrl()` directly.

## Input validation

Every operation declares a Zod input schema via `.input(z.object({ ... }))`. The runner:

1. Sanitizes `NaN` numbers (Zod treats them as valid `number`).
2. Calls `schema.safeParse(input)`.
3. On failure, throws `AuraError("VALIDATION_ERROR", ..., { fieldErrors: { "path.to.field": ["..."] } })`.
4. The client sees the field errors and can render them inline (used by `<AuraForm>`).

## Output validation (DB reads)

`defineDbReadFn` validates output against a Zod schema before returning, so a view's column shape changing in the DB without a migration update fails loudly with `INTERNAL_ERROR`.

## Read-only enforcement on queries

The runner wraps `ctx.db` in a Proxy when running a `.query()` operation that throws `AuraError("INTERNAL_ERROR")` on any write method (`create`, `update`, `delete`, `upsert`, `$executeRaw`, `$transaction`). Even a type assertion bypass at compile time is caught at runtime.

## Action isolation

`.action()` handlers receive an `AuraContext` whose `db` field throws on **any** access. Actions must go through `ctx.runQuery` / `ctx.runMutation` (which run in their own contexts with proper read/write surfaces). This prevents accidental writes-with-side-effects-without-transaction patterns.

## Production checklist

- [ ] `AURA_INTERNAL_SECRET` set to 32+ random bytes
- [ ] `AURA_CSRF_SECRET` set (can equal internal secret)
- [ ] `DATABASE_URL` uses TLS (`?sslmode=require`)
- [ ] `NODE_ENV=production`
- [ ] `AURA_APP_URL` matches your public origin (CORS for broadcast)
- [ ] `AURA_BROADCAST_INTERNAL_URL` is reachable from app pods
- [ ] Broadcast server runs behind a sticky-session load balancer (or single instance)
- [ ] Reverse proxy enforces HTTPS, HSTS, no `X-Forwarded-Proto: http` injection
- [ ] Cookies served only over HTTPS (`Secure` is automatic when `NODE_ENV=production`)
- [ ] DB user has minimum privileges (no `SUPERUSER`)
