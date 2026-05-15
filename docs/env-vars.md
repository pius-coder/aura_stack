# Environment variables

Full reference of every environment variable Aura reads.

## Required

| Variable | Used by | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | Prisma | Postgres connection string. e.g. `postgresql://user:pass@host:5432/db?schema=public` |

## Required in production

| Variable | Used by | Purpose |
|----------|---------|---------|
| `AURA_INTERNAL_SECRET` | Server, broadcast, internal endpoint | HMAC secret for signed `POST /invalidate`, internal endpoint header verification, fallback for CSRF. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `AURA_CSRF_SECRET` | Server | HMAC secret for CSRF token signing. Falls back to `AURA_INTERNAL_SECRET` if unset. |
| `NODE_ENV` | Various | Set to `production` to enable secure cookies and strict secret enforcement. |

## Realtime / broadcast

| Variable | Default | Purpose |
|----------|---------|---------|
| `AURA_BROADCAST_PORT` | `3001` | Port the broadcast server listens on. |
| `AURA_APP_URL` | `http://localhost:3000` | Allowed CORS origin for the broadcast server. Set to your production app URL in prod. |
| `AURA_BROADCAST_INTERNAL_URL` | (none) | Server-side URL used by `publishInvalidation` to POST `/invalidate`. e.g. `http://broadcast:3001` in Docker, or `https://broadcast.example.com` in prod. If unset, server-side broadcast silently no-ops. |
| `VITE_AURA_WS_URL` | (none) | **Client-side** WebSocket URL the browser uses. **Must** be `VITE_*` to be inlined into the client bundle. e.g. `ws://localhost:3001/ws` in dev, `wss://broadcast.example.com/ws` in prod. If unset, no WebSocket — same-tab + cross-tab via BroadcastChannel still works. |

## Storage

| Variable | Default | Purpose |
|----------|---------|---------|
| `AURA_STORAGE_DRIVER` | `filesystem` | `filesystem` or `s3`. |
| `AURA_STORAGE_PATH` | `./uploads` | Filesystem driver root. Must be writable by the server process. |
| `AURA_S3_BUCKET` | — | S3 bucket name. |
| `AURA_S3_REGION` | — | S3 region (e.g. `eu-west-3`). |
| `AURA_S3_ACCESS_KEY_ID` | — | S3 access key. |
| `AURA_S3_SECRET_ACCESS_KEY` | — | S3 secret. |
| `AURA_S3_ENDPOINT` | — | Optional. Set for non-AWS S3-compatible providers (R2, B2, MinIO). |

## Cookies (rarely changed)

| Variable | Default | Purpose |
|----------|---------|---------|
| `AURA_SESSION_COOKIE_NAME` | `aura_session` | Override the session cookie name. |
| `AURA_CSRF_COOKIE_NAME` | `aura_csrf` | Override the CSRF cookie name. |

## AI

| Variable | Used by | Purpose |
|----------|---------|---------|
| `OPENROUTER_API_KEY` | Agents using `ChatOpenRouter` | OpenRouter API key. |
| `OPENAI_API_KEY` | Agents using `ChatOpenAI` | OpenAI API key. (LangChain reads this automatically.) |
| `ANTHROPIC_API_KEY` | Agents using `ChatAnthropic` | Anthropic API key. |
| `GOOGLE_API_KEY` | Agents using `ChatGoogleGenerativeAI` | Google API key. |

## Example `.env`

### Dev

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/aura_stack?schema=public"

AURA_INTERNAL_SECRET="<random-32-bytes>"
AURA_CSRF_SECRET="<random-32-bytes>"

AURA_BROADCAST_PORT=3001
AURA_APP_URL="http://localhost:3000"
AURA_BROADCAST_INTERNAL_URL="http://localhost:3001"
VITE_AURA_WS_URL="ws://localhost:3001/ws"

AURA_STORAGE_DRIVER="filesystem"
AURA_STORAGE_PATH="./uploads"

OPENROUTER_API_KEY="sk-or-..."
```

### Production (illustrative)

```bash
NODE_ENV=production
DATABASE_URL="postgresql://aura_app:...@db.internal:5432/aura?sslmode=require"

AURA_INTERNAL_SECRET="${SECRET_INTERNAL}"
AURA_CSRF_SECRET="${SECRET_CSRF}"

AURA_BROADCAST_PORT=3001
AURA_APP_URL="https://app.example.com"
AURA_BROADCAST_INTERNAL_URL="http://broadcast.aura.svc.cluster.local:3001"
VITE_AURA_WS_URL="wss://app.example.com/ws"

AURA_STORAGE_DRIVER=s3
AURA_S3_BUCKET=example-uploads
AURA_S3_REGION=eu-west-3
AURA_S3_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"
AURA_S3_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"

OPENROUTER_API_KEY="${OPENROUTER_KEY}"
```

## Variables Aura does NOT read

(For clarity — common confusions)

- `PORT` — Aura uses the Vite-provided port. Configure via the `--port` flag in `package.json` scripts.
- `NEXT_PUBLIC_*` — Aura is on TanStack Start, not Next.js. Use `VITE_*` for client-side env vars.

## Bundle vs runtime

| Prefix | Available in |
|--------|-------------|
| (no prefix) | Server only — never inlined into the client bundle |
| `VITE_*` | Client bundle (and server) — inlined at build time |

Never put secrets behind `VITE_*`. Anything inlined into the client is public.
