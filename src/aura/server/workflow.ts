/**
 * Durable workflows — `defineWorkflow` + `AuraWorkflowRun` persistence.
 * Resolves: Requirements 29.1–29.8 (Task 20).
 *
 * Workflows survive process restarts by persisting step results in the DB.
 * On crash recovery, the workflow resumes from the last completed step.
 */

import { db } from "./db";
import type { AuraDb } from "./db";
import { AuraError } from "@/aura/core/errors";
import { toPrismaJson } from "./json";
import { v4 as uuidv4 } from "uuid";

export interface WorkflowStepResult {
  name: string;
  result: unknown;
  completedAt: string;
}

export interface WorkflowContext {
  /** Execute a named step. If already completed (replay), returns cached result. */
  step<T>(name: string, fn: () => Promise<T>): Promise<T>;
  /** Sleep for a duration (persisted — survives restarts). */
  sleep(ms: number): Promise<void>;
  /** Cancel a running workflow. */
  cancel(workflowRunId: string): Promise<void>;
}

export interface WorkflowDefinition<TInput = unknown> {
  readonly __auraWorkflow: true;
  readonly name: string;
  readonly handler: (ctx: WorkflowContext, input: TInput) => Promise<unknown>;
}

const workflowRegistry = new Map<string, WorkflowDefinition>();

export function defineWorkflow<TInput = unknown>(name: string) {
  return {
    handler(fn: (ctx: WorkflowContext, input: TInput) => Promise<unknown>): WorkflowDefinition<TInput> {
      const def: WorkflowDefinition<TInput> = {
        __auraWorkflow: true,
        name,
        handler: fn,
      };
      workflowRegistry.set(name, def as WorkflowDefinition);
      return def;
    },
  };
}

export function getWorkflow(name: string): WorkflowDefinition | null {
  return workflowRegistry.get(name) ?? null;
}

export function listWorkflows(): WorkflowDefinition[] {
  return [...workflowRegistry.values()];
}

/**
 * Start a new workflow run. Returns the run ID.
 */
export async function startWorkflow(
  name: string,
  input: unknown,
  prisma: AuraDb = db,
): Promise<string> {
  const def = workflowRegistry.get(name);
  if (!def) throw new AuraError("NOT_FOUND", `Workflow introuvable: ${name}`);

  const run = await prisma.auraWorkflowRun.create({
    data: {
      id: uuidv4(),
      workflowName: name,
      input: toPrismaJson(input ?? null) ?? {},
      status: "PENDING",
      completedSteps: toPrismaJson([]) ?? [],
    },
  });

  return run.id;
}

/**
 * Execute (or resume) a workflow run. Called by the scheduler/outbox worker.
 */
export async function executeWorkflowRun(
  runId: string,
  prisma: AuraDb = db,
): Promise<{ status: string; result?: unknown; error?: string }> {
  const run = await prisma.auraWorkflowRun.findUnique({ where: { id: runId } });
  if (!run) throw new AuraError("NOT_FOUND", `Workflow run introuvable: ${runId}`);
  if (run.status === "COMPLETED" || run.status === "CANCELLED") {
    return { status: run.status };
  }

  const def = workflowRegistry.get(run.workflowName);
  if (!def) throw new AuraError("NOT_FOUND", `Workflow introuvable: ${run.workflowName}`);

  await prisma.auraWorkflowRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: run.startedAt ?? new Date() },
  });

  const completedSteps: WorkflowStepResult[] = (run.completedSteps as unknown as WorkflowStepResult[]) ?? [];
  const completedMap = new Map(completedSteps.map((s) => [s.name, s]));

  const ctx: WorkflowContext = {
    async step<T>(name: string, fn: () => Promise<T>): Promise<T> {
      // Replay: if step already completed, return cached result
      const cached = completedMap.get(name);
      if (cached) return cached.result as T;

      // Execute step
      await prisma.auraWorkflowRun.update({
        where: { id: runId },
        data: { currentStep: name },
      });

      const result = await fn();

      // Persist step result
      const stepResult: WorkflowStepResult = {
        name,
        result,
        completedAt: new Date().toISOString(),
      };
      completedSteps.push(stepResult);
      completedMap.set(name, stepResult);

      await prisma.auraWorkflowRun.update({
        where: { id: runId },
        data: { completedSteps: toPrismaJson(completedSteps) },
      });

      return result;
    },

    async sleep(ms: number): Promise<void> {
      const sleepStepName = `__sleep_${Date.now()}`;
      const cached = completedMap.get(sleepStepName);
      if (cached) return;

      // Schedule a resume after the delay
      await prisma.auraJobRun.create({
        data: {
          jobName: `workflow:resume:${runId}`,
          operationName: `__workflow.resume`,
          input: toPrismaJson({ runId }),
          status: "PENDING",
          runAt: new Date(Date.now() + ms),
          attempts: 0,
          maxAttempts: 3,
        },
      });

      // Mark sleep as completed so replay skips it
      completedSteps.push({ name: sleepStepName, result: null, completedAt: new Date().toISOString() });
      await prisma.auraWorkflowRun.update({
        where: { id: runId },
        data: { completedSteps: toPrismaJson(completedSteps), status: "SLEEPING" },
      });

      // Throw a special error to halt execution — the scheduler will resume
      throw new WorkflowSleepError(ms);
    },

    async cancel(workflowRunId: string): Promise<void> {
      await prisma.auraWorkflowRun.updateMany({
        where: { id: workflowRunId, status: { in: ["PENDING", "RUNNING", "SLEEPING"] } },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
    },
  };

  try {
    const result = await def.handler(ctx, run.input);
    await prisma.auraWorkflowRun.update({
      where: { id: runId },
      data: { status: "COMPLETED", completedAt: new Date(), currentStep: null },
    });
    return { status: "COMPLETED", result };
  } catch (error) {
    if (error instanceof WorkflowSleepError) {
      return { status: "SLEEPING" };
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    await prisma.auraWorkflowRun.update({
      where: { id: runId },
      data: { status: "FAILED", error: errorMsg, completedAt: new Date() },
    });
    return { status: "FAILED", error: errorMsg };
  }
}

class WorkflowSleepError extends Error {
  constructor(public readonly ms: number) {
    super(`Workflow sleeping for ${ms}ms`);
  }
}
