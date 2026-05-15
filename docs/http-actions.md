# HTTP actions (webhooks)

Aura's bridge protocol assumes JSON envelopes and CSRF-protected POSTs. For **webhooks**, **OAuth callbacks**, **file upload endpoints**, or any third-party integration that doesn't speak Aura, use `defineHttpAction`.

## Declare a handler

```ts
// src/operations/webhooks/stripe.http.ts
import { defineHttpAction } from "@/aura/server/http-action";

export default defineHttpAction("/webhooks/stripe", "POST")
  .public()
  .csrf(false)         // webhooks don't carry CSRF tokens
  .handler(async (ctx, request) => {
    const sig = request.headers.get("stripe-signature");
    const body = await request.text();
    const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

    if (event.type === "checkout.session.completed") {
      await ctx.runMutation("orders.markPaid", { stripeId: event.data.object.id });
    }

    return new Response("ok", { status: 200 });
  });
```

The handler receives:
- `ctx: AuraContext` — full Aura context with session, db, runQuery/runMutation, scheduler, agent, storage.
- `request: Request` — raw Fetch API request. You own parsing.

It returns a raw `Response`.

## Builder stages

```ts
defineHttpAction(path, method)
  .auth() | .public() | .internal()    // access control
  .csrf(true | false)                   // CSRF check, default false
  .handler(fn)
```

| Modifier | Default | When to set true |
|----------|---------|-------------------|
| `.csrf(true)` | `false` | Endpoints called from your own browser frontend (not webhooks) |
| `.auth()` | — | Endpoints that require an authenticated user |
| `.internal()` | — | Endpoints called only from internal infrastructure with `x-aura-internal-secret` |
| `.public()` | — | Anyone can call (with optional CSRF) |

## Mounting

HTTP actions are mounted under `/aura-http/` (configurable). The path you declare is appended:

| `defineHttpAction(path, method)` | URL |
|----------------------------------|-----|
| `("/webhooks/stripe", "POST")` | `POST /aura-http/webhooks/stripe` |
| `("/oauth/google/callback", "GET")` | `GET /aura-http/oauth/google/callback` |
| `("/api/v1/uploads", "POST")` | `POST /aura-http/api/v1/uploads` |

## Generate one with the CLI

```bash
bun aura:make http webhooks/stripe --method POST
```

## OAuth callback example

```ts
// src/operations/oauth/google-callback.http.ts
import { defineHttpAction } from "@/aura/server/http-action";
import { createSession } from "@/aura/server/auth/session";

export default defineHttpAction("/oauth/google/callback", "GET")
  .public()
  .csrf(false)
  .handler(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (!code) {
      return Response.redirect(`${process.env.AURA_APP_URL}/login?error=missing_code`, 302);
    }

    // Exchange code for token (using ctx.fetch)
    const tokenRes = await ctx.fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({ code, grant_type: "authorization_code", /* … */ }),
    });
    const { access_token } = await tokenRes.json();

    // Look up or create the user
    const profile = await ctx.fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    }).then(r => r.json());

    let user = await ctx.db.auraUser.findUnique({ where: { email: profile.email } });
    if (!user) {
      user = await ctx.db.auraUser.create({
        data: { email: profile.email, displayName: profile.name },
      });
    }

    // Create a session and redirect
    const { token, expiresAt } = await createSession(ctx.db, user.id);
    const headers = new Headers({
      Location: `${process.env.AURA_APP_URL}/`,
      "Set-Cookie": `aura_session=${token}; HttpOnly; Path=/; SameSite=Lax; Expires=${expiresAt.toUTCString()}`,
    });
    return new Response(null, { status: 302, headers });
  });
```

## Why not just operations?

You could implement webhooks as `.action()` operations, but:

- The bridge requires `application/json` Content-Type — Stripe sends `application/json`, but other webhooks send `application/x-www-form-urlencoded`, raw text, or multipart.
- The bridge requires the JSON body to be `{ input, params }` — webhooks send arbitrary shapes.
- The bridge applies CSRF — webhooks don't carry the cookie.
- Operations return JSON envelopes — webhooks expect specific status codes / response shapes.

`defineHttpAction` skips all of that and gives you the raw request/response, while still providing `ctx` for DB access, in-process operation calls, etc.
