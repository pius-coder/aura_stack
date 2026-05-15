# Scheduler & cron

Aura ships two complementary scheduling primitives:

| Primitive | Use case | API |
|-----------|----------|-----|
| `ctx.scheduler` | One-off, dynamic, called from operation handlers (e.g. "send reminder in 5 min") | `ctx.scheduler.runAfter / runAt / cancel` |
| `defineCronFn` | Recurring, declared at startup ("every day at 9 AM") | `defineCronFn(name).schedule(expr).handler(fn)` |

## Scheduler (one-off jobs)

### Schedule from a handler

```ts
.mutate()
.handler(async ({ ctx, input }) => {
  const order = await ctx.db.order.create({ data: input });

  // Send a receipt in 5 minutes
  const jobId = await ctx.scheduler.runAfter(
    5 * 60 * 1000,
    api.emails.sendReceipt,
    { orderId: order.id, email: order.email },
  );

  // Or at a specific time
  await ctx.scheduler.runAt(
    new Date("2025-12-25T09:00:00Z"),
    api.notifications.holidayWishes,
    { userId: order.userId },
  );

  return { order, scheduledJobId: jobId };
});
```

The scheduler accepts both typed `OperationRef` (preferred) and plain string operation names.

### Cancel a scheduled job

```ts
await ctx.scheduler.cancel(jobId);
```

Marks the `AuraJobRun` row as `CANCELLED` — only effective if the job hasn't started yet.

### How it runs

`runAfter` / `runAt` insert an `AuraJobRun` row with `status="PENDING"` and `runAt`. A worker process (`bun aura:outbox` or the in-process equivalent) polls due jobs:

```sql
SELECT * FROM "AuraJobRun"
WHERE status IN ('PENDING', 'RUNNING')
  AND "runAt" <= NOW()
  AND ("lockedUntil" IS NULL OR "lockedUntil" <= NOW())
ORDER BY "runAt" ASC
LIMIT 50
```

For each row:
1. Atomic `UPDATE` to claim (set `status="RUNNING"`, `lockedUntil=now+60s`, increment `attempts`).
2. Call `runAuraOperation({ operationName, input, source: "scheduler" })`.
3. On success → `status="SUCCEEDED"`, `completedAt=now()`.
4. On failure with `attempts < maxAttempts` → exponential backoff (`runAt = now + 2^attempts s`, capped at 1h), `status="PENDING"`.
5. On failure with `attempts >= maxAttempts` → `status="FAILED"`, `lastError` set.

**At-least-once delivery**: if the worker crashes mid-execution, `lockedUntil` expires and the job is picked up again. Handlers must be idempotent (e.g. check before sending an email).

### Run the worker in dev

```bash
bun src/aura/server/scheduler-runner.ts
```

In production, deploy as a separate process or container.

## Cron (recurring jobs)

### Define one

```ts
// src/operations/notifications/process-outbox.cron.ts
import { defineCronFn } from "@/aura/server/cron";

export default defineCronFn("notifications.process-outbox")
  .schedule("*/5 * * * *")     // every 5 minutes (cron expression)
  .handler(async (ctx) => {
    const { processOutboxEvents } = await import("@/aura/server/outbox");
    const result = await processOutboxEvents(100);
    ctx.log.info("outbox processed", result);
  });
```

### Trigger via the CLI

```bash
bun aura:cron run notifications.process-outbox
```

This calls `POST /aura-internal/runJob` with the `x-aura-internal-secret` header. The internal endpoint dispatches to `runAuraCron(name)`, which:

1. Looks up the cron in the registry.
2. Inserts an `AuraJobRun` row with `status="RUNNING"` and `jobName`.
3. Builds a fresh `AuraContext` with `source: "cron"`.
4. Calls the handler.
5. Updates the row with `status` (`SUCCEEDED` or `FAILED`), `completedAt`, and `lastError` if any.

### Schedule expressions

Standard 5-field cron: `minute hour day-of-month month day-of-week`. Common patterns:

| Expression | Meaning |
|------------|---------|
| `* * * * *` | every minute |
| `*/5 * * * *` | every 5 minutes |
| `0 * * * *` | every hour on the hour |
| `0 0 * * *` | daily at midnight UTC |
| `0 9 * * 1` | every Monday at 9 AM UTC |
| `0 0 1 * *` | first of every month |

Use [crontab.guru](https://crontab.guru) to validate expressions.

### Wire to your scheduler

Aura doesn't ship a built-in cron daemon — pick whichever fits your deployment:

| Environment | Approach |
|-------------|----------|
| Bare metal / VM | `crontab -e` calling `bun aura:cron run <name>` |
| Kubernetes | `CronJob` resource calling the same |
| Vercel / Netlify | Vercel Cron Jobs / Netlify Scheduled Functions hitting `/aura-internal/runJob` with the secret header |
| Railway / Fly.io | Built-in cron schedulers |

## Job tracking

`AuraJobRun` is the universal log:

```ts
const recent = await ctx.db.auraJobRun.findMany({
  where: { jobName: "notifications.process-outbox" },
  orderBy: { startedAt: "desc" },
  take: 20,
});
// Inspect attempts, status, lastError, durations
```

## Outbox processor

The outbox is a separate worker that processes `AuraOutboxEvent` rows (notifications queued via `ctx.notify.*`) plus due `AuraJobRun` rows (scheduler):

```bash
bun aura:outbox     # one-shot pass
```

Run it on a loop in production:

```bash
while true; do bun aura:outbox; sleep 5; done
```

Or as a long-lived process — see `src/aura/server/scheduler-runner.ts`.
