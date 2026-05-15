/**
 * `aura:make` — CLI scaffolding for all Aura artifact types.
 * Resolves: Requirements 37.3, 37.10, 39.1 (Task 26.3).
 *
 * Usage:
 *   bun aura:make operation catalog.product-by-slug --type query
 *   bun aura:make middleware with-organization
 *   bun aura:make cron catalog.refresh-views --schedule "0 *_/5 * * *"
 *   bun aura:make workflow orders.fulfill
 *   bun aura:make agent customer-support
 *   bun aura:make http webhooks/stripe --method POST
 *   bun aura:make search Product
 *   bun aura:make vector Document --dimensions 1536
 *   bun aura:make db-read orders.summary
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const OPS_DIR = "src/operations";

function kebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[_.]/g, "-").toLowerCase();
}

function ensureWrite(relPath: string, content: string): void {
  const full = join(ROOT, relPath);
  if (existsSync(full)) {
    console.log(`! Already exists: ${relPath}`);
    return;
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
  console.log(`✓ Created: ${relPath}`);
}

/** Convert dot-notation name to file path segments. */
function nameToPath(name: string): { dir: string; file: string } {
  const parts = name.split(".");
  const file = kebab(parts.pop()!);
  const dir = parts.map(kebab).join("/");
  return { dir, file };
}

function getFlag(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

// ─── Generators ───

function makeOperation(name: string): void {
  const type = getFlag("--type") ?? "query";
  if (!["query", "mutate", "action"].includes(type)) {
    console.error("--type must be query, mutate, or action");
    process.exit(1);
  }
  const { dir, file } = nameToPath(name);
  const path = dir ? `${OPS_DIR}/${dir}/${file}.operation.ts` : `${OPS_DIR}/${file}.operation.ts`;

  const entityGuess = name.split(".")[0];
  const entity = entityGuess.charAt(0).toUpperCase() + entityGuess.slice(1);

  ensureWrite(path, `import { defineOperationFn } from "@/aura/server/operation";
import { z } from "zod";

export default defineOperationFn("${name}")
  .${type}()
  .input(z.object({
    // TODO: define input schema
  }))
  .entities(["${entity}"])
  .auth()
  .handler(async (ctx, { input }) => {
    // TODO: implement
  });
`);
}

function makeMiddleware(name: string): void {
  const file = kebab(name);
  const path = `${OPS_DIR}/_middleware/${file}.middleware.ts`;

  ensureWrite(path, `import type { AuraContext } from "@/aura/server/context";

/**
 * Middleware: ${name}
 */
export default async function ${name.replace(/-/g, "")}(ctx: AuraContext, next: () => Promise<void>): Promise<void> {
  // TODO: implement middleware logic
  await next();
}
`);
}

function makeCron(name: string): void {
  const schedule = getFlag("--schedule") ?? "0 0 * * *";
  const { dir, file } = nameToPath(name);
  const path = dir ? `${OPS_DIR}/${dir}/${file}.cron.ts` : `${OPS_DIR}/${file}.cron.ts`;

  ensureWrite(path, `import { defineCronFn } from "@/aura/server/cron";

export default defineCronFn("${name}")
  .schedule("${schedule}")
  .handler(async (ctx) => {
    // TODO: implement cron job
  });
`);
}

function makeWorkflow(name: string): void {
  const { dir, file } = nameToPath(name);
  const path = dir ? `${OPS_DIR}/${dir}/${file}.workflow.ts` : `${OPS_DIR}/${file}.workflow.ts`;

  ensureWrite(path, `import { defineWorkflow } from "@/aura/server/workflow";
import { z } from "zod";

export default defineWorkflow("${name}")
  .handler(async (ctx, input) => {
    const step1 = await ctx.step("step-1", async () => {
      // TODO: implement first step
      return { result: true };
    });

    // TODO: add more steps
    return { completed: true };
  });
`);
}

function makeAgent(name: string): void {
  const file = kebab(name);
  const path = `${OPS_DIR}/ai/${file}.agent.ts`;

  ensureWrite(path, `/**
 * AI Agent: ${name}
 */
export default {
  name: "${name}",
  systemPrompt: "You are a helpful assistant.",
  tools: [],
  maxSteps: 10,
};
`);
}

function makeHttp(pathArg: string): void {
  const method = getFlag("--method") ?? "POST";
  const file = kebab(pathArg.replace(/\//g, "-"));
  const path = `${OPS_DIR}/${pathArg.split("/").map(kebab).join("/")}`.replace(/\/?$/, "") + `.http.ts`;
  const actualPath = `${OPS_DIR}/${pathArg.split("/").slice(0, -1).map(kebab).join("/")}/${file}.http.ts`;

  const httpPath = "/" + pathArg;

  ensureWrite(actualPath || path, `import { defineHttpAction } from "@/aura/server/http-action";

export default defineHttpAction("${httpPath}", "${method}")
  .public()
  .csrf(false)
  .handler(async (ctx, request) => {
    // TODO: implement webhook handler
    return new Response("ok", { status: 200 });
  });
`);
}

function makeSearch(model: string): void {
  const file = kebab(model);
  const path = `${OPS_DIR}/${file}.search.ts`;

  ensureWrite(path, `import { defineSearchIndex } from "@/aura/server/search";

export default defineSearchIndex("${model}", {
  fields: ["name", "description"], // TODO: adjust fields
  filterFields: [],
  language: "english",
});
`);
}

function makeVector(model: string): void {
  const dimensions = getFlag("--dimensions") ?? "1536";
  const file = kebab(model);
  const path = `${OPS_DIR}/${file}.vector.ts`;

  ensureWrite(path, `import { defineVectorIndex } from "@/aura/server/vector";

export default defineVectorIndex("${model}", {
  vectorField: "embedding",
  dimensions: ${dimensions},
  filterFields: [],
  indexType: "hnsw",
});
`);
}

function makeDbRead(name: string): void {
  const { dir, file } = nameToPath(name);
  const path = dir ? `${OPS_DIR}/${dir}/${file}.db-read.ts` : `${OPS_DIR}/${file}.db-read.ts`;

  ensureWrite(path, `import { defineDbReadFn } from "@/aura/server/db-read";
import { z } from "zod";

export default defineDbReadFn({
  name: "${name}",
  input: z.object({
    // TODO: define input
  }),
  output: z.object({
    // TODO: define output
  }),
  async execute({ db, input }) {
    // TODO: implement query (raw SQL or Prisma view)
    return {};
  },
});
`);
}

// ─── Main ───

const command = process.argv[2];
const name = process.argv[3];

if (!command || !name) {
  console.error(`Usage: bun aura:make <type> <name> [options]

Types:
  operation <name> --type query|mutate|action
  middleware <name>
  cron <name> --schedule "<expr>"
  workflow <name>
  agent <name>
  http <path> --method POST|GET|PUT|DELETE
  search <Model>
  vector <Model> --dimensions <n>
  db-read <name>
`);
  process.exit(1);
}

switch (command) {
  case "operation": makeOperation(name); break;
  case "middleware": makeMiddleware(name); break;
  case "cron": makeCron(name); break;
  case "workflow": makeWorkflow(name); break;
  case "agent": makeAgent(name); break;
  case "http": makeHttp(name); break;
  case "search": makeSearch(name); break;
  case "vector": makeVector(name); break;
  case "db-read": makeDbRead(name); break;
  default:
    console.error(`Unknown type: ${command}`);
    process.exit(1);
}
