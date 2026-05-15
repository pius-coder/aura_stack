/**
 * `AuraScheduler` — durable, at-least-once scheduling of Aura operations.
 *
 * Resolves: Requirements 18.1, 18.2, 18.3, 18.7, 18.8 (Decision 13).
 *
 * The scheduler persists every job into `AuraJobRun` with status
 * `PENDING`. A worker (the outbox processor, extended in task 9.2)
 * picks up rows whose `runAt <= now()` and executes them through
 * `runAuraOperation`.
 *
 * The runtime accepts both a typed `OperationRef` and a plain string
 * name for backward compatibility — the handler only needs the name to
 * resolve the operation in the registry at execution time.
 */

import type { AuraDb } from "./db";
import type { OperationRef, OperationType, AuraScheduler as AuraSchedulerType } from "@/aura/core/types";
import { toPrismaJson } from "./json";

function refName(ref: OperationRef | string): string {
  return typeof ref === "string" ? ref : ref._name;
}

export function createAuraScheduler(db: AuraDb): AuraSchedulerType {
  async function schedule(runAt: Date, ref: OperationRef | string, input: unknown): Promise<string> {
    const operationName = refName(ref);
    const job = await db.auraJobRun.create({
      data: {
        jobName: `scheduler:${operationName}`,
        operationName,
        input: toPrismaJson(input ?? null),
        status: "PENDING",
        runAt,
        attempts: 0,
        maxAttempts: 3,
      },
    });
    return job.id;
  }

  return {
    async runAfter(delayMs, ref, input) {
      return schedule(new Date(Date.now() + delayMs), ref as OperationRef<OperationType, unknown>, input);
    },
    async runAt(timestamp, ref, input) {
      return schedule(timestamp, ref as OperationRef<OperationType, unknown>, input);
    },
    async cancel(scheduledId) {
      // Only PENDING jobs can be cancelled. RUNNING jobs are left alone
      // (no preemption — the worker decides if it commits or aborts).
      await db.auraJobRun.updateMany({
        where: { id: scheduledId, status: "PENDING" },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
    },
  };
}
