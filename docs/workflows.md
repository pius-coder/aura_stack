# Durable workflows

For multi-step business processes that must survive process restarts (order fulfillment, onboarding sequences, payment retries), use `defineWorkflow`.

## Concept

A **workflow** is a function that runs in **steps**. Each step's result is persisted to `AuraWorkflowRun.completedSteps` before moving on. If the process crashes mid-workflow, restarting it resumes from the last completed step — already-done work isn't repeated.

## Define one

```ts
// src/operations/orders/fulfill.workflow.ts
import { defineWorkflow } from "@/aura/server/workflow";

export default defineWorkflow("orders.fulfill")
  .handler(async (ctx, input: { orderId: string }) => {
    // Step 1 — read the order
    const order = await ctx.step("load-order", async () => {
      const { getOperation } = await import("@/aura/server/registry");
      const op = getOperation("orders.getById")!;
      const { createAuraContext } = await import("@/aura/server/create-context");
      return op.execute({ ctx: await createAuraContext({ source: "internal" }), input });
    });

    // Step 2 — charge the card
    const charge = await ctx.step("charge", async () => {
      // … call payment provider …
      return { chargeId: "ch_123" };
    });

    // Step 3 — wait an hour before shipping
    await ctx.sleep(60 * 60 * 1000);

    // Step 4 — create shipment
    const shipment = await ctx.step("create-shipment", async () => {
      // … call shipping provider …
      return { trackingId: "tn_456" };
    });

    return { status: "fulfilled", chargeId: charge.chargeId, trackingId: shipment.trackingId };
  });
```

## Start a workflow

```ts
import { startWorkflow } from "@/aura/server/workflow";

defineOperationFn("orders.beginFulfillment")
  .mutate()
  .input(z.object({ orderId: z.string() }))
  .auth()
  .handler(async ({ ctx, input }) => {
    const runId = await startWorkflow("orders.fulfill", input, ctx.db);
    return { runId };
  });
```

`startWorkflow` inserts an `AuraWorkflowRun` row with `status=PENDING` and returns the run ID. The outbox/scheduler worker picks it up and calls `executeWorkflowRun(runId)`.

## Steps

```ts
ctx.step(name: string, fn: () => Promise<T>): Promise<T>
```

- Persists `{ name, result, completedAt }` in `AuraWorkflowRun.completedSteps` after `fn()` resolves.
- On replay (after a crash), if the step is already in `completedSteps`, returns the cached result without re-running `fn`.
- The step name must be stable across runs — don't include timestamps or random IDs in the name.

## Sleep

```ts
ctx.sleep(ms: number): Promise<void>
```

Schedules a resume after the delay (via `AuraJobRun`) and throws an internal `WorkflowSleepError` to halt execution. The scheduler picks it up later and re-invokes `executeWorkflowRun(runId)`, which replays completed steps and continues past the sleep.

Persisted across process restarts. Useful for retry windows, cooldowns, scheduled phases.

## Cancel a workflow

```ts
ctx.cancel(workflowRunId: string): Promise<void>
```

Marks a `PENDING`, `RUNNING`, or `SLEEPING` workflow as `CANCELLED`. Doesn't preempt a running step — the worker decides if it commits the next step or aborts.

## Status

`AuraWorkflowRun.status`:

| Status | Meaning |
|--------|---------|
| `PENDING` | Created, not yet started |
| `RUNNING` | Worker is executing handler |
| `SLEEPING` | Paused via `ctx.sleep`, awaiting resume |
| `COMPLETED` | Handler returned successfully |
| `FAILED` | Handler threw (and not a sleep) |
| `CANCELLED` | Cancelled before completion |

Query progress from any operation:

```ts
const run = await ctx.db.auraWorkflowRun.findUnique({ where: { id: runId } });
return { status: run.status, currentStep: run.currentStep };
```

## Idempotency

Steps are at-least-once: if the worker crashes between `fn()` resolving and the result being persisted, the step re-runs on resume. Make `fn` idempotent — e.g., charge providers expect an idempotency key:

```ts
ctx.step("charge", async () => {
  return stripe.charges.create({ amount, currency: "eur" }, {
    idempotencyKey: `order-${input.orderId}-charge`,
  });
});
```

## When to use workflows

| Use case | Workflow? |
|----------|-----------|
| Single DB transaction | No — use `.mutate()` with `ctx.db.$transaction` |
| Multi-step that all succeed quickly | Maybe — `.action()` is simpler if no sleep/wait |
| Multi-step with delays / external waits | ✅ |
| Multi-step that must survive crashes | ✅ |
| Long-running (hours/days) with multiple human approvals | ✅ |

## Limits

- Workflow input is JSON-serialized — keep it small (< 1 MB recommended).
- Each step result is JSON-serialized — same constraint.
- No native parallel-step API yet (use `Promise.all` inside a single step manually).
