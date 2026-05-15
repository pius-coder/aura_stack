# Deploy Vibe

## Prerequisites
- Linux VPS with Bun 1.2+, PostgreSQL 18 + pgvector, Redis (optional)
- Evolution API instance connected to WhatsApp number

## Environment
Copy `.env.example` and fill all secrets:
```bash
cp .env.example .env
# Generate secrets:
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Steps
```bash
bun install
bun run db:deploy          # apply migrations
bun run db:seed            # optional: seed test data
bun run build              # production build
NODE_ENV=production bun run preview
```

## Broadcast server
```bash
NODE_ENV=production bun src/aura/server/broadcast.ts &
```

## Cron jobs
```bash
# Add to crontab:
* * * * * cd /app && bun aura:cron run whatsapp.process-outbox
0 * * * * cd /app && bun aura:cron run subscriptions.expire-pro
0 * * * * cd /app && bun aura:cron run boosts.expire
```

## Evolution API webhook
```bash
bun run evo:configure-webhook
```
