/**
 * `processScheduledJobs` — executes due `AuraJobRun` rows.
 *
 * Resolves: Requirements 18.4, 18.5, 18.6 (task 9.2).
 *
 * The outbox process (`processOutboxEvents`) handles `AuraOutboxEvent`
 * rows; this companion process handles `AuraJobRun` rows scheduled via
 * `ctx.scheduler.runAfter / runAt`. They share a worker loop pattern
 * (lock, batch, retry, exponential backoff) but live in different
 * tables because their lifecycles are independent — a notification
 * delivery and a delayed Aura operation invocation are different things.
 *
 * Crash recovery: jobs in `RUNNING` past `lockedUntil` are picked up
 * again on the next pass, guaranteeing at-least-once delivery.
 */

import { db } from "./db";
import { runAuraOperation } from "./runner";

const LOCK_DURATION_MS = 60_000;
const DEFAULT_BATCH_SIZE = 50;

export interface ProcessScheduledJobsResult {
  picked: number;
  succeeded: number;
  failed: number;
}

export async function processScheduledJobs(
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<ProcessScheduledJobsResult> {
  const now = new Date();

  // Atomically claim a batch of due jobs by setting RUNNING + a lock
  // expiry. Other workers see lockedUntil > now and skip them.
  const candidates = await db.auraJobRun.findMany({
    where: {
      status: { in: ["PENDING", "RUNNING"] },
      runAt: { lte: now },
      OR: [
        { lockedUntil: null },
        { lockedUntil: { lte: now } },
      ],
    },
    take: batchSize,
    orderBy: { runAt: "asc" },
  });

  let succeeded = 0;
  let failed = 0;

  for (const job of candidates) {
    if (!job.operationName) {
      // Sanity check — `runAfter`/`runAt` always set this. If it's null,
      // something else is using `AuraJobRun` (e.g. cron). Skip cleanly.
      continue;
    }

    const claim = await db.auraJobRun.updateMany({
      where: {
        id: job.id,
        // Only claim if no one else already grabbed it since our SELECT.
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
      },
      data: {
        status: "RUNNING",
        startedAt: now,
        lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS),
        attempts: { increment: 1 },
      },
    });
    if (claim.count === 0) continue;

    try {
      const result = await runAuraOperation({
        operationName: job.operationName,
        input: job.input,
        request: new Request("aura://scheduler"),
        source: "scheduler",
      });

      if (result.envelope.ok) {
        await db.auraJobRun.update({
          where: { id: job.id },
          data: {
            status: "SUCCEEDED",
            completedAt: new Date(),
            finishedAt: new Date(),
            lockedUntil: null,
          },
        });
        succeeded += 1;
      } else {
        throw new Error(result.envelope.error.message);
      }
    } catch (error) {
      const lastError = error instanceof Error ? error.message : String(error);
      const refreshed = await db.auraJobRun.findUnique({ where: { id: job.id } });
      const attempts = refreshed?.attempts ?? job.attempts + 1;
      const maxAttempts = job.maxAttempts ?? 3;

      if (attempts >= maxAttempts) {
        await db.auraJobRun.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            lastError,
            error: lastError,
            completedAt: new Date(),
            finishedAt: new Date(),
            lockedUntil: null,
          },
        });
        failed += 1;
      } else {
        // Exponential backoff: 2^attempts seconds, capped at 1 hour.
        const backoffMs = Math.min(1000 * 2 ** attempts, 60 * 60 * 1000);
        await db.auraJobRun.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            lastError,
            runAt: new Date(Date.now() + backoffMs),
            lockedUntil: null,
          },
        });
      }
    }
  }

  return { picked: candidates.length, succeeded, failed };
}
