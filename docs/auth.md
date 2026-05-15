# Auth & sessions

Aura ships a complete auth subsystem covering OTP, password, and phone flows. Sessions are server-side, cookie-based, and HMAC-bound.

## Models

| Model | Role |
|-------|------|
| `AuraUser` | The user account. `email`, `displayName`, `isAdmin`, `isBlocked`, `sessionVersion`. |
| `AuraSession` | Active session row. `tokenHash` (hashed cookie value), `csrfTokenHash`, `expiresAt`, `lastUsedAt`, `userAgentHash`, `ipHash`, `sessionVersion`. |
| `AuraPasswordCredential` | `passwordHash` (bcrypt). Optional — accounts without a password use OTP/phone. |
| `AuraPhoneIdentity` | `phoneE164`, `verifiedAt`, `whatsappVerifiedAt`. |
| `AuraOtpChallenge` | One-time codes for register/login/reset/sensitive flows. `codeHash`, `expiresAt`, `attempts`. |

## Cookie contract

| Cookie | HttpOnly | Secure | SameSite | Path | Lifetime |
|--------|---------|--------|----------|------|----------|
| `aura_session` | ✅ | prod only | `lax` | `/` | session expiry |
| `aura_csrf` | ❌ | prod only | `lax` | `/` | 30 days, refreshed on login |

`aura_session` is opaque (a base64url token whose hash is stored in `AuraSession.tokenHash`). `aura_csrf` is `${nonce}.${HMAC_SHA256(secret, nonce)}`.

## Session lifecycle

### Issuance

`createSession(userId)` (called by login operations) generates a token, hashes it, persists `AuraSession`, and queues a cookie write through `ctx.auth.setSessionCookie(token, expiresAt)`.

### Resolution (per request)

`resolveSessionFromRequest(db, request)` is invoked by `createAuraContext`:

1. Parse `aura_session` from the Cookie header.
2. SHA-256 hash → look up `AuraSession`.
3. Validate:
   - Not revoked (`revokedAt IS NULL`)
   - Not expired (`expiresAt > now()`)
   - `sessionVersion` matches the user's current version
   - User not disabled (`disabledAt IS NULL`) and not deleted
4. If older than 60 s since `lastUsedAt`, fire-and-forget update of `lastUsedAt`.
5. Return `{ session, user }` or `{ session: null, user: null }`.

The whole resolution is wrapped in React's `cache()` so multiple operations within the same render share the result.

### Auto-cleanup of stale cookies

If the request carries an `aura_session` cookie that doesn't resolve to a live session, the runner queues a delete-cookie mutation. Next response the browser drops the stale cookie.

### Revocation

```ts
import { revokeCurrentSession, revokeAllUserSessions } from "@/aura/server/auth/session";

// Logout the current session
await revokeCurrentSession(ctx.db, ctx.session.id);

// Logout every device (e.g. after password change)
await revokeAllUserSessions(ctx.db, ctx.user.id);  // bumps user.sessionVersion
```

Bumping `sessionVersion` invalidates all existing `AuraSession` rows for the user — they fail validation on the next request.

## Errors

| Code | When |
|------|------|
| `UNAUTHORIZED` | `.auth()` operation called without a session |
| `SESSION_EXPIRED` | session.expiresAt < now() |
| `SESSION_REVOKED` | session.revokedAt is set, OR sessionVersion mismatch, OR user disabled/deleted |

## OTP flow

```ts
import { defineOperationFn } from "@/aura/server/operation";
import { sendOtp, verifyOtp } from "@/aura/server/auth/otp";

defineOperationFn("auth.otp.request")
  .mutate()
  .input(z.object({ phone: z.string() }))
  .public()
  .handler(async ({ ctx, input }) => {
    return sendOtp(ctx.db, input.phone, "LOGIN_PHONE");
  });

defineOperationFn("auth.otp.verify")
  .mutate()
  .input(z.object({ phone: z.string(), code: z.string().length(6) }))
  .public()
  .handler(async ({ ctx, input }) => {
    const user = await verifyOtp(ctx.db, input.phone, input.code);
    const { token, expiresAt } = await createSession(ctx.db, user.id);
    ctx.auth.setSessionCookie(token, expiresAt);
    return { ok: true };
  });
```

## Password flow

```ts
import { hashPassword, verifyPassword } from "@/aura/server/auth/password";

// Register
const hash = await hashPassword(input.password);
await ctx.db.auraPasswordCredential.create({ data: { userId, passwordHash: hash } });

// Login
const cred = await ctx.db.auraPasswordCredential.findUnique({ where: { userId } });
if (!cred || !await verifyPassword(input.password, cred.passwordHash)) {
  throw new AuraError("UNAUTHORIZED", "Identifiants invalides.");
}
```

## Auth guard on the client

Wrap protected pages with `<AuraGuardView>` (uses `<AuraGuard>` under the hood):

```tsx
import { AuraGuardView } from "@/aura/ui";

export default function SettingsPage() {
  return (
    <AuraGuardView redirectTo="/login">
      <Settings />
    </AuraGuardView>
  );
}
```

The guard fires `useAuraQuery("auth.me")` (configurable) and shows a loading spinner / redirects on unauthenticated.

## Auth UI

`<AuraAuthCard>` ships login/register/OTP/phone flows out of the box:

```tsx
import { AuraAuthCard } from "@/aura/ui";

<AuraAuthCard
  title="Connexion"
  modes={["password", "otp"]}
  onSuccess={() => router.navigate({ to: "/" })}
/>
```

## Threat model & defenses

| Threat | Defense |
|--------|---------|
| Session hijacking | `aura_session` is HttpOnly + Secure (prod) + token hashed in DB |
| CSRF | Double-submit cookie (`aura_csrf` cookie + `x-aura-csrf` header) verified by HMAC |
| Brute force OTP | `AuraOtpChallenge.attempts` counter, max 5; rate limit on the operation |
| Session fixation | Session token rotated on privilege change (set new cookie + revoke old) |
| Stale device after password change | `revokeAllUserSessions` bumps `sessionVersion`; existing sessions fail validation |

See [Security](./security.md) for the full threat surface.
