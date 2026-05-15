

import { db } from "./db";
import type { AuraContext } from "./context";
import { createAuraContext } from "./create-context";
import { v4 as uuidv4 } from "uuid";

export interface AuraCronJob {
  readonly __auraCron: true;
  readonly name: string;
  readonly schedule?: string;
  readonly handler: (ctx: AuraContext) => Promise<void>;
}

const cronRegistry = new Map<string, AuraCronJob>();

interface CronBuilder {
  schedule(cronExpr: string): CronBuilder;
  handler(fn: (ctx: AuraContext) => Promise<void>): AuraCronJob;
}

function makeCronBuilder(
  name: string,
  existingState?: { name: string; schedule?: string },
): CronBuilder {
  const state = existingState ?? {
    name,
  };

  return {
    schedule(cronExpr: string) {
      state.schedule = cronExpr;
      return makeCronBuilder(name, state);
    },
    handler(fn: (ctx: AuraContext) => Promise<void>) {
      const job: AuraCronJob = {
        __auraCron: true,
        name: state.name,
        schedule: state.schedule,
        handler: fn,
      };

      if (cronRegistry.has(state.name)) {
        throw new Error(`[aura] Cron job already registered: ${state.name}`);
      }

      cronRegistry.set(state.name, job);
      return job;
    },
  };
}

export function defineCronFn(name: string): CronBuilder {
  return makeCronBuilder(name);
}

export function getCronJob(name: string): AuraCronJob | null {
  return cronRegistry.get(name) ?? null;
}

export function listCronJobs(): AuraCronJob[] {
  return [...cronRegistry.values()];
}

export interface RunAuraCronResult {
  status: "succeeded" | "failed";
  error?: string;
  startedAt: Date;
  finishedAt: Date;
}

export async function runAuraCron(name: string): Promise<RunAuraCronResult> {
  const job = getCronJob(name);
  if (!job) {
    throw new Error(`[aura] Cron job not found: ${name}`);
  }

  const requestId = uuidv4();
  const startedAt = new Date();

  const jobRun = await db.auraJobRun.create({
    data: {
      jobName: name,
      status: "RUNNING",
      requestId,
      startedAt,
    },
  });

  const ctx = await createAuraContext({
    source: "cron",
    requestId,
  });

  try {
    await job.handler(ctx);

    const finishedAt = new Date();
    await db.auraJobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "SUCCEEDED",
        finishedAt,
      },
    });

    return {
      status: "succeeded",
      startedAt,
      finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date();
    const errorMessage = error instanceof Error ? error.message : String(error);

    await db.auraJobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "FAILED",
        finishedAt,
        error: errorMessage,
      },
    });

    ctx.log.error("Aura cron job failed", {
      jobName: name,
      error:
        error instanceof Error ? (error.stack ?? error.message) : String(error),
    });

    return {
      status: "failed",
      error: errorMessage,
      startedAt,
      finishedAt,
    };
  }
}
