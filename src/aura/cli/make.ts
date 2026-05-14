import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const projectRoot = process.cwd();

function pascalCase(value: string): string {
  return value
    .split(/[_.\-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function camelCase(value: string): string {
  const pascal = pascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function kebabCase(value: string): string {
  return value.replace(/[_.]/g, "-").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function writeIfMissing(filePath: string, content: string): void {
  const fullPath = join(projectRoot, filePath);
  if (existsSync(fullPath)) {
    console.log(`! Already exists: ${filePath}`);
    return;
  }
  ensureDir(fullPath);
  writeFileSync(fullPath, content, "utf8");
  console.log(`✓ Created: ${filePath}`);
}

function makeOperation(operationName: string): void {
  const match = operationName.match(/^([a-zA-Z][a-zA-Z0-9_]*)\.([a-zA-Z][a-zA-Z0-9_]*)$/);
  if (!match) {
    console.error(`Invalid operation name "${operationName}". Use domain.name format.`);
    process.exit(1);
  }

  const [, domain, name] = match;
  const domainDir = `src/features/${domain}`;
  const sharedDir = `${domainDir}/shared`;
  const serverDir = `${domainDir}/server`;

  const schemaName = `${camelCase(name)}InputSchema`;
  const typeName = `${pascalCase(name)}Input`;
  const fnName = `${camelCase(domain)}${pascalCase(name)}`;

  writeIfMissing(
    `${sharedDir}/schemas.ts`,
    `import { z } from "zod";

export const ${schemaName} = z.object({
  // TODO: define input fields
});

export type ${typeName} = z.infer<typeof ${schemaName}>;
`,
  );

  writeIfMissing(
    `${serverDir}/${name}.ts`,
    `import "server-only";

import { defineOperationFn } from "@/aura/server/operation";
import { ${schemaName} } from "@/features/${domain}/shared/schemas";

export const ${fnName} = defineOperationFn("${operationName}")
  .mutate()
  .input(${schemaName})
  .entities(["${pascalCase(domain)}"])
  .auth()
  .handler(async ({ ctx, input }) => {
    // TODO: implement handler
    return { ok: true };
  });
`,
  );

  console.log(`\nNext steps:`);
  console.log(`1. Define the schema in ${sharedDir}/schemas.ts`);
  console.log(`2. Implement the handler in ${serverDir}/${name}.ts`);
  console.log(`3. Import and export ${fnName} from ${domainDir}/index.ts`);
  console.log(`4. Import the domain module in src/aura.registry.ts`);
}

function makeQuery(operationName: string): void {
  const match = operationName.match(/^([a-zA-Z][a-zA-Z0-9_]*)\.([a-zA-Z][a-zA-Z0-9_]*)$/);
  if (!match) {
    console.error(`Invalid operation name "${operationName}". Use domain.name format.`);
    process.exit(1);
  }

  const [, domain, name] = match;
  const domainDir = `src/features/${domain}`;
  const sharedDir = `${domainDir}/shared`;
  const serverDir = `${domainDir}/server`;

  const schemaName = `${camelCase(name)}ParamsSchema`;
  const fnName = `${camelCase(domain)}${pascalCase(name)}`;

  writeIfMissing(
    `${sharedDir}/schemas.ts`,
    `import { z } from "zod";

export const ${schemaName} = z.object({
  // TODO: define params fields
});
`,
  );

  writeIfMissing(
    `${serverDir}/${name}.ts`,
    `import "server-only";

import { defineOperationFn } from "@/aura/server/operation";
import { ${schemaName} } from "@/features/${domain}/shared/schemas";

export const ${fnName} = defineOperationFn("${operationName}")
  .query()
  .params(${schemaName})
  .entities(["${pascalCase(domain)}"])
  .auth()
  .handler(async ({ ctx, params }) => {
    // TODO: implement handler
    return [];
  });
`,
  );

  console.log(`\nNext steps:`);
  console.log(`1. Define the params schema in ${sharedDir}/schemas.ts`);
  console.log(`2. Implement the handler in ${serverDir}/${name}.ts`);
  console.log(`3. Import and export ${fnName} from ${domainDir}/index.ts`);
  console.log(`4. Import the domain module in src/aura.registry.ts`);
}

function makeNotification(notificationName: string): void {
  const kebab = kebabCase(notificationName);
  const pascal = pascalCase(notificationName);
  const filePath = `src/aura/notifications/${kebab}.ts`;

  writeIfMissing(
    filePath,
    `import "server-only";

import { z } from "zod";
import { defineNotificationFn } from "@/aura/server/notifications";

export const ${pascal}Notification = defineNotificationFn("${notificationName}")
  .payload(z.object({
    // TODO: define payload fields
  }))
  .handler(async ({ ctx, payload }) => {
    // TODO: implement delivery
    ctx.log.info("Notification sent", { name: "${notificationName}", payload });
  });
`,
  );

  console.log(`\nNext steps:`);
  console.log(`1. Define the payload schema in ${filePath}`);
  console.log(`2. Import the notification into your registry or feature module`);
}

function makeCron(jobName: string): void {
  const kebab = kebabCase(jobName);
  const pascal = pascalCase(jobName);
  const filePath = `src/aura/cron/${kebab}.ts`;

  writeIfMissing(
    filePath,
    `import "server-only";

import { defineCronFn } from "@/aura/server/cron";

export const ${pascal}Job = defineCronFn("${jobName}")
  .schedule("0 0 * * *") // TODO: adjust schedule
  .handler(async (ctx) => {
    ctx.log.info("Running cron job", { name: "${jobName}" });
    // TODO: implement job logic
  });
`,
  );

  console.log(`\nNext steps:`);
  console.log(`1. Implement the job logic in ${filePath}`);
  console.log(`2. Import the job into your registry or feature module`);
  console.log(`3. Trigger manually: bun aura:cron run ${jobName}`);
}

function makeCommon(commonName: string): void {
  const kebab = kebabCase(commonName);
  const pascal = pascalCase(commonName);
  const filePath = `src/aura/common/${kebab}.ts`;

  writeIfMissing(
    filePath,
    `import "server-only";

import { defineCommonFn } from "@/aura/server/operation";

export const ${pascal} = defineCommonFn("${commonName}")
  .run(async ({ ctx, input, params, operation }) => {
    // TODO: implement common logic
    // Throw to reject, or enrich ctx
  });
`,
  );

  console.log(`\nNext steps:`);
  console.log(`1. Implement the common logic in ${filePath}`);
  console.log(`2. Use it in operations: .use(${pascal})`);
}

const command = process.argv[2];
const name = process.argv[3];

if (!command || !name) {
  console.error("Usage: bun src/aura/cli/make.ts <command> <name>");
  console.error("Commands: operation, query, notification, cron, common");
  process.exit(1);
}

switch (command) {
  case "operation":
    makeOperation(name);
    break;
  case "query":
    makeQuery(name);
    break;
  case "notification":
    makeNotification(name);
    break;
  case "cron":
    makeCron(name);
    break;
  case "common":
    makeCommon(name);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error("Commands: operation, query, notification, cron, common");
    process.exit(1);
}
