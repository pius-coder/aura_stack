/**
 * Generate `src/aura/_generated/api.ts` — typed `api` surface for every
 * registered Aura operation, with full input/output type inference.
 *
 * Resolves: Requirements 24.1, 24.2, 24.3 (Decision 14).
 *
 * The codegen imports each operation file as a `typeof` so that
 * `InferOperationInput<typeof apiRef>` and `InferOperationOutput<typeof apiRef>`
 * resolve to the exact Zod-inferred input/output of the operation. Callers
 * never need to add `as never` or inline casts at use sites.
 */

import { writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, relative, posix } from "node:path";

interface CodegenOptions {
  outputPath?: string;
  operationsRoot?: string;
}

const HEADER = `// AUTO-GENERATED — do not edit by hand.
// Re-run \`bun run aura:codegen\` (or \`bun src/aura/cli/codegen.ts\`) to refresh.
//
// Typed surface for every registered Aura operation. Use
// \`api.namespace.operation\` with \`useAuraQuery\`, \`useAuraMutation\`,
// or \`ctx.runQuery / runMutation / runAction\` for full inference of
// inputs and outputs.

import type { OperationRef, InferOperationInput, InferOperationOutput } from "@/aura/core/types";
`;

interface DiscoveredOperation {
  fullName: string; // e.g. "todos.create"
  type: "query" | "mutate" | "action";
  filePath: string;
  importPath: string; // "../../operations/todos/create.operation"
  importAlias: string; // "todos_create"
}

interface TreeNode {
  children: Map<string, TreeNode>;
  leaf?: DiscoveredOperation;
}

function newNode(): TreeNode {
  return { children: new Map() };
}

function insert(root: TreeNode, op: DiscoveredOperation): void {
  const segments = op.fullName.split(".");
  let cursor = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!cursor.children.has(segment)) cursor.children.set(segment, newNode());
    cursor = cursor.children.get(segment)!;
  }
  const last = segments[segments.length - 1];
  cursor.children.set(last, { children: new Map(), leaf: op });
}

function isValidIdentifier(key: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function quoteKey(key: string): string {
  return isValidIdentifier(key) ? key : JSON.stringify(key);
}

function emitTree(node: TreeNode, indent = "  "): string {
  const lines: string[] = [];
  for (const [key, child] of node.children) {
    if (child.leaf) {
      const op = child.leaf;
      const refType = `OperationRef<${JSON.stringify(op.type)}, InferOperationInput<typeof import("${op.importPath}")["default"]>, InferOperationOutput<typeof import("${op.importPath}")["default"]>>`;
      lines.push(
        `${indent}${quoteKey(key)}: { _name: ${JSON.stringify(op.fullName)}, _type: ${JSON.stringify(op.type)} } as ${refType},`,
      );
    } else {
      lines.push(`${indent}${quoteKey(key)}: {`);
      lines.push(emitTree(child, indent + "  "));
      lines.push(`${indent}},`);
    }
  }
  return lines.join("\n");
}

/**
 * Walk the operations directory and discover every `*.operation.ts` file.
 * Each discovered file's path determines:
 *   - the dotted operation name (e.g. `todos/create.operation.ts` → `todos.create`)
 *   - the import path used in the generated module (relative to the output)
 *   - the import alias (used internally to avoid name collisions)
 */
function discover(operationsRoot: string): DiscoveredOperation[] {
  const out: DiscoveredOperation[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith("_") || entry.startsWith(".")) continue;
      const full = resolve(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) {
        walk(full);
      } else if (s.isFile() && entry.endsWith(".operation.ts")) {
        const rel = relative(operationsRoot, full).replace(/\\/g, "/");
        // Drop the `.operation.ts` suffix to get the dotted name
        const fullName = rel.replace(/\.operation\.ts$/, "").replace(/\//g, ".");
        const type = inferOperationType(full);
        if (!type) continue;
        out.push({
          fullName,
          type,
          filePath: full,
          importPath: "", // filled below
          importAlias: fullName.replace(/[.\-]/g, "_"),
        });
      }
    }
  }
  walk(operationsRoot);
  return out;
}

/**
 * Read the operation file source to detect whether it's a `.query()`,
 * `.mutate()`, or `.action()`. We use a simple regex match over the source
 * because evaluating the file (which would import the runtime) would
 * require the Prisma client and a DB connection in the codegen path.
 */
function inferOperationType(filePath: string): "query" | "mutate" | "action" | null {
  const fs = require("node:fs") as typeof import("node:fs");
  const src = fs.readFileSync(filePath, "utf8");
  if (/\.query\s*\(/.test(src)) return "query";
  if (/\.mutate\s*\(/.test(src)) return "mutate";
  if (/\.action\s*\(/.test(src)) return "action";
  return null;
}

export function generateApiModule(options: CodegenOptions = {}): string {
  const operationsRoot = options.operationsRoot ?? resolve(process.cwd(), "src/operations");
  const outputPath = options.outputPath ?? resolve(process.cwd(), "src/aura/_generated/api.ts");
  const outputDir = dirname(outputPath);

  const operations = discover(operationsRoot);

  // Compute import paths relative to the output file (TS module specifier
  // without the `.ts` extension, with forward slashes on every platform).
  for (const op of operations) {
    const rel = relative(outputDir, op.filePath).replace(/\\/g, "/").replace(/\.ts$/, "");
    op.importPath = rel.startsWith(".") ? rel : `./${rel}`;
    // Normalise to posix slashes (already done) and ensure leading `./`
    op.importPath = posix.normalize(op.importPath);
    if (!op.importPath.startsWith(".")) op.importPath = `./${op.importPath}`;
  }

  const tree = newNode();
  for (const op of operations) insert(tree, op);

  const body = emitTree(tree);
  return `${HEADER}\nexport const api = {\n${body}\n} as const;\n`;
}

export function writeApiModule(options: CodegenOptions = {}): string {
  const out = options.outputPath ?? resolve(process.cwd(), "src/aura/_generated/api.ts");
  mkdirSync(dirname(out), { recursive: true });
  const source = generateApiModule(options);
  writeFileSync(out, source, "utf8");
  return out;
}

async function main(): Promise<void> {
  const out = writeApiModule();
  // eslint-disable-next-line no-console
  console.log(`[aura:codegen] wrote ${out}`);
}

if (import.meta.main) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[aura:codegen] failed:", err);
    process.exit(1);
  });
}
